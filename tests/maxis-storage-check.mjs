import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  storedPassportText, readStoredPassport, passportDigest,
  measureSeasonArtifactBudget, artifactBudgetErrors, MAXIS_PASSPORT_STORAGE
} from '../scripts/lib/maxis-storage.mjs';
import { maxisImplementationHash } from '../scripts/refresh-maxis-data.mjs';

const manifest = JSON.parse(await fs.readFile('data/maxis/manifest.json', 'utf8'));
for (const entry of manifest.seasons) {
  const directory = `data/maxis/seasons/${entry.id}`;
  const summary = JSON.parse(await fs.readFile(`${directory}/summary.json`, 'utf8'));
  const rules = JSON.parse(await fs.readFile(`${directory}/rules.json`, 'utf8'));
  const transactionState = JSON.parse(await fs.readFile(`${directory}/transaction-state.json`, 'utf8'));
  const stored = new Map();
  let addresses = 0, actualBytes = 0;
  for (const shard of entry.availableShards) {
    const path = `${directory}/passports/${shard}.json`;
    const raw = await fs.readFile(path, 'utf8');
    const decoded = await readStoredPassport(raw, path);
    assert.equal(passportDigest(decoded.text), summary.passports.shardHashes[shard], 'every decoded record retains its source receipt');
    assert.equal((await readStoredPassport(storedPassportText(decoded.value), path)).text, decoded.text, 'storage round trip preserves exact source bytes');
    if (summary.passports.storage) assert.equal(raw, storedPassportText(decoded.value), 'canonical stored bytes');
    addresses += Object.keys(decoded.value.passports).length;
    actualBytes += Buffer.byteLength(raw);
    stored.set(shard, JSON.parse(raw));
  }
  assert.equal(addresses, summary.passports.indexedAddresses);
  const receipt = measureSeasonArtifactBudget({ rules, summary, transactionState, shardPayloads: stored });
  assert.equal(receipt.passportShardsBytes, actualBytes, 'budget measures bytes on disk');
  assert.deepEqual(receipt, summary.artifactBudget);
  assert.deepEqual(artifactBudgetErrors(receipt), []);
  assert.equal(await maxisImplementationHash(rules.evaluatorVersion), rules.evaluatorImplementationHash, 'frozen evaluator receipt is unchanged');
}

const sample = { schema: 2, seasonId: 'test-season', shard: '00', passports: { wallet: { rank: 1, badges: ['earned'], zero: 0, missing: null, label: 'ꜩ' } } };
const path = 'data/maxis/seasons/test-season/passports/00.json';
const encoded = storedPassportText(sample);
const bad = JSON.parse(encoded);
bad.source.sha256 = '0'.repeat(64);
await assert.rejects(() => readStoredPassport(JSON.stringify(bad), path), /SHA-256 mismatch/);
await assert.rejects(() => readStoredPassport(encoded, path.replace('test-season', 'wrong-season')), /source identity/);
const unknown = JSON.parse(encoded); unknown.transport = 'future';
await assert.rejects(() => readStoredPassport(JSON.stringify(unknown), path), /unsupported version/);

const options = { rules: {}, summary: { passports: { storage: MAXIS_PASSPORT_STORAGE } }, transactionState: { status: 'complete' }, shardPayloads: new Map([['00', sample]]) };
const valid = measureSeasonArtifactBudget(options);
for (const [limit, value] of [['passportShardBytes', valid.maxShard.bytes - 1], ['seasonArtifactBytes', valid.totalBytes - 1], ['transactionStateBytes', valid.transactionStateBytes - 1]]) {
  const failed = measureSeasonArtifactBudget({ ...options, limits: { ...valid.limits, [limit]: value } });
  assert.equal(failed.withinBudget, false, `${limit} remains enforced`);
  assert(artifactBudgetErrors(failed).length);
}
assert(artifactBudgetErrors(measureSeasonArtifactBudget({ ...options, transactionState: { status: 'building' } })).length, 'incomplete source remains a failure');

// The storage exception must not silently exempt any scoring/source adapter.
const archived = JSON.parse(await fs.readFile('scripts/lib/maxis-storage-legacy-v2.json', 'utf8'));
assert.deepEqual(Object.keys(archived), ['writePassportShards', 'readPassportShards', 'buildSeasonSummary']);
const generator = await fs.readFile('scripts/refresh-maxis-data.mjs', 'utf8');
const summaryAdapter = generator.match(/^function buildSeasonSummary\([^]*?^\}$/m)?.[0];
assert.equal(summaryAdapter?.replace('      storage: MAXIS_PASSPORT_STORAGE,\n', ''), archived.buildSeasonSummary,
  'the summary adapter exception permits only the storage declaration, never ranking or receipt changes');
const probe = new URL(`../scripts/.maxis-storage-hash-probe-${process.pid}.mjs`, import.meta.url);
try {
  await fs.writeFile(probe, generator.replace('function compactRank(row) {', 'function compactRank(row) { /* changed scoring adapter */'));
  const changed = await import(probe.href);
  assert.notEqual(await changed.maxisImplementationHash(), await maxisImplementationHash(), 'scoring adapter drift still invalidates the evaluator');
} finally { await fs.unlink(probe).catch(() => {}); }
console.log('ok - Maxis storage preserves every Passport, enforces physical limits, rejects corruption, and retains frozen scoring checks');
