/**
 * Cycle Pulse — Integrated into protocol panel
 * Shows: C#### · ──bar── · XX.X% · 🟢 Xs ago
 */

import { API_URLS } from '../core/config.js?v=20260228a';

const STREAK_KEY = 'tezos-systems-cycle-streak';
const STRIP_ID   = 'cycle-pulse-strip';

let strip = null;
let lastCycle = null;

function injectStyles() {
  if (document.getElementById('cycle-pulse-styles')) return;
  const s = document.createElement('style');
  s.id = 'cycle-pulse-styles';
  s.textContent = `
    #${STRIP_ID} {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      height: 24px;
      font-family: 'Orbitron', 'SF Mono', 'Menlo', monospace;
      font-size: 11px;
      letter-spacing: .06em;
      color: var(--text-secondary);
      border-top: 1px solid rgba(255,255,255,0.06);
      margin-top: 8px;
      padding-top: 8px;
      white-space: nowrap;
      overflow: hidden;
      flex-wrap: nowrap;
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
      min-width: 50px;
      text-align: right;
      letter-spacing: 0;
      color: var(--text-primary);
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
    #${STRIP_ID} .cps-bar {
      width: 160px;
      height: 6px;
      border-radius: 3px;
      background: rgba(255,255,255,0.15);
      overflow: hidden;
      flex-shrink: 0;
    }
    #${STRIP_ID} .cps-bar-fill {
      display: block;
      height: 100%;
      border-radius: 3px;
      background: #00d4ff;
      box-shadow: 0 0 4px #00d4ff;
      transition: width .8s ease;
      width: 0%;
    }
    #${STRIP_ID} .cps-age {
      font-variant-numeric: tabular-nums;
      opacity: .7;
      min-width: 52px;
      text-align: left;
      letter-spacing: 0;
    }
    #${STRIP_ID} .uptime-pulse-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #0f0;
      display: inline-block;
      box-shadow: 0 0 4px #0f0;
      animation: cps-pulse 2s ease-in-out infinite;
      margin: 0 2px;
    }
    #${STRIP_ID} .uptime-pulse-dot.warn { background: #ff0; box-shadow: 0 0 4px #ff0; }
    #${STRIP_ID} .uptime-pulse-dot.danger { background: #f00; box-shadow: 0 0 4px #f00; }
    #cycle-pulse-strip .cps-block {
      font-variant-numeric: tabular-nums;
      min-width: 90px;
      text-align: right;
      letter-spacing: 0;
    }
    @keyframes cps-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
    @media (max-width: 600px) {
      #${STRIP_ID} { font-size: 10px; gap: 3px; }
      #${STRIP_ID} .cps-bar { width: 60px; }
      #${STRIP_ID} .cps-block { display: none; }
      #${STRIP_ID} .cps-cycle { min-width: auto; }
      #${STRIP_ID} .cps-pct { min-width: 36px; }
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
    <span class="cps-block" id="uptime-block-number">—</span>
    <span class="uptime-pulse-dot" id="uptime-pulse-dot" title="Network healthy"></span>
    <span class="cps-age" id="uptime-block-age">—</span>
  `;
  return el;
}

export async function initCyclePulse(stats) {
  if (document.getElementById(STRIP_ID)) return;
  strip = createStrip();
  // Insert at bottom of protocol panel content
  const panelContent = document.querySelector('#upgrade-clock .upgrade-clock-content');
  if (panelContent) {
    panelContent.appendChild(strip);
  } else {
    // Fallback: after upgrade-clock
    const uc = document.getElementById('upgrade-clock');
    if (uc) uc.appendChild(strip);
  }
  updateCyclePulse(stats);
}

export function updateCyclePulse(stats) {
  if (!strip) return;
  const cycle = Number(stats?.cycle ?? stats?.currentStats?.cycle ?? 0);
  const progress = Number(stats?.cycleProgress ?? stats?.currentStats?.cycleProgress ?? 0);

  if (lastCycle !== null && cycle > lastCycle) {
    updateStreak(cycle);
  }
  lastCycle = cycle;

  strip.querySelector('.cps-cycle').textContent = `Cycle ${cycle || '—'}`;
  strip.querySelector('.cps-bar-fill').style.width = `${Math.min(100, Math.max(0, progress))}%`;
  strip.querySelector('.cps-pct').textContent = `${progress.toFixed(1)}%`;
}
