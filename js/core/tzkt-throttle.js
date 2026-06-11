/**
 * Browser-local TzKT fetch pacing.
 *
 * TzKT free API traffic is rate limited per visitor. Most feature modules call
 * fetch directly, so install one narrow shim that queues only TzKT API requests
 * and lets every other network source keep its normal behavior.
 */

export const TZKT_MAX_REQUESTS_PER_SECOND = 6;
export const TZKT_MIN_REQUEST_SPACING_MS = 175;

const PATCH_FLAG = '__tezosSystemsTzktThrottleInstalled';
const ORIGINAL_FETCH_KEY = '__tezosSystemsOriginalFetch';
const TZKT_HOST_PATTERN = /(^|\.)api\.tzkt\.io$/;

function getRequestUrl(resource) {
    if (typeof resource === 'string') return resource;
    if (resource instanceof URL) return resource.href;
    if (resource && typeof resource.url === 'string') return resource.url;
    return '';
}

export function isTzktApiRequest(resource) {
    try {
        const rawUrl = getRequestUrl(resource);
        if (!rawUrl) return false;
        const url = new URL(rawUrl, window.location.href);
        return TZKT_HOST_PATTERN.test(url.hostname);
    } catch {
        return false;
    }
}

function getAbortSignal(resource, init) {
    if (init?.signal) return init.signal;
    if (resource && typeof resource === 'object' && 'signal' in resource) return resource.signal;
    return null;
}

function createAbortError() {
    return new DOMException('The operation was aborted.', 'AbortError');
}

function installTzktThrottle(target) {
    if (!target || target[PATCH_FLAG] || typeof target.fetch !== 'function') {
        return;
    }

    const originalFetch = target.fetch.bind(target);
    const queue = [];
    let timer = null;
    let nextDispatchAt = 0;

    target[PATCH_FLAG] = true;
    target[ORIGINAL_FETCH_KEY] = originalFetch;

    function schedule() {
        if (timer || !queue.length) return;
        const delay = Math.max(0, nextDispatchAt - Date.now());
        timer = setTimeout(dispatchNext, delay);
    }

    function removeQueued(entry) {
        const index = queue.indexOf(entry);
        if (index >= 0) queue.splice(index, 1);
    }

    function dispatchNext() {
        timer = null;
        const entry = queue.shift();
        if (!entry) return;

        entry.started = true;
        entry.cleanup();
        nextDispatchAt = Date.now() + TZKT_MIN_REQUEST_SPACING_MS;

        originalFetch(entry.resource, entry.init).then(entry.resolve, entry.reject);
        schedule();
    }

    function enqueue(resource, init) {
        const signal = getAbortSignal(resource, init);
        if (signal?.aborted) {
            return Promise.reject(createAbortError());
        }

        return new Promise((resolve, reject) => {
            const entry = {
                resource,
                init,
                resolve,
                reject,
                started: false,
                cleanup() {}
            };

            const onAbort = () => {
                if (entry.started) return;
                removeQueued(entry);
                entry.cleanup();
                reject(createAbortError());
            };

            entry.cleanup = () => {
                if (signal) signal.removeEventListener('abort', onAbort);
            };

            if (signal) signal.addEventListener('abort', onAbort, { once: true });

            queue.push(entry);
            schedule();
        });
    }

    target.fetch = function tezosSystemsFetch(resource, init) {
        if (!isTzktApiRequest(resource)) {
            return originalFetch(resource, init);
        }
        return enqueue(resource, init);
    };

    target.__tzktThrottle = {
        patched: true,
        maxRequestsPerSecond: TZKT_MAX_REQUESTS_PER_SECOND,
        minSpacingMs: TZKT_MIN_REQUEST_SPACING_MS,
        isTzktApiRequest,
        get queueLength() {
            return queue.length;
        },
        get nextDispatchInMs() {
            return Math.max(0, nextDispatchAt - Date.now());
        }
    };
}

if (typeof window !== 'undefined') {
    installTzktThrottle(window);
}
