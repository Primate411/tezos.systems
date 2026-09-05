#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SNAPSHOT_PATH = 'data/metals-snapshot.json';
const ENTRY_PATH = 'data/metals-entry-summary.json';
const SNAPSHOT_FILE = path.join(ROOT, SNAPSHOT_PATH);
const ENTRY_FILE = path.join(ROOT, ENTRY_PATH);
const MAX_SNAPSHOT_BYTES = 768 * 1024;
const MAX_ENTRY_BYTES = 96 * 1024;
const ENTRY_HISTORY_MONTHS = 120;
const ENTRY_TOKEN_HISTORY_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

const GOLD_API = 'https://api.gold-api.com';
const IMF_WORKBOOK = 'https://www.imf.org/-/media/files/research/commodityprices/monthly/external-data.xlsx';
const COINGECKO = 'https://api.coingecko.com/api/v3';
const BLOCKSCOUT = 'https://explorer.etherlink.com';
const TZKT = 'https://api.tzkt.io/v1';
const VNXAU_ID = 'vnx-gold';
const VNXAU_ETHERLINK = '0x93f5475da60143c50e8be3fed10c143b0cf8b9e9';
const VNXAU_TEZOS = 'KT1LSH97386CURN9FgRNqdQJoHaHY6e1vxUv';
const VNXAU_AUP = 'https://vnx.li/wp-content/uploads/2026/03/VNX_Examination_on_Management_Assertions_VNXAU_31_12_2025_signiert.pdf';
const REVIEWED_AT = '2026-08-01T00:00:00.000Z';
const CATALOG_REVIEW_EXPIRES_AT = '2026-08-31T23:59:59.999Z';

const CANONICAL_METALS = Object.freeze([
  { id: 'gold', name: 'Gold', symbol: 'Au', marketSymbol: 'XAU', atomicNumber: 79 },
  { id: 'silver', name: 'Silver', symbol: 'Ag', marketSymbol: 'XAG', atomicNumber: 47 },
  { id: 'platinum', name: 'Platinum', symbol: 'Pt', marketSymbol: 'XPT', atomicNumber: 78 },
  { id: 'palladium', name: 'Palladium', symbol: 'Pd', marketSymbol: 'XPD', atomicNumber: 46 },
  { id: 'rhodium', name: 'Rhodium', symbol: 'Rh', marketSymbol: null, atomicNumber: 45 },
  { id: 'ruthenium', name: 'Ruthenium', symbol: 'Ru', marketSymbol: null, atomicNumber: 44 },
  { id: 'iridium', name: 'Iridium', symbol: 'Ir', marketSymbol: null, atomicNumber: 77 },
  { id: 'osmium', name: 'Osmium', symbol: 'Os', marketSymbol: null, atomicNumber: 76 }
]);

const GOLD_API_BOUNDS = Object.freeze({
  XAU: [100, 20_000],
  XAG: [1, 1_000],
  XPT: [100, 10_000],
  XPD: [100, 10_000]
});

const USGS_2025_ESTIMATES = Object.freeze({
  XPT: 1_200,
  XPD: 1_100,
  Rh: 5_800,
  Ru: 690,
  Ir: 4_400,
  Os: null
});

const SOURCE_DEFINITIONS = Object.freeze({
  federalTaxonomy: {
    label: 'U.S. federal precious-metals definition',
    url: 'https://www.ecfr.gov/current/title-41/subtitle-C/chapter-109/subchapter-B/part-109-27/subpart-109-27.51/section-109-27.5101',
    credit: '41 CFR 109-27.5101 definition covering gold, silver, and the six platinum-group metals',
    endpoints: [
      'https://www.ecfr.gov/current/title-41/subtitle-C/chapter-109/subchapter-B/part-109-27/subpart-109-27.51/section-109-27.5101',
      'https://www.usgs.gov/publications/mineral-resource-month-platinum-group-metals'
    ]
  },
  usgsMcs2026: {
    label: 'USGS Mineral Commodity Summaries 2026',
    url: 'https://pubs.usgs.gov/publication/mcs2026',
    credit: 'USGS-published 2025 estimated annual PGM price and industry context, retained with attribution and an underlying-input rights boundary',
    endpoints: [
      'https://pubs.usgs.gov/publication/mcs2026',
      'https://pubs.usgs.gov/periodicals/mcs2026/mcs2026.pdf'
    ]
  },
  goldApiXau: goldApiDefinition('XAU', 'Gold'),
  goldApiXag: goldApiDefinition('XAG', 'Silver'),
  goldApiXpt: goldApiDefinition('XPT', 'Platinum'),
  goldApiXpd: goldApiDefinition('XPD', 'Palladium'),
  imfPcps: {
    label: 'IMF Primary Commodity Price System',
    url: 'https://www.imf.org/en/research/commodity-prices',
    credit: 'Completed-month precious-metals averages and index, retained with the workbook source descriptions',
    endpoints: [
      IMF_WORKBOOK,
      'https://www.imf.org/-/media/Files/Research/CommodityPrices/Monthly/pcps-technical-documentation.ashx',
      'https://www.imf.org/en/about/copyright-and-terms'
    ]
  },
  metalsIo: {
    label: 'Metals.io reviewed product catalog',
    url: 'https://app.metals.io/en',
    credit: 'Reviewed product-status receipt distinguishing live, coming-soon, unlisted, and non-precious adjacent products',
    endpoints: ['https://app.metals.io/en', 'https://app.metals.io/en/VNXAU']
  },
  vnxIssuer: {
    label: 'VNX and Metals.io official VNXAU statements',
    url: 'https://metals.io/assets/gold-vnx/',
    credit: 'Reviewed issuer statements about denomination, custody, redemption, price discovery, and legacy-platform operations',
    endpoints: [
      'https://metals.io/assets/gold-vnx/',
      'https://help.metals.io/en/collections/19070195-vnx-gold-vnxau',
      'https://vnx.gitbook.io/vnx-platform/vnx-gold/token-details',
      'https://vnx.li/important-notice-upcoming-suspension-of-exchange-operations-on-the-vnx-platform/'
    ]
  },
  vnxReserveAup: {
    label: 'VNXAU agreed-upon-procedures report',
    url: VNXAU_AUP,
    credit: 'Dated AUP file receipt; not an audit, review, assurance opinion, or current Etherlink reconciliation',
    endpoints: [VNXAU_AUP]
  },
  coinGeckoVnxau: {
    label: 'CoinGecko VNX Gold market registry',
    url: 'https://www.coingecko.com/en/coins/vnx-gold',
    credit: 'VNXAU quote, daily history, platform mappings, and venue-attributed market observations',
    endpoints: [
      `${COINGECKO}/coins/${VNXAU_ID}`,
      `${COINGECKO}/coins/${VNXAU_ID}/market_chart?vs_currency=usd&days=365&interval=daily`,
      `${COINGECKO}/coins/${VNXAU_ID}/tickers`
    ]
  },
  blockscoutVnxau: {
    label: 'Etherlink Blockscout VNXAU token API',
    url: `${BLOCKSCOUT}/token/${VNXAU_ETHERLINK}`,
    credit: 'VNXAU token metadata, counters, bounded holder page, and bounded latest-transfer page',
    endpoints: [
      `${BLOCKSCOUT}/api/v2/tokens/${VNXAU_ETHERLINK}`,
      `${BLOCKSCOUT}/api/v2/tokens/${VNXAU_ETHERLINK}/counters`,
      `${BLOCKSCOUT}/api/v2/tokens/${VNXAU_ETHERLINK}/holders`,
      `${BLOCKSCOUT}/api/v2/tokens/${VNXAU_ETHERLINK}/transfers`
    ]
  },
  blockscoutContractsVnxau: {
    label: 'Etherlink Blockscout verified VNXAU contracts',
    url: `${BLOCKSCOUT}/address/${VNXAU_ETHERLINK}?tab=contract`,
    credit: 'Verified proxy lineage and implementation ABI capability names; capability does not prove invocation',
    endpoints: [`${BLOCKSCOUT}/api/v2/smart-contracts/${VNXAU_ETHERLINK}`]
  },
  tzktVnxau: {
    label: 'TzKT historical VNXAU Tezos state',
    url: `https://tzkt.io/${VNXAU_TEZOS}`,
    credit: 'Historical KT1 contract metadata, indexed token rows, and current returned big-map counts',
    endpoints: [
      `${TZKT}/contracts/${VNXAU_TEZOS}`,
      `${TZKT}/tokens?contract=${VNXAU_TEZOS}&limit=100`,
      `${TZKT}/bigmaps?contract=${VNXAU_TEZOS}&limit=100`
    ]
  }
});

const SOURCE_ORDER = Object.keys(SOURCE_DEFINITIONS);

function goldApiDefinition(symbol, name) {
  return {
    label: `Gold API ${name} indicative quote`,
    url: 'https://gold-api.com/docs',
    credit: `No-key CORS-enabled ${symbol}/USD indicative current value`,
    endpoints: [`${GOLD_API}/price/${symbol}`, 'https://gold-api.com/terms']
  };
}

function goldSourceKey(symbol) {
  return `goldApi${symbol.charAt(0).toUpperCase()}${symbol.slice(1).toLowerCase()}`;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function contentHash(value) {
  const { contentHash: ignored, ...unsigned } = value || {};
  return sha256(JSON.stringify(stableValue(unsigned)));
}

function number(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function integer(value) {
  const parsed = number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function round(value, digits = 4) {
  const parsed = number(value);
  if (parsed === null) return null;
  const scale = 10 ** digits;
  return Math.round((parsed + Number.EPSILON) * scale) / scale;
}

function iso(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function cleanError(error) {
  return String(error?.message || error || 'Unknown source error').replace(/\s+/g, ' ').slice(0, 500);
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function retryAfterMilliseconds(value) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

async function request(url, { accept = 'application/json' } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 35_000);
    let delay = Math.min(8_000, 500 * (2 ** attempt));
    try {
      const response = await fetch(url, {
        headers: {
          Accept: accept,
          'User-Agent': 'tezos.systems Metals snapshot refresher/1.0'
        },
        signal: controller.signal
      });
      if (!response.ok) {
        const parsed = new URL(url);
        const error = new Error(`${parsed.origin}${parsed.pathname} returned HTTP ${response.status}`);
        if (response.status !== 429 && response.status < 500) throw error;
        lastError = error;
        delay = Math.min(15_000, retryAfterMilliseconds(response.headers.get('retry-after')) ?? delay);
      } else {
        return response;
      }
    } catch (error) {
      lastError = error;
      if (/returned HTTP (?!429|5\d\d)/.test(error?.message || '')) throw error;
    } finally {
      clearTimeout(timer);
    }
    if (attempt < 3) await wait(delay);
  }
  throw lastError || new Error(`Unable to retrieve ${url}`);
}

async function requestJson(url) {
  return (await request(url)).json();
}

async function requestBytes(url) {
  return Buffer.from(await (await request(url, { accept: '*/*' })).arrayBuffer());
}

function sourceStatusProjection(source) {
  return {
    status: source.status,
    observedAt: source.observedAt || null,
    retrievedAt: source.retrievedAt || null,
    checkedAt: source.checkedAt,
    reviewedAt: source.reviewedAt || null,
    lastGoodAt: source.lastGoodAt || null,
    error: source.error || null
  };
}

function markStatus(data, status) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  return { ...data, status };
}

export function compositeEvidenceStatus(...statuses) {
  const normalized = statuses.filter(Boolean);
  if (!normalized.length || normalized.every((status) => status === 'unavailable')) return 'unavailable';
  if (normalized.some((status) => status === 'unavailable' || status === 'partial')) return 'partial';
  if (normalized.some((status) => status === 'stale')) return 'stale';
  return 'ok';
}

async function buildWithFallback(key, previousData, previousSource, unavailableData, builder) {
  const definition = SOURCE_DEFINITIONS[key];
  const checkedAt = new Date().toISOString();
  try {
    const built = await builder();
    const status = built.status || 'ok';
    return {
      data: markStatus(built.data, status),
      source: {
        ...definition,
        status,
        observedAt: built.observedAt || null,
        retrievedAt: checkedAt,
        checkedAt,
        reviewedAt: built.reviewedAt || null,
        lastGoodAt: checkedAt,
        error: null,
        receipt: built.receipt || null
      }
    };
  } catch (error) {
    if (previousData) {
      return {
        data: markStatus(previousData, 'stale'),
        source: {
          ...definition,
          status: 'stale',
          observedAt: previousSource?.observedAt || null,
          retrievedAt: previousSource?.retrievedAt || null,
          checkedAt,
          reviewedAt: previousSource?.reviewedAt || null,
          lastGoodAt: previousSource?.lastGoodAt || previousSource?.retrievedAt || null,
          error: cleanError(error),
          receipt: previousSource?.receipt || null
        }
      };
    }
    return {
      data: markStatus(unavailableData, 'unavailable'),
      source: {
        ...definition,
        status: 'unavailable',
        observedAt: null,
        retrievedAt: null,
        checkedAt,
        reviewedAt: null,
        lastGoodAt: null,
        error: cleanError(error),
        receipt: null
      }
    };
  }
}

function reviewedSource(key, data, { reviewedAt = REVIEWED_AT, expiresAt = CATALOG_REVIEW_EXPIRES_AT } = {}) {
  const status = Date.now() <= Date.parse(expiresAt) ? 'ok' : 'stale';
  return {
    data: markStatus(data, status),
    source: {
      ...SOURCE_DEFINITIONS[key],
      status,
      observedAt: reviewedAt,
      retrievedAt: null,
      checkedAt: reviewedAt,
      reviewedAt,
      reviewExpiresAt: expiresAt,
      lastGoodAt: reviewedAt,
      error: status === 'stale' ? `Reviewed receipt expired at ${expiresAt}` : null,
      receipt: {
        method: 'manual-reviewed-official-source-receipt',
        reviewedAt,
        reviewExpiresAt: expiresAt
      }
    }
  };
}

function emptyQuote(marketSymbol, sourceKey, reason) {
  return {
    status: 'unavailable',
    kind: 'indicative-current-quote',
    marketSymbol,
    currency: 'USD',
    unit: 'USD per troy ounce',
    priceUsdPerTroyOunce: null,
    observedAt: null,
    retrievedAt: null,
    sourceKey,
    methodology: 'No current value was accepted for this metal.',
    limitations: [reason]
  };
}

async function buildGoldApiQuote(marketSymbol, expectedName, previousQuote) {
  const payload = await requestJson(`${GOLD_API}/price/${marketSymbol}`);
  assert(payload?.symbol === marketSymbol, `Gold API returned ${payload?.symbol || 'no symbol'} for ${marketSymbol}`);
  assert(payload?.currency === 'USD', `Gold API ${marketSymbol} quote is not USD`);
  assert(String(payload?.name || '').toLowerCase() === expectedName.toLowerCase(), `Gold API ${marketSymbol} name mismatch`);
  const price = number(payload?.price);
  const observedAt = iso(payload?.updatedAt);
  const [minimum, maximum] = GOLD_API_BOUNDS[marketSymbol];
  assert(price !== null && price >= minimum && price <= maximum, `Gold API ${marketSymbol} quote is outside unit sanity bounds`);
  assert(observedAt, `Gold API ${marketSymbol} quote has no valid updatedAt clock`);
  assert(Date.parse(observedAt) <= Date.now() + (15 * 60 * 1000), `Gold API ${marketSymbol} quote is implausibly future-dated`);
  if (number(previousQuote?.priceUsdPerTroyOunce)) {
    const delta = Math.abs((price / Number(previousQuote.priceUsdPerTroyOunce)) - 1);
    assert(delta <= 0.5, `Gold API ${marketSymbol} moved more than 50% from the last-good receipt`);
  }
  const ageMs = Date.now() - Date.parse(observedAt);
  const status = ageMs > (6 * 60 * 60 * 1000) ? 'stale' : 'ok';
  const retrievedAt = new Date().toISOString();
  return {
    data: {
      status,
      kind: 'indicative-current-quote',
      marketSymbol,
      currency: 'USD',
      unit: 'USD per troy ounce',
      priceUsdPerTroyOunce: round(price, 6),
      observedAt,
      retrievedAt,
      sourceKey: goldSourceKey(marketSymbol),
      methodology: 'A current USD value returned by Gold API\'s unauthenticated price endpoint; its response does not disclose contributing venues, upstream inputs, or venue weighting.',
      limitations: [
        'Indicative provider value, not an official fixing, regulated benchmark, executable quote, bid, ask, or guaranteed spot price.',
        'Gold API provides the service as-is and does not guarantee accuracy, completeness, or reliability.',
        'Each metal keeps its own provider observation clock; values from different seconds are not treated as synchronized.'
      ]
    },
    observedAt,
    status,
    receipt: {
      responseSymbol: payload.symbol,
      responseName: payload.name,
      responseCurrency: payload.currency,
      providerUpdatedAtReadable: payload.updatedAtReadable || null
    }
  };
}

function decodeXml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([\da-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number(decimal)));
}

function readZipEntry(archive, wantedName) {
  let end = -1;
  for (let offset = archive.length - 22; offset >= Math.max(0, archive.length - 70_000); offset -= 1) {
    if (archive.readUInt32LE(offset) === 0x06054b50) {
      end = offset;
      break;
    }
  }
  assert(end >= 0, 'IMF workbook ZIP has no end-of-central-directory record');
  const entryCount = archive.readUInt16LE(end + 10);
  let cursor = archive.readUInt32LE(end + 16);
  for (let index = 0; index < entryCount; index += 1) {
    assert(archive.readUInt32LE(cursor) === 0x02014b50, 'IMF workbook central directory is malformed');
    const method = archive.readUInt16LE(cursor + 10);
    const compressedSize = archive.readUInt32LE(cursor + 20);
    const nameLength = archive.readUInt16LE(cursor + 28);
    const extraLength = archive.readUInt16LE(cursor + 30);
    const commentLength = archive.readUInt16LE(cursor + 32);
    const localOffset = archive.readUInt32LE(cursor + 42);
    const name = archive.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    if (name === wantedName) {
      assert(archive.readUInt32LE(localOffset) === 0x04034b50, `IMF workbook local header is malformed for ${wantedName}`);
      const localNameLength = archive.readUInt16LE(localOffset + 26);
      const localExtraLength = archive.readUInt16LE(localOffset + 28);
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = archive.subarray(dataOffset, dataOffset + compressedSize);
      if (method === 0) return compressed;
      if (method === 8) return inflateRawSync(compressed);
      throw new Error(`Unsupported IMF workbook ZIP compression method ${method}`);
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error(`IMF workbook is missing ${wantedName}`);
}

function parseSharedStrings(xml) {
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) => (
    [...match[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
      .map((text) => decodeXml(text[1]))
      .join('')
  ));
}

function parseSheetRows(xml, sharedStrings) {
  const rows = [];
  for (const rowMatch of xml.matchAll(/<row\b[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = {};
    for (const cellMatch of rowMatch[2].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g)) {
      const attributes = cellMatch[1] || cellMatch[3] || '';
      const body = cellMatch[2] || '';
      const column = /\br="([A-Z]+)\d+"/.exec(attributes)?.[1];
      if (!column) continue;
      const type = /\bt="([^"]+)"/.exec(attributes)?.[1];
      const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? '';
      row[column] = type === 's' ? sharedStrings[Number(raw)] : decodeXml(raw);
    }
    rows.push({ number: Number(rowMatch[1]), cells: row });
  }
  return rows;
}

function monthFromImf(value) {
  const match = /^(\d{4})M(\d{1,2})$/.exec(String(value || ''));
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return `${match[1]}-${String(month).padStart(2, '0')}`;
}

function rowCoverage(rows, key = 'month') {
  return {
    from: rows[0]?.[key] || null,
    to: rows.at(-1)?.[key] || null,
    observations: rows.length
  };
}

function subtractMonths(month, count) {
  const [year, monthNumber] = month.split('-').map(Number);
  const absolute = (year * 12) + (monthNumber - 1) - count;
  return `${Math.floor(absolute / 12)}-${String((absolute % 12) + 1).padStart(2, '0')}`;
}

function monthEndIso(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber, 0, 23, 59, 59, 999)).toISOString();
}

function performance(rows, months) {
  const latest = rows.at(-1);
  if (!latest) return null;
  const target = subtractMonths(latest.month, months);
  const from = rows.find((row) => row.month === target);
  if (!from || !from.priceUsdPerTroyOunce) return null;
  return {
    fromMonth: from.month,
    toMonth: latest.month,
    changePct: round(((latest.priceUsdPerTroyOunce / from.priceUsdPerTroyOunce) - 1) * 100, 4)
  };
}

function decorateMarketSeries(seriesId, description, rows) {
  return {
    seriesId,
    description,
    coverage: rowCoverage(rows),
    latest: rows.at(-1) || null,
    performancePct: {
      oneYear: performance(rows, 12),
      fiveYear: performance(rows, 60),
      tenYear: performance(rows, 120)
    },
    rows
  };
}

function alignedRatio(numeratorSymbol, denominatorSymbol, numeratorRows, denominatorRows) {
  const denominatorByMonth = new Map(denominatorRows.map((row) => [row.month, row.priceUsdPerTroyOunce]));
  const rows = numeratorRows.flatMap((row) => {
    const denominator = denominatorByMonth.get(row.month);
    return denominator ? [{ month: row.month, value: round(row.priceUsdPerTroyOunce / denominator, 6) }] : [];
  });
  return {
    numerator: numeratorSymbol,
    denominator: denominatorSymbol,
    alignment: 'same completed IMF month only',
    coverage: rowCoverage(rows),
    latest: rows.at(-1) || null,
    rows
  };
}

function parseImfWorkbook(bytes) {
  const sharedStrings = parseSharedStrings(readZipEntry(bytes, 'xl/sharedStrings.xml').toString('utf8'));
  const rows = parseSheetRows(readZipEntry(bytes, 'xl/worksheets/sheet1.xml').toString('utf8'), sharedStrings);
  const ids = rows.find((row) => row.number === 1)?.cells || {};
  const descriptions = rows.find((row) => row.number === 2)?.cells || {};
  const dataTypes = rows.find((row) => row.number === 3)?.cells || {};
  const frequencies = rows.find((row) => row.number === 4)?.cells || {};
  const columnById = Object.fromEntries(Object.entries(ids).map(([column, id]) => [id, column]));
  const requested = { XAU: 'PGOLD', XAG: 'PSILVER', XPD: 'PPALLA', XPT: 'PPLAT' };
  const series = {};
  for (const [symbol, seriesId] of Object.entries(requested)) {
    const column = columnById[seriesId];
    assert(column, `IMF workbook is missing ${seriesId}`);
    assert(dataTypes[column] === 'USD' && frequencies[column] === 'Monthly', `IMF ${seriesId} units/frequency changed`);
    const values = rows.slice(4).flatMap(({ cells }) => {
      const month = monthFromImf(cells.A);
      const price = number(cells[column]);
      return month && price !== null && price > 0 ? [{ month, priceUsdPerTroyOunce: round(price, 6) }] : [];
    });
    assert(values.length >= 120, `IMF ${seriesId} has fewer than 10 years of monthly observations`);
    series[symbol] = decorateMarketSeries(seriesId, descriptions[column], values);
  }
  const indexColumn = columnById.PPMETA;
  assert(indexColumn && dataTypes[indexColumn] === 'Index' && frequencies[indexColumn] === 'Monthly', 'IMF PPMETA units/frequency changed');
  const indexRows = rows.slice(4).flatMap(({ cells }) => {
    const month = monthFromImf(cells.A);
    const value = number(cells[indexColumn]);
    return month && value !== null ? [{ month, value: round(value, 6) }] : [];
  });
  const latestMonths = Object.values(series).map((item) => item.coverage.to);
  assert(new Set(latestMonths).size === 1, 'IMF precious-metal series do not share one latest completed month');
  return {
    status: 'ok',
    sourceKey: 'imfPcps',
    frequency: 'monthly completed-period averages',
    currency: 'USD',
    unit: 'USD per troy ounce',
    coverage: {
      latestCompletedMonth: latestMonths[0],
      note: 'Each series retains every positive monthly observation available in the workbook; starts differ by series.'
    },
    series,
    preciousMetalsIndex: {
      seriesId: 'PPMETA',
      description: descriptions[indexColumn],
      unit: '2016 = 100',
      coverage: rowCoverage(indexRows),
      latest: indexRows.at(-1) || null,
      rows: indexRows
    },
    alignedRatios: {
      goldSilver: alignedRatio('XAU', 'XAG', series.XAU.rows, series.XAG.rows),
      goldPlatinum: alignedRatio('XAU', 'XPT', series.XAU.rows, series.XPT.rows),
      platinumPalladium: alignedRatio('XPT', 'XPD', series.XPT.rows, series.XPD.rows)
    },
    methodology: {
      role: 'Authoritative completed-month historical and comparison backbone for this Chamber.',
      alignment: 'Cross-metal ratios use only rows where both IMF series report the same completed month.',
      currentQuoteSeparation: 'Gold API indicative values are not appended to, substituted into, or compared as if they were IMF monthly observations.',
      reuseBoundary: 'The IMF workbook is attributed here; its commodity descriptions identify underlying benchmark sources, so downstream reuse should also review IMF copyright and third-party-content terms.'
    }
  };
}

async function buildImfHistory() {
  const bytes = await requestBytes(IMF_WORKBOOK);
  assert(bytes.length > 100_000, 'IMF workbook response is implausibly small');
  const data = parseImfWorkbook(bytes);
  const latest = data.coverage.latestCompletedMonth;
  return {
    data,
    observedAt: monthEndIso(latest),
    receipt: {
      workbookSha256: sha256(bytes),
      workbookBytes: bytes.length,
      latestCompletedMonth: latest,
      observationClock: 'month label; not a retrieval or intraday market timestamp'
    }
  };
}

function decimalString(raw, decimals) {
  const value = String(raw ?? '');
  const places = integer(decimals);
  if (!/^\d+$/.test(value) || places === null || places < 0 || places > 36) return null;
  if (places === 0) return value;
  const padded = value.padStart(places + 1, '0');
  const whole = padded.slice(0, -places);
  const fraction = padded.slice(-places).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
}

function addressContext(value) {
  return {
    address: value?.hash || null,
    name: value?.name || null,
    isContract: Boolean(value?.is_contract),
    isVerifiedContract: Boolean(value?.is_verified)
  };
}

async function buildCoinGeckoVnxau() {
  const [coin, chart, tickers] = await Promise.all([
    requestJson(`${COINGECKO}/coins/${VNXAU_ID}`),
    requestJson(`${COINGECKO}/coins/${VNXAU_ID}/market_chart?vs_currency=usd&days=365&interval=daily`),
    requestJson(`${COINGECKO}/coins/${VNXAU_ID}/tickers`)
  ]);
  assert(coin?.id === VNXAU_ID && String(coin?.symbol).toLowerCase() === 'vnxau', 'CoinGecko VNXAU identity mismatch');
  assert(String(coin?.platforms?.etherlink).toLowerCase() === VNXAU_ETHERLINK, 'CoinGecko Etherlink VNXAU mapping mismatch');
  assert(coin?.platforms?.tezos === VNXAU_TEZOS, 'CoinGecko Tezos VNXAU mapping mismatch');
  const priceHistoryUsd = (chart?.prices || []).flatMap((row) => {
    const timestamp = iso(number(row?.[0]));
    const priceUsd = number(row?.[1]);
    return timestamp && priceUsd !== null ? [{ date: timestamp.slice(0, 10), timestamp, priceUsd: round(priceUsd, 6) }] : [];
  }).sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  assert(priceHistoryUsd.length >= 30, 'CoinGecko VNXAU history has fewer than 30 observations');
  const venueMappings = (tickers?.tickers || []).flatMap((ticker) => {
    const lastUsd = number(ticker?.converted_last?.usd);
    const volumeUsd = number(ticker?.converted_volume?.usd);
    const observedAt = iso(ticker?.timestamp || ticker?.last_traded_at);
    if (!ticker?.market?.identifier || lastUsd === null) return [];
    return [{
      identifier: ticker.market.identifier,
      name: ticker.market.name || null,
      base: ticker.base || null,
      target: ticker.target || null,
      lastUsd: round(lastUsd, 6),
      volumeUsd: round(volumeUsd, 2),
      observedAt,
      trustScore: ticker.trust_score || null,
      isAnomaly: Boolean(ticker.is_anomaly),
      isStale: Boolean(ticker.is_stale)
    }];
  }).sort((a, b) => (b.volumeUsd || 0) - (a.volumeUsd || 0)).slice(0, 25);
  const observedAt = iso(coin?.last_updated) || priceHistoryUsd.at(-1)?.timestamp;
  return {
    data: {
      status: 'ok',
      sourceKey: 'coinGeckoVnxau',
      coin: {
        id: coin.id,
        name: coin.name,
        symbol: String(coin.symbol).toUpperCase(),
        priceUsd: round(coin?.market_data?.current_price?.usd, 6),
        change24hPct: round(coin?.market_data?.price_change_percentage_24h, 4),
        marketCapUsd: round(coin?.market_data?.market_cap?.usd, 2),
        totalSupply: round(coin?.market_data?.total_supply, 8),
        circulatingSupply: round(coin?.market_data?.circulating_supply, 8),
        observedAt,
        platforms: Object.fromEntries(Object.entries(coin.platforms || {}).sort(([a], [b]) => a.localeCompare(b)))
      },
      priceHistoryUsd,
      venueMappings,
      boundaries: {
        mapping: 'CoinGecko platform mappings associate an asset registry row with contract strings; they do not independently prove issuer identity, custody, backing, redemption, or legal rights.',
        price: 'VNXAU market observations are token prices. They are not current physical-gold spot, an executable quote, or evidence of a formal peg.'
      }
    },
    observedAt,
    receipt: {
      historyObservations: priceHistoryUsd.length,
      venueMappings: venueMappings.length,
      requestedHistoryDays: 365
    }
  };
}

async function buildBlockscoutToken() {
  const [token, counters, holdersPayload, transfersPayload] = await Promise.all([
    requestJson(`${BLOCKSCOUT}/api/v2/tokens/${VNXAU_ETHERLINK}`),
    requestJson(`${BLOCKSCOUT}/api/v2/tokens/${VNXAU_ETHERLINK}/counters`),
    requestJson(`${BLOCKSCOUT}/api/v2/tokens/${VNXAU_ETHERLINK}/holders`),
    requestJson(`${BLOCKSCOUT}/api/v2/tokens/${VNXAU_ETHERLINK}/transfers`)
  ]);
  assert(String(token?.address_hash).toLowerCase() === VNXAU_ETHERLINK, 'Blockscout VNXAU token address mismatch');
  assert(token?.symbol === 'VNXAU' && token?.type === 'ERC-20', 'Blockscout VNXAU token identity mismatch');
  const decimals = integer(token.decimals);
  assert(decimals === 18, 'Blockscout VNXAU decimals changed');
  const exactSupply = decimalString(token.total_supply, decimals);
  assert(exactSupply, 'Blockscout VNXAU total supply is invalid');
  const topHolders = (holdersPayload?.items || []).slice(0, 50).map((holder) => ({
    ...addressContext(holder.address),
    balanceExact: decimalString(holder.value, decimals),
    balance: round(decimalString(holder.value, decimals), 8)
  }));
  const latestTransfers = (transfersPayload?.items || []).slice(0, 50).map((transfer) => ({
    transactionHash: transfer.transaction_hash || null,
    blockNumber: integer(transfer.block_number),
    logIndex: integer(transfer.log_index),
    timestamp: iso(transfer.timestamp),
    from: addressContext(transfer.from),
    to: addressContext(transfer.to),
    amountExact: decimalString(transfer?.total?.value, integer(transfer?.total?.decimals)),
    amount: round(decimalString(transfer?.total?.value, integer(transfer?.total?.decimals)), 8)
  }));
  const observedAt = new Date().toISOString();
  return {
    data: {
      status: 'ok',
      sourceKey: 'blockscoutVnxau',
      token: {
        address: token.address_hash,
        name: token.name,
        symbol: token.symbol,
        type: token.type,
        decimals,
        totalSupplyExact: exactSupply,
        totalSupply: round(exactSupply, 8),
        holdersCount: integer(token.holders_count),
        exchangeRateUsd: round(token.exchange_rate, 6),
        observedAt
      },
      counters: {
        transfersCount: integer(counters?.transfers_count),
        tokenHoldersCount: integer(counters?.token_holders_count) ?? integer(token.holders_count)
      },
      topHolders,
      latestTransfers,
      coverage: {
        topHolders: 'One bounded Blockscout page (maximum 50 rows), not a complete beneficial-owner registry.',
        latestTransfers: 'One bounded latest-transfer page (maximum 50 rows), not complete history.',
        identity: 'Addresses and optional explorer labels are address context only and are not asserted to identify a person or common owner.'
      }
    },
    observedAt,
    receipt: {
      returnedHolders: topHolders.length,
      returnedTransfers: latestTransfers.length,
      holdersNextPageAvailable: Boolean(holdersPayload?.next_page_params),
      transfersNextPageAvailable: Boolean(transfersPayload?.next_page_params)
    }
  };
}

async function buildBlockscoutContracts() {
  const proxy = await requestJson(`${BLOCKSCOUT}/api/v2/smart-contracts/${VNXAU_ETHERLINK}`);
  assert(proxy?.is_verified === true && proxy?.proxy_type, 'Blockscout VNXAU proxy is not verified/classified');
  const implementationAddress = proxy?.implementations?.[0]?.address_hash;
  assert(/^0x[0-9a-f]{40}$/i.test(implementationAddress || ''), 'Blockscout VNXAU implementation is missing');
  const implementation = await requestJson(`${BLOCKSCOUT}/api/v2/smart-contracts/${implementationAddress}`);
  assert(implementation?.is_verified === true, 'Blockscout VNXAU implementation is not verified');
  const functionNames = [...new Set((implementation?.abi || [])
    .filter((item) => item?.type === 'function' && item?.name)
    .map((item) => item.name))].sort();
  const observedAt = new Date().toISOString();
  return {
    data: {
      status: 'ok',
      sourceKey: 'blockscoutContractsVnxau',
      proxy: {
        address: VNXAU_ETHERLINK,
        name: proxy.name || null,
        isVerified: true,
        proxyType: proxy.proxy_type,
        implementationAddress
      },
      implementation: {
        address: implementationAddress,
        name: implementation.name || proxy.implementations[0]?.name || null,
        isVerified: true,
        language: implementation.language || null,
        compilerVersion: implementation.compiler_version || null,
        optimizationEnabled: Boolean(implementation.optimization_enabled),
        abiFunctionNames: functionNames
      },
      boundary: 'Verified source and ABI names establish published code lineage and declared capabilities only; they do not prove that a capability was invoked, by whom, or with what legal effect.'
    },
    observedAt,
    receipt: {
      implementationEndpoint: `${BLOCKSCOUT}/api/v2/smart-contracts/${implementationAddress}`,
      abiFunctionCount: functionNames.length
    }
  };
}

async function buildTzktHistorical() {
  const [contract, indexedTokens, bigMaps] = await Promise.all([
    requestJson(`${TZKT}/contracts/${VNXAU_TEZOS}`),
    requestJson(`${TZKT}/tokens?contract=${VNXAU_TEZOS}&limit=100`),
    requestJson(`${TZKT}/bigmaps?contract=${VNXAU_TEZOS}&limit=100`)
  ]);
  assert(contract?.address === VNXAU_TEZOS && contract?.kind === 'asset', 'TzKT VNXAU contract identity mismatch');
  assert(Array.isArray(indexedTokens) && Array.isArray(bigMaps), 'TzKT VNXAU indexed-state response shape changed');
  const tokenMetadataMap = bigMaps.find((map) => map?.active && map?.path === 'token_metadata');
  const tokenMetadata = tokenMetadataMap
    ? await requestJson(`${TZKT}/bigmaps/${tokenMetadataMap.ptr}/keys?limit=100`)
    : [];
  const ledgerMaps = bigMaps.filter((map) => map?.path === 'ledger');
  const activeLedgerKeys = ledgerMaps.filter((map) => map?.active).reduce((sum, map) => sum + (integer(map.totalKeys) || 0), 0);
  const state = indexedTokens.length === 0 && activeLedgerKeys === 0
    ? 'deployed-no-current-indexed-token-rows-or-ledger-keys'
    : 'deployed-indexed-state-present';
  const observedAt = new Date().toISOString();
  return {
    data: {
      status: 'ok',
      sourceKey: 'tzktVnxau',
      state,
      contract: {
        address: contract.address,
        alias: contract.alias || null,
        kind: contract.kind,
        tzips: contract.tzips || [],
        creatorAddress: contract?.creator?.address || null,
        firstActivityLevel: integer(contract.firstActivity),
        firstActivityAt: iso(contract.firstActivityTime),
        lastActivityLevel: integer(contract.lastActivity),
        lastActivityAt: iso(contract.lastActivityTime),
        tokensCount: integer(contract.tokensCount),
        activeTokensCount: integer(contract.activeTokensCount),
        tokenBalancesCount: integer(contract.tokenBalancesCount),
        tokenTransfersCount: integer(contract.tokenTransfersCount),
        transactionsCount: integer(contract.numTransactions),
        metadata: {
          name: contract?.metadata?.name || null,
          description: contract?.metadata?.description || null,
          version: contract?.metadata?.version || null,
          interfaces: contract?.metadata?.interfaces || []
        }
      },
      indexedTokens: indexedTokens.slice(0, 100).map((token) => ({
        tokenId: String(token.tokenId ?? token.token_id ?? ''),
        standard: token.standard || null,
        totalSupplyExact: token.totalSupply === undefined ? null : String(token.totalSupply),
        holdersCount: integer(token.holdersCount),
        transfersCount: integer(token.transfersCount)
      })),
      bigMaps: bigMaps.map((map) => ({
        pointer: integer(map.ptr),
        path: map.path || null,
        active: Boolean(map.active),
        totalKeys: integer(map.totalKeys)
      })),
      tokenMetadata: (tokenMetadata || []).slice(0, 100).map((row) => ({
        key: row.key === undefined ? null : String(row.key),
        active: Boolean(row.active),
        firstLevel: integer(row.firstLevel),
        lastLevel: integer(row.lastLevel),
        updates: integer(row.updates)
      })),
      coverage: {
        state: 'Current TzKT indexed return for the historical KT1, not proof that tokens were never issued elsewhere or that all historical state is reconstructed here.',
        identity: 'The creator and other addresses are raw chain addresses, not asserted to identify a person or beneficial owner.',
        networkSeparation: 'Tezos FA2 state is not added to, reconciled with, or treated as the same supply as Etherlink ERC-20 state.'
      }
    },
    observedAt,
    receipt: {
      indexedTokenRows: indexedTokens.length,
      returnedBigMaps: bigMaps.length,
      activeLedgerKeys,
      returnedTokenMetadataRows: tokenMetadata.length
    }
  };
}

async function buildVnxAup() {
  const bytes = await requestBytes(VNXAU_AUP);
  assert(bytes.length > 100_000 && bytes.subarray(0, 4).toString('ascii') === '%PDF', 'VNXAU AUP response is not the expected PDF');
  return {
    data: {
      status: 'ok',
      sourceKey: 'vnxReserveAup',
      reportType: 'agreed-upon procedures under ISRS 4400 (Revised)',
      isAudit: false,
      isReview: false,
      providesAssuranceOpinion: false,
      statementAsAt: '2025-12-31T23:59:59.000Z',
      reportFileMonth: '2026-03',
      scope: 'Procedures address management assertions and enumerated token/custody records only as at the statement clock.',
      coveredNetworks: ['ethereum', 'q', 'polygon', 'solana', 'base'],
      networksNotSpecificallyReconciled: ['etherlink', 'tezos'],
      etherlinkLaunchDate: '2026-03-16',
      currentEtherlinkBackingReconciliation: 'not established by this dated report',
      currentBackingRatio: null,
      distributionBoundary: 'The report states restricted-use and distribution conditions; this artifact links to and summarizes scope without republishing its tables.',
      file: {
        url: VNXAU_AUP,
        sha256: sha256(bytes),
        bytes: bytes.length
      }
    },
    observedAt: '2025-12-31T23:59:59.000Z',
    receipt: {
      fileSha256: sha256(bytes),
      fileBytes: bytes.length,
      statementAsAt: '2025-12-31T23:59:59.000Z'
    }
  };
}

function buildFederalTaxonomyReceipt() {
  return reviewedSource('federalTaxonomy', {
    definition: 'Precious metals are gold, silver, and the platinum-group metals: platinum, palladium, rhodium, iridium, ruthenium, and osmium.',
    federalCitation: '41 CFR 109-27.5101',
    usgsPgmSet: ['Pt', 'Pd', 'Rh', 'Ir', 'Ru', 'Os'],
    note: 'USGS identifies those six as the platinum-group metals; adding federal-definition gold and silver yields the canonical eight used here.'
  }, { reviewedAt: REVIEWED_AT, expiresAt: '2027-02-06T23:59:59.999Z' });
}

function buildUsgsReceipt() {
  return reviewedSource('usgsMcs2026', {
    publication: 'Mineral Commodity Summaries 2026',
    doi: '10.3133/mcs2026',
    publicationYear: 2026,
    estimateYear: 2025,
    priceUnit: 'USD per troy ounce',
    estimatedAnnualAveragePrices: {
      platinum: USGS_2025_ESTIMATES.XPT,
      palladium: USGS_2025_ESTIMATES.XPD,
      rhodium: USGS_2025_ESTIMATES.Rh,
      ruthenium: USGS_2025_ESTIMATES.Ru,
      iridium: USGS_2025_ESTIMATES.Ir,
      osmium: null
    },
    domesticMineProductionKg: { platinum: 1_800, palladium: 6_200 },
    netImportReliancePct: { platinum: 89, palladium: 57 },
    recyclingContext: 'USGS estimates about 140,000 kg of palladium and platinum were recovered globally from new and old scrap in 2025.',
    limitations: [
      'These are annual 2025 estimates published in MCS 2026, not live quotes, bids, asks, or executable prices.',
      'USGS does not publish a comparable osmium price in the cited price row, so osmium remains unavailable rather than zero or inferred.',
      'Grouped PGM industry context must not be redistributed as if it were a metal-specific estimate where the publication does not separate it.'
    ],
    rightsBoundary: 'USGS-authored portions are U.S. Government work and generally public domain; underlying attributed price inputs may retain third-party rights and source terms. Attribution is retained and downstream reuse requires its own rights review.'
  }, { reviewedAt: REVIEWED_AT, expiresAt: '2027-02-06T23:59:59.999Z' });
}

function buildMetalsIoReceipt() {
  const preciousCatalog = [
    { metal: 'gold', symbol: 'VNXAU', productStatus: 'live', sourceKey: 'metalsIo' },
    { metal: 'silver', symbol: 'xAg', productStatus: 'coming-soon', sourceKey: 'metalsIo' },
    { metal: 'platinum', symbol: null, productStatus: 'unlisted', sourceKey: 'metalsIo' },
    { metal: 'palladium', symbol: 'xPd', productStatus: 'coming-soon', sourceKey: 'metalsIo' },
    { metal: 'rhodium', symbol: null, productStatus: 'unlisted', sourceKey: 'metalsIo' },
    { metal: 'ruthenium', symbol: null, productStatus: 'unlisted', sourceKey: 'metalsIo' },
    { metal: 'iridium', symbol: null, productStatus: 'unlisted', sourceKey: 'metalsIo' },
    { metal: 'osmium', symbol: null, productStatus: 'unlisted', sourceKey: 'metalsIo' }
  ];
  return reviewedSource('metalsIo', {
    vnxau: {
      status: 'live',
      networkIssueDateShownForEtherlink: '2026-03-16',
      contract: VNXAU_ETHERLINK
    },
    preciousCatalog,
    adjacentExcludedProducts: [
      { name: 'Uranium', symbol: 'xU3O8', productStatus: 'live', exclusion: 'not a precious metal in the cited federal/USGS taxonomy' },
      { name: 'Cobalt', symbol: 'xCo', productStatus: 'live', exclusion: 'not a precious metal in the cited federal/USGS taxonomy' },
      { name: 'Nickel', symbol: 'xNi', productStatus: 'live', exclusion: 'not a precious metal in the cited federal/USGS taxonomy' },
      { name: 'Strategic Metals Basket', symbol: 'RARE', productStatus: 'live', exclusion: 'a product basket, not one of the eight elemental precious metals' },
      { name: 'Copper', symbol: 'xCu', productStatus: 'coming-soon', exclusion: 'not a precious metal in the cited federal/USGS taxonomy' }
    ],
    boundary: 'Product status is the reviewed state shown by Metals.io at the review clock; coming soon is not live, and unlisted is not inferred to be planned.'
  });
}

function buildVnxIssuerReceipt() {
  return reviewedSource('vnxIssuer', {
    product: 'VNX Gold (VNXAU)',
    denomination: {
      issuerStatement: 'One VNXAU token represents one gram of physical gold.',
      gramsPerToken: 1,
      claimType: 'issuer statement, not independently reconstructed from chain data'
    },
    ownershipAndStorage: {
      issuerStatement: 'VNX describes direct ownership of LBMA-certified gold stored in segregated high-security storage in Liechtenstein.',
      claimType: 'issuer statement; source mapping or contract verification alone does not prove this claim'
    },
    redemption: {
      issuerStatement: 'Physical redemption may be requested in multiples of one kilogram, subject to the documented process and eligibility requirements.',
      minimumGrams: 1_000,
      claimType: 'issuer statement; operational constraints and delays may apply'
    },
    priceDiscovery: {
      formalSpotPeg: false,
      issuerStatement: 'Approved trading venues serve as price-discovery venues; Metals.io says there is no formal peg to gold spot prices.',
      boundary: 'Current physical-gold indicative price and VNXAU token market price remain separate observations.'
    },
    legacyVnxPlatformNotice: {
      appliesTo: 'legacy vnx.li exchange platform operations, not a claim that the Metals.io VNXAU product is unlisted',
      exchangeOperationsSuspendedAt: 'June 30, 2026 at 18:00 CET',
      bridgingEndedAt: 'June 30, 2026 at 18:00 CET',
      withdrawalWindowEndedAt: 'July 31, 2026 at 18:00 CET',
      sourceClockLiteral: '18:00 CET',
      normalizedUtc: null,
      note: 'The issuer notice clock is preserved literally as 18:00 CET. No UTC conversion is inferred.'
    }
  });
}

function annualContextFor(metal) {
  const key = metal.marketSymbol || metal.symbol;
  const value = Object.hasOwn(USGS_2025_ESTIMATES, key) ? USGS_2025_ESTIMATES[key] : undefined;
  if (value === undefined) {
    return {
      status: 'unavailable',
      kind: 'annual-reference',
      referenceYear: 2025,
      priceUsdPerTroyOunce: null,
      unit: 'USD per troy ounce',
      basis: null,
      sourceKey: 'usgsMcs2026',
      note: 'This Chamber does not substitute another annual series for this metal in the USGS PGM table.'
    };
  }
  if (value === null) {
    return {
      status: 'unavailable',
      kind: 'annual-reference',
      referenceYear: 2025,
      priceUsdPerTroyOunce: null,
      unit: 'USD per troy ounce',
      basis: 'USGS MCS 2026 PGM price table',
      sourceKey: 'usgsMcs2026',
      note: 'USGS does not publish a comparable osmium price in the cited row; unavailable is not zero.'
    };
  }
  return {
    status: 'ok',
    kind: 'estimated-annual-average',
    referenceYear: 2025,
    priceUsdPerTroyOunce: value,
    unit: 'USD per troy ounce',
    basis: 'USGS MCS 2026 estimated 2025 annual average price',
    sourceKey: 'usgsMcs2026',
    note: 'Annual USGS-published estimate, not a current quote or executable price; underlying attributed inputs may retain source terms.'
  };
}

function unavailableHistorySummary(marketSymbol) {
  return {
    status: 'unavailable',
    sourceKey: 'imfPcps',
    seriesId: null,
    marketSymbol,
    coverage: { from: null, to: null, observations: 0 },
    latest: null,
    performancePct: { oneYear: null, fiveYear: null, tenYear: null },
    note: 'The selected IMF PCPS workbook does not provide this minor-PGM series.'
  };
}

function taxonomy(usgsData) {
  return {
    id: 'us-federal-usgs-eight-precious-metals',
    definition: 'Gold, silver, and the six platinum-group metals: platinum, palladium, rhodium, ruthenium, iridium, and osmium.',
    authorities: [
      { sourceKey: 'federalTaxonomy', citation: '41 CFR 109-27.5101', role: 'Federal eight-metal precious-metals definition' },
      { sourceKey: 'usgsMcs2026', citation: 'USGS platinum-group-metals taxonomy and MCS 2026', role: 'Six-member PGM set and annual context' }
    ],
    includedSymbols: CANONICAL_METALS.map((metal) => metal.symbol),
    includedMetals: CANONICAL_METALS.map(({ id, name, symbol, atomicNumber }) => ({ id, name, symbol, atomicNumber })),
    exclusions: [
      { id: 'uranium', symbol: 'U', productSymbol: 'xU3O8', reason: 'Not included by the cited federal/USGS precious-metals taxonomy.' },
      { id: 'nickel', symbol: 'Ni', productSymbol: 'xNi', reason: 'Not included by the cited federal/USGS precious-metals taxonomy.' },
      { id: 'cobalt', symbol: 'Co', productSymbol: 'xCo', reason: 'Not included by the cited federal/USGS precious-metals taxonomy.' },
      { id: 'copper', symbol: 'Cu', productSymbol: 'xCu', reason: 'Not included by the cited federal/USGS precious-metals taxonomy.' },
      { id: 'rare-basket', symbol: null, productSymbol: 'RARE', reason: 'A strategic-metals product basket, not an elemental precious metal.' }
    ],
    usgs2026Context: usgsData
  };
}

function assembleMetals(quotesBySymbol, marketHistory) {
  return CANONICAL_METALS.map((metal) => {
    const history = metal.marketSymbol && marketHistory?.series?.[metal.marketSymbol];
    const quote = metal.marketSymbol
      ? quotesBySymbol[metal.marketSymbol]
      : emptyQuote(null, 'usgsMcs2026', 'No accepted no-key current quote source is used for this minor PGM; an annual USGS context is shown separately when available.');
    return {
      id: metal.id,
      name: metal.name,
      symbol: metal.symbol,
      marketSymbol: metal.marketSymbol,
      atomicNumber: metal.atomicNumber,
      quote,
      annualContext: annualContextFor(metal),
      monthlyHistory: history ? {
        status: marketHistory.status,
        sourceKey: 'imfPcps',
        seriesId: history.seriesId,
        marketSymbol: metal.marketSymbol,
        coverage: history.coverage,
        latest: history.latest,
        performancePct: history.performancePct,
        note: 'Full monthly rows live once in marketHistory; this is a non-duplicating summary reference.'
      } : unavailableHistorySummary(metal.marketSymbol)
    };
  });
}

function assembleVnxau(metalsIo, issuer, reserveAup, coinGecko, blockscoutToken, blockscoutContracts, tzktHistorical) {
  return {
    identity: {
      id: VNXAU_ID,
      name: 'VNX Gold',
      symbol: 'VNXAU',
      assetDenomination: 'issuer-described one gram of gold per token',
      coinGeckoId: VNXAU_ID,
      etherlinkContract: VNXAU_ETHERLINK,
      tezosHistoricalContract: VNXAU_TEZOS,
      homepage: 'https://metals.io/assets/gold-vnx/'
    },
    issuer: {
      productStatus: metalsIo.vnxau,
      catalog: {
        preciousMetals: metalsIo.preciousCatalog,
        adjacentExcludedProducts: metalsIo.adjacentExcludedProducts,
        boundary: metalsIo.boundary
      },
      terms: issuer,
      operationalNotice: issuer.legacyVnxPlatformNotice,
      reserveAup
    },
    market: coinGecko,
    etherlink: {
      status: compositeEvidenceStatus(blockscoutToken.status, blockscoutContracts.status),
      token: blockscoutToken.token || null,
      counters: blockscoutToken.counters || null,
      topHolders: blockscoutToken.topHolders || [],
      latestTransfers: blockscoutToken.latestTransfers || [],
      coverage: blockscoutToken.coverage || null,
      contracts: blockscoutContracts
    },
    tezosHistorical: tzktHistorical,
    boundaries: {
      addressIdentity: 'A chain address, explorer label, or creator address is context, not proof of a person, beneficial owner, or common control.',
      registryMapping: 'CoinGecko and explorer mappings do not independently prove issuer identity, backing, custody, redemption, or legal rights.',
      priceSeparation: 'Current indicative gold USD/troy-ounce values, IMF completed-month averages, and VNXAU token market prices are separate observations with different units and clocks.',
      reserveScope: 'The dated 2025-12-31 AUP is not an audit or assurance opinion and does not specifically reconcile the later Etherlink deployment or historical Tezos KT1.',
      networkSupply: 'Etherlink ERC-20 and Tezos FA2 states remain separate and are never added together or treated as one reconciled supply.',
      contractCapability: 'Verified ABI capabilities are not evidence that an action occurred.',
      noExecution: 'This dataset contains evidence and source references only; it provides no order, swap, wallet, purchase, or sale action.'
    }
  };
}

function methodology() {
  return {
    clocks: {
      goldApi: 'Independent provider updatedAt per metal; retrieval time remains separate.',
      imfPcps: 'Completed calendar month label, not a live timestamp.',
      usgs: '2025 estimated annual average published in MCS 2026.',
      vnxAup: 'Statement as at 2025-12-31, distinct from PDF retrieval and Etherlink launch.',
      chain: 'API observation/retrieval clock; returned bounded pages are not full historical reconstruction.'
    },
    comparisons: {
      historicalBackbone: 'IMF PCPS completed-month rows are the only series used for historical cross-metal ratios and performance in this artifact.',
      alignment: 'Ratios use exact same-month intersections. No live Gold API value, USGS annual estimate, or VNXAU token value is spliced into IMF history.',
      quoteRole: 'Gold API supplies an indicative current overlay for XAU, XAG, XPT, and XPD only.'
    },
    unavailable: 'Missing quotes remain null and unavailable; zero and inferred substitutes are prohibited.',
    noExecution: 'No trading, order-routing, wallet, or transaction-action URL or hook is published.'
  };
}

function projectRows(series, count = ENTRY_HISTORY_MONTHS) {
  const rows = series.rows.slice(-count);
  return {
    ...series,
    completeCoverage: series.coverage,
    coverage: rowCoverage(rows),
    rows
  };
}

function projectMarketHistory(history) {
  return {
    status: history.status,
    sourceKey: history.sourceKey,
    frequency: history.frequency,
    currency: history.currency,
    unit: history.unit,
    coverage: history.coverage,
    series: Object.fromEntries(Object.entries(history.series).map(([symbol, series]) => [symbol, projectRows(series)])),
    preciousMetalsIndex: projectRows(history.preciousMetalsIndex),
    alignedRatios: Object.fromEntries(Object.entries(history.alignedRatios).map(([key, ratio]) => [key, projectRows(ratio)])),
    methodology: history.methodology
  };
}

function projectTokenHistory(rows) {
  if (!rows.length) return [];
  const latest = Date.parse(rows.at(-1).timestamp);
  const cutoff = latest - (ENTRY_TOKEN_HISTORY_DAYS * DAY_MS);
  return rows.filter((row) => Date.parse(row.timestamp) >= cutoff);
}

function buildEntry(snapshot, snapshotText) {
  const unsigned = {
    schemaVersion: 1,
    generatedAt: snapshot.generatedAt,
    source: {
      path: SNAPSHOT_PATH,
      schemaVersion: snapshot.schemaVersion,
      generatedAt: snapshot.generatedAt,
      contentHash: snapshot.contentHash,
      fileSha256: sha256(snapshotText)
    },
    taxonomy: {
      id: snapshot.taxonomy.id,
      definition: snapshot.taxonomy.definition,
      includedSymbols: snapshot.taxonomy.includedSymbols,
      exclusions: snapshot.taxonomy.exclusions
    },
    metals: snapshot.metals,
    marketHistory: projectMarketHistory(snapshot.marketHistory),
    vnxau: {
      identity: snapshot.vnxau.identity,
      productStatus: snapshot.vnxau.issuer.productStatus,
      market: {
        status: snapshot.vnxau.market.status,
        coin: snapshot.vnxau.market.coin,
        priceHistoryUsd: projectTokenHistory(snapshot.vnxau.market.priceHistoryUsd || []),
        boundaries: snapshot.vnxau.market.boundaries
      },
      etherlink: {
        status: snapshot.vnxau.etherlink.status,
        token: snapshot.vnxau.etherlink.token,
        counters: snapshot.vnxau.etherlink.counters
      },
      tezosHistorical: {
        status: snapshot.vnxau.tezosHistorical.status,
        state: snapshot.vnxau.tezosHistorical.state,
        contract: snapshot.vnxau.tezosHistorical.contract
      },
      boundaries: snapshot.vnxau.boundaries
    },
    sourceStatuses: Object.fromEntries(SOURCE_ORDER.map((key) => [key, sourceStatusProjection(snapshot.sources[key])]))
  };
  return { ...unsigned, contentHash: sha256(JSON.stringify(stableValue(unsigned))) };
}

function validIso(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) && value.includes('T');
}

function ascending(rows, key) {
  return rows.every((row, index) => index === 0 || String(rows[index - 1]?.[key]) < String(row?.[key]));
}

function forbiddenExecutionKeys(value, pathParts = []) {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap((item, index) => forbiddenExecutionKeys(item, [...pathParts, String(index)]));
  const forbidden = /^(trade|buy|sell|swap|order|wallet|execute|execution|action)Url$/i;
  return Object.entries(value).flatMap(([key, child]) => [
    ...(forbidden.test(key) ? [[...pathParts, key].join('.')] : []),
    ...forbiddenExecutionKeys(child, [...pathParts, key])
  ]);
}

function validateMarketHistory(history) {
  assert(history?.sourceKey === 'imfPcps', 'marketHistory must use IMF PCPS');
  if (history.status === 'unavailable') {
    assert(Object.keys(history.series || {}).length === 0, 'unavailable IMF history must not invent series');
    return;
  }
  assert(Object.keys(history.series || {}).join(',') === 'XAU,XAG,XPD,XPT', 'IMF series inventory/order changed');
  for (const [symbol, series] of Object.entries(history.series)) {
    assert(series.rows.length >= 120, `${symbol} history must retain at least 10 years`);
    assert(ascending(series.rows, 'month'), `${symbol} history must be strictly ascending`);
    assert(series.rows.every((row) => /^\d{4}-\d{2}$/.test(row.month) && number(row.priceUsdPerTroyOunce) > 0), `${symbol} history row invalid`);
    assert(series.coverage.from === series.rows[0].month && series.coverage.to === series.rows.at(-1).month, `${symbol} coverage mismatch`);
  }
  for (const ratio of Object.values(history.alignedRatios || {})) {
    assert(ascending(ratio.rows, 'month'), 'aligned ratio rows must be strictly ascending');
    assert(ratio.alignment === 'same completed IMF month only', 'ratio alignment disclosure missing');
  }
}

function validateSnapshot(snapshot, text) {
  assert(snapshot?.schemaVersion === 1, 'metals snapshot schemaVersion must be 1');
  assert(validIso(snapshot.generatedAt), 'metals snapshot generatedAt invalid');
  assert(snapshot.contentHash === contentHash(snapshot), 'metals snapshot contentHash mismatch');
  assert(Buffer.byteLength(text) <= MAX_SNAPSHOT_BYTES, `metals snapshot exceeds ${MAX_SNAPSHOT_BYTES} bytes`);
  assert(snapshot.taxonomy?.includedSymbols?.join(',') === 'Au,Ag,Pt,Pd,Rh,Ru,Ir,Os', 'canonical precious-metal order mismatch');
  assert(snapshot.metals?.map((metal) => metal.symbol).join(',') === 'Au,Ag,Pt,Pd,Rh,Ru,Ir,Os', 'metals row order mismatch');
  for (const excluded of ['uranium', 'nickel', 'cobalt', 'copper', 'rare-basket']) {
    assert(snapshot.taxonomy.exclusions.some((item) => item.id === excluded), `taxonomy exclusion missing ${excluded}`);
    assert(!snapshot.metals.some((metal) => metal.id === excluded), `${excluded} must not be classified as precious`);
  }
  const quoteSymbols = snapshot.metals.filter((metal) => metal.quote.priceUsdPerTroyOunce !== null).map((metal) => metal.marketSymbol);
  assert(quoteSymbols.every((symbol) => ['XAU', 'XAG', 'XPT', 'XPD'].includes(symbol)), 'only XAU/XAG/XPT/XPD may have accepted indicative current quotes');
  const osmium = snapshot.metals.find((metal) => metal.symbol === 'Os');
  assert(osmium.quote.status === 'unavailable' && osmium.annualContext.priceUsdPerTroyOunce === null, 'osmium must remain unavailable');
  for (const [symbol, expected] of Object.entries({ Pt: 1_200, Pd: 1_100, Rh: 5_800, Ru: 690, Ir: 4_400 })) {
    assert(snapshot.metals.find((metal) => metal.symbol === symbol)?.annualContext?.priceUsdPerTroyOunce === expected, `USGS ${symbol} annual estimate mismatch`);
  }
  validateMarketHistory(snapshot.marketHistory);
  assert(snapshot.vnxau?.identity?.etherlinkContract.toLowerCase() === VNXAU_ETHERLINK, 'VNXAU Etherlink identity mismatch');
  assert(snapshot.vnxau?.identity?.tezosHistoricalContract === VNXAU_TEZOS, 'VNXAU Tezos identity mismatch');
  assert(snapshot.vnxau.issuer.productStatus.status === 'live', 'Metals.io VNXAU status must be live');
  const catalog = snapshot.vnxau.issuer.catalog.preciousMetals;
  assert(catalog.find((row) => row.symbol === 'xAg')?.productStatus === 'coming-soon', 'xAg must be coming soon');
  assert(catalog.find((row) => row.symbol === 'xPd')?.productStatus === 'coming-soon', 'xPd must be coming soon');
  assert(catalog.filter((row) => ['platinum', 'rhodium', 'ruthenium', 'iridium', 'osmium'].includes(row.metal)).every((row) => row.productStatus === 'unlisted'), 'other precious-metal products must remain unlisted');
  const aup = snapshot.vnxau.issuer.reserveAup;
  assert(aup.reportType.includes('agreed-upon procedures') && !aup.isAudit && !aup.providesAssuranceOpinion, 'AUP boundary mismatch');
  assert(aup.statementAsAt === '2025-12-31T23:59:59.000Z', 'AUP statement clock mismatch');
  assert(aup.networksNotSpecificallyReconciled.includes('etherlink') && aup.networksNotSpecificallyReconciled.includes('tezos'), 'AUP later-network boundary missing');
  assert(aup.currentBackingRatio === null, 'current VNXAU backing ratio must not be inferred');
  assert(snapshot.vnxau.market.boundaries.mapping.includes('do not independently prove'), 'CoinGecko mapping boundary missing');
  assert(snapshot.vnxau.etherlink.coverage.identity.includes('not asserted to identify a person'), 'address/person boundary missing');
  assert(snapshot.vnxau.tezosHistorical.coverage.networkSeparation.includes('not added'), 'Tezos/Etherlink supply boundary missing');
  assert(Object.keys(snapshot.sources || {}).join(',') === SOURCE_ORDER.join(','), 'metals source inventory/order mismatch');
  for (const key of SOURCE_ORDER) {
    const source = snapshot.sources[key];
    assert(['ok', 'stale', 'unavailable'].includes(source?.status), `${key} source status invalid`);
    assert(validIso(source?.checkedAt), `${key} checkedAt invalid`);
  }
  assert(forbiddenExecutionKeys(snapshot).length === 0, `executable URL keys found: ${forbiddenExecutionKeys(snapshot).join(', ')}`);
}

function validateEntry(entry, text, snapshot, snapshotText) {
  assert(entry?.schemaVersion === 1, 'metals entry schemaVersion must be 1');
  assert(entry.contentHash === contentHash(entry), 'metals entry contentHash mismatch');
  assert(Buffer.byteLength(text) <= MAX_ENTRY_BYTES, `metals entry exceeds ${MAX_ENTRY_BYTES} bytes`);
  assert(entry.source.path === SNAPSHOT_PATH, 'metals entry source path mismatch');
  assert(entry.source.contentHash === snapshot.contentHash, 'metals entry source content hash mismatch');
  assert(entry.source.fileSha256 === sha256(snapshotText), 'metals entry source file SHA mismatch');
  const expected = buildEntry(snapshot, snapshotText);
  assert(JSON.stringify(entry) === JSON.stringify(expected), 'metals entry is not the exact compact projection');
  for (const series of Object.values(entry.marketHistory.series)) {
    assert(series.rows.length <= ENTRY_HISTORY_MONTHS, 'metals entry series exceeds 120 months');
  }
  assert(forbiddenExecutionKeys(entry).length === 0, 'metals entry contains executable URL keys');
}

async function readJsonIfExists(file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeArtifacts(snapshot) {
  const snapshotText = `${JSON.stringify(snapshot, null, 2)}\n`;
  validateSnapshot(snapshot, snapshotText);
  const entry = buildEntry(snapshot, snapshotText);
  const entryText = `${JSON.stringify(entry)}\n`;
  validateEntry(entry, entryText, snapshot, snapshotText);
  const snapshotTemp = `${SNAPSHOT_FILE}.tmp`;
  const entryTemp = `${ENTRY_FILE}.tmp`;
  await fs.writeFile(snapshotTemp, snapshotText);
  await fs.writeFile(entryTemp, entryText);
  await fs.rename(snapshotTemp, SNAPSHOT_FILE);
  await fs.rename(entryTemp, ENTRY_FILE);
  return { snapshotText, entryText, snapshot, entry };
}

async function refresh() {
  const previous = await readJsonIfExists(SNAPSHOT_FILE);
  const previousSources = previous?.sources || {};
  const previousQuotes = Object.fromEntries((previous?.metals || []).map((metal) => [metal.marketSymbol, metal.quote]));
  const quoteTasks = CANONICAL_METALS.filter((metal) => metal.marketSymbol).map(async (metal) => {
    const sourceKey = goldSourceKey(metal.marketSymbol);
    const unavailable = emptyQuote(metal.marketSymbol, sourceKey, 'Gold API did not return a valid current value and there is no last-good receipt.');
    const result = await buildWithFallback(
      sourceKey,
      previousQuotes[metal.marketSymbol],
      previousSources[sourceKey],
      unavailable,
      () => buildGoldApiQuote(metal.marketSymbol, metal.name, previousQuotes[metal.marketSymbol])
    );
    return [metal.marketSymbol, result];
  });
  const [quoteResults, imf, coinGecko, blockscoutToken, blockscoutContracts, tzktHistorical, reserveAup] = await Promise.all([
    Promise.all(quoteTasks),
    buildWithFallback('imfPcps', previous?.marketHistory, previousSources.imfPcps, {
      sourceKey: 'imfPcps', frequency: 'monthly completed-period averages', currency: 'USD', unit: 'USD per troy ounce',
      coverage: { latestCompletedMonth: null, note: 'unavailable' }, series: {}, preciousMetalsIndex: { rows: [] }, alignedRatios: {}, methodology: {}
    }, buildImfHistory),
    buildWithFallback('coinGeckoVnxau', previous?.vnxau?.market, previousSources.coinGeckoVnxau, {
      sourceKey: 'coinGeckoVnxau', coin: null, priceHistoryUsd: [], venueMappings: [], boundaries: {
        mapping: 'No CoinGecko mapping was accepted; mappings do not independently prove issuer identity, custody, backing, redemption, or legal rights.',
        price: 'No VNXAU token price was accepted; token price remains separate from physical gold.'
      }
    }, buildCoinGeckoVnxau),
    buildWithFallback('blockscoutVnxau', previous?.vnxau?.etherlink && {
      token: previous.vnxau.etherlink.token,
      counters: previous.vnxau.etherlink.counters,
      topHolders: previous.vnxau.etherlink.topHolders,
      latestTransfers: previous.vnxau.etherlink.latestTransfers,
      coverage: previous.vnxau.etherlink.coverage
    }, previousSources.blockscoutVnxau, { token: null, counters: null, topHolders: [], latestTransfers: [], coverage: {
      topHolders: 'unavailable', latestTransfers: 'unavailable', identity: 'Addresses are address context only and are not asserted to identify a person or beneficial owner.'
    } }, buildBlockscoutToken),
    buildWithFallback('blockscoutContractsVnxau', previous?.vnxau?.etherlink?.contracts, previousSources.blockscoutContractsVnxau, {
      proxy: null, implementation: null, boundary: 'Verified contract receipt unavailable.'
    }, buildBlockscoutContracts),
    buildWithFallback('tzktVnxau', previous?.vnxau?.tezosHistorical, previousSources.tzktVnxau, {
      state: 'unavailable', contract: null, indexedTokens: [], bigMaps: [], tokenMetadata: [], coverage: {
        state: 'TzKT state unavailable.', identity: 'Addresses are not people.', networkSeparation: 'Tezos and Etherlink supplies are not added.'
      }
    }, buildTzktHistorical),
    buildWithFallback('vnxReserveAup', previous?.vnxau?.issuer?.reserveAup, previousSources.vnxReserveAup, {
      reportType: 'agreed-upon procedures', isAudit: false, isReview: false, providesAssuranceOpinion: false,
      statementAsAt: '2025-12-31T23:59:59.000Z', coveredNetworks: [], networksNotSpecificallyReconciled: ['etherlink', 'tezos'],
      currentBackingRatio: null, file: null
    }, buildVnxAup)
  ]);

  const federal = buildFederalTaxonomyReceipt();
  const usgs = buildUsgsReceipt();
  const metalsIo = buildMetalsIoReceipt();
  const vnxIssuer = buildVnxIssuerReceipt();
  const quoteMap = Object.fromEntries(quoteResults.map(([symbol, result]) => [symbol, result.data]));
  const quoteSources = Object.fromEntries(quoteResults.map(([symbol, result]) => {
    const key = goldSourceKey(symbol);
    return [key, result.source];
  }));
  const sourcesByKey = {
    federalTaxonomy: federal.source,
    usgsMcs2026: usgs.source,
    ...quoteSources,
    imfPcps: imf.source,
    metalsIo: metalsIo.source,
    vnxIssuer: vnxIssuer.source,
    vnxReserveAup: reserveAup.source,
    coinGeckoVnxau: coinGecko.source,
    blockscoutVnxau: blockscoutToken.source,
    blockscoutContractsVnxau: blockscoutContracts.source,
    tzktVnxau: tzktHistorical.source
  };
  const generatedAt = new Date().toISOString();
  const unsigned = {
    schemaVersion: 1,
    generatedAt,
    identity: {
      id: 'precious-metals',
      name: 'Precious Metals Chamber',
      route: '/metals/',
      unit: 'USD per troy ounce where a source explicitly supplies that unit',
      scope: 'The canonical eight metals in the cited U.S. federal definition, corroborated by the USGS six-member PGM taxonomy.'
    },
    taxonomy: taxonomy(usgs.data),
    metals: assembleMetals(quoteMap, imf.data),
    marketHistory: imf.data,
    vnxau: assembleVnxau(metalsIo.data, vnxIssuer.data, reserveAup.data, coinGecko.data, blockscoutToken.data, blockscoutContracts.data, tzktHistorical.data),
    methodology: methodology(),
    sources: Object.fromEntries(SOURCE_ORDER.map((key) => [key, sourcesByKey[key]]))
  };
  const snapshot = { ...unsigned, contentHash: sha256(JSON.stringify(stableValue(unsigned))) };
  const result = await writeArtifacts(snapshot);
  process.stdout.write(`ok - Metals snapshot and entry summary refreshed (${Buffer.byteLength(result.snapshotText)} + ${Buffer.byteLength(result.entryText)} bytes, ${snapshot.contentHash.slice(0, 12)})\n`);
}

async function check() {
  const [snapshotText, entryText] = await Promise.all([
    fs.readFile(SNAPSHOT_FILE, 'utf8'),
    fs.readFile(ENTRY_FILE, 'utf8')
  ]);
  const snapshot = JSON.parse(snapshotText);
  const entry = JSON.parse(entryText);
  validateSnapshot(snapshot, snapshotText);
  validateEntry(entry, entryText, snapshot, snapshotText);
  process.stdout.write(`ok - Metals snapshot and entry summary valid (${Buffer.byteLength(snapshotText)} + ${Buffer.byteLength(entryText)} bytes, ${snapshot.contentHash.slice(0, 12)})\n`);
}

const isDirectRun = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  try {
    if (hasFlag('--check')) await check();
    else await refresh();
  } catch (error) {
    process.stderr.write(`error - ${cleanError(error)}\n`);
    process.exitCode = 1;
  }
}
