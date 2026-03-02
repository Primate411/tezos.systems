/**
 * Price Intelligence — SEO-optimized price section with prediction game
 * Compact, elegant, not crowding the page.
 */

import { API_URLS } from '../core/config.js?v=20260228a';

const LS_PREDICTIONS = 'tezos-systems-predictions';
const LS_PRED_STATS  = 'tezos-systems-pred-stats';
const LS_ALERTS      = 'tezos-systems-price-alerts';
const SECTION_ID     = 'price-intelligence';

// ─── State ────────────────────────────────────────────────────────────────────
let currentPrice = 0;
let priceChange24h = 0;
let currentCycle = 0;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n, d = 2) {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function loadPredictions() {
  try { return JSON.parse(localStorage.getItem(LS_PREDICTIONS)) || []; }
  catch { return []; }
}

function savePredictions(preds) {
  localStorage.setItem(LS_PREDICTIONS, JSON.stringify(preds.slice(-100))); // keep last 100
}

function loadStats() {
  try { return JSON.parse(localStorage.getItem(LS_PRED_STATS)) || { streak: 0, best: 0, total: 0, correct: 0 }; }
  catch { return { streak: 0, best: 0, total: 0, correct: 0 }; }
}

function saveStats(s) { localStorage.setItem(LS_PRED_STATS, JSON.stringify(s)); }

function loadAlerts() {
  try { return JSON.parse(localStorage.getItem(LS_ALERTS)) || []; }
  catch { return []; }
}

function saveAlerts(a) { localStorage.setItem(LS_ALERTS, JSON.stringify(a.slice(-5))); }

// ─── Narrative Templates ──────────────────────────────────────────────────────
function generateNarrative(price, change, stats) {
  const dir = change >= 0 ? 'up' : 'down';
  const abs = Math.abs(change).toFixed(1);
  const attestRate = stats?.attestRate || 99;
  const stakingRatio = stats?.stakingRatio || 27.8;
  const bakers = stats?.totalBakers || 248;

  const templates = [
    `XTZ is ${dir} ${abs}% to $${fmt(price, 3)} with ${bakers} bakers maintaining ${fmt(attestRate, 1)}% attestation.`,
    `Trading at $${fmt(price, 3)} (${change >= 0 ? '+' : ''}${abs}%). ${fmt(stakingRatio, 1)}% of supply staked across ${bakers} bakers.`,
    `$${fmt(price, 3)} XTZ — ${dir} ${abs}% this session. Network health: ${fmt(attestRate, 1)}% attestation, ${bakers} active bakers.`,
    `XTZ moves ${dir} ${abs}% to $${fmt(price, 3)}. Staking ratio holds at ${fmt(stakingRatio, 1)}% — the network keeps building.`,
  ];
  return templates[Math.floor(Math.random() * templates.length)];
}

// ─── Prediction Logic ─────────────────────────────────────────────────────────
function getCurrentPrediction(cycle) {
  const preds = loadPredictions();
  return preds.find(p => p.cycle === cycle);
}

function makePrediction(cycle, direction, price) {
  const preds = loadPredictions();
  // Don't allow re-prediction for same cycle
  if (preds.find(p => p.cycle === cycle)) return false;
  preds.push({ cycle, direction, priceAt: price, ts: Date.now(), resolved: false });
  savePredictions(preds);
  return true;
}

function resolvePredictions(cycle, currentPriceNow) {
  const preds = loadPredictions();
  const stats = loadStats();
  let changed = false;

  for (const p of preds) {
    if (p.resolved) continue;
    if (p.cycle >= cycle) continue; // only resolve past cycles
    p.resolved = true;
    const wentUp = currentPriceNow > p.priceAt;
    const flat = Math.abs(currentPriceNow - p.priceAt) < 0.001;
    p.correct = flat || (p.direction === 'higher' && wentUp) || (p.direction === 'lower' && !wentUp);
    stats.total++;
    if (p.correct) {
      stats.correct++;
      stats.streak++;
      if (stats.streak > stats.best) stats.best = stats.streak;
    } else {
      stats.streak = 0;
    }
    changed = true;
  }

  if (changed) {
    savePredictions(preds);
    saveStats(stats);
    // Show resolved prediction result with share option
    const lastResolved = preds.filter(p => p.resolved).sort((a,b) => b.ts - a.ts)[0];
    if (lastResolved) {
      setTimeout(() => showPredictionResult(lastResolved, stats, currentPriceNow), 2000);
    }
  }
  return stats;
}

function showPredictionResult(pred, stats, nowPrice) {
  // Don't show if already shown this session
  if (window._predResultShown) return;
  window._predResultShown = true;

  const accuracy = stats.total > 0 ? Math.round(stats.correct / stats.total * 100) : 0;
  const toast = document.createElement('div');
  toast.className = 'pi-result-toast';
  toast.innerHTML = 
    '<div class="pi-result-inner">' +
      '<div class="pi-result-icon">' + (pred.correct ? '✅' : '❌') + '</div>' +
      '<div class="pi-result-text">' +
        '<strong>C' + pred.cycle + ' prediction: ' + (pred.correct ? 'Correct!' : 'Wrong') + '</strong>' +
        '<div>You said ' + pred.direction + ' at $' + fmt(pred.priceAt, 3) + ' → now $' + fmt(nowPrice, 3) + '</div>' +
        '<div>Accuracy: ' + accuracy + '% (' + stats.correct + '/' + stats.total + ')' +
          (stats.streak > 1 ? ' · 🔥' + stats.streak + ' streak' : '') + '</div>' +
      '</div>' +
      '<button class="pi-result-share">Share</button>' +
      '<button class="pi-result-close">×</button>' +
    '</div>';

  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('visible'));

  toast.querySelector('.pi-result-close').addEventListener('click', () => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  });

  toast.querySelector('.pi-result-share').addEventListener('click', () => {
    const text = (pred.correct ? '✅' : '❌') + ' My C' + pred.cycle + ' XTZ prediction was ' + (pred.correct ? 'right' : 'wrong') + '!\n' +
      'Called ' + pred.direction + ' at $' + fmt(pred.priceAt, 3) + ' → $' + fmt(nowPrice, 3) + '\n' +
      'Overall: ' + accuracy + '% accuracy (' + stats.correct + '/' + stats.total + ')' +
      (stats.streak > 1 ? ' 🔥' + stats.streak + ' streak' : '') +
      '\n\nhttps://tezos.systems';
    const url = 'https://x.com/intent/tweet?text=' + encodeURIComponent(text);
    window.open(url, '_blank', 'width=550,height=420');
  });

  // Auto-dismiss after 15s
  setTimeout(() => {
    if (toast.parentNode) {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 300);
    }
  }, 15000);
}

// ─── Alert Check ──────────────────────────────────────────────────────────────
function checkAlerts(price) {
  const alerts = loadAlerts();
  const remaining = [];
  for (const a of alerts) {
    const hit = (a.direction === 'above' && price >= a.target) ||
                (a.direction === 'below' && price <= a.target);
    if (hit) {
      if (Notification.permission === 'granted') {
        new Notification(`XTZ Price Alert`, {
          body: `XTZ ${a.direction === 'above' ? 'reached' : 'dropped to'} $${fmt(price, 3)} (target: $${fmt(a.target, 3)})`,
          icon: '/favicon.ico'
        });
      }
    } else {
      remaining.push(a);
    }
  }
  saveAlerts(remaining);
}

// ─── Styles ───────────────────────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('pi-styles')) return;
  const s = document.createElement('style');
  s.id = 'pi-styles';
  s.textContent = `
    #${SECTION_ID} {
      max-width: 1200px;
      margin: 0 auto 1.5rem;
      padding: 0 2rem;
    }
    .pi-card {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 16px;
      padding: 20px 24px 16px;
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }
    .pi-header {
      display: flex;
      align-items: baseline;
      gap: 16px;
      flex-wrap: wrap;
      margin-bottom: 10px;
    }
    .pi-price {
      font-family: 'Orbitron', monospace;
      font-size: 28px;
      font-weight: 700;
      color: var(--text-primary);
      font-variant-numeric: tabular-nums;
    }
    .pi-change {
      font-family: 'Orbitron', monospace;
      font-size: 14px;
      font-weight: 600;
      padding: 3px 10px;
      border-radius: 999px;
    }
    .pi-change.up { color: #00ff88; background: rgba(0,255,136,0.1); }
    .pi-change.down { color: #ff5d6f; background: rgba(255,93,111,0.1); }
    .pi-stats-row {
      display: flex;
      gap: 20px;
      font-size: 12px;
      color: var(--text-secondary);
      margin-bottom: 12px;
      flex-wrap: wrap;
    }
    .pi-stats-row span { font-variant-numeric: tabular-nums; }
    .pi-stats-row .pi-label { opacity: 0.6; margin-right: 4px; }
    .pi-narrative {
      font-size: 13px;
      line-height: 1.6;
      color: var(--text-secondary);
      border-left: 2px solid rgba(0, 212, 255, 0.3);
      padding-left: 12px;
      margin-bottom: 14px;
    }
    .pi-predict {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .pi-predict-label {
      font-size: 11px;
      color: var(--text-secondary);
      font-family: 'Orbitron', monospace;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .pi-btn {
      font-family: 'Orbitron', monospace;
      font-size: 11px;
      letter-spacing: 0.05em;
      padding: 6px 16px;
      border-radius: 6px;
      border: 1px solid var(--border);
      background: transparent;
      color: var(--text-secondary);
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .pi-btn:hover { border-color: var(--accent); color: var(--accent); }
    .pi-btn.active-higher { border-color: #00ff88; color: #00ff88; background: rgba(0,255,136,0.08); pointer-events: none; }
    .pi-btn.active-lower { border-color: #ff5d6f; color: #ff5d6f; background: rgba(255,93,111,0.08); pointer-events: none; }
    .pi-streak {
      font-size: 11px;
      color: var(--text-secondary);
      margin-left: auto;
      font-variant-numeric: tabular-nums;
    }
    .pi-streak .fire { color: #f0c040; }
    .pi-alert-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid rgba(255,255,255,0.04);
    }
    .pi-alert-input {
      font-family: 'Orbitron', monospace;
      font-size: 12px;
      width: 80px;
      padding: 4px 8px;
      border-radius: 6px;
      border: 1px solid var(--border);
      background: rgba(255,255,255,0.03);
      color: var(--text-primary);
      outline: none;
    }
    .pi-alert-input:focus { border-color: var(--accent); }
    .pi-alert-input::placeholder { color: var(--text-secondary); opacity: 0.4; }
    .pi-alert-count {
      font-size: 10px;
      color: var(--text-secondary);
      opacity: 0.5;
    }
    @media (max-width: 600px) {
      .pi-price { font-size: 22px; }
      .pi-stats-row { gap: 12px; font-size: 11px; }
      .pi-predict { gap: 6px; }
      .pi-alert-row { flex-wrap: wrap; }
    }
  `;
  document.head.appendChild(s);
}

// ─── Build DOM ────────────────────────────────────────────────────────────────
function buildSection(price, change24h, marketCap, volume, stats, cycle) {
  injectStyles();

  const section = document.createElement('section');
  section.id = SECTION_ID;

  const changeClass = change24h >= 0 ? 'up' : 'down';
  const changeSign = change24h >= 0 ? '+' : '';
  const narrative = generateNarrative(price, change24h, stats);
  const existingPred = getCurrentPrediction(cycle);
  const predStats = loadStats();
  const streakEmoji = predStats.streak >= 7 ? '🔥🔥' : predStats.streak >= 3 ? '🔥' : '';
  const alerts = loadAlerts();

  section.innerHTML = `
    <div class="pi-card">
      <div class="pi-header">
        <span class="pi-price">$${fmt(price, 3)}</span>
        <span class="pi-change ${changeClass}">${changeSign}${fmt(change24h, 1)}%</span>
      </div>
      <div class="pi-stats-row">
        <span><span class="pi-label">MCap</span>$${marketCap >= 1e9 ? fmt(marketCap/1e9, 2) + 'B' : fmt(marketCap/1e6, 0) + 'M'}</span>
        <span><span class="pi-label">24h Vol</span>$${fmt(volume/1e6, 1)}M</span>
        <span><span class="pi-label">Staking</span>${fmt(stats?.stakingRatio || 0, 1)}%</span>
        <span><span class="pi-label">APY</span>~${fmt(stats?.apy || 8.5, 1)}%</span>
      </div>
      <div class="pi-narrative">${narrative}</div>
      <div class="pi-predict">
        <span class="pi-predict-label">C${cycle} prediction:</span>
        <button class="pi-btn${existingPred?.direction === 'higher' ? ' active-higher' : ''}" id="pi-btn-higher">📈 Higher</button>
        <button class="pi-btn${existingPred?.direction === 'lower' ? ' active-lower' : ''}" id="pi-btn-lower">📉 Lower</button>
        <span class="pi-streak">
          ${predStats.total > 0 ? `${predStats.correct}/${predStats.total} (${Math.round(predStats.correct/predStats.total*100)}%)` : ''}
          ${streakEmoji ? `<span class="fire">${streakEmoji} ${predStats.streak}</span>` : ''}
        </span>
      </div>
      <div class="pi-alert-row">
        <span class="pi-predict-label" style="font-size:10px">Alert at $</span>
        <input class="pi-alert-input" type="number" step="0.01" placeholder="0.00" id="pi-alert-price">
        <button class="pi-btn" id="pi-alert-set" style="padding:4px 10px;font-size:10px">Set</button>
        <span class="pi-alert-count">${alerts.length}/5 active</span>
      </div>
    </div>
  `;

  // Event listeners
  const btnHigher = section.querySelector('#pi-btn-higher');
  const btnLower = section.querySelector('#pi-btn-lower');
  const btnAlert = section.querySelector('#pi-alert-set');
  const alertInput = section.querySelector('#pi-alert-price');

  if (!existingPred) {
    btnHigher.addEventListener('click', () => {
      if (makePrediction(cycle, 'higher', price)) {
        btnHigher.classList.add('active-higher');
        btnLower.style.opacity = '0.3';
        btnLower.style.pointerEvents = 'none';
      }
    });
    btnLower.addEventListener('click', () => {
      if (makePrediction(cycle, 'lower', price)) {
        btnLower.classList.add('active-lower');
        btnHigher.style.opacity = '0.3';
        btnHigher.style.pointerEvents = 'none';
      }
    });
  } else {
    // Already predicted — dim the other button
    if (existingPred.direction === 'higher') { btnLower.style.opacity = '0.3'; btnLower.style.pointerEvents = 'none'; }
    else { btnHigher.style.opacity = '0.3'; btnHigher.style.pointerEvents = 'none'; }
  }

  btnAlert.addEventListener('click', () => {
    const target = parseFloat(alertInput.value);
    if (!target || target <= 0) return;
    const alerts = loadAlerts();
    if (alerts.length >= 5) return;
    const direction = target > price ? 'above' : 'below';
    alerts.push({ target, direction, created: Date.now() });
    saveAlerts(alerts);
    alertInput.value = '';
    section.querySelector('.pi-alert-count').textContent = `${alerts.length}/5 active`;
    if (Notification.permission === 'default') Notification.requestPermission();
  });

  return section;
}

// ─── Public API ───────────────────────────────────────────────────────────────
export async function initPriceIntelligence(stats, xtzPrice) {
  if (document.getElementById(SECTION_ID)) return;

  // Get price data from CoinGecko if not provided
  let price = xtzPrice;
  let change24h = 0;
  let marketCap = 0;
  let volume = 0;

  try {
    const cg = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=tezos&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true');
    const data = await cg.json();
    if (data.tezos) {
      price = data.tezos.usd || price;
      change24h = data.tezos.usd_24h_change || 0;
      marketCap = data.tezos.usd_market_cap || 0;
      volume = data.tezos.usd_24h_vol || 0;
    }
  } catch (_) {}

  if (!price) {
    const el = document.querySelector('.price-value');
    price = parseFloat(el?.textContent?.replace(/[^0-9.]/g, '')) || 0;
  }

  // Get cycle
  let cycle = stats?.cycle || 0;
  if (!cycle) {
    try {
      // Use Octez RPC instead of TzKT
      const meta = await fetch(`${API_URLS.octez}/chains/main/blocks/head/metadata`).then(r => r.json());
      cycle = meta?.level_info?.cycle || 0;
    } catch (_) {}
  }

  currentPrice = price;
  priceChange24h = change24h;
  currentCycle = cycle;

  // Resolve any past predictions
  if (cycle && price) resolvePredictions(cycle, price);

  // Check price alerts
  if (price) checkAlerts(price);

  const section = buildSection(price, change24h, marketCap, volume, stats, cycle);

  // Insert after hero/upgrade-clock, before leaderboard
  const hero = document.getElementById('upgrade-clock');
  if (hero) hero.after(section);
  else {
    const main = document.querySelector('main');
    if (main) main.prepend(section);
  }
}

export function updatePriceIntelligence(stats, xtzPrice) {
  if (!document.getElementById(SECTION_ID)) return;
  // Update price display if available
  const price = xtzPrice || currentPrice;
  if (price > 0) {
    const priceEl = document.querySelector('.pi-price');
    if (priceEl) priceEl.textContent = `$${fmt(price, 3)}`;
    currentPrice = price;
    checkAlerts(price);
  }
}
