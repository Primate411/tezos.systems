/**
 * Bounded, deduplicating request broker for My Tezos data sources.
 */

const DEFAULT_LIMITS = Object.freeze({
    tzkt: 2,
    octezArchive: 6,
    objkt: 1,
    blockscout: 2,
    etherlinkRpc: 1,
    default: 2
});
const PRIORITY = Object.freeze({ interactive: 0, visible: 1, background: 2 });
const RETRYABLE = new Set([408, 429, 502, 503, 504]);

function stableBody(value) {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (value instanceof URLSearchParams) return value.toString();
    try {
        return JSON.stringify(value, Object.keys(value).sort());
    } catch {
        return String(value);
    }
}

export function fingerprintMyTezosRequest({ method = 'GET', url = '', body = '', responseType = 'json' } = {}) {
    return `${String(method).toUpperCase()} ${String(url)} ${responseType} ${stableBody(body)}`;
}

function abortError(reason = 'Request aborted') {
    if (typeof DOMException === 'function') return new DOMException(String(reason), 'AbortError');
    const error = new Error(String(reason));
    error.name = 'AbortError';
    return error;
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function callerRace(promise, signal) {
    if (!signal) return promise;
    if (signal.aborted) return Promise.reject(abortError(signal.reason));
    return new Promise((resolve, reject) => {
        const onAbort = () => reject(abortError(signal.reason));
        signal.addEventListener('abort', onAbort, { once: true });
        promise.then(value => {
            signal.removeEventListener('abort', onAbort);
            resolve(value);
        }, error => {
            signal.removeEventListener('abort', onAbort);
            reject(error);
        });
    });
}

function retryDelay(response, attempt) {
    const rawRetryAfter = response?.headers?.get?.('retry-after');
    const retryAfterSeconds = rawRetryAfter == null || String(rawRetryAfter).trim() === ''
        ? NaN : Number(rawRetryAfter);
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) return retryAfterSeconds * 1000;
    const retryAfterDate = Date.parse(rawRetryAfter || '');
    if (Number.isFinite(retryAfterDate)) return Math.max(0, retryAfterDate - Date.now());
    const base = Math.min(15_000, 1000 * (2 ** attempt));
    return Math.round(Math.random() * base);
}

async function parseResponse(response, responseType) {
    if (responseType === 'response') return response;
    if (responseType === 'text') return response.text();
    if (response.status === 204) return null;
    return response.json();
}

export class MyTezosRequestBroker {
    constructor({ limits = {}, fetchImpl = null } = {}) {
        this.limits = { ...DEFAULT_LIMITS, ...limits };
        this.fetchImpl = fetchImpl;
        this.queues = new Map();
        this.active = new Map();
        this.inFlight = new Map();
        this.sequence = 0;
        this.paused = false;
    }

    setPaused(paused) {
        this.paused = Boolean(paused);
        if (!this.paused) {
            for (const provider of this.queues.keys()) this.#drain(provider);
        }
    }

    getProviderLimit(provider) {
        return this.limits[provider] || this.limits.default;
    }

    reduceProviderLimit(provider) {
        const current = this.getProviderLimit(provider);
        this.limits[provider] = Math.max(1, Math.floor(current / 2));
        return this.limits[provider];
    }

    request(url, {
        provider = 'default',
        priority = 'background',
        responseType = 'json',
        retries = 3,
        signal,
        key = '',
        ...init
    } = {}) {
        if (signal?.aborted) return Promise.reject(abortError(signal.reason));
        const requestKey = key || fingerprintMyTezosRequest({
            method: init.method || 'GET',
            url,
            body: init.body,
            responseType
        });
        const existing = this.inFlight.get(requestKey);
        if (existing) return callerRace(existing, signal);

        const shared = this.#enqueue({
            provider,
            priority: PRIORITY[priority] ?? PRIORITY.background,
            url,
            init,
            responseType,
            retries,
            sequence: this.sequence++
        }).finally(() => {
            if (this.inFlight.get(requestKey) === shared) this.inFlight.delete(requestKey);
        });
        this.inFlight.set(requestKey, shared);
        return callerRace(shared, signal);
    }

    #enqueue(job) {
        return new Promise((resolve, reject) => {
            const queue = this.queues.get(job.provider) || [];
            queue.push({ ...job, resolve, reject });
            queue.sort((left, right) => left.priority - right.priority || left.sequence - right.sequence);
            this.queues.set(job.provider, queue);
            this.#drain(job.provider);
        });
    }

    #drain(provider) {
        if (this.paused) return;
        const limit = this.limits[provider] || this.limits.default;
        const active = this.active.get(provider) || 0;
        const queue = this.queues.get(provider) || [];
        if (active >= limit || !queue.length) return;
        const job = queue.shift();
        this.active.set(provider, active + 1);
        this.#perform(job).then(job.resolve, job.reject).finally(() => {
            this.active.set(provider, Math.max(0, (this.active.get(provider) || 1) - 1));
            this.#drain(provider);
        });
        this.#drain(provider);
    }

    async #perform(job) {
        const fetcher = this.fetchImpl || globalThis.fetch;
        if (typeof fetcher !== 'function') throw new Error('Fetch is unavailable');
        let lastError = null;
        for (let attempt = 0; attempt <= job.retries; attempt += 1) {
            try {
                const response = await fetcher(job.url, {
                    ...job.init,
                    __tezosSystemsPriority: job.priority === PRIORITY.interactive ? 'interactive' : 'background'
                });
                if (response.ok) return parseResponse(response, job.responseType);
                const error = new Error(`Request failed: ${response.status}`);
                error.status = response.status;
                lastError = error;
                if (response.status === 429) this.reduceProviderLimit(job.provider);
                if (!RETRYABLE.has(response.status) || attempt >= job.retries) throw error;
                await wait(retryDelay(response, attempt));
            } catch (error) {
                lastError = error;
                if (error?.name === 'AbortError' || attempt >= job.retries || (error?.status && !RETRYABLE.has(error.status))) throw error;
                await wait(Math.round(Math.random() * Math.min(15_000, 1000 * (2 ** attempt))));
            }
        }
        throw lastError || new Error('Request failed');
    }
}

export const myTezosRequestBroker = new MyTezosRequestBroker();

let visibilityBound = false;
export function initMyTezosRequestBrokerVisibility() {
    if (visibilityBound || typeof document === 'undefined') return;
    visibilityBound = true;
    const syncPauseState = () => {
        const drawer = document.getElementById('my-tezos-drawer');
        const myTezosVisible = !drawer || drawer.classList.contains('open');
        myTezosRequestBroker.setPaused(
            document.visibilityState !== 'visible' || !myTezosVisible
        );
    };
    syncPauseState();
    document.addEventListener('visibilitychange', syncPauseState);
    window.addEventListener('my-tezos-drawer-opened', syncPauseState);
    window.addEventListener('my-tezos-drawer-closed', syncPauseState);
}
