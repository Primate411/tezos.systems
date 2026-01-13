/**
 * Main application orchestration
 * Coordinates theme, animations, data fetching, and auto-refresh
 */

import { fetchAllStats, checkHealth } from './api.js';
import { initTheme, toggleTheme } from './theme.js';
import {
    updateStatWithAnimation,
    updateStatsWithStagger,
    updateStatInstant,
    showLoading,
    showError,
    isAnimating
} from './animations.js';
import {
    formatCount,
    formatPercentage,
    formatXTZ,
    formatLarge,
    formatTimestamp
} from './utils.js';

// Application state
const state = {
    rpcEndpoint: 'tzkt',
    currentStats: {},
    lastUpdate: null,
    refreshInterval: 18000, // 18 seconds in milliseconds
    countdownInterval: null,
    updateInterval: null,
    isUpdating: false
};

/**
 * Initialize application
 */
async function init() {
    console.log('Initializing Tezos Statistics Dashboard...');

    // Initialize theme system
    initTheme();

    // Setup event listeners
    setupEventListeners();

    // Show loading states
    showAllLoading();

    // Check API health
    const health = await checkHealth();
    console.log('API Health:', health);

    // Initial data fetch
    await updateStats();

    // Start auto-refresh
    startAutoRefresh();

    console.log('Dashboard initialized successfully');
}

/**
 * Setup event listeners for UI controls
 */
function setupEventListeners() {
    // Theme toggle button
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }

    // RPC endpoint selector
    const rpcSelector = document.getElementById('rpc-selector');
    if (rpcSelector) {
        rpcSelector.addEventListener('change', handleRpcChange);
    }

    // Handle visibility change (pause when tab is hidden)
    document.addEventListener('visibilitychange', handleVisibilityChange);
}

/**
 * Handle RPC endpoint change
 * @param {Event} event - Change event
 */
function handleRpcChange(event) {
    const newEndpoint = event.target.value;
    console.log(`Switching to ${newEndpoint} endpoint...`);

    state.rpcEndpoint = newEndpoint;

    // Immediately fetch new data
    showAllLoading();
    updateStats();
}

/**
 * Handle visibility change (pause/resume when tab hidden/visible)
 */
function handleVisibilityChange() {
    if (document.hidden) {
        console.log('Tab hidden - pausing auto-refresh');
        stopAutoRefresh();
    } else {
        console.log('Tab visible - resuming auto-refresh');
        updateStats();
        startAutoRefresh();
    }
}

/**
 * Show loading state on all cards
 */
function showAllLoading() {
    showLoading('total-bakers');
    showLoading('tz4-bakers');
    showLoading('tz4-adoption');
    showLoading('issuance-rate');
    showLoading('tx-volume');
}

/**
 * Update all statistics
 */
async function updateStats() {
    // Prevent overlapping updates
    if (state.isUpdating) {
        console.log('Update already in progress, skipping...');
        return;
    }

    state.isUpdating = true;

    try {
        console.log('Fetching latest statistics...');

        // Fetch all stats
        const newStats = await fetchAllStats();

        console.log('Stats received:', newStats);

        // Prepare updates
        const updates = [];

        // Check each stat and add to updates if changed
        if (state.currentStats.totalBakers !== newStats.totalBakers) {
            updates.push({
                cardId: 'total-bakers',
                value: newStats.totalBakers,
                formatter: formatCount
            });
        }

        if (state.currentStats.tz4Bakers !== newStats.tz4Bakers) {
            updates.push({
                cardId: 'tz4-bakers',
                value: newStats.tz4Bakers,
                formatter: formatCount
            });
        }

        if (state.currentStats.tz4Percentage !== newStats.tz4Percentage) {
            updates.push({
                cardId: 'tz4-adoption',
                value: newStats.tz4Percentage,
                formatter: formatPercentage
            });
        }

        if (state.currentStats.currentIssuanceRate !== newStats.currentIssuanceRate) {
            updates.push({
                cardId: 'issuance-rate',
                value: newStats.currentIssuanceRate,
                formatter: formatPercentage
            });
        }

        if (state.currentStats.transactionVolume24h !== newStats.transactionVolume24h) {
            updates.push({
                cardId: 'tx-volume',
                value: newStats.transactionVolume24h,
                formatter: formatLarge
            });
        }

        // If first load, update instantly without animation
        if (!state.lastUpdate) {
            console.log('First load - updating instantly');
            updateStatInstant('total-bakers', newStats.totalBakers, formatCount);
            updateStatInstant('tz4-bakers', newStats.tz4Bakers, formatCount);
            updateStatInstant('tz4-adoption', newStats.tz4Percentage, formatPercentage);
            updateStatInstant('issuance-rate', newStats.currentIssuanceRate, formatPercentage);
            updateStatInstant('tx-volume', newStats.transactionVolume24h, formatLarge);
        } else if (updates.length > 0) {
            // Animate changes
            console.log(`Animating ${updates.length} changed stats`);
            await updateStatsWithStagger(updates);
        } else {
            console.log('No changes detected');
        }

        // Update state
        state.currentStats = newStats;
        state.lastUpdate = new Date();

        // Update last update time
        updateLastUpdateTime();

    } catch (error) {
        console.error('Failed to update stats:', error);
        showErrorState(error);
    } finally {
        state.isUpdating = false;
    }
}

/**
 * Update last update timestamp display
 */
function updateLastUpdateTime() {
    const lastUpdateEl = document.getElementById('last-update');
    if (lastUpdateEl && state.lastUpdate) {
        lastUpdateEl.textContent = formatTimestamp(state.lastUpdate);
    }
}

/**
 * Show error state
 * @param {Error} error - The error that occurred
 */
function showErrorState(error) {
    const footer = document.querySelector('.footer');

    // Remove any existing error message
    const existingError = footer.querySelector('.error-message');
    if (existingError) {
        existingError.remove();
    }

    // Add new error message
    const errorMsg = document.createElement('p');
    errorMsg.className = 'error-message';
    errorMsg.textContent = `Failed to fetch data: ${error.message}`;
    footer.appendChild(errorMsg);

    // Show error on cards
    showError('total-bakers', 'Error');
    showError('tz4-bakers', 'Error');
    showError('tz4-adoption', 'Error');
    showError('issuance-rate', 'Error');
    showError('tx-volume', 'Error');

    // Auto-remove error message after 5 seconds
    setTimeout(() => {
        if (errorMsg.parentNode) {
            errorMsg.remove();
        }
    }, 5000);
}

/**
 * Start auto-refresh timer
 */
function startAutoRefresh() {
    // Clear any existing intervals
    stopAutoRefresh();

    console.log(`Starting auto-refresh (every ${state.refreshInterval / 1000}s)`);

    // Main update interval
    state.updateInterval = setInterval(() => {
        updateStats();
    }, state.refreshInterval);

    // Countdown timer
    startCountdown();
}

/**
 * Stop auto-refresh timer
 */
function stopAutoRefresh() {
    if (state.updateInterval) {
        clearInterval(state.updateInterval);
        state.updateInterval = null;
    }

    if (state.countdownInterval) {
        clearInterval(state.countdownInterval);
        state.countdownInterval = null;
    }
}

/**
 * Start countdown timer
 */
function startCountdown() {
    // Clear existing countdown
    if (state.countdownInterval) {
        clearInterval(state.countdownInterval);
    }

    let seconds = state.refreshInterval / 1000;
    const countdownEl = document.getElementById('countdown');

    // Update immediately
    if (countdownEl) {
        countdownEl.textContent = `${seconds}s`;
    }

    // Update every second
    state.countdownInterval = setInterval(() => {
        seconds--;

        if (seconds <= 0) {
            seconds = state.refreshInterval / 1000;
        }

        if (countdownEl) {
            countdownEl.textContent = `${seconds}s`;
        }
    }, 1000);
}

/**
 * Manually trigger update
 */
export function refresh() {
    console.log('Manual refresh triggered');
    updateStats();
    startCountdown();
}

/**
 * Get current application state
 * @returns {Object} Current state
 */
export function getState() {
    return { ...state };
}

/**
 * Update refresh interval
 * @param {number} intervalMs - New interval in milliseconds
 */
export function setRefreshInterval(intervalMs) {
    if (intervalMs < 1000) {
        console.warn('Refresh interval too short, using minimum 1000ms');
        intervalMs = 1000;
    }

    state.refreshInterval = intervalMs;
    console.log(`Refresh interval updated to ${intervalMs}ms`);

    // Restart auto-refresh with new interval
    startAutoRefresh();
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Export for debugging
window.TezosStats = {
    refresh,
    getState,
    setRefreshInterval,
    checkHealth
};
