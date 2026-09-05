#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SNAPSHOT_PATH = 'data/minerals-snapshot.json';
const ENTRY_PATH = 'data/minerals-entry-summary.json';
const SNAPSHOT_FILE = path.join(ROOT, SNAPSHOT_PATH);
const ENTRY_FILE = path.join(ROOT, ENTRY_PATH);
// The complete room deliberately retains every selected USGS observation's
// source coordinates, notes, and raw qualifier. It loads only after an
// explicit Chamber open; the launcher stays within its separate 96 KiB cap.
const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024;
const MAX_ENTRY_BYTES = 96 * 1024;
const REPORTING_YEAR = 2025;

const USGS_ITEM = 'https://www.sciencebase.gov/catalog/item/69837e43b66b01367d7ec7c7?format=json';
const USGS_PUBLICATION = 'https://pubs.usgs.gov/publication/mcs2026';
const USGS_LIST = 'https://www.usgs.gov/programs/mineral-resources-program/science/about-2025-list-critical-minerals';
const FEDERAL_LIST = 'https://www.federalregister.gov/documents/2025/11/07/2025-19813/final-2025-list-of-critical-minerals';
const WORLD_BANK_WORKBOOK = 'https://thedocs.worldbank.org/en/doc/74e8be41ceb20fa0da750cda2f6b9e4e-0050012026/related/CMO-Historical-Data-Monthly.xlsx';
const WORLD_BANK_PAGE = 'https://thedocs.worldbank.org/en/doc/74e8be41ceb20fa0da750cda2f6b9e4e-0050012026/world-bank-commodities-price-data-the-pink-sheet';
const BLOCKSCOUT = 'https://explorer.etherlink.com';
const REVIEWED_AT = '2026-08-01T00:00:00.000Z';
const REVIEW_EXPIRES_AT = '2026-08-31T23:59:59.999Z';

const TOKEN_PRODUCTS = Object.freeze({
  xCo: {
    name: 'xCo',
    symbol: 'xCo',
    address: '0x21a92d78F18268AdadA1227E1F1134C6C32DbD67',
    commodityIds: ['cobalt'],
    sourceKey: 'blockscoutXco'
  },
  xNi: {
    name: 'xNi',
    symbol: 'xNi',
    address: '0x8190b536B30F519D10891eCBd96AbC52E2e70638',
    commodityIds: ['nickel'],
    sourceKey: 'blockscoutXni'
  },
  RARE: {
    name: 'Strategic Metals Basket',
    symbol: 'RARE',
    address: '0x6Ce393fF9Ed5465CC4DEf456B8401e03cEF64d5e',
    commodityIds: ['hafnium', 'rhenium', 'indium', 'neodymium', 'praseodymium'],
    sourceKey: 'blockscoutRare'
  }
});

const MINERALS = Object.freeze([
  mineral('aluminum', 'Aluminum', 'Al', 'Aluminum', { worldBankSeries: 'aluminum' }),
  mineral('antimony', 'Antimony', 'Sb', 'Antimony'),
  mineral('arsenic', 'Arsenic', 'As', 'Arsenic'),
  mineral('barite', 'Barite', 'BaSO₄', 'Barite'),
  mineral('beryllium', 'Beryllium', 'Be', 'Beryllium'),
  mineral('bismuth', 'Bismuth', 'Bi', 'Bismuth'),
  mineral('boron', 'Boron', 'B', 'Boron', {
    suppressProduction: true,
    mcsCoverageNote: 'USGS publishes incompatible boron product-form rows and an XX world total; no single production context is promoted.'
  }),
  mineral('cerium', 'Cerium', 'Ce', 'Cerium', { isRareEarth: true }),
  mineral('cesium', 'Cesium', 'Cs', 'Cesium'),
  mineral('chromium', 'Chromium', 'Cr', 'Chromium'),
  mineral('cobalt', 'Cobalt', 'Co', 'Cobalt', { tokenProducts: ['xCo'] }),
  mineral('copper', 'Copper', 'Cu', 'Copper', { worldBankSeries: 'copper' }),
  mineral('dysprosium', 'Dysprosium', 'Dy', 'Dysprosium', { isRareEarth: true }),
  mineral('erbium', 'Erbium', 'Er', 'Erbium', { isRareEarth: true }),
  mineral('europium', 'Europium', 'Eu', 'Europium', { isRareEarth: true }),
  mineral('fluorspar', 'Fluorspar', 'CaF₂', 'Fluorspar'),
  mineral('gadolinium', 'Gadolinium', 'Gd', 'Gadolinium', { isRareEarth: true }),
  mineral('gallium', 'Gallium', 'Ga', 'Gallium'),
  mineral('germanium', 'Germanium', 'Ge', 'Germanium'),
  mineral('graphite', 'Graphite', 'C', 'Graphite (Natural)'),
  mineral('hafnium', 'Hafnium', 'Hf', 'Hafnium', { tokenProducts: ['RARE'] }),
  mineral('holmium', 'Holmium', 'Ho', 'Holmium', { isRareEarth: true }),
  mineral('indium', 'Indium', 'In', 'Indium', { tokenProducts: ['RARE'] }),
  mineral('iridium', 'Iridium', 'Ir', 'Iridium'),
  mineral('lanthanum', 'Lanthanum', 'La', 'Lanthanum', { isRareEarth: true }),
  mineral('lead', 'Lead', 'Pb', 'Lead', { worldBankSeries: 'lead' }),
  mineral('lithium', 'Lithium', 'Li', 'Lithium'),
  mineral('lutetium', 'Lutetium', 'Lu', 'Lutetium', { isRareEarth: true }),
  mineral('magnesium', 'Magnesium', 'Mg', 'Magnesium Metal'),
  mineral('manganese', 'Manganese', 'Mn', 'Manganese'),
  mineral('metallurgical-coal', 'Metallurgical Coal', 'Met coal', null, {
    mcsCoverageNote: 'The USGS MCS 2026 nonfuel data release does not publish a metallurgical-coal commodity chapter.'
  }),
  mineral('neodymium', 'Neodymium', 'Nd', 'Neodymium', { isRareEarth: true, tokenProducts: ['RARE'] }),
  mineral('nickel', 'Nickel', 'Ni', 'Nickel', { worldBankSeries: 'nickel', tokenProducts: ['xNi'] }),
  mineral('niobium', 'Niobium', 'Nb', 'Niobium (Columbium)'),
  mineral('palladium', 'Palladium', 'Pd', 'Palladium'),
  mineral('phosphate', 'Phosphate', 'P', 'Phosphate Rock', { worldBankSeries: 'phosphate' }),
  mineral('platinum', 'Platinum', 'Pt', 'Platinum', { worldBankSeries: 'platinum' }),
  mineral('potash', 'Potash', 'K', 'Potash', { worldBankSeries: 'potash' }),
  mineral('praseodymium', 'Praseodymium', 'Pr', 'Praseodymium', { isRareEarth: true, tokenProducts: ['RARE'] }),
  mineral('rhenium', 'Rhenium', 'Re', 'Rhenium', { tokenProducts: ['RARE'] }),
  mineral('rhodium', 'Rhodium', 'Rh', 'Rhodium'),
  mineral('rubidium', 'Rubidium', 'Rb', 'Rubidium'),
  mineral('ruthenium', 'Ruthenium', 'Ru', 'Ruthenium'),
  mineral('samarium', 'Samarium', 'Sm', 'Samarium', { isRareEarth: true }),
  mineral('scandium', 'Scandium', 'Sc', 'Scandium'),
  mineral('silicon', 'Silicon', 'Si', 'Silicon'),
  mineral('silver', 'Silver', 'Ag', 'Silver', { worldBankSeries: 'silver' }),
  mineral('tantalum', 'Tantalum', 'Ta', 'Tantalum'),
  mineral('tellurium', 'Tellurium', 'Te', 'Tellurium'),
  mineral('terbium', 'Terbium', 'Tb', 'Terbium', { isRareEarth: true }),
  mineral('thulium', 'Thulium', 'Tm', 'Thulium', { isRareEarth: true }),
  mineral('tin', 'Tin', 'Sn', 'Tin', { worldBankSeries: 'tin' }),
  mineral('titanium', 'Titanium', 'Ti', 'Titanium Sponge Metal', {
    mcsCoverageNote: 'The selected row is titanium sponge metal. Mineral concentrates and TiO2 pigment remain separate USGS forms and are not combined.'
  }),
  mineral('tungsten', 'Tungsten', 'W', 'Tungsten'),
  mineral('uranium', 'Uranium', 'U', null, {
    mcsCoverageNote: 'The USGS MCS 2026 nonfuel data release does not publish uranium. Uranium has its own receipt-bounded Chamber.'
  }),
  mineral('vanadium', 'Vanadium', 'V', 'Vanadium'),
  mineral('ytterbium', 'Ytterbium', 'Yb', 'Ytterbium', { isRareEarth: true }),
  mineral('yttrium', 'Yttrium', 'Y', 'Yttrium', { isRareEarth: true }),
  mineral('zinc', 'Zinc', 'Zn', 'Zinc', { worldBankSeries: 'zinc' }),
  mineral('zirconium', 'Zirconium', 'Zr', 'Zirconium')
]);

const WORLD_BANK_SERIES = Object.freeze({
  phosphate: wbSeries('Phosphate rock', 'Phosphate rock', 'USD per metric ton', 'World Bank North Africa phosphate-rock reference.'),
  potash: wbSeries('Potassium chloride **', 'Potash (potassium chloride)', 'USD per metric ton', 'World Bank granular muriate-of-potash spot reference, CFR Brazil.'),
  aluminum: wbSeries('Aluminum', 'Aluminum', 'USD per metric ton', 'World Bank LME unalloyed primary aluminum reference.'),
  copper: wbSeries('Copper', 'Copper', 'USD per metric ton', 'World Bank LME grade A copper reference.'),
  lead: wbSeries('Lead', 'Lead', 'USD per metric ton', 'World Bank LME refined lead reference.'),
  tin: wbSeries('Tin', 'Tin', 'USD per metric ton', 'World Bank LME refined tin reference.'),
  nickel: wbSeries('Nickel', 'Nickel', 'USD per metric ton', 'World Bank LME high-grade nickel reference.'),
  zinc: wbSeries('Zinc', 'Zinc', 'USD per metric ton', 'World Bank LME refined zinc reference.'),
  platinum: wbSeries('Platinum', 'Platinum', 'USD per troy ounce', 'World Bank platinum spot-average reference.'),
  silver: wbSeries('Silver', 'Silver', 'USD per troy ounce', 'World Bank silver reference; retained in its source-native troy-ounce unit.')
});

const SOURCE_DEFINITIONS = Object.freeze({
  usgsCriticalList: {
    label: 'Final 2025 U.S. List of Critical Minerals',
    url: USGS_LIST,
    credit: 'USGS and the Federal Register; a U.S. policy list of 60 supply chains, not a permanent or universal mineral taxonomy.',
    endpoints: [USGS_LIST, FEDERAL_LIST]
  },
  usgsMcs2026: {
    label: 'USGS Mineral Commodity Summaries 2026 data release',
    url: USGS_PUBLICATION,
    credit: 'Public-domain USGS 2021–2025 salient U.S. and world statistics, kept in source-native forms and units.',
    endpoints: [USGS_ITEM, USGS_PUBLICATION]
  },
  worldBankPinkSheet: {
    label: 'World Bank Commodities Price Data (Pink Sheet)',
    url: WORLD_BANK_PAGE,
    credit: 'Monthly nominal-USD reference series for the covered subset; provider descriptions and underlying-input rights remain attached.',
    endpoints: [WORLD_BANK_PAGE, WORLD_BANK_WORKBOOK]
  },
  metalsIoCatalog: {
    label: 'Metals.io reviewed product catalog',
    url: 'https://app.metals.io/en',
    credit: 'Dated product-status receipt. Live, coming-soon, and adjacent dedicated-room products remain distinct.',
    endpoints: ['https://metals.io/', 'https://app.metals.io/en']
  },
  metalsIoProducts: {
    label: 'Metals.io product statements',
    url: 'https://metals.io/assets/strategic-metals-basket/',
    credit: 'Attributed issuer/platform claims for xCo, xNi, and RARE; not independent proof of current backing, custody, price, liquidity, or redemption.',
    endpoints: [
      'https://metals.io/assets/cobalt/',
      'https://metals.io/assets/nickel/',
      'https://metals.io/assets/strategic-metals-basket/',
      'https://help.metals.io/en/articles/14129067-what-are-the-metals-in-the-strategic-metals-basket'
    ]
  },
  blockscoutXco: blockscoutDefinition(TOKEN_PRODUCTS.xCo),
  blockscoutXni: blockscoutDefinition(TOKEN_PRODUCTS.xNi),
  blockscoutRare: blockscoutDefinition(TOKEN_PRODUCTS.RARE)
});

const SOURCE_ORDER = Object.keys(SOURCE_DEFINITIONS);

function mineral(id, name, symbol, mcsCommodity, extra = {}) {
  return {
    id,
    name,
    symbol,
    mcsCommodity,
    mcsCoverageNote: extra.mcsCoverageNote || null,
    suppressProduction: Boolean(extra.suppressProduction),
    isRareEarth: Boolean(extra.isRareEarth),
    worldBankSeries: extra.worldBankSeries || null,
    tokenProducts: extra.tokenProducts || []
  };
}

function wbSeries(workbookName, name, unit, description) {
  return { workbookName, name, unit, description };
}

function blockscoutDefinition(product) {
  return {
    label: `Etherlink Blockscout ${product.symbol} token receipt`,
    url: `${BLOCKSCOUT}/token/${product.address}`,
    credit: 'Current token metadata, counters, bounded holder-address and latest-transfer pages, plus verified proxy lineage; addresses are not people.',
    endpoints: [
      `${BLOCKSCOUT}/api/v2/tokens/${product.address}`,
      `${BLOCKSCOUT}/api/v2/tokens/${product.address}/counters`,
      `${BLOCKSCOUT}/api/v2/tokens/${product.address}/holders`,
      `${BLOCKSCOUT}/api/v2/tokens/${product.address}/transfers`,
      `${BLOCKSCOUT}/api/v2/smart-contracts/${product.address}`
    ]
  };
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
  const parsed = Number(String(value).replace(/,/g, ''));
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
          'User-Agent': 'tezos.systems Critical Minerals snapshot refresher/1.0'
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
  throw lastError || new Error(`Request failed: ${url}`);
}

async function requestJson(url) {
  return (await request(url)).json();
}

async function requestBytes(url) {
  return Buffer.from(await (await request(url, { accept: '*/*' })).arrayBuffer());
}

function sourceBase(key) {
  const definition = SOURCE_DEFINITIONS[key];
  assert(definition, `Unknown source ${key}`);
  return {
    label: definition.label,
    url: definition.url,
    credit: definition.credit,
    endpoints: definition.endpoints
  };
}

function reviewedSource(key, receipt, { reviewedAt = REVIEWED_AT, expiresAt = REVIEW_EXPIRES_AT } = {}) {
  return {
    ...sourceBase(key),
    status: Date.now() <= Date.parse(expiresAt) ? 'ok' : 'stale',
    observedAt: reviewedAt,
    retrievedAt: null,
    reviewedAt,
    expiresAt,
    error: null,
    receipt
  };
}

async function attemptSource(key, builder, previousData, previousSource) {
  const attemptAt = new Date().toISOString();
  try {
    const result = await builder();
    return {
      data: result.data,
      source: {
        ...sourceBase(key),
        status: 'ok',
        observedAt: result.observedAt || attemptAt,
        retrievedAt: result.retrievedAt || attemptAt,
        reviewedAt: null,
        expiresAt: null,
        error: null,
        receipt: result.receipt || {}
      }
    };
  } catch (error) {
    if (previousData) {
      return {
        data: previousData,
        source: {
          ...sourceBase(key),
          status: 'stale',
          observedAt: previousSource?.observedAt || null,
          retrievedAt: previousSource?.retrievedAt || null,
          reviewedAt: previousSource?.reviewedAt || null,
          expiresAt: previousSource?.expiresAt || null,
          lastAttemptAt: attemptAt,
          error: cleanError(error),
          receipt: previousSource?.receipt || {}
        }
      };
    }
    return {
      data: null,
      source: {
        ...sourceBase(key),
        status: 'unavailable',
        observedAt: null,
        retrievedAt: null,
        reviewedAt: null,
        expiresAt: null,
        lastAttemptAt: attemptAt,
        error: cleanError(error),
        receipt: {}
      }
    };
  }
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows;
}

function parseMcsNumber(rawValue) {
  const raw = String(rawValue ?? '').trim();
  if (!raw) return { value: null, qualifier: 'missing', comparable: false };
  if (raw === '—') return { value: 0, qualifier: 'reported zero', comparable: true };
  const comparable = /^([<>])?\s*(-?[\d,.]+)$/.exec(raw);
  if (comparable) {
    return {
      value: number(comparable[2]),
      qualifier: comparable[1] === '>' ? 'greater than' : comparable[1] === '<' ? 'less than' : 'exact or rounded estimate',
      comparable: !comparable[1]
    };
  }
  if (/^-?[\d,.]+\s*[–-]\s*-?[\d,.]+$/.test(raw)) {
    return { value: null, qualifier: 'reported range', comparable: false };
  }
  const code = {
    E: 'net exporter',
    NA: 'not available',
    W: 'withheld',
    s: 'less than one-half unit',
    XX: 'total cannot be calculated consistently'
  }[raw];
  return { value: null, qualifier: code || 'non-numeric source code', comparable: false };
}

function mcsRow(row, index) {
  return {
    chapter: row[index['MCS chapter']] || '',
    section: row[index.Section] || '',
    commodity: row[index.Commodity] || '',
    country: row[index.Country] || '',
    statistic: row[index.Statistics] || '',
    detail: row[index.Statistics_detail] || '',
    unit: row[index.Unit] || '',
    year: row[index.Year] || '',
    rawValue: row[index.Value] || '',
    notes: row[index.Notes] || '',
    critical: row[index['Is critical mineral 2025']] || '',
    otherNotes: row[index['Other notes']] || ''
  };
}

function comparableMcsValue(row) {
  const parsed = parseMcsNumber(row.rawValue);
  return {
    chapter: row.chapter,
    commodity: row.commodity,
    section: row.section,
    country: row.country,
    statistic: row.statistic,
    year: row.year,
    value: parsed.value,
    rawValue: row.rawValue,
    qualifier: parsed.qualifier,
    comparable: parsed.comparable,
    unit: row.unit,
    detail: row.detail,
    notes: row.notes || null,
    otherNotes: row.otherNotes || null
  };
}

function currentPriceRows(rows) {
  return rows
    .filter((row) => row.year === String(REPORTING_YEAR)
      && row.country === 'United States'
      && row.statistic === 'Price')
    .map(comparableMcsValue);
}

function currentRelianceRows(rows) {
  return rows
    .filter((row) => row.year === String(REPORTING_YEAR)
      && row.country === 'United States'
      && row.statistic === 'Net import reliance')
    .map(comparableMcsValue);
}

function annualSeries(rows, statistic) {
  const groups = new Map();
  for (const row of rows.filter((candidate) => (
    candidate.country === 'United States'
      && candidate.statistic === statistic
      && /^202[1-5]$/.test(candidate.year)
  ))) {
    const key = `${row.detail}\u0000${row.unit}`;
    if (!groups.has(key)) groups.set(key, { detail: row.detail, unit: row.unit, rows: [] });
    groups.get(key).rows.push(comparableMcsValue(row));
  }
  return [...groups.values()].map((group) => ({
    ...group,
    rows: group.rows.sort((left, right) => left.year.localeCompare(right.year))
  }));
}

function productionDetailKey(detail) {
  return String(detail || '').replace(/[, :]\s*rounded$/i, '').trim().toLowerCase();
}

function productionContext(rows, { suppress = false } = {}) {
  if (suppress) return null;
  const candidates = rows.filter((row) => (
    row.year === String(REPORTING_YEAR)
      && /world/i.test(row.section)
      && row.statistic === 'Production'
  ));
  const groups = new Map();
  for (const row of candidates) {
    const key = productionDetailKey(row.detail);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const scored = [...groups.entries()].map(([detail, groupRows]) => {
    const numericCountries = groupRows.filter((row) => (
      parseMcsNumber(row.rawValue).comparable
        && parseMcsNumber(row.rawValue).value !== null
        && !/^World total$/i.test(row.country)
    )).length;
    const semantic = /mine production/i.test(detail) ? 50
      : /smelter production/i.test(detail) ? 40
        : /primary production/i.test(detail) ? 30
          : /production/i.test(detail) ? 20 : 0;
    return { detail, rows: groupRows, score: semantic + numericCountries };
  }).sort((left, right) => right.score - left.score);
  const selected = scored[0];
  if (!selected) return null;
  const compatibleRows = candidates.filter((row) => productionDetailKey(row.detail) === selected.detail);
  const worldRow = compatibleRows.find((row) => /^World total$/i.test(row.country));
  const worldParsed = parseMcsNumber(worldRow?.rawValue);
  const producers = compatibleRows.flatMap((row) => {
    if (/^(World total|Other countries)$/i.test(row.country)) return [];
    const parsed = parseMcsNumber(row.rawValue);
    if (parsed.value === null || parsed.value < 0 || !parsed.comparable) return [];
    return [{
      country: row.country,
      value: parsed.value,
      rawValue: row.rawValue,
      sharePct: worldParsed.comparable && worldParsed.value && parsed.value >= 0
        ? round((parsed.value / worldParsed.value) * 100, 3)
        : null
    }];
  }).sort((left, right) => right.value - left.value);
  if (!producers.length && worldParsed.value === null) return null;
  return {
    chapter: compatibleRows[0]?.chapter || null,
    commodity: compatibleRows[0]?.commodity || null,
    section: compatibleRows[0]?.section || null,
    statistic: compatibleRows[0]?.statistic || 'Production',
    year: REPORTING_YEAR,
    detail: compatibleRows.find((row) => !/rounded\s*$/i.test(row.detail))?.detail || selected.detail,
    unit: compatibleRows.find((row) => row.unit)?.unit || null,
    worldTotal: worldParsed.value,
    worldTotalRaw: worldRow?.rawValue || null,
    leader: producers[0] || null,
    topProducers: producers.slice(0, 5),
    limitations: [
      'Country rows follow the source commodity form and unit exactly.',
      'Other countries is excluded from the named-producer ranking.',
      'A producer share is derived only when the same source table supplies a compatible world total.'
    ]
  };
}

function importSourceContext(rows) {
  const candidates = rows.filter((row) => row.section === 'Import Sources' && row.unit === 'percent');
  const groups = new Map();
  for (const row of candidates) {
    if (!groups.has(row.detail)) groups.set(row.detail, []);
    groups.get(row.detail).push(row);
  }
  const mappedGroups = [...groups.entries()].map(([detail, groupRows]) => ({
    chapter: groupRows[0]?.chapter || null,
    commodity: groupRows[0]?.commodity || null,
    section: groupRows[0]?.section || null,
    statistic: groupRows[0]?.statistic || null,
    unit: groupRows[0]?.unit || null,
    detail,
    period: groupRows[0]?.year || null,
    rows: groupRows.map((row) => {
      const parsed = parseMcsNumber(row.rawValue);
      return {
        country: row.country,
        valuePct: parsed.comparable ? parsed.value : null,
        rawValue: row.rawValue,
        qualifier: parsed.qualifier,
        comparable: parsed.comparable,
        notes: row.notes || null,
        otherNotes: row.otherNotes || null
      };
    })
  })).filter((group) => group.rows.length);
  const selected = mappedGroups.find((group) => /^All$/i.test(group.detail))
    || (mappedGroups.length === 1 ? mappedGroups[0] : null);
  return {
    importSourceDetail: selected?.detail || null,
    importSourcePeriod: selected?.period || null,
    importSources: selected?.rows || [],
    importSourceGroups: mappedGroups,
    selectionNote: selected
      ? 'One source-native import category is displayed without combining categories.'
      : mappedGroups.length > 1
        ? 'Multiple source-native import categories exist; no single category is promoted as the commodity-wide mix.'
        : 'No import-source percentage table is available.'
  };
}

function annualMineral(mineralDefinition, allRows) {
  if (!mineralDefinition.mcsCommodity) {
    return {
      mcsCommodity: null,
      coverageNote: mineralDefinition.mcsCoverageNote,
      price: null,
      priceVariants: [],
      priceSeries: [],
      netImportReliance: null,
      netImportRelianceVariants: [],
      netImportRelianceSeries: [],
      production: null,
      importSourceDetail: null,
      importSourcePeriod: null,
      importSources: [],
      importSourceGroups: []
    };
  }
  const rows = allRows.filter((row) => row.commodity === mineralDefinition.mcsCommodity);
  const prices = currentPriceRows(rows);
  const reliance = currentRelianceRows(rows);
  const imports = importSourceContext(rows);
  const formSplit = mineralDefinition.id === 'silicon' || mineralDefinition.id === 'titanium';
  const promotablePrices = prices.filter((row) => row.comparable && row.value !== null && row.value > 0);
  return {
    mcsCommodity: mineralDefinition.mcsCommodity,
    coverageNote: mineralDefinition.mcsCoverageNote || (rows.length ? null : 'No exact commodity rows were returned by the data release.'),
    price: prices.length === 1 && promotablePrices.length === 1 && !formSplit ? promotablePrices[0] : null,
    priceVariants: prices,
    priceSeries: annualSeries(rows, 'Price'),
    priceSelectionNote: prices.length === 1 && promotablePrices.length === 1 && !formSplit
      ? 'The exact commodity has one positive 2025 USGS price row.'
      : prices.length > 1 || formSplit
        ? 'Multiple product forms or price bases exist; no one row is promoted as the commodity price.'
        : 'No positive numeric 2025 price row is available.',
    netImportReliance: reliance.length === 1 && !formSplit ? reliance[0] : null,
    netImportRelianceVariants: reliance,
    netImportRelianceSeries: annualSeries(rows, 'Net import reliance'),
    production: productionContext(rows, { suppress: formSplit || mineralDefinition.suppressProduction }),
    ...imports
  };
}

async function buildUsgsAnnual() {
  const item = await requestJson(USGS_ITEM);
  const file = (item.files || []).find((candidate) => candidate.name === 'MCS2026_Commodities_Data.csv');
  assert(file?.url, 'USGS data release is missing the MCS2026 CSV');
  const bytes = await requestBytes(file.url);
  assert(bytes.length > 2_000_000, 'USGS MCS CSV response is implausibly small');
  const decoded = new TextDecoder('windows-1252').decode(bytes);
  const csvRows = parseCsv(decoded);
  const headers = csvRows.shift();
  const expectedHeaders = ['MCS chapter', 'Section', 'Commodity', 'Country', 'Statistics', 'Statistics_detail', 'Unit', 'Year', 'Value', 'Notes', 'Is critical mineral 2025', 'Other notes'];
  assert(JSON.stringify(headers) === JSON.stringify(expectedHeaders), 'USGS MCS CSV columns changed');
  const index = Object.fromEntries(headers.map((header, column) => [header, column]));
  const rows = csvRows.map((row) => mcsRow(row, index));
  const minerals = Object.fromEntries(MINERALS.map((definition) => [definition.id, annualMineral(definition, rows)]));
  const coverage = {
    reportingYear: REPORTING_YEAR,
    exactCommodityRows: MINERALS.filter((definition) => definition.mcsCommodity && rows.some((row) => row.commodity === definition.mcsCommodity)).length,
    representativePrices: Object.values(minerals).filter((row) => row.price).length,
    relianceRows: Object.values(minerals).filter((row) => row.netImportReliance).length,
    productionContexts: Object.values(minerals).filter((row) => row.production).length
  };
  const releaseUpdatedAt = iso(item.provenance?.lastUpdated) || '2026-05-27T15:15:49.000Z';
  return {
    data: {
      status: 'ok',
      sourceKey: 'usgsMcs2026',
      reportingYear: REPORTING_YEAR,
      edition: 'Mineral Commodity Summaries 2026, version 1.3 (May 2026)',
      coverage,
      minerals,
      groupContexts: {
        rareEarths: { scope: 'group-context', ...annualMineral({ id: 'rare-earths-group', mcsCommodity: 'Rare Earths', mcsCoverageNote: null }, rows) },
        heavyRareEarths: { scope: 'group-context', ...annualMineral({ id: 'heavy-rare-earths-group', mcsCommodity: 'Rare Earths (Heavy)', mcsCoverageNote: null }, rows) },
        platinumGroupMetals: { scope: 'group-context', ...annualMineral({ id: 'platinum-group-metals', mcsCommodity: 'Platinum-Group Metals', mcsCoverageNote: null }, rows) }
      },
      methodology: {
        price: 'A representative price is exposed only when an exact commodity has one positive numeric 2025 price row. All source-native alternatives remain available as priceVariants.',
        reliance: 'Inequalities, net-exporter flags, withheld values, and other USGS codes retain their raw values and qualifiers.',
        production: 'One source-native world-production table may be selected for an exact commodity; distinct product forms are not added together.',
        zero: 'The USGS em dash means reported zero. It is distinct from NA, W, s, an absent row, or an unavailable methodology.'
      }
    },
    observedAt: releaseUpdatedAt,
    retrievedAt: new Date().toISOString(),
    receipt: {
      itemId: item.id || '69837e43b66b01367d7ec7c7',
      dataReleaseDoi: '10.5066/P1WKQ63T',
      publicationDoi: '10.3133/mcs2026',
      releaseUpdatedAt,
        fileName: file.name,
        fileBytes: bytes.length,
        metadataChecksum: file.checksum?.value || file.checksum || null,
        fileSha256: sha256(bytes),
      csvRows: rows.length,
      encoding: 'Windows-1252'
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
  assert(end >= 0, 'World Bank workbook ZIP has no end-of-central-directory record');
  const entryCount = archive.readUInt16LE(end + 10);
  let cursor = archive.readUInt32LE(end + 16);
  for (let index = 0; index < entryCount; index += 1) {
    assert(archive.readUInt32LE(cursor) === 0x02014b50, 'World Bank workbook central directory is malformed');
    const method = archive.readUInt16LE(cursor + 10);
    const compressedSize = archive.readUInt32LE(cursor + 20);
    const nameLength = archive.readUInt16LE(cursor + 28);
    const extraLength = archive.readUInt16LE(cursor + 30);
    const commentLength = archive.readUInt16LE(cursor + 32);
    const localOffset = archive.readUInt32LE(cursor + 42);
    const name = archive.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    if (name === wantedName) {
      assert(archive.readUInt32LE(localOffset) === 0x04034b50, `World Bank workbook local header is malformed for ${wantedName}`);
      const localNameLength = archive.readUInt16LE(localOffset + 26);
      const localExtraLength = archive.readUInt16LE(localOffset + 28);
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = archive.subarray(dataOffset, dataOffset + compressedSize);
      if (method === 0) return compressed;
      if (method === 8) return inflateRawSync(compressed);
      throw new Error(`Unsupported World Bank workbook ZIP compression method ${method}`);
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error(`World Bank workbook is missing ${wantedName}`);
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

function worldBankMonth(value) {
  const match = /^(\d{4})M(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return `${match[1]}-${match[2]}`;
}

function rowCoverage(rows) {
  return { from: rows[0]?.month || null, to: rows.at(-1)?.month || null, observations: rows.length };
}

function subtractMonths(month, count) {
  const [year, monthNumber] = month.split('-').map(Number);
  const absolute = (year * 12) + (monthNumber - 1) - count;
  return `${Math.floor(absolute / 12)}-${String((absolute % 12) + 1).padStart(2, '0')}`;
}

function marketPerformance(rows, months) {
  const latest = rows.at(-1);
  if (!latest) return null;
  const start = rows.find((row) => row.month === subtractMonths(latest.month, months));
  if (!start?.value || !latest.value) return null;
  return { fromMonth: start.month, toMonth: latest.month, changePct: round(((latest.value / start.value) - 1) * 100, 4) };
}

function monthEndIso(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber, 0, 23, 59, 59, 999)).toISOString();
}

function parseWorldBankWorkbook(bytes) {
  const sharedStrings = parseSharedStrings(readZipEntry(bytes, 'xl/sharedStrings.xml').toString('utf8'));
  const rows = parseSheetRows(readZipEntry(bytes, 'xl/worksheets/sheet2.xml').toString('utf8'), sharedStrings);
  const names = rows.find((row) => row.number === 5)?.cells || {};
  const workbookUnits = rows.find((row) => row.number === 6)?.cells || {};
  const workbookUpdatedLabel = rows.find((row) => row.number === 4)?.cells?.A || null;
  const columnByName = Object.fromEntries(Object.entries(names).map(([column, name]) => [String(name).trim(), column]));
  const series = {};
  for (const [seriesId, definition] of Object.entries(WORLD_BANK_SERIES)) {
    const column = columnByName[definition.workbookName];
    assert(column, `World Bank workbook is missing ${definition.workbookName}`);
    const expectedWorkbookUnit = definition.unit === 'USD per metric ton' ? '($/mt)' : '($/troy oz)';
    assert(workbookUnits[column] === expectedWorkbookUnit, `World Bank ${definition.workbookName} unit changed from ${expectedWorkbookUnit}`);
    const values = rows.slice(6).flatMap(({ cells }) => {
      const month = worldBankMonth(cells.A);
      const value = number(cells[column]);
      return month && value !== null && value > 0 ? [{ month, value: round(value, 6) }] : [];
    });
    assert(values.length >= 120, `World Bank ${definition.workbookName} has fewer than 10 years of monthly observations`);
    series[seriesId] = {
      seriesId,
      name: definition.name,
      description: definition.description,
      unit: definition.unit,
      workbookUnit: workbookUnits[column] || null,
      coverage: rowCoverage(values),
      latest: values.at(-1),
      performancePct: {
        oneYear: marketPerformance(values, 12),
        fiveYear: marketPerformance(values, 60),
        tenYear: marketPerformance(values, 120)
      },
      rows: values
    };
  }
  const latestMonths = Object.values(series).map((entry) => entry.coverage.to);
  assert(new Set(latestMonths).size === 1, 'World Bank covered mineral series do not share one latest month');
  return {
    status: 'ok',
    sourceKey: 'worldBankPinkSheet',
    frequency: 'monthly nominal-USD source observations',
    coverage: {
      latestMonth: latestMonths[0],
      series: Object.keys(series).length,
      workbookUpdatedLabel,
      note: 'Each series keeps every positive monthly workbook observation. Starts differ and missing cells remain missing.'
    },
    series,
    methodology: {
      scope: 'Only exact World Bank series that correspond to commodities on the final 2025 U.S. list are included.',
      units: 'Metric-ton, dry-metric-ton, and troy-ounce series remain separate. The Chamber does not normalize unlike units into a synthetic price.',
      execution: 'These are monthly source observations, not current bids, asks, dealer quotes, or executable prices.',
      potash: 'The potassium-chloride series is a disclosed potash market proxy; it is not every potash product.'
    }
  };
}

async function buildWorldBankMarkets() {
  const bytes = await requestBytes(WORLD_BANK_WORKBOOK);
  assert(bytes.length > 400_000, 'World Bank workbook response is implausibly small');
  const data = parseWorldBankWorkbook(bytes);
  const latestMonth = data.coverage.latestMonth;
  return {
    data,
    observedAt: monthEndIso(latestMonth),
    retrievedAt: new Date().toISOString(),
    receipt: {
      workbookBytes: bytes.length,
      workbookSha256: sha256(bytes),
      latestMonth,
      retrievedEdition: data.coverage.workbookUpdatedLabel || 'World Bank Pink Sheet historical monthly workbook',
      observationClock: 'month label; not an intraday or retrieval timestamp'
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

function tokenValue(raw, decimals) {
  const decimal = decimalString(raw, decimals);
  if (decimal === null) return null;
  const numeric = Number(decimal);
  return Number.isFinite(numeric) ? round(numeric, 8) : decimal;
}

async function buildTokenChain(product) {
  const base = `${BLOCKSCOUT}/api/v2/tokens/${product.address}`;
  const [token, counters, holders, transfers, contract] = await Promise.all([
    requestJson(base),
    requestJson(`${base}/counters`),
    requestJson(`${base}/holders`),
    requestJson(`${base}/transfers`),
    requestJson(`${BLOCKSCOUT}/api/v2/smart-contracts/${product.address}`)
  ]);
  assert(String(token.address_hash).toLowerCase() === product.address.toLowerCase(), `${product.symbol} token address changed`);
  assert(token.symbol === product.symbol, `${product.symbol} response symbol changed`);
  assert(token.type === 'ERC-20', `${product.symbol} response is not ERC-20`);
  const decimals = integer(token.decimals);
  assert(decimals !== null && decimals >= 0 && decimals <= 36, `${product.symbol} decimals are invalid`);
  const observedAt = new Date().toISOString();
  const topHolders = (holders.items || []).slice(0, 50).map((entry) => ({
    address: entry.address?.hash || null,
    name: entry.address?.name || null,
    value: tokenValue(entry.value, decimals),
    valueRaw: entry.value || null
  }));
  const recentTransfers = (transfers.items || []).slice(0, 50).map((entry) => ({
    transactionHash: entry.transaction_hash || null,
    timestamp: iso(entry.timestamp),
    from: entry.from?.hash || null,
    fromName: entry.from?.name || null,
    to: entry.to?.hash || null,
    toName: entry.to?.name || null,
    method: entry.method || null,
    type: entry.type || null,
    value: tokenValue(entry.total?.value, entry.total?.decimals ?? decimals),
    valueRaw: entry.total?.value || null
  }));
  const implementation = contract.implementations?.[0] || null;
  return {
    data: {
      status: 'ok',
      observedAt,
      token: {
        address: token.address_hash,
        name: token.name,
        symbol: token.symbol,
        type: token.type,
        decimals,
        totalSupply: tokenValue(token.total_supply, decimals),
        totalSupplyRaw: token.total_supply || null
      },
      counters: {
        holderAddresses: integer(counters.token_holders_count),
        transfers: integer(counters.transfers_count)
      },
      topHolders,
      recentTransfers,
      controls: {
        proxyType: contract.proxy_type || null,
        implementationAddress: implementation?.address_hash || null,
        implementationName: implementation?.name || null,
        verified: Boolean(contract.is_verified)
      },
      coverage: {
        holderRowsReturned: topHolders.length,
        holderPageComplete: holders.next_page_params === null,
        transferRowsReturned: recentTransfers.length,
        transferPageComplete: transfers.next_page_params === null,
        note: 'Holder rows are addresses, not people or beneficial owners. Recent transfers are a bounded latest page, not complete history or evidence of a trade.'
      }
    },
    observedAt,
    retrievedAt: observedAt,
    receipt: {
      address: product.address,
      responseName: token.name,
      responseSymbol: token.symbol,
      decimals,
      holderRowsReturned: topHolders.length,
      holderPageComplete: holders.next_page_params === null,
      transferRowsReturned: recentTransfers.length,
      transferPageComplete: transfers.next_page_params === null,
      proxyType: contract.proxy_type || null,
      implementationAddress: implementation?.address_hash || null,
      implementationName: implementation?.name || null,
      proxyVerified: Boolean(contract.is_verified)
    }
  };
}

function issuerClaims(symbol) {
  if (symbol === 'xCo') {
    return {
      claimAt: '2026-06-25T00:00:00.000Z',
      sourceKey: 'metalsIoProducts',
      summary: 'Metals.io says xCo administers fractional beneficial ownership of physical cobalt through a smart-contract ledger, with Archax acting as trustee.',
      storage: 'Metals.io says the physical cobalt is stored in industry-certified bonded warehouses in the Netherlands.',
      redemption: 'Metals.io limits physical delivery to eligible persons or approved custody-account holders, subject to product documents, regulation, minimum sizes, KYC/AML, warehouse requirements, and operations.',
      priceDiscovery: 'Metals.io says approved venues provide price discovery, there is no formal spot peg, and venue prices can trade at a premium or discount.',
      limitations: [
        'Attributed platform statements, not independent custody, title, reserve, liquidity, or redemption verification.',
        'No public source used here states a fixed mass of cobalt represented by one xCo token.',
        'On-chain supply and transfers cannot reconcile the current physical balance.'
      ]
    };
  }
  if (symbol === 'xNi') {
    return {
      claimAt: '2026-06-25T00:00:00.000Z',
      sourceKey: 'metalsIoProducts',
      summary: 'Metals.io says xNi administers fractional beneficial ownership of physical nickel through a smart-contract ledger, with Archax acting as trustee or custodian.',
      storage: 'Metals.io says the physical nickel is stored in industry-certified bonded warehouses in the Netherlands.',
      redemption: 'Metals.io limits physical delivery to eligible persons or approved custody-account holders, subject to product documents, regulation, minimum sizes, KYC/AML, warehouse requirements, and operations.',
      priceDiscovery: 'Metals.io says approved venues provide price discovery, there is no formal spot peg, and venue prices can trade at a premium or discount.',
      limitations: [
        'Attributed platform statements, not independent custody, title, reserve, liquidity, or redemption verification.',
        'No public source used here states a fixed mass of nickel represented by one xNi token.',
        'On-chain supply and transfers cannot reconcile the current physical balance.'
      ]
    };
  }
  return {
    claimAt: '2026-03-26T00:00:00.000Z',
    sourceKey: 'metalsIoProducts',
    summary: 'Metals.io says RARE is a pro-rata claim on a fixed-weight basket of five strategic-metal forms administered by Noemon Tech and Noemon Finance.',
    storage: 'Metals.io says the basket is held in segregated storage at a bonded Frankfurt warehouse operated by Metlock GmbH, with stated insurance.',
    redemption: 'Metals.io says cash redemption is available subject to conditions and physical book-entry transfer requires at least EUR 10,000 in value and regulated-account operations.',
    priceDiscovery: 'Metals.io describes daily NAV pricing and venue trading; the Chamber has no public executable RARE quote feed and does not render zero placeholders as prices.',
    limitations: [
      'Attributed platform statements, not independent verification of current allocation, custody, insurance, NAV, liquidity, or redemption.',
      'A token supply or transfer cannot prove that the five physical allocations are current or reconciled.',
      'Neodymium oxide and praseodymium oxide are product forms, not interchangeable with element-level USGS commodity statistics.'
    ]
  };
}

function reviewedCatalog() {
  return {
    reviewedAt: REVIEWED_AT,
    expiresAt: REVIEW_EXPIRES_AT,
    products: [
      { symbol: 'xCo', name: 'Cobalt', status: 'live', room: 'minerals' },
      { symbol: 'xNi', name: 'Nickel', status: 'live', room: 'minerals' },
      { symbol: 'RARE', name: 'Strategic Metals Basket', status: 'live', room: 'minerals' },
      { symbol: 'xU3O8', name: 'Uranium', status: 'live', room: 'uranium', href: '/uranium/' },
      { symbol: 'VNXAU', name: 'VNX Gold', status: 'live', room: 'metals', href: '/metals/?view=vnxau' },
      { symbol: 'xAg', name: 'Silver', status: 'coming-soon', room: null },
      { symbol: 'xPd', name: 'Palladium', status: 'coming-soon', room: null },
      { symbol: 'xCu', name: 'Copper', status: 'coming-soon', room: null }
    ],
    boundary: 'A dated catalog status is not a contract identity, launch guarantee, price, market, custody record, or backing receipt. Coming soon is not live.'
  };
}

function rareBasket() {
  return {
    productSymbol: 'RARE',
    compositionStatus: 'five-component product-page receipt with a disclosed source inconsistency',
    composition: [
      { commodityId: 'hafnium', label: 'Hafnium (Hf + Zr)', quantity: 10, unit: 'grams', purity: 'minimum 99.9%' },
      { commodityId: 'rhenium', label: 'Rhenium', quantity: 10, unit: 'grams', purity: 'minimum 99.9%' },
      { commodityId: 'indium', label: 'Indium', quantity: 25, unit: 'grams', purity: '99.995%' },
      { commodityId: 'neodymium', label: 'Neodymium oxide (Nd2O3)', quantity: 150, unit: 'grams', purity: 'minimum 99.5%' },
      { commodityId: 'praseodymium', label: 'Praseodymium oxide (Pr6O11)', quantity: 150, unit: 'grams', purity: 'minimum 99.0%' }
    ],
    conflictNote: 'The approved Metals.io product page says five and lists five allocations. A help-center sentence says seven while naming only the same five. This receipt follows the explicit five-row allocation and preserves the inconsistency instead of inventing two components.',
    sourceKey: 'metalsIoProducts',
    reviewedAt: REVIEWED_AT
  };
}

function unavailableMethodologies() {
  return [
    { id: 'all-live-prices', label: 'Current prices for all 60', reason: 'No one public source supplies current, comparable, executable observations for the entire list. Missing prices remain unavailable.' },
    { id: 'met-coal-mcs', label: 'Metallurgical-coal MCS row', reason: 'The MCS 2026 nonfuel data release has no metallurgical-coal chapter. World Bank thermal-coal prices are not substituted.' },
    { id: 'uranium-mcs', label: 'Uranium MCS row', reason: 'The MCS 2026 nonfuel data release has no uranium chapter. The dedicated Uranium Chamber retains its separate sources and units.' },
    { id: 'cross-unit-index', label: 'One critical-minerals price index', reason: 'Metric-ton and troy-ounce series are not normalized into an undisclosed synthetic composite.' },
    { id: 'token-market-quotes', label: 'xCo, xNi, and RARE executable prices', reason: 'No reviewed public quote feed with executable bid/ask semantics is available. A zero app placeholder is not a price.' },
    { id: 'synchronized-backing', label: 'Current token-to-physical reconciliation', reason: 'Token supply, transfers, issuer pages, and physical statements have different clocks and cannot prove synchronized backing.' },
    { id: 'beneficial-owner-count', label: 'Beneficial owners', reason: 'Blockscout counts addresses. The Chamber does not infer people, entities, custody customers, or beneficial owners.' },
    { id: 'complete-transfer-history', label: 'Complete product transfer history', reason: 'The generated receipt retains a bounded latest page only and does not label it complete.' }
  ];
}

function emptyAnnual() {
  return {
    status: 'unavailable',
    sourceKey: 'usgsMcs2026',
    reportingYear: REPORTING_YEAR,
    edition: 'Mineral Commodity Summaries 2026',
    coverage: { reportingYear: REPORTING_YEAR, exactCommodityRows: 0, representativePrices: 0, relianceRows: 0, productionContexts: 0 },
    minerals: Object.fromEntries(MINERALS.map((entry) => [entry.id, annualMineral(entry, [])])),
    groupContexts: {},
    methodology: {}
  };
}

function emptyMarkets() {
  return {
    status: 'unavailable',
    sourceKey: 'worldBankPinkSheet',
    frequency: 'monthly nominal-USD source observations',
    coverage: { latestMonth: null, series: 0, note: 'The current workbook is unavailable.' },
    series: {},
    methodology: {}
  };
}

function emptyChain(product, status = 'unavailable') {
  return {
    status,
    observedAt: null,
    token: { address: product.address, name: product.name, symbol: product.symbol, type: 'ERC-20', decimals: null, totalSupply: null, totalSupplyRaw: null },
    counters: { holderAddresses: null, transfers: null },
    topHolders: [],
    recentTransfers: [],
    controls: { proxyType: null, implementationAddress: null, implementationName: null, verified: null },
    coverage: { holderRowsReturned: 0, holderPageComplete: false, transferRowsReturned: 0, transferPageComplete: false, note: 'Current Blockscout state is unavailable.' }
  };
}

function attachProduct(product, chain, sourceStatus) {
  return {
    symbol: product.symbol,
    name: product.name,
    commodityIds: product.commodityIds,
    catalogStatus: 'live',
    issuerClaims: issuerClaims(product.symbol),
    chain: { ...(chain || emptyChain(product)), status: sourceStatus }
  };
}

function sourceStatusProjection(source) {
  return {
    status: source.status,
    observedAt: source.observedAt || null,
    retrievedAt: source.retrievedAt || null,
    reviewedAt: source.reviewedAt || null,
    expiresAt: source.expiresAt || null
  };
}

async function buildSnapshot(previous) {
  const previousSources = previous?.sources || {};
  const previousProducts = previous?.tokenized?.products || {};
  const [annualPart, marketsPart, xcoPart, xniPart, rarePart] = await Promise.all([
    attemptSource('usgsMcs2026', buildUsgsAnnual, previous?.annual, previousSources.usgsMcs2026),
    attemptSource('worldBankPinkSheet', buildWorldBankMarkets, previous?.markets, previousSources.worldBankPinkSheet),
    attemptSource('blockscoutXco', () => buildTokenChain(TOKEN_PRODUCTS.xCo), previousProducts.xCo?.chain, previousSources.blockscoutXco),
    attemptSource('blockscoutXni', () => buildTokenChain(TOKEN_PRODUCTS.xNi), previousProducts.xNi?.chain, previousSources.blockscoutXni),
    attemptSource('blockscoutRare', () => buildTokenChain(TOKEN_PRODUCTS.RARE), previousProducts.RARE?.chain, previousSources.blockscoutRare)
  ]);
  const generatedAt = new Date().toISOString();
  const catalog = reviewedCatalog();
  const productsReceipt = {
    reviewedAt: REVIEWED_AT,
    productPages: ['cobalt', 'nickel', 'strategic-metals-basket'],
    approvedAt: { xCo: '2026-06-25', xNi: '2026-06-25', RARE: '2026-03-26' },
    rareCompositionRows: 5,
    attribution: 'Metals.io statements are issuer/platform claims, not independent assurance.'
  };
  const sources = {
    usgsCriticalList: reviewedSource('usgsCriticalList', {
      listEdition: 'Final 2025',
      federalRegisterCitation: '90 FR 50494',
      federalRegisterDocument: '2025-19813',
      listCount: 60,
      rareEarthCount: 15,
      reviewedOrder: MINERALS.map((entry) => entry.name)
    }),
    usgsMcs2026: annualPart.source,
    worldBankPinkSheet: marketsPart.source,
    metalsIoCatalog: reviewedSource('metalsIoCatalog', catalog),
    metalsIoProducts: reviewedSource('metalsIoProducts', productsReceipt),
    blockscoutXco: xcoPart.source,
    blockscoutXni: xniPart.source,
    blockscoutRare: rarePart.source
  };
  const annual = annualPart.data || emptyAnnual();
  annual.status = annualPart.source.status;
  const markets = marketsPart.data || emptyMarkets();
  markets.status = marketsPart.source.status;
  const unsigned = {
    schemaVersion: 1,
    artifact: 'minerals-snapshot',
    generatedAt,
    identity: {
      title: 'Critical Minerals',
      shortTitle: 'Minerals',
      jurisdiction: 'United States',
      listYear: 2025,
      federalRegisterCitation: '90 FR 50494',
      federalRegisterDocument: '2025-19813',
      publishedDate: '2025-11-07',
      criticalCount: 60,
      rareEarthCount: 15,
      listEdition: 'Final 2025 U.S. List of Critical Minerals',
      reportingYear: REPORTING_YEAR,
      scope: 'The exact 60-item U.S. policy list, source-native annual supply evidence, a bounded public monthly-market subset, and separate Etherlink receipts for xCo, xNi, and RARE.'
    },
    taxonomy: {
      sourceKey: 'usgsCriticalList',
      minerals: MINERALS,
      boundaries: {
        policy: 'Criticality is jurisdiction-, method-, and time-specific. This U.S. list is not a universal geological definition.',
        rareEarths: 'The list has 15 explicitly denoted rare-earth elements. Scandium remains a critical mineral here but is not counted among those 15 list markers.',
        forms: 'Mineral commodities, elements, oxides, concentrates, metals, and baskets are not silently treated as interchangeable.'
      }
    },
    annual,
    markets,
    tokenized: {
      catalog,
      products: {
        xCo: attachProduct(TOKEN_PRODUCTS.xCo, xcoPart.data, xcoPart.source.status),
        xNi: attachProduct(TOKEN_PRODUCTS.xNi, xniPart.data, xniPart.source.status),
        RARE: attachProduct(TOKEN_PRODUCTS.RARE, rarePart.data, rarePart.source.status)
      },
      rareBasket: rareBasket(),
      boundary: 'Catalog status, issuer statements, chain state, holder-address rows, transfers, and physical evidence are separate receipts. None proves the others.'
    },
    methodology: {
      sourceClocks: 'USGS annual reporting, USGS revision, World Bank completed month, manual review, issuer statement, and Etherlink observation keep their own clocks.',
      missingValues: 'Unavailable, withheld, not-applicable, source-coded, and absent values remain distinct from reported zero.',
      comparisons: 'Only same-series changes are calculated. Unlike commodity units and product forms are never ranked by raw price.',
      concentration: 'A top-producer share is derived only from a named-country value and compatible World total in the same USGS table and form.',
      chain: 'Addresses are not people; bounded transfers are not trades; verified proxy lineage is capability context, not evidence that a capability was invoked.',
      productClaims: 'Metals.io claims are attributed. This artifact does not independently attest backing, beneficial ownership, custody, insurance, price, liquidity, or redemption.',
      execution: 'This Chamber is read-only and intentionally provides no buy, sell, swap, bridge, redeem, order, or wallet action.'
    },
    unavailable: unavailableMethodologies(),
    sources: Object.fromEntries(SOURCE_ORDER.map((key) => [key, sources[key]]))
  };
  return { ...unsigned, contentHash: contentHash(unsigned) };
}

function buildProjection(snapshot, snapshotText) {
  const copper = snapshot.markets?.series?.copper || null;
  const annualMinerals = snapshot.annual?.minerals || {};
  const products = Object.values(snapshot.tokenized?.products || {}).map((product) => ({
    symbol: product.symbol,
    name: product.name,
    catalogStatus: product.catalogStatus,
    address: product.chain?.token?.address || null,
    totalSupply: product.chain?.token?.totalSupply ?? null,
    holderAddresses: product.chain?.counters?.holderAddresses ?? null,
    transfers: product.chain?.counters?.transfers ?? null,
    observedAt: product.chain?.observedAt || null,
    status: product.chain?.status || 'unavailable'
  }));
  const fullyImportReliantCount = Object.values(annualMinerals).filter((row) => (
    row.netImportReliance?.value === 100 && row.netImportReliance?.qualifier === 'exact or rounded estimate'
  )).length;
  const unsigned = {
    schemaVersion: 1,
    artifact: 'minerals-entry-summary',
    generatedAt: snapshot.generatedAt,
    identity: snapshot.identity,
    headline: {
      criticalCount: snapshot.identity.criticalCount,
      rareEarthCount: snapshot.identity.rareEarthCount,
      monthlySeriesCount: Object.keys(snapshot.markets?.series || {}).length,
      fullyImportReliantCount,
      tokenProductCount: products.length,
      reportingYear: snapshot.identity.reportingYear
    },
    marketPulse: copper ? {
      seriesId: copper.seriesId,
      name: copper.name,
      unit: copper.unit,
      latest: copper.latest,
      performancePct: copper.performancePct,
      oneYearChangePct: copper.performancePct?.oneYear?.changePct ?? null,
      rows: copper.rows.slice(-36),
      sourceKey: 'worldBankPinkSheet'
    } : null,
    tokenized: { products },
    sourceStatuses: Object.fromEntries(Object.entries(snapshot.sources).map(([key, source]) => [key, sourceStatusProjection(source)])),
    fullSnapshot: {
      path: `/${SNAPSHOT_PATH}`,
      schemaVersion: snapshot.schemaVersion,
      generatedAt: snapshot.generatedAt,
      contentHash: snapshot.contentHash,
      fileSha256: sha256(snapshotText)
    }
  };
  return { ...unsigned, contentHash: contentHash(unsigned) };
}

function validateSource(source, key) {
  assert(source && typeof source === 'object', `Missing source ${key}`);
  assert(['ok', 'stale', 'unavailable'].includes(source.status), `${key} has invalid status`);
  assert(source.label && source.url && source.credit, `${key} attribution is incomplete`);
  assert(Array.isArray(source.endpoints) && source.endpoints.length > 0, `${key} endpoints are missing`);
  if (source.status === 'ok') assert(source.observedAt, `${key} ok source needs an observation or review clock`);
}

function validateSnapshot(snapshot, bytes = null) {
  assert(snapshot?.schemaVersion === 1, 'Minerals snapshot schemaVersion must be 1');
  assert(snapshot.artifact === 'minerals-snapshot', 'Minerals snapshot artifact id changed');
  assert(iso(snapshot.generatedAt), 'Minerals snapshot generatedAt is invalid');
  assert(snapshot.identity?.criticalCount === 60, 'Minerals identity must report 60 critical minerals');
  assert(snapshot.identity?.rareEarthCount === 15, 'Minerals identity must report 15 marked rare earths');
  assert(Array.isArray(snapshot.taxonomy?.minerals) && snapshot.taxonomy.minerals.length === 60, 'Minerals taxonomy must contain 60 rows');
  assert(new Set(snapshot.taxonomy.minerals.map((entry) => entry.id)).size === 60, 'Minerals taxonomy ids must be unique');
  assert(snapshot.taxonomy.minerals.filter((entry) => entry.isRareEarth).length === 15, 'Minerals taxonomy rare-earth count changed');
  assert(JSON.stringify(snapshot.taxonomy.minerals.map((entry) => entry.name)) === JSON.stringify(MINERALS.map((entry) => entry.name)), 'Minerals taxonomy order changed');
  assert(Object.keys(snapshot.annual?.minerals || {}).join(',') === MINERALS.map((entry) => entry.id).join(','), 'Annual mineral inventory changed');
  if (snapshot.annual.status !== 'unavailable') {
    assert(snapshot.annual.reportingYear === REPORTING_YEAR, 'USGS reporting year changed');
    assert(snapshot.annual.coverage?.exactCommodityRows >= 50, 'USGS exact commodity coverage is implausibly low');
    const metCoal = snapshot.annual.minerals['metallurgical-coal'];
    const uranium = snapshot.annual.minerals.uranium;
    assert(metCoal.mcsCommodity === null && uranium.mcsCommodity === null, 'Unavailable MCS commodities must remain unavailable');
    assert(snapshot.annual.minerals.titanium.price === null, 'Titanium form prices must not collapse into one value');
    assert(snapshot.annual.minerals.silicon.price === null, 'Silicon form prices must not collapse into one value');
  }
  const marketKeys = Object.keys(snapshot.markets?.series || {});
  if (snapshot.markets.status !== 'unavailable') {
    assert(marketKeys.join(',') === Object.keys(WORLD_BANK_SERIES).join(','), 'World Bank mineral series inventory/order changed');
    for (const [key, series] of Object.entries(snapshot.markets.series)) {
      assert(series.unit === WORLD_BANK_SERIES[key].unit, `${key} market unit changed`);
      assert(Array.isArray(series.rows) && series.rows.length >= 120, `${key} market history is too short`);
      assert(series.coverage?.to === series.latest?.month, `${key} market latest/coverage mismatch`);
    }
  }
  for (const [key, expected] of Object.entries(TOKEN_PRODUCTS)) {
    const product = snapshot.tokenized?.products?.[key];
    assert(product?.catalogStatus === 'live', `${key} reviewed catalog status changed`);
    assert(product.chain?.token?.address?.toLowerCase() === expected.address.toLowerCase(), `${key} token address changed`);
    assert(product.chain?.token?.symbol === expected.symbol, `${key} token symbol changed`);
    assert(['ok', 'stale', 'unavailable'].includes(product.chain.status), `${key} chain status is invalid`);
  }
  assert(snapshot.tokenized?.rareBasket?.composition?.length === 5, 'RARE composition must retain five explicit rows');
  assert(snapshot.tokenized.rareBasket.conflictNote.includes('says seven'), 'RARE source inconsistency disclosure is missing');
  assert(snapshot.unavailable?.some((row) => row.id === 'token-market-quotes'), 'Token quote unavailable boundary is missing');
  assert(Object.keys(snapshot.sources || {}).join(',') === SOURCE_ORDER.join(','), 'Minerals source inventory/order changed');
  for (const key of SOURCE_ORDER) validateSource(snapshot.sources[key], key);
  assert(snapshot.contentHash === contentHash(snapshot), 'Minerals snapshot contentHash mismatch');
  if (bytes !== null) assert(bytes <= MAX_SNAPSHOT_BYTES, `Minerals snapshot exceeds ${MAX_SNAPSHOT_BYTES} bytes`);
  return true;
}

function validateProjection(entry, snapshot, snapshotText, bytes = null) {
  assert(entry?.schemaVersion === 1, 'Minerals entry schemaVersion must be 1');
  assert(entry.artifact === 'minerals-entry-summary', 'Minerals entry artifact id changed');
  assert(entry.generatedAt === snapshot.generatedAt, 'Minerals entry generatedAt does not match full snapshot');
  assert(entry.identity?.criticalCount === 60 && entry.identity?.rareEarthCount === 15, 'Minerals entry headline taxonomy changed');
  assert(entry.headline?.criticalCount === 60 && entry.headline?.rareEarthCount === 15, 'Minerals compact headline counts changed');
  assert(entry.headline?.tokenProductCount === 3, 'Minerals compact token product count changed');
  assert((entry.tokenized?.products || []).map((row) => row.symbol).join(',') === 'xCo,xNi,RARE', 'Minerals compact token order changed');
  assert(!entry.marketPulse || entry.marketPulse.rows.length <= 36, 'Minerals compact market pulse is unbounded');
  assert(entry.fullSnapshot?.path === `/${SNAPSHOT_PATH}`, 'Minerals compact full snapshot path changed');
  assert(entry.fullSnapshot?.schemaVersion === snapshot.schemaVersion, 'Minerals compact schema receipt mismatch');
  assert(entry.fullSnapshot?.generatedAt === snapshot.generatedAt, 'Minerals compact generation receipt mismatch');
  assert(entry.fullSnapshot?.contentHash === snapshot.contentHash, 'Minerals compact content receipt mismatch');
  assert(entry.fullSnapshot?.fileSha256 === sha256(snapshotText), 'Minerals compact full-file SHA mismatch');
  assert(entry.contentHash === contentHash(entry), 'Minerals entry contentHash mismatch');
  if (bytes !== null) assert(bytes <= MAX_ENTRY_BYTES, `Minerals entry exceeds ${MAX_ENTRY_BYTES} bytes`);
  return true;
}

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function writePairAtomic(snapshot, entry) {
  const snapshotText = `${JSON.stringify(snapshot, null, 2)}\n`;
  const entryText = `${JSON.stringify(entry, null, 2)}\n`;
  const snapshotTemp = `${SNAPSHOT_FILE}.tmp`;
  const entryTemp = `${ENTRY_FILE}.tmp`;
  await fs.writeFile(snapshotTemp, snapshotText);
  await fs.writeFile(entryTemp, entryText);
  await fs.rename(snapshotTemp, SNAPSHOT_FILE);
  await fs.rename(entryTemp, ENTRY_FILE);
}

async function checkCommittedPair() {
  const [snapshotText, entryText] = await Promise.all([
    fs.readFile(SNAPSHOT_FILE, 'utf8'),
    fs.readFile(ENTRY_FILE, 'utf8')
  ]);
  const snapshot = JSON.parse(snapshotText);
  const entry = JSON.parse(entryText);
  validateSnapshot(snapshot, Buffer.byteLength(snapshotText));
  validateProjection(entry, snapshot, snapshotText, Buffer.byteLength(entryText));
  const expectedEntry = buildProjection(snapshot, snapshotText);
  assert(JSON.stringify(entry) === JSON.stringify(expectedEntry), 'Minerals compact projection is stale');
  return {
    snapshotBytes: Buffer.byteLength(snapshotText),
    entryBytes: Buffer.byteLength(entryText),
    contentHash: snapshot.contentHash,
    generatedAt: snapshot.generatedAt
  };
}

async function refresh() {
  const previous = await readJson(SNAPSHOT_FILE);
  const snapshot = await buildSnapshot(previous);
  const snapshotText = `${JSON.stringify(snapshot, null, 2)}\n`;
  const entry = buildProjection(snapshot, snapshotText);
  validateSnapshot(snapshot, Buffer.byteLength(snapshotText));
  const entryText = `${JSON.stringify(entry, null, 2)}\n`;
  validateProjection(entry, snapshot, snapshotText, Buffer.byteLength(entryText));
  await writePairAtomic(snapshot, entry);
  return {
    snapshotBytes: Buffer.byteLength(snapshotText),
    entryBytes: Buffer.byteLength(entryText),
    contentHash: snapshot.contentHash,
    generatedAt: snapshot.generatedAt,
    sourceStatuses: Object.fromEntries(Object.entries(snapshot.sources).map(([key, source]) => [key, source.status]))
  };
}

async function main() {
  if (hasFlag('--check')) {
    const result = await checkCommittedPair();
    console.log(`ok - Minerals artifacts ${result.snapshotBytes} + ${result.entryBytes} bytes, hash ${result.contentHash.slice(0, 12)}, generated ${result.generatedAt}`);
    return;
  }
  const result = await refresh();
  console.log(`wrote ${SNAPSHOT_PATH} (${result.snapshotBytes} bytes)`);
  console.log(`wrote ${ENTRY_PATH} (${result.entryBytes} bytes)`);
  console.log(`content ${result.contentHash}`);
  console.log(`sources ${JSON.stringify(result.sourceStatuses)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export {
  MINERALS,
  TOKEN_PRODUCTS,
  WORLD_BANK_SERIES,
  buildProjection,
  checkCommittedPair,
  contentHash,
  validateProjection,
  validateSnapshot
};
