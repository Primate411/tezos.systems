#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'data', 'whale-watch.json');
const API = 'https://api.tzkt.io/v1';
const CHECK_ONLY = process.argv.includes('--check');
const MIN_TRANSFER_MUTEZ = 1_000 * 1e6;
const MIN_DORMANT_BALANCE_MUTEZ = 1_000_000 * 1e6;
const DORMANT_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;
const DISPLAY_DORMANT_LIMIT = 100;
const DISPLAY_FLOW_LIMIT = 24;
const PAGE_SIZE = 1_000;
const MAX_PAGES = 100;
const ACCOUNT_OPERATION_PAGE_SIZE = 100;
const MAX_ACCOUNT_OPERATION_PAGES = 100;
const THRESHOLDS_XTZ = [1_000, 10_000, 100_000, 1_000_000];
const ARCHIVE_PROVIDERS = Object.freeze([
  { id: 'octez-mainnet-archive', label: 'Octez mainnet archive', url: 'https://octez-mainnet-archive.octez.io' },
  { id: 'tzkt-mainnet-archive', label: 'TzKT mainnet archive RPC', url: 'https://rpc.tzkt.io/mainnet' }
]);
const BALANCE_EXIT_EMPTY_MUTEZ = 1 * 1e6;
const BALANCE_EXIT_NEAR_EMPTY_MUTEZ = 100 * 1e6;
const BALANCE_EXIT_CONCURRENCY = 6;
const ARCHIVE_TIMEOUT_MS = 15_000;
const BALANCE_EXIT_TOTAL_TIMEOUT_MS = 120_000;
const MAINNET_CHAIN_ID = 'NetXdQprcVkpaWU';

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function iso(value) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function accountKind(account) {
  const type = String(account?.type || '').toLowerCase();
  if (type === 'delegate') return 'baker';
  if (type === 'contract' || String(account?.address || '').startsWith('KT1')) return 'contract';
  if (type === 'rollup' || String(account?.address || '').startsWith('sr1')) return 'rollup';
  if (type === 'user') return 'implicit-account';
  return type || 'account';
}

function operationIdentity(operation) {
  const id = finite(operation?.id, 0);
  if (id > 0) return `op:${id}`;
  const hash = String(operation?.hash || operation?.operationGroupHash || '');
  const address = operation?.sender?.address || operation?.target?.address || '';
  return `hash:${hash}:${address}:${operation?.timestamp || ''}:${finite(operation?.amount, 0)}`;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'tezos.systems whale-watch generator' }
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json();
}

async function fetchPages(endpoint, params, { pageSize = PAGE_SIZE, maxPages = MAX_PAGES } = {}) {
  const rows = [];
  let offset = 0;
  let pages = 0;
  while (pages < maxPages) {
    const query = new URLSearchParams({ ...params, limit: String(pageSize), offset: String(offset) });
    const page = await fetchJson(`${API}${endpoint}?${query}`);
    if (!Array.isArray(page)) throw new Error(`Unexpected TzKT page for ${endpoint}`);
    rows.push(...page);
    pages += 1;
    if (page.length < pageSize) return { rows, pages, complete: true };
    offset += pageSize;
  }
  throw new Error(`TzKT pagination exceeded ${maxPages} pages for ${endpoint}`);
}

async function readPrevious() {
  try {
    return JSON.parse(await fs.readFile(OUTPUT, 'utf8'));
  } catch {
    return null;
  }
}

function normalizeAccount(account, generatedAt) {
  const activityTime = iso(account?.lastActivityTime);
  const dormantDays = activityTime
    ? Math.max(0, Math.floor((Date.parse(generatedAt) - Date.parse(activityTime)) / DAY_MS))
    : null;
  return {
    address: String(account?.address || ''),
    alias: String(account?.alias || '').trim() || null,
    labelSource: account?.alias ? 'tzkt-alias' : null,
    accountType: accountKind(account),
    balanceMutez: finite(account?.balance, 0),
    lastActivityLevel: finite(account?.lastActivity, 0) || null,
    lastActivityTime: activityTime,
    dormantDays
  };
}

function dormantRecordSort(left, right) {
  const leftTime = Date.parse(left.lastActivityTime || '1970-01-01T00:00:00Z');
  const rightTime = Date.parse(right.lastActivityTime || '1970-01-01T00:00:00Z');
  return leftTime - rightTime || right.balanceMutez - left.balanceMutez || left.address.localeCompare(right.address);
}

function operationType(operation) {
  const type = String(operation?.type || operation?.kind || '').toLowerCase();
  if (type === 'staking') return String(operation?.action || 'staking').toLowerCase();
  return type;
}

function isAppliedOperation(operation) {
  return String(operation?.status || '').toLowerCase() === 'applied';
}

/**
 * A moved amount is deliberately narrower than an operation's largest numeric
 * field. TzKT delegation `amount` is the sender balance, staking
 * `requestedAmount` is intent, and consensus `deposit` is a security deposit.
 * Only an applied transfer or the actual processed staking `amount` belongs
 * in the moved-amount field.
 */
function operationAmountMutez(operation) {
  if (!isAppliedOperation(operation)) return null;
  const type = operationType(operation);
  if (!['transaction', 'stake', 'unstake'].includes(type)) return null;
  const candidate = operation?.amountMutez ?? operation?.amount;
  if (candidate === null || candidate === undefined || candidate === '') return null;
  const value = finite(candidate, NaN);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function normalizeOperation(operation) {
  const sender = typeof operation?.sender === 'string' ? operation.sender : operation?.sender?.address;
  const target = typeof operation?.target === 'string' ? operation.target : operation?.target?.address;
  const senderAlias = String(operation?.sender?.alias || operation?.senderAlias || '').trim();
  const targetAlias = String(operation?.target?.alias || operation?.targetAlias || '').trim();
  return {
    id: finite(operation?.id, 0) || null,
    hash: String(operation?.hash || operation?.operationGroupHash || '') || null,
    level: finite(operation?.level, 0) || null,
    type: String(operation?.type || operation?.kind || 'operation'),
    action: operation?.action ? String(operation.action) : null,
    status: String(operation?.status || ''),
    timestamp: iso(operation?.timestamp),
    amountMutez: operationAmountMutez(operation),
    sender: sender || null,
    senderAlias: senderAlias || null,
    target: target || null,
    targetAlias: targetAlias || null
  };
}

function implicitAddress(value) {
  return /^tz[1-4][1-9A-HJ-NP-Za-km-z]{33}$/.test(String(value || ''));
}

function rawAccountAddress(value) {
  return typeof value === 'string' ? value : String(value?.address || '');
}

function rawAccountAlias(value) {
  return typeof value === 'string' ? '' : String(value?.alias || '').trim();
}

function isTopLevelImplicitOutflow(operation) {
  const sender = rawAccountAddress(operation?.sender);
  const target = rawAccountAddress(operation?.target);
  const amount = finite(operation?.amountMutez ?? operation?.amount, NaN);
  const level = finite(operation?.level, 0);
  const initiator = rawAccountAddress(operation?.initiator);
  return operationType(operation) === 'transaction'
    && isAppliedOperation(operation)
    && implicitAddress(sender)
    && Boolean(target)
    && sender !== target
    && !initiator
    && Number.isSafeInteger(level)
    && level > 1
    && Number.isSafeInteger(amount)
    && amount >= MIN_TRANSFER_MUTEZ;
}

/**
 * Bound the archive work to one immutable balance pair per implicit sender:
 * that sender's final qualifying outbound block in the complete 24h ledger.
 */
export function buildBalanceExitCandidates(transfers) {
  const groups = new Map();
  for (const operation of Array.isArray(transfers) ? transfers : []) {
    if (!isTopLevelImplicitOutflow(operation)) continue;
    const senderAddress = rawAccountAddress(operation.sender);
    const level = finite(operation.level, 0);
    const key = `${senderAddress}:${level}`;
    if (!groups.has(key)) {
      groups.set(key, {
        id: key,
        senderAddress,
        senderAlias: rawAccountAlias(operation.sender) || null,
        level,
        timestamp: iso(operation.timestamp),
        qualifyingOutflowMutez: 0,
        operationIds: [],
        hashes: [],
        destinations: new Map()
      });
    }
    const group = groups.get(key);
    const amountMutez = finite(operation?.amountMutez ?? operation?.amount, 0);
    const targetAddress = rawAccountAddress(operation.target);
    const targetAlias = rawAccountAlias(operation.target);
    if (!group.senderAlias && rawAccountAlias(operation.sender)) group.senderAlias = rawAccountAlias(operation.sender);
    if (Date.parse(operation.timestamp || '') > Date.parse(group.timestamp || '')) group.timestamp = iso(operation.timestamp);
    group.qualifyingOutflowMutez += amountMutez;
    const operationId = finite(operation.id, 0);
    if (operationId > 0) group.operationIds.push(operationId);
    if (operation.hash && !group.hashes.includes(String(operation.hash))) group.hashes.push(String(operation.hash));
    const destination = group.destinations.get(targetAddress) || {
      address: targetAddress,
      alias: targetAlias || null,
      qualifyingOutflowMutez: 0,
      operationCount: 0
    };
    if (!destination.alias && targetAlias) destination.alias = targetAlias;
    destination.qualifyingOutflowMutez += amountMutez;
    destination.operationCount += 1;
    group.destinations.set(targetAddress, destination);
  }

  const latestBySender = new Map();
  for (const group of groups.values()) {
    const current = latestBySender.get(group.senderAddress);
    if (!current
        || group.level > current.level
        || (group.level === current.level && Date.parse(group.timestamp || '') > Date.parse(current.timestamp || ''))) {
      latestBySender.set(group.senderAddress, group);
    }
  }
  return [...latestBySender.values()]
    .map((group) => ({
      ...group,
      operationIds: [...new Set(group.operationIds)].sort((left, right) => left - right),
      hashes: [...group.hashes].sort(),
      destinations: [...group.destinations.values()].sort((left, right) => (
        right.qualifyingOutflowMutez - left.qualifyingOutflowMutez
        || left.address.localeCompare(right.address)
      ))
    }))
    .sort((left, right) => left.senderAddress.localeCompare(right.senderAddress));
}

export function classifyBalanceExitCandidate(candidate, balanceBeforeMutez, balanceAfterMutez) {
  const before = Number(balanceBeforeMutez);
  const after = Number(balanceAfterMutez);
  if (!candidate || !Number.isSafeInteger(before) || before <= 0 || !Number.isSafeInteger(after) || after < 0) return null;
  let classification = '';
  if (after <= BALANCE_EXIT_EMPTY_MUTEZ) classification = 'emptied';
  else if (after <= BALANCE_EXIT_NEAR_EMPTY_MUTEZ && after * 100 <= before) classification = 'near-empty';
  if (!classification) return null;
  return {
    ...candidate,
    classification,
    balanceBeforeMutez: before,
    balanceAfterMutez: after,
    remainingPercent: (after / before) * 100
  };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = ARCHIVE_TIMEOUT_MS, parentSignal = null) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const signal = parentSignal
    ? AbortSignal.any([controller.signal, parentSignal])
    : controller.signal;
  try {
    return await fetch(url, { ...options, signal });
  } finally {
    clearTimeout(timer);
  }
}

async function archiveProviders() {
  const results = await Promise.all(ARCHIVE_PROVIDERS.map(async (provider) => {
    try {
      const [historyResponse, chainResponse] = await Promise.all([
        fetchWithTimeout(`${provider.url}/config/history_mode`),
        fetchWithTimeout(`${provider.url}/chains/main/chain_id`)
      ]);
      if (!historyResponse.ok || !chainResponse.ok) return null;
      const [history, chainId] = await Promise.all([historyResponse.json(), chainResponse.json()]);
      if (history?.history_mode !== 'archive' || chainId !== MAINNET_CHAIN_ID) return null;
      return { ...provider, chainId, verifiedAt: new Date().toISOString() };
    } catch {
      return null;
    }
  }));
  return results.filter(Boolean);
}

function missingContractBalance(payload) {
  return Array.isArray(payload) && payload.some((error) => (
    Array.isArray(error?.missing_key)
    && error.missing_key.at(-1) === 'balance'
  ));
}

async function fetchProviderJson(provider, pathName, signal) {
  const url = `${provider.url}${pathName}`;
  const response = await fetchWithTimeout(url, {}, ARCHIVE_TIMEOUT_MS, signal);
  const payload = await response.json().catch(() => null);
  return { response, payload, url };
}

async function fetchFullBalanceAtBlock(provider, address, level, blockHash, {
  allowDeallocated = false,
  predecessorHash = null,
  signal = null
} = {}) {
  const encodedAddress = encodeURIComponent(address);
  const pathName = `/chains/main/blocks/${encodeURIComponent(blockHash)}/context/contracts/${encodedAddress}/full_balance`;
  const { response, payload, url } = await fetchProviderJson(provider, pathName, signal);
  if (response.ok) {
    const balanceMutez = Number(payload);
    if (!Number.isSafeInteger(balanceMutez) || balanceMutez < 0) throw new Error('invalid full_balance value');
    return {
      provider: provider.id,
      chainId: provider.chainId,
      level,
      block: level,
      blockHash,
      predecessorHash,
      endpoint: 'full_balance',
      url,
      balanceMutez,
      deallocated: false
    };
  }
  if (allowDeallocated && missingContractBalance(payload)) {
    return {
      provider: provider.id,
      chainId: provider.chainId,
      level,
      block: level,
      blockHash,
      predecessorHash,
      endpoint: 'full_balance',
      url,
      balanceMutez: 0,
      deallocated: true
    };
  }
  throw new Error(`HTTP ${response.status}`);
}

async function fetchFullBalancePair(providers, candidate, signal) {
  const failures = [];
  for (const provider of providers) {
    try {
      const [headerResult, hashResult] = await Promise.all([
        fetchProviderJson(provider, `/chains/main/blocks/${candidate.level}/header`, signal),
        fetchProviderJson(provider, `/chains/main/blocks/${candidate.level}/hash`, signal)
      ]);
      if (!headerResult.response.ok || !hashResult.response.ok) {
        throw new Error(`block receipt HTTP ${headerResult.response.status}/${hashResult.response.status}`);
      }
      const header = headerResult.payload;
      const blockHash = String(hashResult.payload || '');
      const predecessorHash = String(header?.predecessor || '');
      if (Number(header?.level) !== candidate.level
          || !/^B[1-9A-HJ-NP-Za-km-z]{50}$/.test(blockHash)
          || !/^B[1-9A-HJ-NP-Za-km-z]{50}$/.test(predecessorHash)) {
        throw new Error('invalid block hash or predecessor receipt');
      }
      const [before, after] = await Promise.all([
        fetchFullBalanceAtBlock(provider, candidate.senderAddress, candidate.level - 1, predecessorHash, { signal }),
        fetchFullBalanceAtBlock(provider, candidate.senderAddress, candidate.level, blockHash, {
          allowDeallocated: true,
          predecessorHash,
          signal
        })
      ]);
      return { before, after };
    } catch (error) {
      failures.push(`${provider.id}: ${error?.name === 'AbortError' ? 'timeout' : error?.message || 'request failed'}`);
    }
  }
  throw new Error(`archive full_balance pair unavailable for ${candidate.senderAddress} at ${candidate.level} (${failures.join('; ')})`);
}

async function mapConcurrent(values, concurrency, mapper) {
  const results = new Array(values.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(values[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function buildBalanceExits(transfers, since, generatedAt) {
  const candidates = buildBalanceExitCandidates(transfers);
  const base = {
    window: { since, until: generatedAt, hours: 24 },
    semantics: 'Applied top-level implicit-account transfers of at least 1,000 XTZ, checked only at each sender\'s last qualifying outbound block. Classification uses archive full_balance before and after that block; the transfer sum is not asserted to equal the balance change.',
    minimumQualifyingOutflowXtz: MIN_TRANSFER_MUTEZ / 1e6,
    thresholds: {
      emptiedMaximumXtz: BALANCE_EXIT_EMPTY_MUTEZ / 1e6,
      nearEmptyMaximumXtz: BALANCE_EXIT_NEAR_EMPTY_MUTEZ / 1e6,
      nearEmptyMaximumPercent: 1
    },
    candidateSenderCount: candidates.length,
    checkedSenderCount: 0,
    receiptFailureCount: 0,
    complete: false,
    providers: [],
    observedAt: null,
    records: []
  };
  if (!candidates.length) return { ...base, complete: true };
  const providers = await archiveProviders();
  if (!providers.length) {
    return { ...base, receiptFailureCount: candidates.length, error: 'No configured archive provider proved archive mode.' };
  }

  const deadlineController = new AbortController();
  const deadline = setTimeout(() => deadlineController.abort(), BALANCE_EXIT_TOTAL_TIMEOUT_MS);
  let checks;
  try {
    checks = await mapConcurrent(candidates, BALANCE_EXIT_CONCURRENCY, async (candidate) => {
      try {
        const { before, after } = await fetchFullBalancePair(providers, candidate, deadlineController.signal);
        return { candidate, before, after, error: '' };
      } catch (error) {
        return { candidate, before: null, after: null, error: error?.message || 'archive receipt unavailable' };
      }
    });
  } finally {
    clearTimeout(deadline);
  }
  const successful = checks.filter((check) => !check.error);
  const failed = checks.filter((check) => check.error);
  const providerIds = [...new Set(successful.flatMap((check) => [check.before.provider, check.after.provider]))];
  const observedAt = successful.length ? new Date().toISOString() : null;
  if (failed.length) {
    return {
      ...base,
      checkedSenderCount: successful.length,
      receiptFailureCount: failed.length,
      providers: providerIds,
      observedAt,
      error: `${failed.length} of ${candidates.length} required archive balance pairs were unavailable; no partial ranking was published.`
    };
  }

  const records = successful
    .map(({ candidate, before, after }) => {
      const classified = classifyBalanceExitCandidate(candidate, before.balanceMutez, after.balanceMutez);
      return classified ? { ...classified, balanceReceipts: { before, after } } : null;
    })
    .filter(Boolean)
    .sort((left, right) => (
      (left.classification === right.classification ? 0 : left.classification === 'emptied' ? -1 : 1)
      || right.balanceBeforeMutez - left.balanceBeforeMutez
      || left.senderAddress.localeCompare(right.senderAddress)
    ));
  return {
    ...base,
    checkedSenderCount: candidates.length,
    complete: true,
    providers: providerIds,
    observedAt,
    records
  };
}

function hasEndpointAlias(operation) {
  return Boolean(String(operation?.senderAlias || '').trim() || String(operation?.targetAlias || '').trim());
}

function validTransferHeroReceipt(operation, since, until) {
  const timestamp = Date.parse(operation?.timestamp || '');
  const windowSince = Date.parse(since || '');
  const windowUntil = Date.parse(until || '');
  return operationType(operation) === 'transaction'
    && isAppliedOperation(operation)
    && Boolean(operation?.hash)
    && Boolean(operation?.sender)
    && Boolean(operation?.target)
    && operation.sender !== operation.target
    && Number.isFinite(Number(operation?.amountMutez))
    && Number(operation.amountMutez) > 0
    && Number.isFinite(timestamp)
    && Number.isFinite(windowSince)
    && Number.isFinite(windowUntil)
    && timestamp >= windowSince
    && timestamp <= windowUntil;
}

function transferHeroSort(left, right) {
  const amountDelta = Number(right.amountMutez) - Number(left.amountMutez);
  if (amountDelta) return amountDelta;
  const timeDelta = Date.parse(right.timestamp || '') - Date.parse(left.timestamp || '');
  if (timeDelta) return timeDelta;
  const idDelta = finite(right.id, 0) - finite(left.id, 0);
  if (idDelta) return idDelta;
  return String(left.hash || '').localeCompare(String(right.hash || ''));
}

export function selectLargestNamedOperation(transfers, since, until) {
  if (!Array.isArray(transfers)) return null;
  return transfers
    .map(normalizeOperation)
    .filter((operation) => validTransferHeroReceipt(operation, since, until) && hasEndpointAlias(operation))
    .sort(transferHeroSort)[0] || null;
}

function operationChronology(left, right) {
  const timeDelta = Date.parse(left?.timestamp || '') - Date.parse(right?.timestamp || '');
  if (timeDelta) return timeDelta;
  return finite(left?.id, Number.MAX_SAFE_INTEGER) - finite(right?.id, Number.MAX_SAFE_INTEGER);
}

/**
 * Resolve the first applied operation after the prior dormant activity. TzKT's
 * account-operation stream is fetched newest-first and exhausted until the
 * old activity boundary is crossed; returning a recent row merely because it
 * fits in a small page would misidentify the awakening trigger.
 */
async function earliestAppliedAccountOperation(address, afterTime, untilTime = '') {
    const after = Date.parse(afterTime || '');
    if (!Number.isFinite(after)) return null;
    const until = Date.parse(untilTime || '');
  let earliest = null;
  let offset = 0;
  for (let page = 0; page < MAX_ACCOUNT_OPERATION_PAGES; page += 1) {
    const query = new URLSearchParams({
      limit: String(ACCOUNT_OPERATION_PAGE_SIZE),
      offset: String(offset),
      'sort.desc': 'id'
    });
    if (Number.isFinite(until)) query.set('timestamp.le', new Date(until).toISOString());
    const rows = await fetchJson(`${API}/accounts/${encodeURIComponent(address)}/operations?${query}`);
    if (!Array.isArray(rows)) return null;
    let crossedBoundary = false;
    for (const operation of rows) {
      const time = Date.parse(operation?.timestamp || '');
      if (!Number.isFinite(time)) continue;
      if (time <= after) {
        crossedBoundary = true;
        continue;
      }
      if (!isAppliedOperation(operation)) continue;
      if (!earliest || operationChronology(operation, earliest) < 0) earliest = operation;
    }
    if (crossedBoundary || rows.length < ACCOUNT_OPERATION_PAGE_SIZE) return earliest;
    offset += ACCOUNT_OPERATION_PAGE_SIZE;
  }
  throw new Error(`TzKT account-operation pagination exceeded ${MAX_ACCOUNT_OPERATION_PAGES} pages for ${address}`);
}

async function buildAwakenings(previous, currentByAddress, generatedAt) {
  const priorRows = Array.isArray(previous?.dormant?.records) ? previous.dormant.records : [];
  const priorGeneratedAt = iso(previous?.generatedAt);
  if (!priorGeneratedAt || !priorRows.length) return [];
  const discovered = [];
  for (const prior of priorRows) {
    let current = currentByAddress.get(prior.address) || null;
    if (!current) {
      try {
        const account = await fetchJson(`${API}/accounts/${encodeURIComponent(prior.address)}`);
        current = normalizeAccount(account, generatedAt);
      } catch {
        continue;
      }
    }
    const priorActivity = Date.parse(prior.lastActivityTime || '');
    const currentActivity = Date.parse(current.lastActivityTime || '');
    if (!Number.isFinite(priorActivity) || !Number.isFinite(currentActivity) || currentActivity <= priorActivity || currentActivity <= Date.parse(priorGeneratedAt)) continue;
    let operation = null;
    try {
      operation = await earliestAppliedAccountOperation(prior.address, prior.lastActivityTime, generatedAt);
    } catch {
      operation = null;
    }
    if (!operation) continue;
    const receipt = normalizeOperation(operation);
    if (!receipt.hash || !receipt.timestamp) continue;
    const awakenedAt = Date.parse(receipt.timestamp);
    const dormantDays = Math.floor((awakenedAt - priorActivity) / DAY_MS);
    if (!Number.isFinite(dormantDays) || dormantDays < DORMANT_DAYS) continue;
    discovered.push({
      id: operationIdentity(operation),
      address: prior.address,
      alias: current.alias || prior.alias || null,
      accountType: current.accountType || prior.accountType || 'account',
      balanceBeforeMutez: finite(prior.balanceMutez, 0),
      balanceAfterMutez: finite(current.balanceMutez, 0),
      previousActivityTime: iso(prior.lastActivityTime),
      dormantDays,
      awakenedAt: receipt.timestamp,
      movedAmountMutez: receipt.amountMutez ?? null,
      receipt
    });
  }
  return discovered;
}

function flowGroupRows(transfers) {
  const groups = new Map();
  for (const operation of transfers) {
    const normalized = normalizeOperation(operation);
    const hash = normalized.hash || `operation-${normalized.id || operationIdentity(operation)}`;
    const group = groups.get(hash) || {
      hash,
      timestamp: normalized.timestamp,
      grossObservedMutez: 0,
      operations: []
    };
    group.grossObservedMutez += finite(normalized.amountMutez, 0);
    group.operations.push(normalized);
    if (Date.parse(normalized.timestamp || '') > Date.parse(group.timestamp || '')) group.timestamp = normalized.timestamp;
    groups.set(hash, group);
  }
  return [...groups.values()]
    .map((group) => ({ ...group, operationCount: group.operations.length }))
    .sort((left, right) => right.grossObservedMutez - left.grossObservedMutez || Date.parse(right.timestamp || '') - Date.parse(left.timestamp || ''));
}

export function buildWhaleTransferSummary(transfers, since, generatedAt) {
  const groups = flowGroupRows(transfers);
  const thresholdRows = THRESHOLDS_XTZ.map((thresholdXtz) => {
    const minimum = thresholdXtz * 1e6;
    const rows = transfers.filter((operation) => finite(operation?.amount, 0) >= minimum);
    return {
      thresholdXtz,
      operationCount: rows.length,
      operationGroupCount: new Set(rows.map((operation) => operation?.hash).filter(Boolean)).size,
      grossObservedMutez: rows.reduce((sum, operation) => sum + finite(operation?.amount, 0), 0)
    };
  });
  const largest = [...transfers].sort((left, right) => finite(right?.amount, 0) - finite(left?.amount, 0))[0] || null;
  const namedEndpointOperationCount = transfers
    .map(normalizeOperation)
    .filter((operation) => (
      validTransferHeroReceipt(operation, since, generatedAt) && hasEndpointAlias(operation)
    )).length;
  const largestNamedOperation = selectLargestNamedOperation(transfers, since, generatedAt);
  return {
    window: { since, until: generatedAt, hours: 24 },
    semantics: 'Gross observed tez transferred by applied transaction operations. This is not economic volume and can include related internal hops.',
    minimumXtz: MIN_TRANSFER_MUTEZ / 1e6,
    complete: true,
    operationCount: transfers.length,
    operationGroupCount: groups.length,
    uniqueSenders: new Set(transfers.map((operation) => operation?.sender?.address).filter(Boolean)).size,
    uniqueTargets: new Set(transfers.map((operation) => operation?.target?.address).filter(Boolean)).size,
    grossObservedMutez: transfers.reduce((sum, operation) => sum + finite(operation?.amount, 0), 0),
    thresholds: thresholdRows,
    largestOperation: largest ? normalizeOperation(largest) : null,
    namedEndpointOperationCount,
    largestNamedOperation,
    topFlowStories: groups.slice(0, DISPLAY_FLOW_LIMIT)
  };
}

function balanceReceiptMatches(record, receipt, {
  expectedLevel,
  expectedPredecessorHash = null,
  providerIds
}) {
  if (!receipt || receipt.provider !== record?.balanceReceipts?.before?.provider
      || !providerIds.has(receipt.provider)
      || receipt.chainId !== MAINNET_CHAIN_ID
      || receipt.endpoint !== 'full_balance'
      || Number(receipt.level) !== expectedLevel
      || Number(receipt.block) !== expectedLevel
      || !/^B[1-9A-HJ-NP-Za-km-z]{50}$/.test(String(receipt.blockHash || ''))
      || (expectedPredecessorHash !== null && receipt.predecessorHash !== expectedPredecessorHash)) {
    return false;
  }
  const provider = ARCHIVE_PROVIDERS.find(({ id }) => id === receipt.provider);
  try {
    const url = new URL(receipt.url);
    return Boolean(provider)
      && url.origin === new URL(provider.url).origin
      && url.pathname === `/chains/main/blocks/${receipt.blockHash}/context/contracts/${record.senderAddress}/full_balance`;
  } catch {
    return false;
  }
}

function validate(snapshot) {
  const errors = [];
  const amountContractCases = [
    [{ type: 'transaction', status: 'applied', amount: 11 }, 11, 'applied transaction amount'],
    [{ type: 'staking', action: 'stake', status: 'applied', amount: 7, requestedAmount: 700 }, 7, 'actual stake amount'],
    [{ type: 'staking', action: 'unstake', status: 'applied', amount: null, requestedAmount: 700 }, null, 'missing actual unstake amount'],
    [{ type: 'delegation', status: 'applied', amount: 900 }, null, 'delegation sender balance'],
    [{ type: 'activation', status: 'applied', balance: 900 }, null, 'activation allocation'],
    [{ type: 'attestation', status: 'applied', deposit: 900 }, null, 'consensus security deposit'],
    [{ type: 'transaction', status: 'failed', amount: 900 }, null, 'failed transaction intent']
  ];
  for (const [operation, expected, label] of amountContractCases) {
    if (operationAmountMutez(operation) !== expected) errors.push(`moved-amount contract failed for ${label}`);
  }
  if (snapshot?.kind !== 'tezos-whale-watch') errors.push('kind must be tezos-whale-watch');
  if (snapshot?.version !== 1) errors.push('version must be 1');
  if (!iso(snapshot?.generatedAt)) errors.push('generatedAt must be an ISO timestamp');
  if (snapshot?.coverage?.largeAccounts?.complete !== true) errors.push('large-account coverage must be complete');
  if (snapshot?.coverage?.transfers24h?.complete !== true) errors.push('24h transfer coverage must be complete');
  const windowSince = Date.parse(snapshot?.transfers24h?.window?.since || '');
  const windowUntil = Date.parse(snapshot?.transfers24h?.window?.until || '');
  const generatedAt = Date.parse(snapshot?.generatedAt || '');
  if (!Number.isFinite(windowSince) || !Number.isFinite(windowUntil)
      || windowUntil !== generatedAt || windowUntil - windowSince !== DAY_MS) {
    errors.push('24h transfer window must end at generatedAt and span exactly 24 hours');
  }
  if (!Array.isArray(snapshot?.dormant?.records)) errors.push('dormant.records must be an array');
  if (!Array.isArray(snapshot?.awakenings)) errors.push('awakenings must be an array');
  if (!Array.isArray(snapshot?.transfers24h?.topFlowStories)) errors.push('transfers24h.topFlowStories must be an array');
  const transfers = snapshot?.transfers24h || {};
  const hasNamedCount = Object.prototype.hasOwnProperty.call(transfers, 'namedEndpointOperationCount');
  const namedCount = transfers.namedEndpointOperationCount;
  const hasNamedHero = Object.prototype.hasOwnProperty.call(transfers, 'largestNamedOperation');
  const namedHero = transfers.largestNamedOperation;
  if (hasNamedCount !== hasNamedHero) {
    errors.push('named endpoint count and largest operation receipts must be published together');
  }
  if (hasNamedCount && (!Number.isSafeInteger(namedCount) || namedCount < 0 || namedCount > Number(transfers.operationCount))) {
    errors.push('namedEndpointOperationCount must be a bounded whole-operation count');
  }
  if (hasNamedHero && namedHero !== null) {
    if (!validTransferHeroReceipt(namedHero, transfers.window?.since, transfers.window?.until)
        || !hasEndpointAlias(namedHero)) {
      errors.push('largestNamedOperation must be an applied in-window transfer with a TzKT endpoint alias');
    }
    const overallAmount = Number(transfers.largestOperation?.amountMutez);
    if (Number.isFinite(overallAmount) && Number(namedHero.amountMutez) > overallAmount) {
      errors.push('largestNamedOperation cannot exceed largestOperation');
    }
  }
  if (hasNamedCount && hasNamedHero
      && ((namedCount === 0 && namedHero !== null) || (namedCount > 0 && namedHero === null))) {
    errors.push('largestNamedOperation must reconcile with namedEndpointOperationCount');
  }
  const balanceExits = snapshot?.balanceExits;
  if (balanceExits !== undefined) {
    const exitSince = Date.parse(balanceExits?.window?.since || '');
    const exitUntil = Date.parse(balanceExits?.window?.until || '');
    const candidateCount = balanceExits?.candidateSenderCount;
    const checkedCount = balanceExits?.checkedSenderCount;
    const failureCount = balanceExits?.receiptFailureCount;
    const records = Array.isArray(balanceExits?.records) ? balanceExits.records : [];
    const providers = Array.isArray(balanceExits?.providers) ? balanceExits.providers : [];
    const providerIds = new Set(providers);
    if (!Number.isFinite(exitSince) || !Number.isFinite(exitUntil)
        || exitSince !== windowSince || exitUntil !== windowUntil) {
      errors.push('balance-exit window must equal the complete transfer window');
    }
    if (![candidateCount, checkedCount, failureCount].every((value) => Number.isSafeInteger(value) && value >= 0)) {
      errors.push('balance-exit coverage counts must be non-negative whole numbers');
    }
    if (!Array.isArray(balanceExits?.records)) errors.push('balanceExits.records must be an array');
    if (balanceExits?.complete !== true && balanceExits?.complete !== false) errors.push('balance-exit completeness must be explicit');
    if (checkedCount + failureCount !== candidateCount) errors.push('balance-exit checked and failed counts must reconcile every candidate sender');
    if (Number(balanceExits?.minimumQualifyingOutflowXtz) !== MIN_TRANSFER_MUTEZ / 1e6
        || Number(balanceExits?.thresholds?.emptiedMaximumXtz) !== BALANCE_EXIT_EMPTY_MUTEZ / 1e6
        || Number(balanceExits?.thresholds?.nearEmptyMaximumXtz) !== BALANCE_EXIT_NEAR_EMPTY_MUTEZ / 1e6
        || Number(balanceExits?.thresholds?.nearEmptyMaximumPercent) !== 1) {
      errors.push('balance-exit thresholds must match the generator contract');
    }
    if (providers.length !== providerIds.size
        || providers.some((providerId) => !ARCHIVE_PROVIDERS.some(({ id }) => id === providerId))) {
      errors.push('balance-exit providers must be unique configured archive ids');
    }
    if (balanceExits?.complete === true) {
      if (checkedCount !== candidateCount || failureCount !== 0) errors.push('complete balance-exit coverage must reconcile every candidate sender');
      if (candidateCount > 0 && (!providers.length || !iso(balanceExits?.observedAt))) {
        errors.push('complete non-empty balance-exit coverage must name its verified archive providers and observation');
      }
    } else {
      if (records.length) errors.push('incomplete balance-exit coverage must publish no partial ranking');
      if (!String(balanceExits?.error || '').trim()) errors.push('incomplete balance-exit coverage must explain why its ranking is withheld');
    }
    const recordIds = new Set();
    const recordSenders = new Set();
    for (const record of records) {
      const before = Number(record?.balanceBeforeMutez);
      const after = Number(record?.balanceAfterMutez);
      const beforeReceipt = record?.balanceReceipts?.before;
      const afterReceipt = record?.balanceReceipts?.after;
      if (recordIds.has(record?.id) || recordSenders.has(record?.senderAddress)) {
        errors.push(`balance exit ${record?.id || '?'} duplicates an id or sender`);
      }
      recordIds.add(record?.id);
      recordSenders.add(record?.senderAddress);
      if (!implicitAddress(record?.senderAddress) || !Number.isSafeInteger(Number(record?.level)) || Number(record.level) <= 1) {
        errors.push(`balance exit ${record?.id || '?'} has an invalid sender or level`);
      }
      if (record?.id !== `${record?.senderAddress}:${record?.level}`) errors.push(`balance exit ${record?.id || '?'} has an invalid id`);
      if (!Number.isSafeInteger(before) || before <= 0 || !Number.isSafeInteger(after) || after < 0) {
        errors.push(`balance exit ${record?.id || '?'} has invalid full-balance values`);
      }
      if (!balanceReceiptMatches(record, beforeReceipt, {
        expectedLevel: Number(record.level) - 1,
        providerIds
      })
          || !balanceReceiptMatches(record, afterReceipt, {
            expectedLevel: Number(record.level),
            expectedPredecessorHash: beforeReceipt?.blockHash,
            providerIds
          })
          || Number(beforeReceipt?.balanceMutez) !== before
          || Number(afterReceipt?.balanceMutez) !== after
          || beforeReceipt?.deallocated === true
          || (afterReceipt?.deallocated === true && after !== 0)) {
        errors.push(`balance exit ${record?.id || '?'} does not reconcile its archive receipts`);
      }
      const remainingPercent = Number(record?.remainingPercent);
      const computedPercent = (after / before) * 100;
      if (!Number.isFinite(remainingPercent) || Math.abs(remainingPercent - computedPercent) > 1e-12) {
        errors.push(`balance exit ${record?.id || '?'} has an invalid remaining percentage`);
      }
      if (record?.classification === 'emptied') {
        if (after > BALANCE_EXIT_EMPTY_MUTEZ) errors.push(`emptied balance exit ${record.id || '?'} exceeds its threshold`);
      } else if (record?.classification === 'near-empty') {
        if (after <= BALANCE_EXIT_EMPTY_MUTEZ
            || after > BALANCE_EXIT_NEAR_EMPTY_MUTEZ
            || after * 100 > before) {
          errors.push(`near-empty balance exit ${record.id || '?'} exceeds its thresholds`);
        }
      } else errors.push(`balance exit ${record?.id || '?'} has an invalid classification`);
      const operationIds = Array.isArray(record?.operationIds) ? record.operationIds : [];
      const destinations = Array.isArray(record?.destinations) ? record.destinations : [];
      const qualifyingOutflow = Number(record?.qualifyingOutflowMutez);
      const destinationOutflow = destinations.reduce((sum, destination) => sum + Number(destination?.qualifyingOutflowMutez || 0), 0);
      const destinationOperations = destinations.reduce((sum, destination) => sum + Number(destination?.operationCount || 0), 0);
      if (!operationIds.length
          || operationIds.length !== new Set(operationIds).size
          || operationIds.some((id) => !Number.isSafeInteger(Number(id)) || Number(id) <= 0)
          || !Array.isArray(record?.hashes) || !record.hashes.length
          || record.hashes.length !== new Set(record.hashes).size
          || !destinations.length
          || destinations.some((destination) => !destination?.address
            || !Number.isSafeInteger(Number(destination?.qualifyingOutflowMutez))
            || Number(destination.qualifyingOutflowMutez) < MIN_TRANSFER_MUTEZ
            || !Number.isSafeInteger(Number(destination?.operationCount))
            || Number(destination.operationCount) < 1)
          || !Number.isSafeInteger(qualifyingOutflow)
          || qualifyingOutflow < MIN_TRANSFER_MUTEZ
          || destinationOutflow !== qualifyingOutflow
          || destinationOperations !== operationIds.length) {
        errors.push(`balance exit ${record?.id || '?'} lacks qualifying transfer receipts`);
      }
    }
    for (const providerId of providers) {
      const provider = ARCHIVE_PROVIDERS.find(({ id }) => id === providerId);
      const source = snapshot?.sources?.find((candidate) => candidate?.url === provider?.url);
      if (!source || source.observedAt !== balanceExits.observedAt) {
        errors.push(`balance-exit provider ${providerId} lacks a matching source observation`);
      }
    }
    if (/\bsell(?:er|ing|s)?\b/i.test(JSON.stringify(balanceExits))) {
      errors.push('balance-exit artifact must not infer selling');
    }
  }
  for (const record of snapshot?.dormant?.records || []) {
    if (!record.address) errors.push('dormant record missing address');
    if (!record.lastActivityTime || !iso(record.lastActivityTime)) errors.push(`dormant record ${record.address || '?'} missing lastActivityTime`);
    if (!Number.isFinite(Number(record.lastActivityLevel))) errors.push(`dormant record ${record.address || '?'} missing lastActivityLevel`);
    if (Number(record.dormantDays) < DORMANT_DAYS) errors.push(`dormant record ${record.address || '?'} is below the dormant threshold`);
  }
  for (const event of snapshot?.awakenings || []) {
    if (!event.receipt?.hash || !iso(event.receipt?.timestamp)) errors.push(`awakening ${event.id || '?'} is missing an operation receipt`);
    if (event.awakenedAt !== event.receipt?.timestamp) errors.push(`awakening ${event.id || '?'} timestamp does not match its receipt`);
    if (Date.parse(event.awakenedAt || '') > generatedAt) errors.push(`awakening ${event.id || '?'} is newer than generatedAt`);
    if (!isAppliedOperation(event.receipt)) errors.push(`awakening ${event.id || '?'} receipt must be applied`);
    if (event.movedAmountMutez != null && !Number.isFinite(Number(event.movedAmountMutez))) errors.push(`awakening ${event.id || '?'} has invalid moved amount`);
    if ((event.movedAmountMutez ?? null) !== (event.receipt?.amountMutez ?? null)) errors.push(`awakening ${event.id || '?'} moved amount does not match its receipt`);
    const previousActivity = Date.parse(event.previousActivityTime || '');
    const awakenedAt = Date.parse(event.awakenedAt || '');
    const dormantDays = Math.floor((awakenedAt - previousActivity) / DAY_MS);
    if (!Number.isFinite(previousActivity) || previousActivity >= awakenedAt) errors.push(`awakening ${event.id || '?'} is missing a valid prior-activity receipt`);
    if (!Number.isFinite(Number(event.dormantDays)) || Number(event.dormantDays) < DORMANT_DAYS || Number(event.dormantDays) !== dormantDays) errors.push(`awakening ${event.id || '?'} has an invalid receipt-to-receipt dormancy interval`);
    const semanticAmount = operationAmountMutez(event.receipt);
    if ((event.receipt?.amountMutez ?? null) !== semanticAmount) errors.push(`awakening ${event.id || '?'} exposes a non-transfer/non-staking moved amount`);
  }
  if (JSON.stringify(snapshot).includes('economicVolume')) errors.push('artifact must not expose an economicVolume field');
  if (errors.length) throw new Error(`Whale Watch artifact invalid:\n- ${errors.join('\n- ')}`);
  return snapshot;
}

async function build() {
  const generatedAt = new Date().toISOString();
  const since = new Date(Date.parse(generatedAt) - DAY_MS).toISOString();
  const [accountPage, transferPage, previous] = await Promise.all([
    fetchPages('/accounts', {
      'balance.ge': String(MIN_DORMANT_BALANCE_MUTEZ),
      'sort.desc': 'balance',
      select: 'address,alias,type,balance,lastActivity,lastActivityTime'
    }),
    fetchPages('/operations/transactions', {
      'timestamp.ge': since,
      'timestamp.le': generatedAt,
      'amount.ge': String(MIN_TRANSFER_MUTEZ),
      status: 'applied',
      'sort.asc': 'id'
    }),
    readPrevious()
  ]);

  const accounts = accountPage.rows.map((account) => normalizeAccount(account, generatedAt));
  const currentByAddress = new Map(accounts.map((account) => [account.address, account]));
  const cutoff = Date.parse(generatedAt) - DORMANT_DAYS * DAY_MS;
  const dormant = accounts
    .filter((account) => account.lastActivityTime && Date.parse(account.lastActivityTime) <= cutoff)
    .sort(dormantRecordSort);
  const [discoveredAwakenings, balanceExits] = await Promise.all([
    buildAwakenings(previous, currentByAddress, generatedAt),
    buildBalanceExits(transferPage.rows, since, generatedAt)
  ]);
  const previousAwakenings = Array.isArray(previous?.awakenings)
    ? previous.awakenings.filter((event) => event?.receipt?.hash && iso(event.receipt.timestamp))
    : [];
  const awakeningById = new Map();
  [...discoveredAwakenings, ...previousAwakenings].forEach((event) => {
    if (event?.id && !awakeningById.has(event.id)) awakeningById.set(event.id, event);
  });
  const awakenings = [...awakeningById.values()]
    .filter((event) => {
      const awakenedAt = Date.parse(event.awakenedAt || '');
      return awakenedAt >= Date.parse(generatedAt) - 90 * DAY_MS && awakenedAt <= Date.parse(generatedAt);
    })
    .sort((left, right) => Date.parse(right.awakenedAt || '') - Date.parse(left.awakenedAt || ''))
    .slice(0, 100);

  return validate({
    kind: 'tezos-whale-watch',
    version: 1,
    generatedAt,
    methodology: {
      minimumTransferXtz: MIN_TRANSFER_MUTEZ / 1e6,
      minimumDormantBalanceXtz: MIN_DORMANT_BALANCE_MUTEZ / 1e6,
      minimumDormantDays: DORMANT_DAYS,
      identity: 'TzKT operation id identifies one operation; operation-group hash groups related hops into a flow story.',
      dormancy: 'Dormancy uses TzKT lastActivityTime. lastActivity is retained only as a block-level receipt.',
      awakening: 'An awakening is the earliest applied TzKT account operation after the prior dormant activity. Moved amount is populated only for applied transactions and actual processed stake or unstake amounts.',
      featuredFlow: 'The named flow receipt is the largest applied transfer in the complete 24-hour ledger with a non-empty endpoint alias returned by TzKT.',
      balanceExits: 'Balance exits check the final qualifying outbound block per implicit sender with archive full_balance at the predecessor and block end. Emptied means at most 1 XTZ remains; near-empty means at most 100 XTZ and at most 1 percent remains.',
      accountLanguage: 'Rows are large accounts, not presumed individual wallets. TzKT account type and alias are presented as source context.'
    },
    coverage: {
      largeAccounts: { complete: accountPage.complete, pages: accountPage.pages, eligibleCount: accounts.length },
      transfers24h: { complete: transferPage.complete, pages: transferPage.pages, eligibleCount: transferPage.rows.length }
    },
    dormant: {
      eligibleCount: dormant.length,
      eligibleBalanceMutez: dormant.reduce((sum, account) => sum + account.balanceMutez, 0),
      displayLimit: DISPLAY_DORMANT_LIMIT,
      records: dormant.slice(0, DISPLAY_DORMANT_LIMIT)
    },
    awakenings,
    balanceExits,
    transfers24h: buildWhaleTransferSummary(transferPage.rows, since, generatedAt),
    sources: [
      { label: 'TzKT large-account ledger', url: `${API}/accounts`, observedAt: generatedAt },
      { label: 'TzKT applied transaction ledger', url: `${API}/operations/transactions`, observedAt: generatedAt },
      ...balanceExits.providers.map((providerId) => {
        const provider = ARCHIVE_PROVIDERS.find(({ id }) => id === providerId);
        return {
          label: `${provider?.label || providerId} full-balance receipts`,
          url: provider?.url || '',
          observedAt: balanceExits.observedAt
        };
      })
    ]
  });
}

const IS_MAIN = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN) {
  if (CHECK_ONLY) {
    const snapshot = validate(JSON.parse(await fs.readFile(OUTPUT, 'utf8')));
    console.log(`Whale Watch artifact valid: ${snapshot.dormant.eligibleCount} dormant accounts, ${snapshot.transfers24h.operationCount} transfers, ${snapshot.awakenings.length} awakenings`);
  } else {
    const snapshot = await build();
    await fs.writeFile(OUTPUT, `${JSON.stringify(snapshot, null, 2)}\n`);
    console.log(`Wrote ${path.relative(ROOT, OUTPUT)} with ${snapshot.dormant.eligibleCount} dormant accounts and ${snapshot.transfers24h.operationCount} 24h transfers`);
  }
}
