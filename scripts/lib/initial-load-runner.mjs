import path from 'node:path';
import fs from 'node:fs/promises';
import { FIXTURE_TIME, FIXTURE_WALLET, INITIAL_LOAD_EXPECTATIONS, createInitialLoadFixtureResponder } from '../../tests/fixtures/initial-load-network.mjs';
import { FIXTURE_PATH } from './initial-load-server.mjs';
import { getInitialLoadExpectations, assessInitialLoadResources, validateInitialLoadReadiness, normalizeInitialLoadRequestStarts } from './initial-load-policy.mjs';
import { validateInitialLoadWorkload } from './initial-load-report.mjs';

async function withDeadline(promise, milliseconds, message) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}

function instrumentPage({ profile, fixturePath, wallet, epoch }) {
  // Playwright's clock also replaces Performance APIs. Pin Date alone so
  // resource timings, timeOrigin, long tasks and cache receipts stay native.
  const NativeDate = Date;
  function FixtureDate(...args) {
    if (new.target) return args.length ? new NativeDate(...args) : new NativeDate(epoch);
    return new NativeDate(epoch).toString();
  }
  Object.setPrototypeOf(FixtureDate, NativeDate);
  FixtureDate.prototype = NativeDate.prototype;
  FixtureDate.now = () => epoch;
  window.Date = FixtureDate;
  localStorage.setItem('tezos-systems-theme', profile.theme);
  localStorage.setItem('tezos-toured', '1');
  localStorage.setItem('tezos-welcomed', '1');
  localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
  if (profile.savedWallet) localStorage.setItem('tezos-systems-my-baker-address', wallet);
  window.__loadQa = { cls: 0, longTasks: [], launcherIntersections: [], fixtureCalls: [], fixtureErrors: [] };
  if (profile.network === 'populated') {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const request = new Request(input, init);
      if (new URL(request.url).origin === location.origin) return nativeFetch(input, init);
      const receipt = { url: request.url, method: request.method, startTime: performance.now() };
      window.__loadQa.fixtureCalls.push(receipt);
      const body = ['GET', 'HEAD'].includes(request.method) ? '' : await request.text();
      const response = await nativeFetch(fixturePath, { method: 'POST', signal: request.signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: request.url, method: request.method,
          postData: body, savedWallet: profile.savedWallet }) });
      receipt.status = response.status;
      // Fetch resolves at headers; retain body completion so a stalled stream
      // cannot masquerade as a fully populated fixture response.
      response.clone().arrayBuffer().then(() => { receipt.completed = true; }, error => {
        receipt.failure = error.message;
      });
      receipt.classification = response.headers.get('x-initial-load-fixture');
      if (!['matched', 'unavailable'].includes(receipt.classification)) {
        window.__loadQa.fixtureErrors.push(`${request.method} ${request.url} (${response.status}, ${receipt.classification || 'missing fixture classification'})`);
      }
      return response;
    };
  }
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
  new PerformanceObserver(list => {
    for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__loadQa.cls += entry.value;
  }).observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver(list => {
    for (const entry of list.getEntries()) window.__loadQa.longTasks.push({ startTime: entry.startTime, duration: entry.duration });
  }).observe({ type: 'longtask', buffered: true });
  performance.setResourceTimingBufferSize(5000);
}

async function collectPageMetrics({ drainFixtures = false } = {}) {
  // Drain only work already in flight around the observation boundary. Capture
  // the final receipt synchronously once it is quiet; a hung body still fails.
  const deadline = performance.now() + 2000;
  while (drainFixtures && window.__loadQa.fixtureCalls.some(receipt => !receipt.completed && !receipt.failure)
    && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
  const navigation = performance.getEntriesByType('navigation')[0];
  const resources = performance.getEntriesByType('resource').filter(entry => new URL(entry.name).origin === location.origin
    && new URL(entry.name).pathname !== '/__initial_load_fixture').map(entry => ({
    path: new URL(entry.name).pathname + new URL(entry.name).search, startTime: entry.startTime,
    initiatorType: entry.initiatorType, transferSize: entry.transferSize, encodedBodySize: entry.encodedBodySize, decodedBodySize: entry.decodedBodySize
  }));
  const sum = (rows, field) => rows.reduce((total, row) => total + row[field], 0);
  const extension = pattern => resources.filter(entry => pattern.test(entry.path.split('?')[0]));
  const scripts = extension(/\.(?:js|mjs)$/), json = extension(/\.json$/);
  const tasks = window.__loadQa.longTasks;
  const categories = [...document.querySelectorAll('#chambers-grid > .chamber-category')];
  const ids = node => [...node.querySelectorAll('.stat-card')].map(card => card.dataset.chamberEntryId || '');
  const main = document.querySelector('main');
  const mainStyle = main && getComputedStyle(main);
  return {
    timeOrigin: performance.timeOrigin, visibilityState: document.visibilityState,
    serviceWorkerControlled: Boolean(navigator.serviceWorker?.controller),
    readiness: { mainVisible: Boolean(main && mainStyle.display !== 'none' && mainStyle.visibility === 'visible'
      && Number(mainStyle.opacity) > 0 && main.getBoundingClientRect().width > 0 && main.getBoundingClientRect().height > 0),
      dashboardReady: document.documentElement.dataset.dashboardReady === 'true',
      launcherIds: ids(document.querySelector('#chambers-grid') || document.createElement('div')),
      categoryIds: categories.map(node => node.dataset.chamberCategory),
      orderedLauncherIds: categories.flatMap(ids),
      categoryLaunchers: categories.map(node => ({ id: node.dataset.chamberCategory, launcherIds: ids(node) })) },
    populated: { bakers: document.getElementById('hero-chain-uptime-bakers')?.textContent,
      price: document.querySelector('#price-bar .price-value')?.textContent || document.querySelector('.price-value')?.textContent,
      head: Number(document.querySelector('[data-live-head-level]')?.dataset.liveHeadLevel) || null,
      wallet: window._myTezosData?.fullAddress || null, walletBalance: window._myTezosData?.totalXTZ ?? null },
    domContentLoadedMs: navigation?.domContentLoadedEventEnd || 0, domInteractiveMs: navigation?.domInteractive || 0,
    loadMs: navigation?.loadEventEnd || 0, sameOriginRequests: resources.length + 1,
    sameOriginTransferBytes: sum(resources, 'transferSize') + (navigation?.transferSize || 0),
    sameOriginEncodedBytes: sum(resources, 'encodedBodySize') + (navigation?.encodedBodySize || 0),
    sameOriginDecodedBytes: sum(resources, 'decodedBodySize') + (navigation?.decodedBodySize || 0),
    eagerJsDecodedBytes: sum(scripts, 'decodedBodySize'), styleDecodedBytes: sum(extension(/\.css$/), 'decodedBodySize'),
    jsonDecodedBytes: sum(json, 'decodedBodySize'), jsonTransferBytes: sum(json, 'transferSize'),
    imageDecodedBytes: sum(extension(/\.(?:png|jpe?g|webp|gif|svg|ico)$/), 'decodedBodySize'),
    domNodes: document.getElementsByTagName('*').length, layoutShift: window.__loadQa.cls,
    longTaskCount: tasks.length, longTaskDurationMs: sum(tasks, 'duration'),
    totalBlockingTimeMs: tasks.reduce((total, task) => total + Math.max(0, task.duration - 50), 0),
    longestTaskMs: Math.max(0, ...tasks.map(task => task.duration)),
    networkTransferCount: resources.filter(entry => entry.transferSize > 0).length + (navigation?.transferSize > 0 ? 1 : 0),
    zeroTransferCount: resources.filter(entry => entry.transferSize === 0 && entry.decodedBodySize > 0).length,
    cachedScriptCount: scripts.filter(entry => entry.transferSize === 0 && entry.decodedBodySize > 0).length,
    resources, ...window.__loadQa
  };
}

export async function measureInitialLoadRun(browser, server, options, profile, runNumber) {
  const context = await browser.newContext({ viewport: profile.viewport, serviceWorkers: profile.cache === 'installed-worker' ? 'allow' : 'block',
    reducedMotion: 'reduce', hasTouch: profile.device === 'mobile' });
  const baseUrl = options.baseUrl || server.origin;
  const baseOrigin = new URL(baseUrl).origin;
  const createReceipt = run => ({ run, errors: [], pageErrors: [], sameOriginFailures: [], externalRequests: [], requestStarts: [] });
  const result = createReceipt(runNumber);
  const blockedResponder = createInitialLoadFixtureResponder({ savedWallet: profile.savedWallet });
  let stage = result;
  let page, cdp, collecting = false;
  const swResponses = new Set();
  const requestRecords = new Map();
  let serverStart = 0, fixtureStart = 0;
  const startedAt = Date.now();
  try {
    page = await context.newPage();
    await page.addInitScript(instrumentPage, { profile, fixturePath: FIXTURE_PATH, wallet: FIXTURE_WALLET, epoch: Date.parse(FIXTURE_TIME) });
    if (options.initScript) await page.addInitScript(options.initScript);
    cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: false });
    cdp.on('Network.requestWillBeSent', event => {
      if (!collecting) return;
      const url = new URL(event.request.url);
      if (url.origin !== baseOrigin) { stage.externalRequests.push({ url: event.request.url, type: event.type, method: event.request.method, postData: event.request.postData || '' }); return; }
      if (url.pathname === FIXTURE_PATH) return;
      const receipt = { path: `${url.pathname}${url.search}`, wallTime: event.wallTime * 1000, type: event.type,
        requestId: event.requestId, completed: false };
      stage.requestStarts.push(receipt); requestRecords.set(event.requestId, receipt);
    });
    cdp.on('Network.loadingFinished', event => { const item = requestRecords.get(event.requestId); if (item) item.completed = true; });
    cdp.on('Network.loadingFailed', event => {
      const item = requestRecords.get(event.requestId);
      if (item) { item.failed = true; item.failure = event.errorText; item.canceled = event.canceled || false; }
    });
    page.on('pageerror', error => { if (collecting) stage.pageErrors.push(error.message); });
    page.on('response', response => {
      if (!collecting) return;
      const url = new URL(response.url());
      if (url.origin !== baseOrigin || url.pathname === FIXTURE_PATH) return;
      if (response.status() >= 400) stage.sameOriginFailures.push(`${response.status()} ${url.pathname}${url.search}`);
      if (response.fromServiceWorker()) swResponses.add(`${url.pathname}${url.search}`);
    });
    const navigate = async () => {
      await page.goto(`${baseUrl}/#theme=${profile.theme}`, { waitUntil: 'load', timeout: options.timeoutMs });
      await page.waitForFunction(() => document.documentElement.dataset.dashboardReady === 'true', null, { timeout: options.timeoutMs });
      if (profile.network === 'populated') {
        await page.waitForFunction(({ expected, savedWallet }) => {
          const bakers = Number(document.getElementById('hero-chain-uptime-bakers')?.textContent.replace(/[^\d.]/g, ''));
          const price = Number(document.querySelector('.price-value')?.textContent.replace(/[^\d.]/g, ''));
          const head = Number(document.querySelector('[data-live-head-level]')?.dataset.liveHeadLevel);
          return bakers === expected.bakerCount && price === expected.priceUsd && head === expected.headLevel
            && (!savedWallet || (window._myTezosData?.fullAddress === expected.walletAddress
              && window._myTezosData?.totalXTZ === expected.walletBalanceXtz && !window._myTezosData?.loading));
        }, { expected: INITIAL_LOAD_EXPECTATIONS, savedWallet: profile.savedWallet }, { timeout: options.timeoutMs });
      }
      // Named fixed observation window: catches deferred work after readiness.
      // Timing and stability are diagnostics; CI gates deterministic budgets.
      await page.waitForTimeout(options.settleMs);
    };
    const captureAndValidate = async (target, cacheChecks = true) => {
      const result = target;
      const metrics = await withDeadline(page.evaluate(collectPageMetrics, { drainFixtures: true }), 5000, 'Native measurement extraction timed out');
      collecting = false;
      Object.assign(result, metrics);
      result.requestStarts = normalizeInitialLoadRequestStarts(result.requestStarts, metrics.resources, metrics.timeOrigin);
      result.sameOriginRequests = result.requestStarts.length;
      result.serviceWorkerResponseCount = swResponses.size;
      result.externalRequestAttempts = result.externalRequests.length + metrics.fixtureCalls.length;
      result.serverRequests = server?.requests.slice(serverStart) || [];
      result.fixtureRequests = server?.fixtureRequests.slice(fixtureStart) || [];
      result.serverResponseBytes = result.serverRequests.reduce((total, request) => total + (request.bytes || 0), 0);
      result.fixtureResponseBytes = result.fixtureRequests.reduce((total, request) => total + request.bytes, 0);
      Object.assign(result, assessInitialLoadResources(result.requestStarts, result.launcherIntersections));
      result.errors.push(...validateInitialLoadReadiness(result.readiness));
      result.errors.push(...validateInitialLoadWorkload(result));
      if (!(metrics.timeOrigin > 0 && metrics.sameOriginDecodedBytes > 0 && metrics.eagerJsDecodedBytes > 0
        && metrics.styleDecodedBytes > 0 && metrics.loadMs > 0 && metrics.resources.length > 0)) {
        result.errors.push('Missing native resource/navigation telemetry; an empty measurement cannot pass');
      }
      if (result.visibilityState !== 'visible') result.errors.push(`Page was ${result.visibilityState}, not visible`);
      if (cacheChecks && profile.cache === 'installed-worker' && (!result.serviceWorkerControlled || !result.serviceWorkerResponseCount)) result.errors.push('installed-worker profile lacks actual controlled responses');
      if (cacheChecks && profile.cache !== 'installed-worker' && result.serviceWorkerControlled) result.errors.push('Unexpected service-worker control');
      if (cacheChecks && profile.cache === 'warm') {
        if (!result.cachedScriptCount) result.errors.push('warm profile did not reuse HTTP-cached scripts');
        if (server && result.serverRequests.some(request => /\.(?:js|mjs)(?:\?|$)/.test(request.path))) result.errors.push('warm profile requested scripts from the HTTP server');
      }
      const pendingFixtures = result.fixtureCalls.filter(receipt => !receipt.completed);
      if (pendingFixtures.length) result.errors.push(`Unfinished fixture requests: ${pendingFixtures.map(receipt => receipt.url).join('; ')}`);
      if (result.fixtureErrors.length) result.errors.push(`Unexpected fixture requests: ${result.fixtureErrors.join('; ')}`);
      const unexpectedExternal = result.externalRequests.filter(request => {
        const url = new URL(request.url);
        if (!['http:', 'https:'].includes(url.protocol)) return request.type === 'Script';
        // Legacy mode deliberately observes known API attempts failing at the
        // deny proxy. Use the same fixture catalog, never allow arbitrary code.
        if (profile.network === 'blocked' && ['Fetch', 'XHR', 'Other'].includes(request.type)) {
          const known = blockedResponder({ ...request, method: request.method === 'OPTIONS' ? 'GET' : request.method });
          if (known.headers['x-initial-load-fixture'] !== 'unexpected') return false;
        }
        // Named exclusions: fallback-font benchmark and disabled analytics.
        if (request.type === 'Stylesheet' && url.hostname === 'fonts.googleapis.com' && url.pathname === '/css2') return false;
        if (request.type === 'Font' && url.hostname === 'fonts.gstatic.com') return false;
        if (request.type === 'Script' && url.hostname === 'gc.zgo.at' && url.pathname === '/count.js') return false;
        return true;
      });
      if (unexpectedExternal.length) result.errors.push(`Unexpected eager external resources: ${unexpectedExternal.map(request => `${request.type} ${request.url}`).join(', ')}`);
      if (result.duplicateModuleRequests.length) result.errors.push(`duplicate module URLs: ${JSON.stringify(result.duplicateModuleRequests)}`);
      if (result.deferredChamberResources.length) result.errors.push(`lazy Chamber resources before intent: ${result.deferredChamberResources.map(resource => resource.path).join(', ')}`);
      if (result.forbiddenHeavyResources.length) result.errors.push(`deferred heavy launcher data: ${result.forbiddenHeavyResources.map(resource => resource.path).join(', ')}`);
      const pendingAssets = result.requestStarts.filter(request => !request.completed);
      if (pendingAssets.length) result.errors.push(`Unfinished or failed same-origin requests: ${pendingAssets.map(request => request.path).join(', ')}`);
      result.errors.push(...result.pageErrors.map(error => `page error: ${error}`), ...result.sameOriginFailures.map(error => `local response: ${error}`));
    };
    const beginCollection = target => {
      stage = target;
      requestRecords.clear(); swResponses.clear();
      serverStart = server?.requests.length || 0;
      fixtureStart = server?.fixtureRequests.length || 0;
      collecting = true;
    };
    if (profile.cache !== 'cold') {
      result.seed = createReceipt('seed');
      beginCollection(result.seed);
      await navigate();
      if (profile.cache === 'installed-worker') {
        await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: options.timeoutMs });
        const registration = await page.evaluate(async () => {
          const registration = await navigator.serviceWorker.ready;
          return { active: registration.active?.state, scope: registration.scope };
        });
        if (registration.active !== 'activated') throw new Error('service worker seed did not activate');
      }
      await captureAndValidate(result.seed, false);
      if (result.seed.errors.length) throw new Error(`cache seed failed: ${result.seed.errors.join('; ')}`);
      // Normal new navigation in the same context/cache, never reload/BFCache.
      await page.goto('about:blank');
    }
    beginCollection(result);
    await navigate();
    await captureAndValidate(result);
  } catch (error) {
    collecting = false;
    result.errors.push(stage === result ? error.message : `seed: ${error.message}`);
    if (page) {
      const diagnostic = await withDeadline(page.evaluate(collectPageMetrics), 2000, 'Failure diagnostic extraction timed out').catch(() => null);
      if (diagnostic) Object.assign(result, diagnostic);
      result.fixtureRequests = server?.fixtureRequests.slice(fixtureStart) || [];
      result.serverRequests = server?.requests.slice(serverStart) || [];
    }
  } finally {
    collecting = false;
    result.wallClockMs = Date.now() - startedAt;
    result.expected = getInitialLoadExpectations();
    if (page && options.artifactDir && (runNumber === 1 || result.errors.length)) {
      await fs.mkdir(options.artifactDir, { recursive: true });
      const prefix = `${profile.id}-${String(runNumber).replace(/[^a-zA-Z0-9-]/g, '_')}`;
      await page.screenshot({ path: path.join(options.artifactDir, `${prefix}.png`), timeout: 2000 }).catch(() => {});
    }
    await withDeadline(context.close(), 5000, 'Browser context cleanup timed out').catch(error => result.errors.push(error.message));
  }
  return result;
}
