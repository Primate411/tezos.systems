#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { snapshotContentHash, stableHash } from './lib/ecosystem-stats.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_PATH = 'data/ecosystem-stats.json';
const OUTPUT_PATH = 'data/ecosystem-entry-summary.json';
const SOURCE_FILE = path.join(ROOT, SOURCE_PATH);
const OUTPUT_FILE = path.join(ROOT, OUTPUT_PATH);
const ENTRY_HISTORY_WEEKS = 26;
const MAX_OUTPUT_BYTES = 16 * 1024;

function hasFlag(name) {
  return process.argv.includes(name);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function validateSource(snapshot) {
  assert(snapshot?.schemaVersion === 1, 'Ecosystem snapshot schemaVersion 1 is required');
  assert(Number.isFinite(Date.parse(snapshot?.generatedAt || '')), 'Ecosystem snapshot generatedAt must be an ISO timestamp');
  assert(/^[0-9a-f]{64}$/.test(snapshot?.contentHash || ''), 'Ecosystem snapshot contentHash must be a SHA-256 digest');
  assert(snapshotContentHash(snapshot) === snapshot.contentHash, 'Ecosystem snapshot contentHash does not match its unsigned payload');
  assert(Array.isArray(snapshot?.rankings?.all) && snapshot.rankings.all.length >= 10, 'Ecosystem snapshot must expose an all-layer top 10');
  assert(Array.isArray(snapshot?.weeks) && snapshot.weeks.length, 'Ecosystem snapshot must expose weekly history');
  assert(Array.isArray(snapshot?.networkActivity?.weeks) && snapshot.networkActivity.weeks.length,
    'Ecosystem snapshot must expose network-wide weekly activity');
  assert(snapshot.networkActivity.weeks.at(-1)?.weekStart === snapshot.completeWeek?.weekStart,
    'Ecosystem network-wide activity must include the latest completed week');
}

function compactMetric(metric) {
  return {
    activeWallets: metric?.activeWallets ?? null,
    interactions: metric?.interactions ?? null
  };
}

function compactWeek(row) {
  return {
    weekStart: row.weekStart,
    all: compactMetric(row.all),
    tezos: compactMetric(row.layers?.tezos),
    etherlink: compactMetric(row.layers?.etherlink)
  };
}

function compactLeader(row) {
  return {
    rank: row.rank,
    id: row.id,
    name: row.name,
    category: row.category,
    layers: row.layers,
    activeWallets: row.activeWallets,
    interactions: row.interactions,
    wowPct: row.wowPct ?? null,
    yoyPct: row.yoyPct ?? null
  };
}

function compactNetworkMetric(metric) {
  return {
    status: metric?.status || 'unavailable',
    activeWallets: metric?.activeWallets ?? null,
    approximate: metric?.approximate === true
  };
}

function compactNetworkWeek(row) {
  return {
    weekStart: row.weekStart,
    weekEnd: row.weekEnd,
    status: row.status,
    all: compactNetworkMetric(row.all),
    layers: {
      tezos: compactNetworkMetric(row.layers?.tezos),
      etherlink: compactNetworkMetric(row.layers?.etherlink)
    }
  };
}

function buildProjection(snapshot, sourceText) {
  const unsigned = {
    schemaVersion: 1,
    generatedAt: snapshot.generatedAt,
    source: {
      path: SOURCE_PATH,
      schemaVersion: snapshot.schemaVersion,
      generatedAt: snapshot.generatedAt,
      contentHash: snapshot.contentHash,
      fileSha256: sha256(sourceText)
    },
    universe: snapshot.universe,
    completeWeek: snapshot.completeWeek,
    partialWeek: {
      weekStart: snapshot.partialWeek.weekStart,
      observedAt: snapshot.partialWeek.observedAt,
      status: 'partial',
      all: compactMetric(snapshot.partialWeek.all),
      layers: {
        tezos: compactMetric(snapshot.partialWeek.layers?.tezos),
        etherlink: compactMetric(snapshot.partialWeek.layers?.etherlink)
      }
    },
    networkActivity: {
      definition: snapshot.networkActivity.definition,
      coverageStart: snapshot.networkActivity.coverageStart,
      weeks: snapshot.networkActivity.weeks.slice(-ENTRY_HISTORY_WEEKS).map(compactNetworkWeek),
      partialWeek: {
        weekStart: snapshot.networkActivity.partialWeek.weekStart,
        observedAt: snapshot.networkActivity.partialWeek.observedAt,
        status: 'partial',
        all: compactNetworkMetric(snapshot.networkActivity.partialWeek.all),
        layers: {
          tezos: compactNetworkMetric(snapshot.networkActivity.partialWeek.layers?.tezos),
          etherlink: compactNetworkMetric(snapshot.networkActivity.partialWeek.layers?.etherlink)
        }
      }
    },
    weeks: snapshot.weeks.slice(-ENTRY_HISTORY_WEEKS).map(compactWeek),
    leaders: Object.fromEntries(['all', 'tezos', 'etherlink'].map((layer) => [
      layer,
      (snapshot.rankings?.[layer] || []).slice(0, 3).map(compactLeader)
    ]))
  };
  return { contentHash: stableHash(unsigned), ...unsigned };
}

function validateProjection(projection, byteLength) {
  assert(projection?.schemaVersion === 1, 'Ecosystem entry summary schemaVersion 1 is required');
  assert(Number.isFinite(Date.parse(projection?.generatedAt || '')), 'Ecosystem entry summary generatedAt must be an ISO timestamp');
  assert(/^[0-9a-f]{64}$/.test(projection?.contentHash || ''), 'Ecosystem entry summary contentHash must be a SHA-256 digest');
  const { contentHash: ignored, ...unsigned } = projection;
  assert(stableHash(unsigned) === projection.contentHash, 'Ecosystem entry summary contentHash does not match');
  assert(projection.source?.path === SOURCE_PATH, `Ecosystem entry summary source must be ${SOURCE_PATH}`);
  assert(projection.weeks?.length > 0 && projection.weeks.length <= ENTRY_HISTORY_WEEKS, 'Ecosystem entry history is invalid');
  assert(projection.networkActivity?.weeks?.length > 0
    && projection.networkActivity.weeks.length <= ENTRY_HISTORY_WEEKS,
  'Ecosystem entry network-wide history is invalid');
  assert(projection.networkActivity.weeks.at(-1)?.weekStart === projection.completeWeek?.weekStart,
    'Ecosystem entry network-wide history is missing the latest completed week');
  assert(projection.leaders?.all?.length >= 3, 'Ecosystem entry summary needs three all-layer leaders');
  assert(byteLength <= MAX_OUTPUT_BYTES, `Ecosystem entry summary is ${byteLength} bytes; maximum is ${MAX_OUTPUT_BYTES}`);
}

async function main() {
  const sourceText = await fs.readFile(SOURCE_FILE, 'utf8');
  const source = JSON.parse(sourceText);
  validateSource(source);
  const projection = buildProjection(source, sourceText);
  const output = `${JSON.stringify(projection, null, 2)}\n`;
  validateProjection(projection, Buffer.byteLength(output));

  if (hasFlag('--check')) {
    const existing = await fs.readFile(OUTPUT_FILE, 'utf8');
    assert(existing === output, `${OUTPUT_PATH} is stale; run node scripts/generate-ecosystem-entry-summary.mjs`);
    console.log(`ok - Ecosystem entry summary matches ${SOURCE_PATH} (${Buffer.byteLength(output)} bytes, ${projection.contentHash.slice(0, 12)})`);
    return;
  }

  await fs.writeFile(OUTPUT_FILE, output);
  console.log(`Wrote ${OUTPUT_PATH} (${Buffer.byteLength(output)} bytes, ${projection.contentHash.slice(0, 12)})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
