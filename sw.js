/**
 * Tezos Systems — Service Worker
 * Cache-first for shell assets, network-first for API data
 */

const CACHE_NAME = 'tezos-systems-v8';

// Shell assets to precache
const SHELL_ASSETS = [
    '/',
    '/index.html',
    '/css/styles.css',
    '/css/styles.min.css',
    '/js/core/app.js',
    '/js/core/api.js',
    '/js/core/config.js',
    '/js/core/utils.js',
    '/js/core/storage.js',
    '/js/ui/animations.js',
    '/js/ui/gauge.js',
    '/js/ui/tabs.js',
    '/js/ui/theme.js',
    '/js/ui/title.js',
    '/js/ui/share.js',
    '/js/features/whales.js',
    '/js/features/moments.js',
    '/js/features/my-baker.js',
    '/js/features/objkt-ui.js',
    '/js/features/objkt.js',
    '/js/features/sleeping-giants.js',
    '/js/features/governance.js',
    '/js/features/history.js',
    '/js/features/price.js',
    '/js/features/changelog.js',
    '/js/features/comparison.js',
    '/js/features/streak.js',
    '/js/features/calculator.js',
    '/js/effects/arcade-effects.js',
    '/js/effects/audio.js',
    '/js/effects/matrix-effects.js',
    '/js/effects/bg-effects.js',
    '/data/protocol-data.json',
    '/data/tweets.json',
    '/favicon.svg',
    '/favicon-48.png',
    '/og-image.png',
    '/site.webmanifest'
];

// API domains — network-first with cache fallback
const API_HOSTS = ['api.tzkt.io', 'eu.rpc.tez.capital', 'api.coingecko.com', 'iijpfczftroespicmufb.supabase.co', 'data.objkt.com'];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            // Don't fail install if some assets are missing
            return Promise.allSettled(
                SHELL_ASSETS.map((url) => cache.add(url).catch(() => console.warn('SW: skip', url)))
            );
        }).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Skip non-GET
    if (event.request.method !== 'GET') return;

    // API requests: network-first, cache fallback
    if (API_HOSTS.some((h) => url.hostname === h)) {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                    }
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // CDN resources (Chart.js, fonts): cache-first
    if (url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com' || url.hostname === 'unpkg.com') {
        event.respondWith(
            caches.match(event.request).then((cached) => {
                return cached || fetch(event.request).then((response) => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                    }
                    return response;
                });
            })
        );
        return;
    }

    // Shell assets: cache-first with network update
    if (url.origin === self.location.origin) {
        event.respondWith(
            caches.match(event.request).then((cached) => {
                const fetchPromise = fetch(event.request).then((response) => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                    }
                    return response;
                }).catch(() => cached);

                return cached || fetchPromise;
            })
        );
    }
});
