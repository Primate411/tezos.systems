#!/usr/bin/env node

// Controlled cold / HTTP-cached repeat measurements. Deliberately do not use
// Playwright routing: enabling it disables the browser's HTTP cache.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { decodeTezosCrpDataset } from '../js/core/tezoscrp-codec.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { launchChromium } = require('./lib/playwright-browser.cjs');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const options = { baselineRoot: '', runs: 3, output: '', settleMs: 2500 };
for (let i = 2; i < process.argv.length; i += 1) {
  const key = process.argv[i];
  if (key === '--baseline-root') options.baselineRoot = path.resolve(process.argv[++i]);
  else if (key === '--runs') options.runs = Number(process.argv[++i]);
  else if (key === '--output') options.output = path.resolve(process.argv[++i]);
  else if (key === '--help') {
    console.log('Usage: node scripts/measure-chamber-boot.mjs --baseline-root PATH [--runs 1..10] [--output FILE]');
    process.exit(0);
  } else throw new Error(`Unknown argument: ${key}`);
}
assert(options.baselineRoot, '--baseline-root must identify an exported pre-pilot tree');
assert(Number.isInteger(options.runs) && options.runs >= 1 && options.runs <= 10, '--runs must be 1..10');

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const median = values => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

async function serveTree(directory) {
  const root = await fs.realpath(directory);
  const requests = [];
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      let filename = path.resolve(root, `.${decodeURIComponent(url.pathname)}`);
      if ((await fs.stat(filename)).isDirectory()) filename = path.join(filename, 'index.html');
      filename = await fs.realpath(filename);
      if (!filename.startsWith(`${root}${path.sep}`) || !['GET', 'HEAD'].includes(request.method)) {
        response.writeHead(403).end();
        return;
      }
      const bytes = await fs.readFile(filename);
      const extension = path.extname(filename);
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
      const etag = `"${digest(bytes)}"`;
      const status = request.headers['if-none-match'] === etag ? 304 : 200;
      requests.push({ path: url.pathname, status });
      response.writeHead(status, {
        'Content-Type': types[extension] || 'application/octet-stream',
        'Cache-Control': ['.html', '.json', '.webmanifest'].includes(extension) ? 'no-cache' : 'public, max-age=600',
        ETag: etag
      });
      response.end(status === 304 || request.method === 'HEAD' ? undefined : bytes);
    } catch {
      requests.push({ path: request.url, status: 404 });
      response.writeHead(404).end('Not found');
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    origin: `http://127.0.0.1:${server.address().port}`, requests,
    close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); })
  };
}

async function measurePair(browser, server, profile, label, run, artifactDir) {
  const context = await browser.newContext({ viewport: profile.viewport, serviceWorkers: 'block', reducedMotion: 'reduce' });
  try {
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: false });
    await cdp.send('Network.setBlockedURLs', { urls: ['https://*', 'wss://*'] });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpuRate });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      if (location.protocol !== 'http:') return;
      localStorage.setItem('tezos-systems-theme', 'clean');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      window.__bootMeasure = { readyMs: 0, cls: 0, tasks: [] };
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__bootMeasure.cls += entry.value;
      }).observe({ type: 'layout-shift', buffered: true });
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) window.__bootMeasure.tasks.push(entry.duration);
      }).observe({ type: 'longtask', buffered: true });
      const ready = new MutationObserver(() => {
        if (!document.querySelector('#tezoscrp-modal.active #tezoscrp-hall-results .tezoscrp-ranking')) return;
        ready.disconnect();
        requestAnimationFrame(() => requestAnimationFrame(() => { window.__bootMeasure.readyMs = performance.now(); }));
      });
      ready.observe(document, { childList: true, subtree: true });
    });
    const rows = [];
    for (const warmth of ['cold', 'warm']) {
      const requestStart = server.requests.length;
      await page.goto(`${server.origin}/tezoscrp/?theme=clean`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__bootMeasure?.readyMs > 0);
      // Fixed observation window catches delayed imports; not a readiness wait.
      await page.waitForTimeout(options.settleMs);
      const metrics = await page.evaluate(() => {
        const resources = performance.getEntriesByType('resource').filter(r => new URL(r.name).origin === location.origin);
        const scripts = resources.filter(r => /\.(?:js|mjs)$/.test(new URL(r.name).pathname));
        const styles = resources.filter(r => new URL(r.name).pathname.endsWith('.css'));
        const bytes = (list, key) => list.reduce((n, r) => n + r[key], 0);
        return {
          readyMs: window.__bootMeasure.readyMs,
          jsResources: scripts.length, jsDecodedBytes: bytes(scripts, 'decodedBodySize'), jsTransferBytes: bytes(scripts, 'transferSize'),
          readingModules: scripts.filter(r => new URL(r.name).pathname === '/js/ui/chamber-reading.js').length,
          codecModules: scripts.filter(r => new URL(r.name).pathname === '/js/core/tezoscrp-codec.mjs').length,
          cssDecodedBytes: bytes(styles, 'decodedBodySize'),
          cachedScripts: scripts.filter(r => r.transferSize === 0 && r.decodedBodySize > 0).length,
          domNodes: document.getElementsByTagName('*').length,
          totalBlockingTimeMs: window.__bootMeasure.tasks.reduce((n, duration) => n + Math.max(0, duration - 50), 0),
          longestTaskMs: Math.max(0, ...window.__bootMeasure.tasks),
          layoutShift: window.__bootMeasure.cls,
          overflow: document.documentElement.scrollWidth > innerWidth,
          dashboardStarted: Boolean(document.querySelector('#hero-slot') || document.documentElement.dataset.dashboardReady),
          visibility: document.visibilityState,
          resources: resources.map(r => ({ path: new URL(r.name).pathname, decodedBytes: r.decodedBodySize, transferBytes: r.transferSize }))
        };
      });
      const requests = server.requests.slice(requestStart);
      assert.equal(metrics.visibility, 'visible');
      assert.equal(metrics.overflow, false, `${label} ${profile.name}: horizontal overflow`);
      assert.equal(errors.length, 0, `Unexpected browser errors: ${errors.join('; ')}`);
      assert(!requests.some(r => r.status >= 400), `Local request failed: ${JSON.stringify(requests.filter(r => r.status >= 400))}`);
      if (warmth === 'warm') {
        assert(metrics.cachedScripts > 0, `${label}: repeat visit did not use HTTP-cached scripts`);
        assert.equal(requests.filter(r => /\.(?:js|mjs)$/.test(r.path)).length, 0, `${label}: warm scripts reached the HTTP server`);
      }
      if (label === 'pilot') {
        // Count both intentional post-pilot helpers explicitly, while keeping
        // the original budget for the rest of the startup graph unchanged.
        assert(metrics.readingModules === 1 && metrics.codecModules === 1
          && !metrics.dashboardStarted && metrics.jsResources - metrics.readingModules - metrics.codecModules < 20
          && metrics.domNodes < 1500, 'Pilot startup boundary regressed');
        assert(!requests.some(r => r.path === '/data/tezoscrp-awards.json'), 'Pilot must not fetch the expanded compatibility archive');
      }
      rows.push({ label, profile: profile.name, cpuRate: profile.cpuRate, run, warmth, ...metrics, requests });
      if (artifactDir && run === 1 && warmth === 'cold') {
        await page.screenshot({ path: path.join(artifactDir, `${label}-${profile.name}.png`) });
      }
      // An ordinary new navigation, not reload (which may force revalidation),
      // with the same context/cache. about:blank avoids measuring a BFCache hit.
      await page.goto('about:blank');
    }
    return rows;
  } finally { await context.close(); }
}

async function main() {
  const baselineHtml = await fs.readFile(path.join(options.baselineRoot, 'tezoscrp/index.html'), 'utf8');
  assert(!baselineHtml.includes('data-chamber-boot='), 'Baseline already uses the pilot');
  const sourceHashes = {};
  for (const file of ['data/tezoscrp-awards.json', 'data/tezoscrp-summary.json']) {
    const before = digest(await fs.readFile(path.join(options.baselineRoot, file)));
    const after = digest(await fs.readFile(path.join(ROOT, file)));
    assert.equal(after, before, `Archive changed between trees: ${file}`);
    sourceHashes[file] = after;
  }
  const compact = await fs.readFile(path.join(ROOT, 'data/tezoscrp-awards.compact.json'));
  assert.deepEqual(decodeTezosCrpDataset(JSON.parse(compact)),
    JSON.parse(await fs.readFile(path.join(options.baselineRoot, 'data/tezoscrp-awards.json'))),
    'Compact browser archive must retain the exact baseline content');
  sourceHashes['data/tezoscrp-awards.compact.json'] = digest(compact);
  const servers = [];
  let browser;
  try {
    servers.push(await serveTree(options.baselineRoot));
    servers.push(await serveTree(ROOT));
    browser = await launchChromium(chromium, { logger: () => {} });
    const artifactDir = options.output ? path.dirname(options.output) : '';
    if (artifactDir) await fs.mkdir(artifactDir, { recursive: true });
    const rows = [];
    const profiles = [
      { name: 'desktop', viewport: { width: 1440, height: 900 }, cpuRate: 1 },
      { name: 'mobile-6x', viewport: { width: 390, height: 844 }, cpuRate: 6 }
    ];
    for (const profile of profiles) {
      for (let run = 1; run <= options.runs; run += 1) {
        // Alternate order to reduce host warm-up and thermal-order bias.
        for (const index of run % 2 ? [0, 1] : [1, 0]) {
          const label = index ? 'pilot' : 'baseline';
          console.error(`Measuring ${label} ${profile.name} pair ${run}/${options.runs}`);
          rows.push(...await measurePair(browser, servers[index], profile, label, run, artifactDir));
        }
      }
    }
    const summary = [];
    for (const profile of profiles) for (const label of ['baseline', 'pilot']) for (const warmth of ['cold', 'warm']) {
      const group = rows.filter(r => r.profile === profile.name && r.label === label && r.warmth === warmth);
      summary.push({ profile: profile.name, label, warmth, ...Object.fromEntries(
        ['readyMs', 'jsResources', 'jsDecodedBytes', 'jsTransferBytes', 'cachedScripts', 'cssDecodedBytes', 'domNodes', 'totalBlockingTimeMs', 'longestTaskMs'].map(key => [key, Math.round(median(group.map(r => r[key])) * 10) / 10])
      ) });
    }
    const report = {
      schemaVersion: 1, measuredAt: new Date().toISOString(), browser: browser.version(), baselineRoot: options.baselineRoot,
      candidateRoot: ROOT, sourceHashes, runsPerGroup: options.runs, profiles, settleMs: options.settleMs,
      limitations: 'Local uncompressed HTTP with explicit max-age=600 for assets and ETag/no-cache for HTML/JSON. No Playwright routing. External HTTPS and service workers blocked. Clean theme, reduced motion. CPU throttling is a lab proxy, not a measured physical phone or production-network benchmark.',
      summary, rows
    };
    if (options.output) await fs.writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser?.close();
    await Promise.all(servers.map(server => server.close()));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
