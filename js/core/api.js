/**
 * Tezos Systems - API Module
 * Fetches data from TzKT API and Octez RPC
 */

import { API_URLS, CACHE_TTLS, FETCH_LIMITS, HISTORY_START, SUPABASE_CONFIG } from './config.js';
import { loadDataAsset } from './data-assets.js';
import { HISTORY_FRESHNESS_LIMITS } from './freshness-contracts.mjs';
import { calculatePercentage } from './utils.js';

export { HISTORY_FRESHNESS_LIMITS };

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

const HISTORICAL_PAGE_SIZE = 1000;
const LB_EMA_DISABLE_THRESHOLD = 1_000_000_000;
const LB_EMA_DENOMINATOR = 2_000_000_000;
const GOVERNANCE_SNAPSHOT_TTL = 60 * 1000;
export const DEFAULT_FETCH_TIMEOUT_MS = 15_000;
export const MAX_RETRY_AFTER_MS = 15_000;
const historicalDataCache = new Map();
const reportedHistoryFetchFailures = new Set();
const lastGoodCategoryValues = new Map();
let lastGoodStakingAPY = null;
export const DOMAIN_HISTORY_TABLES = {
    market: 'market_history',
    networkHealth: 'network_health_history',
    tezosx: 'tezosx_history',
    governance: 'governance_period_history'
};
function qualityFromSettled(entries, fallbacks) {
    const values = {};
    const failedCategories = [];
    const staleCategories = [];
    const unavailableCategories = [];
    const errors = {};
    const staleObservedAt = {};

    for (const [category, result] of Object.entries(entries)) {
        if (result.status === 'fulfilled') {
            const valueQuality = result.value?._quality;
            values[category] = result.value;
            if (valueQuality?.status === 'stale') {
                failedCategories.push(category);
                staleCategories.push(category);
                if (valueQuality.observedAt) staleObservedAt[category] = valueQuality.observedAt;
            } else if (valueQuality?.status === 'partial') {
                failedCategories.push(category);
                unavailableCategories.push(category);
                if (valueQuality.error) errors[category] = valueQuality.error;
            } else if (valueQuality?.status === 'unavailable') {
                failedCategories.push(category);
                unavailableCategories.push(category);
                if (valueQuality.error) errors[category] = valueQuality.error;
            } else {
                lastGoodCategoryValues.set(category, {
                    value: result.value,
                    observedAt: valueQuality?.observedAt || new Date().toISOString()
                });
            }
            continue;
        }

        failedCategories.push(category);
        errors[category] = result.reason?.message || String(result.reason || 'request failed');
        const lastGood = lastGoodCategoryValues.get(category);
        if (lastGood) {
            values[category] = lastGood.value;
            staleCategories.push(category);
            staleObservedAt[category] = lastGood.observedAt;
        } else {
            values[category] = fallbacks[category];
            unavailableCategories.push(category);
        }
    }

    const status = unavailableCategories.length > 0
        ? 'partial'
        : staleCategories.length > 0
            ? 'stale'
            : 'live';
    const staleTimes = Object.values(staleObservedAt)
        .map((value) => Date.parse(value))
        .filter((value) => Number.isFinite(value) && value > 0);
    const observedAt = staleTimes.length
        ? new Date(Math.min(...staleTimes)).toISOString()
        : new Date().toISOString();

    return {
        values,
        quality: {
            status,
            observedAt,
            failedCategories,
            staleCategories,
            unavailableCategories,
            ...(Object.keys(staleObservedAt).length ? { staleObservedAt } : {}),
            ...(Object.keys(errors).length ? { errors } : {})
        }
    };
}

/**
 * Check if cached data is still valid
 */
function isCacheValid(key) {
    return cache.timestamps[key] && (Date.now() - cache.timestamps[key]) < cache.ttl;
}

function abortError(message = 'The operation was aborted.') {
    if (typeof DOMException === 'function') return new DOMException(message, 'AbortError');
    const error = new Error(message);
    error.name = 'AbortError';
    return error;
}

function timeoutError(timeoutMs) {
    if (typeof DOMException === 'function') return new DOMException(`Request timed out after ${timeoutMs}ms.`, 'TimeoutError');
    const error = new Error(`Request timed out after ${timeoutMs}ms.`);
    error.name = 'TimeoutError';
    return error;
}

function requestSignal(resource, options) {
    if (options?.signal) return options.signal;
    if (typeof Request !== 'undefined' && resource instanceof Request) return resource.signal;
    return null;
}

/**
 * Run one fetch attempt with a deadline while forwarding a caller-provided
 * AbortSignal. Each retry gets a fresh deadline; a caller abort ends the whole
 * retry sequence immediately.
 */
export async function fetchWithDeadline(resource, options = {}, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
    const callerSignal = requestSignal(resource, options);
    const controller = new AbortController();
    const fetchOptions = { ...options, signal: controller.signal };
    let timeoutId = null;
    let deadlineStarted = false;

    const forwardAbort = () => controller.abort(callerSignal?.reason || abortError());
    if (callerSignal?.aborted) forwardAbort();
    else if (callerSignal) callerSignal.addEventListener('abort', forwardAbort, { once: true });

    const startDeadline = () => {
        if (deadlineStarted) return;
        deadlineStarted = true;
        if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
            timeoutId = setTimeout(() => controller.abort(timeoutError(timeoutMs)), timeoutMs);
        }
    };

    const queueAware = typeof window !== 'undefined'
        && window.__tzktThrottle?.supportsDispatchHook === true;
    if (queueAware) fetchOptions.__tezosSystemsOnDispatch = startDeadline;
    else startDeadline();

    try {
        return await fetch(resource, fetchOptions);
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
        if (callerSignal) callerSignal.removeEventListener('abort', forwardAbort);
    }
}

function sleepWithSignal(delayMs, signal) {
    if (!signal) return new Promise((resolve) => setTimeout(resolve, delayMs));
    if (signal.aborted) return Promise.reject(signal.reason || abortError());

    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            signal.removeEventListener('abort', onAbort);
            resolve();
        }, delayMs);
        const onAbort = () => {
            clearTimeout(timeoutId);
            reject(signal.reason || abortError());
        };
        signal.addEventListener('abort', onAbort, { once: true });
    });
}

function getHistoryStartTime(range = '7d') {
    const now = new Date();

    switch (range) {
        case '24h':
            return new Date(now.getTime() - 24 * 60 * 60 * 1000);
        case '7d':
            return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        case '30d':
            return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        case '90d':
            return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        case 'all':
            return new Date(HISTORY_START);
        default:
            return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }
}

/**
 * Shared statistics/current fetch — deduplicates concurrent requests
 * Multiple functions need this endpoint; without dedup they'd all miss cache in parallel
 */
let _statsPromise = null;
export async function fetchSharedStats() {
    // Request lifetime owns deduplication; fetchWithRetry owns the data TTL.
    if (!_statsPromise) {
        _statsPromise = fetchWithRetry(`${ENDPOINTS.tzkt.base}${ENDPOINTS.tzkt.statistics}`)
            .finally(() => { _statsPromise = null; });
    }
    return _statsPromise;
}

/**
 * Fetch with retry logic and caching
 */
export async function fetchWithRetry(url, options = {}, retries = 3) {
    const {
        memoryCache = true,
        timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
        responseType = 'json',
        ...fetchOptions
    } = options || {};
    const callerSignal = fetchOptions.signal || null;

    if (callerSignal?.aborted) throw callerSignal.reason || abortError();

    // Check cache first
    if (memoryCache && isCacheValid(url)) {
        return cache.data[url];
    }

    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetchWithDeadline(url, {
                ...fetchOptions,
                headers: {
                    'Accept': 'application/json',
                    ...fetchOptions.headers
                }
            }, timeoutMs);

            if (response.status === 429) {
                // Rate limited — respect Retry-After or use exponential backoff
                const retryAfterHeader = response.headers.get('Retry-After') || '';
                const retryAfterSeconds = parseInt(retryAfterHeader, 10);
                const retryAfterDate = Date.parse(retryAfterHeader);
                const retryAfterMs = Number.isFinite(retryAfterSeconds)
                    ? retryAfterSeconds * 1000
                    : Number.isFinite(retryAfterDate)
                        ? Math.max(0, retryAfterDate - Date.now())
                        : 0;
                if (i === retries - 1) {
                    throw new Error(`HTTP 429: rate limit persisted after ${retries} attempt${retries === 1 ? '' : 's'}`);
                }
                const requestedBackoffMs = retryAfterMs > 0 ? retryAfterMs : 2000 * Math.pow(2, i);
                const backoffMs = Math.min(MAX_RETRY_AFTER_MS, Math.max(0, requestedBackoffMs));
                console.warn(`⚠️ Rate limited (429) on ${url}, backing off ${Math.round(backoffMs/1000)}s`);
                await response.body?.cancel().catch(() => {});
                await sleepWithSignal(backoffMs, callerSignal);
                continue;
            }

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = responseType === 'text' ? await response.text() : await response.json();
            
            if (memoryCache) {
                cache.data[url] = data;
                cache.timestamps[url] = Date.now();
            }
            
            return data;
        } catch (error) {
            if (callerSignal?.aborted) throw error;
            if (i === retries - 1) throw error;
            await sleepWithSignal(1000 * (i + 1), callerSignal);
        }
    }
    throw new Error('Max retries exceeded');
}

let _currentVotingPeriod = null;
let _currentVotingPeriodAt = 0;
let _currentVotingPeriodPromise = null;

export async function fetchCurrentVotingPeriod({ force = false } = {}) {
    const now = Date.now();
    if (!force && _currentVotingPeriod && now - _currentVotingPeriodAt < GOVERNANCE_SNAPSHOT_TTL) {
        return _currentVotingPeriod;
    }
    if (!force && _currentVotingPeriodPromise) {
        return _currentVotingPeriodPromise;
    }

    const url = `${ENDPOINTS.tzkt.base}${ENDPOINTS.tzkt.voting}`;
    const request = fetchWithRetry(
        url,
        { cache: force ? 'no-store' : 'default', memoryCache: false },
        2
    ).then((period) => {
        if (_currentVotingPeriodPromise === request) {
            _currentVotingPeriod = period;
            _currentVotingPeriodAt = Date.now();
        }
        return period;
    }).finally(() => {
        if (_currentVotingPeriodPromise === request) _currentVotingPeriodPromise = null;
    });
    _currentVotingPeriodPromise = request;
    return request;
}

/**
 * Fetch text response (for RPC endpoints that return raw values)
 */
async function fetchText(url) {
    if (isCacheValid(url)) {
        return cache.data[url];
    }
    return fetchWithRetry(url, { responseType: 'text' });
}

/**
 * Fetch and aggregate the live vote tally for the current voting period.
 * Routed through fetchWithRetry so it inherits 429 backoff + caching — this is
 * the call that backs the governance headline, so it must survive rate limits.
 * Returns aggregated voting power by ballot, or null on failure (caller degrades).
 */
export async function fetchVoteTally() {
    try {
        const votes = await fetchWithRetry(
            `${ENDPOINTS.tzkt.base}/voting/periods/current/voters?status.ne=none&limit=10000&select=status,votingPower`
        );
        if (!Array.isArray(votes)) return null;
        let yay = 0, nay = 0, pass = 0;
        for (const v of votes) {
            const status = String(v.status || '').replace('voted_', '');
            if (status === 'yay') yay += v.votingPower || 0;
            else if (status === 'nay') nay += v.votingPower || 0;
            else if (status === 'pass') pass += v.votingPower || 0;
        }
        return { yay, nay, pass, total: yay + nay + pass, voterCount: votes.length };
    } catch (error) {
        console.warn('Failed to fetch vote tally:', error);
        return null;
    }
}

async function fetchLiquidityBakingSubsidyState() {
    const blocks = await fetchWithRetry(`${ENDPOINTS.tzkt.base}/blocks?sort.desc=level&limit=1&select=level,lbToggleEma`);
    const latest = Array.isArray(blocks) ? blocks[0] : null;
    const ema = Number(latest?.lbToggleEma);
    const hasEma = Number.isFinite(ema);
    return {
        disabled: hasEma && ema >= LB_EMA_DISABLE_THRESHOLD,
        ema: hasEma ? ema : null,
        emaPct: hasEma ? (ema / LB_EMA_DENOMINATOR) * 100 : null
    };
}

function parseMutezText(value) {
    const parsed = parseInt(String(value ?? '').replace(/"/g, ''), 10);
    return Number.isFinite(parsed) ? parsed : 0;
}

export function getTzktTotalStaked(stats = {}) {
    const total = Number(stats.totalOwnStaked || 0) + Number(stats.totalExternalStaked || 0);
    return total > 0 ? total : Number(stats.totalFrozen || 0);
}

export function getTzktTotalDelegated(stats = {}) {
    return Number(stats.totalOwnDelegated || 0) + Number(stats.totalExternalDelegated || 0);
}

/**
 * TzKT exposes a baker's edge_of_baking_over_staking as a billionth-scaled
 * fraction. It is the baker's share of externally staked rewards, so an
 * external staker receives the remaining (1 - edge) share.
 */
export function getExternalStakerApy(grossStakeApy, edgeOfBakingOverStaking) {
    const gross = Number(grossStakeApy);
    if (!Number.isFinite(gross) || gross <= 0 || edgeOfBakingOverStaking == null) return null;

    const edge = Number(edgeOfBakingOverStaking) / 1e9;
    if (!Number.isFinite(edge) || edge < 0 || edge > 1) return null;
    return Math.round(gross * (1 - edge) * 10) / 10;
}

// ─── Shared dedup fetchers ─────────────────────────────────────────────────────

/**
 * Deduplicated fetch for /context/constants (used by fetchCycleInfo + fetchIssuance)
 */
let _constantsPromise = null;
function fetchSharedConstants() {
    if (!_constantsPromise) {
        _constantsPromise = fetchWithRetry(`${API_URLS.octez}/chains/main/blocks/head/context/constants`)
            .catch(() => null)
            .finally(() => { _constantsPromise = null; });
    }
    return _constantsPromise;
}

export async function fetchProtocolConstants() {
    return fetchSharedConstants();
}

/**
 * Deduplicated fetch for /issuance/current_yearly_rate (used by fetchIssuance + fetchStakingAPY)
 */
let _yearlyRatePromise = null;
function fetchSharedYearlyRate() {
    if (!_yearlyRatePromise) {
        _yearlyRatePromise = fetchText(`${API_URLS.octez}/chains/main/blocks/head/context/issuance/current_yearly_rate`)
            .catch(() => null)
            .finally(() => { _yearlyRatePromise = null; });
    }
    return _yearlyRatePromise;
}

/**
 * Fetch baker data from TzKT API
 * Optimized: uses /count endpoint + select fields (saves ~2-5MB vs full baker list)
 */
// ─── fetchBakers dedup ─────────────────────────────────────────────────────
let _bakersPromise = null;
async function fetchBakers() {
    if (_bakersPromise) return _bakersPromise;
    _bakersPromise = _doFetchBakers();
    try { return await _bakersPromise; }
    finally { _bakersPromise = null; }
}

async function _doFetchBakers() {
    // Match the All Bakers Attest activation set: funded bakers with positive
    // current baking power. TzKT exposes the active consensus key directly;
    // historical update_consensus_key ops can include keys that are still pending.
    const bakerUrl = `${ENDPOINTS.tzkt.base}${ENDPOINTS.tzkt.bakers}?active=true&select=address,consensusAddress,bakingPower&limit=${FETCH_LIMITS.bakers}`;
    const delegates = await fetchWithRetry(bakerUrl);
    if (!Array.isArray(delegates)) {
        throw new Error('Unexpected active baker response');
    }
    const fundedBakers = delegates.filter((baker) => Number(baker.bakingPower || 0) > 0);
    if (!fundedBakers.length) {
        throw new Error('Active baker response contained no funded bakers');
    }
    const total = fundedBakers.length;

    const tz4Count = fundedBakers.filter((baker) => {
        const consensusAddress = baker.consensusAddress || baker.address || '';
        return consensusAddress.startsWith('tz4');
    }).length;

    const percentage = calculatePercentage(tz4Count, total);

    return {
        total,
        tz4Count,
        tz4Percentage: percentage
    };
}

/**
 * Fetch cycle info from Octez RPC.
 */
export async function fetchCycleInfo() {
    const header = await fetchWithRetry(`${ENDPOINTS.octez.base}/chains/main/blocks/head/header`);
    const headId = encodeURIComponent(header?.hash || 'head');
    const metadata = await fetchWithRetry(`${ENDPOINTS.octez.base}/chains/main/blocks/${headId}/metadata`);
    const levelInfo = metadata.level_info || {};
    const head = {
        level: header.level,
        timestamp: header.timestamp,
        cycle: levelInfo.cycle
    };

    // Compute cycle boundaries from metadata (no TzKT /cycles needed)
    const currentLevel = Number(header.level);
    const cyclePosition = levelInfo.cycle_position == null ? NaN : Number(levelInfo.cycle_position);
    const cycleNumber = levelInfo.cycle == null ? null : Number(levelInfo.cycle);
    if (!Number.isFinite(currentLevel) || !Number.isFinite(cyclePosition) || cyclePosition < 0) {
        return {
            cycle: Number.isFinite(cycleNumber) ? cycleNumber : null,
            blockLevel: Number.isFinite(currentLevel) ? currentLevel : null,
            blockTime: header.timestamp || null,
            cycleStartBlock: null,
            blocksPerCycle: null,
            progress: null,
            timeRemaining: '—'
        };
    }
    const cycleStartBlock = currentLevel - cyclePosition;

    // Fetch block time from RPC constants (don't hardcode 6s)
    let blockTimeSec = 6; // safe fallback
    let actualBlocksPerCycle = 14400; // safe fallback
    try {
        const constants = await fetchSharedConstants();
        if (constants && constants.minimal_block_delay) {
            blockTimeSec = parseInt(constants.minimal_block_delay);
        }
        if (constants && constants.blocks_per_cycle) {
            actualBlocksPerCycle = parseInt(constants.blocks_per_cycle);
        }
    } catch (e) {
        // Use fallback
    }
    // Recompute with actual blocks_per_cycle from constants
    const cycleEndBlockActual = cycleStartBlock + actualBlocksPerCycle - 1;

    const currentBlock = currentLevel;
    // cycleStartBlock computed above from RPC metadata
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
        cycle: Number.isFinite(cycleNumber) ? cycleNumber : null,
        blockLevel: head.level,
        blockTime: head.timestamp,
        cycleStartBlock,
        blocksPerCycle: actualBlocksPerCycle,
        progress: Math.min(progress, 100),
        timeRemaining
    };
}

/**
 * Fetch governance/voting info
 */
function chooseVotingProposal(period, epoch) {
    const proposals = epoch?.proposals || [];
    const scoped = proposals.filter(proposal => {
        const first = proposal.firstPeriod ?? Number.NEGATIVE_INFINITY;
        const last = proposal.lastPeriod ?? Number.POSITIVE_INFINITY;
        return first <= period.index && period.index <= last;
    });

    return scoped.find(proposal => proposal.status === 'active')
        || scoped.find(proposal => ['accepted', 'rejected'].includes(proposal.status))
        || scoped[0]
        || proposals.find(proposal => proposal.status === 'accepted')
        || proposals[0]
        || null;
}

function proposalDisplayName(proposal) {
    return proposal?.alias
        || proposal?.extras?.alias
        || proposal?.metadata?.alias
        || (proposal?.hash ? `${proposal.hash.slice(0, 8)}...` : null);
}

let _governanceReportPromise = null;
async function fetchGovernanceReport() {
    if (!_governanceReportPromise) {
        _governanceReportPromise = loadDataAsset('governanceReport').catch(() => null);
    }
    return _governanceReportPromise;
}

function proposalDisplayNameWithReport(proposal, report) {
    if (report?.currentGovernance?.proposalHash === proposal?.hash && report.currentGovernance.proposalName) {
        return report.currentGovernance.proposalName;
    }
    return proposalDisplayName(proposal);
}

function isBallotPeriod(kind) {
    return kind === 'exploration' || kind === 'promotion';
}

function governancePeriodLabel(kind) {
    const labels = {
        proposal: 'Proposal',
        exploration: 'Exploration',
        testing: 'Cooldown',
        cooldown: 'Cooldown',
        promotion: 'Promotion',
        adoption: 'Adoption'
    };
    return labels[kind] || (kind ? kind.charAt(0).toUpperCase() + kind.slice(1) : 'Unknown');
}

function governanceProposalDescription(kind, hasProposal) {
    if (!hasProposal) return 'No active proposal';
    if (kind === 'testing' || kind === 'cooldown') return 'Testing and review before final vote';
    if (kind === 'adoption') return 'Activation preparation period';
    if (kind === 'proposal') return 'Proposal selection in progress';
    return 'In progress';
}

function governanceDaysLeft(endTime) {
    if (!endTime) return null;
    const diff = new Date(endTime).getTime() - Date.now();
    if (!Number.isFinite(diff)) return null;
    return Math.max(0, Math.ceil(diff / 86400000));
}

async function fetchGovernance() {
    try {
        const [voting, report] = await Promise.all([
            fetchCurrentVotingPeriod(),
            fetchGovernanceReport()
        ]);
        let epoch = null;
        if (voting.epoch !== undefined && voting.epoch !== null) {
            try {
                epoch = await fetchWithRetry(`${ENDPOINTS.tzkt.base}/voting/epochs/${voting.epoch}`);
            } catch (_) {
                epoch = null;
            }
        }
        
        // Get proposal info if available
        const proposal = chooseVotingProposal(voting, epoch);
        const proposalName = proposalDisplayNameWithReport(proposal, report) || 'None';
        
        // Calculate ballot participation only during Exploration and Promotion.
        const hasBallots = isBallotPeriod(voting.kind);
        const participatedPower = hasBallots
            ? (voting.yayVotingPower || 0) + (voting.nayVotingPower || 0) + (voting.passVotingPower || 0)
            : 0;
        const participation = hasBallots && voting.totalVotingPower
            ? calculatePercentage(participatedPower, voting.totalVotingPower)
            : hasBallots && voting.totalVoters && voting.totalBakers
                ? calculatePercentage(voting.totalVoters, voting.totalBakers)
                : null;
        const quorumNeeded = hasBallots ? Number(voting.ballotsQuorum ?? report?.currentGovernance?.tally?.ballotsQuorum) : null;
        const yayNayPower = (voting.yayVotingPower || 0) + (voting.nayVotingPower || 0);
        const yayPct = hasBallots && yayNayPower > 0
            ? calculatePercentage(voting.yayVotingPower || 0, yayNayPower)
            : null;
        const daysLeft = governanceDaysLeft(voting.endTime);
        
        // Format period kind
        const periodKind = governancePeriodLabel(voting.kind);
        
        // Calculate end date
        const endDate = voting.endTime ? new Date(voting.endTime).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        }) : 'N/A';
        
        return {
            proposal: proposalName,
            proposalDescription: governanceProposalDescription(voting.kind, Boolean(proposal)),
            period: periodKind,
            periodDescription: `Ends ${endDate}`,
            participation: participation,
            participationQuorum: Number.isFinite(quorumNeeded) ? quorumNeeded : null,
            participationYayPct: Number.isFinite(yayPct) ? yayPct : null,
            participationDaysLeft: daysLeft,
            govPeriodKind: voting.kind,
            govProposalName: proposalName === 'None' ? null : proposalName,
            participationDescription: hasBallots && voting.yayBallots !== undefined
                ? `${(voting.yayBallots || 0) + (voting.nayBallots || 0) + (voting.passBallots || 0)} ballots`
                : hasBallots
                    ? `${voting.totalVoters || 0} voters`
                    : `No ballots during ${periodKind}`
        };
    } catch (error) {
        console.error('Failed to fetch governance:', error);

        return {
            _quality: {
                status: 'unavailable',
                observedAt: null,
                checkedAt: new Date().toISOString(),
                error: error.message
            },
            proposal: 'N/A',
            proposalDescription: 'Error loading',
            period: 'N/A',
            periodDescription: 'Error loading',
            participation: null,
            participationDescription: 'Error loading'
        };
    }
}

/**
 * Fetch current yearly issuance rate.
 * Uses Octez RPC for protocol rate plus active LB subsidy when the EMA has not disabled it.
 */
export async function fetchIssuance() {
    try {
        const [rpcRateRaw, constantsRaw, supplyRaw, lbStateRaw] = await Promise.allSettled([
            fetchSharedYearlyRate(),
            fetchSharedConstants(),
            fetchText(`${ENDPOINTS.octez.base}/chains/main/blocks/head/context/total_supply`),
            fetchLiquidityBakingSubsidyState()
        ]);

        // Protocol-only rate from Octez RPC
        const parsedProtocolRate = rpcRateRaw.status === 'fulfilled' && rpcRateRaw.value != null
            ? parseFloat(String(rpcRateRaw.value).replace(/"/g, ''))
            : NaN;
        const protocolRate = Number.isFinite(parsedProtocolRate) && parsedProtocolRate > 0
            ? parsedProtocolRate
            : null;

        if (protocolRate == null) {
            return {
                total: null,
                protocol: null,
                lb: null,
                _quality: {
                    status: 'unavailable',
                    observedAt: null,
                    checkedAt: new Date().toISOString(),
                    error: 'Protocol issuance rate unavailable'
                }
            };
        }

        // LB subsidy: constant is per-block but denominated for ~1 min blocks.
        // Treat as XTZ-per-minute to match TzKT methodology.
        let lbRate = null;
        const constants = constantsRaw.status === 'fulfilled' ? constantsRaw.value : null;
        const supplyMutez = supplyRaw.status === 'fulfilled'
            ? parseInt(String(supplyRaw.value).replace(/"/g, ''), 10)
            : null;
        const lbState = lbStateRaw.status === 'fulfilled'
            ? lbStateRaw.value
            : { disabled: null, ema: null, emaPct: null };
        const rawLbEma = lbState?.ema;
        const lbStateKnown = rawLbEma !== null
            && rawLbEma !== undefined
            && rawLbEma !== ''
            && Number.isFinite(Number(rawLbEma));
        const lbDisabled = lbStateKnown ? Boolean(lbState.disabled) : null;
        const lbSubsidy = Number(constants?.liquidity_baking_subsidy);
        const lbRateInputsKnown = Boolean(constants)
            && Number.isFinite(supplyMutez)
            && supplyMutez > 0
            && Number.isFinite(lbSubsidy)
            && lbSubsidy >= 0;

        if (lbDisabled === true) {
            lbRate = 0;
        } else if (lbDisabled === false && lbRateInputsKnown) {
            const minutesPerYear = 365.25 * 24 * 60;
            const lbXTZPerYear = (lbSubsidy / 1e6) * minutesPerYear;
            const totalSupplyXTZ = supplyMutez / 1e6;
            lbRate = (lbXTZPerYear / totalSupplyXTZ) * 100;
        }

        const lbInputsAvailable = lbStateKnown
            && (lbDisabled === true || lbRateInputsKnown)
            && Number.isFinite(lbRate);
        return {
            total: lbInputsAvailable ? protocolRate + lbRate : null,
            protocol: protocolRate,
            lb: lbInputsAvailable ? lbRate : null,
            lbDisabled,
            lbEma: lbStateKnown ? Number(rawLbEma) : null,
            lbEmaPct: lbStateKnown
                && lbState.emaPct !== null
                && lbState.emaPct !== undefined
                && lbState.emaPct !== ''
                && Number.isFinite(Number(lbState.emaPct))
                ? Number(lbState.emaPct)
                : null,
            _quality: {
                status: lbInputsAvailable ? 'live' : 'partial',
                observedAt: new Date().toISOString(),
                ...(lbInputsAvailable ? {} : { error: 'Liquidity Baking issuance inputs unavailable' })
            }
        };
    } catch (error) {
        console.error('Failed to fetch issuance:', error);
        return {
            total: null,
            protocol: null,
            lb: null,
            _quality: {
                status: 'unavailable',
                observedAt: null,
                checkedAt: new Date().toISOString(),
                error: error.message
            }
        };
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
 * Fetch all-time transaction operation count.
 * Matches the 24h transaction counter by using TzKT's transaction operation
 * surface without narrowing to applied-only status.
 */
async function fetchTotalTransactions() {
    const url = `${ENDPOINTS.tzkt.base}/operations/transactions/count`;
    return await fetchWithRetry(url);
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

let _recentActivityCutoffPromise = null;
let _recentActivityCutoffTimestamp = 0;
async function fetchRecentActivityCutoffLevel() {
    if (_recentActivityCutoffPromise && Date.now() - _recentActivityCutoffTimestamp < 5000) {
        return _recentActivityCutoffPromise;
    }

    _recentActivityCutoffTimestamp = Date.now();
    _recentActivityCutoffPromise = (async () => {
        const head = await fetchWithRetry(`${ENDPOINTS.tzkt.base}${ENDPOINTS.tzkt.head}`);
        let blockDelaySeconds = 6;
        try {
            const constants = await fetchSharedConstants();
            const parsedDelay = parseInt(constants?.minimal_block_delay, 10);
            if (Number.isFinite(parsedDelay) && parsedDelay > 0) {
                blockDelaySeconds = parsedDelay;
            }
        } catch (error) {
            // The 6 second fallback matches current Tezos mainnet timing.
        }

        const recentBlocks = Math.ceil((24 * 60 * 60) / blockDelaySeconds);
        return Math.max(0, (head?.level || 0) - recentBlocks);
    })();

    return _recentActivityCutoffPromise;
}

/**
 * Fetch staking ratio and delegated percentage
 * Matches TzKT's Proof-of-Stake totals: own staked + external staked.
 */
export async function fetchStakingRatio() {
    try {
        const [statsResult, frozenStakeResult, supplyResult] = await Promise.allSettled([
            fetchSharedStats(),
            fetchText(`${ENDPOINTS.octez.base}${ENDPOINTS.octez.totalFrozenStake}`),
            fetchText(`${ENDPOINTS.octez.base}${ENDPOINTS.octez.totalSupply}`)
        ]);

        const stats = statsResult.status === 'fulfilled' && statsResult.value && typeof statsResult.value === 'object'
            ? statsResult.value
            : {};
        const readStatsNumber = (field) => {
            if (!Object.prototype.hasOwnProperty.call(stats, field) || stats[field] === null || stats[field] === '') {
                return null;
            }
            const value = Number(stats[field]);
            return Number.isFinite(value) && value >= 0 ? value : null;
        };
        const statsSupply = readStatsNumber('totalSupply');
        const ownStaked = readStatsNumber('totalOwnStaked');
        const externalStaked = readStatsNumber('totalExternalStaked');
        const legacyFrozen = readStatsNumber('totalFrozen');
        const ownDelegated = readStatsNumber('totalOwnDelegated');
        const externalDelegated = readStatsNumber('totalExternalDelegated');
        const bakingPower = readStatsNumber('totalBakingPower');
        const totalDelegators = readStatsNumber('totalDelegators');
        const totalStakers = readStatsNumber('totalStakers');
        const rpcSupply = supplyResult.status === 'fulfilled' ? parseMutezText(supplyResult.value) : 0;
        const totalSupply = (statsSupply > 0 ? statsSupply : 0) || rpcSupply || 0;
        
        if (totalSupply === 0) {
            return {
                _quality: {
                    status: 'unavailable',
                    observedAt: null,
                    checkedAt: new Date().toISOString(),
                    error: 'Staking supply inputs unavailable'
                },
                stakingRatio: null,
                delegatedRatio: null,
                totalStaked: null,
                totalDelegated: null,
                bakingPower: null,
                totalDelegators: null,
                totalStakers: null,
                rewardAccounts: null
            };
        }
        
        const rpcFrozenStake = frozenStakeResult.status === 'fulfilled'
            ? parseMutezText(frozenStakeResult.value)
            : 0;
        const tzktStaked = ownStaked !== null && externalStaked !== null && ownStaked + externalStaked > 0
            ? ownStaked + externalStaked
            : legacyFrozen !== null && legacyFrozen > 0
                ? legacyFrozen
                : 0;
        const totalStaked = tzktStaked || rpcFrozenStake || 0;
        if (totalStaked <= 0) {
            return {
                _quality: {
                    status: 'unavailable',
                    observedAt: null,
                    checkedAt: new Date().toISOString(),
                    error: 'Frozen stake inputs unavailable'
                },
                stakingRatio: null,
                delegatedRatio: null,
                totalStaked: null,
                totalDelegated: null,
                bakingPower: null,
                totalDelegators: null,
                totalStakers: null,
                rewardAccounts: null
            };
        }
        const stakingRatio = (totalStaked / totalSupply) * 100;
        
        // Delegated = own delegated + external delegated (not locked/staked)
        const totalDelegated = ownDelegated !== null && externalDelegated !== null
            ? ownDelegated + externalDelegated
            : null;
        const delegatedRatio = totalDelegated === null ? null : (totalDelegated / totalSupply) * 100;
        const missingFields = [
            ...(totalDelegated === null ? ['totalOwnDelegated/totalExternalDelegated'] : []),
            ...(bakingPower === null ? ['totalBakingPower'] : []),
            ...(totalDelegators === null ? ['totalDelegators'] : []),
            ...(totalStakers === null ? ['totalStakers'] : [])
        ];
        const hasCompleteStats = missingFields.length === 0;

        const stakingQuality = {
            status: hasCompleteStats ? 'live' : 'partial',
            observedAt: new Date().toISOString(),
            failedCategories: hasCompleteStats ? [] : ['networkStats'],
            staleCategories: [],
            unavailableCategories: hasCompleteStats ? [] : ['networkStats'],
            ...(hasCompleteStats ? {} : {
                missingFields,
                error: `TzKT network totals unavailable: ${missingFields.join(', ')}`
            })
        };
        return {
            _quality: stakingQuality,
            stakingRatio,
            delegatedRatio,
            totalStaked: totalStaked / 1e6,
            totalDelegated: totalDelegated === null ? null : totalDelegated / 1e6,
            bakingPower: bakingPower === null ? null : bakingPower / 1e6,
            totalDelegators,
            totalStakers,
            rewardAccounts: totalDelegators === null || totalStakers === null
                ? null
                : totalDelegators + totalStakers
        };
    } catch (error) {
        console.error('Failed to fetch staking ratio:', error);
        return {
            _quality: {
                status: 'unavailable',
                observedAt: null,
                checkedAt: new Date().toISOString(),
                error: error.message
            },
            stakingRatio: null,
            delegatedRatio: null,
            totalStaked: null,
            totalDelegated: null,
            bakingPower: null,
            totalDelegators: null,
            totalStakers: null,
            rewardAccounts: null
        };
    }
}

/**
 * Fetch total supply
 */
async function fetchTotalSupply() {
    const url = `${ENDPOINTS.octez.base}${ENDPOINTS.octez.totalSupply}`;
    const supplyMutez = await fetchText(url);
    const supply = parseMutezText(supplyMutez) / 1e6;
    if (supply <= 0) throw new Error('Total supply unavailable');
    return supply;
}

/**
 * Fetch total burned XTZ
 */
async function fetchTotalBurned() {
    try {
        const stats = await fetchSharedStats();
        const rawBurned = stats?.totalBurned;
        if (rawBurned === null || rawBurned === undefined || rawBurned === '') {
            throw new Error('Total burned unavailable');
        }
        const burnedMutez = Number(rawBurned);
        if (!Number.isFinite(burnedMutez) || burnedMutez < 0) {
            throw new Error('Total burned is invalid');
        }
        return burnedMutez / 1e6;
    } catch (error) {
        console.error('Failed to fetch burned:', error);
        throw error;
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
 * Fetch accounts first seen in the last 24h
 */
async function fetchNewAccounts() {
    const cutoffLevel = await fetchRecentActivityCutoffLevel();
    const url = `${ENDPOINTS.tzkt.base}${ENDPOINTS.tzkt.accounts}?firstActivity.gt=${cutoffLevel}`;
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
 * Fetch smart contracts active in the last 24h
 */
async function fetchActiveContracts() {
    const cutoffLevel = await fetchRecentActivityCutoffLevel();
    const url = `${ENDPOINTS.tzkt.base}${ENDPOINTS.tzkt.contracts}?lastActivity.gt=${cutoffLevel}`;
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
    let failedInputs = [];
    try {
        const [rateResult, statsResult, frozenStakeResult, supplyResult, constantsResult] = await Promise.allSettled([
            fetchSharedYearlyRate(),
            fetchSharedStats(),
            fetchText(`${ENDPOINTS.octez.base}${ENDPOINTS.octez.totalFrozenStake}`),
            fetchText(`${ENDPOINTS.octez.base}${ENDPOINTS.octez.totalSupply}`),
            fetchSharedConstants()
        ]);

        const rateString = rateResult.status === 'fulfilled' ? rateResult.value : '0';
        const netIssuance = parseFloat(String(rateString || '0').replace(/"/g, ''));
        const stats = statsResult.status === 'fulfilled' ? statsResult.value : {};
        const readNonNegativeStat = (key) => {
            const raw = stats?.[key];
            if (raw === null || raw === undefined || raw === '') return null;
            const parsed = Number(raw);
            return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
        };
        const ownDelegatedMutez = readNonNegativeStat('totalOwnDelegated');
        const externalDelegatedMutez = readNonNegativeStat('totalExternalDelegated');
        const hasDelegatedFields = ownDelegatedMutez !== null && externalDelegatedMutez !== null;
        const fallbackSupplyMutez = supplyResult.status === 'fulfilled' ? parseMutezText(supplyResult.value) : 0;
        const fallbackFrozenStakeMutez = frozenStakeResult.status === 'fulfilled' ? parseMutezText(frozenStakeResult.value) : 0;
        const supplyMutez = Number(stats.totalSupply || 0) || fallbackSupplyMutez || 0;
        const stakedMutez = getTzktTotalStaked(stats) || fallbackFrozenStakeMutez || 0;
        const delegatedMutez = hasDelegatedFields
            ? ownDelegatedMutez + externalDelegatedMutez
            : NaN;
        const delegationPowerDivisor = constantsResult.status === 'fulfilled'
            ? Number(constantsResult.value?.edge_of_staking_over_delegation)
            : NaN;

        failedInputs = [...new Set([
            rateResult.status === 'rejected' || !Number.isFinite(netIssuance) || netIssuance <= 0 ? 'issuanceRate' : null,
            statsResult.status === 'rejected' ? 'networkStats' : null,
            !hasDelegatedFields ? 'delegatedSupply' : null,
            frozenStakeResult.status === 'rejected' && stakedMutez <= 0 ? 'frozenStake' : null,
            supplyResult.status === 'rejected' && supplyMutez <= 0 ? 'totalSupply' : null,
            !Number.isFinite(supplyMutez) || supplyMutez <= 0 ? 'supply' : null,
            !Number.isFinite(stakedMutez) || stakedMutez <= 0 ? 'stakedSupply' : null,
            !Number.isFinite(delegatedMutez) || delegatedMutez < 0 ? 'delegatedSupply' : null,
            !Number.isFinite(delegationPowerDivisor) || delegationPowerDivisor <= 0
                ? 'stakingDelegationWeight'
                : null
        ].filter(Boolean))];

        if (failedInputs.length > 0) {
            throw new Error('Missing staking APY inputs');
        }

        const supply = supplyMutez / 1e6;
        const staked = stakedMutez / 1e6;
        const delegated = delegatedMutez / 1e6;
        
        const s = staked / supply;
        const d = delegated / supply;
        
        // Protocol baking power weights delegated funds by the live
        // edge_of_staking_over_delegation divisor (currently 3), independently
        // from each baker's configurable edge_of_baking_over_staking split.
        const effective = s + d / delegationPowerDivisor;
        
        // Staker APY = net_issuance / effective_stake_ratio
        const stakeAPY = (netIssuance / 100) / effective * 100;
        // Gross delegation context before a baker's off-chain payout policy.
        const delegateAPY = stakeAPY / delegationPowerDivisor;
        if (!Number.isFinite(effective) || effective <= 0
            || !Number.isFinite(stakeAPY) || stakeAPY <= 0
            || !Number.isFinite(delegateAPY) || delegateAPY <= 0) {
            failedInputs.push('calculatedRate');
            throw new Error('Invalid staking APY calculation');
        }
        
        const observedAt = new Date().toISOString();
        const apyQuality = {
            status: 'live',
            observedAt,
            failedCategories: [],
            staleCategories: [],
            unavailableCategories: []
        };
        const result = {
            delegateAPY: Math.round(delegateAPY * 10) / 10, 
            stakeAPY: Math.round(stakeAPY * 10) / 10,
            _quality: {
                ...apyQuality,
                failedInputs: []
            }
        };
        if (result._quality.status === 'live') lastGoodStakingAPY = result;
        return result;
    } catch (error) {
        console.error('Failed to fetch staking APY:', error);
        const checkedAt = new Date().toISOString();
        if (lastGoodStakingAPY) {
            return {
                delegateAPY: lastGoodStakingAPY.delegateAPY,
                stakeAPY: lastGoodStakingAPY.stakeAPY,
                _quality: {
                    status: 'stale',
                    observedAt: lastGoodStakingAPY._quality.observedAt,
                    checkedAt,
                    failedInputs,
                    error: error.message
                }
            };
        }
        return {
            delegateAPY: null,
            stakeAPY: null,
            _quality: {
                status: 'unavailable',
                observedAt: null,
                checkedAt,
                failedInputs,
                error: error.message
            }
        };
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
            totalTransactions,
            contractCalls,
            stakingData,
            totalSupply,
            totalBurned,
            fundedAccounts,
            newAccounts,
            smartContracts,
            activeContracts,
            tokens,
            rollups,
            stakingAPY
        ] = await Promise.allSettled([
            fetchBakers(),
            fetchCycleInfo(),
            fetchGovernance(),
            fetchIssuance(),
            fetchTransactionVolume(),
            fetchTotalTransactions(),
            fetchContractCalls(),
            fetchStakingRatio(),
            fetchTotalSupply(),
            fetchTotalBurned(),
            fetchFundedAccounts(),
            fetchNewAccounts(),
            fetchSmartContracts(),
            fetchActiveContracts(),
            fetchTokens(),
            fetchRollups(),
            fetchStakingAPY()
        ]);

        const { values, quality } = qualityFromSettled({
            bakers: bakersData,
            cycle: cycleInfo,
            governance,
            issuance,
            transactionVolume24h: txVolume,
            totalTransactions,
            contractCalls24h: contractCalls,
            staking: stakingData,
            totalSupply,
            totalBurned,
            fundedAccounts,
            newAccounts24h: newAccounts,
            smartContracts,
            activeContracts24h: activeContracts,
            tokens,
            rollups,
            stakingAPY
        }, {
            bakers: { total: null, tz4Count: null, tz4Percentage: null },
            cycle: { cycle: null, progress: null, timeRemaining: '—' },
            governance: {},
            issuance: { total: null, protocol: null, lb: null, lbDisabled: null, lbEmaPct: null },
            transactionVolume24h: null,
            totalTransactions: null,
            contractCalls24h: null,
            staking: { stakingRatio: null, delegatedRatio: null, totalStaked: null, totalDelegated: null, bakingPower: null, totalDelegators: null, totalStakers: null, rewardAccounts: null },
            totalSupply: null,
            totalBurned: null,
            fundedAccounts: null,
            newAccounts24h: null,
            smartContracts: null,
            activeContracts24h: null,
            tokens: null,
            rollups: null,
            stakingAPY: { delegateAPY: null, stakeAPY: null, _quality: { status: 'unavailable', observedAt: null } }
        });
        if (quality.failedCategories.length >= 2) {
            console.warn('Multiple API categories failed, showing cached/stale data');
        }

        const bakers = values.bakers;
        const cycle = values.cycle;
        const gov = values.governance;
        const staking = values.staking;
        const apy = values.stakingAPY;

        return {
            _quality: quality,
            // Consensus
            totalBakers: bakers.total,
            tz4Bakers: bakers.tz4Count,
            tz4Percentage: bakers.tz4Percentage,
            cycle: cycle.cycle,
            blockLevel: cycle.blockLevel,
            blockTime: cycle.blockTime,
            cycleStartBlock: cycle.cycleStartBlock,
            blocksPerCycle: cycle.blocksPerCycle,
            cycleProgress: cycle.progress,
            cycleTimeRemaining: cycle.timeRemaining,
            
            // Governance
            proposal: gov.proposal || 'N/A',
            proposalDescription: gov.proposalDescription || '',
            votingPeriod: gov.period || 'N/A',
            votingDescription: gov.periodDescription || '',
            participation: gov.participation ?? null,
            participationQuorum: gov.participationQuorum ?? null,
            participationYayPct: gov.participationYayPct ?? null,
            participationDaysLeft: gov.participationDaysLeft ?? null,
            participationDescription: gov.participationDescription || '',
            govPeriodKind: gov.govPeriodKind || null,
            govProposalName: gov.govProposalName || null,
            
            // Economy
            currentIssuanceRate: values.issuance.total ?? null,
            protocolIssuanceRate: values.issuance.protocol ?? null,
            lbIssuanceRate: values.issuance.lb ?? null,
            lbSubsidyDisabled: values.issuance.lbDisabled ?? null,
            lbEmaPct: values.issuance.lbEmaPct ?? null,
            stakingRatio: staking.stakingRatio,
            delegatedRatio: staking.delegatedRatio,
            totalStaked: staking.totalStaked,
            totalDelegated: staking.totalDelegated,
            bakingPower: staking.bakingPower,
            totalDelegators: staking.totalDelegators,
            totalStakers: staking.totalStakers,
            rewardAccounts: staking.rewardAccounts,
            totalSupply: values.totalSupply,
            totalBurned: values.totalBurned,
            delegateAPY: apy.delegateAPY,
            stakeAPY: apy.stakeAPY,
            
            // Network Activity
            transactionVolume24h: values.transactionVolume24h,
            totalTransactions: values.totalTransactions,
            contractCalls24h: values.contractCalls24h,
            fundedAccounts: values.fundedAccounts,
            newAccounts24h: values.newAccounts24h,
            
            // Ecosystem
            smartContracts: values.smartContracts,
            activeContracts24h: values.activeContracts24h,
            tokens: values.tokens,
            rollups: values.rollups
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

        const { values, quality } = qualityFromSettled({
            bakers: bakersData,
            staking: stakingData,
            issuance: issuanceData,
            cycle: cycleData
        }, {
            bakers: { total: null, tz4Count: null, tz4Percentage: null },
            staking: { stakingRatio: null, delegatedRatio: null, totalStaked: null, totalDelegated: null, bakingPower: null, totalDelegators: null, totalStakers: null, rewardAccounts: null },
            issuance: { total: null },
            cycle: { cycle: null, progress: null, timeRemaining: '—' }
        });
        const bakers = values.bakers;
        const staking = values.staking;
        const issuanceRate = values.issuance.total ?? null;
        const cycleInfo = values.cycle;

        return {
            _quality: quality,
            totalBakers: bakers.total,
            tz4Bakers: bakers.tz4Count,
            tz4Percentage: bakers.tz4Percentage,
            currentIssuanceRate: issuanceRate,
            stakingRatio: staking.stakingRatio,
            delegatedRatio: staking.delegatedRatio,
            totalStaked: staking.totalStaked,
            totalDelegated: staking.totalDelegated,
            bakingPower: staking.bakingPower,
            totalDelegators: staking.totalDelegators,
            totalStakers: staking.totalStakers,
            rewardAccounts: staking.rewardAccounts,
            cycle: cycleInfo.cycle,
            blockLevel: cycleInfo.blockLevel,
            blockTime: cycleInfo.blockTime,
            cycleStartBlock: cycleInfo.cycleStartBlock,
            blocksPerCycle: cycleInfo.blocksPerCycle,
            cycleProgress: cycleInfo.progress,
            cycleTimeRemaining: cycleInfo.timeRemaining,
        };
    } catch (error) {
        console.error('Failed to fetch hero stats:', error);
        return {
            _quality: {
                status: 'unavailable',
                observedAt: new Date().toISOString(),
                failedCategories: ['hero'],
                staleCategories: [],
                unavailableCategories: ['hero'],
                errors: { hero: error.message }
            },
            totalBakers: null,
            tz4Bakers: null,
            tz4Percentage: null,
            stakingRatio: null,
            delegatedRatio: null,
            currentIssuanceRate: null,
            cycle: null,
            cycleProgress: null,
            cycleTimeRemaining: '—'
        };
    }
}

/**
 * Check API health
 */
export async function checkApiHealth() {
    try {
        const [tzktHealth, octezHealth] = await Promise.allSettled([
            fetchWithRetry(`${ENDPOINTS.tzkt.base}/head`, { memoryCache: false }, 1),
            fetchWithRetry(`${ENDPOINTS.octez.base}/chains/main/blocks/head/header`, { memoryCache: false }, 1)
        ]);
        
        return {
            tzkt: tzktHealth.status === 'fulfilled',
            octez: octezHealth.status === 'fulfilled'
        };
    } catch (error) {
        return { tzkt: false, octez: false };
    }
}

function availableHistoryReceipt(rows) {
    return {
        status: 'available',
        rows: Array.isArray(rows) ? rows : [],
        error: null
    };
}

function unavailableHistoryReceipt(error) {
    return {
        status: 'unavailable',
        rows: [],
        error: error?.message || String(error || 'History source unavailable')
    };
}

// Historical data fetching. Receipt variants expose source availability to
// provenance-sensitive surfaces without changing the longstanding array
// return contract used by sparklines and card-history callers.
export async function fetchHistoricalDataReceipt(range = '7d') {
    const cacheKey = `history:${range}`;
    const cached = historicalDataCache.get(cacheKey);
    if (cached && (cached.promise || (Date.now() - cached.timestamp) < cache.ttl)) {
        try {
            return await (cached.promise || cached.data);
        } catch (error) {
            return unavailableHistoryReceipt(error);
        }
    }

    // Do not yield between checking the cache and registering the request.
    // Concurrent charts share the complete paginated receipt, even past its TTL.
    const startTime = getHistoryStartTime(range);

    const url = `${SUPABASE_CONFIG.url}/rest/v1/tezos_history?timestamp=gte.${startTime.toISOString()}&order=timestamp.asc`;
    const headers = {
        'apikey': SUPABASE_CONFIG.key,
        'Authorization': `Bearer ${SUPABASE_CONFIG.key}`
    };
    const allRows = [];

    const requestPromise = (async () => {
        for (let offset = 0; ; offset += HISTORICAL_PAGE_SIZE) {
            const rows = await fetchWithRetry(
                `${url}&limit=${HISTORICAL_PAGE_SIZE}&offset=${offset}`,
                { headers, memoryCache: false },
                2
            );
            if (!Array.isArray(rows)) {
                throw new Error('Supabase fetch returned a non-array response');
            }

            allRows.push(...rows);
            if (rows.length < HISTORICAL_PAGE_SIZE) break;
        }

        return availableHistoryReceipt(allRows);
    })();

    historicalDataCache.set(cacheKey, {
        timestamp: Date.now(),
        promise: requestPromise
    });

    try {
        const receipt = await requestPromise;
        historicalDataCache.set(cacheKey, {
            timestamp: Date.now(),
            data: receipt
        });
        return receipt;
    } catch (error) {
        historicalDataCache.delete(cacheKey);
        console.error('Failed to fetch historical data:', error);
        return unavailableHistoryReceipt(error);
    }
}

export async function fetchHistoricalData(range = '7d') {
    const receipt = await fetchHistoricalDataReceipt(range);
    return receipt.rows;
}

async function fetchSupabaseHistoryRowsReceipt(table, range = '7d', select = '*') {
    const allowedTables = new Set(['tezos_history', ...Object.values(DOMAIN_HISTORY_TABLES)]);
    if (!allowedTables.has(table)) {
        throw new Error(`Unsupported Supabase history table: ${table}`);
    }

    const cacheKey = `history-table:${table}:${range}:${select}`;
    const cached = historicalDataCache.get(cacheKey);
    if (cached && (cached.promise || (Date.now() - cached.timestamp) < cache.ttl)) {
        try {
            return await (cached.promise || cached.data);
        } catch (error) {
            return unavailableHistoryReceipt(error);
        }
    }

    const startTime = getHistoryStartTime(range);
    const headers = {
        'apikey': SUPABASE_CONFIG.key,
        'Authorization': `Bearer ${SUPABASE_CONFIG.key}`
    };
    const url = `${SUPABASE_CONFIG.url}/rest/v1/${table}?select=${encodeURIComponent(select)}&timestamp=gte.${startTime.toISOString()}&order=timestamp.asc`;
    const allRows = [];

    const requestPromise = (async () => {
        for (let offset = 0; ; offset += HISTORICAL_PAGE_SIZE) {
            const rows = await fetchWithRetry(
                `${url}&limit=${HISTORICAL_PAGE_SIZE}&offset=${offset}`,
                { headers, memoryCache: false },
                2
            );
            if (!Array.isArray(rows)) {
                throw new Error(`${table} fetch returned a non-array response`);
            }

            allRows.push(...rows);
            if (rows.length < HISTORICAL_PAGE_SIZE) break;
        }

        return availableHistoryReceipt(allRows);
    })();

    historicalDataCache.set(cacheKey, {
        timestamp: Date.now(),
        promise: requestPromise
    });

    try {
        const receipt = await requestPromise;
        historicalDataCache.set(cacheKey, {
            timestamp: Date.now(),
            data: receipt
        });
        return receipt;
    } catch (error) {
        historicalDataCache.delete(cacheKey);
        if (!reportedHistoryFetchFailures.has(table)) {
            reportedHistoryFetchFailures.add(table);
            console.warn(`Supabase history table ${table} unavailable; exposing an unavailable receipt until the next refresh succeeds.`, error);
        }
        return unavailableHistoryReceipt(error);
    }
}

export async function fetchChamberHistoricalDataReceipts(range = '7d') {
    const [market, networkHealth, tezosx, governance] = await Promise.all([
        fetchSupabaseHistoryRowsReceipt(DOMAIN_HISTORY_TABLES.market, range),
        fetchSupabaseHistoryRowsReceipt(DOMAIN_HISTORY_TABLES.networkHealth, range),
        fetchSupabaseHistoryRowsReceipt(DOMAIN_HISTORY_TABLES.tezosx, range),
        fetchSupabaseHistoryRowsReceipt(DOMAIN_HISTORY_TABLES.governance, range)
    ]);

    return {
        market,
        networkHealth,
        tezosx,
        governance
    };
}

export async function fetchChamberHistoricalData(range = '7d') {
    const receipts = await fetchChamberHistoricalDataReceipts(range);
    return Object.fromEntries(Object.entries(receipts).map(([source, receipt]) => [source, receipt.rows]));
}

async function fetchLatestHistoryRow(config, table) {
    const rows = await fetchWithRetry(
        `${config.url}/rest/v1/${table}?select=timestamp&order=timestamp.desc&limit=1`,
        {
            headers: {
                'apikey': config.key,
                'Authorization': `Bearer ${config.key}`
            },
            memoryCache: false
        },
        2
    );
    return Array.isArray(rows) ? rows[0] : null;
}

export async function fetchSupabaseHistoryFreshness() {
    const cacheKey = 'history-freshness';
    const cached = historicalDataCache.get(cacheKey);
    if (cached && (cached.promise || (Date.now() - cached.timestamp) < cache.ttl)) {
        return cached.promise || cached.data;
    }

    const tables = ['tezos_history', ...Object.values(DOMAIN_HISTORY_TABLES)];
    const requestPromise = (async () => {
        const now = Date.now();
        const rows = await Promise.all(tables.map(async table => {
            try {
                const latest = await fetchLatestHistoryRow(SUPABASE_CONFIG, table);
                const timestamp = latest?.timestamp ? new Date(latest.timestamp) : null;
                const ageMs = timestamp && !isNaN(timestamp.getTime()) ? now - timestamp.getTime() : null;
                const limitMs = HISTORY_FRESHNESS_LIMITS[table] || 90 * 60 * 1000;
                return {
                    table,
                    timestamp: timestamp ? timestamp.toISOString() : null,
                    ageMs,
                    limitMs,
                    ok: ageMs !== null && ageMs <= limitMs
                };
            } catch (error) {
                return {
                    table,
                    timestamp: null,
                    ageMs: null,
                    limitMs: HISTORY_FRESHNESS_LIMITS[table] || 90 * 60 * 1000,
                    ok: false,
                    error: error.message
                };
            }
        }));

        return rows;
    })();

    historicalDataCache.set(cacheKey, {
        timestamp: Date.now(),
        promise: requestPromise
    });

    const rows = await requestPromise;
    historicalDataCache.set(cacheKey, {
        timestamp: Date.now(),
        data: rows
    });
    return rows;
}
