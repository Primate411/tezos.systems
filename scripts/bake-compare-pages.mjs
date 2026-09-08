#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_FILE = path.join(ROOT, 'js', 'core', 'config.js');
const COMPARE_INDEX_FILE = path.join(ROOT, 'compare', 'index.html');

const PAGES = {
  ethereum: 'compare/tezos-vs-ethereum.html',
  solana: 'compare/tezos-vs-solana.html',
  cardano: 'compare/tezos-vs-cardano.html',
  algorand: 'compare/tezos-vs-algorand.html'
};

const METRICS = [
  { key: 'blockTime', label: 'Block Time', icon: '⏱️', lower: true },
  { key: 'finality', label: 'Finality', icon: '✅', lower: true },
  { key: 'stakingPct', label: 'Staking %', icon: '🥩', context: true },
  { key: 'annualIssuance', label: 'Annual Issuance', icon: '🖨️', context: true },
  { key: 'validators', label: 'Stake Concentration', icon: '🏛️', context: true },
  { key: 'selfAmendments', label: 'Governance Upgrade Record', icon: '🔄', context: true },
  { key: 'hardForks', label: 'Upgrade Path', icon: '🍴', context: true },
  { key: 'energyPerTx', label: 'Energy / Tx', icon: '⚡', context: true },
  { key: 'avgTxFee', label: 'Avg Tx Fee', icon: '💰', context: true },
  { key: 'slashing', label: 'Slashing', icon: '⚔️', context: true }
];

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function peerReferenceHtml(chain) {
  return (chain.references || [])
    .map(([label, url]) => `<a href="${url}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`)
    .join(' · ');
}

async function loadComparisonData() {
  const source = await fs.readFile(CONFIG_FILE, 'utf8');
  const marker = 'export const CHAIN_COMPARISON = ';
  const start = source.indexOf(marker);
  if (start < 0) throw new Error('CHAIN_COMPARISON export not found');
  const end = source.indexOf('\n};', start);
  if (end < 0) throw new Error('CHAIN_COMPARISON object end not found');
  const literal = source.slice(start + marker.length, end + 2);
  return Function(`return (${literal});`)();
}

async function tezosStaticData(comparison) {
  return {
    ...comparison.tezosStatic,
    name: 'Tezos',
    symbol: 'XTZ'
  };
}

function parseNumeric(value) {
  if (typeof value === 'number') return value;
  if (!value) return NaN;
  return parseFloat(String(value).replace(/[~<>%,s]/g, '').trim()) || NaN;
}

function getWinner(tezVal, otherVal, metric) {
  if (metric.context) return 'context';
  const t = parseNumeric(tezVal);
  const o = parseNumeric(otherVal);
  if (Number.isNaN(t) || Number.isNaN(o)) return 'tie';
  if (metric.lower) return t < o ? 'tezos' : t > o ? 'other' : 'tie';
  if (metric.higher) return t > o ? 'tezos' : t < o ? 'other' : 'tie';
  return 'tie';
}

function generateNarrative(chain, tezos) {
  const lines = [];

  lines.push(`Tezos and ${chain.name} are both proof-of-stake blockchains, but they make different tradeoffs around governance, decentralization, finality, and operational predictability.`);
  lines.push('No composite score is assigned. Thresholds, entity grouping, and operational risk differ by chain, so contextual rows such as stake concentration and slashing should be read with their notes rather than ranked as a single winner.');

  lines.push(`Tezos has completed ${tezos.selfAmendments} named on-chain protocol upgrades. No persistent upgrade-driven community split is recorded in the tracked history. Tenderbake targets deterministic finality after two levels when quorum and network assumptions hold.`);

  if (chain.name === 'Ethereum') {
    lines.push('Ethereum dominates in liquidity and developer mindshare, while protocol upgrades land through socially coordinated client releases and hard forks. Validator-key counts should not be mistaken for independently controlled staking entities.');
  } else if (chain.name === 'Solana') {
    lines.push('Solana optimizes for raw throughput and very fast slots, while Tezos prioritizes protocol-level upgrade continuity, deterministic finality, and governance that bakers can inspect directly.');
  } else if (chain.name === 'Cardano') {
    lines.push('Cardano now has Voltaire-era governance, but Tezos has a longer production record of protocol proposals, votes, activations, and failed governance windows captured on-chain.');
  } else if (chain.name === 'Algorand') {
    lines.push('Algorand and Tezos both avoid routine chain splits, but Tezos adds decentralized self-amendment as a first-class protocol mechanism rather than relying primarily on foundation-coordinated upgrades.');
  }

  return lines;
}

function renderBakedContent(chainKey, chain, tezos, comparison) {
  const rows = METRICS.map((metric) => {
    const tVal = tezos[metric.key] !== undefined ? tezos[metric.key] : '—';
    const oVal = chain[metric.key] !== undefined ? chain[metric.key] : '—';
    const tNote = tezos[`${metric.key}Note`] || '';
    const oNote = chain[`${metric.key}Note`] || '';
    const winner = getWinner(tVal, oVal, metric);
    return `<div class="cp-row">
  <div class="cp-metric">${metric.icon} ${escapeHtml(metric.label)}</div>
  <div class="cp-val ${winner === 'tezos' ? 'cp-winner' : ''}">
    <span class="cp-val-main">${escapeHtml(tVal)}</span>${tNote ? `<span class="cp-val-note">${escapeHtml(tNote)}</span>` : ''}
  </div>
  <div class="cp-val ${winner === 'other' ? 'cp-winner' : ''}">
    <span class="cp-val-main">${escapeHtml(oVal)}</span>${oNote ? `<span class="cp-val-note">${escapeHtml(oNote)}</span>` : ''}
  </div>
</div>`;
  });

  const narrative = generateNarrative(chain, tezos);

  return `<!-- baked:start -->
<div class="cp-table" data-baked-compare="true">
  <div class="cp-header">
    <div class="cp-metric">Metric</div>
    <div class="cp-val"><img src="/favicon-48.png" alt="Tezos" width="20" height="20"> Tezos</div>
    <div class="cp-val">${escapeHtml(chain.name)}</div>
  </div>
  ${rows.join('\n  ')}
</div>
<div class="cp-narrative">
  ${narrative.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('\n  ')}
</div>
<div class="cp-cta">
  <a href="/" class="cp-cta-btn">Explore the full dashboard →</a>
  <a href="/#calculator" class="cp-cta-btn cp-cta-secondary">Calculate staking rewards →</a>
</div>
<div class="cp-footer">
  <p>Live Tezos values update in-browser from <a href="https://api.tzkt.io" target="_blank" rel="noopener">TzKT</a> and Octez RPC. Current-cycle address-level concentration is calculated in <a href="/health/">Network Health</a>. Peer values are a static snapshot last verified ${escapeHtml(comparison.lastUpdated)}; they are not all live.</p>
  <p><a href="${escapeHtml(comparison.verification.report)}">Open the monthly numeric verification receipt</a> — ${escapeHtml(comparison.verification.numericClaims)} static numbers, each checked against at least ${escapeHtml(comparison.verification.checksPerClaim)} sources.</p>
  <p>Peer methodology references: ${peerReferenceHtml(chain)}</p>
</div>
<!-- baked:end -->`;
}

function replaceCompareContent(html, baked) {
  const open = '<div id="compare-content">';
  const start = html.indexOf(open);
  if (start < 0) throw new Error('compare-content container not found');
  const scriptStart = html.indexOf('\n    <script type="module">', start);
  if (scriptStart < 0) throw new Error('compare page script not found');
  const closeLine = '        </div>';
  const close = html.lastIndexOf(closeLine, scriptStart);
  if (close < start) throw new Error('compare-content closing tag not found');
  const indented = baked.split('\n').map((line) => `            ${line}`).join('\n');
  return `${html.slice(0, start)}${open}
${indented}
        </div>${html.slice(close + closeLine.length)}`;
}

function syncSharedAssetStamps(html, referenceHtml) {
  const cssTag = referenceHtml.match(/<link rel="stylesheet" href="\/css\/site-map\.min\.css\?v=\d+">/)?.[0];
  const navTag = referenceHtml.match(/<script type="module" src="\/js\/landing\/site-nav\.js\?v=\d+"><\/script>/)?.[0];
  if (!cssTag || !navTag) throw new Error('Shared comparison asset stamps not found');
  return html
    .replace(/<link rel="stylesheet" href="\/css\/site-map\.(?:min\.)?css\?v=\d+">/, cssTag)
    .replace(/<script type="module" src="\/js\/landing\/site-nav\.js\?v=\d+"><\/script>/, navTag);
}

function syncComparisonMetadata(html, chain, comparison) {
  const title = `Tezos vs ${chain.name} — Live Tezos + Dated Peer Snapshot`;
  const description = `Compare live Tezos metrics with a dated ${chain.name} methodology snapshot last verified ${comparison.lastUpdated}. Peer values are not all live.`;
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)} | tezos.systems</title>`)
    .replace(/(<meta name="description" content=")[^"]*(">)/, `$1${escapeHtml(description)}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(">)/, `$1${escapeHtml(title)}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(">)/, `$1${escapeHtml(description)}$2`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(">)/, `$1${escapeHtml(title)}$2`)
    .replace(/(<meta name="twitter:description" content=")[^"]*(">)/, `$1${escapeHtml(description)}$2`)
    .replace(/("description": ")[^"]*(")/, `$1${description}$2`)
    .replace(/<p class="cp-subtitle">[^<]*<\/p>/, `<p class="cp-subtitle">Live Tezos values · ${escapeHtml(chain.name)} peer snapshot verified ${escapeHtml(comparison.lastUpdated)}</p>`);
}

function syncCompareIndexVerification(html, comparison) {
  const verified = new Date(`${comparison.lastUpdated}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  });
  return html.replace(
    /<p class="note">Static peer-chain snapshot last verified[\s\S]*?<\/p>/,
    `<p class="note">Static peer-chain snapshot last verified ${escapeHtml(verified)}. Its ${escapeHtml(comparison.verification.numericClaims)} static numbers each require at least ${escapeHtml(comparison.verification.checksPerClaim)} checks; <a href="${escapeHtml(comparison.verification.report)}">open the monthly verification receipt</a>. Direct numeric rows highlight narrow measurements, not an aggregate winner. Network Health calculates Tezos concentration live at both the &gt;1/3 and &gt;2/3 address-level thresholds.</p>`
  );
}

async function main() {
  const comparison = await loadComparisonData();
  const tezos = await tezosStaticData(comparison);
  const compareIndex = await fs.readFile(COMPARE_INDEX_FILE, 'utf8');

  for (const [key, file] of Object.entries(PAGES)) {
    const chain = comparison[key];
    if (!chain) throw new Error(`Missing comparison data for ${key}`);
    const target = path.join(ROOT, file);
    const sourceHtml = syncSharedAssetStamps(await fs.readFile(target, 'utf8'), compareIndex);
    const html = syncComparisonMetadata(sourceHtml, chain, comparison);
    const baked = renderBakedContent(key, chain, tezos, comparison);
    await fs.writeFile(target, replaceCompareContent(html, baked));
    console.log(`Baked static comparison content into ${file}`);
  }

  await fs.writeFile(COMPARE_INDEX_FILE, syncCompareIndexVerification(compareIndex, comparison));
  console.log('Synced comparison verification metadata into compare/index.html');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
