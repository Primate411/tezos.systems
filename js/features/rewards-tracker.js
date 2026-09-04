/**
 * rewards-tracker.js — Personal Rewards Tracker for tezos.systems
 * Cards: ⏱ Cycle Clock | 📈 Current Cycle | 🏆 Lifetime
 * + 30-cycle mini-calendar + 🔔 notifications
 *
 * DEPLOY TO: js/features/rewards-tracker.js
 */
import { API_URLS } from '../core/config.js';
import { fetchProtocolConstants, fetchWithDeadline } from '../core/api.js';
import {
  getAllMyTezosRecords,
  getMyTezosMeta,
  initMyTezosDb,
  replaceMyTezosAccountRecords,
  setMyTezosMeta
} from '../core/my-tezos-db.mjs';
import {
  initMyTezosRequestBrokerVisibility,
  myTezosRequestBroker
} from '../core/my-tezos-request-broker.mjs';
import { fetchXTZPrice } from './price.js';
import { quietlySyncHtml } from '../core/quiet-refresh.js';


const CONTAINER_ID = 'rewards-tracker-container';
const LS_KEY_ADDR = 'tezos-systems-my-baker-address';
const LS_KEY_NOTIF = 'tezos-systems-rewards-notif';
const REWARDS_LIMIT = 2000;
const REWARDS_CACHE_MS = 2 * 60 * 1000;
let countdownInterval = null;
let lastKnownCycle = null;

// ─── Helpers ────────────────────────────────────────────────────────────────

function getAddress() {
  return localStorage.getItem(LS_KEY_ADDR)?.trim() || null;
}

function parsePrice(xtzPrice) {
  if (typeof xtzPrice === 'number' && xtzPrice > 0) return xtzPrice;
  const raw = xtzPrice || document.querySelector('.price-value')?.textContent || '';
  const parsed = parseFloat(String(raw).replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function fmt(n, d = 2) {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtXtz(mutez) {
  return fmt(mutez / 1_000_000, 4);
}

async function fetchJson(url) {
  initMyTezosRequestBrokerVisibility();
  return myTezosRequestBroker.request(url, {
    provider: 'tzkt',
    priority: 'interactive',
    retries: 3,
    responseType: 'json',
    cache: 'no-store'
  });
}

function sumFields(row, fields) {
  return fields.reduce((total, field) => total + (Number(row?.[field]) || 0), 0);
}

function sumBakerEarned(row) {
  return sumFields(row, [
    'blockRewardsDelegated',
    'blockRewardsStakedOwn',
    'blockRewardsStakedEdge',
    'attestationRewardsDelegated',
    'attestationRewardsStakedOwn',
    'attestationRewardsStakedEdge',
    'dalAttestationRewardsDelegated',
    'dalAttestationRewardsStakedOwn',
    'dalAttestationRewardsStakedEdge',
    'vdfRevelationRewardsDelegated',
    'vdfRevelationRewardsStakedOwn',
    'vdfRevelationRewardsStakedEdge',
    'nonceRevelationRewardsDelegated',
    'nonceRevelationRewardsStakedOwn',
    'nonceRevelationRewardsStakedEdge',
    'blockFees'
  ]);
}

function sumBakerFuture(row) {
  const attestationFuture = row?.futureAttestationRewards ?? row?.futureEndorsementRewards ?? 0;
  return (Number(row?.futureBlockRewards) || 0)
    + (Number(attestationFuture) || 0)
    + (Number(row?.futureDalAttestationRewards) || 0);
}

function sumMissedRewards(row) {
  const missedAttest = row?.missedAttestationRewards ?? row?.missedEndorsementRewards ?? 0;
  return (Number(row?.missedBlockRewards) || 0)
    + (Number(missedAttest) || 0)
    + (Number(row?.missedDalAttestationRewards) || 0)
    + (Number(row?.missedBlockFees) || 0);
}

function estimateDelegatorReward(row) {
  const baker = row?.bakerRewards || row;
  const delegated = Number(row?.delegatedBalance) || 0;
  const externalDelegated = Number(baker?.externalDelegatedBalance ?? row?.externalDelegatedBalance) || 0;
  if (delegated <= 0 || externalDelegated <= 0) return 0;

  const delegatedPool = sumFields(baker, [
    'blockRewardsDelegated',
    'attestationRewardsDelegated',
    'dalAttestationRewardsDelegated',
    'vdfRevelationRewardsDelegated',
    'nonceRevelationRewardsDelegated'
  ]);
  return Math.round(delegatedPool * delegated / externalDelegated);
}

function normalizeBakerRewards(rows) {
  return rows.map((row) => ({
    ...row,
    _rewardKind: 'baker',
    _earnedRewards: sumBakerEarned(row),
    _futureRewards: sumBakerFuture(row),
    _missedRewards: sumMissedRewards(row)
  }));
}

function normalizeStakerRewards(rows) {
  return rows.map((row) => ({
    ...row,
    _rewardKind: 'staker',
    _earnedRewards: Number(row.rewards) || 0,
    _futureRewards: 0,
    _missedRewards: 0
  }));
}

function normalizeDelegatorRewards(rows) {
  return rows.map((row) => ({
    ...row,
    _rewardKind: 'delegator-estimate',
    _earnedRewards: estimateDelegatorReward(row),
    _futureRewards: 0,
    _missedRewards: sumMissedRewards(row.bakerRewards || row)
  }));
}

function rewardAmountMutez(row) {
  if (row?._earnedRewards !== undefined) return Number(row._earnedRewards) || 0;
  if (row?.rewards !== undefined) return Number(row.rewards) || 0;
  return sumBakerEarned(row);
}

function secondsToHms(s) {
  if (s <= 0) return '00:00:00';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return [h, m, sec].map(v => String(v).padStart(2, '0')).join(':');
}

// ─── API ────────────────────────────────────────────────────────────────────

async function fetchRewards(address, { force = false } = {}) {
  const accountKey = `l1:${address}`;
  let dbAvailable = true;
  try {
    await initMyTezosDb();
  } catch {
    dbAvailable = false;
  }
  if (!force && dbAvailable) {
    const cached = await getMyTezosMeta(`rewards-cache:${address}`);
    if (cached && Date.now() - Number(cached.ts) < REWARDS_CACHE_MS) {
      const stored = await getAllMyTezosRecords('rewards', {
        index: 'accountKey',
        query: IDBKeyRange.only(accountKey),
        limit: REWARDS_LIMIT
      });
      if (stored.length || cached.currentRole === 'none') {
        return {
          rows: stored.sort((left, right) => Number(right.cycle) - Number(left.cycle)).map((row) => ({
            cycle: row.cycle,
            _rewardKind: row.role,
            _earnedRewards: row.earned,
            _futureRewards: row.future,
            _missedRewards: row.missed
          })),
          currentRole: cached.currentRole,
          roleActive: cached.roleActive,
          accountAvailable: cached.accountAvailable
        };
      }
    }
  }

  const enc = encodeURIComponent(address);
  let account = null;
  try {
    account = await fetchJson(`${API_URLS.tzkt}/accounts/${enc}`);
  } catch (_) {}

  const isBaker = account?.type === 'delegate' || account?.delegate?.address === address;
  const hasStake = (Number(account?.stakedBalance) || 0) > 0;
  const currentRole = isBaker
    ? 'baker'
    : hasStake
      ? 'staker'
      : account?.delegate?.address
        ? 'delegator-estimate'
        : account
          ? 'none'
          : 'unknown';
  let data = [];
  try {
    if (currentRole === 'baker') {
      data = normalizeBakerRewards(await fetchJson(`${API_URLS.tzkt}/rewards/bakers/${enc}?sort.desc=cycle&limit=${REWARDS_LIMIT}`));
    } else if (currentRole === 'staker') {
      data = normalizeStakerRewards(await fetchJson(`${API_URLS.tzkt}/rewards/stakers/${enc}?sort.desc=cycle&limit=${REWARDS_LIMIT}`));
    } else {
      // Inactive accounts can still have historical delegation records. One
      // delegator read preserves that history without probing three endpoints.
      data = normalizeDelegatorRewards(await fetchJson(`${API_URLS.tzkt}/rewards/delegators/${enc}?sort.desc=cycle&limit=${REWARDS_LIMIT}`));
    }
  } catch {
    data = [];
  }
  const roleActive = currentRole === 'baker'
    ? account?.active !== false
    : currentRole === 'staker' || currentRole === 'delegator-estimate'
      ? Boolean(account?.delegate?.address) && account.delegate.active !== false
      : currentRole === 'none'
        ? false
        : null;
  const report = {
    rows: data,
    currentRole,
    roleActive,
    accountAvailable: Boolean(account)
  };
  if (dbAvailable) {
    const records = data.map((row) => ({
      id: `reward:${accountKey}:${row._rewardKind || currentRole}:${row.cycle}`,
      accountKey,
      address,
      role: row._rewardKind || currentRole,
      cycle: Number(row.cycle),
      earned: rewardAmountMutez(row),
      future: Number(row._futureRewards) || 0,
      missed: Number(row._missedRewards) || 0,
      confidence: row._rewardKind === 'delegator-estimate' ? 'estimated' : 'exact',
      updatedAt: Date.now()
    })).filter((row) => Number.isFinite(row.cycle));
    await Promise.all([
      replaceMyTezosAccountRecords('rewards', accountKey, records),
      setMyTezosMeta(`rewards-cache:${address}`, {
        ts: Date.now(),
        currentRole,
        roleActive,
        accountAvailable: Boolean(account)
      })
    ]).catch(() => {});
  }
  window.dispatchEvent(new CustomEvent('my-tezos-rewards-updated', {
    detail: { address, currentRole, rows: data.length }
  }));
  return report;
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
      icon: '/icon-192.png',
    });
  }
  lastKnownCycle = currentCycle;
}

// ─── Reward Calc ────────────────────────────────────────────────────────────

function calcLifetime(rewards) {
  let totalMutez = 0;
  for (const r of rewards) {
    totalMutez += rewardAmountMutez(r);
  }
  return totalMutez;
}

function calcThisCycle(rewards, stats) {
  const currentCycle = Number(stats?.cycle);
  if (!Number.isFinite(currentCycle) || currentCycle <= 0) {
    return { status: 'cycle-unavailable', currentCycle: null, recent: null };
  }
  const recent = rewards.find(r => Number(r.cycle) === currentCycle) || null;
  if (!recent) {
    return { status: 'no-current-record', currentCycle, recent: null };
  }

  const earnedSoFar = rewardAmountMutez(recent);
  const futureEst = recent._futureRewards || 0;
  const missed = recent._missedRewards ?? ((recent.missedBlockRewards || 0) + (recent.missedEndorsementRewards || 0));

  return {
    status: 'recorded',
    currentCycle,
    recent,
    estimatedMutez: earnedSoFar,
    futureRightsMutez: futureEst,
    missedRightsMutez: missed
  };
}

function cycleColor(r) {
  const earned = rewardAmountMutez(r);
  if (r?._rewardKind !== 'baker') {
    return earned > 0 ? 'var(--accent, #00ff88)' : '#555';
  }
  const missed = r._missedRewards ?? ((r.missedBlockRewards || 0) + (r.missedEndorsementRewards || 0));
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
    #rewards-tracker-container { margin-bottom: 1.2rem; overflow: hidden; }
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

function latestHistoricalRewardRow(rewards, currentCycle) {
  const hasCurrentCycle = currentCycle !== null && currentCycle !== undefined && currentCycle !== ''
    && Number.isFinite(Number(currentCycle));
  const historical = hasCurrentCycle
    ? rewards.filter((row) => Number(row?.cycle) < Number(currentCycle))
    : rewards;
  return historical.reduce((latest, row) => {
    if (!latest) return row;
    return Number(row?.cycle) > Number(latest?.cycle) ? row : latest;
  }, null);
}

function currentRoleLabel(role) {
  if (role === 'baker') return 'baker';
  if (role === 'staker') return 'staker';
  if (role === 'delegator-estimate') return 'delegation';
  return 'reward';
}

function noCurrentRecordMessage(report, currentCycle) {
  if (report.currentRole === 'none') {
    return 'Not currently baking, staking, or delegating.';
  }
  if (report.currentRole === 'baker' && report.roleActive === false) {
    return 'Baker is inactive; no current-cycle reward record.';
  }
  if (report.currentRole === 'delegator-estimate' && report.roleActive === false) {
    return 'Delegate is inactive; no current-cycle reward record.';
  }
  if (report.currentRole === 'staker' && report.roleActive === false) {
    return 'No active delegate was found for this stake.';
  }
  if (report.currentRole === 'unknown') {
    return 'No current-cycle reward record was returned.';
  }
  return `No cycle ${currentCycle} ${currentRoleLabel(report.currentRole)} record yet.`;
}

function buildCurrentCycleBody(report, cycleData, price) {
  const rewards = report.rows;
  const latest = latestHistoricalRewardRow(rewards, cycleData.currentCycle);
  if (cycleData.status !== 'recorded') {
    const message = cycleData.status === 'cycle-unavailable'
      ? 'Current cycle data is unavailable.'
      : noCurrentRecordMessage(report, cycleData.currentCycle);
    const history = latest
      ? `<div class="rt-sub" style="margin-top:0.5rem">Latest historical record: cycle <span class="rt-accent">${Number(latest.cycle)}</span> · ${fmtXtz(rewardAmountMutez(latest))} XTZ</div>`
      : '<div class="rt-sub" style="margin-top:0.5rem">No reward history returned.</div>';
    return `
      <div class="rt-value">—</div>
      <div class="rt-sub">${message}</div>
      ${history}
    `;
  }

  const kind = cycleData.recent?._rewardKind || report.currentRole;
  const earnedXtz = cycleData.estimatedMutez / 1_000_000;
  const value = `<div class="rt-value">${fmtXtz(cycleData.estimatedMutez)} <span style="font-size:0.9rem">XTZ</span></div>`;
  const usd = Number.isFinite(price) && price > 0
    ? `<div class="rt-sub rt-current-usd">≈ $${fmt(earnedXtz * price)} USD</div>`
    : '<div class="rt-sub rt-current-usd">USD price unavailable</div>';

  if (kind === 'baker') {
    const futureRightsXtz = (cycleData.futureRightsMutez || 0) / 1_000_000;
    const estimate = futureRightsXtz > 0
      ? `<div class="rt-sub rt-future-rights-estimate" style="margin-top:0.3rem">Unsplit future protocol rights: <span class="rt-accent">${fmt(futureRightsXtz, 4)} XTZ</span>${Number.isFinite(price) && price > 0 ? `&nbsp;($${fmt(futureRightsXtz * price)})` : '&nbsp;(USD unavailable)'} · baker/external-staker ownership not yet attributed</div>`
      : '<div class="rt-sub" style="margin-top:0.3rem">No future reward estimate is available.</div>';
    return `${value}<div class="rt-sub">Gross on-chain baker receipts before off-chain delegator payouts; external-staker shared rewards excluded</div>${usd}${estimate}`;
  }
  if (kind === 'staker') {
    return `${value}<div class="rt-sub">Protocol staking reward recorded for cycle ${cycleData.currentCycle}</div>${usd}<div class="rt-sub" style="margin-top:0.3rem">No baker-efficiency score applies to a staker reward.</div>`;
  }
  if (kind === 'delegator-estimate') {
    return `${value}<div class="rt-sub">Estimated delegation share for cycle ${cycleData.currentCycle}</div>${usd}<div class="rt-sub" style="margin-top:0.3rem">Estimate from baker rewards; payout policies vary.</div>`;
  }
  return `${value}<div class="rt-sub">Reward record for cycle ${cycleData.currentCycle}</div>${usd}`;
}

function getBlocksRemaining(stats) {
  const hasBlocksRemaining = stats?.blocksRemaining != null && stats.blocksRemaining !== '';
  const hasCycleProgress = stats?.cycleProgress != null && stats.cycleProgress !== '';
  if (hasBlocksRemaining && Number.isFinite(Number(stats.blocksRemaining))) {
    return Math.max(0, Number(stats.blocksRemaining));
  }
  if (hasCycleProgress && Number.isFinite(Number(stats.cycleProgress))) {
    return Math.max(0, Math.round(((100 - Number(stats.cycleProgress)) / 100) * 14400));
  }
  return null;
}

function buildContainer(report, stats, xtzPrice) {
  const rewards = report.rows;
  const price = parsePrice(xtzPrice);
  const lifetimeMutez = calcLifetime(rewards);
  const lifetimeXtz = lifetimeMutez / 1_000_000;
  const cycleData = calcThisCycle(rewards, stats);
  const trackedRewards = Number.isFinite(cycleData.currentCycle)
    ? rewards.filter((row) => Number(row?.cycle) <= cycleData.currentCycle)
    : rewards;
  const trackedCycles = trackedRewards.map((row) => Number(row?.cycle)).filter(Number.isFinite);
  const firstCycle = trackedCycles.length ? Math.min(...trackedCycles) : null;
  const rewardKind = rewards.find((row) => row?._rewardKind)?._rewardKind || 'unknown';
  const lifetimeSubtitle = rewardKind === 'baker'
    ? 'Gross on-chain baker receipts before delegator payouts; external-staker shared rewards excluded'
    : rewardKind === 'staker'
      ? 'Protocol staking rewards'
      : rewardKind === 'delegator-estimate'
        ? 'Estimated delegation share'
        : 'Personal rewards history';
  const notifEnabled = isNotifEnabled();
  const blocksRemaining = getBlocksRemaining(stats);
  const secsRemaining = blocksRemaining == null ? null : blocksRemaining * 6;
  const currentCycleBody = buildCurrentCycleBody(report, cycleData, price);
  const cycleClock = secsRemaining == null ? '—' : secondsToHms(secsRemaining);
  const cycleDetail = blocksRemaining == null
    ? 'Cycle timing unavailable'
    : `~${fmt(blocksRemaining, 0)} blocks remaining`;
  const cycleProgress = stats?.cycleProgress != null
    && stats.cycleProgress !== ''
    && Number.isFinite(Number(stats.cycleProgress))
    ? `${fmt(Number(stats.cycleProgress), 1)}% complete`
    : 'progress unavailable';

  const wrap = document.createElement('div');
  wrap.id = CONTAINER_ID;
  wrap.dataset.currentCycle = cycleData.currentCycle == null ? '' : String(cycleData.currentCycle);

  wrap.innerHTML = `
    <div class="rt-grid">
      <div class="rt-card">
        <div class="rt-card-title">⏱ Cycle Clock</div>
        <div class="rt-value" id="rt-countdown" data-magic="off">${cycleClock}</div>
        <div class="rt-sub">${cycleDetail}</div>
        <div class="rt-sub" style="margin-top:0.5rem">
          Cycle <span class="rt-accent">${stats?.cycle ?? '—'}</span>
          &nbsp;·&nbsp; ${cycleProgress}
        </div>
        <div class="rt-card-actions">
          <button class="rt-icon-btn ${notifEnabled ? 'notif-on' : ''}" id="rt-notif-btn"
            title="${notifEnabled ? 'Disable' : 'Enable'} cycle notifications">
            ${notifEnabled ? '🔕' : '🔔'}
          </button>
        </div>
      </div>

      <div class="rt-card">
        <div class="rt-card-title">📈 Current Cycle</div>
        ${currentCycleBody}
      </div>

      <div class="rt-card" id="rt-lifetime-card">
        <div class="rt-card-title">🏆 Lifetime Rewards</div>
        <div class="rt-sub" style="font-size:10px;opacity:0.5;margin-bottom:4px">${lifetimeSubtitle}</div>
        <div class="rt-value">${fmt(lifetimeXtz, 4)} <span style="font-size:0.9rem">XTZ</span></div>
        <div class="rt-sub rt-lifetime-usd">${Number.isFinite(price) && price > 0 ? `≈ $${fmt(lifetimeXtz * price)} USD total` : 'USD price unavailable'}</div>
        <div class="rt-sub" style="margin-top:0.3rem">
          Since cycle <span class="rt-accent">${firstCycle ?? '—'}</span>
          ${firstCycle ? `&nbsp;·&nbsp; ${trackedRewards.length} cycles tracked` : ''}
        </div>
        <div class="rt-card-actions">
          <button class="rt-icon-btn" id="rt-share-btn" title="Export as PNG">📸</button>
        </div>
      </div>
    </div>

    <div class="rt-calendar" data-reward-kind="${rewardKind}">
      <div class="rt-cal-title">${rewardKind === 'baker'
        ? '📅 30-Cycle Baker History &nbsp; <span style="color:var(--accent,#00ff88)">■</span> full &nbsp; <span style="color:#f0c040">■</span> partial &nbsp; <span style="color:#ff4444">■</span> missed'
        : '📅 30-Cycle Reward History &nbsp; <span style="color:var(--accent,#00ff88)">■</span> recorded &nbsp; <span style="color:#555">■</span> zero'}
      </div>
      <div class="rt-cal-grid" id="rt-cal-grid"></div>
    </div>
  `;

  // Calendar blocks — oldest first
  const calGrid = wrap.querySelector('#rt-cal-grid');
  const calData = [...trackedRewards]
    .sort((a, b) => Number(b?.cycle) - Number(a?.cycle))
    .slice(0, 30)
    .reverse();
  if (calData.length) {
    for (const r of calData) {
      const block = document.createElement('div');
      block.className = 'rt-cal-block';
      block.style.background = cycleColor(r);
      const earned = rewardAmountMutez(r) / 1_000_000;
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
  const blocksRemaining = getBlocksRemaining(stats);
  if (blocksRemaining == null) {
    const el = document.getElementById('rt-countdown');
    if (el) el.textContent = '—';
    countdownInterval = null;
    return;
  }
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

export async function initRewardsTracker(stats, xtzPrice, options = {}) {
  const address = getAddress();
  if (!address) return;

  const quiet = options.quiet === true && document.getElementById(CONTAINER_ID);
  if (quiet) {
    if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
  } else {
    destroyRewardsTracker();
  }
  buildCSS();

  if (!parsePrice(xtzPrice)) {
    try {
      const sharedPrice = await fetchXTZPrice();
      xtzPrice = Number(sharedPrice?.usd) || xtzPrice;
    } catch (_) {}
  }

  let rewardReport = {
    rows: [],
    currentRole: 'unknown',
    roleActive: null,
    accountAvailable: false
  };
  try {
    rewardReport = await fetchRewards(address, options);
  } catch (e) {
    console.warn('[rewards-tracker] fetch failed:', e);
  }

  // Self-fetch cycle data if stats is missing it
  if (stats?.cycle == null || stats?.cycleProgress == null) {
    try {
      const [headerResponse, metadataResponse, constants] = await Promise.all([
        fetchWithDeadline(`${API_URLS.octez}/chains/main/blocks/head/header`, { cache: 'no-store' }),
        fetchWithDeadline(`${API_URLS.octez}/chains/main/blocks/head/metadata`, { cache: 'no-store' }),
        fetchProtocolConstants()
      ]);
      if (!headerResponse.ok || !metadataResponse.ok) throw new Error('Cycle RPC unavailable');
      const [header, meta] = await Promise.all([headerResponse.json(), metadataResponse.json()]);
      const cycle = meta?.level_info?.cycle == null ? null : Number(meta.level_info.cycle);
      const cyclePos = meta?.level_info?.cycle_position == null ? null : Number(meta.level_info.cycle_position);
      const blocksPerCycle = Number(constants?.blocks_per_cycle);
      const blockDelay = Number(Array.isArray(constants?.minimal_block_delay)
        ? constants.minimal_block_delay[0]
        : constants?.minimal_block_delay);
      if (header && Number.isFinite(cycle) && Number.isFinite(cyclePos)
          && Number.isFinite(blocksPerCycle) && blocksPerCycle > 0
          && Number.isFinite(blockDelay) && blockDelay > 0) {
        stats = {
          ...stats,
          cycle,
          cycleProgress: (cyclePos / blocksPerCycle) * 100,
          cycleTimeRemaining: Math.round((blocksPerCycle - cyclePos) * blockDelay),
        };
      }
    } catch (_) {}
  }

  // An account switch may finish while these requests are in flight.
  if (getAddress() !== address) return;

  // Personal reward cards stay in Overview; baker history belongs to Baker Signal.
  const drawerTarget = document.getElementById('drawer-rewards');
  const fallbackTarget = document.getElementById('my-baker-results');
  if (!drawerTarget && !fallbackTarget) return;

  const container = buildContainer(rewardReport, stats, xtzPrice);
  const historyTarget = document.getElementById('drawer-baker-history');
  if (historyTarget) {
    const bakerCalendar = container.querySelector('.rt-calendar[data-reward-kind="baker"]');
    quietlySyncHtml(historyTarget, bakerCalendar?.outerHTML || '');
    historyTarget.hidden = !bakerCalendar;
    bakerCalendar?.remove();
  }
  if (drawerTarget) {
    if (quiet) {
      const sparkMarkup = drawerTarget.querySelector('.drawer-rewards-spark')?.outerHTML || '';
      quietlySyncHtml(drawerTarget, `${container.outerHTML}${sparkMarkup}`);
    }
    else drawerTarget.replaceChildren(container);
  } else {
    fallbackTarget.parentNode.insertBefore(container, fallbackTarget);
  }

  const notificationButton = document.getElementById('rt-notif-btn');
  if (notificationButton) notificationButton.onclick = (event) => toggleNotifications(event.currentTarget);

  const lifetimeCard = document.getElementById('rt-lifetime-card');
  const shareButton = document.getElementById('rt-share-btn');
  if (shareButton) shareButton.onclick = () => shareLifetimeCard(lifetimeCard);

  startCountdown(stats);

  if (stats?.cycle != null) maybeSendCycleNotif(stats.cycle);
}

export function updateRewardsTracker(stats, xtzPrice) {
  const container = document.getElementById(CONTAINER_ID);
  if (!container) return;
  const incomingCycle = Number(stats?.cycle);
  const renderedCycle = Number(container.dataset.currentCycle);
  if (Number.isFinite(incomingCycle) && incomingCycle > 0 && incomingCycle !== renderedCycle) {
    void initRewardsTracker(stats, xtzPrice, { force: true, quiet: true });
    return;
  }
  if (stats?.cycle != null) maybeSendCycleNotif(stats.cycle);
  startCountdown(stats);

  // Update cycle info in the countdown card
  const cycleEl = container.querySelector('.rt-sub .rt-accent');
  if (cycleEl && stats?.cycle) cycleEl.textContent = stats.cycle;
  
  // Update cycle progress text
  const subs = container.querySelectorAll('.rt-sub');
  for (const sub of subs) {
    if (sub.textContent.includes('% complete') && stats?.cycleProgress != null) {
      const accent = sub.querySelector('.rt-accent');
      if (accent) accent.textContent = stats.cycle ?? '—';
      sub.innerHTML = `Cycle <span class="rt-accent">${stats.cycle ?? '—'}</span>&nbsp;·&nbsp; ${fmt(stats.cycleProgress, 1)}% complete`;
      break;
    }
  }

  // Update blocks remaining
  const blocksRemaining = getBlocksRemaining(stats);
  for (const sub of subs) {
    if (sub.textContent.includes('blocks remaining')) {
      sub.textContent = blocksRemaining == null
        ? 'Cycle timing unavailable'
        : '~' + fmt(blocksRemaining, 0) + ' blocks remaining';
      break;
    }
  }

  // Update USD values if price now available
  const price = parsePrice(xtzPrice);
  if (price > 0) {
    // This cycle USD
    const thisCycleCard = container.querySelectorAll('.rt-card')[1];
    if (thisCycleCard) {
      const mutezText = thisCycleCard.querySelector('.rt-value')?.textContent;
      const xtz = parseFloat(mutezText?.replace(/[^0-9.]/g, '')) || 0;
      const usdSub = thisCycleCard.querySelector('.rt-current-usd');
      if (usdSub && xtz > 0) usdSub.textContent = '≈ $' + fmt(xtz * price) + ' USD';
      // Unsplit future-rights estimate USD
      const estSub = thisCycleCard.querySelector('.rt-future-rights-estimate');
      if (estSub) {
        const match = estSub.textContent.match(/([\d,.]+)\s*XTZ/);
        if (match) {
          const fullXtz = parseFloat(match[1].replace(/,/g, '')) || 0;
          estSub.innerHTML = 'Unsplit future protocol rights: <span class="rt-accent">' + fmt(fullXtz, 4) + ' XTZ</span>&nbsp;($' + fmt(fullXtz * price) + ') · baker/external-staker ownership not yet attributed';
        }
      }
    }
    // Lifetime USD
    const lifetimeCard = container.querySelectorAll('.rt-card')[2];
    if (lifetimeCard) {
      const ltText = lifetimeCard.querySelector('.rt-value')?.textContent;
      const ltXtz = parseFloat(ltText?.replace(/[^0-9.]/g, '')) || 0;
      const ltSub = lifetimeCard.querySelector('.rt-lifetime-usd');
      if (ltSub && ltXtz > 0) ltSub.textContent = '≈ $' + fmt(ltXtz * price) + ' USD total';
    }
  }
}

export function destroyRewardsTracker() {
  if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
  document.getElementById(CONTAINER_ID)?.remove();
  const historyTarget = document.getElementById('drawer-baker-history');
  if (historyTarget) {
    historyTarget.replaceChildren();
    historyTarget.hidden = true;
  }
  document.getElementById('rewards-tracker-style')?.remove();
}
