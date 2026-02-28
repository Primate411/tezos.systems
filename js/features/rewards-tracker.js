/**
 * rewards-tracker.js — Personal Rewards Tracker for tezos.systems
 * Cards: ⏱ Next Rewards | 📈 This Cycle | 🏆 Lifetime
 * + 30-cycle mini-calendar + 🔔 notifications
 *
 * DEPLOY TO: js/features/rewards-tracker.js
 */
import { API_URLS } from '../core/config.js?v=20260228a';


const CONTAINER_ID = 'rewards-tracker-container';
const LS_KEY_ADDR = 'tezos-systems-my-baker-address';
const LS_KEY_NOTIF = 'tezos-systems-rewards-notif';
let countdownInterval = null;
let lastKnownCycle = null;

// ─── Helpers ────────────────────────────────────────────────────────────────

function getAddress() {
  return localStorage.getItem(LS_KEY_ADDR)?.trim() || null;
}

function getCacheKey(address) {
  return `tezos-systems-rewards-cache-${address}`;
}

function parsePrice(xtzPrice) {
  if (typeof xtzPrice === 'number') return xtzPrice;
  const raw = xtzPrice || document.querySelector('.price-value')?.textContent || '0';
  return parseFloat(String(raw).replace(/[^0-9.]/g, '')) || 0;
}

function fmt(n, d = 2) {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtXtz(mutez) {
  return fmt(mutez / 1_000_000, 4);
}

function secondsToHms(s) {
  if (s <= 0) return '00:00:00';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return [h, m, sec].map(v => String(v).padStart(2, '0')).join(':');
}

// ─── API ────────────────────────────────────────────────────────────────────

async function fetchRewards(address) {
  const cacheKey = getCacheKey(address);
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try {
      const { ts, data } = JSON.parse(cached);
      if (Date.now() - ts < 5 * 60 * 1000) return data; // 5min cache
    } catch (_) {}
  }

  // Try baker endpoint first (Tallinn-era fields), fall back to delegator
  let data;
  const bakerUrl = `${API_URLS.tzkt}/rewards/bakers/${address}?sort.desc=id&limit=30`;
  const bakerRes = await fetch(bakerUrl);
  if (bakerRes.ok) {
    const raw = await bakerRes.json();
    // Normalize Tallinn baker fields to common shape
    data = raw.map(r => {
      const earned = (r.blockRewardsDelegated || 0) + (r.blockRewardsStakedOwn || 0) +
        (r.blockRewardsStakedEdge || 0) + (r.blockRewardsStakedShared || 0) +
        (r.attestationRewardsDelegated || 0) + (r.attestationRewardsStakedOwn || 0) +
        (r.attestationRewardsStakedEdge || 0) + (r.attestationRewardsStakedShared || 0);
      const missed = (r.missedBlockRewards || 0) + (r.missedAttestationRewards || 0);
      const future = (r.futureBlockRewards || 0) + (r.futureAttestationRewards || 0);
      return {
        cycle: r.cycle,
        blockRewards: earned || future,  // use future estimate if nothing earned yet
        endorsementRewards: 0,
        blockFees: r.blockFees || 0,
        missedBlockRewards: missed,
        missedEndorsementRewards: 0,
        stakingBalance: r.ownStakedBalance || 0,
        delegatedBalance: r.externalDelegatedBalance || 0,
        _isBaker: true,
        _futureRewards: future,
        _earnedRewards: earned,
        _blocks: r.blocks || 0,
        _expectedBlocks: r.expectedBlocks || 0,
        _attestations: r.attestations || 0,
        _expectedAttestations: r.expectedAttestations || 0,
      };
    });
  } else {
    // Delegator fallback
    const delUrl = `${API_URLS.tzkt}/rewards/delegators/${address}?sort.desc=id&limit=30` +
      `&select=cycle,stakingBalance,externalStakedBalance,delegatedBalance,blockRewards,` +
      `endorsementRewards,blockFees,missedBlockRewards,missedEndorsementRewards`;
    const delRes = await fetch(delUrl);
    if (!delRes.ok) throw new Error(`TzKT ${delRes.status}`);
    data = await delRes.json();
  }
  localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data }));
  return data;
}

// ─── Notifications ──────────────────────────────────────────────────────────

function isNotifEnabled() {
  return localStorage.getItem(LS_KEY_NOTIF) === '1' && Notification.permission === 'granted';
}

async function toggleNotifications(btn) {
  if (isNotifEnabled()) {
    localStorage.removeItem(LS_KEY_NOTIF);
    btn.textContent = '🔔';
    btn.title = 'Enable cycle notifications';
    btn.classList.remove('notif-on');
  } else {
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      localStorage.setItem(LS_KEY_NOTIF, '1');
      btn.textContent = '🔕';
      btn.title = 'Disable cycle notifications';
      btn.classList.add('notif-on');
    }
  }
}

function maybeSendCycleNotif(currentCycle) {
  if (!isNotifEnabled()) return;
  if (lastKnownCycle !== null && currentCycle !== lastKnownCycle) {
    new Notification('🏆 Tezos Cycle Complete!', {
      body: `Cycle ${lastKnownCycle} ended. Check your rewards on tezos.systems`,
      icon: '/favicon.ico',
    });
  }
  lastKnownCycle = currentCycle;
}

// ─── Reward Calc ────────────────────────────────────────────────────────────

function calcLifetime(rewards) {
  let totalMutez = 0;
  for (const r of rewards) {
    totalMutez += (r.blockRewards || 0) + (r.endorsementRewards || 0) + (r.blockFees || 0);
  }
  return totalMutez;
}

function calcThisCycle(rewards, stats) {
  if (!rewards.length) return { estimatedMutez: 0, efficiency: 100, fullCycleMutez: 0 };
  const recent = rewards[0];
  const earned = (recent.blockRewards || 0) + (recent.endorsementRewards || 0) + (recent.blockFees || 0);
  const missed = (recent.missedBlockRewards || 0) + (recent.missedEndorsementRewards || 0);
  const total = earned + missed;
  const efficiency = total > 0 ? Math.round((earned / total) * 100) : 100;
  const progress = stats?.cycleProgress || 0;
  const estimatedMutez = Math.round(earned * (progress / 100));
  return { estimatedMutez, efficiency, fullCycleMutez: earned };
}

function cycleColor(r) {
  const missed = (r.missedBlockRewards || 0) + (r.missedEndorsementRewards || 0);
  const earned = (r.blockRewards || 0) + (r.endorsementRewards || 0) + (r.blockFees || 0);
  const total = earned + missed;
  if (total === 0) return '#555';
  const ratio = missed / total;
  if (ratio === 0) return 'var(--accent, #00ff88)';
  if (ratio < 0.1) return '#f0c040';
  return '#ff4444';
}

// ─── Share / PNG Export ─────────────────────────────────────────────────────

async function shareLifetimeCard(card) {
  if (typeof html2canvas === 'undefined') {
    alert('html2canvas not loaded — cannot export image.');
    return;
  }
  const canvas = await html2canvas(card, { backgroundColor: null, scale: 2 });
  const link = document.createElement('a');
  link.download = 'tezos-lifetime-rewards.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
}

// ─── CSS ────────────────────────────────────────────────────────────────────

function buildCSS() {
  if (document.getElementById('rewards-tracker-style')) return;
  const style = document.createElement('style');
  style.id = 'rewards-tracker-style';
  style.textContent = `
    #rewards-tracker-container { margin-bottom: 1.2rem; }
    .rt-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1rem;
      margin-bottom: 1rem;
    }
    @media (max-width: 768px) { .rt-grid { grid-template-columns: 1fr; } }
    .rt-card {
      background: var(--bg-card, rgba(0,0,0,0.4));
      border: 1px solid var(--border, rgba(255,255,255,0.1));
      border-radius: 12px;
      padding: 1.2rem;
      backdrop-filter: blur(12px);
      position: relative;
      overflow: hidden;
    }
    .rt-card::before {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(135deg, rgba(255,255,255,0.04) 0%, transparent 60%);
      pointer-events: none;
    }
    .rt-card-title {
      font-size: 0.7rem;
      letter-spacing: 0.12em;
      color: var(--text-secondary, #888);
      text-transform: uppercase;
      margin-bottom: 0.5rem;
      font-family: 'Orbitron', monospace;
    }
    .rt-value {
      font-size: 1.6rem;
      font-weight: 700;
      color: var(--accent, #00ff88);
      font-family: 'Orbitron', monospace;
      line-height: 1.1;
    }
    .rt-sub {
      font-size: 0.78rem;
      color: var(--text-secondary, #888);
      margin-top: 0.3rem;
    }
    .rt-accent { color: var(--accent, #00ff88); }
    .rt-card-actions {
      position: absolute;
      top: 0.7rem;
      right: 0.7rem;
      display: flex;
      gap: 0.3rem;
    }
    .rt-icon-btn {
      background: rgba(255,255,255,0.07);
      border: 1px solid var(--border, rgba(255,255,255,0.1));
      border-radius: 6px;
      color: var(--text-secondary, #888);
      cursor: pointer;
      font-size: 0.85rem;
      padding: 0.2rem 0.4rem;
      transition: all 0.2s;
    }
    .rt-icon-btn:hover, .rt-icon-btn.notif-on {
      background: var(--accent, #00ff88);
      color: #000;
      border-color: var(--accent, #00ff88);
    }
    .rt-efficiency {
      display: inline-block;
      font-size: 0.75rem;
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
      margin-top: 0.4rem;
      font-family: 'Orbitron', monospace;
    }
    .rt-eff-high { background: rgba(0,255,136,0.15); color: var(--accent, #00ff88); }
    .rt-eff-mid  { background: rgba(240,192,64,0.15); color: #f0c040; }
    .rt-eff-low  { background: rgba(255,68,68,0.15); color: #ff4444; }
    .rt-calendar {
      background: var(--bg-card, rgba(0,0,0,0.4));
      border: 1px solid var(--border, rgba(255,255,255,0.1));
      border-radius: 12px;
      padding: 1rem 1.2rem;
      backdrop-filter: blur(12px);
    }
    .rt-cal-title {
      font-size: 0.7rem;
      letter-spacing: 0.12em;
      color: var(--text-secondary, #888);
      text-transform: uppercase;
      margin-bottom: 0.7rem;
      font-family: 'Orbitron', monospace;
    }
    .rt-cal-grid { display: flex; flex-wrap: wrap; gap: 4px; }
    .rt-cal-block {
      width: 22px;
      height: 22px;
      border-radius: 4px;
      cursor: default;
      transition: transform 0.15s;
      position: relative;
    }
    .rt-cal-block:hover { transform: scale(1.35); z-index: 2; }
    .rt-cal-block[data-tip]:hover::after {
      content: attr(data-tip);
      position: absolute;
      bottom: 130%;
      left: 50%;
      transform: translateX(-50%);
      background: #111;
      color: #eee;
      font-size: 0.65rem;
      white-space: nowrap;
      padding: 3px 7px;
      border-radius: 4px;
      pointer-events: none;
      z-index: 10;
    }
  `;
  document.head.appendChild(style);
}

// ─── DOM Build ───────────────────────────────────────────────────────────────

function buildContainer(rewards, stats, xtzPrice) {
  const price = parsePrice(xtzPrice);
  const lifetimeMutez = calcLifetime(rewards);
  const lifetimeXtz = lifetimeMutez / 1_000_000;
  const lifetimeUsd = lifetimeXtz * price;
  const { estimatedMutez, efficiency, fullCycleMutez } = calcThisCycle(rewards, stats);
  const estimatedXtz = estimatedMutez / 1_000_000;
  const estimatedUsd = estimatedXtz * price;
  const fullCycleXtz = (fullCycleMutez || 0) / 1_000_000;
  const fullCycleUsd = fullCycleXtz * price;
  const firstCycle = rewards.length ? rewards[rewards.length - 1].cycle : null;
  const notifEnabled = isNotifEnabled();
  const effClass = efficiency >= 95 ? 'rt-eff-high' : efficiency >= 80 ? 'rt-eff-mid' : 'rt-eff-low';
  const blocksRemaining = stats?.blocksRemaining ??
    Math.round(((100 - (stats?.cycleProgress || 0)) / 100) * 14400);
  const secsRemaining = blocksRemaining * 6;

  const wrap = document.createElement('div');
  wrap.id = CONTAINER_ID;

  wrap.innerHTML = `
    <div class="rt-grid">
      <div class="rt-card">
        <div class="rt-card-title">⏱ Next Rewards</div>
        <div class="rt-value" id="rt-countdown">${secondsToHms(secsRemaining)}</div>
        <div class="rt-sub">~${fmt(blocksRemaining, 0)} blocks remaining</div>
        <div class="rt-sub" style="margin-top:0.5rem">
          Cycle <span class="rt-accent">${stats?.cycle ?? '—'}</span>
          &nbsp;·&nbsp; ${fmt(stats?.cycleProgress ?? 0, 1)}% complete
        </div>
        <div class="rt-card-actions">
          <button class="rt-icon-btn ${notifEnabled ? 'notif-on' : ''}" id="rt-notif-btn"
            title="${notifEnabled ? 'Disable' : 'Enable'} cycle notifications">
            ${notifEnabled ? '🔕' : '🔔'}
          </button>
        </div>
      </div>

      <div class="rt-card">
        <div class="rt-card-title">📈 This Cycle</div>
        <div class="rt-value">${fmtXtz(estimatedMutez)} <span style="font-size:0.9rem">XTZ</span></div>
        <div class="rt-sub">≈ $${fmt(estimatedUsd)} USD so far</div>
        <div class="rt-sub" style="margin-top:0.3rem">
          Est. full cycle: <span class="rt-accent">${fmt(fullCycleXtz, 4)} XTZ</span>
          &nbsp;($${fmt(fullCycleUsd)})
        </div>
        <div class="rt-efficiency ${effClass}">${efficiency}% baker efficiency</div>
      </div>

      <div class="rt-card" id="rt-lifetime-card">
        <div class="rt-card-title">🏆 Lifetime Rewards</div>
        <div class="rt-value">${fmt(lifetimeXtz, 4)} <span style="font-size:0.9rem">XTZ</span></div>
        <div class="rt-sub">≈ $${fmt(lifetimeUsd)} USD total</div>
        <div class="rt-sub" style="margin-top:0.3rem">
          Since cycle <span class="rt-accent">${firstCycle ?? '—'}</span>
          ${firstCycle ? `&nbsp;·&nbsp; ${rewards.length} cycles tracked` : ''}
        </div>
        <div class="rt-card-actions">
          <button class="rt-icon-btn" id="rt-share-btn" title="Export as PNG">📸</button>
        </div>
      </div>
    </div>

    <div class="rt-calendar">
      <div class="rt-cal-title">
        📅 30-Cycle History &nbsp;
        <span style="color:var(--accent,#00ff88)">■</span> full &nbsp;
        <span style="color:#f0c040">■</span> partial &nbsp;
        <span style="color:#ff4444">■</span> missed
      </div>
      <div class="rt-cal-grid" id="rt-cal-grid"></div>
    </div>
  `;

  // Calendar blocks — oldest first
  const calGrid = wrap.querySelector('#rt-cal-grid');
  const calData = [...rewards].reverse();
  if (calData.length) {
    for (const r of calData) {
      const block = document.createElement('div');
      block.className = 'rt-cal-block';
      block.style.background = cycleColor(r);
      const earned = ((r.blockRewards || 0) + (r.endorsementRewards || 0) + (r.blockFees || 0)) / 1_000_000;
      block.setAttribute('data-tip', `Cycle ${r.cycle}: ${fmt(earned, 4)} XTZ`);
      calGrid.appendChild(block);
    }
  } else {
    calGrid.innerHTML = '<span style="color:var(--text-secondary);font-size:0.8rem">No history yet</span>';
  }

  return wrap;
}

// ─── Countdown ───────────────────────────────────────────────────────────────

function startCountdown(stats) {
  if (countdownInterval) clearInterval(countdownInterval);
  const blocksRemaining = stats?.blocksRemaining ??
    Math.round(((100 - (stats?.cycleProgress || 0)) / 100) * 14400);
  const secsRemaining = blocksRemaining * 6;
  const startTs = Date.now();

  countdownInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTs) / 1000);
    const current = Math.max(0, secsRemaining - elapsed);
    const el = document.getElementById('rt-countdown');
    if (!el) { clearInterval(countdownInterval); countdownInterval = null; return; }
    el.textContent = secondsToHms(current);
  }, 1000);
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function initRewardsTracker(stats, xtzPrice) {
  const address = getAddress();
  if (!address) return;

  destroyRewardsTracker();
  buildCSS();

  let rewards = [];
  try {
    rewards = await fetchRewards(address);
  } catch (e) {
    console.warn('[rewards-tracker] fetch failed:', e);
  }

  const target = document.getElementById('my-baker-results');
  if (!target) return;

  const container = buildContainer(rewards, stats, xtzPrice);
  target.parentNode.insertBefore(container, target);

  document.getElementById('rt-notif-btn')
    ?.addEventListener('click', e => toggleNotifications(e.currentTarget));

  const lifetimeCard = document.getElementById('rt-lifetime-card');
  document.getElementById('rt-share-btn')
    ?.addEventListener('click', () => shareLifetimeCard(lifetimeCard));

  startCountdown(stats);

  if (stats?.cycle != null) maybeSendCycleNotif(stats.cycle);
}

export function updateRewardsTracker(stats, xtzPrice) {
  if (!document.getElementById(CONTAINER_ID)) return;
  if (stats?.cycle != null) maybeSendCycleNotif(stats.cycle);
  // Countdown self-updates via interval; restart if stats changed
  startCountdown(stats);
}

export function destroyRewardsTracker() {
  if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
  document.getElementById(CONTAINER_ID)?.remove();
  document.getElementById('rewards-tracker-style')?.remove();
}
