/**
 * API integration module
 * Handles data fetching from TzKT API and Octez RPC
 */

import { calculatePercentage } from './utils.js';

// API endpoint configurations
const ENDPOINTS = {
    tzkt: {
        base: 'https://api.tzkt.io/v1',
        bakers: '/delegates',
        statistics: '/statistics/current',
        operations: '/operations/transactions'
    },
    octez: {
        base: 'https://eu.rpc.tez.capital',
        totalSupply: '/chains/main/blocks/head/context/total_supply',
        issuance: '/chains/main/blocks/head/context/issuance/current_yearly_rate'
    }
};

// Cache configuration
const CACHE_TTL = 5000; // 5 seconds
const cache = new Map();

/**
 * Fetch with caching
 * @param {string} url - URL to fetch
 * @returns {Promise<any>} Parsed JSON response
 */
async function fetchWithCache(url) {
    const cached = cache.get(url);
    const now = Date.now();

    // Return cached data if still valid
    if (cached && (now - cached.timestamp) < CACHE_TTL) {
        return cached.data;
    }

    // Fetch fresh data
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    // Update cache
    cache.set(url, {
        data,
        timestamp: now
    });

    return data;
}

/**
 * Fetch with retry logic
 * @param {string} url - URL to fetch
 * @param {number} retries - Number of retry attempts
 * @param {number} delay - Delay between retries in ms
 * @returns {Promise<any>} Parsed JSON response
 */
async function fetchWithRetry(url, retries = 3, delay = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            return await fetchWithCache(url);
        } catch (error) {
            console.warn(`Attempt ${i + 1}/${retries} failed for ${url}:`, error.message);

            if (i === retries - 1) {
                throw error;
            }

            // Exponential backoff
            await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
        }
    }
}

/**
 * Fetch baker data from TzKT API
 * @returns {Promise<Object>} Baker statistics
 */
async function fetchBakers() {
    // Get total active bakers
    const bakersUrl = `${ENDPOINTS.tzkt.base}${ENDPOINTS.tzkt.bakers}?active=true&limit=10000`;
    const bakers = await fetchWithRetry(bakersUrl);
    const total = bakers.length;

    // Get tz4 consensus key adoptions from update_consensus_key operations
    // We need to fetch enough operations to cover all bakers who have updated
    const opsUrl = `${ENDPOINTS.tzkt.base}/operations/update_consensus_key?limit=2000&sort.desc=id`;
    const operations = await fetchWithRetry(opsUrl);

    // Build map of baker -> most recent consensus key
    const bakerConsensusKeys = {};
    for (const op of operations) {
        const baker = op.sender.address;
        const keyHash = op.publicKeyHash || '';

        // Only store if we haven't seen this baker yet (most recent first due to sort)
        if (!bakerConsensusKeys[baker]) {
            bakerConsensusKeys[baker] = keyHash;
        }
    }

    // Count bakers using tz4 consensus keys
    const tz4Count = Object.values(bakerConsensusKeys).filter(key =>
        key.startsWith('tz4')
    ).length;

    // Calculate adoption percentage (of bakers who have set consensus keys)
    const bakersWithConsensusKeys = Object.keys(bakerConsensusKeys).length;
    const percentage = calculatePercentage(tz4Count, bakersWithConsensusKeys);

    return {
        total,
        tz4Count,
        tz4Percentage: percentage,
        bakersWithConsensusKeys
    };
}

/**
 * Fetch total issuance from Octez RPC
 * @returns {Promise<number>} Total issuance in XTZ
 */
async function fetchIssuance() {
    const url = `${ENDPOINTS.octez.base}${ENDPOINTS.octez.totalSupply}`;

    // Octez RPC returns a string number in mutez
    const mutezString = await fetchWithRetry(url);

    // Parse and convert to XTZ
    const mutez = parseInt(mutezString.replace(/"/g, ''), 10);
    const xtz = mutez / 1_000_000;

    return xtz;
}

/**
 * Fetch transaction volume for last 24 hours
 * @returns {Promise<number>} Transaction count
 */
async function fetchTransactionVolume() {
    // Calculate timestamp for 24 hours ago
    const oneDayAgo = new Date();
    oneDayAgo.setHours(oneDayAgo.getHours() - 24);
    const timestamp = oneDayAgo.toISOString();

    // Use statistics endpoint for better performance
    const statsUrl = `${ENDPOINTS.tzkt.base}${ENDPOINTS.tzkt.statistics}`;

    try {
        const stats = await fetchWithRetry(statsUrl);

        // TzKT statistics includes transaction counts
        // We'll get the current total transactions and estimate 24h volume
        // Note: For more accurate data, we could use the operations endpoint with date filter
        // but that's more expensive. Using statistics as approximation.

        if (stats && stats.totalTransactions) {
            // This is an approximation - in production you might want to track
            // the previous value and calculate the difference
            // For now, we'll use a different approach with the operations endpoint
            throw new Error('Using operations endpoint instead');
        }
    } catch (error) {
        // Fallback to operations endpoint with date filter
        const opsUrl = `${ENDPOINTS.tzkt.base}${ENDPOINTS.tzkt.operations}?timestamp.ge=${timestamp}&limit=10000&select=id`;

        try {
            const operations = await fetchWithRetry(opsUrl);
            return operations.length;
        } catch (opsError) {
            console.error('Failed to fetch transaction volume:', opsError);
            // Return approximate value based on typical network activity
            return 0;
        }
    }

    return 0;
}

/**
 * Fetch transaction volume using efficient method
 * Uses operations count endpoint
 * @returns {Promise<number>} Transaction count for last 24h
 */
async function fetchTransactionVolumeEfficient() {
    // Calculate timestamp for 24 hours ago
    const oneDayAgo = new Date();
    oneDayAgo.setHours(oneDayAgo.getHours() - 24);
    const timestamp = oneDayAgo.toISOString();

    // Use operations endpoint with count
    const url = `${ENDPOINTS.tzkt.base}${ENDPOINTS.tzkt.operations}?timestamp.ge=${timestamp}&limit=1`;

    try {
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        // TzKT returns total count in X-Total-Count header
        const totalCount = response.headers.get('X-Total-Count');

        if (totalCount) {
            return parseInt(totalCount, 10);
        }

        // Fallback: parse response
        const data = await response.json();
        return data.length;

    } catch (error) {
        console.error('Failed to fetch transaction volume:', error);
        return 0;
    }
}

/**
 * Fetch all statistics in parallel
 * @returns {Promise<Object>} All statistics
 */
export async function fetchAllStats() {
    try {
        // Fetch all data in parallel for better performance
        const [bakersData, issuance, txVolume] = await Promise.allSettled([
            fetchBakers(),
            fetchIssuance(),
            fetchTransactionVolumeEfficient()
        ]);

        // Extract results or use fallback values
        const bakers = bakersData.status === 'fulfilled' ? bakersData.value : { total: 0, tz4Count: 0, tz4Percentage: 0 };
        const totalIssuance = issuance.status === 'fulfilled' ? issuance.value : 0;
        const transactions = txVolume.status === 'fulfilled' ? txVolume.value : 0;

        return {
            totalBakers: bakers.total,
            tz4Bakers: bakers.tz4Count,
            tz4Percentage: bakers.tz4Percentage,
            totalIssuance: totalIssuance,
            transactionVolume24h: transactions
        };
    } catch (error) {
        console.error('Failed to fetch all stats:', error);
        throw error;
    }
}

/**
 * Clear API cache
 */
export function clearCache() {
    cache.clear();
}

/**
 * Get cache size
 * @returns {number} Number of cached entries
 */
export function getCacheSize() {
    return cache.size;
}

/**
 * Health check for API endpoints
 * @returns {Promise<Object>} Health status for each endpoint
 */
export async function checkHealth() {
    const results = {
        tzkt: false,
        octez: false
    };

    // Check TzKT
    try {
        const url = `${ENDPOINTS.tzkt.base}${ENDPOINTS.tzkt.bakers}?limit=1`;
        const response = await fetch(url);
        results.tzkt = response.ok;
    } catch (error) {
        results.tzkt = false;
    }

    // Check Octez RPC
    try {
        const url = `${ENDPOINTS.octez.base}${ENDPOINTS.octez.totalSupply}`;
        const response = await fetch(url);
        results.octez = response.ok;
    } catch (error) {
        results.octez = false;
    }

    return results;
}
