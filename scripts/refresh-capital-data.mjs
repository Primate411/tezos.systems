#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCoinGeckoTickerPage, validateCoinGeckoTickerCoverage } from './lib/coingecko-ticker-page.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_FILE = path.join(ROOT, 'data/capital-snapshot.json');
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;
const TWO_YEARS_DAYS = 730;
const TEZOS_ACTIVITY_DAYS = 30;
const ART_WINDOW_DAYS = 30;
const OBJKT_PAGE_SIZE = 500;
const OBJKT_SALES_MAX_PAGES = 60;
const OBJKT_MINTS_MAX_PAGES = 40;
const OBJKT_MIN_DISPATCH_INTERVAL_MS = 550;
const GITLAB_PAGE_SIZE = 100;
const GITLAB_MAX_PAGES = 10;

const TZKT = 'https://api.tzkt.io/v1';
const ETHERLINK_EXPLORER = 'https://explorer.etherlink.com';
const ETHERLINK_STATS = `${ETHERLINK_EXPLORER}/stats-service/api/v1`;
const DEFILLAMA = 'https://api.llama.fi';
const DEFILLAMA_STABLECOINS = 'https://stablecoins.llama.fi';
const COINGECKO = 'https://api.coingecko.com/api/v3';
const OBJKT = 'https://data.objkt.com/v3/graphql';
const GITLAB = 'https://gitlab.com/api/v4';
const XU3O8_CONTRACT = '0x79052Ab3C166D4899a1e0DD033aC3b379AF0B1fD';

const XU3O8_PROOFS = Object.freeze([
  'https://help.uranium.io/en/articles/10222923-what-is-the-contract-address',
  'https://help.uranium.io/en/articles/11604935-token-not-appearing-in-wallet-usdc-xu3o8'
]);

const SOURCE_DEFINITIONS = Object.freeze({
  defillama: {
    label: 'DefiLlama',
    url: 'https://defillama.com/docs/api',
    credit: 'TVL, protocol, and stablecoin histories',
    endpoints: [
      `${DEFILLAMA}/v2/historicalChainTvl/{chain}`,
      `${DEFILLAMA}/protocols`,
      `${DEFILLAMA_STABLECOINS}/stablecoincharts/{chain}`
    ]
  },
  tzkt: {
    label: 'TzKT API',
    url: 'https://api.tzkt.io/',
    credit: 'Powered by TzKT API',
    endpoints: [
      `${TZKT}/statistics/current`,
      `${TZKT}/accounts/count`,
      `${TZKT}/operations/transactions/count`,
      `${TZKT}/blocks`
    ]
  },
  etherlinkBlockscout: {
    label: 'Etherlink Blockscout',
    url: 'https://explorer.etherlink.com/',
    credit: 'Current Etherlink network counters',
    endpoints: [`${ETHERLINK_EXPLORER}/api/v2/stats`]
  },
  etherlinkStats: {
    label: 'Etherlink Blockscout stats service',
    url: 'https://docs.blockscout.com/setup/configuration-options/charts-and-stats',
    credit: 'Daily Etherlink transactions, account activity, transaction fees, and gas price',
    endpoints: [`${ETHERLINK_STATS}/lines/{metric}`]
  },
  coingecko: {
    label: 'CoinGecko',
    url: 'https://docs.coingecko.com/reference/introduction',
    credit: 'XTZ price histories and exchange-market snapshots',
    endpoints: [
      `${COINGECKO}/coins/tezos`,
      `${COINGECKO}/coins/tezos/market_chart`,
      `${COINGECKO}/coins/tezos/tickers`
    ]
  },
  uraniumIssuer: {
    label: 'Uranium.io issuer documentation',
    url: XU3O8_PROOFS[0],
    credit: 'Issuer-confirmed xU3O8 contract and decimals',
    endpoints: XU3O8_PROOFS
  },
  etherlinkBlockscoutRwa: {
    label: 'Etherlink Blockscout token API',
    url: `${ETHERLINK_EXPLORER}/token/${XU3O8_CONTRACT}`,
    credit: 'xU3O8 token, holder, transfer, and latest-receipt counters',
    endpoints: [
      `${ETHERLINK_EXPLORER}/api/v2/tokens/${XU3O8_CONTRACT}`,
      `${ETHERLINK_EXPLORER}/api/v2/tokens/${XU3O8_CONTRACT}/counters`,
      `${ETHERLINK_EXPLORER}/api/v2/tokens/${XU3O8_CONTRACT}/transfers`
    ]
  },
  defillamaRwa: {
    label: 'DefiLlama RWA discovery',
    url: 'https://defillama.com/protocols/RWA',
    credit: 'Current Tezos and Etherlink RWA protocol TVL rows',
    endpoints: [`${DEFILLAMA}/protocols`]
  },
  coingeckoRwa: {
    label: 'CoinGecko asset-platform registry',
    url: 'https://docs.coingecko.com/reference/coins-list',
    credit: 'Discoverable Tezos and Etherlink RWA token contract mappings',
    endpoints: [`${COINGECKO}/coins/list?include_platform=true`]
  },
  objkt: {
    label: 'OBJKT API v3',
    url: 'https://data.objkt.com/docs/',
    credit: 'OBJKT-indexed cross-marketplace listing sales, mints, collections, buyers, and artists',
    endpoints: [OBJKT]
  },
  gitlab: {
    label: 'GitLab public API',
    url: 'https://docs.gitlab.com/api/commits/',
    credit: 'Canonical Octez repository commit activity',
    endpoints: [`${GITLAB}/projects/tezos%2Ftezos/repository/commits`]
  }
});

const SOURCE_ORDER = Object.keys(SOURCE_DEFINITIONS);
const requestCache = new Map();
let objktDispatchGate = Promise.resolve();
let objktLastDispatchAt = 0;

function hasFlag(name) {
  return process.argv.includes(name);
}

function cliValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function outputFile() {
  const requested = cliValue('--output');
  return requested ? path.resolve(process.cwd(), requested) : OUTPUT_FILE;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function capitalContentHash(value) {
  const { contentHash: ignored, ...unsigned } = value || {};
  return createHash('sha256').update(JSON.stringify(stableValue(unsigned))).digest('hex');
}

function round(value, digits = 2) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const scale = 10 ** digits;
  return Math.round((number + Number.EPSILON) * scale) / scale;
}

function integer(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

function isoDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function utcDay(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

function compareText(left, right) {
  return String(left || '').localeCompare(String(right || ''), 'en');
}

function cleanError(error) {
  return String(error?.message || error || 'Unknown source error').replace(/\s+/g, ' ').slice(0, 400);
}

function requestLabel(url) {
  try {
    const parsed = new URL(url);
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return String(url).slice(0, 200);
  }
}

function sumObjectValues(value) {
  return Object.values(value || {}).reduce((sum, item) => sum + (Number(item) || 0), 0);
}

function humanDecimal(rawValue, decimalsValue) {
  const raw = String(rawValue ?? '');
  const decimals = Number(decimalsValue);
  if (!/^\d+$/.test(raw) || !Number.isInteger(decimals) || decimals < 0 || decimals > 36) return null;
  if (decimals === 0) return raw;
  const padded = raw.padStart(decimals + 1, '0');
  const whole = padded.slice(0, -decimals);
  const fraction = padded.slice(-decimals).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
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

async function requestJsonUncached(url, options = {}) {
  const maximumAttempts = 4;
  const label = requestLabel(url);
  let lastError = null;
  for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 35_000);
    let retryDelay = Math.min(8000, 500 * (2 ** attempt));
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'tezos.systems Capital snapshot refresher/1.0',
          ...(options.headers || {})
        },
        signal: controller.signal
      });
      if (!response.ok) {
        const error = new Error(`${label} returned HTTP ${response.status}`);
        if (response.status !== 429 && response.status < 500) throw error;
        lastError = error;
        retryDelay = Math.min(15_000, retryAfterMilliseconds(response.headers.get('retry-after')) ?? retryDelay);
      } else {
        const payload = await response.json();
        if (payload?.errors?.length) throw new Error(payload.errors.map((item) => item.message).join('; '));
        return payload;
      }
    } catch (error) {
      lastError = error;
      if (error?.message?.includes(' returned HTTP ') && !/HTTP (429|5\d\d)$/.test(error.message)) throw error;
    } finally {
      clearTimeout(timer);
    }
    if (attempt + 1 < maximumAttempts) await wait(retryDelay);
  }
  throw new Error(`${label} failed after ${maximumAttempts} attempts: ${cleanError(lastError)}`);
}

async function requestJson(url, options = {}) {
  const cacheKey = `${options.method || 'GET'} ${url} ${options.body || ''}`;
  if (!requestCache.has(cacheKey)) {
    const request = requestJsonUncached(url, options).catch((error) => {
      requestCache.delete(cacheKey);
      throw error;
    });
    requestCache.set(cacheKey, request);
  }
  return requestCache.get(cacheKey);
}

async function objkt(query, variables) {
  const turn = objktDispatchGate.then(async () => {
    const remaining = OBJKT_MIN_DISPATCH_INTERVAL_MS - (Date.now() - objktLastDispatchAt);
    if (remaining > 0) await wait(remaining);
    objktLastDispatchAt = Date.now();
  });
  objktDispatchGate = turn.catch(() => {});
  await turn;
  const payload = await requestJson(OBJKT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables })
  });
  return payload?.data || {};
}

async function mapConcurrent(values, concurrency, mapper) {
  const results = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return results;
}

function successfulReceipt(sourceKey, checkedAt, coverage = {}) {
  return {
    ...SOURCE_DEFINITIONS[sourceKey],
    retrievedAt: checkedAt,
    checkedAt,
    status: 'ok',
    error: null,
    coverage
  };
}

function failedReceipt(sourceKey, previous, checkedAt, error) {
  return {
    ...SOURCE_DEFINITIONS[sourceKey],
    retrievedAt: previous?.retrievedAt || null,
    checkedAt,
    status: previous ? 'stale' : 'unavailable',
    error: cleanError(error),
    coverage: previous?.coverage || {}
  };
}

async function attemptPart({ sourceKey, previousData, previousSources, checkedAt, emptyData, build }) {
  try {
    const result = await build();
    return {
      data: result.data,
      receipt: successfulReceipt(sourceKey, checkedAt, result.coverage)
    };
  } catch (error) {
    const prior = previousSources?.[sourceKey] || null;
    console.warn(`warn - ${sourceKey} refresh failed; ${previousData ? 'preserving last-known-good section' : 'writing an unavailable section'}: ${cleanError(error)}`);
    return {
      data: previousData ?? emptyData(error),
      receipt: failedReceipt(sourceKey, prior, checkedAt, error)
    };
  }
}

function normalizeSeries(rows, valueOf, extrasOf = () => ({})) {
  const byDate = new Map();
  for (const row of rows || []) {
    const date = typeof row?.date === 'number' || /^\d+$/.test(String(row?.date || ''))
      ? isoDate(Number(row.date) * 1000)
      : isoDate(row?.date);
    const value = valueOf(row);
    if (!date || value === null) continue;
    byDate.set(date, { date, value, ...extrasOf(row) });
  }
  return [...byDate.values()].sort((left, right) => compareText(left.date, right.date));
}

function normalizeStablecoinHistory(rows) {
  const byDate = new Map();
  for (const row of rows || []) {
    const date = isoDate(Number(row?.date) * 1000);
    if (!date) continue;
    byDate.set(date, {
      date,
      valueUsd: round(sumObjectValues(row.totalCirculatingUSD), 2),
      canonicalUsd: round(sumObjectValues(row.totalMintedUSD), 2),
      bridgedUsd: round(sumObjectValues(row.totalBridgedToUSD), 2)
    });
  }
  return [...byDate.values()].sort((left, right) => compareText(left.date, right.date));
}

function chainProtocols(protocols, chain) {
  const rows = (protocols || [])
    .map((protocol) => ({
      slug: protocol?.slug || null,
      name: protocol?.name || protocol?.slug || 'Unknown protocol',
      category: protocol?.category || 'Unclassified',
      parentProtocol: protocol?.parentProtocol || null,
      tvlUsd: round(protocol?.chainTvls?.[chain], 2),
      url: /^https:\/\//.test(protocol?.url || '') ? protocol.url : null
    }))
    .filter((row) => row.slug && Number(row.tvlUsd) > 0)
    .sort((left, right) => right.tvlUsd - left.tvlUsd || compareText(left.slug, right.slug));
  const denominator = rows.reduce((sum, row) => sum + row.tvlUsd, 0);
  return rows.map((row) => ({
    ...row,
    sharePct: denominator > 0 ? round((row.tvlUsd / denominator) * 100, 4) : null
  }));
}

async function buildDefi() {
  const [tezosTvlRaw, etherlinkTvlRaw, tezosStableRaw, etherlinkStableRaw, protocolsRaw] = await Promise.all([
    requestJson(`${DEFILLAMA}/v2/historicalChainTvl/Tezos`),
    requestJson(`${DEFILLAMA}/v2/historicalChainTvl/Etherlink`),
    requestJson(`${DEFILLAMA_STABLECOINS}/stablecoincharts/Tezos`),
    requestJson(`${DEFILLAMA_STABLECOINS}/stablecoincharts/Etherlink`),
    requestJson(`${DEFILLAMA}/protocols`)
  ]);
  if (![tezosTvlRaw, etherlinkTvlRaw, tezosStableRaw, etherlinkStableRaw, protocolsRaw].every(Array.isArray)) {
    throw new Error('DefiLlama returned an invalid collection');
  }
  const chains = [
    ['tezos', 'Tezos', 'Tezos', tezosTvlRaw, tezosStableRaw],
    ['etherlink', 'Etherlink', 'Etherlink', etherlinkTvlRaw, etherlinkStableRaw]
  ].map(([id, label, sourceChain, tvlRaw, stableRaw]) => {
    const tvlHistory = normalizeSeries(tvlRaw, (row) => round(row?.tvl, 2));
    const stableHistory = normalizeStablecoinHistory(stableRaw);
    return {
      id,
      label,
      tvl: {
        currentUsd: tvlHistory.at(-1)?.value ?? null,
        history: tvlHistory.map(({ date, value }) => ({ date, valueUsd: value }))
      },
      stablecoins: {
        currentUsd: stableHistory.at(-1)?.valueUsd ?? null,
        history: stableHistory
      },
      protocols: chainProtocols(protocolsRaw, sourceChain)
    };
  });
  return {
    data: {
      chains,
      coverage: {
        status: 'complete',
        history: 'Full daily history returned by the public endpoints.',
        protocolShareDenominator: 'Sum of positive exact-chain protocol rows returned by DefiLlama; category and parent relationships remain visible.',
        stablecoinDefinition: 'USD value across all peg categories; canonical and bridged components are kept separate to expose possible bridge double counting.'
      }
    },
    coverage: {
      chains: chains.map((chain) => ({
        id: chain.id,
        tvlDays: chain.tvl.history.length,
        stablecoinDays: chain.stablecoins.history.length,
        protocols: chain.protocols.length
      })),
      truncated: false
    }
  };
}

function emptyDefi(error) {
  return {
    chains: ['tezos', 'etherlink'].map((id) => ({
      id,
      label: id === 'tezos' ? 'Tezos' : 'Etherlink',
      tvl: { currentUsd: null, history: [] },
      stablecoins: { currentUsd: null, history: [] },
      protocols: []
    })),
    coverage: { status: 'unavailable', error: cleanError(error) }
  };
}

function tzktUrl(pathname, params = {}) {
  const url = new URL(`${TZKT}${pathname}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  return url.toString();
}

async function buildTezosDailyFeeReceipt(day) {
  const limit = 10_000;
  let offset = 0;
  let totalFeesMutez = 0;
  let blockCount = 0;
  while (true) {
    const fees = await requestJson(tzktUrl('/blocks', {
      'timestamp.ge': day.from,
      'timestamp.lt': day.to,
      'sort.asc': 'level',
      select: 'fees',
      offset,
      limit
    }));
    if (!Array.isArray(fees)) throw new Error(`TzKT returned invalid block fees for ${day.date}`);
    for (const value of fees) {
      const fee = integer(value);
      if (fee === null || fee < 0) throw new Error(`TzKT returned an invalid block fee for ${day.date}`);
      totalFeesMutez += fee;
    }
    blockCount += fees.length;
    if (fees.length < limit) break;
    offset += fees.length;
    if (offset > 20_000) throw new Error(`TzKT block fee pagination exceeded the daily bound for ${day.date}`);
  }
  return {
    date: day.date,
    totalMutez: totalFeesMutez,
    blockCount,
    averagePerBlockMutez: blockCount ? round(totalFeesMutez / blockCount, 2) : null,
    complete: true
  };
}

async function buildTezosNetwork(generatedAt) {
  const currentDay = utcDay(new Date(generatedAt));
  const completedDays = Array.from({ length: TEZOS_ACTIVITY_DAYS }, (_, index) => {
    const from = addDays(currentDay, index - TEZOS_ACTIVITY_DAYS);
    const to = addDays(from, 1);
    return { date: isoDate(from), from: from.toISOString(), to: to.toISOString() };
  });
  const [statistics, totalAccounts, fundedAccounts, latestBlockRows, daily] = await Promise.all([
    requestJson(`${TZKT}/statistics/current`),
    requestJson(`${TZKT}/accounts/count`),
    requestJson(tzktUrl('/accounts/count', { 'balance.gt': 0 })),
    requestJson(tzktUrl('/blocks', { 'sort.desc': 'level', select: 'level,timestamp,fees', limit: 1 })),
    mapConcurrent(completedDays, 3, async (day) => {
      const [count, feeReceipt] = await Promise.all([
        requestJson(tzktUrl('/operations/transactions/count', {
          status: 'applied',
          'timestamp.ge': day.from,
          'timestamp.lt': day.to
        })),
        buildTezosDailyFeeReceipt(day)
      ]);
      const value = integer(count);
      if (value === null || value < 0) throw new Error(`TzKT returned an invalid transaction count for ${day.date}`);
      return { date: day.date, count: value, feeReceipt, complete: true };
    })
  ]);
  if (!statistics || typeof statistics !== 'object') throw new Error('TzKT current statistics are invalid');
  const latestBlock = Array.isArray(latestBlockRows) ? latestBlockRows[0] : null;
  if (!latestBlock || integer(latestBlock.level) === null || integer(latestBlock.fees) === null) {
    throw new Error('TzKT latest block fee receipt is invalid');
  }
  const totalSupply = integer(statistics.totalSupply);
  const totalVotingPower = integer(statistics.totalVotingPower);
  const circulatingSupply = integer(statistics.circulatingSupply);
  const ownStaked = integer(statistics.totalOwnStaked);
  const externalStaked = integer(statistics.totalExternalStaked);
  const staked = ownStaked !== null && externalStaked !== null ? ownStaked + externalStaked : null;
  const delegated = (integer(statistics.totalOwnDelegated) || 0) + (integer(statistics.totalExternalDelegated) || 0);
  return {
    data: {
      statistics: {
        level: integer(statistics.level),
        timestamp: statistics.timestamp || null,
        totalSupplyMutez: totalSupply,
        circulatingSupplyMutez: circulatingSupply,
        totalVotingPowerMutez: totalVotingPower,
        ownStakedMutez: ownStaked,
        externalStakedMutez: externalStaked,
        delegatedMutez: delegated,
        stakingRatioPct: staked !== null && totalSupply > 0
          ? round((staked / totalSupply) * 100, 4)
          : null,
        totalBakers: integer(statistics.totalBakers),
        totalStakers: integer(statistics.totalStakers),
        totalDelegators: integer(statistics.totalDelegators)
      },
      accounts: {
        total: integer(totalAccounts),
        funded: integer(fundedAccounts),
        definition: 'All indexed accounts; funded accounts currently have balance greater than zero.'
      },
      transactions: {
        latestCompletedDay: daily.at(-1) ? { date: daily.at(-1).date, count: daily.at(-1).count, complete: true } : null,
        daily: daily.map(({ feeReceipt: ignored, ...row }) => row),
        coverage: {
          days: daily.length,
          completeDaysOnly: true,
          truncated: true,
          definition: 'Applied TzKT transaction operations, including indexed internal calls; not semantically identical to an Etherlink EVM transaction.'
        }
      },
      fees: {
        latestBlock: {
          level: integer(latestBlock.level),
          timestamp: latestBlock.timestamp || null,
          totalMutez: integer(latestBlock.fees)
        },
        latestCompletedDay: daily.at(-1)?.feeReceipt || null,
        daily: daily.map((row) => row.feeReceipt),
        coverage: {
          days: daily.length,
          completeDaysOnly: true,
          truncated: true,
          definition: 'Total operation fees gathered by every indexed L1 block in each completed UTC day. This is a block-fee pool, not a per-transaction average.'
        }
      },
      coverage: {
        status: 'complete',
        statistics: 'Current TzKT network statistics.',
        activity: `${TEZOS_ACTIVITY_DAYS} completed UTC days from bounded daily transaction-count and block-fee queries.`
      }
    },
    coverage: {
      statisticsLevel: integer(statistics.level),
      transactionDays: daily.length,
      feeDays: daily.length,
      transactionDefinition: 'status=applied; TzKT transaction operations; includes indexed internal calls',
      feeDefinition: 'sum of block.fees across every indexed block in each completed UTC day',
      truncated: true
    }
  };
}

function emptyTezosNetwork(error) {
  return {
    statistics: {},
    accounts: { total: null, funded: null },
    transactions: { latestCompletedDay: null, daily: [], coverage: { days: 0, truncated: true } },
    fees: { latestBlock: null, latestCompletedDay: null, daily: [], coverage: { days: 0, truncated: true } },
    coverage: { status: 'unavailable', error: cleanError(error) }
  };
}

async function buildEtherlinkCounters() {
  const stats = await requestJson(`${ETHERLINK_EXPLORER}/api/v2/stats`);
  if (!stats || typeof stats !== 'object') throw new Error('Etherlink Blockscout stats are invalid');
  const counters = {
    totalAddresses: integer(stats.total_addresses),
    totalBlocks: integer(stats.total_blocks),
    totalTransactions: integer(stats.total_transactions),
    transactionsToday: integer(stats.transactions_today),
    averageBlockTimeMs: round(stats.average_block_time, 3),
    networkUtilizationPct: round(stats.network_utilization_percentage, 8),
    gasUsedToday: String(stats.gas_used_today ?? ''),
    gasPricesGwei: {
      slow: round(stats.gas_prices?.slow, 8),
      average: round(stats.gas_prices?.average, 8),
      fast: round(stats.gas_prices?.fast, 8)
    },
    observedAt: stats.gas_price_updated_at || null
  };
  return {
    data: counters,
    coverage: { fields: Object.keys(counters).length, snapshot: true, truncated: false }
  };
}

async function buildEtherlinkSeries(generatedAt) {
  const to = utcDay(new Date(generatedAt));
  const from = addDays(to, -TWO_YEARS_DAYS);
  const metrics = [
    ['newTransactions', 'newTxns', (value) => integer(value)],
    ['activeAccounts', 'activeAccounts', (value) => integer(value)],
    ['accountsGrowth', 'accountsGrowth', (value) => integer(value)],
    ['averageTransactionFee', 'averageTxnFee', (value) => round(value, 12)],
    ['transactionFees', 'txnsFee', (value) => round(value, 9)],
    ['averageGasPrice', 'averageGasPrice', (value) => round(value, 8)]
  ];
  const rows = await Promise.all(metrics.map(async ([key, metric, normalize]) => {
    const url = new URL(`${ETHERLINK_STATS}/lines/${metric}`);
    url.searchParams.set('resolution', 'DAY');
    url.searchParams.set('from', isoDate(from));
    url.searchParams.set('to', isoDate(to));
    const payload = await requestJson(url.toString());
    if (!Array.isArray(payload?.chart)) throw new Error(`Etherlink ${metric} chart is invalid`);
    return [key, normalizeSeries(
      payload.chart,
      (row) => normalize(row?.value),
      (row) => ({ approximate: Boolean(row?.is_approximate) })
    )];
  }));
  const series = Object.fromEntries(rows);
  series.newAccounts = series.accountsGrowth.slice(1).map((row, index) => {
    const previous = series.accountsGrowth[index];
    const value = Number.isFinite(row.value) && Number.isFinite(previous?.value)
      ? Math.max(0, row.value - previous.value)
      : null;
    return {
      date: row.date,
      value,
      approximate: Boolean(row.approximate || previous?.approximate)
    };
  }).filter((row) => row.value !== null);
  return {
    data: series,
    coverage: {
      requestedFrom: isoDate(from),
      requestedTo: isoDate(to),
      resolution: 'DAY',
      accountsGrowthDefinition: 'Cumulative indexed-account series from Blockscout; newAccounts is its non-negative adjacent daily delta.',
      returnedDays: Object.fromEntries(Object.entries(series).map(([key, value]) => [key, value.length])),
      truncated: false
    }
  };
}

function emptyEtherlinkCounters() {
  return {
    totalAddresses: null,
    totalBlocks: null,
    totalTransactions: null,
    transactionsToday: null,
    gasUsedToday: '',
    gasPricesGwei: { slow: null, average: null, fast: null },
    observedAt: null
  };
}

function emptyEtherlinkSeries() {
  return {
    newTransactions: [],
    activeAccounts: [],
    accountsGrowth: [],
    newAccounts: [],
    averageTransactionFee: [],
    transactionFees: [],
    averageGasPrice: []
  };
}

function normalizePriceHistory(rows, digits) {
  const byDate = new Map();
  for (const row of rows || []) {
    const date = isoDate(Number(row?.[0]));
    const value = round(row?.[1], digits);
    if (date && value !== null) byDate.set(date, { date, value });
  }
  return [...byDate.values()].sort((left, right) => compareText(left.date, right.date));
}

async function buildMarkets() {
  const detailUrl = `${COINGECKO}/coins/tezos?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`;
  const historyUrl = (currency) => `${COINGECKO}/coins/tezos/market_chart?vs_currency=${currency}&days=365&interval=daily`;
  const [detail, usd, btc, eth, tickerPayload] = await Promise.all([
    requestJson(detailUrl),
    requestJson(historyUrl('usd')),
    requestJson(historyUrl('btc')),
    requestJson(historyUrl('eth')),
    requestJson(`${COINGECKO}/coins/tezos/tickers?page=1&depth=true`)
  ]);
  if (![usd?.prices, btc?.prices, eth?.prices, tickerPayload?.tickers].every(Array.isArray)) {
    throw new Error('CoinGecko returned an invalid market payload');
  }
  const marketData = detail?.market_data || {};
  const tickerPage = await readCoinGeckoTickerPage(tickerPayload,
    () => requestJson(`${COINGECKO}/coins/tezos/tickers?page=2&depth=true`));
  const tickers = tickerPage.rows
    .map((ticker) => ({
      market: ticker?.market?.name || 'Unknown venue',
      base: ticker?.base || null,
      target: ticker?.target || null,
      last: round(ticker?.last, 12),
      convertedVolumeUsd: round(ticker?.converted_volume?.usd, 2),
      bidAskSpreadPct: round(ticker?.bid_ask_spread_percentage, 6),
      costToMoveUpUsd: round(ticker?.cost_to_move_up_usd, 2),
      costToMoveDownUsd: round(ticker?.cost_to_move_down_usd, 2),
      lastTradedAt: ticker?.last_traded_at || null,
      isStale: Boolean(ticker?.is_stale),
      isAnomaly: Boolean(ticker?.is_anomaly),
      trustScore: ticker?.trust_score || null,
      tradeUrl: /^https:\/\//.test(ticker?.trade_url || '') ? ticker.trade_url : null
    }))
    .sort((left, right) => (right.convertedVolumeUsd || 0) - (left.convertedVolumeUsd || 0)
      || compareText(left.market, right.market)
      || compareText(`${left.base}/${left.target}`, `${right.base}/${right.target}`));
  return {
    data: {
      coin: {
        id: detail?.id || 'tezos',
        symbol: detail?.symbol || 'xtz',
        name: detail?.name || 'Tezos',
        currentPriceUsd: round(marketData?.current_price?.usd, 8),
        currentPriceBtc: round(marketData?.current_price?.btc, 12),
        currentPriceEth: round(marketData?.current_price?.eth, 12),
        marketCapUsd: round(marketData?.market_cap?.usd, 2),
        volume24hUsd: round(marketData?.total_volume?.usd, 2),
        change24hPct: round(marketData?.price_change_percentage_24h, 6),
        circulatingSupply: round(marketData?.circulating_supply, 6),
        totalSupply: round(marketData?.total_supply, 6),
        lastUpdated: detail?.last_updated || null
      },
      priceHistory: {
        usd: normalizePriceHistory(usd.prices, 8),
        btc: normalizePriceHistory(btc.prices, 12),
        eth: normalizePriceHistory(eth.prices, 12)
      },
      tickers,
      coverage: {
        historyDays: 365,
        ...tickerPage.coverage,
        depthDefinition: 'CoinGecko-reported USD cost to move the order book by plus or minus 2%.',
        filtersApplied: 'None; stale, anomaly, and trust fields are retained for client-side quality controls.'
      }
    },
    coverage: {
      priceDays: {
        usd: normalizePriceHistory(usd.prices, 8).length,
        btc: normalizePriceHistory(btc.prices, 12).length,
        eth: normalizePriceHistory(eth.prices, 12).length
      },
      ...tickerPage.coverage
    }
  };
}

function emptyMarkets(error) {
  return {
    coin: { id: 'tezos', symbol: 'xtz', name: 'Tezos' },
    priceHistory: { usd: [], btc: [], eth: [] },
    tickers: [],
    coverage: { status: 'unavailable', error: cleanError(error) }
  };
}

function xu3o8Base() {
  return {
    id: 'xu3o8',
    name: 'Uranium',
    symbol: 'xU3O8',
    network: 'etherlink',
    issuer: 'Uranium.io',
    contract: XU3O8_CONTRACT,
    decimals: 18,
    proofUrls: [...XU3O8_PROOFS],
    token: {
      totalSupplyRaw: null,
      totalSupply: null,
      holders: null,
      exchangeRateUsd: null
    },
    counters: { holders: null, transfers: null },
    latestTransfer: null,
    coverage: {
      issuerContractVerified: true,
      tokenStats: 'unavailable'
    }
  };
}

async function buildXu3o8() {
  const base = xu3o8Base();
  const root = `${ETHERLINK_EXPLORER}/api/v2/tokens/${XU3O8_CONTRACT}`;
  const [token, counters, transfers] = await Promise.all([
    requestJson(root),
    requestJson(`${root}/counters`),
    requestJson(`${root}/transfers`)
  ]);
  const latest = transfers?.items?.[0] || null;
  const totalSupplyRaw = String(token?.total_supply ?? '');
  const decimals = integer(token?.decimals) ?? base.decimals;
  return {
    data: {
      ...base,
      name: token?.name || base.name,
      symbol: token?.symbol || base.symbol,
      decimals,
      token: {
        totalSupplyRaw: /^\d+$/.test(totalSupplyRaw) ? totalSupplyRaw : null,
        totalSupply: humanDecimal(totalSupplyRaw, decimals),
        holders: integer(token?.holders_count),
        exchangeRateUsd: round(token?.exchange_rate, 8)
      },
      counters: {
        holders: integer(counters?.token_holders_count),
        transfers: integer(counters?.transfers_count)
      },
      latestTransfer: latest ? {
        timestamp: latest.timestamp || null,
        transactionHash: latest.transaction_hash || null,
        amountRaw: String(latest?.total?.value ?? ''),
        amount: humanDecimal(latest?.total?.value, latest?.total?.decimals),
        from: {
          address: latest?.from?.hash || null,
          name: latest?.from?.name || null,
          isContract: Boolean(latest?.from?.is_contract)
        },
        to: {
          address: latest?.to?.hash || null,
          name: latest?.to?.name || null,
          isContract: Boolean(latest?.to?.is_contract)
        }
      } : null,
      coverage: {
        issuerContractVerified: true,
        tokenStats: 'current Blockscout token and counter snapshots',
        latestTransfer: latest ? 'latest item from the first Blockscout transfer page' : 'not returned',
        historicalTransferReconstruction: 'not included in this bounded snapshot'
      }
    },
    coverage: {
      contract: XU3O8_CONTRACT,
      holderCounter: integer(counters?.token_holders_count),
      transferCounter: integer(counters?.transfers_count),
      latestTransferRows: latest ? 1 : 0,
      truncated: true
    }
  };
}

async function buildRwaProtocols() {
  const protocols = await requestJson(`${DEFILLAMA}/protocols`);
  if (!Array.isArray(protocols)) throw new Error('DefiLlama protocol list is invalid');
  const rows = protocols
    .filter((protocol) => String(protocol?.category || '').toUpperCase() === 'RWA')
    .map((protocol) => {
      const networks = ['Tezos', 'Etherlink'].filter((chain) => Number(protocol?.chainTvls?.[chain]) > 0);
      return {
        slug: protocol?.slug || null,
        name: protocol?.name || protocol?.slug || 'Unknown protocol',
        category: 'RWA',
        chains: networks.map((chain) => chain.toLowerCase()),
        tvlUsd: round(networks.reduce((sum, chain) => sum + (Number(protocol.chainTvls[chain]) || 0), 0), 2),
        chainTvlUsd: Object.fromEntries(networks.map((chain) => [chain.toLowerCase(), round(protocol.chainTvls[chain], 2)])),
        url: /^https:\/\//.test(protocol?.url || '') ? protocol.url : null
      };
    })
    .filter((row) => row.slug && row.chains.length)
    .sort((left, right) => right.tvlUsd - left.tvlUsd || compareText(left.slug, right.slug));
  return {
    data: rows,
    coverage: { category: 'RWA', chains: ['Tezos', 'Etherlink'], rows: rows.length, truncated: false }
  };
}

function rwaProvider(coin) {
  const id = String(coin?.id || '').toLowerCase();
  const name = String(coin?.name || '').toLowerCase();
  if (id === 'uranium' || name.includes('uranium')) return 'Uranium.io';
  if (id === 'eutbl' || id.startsWith('spiko-') || name.includes('spiko')) return 'Spiko';
  if (id.startsWith('midas-') || name.startsWith('midas ')) return 'Midas';
  if (id.startsWith('vnx-') || name.startsWith('vnx ')) return 'VNX';
  return null;
}

async function buildRwaTokens() {
  const coins = await requestJson(`${COINGECKO}/coins/list?include_platform=true`);
  if (!Array.isArray(coins)) throw new Error('CoinGecko coin list is invalid');
  const discovered = coins
    .map((coin) => ({ ...coin, provider: rwaProvider(coin) }))
    .filter((coin) => coin.provider)
    .map((coin) => ({
      id: coin.id,
      symbol: String(coin.symbol || '').toUpperCase(),
      name: coin.name,
      provider: coin.provider,
      platforms: [
        coin?.platforms?.tezos ? { network: 'tezos', contract: coin.platforms.tezos } : null,
        coin?.platforms?.etherlink ? { network: 'etherlink', contract: coin.platforms.etherlink } : null
      ].filter(Boolean)
    }))
    .filter((coin) => coin.platforms.length)
    .sort((left, right) => compareText(left.provider, right.provider) || compareText(left.id, right.id));
  const rows = discovered.map((coin) => ({
    ...coin,
    verification: 'CoinGecko asset-platform contract mapping; issuer verification is not implied.'
  }));
  return {
    data: rows,
    coverage: {
      providers: [...new Set(rows.map((row) => row.provider))],
      rows: rows.length,
      networks: ['tezos', 'etherlink'],
      discoveryRule: 'CoinGecko-listed Uranium, Spiko, Midas, and VNX names/ids with a Tezos or Etherlink contract mapping.',
      priceStatus: 'not-collected',
      priceNote: 'The mapping refresh deliberately avoids another public CoinGecko request after the five XTZ market requests; xU3O8 retains its Blockscout exchange-rate snapshot.',
      truncated: false
    }
  };
}

function emptyRwaProtocols() {
  return [];
}

function emptyRwaTokens() {
  return [];
}

async function fetchObjktTimeKeyset(query, root, variables, maxPages) {
  const rows = [];
  let beforeTs = variables.to;
  let beforeId = '9223372036854775807';
  let pages = 0;
  let truncated = false;
  for (let page = 0; page < maxPages; page += 1) {
    const data = await objkt(query, { ...variables, limit: OBJKT_PAGE_SIZE, beforeTs, beforeId });
    const batch = data?.[root];
    if (!Array.isArray(batch)) throw new Error(`OBJKT ${root} returned an invalid page`);
    pages += 1;
    rows.push(...batch);
    if (batch.length < OBJKT_PAGE_SIZE) return { rows, pages, truncated: false };
    const last = batch.at(-1);
    const lastId = integer(last?.id);
    const lastTimestamp = last?.timestamp;
    if (lastId === null || !Number.isFinite(Date.parse(lastTimestamp || ''))) throw new Error(`OBJKT ${root} keyset did not advance`);
    if (lastTimestamp === beforeTs && String(lastId) === String(beforeId)) throw new Error(`OBJKT ${root} keyset repeated its cursor`);
    beforeTs = lastTimestamp;
    beforeId = lastId;
    truncated = page + 1 === maxPages;
  }
  return { rows, pages, truncated };
}

function calendarDates(from, to) {
  const dates = [];
  for (let cursor = utcDay(from); cursor <= utcDay(to); cursor = addDays(cursor, 1)) dates.push(isoDate(cursor));
  return dates;
}

function groupArtRows(sales, mints, dates) {
  const marketplace = new Map();
  const dailySales = new Map(dates.map((date) => [date, {
    date,
    salesCount: 0,
    volumeXtz: 0,
    buyers: new Set(),
    sellers: new Set()
  }]));
  const dailyMints = new Map(dates.map((date) => [date, {
    date,
    mintOperations: 0,
    mints: 0,
    minters: new Set()
  }]));
  const collections = new Map();

  for (const sale of sales) {
    const date = isoDate(sale?.timestamp);
    const amount = Math.max(1, Number(sale?.amount) || 1);
    const volumeXtz = (Number(sale?.price_xtz) || 0) * amount / 1_000_000;
    const marketId = sale?.marketplace?.group || sale?.marketplace_contract || 'unknown';
    const marketName = sale?.marketplace?.group || sale?.marketplace?.name || sale?.marketplace_contract || 'Unknown marketplace';
    if (!marketplace.has(marketId)) marketplace.set(marketId, {
      id: marketId,
      name: marketName,
      contracts: new Set(),
      salesCount: 0,
      volumeXtz: 0,
      buyers: new Set(),
      sellers: new Set()
    });
    const market = marketplace.get(marketId);
    if (sale?.marketplace_contract) market.contracts.add(sale.marketplace_contract);
    market.salesCount += 1;
    market.volumeXtz += volumeXtz;
    if (sale?.buyer_address) market.buyers.add(sale.buyer_address);
    if (sale?.seller_address) market.sellers.add(sale.seller_address);

    if (dailySales.has(date)) {
      const day = dailySales.get(date);
      day.salesCount += 1;
      day.volumeXtz += volumeXtz;
      if (sale?.buyer_address) day.buyers.add(sale.buyer_address);
      if (sale?.seller_address) day.sellers.add(sale.seller_address);
    }

    const contract = sale?.token?.fa_contract;
    if (contract) {
      if (!collections.has(contract)) collections.set(contract, {
        contract,
        name: sale?.token?.fa?.name || contract,
        salesCount: 0,
        volumeXtz: 0,
        buyers: new Set(),
        sellers: new Set()
      });
      const collection = collections.get(contract);
      collection.salesCount += 1;
      collection.volumeXtz += volumeXtz;
      if (sale?.buyer_address) collection.buyers.add(sale.buyer_address);
      if (sale?.seller_address) collection.sellers.add(sale.seller_address);
    }
  }

  for (const mint of mints) {
    const date = isoDate(mint?.timestamp);
    if (!dailyMints.has(date)) continue;
    const day = dailyMints.get(date);
    day.mintOperations += 1;
    day.mints += Math.max(0, Number(mint?.amount) || 0);
    if (mint?.creator_address) day.minters.add(mint.creator_address);
  }

  const mapArtSummary = (row) => ({
    ...row,
    volumeXtz: round(row.volumeXtz, 6),
    buyers: row.buyers.size,
    sellers: row.sellers.size
  });
  return {
    marketplaces: [...marketplace.values()]
      .map((row) => ({ ...mapArtSummary(row), contracts: [...row.contracts].sort(compareText) }))
      .sort((left, right) => right.volumeXtz - left.volumeXtz || compareText(left.id, right.id)),
    dailySales: [...dailySales.values()].map(mapArtSummary),
    dailyMints: [...dailyMints.values()].map((row) => ({
      date: row.date,
      mintOperations: row.mintOperations,
      mints: row.mints,
      minters: row.minters.size
    })),
    topCollections30d: [...collections.values()]
      .map((row) => ({ contract: row.contract, name: row.name, ...mapArtSummary(row) }))
      .sort((left, right) => right.volumeXtz - left.volumeXtz || compareText(left.contract, right.contract))
      .slice(0, 50)
  };
}

async function buildArt(generatedAt) {
  const to = new Date(generatedAt);
  const fromDay = addDays(utcDay(to), -(ART_WINDOW_DAYS - 1));
  const from = fromDay.toISOString();
  const salesQuery = `query CapitalListingSales($from: timestamptz!, $to: timestamptz!, $limit: Int!, $beforeTs: timestamptz!, $beforeId: bigint!) {
    listing_sale(
      where: {
        timestamp: { _gte: $from, _lt: $to }
        _or: [
          { timestamp: { _lt: $beforeTs } }
          { _and: [{ timestamp: { _eq: $beforeTs } }, { id: { _lt: $beforeId } }] }
        ]
      }
      order_by: [{ timestamp: desc }, { id: desc }]
      limit: $limit
    ) {
      id timestamp price_xtz amount ophash buyer_address seller_address marketplace_contract
      marketplace { contract name group subgroup }
      token { fa_contract fa { name } }
    }
  }`;
  const mintsQuery = `query CapitalMints($from: timestamptz!, $to: timestamptz!, $limit: Int!, $beforeTs: timestamptz!, $beforeId: bigint!) {
    event(
      where: {
        event_type: { _eq: mint }
        timestamp: { _gte: $from, _lt: $to }
        _and: [
          { _or: [{ reverted: { _eq: false } }, { reverted: { _is_null: true } }] }
          { _or: [
            { timestamp: { _lt: $beforeTs } }
            { _and: [{ timestamp: { _eq: $beforeTs } }, { id: { _lt: $beforeId } }] }
          ] }
        ]
      }
      order_by: [{ timestamp: desc }, { id: desc }]
      limit: $limit
    ) {
      id timestamp creator_address amount ophash fa_contract token_pk
    }
  }`;
  const summaryQuery = `query CapitalArtSummaries($days: Int!, $collectionLimit: Int!, $rankLimit: Int!) {
    collections: fa(
      where: { live: { _eq: true }, type: { _eq: "fa2" }, volume_total: { _gt: "0" } }
      order_by: { volume_total: desc_nulls_last }
      limit: $collectionLimit
    ) {
      contract name volume_total volume_24h items owners collection_type ledger_type
    }
    buyers: sales_stat(
      distinct_on: [rank]
      where: { interval_days: { _eq: $days }, type: { _eq: buyer }, rank: { _gt: 0 }, subject: { flag: { _eq: none } } }
      order_by: [{ rank: asc }, { volume: desc }]
      limit: $rankLimit
    ) {
      rank type volume subject_address subject { alias tzdomain }
    }
    artists: sales_stat(
      distinct_on: [rank]
      where: { interval_days: { _eq: $days }, type: { _eq: artist }, rank: { _gt: 0 }, subject: { flag: { _eq: none } } }
      order_by: [{ rank: asc }, { volume: desc }]
      limit: $rankLimit
    ) {
      rank type volume subject_address subject { alias tzdomain }
    }
  }`;
  const [sales, mints, summaries] = await Promise.all([
    fetchObjktTimeKeyset(salesQuery, 'listing_sale', { from, to: generatedAt }, OBJKT_SALES_MAX_PAGES),
    fetchObjktTimeKeyset(mintsQuery, 'event', { from, to: generatedAt }, OBJKT_MINTS_MAX_PAGES),
    objkt(summaryQuery, { days: ART_WINDOW_DAYS, collectionLimit: 50, rankLimit: 100 })
  ]);
  if (![summaries?.collections, summaries?.buyers, summaries?.artists].every(Array.isArray)) {
    throw new Error('OBJKT summary query returned an invalid payload');
  }
  const dates = calendarDates(fromDay, to);
  const grouped = groupArtRows(sales.rows, mints.rows, dates);
  const today = isoDate(to);
  const saleCoverageStart = sales.truncated ? isoDate(sales.rows.at(-1)?.timestamp) : isoDate(fromDay);
  const mintCoverageStart = mints.truncated ? isoDate(mints.rows.at(-1)?.timestamp) : isoDate(fromDay);
  const profileRows = (rows) => rows.map((row) => ({
    rank: integer(row?.rank),
    address: row?.subject_address || null,
    name: row?.subject?.alias || row?.subject?.tzdomain || row?.subject_address || 'Unknown profile',
    volumeXtz: round((Number(row?.volume) || 0) / 1_000_000, 6)
  })).sort((left, right) => (left.rank || Number.MAX_SAFE_INTEGER) - (right.rank || Number.MAX_SAFE_INTEGER)
    || compareText(left.address, right.address));
  const topCollectionsLifetime = summaries.collections.map((row) => ({
    contract: row.contract,
    name: row.name || row.contract,
    volumeXtz: round((Number(row.volume_total) || 0) / 1_000_000, 6),
    volume24hXtz: round((Number(row.volume_24h) || 0) / 1_000_000, 6),
    items: integer(row.items),
    owners: integer(row.owners),
    collectionType: row.collection_type || null
  }));
  const truncated = sales.truncated || mints.truncated;
  return {
    data: {
      windowDays: ART_WINDOW_DAYS,
      range: { from, to: generatedAt },
      marketplaces: grouped.marketplaces,
      dailySales: grouped.dailySales.map((row) => {
        const coverage = !sales.truncated
          ? (row.date === today ? 'partial' : 'complete')
          : row.date < saleCoverageStart
            ? 'uncovered'
            : row.date === saleCoverageStart || row.date === today
              ? 'partial'
              : 'complete';
        return { ...row, complete: coverage === 'complete', coverage };
      }),
      dailyMints: grouped.dailyMints.map((row) => {
        const coverage = !mints.truncated
          ? (row.date === today ? 'partial' : 'complete')
          : row.date < mintCoverageStart
            ? 'uncovered'
            : row.date === mintCoverageStart || row.date === today
              ? 'partial'
              : 'complete';
        return { ...row, complete: coverage === 'complete', coverage };
      }),
      topCollections30d: grouped.topCollections30d,
      topCollectionsLifetime,
      topBuyers30d: profileRows(summaries.buyers),
      topArtists30d: profileRows(summaries.artists),
      coverage: {
        source: 'OBJKT API v3 public index',
        scope: 'Tezos L1 only; listing sales indexed across returned marketplace groups plus non-reverted mint events.',
        saleVolumeDefinition: 'Sum of listing_sale price_xtz multiplied by amount, converted from mutez; gross sales, not creator earnings or trader profit.',
        mintDefinition: 'Minted editions are the sum of event amount; mint operations and unique creator addresses are retained separately.',
        queries: {
          listingSales: { rows: sales.rows.length, pages: sales.pages, pageSize: OBJKT_PAGE_SIZE, maxPages: OBJKT_SALES_MAX_PAGES, truncated: sales.truncated, completion: sales.truncated ? 'most-recent-prefix' : 'terminal-short-page', coverageStartDate: saleCoverageStart },
          mintEvents: { rows: mints.rows.length, pages: mints.pages, pageSize: OBJKT_PAGE_SIZE, maxPages: OBJKT_MINTS_MAX_PAGES, truncated: mints.truncated, completion: mints.truncated ? 'most-recent-prefix' : 'terminal-short-page', coverageStartDate: mintCoverageStart },
          lifetimeCollections: { rows: topCollectionsLifetime.length, hardCap: 50, truncated: topCollectionsLifetime.length >= 50 },
          buyers30d: { rows: summaries.buyers.length, hardCap: 100, truncated: summaries.buyers.length >= 100 },
          artists30d: { rows: summaries.artists.length, hardCap: 100, truncated: summaries.artists.length >= 100 }
        },
        requestPacingMs: OBJKT_MIN_DISPATCH_INTERVAL_MS,
        truncated,
        notes: [
          'OBJKT indexing does not prove complete coverage of every historical or independent marketplace.',
          'When sales or mint events hit a hard cap, their aggregates cover the most-recent prefix only; daily rows identify complete, partial, and uncovered dates.',
          'Etherlink ERC-721/ERC-1155 transfers are excluded because transfers alone do not prove marketplace sales or prices.',
          'Lifetime collection volume is the OBJKT fa.volume_total field across live FA2 collections; no net-earnings claim is made.',
          'OBJKT sales_stat rank rows are deduplicated by rank with the highest volume; the provider does not publish the hidden partition behind duplicate ranks.'
        ]
      }
    },
    coverage: {
      windowDays: ART_WINDOW_DAYS,
      listingSales: sales.rows.length,
      mintEvents: mints.rows.length,
      marketplaceGroups: grouped.marketplaces.map((row) => row.id),
      truncated
    }
  };
}

function emptyArt(error) {
  return {
    windowDays: ART_WINDOW_DAYS,
    range: { from: null, to: null },
    marketplaces: [],
    dailySales: [],
    dailyMints: [],
    topCollections30d: [],
    topCollectionsLifetime: [],
    topBuyers30d: [],
    topArtists30d: [],
    coverage: { status: 'unavailable', truncated: false, error: cleanError(error) }
  };
}

async function buildDevelopment(generatedAt) {
  const until = new Date(generatedAt);
  const since = new Date(until.getTime() - 28 * DAY_MS);
  const commits = [];
  let pages = 0;
  let truncated = false;
  for (let page = 1; page <= GITLAB_MAX_PAGES; page += 1) {
    const url = new URL(`${GITLAB}/projects/tezos%2Ftezos/repository/commits`);
    url.searchParams.set('ref_name', 'master');
    url.searchParams.set('since', since.toISOString());
    url.searchParams.set('until', until.toISOString());
    url.searchParams.set('per_page', String(GITLAB_PAGE_SIZE));
    url.searchParams.set('page', String(page));
    const batch = await requestJson(url.toString());
    if (!Array.isArray(batch)) throw new Error('GitLab commit API returned an invalid page');
    pages += 1;
    commits.push(...batch);
    if (batch.length < GITLAB_PAGE_SIZE) break;
    truncated = page === GITLAB_MAX_PAGES;
  }
  const byDate = new Map();
  const allAuthors = new Set();
  for (const commit of commits) {
    const date = isoDate(commit?.committed_date || commit?.created_at);
    if (!date) continue;
    if (!byDate.has(date)) byDate.set(date, { date, commits: 0, authors: new Set() });
    const day = byDate.get(date);
    day.commits += 1;
    const author = String(commit?.author_name || '').trim();
    if (author) {
      day.authors.add(author);
      allAuthors.add(author);
    }
  }
  const daily = [...byDate.values()]
    .map((row) => ({ date: row.date, commits: row.commits, authors: row.authors.size }))
    .sort((left, right) => compareText(left.date, right.date));
  return {
    data: {
      scope: 'Commits on the canonical Octez repository master branch only; this is not all Tezos ecosystem development.',
      repository: 'https://gitlab.com/tezos/tezos',
      windowDays: 28,
      range: { from: since.toISOString(), to: until.toISOString() },
      daily,
      totals: { commits: commits.length, authors: allAuthors.size },
      coverage: {
        pages,
        pageSize: GITLAB_PAGE_SIZE,
        maxPages: GITLAB_MAX_PAGES,
        truncated,
        authorDefinition: 'Distinct author_name strings in returned commits; names are not verified developer identities.',
        commitDefinition: 'All commits returned for master, including merge and bot commits.'
      }
    },
    coverage: { windowDays: 28, commits: commits.length, authors: allAuthors.size, pages, truncated }
  };
}

function emptyDevelopment(error) {
  return {
    scope: 'Canonical Octez repository master branch only.',
    repository: 'https://gitlab.com/tezos/tezos',
    windowDays: 28,
    range: { from: null, to: null },
    daily: [],
    totals: { commits: 0, authors: 0 },
    coverage: { status: 'unavailable', error: cleanError(error), truncated: false }
  };
}

function unavailableMethodologies() {
  return [
    {
      id: 'comprehensive-cex-net-flows',
      label: 'Comprehensive centralized-exchange net flows',
      status: 'unavailable',
      methodology: 'not-calculated',
      reason: 'Public chain labels do not provide a complete, audited exchange deposit/hot/cold-wallet attribution set; internal exchange reshuffling would distort a total.',
      requirements: ['Versioned exchange wallet clusters', 'Deposit-address attribution', 'Hot/cold transfer classification', 'Historical token prices', 'Independent coverage audit'],
      sources: ['https://api.tzkt.io/', 'https://explorer.etherlink.com/']
    },
    {
      id: 'proprietary-community-composite',
      label: 'Comprehensive community, X, and podcast composite',
      status: 'unavailable',
      methodology: 'not-calculated',
      reason: 'Cross-platform social and podcast coverage requires paid or permissioned data and a disclosed deduplication/sentiment methodology; public feeds alone are not comparable to proprietary coverage.',
      requirements: ['Licensed X access', 'Podcast transcript/index license', 'Community-source permissions', 'Versioned query and deduplication rules'],
      sources: ['https://docs.x.com/x-api/posts/search/introduction']
    },
    {
      id: 'xu3o8-sruuf-return-spread',
      label: 'xU3O8 versus exact SRUUF return spread',
      status: 'unavailable',
      methodology: 'not-calculated',
      reason: 'xU3O8 history is public, but an exact commercial SRUUF daily-close series requires a licensed equity feed; an unofficial proxy would mislabel the comparison.',
      requirements: ['Licensed SRUUF adjusted daily closes', 'Corporate-action policy', 'Shared close-time and rebasing convention'],
      sources: ['https://www.alphavantage.co/documentation/', 'https://www.coingecko.com/en/coins/uranium']
    }
  ];
}

async function readExisting(file = OUTPUT_FILE) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

function isAscendingByDate(rows) {
  return (rows || []).every((row, index) => index === 0 || String(rows[index - 1]?.date) <= String(row?.date));
}

function validateSnapshot(snapshot, byteLength = null) {
  const errors = [];
  if (snapshot?.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (!Number.isFinite(Date.parse(snapshot?.generatedAt || ''))) errors.push('generatedAt must be an ISO timestamp');
  if (!/^[0-9a-f]{64}$/.test(snapshot?.contentHash || '')) errors.push('contentHash must be a SHA-256 hex digest');
  if (snapshot?.contentHash && capitalContentHash(snapshot) !== snapshot.contentHash) errors.push('contentHash does not match the stable unsigned payload');
  for (const key of ['sources', 'defi', 'network', 'markets', 'rwa', 'art', 'development']) {
    if (!snapshot?.[key] || typeof snapshot[key] !== 'object') errors.push(`${key} must be an object`);
  }
  for (const key of SOURCE_ORDER) {
    const source = snapshot?.sources?.[key];
    if (!source) {
      errors.push(`sources.${key} is missing`);
      continue;
    }
    if (!['ok', 'stale', 'unavailable'].includes(source.status)) errors.push(`sources.${key}.status is invalid`);
    if (!/^https:\/\//.test(source.url || '')) errors.push(`sources.${key}.url must be HTTPS`);
  }
  const chainIds = new Set((snapshot?.defi?.chains || []).map((chain) => chain.id));
  for (const chain of ['tezos', 'etherlink']) if (!chainIds.has(chain)) errors.push(`defi.chains is missing ${chain}`);
  if (!snapshot?.network?.tezos || !snapshot?.network?.etherlink) errors.push('network must include tezos and etherlink');
  const tezosFees = snapshot?.network?.tezos?.fees;
  if (!Array.isArray(tezosFees?.daily) || !isAscendingByDate(tezosFees.daily)) {
    errors.push('network.tezos.fees.daily must be a date-sorted array');
  } else if (tezosFees.daily.some((row) => !Number.isFinite(row.totalMutez) || !Number.isFinite(row.blockCount))) {
    errors.push('network.tezos.fees.daily must retain numeric block-fee totals and block counts');
  }
  for (const key of ['averageTransactionFee', 'transactionFees', 'averageGasPrice']) {
    const rows = snapshot?.network?.etherlink?.series?.[key];
    if (!Array.isArray(rows) || !isAscendingByDate(rows)) errors.push(`network.etherlink.series.${key} must be a date-sorted array`);
  }
  for (const currency of ['usd', 'btc', 'eth']) {
    if (!Array.isArray(snapshot?.markets?.xtz?.priceHistory?.[currency])) errors.push(`markets.xtz.priceHistory.${currency} must be an array`);
    else if (!isAscendingByDate(snapshot.markets.xtz.priceHistory[currency])) errors.push(`markets.xtz.priceHistory.${currency} is not date sorted`);
  }
  if (snapshot?.sources?.coingecko?.status !== 'unavailable') {
    try {
      validateCoinGeckoTickerCoverage(snapshot?.markets?.xtz?.tickers, snapshot?.markets?.xtz?.coverage);
    } catch (error) {
      errors.push(error.message);
    }
  }
  const xu3o8 = (snapshot?.rwa?.assets || []).find((asset) => asset.id === 'xu3o8');
  if (!xu3o8 || xu3o8.contract.toLowerCase() !== XU3O8_CONTRACT.toLowerCase() || xu3o8.decimals !== 18) {
    errors.push('rwa.assets must include the issuer-confirmed xU3O8 contract with 18 decimals');
  }
  for (const key of ['dailySales', 'dailyMints']) {
    if (!Array.isArray(snapshot?.art?.[key])) errors.push(`art.${key} must be an array`);
    else if (!isAscendingByDate(snapshot.art[key])) errors.push(`art.${key} is not date sorted`);
  }
  const unavailableIds = new Set((snapshot?.unavailable || []).map((item) => item.id));
  for (const id of ['comprehensive-cex-net-flows', 'proprietary-community-composite', 'xu3o8-sruuf-return-spread']) {
    if (!unavailableIds.has(id)) errors.push(`unavailable is missing ${id}`);
  }
  if (byteLength !== null && byteLength > MAX_OUTPUT_BYTES) errors.push(`snapshot is ${byteLength} bytes; maximum is ${MAX_OUTPUT_BYTES}`);
  return errors;
}

async function writeJsonAtomic(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await fs.rename(temporary, file);
}

async function checkSnapshot(file) {
  const text = await fs.readFile(file, 'utf8');
  const snapshot = JSON.parse(text);
  const errors = validateSnapshot(snapshot, Buffer.byteLength(text));
  if (errors.length) throw new Error(`Invalid Capital snapshot: ${errors.join('; ')}`);
  console.log(`ok - Capital snapshot schema/hash valid (${Buffer.byteLength(text)} bytes, ${snapshot.contentHash.slice(0, 12)})`);
}

async function main() {
  const file = outputFile();
  if (hasFlag('--check')) {
    await checkSnapshot(file);
    return;
  }

  const generatedAt = new Date().toISOString();
  const existing = await readExisting(file);
  const previousSources = existing?.sources || {};
  const part = (options) => attemptPart({ ...options, previousSources, checkedAt: generatedAt });

  const [defi, tezos, etherlinkCounters, etherlinkSeries, markets, xu3o8, rwaProtocols, rwaTokens, art, development] = await Promise.all([
    part({ sourceKey: 'defillama', previousData: existing?.defi, emptyData: emptyDefi, build: buildDefi }),
    part({ sourceKey: 'tzkt', previousData: existing?.network?.tezos, emptyData: emptyTezosNetwork, build: () => buildTezosNetwork(generatedAt) }),
    part({ sourceKey: 'etherlinkBlockscout', previousData: existing?.network?.etherlink?.counters, emptyData: emptyEtherlinkCounters, build: buildEtherlinkCounters }),
    part({ sourceKey: 'etherlinkStats', previousData: existing?.network?.etherlink?.series, emptyData: emptyEtherlinkSeries, build: () => buildEtherlinkSeries(generatedAt) }),
    part({ sourceKey: 'coingecko', previousData: existing?.markets?.xtz, emptyData: emptyMarkets, build: buildMarkets }),
    part({ sourceKey: 'etherlinkBlockscoutRwa', previousData: existing?.rwa?.assets?.find((asset) => asset.id === 'xu3o8'), emptyData: xu3o8Base, build: buildXu3o8 }),
    part({ sourceKey: 'defillamaRwa', previousData: existing?.rwa?.protocols, emptyData: emptyRwaProtocols, build: buildRwaProtocols }),
    part({ sourceKey: 'coingeckoRwa', previousData: existing?.rwa?.tokens, emptyData: emptyRwaTokens, build: buildRwaTokens }),
    part({ sourceKey: 'objkt', previousData: existing?.art, emptyData: emptyArt, build: () => buildArt(generatedAt) }),
    part({ sourceKey: 'gitlab', previousData: existing?.development?.octez, emptyData: emptyDevelopment, build: () => buildDevelopment(generatedAt) })
  ]);

  const receipts = {
    defillama: defi.receipt,
    tzkt: tezos.receipt,
    etherlinkBlockscout: etherlinkCounters.receipt,
    etherlinkStats: etherlinkSeries.receipt,
    coingecko: markets.receipt,
    uraniumIssuer: successfulReceipt('uraniumIssuer', generatedAt, {
      contract: XU3O8_CONTRACT,
      decimals: 18,
      proofDocuments: XU3O8_PROOFS.length,
      staticReceipt: true
    }),
    etherlinkBlockscoutRwa: xu3o8.receipt,
    defillamaRwa: rwaProtocols.receipt,
    coingeckoRwa: rwaTokens.receipt,
    objkt: art.receipt,
    gitlab: development.receipt
  };
  const sources = Object.fromEntries(SOURCE_ORDER.map((key) => [key, receipts[key]]));
  const unsigned = {
    schemaVersion: 1,
    generatedAt,
    sources,
    defi: defi.data,
    network: {
      tezos: {
        ...tezos.data,
        fees: tezos.data?.fees || emptyTezosNetwork().fees
      },
      etherlink: {
        counters: etherlinkCounters.data,
        series: {
          ...emptyEtherlinkSeries(),
          ...etherlinkSeries.data
        },
        coverage: {
          counters: etherlinkCounters.receipt.status,
          series: etherlinkSeries.receipt.status,
          note: 'L1 transaction operations and Etherlink EVM transactions remain separate because their semantics differ.'
        }
      }
    },
    markets: { xtz: markets.data },
    rwa: {
      assets: [xu3o8.data],
      protocols: rwaProtocols.data,
      tokens: rwaTokens.data,
      coverage: {
        proofbook: 'xU3O8 has issuer-confirmed contract receipts; discovered protocol/token rows are source-attributed third-party registries and do not imply issuer verification.',
        protocols: rwaProtocols.receipt.status,
        tokens: rwaTokens.receipt.status
      }
    },
    art: art.data,
    development: { octez: development.data },
    unavailable: unavailableMethodologies()
  };
  const snapshot = {
    schemaVersion: unsigned.schemaVersion,
    generatedAt: unsigned.generatedAt,
    contentHash: capitalContentHash(unsigned),
    sources: unsigned.sources,
    defi: unsigned.defi,
    network: unsigned.network,
    markets: unsigned.markets,
    rwa: unsigned.rwa,
    art: unsigned.art,
    development: unsigned.development,
    unavailable: unsigned.unavailable
  };
  const text = `${JSON.stringify(snapshot, null, 2)}\n`;
  const errors = validateSnapshot(snapshot, Buffer.byteLength(text));
  if (errors.length) throw new Error(`Generated invalid Capital snapshot: ${errors.join('; ')}`);
  await writeJsonAtomic(file, snapshot);
  console.log(`Wrote ${path.relative(ROOT, file)} (${Buffer.byteLength(text)} bytes, ${snapshot.contentHash.slice(0, 12)})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
