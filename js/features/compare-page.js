/**
 * Compare Page — SEO-optimized standalone comparison pages
 * /compare/tezos-vs-{chain}.html
 * 
 * Fetches live Tezos data, renders side-by-side comparison,
 * auto-generates narrative, shareable OG cards.
 */

import { CHAIN_COMPARISON, API_URLS } from '../core/config.js?v=20260228a';

const METRICS = [
  { key: 'blockTime',       label: 'Block Time',        icon: '⏱️', lower: true },
  { key: 'finality',        label: 'Finality',          icon: '✅', lower: true },
  { key: 'stakingPct',      label: 'Staking %',         icon: '🥩', higher: true },
  { key: 'annualIssuance',  label: 'Annual Issuance',   icon: '🖨️', lower: true },
  { key: 'validators',      label: 'Nakamoto Coeff.',   icon: '🏛️', context: true },
  { key: 'selfAmendments',  label: 'On-Chain Upgrades', icon: '🔄', higher: true },
  { key: 'hardForks',       label: 'Hard Forks',        icon: '🍴', lower: true },
  { key: 'energyPerTx',     label: 'Energy / Tx',       icon: '⚡', lower: true },
  { key: 'avgTxFee',        label: 'Avg Tx Fee',        icon: '💰', lower: true },
  { key: 'slashing',        label: 'Slashing',          icon: '⚔️', context: true },
];

async function fetchLiveTezosData() {
  try {
    const [head, supply] = await Promise.all([
      fetch(API_URLS.TZKT_HEAD).then(r => r.json()),
      fetch('https://api.tzkt.io/v1/protocols/current').then(r => r.json()),
    ]);
    return {
      stakingPct: head.stakingPercentage ? '~' + head.stakingPercentage.toFixed(1) + '%' : null,
      blockTime: '~6s',
      finality: '~12s',
      selfAmendments: 21,
      hardForks: '0',
    };
  } catch(e) {
    return {};
  }
}

function parseNumeric(val) {
  if (typeof val === 'number') return val;
  if (!val) return NaN;
  var cleaned = String(val).replace(/[~<>%,s]/g, '').trim();
  return parseFloat(cleaned) || NaN;
}

function getWinner(tezVal, otherVal, metric) {
  if (metric.context) return 'context';
  var t = parseNumeric(tezVal);
  var o = parseNumeric(otherVal);
  if (isNaN(t) || isNaN(o)) return 'tie';
  if (metric.lower)  return t < o ? 'tezos' : t > o ? 'other' : 'tie';
  if (metric.higher) return t > o ? 'tezos' : t < o ? 'other' : 'tie';
  return 'tie';
}

function generateNarrative(chain, tezos, other, wins) {
  var tezWins = wins.filter(function(w) { return w === 'tezos'; }).length;
  var otherWins = wins.filter(function(w) { return w === 'other'; }).length;
  var lines = [];

  lines.push('Tezos and ' + chain.name + ' are both proof-of-stake blockchains, but they take fundamentally different approaches to upgradability, governance, and decentralization.');

  if (tezWins > otherWins) {
    lines.push('Across ' + METRICS.length + ' key metrics, Tezos leads in ' + tezWins + ' categories while ' + chain.name + ' leads in ' + otherWins + '.');
  } else if (otherWins > tezWins) {
    lines.push(chain.name + ' leads in ' + otherWins + ' of ' + METRICS.length + ' metrics, though Tezos\'s self-amendment capability and zero-fork track record represent qualitative advantages that raw numbers don\'t capture.');
  }

  lines.push('Tezos has completed 21 on-chain protocol upgrades without a single hard fork or network split — a track record unmatched by any major blockchain. Its deterministic 12-second finality means transactions are irreversible in two blocks, with no probabilistic waiting period.');

  if (chain.name === 'Ethereum') {
    lines.push('Ethereum dominates in TVL and ecosystem size, but its reliance on hard forks for upgrades and the concentration of stake among a handful of liquid staking providers (6 entities control 50% of stake) raises centralization concerns that Tezos\'s on-chain governance model avoids.');
  } else if (chain.name === 'Solana') {
    lines.push('Solana offers faster raw block times, but its history of network outages and lack of on-chain governance contrast with Tezos\'s 7+ years of uninterrupted operation and community-driven protocol evolution.');
  } else if (chain.name === 'Cardano') {
    lines.push('Cardano introduced on-chain governance with CIP-1694 in September 2024, but with just one governance-driven upgrade compared to Tezos\'s 21, the two chains are at very different stages of self-amendment maturity.');
  } else if (chain.name === 'Algorand') {
    lines.push('Algorand achieves instant finality through pure proof-of-stake, and Tezos achieves deterministic finality in 12 seconds. Both avoid forks by design, but Tezos adds fully decentralized on-chain governance while Algorand\'s upgrades remain Foundation-coordinated.');
  }

  return lines;
}

export function initComparePage(chainKey) {
  var chain = CHAIN_COMPARISON[chainKey];
  if (!chain) { document.getElementById('compare-content').innerHTML = '<p>Chain not found.</p>'; return; }

  var tezos = CHAIN_COMPARISON.tezosStatic;
  var container = document.getElementById('compare-content');

  fetchLiveTezosData().then(function(live) {
    // Merge live data
    var tez = Object.assign({}, tezos, live, { name: 'Tezos', symbol: 'XTZ', selfAmendments: 21 });

    var wins = [];
    var rows = METRICS.map(function(m) {
      var tVal = tez[m.key] !== undefined ? tez[m.key] : '—';
      var oVal = chain[m.key] !== undefined ? chain[m.key] : '—';
      var tNote = tez[m.key + 'Note'] || '';
      var oNote = chain[m.key + 'Note'] || '';
      var winner = getWinner(tVal, oVal, m);
      wins.push(winner);

      return '<div class="cp-row">' +
        '<div class="cp-metric">' + m.icon + ' ' + m.label + '</div>' +
        '<div class="cp-val ' + (winner === 'tezos' ? 'cp-winner' : '') + '">' +
          '<span class="cp-val-main">' + tVal + '</span>' +
          (tNote ? '<span class="cp-val-note">' + tNote + '</span>' : '') +
        '</div>' +
        '<div class="cp-val ' + (winner === 'other' ? 'cp-winner' : '') + '">' +
          '<span class="cp-val-main">' + oVal + '</span>' +
          (oNote ? '<span class="cp-val-note">' + oNote + '</span>' : '') +
        '</div>' +
      '</div>';
    });

    var tezWins = wins.filter(function(w) { return w === 'tezos'; }).length;
    var otherWins = wins.filter(function(w) { return w === 'other'; }).length;
    var narrative = generateNarrative(chain, tez, chain, wins);

    container.innerHTML =
      '<div class="cp-scoreboard">' +
        '<div class="cp-score cp-tezos-score"><span class="cp-score-num">' + tezWins + '</span><span class="cp-score-label">Tezos</span></div>' +
        '<div class="cp-vs">vs</div>' +
        '<div class="cp-score cp-other-score"><span class="cp-score-num">' + otherWins + '</span><span class="cp-score-label">' + chain.name + '</span></div>' +
      '</div>' +
      '<div class="cp-table">' +
        '<div class="cp-header">' +
          '<div class="cp-metric">Metric</div>' +
          '<div class="cp-val"><img src="/favicon-48.png" alt="Tezos" width="20" height="20"> Tezos</div>' +
          '<div class="cp-val">' + chain.name + '</div>' +
        '</div>' +
        rows.join('') +
      '</div>' +
      '<div class="cp-narrative">' + narrative.map(function(p) { return '<p>' + p + '</p>'; }).join('') + '</div>' +
      '<div class="cp-cta">' +
        '<a href="/" class="cp-cta-btn">Explore the full dashboard →</a>' +
        '<a href="/?calculator" class="cp-cta-btn cp-cta-secondary">Calculate staking rewards →</a>' +
      '</div>' +
      '<div class="cp-footer">' +
        '<p>Data updates live from <a href="https://api.tzkt.io" target="_blank">TzKT</a>. Last verified: ' + CHAIN_COMPARISON.lastUpdated + '</p>' +
      '</div>';
  });
}
