/**
 * LocalStorage persistence layer
 * Caches stats for instant page loads
 */

const STORAGE_KEYS = {
    stats: 'tezos-systems-stats',
    protocols: 'tezos-systems-protocols',
    timestamp: 'tezos-systems-lastUpdate'
};

// Cache TTL: 4 hours (data refreshes every 2h, so this gives buffer)
const CACHE_TTL = 4 * 60 * 60 * 1000;

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
