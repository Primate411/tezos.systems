#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const { GLOBAL_HISTORY_INTERVAL_MS, globalHistoryCollectionDue } = require('../.github/scripts/global-history-cadence.js');
const now = Date.parse('2026-09-24T18:00:00Z');
const options = { supabaseUrl: 'https://example.supabase.co/', supabaseKey: 'test-key', now: () => now };
const receipt = timestamp => Response.json(timestamp === null ? [] : [{ timestamp }]);

for (const [timestamp, due] of [
  [null, true],
  ['2026-09-24T17:59:59Z', false],
  ['2026-09-24T16:00:00.001Z', false],
  ['2026-09-24T16:00:00Z', true],
  ['2026-09-24T12:00:00Z', true]
]) {
  const result = await globalHistoryCollectionDue({ ...options, fetchImpl: async (url, init) => {
    const query = new URL(url);
    assert.equal(query.pathname, '/rest/v1/tezos_history');
    assert.equal(query.searchParams.get('select'), 'timestamp');
    assert.equal(query.searchParams.get('order'), 'timestamp.desc');
    assert.equal(query.searchParams.get('limit'), '1');
    assert.equal(init.headers.apikey, 'test-key');
    assert.ok(init.signal instanceof AbortSignal);
    return receipt(timestamp);
  } });
  assert.deepEqual(result, { due, latest: timestamp });
}
assert.equal(GLOBAL_HISTORY_INTERVAL_MS, 2 * 60 * 60 * 1000);

for (const body of [{}, [{ timestamp: null }], [{ timestamp: 'invalid' }], [{ timestamp: '2026-09-25T00:00:00Z' }], [{}, {}]]) {
  let calls = 0;
  await assert.rejects(globalHistoryCollectionDue({ ...options, fetchImpl: async () => {
    calls += 1;
    return Response.json(body);
  } }), /invalid/);
  assert.equal(calls, 1, 'invalid receipts must fail instead of silently skipping or collecting');
}
await assert.rejects(globalHistoryCollectionDue({ ...options, fetchImpl: async () => new Response('not json') }), SyntaxError);
await assert.rejects(globalHistoryCollectionDue({ ...options, supabaseKey: '' }), /credentials/);

for (const status of [401, 403, 404]) {
  let calls = 0;
  await assert.rejects(globalHistoryCollectionDue({ ...options, fetchImpl: async () => {
    calls += 1;
    return new Response('', { status });
  } }), error => error.retriable === false && error.message.includes(String(status)));
  assert.equal(calls, 1);
}
for (const failure of [() => new Response('', { status: 503 }), () => new Response('', { status: 429 }), () => { throw new TypeError('fetch failed'); }]) {
  let calls = 0;
  const delays = [];
  await assert.rejects(globalHistoryCollectionDue({ ...options,
    wait: async ms => delays.push(ms), fetchImpl: async () => { calls += 1; return failure(); }
  }), error => error.retriable === true);
  assert.equal(calls, 3);
  assert.deepEqual(delays, [2000, 4000]);
}
{
  let calls = 0;
  const result = await globalHistoryCollectionDue({ ...options, wait: async () => {}, fetchImpl: async () => {
    calls += 1;
    return calls === 1 ? new Response('', { status: 503 }) : receipt('2026-09-24T17:00:00Z');
  } });
  assert.equal(calls, 2);
  assert.equal(result.due, false);
}

// Execute the real collector in isolation: a recent row must stop all upstream
// work; an overdue row must reach the existing collection/write path exactly once.
const source = await readFile(new URL('../.github/scripts/collect-data.js', import.meta.url), 'utf8');
for (const { due, error, exitCode } of [
  { due: false },
  { due: true },
  { due: false, error: Object.assign(new Error('temporary read failure'), { retriable: true }), exitCode: 75 },
  { due: false, error: new Error('invalid receipt'), exitCode: 1 }
]) {
  let cadenceReads = 0;
  let writes = 0;
  const calls = [];
  const processStub = { env: { SUPABASE_URL: options.supabaseUrl, SUPABASE_KEY: options.supabaseKey }, exit: code => { throw new Error(`exit ${code}`); } };
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} }, process: processStub, Date, setTimeout,
    require: file => {
      if (file === './global-history-cadence.js') return { globalHistoryCollectionDue: async () => {
        cadenceReads += 1;
        assert.equal(calls.length, 0, 'cadence must be checked before any source request');
        if (error) throw error;
        return { due, latest: '2026-09-24T17:00:00Z' };
      } };
      if (file === './supabase-write.js') return { TEMPORARY_FAILURE_EXIT_CODE: 75, postSupabaseJson: async ({ payload }) => {
        writes += 1;
        assert.equal(payload.total_supply, 1000000000);
        assert.equal(payload.total_bakers, 1);
        assert.ok(Number.isFinite(Date.parse(payload.timestamp)));
      } };
      throw new Error(`Unexpected module ${file}`);
    },
    fetch: async url => {
      calls.push(url);
      if (url.endsWith('/issuance/current_yearly_rate')) return Response.json('1.5');
      if (url.endsWith('/total_supply')) return Response.json('1000000000000000');
      if (url.endsWith('/total_frozen_stake')) return Response.json('500000000000000');
      if (url.endsWith('/constants')) return Response.json({ minimal_block_delay: 6, liquidity_baking_subsidy: '5000000' });
      if (url.endsWith('/metadata')) return Response.json({ level_info: { cycle: 1 } });
      if (url.includes('/delegates?')) return Response.json([{ consensusAddress: 'tz4-test', bakingPower: 500000000000000 }]);
      if (url.endsWith('/statistics/current')) return Response.json({ totalOwnStaked: 500000000000000, totalBurned: 1000000 });
      if (url.includes('/blocks?')) return Response.json([{ level: 100, lbToggleEma: 0 }]);
      if (url.endsWith('/head')) return Response.json({ level: 100000 });
      if (url.includes('/count')) return Response.json(10);
      throw new Error(`Unexpected source ${url}`);
    }
  });
  await vm.runInContext(source, context);
  assert.equal(processStub.exitCode, exitCode);
  assert.equal(cadenceReads, 1);
  assert.equal(writes, due ? 1 : 0);
  assert.equal(calls.length > 0, due);
}

console.log('ok - global history cadence preserves two-hour samples, catches up overdue data, and rejects failed receipts');
