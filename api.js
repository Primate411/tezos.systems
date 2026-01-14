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
        operations: '/operations/transactions',
        cycles: '/cycles'
    },
    octez: {
        base: 'https://eu.rpc.tez.capital',
        totalSupply: '/chains/main/blocks/head/context/total_supply',
        issuance: '/chains/main/blocks/head/context/issuance/current_yearly_rate',
        totalFrozenStake: '/chains/main/blocks/head/context/total_frozen_stake'
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

    // Calculate adoption percentage (of all active bakers)
    const percentage = calculatePercentage(tz4Count, total);

    return {
        total,
        tz4Count,
        tz4Percentage: percentage
    };
}

/**
 * Fetch current yearly issuance rate from Octez RPC
 * @returns {Promise<number>} Current yearly issuance rate as percentage
 */
async function fetchIssuance() {
    const url = `${ENDPOINTS.octez.base}${ENDPOINTS.octez.issuance}`;

    // Octez RPC returns the current yearly rate as a string (e.g., "3.525")
    const rateString = await fetchWithRetry(url);

    // Parse and return as number
    const rate = parseFloat(rateString.replace(/"/g, ''));

    return rate;
}

/**
 * Fetch transaction volume for last 24 hours
 * Uses block level range for accurate counting
 * @returns {Promise<number>} Transaction count
 */
async function fetchTransactionVolume() {
    try {
        // Calculate timestamp for 24 hours ago
        const oneDayAgo = new Date();
        oneDayAgo.setHours(oneDayAgo.getHours() - 24);
        const timestamp = oneDayAgo.toISOString();

        // Get the block level from 24 hours ago
        const blocksAgoUrl = `${ENDPOINTS.tzkt.base}/blocks?timestamp.le=${timestamp}&limit=1&sort.desc=level&select=level`;
        const blocksAgoResponse = await fetchWithRetry(blocksAgoUrl);

        if (!blocksAgoResponse || blocksAgoResponse.length === 0) {
            throw new Error('Could not determine block level from 24h ago');
        }

        const levelAgo = blocksAgoResponse[0];

        // Count transactions since that block level
        const countUrl = `${ENDPOINTS.tzkt.base}/operations/transactions/count?level.ge=${levelAgo}`;
        const count = await fetchWithRetry(countUrl);

        return count;

    } catch (error) {
        console.error('Failed to fetch transaction volume:', error);
        return 0;
    }
}

/**
 * Fetch total supply from Octez RPC
 * @returns {Promise<number>} Total supply in XTZ
 */
async function fetchTotalSupply() {
    const url = `${ENDPOINTS.octez.base}${ENDPOINTS.octez.totalSupply}`;
    
    try {
        const supplyMutez = await fetchWithRetry(url);
        // Convert from mutez (micro-tez) to XTZ
        const supplyXTZ = parseInt(supplyMutez.replace(/"/g, '')) / 1e6;
        return supplyXTZ;
    } catch (error) {
        console.error('Failed to fetch total supply:', error);
        return 0;
    }
}

/**
 * Fetch staking ratio (total frozen stake / total supply)
 * @returns {Promise<number>} Staking ratio as percentage
 */
async function fetchStakingRatio() {
    try {
        // Fetch both total supply and total frozen stake
        const [supplyUrl, stakeUrl] = [
            `${ENDPOINTS.octez.base}${ENDPOINTS.octez.totalSupply}`,
            `${ENDPOINTS.octez.base}${ENDPOINTS.octez.totalFrozenStake}`
        ];

        const [supplyMutez, stakeMutez] = await Promise.all([
            fetchWithRetry(supplyUrl),
            fetchWithRetry(stakeUrl)
        ]);

        const totalSupply = parseInt(supplyMutez.replace(/"/g, ''));
        const totalStake = parseInt(stakeMutez.replace(/"/g, ''));

        if (totalSupply === 0) return 0;

        const ratio = (totalStake / totalSupply) * 100;
        return ratio;
    } catch (error) {
        console.error('Failed to fetch staking ratio:', error);
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
        const [bakersData, issuance, txVolume, stakingRatio, totalSupply] = await Promise.allSettled([
            fetchBakers(),
            fetchIssuance(),
            fetchTransactionVolume(),
            fetchStakingRatio(),
            fetchTotalSupply()
        ]);

        // Extract results or use fallback values
        const bakers = bakersData.status === 'fulfilled' ? bakersData.value : { total: 0, tz4Count: 0, tz4Percentage: 0 };
        const issuanceRate = issuance.status === 'fulfilled' ? issuance.value : 0;
        const transactions = txVolume.status === 'fulfilled' ? txVolume.value : 0;
        const staking = stakingRatio.status === 'fulfilled' ? stakingRatio.value : 0;
        const supply = totalSupply.status === 'fulfilled' ? totalSupply.value : 0;

        return {
            totalBakers: bakers.total,
            tz4Bakers: bakers.tz4Count,
            tz4Percentage: bakers.tz4Percentage,
            currentIssuanceRate: issuanceRate,
            transactionVolume24h: transactions,
            stakingRatio: staking,
            totalSupply: supply
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
