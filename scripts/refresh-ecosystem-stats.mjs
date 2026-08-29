#!/usr/bin/env node

import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  ECOSYSTEM_SCHEMA_VERSION,
  LAYER_IDS,
  WEEK_MS,
  addWeeks,
  combineNetworkActivity,
  contractUniverseHash,
  emptyMetric,
  iso,
  mergeMetric,
  mergeResolvedContracts,
  networkRebuildStart,
  publicMetric,
  rankApps,
  stableHash,
  summarizeApp,
  tezosNetworkWallet,
  utcWeekStart,
  validateManifest,
  validateSnapshot
} from './lib/ecosystem-stats.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_FILE = path.join(ROOT, 'data/ecosystem-apps.json');
const OUTPUT_FILE = path.join(ROOT, 'data/ecosystem-stats.json');
const TZKT = 'https://api.tzkt.io/v1';
const ETHERLINK = 'https://explorer.etherlink.com/api';
const ETHERLINK_STATS = 'https://explorer.etherlink.com/stats-service/api/v1';
const TZKT_PAGE_SIZE = 10_000;
const TZKT_ADDRESS_BATCH = 25;
const BLOCKSCOUT_MAX_ROWS = 10_000;
const REQUEST_CONCURRENCY = 8;
const BLOCKSCOUT_REQUEST_CONCURRENCY = 2;
const BLOCKSCOUT_REQUEST_GAP_MS = 1_200;
const BLOCKSCOUT_MAX_QUERY_RANGE_MS = 7 * 24 * 60 * 60 * 1000;
const TZKT_NETWORK_REQUEST_GAP_MS = 350;
const RECENT_WEEKS_TO_REBUILD = 3;
const tzktCatalogReceipt = [];
const execFileAsync = promisify(execFile);
let blockscoutRequestGate = Promise.resolve();
let blockscoutNextRequestAt = 0;
let tzktNetworkNextRequestAt = 0;

// Raw wallet sets are aggregate-only generator state. They are never written
// to the public snapshot or launcher projection.
function hasFlag(name) {
  return process.argv.includes(name);
}

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function chunks(values, size) {
  const rows = [];
  for (let index = 0; index < values.length; index += size) rows.push(values.slice(index, index + size));
  return rows;
}

function cleanError(value) {
  return String(value?.message || value || 'Unknown source error').replace(/\s+/g, ' ').slice(0, 400);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForRetry(ms) {
  let remaining = ms;
  while (remaining > 0) {
    const slice = Math.min(30_000, remaining);
    await wait(slice);
    remaining -= slice;
  }
}

async function requestJson(url, { attempts = 4 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(60_000),
        headers: {
          Accept: 'application/json',
          'User-Agent': 'tezos.systems ecosystem stats generator'
        }
      });
      if (response.ok) return response.json();
      const body = await response.text();
      if (![429, 500, 502, 503, 504].includes(response.status)) {
        throw new Error(`HTTP ${response.status}: ${body.slice(0, 240)}`);
      }
      lastError = new Error(`HTTP ${response.status}: ${body.slice(0, 240)}`);
    } catch (error) {
      lastError = error;
    }
    await wait(Math.min(4_000, attempt * 500));
  }
  throw lastError;
}

async function requestTzktNetworkJson(url, { attempts = 8 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const paceDelay = Math.max(0, tzktNetworkNextRequestAt - Date.now());
    if (paceDelay) await wait(paceDelay);
    tzktNetworkNextRequestAt = Date.now() + TZKT_NETWORK_REQUEST_GAP_MS;
    let retryAfterMs = 0;
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(60_000),
        headers: {
          Accept: 'application/json',
          'User-Agent': 'tezos.systems network-wide activity generator'
        }
      });
      if (response.ok) return response.json();
      const body = await response.text();
      const retryAfter = Number(response.headers.get('retry-after'));
      if (Number.isFinite(retryAfter) && retryAfter > 0) retryAfterMs = retryAfter * 1000;
      if (response.status !== 429 && ![500, 502, 503, 504].includes(response.status)) {
        throw new Error(`HTTP ${response.status}: ${body.slice(0, 240)}`);
      }
      lastError = new Error(`HTTP ${response.status}: ${body.slice(0, 240)}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) {
      const delay = Math.max(retryAfterMs, Math.min(30_000, 1_000 * (2 ** (attempt - 1))));
      console.warn(`TzKT network-wide scan throttled; retrying in ${Math.round(delay / 1000)}s (${attempt}/${attempts})`);
      await waitForRetry(delay);
    }
  }
  throw new Error(`TzKT network-wide scan exhausted ${attempts} attempts: ${cleanError(lastError)}`);
}

async function paceBlockscoutRequest() {
  const previous = blockscoutRequestGate;
  let release;
  blockscoutRequestGate = new Promise((resolve) => {
    release = resolve;
  });
  await previous;
  const delay = Math.max(0, blockscoutNextRequestAt - Date.now());
  if (delay) await wait(delay);
  blockscoutNextRequestAt = Date.now() + BLOCKSCOUT_REQUEST_GAP_MS;
  release();
}

function blockscoutRateLimited(payload) {
  const message = `${payload?.message || ''} ${typeof payload?.result === 'string' ? payload.result : ''}`;
  return /too many requests|rate limit|limit reached/i.test(message);
}

function extendBlockscoutCooldown(ms) {
  blockscoutNextRequestAt = Math.max(blockscoutNextRequestAt, Date.now() + ms);
}

async function requestBlockscoutJson(url, { attempts = 10 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let retryAfterMs = 0;
    try {
      await paceBlockscoutRequest();
      const response = await fetch(url, {
        signal: AbortSignal.timeout(60_000),
        headers: {
          Accept: 'application/json',
          'User-Agent': 'tezos.systems ecosystem stats generator'
        }
      });
      const body = await response.text();
      let payload = null;
      try {
        payload = JSON.parse(body);
      } catch {
        // The body is preserved in the source error below.
      }
      const payloadRateLimited = blockscoutRateLimited(payload);
      if (response.ok && payload && !payloadRateLimited) return payload;
      const retryAfter = Number(response.headers.get('retry-after'));
      if (Number.isFinite(retryAfter) && retryAfter > 0) retryAfterMs = retryAfter * 1000;
      if (payloadRateLimited) retryAfterMs = Math.max(retryAfterMs, 60_000);
      if (response.status !== 429
        && ![500, 502, 503, 504].includes(response.status)
        && !payloadRateLimited) {
        throw new Error(`HTTP ${response.status}: ${body.slice(0, 240)}`);
      }
      lastError = new Error(`HTTP ${response.status}: ${body.slice(0, 240)}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) {
      const delay = Math.max(retryAfterMs, Math.min(30_000, 1_000 * (2 ** (attempt - 1))));
      extendBlockscoutCooldown(delay);
      console.warn(`Blockscout request throttled; retrying in ${Math.round(delay / 1000)}s (${attempt}/${attempts})`);
      await waitForRetry(delay);
    }
  }
  const request = new URL(url);
  const address = request.searchParams.get('address');
  throw new Error(`Blockscout request exhausted ${attempts} attempts${address ? ` for ${address}` : ''}: ${cleanError(lastError)}`);
}

async function mapLimit(values, limit, worker) {
  const result = new Array(values.length);
  let cursor = 0;
  async function run() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      result[index] = await worker(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, run));
  return result;
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function readExisting() {
  try {
    return await readJson(OUTPUT_FILE);
  } catch {
    return null;
  }
}

async function fetchTzktCatalogKind(kind) {
  const rows = [];
  let after = 0;
  while (true) {
    const query = new URLSearchParams({
      kind,
      'alias.null': 'false',
      select: 'id,address,alias,kind,firstActivityTime,lastActivityTime',
      'sort.asc': 'id',
      limit: String(TZKT_PAGE_SIZE)
    });
    if (after) query.set('id.gt', String(after));
    const page = await requestJson(`${TZKT}/contracts?${query}`);
    rows.push(...page);
    if (page.length < TZKT_PAGE_SIZE) break;
    const next = Number(page.at(-1)?.id);
    assert(Number.isSafeInteger(next) && next > after, `TzKT ${kind} catalog keyset did not advance`);
    after = next;
  }
  tzktCatalogReceipt.push({
    kind,
    aliasedContracts: rows.length,
    pagination: 'id.gt keyset',
    pageSize: TZKT_PAGE_SIZE
  });
  console.log(`Resolved complete TzKT ${kind} alias catalog (${rows.length} contracts)`);
  return rows;
}

async function fetchTzktCatalog(kinds) {
  const catalogs = await Promise.all([...new Set(kinds)].map(fetchTzktCatalogKind));
  return [...new Map(catalogs.flat().map((contract) => [contract.address, contract])).values()];
}

async function fetchExplicitTzktContracts(addresses) {
  const rows = [];
  for (const batch of chunks(addresses, 50)) {
    const query = new URLSearchParams({
      'address.in': batch.join(','),
      select: 'address,alias,kind,firstActivityTime,lastActivityTime',
      limit: String(batch.length)
    });
    rows.push(...await requestJson(`${TZKT}/contracts?${query}`));
  }
  return rows;
}

async function resolveContracts(manifest, previousSnapshot = null) {
  const kinds = manifest.apps.flatMap((app) => app.layers.flatMap((layer) => (
    layer.contractSource.type === 'tzkt_alias_catalog' ? layer.contractSource.kinds : []
  )));
  const catalog = kinds.length ? await fetchTzktCatalog(kinds) : [];
  const explicitTezos = manifest.apps.flatMap((app) => app.layers.flatMap((layer) => (
    layer.id === 'tezos' && layer.contractSource.type === 'addresses'
      ? layer.contractSource.addresses
      : []
  )));
  const explicitRows = explicitTezos.length ? await fetchExplicitTzktContracts(explicitTezos) : [];
  const explicitLookup = new Map(explicitRows.map((contract) => [contract.address, contract]));
  const assigned = new Map();
  const resolved = new Map();

  for (const app of manifest.apps) {
    for (const layer of app.layers) {
      const source = layer.contractSource;
      let contracts;
      let previousContracts = [];
      if (layer.id === 'tezos' && source.type === 'tzkt_alias_catalog') {
        contracts = catalog.filter((contract) => (
          contract.alias
          && source.aliasPatterns.some((pattern) => new RegExp(pattern, 'i').test(contract.alias))
        ));
        const previousLayer = previousSnapshot?.apps
          ?.find((candidate) => candidate.id === app.id)
          ?.layers?.find((candidate) => candidate.id === layer.id);
        previousContracts = previousLayer?.contracts || [];
      } else if (layer.id === 'tezos') {
        contracts = source.addresses.map((address) => explicitLookup.get(address) || {
          address,
          alias: null,
          kind: 'smart_contract',
          firstActivityTime: layer.since,
          lastActivityTime: null
        });
      } else {
        contracts = source.addresses.map((address) => ({
          address,
          alias: null,
          kind: 'evm_contract',
          firstActivityTime: layer.since,
          lastActivityTime: null
        }));
      }
      contracts = mergeResolvedContracts(contracts, previousContracts);
      assert(contracts.length, `No contracts resolved for ${app.id}/${layer.id}`);
      for (const contract of contracts) {
        const key = `${layer.id}:${contract.address.toLowerCase()}`;
        assert(!assigned.has(key), `${contract.address} resolves to both ${assigned.get(key)} and ${app.id}`);
        assigned.set(key, app.id);
      }
      resolved.set(`${app.id}:${layer.id}`, contracts);
      console.log(`Resolved ${app.id}/${layer.id} (${contracts.length} contract${contracts.length === 1 ? '' : 's'})`);
    }
  }
  return resolved;
}

function resolvedApps(manifest, resolved) {
  return manifest.apps.map((app) => ({
    id: app.id,
    layers: app.layers.map((layer) => ({
      id: layer.id,
      contracts: resolved.get(`${app.id}:${layer.id}`)
    }))
  }));
}

function earliestNewContract(manifest, resolved, previousSnapshot) {
  if (!previousSnapshot) return null;
  let earliest = null;
  for (const app of manifest.apps) {
    const previousApp = previousSnapshot.apps.find((candidate) => candidate.id === app.id);
    for (const layer of app.layers) {
      const priorAddresses = new Set(
        (previousApp?.layers?.find((candidate) => candidate.id === layer.id)?.contracts || [])
          .map((contract) => contract.address.toLowerCase())
      );
      for (const contract of resolved.get(`${app.id}:${layer.id}`)) {
        if (priorAddresses.has(contract.address.toLowerCase())) continue;
        const firstActivity = new Date(Math.max(
          Date.parse(contract.firstActivityTime || layer.since),
          Date.parse(layer.since)
        ));
        if (!earliest || firstActivity < earliest) earliest = firstActivity;
      }
    }
  }
  return earliest;
}

async function fetchTzktMetrics(assignments, from, to) {
  const assignmentByAddress = new Map(assignments.map((assignment) => [
    assignment.address.toLowerCase(),
    assignment
  ]));
  const metrics = new Map([...new Set(assignments.map((assignment) => assignment.appId))]
    .map((appId) => [appId, emptyMetric()]));
  const batchResults = await mapLimit(
    chunks(assignments, TZKT_ADDRESS_BATCH),
    REQUEST_CONCURRENCY,
    async (batch) => {
      const local = new Map();
      const addresses = batch.map((assignment) => assignment.address);
      let after = 0;
      while (true) {
        const query = new URLSearchParams({
          'target.in': addresses.join(','),
          'timestamp.ge': iso(from),
          'timestamp.lt': iso(to),
          status: 'applied',
          select: 'id,nonce,sender,target,timestamp',
          'sort.asc': 'id',
          limit: String(TZKT_PAGE_SIZE)
        });
        if (after) query.set('id.gt', String(after));
        const rows = await requestJson(`${TZKT}/operations/transactions?${query}`);
        for (const row of rows) {
          const sender = row?.sender?.address;
          const target = row?.target?.address?.toLowerCase();
          const assignment = assignmentByAddress.get(target);
          if (!assignment
            || Date.parse(row?.timestamp || '') < assignment.eligibleFrom
            || row?.nonce != null
            || !/^tz[1-4][1-9A-HJ-NP-Za-km-z]{33}$/.test(sender || '')) continue;
          const metric = local.get(assignment.appId) || emptyMetric();
          metric.wallets.add(sender);
          metric.operations.add(`tezos:${row.id}`);
          local.set(assignment.appId, metric);
        }
        if (rows.length < TZKT_PAGE_SIZE) break;
        const next = Number(rows.at(-1)?.id);
        assert(Number.isSafeInteger(next) && next > after, 'TzKT transaction keyset did not advance');
        after = next;
      }
      return local;
    }
  );
  for (const local of batchResults) {
    for (const [appId, metric] of local) mergeMetric(metrics.get(appId), metric);
  }
  return metrics;
}

async function fetchTzktNetworkMetric(from, to, status) {
  const wallets = new Set();
  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();
  assert(Number.isFinite(fromMs) && Number.isFinite(toMs) && fromMs < toMs, 'Invalid TzKT network-wide activity range');
  let transactionsScanned = 0;
  let requests = 0;

  for (let dayStartMs = fromMs; dayStartMs < toMs; dayStartMs += 24 * 60 * 60 * 1000) {
    const dayStart = new Date(dayStartMs);
    const dayEnd = new Date(Math.min(dayStartMs + (24 * 60 * 60 * 1000), toMs));
    let after = 0;
    while (true) {
      const query = new URLSearchParams({
        'timestamp.ge': iso(dayStart),
        'timestamp.lt': iso(dayEnd),
        status: 'applied',
        'initiator.null': 'true',
        'select.values': 'id,sender',
        'sort.asc': 'id',
        limit: String(TZKT_PAGE_SIZE)
      });
      if (after) query.set('id.gt', String(after));
      const rows = await requestTzktNetworkJson(`${TZKT}/operations/transactions?${query}`);
      assert(Array.isArray(rows), 'TzKT network-wide transaction response is not an array');
      requests += 1;
      transactionsScanned += rows.length;
      for (const row of rows) {
        const [id, sender] = row;
        const wallet = tezosNetworkWallet({ sender });
        if (wallet) wallets.add(wallet);
        after = Number(id);
      }
      if (rows.length < TZKT_PAGE_SIZE) break;
      assert(Number.isSafeInteger(after), 'TzKT network-wide transaction keyset did not advance');
    }
  }

  console.log(`Measured ${wallets.size} Tezos network-wide active addresses from ${transactionsScanned} applied top-level transactions`);
  return {
    status,
    activeWallets: wallets.size,
    approximate: false,
    transactionsScanned,
    requests
  };
}

async function fetchEtherlinkNetworkChart(from, to) {
  const query = new URLSearchParams({
    from: iso(from).slice(0, 10),
    to: iso(to).slice(0, 10),
    resolution: 'WEEK'
  });
  const payload = await requestJson(`${ETHERLINK_STATS}/lines/activeAccounts?${query}`);
  assert(payload?.info?.id === 'activeAccounts', 'Etherlink network-wide source did not return the activeAccounts chart');
  assert(payload.info.resolutions?.includes('WEEK'), 'Etherlink activeAccounts chart does not expose weekly resolution');
  assert(Array.isArray(payload.chart), 'Etherlink activeAccounts chart is missing rows');
  return new Map(payload.chart.map((row) => [row.date, row]));
}

function etherlinkNetworkMetric(chart, weekStart, status) {
  const row = chart.get(iso(weekStart).slice(0, 10));
  const activeWallets = Number(row?.value);
  assert(Number.isSafeInteger(activeWallets) && activeWallets >= 0, `Etherlink activeAccounts is unavailable for ${iso(weekStart).slice(0, 10)}`);
  return {
    status,
    activeWallets,
    approximate: row?.is_approximate === true,
    sourcePeriod: {
      from: row.date,
      to: row.date_to
    }
  };
}

function blockscoutSucceeded(row) {
  return row?.isError === '0' && (!row.txreceipt_status || row.txreceipt_status === '1');
}

function compactBlockscoutRow(row) {
  return {
    timestamp: blockscoutTimestamp(row),
    from: row?.from,
    to: row?.to,
    hash: row?.hash,
    isError: row?.isError,
    txreceipt_status: row?.txreceipt_status
  };
}

async function fetchBlockscoutSlice(address, from, to, depth = 0) {
  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();
  assert(Number.isFinite(fromMs) && Number.isFinite(toMs) && fromMs < toMs, `Invalid Blockscout range for ${address}`);
  if (toMs - fromMs > BLOCKSCOUT_MAX_QUERY_RANGE_MS) {
    assert(depth < 20, `Blockscout range subdivision did not converge for ${address}`);
    const middle = new Date(fromMs + BLOCKSCOUT_MAX_QUERY_RANGE_MS);
    const left = await fetchBlockscoutSlice(address, from, middle, depth + 1);
    const right = await fetchBlockscoutSlice(address, middle, to, depth + 1);
    return [...left, ...right];
  }
  const query = new URLSearchParams({
    module: 'account',
    action: 'txlist',
    address,
    start_timestamp: String(Math.floor(new Date(from).getTime() / 1000)),
    end_timestamp: String(Math.max(0, Math.floor(new Date(to).getTime() / 1000) - 1)),
    filter_by: 'to',
    page: '1',
    offset: String(BLOCKSCOUT_MAX_ROWS),
    sort: 'asc'
  });
  const payload = await requestBlockscoutJson(`${ETHERLINK}?${query}`);
  const rows = Array.isArray(payload?.result) ? payload.result : [];
  if (payload?.status === '0' && !/No transactions found/i.test(payload?.message || payload?.result || '')) {
    throw new Error(`Blockscout txlist failed for ${address}: ${payload?.message || payload?.result}`);
  }
  if (rows.length < BLOCKSCOUT_MAX_ROWS) {
    return rows.map(compactBlockscoutRow).filter(({ timestamp }) => Number.isFinite(timestamp));
  }
  assert(depth < 20, `Blockscout range subdivision did not converge for ${address}`);
  const middle = new Date(fromMs + Math.floor((toMs - fromMs) / 2));
  assert(middle.getTime() > fromMs && middle.getTime() < toMs, `Blockscout range cannot be divided for ${address}`);
  const left = await fetchBlockscoutSlice(address, from, middle, depth + 1);
  const right = await fetchBlockscoutSlice(address, middle, to, depth + 1);
  return [...left, ...right];
}

function blockscoutTimestamp(row) {
  const seconds = Number(row?.timeStamp ?? row?.timestamp);
  if (Number.isFinite(seconds)) return seconds * 1000;
  return Date.parse(row?.timeStamp || row?.timestamp || '');
}

function parseCsvLine(line) {
  const values = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      values.push(value);
      value = '';
    } else {
      value += character;
    }
  }
  values.push(value);
  return values;
}

async function fetchBlockscoutCsv(address, from, to) {
  const query = new URLSearchParams({
    from_period: new Date(from).toISOString().slice(0, 10),
    to_period: new Date(to).toISOString().slice(0, 10)
  });
  const url = `https://explorer.etherlink.com/api/v2/addresses/${address}/transactions/csv?${query}`;
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await paceBlockscoutRequest();
      // Etherlink's CSV edge currently rejects Node's fetch fingerprint with
      // HTTP 406. Use Blockscout's documented curl transport for this export;
      // all parsing, filtering, and receipts remain deterministic Node code.
      const { stdout: text } = await execFileAsync('curl', [
        '--compressed',
        '--connect-timeout', '30',
        '--max-time', '600',
        '--fail-with-body',
        '--silent',
        '--show-error',
        '--url', url
      ], {
        encoding: 'utf8',
        maxBuffer: 512 * 1024 * 1024
      });
      const lines = text.split(/\r?\n/);
      assert(lines.length, `Blockscout CSV was empty for ${address}`);
      const headers = parseCsvLine(lines[0]);
      const indexes = Object.fromEntries(headers.map((header, index) => [header, index]));
      for (const field of ['TxHash', 'UnixTimestamp', 'FromAddress', 'ToAddress', 'Type', 'Status']) {
        assert(Number.isInteger(indexes[field]), `Blockscout CSV for ${address} is missing ${field}`);
      }
      const target = address.toLowerCase();
      const rows = [];
      for (let index = 1; index < lines.length; index += 1) {
        const line = lines[index];
        if (!line) continue;
        const values = parseCsvLine(line);
        const timestamp = blockscoutTimestamp({ timestamp: values[indexes.UnixTimestamp] });
        const toAddress = values[indexes.ToAddress];
        if (!Number.isFinite(timestamp)
          || String(values[indexes.Type] || '').toUpperCase() !== 'IN'
          || String(toAddress || '').toLowerCase() !== target) continue;
        const succeeded = String(values[indexes.Status] || '').toLowerCase() === 'ok';
        rows.push({
          timestamp,
          from: values[indexes.FromAddress],
          to: toAddress,
          hash: values[indexes.TxHash],
          isError: succeeded ? '0' : '1',
          txreceipt_status: succeeded ? '1' : '0'
        });
      }
      return rows;
    } catch (error) {
      lastError = error;
      if (attempt < 2) {
        extendBlockscoutCooldown(60_000);
        console.warn(`Blockscout CSV export failed; retrying in 60s (${cleanError(error)})`);
        await waitForRetry(60_000);
      }
    }
  }
  throw lastError;
}

async function prepareBlockscoutHistory(manifest, resolved, from, to) {
  const assignments = manifest.apps.flatMap((app) => app.layers
    .filter((layer) => layer.id === 'etherlink')
    .flatMap((layer) => resolved.get(`${app.id}:${layer.id}`).map((contract) => ({
      address: contract.address,
      appId: app.id,
      from: new Date(Math.max(Date.parse(layer.since), new Date(from).getTime()))
    }))));
  if (!assignments.length) return new Map();
  const csvBackfill = hasFlag('--backfill');
  console.log(`Prefetching Etherlink history for ${assignments.length} reviewed contracts via ${csvBackfill ? 'complete CSV exports' : 'bounded JSON ranges'}`);
  const results = await mapLimit(assignments, csvBackfill ? 1 : BLOCKSCOUT_REQUEST_CONCURRENCY, async (assignment, index) => {
    const rows = csvBackfill
      ? await fetchBlockscoutCsv(assignment.address, assignment.from, to)
      : await fetchBlockscoutSlice(assignment.address, assignment.from, to);
    if ((index + 1) % 10 === 0 || index === assignments.length - 1) {
      console.log(`Fetched Etherlink contract ${index + 1}/${assignments.length}`);
    }
    return {
      address: assignment.address.toLowerCase(),
      rows
    };
  });
  return new Map(results.map(({ address, rows }) => [address, rows]));
}

async function fetchBlockscoutMetrics(assignments, to, history = null) {
  const metrics = new Map([...new Set(assignments.map((assignment) => assignment.appId))]
    .map((appId) => [appId, emptyMetric()]));
  const toMs = new Date(to).getTime();
  const results = history
    ? assignments.map((assignment) => ({
        assignment,
        rows: (history.get(assignment.address.toLowerCase()) || [])
          .filter(({ timestamp }) => timestamp >= new Date(assignment.from).getTime() && timestamp < toMs)
      }))
    : await mapLimit(assignments, BLOCKSCOUT_REQUEST_CONCURRENCY, async (assignment) => ({
        assignment,
        rows: await fetchBlockscoutSlice(assignment.address, assignment.from, to)
      }));
  for (const { assignment, rows } of results) {
    const target = assignment.address.toLowerCase();
    const metric = metrics.get(assignment.appId);
    for (const row of rows) {
      const sender = String(row?.from || '').toLowerCase();
      const toAddress = String(row?.to || '').toLowerCase();
      if (!blockscoutSucceeded(row)
        || toAddress !== target
        || !/^0x[0-9a-f]{40}$/.test(sender)
        || sender === '0x0000000000000000000000000000000000000000') continue;
      metric.wallets.add(sender);
      metric.operations.add(`etherlink:${String(row.hash || '').toLowerCase()}`);
    }
  }
  return metrics;
}

function activeTezosContracts(contracts, from, to) {
  return contracts.filter((contract) => (
    Date.parse(contract.firstActivityTime || from) < new Date(to).getTime()
    && (!contract.lastActivityTime || Date.parse(contract.lastActivityTime) >= new Date(from).getTime())
  ));
}

async function collectWeek(manifest, resolved, weekStart, weekEnd, etherlinkHistory = null) {
  const appResults = new Map(manifest.apps.map((app) => [app.id, {
    app,
    layers: {}
  }]));
  const tezosAssignments = [];
  const etherlinkAssignments = [];
  for (const app of manifest.apps) {
    const result = appResults.get(app.id);
    for (const layer of app.layers) {
      const contracts = resolved.get(`${app.id}:${layer.id}`);
      const layerStart = new Date(layer.since);
      if (weekEnd <= layerStart) {
        result.layers[layer.id] = null;
        continue;
      }
      const from = weekStart < layerStart ? layerStart : weekStart;
      if (layer.id === 'tezos') {
        result.layers[layer.id] = emptyMetric();
        for (const contract of activeTezosContracts(contracts, from, weekEnd)) {
          tezosAssignments.push({
            address: contract.address,
            appId: app.id,
            eligibleFrom: from.getTime()
          });
        }
      } else {
        result.layers[layer.id] = emptyMetric();
        for (const contract of contracts) {
          etherlinkAssignments.push({
            appId: app.id,
            layerId: layer.id,
            address: contract.address,
            from
          });
        }
      }
    }
  }
  const [tezosMetrics, etherlinkMetrics] = await Promise.all([
    tezosAssignments.length
      ? fetchTzktMetrics(tezosAssignments, weekStart, weekEnd)
      : new Map(),
    etherlinkAssignments.length
      ? fetchBlockscoutMetrics(etherlinkAssignments, weekEnd, etherlinkHistory)
      : new Map()
  ]);
  for (const [appId, metric] of tezosMetrics) appResults.get(appId).layers.tezos = metric;
  for (const [appId, metric] of etherlinkMetrics) appResults.get(appId).layers.etherlink = metric;
  return appResults;
}

function buildPublicWeek(app, result, weekStart, weekEnd, previousRaw) {
  const layers = {};
  const all = emptyMetric();
  const previousAll = emptyMetric();
  let activeLayerCount = 0;
  for (const layerId of LAYER_IDS) {
    const metric = result.layers[layerId];
    const prior = previousRaw?.layers?.[layerId] || null;
    if (!metric) {
      layers[layerId] = { status: app.layers.some((layer) => layer.id === layerId) ? 'not-active' : 'not-tracked' };
      continue;
    }
    activeLayerCount += 1;
    layers[layerId] = { status: 'complete', ...publicMetric(metric, prior) };
    mergeMetric(all, metric, `${layerId}:`);
    if (prior) mergeMetric(previousAll, prior, `${layerId}:`);
  }
  return {
    weekStart: iso(weekStart),
    weekEnd: iso(weekEnd),
    status: activeLayerCount ? 'complete' : 'not-active',
    layers,
    all: activeLayerCount ? publicMetric(all, previousRaw ? previousAll : null) : {
      activeWallets: null,
      interactions: null,
      callsPerWallet: null,
      returningWalletRate: null
    }
  };
}

function buildEcosystemWeek(rawByApp, previousRawByApp, weekStart, weekEnd) {
  const current = Object.fromEntries(LAYER_IDS.map((layer) => [layer, emptyMetric()]));
  const previous = Object.fromEntries(LAYER_IDS.map((layer) => [layer, emptyMetric()]));
  const activeApps = Object.fromEntries(LAYER_IDS.map((layer) => [layer, 0]));
  for (const result of rawByApp.values()) {
    const prior = previousRawByApp?.get(result.app.id);
    for (const layerId of LAYER_IDS) {
      if (result.layers[layerId]) {
        activeApps[layerId] += 1;
        mergeMetric(current[layerId], result.layers[layerId]);
      }
      if (prior?.layers?.[layerId]) mergeMetric(previous[layerId], prior.layers[layerId]);
    }
  }
  const all = emptyMetric();
  const previousAll = emptyMetric();
  for (const layerId of LAYER_IDS) {
    mergeMetric(all, current[layerId], `${layerId}:`);
    mergeMetric(previousAll, previous[layerId], `${layerId}:`);
  }
  return {
    weekStart: iso(weekStart),
    weekEnd: iso(weekEnd),
    status: 'complete',
    layers: Object.fromEntries(LAYER_IDS.map((layerId) => [
      layerId,
      activeApps[layerId]
        ? { status: 'complete', ...publicMetric(current[layerId], previousRawByApp ? previous[layerId] : null) }
        : { status: 'not-active', activeWallets: null, interactions: null, callsPerWallet: null, returningWalletRate: null }
    ])),
    all: publicMetric(all, previousRawByApp ? previousAll : null)
  };
}

function mergeRows(existing, replacement, replaceFrom) {
  return [
    ...(existing || []).filter((row) => Date.parse(row.weekStart) < replaceFrom.getTime()),
    ...replacement
  ].sort((left, right) => Date.parse(left.weekStart) - Date.parse(right.weekStart));
}

async function buildNetworkActivity(existing, lastCompleteStart, currentWeekStart, generatedAt) {
  const previousWeeks = Array.isArray(existing?.weeks) ? existing.weeks : [];
  const rebuildStart = networkRebuildStart(previousWeeks, lastCompleteStart);
  const etherlinkChartPromise = fetchEtherlinkNetworkChart(rebuildStart, generatedAt);
  const completedTezos = [];
  for (let weekStart = new Date(rebuildStart); weekStart < currentWeekStart; weekStart = addWeeks(weekStart, 1)) {
    const weekEnd = addWeeks(weekStart, 1);
    completedTezos.push({
      weekStart,
      weekEnd,
      metric: await fetchTzktNetworkMetric(weekStart, weekEnd, 'complete')
    });
  }
  const tezosPartial = await fetchTzktNetworkMetric(currentWeekStart, generatedAt, 'partial');
  const etherlinkChart = await etherlinkChartPromise;
  const replacements = completedTezos.map(({ weekStart, weekEnd, metric }) => {
    const layers = {
      tezos: metric,
      etherlink: etherlinkNetworkMetric(etherlinkChart, weekStart, 'complete')
    };
    return {
      weekStart: iso(weekStart),
      weekEnd: iso(weekEnd),
      status: 'complete',
      layers,
      all: combineNetworkActivity(layers, 'complete')
    };
  });
  const partialLayers = {
    tezos: tezosPartial,
    etherlink: etherlinkNetworkMetric(etherlinkChart, currentWeekStart, 'partial')
  };
  const weeks = mergeRows(previousWeeks, replacements, rebuildStart);
  const partialWeek = {
    weekStart: iso(currentWeekStart),
    observedAt: iso(generatedAt),
    status: 'partial',
    layers: partialLayers,
    all: combineNetworkActivity(partialLayers, 'partial')
  };
  return {
    definition: 'Distinct source-native addresses originating transactions anywhere on each layer; the all-layer value sums wallet-layer identities without inferring shared ownership',
    coverageStart: weeks[0].weekStart,
    weeks,
    partialWeek
  };
}

function normalizeEcosystemCoverage(rows, manifest) {
  const firstActive = Object.fromEntries(LAYER_IDS.map((layerId) => [
    layerId,
    Math.min(...manifest.apps.flatMap((app) => app.layers
      .filter((layer) => layer.id === layerId)
      .map((layer) => Date.parse(layer.since))))
  ]));
  return rows.map((row) => ({
    ...row,
    layers: Object.fromEntries(LAYER_IDS.map((layerId) => {
      const active = Date.parse(row.weekEnd) > firstActive[layerId];
      return [layerId, active
        ? { ...row.layers[layerId], status: 'complete' }
        : { status: 'not-active', activeWallets: null, interactions: null, callsPerWallet: null, returningWalletRate: null }];
    }))
  }));
}

function resolvedLayerReceipt(app, layer, contracts) {
  return {
    id: layer.id,
    since: layer.since,
    contractSource: layer.contractSource.type,
    proofUrls: layer.proofUrls,
    contractCount: contracts.length,
    contracts: contracts.map((contract) => ({
      address: contract.address,
      alias: contract.alias || null,
      kind: contract.kind || null,
      firstActivityTime: contract.firstActivityTime || layer.since,
      lastActivityTime: contract.lastActivityTime || null,
      sourceUrl: layer.id === 'tezos'
        ? `https://tzkt.io/${contract.address}`
        : `https://explorer.etherlink.com/address/${contract.address}`
    }))
  };
}

async function buildSnapshot(manifest, existing, generatedAt) {
  const manifestHash = stableHash(manifest);
  const reusableExisting = existing
    && existing.manifestHash === manifestHash
    && validateSnapshot(existing, manifest, { allowMissingNetworkActivity: true }).length === 0
    ? existing
    : null;
  const resolved = await resolveContracts(manifest, reusableExisting);
  const resolvedHash = contractUniverseHash(resolvedApps(manifest, resolved));
  const currentWeekStart = utcWeekStart(generatedAt);
  const lastCompleteStart = addWeeks(currentWeekStart, -1);
  const earliest = utcWeekStart(new Date(Math.min(...manifest.apps.flatMap((app) => (
    app.layers.map((layer) => Date.parse(layer.since))
  )))));
  const incremental = !hasFlag('--backfill') && reusableExisting;
  const recentReplaceFrom = addWeeks(lastCompleteStart, -(RECENT_WEEKS_TO_REBUILD - 1));
  const newContractStart = incremental ? earliestNewContract(manifest, resolved, reusableExisting) : null;
  const replaceFrom = incremental
    ? new Date(Math.min(
      recentReplaceFrom.getTime(),
      newContractStart ? utcWeekStart(newContractStart).getTime() : recentReplaceFrom.getTime()
    ))
    : earliest;
  // Retention for the first replaced row needs the preceding raw wallet
  // cohort. Fetch that week as a private warm-up row without replacing its
  // already-published aggregate.
  const collectFrom = incremental && replaceFrom > earliest ? addWeeks(replaceFrom, -1) : replaceFrom;
  const completeStarts = [];
  for (let cursor = collectFrom; cursor <= lastCompleteStart; cursor = addWeeks(cursor, 1)) completeStarts.push(cursor);
  const etherlinkHistory = await prepareBlockscoutHistory(manifest, resolved, collectFrom, generatedAt);

  const appRows = new Map(manifest.apps.map((app) => [app.id, []]));
  const ecosystemRows = [];
  let previousRaw = null;
  for (const [index, weekStart] of completeStarts.entries()) {
    const weekEnd = addWeeks(weekStart, 1);
    const raw = await collectWeek(manifest, resolved, weekStart, weekEnd, etherlinkHistory);
    const isWarmup = weekStart < replaceFrom;
    if (!isWarmup) {
      for (const app of manifest.apps) {
        appRows.get(app.id).push(buildPublicWeek(app, raw.get(app.id), weekStart, weekEnd, previousRaw?.get(app.id)));
      }
      ecosystemRows.push(buildEcosystemWeek(raw, previousRaw, weekStart, weekEnd));
    }
    previousRaw = raw;
    if (index === 0 || (index + 1) % 10 === 0 || index === completeStarts.length - 1) {
      console.log(`${isWarmup ? 'Warmed' : 'Collected'} ecosystem week ${index + 1}/${completeStarts.length}: ${iso(weekStart).slice(0, 10)}`);
    }
  }

  const partialRaw = await collectWeek(manifest, resolved, currentWeekStart, generatedAt, etherlinkHistory);
  const apps = manifest.apps.map((definition) => {
    const prior = existing?.apps?.find((app) => app.id === definition.id);
    const weekly = mergeRows(prior?.weekly, appRows.get(definition.id), replaceFrom);
    const result = partialRaw.get(definition.id);
    const partialLayers = {};
    const partialAll = emptyMetric();
    for (const layerId of LAYER_IDS) {
      const metric = result.layers[layerId];
      partialLayers[layerId] = metric
        ? { status: 'partial', ...publicMetric(metric) }
        : { status: definition.layers.some((layer) => layer.id === layerId) ? 'not-active' : 'not-tracked' };
      if (metric) mergeMetric(partialAll, metric, `${layerId}:`);
    }
    const app = {
      id: definition.id,
      name: definition.name,
      category: definition.category,
      website: definition.website,
      description: definition.description,
      layers: definition.layers.map((layer) => resolvedLayerReceipt(
        definition,
        layer,
        resolved.get(`${definition.id}:${layer.id}`)
      )),
      weekly,
      partial: {
        weekStart: iso(currentWeekStart),
        observedAt: iso(generatedAt),
        status: 'partial',
        layers: partialLayers,
        all: publicMetric(partialAll)
      }
    };
    app.summary = summarizeApp(app);
    return app;
  });

  const partialTotals = Object.fromEntries(LAYER_IDS.map((layerId) => [layerId, emptyMetric()]));
  for (const result of partialRaw.values()) {
    for (const layerId of LAYER_IDS) if (result.layers[layerId]) mergeMetric(partialTotals[layerId], result.layers[layerId]);
  }
  const partialAll = emptyMetric();
  for (const layerId of LAYER_IDS) mergeMetric(partialAll, partialTotals[layerId], `${layerId}:`);

  const weeks = normalizeEcosystemCoverage(mergeRows(existing?.weeks, ecosystemRows, replaceFrom), manifest);
  const networkActivity = await buildNetworkActivity(
    reusableExisting?.networkActivity,
    lastCompleteStart,
    currentWeekStart,
    generatedAt
  );
  const sourceReceipts = {
    tzkt: {
      label: 'TzKT API',
      url: 'https://api.tzkt.io/',
      credit: 'Powered by TzKT API',
      role: 'Network-wide applied top-level Tezos senders, reviewed-app transactions, and contract aliases',
      networkActivity: {
        endpoint: '/v1/operations/transactions',
        filter: 'status=applied, initiator.null=true, implicit sender',
        pagination: 'daily id.gt keyset',
        pageSize: TZKT_PAGE_SIZE
      },
      catalog: [...tzktCatalogReceipt].sort((left, right) => left.kind.localeCompare(right.kind, 'en'))
    },
    etherlink: {
      label: 'Etherlink Blockscout',
      url: 'https://explorer.etherlink.com/',
      role: 'Official network-wide weekly active-account statistics plus successful inbound reviewed-app transactions',
      networkActivity: {
        endpoint: '/stats-service/api/v1/lines/activeAccounts',
        chart: 'activeAccounts',
        resolution: 'WEEK',
        definition: 'Distinct from-addresses on transactions in consensus blocks'
      }
    }
  };
  const unsigned = {
    schemaVersion: ECOSYSTEM_SCHEMA_VERSION,
    generatedAt: iso(generatedAt),
    manifestHash,
    contractUniverseHash: resolvedHash,
    methodology: {
      weekBoundary: 'Monday 00:00 UTC through the following Monday 00:00 UTC',
      networkActivity: 'Distinct transaction-originating addresses anywhere on the selected layer during the week',
      networkTezosWallet: 'Implicit sender on an applied top-level TzKT transaction; this is equivalent to using the initiator for internal calls and otherwise the external sender',
      networkEtherlinkWallet: 'Official Blockscout Active Accounts weekly value: distinct from-addresses on transactions in consensus blocks; the current week may be approximate while it is still open',
      ranking: 'Distinct source-native wallets with at least one successful top-level call to a reviewed app contract in the last completed week',
      tezosWallet: 'Implicit tz1-tz4 sender on an applied nonce-free TzKT transaction',
      etherlinkWallet: 'Nonzero EVM from address on a successful inbound Blockscout transaction',
      allLayerIdentity: 'Tezos and Etherlink wallets are prefixed by layer and summed as wallet-layer identities; no cross-layer ownership is inferred',
      interaction: 'One unique top-level operation or EVM transaction hash',
      retention: 'Share of the previous completed week wallet cohort returning in the current completed week',
      yoy: 'Change from the weekday-aligned week beginning 52 weeks earlier',
      caveat: 'Wallets are pseudonymous addresses, not people. Automation, account-abstraction users, and multi-wallet behavior are not inferred away. The network-wide count and reviewed-app ranking are separate measures. Alias-based L1 app families are exhaustively resolved from paged TzKT smart-contract and asset rows, frozen and retained append-only across refreshes; a new match rebuilds from its first eligible week. The ranking covers only that disclosed contract universe.'
    },
    universe: {
      eligibleApps: apps.length,
      layers: Object.fromEntries(LAYER_IDS.map((layerId) => [
        layerId,
        apps.filter((app) => app.layers.some((layer) => layer.id === layerId)).length
      ])),
      categories: [...new Set(apps.map((app) => app.category))].sort()
    },
    completeWeek: {
      weekStart: iso(lastCompleteStart),
      weekEnd: iso(currentWeekStart)
    },
    partialWeek: {
      weekStart: iso(currentWeekStart),
      observedAt: iso(generatedAt),
      status: 'partial',
      layers: Object.fromEntries(LAYER_IDS.map((layerId) => [layerId, {
        status: 'partial',
        ...publicMetric(partialTotals[layerId])
      }])),
      all: { status: 'partial', ...publicMetric(partialAll) }
    },
    networkActivity,
    sourceReceipts,
    weeks,
    rankings: {
      all: rankApps(apps, 'all'),
      tezos: rankApps(apps, 'tezos'),
      etherlink: rankApps(apps, 'etherlink')
    },
    apps
  };
  return { contentHash: stableHash(unsigned), ...unsigned };
}

async function main() {
  const manifest = await readJson(MANIFEST_FILE);
  const manifestErrors = validateManifest(manifest);
  assert(!manifestErrors.length, `Invalid ecosystem manifest: ${manifestErrors.join('; ')}`);
  const existing = await readExisting();

  if (hasFlag('--check')) {
    assert(existing, 'data/ecosystem-stats.json is missing; run npm run refresh:ecosystem -- --backfill');
    const errors = validateSnapshot(existing, manifest);
    assert(!errors.length, `Invalid ecosystem snapshot: ${errors.join('; ')}`);
    const text = await fs.readFile(OUTPUT_FILE, 'utf8');
    assert(Buffer.byteLength(text) <= 4 * 1024 * 1024, 'Ecosystem snapshot exceeds the 4 MiB browser payload budget');
    console.log(`ok - ecosystem snapshot covers ${existing.apps.length} apps, ${existing.weeks.length} weeks, and ${existing.rankings.all.length} ranked apps (${existing.contentHash.slice(0, 12)})`);
    return;
  }

  const nowArg = argValue('--now');
  const generatedAt = nowArg ? new Date(nowArg) : new Date();
  assert(Number.isFinite(generatedAt.getTime()), `Invalid --now value: ${nowArg}`);
  const snapshot = await buildSnapshot(manifest, existing, generatedAt);
  const errors = validateSnapshot(snapshot, manifest);
  assert(!errors.length, `Generated invalid ecosystem snapshot: ${errors.join('; ')}`);
  const output = `${JSON.stringify(snapshot)}\n`;
  assert(Buffer.byteLength(output) <= 4 * 1024 * 1024, 'Generated ecosystem snapshot exceeds the 4 MiB payload budget');
  const temporaryFile = `${OUTPUT_FILE}.tmp-${process.pid}`;
  try {
    await fs.writeFile(temporaryFile, output);
    await fs.rename(temporaryFile, OUTPUT_FILE);
  } finally {
    await fs.rm(temporaryFile, { force: true });
  }
  console.log(`Wrote data/ecosystem-stats.json (${snapshot.apps.length} apps, ${snapshot.weeks.length} weeks, ${snapshot.contentHash.slice(0, 12)})`);
}

main().catch((error) => {
  console.error(`fail - ${cleanError(error)}`);
  process.exit(1);
});
