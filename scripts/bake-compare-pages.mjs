#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_FILE = path.join(ROOT, 'js', 'core', 'config.js');
const PROTOCOL_FILE = path.join(ROOT, 'data', 'protocol-data.json');

const PAGES = {
  ethereum: 'compare/tezos-vs-ethereum.html',
  solana: 'compare/tezos-vs-solana.html',
  cardano: 'compare/tezos-vs-cardano.html',
  algorand: 'compare/tezos-vs-algorand.html'
};

const METRICS = [
  { key: 'blockTime', label: 'Block Time', icon: '⏱️', lower: true },
  { key: 'finality', label: 'Finality', icon: '✅', lower: true },
  { key: 'stakingPct', label: 'Staking %', icon: '🥩', higher: true },
  { key: 'annualIssuance', label: 'Annual Issuance', icon: '🖨️', lower: true },
  { key: 'validators', label: 'Nakamoto Coeff.', icon: '🏛️', context: true },
  { key: 'selfAmendments', label: 'On-Chain Upgrades', icon: '🔄', higher: true },
  { key: 'hardForks', label: 'Hard Forks', icon: '🍴', lower: true },
  { key: 'energyPerTx', label: 'Energy / Tx', icon: '⚡', lower: true },
  { key: 'avgTxFee', label: 'Avg Tx Fee', icon: '💰', lower: true },
  { key: 'slashing', label: 'Slashing', icon: '⚔️', context: true }
];

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
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
  const protocolData = JSON.parse(await fs.readFile(PROTOCOL_FILE, 'utf8'));
  const selfAmendments = Array.isArray(protocolData.protocols) ? protocolData.protocols.length : 21;
  return {
    ...comparison.tezosStatic,
    name: 'Tezos',
    symbol: 'XTZ',
    selfAmendments
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

function generateNarrative(chain, tezos, wins) {
  const tezWins = wins.filter((winner) => winner === 'tezos').length;
  const otherWins = wins.filter((winner) => winner === 'other').length;
  const lines = [];

  lines.push(`Tezos and ${chain.name} are both proof-of-stake blockchains, but they make different tradeoffs around governance, decentralization, finality, and operational predictability.`);

  if (tezWins > otherWins) {
    lines.push(`On this baked baseline, Tezos leads in ${tezWins} of ${METRICS.length} tracked categories while ${chain.name} leads in ${otherWins}. The live script upgrades these values in-browser with current Tezos network data from TzKT and Octez RPC.`);
  } else if (otherWins > tezWins) {
    lines.push(`${chain.name} leads in ${otherWins} of ${METRICS.length} tracked categories on this baseline, while Tezos's zero-hard-fork self-amendment record remains a qualitative advantage that raw metric counts do not fully capture.`);
  } else {
    lines.push(`The baked baseline is closely split, which makes the qualitative differences matter: Tezos emphasizes self-amendment, deterministic finality, and operator-visible governance rather than a separate social hard-fork process.`);
  }

  lines.push(`Tezos has completed ${tezos.selfAmendments} named on-chain protocol upgrades without a hard fork or network split. Its deterministic finality target is two blocks, so the dashboard treats finality and governance state as live operating signals, not only marketing claims.`);

  if (chain.name === 'Ethereum') {
    lines.push('Ethereum dominates in liquidity and developer mindshare, but its upgrade process still lands as coordinated hard forks and its stake is concentrated across large liquid-staking and exchange operators.');
  } else if (chain.name === 'Solana') {
    lines.push('Solana optimizes for raw throughput and very fast slots, while Tezos prioritizes protocol-level upgrade continuity, deterministic finality, and governance that bakers can inspect directly.');
  } else if (chain.name === 'Cardano') {
    lines.push('Cardano now has Voltaire-era governance, but Tezos has a longer production record of protocol proposals, votes, activations, and failed governance windows captured on-chain.');
  } else if (chain.name === 'Algorand') {
    lines.push('Algorand and Tezos both avoid routine chain splits, but Tezos adds decentralized self-amendment as a first-class protocol mechanism rather than relying primarily on foundation-coordinated upgrades.');
  }

  return lines;
}

function renderBakedContent(chain, tezos, comparison) {
  const wins = [];
  const rows = METRICS.map((metric) => {
    const tVal = tezos[metric.key] !== undefined ? tezos[metric.key] : '—';
    const oVal = chain[metric.key] !== undefined ? chain[metric.key] : '—';
    const tNote = tezos[`${metric.key}Note`] || '';
    const oNote = chain[`${metric.key}Note`] || '';
    const winner = getWinner(tVal, oVal, metric);
    wins.push(winner);
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

  const tezWins = wins.filter((winner) => winner === 'tezos').length;
  const otherWins = wins.filter((winner) => winner === 'other').length;
  const narrative = generateNarrative(chain, tezos, wins);

  return `<!-- baked:start -->
<div class="cp-scoreboard" data-baked-compare="true">
  <div class="cp-score cp-tezos-score"><span class="cp-score-num">${tezWins}</span><span class="cp-score-label">Tezos</span></div>
  <div class="cp-vs">vs</div>
  <div class="cp-score cp-other-score"><span class="cp-score-num">${otherWins}</span><span class="cp-score-label">${escapeHtml(chain.name)}</span></div>
</div>
<div class="cp-table">
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
  <p>Baked baseline from static comparison data last verified ${escapeHtml(comparison.lastUpdated)}. Live Tezos values upgrade in-browser from <a href="https://api.tzkt.io" target="_blank" rel="noopener">TzKT</a>.</p>
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

async function main() {
  const comparison = await loadComparisonData();
  const tezos = await tezosStaticData(comparison);

  for (const [key, file] of Object.entries(PAGES)) {
    const chain = comparison[key];
    if (!chain) throw new Error(`Missing comparison data for ${key}`);
    const target = path.join(ROOT, file);
    const html = await fs.readFile(target, 'utf8');
    const baked = renderBakedContent(chain, tezos, comparison);
    await fs.writeFile(target, replaceCompareContent(html, baked));
    console.log(`Baked static comparison content into ${file}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
