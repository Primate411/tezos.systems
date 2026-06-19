/**
 * Daily Tezos Briefing — auto-generated narrative summary per cycle
 * Pure JS, no AI. ~50 sentence templates, data-driven selection.
 */

import { API_URLS } from '../core/config.js';
import { escapeHtml } from '../core/utils.js';
import { fetchXTZPrice } from './price.js';

const LS_BASELINE  = 'tezos-systems-briefing-baseline';
const LS_BRIEFING  = 'tezos-systems-briefing-cache';
const LS_LAST_SEEN = 'tezos-systems-briefing-last-seen';
const PRICE_FETCH_TIMEOUT_MS = 2500;

const CATEGORY_META = {
  baker: { label: 'Baker', icon: '🍞', tone: 'operator', detail: 'Personal operator signal' },
  price: { label: 'Market', icon: '💸', tone: 'market', detail: 'XTZ price movement' },
  staking: { label: 'Staking', icon: '🥩', tone: 'staking', detail: 'Security and yield' },
  volume: { label: 'Activity', icon: '⚡', tone: 'activity', detail: 'Transaction flow' },
  contracts: { label: 'Contracts', icon: '🧩', tone: 'activity', detail: 'App and DeFi pulse' },
  whales: { label: 'Whales', icon: '🐋', tone: 'capital', detail: 'Large value movement' },
  governance: { label: 'Governance', icon: '🏛️', tone: 'governance', detail: 'Protocol decision lane' },
  ecosystem: { label: 'Growth', icon: '🌱', tone: 'growth', detail: 'New account flow' },
  network: { label: 'Network', icon: '🌐', tone: 'network', detail: 'Daily Tezos pulse' }
};

let lastStats = null;
let lastXtzPrice = null;
let personalizationWired = false;

// ─── Template Library ────────────────────────────────────────────────────────

const TEMPLATES = {
  price: [
    ({ pct, dir, price })       => `XTZ moved ${dir} ${pct}% in the last 24h, trading around $${price}.`,
    ({ pct, dir })              => `Price ${dir === 'up' ? 'climbed' : 'slid'} ${pct}% since yesterday — ${parseFloat(pct) > 3 ? 'notable move.' : 'modest drift.'}`,
    ({ price })                 => `XTZ is holding steady near $${price} with minimal 24h movement.`,
    ({ pct, dir, price })       => `Markets: XTZ ${dir === 'up' ? '▲' : '▼'} ${pct}% to $${price}.`,
    ({ pct, dir })              => `XTZ ${dir === 'up' ? 'gained' : 'lost'} ${pct}% in 24h — ${parseFloat(pct) >= 4 ? 'sharp move.' : 'routine volatility.'}`,
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

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function safeLocalStorageGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function categoryMeta(category) {
  return CATEGORY_META[category] || CATEGORY_META.network;
}

function getCurrentMyTezosProfile() {
  const data = typeof window !== 'undefined' ? window._myTezosData : null;
  const story = data?.story || null;
  const address = data?.fullAddress || safeLocalStorageGet('tezos-systems-my-baker-address') || '';
  const interests = [];
  const add = (key, label) => {
    if (!interests.some(item => item.key === key)) interests.push({ key, label });
  };

  if (data?.isBaker) add('baker', 'Baker ops');
  else if (data?.bakerAddr || address) add('baker', 'Baker health');
  if ((Number(data?.totalXTZ) || 0) > 0) add('portfolio', 'Portfolio');
  if (data?.isStaker || (Number(data?.staked) || 0) > 0) add('staking', 'Staking');
  if (story?.proposalsInjected > 0 || story?.bakerProposalsInjected > 0 || data?.bakerVote) add('governance', 'Governance');
  if ((Number(story?.nftAssetsCollected) || 0) > 0) add('collector', 'Collector');
  if ((Number(story?.creatorStats?.totalCreated) || 0) > 0) add('creator', 'Creator');
  if (!interests.length) add('network', 'Network pulse');

  const keys = interests.map(item => item.key);
  const key = [
    address ? 'address' : 'global',
    data?.isBaker ? 'baker' : data?.bakerAddr ? 'delegator' : 'observer',
    ...keys
  ].join('|');

  return {
    address,
    isReady: Boolean(data?.fullAddress),
    isBaker: data?.isBaker === true,
    hasBaker: Boolean(data?.bakerAddr || address),
    interests,
    interestKeys: new Set(keys),
    key
  };
}

function scoreBoostFor(category, profile) {
  const keys = profile?.interestKeys || new Set();
  if (category === 'baker' && profile?.hasBaker) return 30;
  if (category === 'governance' && keys.has('governance')) return 22;
  if (category === 'staking' && keys.has('staking')) return 18;
  if (category === 'price' && keys.has('portfolio')) return 16;
  if (category === 'contracts' && (keys.has('creator') || keys.has('collector'))) return 12;
  if (category === 'ecosystem' && (keys.has('creator') || keys.has('collector'))) return 8;
  if (category === 'whales' && keys.has('portfolio')) return 8;
  return 0;
}

function makeSignal(category, score, text, options = {}) {
  const meta = categoryMeta(category);
  return {
    category,
    score,
    text,
    title: options.title || meta.label,
    icon: options.icon || meta.icon,
    detail: options.detail || meta.detail,
    tone: options.tone || meta.tone
  };
}

function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise(resolve => setTimeout(() => resolve(null), timeoutMs))
  ]);
}

async function resolvePriceContext(stats, xtzPrice) {
  const nextStats = { ...(stats || {}) };
  let price = finiteNumber(xtzPrice) || 0;

  try {
    const data = await withTimeout(fetchXTZPrice(), PRICE_FETCH_TIMEOUT_MS);
    if (data) {
      const livePrice = finiteNumber(data.usd);
      const liveChange = finiteNumber(data.usd_24h_change);
      if (livePrice && livePrice > 0) price = livePrice;
      if (liveChange != null) nextStats.priceChange24h = liveChange;
    }
  } catch { /* keep DOM price and local baseline fallback */ }

  return {
    stats: nextStats,
    xtzPrice: price,
    priceChange24h: finiteNumber(nextStats.priceChange24h),
  };
}

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

function buildSentences(stats, xtzPrice, baseline, whales, bakerStats, profile = getCurrentMyTezosProfile()) {
  const candidates = [];
  const addSignal = (category, score, text, options = {}) => {
    candidates.push(makeSignal(category, score + scoreBoostFor(category, profile), text, options));
  };

  // PRICE
  if (xtzPrice) {
    const prevPrice = baseline?.xtzPrice || xtzPrice;
    const livePct24h = finiteNumber(stats.priceChange24h);
    const pct24h    = livePct24h ?? signedPct(xtzPrice, prevPrice);
    const absPct24h = Math.abs(pct24h);
    const dir       = pct24h >= 0 ? 'up' : 'down';
    const score     = absPct24h > 2 ? 90 : absPct24h > 0.5 ? 60 : 30;
    const vars      = { pct: fmtPct(pct24h), dir, price: fmtPrice(xtzPrice) };
    const tmpl      = absPct24h < 0.4 ? TEMPLATES.price[2] : pick(TEMPLATES.price.filter((_,i) => i !== 2));
    addSignal('price', score, tmpl(vars), {
      detail: absPct24h >= 2 ? 'Portfolio-sized move' : 'Market temperature',
      tone: pct24h >= 0 ? 'market-up' : 'market-down'
    });
  }

  // STAKING
  if (stats.stakingRatio != null) {
    const prev  = baseline?.stakingRatio ?? stats.stakingRatio;
    const delta = stats.stakingRatio - prev;
    const score = Math.abs(delta) > 0.5 ? 80 : Math.abs(delta) > 0.1 ? 50 : 35;
    addSignal('staking', score, pick(TEMPLATES.staking)({ ratio: stats.stakingRatio.toFixed(1), delta }), {
      detail: Math.abs(delta) > 0.1 ? `${delta > 0 ? '+' : ''}${delta.toFixed(2)} percentage points vs baseline` : 'Staking share is steady',
      tone: delta >= 0 ? 'staking' : 'watch'
    });
  }

  // VOLUME
  if (stats.transactionVolume24h != null) {
    const prev  = baseline?.transactionVolume24h ?? stats.transactionVolume24h;
    const sp    = signedPct(stats.transactionVolume24h, prev);
    const dir   = sp >= 0 ? 'above' : 'below';
    const score = Math.abs(sp) > 20 ? 85 : Math.abs(sp) > 10 ? 60 : 30;
    addSignal('volume', score, pick(TEMPLATES.volume)({ vol: stats.transactionVolume24h, pct: fmtPct(sp), dir }), {
      detail: Math.abs(sp) > 10 ? 'Activity changed meaningfully' : 'Activity baseline',
      tone: sp >= 0 ? 'activity' : 'quiet'
    });
  }

  // CONTRACTS
  if (stats.contractCalls24h != null) {
    const prev  = baseline?.contractCalls24h ?? stats.contractCalls24h;
    const delta = stats.contractCalls24h - prev;
    const score = Math.abs(delta) > 5000 ? 70 : 40;
    addSignal('contracts', score, pick(TEMPLATES.contracts)({ count: stats.contractCalls24h, delta }), {
      detail: Math.abs(delta) > 1000 ? `${delta > 0 ? '+' : ''}${delta.toLocaleString()} calls vs baseline` : 'App usage baseline',
      tone: delta >= 0 ? 'activity' : 'quiet'
    });
  }

  // WHALES
  {
    const score = whales.count > 10 ? 88 : whales.count > 5 ? 70 : whales.count > 0 ? 50 : 20;
    const tmpl  = whales.count > 0 && whales.top > 0 ? pick(TEMPLATES.whales) : TEMPLATES.whales[0];
    addSignal('whales', score, tmpl({ count: whales.count, top: whales.top }), {
      detail: whales.top > 0 ? `Largest move ${whales.top.toLocaleString()} XTZ` : 'No major transfer spike',
      tone: whales.count > 10 ? 'capital-hot' : whales.count > 0 ? 'capital' : 'quiet'
    });
  }

  // GOVERNANCE
  if (stats.proposal) {
    const pct = stats.participation != null ? stats.participation.toFixed(1) : '?';
    addSignal('governance', 75, pick(TEMPLATES.governance.slice(0, 2).concat([TEMPLATES.governance[3], TEMPLATES.governance[4]]))(
      { proposal: stats.proposal, period: stats.votingPeriod || 'current', pct, participation: pct }), {
      detail: 'Live governance period',
      tone: 'governance-hot'
    });
  } else {
    addSignal('governance', 30, TEMPLATES.governance[2]({ name: stats.lastUpgradeName || 'Tallinn' }), {
      detail: 'No active protocol vote',
      tone: 'quiet'
    });
  }

  // ECOSYSTEM
  if (stats.fundedAccounts != null) {
    const prev  = baseline?.fundedAccounts ?? stats.fundedAccounts;
    const delta = stats.fundedAccounts - prev;
    const n     = Math.max(delta, stats.newAccounts || 0);
    const score = delta > 1000 ? 65 : delta > 200 ? 45 : 25;
    addSignal('ecosystem', score, pick(TEMPLATES.ecosystem)({ n, bakers: stats.totalBakers || '?' }), {
      detail: n > 200 ? 'New accounts worth noticing' : 'Onboarding baseline',
      tone: n > 200 ? 'growth' : 'quiet'
    });
  }

  // BAKER (personal)
  if (bakerStats) {
    const score = bakerStats.missed > 0 ? 95 : 55;
    const tmpl  = bakerStats.missed > 0 ? TEMPLATES.baker[1] : pick([TEMPLATES.baker[0], TEMPLATES.baker[2]]);
    addSignal('baker', score, tmpl({ pct: bakerStats.attestPct, missed: bakerStats.missed }), {
      detail: bakerStats.missed > 0 ? 'Personal baker watch item' : 'Personal baker check',
      tone: bakerStats.missed > 0 ? 'watch' : 'operator'
    });
  }

  // Sort by score, dedupe categories, pick 4–6
  candidates.sort((a, b) => b.score - a.score);
  const seen = new Set();
  const chosen = [];
  for (const c of candidates) {
    if (!seen.has(c.category)) {
      seen.add(c.category);
      chosen.push(c);
    }
    if (chosen.length >= 6) break;
  }
  // Pad to 4 minimum
  if (chosen.length < 4) {
    for (const c of candidates) {
      if (!chosen.some(signal => signal.text === c.text)) { chosen.push(c); }
      if (chosen.length >= 4) break;
    }
  }
  return chosen;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

// Legacy standalone card rendering removed — drawer handles presentation.

// ─── Core Generate ────────────────────────────────────────────────────────────

async function generate(stats, xtzPrice) {
  const sourceStats = stats || {};
  const cycle = sourceStats.cycle ?? 0;
  const profile = getCurrentMyTezosProfile();
  const priceContext = await resolvePriceContext(sourceStats, xtzPrice);
  const nextStats = priceContext.stats;
  const currentPrice = priceContext.xtzPrice;
  const currentChange24h = priceContext.priceChange24h;

  // Return cached briefing if it's recent and data hasn't changed much
  try {
    const cached = JSON.parse(localStorage.getItem(LS_BRIEFING) || 'null');
    if (cached?.cycle === cycle && cached.generatedAt) {
      const ageMs = Date.now() - cached.generatedAt;
      const ageHrs = ageMs / 3600000;
      const priceDrift = cached.priceAt && currentPrice ? Math.abs(currentPrice - cached.priceAt) / cached.priceAt : 0;
      const cachedChange24h = finiteNumber(cached.priceChange24h);
      const changeDrift = currentChange24h != null && cachedChange24h != null
        ? Math.abs(currentChange24h - cachedChange24h)
        : 0;
      const profileChanged = cached.profileKey !== profile.key;
      const missingLiveMove = currentChange24h != null && cachedChange24h == null;
      const crossedSteadyBoundary = currentChange24h != null && cachedChange24h != null
        && (Math.abs(currentChange24h) < 0.4) !== (Math.abs(cachedChange24h) < 0.4);
      // Regenerate if: >4 hours old, price shifted >2%, or the real 24h move changed enough to affect narrative.
      const isStale = ageHrs > 4 || priceDrift > 0.02 || profileChanged || missingLiveMove || changeDrift > 0.75 || crossedSteadyBoundary;
      if (!isStale) return cached;
    }
  } catch { /* ignore */ }

  const baseline = (() => { try { return JSON.parse(localStorage.getItem(LS_BASELINE) || 'null'); } catch { return null; } })();

  const [whales, bakerStats] = await Promise.all([
    fetchWhaleCount(),
    fetchBakerStats(localStorage.getItem('tezos-systems-my-baker-address'), cycle),
  ]);

  const sentences = buildSentences(nextStats, currentPrice, baseline, whales, bakerStats, profile);
  const briefing  = { cycle, sentences, generatedAt: Date.now(), priceAt: currentPrice, priceChange24h: currentChange24h, profileKey: profile.key };

  try {
    localStorage.setItem(LS_BRIEFING,  JSON.stringify(briefing));
    localStorage.setItem(LS_BASELINE,  JSON.stringify({ ...nextStats, xtzPrice: currentPrice }));
  } catch { /* storage full */ }

  return briefing;
}

// ─── Public API ───────────────────────────────────────────────────────────────

function safeCssToken(value) {
  return String(value || 'network').replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'network';
}

function normalizeSignal(signal, index = 0) {
  if (typeof signal === 'string') {
    return makeSignal('network', 20 - index, signal);
  }
  const category = safeCssToken(signal?.category || 'network');
  const meta = categoryMeta(category);
  return {
    category,
    score: finiteNumber(signal?.score) ?? (20 - index),
    text: String(signal?.text || ''),
    title: String(signal?.title || meta.label),
    icon: String(signal?.icon || meta.icon),
    detail: String(signal?.detail || meta.detail),
    tone: safeCssToken(signal?.tone || meta.tone)
  };
}

function getBriefingLead(profile, signals) {
  const top = signals[0];
  if (!top) return 'A compact read on the network signals most likely to matter today.';
  if (profile.isBaker) return `Your baker lane leads today: ${top.detail.toLowerCase()}.`;
  if (profile.interestKeys?.has('creator') || profile.interestKeys?.has('collector')) {
    return `Your collector and creator lens is active; contract, account, and market pulses get extra weight.`;
  }
  if (profile.interestKeys?.has('governance')) {
    return `Governance-aware context is active, with protocol decisions weighted ahead of routine noise.`;
  }
  if (profile.interestKeys?.has('portfolio')) {
    return `Portfolio-aware context is active, so price, staking, and capital movement get priority.`;
  }
  return 'A compact read on the network signals most likely to matter today.';
}

function renderFocusChips(profile) {
  return profile.interests.slice(0, 5).map(item => (
    `<span class="network-focus-chip" data-focus="${safeCssToken(item.key)}">${escapeHtml(item.label)}</span>`
  )).join('');
}

function renderSignalCard(signal, index) {
  const label = `${signal.icon} ${signal.title}`;
  return `
    <article class="network-signal network-signal-${signal.tone}" data-category="${escapeHtml(signal.category)}">
      <div class="network-signal-rank">${index + 1}</div>
      <div class="network-signal-main">
        <div class="network-signal-head">
          <span class="network-signal-label">${escapeHtml(label)}</span>
          <span class="network-signal-detail">${escapeHtml(signal.detail)}</span>
        </div>
        <p>${escapeHtml(signal.text)}</p>
      </div>
    </article>
  `;
}

function rerenderCachedBriefing() {
  try {
    const cached = JSON.parse(localStorage.getItem(LS_BRIEFING) || 'null');
    if (cached?.cycle && cached?.sentences) renderToDrawer(cached.cycle, cached.sentences);
  } catch { /* ignore */ }
}

function wirePersonalizationRefresh() {
  if (personalizationWired || typeof window === 'undefined') return;
  personalizationWired = true;
  window.addEventListener('my-tezos-data-ready', () => {
    if (lastStats?.cycle) {
      updateDailyBriefing(lastStats, lastXtzPrice).catch(() => rerenderCachedBriefing());
    } else {
      rerenderCachedBriefing();
    }
  });
}

function renderToDrawer(cycle, sentences) {
  const container = document.getElementById('drawer-network');
  if (!container) return;
  const profile = getCurrentMyTezosProfile();
  const signals = (Array.isArray(sentences) ? sentences : [])
    .map(normalizeSignal)
    .filter(signal => signal.text)
    .slice(0, 6);
  const lead = getBriefingLead(profile, signals);
  container.innerHTML = `
    <section class="network-context-panel">
      <div class="network-context-header">
        <span>🌐 Network Context</span>
        <strong>Cycle ${escapeHtml(String(cycle))}</strong>
      </div>
      <p class="network-context-lede">${escapeHtml(lead)}</p>
      <div class="network-context-focus" aria-label="Context focus">
        ${renderFocusChips(profile)}
      </div>
      <div class="network-context-signals">
        ${signals.map(renderSignalCard).join('')}
      </div>
    </section>
  `;
}

export async function initDailyBriefing(stats, xtzPrice) {
  wirePersonalizationRefresh();
  if (!stats?.cycle) return;
  lastStats = stats;
  lastXtzPrice = xtzPrice;
  const briefing = await generate(stats, xtzPrice);
  renderToDrawer(briefing.cycle, briefing.sentences);
  try { localStorage.setItem(LS_LAST_SEEN, String(briefing.cycle)); } catch {}
}

export async function updateDailyBriefing(stats, xtzPrice) {
  wirePersonalizationRefresh();
  if (!stats?.cycle) return;
  lastStats = stats;
  lastXtzPrice = xtzPrice;
  const briefing = await generate(stats, xtzPrice);
  renderToDrawer(briefing.cycle, briefing.sentences);
  try { localStorage.setItem(LS_LAST_SEEN, String(briefing.cycle)); } catch {}
}
