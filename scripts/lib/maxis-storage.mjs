import { createHash } from 'node:crypto';
import {
  GENERATED_TRANSPORT_VERSION, packGeneratedTransport, decodeGeneratedTransport
} from '../../js/core/generated-transport.mjs';
import {
  measureSeasonArtifactBudget as measureLegacyBudget,
  artifactBudgetErrors as legacyBudgetErrors, compactJsonBytes
} from './maxis-artifact-budget.mjs';

// Storage is versioned separately from the frozen v2 scoring/source evaluator.
// Source hashes still describe the exact decoded schema-2 Passport JSON.
export const MAXIS_PASSPORT_STORAGE = GENERATED_TRANSPORT_VERSION;
export const MAXIS_LEGACY_STORAGE_MEASUREMENT = 'utf8-pretty-core-shaped-shards-v2';
export const MAXIS_STORAGE_MEASUREMENT = 'utf8-compact-state-shaped-shards-v3';
export const passportDigest = text => createHash('sha256').update(text).digest('hex');
const sourcePath = payload => `data/maxis/seasons/${payload.seasonId}/passports/${payload.shard}.json`;

export function storedPassportPayload(payload) {
  if (payload?.transport === MAXIS_PASSPORT_STORAGE) return payload;
  if (payload?.schema !== 2) throw new Error('Cannot store an incompatible Passport shard');
  const text = `${JSON.stringify(payload)}\n`;
  return packGeneratedTransport(text, sourcePath(payload), passportDigest(text));
}

export function storedPassportText(payload) {
  return `${JSON.stringify(storedPassportPayload(payload))}\n`;
}

export async function readStoredPassport(text, path) {
  return decodeGeneratedTransport(text, path, passportDigest);
}

// JSON whitespace is physical storage only. The frozen v2 source receipt and
// Transaction availability still use their original pretty-JSON measurement.
export function storedCoreText(file, value) {
  const compactState = /(?:^|[/\\])transaction-state(?:\.building)?\.json$/.test(file);
  return `${JSON.stringify(value, null, compactState ? undefined : 2)}\n`;
}

export function measureSeasonArtifactBudget(options) {
  const storage = options.summary?.passports?.storage;
  if (storage === undefined) return measureLegacyBudget(options);
  if (storage !== MAXIS_PASSPORT_STORAGE) throw new Error(`Unsupported Passport storage: ${storage}`);
  const entries = options.shardPayloads instanceof Map
    ? [...options.shardPayloads] : Object.entries(options.shardPayloads || {});
  const receipt = measureLegacyBudget({
    ...options,
    shardPayloads: new Map(entries.map(([key, payload]) => [key, storedPassportPayload(payload)]))
  });
  // Finalized and not-yet-migrated shaped seasons retain their original bytes.
  if (options.summary?.artifactBudget?.measurement === MAXIS_LEGACY_STORAGE_MEASUREMENT) {
    return { ...receipt, measurement: MAXIS_LEGACY_STORAGE_MEASUREMENT };
  }
  const transactionStateBytes = compactJsonBytes(options.transactionState);
  const totalBytes = receipt.totalBytes - receipt.transactionStateBytes + transactionStateBytes;
  const violations = [];
  if (options.transactionState?.status !== 'complete') violations.push('transaction state is not complete');
  if (transactionStateBytes > receipt.limits.transactionStateBytes) {
    violations.push(`transaction state ${transactionStateBytes} exceeds ${receipt.limits.transactionStateBytes} bytes`);
  }
  if (receipt.maxShard.bytes > receipt.limits.passportShardBytes) {
    violations.push(`Passport shard ${receipt.maxShard.shard} is ${receipt.maxShard.bytes} bytes, above ${receipt.limits.passportShardBytes}`);
  }
  if (totalBytes > receipt.limits.seasonArtifactBytes) {
    violations.push(`season artifacts total ${totalBytes} bytes, above ${receipt.limits.seasonArtifactBytes}`);
  }
  return { ...receipt, measurement: MAXIS_STORAGE_MEASUREMENT, transactionStateBytes,
    totalBytes, withinBudget: violations.length === 0, violations };
}

export function artifactBudgetErrors(receipt) {
  // Keep every legacy failure check; only the disclosed storage measurement differs.
  return legacyBudgetErrors([MAXIS_LEGACY_STORAGE_MEASUREMENT, MAXIS_STORAGE_MEASUREMENT].includes(receipt?.measurement)
    ? { ...receipt, measurement: 'utf8-pretty-core-compact-shards-v1' } : receipt);
}
