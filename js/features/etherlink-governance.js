import { requestChamberClose, bindChamberVisibility } from '../ui/chamber-accessibility.js';
/**
 * Tezos X Governance Chamber
 * Read-only FAST / SLOW / Sequencer governance surface backed by TzKT storage.
 */

import { API_URLS } from '../core/config.js';
import {
    ETHERLINK_GOVERNANCE_CURRENT_CONTRACTS as GOVERNANCE_CURRENT_CONTRACTS,
    ETHERLINK_GOVERNANCE_HISTORY_CODE_HASH_TRACKS as GOVERNANCE_HISTORY_CODE_HASH_TRACKS,
    ETHERLINK_GOVERNANCE_PRODUCTION_CONTRACTS as GOVERNANCE_PRODUCTION_CONTRACTS,
    ETHERLINK_GOVERNANCE_TRACKS as TRACK_TEMPLATES,
    classifyEtherlinkGovernanceTrack
} from '../core/etherlink-governance-contracts.mjs';
import { escapeHtml, formatFreshnessStamp, formatUtcDateTime, setDataFreshnessState } from '../core/utils.js';
import { fetchWithRetry } from '../core/api.js';
import { quietlySyncHtml } from '../core/quiet-refresh.js';
import { activateChamberDialog, deactivateChamberDialog, wireChamberLauncher } from '../ui/chamber-accessibility.js';

const TZKT = API_URLS.tzkt;
const BLOCK_SECONDS = 6;
const ENTRY_REFRESH_MS = 60 * 1000;
const ENTRY_MAX_BACKOFF_MS = 15 * 60 * 1000;
const CHAMBER_REFRESH_MS = 60 * 1000;
const CACHE_TTL = 45 * 1000;
const HISTORY_CACHE_TTL = 15 * 60 * 1000;
const VOTING_POWER_CACHE_TTL = 60 * 1000;
const TZKT_PAGE_LIMIT = 10000;
const ACCOUNT_LOOKUP_BATCH_SIZE = 50;
const RECEIPT_LEVEL_BATCH_SIZE = 80;
const GOVERNANCE_BASE = 'https://governance.etherlink.com/governance';
const GOVERNANCE_DOCS = 'https://docs.etherlink.com/governance/how-is-etherlink-governed/';
const HISTORICAL_PROPOSAL_SCAN_LIMIT = 32;
const HISTORICAL_PROPOSALS_PER_TRACK = 4;

const GOVERNANCE_PHASES = [
    { key: 'proposal', label: 'Proposal', detail: 'Bakers submit and upvote a candidate.' },
    { key: 'promotion', label: 'Promotion', detail: 'Bakers vote Yea, Nay, or Pass.' },
    { key: 'adoption', label: 'Cooldown', detail: 'The approved change waits before activation.' },
    { key: 'trigger', label: 'Trigger', detail: 'Any account can trigger the approved upgrade.' }
];

const KNOWN_PROPOSALS = new Map([
    ['3b1885eec759c22c878e12c84fac33b3b9d153e4|p2pk64mGSmsRAuodTdyNMJdSC6SmtWHF3gXH1WmmpPY8hyTqYFfd4Bg', {
        title: 'Sequencer Upgrade',
        href: 'https://forum.tezosagora.org/t/tezos-bakers-the-second-etherlink-governance-vote-is-here-it-s-time-to-vote-for-the-sequencer-upgrade/6818'
    }],
    ['0008105ea6fb0e4331d7bbc93f0e8843ae91eeb235741054cb2b345ac2d19b9ec9', {
        title: 'Dionysus',
        href: 'https://medium.com/@etherlink/announcing-dionysus-the-next-etherlink-upgrade-proposal-4601c6920709'
    }],
    ['00224058a50dbf4c0b5f6d5e4ee672cd63d0911959b335e587b4112a7eea7b2323', {
        title: 'Calypso',
        href: 'https://medium.com/@etherlink/announcing-calypso-the-next-etherlink-upgrade-proposal-dbe92c576da9'
    }],
    ['00fda6968ec17ed11dee02dc91d15606e6f02c8d7e00d8baeaee24fc0188898261', {
        title: 'Bifrost',
        href: 'https://medium.com/etherlink/announcing-bifr%C3%B6st-a-2nd-upgrade-proposal-for-etherlink-mainnet-ef1a7cf9715f'
    }],
    ['0001010d789e7cccc25c785cf73a658574ed0995ef36b8416a46ab0ddc6b058b39', {
        title: 'Dionysus Revision 1',
        href: 'https://forum.tezosagora.org/t/tezos-bakers-it-s-time-to-vote-for-etherlink-4-1-dionysus-revision-1/6810'
    }],
    ['00fea18ffecd0563f942b8b4c67911302754d7e505b5b5672ff03cb927b79ba830', {
        title: 'Ebisu',
        href: 'https://medium.com/@etherlink/announcing-ebisu-a-5th-upgrade-proposal-for-etherlink-mainnet-4dfdd1c8819e'
    }],
    ['0079e0f348b608ce486c9e5e1fdf84b650019922bf3383b562522c2c8f60a098da', {
        title: 'Farfadet',
        href: 'https://medium.com/@etherlink/announcing-farfadet-a-6th-upgrade-proposal-for-etherlink-mainnet-6bc59793962d'
    }],
    ['0056aea7f98b2bc4d18edb450b2f098f6e95e5356f30a1fac2b50080f3e482bad1', {
        title: 'Etherlink 6.1',
        href: 'https://medium.com/@etherlink/announcing-etherlink-6-1-a-bugfix-proposal-for-fa-token-deposits-2cc08ffd6fad'
    }]
]);

let cachedData = null;
let cachedAt = 0;
let dataInFlight = null;
let historicalProposalCache = null;
let historicalProposalCacheAt = 0;
let historicalProposalInFlight = null;
let votingPowerSnapshotCache = null;
let votingPowerSnapshotCacheAt = 0;
let votingPowerSnapshotInFlight = null;
let activeTrackKey = 'fast';
let selectActiveTrackOnNextRender = true;
let entryTimer = null;
let entryFailureCount = 0;
let entryVisibilityWired = false;
let chamberTimer = null;
let chamberInFlight = false;
let lastRenderedChamberData = null;

function getChamberRefreshMs() {
    const override = Number(window.__ETHERLINK_GOVERNANCE_CHAMBER_REFRESH_MS__);
    return Number.isFinite(override) && override >= 1000 ? override : CHAMBER_REFRESH_MS;
}
let savedBodyOverflow = null;
let savedHtmlOverflow = null;
const targetTrackCache = new Map();

async function fetchJson(url) {
    return fetchWithRetry(url, { cache: 'no-store', memoryCache: false }, 1);
}

async function fetchJsonWithRetry(url, attempts = 2) {
    return fetchWithRetry(url, { cache: 'no-store', memoryCache: false }, attempts);
}

async function fetchAllRows(url) {
    const rows = [];
    const separator = url.includes('?') ? '&' : '?';
    let offset = 0;
    while (true) {
        const page = await fetchJson(`${url}${separator}limit=${TZKT_PAGE_LIMIT}&offset=${offset}`);
        if (!Array.isArray(page) || !page.length) break;
        rows.push(...page);
        if (page.length < TZKT_PAGE_LIMIT) break;
        offset += page.length;
    }
    return rows;
}

function toBigInt(value) {
    if (value === null || value === undefined || value === '') return 0n;
    try {
        return BigInt(value);
    } catch (_) {
        return 0n;
    }
}

function bigPercent(value, total) {
    const numerator = toBigInt(value);
    const denominator = toBigInt(total);
    if (denominator <= 0n) return null;
    return Number((numerator * 10000n) / denominator) / 100;
}

function requiredVotingPower(total, requiredPercent) {
    const votingPower = toBigInt(total);
    const thresholdBps = BigInt(Math.max(0, Math.round(Number(requiredPercent || 0) * 100)));
    if (votingPower <= 0n || thresholdBps <= 0n) return 0n;
    return (votingPower * thresholdBps + 9999n) / 10000n;
}

function formatPercent(value, decimals = 1) {
    if (!Number.isFinite(value)) return '--';
    return `${value.toFixed(decimals)}%`;
}

function formatRequirementShare(value) {
    if (!Number.isFinite(value)) return 'Weight delayed';
    if (value > 0 && value < 0.01) return '<0.01%';
    if (value < 1) return `${value.toFixed(2)}%`;
    if (value < 100) return `${value.toFixed(1)}%`;
    return `${Math.round(value)}%`;
}

function dispatchHotSignal(detail) {
    if (typeof window === 'undefined' || typeof window.CustomEvent !== 'function') return;
    window.dispatchEvent(new CustomEvent('hot-signal', { detail }));
}

function formatXTZ(value) {
    const tez = Number(toBigInt(value)) / 1e6;
    if (!Number.isFinite(tez)) return '--';
    if (tez >= 1_000_000) return `${(tez / 1_000_000).toFixed(1)}M XTZ`;
    if (tez >= 1_000) return `${(tez / 1_000).toFixed(1)}K XTZ`;
    return `${tez.toFixed(0)} XTZ`;
}

function compactHash(hash) {
    if (!hash || typeof hash !== 'string') return 'Unknown proposal';
    if (hash.length <= 18) return hash;
    return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
}

function formatDate(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '--';
    return `${formatUtcDateTime(date)} UTC`;
}

function formatAge(timestamp) {
    if (!timestamp) return '--';
    const time = new Date(timestamp).getTime();
    if (!Number.isFinite(time)) return '--';
    const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000));
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

function formatDurationFromBlocks(blocks) {
    if (!Number.isFinite(blocks)) return '--';
    if (blocks <= 0) return '<1m';
    const minutes = Math.round((blocks * BLOCK_SECONDS) / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours < 24) return mins ? `${hours}h ${mins}m` : `${hours}h`;
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return remHours ? `${days}d ${remHours}h` : `${days}d`;
}

function normalizePeriod(track, storage, headLevel) {
    const config = storage?.config || {};
    const startedAt = Number(config.started_at_level ?? track.startedAt ?? 0);
    const periodLength = Number(config.period_length ?? track.periodLength ?? 1);
    const storageIndex = Number(storage?.voting_context?.period_index);
    const computedIndex = periodLength > 0 ? Math.floor(Math.max(0, headLevel - startedAt) / periodLength) : 0;
    const index = Number.isFinite(storageIndex) ? Math.max(storageIndex, computedIndex) : computedIndex;
    const startLevel = startedAt + index * periodLength;
    const endLevel = startLevel + periodLength - 1;
    const blocksRemaining = Math.max(0, endLevel - headLevel);
    const now = Date.now();

    return {
        index,
        startLevel,
        endLevel,
        blocksRemaining,
        startDateTime: new Date(now - Math.max(0, headLevel - startLevel) * BLOCK_SECONDS * 1000).toISOString(),
        endDateTime: new Date(now + blocksRemaining * BLOCK_SECONDS * 1000).toISOString()
    };
}

function detectPhase(storage) {
    const period = storage?.voting_context?.period;
    if (!period) return 'empty';
    if (period.proposal) return 'proposal';
    if (period.promotion_vote || period.promotion) return 'promotion';
    if (period.adoption) return 'adoption';
    return Object.keys(period)[0] || 'active';
}

function toNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function startedAtLevel(storage) {
    return toNumber(storage?.config?.started_at_level);
}

function classifyTrackKey(storage) {
    return classifyEtherlinkGovernanceTrack(storage?.config || {});
}

async function discoverGovernanceTracks() {
    const byTrack = new Map();
    const currentContracts = TRACK_TEMPLATES.map((template) => ({
        address: GOVERNANCE_CURRENT_CONTRACTS[template.key],
        expectedTrack: template.key
    }));
    const storageResults = await Promise.allSettled(currentContracts.map(async (contract) => {
        try {
            const storage = await fetchJsonWithRetry(`${TZKT}/contracts/${contract.address}/storage`, 3);
            const key = classifyTrackKey(storage);
            return key === contract.expectedTrack ? { key, contract, storage } : null;
        } catch (_) {
            // Discovery is best-effort: fallback tracks make the delay visible without breaking the modal.
            return null;
        }
    }));
    for (const result of storageResults) {
        const found = result.status === 'fulfilled' ? result.value : null;
        if (!found) continue;
        targetTrackCache.set(found.contract.address, found.key);
        byTrack.set(found.key, found);
    }

    return TRACK_TEMPLATES.map((template) => {
        const found = byTrack.get(template.key);
        return {
            ...template,
            contract: found?.contract?.address || '',
            storage: found?.storage || null,
            discoveredAtLevel: startedAtLevel(found?.storage),
            source: found ? 'official-address-verified-by-tzkt' : 'missing'
        };
    });
}

function knownProposal(hash) {
    if (!hash) return null;
    if (typeof hash === 'object') {
        const key = `${hash.pool_address || hash.poolAddress || ''}|${hash.sequencer_pk || hash.sequencerPublicKey || ''}`;
        return KNOWN_PROPOSALS.get(key) || null;
    }
    try {
        const parsed = JSON.parse(hash);
        const key = `${parsed.pool_address || parsed.poolAddress || ''}|${parsed.sequencer_pk || parsed.sequencerPublicKey || ''}`;
        return KNOWN_PROPOSALS.get(key) || null;
    } catch (_) {
        return KNOWN_PROPOSALS.get(hash) || null;
    }
}

function proposalLabel(hash) {
    const known = knownProposal(hash);
    return known?.title || compactHash(typeof hash === 'string' ? hash : JSON.stringify(hash));
}

function proposalHref(hash) {
    return knownProposal(hash)?.href || null;
}

async function fetchAccounts(addresses) {
    const unique = [...new Set(addresses.filter(Boolean))];
    if (!unique.length) return new Map();
    const rows = [];
    for (let index = 0; index < unique.length; index += ACCOUNT_LOOKUP_BATCH_SIZE) {
        const batch = unique.slice(index, index + ACCOUNT_LOOKUP_BATCH_SIZE);
        const result = await fetchJson(`${TZKT}/accounts?address.in=${batch.join(',')}&select=address,alias`);
        if (Array.isArray(result)) rows.push(...result);
    }
    return new Map(rows.map((account) => [account.address, account.alias || '']));
}

async function fetchBigmapKeys(ptr, params = '') {
    if (!ptr) return [];
    const suffix = params ? `?${params}` : '';
    return fetchJson(`${TZKT}/bigmaps/${ptr}/keys${suffix}`);
}

async function fetchAllBigmapKeys(ptr, params = '') {
    if (!ptr) return [];
    const suffix = params ? `?${params}` : '';
    return fetchAllRows(`${TZKT}/bigmaps/${ptr}/keys${suffix}`);
}

async function fetchActivity(track, period) {
    if (!track.contract) return [];
    const url = `${TZKT}/operations/transactions?target=${track.contract}&level.ge=${period.startLevel}&level.le=${period.endLevel}&sort.desc=level`;
    const rows = await fetchAllRows(url);
    return normalizeActivityRows(rows);
}

function normalizeActivityRows(rows) {
    return (Array.isArray(rows) ? rows : [])
        .filter((op) => op.status === 'applied')
        .map((op) => ({
            hash: op.hash,
            level: op.level,
            time: op.timestamp,
            entrypoint: op.parameter?.entrypoint || 'transaction',
            value: op.parameter?.value,
            sender: op.sender || null
        }));
}

async function fetchReceiptOperations(track, receipts) {
    if (!track.contract) return track.activity || [];
    const levels = [...new Set(receipts.map((receipt) => Number(receipt.level || 0)).filter((level) => level > 0))];
    if (!levels.length) return track.activity || [];
    const rows = [];
    for (let index = 0; index < levels.length; index += RECEIPT_LEVEL_BATCH_SIZE) {
        const batch = levels.slice(index, index + RECEIPT_LEVEL_BATCH_SIZE);
        const url = `${TZKT}/operations/transactions?target=${track.contract}&level.in=${batch.join(',')}&sort.asc=level`;
        rows.push(...await fetchAllRows(url));
    }
    const exact = normalizeActivityRows(rows);
    const seen = new Set();
    return [...exact, ...(track.activity || [])].filter((operation) => {
        const key = `${operation.hash || ''}:${operation.level || 0}:${operation.sender?.address || ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function proposalKey(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    try {
        return JSON.stringify(value);
    } catch (_) {
        return String(value);
    }
}

function possibleHistoryTracks(codeHash) {
    return GOVERNANCE_HISTORY_CODE_HASH_TRACKS.get(String(codeHash)) || TRACK_TEMPLATES.map((track) => track.key);
}

function historyTrackIsFull(byTrack, trackKey) {
    return (byTrack.get(trackKey) || []).length >= HISTORICAL_PROPOSALS_PER_TRACK;
}

async function classifyHistoricalOperation(op) {
    const address = op.target?.address || '';
    const possibleTracks = possibleHistoryTracks(op.targetCodeHash);
    if (possibleTracks.length === 1) {
        if (address) targetTrackCache.set(address, possibleTracks[0]);
        return possibleTracks[0];
    }
    if (!address) return '';
    const cached = targetTrackCache.get(address);
    if (cached) return cached;
    try {
        const storage = await fetchJsonWithRetry(`${TZKT}/contracts/${address}/storage`, 2);
        const key = classifyTrackKey(storage);
        if (key) targetTrackCache.set(address, key);
        return key;
    } catch (_) {
        return '';
    }
}

async function fetchHistoricalProposalMap() {
    const productionTargets = GOVERNANCE_PRODUCTION_CONTRACTS.map((contract) => contract.address);
    const rows = await fetchJson(`${TZKT}/operations/transactions?target.in=${productionTargets.join(',')}&entrypoint=new_proposal&limit=${HISTORICAL_PROPOSAL_SCAN_LIMIT}&sort.desc=level`);
    const byTrack = new Map(TRACK_TEMPLATES.map((track) => [track.key, []]));
    const seen = new Set();

    for (const op of rows) {
        if (op.status && op.status !== 'applied') continue;
        const possibleTracks = possibleHistoryTracks(op.targetCodeHash);
        if (possibleTracks.every((trackKey) => historyTrackIsFull(byTrack, trackKey))) continue;
        const contract = op.target?.address || '';
        const payload = op.parameter?.value;
        const key = proposalKey(payload);
        if (!key) continue;
        const trackKey = await classifyHistoricalOperation(op);
        if (!trackKey) continue;
        const seenKey = `${trackKey}:${key}`;
        if (seen.has(seenKey)) continue;
        seen.add(seenKey);
        const proposals = byTrack.get(trackKey) || [];
        if (proposals.length >= HISTORICAL_PROPOSALS_PER_TRACK) continue;
        proposals.push({
            payload,
            key,
            level: op.level,
            time: op.timestamp,
            hash: op.hash,
            contract,
            sender: op.sender || null
        });
    }

    return byTrack;
}

function attachHistoricalProposals(data, history = historicalProposalCache) {
    if (!data || !(history instanceof Map)) return data;
    return {
        ...data,
        historyReady: true,
        tracks: data.tracks.map((track) => ({
            ...track,
            historyReady: true,
            historicalProposals: history.get(track.key) || []
        }))
    };
}

async function loadHistoricalProposalMap({ force = false } = {}) {
    if (!force && historicalProposalCache && Date.now() - historicalProposalCacheAt < HISTORY_CACHE_TTL) {
        return historicalProposalCache;
    }
    if (historicalProposalInFlight) return historicalProposalInFlight;
    historicalProposalInFlight = fetchHistoricalProposalMap()
        .then((history) => {
            historicalProposalCache = history;
            historicalProposalCacheAt = Date.now();
            return history;
        })
        .finally(() => {
            historicalProposalInFlight = null;
        });
    return historicalProposalInFlight;
}

async function hydrateHistoricalProposals(data, { force = false } = {}) {
    try {
        const history = await loadHistoricalProposalMap({ force });
        const enriched = attachHistoricalProposals(data, history);
        if (cachedData?.updatedAt === data?.updatedAt) cachedData = enriched;
        return enriched;
    } catch (_) {
        return data;
    }
}

async function enrichUpvoters(keys) {
    const rows = keys.map((key) => ({
        id: key.id || 0,
        address: key.key?.key_hash || key.key || '',
        firstLevel: key.firstLevel,
        lastLevel: key.lastLevel,
        proposal: key.key?.bytes || null
    }))
        .filter((row) => row.address)
        .sort((a, b) => Number(a.firstLevel || 0) - Number(b.firstLevel || 0) || Number(a.id || 0) - Number(b.id || 0));
    const aliases = await fetchAccounts(rows.map((row) => row.address));
    return rows.map((row) => ({
        ...row,
        alias: aliases.get(row.address) || ''
    }));
}

async function buildProposalState(storage) {
    const proposal = storage?.voting_context?.period?.proposal;
    if (!proposal) return null;
    const [proposalsResult, upvotersResult] = await Promise.allSettled([
        fetchBigmapKeys(proposal.proposals),
        fetchAllBigmapKeys(proposal.upvoters_proposals, 'sort.asc=firstLevel')
    ]);
    const proposals = proposalsResult.status === 'fulfilled' ? proposalsResult.value : [];
    const upvoterKeys = upvotersResult.status === 'fulfilled' ? upvotersResult.value : [];
    const winner = proposal.winner_candidate || proposals[0]?.key || null;
    const proposalRows = proposals
        .map((row) => ({
            hash: row.key,
            proposers: row.value?.proposers || [],
            upvotes: row.value?.upvotes_voting_power || '0',
            firstLevel: row.firstLevel,
            lastLevel: row.lastLevel
        }))
        .sort((a, b) => Number(toBigInt(b.upvotes) - toBigInt(a.upvotes)));
    if (!proposalRows.length && winner) {
        proposalRows.push({
            hash: winner,
            proposers: [],
            upvotes: proposal.max_upvotes_voting_power || '0',
            firstLevel: null,
            lastLevel: null
        });
    }
    const upvoters = await enrichUpvoters(upvoterKeys).catch(() => []);
    const maxUpvotes = proposal.max_upvotes_voting_power || proposalRows[0]?.upvotes || '0';
    if (!winner && !proposalRows.length && !upvoters.length && toBigInt(maxUpvotes) <= 0n) {
        return null;
    }

    return {
        kind: 'proposal',
        winner,
        totalVotingPower: proposal.total_voting_power || storage?.voting_context?.total_voting_power || '0',
        maxUpvotes,
        proposalRows,
        upvoters
    };
}

function buildPromotionState(storage) {
    const period = storage?.voting_context?.period || {};
    const promotion = period.promotion_vote || period.promotion;
    if (!promotion) return null;
    const candidate = promotion.candidate || promotion.proposal_hash || promotion.winner_candidate || storage.last_winner || null;
    const yea = promotion.yea_voting_power || promotion.yea || '0';
    const nay = promotion.nay_voting_power || promotion.nay || '0';
    const pass = promotion.pass_voting_power || promotion.pass || '0';
    const totalVotingPower = promotion.total_voting_power || storage?.voting_context?.total_voting_power || '0';
    const totalCast = toBigInt(yea) + toBigInt(nay) + toBigInt(pass);
    const yeaNay = toBigInt(yea) + toBigInt(nay);
    const supermajority = yeaNay > 0n ? Number((toBigInt(yea) * 10000n) / yeaNay) / 100 : null;
    if (!candidate && totalCast <= 0n) return null;

    return {
        kind: 'promotion',
        candidate,
        yea,
        nay,
        pass,
        totalVotingPower,
        totalCast,
        votersPtr: promotion.voters || null,
        participation: bigPercent(totalCast, totalVotingPower),
        supermajority
    };
}

async function loadCurrentVotingPowerSnapshot({ force = false } = {}) {
    if (!force && votingPowerSnapshotCache && Date.now() - votingPowerSnapshotCacheAt < VOTING_POWER_CACHE_TTL) {
        return votingPowerSnapshotCache;
    }
    if (votingPowerSnapshotInFlight) return votingPowerSnapshotInFlight;
    votingPowerSnapshotInFlight = fetchAllRows(`${TZKT}/voting/periods/current/voters?select=delegate,votingPower`)
        .then((rows) => {
            const byAddress = new Map();
            let totalVotingPower = 0n;
            for (const row of Array.isArray(rows) ? rows : []) {
                const address = row?.delegate?.address || '';
                if (!address) continue;
                const votingPower = toBigInt(row.votingPower);
                totalVotingPower += votingPower;
                byAddress.set(address, {
                    address,
                    alias: row.delegate?.alias || '',
                    votingPower
                });
            }
            votingPowerSnapshotCache = { byAddress, totalVotingPower };
            votingPowerSnapshotCacheAt = Date.now();
            return votingPowerSnapshotCache;
        })
        .finally(() => {
            votingPowerSnapshotInFlight = null;
        });
    return votingPowerSnapshotInFlight;
}

function receiptOperation(track, receipt, operations = track.activity || []) {
    const level = Number(receipt.level || 0);
    const candidates = operations.filter((op) => (
        Number(op.level || 0) === level
        && ['new_proposal', 'upvote', 'upvote_proposal', 'vote'].includes(op.entrypoint)
    ));
    const direct = candidates.find((op) => op.sender?.address === receipt.address);
    if (direct) return direct;
    const receiptVote = String(receipt.vote || '').toLowerCase();
    const matchingBallot = candidates.find((op) => (
        typeof op.value === 'string' && op.value.toLowerCase() === receiptVote
    ));
    return matchingBallot || candidates[0] || null;
}

function proposalReceipts(track) {
    return (track.proposal?.upvoters || []).map((voter) => ({
        id: voter.id || 0,
        address: voter.address,
        alias: voter.alias || '',
        level: voter.firstLevel || voter.lastLevel || 0,
        vote: 'upvote'
    }));
}

async function promotionReceipts(track) {
    if (!track.promotion?.votersPtr) return [];
    const rows = await fetchAllBigmapKeys(track.promotion.votersPtr, 'sort.asc=lastLevel');
    return rows.map((row) => ({
        id: row.id || 0,
        address: typeof row.key === 'string' ? row.key : row.key?.key_hash || '',
        alias: '',
        level: row.lastLevel || row.firstLevel || 0,
        vote: typeof row.value === 'string' ? row.value.toLowerCase() : 'vote'
    })).filter((row) => row.address);
}

async function enrichBakerVoteLedger(track, votingPowerSnapshot) {
    let receipts = track.phase === 'promotion' && track.promotion
        ? await promotionReceipts(track)
        : proposalReceipts(track);
    receipts = receipts.sort((a, b) => Number(a.level || 0) - Number(b.level || 0) || Number(a.id || 0) - Number(b.id || 0));

    const totalVotingPower = track.phase === 'promotion'
        ? track.promotion?.totalVotingPower
        : track.proposal?.totalVotingPower;
    const requiredPercent = track.phase === 'promotion' ? track.promotionRequired : track.proposalRequired;
    const thresholdVotingPower = requiredVotingPower(totalVotingPower, requiredPercent);
    const snapshotMatches = toBigInt(totalVotingPower) > 0n
        && votingPowerSnapshot?.totalVotingPower === toBigInt(totalVotingPower);

    let cumulativeVotingPower = 0n;
    const receiptOperations = await fetchReceiptOperations(track, receipts).catch(() => track.activity || []);
    const bakerVotes = receipts.map((receipt) => {
        const operation = receiptOperation(track, receipt, receiptOperations);
        const snapshot = votingPowerSnapshot?.byAddress?.get(receipt.address);
        const votingPower = snapshotMatches && snapshot ? snapshot.votingPower : null;
        const previousCumulativeVotingPower = cumulativeVotingPower;
        if (votingPower !== null) cumulativeVotingPower += votingPower;
        const cumulativeQuorumShare = votingPower === null ? null : bigPercent(cumulativeVotingPower, thresholdVotingPower);
        return {
            ...receipt,
            alias: snapshot?.alias || receipt.alias || '',
            hash: operation?.hash || '',
            time: operation?.time || '',
            votingKey: operation?.sender?.address && operation.sender.address !== receipt.address
                ? operation.sender.address
                : '',
            votingPower: votingPower === null ? null : votingPower.toString(),
            quorumShare: votingPower === null ? null : bigPercent(votingPower, thresholdVotingPower),
            cumulativeQuorumShare,
            quorumCrossed: votingPower !== null
                && thresholdVotingPower > 0n
                && previousCumulativeVotingPower < thresholdVotingPower
                && cumulativeVotingPower >= thresholdVotingPower
        };
    });

    return {
        ...track,
        bakerVotes,
        bakerVoteCount: receipts.length,
        bakerVoteThresholdPower: thresholdVotingPower.toString(),
        bakerVoteSnapshotMatched: snapshotMatches,
        bakerVotesReady: true
    };
}

async function hydrateBakerVoteLedgers(data, { force = false } = {}) {
    if (!data?.tracks?.some(hasActiveTrackPayload)) return data;
    if (!force && data.tracks.every((track) => !hasActiveTrackPayload(track) || track.bakerVotesReady)) return data;

    let votingPowerSnapshot = null;
    try {
        votingPowerSnapshot = await loadCurrentVotingPowerSnapshot({ force });
    } catch (_) {
        // Keep the baker receipt list visible even if the L1 voting-power snapshot is delayed.
    }

    const tracks = await Promise.all(data.tracks.map(async (track) => {
        if (!hasActiveTrackPayload(track)) return track;
        try {
            return await enrichBakerVoteLedger(track, votingPowerSnapshot);
        } catch (_) {
            return {
                ...track,
                bakerVotes: [],
                bakerVoteCount: 0,
                bakerVoteThresholdPower: requiredVotingPower(
                    track.phase === 'promotion' ? track.promotion?.totalVotingPower : track.proposal?.totalVotingPower,
                    track.phase === 'promotion' ? track.promotionRequired : track.proposalRequired
                ).toString(),
                bakerVoteSnapshotMatched: false,
                bakerVotesReady: true
            };
        }
    }));

    const enriched = { ...data, tracks };
    if (cachedData?.updatedAt === data.updatedAt) cachedData = enriched;
    return enriched;
}

async function fetchTrack(track, headLevel, historicalProposals = []) {
    if (!track.contract) throw new Error('contract discovery unavailable');
    const storage = track.storage || await fetchJson(`${TZKT}/contracts/${track.contract}/storage`);
    const period = normalizePeriod(track, storage, headLevel);
    const phase = detectPhase(storage);
    const [proposalResult, activityResult] = await Promise.allSettled([
        buildProposalState(storage),
        fetchActivity(track, period)
    ]);
    const promotion = buildPromotionState(storage);
    const proposal = proposalResult.status === 'fulfilled' ? proposalResult.value : null;
    const activity = activityResult.status === 'fulfilled' ? activityResult.value : [];
    const config = storage.config || {};
    const proposalRequired = Number(config.proposal_quorum ?? 0);
    const promotionRequired = Number(config.promotion_quorum ?? 0);
    const supermajorityRequired = Number(config.promotion_supermajority ?? 0);
    const proposalProgress = proposal ? bigPercent(proposal.maxUpvotes, proposal.totalVotingPower) : null;

    return {
        ...track,
        config,
        period,
        phase,
        proposal,
        promotion,
        activity,
        historicalProposals,
        historyReady: Boolean(historicalProposalCache),
        proposalProgress,
        proposalRequired,
        promotionRequired,
        supermajorityRequired
    };
}

function fallbackTrack(track, error) {
    return {
        ...track,
        phase: 'error',
        period: null,
        proposal: null,
        promotion: null,
        activity: [],
        historicalProposals: [],
        historyReady: Boolean(historicalProposalCache),
        error: error?.message || 'unavailable'
    };
}

async function fetchEtherlinkGovernanceData({ force = false } = {}) {
    if (!force && cachedData && Date.now() - cachedAt < CACHE_TTL) {
        return historicalProposalCache ? attachHistoricalProposals(cachedData) : cachedData;
    }
    if (dataInFlight) return dataInFlight;
    dataInFlight = (async () => {
        const headRows = await fetchJson(`${TZKT}/blocks?limit=1&sort.desc=level`);
        const head = Array.isArray(headRows) ? headRows[0] : headRows;
        const headLevel = Number(head?.level) || 0;
        const trackTemplates = await discoverGovernanceTracks();
        const trackResults = await Promise.allSettled(trackTemplates.map((track) => (
            fetchTrack(track, headLevel, historicalProposalCache?.get(track.key) || [])
        )));
        const tracks = trackResults.map((result, index) => (
            result.status === 'fulfilled' ? result.value : fallbackTrack(trackTemplates[index], result.reason)
        ));

        cachedData = {
            head,
            headLevel,
            updatedAt: Date.now(),
            historyReady: Boolean(historicalProposalCache),
            tracks
        };
        if (historicalProposalCache) cachedData = attachHistoricalProposals(cachedData);
        cachedAt = Date.now();
        return cachedData;
    })();
    try {
        return await dataInFlight;
    } finally {
        dataInFlight = null;
    }
}

function trackStatus(track) {
    if (track.phase === 'error') return { label: 'Data delayed', className: 'risk' };
    if (track.phase === 'proposal' && track.proposal) {
        const met = Number.isFinite(track.proposalProgress) && track.proposalProgress >= track.proposalRequired;
        return {
            label: met ? 'Proposal quorum met' : 'Proposal below quorum',
            className: met ? 'good' : 'watch',
            headline: met ? formatPercent(track.proposalProgress) : 'BELOW QUORUM'
        };
    }
    if (track.phase === 'promotion' && track.promotion) {
        const quorumMet = Number.isFinite(track.promotion.participation) && track.promotion.participation >= track.promotionRequired;
        const yayMet = Number.isFinite(track.promotion.supermajority) && track.promotion.supermajority >= track.supermajorityRequired;
        if (quorumMet && yayMet) {
            return { label: 'Promotion passing', className: 'good', headline: 'PASSING' };
        }
        if (!promotionCanStillPass(track)) {
            return { label: 'Promotion cannot pass', className: 'risk', headline: 'CANNOT PASS' };
        }
        return { label: 'Promotion not passing', className: 'watch', headline: 'NOT PASSING' };
    }
    if (track.phase === 'empty' || !hasActiveTrackPayload(track)) return { label: 'No active proposal', className: 'muted' };
    return { label: 'Active period', className: 'live' };
}

function promotionRemainingVotingPower(track) {
    const promotion = track?.promotion;
    if (!promotion) return 0n;
    const total = toBigInt(promotion.totalVotingPower);
    const cast = toBigInt(promotion.yea) + toBigInt(promotion.nay) + toBigInt(promotion.pass);
    return total > cast ? total - cast : 0n;
}

function maximumPromotionSupermajority(track) {
    const promotion = track?.promotion;
    if (!promotion || toBigInt(promotion.totalVotingPower) <= 0n) return null;
    const remaining = promotionRemainingVotingPower(track);
    const maximumYea = toBigInt(promotion.yea) + remaining;
    const maximumDecisive = maximumYea + toBigInt(promotion.nay);
    return maximumDecisive > 0n ? bigPercent(maximumYea, maximumDecisive) : 100;
}

function promotionCanStillPass(track) {
    const promotion = track?.promotion;
    if (!promotion || !Number.isFinite(track?.supermajorityRequired)) return true;
    const remaining = promotionRemainingVotingPower(track);
    const maximumYea = toBigInt(promotion.yea) + remaining;
    const maximumDecisive = maximumYea + toBigInt(promotion.nay);
    if (maximumDecisive <= 0n) return true;
    const requiredBps = BigInt(Math.max(0, Math.round(track.supermajorityRequired * 100)));
    return maximumYea * 10000n >= maximumDecisive * requiredBps;
}

function trackLastActivity(track) {
    const candidates = [
        ...(track.activity || []).map((op) => ({ time: op.time, label: op.entrypoint?.replace(/_/g, ' ') || 'contract call', href: op.hash ? `https://tzkt.io/${op.hash}` : '' })),
        ...(track.historicalProposals || []).map((proposal) => ({ time: proposal.time, label: `proposal ${proposalLabel(proposal.payload)}`, href: proposal.hash ? `https://tzkt.io/${proposal.hash}` : '' }))
    ].filter((item) => item.time);
    candidates.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
    return candidates[0] || null;
}

function topTrack(data) {
    return data.tracks.find((track) => track.phase === 'promotion' && track.promotion && hasActiveTrackPayload(track))
        || data.tracks.find((track) => track.phase === 'proposal' && track.proposal && hasActiveTrackPayload(track))
        || data.tracks[0];
}

function hasActiveTrackPayload(track) {
    return Boolean(
        (track?.phase === 'proposal' && track.proposal)
        || (track?.phase === 'promotion' && track.promotion)
    );
}

function hasActiveProposalTrack(data) {
    return data.tracks.some(hasActiveTrackPayload);
}

function dispatchEtherlinkGovernanceHotSignal(data) {
    if (!data?.tracks?.length) return;
    const track = topTrack(data);
    if (!track || !hasActiveTrackPayload(track)) return;
    const payload = track.phase === 'promotion' ? track.promotion?.candidate : track.proposal?.winner;
    const label = proposalLabel(payload);
    const period = track.phase === 'promotion' ? 'promotion ballot' : 'proposal upvote window';
    const status = trackStatus(track);
    const next = track.phase === 'promotion'
        ? (!promotionCanStillPass(track)
            ? 'The proposal can no longer reach the required Yea supermajority.'
            : 'Cooldown is next if quorum and supermajority both pass.')
        : 'Promotion is next when this window closes.';
    const voteState = track.phase === 'promotion'
        ? `Participation ${formatPercent(track.promotion?.participation)} / ${formatPercent(track.promotionRequired, 0)}; Yea ${formatPercent(track.promotion?.supermajority)} / ${formatPercent(track.supermajorityRequired, 0)}.`
        : `${formatPercent(track.proposalProgress)} support vs ${formatPercent(track.proposalRequired, 0)} required.`;
    dispatchHotSignal({
        id: `etherlink-governance-${track.key}`,
        category: 'etherlink',
        kind: 'state',
        visual: 'governance',
        tone: 'governance-hot',
        spectacle: 'historic',
        breaking: true,
        score: 260,
        title: 'L2 VOTE OPEN NOW',
        detail: `${track.label} ${period} · ${status.label}`,
        text: `${label}: ${voteState} ${trackCountdown(track)}. ${next}`,
        route: '/l2chamber/',
        ttlMs: ENTRY_REFRESH_MS * 2
    });
}

function allTracksQuiet(data) {
    return data.tracks.every((track) => track.phase !== 'error' && !hasActiveTrackPayload(track));
}

function governancePhaseIndex(track) {
    if (track.phase === 'proposal' && track.proposal) return 0;
    if (track.phase === 'promotion' && track.promotion) return 1;
    if (track.phase === 'adoption') return 2;
    return -1;
}

function trackPhaseLabel(track) {
    if (track.phase === 'proposal' && track.proposal) return 'Proposal upvotes';
    if (track.phase === 'promotion' && track.promotion) return 'Promotion ballot';
    if (track.phase === 'adoption') return 'Cooldown';
    return 'No active vote';
}

function trackCountdown(track) {
    if (!track.period?.blocksRemaining && track.period?.blocksRemaining !== 0) return 'Timing unavailable';
    return `${formatDurationFromBlocks(track.period.blocksRemaining)} left`;
}

function proposalQuorumGap(track) {
    if (!track.proposal) return null;
    const support = toBigInt(track.proposal.maxUpvotes);
    const required = requiredVotingPower(track.proposal.totalVotingPower, track.proposalRequired);
    return required > support ? required - support : 0n;
}

function currentActionRows(track) {
    const currentOps = (track.activity || [])
        .filter((op) => ['new_proposal', 'upvote', 'upvote_proposal', 'vote'].includes(op.entrypoint))
        .slice(0, 6)
        .map((op) => {
            const actor = op.sender?.alias || op.sender?.address || 'Unknown baker';
            const voteValue = op.value?.vote || op.value?.ballot || op.value?.choice || op.value;
            const action = op.entrypoint === 'new_proposal'
                ? 'submitted the proposal'
                : op.entrypoint === 'vote'
                    ? `voted ${typeof voteValue === 'string' ? voteValue.toUpperCase() : 'in Promotion'}`
                    : 'upvoted the proposal';
            return `${actor} ${action} · ${formatAge(op.time)}`;
        });
    if (currentOps.length) return currentOps;
    return (track.proposal?.upvoters || []).slice(-6).reverse().map((voter) => (
        `${voter.alias || voter.address} upvoted · level ${voter.firstLevel || '--'}`
    ));
}

function renderBakerVoteLedger(track) {
    if (!hasActiveTrackPayload(track)) return '';
    const votes = track.bakerVotes || [];
    const phaseLabel = track.phase === 'promotion' ? 'Promotion vote' : 'proposal window';
    const actionLabel = track.phase === 'promotion' ? 'Ballot' : 'Action';
    const requiredPercent = track.phase === 'promotion' ? track.promotionRequired : track.proposalRequired;
    const thresholdPower = toBigInt(track.bakerVoteThresholdPower);
    const voteCount = Number(track.bakerVoteCount || votes.length);
    const countLabel = `${voteCount} baker receipt${voteCount === 1 ? '' : 's'} · complete`;
    const rowTitle = votes.length
        ? `Full ${phaseLabel} ledger · first to latest`
        : `No baker receipts in this ${phaseLabel}`;
    const rows = votes.map((vote, index) => {
        const ballot = String(vote.vote || 'vote').toLowerCase();
        const ballotClass = ['yea', 'nay', 'pass', 'upvote'].includes(ballot) ? ballot : 'vote';
        const votingPower = vote.votingPower === null ? 'Weight delayed' : formatXTZ(vote.votingPower);
        const requirementShare = formatRequirementShare(vote.quorumShare);
        const contributionLabel = Number.isFinite(vote.quorumShare) ? `+${requirementShare}` : requirementShare;
        const cumulativeLabel = formatRequirementShare(vote.cumulativeQuorumShare);
        const requirementWidth = Number.isFinite(vote.cumulativeQuorumShare)
            ? Math.max(vote.cumulativeQuorumShare > 0 ? 0.75 : 0, Math.min(100, vote.cumulativeQuorumShare))
            : 0;
        const timing = vote.time
            ? `${formatUtcDateTime(vote.time, { includeYear: true })} UTC`
            : 'time unavailable';
        const sequence = `${index + 1} of ${voteCount || votes.length}`;
        const via = vote.votingKey ? ` · via ${compactHash(vote.votingKey)}` : '';
        return `
            <div class="etherlink-gov-baker-vote-row${vote.quorumCrossed ? ' is-quorum-crossing' : ''}" role="listitem" data-baker-vote="${escapeHtml(ballot)}" data-quorum-share="${escapeHtml(Number.isFinite(vote.quorumShare) ? String(vote.quorumShare) : '')}" data-cumulative-quorum-share="${escapeHtml(Number.isFinite(vote.cumulativeQuorumShare) ? String(vote.cumulativeQuorumShare) : '')}" data-quorum-crossed="${vote.quorumCrossed ? 'true' : 'false'}">
                <div class="etherlink-gov-baker-vote-main">
                    <a class="etherlink-gov-voter-link" href="#baker=${escapeHtml(encodeURIComponent(vote.address))}">${escapeHtml(vote.alias || vote.address)}</a>
                    <code>${escapeHtml(vote.address)}</code>
                    <small>${escapeHtml(`${sequence} · ${timing} · level ${vote.level || '--'}${via}`)}</small>
                </div>
                <span class="etherlink-gov-ballot ${escapeHtml(ballotClass)}">${escapeHtml(ballot.toUpperCase())}</span>
                <div class="etherlink-gov-baker-power">
                    <strong>${escapeHtml(votingPower)}</strong>
                    <span>L1 period snapshot</span>
                </div>
                <div class="etherlink-gov-quorum-share">
                    <div><strong>${escapeHtml(contributionLabel)}</strong><span>${vote.quorumCrossed ? 'quorum reached here' : `${cumulativeLabel} cumulative`}</span></div>
                    <span class="etherlink-gov-quorum-share-bar" aria-hidden="true"><i style="width:${requirementWidth.toFixed(2)}%"></i></span>
                </div>
                ${vote.hash ? `<a class="etherlink-gov-vote-op" href="https://tzkt.io/${escapeHtml(vote.hash)}" target="_blank" rel="noopener" aria-label="Open ${escapeHtml(vote.alias || vote.address)} vote operation">op ↗</a>` : '<span></span>'}
            </div>
        `;
    }).join('');

    const snapshotNote = track.bakerVoteSnapshotMatched
        ? `Rows run from the first receipt to the latest. Each + value is that baker's share of the ${formatPercent(requiredPercent, 0)} quorum (${formatXTZ(thresholdPower)}); the bar traces cumulative receipts and marks where quorum was reached.`
        : 'Baker receipts are current, but the matching L1 voting-power snapshot is delayed, so contribution sizes are temporarily unavailable.';

    return `
        <section class="etherlink-gov-recent-bakers" id="etherlink-governance-recent-bakers" aria-labelledby="etherlink-governance-recent-bakers-title">
            <div class="etherlink-gov-recent-bakers-header">
                <div>
                    <span class="chamber-now-kicker">Who made up the quorum</span>
                    <h3 id="etherlink-governance-recent-bakers-title">${escapeHtml(rowTitle)}</h3>
                </div>
                <span class="lb-live-pill">${escapeHtml(countLabel)}</span>
            </div>
            <div class="etherlink-gov-baker-vote-head" aria-hidden="true">
                <span>Baker · received UTC</span><span>${escapeHtml(actionLabel)}</span><span>Voting power</span><span>Quorum recount</span><span></span>
            </div>
            <div class="etherlink-gov-baker-vote-list" role="list">
                ${rows || '<div class="lb-empty">No current-period baker receipts are indexed yet.</div>'}
            </div>
            <p class="etherlink-gov-baker-vote-note">${escapeHtml(snapshotNote)} Voting-key calls are expanded into the represented L1 baker accounts.</p>
        </section>
    `;
}

function trackNowSummary(track) {
    if (track.phase === 'proposal' && track.proposal) {
        const met = Number.isFinite(track.proposalProgress) && track.proposalProgress >= track.proposalRequired;
        const gap = proposalQuorumGap(track);
        if (met) {
            return `${proposalLabel(track.proposal.winner)} has cleared the ${formatPercent(track.proposalRequired, 0)} proposal threshold. Upvotes remain open until the period ends, then the leading proposal enters Promotion.`;
        }
        return `${proposalLabel(track.proposal.winner)} is gathering baker upvotes. ${gap && gap > 0n ? `${formatXTZ(gap)} more voting power is needed` : 'More voting power is needed'} before it can advance to Promotion.`;
    }
    if (track.phase === 'promotion' && track.promotion) {
        const quorumMet = Number.isFinite(track.promotion.participation) && track.promotion.participation >= track.promotionRequired;
        const yayMet = Number.isFinite(track.promotion.supermajority) && track.promotion.supermajority >= track.supermajorityRequired;
        if (quorumMet && yayMet) {
            return `${proposalLabel(track.promotion.candidate)} is currently passing both Promotion gates. Ballots remain open until the period ends; Cooldown follows if the final receipt still clears both thresholds.`;
        }
        const maximum = maximumPromotionSupermajority(track);
        if (!promotionCanStillPass(track) && Number.isFinite(maximum)) {
            return `${proposalLabel(track.promotion.candidate)} cannot pass this Promotion vote. Quorum is ${quorumMet ? 'met' : 'not met'}, but even if all remaining voting power votes Yea, support can reach at most ${formatPercent(maximum)} against ${formatPercent(track.supermajorityRequired, 0)} required.`;
        }
        return `${proposalLabel(track.promotion.candidate)} is in the binding Yea / Nay / Pass ballot. It must clear both ${formatPercent(track.promotionRequired, 0)} participation and ${formatPercent(track.supermajorityRequired, 0)} Yea supermajority.`;
    }
    if (track.phase === 'adoption') {
        return 'The vote has passed and the track is in its cooldown runway. Ballots are closed; an Etherlink user can trigger the approved change after cooldown.';
    }
    return `${track.label} has no active proposal or Promotion ballot in the current storage read. The track is quiet, not broken; its rules and recent proposal memory remain available below.`;
}

function trackWatchItems(track) {
    if (track.phase === 'proposal' && track.proposal) {
        const met = Number.isFinite(track.proposalProgress) && track.proposalProgress >= track.proposalRequired;
        return [
            met
                ? `Proposal quorum is met at ${formatPercent(track.proposalProgress)}; the final leader is decided when this period closes.`
                : `Proposal support is ${formatPercent(track.proposalProgress)} against ${formatPercent(track.proposalRequired, 0)} required.`,
            `Promotion is the binding ballot: ${formatPercent(track.promotionRequired, 0)} participation and ${formatPercent(track.supermajorityRequired, 0)} Yea supermajority.`,
            'Voting power comes from Tezos L1 bakers; a baker may vote through its baking key or an assigned Etherlink voting key.'
        ];
    }
    if (track.phase === 'promotion' && track.promotion) {
        const maximum = maximumPromotionSupermajority(track);
        return [
            `Participation is ${formatPercent(track.promotion.participation)} against ${formatPercent(track.promotionRequired, 0)} required.`,
            `Yea supermajority is ${formatPercent(track.promotion.supermajority)} against ${formatPercent(track.supermajorityRequired, 0)} required.`,
            !promotionCanStillPass(track) && Number.isFinite(maximum)
                ? `The maximum possible Yea supermajority is now ${formatPercent(maximum)}; this proposal cannot advance to Cooldown.`
                : 'If both gates clear, Cooldown lasts about one day before an account triggers the approved change.'
        ];
    }
    return [
        `${track.label} uses a ${formatPercent(track.proposalRequired, 0)} proposal threshold.`,
        `A winning proposal still needs ${formatPercent(track.promotionRequired, 0)} Promotion participation and ${formatPercent(track.supermajorityRequired, 0)} Yea supermajority.`,
        'FAST is for shorter urgent changes; SLOW is for longer kernel review; SEQUENCER governs the operator account.'
    ];
}

function renderL2GovernancePhaseHero(track) {
    const activeIndex = governancePhaseIndex(track);
    const steps = GOVERNANCE_PHASES.map((phase, index) => {
        const state = activeIndex < 0 ? 'future' : index < activeIndex ? 'complete' : index === activeIndex ? 'active' : 'future';
        return `
            <div class="governance-phase-step ${state}" data-stage="${escapeHtml(phase.key)}" title="${escapeHtml(phase.detail)}">
                <span class="governance-phase-dot" aria-hidden="true"></span>
                <span>${escapeHtml(phase.label)}</span>
            </div>
        `;
    }).join('');
    let nextLine = 'No active payload is present. Choose another track or use the history below to see its last governance action.';
    if (track.phase === 'proposal' && track.proposal) {
        nextLine = track.proposalProgress >= track.proposalRequired
            ? 'Threshold met. Upvotes stay open until period end; the leading proposal enters Promotion next.'
            : 'Bakers are selecting the leading proposal. It must reach the track threshold before Promotion can open.';
    } else if (track.phase === 'promotion' && track.promotion) {
        nextLine = 'This is the binding vote. Both participation and Yea supermajority must pass before Cooldown.';
    } else if (track.phase === 'adoption') {
        nextLine = 'Ballots are closed. Cooldown completes before an account can trigger the approved change.';
    }

    return `
        <section class="governance-phase-hero etherlink-governance-phase-hero chamber-anim-fade" id="etherlink-governance-phase-hero" aria-label="Etherlink governance phase and countdown">
            <div class="governance-phase-main">
                <span class="feature-kicker">L2 governance clock</span>
                <strong>${escapeHtml(`${track.label} · ${trackPhaseLabel(track)} · ${trackCountdown(track)}`)}</strong>
                <p>${escapeHtml(nextLine)}</p>
            </div>
            <div class="governance-phase-stepper" role="list" aria-label="Etherlink governance phases">
                ${steps}
            </div>
        </section>
    `;
}

function renderL2GovernanceNow(track) {
    const actions = currentActionRows(track);
    const watchItems = trackWatchItems(track);
    const endTime = track.period?.endDateTime ? formatDate(track.period.endDateTime) : '--';
    const latestActivity = trackLastActivity(track);
    let cards = [
        { label: 'Current state', value: trackPhaseLabel(track), detail: track.description },
        { label: 'Period', value: `#${track.period?.index ?? '--'}`, detail: `${trackCountdown(track)} · estimated ${endTime}` },
        { label: 'Recent action', value: actions.length ? `${actions.length} shown` : 'None indexed', detail: latestActivity ? formatAge(latestActivity.time) : 'No current-period calls' }
    ];
    if (track.phase === 'proposal' && track.proposal) {
        cards = [
            { label: 'Proposal support', value: formatPercent(track.proposalProgress), detail: `${formatXTZ(track.proposal.maxUpvotes)} · ${formatPercent(track.proposalRequired, 0)} required` },
            { label: 'Bakers indexed', value: String(track.proposal.upvoters.length), detail: 'Proposal submitter counts as an upvote' },
            { label: 'Window closes', value: trackCountdown(track), detail: endTime }
        ];
    } else if (track.phase === 'promotion' && track.promotion) {
        const quorumMet = Number.isFinite(track.promotion.participation) && track.promotion.participation >= track.promotionRequired;
        const yeaMet = Number.isFinite(track.promotion.supermajority) && track.promotion.supermajority >= track.supermajorityRequired;
        const yeaOutcome = yeaMet ? 'good' : promotionCanStillPass(track) ? 'watch' : 'risk';
        cards = [
            { label: 'Participation', value: formatPercent(track.promotion.participation), detail: `${formatPercent(track.promotionRequired, 0)} required`, outcome: quorumMet ? 'good' : 'watch' },
            { label: 'Yea supermajority', value: formatPercent(track.promotion.supermajority), detail: `${formatPercent(track.supermajorityRequired, 0)} required`, outcome: yeaOutcome },
            { label: 'Ballot closes', value: trackCountdown(track), detail: endTime }
        ];
    }

    return `
        <section class="chamber-now-panel etherlink-governance-now chamber-anim-fade" id="etherlink-governance-now" aria-label="Current Etherlink governance state">
            <div class="chamber-now-main">
                <span class="chamber-now-kicker">What is happening now</span>
                <h3>${escapeHtml(track.phase === 'proposal' && track.proposal
                    ? `${proposalLabel(track.proposal.winner)} is in the ${track.label} proposal vote`
                    : track.phase === 'promotion' && track.promotion
                        ? `${proposalLabel(track.promotion.candidate)} is in the ${track.label} Promotion vote`
                        : `${track.label} governance is quiet`)}</h3>
                <p>${escapeHtml(trackNowSummary(track))}</p>
            </div>
            <div class="chamber-now-grid">
                ${cards.map((card) => `
                    <div class="chamber-now-card${card.outcome ? ` ${escapeHtml(card.outcome)}` : ''}"${card.outcome ? ` data-governance-outcome="${escapeHtml(card.outcome)}"` : ''}>
                        <span>${escapeHtml(card.label)}</span>
                        <strong>${escapeHtml(card.value)}</strong>
                        <small>${escapeHtml(card.detail)}</small>
                    </div>
                `).join('')}
            </div>
            ${renderBakerVoteLedger(track)}
            <div class="chamber-now-watch">
                <div>
                    <span>What to watch next</span>
                    <ul>${watchItems.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
                </div>
                <div class="chamber-now-memory">
                    ${hasActiveTrackPayload(track)
                        ? `<span>How this list is measured</span>
                            <p>Each receipt is a represented L1 baker, even when one assigned voting key submitted the transaction.</p>
                            <p>Yea, Nay, and Pass all count toward Promotion quorum; only Yea and Nay count toward supermajority.</p>
                            <small>Voting power is the matching Tezos L1 governance-period snapshot.</small>`
                        : `<span>Latest baker actions</span>
                            ${actions.length
                                ? actions.map((action) => `<p>${escapeHtml(action)}</p>`).join('')
                                : '<p>No current-period proposal, upvote, or ballot operations are indexed yet.</p>'}`}
                </div>
            </div>
            <div class="etherlink-governance-source-links">
                <a href="${GOVERNANCE_BASE}/${escapeHtml(track.key)}" target="_blank" rel="noopener">Vote on the official portal →</a>
                <a href="${GOVERNANCE_DOCS}" target="_blank" rel="noopener">How L2 governance works →</a>
                <a href="/chamber/">Compare L1 governance →</a>
            </div>
        </section>
    `;
}

function progressWidth(value, required) {
    if (!Number.isFinite(value) || !Number.isFinite(required) || required <= 0) return 0;
    return Math.max(0, Math.min(100, (value / required) * 100));
}

function renderProgress(value, required, label) {
    const met = Number.isFinite(value) && Number.isFinite(required) && value >= required;
    return `
        <div class="etherlink-gov-progress ${met ? 'is-met' : ''}" role="img" aria-label="${escapeHtml(label)} ${formatPercent(value)} of ${formatPercent(required)}">
            <span style="width:${progressWidth(value, required).toFixed(2)}%"></span>
        </div>
    `;
}

function renderEntryMetrics(data) {
    return data.tracks.map((track) => {
        const status = trackStatus(track);
        const last = trackLastActivity(track);
        const value = track.phase === 'proposal' && track.proposal
            ? `${formatPercent(track.proposalProgress)} / ${formatPercent(track.proposalRequired, 0)}`
            : last ? `${formatAge(last.time)}` : track.phase === 'empty' ? 'Idle' : status.label;
        const metric = track.phase === 'promotion' && track.promotion
            ? `<strong class="etherlink-gov-entry-gates"><span class="${track.promotion.participation >= track.promotionRequired ? 'good' : 'watch'}" data-governance-outcome="${track.promotion.participation >= track.promotionRequired ? 'good' : 'watch'}">Quorum ${escapeHtml(formatPercent(track.promotion.participation))} / ${escapeHtml(formatPercent(track.promotionRequired, 0))}</span><span class="${track.promotion.supermajority >= track.supermajorityRequired ? 'good' : promotionCanStillPass(track) ? 'watch' : 'risk'}" data-governance-outcome="${track.promotion.supermajority >= track.supermajorityRequired ? 'good' : promotionCanStillPass(track) ? 'watch' : 'risk'}">Yea ${escapeHtml(formatPercent(track.promotion.supermajority))} / ${escapeHtml(formatPercent(track.supermajorityRequired, 0))}</span></strong>`
            : `<strong>${escapeHtml(value)}</strong>`;
        return `
            <div class="tezlink-entry-metric etherlink-gov-entry-metric ${status.className}" data-governance-outcome="${escapeHtml(status.className)}">
                <span>${escapeHtml(track.label)}</span>
                ${metric}
            </div>
        `;
    }).join('');
}

function renderEntryCard(data) {
    const card = document.getElementById('etherlink-governance-entry-card');
    if (!card) return;
    card.classList.add('etherlink-governance-entry-card');
    const main = topTrack(data);
    const status = trackStatus(main);
    const activeTrack = hasActiveProposalTrack(data);
    const quiet = allTracksQuiet(data);
    let value = main.label;
    if (quiet) {
        value = 'No Proposal';
    } else if (main.phase === 'proposal' && main.proposal) {
        value = status.headline || formatPercent(main.proposalProgress);
    } else if (main.phase === 'promotion' && main.promotion) {
        value = status.headline || formatPercent(main.promotion.participation);
    }
    card.classList.toggle('chamber-entry-live', status.className === 'live' || status.className === 'good');
    card.classList.toggle('chamber-entry-risk', status.className === 'watch' || status.className === 'risk');
    card.classList.toggle('chamber-entry-wide', activeTrack);
    card.dataset.etherlinkGovernanceLive = activeTrack ? 'true' : 'false';
    card.dataset.etherlinkGovernanceState = status.className;
    card.dataset.etherlinkGovernanceSize = activeTrack ? 'wide' : 'compact';
    const valueEl = document.getElementById('etherlink-governance-entry-value');
    const descriptionEl = document.getElementById('etherlink-governance-entry-description');
    const miniEl = document.getElementById('etherlink-governance-entry-mini');
    const metricsEl = document.getElementById('etherlink-governance-entry-metrics');
    if (valueEl) valueEl.textContent = value;
    if (descriptionEl) {
        descriptionEl.textContent = 'L2 Governance · FAST, SLOW, and Sequencer votes';
        if (quiet) {
            descriptionEl.textContent = 'L2 Governance · FAST · SLOW · Sequencer idle';
        } else if (main.phase === 'proposal' && main.proposal) {
            descriptionEl.textContent = `${main.label} ${proposalLabel(main.proposal.winner)}`;
        } else if (main.phase === 'promotion' && main.promotion) {
            descriptionEl.textContent = `${main.label} ${proposalLabel(main.promotion.candidate)}`;
        }
    }
    if (miniEl) {
        miniEl.classList.remove('live', 'watch', 'risk');
        if (status.className === 'live' || status.className === 'good') {
            miniEl.classList.add('live');
        } else if (status.className === 'watch') {
            miniEl.classList.add('watch');
        } else if (status.className === 'risk') {
            miniEl.classList.add('risk');
        }
        const bakerCount = Number(main.bakerVoteCount || 0);
        miniEl.textContent = quiet
            ? 'No active L2 governance proposal · refresh 60s'
            : `L2 Governance · ${main.label}: ${bakerCount ? `${bakerCount} bakers · ` : ''}${status.label}`;
    }
    if (metricsEl) {
        metricsEl.hidden = false;
        metricsEl.classList.toggle('etherlink-gov-idle-preview', quiet);
        metricsEl.innerHTML = renderEntryMetrics(data);
    }
    const updatedAt = data.updatedAt || Date.now();
    card.dataset.updatedLabel = formatFreshnessStamp(updatedAt, { source: 'TzKT' });
    setDataFreshnessState(card, updatedAt, ENTRY_REFRESH_MS * 2);
}

function renderEntryError() {
    const mini = document.getElementById('etherlink-governance-entry-mini');
    const card = document.getElementById('etherlink-governance-entry-card');
    const metricsEl = document.getElementById('etherlink-governance-entry-metrics');
    if (card) {
        card.classList.remove('chamber-entry-wide', 'chamber-entry-live');
        card.classList.add('chamber-entry-risk');
        card.dataset.etherlinkGovernanceLive = 'false';
        card.dataset.etherlinkGovernanceState = 'risk';
        card.dataset.etherlinkGovernanceSize = 'compact';
    }
    if (metricsEl) {
        metricsEl.hidden = true;
        metricsEl.innerHTML = '';
    }
    if (mini) {
        mini.classList.remove('live', 'watch');
        mini.classList.add('risk');
        mini.textContent = 'Tezos X governance data delayed';
    }
}

function renderTab(track) {
    const status = trackStatus(track);
    const isActive = track.key === activeTrackKey;
    return `
        <button type="button" id="etherlink-gov-tab-${escapeHtml(track.key)}" role="tab" aria-selected="${isActive ? 'true' : 'false'}" aria-controls="etherlink-gov-track-panel" tabindex="${isActive ? '0' : '-1'}" class="etherlink-gov-tab ${isActive ? 'active' : ''}" data-etherlink-track="${escapeHtml(track.key)}">
            <span>${escapeHtml(track.label)}</span>
            <strong class="${escapeHtml(status.className)}">${escapeHtml(status.label)}</strong>
        </button>
    `;
}

function renderProposalPanel(track) {
    const proposal = track.proposal;
    if (!proposal) return '';
    const knownHref = proposalHref(proposal.winner);
    const proposalProgress = track.proposalProgress;
    const proposalRows = proposal.proposalRows.slice(0, 4).map((row) => `
        <div class="lb-table-row etherlink-gov-proposal-row">
            <span>${escapeHtml(proposalLabel(row.hash))}</span>
            <code>${escapeHtml(compactHash(row.hash))}</code>
            <strong>${escapeHtml(formatXTZ(row.upvotes))}</strong>
        </div>
    `).join('');
    const upvoters = proposal.upvoters.slice(-12).reverse().map((voter) => `
        <a class="lb-table-row etherlink-gov-voter-row" href="#baker=${escapeHtml(voter.address)}">
            <span>${escapeHtml(voter.alias || voter.address)}</span>
            <code>${escapeHtml(voter.address)}</code>
            <strong>${escapeHtml(String(voter.firstLevel || '--'))}</strong>
        </a>
    `).join('');

    return `
        <section class="lb-panel etherlink-gov-panel chamber-anim-fade">
            <div class="lb-panel-header">
                <div>
                    <span class="lb-panel-kicker">Proposal period</span>
                    <h3>${escapeHtml(proposalLabel(proposal.winner))}</h3>
                </div>
                ${knownHref ? `<a class="lb-live-pill" href="${escapeHtml(knownHref)}" target="_blank" rel="noopener">Proposal notes</a>` : ''}
            </div>
            <div class="etherlink-gov-proposal-hash">${escapeHtml(proposal.winner || 'Unknown proposal')}</div>
            <div class="etherlink-gov-threshold-row">
                <span>${escapeHtml(formatXTZ(proposal.maxUpvotes))} upvotes</span>
                <strong>${escapeHtml(formatPercent(proposalProgress))} / ${escapeHtml(formatPercent(track.proposalRequired, 0))} required</strong>
            </div>
            ${renderProgress(proposalProgress, track.proposalRequired, 'Proposal quorum')}
            <div class="lb-table etherlink-gov-table">
                <div class="lb-table-head etherlink-gov-proposal-row">
                    <span>Known proposal</span><span>Payload</span><span>Upvotes</span>
                </div>
                <div>${proposalRows || '<div class="lb-empty">No proposal rows available.</div>'}</div>
            </div>
            <div class="lb-table etherlink-gov-table">
                <div class="lb-table-head etherlink-gov-voter-row">
                    <span>Recent upvoter</span><span>Address</span><span>Level</span>
                </div>
                <div>${upvoters || '<div class="lb-empty">No upvoters indexed yet.</div>'}</div>
            </div>
        </section>
    `;
}

function renderPromotionPanel(track) {
    const promotion = track.promotion;
    if (!promotion) return '';
    return `
        <section class="lb-panel etherlink-gov-panel chamber-anim-fade">
            <div class="lb-panel-header">
                <div>
                    <span class="lb-panel-kicker">Promotion vote</span>
                    <h3>${escapeHtml(proposalLabel(promotion.candidate))}</h3>
                </div>
                <span class="lb-live-pill">${escapeHtml(track.quorumLabel)}</span>
            </div>
            <div class="etherlink-gov-vote-grid">
                <div><span>Yea</span><strong>${escapeHtml(formatXTZ(promotion.yea))}</strong></div>
                <div><span>Nay</span><strong>${escapeHtml(formatXTZ(promotion.nay))}</strong></div>
                <div><span>Pass</span><strong>${escapeHtml(formatXTZ(promotion.pass))}</strong></div>
            </div>
            <div class="etherlink-gov-threshold-row">
                <span>Quorum</span>
                <strong>${escapeHtml(formatPercent(promotion.participation))} / ${escapeHtml(formatPercent(track.promotionRequired, 0))}</strong>
            </div>
            ${renderProgress(promotion.participation, track.promotionRequired, 'Promotion quorum')}
            <div class="etherlink-gov-threshold-row">
                <span>Supermajority</span>
                <strong>${escapeHtml(formatPercent(promotion.supermajority))} / ${escapeHtml(formatPercent(track.supermajorityRequired, 0))}</strong>
            </div>
            ${renderProgress(promotion.supermajority, track.supermajorityRequired, 'Promotion supermajority')}
        </section>
    `;
}

function renderEmptyPanel(track) {
    if (track.phase !== 'empty') return '';
    const last = track.historicalProposals?.[0] || null;
    return `
        <section class="lb-panel etherlink-gov-panel chamber-anim-fade">
            <div class="lb-panel-header">
                <div>
                    <span class="lb-panel-kicker">Quiet period</span>
                    <h3>No active ${escapeHtml(track.label)} proposal</h3>
                </div>
                <a class="lb-live-pill" href="${GOVERNANCE_BASE}/${escapeHtml(track.key)}" target="_blank" rel="noopener">Official track</a>
            </div>
            <p class="lb-copy">The contract is in its proposal window, but TzKT storage does not currently show a known proposal or promotion payload for this track.${last ? ` Latest indexed proposal: ${escapeHtml(proposalLabel(last.payload))}.` : ''}</p>
        </section>
    `;
}

function renderHistoricalProposals(track) {
    const rows = (track.historicalProposals || []).slice(0, HISTORICAL_PROPOSALS_PER_TRACK).map((proposal) => {
        const knownHref = proposalHref(proposal.payload);
        const title = proposalLabel(proposal.payload);
        const proposalCell = knownHref
            ? `<a href="${escapeHtml(knownHref)}" target="_blank" rel="noopener">${escapeHtml(title)}</a>`
            : `<span>${escapeHtml(title)}</span>`;
        return `
            <div class="lb-table-row etherlink-gov-history-row" data-etherlink-proposal-op="${escapeHtml(proposal.hash)}">
                <div class="etherlink-gov-history-main">${proposalCell}<code>${escapeHtml(compactHash(proposal.payload || proposal.key))}</code></div>
                <span>${escapeHtml(formatDate(proposal.time))}</span>
                <strong>${escapeHtml(proposal.sender?.alias || proposal.sender?.address || 'sender')}</strong>
            </div>
        `;
    }).join('');

    return `
        <section class="lb-panel etherlink-gov-panel etherlink-gov-history-panel chamber-anim-fade" style="animation-delay:90ms">
            <div class="lb-panel-header">
                <div>
                    <span class="lb-panel-kicker">Historical proposals</span>
                    <h3>Recent ${escapeHtml(track.label)} submissions</h3>
                </div>
                <span class="lb-live-pill">${track.historyReady ? `${escapeHtml(String((track.historicalProposals || []).length))} indexed` : 'loading history'}</span>
            </div>
            <div class="lb-table etherlink-gov-table">
                <div class="lb-table-head etherlink-gov-history-row">
                    <span>Proposal</span><span>Submitted</span><span>Sender</span>
                </div>
                <div>${rows || (track.historyReady
                    ? '<div class="lb-empty">No historical proposal submissions found in the indexed TzKT sample.</div>'
                    : '<div class="lb-empty">Loading proposal history in the background. Current vote data above is already live.</div>')}</div>
            </div>
        </section>
    `;
}

function renderTrackRules(track) {
    return `
        <section class="lb-panel etherlink-gov-panel etherlink-gov-rules-panel chamber-anim-fade" id="etherlink-gov-rules" style="animation-delay:40ms">
            <div class="lb-panel-header">
                <div>
                    <span class="lb-panel-kicker">Track rules</span>
                    <h3>${escapeHtml(track.label)} thresholds</h3>
                </div>
                <span class="lb-live-pill">${escapeHtml(track.source || 'storage')}</span>
            </div>
            <div class="lb-metric-grid health-metric-grid">
                <div><span>Proposal quorum</span><strong>${escapeHtml(formatPercent(track.proposalRequired, 0))}</strong></div>
                <div><span>Promotion quorum</span><strong>${escapeHtml(formatPercent(track.promotionRequired, 0))}</strong></div>
                <div><span>Supermajority</span><strong>${escapeHtml(formatPercent(track.supermajorityRequired, 0))}</strong></div>
                <div><span>Period length</span><strong>${escapeHtml(formatDurationFromBlocks(Number(track.config?.period_length)))}</strong></div>
            </div>
            <div class="health-timing-note">Contract ${escapeHtml(track.contract || 'not discovered')} · last winner ${escapeHtml(proposalLabel(track.storage?.last_winner || track.config?.last_winner || ''))}</div>
        </section>
    `;
}

function renderTrackMemory(track) {
    const last = trackLastActivity(track);
    const latestProposal = track.historicalProposals?.[0] || null;
    return `
        <section class="lb-panel etherlink-gov-panel etherlink-gov-memory-panel chamber-anim-fade" id="etherlink-gov-memory" style="animation-delay:70ms">
            <div class="lb-panel-header">
                <div>
                    <span class="lb-panel-kicker">Track memory</span>
                    <h3>${last ? escapeHtml(last.label) : `No indexed ${escapeHtml(track.label)} activity yet`}</h3>
                </div>
                ${last?.href ? `<a class="lb-live-pill" href="${escapeHtml(last.href)}" target="_blank" rel="noopener">Open op</a>` : ''}
            </div>
            <div class="lb-metric-grid health-metric-grid">
                <div><span>Last activity</span><strong>${last ? escapeHtml(formatAge(last.time)) : '--'}</strong></div>
                <div><span>Last proposal</span><strong>${latestProposal ? escapeHtml(proposalLabel(latestProposal.payload)) : '--'}</strong></div>
                <div><span>Current phase</span><strong>${escapeHtml(track.phase || 'unknown')}</strong></div>
            </div>
            <div class="health-timing-note">Idle tracks still show their rules and last indexed proposal so quiet does not read as dead.</div>
        </section>
    `;
}

function renderMergedTimeline(track) {
    const rows = [
        ...(track.historicalProposals || []).map((proposal) => ({
            kind: 'submission',
            label: proposalLabel(proposal.payload),
            time: proposal.time,
            actor: proposal.sender?.alias || proposal.sender?.address || 'sender',
            href: proposal.hash ? `https://tzkt.io/${proposal.hash}` : ''
        })),
        ...(track.activity || []).map((op) => ({
            kind: op.entrypoint?.replace(/_/g, ' ') || 'call',
            label: proposalLabel(op.value) || op.entrypoint || 'contract call',
            time: op.time,
            actor: op.sender?.alias || op.sender?.address || 'sender',
            href: op.hash ? `https://tzkt.io/${op.hash}` : ''
        }))
    ].filter((row) => row.time).sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 10);
    const body = rows.length ? rows.map((row) => `
        <a class="lb-table-row etherlink-gov-timeline-row" href="${escapeHtml(row.href || `${GOVERNANCE_BASE}/${track.key}`)}" target="_blank" rel="noopener">
            <span>${escapeHtml(row.kind)}</span>
            <span>${escapeHtml(row.label)}</span>
            <strong>${escapeHtml(formatAge(row.time))}</strong>
            <code>${escapeHtml(row.actor)}</code>
        </a>
    `).join('') : '<div class="lb-empty">No merged timeline entries in the indexed sample.</div>';
    return `
        <section class="lb-panel etherlink-gov-panel etherlink-gov-timeline-panel chamber-anim-fade" id="etherlink-gov-timeline" style="animation-delay:140ms">
            <div class="lb-panel-header">
                <div>
                    <span class="lb-panel-kicker">Live action log</span>
                    <h3>Newest baker and contract actions first</h3>
                </div>
                <span class="lb-live-pill">${escapeHtml(String(rows.length))} rows</span>
            </div>
            <div class="lb-table etherlink-gov-table">
                <div class="lb-table-head etherlink-gov-timeline-row">
                    <span>Step</span><span>Payload</span><span>When</span><span>Actor</span>
                </div>
                <div>${body}</div>
            </div>
        </section>
    `;
}

function renderActivity(track) {
    const rows = track.activity.slice(0, 8).map((op) => `
        <a class="lb-table-row etherlink-gov-activity-row" href="https://tzkt.io/${escapeHtml(op.hash)}" target="_blank" rel="noopener">
            <span>${escapeHtml(op.entrypoint.replace(/_/g, ' '))}</span>
            <code>${escapeHtml(op.sender?.alias || op.sender?.address || 'sender')}</code>
            <strong>${escapeHtml(formatAge(op.time))}</strong>
        </a>
    `).join('');
    return `
        <section class="lb-panel etherlink-gov-panel chamber-anim-fade" style="animation-delay:120ms">
            <div class="lb-panel-header">
                <div>
                    <span class="lb-panel-kicker">On-chain activity</span>
                    <h3>Recent contract calls</h3>
                </div>
                <a class="lb-live-pill" href="https://tzkt.io/${escapeHtml(track.contract)}/operations/" target="_blank" rel="noopener">TzKT ops</a>
            </div>
            <div class="lb-table etherlink-gov-table">
                <div class="lb-table-head etherlink-gov-activity-row">
                    <span>Entrypoint</span><span>Sender</span><span>When</span>
                </div>
                <div>${rows || '<div class="lb-empty">No contract calls in this period yet.</div>'}</div>
            </div>
        </section>
    `;
}

function renderTrackPanel(track) {
    const status = trackStatus(track);
    if (track.phase === 'error') {
        return `
            <section class="lb-panel etherlink-gov-panel" id="etherlink-gov-track-panel" role="tabpanel" aria-labelledby="etherlink-gov-tab-${escapeHtml(track.key)}" tabindex="0" data-track="${escapeHtml(track.key)}">
                <div class="lb-error"><strong>${escapeHtml(track.label)} unavailable.</strong> ${escapeHtml(track.error)}</div>
            </section>
        `;
    }

    return `
        <div class="etherlink-gov-track-panel" id="etherlink-gov-track-panel" role="tabpanel" aria-labelledby="etherlink-gov-tab-${escapeHtml(track.key)}" tabindex="0" data-track="${escapeHtml(track.key)}">
            ${renderL2GovernancePhaseHero(track)}
            ${renderL2GovernanceNow(track)}
            <section class="lb-explainer etherlink-gov-explainer chamber-anim-fade">
                <div class="lb-explainer-main">
                    <div class="lb-explainer-kicker">${escapeHtml(track.label)} track</div>
                    <p><strong>${escapeHtml(status.label)}</strong> ${escapeHtml(track.description)}</p>
                </div>
                <div class="lb-explainer-facts" aria-label="${escapeHtml(track.label)} period facts">
                    <span><strong>Period</strong> #${escapeHtml(String(track.period?.index ?? '--'))}</span>
                    <span><strong>Ends</strong> ${escapeHtml(trackCountdown(track))}</span>
                    <span><strong>Blocks</strong> ${escapeHtml(String(track.period?.startLevel ?? '--'))} → ${escapeHtml(String(track.period?.endLevel ?? '--'))}</span>
                </div>
            </section>
            <div class="lb-dashboard-grid etherlink-gov-dashboard-grid">
                ${renderTrackRules(track)}
                ${renderTrackMemory(track)}
                ${renderProposalPanel(track)}
                ${renderPromotionPanel(track)}
                ${renderEmptyPanel(track)}
                ${renderMergedTimeline(track)}
                ${renderHistoricalProposals(track)}
            </div>
        </div>
    `;
}

function renderChamber(data, container, { quiet = false } = {}) {
    const track = data.tracks.find((item) => item.key === activeTrackKey) || data.tracks[0];
    const status = trackStatus(track);
    const html = `
        <div class="chamber-header lb-header etherlink-gov-header chamber-anim-fade">
            <div class="lb-system-strip">
                <span class="lb-system-brand">Tezos.Systems</span>
                <span>L2 Governance</span>
                <span>TzKT-discovered read-only mirror</span>
            </div>
            <div class="chamber-title-row">
                <h2 class="chamber-title" id="etherlink-governance-title">Tezos X Governance</h2>
                <span class="chamber-badge ${escapeHtml(status.className)}">${escapeHtml(status.label)}</span>
                <span class="lb-live-pill lb-refresh-pill" id="etherlink-governance-refresh-state">auto-refresh ${Math.round(getChamberRefreshMs() / 1000)}s</span>
            </div>
            <div class="chamber-proposal-info">
                <div class="proposal-name">${escapeHtml(track.label)} #${escapeHtml(String(track.period?.index ?? '--'))}</div>
                <div class="proposal-hash">Contract ${escapeHtml(track.contract || 'discovery unavailable')} · head ${escapeHtml(String(data.headLevel || '--'))} · updated ${escapeHtml(formatDate(data.updatedAt))}</div>
            </div>
        </div>
        <div class="etherlink-gov-tabs" role="tablist" aria-label="Tezos X governance tracks">
            ${data.tracks.map(renderTab).join('')}
        </div>
        ${renderTrackPanel(track)}
        <div class="chamber-footer chamber-anim-fade" style="animation-delay:220ms">
            <a href="${GOVERNANCE_BASE}/${escapeHtml(track.key)}" target="_blank" rel="noopener">Official ${escapeHtml(track.label)} track →</a>
            <span class="chamber-footer-sep">·</span>
            ${track.contract ? `<a href="https://tzkt.io/${escapeHtml(track.contract)}/storage/" target="_blank" rel="noopener">TzKT storage →</a>` : '<span>TzKT discovery unavailable</span>'}
            <span class="chamber-footer-sep">·</span>
            <a class="panel-direct-link" href="/l2chamber/" aria-label="Direct link to Tezos X Governance Chamber">Direct: /l2chamber/</a>
        </div>
    `;
    lastRenderedChamberData = data;
    if (quiet) quietlySyncHtml(container, html);
    else container.innerHTML = html;
    if (container.dataset.etherlinkChamberWired !== 'true') {
        container.dataset.etherlinkChamberWired = 'true';
        container.addEventListener('click', (event) => {
            const button = event.target.closest('[data-etherlink-track]');
            if (button && container.contains(button)) {
                activeTrackKey = button.dataset.etherlinkTrack || 'fast';
                selectActiveTrackOnNextRender = false;
                if (lastRenderedChamberData) renderChamber(lastRenderedChamberData, container, { quiet: true });
                return;
            }
            const voterLink = event.target.closest('.etherlink-gov-voter-row[href^="#baker="], .etherlink-gov-voter-link[href^="#baker="]');
            if (voterLink && container.contains(voterLink)) closeEtherlinkGovernanceChamber();
        });
        container.addEventListener('keydown', (event) => {
            const tab = event.target.closest('[role="tab"][data-etherlink-track]');
            if (!tab || !container.contains(tab) || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            const tracks = (lastRenderedChamberData?.tracks || [])
                .map((item) => item.key)
                .filter(Boolean);
            const index = tracks.indexOf(tab.dataset.etherlinkTrack);
            if (index < 0 || !tracks.length) return;
            event.preventDefault();
            let next = index;
            if (event.key === 'ArrowLeft') next = (index - 1 + tracks.length) % tracks.length;
            if (event.key === 'ArrowRight') next = (index + 1) % tracks.length;
            if (event.key === 'Home') next = 0;
            if (event.key === 'End') next = tracks.length - 1;
            activeTrackKey = tracks[next];
            selectActiveTrackOnNextRender = false;
            if (lastRenderedChamberData) renderChamber(lastRenderedChamberData, container, { quiet: true });
            document.getElementById(`etherlink-gov-tab-${activeTrackKey}`)?.focus({ preventScroll: true });
        });
    }
}

async function refreshEntryCard({ force = false } = {}) {
    try {
        const data = await fetchEtherlinkGovernanceData({ force });
        renderEntryCard(data);
        dispatchEtherlinkGovernanceHotSignal(data);
        void hydrateHistoricalProposals(data);
        return true;
    } catch (error) {
        renderEntryError();
        return false;
    }
}

function scheduleEntryRefresh(delay) {
    if (entryTimer) window.clearTimeout(entryTimer);
    entryTimer = window.setTimeout(() => runEntryRefresh(), delay);
}

async function runEntryRefresh(force = false) {
    if (document.hidden) {
        scheduleEntryRefresh(ENTRY_REFRESH_MS);
        return;
    }
    const succeeded = await refreshEntryCard({ force });
    if (succeeded) {
        entryFailureCount = 0;
        scheduleEntryRefresh(ENTRY_REFRESH_MS);
        return;
    }
    entryFailureCount += 1;
    const delay = Math.min(ENTRY_REFRESH_MS * (2 ** Math.max(0, entryFailureCount - 1)), ENTRY_MAX_BACKOFF_MS);
    // The entry card already renders an unavailable state; retry quietly with bounded backoff.
    scheduleEntryRefresh(delay);
}

function startEntryRefresh() {
    if (!entryTimer) void runEntryRefresh(true);
    if (entryVisibilityWired) return;
    entryVisibilityWired = true;
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) void runEntryRefresh(true);
    });
}

function lockPageScroll() {
    if (savedBodyOverflow !== null) return;
    savedBodyOverflow = document.body.style.overflow;
    savedHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
}

function unlockPageScroll() {
    if (savedBodyOverflow === null) return;
    document.body.style.overflow = savedBodyOverflow || '';
    document.documentElement.style.overflow = savedHtmlOverflow || '';
    savedBodyOverflow = null;
    savedHtmlOverflow = null;
}

function stopChamberRefresh() {
    if (chamberTimer) {
        window.clearInterval(chamberTimer);
        chamberTimer = null;
    }
}

async function refreshChamber({ force = false } = {}) {
    const overlay = document.getElementById('etherlink-governance-modal');
    const body = document.getElementById('etherlink-governance-body');
    if (!overlay?.classList.contains('active') || !body || chamberInFlight) return;
    chamberInFlight = true;
    try {
        let data = await fetchEtherlinkGovernanceData({ force });
        data = await hydrateBakerVoteLedgers(data, { force });
        const selectedTrack = data.tracks.find((track) => track.key === activeTrackKey);
        if (
            selectActiveTrackOnNextRender
            || (!hasActiveTrackPayload(selectedTrack) && hasActiveProposalTrack(data))
        ) {
            activeTrackKey = topTrack(data)?.key || activeTrackKey;
            selectActiveTrackOnNextRender = false;
        }
        if (overlay.classList.contains('active')) renderChamber(data, body, { quiet: body.dataset.rendered === 'true' });
        dispatchEtherlinkGovernanceHotSignal(data);
        const currentUpdatedAt = data.updatedAt;
        void hydrateHistoricalProposals(data).then((enriched) => {
            if (
                enriched?.historyReady
                && enriched.updatedAt === currentUpdatedAt
                && overlay.classList.contains('active')
            ) {
                renderChamber(enriched, body, { quiet: true });
            }
        });
    } catch (error) {
        console.warn('Tezos X governance chamber refresh failed:', error);
        if (!body.dataset.rendered) {
            body.innerHTML = `
                <div class="chamber-error">
                    <div class="error-icon">!</div>
                    <div class="error-title">Could not reach Tezos X governance data</div>
                    <div class="error-detail">The request timed out or one of the indexed governance sources is delayed. Try again in a moment.</div>
                    <button class="chamber-retry-btn" id="etherlink-governance-retry">Retry</button>
                </div>
            `;
            body.querySelector('#etherlink-governance-retry')?.addEventListener('click', async (event) => {
                const button = event.currentTarget;
                button.disabled = true;
                button.textContent = 'Retrying…';
                await refreshChamber({ force: true });
                if (button.isConnected) {
                    button.disabled = false;
                    button.textContent = 'Retry';
                }
            });
        }
    } finally {
        body.dataset.rendered = 'true';
        chamberInFlight = false;
        const state = document.getElementById('etherlink-governance-refresh-state');
        if (state) state.textContent = `auto-refresh ${Math.round(getChamberRefreshMs() / 1000)}s`;
    }
}

export async function openEtherlinkGovernanceChamber(trackKey = '', { isCurrent = () => true } = {}) {
    if (!isCurrent()) return;
    bindChamberVisibility('etherlink-governance-modal', () => refreshChamber({ force: true }));
    if (trackKey && TRACK_TEMPLATES.some((track) => track.key === trackKey)) {
        activeTrackKey = trackKey;
        selectActiveTrackOnNextRender = false;
    } else {
        selectActiveTrackOnNextRender = true;
    }
    let overlay = document.getElementById('etherlink-governance-modal');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'etherlink-governance-modal';
        overlay.className = 'modal-overlay chamber-overlay lb-overlay etherlink-gov-overlay';
        overlay.setAttribute('aria-hidden', 'true');
        overlay.innerHTML = `
            <div class="modal-content modal-large chamber-content lb-content etherlink-gov-content" role="dialog" aria-modal="true" aria-labelledby="etherlink-governance-title">
                <button class="modal-close chamber-close" type="button" aria-label="Close Tezos X Governance Chamber">&times;</button>
                <div class="chamber-body lb-body etherlink-gov-body" id="etherlink-governance-body">
                    <div class="chamber-loading">
                        <div class="chamber-loading-text">Opening Tezos X Governance Chamber...</div>
                        <div class="chamber-loading-bar"><div class="chamber-loading-fill"></div></div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        overlay.querySelector('.chamber-close')?.addEventListener('click', closeEtherlinkGovernanceChamber);
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) closeEtherlinkGovernanceChamber();
        });
    }

    lockPageScroll();
    overlay.classList.add('active');
    activateChamberDialog(overlay, {
        close: closeEtherlinkGovernanceChamber,
        dialogSelector: '.etherlink-gov-content',
        titleId: 'etherlink-governance-title',
        label: 'Tezos X Governance Chamber'
    });
    const content = overlay.querySelector('.etherlink-gov-content');
    if (content) content.scrollTop = 0;
    await refreshChamber({ force: true });
    if (!isCurrent() || !overlay.classList.contains('active')) return;
    stopChamberRefresh();
    chamberTimer = window.setInterval(() => {
        if (document.visibilityState === 'visible') refreshChamber();
    }, getChamberRefreshMs());
}

export function closeEtherlinkGovernanceChamber() {
    const overlay = document.getElementById('etherlink-governance-modal');
    if (!requestChamberClose(overlay)) return;
    stopChamberRefresh();
    if (overlay) {
        overlay.classList.remove('active');
        deactivateChamberDialog(overlay);
    }
    unlockPageScroll();
}

export function initEtherlinkGovernanceChamber() {
    if (document.getElementById('etherlink-governance-entry-card')) {
        wireChamberLauncher(document.getElementById('etherlink-governance-entry-card'), {
            open: openEtherlinkGovernanceChamber,
            label: 'Open Tezos X Governance Chamber',
            titleSelector: '#etherlink-governance-entry-title, .stat-label'
        });
        startEntryRefresh();
        return;
    }

    const grid = document.getElementById('chambers-grid') || document.getElementById('governance-section')?.querySelector('.stats-grid');
    if (!grid) return;

    const card = document.createElement('div');
    card.id = 'etherlink-governance-entry-card';
    card.className = 'stat-card chamber-entry-card etherlink-governance-entry-card';
    card.innerHTML = `
        <button class="card-copy-link" type="button" data-copy-hash="#l2chamber" aria-label="Copy Tezos X Governance L2 direct link" title="Copy Tezos X Governance L2 link">🔗</button>
        <div class="card-inner">
            <div class="card-front chamber-entry-front etherlink-governance-entry-front">
                <div class="tezlink-entry-main">
                    <h2 class="stat-label" id="etherlink-governance-entry-title">Tezos X Governance</h2>
                    <div class="stat-value etherlink-gov-entry-value" id="etherlink-governance-entry-value"><span class="loading loading-skeleton">Preheating L2 governance</span></div>
                    <p class="stat-description" id="etherlink-governance-entry-description">L2 Governance · FAST, SLOW, and Sequencer votes</p>
                    <div class="chamber-entry-status live" id="etherlink-governance-entry-mini">L2 Governance · warming proposal tracks</div>
                </div>
                <div class="tezlink-entry-metrics etherlink-gov-entry-metrics" id="etherlink-governance-entry-metrics" aria-label="Tezos X governance proposal status" hidden></div>
            </div>
        </div>
    `;

    const tezlinkCard = document.getElementById('tezlink-entry-card');
    if (tezlinkCard?.parentElement === grid) {
        tezlinkCard.after(card);
    } else {
        grid.prepend(card);
    }

    wireChamberLauncher(card, {
        open: openEtherlinkGovernanceChamber,
        label: 'Open Tezos X Governance Chamber',
        titleSelector: '#etherlink-governance-entry-title'
    });

    startEntryRefresh();
}
