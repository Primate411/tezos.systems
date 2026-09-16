#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseInitialLoadArgs, resolveInitialLoadOutput } from './lib/initial-load-config.mjs';
import { summarizeInitialLoadRuns, checkInitialLoadBudgets } from './lib/initial-load-report.mjs';
import { createInitialLoadServer, createInitialLoadDenyProxy } from './lib/initial-load-server.mjs';
import { measureInitialLoadRun } from './lib/initial-load-runner.mjs';
import { createSmokeLifecycle } from '../tests/lib/smoke-lifecycle.mjs';
import { FIXTURE_TIME } from '../tests/fixtures/initial-load-network.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { launchChromium } = require('./lib/playwright-browser.cjs');
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function runInitialLoadMeasurement(options, { root = ROOT, transform, initScript, logger = console.error } = {}) {
  const lifecycle = createSmokeLifecycle({ logger });
  const fixtureRevision = createHash('sha256').update(await fs.readFile(new URL('../tests/fixtures/initial-load-network.mjs', import.meta.url))).digest('hex');
  const report = { schemaVersion: 2, label: options.label, measuredAt: new Date().toISOString(),
    sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
    sourceDirty: Boolean(execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).trim()),
    network: options.network, theme: options.theme, settleMs: options.settleMs, fixtureRevision,
    fixtureTime: FIXTURE_TIME, runsPerProfile: options.runs, warmupRuns: options.warmupRuns,
    selectedProfileIds: options.profiles.map(profile => profile.id), profiles: [], errors: [],
    limitations: 'Local uncompressed HTTP, max-age=600 for static assets and ETag/no-cache for HTML/JSON. API fixtures are synthetic and use a POST fetch adapter; upstream latency is excluded. External fonts/analytics are blocked by a deny-only proxy, including worker egress. No Playwright routing. Reduced motion and dismissed onboarding. Phone is a viewport, not physical hardware. Timing is diagnostic; budgets cover every run.' };
  const output = options.output ? resolveInitialLoadOutput(options.output) : '';
  const artifactDir = output ? path.dirname(output) : '';
  const writeReport = async () => {
    if (!output) return;
    await fs.mkdir(path.dirname(output), { recursive: true });
    const temporary = `${output}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`);
    await fs.rename(temporary, output);
  };
  let server, proxy, browser;
  try {
    // Read the reviewed budget before launching browser work; validate every result below.
    const budgets = options.budgets ? JSON.parse(await fs.readFile(path.resolve(ROOT, options.budgets), 'utf8')) : null;
    proxy = await createInitialLoadDenyProxy(); lifecycle.track(() => proxy.close());
    if (!options.baseUrl) { server = await createInitialLoadServer({ root, transform }); lifecycle.track(() => server.close()); }
    report.baseUrl = options.baseUrl || server.origin;
    browser = await launchChromium(chromium, { headless: true, logger: () => {}, launchOptions: {
      // The lifecycle owns cancellation and must persist its final report
      // before exit; Playwright's default SIGINT handler exits the process.
      handleSIGINT: false, handleSIGTERM: false,
      proxy: { server: proxy.origin, bypass: '127.0.0.1,localhost,[::1]' }
    } });
    lifecycle.track(() => browser.close());
    report.browser = browser.version();
    await writeReport();
    for (const profile of options.profiles) {
      lifecycle.signal.throwIfAborted();
      logger(`Measuring ${profile.id}: ${options.warmupRuns} warmup + ${options.runs} runs (${profile.network})`);
      const group = { profile, warmupDiagnostics: [], runs: [], errors: [] };
      report.profiles.push(group);
      for (let index = 1; index <= options.warmupRuns; index++) {
        const run = await measureInitialLoadRun(browser, server, { ...options, artifactDir, initScript }, profile, `warmup-${index}`);
        group.warmupDiagnostics.push(run);
        if (run.errors.length) { group.errors.push(`warmup-${index}: ${run.errors.join('; ')}`); break; }
      }
      if (!group.errors.length) for (let index = 1; index <= options.runs; index++) {
        lifecycle.signal.throwIfAborted();
        const run = await measureInitialLoadRun(browser, server, { ...options, artifactDir, initScript }, profile, index);
        group.runs.push(run);
        if (run.errors.length) group.errors.push(`run ${index}: ${run.errors.join('; ')}`);
        await writeReport();
      }
      Object.assign(group, summarizeInitialLoadRuns(group.runs));
      if (options.requireStable && (!group.stability.decodedBytesWithinFivePct || !group.stability.totalBlockingTimeWithinFifteenPct)) {
        group.errors.push(`stability acceptance failed: decoded bytes ${group.stability.decodedBytesMaxAdjacentDeltaPct}% (limit <5%), total blocking time ${group.stability.totalBlockingTimeMaxAdjacentDeltaPct}% (limit <15%)`);
      }
      report.errors.push(...group.errors.map(error => `${profile.id}: ${error}`));
      await writeReport();
    }
    if (budgets) {
      report.budgetFile = options.budgets;
      report.budgetErrors = checkInitialLoadBudgets(report, budgets);
      report.errors.push(...report.budgetErrors);
    }
  } catch (error) {
    report.errors.push(error.message);
    report.exitCode = lifecycle.signal.aborted ? lifecycle.signal.reason.exitCode : 1;
  } finally {
    await lifecycle.close();
    // A final run can absorb browser-close errors into its diagnostic receipt
    // without reaching catch. Cancellation still owns the process outcome.
    if (lifecycle.signal.aborted) {
      report.exitCode = lifecycle.signal.reason.exitCode;
      if (!report.errors.includes(lifecycle.signal.reason.message)) report.errors.push(lifecycle.signal.reason.message);
    }
    report.passed = report.errors.length === 0;
    report.exitCode ||= report.passed ? 0 : 1;
    report.completedAt = new Date().toISOString();
    report.blockedProxyRequests = proxy?.requests || [];
    try { await writeReport(); }
    finally { lifecycle.dispose(); }
  }
  return report;
}

async function main() {
  const options = parseInitialLoadArgs(process.argv.slice(2));
  if (options.help) {
    console.log('Usage: node scripts/measure-initial-load.mjs [--matrix | --profile ID[,ID]] [--runs 1..20] [--warmup-runs 0..3] [--settle-ms 0..15000] [--timeout-ms N] [--network blocked|populated] [--theme clean|aurora] [--mode no-worker|installed-worker] [--base-url LOOPBACK_ORIGIN] [--budgets FILE] [--output FILE] [--label NAME] [--require-stable]');
    return;
  }
  const report = await runInitialLoadMeasurement(options);
  console.log(JSON.stringify(options.output ? { passed: report.passed, profiles: report.profiles.length, output: options.output, errors: report.errors } : report, null, 2));
  process.exitCode = report.exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(`Initial-load measurement failed: ${error.message}`); process.exitCode = 1; });
}
