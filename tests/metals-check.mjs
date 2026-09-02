#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHAMBER_ROUTES, routeUrl } from '../scripts/lib/chamber-routes.mjs';
import { compositeEvidenceStatus } from '../scripts/refresh-metals-data.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SNAPSHOT_PATH = 'data/metals-snapshot.json';
const ENTRY_PATH = 'data/metals-entry-summary.json';
const MAX_SNAPSHOT_BYTES = 768 * 1024;
const MAX_ENTRY_BYTES = 96 * 1024;
const ETHERLINK = '0x93f5475da60143c50e8be3fed10c143b0cf8b9e9';
const TEZOS = 'KT1LSH97386CURN9FgRNqdQJoHaHY6e1vxUv';
const EXPECTED_IDS = ['gold', 'silver', 'platinum', 'palladium', 'rhodium', 'ruthenium', 'iridium', 'osmium'];
const EXPECTED_SYMBOLS = ['Au', 'Ag', 'Pt', 'Pd', 'Rh', 'Ru', 'Ir', 'Os'];
const EXPECTED_ATOMIC_NUMBERS = [79, 47, 78, 46, 45, 44, 77, 76];
const INTERNAL_KEYS = ['XAU', 'XAG', 'XPT', 'XPD', 'XRH', 'XRU', 'XIR', 'XOS'];
const SOURCE_KEYS = [
  'federalTaxonomy',
  'usgsMcs2026',
  'goldApiXau',
  'goldApiXag',
  'goldApiXpt',
  'goldApiXpd',
  'imfPcps',
  'metalsIo',
  'vnxIssuer',
  'vnxReserveAup',
  'coinGeckoVnxau',
  'blockscoutVnxau',
  'blockscoutContractsVnxau',
  'tzktVnxau'
];

const readText = (file) => fs.readFile(path.join(ROOT, file), 'utf8');
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
  smoke
] = await Promise.all([
  readText(SNAPSHOT_PATH),
  readText(ENTRY_PATH),
  readText('scripts/refresh-metals-data.mjs'),
  readText('js/features/metals-chamber.js'),
  readText('css/metals-chamber.css'),
  readText('css/market-room.css'),
  readText('js/core/app.js'),
  readText('js/core/site-map.js'),
  readText('js/ui/wayfinder.js'),
  readText('scripts/generate-chamber-og-images.mjs'),
  readText('scripts/refresh-generated-surfaces.mjs'),
  readText('sw.js'),
  readText('.well-known/openapi.json'),
  readText('metals/index.html'),
  readText('package.json'),
  readText('tests/smoke.mjs')
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

function finite(value) {
  return value !== null && value !== '' && Number.isFinite(Number(value));
}

function approximately(actual, expected, tolerance, message) {
  assert.ok(finite(actual) && finite(expected), `${message}: values must be finite`);
  assert.ok(Math.abs(Number(actual) - Number(expected)) <= tolerance,
    `${message}: expected ${expected}, received ${actual}`);
}

function ascending(rows, key) {
  return rows.every((row, index) => index === 0 || String(rows[index - 1]?.[key]) < String(row?.[key]));
}

function internalKey(row) {
  if (row.marketSymbol) return row.marketSymbol;
  return `X${String(row.symbol || '').toUpperCase()}`;
}

function forbiddenExecutionKeys(value, prefix = '') {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) {
    return value.flatMap((child, index) => forbiddenExecutionKeys(child, `${prefix}[${index}]`));
  }
  return Object.entries(value).flatMap(([key, child]) => {
    const current = prefix ? `${prefix}.${key}` : key;
    return [
      ...(/^(?:trade|buy|sell|swap|order|wallet|execute|execution|action)Url$/i.test(key) ? [current] : []),
      ...forbiddenExecutionKeys(child, current)
    ];
  });
}

// Independent envelope and stable receipt verification.
assert.equal(snapshot.schemaVersion, 1);
assert.equal(entry.schemaVersion, 1);
assert.ok(validIso(snapshot.generatedAt));
assert.equal(entry.generatedAt, snapshot.generatedAt);
assert.equal(snapshot.contentHash, stableReceiptHash(snapshot), 'snapshot stable SHA-256 receipt');
assert.equal(entry.contentHash, stableReceiptHash(entry), 'entry stable SHA-256 receipt');
assert.ok(Buffer.byteLength(snapshotText) <= MAX_SNAPSHOT_BYTES, 'snapshot byte budget');
assert.ok(Buffer.byteLength(entryText) <= MAX_ENTRY_BYTES, 'entry byte budget');
assert.equal(entry.source.path, SNAPSHOT_PATH);
assert.equal(entry.source.schemaVersion, snapshot.schemaVersion);
assert.equal(entry.source.generatedAt, snapshot.generatedAt);
assert.equal(entry.source.contentHash, snapshot.contentHash);
assert.equal(entry.source.fileSha256, sha256(snapshotText), 'entry exact source-file SHA-256 receipt');
assert.deepEqual(entry.metals, snapshot.metals, 'compact entry must retain all eight availability rows exactly');

// Canonical federal/USGS taxonomy and explicit non-members.
assert.deepEqual(snapshot.metals.map(({ id }) => id), EXPECTED_IDS);
assert.deepEqual(snapshot.metals.map(({ symbol }) => symbol), EXPECTED_SYMBOLS);
assert.deepEqual(snapshot.metals.map(({ atomicNumber }) => atomicNumber), EXPECTED_ATOMIC_NUMBERS);
assert.deepEqual(snapshot.metals.map(internalKey), INTERNAL_KEYS);
assert.deepEqual(snapshot.taxonomy.includedSymbols, EXPECTED_SYMBOLS);
assert.match(snapshot.taxonomy.definition, /gold, silver, and the six platinum-group metals/i);
assert.ok(snapshot.taxonomy.authorities.some(({ citation }) => citation === '41 CFR 109-27.5101'));
assert.ok(snapshot.taxonomy.authorities.some(({ citation }) => /USGS/i.test(citation)));
for (const excluded of ['uranium', 'nickel', 'cobalt', 'copper', 'rare-basket']) {
  assert.ok(snapshot.taxonomy.exclusions.some(({ id }) => id === excluded), `${excluded} exclusion receipt`);
  assert.ok(!snapshot.metals.some(({ id }) => id === excluded), `${excluded} is not classified as precious`);
}
assert.deepEqual(entry.taxonomy.includedSymbols, EXPECTED_SYMBOLS);
assert.deepEqual(entry.taxonomy.exclusions, snapshot.taxonomy.exclusions);

// Indicative-current quote overlay: only the quartet, with independent clocks and source limits.
for (const row of snapshot.metals.slice(0, 4)) {
  assert.ok(['XAU', 'XAG', 'XPT', 'XPD'].includes(row.marketSymbol));
  assert.ok(['ok', 'stale', 'unavailable'].includes(row.quote.status));
  assert.equal(row.quote.kind, 'indicative-current-quote');
  assert.equal(row.quote.currency, 'USD');
  assert.equal(row.quote.unit, 'USD per troy ounce');
  assert.match(row.quote.methodology, /does not disclose contributing venues|No current value was accepted/i);
  assert.match(JSON.stringify(row.quote.limitations), /not an official fixing|no last-good receipt/i);
  if (row.quote.priceUsdPerTroyOunce !== null) {
    assert.ok(row.quote.priceUsdPerTroyOunce > 0);
    assert.ok(validIso(row.quote.observedAt));
    assert.ok(validIso(row.quote.retrievedAt));
  }
  assert.equal(row.quote.sourceKey, `goldApi${row.marketSymbol.charAt(0)}${row.marketSymbol.slice(1).toLowerCase()}`);
}
for (const row of snapshot.metals.slice(4)) {
  assert.equal(row.quote.status, 'unavailable');
  assert.equal(row.quote.priceUsdPerTroyOunce, null);
  assert.equal(row.marketSymbol, null);
}
const sourceClockPairs = snapshot.metals.slice(0, 4).map(({ quote }) => `${quote.sourceKey}:${quote.observedAt}`);
assert.equal(new Set(sourceClockPairs.map((value) => value.split(':')[0])).size, 4, 'one independent source receipt per quoted metal');

// USGS MCS 2026 annual context is separate from current quotes; osmium remains unavailable.
const annualExpected = new Map([['Pt', 1200], ['Pd', 1100], ['Rh', 5800], ['Ru', 690], ['Ir', 4400]]);
for (const [symbol, expected] of annualExpected) {
  const context = snapshot.metals.find((row) => row.symbol === symbol).annualContext;
  assert.equal(context.status, 'ok');
  assert.equal(context.kind, 'estimated-annual-average');
  assert.equal(context.referenceYear, 2025);
  assert.equal(context.priceUsdPerTroyOunce, expected);
  assert.match(context.note, /not a current quote or executable price/i);
}
const osmium = snapshot.metals.find(({ symbol }) => symbol === 'Os');
assert.equal(osmium.annualContext.status, 'unavailable');
assert.equal(osmium.annualContext.priceUsdPerTroyOunce, null);
assert.match(osmium.annualContext.note, /unavailable is not zero/i);
assert.equal(snapshot.taxonomy.usgs2026Context.estimateYear, 2025);
assert.equal(snapshot.taxonomy.usgs2026Context.estimatedAnnualAveragePrices.osmium, null);
assert.match(snapshot.taxonomy.usgs2026Context.rightsBoundary, /generally public domain/i);
assert.match(snapshot.taxonomy.usgs2026Context.rightsBoundary, /third-party rights|source terms/i);

// IMF PCPS is the all-available completed-month backbone; no current overlay is spliced in.
assert.equal(snapshot.marketHistory.sourceKey, 'imfPcps');
assert.equal(snapshot.marketHistory.frequency, 'monthly completed-period averages');
assert.equal(snapshot.marketHistory.unit, 'USD per troy ounce');
assert.match(snapshot.marketHistory.methodology.currentQuoteSeparation, /not appended|not.*substituted/i);
assert.deepEqual(Object.keys(snapshot.marketHistory.series), ['XAU', 'XAG', 'XPD', 'XPT']);
assert.equal(snapshot.marketHistory.preciousMetalsIndex.seriesId, 'PPMETA');
const latestMonths = [];
for (const [symbol, series] of Object.entries(snapshot.marketHistory.series)) {
  assert.ok(['PGOLD', 'PSILVER', 'PPALLA', 'PPLAT'].includes(series.seriesId), `${symbol} IMF series id`);
  assert.ok(series.rows.length >= 120, `${symbol} retains at least ten years`);
  assert.ok(ascending(series.rows, 'month'), `${symbol} rows are ascending`);
  assert.equal(series.coverage.from, series.rows[0].month);
  assert.equal(series.coverage.to, series.rows.at(-1).month);
  assert.equal(series.coverage.observations, series.rows.length);
  assert.deepEqual(series.latest, series.rows.at(-1));
  latestMonths.push(series.latest.month);
  for (const performance of Object.values(series.performancePct)) {
    if (!performance) continue;
    const from = series.rows.find(({ month }) => month === performance.fromMonth);
    const to = series.rows.find(({ month }) => month === performance.toMonth);
    assert.ok(from && to, `${symbol} performance endpoints exist`);
    approximately(performance.changePct,
      ((to.priceUsdPerTroyOunce / from.priceUsdPerTroyOunce) - 1) * 100,
      0.0001,
      `${symbol} aligned performance`);
  }
}
assert.equal(new Set(latestMonths).size, 1, 'IMF quartet shares one latest completed month');
assert.equal(snapshot.marketHistory.coverage.latestCompletedMonth, latestMonths[0]);
assert.ok(snapshot.marketHistory.preciousMetalsIndex.rows.length >= 120);
assert.ok(ascending(snapshot.marketHistory.preciousMetalsIndex.rows, 'month'));

for (const ratio of Object.values(snapshot.marketHistory.alignedRatios)) {
  assert.equal(ratio.alignment, 'same completed IMF month only');
  assert.ok(ascending(ratio.rows, 'month'));
  const numerator = new Map(snapshot.marketHistory.series[ratio.numerator].rows.map((row) => [row.month, row.priceUsdPerTroyOunce]));
  const denominator = new Map(snapshot.marketHistory.series[ratio.denominator].rows.map((row) => [row.month, row.priceUsdPerTroyOunce]));
  for (const row of ratio.rows) {
    assert.ok(numerator.has(row.month) && denominator.has(row.month), 'ratio month exists in both source series');
    approximately(row.value, numerator.get(row.month) / denominator.get(row.month), 0.000001, `${ratio.numerator}/${ratio.denominator} ${row.month}`);
  }
}

for (const [symbol, series] of Object.entries(entry.marketHistory.series)) {
  assert.ok(series.rows.length <= 120, `${symbol} compact history is bounded`);
  assert.deepEqual(series.completeCoverage, snapshot.marketHistory.series[symbol].coverage);
  assert.deepEqual(series.rows, snapshot.marketHistory.series[symbol].rows.slice(-120));
}
for (const [key, ratio] of Object.entries(entry.marketHistory.alignedRatios)) {
  assert.ok(ratio.rows.length <= 120, `${key} compact ratio is bounded`);
  assert.deepEqual(ratio.rows, snapshot.marketHistory.alignedRatios[key].rows.slice(-120));
}
assert.match(snapshot.sources.imfPcps.receipt.workbookSha256, /^[0-9a-f]{64}$/);
assert.ok(snapshot.sources.imfPcps.receipt.workbookBytes > 100_000);
assert.equal(snapshot.sources.imfPcps.receipt.latestCompletedMonth, latestMonths[0]);

// Metals.io/VNX product status and claim boundaries.
const vnx = snapshot.vnxau;
assert.equal(vnx.identity.id, 'vnx-gold');
assert.equal(vnx.identity.symbol, 'VNXAU');
assert.equal(vnx.identity.etherlinkContract.toLowerCase(), ETHERLINK);
assert.equal(vnx.identity.tezosHistoricalContract, TEZOS);
assert.match(vnx.identity.assetDenomination, /issuer-described one gram/i);
assert.equal(vnx.issuer.productStatus.status, 'live');
assert.equal(vnx.issuer.productStatus.networkIssueDateShownForEtherlink, '2026-03-16');
assert.equal(entry.vnxau.productStatus.status, 'live');
const productRows = vnx.issuer.catalog.preciousMetals;
assert.equal(productRows.find(({ symbol }) => symbol === 'xAg').productStatus, 'coming-soon');
assert.equal(productRows.find(({ symbol }) => symbol === 'xPd').productStatus, 'coming-soon');
for (const id of ['platinum', 'rhodium', 'ruthenium', 'iridium', 'osmium']) {
  assert.equal(productRows.find(({ metal }) => metal === id).productStatus, 'unlisted', `${id} remains unlisted`);
}
for (const symbol of ['xU3O8', 'xCo', 'xNi', 'RARE']) {
  assert.ok(vnx.issuer.catalog.adjacentExcludedProducts.some((row) => row.symbol === symbol && /not.*precious|not one of the eight/i.test(row.exclusion)), `${symbol} remains adjacent/excluded`);
}
assert.equal(vnx.issuer.terms.denomination.gramsPerToken, 1);
assert.match(vnx.issuer.terms.denomination.claimType, /issuer statement/i);
assert.equal(vnx.issuer.terms.redemption.minimumGrams, 1000);
assert.equal(vnx.issuer.terms.priceDiscovery.formalSpotPeg, false);
assert.match(vnx.issuer.terms.priceDiscovery.boundary, /remain separate/i);
assert.equal(vnx.issuer.operationalNotice.exchangeOperationsSuspendedAt, 'June 30, 2026 at 18:00 CET');
assert.equal(vnx.issuer.operationalNotice.bridgingEndedAt, 'June 30, 2026 at 18:00 CET');
assert.equal(vnx.issuer.operationalNotice.withdrawalWindowEndedAt, 'July 31, 2026 at 18:00 CET');
assert.equal(vnx.issuer.operationalNotice.sourceClockLiteral, '18:00 CET');
assert.equal(vnx.issuer.operationalNotice.normalizedUtc, null);
assert.match(vnx.issuer.operationalNotice.note, /preserved literally.*No UTC conversion is inferred/i);
assert.ok(!JSON.stringify(vnx.issuer.operationalNotice).includes('16:00'), 'VNX notice must not infer a UTC clock');
assert.match(vnx.issuer.operationalNotice.appliesTo, /legacy vnx\.li/i);

// CoinGecko is market/mapping context, never issuer/backing proof or physical spot.
assert.equal(vnx.market.coin.id, 'vnx-gold');
assert.equal(vnx.market.coin.symbol, 'VNXAU');
assert.equal(vnx.market.coin.platforms.etherlink.toLowerCase(), ETHERLINK);
assert.equal(vnx.market.coin.platforms.tezos, TEZOS);
assert.ok(vnx.market.coin.change24hPct === null || finite(vnx.market.coin.change24hPct));
assert.ok(vnx.market.priceHistoryUsd.length >= 30);
assert.ok(ascending(vnx.market.priceHistoryUsd, 'timestamp'));
assert.ok(vnx.market.venueMappings.length <= 25);
assert.ok(vnx.market.venueMappings.every((row) => !Object.hasOwn(row, 'tradeUrl')));
assert.match(vnx.market.boundaries.mapping, /do not independently prove issuer identity, custody, backing/i);
assert.match(vnx.market.boundaries.price, /token prices.*not current physical-gold spot/i);

// Etherlink token/transfer/verified-contract receipts stay bounded and address-based.
assert.equal(vnx.etherlink.token.address.toLowerCase(), ETHERLINK);
assert.equal(vnx.etherlink.token.symbol, 'VNXAU');
assert.equal(vnx.etherlink.token.type, 'ERC-20');
assert.equal(vnx.etherlink.token.decimals, 18);
assert.ok(finite(vnx.etherlink.token.totalSupply));
assert.ok(finite(vnx.etherlink.counters.transfersCount));
assert.ok(vnx.etherlink.topHolders.length <= 50);
assert.ok(vnx.etherlink.latestTransfers.length <= 50);
assert.ok(vnx.etherlink.topHolders.every((row) => /^0x[0-9a-f]{40}$/i.test(row.address)));
assert.ok(vnx.etherlink.latestTransfers.every((row) => /^0x[0-9a-f]{64}$/i.test(row.transactionHash)));
assert.match(vnx.etherlink.coverage.identity, /not asserted to identify a person or common owner/i);
assert.equal(vnx.etherlink.contracts.proxy.isVerified, true);
assert.equal(vnx.etherlink.contracts.implementation.isVerified, true);
assert.ok(vnx.etherlink.contracts.implementation.abiFunctionNames.includes('totalSupply'));
assert.match(vnx.etherlink.contracts.boundary, /capabilities only|do not prove/i);
const expectedEtherlinkStatus = [snapshot.sources.blockscoutVnxau.status, snapshot.sources.blockscoutContractsVnxau.status].every((status) => status === 'unavailable')
  ? 'unavailable'
  : [snapshot.sources.blockscoutVnxau.status, snapshot.sources.blockscoutContractsVnxau.status].some((status) => status === 'unavailable' || status === 'partial')
    ? 'partial'
    : [snapshot.sources.blockscoutVnxau.status, snapshot.sources.blockscoutContractsVnxau.status].some((status) => status === 'stale')
      ? 'stale'
      : 'ok';
assert.equal(vnx.etherlink.status, expectedEtherlinkStatus, 'Etherlink composite status includes token and contract-lineage health');
for (const [statuses, expected] of [
  [[], 'unavailable'],
  [['unavailable', 'unavailable'], 'unavailable'],
  [['ok', 'unavailable'], 'partial'],
  [['ok', 'partial'], 'partial'],
  [['ok', 'stale'], 'stale'],
  [['stale', 'stale'], 'stale'],
  [['ok', 'ok'], 'ok']
]) {
  assert.equal(compositeEvidenceStatus(...statuses), expected, `Etherlink composite permutation ${statuses.join('+') || 'empty'}`);
}

// Historical Tezos KT1 is kept separate and fail-closed.
assert.equal(vnx.tezosHistorical.contract.address, TEZOS);
assert.equal(vnx.tezosHistorical.state, 'deployed-no-current-indexed-token-rows-or-ledger-keys');
assert.equal(vnx.tezosHistorical.contract.tokensCount, 0);
assert.equal(vnx.tezosHistorical.contract.tokenBalancesCount, 0);
assert.equal(vnx.tezosHistorical.contract.tokenTransfersCount, 0);
assert.equal(vnx.tezosHistorical.indexedTokens.length, 0);
assert.ok(vnx.tezosHistorical.bigMaps.some((row) => row.path === 'ledger' && row.active && row.totalKeys === 0));
assert.match(vnx.tezosHistorical.coverage.state, /not proof that tokens were never issued/i);
assert.match(vnx.tezosHistorical.coverage.identity, /not asserted to identify a person/i);
assert.match(vnx.tezosHistorical.coverage.networkSeparation, /not added to.*Etherlink/i);

// The dated AUP never becomes an Etherlink backing ratio.
const aup = vnx.issuer.reserveAup;
assert.match(aup.reportType, /agreed-upon procedures/i);
assert.equal(aup.isAudit, false);
assert.equal(aup.isReview, false);
assert.equal(aup.providesAssuranceOpinion, false);
assert.equal(aup.statementAsAt, '2025-12-31T23:59:59.000Z');
assert.ok(!aup.coveredNetworks.includes('etherlink') && !aup.coveredNetworks.includes('tezos'));
assert.ok(aup.networksNotSpecificallyReconciled.includes('etherlink'));
assert.ok(aup.networksNotSpecificallyReconciled.includes('tezos'));
assert.equal(aup.currentBackingRatio, null);
assert.match(aup.currentEtherlinkBackingReconciliation, /not established/i);
assert.match(aup.file.sha256, /^[0-9a-f]{64}$/);
assert.ok(aup.file.bytes > 100_000);
for (const boundary of ['addressIdentity', 'registryMapping', 'priceSeparation', 'reserveScope', 'networkSupply', 'contractCapability', 'noExecution']) {
  assert.equal(typeof vnx.boundaries[boundary], 'string', `VNX boundary ${boundary}`);
}

// Every source keeps a check clock and independently degradable status; entry mirrors it.
assert.deepEqual(Object.keys(snapshot.sources), SOURCE_KEYS);
assert.deepEqual(Object.keys(entry.sourceStatuses), SOURCE_KEYS);
for (const key of SOURCE_KEYS) {
  const source = snapshot.sources[key];
  const projected = entry.sourceStatuses[key];
  assert.ok(['ok', 'stale', 'unavailable'].includes(source.status), `${key} status`);
  assert.ok(validIso(source.checkedAt), `${key} checkedAt`);
  assert.deepEqual(projected, {
    status: source.status,
    observedAt: source.observedAt || null,
    retrievedAt: source.retrievedAt || null,
    checkedAt: source.checkedAt,
    reviewedAt: source.reviewedAt || null,
    lastGoodAt: source.lastGoodAt || null,
    error: source.error || null
  });
}
for (const key of ['federalTaxonomy', 'usgsMcs2026', 'metalsIo', 'vnxIssuer']) {
  const source = snapshot.sources[key];
  assert.equal(source.retrievedAt, null, `${key} is a reviewed receipt, not a network retrieval`);
  assert.equal(source.checkedAt, source.reviewedAt, `${key} checkedAt must remain its actual review clock`);
  assert.equal(source.checkedAt, source.receipt.reviewedAt, `${key} receipt review clock must agree`);
}
for (const snippet of [
  'async function buildWithFallback',
  'function compositeEvidenceStatus(...statuses)',
  "normalized.every((status) => status === 'unavailable')",
  "status === 'unavailable' || status === 'partial'",
  "normalized.some((status) => status === 'stale')",
  'status: compositeEvidenceStatus(blockscoutToken.status, blockscoutContracts.status)',
  "data: markStatus(previousData, 'stale')",
  "data: markStatus(unavailableData, 'unavailable')",
  'lastGoodAt:',
  'previousSources',
  'stableValue(unsigned)',
  'MAX_SNAPSHOT_BYTES',
  'MAX_ENTRY_BYTES'
]) {
  assert.ok(generator.includes(snippet), `generator fallback/integrity contract missing: ${snippet}`);
}

// No execution surface is smuggled into either artifact or browser module.
assert.deepEqual(forbiddenExecutionKeys(snapshot), []);
assert.deepEqual(forbiddenExecutionKeys(entry), []);
assert.ok(!/data-metals-(?:buy|sell|trade|swap|bridge|redeem)|tradeUrl/i.test(feature));
assert.ok(!/fetch\(\s*['"`]https?:/i.test(feature), 'browser reads same-origin generated artifacts only');
assert.match(snapshot.methodology.noExecution, /No trading, order-routing, wallet, or transaction-action/i);

// Browser, quiet-refresh, route, generated, OpenAPI, and service-worker contracts.
for (const snippet of [
  "const METALS_SNAPSHOT_URL = '/data/metals-snapshot.json'",
  "const METALS_ENTRY_SUMMARY_URL = '/data/metals-entry-summary.json'",
  "fetch(METALS_SNAPSHOT_URL, { cache: 'no-cache'",
  "fetch(METALS_ENTRY_SUMMARY_URL, { cache: 'no-cache'",
  'metalsSnapshotHash(summary)',
  'quietlySyncHtml(body, markup)',
  'quietlySyncHtml(front, markup)',
  "body.dataset.metalsRendered === '1'",
  "front.dataset.metalsRendered === '1'",
  "document.visibilityState !== 'visible'",
  "document.addEventListener('visibilitychange'",
  '__METALS_CHAMBER_REFRESH_MS__',
  'refreshDeferred = true',
  'Last good',
  'data-quiet-key="metals-header"',
  'data-quiet-key="metals-view-panel"',
  'data-metals-view',
  'data-metals-metal',
  "url.searchParams.set('view', currentView)",
  "url.searchParams.set('metal', currentMetal)",
  "overlay.id = 'metals-modal'"
]) {
  assert.ok(feature.includes(snippet), `browser/quiet contract missing: ${snippet}`);
}
assert.match(css, /\[data-quiet-refreshing="true"\]/);
assert.match(css, /\[data-quiet-refresh-settled="true"\]/);
assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
for (const selector of ['.metals-entry-card', '.metals-content', '.metals-body', '.metals-assay-grid', '.metals-clock-pair', '.metals-chain-grid', '.metals-proof-grid']) {
  assert.ok(css.includes(selector), `CSS selector missing ${selector}`);
}
assert.ok(feature.includes('metals-tabs market-room-tabs') && marketCss.includes('.market-room-tabs'), 'shared Metals tab structure missing');

const route = CHAMBER_ROUTES.find(({ slug }) => slug === 'metals');
assert.ok(route);
assert.equal(route.hash, '#metals');
assert.equal(routeUrl(route), 'https://tezos.systems/metals/');
assert.match(route.description, /without inferring backing/i);
for (const snippet of [
  "id: 'metals'",
  "href: '/metals/'",
  "href: '/metals/?view=assay'",
  "href: '/metals/?view=markets'",
  "href: '/metals/?view=vnxau'",
  "href: '/metals/?view=proofbook'"
]) {
  assert.ok(siteMap.includes(snippet), `site-map contract missing ${snippet}`);
}
const featureCatalog = await fs.readFile(new URL('../js/core/chamber-features.mjs', import.meta.url), 'utf8');
for (const snippet of ['initMetalsChamber', 'closeMetalsChamber']) {
  assert.ok(featureCatalog.includes(snippet), `feature catalog missing ${snippet}`);
}
for (const snippet of [
  "case 'metals':",
  "params.has('precious-metals')",
  "'metals-modal': { entryIds: ['metals']",
  "metals: { selector: '#metals-entry-card', layout: 'featured' }"
]) {
  assert.ok(app.includes(snippet), `app integration missing ${snippet}`);
}
assert.ok(wayfinder.includes("'metals-modal': 'metals'"));
assert.ok(ogGenerator.includes('metals: {'));
assert.ok(routeHtml.includes('data-chamber-route="metals"'));
assert.ok(routeHtml.includes('<link rel="canonical" href="https://tezos.systems/metals/">'));
assert.ok(routeHtml.includes('/og/metals.png'));
assert.equal(openApi.paths?.['/data/metals-snapshot.json']?.get?.operationId, 'getMetalsSnapshot');
assert.equal(openApi.paths?.['/data/metals-entry-summary.json']?.get?.operationId, 'getMetalsEntrySummary');
assert.ok(sw.includes("'/data/metals-entry-summary.json'"));
assert.ok(sw.includes("'/data/metals-snapshot.json'"));
assert.ok(sw.includes('isNetworkOnlyDataPath(url.pathname)'));
assert.ok(sw.includes("fetchWithTimeout(request, API_NETWORK_TIMEOUT_MS, { cache: 'no-store' })"));
assert.ok(sw.includes('return unavailableDataResponse()'));
assert.equal(packageJson.scripts?.['refresh:metals'], 'node scripts/refresh-metals-data.mjs');
assert.equal(packageJson.scripts?.['check:metals'], 'node scripts/refresh-metals-data.mjs --check');
assert.equal(packageJson.scripts?.['test:metals'], 'node tests/metals-check.mjs');
for (const snippet of [
  "const METALS_TARGETS = ['data/metals-snapshot.json', 'data/metals-entry-summary.json']",
  "nodeScript('scripts/refresh-metals-data.mjs', ['--check'])",
  "nodeScript('scripts/refresh-metals-data.mjs')",
  'stageTargets(METALS_TARGETS)'
]) {
  assert.ok(generatedSurfaces.includes(snippet), `generated-surface integration missing ${snippet}`);
}
assert.ok(smoke.includes("name: 'metals-chamber'"), 'focused browser smoke registration missing');

// The generator's own offline validator must independently accept the committed pair.
const offlineCheck = execFileSync(process.execPath, ['scripts/refresh-metals-data.mjs', '--check'], {
  cwd: ROOT,
  encoding: 'utf8'
});
assert.match(offlineCheck, /ok - Metals snapshot and entry summary valid/);

process.stdout.write(`ok - Metals taxonomy, IMF history, VNXAU receipts, source clocks, quiet UI, routes, and ${SOURCE_KEYS.length} source records\n`);
