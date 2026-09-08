import assert from 'node:assert/strict';
import * as validators from '../js/core/source-payloads.mjs';
import { requestFingerprint, withRequestDeadline } from '../js/core/request-policy.mjs';
import { MyTezosRequestBroker } from '../js/core/my-tezos-request-broker.mjs';
import { loadModule } from './lib/browser-source-vm.mjs';

const stats = { totalSupply: 100, totalOwnStaked: 0, totalExternalStaked: 0, totalFrozen: 50, totalOwnDelegated: 10, totalExternalDelegated: 20 };
const constants = { blocks_per_cycle: 14400, minimal_block_delay: '6', liquidity_baking_subsidy: '2500000' };
const price = { usd: 0.72, eur: 0.63, btc: 0.000006, usd_24h_change: -2, usd_7d_change: 0, usd_30d_change: null };
const response = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };

for (const [validate, valid, invalid] of [
    [validators.validateStatistics, stats, [{}, [], null, { ...stats, totalSupply: '100' }, { ...stats, totalSupply: 0 }, { ...stats, totalOwnStaked: null }, { ...stats, totalExternalStaked: 101 }, { ...stats, totalOwnDelegated: '10' }]],
    [validators.validateConstants, constants, [{}, [], { ...constants, blocks_per_cycle: -1 }, { ...constants, minimal_block_delay: '6junk' }, { ...constants, liquidity_baking_subsidy: null }]],
    [validators.validateRpcScalar, '"1000000000000000"', ['"4.5junk"', 'null', '[]', '{}', '""', '"-1"', 'NaN', '1e999']],
    [validators.validateRpcAmount, '"1000000000000000"', ['"4.5"', '0.1', '"9007199254740992"']],
    [validators.validateCount, 0, [null, {}, [], '1', -1, 0.5]],
    [validators.validateVotingPeriod, { index: 4, kind: 'exploration', yayVotingPower: 0 }, [{}, { index: 4, kind: 'future-kind' }, { index: '4', kind: 'proposal' }, { index: 4, kind: 'proposal', yayVotingPower: '100' }]],
    [validators.validateHeader, { level: 123, timestamp: '2026-09-05T12:00:00Z' }, [[], {}, { level: null, timestamp: '2026-09-05' }, { level: 1, timestamp: 'broken' }]],
    [validators.validateMetadata, { level_info: { cycle: null, cycle_position: null } }, [[], {}, { level_info: { cycle: '4' } }]],
    [validators.validateBakers, [{ address: 'tz1' + 'a'.repeat(33), bakingPower: 10 }], [[], {}, [{ address: 'tz1' + 'a'.repeat(33), bakingPower: '10' }], [{ address: null, bakingPower: 10 }]]],
    [validators.validatePriceData, price, [{}, null, { usd: '0.72' }, { usd: 0 }, { ...price, usd_24h_change: '4' }, { ...price, btc: -1 }]],
    [validators.validatePriceSpot, { tezos: price }, [{}, { tezos: {} }, { error: 'rate limit' }]],
    [validators.validatePriceHorizons, [{ id: 'tezos', current_price: 0.72 }], [[], {}, [{ id: 'bitcoin', current_price: 1 }], [{ id: 'tezos', current_price: '1' }]]]
]) {
    assert.equal(validate(valid), valid, `${validate.name}: preserve the source value without coercion`);
    for (const value of invalid) assert.throws(() => validate(value), /Invalid/, `${validate.name}: reject ${JSON.stringify(value)}`);
}

{
    let calls = 0, payload = {};
    const api = await loadModule('js/core/api.js', 'fetchWithRetry', { fetch: async () => { calls++; return response(payload); } });
    await api.fetchWithRetry('/stricter-reader', {}, 1);
    payload = stats;
    assert.deepEqual(await api.fetchWithRetry('/stricter-reader', { validate: validators.validateStatistics }, 1), stats);
    assert.equal(calls, 2, 'stricter readers evict an invalid generic cached response and recover from the source');
    payload = { error: 'upstream failed' };
    await assert.rejects(api.fetchWithRetry('https://tzkt.test/accounts/count', {}, 1), /Invalid TzKT count/);
    payload = 0;
    assert.equal(await api.fetchWithRetry('https://tzkt.test/accounts/count', {}, 1), 0);
}

{
    const stored = new Map();
    const api = await loadModule('js/core/storage.js', 'saveStats, loadStats, loadStatsTimestamp', {
        CACHE_TTLS: { memory: 60_000, storage: 14_400_000 },
        localStorage: { getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value) }
    });
    const valid = { totalBakers: 400, blockLevel: 12345678, stakingRatio: 0, _quality: { status: 'live', observedAt: new Date(Date.now() - 1000).toISOString() } };
    api.saveStats(valid);
    assert.equal(api.loadStats().stakingRatio, 0);
    api.saveStats({ ...valid, stakingRatio: '30' });
    assert.equal(api.loadStats().stakingRatio, 0, 'malformed aggregate cannot overwrite the last-good observation');
    stored.set('tezos-systems-lastUpdate', String(Date.now() + 60_000));
    assert.equal(api.loadStats(), null);
    assert.equal(api.loadStatsTimestamp(), 0, 'future observation clocks cannot be rendered as fresh');
}

{
    const api = await loadModule('js/core/api.js', 'fetchStakingRatio, fetchStakingAPY', {
        fetch: async url => {
            if (url.endsWith('/statistics/current')) return response({ ...stats, totalBakingPower: 10, totalDelegators: 20, totalStakers: 0 });
            if (url.endsWith('/constants')) return response({ ...constants, edge_of_staking_over_delegation: 3 });
            if (url.endsWith('/current_yearly_rate')) return response('4.5');
            return response(url.endsWith('/total_supply') ? '100' : '50');
        }
    });
    const ratio = await api.fetchStakingRatio();
    assert.equal(ratio.stakingRatio, 0, 'current zero stake beats a nonzero RPC/legacy fallback');
    assert.equal(ratio._quality.status, 'live');
    assert.equal((await api.fetchStakingAPY())._quality.status, 'unavailable', 'zero stake cannot produce a rate using a different frozen balance');
}
assert.equal(validators.validateRpcScalar('0'), '0', 'zero is valid source data');

{
    let calls = 0, payload = {};
    const api = await loadModule('js/core/api.js', 'fetchWithRetry, getTzktTotalStaked, qualityFromSettled', {
        fetch: async () => { calls++; return response(payload); }
    });
    await assert.rejects(api.fetchWithRetry('/statistics', { validate: validators.validateStatistics }, 1), /Invalid/);
    payload = stats;
    assert.deepEqual(await api.fetchWithRetry('/statistics', { validate: validators.validateStatistics }, 1), stats);
    await api.fetchWithRetry('/statistics', { validate: validators.validateStatistics }, 1);
    assert.equal(calls, 2, 'malformed success does not poison the cache; a later valid response does cache');
    assert.equal(api.getTzktTotalStaked(stats), 0, 'explicit zero stake never falls through to legacy frozen stake');
    const observed = { ...stats, _quality: { status: 'live', observedAt: '2026-09-05T12:00:00.000Z' } };
    api.qualityFromSettled({ stats: { status: 'fulfilled', value: observed } }, {});
    const failed = api.qualityFromSettled({ stats: { status: 'rejected', reason: new TypeError('Invalid source') } }, {});
    assert.equal(failed.values.stats, observed);
    assert.equal(failed.quality.status, 'stale');
    assert.equal(failed.quality.observedAt, observed._quality.observedAt, 'retaining data retains its observation clock');
}

{
    let calls = 0;
    const api = await loadModule('js/core/api.js', 'fetchWithRetry', {
        fetch: async (_url, init) => { calls++; return response({ header: init.headers.get('x-test'), call: calls }); }
    });
    const first = await api.fetchWithRetry('/same', { headers: { 'X-Test': 'a' } }, 1);
    assert.deepEqual(await api.fetchWithRetry('/same', { headers: new Headers({ 'x-test': 'a' }) }, 1), first);
    assert.equal((await api.fetchWithRetry('/same', { headers: { 'x-test': 'b' } }, 1)).header, 'b');
    assert.equal(typeof await api.fetchWithRetry('/same', { responseType: 'text', headers: { 'x-test': 'a' } }, 1), 'string');
    for (let i = 0; i < 2; i++) await api.fetchWithRetry('/same', { method: 'POST', body: '{}' }, 1);
    assert.equal(calls, 5, 'headers and format have distinct caches, POST responses are never read-cached');
    for (let i = 0; i < 2; i++) await api.fetchWithRetry('/same', { cache: 'no-store' }, 1);
    assert.equal(calls, 7, 'no-store bypasses memory observation caching');
}

{
    const urls = [];
    const api = await loadModule('js/core/api.js', 'fetchCycleInfo', { fetch: async url => {
        urls.push(url);
        if (url.endsWith('/header')) return response({ level: 123, timestamp: '2026-09-05T12:00:00Z' });
        if (url.endsWith('/metadata')) return response({ level_info: { cycle: 1, cycle_position: 3 } });
        return response(constants);
    } });
    const cycle = await api.fetchCycleInfo();
    assert.equal(cycle.cycleStartBlock, 120);
    assert(urls.some(url => url.endsWith('/blocks/123/metadata')), 'a header without hash still pins its metadata to the captured level');
    assert(!urls.some(url => url.endsWith('/blocks/head/metadata')));
}

{
    const api = await loadModule('js/core/api.js', 'fetchWithRetry, cache', { fetch: async () => response(1) });
    for (let i = 0; i < 300; i++) await api.fetchWithRetry(`/bounded/${i}`, {}, 1);
    assert.equal(Object.keys(api.cache.data).length, 256, 'query-varying reads cannot grow the observation cache indefinitely');
}

{
    const api = await loadModule('js/core/api.js', 'fetchWithRetry', {
        fetch: async () => ({ ok: true, status: 200, json: () => new Promise(() => {}) })
    });
    await assert.rejects(api.fetchWithRetry('/stalled-body', { timeoutMs: 20 }, 1), { name: 'TimeoutError' });
    const unavailable = await loadModule('js/core/api.js', 'fetchWithRetry', { fetch: async () => new Response('', { status: 404 }) });
    await assert.rejects(unavailable.fetchWithRetry('/absent', {}, 1), error => error.status === 404);
}

for (const corruptCache of [{ schema: 2, timestamp: Date.now(), data: { usd: '0.72' } }, { schema: 2, timestamp: Date.now() + 60_000, data: price }]) {
    const stored = new Map([['tezos_price_cache', JSON.stringify(corruptCache)]]);
    let calls = 0;
    const api = await loadModule('js/features/price.js', 'fetchXTZPrice', {
        sessionStorage: { getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key) },
        fetch: async url => { calls++; return response(url.includes('/coins/markets') ? [] : { tezos: price }); }
    });
    assert.equal((await api.fetchXTZPrice()).usd, price.usd);
    assert.equal(calls, 2, 'malformed or future-dated session data is evicted before rendering');
}

{
    const stored = new Map(); let recovered = false;
    const api = await loadModule('js/features/price.js', 'fetchXTZPrice', {
        sessionStorage: { getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key) },
        fetch: async url => response(url.includes('/coins/markets') ? (recovered ? [{ id: 'tezos', current_price: 0.73 }] : []) : { tezos: {} })
    });
    assert.equal(await api.fetchXTZPrice(), null);
    assert.equal(stored.size, 0, 'empty successes cannot become a price observation');
    recovered = true;
    assert.equal((await api.fetchXTZPrice()).usd, 0.73, 'valid horizons can recover independently from invalid spot');
}

{
    const base = requestFingerprint('/same', { method: 'POST', body: { outer: { b: 2, a: 1 } } }, { provider: 'one' });
    assert.equal(base, requestFingerprint('/same', { method: 'post', body: { outer: { a: 1, b: 2 } } }, { provider: 'one' }));
    assert.notEqual(base, requestFingerprint('/same', { method: 'POST', body: { outer: { b: 3, a: 1 } } }, { provider: 'one' }), 'nested body keys contribute to identity');
    assert.equal(requestFingerprint('/form', { body: new FormData() }), null, 'opaque bodies cannot collide');
    assert.equal(requestFingerprint(new Request('https://a.example/')), null, 'Request bodies and inherited options bypass synchronous identity');
    assert.notEqual(requestFingerprint('/same', { credentials: 'include' }), requestFingerprint('/same', { credentials: 'omit' }));
}

{
    const pending = deferred(); let calls = 0;
    const broker = new MyTezosRequestBroker({ limits: { default: 8 }, fetchImpl: async () => { calls++; await pending.promise; return response(1); } });
    const requests = [broker.request('/same'), broker.request('/same'), broker.request('/same', { provider: 'tzkt' }),
        broker.request('/same', { headers: { authorization: 'a' } }), broker.request('/same', { headers: { authorization: 'b' } }),
        broker.request('/different', { key: 'shared-label' }), broker.request('/other', { key: 'shared-label' })];
    assert.equal(calls, 6, 'dedup isolates provider, headers and URLs even with an explicit label');
    pending.resolve(); await Promise.all(requests);
    assert.equal(broker.inFlight.size, 0);
}

for (const stalledBody of [false, true]) {
    let calls = 0;
    const broker = new MyTezosRequestBroker({ limits: { default: 1 }, fetchImpl: () => {
        if (++calls > 1) return Promise.resolve(response(2));
        return stalledBody ? Promise.resolve({ ok: true, json: () => new Promise(() => {}) }) : new Promise(() => {});
    } });
    const stuck = broker.request('/stuck', { timeoutMs: 20, totalTimeoutMs: 40, retries: 0 });
    const queued = broker.request('/next', { retries: 0 });
    await assert.rejects(stuck, { name: 'TimeoutError' });
    assert.equal(await queued, 2, 'deadline frees the provider slot for queued work');
    await Promise.resolve(); await Promise.resolve();
    assert.equal(broker.active.get('default'), 0);
}

{
    let calls = 0;
    const broker = new MyTezosRequestBroker({ fetchImpl: async () => { calls++; return new Response('', { status: 429, headers: { 'retry-after': '1000000' } }); } });
    await assert.rejects(broker.request('/budget', { totalTimeoutMs: 25, retries: 5 }), { name: 'TimeoutError' });
    assert.equal(calls, 1, 'total budget aborts a retry wait without starting more work');
    assert.equal(broker.inFlight.size, 0);
    broker.setPaused(true);
    const queued = broker.request('/paused', { timeoutMs: 10, totalTimeoutMs: 20, retries: 0 });
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(calls, 1, 'paused time does not dispatch or consume the active request budget');
    broker.fetchImpl = async () => response(3);
    broker.setPaused(false);
    assert.equal(await queued, 3);
}

await assert.rejects(withRequestDeadline(() => new Promise(() => {}), { timeoutMs: 10 }), { name: 'TimeoutError' });
console.log('ok - source validation, honest cache observations, request identities, body deadlines and finite provider budgets');
