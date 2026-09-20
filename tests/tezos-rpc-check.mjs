import assert from 'node:assert/strict';
import { createTezosRpcPool, isTezosRpcRead, TEZOS_RPC_ENDPOINTS } from '../js/core/tezos-rpc.mjs';
import { loadModule } from './lib/browser-source-vm.mjs';

const [eu, us] = TEZOS_RPC_ENDPOINTS;
const url = `${eu}/chains/main/blocks/BLockPinned/header?metadata=always`;
const json = response => response.json();
const ok = value => Response.json(value);
const defer = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

for (const resource of [url, new URL(url), `${us}/config/history_mode`]) assert.equal(isTezosRpcRead(resource), true);
for (const resource of ['https://eu.rpc.tez.capital.evil.test/a', 'https://rpc.tzkt.io/mainnet/a', '/relative', new Request(url), 'https://user:pass@eu.rpc.tez.capital/a']) {
    assert.equal(isTezosRpcRead(resource), false);
}
for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
    assert.equal(isTezosRpcRead(url, { method }), false, 'writes are never balanced or replayed');
    await assert.rejects(createTezosRpcPool({ fetchImpl: () => assert.fail('write dispatched') })(url, { method }), TypeError);
}

{
    const target = `${eu}/chains/main/blocks/BLockPinned/helpers/scripts/run_script_view`;
    const body = JSON.stringify({ contract: 'KT1view', view: 'get_voting_state', input: { prim: 'Unit' } });
    const calls = [];
    const pool = createTezosRpcPool({ fetchImpl: async (url, options) => {
        calls.push({ url, body: options.body, method: options.method });
        return url.startsWith(eu) ? new Response('', { status: 503 }) : ok({ data: 'view' });
    } });
    assert.deepEqual(await pool(target, { method: 'POST', body }, 1000, json), { data: 'view' });
    assert.deepEqual(calls, [{ url: target, body, method: 'POST' }, { url: target.replace(eu, us), body, method: 'POST' }]);
    assert.equal(isTezosRpcRead(`${eu}/injection/operation`, { method: 'POST', body }), false);
    assert.equal(isTezosRpcRead(target, { method: 'POST', body: new ReadableStream() }), false, 'non-replayable bodies stay out of the pool');
}

{
    const calls = [], pending = [];
    const pool = createTezosRpcPool({ fetchImpl: (target, init) => {
        calls.push({ target, init }); const next = defer(); pending.push(next); return next.promise;
    } });
    const reads = Array.from({ length: 6 }, () => pool(url, { headers: { Accept: 'application/json' }, cache: 'no-store' }, 1000, json));
    assert.deepEqual(calls.map(call => new URL(call.target).origin), [eu, us, eu, us, eu, us]);
    assert.ok(calls.every(call => call.target.endsWith('/chains/main/blocks/BLockPinned/header?metadata=always') && call.init.cache === 'no-store' && call.init.headers.Accept === 'application/json'));
    pending.forEach((next, index) => next.resolve(ok({ index })));
    assert.deepEqual(await Promise.all(reads), Array.from({ length: 6 }, (_, index) => ({ index })));
    assert.equal(calls.length, 6, 'healthy reads never duplicate traffic');
}

for (const failure of ['network', 'json', 403, 404, 429, 503]) {
    const calls = [];
    const pool = createTezosRpcPool({ fetchImpl: async target => {
        calls.push(target);
        if (target.startsWith(us)) return ok({ recovered: true });
        if (failure === 'network') throw new TypeError('offline');
        return failure === 'json' ? new Response('{invalid') : new Response('unavailable', { status: failure });
    } });
    assert.deepEqual(await pool(url, {}, 1000, json), { recovered: true });
    assert.deepEqual(calls, [url, url.replace(eu, us)]);
}

{
    let clock = 0;
    const calls = [];
    const pool = createTezosRpcPool({ now: () => clock, fetchImpl: async target => {
        calls.push(target); if (calls.length === 1) throw new Error('down'); return ok(1);
    } });
    await pool(url, {}, 1000, json);
    await pool(url, {}, 1000, json);
    assert.deepEqual(calls.map(target => new URL(target).origin), [eu, us, us], 'unhealthy host cools down');
    clock = 30_001;
    await pool(url, {}, 1000, json);
    assert.equal(new URL(calls.at(-1)).origin, eu, 'cooled-down host is tried again');
}

for (const phase of ['headers', 'body']) {
    let firstSignal;
    const pool = createTezosRpcPool({ fetchImpl: async (target, { signal }) => {
        if (target.startsWith(us)) return ok('recovered');
        firstSignal = signal;
        return phase === 'headers' ? new Promise(() => {}) : { ok: true, json: () => new Promise(() => {}) };
    } });
    assert.equal(await pool(url, {}, 80, json), 'recovered', `${phase} hang leaves time for failover`);
    assert.equal(firstSignal.aborted, true);
}

{
    const signals = [];
    const pool = createTezosRpcPool({ fetchImpl: async (target, { signal }) => { signals.push(signal); return new Promise(() => {}); } });
    await assert.rejects(pool(url, {}, 80, json), { name: 'TimeoutError' });
    assert.equal(signals.length, 2);
    assert.ok(signals.every(signal => signal.aborted), 'both stalled attempts are cancelled within the total budget');
}

{
    const controller = new AbortController();
    const signals = [];
    const pool = createTezosRpcPool({ fetchImpl: async (target, { signal }) => { signals.push(signal); return new Promise(() => {}); } });
    const pending = pool(url, { signal: controller.signal }, 1000, json);
    controller.abort();
    await assert.rejects(pending, { name: 'AbortError' });
    assert.equal(signals.length, 1, 'caller cancellation never starts failover');
    assert.equal(signals[0].aborted, true);
    await assert.rejects(pool(url, { signal: controller.signal }), { name: 'AbortError' });
    assert.equal(signals.length, 1, 'pre-cancelled callers never dispatch');
}

{
    let calls = 0;
    const pool = createTezosRpcPool({ fetchImpl: async () => { calls++; return new Response('unavailable', { status: 503 }); } });
    const response = await pool(url);
    assert.equal(response.status, 503, 'HTTP errors stay errors when both providers fail');
    assert.equal(calls, 2);
}

{
    const calls = [];
    const api = await loadModule('js/core/api.js', 'fetchWithRetry', {
        API_URLS: { tzkt: 'https://tzkt.test', octez: eu },
        fetch: async target => { calls.push(target); return target.startsWith(eu) ? new Response('', { status: 503 }) : ok({ level: 42 }); }
    });
    assert.equal((await api.fetchWithRetry(url, {}, 1)).level, 42);
    assert.equal((await api.fetchWithRetry(url, {}, 1)).level, 42);
    assert.equal(calls.length, 2, 'failover success retains the logical read cache and existing retry ownership');
}

console.log('ok - Tez Capital read distribution, pinned paths, single-request success, failover, cooldown, body deadlines, cancellation and API caching');
