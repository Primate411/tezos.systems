/**
 * Sleeping Giants - Dormant Whale Awakening Tracker
 * Tracks large wallets that have been dormant and alerts when they awaken
 */

// Configuration
const CONFIG = {
    minBalance: 1000000 * 1e6,  // 1M XTZ minimum (in mutez)
    minDormantDays: 365,        // 1 year minimum dormancy
    maxGiants: 25,              // Top 25 sleeping giants
    pollInterval: 300000,       // 5 minutes
    apiBase: 'https://api.tzkt.io/v1'
};

// State
let giants = [];
let awakenings = [];
let pollTimer = null;
let isEnabled = false;
let notificationsEnabled = false;

const STORAGE_KEY = 'tezos-systems-giants-enabled';
const AWAKENINGS_KEY = 'tezos-systems-awakenings';
const MAX_STORED_AWAKENINGS = 10;

/**
 * Load stored awakenings from localStorage
 */
function loadStoredAwakenings() {
    try {
        const stored = localStorage.getItem(AWAKENINGS_KEY);
        if (stored) {
            awakenings = JSON.parse(stored);
        }
    } catch (e) {
        awakenings = [];
    }
}

/**
 * Save awakenings to localStorage
 */
function saveAwakenings() {
    try {
        // Keep only the most recent
        const toStore = awakenings.slice(0, MAX_STORED_AWAKENINGS);
        localStorage.setItem(AWAKENINGS_KEY, JSON.stringify(toStore));
    } catch (e) {
        console.error('Failed to save awakenings:', e);
    }
}

/**
 * Request browser notification permission
 */
async function requestNotificationPermission() {
    if (!('Notification' in window)) {
        console.log('Browser does not support notifications');
        return false;
    }
    
    if (Notification.permission === 'granted') {
        notificationsEnabled = true;
        return true;
    }
    
    if (Notification.permission !== 'denied') {
        const permission = await Notification.requestPermission();
        notificationsEnabled = permission === 'granted';
        return notificationsEnabled;
    }
    
    return false;
}

/**
 * Send browser notification for awakening
 */
function sendAwakeningNotification(awakening) {
    if (!notificationsEnabled || Notification.permission !== 'granted') return;
    
    const balance = formatXTZ(awakening.balance);
    const dormancy = formatDormancy(awakening.dormantDays);
    
    const notification = new Notification('🚨 Sleeping Giant Awakened!', {
        body: `${balance} ꜩ woke up after ${dormancy} of sleep`,
        icon: '/favicon.svg',
        badge: '/favicon.svg',
        tag: `awakening-${awakening.address}`,
        requireInteraction: true
    });
    
    notification.onclick = () => {
        window.focus();
        window.open(`https://tzkt.io/${awakening.address}`, '_blank');
        notification.close();
    };
}

/**
 * Format XTZ amount
 */
function formatXTZ(mutez) {
    const xtz = mutez / 1e6;
    if (xtz >= 1000000) {
        return `${(xtz / 1000000).toFixed(2)}M`;
    } else if (xtz >= 1000) {
        return `${(xtz / 1000).toFixed(0)}K`;
    }
    return xtz.toLocaleString();
}

// Tezos mainnet launch date
const MAINNET_LAUNCH = new Date('2018-06-30T00:00:00Z').getTime();

/**
 * Calculate days since a timestamp (capped at mainnet launch)
 */
function daysSince(timestamp) {
    if (!timestamp) {
        // Never active = dormant since mainnet launch
        return Math.floor((Date.now() - MAINNET_LAUNCH) / (1000 * 60 * 60 * 24));
    }
    const activityTime = new Date(timestamp).getTime();
    // Cap at mainnet launch (can't be dormant longer than Tezos exists)
    const effectiveTime = Math.max(activityTime, MAINNET_LAUNCH);
    const ms = Date.now() - effectiveTime;
    return Math.floor(ms / (1000 * 60 * 60 * 24));
}

/**
 * Format days as human readable
 */
function formatDormancy(days) {
    if (days >= 365) {
        const years = Math.floor(days / 365);
        const remainingDays = days % 365;
        if (remainingDays > 30) {
            return `${years}y ${Math.floor(remainingDays / 30)}mo`;
        }
        return `${years}y`;
    } else if (days >= 30) {
        return `${Math.floor(days / 30)}mo`;
    }
    return `${days}d`;
}

/**
 * Get dormancy tier for styling
 */
function getDormancyTier(days) {
    if (days >= 1825) return { tier: 'ancient', label: 'Ancient', emoji: '🦴' };      // 5+ years
    if (days >= 1095) return { tier: 'legendary', label: 'Legendary', emoji: '👑' };  // 3+ years
    if (days >= 730) return { tier: 'epic', label: 'Epic', emoji: '💎' };             // 2+ years
    if (days >= 365) return { tier: 'rare', label: 'Rare', emoji: '⭐' };             // 1+ year
    return { tier: 'common', label: 'Dormant', emoji: '😴' };
}

/**
 * Fetch dormant whales from TzKT
 */
async function fetchSleepingGiants() {
    try {
        // Get large accounts sorted by balance
        const params = new URLSearchParams({
            'balance.ge': CONFIG.minBalance,
            'sort.desc': 'balance',
            'limit': 100,
            'select': 'address,balance,lastActivity'
        });
        
        const response = await fetch(`${CONFIG.apiBase}/accounts?${params}`);
        if (!response.ok) throw new Error('API error');
        
        const accounts = await response.json();
        
        // Filter for dormant accounts
        const now = Date.now();
        const dormantThreshold = now - (CONFIG.minDormantDays * 24 * 60 * 60 * 1000);
        
        const dormant = accounts.filter(acc => {
            if (!acc.lastActivity) return true; // Never active = very dormant
            const lastActive = new Date(acc.lastActivity).getTime();
            return lastActive < dormantThreshold;
        });
        
        // Sort by dormancy (most dormant first)
        dormant.sort((a, b) => {
            const aTime = a.lastActivity ? new Date(a.lastActivity).getTime() : 0;
            const bTime = b.lastActivity ? new Date(b.lastActivity).getTime() : 0;
            return aTime - bTime;
        });
        
        return dormant.slice(0, CONFIG.maxGiants);
    } catch (error) {
        console.error('Failed to fetch sleeping giants:', error);
        return [];
    }
}

/**
 * Check for recent awakenings
 */
async function checkAwakenings(previousGiants) {
    if (previousGiants.length === 0) return [];
    
    const addresses = previousGiants.map(g => g.address);
    const newAwakenings = [];
    
    // Check each giant for recent activity
    for (const giant of previousGiants) {
        try {
            const response = await fetch(
                `${CONFIG.apiBase}/accounts/${giant.address}/operations?limit=1&sort.desc=id`
            );
            if (!response.ok) continue;
            
            const ops = await response.json();
            if (ops.length === 0) continue;
            
            const lastOp = ops[0];
            const opTime = new Date(lastOp.timestamp).getTime();
            const giantLastActive = giant.lastActivity ? new Date(giant.lastActivity).getTime() : 0;
            
            // If there's new activity since we last checked
            if (opTime > giantLastActive) {
                newAwakenings.push({
                    address: giant.address,
                    balance: giant.balance,
                    dormantDays: daysSince(giant.lastActivity),
                    awakenedAt: lastOp.timestamp,
                    operation: lastOp
                });
            }
        } catch (e) {
            // Skip on error
        }
    }
    
    return newAwakenings;
}

/**
 * Create giant card element
 */
function createGiantCard(giant, rank) {
    const dormantDays = daysSince(giant.lastActivity);
    const tier = getDormancyTier(dormantDays);
    const balance = formatXTZ(giant.balance);
    const dormancy = giant.lastActivity ? formatDormancy(dormantDays) : 'Since Genesis';
    const neverActive = !giant.lastActivity;
    
    const card = document.createElement('div');
    card.className = `giant-card giant-${tier.tier}`;
    card.dataset.address = giant.address;
    
    card.innerHTML = `
        <div class="giant-rank">#${rank}</div>
        <div class="giant-status">
            <span class="giant-emoji">${neverActive ? '🥚' : tier.emoji}</span>
            <span class="giant-tier">${neverActive ? 'Unrevealed' : tier.label}</span>
        </div>
        <div class="giant-balance">${balance} <span class="xtz">ꜩ</span></div>
        <div class="giant-dormancy">
            <span class="dormancy-label">${neverActive ? 'Dormant' : 'Asleep for'}</span>
            <span class="dormancy-value">${dormancy}</span>
        </div>
        <div class="giant-address" title="${giant.address}">
            ${giant.address.slice(0, 8)}...${giant.address.slice(-4)}
        </div>
        <div class="giant-heartbeat">
            <svg viewBox="0 0 100 30" class="flatline">
                <polyline points="0,15 20,15 25,15 30,15 35,15 40,15 100,15" />
            </svg>
        </div>
    `;
    
    // Click to view on TzKT
    card.addEventListener('click', () => {
        window.open(`https://tzkt.io/${giant.address}`, '_blank');
    });
    
    return card;
}

/**
 * Create awakening alert element
 */
function createAwakeningAlert(awakening) {
    const tier = getDormancyTier(awakening.dormantDays);
    const balance = formatXTZ(awakening.balance);
    const dormancy = formatDormancy(awakening.dormantDays);
    
    const alert = document.createElement('div');
    alert.className = 'awakening-alert';
    
    alert.innerHTML = `
        <div class="awakening-header">
            <span class="awakening-icon">🚨</span>
            <span class="awakening-title">GIANT AWAKENED</span>
        </div>
        <div class="awakening-details">
            <span class="awakening-balance">${balance} ꜩ</span>
            <span class="awakening-dormancy">after ${dormancy} of sleep</span>
        </div>
        <div class="awakening-address">${awakening.address.slice(0, 12)}...</div>
    `;
    
    alert.addEventListener('click', () => {
        window.open(`https://tzkt.io/${awakening.address}`, '_blank');
    });
    
    // Auto-remove after 30 seconds
    setTimeout(() => {
        alert.classList.add('awakening-fade');
        setTimeout(() => alert.remove(), 500);
    }, 30000);
    
    return alert;
}

/**
 * Update the UI
 */
function updateUI() {
    const container = document.getElementById('giants-grid');
    const statsEl = document.getElementById('giants-stats');
    
    if (!container) return;
    
    if (giants.length === 0) {
        container.innerHTML = `
            <div class="giants-empty">
                <span class="giants-empty-icon">😴</span>
                <span>Scanning for sleeping giants...</span>
            </div>
        `;
        return;
    }
    
    // Calculate stats
    const totalDormant = giants.reduce((sum, g) => sum + g.balance, 0);
    const avgDormancy = giants.reduce((sum, g) => {
        return sum + daysSince(g.lastActivity);
    }, 0) / giants.length;
    
    // Update stats
    if (statsEl) {
        statsEl.innerHTML = `
            <div class="giants-stat">
                <span class="stat-value">${formatXTZ(totalDormant)}</span>
                <span class="stat-label">Total Dormant</span>
            </div>
            <div class="giants-stat">
                <span class="stat-value">${Math.round(avgDormancy)}</span>
                <span class="stat-label">Avg Days Asleep</span>
            </div>
            <div class="giants-stat">
                <span class="stat-value">${giants.length}</span>
                <span class="stat-label">Giants Tracked</span>
            </div>
        `;
    }
    
    // Update grid
    container.innerHTML = '';
    giants.forEach((giant, i) => {
        container.appendChild(createGiantCard(giant, i + 1));
    });
}

/**
 * Show awakening alert
 */
function showAwakening(awakening) {
    // Add to awakenings list (newest first)
    awakenings.unshift({
        ...awakening,
        timestamp: Date.now()
    });
    
    // Keep only recent awakenings
    if (awakenings.length > MAX_STORED_AWAKENINGS) {
        awakenings = awakenings.slice(0, MAX_STORED_AWAKENINGS);
    }
    
    // Persist to localStorage
    saveAwakenings();
    
    // Update the awakenings log UI
    updateAwakeningsLog();
    
    // Show alert banner
    const alertsContainer = document.getElementById('awakening-alerts');
    if (alertsContainer) {
        const alert = createAwakeningAlert(awakening);
        alertsContainer.appendChild(alert);
    }
    
    // Send browser notification
    sendAwakeningNotification(awakening);
    
    // Play sound if enabled
    if (window.playSound) {
        window.playSound('alert');
    }
}

/**
 * Update the awakenings history log UI
 */
function updateAwakeningsLog() {
    const logContainer = document.getElementById('awakenings-log');
    if (!logContainer) return;
    
    if (awakenings.length === 0) {
        logContainer.innerHTML = `
            <div class="awakenings-empty">
                No awakenings recorded yet. Giants are still sleeping...
            </div>
        `;
        return;
    }
    
    logContainer.innerHTML = awakenings.map(a => {
        const balance = formatXTZ(a.balance);
        const dormancy = formatDormancy(a.dormantDays);
        const timeAgo = formatTimeAgo(a.timestamp || a.awakenedAt);
        
        return `
            <div class="awakening-log-item" onclick="window.open('https://tzkt.io/${a.address}', '_blank')">
                <div class="log-item-main">
                    <span class="log-balance">${balance} ꜩ</span>
                    <span class="log-dormancy">slept ${dormancy}</span>
                </div>
                <div class="log-item-meta">
                    <span class="log-address">${a.address.slice(0, 10)}...</span>
                    <span class="log-time">${timeAgo}</span>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Format time ago
 */
function formatTimeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return new Date(timestamp).toLocaleDateString();
}

/**
 * Poll for updates
 */
async function pollForUpdates() {
    const previousGiants = [...giants];
    giants = await fetchSleepingGiants();
    
    // Check for awakenings
    const newAwakenings = await checkAwakenings(previousGiants);
    newAwakenings.forEach(showAwakening);
    
    updateUI();
}

/**
 * Start polling
 */
function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(pollForUpdates, CONFIG.pollInterval);
}

/**
 * Stop polling
 */
function stopPolling() {
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
}

/**
 * Toggle sleeping giants visibility
 */
export function toggleSleepingGiants() {
    isEnabled = !isEnabled;
    localStorage.setItem(STORAGE_KEY, isEnabled ? 'true' : 'false');
    updateVisibility();
    
    if (isEnabled) {
        if (giants.length === 0) {
            loadInitialData();
        }
        updateAwakeningsLog();
        
        // Request notification permission on first enable
        requestNotificationPermission();
    }
    
    return isEnabled;
}

/**
 * Update visibility based on state
 */
function updateVisibility() {
    const section = document.getElementById('giants-section');
    const toggleBtn = document.getElementById('giants-toggle');
    
    if (section) {
        section.classList.toggle('visible', isEnabled);
    }
    
    if (toggleBtn) {
        toggleBtn.classList.toggle('active', isEnabled);
        toggleBtn.title = `Sleeping Giants: ${isEnabled ? 'ON' : 'OFF'}`;
    }
    
    if (isEnabled) {
        startPolling();
    } else {
        stopPolling();
    }
}

/**
 * Load initial data
 */
async function loadInitialData() {
    const container = document.getElementById('giants-grid');
    if (container) {
        container.innerHTML = `
            <div class="giants-loading">
                <span class="loading-icon">🔍</span>
                <span>Searching for sleeping giants...</span>
            </div>
        `;
    }
    
    giants = await fetchSleepingGiants();
    updateUI();
}

/**
 * Initialize sleeping giants tracker
 */
export async function initSleepingGiants() {
    const section = document.getElementById('giants-section');
    if (!section) {
        console.log('Giants section not found');
        return;
    }
    
    console.log('Initializing Sleeping Giants...');
    
    // Load saved preference (default: off)
    isEnabled = localStorage.getItem(STORAGE_KEY) === 'true';
    
    // Load stored awakenings history
    loadStoredAwakenings();
    
    // Setup toggle button
    const toggleBtn = document.getElementById('giants-toggle');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', toggleSleepingGiants);
    }
    
    // Set initial visibility
    updateVisibility();
    
    // Load data if enabled
    if (isEnabled) {
        await loadInitialData();
        startPolling();
        updateAwakeningsLog();
        
        // Request notification permission when user enables the feature
        requestNotificationPermission();
    }
    
    // Handle visibility changes
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stopPolling();
        } else if (isEnabled) {
            pollForUpdates();
            startPolling();
        }
    });
}

export { giants, awakenings };
