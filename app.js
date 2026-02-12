/**
 * Tezos Systems - Main Application
 * Dashboard for Tezos network statistics
 */

import { fetchAllStats, checkApiHealth } from './api.js';
import { initTheme, toggleTheme } from './theme.js?v=themes2';
import { flipCard, updateStatInstant, showLoading, showError } from './animations.js';
import {
    formatCount,
    formatPercentage,
    formatXTZ,
    formatLarge,
    formatTimestamp,
    formatSupply,
    escapeHtml
} from './utils.js';
import { initArcadeEffects, toggleUltraMode } from './arcade-effects.js';
import { initHistoryModal, updateSparklines } from './history.js';
import { initShare, initProtocolShare } from './share.js';
import { fetchProtocols, fetchVotingStatus, formatTimeRemaining, getVotingPeriodName } from './governance.js';
import { saveStats, loadStats, saveProtocols, loadProtocols, getCacheAge, getVisitDeltas, saveVisitSnapshot } from './storage.js';
import { initTabs } from './tabs.js';
import { initWhaleTracker } from './whales.js';
import { initSleepingGiants } from './sleeping-giants.js';
import { initPriceBar } from './price.js';
import { initStreak } from './streak.js';
import { updatePageTitle } from './title.js';
import { REFRESH_INTERVALS, STAKING_TARGET, MAINNET_LAUNCH } from './config.js';
import { initComparison, updateComparison } from './comparison.js';
import { init as initMyBaker, refresh as refreshMyBaker } from './my-baker.js';
import { initCalculator } from './calculator.js';
import { initObjkt } from './objkt-ui.js';

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

    // Initialize theme
    initTheme();

    // Initialize arcade effects
    initArcadeEffects();
    
    // Initialize share functionality
    initShare();
    initProtocolShare();
    
    // Initialize mobile tabs
    initTabs();
    
    // Initialize whale tracker
    initWhaleTracker();
    
    // Initialize sleeping giants
    initSleepingGiants();

    // Initialize price bar
    initPriceBar();

    // Initialize visit streak
    initStreak();

    // Initialize My Baker
    initMyBaker();

    // Initialize Rewards Calculator
    initCalculator();
    initObjkt();
    initComparisonToggle();

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
    
    if (cachedStats) {
        console.log('⚡ Rendering cached data instantly');
        await updateStats(cachedStats);
        // updateStats already sets state.currentStats, just set lastUpdate
        state.lastUpdate = new Date(); // Will be corrected after fresh fetch
        updateLastRefreshTime();
        
        // Show cache indicator briefly
        const cacheAge = getCacheAge();
        if (cacheAge) {
            showCacheIndicator(cacheAge);
        }
    } else {
        showAllLoading();
    }
    
    // Load cached protocols for instant timeline
    if (cachedProtocols) {
        renderProtocolTimeline(cachedProtocols);
    }

    // Check API health (non-blocking)
    checkApiHealth().then(health => console.log('API Health:', health));

    // Fetch fresh data in background
    refreshInBackground();

    // Initialize history features
    initHistoryModal();
    updateSparklines(); // Don't await - let it load in background

    // Setup sparkline refresh interval
    setInterval(updateSparklines, REFRESH_INTERVALS.sparkline);

    // Setup refresh interval
    startRefreshTimer();

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
        background: var(--color-surface, rgba(15, 15, 25, 0.95));
        border: 1px solid var(--color-border, rgba(255,255,255,0.1));
        border-radius: 8px;
        padding: 12px 16px;
        min-width: 180px;
        z-index: 1001;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
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
            color: var(--color-text-secondary, #888);
        }
        .deltas-panel .deltas-close {
            background: none;
            border: none;
            color: var(--color-text-secondary, #888);
            cursor: pointer;
            font-size: 1.2rem;
            padding: 0;
            line-height: 1;
        }
        .deltas-panel .deltas-close:hover {
            color: var(--color-text, #fff);
        }
        .deltas-panel .delta-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 4px 0;
            font-size: 0.85rem;
        }
        .deltas-panel .delta-label {
            color: var(--color-text, #fff);
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
        const newStats = await fetchAllStats();
        console.log('✅ Fresh stats received');
        
        // Check for deltas from last visit BEFORE saving new snapshot
        const deltas = getVisitDeltas(newStats);
        if (deltas) {
            showDeltasPanel(deltas);
        }
        
        // Save visit snapshot for next time
        saveVisitSnapshot(newStats);
        
        // Save to localStorage for next visit
        saveStats(newStats);
        
        // Update display (will animate changes if different from cached)
        await updateStats(newStats);
        state.lastUpdate = new Date();
        updateLastRefreshTime();
        
        // Also refresh protocol data
        await updateUpgradeClock();
        
        // Refresh My Baker data
        refreshMyBaker();
        
        resetCountdown();
    } catch (error) {
        console.error('Background refresh failed:', error);
        // Don't show error state if we have cached data
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
        resetCountdown();
        refreshMyBaker();
    } catch (error) {
        console.error('Failed to refresh stats:', error);
        showErrorState();
    }
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

    // Store current stats
    state.currentStats = { ...newStats };

    // Update about modal with live data
    const aboutApy = document.getElementById('about-apy');
    if (aboutApy) aboutApy.textContent = `~${newStats.stakeAPY.toFixed(1)}%`;

    // Update comparison section with live Tezos data
    updateComparison(state.currentStats);

    // Update page title with live stats
    updatePageTitle(state.currentStats);
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

const COMPARISON_VISIBLE_KEY = 'tezos-systems-comparison-visible';

function initComparisonToggle() {
    const section = document.getElementById('comparison-section');
    const toggleBtn = document.getElementById('comparison-toggle');
    if (!section || !toggleBtn) return;

    function updateVis(isVisible) {
        section.classList.toggle('visible', isVisible);
        toggleBtn.classList.toggle('active', isVisible);
        toggleBtn.title = `Compare: ${isVisible ? 'ON' : 'OFF'}`;
    }

    toggleBtn.addEventListener('click', () => {
        const isVisible = localStorage.getItem(COMPARISON_VISIBLE_KEY) === 'true';
        const newState = !isVisible;
        localStorage.setItem(COMPARISON_VISIBLE_KEY, String(newState));
        updateVis(newState);
        if (newState) bringToTop('comparison-section');
    });

    // Default off
    const isVisible = localStorage.getItem(COMPARISON_VISIBLE_KEY) === 'true';
    updateVis(isVisible);
}

function setupEventListeners() {
    // Theme toggle
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
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
    setupModal('consensus-info-btn', 'consensus-modal', 'consensus-modal-close');
    setupModal('governance-info-btn', 'governance-modal', 'governance-modal-close');
    setupModal('economy-info-btn', 'economy-modal', 'economy-modal-close');
    setupModal('network-info-btn', 'network-modal', 'network-modal-close');
    setupModal('ecosystem-info-btn', 'ecosystem-modal', 'ecosystem-modal-close');
    setupModal('comparison-info-btn', 'comparison-modal', 'comparison-modal-close');
    setupModal('my-baker-info-btn', 'my-baker-modal', 'my-baker-modal-close');
    setupModal('calc-info-btn', 'calc-modal', 'calc-modal-close');
    setupModal('objkt-info-btn', 'objkt-modal', 'objkt-modal-close');
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
    startCountdown();
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
    startCountdown();
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
        startCountdown();
    }
}

/**
 * Render protocol timeline from data (used for both cached and fresh)
 */
function renderProtocolTimeline(protocols) {
    const timelineEl = document.getElementById('upgrade-timeline');
    if (!timelineEl || !protocols.length) return;
    
    const timelineHTML = `
        <div class="timeline-track">
            ${protocols.map(p => {
                const contentious = CONTENTIOUS.has(p.name);
                return `
                <div class="timeline-item ${p.isCurrent ? 'current' : ''} ${contentious ? 'contentious' : ''}" 
                     data-protocol="${escapeHtml(p.name)}">
                    ${escapeHtml(p.name[0])}
                    ${contentious ? '<span class="contention-icon">⚔</span>' : ''}
                </div>
            `}).join('')}
        </div>
    `;
    timelineEl.innerHTML = timelineHTML;
    
    // Render expanded infographic below timeline
    renderInfographic(protocols, timelineEl);
    
    // Load protocol-data.json for rich tooltips, then attach JS tooltips
    initRichTooltips(protocols);
    
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
    toggleDiv.innerHTML = `<button class="infographic-toggle-btn">View Full Timeline ▾</button>`;
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
        btn.textContent = expanded ? 'Hide Timeline ▴' : 'View Full Timeline ▾';
    });
}

/**
 * Rich JS-powered tooltips for protocol timeline items
 */
let _protocolDataCache = null;
async function loadProtocolData() {
    if (_protocolDataCache) return _protocolDataCache;
    try {
        const resp = await fetch('protocol-data.json?v=' + Date.now());
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
        const isMatrix = document.body.getAttribute('data-theme') === 'matrix';
        tooltipEl.style.cssText = `
            position: fixed; z-index: 10000; pointer-events: none;
            opacity: 0; visibility: hidden;
            transition: opacity 0.2s ease, visibility 0.2s ease;
            background: ${isMatrix ? 'rgba(0, 10, 0, 0.98)' : 'rgba(10, 10, 15, 0.98)'};
            border: 1px solid ${isMatrix ? 'rgba(0, 255, 0, 0.5)' : 'rgba(0, 212, 255, 0.4)'};
            border-radius: 10px; padding: 14px 16px;
            width: 340px; max-width: 90vw;
            box-shadow: 0 8px 32px rgba(0,0,0,0.6);
            font-size: 0.72rem; line-height: 1.5;
            color: ${isMatrix ? '#00ff00' : 'var(--text-primary)'};
        `;
        document.body.appendChild(tooltipEl);
    }

    const items = document.querySelectorAll('.timeline-item');
    items.forEach(item => {
        const name = item.getAttribute('data-protocol');
        const govP = protocols.find(p => p.name === name);
        const richP = richMap[name];

        item.addEventListener('mouseenter', (e) => {
            const accent = document.body.getAttribute('data-theme') === 'matrix' ? '#00ff00' : '#00d4ff';
            const accentDim = document.body.getAttribute('data-theme') === 'matrix' ? 'rgba(0,255,0,0.6)' : 'rgba(0,212,255,0.6)';
            
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

    const isMatrix = document.body.getAttribute('data-theme') === 'matrix';
    const accent = isMatrix ? '#00ff00' : '#00d4ff';
    const accentRgb = isMatrix ? '0,255,0' : '0,212,255';
    const bg = isMatrix ? 'rgba(0, 8, 0, 0.98)' : 'rgba(8, 8, 16, 0.98)';
    const borderColor = isMatrix ? 'rgba(0,255,0,0.3)' : 'rgba(0,212,255,0.3)';

    let sectionsHtml = '';
    for (const section of history.sections) {
        if (section.type === 'timeline') {
            sectionsHtml += `<h3 style="color:${accent}; font-size:1rem; margin:24px 0 12px; font-family:'Orbitron',sans-serif; letter-spacing:1px;">${section.heading}</h3>`;
            sectionsHtml += `<div class="history-timeline" style="position:relative; padding-left:24px; border-left:2px solid ${borderColor};">`;
            for (const ev of section.events) {
                const sideColor = ev.side === 'quebec' ? '#ff6b6b' : ev.side === 'qena' ? '#4ecdc4' : 'rgba(255,255,255,0.5)';
                sectionsHtml += `
                    <div style="margin-bottom:16px; position:relative;">
                        <div style="position:absolute; left:-30px; top:4px; width:12px; height:12px; border-radius:50%; background:${sideColor}; box-shadow:0 0 8px ${sideColor};"></div>
                        <div style="color:rgba(255,255,255,0.4); font-size:0.72rem; font-weight:600; margin-bottom:2px;">${ev.date}</div>
                        <div style="color:rgba(255,255,255,0.85); font-size:0.82rem; line-height:1.5;">${ev.text}</div>
                    </div>`;
            }
            sectionsHtml += `<div style="display:flex; gap:16px; margin-top:8px; font-size:0.68rem; color:rgba(255,255,255,0.4);">
                <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#ff6b6b;margin-right:4px;"></span>Quebec</span>
                <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#4ecdc4;margin-right:4px;"></span>Qena</span>
            </div></div>`;
        } else if (section.type === 'versus') {
            sectionsHtml += `<h3 style="color:${accent}; font-size:1rem; margin:24px 0 12px; font-family:'Orbitron',sans-serif; letter-spacing:1px;">${section.heading}</h3>`;
            sectionsHtml += `<div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">`;
            for (const side of [section.left, section.right]) {
                const sideColor = side === section.left ? '#ff6b6b' : '#4ecdc4';
                sectionsHtml += `
                    <div style="background:rgba(255,255,255,0.03); border:1px solid ${sideColor}30; border-radius:10px; padding:16px;">
                        <div style="color:${sideColor}; font-weight:700; font-size:0.9rem; margin-bottom:4px;">${side.name}</div>
                        <div style="color:rgba(255,255,255,0.4); font-size:0.7rem; margin-bottom:8px;">${side.team}</div>
                        <div style="color:rgba(255,255,255,0.75); font-size:0.8rem; line-height:1.5; margin-bottom:10px;">${side.position}</div>
                        <div style="border-left:3px solid ${sideColor}40; padding-left:10px; color:rgba(255,255,255,0.6); font-style:italic; font-size:0.78rem; line-height:1.5;">"${side.quote}"</div>
                    </div>`;
            }
            sectionsHtml += `</div>`;
        } else {
            sectionsHtml += `<h3 style="color:${accent}; font-size:1rem; margin:24px 0 12px; font-family:'Orbitron',sans-serif; letter-spacing:1px;">${section.heading}</h3>`;
            const paras = section.content.split('\n\n');
            for (const p of paras) {
                if (p.startsWith('•') || p.startsWith('- ')) {
                    sectionsHtml += `<div style="color:rgba(255,255,255,0.75); font-size:0.82rem; line-height:1.6; margin-bottom:6px; padding-left:12px;">${p}</div>`;
                } else if (p.startsWith('"') || p.startsWith('\u201c')) {
                    sectionsHtml += `<blockquote style="border-left:3px solid ${borderColor}; padding:10px 14px; margin:10px 0; color:rgba(255,255,255,0.6); font-style:italic; font-size:0.82rem; line-height:1.6; background:rgba(255,255,255,0.02); border-radius:0 8px 8px 0;">${p}</blockquote>`;
                } else {
                    sectionsHtml += `<p style="color:rgba(255,255,255,0.75); font-size:0.82rem; line-height:1.7; margin-bottom:12px;">${p}</p>`;
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
                ⚔ ${history.title}
            </div>
            <div style="color:rgba(255,255,255,0.4); font-size:0.78rem; margin-bottom:20px;">${history.subtitle}</div>
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

    setupDropdown('settings-gear', 'settings-dropdown');
    setupDropdown('analytics-gear', 'analytics-dropdown');

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
