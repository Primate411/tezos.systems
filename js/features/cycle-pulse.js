/**
 * Cycle Pulse — Sticky micro-strip (Option B)
 * 24px tall, persistent context while scrolling.
 * Shows: Cycle #### · XX.X% · Xh Xm left
 */

import { API_URLS } from '../core/config.js?v=20260228a';

const STREAK_KEY = 'tezos-systems-cycle-streak';
const STRIP_ID  = 'cycle-pulse-strip';

let strip = null;
let lastCycle = null;

function injectStyles() {
  if (document.getElementById('cycle-pulse-styles')) return;
  const s = document.createElement('style');
  s.id = 'cycle-pulse-styles';
  s.textContent = `
    #${STRIP_ID} {
      position: sticky;
      top: 32px; /* below price bar */
      z-index: 99;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      height: 26px;
      font-family: 'Orbitron', monospace;
      font-size: 11px;
      letter-spacing: .06em;
      color: var(--text-secondary);
      background: color-mix(in srgb, var(--bg-card) 92%, transparent);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-bottom: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
      padding: 0 12px;
      white-space: nowrap;
      overflow: hidden;
    }
    #${STRIP_ID} .cps-cycle {
      color: var(--accent);
      font-weight: 700;
    }
    #${STRIP_ID} .cps-sep {
      opacity: .35;
      margin: 0 2px;
    }
    #${STRIP_ID} .cps-pct {
      color: var(--text-primary);
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
    #${STRIP_ID} .cps-time {
      font-variant-numeric: tabular-nums;
    }
    #${STRIP_ID} .cps-bar {
      width: 120px;
      height: 6px;
      border-radius: 3px;
      background: rgba(255,255,255,0.15);
      overflow: hidden;
      flex-shrink: 0;
    }
    #${STRIP_ID} .cps-bar-fill {
      display: block;
      height: 100%;
      border-radius: 2px;
      background: #00d4ff;
      box-shadow: 0 0 4px #00d4ff;
      transition: width .8s ease;
      width: 0%;
    }
    @media (max-width: 600px) {
      #${STRIP_ID} { font-size: 10px; gap: 4px; }
      #${STRIP_ID} .cps-bar { width: 80px; }
    }
  `;
  document.head.appendChild(s);
}

function fmtTime(val) {
  if (!val) return '—';
  if (typeof val === 'string') return val.replace(/\s*left\s*$/i, '').trim() || '—';
  if (val <= 0) return '—';
  const h = Math.floor(val / 3600);
  const m = Math.floor((val % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
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

function createStrip() {
  injectStyles();
  const el = document.createElement('div');
  el.id = STRIP_ID;
  el.setAttribute('role', 'status');
  el.setAttribute('aria-label', 'Cycle progress');
  el.innerHTML = `
    <span class="cps-cycle"></span>
    <span class="cps-sep">·</span>
    <span class="cps-bar"><span class="cps-bar-fill"></span></span>
    <span class="cps-pct"></span>
    <span class="cps-sep">·</span>
    <span class="cps-time"></span>
  `;
  return el;
}

export async function initCyclePulse(stats) {
  if (document.getElementById(STRIP_ID)) return;
  strip = createStrip();
  // Insert after price bar (first child of body or after .price-bar)
  const priceBar = document.querySelector('.price-bar');
  if (priceBar) priceBar.after(strip);
  else document.body.prepend(strip);
  updateCyclePulse(stats);
}

export function updateCyclePulse(stats) {
  if (!strip) return;
  const cycle = Number(stats?.cycle ?? stats?.currentStats?.cycle ?? 0);
  const progress = Number(stats?.cycleProgress ?? stats?.currentStats?.cycleProgress ?? 0);
  const timeRemaining = stats?.cycleTimeRemaining ?? stats?.currentStats?.cycleTimeRemaining ?? 0;

  if (lastCycle !== null && cycle > lastCycle) {
    updateStreak(cycle);
  }
  lastCycle = cycle;

  strip.querySelector('.cps-cycle').textContent = `Cycle ${cycle || '—'}`;
  strip.querySelector('.cps-bar-fill').style.width = `${Math.min(100, Math.max(0, progress))}%`;
  strip.querySelector('.cps-pct').textContent = `${progress.toFixed(1)}%`;
  strip.querySelector('.cps-time').textContent = `${fmtTime(timeRemaining)} left`;
}
