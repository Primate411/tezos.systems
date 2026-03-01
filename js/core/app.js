/**
 * Tezos Systems - Main Application
 * Dashboard for Tezos network statistics
 */

import { fetchAllStats, fetchHeroStats, checkApiHealth } from './api.js?v=20260228c';
import { initTheme, toggleTheme, openThemePicker } from '../ui/theme.js?v=themes5';
import { flipCard, updateStatInstant, showLoading, showError } from '../ui/animations.js';
import {
    formatCount,
    formatPercentage,
    formatXTZ,
    formatLarge,
    formatTimestamp,
    formatSupply,
    escapeHtml
} from './utils.js';
import { initArcadeEffects, toggleUltraMode } from '../effects/arcade-effects.js';
import { initHistoryModal, updateSparklines, addCardHistoryButtons } from '../features/history.js';
import { initShare, initProtocolShare } from '../ui/share.js';
import { fetchProtocols, fetchVotingStatus, formatTimeRemaining, getVotingPeriodName } from '../features/governance.js';

/**
 * Governance Countdown Banner
 * Shows a prominent banner when there's an active governance vote
 */
function updateGovernanceBanner(stats, votingStatus) {
    let banner = document.getElementById('gov-countdown-banner');
    
    // Only show during exploration, promotion, or active proposal periods with proposals
    const activePeriods = ['exploration', 'promotion'];
    const hasProposal = stats?.proposal && stats.proposal !== 'None' && stats.proposal !== 'N/A';
    const isVotingActive = votingStatus && activePeriods.includes(votingStatus.kind);
    
    if (!isVotingActive && !hasProposal) {
        if (banner) { banner.remove(); }
        return;
    }
    
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'gov-countdown-banner';
        banner.className = 'gov-countdown-banner';
        // Insert after price bar
        const priceBar = document.getElementById('price-bar');
        if (priceBar) {
            priceBar.after(banner);
        } else {
            document.querySelector('.header')?.after(banner);
        }
    }
    
    const periodName = votingStatus ? getVotingPeriodName(votingStatus.kind) : 'Proposal';
    const timeLeft = votingStatus?.endTime ? formatTimeRemaining(votingStatus.endTime) : '';
    const participation = stats.participation ? `${stats.participation.toFixed(1)}% participation` : '';
    const proposal = hasProposal ? stats.proposal : '';
    
    const isUrgent = votingStatus && (votingStatus.kind === 'exploration' || votingStatus.kind === 'promotion');
    
    banner.innerHTML = `
        <span class="gov-banner-icon">${isUrgent ? '🗳️' : '📋'}</span>
        <span class="gov-banner-text">
            ${proposal ? `<strong>${proposal}</strong> — ` : ''}${periodName}${timeLeft ? ` · ${timeLeft}` : ''}${participation ? ` · ${participation}` : ''}
        </span>
    `;
    banner.className = `gov-countdown-banner ${isUrgent ? 'urgent' : ''}`;
}
import { saveStats, loadStats, saveProtocols, loadProtocols, getCacheAge, getVisitDeltas, saveVisitSnapshot } from './storage.js';
// Mobile tabs disabled — single scrollable page
// import { initTabs, updateOverviewSummary } from '../ui/tabs.js';
import { initWhaleTracker } from '../features/whales.js';
import { initSleepingGiants } from '../features/sleeping-giants.js';
import { initPriceBar } from '../features/price.js';
import { initStreak } from '../features/streak.js';
import { updatePageTitle } from '../ui/title.js';
import { REFRESH_INTERVALS, STAKING_TARGET, MAINNET_LAUNCH, API_URLS } from './config.js?v=20260228a';
import { initComparison, updateComparison } from '../features/comparison.js';
import { init as initMyBaker, refresh as refreshMyBaker } from '../features/my-baker.js';
import { initCalculator } from '../features/calculator.js';
import { initObjkt } from '../features/objkt-ui.js';
import { checkMoments, initMomentsTimeline } from '../features/moments.js';
import { initVibes } from '../effects/vibes.js?v=20260228b';
import { initChangelog } from '../features/changelog.js';
import { initLeaderboard, refreshLeaderboard } from '../features/leaderboard.js';
import { initBakerReportCard } from '../features/baker-report-card.js';
import { initMyTezos, refreshMyTezos } from '../features/my-tezos.js';
import { initUpgradeEffect } from '../features/upgrade-effect.js';
import { initCyclePulse, updateCyclePulse } from '../features/cycle-pulse.js?v=20260228p';
import { initPriceIntelligence, updatePriceIntelligence } from '../features/price-intelligence.js?v=20260228a';
import { initRewardsTracker, updateRewardsTracker, destroyRewardsTracker } from '../features/rewards-tracker.js?v=20260228k';
import { initDailyBriefing, updateDailyBriefing } from '../features/daily-briefing.js?v=20260228i';

// Protocols with major governance contention (level 3+)
const CONTENTIOUS = new Set(['Granada', 'Ithaca', 'Jakarta', 'Oxford', 'Quebec']);

// All stat card IDs (used for loading/error states)
const ALL_CARD_IDS = [
    'total-bakers', 'tz4-adoption', 'cycle-progress',
    'proposal', 'voting-period', 'participation',
    'issuance-rate', 'staking-apy', 'staking-ratio', 'delegated', 'total-supply', 'total-burned',
    'tx-volume', 'contract-calls', 'funded-accounts',
    'smart-contracts', 'tokens', 'rollups'
];

// Application state
const state = {
    currentStats: {},
    lastUpdate: null,
    refreshInterval: REFRESH_INTERVALS.main,
    refreshTimer: null,
    countdownTimer: null
};

/**
 * Initialize the dashboard
 */
async function init() {
    console.log('Initializing Tezos Systems dashboard...');

    // Safe init wrapper — one failing feature can't kill the rest
    function safe(name, fn) {
        try { fn(); } catch (e) { console.warn(`[init] ${name} failed:`, e); }
    }

    // Initialize theme
    safe('theme', initTheme);

    // Initialize arcade effects
    safe('arcadeEffects', initArcadeEffects);
    
    // Initialize share functionality
    safe('share', initShare);
    safe('protocolShare', initProtocolShare);
    
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
    safe('uptimeClock', initUptimeClock);
    safe('tezosStatsToggle', initTezosStatsToggle);

    // Upgrade section share button
    const upgradeShareBtn = document.getElementById('upgrade-share-btn');
    if (upgradeShareBtn) {
        upgradeShareBtn.addEventListener('click', async () => {
            const section = document.querySelector('.upgrade-clock-content');
            if (!section) return;
            await loadHtml2Canvas();
            const canvas = await window.html2canvas(section, { backgroundColor: '#0a0e1a', scale: 2 });
            const tweetOptions = [
                { label: '📜 Story', text: `21 protocol upgrades. Zero forks. Zero outages. 2,720+ days.\n\nTezos doesn't break. It evolves.\n\ntezos.systems` },
                { label: '⚡ Stats', text: `Tezos network pulse:\n• 21 self-amendments\n• Zero contentious forks\n• Zero outages since 2018\n• 6-second blocks\n\ntezos.systems` },
            ];
            showShareModal(canvas, tweetOptions, 'Tezos Protocol History');
        });
    }

    // Setup event listeners
    setupEventListeners();
    
    // Initialize collapsible sections
    initCollapsibleSections();

    // Initialize Smart Dock (gear dropdown)
    initSmartDock();

    // Start pulse indicator checks
    initPulseIndicators();

    // Try to load cached data for instant display
    const cachedStats = loadStats();
    const cachedProtocols = loadProtocols();
    
    // Only render cached stats if Tezos Stats is visible
    const statsWanted = localStorage.getItem(STATS_VISIBLE_KEY) === 'true';
    if (cachedStats && statsWanted) {
        console.log('⚡ Rendering cached data instantly');
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
        });
    }

    // Check API health (non-blocking)
    checkApiHealth().then(health => console.log('API Health:', health));

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

    console.log('Dashboard initialized');
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
    console.log('📊 Showing deltas since last visit:', deltas);
    
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
    
    panel.style.cssText = `
        position: fixed;
        top: 60px;
        right: 10px;
        border-radius: 8px;
        padding: 12px 16px;
        min-width: 180px;
        z-index: 1001;
        opacity: 0;
        transform: translateY(-10px);
        transition: opacity 0.3s ease, transform 0.3s ease;
    `;
    
    document.body.appendChild(panel);
    
    // Add styles for inner elements
    const style = document.createElement('style');
    style.textContent = `
        .deltas-panel .deltas-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
            font-size: 0.8rem;
        }
        .deltas-panel .deltas-close {
            background: none;
            border: none;
            cursor: pointer;
            font-size: 1.2rem;
            padding: 0;
            line-height: 1;
        }
        .deltas-panel .delta-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 4px 0;
            font-size: 0.85rem;
        }
    `;
    document.head.appendChild(style);
    
    // Animate in
    requestAnimationFrame(() => {
        panel.style.opacity = '1';
        panel.style.transform = 'translateY(0)';
    });
    
    // Close button handler
    panel.querySelector('.deltas-close').addEventListener('click', () => {
        panel.style.opacity = '0';
        panel.style.transform = 'translateY(-10px)';
        setTimeout(() => {
            panel.remove();
            style.remove();
        }, 300);
    });
    
    // Auto-hide after 10 seconds
    setTimeout(() => {
        if (panel.parentNode) {
            panel.style.opacity = '0';
            panel.style.transform = 'translateY(-10px)';
            setTimeout(() => {
                panel.remove();
                style.remove();
            }, 300);
        }
    }, 10000);
}

/**
 * Refresh data in background without showing loading states
 */
async function refreshInBackground() {
    console.log('🔄 Fetching fresh data in background...');
    
    try {
        // Always update protocol/hero data
        await updateUpgradeClock();
        const heroStats = await fetchHeroStats();
        if (window._updateUptimeClock) {
            window._updateUptimeClock({
                activeBakers: heroStats.totalBakers,
                stakedRatio: heroStats.stakingRatio,
            });
        }

        // Only fetch full stats if Tezos Stats sections are visible
        const statsVisible = localStorage.getItem(STATS_VISIBLE_KEY);
        if (statsVisible === 'true') {
            const newStats = await fetchAllStats();
            console.log('✅ Fresh stats received');
            
            const deltas = getVisitDeltas(newStats);
            if (deltas) showDeltasPanel(deltas);
            saveVisitSnapshot(newStats);
            saveStats(newStats);
            await updateStats(newStats);
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
        
        // resetCountdown();
    } catch (error) {
        console.error('Background refresh failed:', error);
        if (!state.currentStats || Object.keys(state.currentStats).length === 0) {
            showErrorState();
        }
    }
}

/**
 * Refresh all statistics (manual refresh - shows loading)
 */
async function refresh() {
    console.log('Refreshing stats...');

    try {
        const newStats = await fetchAllStats();
        console.log('Stats received:', newStats);
        
        // Save to localStorage for instant load next time
        saveStats(newStats);

        // Force full re-render by clearing lastUpdate temporarily
        const hadPriorUpdate = !!state.lastUpdate;
        state.lastUpdate = null;
        await updateStats(newStats);
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
    } catch (error) {
        console.error('Failed to refresh stats:', error);
        showErrorState();
    }
}

/**
 * Update the issuance breakdown subtitle (Protocol · LB)
 */
function updateIssuanceBreakdown(protocolRate, lbRate) {
    const el = document.getElementById('issuance-breakdown');
    if (!el) return;
    if (!protocolRate && !lbRate) {
        el.textContent = '';
        return;
    }
    const protocolStr = `${protocolRate.toFixed(2)}% Protocol`;
    const lbStr = lbRate > 0 ? ` · ${lbRate.toFixed(2)}% LB` : '';
    el.textContent = protocolStr + lbStr;
}

/**
 * Update displayed statistics
 */
async function updateStats(newStats) {
    // Calculate targets
    const tz4Target = Math.ceil(newStats.totalBakers * 0.5);
    
    // First load - update instantly
    if (!state.lastUpdate) {
        console.log('First load - updating instantly');
        
        // Consensus
        updateStatInstant('total-bakers', newStats.totalBakers, formatCount);
        updateStatInstant('tz4-adoption', newStats.tz4Percentage,
            (val) => `${val.toFixed(1)} / ${STAKING_TARGET}%`);
        const tz4Desc = document.getElementById('tz4-description');
        if (tz4Desc) tz4Desc.textContent = `${newStats.tz4Bakers} / ${tz4Target} bakers`;
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
        updateIssuanceBreakdown(newStats.protocolIssuanceRate, newStats.lbIssuanceRate);
        updateStatInstant('staking-apy', newStats.delegateAPY, 
            (val) => `${val.toFixed(1)}% / ${newStats.stakeAPY.toFixed(1)}%`);
        updateStatInstant('staking-ratio', newStats.stakingRatio, formatPercentage);
        updateStatInstant('delegated', newStats.delegatedRatio, formatPercentage);
        updateStatInstant('total-supply', newStats.totalSupply, formatSupply);
        updateStatInstant('total-burned', newStats.totalBurned, formatSupply);
        
        // Network Activity
        updateStatInstant('tx-volume', newStats.transactionVolume24h, formatLarge);
        updateStatInstant('contract-calls', newStats.contractCalls24h, formatLarge);
        updateStatInstant('funded-accounts', newStats.fundedAccounts, formatLarge);
        
        // Ecosystem
        updateStatInstant('smart-contracts', newStats.smartContracts, formatLarge);
        updateStatInstant('tokens', newStats.tokens, formatLarge);
        updateStatInstant('rollups', newStats.rollups, formatCount);

        // Feed uptime clock with baker/staking data
        if (window._updateUptimeClock) {
            window._updateUptimeClock({
                activeBakers: newStats.totalBakers,
                stakedRatio: newStats.stakingRatio,
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
            updateIssuanceBreakdown(newStats.protocolIssuanceRate, newStats.lbIssuanceRate);
        }
        if (state.currentStats.stakingRatio !== newStats.stakingRatio) {
            updates.push({ cardId: 'staking-ratio', value: newStats.stakingRatio, formatter: formatPercentage });
        }
        if (state.currentStats.transactionVolume24h !== newStats.transactionVolume24h) {
            updates.push({ cardId: 'tx-volume', value: newStats.transactionVolume24h, formatter: formatLarge });
        }

        // Apply updates with animations
        for (const update of updates) {
            const card = document.querySelector(`[data-stat="${update.cardId}"]`);
            if (card) await flipCard(card, update.value, update.formatter);
        }
        
        // Update descriptions
        const tz4Desc2 = document.getElementById('tz4-description');
        if (tz4Desc2) tz4Desc2.textContent = `${newStats.tz4Bakers} / ${tz4Target} bakers`;
        document.getElementById('cycle-description').textContent = 
            `${newStats.cycleProgress.toFixed(1)}% • ${newStats.cycleTimeRemaining}`;
    }

    // Feed uptime clock on every refresh
    if (window._updateUptimeClock) {
        window._updateUptimeClock({
            activeBakers: newStats.totalBakers,
            stakedRatio: newStats.stakingRatio,
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
    if (aboutApy) aboutApy.textContent = `~${newStats.stakeAPY.toFixed(1)}%`;

    // Update comparison section with live Tezos data
    updateComparison(state.currentStats);

    // Update new engagement features
    updateCyclePulse(state.currentStats);
    const xtzPrice = parseFloat(document.querySelector(".price-value")?.textContent?.replace(/[^0-9.]/g, "")) || 0;
    updateDailyBriefing(state.currentStats, xtzPrice);
    updateRewardsTracker(state.currentStats, xtzPrice);

    // Update page title with live stats
    updatePageTitle(state.currentStats);

    // Mobile overview summary disabled (tabs removed)
    // updateOverviewSummary(state.currentStats);

    // Update network health pulse
    updateNetworkPulse();

    // Update governance countdown banner
    try {
        const votingStatus = await fetchVotingStatus();
        updateGovernanceBanner(state.currentStats, votingStatus);
    } catch (e) { /* non-critical */ }
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

    function updateButtonState() {
        const address = localStorage.getItem(STORAGE_KEY);
        if (address) {
            btn.classList.add('connected');
            btn.classList.remove('nudge');
            btn.title = 'My Tezos — click to scroll to your dashboard';
        } else {
            btn.classList.remove('connected');
            btn.title = 'My Tezos — personalize your dashboard';
        }
    }

    btn.addEventListener('click', () => {
        const address = localStorage.getItem(STORAGE_KEY);
        const strip = document.getElementById('my-tezos-strip');

        if (address && strip) {
            // Already connected — scroll to the strip
            strip.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else if (strip) {
            // Not connected — show onboarding in the strip area
            // Trigger the onboarding by clearing dismissed state and re-showing
            localStorage.removeItem('tezos-systems-my-tezos-dismissed');
            localStorage.removeItem('tezos-systems-my-tezos-hidden');
            // Fire a custom event that my-tezos.js can listen for
            window.dispatchEvent(new CustomEvent('my-tezos-show-onboarding'));
            strip.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

    // Initial state
    updateButtonState();

    // Nudge on first visit (no address, not dismissed)
    const dismissed = localStorage.getItem('tezos-systems-my-tezos-dismissed') === '1';
    if (!localStorage.getItem(STORAGE_KEY) && !dismissed) {
        btn.classList.add('nudge');
    }
}

// ==========================================
// NAV INIT
// ==========================================
function initNavButtons() {
    // Placeholder — nav buttons removed, kept for call compatibility
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
    }

    async function loadStatsIfNeeded() {
        if (statsDataLoaded) return;
        statsDataLoaded = true;
        console.log('📊 Fetching Tezos Stats on demand...');
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
        const isVisible = stored === null ? false : stored === 'true';
        const newState = !isVisible;
        localStorage.setItem(STATS_VISIBLE_KEY, String(newState));
        updateVis(newState);
        if (newState) await loadStatsIfNeeded();
    });

    // Default OFF — only show if user explicitly enabled (lazy-load)
    const stored = localStorage.getItem(STATS_VISIBLE_KEY);
    const isVisible = stored === 'true'; // null = false
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

        if (newState && !piInitialized) {
            const piPrice = parseFloat(document.querySelector('.price-value')?.textContent?.replace(/[^0-9.]/g, '')) || 0;
            await initPriceIntelligence(state.currentStats || {}, piPrice);
            piInitialized = true;
        }
        updateVis(newState);
    });

    // Default OFF
    const stored = localStorage.getItem(PI_VISIBLE_KEY);
    const isVisible = stored === 'true';
    if (isVisible) {
        setTimeout(async () => {
            const piPrice = parseFloat(document.querySelector('.price-value')?.textContent?.replace(/[^0-9.]/g, '')) || 0;
            await initPriceIntelligence(state.currentStats || {}, piPrice);
            piInitialized = true;
            updateVis(true);
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

    if (!counterEl) return;

    const LAUNCH = new Date(MAINNET_LAUNCH).getTime();
    let lastBlockLevel = 0;
    let lastBlockTime = null;
    let recentBlockTimes = []; // last N block timestamps for finality avg

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
        // Wrap each character in a fixed-width span to prevent layout shift
        counterEl.innerHTML = str.split('').map(ch =>
            /\d/.test(ch) ? `<span class="uptime-digit">${ch}</span>` : `<span class="uptime-sep">${ch}</span>`
        ).join('');
    }

    // Tick block age
    function tickBlockAge() {
        if (!lastBlockTime) return;
        const ago = Math.floor((Date.now() - lastBlockTime) / 1000);
        if (ago < 60) {
            blockAgeEl.textContent = `${ago}s ago`;
        } else {
            blockAgeEl.textContent = `${Math.floor(ago / 60)}m ago`;
        }
        // Status based on block age
        if (pulseDot) {
            if (ago > 120) {
                pulseDot.style.color = '#ff4444';
                pulseDot.title = `Last block ${ago}s ago — possible issue`;
                pulseDot.className = 'uptime-pulse-dot stale';
            } else if (ago > 18) {
                pulseDot.style.color = '#ff4444';
                pulseDot.title = `Block ${ago}s old — slight delay`;
                pulseDot.className = 'uptime-pulse-dot stale';
            } else {
                pulseDot.style.color = '';
                pulseDot.title = 'Network healthy — blocks on schedule';
                pulseDot.className = 'uptime-pulse-dot';
            }
        }
    }

    // Start ticking
    tickUptime();
    setInterval(tickUptime, 1000);
    setInterval(tickBlockAge, 1000);

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
                blockNumEl.textContent = level.toLocaleString();

                // Update finality: Tenderbake = 2 confirmations on top of block
                // So finality ≈ 2 × avg block time
                const finalityEl = document.getElementById('uptime-finality');
                if (finalityEl && recentBlockTimes.length >= 3) {
                    const first = recentBlockTimes[0];
                    const last = recentBlockTimes[recentBlockTimes.length - 1];
                    const avgBlockTime = (last - first) / (recentBlockTimes.length - 1);
                    const finality = Math.round((avgBlockTime * 2) / 1000);
                    finalityEl.textContent = `${finality}s`;
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

    // Expose update function for baker/staking data from main refresh cycle
    window._updateUptimeClock = function(data) {
        // Block data now comes from RPC poller above — only use this for baker/staking metrics
        if (data.blockLevel && data.blockLevel !== lastBlockLevel) {
            lastBlockLevel = data.blockLevel;
            lastBlockTime = data.blockTime ? new Date(data.blockTime).getTime() : Date.now();
            blockNumEl.textContent = data.blockLevel.toLocaleString();

            if (pulseDot) {
                pulseDot.classList.remove('flash');
                void pulseDot.offsetWidth;
                pulseDot.classList.add('flash');
            }
        }
        if (data.activeBakers && bakersEl) {
            bakersEl.textContent = data.activeBakers.toLocaleString();
        }
        if (data.stakedRatio && stakedEl) {
            stakedEl.textContent = data.stakedRatio.toFixed(1) + '%';
        }
    };
}

function setupEventListeners() {
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
 * Start countdown display
 */
function startCountdown() {
    if (state.countdownTimer) clearInterval(state.countdownTimer);
    
    let remaining = state.refreshInterval / 1000;
    
    const updateCountdown = () => {
        const hours = Math.floor(remaining / 3600);
        const minutes = Math.floor((remaining % 3600) / 60);
        const seconds = remaining % 60;
        
        const display = hours > 0 
            ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
            : `${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        const el = document.getElementById('countdown');
        if (el) el.textContent = display;
        
        remaining--;
        if (remaining < 0) remaining = state.refreshInterval / 1000;
    };
    
    updateCountdown();
    state.countdownTimer = setInterval(updateCountdown, 1000);
}

/**
 * Reset countdown
 */
function resetCountdown() {
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
    const timelineEl = document.getElementById('upgrade-timeline');
    if (!timelineEl || !protocols.length) return;
    
    // Track which years to show labels for (first protocol of each year)
    const yearSeen = new Set();
    const timelineHTML = `
        <div class="timeline-track">
            ${protocols.map(p => {
                const contentious = CONTENTIOUS.has(p.name);
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
    renderInfographic(protocols, timelineEl);
    
    // Load protocol-data.json for rich tooltips, then attach JS tooltips
    initRichTooltips(protocols);
    
    // Initialize Upgrade Effect chart (toggle below timeline)
    initUpgradeEffect();
    
    // Update count
    const countEl = document.getElementById('upgrade-count');
    if (countEl) countEl.textContent = protocols.length;
    const aboutUpgrades = document.getElementById('about-upgrades');
    if (aboutUpgrades) aboutUpgrades.textContent = protocols.length;
    
    // Update current protocol name and highlight
    const currentProtocol = protocols.find(p => p.isCurrent) || protocols[protocols.length - 1];
    if (currentProtocol) {
        const protocolEl = document.getElementById('current-protocol');
        if (protocolEl) protocolEl.textContent = currentProtocol.name;
        
        const highlightEl = document.getElementById('upgrade-highlight');
        if (highlightEl) highlightEl.textContent = currentProtocol.highlight;
    }
}

/**
 * Render expanded protocol infographic below the letter timeline
 */
async function renderInfographic(protocols, timelineEl) {
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
    toggleDiv.innerHTML = `<button class="infographic-toggle-btn">View Timeline ▾</button>`;
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
    
    let rowsHTML = '';
    protocols.forEach((p, i) => {
        const contentious = CONTENTIOUS.has(p.name);
        const isCurrent = p.isCurrent || i === protocols.length - 1;
        const rich = richMap[p.name];
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
    });
}

/**
 * Rich JS-powered tooltips for protocol timeline items
 */
let _protocolDataCache = null;
async function loadProtocolData() {
    if (_protocolDataCache) return _protocolDataCache;
    try {
        const resp = await fetch('/data/protocol-data.json?v=' + Date.now());
        _protocolDataCache = await resp.json();
        return _protocolDataCache;
    } catch (e) { return null; }
}

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

/**
 * Update the Upgrade Clock section
 */
async function updateUpgradeClock() {
    try {
        const [protocols, votingStatus] = await Promise.all([
            fetchProtocols(),
            fetchVotingStatus()
        ]);
        
        // Cache protocols for next visit
        saveProtocols(protocols);
        
        // Render timeline
        renderProtocolTimeline(protocols);
        
        // Update days live (mainnet launched June 30, 2018)
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
        
        // Update voting status if in active voting
        const statusEl = document.getElementById('upgrade-status');
        if (statusEl && votingStatus) {
            if (votingStatus.kind !== 'proposal' || votingStatus.proposalsCount > 0) {
                statusEl.classList.add('active');
                
                const startTime = new Date(votingStatus.startTime);
                const endTime = new Date(votingStatus.endTime);
                const now = new Date();
                const progress = ((now - startTime) / (endTime - startTime)) * 100;
                
                statusEl.innerHTML = `
                    <div class="voting-status">
                        <div class="voting-period">
                            <span class="voting-dot"></span>
                            <span class="voting-period-name">${getVotingPeriodName(votingStatus.kind)}</span>
                        </div>
                        <div class="voting-time">${formatTimeRemaining(votingStatus.endTime)}</div>
                        <div class="voting-progress">
                            <div class="voting-progress-bar" style="width: ${Math.min(progress, 100)}%"></div>
                        </div>
                    </div>
                `;
            } else {
                statusEl.classList.remove('active');
            }
        }
        
        console.log('Upgrade clock updated');
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
function initSmartDock() {
    // Generic dropdown setup
    function setupDropdown(gearId, dropdownId) {
        const g = document.getElementById(gearId);
        const d = document.getElementById(dropdownId);
        if (!g || !d) return;
        g.addEventListener('click', (e) => {
            e.stopPropagation();
            // Close other dropdowns first
            document.querySelectorAll('.settings-dropdown.open').forEach(el => {
                if (el !== d) el.classList.remove('open');
            });
            d.classList.toggle('open');
        });
        d.addEventListener('click', (e) => e.stopPropagation());
    }

    setupDropdown('features-gear', 'features-dropdown');
    setupDropdown('settings-gear', 'settings-dropdown');

    // Close all dropdowns on outside click
    document.addEventListener('click', () => {
        document.querySelectorAll('.settings-dropdown.open').forEach(el => el.classList.remove('open'));
    });
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
            console.log('📦 Service Worker registered, scope:', reg.scope);
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
//   #calculator        → open Rewards Calculator
//   #compare           → show comparison section
//   #whales            → show whale tracker
//   #giants            → show sleeping giants
//   #history           → open history modal
//   #theme=dark        → switch to theme
//   #section=consensus → scroll to section
function applyDeepLink() {
    const hash = window.location.hash.slice(1);
    if (!hash) return;

    const params = new URLSearchParams(hash);

    // #my-baker=tz1... or #my-baker (just open it)
    if (params.has('my-baker')) {
        const addr = params.get('my-baker');
        const toggle = document.getElementById('my-baker-toggle');
        const section = document.getElementById('my-baker-section');
        if (toggle && section && !section.classList.contains('visible')) {
            toggle.click();
        }
        if (addr && addr.startsWith('tz')) {
            setTimeout(() => {
                const input = document.getElementById('my-baker-input');
                const saveBtn = document.getElementById('my-baker-save');
                if (input) { input.value = addr; }
                if (saveBtn) { saveBtn.click(); }
            }, 500);
        }
    }

    // #price
    if (params.has('price') || hash === 'price') {
        const toggle = document.getElementById('price-intel-toggle');
        if (toggle) toggle.click();
    }

    // #calculator
    if (params.has('calculator') || hash === 'calculator') {
        const toggle = document.getElementById('calc-toggle');
        const section = document.getElementById('calculator-section');
        if (toggle && section && !section.classList.contains('visible')) {
            toggle.click();
        }
    }

    // #compare or #history — scroll to history/comparison area
    if (params.has('compare') || hash === 'compare' || params.has('history') || hash === 'history') {
        setTimeout(() => {
            const timeline = document.getElementById('upgrade-clock');
            if (timeline) timeline.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 500);
    }

    // #leaderboard
    if (params.has('leaderboard') || hash === 'leaderboard') {
        const toggle = document.getElementById('leaderboard-toggle');
        const section = document.getElementById('leaderboard-section');
        if (toggle && section && !section.classList.contains('visible')) {
            toggle.click();
        }
    }

    // #whales
    if (params.has('whales') || hash === 'whales') {
        const toggle = document.getElementById('whale-toggle');
        const section = document.getElementById('whale-section');
        if (toggle && section && !section.classList.contains('visible')) {
            toggle.click();
        }
    }

    // #giants
    if (params.has('giants') || hash === 'giants') {
        const toggle = document.getElementById('giants-toggle');
        const section = document.getElementById('giants-section');
        if (toggle && section && !section.classList.contains('visible')) {
            toggle.click();
        }
    }

    // #history
    if (params.has('history') || hash === 'history') {
        const btn = document.getElementById('history-btn');
        if (btn) btn.click();
    }

    // #theme=<name>
    if (params.has('theme')) {
        const themeName = params.get('theme');
        const validThemes = ['matrix', 'dark', 'clean', 'bubblegum', 'void', 'ember', 'signal'];
        if (validThemes.includes(themeName)) {
            document.body.setAttribute('data-theme', themeName);
            localStorage.setItem('tezos-systems-theme', themeName);
        }
    }

    // #section=<id> — scroll to a section
    if (params.has('section')) {
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
        const response = await fetch(`${API_URLS.tzkt}/head`);
        if (!response.ok) return;
        const head = await response.json();

        if (window._updateUptimeClock) {
            window._updateUptimeClock({
                blockLevel: head.level,
                blockTime: head.timestamp,
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
    overlay.className = 'keyboard-help-overlay';
    overlay.innerHTML = `
        <div class="keyboard-help-card">
            <h3>📥 Export Data</h3>
            <div style="display:flex;flex-direction:column;gap:10px;margin-top:16px;">
                <button class="glass-button export-option" data-format="json">📋 JSON — All current stats</button>
                <button class="glass-button export-option" data-format="csv">📊 CSV — Spreadsheet-friendly</button>
            </div>
            <p class="keyboard-help-hint">Click to download</p>
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
            delegateAPY: stats.delegateAPY,
            stakeAPY: stats.stakeAPY,
            stakingRatio: stats.stakingRatio,
            delegatedRatio: stats.delegatedRatio,
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
            fundedAccounts: stats.fundedAccounts
        },
        ecosystem: {
            smartContracts: stats.smartContracts,
            tokens: stats.tokens,
            smartRollups: stats.rollups
        }
    };

    let blob, filename;

    if (format === 'json') {
        blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        filename = `tezos-systems-${timestamp.slice(0,10)}.json`;
    } else {
        // CSV
        const rows = [['Category', 'Metric', 'Value']];
        for (const [cat, metrics] of Object.entries(data)) {
            if (cat === 'exported' || cat === 'source') continue;
            for (const [key, val] of Object.entries(metrics)) {
                rows.push([cat, key, val]);
            }
        }
        const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
        blob = new Blob([csv], { type: 'text/csv' });
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
        { key: 'r', desc: 'Refresh data' },
        { key: 't', desc: 'Cycle theme' },
        { key: 'm', desc: 'Toggle My Baker' },
        { key: 'c', desc: 'Toggle Calculator' },
        { key: 'h', desc: 'Open History' },
        { key: 'w', desc: 'Toggle Whales' },
        { key: 'g', desc: 'Toggle Giants' },
        { key: 'k', desc: 'Toggle Compare' },
        { key: 'l', desc: 'Toggle Leaderboard' },
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
        requestAnimationFrame(() => helpOverlay.classList.add('visible'));
    }

    function hideHelp() {
        if (!helpOverlay) return;
        helpOverlay.classList.remove('visible');
        setTimeout(() => { helpOverlay?.remove(); helpOverlay = null; }, 200);
    }

    const THEMES = ['matrix', 'dark', 'clean', 'bubblegum', 'void', 'ember', 'signal'];

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
                document.body.setAttribute('data-theme', next);
                localStorage.setItem('tezos-systems-theme', next);
                break;
            }
            case 'm': {
                e.preventDefault();
                document.getElementById('my-baker-toggle')?.click();
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
                document.getElementById('comparison-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
