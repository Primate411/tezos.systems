/**
 * Cycle Pulse Banner
 * Slim persistent banner showing cycle progress, time remaining, and tx comparison.
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

// ── Streak tracking ───────────────────────────────────────────────────────────

function loadStreak() {
  try {
    return JSON.parse(localStorage.getItem(STREAK_KEY)) || { cycle: null, count: 0 };
  } catch { return { cycle: null, count: 0 }; }
}

function updateStreak(currentCycle) {
  const s = loadStreak();
  if (s.cycle === currentCycle) return s.count;
  const consecutive = s.cycle === currentCycle - 1;
  const updated = { cycle: currentCycle, count: consecutive ? s.count + 1 : 1 };
  localStorage.setItem(STREAK_KEY, JSON.stringify(updated));
  return updated.count;
}

// ── API ───────────────────────────────────────────────────────────────────────

async function fetchCompare() {
  try {
    const res = await fetch(`${API_URLS.tzkt}/statistics/daily?sort.desc=id&limit=2`);
    const data = await res.json();
    if (data.length < 2) return null;
    const [today, yesterday] = data;
    const txToday = today.transactions ?? 0;
    const txYest = yesterday.transactions ?? 0;
    const pct = txYest > 0 ? Math.round(((txToday - txYest) / txYest) * 100) : 0;
    return { pct, txToday };
  } catch { return null; }
}

// ── DOM creation ──────────────────────────────────────────────────────────────

function createBanner() {
  const el = document.createElement('div');
  el.id = BANNER_ID;
  el.style.cssText = `
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 16px;
    background: var(--bg-card);
    border-bottom: 1px solid var(--border);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    font-family: 'Orbitron', monospace;
    font-size: 11px;
    color: var(--text-secondary);
    position: relative;
    z-index: 10;
    flex-wrap: wrap;
    min-height: 30px;
    box-sizing: border-box;
  `;

  labelCycle = document.createElement('span');
  labelCycle.style.cssText = `color: var(--text-primary); font-weight: 700; white-space: nowrap;`;

  const track = document.createElement('div');
  track.style.cssText = `
    flex: 1; min-width: 80px; max-width: 180px;
    height: 6px; background: var(--border);
    border-radius: 3px; overflow: hidden; position: relative;
  `;
  progressBar = document.createElement('div');
  progressBar.style.cssText = `
    height: 100%; width: 0%;
    background: var(--accent);
    border-radius: 3px;
    transition: width 0.8s ease;
    box-shadow: 0 0 6px var(--accent);
  `;
  track.appendChild(progressBar);

  labelPercent = document.createElement('span');
  labelPercent.style.cssText = `white-space: nowrap;`;

  const sep = () => { const s = document.createElement('span'); s.textContent = '•'; s.style.opacity = '0.4'; return s; };

  labelTime = document.createElement('span');
  labelTime.style.cssText = `white-space: nowrap; color: var(--text-primary);`;

  labelCompare = document.createElement('span');
  labelCompare.style.cssText = `white-space: nowrap;`;

  labelStreak = document.createElement('span');
  labelStreak.style.cssText = `white-space: nowrap; opacity: 0.7;`;

  const shareBtn = document.createElement('button');
  shareBtn.textContent = '📸';
  shareBtn.title = 'Share Cycle Pulse';
  shareBtn.style.cssText = `
    background: none; border: none; cursor: pointer;
    font-size: 13px; padding: 0 2px; margin-left: auto;
    opacity: 0.7; transition: opacity 0.2s;
  `;
  shareBtn.addEventListener('mouseenter', () => shareBtn.style.opacity = '1');
  shareBtn.addEventListener('mouseleave', () => shareBtn.style.opacity = '0.7');
  shareBtn.addEventListener('click', captureBanner);

  el.append(labelCycle, track, labelPercent, sep(), labelTime, sep(), labelCompare, sep(), labelStreak, shareBtn);
  return el;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(val) {
  if (!val) return '—';
  // If already a formatted string (e.g. "12h 42m left"), strip "left" and return
  if (typeof val === 'string') return val.replace(/\s*left\s*$/i, '').trim() || '—';
  // Otherwise treat as seconds
  if (val <= 0) return '—';
  const h = Math.floor(val / 3600);
  const m = Math.floor((val % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtCompare(data) {
  if (!data) return 'tx —';
  const sign = data.pct >= 0 ? '+' : '';
  return `tx ${sign}${data.pct}% vs last`;
}

function triggerPulse() {
  if (!banner) return;
  banner.style.transition = 'box-shadow 0.3s';
  banner.style.boxShadow = '0 0 20px var(--accent)';
  clearTimeout(pulseTimeout);
  pulseTimeout = setTimeout(() => { banner.style.boxShadow = 'none'; }, 1500);
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
    const text = banner.innerText.replace(/\s+/g, ' ').trim();
    navigator.clipboard?.writeText(text);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function initCyclePulse(stats) {
  if (document.getElementById(BANNER_ID)) return;
  banner = createBanner();
  const target = document.getElementById('upgrade-clock');
  if (target) target.before(banner);
  else document.body.appendChild(banner);
  compareData = await fetchCompare();
  updateCyclePulse(stats);
}

export function updateCyclePulse(stats) {
  if (!banner) return;
  const cycle = stats?.cycle ?? stats?.currentStats?.cycle ?? 0;
  const progress = stats?.cycleProgress ?? stats?.currentStats?.cycleProgress ?? 0;
  const timeRemaining = stats?.cycleTimeRemaining ?? stats?.currentStats?.cycleTimeRemaining ?? 0;

  if (lastCycle !== null && cycle > lastCycle) {
    triggerPulse();
    fetchCompare().then(d => { compareData = d; labelCompare.textContent = fmtCompare(compareData); });
  }
  lastCycle = cycle;

  const streakCount = updateStreak(cycle);

  labelCycle.textContent = `Cycle ${cycle}`;
  progressBar.style.width = `${Math.min(100, Math.max(0, progress))}%`;
  labelPercent.textContent = `${progress.toFixed(1)}%`;
  labelTime.textContent = `${fmtTime(timeRemaining)} left`;
  labelCompare.textContent = fmtCompare(compareData);

  const streakEmoji = streakCount >= 7 ? '🔥' : streakCount >= 3 ? '⚡' : '●';
  labelStreak.textContent = `${streakEmoji} ${streakCount}d streak`;
}
