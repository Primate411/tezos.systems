#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHAMBER_ROUTES, routeImage, routeUrl } from '../scripts/lib/chamber-routes.mjs';
import { historyRows } from '../scripts/refresh-uranium-data.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SNAPSHOT_PATH = 'data/uranium-snapshot.json';
const ENTRY_PATH = 'data/uranium-entry-summary.json';
const TOKEN = '0x79052Ab3C166D4899a1e0DD033aC3b379AF0B1fD';
const APP = '0xF02B8aE0D525157797414953103F67D9d4Ee6F0a';
const TOKEN_LOWER = TOKEN.toLowerCase();
const APP_LOWER = APP.toLowerCase();
const MAX_SNAPSHOT_BYTES = 512 * 1024;
const MAX_ENTRY_BYTES = 24 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;
const REQUIRED_SOURCES = [
  'blockscoutContracts',
  'blockscoutToken',
  'coinGecko',
  'defiLlama',
  'etherlinkRpc',
  'krakenListing',
  'krakenMarket',
  'proofOfReserves',
  'uraniumIssuer',
  'uraniumOracle'
];

const inclusiveHistory = Array.from({ length: 366 }, (_, index) => [Date.UTC(2025, 7, 1 + index), index + 1]);
const boundedHistory = historyRows({ prices: inclusiveHistory, market_caps: [], total_volumes: [] });
assert.equal(boundedHistory.length, 365, 'inclusive CoinGecko responses must be trimmed to the one-year artifact budget');
assert.equal(boundedHistory[0].priceUsd, 2, 'history trimming must retain the newest 365 observations');

const readText = (file) => fs.readFile(path.join(ROOT, file), 'utf8');
const [snapshotText, entryText, feature, uraniumCss, sha256Source, generator, siteMapSource, wayfinder, ogGenerator] = await Promise.all([
  readText(SNAPSHOT_PATH),
  readText(ENTRY_PATH),
  readText('js/features/uranium-chamber.js'),
  readText('css/uranium-chamber.css'),
  readText('js/core/sha256.js'),
  readText('scripts/refresh-uranium-data.mjs'),
  readText('js/core/site-map.js'),
  readText('js/ui/wayfinder.js'),
  readText('scripts/generate-chamber-og-images.mjs')
]);
const snapshot = JSON.parse(snapshotText);
const entry = JSON.parse(entryText);
const {
  sha256FallbackHex,
  sha256Text: browserSha256Text
} = await import(`data:text/javascript;base64,${Buffer.from(sha256Source).toString('base64')}`);

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

function projectedHistory(rows) {
  const normalized = rows.filter((row) => row.date && validIso(row.timestamp) && finite(row.priceUsd));
  if (!normalized.length) return [];
  const cutoff = Date.parse(normalized.at(-1).timestamp) - (90 * DAY_MS);
  return normalized
    .filter((row) => Date.parse(row.timestamp) >= cutoff)
    .map(({ date, priceUsd }) => ({ date, priceUsd }));
}

function projectedVenues(rows) {
  const clean = rows.filter((row) => !row.isAnomaly && !row.isStale);
  const result = [...clean].sort((a, b) => (b.volumeUsd || 0) - (a.volumeUsd || 0)).slice(0, 5);
  const krakenVenue = clean.find(({ identifier }) => identifier === 'kraken');
  if (krakenVenue && !result.some(({ identifier }) => identifier === 'kraken')) result.push(krakenVenue);
  return result.map((row) => ({
    market: row.market,
    identifier: row.identifier,
    target: row.target,
    lastUsd: row.lastUsd,
    volumeUsd: row.volumeUsd,
    spreadPct: row.spreadPct,
    depthUpUsd: row.depthUpUsd,
    depthDownUsd: row.depthDownUsd,
    observedAt: row.observedAt,
    tradeUrl: row.tradeUrl
  }));
}

function expectedEntryProjection(complete, sourceText) {
  const terms = complete.identity.terms;
  const unsigned = {
    schemaVersion: 1,
    generatedAt: complete.generatedAt,
    source: {
      path: SNAPSHOT_PATH,
      schemaVersion: complete.schemaVersion,
      generatedAt: complete.generatedAt,
      contentHash: complete.contentHash,
      fileSha256: sha256(sourceText)
    },
    identity: {
      id: complete.identity.id,
      name: complete.identity.name,
      symbol: complete.identity.symbol,
      network: complete.identity.network,
      tokenContract: complete.identity.tokenContract,
      appContract: complete.identity.appContract,
      companionAppContract: complete.identity.companionAppContract,
      homepage: complete.identity.homepage,
      terms: {
        ownership: {
          kind: terms.ownership.currentSemantics,
          receipt: terms.ownership.receipts.at(-1)
        },
        fees: {
          maximumAnnualPct: terms.fees.custodyAndAdministrationMaximumAnnualPct,
          currentlyCharged: terms.fees.currentlyCharged,
          receipt: terms.fees.receipt
        },
        redemption: {
          retailPhysicalDelivery: terms.redemption.retailPhysicalDelivery,
          receipt: terms.redemption.receipt
        },
        rights: {
          governance: terms.rights.governanceRights,
          voting: terms.rights.votingRights,
          equity: terms.rights.equityRights,
          profitSharing: terms.rights.profitSharingRights,
          receipt: terms.rights.receipt
        }
      }
    },
    market: {
      coin: complete.market.coin,
      priceHistoryUsd: projectedHistory(complete.market.priceHistoryUsd),
      venueHighlights: projectedVenues(complete.market.venues),
      kraken: {
        pair: complete.market.kraken.pair,
        ticker: complete.market.kraken.ticker,
        orderBook: complete.market.kraken.orderBook ? {
          bestBidUsd: complete.market.kraken.orderBook.bestBidUsd,
          bestAskUsd: complete.market.kraken.orderBook.bestAskUsd,
          midpointUsd: complete.market.kraken.orderBook.midpointUsd,
          spreadPct: complete.market.kraken.orderBook.spreadPct,
          depthUsd: complete.market.kraken.orderBook.depthUsd
        } : null,
        firstTradeAt: complete.market.kraken.firstTradeAt
      }
    },
    physical: complete.physical,
    chain: {
      clock: complete.chain.clock,
      token: complete.chain.token,
      counters: complete.chain.counters,
      controls: complete.chain.controls
    },
    protocol: {
      clock: complete.protocol.clock,
      name: complete.protocol.name,
      category: complete.protocol.category,
      chain: complete.protocol.chain,
      currentTvlUsd: complete.protocol.currentTvlUsd
    },
    sourceStatuses: Object.fromEntries(REQUIRED_SOURCES.map((key) => [key, {
      status: complete.sources[key].status,
      retrievedAt: complete.sources[key].retrievedAt,
      checkedAt: complete.sources[key].checkedAt
    }]))
  };
  return { ...unsigned, contentHash: sha256(JSON.stringify(stableValue(unsigned))) };
}

function validIso(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) && /T/.test(value);
}

function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`));
}

function finite(value) {
  return Number.isFinite(Number(value));
}

function approximately(actual, expected, tolerance, message) {
  assert(finite(actual) && finite(expected), `${message}: values must be finite`);
  assert(Math.abs(Number(actual) - Number(expected)) <= tolerance,
    `${message}: expected ${expected}, received ${actual}`);
}

function assertHttps(value, label) {
  assert.equal(typeof value, 'string', `${label} must be a URL string`);
  const url = new URL(value);
  assert.equal(url.protocol, 'https:', `${label} must use HTTPS`);
}

function isAscending(rows, key) {
  return rows.every((row, index) => index === 0
    || Date.parse(rows[index - 1]?.[key]) <= Date.parse(row?.[key]));
}

function isDescending(rows, key) {
  return rows.every((row, index) => index === 0
    || Date.parse(rows[index - 1]?.[key]) >= Date.parse(row?.[key]));
}

function sourceBlock(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert(from >= 0 && to > from, `could not isolate source block ${start}`);
  return source.slice(from, to);
}

function collectHashReceipts(value, prefix = 'root', found = []) {
  if (!value || typeof value !== 'object') return found;
  for (const [key, item] of Object.entries(value)) {
    const location = `${prefix}.${key}`;
    if (typeof item === 'string' && ['contentHash', 'fileSha256', 'sha256'].includes(key)) {
      assert.match(item, /^[0-9a-f]{64}$/, `${location} must be a lowercase SHA-256 receipt`);
      found.push(location);
    }
    collectHashReceipts(item, location, found);
  }
  return found;
}

// Plain-HTTP LAN origins may expose crypto without crypto.subtle. Integrity
// verification must remain exact there rather than failing open or refusing to
// render a valid artifact.
const fallbackVectors = [
  '',
  'abc',
  'The quick brown fox jumps over the lazy dog',
  'U₃O₈ 🟢 café',
  'a'.repeat(55),
  'b'.repeat(56),
  'c'.repeat(64),
  'd'.repeat(65),
  'a'.repeat(1_000_000)
];
for (const value of fallbackVectors) {
  const expected = sha256(value);
  assert.equal(sha256FallbackHex(value), expected, 'pure-JavaScript SHA-256 fallback must match Node crypto');
  assert.equal(await browserSha256Text(value, { subtle: null }), expected,
    'SHA-256 must retain verification when crypto.subtle is unavailable');
}
assert.equal(
  await browserSha256Text('subtle rejection fallback', {
    subtle: { digest: async () => { throw new Error('simulated Web Crypto rejection'); } }
  }),
  sha256('subtle rejection fallback'),
  'a rejected Web Crypto digest must fall back to the equivalent verified digest'
);
assert.equal(
  await browserSha256Text('invalid subtle digest fallback', {
    subtle: { digest: async () => new Uint8Array(1).buffer }
  }),
  sha256('invalid subtle digest fallback'),
  'a malformed Web Crypto digest must not be accepted'
);
const nativeTextEncoder = globalThis.TextEncoder;
try {
  globalThis.TextEncoder = undefined;
  const manualUtf8Vector = 'U₃O₈ 🟢 lone surrogate \ud800';
  assert.equal(sha256FallbackHex(manualUtf8Vector), sha256(manualUtf8Vector),
    'SHA-256 fallback must preserve UTF-8 semantics without TextEncoder');
} finally {
  globalThis.TextEncoder = nativeTextEncoder;
}
assert.match(feature, /import \{ sha256Text \} from '\.\.\/core\/sha256\.js';/,
  'Uranium Chamber must use the shared SHA-256 implementation');
assert.doesNotMatch(feature, /SHA-256 verification is unavailable/,
  'Uranium Chamber must not reject plain-HTTP LAN browsers solely because Web Crypto is unavailable');

// Stable, recursively sorted integrity receipts and the exact snapshot-file receipt.
assert.equal(snapshot.schemaVersion, 1, 'Uranium snapshot schemaVersion must remain 1');
assert.equal(entry.schemaVersion, 1, 'Uranium entry schemaVersion must remain 1');
assert(validIso(snapshot.generatedAt), 'snapshot generatedAt must be an ISO timestamp');
assert.equal(entry.generatedAt, snapshot.generatedAt, 'entry and complete snapshot must share one generation clock');
assert.equal(stableReceiptHash(snapshot), snapshot.contentHash, 'snapshot stable contentHash mismatch');
assert.equal(stableReceiptHash(entry), entry.contentHash, 'entry stable contentHash mismatch');
const { contentHash: ignoredSnapshotHash, ...unsignedSnapshot } = snapshot;
const { contentHash: ignoredEntryHash, ...unsignedEntry } = entry;
assert.equal(
  await browserSha256Text(JSON.stringify(stableValue(unsignedSnapshot)), { subtle: null }),
  snapshot.contentHash,
  'plain-HTTP fallback must verify the complete Uranium snapshot receipt'
);
assert.equal(
  await browserSha256Text(JSON.stringify(stableValue(unsignedEntry)), { subtle: null }),
  entry.contentHash,
  'plain-HTTP fallback must verify the Uranium launcher projection receipt'
);
assert.equal(entry.source?.path, SNAPSHOT_PATH, 'entry must identify its complete source artifact');
assert.equal(entry.source?.schemaVersion, snapshot.schemaVersion, 'entry source schema receipt mismatch');
assert.equal(entry.source?.generatedAt, snapshot.generatedAt, 'entry source generation receipt mismatch');
assert.equal(entry.source?.contentHash, snapshot.contentHash, 'entry source content receipt mismatch');
assert.equal(entry.source?.fileSha256, sha256(snapshotText), 'entry exact-file SHA-256 receipt mismatch');
assert.deepEqual(entry, expectedEntryProjection(snapshot, snapshotText),
  'Uranium entry summary must be the exact bounded projection of its complete snapshot');
const hashReceipts = [
  ...collectHashReceipts(snapshot, 'snapshot'),
  ...collectHashReceipts(entry, 'entry')
];
assert(hashReceipts.length >= 5, 'snapshot family must retain recursive content, file, and proof SHA receipts');
assert.equal(
  sha256(JSON.stringify(stableValue({ b: { d: 4, c: 3 }, a: 1 }))),
  sha256(JSON.stringify(stableValue({ a: 1, b: { c: 3, d: 4 } }))),
  'stable hashing must be independent of recursive object-key order'
);
const mutated = structuredClone(snapshot);
mutated.identity.semantics.token += ' changed';
assert.notEqual(stableReceiptHash(mutated), snapshot.contentHash, 'nested receipt mutations must invalidate the stable hash');

// Token identity and the separate companion application must never collapse together.
for (const [label, artifact] of [['snapshot', snapshot], ['entry', entry]]) {
  assert.equal(artifact.identity?.id, 'xu3o8', `${label} identity id mismatch`);
  assert.equal(artifact.identity?.symbol, 'xU3O8', `${label} token symbol mismatch`);
  assert.equal(artifact.identity?.network, 'Etherlink', `${label} token network mismatch`);
  assert.equal(artifact.identity?.tokenContract?.toLowerCase(), TOKEN_LOWER, `${label} token contract mismatch`);
  assert.equal(artifact.identity?.appContract?.toLowerCase(), APP_LOWER, `${label} application contract mismatch`);
  if ('companionAppContract' in artifact.identity) {
    assert.equal(artifact.identity.companionAppContract?.toLowerCase(), APP_LOWER, `${label} companion-app contract mismatch`);
  }
  assert.notEqual(artifact.identity.tokenContract.toLowerCase(), artifact.identity.appContract.toLowerCase(),
    `${label} token and companion application must stay distinct`);
}
assert.equal(snapshot.chain?.token?.address?.toLowerCase(), TOKEN_LOWER, 'chain token address mismatch');
assert.equal(snapshot.chain?.controls?.token?.proxyAddress?.toLowerCase(), TOKEN_LOWER, 'token proxy identity mismatch');
assert.equal(snapshot.chain?.controls?.companionApp?.address?.toLowerCase(), APP_LOWER, 'companion application identity mismatch');
assert.equal(snapshot.chain?.controls?.companionApp?.tokenControl, false, 'companion application must not be presented as token control');
assert.match(snapshot.chain.controls.companionApp.note, /separate.*not presented as.*token controller/i,
  'companion application boundary language is missing');

const terms = snapshot.identity.terms;
assert.match(terms.ownership?.currentSemantics || '', /proportional beneficial co-ownership/i,
  'ownership terms must describe the proportional beneficial interest');
assert.match(terms.ownership?.currentSemantics || '', /not a permanently fixed one-ounce entitlement/i,
  'ownership terms must reject a permanent one-ounce promise');
assert.equal(terms.custody?.trusteeAccount, 'Archax Ltd.', 'custody trustee receipt mismatch');
assert.equal(terms.custody?.storageOperator, 'Cameco', 'custody storage operator receipt mismatch');
assert.equal(terms.redemption?.retailPhysicalDelivery, false, 'retail physical delivery must fail closed');
assert.match(terms.redemption?.condition || '', /regulated persons.*book-entry/i,
  'physical redemption restriction is missing');
assert.equal(terms.fees?.custodyAndAdministrationMaximumAnnualPct, 1.1, 'published fee ceiling mismatch');
assert.equal(terms.fees?.currentlyCharged, null, 'unverified current fee rate must remain unknown');
assert.match(terms.fees?.currentStatusNote || '', /not treated as evidence.*presently charged/i,
  'current fee status must fail closed');
assert.equal(terms.rights?.governanceRights, false, 'governance rights boundary mismatch');
assert.equal(terms.rights?.votingRights, false, 'voting rights boundary mismatch');
assert.equal(terms.rights?.equityRights, false, 'equity rights boundary mismatch');
assert.equal(terms.rights?.profitSharingRights, null, 'unverified profit-sharing rights must remain unknown');
assert.match(terms.rights?.note || '', /fails closed/i, 'unknown profit-sharing semantics need an explicit fail-closed note');
assert.equal(terms.priceDiscovery?.formalPeg, false, 'issuer terms must reject a formal token peg');
assert.equal(terms.priceDiscovery?.guidePriceIsSpotPrice, false, 'guide price must not be labeled spot price');
assert.match(terms.caveat || '', /public claims, not independent legal conclusions/i,
  'issuer terms must not be presented as independent legal conclusions');
for (const [index, receipt] of [
  ...terms.ownership.receipts,
  terms.custody.receipt,
  terms.redemption.receipt,
  terms.transfer.receipt,
  terms.fees.receipt,
  terms.rights.receipt,
  terms.priceDiscovery.receipt
].entries()) assertHttps(receipt, `issuer terms receipt ${index + 1}`);
assert.equal(entry.identity.terms?.redemption?.retailPhysicalDelivery, false,
  'launcher must retain the retail-delivery boundary');
assert.equal(entry.identity.terms?.rights?.profitSharing, null,
  'launcher must preserve unknown profit-sharing semantics');

// Kraken listing, pair state, and public-tape first trade are separate receipts.
const listing = snapshot.identity.krakenListing;
const kraken = snapshot.market.kraken;
assert.equal(listing.status, 'announced-live', 'Kraken listing status mismatch');
assert.equal(listing.announcedLiveDate, '2026-07-30', 'Kraken listing date mismatch');
assertHttps(listing.receiptUrl, 'Kraken listing receipt');
assert.match(listing.note, /public-tape first trade.*separately/i, 'Kraken listing/tape separation note is missing');
assert.equal(kraken.pair?.symbol, 'XU3O8USD', 'Kraken REST pair symbol mismatch');
assert.equal(kraken.pair?.displayName, 'XU3O8/USD', 'Kraken display pair mismatch');
assert.equal(kraken.pair?.websocketName, 'XU3O8/USD', 'Kraken websocket pair mismatch');
assert.equal(kraken.pair?.status, 'online', 'Kraken XU3O8/USD pair must be online');
assert.equal(kraken.pair?.base, 'XU3O8', 'Kraken base asset mismatch');
assert.equal(kraken.pair?.quote, 'ZUSD', 'Kraken quote asset mismatch');
assert(validIso(kraken.firstTradeAt), 'Kraken first public trade must have its own ISO timestamp');
assert.equal(kraken.firstTradeAt.slice(0, 10), listing.announcedLiveDate,
  'first public Kraken trade and listing must retain their separately typed same-day receipts');
assert.equal(kraken.firstTrade?.tradeId, 1, 'Kraken first public trade must remain trade id 1');
assert.equal(kraken.firstTrade?.observedAt, kraken.firstTradeAt, 'Kraken first-trade receipt mismatch');
assert.equal(kraken.firstTrade?.timestamp, kraken.firstTradeAt, 'feature-compatible first-trade clock mismatch');
assert.match(kraken.note, /independent of the dated listing announcement/i, 'Kraken market receipt must stay independent of listing copy');
assert.equal(snapshot.market.clock?.krakenFirstPublicTradeAt, kraken.firstTradeAt, 'Kraken market clock mismatch');
assert.equal(snapshot.market.clock?.krakenListingAnnouncedLiveDate, listing.announcedLiveDate, 'Kraken listing clock mismatch');
assert.equal(snapshot.sources.krakenListing.coverage?.marketDataProof, false, 'listing announcement must not stand in for market data');
assert.equal(snapshot.sources.krakenListing.coverage?.backingProof, false, 'Kraken listing must not stand in for backing proof');
assert.equal(entry.market?.kraken?.firstTradeAt, kraken.firstTradeAt, 'launcher must retain the first-trade clock');
assert.equal(entry.market?.kraken?.pair?.status, 'online', 'launcher must retain the online Kraken pair receipt');

// Dated physical statement, indicative oracle, and cross-clock derived arithmetic.
const proof = snapshot.physical.proof;
const oracle = snapshot.physical.oracle;
const derived = snapshot.physical.derived;
assert.match(proof.documentType, /Cameco contract balance statement/i, 'physical proof document type mismatch');
assert.match(proof.characterization, /dated balance statement, not described here as an audit/i,
  'physical statement must not be mislabeled as an audit');
assert(validDate(proof.statementAsOf), 'physical statement must carry an as-of date');
assert.equal(proof.statementDate, proof.statementAsOf, 'feature-compatible physical statement date mismatch');
assert.equal(proof.accountHolder, 'Archax Ltd.', 'physical statement account holder mismatch');
assert.match(proof.commodity, /U3O8/i, 'physical statement commodity mismatch');
assert(Number(proof.endingBalanceKgUAsU3O8) > 0, 'physical statement must retain a positive dated balance');
assert.equal(proof.endingBalanceKgU, proof.endingBalanceKgUAsU3O8, 'feature-compatible kgU balance mismatch');
assert.equal(proof.unit, 'kgU as U3O8', 'physical statement unit mismatch');
assert.equal(snapshot.physical.clock?.proofStatementAsOf, proof.statementAsOf, 'physical statement clock mismatch');
assert.equal(snapshot.physical.clock?.proofRetrievedAt, proof.retrievedAt, 'physical retrieval clock mismatch');
assert.notEqual(proof.statementAsOf, proof.retrievedAt?.slice(0, 10),
  'statement date and document retrieval date must stay separate clocks');
assertHttps(proof.url, 'physical proof PDF');
assert.equal(proof.pdfUrl, proof.url, 'feature-compatible proof PDF URL mismatch');
assertHttps(proof.pageUrl, 'physical proof page');
assert.equal(snapshot.sources.proofOfReserves.coverage?.statementDateParsed, true, 'proof source must parse its statement date');
assert.equal(snapshot.sources.proofOfReserves.coverage?.endingBalanceParsed, true, 'proof source must parse its ending balance');

assert.equal(oracle.unit, 'USD per lb U3O8', 'uranium oracle unit mismatch');
assert.match(oracle.semantics?.kind, /guide market price/i, 'oracle must remain an indicative guide price');
assert.match(oracle.semantics?.statedMethod, /predictive estimate/i, 'oracle methodology receipt is missing');
assert.match(oracle.semantics?.statedRefreshCadence, /minute/i, 'oracle stated cadence is missing');
assert.equal(oracle.semantics?.formalTokenPeg, false, 'oracle must not be presented as a formal token peg');
assert.equal(oracle.semantics?.proofOfReserves, false, 'oracle must not be presented as proof of reserves');
assert.match(oracle.note, /separate from token venue quotes and the dated physical balance statement/i,
  'oracle boundary note is missing');
if (oracle.priceUsdPerLbU3O8 === null) {
  assert.equal(oracle.priceUsdPerLb, null, 'unavailable oracle aliases must agree');
  assert.equal(snapshot.physical.clock?.oracleObservedAt, null, 'unavailable oracle must not invent an observation clock');
  assert.equal(snapshot.sources.uraniumOracle.status, 'unavailable', 'missing oracle value needs unavailable source status');
} else {
  assert(Number(oracle.priceUsdPerLbU3O8) > 0, 'observed oracle price must be positive');
  assert.equal(oracle.priceUsdPerLb, oracle.priceUsdPerLbU3O8, 'feature-compatible oracle alias mismatch');
  assert(validIso(oracle.observedAt), 'observed oracle must carry an ISO source clock');
  assert.equal(snapshot.physical.clock?.oracleObservedAt, oracle.observedAt, 'oracle clock mismatch');
}

assert.match(derived.method, /stoichiometric conversion/i, 'derived physical-ratio method is missing');
assert(derived.uraniumMassFractionInU3O8 > 0.84 && derived.uraniumMassFractionInU3O8 < 0.86,
  'U3O8 uranium mass fraction is outside its physical boundary');
approximately(
  derived.estimatedU3O8Kg,
  proof.endingBalanceKgUAsU3O8 / derived.uraniumMassFractionInU3O8,
  0.002,
  'derived U3O8 kilograms'
);
approximately(derived.estimatedU3O8Oz, derived.estimatedU3O8Lb * 16, 0.01, 'derived ounces');
approximately(derived.estimatedU3O8OzPerToken, derived.estimatedU3O8Oz / derived.tokenSupplyInput, 0.000001,
  'derived ounces per token');
assert.equal(derived.ouncesPerToken, derived.estimatedU3O8OzPerToken, 'feature-compatible ounces/token alias mismatch');
assert.equal(derived.tokenSupply, derived.tokenSupplyInput, 'feature-compatible supply alias mismatch');
assert.equal(derived.inputs?.proofStatementAsOf, proof.statementAsOf, 'derived proof input clock mismatch');
assert.equal(derived.inputs?.oracleObservedAt, oracle.observedAt, 'derived oracle input clock mismatch');
assert.notEqual(derived.inputs?.proofStatementAsOf, derived.inputs?.tokenQuoteObservedAt?.slice(0, 10),
  'cross-source ratio must retain non-matching proof and token clocks');
if (oracle.priceUsdPerLbU3O8 !== null) {
  approximately(
    derived.oracleImpliedValuePerTokenUsd,
    (derived.estimatedU3O8Lb / derived.tokenSupplyInput) * oracle.priceUsdPerLbU3O8,
    0.000002,
    'oracle-implied token reference'
  );
  approximately(
    derived.tokenPremiumDiscountPct,
    ((derived.tokenPriceUsd / derived.oracleImpliedValuePerTokenUsd) - 1) * 100,
    0.001,
    'token premium/discount basis'
  );
  assert.equal(derived.referenceValueUsd, derived.oracleImpliedValuePerTokenUsd, 'feature-compatible reference-value alias mismatch');
  assert.equal(derived.marketBasisPct, derived.tokenPremiumDiscountPct, 'feature-compatible market-basis alias mismatch');
}
assert.match(derived.caveat, /non-matching clocks/i, 'derived ratio must disclose cross-source clocks');
for (const boundary of ['formal peg', 'current backing', 'redeemability', 'exchange inventory', 'proof by Kraken']) {
  assert(derived.caveat.includes(boundary), `derived ratio caveat is missing ${boundary}`);
}
const synchronizedBacking = snapshot.unavailable.find(({ id }) => id === 'synchronized-physical-backing');
assert.equal(synchronizedBacking?.status, 'not-calculated', 'real-time physical backing must fail closed');
assert.match(synchronizedBacking?.reason || '', /different clocks/i, 'real-time backing boundary must name its clock mismatch');

// Chain rows are bounded address observations, not owner or investor identities.
assert(Number.isSafeInteger(snapshot.chain.counters?.holders) && snapshot.chain.counters.holders >= 0,
  'indexed holder-address counter must be a non-negative integer');
assert(Number.isSafeInteger(snapshot.chain.counters?.transfers) && snapshot.chain.counters.transfers >= 0,
  'indexed transfer counter must be a non-negative integer');
assert(snapshot.chain.topHolders.length <= 50, 'top-holder receipt exceeds its one-page budget');
assert(snapshot.chain.recentTransfers.length <= 50, 'recent-transfer receipt exceeds its one-page budget');
assert(snapshot.chain.topHolders.every((row, index, rows) => index === 0 || Number(rows[index - 1].balance) >= Number(row.balance)),
  'top token addresses must remain balance sorted');
assert(isDescending(snapshot.chain.recentTransfers, 'timestamp'), 'recent token transfers must remain newest first');
assert(snapshot.chain.recentTransfers.every((row) => row.timestamp === row.observedAt
  && row.fromAddress === row.from?.address && row.toAddress === row.to?.address && finite(row.amountTokens)),
  'recent transfers must retain feature-compatible address, amount, and clock fields');
assert.equal(snapshot.sources.blockscoutToken.coverage?.topHoldersComplete, false, 'top address page must not claim complete coverage');
assert.equal(snapshot.sources.blockscoutToken.coverage?.recentTransfersComplete, false, 'recent transfer page must not claim complete coverage');
assert.match(snapshot.sources.blockscoutToken.coverage?.topHoldersNote || '', /address labels are context, not ownership proof/i,
  'holder-address coverage must reject ownership inference');
const ownerAttribution = snapshot.unavailable.find(({ id }) => id === 'wallet-owner-attribution');
assert.equal(ownerAttribution?.status, 'unavailable', 'beneficial-owner attribution must remain unavailable');
assert.match(ownerAttribution?.reason || '', /address context, not proof of beneficial ownership/i,
  'beneficial-owner boundary language is missing');
assert.deepEqual(entry.chain.counters, snapshot.chain.counters, 'launcher chain counters must project exactly');

// Each source owns its status and natural clock; entry status receipts mirror the complete snapshot.
assert.deepEqual(Object.keys(snapshot.sources).sort(), REQUIRED_SOURCES, 'Uranium source inventory drifted');
assert.deepEqual(Object.keys(entry.sourceStatuses).sort(), REQUIRED_SOURCES, 'launcher source-status inventory drifted');
for (const key of REQUIRED_SOURCES) {
  const source = snapshot.sources[key];
  assert(['ok', 'stale', 'unavailable'].includes(source.status), `${key} has an invalid source status`);
  assert(source.label && source.credit, `${key} must retain label and credit`);
  assertHttps(source.url, `${key} source`);
  assert(Array.isArray(source.endpoints) && source.endpoints.length, `${key} must retain source endpoints`);
  source.endpoints.forEach((url, index) => assertHttps(url, `${key} endpoint ${index + 1}`));
  assert(validIso(source.checkedAt), `${key} must retain its check clock`);
  if (source.status === 'ok') {
    assert(validIso(source.retrievedAt), `${key} ok receipt needs a retrieval clock`);
    assert.equal(source.error, null, `${key} ok receipt must not retain an error`);
  } else {
    assert(source.error, `${key} ${source.status} receipt must explain its failure`);
    if (source.status === 'stale') assert(validIso(source.retrievedAt), `${key} stale receipt needs its last-good retrieval clock`);
  }
  assert.deepEqual(entry.sourceStatuses[key], {
    status: source.status,
    retrievedAt: source.retrievedAt,
    checkedAt: source.checkedAt
  }, `${key} launcher status receipt mismatch`);
}
assert.equal(snapshot.market.clock?.coinQuoteObservedAt, snapshot.market.coin?.lastUpdated, 'CoinGecko quote clock mismatch');
assert.equal(snapshot.market.clock?.krakenRetrievedAt, snapshot.sources.krakenMarket.retrievedAt, 'Kraken retrieval clock mismatch');
assert.equal(snapshot.physical.clock?.proofStatementAsOf, proof.statementAsOf, 'physical proof clock mismatch');
assert.equal(snapshot.chain.clock?.latestTransferAt, snapshot.chain.recentTransfers[0]?.timestamp || null, 'latest transfer clock mismatch');
assert.equal(snapshot.protocol.clock?.latestTvlAt, snapshot.protocol.history.at(-1)?.timestamp || null, 'protocol history clock mismatch');
for (const key of ['krakenListing', 'uraniumIssuer']) {
  const source = snapshot.sources[key];
  const reviewedAt = `${source.coverage.reviewedOn}T00:00:00.000Z`;
  assert.equal(source.reviewedAt, reviewedAt, `${key} must retain its semantic manual-review clock`);
  assert.equal(source.retrievedAt, reviewedAt, `${key} must not be re-stamped as retrieved by an unrelated generation`);
  assert.equal(source.checkedAt, reviewedAt, `${key} must not be re-stamped as checked without a new manual review`);
}
assert.equal(snapshot.sources.uraniumIssuer.coverage.maxReviewAgeDays, 30,
  'mutable issuer semantics need an expiring manual-review receipt');

// Artifact and collection budgets stay explicit and bounded.
assert(Buffer.byteLength(snapshotText) <= MAX_SNAPSHOT_BYTES, 'complete Uranium snapshot exceeds 512 KiB');
assert(Buffer.byteLength(entryText) <= MAX_ENTRY_BYTES, 'Uranium launcher projection exceeds 24 KiB');
assert(snapshot.market.priceHistoryUsd.length <= 365, 'token price history exceeds its one-year budget');
assert(snapshot.market.kraken.ohlcDaily.length <= 370, 'Kraken daily OHLC exceeds its bounded launch history');
assert(snapshot.market.kraken.orderBook.bids.length <= 25 && snapshot.market.kraken.orderBook.asks.length <= 25,
  'Kraken order book exceeds 25 retained levels per side');
assert(snapshot.market.kraken.recentTrades.length <= 50, 'Kraken recent trade tape exceeds 50 rows');
assert(snapshot.protocol.history.length <= 365, 'Uranium.io protocol history exceeds one year');
assert(entry.market.priceHistoryUsd.length <= 92, 'launcher token history exceeds its trailing 90-day envelope');
assert(entry.market.venueHighlights.length <= 6, 'launcher venue highlights exceed five leaders plus Kraken');
assert(isAscending(snapshot.market.priceHistoryUsd, 'timestamp'), 'token price history must be oldest first');
assert(isAscending(snapshot.market.kraken.ohlcDaily, 'date'), 'Kraken OHLC must be oldest first');
assert(isDescending(snapshot.market.kraken.recentTrades, 'timestamp'), 'Kraken trade tape must be newest first');
assert(isAscending(snapshot.protocol.history, 'timestamp'), 'protocol history must be oldest first');
assert(generator.includes('const MAX_SNAPSHOT_BYTES = 512 * 1024;'), 'generator snapshot budget drifted');
assert(generator.includes('const MAX_ENTRY_BYTES = 24 * 1024;'), 'generator launcher budget drifted');
assert(generator.includes('const ENTRY_HISTORY_DAYS = 90;'), 'generator launcher-history budget drifted');
assert(generator.includes('.slice(-365);'), 'generator must bound CoinGecko daily history even when the API returns an inclusive extra point');
assert(generator.includes('previousData ?? emptyData()'), 'generator must preserve last-good source data on failure');

assertHttps(snapshot.identity.homepage, 'issuer homepage');
assertHttps(snapshot.identity.explorer, 'token explorer');
assertHttps(snapshot.physical.oracle.displayUrl, 'oracle display page');
for (const [index, venue] of snapshot.market.venues.entries()) {
  if (venue.tradeUrl !== null) assertHttps(venue.tradeUrl, `venue ${index + 1} receipt`);
}
for (const [index, item] of snapshot.unavailable.entries()) {
  assert(['unavailable', 'not-calculated'].includes(item.status), `unavailable methodology ${item.id} has an invalid status`);
  item.sources.forEach((url, sourceIndex) => assertHttps(url, `unavailable methodology ${index + 1} source ${sourceIndex + 1}`));
}
assert.equal(snapshot.sources.krakenMarket.url, 'https://docs.kraken.com/api/docs/category/rest-api/market-data/',
  'Kraken market source URL drifted');
assert.equal(snapshot.sources.krakenListing.url, listing.receiptUrl, 'Kraken listing source URL drifted');
assert.equal(snapshot.sources.proofOfReserves.url, proof.url, 'physical proof source URL drifted');
assert(snapshot.sources.blockscoutToken.endpoints.every((url) => url.includes(TOKEN)),
  'Blockscout token endpoints must stay pinned to xU3O8');
assert(snapshot.sources.blockscoutContracts.endpoints.some((url) => url.toLowerCase().includes(APP_LOWER)),
  'verified-contract receipts must include the separate companion application');

// Static Chamber contract: exact views, quiet refresh, truth-art, and no execution CTA.
const viewBlock = sourceBlock(feature, 'const VIEWS = Object.freeze([', 'const VIEW_IDS');
const viewIds = [...viewBlock.matchAll(/\{ id: '([^']+)'/g)].map((match) => match[1]);
assert.deepEqual(viewIds, ['overview', 'markets', 'onchain', 'proofbook'], 'Uranium route views drifted');
for (const view of viewIds) {
  assert(feature.includes(`currentView === '${view}'`) || view === 'overview', `Uranium ${view} view is not routed`);
}
assert(feature.includes("searchParams.get('view')"), 'pretty route must read the Uranium view query');
assert(feature.includes("url.searchParams.set('view', currentView)"), 'view changes must preserve the pretty Uranium route');
assert(feature.includes("searchParams.get('range')") && feature.includes("url.searchParams.set('range', currentRange)"),
  'Uranium historical ranges must be directly addressable on the pretty route');
const rangeBlock = sourceBlock(feature, 'const RANGES = Object.freeze([', 'const RANGE_BY_ID');
assert.deepEqual([...rangeBlock.matchAll(/id: '([^']+)'/g)].map((match) => match[1]), ['24H', '7D', '30D', '90D', '1Y'],
  'Uranium price-history ranges drifted');
assert(feature.includes("import { quietlySyncHtml } from '../core/quiet-refresh.js';"), 'Uranium must use shared quiet reconciliation');
assert(feature.includes("syncChamberReading(body, markup, { quiet:"), 'Uranium body background render must reconcile quietly');
assert(feature.includes("quietlySyncHtml(front, markup)"), 'Uranium launcher background render must reconcile quietly');
const timerBlock = sourceBlock(feature, 'function startRefreshTimer()', 'function bindVisibilityRefresh()');
assert(timerBlock.includes("document.visibilityState !== 'visible'"), 'Uranium timer must be visibility gated');
assert(timerBlock.includes('refreshUraniumChamber({ quiet: true })'), 'Uranium timer must request quiet reconciliation');
assert(!timerBlock.includes('innerHTML'), 'Uranium timer must never replace a whole surface with innerHTML');
const refreshBlock = sourceBlock(feature, 'async function refreshUraniumChamber', 'function ensureEntryCard()');
assert(refreshBlock.includes("document.visibilityState !== 'visible'"), 'Uranium refresh must fail closed while hidden');
assert(refreshBlock.includes('return lastSnapshot'), 'Uranium refresh must retain last-good data');
assert(refreshBlock.includes("if (!lastSnapshot && body"), 'Uranium refresh may replace the body with an error only before first good data');
assert(!refreshBlock.includes('innerHTML'), 'Uranium timed refresh path must not perform whole-surface innerHTML replacement');
assert(feature.includes('Last good ${ageLabel(lastSnapshot.generatedAt)} · refresh failed'),
  'Uranium must expose retained last-good freshness after failure');
assert(feature.includes("document.addEventListener('visibilitychange'"), 'Uranium must perform one visibility catch-up');
assert(feature.includes("const receiptStatus = live?.ticker ? live.status : sourceStatus(snapshot, 'krakenMarket')"),
  'Kraken rendering must prefer a validated live ticker and otherwise read its independent generated receipt status');
assert(feature.includes("status: receiptStatus === 'ok' ? venueStatus : receiptStatus"),
  'retained Kraken pair status must never override a stale or unavailable source receipt');
const socketBlock = sourceBlock(feature, 'function krakenStreamAllowed()', 'function coinModel(');
assert(feature.includes("const KRAKEN_WS_URL = 'wss://ws.kraken.com/v2'"),
  'live Uranium market context must use Kraken public WebSocket rather than browser-blocked REST');
assert(socketBlock.includes("document.visibilityState === 'visible'")
  && socketBlock.includes("channel: 'ticker'") && socketBlock.includes("channel: 'ohlc'")
  && socketBlock.includes('interval: 5') && socketBlock.includes('interval: 15'),
  'Kraken WebSocket must be visible-room gated and subscribe to ticker plus 5- and 15-minute OHLC');
assert(!feature.includes("fetch('https://api.kraken.com") && !feature.includes('KRAKEN_MARKET_API'),
  'browser code must not attempt the CORS-blocked Kraken REST API');
assert(feature.includes('stopKrakenStream();') && feature.includes("document.addEventListener('visibilitychange'"),
  'Kraken WebSocket must close while the tab is hidden');
assert(feature.includes('volumeUsd: firstNumeric(row?.volumeUsd') && feature.includes('marketCapUsd: firstNumeric(row?.marketCapUsd)'),
  'historical normalization must retain CoinGecko volume and market-cap context');
for (const hook of ['data-uranium-chart-hitbox', 'data-uranium-chart-crosshair', 'uranium-chart-volume-bar',
  'uranium-chart-readout', 'uranium-chart-provenance', 'Kraken USD live']) {
  assert(feature.includes(hook), `Uranium history explorer is missing ${hook}`);
}
assert(feature.includes("sourceLabel: 'CoinGecko cross-venue aggregate'")
  && feature.includes("kind: 'kraken'") && feature.includes('actualCoverage'),
  'price history must disclose distinct Kraken and CoinGecko series with actual returned coverage');
assert(feature.includes("sourceInventory(snapshot).filter(({ status }) => status !== 'ok')"),
  'Chamber freshness must surface degraded per-source receipts');
assert(feature.includes("label: 'Statement as at'") && feature.includes("label: 'Announced live'")
  && feature.includes("label: 'Reviewed'"),
  'source ledger must keep custody, listing, and manual-review clocks semantically distinct');
assert(feature.includes('<th>Evidence clock</th>'), 'source ledger must not collapse natural clocks into one generic timestamp');
assert(feature.includes('Uranium.io describes xU3O8 this way:'),
  'ownership semantics must stay attributed to the issuer');
assert(feature.includes('Issuer terms: ${escapeHtml(terms.redemptionCondition)}'),
  'redemption restrictions must stay attributed and receipt-driven');
assert(feature.includes('Dated statement') && !feature.includes('Dated proof'),
  'the Cameco balance receipt must be labeled as a dated statement, not generic proof');
assert(generator.includes('maxReviewAgeDays: 30'), 'issuer semantics review must expire unless it is reviewed again');

assert(feature.includes('/assets/uranium/uranium-core-640.webp'), 'responsive local Uranium WebP is missing');
assert(feature.includes('/assets/uranium/uranium-core.webp'), 'full local Uranium WebP is missing');
assert(feature.includes('/assets/uranium/uranium-launcher-480.webp'), 'compact launcher Uranium WebP is missing');
assert(feature.includes('/assets/uranium/uranium-launcher.webp'), 'full launcher Uranium WebP is missing');
assert(feature.includes('Cute cartoon uranium-rock mascot glowing with vivid emerald-green energy.'),
  'expanded Uranium artwork must identify itself as a stylized illustration');
assert(feature.includes('physical U3O8 is yellowcake concentrate, not a glowing rock.'),
  'Uranium artwork must not present the glowing rock as literal U3O8');
assert(feature.includes('Polished translucent light-green mineral specimen with a bright emerald inner glow.'),
  'launcher artwork must describe an inanimate polished green specimen');
assert(feature.includes("launcherPicture('is-entry')"),
  'compact Uranium launcher must use its own non-mascot art path');
assert(feature.includes('<small>U₃O₈ oracle</small>')
  && feature.includes('<small>Dated ratio</small>')
  && feature.includes('<small>Holders</small>'),
  'compact Uranium launcher must retain short, semantic mobile metric labels');
assert(feature.includes("renderPriceChart(snapshot.market?.priceHistoryUsd, '30D', true)"),
  'compact Uranium launcher must retain its labeled 30-day market pulse');
assert(uraniumCss.includes('#chambers-grid .chamber-entry-card.uranium-entry-card')
  && uraniumCss.includes('rgba(0, 255, 128, .34)')
  && uraniumCss.includes('color: #f1fff5 !important;'),
  'compact Uranium launcher must keep its theme-independent emerald glow and bright price');
const mobileCss = sourceBlock(uraniumCss, '@media (max-width: 700px)', '@media (max-width: 500px)');
assert(mobileCss.includes('"title art rail"')
  && mobileCss.includes('"value value rail"')
  && mobileCss.includes('"delta delta rail"')
  && mobileCss.includes('"kpis kpis kpis"')
  && mobileCss.includes('"chart chart chart"'),
  'mobile Uranium launcher must give copy, art, metrics, and chart separate grid rows');
assert(mobileCss.includes('.uranium-entry-copy { display: contents; }')
  && mobileCss.includes('.uranium-entry-copy .stat-description { display: none; }')
  && mobileCss.includes('.uranium-entry-freshness { display: none; }')
  && mobileCss.includes('transition: none !important;'),
  'mobile Uranium launcher must prevent copy collisions and responsive price-size lag');
for (const asset of [
  'assets/uranium/uranium-core-640.webp',
  'assets/uranium/uranium-core.webp',
  'assets/uranium/uranium-launcher-480.webp',
  'assets/uranium/uranium-launcher.webp'
]) {
  const bytes = await fs.readFile(path.join(ROOT, asset));
  assert(bytes.length > 10_000 && bytes.length < 2 * 1024 * 1024, `${asset} is outside its local image budget`);
  assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF', `${asset} is not a RIFF WebP`);
  assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP', `${asset} is not a WebP`);
}

assert.doesNotMatch(feature, /<(?:a|button)\b[^>]*>\s*(?:Buy|Sell|Trade|Swap)(?:\s+now|\s+xU3O8)?\b/i,
  'Uranium Chamber must not ship a buy, sell, trade, or swap CTA');
for (const executionHook of ['connectWallet', 'placeOrder', 'submitOrder', 'executeTrade', 'executeSwap']) {
  assert(!feature.includes(executionHook), `Uranium Chamber must not expose execution hook ${executionHook}`);
}
assert(feature.includes('>Source ↗</a>'), 'venue URLs must render as attributed source receipts, not trade CTAs');

// Canonical discovery, pretty shell, wayfinder, and OG metadata remain aligned.
const siteMapModule = await import(`data:text/javascript;base64,${Buffer.from(siteMapSource).toString('base64')}`);
const uraniumEntry = siteMapModule.findSiteMapEntry('uranium');
assert.equal(uraniumEntry?.title, 'Uranium', 'canonical site-map title mismatch');
assert.equal(uraniumEntry?.href, '/uranium/', 'canonical site-map route mismatch');
assert.equal(uraniumEntry?.hash, '#uranium', 'canonical site-map hash mismatch');
assert.deepEqual(uraniumEntry?.hashAliases, ['#xu3o8', '#u3o8', '#uranium-market'], 'Uranium hash aliases drifted');
assert.equal(uraniumEntry?.chamberCategory, 'capital', 'Uranium must stay in the Capital category');
assert.deepEqual(
  uraniumEntry?.searchIntents?.map(({ href }) => href),
  viewIds.map((view) => `/uranium/?view=${view}`),
  'site-map Uranium intents must cover every route view'
);
const capitalCategory = siteMapModule.CHAMBER_CATEGORY_META.find(({ key }) => key === 'capital');
assert.deepEqual(capitalCategory?.entryIds, ['capital', 'minerals', 'uranium', 'metals', 'whales', 'staking-chamber'],
  'Critical Minerals, Uranium, and Precious Metals must bridge Capital and Whale Watch');
for (const target of siteMapModule.SITE_MAP_RELATIONS.uranium) {
  assert(siteMapModule.SITE_MAP_RELATIONS[target]?.includes('uranium'), `Uranium relation ${target} must be reciprocal`);
}
assert(wayfinder.includes("'uranium-modal': 'uranium'"), 'Uranium overlay must inherit the shared wayfinder');

const route = CHAMBER_ROUTES.find(({ slug }) => slug === 'uranium');
assert(route, 'Uranium pretty Chamber route metadata is missing');
assert.equal(route.hash, '#uranium', 'Uranium pretty route hash mismatch');
assert.equal(route.shortTitle, 'Uranium', 'Uranium shell title mismatch');
assert.equal(routeUrl(route), 'https://tezos.systems/uranium/', 'Uranium canonical shell URL mismatch');
assert.equal(routeImage(route), 'https://tezos.systems/og/uranium.png', 'Uranium canonical OG URL mismatch');
assert.match(route.description, /token markets.*separately dated.*physical U3O8/i,
  'Uranium shell must distinguish token markets from dated physical evidence');
assert.equal(route.accent, '#8cff65', 'Uranium shell must retain its emerald accent');
assert.equal(route.secondaryAccent, '#18d97f', 'Uranium shell must retain its secondary emerald glow');
for (const snippet of [
  'xU3O8 Market Intelligence',
  'Token tape. Physical receipts.',
  'Kraken USD tape',
  'dated Cameco reserve evidence',
  "route.secondaryAccent || '#7c3aed'"
]) {
  assert(ogGenerator.includes(snippet), `Uranium OG metadata is missing ${snippet}`);
}

console.log(`ok - Uranium snapshot, projection, receipts, clocks, boundaries, quiet UI, routes, and ${hashReceipts.length} SHA records`);
