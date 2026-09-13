import { createHash } from 'node:crypto';
import {
  GENERATED_TRANSPORT_VERSION, packGeneratedTransport, decodeGeneratedTransport
} from '../../js/core/generated-transport.mjs';
import {
  measureSeasonArtifactBudget as measureLegacyBudget,
  artifactBudgetErrors as legacyBudgetErrors
} from './maxis-artifact-budget.mjs';

// Storage is versioned separately from the frozen v2 scoring/source evaluator.
// Source hashes still describe the exact decoded schema-2 Passport JSON.
export const MAXIS_PASSPORT_STORAGE = GENERATED_TRANSPORT_VERSION;
export const MAXIS_STORAGE_MEASUREMENT = 'utf8-pretty-core-shaped-shards-v2';
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
  return { ...receipt, measurement: MAXIS_STORAGE_MEASUREMENT };
}

export function artifactBudgetErrors(receipt) {
  // Keep every legacy failure check; only the disclosed storage measurement differs.
  return legacyBudgetErrors(receipt?.measurement === MAXIS_STORAGE_MEASUREMENT
    ? { ...receipt, measurement: 'utf8-pretty-core-compact-shards-v1' } : receipt);
}
