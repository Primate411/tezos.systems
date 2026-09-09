import assert from 'node:assert/strict';
import { fetchNftPulse } from '../js/core/objkt-sales.mjs';

const now = Date.parse('2026-09-08T12:00:00Z');
const top = { id: '9999', price_xtz: '10000000000', timestamp: '2026-09-08T11:00:00Z', token: { name: 'Top sale' } };
const response = data => ({ ok: true, json: async () => ({ data }) });
const rows = (count, start = 2000n) => Array.from({ length: count }, (_, i) => ({ id: String(start - BigInt(i)) }));

for (const count of [0, 49, 499, 500, 501, 925, 1500]) {
  const all = rows(count, 9007199254745000n);
  const calls = [];
  const result = await fetchNftPulse({ now, pageDelayMs: 0, fetchImpl: async (url, options) => {
    const { variables } = JSON.parse(options.body);
    calls.push(variables);
    assert.deepEqual(variables.window, { timestamp: { _gte: '2026-09-07T12:00:00.000Z', _lt: '2026-09-08T12:00:00.000Z' } });
    assert.deepEqual(variables.where.timestamp, variables.window.timestamp);
    const cursor = variables.where.id?._lt;
    assert.equal(variables.includeTop, calls.length === 1);
    const recent = all.filter(row => !cursor || BigInt(row.id) < BigInt(cursor)).slice(0, variables.limit);
    return response({ recent, ...(variables.includeTop ? { top: count ? [top] : [] } : {}) });
  } });
  assert.equal(result.count, count, 'count every sale, including multiple full pages and large IDs');
  assert.equal(calls.length, Math.floor(count / 500) + 1, 'exact multiples require terminal exhaustion');
  assert.equal(result.top?.priceXtz ?? null, count ? 10000 : null, 'keep the window-wide top sale from page one');
}

for (const failure of ['http', 'graphql', 'missing', 'duplicate', 'out-of-order', 'unsafe-id', 'throw']) {
  let page = 0;
  const result = await fetchNftPulse({ now, pageDelayMs: 0, fetchImpl: async () => {
    if (page++ === 0) return response({ recent: rows(500), top: [top] });
    if (failure === 'http') return { ok: false };
    if (failure === 'graphql') return { ok: true, json: async () => ({ errors: [{ message: 'unavailable' }], data: { recent: [] } }) };
    if (failure === 'missing') return response({});
    if (failure === 'duplicate') return response({ recent: rows(500) });
    if (failure === 'out-of-order') return response({ recent: [{ id: '1400' }, { id: '1401' }] });
    if (failure === 'unsafe-id') return response({ recent: [{ id: Number.MAX_SAFE_INTEGER + 1 }] });
    throw new Error('offline');
  } });
  assert.equal(result, null, `${failure}: partial results must never become a count`);
  assert.equal(page, 2, `${failure}: stop immediately rather than loop or double-count`);
}

let visible = true, calls = 0;
assert.equal(await fetchNftPulse({ now, pageDelayMs: 0, shouldContinue: () => visible, fetchImpl: async () => {
  calls++;
  visible = false;
  return response({ recent: rows(500), top: [] });
} }), null);
assert.equal(calls, 1, 'do not request subsequent pages in a hidden tab');

let aborted = false;
assert.equal(await fetchNftPulse({ now, timeoutMs: 5, fetchImpl: async (url, { signal }) => new Promise((resolve, reject) => {
  signal.addEventListener('abort', () => { aborted = true; reject(new Error('timeout')); }, { once: true });
}) }), null);
assert(aborted, 'deadline aborts the actual network request');

console.log('ok - complete OBJKT pagination, fixed window, terminal exhaustion, large IDs, top sale, failures, visibility and abort');
