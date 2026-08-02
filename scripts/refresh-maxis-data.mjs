#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  compileContractCoverage,
  compareCodePoint,
  isImplicitAddress,
  rankAccounts,
  rankAppActivity,
  rankDelegates,
  rankMints,
  rankSalesStats,
  rankUnicorn,
  validateMaxisConfig
} from './lib/maxis-ranking.mjs';
import {
  PASSPORT_SHARD_ALGORITHM,
  PASSPORT_SHARD_COUNT,
  CURRENT_MAXIS_EVALUATOR_VERSION,
  SEASON_CATALOG_SCHEMA,
  SEASON_SCHEMA,
  addressShard,
  getMaxisEvaluator,
  resolveProtocolSeason,
  validateImmediateProtocolSuccessor,
  validateSeasonCatalog
} from './lib/maxis-season.mjs';
import { getMaxisSource } from './lib/maxis-source.mjs';
import { MAXIS_SOURCE_CONFIG } from './lib/maxis-source-v2.mjs';
import {
  artifactBudgetErrors,
  compactJsonBytes,
  measureSeasonArtifactBudget,
  prettyJsonBytes
} from './lib/maxis-artifact-budget.mjs';
import { fetchKeysetPages, fetchOffsetPages } from './lib/maxis-pagination.mjs';
import { RETRYABLE_TEMP_FAILURE_EXIT_CODE } from './lib/generated-task-runner.mjs';
import {
  TRANSACTION_REPLAY_LEVELS,
  TRANSACTION_STATE_SCHEMA,
  TRANSACTION_STATE_VERSION,
  applyTransactionPage,
  beginTransactionScan,
  completeTransactionScan,
  createTransactionScanState,
  serializeTransactionAccumulator,
  transactionAccumulatorRows,
  validateTransactionAccumulator
} from './lib/maxis-transactions-v2.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_FILE = path.join(ROOT, 'data/maxis-contracts.json');
const OUTPUT_FILE = path.join(ROOT, 'data/maxis-leaders.json');
const PROTOCOL_FILE = path.join(ROOT, 'data/protocol-data.json');
const GOVERNANCE_REPORT_FILE = path.join(ROOT, 'data/governance-refresh-report.json');
const MAXIS_DATA_DIR = path.join(ROOT, 'data/maxis');
const SEASON_MANIFEST_FILE = path.join(MAXIS_DATA_DIR, 'manifest.json');
const TZKT = 'https://api.tzkt.io/v1';
const OBJKT = 'https://data.objkt.com/v3/graphql';
const OBJKT_PAGE_SIZE = MAXIS_SOURCE_CONFIG.objktPageSize;
const OBJKT_MAX_PAGES = MAXIS_SOURCE_CONFIG.objktMaxPages;
const TZKT_PAGE_SIZE = MAXIS_SOURCE_CONFIG.tzktPageSize;
const TZKT_MAX_PAGES = MAXIS_SOURCE_CONFIG.tzktMaxPages;
const TRANSACTION_PAGE_SIZE = MAXIS_SOURCE_CONFIG.transactionPageSize;
const TRANSACTION_MAX_PAGES_PER_TARGET = MAXIS_SOURCE_CONFIG.transactionMaxPagesPerTarget;
const TRANSACTION_CHECKPOINT_EVERY_PAGES = MAXIS_SOURCE_CONFIG.transactionCheckpointEveryPages;
const TRANSACTION_CONFIRMED_LEVEL_LAG = MAXIS_SOURCE_CONFIG.transactionConfirmedLevelLag;
const CONTRACT_BATCH = MAXIS_SOURCE_CONFIG.contractBatch;
const ACCOUNT_BATCH = MAXIS_SOURCE_CONFIG.accountBatch;
const BALANCE_HISTORY_CONCURRENCY = MAXIS_SOURCE_CONFIG.balanceHistoryConcurrency;
const CONTRACT_CATALOG_KINDS = MAXIS_SOURCE_CONFIG.contractCatalogKinds;
const RANKING_LIMIT = 10;
const MAX_ACTIVE_SEASON_ARTIFACT_BYTES = MAXIS_SOURCE_CONFIG.maxActiveSeasonArtifactBytes;
const MAX_PASSPORT_SHARD_BYTES = MAXIS_SOURCE_CONFIG.maxPassportShardBytes;
const MAX_TRANSACTION_STATE_BYTES = MAXIS_SOURCE_CONFIG.maxTransactionStateBytes;
const FINALIZATION_SETTLEMENT_HOURS = 24;
const FINALIZATION_SETTLEMENT_MS = FINALIZATION_SETTLEMENT_HOURS * 60 * 60 * 1000;
const GAMING_WINDOW_DAYS = 90;
const EXPECTED_CATEGORIES = ['transaction', 'collector', 'artist', 'minter', 'defi', 'gaming', 'governance', 'staking', 'unicorn'];
const SEASON_ARTIFACT_LIMITS = Object.freeze({
  transactionStateBytes: MAX_TRANSACTION_STATE_BYTES,
  passportShardBytes: MAX_PASSPORT_SHARD_BYTES,
  seasonArtifactBytes: MAX_ACTIVE_SEASON_ARTIFACT_BYTES
});

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function formatInteger(value) {
  return Math.round(Number(value) || 0).toLocaleString('en-US');
}

function formatXtz(mutez) {
  return `${(Number(mutez || 0) / 1e6).toLocaleString('en-US', { maximumFractionDigits: 0 })} ꜩ`;
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function readJsonIfExists(file) {
  try {
    return await readJson(file);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function contentHash(value) {
  return createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex');
}

function jsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function passportShardText(value) {
  return `${JSON.stringify(value)}\n`;
}

function textHash(value) {
  return createHash('sha256').update(value).digest('hex');
}

function signTransactionAccumulator(document) {
  const { integrity: _integrity, ...unsigned } = document;
  return {
    ...unsigned,
    integrity: {
      algorithm: 'sha256-stable-json-v1',
      contentHash: contentHash(unsigned)
    }
  };
}

function transactionAccumulatorErrors(document, options = {}) {
  const errors = validateTransactionAccumulator(document, options);
  const { integrity, ...unsigned } = document || {};
  if (integrity?.algorithm !== 'sha256-stable-json-v1' || integrity?.contentHash !== contentHash(unsigned)) {
    errors.push('transaction state integrity hash is invalid');
  }
  return errors;
}

function validateSnapshot(snapshot) {
  const errors = [];
  if (Number(snapshot?.schema) !== 2) errors.push('snapshot schema must be 2');
  if (!Number.isFinite(Date.parse(snapshot?.generatedAt || ''))) errors.push('snapshot generatedAt must be an ISO timestamp');
  if (!Array.isArray(snapshot?.leaders)) errors.push('snapshot leaders must be an array');
  if (!snapshot?.rankings || typeof snapshot.rankings !== 'object') errors.push('snapshot rankings must be an object');
  if (Number(snapshot?.rankingLimit) !== RANKING_LIMIT) errors.push(`snapshot rankingLimit must be ${RANKING_LIMIT}`);
  const categories = new Set((snapshot?.leaders || []).map((leader) => leader.category));
  for (const category of EXPECTED_CATEGORIES) {
    if (!categories.has(category)) errors.push(`snapshot missing ${category}`);
    const ranking = snapshot?.rankings?.[category];
    if (!Array.isArray(ranking)) {
      errors.push(`snapshot missing ${category} ranking`);
      continue;
    }
    if (ranking.length !== RANKING_LIMIT) errors.push(`${category} ranking contains ${ranking.length}/${RANKING_LIMIT} accounts`);
    const addresses = new Set();
    ranking.forEach((entry, index) => {
      if (entry?.status !== 'ready') errors.push(`${category} rank ${index + 1} is not ready`);
      if (Number(entry?.rank) !== index + 1) errors.push(`${category} rank order is invalid`);
      if (!isImplicitAddress(entry?.address)) errors.push(`${category} rank ${index + 1} has invalid address`);
      if (!entry?.scoreLabel || !entry?.method || !entry?.sourceUrl) errors.push(`${category} rank ${index + 1} is missing display evidence`);
      if (addresses.has(entry?.address)) errors.push(`${category} ranking repeats ${entry.address}`);
      addresses.add(entry?.address);
    });
    const leaderAddress = (snapshot?.leaders || []).find((leader) => leader.category === category)?.address;
    if (ranking[0]?.address && ranking[0].address !== leaderAddress) errors.push(`${category} leader does not match rank 1`);
  }
  for (const leader of snapshot?.leaders || []) {
    if (!['ready', 'empty'].includes(leader?.status)) errors.push(`${leader?.category || 'unknown'} has invalid status`);
    if (leader?.status === 'ready' && !isImplicitAddress(leader.address)) errors.push(`${leader.category} has invalid address`);
    if (leader?.status === 'ready' && (!leader.scoreLabel || !leader.method || !leader.sourceUrl)) errors.push(`${leader.category} is missing display evidence`);
  }
  if (snapshot?.truncation?.mints || snapshot?.truncation?.appTransactions) errors.push('snapshot contains truncated rankings');
  return errors;
}

function retryAfterMilliseconds(value) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchJson(url, options = {}, timeoutMs = 45_000) {
  const maximumAttempts = 4;
  let lastError = null;
  for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let retryDelay = Math.min(8000, 500 * (2 ** attempt));
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      if (!response.ok) {
        const error = new Error(`${url} returned HTTP ${response.status}`);
        const retryable = response.status === 429 || response.status >= 500;
        if (!retryable) throw error;
        error.retryable = true;
        lastError = error;
        retryDelay = Math.min(15_000, retryAfterMilliseconds(response.headers.get('retry-after')) ?? retryDelay);
      } else {
        const payload = await response.json();
        if (payload?.errors?.length) {
          const error = new Error(payload.errors.map((item) => item.message).join('; '));
          error.retryable = true;
          throw error;
        }
        return payload;
      }
    } catch (error) {
      if (error?.retryable !== true && error?.message?.includes(' returned HTTP ')) throw error;
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
    if (attempt < maximumAttempts - 1) await wait(retryDelay);
  }
  throw lastError || new Error(`${url} failed after ${maximumAttempts} attempts`);
}

async function tzkt(pathname) {
  return fetchJson(`${TZKT}${pathname}`, { headers: { Accept: 'application/json' } });
}

async function objkt(query, variables) {
  const payload = await fetchJson(OBJKT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables })
  });
  return payload.data;
}

async function fetchObjktSales(days) {
  const query = `query MaxisSales($days: Int!, $limit: Int!) {
    sales_stat(
      where: { interval_days: { _eq: $days }, type: { _in: [buyer, artist] }, subject: { flag: { _eq: none } } }
      order_by: { volume: desc }
      limit: $limit
    ) {
      interval_days rank type volume subject_address
      subject { alias tzdomain flag }
    }
  }`;
  const data = await objkt(query, { days, limit: 500 });
  return data?.sales_stat || [];
}

async function fetchObjktMints(fromIso, toIso = new Date().toISOString(), { tokenCreatedWithinWindow = false } = {}) {
  const tokenCreationFilter = tokenCreatedWithinWindow
    ? 'token: { timestamp: { _gte: $from, _lt: $to } }'
    : '';
  const query = `query MaxisMints($from: timestamptz!, $to: timestamptz!, $limit: Int!, $after: bigint!) {
    event(
      where: {
        id: { _gt: $after }
        event_type: { _eq: mint }
        reverted: { _eq: false }
        timestamp: { _gte: $from, _lt: $to }
        ${tokenCreationFilter}
      }
      order_by: { id: asc }
      limit: $limit
    ) {
      id timestamp creator_address amount ophash fa_contract token_pk
      token { timestamp }
      creator { alias tzdomain flag }
    }
  }`;
  return fetchKeysetPages(async ({ limit, after }) => {
    const data = await objkt(query, { from: fromIso, to: toIso, limit, after });
    return data?.event || [];
  }, { pageSize: OBJKT_PAGE_SIZE, maxPages: OBJKT_MAX_PAGES });
}

async function fetchObjktListingSales(fromIso, toIso = new Date().toISOString()) {
  const query = `query MaxisSeasonSales($from: timestamptz!, $to: timestamptz!, $limit: Int!, $after: bigint!) {
    listing_sale(
      where: { id: { _gt: $after }, timestamp: { _gte: $from, _lt: $to } }
      order_by: { id: asc }
      limit: $limit
    ) {
      id timestamp price_xtz amount ophash buyer_address seller_address token_pk
      buyer { alias tzdomain flag }
      seller { alias tzdomain flag }
      token {
        fa_contract token_id
        creators { creator_address holder { alias tzdomain flag } }
      }
    }
  }`;
  return fetchKeysetPages(async ({ limit, after }) => {
    const data = await objkt(query, {
      from: fromIso,
      to: toIso,
      limit,
      after
    });
    return data?.listing_sale || [];
  }, { pageSize: OBJKT_PAGE_SIZE, maxPages: OBJKT_MAX_PAGES });
}

async function fetchPagedTzkt(pathname, params, { pageSize = TZKT_PAGE_SIZE, maxPages = TZKT_MAX_PAGES } = {}) {
  const rows = [];
  for (let page = 0; page < maxPages; page += 1) {
    const query = new URLSearchParams({
      ...params,
      offset: String(page * pageSize),
      limit: String(pageSize)
    });
    const batch = await tzkt(`${pathname}?${query}`);
    rows.push(...batch);
    if (batch.length < pageSize) return { rows, truncated: false, pages: page + 1 };
  }
  return { rows, truncated: true, pages: maxPages };
}

async function fetchTzktCount(pathname, params = {}) {
  const query = new URLSearchParams(params);
  const result = await tzkt(`${pathname}/count?${query}`);
  const count = Number(result);
  if (!Number.isFinite(count) || count < 0) throw new Error(`${pathname}/count returned an invalid count`);
  return count;
}

async function fetchAppTransactions(coverage, fromIso, toIso = null) {
  const rows = [];
  let truncated = false;
  for (const batch of chunks(coverage, CONTRACT_BATCH)) {
    const addresses = batch.map((item) => item.address).join(',');
    for (let page = 0; page < TZKT_MAX_PAGES; page += 1) {
      const query = new URLSearchParams({
        'target.in': addresses,
        'timestamp.ge': fromIso,
        status: 'applied',
        select: 'id,hash,counter,nonce,timestamp,sender,initiator,target,parameter,amount',
        'sort.asc': 'id',
        offset: String(page * TZKT_PAGE_SIZE),
        limit: String(TZKT_PAGE_SIZE)
      });
      if (toIso) query.set('timestamp.lt', toIso);
      const batchRows = await tzkt(`/operations/transactions?${query}`);
      rows.push(...batchRows);
      if (batchRows.length < TZKT_PAGE_SIZE) break;
      if (page === TZKT_MAX_PAGES - 1) truncated = true;
    }
  }
  return { rows, truncated };
}

async function fetchTargetTransactions(addresses, fromIso, toIso = null) {
  const coverage = addresses.map((address) => ({ address }));
  return fetchAppTransactions(coverage, fromIso, toIso);
}

async function fetchCurrentAccounts(addresses) {
  const rows = [];
  for (const batch of chunks([...new Set(addresses)].filter(isImplicitAddress), ACCOUNT_BATCH)) {
    if (!batch.length) continue;
    const query = new URLSearchParams({
      'address.in': batch.join(','),
      select: 'address,alias,delegate,balance,stakedBalance,firstActivityTime',
      limit: String(batch.length)
    });
    rows.push(...await tzkt(`/accounts?${query}`));
  }
  return rows;
}

async function fetchClosingDelegationAccounts(delegations, closeLevel) {
  const latest = new Map();
  for (const row of delegations) {
    const address = row?.sender?.address;
    if (!isImplicitAddress(address)) continue;
    const known = latest.get(address);
    if (!known || Number(row.id) > Number(known.id)) latest.set(address, row);
  }
  const assignments = [...latest.entries()].filter(([, row]) => isImplicitAddress(row?.newDelegate?.address));
  const rows = [];
  const missing = [];
  const batches = chunks(assignments, BALANCE_HISTORY_CONCURRENCY);
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    const batch = batches[batchIndex];
    const resolved = await Promise.all(batch.map(async ([address, row]) => {
      try {
        const balance = Number(await tzkt(`/accounts/${encodeURIComponent(address)}/balance_history/${closeLevel}`));
        if (!Number.isFinite(balance) || balance < 0) throw new Error('invalid balance');
        return {
          address,
          alias: row?.sender?.alias || null,
          delegate: row.newDelegate,
          balance,
          stakedBalance: 0,
          balanceLevel: closeLevel
        };
      } catch {
        missing.push(address);
        return null;
      }
    }));
    rows.push(...resolved.filter(Boolean));
    if (batchIndex < batches.length - 1) await wait(150);
  }
  return { rows, expected: assignments.length, missing };
}

function sourceUrl(category, address) {
  return ['collector', 'artist', 'minter'].includes(category)
    ? `https://objkt.com/profile/${encodeURIComponent(address)}`
    : `https://tzkt.io/${encodeURIComponent(address)}`;
}

function leader(category, title, row, scoreLabel, context, method, windowKind, rank = null) {
  if (!row) return { category, title, status: 'empty', method, windowKind };
  return {
    category,
    title,
    status: 'ready',
    rank,
    address: row.address,
    alias: row.alias || null,
    score: row.score,
    scoreLabel,
    context: context.filter(Boolean),
    lastActivity: row.lastActivity || null,
    sourceUrl: sourceUrl(category, row.address),
    method,
    windowKind
  };
}

function buildRanking({ category, title, rows, display, method, windowKind }) {
  return rows.slice(0, RANKING_LIMIT).map((row, index) => {
    const evidence = display(row);
    return leader(category, title, row, evidence.scoreLabel, evidence.context || [], method, windowKind, index + 1);
  });
}

function appLabels(row, apps) {
  const labels = new Map(apps.map((app) => [app.id, app.label]));
  return (row?.apps || []).map((id) => labels.get(id) || id).join(', ');
}

function buildSnapshot({ now, fromIso, config, accounts, delegates, sales, mints, coverage, appRows, truncation }) {
  const transactions = rankAccounts(accounts);
  const governance = rankDelegates(delegates, 'governance');
  const staking = rankDelegates(delegates, 'staking');
  const collectors = rankSalesStats(sales, 'buyer');
  const artists = rankSalesStats(sales, 'artist');
  const minters = rankMints(mints);
  const categoryLookup = Object.fromEntries(['defi', 'gaming'].map((category) => {
    const scopedCoverage = coverage.filter((item) => item.app.category === category);
    const lookup = new Map(scopedCoverage.map((item) => [item.address, item.app]));
    return [category, rankAppActivity(appRows.filter((row) => lookup.has(row?.target?.address)), lookup)];
  }));
  const unicorns = rankUnicorn({
    transaction: transactions,
    collector: collectors,
    artist: artists,
    minter: minters,
    defi: categoryLookup.defi,
    gaming: categoryLookup.gaming,
    governance
  }, 3, 500);

  const specs = [
    {
      category: 'transaction', title: 'Transaction Maxi', rows: transactions,
      display: (row) => ({ scoreLabel: `${formatInteger(row.transactions)} transactions`, context: ['All-time TzKT account counter'] }),
      method: 'Highest all-time transaction count among implicit user accounts indexed by TzKT.', windowKind: 'all-time'
    },
    {
      category: 'collector', title: 'Collector Maxi', rows: collectors,
      display: (row) => ({ scoreLabel: `${formatXtz(row.volume)} collected`, context: ['OBJKT-indexed 30d buyer volume'] }),
      method: 'Highest 30-day buyer volume in OBJKT sales statistics; flagged profiles excluded.', windowKind: 'rolling-30d'
    },
    {
      category: 'artist', title: 'Art Maxi', rows: artists,
      display: (row) => ({ scoreLabel: `${formatXtz(row.volume)} art volume`, context: ['OBJKT-indexed 30d artist volume'] }),
      method: 'Highest 30-day artist volume in OBJKT sales statistics; flagged profiles excluded.', windowKind: 'rolling-30d'
    },
    {
      category: 'minter', title: 'Mint Maxi', rows: minters,
      display: (row) => ({ scoreLabel: `${formatInteger(row.tokens)} tokens minted`, context: [`${formatInteger(row.mintOperations)} mint operations`, `${formatInteger(row.editions)} editions`] }),
      method: 'Most distinct token mints in OBJKT-indexed, non-reverted mint events during the rolling window.', windowKind: 'rolling-30d'
    },
    {
      category: 'defi', title: 'DeFi Maxi', rows: categoryLookup.defi,
      display: (row) => ({ scoreLabel: `${formatInteger(row.appCount)} apps · ${formatInteger(row.calls)} calls`, context: [appLabels(row, config.apps), `${formatInteger(row.contractCount)} recognized contracts`] }),
      method: 'Most distinct recognized DeFi apps used, then successful top-level wallet calls, across the curated TzKT alias taxonomy.', windowKind: 'rolling-30d'
    },
    {
      category: 'gaming', title: 'Gaming Maxi', rows: categoryLookup.gaming,
      display: (row) => ({ scoreLabel: `${formatInteger(row.appCount)} games · ${formatInteger(row.calls)} calls`, context: [appLabels(row, config.apps), `${formatInteger(row.contractCount)} recognized contracts`] }),
      method: 'Most distinct recognized Tezos games used, then successful top-level wallet calls, across the curated TzKT alias taxonomy.', windowKind: 'rolling-90d'
    },
    {
      category: 'governance', title: 'Governance Maxi', rows: governance,
      display: (row) => ({ scoreLabel: `${formatInteger(row.governanceActions)} governance actions`, context: [`${formatInteger(row.ballots)} ballots`, `${formatInteger(row.proposals)} proposals`] }),
      method: 'Most all-time ballots plus proposals among currently active TzKT delegates.', windowKind: 'all-time-active'
    },
    {
      category: 'staking', title: 'Staking Maxi', rows: staking,
      display: (row) => ({ scoreLabel: `${formatXtz(row.stakedBalance)} staked`, context: [`${formatInteger(row.stakers)} stakers`, `${formatXtz(row.bakingPower)} baking power`] }),
      method: 'Largest live staked balance among active TzKT delegates.', windowKind: 'live'
    },
    {
      category: 'unicorn', title: 'Tezos Unicorn', rows: unicorns,
      display: (row) => ({ scoreLabel: `${formatInteger(row.breadth)} lanes crossed`, context: [row.categories.map((item) => `${item.category} #${item.rank}`).join(' · ')] }),
      method: 'Breadth first across the top 500 available Transaction, Collector, Art, Mint, DeFi, Gaming, and Governance ranks; normalized rank points break ties. Requires three lanes.', windowKind: 'mixed'
    }
  ];
  const rankings = Object.fromEntries(specs.map((spec) => [spec.category, buildRanking(spec)]));
  const leaders = specs.map((spec) => rankings[spec.category][0]
    || leader(spec.category, spec.title, null, '', [], spec.method, spec.windowKind));

  return {
    schema: 2,
    rankingLimit: RANKING_LIMIT,
    generatedAt: now.toISOString(),
    window: { kind: 'rolling', days: config.windowDays, gamingDays: GAMING_WINDOW_DAYS, from: fromIso, to: now.toISOString() },
    staleAfterHours: 48,
    sources: [
      { name: 'TzKT', url: 'https://api.tzkt.io/', role: 'accounts, delegates, contract labels, successful contract calls' },
      { name: 'OBJKT API v3', url: 'https://data.objkt.com/docs/', role: 'buyer and artist sales ranks, mint events, profile identity' }
    ],
    coverage: {
      contractCatalogLimitPerKind: config.contractCatalogLimit,
      contractCatalogKinds: CONTRACT_CATALOG_KINDS,
      recognizedContracts: coverage.length,
      recognizedApps: config.apps.length,
      byCategory: Object.fromEntries(['defi', 'gaming'].map((category) => [category, {
        apps: config.apps.filter((app) => app.category === category).length,
        contracts: coverage.filter((item) => item.app.category === category).length
      }])),
      caveat: 'DeFi and Gaming cover successful top-level wallet calls to recently active contracts recognized by the reviewed TzKT-alias taxonomy. Unknown or unlabeled contracts are not classified.'
    },
    truncation,
    leaders,
    rankings
  };
}

function seasonPaths(seasonId) {
  if (!/^protocol-[0-9]+-P[1-9A-HJ-NP-Za-km-z]{50}$/.test(String(seasonId || ''))) {
    throw new Error(`Unsafe or invalid Maxis season id: ${seasonId}`);
  }
  const relativeDirectory = `data/maxis/seasons/${seasonId}`;
  const seasonRoot = path.resolve(ROOT, 'data/maxis/seasons');
  const directory = path.resolve(ROOT, relativeDirectory);
  if (!directory.startsWith(`${seasonRoot}${path.sep}`)) throw new Error(`Maxis season path escapes the season root: ${seasonId}`);
  return {
    directory,
    relativeDirectory,
    summaryFile: path.join(directory, 'summary.json'),
    summaryUrl: `/${relativeDirectory}/summary.json`,
    rulesFile: path.join(directory, 'rules.json'),
    rulesUrl: `/${relativeDirectory}/rules.json`,
    transactionStateFile: path.join(directory, 'transaction-state.json'),
    transactionStateUrl: `/${relativeDirectory}/transaction-state.json`,
    transactionBuildingStateFile: path.join(directory, 'transaction-state.building.json'),
    transactionBuildingStateUrl: `/${relativeDirectory}/transaction-state.building.json`,
    passportDirectory: path.join(directory, 'passports'),
    passportUrlTemplate: `/${relativeDirectory}/passports/{shard}.json`
  };
}

async function writeJsonAtomic(file, value) {
  return writeTextAtomic(file, jsonText(value));
}

async function writeTextAtomic(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}`;
  await fs.writeFile(temporary, value);
  await fs.rename(temporary, file);
}

async function resolveTransactionTarget(generatedAt, endLevelExclusive = null) {
  let boundary;
  let levelExclusive;
  let mode;
  if (endLevelExclusive) {
    levelExclusive = Number(endLevelExclusive);
    boundary = await tzkt(`/blocks/${levelExclusive - 1}`);
    mode = 'exact-close';
  } else {
    const head = await tzkt('/head');
    const confirmedLevel = Number(head?.level) - TRANSACTION_CONFIRMED_LEVEL_LAG;
    if (!Number.isInteger(confirmedLevel) || confirmedLevel < 1) throw new Error('TzKT head cannot provide a confirmed Transaction boundary');
    levelExclusive = confirmedLevel + 1;
    boundary = confirmedLevel === Number(head.level) ? head : await tzkt(`/blocks/${confirmedLevel}`);
    mode = 'confirmed-active';
  }
  const target = {
    levelExclusive,
    throughExclusive: new Date(generatedAt).toISOString(),
    boundaryLevel: Number(boundary?.level),
    boundaryHash: boundary?.hash,
    boundaryTimestamp: new Date(boundary?.timestamp).toISOString(),
    mode
  };
  if (target.boundaryLevel !== levelExclusive - 1 || !target.boundaryHash) throw new Error('TzKT Transaction boundary receipt is incomplete');
  if (Date.parse(target.throughExclusive) <= Date.parse(target.boundaryTimestamp)) throw new Error('Transaction snapshot time must follow its fixed boundary block');
  return target;
}

async function transactionRawCount(season, target) {
  return fetchTzktCount('/operations/transactions', {
    'level.ge': String(season.activationLevel),
    'level.lt': String(target.levelExclusive),
    status: 'applied'
  });
}

async function writeTransactionStateCheckpoint(file, state) {
  const signed = signTransactionAccumulator(serializeTransactionAccumulator(state));
  const errors = transactionAccumulatorErrors(signed, { allowBuilding: true });
  if (errors.length) throw new Error(`Refusing invalid Transaction checkpoint: ${errors.join('; ')}`);
  await writeJsonAtomic(file, signed);
  return signed;
}

function deferredTransactionScan(message) {
  const error = new Error(message);
  error.code = 'MAXIS_TRANSACTION_DEFERRED';
  return error;
}

async function scanTransactionTarget({ state, season, target, completeFile, buildingFile, fullReplay = false }) {
  beginTransactionScan(state, target, { fullReplay: state.status === 'building' ? false : fullReplay });
  await writeTransactionStateCheckpoint(buildingFile, state);
  let pagesThisRun = 0;
  while (pagesThisRun < TRANSACTION_MAX_PAGES_PER_TARGET) {
    const query = new URLSearchParams({
      'level.ge': String(state.scan.startLevel),
      'level.lt': String(state.scan.target.levelExclusive),
      'id.gt': String(state.scan.cursorLastId),
      status: 'applied',
      'sort.asc': 'id',
      select: 'id,level,timestamp,status,nonce,sender',
      limit: String(TRANSACTION_PAGE_SIZE)
    });
    let batch;
    try {
      batch = await tzkt(`/operations/transactions?${query}`);
    } catch (error) {
      await writeTransactionStateCheckpoint(buildingFile, state);
      throw deferredTransactionScan(`Transaction scan checkpointed after source error: ${error.message}`);
    }
    applyTransactionPage(state, batch, { pageSize: TRANSACTION_PAGE_SIZE });
    pagesThisRun += 1;
    if (pagesThisRun % TRANSACTION_CHECKPOINT_EVERY_PAGES === 0) {
      await writeTransactionStateCheckpoint(buildingFile, state);
      console.log(`Transaction accumulator ${season.displayLabel}: ${state.scan.pages} pages · ${formatInteger(state.scan.fetchedRows)} rows · cursor ${state.scan.cursorLastId}`);
    }
    if (batch.length < TRANSACTION_PAGE_SIZE) {
      const expectedRawCount = await transactionRawCount(season, target);
      try {
        completeTransactionScan(state, { expectedRawCount });
      } catch (error) {
        if (!fullReplay && /count mismatch/.test(error.message)) {
          console.warn(`${error.message}; restarting ${season.displayLabel} Transaction state from activation`);
          const fresh = createTransactionScanState({ season, rules: state.rules });
          return scanTransactionTarget({ state: fresh, season, target, completeFile, buildingFile, fullReplay: true });
        }
        throw error;
      }
      const complete = await writeTransactionStateCheckpoint(completeFile, state);
      try { await fs.unlink(buildingFile); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
      return complete;
    }
  }
  await writeTransactionStateCheckpoint(buildingFile, state);
  throw deferredTransactionScan(`Transaction accumulator remains incomplete after ${TRANSACTION_MAX_PAGES_PER_TARGET} pages; signed sidecar retained without publishing a partial winner`);
}

async function updateTransactionAccumulator({ season, rules, generatedAt, endLevelExclusive = null }) {
  const paths = seasonPaths(season.id);
  const target = await resolveTransactionTarget(generatedAt, endLevelExclusive);
  let document = await readJsonIfExists(paths.transactionStateFile);
  let buildingDocument = endLevelExclusive ? null : await readJsonIfExists(paths.transactionBuildingStateFile);
  if (endLevelExclusive) {
    try { await fs.unlink(paths.transactionBuildingStateFile); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  }
  for (const [label, candidate] of [['complete', document], ['building', buildingDocument]]) {
    if (!candidate) continue;
    const errors = transactionAccumulatorErrors(candidate, { allowBuilding: label === 'building' });
    if (errors.length) throw new Error(`Invalid persisted Transaction state: ${errors.join('; ')}`);
  }
  let state = createTransactionScanState({ season, rules, document: buildingDocument || document });
  if (buildingDocument) {
    if (Number(state.scan.target.levelExclusive) > Number(target.levelExclusive)) {
      throw new Error(`Persisted Transaction building target ${state.scan.target.levelExclusive} is ahead of resolved target ${target.levelExclusive}`);
    }
    const frozenReceipt = await tzkt(`/blocks/${state.scan.target.boundaryLevel}`);
    if (frozenReceipt?.hash !== state.scan.target.boundaryHash) {
      try { await fs.unlink(paths.transactionBuildingStateFile); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
      buildingDocument = null;
      state = createTransactionScanState({ season, rules, document });
    }
  }
  if (state.status === 'building') {
    const pendingTarget = state.scan.target;
    document = await scanTransactionTarget({
      state,
      season,
      target: pendingTarget,
      completeFile: paths.transactionStateFile,
      buildingFile: paths.transactionBuildingStateFile,
      fullReplay: state.scan.fullReplay
    });
    state = createTransactionScanState({ season, rules, document });
  }
  if (state.status === 'complete' && state.boundary) {
    if (Number(state.boundary.levelExclusive) > Number(target.levelExclusive)) {
      throw new Error(`Persisted Transaction boundary ${state.boundary.levelExclusive} is ahead of resolved target ${target.levelExclusive}`);
    }
    const receipt = await tzkt(`/blocks/${state.boundary.boundaryLevel}`);
    if (receipt?.hash !== state.boundary.boundaryHash) {
      state = createTransactionScanState({ season, rules });
      document = null;
    }
  }
  if (!document || state.status === 'idle') {
    document = await scanTransactionTarget({ state, season, target, completeFile: paths.transactionStateFile, buildingFile: paths.transactionBuildingStateFile, fullReplay: true });
  } else if (
    Number(document.boundary.levelExclusive) < Number(target.levelExclusive)
    || (endLevelExclusive && document.boundary.mode !== 'exact-close')
  ) {
    state = createTransactionScanState({ season, rules, document });
    document = await scanTransactionTarget({
      state,
      season,
      target,
      completeFile: paths.transactionStateFile,
      buildingFile: paths.transactionBuildingStateFile,
      fullReplay: Boolean(endLevelExclusive)
    });
  }
  const errors = transactionAccumulatorErrors(document);
  if (errors.length) throw new Error(`Completed Transaction state is invalid: ${errors.join('; ')}`);
  const rows = transactionAccumulatorRows(document);
  const bytes = Buffer.byteLength(jsonText(document));
  return {
    document,
    rows,
    bytes,
    withinStateBudget: bytes <= MAX_TRANSACTION_STATE_BYTES,
    receipt: {
      source: 'TzKT operations/transactions',
      mode: 'exact-incremental-id-keyset-with-tail-reconciliation-v1',
      statePath: paths.transactionStateUrl,
      stateHash: document.integrity.contentHash,
      stateSchema: TRANSACTION_STATE_SCHEMA,
      stateVersion: TRANSACTION_STATE_VERSION,
      replayLevels: TRANSACTION_REPLAY_LEVELS,
      fromLevelInclusive: season.activationLevel,
      levelExclusive: document.boundary.levelExclusive,
      throughExclusive: document.boundary.throughExclusive,
      boundaryLevel: document.boundary.boundaryLevel,
      boundaryHash: document.boundary.boundaryHash,
      boundaryTimestamp: document.boundary.boundaryTimestamp,
      boundaryMode: document.boundary.mode,
      cursorLastId: document.boundary.cursorLastId,
      expectedRawCount: document.boundary.expectedRawCount,
      scannedRows: document.counts.scannedRows,
      eligibleTopLevelImplicitRows: document.counts.eligibleRows,
      eligibleAddresses: document.counts.addresses,
      clientFilters: document.boundary.clientFilters,
      exhaustion: document.boundary.exhaustion,
      stateBytes: bytes,
      stateBudgetBytes: MAX_TRANSACTION_STATE_BYTES,
      complete: true,
      completeClaim: document.boundary.mode === 'exact-close'
        ? 'Exact after settled full replay through the next protocol activation boundary.'
        : 'Complete against the observed confirmed TzKT index and matching full-range raw count; the last 128 levels are replacement-replayed on refresh.'
    }
  };
}

async function evaluatorImplementationHash(version = CURRENT_MAXIS_EVALUATOR_VERSION) {
  if (version !== 'maxis-evaluator-v2') throw new Error(`No immutable source manifest for ${version}`);
  const evaluator = getMaxisEvaluator(version);
  const source = getMaxisSource(version);
  const immutableFiles = source.IMMUTABLE_IMPLEMENTATION_FILES;
  if (!Array.isArray(immutableFiles) || !immutableFiles.length) throw new Error(`No immutable file closure for ${version}`);
  const files = immutableFiles.map((relative) => path.join(ROOT, relative));
  const semanticFunctions = [
    chunks,
    stableValue,
    contentHash,
    jsonText,
    passportShardText,
    textHash,
    seasonPaths,
    signTransactionAccumulator,
    transactionAccumulatorErrors,
    fetchJson,
    tzkt,
    objkt,
    fetchObjktMints,
    fetchObjktListingSales,
    fetchPagedTzkt,
    fetchTzktCount,
    fetchAppTransactions,
    fetchTargetTransactions,
    fetchCurrentAccounts,
    fetchClosingDelegationAccounts,
    resolveTransactionTarget,
    transactionRawCount,
    writeTransactionStateCheckpoint,
    scanTransactionTarget,
    updateTransactionAccumulator,
    resolveExactProtocolSeason,
    assignSeasonIdentity,
    ruleDefinitionFor,
    laneRuleHashesFor,
    settlementEligibleAt,
    buildFullSeasonSnapshot,
    buildPassportShardPayloads,
    passportShardIntegrity,
    writeTextAtomic,
    writePassportShards,
    readPassportShards,
    reconstructSeasonSnapshot,
    refreshFinalizedSummaryIntegrity,
    sealSeasonArtifactBudget,
    assertSeasonArtifactBudget,
    prepareSeasonArtifacts,
    compactRank,
    finalizedChampions,
    buildSeasonSummary,
    validateSeasonSummary,
    buildSettlementSummary,
    resealPersistedSummaryBudget,
    finalizeSeasonSummaryPayload,
    buildExactTransitionFinalization,
    buildFinalizedConcurrentManifest
  ].map((fn) => fn.toString());
  const constants = stableValue({
    TZKT,
    OBJKT,
    OBJKT_PAGE_SIZE,
    OBJKT_MAX_PAGES,
    TZKT_PAGE_SIZE,
    TZKT_MAX_PAGES,
    TRANSACTION_PAGE_SIZE,
    TRANSACTION_MAX_PAGES_PER_TARGET,
    TRANSACTION_CONFIRMED_LEVEL_LAG,
    TRANSACTION_REPLAY_LEVELS,
    TRANSACTION_STATE_SCHEMA,
    TRANSACTION_STATE_VERSION,
    CONTRACT_BATCH,
    ACCOUNT_BATCH,
    BALANCE_HISTORY_CONCURRENCY,
    FINALIZATION_SETTLEMENT_HOURS,
    MAX_TRANSACTION_STATE_BYTES,
    MAX_ACTIVE_SEASON_ARTIFACT_BYTES,
    MAX_PASSPORT_SHARD_BYTES,
    sourceIoBindings: Object.fromEntries(Object.entries(SEASON_SOURCE_IO)
      .sort(([left], [right]) => compareCodePoint(left, right))
      .map(([name, fn]) => [name, fn.toString()]))
  });
  const runtimeBinding = {
    evaluatorVersion: evaluator.SEASON_EVALUATOR_VERSION,
    evaluatorRuleBuilder: evaluator.buildRuleDefinition.toString(),
    evaluatorSnapshotBuilder: evaluator.buildSeasonCompetition.toString(),
    evaluatorValidator: evaluator.validateSeasonSnapshot.toString(),
    sourceVersion: source.MAXIS_SOURCE_VERSION,
    sourceEvaluatorVersion: source.EVALUATOR_VERSION,
    sourceBuilder: source.buildFullSeasonSnapshot.toString(),
    sourceFallback: source.rebuildWithoutTransactionLane.toString(),
    immutableFiles
  };
  const contents = await Promise.all(files.map((file) => fs.readFile(file, 'utf8')));
  return createHash('sha256')
    .update(JSON.stringify({ version, constants, runtimeBinding }))
    .update(contents.join('\n/* immutable v2 module boundary */\n'))
    .update(semanticFunctions.join('\n/* frozen v2 semantic adapter */\n'))
    .digest('hex');
}

function ruleDefinitionFor(version, implementationHash) {
  return getMaxisEvaluator(version).buildRuleDefinition(implementationHash);
}

function laneRuleHashesFor(version, lanes, evaluatorSemantics) {
  return getMaxisEvaluator(version).buildLaneRuleHashes(lanes, evaluatorSemantics);
}

function semanticContractCoverage(contractCoverageSnapshot) {
  return contractCoverageSnapshot.map((item) => ({
    address: item.address,
    appId: item.app?.id,
    category: item.app?.category,
    liquidityEntrypoints: [...(item.app?.liquidityEntrypoints || [])].sort()
  })).sort((left, right) => (
    compareCodePoint(left.category, right.category)
    || compareCodePoint(left.appId, right.appId)
    || compareCodePoint(left.address, right.address)
  ));
}

function semanticContractCoverageHashes(snapshot) {
  const ordinaryLane = (category) => snapshot
    .filter((item) => item.category === category)
    .map(({ address, appId, category: itemCategory }) => ({ address, appId, category: itemCategory }));
  const liquidity = snapshot
    .filter((item) => item.liquidityEntrypoints.length)
    .map(({ address, appId, category, liquidityEntrypoints }) => ({ address, appId, category, liquidityEntrypoints }));
  return {
    defi: contentHash(ordinaryLane('defi')),
    gaming: contentHash(ordinaryLane('gaming')),
    liquidity: contentHash(liquidity)
  };
}

async function resolveFrozenRules(config, season, generatedAt, contracts) {
  const paths = seasonPaths(season.id);
  const existing = await readJsonIfExists(paths.rulesFile);
  const evaluatorVersion = CURRENT_MAXIS_EVALUATOR_VERSION;
  const evaluator = getMaxisEvaluator(evaluatorVersion);
  const implementationHash = await evaluatorImplementationHash(evaluatorVersion);
  const definition = evaluator.buildRuleDefinition(implementationHash);
  const rulesHash = contentHash(definition);
  const laneRuleHashes = evaluator.buildLaneRuleHashes();
  if (existing) {
    if (
      existing.seasonId !== season.id
      || existing.protocolHash !== season.protocolHash
      || Number(existing.protocolNumber) !== Number(season.protocolNumber)
      || existing.protocolName !== season.protocolName
      || Number(existing.activationLevel) !== Number(season.activationLevel)
      || existing.activatedAt !== season.activatedAt
    ) {
      throw new Error(`Frozen Maxis rules at ${paths.rulesFile} belong to another protocol season`);
    }
    if (existing.version !== evaluator.SEASON_RULES_VERSION || existing.rulesHash !== rulesHash) {
      throw new Error(`Season ${season.id} rules are frozen at ${existing.version}/${existing.rulesHash}; current code would change them`);
    }
    if (existing.evaluatorVersion !== evaluatorVersion || existing.evaluatorImplementationHash !== implementationHash) {
      throw new Error(`Season ${season.id} evaluator is frozen at ${existing.evaluatorVersion}/${existing.evaluatorImplementationHash}; current implementation is ${evaluatorVersion}/${implementationHash}`);
    }
    if (!Array.isArray(existing.contractCoverageSnapshot) || !existing.contractCoverageHash) {
      throw new Error(`Season ${season.id} does not contain a frozen resolved-contract coverage map`);
    }
    if (contentHash(existing.contractCoverageSnapshot) !== existing.contractCoverageHash) {
      throw new Error(`Season ${season.id} frozen resolved-contract coverage hash is invalid`);
    }
    if (
      !Array.isArray(existing.semanticContractCoverageSnapshot)
      || contentHash(existing.semanticContractCoverageSnapshot) !== existing.semanticContractCoverageHash
      || JSON.stringify(semanticContractCoverageHashes(existing.semanticContractCoverageSnapshot)) !== JSON.stringify(existing.semanticContractCoverageHashes)
    ) {
      throw new Error(`Season ${season.id} frozen semantic contract coverage hashes are invalid`);
    }
    if (JSON.stringify(existing.laneRuleHashes) !== JSON.stringify(laneRuleHashes)) {
      throw new Error(`Season ${season.id} lane compatibility hashes are invalid`);
    }
    const configErrors = validateMaxisConfig(existing.taxonomySnapshot);
    if (configErrors.length) throw new Error(`Frozen season taxonomy is invalid: ${configErrors.join('; ')}`);
    return existing;
  }
  const contractCoverageSnapshot = compileContractCoverage(contracts, config.apps, null).map((item) => ({
    address: item.address,
    alias: item.alias,
    catalogKind: item.kind,
    lastActivityTimeAtFreeze: item.lastActivityTime,
    app: {
      ...item.app,
      liquidityEntrypoints: config.apps.find((app) => app.id === item.app.id)?.liquidityEntrypoints || []
    },
    provenance: {
      source: 'TzKT separately bounded recent smart_contract and asset catalog aliases',
      catalogKind: item.kind,
      perKindLimit: config.contractCatalogLimit,
      frozenAt: generatedAt,
      taxonomyHash: contentHash(config)
    }
  }));
  const semanticContractCoverageSnapshot = semanticContractCoverage(contractCoverageSnapshot);
  return {
    schema: 1,
    seasonId: season.id,
    protocolNumber: season.protocolNumber,
    protocolName: season.protocolName,
    protocolHash: season.protocolHash,
    activationLevel: season.activationLevel,
    activatedAt: season.activatedAt,
    version: evaluator.SEASON_RULES_VERSION,
    evaluatorVersion,
    evaluatorImplementationHash: implementationHash,
    frozenAt: generatedAt,
    rulesHash,
    taxonomyHash: contentHash(config),
    contractCoverageHash: contentHash(contractCoverageSnapshot),
    semanticContractCoverageHash: contentHash(semanticContractCoverageSnapshot),
    semanticContractCoverageHashes: semanticContractCoverageHashes(semanticContractCoverageSnapshot),
    laneEvaluatorSemantics: evaluator.LANE_EVALUATOR_SEMANTICS,
    laneRuleHashes,
    definition,
    taxonomySnapshot: config,
    contractCoverageSnapshot,
    semanticContractCoverageSnapshot
  };
}

async function persistFrozenRules(rules) {
  const paths = seasonPaths(rules.seasonId);
  await fs.mkdir(paths.directory, { recursive: true });
  try {
    await fs.writeFile(paths.rulesFile, jsonText(rules), { flag: 'wx' });
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    const existing = await readJson(paths.rulesFile);
    if (contentHash(existing) !== contentHash(rules)) {
      throw new Error(`Season ${rules.seasonId} rules changed while freezing before source checkpoints`);
    }
  }
  return paths;
}

function manifestEntry(season, rules, generatedAt, availableShards = []) {
  const paths = seasonPaths(season.id);
  return {
    id: season.id,
    seasonOrdinal: season.seasonOrdinal,
    phase: season.phase,
    displayLabel: season.displayLabel,
    protocolNumber: season.protocolNumber,
    protocolName: season.protocolName,
    protocolHash: season.protocolHash,
    activationLevel: season.activationLevel,
    activatedAt: season.activatedAt,
    activationDateSource: season.activationDateSource,
    status: season.status,
    endsAt: season.endsAt,
    endsWhen: season.endsWhen,
    rulesVersion: rules.version,
    evaluatorVersion: rules.evaluatorVersion,
    evaluatorImplementationHash: rules.evaluatorImplementationHash,
    rulesHash: rules.rulesHash,
    taxonomyHash: rules.taxonomyHash,
    contractCoverageHash: rules.contractCoverageHash,
    semanticContractCoverageHash: rules.semanticContractCoverageHash,
    semanticContractCoverageHashes: rules.semanticContractCoverageHashes,
    laneRuleHashes: rules.laneRuleHashes,
    rulesPath: paths.rulesUrl,
    summaryPath: paths.summaryUrl,
    passportPathTemplate: paths.passportUrlTemplate,
    availableShards,
    lastSnapshotAt: generatedAt,
    archiveUrl: season.status === 'finalized' ? paths.summaryUrl : null
  };
}

function assignSeasonIdentity(season, manifest) {
  const existing = (manifest?.seasons || []).find((item) => item.id === season.id);
  const ordered = [...(manifest?.seasons || [])].sort((left, right) => Number(left.activationLevel) - Number(right.activationLevel));
  const ordinal = existing?.seasonOrdinal || ordered.length + 1;
  const phase = existing?.phase || 'season';
  return {
    ...season,
    seasonOrdinal: ordinal,
    phase,
    displayLabel: existing?.displayLabel || `${season.protocolName} Season`
  };
}

function buildPassportShardPayloads(passportIndex, season) {
  const groups = new Map();
  for (const [address, passport] of Object.entries(passportIndex?.byAddress || {})) {
    const shard = addressShard(address);
    const current = groups.get(shard) || {};
    current[address] = passport;
    groups.set(shard, current);
  }
  return new Map([...groups.entries()].sort(([left], [right]) => compareCodePoint(left, right)).map(([shard, passports]) => [shard, {
    schema: 2,
    seasonId: season.id,
    shard,
    shardAlgorithm: PASSPORT_SHARD_ALGORITHM,
    passports: Object.fromEntries(Object.entries(passports).sort(([left], [right]) => compareCodePoint(left, right)))
  }]));
}

function passportShardIntegrity(payloads) {
  const shardHashes = Object.fromEntries([...payloads.entries()].map(([shard, payload]) => [shard, textHash(passportShardText(payload))]));
  const contentRoot = textHash(Object.entries(shardHashes)
    .sort(([left], [right]) => compareCodePoint(left, right))
    .map(([shard, hash]) => `${shard}:${hash}`)
    .join('\n'));
  return {
    algorithm: 'sha256-compact-json-v1',
    shardHashes,
    contentRoot
  };
}

function refreshFinalizedSummaryIntegrity(summary) {
  if (summary?.season?.status !== 'finalized') return summary;
  const { integrity: _integrity, ...unsigned } = summary;
  return {
    ...unsigned,
    integrity: { algorithm: 'sha256', contentHash: contentHash(unsigned) }
  };
}

function sealSeasonArtifactBudget({ rules, summary, transactionState, shardPayloads }) {
  let sealed = {
    ...summary,
    artifactBudget: {
      schema: 1,
      measurement: 'utf8-pretty-core-compact-shards-v1',
      rulesBytes: 0,
      summaryBytes: 0,
      transactionStateBytes: 0,
      passportShardsBytes: 0,
      totalBytes: 0,
      shardCount: shardPayloads.size,
      maxShard: { shard: null, bytes: 0 },
      limits: SEASON_ARTIFACT_LIMITS,
      withinBudget: false,
      violations: []
    }
  };
  for (let attempt = 0; attempt < 12; attempt += 1) {
    sealed = refreshFinalizedSummaryIntegrity(sealed);
    const receipt = measureSeasonArtifactBudget({
      rules,
      summary: sealed,
      transactionState,
      shardPayloads,
      limits: SEASON_ARTIFACT_LIMITS
    });
    const next = refreshFinalizedSummaryIntegrity({ ...sealed, artifactBudget: receipt });
    const verification = measureSeasonArtifactBudget({
      rules,
      summary: next,
      transactionState,
      shardPayloads,
      limits: SEASON_ARTIFACT_LIMITS
    });
    if (JSON.stringify(receipt) === JSON.stringify(verification)) return next;
    sealed = { ...next, artifactBudget: verification };
  }
  throw new Error(`Season artifact budget receipt failed to stabilize for ${summary?.season?.id || 'unknown season'}`);
}

function assertSeasonArtifactBudget({ rules, summary, transactionState, shardPayloads }) {
  const measured = measureSeasonArtifactBudget({
    rules,
    summary,
    transactionState,
    shardPayloads,
    limits: SEASON_ARTIFACT_LIMITS
  });
  const errors = artifactBudgetErrors(measured);
  if (JSON.stringify(summary?.artifactBudget) !== JSON.stringify(measured)) {
    errors.push('summary artifact budget receipt does not match its pretty-JSON payloads');
  }
  if (errors.length) throw new Error(`Maxis artifact budget failed: ${errors.join('; ')}`);
  return measured;
}

function prepareSeasonArtifacts({ fullSnapshot, season, rules, buildOptions, summaryTransform = (summary) => summary }) {
  const prepare = (snapshot) => {
    const shardPayloads = buildPassportShardPayloads(snapshot.passportIndex, season);
    const openSummary = buildSeasonSummary(snapshot, shardPayloads);
    const summary = sealSeasonArtifactBudget({
      rules,
      summary: summaryTransform(openSummary),
      transactionState: snapshot.transactionAccumulator,
      shardPayloads
    });
    const receipt = measureSeasonArtifactBudget({
      rules,
      summary,
      transactionState: snapshot.transactionAccumulator,
      shardPayloads,
      limits: SEASON_ARTIFACT_LIMITS
    });
    return { fullSnapshot: snapshot, shardPayloads, summary, receipt };
  };

  let prepared = prepare(fullSnapshot);
  if (!prepared.receipt.withinBudget && fullSnapshot?.laneStatus?.transaction?.status === 'ready') {
    const source = getMaxisSource(rules.evaluatorVersion);
    const reason = `Transaction was withheld before publication because the complete eligible-wallet Passport tree exceeded the frozen artifact budget: ${prepared.receipt.violations.join('; ')}`;
    const fallbackSnapshot = source.rebuildWithoutTransactionLane(buildOptions, fullSnapshot, reason);
    const snapshotErrors = getMaxisEvaluator(rules.evaluatorVersion).validateSeasonSnapshot(fallbackSnapshot);
    if (snapshotErrors.length) throw new Error(`Invalid artifact-budget fallback snapshot: ${snapshotErrors.join('; ')}`);
    prepared = prepare(fallbackSnapshot);
  }
  assertSeasonArtifactBudget({
    rules,
    summary: prepared.summary,
    transactionState: prepared.fullSnapshot.transactionAccumulator,
    shardPayloads: prepared.shardPayloads
  });
  return prepared;
}

async function writePassportShards(paths, payloads) {
  for (const [shard, payload] of payloads) {
    const bytes = compactJsonBytes(payload);
    if (bytes > MAX_PASSPORT_SHARD_BYTES) {
      throw new Error(`Refusing Passport shard ${shard}: ${bytes} bytes exceeds ${MAX_PASSPORT_SHARD_BYTES}`);
    }
  }
  await fs.mkdir(paths.passportDirectory, { recursive: true });
  const existing = (await fs.readdir(paths.passportDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /^[0-3][0-9a-f]\.json$/.test(entry.name))
    .map((entry) => entry.name);
  const desired = new Set([...payloads.keys()].map((shard) => `${shard}.json`));
  for (const filename of existing) {
    if (!desired.has(filename)) await fs.unlink(path.join(paths.passportDirectory, filename));
  }
  for (const [shard, payload] of payloads) {
    const file = path.join(paths.passportDirectory, `${shard}.json`);
    const next = passportShardText(payload);
    let current = null;
    try { current = await fs.readFile(file, 'utf8'); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
    if (current !== next) await writeTextAtomic(file, next);
  }
}

async function readPassportShards(paths, availableShards = null, {
  expectedHashes = null,
  expectedSeasonId = null,
  payloadCollector = null
} = {}) {
  let shards = availableShards;
  if (!Array.isArray(shards)) {
    try {
      shards = (await fs.readdir(paths.passportDirectory))
        .filter((filename) => /^[0-3][0-9a-f]\.json$/.test(filename))
        .map((filename) => filename.slice(0, 2));
    } catch (error) {
      if (error?.code === 'ENOENT') return {};
      throw error;
    }
  }
  const byAddress = {};
  for (const shard of shards) {
    const raw = await fs.readFile(path.join(paths.passportDirectory, `${shard}.json`), 'utf8');
    if (expectedHashes?.[shard] && textHash(raw) !== expectedHashes[shard]) {
      throw new Error(`Passport shard ${shard} content hash is invalid`);
    }
    const payload = JSON.parse(raw);
    if (Number(payload.schema) !== 2 || payload.shard !== shard || payload.shardAlgorithm !== PASSPORT_SHARD_ALGORITHM) {
      throw new Error(`Passport shard ${shard} has incompatible metadata`);
    }
    if (expectedSeasonId && payload.seasonId !== expectedSeasonId) {
      throw new Error(`Passport shard ${shard} seasonId does not match its summary`);
    }
    if (payloadCollector) payloadCollector.set(shard, payload);
    for (const [address, passport] of Object.entries(payload.passports || {})) {
      if (addressShard(address) !== shard || passport?.address !== address) {
        throw new Error(`Passport ${address} is in the wrong shard or has a mismatched identity`);
      }
      byAddress[address] = passport;
    }
  }
  return byAddress;
}

async function reconstructSeasonSnapshot(entry) {
  if (!entry) return null;
  const paths = seasonPaths(entry.id);
  const summary = await readJson(paths.summaryFile);
  const byAddress = await readPassportShards(paths, entry.availableShards, {
    expectedHashes: summary.passports?.shardHashes,
    expectedSeasonId: entry.id
  });
  const evaluator = getMaxisEvaluator(summary.rules?.evaluatorVersion);
  const laneCatalog = summary.laneCatalog || [];
  const rankings = Object.fromEntries(laneCatalog.map(({ category }) => [category, []]));
  const expandedByAddress = Object.fromEntries(Object.entries(byAddress).map(([address, passport]) => [address, evaluator.expandPassportRecord(passport)]));
  for (const passport of Object.values(expandedByAddress)) {
    for (const [category, lane] of Object.entries(passport.lanes || {})) {
      rankings[category] ||= [];
      rankings[category].push({
        address: passport.address,
        alias: passport.alias,
        rank: lane.rank,
        scoreVector: lane.scoreVector,
        scoreLabel: lane.scoreLabel,
        activeWeeks: lane.activeWeeks,
        passGap: lane.passGap,
        delta: lane.delta
      });
    }
    if (passport.unicorn?.rank) rankings.unicorn.push({
      address: passport.address,
      alias: passport.alias,
      rank: passport.unicorn.rank,
      breadth: passport.unicorn.breadth,
      points: passport.unicorn.points || 0,
      activeWeeks: passport.activeWeeks || []
    });
  }
  Object.values(rankings).forEach((rows) => rows.sort((left, right) => left.rank - right.rank));
  return {
    ...summary,
    rankings,
    passportIndex: { format: 'address-map', indexedAddresses: Object.keys(expandedByAddress).length, byAddress: expandedByAddress }
  };
}

function compactRank(row) {
  if (!row) return null;
  return {
    rank: row.rank,
    address: row.address,
    alias: row.alias,
    scoreLabel: row.scoreLabel,
    scoreVector: row.scoreVector,
    sourceUrl: row.sourceUrl,
    delta: row.delta,
    previousRank: row.previousRank
  };
}

function finalizedChampions(summary) {
  return (summary.laneCatalog || []).flatMap(({ category, title, order }) => {
    const row = summary?.rankings?.[category]?.[0];
    if (summary?.laneStatus?.[category]?.status !== 'ready' || Number(row?.rank) !== 1) return [];
    return [{
      category,
      title,
      laneOrder: order,
      ...compactRank(row)
    }];
  });
}

function buildSeasonSummary(fullSnapshot, shardPayloads) {
  const shardIntegrity = passportShardIntegrity(shardPayloads);
  const rankings = Object.fromEntries(Object.entries(fullSnapshot.rankings).map(([category, rows]) => [category, rows.slice(0, 10)]));
  const cutoffs = Object.fromEntries(Object.entries(fullSnapshot.rankings).map(([category, rows]) => [category, {
    leader: compactRank(rows[0]),
    nearestChallenger: compactRank(rows[1]),
    topTen: compactRank(rows[9]),
    topHundred: compactRank(rows[99]),
    eligibleCount: fullSnapshot.laneStatus?.[category]?.eligibleCount || 0,
    publishedDeepCount: fullSnapshot.laneStatus?.[category]?.publishedCount || 0
  }]));
  const laneCatalog = Object.entries(fullSnapshot.rules.definition?.lanes || {}).map(([category, lane], order) => ({
    category,
    title: lane.title,
    order
  }));
  return {
    schema: SEASON_SCHEMA,
    generatedAt: fullSnapshot.generatedAt,
    observedAt: fullSnapshot.observedAt,
    staleAfterHours: fullSnapshot.staleAfterHours,
    season: fullSnapshot.season,
    rules: {
      version: fullSnapshot.rules.version,
      evaluatorVersion: fullSnapshot.rules.evaluatorVersion,
      evaluatorImplementationHash: fullSnapshot.rules.evaluatorImplementationHash,
      frozenAt: fullSnapshot.rules.frozenAt,
      rulesHash: fullSnapshot.rules.rulesHash,
      taxonomyHash: fullSnapshot.rules.taxonomyHash,
      contractCoverageHash: fullSnapshot.rules.contractCoverageHash,
      semanticContractCoverageHash: fullSnapshot.rules.semanticContractCoverageHash,
      semanticContractCoverageHashes: fullSnapshot.rules.semanticContractCoverageHashes,
      laneRuleHashes: fullSnapshot.rules.laneRuleHashes,
      rulesPath: seasonPaths(fullSnapshot.season.id).rulesUrl
    },
    rankingLimit: 10,
    deepRankingLimit: fullSnapshot.deepRankingLimit,
    sources: fullSnapshot.sources,
    sourceReceipts: fullSnapshot.sourceReceipts,
    coverage: fullSnapshot.coverage,
    truncation: fullSnapshot.truncation,
    laneStatus: fullSnapshot.laneStatus,
    laneCatalog,
    leaders: fullSnapshot.leaders,
    rankings,
    cutoffs,
    honors: fullSnapshot.honors,
    history: fullSnapshot.history,
    passports: {
      indexedAddresses: fullSnapshot.passportIndex.indexedAddresses,
      shardCount: PASSPORT_SHARD_COUNT,
      nonemptyShards: [...shardPayloads.keys()],
      shardAlgorithm: PASSPORT_SHARD_ALGORITHM,
      ...shardIntegrity,
      pathTemplate: seasonPaths(fullSnapshot.season.id).passportUrlTemplate
    },
    offchainBadges: fullSnapshot.offchainBadges
  };
}

function validateSeasonSummary(summary) {
  const errors = [];
  if (Number(summary?.schema) !== SEASON_SCHEMA) errors.push(`season summary schema must be ${SEASON_SCHEMA}`);
  if (!summary?.season?.id || !summary?.season?.protocolHash) errors.push('season summary identity is missing');
  if (!Number.isFinite(Date.parse(summary?.generatedAt || ''))) errors.push('season summary generatedAt is invalid');
  if (!Number.isFinite(Date.parse(summary?.observedAt || ''))) errors.push('season summary observedAt is invalid');
  if (Number(summary?.rankingLimit) !== 10) errors.push('season summary rankingLimit must be 10');
  if (!summary?.passports?.shardAlgorithm || !Array.isArray(summary?.passports?.nonemptyShards)) errors.push('season summary passport sharding is missing');
  if (!summary?.passports?.contentRoot || !summary?.passports?.shardHashes || summary?.passports?.algorithm !== 'sha256-compact-json-v1') errors.push('season summary Passport shard integrity is missing');
  if (
    !summary?.rules?.version
    || !summary?.rules?.evaluatorVersion
    || !summary?.rules?.evaluatorImplementationHash
    || !summary?.rules?.rulesHash
    || !summary?.rules?.taxonomyHash
    || !summary?.rules?.contractCoverageHash
    || !summary?.rules?.semanticContractCoverageHash
    || !summary?.rules?.semanticContractCoverageHashes
    || !summary?.rules?.laneRuleHashes
  ) errors.push('season summary frozen-rule cross-links are incomplete');
  for (const source of ['objktListingSales', 'objktMints']) {
    const receipt = summary?.sourceReceipts?.[source];
    if (
      receipt?.pagination?.mode !== 'id-keyset-ascending'
      || receipt?.pagination?.strictlyIncreasingUniqueIds !== true
    ) errors.push(`${source} must carry a verified ascending keyset receipt`);
    if (Number(receipt?.rows) > 0) {
      try {
        if (BigInt(receipt.pagination.firstId) > BigInt(receipt.pagination.lastId)) errors.push(`${source} keyset receipt has inverted id bounds`);
      } catch {
        errors.push(`${source} keyset receipt has invalid id bounds`);
      }
    }
  }
  const transactionReceipt = summary?.sourceReceipts?.transaction;
  if (
    transactionReceipt?.mode !== 'exact-incremental-id-keyset-with-tail-reconciliation-v1'
    || transactionReceipt?.complete !== true
    || !transactionReceipt?.statePath
    || !transactionReceipt?.stateHash
    || !/^[0-9]+$/.test(String(transactionReceipt?.cursorLastId || ''))
    || Number(transactionReceipt?.expectedRawCount) !== Number(transactionReceipt?.scannedRows)
    || Number(transactionReceipt?.eligibleTopLevelImplicitRows) < 0
    || Number(transactionReceipt?.eligibleAddresses) < 0
  ) errors.push('season summary Transaction accumulator receipt is incomplete');
  if (!Array.isArray(summary?.laneCatalog) || !summary.laneCatalog.length) errors.push('season summary frozen lane catalog is missing');
  errors.push(...artifactBudgetErrors(summary?.artifactBudget));
  const categories = (summary?.laneCatalog || []).map((lane) => lane.category);
  if (new Set(categories).size !== categories.length) errors.push('season summary frozen lane catalog repeats a category');
  for (const [order, lane] of (summary?.laneCatalog || []).entries()) {
    if (!lane?.category || !lane?.title || Number(lane?.order) !== order) errors.push('season summary frozen lane catalog order/title is invalid');
  }
  for (const category of categories) {
    if (!Array.isArray(summary?.rankings?.[category])) errors.push(`${category} summary ranking is missing`);
    if ((summary?.rankings?.[category]?.length || 0) > 10) errors.push(`${category} summary publishes more than 10 ranks`);
    if (!summary?.cutoffs?.[category]) errors.push(`${category} cutoffs are missing`);
  }
  const expectedChampions = finalizedChampions(summary);
  if (summary?.season?.status === 'finalized') {
    if (JSON.stringify(summary?.champions) !== JSON.stringify(expectedChampions)) {
      errors.push('finalized season champions must exactly match ready summary rank-one lanes');
    }
  } else if (Object.hasOwn(summary || {}, 'champions')) {
    errors.push('non-final season summary cannot publish champions');
  }
  try {
    errors.push(...getMaxisEvaluator(summary?.rules?.evaluatorVersion).truncationCoverageErrors(summary));
  } catch (error) {
    errors.push(error.message);
  }
  return errors;
}

function buildManifest(existing, season, rules, summary, shardPayloads, {
  previousEntry = null,
  settlingSummary = null,
  finalizedTransition = null
} = {}) {
  const entries = (existing?.seasons || []).map((entry) => ({ ...entry }));
  if (previousEntry && previousEntry.id !== season.id) {
    const index = entries.findIndex((entry) => entry.id === previousEntry.id);
    if (index >= 0) {
      entries[index] = finalizedTransition ? {
        ...entries[index],
        status: 'finalized',
        endsAt: season.activatedAt,
        endsWhen: null,
        finalizedAt: finalizedTransition.summary.season.finalizedAt,
        archiveUrl: entries[index].summaryPath,
        lastSnapshotAt: finalizedTransition.summary.generatedAt,
        availableShards: [...finalizedTransition.shardPayloads.keys()],
        transactionStatePath: finalizedTransition.summary.sourceReceipts?.transaction?.statePath || entries[index].transactionStatePath,
        transactionStateHash: finalizedTransition.summary.sourceReceipts?.transaction?.stateHash || null
      } : {
        ...entries[index],
        status: 'settling',
        endsAt: season.activatedAt,
        endsWhen: null,
        archiveUrl: null,
        lastSnapshotAt: settlingSummary?.generatedAt || entries[index].lastSnapshotAt
      };
    }
  }
  const next = manifestEntry(season, rules, summary.generatedAt, [...shardPayloads.keys()]);
  next.transactionStatePath = summary.sourceReceipts?.transaction?.statePath || null;
  next.transactionStateHash = summary.sourceReceipts?.transaction?.stateHash || null;
  const currentIndex = entries.findIndex((entry) => entry.id === season.id);
  if (currentIndex >= 0) entries[currentIndex] = next;
  else entries.push(next);
  entries.sort((left, right) => Number(left.activationLevel) - Number(right.activationLevel));
  const manifest = {
    schema: SEASON_CATALOG_SCHEMA,
    generatedAt: summary.generatedAt,
    activeSeasonId: season.id,
    current: {
      seasonId: season.id,
      displayLabel: season.displayLabel,
      summaryPath: next.summaryPath,
      rulesPath: next.rulesPath,
      passportPathTemplate: next.passportPathTemplate
    },
    passportSharding: {
      algorithm: PASSPORT_SHARD_ALGORITHM,
      shardCount: PASSPORT_SHARD_COUNT,
      input: 'trimmed case-preserving Tezos address',
      output: 'two-digit lowercase hex in 00..3f'
    },
    seasons: entries
  };
  const settlingEntry = entries.find((entry) => entry.status === 'settling');
  if (settlingEntry) {
    manifest.rollover = {
      status: 'active-with-settling',
      settlingSeasonId: settlingEntry.id,
      activeSeasonId: season.id,
      protocolEndedAt: season.activatedAt,
      eligibleAt: settlementEligibleAt(season),
      minimumDelayHours: FINALIZATION_SETTLEMENT_HOURS,
      evaluatorConstraint: {
        rulesVersion: settlingEntry.rulesVersion,
        evaluatorVersion: settlingEntry.evaluatorVersion,
        implementationHash: settlingEntry.evaluatorImplementationHash,
        rulesHash: settlingEntry.rulesHash,
        policy: 'The generator implementation and scoring definition cannot change while a prior season is settling. A future scoring upgrade requires versioned evaluator modules.'
      }
    };
  }
  return manifest;
}

function buildFinalizedConcurrentManifest(existing, previousEntry, finalizedTransition) {
  const finalizedAt = finalizedTransition.summary.season.finalizedAt;
  if (!Number.isFinite(Date.parse(finalizedAt || ''))) throw new Error('Finalized transition summary is missing its immutable finalizedAt timestamp');
  const entries = (existing?.seasons || []).map((entry) => entry.id === previousEntry.id ? {
    ...entry,
    status: 'finalized',
    endsAt: finalizedTransition.summary.season.endsAt,
    endsWhen: null,
    finalizedAt,
    archiveUrl: entry.summaryPath,
    lastSnapshotAt: finalizedTransition.summary.generatedAt,
    availableShards: [...finalizedTransition.shardPayloads.keys()],
    transactionStatePath: finalizedTransition.summary.sourceReceipts?.transaction?.statePath || entry.transactionStatePath,
    transactionStateHash: finalizedTransition.summary.sourceReceipts?.transaction?.stateHash || null
  } : { ...entry });
  return {
    schema: SEASON_CATALOG_SCHEMA,
    generatedAt: finalizedAt,
    activeSeasonId: existing.activeSeasonId,
    current: existing.current,
    passportSharding: existing.passportSharding,
    seasons: entries
  };
}

function settlementEligibleAt(nextSeason) {
  return new Date(Date.parse(nextSeason.activatedAt) + FINALIZATION_SETTLEMENT_MS).toISOString();
}

function buildSettlementSummary(summary, nextSeason, observedAt) {
  return {
    ...summary,
    season: {
      ...summary.season,
      status: 'settling',
      endsAt: nextSeason.activatedAt,
      endsWhen: null
    },
    settlement: {
      status: 'awaiting-source-settlement',
      protocolEndedAt: nextSeason.activatedAt,
      nextProtocolFirstLevel: nextSeason.activationLevel,
      observedAt,
      eligibleAt: settlementEligibleAt(nextSeason),
      minimumDelayHours: FINALIZATION_SETTLEMENT_HOURS,
      reason: 'TzKT and OBJKT indexes receive a conservative post-activation settlement window before permanent champions and Passport shards are rebuilt.'
    }
  };
}

async function resealPersistedSummaryBudget(summary, entry) {
  const paths = seasonPaths(entry.id);
  const [rules, transactionState] = await Promise.all([
    readJson(paths.rulesFile),
    readJson(paths.transactionStateFile)
  ]);
  const shardPayloads = new Map();
  await readPassportShards(paths, summary.passports?.nonemptyShards || entry.availableShards, {
    expectedHashes: summary.passports?.shardHashes,
    expectedSeasonId: entry.id,
    payloadCollector: shardPayloads
  });
  const sealed = sealSeasonArtifactBudget({ rules, summary, transactionState, shardPayloads });
  assertSeasonArtifactBudget({ rules, summary: sealed, transactionState, shardPayloads });
  return sealed;
}

function finalizeSeasonSummaryPayload(summary, nextSeason, finalizedAt) {
  const finalized = {
    ...summary,
    season: {
      ...summary.season,
      status: 'finalized',
      endsAt: nextSeason.activatedAt,
      endsWhen: null,
      finalizedAt
    },
    finalization: {
      mode: 'exact-boundary-rebuild',
      dataThroughExclusive: nextSeason.activatedAt,
      lastIncludedLevel: nextSeason.activationLevel - 1,
      protocolEndedAt: nextSeason.activatedAt,
      exactThroughActivation: true,
      rebuiltAt: finalizedAt,
      immutableAfter: finalizedAt,
      settlement: {
        minimumDelayHours: FINALIZATION_SETTLEMENT_HOURS,
        elapsedHours: Number(((Date.parse(finalizedAt) - Date.parse(nextSeason.activatedAt)) / 3600000).toFixed(2)),
        objktObservedAt: finalizedAt,
        objktSalesCompleteWithinDeclaredBound: summary.sourceReceipts?.objktListingSales?.complete === true,
        objktMintsCompleteWithinDeclaredBound: summary.sourceReceipts?.objktMints?.complete === true,
        tzktSourcesCompleteWithinDeclaredBounds: Object.entries(summary.sourceReceipts || {})
          .filter(([key]) => !['activation', 'objktListingSales', 'objktMints', 'transaction'].includes(key))
          .every(([, receipt]) => receipt?.complete !== false),
        truthClaim: 'Final within declared TzKT/OBJKT indexes, frozen coverage, pagination bounds, and the post-activation settlement window; not a claim about off-index activity.'
      }
    },
    champions: finalizedChampions(summary)
  };
  finalized.integrity = { algorithm: 'sha256', contentHash: contentHash(finalized) };
  return finalized;
}

async function buildExactTransitionFinalization({
  previousEntry,
  nextSeason,
  previousSnapshot,
  previousSeasonSnapshot,
  finalizedAt
}) {
  if (!previousEntry || previousEntry.id === nextSeason.id) return null;
  if (Date.parse(finalizedAt) < Date.parse(settlementEligibleAt(nextSeason))) {
    throw new Error(`Cannot finalize ${previousEntry.id} before source-settlement guard ${settlementEligibleAt(nextSeason)}`);
  }
  const paths = seasonPaths(previousEntry.id);
  const existingSummary = await readJson(paths.summaryFile);
  if (existingSummary.season?.status === 'finalized') {
    if (
      existingSummary.finalization?.protocolEndedAt !== nextSeason.activatedAt
      || Number(existingSummary.finalization?.lastIncludedLevel) !== nextSeason.activationLevel - 1
    ) {
      throw new Error(`${previousEntry.id} is already finalized against a different protocol boundary`);
    }
    const fullSnapshot = await reconstructSeasonSnapshot({
      ...previousEntry,
      availableShards: existingSummary.passports?.nonemptyShards || []
    });
    return {
      fullSnapshot,
      shardPayloads: new Map((existingSummary.passports?.nonemptyShards || []).map((shard) => [shard, null])),
      summary: existingSummary,
      paths,
      alreadyFinalized: true
    };
  }
  const rules = await readJson(paths.rulesFile);
  const implementationHash = await evaluatorImplementationHash(rules.evaluatorVersion);
  if (
    rules.evaluatorImplementationHash !== implementationHash
    || rules.rulesHash !== contentHash(ruleDefinitionFor(rules.evaluatorVersion, implementationHash))
  ) {
    throw new Error(`Cannot finalize ${previousEntry.id} with evaluator semantics different from its frozen active rules`);
  }
  const endingSeason = {
    ...previousSnapshot.season,
    status: 'finalizing',
    endsAt: nextSeason.activatedAt,
    endsWhen: null
  };
  const buildOptions = {
    season: endingSeason,
    rules,
    generatedAt: nextSeason.activatedAt,
    observedAt: finalizedAt,
    endLevelExclusive: nextSeason.activationLevel,
    previousSnapshot,
    previousSeasonSnapshot
  };
  const fullSnapshot = await buildFullSeasonSnapshot(buildOptions);
  const snapshotErrors = getMaxisEvaluator(rules.evaluatorVersion).validateSeasonSnapshot(fullSnapshot);
  if (snapshotErrors.length) throw new Error(`Invalid exact final ${previousEntry.id} snapshot: ${snapshotErrors.join('; ')}`);
  const prepared = prepareSeasonArtifacts({
    fullSnapshot,
    season: endingSeason,
    rules,
    buildOptions,
    summaryTransform: (openSummary) => finalizeSeasonSummaryPayload(openSummary, nextSeason, finalizedAt)
  });
  const { fullSnapshot: publishSnapshot, shardPayloads, summary } = prepared;
  const summaryErrors = validateSeasonSummary(summary);
  if (summaryErrors.length) throw new Error(`Invalid exact final ${previousEntry.id} summary: ${summaryErrors.join('; ')}`);
  return { fullSnapshot: publishSnapshot, shardPayloads, summary, paths, alreadyFinalized: false };
}

async function assertSettlingEvaluatorCompatible(entry) {
  if (!entry) return;
  const rules = await readJson(seasonPaths(entry.id).rulesFile);
  const implementationHash = await evaluatorImplementationHash(rules.evaluatorVersion);
  const definitionHash = contentHash(ruleDefinitionFor(rules.evaluatorVersion, implementationHash));
  if (
    rules.evaluatorImplementationHash !== implementationHash
    || rules.rulesHash !== definitionHash
  ) {
    throw new Error(
      `Cannot open or update the active board while ${entry.id} is settling under another evaluator. `
      + 'Keep the frozen generator unchanged until exact finalization, or ship explicit versioned evaluator modules.'
    );
  }
}

async function validateCommittedSeasonArtifacts() {
  const [manifest, governanceReport] = await Promise.all([
    readJson(SEASON_MANIFEST_FILE),
    readJson(GOVERNANCE_REPORT_FILE)
  ]);
  const manifestErrors = validateSeasonCatalog(manifest);
  if (manifestErrors.length) throw new Error(`Invalid Maxis season manifest: ${manifestErrors.join('; ')}`);
  const activeEntry = manifest.seasons.find((entry) => entry.id === manifest.activeSeasonId);
  const settlingEntry = manifest.seasons.find((entry) => entry.status === 'settling');
  if (settlingEntry && (
    manifest.rollover?.evaluatorConstraint?.rulesVersion !== settlingEntry.rulesVersion
    || manifest.rollover?.evaluatorConstraint?.evaluatorVersion !== settlingEntry.evaluatorVersion
    || manifest.rollover?.evaluatorConstraint?.implementationHash !== settlingEntry.evaluatorImplementationHash
    || manifest.rollover?.evaluatorConstraint?.rulesHash !== settlingEntry.rulesHash
  )) {
    throw new Error('Maxis rollover evaluator constraint does not match the prior settling season');
  }
  const currentProtocol = governanceReport?.currentProtocol;
  const protocolPointer = activeEntry ? {
    hash: activeEntry.protocolHash,
    firstLevel: activeEntry.activationLevel,
    number: activeEntry.protocolNumber,
    name: activeEntry.protocolName
  } : manifest.rollover?.nextProtocol ? {
    hash: manifest.rollover.nextProtocol.hash,
    firstLevel: manifest.rollover.nextProtocol.firstLevel,
    number: manifest.rollover.nextProtocol.number,
    name: manifest.rollover.nextProtocol.name
  } : null;
  if (
    protocolPointer?.hash !== currentProtocol?.hash
    || Number(protocolPointer?.firstLevel) !== Number(currentProtocol?.firstLevel)
    || Number(protocolPointer?.number) !== Number(currentProtocol?.code)
    || protocolPointer?.name !== currentProtocol?.name
  ) {
    throw new Error('Maxis active season does not match governance-refresh-report.currentProtocol hash, first level, number, and name');
  }
  for (const entry of manifest.seasons) {
    const nextEntry = [...manifest.seasons]
      .filter((candidate) => Number(candidate.activationLevel) > Number(entry.activationLevel))
      .sort((left, right) => Number(left.activationLevel) - Number(right.activationLevel))[0] || null;
    const paths = seasonPaths(entry.id);
    const summary = await readJson(paths.summaryFile);
    const rules = await readJson(paths.rulesFile);
    const transactionState = await readJson(paths.transactionStateFile);
    const transactionBuildingState = await readJsonIfExists(paths.transactionBuildingStateFile);
    const summaryErrors = validateSeasonSummary(summary);
    if (summaryErrors.length) throw new Error(`Invalid ${entry.id} summary: ${summaryErrors.join('; ')}`);
    if (
      entry.summaryPath !== paths.summaryUrl
      || entry.rulesPath !== paths.rulesUrl
      || entry.passportPathTemplate !== paths.passportUrlTemplate
      || summary.rules?.rulesPath !== paths.rulesUrl
      || summary.passports?.pathTemplate !== paths.passportUrlTemplate
    ) {
      throw new Error(`${entry.id} artifact paths do not match its canonical season directory`);
    }
    const identityMatches = (
      summary.season?.id === entry.id
      && rules.seasonId === entry.id
      && summary.season?.protocolHash === entry.protocolHash
      && rules.protocolHash === entry.protocolHash
      && Number(summary.season?.protocolNumber) === Number(entry.protocolNumber)
      && Number(rules.protocolNumber) === Number(entry.protocolNumber)
      && summary.season?.protocolName === entry.protocolName
      && rules.protocolName === entry.protocolName
      && Number(summary.season?.activationLevel) === Number(entry.activationLevel)
      && Number(rules.activationLevel) === Number(entry.activationLevel)
      && summary.season?.activatedAt === entry.activatedAt
      && rules.activatedAt === entry.activatedAt
      && summary.season?.displayLabel === entry.displayLabel
      && Number(summary.season?.seasonOrdinal) === Number(entry.seasonOrdinal)
      && (summary.season?.endsAt || null) === (entry.endsAt || null)
      && (summary.season?.endsWhen || null) === (entry.endsWhen || null)
      && (summary.season?.finalizedAt || null) === (entry.finalizedAt || null)
    );
    if (!identityMatches) throw new Error(`${entry.id} manifest, summary, and rules season identities disagree`);
    const transactionErrors = transactionAccumulatorErrors(transactionState);
    if (transactionErrors.length) throw new Error(`${entry.id} Transaction state is invalid: ${transactionErrors.join('; ')}`);
    if (transactionBuildingState) {
      const buildingErrors = transactionAccumulatorErrors(transactionBuildingState, { allowBuilding: true });
      if (buildingErrors.length) throw new Error(`${entry.id} Transaction building state is invalid: ${buildingErrors.join('; ')}`);
      if (
        transactionBuildingState.status !== 'building'
        || transactionBuildingState.season?.id !== entry.id
        || transactionBuildingState.rules?.evaluatorVersion !== entry.evaluatorVersion
        || transactionBuildingState.rules?.rulesHash !== entry.rulesHash
      ) throw new Error(`${entry.id} Transaction building state identity is invalid`);
      if (prettyJsonBytes(transactionBuildingState) > MAX_TRANSACTION_STATE_BYTES) {
        throw new Error(`${entry.id} Transaction building state exceeds the frozen state budget`);
      }
      if (entry.status === 'finalized') throw new Error(`${entry.id} finalized season retains a Transaction building sidecar`);
    }
    if (
      transactionState.season?.id !== entry.id
      || transactionState.rules?.evaluatorVersion !== entry.evaluatorVersion
      || transactionState.rules?.rulesHash !== entry.rulesHash
      || entry.transactionStatePath !== paths.transactionStateUrl
      || summary.sourceReceipts?.transaction?.statePath !== paths.transactionStateUrl
      || transactionState.integrity?.contentHash !== entry.transactionStateHash
      || transactionState.integrity?.contentHash !== summary.sourceReceipts?.transaction?.stateHash
      || Number(transactionState.counts?.scannedRows) !== Number(summary.sourceReceipts?.transaction?.scannedRows)
      || Number(transactionState.counts?.eligibleRows) !== Number(summary.sourceReceipts?.transaction?.eligibleTopLevelImplicitRows)
      || Number(transactionState.counts?.addresses) !== Number(summary.sourceReceipts?.transaction?.eligibleAddresses)
    ) throw new Error(`${entry.id} Transaction state cross-links do not match manifest, rules, and summary`);
    if (summary.generatedAt !== entry.lastSnapshotAt) throw new Error(`${entry.id} summary boundary does not match manifest lastSnapshotAt`);
    const linkedHashesMatch = (
      rules.version === entry.rulesVersion
      && rules.evaluatorVersion === entry.evaluatorVersion
      && rules.evaluatorImplementationHash === entry.evaluatorImplementationHash
      && rules.rulesHash === entry.rulesHash
      && rules.taxonomyHash === entry.taxonomyHash
      && rules.contractCoverageHash === entry.contractCoverageHash
      && rules.semanticContractCoverageHash === entry.semanticContractCoverageHash
      && JSON.stringify(rules.semanticContractCoverageHashes) === JSON.stringify(entry.semanticContractCoverageHashes)
      && JSON.stringify(rules.laneRuleHashes) === JSON.stringify(entry.laneRuleHashes)
      && summary.rules?.version === rules.version
      && summary.rules?.evaluatorVersion === rules.evaluatorVersion
      && summary.rules?.evaluatorImplementationHash === rules.evaluatorImplementationHash
      && summary.rules?.rulesHash === rules.rulesHash
      && summary.rules?.taxonomyHash === rules.taxonomyHash
      && summary.rules?.contractCoverageHash === rules.contractCoverageHash
      && summary.rules?.semanticContractCoverageHash === rules.semanticContractCoverageHash
      && JSON.stringify(summary.rules?.semanticContractCoverageHashes) === JSON.stringify(rules.semanticContractCoverageHashes)
      && JSON.stringify(summary.rules?.laneRuleHashes) === JSON.stringify(rules.laneRuleHashes)
    );
    if (!linkedHashesMatch) {
      throw new Error(`${entry.id} frozen rules do not match the manifest`);
    }
    if (contentHash(rules.definition) !== rules.rulesHash || contentHash(rules.taxonomySnapshot) !== rules.taxonomyHash) {
      throw new Error(`${entry.id} frozen rules or taxonomy content hash is invalid`);
    }
    const entryImplementationHash = await evaluatorImplementationHash(rules.evaluatorVersion);
    if (rules.evaluatorImplementationHash !== entryImplementationHash) throw new Error(`${entry.id} immutable evaluator source hash is unavailable or changed`);
    if (['active', 'settling'].includes(entry.status) && (
      rules.rulesHash !== contentHash(ruleDefinitionFor(rules.evaluatorVersion, entryImplementationHash))
    )) {
      throw new Error(`${entry.id} active frozen evaluator is incompatible with the current generator`);
    }
    if (!Array.isArray(rules.contractCoverageSnapshot) || contentHash(rules.contractCoverageSnapshot) !== rules.contractCoverageHash) {
      throw new Error(`${entry.id} frozen resolved-contract coverage is invalid`);
    }
    if (
      !Array.isArray(rules.semanticContractCoverageSnapshot)
      || contentHash(rules.semanticContractCoverageSnapshot) !== rules.semanticContractCoverageHash
      || JSON.stringify(semanticContractCoverageHashes(rules.semanticContractCoverageSnapshot)) !== JSON.stringify(rules.semanticContractCoverageHashes)
    ) {
      throw new Error(`${entry.id} frozen semantic resolved-contract coverage is invalid`);
    }
    if (
      !rules.laneEvaluatorSemantics
      || JSON.stringify(laneRuleHashesFor(rules.evaluatorVersion, rules.definition?.lanes || {}, rules.laneEvaluatorSemantics)) !== JSON.stringify(rules.laneRuleHashes)
    ) {
      throw new Error(`${entry.id} frozen lane compatibility hashes are invalid`);
    }
    if (summary.season?.status !== entry.status) throw new Error(`${entry.id} summary and manifest status disagree`);
    if (entry.status === 'finalized') {
      const { integrity, ...unsigned } = summary;
      if (!integrity?.contentHash || contentHash(unsigned) !== integrity.contentHash) {
        throw new Error(`${entry.id} finalized summary integrity is invalid`);
      }
      if (
        summary.finalization?.mode !== 'exact-boundary-rebuild'
        || summary.finalization?.exactThroughActivation !== true
        || summary.generatedAt !== summary.season?.endsAt
        || Number(summary.finalization?.settlement?.elapsedHours) < FINALIZATION_SETTLEMENT_HOURS
      ) {
        throw new Error(`${entry.id} finalized summary lacks an exact settled protocol boundary`);
      }
      if (
        !nextEntry
        || summary.season?.endsAt !== nextEntry.activatedAt
        || Number(summary.finalization?.lastIncludedLevel) !== Number(nextEntry.activationLevel) - 1
      ) throw new Error(`${entry.id} finalized boundary does not match its immediate catalog successor`);
      if (
        transactionState.boundary?.mode !== 'exact-close'
        || Number(transactionState.boundary?.levelExclusive) !== Number(summary.finalization?.lastIncludedLevel) + 1
      ) throw new Error(`${entry.id} finalized Transaction state does not end at the exact protocol boundary`);
    }
    if (entry.status === 'settling' && (
      summary.settlement?.status !== 'awaiting-source-settlement'
      || Number(summary.settlement?.minimumDelayHours) !== FINALIZATION_SETTLEMENT_HOURS
      || !Number.isFinite(Date.parse(summary.settlement?.eligibleAt || ''))
    )) {
      throw new Error(`${entry.id} settling summary lacks its source-settlement guard`);
    }
    if (JSON.stringify(summary.passports?.nonemptyShards || []) !== JSON.stringify(entry.availableShards || [])) {
      throw new Error(`${entry.id} summary and manifest shard lists disagree`);
    }
    const expectedRoot = textHash(Object.entries(summary.passports.shardHashes || {})
      .sort(([left], [right]) => compareCodePoint(left, right))
      .map(([shard, hash]) => `${shard}:${hash}`)
      .join('\n'));
    if (expectedRoot !== summary.passports.contentRoot) throw new Error(`${entry.id} Passport shard content root is invalid`);
    if (JSON.stringify(Object.keys(summary.passports.shardHashes || {}).sort()) !== JSON.stringify([...(entry.availableShards || [])].sort())) {
      throw new Error(`${entry.id} Passport shard hash map does not match the manifest shard list`);
    }
    const committedShardPayloads = new Map();
    const passports = await readPassportShards(paths, entry.availableShards, {
      expectedHashes: summary.passports.shardHashes,
      expectedSeasonId: entry.id,
      payloadCollector: committedShardPayloads
    });
    assertSeasonArtifactBudget({ rules, summary, transactionState, shardPayloads: committedShardPayloads });
    if (Object.keys(passports).length !== Number(summary.passports?.indexedAddresses || 0)) {
      throw new Error(`${entry.id} passport shard count does not match its summary`);
    }
    const evaluator = getMaxisEvaluator(summary.rules?.evaluatorVersion);
    const expandedPassports = Object.values(passports).map((passport) => evaluator.expandPassportRecord(passport));
    for (const category of (summary.laneCatalog || []).map((lane) => lane.category)) {
      const reconstructed = [];
      for (const passport of expandedPassports) {
        const rank = category === 'unicorn' ? passport?.unicorn?.rank : passport?.lanes?.[category]?.rank;
        if (rank) reconstructed.push({ address: passport.address, rank: Number(rank) });
      }
      reconstructed.sort((left, right) => left.rank - right.rank || compareCodePoint(left.address, right.address));
      const expectedTop = (summary.rankings?.[category] || []).map((row) => ({ address: row.address, rank: row.rank }));
      if (JSON.stringify(reconstructed.slice(0, 10)) !== JSON.stringify(expectedTop)) {
        throw new Error(`${entry.id} ${category} Passport ranks do not reconstruct the summary top 10`);
      }
    }
  }
}

async function resolveExactProtocolSeason(protocolData, governanceReport, manifest, now) {
  let season = resolveProtocolSeason(protocolData, governanceReport, now);
  const [tzktProtocol, block] = await Promise.all([
    tzkt(`/protocols/${season.protocolNumber}`),
    tzkt(`/blocks/${season.activationLevel}`)
  ]);
  if (
    Number(tzktProtocol?.code) !== season.protocolNumber
    || tzktProtocol?.hash !== season.protocolHash
    || Number(tzktProtocol?.firstLevel) !== season.activationLevel
  ) {
    throw new Error(`TzKT protocol receipt disagrees with governance currentProtocol for ${season.protocolName}`);
  }
  if (Number(block?.level) !== season.activationLevel || Number(block?.proto) !== season.protocolNumber) {
    throw new Error(`TzKT activation receipt does not match ${season.protocolName} at level ${season.activationLevel}`);
  }
  const blockTime = new Date(block.timestamp).toISOString();
  const reportedProtocolTime = season.activationReceipt?.governanceRefresh?.startTime;
  if (reportedProtocolTime && blockTime !== new Date(reportedProtocolTime).toISOString()) {
    throw new Error(`Protocol metadata and TzKT disagree on ${season.protocolName} activation: ${reportedProtocolTime} vs ${blockTime}`);
  }
  season = {
    ...season,
    activatedAt: blockTime,
    activationDateSource: `TzKT block ${season.activationLevel} timestamp (level and protocol identity from data/governance-refresh-report.json currentProtocol)`,
    activationReceipt: {
      ...season.activationReceipt,
      tzktProtocol: {
        code: Number(tzktProtocol.code),
        hash: tzktProtocol.hash,
        firstLevel: Number(tzktProtocol.firstLevel),
        lastLevel: tzktProtocol.lastLevel == null ? null : Number(tzktProtocol.lastLevel),
        sourceUrl: `https://api.tzkt.io/v1/protocols/${season.protocolNumber}`
      },
      tzktBlock: {
        level: Number(block.level),
        proto: Number(block.proto),
        timestamp: blockTime,
        hash: block.hash || null,
        sourceUrl: `https://tzkt.io/${season.activationLevel}`
      }
    }
  };
  return assignSeasonIdentity(season, manifest);
}

const SEASON_SOURCE_IO = Object.freeze({
  fetchObjktListingSales,
  fetchObjktMints,
  fetchAppTransactions,
  fetchPagedTzkt,
  updateTransactionAccumulator,
  fetchClosingDelegationAccounts,
  fetchCurrentAccounts,
  fetchTargetTransactions
});

async function buildFullSeasonSnapshot(options) {
  const source = getMaxisSource(options?.rules?.evaluatorVersion);
  return source.buildFullSeasonSnapshot(options, SEASON_SOURCE_IO);
}

async function main() {
  const checkOnly = process.argv.includes('--check');
  const finalizeTransitionOnly = process.argv.includes('--finalize-transition-only');
  const config = await readJson(CONFIG_FILE);
  const configErrors = validateMaxisConfig(config);
  if (configErrors.length) throw new Error(`Invalid maxis taxonomy: ${configErrors.join('; ')}`);
  if (checkOnly) {
    const snapshotErrors = validateSnapshot(await readJson(OUTPUT_FILE));
    if (snapshotErrors.length) throw new Error(`Invalid maxis snapshot: ${snapshotErrors.join('; ')}`);
    await validateCommittedSeasonArtifacts();
    console.log('Maxis taxonomy, Crown Hall, season manifest, summaries, and Passport shards are valid');
    return;
  }

  const now = new Date();
  const generatedAt = now.toISOString();
  const [protocolData, governanceReport, existingManifest] = await Promise.all([
    readJson(PROTOCOL_FILE),
    readJson(GOVERNANCE_REPORT_FILE),
    readJsonIfExists(SEASON_MANIFEST_FILE)
  ]);
  const season = await resolveExactProtocolSeason(protocolData, governanceReport, existingManifest, now);
  const manifestEntries = existingManifest?.seasons || [];
  const activeEntry = manifestEntries.find((entry) => entry.id === existingManifest?.activeSeasonId) || null;
  const settlingEntry = manifestEntries.find((entry) => entry.status === 'settling') || null;
  const currentEntry = manifestEntries.find((entry) => entry.id === season.id) || null;
  if (currentEntry?.status === 'finalized') {
    throw new Error(`Manifest marks current protocol season ${season.id} finalized; refusing to rewrite immutable artifacts`);
  }
  if (settlingEntry && activeEntry?.id !== season.id) {
    throw new Error(`Manifest settling state must keep current protocol ${season.id} active while ${settlingEntry.id} closes`);
  }
  const transitionEntry = settlingEntry || (activeEntry && activeEntry.id !== season.id ? activeEntry : null);
  const transitionErrors = validateImmediateProtocolSuccessor(transitionEntry, season, protocolData);
  if (transitionErrors.length) throw new Error(`Maxis protocol-season continuity failed closed: ${transitionErrors.join('; ')}`);
  const currentPreviousSnapshot = currentEntry?.status === 'active' ? await reconstructSeasonSnapshot(currentEntry) : null;
  const transitionSummary = transitionEntry ? await readJson(seasonPaths(transitionEntry.id).summaryFile) : null;
  const transitionSnapshot = transitionEntry ? await reconstructSeasonSnapshot(transitionEntry) : null;
  const previousBoundary = transitionEntry
    ? Number(transitionEntry.activationLevel)
    : season.activationLevel;
  const priorFinalizedEntry = [...(existingManifest?.seasons || [])]
    .filter((entry) => entry.status === 'finalized' && Number(entry.activationLevel) < previousBoundary)
    .sort((left, right) => Number(right.activationLevel) - Number(left.activationLevel))[0] || null;
  const priorFinalizedSnapshot = priorFinalizedEntry ? await reconstructSeasonSnapshot(priorFinalizedEntry) : null;
  let settlingSummary = null;
  let finalizedTransition = null;
  await assertSettlingEvaluatorCompatible(transitionEntry);
  if (finalizeTransitionOnly) {
    if (!settlingEntry || activeEntry?.id !== season.id) {
      throw new Error('--finalize-transition-only requires one active current season and one prior settling season');
    }
    finalizedTransition = await buildExactTransitionFinalization({
      previousEntry: settlingEntry,
      nextSeason: season,
      previousSnapshot: transitionSnapshot,
      previousSeasonSnapshot: priorFinalizedSnapshot,
      finalizedAt: generatedAt
    });
    const rolloverManifest = buildFinalizedConcurrentManifest(existingManifest, settlingEntry, finalizedTransition);
    const manifestErrors = validateSeasonCatalog(rolloverManifest);
    if (manifestErrors.length) throw new Error(`Invalid finalized rollover manifest: ${manifestErrors.join('; ')}`);
    if (!finalizedTransition.alreadyFinalized) {
      await writePassportShards(finalizedTransition.paths, finalizedTransition.shardPayloads);
      await writeJsonAtomic(finalizedTransition.paths.summaryFile, finalizedTransition.summary);
    }
    await writeJsonAtomic(SEASON_MANIFEST_FILE, rolloverManifest);
    console.log(`Finalized ${settlingEntry.displayLabel || settlingEntry.id}; ${season.displayLabel} remains active and will inherit finalized badges on its next refresh`);
    return;
  }
  if (transitionEntry) {
    if (Date.parse(generatedAt) >= Date.parse(settlementEligibleAt(season))) {
      finalizedTransition = await buildExactTransitionFinalization({
        previousEntry: transitionEntry,
        nextSeason: season,
        previousSnapshot: transitionSnapshot,
        previousSeasonSnapshot: priorFinalizedSnapshot,
        finalizedAt: generatedAt
      });
    } else if (transitionEntry.status === 'active') {
      settlingSummary = await resealPersistedSummaryBudget(
        buildSettlementSummary(transitionSummary, season, generatedAt),
        transitionEntry
      );
      const settlementErrors = validateSeasonSummary(settlingSummary);
      if (settlementErrors.length) throw new Error(`Invalid settlement summary: ${settlementErrors.join('; ')}`);
    }
  }
  const fromIso = new Date(now.getTime() - config.windowDays * 24 * 60 * 60 * 1000).toISOString();
  const gamingFromIso = new Date(now.getTime() - GAMING_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const catalogQueries = CONTRACT_CATALOG_KINDS.map((kind) => new URLSearchParams({
    kind,
    select: 'address,kind,alias,lastActivityTime',
    'sort.desc': 'lastActivity',
    limit: String(config.contractCatalogLimit)
  }));
  const accountsQuery = new URLSearchParams({
    type: 'user',
    'sort.desc': 'numTransactions',
    select: 'address,alias,numTransactions,lastActivityTime',
    limit: '500'
  });
  const delegatesQuery = new URLSearchParams({
    active: 'true',
    select: 'address,alias,numBallots,numProposals,stakedBalance,bakingPower,stakersCount,numDelegators,lastActivityTime',
    limit: '10000'
  });

  const [contractCatalogs, accounts, delegates, sales, mintResult] = await Promise.all([
    Promise.all(catalogQueries.map((query) => tzkt(`/contracts?${query}`))),
    tzkt(`/accounts?${accountsQuery}`),
    tzkt(`/delegates?${delegatesQuery}`),
    fetchObjktSales(config.windowDays),
    fetchObjktMints(fromIso, generatedAt)
  ]);
  const contracts = [...new Map(contractCatalogs
    .flat()
    .map((contract) => [contract.address, contract])).values()]
    .sort((left, right) => compareCodePoint(left.address, right.address));
  const rules = await resolveFrozenRules(config, season, generatedAt, contracts);
  await persistFrozenRules(rules);
  const defiCoverage = compileContractCoverage(contracts, config.apps.filter((app) => app.category === 'defi'), fromIso);
  const gamingCoverage = compileContractCoverage(contracts, config.apps.filter((app) => app.category === 'gaming'), gamingFromIso);
  const coverage = [...defiCoverage, ...gamingCoverage];
  const [defiAppResult, gamingAppResult] = await Promise.all([
    fetchAppTransactions(defiCoverage, fromIso, generatedAt),
    fetchAppTransactions(gamingCoverage, gamingFromIso, generatedAt)
  ]);
  const snapshot = buildSnapshot({
    now,
    fromIso,
    config,
    accounts,
    delegates,
    sales,
    mints: mintResult.rows,
    coverage,
    appRows: [...defiAppResult.rows, ...gamingAppResult.rows],
    truncation: {
      mints: mintResult.truncated,
      appTransactions: defiAppResult.truncated || gamingAppResult.truncated
    }
  });

  if (Object.values(snapshot.truncation).some(Boolean)) {
    throw new Error(`Maxis refresh hit a pagination cap: ${JSON.stringify(snapshot.truncation)}`);
  }
  const snapshotErrors = validateSnapshot(snapshot);
  if (snapshotErrors.length) throw new Error(`Generated invalid maxis snapshot: ${snapshotErrors.join('; ')}`);

  const previousSeasonSnapshot = finalizedTransition?.fullSnapshot
    || (!transitionEntry ? priorFinalizedSnapshot : null);
  const inheritedPassportSnapshot = finalizedTransition?.fullSnapshot
    || transitionSnapshot
    || previousSeasonSnapshot;

  // The Crown Hall sources above can take longer than the two-block
  // Transaction confirmation lag. Freeze the active season clock only when
  // its live source build begins so the fixed TzKT boundary cannot overtake a
  // stale process-start timestamp.
  const activeSeasonGeneratedAt = new Date().toISOString();
  const buildOptions = {
    season,
    rules,
    generatedAt: activeSeasonGeneratedAt,
    previousSnapshot: currentPreviousSnapshot,
    previousSeasonSnapshot,
    inheritedPassportSnapshot
  };
  const fullSeasonSnapshot = await buildFullSeasonSnapshot(buildOptions);
  const seasonErrors = getMaxisEvaluator(rules.evaluatorVersion).validateSeasonSnapshot(fullSeasonSnapshot);
  if (seasonErrors.length) throw new Error(`Generated invalid protocol-season snapshot: ${seasonErrors.join('; ')}`);
  const prepared = prepareSeasonArtifacts({ fullSnapshot: fullSeasonSnapshot, season, rules, buildOptions });
  const {
    fullSnapshot: publishSeasonSnapshot,
    shardPayloads,
    summary
  } = prepared;
  const summaryErrors = validateSeasonSummary(summary);
  if (summaryErrors.length) throw new Error(`Generated invalid protocol-season summary: ${summaryErrors.join('; ')}`);
  const nextManifest = buildManifest(existingManifest, season, rules, summary, shardPayloads, {
    previousEntry: transitionEntry,
    settlingSummary,
    finalizedTransition
  });
  const manifestErrors = validateSeasonCatalog(nextManifest);
  if (manifestErrors.length) throw new Error(`Generated invalid Maxis season manifest: ${manifestErrors.join('; ')}`);

  const paths = seasonPaths(season.id);
  await writeJsonAtomic(OUTPUT_FILE, snapshot);
  if (finalizedTransition) {
    if (!finalizedTransition.alreadyFinalized) {
      await writePassportShards(finalizedTransition.paths, finalizedTransition.shardPayloads);
      await writeJsonAtomic(finalizedTransition.paths.summaryFile, finalizedTransition.summary);
    }
  } else if (settlingSummary && transitionEntry) {
    await writeJsonAtomic(seasonPaths(transitionEntry.id).summaryFile, settlingSummary);
  }
  await writePassportShards(paths, shardPayloads);
  await writeJsonAtomic(paths.summaryFile, summary);
  await writeJsonAtomic(SEASON_MANIFEST_FILE, nextManifest);

  const rankedCount = Object.values(snapshot.rankings).reduce((sum, rows) => sum + rows.length, 0);
  console.log(`Wrote data/maxis-leaders.json with ${rankedCount} ranked accounts across ${coverage.length} recognized contracts`);
  console.log(`Wrote ${paths.summaryUrl} and ${shardPayloads.size} Passport shards for ${publishSeasonSnapshot.passportIndex.indexedAddresses} addresses`);
  console.log(`Maxis artifact budget: ${formatInteger(summary.artifactBudget.totalBytes)}/${formatInteger(MAX_ACTIVE_SEASON_ARTIFACT_BYTES)} bytes · largest shard ${summary.artifactBudget.maxShard.shard} ${formatInteger(summary.artifactBudget.maxShard.bytes)}/${formatInteger(MAX_PASSPORT_SHARD_BYTES)} bytes`);
}

export { evaluatorImplementationHash as maxisImplementationHash };

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    if (error?.code === 'MAXIS_TRANSACTION_DEFERRED') {
      console.log(error.message);
      process.exit(0);
    }
    console.error(error);
    process.exit(error?.retryable === true ? RETRYABLE_TEMP_FAILURE_EXIT_CODE : 1);
  });
}
