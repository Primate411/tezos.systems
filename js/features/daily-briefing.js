/**
 * Daily Tezos Briefing — auto-generated narrative summary per cycle
 * Pure JS, no AI. ~50 sentence templates, data-driven selection.
 */

import { API_URLS } from '../core/config.js?v=20260228a';

const LS_BASELINE  = 'tezos-systems-briefing-baseline';
const LS_BRIEFING  = 'tezos-systems-briefing-cache';
const LS_LAST_SEEN = 'tezos-systems-briefing-last-seen';

// ─── Template Library ────────────────────────────────────────────────────────

const TEMPLATES = {
  price: [
    ({ pct, dir, price })       => `XTZ pushed ${dir} ${pct}% in the last 24h, trading around $${price}.`,
    ({ pct, dir })              => `Price ${dir === 'up' ? 'climbed' : 'slid'} ${pct}% since yesterday — ${parseFloat(pct) > 3 ? 'notable move.' : 'modest drift.'}`,
    ({ price })                 => `XTZ is holding steady near $${price} with minimal 24h movement.`,
    ({ pct, dir, price })       => `Markets: XTZ ${dir === 'up' ? '▲' : '▼'} ${pct}% to $${price}.`,
    ({ pct, dir })              => `XTZ ${dir === 'up' ? 'gained' : 'lost'} ${pct}% in 24h — ${parseFloat(pct) > 5 ? 'big swing.' : 'routine volatility.'}`,
  ],
  staking: [
    ({ ratio, delta })          => `Staked ratio ${delta >= 0 ? 'rose' : 'fell'} to ${ratio}% — network security is ${parseFloat(ratio) > 30 ? 'strong' : parseFloat(ratio) > 20 ? 'solid' : 'tightening'}.`,
    ({ ratio })                 => `${ratio}% of XTZ supply is staked and securing the network.`,
    ({ ratio, delta })          => `Staking ${Math.abs(delta) < 0.1 ? 'is flat' : delta > 0 ? 'picked up' : 'dipped'} — ${ratio}% of supply locked.`,
    ({ ratio })                 => `Network security: ${ratio}% staked. ${parseFloat(ratio) < 25 ? 'Participation could be higher.' : 'Looking healthy.'}`,
    ({ ratio, delta })          => `${Math.abs(delta) > 0.3 ? `Staking shifted ${delta > 0 ? '+' : ''}${delta.toFixed(2)}pp to` : 'Staking stable at'} ${ratio}%.`,
  ],
  volume: [
    ({ pct, dir })              => `Transaction volume is ${pct}% ${dir} the 7-day average — chain is ${dir === 'above' ? 'busy' : 'quiet'}.`,
    ({ vol })                   => `${vol.toLocaleString()} on-chain transactions in the last 24h.`,
    ({ pct, dir })              => `On-chain activity is ${pct}% ${dir} normal levels this cycle.`,
    ({ vol, pct, dir })         => `${vol.toLocaleString()} txns recorded — ${pct}% ${dir} typical pace.`,
    ({ vol, dir, pct })         => `Chain throughput: ${vol.toLocaleString()} transactions, trending ${dir} (${pct}%).`,
  ],
  contracts: [
    ({ count })                 => `Smart contract calls: ${count.toLocaleString()} in the last 24h.`,
    ({ count, delta })          => `Contract interactions ${delta >= 0 ? 'up' : 'down'} to ${count.toLocaleString()} — DeFi pulse is ${delta >= 0 ? 'rising' : 'cooling'}.`,
    ({ count })                 => `${count.toLocaleString()} contract calls — ${count > 100000 ? 'DeFi is humming' : 'steady baseline activity'}.`,
    ({ count, delta })          => `${count.toLocaleString()} entrypoint invocations this cycle${Math.abs(delta) > 1000 ? ` (${delta > 0 ? '+' : ''}${delta.toLocaleString()} vs last)` : ''}.`,
  ],
  whales: [
    ({ count })                 => `${count} large movements (>10K ꜩ) detected in the last 24h.`,
    ({ count })                 => `Whale tracker: ${count} transactions over 10,000 ꜩ spotted this cycle.`,
    ({ count })                 => `${count > 5 ? 'Heavy' : count > 2 ? 'Moderate' : 'Light'} whale activity — ${count} big transfers recorded.`,
    ({ top, count })            => `Largest detected move: ${top.toLocaleString()} ꜩ. ${count} total whale txns.`,
    ({ count })                 => `${count === 0 ? 'No whale transactions over 10K ꜩ detected.' : `${count} whales surfaced — large capital on the move.`}`,
  ],
  governance: [
    ({ proposal, period, pct }) => `Governance: "${proposal}" is ${pct}% through the ${period} period.`,
    ({ proposal, period })      => `Active vote — "${proposal}" is in the ${period} phase.`,
    ({ name })                  => `No active governance proposal — last upgrade was ${name}.`,
    ({ participation })         => `Governance participation sitting at ${participation}% this period.`,
    ({ proposal })              => `On-chain governance active: "${proposal}" proposal under deliberation.`,
  ],
  ecosystem: [
    ({ n })                     => `${n.toLocaleString()} new funded accounts appeared on-chain this cycle.`,
    ({ n })                     => `Ecosystem growth: ${n.toLocaleString()} fresh wallet activations.`,
    ({ bakers })                => `${bakers} active bakers securing Tezos blocks right now.`,
    ({ n, bakers })             => `${n.toLocaleString()} new accounts, ${bakers} bakers — network growing.`,
    ({ n })                     => `${n > 500 ? 'Strong' : n > 100 ? 'Steady' : 'Slow'} onboarding: ${n.toLocaleString()} new accounts funded this cycle.`,
  ],
  baker: [
    ({ pct })                   => `Your baker attested ${pct}% of slots this cycle. ${parseFloat(pct) >= 99 ? '💚 Flawless.' : parseFloat(pct) >= 95 ? '✅ Solid.' : '⚠️ Some misses.'}`,
    ({ missed })                => `Your baker missed ${missed} attestation slot${missed !== 1 ? 's' : ''} this cycle. ⚠️`,
    ({ pct })                   => `Baker performance: ${pct}% attestation rate this cycle.`,
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtPrice(p)    { return p < 1 ? p.toFixed(4) : p.toFixed(2); }
function fmtPct(p)      { return Math.abs(p).toFixed(1); }
function signedPct(a,b) { return b ? ((a - b) / b) * 100 : 0; }
function pick(arr)      { return arr[Math.floor(Math.random() * arr.length)]; }

async function fetchWhaleCount() {
  try {
    const ago = new Date(Date.now() - 86400000).toISOString();
    const url = `${API_URLS.tzkt}/operations/transactions?amount.gt=10000000000&sort.desc=id&limit=20&timestamp.gt=${ago}`;
    const res = await fetch(url);
    if (!res.ok) return { count: 0, top: 0 };
    const data = await res.json();
    const count = data.length;
    const top   = data.reduce((m, t) => Math.max(m, (t.amount || 0) / 1e6), 0);
    return { count, top: Math.round(top) };
  } catch { return { count: 0, top: 0 }; }
}

async function fetchBakerStats(address, cycle) {
  if (!address) return null;
  try {
    const url = `${API_URLS.tzkt}/rights?baker=${address}&cycle=${cycle}&limit=10000`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.length) return null;
    const attestations = data.filter(r => r.type === 'attestation');
    const total   = attestations.length;
    if (!total) return null;
    const missed  = attestations.filter(r => r.status === 'missed').length;
    const attestPct = (((total - missed) / total) * 100).toFixed(1);
    return { attestPct, missed };
  } catch { return null; }
}

// ─── Sentence Selection ───────────────────────────────────────────────────────

function buildSentences(stats, xtzPrice, baseline, whales, bakerStats) {
  const candidates = [];

  // PRICE
  if (xtzPrice) {
    const prevPrice = baseline?.xtzPrice || xtzPrice;
    const pct24h    = stats.priceChange24h ?? signedPct(xtzPrice, prevPrice);
    const absPct24h = Math.abs(pct24h);
    const dir       = pct24h >= 0 ? 'up' : 'down';
    const score     = absPct24h > 2 ? 90 : absPct24h > 0.5 ? 60 : 30;
    const vars      = { pct: fmtPct(pct24h), dir, price: fmtPrice(xtzPrice) };
    const tmpl      = absPct24h < 0.4 ? TEMPLATES.price[2] : pick(TEMPLATES.price.filter((_,i) => i !== 2));
    candidates.push({ score, text: tmpl(vars), category: 'price' });
  }

  // STAKING
  if (stats.stakingRatio != null) {
    const prev  = baseline?.stakingRatio ?? stats.stakingRatio;
    const delta = stats.stakingRatio - prev;
    const score = Math.abs(delta) > 0.5 ? 80 : Math.abs(delta) > 0.1 ? 50 : 35;
    candidates.push({
      score,
      text: pick(TEMPLATES.staking)({ ratio: stats.stakingRatio.toFixed(1), delta }),
      category: 'staking',
    });
  }

  // VOLUME
  if (stats.transactionVolume24h != null) {
    const prev  = baseline?.transactionVolume24h ?? stats.transactionVolume24h;
    const sp    = signedPct(stats.transactionVolume24h, prev);
    const dir   = sp >= 0 ? 'above' : 'below';
    const score = Math.abs(sp) > 20 ? 85 : Math.abs(sp) > 10 ? 60 : 30;
    candidates.push({
      score,
      text: pick(TEMPLATES.volume)({ vol: stats.transactionVolume24h, pct: fmtPct(sp), dir }),
      category: 'volume',
    });
  }

  // CONTRACTS
  if (stats.contractCalls24h != null) {
    const prev  = baseline?.contractCalls24h ?? stats.contractCalls24h;
    const delta = stats.contractCalls24h - prev;
    const score = Math.abs(delta) > 5000 ? 70 : 40;
    candidates.push({
      score,
      text: pick(TEMPLATES.contracts)({ count: stats.contractCalls24h, delta }),
      category: 'contracts',
    });
  }

  // WHALES
  {
    const score = whales.count > 10 ? 88 : whales.count > 5 ? 70 : whales.count > 0 ? 50 : 20;
    const tmpl  = whales.count > 0 && whales.top > 0 ? pick(TEMPLATES.whales) : TEMPLATES.whales[0];
    candidates.push({
      score,
      text: tmpl({ count: whales.count, top: whales.top }),
      category: 'whales',
    });
  }

  // GOVERNANCE
  if (stats.proposal) {
    const pct = stats.participation != null ? stats.participation.toFixed(1) : '?';
    candidates.push({
      score: 75,
      text: pick(TEMPLATES.governance.slice(0, 2).concat([TEMPLATES.governance[3], TEMPLATES.governance[4]]))(
        { proposal: stats.proposal, period: stats.votingPeriod || 'current', pct, participation: pct }),
      category: 'governance',
    });
  } else {
    candidates.push({
      score: 30,
      text: TEMPLATES.governance[2]({ name: stats.lastUpgradeName || 'Tallinn' }),
      category: 'governance',
    });
  }

  // ECOSYSTEM
  if (stats.fundedAccounts != null) {
    const prev  = baseline?.fundedAccounts ?? stats.fundedAccounts;
    const delta = stats.fundedAccounts - prev;
    const n     = Math.max(delta, stats.newAccounts || 0);
    const score = delta > 1000 ? 65 : delta > 200 ? 45 : 25;
    candidates.push({
      score,
      text: pick(TEMPLATES.ecosystem)({ n, bakers: stats.totalBakers || '?' }),
      category: 'ecosystem',
    });
  }

  // BAKER (personal)
  if (bakerStats) {
    const score = bakerStats.missed > 0 ? 95 : 55;
    const tmpl  = bakerStats.missed > 0 ? TEMPLATES.baker[1] : pick([TEMPLATES.baker[0], TEMPLATES.baker[2]]);
    candidates.push({
      score,
      text: tmpl({ pct: bakerStats.attestPct, missed: bakerStats.missed }),
      category: 'baker',
    });
  }

  // Sort by score, dedupe categories, pick 4–6
  candidates.sort((a, b) => b.score - a.score);
  const seen = new Set();
  const chosen = [];
  for (const c of candidates) {
    if (!seen.has(c.category)) {
      seen.add(c.category);
      chosen.push(c.text);
    }
    if (chosen.length >= 6) break;
  }
  // Pad to 4 minimum
  if (chosen.length < 4) {
    for (const c of candidates) {
      if (!chosen.includes(c.text)) { chosen.push(c.text); }
      if (chosen.length >= 4) break;
    }
  }
  return chosen;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

// Legacy standalone card rendering removed — drawer handles presentation.

// ─── Core Generate ────────────────────────────────────────────────────────────

async function generate(stats, xtzPrice) {
  const cycle = stats.cycle ?? 0;

  // Return cached briefing if it's recent and data hasn't changed much
  try {
    const cached = JSON.parse(localStorage.getItem(LS_BRIEFING) || 'null');
    if (cached?.cycle === cycle && cached.generatedAt) {
      const ageMs = Date.now() - cached.generatedAt;
      const ageHrs = ageMs / 3600000;
      // Regenerate if: >4 hours old, OR price shifted >2%, OR different visit session
      const priceDrift = cached.priceAt && xtzPrice ? Math.abs(xtzPrice - cached.priceAt) / cached.priceAt : 0;
      const isStale = ageHrs > 4 || priceDrift > 0.02;
      if (!isStale) return cached;
    }
  } catch { /* ignore */ }

  const baseline = (() => { try { return JSON.parse(localStorage.getItem(LS_BASELINE) || 'null'); } catch { return null; } })();

  const [whales, bakerStats] = await Promise.all([
    fetchWhaleCount(),
    fetchBakerStats(localStorage.getItem('tezos-systems-my-baker-address'), cycle),
  ]);

  const sentences = buildSentences(stats, xtzPrice, baseline, whales, bakerStats);
  const briefing  = { cycle, sentences, generatedAt: Date.now(), priceAt: xtzPrice };

  try {
    localStorage.setItem(LS_BRIEFING,  JSON.stringify(briefing));
    localStorage.setItem(LS_BASELINE,  JSON.stringify({ ...stats, xtzPrice }));
  } catch { /* storage full */ }

  return briefing;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getBriefingSentences(stats, xtzPrice) {
  if (!stats?.cycle) return { cycle: 0, sentences: [] };
  const briefing = await generate(stats, xtzPrice);
  return { cycle: briefing.cycle, sentences: briefing.sentences || [] };
}

function renderToDrawer(cycle, sentences) {
  const container = document.getElementById('drawer-network');
  if (!container) return;
  container.innerHTML = `
    <div class="network-context-header">🌐 Network Context · Cycle ${cycle}</div>
    <ul class="network-context-list">
      ${sentences.map(s => `<li>${s}</li>`).join('')}
    </ul>
  `;
}

export async function initDailyBriefing(stats, xtzPrice) {
  if (!stats?.cycle) return;
  const briefing = await generate(stats, xtzPrice);
  renderToDrawer(briefing.cycle, briefing.sentences);
  try { localStorage.setItem(LS_LAST_SEEN, String(briefing.cycle)); } catch {}
}

export async function updateDailyBriefing(stats, xtzPrice) {
  if (!stats?.cycle) return;
  try {
    const cached = JSON.parse(localStorage.getItem(LS_BRIEFING) || 'null');
    if (cached?.cycle === stats.cycle) {
      // Same cycle — render from cache if drawer section is empty
      const container = document.getElementById('drawer-network');
      if (container && !container.innerHTML.trim()) {
        renderToDrawer(cached.cycle, cached.sentences);
      }
      return;
    }
  } catch { /* ignore */ }
  return initDailyBriefing(stats, xtzPrice);
}
