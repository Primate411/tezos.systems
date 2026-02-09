/**
 * Tezos Systems - Main Application
 * Dashboard for Tezos network statistics
 */

import { fetchAllStats, checkApiHealth } from './api.js';
import { initTheme, toggleTheme } from './theme.js';
import { flipCard, updateStatInstant, showLoading, showError } from './animations.js';
import {
    formatCount,
    formatPercentage,
    formatXTZ,
    formatLarge,
    formatTimestamp,
    formatSupply
} from './utils.js';
import { initArcadeEffects, toggleUltraMode } from './arcade-effects.js';
import { initHistoryModal, updateSparklines } from './history.js';

// Application state
const state = {
    currentStats: {},
    lastUpdate: null,
    refreshInterval: 7200000, // 2 hours in milliseconds
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

    // Setup event listeners
    setupEventListeners();

    // Check API health
    const health = await checkApiHealth();
    console.log('API Health:', health);

    // Initial data load
    await refresh();

    // Initialize history features
    initHistoryModal();
    await updateSparklines();

    // Setup sparkline refresh interval (every 10 minutes)
    setInterval(updateSparklines, 600000);

    // Setup refresh interval
    startRefreshTimer();

    console.log('Dashboard initialized');
}

/**
 * Refresh all statistics
 */
async function refresh() {
    console.log('Refreshing stats...');
    showAllLoading();

    try {
        const newStats = await fetchAllStats();
        console.log('Stats received:', newStats);
        await updateStats(newStats);
        state.lastUpdate = new Date();
        updateLastRefreshTime();
        resetCountdown();
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
            (val) => `${val.toFixed(1)} / 50%`);
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
                formatter: (val) => `${val.toFixed(1)} / 50%`
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
}

/**
 * Show loading state on all cards
 */
function showAllLoading() {
    const cards = [
        'total-bakers', 'tz4-adoption', 'cycle-progress',
        'proposal', 'voting-period', 'participation',
        'issuance-rate', 'staking-apy', 'staking-ratio', 'delegated', 'total-supply', 'total-burned',
        'tx-volume', 'contract-calls', 'funded-accounts',
        'smart-contracts', 'tokens', 'rollups'
    ];
    cards.forEach(id => showLoading(id));
}

/**
 * Show error state
 */
function showErrorState() {
    const cards = [
        'total-bakers', 'tz4-adoption', 'cycle-progress',
        'proposal', 'voting-period', 'participation',
        'issuance-rate', 'staking-apy', 'staking-ratio', 'delegated', 'total-supply', 'total-burned',
        'tx-volume', 'contract-calls', 'funded-accounts',
        'smart-contracts', 'tokens', 'rollups'
    ];
    cards.forEach(id => showError(id, 'Error'));
}

/**
 * Setup event listeners
 */
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

    // Ultra mode toggle
    const ultraToggle = document.getElementById('ultra-toggle');
    if (ultraToggle) {
        // Set initial state from localStorage
        if (localStorage.getItem('ultraMode') === 'true') {
            ultraToggle.title = 'Ultra mode: ON';
            ultraToggle.classList.add('active');
        }
        ultraToggle.addEventListener('click', () => {
            const isOn = toggleUltraMode();
            ultraToggle.title = `Ultra mode: ${isOn ? 'ON' : 'OFF'}`;
            ultraToggle.classList.toggle('active', isOn);
        });
    }

    // Setup modals
    setupModal('consensus-info-btn', 'consensus-modal', 'consensus-modal-close');
    setupModal('governance-info-btn', 'governance-modal', 'governance-modal-close');
    setupModal('economy-info-btn', 'economy-modal', 'economy-modal-close');
    setupModal('network-info-btn', 'network-modal', 'network-modal-close');
    setupModal('ecosystem-info-btn', 'ecosystem-modal', 'ecosystem-modal-close');

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

    const openModal = () => {
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
    };

    const closeModal = () => {
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
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

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.classList.contains('active')) {
                closeModal();
            }
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

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Expose refresh function globally
window.TezosStats = { refresh };
