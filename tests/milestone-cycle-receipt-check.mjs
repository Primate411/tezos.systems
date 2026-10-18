import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { exactCycleMilestoneMoment, fetchJson, milestoneRefreshCadence } from '../scripts/generate-milestone-catalog.mjs';
import { MILESTONE_MOMENT_TTL_MS } from '../js/features/milestone-lifecycle.mjs';
import { SCHEDULED_REFRESH_LANES } from '../scripts/lib/scheduled-refresh-lanes.mjs';
import { runRefreshLanes } from '../scripts/lib/scheduled-refresh-runner.mjs';

const now = Date.parse('2026-10-18T12:00:00Z');
const generatedAt = '2026-10-01T00:00:00Z';
const catalogAge = hours => Date.parse(generatedAt) + hours * 3600000;
const existing = { generatedAt, generatedAtCommitCount: 900 };
assert.equal(milestoneRefreshCadence(existing, { now: catalogAge(328), commitCount: 999 }).due, false);
assert.equal(milestoneRefreshCadence(existing, { now: catalogAge(327.99), commitCount: 999, beforeNextSchedule: true }).due, false);
assert.equal(milestoneRefreshCadence(existing, { now: catalogAge(328), commitCount: 999, beforeNextSchedule: true }).due, true);
assert.equal(milestoneRefreshCadence(existing, { now: catalogAge(336), commitCount: 999 }).due, true);
assert.equal(milestoneRefreshCadence(existing, { now: catalogAge(1), commitCount: 1000 }).due, true);
const geometry = { currentCycle: 1302, currentCycleStartLevel: 14203489, blocksPerCycle: 14400 };
const receipt = { level: 14174689, cycle: 1300, timestamp: new Date(now - 3600000).toISOString() };
const transient = () => Object.assign(new Error('HTTP 503'), { exitCode: 75 });
const calls = [];
const fallback = async (base, pathname) => {
  calls.push({ base, pathname });
  if (!base.includes('tzkt')) throw transient();
  return receipt;
};
const moment = await exactCycleMilestoneMoment(geometry, [1250, 1300, 1400], now, fallback);
assert.equal(moment.createdAt, now - 3600000);
assert.equal(moment.expiresAt, moment.createdAt + MILESTONE_MOMENT_TTL_MS);
assert.deepEqual(calls.map(c => c.pathname), ['/chains/main/blocks/14174689/header', '/chains/main/blocks/14174689/header', '/blocks/14174689']);
assert.deepEqual(calls.map(c => c.base), ['https://eu.rpc.tez.capital', 'https://tezos-mainnet.octez.io', 'https://api.tzkt.io/v1']);
let count = 0;
await exactCycleMilestoneMoment(geometry, [1300], now, async () => { count++; return receipt; });
assert.equal(count, 1, 'a valid primary receipt does not fetch more sources');
assert.equal(await exactCycleMilestoneMoment(geometry, [1300], now, async () => ({ ...receipt, timestamp: new Date(now - MILESTONE_MOMENT_TTL_MS).toISOString() })), null, 'expired exact receipts stay expired');
assert.equal(await exactCycleMilestoneMoment(geometry, [1400], now, async () => { throw new Error('must not fetch'); }), null);
for (const invalid of [{ level: 1 }, { timestamp: 'invalid' }, { timestamp: new Date(now + 1).toISOString() }]) {
  let attempts = 0;
  const recovered = await exactCycleMilestoneMoment(geometry, [1300], now, async () => ++attempts < 3 ? { ...receipt, ...invalid } : receipt);
  assert.equal(attempts, 3);
  assert.equal(recovered.createdAt, moment.createdAt);
}
await assert.rejects(exactCycleMilestoneMoment(geometry, [1300], now, async base => {
  if (!base.includes('tzkt')) throw transient();
  return { ...receipt, cycle: 1299 };
}), error => error.exitCode === 75 && /Invalid exact cycle receipt/.test(error.message));
await assert.rejects(exactCycleMilestoneMoment(geometry, [1300], now, async () => ({ ...receipt, level: 1 })), error => error.exitCode === 1);
const originalFetch = globalThis.fetch;
try {
  for (const status of [429, 503, 404]) {
    globalThis.fetch = async () => ({ ok: false, status });
    await assert.rejects(fetchJson('https://example.invalid', '/header'), error => error.exitCode === (status === 404 ? 1 : 75));
  }
  globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
  await assert.rejects(fetchJson('https://example.invalid', '/header'), error => error.exitCode === 75);
  globalThis.fetch = async () => ({ ok: true, json: async () => { throw new SyntaxError('bad JSON'); } });
  await assert.rejects(fetchJson('https://example.invalid', '/header'), error => error.exitCode !== 75);
} finally { globalThis.fetch = originalFetch; }

// Exercise the production lane's rollback and deferred retry with the actual
// receipt failure, including byte-for-byte preservation of its original clock.
const lane = SCHEDULED_REFRESH_LANES.find(lane => lane.id === 'milestones');
assert.equal(lane.retryTransient, true);
assert.deepEqual(lane.refresh[0].args, ['--before-next-schedule', '--project-next-commit']);
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'milestone-receipt-'));
try {
  const generator = fileURLToPath(new URL('../scripts/generate-milestone-catalog.mjs', import.meta.url));
  const catalog = fileURLToPath(new URL('../data/milestone-catalog.json', import.meta.url));
  const originalCatalog = await fs.readFile(catalog);
  const preload = path.join(temp, 'unavailable.mjs');
  await fs.writeFile(preload, 'globalThis.fetch = async () => ({ ok: false, status: 503 });');
  const failedRefresh = spawnSync(process.execPath, ['--import', preload, generator, '--force'], { encoding: 'utf8' });
  assert.equal(failedRefresh.status, 75, 'a required refresh must expose its typed source failure to the lane runner');
  assert.deepEqual(await fs.readFile(catalog), originalCatalog, 'the CLI preserves last-good bytes on source failure');
  const old = '{"generatedAt":"2026-10-01T00:00:00Z","lastGood":true}\n';
  for (const directory of ['workspace', 'published']) {
    await fs.mkdir(path.join(temp, directory, 'data'), { recursive: true });
    await fs.writeFile(path.join(temp, directory, 'data/milestone-catalog.json'), old);
  }
  const report = await runRefreshLanes({ lanes: [lane], workspaceRoot: path.join(temp, 'workspace'), publishRoot: path.join(temp, 'published'), backupRoot: path.join(temp, 'backups'), executeStep: async () => {
    await exactCycleMilestoneMoment(geometry, [1300], now, async () => { throw transient(); });
  } });
  assert.equal(report.summary.failed, 1);
  assert.equal(report.lanes[0].attempts.length, 2);
  for (const directory of ['workspace', 'published']) assert.equal(await fs.readFile(path.join(temp, directory, 'data/milestone-catalog.json'), 'utf8'), old);
} finally { await fs.rm(temp, { recursive: true, force: true }); }
console.log('ok - exact cycle receipts survive RPC outages, reject invalid history, preserve expiry, and retain last-good bytes on persistent failure');
