import { requestChamberClose, bindChamberVisibility } from '../ui/chamber-accessibility.js';
/**
 * Network Health
 * Tracks recent Tezos attestation power against the 7,000-power block committee.
 */

import { API_URLS, REFRESH_INTERVALS } from '../core/config.js';
import { getCalendarElapsedTime } from '../core/anniversary.js';
import { classifyOctezVersion, fetchOctezVersions, octezVersionsFallback } from '../core/octez-versions.js';
import { versionedAsset } from '../core/asset-version.js';
import { escapeHtml, formatFreshnessStamp, refreshDataFreshnessStates, setDataFreshnessState } from '../core/utils.js';
import { fetchCycleInfo, fetchHeroStats, fetchWithRetry } from '../core/api.js';
import { readSavedMyTezosEntries } from '../core/wallet.js';
import { activateChamberDialog, deactivateChamberDialog, wireChamberLauncher } from '../ui/chamber-accessibility.js';
import { ensureChamberStylesheet } from '../ui/chamber-styles.js';
import { quietlyMutate, quietlySyncElement, quietlySyncHtml } from '../core/quiet-refresh.js';
import { loadDataAsset } from '../core/data-assets.js';
import { BLOCK_STORY_FILTER_TYPES, classifyBlockStory, compileBlockStoryCatalog } from '../core/block-story.mjs';
import { ETHERLINK_GOVERNANCE_CURRENT_CONTRACTS } from '../core/etherlink-governance-contracts.mjs';

const TZKT = API_URLS.tzkt;
const TEZTALE = API_URLS.teztale;
const OCTEZ_MAINNET = API_URLS.octezMainnet;
const POWER_PER_BLOCK = 7000;
const TARGET_BLOCK_SECONDS = 6;
const CHAIN_HEALTH_BLOCK_LIMIT = 25;
const LAST_BLOCK_LIMIT = CHAIN_HEALTH_BLOCK_LIMIT;
const HEALTH_CARD_BLOCK_LIMIT = 5;
const CHAMBER_BLOCK_LIMIT = 15;
const CHAMBER_EXPANDED_MOBILE_BLOCK_LIMIT = 12;
const CHAMBER_COMPACT_DESKTOP_BLOCK_LIMIT = 8;
const CHAMBER_COMPACT_MOBILE_BLOCK_LIMIT = 6;
const TEZTALE_BLOCK_LOOKBACK = 12;
const TEZTALE_QUORUM_TARGET = 2 / 3;
const TEZTALE_RECEPTION_BIN_MS = 500;
const TEZTALE_RECEPTION_MIN_WINDOW_MS = 3000;
const TEZTALE_RECEPTION_MAX_WINDOW_MS = 6000;
const TEZTALE_REPORT_URL = 'https://nomadic-labs.gitlab.io/teztale-dataviz/';
const TEZTALE_SOURCE_URL = 'https://gitlab.com/nomadic-labs/teztale';
const MISSED_BLOCK_LOOKBACK = 120;
const MISSED_RIGHTS_LIMIT = 90;
const RANGE_PAGE_LIMIT = 10000;
const SAMPLE_SIZE = 180;
const PERIOD_TTL = 30 * 60 * 1000;
const LIVE_REFRESH_INTERVAL = 6 * 1000;
const CHAMBER_REFRESH_INTERVAL = 6 * 1000;
const AGE_TICK_INTERVAL = 1000;
const LIVE_HEAD_DELAYED_AFTER = 18 * 1000;
const LIVE_HEAD_STALLED_AFTER = 30 * 1000;
const LIVE_HEAD_CONFIRMATION_MAX_AGE = LIVE_REFRESH_INTERVAL * 2 + 2000;
const LIVE_HEAD_INSPECTOR_CLOSE_DELAY = 420;
const BLOCK_PULSE_THROTTLE = 4 * 1000;
const ACTIVITY_TAPE_TTL = 60 * 1000;
const ACTIVITY_TAPE_LIMIT = 5;
const USAGE_PULSE_TTL = 60 * 1000;
const USAGE_WINDOW_MS = 60 * 60 * 1000;
const USAGE_AMOUNT_PAGE_LIMIT = 10000;
const HEARTBEAT_ACTIVITY_LIMIT = 10000;
const HEARTBEAT_STAKING_LIMIT = 20;
const HEARTBEAT_L1_VOTING_LIMIT = 1000;
const HEARTBEAT_TOKEN_TRANSFER_LIMIT = 250;
const HEARTBEAT_MANAGER_ENRICHMENT_LIMIT = 100;
const LIVE_HEAD_POWER_DETAIL_THRESHOLD = 6969;
const LIVE_HEAD_DETAIL_MIN_WIDTH = 420;
const HEARTBEAT_SUPPLEMENT_MAX_AGE = 2 * 60 * 1000;
const HEARTBEAT_ACTIVITY_CACHE_LIMIT = 2 * CHAIN_HEALTH_BLOCK_LIMIT;
const CYCLE_TIMING_LIMIT = 8;
const CYCLE_TIMING_TTL = 10 * 60 * 1000;
const CONTESTED_ROUND_HOT_SIGNAL_TTL = 30 * 60 * 1000;
const CONTESTED_ROUND_HOT_SIGNAL_COOLDOWN = 60 * 60 * 1000;
const CYCLE_TARGET_SECONDS_FALLBACK = 24 * 60 * 60;
const CYCLE_DRIFT_PEAK_PCT = 1;
const CYCLE_DRIFT_WATCH_PCT = 3;
const CYCLE_DRIFT_DEGRADED_PCT = 4;
const PROTOCOL_CONSTANTS_TTL = 30 * 60 * 1000;
const NAKAMOTO_TTL = 10 * 60 * 1000;
const NAKAMOTO_SOURCES_TTL = 6 * 60 * 60 * 1000;
const NAKAMOTO_SOURCES_URL = '/data/nakamoto-sources.json';
const NAKAMOTO_RPC_PATH = '/chains/main/blocks/head/helpers/baking_power_distribution_for_current_cycle';
const TENDERBAKE_DOCS_URL = 'https://octez.tezos.com/docs/active/consensus.html';
const NETWORK_HEALTH_CSS_URL = versionedAsset('/css/network-health.min.css');
const STORAGE_KEY = 'tezos-systems-network-health';
const MY_BAKER_STORAGE_KEY = 'tezos-systems-my-baker-address';
// Do not let a legacy R1 alert suppress an R2+ event after the threshold changes.
const CONTESTED_ROUND_SIGNAL_KEY = 'tezos-systems-contested-round-r2-signal-at';
const LIVE_HEAD_ACTIVITY_FILTER_STORAGE_KEY = 'tezos-systems-live-head-activity-filter-v3';
const LIVE_HEAD_ACTIVITY_FILTER_V2_STORAGE_KEY = 'tezos-systems-live-head-activity-filter-v2';
const LIVE_HEAD_ACTIVITY_FILTER_LEGACY_STORAGE_KEY = 'tezos-systems-live-head-activity-filter-v1';
const LIVE_HEAD_MY_TEZOS_STORAGE_KEY = 'tezos-systems-live-head-my-tezos-only-v1';
const LIVE_HEAD_DEPTH_STORAGE_KEY = 'tezos-systems-live-head-depth-v1';
const LIVE_HEAD_DEPTH_MODES = ['compact', '10', '15', '20', 'custom'];
const LIVE_HEAD_MAX_ROWS = CHAIN_HEALTH_BLOCK_LIMIT;
const LIVE_HEAD_ACTIVITY_TYPES = [...BLOCK_STORY_FILTER_TYPES];
const LIVE_HEAD_ACTIVITY_V2_TYPES = ['l1-vote', 'l2-vote', 'transfers', 'art', 'defi', 'gaming', 'bridge', 'etherlink', 'stake', 'unstake'];
const ETHERLINK_GOVERNANCE_CURRENT_ADDRESS_SET = new Set(Object.values(ETHERLINK_GOVERNANCE_CURRENT_CONTRACTS));
const ETHERLINK_GOVERNANCE_ENTRYPOINTS = new Set(['new_proposal', 'upvote', 'upvote_proposal', 'vote']);

const PERIODS = [
    { key: '24h', label: '24H', hours: 24, exactLimit: 22000 },
    { key: '7d', label: '7D', hours: 24 * 7 },
    { key: '31d', label: '31D', hours: 24 * 31 }
];

let refreshTimer = null;
let refreshInFlight = null;
let cachedData = null;
let lastFullFetch = 0;
let lastBlockPulseFetch = 0;
let lastBlockPulseAt = 0;
let chamberTimer = null;
let ageTimer = null;
let chamberRefreshInFlight = false;
let lastContestedRoundSignalAt = 0;
let savedBodyOverflow = null;
let savedHtmlOverflow = null;
let activityTapeCache = [];
let activityTapeCacheAt = 0;
let activityTapeInFlight = null;
let activityTapeInFlightPriority = 'normal';
let activityTapeRequestSequence = 0;
let activityTapeAppliedSequence = 0;
let usagePulseCache = null;
let usagePulseCacheAt = 0;
let usagePulseInFlight = null;
let liveHeadAnimationTimer = null;
let heartbeatData = null;
let heartbeatNextRightCache = null;
let heartbeatNextRightInFlight = null;
const heartbeatActivityInFlight = new Map();
const heartbeatActivityEnrichmentInFlight = new Map();
const heartbeatActivityCache = new Map();
let heartbeatL1VotingCoverage = null;
let heartbeatL1VotingInFlight = null;
const liveHeadMissedStateCache = new Map();
let heartbeatStoryCatalog = null;
let heartbeatProtocolMilestones = null;
let heartbeatStoryCatalogInFlight = null;
let heartbeatMissedRightsCache = null;
let heartbeatMissedRightsInFlight = null;
let heartbeatMissedRightsFailureRange = null;
const heartbeatBakingMisses = new Map();
let heartbeatGasLimitCache = null;
let heartbeatGasLimitCacheAt = 0;
let heartbeatGasLimitInFlight = null;
let liveHeadPillResizeObserver = null;
let liveHeadPillFitFrame = null;
let liveHeadExpanded = false;
let liveHeadDepthMode = 'compact';
let liveHeadCustomRows = 20;
let liveHeadDepthControlsWired = false;
let recentBlockSupplementBlocks = [];
let recentBlockSupplementInFlight = false;
let recentBlockSupplementQueued = false;
let liveHeadActivityFiltersLoaded = false;
let liveHeadSelectedActivityTypes = new Set(LIVE_HEAD_ACTIVITY_TYPES);
let liveHeadMyTezosOnlyLoaded = false;
let liveHeadMyTezosOnly = false;
let liveHeadMyTezosControlsWired = false;
let liveHeadInspectorCloseTimer = null;
let liveHeadInspectorResumeTimer = null;
let liveHeadInspectorLevel = null;
let liveHeadInspectorAnchor = null;
let liveHeadPointerPosition = { x: null, y: null };
let liveHeadInspectorSuppressedPointerPosition = null;
let liveHeadPendingUpdate = null;
let liveHeadConfirmedAt = 0;
let liveHeadConfirmedLevel = 0;
let liveHeadStallLatchedLevel = 0;
let liveHeadResumePendingLevel = 0;
let heartbeatVisibilityWired = false;
let dashboardHealthInitialized = false;
let chamberContinuity = null;
let chamberContinuityAt = 0;
let chamberContinuityWork = null;
let suppressNextHeartbeatMotion = false;
let cycleTimingCache = null;
let cycleTimingCacheAt = 0;
let cycleTimingInFlight = null;
let cycleTimingInFlightPriority = 'normal';
let cycleTimingRequestSequence = 0;
let cycleTimingAppliedSequence = 0;
let currentCycleCache = null;
let protocolConstantsCache = null;
let protocolConstantsCacheAt = 0;
let nakamotoCache = null;
let nakamotoCacheAt = 0;
let nakamotoInFlight = null;
let nakamotoSourcesCache = null;
let nakamotoSourcesCacheAt = 0;
let nakamotoSourcesInFlight = null;

function ensureNetworkHealthCss() {
    return ensureChamberStylesheet('network-health-css', NETWORK_HEALTH_CSS_URL);
}

function formatCount(value) {
    return Number(value || 0).toLocaleString('en-US');
}

function formatPct(value) {
    if (!Number.isFinite(value)) return '--';
    return value >= 99.95 ? value.toFixed(2) : value.toFixed(1);
}

function formatCompactPower(value) {
    if (!Number.isFinite(value)) return '--';
    return Intl.NumberFormat('en-US', {
        notation: 'compact',
        maximumFractionDigits: value >= 100000000 ? 2 : 1
    }).format(value);
}

function formatTezAmount(value) {
    if (!Number.isFinite(value)) return '--';
    if (value >= 1000) return formatCompactPower(value);
    if (value >= 1) return value.toFixed(2);
    if (value >= 0.001) return value.toFixed(3);
    return value > 0 ? '~0' : '0';
}

function formatBlockDenominator(value) {
    if (!Number.isFinite(value)) return '/--';
    if (value === POWER_PER_BLOCK) return '/7k';
    if (value >= 1000 && value % 1000 === 0) return `/${value / 1000}k`;
    return `/${value.toLocaleString()}`;
}

function formatSeconds(value) {
    if (!Number.isFinite(value)) return '--';
    if (value < 10 && value % 1 !== 0) return `${value.toFixed(1)}s`;
    return `${Math.round(value)}s`;
}

function formatDuration(value) {
    const seconds = Math.abs(Number(value));
    if (!Number.isFinite(seconds)) return '--';
    const totalMinutes = Math.round(seconds / 60);
    if (totalMinutes <= 0) return `${Math.round(seconds)}s`;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}

function formatSignedDuration(value) {
    const seconds = Number(value);
    if (!Number.isFinite(seconds)) return '--';
    if (Math.abs(seconds) < 30) return 'on target';
    return `${seconds > 0 ? '+' : '-'}${formatDuration(seconds)}`;
}

function formatSignedPct(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '--';
    const sign = number > 0 ? '+' : '';
    return `${sign}${number.toFixed(2)}%`;
}

function formatAge(timestamp) {
    if (!timestamp) return '--';
    const timestampMs = new Date(timestamp).getTime();
    if (!Number.isFinite(timestampMs)) return '--';
    const diff = Date.now() - timestampMs;
    if (diff < 0) return 'just now';
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ${minutes % 60}m ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h ago`;
}

function formatTickerAge(timestamp) {
    if (!timestamp) return '--';
    const timestampMs = new Date(timestamp).getTime();
    if (!Number.isFinite(timestampMs)) return '--';
    const diff = Date.now() - timestampMs;
    if (diff < 0) return '00s';
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return `${String(seconds).padStart(2, '0')}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${String(minutes).padStart(2, '0')}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${String(hours).padStart(2, '0')}h`;
    const days = Math.floor(hours / 24);
    return `${Math.min(days, 99).toString().padStart(2, '0')}d`;
}

function formatHeartbeatDue(timestamp) {
    if (!timestamp) return 'right syncing';
    const timestampMs = new Date(timestamp).getTime();
    if (!Number.isFinite(timestampMs)) return 'right syncing';
    const diffSeconds = Math.ceil((timestampMs - Date.now()) / 1000);
    if (diffSeconds > 0) return `in ${String(Math.min(diffSeconds, 99)).padStart(2, '0')}s`;
    if (diffSeconds >= -1) return 'due now';
    return `R0 due ${String(Math.min(Math.abs(diffSeconds), 99)).padStart(2, '0')}s ago`;
}

function getHeadTimestamp(data) {
    return data?.headTimestamp || data?.blocks?.[0]?.timestamp || null;
}

function healthAgeAttr(timestamp) {
    return timestamp ? ` data-health-age="${escapeHtml(timestamp)}"` : '';
}

function refreshHealthAgeLabels(root = document) {
    const standaloneClock = root.querySelector('#chain-uptime-counter[data-health-own-clock]');
    if (standaloneClock) standaloneClock.textContent = healthChainAge();
    const pauseLiveHead = liveHeadReadingPaused();
    root.querySelectorAll('[data-health-age]').forEach((element) => {
        if (pauseLiveHead && element.closest('#live-head')) return;
        const formatter = element.dataset.healthAgeFormat === 'ticker' ? formatTickerAge : formatAge;
        element.textContent = formatter(element.dataset.healthAge);
    });
    root.querySelectorAll('[data-heartbeat-due]').forEach((element) => {
        if (pauseLiveHead && element.closest('#live-head')) return;
        element.textContent = formatHeartbeatDue(element.dataset.heartbeatDue);
    });
    refreshDataFreshnessStates(root);
    if (!pauseLiveHead) updateLiveHeadStallAlert(heartbeatData);
}

function startHealthAgeTicker() {
    if (ageTimer) return;
    ageTimer = window.setInterval(() => {
        if (document.visibilityState === 'visible') refreshHealthAgeLabels(document);
    }, AGE_TICK_INTERVAL);
}

function confirmLiveHeadObservation(data) {
    const level = Number(data?.blocks?.[0]?.level);
    if (!Number.isFinite(level) || level <= 0) return;
    liveHeadConfirmedAt = Date.now();
    liveHeadConfirmedLevel = level;
    if (liveHeadStallLatchedLevel > 0 && level > liveHeadStallLatchedLevel) {
        liveHeadResumePendingLevel = level;
        liveHeadStallLatchedLevel = 0;
    }
}

function formatLiveHeadStallDuration(milliseconds) {
    const seconds = Math.max(0, Math.floor(Number(milliseconds) / 1000));
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`;
}

function updateLiveHeadStallAlert(data, { error = false } = {}) {
    const panel = document.getElementById('live-head');
    const alert = document.getElementById('live-head-alert');
    const stateBadge = panel?.querySelector('.live-head-state');
    if (!panel || !alert) return;
    if (!alert.dataset.liveHeadAlertWired) {
        alert.dataset.liveHeadAlertWired = '1';
        alert.addEventListener('click', openNetworkHealthChamber);
    }

    const latest = data?.blocks?.[0] || null;
    const level = Number(latest?.level);
    const timestampMs = new Date(latest?.timestamp || '').getTime();
    const now = Date.now();
    const ageMs = Number.isFinite(timestampMs) ? Math.max(0, now - timestampMs) : 0;
    const sourceConfirmed = !error
        && Number.isFinite(level)
        && liveHeadConfirmedLevel === level
        && now - liveHeadConfirmedAt <= LIVE_HEAD_CONFIRMATION_MAX_AGE;
    const previousState = panel.dataset.chainState || 'warming';
    let state = error ? 'source-delayed' : 'warming';

    if (liveHeadStallLatchedLevel > 0 && Number.isFinite(level) && level <= liveHeadStallLatchedLevel) {
        state = 'stalled';
    } else if (sourceConfirmed && ageMs >= LIVE_HEAD_STALLED_AFTER) {
        liveHeadStallLatchedLevel = level;
        state = 'stalled';
    } else if (sourceConfirmed && ageMs >= LIVE_HEAD_DELAYED_AFTER) {
        state = 'delayed';
    } else if (sourceConfirmed) {
        state = 'live';
    }

    panel.dataset.chainState = state;
    alert.dataset.chainState = state;
    const visible = state === 'stalled' || state === 'delayed';
    alert.hidden = !visible;
    alert.setAttribute('aria-hidden', visible ? 'false' : 'true');
    if (stateBadge) {
        stateBadge.textContent = state === 'stalled' ? 'Stalled' : state === 'delayed' ? 'Delayed' : error ? 'Source delayed' : 'Live';
        stateBadge.setAttribute('aria-label', stateBadge.textContent);
    }

    if (visible) {
        const label = alert.querySelector('[data-live-head-alert-label]');
        const detail = alert.querySelector('[data-live-head-alert-detail]');
        if (label) label.textContent = state === 'stalled' ? 'CHAIN STALLED' : 'BLOCKS DELAYED';
        if (detail) {
            detail.textContent = state === 'stalled' && !sourceConfirmed
                ? `Last confirmed block #${formatCount(liveHeadStallLatchedLevel)} · source recheck delayed`
                : `No new block for ${formatLiveHeadStallDuration(ageMs)} · last confirmed #${formatCount(level)}`;
        }
    }

    const announcer = document.getElementById('chain-stall-announcer');
    if (announcer && previousState !== state) {
        if (state === 'stalled') {
            announcer.textContent = `Critical: Tezos chain stalled. No new block for ${formatLiveHeadStallDuration(ageMs)}. Last confirmed block ${formatCount(level)}.`;
        } else if (state === 'live' && (previousState === 'stalled' || liveHeadResumePendingLevel > 0)) {
            announcer.textContent = `Tezos block production resumed at block ${formatCount(liveHeadResumePendingLevel || level)}.`;
            liveHeadResumePendingLevel = 0;
        }
    }
}

function healthClass(score) {
    if (!Number.isFinite(score)) return 'unknown';
    if (score >= 99.5) return 'peak';
    if (score >= 98.5) return 'healthy';
    if (score >= 95) return 'watch';
    return 'degraded';
}

function healthLabel(score) {
    if (!Number.isFinite(score)) return 'Unknown';
    if (score >= 99.5) return 'Peak';
    if (score >= 98.5) return 'Healthy';
    if (score >= 95) return 'Watch';
    return 'Degraded';
}

function timingClass(seconds) {
    if (!Number.isFinite(seconds)) return 'unknown';
    if (seconds <= TARGET_BLOCK_SECONDS + 2) return 'peak';
    if (seconds <= TARGET_BLOCK_SECONDS + 6) return 'watch';
    return 'degraded';
}

function cycleTimingClass(driftPct) {
    if (!Number.isFinite(driftPct)) return 'unknown';
    const abs = Math.abs(driftPct);
    if (abs <= CYCLE_DRIFT_PEAK_PCT) return 'peak';
    if (abs <= CYCLE_DRIFT_WATCH_PCT) return 'healthy';
    if (abs <= CYCLE_DRIFT_DEGRADED_PCT) return 'watch';
    return 'degraded';
}

function cycleTimingLabel(driftPct) {
    if (!Number.isFinite(driftPct)) return 'Warming';
    const abs = Math.abs(driftPct);
    if (abs <= CYCLE_DRIFT_PEAK_PCT) return 'On target';
    if (abs <= CYCLE_DRIFT_WATCH_PCT) return driftPct > 0 ? 'Slightly slow' : 'Slightly fast';
    if (abs <= CYCLE_DRIFT_DEGRADED_PCT) return 'Watch';
    return driftPct > 0 ? 'Slow cycle' : 'Fast cycle';
}

function shortAddress(address) {
    if (!address) return 'Unknown baker';
    return `${address.slice(0, 7)}...${address.slice(-5)}`;
}

function bakerName(baker) {
    return baker?.alias || shortAddress(baker?.address);
}

function formatBakingPower(value) {
    const power = Number(value);
    if (!Number.isFinite(power)) return '--';
    return `${formatCompactPower(power / 1e6)} XTZ`;
}

function latestBlockStatus(block) {
    const score = Number.isFinite(block?.score) ? block.score : null;
    const power = Number(block?.power);
    const committee = Number(block?.committee);
    if (!Number.isFinite(score) || !Number.isFinite(power) || !Number.isFinite(committee) || committee <= 0) {
        return { label: 'Attestation unknown', className: 'unknown', safetyMargin: null, marginRatio: 0 };
    }
    const quorumPower = Math.ceil(committee * 2 / 3);
    const safetyMargin = power - quorumPower;
    const marginCapacity = Math.max(1, committee - quorumPower);
    const marginRatio = safetyMargin >= 0
        ? Math.min(1, safetyMargin / marginCapacity)
        : Math.min(1, Math.abs(safetyMargin) / quorumPower);
    const marginCopy = formatCount(Math.abs(safetyMargin));
    if (safetyMargin < 0) {
        return {
            label: `Risk: ${marginCopy} attestation power below quorum`,
            className: 'degraded',
            quorumPower,
            safetyMargin,
            marginRatio
        };
    }
    const className = score >= 99.5 ? 'peak' : score >= 98.5 ? 'healthy' : 'watch';
    return {
        label: `Safe by ${marginCopy} attestation power above quorum`,
        className,
        quorumPower,
        safetyMargin,
        marginRatio
    };
}

function chainHealthState(block) {
    const status = latestBlockStatus(block);
    if (status.className === 'unknown') return 'unknown';
    if (status.safetyMargin < 0) return 'risk';
    return status.className === 'watch' ? 'watch' : 'ok';
}

function chainHealthReadout(states) {
    const counts = { ok: 0, watch: 0, risk: 0, unknown: 0 };
    states.forEach((state) => { counts[state] += 1; });
    const total = states.length;
    const descriptions = [
        counts.ok ? `${counts.ok} at or above 98.5% attestation power` : '',
        counts.watch ? `${counts.watch} at quorum but below 98.5%` : '',
        counts.risk ? `${counts.risk} below quorum` : '',
        counts.unknown ? `${counts.unknown} unavailable` : ''
    ].filter(Boolean);
    const sentence = `Attestation health across the last ${total} blocks: ${descriptions.join(', ')}.`;
    if (counts.risk) return { text: `${counts.risk}/${total} RISK`, tone: 'risk', sentence };
    if (counts.watch) return { text: `${counts.watch}/${total} LOW`, tone: 'watch', sentence };
    if (counts.unknown) return { text: `${counts.unknown}/${total} ?`, tone: 'unknown', sentence };
    return { text: `${counts.ok}/${total} OK`, tone: 'ok', sentence };
}

function updateChainHealthReadout(button, readout, { loading = false, stale = false } = {}) {
    const element = document.getElementById('chain-health-readout');
    const text = stale ? 'STALE' : readout.text;
    if (element) {
        if (element.textContent !== text) {
            const fraction = text.match(/^(\d+)(\/\d+ .+)$/);
            const html = fraction
                ? `<span class="chain-health-count" data-quiet-key="chain-health-count">${escapeHtml(fraction[1])}</span>${escapeHtml(fraction[2])}`
                : escapeHtml(text);
            quietlySyncHtml(element, html);
        }
        element.dataset.tone = stale ? 'unknown' : readout.tone;
    }
    button.setAttribute('aria-busy', String(loading));
    button.removeAttribute('title');
    button.setAttribute('aria-label', `Chain health. ${readout.sentence} Hover or tap a line for missed bakers. Open Network Health Chamber from the label.`);
    const announcer = document.getElementById('chain-health-announcer');
    const tone = stale ? 'unknown' : readout.tone;
    if (announcer && button.dataset.announcedTone !== tone) {
        // Only entry into risk speaks. Clear every exit, including partial data,
        // so the same risk sentence can be announced again after recovery.
        announcer.textContent = tone === 'risk' ? readout.sentence : '';
        button.dataset.announcedTone = tone;
    }
}

// A bounded conveyor of attestation receipts, oldest left and newest right.
// Only a newly observed head moves it; supplements and catch-up stay motionless.
function updateChainHealthStrip(data, { error = false, supplemental = false, suppressMotion = false } = {}) {
    if (document.visibilityState !== 'visible') return;
    const button = document.getElementById('chain-health');
    const viewport = document.getElementById('chain-health-window');
    if (!button || !viewport) return;
    if (!button.dataset.chainHealthWired) {
        button.dataset.chainHealthWired = '1';
        button.addEventListener('click', (event) => {
            const bar = event.target.closest('[data-chain-health-level]');
            if (bar) showLiveHeadInspector(bar);
            else openNetworkHealthChamber();
        });
        button.addEventListener('pointerover', (event) => {
            if (event.pointerType === 'touch') return;
            const bar = event.target.closest('[data-chain-health-level]');
            if (!bar || bar.contains(event.relatedTarget)) return;
            const suppressed = liveHeadInspectorSuppressedPointerPosition;
            if (suppressed && event.clientX === suppressed.x && event.clientY === suppressed.y) return;
            liveHeadInspectorSuppressedPointerPosition = null;
            showLiveHeadInspector(bar);
        });
        button.addEventListener('pointerout', (event) => {
            if (event.pointerType === 'touch') return;
            if (event.relatedTarget?.closest?.('#chain-health, #live-head-inspector')) return;
            scheduleLiveHeadInspectorClose();
        });
        button.addEventListener('focusout', (event) => {
            if (liveHeadInspectorAnchor?.matches('[data-chain-health-level]')
                && !event.relatedTarget?.closest?.('#live-head-inspector')) scheduleLiveHeadInspectorClose();
        });
        button.addEventListener('keydown', (event) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const bars = [...viewport.querySelectorAll('[data-chain-health-level]')];
            const current = bars.indexOf(liveHeadInspectorAnchor);
            const index = event.key === 'Home' ? 0 : event.key === 'End' || current < 0 ? bars.length - 1
                : Math.max(0, Math.min(bars.length - 1, current + (event.key === 'ArrowLeft' ? -1 : 1)));
            if (bars[index]) showLiveHeadInspector(bars[index]);
        });
    }
    // Operation supplements and local layout changes cannot prove source recovery.
    const sourceStamp = Number(data?.updatedAt) || 0;
    error ||= button.dataset.feedState === 'stale'
        && (supplemental || sourceStamp <= Number(button.dataset.sourceStamp || 0));
    if (!error && sourceStamp) button.dataset.sourceStamp = String(sourceStamp);
    button.dataset.feedState = error ? 'stale' : data?.blocks?.length ? 'live' : 'loading';
    if (error && viewport.children.length) {
        updateChainHealthReadout(button, {
            sentence: `Live source delayed. Showing the last received 25-block history, ending at block ${formatCount(viewport.dataset.headLevel)}.`
        }, { stale: true });
        return;
    }
    const latest = data?.blocks?.[0];
    if (!latest) {
        updateChainHealthReadout(button, {
            text: '—', tone: 'unknown',
            sentence: error ? 'Block source unavailable.' : 'Loading the last 25 blocks.'
        }, { loading: !error });
        return;
    }
    const byLevel = new Map((data.chainHealthBlocks || data.blocks).map((block) => [Number(block.level), block]));
    const blocks = Array.from({ length: CHAIN_HEALTH_BLOCK_LIMIT }, (_, index) => {
        const level = Number(latest.level) - CHAIN_HEALTH_BLOCK_LIMIT + 1 + index;
        return byLevel.get(level) || { level };
    });
    const readout = chainHealthReadout(blocks.map(chainHealthState));
    updateChainHealthReadout(button, {
        ...readout, sentence: `${readout.sentence} Newest block ${formatCount(latest.level)}.`
    });
    viewport.style.setProperty('--chain-health-count', CHAIN_HEALTH_BLOCK_LIMIT);
    const missedStates = blocks.map((block) => liveHeadMissedState(block, null, { force: true }));
    const signature = blocks.map((block, index) => `${block.level}:${block.power}:${block.committee}:${block.blockRound}:${missedStates[index].signature}:${missedStates[index].sampleClipped}`).join('|');
    if (viewport.dataset.receiptSignature === signature) return;
    const previousLevel = Number(viewport.dataset.headLevel) || 0;
    const advance = Number(latest.level) - previousLevel;
    const animate = previousLevel > 0 && advance > 0 && advance < CHAIN_HEALTH_BLOCK_LIMIT
        && liveHeadMotionAllowed({ suppressMotion });
    const step = viewport.clientWidth / CHAIN_HEALTH_BLOCK_LIMIT;
    viewport.querySelectorAll('.chain-health-exiting').forEach((ghost) => ghost.remove());
    const existing = [...viewport.querySelectorAll('[data-chain-health-level]')];
    const nextLevels = new Set(blocks.map((block) => String(block.level)));
    const ghosts = animate ? existing.filter((bar) => !nextLevels.has(bar.dataset.chainHealthLevel)).map((bar) => {
        const ghost = bar.cloneNode(true);
        ghost.classList.add('chain-health-exiting');
        ghost.removeAttribute('data-chain-health-level');
        ghost.removeAttribute('data-quiet-key');
        ghost.removeAttribute('title');
        return ghost;
    }) : [];
    quietlySyncHtml(viewport, blocks.map((block, index) => {
        const status = latestBlockStatus(block);
        const receipt = status.className === 'unknown'
            ? 'Attestation unknown'
            : `${formatCount(block.power)} / ${formatCount(block.committee)} attested (${block.score.toFixed(2)}%). ${status.label}. Round ${block.blockRound}`;
        const misses = chainHealthMissedCopy(block, missedStates[index]);
        return `<span class="chain-health-bar ${chainHealthState(block)}${index === blocks.length - 1 ? ' is-head' : ''}" data-chain-health-level="${block.level}" data-quiet-key="chain-health-${block.level}" style="--chain-health-position:${index}" data-chain-health-receipt="Block ${formatCount(block.level)}: ${escapeHtml(receipt)} ${escapeHtml(misses)}"></span>`;
    }).join(''));
    viewport.dataset.headLevel = String(latest.level);
    viewport.dataset.receiptSignature = signature;
    if (!animate || typeof viewport.animate !== 'function') return;
    // Retain keyed bars while an outgoing receipt slips beyond the clipped edge.
    ghosts.forEach((ghost) => viewport.append(ghost));
    [...viewport.children].forEach((bar) => {
        const exiting = bar.classList.contains('chain-health-exiting');
        bar.getAnimations().forEach((animation) => animation.cancel());
        const animation = bar.animate([
            { transform: `translateX(${exiting ? 0 : advance * step}px)` },
            { transform: `translateX(${exiting ? -advance * step : 0}px)` }
        ], { duration: 520, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'both' });
        animation.id = 'chain-health-shift';
        animation.finished.catch(() => {}).finally(() => {
            if (exiting) bar.remove();
            animation.cancel();
        });
    });
}

function blockTickerFallback(className = 'loading') {
    const stack = document.getElementById('live-head-stack');
    const panel = document.getElementById('live-head');
    if (!stack || !panel) return;
    if (className === 'degraded' && panel.dataset.heartbeatLevel) {
        panel.dataset.feedState = 'stale';
        return;
    }
    panel.dataset.blockHealth = className;
    panel.dataset.feedState = className;
    panel.setAttribute('aria-busy', 'true');
    const announcer = document.getElementById('chain-heartbeat-announcer');
    if (className === 'degraded' && announcer) announcer.textContent = 'Live block feed unavailable.';
}

function settleLiveHeadReveal(root) {
    root?.querySelectorAll('.is-revealing').forEach((element) => {
        element.classList.remove('is-revealing');
    });
}

function liveHeadMotionAllowed({ suppressMotion = false } = {}) {
    return !suppressMotion
        && document.visibilityState === 'visible'
        && !window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
}

function revealLiveHeadFacts(panel, { suppressMotion = false } = {}) {
    if (!panel) return;
    const motionAllowed = liveHeadMotionAllowed({ suppressMotion });
    if (!motionAllowed) {
        settleLiveHeadReveal(panel);
        panel.querySelectorAll('[data-story-signature]').forEach((element) => {
            element.dataset.quietRevealSignature = element.dataset.storySignature || '';
        });
        return;
    }
    panel.querySelectorAll('[data-story-signature]').forEach((element) => {
        const signature = element.dataset.storySignature || '';
        if (!signature || element.dataset.quietRevealSignature === signature) return;
        element.dataset.quietRevealSignature = signature;
        element.classList.remove('is-revealing');
        void element.offsetWidth;
        element.classList.add('is-revealing');
    });
    if (liveHeadAnimationTimer) window.clearTimeout(liveHeadAnimationTimer);
    liveHeadAnimationTimer = window.setTimeout(() => {
        settleLiveHeadReveal(panel);
        liveHeadAnimationTimer = null;
    }, 440);
}

function usageSlotContent(slot, usage) {
    if (slot === 'tx') {
        return {
            html: Number.isFinite(usage?.txCount) ? formatCount(usage.txCount) : '--',
            title: 'Applied transactions across Tezos L1 in the trailing hour'
        };
    }
    if (slot === 'moved') {
        const known = Number.isFinite(usage?.movedXtz);
        const suffix = usage?.movedClipped ? '+' : '';
        return {
            html: known ? `${formatTezAmount(usage.movedXtz)}${suffix}<small>ꜩ</small>` : '--',
            title: 'XTZ moved by transactions in the trailing hour'
        };
    }
    if (slot === 'nft') {
        return {
            html: Number.isFinite(usage?.nftCount) ? formatCount(usage.nftCount) : '--',
            title: 'NFT transfers (tokens with artwork metadata) in the trailing hour'
        };
    }

    const whale = usage?.whale || null;
    if (!whale || !Number.isFinite(whale.amount)) {
        return { html: '--', title: 'Latest transfer of 1,000 XTZ or more' };
    }
    const target = whale.target || 'unknown';
    return {
        html: `${formatTezAmount(whale.amount)}<small>ꜩ</small> → ${escapeHtml(target)}`,
        title: `Latest ≥1,000 XTZ transfer: ${formatCount(Math.round(whale.amount))} XTZ from ${whale.sender || 'unknown'} to ${target} (${whale.method || 'transfer'}), ${formatAge(whale.timestamp)}`
    };
}

const USAGE_SLOTS = [
    { slot: 'tx', label: 'TX', className: 'block-ticker-usage-tx' },
    { slot: 'moved', label: 'Moved', className: 'block-ticker-usage-moved' },
    { slot: 'nft', label: 'NFT', className: 'block-ticker-usage-nft' },
    { slot: 'whale', label: 'Whale', className: 'block-ticker-whale' }
];

function renderHeaderActivityCluster(usage) {
    const segments = USAGE_SLOTS.map(({ slot, label, className }) => {
        const { html, title } = usageSlotContent(slot, usage);
        return `
        <span class="block-ticker-segment block-ticker-usage ${className}">
            <span class="block-ticker-label">${label}</span>
            <strong class="block-ticker-value" data-usage-slot="${slot}" title="${escapeHtml(title)}">${html}</strong>
        </span>`;
    }).join('');
    return `
        <span class="header-activity-cluster" title="Network pulse — trailing hour across Tezos L1">
            <span class="header-activity-cluster-kicker" aria-hidden="true">1H Activity</span>${segments}
        </span>`;
}

function updateHeaderActivity(usage) {
    const line = document.getElementById('header-activity-line');
    const button = document.getElementById('header-activity-button');
    if (!line || !button) return;
    if (!line.querySelector('.header-activity-cluster')) {
        line.innerHTML = renderHeaderActivityCluster(usage);
    }
    const cluster = line.querySelector('.header-activity-cluster');
    const hasUsage = Boolean(usage && Number.isFinite(usage.txCount));
    line.querySelectorAll('[data-usage-slot]').forEach((element) => {
        const { html, title } = usageSlotContent(element.dataset.usageSlot, usage);
        element.innerHTML = html;
        element.title = title;
    });
    if (usage?.updatedAt) line.dataset.usagePulseStamp = String(usage.updatedAt);
    cluster?.classList.toggle('is-loading', !hasUsage);
    button.classList.toggle('is-loading', !hasUsage);
    line.setAttribute('aria-busy', hasUsage ? 'false' : 'true');
    button.setAttribute('aria-busy', hasUsage ? 'false' : 'true');

    const summary = hasUsage
        ? `Last hour: ${formatCount(usage.txCount)} transactions${Number.isFinite(usage.movedXtz) ? `, ${formatTezAmount(usage.movedXtz)}${usage.movedClipped ? '+' : ''} XTZ moved` : ''}${Number.isFinite(usage.nftCount) ? `, ${formatCount(usage.nftCount)} NFT transfers` : ''}.`
        : 'Trailing hour Tezos L1 activity is syncing.';
    button.title = `${summary} Open Network Health Chamber.`;
    button.setAttribute('aria-label', `Open Network Health Chamber. ${summary}`);
}

function patchTickerUsage(usage) {
    const line = document.getElementById('header-activity-line');
    if (!line || !usage?.updatedAt) return;
    const stamp = String(usage.updatedAt);
    if (line.dataset.usagePulseStamp !== stamp) updateHeaderActivity(usage);
}

function compactLiveHeadBlockLimit() {
    return window.matchMedia?.('(max-width: 719px)')?.matches ? 3 : 4;
}

function compactChamberBlockLimit() {
    return window.matchMedia?.('(max-width: 719px)')?.matches
        ? CHAMBER_COMPACT_MOBILE_BLOCK_LIMIT
        : CHAMBER_COMPACT_DESKTOP_BLOCK_LIMIT;
}

function expandedChamberBlockLimit() {
    return window.matchMedia?.('(max-width: 719px)')?.matches
        ? CHAMBER_EXPANDED_MOBILE_BLOCK_LIMIT
        : CHAMBER_BLOCK_LIMIT;
}

function liveHeadBlockLimit() {
    if (liveHeadDepthMode === 'compact') return compactLiveHeadBlockLimit();
    return liveHeadDepthMode === 'custom' ? liveHeadCustomRows : Number(liveHeadDepthMode);
}

function visibleLiveHeadBlocks(data) {
    return (Array.isArray(data?.blocks) ? data.blocks : []).slice(0, liveHeadBlockLimit());
}

function readLiveHeadDepthPreference() {
    try {
        const saved = JSON.parse(localStorage.getItem(LIVE_HEAD_DEPTH_STORAGE_KEY) || 'null');
        if (saved?.version === 1) return { mode: saved.expanded === true ? '10' : 'compact', customRows: 20 };
        if (saved?.version === 2 && LIVE_HEAD_DEPTH_MODES.includes(saved.mode)
            && Number.isInteger(saved.customRows) && saved.customRows >= 1 && saved.customRows <= LIVE_HEAD_MAX_ROWS) {
            return { mode: saved.mode, customRows: saved.customRows };
        }
    } catch (_) {}
    return { mode: 'compact', customRows: 20 };
}

function persistLiveHeadDepthPreference() {
    try {
        localStorage.setItem(LIVE_HEAD_DEPTH_STORAGE_KEY, JSON.stringify({
            version: 2,
            mode: liveHeadDepthMode,
            customRows: liveHeadCustomRows
        }));
    } catch (_) {}
}

function syncLiveHeadDepthControls() {
    const compactLimit = compactLiveHeadBlockLimit();
    const chamberCompactLimit = compactChamberBlockLimit();
    const panel = document.getElementById('live-head');
    const chamber = document.getElementById('health-block-depth-toggle');
    const chamberExpandedLimit = expandedChamberBlockLimit();
    const chamberAction = liveHeadExpanded
        ? `Show ${chamberCompactLimit} Passing Blocks`
        : `Show all ${chamberExpandedLimit} Passing Blocks`;

    document.documentElement.setAttribute('data-live-head-expanded', liveHeadExpanded ? 'true' : 'false');
    document.documentElement.setAttribute('data-live-head-depth', liveHeadDepthMode);
    document.documentElement.style.setProperty('--live-head-row-count', liveHeadBlockLimit());
    panel?.setAttribute('data-live-head-expanded', liveHeadExpanded ? 'true' : 'false');
    document.querySelectorAll('[data-live-head-depth-control]').forEach((control) => {
        const opener = control.querySelector('[aria-controls]');
        const input = control.querySelector('input');
        const menu = control.querySelector('[popover]');
        if (opener) {
            opener.dataset.depthMode = liveHeadDepthMode;
            const count = opener.querySelector('[data-live-head-depth-count]');
            const label = `${liveHeadBlockLimit()} blocks`;
            if (count.textContent !== label) count.textContent = label;
            opener.title = `Live blocks: ${liveHeadBlockLimit()} rows`;
            opener.setAttribute('aria-label', `Choose Live blocks depth, currently ${label}`);
        }
        control.querySelectorAll('[data-live-head-depth-mode]').forEach((button) => {
            const mode = button.dataset.liveHeadDepthMode;
            button.setAttribute('aria-pressed', mode === liveHeadDepthMode ? 'true' : 'false');
            const label = `${compactLimit} blocks`;
            if (mode === 'compact' && button.textContent !== label) button.textContent = label;
        });
        control.querySelector('form')?.classList.toggle('is-selected', liveHeadDepthMode === 'custom');
        // Keep the fifth option blank until used; never overwrite an open editor.
        if (input && !menu?.matches(':popover-open')) {
            input.value = liveHeadDepthMode === 'custom' ? liveHeadCustomRows : '';
        }
    });
    if (chamber) {
        chamber.setAttribute('aria-expanded', liveHeadExpanded ? 'true' : 'false');
        chamber.setAttribute('aria-label', chamberAction);
        chamber.title = chamberAction;
        const copy = chamber.querySelector('[data-health-block-depth-action]');
        if (copy) copy.textContent = chamberAction;
        const count = chamber.querySelector('[data-health-block-depth-count]');
        if (count) count.textContent = `${liveHeadExpanded ? chamberExpandedLimit : chamberCompactLimit} blocks`;
    }
}

function setLiveHeadDepth(mode, { customRows = liveHeadCustomRows, persist = true, source = 'api' } = {}) {
    if (!LIVE_HEAD_DEPTH_MODES.includes(mode) || !Number.isInteger(customRows)
        || customRows < 1 || customRows > LIVE_HEAD_MAX_ROWS) return false;
    if (liveHeadDepthMode === mode && liveHeadCustomRows === customRows) {
        syncLiveHeadDepthControls();
        return false;
    }

    closeLiveHeadInspector({ suppressReopen: true });
    liveHeadDepthMode = mode;
    liveHeadCustomRows = customRows;
    liveHeadExpanded = mode !== 'compact';
    syncLiveHeadDepthControls();
    if (persist) persistLiveHeadDepthPreference();

    const stack = document.getElementById('live-head-stack');
    if (stack) delete stack.dataset.liveHeadSignature;
    if (heartbeatData) updateBlockTicker(heartbeatData, { suppressMotion: true });
    window.dispatchEvent(new CustomEvent('tezos:live-head-depth-change', {
        detail: { expanded: liveHeadExpanded, mode: liveHeadDepthMode, limit: liveHeadBlockLimit(), source }
    }));
    return true;
}

// Retain the Passing Blocks chamber's existing compact/expanded action.
function setLiveHeadExpanded(expanded, options = {}) {
    return setLiveHeadDepth(expanded ? '10' : 'compact', options);
}

function wireLiveHeadDepthControls() {
    if (liveHeadDepthControlsWired) {
        syncLiveHeadDepthControls();
        return;
    }
    liveHeadDepthControlsWired = true;
    const saved = readLiveHeadDepthPreference();
    liveHeadDepthMode = saved.mode;
    liveHeadCustomRows = saved.customRows;
    liveHeadExpanded = saved.mode !== 'compact';
    syncLiveHeadDepthControls();
    wireLiveHeadMyTezosControls(document);

    document.querySelectorAll('[data-live-head-depth-control]').forEach((control) => {
        const opener = control.querySelector('[aria-controls]');
        const menu = control.querySelector('[popover]');
        const input = control.querySelector('input');
        const source = control.dataset.liveHeadDepthControl;
        if (!opener || !menu || !input) return;
        const close = () => {
            menu.hidePopover();
            opener.setAttribute('aria-expanded', 'false');
            opener.focus({ preventScroll: true });
        };
        const positionMenu = () => {
            if (!menu.matches(':popover-open')) return;
            const rect = opener.getBoundingClientRect();
            const viewport = window.visualViewport;
            const left = viewport?.offsetLeft || 0;
            const top = viewport?.offsetTop || 0;
            const width = viewport?.width || innerWidth;
            const height = viewport?.height || innerHeight;
            menu.style.maxHeight = `${Math.max(44, height - 16)}px`;
            const menuRect = menu.getBoundingClientRect();
            const preferredTop = source === 'corner' ? rect.top - menuRect.height - 6 : rect.bottom + 6;
            menu.style.left = `${Math.max(left + 8, Math.min(rect.right - menuRect.width, left + width - menuRect.width - 8))}px`;
            menu.style.top = `${Math.max(top + 8, Math.min(preferredTop, top + height - menuRect.height - 8))}px`;
        };
        menu.addEventListener('toggle', () => {
            opener.setAttribute('aria-expanded', menu.matches(':popover-open') ? 'true' : 'false');
            if (!menu.matches(':popover-open')) syncLiveHeadDepthControls();
        });
        opener.addEventListener('click', (event) => {
            // Keep the native invoker relationship for light-dismiss, while
            // handling positioning and selected-control focus ourselves.
            event.preventDefault();
            if (menu.matches(':popover-open')) return close();
            closeLiveHeadInspector({ suppressReopen: true });
            syncLiveHeadDepthControls();
            menu.showPopover();
            positionMenu();
            opener.setAttribute('aria-expanded', 'true');
            const selected = liveHeadDepthMode === 'custom' ? input : menu.querySelector('[aria-pressed="true"]');
            selected?.focus({ preventScroll: true });
        });
        window.addEventListener('resize', positionMenu);
        window.visualViewport?.addEventListener('resize', positionMenu);
        menu.querySelectorAll('[data-live-head-depth-mode]').forEach((button) => {
            button.addEventListener('click', () => {
                setLiveHeadDepth(button.dataset.liveHeadDepthMode, { source });
                close();
            });
        });
        const commitCustom = () => {
            if (!input.reportValidity()) return false;
            setLiveHeadDepth('custom', { customRows: input.valueAsNumber, source });
            return true;
        };
        input.addEventListener('change', () => {
            if (input.validity.valid) commitCustom();
        });
        menu.querySelector('form')?.addEventListener('submit', (event) => {
            event.preventDefault();
            if (commitCustom()) close();
        });
        menu.querySelectorAll('[data-live-head-depth-step]').forEach((button) => {
            button.addEventListener('click', () => {
                const current = input.validity.valid ? input.valueAsNumber : liveHeadBlockLimit();
                const rows = Math.max(1, Math.min(LIVE_HEAD_MAX_ROWS, current + Number(button.dataset.liveHeadDepthStep)));
                input.value = rows;
                setLiveHeadDepth('custom', { customRows: rows, source });
            });
        });
        menu.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.stopPropagation();
            close();
        });
        control.addEventListener('focusout', (event) => {
            if (event.relatedTarget && !control.contains(event.relatedTarget) && menu.matches(':popover-open')) {
                menu.hidePopover();
            }
        });
    });
    window.addEventListener('storage', (event) => {
        if (event.key !== LIVE_HEAD_DEPTH_STORAGE_KEY && event.key !== null) return;
        const preference = readLiveHeadDepthPreference();
        setLiveHeadDepth(preference.mode, { customRows: preference.customRows, persist: false, source: 'storage' });
    });
    window.matchMedia?.('(max-width: 719px)')?.addEventListener?.('change', () => {
        syncLiveHeadDepthControls();
        if (!heartbeatData) return;
        const stack = document.getElementById('live-head-stack');
        if (stack) delete stack.dataset.liveHeadSignature;
        updateBlockTicker(heartbeatData, { suppressMotion: true });
    });
    window.tezosSystemsLiveHead = Object.freeze({
        isExpanded: () => liveHeadExpanded,
        setExpanded: (expanded, source = 'api') => setLiveHeadExpanded(expanded, { source }),
        getDepth: () => ({ mode: liveHeadDepthMode, rows: liveHeadBlockLimit(), customRows: liveHeadCustomRows }),
        setDepth: (mode, customRows = liveHeadCustomRows) => setLiveHeadDepth(mode, { customRows }),
        isMyTezosOnly: () => liveHeadMyTezosOnly,
        setMyTezosOnly: (enabled, source = 'api') => setLiveHeadMyTezosOnly(enabled, { source })
    });
}

function loadLiveHeadMyTezosPreference() {
    if (liveHeadMyTezosOnlyLoaded) return;
    liveHeadMyTezosOnlyLoaded = true;
    try {
        liveHeadMyTezosOnly = localStorage.getItem(LIVE_HEAD_MY_TEZOS_STORAGE_KEY) === '1';
    } catch {
        liveHeadMyTezosOnly = false;
    }
}

function savedMyTezosAddressSet() {
    return new Set(readSavedMyTezosEntries().map((entry) => String(entry.address || '')).filter(Boolean));
}

function operationAddress(value) {
    if (typeof value === 'string') return value;
    return String(value?.address || '');
}

function collectHeartbeatActorAddresses(transactions, stakingRows, tokenTransfers, l1VotingRows, managerOperations, evidenceRows, delegationRows, originationRows) {
    const actors = new Set();
    for (const row of transactions || []) {
        for (const account of [row?.sender, row?.target]) {
            const address = operationAddress(account);
            if (address) actors.add(address);
        }
    }
    for (const row of stakingRows || []) {
        for (const account of [row?.staker, row?.sender, row?.baker]) {
            const address = operationAddress(account);
            if (address) actors.add(address);
        }
    }
    for (const row of tokenTransfers || []) {
        for (const account of [row?.from, row?.to, row?.contract]) {
            const address = operationAddress(account);
            if (address) actors.add(address);
        }
    }
    for (const row of l1VotingRows || []) {
        const address = operationAddress(row?.delegate || row?.initiator || row?.sender);
        if (address) actors.add(address);
    }
    for (const row of [...(managerOperations || []), ...(evidenceRows || []), ...(delegationRows || []), ...(originationRows || [])]) {
        for (const account of [row?.source, row?.sender, row?.initiator, row?.destination, row?.delegate, row?.newDelegate, row?.prevDelegate, row?.originatedContract]) {
            const address = operationAddress(account);
            if (address) actors.add(address);
        }
    }
    return [...actors];
}

function isEtherlinkGovernanceActivity(transaction) {
    const target = operationAddress(transaction?.target);
    const entrypoint = String(transaction?.parameter?.entrypoint || '');
    return ETHERLINK_GOVERNANCE_CURRENT_ADDRESS_SET.has(target)
        && ETHERLINK_GOVERNANCE_ENTRYPOINTS.has(entrypoint);
}

function liveHeadMyTezosState(level, producerAddress, savedAddresses) {
    if (!savedAddresses.size) return 'no-addresses';
    const producer = String(producerAddress || '');
    if (producer && savedAddresses.has(producer)) return 'match';
    const numericLevel = Number(level);
    const activity = Number.isFinite(numericLevel) ? heartbeatActivityCache.get(numericLevel) : null;
    if ((activity?.actorAddresses || []).some((address) => savedAddresses.has(address))) return 'match';
    return activity?.actorCoverageComplete ? 'no-match' : 'checking';
}

function liveHeadMyTezosBlockState(row, savedAddresses) {
    return liveHeadMyTezosState(
        row?.dataset?.healthLevel || row?.dataset?.liveHeadLevel,
        row?.dataset?.producerAddress,
        savedAddresses
    );
}

function liveHeadMyTezosRowPresentation(level, producerAddress, savedAddresses = savedMyTezosAddressSet()) {
    loadLiveHeadMyTezosPreference();
    const state = liveHeadMyTezosState(level, producerAddress, savedAddresses);
    return {
        state,
        filtered: liveHeadMyTezosOnly && state !== 'match'
    };
}

function syncLiveHeadMyTezosRows() {
    loadLiveHeadMyTezosPreference();
    const savedAddresses = savedMyTezosAddressSet();
    const surfaces = [
        { container: document.getElementById('live-head-stack'), selector: '.live-head-row[data-health-level]' },
        { container: document.getElementById('health-recent-block-list'), selector: '.health-block-row[data-health-level]' }
    ];

    document.documentElement.setAttribute('data-live-head-my-tezos-only', liveHeadMyTezosOnly ? 'true' : 'false');
    document.getElementById('live-head')?.setAttribute('data-live-head-my-tezos-only', liveHeadMyTezosOnly ? 'true' : 'false');

    for (const surface of surfaces) {
        if (!surface.container) continue;
        quietlyMutate(surface.container, () => {
            const rows = [...surface.container.querySelectorAll(surface.selector)];
            for (const row of rows) {
                const state = liveHeadMyTezosBlockState(row, savedAddresses);
                const hidden = liveHeadMyTezosOnly && state !== 'match';
                row.dataset.myTezosBlockState = state;
                row.classList.toggle('is-my-tezos-filtered-out', hidden);
                if (hidden) row.setAttribute('aria-hidden', 'true');
                else row.removeAttribute('aria-hidden');
            }
        });
    }
}

function syncLiveHeadMyTezosControls() {
    loadLiveHeadMyTezosPreference();
    const savedCount = savedMyTezosAddressSet().size;
    document.querySelectorAll('[data-live-head-my-tezos-toggle]').forEach((button) => {
        const active = liveHeadMyTezosOnly;
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
        button.classList.toggle('is-active', active);
        button.disabled = savedCount === 0 && !active;
        const count = button.querySelector('[data-live-head-my-tezos-count]');
        if (count) count.textContent = active ? `${savedCount} saved` : savedCount ? 'All' : 'Set My Tezos';
        const action = active
            ? 'Show all recent blocks'
            : savedCount
                ? `Show only blocks produced by or carrying activity from ${savedCount} saved My Tezos address${savedCount === 1 ? '' : 'es'}`
                : 'Save an address in My Tezos before turning on the personal block monitor';
        button.setAttribute('aria-label', action);
        button.title = action;
    });
    syncAllLiveHeadActivityFilterUis();
}

function setLiveHeadMyTezosOnly(enabled, { persist = true, source = 'api' } = {}) {
    loadLiveHeadMyTezosPreference();
    const next = Boolean(enabled);
    if (next && !savedMyTezosAddressSet().size) {
        syncLiveHeadMyTezosControls();
        return false;
    }
    closeLiveHeadInspector({ suppressReopen: true });
    liveHeadMyTezosOnly = next;
    if (persist) {
        try {
            localStorage.setItem(LIVE_HEAD_MY_TEZOS_STORAGE_KEY, next ? '1' : '0');
        } catch { /* preference storage unavailable */ }
    }
    syncLiveHeadMyTezosControls();
    syncLiveHeadMyTezosRows();
    if (next && heartbeatData) requestHeartbeatSupplements(heartbeatData);
    if (next && recentBlockSupplementBlocks.length) requestRecentBlockSupplements(recentBlockSupplementBlocks);
    window.dispatchEvent(new CustomEvent('tezos:live-head-my-tezos-change', {
        detail: { enabled: next, savedAddresses: savedMyTezosAddressSet().size, source }
    }));
    return true;
}

function wireLiveHeadMyTezosControls(root = document) {
    loadLiveHeadMyTezosPreference();
    const controls = [
        ...(root.matches?.('[data-live-head-my-tezos-toggle]') ? [root] : []),
        ...(root.querySelectorAll?.('[data-live-head-my-tezos-toggle]') || [])
    ];
    controls.forEach((button) => {
        if (button.dataset.liveHeadMyTezosWired) return;
        button.dataset.liveHeadMyTezosWired = '1';
        button.addEventListener('click', () => {
            if (button.disabled) return;
            setLiveHeadMyTezosOnly(!liveHeadMyTezosOnly, { source: button.id || 'activity-setup' });
            const settings = button.closest('#settings-dropdown');
            if (settings) {
                settings.classList.remove('open');
                const gear = document.getElementById('settings-gear');
                gear?.setAttribute('aria-expanded', 'false');
                gear?.focus({ preventScroll: true });
            }
        });
    });

    if (!liveHeadMyTezosControlsWired) {
        liveHeadMyTezosControlsWired = true;
        window.addEventListener('storage', (event) => {
            if (event.key !== LIVE_HEAD_MY_TEZOS_STORAGE_KEY) return;
            setLiveHeadMyTezosOnly(event.newValue === '1', { persist: false, source: 'storage' });
        });
        window.addEventListener('my-tezos-portfolio-changed', () => {
            syncLiveHeadMyTezosControls();
            syncLiveHeadMyTezosRows();
            if (liveHeadMyTezosOnly && heartbeatData) requestHeartbeatSupplements(heartbeatData);
        });
    }
    syncLiveHeadMyTezosControls();
}

function wireHealthBlockDepthControl(root = document) {
    const toggle = root.querySelector('#health-block-depth-toggle');
    if (!toggle || toggle.dataset.healthBlockDepthWired) {
        syncLiveHeadDepthControls();
        return;
    }
    toggle.dataset.healthBlockDepthWired = '1';
    toggle.addEventListener('click', () => {
        setLiveHeadExpanded(!liveHeadExpanded, { source: 'chamber' });
        requestRecentBlockSupplements(recentBlockSupplementBlocks);
    });
    syncLiveHeadDepthControls();
}

function cacheLiveHeadMissedState(level, state) {
    if (!Number.isFinite(level) || !state || !['resolved', 'clear'].includes(state.state)) return state;
    const snapshot = {
        ...state,
        attesters: state.attesters.map((attester) => ({ ...attester }))
    };
    liveHeadMissedStateCache.delete(level);
    liveHeadMissedStateCache.set(level, snapshot);
    while (liveHeadMissedStateCache.size > CHAIN_HEALTH_BLOCK_LIMIT) {
        liveHeadMissedStateCache.delete(liveHeadMissedStateCache.keys().next().value);
    }
    return snapshot;
}

function cachedLiveHeadMissedState(level) {
    const state = liveHeadMissedStateCache.get(level);
    return state ? {
        ...state,
        attesters: state.attesters.map((attester) => ({ ...attester }))
    } : null;
}

function serializeLiveHeadMissedState(level, state) {
    if (!Number.isFinite(level) || !state || !['resolved', 'clear'].includes(state.state)) return '';
    return JSON.stringify({
        level,
        required: state.required === true,
        state: state.state,
        attesters: (Array.isArray(state.attesters) ? state.attesters : []).map((attester) => ({
            address: String(attester?.address || ''),
            name: String(attester?.name || attester?.address || 'Unknown baker'),
            slots: Math.max(0, Number(attester?.slots) || 0)
        })),
        signature: String(state.signature || `miss:${state.state}`),
        sampleClipped: state.sampleClipped === true
    });
}

function liveHeadMissedStateFromRow(row, level) {
    if (!row || !Number.isFinite(level)) return null;
    try {
        const state = JSON.parse(row.dataset.liveHeadMissedSnapshot || 'null');
        if (Number(state?.level) !== level || !['resolved', 'clear'].includes(state?.state)) return null;
        const attesters = (Array.isArray(state.attesters) ? state.attesters : []).map((attester) => ({
            address: String(attester?.address || ''),
            name: String(attester?.name || attester?.address || 'Unknown baker'),
            slots: Math.max(0, Number(attester?.slots) || 0)
        }));
        if (state.state === 'resolved' && !attesters.length) return null;
        return {
            required: state.required === true,
            state: state.state,
            attesters,
            signature: String(state.signature || `miss:${state.state}`),
            sampleClipped: state.sampleClipped === true
        };
    } catch {
        return null;
    }
}

function liveHeadMissedState(block, story, { force = false } = {}) {
    const level = Number(block?.level);
    const lowPower = Number.isFinite(Number(block?.power)) && Number(block.power) < LIVE_HEAD_POWER_DETAIL_THRESHOLD;
    const quiet = story?.quiet === true;
    const required = force || lowPower || quiet;
    if (!required || !Number.isFinite(level)) {
        return { required: false, state: 'not-required', attesters: [], signature: 'miss:not-required' };
    }

    const cacheCoversLevel = heartbeatMissedRightsCache
        && level >= heartbeatMissedRightsCache.startLevel
        && level <= heartbeatMissedRightsCache.endLevel;
    const failureCoversLevel = heartbeatMissedRightsFailureRange
        && level >= heartbeatMissedRightsFailureRange.startLevel
        && level <= heartbeatMissedRightsFailureRange.endLevel;
    if (!cacheCoversLevel) {
        const lastGood = cachedLiveHeadMissedState(level);
        if (lastGood) return lastGood;
        const state = failureCoversLevel ? 'unavailable' : 'loading';
        return { required, state, attesters: [], signature: `miss:${state}` };
    }

    const byAddress = new Map();
    for (const right of heartbeatMissedRightsCache.attestations.filter((row) => Number(row.level) === level)) {
        const address = right.baker?.address || 'unknown';
        const current = byAddress.get(address) || {
            address,
            name: bakerName(right.baker),
            slots: 0
        };
        current.slots += Math.max(0, Number(right.slots) || 0);
        byAddress.set(address, current);
    }
    const attesters = [...byAddress.values()].sort((left, right) => (
        right.slots - left.slots || left.name.localeCompare(right.name)
    ));
    const state = attesters.length ? 'resolved' : 'clear';
    const signature = `miss:${state}:${attesters.map((item) => `${item.address}:${item.slots}`).join('|')}`;
    return cacheLiveHeadMissedState(level, {
        required,
        state,
        attesters,
        signature,
        sampleClipped: heartbeatMissedRightsCache.sampleClipped === true
    });
}

function renderLiveHeadMissPills(block, missedState) {
    if (!missedState.required) return '';
    if (missedState.state === 'loading') {
        return '<i class="live-head-story-skeleton live-head-miss-skeleton" aria-hidden="true"></i>';
    }
    if (missedState.state === 'unavailable') {
        return '<span class="live-head-miss-pill is-unavailable" title="The missed-attestation receipt is temporarily unavailable">Misses unavailable</span>';
    }
    if (missedState.state === 'clear') {
        const text = Number(block?.missedPower) > 0 ? 'Misses not indexed' : 'No attestation misses';
        const title = Number(block?.missedPower) > 0
            ? `Block ${formatCount(block.level)} has reduced attested power, but TzKT returned no missed-attester identities for this level.`
            : `TzKT returned no missed attestation rights for block ${formatCount(block.level)}.`;
        return `<span class="live-head-miss-pill is-clear" title="${escapeHtml(title)}">${escapeHtml(text)}</span>`;
    }

    const pills = missedState.attesters.map((attester) => {
        const fullIdentity = attester.address && attester.address !== 'unknown'
            ? `${attester.name} · ${attester.address}`
            : attester.name;
        const title = `${fullIdentity} missed ${formatCount(attester.slots)} attestation power at block ${formatCount(block.level)}.`;
        return `<span class="live-head-miss-pill" data-missed-baker-address="${escapeHtml(attester.address)}" title="${escapeHtml(title)}">${escapeHtml(attester.name)} · −${formatCount(attester.slots)}</span>`;
    });
    pills.push('<span class="live-head-miss-pill is-more" data-live-head-miss-overflow hidden></span>');
    return pills.join('');
}

function liveHeadBakingMissState(block) {
    const round = Number(block?.blockRound);
    if (!Number.isSafeInteger(round) || round <= 0) return [];
    const receipt = heartbeatBakingMisses.get(Number(block.level));
    return Array.from({ length: round }, (_, missedRound) => {
        const baker = receipt?.bakers.get(missedRound) || null;
        return { round: missedRound, baker, state: baker ? 'missed' : !receipt || receipt.promise ? 'loading' : 'unavailable' };
    });
}

function bakingMissCopy(miss) {
    return miss.baker
        ? `Missed R${miss.round} · ${bakerName(miss.baker)}`
        : `R${miss.round} ${miss.state === 'loading' ? 'syncing' : 'unavailable'}`;
}

function renderBakingMissPills(block, misses) {
    return misses.map((miss) => {
        const copy = bakingMissCopy(miss);
        const compact = miss.baker ? `R${miss.round} · ${bakerName(miss.baker)}` : copy;
        const title = miss.baker
            ? `${copy} · ${miss.baker.address}. TzKT missed baking right for block ${formatCount(block.level)}.`
            : `The R${miss.round} missed baking-right identity for block ${formatCount(block.level)} is ${miss.state}.`;
        return `<span class="live-head-story-chip is-round-miss" data-live-head-kind="missed-baking" data-live-head-mandatory="true" data-missed-round="${miss.round}" data-round-miss-state="${miss.state}" data-round-miss-full="${escapeHtml(copy)}" data-round-miss-compact="${escapeHtml(compact)}" data-live-head-compact="${escapeHtml(copy)}" aria-label="${escapeHtml(copy)}" title="${escapeHtml(title)}">${escapeHtml(copy)}</span>`;
    }).join('');
}

async function fetchHeartbeatBakingMisses(blocks) {
    if (document.visibilityState !== 'visible') return;
    const needed = blocks.filter((block) => Number.isSafeInteger(block.blockRound) && block.blockRound > 0);
    const pending = [];
    const missing = needed.filter((block) => {
        const receipt = heartbeatBakingMisses.get(Number(block.level));
        if (receipt?.promise) { pending.push(receipt.promise); return false; }
        return !receipt || (receipt.bakers.size < block.blockRound && Date.now() - receipt.attemptedAt >= LIVE_REFRESH_INTERVAL);
    });
    if (!missing.length) return Promise.allSettled(pending);
    const levels = missing.map((block) => Number(block.level));
    const limit = 1000;
    const url = `${TZKT}/rights?type=baking&status=missed&level.in=${levels.join(',')}&limit=${limit}&select=level,round,baker,status,type`;
    const promise = fetchJson(url, 1, { priority: 'interactive' }).then((rights) => {
        if (!Array.isArray(rights)) throw new Error('Invalid missed baking-right receipt');
        for (const right of rights) {
            const block = missing.find((item) => Number(item.level) === Number(right.level));
            // A higher block round is not itself proof that a named baker missed a right.
            if (!block || right.status !== 'missed' || right.type !== 'baking'
                || !Number.isInteger(right.round) || right.round < 0 || right.round >= block.blockRound
                || !right.baker?.address) continue;
            heartbeatBakingMisses.get(Number(block.level))?.bakers.set(right.round, { ...right.baker });
        }
    }).catch((error) => {
        console.warn('Live Head missed baking-right receipt failed:', error);
    }).finally(() => {
        for (const level of levels) {
            const receipt = heartbeatBakingMisses.get(level);
            if (receipt?.promise === promise) receipt.promise = null;
        }
        for (const level of [...heartbeatBakingMisses.keys()].sort((a, b) => a - b)) {
            if (heartbeatBakingMisses.size <= CHAIN_HEALTH_BLOCK_LIMIT) break;
            if (!heartbeatBakingMisses.get(level)?.promise) heartbeatBakingMisses.delete(level);
        }
    });
    for (const level of levels) {
        const previous = heartbeatBakingMisses.get(level);
        heartbeatBakingMisses.set(level, { bakers: previous?.bakers || new Map(), attemptedAt: Date.now(), promise });
    }
    return Promise.allSettled([promise, ...pending]);
}

function liveHeadPillOverflows(container) {
    if (container.scrollWidth > container.clientWidth + 1) return true;
    return [...container.querySelectorAll('.live-head-miss-pill:not([hidden])')]
        .some((pill) => pill.scrollWidth > pill.clientWidth + 1);
}

function liveHeadStoryDetails(pill) {
    try {
        const details = JSON.parse(pill?.dataset?.liveHeadDetails || '[]');
        return Array.isArray(details) ? details.filter(Boolean) : [];
    } catch {
        return [];
    }
}

function setLiveHeadStoryDetail(pill, level = 0) {
    if (!pill) return;
    if (pill.dataset.roundMissFull) {
        pill.dataset.liveHeadCompact = window.matchMedia?.('(max-width: 719px)')?.matches
            ? pill.dataset.roundMissCompact
            : pill.dataset.roundMissFull;
    }
    const details = liveHeadStoryDetails(pill);
    const normalizedLevel = Math.max(0, Math.min(details.length, Number(level) || 0));
    pill.textContent = normalizedLevel > 0
        ? details[normalizedLevel - 1]
        : (pill.dataset.liveHeadCompact || pill.textContent || '');
    pill.dataset.liveHeadDetailLevel = String(normalizedLevel);
    pill.classList.toggle('is-expanded', normalizedLevel > 0);
}

function loadLiveHeadActivityFilters() {
    if (liveHeadActivityFiltersLoaded) return;
    liveHeadActivityFiltersLoaded = true;
    try {
        const stored = localStorage.getItem(LIVE_HEAD_ACTIVITY_FILTER_STORAGE_KEY);
        const v2Stored = stored === null ? localStorage.getItem(LIVE_HEAD_ACTIVITY_FILTER_V2_STORAGE_KEY) : null;
        const v1Stored = stored === null && v2Stored === null
            ? localStorage.getItem(LIVE_HEAD_ACTIVITY_FILTER_LEGACY_STORAGE_KEY)
            : null;
        const saved = JSON.parse(stored || v2Stored || v1Stored || 'null');
        if (Array.isArray(saved)) {
            const savedSet = new Set(saved);
            const priorTypes = v1Stored !== null
                ? LIVE_HEAD_ACTIVITY_V2_TYPES.filter((kind) => kind !== 'l1-vote' && kind !== 'l2-vote')
                : LIVE_HEAD_ACTIVITY_V2_TYPES;
            const priorAllSelected = stored === null && priorTypes.every((kind) => savedSet.has(kind));
            liveHeadSelectedActivityTypes = priorAllSelected
                ? new Set(LIVE_HEAD_ACTIVITY_TYPES)
                : new Set(saved.filter((kind) => LIVE_HEAD_ACTIVITY_TYPES.includes(kind)));
            if (v1Stored !== null && !priorAllSelected) {
                liveHeadSelectedActivityTypes.add('l1-vote');
                liveHeadSelectedActivityTypes.add('l2-vote');
            }
            if (stored === null) {
                localStorage.setItem(LIVE_HEAD_ACTIVITY_FILTER_STORAGE_KEY, JSON.stringify([...liveHeadSelectedActivityTypes]));
            }
        }
    } catch {
        liveHeadSelectedActivityTypes = new Set(LIVE_HEAD_ACTIVITY_TYPES);
    }
}

function liveHeadActivityTypeIsSelected(kind) {
    loadLiveHeadActivityFilters();
    return liveHeadSelectedActivityTypes.has(kind);
}

function liveHeadActivityFilterParts(root) {
    if (!root) return {};
    const filter = root.matches?.('.live-head-filter') ? root : root.querySelector?.('.live-head-filter');
    return {
        filter,
        toggle: filter?.querySelector('[data-live-head-filter-toggle], #live-head-filter-toggle'),
        menu: filter?.querySelector('[data-live-head-filter-menu], #live-head-filter-menu')
    };
}

function syncLiveHeadActivityFilterUi(root) {
    const { filter, toggle } = liveHeadActivityFilterParts(root);
    if (!filter) return;
    loadLiveHeadActivityFilters();
    const allSelected = liveHeadSelectedActivityTypes.size === LIVE_HEAD_ACTIVITY_TYPES.length;
    filter.querySelectorAll('[data-live-head-filter-kind]').forEach((button) => {
        const kind = button.dataset.liveHeadFilterKind;
        const selected = kind === 'all' ? allSelected : liveHeadSelectedActivityTypes.has(kind);
        button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
    if (toggle) {
        const selectedCount = liveHeadSelectedActivityTypes.size;
        const personal = liveHeadMyTezosOnly ? ', My Tezos blocks only' : '';
        toggle.classList.toggle('is-filtered', !allSelected || liveHeadMyTezosOnly);
        toggle.setAttribute('aria-label', `Choose visible block activity, ${selectedCount} of ${LIVE_HEAD_ACTIVITY_TYPES.length} selected${personal}`);
        toggle.title = `${selectedCount} of ${LIVE_HEAD_ACTIVITY_TYPES.length} block activity types selected${personal}`;
    }
}

function syncAllLiveHeadActivityFilterUis() {
    document.querySelectorAll('.live-head-filter').forEach(syncLiveHeadActivityFilterUi);
}

function closeLiveHeadActivityFilter(root, { restoreFocus = false } = {}) {
    const { filter, toggle, menu } = liveHeadActivityFilterParts(root);
    if (!toggle || !menu || menu.hidden) return;
    menu.hidden = true;
    if (filter) delete filter.dataset.overlayEscapeOpen;
    toggle.setAttribute('aria-expanded', 'false');
    if (restoreFocus) toggle.focus({ preventScroll: true });
}

function wireLiveHeadActivityFilter(root) {
    const { filter, toggle, menu } = liveHeadActivityFilterParts(root);
    if (!filter || !toggle || !menu) return;
    wireLiveHeadMyTezosControls(filter);
    if (root !== filter && root?.dataset) root.dataset.liveHeadActivityFilterWired = '1';
    if (filter.dataset.liveHeadActivityFilterWired) {
        syncLiveHeadActivityFilterUi(filter);
        return;
    }
    filter.dataset.liveHeadActivityFilterWired = '1';
    syncLiveHeadActivityFilterUi(filter);

    toggle.addEventListener('click', () => {
        const opening = menu.hidden;
        menu.hidden = !opening;
        if (opening) filter.dataset.overlayEscapeOpen = 'true';
        else delete filter.dataset.overlayEscapeOpen;
        toggle.setAttribute('aria-expanded', opening ? 'true' : 'false');
        if (opening) menu.querySelector('[data-live-head-filter-kind]')?.focus({ preventScroll: true });
    });
    menu.addEventListener('click', (event) => {
        const button = event.target.closest('[data-live-head-filter-kind]');
        if (!button) return;
        const kind = button.dataset.liveHeadFilterKind;
        if (kind === 'all') {
            liveHeadSelectedActivityTypes = liveHeadSelectedActivityTypes.size === LIVE_HEAD_ACTIVITY_TYPES.length
                ? new Set()
                : new Set(LIVE_HEAD_ACTIVITY_TYPES);
        } else if (LIVE_HEAD_ACTIVITY_TYPES.includes(kind)) {
            if (liveHeadSelectedActivityTypes.has(kind)) liveHeadSelectedActivityTypes.delete(kind);
            else liveHeadSelectedActivityTypes.add(kind);
        }
        try {
            localStorage.setItem(LIVE_HEAD_ACTIVITY_FILTER_STORAGE_KEY, JSON.stringify([...liveHeadSelectedActivityTypes]));
        } catch { /* preference storage unavailable */ }
        syncAllLiveHeadActivityFilterUis();
        fitLiveHeadPills(document);
    });
    document.addEventListener('pointerdown', (event) => {
        if (!menu.hidden && !filter.contains(event.target)) closeLiveHeadActivityFilter(filter);
    }, { capture: true });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !menu.hidden) {
            event.stopPropagation();
            closeLiveHeadActivityFilter(filter, { restoreFocus: true });
        }
    });
}

function fitLiveHeadPills(root = document) {
    const compactViewport = window.matchMedia?.('(max-width: 719px)')?.matches === true;
    root.querySelectorAll?.('.live-head-story').forEach((container) => {
        const missedPills = [...container.querySelectorAll('[data-missed-baker-address]')];
        const storyPills = [...container.querySelectorAll('.live-head-story-chip')];
        const overflowPill = container.querySelector('[data-live-head-miss-overflow]');

        missedPills.forEach((pill) => { pill.hidden = false; });
        storyPills.forEach((pill) => {
            pill.hidden = pill.dataset.liveHeadMandatory !== 'true'
                && !liveHeadActivityTypeIsSelected(pill.dataset.liveHeadKind);
            setLiveHeadStoryDetail(pill, 0);
        });
        const selectedStoryPills = storyPills.filter((pill) => !pill.hidden);
        const optionalStoryPills = selectedStoryPills.filter((pill) => pill.dataset.liveHeadMandatory !== 'true');
        if (overflowPill) {
            overflowPill.hidden = true;
            overflowPill.textContent = '';
            overflowPill.title = '';
        }

        if (liveHeadPillOverflows(container)) {
            let visibleOptionalStoryCount = optionalStoryPills.length;
            while (liveHeadPillOverflows(container) && visibleOptionalStoryCount > 0) {
                optionalStoryPills[--visibleOptionalStoryCount].hidden = true;
            }

            const hiddenMisses = [];
            if (overflowPill && liveHeadPillOverflows(container)) overflowPill.hidden = false;
            let visibleMissCount = missedPills.length;
            while (liveHeadPillOverflows(container) && visibleMissCount > 1) {
                const pill = missedPills[--visibleMissCount];
                pill.hidden = true;
                hiddenMisses.unshift(pill);
                if (overflowPill) {
                    overflowPill.textContent = `+${formatCount(hiddenMisses.length)} baker${hiddenMisses.length === 1 ? '' : 's'}`;
                    overflowPill.title = hiddenMisses.map((item) => item.title).filter(Boolean).join(' ');
                }
            }
            if (overflowPill && !hiddenMisses.length) overflowPill.hidden = true;
            while (overflowPill && !overflowPill.hidden && liveHeadPillOverflows(container) && visibleMissCount > 0) {
                const pill = missedPills[--visibleMissCount];
                pill.hidden = true;
                hiddenMisses.unshift(pill);
                overflowPill.textContent = `+${formatCount(hiddenMisses.length)} baker${hiddenMisses.length === 1 ? '' : 's'}`;
                overflowPill.title = hiddenMisses.map((item) => item.title).filter(Boolean).join(' ');
            }
            if (overflowPill && !overflowPill.hidden && hiddenMisses.length && liveHeadPillOverflows(container)) {
                overflowPill.textContent = `+${formatCount(hiddenMisses.length)}`;
            }
        }

        if (!compactViewport && container.clientWidth >= LIVE_HEAD_DETAIL_MIN_WIDTH) {
            selectedStoryPills.filter((pill) => !pill.hidden).forEach((pill) => {
                const details = liveHeadStoryDetails(pill);
                for (let level = 1; level <= details.length; level += 1) {
                    setLiveHeadStoryDetail(pill, level);
                    if (liveHeadPillOverflows(container) || pill.scrollWidth > pill.clientWidth + 1) {
                        setLiveHeadStoryDetail(pill, level - 1);
                        break;
                    }
                }
            });
        }

        const visibleMissCount = missedPills.filter((pill) => !pill.hidden).length;
        const hiddenMissCount = missedPills.length - visibleMissCount;
        container.dataset.visibleMissCount = String(visibleMissCount);
        container.dataset.hiddenMissCount = String(hiddenMissCount);
    });
}

function scheduleLiveHeadPillFit(panel) {
    if (liveHeadPillFitFrame) window.cancelAnimationFrame(liveHeadPillFitFrame);
    liveHeadPillFitFrame = window.requestAnimationFrame(() => {
        liveHeadPillFitFrame = null;
        fitLiveHeadPills(panel);
    });
}

function wireLiveHeadPillFitting(panel) {
    if (!panel || liveHeadPillResizeObserver || typeof ResizeObserver !== 'function') return;
    const scheduleAfterPaint = () => window.requestAnimationFrame(() => scheduleLiveHeadPillFit(panel));
    const refitForTheme = (event = null) => {
        const theme = event?.detail?.theme || document.body?.dataset?.theme || '';
        scheduleAfterPaint();
        document.fonts?.ready?.then(scheduleAfterPaint);

        for (const link of [
            document.getElementById(`theme-css-${theme}`),
            document.getElementById(`theme-fonts-${theme}`)
        ]) {
            if (link && !link.sheet) link.addEventListener('load', scheduleAfterPaint, { once: true });
        }
    };
    liveHeadPillResizeObserver = new ResizeObserver(() => scheduleLiveHeadPillFit(panel));
    liveHeadPillResizeObserver.observe(panel);
    window.addEventListener('resize', () => fitLiveHeadPills(panel), { passive: true });
    window.addEventListener('themechange', refitForTheme);
    document.fonts?.addEventListener?.('loadingdone', scheduleAfterPaint);
    refitForTheme();
}

function liveHeadBlockUrl(level, { operations = false } = {}) {
    const encodedLevel = encodeURIComponent(String(Number(level) || 0));
    return `https://tzkt.io/${encodedLevel}${operations ? '/operations/' : ''}`;
}

function liveHeadBakerLinks(baker, { label = '' } = {}) {
    const address = String(baker?.address || '');
    const name = label || bakerName(baker);
    if (!address) return `<strong>${escapeHtml(name)}</strong>`;
    const encoded = encodeURIComponent(address);
    return `
        <span class="live-head-inspector-identity-copy">
            <strong title="${escapeHtml(address)}">${escapeHtml(name)}</strong>
            <span>${escapeHtml(address)}</span>
        </span>
        <span class="live-head-inspector-links">
            <a href="https://tzkt.io/${encoded}" target="_blank" rel="noopener" title="Open ${escapeHtml(name)} on TzKT">TzKT ↗</a>
            <a href="/#my-baker=${encoded}" title="Open ${escapeHtml(name)} in My Tezos">My Tezos</a>
        </span>`;
}

function formatLiveHeadTimestamp(value) {
    const date = new Date(value || '');
    if (!Number.isFinite(date.getTime())) return 'Timestamp unavailable';
    return `${date.toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC'
    })} · ${date.toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'UTC'
    })} UTC`;
}

function formatLiveHeadTez(mutez) {
    const amount = Number(mutez) / 1e6;
    if (!Number.isFinite(amount)) return '--';
    return `${amount.toLocaleString('en-US', { maximumFractionDigits: 6 })} ꜩ`;
}

function renderLiveHeadInspectorFact({ label, value, href, className = '' }) {
    return `
        <a class="live-head-inspector-fact ${escapeHtml(className)}" href="${escapeHtml(href)}" target="_blank" rel="noopener">
            <span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><i aria-hidden="true">↗</i>
        </a>`;
}

function chainHealthMissedCopy(block, missed) {
    if (missed.state === 'resolved') {
        return `Missed attesters: ${missed.attesters.map((item) => `${item.name} (−${formatCount(item.slots)} power)`).join(', ')}.${missed.sampleClipped ? ' The source sample is incomplete.' : ''}`;
    }
    if (missed.sampleClipped) return 'The source sample is incomplete; baker details for this block are unavailable.';
    if (missed.state === 'clear') return Number(block?.missedPower) > 0
        ? 'Attestation power was missed, but TzKT has not indexed the baker identities.'
        : 'No missed attestation rights in the TzKT receipt.';
    return missed.state === 'unavailable' ? 'Missed-baker details are unavailable.' : 'Loading missed-baker details.';
}

function renderChainHealthInspector(block, missed) {
    const blockUrl = liveHeadBlockUrl(block.level);
    const rows = missed.state === 'resolved'
        ? missed.attesters.map((attester) => `<a class="chain-health-mini-baker" href="https://tzkt.io/${encodeURIComponent(attester.address)}" target="_blank" rel="noopener" aria-label="${escapeHtml(attester.name)} missed ${formatCount(attester.slots)} attestation power at block ${formatCount(block.level)}">
            <span>${escapeHtml(attester.name)}</span><strong>−${formatCount(attester.slots)}</strong>
          </a>`).join('')
        : `<p class="chain-health-mini-note">${escapeHtml(chainHealthMissedCopy(block, missed))}</p>`;
    return `<div class="chain-health-mini-heading" data-quiet-key="chain-block-summary">
            <a href="${escapeHtml(blockUrl)}" target="_blank" rel="noopener">#${formatCount(block.level)} ↗</a><span>Missed power</span>
        </div>
        <div class="chain-health-mini-bakers" data-quiet-key="chain-block-misses">${rows}</div>
        ${missed.state === 'resolved' && missed.sampleClipped ? '<p class="chain-health-mini-note">Partial source sample.</p>' : ''}`;
}

function renderLiveHeadInspector(block, activity, missedSnapshot = null, bakingSnapshot = []) {
    const level = Number(block?.level) || 0;
    const blockUrl = liveHeadBlockUrl(level);
    const operationsUrl = liveHeadBlockUrl(level, { operations: true });
    const status = latestBlockStatus(block);
    const gas = liveHeadGasState(activity);
    const missedState = missedSnapshot || liveHeadMissedState(block, activity?.story || null);
    const powerKnown = Number.isFinite(block?.power) && Number.isFinite(block?.committee);
    const proposerDiffers = block?.proposer?.address
        && block.proposer.address !== block?.producer?.address;
    const safetyLabel = Number(status.safetyMargin) >= 0 ? 'Quorum safety' : 'Quorum deficit';
    const safetyValue = Number.isFinite(status.safetyMargin)
        ? `${status.safetyMargin >= 0 ? '+' : '−'}${formatCount(Math.abs(status.safetyMargin))} power`
        : 'Unavailable';
    const gasValue = gas.state === 'resolved'
        ? `${gas.exactPct.toFixed(1)}% · ${formatCount(Math.round(gas.gasUsed))}/${formatCount(gas.gasLimit)}`
        : gas.state === 'quiet' ? 'Quiet · no reviewed activity' : 'Unavailable';
    const facts = [
        { label: 'Block round', value: `R${formatCount(block?.blockRound)}`, href: blockUrl },
        { label: 'Payload round', value: `R${formatCount(block?.payloadRound)}`, href: blockUrl },
        { label: 'Cadence', value: formatSeconds(block?.intervalSeconds), href: blockUrl },
        { label: 'Attested', value: powerKnown ? `${formatCount(block.power)}/${formatCount(block.committee)}` : 'Unavailable', href: blockUrl, className: status.className },
        { label: safetyLabel, value: safetyValue, href: blockUrl, className: status.className },
        { label: 'Missed power', value: Number.isFinite(block?.missedPower) ? `−${formatCount(block.missedPower)}` : 'Unavailable', href: blockUrl },
        { label: 'Block activity', value: gasValue, href: operationsUrl, className: gas.className ? `gas-${gas.className}` : gas.state },
        { label: 'Transactions', value: Number.isFinite(activity?.txCount) ? formatCount(activity.txCount) : 'Unavailable', href: operationsUrl },
        { label: 'Contract calls', value: Number.isFinite(activity?.contractCalls) ? formatCount(activity.contractCalls) : 'Unavailable', href: operationsUrl },
        { label: 'Staking ops', value: Number.isFinite(activity?.stakingCount) ? formatCount(activity.stakingCount) : 'Unavailable', href: operationsUrl },
        { label: 'Fees', value: Number.isFinite(block?.feesMutez) ? formatLiveHeadTez(block.feesMutez) : 'Unavailable', href: blockUrl },
        { label: 'Rewards + bonus', value: Number.isFinite(block?.mintedMutez) ? formatLiveHeadTez(block.mintedMutez) : 'Unavailable', href: blockUrl }
    ];
    const activityFragments = Array.isArray(activity?.story?.fragments)
        ? activity.story.fragments.filter((fragment) => fragment.key !== 'quiet')
        : [];
    const activityHtml = activityFragments.length
        ? activityFragments.map((fragment) => renderLiveHeadInspectorFact({
            label: fragment.label || fragment.key,
            value: fragment.details?.[fragment.details.length - 1] || fragment.text || 'Receipt',
            href: operationsUrl,
            className: `story-${fragment.key}`
        })).join('')
        : renderLiveHeadInspectorFact({
            label: 'Classified activity',
            value: activity?.story?.quiet === true ? 'Quiet block' : 'Receipt syncing',
            href: operationsUrl,
            className: activity?.story?.quiet === true ? 'quiet' : 'loading'
        });
    const largestTransfer = activity?.largestTransfer || null;
    const largestTransferHref = largestTransfer?.hash
        ? `https://tzkt.io/${encodeURIComponent(largestTransfer.hash)}`
        : operationsUrl;
    const largestTransferHtml = largestTransfer && Number(largestTransfer.amount) > 0
        ? renderLiveHeadInspectorFact({
            label: 'Largest transfer',
            value: formatLiveHeadTez(largestTransfer.amount),
            href: largestTransferHref,
            className: 'story-transfers'
        })
        : '';
    let missedHtml = '';
    if (missedState.state === 'resolved') {
        missedHtml = missedState.attesters.map((attester) => `
            <div class="live-head-inspector-miss">
                <span class="live-head-inspector-miss-power">−${formatCount(attester.slots)}</span>
                ${liveHeadBakerLinks({ address: attester.address, alias: attester.name }, { label: attester.name })}
            </div>`).join('');
    } else {
        const copy = missedState.state === 'clear'
            ? (Number(block?.missedPower) > 0 ? 'No baker identities were indexed for the missed power.' : 'No missed attestations in the TzKT receipt.')
            : missedState.required ? 'Missed-attester receipt is still syncing.' : 'No expanded missed-attester receipt was required.';
        missedHtml = `<a class="live-head-inspector-empty" href="${escapeHtml(blockUrl)}" target="_blank" rel="noopener">${escapeHtml(copy)} <span aria-hidden="true">↗</span></a>`;
    }

    return `
        <div class="live-head-inspector-summary">
            <span class="live-head-inspector-kicker">Complete block receipt</span>
            <a class="live-head-inspector-level" href="${escapeHtml(blockUrl)}" target="_blank" rel="noopener">Block #${formatCount(level)} <span aria-hidden="true">↗</span></a>
            <a class="live-head-inspector-time" href="${escapeHtml(blockUrl)}" target="_blank" rel="noopener">${escapeHtml(formatLiveHeadTimestamp(block?.timestamp))} · ${escapeHtml(formatAge(block?.timestamp))}</a>
        </div>
        <div class="live-head-inspector-identity">
            <span class="live-head-inspector-label">Produced by</span>
            ${liveHeadBakerLinks(block?.producer || {})}
        </div>
        ${proposerDiffers ? `
            <div class="live-head-inspector-identity">
                <span class="live-head-inspector-label">Proposed by</span>
                ${liveHeadBakerLinks(block.proposer)}
            </div>` : ''}
        <div class="live-head-inspector-grid">${facts.map(renderLiveHeadInspectorFact).join('')}</div>
        ${bakingSnapshot.length ? `<div class="live-head-inspector-section" data-inspector-baking-misses>
            <span class="live-head-inspector-label">Missed baking rounds</span>
            <div class="live-head-inspector-misses">${bakingSnapshot.map((miss) => miss.baker ? `
                <div class="live-head-inspector-miss" data-inspector-missed-round="${miss.round}">
                    <a class="live-head-inspector-miss-power" href="${escapeHtml(blockUrl)}" target="_blank" rel="noopener">R${miss.round} ↗</a>
                    ${liveHeadBakerLinks(miss.baker)}
                </div>` : `<div class="live-head-inspector-empty" data-inspector-missed-round="${miss.round}">${escapeHtml(bakingMissCopy(miss))} — no confirmed missed-right identity.</div>`).join('')}</div>
        </div>` : ''}
        <div class="live-head-inspector-section">
            <span class="live-head-inspector-label">Block contents</span>
            <div class="live-head-inspector-grid is-activity">${activityHtml}${largestTransferHtml}</div>
        </div>
        <div class="live-head-inspector-section">
            <span class="live-head-inspector-label">Missed attestations</span>
            <div class="live-head-inspector-misses">${missedHtml}</div>
        </div>
        <a class="live-head-inspector-health" href="#health" data-live-head-open-health>Open Network Health Chamber <span aria-hidden="true">→</span></a>`;
}

function cancelLiveHeadInspectorClose() {
    if (!liveHeadInspectorCloseTimer) return;
    window.clearTimeout(liveHeadInspectorCloseTimer);
    liveHeadInspectorCloseTimer = null;
}

function cancelLiveHeadInspectorResume() {
    if (!liveHeadInspectorResumeTimer) return;
    window.clearTimeout(liveHeadInspectorResumeTimer);
    liveHeadInspectorResumeTimer = null;
}

function liveHeadReadingPaused() {
    const inspector = document.getElementById('live-head-inspector');
    return Boolean(
        (Number.isFinite(liveHeadInspectorLevel) && inspector && !inspector.hidden)
        || liveHeadInspectorResumeTimer
    );
}

function queueLiveHeadPausedUpdate(data, { error = false, supplemental = false } = {}) {
    const incomingLevel = Number(data?.blocks?.[0]?.level) || 0;
    const currentLevel = Number(liveHeadPendingUpdate?.level) || 0;
    if (!liveHeadPendingUpdate || incomingLevel >= currentLevel) {
        liveHeadPendingUpdate = {
            data: data || liveHeadPendingUpdate?.data || heartbeatData,
            error,
            supplemental,
            level: incomingLevel || currentLevel || Number(heartbeatData?.blocks?.[0]?.level) || 0
        };
    } else if (error) {
        liveHeadPendingUpdate.error = true;
    }
    const panel = document.getElementById('live-head');
    if (panel) {
        panel.dataset.readingPaused = 'true';
        panel.dataset.liveHeadPendingLevel = String(liveHeadPendingUpdate?.level || '');
    }
}

function resumeLiveHeadAfterInspector() {
    cancelLiveHeadInspectorResume();
    const panel = document.getElementById('live-head');
    const pending = liveHeadPendingUpdate;
    liveHeadPendingUpdate = null;
    if (panel) {
        delete panel.dataset.readingPaused;
        delete panel.dataset.liveHeadPendingLevel;
    }
    if (pending?.data) {
        updateBlockTicker(pending.data, {
            error: pending.error,
            supplemental: pending.supplemental,
            suppressMotion: true
        });
    } else if (pending?.error && heartbeatData) {
        updateBlockTicker(heartbeatData, { error: true, suppressMotion: true });
    } else {
        refreshHealthAgeLabels(panel || document);
    }
}

function closeLiveHeadInspector({ suppressReopen = false, deferResume = false } = {}) {
    const wasPaused = liveHeadReadingPaused();
    cancelLiveHeadInspectorClose();
    cancelLiveHeadInspectorResume();
    const inspector = document.getElementById('live-head-inspector');
    if (inspector) {
        inspector.hidden = true;
        inspector.setAttribute('aria-hidden', 'true');
        inspector.removeAttribute('data-open');
        inspector.style.removeProperty('left');
        inspector.style.removeProperty('top');
    }
    document.querySelectorAll('#live-head-stack .live-head-info[aria-expanded="true"]').forEach((trigger) => {
        trigger.setAttribute('aria-expanded', 'false');
    });
    document.querySelectorAll('.chain-health-bar.is-inspected').forEach((bar) => bar.classList.remove('is-inspected'));
    document.getElementById('chain-health')?.setAttribute('aria-expanded', 'false');
    liveHeadInspectorLevel = null;
    liveHeadInspectorAnchor = null;
    if (suppressReopen && wasPaused) {
        liveHeadInspectorSuppressedPointerPosition = { ...liveHeadPointerPosition };
    }
    if (wasPaused || liveHeadPendingUpdate) {
        if (deferResume) {
            liveHeadInspectorResumeTimer = window.setTimeout(() => {
                liveHeadInspectorResumeTimer = null;
                resumeLiveHeadAfterInspector();
            }, 360);
        } else {
            resumeLiveHeadAfterInspector();
        }
    }
}

function scheduleLiveHeadInspectorClose() {
    cancelLiveHeadInspectorClose();
    liveHeadInspectorCloseTimer = window.setTimeout(() => {
        liveHeadInspectorCloseTimer = null;
        const inspector = document.getElementById('live-head-inspector');
        const trigger = liveHeadInspectorAnchor?.matches('[data-chain-health-level]') ? liveHeadInspectorAnchor : Number.isFinite(liveHeadInspectorLevel)
            ? document.querySelector(`#live-head-stack .live-head-row[data-live-head-level="${liveHeadInspectorLevel}"] .live-head-info`)
            : null;
        const active = document.activeElement;
        const stillReading = Boolean(
            inspector?.matches(':hover')
            || trigger?.matches(':hover')
            || (active instanceof Element && inspector?.contains(active))
            || active === trigger
        );
        if (stillReading) return;
        closeLiveHeadInspector({ deferResume: true });
    }, LIVE_HEAD_INSPECTOR_CLOSE_DELAY);
}

function positionLiveHeadInspector(row, inspector) {
    if (!row || !inspector || inspector.hidden) return;
    const rowRect = row.getBoundingClientRect();
    const triggerRect = row.matches('[data-chain-health-level]') ? rowRect : row.querySelector('.live-head-info')?.getBoundingClientRect() || null;
    const inspectorRect = inspector.getBoundingClientRect();
    const edge = 10;
    const anchorLeft = triggerRect
        ? triggerRect.right - inspectorRect.width
        : rowRect.left + Math.min(Math.max(rowRect.width * 0.27, 84), 330);
    const left = Math.max(edge, Math.min(anchorLeft, window.innerWidth - inspectorRect.width - edge));
    let top = (triggerRect?.bottom || rowRect.bottom) + 6;
    if (top + inspectorRect.height > window.innerHeight - edge) top = (triggerRect?.top || rowRect.top) - inspectorRect.height - 6;
    top = Math.max(edge, Math.min(top, window.innerHeight - inspectorRect.height - edge));
    inspector.style.left = `${Math.round(left)}px`;
    inspector.style.top = `${Math.round(top)}px`;
}

function showLiveHeadInspector(row, { fetchMissing = true } = {}) {
    const inspector = document.getElementById('live-head-inspector');
    const isChainHealth = row?.matches('[data-chain-health-level]');
    const level = Number(isChainHealth ? row.dataset.chainHealthLevel : row?.dataset.liveHeadLevel);
    const blocks = heartbeatData?.chainHealthBlocks || heartbeatData?.blocks || [];
    const block = blocks.find((item) => Number(item.level) === level);
    if (!inspector || !row || !block || document.getElementById('network-health-modal')?.classList.contains('active')) return;
    cancelLiveHeadInspectorResume();
    cancelLiveHeadInspectorClose();
    const trigger = row.querySelector('.live-head-info');
    document.querySelectorAll('#live-head-stack .live-head-info[aria-expanded="true"]').forEach((item) => {
        if (item !== trigger) item.setAttribute('aria-expanded', 'false');
    });
    const activity = heartbeatActivityCache.get(level) || null;
    const missedSnapshot = isChainHealth ? liveHeadMissedState(block, null, { force: true }) : liveHeadMissedStateFromRow(row, level);
    let bakingSnapshot = [];
    try { bakingSnapshot = JSON.parse(row.querySelector('[data-live-head-baking-snapshot]')?.dataset.liveHeadBakingSnapshot || '[]'); } catch { /* retain an unavailable receipt */ }
    inspector.classList.toggle('is-chain-health', isChainHealth);
    const html = isChainHealth ? renderChainHealthInspector(block, missedSnapshot) : renderLiveHeadInspector(block, activity, missedSnapshot, bakingSnapshot);
    if (isChainHealth && !inspector.hidden && liveHeadInspectorAnchor?.matches('[data-chain-health-level]')) quietlySyncHtml(inspector, html);
    else inspector.innerHTML = html;
    inspector.setAttribute('aria-label', isChainHealth ? `Missed attestations for block ${formatCount(level)}` : 'Complete block receipt');
    inspector.hidden = false;
    inspector.setAttribute('aria-hidden', 'false');
    inspector.dataset.open = 'true';
    inspector.dataset.liveHeadLevel = String(level);
    trigger?.setAttribute('aria-expanded', 'true');
    liveHeadInspectorLevel = level;
    liveHeadInspectorAnchor = row;
    document.querySelectorAll('.chain-health-bar.is-inspected').forEach((bar) => bar.classList.remove('is-inspected'));
    if (isChainHealth) row.classList.add('is-inspected');
    document.getElementById('chain-health')?.setAttribute('aria-expanded', String(isChainHealth));
    const panel = document.getElementById('live-head');
    if (panel) panel.dataset.readingPaused = 'true';
    positionLiveHeadInspector(row, inspector);
    if (isChainHealth && fetchMissing && missedSnapshot.state === 'loading') {
        fetchHeartbeatMissedRights(blocks).then(() => {
            if (liveHeadInspectorAnchor === row && !inspector.hidden && document.visibilityState === 'visible') {
                showLiveHeadInspector(row, { fetchMissing: false });
            }
        });
    }
}

function refreshLiveHeadInspector() {
    if (!Number.isFinite(liveHeadInspectorLevel)) return;
    if (liveHeadInspectorAnchor?.matches('[data-chain-health-level]') && liveHeadInspectorAnchor.isConnected) {
        positionLiveHeadInspector(liveHeadInspectorAnchor, document.getElementById('live-head-inspector'));
        return;
    }
    const row = document.querySelector(`#live-head-stack .live-head-row[data-live-head-level="${liveHeadInspectorLevel}"]`);
    if (!row) closeLiveHeadInspector();
    else showLiveHeadInspector(row);
}

function wireLiveHeadInspector(panel, stack) {
    const inspector = document.getElementById('live-head-inspector');
    if (!panel || !stack || !inspector || panel.dataset.liveHeadInspectorWired) return;
    panel.dataset.liveHeadInspectorWired = '1';
    stack.addEventListener('pointerover', (event) => {
        const trigger = event.target.closest('.live-head-info');
        if (!trigger || trigger.contains(event.relatedTarget)) return;
        const row = trigger.closest('.live-head-row[data-live-head-level]');
        if (!row) return;
        const suppressed = liveHeadInspectorSuppressedPointerPosition;
        if (suppressed && event.clientX === suppressed.x && event.clientY === suppressed.y) return;
        liveHeadInspectorSuppressedPointerPosition = null;
        showLiveHeadInspector(row);
    });
    stack.addEventListener('pointerout', (event) => {
        const trigger = event.target.closest('.live-head-info');
        if (!trigger || trigger.contains(event.relatedTarget)) return;
        if (event.relatedTarget instanceof Element
            && event.relatedTarget.closest('#live-head-inspector, .live-head-info')) {
            cancelLiveHeadInspectorClose();
            return;
        }
        scheduleLiveHeadInspectorClose();
    });
    stack.addEventListener('focusin', (event) => {
        const trigger = event.target.closest('.live-head-info');
        const row = trigger?.closest('.live-head-row[data-live-head-level]');
        if (trigger && row) {
            liveHeadInspectorSuppressedPointerPosition = null;
            showLiveHeadInspector(row);
        }
    });
    stack.addEventListener('focusout', (event) => {
        const trigger = event.target.closest('.live-head-info');
        if (!trigger) return;
        if (event.relatedTarget instanceof Element
            && event.relatedTarget.closest('#live-head-inspector, .live-head-info')) {
            cancelLiveHeadInspectorClose();
            return;
        }
        scheduleLiveHeadInspectorClose();
    });
    stack.addEventListener('click', (event) => {
        const trigger = event.target.closest('.live-head-info');
        const row = event.target.closest('.live-head-row[data-live-head-level]');
        if (!row) return;
        const interactive = event.target.closest('a, button, input, select, textarea, [role="button"], [contenteditable="true"]');
        if (interactive && interactive !== trigger) return;
        event.preventDefault();
        event.stopPropagation();
        liveHeadInspectorSuppressedPointerPosition = null;
        showLiveHeadInspector(row);
    });
    inspector.addEventListener('pointerenter', cancelLiveHeadInspectorClose);
    inspector.addEventListener('pointerleave', (event) => {
        if (event.relatedTarget instanceof Element
            && event.relatedTarget.closest('.live-head-info')) {
            cancelLiveHeadInspectorClose();
            return;
        }
        scheduleLiveHeadInspectorClose();
    });
    inspector.addEventListener('focusin', cancelLiveHeadInspectorClose);
    inspector.addEventListener('focusout', (event) => {
        if (event.relatedTarget instanceof Element
            && event.relatedTarget.closest('.live-head-info')) {
            cancelLiveHeadInspectorClose();
            return;
        }
        scheduleLiveHeadInspectorClose();
    });
    inspector.addEventListener('click', (event) => {
        const link = event.target.closest('a');
        if (link && !link.matches('[data-live-head-open-health]')) return;
        if (inspector.classList.contains('is-chain-health')) return;
        event.preventDefault();
        closeLiveHeadInspector();
        openNetworkHealthChamber();
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !inspector.hidden) closeLiveHeadInspector({ suppressReopen: true });
    });
    document.addEventListener('pointerdown', (event) => {
        if (inspector.hidden) return;
        if (event.target.closest('#live-head-inspector, #chain-health, .live-head-info, .live-head-row[data-live-head-level]')) return;
        closeLiveHeadInspector();
    }, { capture: true });
    document.addEventListener('pointermove', (event) => {
        const suppressed = liveHeadInspectorSuppressedPointerPosition;
        if (suppressed && (event.clientX !== suppressed.x || event.clientY !== suppressed.y)) {
            liveHeadInspectorSuppressedPointerPosition = null;
        }
        liveHeadPointerPosition = { x: event.clientX, y: event.clientY };
    }, { capture: true, passive: true });
    window.addEventListener('resize', refreshLiveHeadInspector);
    window.addEventListener('scroll', (event) => {
        if (event.target instanceof Element && event.target.closest('#live-head-inspector')) {
            cancelLiveHeadInspectorClose();
            return;
        }
        closeLiveHeadInspector({ suppressReopen: true });
    }, { passive: true, capture: true });
}

function buildLiveHeadDetails(block, activity) {
    const story = activity?.story || null;
    const missedState = liveHeadMissedState(block, story);
    const bakingMisses = liveHeadBakingMissState(block);
    const storySignature = story?.signature || 'story:loading';
    const titleParts = [];
    if (story) {
        titleParts.push(story.clipped
            ? 'This receipt sample reached an upstream row limit; + marks a minimum observed count.'
            : story.complete
                ? `Complete applied-operation receipts classified for block ${formatCount(activity.level)}; application identities use reviewed Tezos Systems catalogs.`
                : `Available applied-operation receipts classified for block ${formatCount(activity.level)}; one or more supplemental lanes remain unavailable.`);
    }
    if (missedState.state === 'resolved') {
        titleParts.push(`Missed attesters: ${missedState.attesters.map((item) => `${item.name} (−${formatCount(item.slots)})`).join(', ')}.`);
    }
    const missPills = renderLiveHeadMissPills(block, missedState);
    const storyPills = story
        ? story.fragments.filter((fragment) => fragment.key !== 'quiet').map((fragment, index) => {
            const details = Array.isArray(fragment.details) ? fragment.details.filter(Boolean) : [];
            const richest = details[details.length - 1] || fragment.text;
            const detailAttrs = details.length
                ? ` data-live-head-details="${escapeHtml(JSON.stringify(details))}" title="${escapeHtml(richest)}" aria-label="${escapeHtml(richest)}"`
                : '';
            const mandatoryAttr = fragment.mandatory === true ? ' data-live-head-mandatory="true"' : '';
            return `<span class="live-head-story-chip is-${escapeHtml(fragment.key)}${details.length ? ' has-detail' : ''}" data-live-head-kind="${escapeHtml(fragment.key)}"${mandatoryAttr} data-live-head-compact="${escapeHtml(fragment.text)}" data-live-head-detail-level="0"${detailAttrs} style="--story-index:${index}">${escapeHtml(fragment.text)}</span>`;
        }).join('')
        : '<i class="live-head-story-skeleton" aria-hidden="true"></i><i class="live-head-story-skeleton is-short" aria-hidden="true"></i>';
    const bakingSnapshot = JSON.stringify(bakingMisses);
    const signature = `${storySignature}|${missedState.signature}|baking:${bakingSnapshot}`;
    return {
        html: `<span class="live-head-story${story ? '' : ' is-loading'}" data-live-head-baking-snapshot="${escapeHtml(bakingSnapshot)}" data-story-signature="${escapeHtml(signature)}" data-miss-required="${missedState.required ? 'true' : 'false'}" data-miss-state="${escapeHtml(missedState.state)}" title="${escapeHtml(titleParts.join(' '))}">${renderBakingMissPills(block, bakingMisses)}${missPills}${storyPills}</span>`,
        signature,
        missedState
    };
}

function liveHeadGasState(activity) {
    const story = activity?.story || null;
    if (!story) return { state: 'loading', signature: 'gas:loading' };
    if (story.quiet === true) return { state: 'quiet', signature: 'gas:quiet' };

    const gasUsed = Number(activity?.gasUsed);
    const gasLimit = Number(activity?.gasLimit);
    if (!Number.isFinite(gasUsed) || gasUsed < 0 || !Number.isFinite(gasLimit) || gasLimit <= 0) {
        return { state: 'unavailable', signature: 'gas:unavailable' };
    }

    const exactPct = (gasUsed / gasLimit) * 100;
    const pct = Math.max(0, Math.min(100, exactPct));
    const className = pct >= 85 ? 'hot' : pct >= 60 ? 'busy' : pct >= 25 ? 'active' : 'open';
    const displayPct = pct > 0 && pct < 1 ? '&lt;1' : formatCount(Math.round(pct));
    return {
        state: 'resolved',
        className,
        gasUsed,
        gasLimit,
        exactPct,
        pct,
        displayPct,
        signature: `gas:${gasUsed.toFixed(3)}:${gasLimit}`
    };
}

function renderLiveHeadActivityStatus(activity) {
    const gas = liveHeadGasState(activity);
    if (gas.state === 'loading') {
        return '<i class="live-head-gas-skeleton" aria-hidden="true"></i>';
    }
    if (gas.state === 'quiet') {
        return '<span class="live-head-quiet" title="No classified application, transfer, token, governance, delegation, origination, rollup, DAL, baker-policy, evidence, or milestone event was present in the complete block receipt">Quiet</span>';
    }
    if (gas.state === 'unavailable') {
        return '<span class="live-head-gas is-unavailable" title="The exact manager-operation gas receipt or current block gas limit is temporarily unavailable"><span>Gas --</span></span>';
    }
    const title = `${formatCount(Math.round(gas.gasUsed))} of ${formatCount(gas.gasLimit)} gas used (${gas.exactPct.toFixed(1)}% full). Includes outer and internal manager-operation receipts.`;
    return `<span class="live-head-gas is-${gas.className}" style="--live-head-gas:${gas.pct.toFixed(2)}" title="${escapeHtml(title)}"><span>Gas ${gas.displayPct}%</span></span>`;
}

function renderLiveHeadRow(block, activity, { isNew = false, savedAddresses = null } = {}) {
    const producer = block?.producer || {};
    const producerHasAlias = Boolean(producer.alias);
    const name = producerHasAlias ? producer.alias : (producer.address || 'Unknown baker');
    const status = latestBlockStatus(block);
    const powerKnown = Number.isFinite(block?.power) && Number.isFinite(block?.committee);
    const score = Number.isFinite(block?.score) ? Math.max(0, Math.min(100, block.score)) : null;
    const attested = powerKnown ? `${formatCount(block.power)} of ${formatCount(block.committee)}` : 'attestation unavailable';
    const trackTitle = powerKnown
        ? `${status.label}. The first ${formatCount(status.quorumPower)} power is required; this rail shows only the safety margin beyond it.`
        : status.label;
    const details = buildLiveHeadDetails(block, activity);
    const gas = liveHeadGasState(activity);
    const activityStatus = renderLiveHeadActivityStatus(activity);
    const gasSummary = gas.state === 'resolved'
        ? ` Gas use: ${gas.exactPct.toFixed(1)}% of block capacity.`
        : gas.state === 'quiet'
            ? ' No classified chain activity was present in the complete receipt.'
            : '';
    const missedSummary = details.missedState.state === 'resolved'
        ? ` Missed attesters: ${details.missedState.attesters.map((item) => `${item.name}, ${formatCount(item.slots)} power`).join('; ')}.`
        : '';
    const title = `Inspect block ${formatCount(block.level)} from ${name}. ${status.label}: ${attested}.${gasSummary}${missedSummary}`;
    const safetyMargin = Number.isFinite(status.safetyMargin) ? status.safetyMargin : null;
    const marginSign = safetyMargin === null ? '' : safetyMargin >= 0 ? '+' : '−';
    const marginAbsolute = safetyMargin === null ? null : Math.abs(safetyMargin);
    const marginFull = marginAbsolute === null ? '--' : `${marginSign}${formatCount(marginAbsolute)}`;
    const marginCompact = marginAbsolute === null
        ? '--'
        : marginAbsolute >= 1000
            ? `${marginSign}${(marginAbsolute / 1000).toFixed(marginAbsolute >= 10000 ? 0 : 1)}K`
            : `${marginSign}${formatCount(marginAbsolute)}`;
    const barSignature = `${Number(block.level) || 0}:${safetyMargin === null ? 'unknown' : safetyMargin}:${status.quorumPower || 'unknown'}`;
    const missedSnapshot = serializeLiveHeadMissedState(Number(block.level), details.missedState);
    const personal = liveHeadMyTezosRowPresentation(
        Number(block.level) || 0,
        producer.address || '',
        savedAddresses || savedMyTezosAddressSet()
    );
    const personalClass = personal.filtered ? ' is-my-tezos-filtered-out' : '';
    const personalHidden = personal.filtered ? ' aria-hidden="true"' : '';
    return `
        <div class="live-head-row${isNew ? ' lb-row-new' : ''}${personalClass}" data-live-head-level="${block.level}" data-health-level="${Number(block.level) || 0}" data-producer-address="${escapeHtml(producer.address || '')}" data-my-tezos-block-state="${personal.state}" data-attested-power="${Number.isFinite(block?.power) ? Number(block.power) : ''}" data-safety-margin="${safetyMargin === null ? '' : safetyMargin}" data-story-quiet="${activity?.story?.quiet === true ? 'true' : 'false'}" data-gas-state="${escapeHtml(gas.state)}" data-gas-percent="${gas.state === 'resolved' ? gas.exactPct.toFixed(2) : ''}" data-consensus-state="${escapeHtml(status.className)}" data-live-head-missed-snapshot="${escapeHtml(missedSnapshot)}" data-quiet-key="live-head-block-${block.level}" data-bar-signature="${barSignature}" data-bar-available="${safetyMargin === null ? 'false' : 'true'}"${personalHidden}>
            <span class="live-head-row-main">
                <strong class="live-head-level">#${formatCount(block.level)}</strong>
                ${renderRoundBadge(block)}
                <span class="live-head-delta health-interval ${timingClass(block.intervalSeconds)}">${formatSeconds(block.intervalSeconds)}</span>
                <span class="live-head-attested">
                    <span class="live-head-power health-power ${status.className}">
                        <span class="live-head-power-full">${powerKnown ? `${formatCount(block.power)}<small>/${formatCount(block.committee)}</small>` : '--'}</span>
                        <span class="live-head-power-compact">${score === null ? '--' : `${formatPct(score)}%`}</span>
                    </span>
                    <span class="live-head-power-track ${status.className}" title="${escapeHtml(trackTitle)}" aria-label="${escapeHtml(trackTitle)}"><span class="live-head-power-fill" style="--live-head-margin:${status.marginRatio.toFixed(4)}"></span><span class="live-head-margin"><span class="live-head-margin-full">${marginFull}</span><span class="live-head-margin-compact">${marginCompact}</span></span></span>
                    ${activityStatus}
                </span>
                <span class="live-head-recency">
                    <button class="live-head-info" type="button" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}" aria-controls="live-head-inspector" aria-expanded="false"><span aria-hidden="true">i</span></button>
                    <span class="live-head-age" data-health-age="${escapeHtml(block.timestamp || '')}" data-health-age-format="ticker" data-magic="off">${escapeHtml(formatTickerAge(block.timestamp))}</span>
                </span>
            </span>
            <span class="live-head-row-detail">
                <span class="live-head-baker${producerHasAlias ? '' : ' is-address'}" title="${escapeHtml(producer.address || name)}"><span class="live-head-baker-name">${escapeHtml(name)}</span><span class="live-head-story-connector" aria-hidden="true"></span></span>
                ${details.html}
            </span>
        </div>
    `;
}

function renderLiveHeadRows(data) {
    const savedAddresses = savedMyTezosAddressSet();
    return visibleLiveHeadBlocks(data).map((block) => renderLiveHeadRow(
        block,
        heartbeatActivityCache.get(Number(block.level)) || null,
        { savedAddresses }
    )).join('');
}

function smoothlyShiftLiveHeadRows(stack, previousTops, { suppressMotion = false } = {}) {
    if (!previousTops?.size || !liveHeadMotionAllowed({ suppressMotion })) return;
    stack.querySelectorAll('.live-head-row[data-health-level]').forEach((row) => {
        const previousTop = previousTops.get(row.dataset.healthLevel);
        if (!Number.isFinite(previousTop)) return;
        const delta = previousTop - row.getBoundingClientRect().top;
        if (Math.abs(delta) < 0.5) return;
        row.dataset.liveHeadShift = 'settling';
        if (typeof row.animate === 'function') {
            row.getAnimations().filter((animation) => animation.id === 'live-head-shift').forEach((animation) => animation.cancel());
            const animation = row.animate([
                { transform: `translate3d(0, ${delta}px, 0)` },
                { transform: 'translate3d(0, 0, 0)' }
            ], {
                duration: 520,
                easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
                fill: 'both'
            });
            animation.id = 'live-head-shift';
            animation.finished.catch(() => {}).finally(() => {
                if (row.isConnected) delete row.dataset.liveHeadShift;
                animation.cancel();
            });
            return;
        }
        row.style.transition = 'none';
        row.style.transform = `translate3d(0, ${delta}px, 0)`;
        void row.offsetHeight;
        row.style.transition = 'transform 520ms cubic-bezier(0.22, 1, 0.36, 1), background 220ms ease';
        row.style.transform = 'translate3d(0, 0, 0)';
        window.setTimeout(() => {
            if (!row.isConnected) return;
            delete row.dataset.liveHeadShift;
            row.style.removeProperty('transition');
            row.style.removeProperty('transform');
        }, 560);
    });
}

function updateLiveHeadRows(stack, data, { suppressMotion = false } = {}) {
    const nextBlocks = visibleLiveHeadBlocks(data);
    const existingRows = [...stack.querySelectorAll('.live-head-row[data-health-level]')];
    const visibleExistingRows = existingRows.filter((row) => (
        !row.classList.contains('is-my-tezos-filtered-out') && row.getClientRects().length > 0
    ));
    const savedAddresses = savedMyTezosAddressSet();
    const existingLevels = new Set(existingRows.map((row) => row.dataset.healthLevel));
    const freshBlocks = nextBlocks.filter((block) => !existingLevels.has(String(Number(block.level) || 0)));
    const initialRows = existingRows.length === 0;
    const motionAllowed = freshBlocks.length && liveHeadMotionAllowed({ suppressMotion });
    const nextLevels = new Set(nextBlocks.map((block) => String(Number(block.level) || 0)));
    const previousTops = motionAllowed
        ? new Map(visibleExistingRows.map((row) => [row.dataset.healthLevel, row.getBoundingClientRect().top]))
        : null;
    const stackTop = motionAllowed ? stack.getBoundingClientRect().top : 0;
    const exitGhosts = motionAllowed && !liveHeadMyTezosOnly
        ? visibleExistingRows.filter((row) => !nextLevels.has(row.dataset.healthLevel)).map((row) => {
            const ghost = row.cloneNode(true);
            ghost.className = 'live-head-row-exiting';
            ghost.removeAttribute('data-health-level');
            ghost.removeAttribute('data-live-head-level');
            ghost.removeAttribute('data-quiet-key');
            ghost.removeAttribute('title');
            ghost.setAttribute('aria-hidden', 'true');
            ghost.setAttribute('tabindex', '-1');
            ghost.style.top = `${row.getBoundingClientRect().top - stackTop}px`;
            if ('disabled' in ghost) ghost.disabled = true;
            return ghost;
        })
        : [];

    if (initialRows) {
        quietlySyncHtml(stack, renderLiveHeadRows(data));
        delete stack.dataset.quietRefreshSettled;
    } else {
        const oldestExistingLevel = existingRows.length
            ? Math.min(...existingRows.map((row) => Number(row.dataset.healthLevel)).filter(Number.isFinite))
            : Infinity;
        const trailingFreshBlocks = freshBlocks.filter((block) => Number(block.level) < oldestExistingLevel);
        const leadingFreshBlocks = freshBlocks.filter((block) => Number(block.level) >= oldestExistingLevel);
        for (const block of [...leadingFreshBlocks].reverse()) {
            stack.insertAdjacentHTML('afterbegin', renderLiveHeadRow(
                block,
                heartbeatActivityCache.get(Number(block.level)) || null,
                { isNew: liveHeadMotionAllowed({ suppressMotion }), savedAddresses }
            ));
        }
        for (const block of trailingFreshBlocks) {
            stack.insertAdjacentHTML('beforeend', renderLiveHeadRow(
                block,
                heartbeatActivityCache.get(Number(block.level)) || null,
                { isNew: liveHeadMotionAllowed({ suppressMotion }), savedAddresses }
            ));
        }
        stack.querySelectorAll('.live-head-row.lb-row-new').forEach((row) => {
            window.setTimeout(() => row.classList.remove('lb-row-new'), 560);
        });

        stack.querySelectorAll('.live-head-row[data-health-level]').forEach((row) => {
            if (!nextLevels.has(row.dataset.healthLevel)) row.remove();
        });
        for (const block of nextBlocks) {
            const row = stack.querySelector(`.live-head-row[data-health-level="${Number(block.level) || 0}"]`);
            if (!row || freshBlocks.includes(block)) continue;
            quietlySyncElement(row, renderLiveHeadRow(
                block,
                heartbeatActivityCache.get(Number(block.level)) || null,
                { isNew: row.classList.contains('lb-row-new'), savedAddresses }
            ));
        }
        while (stack.querySelectorAll('.live-head-row[data-health-level]').length > nextBlocks.length) {
            stack.querySelector('.live-head-row[data-health-level]:last-child')?.remove();
        }
        exitGhosts.forEach((ghost) => {
            stack.append(ghost);
            window.setTimeout(() => ghost.remove(), 560);
        });
        if (freshBlocks.length) smoothlyShiftLiveHeadRows(stack, previousTops, { suppressMotion });
    }

    return { freshBlocks, initialRows };
}

function updateLiveHeadNext(latest, nextRight) {
    const next = document.getElementById('live-head-next');
    if (!next) return;
    const right = nextRight?.level === latest.level + 1 ? nextRight : null;
    const html = right
        ? `<span title="Round-zero right, not a guaranteed block producer. ${escapeHtml(right.baker?.address || '')}">Next R0 · ${escapeHtml(bakerName(right.baker))} · <span data-heartbeat-due="${escapeHtml(right.timestamp || '')}" data-magic="off">${escapeHtml(formatHeartbeatDue(right.timestamp))}</span></span>`
        : '<span>Next R0 syncing</span>';
    quietlySyncHtml(next, html);
}

function dispatchHotSignal(detail) {
    if (typeof window === 'undefined' || typeof window.CustomEvent !== 'function') return;
    window.dispatchEvent(new CustomEvent('hot-signal', { detail }));
}

function contestedRoundLastSignalAt() {
    const stored = Number(localStorage.getItem(CONTESTED_ROUND_SIGNAL_KEY));
    return Math.max(lastContestedRoundSignalAt, Number.isFinite(stored) ? stored : 0);
}

function dispatchContestedRoundHotSignal(block) {
    const round = Number(block?.blockRound);
    // R1 remains a block receipt, not news, and must not consume the alert cooldown.
    if (!Number.isFinite(round) || round < 2) return;
    const now = Date.now();
    if (now - contestedRoundLastSignalAt() < CONTESTED_ROUND_HOT_SIGNAL_COOLDOWN) return;
    lastContestedRoundSignalAt = now;
    try { localStorage.setItem(CONTESTED_ROUND_SIGNAL_KEY, String(now)); } catch { /* storage unavailable */ }
    const level = Number(block?.level);
    dispatchHotSignal({
        id: `contested-round-${Number.isFinite(level) ? level : now}`,
        category: 'security',
        kind: 'event',
        visual: 'consensus',
        spectacle: 'headliner',
        score: 98,
        title: 'Contested round',
        detail: `R${formatCount(round)}`,
        text: `Block ${Number.isFinite(level) ? formatCount(level) : 'head'} needed round ${formatCount(round)} - consensus recovered in seconds.`,
        route: '#health',
        createdAt: block?.timestamp ? new Date(block.timestamp).getTime() : now,
        ttlMs: CONTESTED_ROUND_HOT_SIGNAL_TTL
    });
}

function heartbeatSupplementIsCurrent(block) {
    const observed = new Date(block?.timestamp).getTime();
    return Number.isFinite(observed) && Date.now() - observed <= HEARTBEAT_SUPPLEMENT_MAX_AGE;
}

async function fetchHeartbeatNextRight(level) {
    if (!Number.isFinite(level) || level <= 0) return null;
    if (heartbeatNextRightCache?.level === level) return heartbeatNextRightCache;
    if (heartbeatNextRightInFlight?.level === level) return heartbeatNextRightInFlight.promise;

    const url = `${TZKT}/rights?type=baking&level=${level}&round=0&limit=1`;
    const promise = fetchJson(url, 1, { priority: 'interactive' })
        .then((rows) => {
            const row = Array.isArray(rows) ? rows[0] : null;
            const right = row ? {
                type: 'baking',
                level: Number(row.level) || level,
                timestamp: row.timestamp || null,
                round: Number(row.round) || 0,
                baker: row.baker || {}
            } : null;
            if (right && (!heartbeatNextRightCache || right.level >= heartbeatNextRightCache.level)) {
                heartbeatNextRightCache = right;
            }
            return right;
        })
        .catch((error) => {
            console.warn('Chain Heartbeat next R0 right failed:', error);
            return null;
        })
        .finally(() => {
            if (heartbeatNextRightInFlight?.promise === promise) heartbeatNextRightInFlight = null;
        });
    heartbeatNextRightInFlight = { level, promise };
    return promise;
}

function trimHeartbeatActivityCache() {
    while (heartbeatActivityCache.size > HEARTBEAT_ACTIVITY_CACHE_LIMIT) {
        heartbeatActivityCache.delete(heartbeatActivityCache.keys().next().value);
    }
}

function loadHeartbeatStoryCatalog() {
    if (heartbeatStoryCatalog) return Promise.resolve(heartbeatStoryCatalog);
    if (heartbeatStoryCatalogInFlight) return heartbeatStoryCatalogInFlight;
    heartbeatStoryCatalogInFlight = Promise.all([
        loadDataAsset('ecosystemApps').catch(() => ({})),
        loadDataAsset('maxisContracts').catch(() => ({})),
        loadDataAsset('protocolData').catch(() => null)
    ]).then(([ecosystem, maxis, protocolData]) => {
        heartbeatStoryCatalog = compileBlockStoryCatalog(ecosystem, maxis);
        heartbeatProtocolMilestones = protocolData
            ? new Map((Array.isArray(protocolData?.protocols) ? protocolData.protocols : [])
                .map((protocol) => [Number(protocol?.block), protocol])
                .filter(([level]) => Number.isFinite(level) && level > 0))
            : null;
        return heartbeatStoryCatalog;
    }).finally(() => {
        heartbeatStoryCatalogInFlight = null;
    });
    return heartbeatStoryCatalogInFlight;
}

function heartbeatL1VotingCoverageIncludes(coverage, startLevel, endLevel) {
    return coverage?.complete === true
        && startLevel >= Number(coverage.startLevel)
        && endLevel <= Number(coverage.endLevel);
}

async function fetchHeartbeatL1Voting(blocks) {
    const levels = (Array.isArray(blocks) ? blocks : [])
        .map((block) => Number(block?.level ?? block))
        .filter((level) => Number.isFinite(level) && level > 0);
    if (!levels.length) return null;
    const startLevel = Math.min(...levels);
    const endLevel = Math.max(...levels);
    if (heartbeatL1VotingCoverageIncludes(heartbeatL1VotingCoverage, startLevel, endLevel)
        && Date.now() - heartbeatL1VotingCoverage.updatedAt < HEARTBEAT_SUPPLEMENT_MAX_AGE) {
        return heartbeatL1VotingCoverage;
    }
    if (heartbeatL1VotingInFlight) {
        const active = heartbeatL1VotingInFlight;
        if (startLevel >= active.startLevel && endLevel <= active.endLevel) return active.promise;
        await active.promise;
        return fetchHeartbeatL1Voting(blocks);
    }

    const ballotFields = 'id,hash,level,timestamp,delegate,vote';
    const proposalFields = 'id,hash,level,timestamp,delegate';
    const query = `level.ge=${startLevel}&level.le=${endLevel}&status=applied&limit=${HEARTBEAT_L1_VOTING_LIMIT}`;
    const promise = Promise.allSettled([
        fetchJson(`${TZKT}/operations/ballots?${query}&select=${ballotFields}`, 1, { priority: 'interactive' }),
        fetchJson(`${TZKT}/operations/proposals?${query}&select=${proposalFields}`, 1, { priority: 'interactive' }),
        fetchJson(`${TZKT}/voting/periods?firstLevel.ge=${startLevel}&firstLevel.le=${endLevel}&select=index,firstLevel,kind&limit=${HEARTBEAT_L1_VOTING_LIMIT}`, 1, { priority: 'interactive' })
    ]).then(([ballotsResult, proposalsResult, periodsResult]) => {
        const ballots = ballotsResult.status === 'fulfilled' && Array.isArray(ballotsResult.value)
            ? ballotsResult.value
            : null;
        const proposals = proposalsResult.status === 'fulfilled' && Array.isArray(proposalsResult.value)
            ? proposalsResult.value
            : null;
        const periods = periodsResult.status === 'fulfilled' && Array.isArray(periodsResult.value)
            ? periodsResult.value
            : null;
        const complete = ballots !== null && proposals !== null && periods !== null;
        const byLevel = new Map(levels.map((level) => [level, []]));
        const periodsByLevel = new Map(levels.map((level) => [level, []]));
        if (complete) {
            for (const row of ballots) {
                const level = Number(row?.level);
                if (byLevel.has(level)) byLevel.get(level).push({ ...row, votingKind: 'ballot' });
            }
            for (const row of proposals) {
                const level = Number(row?.level);
                if (byLevel.has(level)) byLevel.get(level).push({ ...row, votingKind: 'proposal' });
            }
            for (const row of periods) {
                const level = Number(row?.firstLevel);
                if (periodsByLevel.has(level)) periodsByLevel.get(level).push(row);
            }
        }
        const coverage = {
            startLevel,
            endLevel,
            byLevel,
            periodsByLevel,
            complete,
            clipped: Boolean(
                (ballots && ballots.length >= HEARTBEAT_L1_VOTING_LIMIT)
                || (proposals && proposals.length >= HEARTBEAT_L1_VOTING_LIMIT)
                || (periods && periods.length >= HEARTBEAT_L1_VOTING_LIMIT)
            ),
            updatedAt: Date.now()
        };
        if (complete) heartbeatL1VotingCoverage = coverage;
        return coverage;
    }).finally(() => {
        if (heartbeatL1VotingInFlight?.promise === promise) heartbeatL1VotingInFlight = null;
    });
    heartbeatL1VotingInFlight = { startLevel, endLevel, promise };
    return promise;
}

function heartbeatMilestoneRows(block, l1VotingCoverage) {
    if (!block || block.cycleStartKnown !== true) return null;
    if (!heartbeatL1VotingCoverageIncludes(l1VotingCoverage, Number(block.level), Number(block.level))) return null;
    if (!(heartbeatProtocolMilestones instanceof Map)) return null;
    const rows = [];
    if (block.cycleStart === true) rows.push({ kind: 'cycle', cycle: Number(block.cycle) });
    const protocol = heartbeatProtocolMilestones.get(Number(block.level));
    if (protocol) rows.push({ kind: 'protocol', name: protocol.name, hash: protocol.hash });
    for (const period of l1VotingCoverage.periodsByLevel?.get(Number(block.level)) || []) {
        rows.push({ kind: 'voting', period: period.kind, index: period.index });
    }
    return rows;
}

function managerOperationKindIs(rows, kind) {
    return Array.isArray(rows) && rows.some((row) => String(row?.kind || '') === kind);
}

async function fetchHeartbeatActivity(level, { block = null, l1VotingCoverage = heartbeatL1VotingCoverage } = {}) {
    if (!Number.isFinite(level) || level <= 0) return null;
    const cached = heartbeatActivityCache.get(level);
    if (cached && (cached.complete || Date.now() - cached.updatedAt < LIVE_REFRESH_INTERVAL)) return cached;
    if (heartbeatActivityInFlight.has(level)) return heartbeatActivityInFlight.get(level);

    const txFields = 'id,hash,timestamp,amount,sender,target,parameter,internal';
    const stakingFields = 'id,hash,timestamp,action,amount,staker,baker';
    const tokenTransferFields = 'id,token.id as tokenId,token.contract as contract,token.standard as standard,token.metadata.symbol as symbol,token.metadata.name as name,token.metadata.artifactUri as artifactUri,from,to,amount,transactionId';
    const requests = [
        fetchJson(`${TZKT}/operations/transactions?level=${level}&status=applied&select=${txFields}&limit=${HEARTBEAT_ACTIVITY_LIMIT}`, 1, { priority: 'interactive' }),
        fetchJson(`${TZKT}/operations/staking?level=${level}&status=applied&select=${stakingFields}&limit=${HEARTBEAT_STAKING_LIMIT}`, 1, { priority: 'interactive' }),
        fetchHeartbeatGas(level),
        fetchJson(`${TZKT}/tokens/transfers?level=${level}&select=${encodeURIComponent(tokenTransferFields)}&limit=${HEARTBEAT_TOKEN_TRANSFER_LIMIT}`, 1, { priority: 'interactive' })
    ];
    const promise = Promise.all([loadHeartbeatStoryCatalog(), Promise.allSettled(requests)])
        .then(([catalog, [transactionsResult, stakingResult, gasResult, tokenTransfersResult]]) => {
            const transactions = transactionsResult.status === 'fulfilled' && Array.isArray(transactionsResult.value)
                ? transactionsResult.value
                : null;
            const stakingRows = stakingResult.status === 'fulfilled' && Array.isArray(stakingResult.value)
                ? stakingResult.value
                : null;
            const gas = gasResult.status === 'fulfilled' ? gasResult.value : null;
            const tokenTransfers = tokenTransfersResult.status === 'fulfilled' && Array.isArray(tokenTransfersResult.value)
                ? tokenTransfersResult.value
                : null;
            const managerOperations = Array.isArray(gas?.managerOperations) ? gas.managerOperations : null;
            const evidenceRows = Array.isArray(gas?.evidenceRows) ? gas.evidenceRows : null;
            const l1VotingRows = heartbeatL1VotingCoverageIncludes(l1VotingCoverage, level, level)
                ? (l1VotingCoverage.byLevel.get(level) || [])
                : null;
            const l2VotingRows = transactions?.filter(isEtherlinkGovernanceActivity) || null;
            const resolvedBlock = block
                || heartbeatData?.blocks?.find((row) => Number(row?.level) === level)
                || recentBlockSupplementBlocks.find((row) => Number(row?.level) === level)
                || null;
            const milestoneRows = heartbeatMilestoneRows(resolvedBlock, l1VotingCoverage);
            const largestTransfer = transactions?.reduce((largest, row) => (
                Number(row?.amount) > Number(largest?.amount || 0) ? row : largest
            ), null) || null;
            const transactionsClipped = Boolean(transactions && transactions.length >= HEARTBEAT_ACTIVITY_LIMIT);
            const stakingClipped = Boolean(stakingRows && stakingRows.length >= HEARTBEAT_STAKING_LIMIT);
            const tokenTransfersClipped = Boolean(tokenTransfers && tokenTransfers.length >= HEARTBEAT_TOKEN_TRANSFER_LIMIT);
            const l1VotingClipped = l1VotingCoverage?.clipped === true;
            const story = classifyBlockStory({
                transactions,
                stakingRows,
                l1VotingRows,
                l2VotingRows,
                tokenTransfers,
                managerOperations,
                evidenceRows,
                milestoneRows,
                delegationRows: [],
                originationRows: [],
                catalog,
                transactionsClipped,
                stakingClipped,
                l1VotingClipped,
                l2VotingClipped: transactionsClipped,
                tokenTransfersClipped,
                maxFragments: LIVE_HEAD_ACTIVITY_TYPES.length + 3
            });
            const activity = {
                level,
                txCount: transactions ? transactions.length : null,
                contractCalls: transactions ? transactions.filter((row) => row?.parameter != null).length : null,
                stakingCount: stakingRows ? stakingRows.length : null,
                stakingRows: stakingRows || [],
                tokenTransfers: tokenTransfers || [],
                largestTransfer,
                actorAddresses: collectHeartbeatActorAddresses(
                    transactions,
                    stakingRows,
                    tokenTransfers,
                    l1VotingRows,
                    managerOperations,
                    evidenceRows,
                    [],
                    []
                ),
                actorCoverageComplete: transactions !== null
                    && stakingRows !== null
                    && l1VotingRows !== null
                    && tokenTransfers !== null
                    && managerOperations !== null
                    && evidenceRows !== null
                    && !transactionsClipped
                    && !stakingClipped
                    && !tokenTransfersClipped
                    && !l1VotingClipped,
                gasUsed: Number.isFinite(gas?.gasUsed) ? gas.gasUsed : null,
                gasLimit: Number.isFinite(gas?.gasLimit) ? gas.gasLimit : null,
                story,
                complete: story?.complete === true && gas?.complete === true,
                updatedAt: Date.now()
            };
            heartbeatActivityCache.set(level, activity);
            trimHeartbeatActivityCache();

            const needsDelegationEnrichment = managerOperationKindIs(managerOperations, 'delegation');
            const needsOriginationEnrichment = managerOperationKindIs(managerOperations, 'origination');
            if ((needsDelegationEnrichment || needsOriginationEnrichment)
                && !heartbeatActivityEnrichmentInFlight.has(level)) {
                const enrichmentPromise = Promise.allSettled([
                    needsDelegationEnrichment
                        ? fetchJson(`${TZKT}/operations/delegations?level=${level}&status=applied&select=id,hash,timestamp,sender,prevDelegate,newDelegate&limit=${HEARTBEAT_MANAGER_ENRICHMENT_LIMIT}`, 1)
                        : Promise.resolve([]),
                    needsOriginationEnrichment
                        ? fetchJson(`${TZKT}/operations/originations?level=${level}&status=applied&select=id,hash,timestamp,sender,initiator,originatedContract&limit=${HEARTBEAT_MANAGER_ENRICHMENT_LIMIT}`, 1)
                        : Promise.resolve([])
                ]).then(([delegationResult, originationResult]) => {
                    if (heartbeatActivityCache.get(level) !== activity) return;
                    const delegationRows = delegationResult.status === 'fulfilled' && Array.isArray(delegationResult.value)
                        ? delegationResult.value
                        : [];
                    const originationRows = originationResult.status === 'fulfilled' && Array.isArray(originationResult.value)
                        ? originationResult.value
                        : [];
                    if (!delegationRows.length && !originationRows.length) return;
                    const enrichedStory = classifyBlockStory({
                        transactions,
                        stakingRows,
                        l1VotingRows,
                        l2VotingRows,
                        tokenTransfers,
                        managerOperations,
                        evidenceRows,
                        milestoneRows,
                        delegationRows,
                        originationRows,
                        catalog,
                        transactionsClipped,
                        stakingClipped,
                        l1VotingClipped,
                        l2VotingClipped: transactionsClipped,
                        tokenTransfersClipped,
                        maxFragments: LIVE_HEAD_ACTIVITY_TYPES.length + 3
                    });
                    const enrichedActivity = {
                        ...activity,
                        actorAddresses: collectHeartbeatActorAddresses(
                            transactions,
                            stakingRows,
                            tokenTransfers,
                            l1VotingRows,
                            managerOperations,
                            evidenceRows,
                            delegationRows,
                            originationRows
                        ),
                        story: enrichedStory,
                        complete: enrichedStory?.complete === true && gas?.complete === true
                    };
                    heartbeatActivityCache.set(level, enrichedActivity);
                    if (heartbeatData?.blocks?.some((row) => Number(row?.level) === level)) {
                        updateBlockTicker(heartbeatData, { supplemental: true });
                    }
                    const recentBlock = recentBlockSupplementBlocks.find((row) => Number(row?.level) === level);
                    if (recentBlock) updateRecentBlockReceipt(recentBlock);
                }).finally(() => {
                    if (heartbeatActivityEnrichmentInFlight.get(level) === enrichmentPromise) {
                        heartbeatActivityEnrichmentInFlight.delete(level);
                    }
                });
                heartbeatActivityEnrichmentInFlight.set(level, enrichmentPromise);
            }
            return activity;
        })
        .finally(() => {
            if (heartbeatActivityInFlight.get(level) === promise) heartbeatActivityInFlight.delete(level);
        });
    heartbeatActivityInFlight.set(level, promise);
    return promise;
}

function consumedMilligas(result) {
    const milligas = Number(result?.consumed_milligas);
    if (Number.isFinite(milligas) && milligas >= 0) return milligas;
    const gas = Number(result?.consumed_gas);
    return Number.isFinite(gas) && gas >= 0 ? gas * 1000 : 0;
}

function sumManagerOperationMilligas(groups) {
    let total = 0;
    for (const group of Array.isArray(groups) ? groups : []) {
        for (const content of Array.isArray(group?.contents) ? group.contents : []) {
            total += consumedMilligas(content?.metadata?.operation_result);
            for (const internal of Array.isArray(content?.metadata?.internal_operation_results)
                ? content.metadata.internal_operation_results
                : []) {
                total += consumedMilligas(internal?.result);
            }
        }
    }
    return total;
}

function operationResultIsApplied(result) {
    const status = String(result?.status || 'applied').toLowerCase();
    return status === 'applied';
}

function flattenAppliedManagerOperations(groups) {
    const operations = [];
    for (const group of Array.isArray(groups) ? groups : []) {
        for (const content of Array.isArray(group?.contents) ? group.contents : []) {
            const result = content?.metadata?.operation_result;
            if (operationResultIsApplied(result)) {
                operations.push({
                    ...content,
                    applied: true,
                    operationHash: group?.hash || '',
                    slotIndex: content?.slot_header?.index ?? result?.slot_header?.index ?? null
                });
            }
            for (const internal of Array.isArray(content?.metadata?.internal_operation_results)
                ? content.metadata.internal_operation_results
                : []) {
                if (!operationResultIsApplied(internal?.result)) continue;
                operations.push({
                    ...internal,
                    applied: true,
                    internal: true,
                    operationHash: group?.hash || '',
                    parentKind: content?.kind || '',
                    slotIndex: internal?.slot_header?.index ?? internal?.result?.slot_header?.index ?? null
                });
            }
        }
    }
    return operations;
}

function flattenAppliedEvidenceOperations(groups) {
    const operations = [];
    for (const group of Array.isArray(groups) ? groups : []) {
        for (const content of Array.isArray(group?.contents) ? group.contents : []) {
            if (!operationResultIsApplied(content?.metadata?.operation_result)) continue;
            operations.push({ ...content, applied: true, operationHash: group?.hash || '' });
        }
    }
    return operations;
}

async function fetchHeartbeatGasLimit() {
    if (Number.isFinite(heartbeatGasLimitCache)
        && Date.now() - heartbeatGasLimitCacheAt < PROTOCOL_CONSTANTS_TTL) {
        return heartbeatGasLimitCache;
    }
    if (heartbeatGasLimitInFlight) return heartbeatGasLimitInFlight;
    const promise = fetchJson(`${API_URLS.octez}/chains/main/blocks/head/context/constants`, 1, { priority: 'interactive' })
        .then((constants) => {
            const limit = Number(constants?.hard_gas_limit_per_block);
            if (!Number.isFinite(limit) || limit <= 0) throw new Error('Current block gas limit is unavailable');
            heartbeatGasLimitCache = limit;
            heartbeatGasLimitCacheAt = Date.now();
            return limit;
        })
        .finally(() => {
            if (heartbeatGasLimitInFlight === promise) heartbeatGasLimitInFlight = null;
        });
    heartbeatGasLimitInFlight = promise;
    return promise;
}

async function fetchHeartbeatGas(level) {
    const [managerResult, evidenceResult, gasLimitResult] = await Promise.allSettled([
        fetchJson(`${API_URLS.octez}/chains/main/blocks/${encodeURIComponent(level)}/operations/3`, 1, { priority: 'interactive' }),
        fetchJson(`${API_URLS.octez}/chains/main/blocks/${encodeURIComponent(level)}/operations/2`, 1, { priority: 'interactive' }),
        fetchHeartbeatGasLimit()
    ]);
    const groups = managerResult.status === 'fulfilled' && Array.isArray(managerResult.value)
        ? managerResult.value
        : null;
    const evidenceGroups = evidenceResult.status === 'fulfilled' && Array.isArray(evidenceResult.value)
        ? evidenceResult.value
        : null;
    const gasLimit = gasLimitResult.status === 'fulfilled' && Number.isFinite(Number(gasLimitResult.value))
        ? Number(gasLimitResult.value)
        : null;
    return {
        gasUsed: groups ? sumManagerOperationMilligas(groups) / 1000 : null,
        gasLimit,
        managerOperations: groups ? flattenAppliedManagerOperations(groups) : null,
        evidenceRows: evidenceGroups ? flattenAppliedEvidenceOperations(evidenceGroups) : null,
        complete: groups !== null && evidenceGroups !== null && gasLimit !== null
    };
}

async function fetchHeartbeatMissedRights(blocks) {
    const levels = (Array.isArray(blocks) ? blocks : []).map((block) => Number(block.level)).filter(Number.isFinite);
    if (!levels.length) return null;
    const startLevel = Math.min(...levels);
    const endLevel = Math.max(...levels);
    const limit = Math.max(MISSED_RIGHTS_LIMIT, levels.length * 40);
    if (heartbeatMissedRightsCache?.startLevel === startLevel
        && heartbeatMissedRightsCache?.endLevel === endLevel
        && Date.now() - heartbeatMissedRightsCache.updatedAt < LIVE_REFRESH_INTERVAL) {
        return heartbeatMissedRightsCache;
    }
    if (heartbeatMissedRightsInFlight?.startLevel === startLevel && heartbeatMissedRightsInFlight?.endLevel === endLevel) {
        return heartbeatMissedRightsInFlight.promise;
    }
    const promise = fetchMissedRights('attestation', startLevel, endLevel, limit, { priority: 'interactive' }).then((attestations) => {
        heartbeatMissedRightsCache = {
            startLevel,
            endLevel,
            attestations,
            sampleClipped: attestations.length >= limit,
            updatedAt: Date.now()
        };
        heartbeatMissedRightsFailureRange = null;
        return heartbeatMissedRightsCache;
    }).catch((error) => {
        console.warn('Live Head missed-right sample failed:', error);
        heartbeatMissedRightsFailureRange = { startLevel, endLevel, updatedAt: Date.now() };
        return heartbeatMissedRightsCache;
    }).finally(() => {
        if (heartbeatMissedRightsInFlight?.promise === promise) heartbeatMissedRightsInFlight = null;
    });
    heartbeatMissedRightsInFlight = { startLevel, endLevel, promise };
    return promise;
}

function requestHeartbeatSupplements(data) {
    const latest = data?.blocks?.[0];
    if (!latest || !heartbeatSupplementIsCurrent(latest) || document.visibilityState !== 'visible') return;
    const level = Number(latest.level);
    const refreshIfCurrent = () => {
        if (document.visibilityState === 'visible' && Number(heartbeatData?.blocks?.[0]?.level) === level) {
            updateBlockTicker(heartbeatData, { supplemental: true });
        }
    };
    fetchHeartbeatNextRight(level + 1).then(refreshIfCurrent);
    const visible = visibleLiveHeadBlocks(data);
    Promise.allSettled([
        fetchHeartbeatBakingMisses(visible),
        fetchHeartbeatL1Voting(visible).then((l1VotingCoverage) => Promise.allSettled(
            visible.map((block) => fetchHeartbeatActivity(Number(block.level), { block, l1VotingCoverage }))
        )),
        fetchHeartbeatMissedRights(data.chainHealthBlocks || data.blocks)
    ]).then(refreshIfCurrent);
}

function updateBlockTicker(data, { error = false, supplemental = false, suppressMotion = false } = {}) {
    const panel = document.getElementById('live-head');
    const button = document.getElementById('live-head-button');
    const stack = document.getElementById('live-head-stack');
    const activityButton = document.getElementById('header-activity-button');
    if (!panel || !button || !stack || !activityButton) return;
    wireLiveHeadDepthControls();
    wireLiveHeadPillFitting(panel);
    wireLiveHeadActivityFilter(panel);
    wireLiveHeadInspector(panel, stack);

    if (!button.dataset.liveHeadWired) {
        button.dataset.liveHeadWired = '1';
        button.addEventListener('click', openNetworkHealthChamber);
    }
    if (!activityButton.dataset.headerActivityWired) {
        activityButton.dataset.headerActivityWired = '1';
        activityButton.addEventListener('click', openNetworkHealthChamber);
    }
    updateHeaderActivity(usagePulseCache);

    if (liveHeadReadingPaused()) {
        queueLiveHeadPausedUpdate(data, { error, supplemental });
        return;
    }

    const latest = data?.blocks?.[0] || null;
    updateLiveHeadStallAlert(data, { error });
    if (!latest) {
        updateChainHealthStrip(data, { error, suppressMotion: true });
        blockTickerFallback(error ? 'degraded' : 'loading');
        return;
    }
    heartbeatData = data;
    const motionSuppressed = Boolean(suppressMotion || (suppressNextHeartbeatMotion && !supplemental));
    if (!supplemental) suppressNextHeartbeatMotion = false;
    updateChainHealthStrip(data, { error, supplemental, suppressMotion: motionSuppressed || !heartbeatSupplementIsCurrent(latest) });

    dispatchContestedRoundHotSignal(latest);
    if (!supplemental) fetchUsagePulse({ priority: 'interactive' }).then(patchTickerUsage);

    const status = latestBlockStatus(latest);
    const producerName = bakerName(latest.producer);
    const nextRight = heartbeatNextRightCache?.level === latest.level + 1 ? heartbeatNextRightCache : null;
    updateLiveHeadNext(latest, nextRight);
    const visible = visibleLiveHeadBlocks(data);
    const signature = [
        `depth:${liveHeadBlockLimit()}`,
        ...visible.map((block) => {
            const activity = heartbeatActivityCache.get(Number(block.level)) || null;
            return `${block.level}:${block.intervalSeconds ?? 'unknown'}:${block.blockRound}:${block.power ?? 'unknown'}:${block.committee ?? 'unknown'}:${block.producer?.address || ''}:${buildLiveHeadDetails(block, activity).signature}:${liveHeadGasState(activity).signature}`;
        }),
        nextRight?.baker?.address || '',
        nextRight?.timestamp || ''
    ].join(':');
    const nextTitle = nextRight
        ? ` Next round-zero proposer for block ${formatCount(nextRight.level)}: ${bakerName(nextRight.baker)}, ${formatHeartbeatDue(nextRight.timestamp)}.`
        : ' Next round-zero proposer is syncing.';
    const receiptTitle = `Recent Tezos blocks, newest first. Head ${formatCount(latest.level)} landed from ${producerName}. ${status.label}: ${formatCount(latest.power)} / ${formatCount(latest.committee)} attested, round ${formatCount(latest.blockRound)}.${nextTitle}`;
    const title = error ? `Live source delayed; showing the last good receipt. ${receiptTitle}` : receiptTitle;

    panel.dataset.blockHealth = status.className;
    panel.dataset.feedState = error ? 'stale' : 'live';
    panel.setAttribute('aria-busy', 'false');
    button.title = title;
    button.setAttribute('aria-label', `Open Network Health Chamber. ${title}`);

    if (stack.dataset.liveHeadSignature === signature) {
        syncLiveHeadMyTezosRows();
        refreshHealthAgeLabels(panel);
        if (!supplemental && !error) requestHeartbeatSupplements(data);
        return;
    }

    const previousSignature = stack.dataset.liveHeadSignature || '';
    const previousLevel = Number(panel.dataset.heartbeatLevel) || 0;
    const headChanged = Boolean(previousLevel && previousLevel !== latest.level);
    stack.dataset.liveHeadSignature = signature;
    panel.dataset.heartbeatLevel = String(latest.level);
    const arrivedRecently = heartbeatSupplementIsCurrent(latest);
    const settleWithoutMotion = motionSuppressed || !arrivedRecently;
    const { freshBlocks } = updateLiveHeadRows(stack, data, { suppressMotion: settleWithoutMotion });
    syncLiveHeadMyTezosRows();
    fitLiveHeadPills(panel);
    revealLiveHeadFacts(panel, { suppressMotion: settleWithoutMotion });
    refreshLiveHeadInspector();
    if (headChanged) {
        panel.dataset.liveHeadTransitionCount = String(Number(panel.dataset.liveHeadTransitionCount || 0) + 1);
        const announcer = document.getElementById('chain-heartbeat-announcer');
        if (announcer) {
            announcer.textContent = `Block ${formatCount(latest.level)} landed from ${producerName}, round ${formatCount(latest.blockRound)}, ${formatCount(latest.power)} of ${formatCount(latest.committee)} attested.`;
        }
    } else if (!previousSignature) {
        panel.dataset.liveHeadTransitionCount = '0';
    }
    if (!supplemental && !error) requestHeartbeatSupplements(data);
}

function wireCycleChipHealthLauncher() {
    const chip = document.getElementById('cycle-chip');
    if (!chip || chip.dataset.healthChamberWired) return;

    chip.dataset.healthChamberWired = '1';
    chip.addEventListener('click', (event) => {
        event.preventDefault();
        openNetworkHealthChamber();
    });
}

function bakerLinks(address, name) {
    const label = name || shortAddress(address);
    if (!address) return `<span class="lb-baker-name">${escapeHtml(label)}</span>`;
    const encoded = encodeURIComponent(address);
    return `
        <span class="lb-baker-link-wrap" title="${escapeHtml(address)}">
            <a class="lb-baker-name-link health-baker-name-link" href="#baker=${encoded}" title="Open Tezos.Systems baker profile">${escapeHtml(label)}</a>
            <a class="lb-baker-source-link" href="https://tzkt.io/${encoded}" target="_blank" rel="noopener" title="Open baker on TzKT">TzKT</a>
        </span>
    `;
}

function getSavedMyBakerAddress() {
    try {
        return localStorage.getItem(MY_BAKER_STORAGE_KEY) || '';
    } catch {
        return '';
    }
}

function bakerAddressMatches(baker, address) {
    return Boolean(address && baker?.address === address);
}

function findBakerDisplayName(data, address) {
    if (!address) return '';
    const blockBaker = data.blocks.find((block) => bakerAddressMatches(block.producer, address))?.producer;
    if (blockBaker) return bakerName(blockBaker);
    const missedBlockBaker = data.missedBlocks.find((right) => bakerAddressMatches(right.baker, address))?.baker;
    if (missedBlockBaker) return bakerName(missedBlockBaker);
    const missedAttester = data.missedAttesters.find((item) => item.address === address);
    return missedAttester?.name || shortAddress(address);
}

function summarizeMyTezosBaker(data) {
    const address = getSavedMyBakerAddress();
    if (!address) return null;

    const missedAttestations = data.missedAttestations.filter((right) => bakerAddressMatches(right.baker, address));
    const missedBlocks = data.missedBlocks.filter((right) => bakerAddressMatches(right.baker, address));
    const latestBlock = data.blocks.find((block) => bakerAddressMatches(block.producer, address)) || null;
    const missedSlots = missedAttestations.reduce((sum, right) => sum + right.slots, 0);

    let label = 'Clear in sample';
    let className = 'healthy';
    let copy = latestBlock
        ? `Produced block ${formatCount(latestBlock.level)} ${formatAge(latestBlock.timestamp)} with no missed rights in this sample.`
        : 'No missed rights in this sample; not among the most recent block producers.';

    if (missedBlocks.length) {
        label = 'Missed block';
        className = 'degraded';
        copy = `${formatCount(missedBlocks.length)} missed baking right in the recent lookback.`;
    } else if (missedSlots) {
        label = 'Missed attestations';
        className = 'watch';
        copy = `${formatCount(missedSlots)} attestation power missed in the current block sample.`;
    }

    return {
        address,
        name: findBakerDisplayName(data, address),
        missedSlots,
        missedBlockCount: missedBlocks.length,
        latestBlock,
        label,
        className,
        copy
    };
}

async function fetchJson(url, retries = 2, { priority = 'normal' } = {}) {
    return fetchWithRetry(url, {
        cache: 'no-store',
        memoryCache: false,
        ...(priority === 'interactive' ? { __tezosSystemsPriority: 'interactive' } : {})
    }, retries + 1);
}

function nakamotoLiveFallback(error = '') {
    return {
        available: false,
        stale: false,
        status: 'unavailable',
        error,
        observedAt: null,
        sourceUrl: `${OCTEZ_MAINNET}${NAKAMOTO_RPC_PATH}`,
        poweredDelegates: 0,
        totalPower: '0',
        thresholds: {
            oneThird: null,
            twoThirds: null
        }
    };
}

function calculateNakamotoThreshold(powers, totalPower, numerator, denominator) {
    const sorted = [...powers].sort((a, b) => (a === b ? 0 : a > b ? -1 : 1));
    let cumulativePower = 0n;
    let count = 0;
    for (const power of sorted) {
        cumulativePower += power;
        count += 1;
        if (cumulativePower * BigInt(denominator) > totalPower * BigInt(numerator)) break;
    }
    if (!count || cumulativePower * BigInt(denominator) <= totalPower * BigInt(numerator)) return null;
    return {
        count,
        cumulativePower: cumulativePower.toString(),
        cumulativeShare: Number((cumulativePower * 10000n) / totalPower) / 100,
        numerator,
        denominator
    };
}

function buildNakamotoCoefficients(payload) {
    if (!Array.isArray(payload) || payload.length < 2 || !/^\d+$/.test(String(payload[0]))) {
        throw new Error('Unexpected current-cycle baking power response');
    }
    const totalPower = BigInt(payload[0]);
    if (totalPower <= 0n || !Array.isArray(payload[1])) {
        throw new Error('Current-cycle baking power is empty');
    }

    const powerByDelegate = new Map();
    for (const row of payload[1]) {
        const identity = Array.isArray(row) ? row[0] : null;
        const rawPower = Array.isArray(row) ? row[1] : null;
        const delegate = String(identity?.delegate || '');
        if (!delegate || !/^\d+$/.test(String(rawPower))) continue;
        const power = BigInt(rawPower);
        if (power <= 0n) continue;
        powerByDelegate.set(delegate, (powerByDelegate.get(delegate) || 0n) + power);
    }
    const powers = [...powerByDelegate.values()];
    if (!powers.length) throw new Error('No powered delegates were returned');
    return {
        available: true,
        stale: false,
        status: 'live',
        error: '',
        observedAt: new Date().toISOString(),
        sourceUrl: `${OCTEZ_MAINNET}${NAKAMOTO_RPC_PATH}`,
        poweredDelegates: powers.length,
        totalPower: totalPower.toString(),
        powerByDelegate: Object.fromEntries(
            [...powerByDelegate.entries()].map(([delegate, power]) => [delegate, power.toString()])
        ),
        thresholds: {
            oneThird: calculateNakamotoThreshold(powers, totalPower, 1, 3),
            twoThirds: calculateNakamotoThreshold(powers, totalPower, 2, 3)
        }
    };
}

async function fetchNakamotoSources({ force = false } = {}) {
    if (!force && nakamotoSourcesCache && Date.now() - nakamotoSourcesCacheAt < NAKAMOTO_SOURCES_TTL) {
        return nakamotoSourcesCache;
    }
    if (nakamotoSourcesInFlight) return nakamotoSourcesInFlight;

    nakamotoSourcesInFlight = fetchJson(NAKAMOTO_SOURCES_URL, 1)
        .then((artifact) => {
            if (artifact?.schemaVersion !== 1 || !Array.isArray(artifact.sources)) {
                throw new Error('Unexpected Nakamoto source artifact');
            }
            nakamotoSourcesCache = artifact;
            nakamotoSourcesCacheAt = Date.now();
            return artifact;
        })
        .catch((error) => {
            console.warn('Network Health Nakamoto source ledger failed:', error);
            return nakamotoSourcesCache || { schemaVersion: 1, updatedAt: null, sources: [], error: error?.message || 'Source ledger unavailable' };
        })
        .finally(() => {
            nakamotoSourcesInFlight = null;
        });

    return nakamotoSourcesInFlight;
}

export async function fetchNakamotoCoefficients({ force = false } = {}) {
    if (!force && nakamotoCache && Date.now() - nakamotoCacheAt < NAKAMOTO_TTL) {
        return nakamotoCache;
    }
    if (nakamotoInFlight) return nakamotoInFlight;

    nakamotoInFlight = (async () => {
        const [live, sourceArtifact] = await Promise.all([
            fetchJson(`${OCTEZ_MAINNET}${NAKAMOTO_RPC_PATH}`, 1)
                .then(buildNakamotoCoefficients)
                .catch((error) => {
                    console.warn('Network Health Nakamoto calculation failed:', error);
                    return nakamotoCache?.live?.available
                        ? {
                            ...nakamotoCache.live,
                            stale: true,
                            status: 'stale',
                            error: error?.message || 'Current-cycle RPC unavailable'
                        }
                        : nakamotoLiveFallback(error?.message || 'Current-cycle RPC unavailable');
                }),
            fetchNakamotoSources({ force })
        ]);
        nakamotoCache = {
            live,
            sourcesUpdatedAt: sourceArtifact.updatedAt || null,
            sources: sourceArtifact.sources || [],
            sourcesError: sourceArtifact.error || ''
        };
        nakamotoCacheAt = Date.now();
        return nakamotoCache;
    })().finally(() => {
        nakamotoInFlight = null;
    });

    return nakamotoInFlight;
}

function formatMilliseconds(value) {
    if (!Number.isFinite(value)) return '--';
    return formatSeconds(value / 1000);
}

function teztaleUrl(path) {
    const base = String(TEZTALE || '').replace(/\/+$/, '');
    const cleanPath = String(path || '').replace(/^\/+/, '');
    return `${base}/${cleanPath}`;
}

async function fetchTeztaleJson(path, retries = 1) {
    if (!TEZTALE) throw new Error('Teztale endpoint is not configured');
    return fetchJson(teztaleUrl(path), retries);
}

function timestampMs(value) {
    const ms = new Date(value || '').getTime();
    return Number.isFinite(ms) ? ms : null;
}

function minFinite(values) {
    const finite = values.filter(Number.isFinite);
    return finite.length ? Math.min(...finite) : null;
}

function averageFinite(values) {
    const finite = values.filter(Number.isFinite);
    return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null;
}

function averageTeztaleGap(rows, endKey, startKey) {
    return averageFinite(rows.map((row) => {
        const end = Number(row?.[endKey]);
        const start = Number(row?.[startKey]);
        return Number.isFinite(end) && Number.isFinite(start) && end >= start ? end - start : null;
    }));
}

function teztaleReceptionMs(operation) {
    return minFinite((operation?.received_in_mempools || [])
        .map((item) => timestampMs(item.reception_time))
        .filter(Number.isFinite));
}

function teztaleBlockDelayMs(block, key) {
    const timestamp = timestampMs(block?.timestamp);
    if (timestamp === null) return null;
    const observed = minFinite((block?.reception_times || [])
        .map((item) => timestampMs(item[key]))
        .filter(Number.isFinite));
    return observed === null ? null : observed - timestamp;
}

function teztalePowerByDelegate(data) {
    const powers = new Map();
    (data?.endorsements || []).forEach((item) => {
        if (!item?.delegate) return;
        powers.set(item.delegate, Math.max(1, Number(item.endorsing_power) || 1));
    });
    return powers;
}

function teztaleSourceCount(data) {
    const sources = new Set();
    (data?.blocks || []).forEach((block) => {
        (block.reception_times || []).forEach((item) => {
            if (item?.source) sources.add(item.source);
        });
    });
    (data?.endorsements || []).forEach((endorsement) => {
        (endorsement.operations || []).forEach((operation) => {
            (operation.received_in_mempools || []).forEach((item) => {
                if (item?.source) sources.add(item.source);
            });
        });
    });
    return sources.size;
}

function teztaleUniqueReceptionEntries(entries) {
    const earliestByDelegate = new Map();
    entries.forEach((entry) => {
        if (!entry?.delegate || !Number.isFinite(entry.delayMs) || entry.delayMs < 0) return;
        const previous = earliestByDelegate.get(entry.delegate);
        if (!previous || entry.delayMs < previous.delayMs) earliestByDelegate.set(entry.delegate, entry);
    });
    return [...earliestByDelegate.values()];
}

function teztaleThresholdDelayMs(entries, powers, threshold) {
    const totalPower = [...powers.values()].reduce((sum, value) => sum + value, 0);
    if (!totalPower) return null;
    const target = totalPower * threshold;
    const sorted = teztaleUniqueReceptionEntries(entries)
        .sort((a, b) => a.delayMs - b.delayMs);
    let observedPower = 0;
    for (const entry of sorted) {
        observedPower += powers.get(entry.delegate) || 1;
        if (observedPower >= target) return entry.delayMs;
    }
    return null;
}

function emptyTeztaleRound(level, round, block, sourceCount, powers) {
    const totalPower = [...powers.values()].reduce((sum, value) => sum + value, 0);
    return {
        level,
        round,
        blockHash: block?.hash || '',
        baker: block?.delegate || '',
        timestamp: block?.timestamp || null,
        validationDelayMs: teztaleBlockDelayMs(block, 'validation'),
        applicationDelayMs: teztaleBlockDelayMs(block, 'application'),
        sourceCount,
        missingBlocks: 0,
        validOps: 0,
        lostOps: 0,
        heldOps: 0,
        erroneousOps: 0,
        silentDelegates: 0,
        delegateCount: powers.size,
        totalPower,
        preattestations: [],
        attestations: [],
        powers
    };
}

function summarizeTeztaleLevel(item) {
    const level = Number(item?.level) || 0;
    const data = item?.data || {};
    const powers = teztalePowerByDelegate(data);
    const sourceCount = teztaleSourceCount(data);
    const byRound = new Map();
    const ensureRound = (round, block = null) => {
        const key = Number.isFinite(Number(round)) ? Number(round) : 0;
        if (!byRound.has(key)) {
            byRound.set(key, emptyTeztaleRound(level, key, block, sourceCount, powers));
        } else if (block) {
            const row = byRound.get(key);
            row.blockHash = block.hash || row.blockHash;
            row.baker = block.delegate || row.baker;
            row.timestamp = block.timestamp || row.timestamp;
            row.validationDelayMs = teztaleBlockDelayMs(block, 'validation');
            row.applicationDelayMs = teztaleBlockDelayMs(block, 'application');
        }
        return byRound.get(key);
    };

    (data.blocks || []).forEach((block) => ensureRound(numericRound(block.round), block));
    if (!byRound.size) ensureRound(0, null);

    (data.missing_blocks || []).forEach((missing) => {
        const row = ensureRound(missing?.baking_right?.round || 0);
        row.missingBlocks += 1;
        if (!row.baker && missing?.baking_right?.delegate) row.baker = missing.baking_right.delegate;
    });

    (data.endorsements || []).forEach((endorsement) => {
        const operations = endorsement.operations || [];
        if (!operations.length) {
            ensureRound(0).silentDelegates += 1;
            return;
        }

        operations.forEach((operation) => {
            const row = ensureRound(operation.round || 0);
            const receptionMs = teztaleReceptionMs(operation);
            const blockTimestampMs = timestampMs(row.timestamp);
            const delayMs = receptionMs !== null && blockTimestampMs !== null
                ? receptionMs - blockTimestampMs
                : null;
            const entry = {
                delegate: endorsement.delegate,
                delayMs,
                power: Math.max(1, Number(endorsement.endorsing_power) || row.powers.get(endorsement.delegate) || 1)
            };
            const hasErrors = (operation.received_in_mempools || []).some((item) => Boolean(item.errors));
            const included = (operation.included_in_blocks || []).length > 0;

            if (operation.kind === 'Preendorsement') {
                row.preattestations.push(entry);
            } else {
                row.attestations.push(entry);
            }

            if (hasErrors) row.erroneousOps += 1;
            if (receptionMs === null && included) {
                row.heldOps += 1;
            } else if (receptionMs !== null && !included && operation.kind !== 'Preendorsement') {
                row.lostOps += 1;
            } else {
                row.validOps += 1;
            }
        });
    });

    return [...byRound.values()].map((row) => {
        const preQuorumMs = teztaleThresholdDelayMs(row.preattestations, row.powers, TEZTALE_QUORUM_TARGET);
        const quorumMs = teztaleThresholdDelayMs(row.attestations, row.powers, TEZTALE_QUORUM_TARGET);
        const preattestationCount = row.preattestations.length;
        const attestationCount = row.attestations.length;
        return {
            ...row,
            preattestationCount,
            attestationCount,
            complete: Number.isFinite(quorumMs) && attestationCount > 0,
            preQuorumMs,
            quorumMs,
            pre90Ms: teztaleThresholdDelayMs(row.preattestations, row.powers, 0.9),
            quorum90Ms: teztaleThresholdDelayMs(row.attestations, row.powers, 0.9),
            propagationSamples: {
                preattestations: teztaleUniqueReceptionEntries(row.preattestations)
                    .map(({ delayMs, power }) => ({ delayMs, power })),
                attestations: teztaleUniqueReceptionEntries(row.attestations)
                    .map(({ delayMs, power }) => ({ delayMs, power }))
            },
            powers: undefined,
            preattestations: undefined,
            attestations: undefined
        };
    });
}

function buildTeztaleReceptionHistogram(rows) {
    const preattestations = rows.flatMap((row) => row.propagationSamples?.preattestations || []);
    const attestations = rows.flatMap((row) => row.propagationSamples?.attestations || []);
    const allSamples = [...preattestations, ...attestations];
    if (!allSamples.length) {
        return {
            binMs: TEZTALE_RECEPTION_BIN_MS,
            maxMs: TEZTALE_RECEPTION_MIN_WINDOW_MS,
            maxPower: 0,
            preattestationPower: 0,
            attestationPower: 0,
            bins: []
        };
    }

    const observedMaxMs = Math.max(...allSamples.map((sample) => sample.delayMs));
    const maxMs = Math.max(
        TEZTALE_RECEPTION_MIN_WINDOW_MS,
        Math.min(
            TEZTALE_RECEPTION_MAX_WINDOW_MS,
            Math.ceil(observedMaxMs / 1000) * 1000
        )
    );
    const binCount = Math.max(1, Math.ceil(maxMs / TEZTALE_RECEPTION_BIN_MS));
    const bins = Array.from({ length: binCount }, (_, index) => ({
        startMs: index * TEZTALE_RECEPTION_BIN_MS,
        endMs: (index + 1) * TEZTALE_RECEPTION_BIN_MS,
        overflow: index === binCount - 1,
        preattestationPower: 0,
        attestationPower: 0
    }));
    const addSamples = (samples, key) => {
        samples.forEach((sample) => {
            const index = Math.min(binCount - 1, Math.max(0, Math.floor(sample.delayMs / TEZTALE_RECEPTION_BIN_MS)));
            bins[index][key] += Math.max(1, Number(sample.power) || 1);
        });
    };
    addSamples(preattestations, 'preattestationPower');
    addSamples(attestations, 'attestationPower');

    return {
        binMs: TEZTALE_RECEPTION_BIN_MS,
        maxMs,
        maxPower: Math.max(...bins.flatMap((bin) => [bin.preattestationPower, bin.attestationPower]), 0),
        preattestationPower: preattestations.reduce((sum, sample) => sum + Math.max(1, Number(sample.power) || 1), 0),
        attestationPower: attestations.reduce((sum, sample) => sum + Math.max(1, Number(sample.power) || 1), 0),
        bins
    };
}

function teztaleFallback(error = '') {
    return {
        available: false,
        label: 'Unavailable',
        className: 'unknown',
        error,
        sourceUrl: TEZTALE_REPORT_URL,
        creditUrl: TEZTALE_SOURCE_URL
    };
}

function buildTeztaleLens(batch, teztaleHeadLevel) {
    const rows = (Array.isArray(batch) ? batch : [])
        .flatMap(summarizeTeztaleLevel)
        .filter((row) => row.level > 0)
        .sort((a, b) => b.level - a.level || b.round - a.round);
    const latestRaw = rows[0] || null;
    const completeRows = rows.filter((row) => row.complete);
    const latest = completeRows[0] || rows.find((row) => Number.isFinite(row.validationDelayMs)) || latestRaw;
    if (!latest) return teztaleFallback('No recent Teztale block data returned');

    const recentRows = (completeRows.length ? completeRows : rows).slice(0, TEZTALE_BLOCK_LOOKBACK);
    const sampleLevelCount = new Set(rows.map((row) => row.level)).size;
    const pendingHeadLevel = latestRaw && latestRaw.level > latest.level ? latestRaw.level : null;
    const alertSampleRows = rows.slice(0, Math.max(TEZTALE_BLOCK_LOOKBACK, recentRows.length + 2));
    const maxRound = alertSampleRows.reduce((max, row) => Math.max(max, row.round), 0);
    const maxQuorumMs = Math.max(...recentRows.map((row) => row.quorumMs).filter(Number.isFinite), 0);
    const maxValidationMs = Math.max(...alertSampleRows.map((row) => row.validationDelayMs).filter(Number.isFinite), 0);
    const alertRows = alertSampleRows.filter((row) => (
        row.round > 0
        || row.missingBlocks > 0
        || (row.quorumMs || 0) > 7000
        || (row.validationDelayMs || 0) > 3000
    ));

    let className = 'healthy';
    let label = 'Comfortable';
    if (maxRound > 1 || maxQuorumMs > 8000 || maxValidationMs > 3500 || recentRows.some((row) => row.missingBlocks > 0)) {
        className = 'degraded';
        label = 'Investigate';
    } else if (maxRound > 0 || maxQuorumMs > 6000 || maxValidationMs > 2200 || alertRows.length) {
        className = 'watch';
        label = 'Watch';
    } else if (maxQuorumMs <= 3000 && maxValidationMs <= 1200) {
        className = 'peak';
        label = 'Comfortable';
    }

    return {
        available: true,
        className,
        label,
        teztaleHeadLevel,
        windowCount: recentRows.length,
        completeCount: completeRows.length,
        sampleLevelCount,
        pendingHeadLevel,
        latest,
        avgPreQuorumMs: averageFinite(recentRows.map((row) => row.preQuorumMs)),
        avgPre90Ms: averageFinite(recentRows.map((row) => row.pre90Ms)),
        avgQuorumMs: averageFinite(recentRows.map((row) => row.quorumMs)),
        avgQuorum90Ms: averageFinite(recentRows.map((row) => row.quorum90Ms)),
        avgValidationMs: averageFinite(recentRows.map((row) => row.validationDelayMs)),
        avgApplicationMs: averageFinite(recentRows.map((row) => row.applicationDelayMs)),
        avgValidationToPreQuorumMs: averageTeztaleGap(recentRows, 'preQuorumMs', 'validationDelayMs'),
        avgValidationToQuorumMs: averageTeztaleGap(recentRows, 'quorumMs', 'validationDelayMs'),
        avgPreQuorumToQuorumMs: averageTeztaleGap(recentRows, 'quorumMs', 'preQuorumMs'),
        receptionHistogram: buildTeztaleReceptionHistogram(recentRows),
        maxQuorumMs,
        maxValidationMs,
        maxRound,
        lostOps: recentRows.reduce((sum, row) => sum + row.lostOps, 0),
        heldOps: recentRows.reduce((sum, row) => sum + row.heldOps, 0),
        erroneousOps: recentRows.reduce((sum, row) => sum + row.erroneousOps, 0),
        silentDelegates: recentRows.reduce((sum, row) => sum + row.silentDelegates, 0),
        missingBlocks: recentRows.reduce((sum, row) => sum + row.missingBlocks, 0),
        reportMode: alertRows.length ? 'alerts' : 'recent',
        reportRows: (alertRows.length ? alertRows : recentRows).slice(0, 5),
        sourceUrl: `${TEZTALE_REPORT_URL}#block=${latest.level}&round=${latest.round}&server=${encodeURIComponent(TEZTALE)}`,
        creditUrl: TEZTALE_SOURCE_URL
    };
}

async function fetchTeztaleConsensusLens(tzktHeadLevel = 0) {
    try {
        const head = await fetchTeztaleJson('head.json', 1);
        const teztaleHeadLevel = Number(head?.level) || Number(tzktHeadLevel) || 0;
        if (!teztaleHeadLevel) return teztaleFallback('No Teztale head level returned');
        const first = Math.max(1, teztaleHeadLevel - TEZTALE_BLOCK_LOOKBACK + 1);
        const batch = await fetchTeztaleJson(`${first}-${teztaleHeadLevel}.json`, 1);
        return buildTeztaleLens(batch, teztaleHeadLevel);
    } catch (error) {
        console.warn('Network Health Teztale consensus lens failed:', error);
        return teztaleFallback(error?.message || 'Teztale fetch failed');
    }
}

function normalizeActivityTx(tx) {
    const amountMutez = Number(tx.amount);
    const method = tx.parameter?.entrypoint || tx.entrypoint || 'transfer';
    return {
        hash: tx.hash || '',
        timestamp: tx.timestamp || null,
        amount: Number.isFinite(amountMutez) ? amountMutez / 1e6 : null,
        method,
        sender: bakerName(tx.sender),
        target: bakerName(tx.target)
    };
}

function collapseActivityRows(rows, limit = 8) {
    const collapsed = [];
    for (const row of rows || []) {
        const previous = collapsed[collapsed.length - 1];
        const sameAsPrevious = previous
            && previous.method === row.method
            && previous.target === row.target
            && previous.amount === row.amount;
        if (sameAsPrevious) {
            previous.count += 1;
            previous.hashes.push(row.hash);
            continue;
        }
        collapsed.push({ ...row, count: 1, hashes: [row.hash] });
        if (collapsed.length >= limit) break;
    }
    return collapsed;
}

function activityMethodLabel(row) {
    return row.count > 1 ? `${row.method} x${row.count}` : row.method;
}

function startActivityTapeRequest(priority) {
    const sequence = ++activityTapeRequestSequence;
    const url = `${TZKT}/operations/transactions?status=applied&amount.ge=1000000000&sort.desc=id&limit=${ACTIVITY_TAPE_LIMIT}`;
    const request = fetchJson(url, 2, { priority })
        .then((rows) => {
            const activity = (Array.isArray(rows) ? rows : []).map(normalizeActivityTx);
            if (sequence < activityTapeAppliedSequence) return activityTapeCache;
            activityTapeAppliedSequence = sequence;
            activityTapeCache = activity;
            activityTapeCacheAt = Date.now();
            return activityTapeCache;
        })
        .catch((error) => {
            console.warn('Network Health activity tape failed:', error);
            return activityTapeCache;
        });
    const trackedRequest = request.finally(() => {
        if (activityTapeInFlight !== trackedRequest) return;
        activityTapeInFlight = null;
        activityTapeInFlightPriority = 'normal';
    });

    activityTapeInFlight = trackedRequest;
    activityTapeInFlightPriority = priority;
    return trackedRequest;
}

async function fetchActivityTape({ force = false, priority = 'normal' } = {}) {
    if (!force && activityTapeCache.length && Date.now() - activityTapeCacheAt < ACTIVITY_TAPE_TTL) {
        return activityTapeCache;
    }
    if (activityTapeInFlight
        && (priority !== 'interactive' || activityTapeInFlightPriority === 'interactive')) {
        return activityTapeInFlight;
    }

    return startActivityTapeRequest(priority);
}

function usageWindowStart() {
    const start = new Date(Date.now() - USAGE_WINDOW_MS);
    start.setSeconds(0, 0);
    return encodeURIComponent(start.toISOString());
}

async function fetchUsagePulse({ force = false, priority = 'normal' } = {}) {
    if (!force && usagePulseCache && Date.now() - usagePulseCacheAt < USAGE_PULSE_TTL) {
        return usagePulseCache;
    }
    if (usagePulseInFlight) return usagePulseInFlight;

    const since = usageWindowStart();
    usagePulseInFlight = Promise.all([
        fetchJson(`${TZKT}/operations/transactions/count?status=applied&timestamp.ge=${since}`, 1, { priority }).catch(() => null),
        fetchJson(`${TZKT}/operations/transactions?status=applied&timestamp.ge=${since}&select=amount&limit=${USAGE_AMOUNT_PAGE_LIMIT}`, 1, { priority }).catch(() => null),
        fetchJson(`${TZKT}/tokens/transfers/count?token.metadata.artifactUri.null=false&timestamp.ge=${since}`, 1, { priority }).catch(() => null),
        fetchActivityTape({ priority }).catch(() => activityTapeCache)
    ]).then(([txCount, amounts, nftCount, tape]) => {
        const previous = usagePulseCache;
        const amountRows = Array.isArray(amounts) ? amounts : null;
        const movedXtz = amountRows
            ? amountRows.reduce((sum, value) => sum + (Number(value) || 0), 0) / 1e6
            : null;
        usagePulseCache = {
            updatedAt: Date.now(),
            txCount: Number.isFinite(Number(txCount)) ? Number(txCount) : (previous?.txCount ?? null),
            movedXtz: Number.isFinite(movedXtz) ? movedXtz : (previous?.movedXtz ?? null),
            movedClipped: amountRows ? amountRows.length >= USAGE_AMOUNT_PAGE_LIMIT : Boolean(previous?.movedClipped),
            nftCount: Number.isFinite(Number(nftCount)) ? Number(nftCount) : (previous?.nftCount ?? null),
            whale: (Array.isArray(tape) && tape[0]) || previous?.whale || null
        };
        usagePulseCacheAt = Date.now();
        return usagePulseCache;
    }).catch((error) => {
        console.warn('Network Health usage pulse failed:', error);
        return usagePulseCache;
    }).finally(() => {
        usagePulseInFlight = null;
    });

    return usagePulseInFlight;
}

export { classifyOctezVersion, fetchOctezVersions } from '../core/octez-versions.js';

async function fetchProtocolCycleTargetSeconds() {
    if (protocolConstantsCache && Date.now() - protocolConstantsCacheAt < PROTOCOL_CONSTANTS_TTL) {
        return protocolConstantsCache;
    }

    try {
        const constants = await fetchJson(`${API_URLS.octez}/chains/main/blocks/head/context/constants`, 1);
        const blockDelay = Array.isArray(constants?.minimal_block_delay)
            ? Number(constants.minimal_block_delay[0])
            : Number(constants?.minimal_block_delay);
        const blocksPerCycle = Number(constants?.blocks_per_cycle);
        const target = blocksPerCycle > 0 && blockDelay > 0
            ? blocksPerCycle * blockDelay
            : CYCLE_TARGET_SECONDS_FALLBACK;
        protocolConstantsCache = target;
        protocolConstantsCacheAt = Date.now();
        return target;
    } catch (error) {
        console.warn('Network Health cycle target lookup failed:', error);
        return protocolConstantsCache || CYCLE_TARGET_SECONDS_FALLBACK;
    }
}

function normalizeCycleRow(row) {
    const timestampMs = new Date(row?.timestamp).getTime();
    return {
        cycle: Number(row?.cycle),
        level: Number(row?.level) || 0,
        timestamp: row?.timestamp || null,
        timestampMs
    };
}

function buildCycleTiming(rows, targetSeconds) {
    const sorted = (Array.isArray(rows) ? rows : [])
        .map(normalizeCycleRow)
        .filter((row) => Number.isFinite(row.cycle) && Number.isFinite(row.timestampMs))
        .sort((a, b) => b.cycle - a.cycle);
    const intervals = [];

    for (let index = 0; index < sorted.length - 1; index += 1) {
        const later = sorted[index];
        const earlier = sorted[index + 1];
        const seconds = (later.timestampMs - earlier.timestampMs) / 1000;
        if (!Number.isFinite(seconds) || seconds <= 0) continue;
        const driftSeconds = seconds - targetSeconds;
        const driftPct = targetSeconds > 0 ? (driftSeconds / targetSeconds) * 100 : 0;
        intervals.push({
            cycle: earlier.cycle,
            start: earlier.timestamp,
            end: later.timestamp,
            seconds,
            driftSeconds,
            driftPct,
            className: cycleTimingClass(driftPct),
            label: cycleTimingLabel(driftPct)
        });
    }

    const latest = intervals[0] || null;
    const averageSeconds = intervals.length
        ? intervals.reduce((sum, interval) => sum + interval.seconds, 0) / intervals.length
        : null;
    const averageDriftPct = Number.isFinite(averageSeconds) && targetSeconds > 0
        ? ((averageSeconds - targetSeconds) / targetSeconds) * 100
        : null;
    const worst = intervals.reduce((candidate, interval) => (
        !candidate || Math.abs(interval.driftPct) > Math.abs(candidate.driftPct) ? interval : candidate
    ), null);

    return {
        updatedAt: Date.now(),
        targetSeconds,
        latest,
        averageSeconds,
        averageDriftPct,
        worst,
        intervals
    };
}

function startCycleTimingRequest(priority) {
    const sequence = ++cycleTimingRequestSequence;
    const url = `${TZKT}/statistics/cyclic?limit=${CYCLE_TIMING_LIMIT}&sort.desc=cycle&select=cycle,level,timestamp`;
    const request = Promise.all([
        fetchJson(url, 2, { priority }),
        fetchProtocolCycleTargetSeconds()
    ]).then(([rows, targetSeconds]) => {
        const timing = buildCycleTiming(rows, targetSeconds);
        if (sequence < cycleTimingAppliedSequence) return cycleTimingCache;
        cycleTimingAppliedSequence = sequence;
        cycleTimingCache = timing;
        cycleTimingCacheAt = Date.now();
        return cycleTimingCache;
    }).catch((error) => {
        console.warn('Network Health cycle timing failed:', error);
        return cycleTimingCache;
    });
    const trackedRequest = request.finally(() => {
        if (cycleTimingInFlight !== trackedRequest) return;
        cycleTimingInFlight = null;
        cycleTimingInFlightPriority = 'normal';
    });

    cycleTimingInFlight = trackedRequest;
    cycleTimingInFlightPriority = priority;
    return trackedRequest;
}

async function fetchCycleTiming({ force = false, priority = 'normal' } = {}) {
    if (!force && cycleTimingCache && Date.now() - cycleTimingCacheAt < CYCLE_TIMING_TTL) {
        return cycleTimingCache;
    }
    if (cycleTimingInFlight
        && (priority !== 'interactive' || cycleTimingInFlightPriority === 'interactive')) {
        return cycleTimingInFlight;
    }

    return startCycleTimingRequest(priority);
}

async function fetchCurrentCycleProgress() {
    try {
        const cycleInfo = await fetchCycleInfo();
        if (Number.isFinite(Number(cycleInfo?.cycle)) && Number.isFinite(Number(cycleInfo?.progress))) {
            currentCycleCache = cycleInfo;
            return cycleInfo;
        }
        return currentCycleCache || cycleInfo || null;
    } catch (error) {
        console.warn('Network Health current-cycle progress failed:', error);
        return currentCycleCache;
    }
}

function numericRound(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

function normalizeBlock(block) {
    const rawCommittee = Number(block.attestationCommittee);
    const committee = Number.isFinite(rawCommittee) && rawCommittee > 0 ? rawCommittee : null;
    const rawPower = Number(block.attestationPower ?? block.validations);
    const power = Number.isFinite(rawPower)
        ? Math.max(0, committee === null ? rawPower : Math.min(rawPower, committee))
        : null;
    const payloadRound = numericRound(block.payloadRound);
    const blockRound = Number.isFinite(Number(block.blockRound)) ? Number(block.blockRound) : payloadRound;
    const feesMutez = Number(block.fees);
    const rewardParts = [
        block.rewardDelegated, block.rewardStakedOwn, block.rewardStakedEdge, block.rewardStakedShared,
        block.bonusDelegated, block.bonusStakedOwn, block.bonusStakedEdge, block.bonusStakedShared
    ].map(Number);
    return {
        level: Number(block.level) || 0,
        cycle: Number.isFinite(Number(block.cycle)) ? Number(block.cycle) : null,
        protocol: Number.isFinite(Number(block.proto)) ? Number(block.proto) : null,
        timestamp: block.timestamp || null,
        producer: block.producer || null,
        proposer: block.proposer || null,
        payloadRound,
        blockRound,
        power,
        committee,
        missedPower: committee !== null && power !== null ? Math.max(0, committee - power) : null,
        intervalSeconds: null,
        score: committee !== null && power !== null ? (power / committee) * 100 : null,
        feesMutez: Number.isFinite(feesMutez) ? feesMutez : null,
        mintedMutez: rewardParts.some(Number.isFinite)
            ? rewardParts.reduce((sum, part) => sum + (Number.isFinite(part) ? part : 0), 0)
            : null
    };
}

function addBlockIntervals(blocks) {
    return blocks.map((block, index) => {
        const older = blocks[index + 1];
        const cycleStartKnown = Number.isFinite(block?.cycle) && Number.isFinite(older?.cycle);
        const cycleStart = cycleStartKnown && block.cycle !== older.cycle;
        if (!block.timestamp || !older?.timestamp) return { ...block, cycleStartKnown, cycleStart };
        const diff = (new Date(block.timestamp).getTime() - new Date(older.timestamp).getTime()) / 1000;
        return {
            ...block,
            cycleStartKnown,
            cycleStart,
            intervalSeconds: Number.isFinite(diff) && diff >= 0 ? diff : null
        };
    });
}

function summarizeBlocks(blocks) {
    const knownBlocks = blocks.filter((block) => Number.isFinite(block.power) && Number.isFinite(block.committee));
    const totalPower = knownBlocks.reduce((sum, block) => sum + block.power, 0);
    const totalCommittee = knownBlocks.reduce((sum, block) => sum + block.committee, 0);
    const score = totalCommittee > 0 ? (totalPower / totalCommittee) * 100 : 0;

    return {
        score,
        totalPower,
        totalCommittee,
        missingPower: Math.max(0, totalCommittee - totalPower),
        count: blocks.length
    };
}

function summarizeTiming(blocks) {
    const intervals = blocks.map((block) => block.intervalSeconds).filter(Number.isFinite);
    const roundZero = blocks.filter((block) => block.blockRound === 0).length;
    const avgSeconds = intervals.length
        ? intervals.reduce((sum, value) => sum + value, 0) / intervals.length
        : null;
    const maxSeconds = intervals.length ? Math.max(...intervals) : null;
    const onTarget = intervals.filter((value) => value <= TARGET_BLOCK_SECONDS + 2).length;
    const maxRound = blocks.reduce((max, block) => Math.max(max, block.blockRound), 0);

    return {
        intervals,
        avgSeconds,
        maxSeconds,
        onTarget,
        intervalCount: intervals.length,
        roundZero,
        roundZeroPct: blocks.length ? (roundZero / blocks.length) * 100 : 0,
        maxRound
    };
}

async function fetchRecentBlocks(limit = LAST_BLOCK_LIMIT, { priority = 'normal' } = {}) {
    const fields = 'level,cycle,proto,timestamp,producer,proposer,attestationPower,attestationCommittee,payloadRound,blockRound'
        + ',fees,rewardDelegated,rewardStakedOwn,rewardStakedEdge,rewardStakedShared'
        + ',bonusDelegated,bonusStakedOwn,bonusStakedEdge,bonusStakedShared';
    const url = `${TZKT}/blocks?sort.desc=level&limit=${limit + 1}&select=${fields}`;
    const blocks = await fetchJson(url, 2, { priority });
    return addBlockIntervals((Array.isArray(blocks) ? blocks : []).map(normalizeBlock)).slice(0, limit);
}

async function fetchLastBlocks() {
    return fetchRecentBlocks(LAST_BLOCK_LIMIT);
}

async function fetchLevelAt(date) {
    const timestamp = encodeURIComponent(date.toISOString());
    const level = await fetchJson(`${TZKT}/blocks/${timestamp}/level`);
    return Number(level) || 0;
}

async function fetchBlocksInRange(startLevel, endLevel) {
    const fields = 'level,attestationPower,attestationCommittee';
    const blocks = [];
    let offset = 0;

    while (startLevel <= endLevel) {
        const url = `${TZKT}/blocks?level.ge=${startLevel}&level.le=${endLevel}&sort.asc=level&offset=${offset}&limit=${RANGE_PAGE_LIMIT}&select=${fields}`;
        const page = await fetchJson(url);
        blocks.push(...page.map(normalizeBlock));
        if (page.length < RANGE_PAGE_LIMIT) break;
        offset += RANGE_PAGE_LIMIT;
    }

    return blocks;
}

function buildSampleLevels(startLevel, endLevel, sampleSize) {
    const total = Math.max(1, endLevel - startLevel + 1);
    const count = Math.min(sampleSize, total);
    if (count <= 1) return [endLevel];

    const levels = new Set();
    const step = (endLevel - startLevel) / (count - 1);
    for (let i = 0; i < count; i += 1) {
        levels.add(Math.round(startLevel + step * i));
    }
    levels.add(endLevel);
    return Array.from(levels).sort((a, b) => a - b);
}

async function fetchBlocksByLevels(levels) {
    if (!levels.length) return [];
    const fields = 'level,attestationPower,attestationCommittee';
    const chunks = [];
    for (let i = 0; i < levels.length; i += 200) {
        chunks.push(levels.slice(i, i + 200));
    }

    const pages = await Promise.all(chunks.map((chunk) => {
        const url = `${TZKT}/blocks?level.in=${chunk.join(',')}&sort.asc=level&limit=${chunk.length}&select=${fields}`;
        return fetchJson(url);
    }));

    return pages.flat().map(normalizeBlock);
}

async function fetchPeriod(period, headLevel, now) {
    const cutoff = new Date(now.getTime() - period.hours * 60 * 60 * 1000);
    const cutoffLevel = await fetchLevelAt(cutoff);
    const startLevel = Math.max(1, cutoffLevel + 1);
    const totalBlocks = Math.max(1, headLevel - cutoffLevel);

    let blocks;
    let sampled = true;

    if (period.exactLimit && totalBlocks <= period.exactLimit) {
        blocks = await fetchBlocksInRange(startLevel, headLevel);
        sampled = false;
    } else {
        const sampleLevels = buildSampleLevels(startLevel, headLevel, SAMPLE_SIZE);
        blocks = await fetchBlocksByLevels(sampleLevels);
    }

    const summary = summarizeBlocks(blocks);
    const possiblePower = totalBlocks * POWER_PER_BLOCK;
    const actualPower = Math.round((summary.score / 100) * possiblePower);

    return {
        key: period.key,
        label: period.label,
        score: summary.score,
        actualPower,
        possiblePower,
        missingPower: Math.max(0, possiblePower - actualPower),
        blocks: totalBlocks,
        sampleSize: blocks.length,
        sampled
    };
}

function loadCachedData() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (!data?.updatedAt) return null;
        return data;
    } catch {
        return null;
    }
}

function saveCachedData(data) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
        // Non-critical cache.
    }
}

function periodCacheIsFresh(data) {
    const periodUpdatedAt = data?.periodUpdatedAt || 0;
    return data?.periods?.length === PERIODS.length && Date.now() - periodUpdatedAt < PERIOD_TTL;
}

async function fetchNetworkHealth({ forcePeriods = false } = {}) {
    const [lastBlocks, cycleTiming, octezVersions] = await Promise.all([
        fetchLastBlocks(),
        fetchCycleTiming(),
        fetchOctezVersions()
    ]);
    const summary = summarizeBlocks(lastBlocks.slice(0, HEALTH_CARD_BLOCK_LIMIT));
    const headLevel = lastBlocks[0]?.level || 0;
    const headTimestamp = lastBlocks[0]?.timestamp || null;
    const now = new Date();

    let periods = cachedData?.periods || [];
    const shouldFetchPeriods = forcePeriods || !periodCacheIsFresh(cachedData) || !periods.length;

    if (headLevel && shouldFetchPeriods) {
        periods = await Promise.all(PERIODS.map((period) => fetchPeriod(period, headLevel, now)));
        lastFullFetch = Date.now();
    }

    return {
        updatedAt: Date.now(),
        headTimestamp,
        periodUpdatedAt: shouldFetchPeriods ? Date.now() : (cachedData?.periodUpdatedAt || 0),
        headLevel,
        blocks: lastBlocks,
        summary,
        periods,
        cycleTiming,
        octezVersions: octezVersions || cachedData?.octezVersions || null
    };
}

function normalizeRight(right, type) {
    return {
        type,
        level: Number(right.level) || 0,
        timestamp: right.timestamp || null,
        round: right.round === null || right.round === undefined ? null : Number(right.round),
        slots: Math.max(0, Number(right.slots) || 0),
        baker: right.baker || {}
    };
}

async function fetchMissedRights(type, startLevel, endLevel, limit = MISSED_RIGHTS_LIMIT, { priority = 'normal' } = {}) {
    if (!startLevel || !endLevel || startLevel > endLevel) return [];
    const fields = type === 'attestation'
        ? 'level,timestamp,slots,baker,status,type'
        : 'level,timestamp,round,baker,status,type';
    const url = `${TZKT}/rights?sort.desc=level&limit=${limit}&status=missed&type=${type}&level.ge=${startLevel}&level.le=${endLevel}&select=${fields}`;
    const rights = await fetchJson(url, 2, { priority });
    return (Array.isArray(rights) ? rights : []).map((right) => normalizeRight(right, type));
}

function summarizeMissedAttesters(rights) {
    const byBaker = new Map();
    for (const right of rights) {
        const address = right.baker?.address || 'unknown';
        const current = byBaker.get(address) || {
            address,
            name: bakerName(right.baker),
            slots: 0,
            count: 0,
            latestLevel: 0,
            latestTimestamp: null
        };
        current.slots += right.slots;
        current.count += 1;
        if (right.level > current.latestLevel) {
            current.latestLevel = right.level;
            current.latestTimestamp = right.timestamp;
        }
        byBaker.set(address, current);
    }
    return [...byBaker.values()].sort((a, b) => b.slots - a.slots || b.latestLevel - a.latestLevel);
}

function chamberStatus(data) {
    if (data.summary.score < 95 || data.timing.maxRound > 1 || (data.timing.avgSeconds || 0) > 12) {
        return { label: 'Degraded', className: 'historical' };
    }
    if (data.summary.score < 99.5 || data.timing.maxRound > 0 || (data.timing.avgSeconds || 0) > 8 || data.missedBlocks.length) {
        return { label: 'Watch', className: 'current' };
    }
    return { label: 'Healthy', className: 'live' };
}

function healthVerdict(data) {
    const status = chamberStatus(data);
    const score = Number(data.summary?.score || 0);
    const avgSeconds = Number(data.timing?.avgSeconds || 0);
    const maxRound = Number(data.timing?.maxRound || 0);
    const missedBlocks = data.missedBlocks?.length || 0;
    const head = data.blocks?.[0]?.level ? `head ${formatCount(data.blocks[0].level)}` : 'live head pending';
    const powerText = score ? `${score.toFixed(score >= 99.5 ? 2 : 1)}% attestation power` : 'attestation power warming up';

    if (status.label === 'Healthy') {
        return {
            ...status,
            tone: 'green',
            sentence: `Everything looks OK: recent blocks are landing near target with ${powerText}.`,
            meta: `${head} · avg ${formatSeconds(avgSeconds)} · round ${maxRound}`
        };
    }
    if (status.label === 'Watch') {
        const reason = missedBlocks
            ? `${missedBlocks} missed block signal${missedBlocks === 1 ? '' : 's'} in the sample`
            : maxRound > 0
                ? `a recent non-zero round reached R${maxRound}`
                : `average cadence is ${formatSeconds(avgSeconds)}`;
        return {
            ...status,
            tone: 'amber',
            sentence: `The chain is moving, but worth watching: ${reason}.`,
            meta: `${head} · ${powerText}`
        };
    }
    return {
        ...status,
        tone: 'red',
        sentence: `Network health needs attention: cadence, rounds, or attestation power are outside the comfort zone.`,
        meta: `${head} · avg ${formatSeconds(avgSeconds)} · ${powerText}`
    };
}

function renderHealthVerdictPanel(data) {
    const verdict = healthVerdict(data);
    return `
        <section class="health-verdict-panel ${escapeHtml(verdict.tone)} chamber-anim-fade" id="health-verdict-panel" data-chamber-verdict="health" aria-label="Network health verdict" style="animation-delay:90ms">
            <div class="health-verdict-status">
                <span class="health-verdict-dot" aria-hidden="true"></span>
                <span>${escapeHtml(verdict.label)}</span>
            </div>
            <div class="health-verdict-copy">
                <strong>${escapeHtml(verdict.sentence)}</strong>
                <span>${escapeHtml(verdict.meta)}</span>
            </div>
        </section>
    `;
}

function updateHealthVerdictPanel(data) {
    const panel = document.getElementById('health-verdict-panel');
    if (!panel) return;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = renderHealthVerdictPanel(data).trim();
    const next = wrapper.firstElementChild;
    if (next) panel.replaceWith(next);
}

async function fetchNetworkHealthChamberData() {
    const requestOptions = { priority: 'interactive' };
    const standalone = !document.getElementById('uptime-counter');
    const [chainHealthBlocks, cycleTiming, currentCycle, nakamoto, continuity] = await Promise.all([
        fetchRecentBlocks(CHAIN_HEALTH_BLOCK_LIMIT, requestOptions),
        fetchCycleTiming(requestOptions),
        fetchCurrentCycleProgress(),
        fetchNakamotoCoefficients(),
        standalone ? fetchChamberContinuity() : null
    ]);
    const blocks = chainHealthBlocks.slice(0, CHAMBER_BLOCK_LIMIT);
    const summary = summarizeBlocks(blocks);
    const timing = summarizeTiming(blocks);
    const headLevel = blocks[0]?.level || 0;
    const headTimestamp = blocks[0]?.timestamp || null;
    const oldestLevel = blocks[blocks.length - 1]?.level || headLevel;
    const missedBlockStart = Math.max(1, headLevel - MISSED_BLOCK_LOOKBACK);
    const octezVersionsPromise = fetchOctezVersions(requestOptions);
    let periods = cachedData?.periods || [];
    let periodUpdatedAt = cachedData?.periodUpdatedAt || 0;
    if (standalone && headLevel && !periodCacheIsFresh(cachedData)) {
        periods = await Promise.all(PERIODS.map(period => fetchPeriod(period, headLevel, new Date())));
        periodUpdatedAt = Date.now();
    }
    let missedAttestations = [];
    let missedBlocks = [];
    let activityTape = [];
    let teztaleLens = teztaleFallback('TzKT head level unavailable');
    let octezVersions = null;

    if (headLevel) {
        [missedAttestations, missedBlocks, activityTape, teztaleLens, octezVersions] = await Promise.all([
            fetchMissedRights('attestation', oldestLevel, headLevel, MISSED_RIGHTS_LIMIT, requestOptions),
            fetchMissedRights('baking', missedBlockStart, headLevel, 30, requestOptions),
            fetchActivityTape(requestOptions),
            fetchTeztaleConsensusLens(headLevel),
            octezVersionsPromise
        ]);
    } else {
        octezVersions = await octezVersionsPromise;
    }

    const data = {
        updatedAt: Date.now(),
        continuity,
        periodUpdatedAt,
        headTimestamp,
        headLevel,
        oldestLevel,
        blocks,
        chainHealthBlocks,
        summary,
        timing,
        missedAttestations,
        missedAttesters: summarizeMissedAttesters(missedAttestations),
        missedBlocks,
        activityTape,
        teztaleLens,
        octezVersions,
        nakamoto,
        periods,
        cycleTiming: cycleTiming || cachedData?.cycleTiming || null,
        currentCycle
    };
    if (standalone) { cachedData = data; saveCachedData(data); }
    return data;
}

function renderBlock(block) {
    const known = Number.isFinite(block.score);
    const cls = known ? healthClass(block.score) : 'unknown';
    const levelTail = block.level ? String(block.level).slice(-3).padStart(3, '0') : '---';
    const width = known ? Math.max(2, Math.min(100, block.score)) : 0;
    const title = known
        ? `Block ${block.level.toLocaleString()}: ${block.power.toLocaleString()} / ${block.committee.toLocaleString()} power`
        : `Block ${block.level.toLocaleString()}: Attestation unknown`;

    return `
        <div class="network-health-block ${cls}" title="${title}" aria-label="${title}">
            <span class="network-health-block-bar"><span style="height:${width}%"></span></span>
            <span class="network-health-block-level">#${levelTail}</span>
        </div>
    `;
}

function renderPeriod(period) {
    const cls = healthClass(period.score);
    const title = `${period.label}: ${formatCompactPower(period.actualPower)} / ${formatCompactPower(period.possiblePower)} power${period.sampled ? ' (sampled)' : ''}`;

    return `
        <div class="network-health-period ${cls}" title="${title}" aria-label="${title}">
            <span class="network-health-period-label">${period.label}</span>
            <span class="network-health-period-value">${formatPct(period.score)}%</span>
        </div>
    `;
}

function renderCycleTimingBackRow(cycleTiming) {
    const latest = cycleTiming?.latest;
    if (!latest) return '';
    const title = `Cycle ${formatCount(latest.cycle)} ran ${formatDuration(latest.seconds)}, ${formatSignedDuration(latest.driftSeconds)} vs protocol target`;
    return `
        <div class="network-health-back-row network-health-cycle-row">
            <span>Last cycle</span>
            <strong title="${escapeHtml(title)}">${formatDuration(latest.seconds)} · ${formatSignedPct(latest.driftPct)}</strong>
        </div>
    `;
}

function renderCycleTimingCell(interval) {
    const title = `Cycle ${formatCount(interval.cycle)}: ${formatDuration(interval.seconds)}, ${formatSignedDuration(interval.driftSeconds)} vs target`;
    return `
        <span class="health-cycle-cell ${interval.className}" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">
            <span>C${formatCount(interval.cycle)}</span>
            <strong>${formatDuration(interval.seconds)}</strong>
        </span>
    `;
}

function renderCurrentCycleProgress(currentCycle) {
    const cycle = Number(currentCycle?.cycle);
    const progress = Number(currentCycle?.progress);
    const available = Number.isFinite(cycle) && Number.isFinite(progress);
    if (!available) {
        return `
            <div class="health-cycle-current unavailable" id="health-cycle-current">
                <div class="health-cycle-progress-head">
                    <span>Current cycle</span>
                    <strong id="health-cycle-progress">--</strong>
                </div>
                <div class="health-cycle-progress-track" aria-hidden="true"><span></span></div>
                <div class="health-cycle-progress-meta"><span>Octez cycle progress unavailable</span></div>
            </div>
        `;
    }

    const boundedProgress = Math.max(0, Math.min(100, progress));
    const displayProgress = `${formatPct(boundedProgress)}%`;
    const headLevel = Number(currentCycle?.blockLevel);
    const remaining = currentCycle?.timeRemaining && currentCycle.timeRemaining !== '—'
        ? currentCycle.timeRemaining
        : 'remaining time unavailable';
    return `
        <div class="health-cycle-current" id="health-cycle-current">
            <div class="health-cycle-progress-head">
                <span>Current cycle <strong id="health-cycle-number">C${formatCount(cycle)}</strong></span>
                <strong id="health-cycle-progress">${displayProgress}</strong>
            </div>
            <div
                class="health-cycle-progress-track"
                role="progressbar"
                aria-label="Current Tezos cycle progress"
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow="${boundedProgress.toFixed(2)}"
                aria-valuetext="${displayProgress} through cycle ${formatCount(cycle)}"
            ><span style="width:${boundedProgress.toFixed(2)}%"></span></div>
            <div class="health-cycle-progress-meta">
                <span>${Number.isFinite(headLevel) ? `Head ${formatCount(headLevel)}` : 'Live head'}</span>
                <span>${escapeHtml(remaining)}</span>
            </div>
        </div>
    `;
}

function renderCycleTimingPanel(data) {
    const timing = data?.cycleTiming;
    const latest = timing?.latest;
    const currentCycle = renderCurrentCycleProgress(data?.currentCycle);
    const cadence = latest
        ? (() => {
            const cls = cycleTimingClass(latest.driftPct);
            const average = Number.isFinite(timing.averageSeconds) ? formatDuration(timing.averageSeconds) : '--';
            const averageDrift = Number.isFinite(timing.averageDriftPct) ? formatSignedPct(timing.averageDriftPct) : '--';
            const worst = timing.worst;
            const cells = timing.intervals.slice(0, 6).map(renderCycleTimingCell).join('');
            return `
                <div class="health-cycle-hero ${cls}">
                    <strong id="health-cycle-duration">${formatDuration(latest.seconds)}</strong>
                    <span id="health-cycle-status">Last cycle · ${escapeHtml(latest.label)} · ${formatSignedPct(latest.driftPct)} vs target</span>
                </div>
                <div class="lb-metric-grid health-metric-grid">
                    <div><span>Last cycle</span><strong id="health-cycle-last">C${formatCount(latest.cycle)}</strong></div>
                    <div><span>Target</span><strong id="health-cycle-target">${formatDuration(timing.targetSeconds)}</strong></div>
                    <div><span>Recent avg</span><strong id="health-cycle-average">${average} · ${averageDrift}</strong></div>
                </div>
                <div class="health-cycle-strip" id="health-cycle-strip" aria-label="Recent completed cycle durations">${cells}</div>
                <div class="health-timing-note" id="health-cycle-note">
                    Worst recent drift ${worst ? `${formatSignedPct(worst.driftPct)} on C${formatCount(worst.cycle)}` : '--'}; cycle-start deltas catch network-wide slowdowns without scanning every block.
                </div>
            `;
        })()
        : '<div class="lb-empty-inline">Completed-cycle timing is warming up from TzKT cyclic statistics.</div>';

    return `
        <section class="lb-panel health-panel health-cycle-panel chamber-anim-fade" id="health-cycle-timing" style="animation-delay:120ms">
            <div class="lb-panel-title">Cycle Progress &amp; Timing <span class="lb-live-pill">Octez RPC + TzKT cyclic</span></div>
            ${currentCycle}
            ${cadence}
        </section>
    `;
}

function renderNetworkHealth(data, { error = false } = {}) {
    const scoreEl = document.getElementById('network-health-front');
    const statusEl = document.getElementById('network-health-status');
    const blocksEl = document.getElementById('network-health-blocks');
    const periodsEl = document.getElementById('network-health-periods');
    const backEl = document.getElementById('network-health-back');
    const descEl = document.getElementById('network-health-description');
    if (!scoreEl || !blocksEl || !periodsEl) return;

    const cls = healthClass(data.summary.score);
    const label = healthLabel(data.summary.score);

    scoreEl.textContent = `${formatPct(data.summary.score)}%`;
    scoreEl.className = `stat-value network-health-score ${cls}`;

    if (statusEl) {
        statusEl.textContent = label;
        statusEl.className = `network-health-status ${cls}`;
        statusEl.title = 'Status combines recent attestation power, missed baking rights, block round, and cadence.';
    }

    blocksEl.innerHTML = data.blocks.slice(0, HEALTH_CARD_BLOCK_LIMIT).map(renderBlock).join('');
    periodsEl.innerHTML = data.periods.map(renderPeriod).join('');

    if (backEl) {
        backEl.innerHTML = `${renderCycleTimingBackRow(data.cycleTiming)}${data.periods.map((period) => `
            <div class="network-health-back-row">
                <span>${period.label}</span>
                <strong>${formatCompactPower(period.actualPower)} / ${formatCompactPower(period.possiblePower)}</strong>
            </div>
        `).join('')}`;
    }

    if (descEl) {
        descEl.textContent = `${formatCompactPower(data.summary.totalPower)} / ${formatCompactPower(data.summary.totalCommittee)} power across last ${HEALTH_CARD_BLOCK_LIMIT} blocks`;
    }

    const card = document.querySelector('.stat-card[data-stat="network-health"]');
    if (card) {
        const labelTimestamp = data.headTimestamp || data.updatedAt || Date.now();
        card.dataset.updatedLabel = formatFreshnessStamp(labelTimestamp, { source: 'TzKT head' });
        setDataFreshnessState(card, labelTimestamp, LIVE_REFRESH_INTERVAL * 2);
    }

    ensureHealthEntryTape();
    refreshNetworkHealthTape();
    updateBlockTicker(data, { error });
}

function renderNetworkHealthError() {
    const scoreEl = document.getElementById('network-health-front');
    const statusEl = document.getElementById('network-health-status');
    const blocksEl = document.getElementById('network-health-blocks');
    const periodsEl = document.getElementById('network-health-periods');

    if (scoreEl) {
        scoreEl.textContent = '--';
        scoreEl.className = 'stat-value network-health-score degraded';
    }
    if (statusEl) {
        statusEl.textContent = 'Offline';
        statusEl.className = 'network-health-status degraded';
    }
    if (blocksEl) blocksEl.innerHTML = '<span class="network-health-muted">TzKT unavailable</span>';
    if (periodsEl) periodsEl.innerHTML = '';
    renderHealthEntryTape([]);
    updateBlockTicker(null, { error: true });
}

function ensureHealthEntryTape() {
    const card = document.querySelector('.stat-card[data-stat="network-health"]');
    const front = card?.querySelector('.card-front');
    if (!front) return null;

    let tape = document.getElementById('network-health-live-tape');
    if (!tape) {
        tape = document.createElement('div');
        tape.id = 'network-health-live-tape';
        tape.className = 'health-live-tape';
        tape.setAttribute('aria-label', 'Network activity live tape');
        tape.innerHTML = `
            <div class="health-live-tape-title">Live Tape</div>
            <div class="health-live-tape-rows" id="network-health-live-tape-rows">
                <div class="health-live-empty">Loading transfers</div>
            </div>
        `;
        front.appendChild(tape);
    }

    return tape;
}

function renderHealthEntryTape(rows) {
    const tape = ensureHealthEntryTape();
    const rowsEl = tape?.querySelector('#network-health-live-tape-rows');
    if (!rowsEl) return;

    if (!rows?.length) {
        rowsEl.innerHTML = '<div class="health-live-empty">Large transfers unavailable</div>';
        return;
    }

    rowsEl.innerHTML = collapseActivityRows(rows, 3).map((row) => `
        <div class="health-live-row">
            <span class="health-live-method">${escapeHtml(activityMethodLabel(row))}</span>
            <span class="health-live-amount">${row.amount === null ? '--' : `${formatCompactPower(row.amount)} XTZ`}</span>
            <span class="health-live-age"${healthAgeAttr(row.timestamp)}>${escapeHtml(formatAge(row.timestamp))}</span>
        </div>
    `).join('');
}

async function refreshNetworkHealthTape({ force = false } = {}) {
    const rows = await fetchActivityTape({ force });
    renderHealthEntryTape(rows);
    return rows;
}

function setTextIfChanged(target, value, { pulse = true } = {}) {
    const element = typeof target === 'string' ? document.querySelector(target) : target;
    if (!element) return false;
    const next = String(value ?? '');
    if (element.textContent === next) return false;
    element.textContent = next;
    if (pulse) {
        element.classList.remove('health-value-updated');
        void element.offsetWidth;
        element.classList.add('health-value-updated');
    }
    return true;
}

function setClassNameIfChanged(target, className) {
    const element = typeof target === 'string' ? document.querySelector(target) : target;
    if (!element || element.className === className) return false;
    element.className = className;
    return true;
}

function setHtmlIfSignatureChanged(target, html, signature, { softClass = 'health-soft-updated', pulse = false } = {}) {
    const element = typeof target === 'string' ? document.querySelector(target) : target;
    if (!element) return false;
    const nextSignature = String(signature ?? html);
    if (element.dataset.healthSignature === nextSignature) return false;
    element.dataset.healthSignature = nextSignature;
    quietlySyncHtml(element, html);
    if (pulse) {
        element.classList.remove(softClass);
        void element.offsetWidth;
        element.classList.add(softClass);
    }
    return true;
}

function renderHealthScorePanel(data) {
    const cls = healthClass(data.summary.score);
    const width = Math.max(2, Math.min(100, data.summary.score));
    const headTimestamp = getHeadTimestamp(data);
    return `
        <section class="lb-panel health-panel health-score-panel chamber-anim-fade">
            <div class="lb-panel-title">Consensus Power</div>
            <div class="health-hero-number ${cls}" id="health-hero-score">${formatPct(data.summary.score)}%</div>
            <div class="health-hero-copy" id="health-hero-copy">Last ${formatCount(data.summary.count)} blocks recorded ${formatCompactPower(data.summary.totalPower)} / ${formatCompactPower(data.summary.totalCommittee)} attestation power.</div>
            <div class="health-score-meter" aria-label="Recent attestation power">
                <div class="health-score-fill ${cls}" id="health-score-fill" style="width:${width.toFixed(2)}%"></div>
            </div>
            <div class="lb-metric-grid health-metric-grid">
                <div><span>Missed power</span><strong id="health-summary-missed">${formatCompactPower(data.summary.missingPower)}</strong></div>
                <div><span>Block range</span><strong id="health-summary-range">${formatCount(data.oldestLevel)} → ${formatCount(data.headLevel)}</strong></div>
                <div><span>Updated</span><strong id="health-summary-updated"${healthAgeAttr(headTimestamp)}>${formatAge(headTimestamp)}</strong></div>
            </div>
        </section>
    `;
}

function healthChainAge() {
    const age = getCalendarElapsedTime();
    return `${age.years}y ${age.days}d ${age.hours}h ${age.minutes}m ${age.seconds}s`;
}

function fetchChamberContinuity() {
    if (chamberContinuity && Date.now() - chamberContinuityAt < REFRESH_INTERVALS.scalar) return Promise.resolve(chamberContinuity);
    if (!chamberContinuityWork) chamberContinuityWork = fetchHeroStats().then(stats => {
        chamberContinuity = stats;
        chamberContinuityAt = Date.now();
        return stats;
    }).catch(() => chamberContinuity).finally(() => { chamberContinuityWork = null; });
    return chamberContinuityWork;
}

function renderContinuityProofPanel(data = {}) {
    const ownClock = !document.getElementById('uptime-counter');
    const stats = data.continuity || {};
    const runtimeHtml = document.getElementById('uptime-counter')?.innerHTML || escapeHtml(healthChainAge());
    const bakersText = document.getElementById('uptime-bakers')?.textContent || (Number.isFinite(stats.totalBakers) ? formatCount(stats.totalBakers) : '—');
    const observedFinality = document.getElementById('uptime-finality')?.textContent?.trim() || '';
    const finalityText = observedFinality && !/^(?:—|--|-)$/.test(observedFinality) ? observedFinality : (data.timing?.avgSeconds > 0 ? `~${Math.round(data.timing.avgSeconds * 2)}s` : '~12s');
    const stakedText = document.getElementById('uptime-staked')?.textContent || (Number.isFinite(stats.stakingRatio) ? `${stats.stakingRatio.toFixed(1)}%` : '—');
    const issuanceText = document.getElementById('uptime-issuance')?.textContent || (Number.isFinite(stats.currentIssuanceRate) ? `${stats.currentIssuanceRate.toFixed(2)}%` : '—');
    return `
        <section class="lb-panel health-panel health-continuity-panel chamber-anim-fade" id="health-chain-proof" aria-label="Tezos mainnet age and upgrade history" style="animation-delay:40ms">
            <div class="lb-panel-title">Mainnet Continuity <span class="lb-live-pill">chain age · upgrade history</span></div>
            <div class="health-continuity-runtime" id="chain-uptime-counter"${ownClock ? ' data-health-own-clock' : ''}>${runtimeHtml}</div>
            <p class="health-continuity-copy">Elapsed time since mainnet launch, paired with protocol upgrades adopted on-chain. This is a chain-age measure, not an availability percentage or incident ledger.</p>
            <div class="health-continuity-grid">
                <div>
                    <span>Bakers</span>
                    <strong id="chain-uptime-bakers">${escapeHtml(bakersText)}</strong>
                </div>
                <div>
                    <span>Finality</span>
                    <strong id="chain-uptime-finality">${escapeHtml(finalityText)}</strong>
                </div>
                <div>
                    <span>Staked</span>
                    <strong id="chain-uptime-staked">${escapeHtml(stakedText)}</strong>
                </div>
                <div>
                    <span>Issuance</span>
                    <strong id="chain-uptime-issuance">${escapeHtml(issuanceText)}</strong>
                </div>
            </div>
        </section>
    `;
}

function renderTimingPanel(data) {
    const onTargetPct = data.timing.intervalCount ? (data.timing.onTarget / data.timing.intervalCount) * 100 : 0;
    const cells = data.blocks.slice(0, -1).map((block) => {
        const cls = timingClass(block.intervalSeconds);
        return `
            <span class="health-timing-cell ${cls}" title="Block ${formatCount(block.level)} interval ${formatSeconds(block.intervalSeconds)}">
                ${formatSeconds(block.intervalSeconds)}
            </span>
        `;
    }).join('');

    return `
        <section class="lb-panel health-panel health-timing-panel chamber-anim-fade" style="animation-delay:60ms">
            <div class="lb-panel-title">Block Cadence <span class="lb-live-pill">target ${TARGET_BLOCK_SECONDS}s</span></div>
            <div class="lb-metric-grid health-metric-grid">
                <div><span>Average</span><strong id="health-avg-block">${formatSeconds(data.timing.avgSeconds)}</strong></div>
                <div><span>On target</span><strong id="health-on-target">${formatPct(onTargetPct)}%</strong></div>
                <div><span>Round 0</span><strong id="health-round-zero">${formatPct(data.timing.roundZeroPct)}%</strong></div>
            </div>
            <div class="health-timing-strip" id="health-timing-strip" aria-label="Recent block intervals">${cells}</div>
            <div class="health-timing-note" id="health-timing-note">Max round ${formatCount(data.timing.maxRound)} across the live sample.</div>
        </section>
    `;
}

function renderTeztaleReportRows(lens) {
    if (!lens.reportRows?.length) {
        return '<div class="health-consensus-empty">Teztale is still collecting enough consensus data for a round summary.</div>';
    }
    return lens.reportRows.map((row) => `
        <div class="health-consensus-event ${row.round > 0 || row.missingBlocks ? 'watch' : 'healthy'}">
            <span>#${formatCount(row.level)} · R${formatCount(row.round)}</span>
            <strong>${formatMilliseconds(row.quorumMs)} quorum</strong>
            <em>${row.missingBlocks ? `${formatCount(row.missingBlocks)} missing block report` : `${formatCount(row.sourceCount)} src · validation ${formatMilliseconds(row.validationDelayMs)}`}</em>
        </div>
    `).join('');
}

function formatTeztaleHistogramTick(value) {
    if (!Number.isFinite(value)) return '--';
    if (value % 1000 === 0) return `${value / 1000}s`;
    return `${(value / 1000).toFixed(1)}s`;
}

function renderTeztaleReceptionHistogram(lens) {
    const histogram = lens.receptionHistogram;
    if (!histogram?.bins?.length || !histogram.maxPower) {
        return '<div class="health-consensus-empty">Teztale is still collecting enough observer receptions for a propagation distribution.</div>';
    }
    const bins = histogram.bins.map((bin, index) => {
        const preHeight = bin.preattestationPower
            ? Math.max(5, (bin.preattestationPower / histogram.maxPower) * 100)
            : 0;
        const attHeight = bin.attestationPower
            ? Math.max(5, (bin.attestationPower / histogram.maxPower) * 100)
            : 0;
        const showTick = index % 2 === 0 || index === histogram.bins.length - 1;
        const range = bin.overflow
            ? `${formatTeztaleHistogramTick(bin.startMs)}+`
            : `${formatTeztaleHistogramTick(bin.startMs)}–${formatTeztaleHistogramTick(bin.endMs)}`;
        return `
            <div class="health-consensus-histogram-bin" role="listitem" aria-label="${escapeHtml(range)}: ${formatCount(bin.preattestationPower)} pre-attestation power, ${formatCount(bin.attestationPower)} attestation power">
                <div class="health-consensus-histogram-pair" aria-hidden="true">
                    <span class="pre" style="height:${preHeight.toFixed(2)}%"></span>
                    <span class="att" style="height:${attHeight.toFixed(2)}%"></span>
                </div>
                <small>${showTick ? escapeHtml(formatTeztaleHistogramTick(bin.startMs)) : ''}</small>
            </div>
        `;
    }).join('');
    return `
        <div class="health-consensus-histogram" role="list" aria-label="Earliest Teztale observer reception distribution in ${formatCount(histogram.binMs)} millisecond buckets" style="--health-consensus-bin-count:${histogram.bins.length}">
            ${bins}
        </div>
    `;
}

function renderTeztaleConsensusPanel(data) {
    const lens = data.teztaleLens || teztaleFallback();
    if (!lens.available) {
        return `
            <section class="lb-panel health-panel health-consensus-panel chamber-anim-fade unavailable" id="health-teztale-consensus" style="animation-delay:120ms">
                <div class="lb-panel-title">Consensus Lens <span class="lb-live-pill">Teztale</span></div>
                <div class="health-consensus-empty">
                    Teztale consensus data is unavailable right now; core TzKT health remains live.
                </div>
                <div class="health-consensus-credit">
                    Credit: <a href="${TEZTALE_SOURCE_URL}" target="_blank" rel="noopener">Teztale by Nomadic Labs</a>
                </div>
            </section>
        `;
    }

    const latest = lens.latest;
    const levelLabel = `#${formatCount(latest.level)} · R${formatCount(latest.round)}`;
    const headStatus = lens.pendingHeadLevel
        ? ` · head #${formatCount(lens.pendingHeadLevel)} collecting`
        : '';
    const coverageReport = [
        `${formatCount(lens.windowCount)} complete rounds`,
        `${formatCount(lens.sampleLevelCount)} sampled levels`,
        `${formatCount(latest.totalPower)} power`
    ].join(' / ');
    const rowsLabel = lens.reportMode === 'alerts' ? 'Rounds to inspect' : 'Recent complete rounds';

    return `
        <section class="lb-panel health-panel health-consensus-panel chamber-anim-fade" id="health-teztale-consensus" style="animation-delay:120ms">
            <div class="lb-panel-title">Consensus Lens <span class="lb-live-pill">Teztale</span></div>
            <div class="health-consensus-topline">
                <div class="health-consensus-hero ${lens.className}">
                    <strong id="health-teztale-quorum">${formatMilliseconds(latest.quorumMs)}</strong>
                    <span id="health-teztale-status">${escapeHtml(lens.label)} · 66⅔% attestation quorum at ${escapeHtml(levelLabel)}${escapeHtml(headStatus)}</span>
                </div>
                <div class="health-consensus-latest" aria-label="Latest complete Teztale round">
                    <div><span>Pre-quorum</span><strong id="health-teztale-prequorum">${formatMilliseconds(latest.preQuorumMs)}</strong></div>
                    <div><span>Validation</span><strong id="health-teztale-validation">${formatMilliseconds(latest.validationDelayMs)}</strong></div>
                    <div><span>Observers</span><strong id="health-teztale-source-count">${formatCount(latest.sourceCount)}</strong></div>
                </div>
            </div>

            <section class="health-consensus-propagation" id="health-teztale-propagation" aria-labelledby="health-teztale-propagation-title">
                <div class="health-consensus-section-head">
                    <div>
                        <strong id="health-teztale-propagation-title">Attestation reception / propagation</strong>
                        <span>Earliest Teztale observer reception · endorsing-power weighted · ${formatCount(lens.receptionHistogram?.binMs || TEZTALE_RECEPTION_BIN_MS)}ms buckets</span>
                    </div>
                    <div class="health-consensus-legend" aria-label="Reception distribution legend">
                        <span class="pre">Pre-attestations</span>
                        <span class="att">Attestations</span>
                    </div>
                </div>
                <div class="health-consensus-propagation-body">
                    ${renderTeztaleReceptionHistogram(lens)}
                    <div class="health-consensus-threshold-grid" aria-label="Average weighted-power arrival thresholds">
                        <div><span>Pre-att. 66⅔%</span><strong id="health-teztale-pre-66-avg">${formatMilliseconds(lens.avgPreQuorumMs)}</strong><small>window avg</small></div>
                        <div><span>Pre-att. 90%</span><strong id="health-teztale-pre-90-avg">${formatMilliseconds(lens.avgPre90Ms)}</strong><small>window avg</small></div>
                        <div><span>Att. 66⅔%</span><strong id="health-teztale-att-66-avg">${formatMilliseconds(lens.avgQuorumMs)}</strong><small>window avg</small></div>
                        <div><span>Att. 90%</span><strong id="health-teztale-att-90-avg">${formatMilliseconds(lens.avgQuorum90Ms)}</strong><small>window avg</small></div>
                    </div>
                </div>
                <p class="health-consensus-method">Observer lens, not a full peer-to-peer gossip trace: each operation is counted once at its earliest reception across the available Teztale observers.</p>
            </section>

            <div class="health-consensus-path" aria-label="Average consensus path timing">
                <div><span>Validation observed</span><strong>${formatMilliseconds(lens.avgValidationMs)}</strong><small>block timestamp → validation</small></div>
                <div><span>Validation → pre-quorum</span><strong>${formatMilliseconds(lens.avgValidationToPreQuorumMs)}</strong><small>66⅔% pre-attestation power</small></div>
                <div><span>Pre-quorum → quorum</span><strong>${formatMilliseconds(lens.avgPreQuorumToQuorumMs)}</strong><small>pre-att. → att. threshold</small></div>
                <div><span>Validation → quorum</span><strong>${formatMilliseconds(lens.avgValidationToQuorumMs)}</strong><small>66⅔% attestation power</small></div>
            </div>
            <div class="health-consensus-ops" id="health-teztale-ops">
                <span>Coverage</span>
                <strong>${escapeHtml(coverageReport)}</strong>
            </div>
            <div class="health-consensus-events-label">${escapeHtml(rowsLabel)}</div>
            <div class="health-consensus-events" id="health-teztale-events">
                ${renderTeztaleReportRows(lens)}
            </div>
            <div class="health-consensus-credit" id="health-teztale-credit">
                Powered by <a href="${escapeHtml(lens.sourceUrl)}" target="_blank" rel="noopener">Teztale consensus data</a>.
                Credit: <a href="${TEZTALE_SOURCE_URL}" target="_blank" rel="noopener">Nomadic Labs</a>.
            </div>
        </section>
    `;
}

function safeHttpsUrl(value) {
    try {
        const url = new URL(String(value || ''));
        return url.protocol === 'https:' ? url.href : '#';
    } catch {
        return '#';
    }
}

function formatNakamotoDate(value) {
    if (!value) return 'date unavailable';
    const timestamp = new Date(`${String(value).slice(0, 10)}T00:00:00Z`).getTime();
    if (!Number.isFinite(timestamp)) return String(value);
    return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC'
    }).format(timestamp);
}

function formatNakamotoObservedAt(value) {
    if (!value) return 'observation unavailable';
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return 'observation unavailable';
    return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

function nakamotoSourceSignature(sources) {
    return (sources || []).map((source) => [
        source.id,
        source.dataAsOf,
        ...(source.metrics || []).map((metric) => `${metric.key}:${metric.displayValue}:${metric.thresholdLabel}`)
    ].join(':')).join('|');
}

function renderNakamotoMetric(metric) {
    const population = Number.isFinite(Number(metric?.population)) && Number(metric.population) > 0
        ? `${formatCount(metric.population)} ${metric.populationLabel || 'participants'}`
        : '';
    return `
        <div class="health-nc-source-metric">
            <span>${escapeHtml(metric?.label || 'Reported NC')}</span>
            <strong>${escapeHtml(metric?.displayValue ?? metric?.value ?? '--')}</strong>
            <em>${escapeHtml(metric?.thresholdLabel || 'threshold unstated')}${population ? ` · ${escapeHtml(population)}` : ''}</em>
        </div>
    `;
}

function renderNakamotoHistoricalSnapshots(snapshots) {
    if (!snapshots?.length) return '';
    const links = snapshots.map((snapshot) => `
        <a href="${escapeHtml(safeHttpsUrl(snapshot.sourceUrl))}" target="_blank" rel="noopener">
            ${escapeHtml(snapshot.publisher)} ${escapeHtml(snapshot.value)} (${escapeHtml(formatNakamotoDate(snapshot.dataAsOf))})
        </a>
    `).join('<span aria-hidden="true">·</span>');
    return `
        <div class="health-nc-derived">
            <span>Chainspect-derived historical citations — not independent measurements:</span>
            ${links}
        </div>
    `;
}

function renderNakamotoSourceRows(sources) {
    if (!sources?.length) {
        return '<div class="lb-empty-inline">External Nakamoto source snapshots are unavailable; the live Tezos.Systems calculation remains independent.</div>';
    }
    return sources.map((source) => {
        const methodology = source.methodologyStatus === 'published'
            ? 'published method'
            : source.methodologyStatus === 'opaque'
                ? 'method opaque'
                : 'method unstated';
        return `
            <article class="health-nc-source-row">
                <div class="health-nc-source-identity">
                    <a href="${escapeHtml(safeHttpsUrl(source.sourceUrl))}" target="_blank" rel="noopener">${escapeHtml(source.name)} ↗</a>
                    <span>Snapshot ${escapeHtml(formatNakamotoDate(source.dataAsOf))}</span>
                    <em class="health-nc-method ${escapeHtml(source.methodologyStatus || 'unspecified')}">${escapeHtml(methodology)}</em>
                </div>
                <div class="health-nc-source-metrics">
                    ${(source.metrics || []).map(renderNakamotoMetric).join('')}
                </div>
                <div class="health-nc-source-basis">
                    <span><strong>Basis</strong> ${escapeHtml(source.resourceBasis || 'Not stated')}</span>
                    <span><strong>Actors</strong> ${escapeHtml(source.entityBasis || 'Not stated')}</span>
                    <span><strong>Window</strong> ${escapeHtml(source.window || 'Not stated')}</span>
                </div>
                ${renderNakamotoHistoricalSnapshots(source.historicalSnapshots)}
            </article>
        `;
    }).join('');
}

function renderNakamotoLiveMeta(live) {
    if (!live?.available) {
        return `<span>Current-cycle RPC unavailable; external snapshots are still shown.</span>`;
    }
    const status = live.stale
        ? live.error ? 'cached after RPC error' : 'cached current-cycle snapshot'
        : 'live current-cycle snapshot';
    return `
        <span>${formatCount(live.poweredDelegates)} powered delegate addresses · ${escapeHtml(status)} · ${escapeHtml(formatNakamotoObservedAt(live.observedAt))}</span>
        <a href="${escapeHtml(safeHttpsUrl(live.sourceUrl))}" target="_blank" rel="noopener">Octez RPC response ↗</a>
    `;
}

function renderNakamotoHelp() {
    return `
        <details class="lb-help health-nc-help">
            <summary class="lb-help-trigger" aria-label="Explain the Nakamoto Coefficient and why sources differ">?</summary>
            <div class="lb-help-popover" role="note">
                <strong>What this coefficient means</strong>
                <span>The Nakamoto Coefficient is the smallest number of the largest participants whose combined consensus power crosses a chosen threshold.</span>
                <strong>Why Tezos.Systems shows two</strong>
                <span><b>More than 33 1/3%</b> can withhold enough power to prevent a two-thirds quorum and halt finality; one-third is also Tenderbake's Byzantine fault bound.</span>
                <span><b>More than 66 2/3%</b> can form a quorum without honest participation. This is the stronger unilateral-control threshold often associated with conflicting-finality or double-spend scenarios.</span>
                <strong>Why the reports differ</strong>
                <span>Thresholds vary (33%, 50%, or 66%), as do snapshot dates, current-cycle power versus historical block production, and whether addresses are clustered into real operators.</span>
                <span>Our live result counts delegate addresses. It is not a verified count of independent organizations, so compare it only with that limitation visible.</span>
                <a href="${TENDERBAKE_DOCS_URL}" target="_blank" rel="noopener">Tenderbake consensus documentation →</a>
            </div>
        </details>
    `;
}

function renderNakamotoPrintDocument(nakamoto = {}) {
    const live = nakamoto.live || nakamotoLiveFallback();
    const oneThird = live.thresholds?.oneThird;
    const twoThirds = live.thresholds?.twoThirds;
    const sourceRows = (nakamoto.sources || []).map((source) => {
        const metrics = (source.metrics || []).map((metric) => `
            <span class="metric"><b>${escapeHtml(metric.label || 'Reported NC')} ${escapeHtml(metric.displayValue ?? metric.value ?? '--')}</b><small>${escapeHtml(metric.thresholdLabel || 'threshold unstated')}</small></span>
        `).join('');
        return `
            <article>
                <header><strong>${escapeHtml(source.name || 'Published source')}</strong><span>${escapeHtml(formatNakamotoDate(source.dataAsOf))}</span></header>
                <div class="metrics">${metrics || '<span class="metric"><b>--</b><small>No metric returned</small></span>'}</div>
                <p><b>Basis:</b> ${escapeHtml(source.resourceBasis || 'Not stated')} · <b>Actors:</b> ${escapeHtml(source.entityBasis || 'Not stated')} · <b>Window:</b> ${escapeHtml(source.window || 'Not stated')}</p>
            </article>
        `;
    }).join('');
    const liveStatus = live.available
        ? `${live.stale ? (live.error ? 'Cached after RPC error' : 'Cached current-cycle snapshot') : 'Live current-cycle snapshot'} · ${formatCount(live.poweredDelegates)} powered delegate addresses · ${formatNakamotoObservedAt(live.observedAt)}`
        : 'Current-cycle RPC calculation unavailable';
    return `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Tezos Nakamoto Coefficients · Tezos Systems</title>
    <style>
        *{box-sizing:border-box}body{margin:0;padding:36px;color:#152033;background:#fff;font:15px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{max-width:980px;margin:0 auto}header.brand{display:flex;justify-content:space-between;gap:20px;align-items:end;padding-bottom:16px;border-bottom:3px solid #0f8eb8}.eyebrow{color:#0f8eb8;font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}h1{margin:6px 0 0;font-size:34px;line-height:1.05}header.brand a{color:#0f8eb8;text-decoration:none;font-weight:800}.live-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:26px 0 10px}.live-card{padding:20px;border:1px solid #cbd6e2;border-left:5px solid #d8a900;border-radius:8px}.live-card.quorum{border-left-color:#0f8eb8}.live-card span,.live-card em,.live-card small{display:block}.live-card span{font-size:12px;font-weight:850;letter-spacing:.08em;text-transform:uppercase}.live-card strong{display:block;margin:8px 0;font-size:54px;line-height:1}.live-card em{font-style:normal;font-weight:750}.meta{margin:0 0 20px;color:#526175;font-size:13px}.warning{padding:14px 16px;border:1px solid #e7c65d;border-radius:7px;background:#fff9dc}.sources{margin-top:26px}.sources>h2{font-size:20px}.sources article{padding:14px 0;border-top:1px solid #dbe3eb}.sources article header{display:flex;justify-content:space-between;gap:12px}.sources article header span,.sources article p{color:#526175;font-size:12px}.metrics{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.metric{min-width:132px;padding:8px 10px;border:1px solid #dbe3eb;border-radius:5px}.metric b,.metric small{display:block}.metric small{color:#66758a}footer{margin-top:28px;padding-top:12px;border-top:1px solid #cbd6e2;color:#66758a;font-size:12px}@media(max-width:650px){body{padding:20px}.live-grid{grid-template-columns:1fr}header.brand{align-items:start;flex-direction:column}}@media print{body{padding:0}.warning,.live-card,.metric{break-inside:avoid}a{color:inherit}}
    </style>
</head>
<body>
<main>
    <header class="brand"><div><div class="eyebrow">Tezos Systems · Network Health</div><h1>Nakamoto Coefficients</h1></div><a href="https://tezos.systems/health/">tezos.systems/health/</a></header>
    <section class="live-grid" aria-label="Live current-cycle Nakamoto coefficients">
        <div class="live-card"><span>Halt / fault boundary</span><strong>${escapeHtml(oneThird?.count ?? '--')}</strong><em>&gt;33 1/3% of current-cycle power</em><small>${oneThird ? `${formatPct(oneThird.cumulativeShare)}% crossed by ${formatCount(oneThird.count)} addresses` : 'Live calculation unavailable'}</small></div>
        <div class="live-card quorum"><span>Unilateral quorum control</span><strong>${escapeHtml(twoThirds?.count ?? '--')}</strong><em>&gt;66 2/3% of current-cycle power</em><small>${twoThirds ? `${formatPct(twoThirds.cumulativeShare)}% crossed by ${formatCount(twoThirds.count)} addresses` : 'Live calculation unavailable'}</small></div>
    </section>
    <p class="meta">${escapeHtml(liveStatus)}</p>
    <p class="warning"><strong>Address-level result.</strong> This live calculation counts powered delegate addresses, not verified independent organizations. External values below retain their own threshold, resource, window, and entity basis and are not normalized.</p>
    <section class="sources"><h2>Other published numbers</h2>${sourceRows || '<p>No external source snapshots available.</p>'}</section>
    <footer>Generated from the Tezos Systems Network Health Chamber · Octez current-cycle baking-power distribution</footer>
</main>
</body>
</html>`;
}

function printNakamotoCoefficient(nakamoto = {}) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        window.print();
        return;
    }
    try {
        printWindow.opener = null;
    } catch {
        // Some browsers expose a read-only opener reference.
    }
    printWindow.document.open();
    printWindow.document.write(renderNakamotoPrintDocument(nakamoto));
    printWindow.document.close();
    window.setTimeout(() => {
        printWindow.focus();
        printWindow.print();
    }, 120);
}

async function shareNakamotoCoefficient(nakamoto = {}, button = null) {
    const live = nakamoto.live || nakamotoLiveFallback();
    const oneThird = live.thresholds?.oneThird;
    const twoThirds = live.thresholds?.twoThirds;
    const originalMarkup = button?.innerHTML || '';
    let card = null;
    try {
        if (button) {
            button.disabled = true;
            button.setAttribute('aria-busy', 'true');
            button.innerHTML = '<span aria-hidden="true">…</span> Building';
        }
        const { appendCardSeal, loadHtml2Canvas, showShareModal } = await import('../ui/share.js');
        await loadHtml2Canvas();
        const liveStatus = !live.available
            ? 'Current-cycle calculation unavailable'
            : live.stale
                ? 'Cached after current-cycle RPC error'
                : 'Live Octez current-cycle snapshot';
        const sourceCards = (nakamoto.sources || []).slice(0, 3).map((source) => {
            const metric = source.metrics?.[0];
            return `
                <div style="min-width:0;padding:14px 15px;border:1px solid rgba(77,212,255,.15);border-radius:10px;background:rgba(255,255,255,.035);">
                    <div style="color:rgba(220,235,249,.58);font-size:12px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(source.name || 'Published source')}</div>
                    <div style="margin:7px 0 3px;color:#f7fbff;font-size:27px;font-weight:900;">${escapeHtml(metric?.displayValue ?? metric?.value ?? '--')}</div>
                    <div style="color:rgba(220,235,249,.46);font-size:11px;line-height:1.3;">${escapeHtml(metric?.thresholdLabel || 'threshold unstated')} · ${escapeHtml(formatNakamotoDate(source.dataAsOf))}</div>
                </div>
            `;
        }).join('');

        card = document.createElement('div');
        card.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1200px;height:630px;padding:44px 52px 54px;background:#08111d;color:#f7fbff;border:1px solid rgba(77,212,255,.2);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-sizing:border-box;overflow:hidden;';
        card.innerHTML = `
            <div style="position:absolute;inset:0;background:radial-gradient(circle at 12% 10%,rgba(77,212,255,.13),transparent 36%),radial-gradient(circle at 88% 86%,rgba(80,232,136,.1),transparent 34%);pointer-events:none;"></div>
            <div style="position:relative;z-index:1;height:100%;display:grid;grid-template-columns:390px minmax(0,1fr);gap:42px;">
                <section style="display:flex;min-width:0;flex-direction:column;">
                    <div style="color:#4dd4ff;font-family:Orbitron,sans-serif;font-size:25px;font-weight:900;">TEZOS SYSTEMS</div>
                    <div style="width:210px;height:1px;margin:14px 0 28px;background:#4dd4ff;opacity:.7;"></div>
                    <div style="color:rgba(220,235,249,.48);font-size:12px;font-weight:850;text-transform:uppercase;">Network Health · Current cycle</div>
                    <h1 style="margin:11px 0 16px;color:#f7fbff;font-size:48px;line-height:1.02;">Nakamoto<br>Coefficients</h1>
                    <p style="margin:0;color:rgba(220,235,249,.66);font-size:18px;line-height:1.42;">How many of the largest delegate addresses cross Tezos consensus-power boundaries?</p>
                    <div style="margin-top:auto;color:rgba(220,235,249,.48);font-size:14px;line-height:1.45;">${escapeHtml(liveStatus)}<br><span style="color:#4dd4ff;font-weight:850;">tezos.systems/health/</span></div>
                </section>
                <section style="display:flex;min-width:0;flex-direction:column;gap:16px;">
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
                        <div style="padding:22px;border:1px solid rgba(245,214,91,.28);border-left:5px solid #f5d65b;border-radius:12px;background:rgba(245,214,91,.055);">
                            <div style="color:#f5d65b;font-size:12px;font-weight:900;text-transform:uppercase;">Halt / fault · &gt;33 1/3%</div>
                            <div style="margin:10px 0 8px;color:#f5d65b;font-size:68px;font-weight:900;line-height:1;">${escapeHtml(oneThird?.count ?? '--')}</div>
                            <div style="color:rgba(220,235,249,.58);font-size:13px;">${oneThird ? `${formatPct(oneThird.cumulativeShare)}% by ${formatCount(oneThird.count)} addresses` : 'Live calculation unavailable'}</div>
                        </div>
                        <div style="padding:22px;border:1px solid rgba(77,212,255,.28);border-left:5px solid #4dd4ff;border-radius:12px;background:rgba(77,212,255,.055);">
                            <div style="color:#4dd4ff;font-size:12px;font-weight:900;text-transform:uppercase;">Quorum control · &gt;66 2/3%</div>
                            <div style="margin:10px 0 8px;color:#4dd4ff;font-size:68px;font-weight:900;line-height:1;">${escapeHtml(twoThirds?.count ?? '--')}</div>
                            <div style="color:rgba(220,235,249,.58);font-size:13px;">${twoThirds ? `${formatPct(twoThirds.cumulativeShare)}% by ${formatCount(twoThirds.count)} addresses` : 'Live calculation unavailable'}</div>
                        </div>
                    </div>
                    <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;">${sourceCards}</div>
                    <div style="margin-top:auto;padding:14px 16px;border:1px solid rgba(245,214,91,.18);border-radius:9px;background:rgba(245,214,91,.045);color:rgba(220,235,249,.64);font-size:13px;line-height:1.42;"><strong style="color:#f7fbff;">Address-level, not entity-clustered.</strong> Published numbers use different thresholds, windows, and actor definitions; they are shown separately, not blended.</div>
                </section>
            </div>
        `;
        appendCardSeal(card);
        document.body.appendChild(card);
        const canvas = await window.html2canvas(card, {
            backgroundColor: '#08111d',
            scale: 1,
            useCORS: true,
            logging: false,
            width: 1200,
            height: 630,
            windowWidth: 1200
        });
        card.remove();
        card = null;

        const tweetOptions = live.available
            ? [
                { label: '🏛 Live thresholds', text: `Tezos live Nakamoto Coefficients: ${oneThird?.count ?? '--'} delegate addresses cross >33⅓% of current-cycle power; ${twoThirds?.count ?? '--'} cross >66⅔%. Address-level, not entity-clustered.\n\nhttps://tezos.systems/health/` },
                { label: '🧭 Distribution lens', text: `How concentrated is Tezos consensus power right now? Current-cycle address-level Nakamoto thresholds, with the methodology caveat kept visible.\n\nhttps://tezos.systems/health/` }
            ]
            : [
                { label: '🏛 Methodology view', text: 'Compare Tezos Nakamoto Coefficient reports without mixing thresholds, dates, windows, or address/entity definitions.\n\nhttps://tezos.systems/health/' }
            ];
        showShareModal(canvas, tweetOptions, 'Tezos Nakamoto Coefficients');
    } catch (error) {
        console.warn('Nakamoto coefficient share failed', error);
    } finally {
        if (card?.isConnected) card.remove();
        if (button) {
            button.disabled = false;
            button.removeAttribute('aria-busy');
            button.innerHTML = originalMarkup;
        }
    }
}

function wireNakamotoActions(panel, nakamoto = {}) {
    if (!panel) return;
    panel._nakamotoShareData = nakamoto;
    if (panel.dataset.healthNcActionsWired) return;
    panel.dataset.healthNcActionsWired = '1';
    panel.querySelector('#health-nc-print')?.addEventListener('click', (event) => {
        event.preventDefault();
        printNakamotoCoefficient(panel._nakamotoShareData || {});
    });
    panel.querySelector('#health-nc-share')?.addEventListener('click', (event) => {
        event.preventDefault();
        shareNakamotoCoefficient(panel._nakamotoShareData || {}, event.currentTarget);
    });
}

function renderNakamotoCoefficientPanel(data) {
    const nakamoto = data.nakamoto || {};
    const live = nakamoto.live || nakamotoLiveFallback();
    const oneThird = live.thresholds?.oneThird;
    const twoThirds = live.thresholds?.twoThirds;
    const sourceRows = renderNakamotoSourceRows(nakamoto.sources || []);
    return `
        <section class="lb-panel health-panel health-nakamoto-panel lb-panel-has-help chamber-anim-fade${live.available ? '' : ' unavailable'}" id="health-nakamoto-coefficient" style="animation-delay:130ms">
            <div class="lb-panel-title">
                Nakamoto Coefficients
                <span class="lb-live-pill">Octez current cycle</span>
                <span class="health-nc-actions" aria-label="Nakamoto coefficient sharing actions">
                    <button type="button" class="health-nc-action" id="health-nc-print" aria-label="Print the Nakamoto coefficient report"><span aria-hidden="true">⎙</span> Print</button>
                    <button type="button" class="health-nc-action share" id="health-nc-share" aria-label="Create a tweet-ready Nakamoto coefficient card"><span aria-hidden="true">𝕏</span> Tweet</button>
                </span>
                ${renderNakamotoHelp()}
            </div>
            <p class="health-nc-intro">Two live Tezos thresholds answer two different consensus questions. Third-party values stay separate because their methods are not interchangeable.</p>
            <div class="health-nc-current-grid" aria-label="Live Tezos.Systems Nakamoto coefficients">
                <div class="health-nc-current-card halt">
                    <span>Halt / fault boundary</span>
                    <strong id="health-nc-33">${oneThird?.count ?? '--'}</strong>
                    <em>&gt;33 1/3% of current-cycle power</em>
                    <small>${oneThird ? `${formatPct(oneThird.cumulativeShare)}% crossed by ${formatCount(oneThird.count)} addresses` : 'Live calculation unavailable'}</small>
                </div>
                <div class="health-nc-current-card quorum">
                    <span>Unilateral quorum control</span>
                    <strong id="health-nc-66">${twoThirds?.count ?? '--'}</strong>
                    <em>&gt;66 2/3% of current-cycle power</em>
                    <small>${twoThirds ? `${formatPct(twoThirds.cumulativeShare)}% crossed by ${formatCount(twoThirds.count)} addresses` : 'Live calculation unavailable'}</small>
                </div>
            </div>
            <div class="health-nc-live-meta" id="health-nc-live-meta">${renderNakamotoLiveMeta(live)}</div>
            <div class="health-nc-sources-head">
                <div>
                    <strong>Other published numbers</strong>
                    <span>Dated snapshots, shown with their own threshold and basis</span>
                </div>
                <span class="health-nc-snapshot-pill">not normalized</span>
            </div>
            <div class="health-nc-source-list" id="health-nc-source-list" data-health-signature="${escapeHtml(nakamotoSourceSignature(nakamoto.sources))}">
                ${sourceRows}
            </div>
            <p class="health-nc-footnote">Higher means more distributed only when threshold, resource, time window, and entity grouping match. These rows deliberately preserve the differences.</p>
        </section>
    `;
}

function updateNakamotoCoefficientPanel(data) {
    const panel = document.getElementById('health-nakamoto-coefficient');
    if (!panel) return;
    const nakamoto = data.nakamoto || {};
    const live = nakamoto.live || nakamotoLiveFallback();
    const oneThird = live.thresholds?.oneThird;
    const twoThirds = live.thresholds?.twoThirds;
    panel.classList.toggle('unavailable', !live.available);
    setTextIfChanged('#health-nc-33', oneThird?.count ?? '--');
    setTextIfChanged('#health-nc-66', twoThirds?.count ?? '--');
    const currentCards = panel.querySelectorAll('.health-nc-current-card');
    const currentValues = [oneThird, twoThirds];
    currentCards.forEach((card, index) => {
        const threshold = currentValues[index];
        const small = card.querySelector('small');
        if (small) {
            setTextIfChanged(small, threshold
                ? `${formatPct(threshold.cumulativeShare)}% crossed by ${formatCount(threshold.count)} addresses`
                : 'Live calculation unavailable', { pulse: false });
        }
    });
    setHtmlIfSignatureChanged(
        '#health-nc-live-meta',
        renderNakamotoLiveMeta(live),
        `${live.available}:${live.stale}:${live.observedAt}:${live.poweredDelegates}`
    );
    setHtmlIfSignatureChanged(
        '#health-nc-source-list',
        renderNakamotoSourceRows(nakamoto.sources || []),
        nakamotoSourceSignature(nakamoto.sources)
    );
    wireNakamotoActions(panel, nakamoto);
}

function renderOctezVersionRows(rows) {
    if (!rows?.length) return '<div class="health-consensus-empty">No Octez version distribution returned.</div>';
    return rows.slice(0, 5).map((row) => {
        const width = Math.max(2, Math.min(100, row.powerShare || 0));
        return `
            <div class="health-octez-version-row ${row.current ? 'current' : ''}">
                <div class="health-octez-version-main">
                    <strong>${escapeHtml(row.version)}</strong>
                    <span>${row.current ? 'Latest observed' : `${formatCount(row.bakerCount)} ${Number(row.bakerCount) === 1 ? 'baker' : 'bakers'}`}</span>
                </div>
                <div class="health-octez-version-meter" aria-hidden="true"><span style="width:${width.toFixed(2)}%"></span></div>
                <div class="health-octez-version-share">
                    <strong>${formatPct(row.powerShare)}%</strong>
                    <span>${formatBakingPower(row.power)}</span>
                </div>
            </div>
        `;
    }).join('');
}

function renderOctezLaggardRows(rows) {
    if (!rows?.length) {
        return '<div class="lb-empty-inline">All known baking power is on the latest observed Octez version.</div>';
    }
    return rows.map((baker) => `
        <div class="lb-table-row health-octez-laggard-row">
            <div class="lb-baker-cell">${bakerLinks(baker.address, bakerName(baker))}</div>
            <strong>${escapeHtml(baker.software.version)}</strong>
            <span>${formatBakingPower(baker.bakingPower)}</span>
        </div>
    `).join('');
}

function renderOctezVersionsPanel(data) {
    const versions = data.octezVersions || octezVersionsFallback();
    if (!versions.available) {
        return `
            <section class="lb-panel health-panel health-octez-panel chamber-anim-fade unavailable" id="health-octez-versions" style="animation-delay:135ms">
                <div class="lb-panel-title">Octez Versions <span class="lb-live-pill">TzKT delegates</span></div>
                <div class="health-consensus-empty">
                    Baker Octez version telemetry is unavailable right now; block and consensus health remain live.
                </div>
            </section>
        `;
    }

    return `
        <section class="lb-panel health-panel health-octez-panel chamber-anim-fade" id="health-octez-versions" style="animation-delay:135ms">
            <div class="lb-panel-title">Octez Versions <span class="lb-live-pill">TzKT delegates</span></div>
            <div class="health-octez-hero ${versions.className}">
                <strong id="health-octez-current">${escapeHtml(versions.latestVersion)}</strong>
                <span id="health-octez-status">${escapeHtml(versions.label)} · latest observed on ${formatPct(versions.latestPowerShare)}% of baking power</span>
            </div>
            <div class="lb-metric-grid health-metric-grid health-octez-metrics">
                <div><span>Latest power</span><strong id="health-octez-latest-power">${formatPct(versions.latestPowerShare)}%</strong></div>
                <div><span>Known bakers</span><strong id="health-octez-known">${formatCount(versions.knownBakers)} / ${formatCount(versions.totalBakers)}</strong></div>
                <div><span>Freshest report</span><strong id="health-octez-updated"${healthAgeAttr(versions.freshestDate)}>${formatAge(versions.freshestDate)}</strong></div>
            </div>
            <div class="health-octez-version-list" id="health-octez-version-list">
                ${renderOctezVersionRows(versions.versionRows)}
            </div>
            <div class="health-consensus-events-label">Largest not on latest observed</div>
            <div class="lb-table health-octez-laggard-table">
                <div class="lb-table-head"><span>Baker</span><span>Version</span><span>Power</span></div>
                <div id="health-octez-laggards">${renderOctezLaggardRows(versions.laggingBakers)}</div>
            </div>
            <div class="health-timing-note">TzKT delegate software reports observed baker node versions; use it as upgrade-readiness telemetry, not a formal protocol requirement.</div>
        </section>
    `;
}

function renderMyTezosBakerPanel(data) {
    const baker = summarizeMyTezosBaker(data);
    if (!baker) return '';

    return `
        <section class="lb-panel health-panel health-my-baker-panel chamber-anim-fade" id="health-my-baker-panel" style="animation-delay:120ms">
            <div class="health-my-baker-head">
                <div>
                    <div class="lb-panel-title">My Tezos Baker</div>
                    <div class="health-my-baker-name" id="health-my-baker-name">${bakerLinks(baker.address, baker.name)}</div>
                </div>
                <span class="health-my-baker-status ${baker.className}" id="health-my-baker-status">${escapeHtml(baker.label)}</span>
            </div>
            <p class="health-my-baker-copy" id="health-my-baker-copy">${escapeHtml(baker.copy)}</p>
            <div class="lb-metric-grid health-metric-grid health-my-baker-metrics">
                <div><span>Attestation misses</span><strong id="health-my-baker-attestations">${formatCount(baker.missedSlots)}</strong></div>
                <div><span>Block misses</span><strong id="health-my-baker-blocks">${formatCount(baker.missedBlockCount)}</strong></div>
                <div><span>Latest block</span><strong id="health-my-baker-latest">${baker.latestBlock ? formatCount(baker.latestBlock.level) : 'Not in sample'}</strong></div>
            </div>
        </section>
    `;
}

function renderAttesterRows(attesters) {
    if (!attesters.length) return '<div class="lb-empty-inline">No missed attestations in the current block sample.</div>';
    return attesters.slice(0, 12).map((item) => `
        <div class="lb-table-row health-attester-row" data-health-baker="${escapeHtml(item.address)}">
            <div class="lb-baker-cell">${bakerLinks(item.address, item.name)}</div>
            <span>${formatCount(item.slots)}</span>
            <span>${formatCount(item.latestLevel)} · <span${healthAgeAttr(item.latestTimestamp)}>${escapeHtml(formatAge(item.latestTimestamp))}</span></span>
        </div>
    `).join('');
}

function renderMissedAttestationsPanel(data) {
    const missedPower = data.missedAttestations.reduce((sum, item) => sum + item.slots, 0);
    return `
        <section class="lb-panel health-panel health-missed-attestations chamber-anim-fade" style="animation-delay:180ms">
            <div class="lb-panel-title">Missed Attestations</div>
            <div class="lb-metric-grid health-metric-grid">
                <div><span>Missed power</span><strong>${formatCount(missedPower)}</strong></div>
                <div><span>Attesters</span><strong>${formatCount(data.missedAttesters.length)}</strong></div>
                <div><span>Rows</span><strong>${formatCount(data.missedAttestations.length)}</strong></div>
            </div>
            <div class="lb-table health-attester-table">
                <div class="lb-table-head"><span>Baker</span><span>Power</span><span>Latest miss</span></div>
                <div id="health-missed-attester-list">${renderAttesterRows(data.missedAttesters)}</div>
            </div>
        </section>
    `;
}

function renderMissedBlockRows(missedBlocks) {
    if (!missedBlocks.length) return '<div class="lb-empty-inline">No missed baking rights in the recent lookback.</div>';
    return missedBlocks.slice(0, 12).map((right) => `
        <div class="lb-table-row health-missed-block-row" data-health-level="${Number(right.level) || 0}">
            <span>${formatCount(right.level)}</span>
            <span>${right.round === null ? '--' : `R${formatCount(right.round)}`}</span>
            <div class="lb-baker-cell">${bakerLinks(right.baker?.address, bakerName(right.baker))}</div>
        </div>
    `).join('');
}

function renderMissedBlocksPanel(data) {
    return `
        <section class="lb-panel health-panel health-missed-blocks chamber-anim-fade" style="animation-delay:240ms">
            <div class="lb-panel-title">Missed Blocks</div>
            <div class="lb-panel-subtitle">Last ${formatCount(MISSED_BLOCK_LOOKBACK)} levels ending at head.</div>
            <div class="lb-table health-missed-block-table">
                <div class="lb-table-head"><span>Level</span><span>Round</span><span>Baker</span></div>
                <div id="health-missed-block-list">${renderMissedBlockRows(data.missedBlocks)}</div>
            </div>
        </section>
    `;
}

function renderActivityTapePanel(data) {
    const rows = collapseActivityRows(data.activityTape || [], 8);
    const body = rows.length ? rows.map((row) => `
        <a class="lb-table-row health-activity-row" href="https://tzkt.io/${escapeHtml(row.hash)}" target="_blank" rel="noopener">
            <span>${escapeHtml(activityMethodLabel(row))}</span>
            <span>${row.amount === null ? '--' : `${formatCount(Math.round(row.amount))} XTZ`}</span>
            <span>${escapeHtml(row.target)}</span>
            <span${healthAgeAttr(row.timestamp)}>${escapeHtml(formatAge(row.timestamp))}</span>
        </a>
    `).join('') : '<div class="lb-empty-inline">No large transfers returned in the live sample.</div>';

    return `
        <section class="lb-panel health-panel health-activity-panel chamber-anim-fade" style="animation-delay:300ms">
            <div class="lb-panel-title">Live Activity Tape <span class="lb-live-pill">1,000+ XTZ</span></div>
            <div class="lb-table health-activity-table">
                <div class="lb-table-head"><span>Method</span><span>Amount</span><span>Target</span><span>Age</span></div>
                <div id="health-activity-list">${body}</div>
            </div>
        </section>
    `;
}

function renderRoundBadge(block) {
    const cls = block.blockRound === 0 ? 'round-zero' : (block.blockRound === 1 ? 'round-watch' : 'round-late');
    const title = block.payloadRound !== block.blockRound
        ? `block round ${block.blockRound}, payload round ${block.payloadRound}`
        : `round ${block.blockRound}`;
    return `<span class="health-round-badge ${cls}" title="${escapeHtml(title)}">R${formatCount(block.blockRound)}</span>`;
}

function renderHealthBlockActivitySetup() {
    return `
        <div class="live-head-filter health-block-filter">
            <button class="live-head-filter-toggle health-block-filter-toggle" id="health-block-filter-toggle" data-live-head-filter-toggle type="button" aria-expanded="false" aria-controls="health-block-filter-menu" aria-label="Choose visible block activity">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M7 14v6"/></svg>
                <span>Setup</span>
            </button>
            <div class="live-head-filter-menu health-block-filter-menu" id="health-block-filter-menu" data-live-head-filter-menu hidden>
                <div class="live-head-filter-heading">Block activity <small>Choose which normal receipts can spend the right-hand rail. Gas, missed attesters, evidence, milestones, and baker changes stay visible.</small></div>
                <button class="live-head-filter-my-tezos" type="button" data-live-head-my-tezos-toggle aria-pressed="false">
                    <span>Only My Tezos blocks</span>
                    <small>Produced by or carrying activity from a saved address.</small>
                    <em data-live-head-my-tezos-count>All</em>
                </button>
                <button class="live-head-filter-all" type="button" data-live-head-filter-kind="all" aria-pressed="true">All activity</button>
                <div class="live-head-filter-options">
                    <button class="live-head-filter-pill is-l1-vote" type="button" data-live-head-filter-kind="l1-vote" aria-pressed="true">L1 voting</button>
                    <button class="live-head-filter-pill is-l2-vote" type="button" data-live-head-filter-kind="l2-vote" aria-pressed="true">L2 voting</button>
                    <button class="live-head-filter-pill is-etherlink" type="button" data-live-head-filter-kind="etherlink" aria-pressed="true">Etherlink / Tezos X</button>
                    <button class="live-head-filter-pill is-dal" type="button" data-live-head-filter-kind="dal" aria-pressed="true">DAL</button>
                    <button class="live-head-filter-pill is-art" type="button" data-live-head-filter-kind="art" aria-pressed="true">Art</button>
                    <button class="live-head-filter-pill is-defi" type="button" data-live-head-filter-kind="defi" aria-pressed="true">DeFi</button>
                    <button class="live-head-filter-pill is-gaming" type="button" data-live-head-filter-kind="gaming" aria-pressed="true">Gaming</button>
                    <button class="live-head-filter-pill is-bridge" type="button" data-live-head-filter-kind="bridge" aria-pressed="true">Bridge</button>
                    <button class="live-head-filter-pill is-domains" type="button" data-live-head-filter-kind="domains" aria-pressed="true">Domains</button>
                    <button class="live-head-filter-pill is-stake" type="button" data-live-head-filter-kind="stake" aria-pressed="true">Stake</button>
                    <button class="live-head-filter-pill is-unstake" type="button" data-live-head-filter-kind="unstake" aria-pressed="true">Unstake</button>
                    <button class="live-head-filter-pill is-delegate" type="button" data-live-head-filter-kind="delegate" aria-pressed="true">Delegation</button>
                    <button class="live-head-filter-pill is-tokens" type="button" data-live-head-filter-kind="tokens" aria-pressed="true">Tokens</button>
                    <button class="live-head-filter-pill is-contract" type="button" data-live-head-filter-kind="contract" aria-pressed="true">Contracts</button>
                    <button class="live-head-filter-pill is-transfers" type="button" data-live-head-filter-kind="transfers" aria-pressed="true">Transfers</button>
                    <button class="live-head-filter-pill is-calls" type="button" data-live-head-filter-kind="calls" aria-pressed="true">Calls</button>
                </div>
            </div>
        </div>
    `;
}

function recentBlockReceiptState(block) {
    const activity = heartbeatActivityCache.get(Number(block.level)) || null;
    const details = buildLiveHeadDetails(block, activity);
    const gas = liveHeadGasState(activity);
    return {
        activity,
        details,
        signature: `${Number(block.level) || 0}:${details.signature}:${gas.signature}`
    };
}

function renderRecentBlockReceipts(block) {
    const state = recentBlockReceiptState(block);
    return `
        <div class="health-block-receipts" data-health-block-receipts data-quiet-key="health-block-receipts-${Number(block.level) || 0}" data-health-receipt-signature="${escapeHtml(state.signature)}" aria-label="Block ${formatCount(block.level)} receipts">
            ${renderLiveHeadActivityStatus(state.activity)}
            ${state.details.html}
        </div>
    `;
}

function renderRecentBlockRow(block, { isNew = false, savedAddresses = null } = {}) {
        const cls = healthClass(block.score);
        const timeCls = timingClass(block.intervalSeconds);
        const personal = liveHeadMyTezosRowPresentation(
            Number(block.level) || 0,
            block.producer?.address || '',
            savedAddresses || savedMyTezosAddressSet()
        );
        const personalClass = personal.filtered ? ' is-my-tezos-filtered-out' : '';
        const personalHidden = personal.filtered ? ' aria-hidden="true"' : '';
        return `
            <div class="lb-table-row health-block-row${isNew ? ' lb-row-new' : ''}${personalClass}" data-health-level="${Number(block.level) || 0}" data-producer-address="${escapeHtml(block.producer?.address || '')}" data-my-tezos-block-state="${personal.state}"${personalHidden}>
                <span class="health-block-level">${formatCount(block.level)}</span>
                <span class="health-interval ${timeCls}">${formatSeconds(block.intervalSeconds)}</span>
                <span>${renderRoundBadge(block)}</span>
                <span class="health-power ${cls}">${formatCount(block.power)}<small>/${formatCount(block.committee)}</small></span>
                <span>${formatCount(block.missedPower)}</span>
                <div class="lb-baker-cell">${bakerLinks(block.producer?.address, bakerName(block.producer))}</div>
                ${renderRecentBlockReceipts(block)}
            </div>
        `;
}

function renderRecentBlockRows(blocks, { markLatest = true } = {}) {
    const savedAddresses = savedMyTezosAddressSet();
    return blocks.map((block, index) => renderRecentBlockRow(block, {
        isNew: markLatest && index === 0,
        savedAddresses
    })).join('');
}

function updateRecentBlockReceipt(block) {
    const level = Number(block?.level);
    if (!Number.isFinite(level)) return;
    const row = document.querySelector(`#health-recent-block-list .health-block-row[data-health-level="${level}"]`);
    const receipt = row?.querySelector('[data-health-block-receipts]');
    if (!row || !receipt) return;
    const next = recentBlockReceiptState(block);
    if (receipt.dataset.healthReceiptSignature === next.signature) {
        fitLiveHeadPills(row);
        return;
    }
    quietlySyncElement(receipt, renderRecentBlockReceipts(block));
    fitLiveHeadPills(row);
    syncLiveHeadMyTezosRows();
}

function requestRecentBlockSupplements(blocks) {
    recentBlockSupplementBlocks = (Array.isArray(blocks) ? blocks : []).slice(0, CHAMBER_BLOCK_LIMIT);
    if (recentBlockSupplementInFlight) {
        recentBlockSupplementQueued = true;
        return;
    }
    const recent = recentBlockSupplementBlocks.slice(0, liveHeadExpanded ? expandedChamberBlockLimit() : compactChamberBlockLimit());
    const latest = recent[0];
    if (!latest || !heartbeatSupplementIsCurrent(latest) || document.visibilityState !== 'visible') return;
    recentBlockSupplementInFlight = true;

    const chamberIsCurrent = () => {
        const overlay = document.getElementById('network-health-modal');
        const renderedLevel = Number(document.querySelector('#health-recent-block-list .health-block-row')?.dataset.healthLevel);
        return document.visibilityState === 'visible' && overlay?.classList.contains('active') && renderedLevel === Number(latest.level);
    };
    const refreshBlock = (block) => {
        if (chamberIsCurrent()) updateRecentBlockReceipt(block);
    };

    const missedRights = Promise.allSettled([fetchHeartbeatMissedRights(recent), fetchHeartbeatBakingMisses(recent)]).then(() => {
        if (chamberIsCurrent()) recent.forEach(updateRecentBlockReceipt);
    });
    (async () => {
        const l1VotingCoverage = await fetchHeartbeatL1Voting(recent);
        for (const block of recent) {
            await fetchHeartbeatActivity(Number(block.level), { block, l1VotingCoverage });
            refreshBlock(block);
        }
        await missedRights;
    })().finally(() => {
        recentBlockSupplementInFlight = false;
        if (!recentBlockSupplementQueued) return;
        recentBlockSupplementQueued = false;
        requestRecentBlockSupplements(recentBlockSupplementBlocks);
    });
}

function renderRecentBlocksPanel(data) {
    return `
        <section class="lb-panel health-panel health-recent-blocks chamber-anim-fade" style="animation-delay:300ms">
            <div class="lb-panel-title health-recent-blocks-title">
                <span>Passing Blocks</span>
                <span class="lb-live-pill">live</span>
                <span class="health-recent-blocks-actions">
                    ${renderHealthBlockActivitySetup()}
                    <button class="health-block-depth-toggle" id="health-block-depth-toggle" type="button" aria-label="Show all ${expandedChamberBlockLimit()} Passing Blocks" aria-controls="health-recent-block-list" aria-expanded="false" title="Show all ${expandedChamberBlockLimit()} Passing Blocks">
                        <span data-health-block-depth-count>${compactChamberBlockLimit()} blocks</span>
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
                        <span class="health-block-depth-sr" data-health-block-depth-action>Show all ${expandedChamberBlockLimit()} Passing Blocks</span>
                    </button>
                </span>
            </div>
            <div class="lb-table health-block-table">
                <div class="lb-table-head"><span>Level</span><span>Delta</span><span>Round</span><span>Attested</span><span>Missed</span><span>Baker</span><span>Receipts</span></div>
                <div id="health-recent-block-list">${renderRecentBlockRows(data.blocks)}</div>
            </div>
        </section>
    `;
}

function isMaterialMissedPower(block) {
    const missedPower = Number(block?.missedPower || 0);
    const committee = Number(block?.committee || 0);
    if (missedPower <= 0) return false;
    return missedPower >= 100 || (committee > 0 && missedPower / committee >= 0.01);
}

function latestIncident(data) {
    const roundIncident = data.blocks.find((block) => block.blockRound > 0 || isMaterialMissedPower(block));
    const missedBlock = data.missedBlocks[0] || null;
    const incidents = [
        roundIncident ? {
            label: roundIncident.blockRound > 0 ? `round-${roundIncident.blockRound} block` : `${formatCompactPower(roundIncident.missedPower)} missed power`,
            timestamp: roundIncident.timestamp,
            detail: `block ${formatCount(roundIncident.level)}`
        } : null,
        missedBlock ? {
            label: 'missed baking right',
            timestamp: missedBlock.timestamp,
            detail: `level ${formatCount(missedBlock.level)}`
        } : null
    ].filter(Boolean).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return incidents[0] || null;
}

function renderIncidentMemoryPanel(data) {
    const incident = latestIncident(data);
    const roundBlocks = data.blocks.filter((block) => block.blockRound > 0).length;
    const missedPowerBlocks = data.blocks.filter(isMaterialMissedPower).length;
    return `
        <section class="lb-panel health-panel health-incident-panel chamber-anim-fade" id="health-incident-memory" style="animation-delay:90ms">
            <div class="lb-panel-title">Consensus Anomaly Memory</div>
            <div class="lb-metric-grid health-metric-grid">
                <div><span>Last anomaly</span><strong>${incident ? escapeHtml(formatAge(incident.timestamp)) : 'None in sample'}</strong></div>
                <div><span>Round > 0</span><strong>${formatCount(roundBlocks)}</strong></div>
                <div><span>Material missed power</span><strong>${formatCount(missedPowerBlocks)}</strong></div>
            </div>
            <div class="health-timing-note">${incident ? `${escapeHtml(incident.label)} at ${escapeHtml(incident.detail)}` : 'The current sample has no round delay, missed baking right, or block with at least 1% committee power missed.'}</div>
        </section>
    `;
}

function renderPeriodTelemetryPanel(data) {
    const periods = data.periods || [];
    const rows = periods.length ? periods.map((period) => `
        <div class="health-uptime-cell ${healthClass(period.score)}" title="${escapeHtml(period.label)} ${formatPct(period.score)}%">
            <span>${escapeHtml(period.label)}</span>
            <strong>${formatPct(period.score)}%</strong>
        </div>
    `).join('') : '<div class="lb-empty-inline">Period health cache is warming up.</div>';
    return `
        <section class="lb-panel health-panel health-period-panel chamber-anim-fade" id="health-period-telemetry" style="animation-delay:150ms">
            <div class="lb-panel-title">Period Telemetry</div>
            <div class="health-uptime-strip">${rows}</div>
            <div class="lb-metric-grid health-metric-grid">
                <div><span>24h score</span><strong>${periods[0] ? `${formatPct(periods[0].score)}%` : '--'}</strong></div>
                <div><span>7d score</span><strong>${periods[1] ? `${formatPct(periods[1].score)}%` : '--'}</strong></div>
                <div><span>31d score</span><strong>${periods[2] ? `${formatPct(periods[2].score)}%` : '--'}</strong></div>
            </div>
            <div class="health-timing-note">Status-page style period memory from sampled TzKT block ranges.</div>
        </section>
    `;
}

function renderNetworkLoadPanel(data) {
    const tape = data.activityTape || [];
    const totalAmount = tape.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
    const methods = new Set(tape.map((row) => row.method).filter(Boolean));
    return `
        <section class="lb-panel health-panel health-load-panel chamber-anim-fade" id="health-network-load" style="animation-delay:210ms">
            <div class="lb-panel-title">Network Load</div>
            <div class="lb-metric-grid health-metric-grid">
                <div><span>Large tx rows</span><strong>${formatCount(tape.length)}</strong></div>
                <div><span>Large XTZ moved</span><strong>${formatCompactPower(totalAmount)} XTZ</strong></div>
                <div><span>Methods</span><strong>${formatCount(methods.size)}</strong></div>
            </div>
            <div class="health-timing-note">This is the chamber live-tape sample for 1,000+ XTZ transfers, not a full mempool.</div>
        </section>
    `;
}

function renderNetworkHealthChamber(data, container) {
    const latest = data.blocks[0] || null;
    const headTimestamp = getHeadTimestamp(data);
    const headAge = latest
        ? `<span${healthAgeAttr(headTimestamp)}>${escapeHtml(formatAge(headTimestamp))}</span>`
        : '';
    const status = chamberStatus(data);
    container.innerHTML = `
        <div class="chamber-header lb-header health-header chamber-anim-fade">
            <div class="lb-system-strip">
                <span class="lb-system-brand">Tezos.Systems</span>
                <span>Network Health</span>
                <span>Live consensus feed</span>
            </div>
            <div class="chamber-title-row">
                <h2 class="chamber-title">Network Health Chamber</h2>
                <span class="chamber-badge ${status.className}" id="health-header-badge">${escapeHtml(status.label)}</span>
                <span class="lb-live-pill lb-refresh-pill" id="health-refresh-state">auto-refresh ${Math.round(CHAMBER_REFRESH_INTERVAL / 1000)}s</span>
            </div>
            <div class="chamber-proposal-info">
                <div class="proposal-name">Immediate block and consensus health</div>
                <div class="proposal-hash" id="health-head-meta">${latest ? `Head block ${formatCount(latest.level)} · ${headAge} · avg ${formatSeconds(data.timing.avgSeconds)}` : 'Live TzKT block feed'}</div>
            </div>
        </div>
        ${renderHealthVerdictPanel(data)}
        <section class="lb-explainer health-explainer chamber-anim-fade">
            <div class="lb-explainer-main">
                <div class="lb-explainer-kicker">Right now</div>
                <p><strong>Immediate health</strong> follows block cadence, consensus round, and attestation power as each new Tezos block lands.</p>
            </div>
            <div class="lb-explainer-facts" aria-label="Network health quick facts">
                <span><strong>Cadence</strong> ${TARGET_BLOCK_SECONDS}s target</span>
                <span><strong>Round</strong> R0 ideal</span>
                <span><strong>Power</strong> ${formatCount(POWER_PER_BLOCK)} per block</span>
            </div>
        </section>
        ${renderContinuityProofPanel(data)}
        ${renderCycleTimingPanel(data)}
        <div class="lb-dashboard-grid health-dashboard-grid">
            ${renderHealthScorePanel(data)}
            ${renderTimingPanel(data)}
            ${renderNakamotoCoefficientPanel(data)}
            ${renderTeztaleConsensusPanel(data)}
            ${renderOctezVersionsPanel(data)}
            ${renderIncidentMemoryPanel(data)}
            ${renderPeriodTelemetryPanel(data)}
            ${renderNetworkLoadPanel(data)}
            ${renderMyTezosBakerPanel(data)}
            ${renderMissedAttestationsPanel(data)}
            ${renderActivityTapePanel(data)}
            ${renderMissedBlocksPanel(data)}
        </div>
        ${renderRecentBlocksPanel(data)}
        <div class="chamber-footer chamber-anim-fade" style="animation-delay:360ms">
            <a href="https://tzkt.io/blocks" target="_blank" rel="noopener">TzKT Blocks →</a>
            <span class="chamber-footer-sep">·</span>
            <a href="https://tzkt.io/rights" target="_blank" rel="noopener">TzKT Rights →</a>
            <span class="chamber-footer-sep">·</span>
            <a href="${TEZTALE_REPORT_URL}" target="_blank" rel="noopener">Teztale by Nomadic Labs →</a>
            <span class="chamber-footer-sep">·</span>
            <a class="panel-direct-link" href="/health/" aria-label="Direct link to Network Health Chamber">Direct: /health/</a>
        </div>
    `;
    container.dataset.healthRendered = 'true';
    wireHealthBlockDepthControl(container);
    wireLiveHeadActivityFilter(container.querySelector('.health-block-filter'));
    syncLiveHeadMyTezosRows();
    wireNakamotoActions(container.querySelector('#health-nakamoto-coefficient'), data.nakamoto || {});
    initHealthBakerProfileLinks(container);
    refreshHealthAgeLabels(container);
    window.requestAnimationFrame(() => fitLiveHeadPills(container));
    window.setTimeout(() => requestRecentBlockSupplements(data.blocks), 500);
}

function updateHealthHeader(data) {
    const latest = data.blocks[0] || null;
    const headTimestamp = getHeadTimestamp(data);
    const headAge = latest
        ? `<span${healthAgeAttr(headTimestamp)}>${escapeHtml(formatAge(headTimestamp))}</span>`
        : '';
    const status = chamberStatus(data);
    const badge = document.getElementById('health-header-badge');
    if (badge) {
        setTextIfChanged(badge, status.label);
        badge.className = `chamber-badge ${status.className}`;
    }
    setTextIfChanged('#health-refresh-state', `auto-refresh ${Math.round(CHAMBER_REFRESH_INTERVAL / 1000)}s`, { pulse: false });
    const metaHtml = latest
        ? `Head block ${formatCount(latest.level)} · ${headAge} · avg ${formatSeconds(data.timing.avgSeconds)}`
        : 'Live TzKT block feed';
    setHtmlIfSignatureChanged(
        '#health-head-meta',
        metaHtml,
        `${latest?.level || 0}:${headTimestamp || ''}:${formatSeconds(data.timing.avgSeconds)}`
    );
}

function updateHealthScorePanel(data) {
    const cls = healthClass(data.summary.score);
    const width = Math.max(2, Math.min(100, data.summary.score));
    const headTimestamp = getHeadTimestamp(data);
    setTextIfChanged('#health-hero-score', `${formatPct(data.summary.score)}%`);
    setClassNameIfChanged('#health-hero-score', `health-hero-number ${cls}`);
    setTextIfChanged('#health-hero-copy', `Last ${formatCount(data.summary.count)} blocks recorded ${formatCompactPower(data.summary.totalPower)} / ${formatCompactPower(data.summary.totalCommittee)} attestation power.`, { pulse: false });
    const fill = document.getElementById('health-score-fill');
    if (fill) {
        fill.className = `health-score-fill ${cls}`;
        fill.style.width = `${width.toFixed(2)}%`;
    }
    setTextIfChanged('#health-summary-missed', formatCompactPower(data.summary.missingPower));
    setTextIfChanged('#health-summary-range', `${formatCount(data.oldestLevel)} → ${formatCount(data.headLevel)}`);
    const updated = document.getElementById('health-summary-updated');
    if (updated) {
        updated.dataset.healthAge = headTimestamp || '';
        setTextIfChanged(updated, formatAge(headTimestamp), { pulse: false });
    }
}

function updateHealthTimingPanel(data) {
    const onTargetPct = data.timing.intervalCount ? (data.timing.onTarget / data.timing.intervalCount) * 100 : 0;
    const cells = data.blocks.slice(0, -1).map((block) => {
        const cls = timingClass(block.intervalSeconds);
        return `
            <span class="health-timing-cell ${cls}" title="Block ${formatCount(block.level)} interval ${formatSeconds(block.intervalSeconds)}">
                ${formatSeconds(block.intervalSeconds)}
            </span>
        `;
    }).join('');
    setTextIfChanged('#health-avg-block', formatSeconds(data.timing.avgSeconds));
    setTextIfChanged('#health-on-target', `${formatPct(onTargetPct)}%`);
    setTextIfChanged('#health-round-zero', `${formatPct(data.timing.roundZeroPct)}%`);
    setHtmlIfSignatureChanged(
        '#health-timing-strip',
        cells,
        data.blocks.slice(0, -1).map((block) => `${block.level}:${formatSeconds(block.intervalSeconds)}`).join('|')
    );
    setTextIfChanged('#health-timing-note', `Max round ${formatCount(data.timing.maxRound)} across the live sample.`, { pulse: false });
}

function updateMyTezosBakerPanel(data) {
    const baker = summarizeMyTezosBaker(data);
    const panel = document.getElementById('health-my-baker-panel');
    if (!baker) {
        panel?.remove();
        return;
    }
    if (!panel) {
        document.querySelector('.health-missed-attestations')?.insertAdjacentHTML('beforebegin', renderMyTezosBakerPanel(data));
        initHealthBakerProfileLinks(document.getElementById('health-my-baker-panel') || document);
        return;
    }
    setHtmlIfSignatureChanged(
        '#health-my-baker-name',
        bakerLinks(baker.address, baker.name),
        `${baker.address}:${baker.name}`
    );
    const status = document.getElementById('health-my-baker-status');
    if (status) {
        setTextIfChanged(status, baker.label);
        status.className = `health-my-baker-status ${baker.className}`;
    }
    setTextIfChanged('#health-my-baker-copy', baker.copy, { pulse: false });
    setTextIfChanged('#health-my-baker-attestations', formatCount(baker.missedSlots));
    setTextIfChanged('#health-my-baker-blocks', formatCount(baker.missedBlockCount));
    setTextIfChanged('#health-my-baker-latest', baker.latestBlock ? formatCount(baker.latestBlock.level) : 'Not in sample');
    initHealthBakerProfileLinks(panel);
}

function updateListIfChanged(selector, html, signature) {
    const changed = setHtmlIfSignatureChanged(selector, html, signature, { pulse: true });
    const root = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (changed) initHealthBakerProfileLinks(root || document);
}

function updateRecentBlockRows(blocks) {
    const list = document.getElementById('health-recent-block-list');
    if (!list) return;
    const nextBlocks = blocks.slice(0, CHAMBER_BLOCK_LIMIT);
    const savedAddresses = savedMyTezosAddressSet();
    const signature = nextBlocks.map((block) => `${block.level}:${block.power}:${block.committee}:${block.missedPower}:${block.blockRound}`).join('|');
    if (!list.children.length) {
        setHtmlIfSignatureChanged(list, renderRecentBlockRows(nextBlocks), signature);
        initHealthBakerProfileLinks(list);
        syncLiveHeadMyTezosRows();
        return;
    }

    const existingLevels = new Set([...list.querySelectorAll('.health-block-row')].map((row) => row.dataset.healthLevel));
    const freshBlocks = nextBlocks.filter((block) => !existingLevels.has(String(Number(block.level) || 0)));
    if (!freshBlocks.length) {
        updateListIfChanged(list, renderRecentBlockRows(nextBlocks, { markLatest: false }), signature);
        syncLiveHeadMyTezosRows();
        return;
    }

    for (const block of [...freshBlocks].reverse()) {
        list.insertAdjacentHTML('afterbegin', renderRecentBlockRow(block, { isNew: true, savedAddresses }));
    }
    while (list.querySelectorAll('.health-block-row').length > nextBlocks.length) {
        list.querySelector('.health-block-row:last-child')?.remove();
    }
    list.dataset.healthSignature = signature;
    initHealthBakerProfileLinks(list);
    nextBlocks.forEach(updateRecentBlockReceipt);
    syncLiveHeadMyTezosRows();
}

function updateHealthStoryPanels(data) {
    const continuity = document.getElementById('health-chain-proof');
    if (continuity && !document.getElementById('uptime-counter')) quietlySyncElement(continuity, renderContinuityProofPanel(data));
    updateNakamotoCoefficientPanel(data);
    const consensus = document.getElementById('health-teztale-consensus');
    if (consensus) quietlySyncElement(consensus, renderTeztaleConsensusPanel(data));
    const octez = document.getElementById('health-octez-versions');
    if (octez) {
        quietlySyncElement(octez, renderOctezVersionsPanel(data));
        initHealthBakerProfileLinks(document.getElementById('health-octez-versions') || document);
    }
    const cycle = document.getElementById('health-cycle-timing');
    if (cycle) quietlySyncElement(cycle, renderCycleTimingPanel(data));
    const incident = document.getElementById('health-incident-memory');
    if (incident) quietlySyncElement(incident, renderIncidentMemoryPanel(data));
    const periods = document.getElementById('health-period-telemetry');
    if (periods) quietlySyncElement(periods, renderPeriodTelemetryPanel(data));
    const load = document.getElementById('health-network-load');
    if (load) quietlySyncElement(load, renderNetworkLoadPanel(data));
}

function updateNetworkHealthInPlace(data, container) {
    if (!container.dataset.healthRendered || !document.getElementById('health-hero-score')) {
        renderNetworkHealthChamber(data, container);
        return;
    }
    container.dataset.healthRefreshMode = 'in-place';
    updateHealthHeader(data);
    updateHealthVerdictPanel(data);
    updateHealthScorePanel(data);
    updateHealthTimingPanel(data);
    updateHealthStoryPanels(data);
    updateMyTezosBakerPanel(data);
    updateListIfChanged(
        '#health-missed-attester-list',
        renderAttesterRows(data.missedAttesters),
        data.missedAttesters.map((item) => `${item.address}:${item.slots}:${item.latestLevel}`).join('|')
    );
    updateListIfChanged(
        '#health-missed-block-list',
        renderMissedBlockRows(data.missedBlocks),
        data.missedBlocks.map((right) => `${right.level}:${right.round}:${right.baker?.address || ''}`).join('|')
    );
    updateListIfChanged(
        '#health-activity-list',
        (data.activityTape || []).length
            ? data.activityTape.slice(0, 8).map((row) => `
        <a class="lb-table-row health-activity-row" href="https://tzkt.io/${escapeHtml(row.hash)}" target="_blank" rel="noopener">
            <span>${escapeHtml(row.method)}</span>
            <span>${row.amount === null ? '--' : `${formatCount(Math.round(row.amount))} XTZ`}</span>
            <span>${escapeHtml(row.target)}</span>
            <span${healthAgeAttr(row.timestamp)}>${escapeHtml(formatAge(row.timestamp))}</span>
        </a>
    `).join('')
            : '<div class="lb-empty-inline">No large transfers returned in the live sample.</div>',
        (data.activityTape || []).map((row) => `${row.hash}:${row.amount}:${row.timestamp}`).join('|')
    );
    updateRecentBlockRows(data.blocks);
    updateBlockTicker(data);
    window.setTimeout(() => requestRecentBlockSupplements(data.blocks), 500);
    refreshHealthAgeLabels(container);
}

function initHealthBakerProfileLinks(root = document) {
    root.querySelectorAll('.health-baker-name-link').forEach((link) => {
        if (link.dataset.healthProfileWired) return;
        link.dataset.healthProfileWired = '1';
        link.addEventListener('click', closeNetworkHealthChamber);
    });
}

function lockPageScroll() {
    if (savedBodyOverflow !== null) return;
    savedBodyOverflow = document.body.style.overflow;
    savedHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
}

function unlockPageScroll() {
    if (savedBodyOverflow === null) return;
    document.body.style.overflow = savedBodyOverflow || '';
    document.documentElement.style.overflow = savedHtmlOverflow || '';
    savedBodyOverflow = null;
    savedHtmlOverflow = null;
}

function renderNetworkHealthLoading(body) {
    if (!body) return;
    delete body.dataset.healthRendered;
    delete body.dataset.healthRefreshMode;
    body.innerHTML = `
        <div class="chamber-loading" role="status" aria-live="polite">
            <div class="chamber-loading-text">Opening Network Health Chamber...</div>
            <div class="chamber-loading-subtext">Fetching head block, attestation power, and baker telemetry</div>
            <div class="chamber-loading-bar"><div class="chamber-loading-fill"></div></div>
        </div>
    `;
}

async function refreshNetworkHealthChamber({ initial = false } = {}) {
    const overlay = document.getElementById('network-health-modal');
    const body = overlay?.querySelector('.health-body');
    if (!overlay?.classList.contains('active') || !body || chamberRefreshInFlight) return;
    chamberRefreshInFlight = true;
    overlay.classList.add('health-refreshing');

    try {
        const data = await fetchNetworkHealthChamberData();
        confirmLiveHeadObservation(data);
        if (!overlay.classList.contains('active')) return;
        if (initial) renderNetworkHealthChamber(data, body);
        else updateNetworkHealthInPlace(data, body);
    } catch (error) {
        if (initial) throw error;
        console.warn('Network Health chamber refresh failed', error);
        const state = document.getElementById('health-refresh-state');
        if (state) state.textContent = 'refresh delayed';
    } finally {
        overlay.classList.remove('health-refreshing');
        chamberRefreshInFlight = false;
    }
}

function startChamberRefresh() {
    stopChamberRefresh();
    const overlay = document.getElementById('network-health-modal');
    if (overlay) overlay.dataset.healthLive = 'true';
    startHealthAgeTicker();
    chamberTimer = window.setInterval(() => {
        if (document.hidden) return;
        const pulseStale = !lastBlockPulseAt || Date.now() - lastBlockPulseAt > CHAMBER_REFRESH_INTERVAL * 2;
        if (pulseStale) refreshNetworkHealthChamber();
    }, CHAMBER_REFRESH_INTERVAL);
}

function stopChamberRefresh() {
    if (chamberTimer) {
        window.clearInterval(chamberTimer);
        chamberTimer = null;
    }
    const overlay = document.getElementById('network-health-modal');
    if (overlay) overlay.dataset.healthLive = 'false';
}

export async function openNetworkHealthChamber({ isCurrent = () => true } = {}) {
    if (!isCurrent()) return;
    cachedData ||= loadCachedData();
    bindChamberVisibility('network-health-modal', () => refreshNetworkHealthChamber());
    closeLiveHeadInspector();
    await ensureNetworkHealthCss();
    if (!isCurrent()) return;
    document.getElementById('tooltip-network-health')?.classList.remove('is-open');
    let overlay = document.getElementById('network-health-modal');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'network-health-modal';
        overlay.className = 'modal-overlay chamber-overlay lb-overlay health-overlay';
        overlay.setAttribute('aria-hidden', 'true');
        overlay.innerHTML = `
            <div class="modal-content modal-large chamber-content lb-content health-content" role="dialog" aria-modal="true" aria-label="Network Health Chamber" tabindex="-1">
                <button class="modal-close chamber-close" type="button" aria-label="Close Network Health Chamber" style="z-index:3">&times;</button>
                <div class="chamber-body lb-body health-body">
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        overlay.querySelector('.chamber-close')?.addEventListener('click', closeNetworkHealthChamber);
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) closeNetworkHealthChamber();
        });
    }

    renderNetworkHealthLoading(overlay.querySelector('.health-body'));
    overlay.classList.add('active');
    activateChamberDialog(overlay, {
        close: closeNetworkHealthChamber,
        dialogSelector: '.health-content',
        label: 'Network Health Chamber',
        restoreFocusSelector: '.stat-card[data-stat="network-health"]'
    });
    lockPageScroll();
    const content = overlay.querySelector('.health-content');
    if (content) content.scrollTop = 0;
    try {
        await refreshNetworkHealthChamber({ initial: true });
    if (!isCurrent() || !overlay.classList.contains('active')) return;
        startChamberRefresh();
    } catch (error) {
        if (!isCurrent()) return;
        console.error('Network Health chamber fetch error:', error);
        overlay.querySelector('.health-body').innerHTML = `
            <div class="chamber-error">
                <div class="error-icon">!</div>
                <div class="error-title">Couldn't reach network health data</div>
                <div class="error-detail">TzKT block or rights data may be temporarily unavailable. Try again in a moment.</div>
                <button class="chamber-retry-btn" id="health-retry-open">Retry</button>
            </div>
        `;
        overlay.querySelector('#health-retry-open')?.addEventListener('click', openNetworkHealthChamber);
    }
}

export function closeNetworkHealthChamber() {
    const overlay = document.getElementById('network-health-modal');
    if (!requestChamberClose(overlay)) return;
    stopChamberRefresh();
    if (overlay) {
        overlay.classList.remove('active');
        deactivateChamberDialog(overlay);
    }
    document.getElementById('tooltip-network-health')?.classList.remove('is-open');
    unlockPageScroll();
}

function wireNetworkHealthCard() {
    const card = document.querySelector('.stat-card[data-stat="network-health"]');
    if (!card || card.dataset.healthChamberWired) return;
    card.dataset.healthChamberWired = '1';
    card.classList.add('chamber-entry-card', 'health-entry-card', 'chamber-entry-wide');
    wireChamberLauncher(card, {
        open: openNetworkHealthChamber,
        label: 'Open Network Health Chamber',
        titleSelector: '.stat-label'
    });

    ensureHealthEntryTape();
}

export async function refreshNetworkHealth({ force = false } = {}) {
    if (refreshInFlight) return refreshInFlight;

    const forcePeriods = force || !cachedData || Date.now() - lastFullFetch > PERIOD_TTL;
    refreshInFlight = fetchNetworkHealth({ forcePeriods })
        .then((data) => {
            confirmLiveHeadObservation(data);
            cachedData = data;
            lastFullFetch = data.periodUpdatedAt || lastFullFetch;
            saveCachedData(data);
            renderNetworkHealth(data);
            refreshNetworkHealthTape();
            return data;
        })
        .catch((error) => {
            console.warn('Network health refresh failed:', error);
            if (cachedData) renderNetworkHealth(cachedData, { error: true });
            else renderNetworkHealthError();
            return cachedData;
        })
        .finally(() => {
            refreshInFlight = null;
        });

    return refreshInFlight;
}

export function initNetworkHealth() {
    if (!document.querySelector('[data-stat="network-health"]')) return;
    if (dashboardHealthInitialized) return;
    dashboardHealthInitialized = true;

    ensureNetworkHealthCss().catch((error) => console.warn('Network Health styles unavailable', error));
    wireLiveHeadDepthControls();
    wireCycleChipHealthLauncher();
    wireNetworkHealthCard();
    startHealthAgeTicker();
    if (!heartbeatVisibilityWired) {
        heartbeatVisibilityWired = true;
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState !== 'visible') return;
            refreshHealthAgeLabels(document);
            suppressNextHeartbeatMotion = true;
            refreshNetworkHealth();
        });
    }

    cachedData ||= loadCachedData();
    if (cachedData) {
        lastFullFetch = cachedData.periodUpdatedAt || cachedData.updatedAt || 0;
        renderNetworkHealth(cachedData);
    } else {
        updateBlockTicker(null);
    }

    refreshNetworkHealth({ force: !periodCacheIsFresh(cachedData) });

    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
        if (document.visibilityState !== 'visible') return;
        const pulseStale = !lastBlockPulseAt || Date.now() - lastBlockPulseAt > LIVE_REFRESH_INTERVAL * 2;
        if (pulseStale) refreshNetworkHealth();
    }, LIVE_REFRESH_INTERVAL);

    window.addEventListener('block-pulse', () => {
        if (document.visibilityState !== 'visible') return;
        const now = Date.now();
        lastBlockPulseAt = now;
        if (now - lastBlockPulseFetch < BLOCK_PULSE_THROTTLE) return;
        lastBlockPulseFetch = now;
        refreshNetworkHealth();
        if (document.getElementById('network-health-modal')?.classList.contains('active')) {
            refreshNetworkHealthChamber();
        }
    });
}
