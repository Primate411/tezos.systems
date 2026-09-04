/**
 * Tezos Systems service worker.
 *
 * Install only a small bootstrap plus a self-contained offline explanation.
 * Optional chambers, module dependencies, widgets, and data are cached on use
 * so installing an update does not download the whole site.
 */

const CACHE_NAME = 'tezos-systems-v626';
const RUNTIME_CACHE = `${CACHE_NAME}-runtime`;
const CURRENT_CACHES = new Set([CACHE_NAME, RUNTIME_CACHE]);

const RUNTIME_CACHE_LIMIT = 64;
const API_NETWORK_TIMEOUT_MS = 12_000;

// Minimum viable shell. The rest of the module graph is cached as the browser
// requests it during normal use.
const SHELL_ASSETS = [
    '/offline.html',
    '/css/styles.min.css',
    '/css/loading.css',
    '/css/site-map.css',
    '/js/core/theme-preload.js',
    '/js/ui/release-update.js',
    '/favicon.svg',
    '/site.webmanifest'
];

const API_HOSTS = new Set([
    'api.tzkt.io',
    'eu.rpc.tez.capital',
    'tezos-mainnet.octez.io',
    'octez-mainnet-archive.octez.io',
    'rpc.tzkt.io',
    'api.coingecko.com',
    'iijpfczftroespicmufb.supabase.co',
    'data.objkt.com',
    'explorer.etherlink.com',
    'node.mainnet.etherlink.com'
]);

// Generated source snapshots are always requested from the network. Each
// Chamber retains and labels its in-memory last-good snapshot; the service
// worker must not make an older JSON response look like a fresh fetch.
const NETWORK_ONLY_DATA_PATHS = new Set([
    '/data/governance-votes.json',
    '/data/governance-refresh-report.json',
    '/data/release-radar.json',
    '/data/capital-entry-summary.json',
    '/data/capital-snapshot.json',
    '/data/ecosystem-entry-summary.json',
    '/data/ecosystem-stats.json',
    '/data/minerals-entry-summary.json',
    '/data/minerals-snapshot.json',
    '/data/metals-entry-summary.json',
    '/data/metals-snapshot.json',
    '/data/uranium-entry-summary.json',
    '/data/uranium-snapshot.json',
    '/data/whale-watch.json',
    '/data/baker-governance-signals.json',
    '/data/maxis/entry-summary.json',
    '/data/maxis-leaders.json',
    '/data/maxis-careers.json',
    '/data/maxis-l2-governance.json',
    '/data/maxis/manifest.json',
    '/data/tezoscrp-awards.json',
    '/data/tezoscrp-awards.compact.json',
    '/data/tezoscrp-summary.json'
]);

function isNetworkOnlyDataPath(pathname) {
    return NETWORK_ONLY_DATA_PATHS.has(pathname)
        || /^\/data\/maxis\/seasons\/[^/]+\/(?:summary|rules)\.json$/.test(pathname);
}

const CDN_HOSTS = new Set([
    'cdn.jsdelivr.net',
    'esm.sh',
    'fonts.googleapis.com',
    'fonts.gstatic.com',
    'unpkg.com'
]);

async function trimCache(cacheName, maxEntries) {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    const overflow = Math.max(0, keys.length - maxEntries);
    await Promise.all(keys.slice(0, overflow).map((request) => cache.delete(request)));
}

async function putBounded(cacheName, request, response, maxEntries) {
    const cache = await caches.open(cacheName);
    await cache.put(request, response);
    await trimCache(cacheName, maxEntries);
}

async function fetchWithTimeout(request, timeoutMs, init = {}) {
    const controller = new AbortController();
    const callerSignal = request.signal;
    const forwardAbort = () => controller.abort(callerSignal.reason);
    if (callerSignal?.aborted) forwardAbort();
    else callerSignal?.addEventListener('abort', forwardAbort, { once: true });
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(request, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timeoutId);
        callerSignal?.removeEventListener('abort', forwardAbort);
    }
}

function unavailableDataResponse() {
    return new Response(JSON.stringify({
        error: 'Network data unavailable',
        _quality: { status: 'unavailable', observedAt: null }
    }), {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'application/json', 'X-Tezos-Systems-Cache': 'miss' }
    });
}

async function apiNetworkFirst(request, event) {
    if (self.navigator?.onLine === false) return unavailableDataResponse();
    try {
        // A network-only receipt must bypass the browser HTTP cache as well as
        // Cache Storage; otherwise an offline fetch can silently replay a
        // previously seeded generated artifact as current.
        return await fetchWithTimeout(request, API_NETWORK_TIMEOUT_MS, { cache: 'no-store' });
    } catch {
        return unavailableDataResponse();
    }
}

async function generatedDataNetworkFirst(request, event) {
    if (self.navigator?.onLine === false) return unavailableDataResponse();
    try {
        // Revalidate mutable receipts with ETag/If-None-Match while never
        // falling back to Cache Storage. A failed revalidation stays visibly
        // unavailable so an old snapshot cannot impersonate a fresh one.
        return await fetchWithTimeout(request, API_NETWORK_TIMEOUT_MS, { cache: 'no-cache' });
    } catch {
        return unavailableDataResponse();
    }
}

async function networkFirstRuntime(request, event) {
    try {
        const response = await fetchWithTimeout(request, API_NETWORK_TIMEOUT_MS, { cache: 'no-cache' });
        if (response.ok) {
            event.waitUntil(putBounded(RUNTIME_CACHE, request, response.clone(), RUNTIME_CACHE_LIMIT));
        }
        return response;
    } catch {
        if (request.mode === 'navigate') {
            const offline = await caches.match('/offline.html');
            if (offline) return offline;
        }
        const cached = await caches.match(request);
        if (cached) return cached;
        return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
    }
}

async function cacheFirstRuntime(request, event) {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
        const response = await fetchWithTimeout(request, API_NETWORK_TIMEOUT_MS);
        if (response.ok) {
            event.waitUntil(putBounded(RUNTIME_CACHE, request, response.clone(), RUNTIME_CACHE_LIMIT));
        }
        return response;
    } catch {
        return new Response('', { status: 504, statusText: 'Gateway Timeout' });
    }
}

async function pruneShellCache() {
    const cache = await caches.open(CACHE_NAME);
    const allowed = new Set(SHELL_ASSETS.map((asset) => new URL(asset, self.location.origin).href));
    allowed.add(new URL('/version.json', self.location.origin).href);
    const keys = await cache.keys();
    await Promise.all(keys.filter((request) => !allowed.has(request.url)).map((request) => cache.delete(request)));
}

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => Promise.allSettled(
                SHELL_ASSETS.map((url) => cache.add(url).catch(() => console.warn('SW: skip', url)))
            ))
    );
});

self.addEventListener('message', (event) => {
    if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((key) => !CURRENT_CACHES.has(key)).map((key) => caches.delete(key))))
            .then(pruneShellCache)
            .then(() => trimCache(RUNTIME_CACHE, RUNTIME_CACHE_LIMIT))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);
    if (request.method !== 'GET') return;

    if (url.origin === self.location.origin && url.pathname === '/version.json') {
        event.respondWith(
            fetch(request, { cache: 'no-store' })
                .then((response) => {
                    if (response.ok) event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone())));
                    return response;
                })
                .catch(() => caches.match(request)
                    .then((response) => response || new Response('Version unavailable', { status: 503, statusText: 'Service Unavailable' })))
        );
        return;
    }

    if (url.origin === self.location.origin && isNetworkOnlyDataPath(url.pathname)) {
        event.respondWith(generatedDataNetworkFirst(request, event));
        return;
    }

    if (API_HOSTS.has(url.hostname)) {
        event.respondWith(apiNetworkFirst(request, event));
        return;
    }

    if (CDN_HOSTS.has(url.hostname)) {
        event.respondWith(cacheFirstRuntime(request, event));
        return;
    }

    if (url.origin === self.location.origin) {
        event.respondWith(networkFirstRuntime(request, event));
    }
});
