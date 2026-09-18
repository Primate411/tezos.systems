import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source = await fs.readFile(new URL('../sw.js', import.meta.url), 'utf8');
const handlers = new Map();
const fetchCalls = [];
let fetchBehavior = async () => new Response('{}', { status: 200, headers: { ETag: '"receipt-v1"' } });

const self = {
  location: { origin: 'https://tezos.systems' },
  navigator: { onLine: true },
  addEventListener(type, handler) { handlers.set(type, handler); },
  skipWaiting() {},
  clients: { claim: async () => {}, matchAll: async () => [] }
};
const caches = {
  async keys() { return []; },
  async open() { throw new Error('generated receipts must not open Cache Storage'); },
  async match() { throw new Error('generated receipts must not read Cache Storage'); },
  async delete() { return true; }
};
const context = vm.createContext({
  AbortController,
  Request,
  Response,
  URL,
  caches,
  clearTimeout,
  console,
  fetch: async (request, init = {}) => {
    fetchCalls.push({ url: request.url, cache: init.cache });
    return fetchBehavior(request, init);
  },
  self,
  setTimeout
});
new vm.Script(source, { filename: 'sw.js' }).runInContext(context);

let reportedVersion;
handlers.get('message')({
  data: { type: 'GET_RELEASE_VERSION' },
  ports: [{ postMessage(value) { reportedVersion = value; } }]
});
assert.equal(reportedVersion.type, 'RELEASE_VERSION');
assert.equal(reportedVersion.version, source.match(/CACHE_NAME = 'tezos-systems-v(\d+)'/)[1],
  'the worker must identify its own asset version, independent of fresh version.json');

async function dispatchFetch(url) {
  let responsePromise = null;
  handlers.get('fetch')({
    request: new Request(url),
    respondWith(value) { responsePromise = Promise.resolve(value); },
    waitUntil() {}
  });
  assert.ok(responsePromise, `service worker should handle ${url}`);
  return responsePromise;
}

const summaryUrl = 'https://tezos.systems/data/ecosystem-entry-summary.json';
assert.equal((await dispatchFetch(summaryUrl)).status, 200);
assert.equal((await dispatchFetch(summaryUrl)).status, 200);
assert.deepEqual(
  fetchCalls.map((call) => call.cache),
  ['no-cache', 'no-cache'],
  'mutable generated receipts should reach the HTTP cache revalidation path on every online poll'
);

fetchBehavior = async () => { throw new Error('offline revalidation'); };
const unavailable = await dispatchFetch(summaryUrl);
assert.equal(unavailable.status, 503, 'a failed generated-receipt revalidation must fail closed');
assert.equal(unavailable.headers.get('X-Tezos-Systems-Cache'), 'miss');

const callsBeforeOffline = fetchCalls.length;
self.navigator.onLine = false;
assert.equal((await dispatchFetch(summaryUrl)).status, 503);
assert.equal(fetchCalls.length, callsBeforeOffline, 'explicitly offline generated receipts must not consult warmed HTTP bytes');

for (const name of ['capital-snapshot', 'minerals-snapshot', 'ecosystem-stats']) {
  const url = `https://tezos.systems/data/transports/v1/data/${name}.json`;
  const before = fetchCalls.length;
  assert.equal((await dispatchFetch(url)).status, 503, 'offline mutable transports must not replay Cache Storage');
  assert.equal(fetchCalls.length, before);
  self.navigator.onLine = true;
  fetchBehavior = async () => new Response('{}', { status: 200 });
  assert.equal((await dispatchFetch(url)).status, 200);
  assert.equal(fetchCalls.at(-1).cache, 'no-cache', 'mutable transport keeps its expanded source revalidation policy');
  fetchBehavior = async () => { throw new Error('transport source unavailable'); };
  assert.equal((await dispatchFetch(url)).status, 503, 'transport failures must not consult Cache Storage');
  self.navigator.onLine = false;
}
assert.equal(vm.runInContext("isNetworkOnlyDataPath('/data/transports/v1/data/maxis/seasons/example/passports/2a.json')", context), false,
  'immutable Passport transports keep normal HTTP caching and frozen receipt validation');

self.navigator.onLine = true;
fetchBehavior = async () => new Response('{}', { status: 200 });
assert.equal((await dispatchFetch('https://api.tzkt.io/v1/head')).status, 200);
assert.equal(fetchCalls.at(-1).cache, 'no-store', 'live external API reads must continue bypassing browser caches');

console.log('ok - service worker conditionally revalidates generated receipts and fails closed without Cache Storage replay');

// Exercise release coordination with controlled worker events, metadata, and
// time. Browser smoke separately checks the real worker and rendered controls.
const lifecycleSource = (await fs.readFile(new URL('../js/core/shell-lifecycle.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\n/gm, '')
  .replace('export function initShellLifecycle', 'function initShellLifecycle');
const flush = () => new Promise(resolve => setImmediate(resolve));

function makeWorker(version, state = 'installed') {
  const listeners = new Set();
  return {
    state, version, messages: 0,
    addEventListener(type, fn) { listeners.add(fn); },
    removeEventListener(type, fn) { listeners.delete(fn); },
    setState(state) { this.state = state; for (const fn of [...listeners]) fn(); },
    postMessage(message, ports) {
      if (message.type === 'GET_RELEASE_VERSION') ports[0].postMessage({ type: 'RELEASE_VERSION', version });
      else if (message.type === 'SKIP_WAITING') this.messages += 1;
    }
  };
}

async function releaseHarness({ initialController = true, deferred = false, documentVersion = '1', waitingVersion = '2' } = {}) {
  const listeners = new Map();
  const timers = new Map();
  const storage = new Map();
  const notices = [];
  const patches = [];
  let now = 1000000;
  let timerId = 0;
  let reloads = 0;
  let hidden = 0;
  let metadataResolve;
  let holdMetadata = false;
  let reads = 0;
  const oldWorker = makeWorker('0', 'activated');
  const worker = makeWorker(waitingVersion);
  const regListeners = new Map();
  const registration = {
    waiting: worker,
    active: oldWorker,
    update: async () => {},
    addEventListener(type, fn) { regListeners.set(type, fn); }
  };
  const serviceWorker = {
    controller: initialController ? oldWorker : null,
    register: async () => registration,
    getRegistration: async () => registration,
    addEventListener(type, fn) { listeners.set(type, fn); }
  };
  const document = {
    visibilityState: 'visible',
    querySelector: () => ({ dataset: { dashboardSrc: '/js/core/app.js?v=' + documentVersion } }),
    addEventListener(type, fn) { listeners.set(type, fn); }
  };
  const ui = {
    showReleaseUpdateDock(options) { notices.push(options); },
    setReleaseUpdateDockState(options) { patches.push(options); },
    hideReleaseUpdateDock() { hidden += 1; }
  };
  if (deferred) storage.set('tezos-systems-release-update-deferred-until-v1', now + 30 * 60 * 1000);
  const sandbox = vm.createContext({
    AbortController, console, document, navigator: { serviceWorker }, ui, URL,
    MessageChannel: class {
      constructor() {
        this.port1 = { close() {} };
        this.port2 = { close() {}, postMessage: data => queueMicrotask(() => this.port1.onmessage?.({ data })) };
      }
    },
    Date: { now: () => now }, debugLog() {},
    sessionStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key)
    },
    fetch: async () => {
      reads += 1;
      if (holdMetadata) await new Promise(resolve => { metadataResolve = resolve; });
      return { ok: true, json: async () => ({ build: 1, latestChange: 'New release' }) };
    },
    window: {
      setTimeout(fn, ms) { const id = ++timerId; timers.set(id, { fn, at: now + ms }); return id; },
      clearTimeout(id) { timers.delete(id); },
      setInterval(fn) { listeners.set('interval', fn); },
      location: { href: 'https://tezos.systems/', reload() { reloads += 1; } }
    }
  });
  new vm.Script(`${lifecycleSource}\nreleaseUpdateUiPromise = Promise.resolve(ui); registerServiceWorker();`).runInContext(sandbox);
  await flush();
  return {
    notices, patches, registration, serviceWorker, worker, document,
    async activate(target = worker, controllerEvent = true) {
      registration.waiting = null;
      registration.active = target;
      serviceWorker.controller = target;
      if (controllerEvent) listeners.get('controllerchange')?.();
      target.setState('activated');
      await flush();
    },
    get reloads() { return reloads; }, get hidden() { return hidden; }, get reads() { return reads; },
    async event(name) { listeners.get(name)?.(); await flush(); },
    holdMetadata() { holdMetadata = true; },
    async releaseMetadata() { holdMetadata = false; metadataResolve?.(); await flush(); },
    async advance(ms) {
      now += ms;
      for (const [id, timer] of [...timers]) {
        if (timers.has(id) && timer.at <= now) { timers.delete(id); timer.fn(); }
      }
      await flush();
    }
  };
}

const release = await releaseHarness();
assert.equal(release.notices.length, 1);
await release.event('visibilitychange');
await release.event('interval');
assert.equal(release.notices.length, 1, 'duplicate discovery must not redraw the prompt');
assert.equal(release.reads, 1, 'duplicate checks must not reload metadata');
const accepted = release.notices[0].onAction();
await flush();
assert.equal(release.worker.messages, 1);
await release.event('visibilitychange');
assert.equal(release.notices.length, 1, 'checks must not reset the pending action');
await release.activate();
await accepted;
await release.event('controllerchange');
await release.event('controllerchange');
assert.equal(release.reloads, 1, 'activation must reload exactly once');
await release.advance(10000);
assert.equal(release.patches.length, 0, 'completed activation must cancel fallback');

const fallback = await releaseHarness();
const fallbackAction = fallback.notices[0].onAction();
await flush();
await fallback.activate(fallback.worker, false);
await fallbackAction;
assert.equal(fallback.reloads, 1, 'worker activation must finish even without controllerchange');

const offline = await releaseHarness();
offline.registration.update = async () => { throw new Error('offline'); };
const offlineAction = offline.notices[0].onAction();
await flush();
assert.equal(offline.worker.messages, 1, 'a failed latest check must still apply an already-installed update');
await offline.activate();
await offlineAction;
assert.equal(offline.reloads, 1);

const newest = await releaseHarness();
const newerWorker = makeWorker('3', 'installing');
newest.registration.update = async () => { newest.registration.installing = newerWorker; };
const newestAction = newest.notices[0].onAction();
await flush();
assert.equal(newest.worker.messages, 0, 'one click must not activate an obsolete waiting worker');
assert.equal(newest.reloads, 0, 'the click waits while the latest build downloads');
newest.worker.setState('redundant');
newest.registration.waiting = newerWorker;
newest.registration.installing = null;
newerWorker.setState('installed');
await flush();
assert.equal(newerWorker.messages, 1, 'the same action accepts the newest worker');
newest.serviceWorker.controller = newerWorker;
newerWorker.setState('activating');
await newest.event('controllerchange');
assert.equal(newest.reloads, 0, 'controllerchange must not reload in the middle of activation');
await newest.activate(newerWorker);
await newestAction;
assert.equal(newest.reloads, 1, 'the newest build activates and reloads exactly once');

const alreadyLoaded = await releaseHarness({ documentVersion: '2' });
assert.equal(alreadyLoaded.notices.length, 0, 'a waiting worker matching the loaded document must not repeat the update');
alreadyLoaded.serviceWorker.controller = alreadyLoaded.worker;
alreadyLoaded.registration.waiting = null;
await alreadyLoaded.event('controllerchange');
assert.equal(alreadyLoaded.notices.length, 0, 'same-build claims must not ask for another reload');
assert.equal(alreadyLoaded.reloads, 0, 'matching builds need no forced reload');

const stalled = await releaseHarness();
const stalledAction = stalled.notices[0].onAction();
await flush();
await stalled.advance(30000);
await stalledAction;
assert.equal(stalled.reloads, 0, 'a still-waiting worker must not trigger a reload loop');
assert.equal(stalled.patches.at(-1).state, 'error');
const retry = stalled.notices[0].onAction();
await flush();
assert.equal(stalled.worker.messages, 2, 'failed activation must allow an explicit retry');
await stalled.activate();
await retry;

const deferred = await releaseHarness();
deferred.notices[0].onLater();
assert.equal(deferred.hidden, 1);
await deferred.event('visibilitychange');
await deferred.event('interval');
await deferred.advance(30 * 60 * 1000 - 1);
assert.equal(deferred.notices.length, 1, 'Later must survive background and visibility checks');
await deferred.advance(1);
assert.equal(deferred.notices.length, 2, 'Later may resurface once after the deadline');
const restored = await releaseHarness({ deferred: true });
assert.equal(restored.notices.length, 0, 'a saved Later deadline must survive navigation');
restored.document.visibilityState = 'hidden';
await restored.advance(30 * 60 * 1000);
assert.equal(restored.notices.length, 0, 'a hidden tab must not resurface a notice');
restored.document.visibilityState = 'visible';
await restored.event('visibilitychange');
assert.equal(restored.notices.length, 1);

const staleMetadata = await releaseHarness({ deferred: true });
staleMetadata.holdMetadata();
await staleMetadata.advance(30 * 60 * 1000);
await staleMetadata.event('visibilitychange');
assert.equal(staleMetadata.reads, 1, 'overlapping metadata fetches must be deduplicated');
staleMetadata.document.visibilityState = 'hidden';
await staleMetadata.releaseMetadata();
assert.equal(staleMetadata.notices.length, 0, 'late metadata must not show a notice in a hidden tab');
staleMetadata.document.visibilityState = 'visible';
await staleMetadata.event('visibilitychange');
assert.equal(staleMetadata.notices.length, 1);

const sibling = await releaseHarness();
sibling.serviceWorker.controller = sibling.worker;
sibling.registration.waiting = null;
await sibling.event('controllerchange');
assert.equal(sibling.reloads, 0, 'another tab must never force this reader to reload');
assert.equal(sibling.notices.at(-1).actionLabel, 'Update & reload');
await sibling.event('visibilitychange');
assert.equal(sibling.notices.length, 2, 'the cross-tab notice must also be deduplicated');
sibling.registration.active = sibling.worker;
sibling.worker.setState('activated');
await sibling.notices.at(-1).onAction();
assert.equal(sibling.reloads, 1);

const fresh = await releaseHarness({ initialController: false });
fresh.serviceWorker.controller = fresh.worker;
fresh.registration.waiting = null;
await fresh.event('controllerchange');
assert.equal(fresh.notices.length, 0, 'first installation must not pretend to be an update');
assert.equal(fresh.reloads, 0);
console.log('ok - one accepted action drains newest installation, waits for activation, reloads once, suppresses same-build repeats, and preserves deferral/cross-tab control');
