/**
 * Daily Tezos Briefing — auto-generated narrative summary per cycle
 * Pure JS, no AI. ~50 sentence templates, data-driven selection.
 */

import { API_URLS, MAINNET_LAUNCH } from '../core/config.js';
import { loadDataAsset } from '../core/data-assets.js';
import { getTezosUptimeAnniversary } from '../core/anniversary.js';
import { CANONICAL_UPGRADE_COUNT } from '../core/protocol-count.js';
import { escapeHtml } from '../core/utils.js';
import { quietlySyncHtml } from '../core/quiet-refresh.js';
import { findSiteMapEntry } from '../core/site-map.js';
import { countExplicitLinkedEtherlinkAccounts } from '../core/site-journey.js';
import { activateChamberDialog, deactivateChamberDialog } from '../ui/chamber-accessibility.js';
import { isHomeBlockVisible } from '../ui/home-layout.js';
import {
  holdPulseTickerSignal,
  mountPulseTicker,
  pulseTickerElement,
  releasePulseTicker,
  renderPulseTicker,
  renderPulseTickerState
} from '../ui/pulse-ticker.js';
import {
  describePersonalSignalRelevance,
  rankSignalsByPersonalRelevance
} from '../core/personal-signal-relevance.mjs';
import {
  chooseDailyCurio,
  LIVE_PULSE_CURIO_MAX_BASE_SIGNALS,
  LIVE_PULSE_CURIO_SCORE,
  shouldOfferDailyCurio
} from '../core/live-pulse-curio.mjs';
import {
  describePulseSeries,
  getPulseDomainReceipt,
  getPulseHistoryReceipt,
  pulseSeriesContextLine,
  readCachedPulseDomainReceipt,
  readCachedPulseHistoryReceipt
} from '../core/pulse-history.mjs';
import {
  buildReleaseRadarSignal,
  normalizeReleaseRadarSnapshot
} from '../core/release-radar.mjs';
import { cycleMilestoneStartLevel, generatedMilestoneAnchor, generatedMilestoneMoments, mergedMilestoneThresholds, milestoneBaseThresholds } from './milestone-catalog.mjs';
import { advanceMilestoneTrack, claimMilestoneArrival, deriveMilestoneMoments, MILESTONE_MOMENT_TTL_MS, normalizeMilestoneStore, qualifyMilestoneNearState } from './milestone-lifecycle.mjs';
import { fetchXTZPrice } from './price.js';

const LS_BASELINE  = 'tezos-systems-briefing-baseline';
const LS_BRIEFING  = 'tezos-systems-briefing-cache';
const LS_LAST_SEEN = 'tezos-systems-briefing-last-seen';
const LS_HOT_HISTORY = 'tezos-systems-hot-history';
const LS_DAILY_SNAPSHOT = 'tezos-systems-daily-snapshot';
const LS_DAILY_CURIO_DAY = 'tezos-systems-live-pulse-curio-day-v1';
const LS_MILESTONE_MOMENTS = 'tezos-systems-milestone-moments';
const LS_RELEASE_RADAR_LAST_GOOD = 'tezos-systems-release-radar-last-good-v1';
const BRIEFING_SCHEMA_VERSION = 14;
const PRICE_FETCH_TIMEOUT_MS = 2500;
const NFT_FETCH_TIMEOUT_MS = 2500;
const MILESTONE_FETCH_TIMEOUT_MS = 2800;
const MILESTONE_CATALOG_URL = '/data/milestone-catalog.json';
const HOT_TODAY_LIVE_TICK_MS = 1000;
const HOT_TODAY_INITIAL_TIMEOUT_MS = 20000;
const HOT_SIGNAL_RENDER_THROTTLE_MS = 1000;
const HOT_SIGNAL_RENDER_CAP = 12;
const HOT_SIGNAL_CATEGORY_BUDGET = 2;
const HOT_SIGNAL_MILESTONE_BUDGET = 12;
const HOT_SIGNAL_VISIBLE_MIN = 4;
const HOT_SIGNAL_EVENT_DECAY_PER_HOUR = 8;
const HOT_SIGNAL_PERSONAL_BONUS = 6;
const MILESTONE_CARD_ARRIVAL_MS = 1700;
const HOT_HISTORY_DAYS = 7;
const ACTIVITY_NEUTRAL_PCT = 1;
const ACTIVITY_MEANINGFUL_PCT = 10;
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const PULSE_LAST_GOOD_TTL_MS = 4 * HOUR_MS;
const MILESTONE_NEAR_LEAD_DAYS = 14;
const MILESTONE_NEAR_MAX_DAYS = 30;
const MILESTONE_RATE_MIN_SAMPLE_MS = HOUR_MS;
const MILESTONE_RATE_MAX_SAMPLE_MS = 14 * DAY_MS;
const RELEASE_RADAR_REFRESH_MS = 15 * 60 * 1000;
const RELEASE_RADAR_LAST_GOOD_MAX_AGE_MS = 7 * DAY_MS;
const OBJKT_GRAPHQL_ENDPOINT = 'https://data.objkt.com/v3/graphql';
const OBJKT_SALES_SAMPLE_LIMIT = 500;
const PULSE_RETAIN_FIELD_CATEGORIES = Object.freeze({
  transactionVolume24h: 'transactionVolume24h',
  totalTransactions: 'totalTransactions',
  contractCalls24h: 'contractCalls24h',
  fundedAccounts: 'fundedAccounts',
  newAccounts24h: 'newAccounts24h',
  smartContracts: 'smartContracts',
  activeContracts24h: 'activeContracts24h',
  tokens: 'tokens',
  rollups: 'rollups'
});

const CATEGORY_META = {
  baker: { label: 'Baker', icon: '🍞', tone: 'operator', visual: 'operator', detail: 'Personal operator signal' },
  price: { label: 'Market', icon: '💸', tone: 'market', visual: 'market', detail: 'XTZ price movement' },
  staking: { label: 'Staking', icon: '🥩', tone: 'staking', visual: 'staking', detail: 'Security and yield' },
  volume: { label: 'Activity', icon: '⚡', tone: 'activity', visual: 'activity', detail: 'Transaction flow' },
  contracts: { label: 'Contracts', icon: '🧩', tone: 'activity', visual: 'forge', detail: 'App and DeFi pulse' },
  whales: { label: 'Whales', icon: '🐋', tone: 'capital', visual: 'whale', detail: 'Large value movement' },
  governance: { label: 'Governance', icon: '🏛️', tone: 'governance', visual: 'governance', detail: 'Protocol decision lane' },
  ecosystem: { label: 'Growth', icon: '🌱', tone: 'growth', visual: 'growth', detail: 'New account flow' },
  cycle: { label: 'Cycle', icon: '⏱️', tone: 'cycle', visual: 'consensus', detail: 'Cycle runway' },
  security: { label: 'Security', icon: '🛡️', tone: 'security', visual: 'consensus', detail: 'Bakers, stake, and finality' },
  domains: { label: 'Domains', icon: '.tez', tone: 'activity', visual: 'domains', detail: 'Tezos Domains lane' },
  nft: { label: 'NFTs', icon: '◈', tone: 'activity', visual: 'nft', detail: 'HEN live culture' },
  lb: { label: 'Liquidity Baking', icon: 'LB', tone: 'governance', visual: 'lb', detail: 'LB vote and liquidity lane' },
  tz4: { label: 'tz4', icon: 'tz4', tone: 'security', visual: 'tz4', detail: 'BLS consensus key adoption' },
  etherlink: { label: 'Etherlink', icon: 'L2', tone: 'activity', visual: 'etherlink', detail: 'Tezos X activity lane' },
  ledger: { label: 'Ledger Flow', icon: '↔', tone: 'network', visual: 'ledger', detail: 'Account transfer paths' },
  maxis: { label: 'Tezos Maxis', icon: '♛', tone: 'governance', visual: 'maxis', detail: 'Crown and protocol-season movement' },
  anniversary: { label: 'Anniversary', icon: '∞', tone: 'anniversary', visual: 'anniversary', detail: 'Tezos mainnet anniversary' },
  milestone: { label: 'Milestone', icon: 'M', tone: 'milestone', visual: 'milestone', detail: 'Round-number network marker' },
  moment: { label: 'Milestone', icon: '✦', tone: 'growth', visual: 'moment', detail: 'Network milestone' },
  release: { label: 'Releases', icon: '◉', tone: 'release', visual: 'release', detail: 'Tezos release forecast' },
  network: { label: 'Network', icon: '🌐', tone: 'network', visual: 'network', detail: 'Daily Tezos pulse' }
};

const SPECTACLE_LEVELS = ['quiet', 'curious', 'headliner', 'peacock', 'historic'];

const NETWORK_FEATURE_SITE_MAP_IDS = {
  staking: 'staking-chamber',
  governance: 'chamber',
  collector: 'hen',
  creator: 'hen',
  nft: 'hen',
  cycle: 'health',
  security: 'health',
  network: 'pulse',
  domains: 'domains',
  lb: 'liquidity-baking',
  tz4: 'tz4',
  etherlink: 'tezosx',
  ledger: 'ledger-flow',
  maxis: 'maxis',
  release: 'tezosx'
};

const NETWORK_FEATURE_FALLBACK_ROUTES = {
  baker: '#my-baker',
  portfolio: '#price',
  staking: '#staking',
  governance: '#chamber',
  collector: '?hen=1',
  creator: '?hen=1',
  price: '#price',
  whales: '#whales',
  volume: '#section=network',
  contracts: '#section=ecosystem',
  ecosystem: '#section=ecosystem',
  cycle: '#health',
  security: '#health',
  milestone: '#hot-today',
  maxis: '#maxis',
  release: '#tezosx',
  network: '#pulse'
};

const NETWORK_FEATURE_FALLBACK_LABELS = {
  baker: 'Open My Tezos baker stats',
  portfolio: 'Open price intelligence',
  staking: 'Open Staking Chamber',
  governance: 'Enter The Chamber',
  collector: 'Open HEN profile',
  creator: 'Open NFT profile',
  price: 'Open price intelligence',
  whales: 'Open whale tracker',
  volume: 'Open network activity stats',
  contracts: 'Open ecosystem stats',
  ecosystem: 'Open ecosystem stats',
  domains: 'Open Tezos Domains',
  nft: 'Open HEN live feed',
  lb: 'Open Liquidity Baking',
  tz4: 'Open tz4 Adoption',
  etherlink: 'Open Tezos X',
  ledger: 'Open Ledger Flow',
  maxis: 'Open Tezos Maxis',
  release: 'Open Tezos X',
  anniversary: 'Open Protocol Anthology',
  milestone: 'Open live Tezos milestones',
  moment: 'Open live Tezos pulse',
  cycle: 'Open live cycle health',
  security: 'Open Network Health',
  network: 'Open Network Pulse'
};

let lastStats = null;
let lastXtzPrice = null;
let lastPortfolioContext = null;
let lastMemoryContext = null;
let lastPersonalContextAddress = '';
let personalizationWired = false;
let hotTodayWired = false;
let hotTodayRealtimeWired = false;
let hotTodayVisibilityWired = false;
let hotTodayQuietRestore = false;
let hotTodayLiveTimer = null;
let hotTodayExpiryTimer = null;
let hotTodayInitialTimer = null;
let hotTodayLoadingStartedAt = null;
let hotTodaySignals = [];
let hotTodayBriefingSentences = [];
let hotTodayHasRendered = false;
let hotSignalRenderTimer = null;
let lastHotSignalRenderAt = 0;
let hotSignalListenerWired = false;
let pulseHistoryLoadScheduled = false;
let pulseHistoryLoadInFlight = null;
let pulseHistoryRevision = 0;
let lastPulseHistoryReceipt = readCachedPulseHistoryReceipt();
let lastPulseDomainReceipt = readCachedPulseDomainReceipt();
let lastLiveCandidates = [];
let lastLiveCandidateFingerprint = '';
let lastHotTodayDataState = 'loading';
let lastHotTodayGoodAt = 0;
let releaseRadarLoadInFlight = null;
let releaseRadarFetchedAt = 0;
let lastReleaseRadarSnapshot = null;
let lastReleaseRadarSignal = null;
let releaseRadarSavedBodyOverflow = null;
let releaseRadarSavedHtmlOverflow = null;
let dailyCurioPreparation = null;
let preparedDailyCurio = null;
let activeDailyCurio = null;
let lastDailyCurioDay = utcDayKey();
let lastMilestoneStats = {};
let generatedMilestoneCatalog = null;
let generatedMilestoneCatalogPromise = null;
const exactMilestoneMomentPromises = new Map();
const exactMilestoneMoments = new Map();
const hotSignalPool = new Map();
const seenMilestoneArrivals = new Set();
const lastStatsFieldObservedAt = new Map();

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
    ({ baselineText, activityState }) => `Transaction volume is ${baselineText} — chain is ${activityState}.`,
    ({ vol })                   => `${vol.toLocaleString()} on-chain transactions in the last 24h.`,
    ({ normalText })            => `On-chain activity is ${normalText} this cycle.`,
    ({ vol, paceText })         => `${vol.toLocaleString()} txns recorded — ${paceText}.`,
    ({ vol, trendText })        => `Chain throughput: ${vol.toLocaleString()} transactions, trending ${trendText}.`,
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

function activityNarrative(deltaPct) {
  const abs = Math.abs(deltaPct);
  const pct = fmtPct(deltaPct);

  if (abs < ACTIVITY_NEUTRAL_PCT) {
    return {
      pct,
      dir: 'near',
      baselineText: 'in line with the activity baseline',
      normalText: 'in line with normal levels',
      paceText: 'holding a typical pace',
      trendText: 'steady',
      activityState: 'steady',
      isMeaningful: false,
      tone: 'quiet'
    };
  }

  const dir = deltaPct > 0 ? 'above' : 'below';
  const isMeaningful = abs > ACTIVITY_MEANINGFUL_PCT;
  return {
    pct,
    dir,
    baselineText: `${pct}% ${dir} the activity baseline`,
    normalText: `${pct}% ${dir} normal levels`,
    paceText: isMeaningful ? `${pct}% ${dir} typical pace` : `near typical pace (${pct}% ${dir})`,
    trendText: isMeaningful ? `${dir} (${pct}%)` : `steady (${pct}% ${dir})`,
    activityState: isMeaningful ? (deltaPct > 0 ? 'busy' : 'quiet') : 'steady',
    isMeaningful,
    tone: isMeaningful ? (deltaPct > 0 ? 'activity' : 'quiet') : 'quiet'
  };
}

function finiteNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parsedTimestamp(value, fallback = null) {
  const timestamp = typeof value === 'number' ? value : Date.parse(value || '');
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : fallback;
}

function statsFieldObservedAt(stats, category, fallback = Date.now()) {
  const stale = stats?._quality?.staleObservedAt?.[category];
  return parsedTimestamp(stale, parsedTimestamp(stats?._quality?.observedAt, fallback));
}

function pulseStatsCategoryUnavailable(stats, category) {
  const unavailable = Array.isArray(stats?._quality?.unavailableCategories)
    ? stats._quality.unavailableCategories
    : [];
  const stale = Array.isArray(stats?._quality?.staleCategories)
    ? stats._quality.staleCategories
    : [];
  return unavailable.includes(category) || stale.includes(category);
}

function mergePulseStats(stats) {
  if (!stats || typeof stats !== 'object') return lastStats || {};
  const previous = lastStats && typeof lastStats === 'object' ? lastStats : {};
  const next = { ...previous, ...stats };
  const now = Date.now();

  Object.entries(PULSE_RETAIN_FIELD_CATEGORIES).forEach(([field, category]) => {
    if (!Object.prototype.hasOwnProperty.call(stats, field)) return;
    const incoming = stats[field];
    if (incoming !== null && incoming !== undefined) {
      const observedAt = statsFieldObservedAt(stats, category, now);
      if (pulseStatsCategoryUnavailable(stats, category) && (now - observedAt) > PULSE_LAST_GOOD_TTL_MS) {
        next[field] = null;
        lastStatsFieldObservedAt.delete(field);
        return;
      }
      lastStatsFieldObservedAt.set(field, observedAt);
      return;
    }
    const observedAt = lastStatsFieldObservedAt.get(field) || 0;
    const canRetain = previous[field] !== null
      && previous[field] !== undefined
      && pulseStatsCategoryUnavailable(stats, category)
      && observedAt > 0
      && (now - observedAt) <= PULSE_LAST_GOOD_TTL_MS;
    if (canRetain) next[field] = previous[field];
  });

  lastStats = next;
  return next;
}

function pulseFieldObservedAt(field, fallback = Date.now()) {
  return lastStatsFieldObservedAt.get(field) || fallback;
}

function safeLocalStorageGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function safeLocalStorageSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* storage full */ }
}

function utcDayKey(timestamp = Date.now()) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function dayDiff(fromDay, toDay = utcDayKey()) {
  const from = Date.parse(`${fromDay}T00:00:00Z`);
  const to = Date.parse(`${toDay}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return Math.round((to - from) / DAY_MS);
}

function compactStatsSnapshot(stats = {}) {
  const fields = [
    'blockLevel',
    'fundedAccounts',
    'tz4Bakers',
    'tz4Percentage',
    'totalBakers',
    'totalDelegators',
    'totalStakers',
    'totalBurned',
    'totalTransactions',
    'smartContracts',
    'tokens',
    'rollups',
    'stakingRatio',
    'upgradeCount',
    'protocolCount',
    'stakeAPY',
    'lbEmaPct',
    'cycleProgress',
    'cycle'
  ];
  const snapshot = {};
  fields.forEach((field) => {
    const value = finiteNumber(stats?.[field]);
    if (value != null) snapshot[field] = value;
  });
  if (typeof stats?.lbSubsidyDisabled === 'boolean') {
    snapshot.lbSubsidyDisabled = stats.lbSubsidyDisabled;
  }
  return snapshot;
}

function hasDailySnapshotCore(stats = {}) {
  return finiteNumber(stats.tz4Bakers) != null
    && finiteNumber(stats.totalBakers) != null
    && finiteNumber(stats.totalBurned) != null
    && finiteNumber(stats.smartContracts) != null;
}

function readDailySnapshot() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LS_DAILY_SNAPSHOT) || 'null');
    if (!parsed || typeof parsed !== 'object' || !parsed.day || typeof parsed.stats !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeDailySnapshot(snapshot) {
  safeLocalStorageSet(LS_DAILY_SNAPSHOT, JSON.stringify(snapshot));
}

function dailySnapshotReference(snapshot = readDailySnapshot()) {
  if (!snapshot) return null;
  const today = utcDayKey();
  if (snapshot.day === today) return snapshot.previous || null;
  return snapshot;
}

function captureDailySnapshot(stats) {
  if (!stats || !stats.cycle) return;
  const today = utcDayKey();
  const compact = compactStatsSnapshot(stats);
  if (!hasDailySnapshotCore(compact)) return;
  const current = readDailySnapshot();
  if (current?.day === today && hasDailySnapshotCore(current.stats)) return;
  const previous = current?.day === today
    ? current.previous || null
    : current?.day && current?.stats
    ? { day: current.day, capturedAt: current.capturedAt || Date.now(), stats: current.stats }
    : null;
  writeDailySnapshot({
    day: today,
    capturedAt: Date.now(),
    stats: compact,
    ...(previous ? { previous } : {})
  });
}

function snapshotSinceLabel(snapshot) {
  if (!snapshot?.day) return 'since the last daily snapshot';
  const diff = dayDiff(snapshot.day);
  if (diff === 1) return 'since yesterday';
  const date = new Date(`${snapshot.day}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) return 'since the last daily snapshot';
  return `since ${date.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })}`;
}

function snapshotDelta(stats, previous, field) {
  const current = finiteNumber(stats?.[field]);
  const prior = finiteNumber(previous?.[field]);
  if (current == null || prior == null) return null;
  return current - prior;
}

function formatCount(value) {
  return Math.round(Number(value) || 0).toLocaleString('en-US');
}

function formatTez(value, precision = 0) {
  const number = finiteNumber(value);
  if (number == null) return '0';
  return number.toLocaleString('en-US', {
    maximumFractionDigits: precision,
    minimumFractionDigits: precision
  });
}

const MILESTONE_TRACKS = [
  {
    id: 'blocks',
    value: stats => finiteNumber(stats?.blockLevel),
    thresholds: milestoneBaseThresholds('blocks'),
    noun: 'blocks',
    targetSuffix: 'blocks',
    currentSuffix: 'blocks baked',
    detail: 'Block height',
    route: '#health',
    priority: 28,
    snapshotField: 'blockLevel',
    trustedDailyRate: 7_200,
    nearWindow: 24_000,
    afterWindow: 50_000
  },
  {
    id: 'funded-wallets',
    value: stats => finiteNumber(stats?.fundedAccounts),
    thresholds: milestoneBaseThresholds('funded-wallets'),
    noun: 'funded wallets',
    targetSuffix: 'funded wallets',
    currentSuffix: 'funded accounts',
    detail: 'Funded accounts',
    route: '#section=network',
    priority: 26,
    snapshotField: 'fundedAccounts',
    nearWindow: 90_000,
    afterWindow: 90_000
  },
  {
    id: 'transactions',
    value: stats => finiteNumber(stats?.totalTransactions),
    thresholds: milestoneBaseThresholds('transactions'),
    noun: 'transactions',
    targetSuffix: 'transactions',
    currentSuffix: 'transaction operations',
    detail: 'All-time TzKT count',
    route: '#section=network',
    priority: 48,
    snapshotField: 'totalTransactions',
    nearWindow: 30_000_000,
    afterWindow: 35_000_000
  },
  {
    id: 'smart-contracts',
    value: stats => finiteNumber(stats?.smartContracts),
    thresholds: milestoneBaseThresholds('smart-contracts'),
    noun: 'smart contracts',
    targetSuffix: 'smart contracts',
    currentSuffix: 'smart contracts',
    detail: 'Contract count',
    route: '#section=ecosystem',
    priority: 16,
    snapshotField: 'smartContracts',
    nearWindow: 20_000,
    afterWindow: 20_000
  },
  {
    id: 'tokens',
    value: stats => finiteNumber(stats?.tokens),
    thresholds: milestoneBaseThresholds('tokens'),
    noun: 'tokens',
    targetSuffix: 'tokens indexed',
    currentSuffix: 'tokens indexed',
    detail: 'Token index',
    route: '#section=ecosystem',
    priority: 14,
    snapshotField: 'tokens',
    nearWindow: 750_000,
    afterWindow: 750_000
  },
  {
    id: 'bakers',
    value: stats => finiteNumber(stats?.totalBakers),
    thresholds: milestoneBaseThresholds('bakers'),
    noun: 'active bakers',
    targetSuffix: 'active bakers',
    currentSuffix: 'active bakers',
    detail: 'Validator set',
    route: '#leaderboard',
    priority: 20,
    snapshotField: 'totalBakers',
    nearWindow: 8,
    afterWindow: 12
  },
  {
    id: 'tz4-adoption',
    value: stats => finiteNumber(stats?.tz4Percentage),
    thresholds: milestoneBaseThresholds('tz4-adoption'),
    noun: 'tz4 adoption',
    targetSuffix: 'tz4 adoption',
    currentSuffix: 'tz4 adoption',
    detail: 'BLS keys',
    route: '/tz4/',
    priority: 18,
    snapshotField: 'tz4Percentage',
    nearWindow: 2.5,
    afterWindow: 2.5,
    unit: '%',
    gapUnit: 'pp',
    decimals: 1
  },
  {
    id: 'staking',
    value: stats => finiteNumber(stats?.stakingRatio),
    thresholds: milestoneBaseThresholds('staking'),
    noun: 'staked',
    targetSuffix: 'staked',
    currentSuffix: 'of supply staked',
    detail: 'Staking ratio',
    route: '#staking',
    priority: 18,
    snapshotField: 'stakingRatio',
    nearWindow: 1.25,
    afterWindow: 1.25,
    unit: '%',
    gapUnit: 'pp',
    decimals: 1
  },
  {
    id: 'burned',
    value: stats => finiteNumber(stats?.totalBurned),
    thresholds: milestoneBaseThresholds('burned'),
    noun: 'XTZ burned',
    targetSuffix: 'XTZ burned',
    currentSuffix: 'XTZ burned',
    detail: 'Protocol burn',
    route: '#section=economy',
    priority: 14,
    snapshotField: 'totalBurned',
    nearWindow: 150_000,
    afterWindow: 150_000
  },
  {
    id: 'cycle',
    value: stats => finiteNumber(stats?.cycle),
    thresholds: milestoneBaseThresholds('cycle'),
    noun: 'cycles',
    targetSuffix: 'cycles',
    currentSuffix: 'current cycle',
    detail: 'Cycle count',
    route: '#health',
    priority: 10,
    snapshotField: 'cycle',
    nearWindow: 30,
    afterWindow: 45
  },
  {
    id: 'uptime-days',
    value: () => Math.floor((Date.now() - Date.parse(MAINNET_LAUNCH)) / DAY_MS),
    thresholds: milestoneBaseThresholds('uptime-days'),
    noun: 'mainnet days',
    targetSuffix: 'days live',
    currentSuffix: 'days live',
    detail: 'Elapsed since mainnet launch',
    route: '/anthology/',
    priority: 24,
    trustedDailyRate: 1,
    nearWindow: 180,
    afterWindow: 90
  },
  {
    id: 'protocol-upgrades',
    value: stats => finiteNumber(stats?.upgradeCount) ?? finiteNumber(stats?.protocolCount) ?? CANONICAL_UPGRADE_COUNT,
    thresholds: milestoneBaseThresholds('protocol-upgrades'),
    noun: 'self-amendments',
    targetSuffix: 'self-amendments',
    currentSuffix: 'protocol upgrades',
    detail: 'Documented amendment record',
    route: '/anthology/',
    priority: 24,
    snapshotField: 'upgradeCount',
    nearWindow: 1,
    afterWindow: 1
  },
  {
    id: 'rollups',
    value: stats => finiteNumber(stats?.rollups),
    thresholds: milestoneBaseThresholds('rollups'),
    noun: 'smart rollups',
    targetSuffix: 'smart rollups',
    currentSuffix: 'smart rollups',
    detail: 'Rollup count',
    route: '/tezosx/',
    priority: 8,
    snapshotField: 'rollups',
    nearWindow: 5,
    afterWindow: 5
  }
];

function milestoneThresholds(track) {
  const merged = mergedMilestoneThresholds(generatedMilestoneCatalog, track.id);
  return merged.length ? merged : track.thresholds;
}

function milestoneCatalogRate(track, currentValue, now = Date.now()) {
  const anchor = generatedMilestoneAnchor(generatedMilestoneCatalog, track.id);
  const current = finiteNumber(currentValue);
  if (!anchor || current == null || current <= anchor.current) return null;
  const elapsedMs = now - anchor.observedAt;
  if (elapsedMs < MILESTONE_RATE_MIN_SAMPLE_MS || elapsedMs > MILESTONE_RATE_MAX_SAMPLE_MS) return null;
  const rate = ((current - anchor.current) / elapsedMs) * DAY_MS;
  return rate > 0 ? rate : null;
}

async function loadGeneratedMilestoneCatalog() {
  if (generatedMilestoneCatalog) return generatedMilestoneCatalog;
  if (generatedMilestoneCatalogPromise) return generatedMilestoneCatalogPromise;
  generatedMilestoneCatalogPromise = withTimeout(
    fetch(MILESTONE_CATALOG_URL, { cache: 'no-cache', headers: { Accept: 'application/json' } })
      .then(response => response.ok ? response.json() : null),
    MILESTONE_FETCH_TIMEOUT_MS
  ).then((catalog) => {
    generatedMilestoneCatalog = catalog && typeof catalog === 'object' ? catalog : null;
    return generatedMilestoneCatalog;
  }).catch(() => null);
  return generatedMilestoneCatalogPromise;
}

function hasMilestoneNumber(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

function compactMilestoneNumber(value, { unit = '', decimals = null, current = false } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '--';
  if (unit === '%') {
    return `${number.toFixed(decimals ?? 1)}%`;
  }
  const abs = Math.abs(number);
  const format = (scaled, suffix) => {
    const precision = current
      ? scaled >= 100 ? 1 : scaled >= 10 ? 2 : 2
      : scaled >= 100 || Number.isInteger(scaled) ? 0 : scaled >= 10 ? 1 : 2;
    return `${scaled.toFixed(precision).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1')}${suffix}`;
  };
  if (abs >= 1_000_000_000) return format(number / 1_000_000_000, 'B');
  if (abs >= 1_000_000) return format(number / 1_000_000, 'M');
  if (abs >= 1_000) return format(number / 1_000, 'K');
  return Number.isInteger(number) ? number.toLocaleString('en-US') : number.toFixed(decimals ?? 1);
}

function milestoneTargetLabel(track, value) {
  if (track.id === 'cycle') {
    const number = Number(value);
    return Number.isFinite(number) ? number.toLocaleString('en-US') : '--';
  }
  return compactMilestoneNumber(value, {
    unit: track.unit,
    decimals: track.targetDecimals ?? (track.unit === '%' ? 0 : track.decimals)
  });
}

function milestoneShortLabel(track, value) {
  const target = milestoneTargetLabel(track, value);
  const nouns = {
    blocks: 'blocks',
    'funded-wallets': 'wallets',
    transactions: 'tx',
    'smart-contracts': 'contracts',
    tokens: 'tokens',
    bakers: 'bakers',
    'tz4-adoption': 'tz4',
    staking: 'staked',
    burned: 'burned',
    cycle: 'cycles',
    'uptime-days': 'days',
    'protocol-upgrades': 'upgrades',
    rollups: 'rollups'
  };
  return `${target} ${nouns[track.id] || track.noun}`;
}

function milestoneCurrentLabel(track, value) {
  if (track.id === 'cycle') {
    return `Cycle ${Math.round(Number(value) || 0).toLocaleString('en-US')}`;
  }
  const label = compactMilestoneNumber(value, { unit: track.unit, decimals: track.decimals, current: true });
  return `${label} ${track.currentSuffix || track.noun}`.trim();
}

function milestoneGapLabel(track, value) {
  const abs = Math.abs(Number(value) || 0);
  if (track.gapUnit) return `${abs.toFixed(track.decimals ?? 1)}${track.gapUnit}`;
  return compactMilestoneNumber(abs);
}

function milestoneDailyRate(track, currentValue, momentStore, snapshot, now = Date.now()) {
  const catalogRate = milestoneCatalogRate(track, currentValue, now);
  if (catalogRate != null) return catalogRate;

  const trustedRate = finiteNumber(track?.trustedDailyRate);
  if (trustedRate != null && trustedRate > 0) return trustedRate;

  const current = finiteNumber(currentValue);
  if (current == null) return null;

  const snapshotField = track?.snapshotField;
  const snapshotValue = snapshotField ? finiteNumber(snapshot?.stats?.[snapshotField]) : null;
  const snapshotAgeDays = snapshot?.day ? dayDiff(snapshot.day) : null;
  if (snapshotValue != null && snapshotAgeDays != null && snapshotAgeDays >= 1 && snapshotAgeDays <= MILESTONE_NEAR_MAX_DAYS) {
    const snapshotRate = (current - snapshotValue) / snapshotAgeDays;
    if (snapshotRate > 0) return snapshotRate;
  }

  const storedTrack = momentStore?.tracks?.[track.id];
  const previous = finiteNumber(storedTrack?.lastValue);
  const previousAt = finiteNumber(storedTrack?.lastObservedAt);
  const elapsedMs = previousAt == null ? null : now - previousAt;
  if (previous != null && elapsedMs != null && elapsedMs >= MILESTONE_RATE_MIN_SAMPLE_MS && elapsedMs <= MILESTONE_RATE_MAX_SAMPLE_MS) {
    const observedRate = ((current - previous) / elapsedMs) * DAY_MS;
    if (observedRate > 0) return observedRate;
  }

  return null;
}

function exactMilestoneMoment(trackId, target, now = Date.now()) {
  const moment = exactMilestoneMoments.get(`${trackId}:${target}`);
  return moment && moment.createdAt <= now && moment.expiresAt > now ? moment : null;
}

async function resolveExactBlockMilestoneMoment(stats = {}) {
  const track = MILESTONE_TRACKS.find(entry => entry.id === 'blocks');
  const current = track?.value(stats);
  if (!track || !hasMilestoneNumber(current)) return null;
  const target = [...milestoneThresholds(track)].reverse().find(value => value <= current);
  if (!target || Number(current) - target > track.afterWindow) return null;

  const key = `${track.id}:${target}`;
  const existing = exactMilestoneMoment(track.id, target);
  if (existing) return existing;
  if (exactMilestoneMomentPromises.has(key)) return exactMilestoneMomentPromises.get(key);

  const promise = fetchMilestoneJson(`${API_URLS.tzkt}/blocks/${target}`).then((block) => {
    const createdAt = Date.parse(block?.timestamp || '');
    if (Number(block?.level) !== Number(target) || !Number.isFinite(createdAt)) return null;
    const moment = {
      target: Number(target),
      createdAt,
      expiresAt: createdAt + MILESTONE_MOMENT_TTL_MS,
      crossedValue: Number(current)
    };
    exactMilestoneMoments.set(key, moment);
    return moment.expiresAt > Date.now() ? moment : null;
  }).catch(() => null);
  exactMilestoneMomentPromises.set(key, promise);
  return promise;
}

async function resolveExactCycleMilestoneMoment(stats = {}) {
  const track = MILESTONE_TRACKS.find(entry => entry.id === 'cycle');
  const current = track?.value(stats);
  const cycleStartBlock = finiteNumber(stats?.cycleStartBlock);
  const blocksPerCycle = finiteNumber(stats?.blocksPerCycle);
  if (!track || !hasMilestoneNumber(current) || !hasMilestoneNumber(cycleStartBlock) || !hasMilestoneNumber(blocksPerCycle)) return null;
  const target = [...milestoneThresholds(track)].reverse().find(value => value <= current);
  if (!target || Number(current) - target > track.afterWindow) return null;

  const key = `${track.id}:${target}`;
  const existing = exactMilestoneMoment(track.id, target);
  if (existing) return existing;
  if (exactMilestoneMomentPromises.has(key)) return exactMilestoneMomentPromises.get(key);

  const targetLevel = cycleMilestoneStartLevel({
    currentCycle: current,
    currentCycleStartLevel: cycleStartBlock,
    targetCycle: target,
    blocksPerCycle
  });
  if (!targetLevel) return null;

  const promise = fetchMilestoneJson(`${API_URLS.octez}/chains/main/blocks/${targetLevel}/header`).then((header) => {
    const createdAt = Date.parse(header?.timestamp || '');
    if (Number(header?.level) !== Number(targetLevel) || !Number.isFinite(createdAt)) return null;
    const moment = {
      target: Number(target),
      createdAt,
      expiresAt: createdAt + MILESTONE_MOMENT_TTL_MS,
      crossedValue: Number(current)
    };
    exactMilestoneMoments.set(key, moment);
    return moment.expiresAt > Date.now() ? moment : null;
  }).catch(() => null);
  exactMilestoneMomentPromises.set(key, promise);
  return promise;
}

function readMilestoneMomentLog() {
  try {
    const parsed = JSON.parse(safeLocalStorageGet(LS_MILESTONE_MOMENTS) || 'null');
    return normalizeMilestoneStore(parsed);
  } catch {
    return normalizeMilestoneStore(null);
  }
}

function writeMilestoneMomentLog(log) {
  safeLocalStorageSet(LS_MILESTONE_MOMENTS, JSON.stringify({
    schema: log.schema,
    tracks: log.tracks
  }));
}

function signalIsExpired(signal, now = Date.now()) {
  const expiresAt = finiteNumber(signal?.expiresAt);
  return expiresAt != null && expiresAt <= now;
}

function milestoneScore(track, state) {
  const bases = { near: 128, crossed: 170 };
  const base = bases[state.status] || 80;
  return base + (Number(track.priority) || 0);
}

function milestoneText(track, state) {
  const target = milestoneTargetLabel(track, state.target);
  const current = milestoneCurrentLabel(track, state.current);
  const targetSuffix = track.targetSuffix || track.noun;
  const gap = milestoneGapLabel(track, state.gap);

  if (state.status === 'near') {
    const etaDays = finiteNumber(state.etaDays);
    const eta = etaDays == null ? '' : ` — about ${Math.max(1, Math.ceil(etaDays))} day${Math.ceil(etaDays) === 1 ? '' : 's'} at the recent pace`;
    return `${gap} to go${eta}.`;
  }
  if (state.status === 'crossed') {
    if (track.id === 'cycle') {
      return `${target} cycles crossed; Cycle ${target} is confirmed on-chain.`;
    }
    return `${target} ${targetSuffix} crossed; ${current} now visible on-chain.`;
  }
  return '';
}

function compactTimeRemaining(expiresAt, now = Date.now()) {
  const remaining = Number(expiresAt) - now;
  if (!Number.isFinite(remaining) || remaining <= 0) return 'expired';
  if (remaining >= DAY_MS) return `${Math.ceil(remaining / DAY_MS)}d left`;
  if (remaining >= HOUR_MS) return `${Math.ceil(remaining / HOUR_MS)}h left`;
  return `${Math.ceil(remaining / 60000)}m left`;
}

function milestoneDetail(track, state, lifecycle = {}, now = Date.now()) {
  const target = milestoneTargetLabel(track, state.target);
  if (state.status === 'near') {
    return `${milestoneCurrentLabel(track, state.current)} now`;
  }
  if (state.status === 'crossed') {
    const freshness = lifecycle.expiresAt ? `, ${compactTimeRemaining(lifecycle.expiresAt, now)}` : '';
    return `past ${target}${freshness}`;
  }
  return target;
}

function buildMilestoneSignals(stats = {}) {
  const now = Date.now();
  const momentStore = readMilestoneMomentLog();
  const snapshotReference = dailySnapshotReference();
  let momentLogChanged = momentStore.migrated === true;
  const signals = [];

  MILESTONE_TRACKS.forEach((track) => {
    const current = track.value(stats);
    const thresholds = milestoneThresholds(track);
    const dailyRate = milestoneDailyRate(track, current, momentStore, snapshotReference, now);
    const priorTrack = momentStore.tracks?.[track.id];
    const priorValue = finiteNumber(priorTrack?.lastValue);
    const priorObservedAt = finiteNumber(priorTrack?.lastObservedAt);
    const lifecycle = advanceMilestoneTrack(momentStore, {
      trackId: track.id,
      currentValue: current,
      thresholds,
      now,
      ttlMs: MILESTONE_MOMENT_TTL_MS
    });
    if (lifecycle.changed) momentLogChanged = true;

    const catalogAnchor = generatedMilestoneAnchor(generatedMilestoneCatalog, track.id);
    const catalogMoments = deriveMilestoneMoments({
      currentValue: current,
      thresholds,
      now,
      ttlMs: MILESTONE_MOMENT_TTL_MS,
      anchorValue: catalogAnchor?.current,
      anchorObservedAt: catalogAnchor?.observedAt,
      receipts: generatedMilestoneMoments(generatedMilestoneCatalog, track.id, now)
    });
    const locallyObservedMoments = deriveMilestoneMoments({
      currentValue: current,
      thresholds,
      now,
      ttlMs: MILESTONE_MOMENT_TTL_MS,
      anchorValue: priorValue,
      anchorObservedAt: priorObservedAt
    }).filter(moment => Math.max(0, Number(current) - moment.target) <= (finiteNumber(track.afterWindow) ?? Number.POSITIVE_INFINITY));
    const exactTarget = ['blocks', 'cycle'].includes(track.id)
      ? [...thresholds].reverse().find(value => value <= current)
      : null;
    const exactKey = exactTarget == null ? '' : `${track.id}:${exactTarget}`;
    const exactMoment = exactTarget == null ? null : exactMilestoneMoment(track.id, exactTarget, now);
    const exactBoundaryResolved = exactKey ? exactMilestoneMoments.has(exactKey) : false;
    const activeMoments = new Map();
    const activeMomentCandidates = exactBoundaryResolved
      ? (exactMoment ? [exactMoment] : [])
      : [...lifecycle.activeMoments, ...locallyObservedMoments, ...catalogMoments];
    activeMomentCandidates
      .forEach(moment => activeMoments.set(String(moment.target), moment));

    activeMoments.forEach((moment) => {
      const currentValue = hasMilestoneNumber(current) ? Number(current) : moment.crossedValue;
      const state = {
        status: 'crossed',
        target: moment.target,
        gap: Math.max(0, currentValue - moment.target),
        current: currentValue
      };
      const target = milestoneTargetLabel(track, state.target);
      signals.push(makeSignal('milestone', milestoneScore(track, state), milestoneText(track, state), {
        id: `milestone-${track.id}-${safeCssToken(target)}`,
        title: `${target} ${track.noun}`,
        shortLabel: milestoneShortLabel(track, state.target),
        milestoneTrack: track.id,
        icon: target,
        detail: `${track.detail} - ${milestoneDetail(track, state, moment, now)}`,
        route: track.route,
        tone: 'milestone',
        milestoneStatus: 'crossed',
        kind: 'event',
        breaking: true,
        createdAt: moment.createdAt,
        expiresAt: moment.expiresAt,
        hotOnly: true,
        live: true
      }));
    });

    if (activeMoments.size) return;
    const state = qualifyMilestoneNearState({
      currentValue: current,
      thresholds,
      nearWindow: track.nearWindow,
      dailyRate,
      maxLeadDays: track.nearLeadDays || MILESTONE_NEAR_LEAD_DAYS,
      absoluteMaxDays: MILESTONE_NEAR_MAX_DAYS
    });
    if (!state) return;
    const target = milestoneTargetLabel(track, state.target);
    signals.push(makeSignal('milestone', milestoneScore(track, state), milestoneText(track, state), {
      id: `milestone-${track.id}-${safeCssToken(target)}`,
      title: `${target} ${track.noun}`,
      shortLabel: milestoneShortLabel(track, state.target),
      milestoneTrack: track.id,
      icon: target,
      detail: `${track.detail} - ${milestoneDetail(track, state, {}, now)}`,
      route: track.route,
      tone: 'milestone',
      milestoneStatus: 'near',
      kind: 'state',
      breaking: false,
      createdAt: now,
      hotOnly: true,
      live: true
    }));
  });

  const rankedSignals = signals
    .sort((a, b) => b.score - a.score)
    .slice(0, HOT_SIGNAL_RENDER_CAP);
  if (momentLogChanged) writeMilestoneMomentLog(momentStore);
  return rankedSignals;
}

async function fetchMilestoneJson(url) {
  try {
    return await withTimeout(
      fetch(url, { headers: { Accept: 'application/json' } })
        .then(response => response.ok ? response.json() : null),
      MILESTONE_FETCH_TIMEOUT_MS
    );
  } catch {
    return null;
  }
}

function fillNumber(target, key, value, transform = Number) {
  if (hasMilestoneNumber(target[key])) return;
  const next = transform(value);
  if (hasMilestoneNumber(next)) target[key] = next;
}

async function resolveMilestoneStats(stats = {}) {
  const next = { ...(stats || {}) };
  const tasks = [];

  if (!hasMilestoneNumber(next.totalTransactions)) {
    tasks.push(fetchMilestoneJson(`${API_URLS.tzkt}/operations/transactions/count`)
      .then(value => fillNumber(next, 'totalTransactions', value)));
  }
  if (!hasMilestoneNumber(next.fundedAccounts)) {
    tasks.push(fetchMilestoneJson(`${API_URLS.tzkt}/accounts/count?balance.gt=0`)
      .then(value => fillNumber(next, 'fundedAccounts', value)));
  }
  if (!hasMilestoneNumber(next.smartContracts)) {
    tasks.push(fetchMilestoneJson(`${API_URLS.tzkt}/contracts/count`)
      .then(value => fillNumber(next, 'smartContracts', value)));
  }
  if (!hasMilestoneNumber(next.tokens)) {
    tasks.push(fetchMilestoneJson(`${API_URLS.tzkt}/tokens/count`)
      .then(value => fillNumber(next, 'tokens', value)));
  }
  if (!hasMilestoneNumber(next.rollups)) {
    tasks.push(fetchMilestoneJson(`${API_URLS.tzkt}/smart_rollups/count`)
      .then(value => fillNumber(next, 'rollups', value)));
  }

  const needsStatsCurrent = ['totalBurned', 'totalDelegators', 'totalStakers', 'totalBakers'].some(key => !hasMilestoneNumber(next[key]));
  if (needsStatsCurrent) {
    tasks.push(fetchMilestoneJson(`${API_URLS.tzkt}/statistics/current`).then((snapshot) => {
      if (!snapshot || typeof snapshot !== 'object') return;
      fillNumber(next, 'totalBurned', snapshot.totalBurned, value => Number(value) / 1e6);
      fillNumber(next, 'totalDelegators', snapshot.totalDelegators);
      fillNumber(next, 'totalStakers', snapshot.totalStakers);
      fillNumber(next, 'totalBakers', snapshot.totalBakers);
    }));
  }

  if (tasks.length) await Promise.allSettled(tasks);
  return next;
}

function compactMilestoneStats(stats = {}) {
  const fields = [
    'blockLevel',
    'cycleStartBlock',
    'blocksPerCycle',
    'fundedAccounts',
    'totalTransactions',
    'smartContracts',
    'tokens',
    'rollups',
    'totalBakers',
    'tz4Percentage',
    'stakingRatio',
    'totalBurned',
    'cycle',
    'upgradeCount',
    'protocolCount'
  ];
  return fields.reduce((snapshot, field) => {
    const value = finiteNumber(stats?.[field]);
    if (value != null) snapshot[field] = value;
    return snapshot;
  }, {});
}

function normalizeSignalKind(value) {
  return value === 'event' ? 'event' : 'state';
}

function categoryMeta(category) {
  return CATEGORY_META[category] || CATEGORY_META.network;
}

function normalizeSpectacle(value, signal = {}) {
  const requested = safeCssToken(value || '');
  if (SPECTACLE_LEVELS.includes(requested)) return requested;
  const score = finiteNumber(signal.score) || 0;
  const tone = safeCssToken(signal.tone || '');
  if (signal.category === 'anniversary' || (tone === 'milestone' && signal.milestoneStatus === 'crossed')) return 'historic';
  if (tone === 'milestone' || score >= 115) return signal.kind === 'event' ? 'peacock' : 'headliner';
  if (signal.kind === 'event' || ['capital-hot', 'governance-hot'].includes(tone)) return 'headliner';
  if (score >= 65) return 'curious';
  return 'quiet';
}

function normalizeVisual(value, category = 'network') {
  return safeCssToken(value || categoryMeta(category).visual || category);
}

function isDashboardShell() {
  if (typeof window === 'undefined') return true;
  const path = window.location.pathname.replace(/\/index\.html$/i, '/') || '/';
  return path === '/';
}

function routeFromSiteMapEntry(entry) {
  if (!entry) return '';
  if (isDashboardShell() && entry.hash) return entry.hash;
  return entry.href || entry.hash || '';
}

function siteMapEntryForCategory(key) {
  const siteMapId = NETWORK_FEATURE_SITE_MAP_IDS[safeCssToken(key)];
  return siteMapId ? findSiteMapEntry(siteMapId) : null;
}

function normalizeRoute(value) {
  const route = String(value || '').trim();
  if (!route) return '';
  if (/^(https?:)?\/\//i.test(route)) return route;
  if (route.startsWith('#') || route.startsWith('/') || route.startsWith('?')) return route;
  return `#${route.replace(/^#+/, '')}`;
}

function normalizeDelta(delta) {
  if (!delta || typeof delta !== 'object') return null;
  const value = String(delta.value || '').trim().slice(0, 24);
  if (!value) return null;
  const dir = safeCssToken(delta.dir || 'flat');
  return {
    value,
    dir: ['up', 'down', 'flat'].includes(dir) ? dir : 'flat'
  };
}

function normalizeContext(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 96);
}

function signedDelta(value, unit = '', precision = 1) {
  const number = finiteNumber(value);
  if (number == null) return null;
  const abs = Math.abs(number);
  const formatted = unit === 'count'
    ? Math.round(abs).toLocaleString('en-US')
    : abs.toFixed(precision);
  const suffix = unit && unit !== 'count' ? unit : '';
  return {
    value: `${number > 0 ? '+' : number < 0 ? '-' : ''}${formatted}${suffix}`,
    dir: number > 0 ? 'up' : number < 0 ? 'down' : 'flat'
  };
}

function hasActiveProposalLabel(value) {
  const text = String(value || '').trim();
  return Boolean(text) && !/^(none|null|n\/a|no active proposal)$/i.test(text);
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
  if (story?.domainAlias) add('domains', '.tez identity');
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
    hasDomain: Boolean(story?.domainAlias),
    interests,
    interestKeys: new Set(keys),
    key
  };
}

function scoreBoostFor(category, profile) {
  const keys = profile?.interestKeys || new Set();
  if (category === 'baker' && profile?.hasBaker) return 30;
  if (category === 'tz4' && profile?.hasBaker) return 20;
  if (category === 'governance' && keys.has('governance')) return 22;
  if (category === 'staking' && keys.has('staking')) return 18;
  if (category === 'price' && keys.has('portfolio')) return 16;
  if (category === 'nft' && (keys.has('creator') || keys.has('collector'))) return 18;
  if (category === 'domains' && profile?.hasDomain) return 18;
  if (category === 'contracts' && (keys.has('creator') || keys.has('collector'))) return 12;
  if (category === 'etherlink' && keys.has('portfolio')) return 8;
  if (category === 'ecosystem' && (keys.has('creator') || keys.has('collector'))) return 8;
  if (category === 'whales' && keys.has('portfolio')) return 8;
  return 0;
}

function makeSignal(category, score, text, options = {}) {
  const meta = categoryMeta(category);
  const kind = normalizeSignalKind(options.kind || (options.breaking ? 'event' : 'state'));
  const tone = options.tone || meta.tone;
  const createdAt = finiteNumber(options.createdAt) || Date.now();
  const milestoneStatus = options.milestoneStatus === 'crossed'
    ? 'crossed'
    : options.milestoneStatus === 'near'
      ? 'near'
      : null;
  return {
    id: safeCssToken(options.id || category),
    category,
    kind,
    score,
    text,
    title: options.title || meta.label,
    shortLabel: String(options.shortLabel || options.title || meta.label),
    icon: options.icon || meta.icon,
    detail: options.detail || meta.detail,
    tone,
    visual: normalizeVisual(options.visual || meta.visual, category),
    spectacle: normalizeSpectacle(options.spectacle, { category, kind, score, tone, milestoneStatus }),
    milestoneStatus,
    milestoneTrack: options.milestoneTrack ? safeCssToken(options.milestoneTrack) : null,
    route: normalizeRoute(options.route),
    delta: normalizeDelta(options.delta),
    context: normalizeContext(options.context),
    breaking: options.breaking === true || kind === 'event',
    createdAt,
    observedAt: finiteNumber(options.observedAt) || createdAt,
    startedAt: finiteNumber(options.startedAt),
    expiresAt: finiteNumber(options.expiresAt),
    share: options.share || null,
    valueXtz: finiteNumber(options.valueXtz),
    affectedBakers: Array.isArray(options.affectedBakers)
      ? [...new Set(options.affectedBakers.map(value => String(value || '').trim()).filter(Boolean))]
      : [],
    releaseRadar: options.releaseRadar || null,
    live: options.live === true,
    hotOnly: options.hotOnly === true,
    curio: options.curio === true
  };
}

function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise(resolve => setTimeout(() => resolve(null), timeoutMs))
  ]);
}

function readReleaseRadarLastGood() {
  try {
    return JSON.parse(localStorage.getItem(LS_RELEASE_RADAR_LAST_GOOD) || 'null');
  } catch {
    return null;
  }
}

function writeReleaseRadarLastGood(snapshot) {
  try {
    localStorage.setItem(LS_RELEASE_RADAR_LAST_GOOD, JSON.stringify(snapshot));
  } catch { /* storage full */ }
}

function releaseRadarSignals() {
  return lastReleaseRadarSignal ? [lastReleaseRadarSignal] : [];
}

async function loadReleaseRadarSignal({ force = false } = {}) {
  if (typeof window === 'undefined') return null;
  if (document.visibilityState !== 'visible') return lastReleaseRadarSignal;
  const now = Date.now();
  if (!force && lastReleaseRadarSignal && now - releaseRadarFetchedAt < RELEASE_RADAR_REFRESH_MS) {
    return lastReleaseRadarSignal;
  }
  if (releaseRadarLoadInFlight) return releaseRadarLoadInFlight;

  releaseRadarLoadInFlight = (async () => {
    let snapshot = null;
    let sourceState = 'fresh';
    try {
      const raw = await loadDataAsset('releaseRadar', {
        force: force || releaseRadarFetchedAt > 0
      });
      snapshot = normalizeReleaseRadarSnapshot(raw, { now });
      writeReleaseRadarLastGood(raw);
    } catch (error) {
      const cached = readReleaseRadarLastGood();
      if (cached) {
        const candidate = normalizeReleaseRadarSnapshot(cached, { now });
        const cacheAge = now - candidate.updatedAtMs;
        if (cacheAge <= RELEASE_RADAR_LAST_GOOD_MAX_AGE_MS && candidate.expiresAtMs > now) {
          snapshot = candidate;
          sourceState = 'last-good';
        }
      }
      if (!snapshot && lastReleaseRadarSnapshot
          && now - lastReleaseRadarSnapshot.updatedAtMs <= RELEASE_RADAR_LAST_GOOD_MAX_AGE_MS
          && lastReleaseRadarSnapshot.expiresAtMs > now) {
        snapshot = lastReleaseRadarSnapshot;
        sourceState = 'last-good';
      }
      if (!snapshot) throw error;
    }

    releaseRadarFetchedAt = Date.now();
    const previousFingerprint = lastReleaseRadarSignal
      ? `${lastReleaseRadarSignal.observedAt}|${lastReleaseRadarSignal.releaseRadar?.sourceState}`
      : '';
    lastReleaseRadarSnapshot = snapshot;
    lastReleaseRadarSignal = buildReleaseRadarSignal(snapshot, { now, sourceState });
    const nextFingerprint = lastReleaseRadarSignal
      ? `${lastReleaseRadarSignal.observedAt}|${lastReleaseRadarSignal.releaseRadar?.sourceState}`
      : '';
    if (previousFingerprint !== nextFingerprint && lastStats?.cycle) {
      scheduleHotSignalRender();
      rerenderCachedBriefing();
    }
    return lastReleaseRadarSignal;
  })().catch((error) => {
    console.warn('Release Radar refresh failed; preserving the last-good forecast.', error);
    return lastReleaseRadarSignal;
  }).finally(() => {
    releaseRadarLoadInFlight = null;
  });

  return releaseRadarLoadInFlight;
}

function hotHistoryDay(timestamp = Date.now()) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function readHotHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LS_HOT_HISTORY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeHotHistory(entries) {
  try {
    localStorage.setItem(LS_HOT_HISTORY, JSON.stringify(entries));
  } catch { /* storage full */ }
}

function appendHotHistory(sentences) {
  if (!Array.isArray(sentences) || !sentences.length) return;
  const now = Date.now();
  const cutoff = now - (HOT_HISTORY_DAYS * 24 * 60 * 60 * 1000);
  const normalized = sentences.map(normalizeSignal).filter(signal => signal.text);
  const top = normalized[0];
  if (!top) return;
  const nextEntry = {
    day: hotHistoryDay(now),
    timestamp: now,
    topCategory: top.category,
    topScore: Math.round(Number(top.score) || 0),
    signals: normalized.slice(0, HOT_SIGNAL_RENDER_CAP).map(signal => ({
      category: signal.category,
      score: Math.round(Number(signal.score) || 0)
    }))
  };
  const entries = readHotHistory()
    .filter(entry => Number(entry?.timestamp) >= cutoff)
    .concat(nextEntry)
    .slice(-48);
  writeHotHistory(entries);
}

function hotHistorySummary(currentTop) {
  if (!currentTop) return null;
  const history = readHotHistory();
  if (!history.length) return null;
  const yesterday = hotHistoryDay(Date.now() - 24 * 60 * 60 * 1000);
  const yesterdayEntries = history.filter(entry => entry?.day === yesterday);
  const yesterdayTop = yesterdayEntries.sort((a, b) => (b.topScore || 0) - (a.topScore || 0))[0] || null;

  let chip = '';
  if (yesterdayTop) {
    const yesterdayMeta = categoryMeta(yesterdayTop.topCategory);
    if ((Number(currentTop.score) || 0) > (Number(yesterdayTop.topScore) || 0) + 4) {
      chip = 'hotter than yesterday';
    } else if (yesterdayTop.topCategory !== currentTop.category) {
      chip = `yesterday: ${yesterdayMeta.label}`;
    } else {
      chip = 'steady vs yesterday';
    }
  }

  return { chip };
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

async function fetchNftPulse() {
  const since = new Date(Date.now() - DAY_MS).toISOString();
  const query = `
    query LivePulseObjktSales($since: timestamptz!, $limit: Int!) {
      recent: listing_sale(where: { timestamp: { _gte: $since } }, order_by: { timestamp: desc }, limit: $limit) {
        id
      }
      top: listing_sale(where: { timestamp: { _gte: $since } }, order_by: { price_xtz: desc }, limit: 1) {
        id
        timestamp
        price_xtz
        amount
        ophash
        token {
          name
          fa_contract
          token_id
        }
      }
    }
  `;
  const response = await fetch(OBJKT_GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { since, limit: OBJKT_SALES_SAMPLE_LIMIT } })
  });
  if (!response.ok) return null;
  const payload = await response.json();
  if (payload.errors?.length) return null;
  const recent = Array.isArray(payload.data?.recent) ? payload.data.recent : [];
  const top = Array.isArray(payload.data?.top) ? payload.data.top[0] : null;
  return {
    count: recent.length,
    capped: recent.length >= OBJKT_SALES_SAMPLE_LIMIT,
    top: top ? {
      id: top.id,
      timestamp: top.timestamp,
      priceXtz: (finiteNumber(top.price_xtz) || 0) / 1e6,
      amount: finiteNumber(top.amount) || 1,
      name: top.token?.name || 'OBJKT piece',
      contract: top.token?.fa_contract || '',
      tokenId: top.token?.token_id || '',
      ophash: top.ophash || ''
    } : null
  };
}

function dispatchHotSignal(detail) {
  if (typeof window === 'undefined' || typeof window.CustomEvent !== 'function') return;
  window.dispatchEvent(new CustomEvent('hot-signal', { detail }));
}

function dispatchNftHotSignals(pulse) {
  if (!pulse || !pulse.count) return;
  const top = pulse.top;
  const countLabel = `${formatCount(pulse.count)}${pulse.capped ? '+' : ''}`;
  if (pulse.count >= 50) {
    const topText = top?.priceXtz > 0 ? ` - top sale ${formatTez(top.priceXtz)} XTZ.` : '.';
    dispatchHotSignal({
      id: 'nft-market-pulse',
      category: 'nft',
      kind: 'state',
      visual: 'nft',
      spectacle: 'curious',
      score: 86,
      title: 'NFT pulse',
      detail: 'OBJKT indexed sales',
      text: `${countLabel} OBJKT indexed sales in 24h${topText}`,
      route: '/hen/',
      ttlMs: 4 * HOUR_MS
    });
  }

  const soldAt = top?.timestamp ? new Date(top.timestamp).getTime() : 0;
  const ageMs = Date.now() - soldAt;
  if (top?.priceXtz >= 500 && Number.isFinite(ageMs) && ageMs >= 0 && ageMs < 12 * HOUR_MS) {
    dispatchHotSignal({
      id: `nft-big-sale-${top.id}`,
      category: 'nft',
      kind: 'event',
      visual: 'nft',
      spectacle: top.priceXtz >= 5_000 ? 'peacock' : 'headliner',
      score: 108,
      title: 'Big NFT sale',
      detail: `${formatTez(top.priceXtz)} XTZ`,
      text: `${top.name || 'An OBJKT piece'} sold for ${formatTez(top.priceXtz)} XTZ.`,
      route: '/hen/',
      createdAt: soldAt,
      ttlMs: 12 * HOUR_MS
    });
  }
}

function freshHistoryRowsForDailyCurio(now = Date.now()) {
  const receipt = lastPulseHistoryReceipt;
  const latestAt = finiteNumber(receipt?.latestAt);
  const freshnessLimitMs = finiteNumber(receipt?.freshnessLimitMs);
  const fresh = receipt?.status !== 'unavailable'
    && latestAt != null
    && freshnessLimitMs != null
    && (now - latestAt) <= freshnessLimitMs;
  return fresh && Array.isArray(receipt?.rows) ? receipt.rows : [];
}

async function prepareDailyCurio() {
  if (typeof window === 'undefined' || dailyCurioPreparation) return;
  const today = utcDayKey();
  if (preparedDailyCurio?.day === today || activeDailyCurio?.day === today) return;
  if (safeLocalStorageGet(LS_DAILY_CURIO_DAY) === today) return;

  const preparation = (async () => {
    let protocols = [];
    try {
      const data = await loadDataAsset('protocolData');
      protocols = Array.isArray(data?.protocols) ? data.protocols : [];
    } catch {
      // Protocol lore is optional; the Curio can still use already-loaded network facts.
    }

    if (utcDayKey() !== today) return;
    const now = Date.now();
    const candidate = chooseDailyCurio({
      dayKey: today,
      protocols,
      historyRows: freshHistoryRowsForDailyCurio(now),
      totalBakers: finiteNumber(lastStats?.totalBakers),
      uptime: getTezosUptimeAnniversary(now),
      upgradeCount: finiteNumber(lastStats?.upgradeCount)
        ?? finiteNumber(lastStats?.protocolCount)
        ?? CANONICAL_UPGRADE_COUNT
    });
    const endOfDay = Date.parse(`${today}T23:59:59.999Z`);
    preparedDailyCurio = {
      day: today,
      signal: candidate ? makeSignal('network', LIVE_PULSE_CURIO_SCORE, candidate.text, {
        id: candidate.id,
        icon: candidate.icon,
        title: candidate.title,
        detail: candidate.detail,
        route: candidate.route,
        kind: 'state',
        spectacle: 'curious',
        hotOnly: true,
        curio: true,
        createdAt: now,
        observedAt: now,
        expiresAt: Number.isFinite(endOfDay) ? endOfDay : now + DAY_MS
      }) : null
    };
    if (preparedDailyCurio.signal) scheduleHotSignalRender();
  })();
  dailyCurioPreparation = preparation;
  try {
    await preparation;
  } finally {
    if (dailyCurioPreparation === preparation) dailyCurioPreparation = null;
    if (utcDayKey() !== today) void prepareDailyCurio();
  }
}

function appendDailyCurio(baseSignals = []) {
  if (baseSignals.length >= LIVE_PULSE_CURIO_MAX_BASE_SIGNALS) return baseSignals;
  const today = utcDayKey();
  const storedDay = safeLocalStorageGet(LS_DAILY_CURIO_DAY) || '';
  const active = activeDailyCurio?.day === today ? activeDailyCurio : null;
  const prepared = preparedDailyCurio?.day === today ? preparedDailyCurio : null;
  if (!shouldOfferDailyCurio({
    baseSignalCount: baseSignals.length,
    storedDay,
    activeDay: active?.day || '',
    today
  })) return baseSignals;

  const daily = active || prepared;
  if (!daily?.signal) return baseSignals;
  if (!active) {
    activeDailyCurio = daily;
    safeLocalStorageSet(LS_DAILY_CURIO_DAY, today);
  }
  return baseSignals.some(signal => signal.id === daily.signal.id)
    ? baseSignals
    : [...baseSignals, daily.signal];
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
      tone: pct24h >= 0 ? 'market-up' : 'market-down',
      spectacle: absPct24h >= 4 ? 'headliner' : absPct24h >= 1 ? 'curious' : 'quiet',
      delta: signedDelta(pct24h, '%', 1)
    });
  }

  // STAKING
  if (stats.stakingRatio != null) {
    const prev  = baseline?.stakingRatio ?? stats.stakingRatio;
    const delta = stats.stakingRatio - prev;
    const score = Math.abs(delta) > 0.5 ? 80 : Math.abs(delta) > 0.1 ? 50 : 35;
    addSignal('staking', score, pick(TEMPLATES.staking)({ ratio: stats.stakingRatio.toFixed(1), delta }), {
      detail: Math.abs(delta) > 0.1 ? `${delta > 0 ? '+' : ''}${delta.toFixed(2)} percentage points vs baseline` : 'Staking share is steady',
      tone: delta >= 0 ? 'staking' : 'watch',
      delta: signedDelta(delta, 'pp', 2)
    });
  }

  // VOLUME
  if (stats.transactionVolume24h != null) {
    const prev  = baseline?.transactionVolume24h ?? stats.transactionVolume24h;
    const sp    = signedPct(stats.transactionVolume24h, prev);
    const narrative = activityNarrative(sp);
    const score = Math.abs(sp) > 20 ? 85 : Math.abs(sp) > 10 ? 60 : 30;
    addSignal('volume', score, pick(TEMPLATES.volume)({ vol: stats.transactionVolume24h, ...narrative }), {
      detail: narrative.isMeaningful ? 'Activity changed meaningfully' : 'Activity baseline',
      tone: narrative.tone,
      spectacle: Math.abs(sp) > 20 ? 'headliner' : narrative.isMeaningful ? 'curious' : 'quiet',
      delta: signedDelta(sp, '%', 1)
    });
  }

  // CONTRACTS
  if (stats.contractCalls24h != null) {
    const prev  = baseline?.contractCalls24h ?? stats.contractCalls24h;
    const delta = stats.contractCalls24h - prev;
    const score = Math.abs(delta) > 5000 ? 70 : 40;
    addSignal('contracts', score, pick(TEMPLATES.contracts)({ count: stats.contractCalls24h, delta }), {
      detail: Math.abs(delta) > 1000 ? `${delta > 0 ? '+' : ''}${delta.toLocaleString()} calls vs baseline` : 'App usage baseline',
      tone: delta >= 0 ? 'activity' : 'quiet',
      spectacle: Math.abs(delta) > 5000 ? 'headliner' : Math.abs(delta) > 1000 ? 'curious' : 'quiet',
      delta: signedDelta(delta, 'count')
    });
  }

  // WHALES
  {
    const score = whales.top >= 1_000_000
      ? 124
      : whales.top >= 250_000
        ? 108
        : whales.count > 10
          ? 88
          : whales.count > 5
            ? 70
            : whales.count > 0
              ? 50
              : 20;
    const tmpl  = whales.count > 0 && whales.top > 0 ? pick(TEMPLATES.whales) : TEMPLATES.whales[0];
    addSignal('whales', score, tmpl({ count: whales.count, top: whales.top }), {
      detail: whales.top > 0 ? `Largest move ${whales.top.toLocaleString()} XTZ` : 'No major transfer spike',
      tone: whales.count > 10 ? 'capital-hot' : whales.count > 0 ? 'capital' : 'quiet',
      visual: 'whale',
      valueXtz: whales.top,
      spectacle: whales.top >= 1_000_000 ? 'peacock' : whales.top >= 250_000 ? 'headliner' : whales.count > 0 ? 'curious' : 'quiet'
    });
  }

  // GOVERNANCE
  if (hasActiveProposalLabel(stats.proposal)) {
    const pct = stats.participation != null ? stats.participation.toFixed(1) : '?';
    addSignal('governance', 75, pick(TEMPLATES.governance.slice(0, 2).concat([TEMPLATES.governance[3], TEMPLATES.governance[4]]))(
      { proposal: stats.proposal, period: stats.votingPeriod || 'current', pct, participation: pct }), {
      detail: 'Live governance period',
      tone: 'governance-hot'
    });
  } else {
    addSignal('governance', 30, TEMPLATES.governance[2]({ name: stats.lastUpgradeName || 'Ushuaia' }), {
      detail: 'No active protocol vote',
      tone: 'quiet'
    });
  }

  // ECOSYSTEM
  if (stats.fundedAccounts != null) {
    const prev  = baseline?.fundedAccounts ?? stats.fundedAccounts;
    const delta = stats.fundedAccounts - prev;
    const n     = Math.max(delta, stats.newAccounts24h || 0);
    const score = delta > 1000 ? 65 : delta > 200 ? 45 : 25;
    addSignal('ecosystem', score, pick(TEMPLATES.ecosystem)({ n, bakers: stats.totalBakers || '?' }), {
      detail: n > 200 ? 'New accounts worth noticing' : 'Onboarding baseline',
      tone: n > 200 ? 'growth' : 'quiet',
      spectacle: n > 1000 ? 'headliner' : n > 200 ? 'curious' : 'quiet'
    });
  }

  // BAKER (personal)
  if (bakerStats) {
    const score = bakerStats.missed > 0 ? 95 : 55;
    const tmpl  = bakerStats.missed > 0 ? TEMPLATES.baker[1] : pick([TEMPLATES.baker[0], TEMPLATES.baker[2]]);
    addSignal('baker', score, tmpl({ pct: bakerStats.attestPct, missed: bakerStats.missed }), {
      detail: bakerStats.missed > 0 ? 'Personal baker watch item' : 'Personal baker check',
      tone: bakerStats.missed > 0 ? 'watch' : 'operator',
      spectacle: bakerStats.missed > 0 ? 'headliner' : 'curious'
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
  await loadGeneratedMilestoneCatalog();
  const sourceStats = stats || {};
  const cycle = sourceStats.cycle ?? 0;
  const profile = getCurrentMyTezosProfile();
  const [priceContext] = await Promise.all([
    resolvePriceContext(sourceStats, xtzPrice),
    resolveExactBlockMilestoneMoment(sourceStats),
    resolveExactCycleMilestoneMoment(sourceStats)
  ]);
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
      const schemaChanged = cached.schema !== BRIEFING_SCHEMA_VERSION;
      const hasExpiredSignals = Array.isArray(cached.sentences)
        && cached.sentences.some(signal => signalIsExpired(signal));
      // Regenerate if: >4 hours old, price shifted >2%, or the real 24h move changed enough to affect narrative.
      const isStale = schemaChanged || hasExpiredSignals || ageHrs > 4 || priceDrift > 0.02 || profileChanged || missingLiveMove || changeDrift > 0.75 || crossedSteadyBoundary;
      if (!isStale) {
        lastMilestoneStats = {
          ...(cached.milestoneStats && typeof cached.milestoneStats === 'object' ? cached.milestoneStats : {}),
          ...compactMilestoneStats(nextStats)
        };
        return cached;
      }
    }
  } catch { /* ignore */ }

  const baseline = (() => { try { return JSON.parse(localStorage.getItem(LS_BASELINE) || 'null'); } catch { return null; } })();

  const [milestoneStats, whales, bakerStats, nftPulse] = await Promise.all([
    resolveMilestoneStats(nextStats),
    fetchWhaleCount(),
    fetchBakerStats(localStorage.getItem('tezos-systems-my-baker-address'), cycle),
    withTimeout(fetchNftPulse(), NFT_FETCH_TIMEOUT_MS),
  ]);
  dispatchNftHotSignals(nftPulse);
  lastMilestoneStats = compactMilestoneStats(milestoneStats);

  const sentences = buildSentences(milestoneStats, currentPrice, baseline, whales, bakerStats, profile);
  const briefing  = {
    schema: BRIEFING_SCHEMA_VERSION,
    cycle,
    sentences,
    milestoneStats: lastMilestoneStats,
    generatedAt: Date.now(),
    priceAt: currentPrice,
    priceChange24h: currentChange24h,
    profileKey: profile.key
  };

  try {
    localStorage.setItem(LS_BRIEFING,  JSON.stringify(briefing));
    localStorage.setItem(LS_BASELINE,  JSON.stringify({ ...milestoneStats, xtzPrice: currentPrice }));
    appendHotHistory(sentences);
  } catch { /* storage full */ }

  return briefing;
}

// ─── Public API ───────────────────────────────────────────────────────────────

function safeCssToken(value) {
  return String(value || 'network').replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'network';
}

function networkFeatureRoute(key) {
  const category = safeCssToken(key);
  const entryRoute = routeFromSiteMapEntry(siteMapEntryForCategory(category));
  return entryRoute || NETWORK_FEATURE_FALLBACK_ROUTES[category] || NETWORK_FEATURE_FALLBACK_ROUTES.network;
}

function networkFeatureLabel(key) {
  const category = safeCssToken(key);
  const entry = siteMapEntryForCategory(category);
  if (entry?.title) return `Open ${entry.title}`;
  return NETWORK_FEATURE_FALLBACK_LABELS[category] || NETWORK_FEATURE_FALLBACK_LABELS.network;
}

function routeForSignal(signal) {
  return normalizeRoute(signal?.route) || networkFeatureRoute(signal?.category);
}

function labelForSignal(signal) {
  return signal?.route ? String(signal.title || 'Open live signal') : networkFeatureLabel(signal?.category);
}

function normalizeSignal(signal, index = 0) {
  if (typeof signal === 'string') {
    return makeSignal('network', 20 - index, signal);
  }
  const category = safeCssToken(signal?.category || 'network');
  const meta = categoryMeta(category);
  const kind = normalizeSignalKind(signal?.kind || (signal?.breaking ? 'event' : 'state'));
  const tone = safeCssToken(signal?.tone || meta.tone);
  const milestoneStatus = signal?.milestoneStatus === 'crossed'
    ? 'crossed'
    : signal?.milestoneStatus === 'near'
      ? 'near'
      : null;
  const score = finiteNumber(signal?.score) ?? (20 - index);
  const createdAt = finiteNumber(signal?.createdAt) || Date.now();
  return {
    id: safeCssToken(signal?.id || category),
    category,
    kind,
    score,
    text: String(signal?.text || ''),
    title: String(signal?.title || meta.label),
    shortLabel: String(signal?.shortLabel || signal?.title || meta.label),
    icon: String(signal?.icon || meta.icon),
    detail: String(signal?.detail || meta.detail),
    tone,
    visual: normalizeVisual(signal?.visual || meta.visual, category),
    spectacle: normalizeSpectacle(signal?.spectacle, { category, kind, score, tone, milestoneStatus }),
    milestoneStatus,
    milestoneTrack: signal?.milestoneTrack ? safeCssToken(signal.milestoneTrack) : null,
    route: normalizeRoute(signal?.route),
    delta: normalizeDelta(signal?.delta),
    context: normalizeContext(signal?.context),
    breaking: signal?.breaking === true || kind === 'event',
    createdAt,
    observedAt: finiteNumber(signal?.observedAt) || createdAt,
    startedAt: finiteNumber(signal?.startedAt),
    expiresAt: finiteNumber(signal?.expiresAt),
    share: signal?.share || null,
    valueXtz: finiteNumber(signal?.valueXtz),
    affectedBakers: Array.isArray(signal?.affectedBakers)
      ? [...new Set(signal.affectedBakers.map(value => String(value || '').trim()).filter(Boolean))]
      : [],
    releaseRadar: signal?.releaseRadar || null,
    live: signal?.live === true,
    hotOnly: signal?.hotOnly === true,
    curio: signal?.curio === true
  };
}

function compactMoney(value) {
  const number = finiteNumber(value);
  if (number == null) return '';
  return number.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: Math.abs(number) >= 1_000_000 ? 'compact' : 'standard',
    maximumFractionDigits: Math.abs(number) >= 1_000_000 ? 1 : 0
  });
}

function latestReceiptRow(source) {
  if (source?.status !== 'available' || !source?.fresh || !Array.isArray(source.rows) || !source.rows.length) return null;
  return source.rows[source.rows.length - 1] || null;
}

function pulseHistoryContext(rows, column, current, options = {}) {
  const descriptor = describePulseSeries(rows, column, current, options);
  return pulseSeriesContextLine(descriptor, options);
}

function coreSignalHistoryContext(signal) {
  if (lastPulseHistoryReceipt?.status !== 'available' || !lastPulseHistoryReceipt?.fresh) return '';
  const rows = lastPulseHistoryReceipt.rows || [];
  const mappings = {
    'live-volume': ['tx_volume_24h', finiteNumber(lastStats?.transactionVolume24h), 'flow', { relativeThreshold: 12 }],
    'live-contracts': ['contract_calls_24h', finiteNumber(lastStats?.contractCalls24h), 'flow', { relativeThreshold: 12 }],
    'live-accounts': ['new_accounts_24h', finiteNumber(lastStats?.newAccounts24h), 'flow', { relativeThreshold: 15 }],
    'daily-tz4-switches': ['tz4_power_pct', finiteNumber(lastStats?.tz4Percentage), 'ratio', { pointThreshold: 0.5 }],
    'daily-staking-apy-shift': ['staking_apy_stake', finiteNumber(lastStats?.stakeAPY), 'ratio', { pointThreshold: 0.2 }],
    'daily-lb-ema-drift': ['lb_ema_pct', finiteNumber(lastStats?.lbEmaPct), 'ratio', { pointThreshold: 1 }],
    'daily-lb-subsidy-flip': ['lb_ema_pct', finiteNumber(lastStats?.lbEmaPct), 'ratio', { pointThreshold: 1 }]
  };
  const mapping = mappings[signal.id];
  if (!mapping || mapping[1] == null) return '';
  const [column, current, mode, options] = mapping;
  return pulseHistoryContext(rows, column, current, { mode, ...options });
}

function enrichSignalWithPulseContext(input) {
  const signal = normalizeSignal(input);
  let context = signal.context || coreSignalHistoryContext(signal);
  let detail = signal.detail;
  let startedAt = signal.startedAt;
  let observedAt = signal.observedAt;

  if (signal.id.startsWith('daily-')) {
    const snapshot = dailySnapshotReference();
    startedAt ||= finiteNumber(snapshot?.capturedAt);
    observedAt = parsedTimestamp(lastStats?._quality?.observedAt, observedAt);
  }

  if (signal.category === 'price') {
    const source = lastPulseDomainReceipt?.sources?.market;
    const latest = latestReceiptRow(source);
    if (latest) {
      const volume = compactMoney(latest.volume_24h_usd);
      const marketCap = compactMoney(latest.market_cap_usd);
      const marketParts = [
        signal.detail,
        volume ? `${volume} 24h volume` : '',
        marketCap ? `${marketCap} market cap` : ''
      ].filter(Boolean);
      detail = marketParts.join(' · ');
      context ||= pulseHistoryContext(
        source.rows,
        'volume_24h_usd',
        latest.volume_24h_usd,
        { mode: 'flow', relativeThreshold: 15 }
      );
    }
  }

  return {
    ...signal,
    detail: String(detail || '').slice(0, 132),
    context: normalizeContext(context),
    startedAt,
    observedAt
  };
}

function governancePeriodSignal(stats = {}) {
  const source = lastPulseDomainReceipt?.sources?.governance;
  const latest = latestReceiptRow(source);
  if (governanceAlertStripVisible()) return null;
  const rawKind = String(latest?.period_kind || stats.govPeriodKind || '').toLowerCase();
  if (!rawKind) return null;
  const kind = rawKind === 'testing' ? 'cooldown' : rawKind;
  const periodLabels = {
    proposal: 'Proposal',
    exploration: 'Exploration',
    cooldown: 'Cooldown',
    promotion: 'Promotion',
    adoption: 'Adoption'
  };
  const period = periodLabels[kind] || String(stats.votingPeriod || 'Governance');
  const proposal = String(stats.govProposalName || (hasActiveProposalLabel(stats.proposal) ? stats.proposal : latest?.proposal) || '').trim();
  const historyDaysLeft = Math.max(0, Math.ceil((Date.parse(latest?.period_end || '') - Date.now()) / DAY_MS));
  const daysLeft = Number.isFinite(historyDaysLeft)
    ? historyDaysLeft
    : finiteNumber(stats.participationDaysLeft);
  const timing = Number.isFinite(daysLeft) ? `${daysLeft} day${daysLeft === 1 ? '' : 's'} left` : 'Current governance period';
  let text = '';
  let detail = timing;

  if (kind === 'proposal') {
    text = proposal
      ? `"${proposal}" leads the open proposal-selection window.`
      : 'Protocol proposal submissions are open.';
    detail = `${timing} · no ballot yet`;
  } else if (kind === 'exploration' || kind === 'promotion') {
    const participation = finiteNumber(latest?.participation_pct) ?? finiteNumber(stats.participation);
    const voters = finiteNumber(latest?.voters_voted);
    text = proposal
      ? `"${proposal}" is in the ${period} ballot.`
      : `The ${period} ballot is open.`;
    detail = participation != null
      ? `${participation.toFixed(1)}% participation · ${timing}`
      : voters != null
        ? `${formatCount(voters)} voters · ${timing}`
        : timing;
  } else if (kind === 'cooldown') {
    text = proposal
      ? `"${proposal}" is in testing and review before the final vote.`
      : 'Governance is in its testing and review period.';
    detail = `${timing} · no ballot in this period`;
  } else if (kind === 'adoption') {
    text = proposal
      ? `"${proposal}" is in activation preparation.`
      : 'The accepted protocol is in activation preparation.';
    detail = `${timing} · no ballot in this period`;
  } else {
    return null;
  }

  return makeSignal('governance', 118, text, {
    id: `live-governance-${kind || 'period'}`,
    title: `${period} period`,
    detail,
    tone: 'governance-hot',
    startedAt: parsedTimestamp(latest?.period_start),
    observedAt: parsedTimestamp(latest?.timestamp, parsedTimestamp(stats?._quality?.observedAt)),
    expiresAt: parsedTimestamp(latest?.period_end),
    live: true
  });
}

function addDomainHistorySignals(signals, stats = {}) {
  const governance = governancePeriodSignal(stats);
  if (governance) signals.push(governance);

  const healthSource = lastPulseDomainReceipt?.sources?.networkHealth;
  const health = latestReceiptRow(healthSource);
  const maxRound = finiteNumber(health?.max_round);
  const missedBlocks = finiteNumber(health?.missed_blocks);
  if (health && ((maxRound != null && maxRound >= 1) || (missedBlocks != null && missedBlocks >= 3))) {
    const exceptions = [
      maxRound != null && maxRound >= 1 ? `round ${Math.round(maxRound)}` : '',
      missedBlocks != null && missedBlocks >= 3 ? `${Math.round(missedBlocks)} missed blocks` : ''
    ].filter(Boolean);
    signals.push(makeSignal('security', 112, `The latest consensus-health sample recorded ${exceptions.join(' and ')}.`, {
      id: 'live-consensus-exception',
      title: 'Consensus exception',
      detail: 'Exceptional read, not the routine baseline',
      route: '#health',
      observedAt: parsedTimestamp(health.timestamp),
      expiresAt: parsedTimestamp(health.timestamp, 0) + (healthSource.freshnessLimitMs || 0),
      live: true
    }));
  }

  const tezosxSource = lastPulseDomainReceipt?.sources?.tezosx;
  const tezosx = latestReceiptRow(tezosxSource);
  if (tezosx) {
    const transactions = finiteNumber(tezosx.transactions_24h);
    const context = transactions == null ? '' : pulseHistoryContext(
      tezosxSource.rows,
      'transactions_24h',
      transactions,
      { mode: 'flow', relativeThreshold: 15 }
    );
    if (transactions != null && context) {
      signals.push(makeSignal('etherlink', 88, `${formatCount(transactions)} Etherlink transactions landed in the latest 24-hour read.`, {
        id: 'etherlink-throughput',
        title: 'Etherlink throughput',
        detail: 'Tezos L2 activity',
        route: '/tezosx/',
        context,
        observedAt: parsedTimestamp(tezosx.timestamp),
        live: true
      }));
    }
  }
}

function governanceAlertStripVisible() {
  const strip = typeof document !== 'undefined' ? document.getElementById('governance-alert-strip') : null;
  return Boolean(strip && !strip.hidden && strip.textContent.trim());
}

function addDailyDeltaSignals(signals, stats = {}) {
  const snapshot = dailySnapshotReference();
  const previous = snapshot?.stats;
  if (!previous) return;
  const since = snapshotSinceLabel(snapshot);
  const tz4Delta = snapshotDelta(stats, previous, 'tz4Bakers');
  const bakerDelta = snapshotDelta(stats, previous, 'totalBakers');
  const delegatorDelta = snapshotDelta(stats, previous, 'totalDelegators');
  const stakerDelta = snapshotDelta(stats, previous, 'totalStakers');
  const burnDelta = snapshotDelta(stats, previous, 'totalBurned');
  const contractDelta = snapshotDelta(stats, previous, 'smartContracts');
  const stakeApyDelta = snapshotDelta(stats, previous, 'stakeAPY');
  const lbEmaDelta = snapshotDelta(stats, previous, 'lbEmaPct');
  const lbEma = finiteNumber(stats?.lbEmaPct);
  const tz4Pct = finiteNumber(stats?.tz4Percentage);

  if (tz4Delta != null && tz4Delta >= 1) {
    signals.push(makeSignal('tz4', 108, `${formatCount(tz4Delta)} baker${Math.round(tz4Delta) === 1 ? '' : 's'} switched to tz4 consensus keys ${since} - adoption at ${tz4Pct == null ? '--' : tz4Pct.toFixed(1)}%.`, {
      id: 'daily-tz4-switches',
      kind: 'event',
      title: 'tz4 switches',
      detail: 'BLS consensus keys',
      route: '/tz4/',
      delta: signedDelta(tz4Delta, 'count'),
      live: true
    }));
  }

  if (bakerDelta != null && Math.abs(bakerDelta) >= 1) {
    const abs = Math.abs(Math.round(bakerDelta));
    signals.push(makeSignal('security', 104, bakerDelta > 0
      ? `${formatCount(abs)} new baker${abs === 1 ? '' : 's'} registered ${since}.`
      : `${formatCount(abs)} baker${abs === 1 ? '' : 's'} retired ${since}.`, {
      id: 'daily-baker-registrations',
      kind: 'event',
      title: bakerDelta > 0 ? 'Baker registrations' : 'Baker exits',
      detail: 'Active baker set',
      route: '#leaderboard',
      delta: signedDelta(bakerDelta, 'count'),
      live: true
    }));
  }

  if (delegatorDelta != null && Math.abs(delegatorDelta) >= 50) {
    const abs = Math.abs(Math.round(delegatorDelta));
    signals.push(makeSignal('staking', 86, delegatorDelta > 0
      ? `${formatCount(abs)} accounts started delegating ${since}.`
      : `${formatCount(abs)} fewer accounts are delegating ${since}.`, {
      id: 'daily-delegator-flow',
      title: 'Delegator flow',
      detail: 'Delegation movement',
      route: '#calculator',
      delta: signedDelta(delegatorDelta, 'count'),
      live: true
    }));
  }

  if (stakerDelta != null && Math.abs(stakerDelta) >= 20) {
    const abs = Math.abs(Math.round(stakerDelta));
    signals.push(makeSignal('staking', 85, stakerDelta > 0
      ? `${formatCount(abs)} new staker${abs === 1 ? '' : 's'} locked tez ${since}.`
      : `${formatCount(abs)} fewer staker${abs === 1 ? '' : 's'} are locked ${since}.`, {
      id: 'daily-staker-flow',
      title: 'Staker flow',
      detail: 'Staking movement',
      route: '#staking',
      delta: signedDelta(stakerDelta, 'count'),
      live: true
    }));
  }

  if (burnDelta != null && burnDelta >= 5000) {
    signals.push(makeSignal('network', 84, `${formatTez(burnDelta)} XTZ burned ${since}.`, {
      id: 'daily-burn-tracker',
      title: 'Burn tracker',
      detail: 'Protocol burn flow',
      route: '#section=economy',
      delta: signedDelta(burnDelta, 'count'),
      live: true
    }));
  }

  if (contractDelta != null && contractDelta >= 5) {
    signals.push(makeSignal('contracts', 82, `${formatCount(contractDelta)} new smart contract${Math.round(contractDelta) === 1 ? '' : 's'} deployed ${since}.`, {
      id: 'daily-contract-deployments',
      title: 'Contract deployments',
      detail: 'App surface growth',
      route: '#section=ecosystem',
      delta: signedDelta(contractDelta, 'count'),
      live: true
    }));
  }

  const stakeApy = finiteNumber(stats?.stakeAPY);
  if (stakeApy != null && stakeApyDelta != null && Math.abs(stakeApyDelta) >= 0.1) {
    signals.push(makeSignal('staking', 80, `Staking APY moved to ${stakeApy.toFixed(2)}% (${stakeApyDelta >= 0 ? '+' : ''}${stakeApyDelta.toFixed(2)}pp ${since}).`, {
      id: 'daily-staking-apy-shift',
      title: 'APY shift',
      detail: 'Reward estimate',
      route: '#calculator',
      delta: signedDelta(stakeApyDelta, 'pp', 2),
      live: true
    }));
  }

  if (typeof stats?.lbSubsidyDisabled === 'boolean' && typeof previous.lbSubsidyDisabled === 'boolean' && stats.lbSubsidyDisabled !== previous.lbSubsidyDisabled) {
    signals.push(makeSignal('lb', 122, `Liquidity Baking subsidy just switched ${stats.lbSubsidyDisabled ? 'OFF' : 'ON'} - EMA crossed the threshold.`, {
      id: 'daily-lb-subsidy-flip',
      kind: 'event',
      title: 'LB subsidy flip',
      detail: stats.lbSubsidyDisabled ? 'Subsidy disabled' : 'Subsidy active',
      route: '/lb/',
      live: true
    }));
  }

  if (lbEma != null && lbEmaDelta != null && Math.abs(lbEmaDelta) >= 1) {
    signals.push(makeSignal('lb', 78, `LB toggle EMA at ${lbEma.toFixed(1)}% (${lbEmaDelta >= 0 ? '+' : ''}${lbEmaDelta.toFixed(1)}pp ${since}) - subsidy ${stats?.lbSubsidyDisabled ? 'off' : 'active'}.`, {
      id: 'daily-lb-ema-drift',
      title: 'LB EMA drift',
      detail: 'Toggle vote pressure',
      route: '/lb/',
      delta: signedDelta(lbEmaDelta, 'pp', 1),
      live: true
    }));
  }

  const cycleProgress = finiteNumber(stats?.cycleProgress);
  if (cycleProgress != null && cycleProgress >= 95) {
    const cycle = finiteNumber(stats?.cycle);
    const runway = String(stats?.cycleTimeRemaining || '').trim() || 'rewards settle at the boundary';
    signals.push(makeSignal('cycle', 96, `Cycle ${cycle ? formatCount(cycle) : 'current'} wraps soon - ${runway}.`, {
      id: `cycle-boundary-${cycle || 'current'}`,
      kind: 'event',
      title: 'Cycle boundary',
      detail: `${cycleProgress.toFixed(1)}% complete`,
      route: '#health',
      live: true
    }));
  }
}

function buildLiveHotSignals(stats = lastStats || {}) {
  const milestoneStats = { ...lastMilestoneStats, ...(stats || {}) };
  const priceChange = finiteNumber(stats?.priceChange24h);
  const newAccounts = finiteNumber(stats?.newAccounts24h);
  const fundedAccounts = finiteNumber(stats?.fundedAccounts);
  const signals = [];
  const uptimeAnniversary = getTezosUptimeAnniversary();

  addDailyDeltaSignals(signals, stats);
  signals.push(...buildMilestoneSignals(milestoneStats));
  addDomainHistorySignals(signals, stats);

  if (uptimeAnniversary.isAnniversary) {
    signals.push(makeSignal('anniversary', 180, uptimeAnniversary.hotText, {
      id: `uptime-anniversary-${uptimeAnniversary.years}`,
      kind: 'state',
      breaking: true,
      title: `${uptimeAnniversary.ordinalYears} mainnet anniversary`,
      detail: uptimeAnniversary.detail,
      route: '/anthology/',
      tone: 'anniversary',
      createdAt: uptimeAnniversary.startsAt,
      expiresAt: uptimeAnniversary.endsAt,
      live: true
    }));
  }

  if (stats?.contractCalls24h != null) {
    signals.push(makeSignal('contracts', 106, `${Number(stats.contractCalls24h).toLocaleString('en-US')} contract calls in the last 24h.`, {
      id: 'live-contracts',
      title: 'Contract calls',
      detail: 'App and DeFi pulse',
      tone: 'activity',
      observedAt: pulseFieldObservedAt('contractCalls24h'),
      live: true
    }));
  }

  if (stats?.transactionVolume24h != null) {
    signals.push(makeSignal('volume', 102, `${Number(stats.transactionVolume24h).toLocaleString('en-US')} transactions moved through Tezos in the last 24h.`, {
      id: 'live-volume',
      title: 'Chain activity',
      detail: 'Transaction flow',
      tone: 'activity',
      observedAt: pulseFieldObservedAt('transactionVolume24h'),
      live: true
    }));
  }

  if (newAccounts != null && newAccounts > 0) {
    signals.push(makeSignal('ecosystem', 98, `${Math.round(newAccounts).toLocaleString('en-US')} new funded accounts appeared in the current read.`, {
      id: 'live-accounts',
      title: 'Fresh accounts',
      detail: 'Onboarding signal',
      tone: newAccounts > 200 ? 'growth' : 'quiet',
      observedAt: pulseFieldObservedAt('newAccounts24h'),
      live: true
    }));
  } else if (fundedAccounts != null && fundedAccounts > 0) {
    signals.push(makeSignal('ecosystem', 92, `${Math.round(fundedAccounts).toLocaleString('en-US')} funded accounts are visible on-chain.`, {
      id: 'live-accounts',
      title: 'Funded accounts',
      detail: 'Network reach',
      tone: 'growth',
      observedAt: pulseFieldObservedAt('fundedAccounts'),
      live: true
    }));
  }

  if (lastXtzPrice && lastXtzPrice > 0 && priceChange != null && Math.abs(priceChange) >= 1) {
    signals.push(makeSignal('price', 94, `XTZ moved ${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(1)}% over 24h.`, {
      id: 'live-market',
      detail: `Trading around $${fmtPrice(lastXtzPrice)}`,
      tone: priceChange >= 0 ? 'market-up' : 'market-down',
      delta: signedDelta(priceChange, '%', 1),
      observedAt: parsedTimestamp(stats?._quality?.observedAt),
      live: true
    }));
  }
  return signals.filter(signal => signal.text);
}

function liveCandidateFingerprint(stats = {}) {
  const fields = [
    'cycle', 'blockLevel', 'cycleProgress', 'contractCalls24h', 'transactionVolume24h',
    'newAccounts24h', 'fundedAccounts', 'priceChange24h', 'proposal', 'govPeriodKind',
    'participation', 'participationDaysLeft', 'tz4Bakers', 'tz4Percentage', 'totalBakers',
    'totalDelegators', 'totalStakers', 'totalBurned', 'smartContracts', 'stakeAPY',
    'lbEmaPct', 'lbSubsidyDisabled'
  ];
  return JSON.stringify({
    history: pulseHistoryRevision,
    price: finiteNumber(lastXtzPrice),
    snapshot: dailySnapshotReference()?.capturedAt || 0,
    values: Object.fromEntries(fields.map(field => [field, stats?.[field] ?? null]))
  });
}

function getLiveCandidateSignals(stats = lastStats || {}) {
  const fingerprint = liveCandidateFingerprint(stats);
  if (fingerprint === lastLiveCandidateFingerprint) return lastLiveCandidates;
  lastLiveCandidateFingerprint = fingerprint;
  lastLiveCandidates = buildLiveHotSignals(stats).map(enrichSignalWithPulseContext);
  return lastLiveCandidates;
}

function pruneExpiredHotSignals(now = Date.now()) {
  let pruned = false;
  hotSignalPool.forEach((signal, id) => {
    if (signal.expiresAt && signal.expiresAt <= now) {
      hotSignalPool.delete(id);
      pruned = true;
    }
  });
  return pruned;
}

function hotPoolSignals() {
  pruneExpiredHotSignals();
  return Array.from(hotSignalPool.values())
    .map(normalizeSignal)
    .filter(signal => signal.text);
}

function hotSignalPayload(signal) {
  if (!signal) return null;
  return {
    ...signal,
    route: routeForSignal(signal),
    routeLabel: labelForSignal(signal)
  };
}

function getMilestoneHotSignal(signals = hotTodaySignals) {
  const now = Date.now();
  const milestones = (signals || [])
    .filter(signal => signal?.tone === 'milestone' && !signalIsExpired(signal, now));
  return milestones.find(signal => signal.milestoneStatus === 'crossed') || milestones[0] || null;
}

function scheduleHotSignalExpiryRefresh(signals = hotTodaySignals) {
  if (hotTodayExpiryTimer) {
    window.clearTimeout(hotTodayExpiryTimer);
    hotTodayExpiryTimer = null;
  }
  if (!hotTodaySurfaceVisible()) return;
  const now = Date.now();
  const nextExpiry = Math.min(...(signals || [])
    .map(signal => finiteNumber(signal?.expiresAt))
    .filter(expiresAt => expiresAt != null && expiresAt > now));
  if (!Number.isFinite(nextExpiry)) return;
  hotTodayExpiryTimer = window.setTimeout(() => {
    hotTodayExpiryTimer = null;
    scheduleHotSignalRender();
  }, Math.max(0, nextExpiry - now) + 80);
}

function receiveHotSignal(event) {
  const detail = event?.detail;
  if (!detail || typeof detail !== 'object') return;
  const ttlMs = finiteNumber(detail.ttlMs);
  const createdAt = finiteNumber(detail.createdAt) || Date.now();
  const signal = normalizeSignal({
    ...detail,
    createdAt,
    expiresAt: ttlMs && ttlMs > 0 ? createdAt + ttlMs : finiteNumber(detail.expiresAt),
    kind: detail.kind || (detail.breaking ? 'event' : 'state'),
    breaking: detail.breaking === true,
    live: detail.live !== false
  });
  if (!signal.text) return;
  hotSignalPool.set(signal.id || `${signal.category}-${createdAt}`, signal);
  const timeoutMs = signal.expiresAt ? signal.expiresAt - Date.now() : ttlMs;
  if (timeoutMs && timeoutMs > 0) {
    window.setTimeout(() => {
      if (pruneExpiredHotSignals()) scheduleHotSignalRender();
    }, timeoutMs + 50);
  }
  scheduleHotSignalRender();
}

function scheduleHotSignalRender() {
  if (typeof window === 'undefined') return;
  if (!hotTodaySurfaceVisible()) {
    rerenderCachedBriefing();
    return;
  }
  if (hotSignalRenderTimer) return;
  const elapsed = Date.now() - lastHotSignalRenderAt;
  const wait = Math.max(0, HOT_SIGNAL_RENDER_THROTTLE_MS - elapsed);
  hotSignalRenderTimer = window.setTimeout(() => {
    hotSignalRenderTimer = null;
    lastHotSignalRenderAt = Date.now();
    if (lastStats?.cycle && hotTodaySurfaceVisible()) {
      renderToHotIsland(lastStats.cycle, hotTodayBriefingSentences, lastStats);
    }
    rerenderCachedBriefing();
  }, wait);
}

function wireHotSignalListeners() {
  if (typeof window === 'undefined' || hotSignalListenerWired) return;
  hotSignalListenerWired = true;
  window.addEventListener('hot-signal', receiveHotSignal);
  window.addEventListener('governance-alert-state', () => scheduleHotSignalRender());
}

wireHotSignalListeners();

function effectiveHotScore(signal, now = Date.now()) {
  const score = finiteNumber(signal?.score) || 0;
  if (signal?.tone === 'milestone' && signal?.milestoneStatus === 'crossed') return score;
  if (signal?.kind !== 'event') return score;
  const ageHours = Math.max(0, (now - (finiteNumber(signal.createdAt) || now)) / HOUR_MS);
  return score - (ageHours * HOT_SIGNAL_EVENT_DECAY_PER_HOUR);
}

function mergeHotSignals(liveSignals, poolSignals, briefingSignals) {
  const merged = [];
  const seenEvents = new Set();
  const seenStateCategories = new Set();
  const categoryCounts = new Map();
  const now = Date.now();
  const sorted = [...liveSignals, ...poolSignals, ...briefingSignals]
    .map(enrichSignalWithPulseContext)
    .filter(signal => signal.text)
    .filter(signal => !signalIsExpired(signal, now))
    .sort((a, b) => {
      const scoreDiff = effectiveHotScore(b, now) - effectiveHotScore(a, now);
      if (Math.abs(scoreDiff) > 0.001) return scoreDiff;
      if (a.kind !== b.kind) return a.kind === 'event' ? -1 : 1;
      return (finiteNumber(b.createdAt) || 0) - (finiteNumber(a.createdAt) || 0);
    });
  for (const signal of sorted) {
    const category = signal.category || 'network';
    const currentCount = categoryCounts.get(category) || 0;
    const isMilestone = signal.tone === 'milestone';
    const categoryBudget = isMilestone ? HOT_SIGNAL_MILESTONE_BUDGET : HOT_SIGNAL_CATEGORY_BUDGET;
    if (currentCount >= categoryBudget) continue;
    if (isMilestone) {
      const eventKey = signal.id || `${category}-${signal.title}`;
      if (seenEvents.has(eventKey)) continue;
      seenEvents.add(eventKey);
    } else if (signal.kind === 'event') {
      const eventKey = signal.id || `${category}-${signal.title}-${signal.createdAt}`;
      if (seenEvents.has(eventKey)) continue;
      seenEvents.add(eventKey);
    } else {
      if (seenStateCategories.has(category)) continue;
      seenStateCategories.add(category);
    }
    categoryCounts.set(category, currentCount + 1);
    merged.push(signal);
  }
  return merged;
}

function hotSignalPersonalRibbon(signal, data, portfolio) {
  if (!data?.fullAddress) return '';
  const category = signal?.category;
  if (['staking', 'cycle'].includes(category) && (finiteNumber(data.staked) || 0) > 0) {
    return 'Your stake';
  }
  if (category === 'baker' && (data.isBaker === true || data.bakerAddr)) {
    return 'Your baker';
  }
  if (
    ['security', 'tz4'].includes(category)
    && data.bakerAddr
    && Array.isArray(signal?.affectedBakers)
    && signal.affectedBakers.includes(data.bakerAddr)
  ) {
    return 'Your baker';
  }
  if (category === 'price' && (finiteNumber(portfolio?.total) || 0) > 0) {
    return 'Your position';
  }
  if (category === 'nft' && (finiteNumber(data.story?.nftAssetsCollected) || 0) > 0) {
    return 'Your collection';
  }
  if (category === 'domains' && data.story?.domainAlias) {
    return 'Your .tez name';
  }
  return '';
}

function compareHotSignalSelection(left, right, data, portfolio, now = Date.now()) {
  const leftBase = effectiveHotScore(left, now);
  const rightBase = effectiveHotScore(right, now);
  const leftBonus = left?.spectacle !== 'quiet' && hotSignalPersonalRibbon(left, data, portfolio)
    ? HOT_SIGNAL_PERSONAL_BONUS
    : 0;
  const rightBonus = right?.spectacle !== 'quiet' && hotSignalPersonalRibbon(right, data, portfolio)
    ? HOT_SIGNAL_PERSONAL_BONUS
    : 0;

  const scoreDiff = (rightBase + rightBonus) - (leftBase + leftBonus);
  if (Math.abs(scoreDiff) > 0.001) return scoreDiff;
  if (left?.kind !== right?.kind) return left?.kind === 'event' ? -1 : 1;
  return (finiteNumber(right?.createdAt) || 0) - (finiteNumber(left?.createdAt) || 0);
}

function selectHotSignalSet(signals = []) {
  const data = typeof window !== 'undefined' ? window._myTezosData || {} : {};
  const portfolio = personalPortfolioSnapshot(data);
  const now = Date.now();
  const rank = (left, right) => compareHotSignalSelection(left, right, data, portfolio, now);
  const notable = signals
    .filter(signal => signal.spectacle !== 'quiet')
    .sort(rank);
  if (notable.length >= HOT_SIGNAL_VISIBLE_MIN) return notable.slice(0, HOT_SIGNAL_RENDER_CAP);
  const selectedIds = new Set(notable.map(signal => signal.id));
  const selected = [...notable];
  for (const signal of signals) {
    if (selected.length >= HOT_SIGNAL_VISIBLE_MIN) break;
    if (selectedIds.has(signal.id)) continue;
    selected.push(signal);
    selectedIds.add(signal.id);
  }
  return selected
    .sort(rank)
    .slice(0, HOT_SIGNAL_RENDER_CAP);
}

function isHeaderDuplicateSignal(signal) {
  if (!signal) return true;
  if (signal.tone === 'milestone') return false;
  if (signal.category === 'cycle' || signal.category === 'security' || signal.category === 'network') return true;
  if (signal.category === 'staking') return true;
  if (signal.category === 'ecosystem' && /\bactive bakers?\b/i.test(signal.text)) return true;
  return false;
}

function setHotTodayLiveText(key, value) {
  if (typeof document === 'undefined') return;
  document.querySelectorAll(`[data-hot-live="${key}"]`).forEach((element) => {
    const text = String(value || '--');
    if (element.textContent !== text) element.textContent = text;
  });
}

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function refreshHotTodayLiveMetrics() {
  const now = Date.now();
  const today = utcDayKey(now);
  if (today !== lastDailyCurioDay) {
    lastDailyCurioDay = today;
    preparedDailyCurio = null;
    activeDailyCurio = null;
    void prepareDailyCurio();
  }
  if (!hotTodaySurfaceVisible()) return;
  const island = pulseTickerElement();
  if (!island || island.hidden) return;
  setHotTodayLiveText('clock', hotTodayClockLabel(now));
  island.querySelectorAll('[data-hot-age]').forEach((element) => {
    const signal = {
      kind: element.dataset.hotKind,
      createdAt: finiteNumber(element.dataset.hotCreatedAt),
      observedAt: finiteNumber(element.dataset.hotObservedAt),
      startedAt: finiteNumber(element.dataset.hotStartedAt)
    };
    const label = signalAgeLabel(signal, now);
    if (element.textContent !== label) element.textContent = label;
  });
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

function compactPersonalNumber(value, maximumFractionDigits = 1) {
  const number = finiteNumber(value);
  if (number == null) return '—';
  return number.toLocaleString('en-US', {
    notation: Math.abs(number) >= 10_000 ? 'compact' : 'standard',
    maximumFractionDigits
  });
}

function personalTez(value, maximumFractionDigits = 1) {
  return `${compactPersonalNumber(value, maximumFractionDigits)} XTZ`;
}

function personalUsd(value) {
  const number = finiteNumber(value);
  if (number == null) return '';
  return number.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: Math.abs(number) >= 10_000 ? 'compact' : 'standard',
    maximumFractionDigits: Math.abs(number) >= 10_000 ? 1 : 0
  });
}

function personalAccountLabel(data, profile) {
  return data?.story?.domainAlias
    || data?.greetingName
    || (profile?.address ? `${profile.address.slice(0, 8)}…${profile.address.slice(-4)}` : 'Your Tezos account');
}

function personalPortfolioSnapshot(data) {
  const portfolioTotals = lastPortfolioContext?.totals;
  const hasPortfolioTotals = portfolioTotals
    && ['total', 'spendable', 'staked', 'unstaking'].every(key => finiteNumber(portfolioTotals[key]) != null);
  if (hasPortfolioTotals) {
    return {
      total: Number(portfolioTotals.total) / 1e6,
      spendable: Number(portfolioTotals.spendable) / 1e6,
      staked: Number(portfolioTotals.staked) / 1e6,
      unstaking: Number(portfolioTotals.unstaking) / 1e6,
      count: Math.max(1, Number(lastPortfolioContext.count) || 1),
      source: 'portfolio'
    };
  }
  const total = Math.max(0, finiteNumber(data?.totalXTZ) || 0);
  const staked = Math.max(0, finiteNumber(data?.staked) || 0);
  return {
    total,
    spendable: Math.max(0, total - staked),
    staked,
    unstaking: 0,
    count: 1,
    source: 'account'
  };
}

function buildPersonalSpotlight(data, profile, portfolio) {
  const story = data?.story || {};
  const collected = Math.max(0, Number(story.nftAssetsCollected) || 0);
  const created = Math.max(0, Number(story.creatorStats?.totalCreated) || 0);
  const days = Math.max(0, Number(story.daysSinceJoin) || 0);
  const accepted = Math.max(0, Number(story.proposalsInjected) || 0);
  const bakerAccepted = Math.max(0, Number(story.bakerProposalsInjected) || 0);
  const stakedPct = portfolio.total > 0 ? (portfolio.staked / portfolio.total) * 100 : 0;
  const label = personalAccountLabel(data, profile);

  if (created > 0 || collected > 0) {
    const parts = [
      collected > 0 ? `${compactPersonalNumber(collected, 0)} collected` : '',
      created > 0 ? `${compactPersonalNumber(created, 0)} created` : ''
    ].filter(Boolean);
    return {
      tone: 'culture',
      eyebrow: `${label} · on-chain culture`,
      title: `${parts.join(' · ')} on Tezos`,
      text: days > 0
        ? `${compactPersonalNumber(days, 0)} days on-chain${story.joinedEra ? `, beginning in the ${story.joinedEra} era` : ''}.`
        : 'Your collector and creator history makes culture and contract activity especially relevant.'
    };
  }
  if (accepted > 0 || bakerAccepted > 0) {
    const totalAccepted = accepted + bakerAccepted;
    return {
      tone: 'governance',
      eyebrow: `${label} · governance lineage`,
      title: `${totalAccepted} accepted proposal${totalAccepted === 1 ? '' : 's'} in your orbit`,
      text: accepted > 0
        ? `This account directly injected ${accepted}; these are durable protocol-history receipts.`
        : `Your baker injected ${bakerAccepted}; the attribution stays with the baker, not this wallet.`
    };
  }
  if (data?.isBaker) {
    return {
      tone: data?.bakerInactive ? 'watch' : 'operator',
      eyebrow: `${label} · baker account`,
      title: data?.attestRate != null ? `${data.attestRate}% attestation rate` : 'Your baker signal is live',
      text: `${data?.health || 'Operator health'}${data?.rewardStreak > 0 ? ` · ${data.rewardStreak}-cycle reward streak` : ''}.`
    };
  }
  if (portfolio.staked > 0) {
    return {
      tone: 'staking',
      eyebrow: `${label} · active stake`,
      title: `${stakedPct.toFixed(stakedPct >= 10 ? 0 : 1)}% of your XTZ is directly staked`,
      text: `${personalTez(portfolio.staked)} is working in Tezos consensus${data?.bakerName ? ` with ${data.bakerName}` : ''}.`
    };
  }
  if (days > 0) {
    return {
      tone: 'history',
      eyebrow: `${label} · on-chain life`,
      title: `${compactPersonalNumber(days, 0)} days on Tezos`,
      text: `${story.joinedEra ? `Joined in the ${story.joinedEra} era` : 'Account history is indexed'}${story.upgradesSeen > 0 ? ` · ${story.upgradesSeen} named upgrades witnessed` : ''}.`
    };
  }
  return {
    tone: 'portfolio',
    eyebrow: `${label} · current account`,
    title: `${personalTez(portfolio.total)} across Tezos`,
    text: portfolio.count > 1
      ? `Complete current read across ${portfolio.count} included addresses.`
      : 'Your live account position, followed by the network signals most likely to affect it.'
  };
}

function personalFactRoute(view) {
  return `/my/?view=${encodeURIComponent(view)}`;
}

function buildPersonalFacts(data, profile, portfolio) {
  const story = data?.story || {};
  const price = finiteNumber(data?.xtzPrice) ?? finiteNumber(lastXtzPrice);
  const stakedPct = portfolio.total > 0 ? (portfolio.staked / portfolio.total) * 100 : 0;
  const facts = [{
    key: 'portfolio',
    icon: '◫',
    label: portfolio.count > 1 ? 'Included portfolio' : 'Your XTZ',
    value: personalTez(portfolio.total),
    detail: [
      price != null ? personalUsd(portfolio.total * price) : '',
      portfolio.count > 1 ? `${portfolio.count} addresses` : `${personalTez(portfolio.spendable)} spendable`
    ].filter(Boolean).join(' · '),
    view: 'portfolio',
    tone: 'portfolio'
  }];

  if (portfolio.staked > 0 || portfolio.unstaking > 0) {
    facts.push({
      key: 'staking',
      icon: '◆',
      label: 'Working balance',
      value: portfolio.staked > 0 ? personalTez(portfolio.staked) : personalTez(portfolio.unstaking),
      detail: portfolio.staked > 0
        ? `${stakedPct.toFixed(stakedPct >= 10 ? 0 : 1)}% directly staked${portfolio.unstaking > 0 ? ` · ${personalTez(portfolio.unstaking)} unstaking` : ''}`
        : 'Unstaking in progress',
      route: networkFeatureRoute('staking'),
      tone: 'staking'
    });
  } else if (data?.bakerAddr) {
    facts.push({
      key: 'delegation',
      icon: '↗',
      label: data?.bakerInactive ? 'Delegation watch' : 'Delegated to',
      value: data?.bakerName || 'Active baker',
      detail: data?.bakerInactive ? 'Baker is inactive' : 'Baker health and payout policy matter here',
      view: 'baker-signal',
      tone: data?.bakerInactive ? 'watch' : 'operator'
    });
  }

  if (data?.activeRewardEstimate && finiteNumber(data?.estAnnual) != null) {
    facts.push({
      key: 'rewards',
      icon: '＋',
      label: 'Current reward estimate',
      value: `+${personalTez(data.estAnnual)}/yr`,
      detail: `${compactPersonalNumber(data.apyRate, 2)}% APY context${data.rewardStreak > 0 ? ` · ${data.rewardStreak}-cycle streak` : ''}`,
      route: '#my-baker',
      tone: 'rewards'
    });
  } else if (data?.rewardsLastCycle > 0 || data?.rewardStreak > 0) {
    facts.push({
      key: 'rewards',
      icon: '＋',
      label: 'Reward receipts',
      value: data.rewardStreak > 0 ? `${data.rewardStreak}-cycle streak` : personalTez(data.rewardsLastCycle),
      detail: data.rewardsLastCycle > 0
        ? `${personalTez(data.rewardsLastCycle)} in the latest recorded cycle`
        : 'Recent positive reward cycles',
      route: '#my-baker',
      tone: 'rewards'
    });
  } else if (data?.bakerAddr) {
    facts.push({
      key: 'baker',
      icon: '◉',
      label: data?.isBaker ? 'Baker health' : 'Your baker signal',
      value: data?.health || (data?.attestRate != null ? `${data.attestRate}%` : 'Live'),
      detail: [data?.bakerName, data?.attestRate != null ? `${data.attestRate}% attestation` : 'Current operator context'].filter(Boolean).join(' · '),
      view: 'baker-signal',
      tone: data?.bakerInactive ? 'watch' : 'operator'
    });
  }

  const collected = Math.max(0, Number(story.nftAssetsCollected) || 0);
  const created = Math.max(0, Number(story.creatorStats?.totalCreated) || 0);
  if (collected > 0 || created > 0) {
    facts.push({
      key: 'culture',
      icon: '✦',
      label: collected > 0 ? 'Collected on Tezos' : 'Created on Tezos',
      value: collected > 0 ? `${compactPersonalNumber(collected, 0)} collected` : `${compactPersonalNumber(created, 0)} created`,
      detail: created > 0
        ? `${compactPersonalNumber(created, 0)} created${story.creatorStats?.totalSalesVolume > 0 ? ` · ${compactPersonalNumber(story.creatorStats.totalSalesVolume, 2)} XTZ sales` : ''}`
        : `${compactPersonalNumber(story.daysSinceJoin, 0)} days on Tezos`,
      view: collected > 0 ? 'collection' : 'story',
      tone: 'culture'
    });
  }

  if (story.domainAlias) {
    facts.push({
      key: 'identity',
      icon: '◎',
      label: 'Tezos identity',
      value: story.domainAlias,
      detail: 'Tezos Domains identity on this account',
      view: 'story',
      tone: 'history'
    });
  }

  if (story.daysSinceJoin > 0) {
    facts.push({
      key: 'history',
      icon: '∞',
      label: 'On-chain life',
      value: `${compactPersonalNumber(story.daysSinceJoin, 0)} days`,
      detail: `${story.joinedEra ? `${story.joinedEra} era` : 'Tezos history'}${story.upgradesSeen > 0 ? ` · ${story.upgradesSeen} upgrades` : ''}`,
      view: 'story',
      tone: 'history'
    });
  }

  const acceptedProposals = Math.max(0, Number(story.proposalsInjected) || 0)
    + Math.max(0, Number(story.bakerProposalsInjected) || 0);
  if (acceptedProposals > 0) {
    facts.push({
      key: 'governance',
      icon: '◇',
      label: 'Governance record',
      value: `${compactPersonalNumber(acceptedProposals, 0)} accepted ${acceptedProposals === 1 ? 'proposal' : 'proposals'}`,
      detail: story.bakerProposalsInjected > 0 ? 'Includes your baker’s accepted injections' : 'Accepted protocol injections by this account',
      view: 'story',
      tone: 'governance'
    });
  }

  const latestActivity = lastMemoryContext?.latestActivity;
  if (latestActivity && facts.length < 6) {
    facts.push({
      key: 'latest',
      icon: latestActivity.direction === 'in' ? '↓' : latestActivity.direction === 'out' ? '↑' : '↔',
      label: 'Latest receipt',
      value: latestActivity.summary || 'On-chain activity',
      detail: new Date(latestActivity.timestamp).toLocaleString(),
      view: 'transactions',
      tone: 'activity'
    });
  }

  return facts.slice(0, 6);
}

function renderPersonalFact(fact) {
  const route = fact.view ? personalFactRoute(fact.view) : fact.route || '#my-baker';
  const viewAttr = fact.view ? ` data-my-tezos-view-route="${escapeHtml(fact.view)}"` : '';
  return `
    <a class="network-personal-fact network-personal-fact-${escapeHtml(fact.tone)}" href="${escapeHtml(route)}"${viewAttr} data-network-route="${escapeHtml(route)}" data-personal-fact="${escapeHtml(fact.key)}">
      <span class="network-personal-fact-icon" aria-hidden="true">${escapeHtml(fact.icon)}</span>
      <span class="network-personal-fact-copy">
        <small>${escapeHtml(fact.label)}</small>
        <strong>${escapeHtml(fact.value)}</strong>
        <span>${escapeHtml(fact.detail)}</span>
      </span>
      <span class="network-personal-fact-arrow" aria-hidden="true">↗</span>
    </a>
  `;
}

function renderFocusChips(profile) {
  return profile.interests.slice(0, 5).map(item => {
    const key = safeCssToken(item.key);
    const route = networkFeatureRoute(key);
    const label = networkFeatureLabel(key);
    return `<a class="network-focus-chip" href="${escapeHtml(route)}" data-focus="${escapeHtml(key)}" data-network-route="${escapeHtml(route)}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${escapeHtml(item.label)}</a>`;
  }).join('');
}

function renderDeltaChip(delta, className) {
  if (!delta) return '';
  const arrow = delta.dir === 'up' ? '▲' : delta.dir === 'down' ? '▼' : '→';
  return `<span class="${className} ${className}-${escapeHtml(delta.dir)}"><span aria-hidden="true">${arrow}</span>${escapeHtml(delta.value)}</span>`;
}

function personalSignalContext(data, portfolio) {
  return {
    data,
    portfolio,
    stats: lastStats || {},
    xtzPrice: lastXtzPrice,
    linkedEtherlinkAccounts: countExplicitLinkedEtherlinkAccounts(data?.fullAddress)
  };
}

function personalSignalRelevance(signal, data, portfolio, context = personalSignalContext(data, portfolio)) {
  return describePersonalSignalRelevance(signal, context);
}

function renderSignalCard(signal, index, data, portfolio, relevanceContext) {
  const label = signal.title;
  const route = routeForSignal(signal);
  const routeLabel = labelForSignal(signal);
  const routeAction = /^(?:Open|Enter)\b/i.test(routeLabel) ? routeLabel : `Open ${routeLabel}`;
  const relevance = personalSignalRelevance(signal, data, portfolio, relevanceContext);
  const featureClass = index === 0 ? ' is-network-lead' : '';
  const relevanceAttribute = relevance ? ' data-personal-relevance="true"' : '';
  return `
    <a class="network-signal network-signal-${signal.tone}${featureClass}" href="${escapeHtml(route)}" data-category="${escapeHtml(signal.category)}" data-network-route="${escapeHtml(route)}"${relevanceAttribute} aria-label="${escapeHtml(`${routeAction}: ${signal.detail}`)}">
      <div class="network-signal-rank" aria-hidden="true">${escapeHtml(signal.icon)}</div>
      <div class="network-signal-main">
        <div class="network-signal-head">
          <span class="network-signal-label">${escapeHtml(label)}</span>
          <span class="network-signal-detail">${escapeHtml(signal.detail)}${renderDeltaChip(signal.delta, 'network-signal-delta')}</span>
        </div>
        <p>${escapeHtml(signal.text)}</p>
        ${relevance ? `<small class="network-signal-relevance">${escapeHtml(relevance)}</small>` : ''}
      </div>
    </a>
  `;
}

function milestoneArrivalIdentity(signal) {
  if (signal?.tone !== 'milestone' || signal?.milestoneStatus !== 'crossed') return '';
  return `${signal.id}|${finiteNumber(signal.createdAt) || ''}|${finiteNumber(signal.expiresAt) || ''}`;
}

function milestoneArrivalIsUnseen(signal) {
  const identity = milestoneArrivalIdentity(signal);
  return Boolean(identity) && !seenMilestoneArrivals.has(identity);
}

const MILESTONE_PROMO_LINES = {
  blocks: 'Block by block, Tezos keeps writing the receipt.',
  'funded-wallets': 'More funded wallets means more people with real skin in the network.',
  transactions: 'Usage leaves receipts. Tezos is printing another big one.',
  'smart-contracts': 'More contracts, more surface area for builders to make Tezos useful.',
  tokens: 'The token layer keeps compounding into real on-chain variety.',
  bakers: 'A broad baker set is what permissionless continuity looks like.',
  'tz4-adoption': 'The BLS era is moving from protocol capability into validator reality.',
  staking: 'More stake is more economic weight standing behind every Tezos block.',
  burned: 'Protocol activity keeps leaving an economic receipt in burned XTZ.',
  cycle: 'Another cycle is another clean handoff in the Tezos clockwork.',
  'uptime-days': 'The public mainnet history keeps growing, one day at a time.',
  'protocol-upgrades': 'Self-amendment is not a roadmap slide. It is the chain shipping.',
  rollups: 'The Tezos rollup surface keeps widening for the next wave of execution.'
};

function milestoneShareUrl(signal) {
  const route = routeForSignal(signal);
  const routes = {
    '#health': 'tezos.systems/health/',
    '#leaderboard': 'tezos.systems/#leaderboard',
    '#calculator': 'tezos.systems/#calculator',
    '#staking': 'tezos.systems/stake/',
    '#pulse': 'tezos.systems/pulse/'
  };
  if (route.startsWith('/')) return `tezos.systems${route}`;
  return routes[route] || 'tezos.systems/pulse/';
}

function milestoneTweetOptions(signal) {
  const crossed = signal.milestoneStatus === 'crossed';
  const title = String(signal.title || 'Tezos milestone').trim();
  const detail = String(signal.detail || '').trim();
  const promo = MILESTONE_PROMO_LINES[signal.milestoneTrack] || 'The Tezos network keeps turning live data into durable proof.';
  const url = milestoneShareUrl(signal);

  if (crossed) {
    return [
      { label: '✦ Receipt confirmed', category: 'Receipt', text: `Tezos just crossed ${title}. ${promo}\n\nReceipt confirmed on-chain → ${url}` },
      { label: '◉ I was here', category: 'I was here', text: `I was here when Tezos crossed ${title}. Another round number, another public receipt from a chain that keeps moving.\n\n${url}` },
      { label: '∞ Long game', category: 'Long game', text: `${title}, confirmed. ${promo}\n\nThe long game is visible on-chain → ${url}` },
      { label: '↗ Track it', category: 'Live', text: `New Tezos milestone unlocked: ${title}. ${detail}\n\nSee the live signal → ${url}` }
    ];
  }

  return [
    { label: '◎ Next receipt', category: 'Anticipation', text: `Tezos is closing in on ${title}. ${detail}.\n\n${promo}\n\nWatch it live → ${url}` },
    { label: '↗ Counter watch', category: 'Live', text: `The counter is getting interesting: ${title} is now in sight. ${promo}\n\nFollow the approach → ${url}` },
    { label: '∞ Built to last', category: 'Long game', text: `${promo}\n\nNext marker: ${title}. The live approach is on tezos.systems → ${url}` }
  ];
}

async function shareHotTodayMilestone(signal, button) {
  if (!signal || signal.tone !== 'milestone' || !button) return;
  const originalHtml = button.innerHTML;
  try {
    button.disabled = true;
    button.classList.add('is-sharing');
    button.textContent = '...';
    const { captureNetworkMomentShare } = await import('../ui/share.js');
    const crossed = signal.milestoneStatus === 'crossed';
    const tweetOptions = milestoneTweetOptions(signal);
    await captureNetworkMomentShare({
      id: signal.id,
      emoji: signal.icon || '✦',
      title: crossed ? `${signal.title} confirmed` : `${signal.title} in sight`,
      tweet: tweetOptions[0].text,
      tweetOptions,
      timestamp: finiteNumber(signal.createdAt) || Date.now()
    });
  } catch (error) {
    console.error('Failed to share hot milestone', error);
  } finally {
    button.disabled = false;
    button.classList.remove('is-sharing');
    button.innerHTML = originalHtml;
  }
}

function relativeSignalAge(timestamp, now = Date.now()) {
  const age = Math.max(0, now - (finiteNumber(timestamp) || now));
  if (age < 60_000) return 'Just now';
  if (age < HOUR_MS) return `${Math.max(1, Math.floor(age / 60_000))}m ago`;
  if (age < DAY_MS) return `${Math.max(1, Math.floor(age / HOUR_MS))}h ago`;
  return new Date(timestamp).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
}

function signalAgeLabel(signal, now = Date.now()) {
  const startedAt = finiteNumber(signal?.startedAt);
  if (startedAt) {
    const weekday = new Date(startedAt).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
    return `Since ${weekday}`;
  }
  const timestamp = signal?.kind === 'event'
    ? finiteNumber(signal?.createdAt)
    : finiteNumber(signal?.observedAt) || finiteNumber(signal?.createdAt);
  const relative = relativeSignalAge(timestamp, now);
  if (signal?.kind === 'event') return relative;
  return relative === 'Just now' ? 'Live' : `Updated ${relative}`;
}

function hotTodayClockLabel(now = Date.now()) {
  if (lastHotTodayDataState === 'stale' && lastHotTodayGoodAt) {
    return relativeSignalAge(lastHotTodayGoodAt, now);
  }
  const observed = hotTodaySignals
    .map(signal => finiteNumber(signal.observedAt) || finiteNumber(signal.createdAt))
    .filter(Boolean);
  const latest = observed.length ? Math.max(...observed) : null;
  return latest
    ? relativeSignalAge(latest, now)
    : 'Syncing';
}

function releaseRadarDateLabel(timestamp, { includeTime = false } = {}) {
  const raw = String(timestamp ?? '').trim();
  const parsed = typeof timestamp === 'number' && Number.isFinite(timestamp)
    ? timestamp
    : raw ? Date.parse(raw) : NaN;
  if (!Number.isFinite(parsed)) return '--';
  const options = includeTime
    ? { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/New_York' }
    : { month: 'short', day: 'numeric', timeZone: 'America/New_York' };
  return `${new Date(parsed).toLocaleString('en-US', options)}${includeTime ? ' ET' : ''}`;
}

function releaseRadarConfidenceLabel(candidate) {
  if (!candidate) return 'NO SIGNAL';
  if (candidate.lifecycle === 'released') {
    return `${candidate.confidence} · released ${releaseRadarDateLabel(candidate.releasedAt)}`.toUpperCase();
  }
  return [candidate.confidence, candidate.horizon].filter(Boolean).join(' · ').toUpperCase();
}

function releaseRadarGateStatusLabel(status) {
  return ({
    not_started: 'Waiting',
    signal_detected: 'Signal',
    active: 'Active',
    validating: 'Validating',
    ready: 'Ready',
    blocked: 'Blocked',
    complete: 'Complete'
  })[status] || 'Waiting';
}

function releaseRadarMateriallyAdvanced(candidate) {
  return candidate?.gates?.filter((gate) => (
    ['active', 'validating', 'ready', 'complete'].includes(gate.status)
  )).length || 0;
}

function releaseRadarCandidateKindLabel(kind) {
  return ({
    tezos_x_launch: 'Tezos X launch',
    octez_release: 'Octez L1 node',
    evm_node_release: 'EVM operator node',
    previewnet_deployment: 'Previewnet deployment',
    l1_protocol_proposal: 'L1 protocol proposal'
  })[kind] || 'Release lane';
}

function releaseRadarLifecycleLabel(candidate) {
  if (candidate?.lifecycle === 'released') return 'Released';
  if (candidate?.lifecycle === 'no_signal') return 'No credible signal';
  return 'Forecast';
}

function releaseRadarExternalAttributes(url) {
  return /^https:\/\//i.test(String(url || '')) ? ' target="_blank" rel="noopener"' : '';
}

function releaseRadarOverlayRevision(signal) {
  const radar = signal?.releaseRadar;
  return radar ? `${radar.updatedAt}|${radar.sourceState}|${radar.stale ? 'stale' : 'fresh'}` : '';
}

function renderReleaseRadarOverlayMarkup(signal) {
  const radar = signal?.releaseRadar;
  const main = radar?.candidates?.find((candidate) => candidate.id === radar.mainCandidateId)
    || radar?.candidates?.[0];
  if (!radar || !main) return '';
  const materiallyAdvanced = releaseRadarMateriallyAdvanced(main);
  const evidence = radar.candidates.flatMap((candidate) => (
    candidate.evidence.map((row) => ({ ...row, candidate: candidate.label }))
  ));
  const history = radar.candidates.flatMap((candidate) => (
    candidate.history.map((row) => ({ ...row, candidate: candidate.label }))
  )).sort((left, right) => Date.parse(right.observedAt) - Date.parse(left.observedAt));
  const recentReleases = radar.candidates.flatMap((candidate) => {
    const rows = [];
    if (candidate.lifecycle === 'released' && candidate.releasedAt) {
      rows.push({
        label: candidate.label,
        releasedAt: candidate.releasedAt,
        url: candidate.route || candidate.evidence[0]?.url || '',
        summary: candidate.highlight || candidate.summary,
        lane: releaseRadarCandidateKindLabel(candidate.kind),
        exciting: candidate.id === radar.excitingCandidateId
      });
    }
    if (candidate.recentRelease) {
      rows.push({
        ...candidate.recentRelease,
        lane: `${candidate.label} release line`,
        exciting: false
      });
    }
    return rows;
  }).sort((left, right) => Date.parse(right.releasedAt) - Date.parse(left.releasedAt));
  const confidenceMeanings = [
    ['High', 'Direct artifact: tag, release candidate, submitted proposal, approved vote, or scheduled activation.'],
    ['Medium', 'Coordinated evidence strongly implies preparation, but the formal artifact is still absent.'],
    ['Low', 'Early branch naming, backport work, or isolated evidence suggests a candidate, not a date.'],
    ['None', 'No credible near-term release signal is visible in the reviewed evidence.']
  ];
  const boundaryNotes = [
    'An Octez release is L1 node software; it is not a Tezos X mainnet launch signal by itself.',
    'An EVM-node release advances operator and Previewnet readiness; it does not start Etherlink governance.',
    'Previewnet is a public proving ground, not production activation or a promised mainnet date.',
    'The initial Tezos X kernel path and a Tezos L1 protocol proposal are tracked as separate lanes.'
  ];

  return `
    <header class="release-radar-overlay-header" data-quiet-key="release-radar-overlay-header">
      <div class="release-radar-overlay-brandline">
        <span class="release-radar-overlay-mark" aria-hidden="true">◉</span>
        <span><small>Full release intelligence</small><strong>Release Radar</strong></span>
        <span class="release-radar-overlay-priority${radar.stale ? ' is-review-due' : ''}">${radar.stale ? 'REVIEW DUE' : radar.noCredibleSignal ? 'NO NEAR-TERM SIGNAL' : 'EVERYONE WATCH'}</span>
      </div>
      <h2 id="release-radar-overlay-title">What may ship next—and what still blocks it</h2>
      <p>The reviewed decision board for Tezos X, Octez, and the EVM node. Every lane stays separate so a software tag cannot masquerade as mainnet readiness.</p>
      <div class="release-radar-overlay-receipt" aria-label="Release Radar review receipt">
        <span><small>Reviewed</small><strong>${escapeHtml(releaseRadarDateLabel(radar.updatedAt, { includeTime: true }))}</strong></span>
        <span><small>Freshness</small><strong>${radar.stale ? 'Review due — recheck timing' : radar.sourceState === 'last-good' ? 'Last-good receipt' : 'Current daily receipt'}</strong></span>
        <span><small>${radar.stale ? 'Review due since' : 'Next review due'}</small><strong>${escapeHtml(releaseRadarDateLabel(radar.staleAtMs, { includeTime: true }))}</strong></span>
        <span><small>Review window ends</small><strong>${escapeHtml(releaseRadarDateLabel(radar.expiresAt, { includeTime: true }))}</strong></span>
      </div>
    </header>

    ${radar.stale ? `
      <p class="release-radar-overlay-review-note" data-quiet-key="release-radar-overlay-review-note">
        This receipt is past its daily review point. The evidence stays visible; recheck forecast timing against the next tracker receipt.
      </p>
    ` : ''}

    <section class="release-radar-overlay-hero" aria-labelledby="release-radar-overlay-main-title" data-quiet-key="release-radar-overlay-hero">
      <div>
        <span class="release-radar-overlay-kicker">Likely next major ship</span>
        <h3 id="release-radar-overlay-main-title">${escapeHtml(main.label)}</h3>
        <p>${escapeHtml(main.summary)}</p>
        ${main.highlight ? `<strong class="release-radar-overlay-highlight">${escapeHtml(main.highlight)}</strong>` : ''}
      </div>
      <div class="release-radar-overlay-forecast release-radar-confidence-${escapeHtml(main.confidence)}">
        <span><small>Confidence</small><strong>${escapeHtml(main.confidence.toUpperCase())}</strong></span>
        <span><small>Horizon</small><strong>${escapeHtml(main.horizon || 'No supported ETA')}</strong></span>
        <span><small>Current stage</small><strong>${escapeHtml(main.stage || releaseRadarLifecycleLabel(main))}</strong></span>
      </div>
    </section>

    <section class="release-radar-overlay-blocker" aria-label="Exact launch blocker" data-quiet-key="release-radar-overlay-blocker">
      <span><small>Exact blocker / next signal</small><strong>${escapeHtml(main.nextSignal)}</strong></span>
      <a href="${escapeHtml(main.route || '/tezosx/')}">Open Tezos X <span aria-hidden="true">↗</span></a>
    </section>

    <section class="release-radar-overlay-section" aria-labelledby="release-radar-lanes-title" data-quiet-key="release-radar-overlay-lanes">
      <div class="release-radar-overlay-section-head">
        <span><small>Independent clocks</small><h3 id="release-radar-lanes-title">Release lanes</h3></span>
        <p>Forecasts, released artifacts, and activation paths are shown independently.</p>
      </div>
      <div class="release-radar-lane-grid">
        ${radar.candidates.map((candidate) => {
          const primaryUrl = candidate.route || candidate.evidence[0]?.url || '';
          const exciting = candidate.id === radar.excitingCandidateId;
          return `
            <article class="release-radar-lane${exciting ? ' is-exciting' : ''}" data-quiet-key="release-radar-lane-${escapeHtml(candidate.id)}">
              <div class="release-radar-lane-head">
                <span><small>${escapeHtml(releaseRadarCandidateKindLabel(candidate.kind))}</small><strong>${escapeHtml(candidate.label)}</strong></span>
                ${exciting ? '<em>Exciting</em>' : ''}
              </div>
              <div class="release-radar-lane-meta">
                <span>${escapeHtml(releaseRadarLifecycleLabel(candidate))}</span>
                <span class="release-radar-confidence-${escapeHtml(candidate.confidence)}">${escapeHtml(releaseRadarConfidenceLabel(candidate))}</span>
                ${candidate.stage ? `<span>${escapeHtml(candidate.stage)}</span>` : ''}
              </div>
              <p>${escapeHtml(candidate.summary)}</p>
              ${candidate.highlight ? `<strong class="release-radar-lane-highlight">${escapeHtml(candidate.highlight)}</strong>` : ''}
              <div class="release-radar-lane-next"><small>Next confirming signal</small><span>${escapeHtml(candidate.nextSignal)}</span></div>
              ${candidate.recentRelease ? `<div class="release-radar-lane-recent"><small>Latest tagged release</small><a href="${escapeHtml(candidate.recentRelease.url)}" target="_blank" rel="noopener">${escapeHtml(candidate.recentRelease.label)} · ${escapeHtml(releaseRadarDateLabel(candidate.recentRelease.releasedAt))}</a></div>` : ''}
              ${primaryUrl ? `<a class="release-radar-lane-link" href="${escapeHtml(primaryUrl)}"${releaseRadarExternalAttributes(primaryUrl)}>Open lane receipt <span aria-hidden="true">↗</span></a>` : ''}
            </article>
          `;
        }).join('')}
      </div>
    </section>

    <section class="release-radar-overlay-section" aria-labelledby="release-radar-gates-title" data-quiet-key="release-radar-overlay-gates">
      <div class="release-radar-overlay-section-head">
        <span><small>Dependency chain</small><h3 id="release-radar-gates-title">Tezos X mainnet gates</h3></span>
        <p><strong>${escapeHtml(`${materiallyAdvanced} of ${main.gates.length}`)}</strong> materially advanced · gates are not equally weighted · no completion percentage implied.</p>
      </div>
      <div class="release-radar-overlay-gates">
        ${main.gates.map((gate, gateIndex) => `
          <article class="release-radar-overlay-gate release-radar-overlay-gate-${escapeHtml(gate.status)}" data-quiet-key="release-radar-overlay-gate-${escapeHtml(gate.id)}">
            <span class="release-radar-overlay-gate-number">${String(gateIndex + 1).padStart(2, '0')}</span>
            <span class="release-radar-overlay-gate-dot" aria-hidden="true"></span>
            <span><small>${escapeHtml(releaseRadarGateStatusLabel(gate.status))}</small><strong>${escapeHtml(gate.label)}</strong><p>${escapeHtml(gate.detail)}</p></span>
          </article>
        `).join('')}
      </div>
    </section>

    <section class="release-radar-overlay-section release-radar-overlay-boundaries" aria-labelledby="release-radar-boundaries-title" data-quiet-key="release-radar-overlay-boundaries">
      <div class="release-radar-overlay-section-head">
        <span><small>Do not collapse these</small><h3 id="release-radar-boundaries-title">Dependency boundaries</h3></span>
        <p>The radar is deliberately strict about what each signal can prove.</p>
      </div>
      <div class="release-radar-boundary-grid">
        ${boundaryNotes.map((note, index) => `<p data-quiet-key="release-radar-boundary-${index}"><span aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>${escapeHtml(note)}</p>`).join('')}
      </div>
    </section>

    <section class="release-radar-overlay-section" aria-labelledby="release-radar-next-signals-title" data-quiet-key="release-radar-overlay-next-signals">
      <div class="release-radar-overlay-section-head">
        <span><small>What would change the board</small><h3 id="release-radar-next-signals-title">Next confirming signals</h3></span>
        <p>Concrete artifacts that would move confidence, status, or timing.</p>
      </div>
      <div class="release-radar-next-grid">
        ${radar.candidates.map((candidate) => `
          <div data-quiet-key="release-radar-next-${escapeHtml(candidate.id)}"><small>${escapeHtml(candidate.label)}</small><strong>${escapeHtml(candidate.nextSignal)}</strong></div>
        `).join('')}
      </div>
    </section>

    <section class="release-radar-overlay-section" aria-labelledby="release-radar-recent-title" data-quiet-key="release-radar-overlay-recent">
      <div class="release-radar-overlay-section-head">
        <span><small>Confirmed artifacts</small><h3 id="release-radar-recent-title">Recent releases</h3></span>
        <p>Tagged releases are shown separately from forecasts and launch readiness.</p>
      </div>
      <div class="release-radar-recent-grid">
        ${recentReleases.map((release, index) => `
          <a class="release-radar-recent${release.exciting ? ' is-exciting' : ''}" href="${escapeHtml(release.url)}" target="_blank" rel="noopener" data-quiet-key="release-radar-recent-${index}">
            <span><small>${escapeHtml(release.lane)}</small><strong>${escapeHtml(release.label)}</strong></span>
            ${release.exciting ? '<em>Exciting</em>' : ''}
            <time datetime="${escapeHtml(release.releasedAt)}">${escapeHtml(releaseRadarDateLabel(release.releasedAt))}</time>
            <p>${escapeHtml(release.summary)}</p>
          </a>
        `).join('') || '<p class="release-radar-empty">No confirmed release falls inside the current radar window.</p>'}
      </div>
    </section>

    <section class="release-radar-overlay-section" aria-labelledby="release-radar-history-title" data-quiet-key="release-radar-overlay-history">
      <div class="release-radar-overlay-section-head">
        <span><small>Momentum and regression</small><h3 id="release-radar-history-title">Status-change ledger</h3></span>
        <p>Why the tracker moved—or deliberately held—its confidence.</p>
      </div>
      <div class="release-radar-history-list">
        ${history.map((row, index) => `
          <article data-quiet-key="release-radar-history-${index}">
            <time datetime="${escapeHtml(row.observedAt)}">${escapeHtml(releaseRadarDateLabel(row.observedAt, { includeTime: true }))}</time>
            <span><small>${escapeHtml(row.candidate)}</small><strong>${escapeHtml(row.previousConfidence ? `${row.previousConfidence} → ${row.confidence || row.previousConfidence}` : row.confidence || 'Observed')}</strong><p>${escapeHtml(row.reason)}</p></span>
          </article>
        `).join('')}
      </div>
    </section>

    <section class="release-radar-overlay-section" aria-labelledby="release-radar-evidence-title" data-quiet-key="release-radar-overlay-evidence">
      <div class="release-radar-overlay-section-head">
        <span><small>Primary-source ledger</small><h3 id="release-radar-evidence-title">Evidence</h3></span>
        <p>Every receipt used in the current review, with observation time and interpretation.</p>
      </div>
      <div class="release-radar-overlay-evidence">
        ${evidence.map((row, index) => `
          <a href="${escapeHtml(row.url)}" target="_blank" rel="noopener" data-quiet-key="release-radar-evidence-${index}">
            <span>${escapeHtml(row.candidate)}</span>
            <strong>${escapeHtml(row.label)}</strong>
            <time datetime="${escapeHtml(row.observedAt)}">Observed ${escapeHtml(releaseRadarDateLabel(row.observedAt, { includeTime: true }))}</time>
            ${row.note ? `<p>${escapeHtml(row.note)}</p>` : ''}
          </a>
        `).join('')}
      </div>
    </section>

    <section class="release-radar-overlay-section release-radar-overlay-method" aria-labelledby="release-radar-method-title" data-quiet-key="release-radar-overlay-method">
      <div class="release-radar-overlay-section-head">
        <span><small>How to read the forecast</small><h3 id="release-radar-method-title">Confidence and methodology</h3></span>
        <p>No merge-volume scoring, fake completion math, or silent browser inference.</p>
      </div>
      <div class="release-radar-confidence-grid">
        ${confidenceMeanings.map(([label, meaning]) => `<p data-quiet-key="release-radar-confidence-${label.toLowerCase()}"><strong>${label}</strong><span>${escapeHtml(meaning)}</span></p>`).join('')}
      </div>
      <ul>${radar.methodology.map((line, index) => `<li data-quiet-key="release-radar-method-${index}">${escapeHtml(line)}</li>`).join('')}</ul>
      <p class="release-radar-overlay-source"><strong>${escapeHtml(radar.sourceRun.label)}</strong> · ${escapeHtml(radar.sourceRun.cadence)} · ${escapeHtml(radar.sourceRun.method)}</p>
    </section>
  `;
}

function ensureReleaseRadarOverlay() {
  let overlay = document.getElementById('release-radar-overlay');
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = 'release-radar-overlay';
  overlay.className = 'modal-overlay chamber-overlay release-radar-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.innerHTML = `
    <div class="modal-content modal-large chamber-content release-radar-overlay-content" role="dialog" aria-modal="true" aria-labelledby="release-radar-overlay-title" tabindex="-1">
      <button class="modal-close chamber-close release-radar-overlay-close" type="button" data-release-radar-close aria-label="Close full Release Radar">&times;</button>
      <div class="chamber-body release-radar-overlay-body" data-release-radar-overlay-body></div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('[data-release-radar-close]')?.addEventListener('click', closeReleaseRadarOverlay);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeReleaseRadarOverlay();
  });
  return overlay;
}

function renderReleaseRadarOverlay(signal, { quiet = false } = {}) {
  const overlay = ensureReleaseRadarOverlay();
  const body = overlay.querySelector('[data-release-radar-overlay-body]');
  if (!body) return overlay;
  const markup = renderReleaseRadarOverlayMarkup(signal);
  if (quiet && body.childElementCount) quietlySyncHtml(body, markup);
  else body.innerHTML = markup;
  overlay.dataset.releaseRadarRevision = releaseRadarOverlayRevision(signal);
  return overlay;
}

function closeReleaseRadarOverlay() {
  const overlay = document.getElementById('release-radar-overlay');
  if (!overlay?.classList.contains('active')) return;
  const trigger = document.querySelector('#pulse-ticker-shelf [data-release-radar-open]');
  overlay.classList.remove('active');
  deactivateChamberDialog(overlay);
  document.body.style.overflow = releaseRadarSavedBodyOverflow || '';
  document.documentElement.style.overflow = releaseRadarSavedHtmlOverflow || '';
  releaseRadarSavedBodyOverflow = null;
  releaseRadarSavedHtmlOverflow = null;
  holdPulseTickerSignal('release-radar');
  window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
    if ((document.activeElement === document.body || overlay.contains(document.activeElement)) && trigger?.isConnected) {
      trigger.focus({ preventScroll: true });
    }
  }));
}

function openReleaseRadarOverlay(signal = lastReleaseRadarSignal) {
  if (!signal?.releaseRadar) return;
  const overlay = renderReleaseRadarOverlay(signal);
  const content = overlay.querySelector('.release-radar-overlay-content');
  releaseRadarSavedBodyOverflow = document.body.style.overflow;
  releaseRadarSavedHtmlOverflow = document.documentElement.style.overflow;
  document.body.style.overflow = 'hidden';
  document.documentElement.style.overflow = 'hidden';
  if (content) content.scrollTop = 0;
  overlay.classList.add('active');
  activateChamberDialog(overlay, {
    close: closeReleaseRadarOverlay,
    dialogSelector: '.release-radar-overlay-content',
    titleId: 'release-radar-overlay-title',
    label: 'Full Release Radar',
    initialFocusSelector: '.release-radar-overlay-close',
    restoreFocusSelector: '#pulse-ticker-shelf [data-release-radar-open]'
  });
}

function syncOpenReleaseRadarOverlay() {
  const overlay = document.getElementById('release-radar-overlay');
  if (!overlay?.classList.contains('active') || !lastReleaseRadarSignal?.releaseRadar) return;
  const revision = releaseRadarOverlayRevision(lastReleaseRadarSignal);
  if (overlay.dataset.releaseRadarRevision === revision) return;
  renderReleaseRadarOverlay(lastReleaseRadarSignal, { quiet: true });
}

function preparePulseTickerSignal(signal, index) {
  const milestoneArriving = signal.milestoneStatus === 'crossed'
    && claimMilestoneArrival(seenMilestoneArrivals, milestoneArrivalIdentity(signal))
    && !hotTodayQuietRestore;
  const data = typeof window !== 'undefined' ? window._myTezosData || {} : {};
  return {
    ...signal,
    tickerIndex: index,
    tickerRoute: routeForSignal(signal),
    actionLabel: labelForSignal(signal),
    categoryLabel: categoryMeta(signal.category).label,
    personalRibbon: hotSignalPersonalRibbon(signal, data, personalPortfolioSnapshot(data)),
    ageLabel: signalAgeLabel(signal),
    isArriving: milestoneArriving
  };
}

function wireHotTodayMilestoneSharing(island) {
  if (!island || island.dataset.milestoneSharingWired === 'true') return;
  island.dataset.milestoneSharingWired = 'true';
  island.addEventListener('click', (event) => {
    const button = event.target.closest('[data-hot-milestone-share]');
    if (!button || !island.contains(button)) return;
    event.preventDefault();
    event.stopPropagation();
    const index = Number(button.dataset.hotMilestoneShare);
    const signal = Number.isInteger(index) ? hotTodaySignals[index] : null;
    shareHotTodayMilestone(signal, button);
  });
}

function wireReleaseRadarActions(island) {
  if (!island || island.dataset.releaseRadarWired === 'true') return;
  island.dataset.releaseRadarWired = 'true';
  island.addEventListener('click', (event) => {
    const button = event.target.closest('[data-release-radar-open]');
    if (!button || !island.contains(button)) return;
    event.preventDefault();
    event.stopPropagation();
    const signalId = button.dataset.releaseRadarOpen || 'release-radar';
    const signal = hotTodaySignals.find((candidate) => candidate.id === signalId)
      || lastReleaseRadarSignal;
    openReleaseRadarOverlay(signal);
  });
}

function wireHotTodayRealtime() {
  if (typeof window === 'undefined') return;
  wireHotSignalListeners();
  if (!hotTodayRealtimeWired) {
    hotTodayRealtimeWired = true;
    window.addEventListener('block-pulse', () => {
      if (hotTodaySurfaceVisible()) refreshHotTodayLiveMetrics();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        scheduleHotTodayInitialTimeout();
        if (hotTodaySurfaceVisible()) refreshHotTodayLiveMetrics();
        schedulePulseHistoryLoad();
        void loadReleaseRadarSignal();
      }
    });
  }
  if (hotTodaySurfaceVisible() && !hotTodayLiveTimer) {
    hotTodayLiveTimer = window.setInterval(() => {
      if (document.visibilityState !== 'visible' || !hotTodaySurfaceVisible()) return;
      refreshHotTodayLiveMetrics();
    }, HOT_TODAY_LIVE_TICK_MS);
  }
}

function hotTodaySurfaceVisible() {
  return Boolean(pulseTickerElement()) && (isHomeBlockVisible('live-pulse')
    || document.documentElement.getAttribute('data-home-layout-preview') === 'all');
}

function stopHotTodaySurfaceTimers() {
  [
    ['interval', hotTodayLiveTimer, value => { hotTodayLiveTimer = value; }],
    ['timeout', hotTodayExpiryTimer, value => { hotTodayExpiryTimer = value; }],
    ['timeout', hotTodayInitialTimer, value => { hotTodayInitialTimer = value; }],
    ['timeout', hotSignalRenderTimer, value => { hotSignalRenderTimer = value; }]
  ].forEach(([kind, timer, assign]) => {
    if (!timer) return;
    if (kind === 'interval') window.clearInterval(timer);
    else window.clearTimeout(timer);
    assign(null);
  });
}

function syncHotTodaySurfaceVisibility() {
  if (!hotTodaySurfaceVisible()) {
    stopHotTodaySurfaceTimers();
    releasePulseTicker();
    return;
  }
  wireHotTodayRealtime();
  hotTodayQuietRestore = true;
  try {
    if (lastStats?.cycle) renderToHotIsland(lastStats.cycle, hotTodayBriefingSentences, lastStats);
    else renderHotTodayState(lastHotTodayDataState || 'loading', lastStats || {});
  } finally {
    hotTodayQuietRestore = false;
  }
}

function wireHotTodayVisibility() {
  if (hotTodayVisibilityWired) return;
  hotTodayVisibilityWired = true;
  window.addEventListener('tezos:home-layout-change', (event) => {
    if (event.detail?.id === 'live-pulse') syncHotTodaySurfaceVisibility();
  });
  window.addEventListener('tezos:home-layout-preview', syncHotTodaySurfaceVisibility);
}

function settleMilestoneCardArrivals(island) {
  island?.querySelectorAll('.pulse-ticker-item[data-pulse-weight="milestone"].is-arriving').forEach((card) => {
    window.setTimeout(() => {
      if (card.isConnected) card.classList.remove('is-arriving');
    }, MILESTONE_CARD_ARRIVAL_MS);
  });
}

function pulseHasConfirmedStats(stats = {}) {
  return finiteNumber(stats.cycle) != null
    && finiteNumber(stats.blockLevel) != null
    && stats?._quality?.status !== 'unavailable';
}

function scheduleHotTodayInitialTimeout() {
  if (hotTodayInitialTimer || lastHotTodayDataState !== 'loading'
    || document.visibilityState !== 'visible' || !hotTodaySurfaceVisible()) return;
  hotTodayLoadingStartedAt ??= Date.now();
  const remaining = Math.max(0, HOT_TODAY_INITIAL_TIMEOUT_MS - (Date.now() - hotTodayLoadingStartedAt));
  hotTodayInitialTimer = window.setTimeout(() => {
    hotTodayInitialTimer = null;
    if (document.visibilityState !== 'visible' || !hotTodaySurfaceVisible()
      || lastHotTodayDataState !== 'loading') return;
    renderHotTodayState('unavailable', lastStats || {});
  }, remaining);
}

function renderHotTodayState(state, stats = lastStats || {}) {
  const island = pulseTickerElement();
  if (!island) return;
  // Early source failures must not bypass the initial loading window. Real
  // results (including confirmed quiet reads) still render without a delay.
  if (state === 'unavailable' && lastHotTodayDataState === 'loading') {
    hotTodayLoadingStartedAt ??= Date.now();
    if (Date.now() - hotTodayLoadingStartedAt < HOT_TODAY_INITIAL_TIMEOUT_MS) {
      scheduleHotTodayInitialTimeout();
      return;
    }
  }
  const loading = state === 'loading';
  const quiet = state === 'quiet';
  lastHotTodayDataState = state;
  if (!loading) hotTodaySignals = [];
  if (!hotTodaySurfaceVisible()) return;
  const title = quiet ? 'The network is steady' : 'Live Pulse is unavailable';
  const text = quiet
    ? 'No signal clears the headline threshold in the latest available read.'
    : 'The live read did not arrive. Last-good history and source status remain available in Network Pulse.';
  island.hidden = false;
  renderPulseTickerState(state, {
    title,
    text,
    route: networkFeatureRoute('network')
  });
  setHotTodayLiveText('clock', loading ? 'Syncing' : hotTodayClockLabel());
  hotTodayHasRendered = !loading;
  wireNetworkContextNavigation(island);
  wireHotTodayRealtime();
  if (loading) scheduleHotTodayInitialTimeout();
  if (!loading) {
    if (hotTodayInitialTimer) window.clearTimeout(hotTodayInitialTimer);
    hotTodayInitialTimer = null;
    scheduleHotSignalExpiryRefresh([]);
    captureDailySnapshot(stats);
  }
}

function schedulePulseHistoryLoad() {
  if (typeof window === 'undefined' || pulseHistoryLoadScheduled || pulseHistoryLoadInFlight) return;
  if (document.visibilityState !== 'visible') return;
  pulseHistoryLoadScheduled = true;
  const load = () => {
    pulseHistoryLoadInFlight = Promise.all([
      getPulseHistoryReceipt(),
      getPulseDomainReceipt()
    ]).then(([historyReceipt, domainReceipt]) => {
      lastPulseHistoryReceipt = historyReceipt;
      lastPulseDomainReceipt = domainReceipt;
      pulseHistoryRevision += 1;
      lastLiveCandidateFingerprint = '';
      scheduleHotSignalRender();
      rerenderCachedBriefing();
    }).catch(() => {
      // History is additive context. Current cards remain usable without it.
    }).finally(() => {
      pulseHistoryLoadInFlight = null;
      void prepareDailyCurio();
    });
  };
  if ('requestIdleCallback' in window) window.requestIdleCallback(load, { timeout: 2500 });
  else window.setTimeout(load, 0);
}

function renderToHotIsland(cycle, sentences, stats = lastStats || {}) {
  const island = pulseTickerElement();
  if (!island) return;
  hotTodayBriefingSentences = Array.isArray(sentences) ? sentences : [];
  if (!hotTodaySurfaceVisible()) return;
  const briefingSignals = (Array.isArray(sentences) ? sentences : [])
    .map(normalizeSignal)
    .filter(signal => signal.text);
  const stripHasGovernance = governanceAlertStripVisible();
  const nonRedundantBriefing = briefingSignals
    .filter(signal => !isHeaderDuplicateSignal(signal))
    .filter(signal => !(stripHasGovernance && signal.category === 'governance'));
  const fallbackBriefing = briefingSignals
    .filter(signal => !['cycle', 'security', 'network', 'staking'].includes(signal.category))
    .filter(signal => !(stripHasGovernance && signal.category === 'governance'));
  const baseSignals = mergeHotSignals(
    [...releaseRadarSignals(), ...getLiveCandidateSignals(stats)],
    hotPoolSignals(),
    [...nonRedundantBriefing, ...fallbackBriefing]
  );
  const signals = selectHotSignalSet(appendDailyCurio(baseSignals));
  if (!signals.length) {
    renderHotTodayState(pulseHasConfirmedStats(stats) ? 'quiet' : 'unavailable', stats);
    window.dispatchEvent(new CustomEvent('hot-signal-rendered', {
      detail: { top: null, milestone: null, count: 0 }
    }));
    return;
  }
  hotTodaySignals = signals;
  scheduleHotSignalExpiryRefresh(hotTodaySignals);
  island.hidden = false;
  const tickerSignals = signals.map(preparePulseTickerSignal);
  renderPulseTicker(tickerSignals, { hasRendered: hotTodayHasRendered });
  hotTodayHasRendered = true;
  lastHotTodayDataState = 'ready';
  lastHotTodayGoodAt = Math.max(
    Date.now(),
    ...signals.map(signal => finiteNumber(signal.observedAt) || 0)
  );
  if (hotTodayInitialTimer) {
    window.clearTimeout(hotTodayInitialTimer);
    hotTodayInitialTimer = null;
  }
  settleMilestoneCardArrivals(island);
  wireHotTodayMilestoneSharing(island);
  wireReleaseRadarActions(island);
  wireNetworkContextNavigation(island);
  wireHotTodayRealtime();
  syncOpenReleaseRadarOverlay();
  refreshHotTodayLiveMetrics();
  const milestoneSignal = getMilestoneHotSignal(hotTodaySignals);
  window.dispatchEvent(new CustomEvent('hot-signal-rendered', {
    detail: {
      top: getTopHotSignal(),
      milestone: hotSignalPayload(milestoneSignal),
      count: hotTodaySignals.length
    }
  }));
  captureDailySnapshot(stats);
  schedulePulseHistoryLoad();
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
    const currentAddress = String(window._myTezosData?.fullAddress || '');
    if (currentAddress && currentAddress !== lastPersonalContextAddress) {
      lastPortfolioContext = null;
      lastMemoryContext = null;
      lastPersonalContextAddress = currentAddress;
    }
    if (lastStats?.cycle) {
      updateDailyBriefing(lastStats, lastXtzPrice).catch(() => rerenderCachedBriefing());
    } else {
      rerenderCachedBriefing();
    }
  });
  window.addEventListener('my-tezos-portfolio-ready', (event) => {
    const detail = event.detail;
    if (!detail?.totals) return;
    lastPortfolioContext = {
      totals: detail.totals,
      count: Number(detail.count) || 1,
      prices: detail.prices || null,
      timestamp: Number(detail.timestamp) || Date.now()
    };
    scheduleHotSignalRender();
    rerenderCachedBriefing();
  });
  window.addEventListener('my-tezos-memory-ready', (event) => {
    const detail = event.detail;
    const activities = Array.isArray(detail?.activities) ? detail.activities : [];
    lastMemoryContext = {
      addressSet: Array.isArray(detail?.compositionAddresses) ? detail.compositionAddresses.join('|') : '',
      activityCount: activities.length,
      latestActivity: activities[0] || null,
      status: detail?.status || 'cached'
    };
    rerenderCachedBriefing();
  });
  window.addEventListener('my-tezos-linked-l2-changed', rerenderCachedBriefing);
}

function closeDrawerForNetworkRoute(route) {
  if (route === '#my-baker') return;
  document.getElementById('my-tezos-drawer')?.classList.remove('open');
  document.getElementById('my-tezos-drawer-scrim')?.classList.remove('open');
  document.body.style.overflow = '';
}

function scrollDrawerToBakerStats() {
  window.dispatchEvent(new CustomEvent('my-tezos-view-request', { detail: { view: 'baker-signal' } }));
  const target = document.getElementById('drawer-baker') || document.getElementById('drawer-operator-status');
  target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function wireNetworkContextNavigation(container) {
  if (!container || container.dataset.networkNavigationWired === 'true') return;
  container.dataset.networkNavigationWired = 'true';
  container.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('[data-network-route]');
    if (!link || !container.contains(link)) return;
    const route = link.getAttribute('data-network-route') || '';
    if (!route) return;

    event.preventDefault();
    const myTezosView = link.getAttribute('data-my-tezos-view-route');
    if (myTezosView) {
      window.dispatchEvent(new CustomEvent('my-tezos-view-request', { detail: { view: myTezosView } }));
      return;
    }
    closeDrawerForNetworkRoute(route);

    if (!route.startsWith('#')) {
      window.location.assign(route);
      return;
    }

    if (window.location.hash === route) {
      window.dispatchEvent(new Event('hashchange'));
    } else {
      window.location.hash = route;
    }

    if (route === '#my-baker') {
      setTimeout(scrollDrawerToBakerStats, 120);
    }
  });
}

function selectDrawerNetworkSignals(sentences, profile, data, portfolio, relevanceContext = personalSignalContext(data, portfolio)) {
  const liveSignals = [...releaseRadarSignals(), ...getLiveCandidateSignals(lastStats || {})]
    .filter(signal => signal.text && !signal.hotOnly)
    .map(signal => ({
      ...signal,
      score: (finiteNumber(signal.score) || 0) + scoreBoostFor(signal.category, profile)
    }));
  const briefingSignals = (Array.isArray(sentences) ? sentences : [])
    .map(normalizeSignal)
    .filter(signal => signal.text && !signal.hotOnly)
    .map(signal => ({
      ...signal,
      score: (finiteNumber(signal.score) || 0) + scoreBoostFor(signal.category, profile)
    }));
  const poolSignals = hotPoolSignals()
    .filter(signal => signal.text && !signal.hotOnly)
    .map(signal => ({
      ...signal,
      score: (finiteNumber(signal.score) || 0) + scoreBoostFor(signal.category, profile)
    }));
  const merged = mergeHotSignals(liveSignals, poolSignals, briefingSignals);
  const personal = merged.filter(signal => personalSignalRelevance(signal, data, portfolio, relevanceContext));
  const notable = merged.filter(signal => signal.spectacle !== 'quiet');
  const selected = [];
  const selectedIds = new Set();
  for (const signal of [...personal, ...notable]) {
    if (selectedIds.has(signal.id)) continue;
    selected.push(signal);
    selectedIds.add(signal.id);
  }
  for (const signal of merged) {
    if (selected.length >= 4) break;
    if (selectedIds.has(signal.id)) continue;
    selected.push(signal);
    selectedIds.add(signal.id);
  }
  return rankSignalsByPersonalRelevance(selected, relevanceContext, effectiveHotScore)
    .slice(0, 4);
}

function renderDrawerMilestoneLine(signals = getLiveCandidateSignals(lastStats || {})) {
  const milestone = signals.find(signal => signal.tone === 'milestone' && signal.milestoneStatus === 'crossed')
    || signals.find(signal => signal.tone === 'milestone' && signal.milestoneStatus === 'near');
  if (!milestone) return '';
  const route = routeForSignal(milestone);
  const status = milestone.milestoneStatus === 'crossed' ? 'Confirmed' : 'Approaching';
  return `
    <a class="network-context-milestone-line" href="${escapeHtml(route)}" data-network-route="${escapeHtml(route)}">
      <span aria-hidden="true">✦</span>
      <small>${escapeHtml(status)}</small>
      <strong>${escapeHtml(milestone.title)}</strong>
      <em>${escapeHtml(milestone.text)}</em>
      <span aria-hidden="true">↗</span>
    </a>
  `;
}

function renderToDrawer(cycle, sentences) {
  const container = document.getElementById('drawer-network');
  if (!container) return;
  const profile = getCurrentMyTezosProfile();
  const data = window._myTezosData || {};
  const portfolio = personalPortfolioSnapshot(data);
  const relevanceContext = personalSignalContext(data, portfolio);
  const spotlight = buildPersonalSpotlight(data, profile, portfolio);
  const facts = buildPersonalFacts(data, profile, portfolio);
  const signals = selectDrawerNetworkSignals(sentences, profile, data, portfolio, relevanceContext);
  const lead = getBriefingLead(profile, signals);
  const html = `
    <section class="network-context-panel">
      <div class="network-context-header">
        <div>
          <span class="network-context-kicker">Personalized Network Context</span>
          <a class="network-context-title" href="#health" data-network-route="#health" aria-label="Open Network Health">Your Tezos, right now</a>
        </div>
        <a class="network-context-cycle" href="#history" data-network-route="#history" aria-label="${escapeHtml(`Open protocol history for cycle ${cycle}`)}">Cycle ${escapeHtml(String(cycle))}</a>
      </div>
      <div class="network-context-columns">
        <section class="network-personal-spotlight network-personal-spotlight-${escapeHtml(spotlight.tone)}" aria-labelledby="network-personal-title">
          <div class="network-personal-spotlight-copy">
            <span class="network-personal-eyebrow">${escapeHtml(spotlight.eyebrow)}</span>
            <h4 id="network-personal-title" data-magic-text>${escapeHtml(spotlight.title)}</h4>
            <p>${escapeHtml(spotlight.text)}</p>
          </div>
          <div class="network-context-focus" aria-label="Your context lenses">
            ${renderFocusChips(profile)}
          </div>
          <div class="network-personal-facts">
            ${facts.map(renderPersonalFact).join('')}
          </div>
        </section>
        <section class="network-live-column" aria-labelledby="network-live-title">
          <div class="network-away-slot" data-network-away-slot data-quiet-key="network-away-slot"></div>
          <div class="network-context-now-heading">
            <div>
              <span>Tezos right now</span>
              <strong id="network-live-title">Signals worth your attention</strong>
            </div>
            <a href="${escapeHtml(networkFeatureRoute('network'))}" data-network-route="${escapeHtml(networkFeatureRoute('network'))}" aria-label="${escapeHtml(networkFeatureLabel('network'))}">Open Network Pulse <span aria-hidden="true">↗</span></a>
          </div>
          <p class="network-context-lede" data-magic-text>${escapeHtml(lead)}</p>
          ${renderDrawerMilestoneLine()}
          <div class="network-context-signals">
            ${signals.map((signal, index) => renderSignalCard(signal, index, data, portfolio, relevanceContext)).join('')}
          </div>
        </section>
      </div>
    </section>
  `;
  if (container.children.length) quietlySyncHtml(container, html);
  else container.innerHTML = html;
  wireNetworkContextNavigation(container);
  window.dispatchEvent(new Event('my-tezos-network-context-rendered'));
}

export async function initDailyBriefing(stats, xtzPrice) {
  wirePersonalizationRefresh();
  void loadReleaseRadarSignal();
  const mergedStats = mergePulseStats(stats);
  if (!mergedStats?.cycle) return;
  lastXtzPrice = xtzPrice;
  lastLiveCandidateFingerprint = '';
  const briefing = await generate(mergedStats, xtzPrice);
  renderToDrawer(briefing.cycle, briefing.sentences);
  try { localStorage.setItem(LS_LAST_SEEN, String(briefing.cycle)); } catch {}
}

export async function updateDailyBriefing(stats, xtzPrice) {
  wirePersonalizationRefresh();
  const mergedStats = mergePulseStats(stats);
  if (!mergedStats?.cycle) return;
  lastXtzPrice = xtzPrice;
  lastLiveCandidateFingerprint = '';
  const briefing = await generate(mergedStats, xtzPrice);
  renderToDrawer(briefing.cycle, briefing.sentences);
  try { localStorage.setItem(LS_LAST_SEEN, String(briefing.cycle)); } catch {}
}

export async function initHotTodayIsland(stats, xtzPrice) {
  if (hotTodayWired) return;
  hotTodayWired = true;
  const mergedStats = mergePulseStats(stats);
  lastXtzPrice = xtzPrice ?? lastXtzPrice;
  const island = pulseTickerElement();
  if (!island) return;
  mountPulseTicker();
  wireHotTodayVisibility();
  if (hotTodaySurfaceVisible()) {
    renderHotTodayState('loading', mergedStats);
  }
  wireNetworkContextNavigation(island);
  wireHotTodayRealtime();
  schedulePulseHistoryLoad();
  await withTimeout(loadReleaseRadarSignal(), 2500);
  if (mergedStats?.cycle) await updateHotTodayIsland(mergedStats, xtzPrice);
}

export async function updateHotTodayIsland(stats, xtzPrice) {
  void loadReleaseRadarSignal();
  const mergedStats = mergePulseStats(stats);
  if (!mergedStats?.cycle) return;
  lastXtzPrice = xtzPrice;
  lastLiveCandidateFingerprint = '';
  try {
    const briefing = await generate(mergedStats, xtzPrice);
    renderToHotIsland(briefing.cycle, briefing.sentences, mergedStats);
  } catch (error) {
    console.warn('Live Pulse refresh failed; preserving the last-good surface.', error);
    if (!hotTodaySurfaceVisible()) return;
    if (hotTodaySignals.length && hotTodayHasRendered) {
      lastHotTodayDataState = 'stale';
      pulseTickerElement()?.setAttribute('data-pulse-state', 'stale');
      refreshHotTodayLiveMetrics();
    } else {
      renderHotTodayState('unavailable', mergedStats);
    }
  }
}

export function getTopHotSignal() {
  return hotSignalPayload(hotTodaySignals[0]);
}

export function getDailyDeltaSignalSummaries(limit = 3) {
  const cap = Math.max(0, Math.min(5, Number(limit) || 0));
  const snapshot = dailySnapshotReference();
  const since = snapshotSinceLabel(snapshot);
  const dayStart = snapshot?.day ? Date.parse(`${snapshot.day}T00:00:00Z`) : null;
  const referenceAt = finiteNumber(snapshot?.capturedAt)
    || (Number.isFinite(dayStart) ? dayStart : null);
  return getLiveCandidateSignals(lastStats || {})
    .filter(signal => signal.id.startsWith('daily-') && signal.text)
    .sort((a, b) => effectiveHotScore(b) - effectiveHotScore(a))
    .slice(0, cap)
    .map(signal => ({
      id: signal.id,
      category: signal.category,
      title: signal.title,
      text: signal.text,
      detail: signal.detail,
      context: signal.context,
      startedAt: signal.startedAt,
      observedAt: signal.observedAt,
      since,
      referenceAt
    }));
}

export function activateHotTodaySignal(categoryOrIndex) {
  if (!hotTodaySignals.length) return false;
  const raw = String(categoryOrIndex || '').trim();
  const index = /^\d+$/.test(raw)
    ? Number(raw)
    : hotTodaySignals.findIndex(signal => signal.category === safeCssToken(raw) || signal.id === safeCssToken(raw));
  if (index < 0) return false;
  return holdPulseTickerSignal(hotTodaySignals[index].id);
}
