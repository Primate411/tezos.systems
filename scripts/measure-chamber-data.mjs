#!/usr/bin/env node
// Representation measurements, not a network or physical-device speed claim.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { decodeTezosCrpDataset, encodeTezosCrpDataset } from '../js/core/tezoscrp-codec.mjs';
import { validateGovernanceCareerArtifact } from './lib/maxis-governance-career.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFile(path.join(root, 'data', file), 'utf8');
const [expandedText, compactText, careerText] = await Promise.all([
  read('tezoscrp-awards.json'), read('tezoscrp-awards.compact.json'), read('maxis-careers.json')
]);
const expanded = JSON.parse(expandedText), compact = JSON.parse(compactText), careers = JSON.parse(careerText);
const decoded = decodeTezosCrpDataset(compact);
assert.deepEqual(decoded, expanded);
assert.deepEqual(encodeTezosCrpDataset(expanded), compact);
assert.deepEqual(validateGovernanceCareerArtifact(careers), []);
assert.equal(careerText, `${JSON.stringify(careers)}\n`);
const size = text => ({ bytes: Buffer.byteLength(text), gzipBytes: gzipSync(text).length });
const report = {
  tezoscrp: {
    canonical: size(expandedText), canonicalWithoutWhitespace: size(`${JSON.stringify(expanded)}\n`), browser: size(compactText),
    awards: decoded.awards.length, identities: decoded.people_summary.length, months: decoded.coverage.covered_periods,
    categoryDictionary: compact.award_dictionaries.category_raw.length,
    sourceObjectsBefore: expanded.awards.reduce((sum, row) => sum + row.sources.length, 0),
    sourceObjectsAfter: new Set(decoded.awards.flatMap(row => row.sources)).size,
    roundTrip: 'every field equal'
  },
  maxisCareers: { pretty: size(`${JSON.stringify(careers, null, 2)}\n`), browser: size(careerText), records: careers.recordCount, contentHash: careers.integrity.contentHash }
};
if (process.argv.includes('--benchmark')) {
  const times = [[], []];
  const work = [() => JSON.parse(expandedText), () => decodeTezosCrpDataset(JSON.parse(compactText))];
  for (let round = 0; round < 60; round++) for (const index of round % 2 ? [0, 1] : [1, 0]) {
    const start = performance.now(); work[index](); const elapsed = performance.now() - start;
    if (round >= 10) times[index].push(elapsed);
  }
  const median = values => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
  report.localNodeTiming = { expandedParseMedianMs: median(times[0]), compactParseAndDecodeMedianMs: median(times[1]), samples: 50 };
}
console.log(JSON.stringify(report, null, 2));
