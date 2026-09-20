/** Tez Capital read pool. Historical/archive capabilities are configured separately. */
import { withRequestDeadline } from './request-policy.mjs';

export const TEZOS_RPC_ENDPOINTS = Object.freeze([
    'https://eu.rpc.tez.capital',
    'https://us.rpc.tez.capital'
]);

export function isTezosRpcRead(resource, options = {}) {
    if (typeof resource !== 'string' && !(resource instanceof URL)) return false;
    try {
        const url = new URL(resource);
        const method = String(options.method || 'GET').toUpperCase();
        // This POST evaluates a view without injecting an operation. Other
        // POSTs (including wallet writes) must never enter the failover pool.
        const view = method === 'POST' && typeof options.body === 'string'
            && /^\/chains\/main\/blocks\/[^/]+\/helpers\/scripts\/run_script_view$/.test(url.pathname);
        return TEZOS_RPC_ENDPOINTS.includes(url.origin)
            && !url.username && !url.password
            && (['GET', 'HEAD'].includes(method) || view);
    } catch { return false; }
}

/** One successful request in the normal case; at most one failover per call. */
export function createTezosRpcPool({ fetchImpl = (...args) => fetch(...args), now = () => Date.now() } = {}) {
    const hosts = TEZOS_RPC_ENDPOINTS.map(origin => ({ origin, active: 0, lastUsed: 0, retryAt: 0 }));
    let sequence = 0;
    return async function read(resource, options = {}, timeoutMs = 15_000, consume = response => response) {
        if (!isTezosRpcRead(resource, options)) throw new TypeError('The Tezos RPC pool accepts only Tez Capital reads');
        const url = new URL(resource);
        const remaining = new Set(hosts);
        return withRequestDeadline(async signal => {
            for (let attempt = 0; attempt < hosts.length; attempt++) {
                signal.throwIfAborted();
                const available = [...remaining].filter(host => host.retryAt <= now());
                const candidates = available.length ? available : [...remaining];
                candidates.sort((a, b) => a.active - b.active || a.lastUsed - b.lastUsed);
                const host = candidates[0];
                remaining.delete(host);
                host.active++;
                host.lastUsed = ++sequence;
                const last = remaining.size === 0;
                try {
                    const result = await withRequestDeadline(async attemptSignal => {
                        const response = await fetchImpl(`${host.origin}${url.pathname}${url.search}`, { ...options, signal: attemptSignal });
                        attemptSignal.throwIfAborted();
                        if (!response.ok) {
                            // A missing historical level is path-specific, not an unhealthy node.
                            if ([403, 408, 429].includes(response.status) || response.status >= 500) host.retryAt = now() + 30_000;
                            if (!last) {
                                await response.body?.cancel();
                                return { retry: true };
                            }
                        }
                        const value = await consume(response);
                        attemptSignal.throwIfAborted();
                        if (response.ok) host.retryAt = 0;
                        return { value };
                    }, { timeoutMs: last ? timeoutMs : timeoutMs / 2, signal });
                    if (!result.retry) return result.value;
                } catch (error) {
                    signal.throwIfAborted();
                    host.retryAt = now() + 30_000;
                    if (last) throw error;
                } finally {
                    host.active--;
                }
            }
        }, { timeoutMs, signal: options.signal });
    };
}

export const fetchTezosRpc = createTezosRpcPool();
