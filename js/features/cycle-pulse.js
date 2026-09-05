/**
 * Cycle Pulse — Integrated into protocol panel
 * Shows: C#### · ──bar── · XX.X% · 🟢 Xs ago
 */

import { enqueueToast } from '../ui/toast-queue.js';
import { pulseFresh } from '../effects/data-magic.js';

const STREAK_KEY = 'tezos-systems-cycle-streak';

let lastCycle = null;
let cycleWhispered = false;

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

export async function initCyclePulse(stats) {
  // Cycle info now lives in price bar chip — no strip rendered
  updateCyclePulse(stats);
}

export function updateCyclePulse(stats) {
  const rawCycle = Number(stats?.cycle ?? stats?.currentStats?.cycle ?? 0);
  const rawProgress = Number(stats?.cycleProgress ?? stats?.currentStats?.cycleProgress ?? 0);
  const cycle = Number.isFinite(rawCycle) ? rawCycle : 0;
  const progress = Number.isFinite(rawProgress) ? rawProgress : 0;
  const validCycle = cycle > 0;
  const previousCycle = lastCycle;
  const cycleAdvanced = validCycle && previousCycle > 0 && cycle > previousCycle;
  const cycleJustStarted = progress >= 0 && progress <= 5;

  if (cycleAdvanced) {
    updateStreak(cycle);
  }
  if (validCycle) lastCycle = cycle;

  // Update price bar cycle chip
  const chipBlock = document.getElementById('cycle-chip-block');
  const chipLabel = document.getElementById('cycle-chip-label');
  const chipPct = document.getElementById('cycle-chip-pct');
  const progressBar = document.getElementById('price-bar-progress');
  const cycleChip = document.getElementById('cycle-chip');
  cycleChip?.classList.toggle('is-loading', !validCycle);
  if (chipLabel) chipLabel.textContent = validCycle ? `C${cycle}` : 'sync';
  if (chipPct) chipPct.textContent = validCycle ? `${progress.toFixed(1)}%` : 'live';
  const blockLevel = Number(stats?.blockLevel ?? stats?.currentStats?.blockLevel ?? 0);
  if (chipBlock && blockLevel) chipBlock.textContent = blockLevel.toLocaleString();
  if (progressBar) progressBar.style.width = `${validCycle ? Math.min(100, Math.max(0, progress)) : 0}%`;

  if (cycleAdvanced && cycleJustStarted && !cycleWhispered) {
    cycleWhispered = true;
    const pulseTarget = document.getElementById('cycle-chip') || chipLabel;
    if (pulseTarget) pulseFresh(pulseTarget);
    enqueueToast({
      priority: 4,
      duration: 4000,
      show: (done, duration) => showCycleWhisper(cycle, done, duration)
    });
  }
}

function showCycleWhisper(cycle, done, duration = 4000) {
  let container = document.getElementById('moments-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'moments-toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = 'moment-toast cycle-whisper-toast';
  toast.innerHTML = `
    <div class="moment-toast-header"><span class="moment-toast-label">🔄 Cycle</span></div>
    <div class="moment-toast-title">Cycle ${cycle} begins. Rewards are being dealt.</div>
    <div class="moment-toast-progress"><div class="moment-toast-progress-bar"></div></div>
  `;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('visible'));
  const bar = toast.querySelector('.moment-toast-progress-bar');
  requestAnimationFrame(() => {
    if (!bar) return;
    bar.style.transition = `width ${duration}ms linear`;
    bar.style.width = '0%';
  });
  setTimeout(() => {
    toast.classList.remove('visible');
    toast.classList.add('exiting');
    setTimeout(() => {
      toast.remove();
      done?.();
    }, 400);
  }, duration);
}
