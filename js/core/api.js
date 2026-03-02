/**
 * Tezos Systems - API Module
 * Fetches data from TzKT API and Octez RPC
 */

import { API_URLS, CACHE_TTLS, FETCH_LIMITS, HISTORY_START } from './config.js?v=20260228a';

// API endpoint configurations
const ENDPOINTS = {
    tzkt: {
        base: API_URLS.tzkt,
        bakers: '/delegates',
        statistics: '/statistics/current',
        operations: '/operations/transactions',
        cycles: '/cycles',
        head: '/head',
        voting: '/voting/periods/current',
        proposals: '/voting/proposals',
        accounts: '/accounts/count',
        contracts: '/contracts/count',
        tokens: '/tokens/count',
        rollups: '/smart_rollups/count'
    },
    octez: {
        base: API_URLS.octez,
        totalSupply: '/chains/main/blocks/head/context/total_supply',
        issuance: '/chains/main/blocks/head/context/issuance/current_yearly_rate',
        totalFrozenStake: '/chains/main/blocks/head/context/total_frozen_stake'
    }
};

// Cache for API responses
const cache = {
    data: {},
    timestamps: {},
    ttl: CACHE_TTLS.memory
};

/**
 * Check if cached data is still valid
 */
function isCacheValid(key) {
    return cache.timestamps[key] && (Date.now() - cache.timestamps[key]) < cache.ttl;
}

/**
 * Shared statistics/current fetch — deduplicates concurrent requests
 * Multiple functions need this endpoint; without dedup they'd all miss cache in parallel
 */
let _statsPromise = null;
let _statsTimestamp = 0;
async function fetchSharedStats() {
    // Return in-flight promise if one exists (dedup concurrent calls)
    if (_statsPromise && Date.now() - _statsTimestamp < 5000) return _statsPromise;
    _statsTimestamp = Date.now();
    _statsPromise = fetchWithRetry(`${ENDPOINTS.tzkt.base}${ENDPOINTS.tzkt.statistics}`);
    try {
        const result = await _statsPromise;
        return result;
    } finally {
        // Allow re-fetch after resolution
        setTimeout(() => { _statsPromise = null; }, 1000);
    }
}

/**
 * Fetch with retry logic and caching
 */
async function fetchWithRetry(url, options = {}, retries = 3) {
    // Check cache first
    if (isCacheValid(url)) {
        return cache.data[url];
    }

    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, {
                ...options,
                headers: {
                    'Accept': 'application/json',
                    ...options.headers
                }
            });

            if (response.status === 429) {
                // Rate limited — respect Retry-After or use exponential backoff
                const retryAfter = parseInt(response.headers.get('Retry-After') || '0');
                const backoffMs = retryAfter > 0 ? retryAfter * 1000 : 2000 * Math.pow(2, i);
                console.warn(`⚠️ Rate limited (429) on ${url}, backing off ${Math.round(backoffMs/1000)}s`);
                await new Promise(r => setTimeout(r, backoffMs));
                continue;
            }

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            
            // Cache the response
            cache.data[url] = data;
            cache.timestamps[url] = Date.now();
            
            return data;
        } catch (error) {
            if (i === retries - 1) throw error;
            await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        }
    }
}

/**
 * Fetch text response (for RPC endpoints that return raw values)
 */
async function fetchText(url) {
    if (isCacheValid(url)) {
        return cache.data[url];
    }

    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    
    cache.data[url] = text;
    cache.timestamps[url] = Date.now();
    
    return text;
}

/**
 * Calculate percentage
 */
function calculatePercentage(part, total) {
    if (!total || total === 0) return 0;
    return (part / total) * 100;
}

/**
 * Fetch baker data from TzKT API
 * Optimized: uses /count endpoint + select fields (saves ~2-5MB vs full baker list)
 */
async function fetchBakers() {
    // Get active baker addresses from Octez RPC (replaces TzKT count + address list)
    let addresses = [];
    let total = 0;
    try {
        addresses = await fetchWithRetry(`${ENDPOINTS.octez.base}/chains/main/blocks/head/context/delegates?active=true&with_minimal_stake=true`);
        total = addresses.length;
    } catch (e) {
        // Fallback to TzKT if RPC fails
        const countUrl = `${ENDPOINTS.tzkt.base}${ENDPOINTS.tzkt.bakers}/count?active=true`;
        total = await fetchWithRetry(countUrl);
        const addressUrl = `${ENDPOINTS.tzkt.base}${ENDPOINTS.tzkt.bakers}?active=true&limit=${FETCH_LIMITS.bakers}&select=address`;
        addresses = await fetchWithRetry(addressUrl);
    }
    const activeBakerAddresses = new Set(addresses);

    // Get consensus key ops with only the fields we need
    const opsUrl = `${ENDPOINTS.tzkt.base}/operations/update_consensus_key?limit=${FETCH_LIMITS.consensusOps}&sort.desc=id&select=sender,publicKeyHash`;
    const operations = await fetchWithRetry(opsUrl);

    const bakerConsensusKeys = {};
    for (const op of operations) {
        const baker = op.sender?.address;
        const keyHash = op.publicKeyHash || '';
        if (baker && !bakerConsensusKeys[baker] && activeBakerAddresses.has(baker)) {
            bakerConsensusKeys[baker] = keyHash;
        }
    }

    const tz4Count = Object.values(bakerConsensusKeys).filter(key =>
        key.startsWith('tz4')
    ).length;

    const percentage = calculatePercentage(tz4Count, total);

    return {
        total,
        tz4Count,
        tz4Percentage: percentage
    };
}

/**
 * Fetch cycle info from TzKT
 */
async function fetchCycleInfo() {
    // Use Octez RPC instead of TzKT for head + cycle info
    const [header, metadata] = await Promise.all([
        fetchWithRetry(`${ENDPOINTS.octez.base}/chains/main/blocks/head/header`),
        fetchWithRetry(`${ENDPOINTS.octez.base}/chains/main/blocks/head/metadata`)
    ]);
    const levelInfo = metadata.level_info || {};
    const head = {
        level: header.level,
        timestamp: header.timestamp,
        cycle: levelInfo.cycle
    };

    // Compute cycle boundaries from metadata (no TzKT /cycles needed)
    const cyclePosition = levelInfo.cycle_position || 0;
    const cycleStartBlock = header.level - cyclePosition;

    // Fetch block time from RPC constants (don't hardcode 6s)
    let blockTimeSec = 6; // safe fallback
    let actualBlocksPerCycle = 14400; // safe fallback
    try {
        const constantsUrl = `${ENDPOINTS.octez.base}/chains/main/blocks/head/context/constants`;
        const constants = await fetchWithRetry(constantsUrl);
        if (constants.minimal_block_delay) {
            blockTimeSec = parseInt(constants.minimal_block_delay);
        }
        if (constants.blocks_per_cycle) {
            actualBlocksPerCycle = parseInt(constants.blocks_per_cycle);
        }
    } catch (e) {
        // Use fallback
    }
    // Recompute with actual blocks_per_cycle from constants
    const cycleEndBlockActual = cycleStartBlock + actualBlocksPerCycle - 1;

    const currentBlock = head.level;
    // cycleStartBlock computed above from RPC metadata
    const blocksPerCycle = 14400; // Will be overridden by constants below if available
    const cycleEndBlock = cycleStartBlock + blocksPerCycle - 1;
    const blocksIntoCycle = currentBlock - cycleStartBlock;
    const progress = (blocksIntoCycle / actualBlocksPerCycle) * 100;

    // Calculate time remaining
    const blocksRemaining = cycleEndBlockActual - currentBlock;
    let timeRemaining;

    if (blocksRemaining <= 0) {
        // Cycle is complete or past due
        timeRemaining = '< 1m left';
    } else {
        const secondsRemaining = blocksRemaining * blockTimeSec;
        const hoursRemaining = Math.floor(secondsRemaining / 3600);
        const minutesRemaining = Math.floor((secondsRemaining % 3600) / 60);

        if (hoursRemaining > 0) {
            timeRemaining = `${hoursRemaining}h ${minutesRemaining}m left`;
        } else {
            timeRemaining = `${minutesRemaining}m left`;
        }
    }

    return {
        cycle: head.cycle,
        progress: Math.min(progress, 100),
        timeRemaining
    };
}

/**
 * Fetch governance/voting info
 */
async function fetchGovernance() {
    try {
        const votingUrl = `${ENDPOINTS.tzkt.base}${ENDPOINTS.tzkt.voting}`;
        const voting = await fetchWithRetry(votingUrl);
        
        // Get proposal info if available
        let proposalName = 'None';
        if (voting.epoch?.proposal) {
            proposalName = voting.epoch.proposal.alias || 
                          voting.epoch.proposal.hash?.slice(0, 8) + '...' ||
                          'Unknown';
        }
        
        // Calculate participation
        const participation = voting.totalVoters && voting.totalBakers 
            ? calculatePercentage(voting.totalVoters, voting.totalBakers)
            : 0;
        
        // Format period kind
        const periodKind = voting.kind?.charAt(0).toUpperCase() + voting.kind?.slice(1) || 'Unknown';
        
        // Calculate end date
        const endDate = voting.endTime ? new Date(voting.endTime).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        }) : 'N/A';
        
        const issuanceRate = issuanceData.status === "fulfilled" ? (issuanceData.value.total || 0) : 0;

        return {
            proposal: proposalName,
            proposalDescription: voting.epoch?.proposal ? 'In progress' : 'No active proposal',
            period: periodKind,
            periodDescription: `Ends ${endDate}`,
            participation: participation,
            participationDescription: `${voting.totalVoters || 0} voters`
        };
    } catch (error) {
        console.error('Failed to fetch governance:', error);
        const issuanceRate = issuanceData.status === "fulfilled" ? (issuanceData.value.total || 0) : 0;

        return {
            proposal: 'N/A',
            proposalDescription: 'Error loading',
            period: 'N/A',
            periodDescription: 'Error loading',
            participation: 0,
            participationDescription: 'Error loading'
        };
    }
}

/**
 * Fetch current yearly issuance rate including LB subsidy
 */
async function fetchIssuance() {
    try {
        // Compute actual issuance rate from TzKT statistics (matches TzKT.io display)
        // Compare totalCreated from 30 days ago vs now, annualize
        const now = new Date();
        const daysBack = 30;
        const past = new Date(now.getTime() - daysBack * 24 * 3600 * 1000);
        const pastStr = past.toISOString().split('T')[0];
        const nextDay = new Date(past.getTime() + 24 * 3600 * 1000).toISOString().split('T')[0];
        
        const [currentStats, pastStats, rpcRateRaw] = await Promise.allSettled([
            fetchSharedStats(),
            fetchWithRetry(`${ENDPOINTS.tzkt.base}/statistics?timestamp.ge=${pastStr}T00:00:00Z&timestamp.lt=${nextDay}T00:00:00Z&limit=1`),
            fetchText(`${ENDPOINTS.octez.base}${ENDPOINTS.octez.issuance}`)
        ]);
        
        // Protocol-only rate from Octez RPC (excludes LB subsidy)
        const protocolRate = rpcRateRaw.status === 'fulfilled'
            ? parseFloat(rpcRateRaw.value.replace(/"/g, ''))
            : null;
        
        const current = currentStats.status === 'fulfilled' ? currentStats.value : null;
        const pastStat = pastStats.status === 'fulfilled'
            ? (Array.isArray(pastStats.value) ? pastStats.value[0] : pastStats.value)
            : null;
        
        if (!pastStat || !pastStat.totalCreated || !current || !current.totalSupply) {
            // Fallback to Octez RPC for total rate
            return { total: protocolRate || 0, protocol: protocolRate || 0, lb: 0 };
        }
        
        const createdDiff = current.totalCreated - pastStat.totalCreated;
        const burnedDiff = (current.totalBurned || 0) - (pastStat.totalBurned || 0);
        const netIssuance = createdDiff - burnedDiff;
        const avgSupply = (current.totalSupply + pastStat.totalSupply) / 2;
        const annualized = (netIssuance / avgSupply) * (365.25 / daysBack) * 100;
        
        // LB portion = total net issuance minus protocol-only rate
        const lbRate = protocolRate != null ? Math.max(0, annualized - protocolRate) : 0;
        
        return { total: annualized, protocol: protocolRate || annualized, lb: lbRate };
    } catch (error) {
        console.error('Failed to fetch issuance:', error);
        return { total: 0, protocol: 0, lb: 0 };
    }
}

/**
 * Fetch transaction volume (24h)
 */
async function fetchTransactionVolume() {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const timestamp = yesterday.toISOString();
    
    const url = `${ENDPOINTS.tzkt.base}/operations/transactions/count?timestamp.gt=${timestamp}`;
    const count = await fetchWithRetry(url);
    
    return count;
}

/**
 * Fetch contract calls (24h) - transactions with entrypoints
 */
async function fetchContractCalls() {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const timestamp = yesterday.toISOString();
    
    const url = `${ENDPOINTS.tzkt.base}/operations/transactions/count?timestamp.gt=${timestamp}&entrypoint.null=false`;
    const count = await fetchWithRetry(url);
    
    return count;
}

/**
 * Fetch staking ratio and delegated percentage
 * Uses TzKT statistics for consistency with TzKT.io displayed values
 */
async function fetchStakingRatio() {
    try {
        const stats = await fetchSharedStats();
        
        const totalSupply = stats.totalSupply || 0;
        if (totalSupply === 0) return { stakingRatio: 0, delegatedRatio: 0 };
        
        // Staking = own staked + external staked (matches TzKT.io display)
        const totalStaked = (stats.totalOwnStaked || 0) + (stats.totalExternalStaked || 0);
        const stakingRatio = (totalStaked / totalSupply) * 100;
        
        // Delegated = own delegated + external delegated (not locked/staked)
        const totalDelegated = (stats.totalOwnDelegated || 0) + (stats.totalExternalDelegated || 0);
        const delegatedRatio = (totalDelegated / totalSupply) * 100;

        return { stakingRatio, delegatedRatio };
    } catch (error) {
        console.error('Failed to fetch staking ratio:', error);
        return { stakingRatio: 0, delegatedRatio: 0 };
    }
}

/**
 * Fetch total supply
 */
async function fetchTotalSupply() {
    const url = `${ENDPOINTS.octez.base}${ENDPOINTS.octez.totalSupply}`;
    const supplyMutez = await fetchText(url);
    return parseInt(supplyMutez.replace(/"/g, '')) / 1e6;
}

/**
 * Fetch total burned XTZ
 */
async function fetchTotalBurned() {
    try {
        const stats = await fetchSharedStats();
        return (stats.totalBurned || 0) / 1e6;
    } catch (error) {
        console.error('Failed to fetch burned:', error);
        return 0;
    }
}

/**
 * Fetch funded accounts count
 */
async function fetchFundedAccounts() {
    const url = `${ENDPOINTS.tzkt.base}${ENDPOINTS.tzkt.accounts}?balance.gt=0`;
    return await fetchWithRetry(url);
}

/**
 * Fetch smart contracts count
 */
async function fetchSmartContracts() {
    const url = `${ENDPOINTS.tzkt.base}${ENDPOINTS.tzkt.contracts}`;
    return await fetchWithRetry(url);
}

/**
 * Fetch tokens count
 */
async function fetchTokens() {
    const url = `${ENDPOINTS.tzkt.base}${ENDPOINTS.tzkt.tokens}`;
    return await fetchWithRetry(url);
}

/**
 * Fetch smart rollups count
 */
async function fetchRollups() {
    const url = `${ENDPOINTS.tzkt.base}${ENDPOINTS.tzkt.rollups}`;
    return await fetchWithRetry(url);
}

/**
 * Fetch estimated staking APY
 */
export async function fetchStakingAPY() {
    try {
        // Get net issuance rate from Octez RPC (this is what TzKT uses for APY calc)
        const rateString = await fetchText(`${ENDPOINTS.octez.base}${ENDPOINTS.octez.issuance}`);
        const netIssuance = parseFloat(rateString.replace(/"/g, ''));
        
        // Get staked/delegated percentages from TzKT
        const stats = await fetchSharedStats();
        const supply = stats.totalSupply / 1e6;
        const staked = ((stats.totalOwnStaked || 0) + (stats.totalExternalStaked || 0)) / 1e6;
        const delegated = ((stats.totalOwnDelegated || 0) + (stats.totalExternalDelegated || 0)) / 1e6;
        
        const s = staked / supply;
        const d = delegated / supply;
        const edge = 2; // edge_of_baking_over_staking protocol constant
        
        // Effective baking power: staked + delegated/(1+edge)
        const effective = s + d / (1 + edge);
        
        // Staker APY = net_issuance / effective_stake_ratio
        const stakeAPY = (netIssuance / 100) / effective * 100;
        // Delegator APY = staker_apy / (1+edge)
        const delegateAPY = stakeAPY / (1 + edge);
        
        return { 
            delegateAPY: Math.round(delegateAPY * 10) / 10, 
            stakeAPY: Math.round(stakeAPY * 10) / 10 
        };
    } catch (error) {
        console.error('Failed to fetch staking APY:', error);
        return { delegateAPY: 3.1, stakeAPY: 9.2 }; // Fallback to recent known values
    }
}

/**
 * Fetch all statistics in parallel
 */
export async function fetchAllStats() {
    try {
        const [
            bakersData,
            cycleInfo,
            governance,
            issuance,
            txVolume,
            contractCalls,
            stakingData,
            totalSupply,
            totalBurned,
            fundedAccounts,
            smartContracts,
            tokens,
            rollups,
            stakingAPY
        ] = await Promise.allSettled([
            fetchBakers(),
            fetchCycleInfo(),
            fetchGovernance(),
            fetchIssuance(),
            fetchCycleInfo(),
            fetchTransactionVolume(),
            fetchContractCalls(),
            fetchStakingRatio(),
            fetchText(`${ENDPOINTS.octez.base}${ENDPOINTS.octez.issuance}`),
            fetchTotalSupply(),
            fetchTotalBurned(),
            fetchFundedAccounts(),
            fetchSmartContracts(),
            fetchTokens(),
            fetchRollups(),
            fetchStakingAPY()
        ]);

        // Extract results with fallbacks
        const bakers = bakersData.status === 'fulfilled' ? bakersData.value : { total: 0, tz4Count: 0, tz4Percentage: 0 };
        const cycle = cycleInfo.status === 'fulfilled' ? cycleInfo.value : { cycle: 0, progress: 0, timeRemaining: 'N/A' };
        const gov = governance.status === 'fulfilled' ? governance.value : {};
        const staking = stakingData.status === 'fulfilled' ? stakingData.value : { stakingRatio: 0, delegatedRatio: 0 };
        const apy = stakingAPY.status === 'fulfilled' ? stakingAPY.value : { delegateAPY: 0, stakeAPY: 0 };

        const issuanceRate = issuanceData.status === "fulfilled" ? (issuanceData.value.total || 0) : 0;

        return {
            // Consensus
            totalBakers: bakers.total,
            currentIssuanceRate: issuanceRate,
            tz4Bakers: bakers.tz4Count,
            tz4Percentage: bakers.tz4Percentage,
            cycle: cycle.cycle,
            cycleProgress: cycle.progress,
            cycleTimeRemaining: cycle.timeRemaining,
            
            // Governance
            proposal: gov.proposal || 'N/A',
            proposalDescription: gov.proposalDescription || '',
            votingPeriod: gov.period || 'N/A',
            votingDescription: gov.periodDescription || '',
            participation: gov.participation || 0,
            participationDescription: gov.participationDescription || '',
            
            // Economy
            currentIssuanceRate: issuance.status === 'fulfilled' ? issuance.value.total : 0,
            protocolIssuanceRate: issuance.status === 'fulfilled' ? issuance.value.protocol : 0,
            lbIssuanceRate: issuance.status === 'fulfilled' ? issuance.value.lb : 0,
            stakingRatio: staking.stakingRatio,
            delegatedRatio: staking.delegatedRatio,
            totalSupply: totalSupply.status === 'fulfilled' ? totalSupply.value : 0,
            totalBurned: totalBurned.status === 'fulfilled' ? totalBurned.value : 0,
            delegateAPY: apy.delegateAPY,
            stakeAPY: apy.stakeAPY,
            
            // Network Activity
            transactionVolume24h: txVolume.status === 'fulfilled' ? txVolume.value : 0,
            contractCalls24h: contractCalls.status === 'fulfilled' ? contractCalls.value : 0,
            fundedAccounts: fundedAccounts.status === 'fulfilled' ? fundedAccounts.value : 0,
            
            // Ecosystem
            smartContracts: smartContracts.status === 'fulfilled' ? smartContracts.value : 0,
            tokens: tokens.status === 'fulfilled' ? tokens.value : 0,
            rollups: rollups.status === 'fulfilled' ? rollups.value : 0
        };
    } catch (error) {
        console.error('Failed to fetch all stats:', error);
        throw error;
    }
}

/**
 * Lightweight fetch for hero section only (upgrade clock + price bar)
 * Only fetches baker count, staking ratio — block data comes from RPC poller
 */
export async function fetchHeroStats() {
    try {
        const [bakersData, stakingData, issuanceData, cycleData] = await Promise.allSettled([
            fetchBakers(),
            fetchStakingRatio(),
            fetchIssuance(),
            fetchCycleInfo()
        ]);

        const bakers = bakersData.status === 'fulfilled' ? bakersData.value : { total: 0, tz4Count: 0, tz4Percentage: 0 };
        const staking = stakingData.status === 'fulfilled' ? stakingData.value : { stakingRatio: 0, delegatedRatio: 0 };

        const issuanceRate = issuanceData.status === "fulfilled" ? (issuanceData.value.total || 0) : 0;

        const cycleInfo = cycleData.status === 'fulfilled' ? cycleData.value : { cycle: 0, progress: 0, timeRemaining: '—' };

        return {
            totalBakers: bakers.total,
            currentIssuanceRate: issuanceRate,
            stakingRatio: staking.stakingRatio,
            cycle: cycleInfo.cycle,
            cycleProgress: cycleInfo.progress,
            cycleTimeRemaining: cycleInfo.timeRemaining,
        };
    } catch (error) {
        console.error('Failed to fetch hero stats:', error);
        return { totalBakers: 0, stakingRatio: 0, currentIssuanceRate: 0, cycle: 0, cycleProgress: 0, cycleTimeRemaining: '—' };
    }
}

/**
 * Check API health
 */
export async function checkApiHealth() {
    try {
        const [tzktHealth, octezHealth] = await Promise.allSettled([
            fetch(`${ENDPOINTS.tzkt.base}/head`),
            fetch(`${ENDPOINTS.octez.base}/chains/main/blocks/head/header`)
        ]);
        
        return {
            tzkt: tzktHealth.status === 'fulfilled' && tzktHealth.value.ok,
            octez: octezHealth.status === 'fulfilled' && octezHealth.value.ok
        };
    } catch (error) {
        return { tzkt: false, octez: false };
    }
}

// Historical data fetching
export async function fetchHistoricalData(range = '7d') {
    const { SUPABASE_CONFIG } = await import('./config.js');

    // Calculate start time based on range
    const now = new Date();
    let startTime;

    switch (range) {
        case '24h':
            startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            break;
        case '7d':
            startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
        case '30d':
            startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
        case 'all':
            startTime = new Date(HISTORY_START);
            break;
        default:
            startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    const url = `${SUPABASE_CONFIG.url}/rest/v1/tezos_history?timestamp=gte.${startTime.toISOString()}&order=timestamp.asc`;

    try {
        const response = await fetch(url, {
            headers: {
                'apikey': SUPABASE_CONFIG.key,
                'Authorization': `Bearer ${SUPABASE_CONFIG.key}`
            }
        });

        if (!response.ok) {
            throw new Error(`Supabase fetch failed: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Failed to fetch historical data:', error);
        return [];
    }
}
