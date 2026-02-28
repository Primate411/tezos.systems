/**
 * Cycle Pulse Banner
 * Redesigned 2-row rhythm strip with clear hierarchy.
 */

import { API_URLS } from '../core/config.js?v=20260228a';

const STREAK_KEY = 'tezos-systems-cycle-streak';
const BANNER_ID = 'cycle-pulse-banner';

let banner = null;
let progressBar = null;
let labelCycle = null;
let labelPercent = null;
let labelTime = null;
let labelCompare = null;
let labelStreak = null;
let lastCycle = null;
let compareData = null;
let pulseTimeout = null;

function injectStyles() {
  if (document.getElementById('cycle-pulse-styles')) return;
  const style = document.createElement('style');
  style.id = 'cycle-pulse-styles';
  style.textContent = `
    #${BANNER_ID} {
      background: color-mix(in srgb, var(--bg-card) 88%, transparent);
      border-bottom: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      padding: 10px 14px 8px;
      margin: 0 0 10px 0;
      width: 100%;
      box-sizing: border-box;
      border-radius: 12px;
      position: relative;
      z-index: 10;
    }
    .cp-primary {
      display: grid;
      grid-template-columns: auto 1fr auto auto;
      align-items: center;
      gap: 10px;
      margin-bottom: 6px;
    }
    .cp-cycle {
      font-family: 'Orbitron', monospace;
      font-size: 12px;
      letter-spacing: .1em;
      text-transform: uppercase;
      color: var(--accent);
      font-weight: 700;
      min-width: 110px;
    }
    .cp-track {
      height: 10px;
      border-radius: 5px;
      overflow: hidden;
      background: rgba(255,255,255,0.12);
      box-shadow: inset 0 1px 3px rgba(0,0,0,0.4);
      position: relative;
    }
    .cp-fill {
      height: 100%;
      width: 0%;
      border-radius: 4px;
      background: linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 80%, white));
      box-shadow: 0 0 6px var(--accent);
      transition: width .8s ease;
      position: relative;
    }

    .cp-percent {
      font-family: 'Orbitron', monospace;
      font-size: 15px;
      color: var(--text-primary);
      font-weight: 700;
      min-width: 44px;
      text-align: right;
    }
    .cp-time {
      font-size: 12px;
      color: var(--text-secondary);
      min-width: 88px;
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    .cp-secondary {
      display: flex;
      align-items: center;
      gap: 8px;
      padding-left: 0;
    }
    .cp-pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      color: var(--text-secondary);
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 2px 9px;
      background: color-mix(in srgb, var(--accent) 8%, transparent);
    }
    .cp-pill .v-pos { color: var(--accent); font-weight: 700; }
    .cp-pill .v-neg { color: #ff5d6f; font-weight: 700; }
    .cp-share {
      margin-left: auto;
      border: 1px solid var(--border);
      background: transparent;
      color: var(--text-secondary);
      border-radius: 5px;
      font-size: 12px;
      line-height: 1;
      padding: 4px 6px;
      cursor: pointer;
      opacity: .8;
    }
    .cp-share:hover { opacity: 1; color: var(--accent); border-color: var(--accent); }
    @media (max-width: 700px) {
      #cycle-pulse-banner { width: 100%; }
      .cp-primary { grid-template-columns: 1fr auto; grid-template-rows: auto auto; }
      .cp-track { grid-column: 1 / -1; }
      .cp-secondary { padding-left: 0; flex-wrap: wrap; }
      .cp-time { min-width: 0; }
      .cp-cycle { min-width: 0; }
    }
  `;
  document.head.appendChild(style);
}

function loadStreak() {
  try { return JSON.parse(localStorage.getItem(STREAK_KEY)) || { cycle: null, count: 0 }; }
  catch { return { cycle: null, count: 0 }; }
}

function updateStreak(currentCycle) {
  if (!currentCycle) return 1;
  const s = loadStreak();
  if (s.cycle === currentCycle) return s.count;
  const consecutive = s.cycle === currentCycle - 1;
  const updated = { cycle: currentCycle, count: consecutive ? s.count + 1 : 1 };
  localStorage.setItem(STREAK_KEY, JSON.stringify(updated));
  return updated.count;
}

async function fetchCompare() {
  try {
    const res = await fetch(`${API_URLS.tzkt}/statistics/daily?sort.desc=id&limit=2`);
    const data = await res.json();
    if (!Array.isArray(data) || data.length < 2) return null;
    const [today, yesterday] = data;
    const txToday = today.transactions ?? 0;
    const txYest = yesterday.transactions ?? 0;
    const pct = txYest > 0 ? Math.round(((txToday - txYest) / txYest) * 100) : 0;
    return { pct };
  } catch {
    return null;
  }
}

function fmtTime(val) {
  if (!val) return '—';
  if (typeof val === 'string') return val.replace(/\s*left\s*$/i, '').trim() || '—';
  if (val <= 0) return '—';
  const h = Math.floor(val / 3600);
  const m = Math.floor((val % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function triggerPulse() {
  if (!banner) return;
  banner.style.transition = 'box-shadow .25s ease';
  banner.style.boxShadow = '0 0 18px color-mix(in srgb, var(--accent) 45%, transparent)';
  clearTimeout(pulseTimeout);
  pulseTimeout = setTimeout(() => { if (banner) banner.style.boxShadow = 'none'; }, 1200);
}

function renderComparePill(data) {
  if (!data) return 'tx <span class="v-pos">—</span> vs last';
  const cls = data.pct >= 0 ? 'v-pos' : 'v-neg';
  const sign = data.pct >= 0 ? '+' : '';
  return `tx <span class="${cls}">${sign}${data.pct}%</span> vs last`;
}

async function captureBanner() {
  if (!banner) return;
  try {
    const { default: html2canvas } = await import('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.esm.js');
    const canvas = await html2canvas(banner, { backgroundColor: null, scale: 2 });
    const link = document.createElement('a');
    link.download = `cycle-pulse-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch {
    navigator.clipboard?.writeText(banner.innerText.replace(/\s+/g, ' ').trim());
  }
}

function createBanner() {
  injectStyles();
  const el = document.createElement('div');
  el.id = BANNER_ID;
  el.innerHTML = `
    <div class="cp-primary">
      <div class="cp-cycle"></div>
      <div class="cp-track"><div class="cp-fill"></div></div>
      <div class="cp-percent"></div>
      <div class="cp-time"></div>
    </div>
    <div class="cp-secondary">
      <div class="cp-pill cp-compare"></div>
      <div class="cp-pill cp-streak"></div>
      <button class="cp-share" title="Share Cycle Pulse">📸</button>
    </div>
  `;

  labelCycle = el.querySelector('.cp-cycle');
  progressBar = el.querySelector('.cp-fill');
  labelPercent = el.querySelector('.cp-percent');
  labelTime = el.querySelector('.cp-time');
  labelCompare = el.querySelector('.cp-compare');
  labelStreak = el.querySelector('.cp-streak');
  el.querySelector('.cp-share')?.addEventListener('click', captureBanner);
  return el;
}

export async function initCyclePulse(stats) {
  if (document.getElementById(BANNER_ID)) return;
  banner = createBanner();
  const heroContent = document.querySelector('#upgrade-clock .upgrade-clock-content');
  if (heroContent) heroContent.prepend(banner);
  else {
    const target = document.getElementById('upgrade-clock');
    if (target) target.before(banner);
    else document.body.prepend(banner);
  }
  compareData = await fetchCompare();
  updateCyclePulse(stats);
}

export function updateCyclePulse(stats) {
  if (!banner) return;
  const cycle = Number(stats?.cycle ?? stats?.currentStats?.cycle ?? 0);
  const progress = Number(stats?.cycleProgress ?? stats?.currentStats?.cycleProgress ?? 0);
  const timeRemaining = stats?.cycleTimeRemaining ?? stats?.currentStats?.cycleTimeRemaining ?? 0;

  if (lastCycle !== null && cycle > lastCycle) {
    triggerPulse();
    fetchCompare().then((d) => { compareData = d; labelCompare.innerHTML = renderComparePill(compareData); });
  }
  lastCycle = cycle;

  const streakCount = updateStreak(cycle);
  const streakEmoji = streakCount >= 7 ? '🔥' : streakCount >= 3 ? '⚡' : '●';

  labelCycle.textContent = `Cycle ${cycle || '—'}`;
  progressBar.style.width = `${Math.min(100, Math.max(0, progress))}%`;
  labelPercent.textContent = `${progress.toFixed(1)}%`;
  labelTime.textContent = `${fmtTime(timeRemaining)} left`;
  labelCompare.innerHTML = renderComparePill(compareData);
  labelStreak.innerHTML = `streak <span class="v-pos">${streakEmoji} ${streakCount}d</span>`;
}
