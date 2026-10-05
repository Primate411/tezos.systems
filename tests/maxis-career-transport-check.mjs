import assert from 'node:assert/strict';
import { fetchGovernanceCareerJson, fetchCompleteTzktCollection } from '../scripts/refresh-maxis-careers.mjs';
import { SCHEDULED_REFRESH_LANES } from '../scripts/lib/scheduled-refresh-lanes.mjs';

const temporary = error => error.code === 'MAXIS_CAREER_TZKT_TRANSIENT';
const delays = [];
const calls = [];
const replies = [new Response('', { status: 504 }), new Response('', { status: 429, headers: { 'retry-after': '7' } }), Response.json([{ id: 3 }])];
assert.deepEqual(await fetchGovernanceCareerJson('/operations/ballots', { offset: '2', limit: '1' }, {
  fetchImpl: async (url, options) => { calls.push(url); assert(options.signal instanceof AbortSignal); return replies.shift(); },
  wait: async ms => delays.push(ms)
}), [{ id: 3 }]);
assert.equal(new Set(calls).size, 1, 'retry the exact failed page, preserving every query parameter');
assert.deepEqual(delays, [2000, 7000]);
for (const status of [400, 401, 403, 404]) {
  let attempts = 0;
  await assert.rejects(fetchGovernanceCareerJson('/head', {}, {
    fetchImpl: async () => { attempts += 1; return new Response('', { status }); }
  }), error => !temporary(error));
  assert.equal(attempts, 1, 'hard HTTP failures must not be retried');
}
let attempts = 0;
await assert.rejects(fetchGovernanceCareerJson('/head', {}, {
  fetchImpl: async () => { attempts += 1; return new Response('', { status: 503 }); }, wait: async () => {}
}), temporary);
assert.equal(attempts, 3, 'persistent outages must become a bounded deferred-lane failure');
await assert.rejects(fetchGovernanceCareerJson('/head', {}, {
  fetchImpl: async () => new Response('invalid json')
}), error => error instanceof SyntaxError && !temporary(error));
await assert.rejects(fetchGovernanceCareerJson('/head', {}, {
  fetchImpl: async () => new Response('', { status: 429, headers: { 'retry-after': '120' } }),
  wait: async () => assert.fail('long provider cooldown must stop this run, never retry early')
}), error => error.code === 'MAXIS_CAREER_TZKT_COOLDOWN');
for (const failure of [new TypeError('network failure'), new DOMException('timeout', 'TimeoutError')]) {
  let attempts = 0;
  assert.deepEqual(await fetchGovernanceCareerJson('/head', {}, {
    fetchImpl: async () => { if (++attempts === 1) throw failure; return Response.json({ level: 42 }); }, wait: async () => {}
  }), { level: 42 });
}

const originalFetch = globalThis.fetch;
try {
  const offsets = [];
  globalThis.fetch = async url => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/count')) return Response.json(2001);
    assert.equal(parsed.searchParams.get('limit'), '1000');
    const offset = Number(parsed.searchParams.get('offset'));
    offsets.push(offset);
    return Response.json(Array.from({ length: Math.min(1000, 2001 - offset) }, (_, i) => ({ id: offset + i + 1 })));
  };
  const collection = await fetchCompleteTzktCollection('/operations/ballots', { status: 'applied', 'sort.asc': 'id' }, { orderKey: 'id' });
  assert.deepEqual(offsets, [0, 1000, 2000]);
  assert.equal(collection.rows.length, 2001);
  assert.equal(collection.receipt.complete, true);
  assert.equal(collection.receipt.completionProof, 'count-endpoint-match');
  globalThis.fetch = async url => Response.json(String(url).includes('/count') ? 3 : [{ id: 1 }]);
  await assert.rejects(fetchCompleteTzktCollection('/operations/ballots', {}, { orderKey: 'id' }), /1\/3 counted rows/, 'incomplete collections remain hard failures');
} finally {
  globalThis.fetch = originalFetch;
}
assert.equal(SCHEDULED_REFRESH_LANES.find(lane => lane.id === 'maxis-careers').retryTransient, true);
console.log('ok - governance career requests recover bounded upstream failures while preserving exact pages and count completeness');
