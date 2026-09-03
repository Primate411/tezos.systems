import { renderChamberVerdict } from '../ui/chamber-reading.js';
import { requestChamberClose } from '../ui/chamber-accessibility.js';
/**
 * Baker Leaderboard — sortable ranking of all active Tezos bakers
 * Shows stake, delegators, tz4 status, capacity usage
 */

import { API_URLS } from '../core/config.js';
import { versionedAsset } from '../core/asset-version.js';
import { escapeHtml, formatFreshnessStamp, formatMutez } from '../core/utils.js';
import { buildBakerCapacitySnapshot } from '../core/baker-capacity.mjs';
import {
    connectOctezWallet,
    getWalletAccount,
    requestConnectedWalletDelegation,
    requestConnectedWalletStake,
    shortAddress
} from '../core/wallet.js';
import { isValidAddress } from './my-baker.js';
import { pulseFresh } from '../effects/data-magic.js';
import { quietlySyncHtml } from '../core/quiet-refresh.js';
import { sha256Text } from '../core/sha256.js';
import {
    activateChamberDialog,
    deactivateChamberDialog,
    findChamberLauncher,
    wireChamberLauncher
} from '../ui/chamber-accessibility.js';
import { ensureChamberStylesheet } from '../ui/chamber-styles.js';

const TZKT = API_URLS.tzkt;
const TOGGLE_KEY = 'tezos-systems-leaderboard-visible';
const SORT_KEY = 'tezos-systems-leaderboard-sort';
const CACHE_KEY = 'tezos-systems-leaderboard-cache-v6';
const LEGACY_CACHE_KEYS = [1, 2, 3, 4, 5].map((version) => `tezos-systems-leaderboard-cache-v${version}`);
const FIT_KEY = 'tezos-systems-baker-fit';
const LEADERBOARD_CSS_URL = versionedAsset('/css/leaderboard.min.css');
const GOVERNANCE_SIGNALS_URL = '/data/baker-governance-signals.json';
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const DEFAULT_DELEGATION_LIMIT = 9;
const MY_BAKER_KEY = 'tezos-systems-my-baker-address';
const OG_LAST_YEAR = 2018;
const VETERAN_LAST_YEAR = 2021;
const BAKER_DIRECTORY_REFRESH_MS = 10 * 60 * 1000;
const BAKER_DIRECTORY_VIEWS = Object.freeze([
    { id: 'discover', label: 'Discover' },
    { id: 'directory', label: 'Directory' },
    { id: 'signals', label: 'Signals' }
]);
const BAKER_DIRECTORY_VIEW_IDS = new Set(BAKER_DIRECTORY_VIEWS.map(({ id }) => id));
const BAKER_DIRECTORY_SIGNAL_IDS = new Set(['all', 'og', 'veteran', 'accepted', 'voting', 'rising', 'tz4']);

let bakersData = [];
let currentSort = { col: 'stake', dir: 'desc' };
let delegationLimit = DEFAULT_DELEGATION_LIMIT;
let delegationLimitSource = 'fallback';
let delegationLimitPromise = null;
let showOpenOvensOnly = false;
let leaderboardDataQuality = { status: 'unavailable', observedAt: null };
let governanceSignals = emptyGovernanceSignals();
const previousStakeSnapshot = new Map();
let bakerDirectoryState = {
    view: 'discover',
    search: '',
    requestedBaker: '',
    selectedAddress: '',
    sort: 'stake',
    dir: 'desc',
    openOnly: false,
    signal: 'all'
};
let bakerDirectoryTimer = null;
let bakerDirectoryRefreshInFlight = null;
let bakerDirectoryRefreshIncludesGovernance = false;
let bakerDirectoryRefreshDeferred = false;
let bakerDirectoryVisibilityWired = false;
let bakerDirectoryLastError = '';
let bakerDirectorySavedBodyOverflow = null;
let bakerDirectorySavedHtmlOverflow = null;
let bakerDirectoryFocusedBeforeOpen = null;
let bakerActionState = null;

function ensureLeaderboardStyles() {
    return ensureChamberStylesheet('leaderboard-css', LEADERBOARD_CSS_URL);
}

const FIT_QUESTIONS = [
    {
        key: 'amount',
        label: 'Minimum room',
        options: [
            { value: 'small', label: '1K', detail: 'at least 1,000 XTZ current room' },
            { value: 'medium', label: '50K', detail: 'at least 50,000 XTZ current room' },
            { value: 'large', label: '250K', detail: 'at least 250,000 XTZ current room' }
        ]
    },
    {
        key: 'priority',
        label: 'Priority',
        options: [
            { value: 'community', label: 'Community', detail: 'delegator and staker adoption' },
            { value: 'capacity', label: 'Capacity', detail: 'more delegation room' }
        ]
    },
    {
        key: 'style',
        label: 'Evidence filter',
        options: [
            { value: 'balanced', label: 'Any', detail: 'no key-type or tenure filter' },
            { value: 'modern', label: 'tz4 ready', detail: 'BLS consensus keys' },
            { value: 'veteran', label: 'Veteran', detail: 'first activity by end of 2021' }
        ]
    }
];

function loadFitPrefs() {
    try {
        const saved = JSON.parse(localStorage.getItem(FIT_KEY) || 'null');
        const priority = ['community', 'capacity'].includes(saved?.priority)
            ? saved.priority
            : 'community';
        return {
            amount: saved?.amount || 'medium',
            priority,
            style: saved?.style || 'balanced'
        };
    } catch {
        return { amount: 'medium', priority: 'community', style: 'balanced' };
    }
}

function saveFitPrefs(prefs) {
    try { localStorage.setItem(FIT_KEY, JSON.stringify(prefs)); } catch {}
}

let fitPrefs = loadFitPrefs();

async function fetchDelegationLimit() {
    if (delegationLimitPromise) return delegationLimitPromise;
    delegationLimitPromise = fetch(`${API_URLS.octez}/chains/main/blocks/head/context/constants`, { cache: 'no-store' })
        .then((resp) => resp.ok ? resp.json() : Promise.reject(new Error('Protocol constants unavailable')))
        .then((constants) => {
            const limit = Number(constants?.limit_of_delegation_over_baking);
            if (Number.isFinite(limit) && limit > 0) {
                delegationLimit = limit;
                delegationLimitSource = 'live';
            }
            return delegationLimit;
        })
        .catch(() => delegationLimit);
    return delegationLimitPromise;
}

/**
 * Fetch all active bakers from TzKT
 */
async function fetchBakers() {
    let cachedFunded = [];
    let cachedAt = null;
    try {
        const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
        if (cached && Array.isArray(cached.data)) {
            cachedFunded = cached.data.filter((baker) => Number(baker.bakingPower || 0) > 0);
            cachedAt = Number(cached.ts) || null;
        }
        if (cachedFunded.length && cachedAt && Date.now() - cachedAt < CACHE_TTL) {
            leaderboardDataQuality = { status: 'cached', observedAt: new Date(cachedAt).toISOString() };
            return cachedFunded;
        }
    } catch { /* ignore */ }

    const limit = 500;
    let offset = 0;
    let all = [];

    // Fetch active delegates, then keep the same funded-baker set used for
    // All Bakers Attest activation: positive current baking power.
    try {
        while (true) {
            const resp = await fetch(
                `${TZKT}/delegates?active=true&select=address,alias,stakingBalance,bakingPower,consensusAddress,externalStakedBalance,externalDelegatedBalance,numDelegators,stakersCount,stakedBalance,balance,software,firstActivity,firstActivityTime,limitOfStakingOverBaking,edgeOfBakingOverStaking,pendingStakingParameters&sort.desc=id&limit=${limit}&offset=${offset}`
            );
            if (!resp.ok) throw new Error(`Baker directory HTTP ${resp.status}`);
            const batch = await resp.json();
            if (!Array.isArray(batch)) throw new Error('Unexpected baker directory payload');
            all = all.concat(batch);
            if (batch.length < limit) break;
            offset += limit;
        }

        const fundedBakers = all.filter((baker) => Number(baker.bakingPower || 0) > 0);
        if (!fundedBakers.length) throw new Error('Baker directory returned no funded active bakers');

        const observedAt = Date.now();
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: observedAt, data: fundedBakers }));
        } catch { /* quota */ }

        leaderboardDataQuality = { status: 'live', observedAt: new Date(observedAt).toISOString() };
        return fundedBakers;
    } catch (error) {
        if (cachedFunded.length) {
            leaderboardDataQuality = {
                status: 'stale',
                observedAt: cachedAt ? new Date(cachedAt).toISOString() : null,
                error: error.message
            };
            return cachedFunded;
        }
        leaderboardDataQuality = { status: 'unavailable', observedAt: null, error: error.message };
        throw error;
    }
}

function emptyGovernanceSignals() {
    return {
        careerByAddress: new Map(),
        acceptedByAddress: new Map(),
        careerReady: false,
        proposalsReady: false,
        careerGeneratedAt: null,
        proposalsGeneratedAt: null,
        sourceRecordCount: 0,
        runtimeMatchedCount: 0,
        runtimeMissingAddresses: [],
        careerError: '',
        proposalsError: ''
    };
}

async function fetchJsonArtifact(url) {
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Artifact HTTP ${response.status}`);
    return response.json();
}

function stableJsonValue(value) {
    if (Array.isArray(value)) return value.map(stableJsonValue);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableJsonValue(value[key])]));
}

async function governanceSignalIndexes(artifact) {
    if (Number(artifact?.schema) !== 1
        || artifact?.kind !== 'baker-governance-signals'
        || artifact?.coverage?.status !== 'complete'
        || artifact?.coverage?.mode !== 'source-active-delegate-governance-signal-projection'
        || !/Zero-valued fields mean zero only for an address present/i.test(artifact?.coverage?.zeroSemantics || '')
        || !/missing address.*not proof of no governance history/i.test(artifact?.coverage?.missingAddressSemantics || '')
        || !artifact?.records
        || typeof artifact.records !== 'object'
        || Number(artifact?.recordCount) !== Object.keys(artifact.records).length
        || !/^[0-9a-f]{64}$/.test(artifact?.integrity?.contentHash || '')) {
        throw new Error('Baker governance signal artifact is incomplete');
    }
    const { integrity, ...unsigned } = artifact;
    const actualHash = await sha256Text(JSON.stringify(stableJsonValue(unsigned)));
    if (actualHash.toLowerCase() !== integrity.contentHash.toLowerCase()) {
        throw new Error('Baker governance signal artifact failed its SHA-256 integrity receipt');
    }
    const careerGeneratedAt = artifact?.sources?.careers?.generatedAt || null;
    const proposalsGeneratedAt = artifact?.sources?.governanceVotes?.generatedAt || null;
    if (!Number.isFinite(Date.parse(careerGeneratedAt || ''))
        || !Number.isFinite(Date.parse(proposalsGeneratedAt || ''))) {
        throw new Error('Baker governance signal source clocks are invalid');
    }

    const careerByAddress = new Map();
    const acceptedByAddress = new Map();
    const seenHashes = new Set();
    let acceptedProposalCount = 0;
    for (const [address, record] of Object.entries(artifact.records)) {
        const lifetimeBallots = Number(record?.lifetimeBallots);
        const currentStreak = Number(record?.currentBallotPeriodStreak);
        const longestStreak = Number(record?.longestBallotPeriodStreak);
        if (record?.address !== address
            || !/^tz[1-4][1-9A-HJ-NP-Za-km-z]{33}$/.test(address)
            || !Number.isSafeInteger(lifetimeBallots) || lifetimeBallots < 0
            || !Number.isSafeInteger(currentStreak) || currentStreak < 0
            || !Number.isSafeInteger(longestStreak) || longestStreak < currentStreak
            || !Array.isArray(record?.acceptedProposals)) {
            throw new Error(`Baker governance signal record is invalid: ${address}`);
        }
        const accepted = record.acceptedProposals.map((proposal) => {
            const hash = String(proposal?.hash || '').trim();
            const name = String(proposal?.name || '').trim();
            const epoch = proposal?.epoch == null ? null : Number(proposal.epoch);
            if (!hash || seenHashes.has(hash) || !name
                || (epoch !== null && (!Number.isSafeInteger(epoch) || epoch < 0))) {
                throw new Error(`Accepted proposal signal is invalid: ${hash || address}`);
            }
            seenHashes.add(hash);
            acceptedProposalCount += 1;
            return { hash, name, epoch };
        });
        careerByAddress.set(address, {
            address,
            lifetimeBallots,
            currentBallotPeriodStreak: currentStreak,
            longestBallotPeriodStreak: longestStreak
        });
        if (accepted.length) acceptedByAddress.set(address, accepted);
    }
    if (acceptedProposalCount !== Number(artifact.acceptedProposalCount)) {
        throw new Error('Baker governance signal proposal count does not reconcile');
    }
    return { careerByAddress, acceptedByAddress, careerGeneratedAt, proposalsGeneratedAt, sourceRecordCount: careerByAddress.size };
}

function reconcileGovernanceSignalCoverage(bakers = bakersData) {
    if (!governanceSignals.careerReady) return;
    const addresses = bakers.map((baker) => baker.address).filter(Boolean);
    const missing = addresses.filter((address) => !governanceSignals.careerByAddress.has(address));
    governanceSignals.runtimeMatchedCount = addresses.length - missing.length;
    governanceSignals.runtimeMissingAddresses = missing;
}

async function fetchGovernanceSignals() {
    const next = {
        ...governanceSignals,
        careerByAddress: governanceSignals.careerByAddress,
        acceptedByAddress: governanceSignals.acceptedByAddress,
        careerError: '',
        proposalsError: ''
    };
    try {
        const artifact = await fetchJsonArtifact(GOVERNANCE_SIGNALS_URL);
        const indexed = await governanceSignalIndexes(artifact);
        if ((next.careerReady && Date.parse(indexed.careerGeneratedAt) < Date.parse(next.careerGeneratedAt || ''))
            || (next.proposalsReady && Date.parse(indexed.proposalsGeneratedAt) < Date.parse(next.proposalsGeneratedAt || ''))) {
            throw new Error('Baker governance signal receipt is older than the retained last-good source clocks');
        }
        next.careerByAddress = indexed.careerByAddress;
        next.acceptedByAddress = indexed.acceptedByAddress;
        next.careerReady = true;
        next.proposalsReady = true;
        next.careerGeneratedAt = indexed.careerGeneratedAt;
        next.proposalsGeneratedAt = indexed.proposalsGeneratedAt;
        next.sourceRecordCount = indexed.sourceRecordCount;
    } catch (error) {
        const message = error?.message || 'Baker governance signal receipt unavailable';
        next.careerError = message;
        next.proposalsError = message;
    }

    governanceSignals = next;
    reconcileGovernanceSignalCoverage();
    return next;
}

/**
 * Determine if baker has tz4 consensus key
 */
function isTz4(addr, consensusAddress) {
    return (consensusAddress || addr || '').startsWith('tz4');
}

function normalizedAddress(value) {
    return String(value || '').trim().toLowerCase();
}

function savedBakerAddress() {
    try { return normalizedAddress(localStorage.getItem(MY_BAKER_KEY)); }
    catch { return ''; }
}

function sinceYear(baker) {
    const time = Date.parse(baker.firstActivityTime || '');
    if (Number.isFinite(time)) return new Date(time).getUTCFullYear();
    return null;
}

function isOpenDelegationRoom(baker, freeCapacity) {
    const capacity = Number(freeCapacity);
    return Number.isFinite(capacity)
        && capacity >= 50000
        && Number(baker.delegationUsage || 0) < 80;
}

function earnedBadgesFor(baker) {
    const badges = [];
    const firstYear = sinceYear(baker);
    if (Number.isFinite(firstYear) && firstYear <= OG_LAST_YEAR) {
        badges.push({
            label: `✦ OG · ${firstYear}`,
            tone: 'og',
            title: `OG baker: first on-chain activity recorded by TzKT in ${firstYear}, during the launch era.`
        });
    } else if (Number.isFinite(firstYear) && firstYear <= VETERAN_LAST_YEAR) {
        badges.push({
            label: `Veteran · ${firstYear}`,
            tone: 'veteran',
            title: `Veteran baker: first on-chain activity recorded by TzKT in ${firstYear}; the cutoff is December 31, ${VETERAN_LAST_YEAR}.`
        });
    }

    const accepted = governanceSignals.acceptedByAddress.get(baker.address) || [];
    if (accepted.length) {
        const names = accepted.map((proposal) => proposal.name);
        const visibleNames = names.slice(0, 4).join(', ');
        const remaining = names.length > 4 ? `, plus ${names.length - 4} more` : '';
        badges.push({
            label: `🏛 Accepted · ${accepted.length}`,
            tone: 'accepted',
            title: `${accepted.length} distinct protocol proposal${accepted.length === 1 ? '' : 's'} initiated by this baker reached TzKT status accepted: ${visibleNames}${remaining}.`
        });
    }

    const career = governanceSignals.careerByAddress.get(baker.address);
    if (governanceSignals.careerReady && !career) {
        badges.push({
            label: 'Governance unavailable',
            tone: 'unavailable',
            title: 'This current baker is outside the frozen governance-signal source cohort. Missing is not interpreted as zero history.'
        });
    }
    const currentStreak = Number(career?.currentBallotPeriodStreak || 0);
    if (currentStreak > 0) {
        const longest = Number(career?.longestBallotPeriodStreak || currentStreak);
        const ballots = Number(career?.lifetimeBallots || 0);
        badges.push({
            label: `🗳 Streak · ${currentStreak}`,
            tone: 'voting',
            title: `${currentStreak} consecutive completed Exploration/Promotion period${currentStreak === 1 ? '' : 's'} with an applied ballot through the latest completed ballot period. Career high: ${longest}; applied ballots: ${ballots}.`
        });
    }

    const previousStake = previousStakeSnapshot.get(baker.address);
    if (Number.isFinite(previousStake) && Number(baker.stakingBalance || 0) > previousStake) {
        badges.push({
            label: '↗ Rising',
            tone: 'rising',
            title: 'Staking balance increased since the previous leaderboard refresh.'
        });
    }

    return badges;
}

/**
 * Compute derived fields for sorting
 */
function enrichBaker(b, activeDelegationLimit = delegationLimit) {
    const stake = (b.stakingBalance || 0) / 1e6;
    const ownStake = (b.stakedBalance || 0) / 1e6;
    const extStaked = (b.externalStakedBalance || 0) / 1e6;
    const extDelegated = (b.externalDelegatedBalance || 0) / 1e6;
    const delegators = b.numDelegators || 0;
    const stakers = b.stakersCount || 0;
    const limit = Number.isFinite(Number(activeDelegationLimit)) && Number(activeDelegationLimit) > 0
        ? Number(activeDelegationLimit)
        : DEFAULT_DELEGATION_LIMIT;
    const capacity = buildBakerCapacitySnapshot(b, limit);
    const delegationUsage = capacity.delegationUsage;
    const freeDelegationCapacity = capacity.freeDelegationCapacity;
    const base = {
        ...b,
        stake,
        ownStake,
        extStaked,
        extDelegated,
        freeDelegationCapacity,
        delegators,
        stakers,
        tz4: isTz4(b.address, b.consensusAddress),
        delegationLimit: limit,
        delegationUsage,
        stakingUsage: capacity.stakingUsage,
        stakingLimit: capacity.stakingLimit,
        rewardEdge: capacity.rewardEdge,
        freeStakingCapacity: capacity.freeStakingCapacity,
        acceptsExternalStake: capacity.acceptsExternalStake,
        pendingStakingParameters: capacity.pendingStakingParameters,
        name: b.alias || (b.address.slice(0, 8) + '…'),
        sinceYear: sinceYear(b)
    };

    return {
        ...base,
        earnedBadges: earnedBadgesFor(base),
        openDelegationRoom: isOpenDelegationRoom(base, freeDelegationCapacity),
    };
}

function rememberStakeSnapshot(bakers) {
    bakers.forEach((baker) => {
        if (baker?.address) previousStakeSnapshot.set(baker.address, Number(baker.stakingBalance || 0));
    });
}

function searchableBakerText(baker) {
    return [
        baker.name,
        baker.alias,
        baker.address,
        baker.consensusAddress
    ].filter(Boolean).join(' ').toLowerCase();
}

function compactSearchText(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function scoreBakerMatch(baker, query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return 0;
    const compactQuery = compactSearchText(q);
    const name = String(baker.name || baker.alias || '').toLowerCase();
    const text = searchableBakerText(baker);
    const compactName = compactSearchText(name);
    let score = 0;

    if (name === q) score = 120;
    else if (name.startsWith(q)) score = 95;
    else if (name.split(/\s+/).some((part) => part.startsWith(q))) score = 78;
    else if (text.includes(q)) score = 58;
    else if (compactQuery && compactName.includes(compactQuery)) score = 48;
    else if (String(baker.address || '').toLowerCase().includes(q)) score = 36;

    if (!score) return 0;
    const stakeBoost = Math.log10(Math.max(1, Number(baker.stake || 0))) * 2;
    return score + stakeBoost;
}

/**
 * Sort bakers by column
 */
function sortBakers(bakers, col, dir) {
    const mult = dir === 'desc' ? -1 : 1;
    return [...bakers].sort((a, b) => {
        let va, vb;
        switch (col) {
            case 'stake': va = a.stake; vb = b.stake; break;
            case 'delegators': va = a.delegators; vb = b.delegators; break;
            case 'stakers': va = a.stakers; vb = b.stakers; break;
            case 'capacity': va = a.delegationUsage; vb = b.delegationUsage; break;
            case 'tz4': va = a.tz4 ? 1 : 0; vb = b.tz4 ? 1 : 0; break;
            case 'name': return mult * a.name.localeCompare(b.name);
            default: va = a.stake; vb = b.stake;
        }
        return mult * (va - vb);
    });
}

export async function findBakersByName(query, { limit = 5 } = {}) {
    const q = String(query || '').trim();
    if (q.length < 2) return [];
    if (!bakersData.length) {
        const raw = await fetchBakers();
        bakersData = raw.map(b => enrichBaker(b));
    }

    return bakersData
        .map((baker) => ({ baker, score: scoreBakerMatch(baker, q) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(({ baker }, index) => ({
            ...baker,
            searchRank: index + 1
        }));
}

function fitCapacityNeed(prefs) {
    if (prefs.amount === 'large') return 250000;
    if (prefs.amount === 'medium') return 50000;
    return 1000;
}

function bakerMatchesFit(baker, prefs = fitPrefs) {
    const free = Number(baker.freeDelegationCapacity || 0);
    const need = fitCapacityNeed(prefs);
    if (free < need) return false;
    if (prefs.style === 'modern' && !baker.tz4) return false;
    if (prefs.style === 'veteran' && !(Number.isFinite(baker.sinceYear) && baker.sinceYear <= VETERAN_LAST_YEAR)) return false;
    return true;
}

function compareBakerFit(left, right, prefs = fitPrefs) {
    const leftCommunity = Number(left.delegators || 0) + Number(left.stakers || 0);
    const rightCommunity = Number(right.delegators || 0) + Number(right.stakers || 0);
    const leftRoom = Number(left.freeDelegationCapacity || 0);
    const rightRoom = Number(right.freeDelegationCapacity || 0);
    if (prefs.priority === 'capacity') {
        return rightRoom - leftRoom
            || rightCommunity - leftCommunity
            || left.name.localeCompare(right.name);
    }
    return rightCommunity - leftCommunity
        || rightRoom - leftRoom
        || left.name.localeCompare(right.name);
}

function factualBakerFits(bakers, prefs = fitPrefs, limit = 6) {
    return bakers
        .filter((baker) => bakerMatchesFit(baker, prefs))
        .sort((left, right) => compareBakerFit(left, right, prefs))
        .slice(0, limit)
        .map((baker) => {
            const community = Number(baker.delegators || 0) + Number(baker.stakers || 0);
            const reasons = [
                `${Math.floor(Number(baker.freeDelegationCapacity || 0)).toLocaleString('en-US')} XTZ room`,
                `${community.toLocaleString('en-US')} delegators + stakers`
            ];
            if (prefs.style === 'modern') reasons.push('tz4/BLS key');
            else if (prefs.style === 'veteran') reasons.push(`first activity ${baker.sinceYear}`);
            else reasons.push(`${Number(baker.delegationUsage || 0).toFixed(0)}% delegation use`);
            return { baker, reasons, hasRoom: true };
        });
}

function fitFinderHtml(ranked) {
    const candidates = factualBakerFits(ranked, fitPrefs, 3);

    return `
        <section class="baker-fit-finder" aria-label="Delegator baker fit finder">
            <div class="baker-fit-head">
                <div>
                    <span class="feature-kicker">Delegator match</span>
                    <h3>Find bakers that fit your delegation lane</h3>
                    <p class="baker-fit-method">Filters are strict: enough current room plus the selected key or tenure evidence. Community orders by delegators + stakers; Capacity orders by free room; ties use the other fact, then name. No blended score is calculated. Delegation fees and payout policy are off-chain; the protocol's external-staker edge is not a delegation fee.</p>
                </div>
                <a href="/stake/?view=guide">Staking guide</a>
            </div>
            <div class="baker-fit-questions">
                ${FIT_QUESTIONS.map((question) => `
                    <div class="baker-fit-question">
                        <span>${escapeHtml(question.label)}</span>
                        <div class="baker-fit-options">
                            ${question.options.map((option) => `
                                <button type="button" class="baker-fit-option ${fitPrefs[question.key] === option.value ? 'active' : ''}" data-fit-key="${escapeHtml(question.key)}" data-fit-value="${escapeHtml(option.value)}" aria-pressed="${fitPrefs[question.key] === option.value ? 'true' : 'false'}" title="${escapeHtml(option.detail)}">
                                    ${escapeHtml(option.label)}
                                </button>
                            `).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>
            <div class="baker-fit-results">
                ${candidates.map((item, index) => `
                    <article class="baker-fit-card ${item.hasRoom ? '' : 'tight'}">
                        <span class="baker-fit-rank">Order ${index + 1}</span>
                        <strong>${escapeHtml(item.baker.name)}</strong>
                        <small>${escapeHtml(item.reasons.join(' · '))}</small>
                        <button type="button" class="baker-fit-select" data-address="${escapeHtml(item.baker.address)}">Review baker</button>
                    </article>
                `).join('')}
            </div>
        </section>
    `;
}

function openBakerInDrawer(addr) {
    if (!addr) return;
    const input = document.getElementById('my-baker-input');
    const saveBtn = document.getElementById('my-baker-save');
    const drawer = document.getElementById('my-tezos-drawer');
    const scrim = document.getElementById('my-tezos-drawer-scrim');
    const emptyState = document.getElementById('drawer-empty-state');
    const connectedState = document.getElementById('drawer-connected');

    if (input) input.value = addr;
    if (saveBtn) saveBtn.click();

    if (drawer && scrim) {
        drawer.classList.add('open');
        scrim.classList.add('open');
        document.body.style.overflow = 'hidden';
        if (emptyState) emptyState.style.display = 'none';
        if (connectedState) connectedState.style.display = '';
    }
}

function signalBadgeHtml(badge) {
    return `<span class="lb-badge lb-badge-${escapeHtml(badge.tone)}" data-badge="${escapeHtml(badge.tone)}" title="${escapeHtml(badge.title)}" aria-label="${escapeHtml(badge.title)}">${escapeHtml(badge.label)}</span>`;
}

function signalLegendHtml(isOpen) {
    return `
        <details class="leaderboard-signal-legend" ${isOpen ? 'open' : ''}>
            <summary>Signal legend</summary>
            <div class="leaderboard-signal-legend-panel">
                <span><strong>✦ OG</strong> First TzKT activity in the 2018 launch era; shown instead of Veteran.</span>
                <span><strong>Veteran</strong> First TzKT activity on or before December 31, ${VETERAN_LAST_YEAR}.</span>
                <span><strong>🏛 Accepted</strong> Distinct protocol proposals initiated by the baker with final TzKT status <em>accepted</em>.</span>
                <span><strong>🗳 Streak</strong> Consecutive completed Exploration/Promotion periods with an applied ballot, through the latest completed ballot period.</span>
                <span><strong>↗ Rising</strong> Staking balance increased since the previous leaderboard refresh.</span>
                <small>Signals are factual on-chain history markers, not uptime, payout, or performance grades.</small>
            </div>
        </details>
    `;
}

function governanceSignalsSourceLabel() {
    const readyCount = Number(governanceSignals.careerReady) + Number(governanceSignals.proposalsReady);
    if (!readyCount) return 'governance signals unavailable';
    const dates = [governanceSignals.careerGeneratedAt, governanceSignals.proposalsGeneratedAt]
        .map((value) => Date.parse(value || ''))
        .filter(Number.isFinite);
    const asOf = dates.length ? new Date(Math.min(...dates)).toISOString().slice(0, 10) : null;
    const hasRefreshError = Boolean(governanceSignals.careerError || governanceSignals.proposalsError);
    const scope = readyCount === 2
        ? (hasRefreshError ? 'last-good governance receipts' : 'governance receipts')
        : (hasRefreshError ? 'partial last-good governance receipts' : 'partial governance receipts');
    const currentTotal = governanceSignals.runtimeMatchedCount + governanceSignals.runtimeMissingAddresses.length;
    const runtimeCoverage = currentTotal
        ? ` · ${governanceSignals.runtimeMatchedCount}/${currentTotal} current bakers covered`
        : '';
    return `${scope}${asOf ? ` ${asOf} UTC` : ''}${runtimeCoverage}`;
}

/**
 * Render the leaderboard table
 */
function render(container, { focusSort = '', quiet = false } = {}) {
    const ranked = sortBakers(bakersData, currentSort.col, currentSort.dir);
    const sorted = showOpenOvensOnly
        ? ranked.filter((baker) => baker.openDelegationRoom)
        : ranked;
    const savedAddress = savedBakerAddress();
    const legendOpen = Boolean(container.querySelector('.leaderboard-signal-legend')?.open);
    
    const arrow = (col) => {
        if (currentSort.col !== col) return '';
        return currentSort.dir === 'desc' ? ' ▾' : ' ▴';
    };

    const headerClass = (col) => currentSort.col === col ? 'lb-th active' : 'lb-th';
    const sortHeader = (col, label, shortLabel = '') => {
        const active = currentSort.col === col;
        const direction = active ? (currentSort.dir === 'asc' ? 'ascending' : 'descending') : 'none';
        const nextDirection = active && currentSort.dir === 'asc' ? 'descending' : 'ascending';
        const visibleLabel = shortLabel
            ? `<span class="full-title">${escapeHtml(label)}</span><span class="short-title">${escapeHtml(shortLabel)}</span>`
            : escapeHtml(label);
        const ariaLabel = active
            ? `${label}, sorted ${direction}. Sort ${nextDirection}`
            : `Sort by ${label}, ${nextDirection}`;
        return `
            <th scope="col" class="${headerClass(col)}" data-col="${col}" aria-sort="${direction}">
                <button type="button" class="lb-sort-btn" data-col="${col}" aria-label="${escapeHtml(ariaLabel)}">
                    <span>${visibleLabel}</span><span class="lb-sort-arrow" aria-hidden="true">${arrow(col)}</span>
                </button>
            </th>`;
    };

    let html = `
        ${fitFinderHtml(ranked)}
        <div class="leaderboard-affordance-row">
            ${signalLegendHtml(legendOpen)}
            <button type="button" id="leaderboard-open-ovens-filter" class="leaderboard-filter-chip ${showOpenOvensOnly ? 'active' : ''}" aria-pressed="${showOpenOvensOnly ? 'true' : 'false'}">
                <span class="lb-open-capacity-dot" aria-hidden="true"></span>
                Show open ovens
            </button>
        </div>
        <div class="leaderboard-table-wrap">
            <table class="leaderboard-table">
                <caption class="leaderboard-table-caption">Active Tezos bakers with tenure, governance, and growth signals. Choose a baker name to open full details and sharing.</caption>
                <thead>
                    <tr>
                        <th scope="col" class="lb-th lb-rank">#</th>
                        ${sortHeader('name', 'Baker')}
                        ${sortHeader('stake', 'Staking Balance', '🍞 Balance')}
                        ${sortHeader('delegators', 'Delegators')}
                        ${sortHeader('stakers', 'Stakers')}
                        ${sortHeader('capacity', 'Capacity')}
                        ${sortHeader('tz4', 'tz4 consensus key')}
                    </tr>
                </thead>
                <tbody>
    `;

    sorted.forEach((b, i) => {
        const capacityClass = b.delegationUsage >= 90 ? 'cap-critical' : b.delegationUsage >= 70 ? 'cap-warning' : '';
        const isMine = savedAddress && normalizedAddress(b.address) === savedAddress;
        const badgeRail = b.earnedBadges?.length
            ? `<span class="lb-badge-rail" aria-label="Baker signals">${b.earnedBadges.map(signalBadgeHtml).join('')}</span>`
            : '';
        const signalAria = b.earnedBadges?.length
            ? `. Signals: ${b.earnedBadges.map((badge) => badge.label).join(', ')}`
            : '';
        const openRoom = b.openDelegationRoom
            ? '<span class="lb-open-capacity-dot" title="Open delegation room" aria-label="Open delegation room"></span>'
            : '';
        const mineMarker = isMine ? '<span class="lb-my-baker-marker" title="Your baker" aria-label="Your baker">🍞</span>' : '';
        html += `
            <tr class="lb-row ${isMine ? 'lb-my-baker' : ''}" data-address="${escapeHtml(b.address)}">
                <td class="lb-rank">${i + 1}</td>
                <td class="lb-name">
                    <button type="button" class="lb-baker-open" data-address="${escapeHtml(b.address)}" title="${escapeHtml(b.address)}" aria-label="Open ${escapeHtml(b.name)} baker details${escapeHtml(signalAria)}">
                        <span class="lb-name-main">${mineMarker}${escapeHtml(b.name)}</span>${badgeRail}
                    </button>
                </td>
                <td class="lb-num">${formatMutez(b.stakingBalance)}</td>
                <td class="lb-num">${b.delegators}</td>
                <td class="lb-num">${b.stakers}</td>
                <td class="lb-num lb-capacity-cell ${capacityClass}">${openRoom}${b.delegationUsage.toFixed(0)}%</td>
                <td class="lb-tz4">${b.tz4 ? '✅' : '—'}</td>
            </tr>
        `;
    });

    html += `</tbody></table></div>`;
    const countLabel = showOpenOvensOnly
        ? `${sorted.length} of ${ranked.length} active bakers with open delegation room`
        : `${sorted.length} active bakers`;
    const sourceLabel = leaderboardDataQuality.status === 'live'
        ? 'live baker data'
        : leaderboardDataQuality.status === 'cached'
            ? 'recent cached baker data'
            : leaderboardDataQuality.status === 'stale'
                ? 'last-known cached baker data'
                : 'baker data unavailable';
    html += `<div class="leaderboard-footer">${countLabel} · ${sourceLabel} · ${governanceSignalsSourceLabel()} · capacity uses ${delegationLimitSource === 'live' ? 'live' : 'fallback'} protocol limit (${delegationLimit}x)</div>`;

    if (quiet) quietlySyncHtml(container, html);
    else container.innerHTML = html;
    focusSavedBakerRow(container);
    if (focusSort) {
        container.querySelector(`.lb-sort-btn[data-col="${CSS.escape(focusSort)}"]`)?.focus({ preventScroll: true });
    }

    const ovensFilter = container.querySelector('#leaderboard-open-ovens-filter');
    if (ovensFilter) ovensFilter.onclick = () => {
        showOpenOvensOnly = !showOpenOvensOnly;
        render(container);
    };

    container.querySelectorAll('.baker-fit-option').forEach((button) => {
        button.onclick = () => {
            const key = button.dataset.fitKey;
            const value = button.dataset.fitValue;
            if (!key || !value) return;
            fitPrefs = { ...fitPrefs, [key]: value };
            saveFitPrefs(fitPrefs);
            render(container);
        };
    });

    container.querySelectorAll('.baker-fit-select').forEach((button) => {
        button.onclick = (event) => {
            event.stopPropagation();
            openBakerInDrawer(button.dataset.address);
        };
    });

    // Native buttons make sorting reachable by click, Enter, and Space. The
    // owning columnheader carries aria-sort, and focus survives the rerender.
    container.querySelectorAll('.lb-sort-btn[data-col]').forEach(button => {
        button.onclick = () => {
            const col = button.dataset.col;
            if (currentSort.col === col) {
                currentSort.dir = currentSort.dir === 'desc' ? 'asc' : 'desc';
            } else {
                currentSort.col = col;
                currentSort.dir = col === 'name' ? 'asc' : 'desc';
            }
            try { localStorage.setItem(SORT_KEY, JSON.stringify(currentSort)); } catch {}
            render(container, { focusSort: col });
        };
    });

    // Baker names are the single explicit row action. Full details retain the
    // existing report-card/share workflow without another button in every row.
    container.querySelectorAll('.lb-baker-open').forEach(button => {
        button.onclick = () => {
            openBakerInDrawer(button.dataset.address);
        };
    });
}

function focusSavedBakerRow(container, { scroll = false } = {}) {
    const row = container.querySelector('.lb-row.lb-my-baker');
    if (!row) return;
    if (scroll || container.dataset.focusMyBaker === '1') {
        row.scrollIntoView({ block: 'center', behavior: 'smooth' });
        container.dataset.focusMyBaker = '0';
    }
    if (container.dataset.myBakerPulsedAddress !== row.dataset.address) {
        container.dataset.myBakerPulsedAddress = row.dataset.address;
        pulseFresh(row);
    }
}

function renderLeaderboardSkeleton() {
    const rows = Array.from({ length: 8 }, (_, index) => `
        <tr class="lb-row lb-row-loading">
            <td class="lb-rank"><span class="leaderboard-row-shimmer rank"></span></td>
            <td><span class="leaderboard-row-shimmer name"></span></td>
            <td><span class="leaderboard-row-shimmer num"></span></td>
            <td><span class="leaderboard-row-shimmer num"></span></td>
            <td><span class="leaderboard-row-shimmer num"></span></td>
            <td><span class="leaderboard-row-shimmer num"></span></td>
            <td><span class="leaderboard-row-shimmer short"></span></td>
        </tr>
    `).join('');

    return `
        <div class="leaderboard-loading-state" role="status" aria-live="polite">
            <div class="leaderboard-loading-copy">
                <strong>Preheating the baker board</strong>
                <span>Ranking funded active bakers by staking balance.</span>
            </div>
            <div class="leaderboard-table-wrap" aria-hidden="true">
                <table class="leaderboard-table">
                    <thead>
                        <tr>
                            <th scope="col" class="lb-th lb-rank">#</th>
                            <th scope="col" class="lb-th">Baker</th>
                            <th scope="col" class="lb-th">Staking Balance</th>
                            <th scope="col" class="lb-th">Delegators</th>
                            <th scope="col" class="lb-th">Stakers</th>
                            <th scope="col" class="lb-th">Capacity</th>
                            <th scope="col" class="lb-th">tz4</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </div>
    `;
}

/**
 * Load and render the leaderboard
 */
async function loadLeaderboard(container, { quiet = false } = {}) {
    if (!quiet) container.innerHTML = renderLeaderboardSkeleton();
    
    try {
        const [raw, limit] = await Promise.all([
            fetchBakers(),
            fetchDelegationLimit(),
            fetchGovernanceSignals()
        ]);
        bakersData = raw.map(b => enrichBaker(b, limit));
        rememberStakeSnapshot(raw);
        render(container, { quiet });
    } catch (err) {
        if (quiet && container.children.length) {
            console.error('Leaderboard background refresh error:', err);
            return;
        }
        container.innerHTML = '<div class="leaderboard-error">The baker board didn\'t load — the oven door may be stuck. Retry?</div>';
        console.error('Leaderboard fetch error:', err);
    }
}

/**
 * Initialize leaderboard section
 */
function setLauncherToggleState(btn, isOn) {
    const helper = window.tezosSystemsLauncher?.setToggleState;
    if (helper) {
        helper(btn, isOn);
        return;
    }
    btn?.classList.toggle('active', isOn);
    btn?.setAttribute('aria-pressed', String(isOn));
    const pill = btn?.querySelector('.feature-status');
    if (pill) pill.textContent = btn?.dataset[isOn ? 'statusOn' : 'statusOff'] || (isOn ? 'Showing' : 'Hidden');
}

export function initLeaderboard() {
    const section = document.getElementById('leaderboard-section');
    if (!section) return;

    const toggleBtn = document.getElementById('leaderboard-toggle');
    const container = document.getElementById('leaderboard-results');
    if (!toggleBtn || !container) return;

    try {
        LEGACY_CACHE_KEYS.forEach((key) => localStorage.removeItem(key));
    } catch {}

    // Restore sort preference
    try {
        const saved = JSON.parse(localStorage.getItem(SORT_KEY));
        if (saved?.col) currentSort = saved;
    } catch {}

    // Keep the established launcher id for deep links, onboarding, and tests,
    // but its primary action now enters the full Chamber. The legacy inline
    // section remains readable for visitors who previously opted into it.
    toggleBtn.addEventListener('click', () => {
        openBakerDirectoryChamber().catch((error) => {
            console.warn('Failed to open Baker Directory Chamber:', error);
        });
    });
    toggleBtn.setAttribute('aria-label', 'Open Baker Directory Chamber');
    toggleBtn.setAttribute('aria-haspopup', 'dialog');
    toggleBtn.setAttribute('aria-controls', 'baker-directory-modal');
    toggleBtn.title = 'Open Baker Directory Chamber';

    window.addEventListener('my-baker-updated', () => {
        if (!bakersData.length || !section.classList.contains('visible')) return;
        container.dataset.focusMyBaker = '1';
        render(container);
    });

    // The former inline board remains a compatibility target for baker-profile
    // deep links, but the Explore control now always opens the Chamber.
    section.classList.remove('visible');
    toggleBtn.classList.remove('active');
    toggleBtn.removeAttribute('aria-pressed');
}

/**
 * Refresh leaderboard data (called on main refresh)
 */
export function refreshLeaderboard({ quiet = false } = {}) {
    const container = document.getElementById('leaderboard-results');
    if (!container || !bakersData.length) return;
    // Only refresh if section is visible
    const section = document.getElementById('leaderboard-section');
    if (section?.classList.contains('visible')) {
        return loadLeaderboard(container, { quiet });
    }
}

/**
 * Open My Tezos drawer by address (used for #baker=ADDRESS deep link)
 */
export async function openBakerProfile(address) {
    const openDrawer = () => {
        const drawer = document.getElementById('my-tezos-drawer');
        const scrim = document.getElementById('my-tezos-drawer-scrim');
        const emptyState = document.getElementById('drawer-empty-state');
        const connectedState = document.getElementById('drawer-connected');
        if (drawer && scrim) {
            drawer.classList.add('open');
            scrim.classList.add('open');
            document.body.style.overflow = 'hidden';
            if (emptyState) emptyState.style.display = 'none';
            if (connectedState) connectedState.style.display = '';
        }
    };

    const setAddressInput = (value) => {
        const myBakerInput = document.getElementById('my-baker-input');
        const drawerInput = document.getElementById('drawer-address-input');
        if (myBakerInput) myBakerInput.value = value;
        if (drawerInput) drawerInput.value = value;
    };

    const saveBtn = document.getElementById('my-baker-save') || document.getElementById('drawer-connect-btn');

    // Also ensure leaderboard section is open
    const section = document.getElementById('leaderboard-section');
    const toggleBtn = document.getElementById('leaderboard-toggle');
    if (section && toggleBtn && !section.classList.contains('visible')) {
        localStorage.setItem(TOGGLE_KEY, 'true');
        section.classList.add('visible');
        setLauncherToggleState(toggleBtn, true);
        toggleBtn.title = 'Baker Directory: Showing';
    }
    const leaderboardContainer = document.getElementById('leaderboard-results');
    if (leaderboardContainer) leaderboardContainer.dataset.focusMyBaker = '1';

    const originalAddress = address;

    // Resolve .tez domains to tz addresses (silently; keep drawer open either way)
    if (address.endsWith('.tez')) {
        try {
            const domainResp = await fetch('https://api.tezos.domains/graphql', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    query: `query ResolveDomain($name: String!) { domain(name: $name) { address owner } }`,
                    variables: { name: address }
                }),
            });
            const domainData = await domainResp.json();
            const domain = domainData?.data?.domain || {};
            const resolved = [domain.address, domain.owner].find(isValidAddress);
            if (!resolved) throw new Error(`Domain "${address}" not found`);
            address = resolved;
        } catch (err) {
            console.warn('[deep-link] domain resolve failed:', err?.message || err);
            setAddressInput(originalAddress);
            openDrawer();
            return;
        }
    }

    // Validate resolved address
    if (!isValidAddress(address)) {
        console.warn('[deep-link] invalid baker address:', address);
        setAddressInput(originalAddress);
        openDrawer();
        return;
    }

    try {
        const resp = await fetch(`${TZKT}/delegates/${encodeURIComponent(address)}`);
        if (!resp.ok || resp.status === 204) throw new Error('No oven at that address — double-check the tz1?');
        const baker = await resp.json();
        if (!baker || !baker.active) throw new Error('This baker\'s oven has gone cold — not currently active.');

        // CRITICAL: set localStorage BEFORE clicking save and opening drawer.
        // This ensures refreshMyTezos (triggered by my-baker-updated) renders the correct baker.
        localStorage.setItem('tezos-systems-my-baker-address', address);
        setAddressInput(address);

        // Trigger save handler to render baker data + dispatch my-baker-updated
        if (saveBtn) saveBtn.click();

        // Now open drawer — it will show the correct baker immediately
        openDrawer();
    } catch (err) {
        console.warn('[deep-link] baker lookup failed:', err?.message || err);
        localStorage.setItem('tezos-systems-my-baker-address', address || originalAddress);
        setAddressInput(address || originalAddress);
        if (saveBtn) saveBtn.click();
        openDrawer();
    }
}

// ─── Baker Directory Chamber ────────────────────────────────────────────────

function isBakerDirectoryRoute() {
    return /^\/leaderboard\/?$/.test(window.location.pathname);
}

function cleanDirectoryQuery(value, maxLength = 96) {
    return String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, maxLength);
}

function readBakerDirectoryRouteState() {
    if (!isBakerDirectoryRoute()) return null;
    const params = new URL(window.location.href).searchParams;
    const view = cleanDirectoryQuery(params.get('view'), 16);
    return {
        view: BAKER_DIRECTORY_VIEW_IDS.has(view) ? view : 'discover',
        search: cleanDirectoryQuery(params.get('search')),
        requestedBaker: cleanDirectoryQuery(params.get('baker'), 128)
    };
}

function applyBakerDirectoryRouteState() {
    const route = readBakerDirectoryRouteState();
    if (!route) return;
    bakerDirectoryState = {
        ...bakerDirectoryState,
        ...route,
        selectedAddress: ''
    };
}

function updateBakerDirectoryRouteState() {
    if (!isBakerDirectoryRoute()) return;
    const url = new URL(window.location.href);
    url.searchParams.set('view', bakerDirectoryState.view);
    if (bakerDirectoryState.search) url.searchParams.set('search', bakerDirectoryState.search);
    else url.searchParams.delete('search');
    const baker = bakerDirectoryState.selectedAddress || bakerDirectoryState.requestedBaker;
    if (baker) url.searchParams.set('baker', baker);
    else url.searchParams.delete('baker');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

function leaveBakerDirectoryRoute() {
    if (!isBakerDirectoryRoute()) return;
    window.history.replaceState(
        { ...(window.history.state || {}), tezosSystemsRoute: 'home' },
        '',
        '/'
    );
    window.dispatchEvent(new CustomEvent('tezos:routechange', {
        detail: { entryId: 'home', route: '/', replace: true, current: false }
    }));
}

function directorySignalTone(baker) {
    const tones = new Set((baker.earnedBadges || []).map(({ tone }) => tone));
    if (baker.tz4) tones.add('tz4');
    return tones;
}

function bakerMatchesDirectorySearch(baker, query) {
    const cleaned = String(query || '').trim().toLowerCase();
    if (!cleaned) return true;
    const terms = cleaned.split(/\s+/).filter(Boolean);
    const searchable = searchableBakerText(baker);
    return terms.every((term) => searchable.includes(term) || compactSearchText(searchable).includes(compactSearchText(term)));
}

function directoryBakers({ ignoreSignal = false, ignoreSearch = false } = {}) {
    let rows = bakersData.filter((baker) => (
        (ignoreSearch || bakerMatchesDirectorySearch(baker, bakerDirectoryState.search))
        && (!bakerDirectoryState.openOnly || baker.openDelegationRoom)
        && (ignoreSignal
            || bakerDirectoryState.signal === 'all'
            || directorySignalTone(baker).has(bakerDirectoryState.signal))
    ));
    rows = sortBakers(rows, bakerDirectoryState.sort, bakerDirectoryState.dir);
    return rows;
}

function resolveRequestedDirectoryBaker() {
    const requested = cleanDirectoryQuery(bakerDirectoryState.requestedBaker, 128);
    if (!requested || !bakersData.length) return null;
    const normalized = normalizedAddress(requested);
    const exact = bakersData.find((baker) => normalizedAddress(baker.address) === normalized)
        || bakersData.find((baker) => String(baker.alias || '').trim().toLowerCase() === requested.toLowerCase())
        || bakersData.find((baker) => String(baker.name || '').trim().toLowerCase() === requested.toLowerCase());
    const match = exact || bakersData
        .map((baker) => ({ baker, score: scoreBakerMatch(baker, requested) }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)[0]?.baker;
    if (!match) return null;
    bakerDirectoryState.selectedAddress = match.address;
    bakerDirectoryState.requestedBaker = '';
    return match;
}

function selectedDirectoryBaker() {
    const selected = normalizedAddress(bakerDirectoryState.selectedAddress);
    return selected ? bakersData.find((baker) => normalizedAddress(baker.address) === selected) || null : null;
}

function compactXtz(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 'Unavailable';
    return new Intl.NumberFormat('en-US', {
        notation: Math.abs(number) >= 10000 ? 'compact' : 'standard',
        maximumFractionDigits: Math.abs(number) >= 10000 ? 1 : 0
    }).format(number);
}

function exactXtz(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 'Unavailable';
    return Math.floor(number).toLocaleString('en-US');
}

function operationHashFrom(result) {
    return String(result?.operationHash || result?.transactionHash || '').trim();
}

function xtzInputToMutez(value) {
    const cleaned = String(value || '').trim();
    if (!/^\d+(?:\.\d{1,6})?$/.test(cleaned)) return null;
    const [whole, fraction = ''] = cleaned.split('.');
    const mutez = (BigInt(whole) * 1_000_000n) + BigInt(fraction.padEnd(6, '0'));
    return mutez > 0n ? mutez : null;
}

function bakerActionButtonsHtml(baker, { compact = false } = {}) {
    return `
        <span class="baker-action-buttons ${compact ? 'compact' : ''}" aria-label="${escapeHtml(baker.name)} wallet actions">
            <button type="button" data-baker-action="delegate" data-baker-address="${escapeHtml(baker.address)}">Delegate</button>
            <button type="button" data-baker-action="stake" data-baker-address="${escapeHtml(baker.address)}">Stake</button>
        </span>
    `;
}

async function fetchBakerActionAccount(walletAccount) {
    if (!walletAccount?.address) return null;
    const response = await fetch(`${TZKT}/accounts/${encodeURIComponent(walletAccount.address)}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Connected account lookup failed (${response.status})`);
    return response.json();
}

async function fetchFreshActionBaker(address) {
    const [response, limit] = await Promise.all([
        fetch(`${TZKT}/delegates/${encodeURIComponent(address)}`, { cache: 'no-store' }),
        fetchDelegationLimit()
    ]);
    if (!response.ok) throw new Error(`Baker refresh failed (${response.status})`);
    return enrichBaker(await response.json(), limit);
}

function closeBakerActionDialog() {
    const overlay = document.getElementById('baker-action-modal');
    if (!overlay) return;
    overlay.classList.remove('active');
    deactivateChamberDialog(overlay);
    overlay.setAttribute('aria-hidden', 'true');
    bakerActionState = null;
}

function ensureBakerActionDialog() {
    let overlay = document.getElementById('baker-action-modal');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'baker-action-modal';
    overlay.className = 'modal-overlay baker-action-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
        <div class="baker-action-dialog" role="dialog" aria-modal="true" aria-labelledby="baker-action-title" tabindex="-1">
            <button type="button" class="baker-action-close" aria-label="Close baker wallet action">&times;</button>
            <div id="baker-action-content"></div>
        </div>
    `;
    overlay.addEventListener('click', async (event) => {
        if (event.target === overlay || event.target.closest('.baker-action-close')) {
            closeBakerActionDialog();
            return;
        }
        const connect = event.target.closest('[data-baker-action-connect]');
        if (connect) {
            connect.disabled = true;
            try {
                await connectOctezWallet({ syncMyTezos: false });
                await renderBakerActionDialog({ refresh: true });
            } catch (error) {
                bakerActionState = { ...bakerActionState, status: error?.message || 'Wallet connection failed', tone: 'error' };
                await renderBakerActionDialog();
            }
            return;
        }
        const submit = event.target.closest('[data-baker-action-submit]');
        if (submit) submitBakerAction(submit).catch(() => {});
    });
    document.body.appendChild(overlay);
    return overlay;
}

function actionStatusHtml(state) {
    if (!state?.status) return '';
    return `<p class="baker-action-status" data-tone="${escapeHtml(state.tone || '')}" role="status" aria-live="polite">${escapeHtml(state.status)}${state.operationHash ? ` · <a href="https://tzkt.io/${encodeURIComponent(state.operationHash)}" target="_blank" rel="noopener noreferrer">View operation</a>` : ''}</p>`;
}

async function renderBakerActionDialog({ refresh = false } = {}) {
    const state = bakerActionState;
    if (!state) return;
    const overlay = ensureBakerActionDialog();
    const content = overlay.querySelector('#baker-action-content');
    const requestId = (state.requestId || 0) + 1;
    bakerActionState = { ...state, requestId };

    if (refresh || !state.accountLoaded) {
        content.innerHTML = `
            <h2 id="baker-action-title">Preparing baker action</h2>
            <div class="baker-action-loading" role="status">Reading wallet and baker state…</div>
        `;
        try {
            const wallet = await getWalletAccount({ quiet: true });
            const [account, baker] = await Promise.all([
                wallet?.address ? fetchBakerActionAccount(wallet) : Promise.resolve(null),
                fetchFreshActionBaker(state.baker.address)
            ]);
            if (!bakerActionState || bakerActionState.requestId !== requestId) return;
            bakerActionState = { ...bakerActionState, baker, wallet, account, accountLoaded: true };
        } catch (error) {
            if (!bakerActionState || bakerActionState.requestId !== requestId) return;
            bakerActionState = {
                ...bakerActionState,
                accountLoaded: true,
                status: error?.message || 'Live wallet state is unavailable',
                tone: 'error'
            };
        }
    }

    const current = bakerActionState;
    if (!current) return;
    const { baker, wallet, account, mode } = current;
    const connected = Boolean(wallet?.address);
    const wrongNetwork = Boolean(wallet?.network?.type && wallet.network.type !== 'mainnet');
    const registeredDelegate = account?.type === 'delegate';
    const currentDelegate = String(account?.delegate?.address || '');
    const alreadyThisBaker = currentDelegate === baker.address;
    const delegatedElsewhere = Boolean(currentDelegate && !alreadyThisBaker);
    const accountBalance = Math.max(0, Number(account?.balance || 0) / 1_000_000);
    const delegationFits = accountBalance <= Math.max(0, Number(baker.freeDelegationCapacity || 0));
    const canDelegate = connected && !wrongNetwork && !registeredDelegate && !currentDelegate
        && baker.active !== false && delegationFits;
    const canStake = connected && !wrongNetwork && !registeredDelegate && alreadyThisBaker
        && baker.acceptsExternalStake;
    let blocked = '';
    if (!connected) blocked = 'Connect a wallet to continue. This does not replace the watch-only address saved in My Tezos.';
    else if (wrongNetwork) blocked = 'Switch the connected wallet to Tezos Mainnet.';
    else if (registeredDelegate) blocked = 'Registered baker accounts are not handled by these delegator actions.';
    else if (delegatedElsewhere) blocked = `This wallet already delegates to ${account.delegate?.alias || shortAddress(currentDelegate)}. Baker switching is intentionally not offered here.`;
    else if (mode === 'delegate' && alreadyThisBaker) blocked = 'This wallet already delegates to this baker.';
    else if (mode === 'delegate' && !delegationFits) blocked = `This wallet’s ${exactXtz(accountBalance)} XTZ balance exceeds the baker’s reported ${exactXtz(baker.freeDelegationCapacity)} XTZ delegation room.`;
    else if (mode === 'stake' && !alreadyThisBaker) blocked = 'Confirm delegation to this baker before staking.';
    else if (mode === 'stake' && !baker.acceptsExternalStake) blocked = 'This baker is not currently accepting additional external stake.';

    const title = mode === 'stake' ? `Stake with ${baker.name}` : `Delegate to ${baker.name}`;
    const pending = baker.pendingStakingParameters
        ? '<p class="baker-action-warning">This baker has a pending staking-parameter change. Review the wallet request and current terms carefully.</p>'
        : '';
    content.innerHTML = `
        <span class="feature-kicker">Wallet-reviewed action</span>
        <h2 id="baker-action-title">${escapeHtml(title)}</h2>
        <code class="baker-action-address">${escapeHtml(baker.address)}</code>
        <dl class="baker-action-facts">
            <div><dt>Connected wallet</dt><dd>${connected ? escapeHtml(shortAddress(wallet.address)) : 'Not connected'}</dd></div>
            <div><dt>Delegation room</dt><dd>${exactXtz(baker.freeDelegationCapacity)} XTZ</dd></div>
            <div><dt>Staking room</dt><dd>${exactXtz(baker.freeStakingCapacity)} XTZ</dd></div>
            <div><dt>Staker reward edge</dt><dd>${(Number(baker.rewardEdge || 0) * 100).toFixed(1)}%</dd></div>
        </dl>
        ${pending}
        ${mode === 'stake' ? `
            <label class="baker-action-amount">Amount to stake
                <span><input id="baker-action-stake-amount" type="number" min="0.000001" step="0.000001" inputmode="decimal" placeholder="0.000000"> XTZ</span>
            </label>
            <p class="baker-action-risk">Staked tez are locked, can take up to about four days to become spendable after unstaking, and can be slashed if the baker misbehaves. At least 1 XTZ must remain liquid for fees.</p>
            <label class="baker-action-confirm"><input id="baker-action-risk-confirm" type="checkbox"> I understand the locking and slashing risk.</label>
        ` : `
            <p class="baker-action-risk">Delegation stays liquid and assigns this wallet’s balance to the selected baker. Baker fees and payout policy remain off-chain terms to verify independently.</p>
        `}
        ${blocked ? `<p class="baker-action-blocked">${escapeHtml(blocked)}</p>` : ''}
        ${actionStatusHtml(current)}
        <div class="baker-action-footer">
            ${!connected ? '<button type="button" data-baker-action-connect>Connect wallet</button>' : ''}
            <button type="button" class="primary" data-baker-action-submit="${mode}" ${mode === 'stake' ? (canStake ? '' : 'disabled') : (canDelegate ? '' : 'disabled')}>${mode === 'stake' ? 'Review stake in wallet' : 'Review delegation in wallet'}</button>
        </div>
    `;
}

async function pollBakerActionStatus(mode, operationHash) {
    if (!operationHash) return;
    const endpoint = mode === 'stake' ? 'transactions' : 'delegations';
    for (let attempt = 0; attempt < 12; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 3000));
        try {
            const response = await fetch(`${TZKT}/operations/${endpoint}/${encodeURIComponent(operationHash)}/status`, { cache: 'no-store' });
            if (!response.ok) continue;
            const value = String(await response.json()).replaceAll('"', '').toLowerCase();
            if (value === 'applied') {
                if (bakerActionState?.operationHash === operationHash) {
                    bakerActionState = {
                        ...bakerActionState,
                        status: mode === 'stake' ? 'Stake confirmed on-chain.' : 'Delegation confirmed on-chain.',
                        tone: 'success'
                    };
                    await renderBakerActionDialog({ refresh: true });
                }
                refreshBakerDirectoryChamber({ quiet: true, includeGovernance: false }).catch(() => {});
                return;
            }
            if (['failed', 'backtracked', 'skipped'].includes(value)) {
                if (bakerActionState?.operationHash === operationHash) {
                    bakerActionState = { ...bakerActionState, status: `Operation ${value}.`, tone: 'error' };
                    await renderBakerActionDialog();
                }
                return;
            }
        } catch { /* keep polling while the indexer catches up */ }
    }
}

async function submitBakerAction(button) {
    const current = bakerActionState;
    if (!current || button.disabled) return;
    button.disabled = true;
    const mode = current.mode;
    try {
        const wallet = await getWalletAccount();
        const [account, baker] = await Promise.all([
            fetchBakerActionAccount(wallet),
            fetchFreshActionBaker(current.baker.address)
        ]);
        if (account.type === 'delegate') throw new Error('Registered baker accounts cannot use this action');
        const delegate = String(account.delegate?.address || '');
        let result;
        if (mode === 'delegate') {
            if (delegate) throw new Error('This wallet already has a baker; switching is not offered here');
            const balance = Math.max(0, Number(account.balance || 0) / 1_000_000);
            if (baker.active === false || balance > Math.max(0, baker.freeDelegationCapacity)) {
                throw new Error('The baker no longer has enough delegation room for this wallet');
            }
            ({ result } = await requestConnectedWalletDelegation(baker.address));
        } else {
            if (delegate !== baker.address) throw new Error('This wallet must first be delegated to the selected baker');
            if (!baker.acceptsExternalStake) throw new Error('The baker no longer has external staking room');
            const input = document.getElementById('baker-action-stake-amount');
            const confirmed = document.getElementById('baker-action-risk-confirm')?.checked;
            const amountMutez = xtzInputToMutez(input?.value);
            if (!amountMutez) throw new Error('Enter a positive stake amount with no more than six decimals');
            if (!confirmed) throw new Error('Confirm the locking and slashing risk before staking');
            const liquidMutez = BigInt(String(Math.max(0, Math.floor(Number(account.balance || 0)))));
            const reserveMutez = 1_000_000n;
            const roomMutez = BigInt(String(Math.max(0, Math.floor(Number(baker.freeStakingCapacity || 0) * 1_000_000))));
            if (amountMutez > roomMutez) throw new Error('The amount exceeds the baker’s current staking room');
            if (liquidMutez <= reserveMutez || amountMutez > liquidMutez - reserveMutez) throw new Error('Leave at least 1 XTZ liquid for fees');
            ({ result } = await requestConnectedWalletStake(amountMutez.toString()));
        }
        const operationHash = operationHashFrom(result);
        bakerActionState = {
            ...current,
            baker,
            wallet,
            account,
            accountLoaded: true,
            operationHash,
            status: 'Submitted; waiting for on-chain confirmation.',
            tone: 'success'
        };
        await renderBakerActionDialog();
        pollBakerActionStatus(mode, operationHash).catch(() => {});
    } catch (error) {
        bakerActionState = {
            ...current,
            status: /abort|cancel|declin|reject|denied/i.test(String(error?.message || error))
                ? 'The wallet did not submit the operation.'
                : (error?.message || 'The operation could not be submitted.'),
            tone: 'error',
            accountLoaded: true
        };
        await renderBakerActionDialog();
    }
}

function openBakerActionDialog(mode, address) {
    const baker = bakersData.find((item) => normalizedAddress(item.address) === normalizedAddress(address));
    if (!baker || !['delegate', 'stake'].includes(mode)) return;
    const overlay = ensureBakerActionDialog();
    bakerActionState = { mode, baker, accountLoaded: false, status: '', tone: '', operationHash: '' };
    overlay.classList.add('active');
    activateChamberDialog(overlay, {
        close: closeBakerActionDialog,
        dialogSelector: '.baker-action-dialog',
        titleId: 'baker-action-title',
        initialFocusSelector: '.baker-action-close'
    });
    renderBakerActionDialog({ refresh: true }).catch(() => {});
}

function formattedObservedAt() {
    const parsed = Date.parse(leaderboardDataQuality.observedAt || '');
    if (!Number.isFinite(parsed)) return 'Awaiting a source receipt';
    return `Observed ${formatFreshnessStamp(parsed, { source: 'TzKT' })}`;
}

function bakerDirectoryEntryFreshnessLabel() {
    const parsed = Date.parse(leaderboardDataQuality.observedAt || '');
    if (!Number.isFinite(parsed)) return 'TzKT freshness unavailable';
    const source = leaderboardDataQuality.status === 'live'
        ? 'TzKT observed'
        : leaderboardDataQuality.status === 'cached'
            ? 'Cached TzKT'
            : 'Last-good TzKT';
    return formatFreshnessStamp(parsed, { source });
}

function bakerDirectorySummary() {
    const active = bakersData.length;
    const open = bakersData.filter(({ openDelegationRoom }) => openDelegationRoom).length;
    const tz4 = bakersData.filter(({ tz4 }) => tz4).length;
    const tenure = bakersData.filter((baker) => directorySignalTone(baker).has('og') || directorySignalTone(baker).has('veteran')).length;
    const accepted = bakersData.filter((baker) => directorySignalTone(baker).has('accepted')).length;
    const voting = bakersData.filter((baker) => directorySignalTone(baker).has('voting')).length;
    const totalStake = bakersData.reduce((sum, baker) => sum + Number(baker.stake || 0), 0);
    return { active, open, tz4, tenure, accepted, voting, totalStake };
}

function bakerDirectorySourceText() {
    const data = leaderboardDataQuality.status === 'live'
        ? 'Live TzKT active-delegate receipt'
        : leaderboardDataQuality.status === 'cached'
            ? 'Recent cached TzKT receipt'
            : leaderboardDataQuality.status === 'stale'
                ? 'Last-good cached TzKT receipt'
                : 'TzKT receipt unavailable';
    return `${data} · ${governanceSignalsSourceLabel()} · ${delegationLimitSource === 'live' ? 'live' : 'fallback'} ${delegationLimit}x delegation limit`;
}

function directoryBadgeRailHtml(baker) {
    const badges = baker.earnedBadges || [];
    const tz4Badge = baker.tz4
        ? '<span class="lb-badge lb-badge-tz4" title="The current consensus key uses a tz4/BLS address." aria-label="tz4 BLS consensus key">tz4 / BLS</span>'
        : '';
    if (!badges.length && !tz4Badge) return '<span class="baker-directory-no-signal">No listed signal</span>';
    return `<span class="lb-badge-rail">${badges.map(signalBadgeHtml).join('')}${tz4Badge}</span>`;
}

function directoryBakerDetailHtml(baker) {
    if (!baker) return '';
    const firstActivity = Number.isFinite(Date.parse(baker.firstActivityTime || ''))
        ? new Date(baker.firstActivityTime).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })
        : 'Unavailable';
    const capacity = Number(baker.freeDelegationCapacity || 0);
    return `
        <aside class="baker-directory-detail" data-address="${escapeHtml(baker.address)}" aria-labelledby="baker-directory-detail-title">
            <div class="baker-directory-detail-head">
                <div>
                    <span class="feature-kicker">Selected baker</span>
                    <h3 id="baker-directory-detail-title">${escapeHtml(baker.name)}</h3>
                    <code>${escapeHtml(baker.address)}</code>
                </div>
                <button type="button" class="baker-directory-detail-close" data-bdc-clear-baker aria-label="Close selected baker details">&times;</button>
            </div>
            <div class="baker-directory-detail-signals">${directoryBadgeRailHtml(baker)}</div>
            <dl class="baker-directory-detail-facts">
                <div><dt>Staking balance</dt><dd>${formatMutez(baker.stakingBalance)}</dd></div>
                <div><dt>Delegators</dt><dd>${Number(baker.delegators || 0).toLocaleString('en-US')}</dd></div>
                <div><dt>External stakers</dt><dd>${Number(baker.stakers || 0).toLocaleString('en-US')}</dd></div>
                <div><dt>Delegation use</dt><dd>${Number(baker.delegationUsage || 0).toFixed(0)}%</dd></div>
                <div><dt>Delegation room</dt><dd>${compactXtz(capacity)} XTZ</dd></div>
                <div><dt>Staking room</dt><dd>${compactXtz(baker.freeStakingCapacity)} XTZ</dd></div>
                <div><dt>First activity</dt><dd>${escapeHtml(firstActivity)}</dd></div>
            </dl>
            <p class="baker-directory-detail-note">These are current on-chain facts and historical receipts. They do not establish payout policy, fee terms, uptime, or future performance.</p>
            <div class="baker-directory-detail-actions">
                ${bakerActionButtonsHtml(baker)}
                <button type="button" class="baker-directory-primary-action" data-bdc-open-profile="${escapeHtml(baker.address)}">Open full baker profile</button>
                <a href="https://tzkt.io/${encodeURIComponent(baker.address)}" target="_blank" rel="noopener noreferrer">Inspect on TzKT</a>
            </div>
        </aside>
    `;
}

function directoryKpiHtml(label, value, detail) {
    return `
        <div class="baker-directory-kpi">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value)}</strong>
            <small>${escapeHtml(detail)}</small>
        </div>
    `;
}

function bakerDirectoryDiscoverHtml() {
    const summary = bakerDirectorySummary();
    const pool = directoryBakers({ ignoreSignal: true });
    const matches = factualBakerFits(pool, fitPrefs, 6);
    const selected = selectedDirectoryBaker();
    const requestedNotFound = bakerDirectoryState.requestedBaker && !selected;

    return `
        <section class="baker-directory-view baker-directory-discover" aria-labelledby="baker-directory-discover-title">
            <div class="baker-directory-kpis" aria-label="Baker directory overview">
                ${directoryKpiHtml('Funded active bakers', summary.active.toLocaleString('en-US'), 'Positive current baking power')}
                ${directoryKpiHtml('Current staking balance', `${compactXtz(summary.totalStake)} XTZ`, 'Sum across this funded set')}
                ${directoryKpiHtml('Open delegation room', summary.open.toLocaleString('en-US'), 'At least 50K XTZ room and under 80% used')}
                ${directoryKpiHtml('tz4 consensus keys', summary.tz4.toLocaleString('en-US'), 'Current BLS consensus addresses')}
            </div>
            ${requestedNotFound ? `<div class="baker-directory-inline-state" role="status">No funded active baker matched “${escapeHtml(bakerDirectoryState.requestedBaker)}”. Search remains available below.</div>` : ''}
            ${directoryBakerDetailHtml(selected)}
            <div class="baker-directory-discover-layout">
                <section class="baker-directory-fit" aria-labelledby="baker-directory-discover-title">
                    <div class="baker-directory-section-heading">
                        <div>
                            <span class="feature-kicker">Delegator fit</span>
                            <h2 id="baker-directory-discover-title">Narrow the on-chain facts</h2>
                        </div>
                        <a href="/stake/?view=guide">Read the staking guide</a>
                    </div>
                    <p class="baker-directory-method">The room and evidence choices are strict filters. Community orders by current delegators + stakers; Capacity orders by current free delegation room; ties use the other fact, then baker name. No blended score or inferred quality grade is calculated.</p>
                    <div class="baker-directory-fit-questions">
                        ${FIT_QUESTIONS.map((question) => `
                            <fieldset class="baker-directory-fit-question">
                                <legend>${escapeHtml(question.label)}</legend>
                                <div>
                                    ${question.options.map((option) => `
                                        <button type="button" class="baker-fit-option ${fitPrefs[question.key] === option.value ? 'active' : ''}" data-fit-key="${escapeHtml(question.key)}" data-fit-value="${escapeHtml(option.value)}" aria-pressed="${fitPrefs[question.key] === option.value ? 'true' : 'false'}" title="${escapeHtml(option.detail)}">${escapeHtml(option.label)}</button>
                                    `).join('')}
                                </div>
                            </fieldset>
                        `).join('')}
                    </div>
                    <div class="baker-directory-match-grid" aria-live="polite">
                        ${matches.length ? matches.map((item, index) => `
                            <article class="baker-directory-match ${item.hasRoom ? '' : 'tight'}" data-address="${escapeHtml(item.baker.address)}">
                                <span class="baker-directory-match-order">Order ${index + 1}</span>
                                <h3>${escapeHtml(item.baker.name)}</h3>
                                <p>${escapeHtml(item.reasons.join(' · '))}</p>
                                ${directoryBadgeRailHtml(item.baker)}
                                <button type="button" data-bdc-select="${escapeHtml(item.baker.address)}">Review on-chain facts</button>
                            </article>
                        `).join('') : '<div class="baker-directory-empty">No active baker matches the current search and capacity choices.</div>'}
                    </div>
                </section>
                <aside class="baker-directory-reading-guide">
                    <span class="feature-kicker">Before choosing</span>
                    <h2>What the chain cannot tell you</h2>
                    <ul>
                        <li><strong>Fees and payout timing</strong><span>Verify them with the baker; they are off-chain policies.</span></li>
                        <li><strong>Service quality</strong><span>No composite score or inferred reliability is presented here.</span></li>
                        <li><strong>Future capacity</strong><span>Room is a current protocol calculation and can change.</span></li>
                    </ul>
                    <button type="button" data-bdc-view="directory">Inspect every active baker</button>
                </aside>
            </div>
        </section>
    `;
}

function bakerDirectorySortHeader(col, label) {
    const active = bakerDirectoryState.sort === col;
    const direction = active ? (bakerDirectoryState.dir === 'asc' ? 'ascending' : 'descending') : 'none';
    const arrow = active ? (bakerDirectoryState.dir === 'asc' ? '▴' : '▾') : '';
    return `
        <th scope="col" aria-sort="${direction}">
            <button type="button" data-bdc-sort="${col}" aria-label="Sort by ${escapeHtml(label)}${active ? `, currently ${direction}` : ''}">
                ${escapeHtml(label)} <span aria-hidden="true">${arrow}</span>
            </button>
        </th>
    `;
}

function bakerDirectoryDirectoryHtml() {
    const rows = directoryBakers();
    const selected = selectedDirectoryBaker();
    return `
        <section class="baker-directory-view baker-directory-list-view" aria-labelledby="baker-directory-list-title">
            <div class="baker-directory-section-heading">
                <div>
                    <span class="feature-kicker">Complete funded set</span>
                    <h2 id="baker-directory-list-title">Active baker directory</h2>
                    <p>${rows.length.toLocaleString('en-US')} of ${bakersData.length.toLocaleString('en-US')} funded active bakers shown</p>
                </div>
                <div class="baker-directory-filter-rail" aria-label="Directory filters">
                    <button type="button" class="${bakerDirectoryState.openOnly ? 'active' : ''}" data-bdc-open-only aria-pressed="${bakerDirectoryState.openOnly ? 'true' : 'false'}"><span class="lb-open-capacity-dot" aria-hidden="true"></span> Open ovens</button>
                    <button type="button" data-bdc-view="signals">Explain signals</button>
                </div>
            </div>
            ${directoryBakerDetailHtml(selected)}
            <div class="baker-directory-table-wrap">
                <table class="baker-directory-table">
                    <caption>Funded active Tezos bakers. Sorting reflects the chosen factual column and is not a performance ranking.</caption>
                    <thead><tr>
                        ${bakerDirectorySortHeader('name', 'Baker')}
                        ${bakerDirectorySortHeader('stake', 'Staking balance')}
                        ${bakerDirectorySortHeader('delegators', 'Delegators')}
                        ${bakerDirectorySortHeader('stakers', 'Stakers')}
                        ${bakerDirectorySortHeader('capacity', 'Capacity used')}
                        ${bakerDirectorySortHeader('tz4', 'tz4')}
                        <th scope="col">Signals</th>
                        <th scope="col">Wallet actions</th>
                    </tr></thead>
                    <tbody>
                        ${rows.map((baker) => `
                            <tr data-address="${escapeHtml(baker.address)}" class="${normalizedAddress(baker.address) === normalizedAddress(bakerDirectoryState.selectedAddress) ? 'selected' : ''}">
                                <td><button type="button" class="baker-directory-name-button" data-bdc-select="${escapeHtml(baker.address)}"><strong>${escapeHtml(baker.name)}</strong><code>${escapeHtml(baker.address.slice(0, 10))}…</code></button></td>
                                <td class="numeric">${formatMutez(baker.stakingBalance)}</td>
                                <td class="numeric">${Number(baker.delegators || 0).toLocaleString('en-US')}</td>
                                <td class="numeric">${Number(baker.stakers || 0).toLocaleString('en-US')}</td>
                                <td class="numeric ${Number(baker.delegationUsage || 0) >= 90 ? 'cap-critical' : Number(baker.delegationUsage || 0) >= 70 ? 'cap-warning' : ''}">${baker.openDelegationRoom ? '<span class="lb-open-capacity-dot" aria-label="Open delegation room"></span>' : ''}${Number(baker.delegationUsage || 0).toFixed(0)}%</td>
                                <td class="center">${baker.tz4 ? 'Yes' : '—'}</td>
                                <td>${directoryBadgeRailHtml(baker)}</td>
                                <td>${bakerActionButtonsHtml(baker, { compact: true })}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                ${rows.length ? '' : '<div class="baker-directory-empty">No funded active bakers match the current search and filters.</div>'}
            </div>
        </section>
    `;
}

function bakerDirectorySignalDefinitions() {
    const counts = {
        og: bakersData.filter((baker) => directorySignalTone(baker).has('og')).length,
        veteran: bakersData.filter((baker) => directorySignalTone(baker).has('veteran')).length,
        accepted: bakersData.filter((baker) => directorySignalTone(baker).has('accepted')).length,
        voting: bakersData.filter((baker) => directorySignalTone(baker).has('voting')).length,
        rising: bakersData.filter((baker) => directorySignalTone(baker).has('rising')).length,
        tz4: bakersData.filter((baker) => baker.tz4).length
    };
    return [
        { id: 'og', label: '✦ OG', count: counts.og, detail: 'First TzKT activity recorded in the 2018 launch era.' },
        { id: 'veteran', label: 'Veteran', count: counts.veteran, detail: `First TzKT activity recorded by December 31, ${VETERAN_LAST_YEAR}; OG bakers are kept separate.` },
        { id: 'accepted', label: '🏛 Accepted', count: counts.accepted, detail: 'Initiated at least one distinct protocol proposal whose final TzKT status is accepted.' },
        { id: 'voting', label: '🗳 Active streak', count: counts.voting, detail: 'Has an applied ballot in each consecutive completed Exploration or Promotion period through the latest completed ballot period.' },
        { id: 'rising', label: '↗ Rising', count: counts.rising, detail: 'Staking balance increased between the two observations made in this browsing session.' },
        { id: 'tz4', label: 'tz4 / BLS', count: counts.tz4, detail: 'The baker’s current consensus key is a tz4 BLS address.' }
    ];
}

function bakerDirectorySignalsHtml() {
    const definitions = bakerDirectorySignalDefinitions();
    let rows = bakersData.filter((baker) => bakerMatchesDirectorySearch(baker, bakerDirectoryState.search));
    if (bakerDirectoryState.signal === 'all') {
        rows = rows.filter((baker) => (baker.earnedBadges || []).length || baker.tz4);
    } else {
        rows = rows.filter((baker) => directorySignalTone(baker).has(bakerDirectoryState.signal));
    }
    rows = sortBakers(rows, 'name', 'asc');
    const selected = selectedDirectoryBaker();

    return `
        <section class="baker-directory-view baker-directory-signals-view" aria-labelledby="baker-directory-signals-title">
            <div class="baker-directory-section-heading">
                <div>
                    <span class="feature-kicker">Provenance before praise</span>
                    <h2 id="baker-directory-signals-title">Factual baker signals</h2>
                    <p>Each marker has one inspectable rule. None is an uptime, payout, reliability, or overall performance score.</p>
                </div>
            </div>
            <div class="baker-directory-signal-grid" aria-label="Choose a factual signal">
                <button type="button" class="baker-directory-signal-card ${bakerDirectoryState.signal === 'all' ? 'active' : ''}" data-bdc-signal="all" aria-pressed="${bakerDirectoryState.signal === 'all' ? 'true' : 'false'}">
                    <span>All listed signals</span><strong>${bakersData.filter((baker) => (baker.earnedBadges || []).length || baker.tz4).length.toLocaleString('en-US')}</strong><small>Browse every baker with at least one marker below.</small>
                </button>
                ${definitions.map((signal) => `
                    <button type="button" class="baker-directory-signal-card ${bakerDirectoryState.signal === signal.id ? 'active' : ''}" data-bdc-signal="${signal.id}" aria-pressed="${bakerDirectoryState.signal === signal.id ? 'true' : 'false'}">
                        <span>${escapeHtml(signal.label)}</span><strong>${signal.count.toLocaleString('en-US')}</strong><small>${escapeHtml(signal.detail)}</small>
                    </button>
                `).join('')}
            </div>
            ${directoryBakerDetailHtml(selected)}
            <section class="baker-directory-signal-roster" aria-labelledby="baker-directory-signal-roster-title">
                <div class="baker-directory-section-heading compact">
                    <div><h3 id="baker-directory-signal-roster-title">${bakerDirectoryState.signal === 'all' ? 'Bakers with listed signals' : `${definitions.find(({ id }) => id === bakerDirectoryState.signal)?.label || 'Signal'} bakers`}</h3><p>${rows.length.toLocaleString('en-US')} matching funded active baker${rows.length === 1 ? '' : 's'}, alphabetically</p></div>
                </div>
                <div class="baker-directory-signal-roster-grid">
                    ${rows.map((baker) => `
                        <article data-address="${escapeHtml(baker.address)}">
                            <button type="button" data-bdc-select="${escapeHtml(baker.address)}"><strong>${escapeHtml(baker.name)}</strong><code>${escapeHtml(baker.address.slice(0, 12))}…</code></button>
                            ${directoryBadgeRailHtml(baker)}
                        </article>
                    `).join('') || '<div class="baker-directory-empty">No funded active baker matches this signal and search.</div>'}
                </div>
            </section>
            <div class="baker-directory-provenance">
                <div><strong>Baker set</strong><span>TzKT active delegates with positive current baking power; fetched through complete pagination.</span></div>
                <div><strong>Tenure and tz4</strong><span>TzKT first-activity timestamps and current consensus addresses.</span></div>
                <div><strong>Governance</strong><span>Generated complete governance career receipts and accepted-proposal history maintained by Tezos Systems.</span></div>
                <div><strong>Capacity</strong><span>Current on-chain balances calculated with the live protocol delegation-over-baking limit when available.</span></div>
            </div>
        </section>
    `;
}

function bakerDirectoryViewHtml() {
    if (bakerDirectoryState.view === 'directory') return bakerDirectoryDirectoryHtml();
    if (bakerDirectoryState.view === 'signals') return bakerDirectorySignalsHtml();
    return bakerDirectoryDiscoverHtml();
}

function bakerDirectoryShellHtml() {
    const summary = bakerDirectorySummary();
    const lastGoodWarning = bakerDirectoryLastError && bakersData.length
        ? `<div class="baker-directory-refresh-warning" role="status"><strong>Live refresh delayed.</strong> The last-good baker set remains in place. ${escapeHtml(bakerDirectoryLastError)}</div>`
        : '';
    return `
        <div class="baker-directory-shell" data-quiet-key="baker-directory-shell">
            <header class="baker-directory-header">
                <div class="baker-directory-title-block">
                    <span class="feature-kicker">Tezos Systems / Bakers</span>
                    <h1 id="baker-directory-title">Baker Directory</h1>
                    <p>Explore the complete funded active-baker set through current capacity and source-backed history—not a hidden quality score.</p>
                </div>
                <div class="baker-directory-receipt" aria-live="polite">
                    <span class="baker-directory-live-dot ${leaderboardDataQuality.status === 'live' ? 'live' : ''}" aria-hidden="true"></span>
                    <strong>${summary.active.toLocaleString('en-US')} active</strong>
                    <small>${escapeHtml(formattedObservedAt())}</small>
                </div>
                <div class="baker-directory-tabs" role="tablist" aria-label="Baker Directory views">
                    ${BAKER_DIRECTORY_VIEWS.map((view) => `
                        <button type="button" role="tab" id="baker-directory-tab-${view.id}" data-bdc-view="${view.id}" aria-controls="baker-directory-panel" aria-selected="${bakerDirectoryState.view === view.id ? 'true' : 'false'}" tabindex="${bakerDirectoryState.view === view.id ? '0' : '-1'}">${escapeHtml(view.label)}</button>
                    `).join('')}
                </div>
                <label class="baker-directory-search" for="baker-directory-search-input">
                    <span>Search baker name or address</span>
                    <span class="baker-directory-search-control">
                        <input type="search" id="baker-directory-search-input" value="${escapeHtml(bakerDirectoryState.search)}" placeholder="Name, tz1, tz2, tz3, or tz4" autocomplete="off" spellcheck="false">
                        ${bakerDirectoryState.search ? '<button type="button" data-bdc-clear-search aria-label="Clear baker search">Clear</button>' : ''}
                    </span>
                </label>
            </header>
            ${lastGoodWarning}
            ${renderChamberVerdict({ key: 'leaderboard', state: bakerDirectoryLastError || leaderboardDataQuality.status === 'stale' ? 'watch' : 'observed', sentence: `${summary.active.toLocaleString('en-US')} funded active bakers are in this receipt; discover them by disclosed filters, not an overall quality score.`, receipts: [['Open delegation room', summary.open], ['tz4 consensus keys', summary.tz4]], timestamp: leaderboardDataQuality.observedAt, clockLabel: 'Read' })}
            <div id="baker-directory-panel" class="baker-directory-panel" role="tabpanel" aria-labelledby="baker-directory-tab-${bakerDirectoryState.view}" tabindex="0">
                ${bakerDirectoryViewHtml()}
            </div>
            <footer class="baker-directory-footer">
                <span>${escapeHtml(bakerDirectorySourceText())}</span>
                <span><a href="https://api.tzkt.io/" target="_blank" rel="noopener noreferrer">TzKT source</a> · <a href="/data/baker-governance-signals.json">Directory signal receipt</a> · <a href="/data/maxis-careers.json">Governance careers</a> · <a href="/data/governance-votes.json">Proposal receipts</a></span>
            </footer>
        </div>
    `;
}

function renderBakerDirectoryLoading(body) {
    body.innerHTML = `
        <div class="baker-directory-loading" role="status" aria-live="polite">
            <span class="feature-kicker">Baker Directory</span>
            <strong>Reading the funded active-baker set</strong>
            <small>Paging TzKT delegates and joining governance receipts</small>
            <div aria-hidden="true"><i></i></div>
        </div>
    `;
    body.dataset.bakerDirectoryRendered = '0';
}

function renderBakerDirectoryError(body, error) {
    body.innerHTML = `
        <div class="baker-directory-load-error" role="alert">
            <span aria-hidden="true">!</span>
            <h2>Couldn’t reach the baker directory</h2>
            <p>${escapeHtml(error?.message || 'TzKT baker data is temporarily unavailable.')}</p>
            <button type="button" data-bdc-retry>Retry</button>
        </div>
    `;
    body.dataset.bakerDirectoryRendered = '0';
}

function renderBakerDirectoryChamber({ quiet = false } = {}) {
    const body = document.getElementById('baker-directory-body');
    if (!body) return;
    resolveRequestedDirectoryBaker();
    const html = bakerDirectoryShellHtml();
    if (quiet && body.dataset.bakerDirectoryRendered === '1') {
        const activeInput = body.contains(document.activeElement) && document.activeElement instanceof HTMLInputElement
            ? document.activeElement
            : null;
        const inputSelection = activeInput && Number.isFinite(activeInput.selectionStart)
            ? { start: activeInput.selectionStart, end: activeInput.selectionEnd, direction: activeInput.selectionDirection }
            : null;
        quietlySyncHtml(body, html);
        if (activeInput?.isConnected && inputSelection) {
            try {
                activeInput.setSelectionRange(inputSelection.start, inputSelection.end, inputSelection.direction || 'none');
            } catch { /* non-text input type */ }
        }
    } else body.innerHTML = html;
    body.dataset.bakerDirectoryRendered = '1';
}

function setBakerDirectoryView(view, { focusTab = false } = {}) {
    if (!BAKER_DIRECTORY_VIEW_IDS.has(view)) return;
    bakerDirectoryState.view = view;
    updateBakerDirectoryRouteState();
    renderBakerDirectoryChamber({ quiet: true });
    if (focusTab) {
        document.getElementById(`baker-directory-tab-${view}`)?.focus({ preventScroll: true });
    }
}

function bindBakerDirectoryBody(body) {
    if (!body || body.dataset.bakerDirectoryEventsWired === '1') return;
    body.dataset.bakerDirectoryEventsWired = '1';

    body.addEventListener('click', (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;

        const bakerAction = target.closest('[data-baker-action][data-baker-address]');
        if (bakerAction) {
            openBakerActionDialog(bakerAction.dataset.bakerAction, bakerAction.dataset.bakerAddress);
            return;
        }

        const viewButton = target.closest('[data-bdc-view]');
        if (viewButton) {
            setBakerDirectoryView(viewButton.dataset.bdcView);
            return;
        }

        const fitButton = target.closest('[data-fit-key][data-fit-value]');
        if (fitButton) {
            const key = fitButton.dataset.fitKey;
            const value = fitButton.dataset.fitValue;
            const question = FIT_QUESTIONS.find((item) => item.key === key);
            if (!question?.options.some((option) => option.value === value)) return;
            fitPrefs = { ...fitPrefs, [key]: value };
            saveFitPrefs(fitPrefs);
            renderBakerDirectoryChamber({ quiet: true });
            return;
        }

        const selected = target.closest('[data-bdc-select]');
        if (selected) {
            bakerDirectoryState.selectedAddress = cleanDirectoryQuery(selected.dataset.bdcSelect, 128);
            bakerDirectoryState.requestedBaker = '';
            updateBakerDirectoryRouteState();
            renderBakerDirectoryChamber({ quiet: true });
            return;
        }

        const profile = target.closest('[data-bdc-open-profile]');
        if (profile) {
            const address = profile.dataset.bdcOpenProfile;
            closeBakerDirectoryChamber();
            requestAnimationFrame(() => openBakerInDrawer(address));
            return;
        }

        const sortButton = target.closest('[data-bdc-sort]');
        if (sortButton) {
            const col = sortButton.dataset.bdcSort;
            if (!['name', 'stake', 'delegators', 'stakers', 'capacity', 'tz4'].includes(col)) return;
            if (bakerDirectoryState.sort === col) {
                bakerDirectoryState.dir = bakerDirectoryState.dir === 'desc' ? 'asc' : 'desc';
            } else {
                bakerDirectoryState.sort = col;
                bakerDirectoryState.dir = col === 'name' ? 'asc' : 'desc';
            }
            renderBakerDirectoryChamber({ quiet: true });
            return;
        }

        const signalButton = target.closest('[data-bdc-signal]');
        if (signalButton) {
            const signal = signalButton.dataset.bdcSignal;
            if (!BAKER_DIRECTORY_SIGNAL_IDS.has(signal)) return;
            bakerDirectoryState.signal = signal;
            renderBakerDirectoryChamber({ quiet: true });
            return;
        }

        if (target.closest('[data-bdc-open-only]')) {
            bakerDirectoryState.openOnly = !bakerDirectoryState.openOnly;
            renderBakerDirectoryChamber({ quiet: true });
            return;
        }

        if (target.closest('[data-bdc-clear-search]')) {
            bakerDirectoryState.search = '';
            const searchInput = document.getElementById('baker-directory-search-input');
            if (searchInput) searchInput.value = '';
            updateBakerDirectoryRouteState();
            renderBakerDirectoryChamber({ quiet: true });
            document.getElementById('baker-directory-search-input')?.focus({ preventScroll: true });
            return;
        }

        if (target.closest('[data-bdc-clear-baker]')) {
            bakerDirectoryState.selectedAddress = '';
            bakerDirectoryState.requestedBaker = '';
            updateBakerDirectoryRouteState();
            renderBakerDirectoryChamber({ quiet: true });
            return;
        }

        if (target.closest('[data-bdc-retry]')) refreshBakerDirectoryChamber({ quiet: false });
    });

    body.addEventListener('input', (event) => {
        if (event.isComposing || event.target?.id !== 'baker-directory-search-input') return;
        bakerDirectoryState.search = cleanDirectoryQuery(event.target.value);
        updateBakerDirectoryRouteState();
        renderBakerDirectoryChamber({ quiet: true });
    });

    body.addEventListener('keydown', (event) => {
        const tab = event.target.closest?.('[role="tab"][data-bdc-view]');
        if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const index = BAKER_DIRECTORY_VIEWS.findIndex(({ id }) => id === tab.dataset.bdcView);
        let next = index;
        if (event.key === 'ArrowLeft') next = (index - 1 + BAKER_DIRECTORY_VIEWS.length) % BAKER_DIRECTORY_VIEWS.length;
        if (event.key === 'ArrowRight') next = (index + 1) % BAKER_DIRECTORY_VIEWS.length;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = BAKER_DIRECTORY_VIEWS.length - 1;
        setBakerDirectoryView(BAKER_DIRECTORY_VIEWS[next].id, { focusTab: true });
    });
}

function ensureBakerDirectoryOverlay() {
    let overlay = document.getElementById('baker-directory-modal');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'baker-directory-modal';
    overlay.className = 'modal-overlay chamber-overlay lb-overlay baker-directory-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
        <div class="modal-content modal-large chamber-content lb-content baker-directory-content" role="dialog" aria-modal="true" aria-labelledby="baker-directory-title" tabindex="-1">
            <button class="modal-close chamber-close" type="button" aria-label="Close Baker Directory Chamber">&times;</button>
            <div class="chamber-body lb-body baker-directory-body" id="baker-directory-body"></div>
        </div>
    `;
    overlay.querySelector('.chamber-close')?.addEventListener('click', closeBakerDirectoryChamber);
    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) closeBakerDirectoryChamber();
    });
    bindBakerDirectoryBody(overlay.querySelector('.baker-directory-body'));
    document.body.appendChild(overlay);
    return overlay;
}

function lockBakerDirectoryPage() {
    if (bakerDirectorySavedBodyOverflow !== null) return;
    bakerDirectorySavedBodyOverflow = document.body.style.overflow;
    bakerDirectorySavedHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
}

function unlockBakerDirectoryPage() {
    if (bakerDirectorySavedBodyOverflow === null) return;
    document.body.style.overflow = bakerDirectorySavedBodyOverflow;
    document.documentElement.style.overflow = bakerDirectorySavedHtmlOverflow || '';
    bakerDirectorySavedBodyOverflow = null;
    bakerDirectorySavedHtmlOverflow = null;
}

function bakerDirectoryRefreshInterval() {
    const override = Number(window.__BAKER_DIRECTORY_REFRESH_MS__);
    return Number.isFinite(override) && override >= 1000 ? override : BAKER_DIRECTORY_REFRESH_MS;
}

function stopBakerDirectoryRefreshTimer() {
    if (bakerDirectoryTimer) window.clearInterval(bakerDirectoryTimer);
    bakerDirectoryTimer = null;
}

function startBakerDirectoryRefreshTimer() {
    stopBakerDirectoryRefreshTimer();
    bakerDirectoryTimer = window.setInterval(() => {
        if (document.visibilityState !== 'visible') {
            bakerDirectoryRefreshDeferred = true;
            return;
        }
        refreshBakerDirectoryChamber({ quiet: true });
    }, bakerDirectoryRefreshInterval());
}

function bindBakerDirectoryVisibility() {
    if (bakerDirectoryVisibilityWired) return;
    bakerDirectoryVisibilityWired = true;
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible' || !bakerDirectoryRefreshDeferred) return;
        bakerDirectoryRefreshDeferred = false;
        const overlayOpen = document.getElementById('baker-directory-modal')?.classList.contains('active');
        refreshBakerDirectoryChamber({ quiet: true, includeGovernance: overlayOpen });
    });
}

function updateBakerDirectoryEntryCard({ quiet = false } = {}) {
    const front = document.getElementById('baker-directory-entry-front');
    if (!front || !bakersData.length) return;
    const summary = bakerDirectorySummary();
    const footerMarkup = front.querySelector(':scope > .chamber-entry-footer')?.outerHTML || '';
    const html = `
        <div class="baker-directory-entry-heading">
            <div><span class="feature-kicker">Baker discovery</span><h2 class="stat-label" id="baker-directory-entry-title">Baker Directory</h2></div>
            <span class="baker-directory-entry-status"><i aria-hidden="true"></i>${escapeHtml(leaderboardDataQuality.status === 'live' ? 'Live' : 'Last good')}</span>
        </div>
        <div class="stat-value baker-directory-entry-value">${summary.active.toLocaleString('en-US')} active bakers</div>
        <div class="stat-description">Complete funded set · factual signals · capacity explorer</div>
        <div class="baker-directory-entry-metrics">
            <span><strong>${summary.open.toLocaleString('en-US')}</strong> open ovens</span>
            <span><strong>${summary.tz4.toLocaleString('en-US')}</strong> tz4</span>
            <span><strong>${summary.tenure.toLocaleString('en-US')}</strong> long-running</span>
        </div>
        <div class="baker-directory-entry-rails" aria-hidden="true"><span>Discover</span><span>Directory</span><span>Signals</span></div>
        ${footerMarkup}
    `;
    if (quiet || front.childNodes.length) quietlySyncHtml(front, html);
    else front.innerHTML = html;
    front.dataset.bakerDirectoryEntryRendered = '1';
    const card = front.closest('.baker-directory-entry-card');
    if (card) {
        card.dataset.updatedLabel = bakerDirectoryEntryFreshnessLabel();
        card.classList.toggle('chamber-data-stale', leaderboardDataQuality.status === 'stale');
    }
    window.syncChamberEntryFooters?.(card);
    wireBakerDirectoryEntryCard(card);
}

export function ensureBakerDirectoryEntryCard() {
    const existing = document.getElementById('baker-directory-entry-card');
    if (existing) return existing;
    const grid = document.getElementById('chambers-grid');
    if (!grid) return null;
    const card = document.createElement('article');
    card.id = 'baker-directory-entry-card';
    card.className = 'stat-card chamber-entry-card chamber-entry-wide chamber-entry-live baker-directory-entry-card';
    card.dataset.chamberEntrySize = 'wide';
    card.dataset.updatedLabel = 'TzKT · refreshing';
    card.innerHTML = `
        <button class="card-copy-link" type="button" data-copy-hash="#leaderboard" aria-label="Copy Baker Directory direct link" title="Copy Baker Directory link">&#128279;</button>
        <div class="card-inner"><div class="card-front chamber-entry-front baker-directory-entry-front" id="baker-directory-entry-front">
            <div class="baker-directory-entry-heading"><div><span class="feature-kicker">Baker discovery</span><h2 class="stat-label" id="baker-directory-entry-title">Baker Directory</h2></div></div>
            <div class="stat-value baker-directory-entry-value">Reading active bakers</div>
            <div class="stat-description">Complete funded set · factual signals · capacity explorer</div>
        </div></div>
    `;
    grid.appendChild(card);
    return card;
}

export function wireBakerDirectoryEntryCard(card = document.getElementById('baker-directory-entry-card')) {
    if (!card) return null;
    return wireChamberLauncher(card, {
        open: openBakerDirectoryChamber,
        label: 'Open Baker Directory Chamber',
        titleSelector: '#baker-directory-entry-title, .stat-label'
    });
}

export async function refreshBakerDirectoryChamber({ quiet = true, includeGovernance = true } = {}) {
    if (document.visibilityState !== 'visible') {
        bakerDirectoryRefreshDeferred = true;
        return bakersData;
    }
    if (bakerDirectoryRefreshInFlight) {
        const pendingRefresh = bakerDirectoryRefreshInFlight;
        if (!includeGovernance || bakerDirectoryRefreshIncludesGovernance) return pendingRefresh;
        await pendingRefresh;
        return refreshBakerDirectoryChamber({ quiet, includeGovernance: true });
    }

    bakerDirectoryRefreshIncludesGovernance = includeGovernance;
    const requests = [
        fetchBakers(),
        fetchDelegationLimit()
    ];
    if (includeGovernance) requests.push(fetchGovernanceSignals());

    bakerDirectoryRefreshInFlight = Promise.all(requests).then(([raw, limit]) => {
        const enriched = raw.map((baker) => enrichBaker(baker, limit));
        bakersData = enriched;
        reconcileGovernanceSignalCoverage(enriched);
        rememberStakeSnapshot(raw);
        bakerDirectoryLastError = '';
        bakerDirectoryRefreshDeferred = false;
        resolveRequestedDirectoryBaker();
        updateBakerDirectoryEntryCard({ quiet });
        if (document.getElementById('baker-directory-modal')?.classList.contains('active')) {
            renderBakerDirectoryChamber({ quiet });
        }
        return bakersData;
    }).catch((error) => {
        console.warn('Baker Directory Chamber refresh failed:', error);
        bakerDirectoryLastError = error?.message || String(error);
        const overlayOpen = document.getElementById('baker-directory-modal')?.classList.contains('active');
        const body = document.getElementById('baker-directory-body');
        if (bakersData.length) {
            updateBakerDirectoryEntryCard({ quiet: true });
            if (overlayOpen) renderBakerDirectoryChamber({ quiet: true });
            return bakersData;
        }
        const card = document.getElementById('baker-directory-entry-card');
        if (card) {
            card.dataset.updatedLabel = 'TzKT freshness unavailable';
            card.classList.add('chamber-data-stale');
            window.syncChamberEntryFooters?.(card);
        }
        if (overlayOpen && body) renderBakerDirectoryError(body, error);
        return [];
    }).finally(() => {
        bakerDirectoryRefreshInFlight = null;
        bakerDirectoryRefreshIncludesGovernance = false;
    });

    return bakerDirectoryRefreshInFlight;
}

export async function openBakerDirectoryChamber(options = {}) {
    const isCurrent = options.isCurrent || (() => true);
    if (!isCurrent()) return;
    await ensureLeaderboardStyles();
    if (!isCurrent()) return;
    bindBakerDirectoryVisibility();
    applyBakerDirectoryRouteState();
    if (BAKER_DIRECTORY_VIEW_IDS.has(options?.view)) bakerDirectoryState.view = options.view;
    if (options?.search !== undefined) bakerDirectoryState.search = cleanDirectoryQuery(options.search);
    if (options?.baker) {
        bakerDirectoryState.requestedBaker = cleanDirectoryQuery(options.baker, 128);
        bakerDirectoryState.selectedAddress = '';
    }

    const overlay = ensureBakerDirectoryOverlay();
    const body = overlay.querySelector('.baker-directory-body');
    if (!overlay.classList.contains('active')) {
        bakerDirectoryFocusedBeforeOpen = document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
    }
    overlay.classList.add('active');
    lockBakerDirectoryPage();
    if (bakersData.length) renderBakerDirectoryChamber({ quiet: false });
    else renderBakerDirectoryLoading(body);
    activateChamberDialog(overlay, {
        close: closeBakerDirectoryChamber,
        dialogSelector: '.baker-directory-content',
        titleId: 'baker-directory-title',
        label: 'Baker Directory Chamber',
        initialFocusSelector: '.chamber-close'
    });

    const hadRenderedData = bakersData.length > 0;
    await refreshBakerDirectoryChamber({ quiet: hadRenderedData });
    if (!isCurrent() || !overlay.classList.contains('active')) return;
    if (overlay.classList.contains('active')) startBakerDirectoryRefreshTimer();
}

export function closeBakerDirectoryChamber({ preserveRoute = false } = {}) {
    const overlay = document.getElementById('baker-directory-modal');
    if (!requestChamberClose(overlay)) return;
    if (bakerActionState) closeBakerActionDialog();
    stopBakerDirectoryRefreshTimer();
    overlay?.classList.remove('active');
    deactivateChamberDialog(overlay, { restoreFocus: !preserveRoute });
    unlockBakerDirectoryPage();
    const remembered = bakerDirectoryFocusedBeforeOpen;
    const isVisibleFocusTarget = (element) => Boolean(
        element?.isConnected
        && element !== document.body
        && element.getClientRects().length
        && getComputedStyle(element).visibility !== 'hidden'
    );
    const focusTarget = [
        remembered,
        findChamberLauncher('#baker-directory-entry-card'),
        document.getElementById('features-gear'),
        document.getElementById('leaderboard-toggle')
    ].find(isVisibleFocusTarget) || null;
    bakerDirectoryFocusedBeforeOpen = null;
    if (!preserveRoute) leaveBakerDirectoryRoute();
    if (!preserveRoute && focusTarget) {
        requestAnimationFrame(() => requestAnimationFrame(() => {
            if (isVisibleFocusTarget(focusTarget)) focusTarget.focus({ preventScroll: true });
        }));
    }
}

export function initBakerDirectoryChamber() {
    ensureLeaderboardStyles().catch((error) => console.warn('Baker Directory styles unavailable', error));
    bindBakerDirectoryVisibility();
    const card = ensureBakerDirectoryEntryCard();
    wireBakerDirectoryEntryCard(card);
    if (bakersData.length) updateBakerDirectoryEntryCard({ quiet: false });
    else if (document.visibilityState === 'visible') {
        refreshBakerDirectoryChamber({ quiet: false, includeGovernance: false });
    }
    else bakerDirectoryRefreshDeferred = true;
}
