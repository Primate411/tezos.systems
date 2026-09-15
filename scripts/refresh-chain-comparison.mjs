#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSolanaTowerReceipt } from './lib/solana-comparison-receipt.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_FILE = path.join(ROOT, 'js', 'core', 'config.js');
const REPORT_FILE = path.join(ROOT, 'data', 'chain-comparison-verification.json');
const PROTOCOL_FILE = path.join(ROOT, 'data', 'protocol-data.json');
const MAX_REPORT_AGE_DAYS = 45;
const REQUIRED_CHECKS_PER_CLAIM = 2;

const SOURCES = {
  tezosRpc: 'https://eu.rpc.tez.capital/chains/main/blocks/head/context/constants',
  tezosConsensus: 'https://octez.tezos.com/docs/alpha/consensus.html',
  tezosProtocols: 'https://api.tzkt.io/v1/protocols',
  tezosProtocolDataset: 'https://github.com/Primate411/tezos.systems/blob/main/data/protocol-data.json',
  ethereumBlocks: 'https://ethereum.org/developers/docs/blocks/',
  ethereumPos: 'https://ethereum.org/developers/docs/consensus-mechanisms/pos/',
  ethereumFinality: 'https://ethereum.org/roadmap/single-slot-finality/',
  ethereumOverview: 'https://ethereum.org/ethereum-vs-bitcoin/',
  solanaConfirmation: 'https://solana.com/developers/guides/advanced/confirmation',
  solanaAlpenglow: 'https://solana.com/upgrades/alpenglow',
  cardanoNetwork: 'https://docs.cardano.org/about-cardano/explore-more/cardano-network',
  cardanoTime: 'https://docs.cardano.org/about-cardano/explore-more/time',
  algorandBlocks: 'https://dev.algorand.co/concepts/transactions/blocks/',
  algorandStatus: 'https://mainnet-api.algonode.cloud/v2/status',
};

const CONFIG_CLAIMS = [
  ['tezos', 'blockTime', 'tezosStatic', 'blockTime'],
  ['tezos', 'finality', 'tezosStatic', 'finality'],
  ['tezos', 'selfAmendments', 'tezosStatic', 'selfAmendments'],
  ['ethereum', 'blockTime', 'ethereum', 'blockTime'],
  ['ethereum', 'finality', 'ethereum', 'finality'],
  ['solana', 'blockTime', 'solana', 'blockTime'],
  ['solana', 'finality', 'solana', 'finality'],
  ['cardano', 'blockTime', 'cardano', 'blockTime'],
  ['algorand', 'blockTime', 'algorand', 'blockTime'],
  ['algorand', 'finality', 'algorand', 'finality'],
];

const NUMERIC_METRIC_FIELDS = [
  'blockTime',
  'finality',
  'stakingPct',
  'annualIssuance',
  'validators',
  'selfAmendments',
  'hardForks',
  'energyPerTx',
  'avgTxFee',
  'slashing',
];

function hasFlag(name) {
  return process.argv.includes(name);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&rsquo;', '’')
    .replaceAll('&ldquo;', '“')
    .replaceAll('&rdquo;', '”')
    .replaceAll('&times;', '×');
}

function htmlToText(html) {
  return decodeHtmlEntities(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  ).replace(/\s+/g, ' ').trim();
}

function extractNumber(text, pattern, label) {
  const match = text.match(pattern);
  const value = Number(match?.[1]);
  if (!Number.isFinite(value)) {
    throw new Error(`Could not extract ${label}`);
  }
  return value;
}

function assertNear(left, right, tolerance, label) {
  if (!Number.isFinite(left) || !Number.isFinite(right) || Math.abs(left - right) > tolerance) {
    throw new Error(`${label} disagreed: ${left} vs ${right}`);
  }
}

function formatNumber(value, decimals = 2) {
  return Number(value.toFixed(decimals)).toString();
}

function secondsDisplay(value) {
  return `~${formatNumber(value)}s`;
}

function countsAsProtocolUpgrade(protocol) {
  if (!protocol || protocol.countsAsUpgrade === false || protocol.countsAsSelfAmendment === false) return false;
  const name = String(protocol.name || protocol.alias || protocol.extras?.alias || protocol.metadata?.alias || '').trim().toLowerCase();
  const hash = String(protocol.hash || protocol.protocol || '');
  if (name === 'paris c' || hash.startsWith('PsParisC') || hash.startsWith('PsParisc')) return false;
  const code = Number(protocol.code ?? protocol.number);
  if (Number.isFinite(code) && code < 4) return false;
  const firstLevel = Number(protocol.firstLevel);
  if (Object.prototype.hasOwnProperty.call(protocol, 'firstLevel') && Number.isFinite(firstLevel) && firstLevel <= 0) return false;
  return true;
}

function countProtocolUpgrades(protocols) {
  if (!Array.isArray(protocols)) throw new Error('Protocol source did not return an array');
  return protocols.filter(countsAsProtocolUpgrade).length;
}

function checkReceipt(label, source, observed, contentSha256, kind = 'official-documentation') {
  return {
    label,
    kind,
    source,
    observed,
    contentSha256,
    status: 'verified',
  };
}

async function fetchWithRetry(url, options = {}) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          accept: options.headers?.accept || 'text/html,application/json;q=0.9,*/*;q=0.8',
          'user-agent': 'tezos.systems comparison verifier/1.0',
          ...options.headers,
        },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt === 3) break;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`Failed to fetch ${url}: ${lastError?.message || lastError}`);
}

const sourceCache = new Map();

function fetchSource(url) {
  if (!sourceCache.has(url)) {
    sourceCache.set(url, (async () => {
      const response = await fetchWithRetry(url);
      const raw = await response.text();
      return {
        url,
        raw,
        text: htmlToText(raw),
        sha256: sha256(raw),
      };
    })());
  }
  return sourceCache.get(url);
}

async function fetchJsonReceipt(url, options = {}) {
  const response = await fetchWithRetry(url, {
    ...options,
    headers: { accept: 'application/json', ...options.headers },
  });
  const raw = await response.text();
  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON from ${url}`);
  }
  return { url, raw, json, sha256: sha256(raw) };
}

async function fetchAlgorandWindow() {
  const status = await fetchJsonReceipt(SOURCES.algorandStatus);
  const head = Number(status.json?.['last-round']);
  if (!Number.isSafeInteger(head) || head < 200) {
    throw new Error('Algorand status did not return a usable last round');
  }
  const distance = 120;
  const startRound = head - distance;
  const [start, end] = await Promise.all([
    fetchJsonReceipt(`https://mainnet-api.algonode.cloud/v2/blocks/${startRound}`),
    fetchJsonReceipt(`https://mainnet-api.algonode.cloud/v2/blocks/${head}`),
  ]);
  const startTimestamp = Number(start.json?.block?.ts);
  const endTimestamp = Number(end.json?.block?.ts);
  const averageSeconds = (endTimestamp - startTimestamp) / distance;
  if (!Number.isFinite(averageSeconds) || averageSeconds <= 0) {
    throw new Error('Algorand block window did not return usable timestamps');
  }
  return {
    head,
    startRound,
    averageSeconds,
    sha256: sha256(`${status.raw}\n${start.raw}\n${end.raw}`),
    sources: [
      SOURCES.algorandStatus,
      `https://mainnet-api.algonode.cloud/v2/blocks/${startRound}`,
      `https://mainnet-api.algonode.cloud/v2/blocks/${head}`,
    ],
  };
}

async function buildClaims() {
  const documentUrls = [
    SOURCES.tezosConsensus,
    SOURCES.ethereumBlocks,
    SOURCES.ethereumPos,
    SOURCES.ethereumFinality,
    SOURCES.ethereumOverview,
    SOURCES.solanaConfirmation,
    SOURCES.solanaAlpenglow,
    SOURCES.cardanoNetwork,
    SOURCES.cardanoTime,
    SOURCES.algorandBlocks,
  ];
  const [tezosRpc, tezosProtocols, protocolRaw, algorandWindow] = await Promise.all([
    fetchJsonReceipt(SOURCES.tezosRpc),
    fetchJsonReceipt(SOURCES.tezosProtocols),
    fs.readFile(PROTOCOL_FILE, 'utf8'),
    fetchAlgorandWindow(),
    ...documentUrls.map((url) => fetchSource(url)),
  ]);

  const [
    tezosConsensus,
    ethereumBlocks,
    ethereumPos,
    ethereumFinality,
    ethereumOverview,
    solanaConfirmation,
    solanaAlpenglow,
    cardanoNetwork,
    cardanoTime,
    algorandBlocks,
  ] = await Promise.all(documentUrls.map((url) => fetchSource(url)));

  const tezosRpcBlock = Number(tezosRpc.json?.minimal_block_delay);
  const tezosDocBlock = extractNumber(
    tezosConsensus.text,
    /MINIMAL_BLOCK_DELAY\s*=\s*([\d.]+)s/i,
    'Octez minimal block delay'
  );
  const tezosConfirmations = extractNumber(
    tezosConsensus.text,
    /block finality after\s+([\d.]+)\s+confirmations/i,
    'Tenderbake confirmation count'
  );
  assertNear(tezosRpcBlock, tezosDocBlock, 0, 'Tezos block time');
  const tezosFinality = tezosRpcBlock * tezosConfirmations;
  const protocolData = JSON.parse(protocolRaw);
  const curatedProtocolCount = countProtocolUpgrades(protocolData.protocols);
  const declaredProtocolCount = Number(protocolData.meta?.totalUpgrades);
  const indexedProtocolCount = countProtocolUpgrades(tezosProtocols.json);
  assertNear(curatedProtocolCount, declaredProtocolCount, 0, 'Tezos curated protocol upgrade count');
  assertNear(curatedProtocolCount, indexedProtocolCount, 0, 'Tezos protocol upgrade count');

  const ethereumDocBlock = extractNumber(
    ethereumBlocks.text,
    /block time is\s+([\d.]+)s/i,
    'Ethereum block time'
  );
  const ethereumPosBlock = extractNumber(
    ethereumPos.text,
    /slots\s*\(([\d.]+)\s+seconds\)/i,
    'Ethereum PoS slot time'
  );
  assertNear(ethereumDocBlock, ethereumPosBlock, 0, 'Ethereum block time');
  const ethereumFinalityMinutes = extractNumber(
    ethereumFinality.text,
    /takes about\s+([\d.]+)\s+minutes\s+for an Ethereum block to finalize/i,
    'Ethereum finality time'
  );
  const ethereumOverviewMinutes = extractNumber(
    ethereumOverview.text,
    /within about\s+([\d.]+)\s+minutes/i,
    'Ethereum overview finality time'
  );
  assertNear(ethereumFinalityMinutes, ethereumOverviewMinutes, 0, 'Ethereum finality');

  // The source has used both Under Development and In Development badges.
  const solanaTower = readSolanaTowerReceipt(solanaAlpenglow.text);
  const solanaGuideSlotMs = extractNumber(
    solanaConfirmation.text,
    /configured to last about\s+([\d.]+)ms/i,
    'Solana target slot time'
  );
  const solanaStatusSlotMs = solanaTower.slotMs;
  assertNear(solanaGuideSlotMs, solanaStatusSlotMs, 0, 'Solana slot time');
  const solanaFinalitySeconds = solanaTower.finalitySeconds;
  const solanaFinalizedSlots = extractNumber(
    solanaConfirmation.text,
    /at least a\s+([\d.]+)\s+slot difference between the most recent confirmed block and the most recent finalized block/i,
    'Solana finalized slot lag'
  );
  const solanaDerivedFinality = solanaFinalizedSlots * solanaGuideSlotMs / 1000;
  assertNear(solanaFinalitySeconds, solanaDerivedFinality, 0.05, 'Solana finalized timing');

  const cardanoNetworkBlock = extractNumber(
    cardanoNetwork.text,
    /on average,\s+there will be\s+([\d.]+)-second intervals between blocks/i,
    'Cardano network block interval'
  );
  const cardanoTimeBlock = extractNumber(
    cardanoTime.text,
    /block time\)\s+on the chain is\s+([\d.]+)s/i,
    'Cardano time-handling block interval'
  );
  assertNear(cardanoNetworkBlock, cardanoTimeBlock, 0, 'Cardano block time');

  const algorandDocBlock = extractNumber(
    algorandBlocks.text,
    /confirms blocks every\s+([\d.]+)\s+seconds on average/i,
    'Algorand average block time'
  );
  if (!/instant finality at the block level/i.test(algorandBlocks.text)) {
    throw new Error('Algorand documentation no longer states instant block-level finality');
  }
  assertNear(algorandDocBlock, algorandWindow.averageSeconds, 0.35, 'Algorand documented vs observed block time');

  const claims = [
    {
      id: 'tezos.blockTime',
      chain: 'tezos',
      metric: 'blockTime',
      displayValue: secondsDisplay(tezosRpcBlock),
      canonicalValue: tezosRpcBlock,
      unit: 'seconds',
      checks: [
        checkReceipt('Current mainnet protocol constant', SOURCES.tezosRpc, `${formatNumber(tezosRpcBlock)} seconds`, tezosRpc.sha256, 'source-native-rpc'),
        checkReceipt('Octez consensus parameter', SOURCES.tezosConsensus, `${formatNumber(tezosDocBlock)} seconds`, tezosConsensus.sha256),
      ],
    },
    {
      id: 'tezos.finality',
      chain: 'tezos',
      metric: 'finality',
      displayValue: secondsDisplay(tezosFinality),
      canonicalValue: tezosFinality,
      unit: 'seconds',
      checks: [
        checkReceipt('Current block delay used in finality calculation', SOURCES.tezosRpc, `${formatNumber(tezosRpcBlock)} seconds per block`, tezosRpc.sha256, 'source-native-rpc'),
        checkReceipt('Octez Tenderbake finality rule', SOURCES.tezosConsensus, `${formatNumber(tezosConfirmations)} confirmations × ${formatNumber(tezosDocBlock)} seconds`, tezosConsensus.sha256),
      ],
    },
    {
      id: 'tezos.selfAmendments',
      chain: 'tezos',
      metric: 'selfAmendments',
      displayValue: curatedProtocolCount,
      canonicalValue: curatedProtocolCount,
      unit: 'named protocol upgrades',
      checks: [
        checkReceipt('Curated protocol history and declared total', SOURCES.tezosProtocolDataset, `${formatNumber(curatedProtocolCount)} named upgrades`, sha256(protocolRaw), 'curated-repository-dataset'),
        checkReceipt('Complete TzKT protocol index', SOURCES.tezosProtocols, `${formatNumber(indexedProtocolCount)} named upgrades`, tezosProtocols.sha256, 'source-native-indexer'),
      ],
    },
    {
      id: 'ethereum.blockTime',
      chain: 'ethereum',
      metric: 'blockTime',
      displayValue: secondsDisplay(ethereumDocBlock),
      canonicalValue: ethereumDocBlock,
      unit: 'seconds',
      checks: [
        checkReceipt('Ethereum block documentation', SOURCES.ethereumBlocks, `${formatNumber(ethereumDocBlock)} seconds`, ethereumBlocks.sha256),
        checkReceipt('Ethereum proof-of-stake slot documentation', SOURCES.ethereumPos, `${formatNumber(ethereumPosBlock)} seconds`, ethereumPos.sha256),
      ],
    },
    {
      id: 'ethereum.finality',
      chain: 'ethereum',
      metric: 'finality',
      displayValue: `~${formatNumber(ethereumFinalityMinutes)} min`,
      canonicalValue: ethereumFinalityMinutes,
      unit: 'minutes',
      checks: [
        checkReceipt('Ethereum finality roadmap', SOURCES.ethereumFinality, `${formatNumber(ethereumFinalityMinutes)} minutes`, ethereumFinality.sha256),
        checkReceipt('Ethereum network comparison overview', SOURCES.ethereumOverview, `${formatNumber(ethereumOverviewMinutes)} minutes`, ethereumOverview.sha256),
      ],
    },
    {
      id: 'solana.blockTime',
      chain: 'solana',
      metric: 'blockTime',
      displayValue: secondsDisplay(solanaGuideSlotMs / 1000),
      canonicalValue: solanaGuideSlotMs / 1000,
      unit: 'seconds',
      checks: [
        checkReceipt('Solana target slot duration', SOURCES.solanaConfirmation, `${formatNumber(solanaGuideSlotMs)} milliseconds`, solanaConfirmation.sha256),
        checkReceipt('Current TowerBFT status before Alpenglow activation', SOURCES.solanaAlpenglow, `${formatNumber(solanaStatusSlotMs)} milliseconds`, solanaAlpenglow.sha256),
      ],
    },
    {
      id: 'solana.finality',
      chain: 'solana',
      metric: 'finality',
      displayValue: secondsDisplay(solanaFinalitySeconds),
      canonicalValue: solanaFinalitySeconds,
      unit: 'seconds',
      checks: [
        checkReceipt('Current TowerBFT finality status', SOURCES.solanaAlpenglow, `${formatNumber(solanaFinalitySeconds)} seconds`, solanaAlpenglow.sha256),
        checkReceipt('Finalized lag derived from documented slots', SOURCES.solanaConfirmation, `${formatNumber(solanaFinalizedSlots)} slots × ${formatNumber(solanaGuideSlotMs)} milliseconds`, solanaConfirmation.sha256),
      ],
    },
    {
      id: 'cardano.blockTime',
      chain: 'cardano',
      metric: 'blockTime',
      displayValue: secondsDisplay(cardanoNetworkBlock),
      canonicalValue: cardanoNetworkBlock,
      unit: 'seconds',
      checks: [
        checkReceipt('Cardano network documentation', SOURCES.cardanoNetwork, `${formatNumber(cardanoNetworkBlock)} seconds`, cardanoNetwork.sha256),
        checkReceipt('Cardano time-handling documentation', SOURCES.cardanoTime, `${formatNumber(cardanoTimeBlock)} seconds`, cardanoTime.sha256),
      ],
    },
    {
      id: 'algorand.blockTime',
      chain: 'algorand',
      metric: 'blockTime',
      displayValue: secondsDisplay(algorandDocBlock),
      canonicalValue: algorandDocBlock,
      unit: 'seconds',
      checks: [
        checkReceipt('Algorand developer documentation', SOURCES.algorandBlocks, `${formatNumber(algorandDocBlock)} seconds average`, algorandBlocks.sha256),
        {
          ...checkReceipt('Recent Algorand mainnet timestamp window', algorandWindow.sources[2], `${formatNumber(algorandWindow.averageSeconds, 3)} seconds across rounds ${algorandWindow.startRound}–${algorandWindow.head}`, algorandWindow.sha256, 'source-native-on-chain-sample'),
          evidenceSources: algorandWindow.sources,
        },
      ],
    },
    {
      id: 'algorand.finality',
      chain: 'algorand',
      metric: 'finality',
      displayValue: secondsDisplay(algorandDocBlock),
      canonicalValue: algorandDocBlock,
      unit: 'seconds',
      checks: [
        checkReceipt('Algorand instant block-level finality documentation', SOURCES.algorandBlocks, `${formatNumber(algorandDocBlock)} seconds average block finality`, algorandBlocks.sha256),
        {
          ...checkReceipt('Recent finalized mainnet timestamp window', algorandWindow.sources[2], `${formatNumber(algorandWindow.averageSeconds, 3)} seconds across rounds ${algorandWindow.startRound}–${algorandWindow.head}`, algorandWindow.sha256, 'source-native-on-chain-sample'),
          evidenceSources: algorandWindow.sources,
        },
      ],
    },
  ];

  return { claims, solanaFinalizedSlots };
}

async function loadComparisonData(source = null) {
  const configSource = source ?? await fs.readFile(CONFIG_FILE, 'utf8');
  const marker = 'export const CHAIN_COMPARISON = ';
  const start = configSource.indexOf(marker);
  if (start < 0) throw new Error('CHAIN_COMPARISON export not found');
  const end = configSource.indexOf('\n};', start);
  if (end < 0) throw new Error('CHAIN_COMPARISON object end not found');
  const literal = configSource.slice(start + marker.length, end + 2);
  return Function(`return (${literal});`)();
}

function chainBlockRange(source, chainKey) {
  const startMarker = `    ${chainKey}: {`;
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`Could not find ${chainKey} comparison block`);
  const commaEnd = source.indexOf('\n    },', start);
  const objectEnd = source.indexOf('\n    }\n};', start);
  const next = commaEnd >= 0 && (objectEnd < 0 || commaEnd < objectEnd) ? commaEnd : objectEnd;
  if (next < 0) throw new Error(`Could not find end of ${chainKey} comparison block`);
  const suffix = next === commaEnd ? '\n    },' : '\n    }';
  return { start, end: next + suffix.length };
}

function replaceChainField(source, chainKey, field, value) {
  const range = chainBlockRange(source, chainKey);
  const block = source.slice(range.start, range.end);
  const pattern = new RegExp(`(\\n\\s{8}${field}:\\s*)(?:'[^']*'|-?\\d+(?:\\.\\d+)?)`);
  if (!pattern.test(block)) throw new Error(`Could not update ${chainKey}.${field}`);
  const rendered = typeof value === 'number'
    ? String(value)
    : `'${String(value).replaceAll("'", "\\'")}'`;
  const updated = block.replace(pattern, `$1${rendered}`);
  return source.slice(0, range.start) + updated + source.slice(range.end);
}

function syncConfig(source, claims, solanaFinalizedSlots, verifiedDate) {
  let next = source.replace(
    /(\n\s{4}lastUpdated:\s*)'[^']*'/,
    `$1'${verifiedDate}'`
  );
  next = next.replace(
    /(\n\s{8}numericClaims:\s*)\d+/,
    `$1${claims.length}`
  );
  next = next.replace(
    /(\n\s{8}checksPerClaim:\s*)\d+/,
    `$1${REQUIRED_CHECKS_PER_CLAIM}`
  );

  for (const claim of claims) {
    const target = CONFIG_CLAIMS.find(([chain, metric]) => chain === claim.chain && metric === claim.metric);
    if (!target) throw new Error(`No config target registered for ${claim.id}`);
    next = replaceChainField(next, target[2], target[3], claim.displayValue);
  }
  next = replaceChainField(next, 'solana', 'finalityNote', `about ${formatNumber(solanaFinalizedSlots)} slots behind confirmed`);
  return next;
}

function findUnhandledNumericMetricFields(comparison, claims) {
  const registered = new Set(claims.map((claim) => `${claim.chain}.${claim.metric}`));
  const unhandled = [];
  for (const chain of ['tezos', 'ethereum', 'solana', 'cardano', 'algorand']) {
    const record = chain === 'tezos' ? comparison.tezosStatic : comparison[chain];
    for (const field of NUMERIC_METRIC_FIELDS) {
      const value = record?.[field];
      if (((typeof value === 'string' && /\d/.test(value)) || typeof value === 'number')
          && !registered.has(`${chain}.${field}`)) {
        unhandled.push(`${chain}.${field}=${value}`);
      }
    }
  }
  return unhandled;
}

async function validateReport() {
  const [source, rawReport] = await Promise.all([
    fs.readFile(CONFIG_FILE, 'utf8'),
    fs.readFile(REPORT_FILE, 'utf8'),
  ]);
  const comparison = await loadComparisonData(source);
  const report = JSON.parse(rawReport);
  const claims = Array.isArray(report.claims) ? report.claims : [];

  if (report.schemaVersion !== 1) throw new Error('Comparison verification schemaVersion must be 1');
  if (report.lastVerified !== comparison.lastUpdated) {
    throw new Error(`Comparison verification date ${report.lastVerified} does not match config ${comparison.lastUpdated}`);
  }
  if (report.summary?.verifiedClaims !== claims.length || claims.length !== comparison.verification?.numericClaims) {
    throw new Error('Comparison verification claim totals do not reconcile');
  }
  if (report.summary?.requiredChecksPerClaim !== REQUIRED_CHECKS_PER_CLAIM
      || comparison.verification?.checksPerClaim !== REQUIRED_CHECKS_PER_CLAIM) {
    throw new Error('Comparison verification must require two checks per numeric claim');
  }
  if (comparison.verification?.report !== '/data/chain-comparison-verification.json') {
    throw new Error('Comparison config must expose the verification report');
  }

  const verifiedAt = new Date(`${report.lastVerified}T00:00:00Z`);
  const ageDays = (Date.now() - verifiedAt.getTime()) / 86_400_000;
  if (!Number.isFinite(ageDays) || ageDays < -1 || ageDays > MAX_REPORT_AGE_DAYS) {
    throw new Error(`Comparison verification is stale or invalid (${formatNumber(ageDays, 1)} days old)`);
  }

  const expectedClaims = new Set(CONFIG_CLAIMS.map(([chain, metric]) => `${chain}.${metric}`));
  for (const claim of claims) {
    if (!expectedClaims.delete(claim.id)) throw new Error(`Unexpected or duplicate comparison claim ${claim.id}`);
    const target = CONFIG_CLAIMS.find(([chain, metric]) => chain === claim.chain && metric === claim.metric);
    const record = target?.[2] === 'tezosStatic' ? comparison.tezosStatic : comparison[target?.[2]];
    if (!target || record?.[target[3]] !== claim.displayValue) {
      throw new Error(`Comparison claim ${claim.id} does not match the rendered config value`);
    }
    if (claim.status !== 'verified') throw new Error(`Comparison claim ${claim.id} is not verified`);
    if (!Array.isArray(claim.checks) || claim.checks.length < REQUIRED_CHECKS_PER_CLAIM) {
      throw new Error(`Comparison claim ${claim.id} has fewer than two checks`);
    }
    const sources = new Set();
    for (const check of claim.checks) {
      if (check.status !== 'verified' || !String(check.source || '').startsWith('https://')) {
        throw new Error(`Comparison claim ${claim.id} has an invalid check`);
      }
      if (!/^[a-f0-9]{64}$/.test(check.contentSha256 || '')) {
        throw new Error(`Comparison claim ${claim.id} has an invalid source hash`);
      }
      sources.add(check.source);
    }
    if (sources.size < REQUIRED_CHECKS_PER_CLAIM) {
      throw new Error(`Comparison claim ${claim.id} does not use two distinct source receipts`);
    }
  }
  if (expectedClaims.size) throw new Error(`Missing comparison claims: ${[...expectedClaims].join(', ')}`);

  const unhandled = findUnhandledNumericMetricFields(comparison, claims);
  if (unhandled.length) {
    throw new Error(`Numeric comparison fields lack verification claims: ${unhandled.join(', ')}`);
  }

  console.log(`Verified comparison artifact: ${claims.length} numeric claims × ${REQUIRED_CHECKS_PER_CLAIM} checks (${report.lastVerified})`);
}

async function refresh() {
  const checkedAt = new Date().toISOString();
  const verifiedDate = checkedAt.slice(0, 10);
  const { claims, solanaFinalizedSlots } = await buildClaims();

  for (const claim of claims) {
    if (claim.checks.length < REQUIRED_CHECKS_PER_CLAIM) {
      throw new Error(`${claim.id} did not receive two checks`);
    }
    claim.status = 'verified';
  }

  const source = await fs.readFile(CONFIG_FILE, 'utf8');
  const updatedSource = syncConfig(source, claims, solanaFinalizedSlots, verifiedDate);
  const comparison = await loadComparisonData(updatedSource);
  const unhandled = findUnhandledNumericMetricFields(comparison, claims);
  if (unhandled.length) {
    throw new Error(`Numeric comparison fields lack verification claims: ${unhandled.join(', ')}`);
  }

  const report = {
    schemaVersion: 1,
    generatedAt: checkedAt,
    lastVerified: verifiedDate,
    policy: {
      cadence: 'monthly',
      rule: 'Every published static comparison number requires two distinct checks. Source disagreement or an ambiguous protocol transition fails without changing the last-good artifact.',
      maxAgeDays: MAX_REPORT_AGE_DAYS,
    },
    summary: {
      verifiedClaims: claims.length,
      requiredChecksPerClaim: REQUIRED_CHECKS_PER_CLAIM,
      totalChecks: claims.reduce((sum, claim) => sum + claim.checks.length, 0),
    },
    claims,
  };

  await Promise.all([
    fs.writeFile(CONFIG_FILE, updatedSource),
    fs.writeFile(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`),
  ]);
  console.log(`Refreshed comparison verification: ${claims.length} numeric claims, ${report.summary.totalChecks} checks`);
}

async function main() {
  if (hasFlag('--check')) {
    await validateReport();
    return;
  }
  await refresh();
  await validateReport();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
