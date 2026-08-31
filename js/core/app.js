/**
 * Tezos Systems - Main Application
 * Dashboard for Tezos network statistics
 */

import './tzkt-throttle.js';
import { fetchAllStats, fetchHeroStats, fetchHistoricalDataReceipt, checkApiHealth, fetchWithDeadline, fetchWithRetry } from './api.js';
import {
    CHAMBER_CATEGORY_META,
    findCurrentSiteMapContext,
    findCurrentSiteMapEntry,
    findSiteMapEntry,
    navigateSiteMapEntry,
    siteMapCanonicalRoute
} from './site-map.js';
import { renderSiteHandoff } from './site-handoff.js';
import { initSiteJourneyCapture } from './site-journey.js';
import { initTheme, openThemePicker, setTheme, getAvailableThemes } from '../ui/theme.js';
import { initHomeLayout, isHomeBlockVisible, setHomeBlockVisible } from '../ui/home-layout.js';
import {
    initChamberCategories,
    isChamberRoomVisible,
    setChamberCategoryVisible,
    setChamberRoomVisible
} from '../ui/chamber-categories.js';
import { flipCard, revealStat, showLoading, showError } from '../ui/animations.js';
import {
    blockTick,
    cancelFresh,
    initDataMagic,
    prefersReducedMotion,
    pulseFresh,
    setMagicNumber,
    tweenNumber
} from '../effects/data-magic.js';
import {
    formatCount,
    formatPercentage,
    formatXTZ,
    formatLarge,
    formatTimestamp,
    formatSupply,
    escapeHtml,
    debugLog,
    startLiveTimeTicker,
    debounce
} from './utils.js';
import { quietlyMutate, quietlySyncElement, quietlySyncHtml } from './quiet-refresh.js';
import { versionedAsset } from './asset-version.js';
import { initPlatformTextFallbacks } from './platform-text.js';
import { CANONICAL_UPGRADE_COUNT, countProtocolUpgrades, getProtocolUpgradeOrdinal } from './protocol-count.js';
import { bakerSizeTier } from './baker-size.mjs';
import {
    MAX_SAVED_MY_TEZOS_ADDRESSES,
    SAVED_ADDRESSES_KEY,
    connectOctezWallet,
    disconnectOctezWallet,
    getStoredWalletAddress,
    initFooterDelegation,
    isTezosAddress,
    preloadOctezConnect,
    readSavedMyTezosEntries,
    shortAddress,
    upsertSavedMyTezosEntry
} from './wallet.js';
import { resolveTezReverseNames } from './tezos-domains.js';
import { initArcadeEffects, toggleUltraMode } from '../effects/arcade-effects.js';
import { closeCycleHistoryChamber, initHistoryModal, updateSparklines, addCardHistoryButtons, setLatestLiveMetric, openCardHistoryModal } from '../features/history.js';
import { ensureCardShareButton, initShare, initProtocolShare, loadHtml2Canvas, showShareModal, setLiveAPY } from '../ui/share.js';
import { activateChamberDialog, deactivateChamberDialog, wireChamberLauncher } from '../ui/chamber-accessibility.js';
import { activateOverlayDialog, deactivateOverlayDialog, reconcileOverlayEnvironment } from '../ui/overlay-stack.js';
import { setToastGate } from '../ui/toast-queue.js';
import { fetchProtocols } from '../features/governance.js';
import { initGovernanceAlerts } from '../features/governance-alerts.js';

const SPARKLINE_LIVE_METRICS = [
    ['tz4_percentage', 'tz4Percentage'],
    ['tz4_power_pct', 'tz4PowerPct'],
    ['staking_ratio', 'stakingRatio'],
    ['delegated_ratio', 'delegatedRatio'],
    ['total_bakers', 'totalBakers'],
    ['current_issuance_rate', 'currentIssuanceRate'],
    ['protocol_issuance_rate', 'protocolIssuanceRate'],
    ['lb_issuance_rate', 'lbIssuanceRate'],
    ['lb_ema_pct', 'lbEmaPct'],
    ['staking_apy_stake', 'stakeAPY'],
    ['staking_apy_delegate', 'delegateAPY'],
    ['total_supply', 'totalSupply'],
    ['total_burned', 'totalBurned'],
    ['total_baking_power', 'bakingPower'],
    ['tx_volume_24h', 'transactionVolume24h'],
    ['contract_calls_24h', 'contractCalls24h'],
    ['funded_accounts', 'fundedAccounts'],
    ['new_accounts_24h', 'newAccounts24h'],
    ['smart_contracts', 'smartContracts'],
    ['tokens', 'tokens'],
    ['rollups', 'rollups'],
    ['active_contracts_24h', 'activeContracts24h']
];

import { saveStats, loadStats, loadStatsTimestamp, saveProtocols, loadProtocols, getCacheAge, getVisitDeltas, saveVisitSnapshot } from './storage.js';
import { initWhaleTracker } from '../features/whales.js';
import { initSleepingGiants } from '../features/sleeping-giants.js';
import { initPriceBar } from '../features/price.js';
import { initStreak } from '../features/streak.js';
import { setPageTitleRoute, updatePageTitle } from '../ui/title.js';
import { REFRESH_INTERVALS, STAKING_TARGET, MAINNET_LAUNCH, API_URLS } from './config.js';
import { loadDataAsset } from './data-assets.js';
import { getCalendarElapsedTime, getTezosUptimeAnniversary } from './anniversary.js';
import { initComparison, updateComparison } from '../features/comparison.js';
import { init as initMyBaker, refresh as refreshMyBaker } from '../features/my-baker.js';
import { initCalculator } from '../features/calculator.js';
import { checkMoments, initMomentsTimeline } from '../features/moments.js';
import { initVibes } from '../effects/vibes.js';
import { initChangelog } from '../features/changelog.js';
import { initBakerReportCard } from '../features/baker-report-card.js';

import { initMyTezos, refreshMyTezos } from '../features/my-tezos.js';
import { initUpgradeEffect } from '../features/upgrade-effect.js';
import { initCyclePulse, updateCyclePulse } from '../features/cycle-pulse.js';
import { initPriceIntelligence, updatePriceIntelligence } from '../features/price-intelligence.js';
import { initRewardsTracker, updateRewardsTracker, destroyRewardsTracker } from '../features/rewards-tracker.js';
import { activateHotTodaySignal, initDailyBriefing, initHotTodayIsland, updateDailyBriefing, updateHotTodayIsland } from '../features/daily-briefing.js';
import { initStateOfTezos } from '../features/state-of-tezos.js';
import { closeNetworkHealthChamber, initNetworkHealth, refreshNetworkHealth } from '../features/network-health.js';
import { initHeroSearch } from '../features/search.js';
import { initNativeExplorer } from '../features/native-explorer.js';
import { initSiteWayfinder } from '../ui/wayfinder.js';

const MY_TEZOS_CSS_URL = versionedAsset('/css/my-tezos.min.css');
const PI_VISIBLE_KEY = 'tezos-systems-pi-visible';
const STANDALONE_ROUTE_TITLE = document.documentElement.hasAttribute('data-chamber-route') ? document.title : '';
const ROOT_DASHBOARD_TITLE = STANDALONE_ROUTE_TITLE ? '' : document.title;
let setMyTezosDrawerOpenState = null;

function isContentiousProtocol(protocol, lore = null) {
    return Boolean(protocol?.contention || lore?.contention || lore?.history);
}

// All stat card IDs (used for loading/error states)
const ALL_CARD_IDS = [
    'total-bakers', 'tz4-adoption', 'cycle-progress',
    'proposal', 'voting-period', 'participation',
    'issuance-rate', 'staking-apy', 'staking-ratio', 'delegated', 'total-supply', 'total-burned',
    'baking-power', 'reward-accounts',
    'tx-volume', 'contract-calls', 'funded-accounts', 'new-accounts',
    'smart-contracts', 'tokens', 'rollups', 'active-contracts'
];

// Application state
const state = {
    currentStats: {},
    protocols: [],
    lastUpdate: null,
    lastScalarRefreshAt: 0,
    lastHeavyRefreshAt: 0,
    refreshTimers: [],
};

function statsObservationDate(stats, fallbackTimestamp = 0) {
    const observedAt = Date.parse(stats?._quality?.observedAt || '');
    const timestamp = Number.isFinite(observedAt) && observedAt > 0
        ? observedAt
        : Number(fallbackTimestamp);
    return Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp) : new Date();
}

const DATA_QUALITY_LABELS = {
    bakers: 'baker counts',
    cycle: 'cycle data',
    governance: 'governance',
    issuance: 'issuance',
    staking: 'staking',
    stakingAPY: 'reward rates',
    transactionVolume24h: 'transaction volume',
    totalTransactions: 'transaction totals',
    contractCalls24h: 'contract calls',
    totalSupply: 'total supply',
    totalBurned: 'burn totals',
    fundedAccounts: 'funded accounts',
    newAccounts24h: 'new accounts',
    smartContracts: 'contracts',
    activeContracts24h: 'active contracts',
    tokens: 'tokens',
    rollups: 'rollups',
    networkStats: 'network totals',
    networkActivity: 'network activity',
    accounts: 'account totals',
    contracts: 'contracts',
    upstreamApiCache: 'upstream data',
    hero: 'headline network data'
};

function finiteMetric(value) {
    const number = Number(value);
    return value !== null && value !== undefined && value !== '' && Number.isFinite(number)
        ? number
        : null;
}

function formatApyPair(delegateAPY, stakeAPY) {
    const delegate = finiteMetric(delegateAPY);
    const stake = finiteMetric(stakeAPY);
    if (delegate === null && stake === null) return 'Unavailable';
    return `${delegate === null ? '—' : `${delegate.toFixed(1)}%`} / ${stake === null ? '—' : `${stake.toFixed(1)}%`}`;
}

function formatCycleProgress(progress, timeRemaining) {
    const value = finiteMetric(progress);
    if (value === null) return 'Cycle timing unavailable';
    return `${value.toFixed(1)}% • ${timeRemaining || 'remaining time unavailable'}`;
}

function formatTz4Progress(value) {
    const percentage = finiteMetric(value);
    return percentage === null ? 'Unavailable' : `${percentage.toFixed(1)} / ${STAKING_TARGET}%`;
}

function uptimeMetricPayload(stats) {
    const payload = {};
    const metricKeys = [
        ['activeBakers', 'totalBakers'],
        ['stakedRatio', 'stakingRatio'],
        ['currentIssuanceRate', 'currentIssuanceRate'],
        ['blockLevel', 'blockLevel']
    ];
    for (const [target, source] of metricKeys) {
        const value = finiteMetric(stats?.[source]);
        if (value !== null) payload[target] = value;
    }
    if (stats?.blockTime) payload.blockTime = stats.blockTime;
    return payload;
}

window.tezosSystemsPrefersReducedMotion = prefersReducedMotion;

let resolveHeroSettled;
let heroSettledDone = false;
const heroSettled = new Promise((resolve) => {
    resolveHeroSettled = resolve;
});

if (typeof window !== 'undefined') {
    window.tezosSystemsHeroSettled = heroSettled;
    window.setTimeout(() => settleHeroArrival(), 6000);
}

function settleHeroArrival() {
    if (heroSettledDone) return;
    heroSettledDone = true;
    resolveHeroSettled?.();
}

function setLauncherToggleState(btn, isOn) {
    if (!btn) return;
    btn.classList.toggle('active', isOn);
    btn.setAttribute('aria-pressed', String(isOn));
    const pill = btn.querySelector('.feature-status');
    if (pill) {
        pill.textContent = btn.dataset[isOn ? 'statusOn' : 'statusOff'] || (isOn ? 'Showing' : 'Hidden');
    }
}

function countExploreEvent(path) {
    try {
        window.goatcounter?.count?.({ path, event: true });
    } catch {}
}

if (typeof window !== 'undefined') {
    window.tezosSystemsLauncher = {
        ...(window.tezosSystemsLauncher || {}),
        setToggleState: setLauncherToggleState
    };
}

// Safe feature wrapper — one failing feature can't kill init or refresh
function safe(name, fn) {
    try { fn(); } catch (e) { console.warn(`[feature] ${name} failed:`, e); }
}

function ensureMyTezosCss() {
    if (document.getElementById('my-tezos-css')) return;
    const link = document.createElement('link');
    link.id = 'my-tezos-css';
    link.rel = 'stylesheet';
    link.href = MY_TEZOS_CSS_URL;
    document.head.appendChild(link);
}

/**
 * Initialize the dashboard
 */
async function init() {
    debugLog('Initializing Tezos Systems dashboard...');

    safe('platformTextFallbacks', initPlatformTextFallbacks);

    // Initialize theme
    safe('theme', initTheme);
    safe('homeLayout', initHomeLayout);
    safe('chamberCategories', initChamberCategories);
    safe('chamberCategoryRoute', primeChamberCategoryFromRoute);
    safe('myTezosCss', ensureMyTezosCss);

    // Initialize arcade effects
    safe('arcadeEffects', initArcadeEffects);
    
    // Initialize share functionality
    safe('share', initShare);
    safe('protocolShare', initProtocolShare);
    safe('liveTimeTicker', () => startLiveTimeTicker(document));
    safe('footerDelegation', () => initFooterDelegation(document));

    // Lift chamber entry cards out of the hidden network-stat sections.
    safe('chambersSurface', initChambersSurface);
    
    // Chamber modules hydrate only as their launcher approaches the viewport,
    // receives intent, or owns the active route. The static launcher shell
    // keeps the directory complete and stable before those modules arrive.
    safe('lazyChamberLaunchers', initLazyChamberLaunchers);
    safe('governanceAlerts', initGovernanceAlerts);
    safe('protocolHistoryChamber', initProtocolHistoryChamber);
    safe('protocolHistoryHeaderLauncher', initProtocolHistoryHeaderLauncher);
    safe('cycleHistoryChamber', () => initStaticChamberEntry('history', initHistoryModal));
    
    // Initialize changelog modal
    safe('changelog', initChangelog);
    
    // Initialize card history buttons
    safe('cardHistory', addCardHistoryButtons);
    
    // Initialize whale tracker
    safe('whaleTracker', () => initWhaleTracker({ legacyUi: false }));
    
    // Initialize sleeping giants
    safe('sleepingGiants', () => initSleepingGiants({ legacyUi: false }));

    // Initialize price bar
    safe('priceBar', initPriceBar);
    safe('vibes', initVibes);
    safe('dataMagic', initDataMagic);
    safe('toastGate', () => setToastGate(heroSettled));
    // briefingToggle removed — briefing now in drawer
    safe('priceIntelToggle', initPriceIntelToggle);


    // Initialize My Tezos personal homepage strip
    safe('myTezos', initMyTezos);
    safe('myTezosButton', initMyTezosButton);

    // Initialize visit streak
    safe('streak', initStreak);

    // Initialize My Baker
    safe('myBaker', initMyBaker);

    // Initialize Rewards Calculator
    safe('calculator', initCalculator);
    safe('bakerReportCard', initBakerReportCard);
    safe('stateOfTezos', initStateOfTezos);

    safe('momentsTimeline', initMomentsTimeline);
    safe('comparisonToggle', initComparisonToggle);
    safe('comparison', () => initComparison({}));
    safe('cyclePulse', () => initCyclePulse({}));
    safe('dailyBriefing', () => initDailyBriefing({}, 0));
    safe('hotTodayIsland', () => initHotTodayIsland({}, 0));
    safe('rewardsTracker', () => {
        if (localStorage.getItem('tezos-systems-my-baker-address')) {
            const p = parseFloat(document.querySelector('.price-value')?.textContent?.replace(/[^0-9.]/g, '')) || 0;
            initRewardsTracker(state.currentStats || {}, p);
        }
    });
    safe('navButtons', initNavButtons);
    safe('siteJourney', initSiteJourneyCapture);
    safe('siteHandoff', initSiteHandoff);
    safe('siteWayfinder', initSiteWayfinder);
    safe('siteMapRouter', initSiteMapRouter);
    safe('heroSearch', initHeroSearch);
    safe('nativeExplorer', initNativeExplorer);
    safe('uptimeClock', initUptimeClock);
    safe('chambersToggle', initChambersToggle);
    safe('tezosStatsToggle', initTezosStatsToggle);
    safe('networkHealth', initNetworkHealth);
    safe('chambersOrder', orderChambersSurface);
    safe('sectionExplainers', initSectionExplainers);
    // Setup event listeners
    setupEventListeners();
    
    // Initialize collapsible sections
    initCollapsibleSections();

    // Initialize Smart Dock (gear dropdown)
    initSmartDock();
    safe('cornerGiftTray', initCornerGiftTray);

    // Add copyable deep-link affordances to major feature surfaces
    safe('deepLinkAffordances', initDeepLinkAffordances);

    // Start pulse indicator checks
    initPulseIndicators();

    // Try to load cached data for instant display
    const cachedStats = loadStats();
    const cachedStatsTimestamp = loadStatsTimestamp();
    const cachedProtocols = loadProtocols();
    
    // Only render cached full stats if the user enabled Network Stats.
    const statsWanted = localStorage.getItem(STATS_VISIBLE_KEY) === 'true';
    if (cachedStats && statsWanted) {
        debugLog('⚡ Rendering cached data instantly');
        statsDataLoaded = true;
        await updateStats(cachedStats);
        state.lastUpdate = statsObservationDate(cachedStats, cachedStatsTimestamp);
        updateLastRefreshTime();
        reportDataProblem();
        
        // Show cache indicator briefly
        const cacheAge = getCacheAge();
        if (cacheAge) {
            showCacheIndicator(cacheAge);
        }
    } else if (statsWanted) {
        showAllLoading();
    }
    
    // Load cached protocols for instant timeline
    if (cachedProtocols) {
        renderProtocolTimeline(cachedProtocols);
    }

    // Feed uptime clock with cached data if available
    if (cachedStats && window._updateUptimeClock) {
        window._updateUptimeClock(uptimeMetricPayload(cachedStats));
    }
    if (cachedStats) updateTz4ChamberTile(cachedStats);

    // Check API health (non-blocking)
    checkApiHealth().then(health => debugLog('API Health:', health));

    // Fetch hero data + conditional full stats
    refreshInBackground();

    // Initialize history features
    updateSparklines(); // Don't await - let it load in background

    // Setup sparkline refresh interval (visibility-gated)
    setInterval(() => {
        if (document.visibilityState === 'visible') updateSparklines();
    }, REFRESH_INTERVALS.sparkline);

    // Setup refresh interval
    startRefreshTimer();

    // Register Service Worker for offline/PWA
    registerServiceWorker();

    // Offline indicator
    initOfflineIndicator();

    // Setup URL deep-linking
    applyDeepLink();
    window.addEventListener('hashchange', applyDeepLink);
    window.addEventListener('popstate', applyDeepLink);
    window.addEventListener('tezos:routechange', applyDeepLink);

    // Setup keyboard shortcuts
    initKeyboardShortcuts();

    debugLog('Dashboard initialized');
}

/**
 * Show brief cache indicator
 */
function showCacheIndicator(age) {
    const indicator = document.createElement('div');
    indicator.className = 'cache-indicator';
    indicator.innerHTML = `<span>📦 Cached: ${age}</span>`;
    indicator.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        background: rgba(0, 212, 255, 0.2);
        color: var(--color-primary);
        padding: 6px 12px;
        border-radius: 4px;
        font-size: 0.75rem;
        z-index: 1000;
        opacity: 1;
        transition: opacity 0.5s ease;
    `;
    document.body.appendChild(indicator);
    
    // Fade out after 3 seconds
    setTimeout(() => {
        indicator.style.opacity = '0';
        setTimeout(() => indicator.remove(), 500);
    }, 3000);
}

/**
 * Show deltas panel for "since last visit" changes
 */
function showDeltasPanel(deltas) {
    debugLog('📊 Showing deltas since last visit:', deltas);
    
    // Format delta values
    const formatDelta = (metric) => {
        const sign = metric.delta > 0 ? '+' : '';
        const arrow = metric.delta > 0 ? '↑' : '↓';
        const color = metric.delta > 0 ? 'var(--color-success, #10b981)' : 'var(--color-error, #ef4444)';
        
        let value;
        if (metric.format === 'percent') {
            value = `${sign}${metric.delta.toFixed(1)}%`;
        } else if (metric.format === 'supply') {
            const deltaM = metric.delta / 1000000;
            value = `${sign}${deltaM.toFixed(2)}M`;
        } else {
            value = `${sign}${metric.delta.toLocaleString()}`;
        }
        
        return `<span style="color: ${color}">${arrow} ${value}</span>`;
    };
    
    const metricsHtml = deltas.metrics
        .slice(0, 4) // Show max 4 changes
        .map(m => `
            <div class="delta-item">
                <span class="delta-label">${m.label}</span>
                ${formatDelta(m)}
            </div>
        `).join('');
    
    const panel = document.createElement('div');
    panel.className = 'deltas-panel';
    panel.innerHTML = `
        <div class="deltas-header">
            <span>📊 Since ${deltas.timeAgo}</span>
            <button class="deltas-close" aria-label="Close">×</button>
        </div>
        <div class="deltas-content">
            ${metricsHtml}
        </div>
    `;

    document.body.appendChild(panel);

    // Animate in
    requestAnimationFrame(() => {
        panel.classList.add('visible');
    });

    const closePanel = () => {
        panel.classList.remove('visible');
        setTimeout(() => {
            panel.remove();
        }, 300);
    };

    // Close button handler
    panel.querySelector('.deltas-close').addEventListener('click', closePanel);
    
    // Auto-hide after 10 seconds
    setTimeout(() => {
        if (panel.parentNode) closePanel();
    }, 10000);
}

/**
 * Refresh data in background without showing loading states
 */
async function refreshInBackground({ includeHeavy = true } = {}) {
    debugLog(`🔄 Fetching ${includeHeavy ? 'full' : 'headline'} data in background...`);
    
    try {
        if (includeHeavy) await updateUpgradeClock();
        const heroStats = await fetchHeroStats();
        // Silent failure (rate-limit / network): keep the last good UI, flag it.
        if (looksEmptyStats(heroStats)) {
            reportDataProblem();
            return;
        }
        if (window._updateUptimeClock) {
            window._updateUptimeClock(uptimeMetricPayload(heroStats));
        }
        updateTz4ChamberTile(heroStats);
        syncLiveSparklineMetrics(heroStats);

        // Only fetch full stats if Tezos Stats sections are visible
        const statsVisible = localStorage.getItem(STATS_VISIBLE_KEY);
        let fullStatsPublished = false;
        let qualityStats = heroStats;
        if (includeHeavy && statsVisible === 'true') {
            const newStats = await fetchAllStats();
            debugLog('✅ Fresh stats received');
            
            const deltas = getVisitDeltas(newStats);
            if (deltas) showDeltasPanel(deltas);
            saveVisitSnapshot(newStats);
            saveStats(newStats);
            await updateStats(newStats);
            fullStatsPublished = true;
            qualityStats = newStats;
            syncLiveSparklineMetrics(newStats);
            state.lastUpdate = statsObservationDate(newStats);
            updateLastRefreshTime();
        }

        // Always update comparison section with whatever data we have
        // (heroStats provides stakingRatio; full stats add issuance if available)
        const comparisonStats = {
            ...state.currentStats,
            ...heroStats,
            stakingRatio: heroStats.stakingRatio ?? state.currentStats?.stakingRatio,
            currentIssuanceRate: heroStats.currentIssuanceRate ?? state.currentStats?.currentIssuanceRate,
            cycle: heroStats.cycle ?? state.currentStats?.cycle,
            blockLevel: heroStats.blockLevel ?? state.currentStats?.blockLevel,
            blockTime: heroStats.blockTime ?? state.currentStats?.blockTime,
            cycleProgress: heroStats.cycleProgress ?? state.currentStats?.cycleProgress,
            cycleTimeRemaining: heroStats.cycleTimeRemaining ?? state.currentStats?.cycleTimeRemaining,
            _quality: qualityStats?._quality ?? heroStats._quality ?? state.currentStats?._quality,
        };
        updateComparison(comparisonStats);
        updateCyclePulse(comparisonStats);
        const bgXtzPrice = parseFloat(document.querySelector(".price-value")?.textContent?.replace(/[^0-9.]/g, "")) || 0;
        updateDailyBriefing(comparisonStats, bgXtzPrice);
        updateHotTodayIsland(comparisonStats, bgXtzPrice);
        updateRewardsTracker(comparisonStats, bgXtzPrice);
        updatePriceIntelligence(comparisonStats, bgXtzPrice);

        if (!fullStatsPublished) {
            state.lastUpdate = statsObservationDate(heroStats);
            updateLastRefreshTime();
        }
        state.lastScalarRefreshAt = Date.now();

        if (!fullStatsPublished) {
            window.dispatchEvent(new CustomEvent('stats-updated', {
                detail: { stats: comparisonStats, source: 'hero' }
            }));
        }

        
        if (includeHeavy) {
            refreshMyBaker({ quiet: true });
            callLoadedChamberFeature('leaderboard', 'refreshLeaderboard', { quiet: true });
            refreshMyTezos();
            refreshNetworkHealth({ force: true });
            state.lastHeavyRefreshAt = Date.now();
        }

        reportDataQuality(qualityStats);
        // resetCountdown();
    } catch (error) {
        console.error('Background refresh failed:', error);
        reportDataProblem();
        if (!state.currentStats || Object.keys(state.currentStats).length === 0) {
            showErrorState();
        }
    }
}

/**
 * Refresh all statistics (manual refresh - shows loading)
 */
async function refresh() {
    debugLog('Refreshing stats...');

    try {
        const newStats = await fetchAllStats();
        debugLog('Stats received:', newStats);

        // Silent failure (rate-limit / network): keep the last good UI, flag it.
        if (looksEmptyStats(newStats)) {
            reportDataProblem();
            return;
        }

        // Save to localStorage for instant load next time
        saveStats(newStats);

        // Force full re-render by clearing lastUpdate temporarily
        const hadPriorUpdate = !!state.lastUpdate;
        state.lastUpdate = null;
        await updateStats(newStats);
        syncLiveSparklineMetrics(newStats);
        state.lastUpdate = statsObservationDate(newStats);
        state.lastScalarRefreshAt = Date.now();
        state.lastHeavyRefreshAt = Date.now();
        updateLastRefreshTime();
        await updateUpgradeClock(); // Update protocol + days live

        if (isPriceIntelligenceSelected()) {
            const piPrice = parseFloat(document.querySelector('.price-value')?.textContent?.replace(/[^0-9.]/g, '')) || 0;
            try {
                await initPriceIntelligence(state.currentStats, piPrice);
            } catch (err) {
                console.warn('[price-intel] failed to initialize:', err);
            }
            syncPriceIntelligenceVisibility();
        }
        // resetCountdown();
        refreshMyBaker();
        callLoadedChamberFeature('leaderboard', 'refreshLeaderboard');
        refreshMyTezos();
        refreshNetworkHealth({ force: true });

        reportDataQuality(newStats);
    } catch (error) {
        console.error('Failed to refresh stats:', error);
        reportDataProblem();
        showErrorState();
    }
}

/**
 * Update the issuance breakdown subtitle (Protocol · LB)
 */
function updateIssuanceBreakdown(protocolRate, lbRate, lbDisabled = false) {
    const el = document.getElementById('issuance-breakdown');
    if (!el) return;
    if (!protocolRate && !lbRate && !lbDisabled) {
        el.textContent = '';
        return;
    }
    const safeProtocolRate = Number.isFinite(protocolRate) ? protocolRate : 0;
    const safeLbRate = Number.isFinite(lbRate) ? lbRate : 0;
    const protocolStr = `${safeProtocolRate.toFixed(2)}% Protocol`;
    const lbStr = lbDisabled ? ' · 0.00% LB (disabled)' : (safeLbRate > 0 ? ` · ${safeLbRate.toFixed(2)}% LB` : '');
    el.textContent = protocolStr + lbStr;
}

function updateRewardAccountsBreakdown(totalDelegators, totalStakers) {
    const el = document.getElementById('reward-accounts-description');
    if (!el) return;
    if (!totalDelegators && !totalStakers) {
        el.textContent = 'Delegators + stakers';
        return;
    }
    el.textContent = `${formatLarge(totalDelegators)} delegators · ${formatLarge(totalStakers)} stakers`;
}

function clampPercent(value) {
    if (value === null || value === undefined || value === '') return null;
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    return Math.min(100, Math.max(0, num));
}

function renderGovernanceVessel(stats) {
    const desc = document.getElementById('participation-description');
    const card = document.querySelector('[data-stat="participation"]');
    if (!desc) return;

    const participation = clampPercent(stats?.participation);
    const quorum = clampPercent(stats?.participationQuorum);
    const yay = clampPercent(stats?.participationYayPct);
    const daysLeft = finiteMetric(stats?.participationDaysLeft);
    const isBallot = stats?.govPeriodKind === 'exploration' || stats?.govPeriodKind === 'promotion';

    card?.classList.remove('governance-vessel-late-low');
    if (!isBallot || participation === null || quorum === null) {
        desc.textContent = stats?.participationDescription || '';
        return;
    }

    const lateAndLow = Number.isFinite(daysLeft) && daysLeft <= 2 && participation < quorum;
    card?.classList.toggle('governance-vessel-late-low', lateAndLow);
    const label = `${participation.toFixed(1)}% of stake has spoken · quorum ${quorum.toFixed(1)}%`;
    const yayHtml = yay === null ? '' : `
        <div class="governance-vessel-yay" aria-label="${yay.toFixed(1)}% yay; supermajority threshold 80%">
            <span class="governance-vessel-fill governance-vessel-fill-yay" style="width:${yay}%"></span>
            <span class="governance-vessel-tick governance-vessel-tick-super" style="left:80%"></span>
        </div>
    `;
    desc.innerHTML = `
        <span class="governance-vessel-label">${label}</span>
        <span class="governance-vessel" role="img" aria-label="${label}">
            <span class="governance-vessel-fill" style="width:${participation}%"></span>
            <span class="governance-vessel-tick" style="left:${quorum}%"></span>
        </span>
        ${yayHtml}
    `;
}

function currentProtocolFromList(protocols = []) {
    return protocols.find((protocol) => protocol?.isCurrent) || protocols[protocols.length - 1] || null;
}

function triggerProtocolActivationCeremony(previousName, nextName, upgradeCount) {
    const headerProtocolEl = document.getElementById('header-current-protocol');
    const chip = document.getElementById('header-protocol-chip');
    if (!headerProtocolEl || !nextName) return;

    if (prefersReducedMotion()) {
        headerProtocolEl.textContent = nextName;
        return;
    }

    headerProtocolEl.textContent = previousName || headerProtocolEl.textContent;
    chip?.classList.add('protocol-chip-crossfade');
    window.setTimeout(() => {
        headerProtocolEl.textContent = nextName;
        chip?.classList.add('protocol-chip-crossfade-in');
    }, 280);
    window.setTimeout(() => {
        chip?.classList.remove('protocol-chip-crossfade', 'protocol-chip-crossfade-in');
    }, 900);

    const shimmer = document.createElement('div');
    shimmer.className = 'protocol-activation-shimmer';
    shimmer.setAttribute('aria-hidden', 'true');
    shimmer.dataset.upgradeCount = String(upgradeCount || '');
    document.body.appendChild(shimmer);
    window.setTimeout(() => shimmer.remove(), 2100);
}

function enrichStatsWithProtocolState(stats) {
    if (!stats || !Array.isArray(state.protocols) || !state.protocols.length) return stats;
    const upgradeCount = countProtocolUpgrades(state.protocols);
    const currentProtocol = currentProtocolFromList(state.protocols);
    return {
        ...stats,
        protocolCount: upgradeCount,
        upgradeCount,
        currentProtocolName: currentProtocol?.name || stats.currentProtocolName || null
    };
}

/**
 * Update displayed statistics
 */
async function updateStats(newStats) {
    newStats = enrichStatsWithProtocolState(newStats);
    // First load - update instantly
    if (!state.lastUpdate) {
        debugLog('First load - updating instantly');
        
        // Consensus
        revealStat('total-bakers', newStats.totalBakers, formatCount);
        revealStat('tz4-adoption', newStats.tz4Percentage,
            formatTz4Progress);
        const tz4Desc = document.getElementById('tz4-description');
        const tz4Bakers = finiteMetric(newStats.tz4Bakers);
        const totalBakers = finiteMetric(newStats.totalBakers);
        if (tz4Desc) {
            tz4Desc.textContent = tz4Bakers === null || totalBakers === null
                ? 'BLS baker adoption unavailable'
                : `${tz4Bakers.toLocaleString('en-US')} / ${totalBakers.toLocaleString('en-US')} bakers active`;
        }
        revealStat('cycle-progress', newStats.cycle, formatCount);
        document.getElementById('cycle-description').textContent =
            formatCycleProgress(newStats.cycleProgress, newStats.cycleTimeRemaining);
        
        // Governance
        revealStat('proposal', newStats.proposal, (v) => v);
        document.getElementById('proposal-description').textContent = newStats.proposalDescription;
        revealStat('voting-period', newStats.votingPeriod, (v) => v);
        document.getElementById('voting-description').textContent = newStats.votingDescription;
        revealStat('participation', newStats.participation, formatPercentage);
        renderGovernanceVessel(newStats);
        
        // Economy
        revealStat('issuance-rate', newStats.currentIssuanceRate, formatPercentage);
        updateIssuanceBreakdown(newStats.protocolIssuanceRate, newStats.lbIssuanceRate, newStats.lbSubsidyDisabled);
        revealStat('staking-apy', newStats.delegateAPY,
            (val) => formatApyPair(val, newStats.stakeAPY));
        // Update live APY values for tweet template substitution
        if (newStats.delegateAPY && newStats.stakeAPY) {
            setLiveAPY(newStats.delegateAPY, newStats.stakeAPY);
        }
        revealStat('staking-ratio', newStats.stakingRatio, formatPercentage);
        revealStat('delegated', newStats.delegatedRatio, formatPercentage);
        revealStat('total-supply', newStats.totalSupply, formatSupply);
        revealStat('total-burned', newStats.totalBurned, formatSupply);
        revealStat('baking-power', newStats.bakingPower, formatSupply);
        revealStat('reward-accounts', newStats.rewardAccounts, formatLarge);
        updateRewardAccountsBreakdown(newStats.totalDelegators, newStats.totalStakers);
        
        // Network Activity
        revealStat('tx-volume', newStats.transactionVolume24h, formatLarge);
        revealStat('contract-calls', newStats.contractCalls24h, formatLarge);
        revealStat('funded-accounts', newStats.fundedAccounts, formatLarge);
        revealStat('new-accounts', newStats.newAccounts24h, formatLarge);
        
        // Ecosystem
        revealStat('smart-contracts', newStats.smartContracts, formatLarge);
        revealStat('tokens', newStats.tokens, formatLarge);
        revealStat('rollups', newStats.rollups, formatCount);
        revealStat('active-contracts', newStats.activeContracts24h, formatLarge);

        // Feed uptime clock with baker/staking data
        if (window._updateUptimeClock) {
            window._updateUptimeClock(uptimeMetricPayload(newStats));
        }
    } else {
        // Animate changes
        const updates = [];
        
        if (state.currentStats.totalBakers !== newStats.totalBakers) {
            updates.push({ cardId: 'total-bakers', value: newStats.totalBakers, formatter: formatCount });
        }
        if (state.currentStats.tz4Percentage !== newStats.tz4Percentage) {
            updates.push({
                cardId: 'tz4-adoption',
                value: newStats.tz4Percentage,
                formatter: formatTz4Progress
            });
        }
        if (state.currentStats.cycle !== newStats.cycle) {
            updates.push({ cardId: 'cycle-progress', value: newStats.cycle, formatter: formatCount });
        }
        if (state.currentStats.proposal !== newStats.proposal) {
            updates.push({ cardId: 'proposal', value: newStats.proposal, formatter: (val) => val });
        }
        if (state.currentStats.votingPeriod !== newStats.votingPeriod) {
            updates.push({ cardId: 'voting-period', value: newStats.votingPeriod, formatter: (val) => val });
        }
        if (state.currentStats.participation !== newStats.participation) {
            updates.push({ cardId: 'participation', value: newStats.participation, formatter: formatPercentage });
        }
        if (state.currentStats.currentIssuanceRate !== newStats.currentIssuanceRate) {
            updates.push({ cardId: 'issuance-rate', value: newStats.currentIssuanceRate, formatter: formatPercentage });
        }
        if (
            state.currentStats.protocolIssuanceRate !== newStats.protocolIssuanceRate ||
            state.currentStats.lbIssuanceRate !== newStats.lbIssuanceRate ||
            state.currentStats.lbSubsidyDisabled !== newStats.lbSubsidyDisabled
        ) {
            updateIssuanceBreakdown(newStats.protocolIssuanceRate, newStats.lbIssuanceRate, newStats.lbSubsidyDisabled);
        }
        if (state.currentStats.delegateAPY !== newStats.delegateAPY || state.currentStats.stakeAPY !== newStats.stakeAPY) {
            updates.push({
                cardId: 'staking-apy',
                value: newStats.delegateAPY,
                formatter: (val) => formatApyPair(val, newStats.stakeAPY)
            });
        }
        if (state.currentStats.stakingRatio !== newStats.stakingRatio) {
            updates.push({ cardId: 'staking-ratio', value: newStats.stakingRatio, formatter: formatPercentage });
        }
        if (state.currentStats.delegatedRatio !== newStats.delegatedRatio) {
            updates.push({ cardId: 'delegated', value: newStats.delegatedRatio, formatter: formatPercentage });
        }
        if (state.currentStats.bakingPower !== newStats.bakingPower) {
            updates.push({ cardId: 'baking-power', value: newStats.bakingPower, formatter: formatSupply });
        }
        if (state.currentStats.rewardAccounts !== newStats.rewardAccounts) {
            updates.push({ cardId: 'reward-accounts', value: newStats.rewardAccounts, formatter: formatLarge });
        }
        if (state.currentStats.transactionVolume24h !== newStats.transactionVolume24h) {
            updates.push({ cardId: 'tx-volume', value: newStats.transactionVolume24h, formatter: formatLarge });
        }
        if (state.currentStats.contractCalls24h !== newStats.contractCalls24h) {
            updates.push({ cardId: 'contract-calls', value: newStats.contractCalls24h, formatter: formatLarge });
        }
        if (state.currentStats.fundedAccounts !== newStats.fundedAccounts) {
            updates.push({ cardId: 'funded-accounts', value: newStats.fundedAccounts, formatter: formatLarge });
        }
        if (state.currentStats.newAccounts24h !== newStats.newAccounts24h) {
            updates.push({ cardId: 'new-accounts', value: newStats.newAccounts24h, formatter: formatLarge });
        }
        if (state.currentStats.smartContracts !== newStats.smartContracts) {
            updates.push({ cardId: 'smart-contracts', value: newStats.smartContracts, formatter: formatLarge });
        }
        if (state.currentStats.tokens !== newStats.tokens) {
            updates.push({ cardId: 'tokens', value: newStats.tokens, formatter: formatLarge });
        }
        if (state.currentStats.rollups !== newStats.rollups) {
            updates.push({ cardId: 'rollups', value: newStats.rollups, formatter: formatCount });
        }
        if (state.currentStats.activeContracts24h !== newStats.activeContracts24h) {
            updates.push({ cardId: 'active-contracts', value: newStats.activeContracts24h, formatter: formatLarge });
        }

        // Reconcile changed values together. Each visible card gets one
        // theme-aware text transition; offscreen cards settle silently.
        updates.forEach((update) => {
            const card = document.querySelector(`[data-stat="${update.cardId}"]`);
            if (card) flipCard(card, update.value, update.formatter);
        });
        
        // Update descriptions
        const tz4Desc2 = document.getElementById('tz4-description');
        if (tz4Desc2) {
            const tz4Bakers = finiteMetric(newStats.tz4Bakers);
            const totalBakers = finiteMetric(newStats.totalBakers);
            tz4Desc2.textContent = tz4Bakers === null || totalBakers === null
                ? 'BLS baker adoption unavailable'
                : `${tz4Bakers.toLocaleString('en-US')} / ${totalBakers.toLocaleString('en-US')} bakers active`;
        }
        document.getElementById('cycle-description').textContent =
            formatCycleProgress(newStats.cycleProgress, newStats.cycleTimeRemaining);
        document.getElementById('proposal-description').textContent = newStats.proposalDescription;
        document.getElementById('voting-description').textContent = newStats.votingDescription;
        renderGovernanceVessel(newStats);
        updateRewardAccountsBreakdown(newStats.totalDelegators, newStats.totalStakers);
    }

    if (newStats.delegateAPY && newStats.stakeAPY) {
        setLiveAPY(newStats.delegateAPY, newStats.stakeAPY);
    }

    // Feed uptime clock on every refresh
    if (window._updateUptimeClock) {
        window._updateUptimeClock(uptimeMetricPayload(newStats));
    }

    // Check for network moments (milestone detection)
    const oldStats = state.currentStats;
    
    // Store current stats
    state.currentStats = { ...newStats };

    // Detect milestones by comparing old vs new
    if (oldStats && Object.keys(oldStats).length > 0) {
        checkMoments(oldStats, newStats);
    }

    // Update about modal with live data
    const aboutApy = document.getElementById('about-apy');
    if (aboutApy) {
        const stakeApy = finiteMetric(newStats.stakeAPY);
        aboutApy.textContent = stakeApy === null ? 'Unavailable' : `~${stakeApy.toFixed(1)}%`;
    }

    // Update comparison section with live Tezos data
    updateComparison(state.currentStats);

    // Update new engagement features
    updateCyclePulse(state.currentStats);
    const xtzPrice = parseFloat(document.querySelector(".price-value")?.textContent?.replace(/[^0-9.]/g, "")) || 0;
    updateDailyBriefing(state.currentStats, xtzPrice);
    updateHotTodayIsland(state.currentStats, xtzPrice);
    updateRewardsTracker(state.currentStats, xtzPrice);

    // Update page title with live stats
    updatePageTitle(state.currentStats);

    // Update network health pulse
    updateNetworkPulse();

    const statusEl = document.getElementById('upgrade-status');
    if (statusEl) {
        statusEl.classList.remove('active');
        statusEl.innerHTML = '';
    }

    window.dispatchEvent(new CustomEvent('stats-updated', {
        detail: { stats: state.currentStats }
    }));
}

/**
 * Show loading state on all cards
 */
function showAllLoading() {
    ALL_CARD_IDS.forEach(id => showLoading(id));
}

/**
 * Show error state
 */
function showErrorState() {
    ALL_CARD_IDS.forEach(id => showError(id));
}

/**
 * Heuristic: did a stats fetch silently come back empty?
 * fetchHeroStats/fetchAllStats use Promise.allSettled and return zeros on
 * failure (they don't throw), so we detect that here instead of relying on catch.
 */
function looksEmptyStats(stats) {
    if (!stats) return true;
    return (Number(stats.totalBakers) || 0) === 0 && (Number(stats.cycle) || 0) === 0;
}

/**
 * Show/hide the data status banner.
 * @param {('stale'|'error'|null)} kind - null hides the banner
 * @param {string} [message]
 */
function setDataStatus(kind, message) {
    const bar = document.getElementById('data-status');
    if (!bar) return;
    const txt = bar.querySelector('.data-status-text');
    const nextMessage = message || '';
    if (!kind && bar.hidden) return;
    if (kind && !bar.hidden && bar.dataset.statusKind === kind && txt?.textContent === nextMessage) return;
    quietlyMutate(bar, () => {
        if (!kind) {
            bar.hidden = true;
            delete bar.dataset.statusKind;
            return;
        }
        bar.dataset.statusKind = kind;
        bar.classList.toggle('error', kind === 'error');
        if (txt) txt.textContent = nextMessage;
        bar.hidden = false;
    });
}

/** A refresh attempt failed or returned empty — surface it without nuking cached UI. */
function reportDataProblem() {
    const hasData = state.currentStats && Object.keys(state.currentStats).length > 0;
    if (hasData) {
        const since = state.lastUpdate
            ? Math.max(1, Math.round((Date.now() - state.lastUpdate.getTime()) / 60000))
            : null;
        setDataStatus('stale', since
            ? `Live data delayed — showing values from ~${since}m ago`
            : 'Live data delayed — showing last known values');
    } else {
        setDataStatus('error', "Can't reach the Tezos network right now — retrying…");
    }
}

/** A refresh succeeded — clear any status banner. */
function reportDataHealthy() {
    setDataStatus(null);
}

function reportDataQuality(stats) {
    const quality = stats?._quality;
    if (!quality || quality.status === 'live') {
        reportDataHealthy();
        return;
    }

    const unavailable = Array.isArray(quality.unavailableCategories)
        ? quality.unavailableCategories
        : [];
    const stale = Array.isArray(quality.staleCategories)
        ? quality.staleCategories
        : [];
    const affected = [...new Set([...unavailable, ...stale])]
        .map((category) => DATA_QUALITY_LABELS[category] || category)
        .slice(0, 4);
    const suffix = affected.length ? `: ${affected.join(', ')}` : '';

    if (unavailable.length) {
        setDataStatus('stale', `Some live metrics are unavailable${suffix}. Available values still updated.`);
        return;
    }
    setDataStatus('stale', `Some metrics are using last known values${suffix}.`);
}

/**
 * Setup event listeners
 */
/**
 * Move a section to the top of the optional-sections container
 */
function bringToTop(sectionId) {
    const container = document.getElementById('optional-sections');
    const section = document.getElementById(sectionId);
    if (container && section && section.parentElement === container) {
        container.prepend(section);
    }
}

// ==========================================
// MY TEZOS HEADER BUTTON
// ==========================================
function initMyTezosButton() {
    const btn = document.getElementById('my-tezos-btn');
    if (!btn) return;
    const drawer = document.getElementById('my-tezos-drawer');
    const scrim = document.getElementById('my-tezos-drawer-scrim');
    let drawerFocusedBeforeOpen = null;
    let drawerSavedBodyOverflow = null;
    let drawerSavedHtmlOverflow = null;
    let drawerWasOpen = drawer?.classList.contains('open') === true;

    const STORAGE_KEY = 'tezos-systems-my-baker-address';
    btn.setAttribute('aria-controls', 'my-tezos-drawer');
    btn.setAttribute('aria-expanded', 'false');
    if (drawer) {
        drawer.setAttribute('role', 'dialog');
        drawer.setAttribute('aria-modal', 'true');
        drawer.setAttribute('aria-hidden', 'true');
        drawer.setAttribute('inert', '');
        drawer.inert = true;
    }
    if (scrim) scrim.setAttribute('aria-hidden', 'true');

    // Cache for .tez domain lookups
    const _tezDomainCache = {};

    async function resolveTezDomain(address) {
        if (_tezDomainCache[address] !== undefined) return _tezDomainCache[address];
        try {
            const resp = await fetch('https://api.tezos.domains/graphql', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: `query{reverseRecord(address:"${address}"){domain{name}}}` })
            });
            if (resp.ok) {
                const json = await resp.json();
                const name = json?.data?.reverseRecord?.domain?.name || null;
                _tezDomainCache[address] = name;
                return name;
            }
        } catch {}
        _tezDomainCache[address] = null;
        return null;
    }

    async function updateButtonState() {
        const address = localStorage.getItem(STORAGE_KEY);
        if (address) {
            const iconEl = btn.querySelector('.my-tezos-icon');
            const labelEl = btn.querySelector('.nav-label');
            if (iconEl) iconEl.textContent = '👤';
            btn.classList.add('connected');
            btn.classList.remove('nudge');
            btn.title = 'My Tezos — click to open your dashboard';

            // Build label: .tez name or short address + balance
            const tezName = await resolveTezDomain(address);
            const data = window._myTezosData;
            const displayName = tezName || (address.slice(0, 6) + '…' + address.slice(-4));
            const balance = data?.totalXTZ != null
                ? data.totalXTZ.toLocaleString(undefined, { maximumFractionDigits: 0 }) + ' XTZ'
                : null;
            if (labelEl) labelEl.textContent = balance ? `${displayName} · ${balance}` : displayName;
        } else {
            const iconEl = btn.querySelector('.my-tezos-icon');
            const labelEl = btn.querySelector('.nav-label');
            if (iconEl) iconEl.textContent = '👤';
            if (labelEl) labelEl.textContent = 'My Tezos';
            btn.classList.remove('connected');
            btn.title = 'My Tezos — personalize your dashboard';
        }
    }

    function updateWalletDrawerState(address = getStoredWalletAddress(), status = '') {
        const label = address ? `Wallet ${shortAddress(address)}` : (status || 'Octez.Connect · Not connected');
        const emptyStatus = document.getElementById('drawer-wallet-status');
        const connectedStatus = document.getElementById('my-tezos-wallet-status');
        const disconnectBtn = document.getElementById('my-tezos-wallet-disconnect');
        [emptyStatus, connectedStatus].forEach((el) => {
            if (!el) return;
            el.textContent = label;
            el.dataset.connected = address ? 'true' : 'false';
        });
        if (disconnectBtn) disconnectBtn.hidden = !address;
    }

    async function connectWalletFromDrawer(button) {
        const buttons = [
            document.getElementById('drawer-wallet-connect-btn'),
            document.getElementById('my-tezos-wallet-connect')
        ].filter(Boolean);
        buttons.forEach((btn) => { btn.disabled = true; });
        if (button) button.textContent = 'Opening...';
        updateWalletDrawerState('', 'Opening wallet...');
        try {
            const account = await connectOctezWallet({ syncMyTezos: true });
            if (account?.address) {
                await openMyTezosTarget(account.address);
                updateWalletDrawerState(account.address);
            } else {
                updateWalletDrawerState('', 'Wallet connected');
            }
        } catch (error) {
            updateWalletDrawerState('', `Wallet failed: ${error?.message || error}`);
        } finally {
            buttons.forEach((btn) => {
                btn.disabled = false;
                btn.textContent = btn.dataset.walletIdleLabel || 'Connect wallet';
            });
        }
    }

    function prewarmWalletFromDrawer() {
        preloadOctezConnect();
    }

    document.getElementById('drawer-wallet-connect-btn')?.addEventListener('click', (event) => {
        connectWalletFromDrawer(event.currentTarget);
    });
    document.getElementById('my-tezos-wallet-connect')?.addEventListener('click', (event) => {
        connectWalletFromDrawer(event.currentTarget);
    });
    [
        document.getElementById('drawer-wallet-connect-btn'),
        document.getElementById('my-tezos-wallet-connect')
    ].filter(Boolean).forEach((button) => {
        button.addEventListener('pointerenter', prewarmWalletFromDrawer);
        button.addEventListener('focus', prewarmWalletFromDrawer);
    });
    document.getElementById('my-tezos-wallet-disconnect')?.addEventListener('click', async (event) => {
        const button = event.currentTarget;
        button.disabled = true;
        updateWalletDrawerState('', 'Disconnecting wallet...');
        try {
            await disconnectOctezWallet();
            updateWalletDrawerState('', 'Wallet disconnected');
        } catch (error) {
            updateWalletDrawerState('', `Disconnect failed: ${error?.message || error}`);
        } finally {
            button.disabled = false;
        }
    });
    function walletStatusLabel(status) {
        if (status === 'aborted') return 'Pairing cancelled';
        if (status === 'disconnected') return 'Wallet disconnected';
        return '';
    }
    window.addEventListener('tezos-wallet-updated', (event) => {
        updateWalletDrawerState(event.detail?.address || '', walletStatusLabel(event.detail?.status));
    });
    updateWalletDrawerState();

    function setDrawerOpen(open, { restoreFocus = true } = {}) {
        if (!drawer || !scrim) return;
        if (open === drawer.classList.contains('open')) return;
        if (open) {
            drawerFocusedBeforeOpen = document.activeElement;
            drawer.classList.add('open');
            scrim.classList.add('open');
            drawer.removeAttribute('inert');
            drawer.inert = false;
            drawer.setAttribute('aria-hidden', 'false');
            btn.setAttribute('aria-expanded', 'true');
            drawerSavedBodyOverflow = document.body.style.overflow;
            drawerSavedHtmlOverflow = document.documentElement.style.overflow;
            document.body.style.overflow = 'hidden';
            document.documentElement.style.overflow = 'hidden';
            prewarmWalletFromDrawer();
            const address = localStorage.getItem(STORAGE_KEY);
            const emptyState = document.getElementById('drawer-empty-state');
            const connectedState = document.getElementById('drawer-connected');
            if (emptyState) emptyState.style.display = address ? 'none' : '';
            if (connectedState) connectedState.style.display = address ? '' : 'none';
            window.requestAnimationFrame(() => {
                const target = drawer.querySelector('#drawer-address-input, #my-baker-input, button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
                target?.focus({ preventScroll: true });
            });
            return;
        }
        drawer.classList.remove('open');
        scrim.classList.remove('open');
        drawer.setAttribute('aria-hidden', 'true');
        drawer.setAttribute('inert', '');
        drawer.inert = true;
        btn.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = drawerSavedBodyOverflow || '';
        document.documentElement.style.overflow = drawerSavedHtmlOverflow || '';
        drawerSavedBodyOverflow = null;
        drawerSavedHtmlOverflow = null;
        if (restoreFocus && drawerFocusedBeforeOpen && document.contains(drawerFocusedBeforeOpen)) {
            const restoreTarget = drawerFocusedBeforeOpen;
            window.requestAnimationFrame(() => restoreTarget.focus({ preventScroll: true }));
        }
        drawerFocusedBeforeOpen = null;
    }
    setMyTezosDrawerOpenState = setDrawerOpen;

    function syncDrawerStateFromClass() {
        if (!drawer || !scrim) return;
        const open = drawer.classList.contains('open');
        const wasOpen = drawerWasOpen;
        if (open) {
            if (!wasOpen && (!drawerFocusedBeforeOpen || drawer.contains(drawerFocusedBeforeOpen))) {
                drawerFocusedBeforeOpen = document.activeElement;
            }
            drawer.removeAttribute('inert');
            drawer.inert = false;
            drawer.setAttribute('aria-hidden', 'false');
            btn.setAttribute('aria-expanded', 'true');
            scrim.classList.add('open');
            if (drawerSavedBodyOverflow == null) drawerSavedBodyOverflow = document.body.style.overflow;
            if (drawerSavedHtmlOverflow == null) drawerSavedHtmlOverflow = document.documentElement.style.overflow;
            document.body.style.overflow = 'hidden';
            document.documentElement.style.overflow = 'hidden';
            if (!drawer.contains(document.activeElement)) {
                window.requestAnimationFrame(() => {
                    const target = drawer.querySelector('#drawer-address-input, #my-baker-input, button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
                    target?.focus({ preventScroll: true });
                });
            }
            drawerWasOpen = true;
            if (!wasOpen) window.dispatchEvent(new CustomEvent('my-tezos-drawer-opened'));
            return;
        }
        drawer.setAttribute('aria-hidden', 'true');
        drawer.setAttribute('inert', '');
        drawer.inert = true;
        btn.setAttribute('aria-expanded', 'false');
        scrim.classList.remove('open');
        document.body.style.overflow = drawerSavedBodyOverflow || '';
        document.documentElement.style.overflow = drawerSavedHtmlOverflow || '';
        drawerSavedBodyOverflow = null;
        drawerSavedHtmlOverflow = null;
        if (wasOpen && drawerFocusedBeforeOpen && document.contains(drawerFocusedBeforeOpen)) {
            const restoreTarget = drawerFocusedBeforeOpen;
            window.requestAnimationFrame(() => restoreTarget.focus({ preventScroll: true }));
        }
        drawerFocusedBeforeOpen = null;
        drawerWasOpen = false;
        if (wasOpen) window.dispatchEvent(new CustomEvent('my-tezos-drawer-closed'));
    }

    if (drawer && scrim) {
        new MutationObserver(syncDrawerStateFromClass).observe(drawer, {
            attributes: true,
            attributeFilter: ['class']
        });
    }

    function trapDrawerFocus(event) {
        if (event.key !== 'Tab' || !drawer?.classList.contains('open')) return;
        const focusable = getFocusableElements(drawer);
        if (!focusable.length) {
            event.preventDefault();
            drawer.focus({ preventScroll: true });
            return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus({ preventScroll: true });
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus({ preventScroll: true });
        }
    }

    btn.addEventListener('click', () => {
        setDrawerOpen(!drawer?.classList.contains('open'));
    });

    // Listen for address changes
    window.addEventListener('my-baker-updated', (e) => {
        updateButtonState();
        const addr = e.detail?.address;
        if (addr) {
            const p = parseFloat(document.querySelector(".price-value")?.textContent?.replace(/[^0-9.]/g, "")) || 0;
            initRewardsTracker(state.currentStats || {}, p);
        } else {
            destroyRewardsTracker();
        }
    });
    window.addEventListener('storage', (e) => {
        if (e.key === STORAGE_KEY) updateButtonState();
    });
    window.addEventListener('my-tezos-data-ready', () => updateButtonState());

    // Initial state
    updateButtonState();

    // Nudge on first visit (no address, not dismissed)
    const dismissed = localStorage.getItem('tezos-systems-my-tezos-dismissed') === '1';
    if (!localStorage.getItem(STORAGE_KEY) && !dismissed) {
        btn.classList.add('nudge');
    }

    // Drawer close handlers
    document.getElementById('drawer-close')?.addEventListener('click', closeDrawer);
    document.getElementById('my-tezos-drawer-scrim')?.addEventListener('click', closeDrawer);
    drawer?.addEventListener('keydown', trapDrawerFocus);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeDrawer();
    });

    function closeDrawer() {
        setDrawerOpen(false);
    }

    // Refresh button text when data loads (Feature 1: Smart Header Button)
    window.addEventListener('my-tezos-data-ready', () => updateButtonState());

    // Feature 3: Keyboard shortcut — M key toggles drawer
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
        if (e.key === 'm' || e.key === 'M') {
            e.preventDefault();
            btn.click();
        }
    });
}

// ==========================================
// NAV INIT
// ==========================================
function initNavButtons() {
    // Placeholder — nav buttons removed, kept for call compatibility
}

// ==========================================
// CHAMBERS SURFACE
// ==========================================
const CHAMBER_CARD_TARGETS = Object.freeze({
    ecosystem: { selector: '#ecosystem-entry-card', layout: 'featured' },
    pulse: { selector: '#network-pulse-entry-card', layout: 'featured' },
    health: { selector: '[data-stat="network-health"]', layout: 'standard' },
    tezosx: { selector: '#tezlink-entry-card', layout: 'standard' },
    capital: { selector: '#capital-entry-card', layout: 'featured' },
    minerals: { selector: '#minerals-entry-card', layout: 'featured' },
    uranium: { selector: '#uranium-entry-card', layout: 'featured' },
    metals: { selector: '#metals-entry-card', layout: 'featured' },
    whales: { selector: '#whale-watch-entry-card', layout: 'wide' },
    'staking-chamber': { selector: '#staking-entry-card', layout: 'compact' },
    leaderboard: { selector: '#baker-directory-entry-card', layout: 'wide' },
    tz4: { selector: '[data-stat="tz4-adoption"]', layout: 'compact' },
    chamber: { selector: '#chamber-entry-card', layout: 'standard' },
    'l2-governance': { selector: '#etherlink-governance-entry-card', layout: 'standard' },
    'liquidity-baking': { selector: '#lb-entry-card', layout: 'featured' },
    'ledger-flow': { selector: '#ledger-flow-entry-card', layout: 'featured' },
    domains: { selector: '#tezos-domains-entry-card', layout: 'featured' },
    maxis: { selector: '#maxis-entry-card', layout: 'featured' },
    tezoscrp: { selector: '#tezoscrp-entry-card', layout: 'featured' },
    anthology: { selector: '#protocol-history-entry-card', layout: 'standard' },
    history: { selector: '#cycle-history-entry-card', layout: 'standard' }
});
const CHAMBER_FEATURES = Object.freeze({
    pulse: {
        modulePath: '../features/network-pulse.js',
        init: 'initNetworkPulseChamber',
        open: 'openNetworkPulseChamber',
        close: 'closeNetworkPulseChamber'
    },
    tezosx: {
        modulePath: '../features/tezlink.js',
        init: 'initTezlinkChamber',
        open: 'openTezlinkChamber',
        close: 'closeTezlinkChamber'
    },
    capital: {
        modulePath: '../features/capital-chamber.js',
        init: 'initCapitalChamber',
        open: 'openCapitalChamber',
        close: 'closeCapitalChamber'
    },
    minerals: {
        modulePath: '../features/minerals-chamber.js',
        init: 'initMineralsChamber',
        open: 'openMineralsChamber',
        close: 'closeMineralsChamber'
    },
    uranium: {
        modulePath: '../features/uranium-chamber.js',
        init: 'initUraniumChamber',
        open: 'openUraniumChamber',
        close: 'closeUraniumChamber'
    },
    metals: {
        modulePath: '../features/metals-chamber.js',
        init: 'initMetalsChamber',
        open: 'openMetalsChamber',
        close: 'closeMetalsChamber'
    },
    whales: {
        modulePath: '../features/whale-chamber.js',
        init: 'initWhaleChamber',
        open: 'openWhaleChamber',
        close: 'closeWhaleChamber',
        closeArgs: [{ preserveRoute: true }],
        launchers: ['#whale-toggle']
    },
    'staking-chamber': {
        modulePath: '../features/staking-chamber.js',
        init: 'initStakingChamber',
        open: 'openStakingChamber',
        close: 'closeStakingChamber'
    },
    ecosystem: {
        modulePath: '../features/ecosystem-chamber.js',
        init: 'initEcosystemChamber',
        open: 'openEcosystemChamber',
        close: 'closeEcosystemChamber'
    },
    leaderboard: {
        modulePath: '../features/leaderboard.js',
        init: 'initBakerDirectoryChamber',
        open: 'openBakerDirectoryChamber',
        close: 'closeBakerDirectoryChamber',
        closeArgs: [{ preserveRoute: true }],
        launchers: ['#leaderboard-toggle'],
        exclusiveLaunchers: true
    },
    tz4: {
        modulePath: '../features/tz4-adoption.js',
        init: 'initTz4AdoptionChamber',
        open: 'openTz4AdoptionChamber',
        close: 'closeTz4AdoptionChamber'
    },
    chamber: {
        modulePath: '../features/chamber.js',
        init: 'initChamber',
        open: 'openChamber',
        close: 'closeChamber'
    },
    'l2-governance': {
        modulePath: '../features/etherlink-governance.js',
        init: 'initEtherlinkGovernanceChamber',
        open: 'openEtherlinkGovernanceChamber',
        close: 'closeEtherlinkGovernanceChamber'
    },
    'liquidity-baking': {
        modulePath: '../features/liquidity-baking.js',
        init: 'initLiquidityBaking',
        open: 'openLiquidityBakingMonitor',
        close: 'closeLiquidityBakingMonitor'
    },
    'ledger-flow': {
        modulePath: '../features/ledger-flow.js',
        init: 'initLedgerFlowChamber',
        open: 'openLedgerFlowChamber',
        close: 'closeLedgerFlowChamber'
    },
    domains: {
        modulePath: '../features/tezos-domains.js',
        init: 'initTezosDomainsChamber',
        open: 'openTezosDomainsChamber',
        close: 'closeTezosDomainsChamber'
    },
    maxis: {
        modulePath: '../features/maxis.js',
        init: 'initMaxisChamber',
        open: 'openMaxisChamber',
        close: 'closeMaxisChamber'
    },
    tezoscrp: {
        modulePath: '../features/tezoscrp.js',
        init: 'initTezosCrpChamber',
        open: 'openTezosCrpChamber',
        close: 'closeTezosCrpChamber'
    },
    ctez: {
        modulePath: '../features/ctez.js',
        init: 'initCtezChamber',
        open: 'openCtezChamber',
        close: 'closeCtezChamber',
        launchers: ['#ctez-launcher', '#ctez-feature-btn'],
        exclusiveLaunchers: true,
        closeFeatureMenu: true
    }
});
const _chamberModulePromises = new Map();
const _chamberModuleAttempts = new Map();
const _loadedChamberModules = new Map();
const _initializedChamberModules = new Set();
const _openingChamberModules = new Map();
let _chamberOpenEpoch = 0;
let _routedOverlayTransitionDepth = 0;
let _searchRouteFocusTimer = null;
let _lazyChamberObserver = null;
let _chamberPairObserver = null;
const DEFAULT_CHAMBER_CATEGORY_KEY = 'ecosystem';
let _pendingChamberCategoryKey = '';

function chamberCategoryShouldStartExpanded(categoryKey) {
    return categoryKey === (_pendingChamberCategoryKey || DEFAULT_CHAMBER_CATEGORY_KEY);
}

function primeChamberCategoryFromRoute() {
    _pendingChamberCategoryKey = findCurrentSiteMapEntry()?.chamberCategory || '';
}

function chamberEntryNode(entryId) {
    const target = CHAMBER_CARD_TARGETS[entryId];
    return target ? document.querySelector(target.selector) : null;
}

function initStaticChamberEntry(entryId, initializer) {
    if (typeof initializer !== 'function') return undefined;
    const placeholder = chamberEntryNode(entryId);
    const isSkeleton = placeholder?.hasAttribute('data-chamber-skeleton');
    const marker = isSkeleton ? document.createComment(`hydrate:${entryId}`) : null;
    const restoreFocus = Boolean(placeholder && (document.activeElement === placeholder || placeholder.contains(document.activeElement)));
    if (marker) placeholder.replaceWith(marker);

    let result;
    try {
        result = initializer();
    } catch (error) {
        if (marker?.parentNode && placeholder) marker.replaceWith(placeholder);
        throw error;
    }

    const hydrated = chamberEntryNode(entryId);
    if (marker?.parentNode) {
        if (hydrated && hydrated !== placeholder) marker.replaceWith(hydrated);
        else marker.replaceWith(placeholder);
    }
    if (restoreFocus) {
        const focusTarget = hydrated?.querySelector?.('.chamber-expand-cue')
            || hydrated?.querySelector?.('button:not([disabled]), a[href]')
            || hydrated
            || placeholder;
        focusTarget?.focus?.({ preventScroll: true });
    }
    if (result && typeof result.catch === 'function') {
        result.catch((error) => console.warn(`Failed to initialize ${entryId} Chamber launcher`, error));
    }
    orderChambersSurface();
    return result;
}

function loadChamberFeature(entryId, { initialize = true } = {}) {
    const config = CHAMBER_FEATURES[entryId];
    if (!config) return Promise.reject(new Error(`Unknown Chamber feature: ${entryId}`));

    let promise = _chamberModulePromises.get(entryId);
    if (!promise) {
        const attempt = _chamberModuleAttempts.get(entryId) || 0;
        const versionedModulePath = versionedAsset(new URL(config.modulePath, import.meta.url).pathname);
        const moduleSpecifier = attempt > 0
            ? `${versionedModulePath}&chamber-retry=${attempt}`
            : versionedModulePath;
        promise = import(moduleSpecifier).then((module) => {
            _loadedChamberModules.set(entryId, module);
            _chamberModuleAttempts.delete(entryId);
            return module;
        }).catch((error) => {
            _chamberModulePromises.delete(entryId);
            _chamberModuleAttempts.set(entryId, attempt + 1);
            throw error;
        });
        _chamberModulePromises.set(entryId, promise);
    }

    return promise.then((module) => {
        if (!initialize || !config.init || _initializedChamberModules.has(entryId)) return module;
        _initializedChamberModules.add(entryId);
        try {
            initStaticChamberEntry(entryId, () => module[config.init]?.());
        } catch (error) {
            _initializedChamberModules.delete(entryId);
            throw error;
        }
        return module;
    });
}

function callLoadedChamberFeature(entryId, exportName, ...args) {
    const method = _loadedChamberModules.get(entryId)?.[exportName];
    if (typeof method !== 'function') return undefined;
    try {
        return method(...args);
    } catch (error) {
        console.warn(`Failed to call ${entryId}.${exportName}`, error);
        return undefined;
    }
}

async function openChamberFeature(entryId, ...args) {
    const config = CHAMBER_FEATURES[entryId];
    const openEpoch = _chamberOpenEpoch;
    const openToken = Symbol(entryId);
    _openingChamberModules.set(entryId, openToken);
    try {
        const module = await loadChamberFeature(entryId);
        if (openEpoch !== _chamberOpenEpoch) throw chamberOpenCancelledError(entryId);
        const open = module?.[config?.open];
        if (typeof open !== 'function') throw new Error(`${entryId} Chamber does not export ${config?.open || 'an open function'}`);
        const result = await open(...args);
        if (openEpoch !== _chamberOpenEpoch) {
            if (_openingChamberModules.get(entryId) === openToken) {
                const close = module?.[config?.close];
                if (typeof close === 'function') await close(...(config.closeArgs || []));
            }
            throw chamberOpenCancelledError(entryId);
        }
        return result;
    } finally {
        if (_openingChamberModules.get(entryId) === openToken) {
            _openingChamberModules.delete(entryId);
        }
    }
}

function chamberOpenCancelledError(entryId) {
    const error = new Error(`Cancelled stale ${entryId} Chamber open`);
    error.name = 'ChamberOpenCancelledError';
    return error;
}

function isChamberOpenCancelled(error) {
    return error?.name === 'ChamberOpenCancelledError';
}

function chamberFeatureHasActiveSurface(entryId) {
    return Object.entries(ROUTED_OVERLAY_ENTRIES).some(([overlayId, route]) => (
        route.entryIds.includes(entryId)
        && document.getElementById(overlayId)?.classList.contains('active')
    ));
}

async function closeLoadedChamberFeatures() {
    const pending = [];
    for (const [entryId, module] of _loadedChamberModules) {
        if (!_openingChamberModules.has(entryId) && !chamberFeatureHasActiveSurface(entryId)) continue;
        const config = CHAMBER_FEATURES[entryId];
        const close = module?.[config?.close];
        if (typeof close !== 'function') continue;
        try {
            pending.push(Promise.resolve(close(...(config.closeArgs || []))));
        } catch (error) {
            pending.push(Promise.reject(error));
        }
    }
    return Promise.allSettled(pending);
}

function isChamberLauncherControl(target) {
    return Boolean(target?.closest?.(
        '.card-copy-link, .card-share-btn, .card-info-btn, .card-history-btn, a[href], button:not(.chamber-expand-cue)'
    ));
}

function wireLazyChamberEntry(entryId) {
    const card = chamberEntryNode(entryId);
    if (!card || card.dataset.lazyChamberWired === '1') return;
    card.dataset.lazyChamberWired = '1';
    if (!card.hasAttribute('tabindex')) card.tabIndex = 0;
    if (!card.hasAttribute('role')) card.setAttribute('role', 'button');

    const hydrate = () => {
        _lazyChamberObserver?.unobserve(card);
        loadChamberFeature(entryId).catch((error) => console.warn(`Failed to hydrate ${entryId} Chamber launcher`, error));
    };
    const open = (event) => {
        if (isChamberLauncherControl(event?.target)) return;
        event?.preventDefault();
        openChamberFeature(entryId).catch((error) => console.warn(`Failed to open ${entryId} Chamber`, error));
    };
    card.addEventListener('pointerenter', hydrate, { once: true, passive: true });
    card.addEventListener('focusin', hydrate, { once: true });
    card.addEventListener('click', open);
    card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') open(event);
    });
    _lazyChamberObserver?.observe(card);
}

function wireLazyExternalLauncher(entryId, selector, config) {
    const launcher = document.querySelector(selector);
    if (!launcher || launcher.dataset.lazyChamberWired === '1') return;
    launcher.dataset.lazyChamberWired = '1';
    const hydrate = () => loadChamberFeature(entryId)
        .catch((error) => console.warn(`Failed to hydrate ${entryId} Chamber launcher`, error));
    launcher.addEventListener('pointerenter', hydrate, { once: true, passive: true });
    launcher.addEventListener('focus', hydrate, { once: true });
    launcher.addEventListener('click', (event) => {
        event.preventDefault();
        if (config.exclusiveLaunchers) event.stopImmediatePropagation();
        if (config.closeFeatureMenu) {
            const dropdown = document.getElementById('features-dropdown');
            dropdown?.classList.remove('open');
            document.querySelector('[aria-controls="features-dropdown"]')?.setAttribute('aria-expanded', 'false');
        }
        openChamberFeature(entryId).catch((error) => console.warn(`Failed to open ${entryId} Chamber`, error));
    });
}

function initLazyChamberLaunchers() {
    if (!_lazyChamberObserver && 'IntersectionObserver' in window) {
        _lazyChamberObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                const entryId = entry.target.dataset.chamberEntryId;
                if (!entryId) return;
                _lazyChamberObserver.unobserve(entry.target);
                loadChamberFeature(entryId).catch((error) => console.warn(`Failed to hydrate ${entryId} Chamber launcher`, error));
            });
        }, { rootMargin: '0px', threshold: 0.1 });
    }

    Object.entries(CHAMBER_FEATURES).forEach(([entryId, config]) => {
        const card = chamberEntryNode(entryId);
        if (card) {
            card.dataset.chamberEntryId = entryId;
            wireLazyChamberEntry(entryId);
        }
        (config.launchers || []).forEach((selector) => wireLazyExternalLauncher(entryId, selector, config));
    });
}

const CHAMBER_EXPAND_CUE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4h5v5"/><path d="M9 20H4v-5"/><path d="M20 4l-7 7"/><path d="M4 20l7-7"/></svg>';
const CHAMBER_INFO_ICON_SVG = '<svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/></svg>';
const CHAMBER_INFO_COPY = {
    'network-pulse-entry-card': {
        title: 'Network Pulse',
        body: 'A categorized chamber for the live consensus, economy, governance, activity, and ecosystem stats that power the dashboard.',
        href: '/pulse/',
        link: 'Open Network Pulse ->'
    },
    'capital-entry-card': {
        title: 'Capital Chamber',
        body: 'Cross-layer Tezos and Etherlink intelligence for network activity, markets, ecosystem assets, real-world assets, and the art economy.',
        href: '/capital/',
        link: 'Open Capital Chamber ->'
    },
    'minerals-entry-card': {
        title: 'Critical Minerals',
        body: 'A source-bounded strategic-minerals atlas with xCo, xNi, and RARE issuer claims kept separate from indexed Etherlink token state.',
        href: '/minerals/',
        link: 'Open Critical Minerals Chamber ->'
    },
    'uranium-entry-card': {
        title: 'Uranium',
        body: 'Receipt-backed xU3O8 markets, Etherlink token activity, and separately dated physical-uranium custody and reserve evidence.',
        href: '/uranium/',
        link: 'Open Uranium Chamber ->'
    },
    'metals-entry-card': {
        title: 'Precious Metals',
        body: 'The canonical eight precious metals, comparable source-specific market observations, and a separate VNXAU Tezos and Etherlink receipt lane.',
        href: '/metals/',
        link: 'Open Precious Metals Chamber ->'
    },
    'ecosystem-entry-card': {
        title: 'Ecosystem Activity',
        body: 'Tezos L1 and Etherlink dapps ranked by last-completed-week active wallet addresses, with full weekly history, partial current-week telemetry, and contract receipts.',
        href: '/ecosystem/',
        link: 'Open Ecosystem Activity ->'
    },
    'whale-watch-entry-card': {
        title: 'Whale Watch',
        body: 'Large applied operations, complete 24-hour transfer receipts, related flow stories, large dormant accounts, and verified awakenings.',
        href: '/whales/',
        link: 'Open Whale Watch ->'
    },
    'baker-directory-entry-card': {
        title: 'Baker Directory',
        body: 'Discover every funded active baker through transparent capacity, tenure, governance, and tz4 facts without a synthetic performance grade.',
        href: '/leaderboard/',
        link: 'Open Baker Directory ->'
    },
    'staking-entry-card': {
        title: 'Staking Chamber',
        body: 'The latest applied stake and unstake moves over 10,000 tez, plus the complete qualifying history and mover-level receipts.',
        href: '/stake/',
        link: 'Open Staking Chamber ->'
    },
    'chamber-entry-card': {
        title: 'Tezos L1 Governance',
        body: 'Current Tezos governance state, proposal context, vote receipts, next milestones, and historical amendment memory.',
        href: '/chamber/',
        link: 'Open L1 Governance ->'
    },
    'tezlink-entry-card': {
        title: 'Tezos X',
        body: 'Live Tezos X chamber for Etherlink TVL, L2 transaction tape, gas oracle cadence, and rollup activity signals.',
        href: '/tezosx/',
        link: 'Open Tezos X ->'
    },
    'etherlink-governance-entry-card': {
        title: 'Tezos X Governance (L2)',
        body: 'L2 governance monitor for FAST, SLOW, and Sequencer proposals, including quiet periods and recent vote activity.',
        href: '/l2chamber/',
        link: 'Open L2 Governance ->'
    },
    'lb-entry-card': {
        title: 'Liquidity Baking Monitor',
        body: 'Tracks the Liquidity Baking OFF-vote EMA, subsidy state, threshold distance, and baker vote signal.',
        href: '/lb/',
        link: 'Open LB Monitor ->'
    },
    'tz4-adoption': {
        title: 'tz4/BLS Adoption',
        body: 'Tracks baker migration toward tz4/BLS keys, pending activations, switch momentum, and the 50% adoption target.',
        href: '/tz4/',
        link: 'Open tz4 Chamber ->'
    },
    'network-health': {
        title: 'Network Health',
        body: 'Measures recent block attestation power, sampled health windows, live activity tape, and saved My Tezos baker signal.',
        href: '/health/',
        link: 'Open Health ->'
    },
    'ledger-flow-entry-card': {
        title: 'Ledger Flow',
        body: 'Maps bounded sent and received tez paths around any Tezos account, with exact/sample coverage and separate all-time receipt context.',
        href: '/ledger-flow/',
        link: 'Open Ledger Flow ->'
    },
    'cycle-history-entry-card': {
        title: 'Cycle History',
        body: 'Fifteen captured global, market, Network Health, Tezos X, and governance signals with honest range and freshness context.',
        href: '/history/',
        link: 'Open Cycle History ->'
    },
    'protocol-history-entry-card': {
        title: 'Protocol Anthology',
        body: 'A current-first archive of Tezos lore, amendment memory, protocol timeline, and impact views.',
        href: '#protocol-history',
        link: 'Open Anthology ->'
    },
    'tezos-domains-entry-card': {
        title: 'Tezos Domains',
        body: 'Live Tezos Domains room for fresh .tez registrations, renewals, expiring names, auctions, offers, and reverse-record identity moves.',
        href: '/domains/',
        link: 'Open Domains ->'
    },
    'maxis-entry-card': {
        title: 'Tezos Maxis',
        body: 'Spot the enduring Tezos Maxis across honestly labeled all-time, live, and rolling crowns, then enter the current protocol season for movement, Honors, and wallet progression.',
        href: '/maxis/',
        link: 'Open Tezos Maxis ->'
    },
    'tezoscrp-entry-card': {
        title: 'TezosCRP Recognition Hall',
        body: 'Official Tezos Commons Community Rewards category recognitions, monthly rounds, identity history, and source receipts since October 2020.',
        href: '/tezoscrp/',
        link: 'Open TezosCRP ->'
    }
};

function createChamberExpandCue() {
    const cue = document.createElement('span');
    cue.className = 'chamber-expand-cue';
    cue.setAttribute('aria-hidden', 'true');
    cue.innerHTML = CHAMBER_EXPAND_CUE_SVG;
    return cue;
}

function createChamberRoomHideButton(entryId) {
    const button = document.createElement('button');
    const label = findSiteMapEntry(entryId)?.title || 'Chamber';
    button.className = 'chamber-room-hide';
    button.type = 'button';
    button.dataset.chamberRoomHide = entryId;
    button.setAttribute('aria-label', `Hide ${label}`);
    button.title = `Hide ${label}`;
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 10.7a2 2 0 002.7 2.7M9.9 4.2A10.8 10.8 0 0112 4c5.2 0 8.8 5.3 8.8 5.3a13 13 0 01-2.3 2.7M6.2 6.2A15.7 15.7 0 003.2 9.3S6.8 14.7 12 14.7c1 0 1.9-.2 2.7-.5"/></svg>';
    return button;
}

function getChamberInfoKey(card) {
    return card?.id || card?.dataset?.stat || 'chamber-card';
}

function getChamberInfoCopy(card) {
    const key = getChamberInfoKey(card);
    if (CHAMBER_INFO_COPY[key]) return CHAMBER_INFO_COPY[key];
    const title = card.querySelector(':scope .stat-label')?.textContent?.trim() || 'Chamber Card';
    const body = card.querySelector(':scope .stat-description')?.textContent?.trim()
        || 'Live Tezos Systems chamber card with direct links, share capture, and expanded room details.';
    return { title, body, href: '#chambers', link: 'Open Chambers ->' };
}

let activeChamberInfoButton = null;
let chamberInfoGlobalWired = false;
let chamberInfoPositionFrame = 0;

function positionChamberInfoTooltip(button) {
    const card = button?.closest('.chamber-entry-card');
    const tooltip = button ? document.getElementById(button.getAttribute('aria-controls')) : null;
    if (!card || !tooltip) return;

    const viewportMargin = 12;
    const anchorGap = 8;
    tooltip.style.removeProperty('--card-tooltip-top');
    tooltip.style.removeProperty('--card-tooltip-left');
    tooltip.style.removeProperty('--card-tooltip-right');
    tooltip.style.setProperty('--card-tooltip-max-height', `${Math.max(160, window.innerHeight - (viewportMargin * 2))}px`);

    const cardRect = card.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const tooltipWidth = tooltip.offsetWidth || tooltipRect.width;
    const tooltipHeight = tooltip.offsetHeight || tooltipRect.height;
    const minTop = viewportMargin - cardRect.top;
    const maxTop = window.innerHeight - viewportMargin - cardRect.top - tooltipHeight;
    const belowTop = buttonRect.bottom - cardRect.top + anchorGap;
    const aboveTop = buttonRect.top - cardRect.top - tooltipHeight - anchorGap;
    const fitsBelow = cardRect.top + belowTop + tooltipHeight <= window.innerHeight - viewportMargin;
    const fitsAbove = cardRect.top + aboveTop >= viewportMargin;
    const top = fitsBelow
        ? belowTop
        : fitsAbove
            ? aboveTop
            : Math.min(Math.max(belowTop, minTop), Math.max(minTop, maxTop));

    const minLeft = viewportMargin - cardRect.left;
    const maxLeft = window.innerWidth - viewportMargin - cardRect.left - tooltipWidth;
    const preferredLeft = buttonRect.right - cardRect.left - tooltipWidth;
    const left = Math.min(Math.max(preferredLeft, minLeft), Math.max(minLeft, maxLeft));
    const arrowCenter = Math.min(
        Math.max((buttonRect.left + (buttonRect.width / 2)) - cardRect.left - left, 16),
        Math.max(16, tooltipWidth - 16)
    );

    tooltip.style.setProperty('--card-tooltip-top', `${top}px`);
    tooltip.style.setProperty('--card-tooltip-left', `${left}px`);
    tooltip.style.setProperty('--card-tooltip-right', 'auto');
    tooltip.style.setProperty('--card-tooltip-arrow-left', `${arrowCenter}px`);
}

function queueChamberInfoPosition(button = activeChamberInfoButton) {
    if (!button) return;
    if (chamberInfoPositionFrame) cancelAnimationFrame(chamberInfoPositionFrame);
    chamberInfoPositionFrame = requestAnimationFrame(() => {
        chamberInfoPositionFrame = 0;
        positionChamberInfoTooltip(button);
    });
}

function setChamberInfoOpen(button, open) {
    if (!button) return;
    const tooltip = document.getElementById(button.getAttribute('aria-controls'));
    button.classList.toggle('is-open', open);
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
    tooltip?.classList.toggle('is-open', open);
    if (open) {
        activeChamberInfoButton = button;
        queueChamberInfoPosition(button);
    }
    else if (activeChamberInfoButton === button) activeChamberInfoButton = null;
}

function closeActiveChamberInfo() {
    if (activeChamberInfoButton) setChamberInfoOpen(activeChamberInfoButton, false);
}

function wireChamberInfoGlobals() {
    if (chamberInfoGlobalWired) return;
    chamberInfoGlobalWired = true;
    document.addEventListener('click', (event) => {
        if (!activeChamberInfoButton) return;
        if (event.target.closest('.card-info-btn, .card-tooltip')) return;
        closeActiveChamberInfo();
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeActiveChamberInfo();
    });
    window.addEventListener('resize', () => queueChamberInfoPosition(), { passive: true });
    window.addEventListener('scroll', () => queueChamberInfoPosition(), { passive: true, capture: true });
}

function ensureChamberInfoButton(card) {
    if (!card?.classList?.contains('chamber-entry-card')) return null;
    const key = getChamberInfoKey(card);
    const copy = getChamberInfoCopy(card);
    let info = card.querySelector(':scope > .card-info-btn');
    let tooltip = card.querySelector(':scope > .card-tooltip');
    const insertBefore = card.querySelector(':scope > .card-inner');

    if (!info) {
        info = document.createElement('button');
        info.type = 'button';
        info.className = 'card-info-btn';
        if (insertBefore) card.insertBefore(info, insertBefore);
        else card.appendChild(info);
    } else if (info.tagName !== 'BUTTON') {
        const button = document.createElement('button');
        Array.from(info.attributes).forEach((attribute) => {
            button.setAttribute(attribute.name, attribute.value);
        });
        button.type = 'button';
        button.innerHTML = info.innerHTML;
        info.replaceWith(button);
        info = button;
    }

    info.type = 'button';
    info.removeAttribute('tabindex');
    info.dataset.tooltip = info.dataset.tooltip || key;
    info.setAttribute('aria-label', `Explain ${copy.title}`);
    info.setAttribute('aria-controls', `tooltip-${key}`);
    info.setAttribute('aria-expanded', info.classList.contains('is-open') ? 'true' : 'false');
    info.title = 'What is this?';
    if (!info.querySelector('svg')) info.innerHTML = CHAMBER_INFO_ICON_SVG;
    if (!info.dataset.chamberInfoWired) {
        info.dataset.chamberInfoWired = '1';
        info.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const shouldOpen = activeChamberInfoButton !== info || info.getAttribute('aria-expanded') !== 'true';
            closeActiveChamberInfo();
            setChamberInfoOpen(info, shouldOpen);
        });
        info.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape') return;
            event.stopPropagation();
            setChamberInfoOpen(info, false);
            info.focus({ preventScroll: true });
        });
        info.addEventListener('pointerenter', () => queueChamberInfoPosition(info));
        info.addEventListener('focus', () => queueChamberInfoPosition(info));
    }
    wireChamberInfoGlobals();

    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.className = 'card-tooltip';
        tooltip.innerHTML = `
            <div class="tooltip-content">
                <h4>${escapeHtml(copy.title)}</h4>
                <p>${escapeHtml(copy.body)}</p>
                <a href="${escapeHtml(copy.href)}">${escapeHtml(copy.link)}</a>
            </div>
        `;
    }

    tooltip.id = `tooltip-${key}`;
    tooltip.setAttribute('role', 'tooltip');

    if (tooltip.previousElementSibling !== info) {
        info.insertAdjacentElement('afterend', tooltip);
    }

    return info;
}

function syncChamberEntryFooter(card) {
    if (!card?.classList?.contains('chamber-entry-card')) return;
    ensureCardShareButton(card);
    ensureChamberInfoButton(card);

    const front = card.querySelector(':scope .card-front');
    if (!front) return;

    let footer = front.querySelector(':scope > .chamber-entry-footer');
    if (!footer) {
        footer = document.createElement('div');
        footer.className = 'chamber-entry-footer';
        footer.innerHTML = '<span class="chamber-entry-freshness"></span>';
        front.appendChild(footer);
    }
    footer.dataset.quietKey = 'chamber-entry-footer';

    const freshness = footer.querySelector('.chamber-entry-freshness');
    const label = card.dataset.updatedLabel || '';
    if (freshness && freshness.textContent !== label) freshness.textContent = label;
    footer.classList.toggle('has-freshness', Boolean(label));

    const cue = footer.querySelector(':scope > .chamber-expand-cue')
        || card.querySelector(':scope > .chamber-expand-cue, :scope .card-inner + .chamber-expand-cue')
        || createChamberExpandCue();
    const entryId = card.dataset.chamberEntryId;
    let hide = footer.querySelector(':scope > .chamber-room-hide');
    if (entryId && CHAMBER_CARD_TARGETS[entryId]) {
        if (!hide) hide = createChamberRoomHideButton(entryId);
        if (hide.dataset.chamberRoomHide !== entryId) {
            hide.replaceWith(createChamberRoomHideButton(entryId));
            hide = footer.querySelector(':scope > .chamber-room-hide');
        }
        if (hide && hide.parentElement !== footer) footer.appendChild(hide);
    } else if (hide) {
        hide.remove();
    }
    if (cue && cue.parentElement !== footer) footer.appendChild(cue);
    if (hide && cue && hide.nextElementSibling !== cue) footer.insertBefore(hide, cue);
    footer.hidden = !label && !footer.querySelector('.chamber-expand-cue');
}

function syncChamberEntryFooters(root = document) {
    root.querySelectorAll?.('.chamber-entry-card').forEach(syncChamberEntryFooter);
}
window.syncChamberEntryFooters = syncChamberEntryFooters;

function updateChamberPairState(pair) {
    if (!pair) return;
    const cards = Array.from(pair.querySelectorAll(':scope > .chamber-category-cards > .stat-card'));
    const visibleCards = cards.filter((card) => isChamberRoomVisible(card.dataset.chamberEntryId));
    const wideCount = visibleCards.filter((card) => card.classList.contains('chamber-entry-wide')).length;
    pair.dataset.cardCount = String(visibleCards.length);
    pair.dataset.wideCount = String(wideCount);
    const count = pair.querySelector(':scope > .chamber-category-head .chamber-category-count');
    if (count) {
        const value = String(visibleCards.length).padStart(2, '0');
        if (count.textContent !== value) count.textContent = value;
        count.setAttribute('aria-label', `${visibleCards.length} ${visibleCards.length === 1 ? 'room' : 'rooms'}`);
    }
}

function updateAllChamberPairStates() {
    document.querySelectorAll('#chambers-grid > .chamber-category').forEach(updateChamberPairState);
}

window.addEventListener('tezos:explore-layout-sync', updateAllChamberPairStates);

function getKnownProtocols() {
    if (Array.isArray(state.protocols) && state.protocols.length) return state.protocols;
    const cached = loadProtocols();
    return Array.isArray(cached) ? cached : [];
}

const PROTOCOL_ENTRY_RECENT_FALLBACK = Object.freeze([
    { name: 'Paris C', code: 20, countsAsUpgrade: false },
    { name: 'Quebec', code: 21 },
    { name: 'Rio', code: 22 },
    { name: 'Seoul', code: 23 },
    { name: 'Tallinn', code: 24 },
    { name: 'Ushuaia', code: 25, isCurrent: true }
]);

const PROTOCOL_ENTRY_CODE_HINTS = new Map(PROTOCOL_ENTRY_RECENT_FALLBACK.map((protocol) => [
    protocol.name.toLowerCase(),
    protocol
]));

function withProtocolEntryOrdinalHints(protocol) {
    const name = String(protocol?.name || '').trim().toLowerCase();
    const hint = PROTOCOL_ENTRY_CODE_HINTS.get(name);
    if (!hint) return protocol;
    return {
        ...hint,
        ...protocol,
        code: protocol?.code ?? protocol?.number ?? hint.code,
        countsAsUpgrade: protocol?.countsAsUpgrade ?? hint.countsAsUpgrade
    };
}

function getProtocolEntryOrdinal(protocol, protocols) {
    const shouldUseArchivePosition = countProtocolUpgrades(protocols, 0) >= CANONICAL_UPGRADE_COUNT;
    return getProtocolUpgradeOrdinal(protocol, shouldUseArchivePosition ? protocols : []);
}

function buildProtocolEntryRail(protocols) {
    const hasProtocols = Array.isArray(protocols) && protocols.length;
    const list = (hasProtocols ? protocols : PROTOCOL_ENTRY_RECENT_FALLBACK).map(withProtocolEntryOrdinalHints);
    const currentFirst = [...list].reverse().slice(0, 6);
    return currentFirst.map((protocol, index) => {
        const name = protocol?.name || `Chapter ${currentFirst.length - index}`;
        const classes = ['protocol-history-entry-spine-item'];
        if (protocol?.isCurrent || index === 0) classes.push('current');
        const ordinal = getProtocolEntryOrdinal(protocol, list);
        const chapter = index === 0 ? 'Now' : (ordinal === null ? 'Follow-up' : `Ch. ${ordinal}`);
        return `
            <span class="${classes.join(' ')}" title="${escapeHtml(name)}">
                <strong>${escapeHtml(name)}</strong>
                <small>${escapeHtml(chapter)}</small>
            </span>
        `;
    }).join('');
}

function protocolDate(protocol) {
    const raw = protocol?.date || protocol?.startTime;
    if (!raw) return null;
    const date = new Date(String(raw).includes('T') ? raw : `${raw}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? null : date;
}

function formatProtocolDate(protocol) {
    const date = protocolDate(protocol);
    if (!date) return '';
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function protocolRouteSlug(value) {
    return String(value?.name || value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function protocolStoryPath(value) {
    const slug = protocolRouteSlug(value);
    return slug ? `/anthology/${encodeURIComponent(slug)}/` : '/anthology/';
}

function protocolStoryUrl(value) {
    return new URL(protocolStoryPath(value), window.location.origin).toString();
}

function findProtocolByRouteValue(protocols, value) {
    const target = protocolRouteSlug(value);
    if (!target || !Array.isArray(protocols)) return null;
    return protocols.find((protocol) => protocolRouteSlug(protocol) === target)
        || protocols.find((protocol) => String(protocol?.name || '').toLowerCase() === String(value || '').trim().toLowerCase())
        || null;
}

function getProtocolStoryRouteValue() {
    const queryValue = new URLSearchParams(window.location.search).get('protocol');
    if (queryValue) return queryValue;
    const match = window.location.pathname.match(/^\/anthology\/([^/]+)\/?$/i);
    return match?.[1] ? decodeURIComponent(match[1]) : '';
}

function setProtocolStoryRoute(protocol, { replace = false } = {}) {
    const path = protocolStoryPath(protocol);
    const current = `${window.location.pathname}${window.location.search}`;
    if (current === path && !window.location.hash) return;
    const method = replace ? 'replaceState' : 'pushState';
    window.history[method]({
        ...(window.history.state || {}),
        tezosSystemsRoute: 'anthology-protocol',
        protocol: protocolRouteSlug(protocol)
    }, '', path);
}

function buildProtocolLoreMap(data) {
    const map = new Map();
    if (!Array.isArray(data?.protocols)) return map;
    data.protocols.forEach((protocol) => {
        if (protocol?.name) map.set(protocol.name.toLowerCase(), protocol);
        if (protocol?.hash) map.set(protocol.hash.slice(0, 8).toLowerCase(), protocol);
    });
    return map;
}

function findRichProtocol(protocol, loreMap) {
    if (!protocol || !loreMap) return null;
    const nameMatch = protocol.name ? loreMap.get(String(protocol.name).toLowerCase()) : null;
    if (nameMatch) return nameMatch;
    const hash = protocol.hash ? String(protocol.hash).slice(0, 8).toLowerCase() : '';
    return hash ? loreMap.get(hash) || null : null;
}

function mergeProtocolLore(protocols, loreData) {
    const loreMap = buildProtocolLoreMap(loreData);
    const source = Array.isArray(protocols) && protocols.length
        ? protocols
        : (Array.isArray(loreData?.protocols) ? loreData.protocols : []);

    return source.map((protocol) => {
        const rich = findRichProtocol(protocol, loreMap) || {};
        return {
            ...rich,
            ...protocol,
            date: rich.date || protocol.date || protocol.startTime || null,
            block: rich.block ?? protocol.block ?? protocol.firstLevel ?? null,
            headline: rich.headline || protocol.headline || protocol.highlight || 'Self-amendment protocol upgrade',
            changes: Array.isArray(rich.changes) ? rich.changes : (Array.isArray(protocol.changes) ? protocol.changes : []),
            blockTime: rich.blockTime ?? protocol.blockTime ?? null,
            debate: rich.debate || protocol.debate || null,
            history: rich.history || protocol.history || null,
            contention: Boolean(protocol.contention || rich.contention || rich.history),
            isCurrent: Boolean(protocol.isCurrent)
        };
    });
}

function summarizeProtocolSpan(protocols) {
    const dates = protocols.map(protocolDate).filter(Boolean).sort((a, b) => a - b);
    if (!dates.length) return 'dates syncing';
    const first = dates[0].getUTCFullYear();
    const last = dates[dates.length - 1].getUTCFullYear();
    return first === last ? String(first) : `${first}-${last}`;
}

function renderProtocolAlphabetMarch(protocols = [], currentProtocol = null) {
    const root = document.getElementById('protocol-alphabet-march');
    if (!root) return;
    const currentLetter = String(currentProtocol?.name || protocols[protocols.length - 1]?.name || 'A').charAt(0).toUpperCase();
    const usedLetters = new Set(protocols.map((protocol) => String(protocol?.name || '').charAt(0).toUpperCase()).filter(Boolean));
    const letters = Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index));
    const remaining = Math.max(0, 90 - currentLetter.charCodeAt(0));

    root.innerHTML = `
        <div class="protocol-alphabet-row" aria-label="Protocol alphabet march">
            ${letters.map((letter) => {
                const classes = ['protocol-alphabet-letter'];
                if (letter === currentLetter) classes.push('is-current');
                else if (usedLetters.has(letter)) classes.push('is-past');
                else classes.push('is-unused');
                return `<span class="${classes.join(' ')}">${letter}</span>`;
            }).join('<span class="protocol-alphabet-dot" aria-hidden="true">·</span>')}
        </div>
        <p>${remaining} letter${remaining === 1 ? '' : 's'} left in this alphabet. The chain will outlive it.</p>
    `;
}

function anthologyChapterSearchText(protocol) {
    return [
        protocol?.name,
        protocol?.headline,
        protocol?.debate,
        protocol?.history?.title,
        protocol?.history?.subtitle,
        ...protocolAnthologyTopics(protocol),
        ...(protocol?.changes || [])
    ].filter(Boolean).join(' ').toLowerCase();
}

const ANTHOLOGY_LENS_META = Object.freeze({
    governance: {
        eyebrow: 'Rules & power',
        title: 'How Tezos decides',
        copy: 'Proposal thresholds, ballot mechanics, rejections, and governance flashpoints.',
        trail: 'Babylon · Granada · Oxford · Quebec'
    },
    scaling: {
        eyebrow: 'Speed & scale',
        title: 'How Tezos got faster',
        copy: 'Shorter blocks, rollups, the DAL, and the infrastructure behind Tezos X.',
        trail: 'Granada · Mumbai · Paris · Ushuaia'
    },
    economics: {
        eyebrow: 'Money & incentives',
        title: 'How the economics moved',
        copy: 'Liquidity Baking, staking, issuance, rewards, and the arguments around them.',
        trail: 'Granada · Ithaca · Oxford · Quebec'
    }
});

function protocolAnthologyTopics(protocol) {
    const text = [
        protocol?.name,
        protocol?.headline,
        protocol?.debate,
        protocol?.history?.title,
        protocol?.history?.subtitle,
        ...(protocol?.changes || [])
    ].filter(Boolean).join(' ').toLowerCase();
    const topics = [];
    if (/govern|vote|proposal|ballot|quorum|adoption|rejection|amendment|threshold/.test(text)) topics.push('governance');
    if (/rollup|dal|block time|bandwidth|throughput|gas|scal|operation|pvm/.test(text)) topics.push('scaling');
    if (/liquidity|issuance|inflation|reward|stake|staking|delegation|slashing|subsid|economic|baking threshold/.test(text)) topics.push('economics');
    if (/consensus|tenderbake|emmy|finality|attestation|baker|bls|randomness/.test(text)) topics.push('consensus');
    return topics.length ? topics : ['protocol'];
}

function protocolAnthologyEra(protocol) {
    const year = protocolDate(protocol)?.getUTCFullYear() || 0;
    if (year <= 2020) return { id: 'foundations', title: 'Foundations', span: '2019–2020', copy: 'The first amendments proved the chain could change itself.' };
    if (year <= 2022) return { id: 'expansion', title: 'Expansion & finality', span: '2021–2022', copy: 'Economic experiments, faster blocks, and Tenderbake reshaped the network.' };
    if (year <= 2024) return { id: 'rollups', title: 'The rollup era', span: '2023–2024', copy: 'Smart Rollups, the DAL, and staking economics moved toward production.' };
    return { id: 'scale', title: 'Tezos X runway', span: '2025–now', copy: 'Faster consensus and more data capacity opened the current scaling chapter.' };
}

function protocolAnthologyTone(protocol) {
    const ordinal = Number(getProtocolUpgradeOrdinal(protocol, [])) || Number(protocol?.number) || 1;
    return ['mint', 'violet', 'coral'][Math.abs(ordinal) % 3];
}

function protocolBriefExcerpt(value, maxLength = 260) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (text.length <= maxLength) return text;
    const clipped = text.slice(0, maxLength + 1);
    const boundary = clipped.lastIndexOf(' ');
    return `${clipped.slice(0, boundary > maxLength * 0.7 ? boundary : maxLength).trim()}…`;
}

function buildAnthologyChapterLink(protocol, protocols, { featured = false } = {}) {
    const ordinal = getProtocolUpgradeOrdinal(protocol, protocols);
    const longRead = Boolean(protocol?.history?.sections?.length);
    const debated = Boolean(protocol?.debate || protocol?.contention || protocol?.history);
    const classes = ['protocol-anthology-chapter'];
    if (featured) classes.push('is-featured');
    if (protocol?.isCurrent) classes.push('is-current');
    const topics = protocolAnthologyTopics(protocol);
    const badges = topics.slice(0, 3).map((topic) => `<span>${escapeHtml(topic)}</span>`).join('');
    const ordinalLabel = ordinal === null ? 'Follow-up' : `Chapter ${String(ordinal).padStart(2, '0')}`;
    return `
        <a class="${classes.join(' ')}"
           href="${escapeHtml(protocolStoryPath(protocol))}"
           data-protocol-open="${escapeHtml(protocol.name)}"
           data-anthology-topics="${escapeHtml(topics.join(' '))}"
           data-anthology-tone="${protocolAnthologyTone(protocol)}"
           data-anthology-long-read="${longRead ? 'true' : 'false'}"
           data-anthology-debated="${debated ? 'true' : 'false'}"
           data-anthology-search="${escapeHtml(anthologyChapterSearchText(protocol))}">
            <span class="protocol-anthology-chapter-number"><small>${escapeHtml(ordinalLabel)}</small><b>${escapeHtml(String(protocolDate(protocol)?.getUTCFullYear() || ''))}</b></span>
            <span class="protocol-anthology-chapter-copy">
                <span class="protocol-anthology-chapter-heading">
                    <strong>${escapeHtml(protocol.name)}</strong>
                    <time datetime="${escapeHtml(protocol.date || '')}">${escapeHtml(formatProtocolDate(protocol))}</time>
                </span>
                <span class="protocol-anthology-chapter-summary">${escapeHtml(protocol.history?.title || protocol.headline || 'Open protocol context')}</span>
                ${protocol?.changes?.[0] ? `<span class="protocol-anthology-chapter-move"><b>Key move</b> ${escapeHtml(protocol.changes[0])}</span>` : ''}
                ${badges ? `<span class="protocol-anthology-chapter-badges">${badges}</span>` : ''}
            </span>
            <span class="protocol-anthology-chapter-open" aria-hidden="true"><small>${longRead ? 'Deep read' : 'Quick read'}</small><b>Open →</b></span>
        </a>
    `;
}

function applyAnthologyLibraryFilters(board) {
    const input = board.querySelector('#protocol-anthology-search');
    const activeFilter = board.querySelector('[data-anthology-filter].is-active')?.dataset.anthologyFilter || 'all';
    const activeLens = board.dataset.anthologyLens || 'all';
    const query = String(input?.value || '').trim().toLowerCase();
    let visible = 0;
    board.querySelectorAll('.protocol-anthology-list .protocol-anthology-chapter').forEach((chapter) => {
        const filterMatch = activeFilter === 'all'
            || (activeFilter === 'long' && chapter.dataset.anthologyLongRead === 'true')
            || (activeFilter === 'debate' && chapter.dataset.anthologyDebated === 'true');
        const lensMatch = activeLens === 'all'
            || String(chapter.dataset.anthologyTopics || '').split(/\s+/).includes(activeLens);
        const searchMatch = !query || chapter.dataset.anthologySearch.includes(query);
        chapter.hidden = !(filterMatch && lensMatch && searchMatch);
        if (!chapter.hidden) visible += 1;
    });
    board.querySelectorAll('.protocol-anthology-era').forEach((era) => {
        era.hidden = !era.querySelector('.protocol-anthology-chapter:not([hidden])');
    });
    const count = board.querySelector('#protocol-anthology-results');
    if (count) count.textContent = `${visible} chapter${visible === 1 ? '' : 's'}`;
    const empty = board.querySelector('.protocol-anthology-empty');
    if (empty) empty.hidden = visible !== 0;
}

async function renderProtocolAnthologyBoard(protocols, currentProtocol = null) {
    const board = document.getElementById('protocol-history-anthology-board');
    if (!board) return;

    const data = await loadProtocolData();
    const enriched = mergeProtocolLore(protocols, data);
    if (!enriched.length) {
        board.innerHTML = '<div class="protocol-anthology-loading">Protocol archive is still syncing.</div>';
        return;
    }

    const ordered = [...enriched].reverse();
    const current = currentProtocol
        ? enriched.find((protocol) => protocol.name === currentProtocol.name) || currentProtocol
        : enriched.find((protocol) => protocol.isCurrent) || enriched[enriched.length - 1];
    renderProtocolAlphabetMarch(enriched, current);
    const longReads = enriched.filter((protocol) => protocol.history?.sections?.length);
    const debated = enriched.filter((protocol) => protocol.debate || protocol.contention || protocol.history);
    const chapterCount = countProtocolUpgrades(enriched);
    const eras = [];
    ordered.forEach((protocol) => {
        const era = protocolAnthologyEra(protocol);
        let group = eras.find((candidate) => candidate.id === era.id);
        if (!group) {
            group = { ...era, protocols: [] };
            eras.push(group);
        }
        group.protocols.push(protocol);
    });
    const signature = JSON.stringify(ordered.map((protocol) => [
        protocol.name,
        protocol.date,
        protocol.headline,
        protocol.history?.title,
        Boolean(protocol.history?.sections?.length),
        Boolean(protocol.debate || protocol.contention)
    ]));
    if (board.dataset.anthologySignature === signature && board.querySelector('.protocol-anthology-library')) return;

    const html = `
        <div class="protocol-anthology-library">
            <section class="protocol-anthology-cover" aria-labelledby="protocol-anthology-cover-title">
                <div class="protocol-anthology-cover-copy">
                    <span class="feature-kicker">The living constitution of Tezos</span>
                    <h3 id="protocol-anthology-cover-title">A chain that<br><em>keeps rewriting itself.</em></h3>
                    <p>Follow the decisions, breakthroughs, reversals, and arguments that turned on-chain governance into a running history.</p>
                    <div class="protocol-anthology-cover-actions">
                        <a href="${escapeHtml(protocolStoryPath(current))}" data-protocol-open="${escapeHtml(current?.name || '')}">Read today’s chapter <span aria-hidden="true">→</span></a>
                        <button type="button" data-anthology-jump>Browse every chapter</button>
                    </div>
                    <p class="protocol-anthology-cover-meta"><strong>${chapterCount} adopted upgrades</strong> · ${ordered.length} chapters · ${escapeHtml(summarizeProtocolSpan(enriched))}</p>
                </div>
                <a class="protocol-anthology-current-cover" href="${escapeHtml(protocolStoryPath(current))}" data-protocol-open="${escapeHtml(current?.name || '')}" data-anthology-tone="violet">
                    <span class="protocol-anthology-current-spine"><small>Now running</small><b>${escapeHtml(String(getProtocolUpgradeOrdinal(current, enriched) || ''))}</b></span>
                    <span class="protocol-anthology-current-copy">
                        <small>Current protocol · ${escapeHtml(formatProtocolDate(current))}</small>
                        <strong>${escapeHtml(current?.name || 'Current protocol')}</strong>
                        <span>${escapeHtml(current?.history?.title || current?.headline || 'The current operating chapter of Tezos.')}</span>
                        <em>${escapeHtml(current?.changes?.[0] || 'Open the chapter')} <b aria-hidden="true">↗</b></em>
                    </span>
                </a>
            </section>
            <section class="protocol-anthology-ways" aria-labelledby="protocol-anthology-ways-title">
                <div class="protocol-anthology-section-head">
                    <div><span class="feature-kicker">Three ways in</span><h3 id="protocol-anthology-ways-title">Pick the question you care about.</h3></div>
                    <p>Each lens reshuffles the same factual archive. Chapters can belong to more than one story.</p>
                </div>
                <div class="protocol-anthology-lenses">
                    ${Object.entries(ANTHOLOGY_LENS_META).map(([id, lens], index) => `
                        <button type="button" data-anthology-lens="${id}" data-anthology-tone="${['mint', 'violet', 'coral'][index]}">
                            <span>${escapeHtml(lens.eyebrow)}</span>
                            <strong>${escapeHtml(lens.title)}</strong>
                            <small>${escapeHtml(lens.copy)}</small>
                            <em>${escapeHtml(lens.trail)}</em>
                        </button>
                    `).join('')}
                </div>
            </section>
            <section class="protocol-anthology-index" aria-labelledby="protocol-anthology-index-title">
                <div class="protocol-anthology-index-head">
                    <div>
                        <span class="feature-kicker">The complete field guide · newest first</span>
                        <h3 id="protocol-anthology-index-title">Find a protocol</h3>
                    </div>
                    <span id="protocol-anthology-results" role="status" aria-live="polite">${ordered.length} chapters</span>
                </div>
                <div class="protocol-anthology-toolbar">
                    <label class="protocol-anthology-search">
                        <span class="sr-only">Search Protocol Anthology</span>
                        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg>
                        <input id="protocol-anthology-search" type="search" placeholder="Try ‘block time’, ‘rollups’, or ‘liquidity’" autocomplete="off">
                    </label>
                    <div class="protocol-anthology-filters" role="group" aria-label="Filter protocol chapters">
                        <button class="is-active" type="button" data-anthology-filter="all" aria-pressed="true">All</button>
                        <button type="button" data-anthology-filter="long" aria-pressed="false">Deep reads</button>
                        <button type="button" data-anthology-filter="debate" aria-pressed="false">Debate files</button>
                    </div>
                </div>
                <div class="protocol-anthology-list">
                    ${eras.map((era) => `
                        <section class="protocol-anthology-era" data-anthology-era="${era.id}" aria-labelledby="protocol-era-${era.id}">
                            <header><span>${escapeHtml(era.span)}</span><div><h4 id="protocol-era-${era.id}">${escapeHtml(era.title)}</h4><p>${escapeHtml(era.copy)}</p></div></header>
                            <div>${era.protocols.map((protocol) => buildAnthologyChapterLink(protocol, enriched)).join('')}</div>
                        </section>
                    `).join('')}
                </div>
                <p class="protocol-anthology-empty" hidden>No chapters match that search.</p>
            </section>
            <p class="protocol-anthology-library-status" role="status" aria-live="polite"></p>
        </div>
    `;
    quietlySyncHtml(board, html);
    board.dataset.anthologySignature = signature;

    if (!board.dataset.protocolAnthologyWired) {
        board.addEventListener('click', (event) => {
            const jump = event.target.closest('[data-anthology-jump]');
            if (jump) {
                board.querySelector('#protocol-anthology-index-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                window.setTimeout(() => board.querySelector('#protocol-anthology-search')?.focus({ preventScroll: true }), 260);
                return;
            }
            const lens = event.target.closest('[data-anthology-lens]');
            if (lens) {
                const nextLens = board.dataset.anthologyLens === lens.dataset.anthologyLens ? 'all' : lens.dataset.anthologyLens;
                board.dataset.anthologyLens = nextLens;
                board.querySelectorAll('[data-anthology-lens]').forEach((button) => {
                    const active = nextLens !== 'all' && button.dataset.anthologyLens === nextLens;
                    button.classList.toggle('is-active', active);
                    button.setAttribute('aria-pressed', active ? 'true' : 'false');
                });
                applyAnthologyLibraryFilters(board);
                board.querySelector('#protocol-anthology-index-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                return;
            }
            const filter = event.target.closest('[data-anthology-filter]');
            if (filter) {
                board.querySelectorAll('[data-anthology-filter]').forEach((button) => {
                    const active = button === filter;
                    button.classList.toggle('is-active', active);
                    button.setAttribute('aria-pressed', active ? 'true' : 'false');
                });
                applyAnthologyLibraryFilters(board);
                return;
            }
            const trigger = event.target.closest('[data-protocol-open]');
            const name = trigger?.getAttribute('data-protocol-open');
            if (!name) return;
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            openProtocolHistoryByName(name);
        });
        board.addEventListener('input', (event) => {
            if (event.target.matches('#protocol-anthology-search')) applyAnthologyLibraryFilters(board);
        });
        board.dataset.protocolAnthologyWired = '1';
    }
}

function updateProtocolHistoryEntryCard(protocols = getKnownProtocols()) {
    const card = document.getElementById('protocol-history-entry-card');
    if (!card) return;

    const list = Array.isArray(protocols) ? protocols : [];
    const currentProtocol = list.find((protocol) => protocol.isCurrent) || list[list.length - 1] || null;
    const count = Math.max(CANONICAL_UPGRADE_COUNT, countProtocolUpgrades(list, 0));
    const currentName = currentProtocol?.name || document.getElementById('header-current-protocol')?.textContent?.trim() || 'Ushuaia';

    const countEl = card.querySelector('#protocol-history-entry-count');
    if (countEl) countEl.textContent = String(count);
    const currentEl = card.querySelector('#protocol-history-entry-current');
    if (currentEl) currentEl.textContent = currentName;
    const railEl = card.querySelector('#protocol-history-entry-rail');
    if (railEl) railEl.innerHTML = buildProtocolEntryRail(list);

    card.dataset.updatedLabel = `Current chapter: ${currentName}`;
    const description = card.querySelector('#protocol-history-entry-description');
    if (description) {
        description.textContent = `Start at ${currentName}, then unfold the amendment anthology backward through lore, impact views, disputes, and receipts.`;
    }
    syncChamberEntryFooter(card);
    updateAllChamberPairStates();
}

function ensureProtocolHistoryEntryCard() {
    const grid = document.getElementById('chambers-grid');
    if (!grid) return null;

    let card = document.getElementById('protocol-history-entry-card');
    if (!card) {
        card = document.createElement('div');
        card.id = 'protocol-history-entry-card';
        card.className = 'stat-card chamber-entry-card chamber-entry-wide protocol-history-entry-card chamber-entry-adoption';
        card.innerHTML = `
            <button class="card-copy-link" type="button" data-copy-hash="#protocol-history" aria-label="Copy Protocol Anthology direct link" title="Copy Protocol Anthology link">🔗</button>
            <div class="card-inner">
                <div class="card-front protocol-history-entry-front">
                    <h2 class="stat-label" id="protocol-history-entry-title">Protocol Anthology</h2>
                    <div class="protocol-history-entry-anthology">
                        <div class="protocol-history-entry-count">
                            <span>Volume</span>
                            <strong id="protocol-history-entry-count">21</strong>
                            <em>chapters</em>
                        </div>
                        <div class="protocol-history-entry-core">
                            <div class="protocol-history-entry-current">
                                <span>Current chapter</span>
                                <strong id="protocol-history-entry-current">Ushuaia</strong>
                                <small>Running now on Tezos</small>
                            </div>
                            <p class="stat-description" id="protocol-history-entry-description">Start at Ushuaia, then unfold the amendment anthology backward through lore, impact views, disputes, and receipts.</p>
                            <div class="protocol-history-entry-facets" aria-label="Protocol anthology sections">
                                <span><strong>Lore</strong><small>why it mattered</small></span>
                                <span><strong>Impact</strong><small>what changed</small></span>
                                <span><strong>Memory</strong><small>amendment trail</small></span>
                            </div>
                        </div>
                    </div>
                    <div class="protocol-history-entry-rail protocol-history-entry-spine" id="protocol-history-entry-rail" aria-label="Recent Tezos protocol chapters"></div>
                </div>
                <div class="card-back" aria-hidden="true">
                    <h2 class="stat-label">Protocol Anthology</h2>
                    <div class="stat-value">Lore</div>
                    <p class="stat-description">Open the self-amendment anthology.</p>
                </div>
            </div>
        `;
        grid.appendChild(card);
    }

    wireChamberLauncher(card, {
        open: openProtocolHistoryChamber,
        label: 'Open Protocol Anthology Chamber',
        titleSelector: '#protocol-history-entry-title, .stat-label'
    });
    card.dataset.protocolHistoryWired = '1';

    updateProtocolHistoryEntryCard(getKnownProtocols());
    return card;
}

function setChamberCategoryExpanded(category, expanded) {
    if (!category) return;
    const nextExpanded = Boolean(expanded);
    category.dataset.chamberExpanded = String(nextExpanded);
    const toggle = category.querySelector(':scope > .chamber-category-head > .chamber-category-toggle');
    const cards = category.querySelector(':scope > .chamber-category-cards');
    toggle?.setAttribute('aria-expanded', String(nextExpanded));
    if (cards) cards.hidden = !nextExpanded;
}

function isChamberCategoryExpanded(category) {
    return category?.dataset.chamberExpanded === 'true';
}

function hydrateExpandedChamberCategory(category) {
    category?.querySelectorAll?.('[data-chamber-entry-id]').forEach((card) => {
        const entryId = card.dataset.chamberEntryId;
        if (!entryId || !CHAMBER_FEATURES[entryId]) return;
        _lazyChamberObserver?.unobserve(card);
        loadChamberFeature(entryId).catch((error) => console.warn(`Failed to hydrate ${entryId} Chamber launcher`, error));
    });
}

function wireChamberCategory(category) {
    const toggle = category?.querySelector(':scope > .chamber-category-head > .chamber-category-toggle');
    if (!toggle || toggle.dataset.chamberCategoryWired === '1') return;
    toggle.dataset.chamberCategoryWired = '1';
    let scrollRepairSerial = 0;
    toggle.addEventListener('click', () => {
        const repairSerial = ++scrollRepairSerial;
        const scrollX = window.scrollX;
        const scrollY = window.scrollY;
        const maxRestoreFrames = 8;
        let restoreFrame = 0;
        let readerScrollIntent = false;
        const markReaderScrollIntent = () => { readerScrollIntent = true; };
        const markReaderKeyIntent = (keyEvent) => {
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Spacebar'].includes(keyEvent.key)) {
                markReaderScrollIntent();
            }
        };
        const scrollIntentOptions = { capture: true, passive: true };
        window.addEventListener('wheel', markReaderScrollIntent, scrollIntentOptions);
        window.addEventListener('touchmove', markReaderScrollIntent, scrollIntentOptions);
        window.addEventListener('pointerdown', markReaderScrollIntent, scrollIntentOptions);
        window.addEventListener('keydown', markReaderKeyIntent, true);
        const clearScrollIntentListeners = () => {
            window.removeEventListener('wheel', markReaderScrollIntent, true);
            window.removeEventListener('touchmove', markReaderScrollIntent, true);
            window.removeEventListener('pointerdown', markReaderScrollIntent, true);
            window.removeEventListener('keydown', markReaderKeyIntent, true);
        };
        const restoreScroll = () => {
            const html = document.documentElement;
            const previousBehavior = html.style.scrollBehavior;
            html.style.scrollBehavior = 'auto';
            window.scrollTo(scrollX, scrollY);
            html.style.scrollBehavior = previousBehavior;
        };
        const restoreBrowserShift = () => {
            if (repairSerial !== scrollRepairSerial || readerScrollIntent || document.activeElement !== toggle) {
                clearScrollIntentListeners();
                return;
            }
            if (window.scrollX !== scrollX || window.scrollY !== scrollY) restoreScroll();
            restoreFrame += 1;
            if (restoreFrame < maxRestoreFrames) requestAnimationFrame(restoreBrowserShift);
            else clearScrollIntentListeners();
        };
        const nextExpanded = !isChamberCategoryExpanded(category);
        setChamberCategoryExpanded(category, nextExpanded);
        if (nextExpanded) hydrateExpandedChamberCategory(category);
        category.getBoundingClientRect();
        if (window.scrollX !== scrollX || window.scrollY !== scrollY) restoreScroll();
        requestAnimationFrame(restoreBrowserShift);
    });
}

function createChamberCategory(categoryConfig) {
    const category = document.createElement('section');
    category.className = 'chamber-card-pair chamber-category';
    category.dataset.chamberCategory = categoryConfig.key;
    const expanded = chamberCategoryShouldStartExpanded(categoryConfig.key);

    const head = document.createElement('div');
    head.className = 'chamber-category-head';

    const toggle = document.createElement('button');
    toggle.className = 'chamber-category-toggle';
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.setAttribute('aria-controls', `chamber-category-${categoryConfig.key}-cards`);

    const name = document.createElement('span');
    name.className = 'chamber-category-name';
    name.setAttribute('role', 'heading');
    name.setAttribute('aria-level', '3');
    name.textContent = categoryConfig.label;

    const question = document.createElement('span');
    question.className = 'chamber-category-question';
    question.textContent = categoryConfig.question;

    const rule = document.createElement('span');
    rule.className = 'chamber-category-rule';
    rule.setAttribute('aria-hidden', 'true');

    const count = document.createElement('span');
    count.className = 'chamber-category-count';
    count.textContent = '00';
    count.setAttribute('aria-label', '0 rooms');

    const cue = document.createElement('span');
    cue.className = 'chamber-category-cue';
    cue.setAttribute('aria-hidden', 'true');
    cue.textContent = '⌄';

    const hide = document.createElement('button');
    hide.className = 'chamber-category-hide';
    hide.type = 'button';
    hide.dataset.chamberCategoryHide = categoryConfig.key;
    hide.setAttribute('aria-label', `Hide ${categoryConfig.label} category`);
    hide.title = `Hide ${categoryConfig.label}`;
    hide.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 10.7a2 2 0 002.7 2.7M9.9 4.2A10.8 10.8 0 0112 4c5.2 0 8.8 5.3 8.8 5.3a13 13 0 01-2.3 2.7M6.2 6.2A15.7 15.7 0 003.2 9.3S6.8 14.7 12 14.7c1 0 1.9-.2 2.7-.5"/></svg>';

    const cards = document.createElement('div');
    cards.className = 'chamber-category-cards';
    cards.id = `chamber-category-${categoryConfig.key}-cards`;
    cards.hidden = !expanded;

    toggle.append(name, question, rule, count, cue);
    head.append(toggle, hide);
    category.append(head, cards);
    category.dataset.chamberExpanded = String(expanded);
    wireChamberCategory(category);
    return category;
}

function revealChamberCategory(categoryKey, { savePreference = false } = {}) {
    if (!categoryKey) return;
    _pendingChamberCategoryKey = categoryKey;
    if (savePreference) setChamberCategoryVisible(categoryKey, true, 'deep-link');
    const category = document.querySelector(
        `#chambers-grid > .chamber-category[data-chamber-category="${categoryKey}"]`
    );
    if (category) setChamberCategoryExpanded(category, true);
}

function revealChamberCategoryForEntry(entry, options = {}) {
    if (options.savePreference && CHAMBER_CARD_TARGETS[entry?.id]) {
        setChamberRoomVisible(entry.id, true, 'deep-link');
        revealChamberCategory(entry?.chamberCategory || '', { ...options, savePreference: false });
        return;
    }
    revealChamberCategory(entry?.chamberCategory || '', options);
}

function orderChambersSurface() {
    const grid = document.getElementById('chambers-grid');
    if (!grid) return;
    grid.style.overflowAnchor = 'none';

    quietlyMutate(grid, () => {
        grid.classList.add('chambers-paired-grid');
        const orderedCards = [];
        let previousCategory = null;

        CHAMBER_CATEGORY_META.forEach((categoryConfig) => {
            let category = grid.querySelector(
                `:scope > .chamber-category[data-chamber-category="${categoryConfig.key}"]`
            );
            if (!category) category = createChamberCategory(categoryConfig);
            if (category.dataset.chamberShell === '1' && category.dataset.chamberShellInitialized !== '1') {
                setChamberCategoryExpanded(category, chamberCategoryShouldStartExpanded(categoryConfig.key));
                category.dataset.chamberShellInitialized = '1';
            }
            wireChamberCategory(category);
            const categoryCards = category.querySelector(':scope > .chamber-category-cards');
            let previousCard = null;

            categoryConfig.entryIds.forEach((entryId) => {
                const target = CHAMBER_CARD_TARGETS[entryId];
                if (!target) return;
                const card = document.querySelector(target.selector);
                if (!card) return;
                card.dataset.chamberEntryId = entryId;
                card.dataset.chamberLayout = target.layout;
                const reservedSlot = categoryCards?.querySelector(`:scope > [data-chamber-slot="${entryId}"]`);
                if (reservedSlot && card.parentElement !== categoryCards) reservedSlot.replaceWith(card);
                const expectedCard = previousCard
                    ? previousCard.nextElementSibling
                    : categoryCards?.firstElementChild;
                if (categoryCards && (card.parentElement !== categoryCards || card !== expectedCard)) {
                    categoryCards.insertBefore(card, expectedCard || null);
                }
                previousCard = card;
                orderedCards.push(card);
            });

            const cardCount = categoryCards?.querySelectorAll(':scope > .stat-card').length || 0;
            if (cardCount) {
                if (chamberCategoryShouldStartExpanded(categoryConfig.key)) setChamberCategoryExpanded(category, true);
                const expectedNode = previousCategory
                    ? previousCategory.nextElementSibling
                    : grid.firstElementChild;
                if (category.parentElement !== grid || category !== expectedNode) {
                    grid.insertBefore(category, expectedNode);
                }
                previousCategory = category;
            }
            updateChamberPairState(category);
        });

        grid.dataset.chambersOrder = orderedCards.map((card) => card.id || card.dataset.stat || '').join(',');
        syncChamberEntryFooters(grid);
        updateAllChamberPairStates();
    });

    if (!_chamberPairObserver) {
        _chamberPairObserver = new MutationObserver((records) => {
            const hasLateDirectCard = records.some((record) => (
                record.type === 'childList'
                && record.target === grid
                && Array.from(record.addedNodes).some((node) => (
                    node instanceof Element && node.matches('.stat-card')
                ))
            ));
            if (hasLateDirectCard) {
                orderChambersSurface();
                return;
            }
            updateAllChamberPairStates();
            syncChamberEntryFooters(grid);
        });
        _chamberPairObserver.observe(grid, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ['class', 'data-chamber-entry-size', 'data-etherlink-governance-size', 'data-tz4-entry-size', 'data-updated-label']
        });
    }
}

function initChambersSurface() {
    initStaticChamberEntry('anthology', ensureProtocolHistoryEntryCard);
    orderChambersSurface();
}

function initProtocolHistoryChamber() {
    ensureProtocolHistoryEntryCard();
    orderChambersSurface();
}

function initProtocolHistoryHeaderLauncher() {
    const chip = document.getElementById('header-protocol-chip');
    if (!chip || chip.dataset.protocolHistoryLauncher === 'ready') return;
    chip.dataset.protocolHistoryLauncher = 'ready';
    chip.addEventListener('click', (event) => {
        event.preventDefault();
        if (window.location.hash !== '#protocol-history') {
            window.history.pushState(null, '', '#protocol-history');
        }
        openProtocolHistoryChamber();
    });
}

function initChambersToggle() {
    const toggleBtn = document.getElementById('chambers-toggle');
    if (!toggleBtn) return;

    function updateVis(isVisible) {
        setLauncherToggleState(toggleBtn, isVisible);
        toggleBtn.title = `Tezos Chambers: ${isVisible ? 'Showing' : 'Hidden'}`;
    }

    toggleBtn.addEventListener('click', () => {
        setHomeBlockVisible('explore', !isHomeBlockVisible('explore'), 'explore-menu');
    });

    window.addEventListener('tezos:home-layout-change', (event) => {
        if (event.detail?.id === 'explore') updateVis(event.detail.visible);
    });

    updateVis(isHomeBlockVisible('explore'));
}

function updateTz4ChamberTile(stats) {
    if (!stats) return;
    if (stats.tz4Percentage === null || stats.tz4Percentage === undefined || stats.tz4Percentage === '') return;
    const percentage = Number(stats.tz4Percentage);
    if (!Number.isFinite(percentage)) return;

    const card = document.querySelector('.stat-card[data-stat="tz4-adoption"]');
    if (card) flipCard(card, percentage, formatTz4Progress);
    const tz4Desc = document.getElementById('tz4-description');
    if (!tz4Desc) return;

    if (card?.dataset.tz4PowerDescription) {
        tz4Desc.textContent = card.dataset.tz4PowerDescription;
        return;
    }

    const tz4Bakers = Number(stats.tz4Bakers);
    const totalBakers = Number(stats.totalBakers);
    if (Number.isFinite(tz4Bakers) && Number.isFinite(totalBakers) && totalBakers > 0) {
        tz4Desc.textContent = `${tz4Bakers} / ${totalBakers} bakers active`;
    } else {
        tz4Desc.textContent = 'BLS baker adoption';
    }
}

function syncLiveSparklineMetrics(stats) {
    if (!stats) return;

    let hasMetric = false;
    for (const [metric, statKey] of SPARKLINE_LIVE_METRICS) {
        if (!(statKey in stats)) continue;
        const rawValue = stats[statKey];
        if (rawValue === null || rawValue === undefined || rawValue === '') continue;
        const value = Number(rawValue);
        if (!Number.isFinite(value)) continue;
        setLatestLiveMetric(metric, value);
        hasMetric = true;
    }

    if (hasMetric) updateSparklines();
}

// ==========================================
// TEZOS STATS TOGGLE (5 metric sections)
// ==========================================
const STATS_VISIBLE_KEY = 'tezos-systems-stats-visible';

let statsDataLoaded = false;

function initTezosStatsToggle() {
    const toggleBtn = document.getElementById('tezos-stats-toggle');
    if (!toggleBtn) return;

    const sections = document.querySelectorAll('.tezos-stats-section');
    if (toggleBtn.dataset.openChamber === 'network-pulse') {
        sections.forEach(s => s.style.display = 'none');
        setLauncherToggleState(toggleBtn, false);
        toggleBtn.title = 'Network Pulse Chamber: Open';
        toggleBtn.addEventListener('click', (event) => {
            event.preventDefault();
            navigateSiteMapEntry('pulse');
        });
        return;
    }

    function updateVis(isVisible) {
        sections.forEach(s => s.style.display = isVisible ? '' : 'none');
        setLauncherToggleState(toggleBtn, isVisible);
        toggleBtn.title = `Network Pulse: ${isVisible ? 'Showing' : 'Hidden'}`;
    }

    async function loadStatsIfNeeded() {
        if (statsDataLoaded) return;
        statsDataLoaded = true;
        debugLog('📊 Fetching Tezos Stats on demand...');
        try {
            const newStats = await fetchAllStats();
            saveStats(newStats);
            await updateStats(newStats);
            state.lastUpdate = statsObservationDate(newStats);
            updateLastRefreshTime();
            reportDataQuality(newStats);
        } catch (e) {
            console.error('Stats fetch failed:', e);
            statsDataLoaded = false; // retry on next toggle
        }
    }

    toggleBtn.addEventListener('click', async () => {
        const stored = localStorage.getItem(STATS_VISIBLE_KEY);
        const isVisible = stored === 'true';
        const newState = !isVisible;
        localStorage.setItem(STATS_VISIBLE_KEY, String(newState));
        updateVis(newState);
        if (newState) await loadStatsIfNeeded();
        if (newState) refreshNetworkHealth({ force: true });
    });

    // Default OFF: first visitors get the protocol panel plus chambers only.
    const stored = localStorage.getItem(STATS_VISIBLE_KEY);
    const isVisible = stored === 'true';
    updateVis(isVisible);
    if (isVisible) loadStatsIfNeeded();
}

const COMPARISON_VISIBLE_KEY = 'tezos-systems-comparison-visible';

function initComparisonToggle() {
    const section = document.getElementById('comparison-section');
    const toggleBtn = document.getElementById('comparison-toggle');
    if (!section || !toggleBtn) return;

    function updateVis(isVisible) {
        section.classList.toggle('visible', isVisible);
        setLauncherToggleState(toggleBtn, isVisible);
        toggleBtn.title = `Chain Comparisons: ${isVisible ? 'Showing' : 'Hidden'}`;
    }

    toggleBtn.addEventListener('click', () => {
        const stored = localStorage.getItem(COMPARISON_VISIBLE_KEY);
        const isVisible = stored === 'true'; // null = false (default OFF)
        const newState = !isVisible;
        localStorage.setItem(COMPARISON_VISIBLE_KEY, String(newState));
        updateVis(newState);
    });

    // Default ON (visible) unless user explicitly hid it
    const stored = localStorage.getItem(COMPARISON_VISIBLE_KEY);
    const isVisible = stored === 'true'; // null = false (default OFF)
    updateVis(isVisible);
}



// ==========================================
// DAILY BRIEFING TOGGLE (removed — briefing now in drawer)
// ==========================================

// ==========================================
// PRICE INTELLIGENCE TOGGLE
// ==========================================

function isPriceIntelligenceSelected() {
    return localStorage.getItem(PI_VISIBLE_KEY) === 'true';
}

function syncPriceIntelligenceVisibility(isVisible = isPriceIntelligenceSelected()) {
    const section = document.getElementById('price-intelligence');
    const toggleBtn = document.getElementById('price-intel-toggle');
    if (section) section.style.display = isVisible ? '' : 'none';
    if (!toggleBtn) return;
    setLauncherToggleState(toggleBtn, isVisible);
    toggleBtn.title = `XTZ Market Watch: ${isVisible ? 'Showing' : 'Hidden'}`;
}

function initPriceIntelToggle() {
    const toggleBtn = document.getElementById('price-intel-toggle');
    if (!toggleBtn) return;

    let piInitialized = false;

    toggleBtn.addEventListener('click', async () => {
        const isVisible = isPriceIntelligenceSelected();
        const newState = !isVisible;
        localStorage.setItem(PI_VISIBLE_KEY, String(newState));
        syncPriceIntelligenceVisibility(newState);

        if (newState && !piInitialized) {
            const piPrice = parseFloat(document.querySelector('.price-value')?.textContent?.replace(/[^0-9.]/g, '')) || 0;
            try {
                await initPriceIntelligence(state.currentStats || {}, piPrice);
                piInitialized = true;
            } catch (err) {
                console.warn('[price-intel] failed to initialize:', err);
            }
        }
        syncPriceIntelligenceVisibility();
    });

    // Default OFF — always call updateVis to set initial opacity
    const isVisible = isPriceIntelligenceSelected();
    syncPriceIntelligenceVisibility(isVisible);
    if (isVisible) {
        setTimeout(async () => {
            if (!isPriceIntelligenceSelected()) return;
            const piPrice = parseFloat(document.querySelector('.price-value')?.textContent?.replace(/[^0-9.]/g, '')) || 0;
            try {
                await initPriceIntelligence(state.currentStats || {}, piPrice);
                piInitialized = true;
            } catch (err) {
                console.warn('[price-intel] failed to initialize:', err);
            }
            syncPriceIntelligenceVisibility();
        }, 3000);
    }
}

// ==========================================
// LIVING UPTIME CLOCK
// ==========================================
const TOP_CONTINUITY_EXPLANATIONS = {
    'total-bakers': {
        kicker: 'Baker set',
        title: 'Permissionless operators are the continuity layer.',
        body: 'The latest active registrations include first-time and returning bakers. NEW means no earlier baked block was found before the latest activation.',
        chamberEntry: 'leaderboard',
        chamberLabel: 'Baker Directory Chamber'
    },
    finality: {
        kicker: 'Finality',
        title: 'Fast finality keeps the chain readable in real time.',
        body: 'The finality pill tracks recent block cadence so the top bar reflects how quickly new Tezos state settles.',
        chamberEntry: 'health',
        chamberLabel: 'Network Health Chamber'
    },
    'staking-ratio': {
        kicker: 'Staked supply',
        title: 'Staked XTZ is economic weight securing blocks.',
        body: 'The staking ratio combines own and external staked XTZ from TzKT so security participation is visible at a glance.',
        chamberEntry: 'staking',
        chamberLabel: 'Staking Chamber'
    },
    'issuance-rate': {
        kicker: 'Issuance',
        title: 'Adaptive issuance is part of the current economic contract.',
        body: 'This pill follows the live protocol issuance rate, including how the chain pays for staking and validation.',
        chamberEntry: 'staking',
        chamberLabel: 'Staking Chamber'
    }
};

function initUptimeClock() {
    const counterEl = document.getElementById('uptime-counter');
    const blockNumEl = document.getElementById('uptime-block-number');
    const blockAgeEl = document.getElementById('uptime-block-age');
    const pulseDot = document.getElementById('uptime-pulse-dot');
    const bakersEl = document.getElementById('uptime-bakers');
    const stakedEl = document.getElementById('uptime-staked');
    const issuanceEl = document.getElementById('uptime-issuance');
    const topContinuityPanel = document.getElementById('top-continuity-panel');
    const topContinuityHistory = document.getElementById('top-continuity-history');
    const topContinuityProof = topContinuityHistory?.closest('.top-uptime-cluster');
    const topContinuityClaim = topContinuityHistory?.querySelector('.top-continuity-claim');
    const topContinuityOrigin = topContinuityHistory?.querySelector('.top-continuity-origin');
    const topContinuityArrow = topContinuityHistory?.querySelector('.top-continuity-arrow');
    const topContinuityMilestoneOutline = topContinuityHistory?.querySelector('.top-continuity-milestone-outline');
    const topContinuityMilestoneNew = topContinuityHistory?.querySelector('.top-continuity-milestone-new');
    const topContinuityMilestonePopover = document.getElementById('top-continuity-milestone-popover');
    const topContinuityMilestoneClose = document.getElementById('top-continuity-milestone-close');
    const topContinuityMilestoneStatus = document.getElementById('top-continuity-milestone-status');
    const topContinuityMilestoneTitle = document.getElementById('top-continuity-milestone-title');
    const topContinuityMilestoneCopy = document.getElementById('top-continuity-milestone-copy');
    const topContinuityMilestoneLink = document.getElementById('top-continuity-milestone-link');
    const topContinuityMilestoneLinkLabel = document.getElementById('top-continuity-milestone-link-label');
    const uptimeClock = document.getElementById('uptime-clock');

    if (!counterEl) {
        settleHeroArrival();
        return;
    }

    const LAUNCH = new Date(MAINNET_LAUNCH).getTime();
    const TOP_CONTINUITY_SHUFFLE_MS = 1500;
    const FINALITY_CACHE_KEY = 'tezos-systems-finality-seconds';
    const UPTIME_MILESTONE_SEEN_KEY = 'tezos-systems-uptime-milestone-seen-v1';
    const UPTIME_MILESTONE_SEEN_LIMIT = 64;
    let lastBlockLevel = 0;
    let lastBlockTime = null;
    let recentBlockTimes = []; // last N block timestamps for finality avg
    let chainBakersText = '';
    let cachedFinalitySeconds = NaN;
    try { cachedFinalitySeconds = Number(localStorage.getItem(FINALITY_CACHE_KEY)); } catch (_) {}
    let chainFinalityText = Number.isFinite(cachedFinalitySeconds) && cachedFinalitySeconds > 0
        ? `${Math.round(cachedFinalitySeconds)}s`
        : '~12s';
    let chainStakedText = '';
    let chainIssuanceText = '';
    const pendingTopContinuityText = new Map();
    let topContinuityArrived = false;
    let topContinuityArrivalStarted = false;
    const chainMetricAliases = {
        'chain-uptime-bakers': ['hero-chain-uptime-bakers'],
        'chain-uptime-finality': ['hero-chain-uptime-finality'],
        'chain-uptime-staked': ['hero-chain-uptime-staked'],
        'chain-uptime-issuance': ['hero-chain-uptime-issuance']
    };
    const topContinuityValueKeys = {
        'hero-chain-uptime-bakers': 'total-bakers',
        'hero-chain-uptime-finality': 'finality',
        'hero-chain-uptime-staked': 'staking-ratio',
        'hero-chain-uptime-issuance': 'issuance-rate'
    };
    let explainActiveKey = null;
    let explainActivePill = null;
    let activeUptimeMilestoneSignal = null;
    let uptimeMilestoneTimer = null;
    let renderedUptimeMilestoneSignature = '__unset__';
    let uptimeMilestoneDisclosureLocked = false;
    let seenUptimeMilestoneKeys = new Set();
    const defaultUptimeAriaLabel = topContinuityHistory?.getAttribute('aria-label') || '';
    const defaultUptimeTitle = topContinuityHistory?.getAttribute('title') || '';
    const defaultUptimeAriaControls = topContinuityHistory?.getAttribute('aria-controls') || '';
    const BAKER_SET_LIST_LIMIT = 3;
    const BAKER_SET_REFRESH_MS = 15 * 60 * 1000;
    const TOP_CONTINUITY_TREND_REFRESH_MS = 15 * 60 * 1000;
    const TOP_CONTINUITY_TREND_BASELINE_TOLERANCE_MS = 36 * 60 * 60 * 1000;
    const TOP_CONTINUITY_TREND_HORIZONS = [
        { label: '7D', days: 7 },
        { label: '30D', days: 30 },
        { label: '90D', days: 90 }
    ];
    const TOP_CONTINUITY_TREND_METRICS = {
        'total-bakers': { field: 'total_bakers', stateKey: 'totalBakers', kind: 'count' },
        'staking-ratio': { field: 'staking_ratio', stateKey: 'stakingRatio', kind: 'points' },
        'issuance-rate': { field: 'current_issuance_rate', stateKey: 'currentIssuanceRate', kind: 'points' }
    };
    let bakerSetSnapshot = null;
    let bakerSetRefreshPromise = null;
    let bakerSetRefreshError = '';
    let topContinuityTrendSnapshot = null;
    let topContinuityTrendRefreshPromise = null;
    let topContinuityTrendRefreshError = '';

    const finalityButton = document.querySelector('[data-card-history="finality"]');
    finalityButton?.classList.remove('is-loading');
    finalityButton?.removeAttribute('aria-busy');
    if (finalityButton) {
        finalityButton.title = Number.isFinite(cachedFinalitySeconds)
            ? 'Last observed Tenderbake finality estimate; live cadence is sampling now.'
            : 'Tenderbake finality estimate; live cadence is sampling now.';
    }

    function cleanUptimeMilestoneText(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
    }

    function finiteTimestamp(value) {
        if (value == null || value === '') return null;
        const timestamp = Number(value);
        return Number.isFinite(timestamp) ? timestamp : null;
    }

    function readUptimeMilestoneSeen(rawValue) {
        let raw = rawValue;
        if (raw === undefined) {
            try { raw = localStorage.getItem(UPTIME_MILESTONE_SEEN_KEY); } catch (_) { raw = null; }
        }
        if (!raw) return new Set();
        try {
            const parsed = JSON.parse(raw);
            const values = Array.isArray(parsed) ? parsed : parsed?.seen;
            return new Set((Array.isArray(values) ? values : [])
                .filter((value) => typeof value === 'string' && value)
                .slice(-UPTIME_MILESTONE_SEEN_LIMIT));
        } catch (_) {
            return new Set();
        }
    }

    seenUptimeMilestoneKeys = readUptimeMilestoneSeen();

    function getActiveUptimeMilestoneSignal(now = Date.now()) {
        const expiresAt = finiteTimestamp(activeUptimeMilestoneSignal?.expiresAt);
        if (expiresAt != null && expiresAt <= now) {
            activeUptimeMilestoneSignal = null;
            return null;
        }
        return activeUptimeMilestoneSignal;
    }

    function describeUptimeMilestone(signal) {
        const title = cleanUptimeMilestoneText(signal?.title || 'Network milestone');
        const text = cleanUptimeMilestoneText(signal?.text);
        const detail = cleanUptimeMilestoneText(signal?.detail);
        return [title, text, detail].filter(Boolean).join(' · ');
    }

    function uptimeMilestoneStatus(signal) {
        if (signal?.milestoneStatus === 'crossed') return 'crossed';
        if (signal?.milestoneStatus === 'near') return 'near';
        return signal?.kind === 'event' ? 'crossed' : 'near';
    }

    function uptimeMilestoneSeenIdentity(signal) {
        const id = cleanUptimeMilestoneText(signal?.id);
        return id ? `${id}|${uptimeMilestoneStatus(signal)}` : '';
    }

    function uptimeMilestoneIsSeen(signal) {
        const identity = uptimeMilestoneSeenIdentity(signal);
        return Boolean(identity) && seenUptimeMilestoneKeys.has(identity);
    }

    function getUnseenUptimeMilestoneSignal(now = Date.now()) {
        const signal = getActiveUptimeMilestoneSignal(now);
        return signal && !uptimeMilestoneIsSeen(signal) ? signal : null;
    }

    function markUptimeMilestoneSeen(signal) {
        const identity = uptimeMilestoneSeenIdentity(signal);
        if (!identity) return;
        const values = [...seenUptimeMilestoneKeys].filter((value) => value !== identity);
        values.push(identity);
        seenUptimeMilestoneKeys = new Set(values.slice(-UPTIME_MILESTONE_SEEN_LIMIT));
        try {
            localStorage.setItem(UPTIME_MILESTONE_SEEN_KEY, JSON.stringify({
                schema: 1,
                seen: [...seenUptimeMilestoneKeys]
            }));
        } catch (_) {}
    }

    function restartUptimeMilestoneAttractor(active) {
        if (!topContinuityProof) return;
        topContinuityProof.classList.remove('is-uptime-milestone-arriving');
        if (!active) return;
        void topContinuityProof.offsetWidth;
        topContinuityProof.classList.add('is-uptime-milestone-arriving');
    }

    function uptimeMilestoneDestination(signal) {
        const route = cleanUptimeMilestoneText(signal?.route);
        if (!route || route === '#hot-today' || route.startsWith('#section=')) return '#pulse';
        return route;
    }

    function uptimeMilestoneDestinationLabel(destination, signal) {
        const labels = {
            '#pulse': 'Open Network Pulse',
            '#staking': 'Open Staking Chamber',
            '#health': 'Open Network Health',
            '#leaderboard': 'Open Baker Leaderboard',
            '#calculator': 'Open staking calculator',
            '/tz4/': 'Open the tz4 chamber',
            '/anthology/': 'Open Protocol Anthology',
            '/tezosx/': 'Open the Tezos X chamber'
        };
        const supplied = cleanUptimeMilestoneText(signal?.routeLabel);
        return labels[destination] || (/^Open\b/i.test(supplied) ? supplied : 'Open milestone details');
    }

    function uptimeMilestoneNeedsDisclosureStep() {
        const touchPointer = window.matchMedia?.('(hover: none), (pointer: coarse)')?.matches;
        const mobileLayout = window.matchMedia?.('(max-width: 640px)')?.matches;
        return Boolean(touchPointer || mobileLayout);
    }

    function uptimeMilestoneActivationInstruction(signal) {
        const destination = uptimeMilestoneDestination(signal);
        const destinationAction = uptimeMilestoneDestinationLabel(destination, signal).replace(/^Open\b/, 'open');
        if (!uptimeMilestoneNeedsDisclosureStep()) return `Activate to ${destinationAction}.`;
        return uptimeMilestoneDisclosureLocked
            ? `Details shown. Activate again to ${destinationAction}.`
            : `Activate to show milestone details. Activate again to ${destinationAction}.`;
    }

    function syncUptimeMilestoneButtonLabel(signal = getUnseenUptimeMilestoneSignal()) {
        if (!topContinuityHistory || !signal) return;
        const milestoneState = uptimeMilestoneStatus(signal) === 'crossed'
            ? 'Confirmed on-chain'
            : 'Approaching on-chain';
        const target = cleanUptimeMilestoneText(signal.shortLabel || signal.icon || signal.title || 'Milestone');
        topContinuityHistory.setAttribute(
            'aria-label',
            `${milestoneState}: ${target}. ${uptimeMilestoneActivationInstruction(signal)}`
        );
    }

    function setUptimeMilestonePopoverVisible(visible, { lockDisclosure = false, resetDisclosure = false } = {}) {
        if (!topContinuityMilestonePopover || !topContinuityProof) return;
        if (visible && !getUnseenUptimeMilestoneSignal()) return;
        if (lockDisclosure) uptimeMilestoneDisclosureLocked = true;
        if (resetDisclosure) uptimeMilestoneDisclosureLocked = false;
        topContinuityProof.classList.toggle('is-milestone-disclosed', visible);
        topContinuityMilestonePopover.setAttribute('aria-hidden', visible ? 'false' : 'true');
        topContinuityHistory?.setAttribute('aria-expanded', visible ? 'true' : 'false');
        syncUptimeMilestoneButtonLabel();
    }

    function openUptimeMilestoneDestination(signal) {
        const destination = uptimeMilestoneDestination(signal);
        if (!destination.startsWith('#')) {
            window.location.assign(destination);
            return;
        }
        if (window.location.hash === destination) {
            window.dispatchEvent(new Event('hashchange'));
        } else {
            window.location.hash = destination;
        }
    }

    function syncUptimeMilestoneCelebration(signal = getActiveUptimeMilestoneSignal()) {
        const active = Boolean(signal);
        const status = active ? uptimeMilestoneStatus(signal) : null;
        const unseen = active && !uptimeMilestoneIsSeen(signal);
        const crossed = unseen && status === 'crossed';
        const near = unseen && status === 'near';
        const renderSignature = active
            ? `${signal.id}|${status}|${signal.shortLabel || signal.icon || signal.title}|${signal.expiresAt || ''}|${unseen ? 'unseen' : 'seen'}`
            : '';
        if (renderSignature === renderedUptimeMilestoneSignature) return;
        renderedUptimeMilestoneSignature = renderSignature;
        topContinuityHistory?.classList.toggle('has-milestone-signal', unseen);
        topContinuityProof?.classList.toggle('has-milestone-signal', unseen);
        topContinuityProof?.classList.toggle('is-milestone-near', near);
        topContinuityProof?.classList.toggle('is-milestone-crossed', crossed);

        if (topContinuityHistory) {
            if (unseen) topContinuityHistory.dataset.milestoneStatus = status;
            else delete topContinuityHistory.dataset.milestoneStatus;
        }
        if (topContinuityMilestoneNew) {
            topContinuityMilestoneNew.textContent = near ? 'Soon' : 'New';
        }
        setUptimeMilestonePopoverVisible(false, { resetDisclosure: true });
        if (topContinuityMilestoneOutline) topContinuityMilestoneOutline.hidden = !unseen;
        if (topContinuityMilestonePopover) topContinuityMilestonePopover.hidden = !unseen;
        restartUptimeMilestoneAttractor(unseen);

        if (unseen) {
            const target = cleanUptimeMilestoneText(signal.shortLabel || signal.icon || signal.title || 'Milestone');
            const destination = uptimeMilestoneDestination(signal);
            const destinationLabel = uptimeMilestoneDestinationLabel(destination, signal);
            const milestoneState = crossed ? 'Confirmed on-chain' : 'Approaching on-chain';
            const rawMilestoneCopy = cleanUptimeMilestoneText(signal.text)
                || `${crossed ? 'Tezos has crossed' : 'Tezos is approaching'} ${target}.`;
            const milestoneCopy = crossed
                ? rawMilestoneCopy.replace(/^[^;]+;\s*/, '')
                : rawMilestoneCopy;
            topContinuityMilestoneStatus.textContent = milestoneState;
            topContinuityMilestoneTitle.textContent = target;
            topContinuityMilestoneCopy.textContent = milestoneCopy;
            topContinuityMilestoneLink.href = destination;
            topContinuityMilestoneLinkLabel.textContent = destinationLabel;
            topContinuityHistory.dataset.milestoneRoute = destination;
            topContinuityHistory.setAttribute('aria-describedby', topContinuityMilestonePopover.id);
            topContinuityHistory.setAttribute('aria-expanded', 'false');
            syncUptimeMilestoneButtonLabel(signal);
            topContinuityHistory.setAttribute('aria-controls', topContinuityMilestonePopover.id);
            topContinuityHistory.removeAttribute('title');
        } else {
            delete topContinuityHistory?.dataset.milestoneRoute;
            topContinuityHistory?.removeAttribute('aria-describedby');
            topContinuityHistory?.removeAttribute('aria-expanded');
            if (topContinuityHistory && defaultUptimeAriaLabel) topContinuityHistory.setAttribute('aria-label', defaultUptimeAriaLabel);
            if (topContinuityHistory && defaultUptimeAriaControls) topContinuityHistory.setAttribute('aria-controls', defaultUptimeAriaControls);
            if (topContinuityHistory && defaultUptimeTitle) topContinuityHistory.setAttribute('title', defaultUptimeTitle);
        }
    }

    function setActiveUptimeMilestoneSignal(signal) {
        if (uptimeMilestoneTimer) {
            window.clearTimeout(uptimeMilestoneTimer);
            uptimeMilestoneTimer = null;
        }

        const expiresAt = finiteTimestamp(signal?.expiresAt);
        const isMilestone = signal?.tone === 'milestone' || signal?.category === 'milestone';
        if (!signal || !isMilestone || (expiresAt != null && expiresAt <= Date.now())) {
            activeUptimeMilestoneSignal = null;
            syncUptimeMilestoneCelebration(null);
            tickUptime();
            return;
        }

        const nextSignal = {
            id: cleanUptimeMilestoneText(signal.id),
            title: cleanUptimeMilestoneText(signal.title || 'Network milestone'),
            shortLabel: cleanUptimeMilestoneText(signal.shortLabel || signal.title || 'Network milestone'),
            icon: cleanUptimeMilestoneText(signal.icon),
            text: cleanUptimeMilestoneText(signal.text),
            detail: cleanUptimeMilestoneText(signal.detail),
            route: cleanUptimeMilestoneText(signal.route),
            routeLabel: cleanUptimeMilestoneText(signal.routeLabel),
            kind: signal.kind === 'event' ? 'event' : 'state',
            milestoneStatus: uptimeMilestoneStatus(signal),
            expiresAt
        };
        activeUptimeMilestoneSignal = nextSignal;
        syncUptimeMilestoneCelebration(activeUptimeMilestoneSignal);
        if (expiresAt != null) {
            uptimeMilestoneTimer = window.setTimeout(() => {
                uptimeMilestoneTimer = null;
                activeUptimeMilestoneSignal = null;
                syncUptimeMilestoneCelebration(null);
                tickUptime();
            }, Math.max(0, expiresAt - Date.now()) + 80);
        }
        tickUptime();
    }

    function setTopContinuityText(id, text) {
        const el = document.getElementById(id);
        if (!el || text === undefined || text === null || text === '') return;

        const nextText = String(text);
        const pill = el.closest('.top-continuity-stat');
        const pending = pendingTopContinuityText.get(id);
        const hadActiveMagic = Boolean(el.__dmMagicCancel);
        if (
            pending === nextText
            || (el.dataset.finalText === nextText && !hadActiveMagic)
        ) return;

        // Empty first-arrival values have no measurable width once their
        // skeleton class is removed. Keep the latest factual target queued
        // until its pill is actually revealed, then measure and animate on
        // the production surface instead of burning the effect while hidden.
        if (
            !prefersReducedMotion()
            && !el.dataset.finalText
            && topContinuityPanel?.classList.contains('hero-arrival-pending')
            && !pill?.classList.contains('hero-arrived')
        ) {
            pendingTopContinuityText.set(id, nextText);
            return;
        }
        pendingTopContinuityText.delete(id);

        const currentText = el.dataset.finalText || el.textContent.trim();
        const shouldAnimate = (currentText !== nextText || hadActiveMagic) && !prefersReducedMotion();
        pill?.classList.remove('is-shuffling');

        el.dataset.finalText = nextText;
        el.classList.toggle('is-shuffling', shouldAnimate);
        pill?.classList.toggle('is-shuffling', shouldAnimate);
        const animated = setMagicNumber(el, nextText, {
            force: true,
            animate: shouldAnimate,
            duration: TOP_CONTINUITY_SHUFFLE_MS,
            onDone: () => {
                el.classList.remove('is-shuffling');
                pill?.classList.remove('is-shuffling');
            }
        });
        if (pill?.classList.contains('is-loading')) {
            pill.classList.remove('is-loading');
            pill.removeAttribute('aria-busy');
        }
        if (animated) pulseFresh(pill || el);
        else if (hadActiveMagic && !el.__dmMagicCancel) cancelFresh(pill || el);

        if (explainActiveKey && topContinuityValueKeys[id] === explainActiveKey) {
            updateTopContinuityExplainTitle();
        }
    }

    function flushPendingTopContinuityText(pill) {
        const valueId = pill?.querySelector('strong')?.id;
        const pending = valueId ? pendingTopContinuityText.get(valueId) : null;
        if (!valueId || !pending) return;
        pendingTopContinuityText.delete(valueId);
        setTopContinuityText(valueId, pending);
    }

    function renderTopContinuityRuntime(years, days, hours, mins) {
        return [
            [years, 'y'],
            [days, 'd'],
            [hours, 'h'],
            [mins, 'm']
        ].map(([value, unit]) => (
            `<span class="top-continuity-time-segment"><span class="top-continuity-time-number">${value}</span>${unit}</span>`
        )).join(' ');
    }

    function setTopContinuityRuntime(years, days, hours, mins) {
        const el = document.getElementById('hero-chain-uptime-counter');
        if (!el) {
            settleHeroArrival();
            return;
        }

        const nextText = `${years}y ${days}d ${hours}h ${mins}m`;
        if (el.dataset.finalText === nextText) return;

        el.dataset.finalText = nextText;
        const finalHtml = renderTopContinuityRuntime(years, days, hours, mins);

        if (!topContinuityArrivalStarted) {
            topContinuityArrivalStarted = true;
            topContinuityPanel?.classList.add('hero-arrival-pending');
            if (!prefersReducedMotion()) {
                const totalMinutes = Math.max(1, Math.round((Date.now() - LAUNCH) / 60000));
                tweenNumber(el, 0, totalMinutes, {
                    duration: 1200,
                    formatter: (value) => {
                        const minutes = Math.max(0, Math.floor(value));
                        const elapsed = getCalendarElapsedTime(LAUNCH + (minutes * 60 * 1000));
                        return `${elapsed.years}y ${elapsed.days}d ${elapsed.hours}h ${elapsed.minutes}m`;
                    },
                    onDone: () => {
                        el.innerHTML = finalHtml;
                        revealTopContinuityPills();
                    }
                });
                return;
            }
        }

        el.innerHTML = finalHtml;
        if (!topContinuityArrived) revealTopContinuityPills();
        el.classList.remove('is-shuffling');
    }

    function revealTopContinuityPills() {
        if (topContinuityArrived) return;
        topContinuityArrived = true;
        const pills = Array.from(topContinuityPanel?.querySelectorAll('.top-continuity-stat') || []);
        if (!pills.length || prefersReducedMotion()) {
            topContinuityPanel?.classList.remove('hero-arrival-pending');
            pills.forEach((pill) => {
                pill.classList.add('hero-arrived');
                flushPendingTopContinuityText(pill);
            });
            settleHeroArrival();
            return;
        }

        pills.forEach((pill, index) => {
            window.setTimeout(() => {
                pill.classList.add('hero-arrived');
                flushPendingTopContinuityText(pill);
                if (index === pills.length - 1) {
                    window.setTimeout(() => {
                        topContinuityPanel?.classList.remove('hero-arrival-pending');
                        settleHeroArrival();
                    }, 180);
                }
            }, index * 80);
        });
    }

    function setChainText(id, text) {
        const el = document.getElementById(id);
        if (el && text) setMagicNumber(el, text);
        (chainMetricAliases[id] || []).forEach((targetId) => {
            setTopContinuityText(targetId, text);
        });
    }

    function clampTopContinuityPopover(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    function getTopContinuityPillByKey(key) {
        if (!topContinuityPanel || !key) return null;
        return Array.from(topContinuityPanel.querySelectorAll('.top-continuity-stat[data-card-history]'))
            .find((pill) => pill.dataset.cardHistory === key) || null;
    }

    function getTopContinuityPillValue(pill = explainActivePill) {
        const value = pill?.querySelector('strong');
        return value?.dataset?.finalText || value?.textContent?.trim() || '';
    }

    function formatTopContinuityExplainTitle(pill, copy) {
        const value = getTopContinuityPillValue(pill);
        return value ? `${value}: ${copy.title}` : copy.title;
    }

    function getTopContinuityCurrentMetric(key) {
        const config = TOP_CONTINUITY_TREND_METRICS[key];
        if (!config) return null;
        const liveValue = finiteMetric(state.currentStats?.[config.stateKey]);
        if (liveValue !== null) return liveValue;
        const pillValue = getTopContinuityPillValue(getTopContinuityPillByKey(key));
        const parsed = Number.parseFloat(String(pillValue || '').replace(/[^\d.+-]/g, ''));
        return Number.isFinite(parsed) ? parsed : null;
    }

    function findTopContinuityTrendBaseline(rows, field, targetTime) {
        let nearest = null;
        (Array.isArray(rows) ? rows : []).forEach((row) => {
            const value = Number(row?.[field]);
            const timestamp = Date.parse(row?.timestamp || '');
            if (!Number.isFinite(value) || !Number.isFinite(timestamp)) return;
            const distance = Math.abs(timestamp - targetTime);
            if (!nearest || distance < nearest.distance) nearest = { value, timestamp, distance };
        });
        return nearest && nearest.distance <= TOP_CONTINUITY_TREND_BASELINE_TOLERANCE_MS
            ? nearest
            : null;
    }

    function formatTopContinuityTrendDelta(delta, kind) {
        if (!Number.isFinite(delta)) return '—';
        const rounded = kind === 'count'
            ? Math.round(delta)
            : Number(delta.toFixed(2));
        const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '';
        const magnitude = Math.abs(rounded).toLocaleString('en-US', {
            minimumFractionDigits: kind === 'points' ? 2 : 0,
            maximumFractionDigits: kind === 'points' ? 2 : 0
        });
        return `${sign}${magnitude}${kind === 'points' ? ' pp' : ''}`;
    }

    function topContinuityTrendAriaLabel(label, formatted, kind) {
        if (formatted === '—') return `${label} change unavailable`;
        return `${label} change ${formatted}${kind === 'count' ? ' bakers' : ''}`;
    }

    function renderTopContinuityTrends() {
        const explain = document.getElementById('top-continuity-explain');
        const holder = explain?.querySelector('[data-top-continuity-horizons]');
        const config = TOP_CONTINUITY_TREND_METRICS[explainActiveKey];
        if (!holder || !config) return;

        const loading = Boolean(topContinuityTrendRefreshPromise && !topContinuityTrendSnapshot);
        holder.setAttribute('aria-busy', loading ? 'true' : 'false');
        const currentValue = getTopContinuityCurrentMetric(explainActiveKey);
        const observedAt = statsObservationDate(state.currentStats, state.lastScalarRefreshAt).getTime();
        const rows = topContinuityTrendSnapshot?.rows || [];
        const horizons = TOP_CONTINUITY_TREND_HORIZONS.map(({ label, days }) => {
            const baseline = Number.isFinite(currentValue)
                ? findTopContinuityTrendBaseline(rows, config.field, observedAt - days * 24 * 60 * 60 * 1000)
                : null;
            const formatted = baseline
                ? formatTopContinuityTrendDelta(currentValue - baseline.value, config.kind)
                : '—';
            return { label, formatted };
        });
        const hasCoverage = horizons.some(({ formatted }) => formatted !== '—');
        const status = loading
            ? 'Reading scheduled history…'
            : topContinuityTrendRefreshError && !hasCoverage
                ? 'Scheduled history unavailable'
                : 'Change from the current value';
        quietlySyncHtml(holder, `
            <div class="top-continuity-horizon-grid">
                ${horizons.map(({ label, formatted }) => `
                    <span class="top-continuity-horizon" aria-label="${escapeHtml(topContinuityTrendAriaLabel(label, formatted, config.kind))}">
                        <span>${escapeHtml(label)}</span>
                        <strong>${escapeHtml(formatted)}</strong>
                    </span>
                `).join('')}
            </div>
            <p class="top-continuity-horizon-note">${escapeHtml(status)}</p>
        `);
    }

    function refreshTopContinuityTrends({ force = false } = {}) {
        const fresh = topContinuityTrendSnapshot
            && Date.now() - topContinuityTrendSnapshot.observedAt < TOP_CONTINUITY_TREND_REFRESH_MS;
        if (!force && fresh) {
            renderTopContinuityTrends();
            return Promise.resolve(topContinuityTrendSnapshot);
        }
        if (topContinuityTrendRefreshPromise) {
            renderTopContinuityTrends();
            return topContinuityTrendRefreshPromise;
        }

        topContinuityTrendRefreshError = '';
        topContinuityTrendRefreshPromise = (async () => {
            try {
                const receipt = await fetchHistoricalDataReceipt('90d');
                if (receipt?.status !== 'available') {
                    throw new Error(receipt?.error || 'Scheduled history is unavailable');
                }
                topContinuityTrendSnapshot = {
                    rows: Array.isArray(receipt.rows) ? receipt.rows : [],
                    observedAt: Date.now()
                };
                return topContinuityTrendSnapshot;
            } catch (error) {
                topContinuityTrendRefreshError = error?.message || 'Scheduled history is unavailable';
                return topContinuityTrendSnapshot;
            } finally {
                topContinuityTrendRefreshPromise = null;
                renderTopContinuityTrends();
            }
        })();
        renderTopContinuityTrends();
        return topContinuityTrendRefreshPromise;
    }

    function compactBakerSetAge(value, now = Date.now()) {
        const timestamp = Date.parse(value || '');
        if (!Number.isFinite(timestamp)) return '—';
        const elapsed = Math.max(0, now - timestamp);
        const minute = 60 * 1000;
        const hour = 60 * minute;
        const day = 24 * hour;
        const week = 7 * day;
        if (elapsed < 90 * 1000) return 'now';
        if (elapsed < hour) return `${Math.max(1, Math.floor(elapsed / minute))}m`;
        if (elapsed < day) return `${Math.max(1, Math.floor(elapsed / hour))}h`;
        if (elapsed < 2 * week) return `${Math.max(1, Math.floor(elapsed / day))}d`;
        if (elapsed < 8 * week) return `${Math.max(1, Math.floor(elapsed / week))}w`;
        if (elapsed < 730 * day) return `${Math.max(1, Math.floor(elapsed / (30 * day)))}mo`;
        return `${Math.max(1, Math.floor(elapsed / (365 * day)))}y`;
    }

    function absoluteBakerSetTime(value) {
        const timestamp = Date.parse(value || '');
        if (!Number.isFinite(timestamp)) return 'Time unavailable';
        return new Date(timestamp).toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });
    }

    function oneYearBeforeBakerEvent(value) {
        const date = new Date(value || '');
        if (!Number.isFinite(date.getTime())) return null;
        date.setUTCFullYear(date.getUTCFullYear() - 1);
        return date.toISOString();
    }

    function fetchTopContinuityTzktJson(url, retries = 2) {
        return fetchWithRetry(url, {
            cache: 'no-store',
            memoryCache: false,
            timeoutMs: 12_000,
            __tezosSystemsPriority: 'interactive'
        }, retries);
    }

    async function fetchTopContinuityBakerRows(active) {
        const params = new URLSearchParams({
            active: String(active),
            select: 'address,alias,activationLevel,activationTime,deactivationLevel,deactivationTime,bakingPower',
            'sort.desc': active ? 'activationLevel' : 'deactivationLevel',
            limit: String(BAKER_SET_LIST_LIMIT)
        });
        if (active) params.set('bakingPower.gt', '0');
        const rows = await fetchTopContinuityTzktJson(`${API_URLS.tzkt}/delegates?${params}`);
        if (!Array.isArray(rows)) throw new Error('TzKT baker set returned an invalid payload');
        return rows
            .filter((row) => isTezosAddress(row?.address))
            .filter((row) => !active || Number(row?.bakingPower) > 0)
            .slice(0, BAKER_SET_LIST_LIMIT)
            .map((row) => ({
                address: String(row.address),
                alias: String(row.alias || '').replace(/\s+/g, ' ').trim().slice(0, 80),
                bakingPower: Number(row.bakingPower) || 0,
                eventLevel: Number(active ? row.activationLevel : row.deactivationLevel) || null,
                eventTime: active ? row.activationTime : row.deactivationTime
            }));
    }

    async function fetchTopContinuityTotalBakingPower() {
        const payload = await fetchTopContinuityTzktJson(`${API_URLS.tzkt}/statistics/current?select=totalBakingPower`);
        const total = Number(payload?.totalBakingPower ?? payload);
        if (!Number.isFinite(total) || total <= 0) throw new Error('TzKT baking power total is unavailable');
        return total;
    }

    async function attachClosedBakerSizes(rows) {
        return Promise.all(rows.map(async (row) => {
            const targetTime = oneYearBeforeBakerEvent(row.eventTime);
            if (!targetTime) return row;
            try {
                const blockParams = new URLSearchParams({
                    'timestamp.le': targetTime,
                    'sort.desc': 'level',
                    select: 'level,cycle,timestamp',
                    limit: '1'
                });
                const blocks = await fetchTopContinuityTzktJson(`${API_URLS.tzkt}/blocks?${blockParams}`);
                const referenceBlock = Array.isArray(blocks) ? blocks[0] : null;
                const cycle = Number(referenceBlock?.cycle);
                if (!Number.isFinite(cycle)) return row;

                const rewardParams = new URLSearchParams({
                    cycle: String(cycle),
                    select: 'cycle,bakingPower,totalBakingPower',
                    limit: '1'
                });
                const snapshots = await fetchTopContinuityTzktJson(`${API_URLS.tzkt}/rewards/bakers/${encodeURIComponent(row.address)}?${rewardParams}`);
                const snapshot = Array.isArray(snapshots) ? snapshots[0] : null;
                const size = bakerSizeTier(
                    snapshot?.bakingPower,
                    snapshot?.totalBakingPower,
                    'network baking power one year before closure'
                );
                return size
                    ? { ...row, size, sizeReferenceTime: referenceBlock?.timestamp || targetTime }
                    : row;
            } catch {
                return row;
            }
        }));
    }

    async function attachLatestBakerEntryKinds(rows) {
        return Promise.all(rows.map(async (row) => {
            if (!Number.isFinite(row.eventLevel) || row.eventLevel <= 0) {
                return { ...row, entryKind: 'unknown' };
            }
            try {
                const params = new URLSearchParams({
                    'anyof.proposer.producer': row.address,
                    'level.lt': String(row.eventLevel),
                    'sort.desc': 'level',
                    select: 'level,timestamp,proposer,producer',
                    limit: '1'
                });
                const priorBlocks = await fetchTopContinuityTzktJson(`${API_URLS.tzkt}/blocks?${params}`);
                if (!Array.isArray(priorBlocks)) throw new Error('TzKT prior-bake receipt is malformed');
                const priorBlock = priorBlocks[0] || null;
                return priorBlock
                    ? {
                        ...row,
                        entryKind: 'reactivated',
                        priorBakeLevel: Number(priorBlock.level) || null,
                        priorBakeTime: priorBlock.timestamp || null
                    }
                    : { ...row, entryKind: 'new' };
            } catch {
                return { ...row, entryKind: 'unknown' };
            }
        }));
    }

    async function fetchTopContinuityBakerSet() {
        const [latest, closed, totalBakingPower] = await Promise.all([
            fetchTopContinuityBakerRows(true),
            fetchTopContinuityBakerRows(false),
            fetchTopContinuityTotalBakingPower().catch(() => null)
        ]);
        const latestWithSizes = latest.map((row) => {
            const size = bakerSizeTier(row.bakingPower, totalBakingPower);
            return size ? { ...row, size } : row;
        });
        const [latestWithEntryKinds, closedWithSizes] = await Promise.all([
            attachLatestBakerEntryKinds(latestWithSizes),
            attachClosedBakerSizes(closed)
        ]);
        let domains = new Map();
        try {
            domains = await resolveTezReverseNames(
                [...latestWithEntryKinds, ...closedWithSizes].map((row) => row.address)
            );
        } catch (error) {
            console.warn('[baker-set] Tezos Domains reverse lookup failed:', error?.message || error);
        }
        return {
            latest: latestWithEntryKinds,
            closed: closedWithSizes,
            domains,
            observedAt: Date.now()
        };
    }

    function renderTopContinuityBakerRow(row, kind, savedAddresses) {
        const domain = bakerSetSnapshot?.domains?.get(row.address) || '';
        const label = domain || row.alias || shortAddress(row.address);
        const identityTitle = domain
            ? `${domain} Tezos Domains reverse record · ${row.address}`
            : row.alias
                ? `${row.alias} · ${row.address}`
                : row.address;
        const saved = savedAddresses.has(row.address);
        const entryKind = kind === 'gained' ? row.entryKind || 'unknown' : 'closed';
        const entryDetail = entryKind === 'new'
            ? 'Brand-new baker · no earlier proposer or producer block before this activation'
            : entryKind === 'reactivated'
                ? `Reactivated baker · prior baked block${row.priorBakeLevel ? ` ${Number(row.priorBakeLevel).toLocaleString('en-US')}` : ''}`
                : entryKind === 'unknown'
                    ? 'First-bake history unavailable'
                    : '';
        const newBadge = entryKind === 'new'
            ? '<span class="top-continuity-baker-new" aria-label="Brand-new baker with no earlier baked block" title="Brand new · no earlier baked block">NEW</span>'
            : '';
        const sizeLabel = row.size ? `${row.size.label} baker, ${row.size.detail}` : 'Baker size unavailable';
        const sizeBadge = row.size
            ? `<span class="top-continuity-baker-size is-${escapeHtml(row.size.key)}" data-baker-size="${escapeHtml(row.size.key)}" aria-label="${escapeHtml(sizeLabel)}" title="${escapeHtml(`${row.size.label} baker · ${row.size.detail}`)}">${escapeHtml(row.size.label)}</span>`
            : `<span class="top-continuity-baker-size is-unavailable" data-baker-size="unavailable" aria-label="${escapeHtml(sizeLabel)}" title="${escapeHtml(sizeLabel)}">—</span>`;
        const myTezosAction = saved
            ? `<a href="/#my-baker=${encodeURIComponent(row.address)}" data-quiet-key="baker-set-my:${escapeHtml(row.address)}" data-baker-set-my-address="${escapeHtml(row.address)}" aria-label="Open ${escapeHtml(label)} in My Tezos" title="Open in My Tezos">My</a>`
            : `<button type="button" data-quiet-key="baker-set-my:${escapeHtml(row.address)}" data-baker-set-save-address="${escapeHtml(row.address)}" data-baker-set-label="${escapeHtml(label)}" aria-label="Add ${escapeHtml(label)} to saved My Tezos addresses" title="Add to My Tezos">+ My</button>`;
        return `
            <article class="top-continuity-baker-row is-${kind}" data-quiet-key="baker-set-${kind}:${escapeHtml(row.address)}" data-address="${escapeHtml(row.address)}" data-baker-entry="${escapeHtml(entryKind)}">
                <time datetime="${escapeHtml(row.eventTime || '')}" title="${escapeHtml(absoluteBakerSetTime(row.eventTime))}">${escapeHtml(compactBakerSetAge(row.eventTime))}</time>
                <span class="top-continuity-baker-identity" title="${escapeHtml([identityTitle, entryDetail].filter(Boolean).join(' · '))}"><span class="top-continuity-baker-name"><strong>${escapeHtml(label)}</strong>${newBadge}</span></span>
                ${sizeBadge}
                <span class="top-continuity-baker-actions">
                    ${myTezosAction}
                    <a href="https://tzkt.io/${encodeURIComponent(row.address)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${escapeHtml(label)} on TzKT" title="Open on TzKT">TzKT</a>
                </span>
            </article>
        `;
    }

    function renderTopContinuityBakerList(title, note, rows, kind, savedAddresses) {
        return `
            <section class="top-continuity-baker-list" aria-label="${escapeHtml(title)}">
                <div class="top-continuity-baker-heading"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(note)}</span></div>
                ${rows.length
                    ? rows.map((row) => renderTopContinuityBakerRow(row, kind, savedAddresses)).join('')
                    : '<p class="top-continuity-baker-empty">No matching baker receipt returned.</p>'}
            </section>
        `;
    }

    function renderTopContinuityBakerRoster() {
        const roster = document.getElementById('top-continuity-baker-roster');
        if (!roster || explainActiveKey !== 'total-bakers') return;
        roster.setAttribute('aria-busy', bakerSetRefreshPromise ? 'true' : 'false');
        if (!bakerSetSnapshot) {
            const markup = bakerSetRefreshPromise
                ? '<div class="top-continuity-baker-loading"><span aria-hidden="true"></span><span>Loading recent baker changes…</span></div>'
                : '<div class="top-continuity-baker-error"><span>Recent baker changes are unavailable.</span><button type="button" data-baker-set-retry>Retry</button></div>';
            quietlySyncHtml(roster, markup);
            return;
        }

        const savedAddresses = new Set(readSavedMyTezosEntries().map((entry) => entry.address));
        const observed = new Date(bakerSetSnapshot.observedAt).toLocaleTimeString(undefined, {
            hour: 'numeric',
            minute: '2-digit'
        });
        const freshness = bakerSetRefreshPromise
            ? 'Refreshing baker records…'
            : bakerSetRefreshError
                ? `Last good ${observed} · refresh unavailable`
                : `Live ${observed}`;
        quietlySyncHtml(roster, `
            ${renderTopContinuityBakerList('New + Reactivated', 'baking rights gained', bakerSetSnapshot.latest, 'gained', savedAddresses)}
            ${renderTopContinuityBakerList('Closed Bakers', 'baking rights lost', bakerSetSnapshot.closed, 'closed', savedAddresses)}
            <p class="top-continuity-baker-freshness" data-baker-set-status data-tone="${bakerSetRefreshError ? 'stale' : 'live'}">${escapeHtml(freshness)}</p>
        `);
    }

    function refreshTopContinuityBakerRoster({ force = false } = {}) {
        const fresh = bakerSetSnapshot && Date.now() - bakerSetSnapshot.observedAt < BAKER_SET_REFRESH_MS;
        if (!force && fresh) {
            renderTopContinuityBakerRoster();
            return Promise.resolve(bakerSetSnapshot);
        }
        if (bakerSetRefreshPromise) return bakerSetRefreshPromise;
        bakerSetRefreshError = '';
        bakerSetRefreshPromise = (async () => {
            try {
                bakerSetSnapshot = await fetchTopContinuityBakerSet();
                return bakerSetSnapshot;
            } catch (error) {
                bakerSetRefreshError = error?.message || 'Baker set refresh failed';
                console.warn('[baker-set] refresh failed:', bakerSetRefreshError);
                return bakerSetSnapshot;
            } finally {
                bakerSetRefreshPromise = null;
                renderTopContinuityBakerRoster();
            }
        })();
        renderTopContinuityBakerRoster();
        return bakerSetRefreshPromise;
    }

    function updateTopContinuityExplainTitle() {
        if (!explainActiveKey) return;
        const explain = document.getElementById('top-continuity-explain');
        const title = explain?.querySelector('[data-top-continuity-explain-title]');
        const copy = TOP_CONTINUITY_EXPLANATIONS[explainActiveKey];
        const pill = explainActivePill || getTopContinuityPillByKey(explainActiveKey);
        if (!title || !copy || !pill) return;
        title.textContent = formatTopContinuityExplainTitle(pill, copy);
    }

    function positionTopContinuityExplain(pill = explainActivePill) {
        const explain = document.getElementById('top-continuity-explain');
        if (!topContinuityPanel || !explain || !pill) return;
        const panelRect = topContinuityPanel.getBoundingClientRect();
        const pillRect = pill.getBoundingClientRect();
        const panelWidth = Math.max(0, panelRect.width);
        if (!panelWidth) return;

        const explainRect = explain.getBoundingClientRect();
        const explainWidth = Math.min(explainRect.width || 380, panelWidth);
        const pillCenter = (pillRect.left + (pillRect.width / 2)) - panelRect.left;
        const mobileLayout = window.matchMedia?.('(max-width: 640px)').matches || panelWidth <= 420;
        const maxLeft = Math.max(0, panelWidth - explainWidth);
        const left = mobileLayout ? 0 : clampTopContinuityPopover(pillCenter - (explainWidth / 2), 0, maxLeft);
        const caretX = clampTopContinuityPopover(pillCenter - left, 18, Math.max(18, explainWidth - 18));

        explain.style.left = `${Math.round(left)}px`;
        explain.style.setProperty('--caret-x', `${Math.round(caretX)}px`);
    }

    function renderTopContinuityExplain(explain, pill, copy, key) {
        const isBakerSet = key === 'total-bakers';
        const hasTrends = Boolean(TOP_CONTINUITY_TREND_METRICS[key]);
        explain.classList.toggle('is-baker-set', isBakerSet);
        explain.innerHTML = `
            <button type="button" class="top-continuity-explain-close" data-close-top-continuity-explain aria-label="Dismiss explanation">&times;</button>
            <div class="top-continuity-explain-copy">
                <span class="feature-kicker">${escapeHtml(copy.kicker)}</span>
                <strong id="top-continuity-explain-title" data-top-continuity-explain-title>${escapeHtml(formatTopContinuityExplainTitle(pill, copy))}</strong>
                <p>${escapeHtml(copy.body)}</p>
            </div>
            ${hasTrends ? '<div class="top-continuity-horizons" data-top-continuity-horizons aria-label="7, 30, and 90 day change" aria-busy="true"></div>' : ''}
            ${isBakerSet ? '<div class="top-continuity-baker-roster" id="top-continuity-baker-roster" aria-label="New, reactivated, and closed bakers by baking-right change" aria-busy="true"></div>' : ''}
            <div class="top-continuity-explain-actions">
                <button type="button" class="top-continuity-explain-chart" data-open-card-history="${escapeHtml(key)}">Open all-time chart</button>
                <button type="button" class="top-continuity-explain-chart top-continuity-explain-chamber" data-open-top-continuity-chamber="${escapeHtml(copy.chamberEntry)}" aria-label="Open ${escapeHtml(copy.chamberLabel)}">Chamber <span aria-hidden="true">&rarr;</span></button>
            </div>
        `;
        if (hasTrends) refreshTopContinuityTrends();
        if (isBakerSet) refreshTopContinuityBakerRoster();
    }

    function setTopContinuityExplainInteractive(explain, interactive) {
        if (!explain) return;
        explain.inert = !interactive;
        explain.querySelectorAll('button, a[href]').forEach((control) => {
            if (interactive) {
                control.removeAttribute('tabindex');
            } else {
                control.setAttribute('tabindex', '-1');
            }
        });
    }

    function ensureTopContinuityExplainPanel() {
        if (!topContinuityPanel) return null;
        let explain = document.getElementById('top-continuity-explain');
        if (explain) return explain;
        explain = document.createElement('div');
        explain.id = 'top-continuity-explain';
        explain.className = 'top-continuity-explain';
        explain.setAttribute('role', 'region');
        explain.setAttribute('aria-labelledby', 'top-continuity-explain-title');
        explain.setAttribute('aria-hidden', 'true');
        setTopContinuityExplainInteractive(explain, false);
        explain.addEventListener('click', (event) => {
            const target = event.target instanceof Element ? event.target : event.target?.parentElement;
            if (!target) return;
            if (target.closest('[data-close-top-continuity-explain]')) {
                closeTopContinuityExplanation({ returnFocus: true });
                return;
            }

            const myTezosLink = target.closest('[data-baker-set-my-address]');
            if (myTezosLink) {
                event.preventDefault();
                const address = myTezosLink.dataset.bakerSetMyAddress || '';
                closeTopContinuityExplanation();
                openMyTezosTarget(address).catch((error) => {
                    console.warn('[baker-set] My Tezos open failed:', error?.message || error);
                });
                return;
            }

            const saveButton = target.closest('[data-baker-set-save-address]');
            if (saveButton) {
                event.stopPropagation();
                const address = saveButton.dataset.bakerSetSaveAddress || '';
                const label = saveButton.dataset.bakerSetLabel || null;
                const current = readSavedMyTezosEntries();
                const alreadySaved = current.some((entry) => entry.address === address);
                const status = explain.querySelector('[data-baker-set-status]');
                if (!alreadySaved && current.length >= MAX_SAVED_MY_TEZOS_ADDRESSES) {
                    if (status) {
                        status.dataset.tone = 'stale';
                        status.textContent = `My Tezos already has ${MAX_SAVED_MY_TEZOS_ADDRESSES} saved addresses.`;
                    }
                    return;
                }
                try {
                    upsertSavedMyTezosEntry(address, {
                        label,
                        included: true,
                        source: 'baker-set-pill'
                    });
                    renderTopContinuityBakerRoster();
                    const nextStatus = explain.querySelector('[data-baker-set-status]');
                    if (nextStatus) {
                        nextStatus.dataset.tone = 'live';
                        nextStatus.textContent = `${label || shortAddress(address)} saved to My Tezos on this device.`;
                    }
                } catch (error) {
                    if (status) {
                        status.dataset.tone = 'stale';
                        status.textContent = error?.message || 'Could not save this address.';
                    }
                }
                return;
            }

            if (target.closest('[data-baker-set-retry]')) {
                refreshTopContinuityBakerRoster({ force: true });
                return;
            }

            const chamberButton = target.closest('[data-open-top-continuity-chamber]');
            if (chamberButton) {
                const entryId = chamberButton.dataset.openTopContinuityChamber || '';
                closeTopContinuityExplanation();
                navigateSiteMapEntry(entryId);
                return;
            }

            const chartButton = target.closest('[data-open-card-history]');
            if (!chartButton) return;
            const key = chartButton.dataset.openCardHistory || explainActiveKey;
            closeTopContinuityExplanation();
            openCardHistoryModal(key, 'all');
        });
        topContinuityPanel.appendChild(explain);
        return explain;
    }

    function clearTopContinuityPillState() {
        topContinuityPanel?.querySelectorAll('.top-continuity-stat.is-explaining').forEach((pill) => {
            pill.classList.remove('is-explaining');
            pill.setAttribute('aria-expanded', 'false');
        });
    }

    function closeTopContinuityExplanation({ returnFocus = false } = {}) {
        const explain = document.getElementById('top-continuity-explain');
        const focusTarget = explainActivePill;
        explain?.classList.remove('is-visible');
        explain?.setAttribute('aria-hidden', 'true');
        setTopContinuityExplainInteractive(explain, false);
        clearTopContinuityPillState();
        explainActiveKey = null;
        explainActivePill = null;
        if (returnFocus && focusTarget) {
            focusTarget.focus({ preventScroll: true });
        }
    }

    function openTopContinuityExplanation(pill) {
        const key = pill?.dataset?.cardHistory;
        const copy = TOP_CONTINUITY_EXPLANATIONS[key];
        const explain = copy ? ensureTopContinuityExplainPanel() : null;
        if (!copy || !explain) return;
        clearTopContinuityPillState();
        explainActiveKey = key;
        explainActivePill = pill;
        const pillColor = getComputedStyle(pill).getPropertyValue('--pill-color').trim();
        if (pillColor) explain.style.setProperty('--pill-color', pillColor);
        renderTopContinuityExplain(explain, pill, copy, key);
        setTopContinuityExplainInteractive(explain, true);
        pill.classList.add('is-explaining');
        pill.setAttribute('aria-expanded', 'true');
        explain.setAttribute('aria-hidden', 'false');
        explain.classList.add('is-visible');
        positionTopContinuityExplain(pill);
        window.requestAnimationFrame(() => positionTopContinuityExplain(pill));
    }

    const repositionTopContinuityExplanation = debounce(() => {
        if (!explainActiveKey || !explainActivePill) return;
        positionTopContinuityExplain(explainActivePill);
    }, 150);

    if (topContinuityPanel && topContinuityHistory && topContinuityPanel.dataset.historyWired !== '1') {
        topContinuityPanel.dataset.historyWired = '1';
        topContinuityProof?.addEventListener('pointerenter', (event) => {
            if (event.pointerType === 'touch') return;
            setUptimeMilestonePopoverVisible(true);
        });
        topContinuityProof?.addEventListener('pointerleave', (event) => {
            if (event.pointerType === 'touch' || uptimeMilestoneDisclosureLocked) return;
            if (!topContinuityProof.contains(document.activeElement)) {
                setUptimeMilestonePopoverVisible(false);
            }
        });
        topContinuityProof?.addEventListener('focusin', () => {
            setUptimeMilestonePopoverVisible(true);
        });
        topContinuityProof?.addEventListener('focusout', (event) => {
            if (!uptimeMilestoneDisclosureLocked && !topContinuityProof.contains(event.relatedTarget)) {
                setUptimeMilestonePopoverVisible(false);
            }
        });
        topContinuityHistory.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape' || !getUnseenUptimeMilestoneSignal()) return;
            event.preventDefault();
            setUptimeMilestonePopoverVisible(false, { resetDisclosure: true });
        });
        document.addEventListener('pointerdown', (event) => {
            if (!uptimeMilestoneDisclosureLocked || topContinuityProof?.contains(event.target)) return;
            setUptimeMilestonePopoverVisible(false, { resetDisclosure: true });
        });
        topContinuityHistory.addEventListener('click', (event) => {
            const milestoneSignal = getUnseenUptimeMilestoneSignal();
            if (milestoneSignal) {
                event.preventDefault();
                if (uptimeMilestoneNeedsDisclosureStep() && !uptimeMilestoneDisclosureLocked) {
                    setUptimeMilestonePopoverVisible(true, { lockDisclosure: true });
                    return;
                }
                markUptimeMilestoneSeen(milestoneSignal);
                syncUptimeMilestoneCelebration(milestoneSignal);
                openUptimeMilestoneDestination(milestoneSignal);
                return;
            }
            if (window.location.hash !== '#protocol-history') {
                window.history.pushState(null, '', '#protocol-history');
            }
            openProtocolHistoryChamber();
        });
        topContinuityMilestoneLink?.addEventListener('click', (event) => {
            const milestoneSignal = getUnseenUptimeMilestoneSignal();
            if (!milestoneSignal) return;
            event.preventDefault();
            markUptimeMilestoneSeen(milestoneSignal);
            syncUptimeMilestoneCelebration(milestoneSignal);
            openUptimeMilestoneDestination(milestoneSignal);
        });
        topContinuityMilestoneClose?.addEventListener('click', () => {
            setUptimeMilestonePopoverVisible(false, { resetDisclosure: true });
            topContinuityMilestoneClose.blur();
        });
        topContinuityPanel.querySelectorAll('.top-continuity-stat[data-card-history]').forEach((pill) => {
            if (pill.dataset.topContinuityHistoryPillWired === '1') return;
            pill.dataset.topContinuityHistoryPillWired = '1';
            pill.setAttribute('aria-controls', 'top-continuity-explain');
            pill.setAttribute('aria-expanded', 'false');
            pill.addEventListener('click', () => {
                if (explainActiveKey === pill.dataset.cardHistory) {
                    closeTopContinuityExplanation();
                    return;
                }
                openTopContinuityExplanation(pill);
            });
        });
        document.addEventListener('click', (event) => {
            if (!explainActiveKey) return;
            const target = event.target instanceof Element ? event.target : event.target?.parentElement;
            if (!target) return;
            if (target.closest('#top-continuity-explain, .top-continuity-stat')) return;
            closeTopContinuityExplanation();
        });
        document.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape' || !explainActiveKey) return;
            closeTopContinuityExplanation({ returnFocus: true });
        });
        window.addEventListener('hero-search-opened', () => closeTopContinuityExplanation());
        window.addEventListener('resize', repositionTopContinuityExplanation);
    }

    if (topContinuityPanel && topContinuityPanel.dataset.bakerSetSavedStateWired !== '1') {
        topContinuityPanel.dataset.bakerSetSavedStateWired = '1';
        window.addEventListener('my-tezos-portfolio-changed', () => {
            if (explainActiveKey === 'total-bakers' && bakerSetSnapshot) {
                renderTopContinuityBakerRoster();
            }
        });
        window.addEventListener('storage', (event) => {
            if (event.key !== SAVED_ADDRESSES_KEY) return;
            if (explainActiveKey === 'total-bakers' && bakerSetSnapshot) {
                renderTopContinuityBakerRoster();
            }
        });
    }

    if (topContinuityHistory && topContinuityHistory.dataset.milestoneCelebrationWired !== '1') {
        topContinuityHistory.dataset.milestoneCelebrationWired = '1';
        window.addEventListener('hot-signal-rendered', (event) => {
            setActiveUptimeMilestoneSignal(event?.detail?.milestone || null);
        });
        window.addEventListener('storage', (event) => {
            if (event.key !== UPTIME_MILESTONE_SEEN_KEY) return;
            seenUptimeMilestoneKeys = readUptimeMilestoneSeen(event.newValue);
            syncUptimeMilestoneCelebration(getActiveUptimeMilestoneSignal());
        });
    }

    function syncChainProofMetrics() {
        setChainText('chain-uptime-bakers', chainBakersText);
        setChainText('chain-uptime-finality', chainFinalityText);
        setChainText('chain-uptime-staked', chainStakedText);
        setChainText('chain-uptime-issuance', chainIssuanceText);
    }

    function applyUptimeAnniversaryState(anniversary, totalDays, upgradeCount) {
        const active = Boolean(anniversary?.isAnniversary);
        const activeMilestone = getUnseenUptimeMilestoneSignal();
        syncUptimeMilestoneCelebration(activeMilestone);
        topContinuityHistory?.classList.toggle('is-anniversary', active);
        topContinuityPanel?.classList.toggle('has-anniversary', active);
        uptimeClock?.classList.toggle('is-anniversary', active);
        counterEl?.classList.toggle('is-anniversary', active);

        if (topContinuityClaim) {
            topContinuityClaim.textContent = active ? anniversary.claimText : 'mainnet age';
        }
        if (topContinuityOrigin) {
            topContinuityOrigin.textContent = active ? anniversary.originText : 'since 2018';
        }
        if (topContinuityArrow) {
            topContinuityArrow.textContent = '↗';
        }
        if (!topContinuityHistory) return;

        const myth = active
            ? `${anniversary.message} ${upgradeCount} protocol upgrades adopted on-chain.`
            : `${totalDays.toLocaleString('en-US')} days of Tezos mainnet history. ${upgradeCount} protocol upgrades adopted on-chain.`;
        const milestoneLead = activeMilestone
            ? `${uptimeMilestoneStatus(activeMilestone) === 'crossed' ? 'Network milestone confirmed' : 'Network milestone approaching'}: ${describeUptimeMilestone(activeMilestone)}. `
            : '';
        const action = activeMilestone
            ? uptimeMilestoneActivationInstruction(activeMilestone)
            : 'Open Protocol Anthology Chamber';
        topContinuityHistory.title = `${milestoneLead}${myth}`;
        topContinuityHistory.setAttribute('aria-label', `${milestoneLead}${myth} ${action}`);
    }

    // Tick the uptime counter every second — fixed-width digits
    function tickUptime() {
        const now = Date.now();
        const elapsed = getCalendarElapsedTime(now);
        const { years, days, hours, totalDays } = elapsed;
        const mins = elapsed.minutes;
        const secs = elapsed.seconds;
        const str = `${years}y ${days}d ${String(hours).padStart(2,'0')}h ${String(mins).padStart(2,'0')}m ${String(secs).padStart(2,'0')}s`;
        // Wrap each character in a fixed-width span to prevent layout shift
        const html = str.split('').map(ch =>
            /\d/.test(ch) ? `<span class="uptime-digit">${ch}</span>` : `<span class="uptime-sep">${ch}</span>`
        ).join('');
        if (counterEl) counterEl.innerHTML = html;
        const chainCounterEl = document.getElementById('chain-uptime-counter');
        if (chainCounterEl) chainCounterEl.innerHTML = html;
        setTopContinuityRuntime(years, days, hours, mins);
        const upgradeCount = state.currentStats?.protocolCount || countProtocolUpgrades(state.protocols || []);
        applyUptimeAnniversaryState(getTezosUptimeAnniversary(now), totalDays, upgradeCount);
        syncChainProofMetrics();
    }

    // Tick block age
    function tickBlockAge() {
        if (!lastBlockTime) return;
        const ago = Math.floor((Date.now() - lastBlockTime) / 1000);
        if (blockAgeEl) {
            if (ago < 60) {
                blockAgeEl.textContent = `${ago}s ago`;
            } else {
                blockAgeEl.textContent = `${Math.floor(ago / 60)}m ago`;
            }
        }
        // Status based on block age
        if (pulseDot) {
            if (ago > 120) {
                pulseDot.style.color = '#ff4444';
                pulseDot.title = `Last block ${ago}s ago — possible issue`;
                pulseDot.classList.add('stale');
            } else if (ago > 18) {
                pulseDot.style.color = '#ff4444';
                pulseDot.title = `Block ${ago}s old — slight delay`;
                pulseDot.classList.add('stale');
            } else {
                pulseDot.style.color = '';
                pulseDot.title = 'Network healthy — blocks on schedule';
                pulseDot.classList.remove('stale');
            }
        }
    }

    // Start ticking
    tickUptime();
    setInterval(() => { if (document.visibilityState !== 'visible') return; tickUptime(); }, 1000);
    setInterval(() => { if (document.visibilityState !== 'visible') return; tickBlockAge(); }, 1000);

    // Fast block poller via Octez RPC (real-time, every 6s)
    async function pollBlock() {
        try {
            const resp = await fetchWithDeadline(`${API_URLS.octez}/chains/main/blocks/head/header`, {}, 5000);
            if (!resp.ok) return;
            const header = await resp.json();
            const level = header.level;
            const timestamp = header.timestamp;

            if (level && level !== lastBlockLevel) {
                lastBlockLevel = level;
                lastBlockTime = new Date(timestamp).getTime();
                recentBlockTimes.push(lastBlockTime);
                if (recentBlockTimes.length > 5) recentBlockTimes.shift(); // keep last 5
                if (blockNumEl) {
                    blockNumEl.textContent = level.toLocaleString();
                    blockTick(blockNumEl); // heartbeat: mechanical up-tick each new block
                }
                const cb = document.getElementById('cycle-chip-block');
                if (cb) cb.textContent = level.toLocaleString();

                // Update finality: Tenderbake = 2 confirmations on top of block
                // So finality ≈ 2 × avg block time
                const finalityEl = document.getElementById('uptime-finality');
                const chainFinalityEl = document.getElementById('chain-uptime-finality');
                if ((finalityEl || chainFinalityEl) && recentBlockTimes.length >= 3) {
                    const first = recentBlockTimes[0];
                    const last = recentBlockTimes[recentBlockTimes.length - 1];
                    const avgBlockTime = (last - first) / (recentBlockTimes.length - 1);
                    const finality = Math.round((avgBlockTime * 2) / 1000);
                    const finalityText = `${finality}s`;
                    chainFinalityText = finalityText;
                    finalityButton?.classList.remove('is-loading');
                    finalityButton?.removeAttribute('aria-busy');
                    if (finalityButton) finalityButton.title = 'Live Tenderbake finality estimate from recent block cadence.';
                    try { localStorage.setItem(FINALITY_CACHE_KEY, String(finality)); } catch (_) {}
                    if (finalityEl) setMagicNumber(finalityEl, finalityText);
                    setChainText('chain-uptime-finality', finalityText);
                }

                // Flash the pulse dot
                if (pulseDot) {
                    pulseDot.classList.remove('flash');
                    void pulseDot.offsetWidth;
                    pulseDot.classList.add('flash');
                }

                // Notify pulse viz of new block
                window.dispatchEvent(new Event('block-pulse'));
            }
        } catch (e) {
            // Silent fail — TzKT fallback via _updateUptimeClock still works
        }
    }

    // Poll immediately then every 6 seconds while the document is visible.
    const pollBlockWhenVisible = () => {
        if (document.visibilityState === 'visible') pollBlock();
    };
    pollBlockWhenVisible();
    setInterval(pollBlockWhenVisible, 6000);
    document.addEventListener('visibilitychange', pollBlockWhenVisible);

    // Expose update function for baker/staking/issuance data from main refresh cycle
    window._updateUptimeClock = function(data) {
        // Block data now comes from RPC poller above — only use this for hero metrics
        if (data.blockLevel && data.blockLevel !== lastBlockLevel) {
            lastBlockLevel = data.blockLevel;
            lastBlockTime = data.blockTime ? new Date(data.blockTime).getTime() : Date.now();
            if (blockNumEl) blockNumEl.textContent = data.blockLevel.toLocaleString();
            const cb2 = document.getElementById('cycle-chip-block');
            if (cb2) cb2.textContent = data.blockLevel.toLocaleString();

            if (pulseDot) {
                pulseDot.classList.remove('flash');
                void pulseDot.offsetWidth;
                pulseDot.classList.add('flash');
            }
        }
        if (data.activeBakers && bakersEl) {
            const bakersText = data.activeBakers.toLocaleString();
            chainBakersText = bakersText;
            setMagicNumber(bakersEl, bakersText);
            setChainText('chain-uptime-bakers', bakersText);
        } else if (data.activeBakers) {
            chainBakersText = data.activeBakers.toLocaleString();
            setChainText('chain-uptime-bakers', chainBakersText);
        }
        if (data.stakedRatio) {
            const stakedText = data.stakedRatio.toFixed(1) + '%';
            chainStakedText = stakedText;
            if (stakedEl) setMagicNumber(stakedEl, stakedText);
            setChainText('chain-uptime-staked', stakedText);
        }
        if (data.currentIssuanceRate !== undefined) {
            const issuanceText = formatPercentage(Number(data.currentIssuanceRate), 2);
            chainIssuanceText = issuanceText;
            if (issuanceEl) setMagicNumber(issuanceEl, issuanceText);
            setChainText('chain-uptime-issuance', issuanceText);
        }
        if (TOP_CONTINUITY_TREND_METRICS[explainActiveKey]) {
            renderTopContinuityTrends();
        }
    };
}

function setupEventListeners() {
    // Data status banner — Retry
    const dataStatusRetry = document.getElementById('data-status-retry');
    if (dataStatusRetry) {
        dataStatusRetry.addEventListener('click', () => {
            setDataStatus('stale', 'Retrying…');
            refreshInBackground();
        });
    }

    // Theme toggle
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            openThemePicker();
        });
    }

    // Refresh button
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            refresh();
            refreshBtn.classList.add('spinning');
            setTimeout(() => refreshBtn.classList.remove('spinning'), 1000);
        });
    }

    // Ultra mode toggle - opens selector
    const ultraToggle = document.getElementById('ultra-toggle');
    if (ultraToggle) {
        ultraToggle.addEventListener('click', toggleUltraMode);
    }

    document.getElementById('replay-tour-btn')?.addEventListener('click', () => {
        window.TezosSystemsTour?.replay?.();
    });

    // Setup modals
    setupModal('stake-o-meter-info-btn', 'stake-o-meter-modal', 'stake-o-meter-modal-close');
    setupModal('zero-forks-info-btn', 'zero-forks-modal', 'zero-forks-modal-close');
    setupModal('days-live-info-btn', 'days-live-modal', 'days-live-modal-close');
    setupModal('consensus-info-btn', 'consensus-modal', 'consensus-modal-close');
    setupModal('governance-info-btn', 'governance-modal', 'governance-modal-close');
    setupModal('economy-info-btn', 'economy-modal', 'economy-modal-close');
    setupModal('network-info-btn', 'network-modal', 'network-modal-close');
    setupModal('ecosystem-info-btn', 'ecosystem-modal', 'ecosystem-modal-close');
    setupModal('comparison-info-btn', 'comparison-modal', 'comparison-modal-close');
    setupModal('my-baker-info-btn', 'my-baker-modal', 'my-baker-modal-close');
    setupModal('calc-info-btn', 'calc-modal', 'calc-modal-close');
    setupModal('leaderboard-info-btn', 'leaderboard-modal', 'leaderboard-modal-close');
    setupModal('whale-info-btn', 'whale-modal', 'whale-modal-close');
    setupModal('giants-info-btn', 'giants-modal', 'giants-modal-close');
    setupModal('about-tezos-btn', 'about-tezos-modal', 'about-tezos-modal-close');
    setupModal('visit-streak-info-btn', 'visit-streak-modal', 'visit-streak-modal-close');

    // Handle visibility change
    document.addEventListener('visibilitychange', handleVisibilityChange);
}

const SECTION_EXPLAINERS = Object.freeze({
    'hot-today-info-btn': {
        kicker: 'About Live Pulse',
        title: 'The signals most worth noticing now',
        body: 'Live Pulse carries the most important network, market, governance, staking, and milestone signals across a quiet ticker. Hover, tap, or focus a signal to pause and read its full context.',
        href: '/pulse/',
        link: 'More information'
    },
    'chambers-info-btn': {
        kicker: 'About Explore Tezos',
        title: 'Focused views, organized by question',
        body: 'Choose a topic to find the live data, history, governance, people, and account tools that answer that kind of question.',
        href: '/chambers/',
        link: 'More information'
    }
});

function initSectionExplainers() {
    const disclosures = [];

    function setInteractive(panel, interactive) {
        panel.inert = !interactive;
        panel.querySelectorAll('a, button').forEach((control) => {
            control.tabIndex = interactive ? 0 : -1;
        });
    }

    function closeDisclosure(disclosure, { restoreFocus = false } = {}) {
        if (!disclosure) return;
        const { button, panel } = disclosure;
        panel.classList.remove('is-visible');
        panel.setAttribute('aria-hidden', 'true');
        setInteractive(panel, false);
        button.classList.remove('is-explaining');
        button.setAttribute('aria-expanded', 'false');
        if (restoreFocus) button.focus({ preventScroll: true });
    }

    function closeOthers(current) {
        disclosures.forEach((disclosure) => {
            if (disclosure !== current) closeDisclosure(disclosure);
        });
    }

    for (const [buttonId, copy] of Object.entries(SECTION_EXPLAINERS)) {
        const button = document.getElementById(buttonId);
        const host = button?.closest('.section-header, .pulse-ticker-strip');
        if (!button || !host || button.dataset.sectionExplainerWired === 'true') continue;

        button.dataset.sectionExplainerWired = 'true';
        button.setAttribute('aria-expanded', 'false');

        const panel = document.createElement('div');
        panel.id = `${buttonId}-panel`;
        panel.className = 'top-continuity-explain section-explain';
        panel.setAttribute('role', 'region');
        panel.setAttribute('aria-labelledby', `${buttonId}-panel-title`);
        panel.setAttribute('aria-hidden', 'true');
        panel.innerHTML = `
            <button type="button" class="top-continuity-explain-close" data-close-section-explain aria-label="Dismiss explanation">&times;</button>
            <div class="top-continuity-explain-copy">
                <span class="feature-kicker">${escapeHtml(copy.kicker)}</span>
                <strong id="${buttonId}-panel-title">${escapeHtml(copy.title)}</strong>
                <p>${escapeHtml(copy.body)}</p>
            </div>
            <div class="top-continuity-explain-actions">
                <a class="top-continuity-explain-chart section-explain-link" href="${escapeHtml(copy.href)}">${escapeHtml(copy.link)}</a>
            </div>
        `;
        setInteractive(panel, false);
        host.appendChild(panel);
        button.setAttribute('aria-controls', panel.id);

        const disclosure = { button, panel };
        disclosures.push(disclosure);

        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const shouldOpen = !panel.classList.contains('is-visible');
            closeOthers(disclosure);
            if (!shouldOpen) {
                closeDisclosure(disclosure);
                return;
            }
            panel.classList.add('is-visible');
            panel.setAttribute('aria-hidden', 'false');
            setInteractive(panel, true);
            button.classList.add('is-explaining');
            button.setAttribute('aria-expanded', 'true');
        });

        panel.querySelector('[data-close-section-explain]')?.addEventListener('click', (event) => {
            event.preventDefault();
            closeDisclosure(disclosure, { restoreFocus: true });
        });
    }

    if (!disclosures.length) return;

    document.addEventListener('click', (event) => {
        disclosures.forEach((disclosure) => {
            if (!disclosure.panel.classList.contains('is-visible')) return;
            if (disclosure.panel.contains(event.target) || disclosure.button.contains(event.target)) return;
            closeDisclosure(disclosure);
        });
    });

    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        const active = disclosures.find(({ panel }) => panel.classList.contains('is-visible'));
        if (active) closeDisclosure(active, { restoreFocus: true });
    });
}

function getFocusableElements(root) {
    if (!root) return [];
    return Array.from(root.querySelectorAll([
        'a[href]',
        'button:not([disabled])',
        'input:not([disabled])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])'
    ].join(','))).filter((el) => {
        if (el.closest('[inert], [aria-hidden="true"]')) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    });
}

let genericModalLockCount = 0;
let genericModalBodyOverflow = null;
let genericModalHtmlOverflow = null;

function lockGenericModalScroll() {
    if (genericModalLockCount === 0) {
        genericModalBodyOverflow = document.body.style.overflow;
        genericModalHtmlOverflow = document.documentElement.style.overflow;
        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';
    }
    genericModalLockCount += 1;
}

function unlockGenericModalScroll() {
    genericModalLockCount = Math.max(0, genericModalLockCount - 1);
    if (genericModalLockCount > 0) return;
    document.body.style.overflow = genericModalBodyOverflow || '';
    document.documentElement.style.overflow = genericModalHtmlOverflow || '';
    genericModalBodyOverflow = null;
    genericModalHtmlOverflow = null;
}

/**
 * Setup a modal
 */
function setupModal(triggerBtnId, modalId, closeBtnId) {
    const triggerBtn = document.getElementById(triggerBtnId);
    const modal = document.getElementById(modalId);
    const closeBtn = document.getElementById(closeBtnId);
    const content = modal?.querySelector('.modal-content, .modal-large');
    const title = modal?.querySelector('.modal-title');

    let escHandler = null;
    let focusedBeforeOpen = null;

    if (modal && content) {
        content.setAttribute('role', content.getAttribute('role') || 'dialog');
        content.setAttribute('aria-modal', 'true');
        content.setAttribute('tabindex', content.getAttribute('tabindex') || '-1');
        if (title) {
            title.id = title.id || `${modalId}-title`;
            content.setAttribute('aria-labelledby', title.id);
        } else {
            content.setAttribute('aria-label', content.getAttribute('aria-label') || 'Tezos Systems dialog');
        }
    }

    const openModal = () => {
        if (!modal || modal.classList.contains('active')) return;
        focusedBeforeOpen = document.activeElement;
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        lockGenericModalScroll();
        escHandler = (e) => {
            if (e.key === 'Escape') {
                closeModal();
                return;
            }
            if (e.key !== 'Tab') return;
            const focusable = getFocusableElements(content || modal);
            if (!focusable.length) {
                e.preventDefault();
                content?.focus({ preventScroll: true });
                return;
            }
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus({ preventScroll: true });
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus({ preventScroll: true });
            }
        };
        document.addEventListener('keydown', escHandler);
        window.requestAnimationFrame(() => {
            (closeBtn || getFocusableElements(content || modal)[0] || content)?.focus({ preventScroll: true });
        });
    };

    const closeModal = () => {
        if (!modal || !modal.classList.contains('active')) return;
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
        if (escHandler) {
            document.removeEventListener('keydown', escHandler);
            escHandler = null;
        }
        unlockGenericModalScroll();
        if (focusedBeforeOpen && document.contains(focusedBeforeOpen)) {
            const restoreTarget = focusedBeforeOpen;
            window.requestAnimationFrame(() => restoreTarget.focus({ preventScroll: true }));
        }
        focusedBeforeOpen = null;
    };

    if (triggerBtn && modal) {
        triggerBtn.addEventListener('click', openModal);
    }

    if (closeBtn && modal) {
        closeBtn.addEventListener('click', closeModal);
    }

    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
    }
}

/**
 * Start refresh timer
 */
function startRefreshTimer() {
    state.refreshTimers.forEach(clearInterval);
    state.refreshTimers = [
        setInterval(() => {
            if (document.visibilityState === 'visible') refreshInBackground({ includeHeavy: false });
        }, REFRESH_INTERVALS.scalar),
        setInterval(() => {
            if (document.visibilityState === 'visible') refreshInBackground({ includeHeavy: true });
        }, REFRESH_INTERVALS.heavy)
    ];
    // startCountdown();
}

/**
 * Update last refresh time display
 */
function updateLastRefreshTime() {
    const el = document.getElementById('last-update');
    if (el && state.lastUpdate) {
        el.textContent = formatTimestamp(state.lastUpdate);
    }
}

/**
 * Handle visibility change
 */
function handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
        const now = Date.now();
        const heavyDue = !state.lastHeavyRefreshAt
            || now - state.lastHeavyRefreshAt > REFRESH_INTERVALS.heavy * 0.9;
        const scalarDue = !state.lastScalarRefreshAt
            || now - state.lastScalarRefreshAt > REFRESH_INTERVALS.scalar * 0.9;
        if (heavyDue || scalarDue) refreshInBackground({ includeHeavy: heavyDue });
        // startCountdown();
    }
}

/**
 * Render protocol timeline from data (used for both cached and fresh)
 */
function renderProtocolTimeline(protocols) {
    if (!Array.isArray(protocols) || !protocols.length) return;
    const previousUpgradeCount = Number(state.currentStats?.upgradeCount ?? state.currentStats?.protocolCount);
    const previousProtocolName = state.currentStats?.currentProtocolName
        || document.getElementById('header-current-protocol')?.textContent?.trim()
        || null;
    state.protocols = protocols;
    const upgradeCount = countProtocolUpgrades(protocols);
    const currentProtocol = currentProtocolFromList(protocols);
    const currentProtocolName = currentProtocol?.name || null;
    state.currentStats = {
        ...(state.currentStats || {}),
        protocolCount: upgradeCount,
        upgradeCount,
        currentProtocolName
    };
    updateProtocolHistoryEntryCard(protocols);

    const countEl = document.getElementById('upgrade-count');
    if (countEl) countEl.textContent = upgradeCount;
    const aboutUpgrades = document.getElementById('about-upgrades');
    if (aboutUpgrades) aboutUpgrades.textContent = upgradeCount;
    updateComparison(state.currentStats);

    if (currentProtocol) {
        const headerProtocolEl = document.getElementById('header-current-protocol');
        const activatedInSession = Number.isFinite(previousUpgradeCount)
            && previousUpgradeCount > 0
            && upgradeCount > previousUpgradeCount
            && previousProtocolName
            && previousProtocolName !== currentProtocol.name;
        if (activatedInSession) {
            triggerProtocolActivationCeremony(previousProtocolName, currentProtocol.name, upgradeCount);
            checkMoments(
                { upgradeCount: previousUpgradeCount, currentProtocolName: previousProtocolName },
                { upgradeCount, currentProtocolName: currentProtocol.name }
            );
        } else if (headerProtocolEl) {
            headerProtocolEl.textContent = currentProtocol.name;
        }
    }
    renderProtocolAnthologyBoard(protocols, currentProtocol);

    const timelineEl = document.getElementById('upgrade-timeline');
    if (!timelineEl) return;
    const isHistoryChamber = Boolean(timelineEl.closest('#protocol-history-chamber-modal'));
    const displayProtocols = isHistoryChamber ? [...protocols].reverse() : protocols;
    const timelineSignature = JSON.stringify([
        isHistoryChamber ? 'history' : 'dashboard',
        displayProtocols.map((protocol) => [
            protocol.name,
            protocol.date || '',
            Boolean(protocol.isCurrent),
            isContentiousProtocol(protocol),
            protocol.highlight || '',
            protocol.debate || ''
        ])
    ]);

    // A cached render is commonly followed by the same fresh response. Keep
    // the live controls mounted so that this background confirmation cannot
    // detach focus or collapse an Impact panel the reader already opened.
    if (timelineEl.dataset.protocolTimelineSignature === timelineSignature
        && timelineEl.querySelector(':scope > .timeline-track')) {
        initUpgradeEffect();
        return;
    }
    
    // Track which years to show labels for (first protocol of each year)
    const yearSeen = new Set();
    const timelineHTML = `
        <div class="timeline-track">
            ${displayProtocols.map(p => {
                const contentious = isContentiousProtocol(p);
                const year = p.date ? new Date(p.date).getFullYear() : null;
                const showYear = year && !yearSeen.has(year);
                if (year) yearSeen.add(year);
                const ariaLabel = contentious
                    ? `${p.name} protocol, contested. Open full history.`
                    : `${p.name} protocol. Open protocol card.`;
                return `
                <div class="timeline-item ${p.isCurrent ? 'current' : ''} ${contentious ? 'contentious' : ''}" 
                     data-protocol="${escapeHtml(p.name)}" data-quiet-key="protocol-${escapeHtml(p.name)}" role="button" tabindex="0" aria-label="${escapeHtml(ariaLabel)}">
                    ${escapeHtml(p.name[0])}
                    ${contentious ? '<span class="contention-crowd contention-crowd-left" aria-hidden="true"></span><span class="contention-crowd contention-crowd-right" aria-hidden="true"></span><span class="contention-icon" aria-hidden="true">⚔</span>' : ''}
                    ${showYear ? `<span class="timeline-year">${year}</span>` : ''}
                </div>
            `}).join('')}
        </div>
    `;
    const currentTrack = timelineEl.querySelector(':scope > .timeline-track');
    if (currentTrack) {
        quietlySyncElement(currentTrack, timelineHTML);
    } else {
        timelineEl.querySelector(':scope > .chamber-loading, :scope > .chamber-error')?.remove();
        timelineEl.insertAdjacentHTML('afterbegin', timelineHTML);
    }
    timelineEl.dataset.protocolTimelineSignature = timelineSignature;
    const renderGeneration = Number(timelineEl.dataset.protocolRenderGeneration || 0) + 1;
    timelineEl.dataset.protocolRenderGeneration = String(renderGeneration);
    
    // Render expanded infographic below timeline
    renderInfographic(displayProtocols, timelineEl, {
        currentFirst: isHistoryChamber,
        renderGeneration
    });
    
    // Load protocol-data.json for rich tooltips, then attach JS tooltips
    initRichTooltips(protocols, timelineEl, renderGeneration);
    
    // Initialize Upgrade Effect chart (toggle below timeline)
    initUpgradeEffect();
    
}

/**
 * Render expanded protocol infographic below the letter timeline
 */
async function renderInfographic(protocols, timelineEl, options = {}) {
    const data = await loadProtocolData();
    if (!timelineEl.isConnected
        || Number(timelineEl.dataset.protocolRenderGeneration) !== options.renderGeneration) return;
    const richMap = {};
    if (data?.protocols) {
        data.protocols.forEach(p => { richMap[p.name] = p; });
    }
    
    const featurePanel = timelineEl.closest('.protocol-history-feature-panel, .upgrade-clock-content')
        || timelineEl.parentElement;
    const upgradeCount = featurePanel?.querySelector('.upgrade-count');
    let toggleDiv = upgradeCount?.querySelector('.protocol-timeline-toggle-btn')?.closest('.infographic-toggle');
    if (!toggleDiv) {
        toggleDiv = document.createElement('div');
        toggleDiv.className = 'infographic-toggle';
        toggleDiv.innerHTML = '<button class="infographic-toggle-btn protocol-timeline-toggle-btn" type="button" aria-expanded="false" aria-controls="protocol-infographic">View Timeline ▾</button>';
        (upgradeCount || timelineEl).appendChild(toggleDiv);
    }

    let infographic = timelineEl.querySelector(':scope > #protocol-infographic');
    if (!infographic) {
        infographic = document.createElement('div');
        infographic.className = 'protocol-infographic';
        infographic.id = 'protocol-infographic';
        infographic.setAttribute('role', 'region');
        infographic.setAttribute('aria-label', 'Protocol timeline details');
        infographic.setAttribute('aria-hidden', 'true');
        infographic.setAttribute('inert', '');
        timelineEl.appendChild(infographic);
    }
    
    // Pick a key tag for each protocol (first change, shortened)
    function getTag(p) {
        const rich = richMap[p.name];
        if (rich?.blockTime) return `${rich.blockTime}s blocks`;
        if (rich?.changes?.length) {
            const c = rich.changes[0];
            if (c.length <= 20) return c;
            return c.slice(0, 18) + '…';
        }
        return null;
    }
    
    const explicitCurrent = protocols.find(p => p.isCurrent);
    const fallbackCurrent = options.currentFirst ? protocols[0] : protocols[protocols.length - 1];
    const currentName = (explicitCurrent || fallbackCurrent)?.name || '';
    let rowsHTML = '';
    protocols.forEach((p, i) => {
        const isCurrent = p.isCurrent || p.name === currentName;
        const rich = richMap[p.name];
        const contentious = isContentiousProtocol(p, rich);
        const dateStr = rich?.date
            ? new Date(rich.date + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
            : '';
        const headline = rich?.headline || '';
        const tag = getTag(p);
        const delay = i * 30;
        
        const ariaLabel = contentious
            ? `${p.name} protocol, contested. Open full history.`
            : `${p.name} protocol. Open protocol card.`;
        rowsHTML += `
            <div class="infographic-row ${contentious ? 'contentious' : ''} ${isCurrent ? 'current' : ''}" 
                 style="animation-delay: ${delay}ms" data-protocol="${escapeHtml(p.name)}" data-quiet-key="protocol-detail-${escapeHtml(p.name)}" role="button" tabindex="0" aria-label="${escapeHtml(ariaLabel)}">
                <div class="infographic-dot"></div>
                <span class="infographic-letter">${escapeHtml(p.name[0])}</span>
                <span class="infographic-name" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</span>
                <span class="infographic-date">${escapeHtml(dateStr)}</span>
                <span class="infographic-headline">${escapeHtml(headline)}</span>
                ${contentious ? '<span class="infographic-clash-crowd infographic-clash-left" aria-hidden="true"></span><span class="infographic-clash-crowd infographic-clash-right" aria-hidden="true"></span><span class="infographic-contention" aria-hidden="true">⚔</span>' : ''}
                ${tag ? `<div class="infographic-tags"><span class="infographic-tag">${escapeHtml(tag)}</span></div>` : ''}
            </div>
        `;
    });
    
    quietlySyncHtml(infographic, `<div class="infographic-inner">${rowsHTML}</div>`);
    infographic._protocolRichMap = richMap;
    
    // Click on infographic rows — same behavior as clicking timeline letters
    const openInfographicRow = function(row) {
        if (!row) return;
        const name = row.getAttribute('data-protocol');
        if (!name) return;
        const currentRichMap = infographic._protocolRichMap || {};
        const richP = currentRichMap[name];
        if (richP && richP.history) {
            openProtocolHistoryByName(name);
        } else if (typeof window.captureProtocol === 'function') {
            const proto = currentRichMap[name];
            if (proto) window.captureProtocol(proto);
        }
    };

    if (!infographic.dataset.protocolInfographicWired) {
        infographic.addEventListener('click', function(e) {
            const row = e.target.closest('.infographic-row');
            openInfographicRow(row);
        });

        infographic.addEventListener('keydown', function(e) {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            const row = e.target.closest('.infographic-row');
            if (!row) return;
            e.preventDefault();
            openInfographicRow(row);
        });
        infographic.dataset.protocolInfographicWired = '1';
    }
    
    // Make rows look clickable
    infographic.querySelectorAll('.infographic-row').forEach(function(row) {
        row.style.cursor = 'pointer';
    });
    
    // Toggle logic
    const btn = toggleDiv.querySelector('.infographic-toggle-btn');
    if (!btn.dataset.protocolTimelineToggleWired) {
        btn.addEventListener('click', () => {
            const expanded = infographic.classList.toggle('expanded');
            btn.textContent = expanded ? 'Hide Timeline ▴' : 'View Timeline ▾';
            btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
            infographic.setAttribute('aria-hidden', expanded ? 'false' : 'true');
            infographic.toggleAttribute('inert', !expanded);
        });
        btn.dataset.protocolTimelineToggleWired = '1';
    }
}

/**
 * Rich JS-powered tooltips for protocol timeline items
 */
let _protocolDataCache = null;
async function loadProtocolData() {
    if (_protocolDataCache) return _protocolDataCache;
    try {
        _protocolDataCache = await loadDataAsset('protocolData');
        return _protocolDataCache;
    } catch (e) { return null; }
}

function protocolToHistory(protocol) {
    if (protocol?.history) return protocol.history;
    if (!protocol) return null;

    const date = protocol.date
        ? new Date(protocol.date + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
        : 'Activation date unavailable';
    const changes = Array.isArray(protocol.changes) && protocol.changes.length
        ? protocol.changes.map((change) => `• ${change}`).join('\n\n')
        : 'No curated change list is available yet.';
    const blockLine = protocol.block ? `Activated at block ${Number(protocol.block).toLocaleString('en-US')}.` : '';
    const blockTimeLine = protocol.blockTime ? `Block time target: ${protocol.blockTime} seconds.` : '';
    const debateLine = protocol.debate ? `\n\n${protocol.debate}` : '';
    const contentionLine = protocol.contention ? `\n\n${protocol.contention}` : '';

    return {
        title: `${protocol.name} Protocol`,
        subtitle: [date, protocol.hash].filter(Boolean).join(' · '),
        sections: [
            {
                heading: 'Protocol Context',
                content: [
                    protocol.headline || 'Self-amendment protocol upgrade.',
                    blockLine,
                    blockTimeLine
                ].filter(Boolean).join('\n\n') + debateLine + contentionLine
            },
            {
                heading: 'What Changed',
                content: changes
            }
        ]
    };
}

async function openProtocolHistoryByName(protocolName, { updateRoute = true, replaceRoute = false } = {}) {
    const target = String(protocolName || '').trim();
    if (!target) return false;
    // Capture the launcher before the data await: a quiet timeline refresh may
    // otherwise move focus before the Story joins the overlay stack.
    const opener = document.activeElement;
    const data = await loadProtocolData();
    const match = findProtocolByRouteValue(data?.protocols, target)
        || data?.protocols?.find((protocol) => protocol.name.toLowerCase().includes(target.toLowerCase()));
    const history = protocolToHistory(match);
    if (!match || !history) return false;
    if (updateRoute) setProtocolStoryRoute(match, { replace: replaceRoute });
    showProtocolHistoryModal(history, match.name, {
        opener,
        protocol: match,
        protocols: data.protocols
    });
    return true;
}

window.openProtocolHistoryByName = openProtocolHistoryByName;

function renderProtocolHistoryPrintDocument(history, protocolName, protocol = null) {
    const renderTextBlocks = (content = '') => String(content)
        .split(/\n{2,}/)
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
            if (part.startsWith('•') || part.startsWith('- ')) {
                const items = part.split(/\n/).map((item) => item.replace(/^[•-]\s*/, '').trim()).filter(Boolean);
                return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
            }
            if (part.startsWith('"') || part.startsWith('\u201c')) {
                return `<blockquote>${escapeHtml(part)}</blockquote>`;
            }
            return `<p>${escapeHtml(part)}</p>`;
        })
        .join('');

    const sectionsHtml = (history?.sections || []).map((section) => {
        if (section.type === 'timeline') {
            const events = Array.isArray(section.events) ? section.events : [];
            return `
                <section>
                    <h2>${escapeHtml(section.heading || 'Timeline')}</h2>
                    <ol class="print-timeline">
                        ${events.map((event) => `
                            <li>
                                <time>${escapeHtml(event.date || '')}</time>
                                <p>${escapeHtml(event.text || '')}</p>
                            </li>
                        `).join('')}
                    </ol>
                </section>
            `;
        }
        if (section.type === 'versus') {
            const sides = [section.left, section.right].filter(Boolean);
            return `
                <section>
                    <h2>${escapeHtml(section.heading || 'The Debate')}</h2>
                    <div class="print-versus">
                        ${sides.map((side) => `
                            <article>
                                <h3>${escapeHtml(side.name || '')}</h3>
                                <small>${escapeHtml(side.team || '')}</small>
                                <p>${escapeHtml(side.position || '')}</p>
                                ${side.quote ? `<blockquote>${escapeHtml(side.quote)}</blockquote>` : ''}
                            </article>
                        `).join('')}
                    </div>
                </section>
            `;
        }
        return `
            <section>
                <h2>${escapeHtml(section.heading || 'Protocol Context')}</h2>
                ${renderTextBlocks(section.content)}
            </section>
        `;
    }).join('');
    const printReceipts = [
        protocol?.block ? { label: `Activation block ${Number(protocol.block).toLocaleString('en-US')}`, url: `https://tzkt.io/${protocol.block}` } : null,
        ...(Array.isArray(history?.sources) ? history.sources : [])
    ].filter((source) => source?.url);
    const receiptsHtml = printReceipts.length ? `
        <section>
            <h2>Receipts & sources</h2>
            <ul>${printReceipts.map((source) => `<li><strong>${escapeHtml(source.label || 'Source')}</strong><br><span>${escapeHtml(source.url)}</span></li>`).join('')}</ul>
        </section>
    ` : '';

    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(protocolName || history?.title || 'Protocol History')}</title>
<style>
    * { box-sizing: border-box; }
    body {
        margin: 0;
        padding: 42px;
        color: #111827;
        background: #ffffff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        line-height: 1.55;
    }
    main { max-width: 780px; margin: 0 auto; }
    header { border-bottom: 2px solid #111827; margin-bottom: 24px; padding-bottom: 18px; }
    .kicker {
        color: #2563eb;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.14em;
        text-transform: uppercase;
    }
    h1 { margin: 8px 0 6px; font-size: 30px; line-height: 1.12; }
    .subtitle { color: #4b5563; font-size: 13px; }
    h2 { break-after: avoid; margin: 28px 0 10px; font-size: 17px; color: #0f172a; }
    h3 { margin: 0 0 3px; font-size: 15px; }
    p, li, blockquote { font-size: 13px; }
    p { margin: 0 0 11px; }
    ul { margin: 0 0 12px 18px; padding: 0; }
    blockquote {
        margin: 12px 0;
        padding: 10px 14px;
        border-left: 3px solid #2563eb;
        background: #f8fafc;
        color: #334155;
    }
    .print-timeline { margin: 0; padding-left: 22px; }
    .print-timeline li { margin-bottom: 12px; }
    time {
        display: block;
        color: #2563eb;
        font-size: 11px;
        font-weight: 800;
        margin-bottom: 2px;
    }
    .print-versus { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .print-versus article {
        border: 1px solid #dbe3ef;
        border-radius: 8px;
        padding: 14px;
        break-inside: avoid;
    }
    .print-versus small { display: block; color: #64748b; margin-bottom: 8px; }
    footer {
        margin-top: 32px;
        padding-top: 12px;
        border-top: 1px solid #e5e7eb;
        color: #64748b;
        font-size: 11px;
    }
    @media print {
        body { padding: 0.55in; }
        .print-versus { grid-template-columns: 1fr 1fr; }
    }
</style>
</head>
<body>
<main>
    <header>
        <div class="kicker">Tezos Systems Protocol Anthology</div>
        <h1>${escapeHtml(history?.title || `${protocolName} Protocol`)}</h1>
        <div class="subtitle">${escapeHtml(history?.subtitle || '')}</div>
    </header>
    ${sectionsHtml}
    ${receiptsHtml}
    <footer>Printed from <strong>${escapeHtml(protocolStoryUrl(protocol || protocolName))}</strong></footer>
</main>
</body>
</html>`;
}

function printProtocolHistory(history, protocolName, protocol = null) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        window.print();
        return;
    }
    printWindow.document.open();
    printWindow.document.write(renderProtocolHistoryPrintDocument(history, protocolName, protocol));
    printWindow.document.close();
    window.setTimeout(() => {
        printWindow.focus();
        printWindow.print();
    }, 180);
}

async function initRichTooltips(protocols, timelineEl = null, renderGeneration = null) {
    const data = await loadProtocolData();
    if (timelineEl && (
        !timelineEl.isConnected
        || Number(timelineEl.dataset.protocolRenderGeneration) !== renderGeneration
    )) return;
    const richMap = {};
    if (data?.protocols) {
        data.protocols.forEach(p => { richMap[p.name] = p; });
    }

    const tooltipOwner = timelineEl?.closest('.chamber-overlay.active, .modal-overlay.active') || null;

    // Create shared tooltip element. It remains a body-level fixed portal so
    // the room scroller cannot clip it, while ownership keeps it interactive
    // only when its exact parent dialog is topmost.
    let tooltipEl = document.getElementById('timeline-tooltip');
    if (!tooltipEl) {
        tooltipEl = document.createElement('div');
        tooltipEl.id = 'timeline-tooltip';
        tooltipEl.style.cssText = `
            position: fixed; z-index: 10000; pointer-events: auto;
            opacity: 0; visibility: hidden;
            transition: opacity 0.2s ease, visibility 0.2s ease;
            border-radius: 10px; padding: 14px 16px;
            width: 340px; max-width: 90vw;
            font-size: 0.72rem; line-height: 1.5;
        `;
        document.body.appendChild(tooltipEl);
    }
    if (tooltipOwner?.id) tooltipEl.setAttribute('data-overlay-portal-owner', tooltipOwner.id);
    else tooltipEl.removeAttribute('data-overlay-portal-owner');
    reconcileOverlayEnvironment();
    tooltipEl.style.pointerEvents = 'auto';

    const hideTooltip = () => {
        tooltipEl.style.opacity = '0';
        tooltipEl.style.visibility = 'hidden';
        window.clearTimeout(tooltipEl._protocolHideTimer);
        tooltipEl._protocolHideTimer = null;
    };
    const cancelTooltipHide = () => {
        window.clearTimeout(tooltipEl._protocolHideTimer);
        tooltipEl._protocolHideTimer = null;
    };
    const scheduleTooltipHide = () => {
        window.clearTimeout(tooltipEl._protocolHideTimer);
        tooltipEl._protocolHideTimer = window.setTimeout(hideTooltip, 260);
    };

    if (!tooltipEl.dataset.protocolTooltipWired) {
        tooltipEl.addEventListener('mouseenter', cancelTooltipHide);
        tooltipEl.addEventListener('mouseleave', scheduleTooltipHide);
        tooltipEl.addEventListener('click', (event) => {
            const trigger = event.target.closest('[data-protocol-tooltip-open]');
            if (!trigger) return;
            event.preventDefault();
            event.stopPropagation();
            const name = trigger.getAttribute('data-protocol-tooltip-open');
            hideTooltip();
            openProtocolHistoryByName(name);
        });
        tooltipEl.dataset.protocolTooltipWired = '1';
    }

    /** Apply theme-aware styles to the tooltip (called on each show) */
    function applyTooltipTheme(el) {
        const t = document.body.getAttribute('data-theme');
        const isMatrix = t === 'matrix', isClean = t === 'clean', isDark = t === 'dark', isBubblegum = t === 'bubblegum', isValley = t === 'valley';
        el.style.background = isClean ? 'rgba(255, 255, 255, 0.98)' : isDark ? 'rgba(26, 26, 26, 0.98)' : isMatrix ? 'rgba(0, 10, 0, 0.98)' : isBubblegum ? 'rgba(26, 15, 34, 0.98)' : isValley ? 'rgba(29, 33, 22, 0.98)' : 'rgba(10, 10, 15, 0.98)';
        el.style.border = `1px solid ${isClean ? 'rgba(0, 0, 0, 0.1)' : isDark ? '#333333' : isMatrix ? 'rgba(0, 255, 0, 0.5)' : isBubblegum ? 'rgba(255, 105, 180, 0.4)' : isValley ? 'rgba(231, 182, 108, 0.4)' : 'rgba(0, 212, 255, 0.4)'}`;
        el.style.boxShadow = isClean ? '0 8px 32px rgba(0,0,0,0.12)' : '0 8px 32px rgba(0,0,0,0.6)';
        el.style.color = isClean ? '#1A1A2E' : isDark ? '#E8E8E8' : isMatrix ? '#00ff00' : isBubblegum ? '#F0E0F6' : isValley ? '#FFF4D6' : 'var(--text-primary)';
    }

    const items = (timelineEl || document).querySelectorAll('.timeline-item');
    items.forEach(item => {
        const name = item.getAttribute('data-protocol');
        const govP = protocols.find(p => p.name === name);
        const richP = richMap[name];
        item._protocolTooltipContext = { name, govP, richP };

        if (item.dataset.protocolTooltipWired) return;

        const openProtocol = (event) => {
            const context = item._protocolTooltipContext || {};
            if (!context.richP?.history) return false;
            event?.preventDefault?.();
            event?.stopPropagation?.();
            hideTooltip();
            openProtocolHistoryByName(context.name);
            return true;
        };

        item.addEventListener('mouseenter', (e) => {
            const context = item._protocolTooltipContext || {};
            const currentName = context.name || item.getAttribute('data-protocol') || '';
            const currentGovP = context.govP;
            const currentRichP = context.richP;
            cancelTooltipHide();
            applyTooltipTheme(tooltipEl);
            const _theme = document.body.getAttribute('data-theme');
            const accent = _theme === 'clean' ? '#2563EB' : _theme === 'dark' ? '#C8C8C8' : _theme === 'matrix' ? '#00ff00' : _theme === 'valley' ? '#E7B66C' : '#00d4ff';
            const accentDim = _theme === 'clean' ? 'rgba(37,99,235,0.6)' : _theme === 'dark' ? 'rgba(200,200,200,0.6)' : _theme === 'matrix' ? 'rgba(0,255,0,0.6)' : _theme === 'valley' ? 'rgba(231,182,108,0.68)' : 'rgba(0,212,255,0.6)';
            
            let html = '';
            // Title line
            const headline = currentRichP?.headline || currentGovP?.highlight || 'Network upgrade';
            html += `<div style="font-weight:700; color:${accent}; font-size:0.82rem; margin-bottom:4px;">${escapeHtml(currentName)}</div>`;
            html += `<div style="color:rgba(255,255,255,0.75); margin-bottom:6px; font-style:italic;">${escapeHtml(headline)}</div>`;
            
            // Debate
            const debate = currentRichP?.debate || currentGovP?.debate;
            if (debate) {
                html += `<div style="color:${accentDim}; margin-bottom:6px;">📌 ${escapeHtml(debate)}</div>`;
            }
            
            // Changes
            const changes = currentRichP?.changes;
            if (changes && changes.length) {
                html += `<div style="margin-top:4px; color:rgba(255,255,255,0.6);">`;
                changes.forEach(c => { html += `<div style="padding-left:8px;">• ${escapeHtml(c)}</div>`; });
                html += `</div>`;
            }
            
            // Date
            if (currentRichP?.date) {
                const d = new Date(currentRichP.date + 'T00:00:00Z');
                const dateStr = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
                html += `<div style="margin-top:6px; color:rgba(255,255,255,0.3); font-size:0.65rem;">${dateStr}</div>`;
            }

            // "Read Full History" button for contentious protocols
            if (currentRichP?.history) {
                html += `<div style="margin-top:8px; padding-top:8px; border-top:1px solid rgba(255,255,255,0.08);">
                    <button class="history-expand-btn" type="button" data-protocol-tooltip-open="${escapeHtml(currentName)}" style="color:${accent};">
                        Read full history
                    </button>
                </div>`;
            }

            tooltipEl.innerHTML = html;
            tooltipEl.style.opacity = '1';
            tooltipEl.style.visibility = 'visible';
            positionTooltip(e, tooltipEl);
        });
        
        item.addEventListener('mousemove', (e) => positionTooltip(e, tooltipEl));
        
        item.addEventListener('mouseleave', scheduleTooltipHide);

        // Click to open full history modal for contentious protocols
        if (richP?.history) {
            item.style.cursor = 'pointer';
            item.addEventListener('click', openProtocol);
            item.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                openProtocol(event);
            });
        }
        item.dataset.protocolTooltipWired = '1';
    });
}

function showProtocolHistoryModal(history, protocolName, { opener = null, protocol = null, protocols = [] } = {}) {
    const existing = document.getElementById('protocol-history-modal');
    if (existing) {
        existing._protocolStoryCleanup?.({ restoreFocus: false });
        existing.remove();
    }

    const _modalTheme = document.body.getAttribute('data-theme');
    const isMatrix = _modalTheme === 'matrix';
    const isClean = _modalTheme === 'clean';
    const isDark = _modalTheme === 'dark';
    const isBubblegum = _modalTheme === 'bubblegum';
    const isValley = _modalTheme === 'valley';
    const accent = isClean ? '#2563EB' : isDark ? '#C8C8C8' : isMatrix ? '#00ff00' : isBubblegum ? '#FF69B4' : isValley ? '#E7B66C' : '#00d4ff';
    const accentRgb = isClean ? '37,99,235' : isDark ? '200,200,200' : isMatrix ? '0,255,0' : isBubblegum ? '255,105,180' : isValley ? '231,182,108' : '0,212,255';
    const bg = isClean ? 'rgba(255, 255, 255, 0.98)' : isDark ? 'rgba(26, 26, 26, 0.98)' : isMatrix ? 'rgba(0, 8, 0, 0.98)' : isBubblegum ? 'rgba(26, 15, 34, 0.98)' : isValley ? 'rgba(29, 33, 22, 0.98)' : 'rgba(8, 8, 16, 0.98)';
    const borderColor = isClean ? 'rgba(0,0,0,0.1)' : isDark ? '#333333' : isMatrix ? 'rgba(0,255,0,0.3)' : isBubblegum ? 'rgba(255,105,180,0.3)' : isValley ? 'rgba(231,182,108,0.34)' : 'rgba(0,212,255,0.3)';
    const records = Array.isArray(protocols) && protocols.length ? protocols : [protocol].filter(Boolean);
    const record = protocol || findProtocolByRouteValue(records, protocolName);
    const recordIndex = records.findIndex((item) => item?.name === record?.name);
    const olderProtocol = recordIndex > 0 ? records[recordIndex - 1] : null;
    const newerProtocol = recordIndex >= 0 && recordIndex < records.length - 1 ? records[recordIndex + 1] : null;
    const storyWords = (history.sections || []).flatMap((section) => [
        section.heading,
        section.content,
        ...(section.events || []).flatMap((event) => [event.date, event.text]),
        section.left?.name,
        section.left?.team,
        section.left?.position,
        section.left?.quote,
        section.right?.name,
        section.right?.team,
        section.right?.position,
        section.right?.quote
    ]).filter(Boolean).join(' ');
    const wordCount = storyWords.split(/\s+/).filter(Boolean).length;
    const readMinutes = Math.max(1, Math.ceil(wordCount / 220));
    const sectionLinks = [];
    const topics = protocolAnthologyTopics(record);
    const ordinal = getProtocolUpgradeOrdinal(record, records);
    const whySection = (history.sections || []).find((section) => /why (it )?matter/i.test(section.heading || ''));
    const whyItMatters = protocolBriefExcerpt(
        String(whySection?.content || record?.headline || history.subtitle || '').split(/\n{2,}/)[0]
    );
    const nextStep = newerProtocol
        ? `${newerProtocol.name} followed with ${String(newerProtocol.headline || newerProtocol.changes?.[0] || 'the next amendment').replace(/\.$/, '')}.`
        : 'This is the current operating chapter of Tezos.';
    const keyMoves = Array.isArray(record?.changes) ? record.changes.slice(0, 4) : [];

    let sectionsHtml = '';
    for (const [sectionIndex, section] of history.sections.entries()) {
        const sectionSlug = protocolRouteSlug(section.heading || `section-${sectionIndex + 1}`);
        const sectionId = `story-${sectionSlug || `section-${sectionIndex + 1}`}`;
        sectionLinks.push({ id: sectionId, label: section.heading || 'Protocol context' });
        if (section.type === 'timeline') {
            sectionsHtml += `<section class="protocol-story-section" aria-labelledby="${sectionId}"><h3 id="${sectionId}">${escapeHtml(section.heading)}</h3>`;
            sectionsHtml += '<ol class="protocol-story-timeline">';
            for (const ev of section.events) {
                sectionsHtml += `
                    <li data-story-side="${escapeHtml(ev.side || 'neutral')}">
                        <time>${escapeHtml(ev.date)}</time>
                        <p>${escapeHtml(ev.text)}</p>
                    </li>`;
            }
            sectionsHtml += '</ol></section>';
        } else if (section.type === 'versus') {
            sectionsHtml += `<section class="protocol-story-section" aria-labelledby="${sectionId}"><h3 id="${sectionId}">${escapeHtml(section.heading)}</h3>`;
            sectionsHtml += '<div class="protocol-story-versus">';
            for (const [sideIndex, side] of [section.left, section.right].entries()) {
                sectionsHtml += `
                    <article data-story-side="${sideIndex === 0 ? 'left' : 'right'}">
                        <h4>${escapeHtml(side.name)}</h4>
                        <small>${escapeHtml(side.team)}</small>
                        <p>${escapeHtml(side.position)}</p>
                        ${side.quote ? `<blockquote>“${escapeHtml(side.quote)}”</blockquote>` : ''}
                    </article>`;
            }
            sectionsHtml += `</div></section>`;
        } else {
            sectionsHtml += `<section class="protocol-story-section" aria-labelledby="${sectionId}"><h3 id="${sectionId}">${escapeHtml(section.heading)}</h3>`;
            const paras = section.content.split('\n\n');
            for (const p of paras) {
                if (p.startsWith('•') || p.startsWith('- ')) {
                    const items = p.split('\n').map((item) => item.replace(/^[•-]\s*/, '').trim()).filter(Boolean);
                    sectionsHtml += `<ul class="protocol-story-list">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
                } else if (p.startsWith('"') || p.startsWith('\u201c')) {
                    sectionsHtml += `<blockquote>${escapeHtml(p)}</blockquote>`;
                } else {
                    sectionsHtml += `<p>${escapeHtml(p)}</p>`;
                }
            }
            sectionsHtml += '</section>';
        }
    }

    const sources = Array.isArray(history.sources) ? history.sources.filter((source) => source?.url) : [];
    const receipts = [
        record?.block ? { label: `Activation block ${Number(record.block).toLocaleString('en-US')}`, url: `https://tzkt.io/${record.block}` } : null,
        ...sources
    ].filter(Boolean);
    const sourcesHtml = receipts.length ? `
        <section class="protocol-story-sources" aria-labelledby="protocol-story-sources-title">
            <h3 id="protocol-story-sources-title">Receipts & sources</h3>
            <div>${receipts.map((source) => `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.label)} <span aria-hidden="true">↗</span></a>`).join('')}</div>
        </section>
    ` : '';

    const modal = document.createElement('div');
    modal.id = 'protocol-history-modal';
    modal.className = 'protocol-history-story-overlay';
    modal.setAttribute('aria-hidden', 'true');
    modal.dataset.anthologyTone = protocolAnthologyTone(record);
    modal.style.setProperty('--protocol-story-accent', accent);
    modal.style.setProperty('--protocol-story-accent-rgb', accentRgb);
    modal.innerHTML = `
        <div class="modal-large protocol-history-story-modal" role="dialog" aria-modal="true" aria-labelledby="protocol-history-story-title" tabindex="-1">
            <div class="protocol-story-topbar">
                <a class="protocol-story-back" href="/anthology/"><span aria-hidden="true">←</span> All chapters</a>
                <span class="protocol-story-topbar-title">${ordinal === null ? 'Follow-up' : `Chapter ${String(ordinal).padStart(2, '0')}`} · ${escapeHtml(record?.name || protocolName)}</span>
                <button id="history-modal-close" type="button" aria-label="Close protocol history">×</button>
                <span class="protocol-story-progress-rule" aria-hidden="true"><i></i></span>
            </div>
            <header class="protocol-story-header" data-anthology-tone="${protocolAnthologyTone(record)}">
                <div class="protocol-story-cover-number" aria-hidden="true"><small>${ordinal === null ? 'Follow-up' : 'Chapter'}</small><b>${ordinal === null ? '—' : String(ordinal).padStart(2, '0')}</b></div>
                <div class="protocol-story-cover-copy">
                    <span class="feature-kicker">Protocol Anthology · ${escapeHtml(protocolAnthologyEra(record).title)}</span>
                    <h2 class="protocol-history-story-title" id="protocol-history-story-title">${escapeHtml(history.title)}</h2>
                    <p class="protocol-story-subtitle">${escapeHtml(history.subtitle)}</p>
                    <div class="protocol-story-meta" aria-label="Story details">
                        ${record?.date ? `<time datetime="${escapeHtml(record.date)}">${escapeHtml(formatProtocolDate(record))}</time>` : ''}
                        <span>${readMinutes} min read</span>
                        ${record?.block ? `<span>Block ${Number(record.block).toLocaleString('en-US')}</span>` : ''}
                    </div>
                    <div class="protocol-story-topic-row">${topics.map((topic) => `<span>${escapeHtml(topic)}</span>`).join('')}</div>
                </div>
            </header>
            <div class="protocol-story-layout">
                <aside class="protocol-story-rail" aria-label="Chapter tools">
                    <div class="protocol-story-reading-progress"><span>Reading progress</span><strong><b>0</b>%</strong></div>
                    <div class="protocol-history-story-actions" aria-label="Share and export this chapter">
                        <button class="protocol-story-share-primary" id="history-modal-native-share" type="button"><span aria-hidden="true">↗</span> Share chapter</button>
                        <button id="history-modal-copy-link" type="button"><span aria-hidden="true">⌁</span> Copy link</button>
                        <button id="history-modal-share" type="button"><span aria-hidden="true">▧</span> Make image</button>
                        <button id="history-modal-print" type="button"><span aria-hidden="true">↓</span> Print / PDF</button>
                    </div>
                    <p class="protocol-story-share-status" id="protocol-story-share-status" role="status" aria-live="polite"></p>
                    ${sectionLinks.length > 1 ? `
                        <nav class="protocol-story-contents" aria-label="In this chapter">
                            <span>In this chapter</span>
                            <div>${sectionLinks.map((section, index) => `<a href="#${section.id}" data-story-section-link="${section.id}"><b>${String(index + 1).padStart(2, '0')}</b>${escapeHtml(section.label)}</a>`).join('')}</div>
                        </nav>
                    ` : ''}
                </aside>
                <main class="protocol-story-main">
                    <section class="protocol-story-brief" aria-labelledby="protocol-story-brief-title">
                        <div class="protocol-story-brief-head"><span class="feature-kicker">The fast take</span><h3 id="protocol-story-brief-title">60-second brief</h3></div>
                        <div>
                            <article><span>01 · Defining move</span><p>${escapeHtml(record?.headline || history.subtitle || 'Protocol amendment')}</p></article>
                            <article><span>02 · Why it mattered</span><p>${escapeHtml(whyItMatters || 'Open the chapter for the context behind this amendment.')}</p></article>
                            <article><span>03 · What came next</span><p>${escapeHtml(nextStep)}</p></article>
                        </div>
                    </section>
                    ${keyMoves.length ? `
                        <section class="protocol-story-key-moves" aria-labelledby="protocol-story-key-moves-title">
                            <span class="feature-kicker">At a glance</span>
                            <h3 id="protocol-story-key-moves-title">Key moves</h3>
                            <ul>${keyMoves.map((change) => `<li>${escapeHtml(change)}</li>`).join('')}</ul>
                        </section>
                    ` : ''}
                    <article class="protocol-story-article">
                        ${sectionsHtml}
                        ${sourcesHtml}
                    </article>
                    <nav class="protocol-story-pagination" aria-label="Adjacent protocol chapters">
                        ${olderProtocol ? `<a href="${escapeHtml(protocolStoryPath(olderProtocol))}" data-protocol-story-nav="${escapeHtml(olderProtocol.name)}"><span>← Older chapter</span><strong>${escapeHtml(olderProtocol.name)}</strong><small>${escapeHtml(olderProtocol.headline || '')}</small></a>` : '<span></span>'}
                        ${newerProtocol ? `<a href="${escapeHtml(protocolStoryPath(newerProtocol))}" data-protocol-story-nav="${escapeHtml(newerProtocol.name)}"><span>Newer chapter →</span><strong>${escapeHtml(newerProtocol.name)}</strong><small>${escapeHtml(newerProtocol.headline || '')}</small></a>` : '<a href="/anthology/"><span>Back to</span><strong>All chapters</strong><small>Choose another trail through the archive.</small></a>'}
                    </nav>
                </main>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    document.title = `${protocolName} Protocol — Protocol Anthology | tezos.systems`;
    requestAnimationFrame(() => { modal.style.opacity = '1'; });

    const clearDirectStoryRoute = () => {
        const searchParams = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams(window.location.hash.slice(1));
        const hadProtocolRoute = searchParams.has('protocol')
            || hashParams.has('protocol')
            || /^\/anthology\/[^/]+\/?$/i.test(window.location.pathname);
        if (!hadProtocolRoute) return;
        searchParams.delete('protocol');
        hashParams.delete('protocol');
        const search = searchParams.toString();
        const hash = hashParams.toString();
        const nextUrl = `/anthology/${search ? `?${search}` : ''}${hash ? `#${hash}` : ''}`;
        window.history.replaceState(
            { ...(window.history.state || {}), tezosSystemsRoute: 'anthology', protocol: null },
            '',
            nextUrl
        );
    };
    const closeModal = () => {
        if (modal.dataset.overlayClosing === '1') return;
        modal.dataset.overlayClosing = '1';
        deactivateOverlayDialog(modal);
        modal.style.opacity = '0';
        modal.style.pointerEvents = 'none';
        clearDirectStoryRoute();
        document.title = STANDALONE_ROUTE_TITLE || 'Protocol Anthology - Tezos Self-Amendment Story | tezos.systems';
        setTimeout(() => modal.remove(), 300);
    };
    modal._protocolStoryCleanup = ({ restoreFocus = true } = {}) => (
        deactivateOverlayDialog(modal, { restoreFocus })
    );
    const parentProtocolDialog = document.querySelector('#protocol-history-chamber-modal.active .protocol-history-content');
    activateOverlayDialog(modal, {
        close: closeModal,
        dialogSelector: '.protocol-history-story-modal',
        titleId: 'protocol-history-story-title',
        initialFocusSelector: '#history-modal-close',
        // The parent room may quietly reconcile its protocol buttons while the
        // Story fades out. Its dialog is the stable nested return target.
        opener: parentProtocolDialog || opener,
        restoreFocusTarget: () => [...document.querySelectorAll('#protocol-history-chamber-modal.active [data-protocol-open]')]
            .find((button) => button.getAttribute('data-protocol-open') === protocolName) || null,
        restoreFocusSelector: '#header-protocol-chip, #features-gear, #hero-search-input'
    });
    modal.querySelector('#history-modal-close').addEventListener('click', closeModal);
    modal.querySelector('.protocol-story-back')?.addEventListener('click', (event) => {
        event.preventDefault();
        closeModal();
    });
    const storyScroller = modal.querySelector('.protocol-history-story-modal');
    const storyProgressFill = modal.querySelector('.protocol-story-progress-rule i');
    const storyProgressText = modal.querySelector('.protocol-story-reading-progress b');
    const updateStoryProgress = () => {
        if (!storyScroller) return;
        const max = Math.max(1, storyScroller.scrollHeight - storyScroller.clientHeight);
        const percent = Math.max(0, Math.min(100, Math.round((storyScroller.scrollTop / max) * 100)));
        if (storyProgressFill) storyProgressFill.style.transform = `scaleX(${percent / 100})`;
        if (storyProgressText) storyProgressText.textContent = String(percent);
    };
    storyScroller?.addEventListener('scroll', updateStoryProgress, { passive: true });
    updateStoryProgress();
    modal.querySelectorAll('[data-story-section-link]').forEach((link) => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            const target = modal.querySelector(`#${CSS.escape(link.dataset.storySectionLink)}`);
            target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });
    modal.querySelector('#history-modal-print').addEventListener('click', (e) => {
        e.stopPropagation();
        printProtocolHistory(history, protocolName, record);
    });
    const shareStatus = modal.querySelector('#protocol-story-share-status');
    const announceShareStatus = (message) => {
        if (!shareStatus) return;
        shareStatus.textContent = message;
        window.clearTimeout(shareStatus._clearTimer);
        shareStatus._clearTimer = window.setTimeout(() => { shareStatus.textContent = ''; }, 2400);
    };
    const copyStoryLink = async () => {
        const url = protocolStoryUrl(record || protocolName);
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(url);
            } else {
                const textarea = document.createElement('textarea');
                textarea.value = url;
                textarea.setAttribute('readonly', '');
                textarea.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                textarea.remove();
            }
            announceShareStatus('Chapter link copied.');
            return true;
        } catch (error) {
            console.warn('[anthology] copy link failed:', error);
            announceShareStatus('Could not copy the link.');
            return false;
        }
    };
    modal.querySelector('#history-modal-copy-link')?.addEventListener('click', copyStoryLink);
    modal.querySelector('#history-modal-native-share')?.addEventListener('click', async () => {
        const url = protocolStoryUrl(record || protocolName);
        if (typeof navigator.share !== 'function') {
            await copyStoryLink();
            return;
        }
        try {
            await navigator.share({
                title: history.title,
                text: history.subtitle || `${protocolName} in the Tezos Protocol Anthology`,
                url
            });
            announceShareStatus('Share sheet opened.');
        } catch (error) {
            if (error?.name !== 'AbortError') {
                console.warn('[anthology] native share failed:', error);
                await copyStoryLink();
            }
        }
    });
    modal.querySelector('#history-modal-share').addEventListener('click', (e) => {
        e.stopPropagation();
        const btn = e.currentTarget;
        if (btn.getAttribute('aria-busy') === 'true') return;
        btn.setAttribute('aria-busy', 'true');
        if (window.captureProtocolHistory) {
            window.captureProtocolHistory(protocolName).finally(() => {
                btn.removeAttribute('aria-busy');
                btn.focus({ preventScroll: true });
            });
        } else {
            btn.removeAttribute('aria-busy');
        }
    });
    modal.addEventListener('click', (event) => {
        const link = event.target.closest('[data-protocol-story-nav]');
        if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        openProtocolHistoryByName(link.dataset.protocolStoryNav, { replaceRoute: true });
    });
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
}

let protocolHistoryChamberCloseTimer = null;

function ensureProtocolHistoryChamberModal() {
    let overlay = document.getElementById('protocol-history-chamber-modal');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'protocol-history-chamber-modal';
    overlay.className = 'modal-overlay chamber-overlay protocol-history-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
        <div class="modal-content modal-large chamber-content protocol-history-content" role="dialog" aria-modal="true" aria-labelledby="protocol-history-chamber-title" tabindex="-1">
            <button class="modal-close chamber-close" type="button" aria-label="Close Protocol History Chamber" style="z-index:3">&times;</button>
            <div class="chamber-body protocol-history-body">
                <div class="chamber-loading">
                    <div class="chamber-loading-text">Preheating Protocol History</div>
                    <div class="chamber-loading-bar"><div class="chamber-loading-fill"></div></div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('.chamber-close')?.addEventListener('click', closeProtocolHistoryChamber);
    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) closeProtocolHistoryChamber();
    });

    return overlay;
}

function renderProtocolHistoryChamberShell(overlay) {
    const body = overlay?.querySelector('.protocol-history-body');
    if (!body) return;
    body.innerHTML = `
        <div class="chamber-header protocol-history-chamber-header">
            <div class="chamber-title-row">
                <h2 class="chamber-title" id="protocol-history-chamber-title">Protocol Anthology</h2>
            </div>
            <p class="protocol-history-chamber-lede">
                Read Tezos one amendment at a time. Search every adopted chapter, open the governance arguments, and share the exact page you are reading.
            </p>
            <div class="protocol-alphabet-march" id="protocol-alphabet-march" aria-live="polite"></div>
            <div class="protocol-history-chamber-actions">
                <button class="protocol-history-chamber-link protocol-history-chamber-action" type="button" data-anthology-share>Share anthology</button>
                <button class="protocol-history-chamber-link" type="button" data-copy-hash="#protocol-history">Copy anthology link</button>
            </div>
            <div class="protocol-history-anthology-host" id="protocol-history-anthology-board">
                <div class="protocol-anthology-loading">Reading the protocol archive...</div>
            </div>
        </div>
        <details class="protocol-anthology-tools">
            <summary>
                <span><strong>Technical timeline & impact</strong><small>Activation rail, network impacts, and metric-by-metric comparison.</small></span>
                <span aria-hidden="true">⌄</span>
            </summary>
            <div class="protocol-history-chamber-panel protocol-history-feature-panel">
                <div class="upgrade-count">
                    <span class="upgrade-number" id="upgrade-count">--</span>
                    <span class="upgrade-label">Upgrades</span>
                </div>
                <div class="protocol-history-feature-copy">
                    <span class="feature-kicker">Self-amendment archive</span>
                    <p>Use the technical view when you want the complete activation rail or a metric-by-metric impact comparison.</p>
                </div>
                <div class="upgrade-status" id="upgrade-status">
                    <!-- Voting status will be inserted here -->
                </div>
                <div class="upgrade-timeline" id="upgrade-timeline">
                    <div class="chamber-loading">
                        <div class="chamber-loading-text">Reading the protocol timeline</div>
                        <div class="chamber-loading-bar"><div class="chamber-loading-fill"></div></div>
                    </div>
                </div>
            </div>
        </details>
    `;
    wireProtocolHistoryChamberActions(overlay);
}

function revealProtocolHistorySection(section, attempt = 0) {
    const overlay = document.getElementById('protocol-history-chamber-modal');
    if (!overlay) return;
    const tools = overlay.querySelector('.protocol-anthology-tools');
    if (tools) tools.open = true;

    const isTimeline = section === 'timeline';
    const toggle = isTimeline
        ? overlay.querySelector('.protocol-timeline-toggle-btn')
        : overlay.querySelector('.upgrade-effect-toggle-btn');
    const target = isTimeline
        ? overlay.querySelector('#protocol-infographic')
        : overlay.querySelector('#upgrade-effect-panel');

    if (!toggle || !target) {
        if (attempt < 16) {
            window.setTimeout(() => revealProtocolHistorySection(section, attempt + 1), 120);
        }
        return;
    }

    const isExpanded = target.classList.contains('expanded');
    if (!isExpanded) toggle.click();

    window.requestAnimationFrame(() => {
        target.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
    });
}

function wireProtocolHistoryChamberActions(overlay) {
    overlay.querySelectorAll('[data-protocol-history-jump]').forEach((button) => {
        button.addEventListener('click', () => {
            revealProtocolHistorySection(button.dataset.protocolHistoryJump);
        });
    });
    overlay.querySelector('[data-anthology-share]')?.addEventListener('click', async (event) => {
        const button = event.currentTarget;
        const url = new URL('/anthology/', window.location.origin).toString();
        const copy = async () => {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(url);
            } else {
                const textarea = document.createElement('textarea');
                textarea.value = url;
                textarea.setAttribute('readonly', '');
                textarea.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                textarea.remove();
            }
            const original = button.textContent;
            button.textContent = 'Link copied';
            window.setTimeout(() => { button.textContent = original; }, 1400);
        };
        if (typeof navigator.share !== 'function') {
            await copy();
            return;
        }
        try {
            await navigator.share({
                title: 'Protocol Anthology',
                text: 'Read the Tezos self-amendment archive, one adopted protocol at a time.',
                url
            });
        } catch (error) {
            if (error?.name !== 'AbortError') await copy();
        }
    });
}

function closeProtocolHistoryChamber() {
    const overlay = document.getElementById('protocol-history-chamber-modal');
    if (!overlay) return;
    overlay.classList.remove('active');
    deactivateChamberDialog(overlay);
    window.clearTimeout(protocolHistoryChamberCloseTimer);
    protocolHistoryChamberCloseTimer = window.setTimeout(() => overlay.remove(), 220);
}

async function openProtocolHistoryChamber() {
    document.getElementById('tooltip-protocol-history-entry-card')?.classList.remove('is-open');
    const overlay = ensureProtocolHistoryChamberModal();
    window.clearTimeout(protocolHistoryChamberCloseTimer);
    renderProtocolHistoryChamberShell(overlay);
    overlay.classList.add('active');
    activateChamberDialog(overlay, {
        close: closeProtocolHistoryChamber,
        dialogSelector: '.protocol-history-content',
        titleId: 'protocol-history-chamber-title',
        label: 'Protocol Anthology Chamber',
        lockScroll: true
    });
    const cachedProtocols = getKnownProtocols();
    if (cachedProtocols.length) {
        renderProtocolTimeline(cachedProtocols);
        await initProtocolShare();
        return;
    }

    try {
        const protocols = await fetchProtocols();
        saveProtocols(protocols);
        renderProtocolTimeline(protocols);
        await initProtocolShare();
    } catch (error) {
        console.warn('Failed to open Protocol History Chamber:', error);
        const timelineEl = document.getElementById('upgrade-timeline');
        if (timelineEl) {
            timelineEl.innerHTML = `
                <div class="chamber-error">
                    <h3>Protocol timeline unavailable</h3>
                    <p>Cached protocol data was empty and the live fetch failed. Try again after the network settles.</p>
                </div>
            `;
        }
    }
}

window.openProtocolHistoryChamber = openProtocolHistoryChamber;

function positionTooltip(e, tooltipEl) {
    const rect = tooltipEl.getBoundingClientRect();
    let x = e.clientX + 12;
    let y = e.clientY + 16;
    // Keep on screen
    if (x + rect.width > window.innerWidth - 10) x = e.clientX - rect.width - 12;
    if (y + rect.height > window.innerHeight - 10) y = e.clientY - rect.height - 16;
    tooltipEl.style.left = x + 'px';
    tooltipEl.style.top = y + 'px';
}

function initSiteHandoff() {
    const handoff = document.querySelector('[data-site-handoff]');
    if (!handoff) return;
    const currentContext = findCurrentSiteMapContext();
    renderSiteHandoff(handoff, {
        currentEntry: currentContext.entry || findCurrentSiteMapEntry() || findSiteMapEntry('home'),
        currentContext
    });
}

/**
 * Update the Upgrade Clock section
 */
async function updateUpgradeClock() {
    try {
        const protocols = await fetchProtocols();
        
        // Cache protocols for next visit
        saveProtocols(protocols);
        
        // Render timeline
        renderProtocolTimeline(protocols);
        
        // Update days live from the canonical mainnet launch date.
        const daysLiveEl = document.getElementById('days-live');
        if (daysLiveEl) {
            const mainnetLaunch = new Date(MAINNET_LAUNCH);
            const now = new Date();
            const daysLive = Math.floor((now - mainnetLaunch) / (1000 * 60 * 60 * 24));
            daysLiveEl.textContent = daysLive.toLocaleString();
            const aboutDays = document.getElementById('about-days');
            if (aboutDays) aboutDays.textContent = daysLive.toLocaleString();
        }
        
        const statusEl = document.getElementById('upgrade-status');
        if (statusEl) {
            statusEl.classList.remove('active');
            statusEl.innerHTML = '';
        }
        
        debugLog('Upgrade clock updated');
    } catch (error) {
        console.error('Failed to update upgrade clock:', error);
    }
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

const GITHUB_MAIN_COMMIT_URL = 'https://api.github.com/repos/Primate411/tezos.systems/commits/main';

async function fetchBuildMetadata({ signal } = {}) {
    try {
        const response = await fetch('/version.json', { cache: 'no-store', signal });
        return response.ok ? response.json() : null;
    } catch (_) {
        return null;
    }
}

function releaseUpdateMetadata(version) {
    const latestChange = typeof version?.latestChange === 'string'
        ? version.latestChange.replace(/\s+/g, ' ').trim().slice(0, 280)
        : '';
    const metaParts = [];
    if (Number.isInteger(version?.build)) metaParts.push(`Build ${version.build}`);
    if (/^\d{4}-\d{2}-\d{2}$/.test(version?.date || '')) metaParts.push(version.date);
    return {
        detail: latestChange
            ? `Latest: ${latestChange}`
            : 'Latest: Tezos Systems fixes and features.',
        meta: metaParts.join(' · ') || 'Build ready'
    };
}

async function fetchReleaseUpdateMetadata() {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 1500);
    try {
        return releaseUpdateMetadata(await fetchBuildMetadata({ signal: controller.signal }));
    } finally {
        window.clearTimeout(timeout);
    }
}

async function fetchLatestMainCommit() {
    try {
        const response = await fetch(GITHUB_MAIN_COMMIT_URL, {
            cache: 'no-store',
            headers: { 'Accept': 'application/vnd.github+json' }
        });
        if (!response.ok) return null;
        const data = await response.json();
        return {
            sha: data?.sha || '',
            date: data?.commit?.committer?.date || '',
            url: data?.html_url || ''
        };
    } catch (_) {
        return null;
    }
}

function shortSha(sha) {
    return sha ? sha.slice(0, 7) : '';
}

// Footer sanity check. `version.json` is served metadata; GitHub gives the exact
// latest main commit because a committed file cannot contain its own final SHA.
async function renderBuildVersion() {
    const el = document.getElementById('build-version');
    if (!el) return;

    const [version, latest] = await Promise.all([
        fetchBuildMetadata(),
        fetchLatestMainCommit()
    ]);

    const parts = [];
    if (version?.build) parts.push(`build ${version.build}`);
    parts.push(latest?.sha ? `latest ${shortSha(latest.sha)}` : 'latest unavailable');
    if (version?.commit) parts.push(`stamp ${version.commit}`);
    if (version?.date) parts.push(version.date);

    if (!parts.length) return;

    el.textContent = parts.join(' · ');
    const titleParts = [];
    if (latest?.sha) titleParts.push(`Latest main commit: ${latest.sha}`);
    else titleParts.push('Latest main commit unavailable');
    if (version?.commit) titleParts.push(`Stamped parent commit: ${version.commit}`);
    if (latest?.date) titleParts.push(`Latest commit date: ${new Date(latest.date).toISOString().slice(0, 10)}`);
    el.title = titleParts.join(' · ');
}

// Start this only after the GitHub endpoint constant above is initialized. The
// footer shell itself is rendered synchronously by init before this point.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderBuildVersion);
} else {
    renderBuildVersion();
}

// Collapsible sections — works on ALL section types
function initCollapsibleSections() {
    document.querySelectorAll('.section-header').forEach(header => {
        const title = header.querySelector('.section-title');
        if (!title) return;

        // Find the parent section (works for .stats-section, .my-baker-section, etc.)
        const section = header.closest('section');
        if (!section) return;
        if (section.hasAttribute('data-home-block')) return;

        // Find collapsible content: first sibling container after the header
        // For stats-section: .stats-grid or .stats-grid-2 or .comparison-grid
        // For my-baker-section: .my-baker-section-inner children after header
        // Generic: everything in the section after the .section-header
        const sectionId = section.id || '';
        const storageKey = sectionId ? `tezos-systems-collapsed-${sectionId}` : null;
        const dedicatedToggle = header.querySelector('[data-section-collapse]');
        const sectionLabel = header.querySelector('.feature-kicker')?.textContent?.trim()
            || title.textContent.trim()
            || 'section';

        title.style.cursor = 'pointer';
        title.style.userSelect = 'none';

        // New feature headers provide a real button. Legacy section headers
        // retain their inline chevron while gaining keyboard semantics.
        let chevron = dedicatedToggle?.querySelector('.section-chevron');
        if (!chevron) {
            chevron = document.createElement('span');
            chevron.className = 'section-chevron';
            chevron.textContent = '▾';
            chevron.style.cssText = 'margin-left: 8px; font-size: 0.7em; opacity: 0.5; transition: transform 0.3s ease, opacity 0.3s ease; display: inline-block;';
            title.appendChild(chevron);
            title.setAttribute('role', 'button');
            title.setAttribute('tabindex', '0');
        }

        function updateToggleSemantics(isCollapsed) {
            const expanded = !isCollapsed;
            if (dedicatedToggle) {
                dedicatedToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
                dedicatedToggle.setAttribute('aria-label', `${expanded ? 'Collapse' : 'Expand'} ${sectionLabel}`);
            } else {
                title.setAttribute('aria-expanded', expanded ? 'true' : 'false');
            }
        }

        // Gather all collapsible siblings (everything after the section-header)
        function getCollapsibleElements() {
            const parent = header.parentElement;
            const siblings = [];
            let found = false;
            for (const child of parent.children) {
                if (child === header) { found = true; continue; }
                if (found) siblings.push(child);
            }
            return siblings;
        }

        function collapse() {
            section.classList.add('collapsed');
            header.style.marginBottom = '0';
            getCollapsibleElements().forEach(el => {
                el.style.maxHeight = el.scrollHeight + 'px';
                el.offsetHeight; // force reflow
                el.style.maxHeight = '0';
                el.style.overflow = 'hidden';
                el.style.opacity = '0';
                el.style.margin = '0';
                el.style.padding = '0';
                el.style.transition = 'max-height 0.3s ease, opacity 0.3s ease, margin 0.3s ease, padding 0.3s ease';
            });
            chevron.style.transform = 'rotate(-90deg)';
            chevron.style.opacity = '0.7';
            updateToggleSemantics(true);
            if (storageKey) localStorage.setItem(storageKey, '1');
        }

        function expand() {
            section.classList.remove('collapsed');
            header.style.marginBottom = '';
            getCollapsibleElements().forEach(el => {
                el.style.margin = '';
                el.style.padding = '';
                el.style.maxHeight = el.scrollHeight + 'px';
                el.style.opacity = '1';
                el.style.transition = 'max-height 0.3s ease, opacity 0.3s ease, margin 0.3s ease, padding 0.3s ease';
                setTimeout(() => { el.style.maxHeight = ''; el.style.overflow = ''; }, 300);
            });
            chevron.style.transform = 'rotate(0deg)';
            chevron.style.opacity = '0.5';
            updateToggleSemantics(false);
            if (storageKey) localStorage.removeItem(storageKey);
        }

        title.addEventListener('mouseenter', () => { chevron.style.opacity = '1'; });
        title.addEventListener('mouseleave', () => { chevron.style.opacity = section.classList.contains('collapsed') ? '0.7' : '0.5'; });

        title.addEventListener('click', (e) => {
            if (section.classList.contains('collapsed')) {
                expand();
            } else {
                collapse();
            }
        });
        title.addEventListener('keydown', (event) => {
            if (dedicatedToggle || !['Enter', ' '].includes(event.key)) return;
            event.preventDefault();
            title.click();
        });
        dedicatedToggle?.addEventListener('click', (event) => {
            event.preventDefault();
            if (section.classList.contains('collapsed')) expand();
            else collapse();
        });

        // Restore saved state
        if (storageKey && localStorage.getItem(storageKey) === '1') {
            // Instant collapse (no animation)
            section.classList.add('collapsed');
            header.style.marginBottom = '0';
            getCollapsibleElements().forEach(el => {
                el.style.maxHeight = '0';
                el.style.overflow = 'hidden';
                el.style.opacity = '0';
                el.style.margin = '0';
                el.style.padding = '0';
            });
            chevron.style.transform = 'rotate(-90deg)';
            chevron.style.opacity = '0.7';
            updateToggleSemantics(true);
        } else {
            updateToggleSemantics(false);
        }
    });
}

// ==========================================
// SMART DOCK — Overflow + Bottom Sheet
// ==========================================
function initCornerGiftTray() {
    const tray = document.getElementById('corner-gift-tray');
    const toggle = document.getElementById('corner-gift-toggle');
    if (!tray || !toggle) return;

    const setOpen = (open) => {
        tray.classList.toggle('open', open);
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    };

    tray.addEventListener('pointerenter', (e) => {
        if (e.pointerType !== 'touch') setOpen(true);
    });
    tray.addEventListener('pointerleave', (e) => {
        if (e.pointerType === 'touch') return;
        if (!tray.contains(document.activeElement)) setOpen(false);
    });

    tray.addEventListener('focusin', () => setOpen(true));
    tray.addEventListener('focusout', () => {
        setTimeout(() => {
            if (!tray.contains(document.activeElement)) setOpen(false);
        }, 0);
    });

    toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.matchMedia?.('(hover: hover)').matches) {
            setOpen(true);
            return;
        }
        const shouldOpen = !tray.classList.contains('open');
        setOpen(shouldOpen);
        if (!shouldOpen) toggle.blur();
    });

    document.addEventListener('click', (e) => {
        if (!tray.contains(e.target)) setOpen(false);
    });

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        setOpen(false);
        if (tray.contains(document.activeElement)) toggle.focus();
    });
}

function initSmartDock() {
    const closeDropdown = (dropdown, { restoreFocus = false } = {}) => {
        if (!dropdown) return;
        dropdown.classList.remove('open');
        const owner = document.querySelector(`[aria-controls="${dropdown.id}"]`);
        if (owner) {
            owner.setAttribute('aria-expanded', 'false');
            if (restoreFocus) owner.focus();
        }
    };

    // Generic dropdown setup
    function setupDropdown(gearId, dropdownId, onOpen) {
        const g = document.getElementById(gearId);
        const d = document.getElementById(dropdownId);
        if (!g || !d) return;
        g.setAttribute('aria-expanded', 'false');
        g.setAttribute('aria-controls', dropdownId);
        g.addEventListener('click', (e) => {
            e.stopPropagation();
            // Close other dropdowns first
            document.querySelectorAll('.settings-dropdown.open').forEach(el => {
                if (el !== d) closeDropdown(el);
            });
            d.classList.toggle('open');
            const isOpen = d.classList.contains('open');
            g.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            if (isOpen && typeof onOpen === 'function') onOpen();
        });
        d.addEventListener('click', (e) => e.stopPropagation());
    }

    const featureLauncher = document.getElementById('features-dropdown');
    const revealActiveExploreGroups = () => {
        featureLauncher?.querySelectorAll('details.feature-launcher-disclosure').forEach((group) => {
            if (group.querySelector('.feature-toggle.active')) group.open = true;
        });
    };

    setupDropdown('features-gear', 'features-dropdown', () => {
        revealActiveExploreGroups();
        countExploreEvent('explore/open');
    });
    setupDropdown('settings-gear', 'settings-dropdown');

    if (featureLauncher && featureLauncher.dataset.analyticsReady !== 'true') {
        featureLauncher.dataset.analyticsReady = 'true';
        featureLauncher.addEventListener('click', (event) => {
            const item = event.target.closest('.feature-launcher-item');
            if (!item || !featureLauncher.contains(item) || !item.id) return;
            countExploreEvent(`explore/${item.id}`);
        });
        featureLauncher.querySelector('[data-dropdown-close]')?.addEventListener('click', (event) => {
            event.preventDefault();
            closeDropdown(featureLauncher, { restoreFocus: true });
        });
    }

    // Close all dropdowns on outside click
    document.addEventListener('click', () => {
        document.querySelectorAll('.settings-dropdown.open').forEach(el => {
            closeDropdown(el);
        });
    });

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        document.querySelectorAll('.settings-dropdown.open').forEach(el => {
            closeDropdown(el, { restoreFocus: true });
        });
    });
}

function initDeepLinkAffordances() {
    const copyFeedbackStates = new WeakMap();
    const headerLinks = [
        { selector: '#leaderboard-section .section-header', hash: '#leaderboard', label: 'leaderboard' },
        { selector: '#comparison-section .section-header', hash: '#compare', label: 'chain comparison' },
        { selector: '#whale-section .section-header', hash: '#whales', label: 'whale feed' },
        { selector: '#giants-section .section-header', hash: '#giants', label: 'sleeping giants' },
        { selector: '#calculator-section .section-header', hash: '#calculator', label: 'rewards calculator' },
        { selector: '#price-intelligence .section-header', hash: '#price', label: 'price intelligence' },
        { selector: '#widgets-gallery .section-header', hash: '#widgets', label: 'embed builder' },
        { selector: '#consensus-section .section-header', hash: '#section=consensus', label: 'consensus stats' },
        { selector: '#economy-section .section-header', hash: '#section=economy', label: 'economy stats' },
        { selector: '#governance-section .section-header', hash: '#section=governance', label: 'governance stats' },
        { selector: '#network-activity-section .section-header', hash: '#section=network', label: 'network stats' },
        { selector: '#ecosystem-section .section-header', hash: '#section=ecosystem', label: 'ecosystem stats' },
    ];

    function makeUrl(hash) {
        return new URL(siteMapCanonicalRoute(hash), window.location.origin).toString();
    }

    function markCopied(button) {
        const priorState = copyFeedbackStates.get(button);
        if (priorState) {
            clearTimeout(priorState.timer);
            button.innerHTML = priorState.html;
            if (priorState.ariaLabel === null) button.removeAttribute('aria-label');
            else button.setAttribute('aria-label', priorState.ariaLabel);
            if (priorState.title === null) button.removeAttribute('title');
            else button.setAttribute('title', priorState.title);
        }

        const state = {
            html: button.innerHTML,
            ariaLabel: button.getAttribute('aria-label'),
            title: button.getAttribute('title'),
            timer: null
        };
        button.classList.add('copied');
        button.textContent = '✓';
        button.setAttribute('aria-label', `${state.ariaLabel || 'Direct link'} copied`);
        button.setAttribute('title', 'Copied');
        state.timer = setTimeout(() => {
            button.classList.remove('copied');
            button.innerHTML = state.html;
            if (state.ariaLabel === null) button.removeAttribute('aria-label');
            else button.setAttribute('aria-label', state.ariaLabel);
            if (state.title === null) button.removeAttribute('title');
            else button.setAttribute('title', state.title);
            copyFeedbackStates.delete(button);
        }, 1200);
        copyFeedbackStates.set(button, state);
    }

    async function copyHash(hash, button) {
        const url = makeUrl(hash);
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(url);
            } else {
                const textarea = document.createElement('textarea');
                textarea.value = url;
                textarea.setAttribute('readonly', '');
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                textarea.remove();
            }
            if (button) markCopied(button);
        } catch (error) {
            console.warn('[deep-link] copy failed:', error);
        }
    }

    function attachHeaderButtons() {
        headerLinks.forEach(({ selector, hash, label }) => {
            const header = document.querySelector(selector);
            if (!header || header.querySelector(`.section-copy-link[data-copy-hash="${hash}"]`)) return;
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'section-copy-link';
            button.dataset.copyHash = hash;
            button.setAttribute('aria-label', `Copy ${label} link`);
            button.title = `Copy ${label} link`;
            button.textContent = '🔗';
            (header.querySelector('[data-section-actions]') || header).appendChild(button);
        });
    }

    document.addEventListener('click', (event) => {
        const button = event.target.closest('[data-copy-hash]');
        if (!button) return;
        event.preventDefault();
        event.stopPropagation();
        copyHash(button.dataset.copyHash, button);
    }, true);

    attachHeaderButtons();
    const observer = new MutationObserver(() => attachHeaderButtons());
    observer.observe(document.body, { childList: true, subtree: true });
}

// ==========================================
// PULSE INDICATORS — Activity dots on toggle buttons
// ==========================================
function initPulseIndicators() {
    function checkPulse() {
        const whaleBtn = document.getElementById('whale-toggle');
        const now = Date.now();
        const FIVE_MIN = 5 * 60 * 1000;
        const ONE_DAY = 24 * 60 * 60 * 1000;

        if (!whaleBtn) return;
        const latestOperation = window.whaleTracker?.transactions?.[0];
        const latestAwakening = window.sleepingGiantsData?.awakenings?.[0];
        const operationIsFresh = latestOperation
            ? now - new Date(latestOperation.timestamp).getTime() < FIVE_MIN
            : false;
        const awakeningIsFresh = latestAwakening
            ? now - new Date(latestAwakening.awakenedAt).getTime() < ONE_DAY
            : false;
        whaleBtn.classList.toggle('has-pulse', operationIsFresh || awakeningIsFresh);
    }

    // Check every 30 seconds
    checkPulse();
    setInterval(checkPulse, 30000);
}

// Expose refresh function globally
window.TezosStats = { refresh };

// ==========================================
// SERVICE WORKER REGISTRATION
// ==========================================
const SERVICE_WORKER_UPDATE_CHECK_MS = 60 * 60 * 1000;
const SERVICE_WORKER_UPDATE_DEFER_MS = 30 * 60 * 1000;
const SERVICE_WORKER_ACTIVATION_FALLBACK_MS = 8000;
const SERVICE_WORKER_UPDATE_DEFER_KEY = 'tezos-systems-release-update-deferred-until-v1';
let releaseUpdateUiPromise = null;

function readReleaseUpdateDeferredUntil() {
    try {
        const value = Number(sessionStorage.getItem(SERVICE_WORKER_UPDATE_DEFER_KEY));
        if (Number.isFinite(value) && value > Date.now()) return value;
        sessionStorage.removeItem(SERVICE_WORKER_UPDATE_DEFER_KEY);
    } catch (_) {
        // Storage can be unavailable in privacy-restricted contexts.
    }
    return 0;
}

function writeReleaseUpdateDeferredUntil(value) {
    try {
        sessionStorage.setItem(SERVICE_WORKER_UPDATE_DEFER_KEY, String(value));
    } catch (_) {
        // The in-memory deadline still applies for this document.
    }
}

function loadReleaseUpdateUi() {
    if (!releaseUpdateUiPromise) releaseUpdateUiPromise = import('../ui/release-update.js');
    return releaseUpdateUiPromise;
}

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        let reloadRequested = false;
        let reloading = false;
        let controlledAtRegistration = Boolean(navigator.serviceWorker.controller);
        let deferredUntil = readReleaseUpdateDeferredUntil();
        let deferredTimer = 0;
        let activationFallbackTimer = 0;

        const clearDeferredTimer = () => {
            if (!deferredTimer) return;
            window.clearTimeout(deferredTimer);
            deferredTimer = 0;
        };

        const scheduleResurface = (callback) => {
            clearDeferredTimer();
            const delay = Math.max(0, deferredUntil - Date.now());
            deferredTimer = window.setTimeout(() => {
                deferredTimer = 0;
                if (document.visibilityState === 'visible') callback();
            }, delay);
        };

        const deferPrompt = (resurface) => {
            deferredUntil = Date.now() + SERVICE_WORKER_UPDATE_DEFER_MS;
            writeReleaseUpdateDeferredUntil(deferredUntil);
            scheduleResurface(resurface);
        };

        const reloadThisTab = () => {
            reloadRequested = true;
            window.location.reload();
        };

        const showAppliedElsewherePrompt = async () => {
            const [ui, release] = await Promise.all([
                loadReleaseUpdateUi(),
                fetchReleaseUpdateMetadata()
            ]);
            const resurface = () => showAppliedElsewherePrompt();
            ui.showReleaseUpdateDock({
                state: 'reload',
                title: 'Update applied in another tab',
                detail: release.detail,
                meta: release.meta,
                actionLabel: 'Reload this tab',
                pendingLabel: 'Reloading…',
                pillLabel: 'Reload transmission',
                expanded: false,
                onAction: reloadThisTab,
                onLater: () => deferPrompt(resurface)
            });
        };

        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (activationFallbackTimer) {
                window.clearTimeout(activationFallbackTimer);
                activationFallbackTimer = 0;
            }
            if (reloadRequested && !reloading) {
                reloading = true;
                window.location.reload();
                return;
            }
            if (!controlledAtRegistration) {
                controlledAtRegistration = true;
                return;
            }
            showAppliedElsewherePrompt();
        });

        const showUpdatePrompt = async (reg) => {
            if (!reg.waiting || !navigator.serviceWorker.controller) return;
            const [ui, release] = await Promise.all([
                loadReleaseUpdateUi(),
                fetchReleaseUpdateMetadata()
            ]);
            if (!reg.waiting || !navigator.serviceWorker.controller) return;

            const resurface = () => showUpdatePrompt(reg);
            const showReloadFallback = () => {
                ui.setReleaseUpdateDockState({
                    state: 'reload',
                    title: 'Update ready to finish',
                    detail: release.detail,
                    meta: release.meta,
                    actionLabel: 'Reload now',
                    pendingLabel: 'Reloading…',
                    pillLabel: 'Reload transmission',
                    onAction: reloadThisTab,
                    onLater: () => {
                        reloadRequested = false;
                        deferPrompt(resurface);
                    }
                });
            };

            ui.showReleaseUpdateDock({
                state: 'ready',
                title: 'Update ready',
                detail: release.detail,
                meta: release.meta,
                actionLabel: 'Update & reload',
                pendingLabel: 'Updating…',
                pillLabel: 'Update transmission',
                expanded: false,
                onLater: () => deferPrompt(resurface),
                onAction() {
                    const waiting = reg.waiting;
                    if (!waiting) {
                        reloadThisTab();
                        return;
                    }
                    reloadRequested = true;
                    waiting.postMessage({ type: 'SKIP_WAITING' });
                    if (activationFallbackTimer) window.clearTimeout(activationFallbackTimer);
                    activationFallbackTimer = window.setTimeout(() => {
                        activationFallbackTimer = 0;
                        if (!reloading) showReloadFallback();
                    }, SERVICE_WORKER_ACTIVATION_FALLBACK_MS);
                }
            });
        };

        navigator.serviceWorker.register('/sw.js').then((reg) => {
            debugLog('📦 Service Worker registered, scope:', reg.scope);
            showUpdatePrompt(reg);
            reg.addEventListener('updatefound', () => {
                const worker = reg.installing;
                worker?.addEventListener('statechange', () => {
                    if (worker.state === 'installed') showUpdatePrompt(reg);
                });
            });

            let lastUpdateCheck = 0;
            const checkForUpdate = () => {
                if (document.visibilityState !== 'visible') return;
                if (reg.waiting) showUpdatePrompt(reg);
                if (Date.now() - lastUpdateCheck < SERVICE_WORKER_UPDATE_CHECK_MS) return;
                lastUpdateCheck = Date.now();
                reg.update().catch(() => {});
            };
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') checkForUpdate();
            });
            window.setInterval(checkForUpdate, SERVICE_WORKER_UPDATE_CHECK_MS);
            checkForUpdate();
        }).catch((err) => {
            console.warn('SW registration failed:', err);
        });
    }
}

// ==========================================
// OFFLINE INDICATOR
// ==========================================
function initOfflineIndicator() {
    let banner = null;

    function show() {
        if (banner) return;
        banner = document.createElement('div');
        banner.className = 'offline-banner';
        banner.textContent = '📡 Offline — live network data unavailable';
        document.body.prepend(banner);
    }

    function hide() {
        if (!banner) return;
        banner.classList.add('hidden');
        setTimeout(() => { banner?.remove(); banner = null; }, 300);
    }

    window.addEventListener('online', hide);
    window.addEventListener('offline', show);
    if (!navigator.onLine) show();
}

// ==========================================
// URL DEEP-LINKING
// ==========================================
// Supported hash fragments:
//   #my-baker=tz1...   → open My Baker with address
//   #my-baker=name.tez → resolve Tezos Domain and open My Tezos
//   #baker=tz1...      → open Baker profile modal
//   #calculator        → open Rewards Calculator
//   #compare           → show comparison section
//   #leaderboard       → open Baker Directory Chamber
//   #whales            → open Whale Watch Chamber
//   #giants            → open Whale Watch Deep Sleep
//   #history           → open Cycle History Chamber
//   #chamber           → open Tezos L1 Governance modal
//   #pulse             -> open Network Pulse Chamber
//   #capital           -> open Capital Chamber
//   #minerals          -> open Critical Minerals Chamber (#critical-minerals and #strategic-minerals are aliases)
//   #uranium           -> open Uranium Chamber (#xu3o8, #u3o8, and #uranium-market are aliases)
//   #metals            -> open Precious Metals Chamber (#precious-metals and #metals-market are aliases)
//   #ecosystem         -> open Ecosystem Activity Chamber
//   #staking           -> open Staking Chamber
//   #tezosx           -> open Tezos X Chamber
//   #tezlink          -> legacy alias for Tezos X Chamber
//   #l2chamber         -> open Tezos X Governance Chamber
//   #health            → open Network Health Chamber
//   #lb                → open Liquidity Baking monitor
//   #lb-tile           → scroll to the Liquidity Baking dashboard tile
//   #tz4               → open tz4 Adoption Chamber
//   #ctez              → open ctez Oven Guide
//   #maxis             → open Tezos Maxis Chamber
//   #tezoscrp          → open TezosCRP Recognition Hall
//   #protocol-history  → open Protocol History Chamber
//   #protocol=Ushuaia  → open protocol lore/history
//   #theme=dark        → switch to theme
//   #section=consensus → scroll to section
// Pretty chamber routes:
//   /chambers/         → reveal the complete Explore Tezos topic directory
//   /my/               → open My Tezos without requiring an address
//   /chamber/          → open Tezos L1 Governance modal without hash redirect
//   /pulse/            -> open Network Pulse Chamber
//   /capital/          -> open Capital Chamber
//   /minerals/         -> open Critical Minerals Chamber
//   /uranium/          -> open Uranium Chamber
//   /metals/           -> open Precious Metals Chamber
//   /ecosystem/        -> open Ecosystem Activity Chamber
//   /whales/           -> open Whale Watch Chamber
//   /stake/            -> open Staking Chamber
//   /leaderboard/      -> open Baker Directory Chamber
//   /history/          -> open Cycle History Chamber
//   /anthology/        → open Protocol History Chamber
//   /health/           → open Network Health Chamber
//   /tezosx/           → open Tezos X Chamber
//   /l2chamber/        → open Tezos X Governance Chamber
//   /tz4/ /lb/ /domains/ /ledger-flow/ /ctez/ /maxis/ /tezoscrp/ → open their chamber rooms
// Account path shortcuts:
//   /tz1...            → open My Tezos with address
//   /name.tez          → resolve Tezos Domain and open My Tezos
function getPrettyChamberPathRoute() {
    const slug = window.location.pathname.replace(/^\/+|\/+$/g, '');
    if (!slug) return null;
    if (/^anthology\/[^/]+$/i.test(slug)) return 'protocol-history';
    if (slug.includes('/')) return null;
    const entry = findCurrentSiteMapEntry({
        pathname: window.location.pathname,
        search: window.location.search,
        hash: ''
    });
    return entry?.hash ? entry.hash.replace(/^#/, '') : null;
}

function isTezosAccountAddress(value) {
    return /^(tz[1-4]|KT1)[a-zA-Z0-9]{33}$/.test(String(value || '').trim());
}

function isTezDomainName(value) {
    const domain = String(value || '').trim();
    return domain.length <= 253 && /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+tez$/i.test(domain);
}

function decodeRouteTarget(value) {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

function getMyTezosPathTarget() {
    const pathTarget = window.location.pathname.replace(/^\/+|\/+$/g, '');
    if (!pathTarget || pathTarget.includes('/')) return null;
    const target = decodeRouteTarget(pathTarget).trim();
    if (isTezosAccountAddress(target) || isTezDomainName(target)) return target;
    return null;
}

async function resolveForwardTezDomain(name) {
    try {
        const resp = await fetch('https://api.tezos.domains/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: `query ResolveDomain($name: String!) { domain(name: $name) { address owner } }`,
                variables: { name }
            })
        });
        if (!resp.ok) return null;
        const data = await resp.json();
        const domain = data?.data?.domain || {};
        return [domain.address, domain.owner].find(isTezosAccountAddress) || null;
    } catch {
        return null;
    }
}

async function resolveMyTezosTarget(rawTarget) {
    const target = String(rawTarget || '').trim();
    if (!target) return { address: '', label: '' };
    if (isTezosAccountAddress(target)) return { address: target, label: target };
    if (isTezDomainName(target)) {
        const domain = target.toLowerCase();
        const address = await resolveForwardTezDomain(domain);
        return { address: address || '', label: domain };
    }
    return { address: '', label: target };
}

function setMyTezosDrawerOpen(address) {
    const drawer = document.getElementById('my-tezos-drawer');
    const scrim = document.getElementById('my-tezos-drawer-scrim');
    if (drawer && scrim) {
        drawer.classList.add('open');
        scrim.classList.add('open');
        document.body.style.overflow = 'hidden';
    }
    const emptyState = document.getElementById('drawer-empty-state');
    const connectedState = document.getElementById('drawer-connected');
    if (emptyState) emptyState.style.display = address ? 'none' : '';
    if (connectedState) connectedState.style.display = address ? '' : 'none';
}

function renderMyTezosDirectLinkError(label) {
    setMyTezosDrawerOpen(true);
    const input = document.getElementById('my-baker-input');
    const results = document.getElementById('my-baker-results');
    const errorMsg = document.getElementById('my-baker-error-msg');
    if (input) input.value = label;
    if (results) results.innerHTML = '';
    if (errorMsg) errorMsg.textContent = `Could not resolve "${label}". Domain not found.`;
}

async function openMyTezosTarget(rawTarget) {
    const label = String(rawTarget || '').trim();
    if (!label) {
        setMyTezosDrawerOpen(localStorage.getItem('tezos-systems-my-baker-address'));
        return;
    }

    window.dispatchEvent(new CustomEvent('my-tezos-view-request', { detail: { view: 'overview' } }));

    const input = document.getElementById('my-baker-input');
    const errorMsg = document.getElementById('my-baker-error-msg');
    if (input) input.value = label;
    if (errorMsg && isTezDomainName(label)) errorMsg.textContent = 'Resolving domain...';

    const resolved = await resolveMyTezosTarget(label);
    if (!resolved.address) {
        renderMyTezosDirectLinkError(resolved.label || label);
        return;
    }

    localStorage.setItem('tezos-systems-my-baker-address', resolved.address);
    setMyTezosDrawerOpen(resolved.address);

    setTimeout(() => {
        const currentInput = document.getElementById('my-baker-input');
        const saveBtn = document.getElementById('my-baker-save');
        if (currentInput) currentInput.value = resolved.address;
        if (errorMsg) errorMsg.textContent = '';
        if (saveBtn && !(saveBtn.dataset.mode === 'copy' && saveBtn.dataset.copyAddress === resolved.address)) {
            saveBtn.click();
        } else {
            refreshMyBaker();
            refreshMyTezos();
            window.dispatchEvent(new CustomEvent('my-baker-updated', { detail: { address: resolved.address } }));
        }
    }, 100);
}

function applyDeepLink() {
    const hash = window.location.hash.slice(1);
    const params = new URLSearchParams(hash);
    const currentEntry = findCurrentSiteMapEntry();
    const isSearchRoute = hash === 'search' || params.has('search');
    revealChamberCategoryForEntry(currentEntry, {
        savePreference: !document.documentElement.hasAttribute('data-chamber-route')
    });

    if (!isSearchRoute && _searchRouteFocusTimer !== null) {
        window.clearTimeout(_searchRouteFocusTimer);
        _searchRouteFocusTimer = null;
    }

    setPageTitleRoute(
        STANDALONE_ROUTE_TITLE || (
            currentEntry?.id && currentEntry.id !== 'home'
                ? `${currentEntry.title} | tezos.systems`
                : ''
        ),
        ROOT_DASHBOARD_TITLE || undefined
    );

    const showToggleSection = (toggleId, sectionId, options = {}) => {
        const toggle = document.getElementById(toggleId);
        const section = document.getElementById(sectionId);
        const isVisible = section && (
            section.classList.contains('visible') ||
            (section.style.display !== 'none' && getComputedStyle(section).display !== 'none')
        );
        if (toggle && !isVisible) toggle.click();
        setTimeout(() => {
            const target = document.getElementById(sectionId);
            if (target && options.scroll !== false) {
                target.scrollIntoView({ behavior: 'smooth', block: options.block || 'start' });
            }
        }, options.delay || 300);
    };

    const revealStaticSection = (sectionId, options = {}) => {
        const section = document.getElementById(sectionId);
        if (section) section.classList.add('visible');
        setTimeout(() => {
            const target = document.getElementById(sectionId);
            if (target && options.scroll !== false) {
                target.scrollIntoView({ behavior: 'smooth', block: options.block || 'start' });
            }
        }, options.delay || 300);
    };

    const ensureStatsVisible = () => {
        const sections = Array.from(document.querySelectorAll('.tezos-stats-section'));
        const anyHidden = sections.some((section) => getComputedStyle(section).display === 'none');
        if (!anyHidden) return;

        const toggle = document.getElementById('tezos-stats-toggle');
        if (toggle?.dataset.openChamber === 'network-pulse') {
            localStorage.setItem(STATS_VISIBLE_KEY, 'true');
            sections.forEach((section) => { section.style.display = ''; });
            toggle.title = 'Network Pulse Chamber: Open';
            if (!statsDataLoaded) {
                statsDataLoaded = true;
                fetchAllStats()
                    .then(async (newStats) => {
                        saveStats(newStats);
                        await updateStats(newStats);
                        state.lastUpdate = statsObservationDate(newStats);
                        updateLastRefreshTime();
                    })
                    .catch((error) => {
                        console.warn('Stats fetch failed for section deep link:', error);
                        statsDataLoaded = false;
                    });
            }
            refreshNetworkHealth({ force: true });
            return;
        }
        if (toggle && localStorage.getItem(STATS_VISIBLE_KEY) !== 'true') {
            toggle.click();
            return;
        }

        localStorage.setItem(STATS_VISIBLE_KEY, 'true');
        sections.forEach((section) => { section.style.display = ''; });
        setLauncherToggleState(toggle, true);
        if (toggle) toggle.title = 'Network Pulse: Showing';
    };

    const ensureChambersVisible = () => {
        setHomeBlockVisible('explore', true, 'deep-link');
    };

    const scrollToElement = (target, options = {}) => {
        if (!target) return;
        const reduceMotion = typeof window.matchMedia === 'function'
            && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const scroll = () => target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: options.block || 'center' });
        scroll();
        setTimeout(scroll, 180);
        setTimeout(scroll, 520);
        target.classList.add('deep-link-highlight');
        setTimeout(() => target.classList.remove('deep-link-highlight'), options.highlightMs || 1800);
    };

    const isElementInViewport = (target) => {
        if (!target) return false;
        const rect = target.getBoundingClientRect();
        return rect.bottom > 0 && rect.top < window.innerHeight;
    };

    const scrollToElementAfterLayout = (getTarget, options = {}) => {
        const delays = [0, 700, 1600, 3000, 4500];
        delays.forEach((delay, index) => {
            setTimeout(() => {
                const target = getTarget();
                if (!target) return;
                if (index === 0 || !isElementInViewport(target)) {
                    scrollToElement(target, options);
                }
            }, delay);
        });
    };

    const closeHashModalSurfaces = async () => {
        _chamberOpenEpoch += 1;
        setMyTezosDrawerOpenState?.(false, { restoreFocus: false });
        const protocolStory = document.getElementById('protocol-history-modal');
        protocolStory?._protocolStoryCleanup?.({ restoreFocus: false });
        protocolStory?.remove();
        const protocolHistoryChamber = document.getElementById('protocol-history-chamber-modal');
        if (protocolHistoryChamber) {
            protocolHistoryChamber.classList.remove('active');
            deactivateChamberDialog(protocolHistoryChamber);
            protocolHistoryChamber.remove();
        }

        const closeTasks = [
            closeLoadedChamberFeatures(),
            Promise.resolve().then(() => closeNetworkHealthChamber?.()),
            Promise.resolve().then(() => closeCycleHistoryChamber?.({ preserveRoute: true }))
        ];
        if (document.getElementById('native-explorer-overlay')) {
            closeTasks.push(import('../features/native-explorer.js').then((module) => module.closeNativeExplorer?.()));
        }
        await Promise.allSettled(closeTasks);

        reconcileOverlayEnvironment();
    };

    const openHashModal = (open, label, afterOpen) => {
        _routedOverlayTransitionDepth += 1;
        closeHashModalSurfaces()
            .finally(() => {
                _routedOverlayTransitionDepth = Math.max(0, _routedOverlayTransitionDepth - 1);
            })
            .then(open)
            .then(() => {
                if (typeof afterOpen === 'function') afterOpen();
            })
            .catch((error) => {
                if (!isChamberOpenCancelled(error)) console.warn(label, error);
            });
    };

    const openPrettyChamberRoute = (route) => {
        switch (route) {
            case 'my-tezos':
                openMyTezosTarget('');
                break;
            case 'chamber':
                openHashModal(
                    () => openChamberFeature('chamber'),
                    'Failed to open Tezos L1 Governance'
                );
                break;
            case 'pulse':
                openHashModal(
                    () => openChamberFeature('pulse'),
                    'Failed to open Network Pulse Chamber'
                );
                break;
            case 'capital':
                openHashModal(
                    () => openChamberFeature('capital'),
                    'Failed to open Capital Chamber'
                );
                break;
            case 'minerals':
                openHashModal(
                    () => openChamberFeature('minerals'),
                    'Failed to open Critical Minerals Chamber'
                );
                break;
            case 'uranium':
                openHashModal(
                    () => openChamberFeature('uranium'),
                    'Failed to open Uranium Chamber'
                );
                break;
            case 'metals':
                openHashModal(
                    () => openChamberFeature('metals'),
                    'Failed to open Precious Metals Chamber'
                );
                break;
            case 'ecosystem':
                openHashModal(
                    () => openChamberFeature('ecosystem'),
                    'Failed to open Ecosystem Activity'
                );
                break;
            case 'whales':
                openHashModal(
                    () => openChamberFeature('whales'),
                    'Failed to open Whale Watch Chamber'
                );
                break;
            case 'staking':
                openHashModal(
                    () => openChamberFeature('staking-chamber'),
                    'Failed to open Staking Chamber'
                );
                break;
            case 'leaderboard':
                openHashModal(
                    () => openChamberFeature('leaderboard'),
                    'Failed to open Baker Directory Chamber'
                );
                break;
            case 'health':
                openHashModal(
                    () => import('../features/network-health.js').then(({ openNetworkHealthChamber }) => openNetworkHealthChamber()),
                    'Failed to open Network Health Chamber'
                );
                break;
            case 'tezosx':
                openHashModal(
                    () => openChamberFeature('tezosx'),
                    'Failed to open Tezos X Chamber'
                );
                break;
            case 'l2chamber':
                openHashModal(
                    () => openChamberFeature('l2-governance'),
                    'Failed to open Tezos X Governance Chamber'
                );
                break;
            case 'lb':
                openHashModal(
                    () => openChamberFeature('liquidity-baking'),
                    'Failed to open Liquidity Baking monitor'
                );
                break;
            case 'tz4':
                openHashModal(
                    () => openChamberFeature('tz4'),
                    'Failed to open tz4 Adoption Chamber'
                );
                break;
            case 'ctez':
                openHashModal(
                    () => openChamberFeature('ctez'),
                    'Failed to open ctez End of Life'
                );
                break;
            case 'ledger-flow':
                openHashModal(
                    () => openChamberFeature('ledger-flow', ''),
                    'Failed to open Ledger Flow'
                );
                break;
            case 'domains':
                openHashModal(
                    () => openChamberFeature('domains', ''),
                    'Failed to open Tezos Domains Chamber'
                );
                break;
            case 'maxis':
                openHashModal(
                    () => openChamberFeature('maxis'),
                    'Failed to open Tezos Maxis Chamber'
                );
                break;
            case 'tezoscrp':
                openHashModal(
                    () => openChamberFeature('tezoscrp'),
                    'Failed to open TezosCRP Recognition Hall'
                );
                break;
            case 'protocol-history':
                {
                    const protocolRoute = getProtocolStoryRouteValue();
                openHashModal(
                    async () => {
                        await openProtocolHistoryChamber();
                        if (protocolRoute) {
                            const opened = await openProtocolHistoryByName(protocolRoute, { updateRoute: false });
                            if (!opened) window.history.replaceState(window.history.state || {}, '', '/anthology/');
                        }
                    },
                    'Failed to open Protocol History Chamber'
                );
                }
                break;
            case 'history':
                openHashModal(
                    () => import('../features/history.js').then(({ openCycleHistoryChamber }) => openCycleHistoryChamber()),
                    'Failed to open Cycle History Chamber'
                );
                break;
        }
    };

    if (!hash) {
        const prettyRoute = getPrettyChamberPathRoute();
        if (prettyRoute) {
            openPrettyChamberRoute(prettyRoute);
            return;
        }

        const pathTarget = getMyTezosPathTarget();
        if (pathTarget) {
            openMyTezosTarget(pathTarget);
            return;
        }
        if (document.querySelector('.chamber-overlay.active, #history-modal.active, #protocol-history-modal, #native-explorer-overlay.active')) {
            closeHashModalSurfaces().catch((error) => console.warn('Failed to close routed overlay', error));
        }
        return;
    }

    // #my-baker=tz1..., #my-baker=name.tez, or #my-baker (just open it)
    if (params.has('my-baker')) {
        const addr = params.get('my-baker');
        openMyTezosTarget(addr);
    }

    // #my-tezos — open the personal drawer without requiring an address.
    if (params.has('my-tezos') || hash === 'my-tezos') {
        openMyTezosTarget('');
    }

    // #search — make the command bar the next doorway from any site map.
    if (isSearchRoute) {
        setHomeBlockVisible('live-head', true, 'deep-link');
        window.clearTimeout(_searchRouteFocusTimer);
        _searchRouteFocusTimer = window.setTimeout(() => {
            _searchRouteFocusTimer = null;
            const activeHash = window.location.hash.slice(1);
            const activeParams = new URLSearchParams(activeHash);
            if (activeHash !== 'search' && !activeParams.has('search')) return;
            const input = document.getElementById('hero-search-input');
            input?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
            input?.focus({ preventScroll: true });
            input?.select();
        }, 250);
    }

    // #site-map — land on the complete manifest-backed directory.
    if (params.has('site-map') || hash === 'site-map') {
        setHomeBlockVisible('handoff', true, 'deep-link');
        setTimeout(() => scrollToElementAfterLayout(() => document.getElementById('site-map'), { block: 'start' }), 150);
    }

    // #snapshot — open the shareable State of Tezos generator.
    if (params.has('snapshot') || hash === 'snapshot') {
        openHashModal(() => document.getElementById('state-of-tezos-btn')?.click(), 'Failed to open Network Snapshot');
    }

    // #account=tz1... / #contract=KT1... / #operation=o... / #op=o... / #block=level|hash
    const nativeEntity = [
        ['account', params.get('account')],
        ['contract', params.get('contract')],
        ['operation', params.get('operation') || params.get('op')],
        ['block', params.get('block')]
    ].find(([, value]) => value);
    if (nativeEntity) {
        const [kind, value] = nativeEntity;
        openHashModal(
            () => import('../features/native-explorer.js').then(({ openNativeExplorer }) => openNativeExplorer(kind, value)),
            `Failed to open native ${kind} view`
        );
    }

    // #price
    if (params.has('price') || hash === 'price') {
        showToggleSection('price-intel-toggle', 'price-intelligence', { delay: 800 });
    }

    // #chamber / #the-chamber
    if (params.has('chamber') || hash === 'chamber' || params.has('the-chamber') || hash === 'the-chamber') {
        openHashModal(
            () => openChamberFeature('chamber'),
            'Failed to open Tezos L1 Governance'
        );
    }

    // #chambers
    if (params.has('chambers') || hash === 'chambers') {
        ensureChambersVisible();
        setTimeout(() => scrollToElementAfterLayout(() => document.getElementById('chambers-section'), { block: 'start' }), 200);
    }

    // #pulse / #network-pulse
    if (params.has('pulse') || hash === 'pulse' || params.has('network-pulse') || hash === 'network-pulse') {
        openHashModal(
            () => openChamberFeature('pulse'),
            'Failed to open Network Pulse Chamber'
        );
    }

    // #capital
    if (params.has('capital') || hash === 'capital') {
        openHashModal(
            () => openChamberFeature('capital'),
            'Failed to open Capital Chamber'
        );
    }

    // #minerals / #critical-minerals / #strategic-minerals
    if (params.has('minerals') || hash === 'minerals'
        || params.has('critical-minerals') || hash === 'critical-minerals'
        || params.has('strategic-minerals') || hash === 'strategic-minerals') {
        openHashModal(
            () => openChamberFeature('minerals'),
            'Failed to open Critical Minerals Chamber'
        );
    }

    // #uranium / #xu3o8 / #u3o8 / #uranium-market
    if (params.has('uranium') || hash === 'uranium'
        || params.has('xu3o8') || hash === 'xu3o8'
        || params.has('u3o8') || hash === 'u3o8'
        || params.has('uranium-market') || hash === 'uranium-market') {
        openHashModal(
            () => openChamberFeature('uranium'),
            'Failed to open Uranium Chamber'
        );
    }

    // #metals / #precious-metals / #metals-market
    if (params.has('metals') || hash === 'metals'
        || params.has('precious-metals') || hash === 'precious-metals'
        || params.has('metals-market') || hash === 'metals-market') {
        openHashModal(
            () => openChamberFeature('metals'),
            'Failed to open Precious Metals Chamber'
        );
    }

    // #ecosystem
    if (params.has('ecosystem') || hash === 'ecosystem') {
        openHashModal(
            () => openChamberFeature('ecosystem'),
            'Failed to open Ecosystem Activity'
        );
    }

    // #staking / #stake
    if (params.has('staking') || hash === 'staking' || params.has('stake') || hash === 'stake') {
        openHashModal(
            () => openChamberFeature('staking-chamber'),
            'Failed to open Staking Chamber'
        );
    }

    // #maxis / #tezos-maxis
    if (params.has('maxis') || hash === 'maxis' || params.has('tezos-maxis') || hash === 'tezos-maxis') {
        openHashModal(
            () => openChamberFeature('maxis'),
            'Failed to open Tezos Maxis Chamber'
        );
    }

    // #tezoscrp / #community-rewards / #crp
    if (params.has('tezoscrp') || hash === 'tezoscrp'
        || params.has('community-rewards') || hash === 'community-rewards'
        || params.has('crp') || hash === 'crp') {
        openHashModal(
            () => openChamberFeature('tezoscrp'),
            'Failed to open TezosCRP Recognition Hall'
        );
    }

    // #hot-today / #hot-today=category
    if (params.has('hot-today') || hash === 'hot-today') {
        const category = params.get('hot-today');
        setHomeBlockVisible('live-pulse', true, 'deep-link');
        scrollToElementAfterLayout(() => document.getElementById('pulse-ticker-strip'), { block: 'center' });
        if (category) {
            setTimeout(() => activateHotTodaySignal(category), 900);
            setTimeout(() => activateHotTodaySignal(category), 1800);
        }
    }

    // #tezosx / legacy #tezlink
    if (params.has('tezosx') || hash === 'tezosx' || params.has('tezlink') || hash === 'tezlink') {
        openHashModal(
            () => openChamberFeature('tezosx'),
            'Failed to open Tezos X Chamber'
        );
    }

    // #l2chamber / legacy #etherlink-governance / #etherlink-gov / #etherlink
    if (
        params.has('l2chamber') || hash === 'l2chamber' ||
        params.has('etherlink-governance') || hash === 'etherlink-governance' ||
        params.has('etherlink-gov') || hash === 'etherlink-gov' ||
        params.has('etherlink') || hash === 'etherlink'
    ) {
        openHashModal(
            () => openChamberFeature('l2-governance'),
            'Failed to open Tezos X Governance Chamber'
        );
    }

    // #health / #network-health
    if (params.has('health') || hash === 'health' || params.has('network-health') || hash === 'network-health') {
        openHashModal(
            () => import('../features/network-health.js').then(({ openNetworkHealthChamber }) => openNetworkHealthChamber()),
            'Failed to open Network Health Chamber'
        );
    }

    // #lb-tile / #liquidity-baking-tile
    if (params.has('lb-tile') || hash === 'lb-tile' || params.has('liquidity-baking-tile') || hash === 'liquidity-baking-tile') {
        ensureChambersVisible();
        setTimeout(() => scrollToElementAfterLayout(() => document.getElementById('lb-entry-card')), 600);
    }

    // #lb / #liquidity-baking
    if (params.has('lb') || hash === 'lb' || params.has('liquidity-baking') || hash === 'liquidity-baking') {
        openHashModal(
            () => openChamberFeature('liquidity-baking'),
            'Failed to open Liquidity Baking monitor'
        );
    }

    // #tz4 / #tz4-adoption
    if (params.has('tz4') || hash === 'tz4' || params.has('tz4-adoption') || hash === 'tz4-adoption') {
        openHashModal(
            () => openChamberFeature('tz4'),
            'Failed to open tz4 Adoption Chamber'
        );
    }

    // #ctez / legacy #ctez-oven / #ctez-guide
    if (params.has('ctez') || hash === 'ctez' || params.has('ctez-oven') || hash === 'ctez-oven' || params.has('ctez-guide') || hash === 'ctez-guide') {
        openHashModal(
            () => openChamberFeature('ctez'),
            'Failed to open ctez End of Life'
        );
    }

    // #ledger-flow / #ledger-flow=tz1... / #flow=tz1...
    if (params.has('ledger-flow') || hash === 'ledger-flow' || params.has('flow') || hash === 'flow') {
        const target = params.get('ledger-flow') || params.get('flow') || '';
        openHashModal(
            () => openChamberFeature('ledger-flow', target),
            'Failed to open Ledger Flow'
        );
    }

    // #domains / #domains=name.tez / legacy #tezos-domains
    if (params.has('domains') || hash === 'domains' || params.has('tezos-domains') || hash === 'tezos-domains') {
        const target = params.get('domains') || params.get('tezos-domains') || '';
        openHashModal(
            () => openChamberFeature('domains', target),
            'Failed to open Tezos Domains Chamber',
            () => {
                if (!target && (window.location.pathname !== '/domains/' || window.location.hash)) {
                    window.history.replaceState(null, '', '/domains/');
                }
            }
        );
    }

    // #calculator
    if (params.has('calculator') || hash === 'calculator') {
        showToggleSection('calc-toggle', 'calculator-section');
    }

    // #compare — reveal and scroll to comparison section
    if (params.has('compare') || hash === 'compare') {
        showToggleSection('comparison-toggle', 'comparison-section', { delay: 500 });
    }

    // #protocol-history / bare #protocol — open Protocol History Chamber
    if (params.has('protocol-history') || hash === 'protocol-history' || hash === 'protocol') {
        openHashModal(
            () => openProtocolHistoryChamber(),
            'Failed to open Protocol History Chamber'
        );
    }

    // #leaderboard / bare #baker — open Baker Directory Chamber
    if (params.has('leaderboard') || hash === 'leaderboard' || hash === 'baker') {
        openHashModal(
            () => openChamberFeature('leaderboard'),
            'Failed to open Baker Directory Chamber'
        );
    }

    // #baker=tz1... or #baker=name.tez — open baker profile modal
    if (params.has('baker')) {
        const addr = params.get('baker');
        if (addr && (addr.startsWith('tz') || addr.endsWith('.tez'))) {
            loadChamberFeature('leaderboard').then(mod => {
                if (mod.openBakerProfile) mod.openBakerProfile(addr);
                else console.warn('[deep-link] openBakerProfile not found in leaderboard module');
            }).catch(err => console.error('[deep-link] baker import failed:', err));
        }
    }

    // #whales — open Whale Watch Chamber
    if (params.has('whales') || hash === 'whales') {
        openHashModal(
            () => openChamberFeature('whales'),
            'Failed to open Whale Watch Chamber'
        );
    }

    // #giants — legacy alias for Whale Watch Deep Sleep
    if (params.has('giants') || hash === 'giants') {
        openHashModal(
            () => openChamberFeature('whales', 'dormant'),
            'Failed to open Whale Watch Deep Sleep'
        );
    }

    // #nfts
    if (params.has('nfts') || hash === 'nfts') {
        window.history.replaceState(null, '', '/?hen=1');
        if (window.HenMode?.activate) window.HenMode.activate();
    }

    // #widgets
    if (params.has('widgets') || hash === 'widgets') {
        revealStaticSection('widgets-gallery');
    }

    // #history — open Cycle History Chamber
    if (params.has('history') || hash === 'history') {
        openHashModal(
            () => import('../features/history.js').then(({ openCycleHistoryChamber }) => openCycleHistoryChamber()),
            'Failed to open Cycle History Chamber'
        );
    }

    // #protocol=Ushuaia
    if (params.get('protocol')) {
        const protocolName = params.get('protocol');
        openHashModal(
            async () => {
                await openProtocolHistoryChamber();
                await openProtocolHistoryByName(protocolName);
            },
            `Failed to open protocol history for ${protocolName || 'selected protocol'}`
        );
    }

    // #theme=<name>
    if (params.has('theme')) {
        const themeName = params.get('theme');
        if (getAvailableThemes().includes(themeName)) {
            setTheme(themeName);
            localStorage.setItem('tezos-systems-theme', themeName);
        }
    }

    // #section=<id> — scroll to a section
    if (params.has('section')) {
        ensureStatsVisible();
        const sectionName = params.get('section');
        // Map friendly names to section header text
        const sectionMap = {
            'consensus': '🛡️ Consensus',
            'economy': '💰 Economy',
            'governance': '🏛️ Governance',
            'network': '📡 Network Activity',
            'ecosystem': '🌿 Ecosystem'
        };
        const target = sectionMap[sectionName];
        if (target) {
            setTimeout(() => {
                const headers = document.querySelectorAll('.section-title');
                for (const h of headers) {
                    if (h.textContent.includes(target.slice(2))) {
                        h.closest('section')?.scrollIntoView({ behavior: 'smooth' });
                        break;
                    }
                }
            }, 800);
        }
    }
}

const ROUTED_OVERLAY_ENTRIES = Object.freeze({
    'chamber-modal': { entryIds: ['chamber'], hashes: ['chamber', 'the-chamber'] },
    'protocol-history-chamber-modal': { entryIds: ['anthology'], hashes: ['protocol-history', 'protocol'] },
    'network-pulse-modal': { entryIds: ['pulse'], hashes: ['pulse', 'network-pulse'] },
    'capital-modal': { entryIds: ['capital'], hashes: ['capital'] },
    'minerals-modal': { entryIds: ['minerals'], hashes: ['minerals', 'critical-minerals', 'strategic-minerals'] },
    'uranium-modal': { entryIds: ['uranium'], hashes: ['uranium', 'xu3o8', 'u3o8', 'uranium-market'] },
    'metals-modal': { entryIds: ['metals'], hashes: ['metals', 'precious-metals', 'metals-market'] },
    'ecosystem-activity-modal': { entryIds: ['ecosystem'], hashes: ['ecosystem'] },
    'whale-watch-modal': { entryIds: ['whales'], hashes: ['whales', 'giants'] },
    'staking-chamber-modal': { entryIds: ['staking-chamber'], hashes: ['staking', 'stake'] },
    'baker-directory-modal': { entryIds: ['leaderboard'], hashes: ['leaderboard', 'baker'] },
    'maxis-modal': { entryIds: ['maxis'], hashes: ['maxis', 'tezos-maxis'] },
    'tezoscrp-modal': { entryIds: ['tezoscrp'], hashes: ['tezoscrp', 'community-rewards', 'crp'] },
    'network-health-modal': { entryIds: ['health'], hashes: ['health', 'network-health'] },
    'tezlink-modal': { entryIds: ['tezosx'], hashes: ['tezosx', 'tezlink'] },
    'etherlink-governance-modal': { entryIds: ['l2-governance'], hashes: ['l2chamber', 'etherlink-governance', 'etherlink-gov', 'etherlink'] },
    'tz4-adoption-modal': { entryIds: ['tz4'], hashes: ['tz4', 'tz4-adoption'] },
    'liquidity-baking-modal': { entryIds: ['liquidity-baking'], hashes: ['lb', 'liquidity-baking'] },
    'ctez-modal': { entryIds: ['ctez'], hashes: ['ctez', 'ctez-oven', 'ctez-guide'] },
    'ledger-flow-modal': { entryIds: ['ledger-flow'], hashes: ['ledger-flow', 'flow'] },
    'tezos-domains-modal': { entryIds: ['domains'], hashes: ['domains', 'tezos-domains'] },
    'history-modal': { entryIds: ['history'], hashes: ['history'] },
    'native-explorer-overlay': { entryIds: [], hashes: ['account', 'contract', 'operation', 'op', 'block'] }
});

function currentRouteHashKey() {
    return window.location.hash.replace(/^#/, '').split('=')[0];
}

function routedOverlayOwnsCurrentLocation(overlayId) {
    const route = ROUTED_OVERLAY_ENTRIES[overlayId];
    if (!route) return false;
    const entryId = findCurrentSiteMapEntry()?.id || '';
    return route.entryIds.includes(entryId) || route.hashes.includes(currentRouteHashKey());
}

function dashboardHomeRoutePreservingSearch() {
    return `/${window.location.search}`;
}

function initSiteMapRouter() {
    document.addEventListener('click', (event) => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const link = event.target.closest('a[data-site-map-entry]');
        if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
        const entry = findSiteMapEntry(link.dataset.siteMapEntry || '');
        if (!entry) return;
        event.preventDefault();
        navigateSiteMapEntry(entry);
    });

    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            const overlay = mutation.target;
            if (!(overlay instanceof HTMLElement) || !ROUTED_OVERLAY_ENTRIES[overlay.id]) continue;
            const wasActive = String(mutation.oldValue || '').split(/\s+/).includes('active');
            if (!wasActive || overlay.classList.contains('active')) continue;
            queueMicrotask(() => {
                if (_routedOverlayTransitionDepth > 0) return;
                if (overlay.classList.contains('active') || !routedOverlayOwnsCurrentLocation(overlay.id)) return;
                if (document.documentElement.hasAttribute('data-chamber-route')) return;
                window.history.replaceState(
                    { ...(window.history.state || {}), tezosSystemsRoute: 'home' },
                    '',
                    dashboardHomeRoutePreservingSearch()
                );
                setPageTitleRoute('', ROOT_DASHBOARD_TITLE || undefined);
            });
        }
    });
    observer.observe(document.body, {
        subtree: true,
        attributes: true,
        attributeFilter: ['class'],
        attributeOldValue: true
    });
}

// ==========================================
// NETWORK HEALTH PULSE
// ==========================================
async function updateNetworkPulse() {
    // Network liveness is now shown by the Living Uptime Clock (block pulse dot)
    // This function just feeds block data as a TzKT fallback
    try {
        // Use Octez RPC instead of TzKT
        const response = await fetchWithDeadline(`${API_URLS.octez}/chains/main/blocks/head/header`, {}, 5000);
        if (!response.ok) return;
        const header = await response.json();

        if (window._updateUptimeClock) {
            window._updateUptimeClock({
                blockLevel: header.level,
                blockTime: header.timestamp,
            });
        }
    } catch (e) {
        // Silent — RPC poller in uptime clock is the primary source
    }
}

// ==========================================
// DATA EXPORT
// ==========================================
function showExportMenu() {
    let overlay = document.getElementById('export-overlay');
    if (overlay) { overlay.remove(); return; }

    overlay = document.createElement('div');
    overlay.id = 'export-overlay';
    overlay.className = 'keyboard-help-overlay export-overlay';
    overlay.innerHTML = `
        <div class="keyboard-help-card export-card" role="dialog" aria-label="Export data">
            <h3>📥 Export Data</h3>
            <div class="export-options">
                <button class="export-option" data-format="json">
                    <span class="export-option-icon">📋</span>
                    <span class="export-option-copy">
                        <strong>JSON</strong>
                        <span>All current stats</span>
                    </span>
                </button>
                <button class="export-option" data-format="csv">
                    <span class="export-option-icon">📊</span>
                    <span class="export-option-copy">
                        <strong>CSV</strong>
                        <span>Spreadsheet-friendly rows</span>
                    </span>
                </button>
            </div>
            <p class="keyboard-help-hint export-hint">Choose a format to download</p>
        </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));

    overlay.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-format]');
        if (btn) {
            const format = btn.dataset.format;
            exportData(format);
            overlay.classList.remove('visible');
            setTimeout(() => overlay.remove(), 200);
        } else if (e.target === overlay) {
            overlay.classList.remove('visible');
            setTimeout(() => overlay.remove(), 200);
        }
    });
}

function exportData(format) {
    const stats = state.currentStats;
    if (!stats) return;

    const timestamp = new Date().toISOString();
    const data = {
        exported: timestamp,
        source: 'tezos.systems',
        sourceEndpoints: {
            tzkt: API_URLS.tzkt,
            octez: API_URLS.octez
        },
        quality: stats._quality || { status: 'unknown' },
        consensus: {
            totalBakers: stats.totalBakers,
            tz4Bakers: stats.tz4Bakers,
            tz4Percentage: stats.tz4Percentage,
            currentCycle: stats.cycle,
            cycleProgress: stats.cycleProgress
        },
        economy: {
            issuanceRate: stats.currentIssuanceRate,
            protocolIssuance: stats.protocolIssuanceRate,
            lbIssuance: stats.lbIssuanceRate,
            lbSubsidyStatus: stats.lbSubsidyDisabled == null
                ? 'Unknown'
                : stats.lbSubsidyDisabled
                    ? 'Disabled'
                    : 'Active',
            lbSubsidyDisabled: stats.lbSubsidyDisabled ?? null,
            lbEmaPct: stats.lbEmaPct,
            delegateAPY: stats.delegateAPY,
            stakeAPY: stats.stakeAPY,
            stakingRatio: stats.stakingRatio,
            delegatedRatio: stats.delegatedRatio,
            bakingPower: stats.bakingPower,
            rewardAccounts: stats.rewardAccounts,
            totalDelegators: stats.totalDelegators,
            totalStakers: stats.totalStakers,
            totalSupply: stats.totalSupply,
            totalBurned: stats.totalBurned
        },
        governance: {
            activeProposal: stats.proposal,
            votingPeriod: stats.votingPeriod,
            participation: stats.participation
        },
        network: {
            transactions24h: stats.transactionVolume24h,
            contractCalls24h: stats.contractCalls24h,
            fundedAccounts: stats.fundedAccounts,
            newAccounts24h: stats.newAccounts24h
        },
        ecosystem: {
            smartContracts: stats.smartContracts,
            activeContracts24h: stats.activeContracts24h,
            tokens: stats.tokens,
            smartRollups: stats.rollups
        }
    };

    let blob, filename;

    if (format === 'json') {
        blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        filename = `tezos-systems-${timestamp.slice(0,10)}.json`;
    } else {
        const formatMetricLabel = (key) => ({
            totalBakers: 'Total Bakers',
            tz4Bakers: 'TZ4 Bakers',
            tz4Percentage: 'TZ4 Percentage',
            currentCycle: 'Current Cycle',
            cycleProgress: 'Cycle Progress',
            issuanceRate: 'Issuance Rate',
            protocolIssuance: 'Protocol Issuance',
            lbIssuance: 'LB Issuance',
            lbSubsidyStatus: 'LB Subsidy Status',
            lbSubsidyDisabled: 'LB Subsidy Disabled',
            lbEmaPct: 'LB EMA',
            delegateAPY: 'Delegate APY',
            stakeAPY: 'Stake APY',
            stakingRatio: 'Staking Ratio',
            delegatedRatio: 'Delegated Ratio',
            bakingPower: 'Baking Power',
            rewardAccounts: 'Staker + Delegator Accounts',
            totalDelegators: 'Total Delegators',
            totalStakers: 'Total Stakers',
            totalSupply: 'Total Supply',
            totalBurned: 'Total Burned',
            activeProposal: 'Active Proposal',
            votingPeriod: 'Voting Period',
            participation: 'Participation',
            transactions24h: 'Transactions 24h',
            contractCalls24h: 'Contract Calls 24h',
            fundedAccounts: 'Funded Accounts',
            newAccounts24h: 'New Accounts 24h',
            smartContracts: 'Smart Contracts',
            activeContracts24h: 'Active Contracts 24h',
            tokens: 'Tokens',
            smartRollups: 'Smart Rollups'
        }[key] || String(key).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase()));
        const formatCategoryLabel = (category) => String(category).replace(/^./, c => c.toUpperCase());
        const escapeCsvField = (value) => {
            if (value === null || value === undefined) return '';
            const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
            return `"${text.replace(/"/g, '""')}"`;
        };

        const rows = [
            ['Category', 'Metric', 'Value'],
            ['Metadata', 'Generated At', timestamp],
            ['Metadata', 'Source', data.source]
        ];
        for (const [cat, metrics] of Object.entries(data)) {
            if (cat === 'exported' || cat === 'source') continue;
            for (const [key, val] of Object.entries(metrics)) {
                rows.push([formatCategoryLabel(cat), formatMetricLabel(key), val]);
            }
        }
        const csv = rows.map(r => r.map(escapeCsvField).join(',')).join('\n');
        blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        filename = `tezos-systems-${timestamp.slice(0,10)}.csv`;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// ==========================================
// KEYBOARD SHORTCUTS
// ==========================================
function initKeyboardShortcuts() {
    // Build help overlay content
    const shortcuts = [
        { key: '/', desc: 'Focus command bar' },
        { key: 'Enter', desc: 'Open selected command result' },
        { key: 'r', desc: 'Refresh data' },
        { key: 'm', desc: 'Open or close My Tezos' },
        { key: 'h', desc: 'Open Cycle History Chamber' },
        { key: 't', desc: 'Cycle theme' },
        { key: 'c', desc: 'Toggle Rewards Calculator' },
        { key: 'k', desc: 'Open Compare Chains' },
        { key: 'l', desc: 'Open Baker Directory' },
        { key: 'w', desc: 'Open Whale Watch' },
        { key: 'g', desc: 'Open Whale Watch Deep Sleep' },
        { key: '?', desc: 'Show this help' },
        { key: 'Esc', desc: 'Close modals/help' },
    ];

    let helpOverlay = null;

    function showHelp() {
        if (helpOverlay) { hideHelp(); return; }
        helpOverlay = document.createElement('div');
        helpOverlay.id = 'keyboard-help';
        helpOverlay.className = 'keyboard-help-overlay';
        helpOverlay.innerHTML = `
            <div class="keyboard-help-card">
                <h3>⌨️ Keyboard Shortcuts</h3>
                <div class="keyboard-help-grid">
                    ${shortcuts.map(s => `
                        <div class="keyboard-help-row">
                            <kbd>${s.key}</kbd>
                            <span>${s.desc}</span>
                        </div>
                    `).join('')}
                </div>
                <p class="keyboard-help-hint">Press any key to dismiss</p>
            </div>
        `;
        document.body.appendChild(helpOverlay);
        helpOverlay.addEventListener('click', (e) => {
            if (e.target === helpOverlay) hideHelp();
        });
        requestAnimationFrame(() => helpOverlay.classList.add('visible'));
    }

    function hideHelp() {
        if (!helpOverlay) return;
        helpOverlay.classList.remove('visible');
        setTimeout(() => { helpOverlay?.remove(); helpOverlay = null; }, 200);
    }

    const THEMES = getAvailableThemes();

    // Wire up export button
    const exportBtn = document.getElementById('export-btn');
    if (exportBtn) exportBtn.addEventListener('click', showExportMenu);

    // Wire up shortcuts button in settings menu
    const shortcutsBtn = document.getElementById('shortcuts-btn');
    if (shortcutsBtn) shortcutsBtn.addEventListener('click', showHelp);

    document.addEventListener('keydown', (e) => {
        // Ignore if typing in an input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
        // Ignore if modifier keys are held (except shift for ?)
        if (e.ctrlKey || e.metaKey || e.altKey) return;

        const key = e.key.toLowerCase();

        // Help overlay dismissal — any key
        if (helpOverlay && key !== '?') {
            hideHelp();
            if (key === 'escape') return;
            // Don't consume the key — let it fall through to shortcuts
        }

        switch (key) {
            case 'r': {
                e.preventDefault();
                const refreshBtn = document.getElementById('refresh-btn');
                if (refreshBtn) {
                    refreshBtn.click();
                    refreshBtn.classList.add('spinning');
                    setTimeout(() => refreshBtn.classList.remove('spinning'), 1000);
                }
                break;
            }
            case 't': {
                e.preventDefault();
                const current = document.body.getAttribute('data-theme') || 'matrix';
                const idx = THEMES.indexOf(current);
                const next = THEMES[(idx + 1) % THEMES.length];
                setTheme(next);
                localStorage.setItem('tezos-systems-theme', next);
                break;
            }
            case 'm': {
                e.preventDefault();
                // Toggle handled by initMyTezosButton M-key listener
                break;
            }
            case 'c': {
                e.preventDefault();
                document.getElementById('calc-toggle')?.click();
                break;
            }
            case 'h': {
                e.preventDefault();
                document.getElementById('history-btn')?.click();
                break;
            }
            case 'w': {
                e.preventDefault();
                document.getElementById('whale-toggle')?.click();
                break;
            }
            case 'g': {
                e.preventDefault();
                openChamberFeature('whales', 'dormant')
                    .catch((error) => console.warn('Failed to open Whale Watch Deep Sleep', error));
                break;
            }
            case 'k': {
                e.preventDefault();
                // Scroll to chain comparison section
                const toggle = document.getElementById('comparison-toggle');
                const section = document.getElementById('comparison-section');
                if (toggle && section && !section.classList.contains('visible')) {
                    toggle.click();
                }
                if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
                break;
            }
            case 'l': {
                e.preventDefault();
                document.getElementById('leaderboard-toggle')?.click();
                break;
            }
            case '?': {
                e.preventDefault();
                showHelp();
                break;
            }
        }
    });
}
