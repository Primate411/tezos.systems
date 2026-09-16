import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { runInitialLoadMeasurement, ROOT } from '../scripts/measure-initial-load.mjs';
import { parseInitialLoadArgs } from '../scripts/lib/initial-load-config.mjs';
import { BUDGET_METRICS } from '../scripts/lib/initial-load-report.mjs';
import { INITIAL_LOAD_EXPECTATIONS } from './fixtures/initial-load-network.mjs';

const exec = promisify(execFile);
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tezos-initial-load-check-'));
const artifacts = path.join(ROOT, 'test-artifacts/initial-load/harness', path.basename(temporary));
const historical = path.join(ROOT, 'tests/fixtures/initial-load-baseline.json');
const baselineHash = createHash('sha256').update(await fs.readFile(historical)).digest('hex');
const previousBaseUrl = process.env.BASE_URL;
delete process.env.BASE_URL;
let checks = 0;

// Trigger faults only once the real application has constructed its dashboard.
// An attribute observer avoids guessing when asynchronous modules will settle.
function afterDashboardReady(action) {
  return `(() => {
    const act = ${action.toString()};
    const install = () => {
      let fired = false;
      const run = () => {
        if (fired || document.documentElement.dataset.dashboardReady !== 'true') return;
        fired = true;
        observer.disconnect();
        act();
      };
      const observer = new MutationObserver(run);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-dashboard-ready'] });
      run();
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
    else install();
  })();`;
}

async function measure(name, { args = [], initScript, transform, failure } = {}) {
  const output = path.join(temporary, name, 'report.json');
  // Real startup and cache seeds share the production TzKT request throttle.
  // Give that bounded queue room to drain; elapsed time is never a byte budget.
  const options = parseInitialLoadArgs([
    '--profile', 'desktop-anonymous-cold', '--runs', '1', '--warmup-runs', '0',
    '--settle-ms', '500', '--timeout-ms', '20000', '--output', output, ...args
  ]);
  const report = await runInitialLoadMeasurement(options, { initScript, transform, logger: () => {} });
  const saved = JSON.parse(await fs.readFile(output, 'utf8'));
  assert.deepEqual(saved, report, `${name}: the full report persists on success and failure`);
  assert(report.completedAt && report.profiles.length, `${name}: completion and profile receipts exist`);
  await assert.rejects(fetch(report.baseUrl, { signal: AbortSignal.timeout(1000) }), error =>
    error.cause?.code === 'ECONNREFUSED', `${name}: the owned HTTP server must be closed`);
  if (failure) {
    assert.equal(report.passed, false, `${name}: injected regression must fail`);
    assert.equal(report.exitCode, 1, `${name}: injected regression is a failing process result`);
    assert.match(report.errors.join('\n'), failure, `${name}: failure must name its actual cause`);
  } else {
    assert.equal(report.passed, true, `${name}: ${report.errors.join('\n')}`);
    assert.equal(report.exitCode, 0, `${name}: successful measurement exits zero`);
    for (const group of report.profiles) {
      assert.equal(group.runs.length, 1, `${name}: requested run is preserved`);
      const run = group.runs[0];
      assert(run.sameOriginDecodedBytes > 0 && run.eagerJsDecodedBytes > 0 && run.styleDecodedBytes > 0,
        `${name}: real resource bytes must be present`);
      assert(run.domContentLoadedMs > 0 && run.domInteractiveMs > 0 && run.loadMs > 0,
        `${name}: native navigation telemetry must remain measurable`);
      assert(run.resources.length > group.largestResources.length,
        `${name}: retain the complete resource ledger, not only the largest-resource summary`);
      assert(run.requestStarts.length >= run.resources.length, `${name}: starts include completed resource receipts`);
      assert.equal(run.readiness.mainVisible, true);
      assert.equal(run.readiness.dashboardReady, true);
    }
  }
  checks++;
  console.log(`ok - initial-load browser ${name}`);
  return report;
}

try {
  await measure('legacy-blocked', { args: ['--network', 'blocked', '--theme', 'clean'] });
  const populated = await measure('populated-profiles', {
    args: ['--profile', 'desktop-anonymous-cold,mobile-anonymous-cold,mobile-saved-wallet-cold']
  });
  assert.equal(populated.profiles.length, 3);
  for (const group of populated.profiles) {
    const run = group.runs[0];
    assert(run.fixtureRequests.length > 0 && run.fixtureResponseBytes > 0, 'populated measurements must use fixture data');
    assert.equal(run.fixtureErrors.length, 0, 'populated source requests must all be mapped');
    if (group.profile.savedWallet) assert.equal(run.populated.wallet, INITIAL_LOAD_EXPECTATIONS.walletAddress);
  }

  const warm = await measure('warm-cache', { args: ['--profile', 'desktop-anonymous-warm'] });
  assert(warm.profiles[0].runs[0].cachedScriptCount > 0, 'warm navigation reuses real browser HTTP cache');
  assert(!warm.profiles[0].runs[0].serverRequests.some(request => /\.(?:js|mjs)(?:\?|$)/.test(request.path)),
    'warm scripts do not return to the owned HTTP server');

  const worker = await measure('installed-worker', { args: ['--profile', 'desktop-anonymous-installed-worker'] });
  assert.equal(worker.profiles[0].runs[0].serviceWorkerControlled, true);
  assert(worker.profiles[0].runs[0].serviceWorkerResponseCount > 0, 'worker profile records actual controlled responses');

  const replacedLauncher = await measure('same-count-wrong-launcher', {
    initScript: `(() => {
      const NativeObserver = MutationObserver;
      window.__initialLoadTestObservers = [];
      window.MutationObserver = class extends NativeObserver {
        constructor(callback) { super(callback); window.__initialLoadTestObservers.push(this); }
        observe(...args) { if (!window.__initialLoadTestPauseObservers) return super.observe(...args); }
      };
    })();\n` + afterDashboardReady(() => {
      // Pause application reconciliation only in this deliberately corrupt
      // fixture, so it cannot repair or repeatedly react to the bad identity.
      window.__initialLoadTestPauseObservers = true;
      for (const observer of window.__initialLoadTestObservers) observer.disconnect();
      const card = document.querySelector('#chambers-grid .stat-card[data-chamber-entry-id="history"]');
      card.id = 'unexpected-test-room-card';
      card.dataset.chamberEntryId = 'unexpected-test-room';
    }),
    failure: /launcherIds.*(?:missing|unexpected)/i
  });
  const wrongLauncherRun = replacedLauncher.profiles[0].runs[0];
  assert.equal(wrongLauncherRun.readiness.launcherIds.length, wrongLauncherRun.expected.launcherCount,
    'the readiness probe must reject an equal-count identity substitution');

  await measure('hidden-main', {
    initScript: afterDashboardReady(() => document.querySelector('main').style.setProperty('visibility', 'hidden', 'important')),
    failure: /main is not visible/i
  });

  await measure('failed-local-request', {
    initScript: afterDashboardReady(() => { fetch('/__initial_load_missing__.json').catch(() => {}); }),
    failure: /local response: 404 .*__initial_load_missing__/
  });

  await measure('eager-external-script', {
    initScript: afterDashboardReady(() => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
      document.head.append(script);
    }),
    failure: /Unexpected eager external (?:code|resources).*html2canvas/i
  });

  await measure('eager-external-image', {
    initScript: afterDashboardReady(() => {
      const image = document.createElement('img');
      image.src = 'https://assets.objkt.media/initial-load-unbudgeted-image.png';
      document.body.append(image);
    }),
    failure: /Unexpected eager external resources.*initial-load-unbudgeted-image/i
  });

  await measure('unmapped-source-request', {
    initScript: afterDashboardReady(() => { fetch('https://api.tzkt.io/v1/__initial_load_unmapped__').catch(() => {}); }),
    failure: /Unexpected fixture requests:.*__initial_load_unmapped__/i
  });

  await measure('unfinished-source-request', {
    initScript: afterDashboardReady(() => {
      fetch('https://api.tzkt.io/v1/__initial_load_pending__', {
        method: 'POST', duplex: 'half',
        // A real streaming request whose body never completes must remain an
        // observed unfinished attempt, rather than disappearing from the gate.
        body: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{')); } })
      }).catch(() => {});
    }),
    failure: /Unfinished fixture requests:.*__initial_load_pending__/i
  });

  await measure('missing-native-telemetry', {
    initScript: () => Object.defineProperty(performance, 'getEntriesByType', { value: () => [] }),
    failure: /Missing native resource\/navigation telemetry|empty measurement cannot pass/i
  });

  await measure('duplicate-module-url', {
    initScript: afterDashboardReady(() => { import('/js/core/asset-version.js?initial-load-duplicate=1').catch(() => {}); }),
    failure: /duplicate module URLs.*asset-version/i
  });

  const failedFunding = await measure('failed-full-funding-request', {
    transform: (pathname, bytes) => {
      if (pathname === '/data/community-funding-teztree.json') throw Object.assign(new Error('Adversarial missing full receipt'), { code: 'ENOENT' });
      return bytes;
    },
    initScript: afterDashboardReady(() => { fetch('/data/community-funding-teztree.json').catch(() => {}); }),
    failure: /deferred heavy launcher data:.*community-funding-teztree\.json/i
  });
  const fundingRun = failedFunding.profiles[0].runs[0];
  assert(fundingRun.sameOriginFailures.some(error => /404 .*community-funding-teztree/.test(error)),
    'a failed full-artifact response must still be detected from its request start');

  await measure('seed-only-full-funding-request', {
    args: ['--profile', 'desktop-anonymous-warm'],
    initScript: afterDashboardReady(() => {
      if (sessionStorage.getItem('initial-load-seed-fault')) return;
      sessionStorage.setItem('initial-load-seed-fault', '1');
      fetch('/data/community-funding-teztree.json').catch(() => {});
    }),
    failure: /deferred heavy launcher data:.*community-funding-teztree\.json/i
  });

  await measure('unfinished-unclassified-json-request', {
    transform: (pathname, bytes) => pathname === '/data/tweets.json' ? new Promise(() => {}) : bytes,
    initScript: afterDashboardReady(() => { fetch('/data/tweets.json').catch(() => {}); }),
    failure: /(?:Unfinished|pending).*tweets\.json/i
  });

  await measure('missing-worker-registration', {
    args: ['--profile', 'desktop-anonymous-installed-worker', '--timeout-ms', '5000'],
    initScript: () => { navigator.serviceWorker.register = () => new Promise(() => {}); },
    failure: /Timeout 5000ms exceeded|5000ms.*exceeded/i
  });

  // Exercise the real command boundary: a budget regression must leave its
  // report on disk and exit nonzero, not merely log a failed comparison.
  const budgetFile = path.join(temporary, 'strict-budgets.json');
  const cliOutput = path.join(temporary, 'cli-budget-failure', 'report.json');
  await fs.writeFile(budgetFile, JSON.stringify({
    schemaVersion: 1,
    profileContract: Object.fromEntries(['network', 'theme', 'settleMs', 'fixtureRevision'].map(key => [key, populated[key]])),
    profiles: {
      'desktop-anonymous-cold': {
        ...Object.fromEntries(BUDGET_METRICS.map(metric => [metric, Number.MAX_SAFE_INTEGER])),
        sameOriginDecodedBytes: 1
      }
    }
  }));
  let processError;
  try {
    await exec(process.execPath, ['scripts/measure-initial-load.mjs', '--profile', 'desktop-anonymous-cold',
      '--runs', '1', '--warmup-runs', '0', '--settle-ms', '500', '--timeout-ms', '20000',
      '--budgets', budgetFile, '--output', cliOutput], { cwd: ROOT, timeout: 60_000 });
  } catch (error) { processError = error; }
  assert.equal(processError?.code, 1, 'the budget regression exits with code 1');
  const cliReport = JSON.parse(await fs.readFile(cliOutput, 'utf8'));
  assert.equal(cliReport.passed, false);
  assert(cliReport.budgetErrors.some(error => /sameOriginDecodedBytes .* exceeds reviewed limit 1/.test(error)),
    `CLI fails for the injected ceiling, not an unrelated schema or browser error: ${cliReport.errors.join('; ')}`);
  assert(cliReport.profiles[0].runs[0].resources.length > 30, 'failed budget report retains complete resource evidence');
  checks++;
  console.log('ok - initial-load browser CLI budget exit and persisted failure report');
} finally {
  if (previousBaseUrl === undefined) delete process.env.BASE_URL;
  else process.env.BASE_URL = previousBaseUrl;
  await fs.mkdir(path.dirname(artifacts), { recursive: true });
  await fs.cp(temporary, artifacts, { recursive: true });
  await fs.rm(temporary, { recursive: true, force: true });
  assert.equal(createHash('sha256').update(await fs.readFile(historical)).digest('hex'), baselineHash,
    'browser harness checks must leave the historical baseline unchanged');
  console.log(`Initial-load harness evidence: ${artifacts}`);
}
console.log(`ok - ${checks} initial-load browser cases preserve real telemetry, cache receipts, and failure diagnostics`);
