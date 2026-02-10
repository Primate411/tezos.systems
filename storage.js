/**
 * LocalStorage persistence layer
 * Caches stats for instant page loads
 */

const STORAGE_KEYS = {
    stats: 'tezos-systems-stats',
    protocols: 'tezos-systems-protocols',
    timestamp: 'tezos-systems-lastUpdate',
    lastVisit: 'tezos-systems-lastVisit',
    lastVisitStats: 'tezos-systems-lastVisitStats'
};

// Cache TTL: 4 hours (data refreshes every 2h, so this gives buffer)
const CACHE_TTL = 4 * 60 * 60 * 1000;

// Minimum time between visits to show deltas (1 hour)
const DELTA_MIN_GAP = 60 * 60 * 1000;

/**
 * Save stats to localStorage
 * @param {Object} stats - Stats object from fetchAllStats()
 */
export function saveStats(stats) {
    try {
        localStorage.setItem(STORAGE_KEYS.stats, JSON.stringify(stats));
        localStorage.setItem(STORAGE_KEYS.timestamp, Date.now().toString());
        console.log('💾 Stats cached to localStorage');
    } catch (error) {
        // localStorage might be full or disabled
        console.warn('Failed to cache stats:', error);
    }
}

/**
 * Load cached stats from localStorage
 * @returns {Object|null} Cached stats or null if expired/missing
 */
export function loadStats() {
    try {
        const timestamp = localStorage.getItem(STORAGE_KEYS.timestamp);
        const stats = localStorage.getItem(STORAGE_KEYS.stats);
        
        if (!timestamp || !stats) {
            return null;
        }
        
        // Check if cache is still valid
        const age = Date.now() - parseInt(timestamp);
        if (age > CACHE_TTL) {
            console.log('📦 Cached stats expired');
            return null;
        }
        
        console.log(`📦 Loaded cached stats (${Math.round(age / 60000)}min old)`);
        return JSON.parse(stats);
    } catch (error) {
        console.warn('Failed to load cached stats:', error);
        return null;
    }
}

/**
 * Save protocol data to localStorage
 * @param {Array} protocols - Protocol list
 */
export function saveProtocols(protocols) {
    try {
        localStorage.setItem(STORAGE_KEYS.protocols, JSON.stringify(protocols));
    } catch (error) {
        console.warn('Failed to cache protocols:', error);
    }
}

/**
 * Load cached protocols from localStorage
 * @returns {Array|null} Cached protocols or null
 */
export function loadProtocols() {
    try {
        const protocols = localStorage.getItem(STORAGE_KEYS.protocols);
        return protocols ? JSON.parse(protocols) : null;
    } catch (error) {
        return null;
    }
}

/**
 * Get cache age in human-readable format
 * @returns {string|null} e.g., "5 min ago" or null if no cache
 */
export function getCacheAge() {
    try {
        const timestamp = localStorage.getItem(STORAGE_KEYS.timestamp);
        if (!timestamp) return null;
        
        const age = Date.now() - parseInt(timestamp);
        const minutes = Math.round(age / 60000);
        
        if (minutes < 1) return 'just now';
        if (minutes === 1) return '1 min ago';
        if (minutes < 60) return `${minutes} min ago`;
        
        const hours = Math.round(minutes / 60);
        if (hours === 1) return '1 hour ago';
        return `${hours} hours ago`;
    } catch {
        return null;
    }
}

/**
 * Clear all cached data
 */
export function clearCache() {
    Object.values(STORAGE_KEYS).forEach(key => {
        localStorage.removeItem(key);
    });
    console.log('🗑️ Cache cleared');
}

/**
 * Check if we have valid cached data
 * @returns {boolean}
 */
export function hasCachedData() {
    return loadStats() !== null;
}

/**
 * Save visit snapshot for delta comparison
 * Only saves if enough time has passed since last snapshot
 * @param {Object} stats - Current stats to snapshot
 */
export function saveVisitSnapshot(stats) {
    try {
        const lastVisit = localStorage.getItem(STORAGE_KEYS.lastVisit);
        const now = Date.now();
        
        // Only update snapshot if it's been a while (avoid overwriting on rapid refreshes)
        if (!lastVisit || (now - parseInt(lastVisit)) > DELTA_MIN_GAP) {
            localStorage.setItem(STORAGE_KEYS.lastVisitStats, JSON.stringify(stats));
            localStorage.setItem(STORAGE_KEYS.lastVisit, now.toString());
            console.log('📸 Visit snapshot saved');
        }
    } catch (error) {
        console.warn('Failed to save visit snapshot:', error);
    }
}

/**
 * Get deltas between current stats and last visit
 * @param {Object} currentStats - Current stats
 * @returns {Object|null} Deltas object or null if no previous visit
 */
export function getVisitDeltas(currentStats) {
    try {
        const lastVisit = localStorage.getItem(STORAGE_KEYS.lastVisit);
        const lastStats = localStorage.getItem(STORAGE_KEYS.lastVisitStats);
        
        if (!lastVisit || !lastStats) {
            return null;
        }
        
        const visitTime = parseInt(lastVisit);
        const timeSince = Date.now() - visitTime;
        
        // Only show deltas if it's been at least an hour
        if (timeSince < DELTA_MIN_GAP) {
            return null;
        }
        
        const previous = JSON.parse(lastStats);
        
        // Calculate deltas for key metrics
        const deltas = {
            timeSince,
            timeAgo: formatTimeAgo(visitTime),
            metrics: []
        };
        
        // Define which metrics to track with their display info
        const trackedMetrics = [
            { key: 'totalBakers', label: 'Bakers', format: 'count' },
            { key: 'tz4Bakers', label: 'BLS Bakers', format: 'count' },
            { key: 'stakingRatio', label: 'Staking', format: 'percent' },
            { key: 'totalSupply', label: 'Supply', format: 'supply' },
            { key: 'totalBurned', label: 'Burned', format: 'supply' },
            { key: 'fundedAccounts', label: 'Accounts', format: 'count' }
        ];
        
        for (const metric of trackedMetrics) {
            const prev = previous[metric.key];
            const curr = currentStats[metric.key];
            
            if (prev !== undefined && curr !== undefined && prev !== curr) {
                const delta = curr - prev;
                const percentChange = prev !== 0 ? ((delta / prev) * 100) : 0;
                
                deltas.metrics.push({
                    key: metric.key,
                    label: metric.label,
                    previous: prev,
                    current: curr,
                    delta,
                    percentChange,
                    format: metric.format,
                    direction: delta > 0 ? 'up' : 'down'
                });
            }
        }
        
        // Only return if there are meaningful changes
        return deltas.metrics.length > 0 ? deltas : null;
    } catch (error) {
        console.warn('Failed to calculate deltas:', error);
        return null;
    }
}

/**
 * Format timestamp as "X ago"
 */
function formatTimeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    
    if (seconds < 3600) {
        const mins = Math.floor(seconds / 60);
        return `${mins} min ago`;
    }
    if (seconds < 86400) {
        const hours = Math.floor(seconds / 3600);
        return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
    }
    const days = Math.floor(seconds / 86400);
    return days === 1 ? '1 day ago' : `${days} days ago`;
}
