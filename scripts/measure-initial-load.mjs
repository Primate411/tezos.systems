#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { classifyLauncherResources, duplicateModuleRequests } from './lib/initial-load-policy.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { launchChromium } = require('./lib/playwright-browser.cjs');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const options = {
    baseUrl: process.env.BASE_URL || 'http://localhost:9000',
    runs: 5,
    warmupRuns: 1,
    settleMs: 2500,
    output: '',
    label: 'measurement',
    mode: 'no-worker',
    requireStable: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--base-url') options.baseUrl = argv[++index];
    else if (arg === '--runs') options.runs = Number(argv[++index]);
    else if (arg === '--warmup-runs') options.warmupRuns = Number(argv[++index]);
    else if (arg === '--settle-ms') options.settleMs = Number(argv[++index]);
    else if (arg === '--output') options.output = argv[++index];
    else if (arg === '--label') options.label = argv[++index];
    else if (arg === '--mode') options.mode = argv[++index];
    else if (arg === '--require-stable') options.requireStable = true;
    else if (arg === '--help') {
      console.log('Usage: node scripts/measure-initial-load.mjs [--base-url URL] [--runs N] [--warmup-runs N] [--settle-ms N] [--mode no-worker|installed-worker] [--label NAME] [--output FILE] [--require-stable]');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isInteger(options.runs) || options.runs < 1 || options.runs > 20) {
    throw new Error('--runs must be an integer from 1 to 20');
  }
  if (!Number.isInteger(options.warmupRuns) || options.warmupRuns < 0 || options.warmupRuns > 3) {
    throw new Error('--warmup-runs must be an integer from 0 to 3');
  }
  if (!Number.isFinite(options.settleMs) || options.settleMs < 0 || options.settleMs > 15000) {
    throw new Error('--settle-ms must be between 0 and 15000');
  }
  if (!['no-worker', 'installed-worker'].includes(options.mode)) {
    throw new Error('--mode must be no-worker or installed-worker');
  }
  if (options.requireStable && options.runs < 2) {
    throw new Error('--require-stable needs at least two runs');
  }
  options.baseUrl = options.baseUrl.replace(/\/+$/, '');
  return options;
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function round(value, digits = 1) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function maxAdjacentDeltaPct(values) {
  let maximum = 0;
  for (let index = 1; index < values.length; index += 1) {
    const previous = values[index - 1];
    const current = values[index];
    const denominator = Math.max(Math.abs(previous), 1);
    maximum = Math.max(maximum, Math.abs(current - previous) / denominator * 100);
  }
  return round(maximum, 2);
}

function summarize(runs) {
  const numericFields = [
    'domContentLoadedMs',
    'domInteractiveMs',
    'loadMs',
    'sameOriginRequests',
    'sameOriginTransferBytes',
    'sameOriginEncodedBytes',
    'sameOriginDecodedBytes',
    'jsonTransferBytes',
    'jsonDecodedBytes',
    'eagerJsDecodedBytes',
    'styleDecodedBytes',
    'imageDecodedBytes',
    'domNodes',
    'layoutShift',
    'longTaskCount',
    'longTaskDurationMs',
    'totalBlockingTimeMs',
    'longestTaskMs',
    'networkTransferCount',
    'zeroTransferCount',
    'serviceWorkerResponseCount',
    'externalRequestAttempts'
  ];
  const medians = Object.fromEntries(numericFields.map((field) => [
    field,
    round(median(runs.map((run) => run[field])), field === 'layoutShift' ? 4 : 1)
  ]));

  const resourceRuns = new Map();
  for (const run of runs) {
    for (const resource of run.largestResources) {
      if (!resourceRuns.has(resource.path)) resourceRuns.set(resource.path, []);
      resourceRuns.get(resource.path).push(resource.decodedBodySize);
    }
  }

  const largestResources = Array.from(resourceRuns, ([resourcePath, sizes]) => ({
    path: resourcePath,
    medianDecodedBytes: round(median(sizes), 0),
    observedRuns: sizes.length
  }))
    .sort((a, b) => b.medianDecodedBytes - a.medianDecodedBytes)
    .slice(0, 20);

  const decodedBytesMaxAdjacentDeltaPct = maxAdjacentDeltaPct(runs.map((run) => run.sameOriginDecodedBytes));
  const longTaskMaxAdjacentDeltaPct = maxAdjacentDeltaPct(runs.map((run) => run.longTaskDurationMs));
  const totalBlockingTimeMaxAdjacentDeltaPct = maxAdjacentDeltaPct(runs.map((run) => run.totalBlockingTimeMs));
  return {
    medians,
    stability: {
      decodedBytesMaxAdjacentDeltaPct,
      decodedBytesWithinFivePct: decodedBytesMaxAdjacentDeltaPct < 5,
      longTaskMaxAdjacentDeltaPct,
      rawLongTasksWithinFifteenPct: longTaskMaxAdjacentDeltaPct < 15,
      totalBlockingTimeMaxAdjacentDeltaPct,
      totalBlockingTimeWithinFifteenPct: totalBlockingTimeMaxAdjacentDeltaPct < 15
    },
    largestResources
  };
}

async function measureRun(browser, options, runNumber) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    serviceWorkers: options.mode === 'installed-worker' ? 'allow' : 'block',
    reducedMotion: 'reduce'
  });

  const baseOrigin = new URL(options.baseUrl).origin;
  await context.route('**/*', (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.origin !== baseOrigin) return route.abort();
    return route.continue();
  });

  if (options.mode === 'installed-worker') {
    const seedPage = await context.newPage();
    await seedPage.goto(`${options.baseUrl}/?load-measurement-seed=${runNumber}#theme=clean`, {
      waitUntil: 'load',
      timeout: 30000
    });
    await seedPage.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      if (registration.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    });
    await seedPage.waitForTimeout(500);
    await seedPage.close();
  }

  const page = await context.newPage();
  const serviceWorkerResponses = new Set();
  const pageErrors = [];
  const sameOriginFailures = [];
  const externalRequests = [];
  page.on('request', (request) => {
    const requestUrl = new URL(request.url());
    if (requestUrl.origin !== baseOrigin) externalRequests.push(`${request.method()} ${requestUrl.origin}${requestUrl.pathname}`);
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('response', (response) => {
    const responseUrl = new URL(response.url());
    if (responseUrl.origin === baseOrigin && response.status() >= 400) {
      sameOriginFailures.push(`${response.status()} ${responseUrl.pathname}${responseUrl.search}`);
    }
    if (responseUrl.origin === baseOrigin && response.fromServiceWorker()) {
      serviceWorkerResponses.add(`${responseUrl.pathname}${responseUrl.search}`);
    }
  });

  await page.addInitScript(() => {
    window.__loadQa = { cls: 0, longTasks: [], launcherIntersections: [] };
    // Observe the same callback that triggers hydration, before its requests.
    const NativeObserver = window.IntersectionObserver;
    window.IntersectionObserver = class extends NativeObserver {
      constructor(callback, options) {
        super((entries, observer) => {
          for (const entry of entries) {
            const id = entry.target.dataset.chamberEntryId;
            if (entry.isIntersecting && id) window.__loadQa.launcherIntersections.push({ id, at: performance.now() });
          }
          callback(entries, observer);
        }, options);
      }
    };
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) window.__loadQa.cls += entry.value;
        }
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {}
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.__loadQa.longTasks.push({ startTime: entry.startTime, duration: entry.duration });
        }
      }).observe({ type: 'longtask', buffered: true });
    } catch {}
  });

  const startedAt = Date.now();
  await page.goto(`${options.baseUrl}/?load-measurement=${runNumber}#theme=clean`, {
    waitUntil: 'load',
    timeout: 30000
  });
  await page.waitForFunction(() => {
    const main = document.querySelector('main');
    const chamberCards = document.querySelectorAll('#chambers-grid .stat-card').length;
    const chamberCategories = document.querySelectorAll('#chambers-grid > .chamber-category').length;
    const orderedCards = (document.querySelector('#chambers-grid')?.dataset.chambersOrder || '').split(',').filter(Boolean).length;
    return Boolean(main && getComputedStyle(main).display !== 'none')
      && chamberCards === 21
      && chamberCategories === 7
      && orderedCards === 21;
  }, null, { timeout: 30000 });
  await page.waitForTimeout(options.settleMs);

  const result = await page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0];
    const origin = location.origin;
    const resources = performance.getEntriesByType('resource')
      .filter((entry) => entry.name.startsWith(origin))
      .map((entry) => {
        const resourceUrl = new URL(entry.name);
        return {
          path: `${resourceUrl.pathname}${resourceUrl.search}`,
          startTime: entry.startTime,
          initiatorType: entry.initiatorType || '',
          transferSize: entry.transferSize || 0,
          encodedBodySize: entry.encodedBodySize || 0,
          decodedBodySize: entry.decodedBodySize || 0
        };
      });
    const sum = (items, field) => items.reduce((total, entry) => total + entry[field], 0);
    const extensionMatches = (extensions) => resources.filter((entry) => extensions.some((extension) => entry.path.split('?')[0].endsWith(extension)));
    const longTasks = window.__loadQa?.longTasks || [];
    const resourcePath = (entry) => entry.path.split('?')[0];
    const deferredLauncherProjectionPaths = new Set([
      '/data/capital-entry-summary.json',
      '/data/ecosystem-entry-summary.json',
      '/data/maxis/entry-summary.json',
      '/data/baker-governance-signals.json',
      '/data/minerals-entry-summary.json',
      '/data/metals-entry-summary.json',
      '/data/uranium-entry-summary.json'
    ]);
    const deferredChamberModulePaths = new Set([
      '/js/features/capital-chamber.js',
      '/js/features/chamber.js',
      '/js/features/ctez.js',
      '/js/features/ecosystem-chamber.js',
      '/js/features/etherlink-governance.js',
      '/js/features/ledger-flow.js',
      '/js/features/liquidity-baking.js',
      '/js/features/leaderboard.js',
      '/js/features/maxis.js',
      '/js/features/metals-chamber.js',
      '/js/features/minerals-chamber.js',
      '/js/features/network-pulse.js',
      '/js/features/staking-chamber.js',
      '/js/features/tezos-domains.js',
      '/js/features/tezoscrp.js',
      '/js/features/tezlink.js',
      '/js/features/tz4-adoption.js',
      '/js/features/uranium-chamber.js',
      '/js/features/whale-chamber.js'
    ]);
    const deferredChamberStylePaths = new Set([
      '/css/capital.min.css',
      '/css/ecosystem.min.css',
      '/css/ledger-flow.min.css',
      '/css/leaderboard.min.css',
      '/css/maxis.min.css',
      '/css/metals-chamber.min.css',
      '/css/minerals-chamber.min.css',
      '/css/network-pulse.min.css',
      '/css/staking-chamber.min.css',
      '/css/tezos-domains.min.css',
      '/css/tezoscrp.min.css',
      '/css/uranium-chamber.min.css',
      '/css/whale-chamber.min.css'
    ]);
    const forbiddenInitialPaths = new Set([
      '/data/capital-snapshot.json',
      '/data/ecosystem-stats.json',
      '/data/maxis-leaders.json',
      '/data/maxis-careers.json',
      '/data/maxis-l2-governance.json',
      '/data/maxis/manifest.json'
    ]);

    return {
      visibilityState: document.visibilityState,
      launcherIntersections: window.__loadQa.launcherIntersections,
      serviceWorkerControlled: Boolean(navigator.serviceWorker?.controller),
      readiness: {
        mainVisible: Boolean(document.querySelector('main') && getComputedStyle(document.querySelector('main')).display !== 'none'),
        chamberCardCount: document.querySelectorAll('#chambers-grid .stat-card').length,
        chamberCategoryCount: document.querySelectorAll('#chambers-grid > .chamber-category').length,
        orderedChamberCount: (document.querySelector('#chambers-grid')?.dataset.chambersOrder || '').split(',').filter(Boolean).length,
        chamberSkeletonCount: document.querySelectorAll('#chambers-grid [data-chamber-skeleton]').length
      },
      domInteractiveMs: navigation?.domInteractive || 0,
      domContentLoadedMs: navigation?.domContentLoadedEventEnd || 0,
      loadMs: navigation?.loadEventEnd || 0,
      sameOriginRequests: resources.length + 1,
      sameOriginTransferBytes: sum(resources, 'transferSize') + (navigation?.transferSize || 0),
      sameOriginEncodedBytes: sum(resources, 'encodedBodySize') + (navigation?.encodedBodySize || 0),
      sameOriginDecodedBytes: sum(resources, 'decodedBodySize') + (navigation?.decodedBodySize || 0),
      jsonTransferBytes: sum(extensionMatches(['.json']), 'transferSize'),
      jsonDecodedBytes: sum(extensionMatches(['.json']), 'decodedBodySize'),
      eagerJsDecodedBytes: sum(extensionMatches(['.js', '.mjs']), 'decodedBodySize'),
      styleDecodedBytes: sum(extensionMatches(['.css']), 'decodedBodySize'),
      imageDecodedBytes: sum(extensionMatches(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ico']), 'decodedBodySize'),
      domNodes: document.getElementsByTagName('*').length,
      layoutShift: window.__loadQa?.cls || 0,
      longTaskCount: longTasks.length,
      longTaskDurationMs: longTasks.reduce((total, entry) => total + entry.duration, 0),
      totalBlockingTimeMs: longTasks.reduce((total, entry) => total + Math.max(entry.duration - 50, 0), 0),
      longestTaskMs: longTasks.reduce((longest, entry) => Math.max(longest, entry.duration), 0),
      networkTransferCount: resources.filter((entry) => entry.transferSize > 0).length + (navigation?.transferSize > 0 ? 1 : 0),
      zeroTransferCount: resources.filter((entry) => entry.transferSize === 0 && entry.decodedBodySize > 0).length,
      deferredChamberResources: resources.filter((entry) => (
        deferredLauncherProjectionPaths.has(resourcePath(entry))
        || deferredChamberModulePaths.has(resourcePath(entry))
        || deferredChamberStylePaths.has(resourcePath(entry))
      )),
      moduleResources: extensionMatches(['.js', '.mjs']),
      forbiddenHeavyResources: resources.filter((entry) => (
        forbiddenInitialPaths.has(resourcePath(entry))
        || /^\/data\/maxis\/seasons\/[^/]+\/summary\.json$/.test(resourcePath(entry))
      )),
      largestResources: resources
        .sort((a, b) => b.decodedBodySize - a.decodedBodySize)
        .slice(0, 30)
    };
  });

  const launcherResources = classifyLauncherResources(result.deferredChamberResources, result.launcherIntersections);
  result.visibleLauncherResources = launcherResources.hydrated;
  result.deferredChamberResources = launcherResources.premature;
  result.duplicateModuleRequests = duplicateModuleRequests(result.moduleResources);
  delete result.moduleResources;

  if (result.duplicateModuleRequests.length) {
    throw new Error(`measurement observed duplicate module URLs: ${JSON.stringify(result.duplicateModuleRequests)}`);
  }

  if (result.visibilityState !== 'visible') {
    throw new Error(`measurement page visibilityState was ${result.visibilityState}, not visible`);
  }
  if (options.mode === 'installed-worker' && !result.serviceWorkerControlled) {
    throw new Error('installed-worker measurement was not controlled by the installed service worker');
  }
  if (!result.readiness.mainVisible
    || result.readiness.chamberCardCount !== 21
    || result.readiness.chamberCategoryCount !== 7
    || result.readiness.orderedChamberCount !== 21
    || result.readiness.chamberSkeletonCount < 15) {
    throw new Error(`measurement page did not reach launcher readiness: ${JSON.stringify(result.readiness)}`);
  }
  if (result.deferredChamberResources.length) {
    throw new Error(`measurement observed lazy Chamber resources before intent: ${result.deferredChamberResources.map((resource) => resource.path).join(', ')}`);
  }
  if (result.forbiddenHeavyResources.length) {
    throw new Error(`measurement observed deferred heavy launcher data: ${result.forbiddenHeavyResources.map((resource) => resource.path).join(', ')}`);
  }
  if (pageErrors.length || sameOriginFailures.length) {
    throw new Error(`measurement page had local runtime failures: ${[...pageErrors, ...sameOriginFailures].join('; ')}`);
  }

  await context.close();
  return {
    run: runNumber,
    wallClockMs: Date.now() - startedAt,
    serviceWorkerResponseCount: serviceWorkerResponses.size,
    externalRequestAttempts: externalRequests.length,
    externalRequests: Array.from(new Set(externalRequests)).sort(),
    pageErrors,
    sameOriginFailures,
    ...result
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const browser = await launchChromium(chromium, { headless: true, logger: () => {} });
  const warmups = [];
  const runs = [];

  try {
    for (let warmupNumber = 1; warmupNumber <= options.warmupRuns; warmupNumber += 1) {
      warmups.push(await measureRun(browser, options, `warmup-${warmupNumber}`));
    }
    for (let runNumber = 1; runNumber <= options.runs; runNumber += 1) {
      runs.push(await measureRun(browser, options, runNumber));
    }
  } finally {
    await browser.close();
  }

  const report = {
    schemaVersion: 1,
    label: options.label,
    measuredAt: new Date().toISOString(),
    baseUrl: options.baseUrl,
    profile: {
      viewport: { width: 1440, height: 900 },
      mode: options.mode,
      serviceWorkers: options.mode === 'installed-worker' ? 'installed before measured navigation' : 'blocked',
      externalRequests: 'blocked',
      reducedMotion: true,
      runs: options.runs,
      warmupRuns: options.warmupRuns,
      settleMs: options.settleMs
    },
    ...summarize(runs),
    warmupDiagnostics: warmups.map((warmup) => ({
      run: warmup.run,
      domContentLoadedMs: round(warmup.domContentLoadedMs),
      loadMs: round(warmup.loadMs),
      longTaskCount: warmup.longTaskCount,
      longTaskDurationMs: round(warmup.longTaskDurationMs),
      totalBlockingTimeMs: round(warmup.totalBlockingTimeMs),
      longestTaskMs: round(warmup.longestTaskMs)
    })),
    runs
  };
  const serialized = `${JSON.stringify(report, null, 2)}\n`;

  if (options.output) {
    const outputPath = path.resolve(ROOT, options.output);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, serialized);
  }

  console.log(serialized.trimEnd());
  if (options.requireStable
    && (!report.stability.decodedBytesWithinFivePct || !report.stability.totalBlockingTimeWithinFifteenPct)) {
    throw new Error(`stability acceptance failed: decoded bytes ${report.stability.decodedBytesMaxAdjacentDeltaPct}% (limit <5%), total blocking time ${report.stability.totalBlockingTimeMaxAdjacentDeltaPct}% (limit <15%); raw long-task total diagnostic ${report.stability.longTaskMaxAdjacentDeltaPct}%`);
  }
}

main().catch((error) => {
  console.error(`Initial-load measurement failed: ${error.message}`);
  process.exitCode = 1;
});
