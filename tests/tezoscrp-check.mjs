#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeTezosCrpDataset, encodeTezosCrpDataset, TEZOSCRP_COMPACT_SCHEMA } from '../js/core/tezoscrp-codec.mjs';
import {
  CURRENT_CATEGORY_DEFINITIONS,
  TEZOSCRP_SCHEMA_VERSION,
  applyIdentityAliases,
  awardsFromArticle,
  buildTezosCrpRecords,
  buildTezosCrpSummary,
  mergeNewArticles,
  parseMediumRss,
  validateTezosCrpDataset,
  validateTezosCrpIdentityAliases
} from '../scripts/lib/tezoscrp-awards.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataset = JSON.parse(await fs.readFile(path.join(ROOT, 'data/tezoscrp-awards.json'), 'utf8'));
const summary = JSON.parse(await fs.readFile(path.join(ROOT, 'data/tezoscrp-summary.json'), 'utf8'));
const identityAliases = JSON.parse(await fs.readFile(path.join(ROOT, 'data/tezoscrp-identity-aliases.json'), 'utf8'));
const compactText = await fs.readFile(path.join(ROOT, 'data/tezoscrp-awards.compact.json'), 'utf8');
const compact = JSON.parse(compactText);
const original = structuredClone(dataset);
assert.equal(compact.schema_version, TEZOSCRP_COMPACT_SCHEMA);
assert.deepEqual(compact, encodeTezosCrpDataset(dataset), 'Deterministic complete browser projection');
assert.deepEqual(decodeTezosCrpDataset(compact), dataset, 'Every field survives dictionary decoding');
assert.deepEqual(decodeTezosCrpDataset(dataset), dataset, 'Expanded-schema compatibility');
assert.deepEqual(dataset, original, 'Encoding must not mutate the canonical archive');
assert(compactText.length < JSON.stringify(dataset).length * 0.85, 'Dictionary saving independent of whitespace');
assert.equal(compactText, `${JSON.stringify(compact)}\n`, 'Compact serialization stays deterministic');
assert(compact.awards.every(row => !Object.hasOwn(row, 'sources') && !Object.hasOwn(row, 'category_raw')));
const decoded = decodeTezosCrpDataset(compact);
const shared = compact.awards.findIndex((row, index) => index > 0 && JSON.stringify(row.source_ids) === JSON.stringify(compact.awards[0].source_ids));
assert(shared > 0);
assert.equal(decoded.awards[0].sources, decoded.awards[shared].sources, 'Identical receipt lists share one immutable allocation');
assert(Object.isFrozen(decoded.awards[0].sources) && Object.isFrozen(decoded.awards[0].sources[0]));
assert.equal(Object.isFrozen(compact.award_dictionaries.sources[0]), false, 'Decoding must not freeze caller-owned input');

const multiSource = structuredClone(dataset);
multiSource.awards = [multiSource.awards[0], structuredClone(multiSource.awards[0])];
multiSource.awards[1].category_raw += ' — historical wording';
multiSource.awards[1].sources = [multiSource.awards[0].sources[0], { ...multiSource.awards[0].sources[0], published_at: '2026-01-01T00:00:00Z', note: 'Same URL, different receipt' }, multiSource.awards[0].sources[0]];
const multiPacked = encodeTezosCrpDataset(multiSource);
assert.equal(multiPacked.award_dictionaries.sources.length, 2, 'Do not merge differing receipts by URL');
assert.deepEqual(decodeTezosCrpDataset(multiPacked), multiSource, 'Preserve source order, repetition, metadata, and raw category wording');
for (const mutate of [
  value => { value.schema_version = 'future'; },
  value => { delete value.award_dictionaries; },
  value => { value.awards[0].category_raw_id = -1; },
  value => { value.awards[0].category_raw_id = 1.5; },
  value => { value.awards[0].category_raw_id = value.award_dictionaries.category_raw.length; },
  value => { value.awards[0].source_ids = []; },
  value => { value.awards[1].source_ids = [null]; },
  value => { value.awards[0].source_ids = ['0']; },
  value => { value.awards[0].source_ids = [value.award_dictionaries.sources.length]; },
  value => { value.awards[0].sources = []; },
  value => { value.award_dictionaries.sources[0].url = 'javascript:alert(1)'; },
  value => { value.award_dictionaries.category_raw[0] = null; }
]) {
  const invalid = structuredClone(compact); mutate(invalid);
  assert.throws(() => decodeTezosCrpDataset(invalid), /TezosCRP archive:/);
}

assert.equal(dataset.schema_version, TEZOSCRP_SCHEMA_VERSION);
assert.deepEqual(validateTezosCrpIdentityAliases(identityAliases, dataset), []);
assert.deepEqual(validateTezosCrpDataset(dataset, identityAliases), []);
assert.deepEqual(applyIdentityAliases(dataset, identityAliases, dataset.generated_at), dataset);
assert.deepEqual(summary, buildTezosCrpSummary(dataset));
assert.ok(dataset.awards.length >= 2_218);
assert.ok(dataset.people_summary.length >= 827);
assert.equal(dataset.identity_resolution.applied_alias_ids, 43);
assert.equal(dataset.identity_resolution.pending_review_records, 2);
assert.equal(CURRENT_CATEGORY_DEFINITIONS.length, 9);
assert.equal(new Set(CURRENT_CATEGORY_DEFINITIONS.map(({ icon }) => icon)).size, 9);
const records = buildTezosCrpRecords(dataset);
assert.ok(records.years.length >= 7);
assert.equal(records.categories.length, dataset.category_summary.length);
assert.deepEqual(records.years.find(({ year }) => year === 2022)?.leaders.map(({ display_name, awards }) => [display_name, awards]), [['Baking Benjamins', 17]]);
assert.equal(records.years.find(({ year }) => year === 2025)?.leaders.length, 3);
assert.ok(records.categories.find(({ category }) => category === 'Assimilation Award')?.record >= 25);
for (const definition of CURRENT_CATEGORY_DEFINITIONS) {
  await fs.access(path.join(ROOT, definition.icon.replace(/^\//, '')));
}

const [latestYear, latestMonth] = dataset.coverage.periods.at(-1).period.split('-').map(Number);
const fixtureDate = new Date(Date.UTC(latestYear, latestMonth, 1));
const fixturePeriod = `${fixtureDate.getUTCFullYear()}-${String(fixtureDate.getUTCMonth() + 1).padStart(2, '0')}`;
const fixtureMonthName = fixtureDate.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
const fixtureArticle = {
  title: `Tezos Community Rewards — ${fixtureMonthName} ${fixtureDate.getUTCFullYear()}`,
  url: `https://news.tezoscommons.org/tezos-community-rewards-${fixturePeriod}-fixture`,
  published_at: new Date(Date.UTC(fixtureDate.getUTCFullYear(), fixtureDate.getUTCMonth() + 1, 20, 18)).toISOString(),
  html: `
    <p>For this round, a total of 10,000 tez has been awarded.</p>
    <h3>Helping Hand Award</h3>
    <ul><li>@FixtureHelper</li><li>@TozartWeb3 (ex @TezosNFTMusic)</li><li>@PixelSushiRobot</li></ul>
    <h3>Patissier Award</h3>
    <ul><li>@FixtureBaker</li></ul>
    <h3>Nominations Are Open For August</h3>
    <ul><li>@ThisIsNotAWinner</li></ul>
  `
};

const fixture = awardsFromArticle(fixtureArticle, dataset, identityAliases);
assert.equal(fixture.period, fixturePeriod);
assert.equal(fixture.awards.length, 4);
assert.equal(fixture.announced_total_tez, 10_000);
assert.equal(fixture.awards.find(({ handle }) => handle === 'TozartWeb3')?.person_id, 'x:tozartweb3');
assert.equal(fixture.awards.find(({ handle }) => handle === 'PixelSushiRobot')?.person_id, 'x:nicefishtaco');
assert.equal(fixture.awards.find(({ handle }) => handle === 'FixtureBaker')?.category, 'Pâtissier Award');
assert.equal(fixture.awards.some(({ handle }) => handle === 'ThisIsNotAWinner'), false);

const rss = `<?xml version="1.0"?><rss><channel><item>
  <title><![CDATA[${fixtureArticle.title}]]></title>
  <link>${fixtureArticle.url}?source=rss</link>
  <guid>https://medium.com/p/fixture</guid>
  <pubDate>${new Date(fixtureArticle.published_at).toUTCString()}</pubDate>
  <content:encoded><![CDATA[${fixtureArticle.html}]]></content:encoded>
</item></channel></rss>`;
const items = parseMediumRss(rss);
assert.equal(items.length, 1);
assert.equal(items[0].url, fixtureArticle.url);
const merged = mergeNewArticles(dataset, items, '2026-08-20T18:01:00.000Z', identityAliases);
assert.deepEqual(merged.addedPeriods, [fixturePeriod]);
assert.equal(merged.dataset.awards.length, dataset.awards.length + 4);
assert.equal(merged.dataset.coverage.missing_periods.length, 0);
assert.deepEqual(validateTezosCrpDataset(merged.dataset, identityAliases), []);
assert.deepEqual(decodeTezosCrpDataset(encodeTezosCrpDataset(merged.dataset)), merged.dataset, 'New monthly articles regenerate losslessly');

for (const [personId, awards, periods] of [
  ['x:nicefishtaco', 3, 3],
  ['x:cleofis', 2, 2],
  ['x:flexasaurusrex', 7, 7],
  ['x:one_bald_dude', 7, 7]
]) {
  const person = dataset.people_summary.find((row) => row.person_id === personId);
  assert.ok(person?.total_awards >= awards, `${personId} award total`);
  assert.ok(person?.distinct_periods >= periods, `${personId} month total`);
}
for (const personId of ['x:pixelsushirobot', 'x:cle0fis', 'x:rexflexasaurus', 'reddit:onebalddude']) {
  assert.equal(dataset.people_summary.some((person) => person.person_id === personId), false, `${personId} should resolve to its canonical record`);
}
for (const personId of ['reddit:amethyst-001', 'x:amethyst001_', 'x:tezosafrica', 'x:tezosinafrica']) {
  assert.equal(dataset.people_summary.some((person) => person.person_id === personId), true, `${personId} should remain separate pending evidence`);
}

console.log(`TezosCRP focused checks passed: ${dataset.awards.length} awards, ${dataset.people_summary.length} verified identities, RSS parser and alias continuity`);
