import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { classifyLauncherResources, duplicateModuleRequests } from '../scripts/lib/initial-load-policy.mjs';

const ROOT = new URL('../', import.meta.url);
const drain = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const response = value => ({ ok: true, status: 200, json: async () => value, text: async () => String(value) });

// Execute the actual browser module with isolated imports and controlled I/O.
async function loadModule(file, exposure, globals = {}) {
  let source = await fs.readFile(new URL(file, ROOT), 'utf8');
  source = source.replace(/^import\s+[^;]+;\s*$/gm, '')
    .replace(/^export\s+\{[^;]+\};\s*$/gm, '')
    .replace(/\bexport\s+(?=(?:async\s+)?function\b|(?:const|let|class)\b)/g, '')
    .replace(/import\.meta\.url/g, JSON.stringify(new URL(file, ROOT).href));
  const context = vm.createContext({ console: { warn() {} }, URL, URLSearchParams, DOMException, AbortController,
    setTimeout, clearTimeout, API_URLS: { tzkt: 'https://tzkt.test', octez: 'https://rpc.test' },
    CACHE_TTLS: { memory: 60_000 }, ...globals });
  new vm.Script(`${source}\nglobalThis.result = { ${exposure} };`, { filename: file }).runInContext(context);
  return context.result;
}

for (const name of ['fetchSharedStats', 'fetchSharedConstants', 'fetchSharedYearlyRate']) {
  let now = 1_000_000;
  const requests = [];
  const api = await loadModule('js/core/api.js', name, {
    Date: class extends Date { static now() { return now; } },
    fetch: () => { const next = deferred(); requests.push(next); return next.promise; }
  });
  const first = api[name]();
  now += 6001;
  const second = api[name]();
  assert.equal(requests.length, 1, `${name}: slow requests remain shared after five seconds`);
  requests[0].resolve(response(42));
  assert.deepEqual(await Promise.all([first, second]), name === 'fetchSharedYearlyRate' ? ['42', '42'] : [42, 42]);
  assert.equal(await api[name](), name === 'fetchSharedYearlyRate' ? '42' : 42);
  assert.equal(requests.length, 1, `${name}: successful data still uses the existing cache`);
  now += 60_001;
  const next = api[name]();
  assert.equal(requests.length, 2, `${name}: a settled request does not prevent later refresh`);
  requests[1].resolve(response(43));
  await next;
}

for (const newestFirst of [false, true]) {
  const requests = [];
  const api = await loadModule('js/core/api.js', 'fetchCurrentVotingPeriod', {
    fetch: () => { const next = deferred(); requests.push(next); return next.promise; }
  });
  const older = api.fetchCurrentVotingPeriod({ force: true });
  const newer = api.fetchCurrentVotingPeriod({ force: true });
  if (newestFirst) { requests[1].resolve(response('new')); await newer; }
  requests[0].resolve(response('old'));
  assert.equal(await older, 'old', 'an older caller still receives its own response');
  const third = api.fetchCurrentVotingPeriod();
  assert.equal(requests.length, 2, 'older completion does not evict the newer in-flight request');
  if (!newestFirst) requests[1].resolve(response('new'));
  assert.equal(await newer, 'new');
  assert.equal(await third, 'new', 'older completion does not replace the current cached period');
}

{
  let now = 1_000_000;
  const requests = [], stored = new Map();
  const api = await loadModule('js/features/price.js', 'fetchXTZPrice', {
    Date: class extends Date { static now() { return now; } },
    sessionStorage: { getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key) },
    fetch: () => { const next = deferred(); requests.push(next); return next.promise; }
  });
  const first = api.fetchXTZPrice();
  now += 6001;
  const second = api.fetchXTZPrice();
  assert.equal(requests.length, 2, 'slow CoinGecko calls share both endpoints');
  requests[0].resolve(response({ tezos: { usd: 1 } })); requests[1].resolve(response([]));
  assert.equal((await first).usd, 1); assert.equal((await second).usd, 1);
  now += 60_000;
  await api.fetchXTZPrice();
  assert.equal(requests.length, 2, 'price retains the existing thirty-minute cache');
}

{
  const requests = [];
  const assets = await loadModule('js/core/data-assets.js', 'loadDataAsset', {
    fetch: () => { const next = deferred(); requests.push(next); return next.promise; }
  });
  const old = assets.loadDataAsset('searchCatalog');
  const failed = assert.rejects(old, /offline/);
  const current = assets.loadDataAsset('searchCatalog', { force: true });
  requests[0].reject(new Error('offline')); await failed;
  assert.equal(assets.loadDataAsset('searchCatalog'), current, 'a superseded failure retains the new asset request');
  assert.equal(requests.length, 2);
  requests[1].resolve(response({ rows: [] })); await current;
}

{
  const timers = new Map(); let sequence = 0, recovered = false;
  const api = await loadModule('js/features/price.js', 'fetchXTZPrice', {
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    setTimeout: (callback, delay) => { assert.equal(delay, 15_000); timers.set(++sequence, callback); return sequence; },
    clearTimeout: id => timers.delete(id),
    fetch: (url, { signal }) => recovered ? Promise.resolve(response(url.includes('/coins/markets') ? [] : { tezos: { usd: 2 } }))
      : new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('Timed out', 'AbortError')), { once: true }))
  });
  const stalled = api.fetchXTZPrice();
  for (const expire of timers.values()) expire();
  assert.equal(await stalled, null, 'a stalled price request settles instead of pinning the shared promise');
  assert.equal(timers.size, 0, 'price endpoint timers are released');
  recovered = true;
  assert.equal((await api.fetchXTZPrice()).usd, 2, 'price can recover after its deadline');
  assert.equal(timers.size, 0);
}

{
  let attempts = 0;
  const api = await loadModule('js/core/search-catalog.js', 'loadSearchCatalog, isSearchCatalogLoaded, isSearchCatalogLoading', {
    loadDataAsset: async () => { if (++attempts === 1) throw new Error('offline'); return { rows: [{ id: 'recovered' }] }; },
    siteMapSearchIndex: value => value
  });
  assert.equal((await api.loadSearchCatalog()).length, 0);
  assert.equal(api.isSearchCatalogLoaded(), false, 'a failed search catalog is still retryable');
  assert.equal(api.isSearchCatalogLoading(), false, 'a failed search catalog is no longer loading');
  assert.equal((await api.loadSearchCatalog())[0].id, 'recovered');
  assert.equal(api.isSearchCatalogLoaded(), true); assert.equal(attempts, 2);
}

{
  let attempts = 0;
  const api = await loadModule('js/core/my-tezos-contract-registry.mjs', 'loadMyTezosContractRegistry', {
    fetch: async () => { if (++attempts === 1) throw new Error('offline'); return response({ schema: 'recovered' }); }
  });
  assert.equal((await api.loadMyTezosContractRegistry()).schema, '');
  assert.equal((await api.loadMyTezosContractRegistry()).schema, 'recovered');
  assert.equal(attempts, 2);
}

{
  const delays = [];
  const { MyTezosRequestBroker, retryDelay } = await loadModule('js/core/my-tezos-request-broker.mjs', 'MyTezosRequestBroker, retryDelay', {
    Math: Object.assign(Object.create(Math), { random: () => 0.5 }),
    setTimeout: (callback, ms) => { delays.push(ms); queueMicrotask(callback); }
  });
  for (const value of [null, '', ' ', 'invalid']) {
    assert.equal(retryDelay({ headers: { get: () => value } }, 1), 1000, 'missing or invalid Retry-After uses backoff');
  }
  assert.equal(retryDelay({ headers: { get: () => '0' } }, 0), 0, 'explicit Retry-After zero is honored');
  assert.equal(retryDelay({ headers: { get: () => '2.5' } }, 0), 2500);
  const future = new Date(Date.now() + 60_000).toUTCString();
  assert(retryDelay({ headers: { get: () => future } }, 0) > 58_000, 'HTTP-date Retry-After is honored');
  let calls = 0;
  const pending = deferred();
  const broker = new MyTezosRequestBroker({ fetchImpl: () => { calls++; return pending.promise; } });
  const cancelled = new AbortController(); cancelled.abort();
  await assert.rejects(broker.request('/skip', { signal: cancelled.signal }), { name: 'AbortError' });
  assert.equal(calls, 0, 'an already-aborted caller does not enqueue work');
  const caller = new AbortController();
  const first = broker.request('/shared', { signal: caller.signal });
  const cancelledFirst = assert.rejects(first, { name: 'AbortError' });
  const second = broker.request('/shared');
  caller.abort(); await cancelledFirst;
  assert.equal(calls, 1, 'caller cancellation does not duplicate shared work');
  pending.resolve(response(42)); assert.equal(await second, 42, 'another caller survives cancellation');
  for (const reject of [false, true]) {
    const controller = new AbortController(); let listeners = 0;
    const add = controller.signal.addEventListener.bind(controller.signal), remove = controller.signal.removeEventListener.bind(controller.signal);
    controller.signal.addEventListener = (...args) => { listeners++; return add(...args); };
    controller.signal.removeEventListener = (...args) => { listeners--; return remove(...args); };
    const own = new MyTezosRequestBroker({ fetchImpl: async () => { if (reject) throw new Error('offline'); return response(1); } });
    const request = own.request('/cleanup', { signal: controller.signal, retries: 0 });
    if (reject) await assert.rejects(request, /offline/); else await request;
    assert.equal(listeners, 0, 'settled requests remove the caller abort listener');
  }
  let retries = 0;
  const retrying = new MyTezosRequestBroker({ fetchImpl: async () => ++retries === 1
    ? { ok: false, status: 503, headers: { get: () => null } } : response(9) });
  assert.equal(await retrying.request('/retry', { retries: 1 }), 9);
  assert.deepEqual(delays, [500], 'a missing header no longer creates an immediate retry');
}

{
  let tick, visibility, now = 1_000_000, calls = 0;
  const document = { hidden: false, addEventListener: (_, fn) => { visibility = fn; } };
  const api = await loadModule('widgets/runtime.js', 'startWidgetRefresh', {
    DEFAULT_THEME: 'clean', THEME_COLORS: {}, THEMES: [],
    Date: class extends Date { static now() { return now; } }, document,
    window: { setInterval: fn => { tick = fn; return 1; } }
  });
  const pending = deferred();
  api.startWidgetRefresh(() => { calls++; return pending.promise; }, 10_000);
  await drain(); now += 20_000; tick(); visibility(); await drain();
  assert.equal(calls, 1, 'slow widget refreshes cannot overlap');
  pending.resolve(); await drain(); tick(); await drain();
  assert.equal(calls, 2, 'settled widgets can refresh again');
  document.hidden = true; await drain(); now += 20_000; tick(); visibility(); await drain();
  assert.equal(calls, 2, 'hidden widgets do not refresh');
  document.hidden = false; visibility(); await drain();
  assert.equal(calls, 3, 'visible widgets perform one catch-up');
  api.startWidgetRefresh(() => { throw new Error('synchronous failure'); }, 10_000);
  await drain(); tick(); await drain(); // no uncaught synchronous failure
}

{
  const resource = { path: '/js/features/ecosystem-chamber.js?v=627', startTime: 100 };
  assert.equal(classifyLauncherResources([resource], []).premature.length, 1, 'hidden launchers remain deferred');
  assert.equal(classifyLauncherResources([resource], [{ id: 'ecosystem', at: 101 }]).premature.length, 1, 'later visibility cannot excuse an early fetch');
  assert.equal(classifyLauncherResources([resource], [{ id: 'capital', at: 99 }]).premature.length, 1, 'another visible card cannot excuse this fetch');
  assert.equal(classifyLauncherResources([resource], [{ id: 'ecosystem', at: 99 }]).hydrated.length, 1, 'a visible launcher may hydrate');
  for (const path of ['/css/ecosystem.min.css', '/data/ecosystem-entry-summary.json']) {
    assert.equal(classifyLauncherResources([{ ...resource, path }], [{ id: 'ecosystem', at: 99 }]).hydrated.length, 1);
  }
  assert.equal(classifyLauncherResources([{ ...resource, path: '/data/ecosystem-stats.json' }], [{ id: 'ecosystem', at: 99 }]).premature.length, 1, 'visibility never permits a full room artifact');
  assert.deepEqual(duplicateModuleRequests([{ path: '/my.js' }, { path: '/my.js?v=1' }]), [['/my.js', '/my.js?v=1']]);
  assert.deepEqual(duplicateModuleRequests([{ path: '/my.mjs' }, { path: '/my.mjs' }, { path: '/data.json' }, { path: '/data.json?v=1' }]), []);
}

console.log('ok - request lifetimes, forced refresh ownership, transient recovery, cancellation cleanup, retry backoff, widget overlap, and measured launcher intent');
