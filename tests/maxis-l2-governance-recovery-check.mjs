import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fetchL2GovernanceJson } from '../scripts/lib/maxis-l2-governance-fetch.mjs';
import { fetchOfficialEtherlinkGovernancePeriods } from '../scripts/refresh-maxis-l2-governance.mjs';
import { SCHEDULED_REFRESH_LANES } from '../scripts/lib/scheduled-refresh-lanes.mjs';
import { runRefreshLanes } from '../scripts/lib/scheduled-refresh-runner.mjs';
import { temporaryFailedLanes } from '../scripts/lib/actions-recovery.mjs';

const url = 'https://example.invalid/periods';
const quiet = { sleep: async () => {}, warn: () => {} };
for (const status of [429, 500, 502, 503, 504]) {
  let calls = 0;
  const delays = [];
  assert.deepEqual(await fetchL2GovernanceJson(url, { ...quiet, sleep: async ms => delays.push(ms), request: async () => {
    calls++;
    return calls < 4 ? new Response('', { status }) : Response.json({ pastPeriods: [] });
  } }), { pastPeriods: [] });
  assert.equal(calls, 4);
  assert.deepEqual(delays, [2000, 4000, 8000]);
}
for (const failure of [() => new TypeError('fetch failed'), () => new TypeError('terminated'),
  () => new DOMException('timed out', 'TimeoutError'), () => new DOMException('aborted', 'AbortError')]) {
  let calls = 0;
  await assert.rejects(fetchL2GovernanceJson(url, { ...quiet, request: async () => { calls++; throw failure(); } }), e => e.exitCode === 75);
  assert.equal(calls, 4);
}
for (const response of [() => new Response('', { status: 404 }), () => new Response('invalid json')]) {
  let calls = 0;
  await assert.rejects(fetchL2GovernanceJson(url, { ...quiet, request: async () => { calls++; return response(); } }), e => e.exitCode !== 75);
  assert.equal(calls, 1);
}
const now = Date.parse('2026-10-20T13:00:00Z');
for (const value of ['7', new Date(now + 7000).toUTCString()]) {
  let calls = 0;
  const delays = [];
  await fetchL2GovernanceJson(url, { ...quiet, now: () => now, sleep: async ms => delays.push(ms), request: async () => {
    calls++; return calls === 1 ? new Response('', { status: 429, headers: { 'Retry-After': value } }) : Response.json([]);
  } });
  assert.deepEqual(delays, [7000]);
}
let calls = 0;
await assert.rejects(fetchL2GovernanceJson(url, { ...quiet, request: async () => {
  calls++; return new Response('', { status: 503, headers: { 'Retry-After': '120' } });
} }), e => e.exitCode === 1 && /Retry-After/.test(e.message));
assert.equal(calls, 1, 'deferred recovery cannot shorten long provider cooldowns');
// Exercise a response body stalled until the production request signal expires.
const keepAlive = setInterval(() => {}, 1000);
try {
  calls = 0;
  await assert.rejects(fetchL2GovernanceJson(url, { ...quiet, timeoutMs: 5, request: async (_, { signal }) => {
    calls++;
    return { ok: true, json: () => new Promise((resolve, reject) => {
      if (signal.aborted) reject(signal.reason);
      else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }) };
  } }), e => e.exitCode === 75);
  assert.equal(calls, 4);
} finally { clearInterval(keepAlive); }
const originalFetch = globalThis.fetch;
try {
  const tracks = [];
  globalThis.fetch = async url => { tracks.push(url); return Response.json({ pastPeriods: [] }); };
  const result = await fetchOfficialEtherlinkGovernancePeriods();
  assert.deepEqual(tracks.map(url => url.split('/').at(-2)), ['fast', 'slow', 'sequencer']);
  assert.equal(result.receipt.trackReceipts.length, 3);
  globalThis.fetch = async () => Response.json({ incomplete: true });
  await assert.rejects(fetchOfficialEtherlinkGovernancePeriods(), e => e.exitCode !== 75 && /response is invalid/.test(e.message));
} finally { globalThis.fetch = originalFetch; }

const lane = SCHEDULED_REFRESH_LANES.find(lane => lane.id === 'maxis-l2-governance');
assert.equal(lane.retryTransient, true);
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'l2-governance-recovery-'));
try {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const preload = path.join(temp, 'unavailable.mjs');
  const output = path.join(temp, 'last-good.json');
  const old = '{"generatedAt":"2026-10-01T00:00:00Z","lastGood":true}\n';
  await fs.writeFile(output, old);
  for (const [response, code] of [["new Response('', { status: 500 })", 75], ["new Response('bad json')", 1]]) {
    await fs.writeFile(preload, `const realSetTimeout = globalThis.setTimeout;
      globalThis.setTimeout = (fn, ms, ...args) => realSetTimeout(fn, [2000, 4000, 8000].includes(ms) ? 0 : ms, ...args);
      globalThis.fetch = async () => ${response};`);
    const child = spawnSync(process.execPath, ['--import', preload, path.join(root, 'scripts/refresh-maxis-l2-governance.mjs'), '--output', output], { encoding: 'utf8', timeout: 15000 });
    assert.equal(child.status, code, child.stderr);
    assert.equal(await fs.readFile(output, 'utf8'), old, 'failed CLI preserves the last-good receipt clock');
  }
  for (const directory of ['workspace', 'published']) for (const file of lane.targets) {
    await fs.mkdir(path.dirname(path.join(temp, directory, file)), { recursive: true });
    await fs.writeFile(path.join(temp, directory, file), old);
  }
  const options = { lanes: [lane], workspaceRoot: path.join(temp, 'workspace'), publishRoot: path.join(temp, 'published'), backupRoot: path.join(temp, 'backups') };
  const report = await runRefreshLanes({ ...options, executeStep: async () => {
    // Prove rollback as well as transport classification, including the preview.
    for (const file of lane.targets) await fs.writeFile(path.join(temp, 'workspace', file), 'partial');
    await fetchL2GovernanceJson(url, { ...quiet, request: async () => new Response('', { status: 500 }) });
  } });
  assert.equal(report.summary.failed, 1);
  assert.equal(report.lanes[0].attempts.length, 2);
  assert.deepEqual(temporaryFailedLanes(report), [lane.id]);
  for (const directory of ['workspace', 'published']) for (const file of lane.targets) {
    assert.equal(await fs.readFile(path.join(temp, directory, file), 'utf8'), old);
  }
  const hard = await runRefreshLanes({ ...options, executeStep: async () => { throw new Error('incomplete history'); } });
  assert.equal(hard.lanes[0].attempts.length, 1);
  assert.deepEqual(temporaryFailedLanes(hard), []);
  let attempts = 0;
  const recovered = await runRefreshLanes({ ...options, executeStep: async step => {
    if (step.script === lane.refresh[0].script && ++attempts === 1) throw Object.assign(new Error('HTTP 500'), { exitCode: 75 });
  } });
  assert.equal(recovered.summary.failed, 0);
  assert.equal(recovered.lanes[0].recovered, true);
} finally { await fs.rm(temp, { recursive: true, force: true }); }
console.log('ok - L2 governance recovery: bounded transport retries, body deadlines, complete track receipts, hard validation failures, CLI exit status, deferred recovery and last-good rollback');
