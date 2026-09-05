import {
    DOMAIN_HISTORY_TABLES,
    HISTORY_FRESHNESS_LIMITS,
    fetchChamberHistoricalDataReceipts,
    fetchHistoricalDataReceipt
} from './api.js';
export { describePulseSeries, pulseSeriesContextLine } from './pulse-history-analysis.mjs';

const CACHE_TTL_MS = 30 * 60 * 1000;
const CORE_CACHE_KEY = 'tezos-systems-pulse-history-v1';
const DOMAIN_CACHE_KEY = 'tezos-systems-pulse-domain-history-v1';
const DOMAIN_KEYS = ['market', 'networkHealth', 'tezosx', 'governance'];

let coreCache = null;
let corePromise = null;
let domainCache = null;
let domainPromise = null;

function safeSessionRead(key) {
    try {
        const parsed = JSON.parse(globalThis.sessionStorage?.getItem(key) || 'null');
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        return null;
    }
}

function safeSessionWrite(key, value) {
    try {
        globalThis.sessionStorage?.setItem(key, JSON.stringify(value));
    } catch {
        // A history cache is an optimization. Storage denial must not block the UI.
    }
}

function rowTimestamp(row) {
    const timestamp = Date.parse(row?.timestamp || '');
    return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
}

function normalizeRows(rows) {
    return (Array.isArray(rows) ? rows : [])
        .filter(row => row && typeof row === 'object')
        .sort((a, b) => (rowTimestamp(a) || 0) - (rowTimestamp(b) || 0));
}

function latestTimestamp(rows) {
    for (let index = rows.length - 1; index >= 0; index -= 1) {
        const timestamp = rowTimestamp(rows[index]);
        if (timestamp) return timestamp;
    }
    return null;
}

function sourceReceipt(receipt, table, capturedAt = Date.now()) {
    const rows = normalizeRows(receipt?.rows);
    const latestAt = latestTimestamp(rows);
    const freshnessLimitMs = HISTORY_FRESHNESS_LIMITS[table] || 5 * 60 * 60 * 1000;
    const incomingStatus = receipt?.status === 'stale'
        ? 'stale'
        : receipt?.status === 'unavailable'
            ? 'unavailable'
            : 'available';
    const sourceAvailable = incomingStatus !== 'unavailable';
    return {
        status: incomingStatus,
        rows,
        capturedAt,
        latestAt,
        freshnessLimitMs,
        fresh: incomingStatus === 'available'
            && latestAt !== null
            && (capturedAt - latestAt) <= freshnessLimitMs,
        error: sourceAvailable ? null : String(receipt?.error || 'History source unavailable')
    };
}

function usableCache(cache, now = Date.now()) {
    return cache
        && typeof cache === 'object'
        && Number.isFinite(Number(cache.capturedAt))
        && now - Number(cache.capturedAt) < CACHE_TTL_MS;
}

function cachedCoreReceipt(now = Date.now()) {
    if (!coreCache) {
        const stored = safeSessionRead(CORE_CACHE_KEY);
        if (stored?.rows) coreCache = sourceReceipt(stored, 'tezos_history', Number(stored.capturedAt) || now);
    }
    if (!coreCache) return null;
    return {
        ...coreCache,
        fresh: coreCache.latestAt !== null
            && (now - coreCache.latestAt) <= coreCache.freshnessLimitMs
    };
}

function cachedDomainReceipt(now = Date.now()) {
    if (!domainCache) {
        const stored = safeSessionRead(DOMAIN_CACHE_KEY);
        if (stored?.sources && typeof stored.sources === 'object') {
            domainCache = {
                status: stored.status || 'available',
                capturedAt: Number(stored.capturedAt) || now,
                sources: Object.fromEntries(DOMAIN_KEYS.map(key => {
                    const table = DOMAIN_HISTORY_TABLES[key];
                    return [key, sourceReceipt(stored.sources[key], table, Number(stored.capturedAt) || now)];
                }))
            };
        }
    }
    if (!domainCache) return null;
    return {
        ...domainCache,
        sources: Object.fromEntries(DOMAIN_KEYS.map(key => {
            const source = domainCache.sources?.[key] || sourceReceipt(null, DOMAIN_HISTORY_TABLES[key], now);
            return [key, {
                ...source,
                fresh: source.status !== 'unavailable'
                    && source.latestAt !== null
                    && (now - source.latestAt) <= source.freshnessLimitMs
            }];
        }))
    };
}

export function readCachedPulseHistoryReceipt() {
    return cachedCoreReceipt();
}

export function readCachedPulseHistoryRows() {
    return readCachedPulseHistoryReceipt()?.rows || [];
}

export async function getPulseHistoryReceipt({ force = false } = {}) {
    const now = Date.now();
    const cached = cachedCoreReceipt(now);
    if (!force && cached && usableCache(cached, now)) return cached;
    if (corePromise) return corePromise;

    corePromise = fetchHistoricalDataReceipt('30d')
        .then(receipt => {
            const next = sourceReceipt(receipt, 'tezos_history');
            if (next.status === 'available') {
                coreCache = next;
                safeSessionWrite(CORE_CACHE_KEY, next);
                return next;
            }
            if (cached?.rows?.length) {
                return {
                    ...cached,
                    status: 'stale',
                    fresh: cached.latestAt !== null
                        && (Date.now() - cached.latestAt) <= cached.freshnessLimitMs,
                    error: next.error
                };
            }
            return next;
        })
        .finally(() => {
            corePromise = null;
        });
    return corePromise;
}

export async function getPulseHistoryRows(options) {
    return (await getPulseHistoryReceipt(options)).rows;
}

export function readCachedPulseDomainReceipt() {
    return cachedDomainReceipt();
}

export function readCachedPulseDomainRows() {
    const receipt = readCachedPulseDomainReceipt();
    return Object.fromEntries(DOMAIN_KEYS.map(key => [key, receipt?.sources?.[key]?.rows || []]));
}

export async function getPulseDomainReceipt({ force = false } = {}) {
    const now = Date.now();
    const cached = cachedDomainReceipt(now);
    if (!force && cached && usableCache(cached, now)) return cached;
    if (domainPromise) return domainPromise;

    domainPromise = fetchChamberHistoricalDataReceipts('7d')
        .then(receipts => {
            const capturedAt = Date.now();
            const sources = Object.fromEntries(DOMAIN_KEYS.map(key => [
                key,
                sourceReceipt(receipts?.[key], DOMAIN_HISTORY_TABLES[key], capturedAt)
            ]));
            const availableCount = Object.values(sources).filter(source => source.status === 'available').length;
            const next = {
                status: availableCount === DOMAIN_KEYS.length
                    ? 'available'
                    : availableCount > 0
                        ? 'partial'
                        : 'unavailable',
                capturedAt,
                sources
            };

            if (availableCount > 0) {
                const previous = cached?.sources || {};
                DOMAIN_KEYS.forEach(key => {
                    if (next.sources[key].status === 'unavailable' && previous[key]?.rows?.length) {
                        next.sources[key] = {
                            ...previous[key],
                            status: 'stale',
                            fresh: previous[key].latestAt !== null
                                && (capturedAt - previous[key].latestAt) <= previous[key].freshnessLimitMs,
                            error: next.sources[key].error
                        };
                    }
                });
                domainCache = next;
                safeSessionWrite(DOMAIN_CACHE_KEY, next);
                return next;
            }

            if (cached) {
                return {
                    ...cached,
                    status: 'stale',
                    sources: Object.fromEntries(DOMAIN_KEYS.map(key => [
                        key,
                        {
                            ...cached.sources[key],
                            status: 'stale',
                            fresh: cached.sources[key].latestAt !== null
                                && (capturedAt - cached.sources[key].latestAt) <= cached.sources[key].freshnessLimitMs,
                            error: next.sources[key].error
                        }
                    ]))
                };
            }
            return next;
        })
        .finally(() => {
            domainPromise = null;
        });
    return domainPromise;
}

export async function getPulseDomainRows(options) {
    const receipt = await getPulseDomainReceipt(options);
    return Object.fromEntries(DOMAIN_KEYS.map(key => [key, receipt?.sources?.[key]?.rows || []]));
}

export const PULSE_HISTORY_CACHE_TTL_MS = CACHE_TTL_MS;
