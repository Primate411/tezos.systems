/**
 * Tezos Systems - Main Application
 * Dashboard for Tezos network statistics
 */

import './tzkt-throttle.js';
import { fetchAllStats, fetchHeroStats, checkApiHealth } from './api.js';
import { initTheme, openThemePicker, setTheme, getAvailableThemes } from '../ui/theme.js';
import { flipCard, updateStatInstant, showLoading, showError } from '../ui/animations.js';
import {
    formatCount,
    formatPercentage,
    formatXTZ,
    formatLarge,
    formatTimestamp,
    formatSupply,
    escapeHtml,
    debugLog
} from './utils.js';
import {
    connectOctezWallet,
    disconnectOctezWallet,
    getStoredWalletAddress,
    preloadOctezConnect,
    shortAddress
} from './wallet.js';
import { initArcadeEffects, toggleUltraMode } from '../effects/arcade-effects.js';
import { initHistoryModal, updateSparklines, addCardHistoryButtons, setLatestLiveMetric, openCardHistoryModal } from '../features/history.js';
import { ensureCardShareButton, initShare, initProtocolShare, loadHtml2Canvas, showShareModal, setLiveAPY } from '../ui/share.js';
import { fetchProtocols } from '../features/governance.js';
import { initGovernanceAlerts } from '../features/governance-alerts.js';
import { initChamber } from '../features/chamber.js';
import { initLiquidityBaking } from '../features/liquidity-baking.js';
import { initTz4AdoptionChamber } from '../features/tz4-adoption.js';
import { initTezlinkChamber } from '../features/tezlink.js';
import { initEtherlinkGovernanceChamber } from '../features/etherlink-governance.js';
import { initCtezChamber } from '../features/ctez.js';
import { initLedgerFlowChamber } from '../features/ledger-flow.js';

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

import { saveStats, loadStats, saveProtocols, loadProtocols, getCacheAge, getVisitDeltas, saveVisitSnapshot } from './storage.js';
import { initWhaleTracker } from '../features/whales.js';
import { initSleepingGiants } from '../features/sleeping-giants.js';
import { initPriceBar } from '../features/price.js';
import { initStreak } from '../features/streak.js';
import { updatePageTitle } from '../ui/title.js';
import { REFRESH_INTERVALS, STAKING_TARGET, MAINNET_LAUNCH, API_URLS } from './config.js';
import { initComparison, updateComparison } from '../features/comparison.js';
import { init as initMyBaker, refresh as refreshMyBaker } from '../features/my-baker.js';
import { initCalculator } from '../features/calculator.js';
import { initObjkt } from '../features/objkt-ui.js';
import { checkMoments, initMomentsTimeline } from '../features/moments.js';
import { initVibes } from '../effects/vibes.js';
import { initChangelog } from '../features/changelog.js';
import { initLeaderboard, refreshLeaderboard } from '../features/leaderboard.js';
import { initBakerReportCard } from '../features/baker-report-card.js';

import { initMyTezos, refreshMyTezos } from '../features/my-tezos.js';
import { initUpgradeEffect } from '../features/upgrade-effect.js';
import { initCyclePulse, updateCyclePulse } from '../features/cycle-pulse.js';
import { initPriceIntelligence, updatePriceIntelligence } from '../features/price-intelligence.js';
import { initRewardsTracker, updateRewardsTracker, destroyRewardsTracker } from '../features/rewards-tracker.js';
import { initDailyBriefing, updateDailyBriefing } from '../features/daily-briefing.js';
import { initStateOfTezos } from '../features/state-of-tezos.js';
import { initNetworkHealth, refreshNetworkHealth } from '../features/network-health.js';
import { initHeroSearch } from '../features/search.js';

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
    refreshInterval: REFRESH_INTERVALS.main,
    refreshTimer: null,
};

// Safe feature wrapper — one failing feature can't kill init or refresh
function safe(name, fn) {
    try { fn(); } catch (e) { console.warn(`[feature] ${name} failed:`, e); }
}

/**
 * Initialize the dashboard
 */
async function init() {
    debugLog('Initializing Tezos Systems dashboard...');

    // Initialize theme
    safe('theme', initTheme);

    // Initialize arcade effects
    safe('arcadeEffects', initArcadeEffects);
    
    // Initialize share functionality
    safe('share', initShare);
    safe('protocolShare', initProtocolShare);

    // Lift chamber entry cards out of the hidden network-stat sections.
    safe('chambersSurface', initChambersSurface);
    
    // Initialize Tezos L1 Governance modal
    safe('chamber', initChamber);
    safe('liquidityBaking', initLiquidityBaking);
    safe('tezlinkChamber', initTezlinkChamber);
    safe('etherlinkGovernanceChamber', initEtherlinkGovernanceChamber);
    safe('tz4AdoptionChamber', initTz4AdoptionChamber);
    safe('ctezChamber', initCtezChamber);
    safe('ledgerFlowChamber', initLedgerFlowChamber);
    safe('governanceAlerts', initGovernanceAlerts);
    safe('protocolHistoryChamber', initProtocolHistoryChamber);
    safe('protocolHistoryHeaderLauncher', initProtocolHistoryHeaderLauncher);
    
    // Initialize changelog modal
    safe('changelog', initChangelog);
    
    // Initialize card history buttons
    safe('cardHistory', addCardHistoryButtons);
    
    // Initialize whale tracker
    safe('whaleTracker', initWhaleTracker);
    
    // Initialize sleeping giants
    safe('sleepingGiants', initSleepingGiants);

    // Initialize price bar
    safe('priceBar', initPriceBar);
    safe('vibes', initVibes);
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
    safe('objkt', initObjkt);
    safe('leaderboard', initLeaderboard);
    safe('bakerReportCard', initBakerReportCard);
    safe('stateOfTezos', initStateOfTezos);

    safe('momentsTimeline', initMomentsTimeline);
    safe('comparisonToggle', initComparisonToggle);
    safe('comparison', () => initComparison({}));
    safe('cyclePulse', () => initCyclePulse({}));
    safe('dailyBriefing', () => initDailyBriefing({}, 0));
    safe('rewardsTracker', () => {
        if (localStorage.getItem('tezos-systems-my-baker-address')) {
            const p = parseFloat(document.querySelector('.price-value')?.textContent?.replace(/[^0-9.]/g, '')) || 0;
            initRewardsTracker(state.currentStats || {}, p);
        }
    });
    safe('navButtons', initNavButtons);
    safe('heroSearch', initHeroSearch);
    safe('uptimeClock', initUptimeClock);
    safe('chambersToggle', initChambersToggle);
    safe('tezosStatsToggle', initTezosStatsToggle);
    safe('networkHealth', initNetworkHealth);
    safe('chambersOrder', orderChambersSurface);
    safe('tezosLoopConsole', initTezosLoopConsole);

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
    const cachedProtocols = loadProtocols();
    
    // Only render cached full stats if the user enabled Network Stats.
    const statsWanted = localStorage.getItem(STATS_VISIBLE_KEY) === 'true';
    if (cachedStats && statsWanted) {
        debugLog('⚡ Rendering cached data instantly');
        statsDataLoaded = true;
        await updateStats(cachedStats);
        state.lastUpdate = new Date();
        updateLastRefreshTime();
        
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
        window._updateUptimeClock({
            activeBakers: cachedStats.totalBakers,
            stakedRatio: cachedStats.stakingRatio,
            currentIssuanceRate: cachedStats.currentIssuanceRate,
        });
    }
    if (cachedStats) updateTz4ChamberTile(cachedStats);

    // Check API health (non-blocking)
    checkApiHealth().then(health => debugLog('API Health:', health));

    // Fetch hero data + conditional full stats
    refreshInBackground();

    // Initialize history features
    initHistoryModal();
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
async function refreshInBackground() {
    debugLog('🔄 Fetching fresh data in background...');
    
    try {
        // Always update protocol/hero data
        await updateUpgradeClock();
        const heroStats = await fetchHeroStats();
        // Silent failure (rate-limit / network): keep the last good UI, flag it.
        if (looksEmptyStats(heroStats)) {
            reportDataProblem();
            return;
        }
        if (window._updateUptimeClock) {
            window._updateUptimeClock({
                activeBakers: heroStats.totalBakers,
                stakedRatio: heroStats.stakingRatio,
                currentIssuanceRate: heroStats.currentIssuanceRate,
            });
        }
        updateTz4ChamberTile(heroStats);
        syncLiveSparklineMetrics(heroStats);

        // Only fetch full stats if Tezos Stats sections are visible
        const statsVisible = localStorage.getItem(STATS_VISIBLE_KEY);
        if (statsVisible === 'true') {
            const newStats = await fetchAllStats();
            debugLog('✅ Fresh stats received');
            
            const deltas = getVisitDeltas(newStats);
            if (deltas) showDeltasPanel(deltas);
            saveVisitSnapshot(newStats);
            saveStats(newStats);
            await updateStats(newStats);
            syncLiveSparklineMetrics(newStats);
            state.lastUpdate = new Date();
            updateLastRefreshTime();
        }

        // Always update comparison section with whatever data we have
        // (heroStats provides stakingRatio; full stats add issuance if available)
        const comparisonStats = {
            ...state.currentStats,
            stakingRatio: heroStats.stakingRatio || state.currentStats?.stakingRatio,
            currentIssuanceRate: heroStats.currentIssuanceRate || state.currentStats?.currentIssuanceRate,
            cycle: heroStats.cycle || state.currentStats?.cycle,
            cycleProgress: heroStats.cycleProgress ?? state.currentStats?.cycleProgress,
            cycleTimeRemaining: heroStats.cycleTimeRemaining || state.currentStats?.cycleTimeRemaining,
        };
        updateComparison(comparisonStats);
        updateCyclePulse(comparisonStats);
        const bgXtzPrice = parseFloat(document.querySelector(".price-value")?.textContent?.replace(/[^0-9.]/g, "")) || 0;
        updateDailyBriefing(comparisonStats, bgXtzPrice);
        updateRewardsTracker(comparisonStats, bgXtzPrice);
        updatePriceIntelligence(comparisonStats, bgXtzPrice);

        
        // Refresh My Baker/Leaderboard if visible
        refreshMyBaker();
        refreshLeaderboard();
        refreshMyTezos();
        refreshNetworkHealth({ force: true });

        reportDataHealthy();
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
        state.lastUpdate = new Date();
        updateLastRefreshTime();
        await updateUpgradeClock(); // Update protocol + days live

        // Price Intelligence
        const piPrice = parseFloat(document.querySelector('.price-value')?.textContent?.replace(/[^0-9.]/g, '')) || 0;
        safe('priceIntelligence', () => initPriceIntelligence(state.currentStats, piPrice));
        // resetCountdown();
        refreshMyBaker();
        refreshLeaderboard();
        refreshMyTezos();
        refreshNetworkHealth({ force: true });

        reportDataHealthy();
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

/**
 * Update displayed statistics
 */
async function updateStats(newStats) {
    // First load - update instantly
    if (!state.lastUpdate) {
        debugLog('First load - updating instantly');
        
        // Consensus
        updateStatInstant('total-bakers', newStats.totalBakers, formatCount);
        updateStatInstant('tz4-adoption', newStats.tz4Percentage,
            (val) => `${val.toFixed(1)} / ${STAKING_TARGET}%`);
        const tz4Desc = document.getElementById('tz4-description');
        if (tz4Desc) tz4Desc.textContent = `${newStats.tz4Bakers} / ${newStats.totalBakers} bakers active`;
        updateStatInstant('cycle-progress', newStats.cycle, formatCount);
        document.getElementById('cycle-description').textContent = 
            `${newStats.cycleProgress.toFixed(1)}% • ${newStats.cycleTimeRemaining}`;
        
        // Governance
        updateStatInstant('proposal', newStats.proposal, (v) => v);
        document.getElementById('proposal-description').textContent = newStats.proposalDescription;
        updateStatInstant('voting-period', newStats.votingPeriod, (v) => v);
        document.getElementById('voting-description').textContent = newStats.votingDescription;
        updateStatInstant('participation', newStats.participation, formatPercentage);
        document.getElementById('participation-description').textContent = newStats.participationDescription;
        
        // Economy
        updateStatInstant('issuance-rate', newStats.currentIssuanceRate, formatPercentage);
        updateIssuanceBreakdown(newStats.protocolIssuanceRate, newStats.lbIssuanceRate, newStats.lbSubsidyDisabled);
        updateStatInstant('staking-apy', newStats.delegateAPY, 
            (val) => `${(val || 0).toFixed(1)}% / ${(newStats.stakeAPY || 0).toFixed(1)}%`);
        // Update live APY values for tweet template substitution
        if (newStats.delegateAPY && newStats.stakeAPY) {
            setLiveAPY(newStats.delegateAPY, newStats.stakeAPY);
        }
        updateStatInstant('staking-ratio', newStats.stakingRatio, formatPercentage);
        updateStatInstant('delegated', newStats.delegatedRatio, formatPercentage);
        updateStatInstant('total-supply', newStats.totalSupply, formatSupply);
        updateStatInstant('total-burned', newStats.totalBurned, formatSupply);
        updateStatInstant('baking-power', newStats.bakingPower, formatSupply);
        updateStatInstant('reward-accounts', newStats.rewardAccounts, formatLarge);
        updateRewardAccountsBreakdown(newStats.totalDelegators, newStats.totalStakers);
        
        // Network Activity
        updateStatInstant('tx-volume', newStats.transactionVolume24h, formatLarge);
        updateStatInstant('contract-calls', newStats.contractCalls24h, formatLarge);
        updateStatInstant('funded-accounts', newStats.fundedAccounts, formatLarge);
        updateStatInstant('new-accounts', newStats.newAccounts24h, formatLarge);
        
        // Ecosystem
        updateStatInstant('smart-contracts', newStats.smartContracts, formatLarge);
        updateStatInstant('tokens', newStats.tokens, formatLarge);
        updateStatInstant('rollups', newStats.rollups, formatCount);
        updateStatInstant('active-contracts', newStats.activeContracts24h, formatLarge);

        // Feed uptime clock with baker/staking data
        if (window._updateUptimeClock) {
            window._updateUptimeClock({
                activeBakers: newStats.totalBakers,
                stakedRatio: newStats.stakingRatio,
                currentIssuanceRate: newStats.currentIssuanceRate,
            });
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
                formatter: (val) => `${val.toFixed(1)} / ${STAKING_TARGET}%`
            });
        }
        if (state.currentStats.cycle !== newStats.cycle) {
            updates.push({ cardId: 'cycle-progress', value: newStats.cycle, formatter: formatCount });
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
                formatter: (val) => `${(val || 0).toFixed(1)}% / ${(newStats.stakeAPY || 0).toFixed(1)}%`
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

        // Apply updates with animations
        for (const update of updates) {
            const card = document.querySelector(`[data-stat="${update.cardId}"]`);
            if (card) await flipCard(card, update.value, update.formatter);
        }
        
        // Update descriptions
        const tz4Desc2 = document.getElementById('tz4-description');
        if (tz4Desc2) tz4Desc2.textContent = `${newStats.tz4Bakers} / ${newStats.totalBakers} bakers active`;
        document.getElementById('cycle-description').textContent = 
            `${newStats.cycleProgress.toFixed(1)}% • ${newStats.cycleTimeRemaining}`;
        updateRewardAccountsBreakdown(newStats.totalDelegators, newStats.totalStakers);
    }

    if (newStats.delegateAPY && newStats.stakeAPY) {
        setLiveAPY(newStats.delegateAPY, newStats.stakeAPY);
    }

    // Feed uptime clock on every refresh
    if (window._updateUptimeClock) {
        window._updateUptimeClock({
            activeBakers: newStats.totalBakers,
            stakedRatio: newStats.stakingRatio,
            currentIssuanceRate: newStats.currentIssuanceRate,
        });
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
    if (aboutApy) aboutApy.textContent = `~${(newStats.stakeAPY || 0).toFixed(1)}%`;

    // Update comparison section with live Tezos data
    updateComparison(state.currentStats);

    // Update new engagement features
    updateCyclePulse(state.currentStats);
    const xtzPrice = parseFloat(document.querySelector(".price-value")?.textContent?.replace(/[^0-9.]/g, "")) || 0;
    updateDailyBriefing(state.currentStats, xtzPrice);
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
    ALL_CARD_IDS.forEach(id => showError(id, 'Error'));
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
    if (!kind) { bar.hidden = true; return; }
    bar.classList.toggle('error', kind === 'error');
    const txt = bar.querySelector('.data-status-text');
    if (txt) txt.textContent = message || '';
    bar.hidden = false;
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

    const STORAGE_KEY = 'tezos-systems-my-baker-address';

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
        const label = address ? `Wallet ${shortAddress(address)}` : (status || 'No wallet connected');
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
                btn.textContent = 'Use wallet';
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

    btn.addEventListener('click', () => {
        const drawer = document.getElementById('my-tezos-drawer');
        const scrim = document.getElementById('my-tezos-drawer-scrim');
        if (drawer && scrim) {
            const isOpen = drawer.classList.contains('open');
            drawer.classList.toggle('open', !isOpen);
            scrim.classList.toggle('open', !isOpen);
            if (!isOpen) {
                prewarmWalletFromDrawer();
                // Show correct state
                const address = localStorage.getItem(STORAGE_KEY);
                const emptyState = document.getElementById('drawer-empty-state');
                const connectedState = document.getElementById('drawer-connected');
                if (emptyState) emptyState.style.display = address ? 'none' : '';
                if (connectedState) connectedState.style.display = address ? '' : 'none';
            }
            document.body.style.overflow = !isOpen ? 'hidden' : '';
        }
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
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeDrawer();
    });

    function closeDrawer() {
        document.getElementById('my-tezos-drawer')?.classList.remove('open');
        document.getElementById('my-tezos-drawer-scrim')?.classList.remove('open');
        document.body.style.overflow = '';
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
const CHAMBERS_VISIBLE_KEY = 'tezos-systems-chambers-visible';
const CHAMBER_CARD_PAIRS = [
    {
        key: 'health-governance',
        selectors: ['[data-stat="network-health"]', '#chamber-entry-card']
    },
    {
        key: 'tezlink-governance',
        selectors: ['#tezlink-entry-card', '#etherlink-governance-entry-card']
    },
    {
        key: 'tz4-liquidity',
        selectors: ['[data-stat="tz4-adoption"]', '#lb-entry-card']
    },
    {
        key: 'ledger-history',
        selectors: ['#ledger-flow-entry-card', '#protocol-history-entry-card']
    }
];
let _chamberPairObserver = null;
const CHAMBER_EXPAND_CUE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4h5v5"/><path d="M9 20H4v-5"/><path d="M20 4l-7 7"/><path d="M4 20l7-7"/></svg>';
const CHAMBER_INFO_ICON_SVG = '<svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/></svg>';
const CHAMBER_INFO_COPY = {
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
        body: 'Maps sent, received, and first-funding transfer paths around any Tezos account with amount-weighted connections.',
        href: '/ledger-flow/',
        link: 'Open Ledger Flow ->'
    },
    'protocol-history-entry-card': {
        title: 'Protocol Anthology',
        body: 'A current-first archive of Tezos lore, amendment memory, protocol timeline, and impact views.',
        href: '#protocol-history',
        link: 'Open Anthology ->'
    }
};

function createChamberExpandCue() {
    const cue = document.createElement('span');
    cue.className = 'chamber-expand-cue';
    cue.setAttribute('aria-hidden', 'true');
    cue.innerHTML = CHAMBER_EXPAND_CUE_SVG;
    return cue;
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
    }

    info.dataset.tooltip = info.dataset.tooltip || key;
    info.setAttribute('aria-label', `Explain ${copy.title}`);
    info.title = 'What is this?';
    if (!info.querySelector('svg')) info.innerHTML = CHAMBER_INFO_ICON_SVG;
    if (!info.dataset.chamberInfoWired) {
        info.dataset.chamberInfoWired = '1';
        info.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
        });
    }

    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.className = 'card-tooltip';
        tooltip.id = `tooltip-${key}`;
        tooltip.innerHTML = `
            <div class="tooltip-content">
                <h4>${escapeHtml(copy.title)}</h4>
                <p>${escapeHtml(copy.body)}</p>
                <a href="${escapeHtml(copy.href)}">${escapeHtml(copy.link)}</a>
            </div>
        `;
    }

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

    const freshness = footer.querySelector('.chamber-entry-freshness');
    const label = card.dataset.updatedLabel || '';
    if (freshness && freshness.textContent !== label) freshness.textContent = label;
    footer.classList.toggle('has-freshness', Boolean(label));

    const cue = footer.querySelector(':scope > .chamber-expand-cue')
        || card.querySelector(':scope > .chamber-expand-cue, :scope .card-inner + .chamber-expand-cue')
        || createChamberExpandCue();
    if (cue && cue.parentElement !== footer) footer.appendChild(cue);
    footer.hidden = !label && !footer.querySelector('.chamber-expand-cue');
}

function syncChamberEntryFooters(root = document) {
    root.querySelectorAll?.('.chamber-entry-card').forEach(syncChamberEntryFooter);
}

function updateChamberPairState(pair) {
    if (!pair) return;
    const cards = Array.from(pair.querySelectorAll(':scope > .stat-card'));
    const wideCount = cards.filter((card) => card.classList.contains('chamber-entry-wide')).length;
    pair.dataset.cardCount = String(cards.length);
    pair.dataset.wideCount = String(wideCount);
}

function updateAllChamberPairStates() {
    document.querySelectorAll('#chambers-grid > .chamber-card-pair').forEach(updateChamberPairState);
}

function getKnownProtocols() {
    if (Array.isArray(state.protocols) && state.protocols.length) return state.protocols;
    const cached = loadProtocols();
    return Array.isArray(cached) ? cached : [];
}

function buildProtocolEntryRail(protocols) {
    const hasProtocols = Array.isArray(protocols) && protocols.length;
    const list = hasProtocols
        ? protocols
        : ['Paris', 'Paris C', 'Quebec', 'Rio', 'Seoul', 'Tallinn'].map((name, index, names) => ({
            name,
            isCurrent: index === names.length - 1
        }));
    const chapterBase = hasProtocols ? list.length : 21;
    const currentFirst = [...list].reverse().slice(0, 6);
    return currentFirst.map((protocol, index) => {
        const name = protocol?.name || `Chapter ${currentFirst.length - index}`;
        const classes = ['protocol-history-entry-spine-item'];
        if (protocol?.isCurrent || index === 0) classes.push('current');
        const chapter = index === 0 ? 'Now' : `Ch. ${Math.max(1, chapterBase - index)}`;
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

function protocolYear(protocol) {
    return protocolDate(protocol)?.getUTCFullYear() || null;
}

function formatProtocolDate(protocol) {
    const date = protocolDate(protocol);
    if (!date) return '';
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
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

function protocolEraLabel(protocol) {
    const year = protocolYear(protocol);
    if (!year) return 'Archive shelf';
    if (year <= 2020) return 'Origins shelf';
    if (year === 2021) return 'Capability shelf';
    if (year <= 2023) return 'Finality and rollups shelf';
    if (year <= 2025) return 'Economic governance shelf';
    return 'Tezos X runway shelf';
}

function summarizeProtocolSpan(protocols) {
    const dates = protocols.map(protocolDate).filter(Boolean).sort((a, b) => a - b);
    if (!dates.length) return 'dates syncing';
    const first = dates[0].getUTCFullYear();
    const last = dates[dates.length - 1].getUTCFullYear();
    return first === last ? String(first) : `${first}-${last}`;
}

function chooseFeaturedAnthologyChapters(protocols, currentProtocol) {
    const chosen = [];
    const add = (protocol, label) => {
        if (!protocol?.name || chosen.some((item) => item.protocol.name === protocol.name)) return;
        chosen.push({ protocol, label });
    };

    add(currentProtocol, 'Current chapter');
    add(protocols.find((protocol) => protocol.history && protocol.name !== currentProtocol?.name), 'Newest long read');
    add(protocols.find((protocol) => protocol.name === 'Oxford')
        || protocols.find((protocol) => /rejected|rejection|promotion/i.test(`${protocol.debate || ''} ${protocol.history?.title || ''}`)), 'Governance could say no');
    add(protocols.find((protocol) => protocol.name === 'Granada'), 'Economic fault line');
    add(protocols.find((protocol) => protocol.name === 'Ithaca'), 'Finality arrives');

    return chosen.slice(0, 4);
}

function buildAnthologyMetric(label, value, note) {
    return `
        <div class="protocol-anthology-metric">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value)}</strong>
            <small>${escapeHtml(note)}</small>
        </div>
    `;
}

function buildAnthologyChapterButton(protocol, label = null) {
    const historyCount = Array.isArray(protocol?.history?.sections) ? protocol.history.sections.length : 0;
    const detail = label || (historyCount ? `${historyCount} scene${historyCount === 1 ? '' : 's'}` : formatProtocolDate(protocol) || 'open');
    return `
        <button class="protocol-anthology-chip" type="button" data-protocol-open="${escapeHtml(protocol.name)}">
            <strong>${escapeHtml(protocol.name)}</strong>
            <small>${escapeHtml(detail)}</small>
        </button>
    `;
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
    const longReads = enriched.filter((protocol) => protocol.history?.sections?.length);
    const debated = enriched.filter((protocol) => protocol.debate || protocol.contention || protocol.history);
    const blockTimes = enriched.map((protocol) => Number(protocol.blockTime)).filter((time) => Number.isFinite(time) && time > 0);
    const slowest = blockTimes.length ? Math.max(...blockTimes) : null;
    const fastest = blockTimes.length ? Math.min(...blockTimes) : null;
    const latestLongRead = ordered.find((protocol) => protocol.history && protocol.name !== current?.name) || longReads[longReads.length - 1] || current;
    const features = chooseFeaturedAnthologyChapters(ordered, current);
    const shelves = new Map();

    enriched.forEach((protocol) => {
        const label = protocolEraLabel(protocol);
        if (!shelves.has(label)) shelves.set(label, []);
        shelves.get(label).push(protocol);
    });

    const shelfHtml = Array.from(shelves.entries()).map(([label, shelfProtocols]) => {
        const storyProtocol = [...shelfProtocols].reverse().find((protocol) => protocol.history || protocol.debate || protocol.contention)
            || shelfProtocols[shelfProtocols.length - 1];
        const visible = [...shelfProtocols].reverse().slice(0, 4);
        return `
            <section class="protocol-anthology-shelf">
                <div class="protocol-anthology-shelf-head">
                    <span>${escapeHtml(label)}</span>
                    <strong>${escapeHtml(summarizeProtocolSpan(shelfProtocols))}</strong>
                </div>
                <p>${escapeHtml(storyProtocol?.headline || 'Protocol context captured from the amendment trail.')}</p>
                <div class="protocol-anthology-shelf-chips">
                    ${visible.map((protocol) => buildAnthologyChapterButton(protocol)).join('')}
                </div>
            </section>
        `;
    }).join('');

    board.innerHTML = `
        <div class="protocol-anthology-board">
            <div class="protocol-anthology-brief">
                <span class="feature-kicker">Curator's desk</span>
                <h3>${escapeHtml(current?.name || 'Current')} is the live chapter. ${escapeHtml(latestLongRead?.name || 'Quebec')} is the closest deep read.</h3>
                <p>The anthology is built from the protocol archive in this repo: activation dates, block receipts, change lists, debate notes, and long-form histories where the governance fight left a mark.</p>
            </div>
            <div class="protocol-anthology-metrics" aria-label="Protocol anthology evidence">
                ${buildAnthologyMetric('Chapters', String(enriched.length), 'activated or accepted records')}
                ${buildAnthologyMetric('Long reads', String(longReads.length), 'curated history scenes')}
                ${buildAnthologyMetric('Debate marks', String(debated.length), 'upgrades with dispute context')}
                ${buildAnthologyMetric('Block time', slowest && fastest ? `${slowest}s -> ${fastest}s` : 'syncing', 'fastest recorded target')}
            </div>
            <div class="protocol-anthology-featured" aria-label="Featured protocol chapters">
                ${features.map(({ protocol, label }) => `
                    <button class="protocol-anthology-feature" type="button" data-protocol-open="${escapeHtml(protocol.name)}">
                        <span>${escapeHtml(label)}</span>
                        <strong>${escapeHtml(protocol.name)}</strong>
                        <small>${escapeHtml(protocol.history?.title || protocol.headline || 'Open protocol context')}</small>
                    </button>
                `).join('')}
            </div>
            <div class="protocol-anthology-shelves" aria-label="Protocol era shelves">
                ${shelfHtml}
            </div>
        </div>
    `;

    if (!board.dataset.protocolAnthologyWired) {
        board.addEventListener('click', (event) => {
            const trigger = event.target.closest('[data-protocol-open]');
            const name = trigger?.getAttribute('data-protocol-open');
            if (!name) return;
            openProtocolHistoryByName(name);
        });
        board.dataset.protocolAnthologyWired = '1';
    }
}

function updateProtocolHistoryEntryCard(protocols = getKnownProtocols()) {
    const card = document.getElementById('protocol-history-entry-card');
    if (!card) return;

    const list = Array.isArray(protocols) ? protocols : [];
    const currentProtocol = list.find((protocol) => protocol.isCurrent) || list[list.length - 1] || null;
    const count = list.length || 21;
    const currentName = currentProtocol?.name || document.getElementById('header-current-protocol')?.textContent?.trim() || 'Tallinn';

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
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.setAttribute('aria-label', 'Open Protocol Anthology Chamber');
        card.innerHTML = `
            <button class="card-copy-link" type="button" data-copy-hash="#protocol-history" aria-label="Copy Protocol Anthology direct link" title="Copy Protocol Anthology link">🔗</button>
            <div class="card-inner">
                <div class="card-front protocol-history-entry-front">
                    <h2 class="stat-label">Protocol Anthology</h2>
                    <div class="protocol-history-entry-anthology">
                        <div class="protocol-history-entry-count">
                            <span>Volume</span>
                            <strong id="protocol-history-entry-count">21</strong>
                            <em>chapters</em>
                        </div>
                        <div class="protocol-history-entry-core">
                            <div class="protocol-history-entry-current">
                                <span>Current chapter</span>
                                <strong id="protocol-history-entry-current">Tallinn</strong>
                                <small>Running now on Tezos</small>
                            </div>
                            <p class="stat-description" id="protocol-history-entry-description">Start at Tallinn, then unfold the amendment anthology backward through lore, impact views, disputes, and receipts.</p>
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

    if (!card.dataset.protocolHistoryWired) {
        const open = (event) => {
            if (event?.target?.closest?.('button, a, .card-tooltip')) return;
            openProtocolHistoryChamber();
        };
        card.addEventListener('click', open);
        card.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            open(event);
        });
        card.dataset.protocolHistoryWired = '1';
    }

    updateProtocolHistoryEntryCard(getKnownProtocols());
    return card;
}

function orderChambersSurface() {
    const grid = document.getElementById('chambers-grid');
    if (!grid) return;

    grid.classList.add('chambers-paired-grid');
    const orderedCards = [];

    CHAMBER_CARD_PAIRS.forEach((pairConfig) => {
        let pair = grid.querySelector(`:scope > .chamber-card-pair[data-chamber-pair="${pairConfig.key}"]`);
        if (!pair) {
            pair = document.createElement('div');
            pair.className = 'chamber-card-pair';
            pair.dataset.chamberPair = pairConfig.key;
        }

        pairConfig.selectors.forEach((selector) => {
            const card = document.querySelector(selector);
            if (!card) return;
            pair.appendChild(card);
            orderedCards.push(card);
        });

        if (pair.children.length) {
            grid.appendChild(pair);
        }
        updateChamberPairState(pair);
    });

    grid.dataset.chambersOrder = orderedCards.map((card) => card.id || card.dataset.stat || '').join(',');
    syncChamberEntryFooters(grid);

    if (!_chamberPairObserver) {
        _chamberPairObserver = new MutationObserver(() => {
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
    ensureProtocolHistoryEntryCard();
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
        if (window.location.hash === '#protocol-history') {
            openProtocolHistoryChamber();
            return;
        }
        window.location.hash = 'protocol-history';
    });
}

function initChambersToggle() {
    const section = document.getElementById('chambers-section');
    const toggleBtn = document.getElementById('chambers-toggle');
    if (!section || !toggleBtn) return;

    function updateVis(isVisible) {
        section.style.display = isVisible ? '' : 'none';
        toggleBtn.classList.toggle('active', isVisible);
        toggleBtn.title = `Chambers: ${isVisible ? 'ON' : 'OFF'}`;
        const status = toggleBtn.querySelector('.feature-status');
        if (status) status.textContent = isVisible ? 'Pinned' : 'Hidden';
    }

    toggleBtn.addEventListener('click', () => {
        const stored = localStorage.getItem(CHAMBERS_VISIBLE_KEY);
        const isVisible = stored !== 'false';
        const newState = !isVisible;
        localStorage.setItem(CHAMBERS_VISIBLE_KEY, String(newState));
        updateVis(newState);
    });

    // Default ON: first visitors see the command deck and Chambers.
    const stored = localStorage.getItem(CHAMBERS_VISIBLE_KEY);
    updateVis(stored !== 'false');
}

function updateTz4ChamberTile(stats) {
    if (!stats) return;
    const percentage = Number(stats.tz4Percentage);
    if (!Number.isFinite(percentage)) return;

    updateStatInstant('tz4-adoption', percentage, (val) => `${val.toFixed(1)} / ${STAKING_TARGET}%`);
    const tz4Desc = document.getElementById('tz4-description');
    if (!tz4Desc) return;

    const card = document.querySelector('.stat-card[data-stat="tz4-adoption"]');
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
        const value = Number(stats[statKey]);
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

    function updateVis(isVisible) {
        sections.forEach(s => s.style.display = isVisible ? '' : 'none');
        toggleBtn.classList.toggle('active', isVisible);
        toggleBtn.title = `Tezos Stats: ${isVisible ? 'ON' : 'OFF'}`;
        const status = toggleBtn.querySelector('.feature-status');
        if (status) status.textContent = isVisible ? 'Pinned' : 'Hidden';
    }

    async function loadStatsIfNeeded() {
        if (statsDataLoaded) return;
        statsDataLoaded = true;
        debugLog('📊 Fetching Tezos Stats on demand...');
        try {
            const newStats = await fetchAllStats();
            saveStats(newStats);
            await updateStats(newStats);
            state.lastUpdate = new Date();
            updateLastRefreshTime();
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
        toggleBtn.classList.toggle('active', isVisible);
        toggleBtn.title = `Chains: ${isVisible ? 'ON' : 'OFF'}`;
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
const PI_VISIBLE_KEY = 'tezos-systems-pi-visible';

function initPriceIntelToggle() {
    const toggleBtn = document.getElementById('price-intel-toggle');
    if (!toggleBtn) return;

    let piInitialized = false;

    function updateVis(isVisible) {
        const section = document.getElementById('price-intelligence');
        if (section) section.style.display = isVisible ? '' : 'none';
        toggleBtn.classList.toggle('active', isVisible);
        toggleBtn.title = `Price Intel: ${isVisible ? 'ON' : 'OFF'}`;
    }

    toggleBtn.addEventListener('click', async () => {
        const stored = localStorage.getItem(PI_VISIBLE_KEY);
        const isVisible = stored === 'true';
        const newState = !isVisible;
        localStorage.setItem(PI_VISIBLE_KEY, String(newState));
        updateVis(newState);

        if (newState && !piInitialized) {
            const piPrice = parseFloat(document.querySelector('.price-value')?.textContent?.replace(/[^0-9.]/g, '')) || 0;
            try {
                await initPriceIntelligence(state.currentStats || {}, piPrice);
                piInitialized = true;
            } catch (err) {
                console.warn('[price-intel] failed to initialize:', err);
            }
        }
        updateVis(localStorage.getItem(PI_VISIBLE_KEY) === 'true');
    });

    // Default OFF — always call updateVis to set initial opacity
    const stored = localStorage.getItem(PI_VISIBLE_KEY);
    const isVisible = stored === 'true';
    updateVis(isVisible);
    if (isVisible) {
        setTimeout(async () => {
            if (localStorage.getItem(PI_VISIBLE_KEY) !== 'true') return;
            const piPrice = parseFloat(document.querySelector('.price-value')?.textContent?.replace(/[^0-9.]/g, '')) || 0;
            try {
                await initPriceIntelligence(state.currentStats || {}, piPrice);
                piInitialized = true;
            } catch (err) {
                console.warn('[price-intel] failed to initialize:', err);
            }
            updateVis(localStorage.getItem(PI_VISIBLE_KEY) === 'true');
        }, 3000);
    }
}

// ==========================================
// LIVING UPTIME CLOCK
// ==========================================
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

    if (!counterEl) return;

    const LAUNCH = new Date(MAINNET_LAUNCH).getTime();
    const TOP_CONTINUITY_SHUFFLE_MS = 1500;
    const TOP_CONTINUITY_SHUFFLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%/+-:·|';
    let lastBlockLevel = 0;
    let lastBlockTime = null;
    let recentBlockTimes = []; // last N block timestamps for finality avg
    let chainBakersText = '';
    let chainFinalityText = '12s';
    let chainStakedText = '';
    let chainIssuanceText = '';
    const topContinuityAnimations = new Map();
    const chainMetricAliases = {
        'chain-uptime-bakers': ['hero-chain-uptime-bakers'],
        'chain-uptime-finality': ['hero-chain-uptime-finality'],
        'chain-uptime-staked': ['hero-chain-uptime-staked'],
        'chain-uptime-issuance': ['hero-chain-uptime-issuance']
    };

    function prefersReducedMotion() {
        return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
    }

    function updateTopContinuityShuffleState() {
        if (!topContinuityPanel) return;
        topContinuityPanel.classList.toggle('is-shuffling', topContinuityAnimations.size > 0);
    }

    function randomShuffleChar() {
        return TOP_CONTINUITY_SHUFFLE_CHARS[Math.floor(Math.random() * TOP_CONTINUITY_SHUFFLE_CHARS.length)] || '0';
    }

    function shuffleTowardText(text, progress) {
        const reveal = Math.floor(text.length * progress);
        return text.split('').map((ch, index) => {
            if (index < reveal) return ch;
            if (/\s/.test(ch)) return ' ';
            if (/[,%.]/.test(ch)) return ch;
            return randomShuffleChar();
        }).join('');
    }

    function setTopContinuityText(id, text, options = {}) {
        const el = document.getElementById(id);
        if (!el || text === undefined || text === null || text === '') return;

        const nextText = String(text);
        if (el.dataset.finalText === nextText) return;

        const hadFinalText = Boolean(el.dataset.finalText);
        const currentText = el.dataset.finalText || el.textContent.trim();
        const allowShuffle = options.shuffle !== false;
        const shouldShuffle = allowShuffle && hadFinalText && currentText && currentText !== '—' && currentText !== nextText && !prefersReducedMotion();
        const existingFrame = topContinuityAnimations.get(id);
        if (existingFrame) {
            cancelAnimationFrame(existingFrame);
            topContinuityAnimations.delete(id);
        }

        el.dataset.finalText = nextText;

        if (!shouldShuffle) {
            el.textContent = nextText;
            el.classList.remove('is-shuffling');
            updateTopContinuityShuffleState();
            return;
        }

        const startedAt = performance.now();
        const tick = (now) => {
            const progress = Math.min(1, (now - startedAt) / TOP_CONTINUITY_SHUFFLE_MS);
            el.textContent = progress >= 1 ? nextText : shuffleTowardText(nextText, progress);

            if (progress < 1) {
                topContinuityAnimations.set(id, requestAnimationFrame(tick));
                return;
            }

            topContinuityAnimations.delete(id);
            el.classList.remove('is-shuffling');
            updateTopContinuityShuffleState();
        };

        el.classList.add('is-shuffling');
        topContinuityAnimations.set(id, requestAnimationFrame(tick));
        updateTopContinuityShuffleState();
    }

    function setChainText(id, text) {
        const el = document.getElementById(id);
        if (el && text) el.textContent = text;
        (chainMetricAliases[id] || []).forEach((targetId) => {
            setTopContinuityText(targetId, text);
        });
    }

    if (topContinuityPanel && topContinuityHistory && topContinuityPanel.dataset.historyWired !== '1') {
        topContinuityPanel.dataset.historyWired = '1';
        topContinuityHistory.addEventListener('click', () => {
            if (window.location.hash !== '#protocol-history') {
                window.history.pushState(null, '', '#protocol-history');
            }
            openProtocolHistoryChamber();
        });
        topContinuityPanel.querySelectorAll('.top-continuity-stat[data-card-history]').forEach((pill) => {
            if (pill.dataset.topContinuityHistoryPillWired === '1') return;
            pill.dataset.topContinuityHistoryPillWired = '1';
            pill.addEventListener('click', () => {
                openCardHistoryModal(pill.dataset.cardHistory, 'all');
            });
        });
    }

    function syncChainProofMetrics() {
        setChainText('chain-uptime-bakers', chainBakersText);
        setChainText('chain-uptime-finality', chainFinalityText);
        setChainText('chain-uptime-staked', chainStakedText);
        setChainText('chain-uptime-issuance', chainIssuanceText);
    }

    // Tick the uptime counter every second — fixed-width digits
    function tickUptime() {
        const now = Date.now();
        const diff = now - LAUNCH;
        const years = Math.floor(diff / (365.25 * 86400000));
        const remAfterYears = diff - years * (365.25 * 86400000);
        const days = Math.floor(remAfterYears / 86400000);
        const hours = Math.floor((remAfterYears % 86400000) / 3600000);
        const mins = Math.floor((remAfterYears % 3600000) / 60000);
        const secs = Math.floor((remAfterYears % 60000) / 1000);
        const str = `${years}y ${days}d ${String(hours).padStart(2,'0')}h ${String(mins).padStart(2,'0')}m ${String(secs).padStart(2,'0')}s`;
        const topStr = `${years}y ${days}d ${hours}h ${mins}m`;
        // Wrap each character in a fixed-width span to prevent layout shift
        const html = str.split('').map(ch =>
            /\d/.test(ch) ? `<span class="uptime-digit">${ch}</span>` : `<span class="uptime-sep">${ch}</span>`
        ).join('');
        if (counterEl) counterEl.innerHTML = html;
        const chainCounterEl = document.getElementById('chain-uptime-counter');
        if (chainCounterEl) chainCounterEl.innerHTML = html;
        setTopContinuityText('hero-chain-uptime-counter', topStr, { shuffle: false });
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
            const resp = await fetch(`${API_URLS.octez}/chains/main/blocks/head/header`);
            if (!resp.ok) return;
            const header = await resp.json();
            const level = header.level;
            const timestamp = header.timestamp;

            if (level && level !== lastBlockLevel) {
                lastBlockLevel = level;
                lastBlockTime = new Date(timestamp).getTime();
                recentBlockTimes.push(lastBlockTime);
                if (recentBlockTimes.length > 5) recentBlockTimes.shift(); // keep last 5
                if (blockNumEl) blockNumEl.textContent = level.toLocaleString();
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
                    if (finalityEl) finalityEl.textContent = finalityText;
                    if (chainFinalityEl) chainFinalityEl.textContent = finalityText;
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

    // Poll immediately then every 6 seconds (one block time)
    pollBlock();
    setInterval(pollBlock, 6000);

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
            bakersEl.textContent = bakersText;
            setChainText('chain-uptime-bakers', bakersText);
        } else if (data.activeBakers) {
            chainBakersText = data.activeBakers.toLocaleString();
            setChainText('chain-uptime-bakers', chainBakersText);
        }
        if (data.stakedRatio) {
            const stakedText = data.stakedRatio.toFixed(1) + '%';
            chainStakedText = stakedText;
            if (stakedEl) stakedEl.textContent = stakedText;
            setChainText('chain-uptime-staked', stakedText);
        }
        if (data.currentIssuanceRate !== undefined) {
            const issuanceText = formatPercentage(Number(data.currentIssuanceRate), 2);
            chainIssuanceText = issuanceText;
            if (issuanceEl) issuanceEl.textContent = issuanceText;
            setChainText('chain-uptime-issuance', issuanceText);
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
    setupModal('objkt-info-btn', 'objkt-modal', 'objkt-modal-close');
    setupModal('leaderboard-info-btn', 'leaderboard-modal', 'leaderboard-modal-close');
    setupModal('whale-info-btn', 'whale-modal', 'whale-modal-close');
    setupModal('giants-info-btn', 'giants-modal', 'giants-modal-close');
    setupModal('about-tezos-btn', 'about-tezos-modal', 'about-tezos-modal-close');

    // Handle visibility change
    document.addEventListener('visibilitychange', handleVisibilityChange);
}

/**
 * Setup a modal
 */
function setupModal(triggerBtnId, modalId, closeBtnId) {
    const triggerBtn = document.getElementById(triggerBtnId);
    const modal = document.getElementById(modalId);
    const closeBtn = document.getElementById(closeBtnId);

    let escHandler = null;

    const openModal = () => {
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        escHandler = (e) => {
            if (e.key === 'Escape') closeModal();
        };
        document.addEventListener('keydown', escHandler);
    };

    const closeModal = () => {
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
        if (escHandler) {
            document.removeEventListener('keydown', escHandler);
            escHandler = null;
        }
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
    if (state.refreshTimer) clearInterval(state.refreshTimer);
    state.refreshTimer = setInterval(refresh, state.refreshInterval);
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
        // Refresh if it's been a while
        if (state.lastUpdate) {
            const elapsed = Date.now() - state.lastUpdate.getTime();
            if (elapsed > state.refreshInterval * 0.9) {
                refresh();
            }
        }
        // startCountdown();
    }
}

/**
 * Render protocol timeline from data (used for both cached and fresh)
 */
function renderProtocolTimeline(protocols) {
    if (!Array.isArray(protocols) || !protocols.length) return;
    state.protocols = protocols;
    updateProtocolHistoryEntryCard(protocols);

    const countEl = document.getElementById('upgrade-count');
    if (countEl) countEl.textContent = protocols.length;
    const aboutUpgrades = document.getElementById('about-upgrades');
    if (aboutUpgrades) aboutUpgrades.textContent = protocols.length;

    const currentProtocol = protocols.find(p => p.isCurrent) || protocols[protocols.length - 1];
    if (currentProtocol) {
        const headerProtocolEl = document.getElementById('header-current-protocol');
        if (headerProtocolEl) headerProtocolEl.textContent = currentProtocol.name;
    }
    renderProtocolAnthologyBoard(protocols, currentProtocol);

    const timelineEl = document.getElementById('upgrade-timeline');
    if (!timelineEl) return;
    const isHistoryChamber = Boolean(timelineEl.closest('#protocol-history-chamber-modal'));
    const displayProtocols = isHistoryChamber ? [...protocols].reverse() : protocols;
    
    // Track which years to show labels for (first protocol of each year)
    const yearSeen = new Set();
    const timelineHTML = `
        <div class="timeline-track">
            ${displayProtocols.map(p => {
                const contentious = isContentiousProtocol(p);
                const year = p.date ? new Date(p.date).getFullYear() : null;
                const showYear = year && !yearSeen.has(year);
                if (year) yearSeen.add(year);
                return `
                <div class="timeline-item ${p.isCurrent ? 'current' : ''} ${contentious ? 'contentious' : ''}" 
                     data-protocol="${escapeHtml(p.name)}">
                    ${escapeHtml(p.name[0])}
                    ${contentious ? '<span class="contention-icon">⚔</span>' : ''}
                    ${showYear ? `<span class="timeline-year">${year}</span>` : ''}
                </div>
            `}).join('')}
        </div>
    `;
    timelineEl.innerHTML = timelineHTML;
    
    // Render expanded infographic below timeline
    renderInfographic(displayProtocols, timelineEl, { currentFirst: isHistoryChamber });
    
    // Load protocol-data.json for rich tooltips, then attach JS tooltips
    initRichTooltips(protocols);
    
    // Initialize Upgrade Effect chart (toggle below timeline)
    initUpgradeEffect();
    
}

/**
 * Render expanded protocol infographic below the letter timeline
 */
async function renderInfographic(protocols, timelineEl, options = {}) {
    // Clean up old instances (timeline gets rebuilt on data refresh)
    document.querySelectorAll('.infographic-toggle').forEach(function(el) { el.remove(); });
    document.querySelectorAll('.protocol-infographic').forEach(function(el) { el.remove(); });
    
    const data = await loadProtocolData();
    const richMap = {};
    if (data?.protocols) {
        data.protocols.forEach(p => { richMap[p.name] = p; });
    }
    
    // Toggle button
    const toggleDiv = document.createElement('div');
    toggleDiv.className = 'infographic-toggle';
    toggleDiv.innerHTML = `<button class="infographic-toggle-btn protocol-timeline-toggle-btn" type="button" aria-expanded="false">View Timeline ▾</button>`;
    // Place below the upgrade count (21 UPGRADES)
    const upgradeCount = document.querySelector('.upgrade-count');
    if (upgradeCount) {
        upgradeCount.appendChild(toggleDiv);
    } else {
        timelineEl.appendChild(toggleDiv);
    }
    
    // Infographic container
    const infographic = document.createElement('div');
    infographic.className = 'protocol-infographic';
    infographic.id = 'protocol-infographic';
    
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
        
        rowsHTML += `
            <div class="infographic-row ${contentious ? 'contentious' : ''} ${isCurrent ? 'current' : ''}" 
                 style="animation-delay: ${delay}ms" data-protocol="${escapeHtml(p.name)}">
                <div class="infographic-dot"></div>
                <span class="infographic-letter">${escapeHtml(p.name[0])}</span>
                <span class="infographic-name" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</span>
                <span class="infographic-date">${escapeHtml(dateStr)}</span>
                <span class="infographic-headline">${escapeHtml(headline)}</span>
                ${contentious ? '<span class="infographic-contention">⚔</span>' : ''}
                ${tag ? `<div class="infographic-tags"><span class="infographic-tag">${escapeHtml(tag)}</span></div>` : ''}
            </div>
        `;
    });
    
    infographic.innerHTML = `<div class="infographic-inner">${rowsHTML}</div>`;
    timelineEl.appendChild(infographic);
    
    // Click on infographic rows — same behavior as clicking timeline letters
    infographic.addEventListener('click', function(e) {
        var row = e.target.closest('.infographic-row');
        if (!row) return;
        var name = row.getAttribute('data-protocol');
        if (!name) return;
        var richP = richMap[name];
        if (richP && richP.history) {
            showProtocolHistoryModal(richP.history, name);
        } else if (typeof window.captureProtocol === 'function') {
            var proto = richMap[name];
            if (proto) window.captureProtocol(proto);
        }
    });
    
    // Make rows look clickable
    infographic.querySelectorAll('.infographic-row').forEach(function(row) {
        row.style.cursor = 'pointer';
    });
    
    // Toggle logic
    const btn = toggleDiv.querySelector('.infographic-toggle-btn');
    btn.addEventListener('click', () => {
        const expanded = infographic.classList.toggle('expanded');
        btn.textContent = expanded ? 'Hide Timeline ▴' : 'View Timeline ▾';
        btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    });
}

/**
 * Rich JS-powered tooltips for protocol timeline items
 */
let _protocolDataCache = null;
async function loadProtocolData() {
    if (_protocolDataCache) return _protocolDataCache;
    try {
        const resp = await fetch('/data/protocol-data.json?v=2', { cache: 'no-store' });
        _protocolDataCache = await resp.json();
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

async function openProtocolHistoryByName(protocolName) {
    const target = String(protocolName || '').trim();
    if (!target) return false;
    const data = await loadProtocolData();
    const match = data?.protocols?.find((protocol) => protocol.name.toLowerCase() === target.toLowerCase())
        || data?.protocols?.find((protocol) => protocol.name.toLowerCase().includes(target.toLowerCase()));
    const history = protocolToHistory(match);
    if (!match || !history) return false;
    showProtocolHistoryModal(history, match.name);
    return true;
}

window.openProtocolHistoryByName = openProtocolHistoryByName;

async function initRichTooltips(protocols) {
    const data = await loadProtocolData();
    const richMap = {};
    if (data?.protocols) {
        data.protocols.forEach(p => { richMap[p.name] = p; });
    }

    // Create shared tooltip element
    let tooltipEl = document.getElementById('timeline-tooltip');
    if (!tooltipEl) {
        tooltipEl = document.createElement('div');
        tooltipEl.id = 'timeline-tooltip';
        tooltipEl.style.cssText = `
            position: fixed; z-index: 10000; pointer-events: none;
            opacity: 0; visibility: hidden;
            transition: opacity 0.2s ease, visibility 0.2s ease;
            border-radius: 10px; padding: 14px 16px;
            width: 340px; max-width: 90vw;
            font-size: 0.72rem; line-height: 1.5;
        `;
        document.body.appendChild(tooltipEl);
    }

    /** Apply theme-aware styles to the tooltip (called on each show) */
    function applyTooltipTheme(el) {
        const t = document.body.getAttribute('data-theme');
        const isMatrix = t === 'matrix', isClean = t === 'clean', isDark = t === 'dark', isBubblegum = t === 'bubblegum';
        el.style.background = isClean ? 'rgba(255, 255, 255, 0.98)' : isDark ? 'rgba(26, 26, 26, 0.98)' : isMatrix ? 'rgba(0, 10, 0, 0.98)' : isBubblegum ? 'rgba(26, 15, 34, 0.98)' : 'rgba(10, 10, 15, 0.98)';
        el.style.border = `1px solid ${isClean ? 'rgba(0, 0, 0, 0.1)' : isDark ? '#333333' : isMatrix ? 'rgba(0, 255, 0, 0.5)' : isBubblegum ? 'rgba(255, 105, 180, 0.4)' : 'rgba(0, 212, 255, 0.4)'}`;
        el.style.boxShadow = isClean ? '0 8px 32px rgba(0,0,0,0.12)' : '0 8px 32px rgba(0,0,0,0.6)';
        el.style.color = isClean ? '#1A1A2E' : isDark ? '#E8E8E8' : isMatrix ? '#00ff00' : isBubblegum ? '#F0E0F6' : 'var(--text-primary)';
    }

    const items = document.querySelectorAll('.timeline-item');
    items.forEach(item => {
        const name = item.getAttribute('data-protocol');
        const govP = protocols.find(p => p.name === name);
        const richP = richMap[name];

        item.addEventListener('mouseenter', (e) => {
            applyTooltipTheme(tooltipEl);
            const _theme = document.body.getAttribute('data-theme');
            const accent = _theme === 'clean' ? '#2563EB' : _theme === 'dark' ? '#C8C8C8' : _theme === 'matrix' ? '#00ff00' : '#00d4ff';
            const accentDim = _theme === 'clean' ? 'rgba(37,99,235,0.6)' : _theme === 'dark' ? 'rgba(200,200,200,0.6)' : _theme === 'matrix' ? 'rgba(0,255,0,0.6)' : 'rgba(0,212,255,0.6)';
            
            let html = '';
            // Title line
            const headline = richP?.headline || govP?.highlight || 'Network upgrade';
            html += `<div style="font-weight:700; color:${accent}; font-size:0.82rem; margin-bottom:4px;">${escapeHtml(name)}</div>`;
            html += `<div style="color:rgba(255,255,255,0.75); margin-bottom:6px; font-style:italic;">${escapeHtml(headline)}</div>`;
            
            // Debate
            const debate = richP?.debate || govP?.debate;
            if (debate) {
                html += `<div style="color:${accentDim}; margin-bottom:6px;">📌 ${escapeHtml(debate)}</div>`;
            }
            
            // Changes
            const changes = richP?.changes;
            if (changes && changes.length) {
                html += `<div style="margin-top:4px; color:rgba(255,255,255,0.6);">`;
                changes.forEach(c => { html += `<div style="padding-left:8px;">• ${escapeHtml(c)}</div>`; });
                html += `</div>`;
            }
            
            // Date
            if (richP?.date) {
                const d = new Date(richP.date + 'T00:00:00Z');
                const dateStr = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
                html += `<div style="margin-top:6px; color:rgba(255,255,255,0.3); font-size:0.65rem;">${dateStr}</div>`;
            }

            // "Read Full History" button for contentious protocols
            if (richP?.history) {
                html += `<div style="margin-top:8px; padding-top:8px; border-top:1px solid rgba(255,255,255,0.08);">
                    <span class="history-expand-hint" style="color:${accent}; font-size:0.68rem; cursor:pointer; opacity:0.8;">
                        ⚔ Click to read the full history →
                    </span>
                </div>`;
            }

            tooltipEl.innerHTML = html;
            tooltipEl.style.opacity = '1';
            tooltipEl.style.visibility = 'visible';
            positionTooltip(e, tooltipEl);
        });
        
        item.addEventListener('mousemove', (e) => positionTooltip(e, tooltipEl));
        
        item.addEventListener('mouseleave', () => {
            tooltipEl.style.opacity = '0';
            tooltipEl.style.visibility = 'hidden';
        });

        // Click to open full history modal for contentious protocols
        if (richP?.history) {
            item.style.cursor = 'pointer';
            item.addEventListener('click', () => {
                tooltipEl.style.opacity = '0';
                tooltipEl.style.visibility = 'hidden';
                showProtocolHistoryModal(richP.history, name);
            });
        }
    });
}

function showProtocolHistoryModal(history, protocolName) {
    const existing = document.getElementById('protocol-history-modal');
    if (existing) existing.remove();

    const _modalTheme = document.body.getAttribute('data-theme');
    const isMatrix = _modalTheme === 'matrix';
    const isClean = _modalTheme === 'clean';
    const isDark = _modalTheme === 'dark';
    const isBubblegum = _modalTheme === 'bubblegum';
    const accent = isClean ? '#2563EB' : isDark ? '#C8C8C8' : isMatrix ? '#00ff00' : isBubblegum ? '#FF69B4' : '#00d4ff';
    const accentRgb = isClean ? '37,99,235' : isDark ? '200,200,200' : isMatrix ? '0,255,0' : isBubblegum ? '255,105,180' : '0,212,255';
    const bg = isClean ? 'rgba(255, 255, 255, 0.98)' : isDark ? 'rgba(26, 26, 26, 0.98)' : isMatrix ? 'rgba(0, 8, 0, 0.98)' : isBubblegum ? 'rgba(26, 15, 34, 0.98)' : 'rgba(8, 8, 16, 0.98)';
    const borderColor = isClean ? 'rgba(0,0,0,0.1)' : isDark ? '#333333' : isMatrix ? 'rgba(0,255,0,0.3)' : isBubblegum ? 'rgba(255,105,180,0.3)' : 'rgba(0,212,255,0.3)';

    let sectionsHtml = '';
    for (const section of history.sections) {
        if (section.type === 'timeline') {
            sectionsHtml += `<h3 style="color:${accent}; font-size:1rem; margin:24px 0 12px; font-family:'Orbitron',sans-serif; letter-spacing:1px;">${escapeHtml(section.heading)}</h3>`;
            sectionsHtml += `<div class="history-timeline" style="position:relative; padding-left:24px; border-left:2px solid ${borderColor};">`;
            for (const ev of section.events) {
                const sideColor = ev.side === 'quebec' ? '#ff6b6b' : ev.side === 'qena' ? '#4ecdc4' : (isClean ? 'rgba(0,0,0,0.4)' : isDark ? 'rgba(200,200,200,0.5)' : 'rgba(255,255,255,0.5)');
                sectionsHtml += `
                    <div style="margin-bottom:16px; position:relative;">
                        <div style="position:absolute; left:-30px; top:4px; width:12px; height:12px; border-radius:50%; background:${sideColor}; box-shadow:${isClean || isDark ? 'none' : '0 0 8px ' + sideColor};"></div>
                        <div style="color:${isClean ? 'rgba(0,0,0,0.5)' : isDark ? 'rgba(232,232,232,0.4)' : 'rgba(255,255,255,0.4)'}; font-size:0.72rem; font-weight:600; margin-bottom:2px;">${escapeHtml(ev.date)}</div>
                        <div style="color:${isClean ? 'rgba(0,0,0,0.8)' : isDark ? 'rgba(232,232,232,0.85)' : 'rgba(255,255,255,0.85)'}; font-size:0.82rem; line-height:1.5;">${escapeHtml(ev.text)}</div>
                    </div>`;
            }
            sectionsHtml += `<div style="display:flex; gap:16px; margin-top:8px; font-size:0.68rem; color:${isClean ? 'rgba(0,0,0,0.5)' : isDark ? 'rgba(232,232,232,0.4)' : 'rgba(255,255,255,0.4)'};">
                <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#ff6b6b;margin-right:4px;"></span>Quebec</span>
                <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#4ecdc4;margin-right:4px;"></span>Qena</span>
            </div></div>`;
        } else if (section.type === 'versus') {
            sectionsHtml += `<h3 style="color:${accent}; font-size:1rem; margin:24px 0 12px; font-family:'Orbitron',sans-serif; letter-spacing:1px;">${escapeHtml(section.heading)}</h3>`;
            sectionsHtml += `<div class="history-versus-grid">`;
            for (const side of [section.left, section.right]) {
                const sideColor = side === section.left ? '#ff6b6b' : '#4ecdc4';
                sectionsHtml += `
                    <div style="background:${isClean ? 'rgba(0,0,0,0.02)' : isDark ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.03)'}; border:1px solid ${sideColor}30; border-radius:10px; padding:16px;">
                        <div style="color:${sideColor}; font-weight:700; font-size:0.9rem; margin-bottom:4px;">${escapeHtml(side.name)}</div>
                        <div style="color:${isClean ? 'rgba(0,0,0,0.5)' : isDark ? 'rgba(232,232,232,0.4)' : 'rgba(255,255,255,0.4)'}; font-size:0.7rem; margin-bottom:8px;">${escapeHtml(side.team)}</div>
                        <div style="color:${isClean ? 'rgba(0,0,0,0.75)' : isDark ? 'rgba(232,232,232,0.75)' : 'rgba(255,255,255,0.75)'}; font-size:0.8rem; line-height:1.5; margin-bottom:10px;">${escapeHtml(side.position)}</div>
                        <div style="border-left:3px solid ${sideColor}40; padding-left:10px; color:${isClean ? 'rgba(0,0,0,0.6)' : isDark ? 'rgba(232,232,232,0.6)' : 'rgba(255,255,255,0.6)'}; font-style:italic; font-size:0.78rem; line-height:1.5;">"${escapeHtml(side.quote)}"</div>
                    </div>`;
            }
            sectionsHtml += `</div>`;
        } else {
            sectionsHtml += `<h3 style="color:${accent}; font-size:1rem; margin:24px 0 12px; font-family:'Orbitron',sans-serif; letter-spacing:1px;">${escapeHtml(section.heading)}</h3>`;
            const paras = section.content.split('\n\n');
            for (const p of paras) {
                const textHigh = isClean ? 'rgba(0,0,0,0.75)' : isDark ? 'rgba(232,232,232,0.75)' : 'rgba(255,255,255,0.75)';
                const textMid = isClean ? 'rgba(0,0,0,0.6)' : isDark ? 'rgba(232,232,232,0.6)' : 'rgba(255,255,255,0.6)';
                const bgSubtle = isClean ? 'rgba(0,0,0,0.02)' : isDark ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.02)';
                if (p.startsWith('•') || p.startsWith('- ')) {
                    sectionsHtml += `<div style="color:${textHigh}; font-size:0.82rem; line-height:1.6; margin-bottom:6px; padding-left:12px;">${escapeHtml(p)}</div>`;
                } else if (p.startsWith('"') || p.startsWith('\u201c')) {
                    sectionsHtml += `<blockquote style="border-left:3px solid ${borderColor}; padding:10px 14px; margin:10px 0; color:${textMid}; font-style:italic; font-size:0.82rem; line-height:1.6; background:${bgSubtle}; border-radius:0 8px 8px 0;">${escapeHtml(p)}</blockquote>`;
                } else {
                    sectionsHtml += `<p style="color:${textHigh}; font-size:0.82rem; line-height:1.7; margin-bottom:12px;">${escapeHtml(p)}</p>`;
                }
            }
        }
    }

    const modal = document.createElement('div');
    modal.id = 'protocol-history-modal';
    modal.style.cssText = `
        position:fixed; inset:0; z-index:10001; display:flex; align-items:center; justify-content:center;
        background:rgba(0,0,0,0.85); backdrop-filter:blur(8px);
        opacity:0; transition:opacity 0.3s ease;
    `;
    modal.innerHTML = `
        <div class="modal-large" style="
            background:${bg}; border:1px solid ${borderColor};
            border-radius:16px; max-width:720px; width:92vw; max-height:85vh; overflow-y:auto;
            padding:32px; position:relative;
            box-shadow:0 0 60px rgba(${accentRgb},0.1), 0 20px 60px rgba(0,0,0,0.5);
        ">
            <div style="position:absolute; top:16px; right:16px; display:flex; gap:8px; z-index:10;">
                <button id="history-modal-share" title="Share this history" style="
                    background:rgba(255,255,255,0.08);
                    border:1px solid rgba(255,255,255,0.15); color:rgba(255,255,255,0.7);
                    width:36px; height:36px; border-radius:50%; cursor:pointer; font-size:18px;
                    display:flex; align-items:center; justify-content:center;
                    transition:all 0.2s;
                ">📸</button>
                <button id="history-modal-close" style="
                    background:rgba(255,255,255,0.08);
                    border:1px solid rgba(255,255,255,0.15); color:rgba(255,255,255,0.7);
                    width:36px; height:36px; border-radius:50%; cursor:pointer; font-size:20px;
                    display:flex; align-items:center; justify-content:center;
                    transition:all 0.2s;
                ">×</button>
            </div>
            <div style="font-family:'Orbitron',sans-serif; color:${accent}; font-size:1.3rem; font-weight:700;
                letter-spacing:2px; text-shadow:0 0 20px rgba(${accentRgb},0.4); margin-bottom:4px;">
                ⚔ ${escapeHtml(history.title)}
            </div>
            <div style="color:rgba(255,255,255,0.4); font-size:0.78rem; margin-bottom:20px;">${escapeHtml(history.subtitle)}</div>
            ${sectionsHtml}
        </div>
    `;
    document.body.appendChild(modal);
    requestAnimationFrame(() => { modal.style.opacity = '1'; });

    const closeModal = () => { modal.style.opacity = '0'; setTimeout(() => modal.remove(), 300); };
    modal.querySelector('#history-modal-close').addEventListener('click', closeModal);
    modal.querySelector('#history-modal-share').addEventListener('click', (e) => {
        e.stopPropagation();
        const btn = e.currentTarget;
        if (btn.disabled) return;
        btn.disabled = true;
        btn.style.opacity = '0.5';
        if (window.captureProtocolHistory) {
            window.captureProtocolHistory(protocolName).finally(() => {
                btn.disabled = false;
                btn.style.opacity = '';
            });
        }
    });
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', esc); } });
}

let protocolHistoryChamberCloseTimer = null;

function handleProtocolHistoryChamberEscape(event) {
    if (event.key === 'Escape') closeProtocolHistoryChamber();
}

function ensureProtocolHistoryChamberModal() {
    let overlay = document.getElementById('protocol-history-chamber-modal');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'protocol-history-chamber-modal';
    overlay.className = 'modal-overlay chamber-overlay protocol-history-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
        <div class="modal-content modal-large chamber-content protocol-history-content" role="dialog" aria-modal="true" aria-labelledby="protocol-history-chamber-title">
            <button class="modal-close chamber-close" aria-label="Close Protocol History Chamber" style="z-index:3">&times;</button>
            <div class="chamber-body protocol-history-body">
                <div class="chamber-loading">
                    <div class="chamber-loading-text">Opening Protocol History Chamber...</div>
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
                <h2 class="chamber-title" id="protocol-history-chamber-title">Protocol History Chamber</h2>
            </div>
            <p class="protocol-history-chamber-lede">
                The Tezos self-amendment archive: protocol lore, proposal context, impact views, and the path from Tallinn back through every prior era.
            </p>
            <div class="protocol-history-chamber-actions">
                <button class="protocol-history-chamber-link protocol-history-chamber-action" type="button" data-protocol-history-jump="timeline">View Timeline</button>
                <button class="protocol-history-chamber-link protocol-history-chamber-action" type="button" data-protocol-history-jump="impact">View Impact</button>
                <a class="protocol-history-chamber-link" href="#history">Open network charts</a>
                <button class="protocol-history-chamber-link" type="button" data-copy-hash="#protocol-history">Copy chamber link</button>
            </div>
            <div class="protocol-history-anthology-host" id="protocol-history-anthology-board" aria-live="polite">
                <div class="protocol-anthology-loading">Reading the protocol archive...</div>
            </div>
        </div>
        <div class="protocol-history-chamber-panel protocol-history-feature-panel">
            <div class="upgrade-count">
                <span class="upgrade-number" id="upgrade-count">--</span>
                <span class="upgrade-label">Upgrades</span>
            </div>
            <div class="protocol-history-feature-copy">
                <span class="feature-kicker">Self-amendment archive</span>
                <p>Start at the current operating protocol, then fold backward through individual protocol lore and impact views.</p>
            </div>
            <div class="upgrade-status" id="upgrade-status">
                <!-- Voting status will be inserted here -->
            </div>
            <div class="upgrade-timeline" id="upgrade-timeline">
                <div class="chamber-loading">
                    <div class="chamber-loading-text">Loading protocol timeline...</div>
                    <div class="chamber-loading-bar"><div class="chamber-loading-fill"></div></div>
                </div>
            </div>
        </div>
    `;
    wireProtocolHistoryChamberActions(overlay);
}

function revealProtocolHistorySection(section, attempt = 0) {
    const overlay = document.getElementById('protocol-history-chamber-modal');
    if (!overlay) return;

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
}

function closeProtocolHistoryChamber() {
    const overlay = document.getElementById('protocol-history-chamber-modal');
    if (!overlay) return;
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
    document.removeEventListener('keydown', handleProtocolHistoryChamberEscape);
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
    window.clearTimeout(protocolHistoryChamberCloseTimer);
    protocolHistoryChamberCloseTimer = window.setTimeout(() => overlay.remove(), 220);
}

async function openProtocolHistoryChamber() {
    document.getElementById('tooltip-protocol-history-entry-card')?.classList.remove('is-open');
    const overlay = ensureProtocolHistoryChamberModal();
    window.clearTimeout(protocolHistoryChamberCloseTimer);
    renderProtocolHistoryChamberShell(overlay);
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    document.addEventListener('keydown', handleProtocolHistoryChamberEscape);

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

const TEZOS_LOOP_STORAGE_KEY = 'tezos-systems-loop-aura';
const TEZOS_LOOP_AURAS = {
    holder: {
        title: 'Wallets and .tez names',
        line: 'Search accepts a raw wallet address or a .tez name. Use My Tezos when you want the dashboard to remember the account and explain its daily state.',
        query: 'my tezos',
        searchLabel: 'Try My Tezos',
        href: '#my-tezos',
        action: 'my-tezos',
        label: 'Open My Tezos'
    },
    baker: {
        title: 'Baker lookup',
        line: 'Type a baker name or address to reach operator capacity, health, Octez version status, rights, rewards, and delegation context.',
        query: 'baker',
        searchLabel: 'Search bakers',
        href: '#leaderboard',
        label: 'Open baker map'
    },
    builder: {
        title: 'Contracts, operations, and blocks',
        line: 'Paste a KT1 contract, operation hash, block hash, or level. Search opens native routes where they exist and TzKT where they do not.',
        query: 'KT1',
        searchLabel: 'Try KT1 / ops',
        href: '/widgets/builder.html',
        label: 'Grab a live widget'
    },
    collector: {
        title: 'NFT and profile lane',
        line: 'Type /nfts or a Tezos identity when Objkt activity, creator history, and collector context are the useful path.',
        query: '/nfts',
        searchLabel: 'Open NFT lane',
        href: '/hen/',
        label: 'Enter HEN'
    },
    governance: {
        title: 'Governance and protocol lore',
        line: 'Try /chamber, /health, Tallinn, or Liquidity Baking to jump into live rooms, current vote state, and protocol memory.',
        query: '/chamber',
        searchLabel: 'Search governance',
        href: '/chamber/',
        label: 'Enter the Chamber'
    },
    price: {
        title: 'Market and history context',
        line: 'Search price, /compare, /history, or cycle terms for XTZ market data, captured history, chain comparison, and issuance context.',
        query: 'price',
        searchLabel: 'Open price intel',
        href: '#price',
        label: 'Open price intel'
    }
};

function initTezosLoopConsole() {
    const consoleEl = document.getElementById('tezos-loop-console');
    const title = document.getElementById('tezos-loop-title');
    const line = document.getElementById('tezos-loop-line');
    const link = document.getElementById('tezos-loop-link');
    const search = document.getElementById('tezos-loop-search');
    if (!consoleEl || !title || !line || !link || !search) return;

    const chips = Array.from(consoleEl.querySelectorAll('.tezos-loop-chip[data-loop-aura]'));
    const cards = Array.from(consoleEl.querySelectorAll('.recruit-card[data-loop-aura]'));
    if (!chips.length || !cards.length) return;

    const getSavedAura = () => {
        try {
            return localStorage.getItem(TEZOS_LOOP_STORAGE_KEY) || '';
        } catch (_) {
            return '';
        }
    };

    const saveAura = (aura) => {
        try {
            localStorage.setItem(TEZOS_LOOP_STORAGE_KEY, aura);
        } catch (_) {}
    };

    const activate = (aura, persist = true) => {
        const profile = TEZOS_LOOP_AURAS[aura] || TEZOS_LOOP_AURAS.holder;
        consoleEl.dataset.aura = TEZOS_LOOP_AURAS[aura] ? aura : 'holder';
        title.textContent = profile.title;
        line.textContent = profile.line;
        link.href = profile.href;
        link.dataset.loopAction = profile.action || '';
        link.textContent = profile.label;
        search.dataset.heroQuery = profile.query;
        search.textContent = profile.searchLabel || `Search ${profile.query}`;
        chips.forEach((chip) => {
            const active = chip.dataset.loopAura === consoleEl.dataset.aura;
            chip.classList.toggle('active', active);
            chip.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        cards.forEach((card) => {
            card.classList.toggle('is-active', card.dataset.loopAura === consoleEl.dataset.aura);
        });
        if (persist) saveAura(consoleEl.dataset.aura);
    };

    chips.forEach((chip) => {
        chip.addEventListener('click', () => activate(chip.dataset.loopAura || 'holder'));
    });
    cards.forEach((card) => {
        card.addEventListener('click', () => activate(card.dataset.loopAura || 'holder'));
    });
    link.addEventListener('click', (event) => {
        if (link.dataset.loopAction !== 'my-tezos') return;
        const myTezosButton = document.getElementById('my-tezos-btn');
        if (!myTezosButton) return;
        event.preventDefault();
        myTezosButton.click();
    });

    activate(getSavedAura() || 'holder', false);
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
            // Update "fork-free days" badge
            const forkFreeDays = document.getElementById('fork-free-days');
            if (forkFreeDays) forkFreeDays.textContent = `${daysLive.toLocaleString()} days fork-free`;
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

async function fetchBuildMetadata() {
    try {
        const response = await fetch('version.json', { cache: 'no-store' });
        return response.ok ? response.json() : null;
    } catch (_) {
        return null;
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

renderBuildVersion();

// Collapsible sections — works on ALL section types
function initCollapsibleSections() {
    document.querySelectorAll('.section-header').forEach(header => {
        const title = header.querySelector('.section-title');
        if (!title) return;

        // Find the parent section (works for .stats-section, .my-baker-section, etc.)
        const section = header.closest('section');
        if (!section) return;

        // Find collapsible content: first sibling container after the header
        // For stats-section: .stats-grid or .stats-grid-2 or .comparison-grid
        // For my-baker-section: .my-baker-section-inner children after header
        // Generic: everything in the section after the .section-header
        const sectionId = section.id || '';
        const storageKey = sectionId ? `tezos-systems-collapsed-${sectionId}` : null;

        title.style.cursor = 'pointer';
        title.style.userSelect = 'none';

        // Add chevron
        const chevron = document.createElement('span');
        chevron.className = 'section-chevron';
        chevron.textContent = '▾';
        chevron.style.cssText = 'margin-left: 8px; font-size: 0.7em; opacity: 0.5; transition: transform 0.3s ease, opacity 0.3s ease; display: inline-block;';
        title.appendChild(chevron);

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
            if (storageKey) localStorage.setItem(storageKey, '1');
        }

        function expand() {
            section.classList.remove('collapsed');
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
            if (storageKey) localStorage.removeItem(storageKey);
        }

        title.addEventListener('mouseenter', () => { chevron.style.opacity = '1'; });
        title.addEventListener('mouseleave', () => { chevron.style.opacity = section.classList.contains('collapsed') ? '0.7' : '0.5'; });

        title.addEventListener('click', (e) => {
            // Don't collapse if clicking info button
            if (e.target.closest('.info-button')) return;
            if (section.classList.contains('collapsed')) {
                expand();
            } else {
                collapse();
            }
        });

        // Restore saved state
        if (storageKey && localStorage.getItem(storageKey) === '1') {
            // Instant collapse (no animation)
            section.classList.add('collapsed');
            getCollapsibleElements().forEach(el => {
                el.style.maxHeight = '0';
                el.style.overflow = 'hidden';
                el.style.opacity = '0';
                el.style.margin = '0';
                el.style.padding = '0';
            });
            chevron.style.transform = 'rotate(-90deg)';
            chevron.style.opacity = '0.7';
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
    // Generic dropdown setup
    function setupDropdown(gearId, dropdownId) {
        const g = document.getElementById(gearId);
        const d = document.getElementById(dropdownId);
        if (!g || !d) return;
        g.setAttribute('aria-expanded', 'false');
        g.setAttribute('aria-controls', dropdownId);
        g.addEventListener('click', (e) => {
            e.stopPropagation();
            // Close other dropdowns first
            document.querySelectorAll('.settings-dropdown.open').forEach(el => {
                if (el !== d) {
                    el.classList.remove('open');
                    const owner = document.querySelector(`[aria-controls="${el.id}"]`);
                    if (owner) owner.setAttribute('aria-expanded', 'false');
                }
            });
            d.classList.toggle('open');
            g.setAttribute('aria-expanded', d.classList.contains('open') ? 'true' : 'false');
        });
        d.addEventListener('click', (e) => e.stopPropagation());
    }

    setupDropdown('features-gear', 'features-dropdown');
    setupDropdown('settings-gear', 'settings-dropdown');

    // Close all dropdowns on outside click
    document.addEventListener('click', () => {
        document.querySelectorAll('.settings-dropdown.open').forEach(el => {
            el.classList.remove('open');
            const owner = document.querySelector(`[aria-controls="${el.id}"]`);
            if (owner) owner.setAttribute('aria-expanded', 'false');
        });
    });

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        document.querySelectorAll('.settings-dropdown.open').forEach(el => {
            el.classList.remove('open');
            const owner = document.querySelector(`[aria-controls="${el.id}"]`);
            if (owner) owner.setAttribute('aria-expanded', 'false');
        });
    });
}

function initDeepLinkAffordances() {
    const headerLinks = [
        { selector: '#leaderboard-section .section-header', hash: '#leaderboard', label: 'leaderboard' },
        { selector: '#comparison-section .section-header', hash: '#compare', label: 'chain comparison' },
        { selector: '#whale-section .section-header', hash: '#whales', label: 'whale feed' },
        { selector: '#giants-section .section-header', hash: '#giants', label: 'sleeping giants' },
        { selector: '#calculator-section .section-header', hash: '#calculator', label: 'rewards calculator' },
        { selector: '#objkt-section .section-header', hash: '#nfts', label: 'NFT profile' },
        { selector: '#price-intelligence .section-header', hash: '#price', label: 'price intelligence' },
        { selector: '#widgets-gallery .section-header', hash: '#widgets', label: 'embed builder' },
        { selector: '#chambers-section .section-header', hash: '#chambers', label: 'chambers' },
        { selector: '#consensus-section .section-header', hash: '#section=consensus', label: 'consensus stats' },
        { selector: '#economy-section .section-header', hash: '#section=economy', label: 'economy stats' },
        { selector: '#governance-section .section-header', hash: '#section=governance', label: 'governance stats' },
        { selector: '#network-activity-section .section-header', hash: '#section=network', label: 'network stats' },
        { selector: '#ecosystem-section .section-header', hash: '#section=ecosystem', label: 'ecosystem stats' },
    ];

    function makeUrl(hash) {
        const prettyRoutes = {
            '#chamber': '/chamber/',
            '#health': '/health/',
            '#tezosx': '/tezosx/',
            '#tezlink': '/tezosx/',
            '#l2chamber': '/l2chamber/',
            '#lb': '/lb/',
            '#lb-tile': '/lb/',
            '#tz4': '/tz4/',
            '#ctez': '/ctez/',
            '#ledger-flow': '/ledger-flow/'
        };
        const pretty = prettyRoutes[hash];
        if (pretty) return `${window.location.origin}${pretty}`;
        return `${window.location.origin}${window.location.pathname}${hash}`;
    }

    function markCopied(button) {
        const original = button.textContent;
        button.classList.add('copied');
        button.textContent = '✓';
        setTimeout(() => {
            button.classList.remove('copied');
            button.textContent = original || '🔗';
        }, 1200);
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
            header.appendChild(button);
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
        const giantsBtn = document.getElementById('giants-toggle');
        const now = Date.now();
        const FIVE_MIN = 5 * 60 * 1000;
        const ONE_DAY = 24 * 60 * 60 * 1000;

        // Whale pulse: any transaction in last 5 minutes
        if (whaleBtn && window.whaleTracker?.transactions?.length) {
            const latest = window.whaleTracker.transactions[0];
            const age = now - new Date(latest.timestamp).getTime();
            whaleBtn.classList.toggle('has-pulse', age < FIVE_MIN);
        }

        // Giants pulse: any awakening in last 24 hours
        if (giantsBtn && window.sleepingGiantsData?.awakenings?.length) {
            const latest = window.sleepingGiantsData.awakenings[0];
            const age = now - new Date(latest.awakenedAt).getTime();
            giantsBtn.classList.toggle('has-pulse', age < ONE_DAY);
        }
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
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').then((reg) => {
            debugLog('📦 Service Worker registered, scope:', reg.scope);
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
        banner.textContent = '📡 Offline — showing cached data';
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
//   #whales            → show whale tracker
//   #giants            → show sleeping giants
//   #history           → open history modal
//   #chamber           → open Tezos L1 Governance modal
//   #tezosx           -> open Tezos X Chamber
//   #tezlink          -> legacy alias for Tezos X Chamber
//   #l2chamber         -> open Tezos X Governance Chamber
//   #health            → open Network Health Chamber
//   #lb                → open Liquidity Baking monitor
//   #lb-tile           → scroll to the Liquidity Baking dashboard tile
//   #tz4               → open tz4 Adoption Chamber
//   #ctez              → open ctez Oven Guide
//   #protocol-history  → open Protocol History Chamber
//   #protocol=Tallinn  → open protocol lore/history
//   #theme=dark        → switch to theme
//   #section=consensus → scroll to section
// Account path shortcuts:
//   /tz1...            → open My Tezos with address
//   /name.tez          → resolve Tezos Domain and open My Tezos
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
                query: `query ResolveDomain($name: String!) { domain(name: $name) { address } }`,
                variables: { name }
            })
        });
        if (!resp.ok) return null;
        const data = await resp.json();
        const address = data?.data?.domain?.address || '';
        return isTezosAccountAddress(address) ? address : null;
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
    if (!hash) {
        const pathTarget = getMyTezosPathTarget();
        if (pathTarget) openMyTezosTarget(pathTarget);
        return;
    }

    const params = new URLSearchParams(hash);

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
        if (toggle && localStorage.getItem(STATS_VISIBLE_KEY) !== 'true') {
            toggle.click();
            return;
        }

        localStorage.setItem(STATS_VISIBLE_KEY, 'true');
        sections.forEach((section) => { section.style.display = ''; });
        toggle?.classList.add('active');
        if (toggle) toggle.title = 'Tezos Stats: ON';
    };

    const ensureChambersVisible = () => {
        const section = document.getElementById('chambers-section');
        if (!section || getComputedStyle(section).display !== 'none') return;

        const toggle = document.getElementById('chambers-toggle');
        if (toggle && localStorage.getItem(CHAMBERS_VISIBLE_KEY) === 'false') {
            toggle.click();
            return;
        }

        localStorage.setItem(CHAMBERS_VISIBLE_KEY, 'true');
        section.style.display = '';
        toggle?.classList.add('active');
        if (toggle) toggle.title = 'Chambers: ON';
    };

    const scrollToElement = (target, options = {}) => {
        if (!target) return;
        const scroll = () => target.scrollIntoView({ behavior: 'smooth', block: options.block || 'center' });
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
        const historyModal = document.getElementById('history-modal');
        if (historyModal) {
            historyModal.classList.remove('active');
            historyModal.setAttribute('aria-hidden', 'true');
        }
        document.getElementById('protocol-history-modal')?.remove();
        document.getElementById('protocol-history-chamber-modal')?.remove();
        document.removeEventListener('keydown', handleProtocolHistoryChamberEscape);

        await Promise.allSettled([
            import('../features/chamber.js').then((module) => module.closeChamber?.()),
            import('../features/tezlink.js').then((module) => module.closeTezlinkChamber?.()),
            import('../features/etherlink-governance.js').then((module) => module.closeEtherlinkGovernanceChamber?.()),
            import('../features/network-health.js').then((module) => module.closeNetworkHealthChamber?.()),
            import('../features/liquidity-baking.js').then((module) => module.closeLiquidityBakingMonitor?.()),
            import('../features/tz4-adoption.js').then((module) => module.closeTz4AdoptionChamber?.()),
            import('../features/ctez.js').then((module) => module.closeCtezChamber?.()),
            import('../features/ledger-flow.js').then((module) => module.closeLedgerFlowChamber?.())
        ]);

        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';
    };

    const openHashModal = (open, label) => {
        closeHashModalSurfaces()
            .then(open)
            .catch((error) => console.warn(label, error));
    };

    // #my-baker=tz1..., #my-baker=name.tez, or #my-baker (just open it)
    if (params.has('my-baker')) {
        const addr = params.get('my-baker');
        openMyTezosTarget(addr);
    }

    // #price
    if (params.has('price') || hash === 'price') {
        showToggleSection('price-intel-toggle', 'price-intelligence', { delay: 800 });
    }

    // #chamber / #the-chamber
    if (params.has('chamber') || hash === 'chamber' || params.has('the-chamber') || hash === 'the-chamber') {
        openHashModal(
            () => import('../features/chamber.js').then(({ openChamber }) => openChamber()),
            'Failed to open Tezos L1 Governance'
        );
    }

    // #chambers
    if (params.has('chambers') || hash === 'chambers') {
        ensureChambersVisible();
        setTimeout(() => scrollToElementAfterLayout(() => document.getElementById('chambers-section'), { block: 'start' }), 200);
    }

    // #tezosx / legacy #tezlink
    if (params.has('tezosx') || hash === 'tezosx' || params.has('tezlink') || hash === 'tezlink') {
        openHashModal(
            () => import('../features/tezlink.js').then(({ openTezlinkChamber }) => openTezlinkChamber()),
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
            () => import('../features/etherlink-governance.js').then(({ openEtherlinkGovernanceChamber }) => openEtherlinkGovernanceChamber()),
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
            () => import('../features/liquidity-baking.js').then(({ openLiquidityBakingMonitor }) => openLiquidityBakingMonitor()),
            'Failed to open Liquidity Baking monitor'
        );
    }

    // #tz4 / #tz4-adoption
    if (params.has('tz4') || hash === 'tz4' || params.has('tz4-adoption') || hash === 'tz4-adoption') {
        openHashModal(
            () => import('../features/tz4-adoption.js').then(({ openTz4AdoptionChamber }) => openTz4AdoptionChamber()),
            'Failed to open tz4 Adoption Chamber'
        );
    }

    // #ctez / legacy #ctez-oven / #ctez-guide
    if (params.has('ctez') || hash === 'ctez' || params.has('ctez-oven') || hash === 'ctez-oven' || params.has('ctez-guide') || hash === 'ctez-guide') {
        openHashModal(
            () => import('../features/ctez.js').then(({ openCtezChamber }) => openCtezChamber()),
            'Failed to open ctez End of Life'
        );
    }

    // #ledger-flow / #ledger-flow=tz1... / #flow=tz1...
    if (params.has('ledger-flow') || hash === 'ledger-flow' || params.has('flow') || hash === 'flow') {
        const target = params.get('ledger-flow') || params.get('flow') || '';
        openHashModal(
            () => import('../features/ledger-flow.js').then(({ openLedgerFlowChamber }) => openLedgerFlowChamber(target)),
            'Failed to open Ledger Flow'
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

    // #protocol-history — open Protocol History Chamber
    if (params.has('protocol-history') || hash === 'protocol-history') {
        openHashModal(
            () => openProtocolHistoryChamber(),
            'Failed to open Protocol History Chamber'
        );
    }

    // #leaderboard
    if (params.has('leaderboard') || hash === 'leaderboard') {
        showToggleSection('leaderboard-toggle', 'leaderboard-section');
    }

    // #baker=tz1... or #baker=name.tez — open baker profile modal
    if (params.has('baker')) {
        const addr = params.get('baker');
        if (addr && (addr.startsWith('tz') || addr.endsWith('.tez'))) {
            import('../features/leaderboard.js').then(mod => {
                if (mod.openBakerProfile) mod.openBakerProfile(addr);
                else console.warn('[deep-link] openBakerProfile not found in leaderboard module');
            }).catch(err => console.error('[deep-link] baker import failed:', err));
        }
    }

    // #whales
    if (params.has('whales') || hash === 'whales') {
        showToggleSection('whale-toggle', 'whale-section');
    }

    // #giants
    if (params.has('giants') || hash === 'giants') {
        showToggleSection('giants-toggle', 'giants-section');
    }

    // #nfts
    if (params.has('nfts') || hash === 'nfts') {
        showToggleSection('objkt-toggle', 'objkt-section');
    }

    // #widgets
    if (params.has('widgets') || hash === 'widgets') {
        revealStaticSection('widgets-gallery');
    }

    // #history
    if (params.has('history') || hash === 'history') {
        openHashModal(() => {
            const btn = document.getElementById('history-btn');
            if (btn) btn.click();
        }, 'Failed to open history modal');
    }

    // #protocol=Tallinn
    if (params.has('protocol')) {
        const protocolName = params.get('protocol');
        openHashModal(
            () => openProtocolHistoryByName(protocolName),
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

// ==========================================
// NETWORK HEALTH PULSE
// ==========================================
async function updateNetworkPulse() {
    // Network liveness is now shown by the Living Uptime Clock (block pulse dot)
    // This function just feeds block data as a TzKT fallback
    try {
        // Use Octez RPC instead of TzKT
        const response = await fetch(`${API_URLS.octez}/chains/main/blocks/head/header`);
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
            lbSubsidyStatus: stats.lbSubsidyDisabled ? 'Disabled' : 'Active',
            lbSubsidyDisabled: Boolean(stats.lbSubsidyDisabled),
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
            rewardAccounts: 'Reward Accounts',
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
        { key: 'h', desc: 'Open Historical Data' },
        { key: 't', desc: 'Cycle theme' },
        { key: 'c', desc: 'Toggle Rewards Calculator' },
        { key: 'k', desc: 'Open Compare Chains' },
        { key: 'l', desc: 'Toggle Baker Leaderboard' },
        { key: 'w', desc: 'Toggle Whales' },
        { key: 'g', desc: 'Toggle Giants' },
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
                document.getElementById('giants-toggle')?.click();
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
