#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHAMBER_ROUTES, routeUrl } from '../scripts/lib/chamber-routes.mjs';
import {
  MINERALS,
  TOKEN_PRODUCTS,
  WORLD_BANK_SERIES,
  buildProjection,
  validateProjection,
  validateSnapshot
} from '../scripts/refresh-minerals-data.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SNAPSHOT_PATH = 'data/minerals-snapshot.json';
const ENTRY_PATH = 'data/minerals-entry-summary.json';
const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024;
const MAX_ENTRY_BYTES = 96 * 1024;

const EXPECTED_NAMES = [
  'Aluminum', 'Antimony', 'Arsenic', 'Barite', 'Beryllium', 'Bismuth', 'Boron',
  'Cerium', 'Cesium', 'Chromium', 'Cobalt', 'Copper', 'Dysprosium', 'Erbium',
  'Europium', 'Fluorspar', 'Gadolinium', 'Gallium', 'Germanium', 'Graphite',
  'Hafnium', 'Holmium', 'Indium', 'Iridium', 'Lanthanum', 'Lead', 'Lithium',
  'Lutetium', 'Magnesium', 'Manganese', 'Metallurgical Coal', 'Neodymium',
  'Nickel', 'Niobium', 'Palladium', 'Phosphate', 'Platinum', 'Potash',
  'Praseodymium', 'Rhenium', 'Rhodium', 'Rubidium', 'Ruthenium', 'Samarium',
  'Scandium', 'Silicon', 'Silver', 'Tantalum', 'Tellurium', 'Terbium', 'Thulium',
  'Tin', 'Titanium', 'Tungsten', 'Uranium', 'Vanadium', 'Ytterbium', 'Yttrium',
  'Zinc', 'Zirconium'
];

const EXPECTED_RARE_EARTHS = [
  'Cerium', 'Dysprosium', 'Erbium', 'Europium', 'Gadolinium', 'Holmium',
  'Lanthanum', 'Lutetium', 'Neodymium', 'Praseodymium', 'Samarium', 'Terbium',
  'Thulium', 'Ytterbium', 'Yttrium'
];

const EXPECTED_MARKET_KEYS = [
  'phosphate', 'potash', 'aluminum', 'copper', 'lead',
  'tin', 'nickel', 'zinc', 'platinum', 'silver'
];

const EXPECTED_MARKET_UNITS = {
  phosphate: 'USD per metric ton',
  potash: 'USD per metric ton',
  aluminum: 'USD per metric ton',
  copper: 'USD per metric ton',
  lead: 'USD per metric ton',
  tin: 'USD per metric ton',
  nickel: 'USD per metric ton',
  zinc: 'USD per metric ton',
  platinum: 'USD per troy ounce',
  silver: 'USD per troy ounce'
};

const EXPECTED_TOKENS = {
  xCo: {
    address: '0x21a92d78F18268AdadA1227E1F1134C6C32DbD67',
    commodities: ['cobalt'],
    implementation: '0x45F8110Bc03C9396ccfBB07A16D58785bFd67F22'
  },
  xNi: {
    address: '0x8190b536B30F519D10891eCBd96AbC52E2e70638',
    commodities: ['nickel'],
    implementation: '0x45F8110Bc03C9396ccfBB07A16D58785bFd67F22'
  },
  RARE: {
    address: '0x6Ce393fF9Ed5465CC4DEf456B8401e03cEF64d5e',
    commodities: ['hafnium', 'rhenium', 'indium', 'neodymium', 'praseodymium'],
    implementation: '0x56b2C0579b609a995e481fEB089f7861C8554829'
  }
};

const SOURCE_KEYS = [
  'usgsCriticalList',
  'usgsMcs2026',
  'worldBankPinkSheet',
  'metalsIoCatalog',
  'metalsIoProducts',
  'blockscoutXco',
  'blockscoutXni',
  'blockscoutRare'
];

const readText = (file) => fs.readFile(path.join(ROOT, file), 'utf8');
const readOptionalText = async (file) => {
  try {
    return await readText(file);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
};

const [
  snapshotText,
  entryText,
  generator,
  feature,
  css,
  marketCss,
  app,
  siteMap,
  wayfinder,
  ogGenerator,
  generatedSurfaces,
  sw,
  openApiText,
  routeHtml,
  packageText,
  smoke,
  indexHtml,
  changelog
] = await Promise.all([
  readText(SNAPSHOT_PATH),
  readText(ENTRY_PATH),
  readText('scripts/refresh-minerals-data.mjs'),
  readText('js/features/minerals-chamber.js'),
  readText('css/minerals-chamber.css'),
  readText('css/market-room.css'),
  readText('js/core/app.js'),
  readText('js/core/site-map.js'),
  readText('js/ui/wayfinder.js'),
  readText('scripts/generate-chamber-og-images.mjs'),
  readText('scripts/refresh-generated-surfaces.mjs'),
  readText('sw.js'),
  readText('.well-known/openapi.json'),
  readOptionalText('minerals/index.html'),
  readText('package.json'),
  readText('tests/smoke.mjs'),
  readText('index.html'),
  readText('js/features/changelog.js')
]);

const snapshot = JSON.parse(snapshotText);
const entry = JSON.parse(entryText);
const openApi = JSON.parse(openApiText);
const packageJson = JSON.parse(packageText);

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function stableReceiptHash(value) {
  const { contentHash: ignored, ...unsigned } = value || {};
  return sha256(JSON.stringify(stableValue(unsigned)));
}

function validIso(value) {
  return typeof value === 'string' && value.includes('T') && Number.isFinite(Date.parse(value));
}

function ascending(rows, key) {
  return rows.every((row, index) => index === 0 || String(rows[index - 1]?.[key]) < String(row?.[key]));
}

function numberFromRaw(value) {
  const parsed = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function approximate(actual, expected, tolerance, message) {
  assert.ok(Number.isFinite(Number(actual)), `${message}: actual value must be finite`);
  assert.ok(Number.isFinite(Number(expected)), `${message}: expected value must be finite`);
  assert.ok(Math.abs(Number(actual) - Number(expected)) <= tolerance,
    `${message}: expected ${expected}, received ${actual}`);
}

function hasExactMcsEvidence(row) {
  return Boolean(
    row?.priceVariants?.length
    || row?.netImportRelianceVariants?.length
    || row?.production
    || row?.importSourceGroups?.length
  );
}

function forbiddenExecutionKeys(value, prefix = '') {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) {
    return value.flatMap((child, index) => forbiddenExecutionKeys(child, `${prefix}[${index}]`));
  }
  return Object.entries(value).flatMap(([key, child]) => {
    const current = prefix ? `${prefix}.${key}` : key;
    return [
      ...(/^(?:trade|buy|sell|swap|bridge|redeem|order|wallet|execute|execution|action)Url$/i.test(key) ? [current] : []),
      ...forbiddenExecutionKeys(child, current)
    ];
  });
}

// Stable full/compact receipts, exact source-file receipt, and load budgets.
assert.equal(snapshot.schemaVersion, 1);
assert.equal(snapshot.artifact, 'minerals-snapshot');
assert.equal(entry.schemaVersion, 1);
assert.equal(entry.artifact, 'minerals-entry-summary');
assert.ok(validIso(snapshot.generatedAt));
assert.equal(entry.generatedAt, snapshot.generatedAt);
assert.equal(snapshot.contentHash, stableReceiptHash(snapshot), 'snapshot stable content SHA-256');
assert.equal(entry.contentHash, stableReceiptHash(entry), 'entry stable content SHA-256');
assert.ok(Buffer.byteLength(snapshotText) <= MAX_SNAPSHOT_BYTES, 'full snapshot stays within 2 MiB');
assert.ok(Buffer.byteLength(entryText) <= MAX_ENTRY_BYTES, 'compact entry stays within 96 KiB');
assert.equal(entry.fullSnapshot.path, `/${SNAPSHOT_PATH}`);
assert.equal(entry.fullSnapshot.schemaVersion, snapshot.schemaVersion);
assert.equal(entry.fullSnapshot.generatedAt, snapshot.generatedAt);
assert.equal(entry.fullSnapshot.contentHash, snapshot.contentHash);
assert.equal(entry.fullSnapshot.fileSha256, sha256(snapshotText), 'compact entry retains exact full-file SHA-256');
assert.deepEqual(entry, buildProjection(snapshot, snapshotText), 'compact entry is the exact generator projection');
assert.equal(validateSnapshot(snapshot, Buffer.byteLength(snapshotText)), true);
assert.equal(validateProjection(entry, snapshot, snapshotText, Buffer.byteLength(entryText)), true);

// The canonical final 2025 list is exact, ordered, jurisdiction-specific, and independently pinned here.
assert.equal(snapshot.identity.title, 'Critical Minerals');
assert.equal(snapshot.identity.jurisdiction, 'United States');
assert.equal(snapshot.identity.listYear, 2025);
assert.equal(snapshot.identity.federalRegisterCitation, '90 FR 50494');
assert.equal(snapshot.identity.federalRegisterDocument, '2025-19813');
assert.equal(snapshot.identity.publishedDate, '2025-11-07');
assert.equal(snapshot.identity.criticalCount, 60);
assert.equal(snapshot.identity.rareEarthCount, 15);
assert.equal(snapshot.taxonomy.sourceKey, 'usgsCriticalList');
assert.deepEqual(snapshot.taxonomy.minerals.map(({ name }) => name), EXPECTED_NAMES);
assert.deepEqual(MINERALS.map(({ name }) => name), EXPECTED_NAMES, 'generator list must match the independent canonical list');
assert.equal(new Set(snapshot.taxonomy.minerals.map(({ id }) => id)).size, 60);
assert.deepEqual(snapshot.taxonomy.minerals.filter(({ isRareEarth }) => isRareEarth).map(({ name }) => name), EXPECTED_RARE_EARTHS);
assert.ok(!snapshot.taxonomy.minerals.find(({ name }) => name === 'Scandium').isRareEarth,
  'Scandium is critical but not one of the 15 final-list rare-earth markers');
assert.match(snapshot.taxonomy.boundaries.policy, /jurisdiction.*time-specific/i);
assert.match(snapshot.taxonomy.boundaries.forms, /not silently treated as interchangeable/i);

const federalReceipt = snapshot.sources.usgsCriticalList.receipt;
assert.equal(federalReceipt.listEdition, 'Final 2025');
assert.equal(federalReceipt.federalRegisterCitation, snapshot.identity.federalRegisterCitation);
assert.equal(federalReceipt.federalRegisterDocument, snapshot.identity.federalRegisterDocument);
assert.equal(federalReceipt.listCount, 60);
assert.equal(federalReceipt.rareEarthCount, 15);
assert.deepEqual(federalReceipt.reviewedOrder, EXPECTED_NAMES);
assert.ok(snapshot.sources.usgsCriticalList.endpoints.some((url) => url.includes('/2025-19813/')));

// Exact MCS coverage and explicit gaps: no group or adjacent proxy may fill these rows.
assert.equal(snapshot.annual.sourceKey, 'usgsMcs2026');
assert.equal(snapshot.annual.reportingYear, 2025);
assert.equal(snapshot.annual.coverage.exactCommodityRows, 57);
assert.deepEqual(Object.keys(snapshot.annual.minerals), snapshot.taxonomy.minerals.map(({ id }) => id));
const noExactMcsEvidence = Object.entries(snapshot.annual.minerals)
  .filter(([, row]) => !hasExactMcsEvidence(row))
  .map(([id]) => id);
assert.deepEqual(noExactMcsEvidence, ['metallurgical-coal', 'thulium', 'uranium']);
assert.equal(snapshot.annual.minerals['metallurgical-coal'].mcsCommodity, null);
assert.equal(snapshot.annual.minerals.uranium.mcsCommodity, null);
assert.equal(snapshot.annual.minerals.thulium.mcsCommodity, 'Thulium');
assert.match(snapshot.annual.minerals.thulium.coverageNote, /no exact commodity rows/i);
assert.match(snapshot.annual.minerals['metallurgical-coal'].coverageNote, /does not publish/i);
assert.match(snapshot.annual.minerals.uranium.coverageNote, /does not publish uranium/i);
assert.equal(snapshot.annual.minerals.graphite.mcsCommodity, 'Graphite (Natural)');

// Group observations remain outside element rows and retain their own declared scope.
assert.deepEqual(Object.keys(snapshot.annual.groupContexts), ['rareEarths', 'heavyRareEarths', 'platinumGroupMetals']);
for (const group of Object.values(snapshot.annual.groupContexts)) {
  assert.equal(group.scope, 'group-context');
  assert.ok(group.mcsCommodity);
  assert.ok(!snapshot.taxonomy.minerals.some(({ mcsCommodity }) => mcsCommodity === group.mcsCommodity),
    `${group.mcsCommodity} must remain group-only context`);
}
assert.equal(snapshot.annual.groupContexts.rareEarths.price, null, 'multiple RE product forms do not become one price');
assert.ok(snapshot.annual.groupContexts.rareEarths.priceVariants.length > 1);
assert.match(snapshot.annual.groupContexts.rareEarths.priceSelectionNote, /multiple product forms/i);
assert.match(snapshot.annual.groupContexts.rareEarths.production.otherNotes || '', /^$/,
  'selected production context does not invent an element-level note');
assert.match(snapshot.taxonomy.boundaries.rareEarths, /15 explicitly denoted/i);

// All retained price/reliance observations preserve their raw source coordinates, codes, notes, forms, and units.
const observationRows = [];
for (const row of [
  ...Object.values(snapshot.annual.minerals),
  ...Object.values(snapshot.annual.groupContexts)
]) {
  observationRows.push(...(row.priceVariants || []), ...(row.netImportRelianceVariants || []));
  for (const series of [...(row.priceSeries || []), ...(row.netImportRelianceSeries || [])]) {
    assert.ok(series.detail && series.unit, 'annual series keeps its form and source-native unit');
    assert.ok(ascending(series.rows, 'year'), `${series.detail} annual rows are ascending`);
    for (const receipt of series.rows) {
      assert.equal(receipt.detail, series.detail, 'annual row form stays inside its exact series');
      assert.equal(receipt.unit, series.unit, 'annual row unit stays inside its exact series');
      assert.match(receipt.year, /^202[1-5]$/);
      observationRows.push(receipt);
    }
  }
  if (row.price) assert.deepEqual(row.priceVariants, [row.price], 'a promoted annual price has exactly one source form');
}
assert.ok(observationRows.length > 500, 'full source-coordinate ledger is retained');
for (const receipt of observationRows) {
  for (const key of ['chapter', 'commodity', 'section', 'country', 'statistic', 'year', 'rawValue', 'qualifier', 'comparable', 'unit', 'detail', 'notes', 'otherNotes']) {
    assert.ok(Object.hasOwn(receipt, key), `USGS receipt keeps ${key}`);
  }
  assert.ok(receipt.chapter && receipt.commodity && receipt.section && receipt.statistic);
  assert.equal(typeof receipt.rawValue, 'string');
  assert.ok(receipt.qualifier);
  assert.equal(typeof receipt.comparable, 'boolean');
}
const qualifierExamples = Object.fromEntries(observationRows.map((row) => [row.qualifier, row.rawValue]));
assert.match(qualifierExamples['greater than'], /^>/);
assert.equal(qualifierExamples['net exporter'], 'E');
assert.equal(qualifierExamples['not available'], 'NA');
assert.match(qualifierExamples['reported range'], /[–-]/);
assert.match(qualifierExamples['less than'], /^</);
assert.equal(snapshot.sources.usgsMcs2026.receipt.encoding, 'Windows-1252');
assert.equal(snapshot.sources.usgsMcs2026.receipt.dataReleaseDoi, '10.5066/P1WKQ63T');
assert.match(snapshot.sources.usgsMcs2026.receipt.fileSha256, /^[0-9a-f]{64}$/);

// Product-form suppressions are deliberate rather than zero or accidental missing values.
const boron = snapshot.annual.minerals.boron;
assert.equal(boron.production, null);
assert.match(boron.coverageNote, /incompatible boron product-form rows/i);
assert.ok(boron.price, 'the separate exact boron price receipt remains available');
const silicon = snapshot.annual.minerals.silicon;
assert.equal(silicon.price, null);
assert.equal(silicon.production, null);
assert.ok(silicon.priceVariants.length > 1);
assert.ok(new Set(silicon.priceVariants.map(({ detail }) => detail)).size > 1);
assert.match(silicon.priceSelectionNote, /multiple product forms/i);
const titanium = snapshot.annual.minerals.titanium;
assert.equal(titanium.mcsCommodity, 'Titanium Sponge Metal');
assert.equal(titanium.price, null);
assert.equal(titanium.production, null);
assert.match(titanium.coverageNote, /sponge metal.*concentrates.*pigment/i);

for (const [id, annual] of Object.entries(snapshot.annual.minerals)) {
  const production = annual.production;
  if (!production) continue;
  assert.ok(production.detail && production.unit, `${id} production keeps one named form and unit`);
  assert.ok(Array.isArray(production.topProducers));
  if (production.worldTotal !== null) {
    assert.equal(production.worldTotal, numberFromRaw(production.worldTotalRaw));
    for (const producer of production.topProducers.filter(({ sharePct }) => sharePct !== null)) {
      approximate(producer.sharePct, (producer.value / production.worldTotal) * 100, 0.001, `${id} ${producer.country} share`);
    }
  }
  assert.match(production.limitations.join(' '), /same source table supplies a compatible world total/i);
}

// World Bank is a ten-series, source-native monthly subset—not a synthetic index or a coal substitution.
assert.equal(snapshot.markets.sourceKey, 'worldBankPinkSheet');
assert.equal(snapshot.markets.frequency, 'monthly nominal-USD source observations');
assert.equal(snapshot.markets.coverage.series, 10);
assert.deepEqual(Object.keys(snapshot.markets.series), EXPECTED_MARKET_KEYS);
assert.deepEqual(Object.keys(WORLD_BANK_SERIES), EXPECTED_MARKET_KEYS);
assert.equal(snapshot.taxonomy.minerals.find(({ id }) => id === 'metallurgical-coal').worldBankSeries, null);
assert.ok(!Object.keys(snapshot.markets.series).some((key) => /coal/i.test(key)));
assert.ok(!Object.hasOwn(snapshot.markets, 'index'));
assert.match(snapshot.markets.methodology.units, /remain separate.*does not normalize/i);
assert.match(snapshot.markets.methodology.execution, /not current bids.*executable prices/i);
assert.match(snapshot.unavailable.find(({ id }) => id === 'met-coal-mcs').reason, /thermal-coal prices are not substituted/i);
assert.match(snapshot.unavailable.find(({ id }) => id === 'cross-unit-index').reason, /not normalized.*synthetic composite/i);

const latestMonths = [];
for (const [key, series] of Object.entries(snapshot.markets.series)) {
  assert.equal(series.seriesId, key);
  assert.equal(series.unit, EXPECTED_MARKET_UNITS[key]);
  assert.equal(series.unit, WORLD_BANK_SERIES[key].unit);
  assert.ok(series.rows.length >= 120, `${key} keeps at least ten years of monthly observations`);
  assert.ok(ascending(series.rows, 'month'), `${key} market rows are ascending`);
  assert.deepEqual(series.latest, series.rows.at(-1));
  assert.equal(series.coverage.from, series.rows[0].month);
  assert.equal(series.coverage.to, series.latest.month);
  assert.equal(series.coverage.observations, series.rows.length);
  latestMonths.push(series.latest.month);
  for (const row of series.rows) {
    assert.match(row.month, /^\d{4}-\d{2}$/);
    assert.ok(Number.isFinite(row.value) && row.value > 0, `${key} retains a positive source observation`);
  }
  for (const receipt of Object.values(series.performancePct || {})) {
    if (!receipt) continue;
    const from = series.rows.find(({ month }) => month === receipt.fromMonth);
    const to = series.rows.find(({ month }) => month === receipt.toMonth);
    assert.ok(from && to, `${key} performance stays inside the same series`);
    approximate(receipt.changePct, ((to.value / from.value) - 1) * 100, 0.0001, `${key} performance`);
  }
}
assert.equal(new Set(latestMonths).size, 1, 'all ten workbook series share one latest completed month');
assert.equal(snapshot.markets.coverage.latestMonth, latestMonths[0]);
assert.equal(entry.headline.monthlySeriesCount, 10);
assert.equal(entry.marketPulse.seriesId, 'copper');
assert.equal(entry.marketPulse.rows.length, 36);
assert.deepEqual(entry.marketPulse.rows, snapshot.markets.series.copper.rows.slice(-36));

// xCo, xNi, and RARE remain bounded chain observations, separate from issuer claims and market evidence.
assert.deepEqual(Object.keys(snapshot.tokenized.products), ['xCo', 'xNi', 'RARE']);
assert.deepEqual(Object.keys(TOKEN_PRODUCTS), ['xCo', 'xNi', 'RARE']);
for (const [key, expected] of Object.entries(EXPECTED_TOKENS)) {
  const product = snapshot.tokenized.products[key];
  assert.equal(product.symbol, key);
  assert.equal(product.catalogStatus, 'live');
  assert.deepEqual(product.commodityIds, expected.commodities);
  assert.equal(product.chain.token.address, expected.address);
  assert.equal(product.chain.token.address, TOKEN_PRODUCTS[key].address);
  assert.equal(product.chain.token.symbol, key);
  assert.equal(product.chain.token.type, 'ERC-20');
  assert.ok(['ok', 'stale', 'unavailable'].includes(product.chain.status));
  assert.equal(product.chain.controls.proxyType, 'eip1967');
  assert.equal(product.chain.controls.implementationAddress, expected.implementation);
  assert.equal(product.chain.controls.verified, true);
  assert.equal(product.chain.coverage.holderRowsReturned, product.chain.topHolders.length);
  assert.equal(product.chain.coverage.transferRowsReturned, product.chain.recentTransfers.length);
  assert.ok(product.chain.coverage.holderRowsReturned <= 50);
  assert.ok(product.chain.coverage.transferRowsReturned <= 50);
  assert.equal(product.chain.coverage.transferPageComplete, false, `${key} latest transfers are explicitly bounded`);
  assert.match(product.chain.coverage.note, /addresses, not people.*bounded latest page.*not complete history or evidence of a trade/i);
  assert.equal(product.issuerClaims.sourceKey, 'metalsIoProducts');
  assert.ok(validIso(product.issuerClaims.claimAt));
  assert.match(product.issuerClaims.limitations.join(' '), /not independent|cannot reconcile/i);
  assert.ok(!Object.hasOwn(product.chain, 'price'));
  assert.ok(!Object.hasOwn(product.chain, 'quote'));
}
assert.match(snapshot.tokenized.boundary, /separate receipts.*none proves the others/i);
assert.match(snapshot.methodology.chain, /addresses are not people.*transfers are not trades/i);
assert.match(snapshot.methodology.productClaims, /does not independently attest backing/i);

const basket = snapshot.tokenized.rareBasket;
assert.equal(basket.productSymbol, 'RARE');
assert.equal(basket.composition.length, 5);
assert.deepEqual(basket.composition.map(({ commodityId }) => commodityId), EXPECTED_TOKENS.RARE.commodities);
assert.deepEqual(basket.composition.map(({ quantity }) => quantity), [10, 10, 25, 150, 150]);
assert.ok(basket.composition.every(({ unit }) => unit === 'grams'));
assert.match(basket.compositionStatus, /five-component.*source inconsistency/i);
assert.match(basket.conflictNote, /product page says five.*help-center sentence says seven.*same five/i);

const catalogBySymbol = new Map(snapshot.tokenized.catalog.products.map((product) => [product.symbol, product]));
assert.equal(catalogBySymbol.get('xCu').status, 'coming-soon');
assert.equal(catalogBySymbol.get('xCu').room, null);
assert.equal(catalogBySymbol.get('xU3O8').room, 'uranium');
assert.equal(catalogBySymbol.get('xU3O8').href, '/uranium/');
assert.equal(catalogBySymbol.get('VNXAU').room, 'metals');
assert.equal(catalogBySymbol.get('VNXAU').href, '/metals/?view=vnxau');
assert.match(snapshot.tokenized.catalog.boundary, /coming soon is not live/i);

// Every source keeps its own status and natural clock; unavailable evidence stays explicit.
assert.deepEqual(Object.keys(snapshot.sources), SOURCE_KEYS);
assert.deepEqual(Object.keys(entry.sourceStatuses), SOURCE_KEYS);
for (const key of SOURCE_KEYS) {
  const source = snapshot.sources[key];
  assert.ok(['ok', 'stale', 'unavailable'].includes(source.status));
  assert.ok(source.label && source.url && source.credit);
  assert.ok(Array.isArray(source.endpoints) && source.endpoints.length > 0);
  assert.equal(entry.sourceStatuses[key].status, source.status);
  assert.equal(entry.sourceStatuses[key].observedAt, source.observedAt || null);
  assert.equal(entry.sourceStatuses[key].retrievedAt, source.retrievedAt || null);
  assert.equal(entry.sourceStatuses[key].reviewedAt, source.reviewedAt || null);
  assert.equal(entry.sourceStatuses[key].expiresAt, source.expiresAt || null);
}
for (const key of ['usgsCriticalList', 'metalsIoCatalog', 'metalsIoProducts']) {
  assert.equal(snapshot.sources[key].retrievedAt, null, `${key} is a dated reviewed receipt, not a live fetch clock`);
  assert.equal(snapshot.sources[key].observedAt, snapshot.sources[key].reviewedAt);
}
for (const [key, symbol] of [['blockscoutXco', 'xCo'], ['blockscoutXni', 'xNi'], ['blockscoutRare', 'RARE']]) {
  const receipt = snapshot.sources[key].receipt;
  assert.equal(receipt.address, EXPECTED_TOKENS[symbol].address);
  assert.equal(receipt.responseSymbol, symbol);
  assert.equal(receipt.transferRowsReturned, 50);
  assert.equal(receipt.transferPageComplete, false);
  assert.equal(receipt.implementationAddress, EXPECTED_TOKENS[symbol].implementation);
  assert.equal(receipt.proxyVerified, true);
}

const unavailableIds = snapshot.unavailable.map(({ id }) => id);
for (const id of [
  'all-live-prices', 'met-coal-mcs', 'uranium-mcs', 'cross-unit-index',
  'token-market-quotes', 'synchronized-backing', 'beneficial-owner-count',
  'complete-transfer-history'
]) assert.ok(unavailableIds.includes(id), `missing unavailable boundary ${id}`);
assert.match(snapshot.unavailable.find(({ id }) => id === 'token-market-quotes').reason, /zero app placeholder is not a price/i);
assert.match(snapshot.unavailable.find(({ id }) => id === 'beneficial-owner-count').reason, /counts addresses.*does not infer people/i);
assert.match(snapshot.unavailable.find(({ id }) => id === 'synchronized-backing').reason, /different clocks.*cannot prove/i);

// Generator mechanics retain source isolation, exact parsing, last-good fallbacks, and atomic paired output.
for (const snippet of [
  "const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024",
  "const MAX_ENTRY_BYTES = 96 * 1024",
  "new TextDecoder('windows-1252')",
  "'Notes', 'Is critical mineral 2025', 'Other notes'",
  "if (raw === '—') return { value: 0, qualifier: 'reported zero'",
  "E: 'net exporter'",
  "NA: 'not available'",
  "W: 'withheld'",
  "s: 'less than one-half unit'",
  'function productionDetailKey(detail)',
  'function attemptSource(key, builder, previousData, previousSource)',
  "data: previousData",
  "status: 'stale'",
  'const previousSources = previous?.sources || {}',
  'stableValue(unsigned)',
  'async function writePairAtomic(snapshot, entry)',
  'const snapshotTemp = `${SNAPSHOT_FILE}.tmp`',
  'await fs.rename(snapshotTemp, SNAPSHOT_FILE)',
  'await fs.rename(entryTemp, ENTRY_FILE)',
  'async function checkCommittedPair()'
]) assert.ok(generator.includes(snippet), `generator contract missing: ${snippet}`);
assert.ok(!/thermal coal/i.test(JSON.stringify(snapshot.markets)), 'thermal coal must not enter the monthly market artifact');

// No execution action is smuggled into artifacts or the browser module.
assert.deepEqual(forbiddenExecutionKeys(snapshot), []);
assert.deepEqual(forbiddenExecutionKeys(entry), []);
assert.ok(!/data-minerals-(?:buy|sell|trade|swap|bridge|redeem|order|wallet|execute)/i.test(feature));
assert.ok(!/(?:window\.ethereum|connectWallet|walletConnect|openTrade|executeSwap)/i.test(feature));
assert.ok(!/fetch\(\s*['"`]https?:/i.test(feature), 'browser reads same-origin generated artifacts only');
assert.match(snapshot.methodology.execution, /read-only.*no buy, sell, swap, bridge, redeem, order, or wallet action/i);
assert.match(feature, /No buy, sell, swap, bridge, or redeem action is provided/i);

// Browser validation, compact-first loading, quiet refresh, route state, and accessibility contracts.
for (const snippet of [
  "const MINERALS_SNAPSHOT_URL = '/data/minerals-snapshot.json'",
  "const MINERALS_ENTRY_SUMMARY_URL = '/data/minerals-entry-summary.json'",
  "fetch(MINERALS_SNAPSHOT_URL, { cache: 'no-cache'",
  "fetch(MINERALS_ENTRY_SUMMARY_URL, { cache: 'no-cache'",
  'mineralsSnapshotHash(summary)',
  "import { assertSnapshotMatchesProjection } from '../core/snapshot-receipt.js'",
  'assertSnapshotMatchesProjection(snapshot, text, sourceReceipt',
  "{ id: 'atlas', label: 'Atlas'",
  "{ id: 'supply', label: 'Supply'",
  "{ id: 'markets', label: 'Markets'",
  "{ id: 'etherlink', label: 'Etherlink'",
  "{ id: 'proofbook', label: 'Proofbook'",
  'quietlySyncHtml(body, markup)',
  'quietlySyncHtml(front, markup)',
  "body.dataset.mineralsRendered === '1'",
  "front.dataset.mineralsRendered === '1'",
  "document.visibilityState !== 'visible'",
  "document.addEventListener('visibilitychange'",
  '__MINERALS_CHAMBER_REFRESH_MS__',
  '__MINERALS_ENTRY_REFRESH_MS__',
  'refreshDeferred = true',
  'entryRefreshDeferred = true',
  'last-good retained',
  'data-quiet-key="minerals-header"',
  'data-quiet-key="minerals-view-panel"',
  'data-minerals-view',
  'data-minerals-search-input',
  'data-minerals-series',
  'snapshot?.annual?.groupContexts',
  'annual.coverageNote',
  'Group-only MCS context',
  'Exact-row coverage notes',
  '`mcs-${mineral.id}-coverage`',
  "url.searchParams.set('view', currentView)",
  "url.searchParams.set('series', currentSeries)",
  "url.searchParams.set('range', currentRange.toLowerCase())",
  "overlay.id = 'minerals-modal'",
  "aria-label=\"Close Critical Minerals Chamber\""
]) assert.ok(feature.includes(snippet), `browser/quiet contract missing: ${snippet}`);
assert.match(css, /\[data-quiet-refreshing="true"\]/);
assert.match(css, /\[data-quiet-refresh-settled="true"\]/);
assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
for (const selector of [
  '.minerals-entry-card', '.minerals-content', '.minerals-body',
  '.minerals-atlas-directory', '.minerals-supply-table', '.minerals-market-console',
  '.minerals-token-grid', '.minerals-proof-grid', '.minerals-coverage-grid',
  '.minerals-group-context-grid'
]) assert.ok(css.includes(selector), `CSS selector missing ${selector}`);
assert.ok(feature.includes('minerals-tabs market-room-tabs') && marketCss.includes('.market-room-tabs'), 'shared Minerals tab structure missing');

// Canonical route, discovery graph, app lifecycle, generated surfaces, and public data API.
const route = CHAMBER_ROUTES.find(({ slug }) => slug === 'minerals');
assert.ok(route);
assert.equal(route.hash, '#minerals');
assert.equal(routeUrl(route), 'https://tezos.systems/minerals/');
assert.match(route.description, /60-item.*USGS.*World Bank.*xCo, xNi, and RARE/i);
for (const snippet of [
  "id: 'minerals'",
  "href: '/minerals/'",
  "hashAliases: ['#critical-minerals', '#strategic-minerals']",
  "href: '/minerals/?view=atlas'",
  "href: '/minerals/?view=supply'",
  "href: '/minerals/?view=markets'",
  "href: '/minerals/?view=etherlink'",
  "href: '/minerals/?view=proofbook'",
  "minerals: ['uranium', 'metals', 'capital', 'tezosx']"
]) assert.ok(siteMap.includes(snippet), `site-map contract missing ${snippet}`);
const featureCatalog = await fs.readFile(new URL('../js/core/chamber-features.mjs', import.meta.url), 'utf8');
for (const snippet of [
  "modulePath: '../features/minerals-chamber.js'",
  "init: 'initMineralsChamber'",
  'closeMineralsChamber'
]) assert.ok(featureCatalog.includes(snippet), `feature catalog missing ${snippet}`);
for (const snippet of [
  "() => openChamberFeature('minerals')",
  "case 'minerals':",
  "params.has('critical-minerals')",
  "params.has('strategic-minerals')",
  "'minerals-modal': { entryIds: ['minerals']",
  "minerals: { selector: '#minerals-entry-card', layout: 'featured' }"
]) assert.ok(app.includes(snippet), `app integration missing ${snippet}`);
assert.ok(!indexHtml.includes('<link rel="modulepreload" href="js/features/minerals-chamber.js">'),
  'Critical Minerals must stay out of the eager module-preload closure');
assert.ok(wayfinder.includes("'minerals-modal': 'minerals'"));
assert.ok(ogGenerator.includes('minerals: {'));
assert.ok(changelog.includes('Critical Minerals Chamber now maps the official 60-item'));

assert.ok(routeHtml, 'generated minerals/index.html route shell is missing');
assert.ok(routeHtml.includes('data-chamber-route="minerals"'));
assert.ok(routeHtml.includes('<link rel="canonical" href="https://tezos.systems/minerals/">'));
assert.ok(routeHtml.includes('/og/minerals.png'));
assert.equal(openApi.paths?.['/data/minerals-snapshot.json']?.get?.operationId, 'getMineralsSnapshot');
assert.equal(openApi.paths?.['/data/minerals-entry-summary.json']?.get?.operationId, 'getMineralsEntrySummary');
assert.ok(sw.includes("'/data/minerals-entry-summary.json'"));
assert.ok(sw.includes("'/data/minerals-snapshot.json'"));
assert.ok(sw.includes('isNetworkOnlyDataPath(url.pathname)'));
assert.ok(sw.includes("fetchWithTimeout(request, API_NETWORK_TIMEOUT_MS, { cache: 'no-store' })"));
assert.ok(sw.includes('return unavailableDataResponse()'));
assert.equal(packageJson.scripts?.['refresh:minerals'], 'node scripts/refresh-minerals-data.mjs');
assert.equal(packageJson.scripts?.['check:minerals'], 'node scripts/refresh-minerals-data.mjs --check');
assert.equal(packageJson.scripts?.['test:minerals'], 'node tests/minerals-check.mjs');
for (const snippet of [
  "const MINERALS_TARGETS = ['data/minerals-snapshot.json', 'data/minerals-entry-summary.json']",
  "nodeScript('scripts/refresh-minerals-data.mjs', ['--check'])",
  "nodeScript('scripts/refresh-minerals-data.mjs')",
  'stageTargets(MINERALS_TARGETS)'
]) assert.ok(generatedSurfaces.includes(snippet), `generated-surface integration missing ${snippet}`);

for (const asset of [
  'assets/minerals/minerals-core.webp',
  'assets/minerals/minerals-core-640.webp',
  'assets/minerals/minerals-launcher.webp',
  'assets/minerals/minerals-launcher-480.webp'
]) {
  const stat = await fs.stat(path.join(ROOT, asset));
  assert.ok(stat.isFile() && stat.size > 10_000, `${asset} must be a nontrivial generated image asset`);
  assert.ok(feature.includes(`/${asset}`), `${asset} must be referenced by the feature`);
}

assert.ok(smoke.includes('async function smokeMineralsChamber('), 'focused Minerals browser smoke implementation missing');
assert.ok(smoke.includes("name: 'minerals-chamber'"), 'focused Minerals browser smoke registration missing');

// The generator's offline validator independently accepts the committed pair.
const offlineCheck = execFileSync(process.execPath, ['scripts/refresh-minerals-data.mjs', '--check'], {
  cwd: ROOT,
  encoding: 'utf8'
});
assert.match(offlineCheck, /ok - Minerals artifacts/);

process.stdout.write(`ok - Minerals 60-item taxonomy, USGS forms, World Bank subset, Etherlink receipts, quiet UI, routes, and ${SOURCE_KEYS.length} independent sources\n`);
