/**
 * Daily Tezos Briefing — auto-generated narrative summary per cycle
 * Pure JS, no AI. ~50 sentence templates, data-driven selection.
 */

import { API_URLS } from '../core/config.js';

const LS_BASELINE  = 'tezos-systems-briefing-baseline';
const LS_BRIEFING  = 'tezos-systems-briefing-cache';
const LS_LAST_SEEN = 'tezos-systems-briefing-last-seen';
const LS_HOME_SNAPSHOT = 'tezos-systems-home-snapshot';
const MY_TEZOS_KEY = 'tezos-systems-my-baker-address';
let lastRenderedBriefing = null;
let todayShareWired = false;

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
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function formatSigned(value, suffix = '') {
  if (!Number.isFinite(value)) return null;
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(Math.abs(value) >= 10 ? 0 : 1)}${suffix}`;
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

function buildWatchItems(stats, xtzPrice, baseline, whales, bakerStats) {
  const items = [];
  if (stats.proposal) {
    const phase = stats.votingPeriod || 'current phase';
    items.push({
      title: 'Governance active',
      copy: `${stats.proposal} is in ${phase}. Open the Chamber for quorum, yay, and baker vote context.`,
      tone: 'live'
    });
  } else if (stats.lastUpgradeName) {
    items.push({
      title: 'Governance quiet',
      copy: `No active L1 vote. Last upgrade: ${stats.lastUpgradeName}. Watch the Chamber for the next proposal window.`,
      tone: 'calm'
    });
  }

  if (stats.cycleTimeRemaining) {
    items.push({
      title: 'Cycle clock',
      copy: `Cycle ${stats.cycle || '--'} has about ${stats.cycleTimeRemaining} remaining.`,
      tone: 'calm'
    });
  }

  if (stats.stakingRatio != null) {
    const delta = baseline?.stakingRatio != null ? stats.stakingRatio - baseline.stakingRatio : 0;
    const deltaText = Math.abs(delta) >= 0.1 ? ` (${formatSigned(delta, 'pp')} since last brief)` : '';
    items.push({
      title: 'Staking posture',
      copy: `${stats.stakingRatio.toFixed(1)}% of supply is staked${deltaText}.`,
      tone: delta < -0.5 ? 'watch' : 'calm'
    });
  }

  if (xtzPrice && baseline?.xtzPrice) {
    const pricePct = signedPct(xtzPrice, baseline.xtzPrice);
    if (Math.abs(pricePct) >= 0.5) {
      items.push({
        title: 'XTZ moved',
        copy: `XTZ is ${formatSigned(pricePct, '%')} since the last network brief.`,
        tone: Math.abs(pricePct) >= 3 ? 'watch' : 'calm'
      });
    }
  }

  if (whales?.count > 0) {
    items.push({
      title: 'Large transfers',
      copy: `${whales.count} large XTZ movement${whales.count === 1 ? '' : 's'} surfaced in the last 24h.`,
      tone: whales.count > 5 ? 'watch' : 'calm'
    });
  }

  if (bakerStats) {
    items.push({
      title: bakerStats.missed > 0 ? 'Your baker missed slots' : 'Your baker looks steady',
      copy: bakerStats.missed > 0
        ? `${bakerStats.missed} missed attestation slot${bakerStats.missed === 1 ? '' : 's'} this cycle.`
        : `${bakerStats.attestPct}% attestation rate this cycle.`,
      tone: bakerStats.missed > 0 ? 'watch' : 'good'
    });
  }

  return items.slice(0, 5);
}

function buildPersonalBrief(bakerStats) {
  const savedAddress = localStorage.getItem(MY_TEZOS_KEY);
  const personalData = window._myTezosData;
  if (personalData?.fullAddress) {
    const balance = Number.isFinite(personalData.totalXTZ)
      ? `${Math.round(personalData.totalXTZ).toLocaleString()} XTZ`
      : 'saved address';
    const baker = personalData.bakerName ? ` Baker: ${personalData.bakerName}.` : '';
    return {
      title: `${personalData.address || 'My Tezos'} · ${balance}`,
      copy: `${bakerStats?.missed > 0 ? 'Check baker health in your drawer.' : 'Your personal brief is ready.'}${baker}`,
      connected: true
    };
  }
  if (savedAddress) {
    return {
      title: 'My Tezos saved',
      copy: 'Open your drawer for the latest rewards, baker health, and personal Morning Brief.',
      connected: true
    };
  }
  return {
    title: 'Set My Tezos once',
    copy: 'Add a wallet, address, or .tez name to make this page personal.',
    connected: false
  };
}

function readHomeSnapshot() {
  try { return JSON.parse(localStorage.getItem(LS_HOME_SNAPSHOT) || 'null'); } catch { return null; }
}

function writeHomeSnapshot(stats, xtzPrice, bakerStats) {
  try {
    localStorage.setItem(LS_HOME_SNAPSHOT, JSON.stringify({
      ts: Date.now(),
      cycle: stats.cycle ?? null,
      cycleProgress: stats.cycleProgress ?? null,
      stakingRatio: stats.stakingRatio ?? null,
      tz4Percentage: stats.tz4Percentage ?? null,
      proposal: stats.proposal || null,
      votingPeriod: stats.votingPeriod || null,
      xtzPrice: xtzPrice || null,
      bakerMissed: bakerStats?.missed ?? null,
      bakerAttestPct: bakerStats?.attestPct ?? null
    }));
  } catch {}
}

function snapshotAgeLabel(ts) {
  if (!ts) return 'last visit';
  const minutes = Math.max(1, Math.round((Date.now() - ts) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function buildHomeChanges(stats, xtzPrice, previous, bakerStats) {
  if (!previous?.ts) return [];
  const changes = [];
  const from = snapshotAgeLabel(previous.ts);
  const add = (selector, label, tone = 'calm') => changes.push({ selector, label, tone, from });

  if (stats.cycle && previous.cycle && stats.cycle !== previous.cycle) {
    add('#today-panel', `New cycle ${stats.cycle}`, 'live');
    add('#chamber-entry-card', `Cycle changed: ${previous.cycle} → ${stats.cycle}`, 'live');
  }

  if (stats.proposal && stats.proposal !== previous.proposal) {
    add('#today-panel', `New governance item: ${stats.proposal}`, 'watch');
    add('#chamber-entry-card', `New since ${from}`, 'watch');
  } else if (stats.votingPeriod && previous.votingPeriod && stats.votingPeriod !== previous.votingPeriod) {
    add('#chamber-entry-card', `Now ${stats.votingPeriod}`, 'live');
  }

  if (Number.isFinite(stats.stakingRatio) && Number.isFinite(previous.stakingRatio)) {
    const delta = stats.stakingRatio - previous.stakingRatio;
    if (Math.abs(delta) >= 0.1) {
      add('#today-panel', `Staking ${formatSigned(delta, 'pp')}`, Math.abs(delta) >= 0.5 ? 'watch' : 'calm');
    }
  }

  if (Number.isFinite(stats.tz4Percentage) && Number.isFinite(previous.tz4Percentage)) {
    const delta = stats.tz4Percentage - previous.tz4Percentage;
    if (Math.abs(delta) >= 0.1) {
      add('[data-stat="tz4-adoption"]', `tz4 ${formatSigned(delta, 'pp')}`, delta > 0 ? 'good' : 'watch');
    }
  }

  if (xtzPrice && previous.xtzPrice) {
    const pricePct = signedPct(xtzPrice, previous.xtzPrice);
    if (Math.abs(pricePct) >= 0.7) {
      add('#today-panel', `XTZ ${formatSigned(pricePct, '%')}`, Math.abs(pricePct) >= 3 ? 'watch' : 'calm');
      add('#tezlink-entry-card', `XTZ ${formatSigned(pricePct, '%')}`, Math.abs(pricePct) >= 3 ? 'watch' : 'calm');
    }
  }

  if (bakerStats && previous.bakerMissed !== null && bakerStats.missed !== previous.bakerMissed) {
    add('#today-panel', bakerStats.missed > previous.bakerMissed ? 'Your baker missed more slots' : 'Your baker improved', bakerStats.missed > previous.bakerMissed ? 'watch' : 'good');
  }

  return changes.slice(0, 6);
}

function clearChangeBadges() {
  document.querySelectorAll('.today-change-list, .chamber-change-badge').forEach((node) => node.remove());
}

function renderChangeBadges(changes) {
  clearChangeBadges();
  if (!changes?.length) return;

  const todayChanges = changes.filter((change) => change.selector === '#today-panel');
  if (todayChanges.length) {
    const list = document.createElement('div');
    list.className = 'today-change-list';
    list.innerHTML = todayChanges.slice(0, 3).map((change) => `
      <span class="today-change-pill tone-${escapeHtml(change.tone || 'calm')}">${escapeHtml(change.label)}</span>
    `).join('');
    const headline = document.getElementById('today-headline');
    headline?.after(list);
  }

  changes
    .filter((change) => change.selector !== '#today-panel')
    .forEach((change) => {
      document.querySelectorAll(change.selector).forEach((card) => {
        if (card.querySelector('.chamber-change-badge')) return;
        const badge = document.createElement('div');
        badge.className = `chamber-change-badge tone-${change.tone || 'calm'}`;
        badge.textContent = change.label;
        card.appendChild(badge);
      });
    });
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

  const previousHome = readHomeSnapshot();
  const sentences = buildSentences(stats, xtzPrice, baseline, whales, bakerStats);
  const watchItems = buildWatchItems(stats, xtzPrice, baseline, whales, bakerStats);
  const personal = buildPersonalBrief(bakerStats);
  const changes = buildHomeChanges(stats, xtzPrice, previousHome, bakerStats);
  const briefing  = { cycle, sentences, watchItems, personal, changes, generatedAt: Date.now(), priceAt: xtzPrice };

  try {
    localStorage.setItem(LS_BRIEFING,  JSON.stringify(briefing));
    localStorage.setItem(LS_BASELINE,  JSON.stringify({ ...stats, xtzPrice }));
  } catch { /* storage full */ }
  writeHomeSnapshot(stats, xtzPrice, bakerStats);

  return briefing;
}

// ─── Public API ───────────────────────────────────────────────────────────────

function renderToDrawer(cycle, sentences) {
  const container = document.getElementById('drawer-network');
  if (!container) return;
  container.innerHTML = `
    <div class="network-context-header">🌐 Network Context · Cycle ${cycle}</div>
    <ul class="network-context-list">
      ${sentences.map(s => `<li>${escapeHtml(s)}</li>`).join('')}
    </ul>
  `;
}

function renderToToday(briefing, stats = {}, xtzPrice = 0) {
  const panel = document.getElementById('today-panel');
  if (!panel) return;
  const sentences = Array.isArray(briefing?.sentences) ? briefing.sentences : [];
  const watchItems = Array.isArray(briefing?.watchItems) ? briefing.watchItems : [];
  const personal = briefing?.personal || buildPersonalBrief(null);
  const changes = Array.isArray(briefing?.changes) ? briefing.changes : [];
  const headline = sentences[0] || 'Tezos is online. Live context is still loading.';
  const supporting = sentences.slice(1, 5);
  const cycle = briefing?.cycle || stats?.cycle || '--';
  const priceText = xtzPrice ? ` · XTZ $${fmtPrice(xtzPrice)}` : '';

  const kicker = document.getElementById('today-kicker');
  const headlineEl = document.getElementById('today-headline');
  const list = document.getElementById('today-brief-list');
  const personalCard = document.getElementById('today-personal-card');
  const personalTitle = document.getElementById('today-personal-title');
  const personalCopy = document.getElementById('today-personal-copy');
  const watchTitle = document.getElementById('today-watch-title');
  const watchCopy = document.getElementById('today-watch-copy');

  if (kicker) kicker.textContent = `Network brief · Cycle ${cycle}${priceText}`;
  if (headlineEl) headlineEl.textContent = headline;
  if (list) {
    const rows = supporting.length ? supporting : ['No major change detected since the last generated brief.'];
    list.innerHTML = rows.map((sentence) => `<li>${escapeHtml(sentence)}</li>`).join('');
  }
  if (personalCard) personalCard.classList.toggle('is-connected', personal.connected === true);
  if (personalTitle) personalTitle.textContent = personal.title;
  if (personalCopy) personalCopy.textContent = personal.copy;

  const watch = watchItems[0] || {
    title: 'Chambers',
    copy: 'Open the cards below for health, governance, Tezos X, tz4, and LB context.',
    tone: 'calm'
  };
  const watchCard = document.getElementById('today-watch-card');
  if (watchCard) {
    watchCard.dataset.todayTone = watch.tone || 'calm';
  }
  if (watchTitle) watchTitle.textContent = watch.title;
  if (watchCopy) watchCopy.textContent = watch.copy;
  renderChangeBadges(changes);
  lastRenderedBriefing = { ...briefing, sentences, watchItems, personal, changes };
  wireTodayShareButton();
}

function getCachedBriefing() {
  try { return JSON.parse(localStorage.getItem(LS_BRIEFING) || 'null'); } catch { return null; }
}

function rerenderTodayFromCache() {
  const cached = getCachedBriefing();
  if (cached) {
    cached.personal = buildPersonalBrief(null);
    renderToToday(cached, {}, cached.priceAt || 0);
  }
}

function composeTodayShareText() {
  const briefing = lastRenderedBriefing || getCachedBriefing();
  const cycle = briefing?.cycle ? `Cycle ${briefing.cycle}` : 'Today';
  const sentences = (briefing?.sentences || []).slice(0, 5);
  const changes = (briefing?.changes || []).slice(0, 3).map((change) => change.label);
  const rows = [
    `Today on Tezos — ${cycle}`,
    '',
    ...sentences.map((sentence) => `- ${sentence}`),
  ];
  if (changes.length) {
    rows.push('', 'Changed since last visit:', ...changes.map((change) => `- ${change}`));
  }
  rows.push('', 'tezos.systems');
  return rows.join('\n');
}

async function shareTodayBrief() {
  const button = document.getElementById('today-share-btn');
  const original = button?.textContent || 'Share today';
  const text = composeTodayShareText();
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Today on Tezos', text, url: window.location.origin });
    } else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    }
    if (button) {
      button.textContent = navigator.share ? 'Shared' : 'Copied brief';
      button.classList.add('copied');
      setTimeout(() => {
        button.textContent = original;
        button.classList.remove('copied');
      }, 1400);
    }
  } catch (error) {
    if (error?.name !== 'AbortError') console.warn('Today share failed:', error);
  }
}

function wireTodayShareButton() {
  if (todayShareWired) return;
  const button = document.getElementById('today-share-btn');
  if (!button) return;
  todayShareWired = true;
  button.addEventListener('click', shareTodayBrief);
}

export async function initDailyBriefing(stats, xtzPrice) {
  wireTodayShareButton();
  if (!stats?.cycle) {
    rerenderTodayFromCache();
    return;
  }
  const briefing = await generate(stats, xtzPrice);
  renderToDrawer(briefing.cycle, briefing.sentences);
  renderToToday(briefing, stats, xtzPrice);
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
      cached.personal = buildPersonalBrief(null);
      renderToToday(cached, stats, xtzPrice);
      return;
    }
  } catch { /* ignore */ }
  return initDailyBriefing(stats, xtzPrice);
}

window.addEventListener('my-tezos-data-ready', rerenderTodayFromCache);
