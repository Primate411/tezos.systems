import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  storedPassportText, readStoredPassport, passportDigest,
  measureSeasonArtifactBudget, artifactBudgetErrors, MAXIS_PASSPORT_STORAGE,
  storedCoreText, MAXIS_STORAGE_MEASUREMENT, MAXIS_LEGACY_STORAGE_MEASUREMENT
} from '../scripts/lib/maxis-storage.mjs';
import { prettyJsonBytes } from '../scripts/lib/maxis-artifact-budget.mjs';
import { createTransactionScanState, serializeTransactionAccumulator, transactionAccumulatorRows } from '../scripts/lib/maxis-transactions-v2.mjs';
import { maxisImplementationHash } from '../scripts/refresh-maxis-data.mjs';

const manifest = JSON.parse(await fs.readFile('data/maxis/manifest.json', 'utf8'));
for (const entry of manifest.seasons) {
  const directory = `data/maxis/seasons/${entry.id}`;
  const summary = JSON.parse(await fs.readFile(`${directory}/summary.json`, 'utf8'));
  const rules = JSON.parse(await fs.readFile(`${directory}/rules.json`, 'utf8'));
  const statePath = `${directory}/transaction-state.json`;
  const stateText = await fs.readFile(statePath, 'utf8');
  const transactionState = JSON.parse(stateText);
  const compactState = JSON.parse(storedCoreText(statePath, transactionState));
  assert.deepEqual(compactState, transactionState, 'state compaction preserves every source value and signed receipt');
  const resume = document => serializeTransactionAccumulator(createTransactionScanState({
    season: document.season, rules: document.rules, document
  }));
  assert.deepEqual(resume(compactState), resume(transactionState), 'resumable scan state survives compaction');
  assert.deepEqual(transactionAccumulatorRows(compactState), transactionAccumulatorRows(transactionState), 'all eligible transaction rows survive compaction');
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
  assert.equal(receipt.transactionStateBytes, Buffer.byteLength(stateText), 'state budget measures bytes on disk');
  if (receipt.measurement === MAXIS_STORAGE_MEASUREMENT) assert.equal(stateText, storedCoreText(statePath, transactionState), 'canonical compact state bytes');
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

// A burst of replay-tail rows can exceed the old whitespace-heavy envelope while
// the same complete state fits the physical limit. No record may be dropped.
const burstState = { status: 'complete', tail: { rows: Array(70_000).fill({
  id: '9223372036854775807', level: 12345678, timestamp: '2026-10-03T11:44:33.000Z',
  nonce: null, status: 'applied', sender: 'tz1aJHKKUWrwfsuoftdmwNBbBctjSWchMWZY', senderAlias: 'ꜩ example'
}) } };
const burstOptions = { ...options, transactionState: burstState };
const compactBudget = measureSeasonArtifactBudget(burstOptions);
assert(prettyJsonBytes(burstState) > compactBudget.limits.transactionStateBytes, 'regression fixture crosses the old 16 MiB envelope');
assert.equal(compactBudget.withinBudget, true, 'all replay rows fit the unchanged physical limit');
assert.deepEqual(JSON.parse(storedCoreText('transaction-state.json', burstState)), burstState);
assert.equal(Buffer.byteLength(storedCoreText('transaction-state.building.json', burstState)), compactBudget.transactionStateBytes);
assert.equal(Buffer.byteLength(storedCoreText('summary.json', burstState)), prettyJsonBytes(burstState), 'other core documents remain pretty JSON');
const legacyBudget = measureSeasonArtifactBudget({ ...burstOptions,
  summary: { ...options.summary, artifactBudget: { measurement: MAXIS_LEGACY_STORAGE_MEASUREMENT } }
});
assert.equal(legacyBudget.transactionStateBytes, prettyJsonBytes(burstState), 'legacy storage receipts retain their exact measurement');
assert.equal(legacyBudget.withinBudget, false, 'legacy state limit remains enforced');
assert.equal(compactBudget.totalBytes, compactBudget.rulesBytes + compactBudget.summaryBytes + compactBudget.transactionStateBytes + compactBudget.passportShardsBytes);

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
console.log('ok - Maxis storage preserves resumable state and every Passport, enforces physical limits, rejects corruption, and retains frozen scoring checks');
