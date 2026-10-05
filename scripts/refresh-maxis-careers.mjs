#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  buildGovernanceCareerArtifact,
  validateGovernanceCareerArtifact
} from './lib/maxis-governance-career.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_FILE = path.join(ROOT, 'data/maxis-careers.json');
const SEASON_MANIFEST_FILE = path.join(ROOT, 'data/maxis/manifest.json');
const TZKT = 'https://api.tzkt.io/v1';
const PAGE_SIZE = 1000;
const TRANSIENT = 'MAXIS_CAREER_TZKT_TRANSIENT';

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

async function readJsonIfExists(file) {
  try {
    return await readJson(file);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeJsonAtomic(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}`;
  await fs.writeFile(temporary, `${JSON.stringify(value)}\n`);
  await fs.rename(temporary, file);
}

async function tzkt(pathname, params = {}, {
  fetchImpl = globalThis.fetch,
  wait = sleep,
  timeoutMs = 30000,
  now = Date.now
} = {}) {
  const query = new URLSearchParams(params);
  const url = `${TZKT}${pathname}${query.size ? `?${query}` : ''}`;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let delay = 2000 * (2 ** attempt);
    try {
      const response = await fetchImpl(url, {
        headers: { accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs)
      });
      if (!response.ok) {
        const retryAfter = response.headers.get('retry-after');
        if (retryAfter) {
          const value = Number(retryAfter);
          const milliseconds = Number.isFinite(value) ? value * 1000 : Date.parse(retryAfter) - now();
          if (Number.isFinite(milliseconds)) delay = Math.max(delay, milliseconds);
        }
        await response.body?.cancel();
        throw Object.assign(new Error(`TzKT ${pathname} returned HTTP ${response.status}`), {
          code: response.status === 429 || response.status >= 500 ? TRANSIENT : null
        });
      }
      return await response.json();
    } catch (error) {
      const transient = error.code === TRANSIENT || error instanceof TypeError
        || error.name === 'TimeoutError' || error.name === 'AbortError';
      if (!transient) throw error;
      const failure = Object.assign(new Error(error.message, { cause: error }), { code: TRANSIENT });
      // Do not turn an unusually long Retry-After into an early deferred retry.
      if (delay > 60000) throw Object.assign(new Error(`${error.message}; provider requires a ${delay}ms cooldown`), { code: 'MAXIS_CAREER_TZKT_COOLDOWN' });
      if (attempt === 2) throw failure;
      console.warn(`TzKT career request retry ${attempt + 1}/2 in ${delay}ms: ${pathname}`);
      await wait(delay);
    }
  }
}

function countParams(params) {
  return Object.fromEntries(Object.entries(params).filter(([key]) => ![
    'limit',
    'offset',
    'select',
    'sort.asc',
    'sort.desc'
  ].includes(key)));
}

async function fetchTzktCount(pathname, params) {
  const result = Number(await tzkt(`${pathname}/count`, countParams(params)));
  if (!Number.isSafeInteger(result) || result < 0) throw new Error(`TzKT ${pathname}/count returned an invalid count`);
  return result;
}

async function fetchTzktHead() {
  const row = await tzkt('/head');
  const level = Number(row?.level);
  const timestamp = Date.parse(row?.timestamp || '');
  if (!Number.isSafeInteger(level) || level <= 0 || !Number.isFinite(timestamp)) {
    throw new Error('TzKT /head returned an invalid level or timestamp');
  }
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

function orderedKey(value, key) {
  const raw = value?.[key];
  if (raw == null || String(raw) === '') throw new Error(`TzKT row lacks ordering key ${key}`);
  return String(raw);
}

function compareOrderedKeys(left, right, kind) {
  if (kind === 'numeric') {
    const leftValue = BigInt(left);
    const rightValue = BigInt(right);
    return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
  }
  return left < right ? -1 : left > right ? 1 : 0;
}

async function fetchCompleteCollection(pathname, params, {
  orderKey,
  orderKind = 'numeric',
  pageSize = PAGE_SIZE,
  useCount = true,
  maxPages = 100,
  verifyOrder = true
}) {
  const countedRows = useCount ? await fetchTzktCount(pathname, params) : null;
  const requestedPages = useCount ? Math.ceil(countedRows / pageSize) : maxPages;
  const rows = [];
  let pages = 0;
  let terminalShortPage = countedRows === 0;
  for (let page = 0; page < requestedPages; page += 1) {
    const batch = await tzkt(pathname, {
      ...params,
      offset: String(page * pageSize),
      limit: String(pageSize)
    });
    if (!Array.isArray(batch)) throw new Error(`TzKT ${pathname} returned a non-array page`);
    pages += 1;
    if (useCount && !batch.length) throw new Error(`TzKT ${pathname} exhausted before its count receipt`);
    rows.push(...batch);
    if (batch.length < pageSize) {
      terminalShortPage = true;
      break;
    }
  }
  const expectedRows = countedRows ?? rows.length;
  if (rows.length !== expectedRows) {
    throw new Error(`TzKT ${pathname} returned ${rows.length}/${expectedRows} counted rows`);
  }
  if (!useCount && !terminalShortPage) throw new Error(`TzKT ${pathname} reached the ${maxPages}-page bound without exhaustion`);
  const keys = rows.map((row) => orderedKey(row, orderKey));
  if (verifyOrder) {
    for (let index = 1; index < keys.length; index += 1) {
      if (compareOrderedKeys(keys[index - 1], keys[index], orderKind) >= 0) {
        throw new Error(`TzKT ${pathname} ordering key ${orderKey} is not strictly increasing at row ${index}`);
      }
    }
  }
  return {
    rows,
    receipt: {
      source: `TzKT ${pathname}`,
      query: countParams(params),
      rows: rows.length,
      expectedRows,
      pages,
      pageSize,
      orderKey,
      order: verifyOrder ? 'ascending' : 'source-order; normalized deterministically by the artifact builder',
      firstKey: keys[0] || null,
      lastKey: keys.at(-1) || null,
      strictlyIncreasingUniqueKeys: verifyOrder ? true : null,
      completionProof: useCount ? 'count-endpoint-match' : 'terminal-short-page',
      complete: true,
      truncated: false,
      error: null
    }
  };
}

async function readSeasonContext() {
  const manifest = await readJsonIfExists(SEASON_MANIFEST_FILE);
  const season = (manifest?.seasons || []).find((entry) => entry.id === manifest?.activeSeasonId) || null;
  if (!season?.id) return { season: null, seasonGovernanceReceipt: null };
  const summary = await readJsonIfExists(path.join(ROOT, 'data/maxis/seasons', season.id, 'summary.json'));
  return {
    season,
    seasonGovernanceReceipt: summary?.sourceReceipts?.governance || null
  };
}

async function buildArtifact(generatedAt) {
  const [ballots, proposals, votingPeriods, activeDelegates, head, seasonContext] = await Promise.all([
    fetchCompleteCollection('/operations/ballots', {
      status: 'applied',
      'sort.asc': 'id'
    }, { orderKey: 'id' }),
    fetchCompleteCollection('/operations/proposals', {
      status: 'applied',
      'sort.asc': 'id'
    }, { orderKey: 'id' }),
    fetchCompleteCollection('/voting/periods', {}, {
      orderKey: 'index',
      useCount: false,
      maxPages: 10,
      verifyOrder: false
    }),
    fetchCompleteCollection('/delegates', {
      active: 'true',
      select: 'address,alias,numBallots,numProposals,lastActivityTime'
    }, { orderKey: 'address', orderKind: 'text', verifyOrder: false }),
    fetchTzktHead(),
    readSeasonContext()
  ]);
  return buildGovernanceCareerArtifact({
    generatedAt,
    ballots,
    proposals,
    votingPeriods,
    activeDelegates,
    head,
    ...seasonContext
  });
}

async function main() {
  const file = outputFile();
  if (process.argv.includes('--check')) {
    const artifact = await readJson(file);
    const errors = validateGovernanceCareerArtifact(artifact);
    if (errors.length) throw new Error(`Invalid Maxis governance careers artifact: ${errors.join('; ')}`);
    console.log(`Maxis governance careers are valid: ${artifact.recordCount} records through period ${artifact.periodLedger.lastIndex}`);
    return;
  }
  if (process.argv.includes('--compact-only')) {
    const artifact = await readJson(file);
    const errors = validateGovernanceCareerArtifact(artifact);
    if (errors.length) throw new Error(`Cannot compact invalid Maxis governance careers: ${errors.join('; ')}`);
    await writeJsonAtomic(file, artifact);
    console.log(`Compacted ${path.relative(ROOT, file)} without changing content, source clocks, or its integrity hash`);
    return;
  }
  const artifact = await buildArtifact(new Date().toISOString());
  const errors = validateGovernanceCareerArtifact(artifact);
  if (errors.length) throw new Error(`Generated invalid Maxis governance careers artifact: ${errors.join('; ')}`);
  await writeJsonAtomic(file, artifact);
  console.log(`Wrote ${path.relative(ROOT, file)} with ${artifact.recordCount} governance career records, ${artifact.sourceReceipts.ballots.rows} ballots, and ${artifact.sourceReceipts.proposals.rows} proposals`);
}

export {
  buildArtifact as buildMaxisGovernanceCareerArtifact,
  fetchCompleteCollection as fetchCompleteTzktCollection,
  tzkt as fetchGovernanceCareerJson
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(error.code === TRANSIENT ? 75 : 1);
  });
}
