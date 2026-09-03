#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeTezosCrpDataset, encodeTezosCrpDataset } from '../js/core/tezoscrp-codec.mjs';
import {
  TEZOSCRP_RSS_URL,
  TEZOSCRP_SCHEMA_VERSION,
  applyIdentityAliases,
  buildTezosCrpSummary,
  mergeNewArticles,
  parseMediumRss,
  validateTezosCrpDataset,
  validateTezosCrpIdentityAliases
} from './lib/tezoscrp-awards.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_FILE = path.join(ROOT, 'data', 'tezoscrp-awards.json');
const SUMMARY_FILE = path.join(ROOT, 'data', 'tezoscrp-summary.json');
const COMPACT_FILE = path.join(ROOT, 'data', 'tezoscrp-awards.compact.json');
const IDENTITY_FILE = path.join(ROOT, 'data', 'tezoscrp-identity-aliases.json');

function hasFlag(name) {
  return process.argv.includes(name);
}

function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableJson(value[key])]));
}

function equalJson(left, right) {
  return JSON.stringify(stableJson(left)) === JSON.stringify(stableJson(right));
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function writeJson(file, value, compact = false) {
  const temporary = `${file}.tmp-${process.pid}`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, compact ? 0 : 2)}\n`);
  await fs.rename(temporary, file);
}

function assertValid(dataset, identityRegistry) {
  const registryErrors = validateTezosCrpIdentityAliases(identityRegistry, dataset);
  if (registryErrors.length) throw new Error(`TezosCRP identity registry validation failed:\n- ${registryErrors.join('\n- ')}`);
  const errors = validateTezosCrpDataset(dataset, identityRegistry);
  if (errors.length) throw new Error(`TezosCRP dataset validation failed:\n- ${errors.join('\n- ')}`);
}

function assertDerived(dataset, identityRegistry) {
  const rebuilt = applyIdentityAliases(dataset, identityRegistry, dataset.generated_at);
  const fields = ['schema_version', 'program', 'coverage', 'identity_resolution', 'category_summary', 'people_summary', 'awards'];
  const drift = fields.filter((field) => !equalJson(dataset[field], rebuilt[field]));
  if (drift.length) throw new Error(`TezosCRP derived fields drifted: ${drift.join(', ')}. Run npm run refresh:tezoscrp -- --rebuild-only.`);
}

async function check(dataset, identityRegistry) {
  assertValid(dataset, identityRegistry);
  assertDerived(dataset, identityRegistry);
  const expectedSummary = buildTezosCrpSummary(dataset);
  const actualSummary = await readJson(SUMMARY_FILE);
  if (!equalJson(actualSummary, expectedSummary)) throw new Error('data/tezoscrp-summary.json does not match the full TezosCRP dataset');
  const compact = await readJson(COMPACT_FILE);
  if (!equalJson(compact, encodeTezosCrpDataset(dataset)) || !equalJson(decodeTezosCrpDataset(compact), dataset)) {
    throw new Error('data/tezoscrp-awards.compact.json does not losslessly match the full archive; run npm run refresh:tezoscrp -- --rebuild-only');
  }
  console.log(`TezosCRP dataset valid: ${dataset.awards.length} awards, ${dataset.people_summary.length} identities, ${dataset.coverage.covered_periods} months`);
}

async function fetchRss() {
  const response = await fetch(TEZOSCRP_RSS_URL, {
    headers: { 'user-agent': 'tezos.systems TezosCRP archive updater (+https://tezos.systems/tezoscrp/)' },
    signal: AbortSignal.timeout(30_000)
  });
  if (!response.ok) throw new Error(`Medium RSS returned HTTP ${response.status}`);
  return response.text();
}

async function main() {
  const [current, identityRegistry] = await Promise.all([readJson(DATA_FILE), readJson(IDENTITY_FILE)]);
  if (hasFlag('--check')) {
    await check(current, identityRegistry);
    return;
  }

  let next = current;
  let addedPeriods = [];
  if (hasFlag('--rebuild-only')) {
    next = applyIdentityAliases(current, identityRegistry, current.generated_at || new Date().toISOString());
  } else {
    const items = parseMediumRss(await fetchRss());
    const merged = mergeNewArticles(current, items, new Date().toISOString(), identityRegistry);
    next = merged.dataset;
    addedPeriods = merged.addedPeriods;
  }

  if (next.schema_version !== TEZOSCRP_SCHEMA_VERSION) {
    next = applyIdentityAliases(next, identityRegistry, next.generated_at || new Date().toISOString());
  }
  assertValid(next, identityRegistry);
  assertDerived(next, identityRegistry);

  if (!equalJson(current, next)) await writeJson(DATA_FILE, next);
  const summary = buildTezosCrpSummary(next);
  let currentSummary = null;
  try { currentSummary = await readJson(SUMMARY_FILE); } catch { /* first build */ }
  if (!equalJson(currentSummary, summary)) await writeJson(SUMMARY_FILE, summary);
  const compact = encodeTezosCrpDataset(next);
  let currentCompact = null;
  try { currentCompact = await readJson(COMPACT_FILE); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!equalJson(currentCompact, compact)) await writeJson(COMPACT_FILE, compact, true);

  if (addedPeriods.length) console.log(`Added TezosCRP award periods: ${addedPeriods.join(', ')}`);
  else console.log('No new TezosCRP winner article found; dataset remains current');
  await check(next, identityRegistry);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
