#!/usr/bin/env node

import fs from 'node:fs/promises';
import { fetchL2GovernanceJson as fetchJson } from './lib/maxis-l2-governance-fetch.mjs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  buildL2GovernanceCareerArtifact,
  extractL2GovernanceReceiptAddresses,
  l2GovernanceContentHash,
  matchL2GovernancePeriodMaps,
  validateL2GovernanceCareerArtifact
} from './lib/maxis-l2-governance.mjs';
import {
  ETHERLINK_GOVERNANCE_CURRENT_CONTRACTS
} from '../js/core/etherlink-governance-contracts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_FILE = path.join(ROOT, 'data/maxis-l2-governance.json');
const TZKT = 'https://api.tzkt.io/v1';
const ETHERLINK_GOVERNANCE = 'https://governance.etherlink.com/api';
const PAGE_SIZE = 10000;
const ACCOUNT_BATCH_SIZE = 50;
const LEVEL_BATCH_SIZE = 100;
const RELEVANT_BIGMAP_PATHS = new Set([
  'voting_context.period.proposal.proposals',
  'voting_context.period.proposal.upvoters_proposals',
  'voting_context.period.promotion.voters'
]);

function cliValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function outputFile() {
  const requested = cliValue('--output');
  return requested ? path.resolve(process.cwd(), requested) : OUTPUT_FILE;
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function writeJsonAtomic(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await fs.rename(temporary, file);
}


function tzktUrl(pathname, params = {}) {
  const url = new URL(`${TZKT}${pathname}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  return url.toString();
}

async function fetchTerminalCollection(pathname, params = {}, {
  pageSize = PAGE_SIZE,
  maxPages = 100,
  normalize = (row) => row
} = {}) {
  const rows = [];
  let pages = 0;
  let terminalShortPage = false;
  for (let page = 0; page < maxPages; page += 1) {
    const batch = await fetchJson(tzktUrl(pathname, {
      ...params,
      offset: page * pageSize,
      limit: pageSize
    }));
    if (!Array.isArray(batch)) throw new Error(`TzKT ${pathname} returned a non-array page`);
    pages += 1;
    rows.push(...batch.map(normalize));
    if (batch.length < pageSize) {
      terminalShortPage = true;
      break;
    }
  }
  if (!terminalShortPage) throw new Error(`TzKT ${pathname} reached its ${maxPages}-page bound without a terminal page`);
  return {
    rows,
    receipt: {
      source: `TzKT ${pathname}`,
      query: { ...params },
      rows: rows.length,
      expectedRows: rows.length,
      pages,
      pageSize,
      completionProof: 'terminal-short-page',
      complete: true,
      truncated: false,
      error: null
    }
  };
}

async function fetchHead() {
  const row = await fetchJson(`${TZKT}/head`);
  const level = Number(row?.level);
  const timestamp = Date.parse(row?.timestamp || '');
  if (!Number.isSafeInteger(level) || level <= 0 || !Number.isFinite(timestamp)) throw new Error('TzKT /head returned an invalid head');
  return {
    row,
    receipt: {
      source: 'TzKT /head',
      level,
      timestamp: new Date(timestamp).toISOString(),
      hash: row?.hash || null,
      protocol: row?.protocol || null,
      complete: true,
      error: null
    }
  };
}

async function fetchOfficialPeriods() {
  const trackReceipts = [];
  const rows = [];
  for (const track of ['fast', 'slow', 'sequencer']) {
    const url = `${ETHERLINK_GOVERNANCE}/${track}/pastPeriods`;
    const payload = await fetchJson(url);
    if (!Array.isArray(payload?.pastPeriods)) throw new Error(`Official Etherlink ${track} period response is invalid`);
    const trackRows = payload.pastPeriods.map((row) => ({ ...row, governance: track }));
    rows.push(...trackRows);
    trackReceipts.push({
      track,
      source: url,
      rows: trackRows.length,
      contentHash: l2GovernanceContentHash(trackRows),
      complete: true,
      error: null
    });
  }
  return {
    rows,
    receipt: {
      source: 'Official Etherlink /api/{track}/pastPeriods',
      rows: rows.length,
      expectedRows: rows.length,
      trackReceipts,
      completionProof: 'three-complete-track-responses',
      complete: true,
      truncated: false,
      error: null
    }
  };
}

async function fetchBigmapInventories(periodRows) {
  const contracts = [...new Set(periodRows.map((row) => row.contract).filter(Boolean))].sort();
  const rows = [];
  const contractReceipts = [];
  for (const contract of contracts) {
    const inventory = await fetchTerminalCollection('/bigmaps', { contract }, {
      normalize: (row) => ({ ...row, contract })
    });
    const relevant = inventory.rows.filter((row) => RELEVANT_BIGMAP_PATHS.has(row.path));
    rows.push(...relevant);
    contractReceipts.push({
      contract,
      inventoryRows: inventory.rows.length,
      relevantRows: relevant.length,
      pages: inventory.receipt.pages,
      completionProof: inventory.receipt.completionProof,
      complete: true,
      error: null
    });
  }
  return {
    rows,
    receipt: {
      source: 'TzKT /bigmaps exact canonical-period contracts',
      rows: rows.length,
      expectedRows: rows.length,
      contracts: contracts.length,
      contractReceipts,
      completionProof: 'complete-contract-inventories-filtered-to-reviewed-paths',
      complete: true,
      truncated: false,
      error: null
    }
  };
}

async function fetchMatchedBigmapKeys(periodRows, bigmapRows) {
  const matched = matchL2GovernancePeriodMaps(periodRows, bigmapRows);
  if (matched.errors.length) throw new Error(`Cannot fetch L2 governance keys: ${matched.errors.join('; ')}`);
  const ptrs = [...new Set(matched.periods.flatMap((period) => Object.values(period.bigmapPtrs)).filter((ptr) => ptr != null))].sort((a, b) => a - b);
  const mapIndex = new Map(matched.maps.map((row) => [row.ptr, row]));
  const rows = [];
  const perMap = [];
  for (const ptr of ptrs) {
    const map = mapIndex.get(ptr);
    const keys = await fetchTerminalCollection(`/bigmaps/${ptr}/keys`, { 'sort.asc': 'id' }, {
      normalize: (row) => ({ ...row, ptr, contract: map.contract, path: map.path })
    });
    if (keys.rows.length !== map.totalKeys) throw new Error(`Big map ${ptr} returned ${keys.rows.length}/${map.totalKeys} keys`);
    rows.push(...keys.rows);
    perMap.push({
      ptr,
      contract: map.contract,
      path: map.path,
      rows: keys.rows.length,
      expectedRows: map.totalKeys,
      pages: keys.receipt.pages,
      completionProof: 'inventory-totalKeys-and-terminal-short-page',
      complete: true,
      truncated: false,
      error: null
    });
  }

  const levels = [...new Set(rows.map((row) => Number(row.firstLevel)).filter((level) => Number.isSafeInteger(level) && level > 0))].sort((a, b) => a - b);
  const timestamps = new Map();
  for (let index = 0; index < levels.length; index += LEVEL_BATCH_SIZE) {
    const batch = levels.slice(index, index + LEVEL_BATCH_SIZE);
    const blockRows = await fetchJson(tzktUrl('/blocks', {
      'level.in': batch.join(','),
      select: 'level,timestamp',
      limit: batch.length
    }));
    if (!Array.isArray(blockRows)) throw new Error('TzKT block timestamp response is invalid');
    blockRows.forEach((row) => timestamps.set(Number(row.level), row.timestamp));
  }
  if (timestamps.size !== levels.length) throw new Error(`TzKT returned ${timestamps.size}/${levels.length} receipt block timestamps`);
  const timestampedRows = rows.map((row) => {
    const timestamp = timestamps.get(Number(row.firstLevel));
    if (!timestamp) throw new Error(`Big-map key ${row.ptr}:${row.id} lacks a block timestamp`);
    return { ...row, timestamp };
  });
  return {
    rows: timestampedRows,
    receipt: {
      source: 'TzKT /bigmaps/{ptr}/keys plus /blocks level timestamps',
      rows: timestampedRows.length,
      expectedRows: timestampedRows.length,
      maps: ptrs.length,
      perMap,
      levelTimestamps: {
        rows: timestamps.size,
        expectedRows: levels.length,
        complete: timestamps.size === levels.length,
        error: null
      },
      completionProof: 'per-map-inventory-totalKeys-and-terminal-short-page',
      complete: true,
      truncated: false,
      error: null
    }
  };
}

async function fetchAccounts(addresses) {
  const unique = [...new Set(addresses)].sort();
  const rows = [];
  for (let index = 0; index < unique.length; index += ACCOUNT_BATCH_SIZE) {
    const batch = unique.slice(index, index + ACCOUNT_BATCH_SIZE);
    const result = await fetchJson(tzktUrl('/accounts', {
      'address.in': batch.join(','),
      select: 'address,alias',
      limit: batch.length
    }));
    if (!Array.isArray(result)) throw new Error('TzKT account alias response is invalid');
    rows.push(...result);
  }
  const returned = new Set(rows.map((row) => row.address));
  const missing = unique.filter((address) => !returned.has(address));
  if (missing.length) throw new Error(`TzKT account lookup omitted ${missing.join(', ')}`);
  rows.sort((left, right) => left.address < right.address ? -1 : left.address > right.address ? 1 : 0);
  return {
    rows,
    receipt: {
      source: 'TzKT /accounts exact represented bakers',
      rows: rows.length,
      expectedRows: unique.length,
      batches: Math.ceil(unique.length / ACCOUNT_BATCH_SIZE),
      completionProof: 'exact-address-set-match',
      complete: true,
      truncated: false,
      error: null
    }
  };
}

async function fetchCurrentContracts() {
  const rows = [];
  for (const [track, address] of Object.entries(ETHERLINK_GOVERNANCE_CURRENT_CONTRACTS)) {
    const storage = await fetchJson(`${TZKT}/contracts/${address}/storage`);
    rows.push({ track, address, storage });
  }
  return {
    rows,
    receipt: {
      source: 'TzKT current official Etherlink governance contract storages',
      rows: rows.length,
      expectedRows: Object.keys(ETHERLINK_GOVERNANCE_CURRENT_CONTRACTS).length,
      completionProof: 'exact-reviewed-current-address-set',
      complete: true,
      truncated: false,
      error: null
    }
  };
}

async function buildArtifact(generatedAt) {
  const [head, periods, activeDelegates, currentContracts] = await Promise.all([
    fetchHead(),
    fetchOfficialPeriods(),
    fetchTerminalCollection('/delegates', { active: 'true', select: 'address,alias' }),
    fetchCurrentContracts()
  ]);
  const bigmaps = await fetchBigmapInventories(periods.rows);
  const keys = await fetchMatchedBigmapKeys(periods.rows, bigmaps.rows);
  const addresses = extractL2GovernanceReceiptAddresses(periods.rows, bigmaps.rows, keys.rows);
  const accounts = await fetchAccounts(addresses);
  return buildL2GovernanceCareerArtifact({
    generatedAt,
    periods,
    bigmaps,
    keys,
    activeDelegates,
    accounts,
    currentContracts,
    head
  });
}

async function main() {
  const file = outputFile();
  if (process.argv.includes('--check')) {
    const artifact = await readJson(file);
    const errors = validateL2GovernanceCareerArtifact(artifact);
    if (errors.length) throw new Error(`Invalid Maxis L2 governance artifact: ${errors.join('; ')}`);
    console.log(`Maxis L2 governance careers are valid: ${artifact.recordCount} records, ${artifact.periodLedger.count} windows, ${artifact.totals.participantReceipts} receipts`);
    return;
  }
  const artifact = await buildArtifact(new Date().toISOString());
  const errors = validateL2GovernanceCareerArtifact(artifact);
  if (errors.length) throw new Error(`Generated invalid Maxis L2 governance artifact: ${errors.join('; ')}`);
  await writeJsonAtomic(file, artifact);
  console.log(`Wrote ${path.relative(ROOT, file)} with ${artifact.recordCount} career records, ${artifact.periodLedger.count} windows, and ${artifact.totals.participantReceipts} receipts`);
}

export {
  buildArtifact as buildMaxisL2GovernanceCareerArtifact,
  fetchOfficialPeriods as fetchOfficialEtherlinkGovernancePeriods,
  fetchMatchedBigmapKeys as fetchCompleteL2GovernanceBigmapKeys
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(error.exitCode === 75 ? 75 : 1);
  });
}
