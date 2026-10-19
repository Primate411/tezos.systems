import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fetchFundingJson } from '../scripts/lib/community-funding-fetch.mjs';
import { SCHEDULED_REFRESH_LANES } from '../scripts/lib/scheduled-refresh-lanes.mjs';
import { runRefreshLanes } from '../scripts/lib/scheduled-refresh-runner.mjs';
import { temporaryFailedLanes } from '../scripts/lib/actions-recovery.mjs';

const url = 'https://example.invalid/catalog';
const quiet = { sleep: async () => {}, warn: () => {} };
for (const status of [429, 500, 502, 503, 504]) {
    let calls = 0;
    const delays = [];
    const result = await fetchFundingJson(url, { ...quiet, sleep: async ms => delays.push(ms), request: async () => {
        calls++;
        return calls < 3 ? new Response('unavailable', { status }) : Response.json({ complete: true });
    } });
    assert.deepEqual(result, { complete: true });
    assert.equal(calls, 3);
    assert.deepEqual(delays, [2000, 4000]);
}
for (const failure of [() => new TypeError('fetch failed'), () => new TypeError('terminated'),
    () => new DOMException('timeout', 'TimeoutError'), () => new DOMException('aborted', 'AbortError')]) {
    let calls = 0;
    await assert.rejects(fetchFundingJson(url, { ...quiet, request: async () => { calls++; throw failure(); } }), e => e.exitCode === 75);
    assert.equal(calls, 3);
}
for (const response of [() => new Response('missing', { status: 404 }), () => new Response('invalid JSON'),
    () => new Response('x'.repeat(4 * 1024 * 1024 + 1))]) {
    let calls = 0;
    await assert.rejects(fetchFundingJson(url, { ...quiet, request: async () => { calls++; return response(); } }), e => e.exitCode !== 75);
    assert.equal(calls, 1, 'hard errors are not retryable outages');
}
const now = Date.parse('2026-10-19T12:00:00Z');
for (const retryAfter of ['7', new Date(now + 7000).toUTCString()]) {
    let calls = 0;
    const delays = [];
    await fetchFundingJson(url, { ...quiet, now: () => now, sleep: async ms => delays.push(ms), request: async () => {
        calls++;
        return calls === 1 ? new Response('', { status: 429, headers: { 'Retry-After': retryAfter } }) : Response.json([]);
    } });
    assert.deepEqual(delays, [7000]);
}
let calls = 0;
await assert.rejects(fetchFundingJson(url, { ...quiet, request: async () => {
    calls++; return new Response('', { status: 503, headers: { 'Retry-After': '120' } });
} }), e => e.exitCode === 1 && /Retry-After/.test(e.message));
assert.equal(calls, 1, 'long provider cooldowns cannot be cut short by deferred recovery');
let cancelled = 0;
await assert.rejects(fetchFundingJson(url, { ...quiet, request: async () => ({ ok: true, body: { getReader: () => ({
    read: async () => { throw new DOMException('body timed out', 'TimeoutError'); }, cancel: async () => { cancelled++; }
}) } }) }), e => e.exitCode === 75);
assert.equal(cancelled, 3, 'a failed body is cancelled before retrying');

const lanes = SCHEDULED_REFRESH_LANES.filter(lane => lane.id.startsWith('community-funding-'));
assert.equal(lanes.length, 3);
assert(lanes.every(lane => lane.retryTransient === true));
const lane = lanes.find(lane => lane.id === 'community-funding-ttcrowd');
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'funding-recovery-'));
try {
    const root = fileURLToPath(new URL('../', import.meta.url));
    const before = await Promise.all(lane.targets.map(file => fs.readFile(path.join(root, file))));
    const preload = path.join(temp, 'unavailable.mjs');
    // Accelerate only the two production backoffs in this isolated CLI fixture.
    await fs.writeFile(preload, `const realSetTimeout = globalThis.setTimeout;
      globalThis.setTimeout = (fn, ms, ...args) => realSetTimeout(fn, [2000, 4000].includes(ms) ? 0 : ms, ...args);
      globalThis.fetch = async () => new Response('unavailable', { status: 503 });`);
    const child = spawnSync(process.execPath, ['--import', preload, path.join(root, 'scripts/refresh-community-funding.mjs'), '--source=ttcrowd'], { encoding: 'utf8' });
    assert.equal(child.status, 75, child.stderr);
    assert.match(child.stderr, /retry 2\/3/);
    assert.match(child.stderr, /retry 3\/3/);
    for (const [i, file] of lane.targets.entries()) assert.deepEqual(await fs.readFile(path.join(root, file)), before[i]);

    const old = '{"generatedAt":"2026-10-01T00:00:00Z","lastGood":true}\n';
    for (const directory of ['workspace', 'published']) {
        await fs.mkdir(path.join(temp, directory, 'data'), { recursive: true });
        for (const file of lane.targets) await fs.writeFile(path.join(temp, directory, file), old);
    }
    const report = await runRefreshLanes({ lanes: [lane], workspaceRoot: path.join(temp, 'workspace'), publishRoot: path.join(temp, 'published'), backupRoot: path.join(temp, 'backups'), executeStep: async () => {
        await fetchFundingJson(url, { ...quiet, request: async () => new Response('', { status: 503 }) });
    } });
    assert.equal(report.summary.failed, 1);
    assert.equal(report.lanes[0].attempts.length, 2);
    assert.deepEqual(temporaryFailedLanes(report), [lane.id], 'the real failure report must qualify for bounded supervisor recovery');
    for (const directory of ['workspace', 'published']) for (const file of lane.targets) {
        assert.equal(await fs.readFile(path.join(temp, directory, file), 'utf8'), old, 'persistent failures preserve both source and preview clocks');
    }
} finally { await fs.rm(temp, { recursive: true, force: true }); }
console.log('ok - funding recovery: bounded transport retries, Retry-After, hard validation failures, CLI exit status, supervisor eligibility and last-good source/preview preservation');
