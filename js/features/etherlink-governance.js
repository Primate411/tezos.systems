/**
 * Tezlink Governance Chamber
 * Read-only FAST / SLOW / Sequencer governance surface backed by TzKT storage.
 */

import { API_URLS } from '../core/config.js';
import { escapeHtml } from '../core/utils.js';

const TZKT = API_URLS.tzkt;
const BLOCK_SECONDS = 6;
const ENTRY_REFRESH_MS = 60 * 1000;
const CHAMBER_REFRESH_MS = 60 * 1000;
const CACHE_TTL = 45 * 1000;
const GOVERNANCE_BASE = 'https://governance.etherlink.com/governance';
const GOVERNANCE_CONTRACT_CREATOR = 'tz1VGpuq8GkCwf4x6MupTz6QAcJLivQcaAsb';
const HISTORICAL_PROPOSAL_SCAN_LIMIT = 32;
const HISTORICAL_PROPOSALS_PER_TRACK = 4;
const GOVERNANCE_HISTORY_CODE_HASHES = [
    1029816579,
    2062495254,
    -322739163,
    368151125
];
const GOVERNANCE_HISTORY_CODE_HASH_TRACKS = new Map([
    ['1029816579', ['fast']],
    ['2062495254', ['fast', 'slow']],
    ['-322739163', ['fast', 'slow']],
    ['368151125', ['sequencer']]
]);

const TRACK_TEMPLATES = [
    {
        key: 'fast',
        label: 'FAST',
        description: 'Kernel hotfix and fast-track Tezlink governance.',
        quorumLabel: '15% promotion quorum'
    },
    {
        key: 'slow',
        label: 'SLOW',
        description: 'Longer-window kernel governance for standard upgrades.',
        quorumLabel: '5% promotion quorum'
    },
    {
        key: 'sequencer',
        label: 'SEQUENCER',
        description: 'Sequencer pool and public-key governance.',
        quorumLabel: '8% promotion quorum'
    }
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
let activeTrackKey = 'fast';
let entryTimer = null;
let chamberTimer = null;
let chamberInFlight = false;
let savedBodyOverflow = null;
let savedHtmlOverflow = null;
const targetTrackCache = new Map();

function isAbortableTarget(target) {
    return Boolean(target?.closest('button, a, .card-info-btn, .card-tooltip'));
}

async function fetchJson(url) {
    const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        cache: 'no-store'
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

function delay(ms) {
    return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

async function fetchJsonWithRetry(url, attempts = 2) {
    let lastError = null;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
            return await fetchJson(url);
        } catch (error) {
            lastError = error;
            if (!String(error?.message || '').includes('HTTP 429') || attempt === attempts - 1) {
                throw error;
            }
            await delay(350 * (attempt + 1));
        }
    }
    throw lastError;
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

function formatPercent(value, decimals = 1) {
    if (!Number.isFinite(value)) return '--';
    return `${value.toFixed(decimals)}%`;
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
    return date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
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
    if (blocks <= 0) return 'rolling over now';
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
    const index = Number.isFinite(storageIndex) ? storageIndex : computedIndex;
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
    const config = storage?.config || {};
    const proposalQuorum = toNumber(config.proposal_quorum);
    const promotionQuorum = toNumber(config.promotion_quorum);
    const supermajority = toNumber(config.promotion_supermajority);
    if (!proposalQuorum || !promotionQuorum || !supermajority) return '';
    if (proposalQuorum === 5 && promotionQuorum === 15) return 'fast';
    if (promotionQuorum === 5) return 'slow';
    if (promotionQuorum === 8) return 'sequencer';
    return '';
}

async function discoverGovernanceTracks() {
    const candidates = await fetchJson(`${TZKT}/contracts?creator=${GOVERNANCE_CONTRACT_CREATOR}&limit=16&sort.desc=firstActivity`);
    const byTrack = new Map();
    const contracts = candidates.filter((contract) => contract?.kind === 'smart_contract' && contract?.address);
    for (const contract of contracts) {
        try {
            const storage = await fetchJsonWithRetry(`${TZKT}/contracts/${contract.address}/storage`, 3);
            const key = classifyTrackKey(storage);
            if (!key) continue;
            targetTrackCache.set(contract.address, key);
            const existing = byTrack.get(key);
            if (!existing || startedAtLevel(storage) > startedAtLevel(existing.storage)) {
                byTrack.set(key, { key, contract, storage });
            }
        } catch (_) {
            // Discovery is best-effort: fallback tracks make the delay visible without breaking the modal.
        }
    }

    return TRACK_TEMPLATES.map((template) => {
        const found = byTrack.get(template.key);
        return {
            ...template,
            contract: found?.contract?.address || '',
            storage: found?.storage || null,
            discoveredAtLevel: startedAtLevel(found?.storage),
            source: found ? 'tzkt-discovery' : 'missing'
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
    const unique = [...new Set(addresses.filter(Boolean))].slice(0, 50);
    if (!unique.length) return new Map();
    const rows = await fetchJson(`${TZKT}/accounts?address.in=${unique.join(',')}&select=address,alias`);
    return new Map(rows.map((account) => [account.address, account.alias || '']));
}

async function fetchBigmapKeys(ptr, params = '') {
    if (!ptr) return [];
    const suffix = params ? `?${params}` : '';
    return fetchJson(`${TZKT}/bigmaps/${ptr}/keys${suffix}`);
}

async function fetchActivity(track, period) {
    if (!track.contract) return [];
    const url = `${TZKT}/operations/transactions?target=${track.contract}&level.ge=${period.startLevel}&level.le=${period.endLevel}&limit=25&sort.desc=level`;
    const rows = await fetchJson(url);
    return rows
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
    const url = `${TZKT}/operations/transactions?targetCodeHash.in=${GOVERNANCE_HISTORY_CODE_HASHES.join(',')}&entrypoint=new_proposal&limit=${HISTORICAL_PROPOSAL_SCAN_LIMIT}&sort.desc=level`;
    const rows = await fetchJson(url);
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

async function enrichUpvoters(keys) {
    const rows = keys.map((key) => ({
        address: key.key?.key_hash || key.key || '',
        firstLevel: key.firstLevel,
        proposal: key.key?.bytes || null
    })).filter((row) => row.address);
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
        fetchBigmapKeys(proposal.upvoters_proposals, 'limit=100')
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
        participation: bigPercent(totalCast, totalVotingPower),
        supermajority
    };
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
        error: error?.message || 'unavailable'
    };
}

async function fetchEtherlinkGovernanceData({ force = false } = {}) {
    if (!force && cachedData && Date.now() - cachedAt < CACHE_TTL) return cachedData;
    if (dataInFlight) return dataInFlight;
    dataInFlight = (async () => {
        const headRows = await fetchJson(`${TZKT}/blocks?limit=1&sort.desc=level`);
        const head = Array.isArray(headRows) ? headRows[0] : headRows;
        const headLevel = Number(head?.level) || 0;
        const trackTemplates = await discoverGovernanceTracks();
        const historicalResult = await Promise.allSettled([fetchHistoricalProposalMap()]);
        const historicalProposals = historicalResult[0]?.status === 'fulfilled'
            ? historicalResult[0].value
            : new Map();
        const trackResults = await Promise.allSettled(trackTemplates.map((track) => (
            fetchTrack(track, headLevel, historicalProposals.get(track.key) || [])
        )));
        const tracks = trackResults.map((result, index) => (
            result.status === 'fulfilled' ? result.value : fallbackTrack(trackTemplates[index], result.reason)
        ));

        cachedData = {
            head,
            headLevel,
            updatedAt: Date.now(),
            tracks
        };
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
        return { label: met ? 'Proposal quorum met' : 'Proposal live', className: met ? 'good' : 'live' };
    }
    if (track.phase === 'promotion' && track.promotion) {
        const quorumMet = Number.isFinite(track.promotion.participation) && track.promotion.participation >= track.promotionRequired;
        const yayMet = Number.isFinite(track.promotion.supermajority) && track.promotion.supermajority >= track.supermajorityRequired;
        return { label: quorumMet && yayMet ? 'Promotion passing' : 'Promotion live', className: quorumMet && yayMet ? 'good' : 'risk' };
    }
    if (track.phase === 'empty' || !hasActiveTrackPayload(track)) return { label: 'No active proposal', className: 'muted' };
    return { label: 'Active period', className: 'live' };
}

function topTrack(data) {
    return data.tracks.find((track) => track.phase === 'proposal' && track.proposal && hasActiveTrackPayload(track))
        || data.tracks.find((track) => track.phase === 'promotion' && track.promotion && hasActiveTrackPayload(track))
        || data.tracks[0];
}

function hasActiveTrackPayload(track) {
    return Boolean(
        (track.phase === 'proposal' && track.proposal)
        || (track.phase === 'promotion' && track.promotion)
    );
}

function hasActiveProposalTrack(data) {
    return data.tracks.some(hasActiveTrackPayload);
}

function allTracksQuiet(data) {
    return data.tracks.every((track) => track.phase !== 'error' && !hasActiveTrackPayload(track));
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
        const value = track.phase === 'proposal' && track.proposal
            ? `${formatPercent(track.proposalProgress)} / ${formatPercent(track.proposalRequired, 0)}`
            : track.phase === 'promotion' && track.promotion
                ? `${formatPercent(track.promotion.participation)} / ${formatPercent(track.promotionRequired, 0)}`
                : status.label;
        return `
            <div class="tezlink-entry-metric etherlink-gov-entry-metric ${status.className}">
                <span>${escapeHtml(track.label)}</span>
                <strong>${escapeHtml(value)}</strong>
            </div>
        `;
    }).join('');
}

function renderEntryCard(data) {
    const card = document.getElementById('etherlink-governance-entry-card');
    if (!card) return;
    const main = topTrack(data);
    const status = trackStatus(main);
    const activeTrack = hasActiveProposalTrack(data);
    const quiet = allTracksQuiet(data);
    let value = main.label;
    if (quiet) {
        value = 'Tracks';
    } else if (main.phase === 'proposal' && main.proposal) {
        value = formatPercent(main.proposalProgress);
    } else if (main.phase === 'promotion' && main.promotion) {
        value = formatPercent(main.promotion.participation);
    }
    card.classList.toggle('chamber-entry-live', status.className === 'live' || status.className === 'good');
    card.classList.toggle('chamber-entry-risk', status.className === 'risk');
    card.classList.toggle('chamber-entry-wide', activeTrack);
    card.dataset.etherlinkGovernanceLive = status.className === 'live' || status.className === 'good' ? 'true' : 'false';
    card.dataset.etherlinkGovernanceSize = activeTrack ? 'wide' : 'compact';
    const valueEl = document.getElementById('etherlink-governance-entry-value');
    const descriptionEl = document.getElementById('etherlink-governance-entry-description');
    const miniEl = document.getElementById('etherlink-governance-entry-mini');
    const metricsEl = document.getElementById('etherlink-governance-entry-metrics');
    if (valueEl) valueEl.textContent = value;
    if (descriptionEl) {
        descriptionEl.textContent = 'FAST, SLOW, and Sequencer tracks';
        if (quiet) {
            descriptionEl.textContent = 'FAST · SLOW · SEQ idle';
        } else if (main.phase === 'proposal' && main.proposal) {
            descriptionEl.textContent = `${main.label} ${proposalLabel(main.proposal.winner)}`;
        }
    }
    if (miniEl) {
        miniEl.classList.toggle('live', status.className === 'live' || status.className === 'good');
        miniEl.textContent = quiet ? 'All tracks idle · refresh 60s' : `${main.label}: ${status.label}`;
    }
    if (metricsEl) {
        metricsEl.hidden = false;
        metricsEl.classList.toggle('etherlink-gov-idle-preview', quiet);
        metricsEl.innerHTML = renderEntryMetrics(data);
    }
}

function renderEntryError() {
    const mini = document.getElementById('etherlink-governance-entry-mini');
    const card = document.getElementById('etherlink-governance-entry-card');
    const metricsEl = document.getElementById('etherlink-governance-entry-metrics');
    if (card) {
        card.classList.remove('chamber-entry-wide', 'chamber-entry-live');
        card.dataset.etherlinkGovernanceSize = 'compact';
    }
    if (metricsEl) {
        metricsEl.hidden = true;
        metricsEl.innerHTML = '';
    }
    if (mini) {
        mini.classList.remove('live');
        mini.textContent = 'Tezlink governance data delayed';
    }
}

function renderTab(track) {
    const status = trackStatus(track);
    return `
        <button type="button" class="etherlink-gov-tab ${track.key === activeTrackKey ? 'active' : ''}" data-etherlink-track="${escapeHtml(track.key)}">
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
                <span class="lb-live-pill">${escapeHtml(String((track.historicalProposals || []).length))} indexed</span>
            </div>
            <div class="lb-table etherlink-gov-table">
                <div class="lb-table-head etherlink-gov-history-row">
                    <span>Proposal</span><span>Submitted</span><span>Sender</span>
                </div>
                <div>${rows || '<div class="lb-empty">No historical proposal submissions found in the indexed TzKT sample.</div>'}</div>
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
            <section class="lb-panel etherlink-gov-panel">
                <div class="lb-error"><strong>${escapeHtml(track.label)} unavailable.</strong> ${escapeHtml(track.error)}</div>
            </section>
        `;
    }

    return `
        <div class="etherlink-gov-track-panel" data-track="${escapeHtml(track.key)}">
            <section class="lb-explainer etherlink-gov-explainer chamber-anim-fade">
                <div class="lb-explainer-main">
                    <div class="lb-explainer-kicker">${escapeHtml(track.label)} track</div>
                    <p><strong>${escapeHtml(status.label)}</strong> ${escapeHtml(track.description)}</p>
                </div>
                <div class="lb-explainer-facts" aria-label="${escapeHtml(track.label)} period facts">
                    <span><strong>Period</strong> #${escapeHtml(String(track.period?.index ?? '--'))}</span>
                    <span><strong>Ends</strong> ${escapeHtml(formatDurationFromBlocks(track.period?.blocksRemaining))}</span>
                    <span><strong>Blocks</strong> ${escapeHtml(String(track.period?.startLevel ?? '--'))} -> ${escapeHtml(String(track.period?.endLevel ?? '--'))}</span>
                </div>
            </section>
            <div class="lb-dashboard-grid etherlink-gov-dashboard-grid">
                ${renderProposalPanel(track)}
                ${renderPromotionPanel(track)}
                ${renderEmptyPanel(track)}
                ${renderHistoricalProposals(track)}
                ${renderActivity(track)}
            </div>
        </div>
    `;
}

function renderChamber(data, container) {
    const track = data.tracks.find((item) => item.key === activeTrackKey) || data.tracks[0];
    const status = trackStatus(track);
    container.innerHTML = `
        <div class="chamber-header lb-header etherlink-gov-header chamber-anim-fade">
            <div class="lb-system-strip">
                <span class="lb-system-brand">Tezos.Systems</span>
                <span>Tezlink Governance</span>
                <span>TzKT-discovered read-only mirror</span>
            </div>
            <div class="chamber-title-row">
                <h2 class="chamber-title" id="etherlink-governance-title">Tezlink Governance Chamber</h2>
                <span class="chamber-badge ${escapeHtml(status.className)}">${escapeHtml(status.label)}</span>
                <span class="lb-live-pill lb-refresh-pill" id="etherlink-governance-refresh-state">auto-refresh ${Math.round(CHAMBER_REFRESH_MS / 1000)}s</span>
            </div>
            <div class="chamber-proposal-info">
                <div class="proposal-name">${escapeHtml(track.label)} #${escapeHtml(String(track.period?.index ?? '--'))}</div>
                <div class="proposal-hash">Contract ${escapeHtml(track.contract || 'discovery unavailable')} · head ${escapeHtml(String(data.headLevel || '--'))} · updated ${escapeHtml(formatDate(data.updatedAt))}</div>
            </div>
        </div>
        <div class="etherlink-gov-tabs" role="tablist" aria-label="Tezlink governance tracks">
            ${data.tracks.map(renderTab).join('')}
        </div>
        ${renderTrackPanel(track)}
        <div class="chamber-footer chamber-anim-fade" style="animation-delay:220ms">
            <a href="${GOVERNANCE_BASE}/${escapeHtml(track.key)}" target="_blank" rel="noopener">Official ${escapeHtml(track.label)} track -></a>
            <span class="chamber-footer-sep">·</span>
            ${track.contract ? `<a href="https://tzkt.io/${escapeHtml(track.contract)}/storage/" target="_blank" rel="noopener">TzKT storage -></a>` : '<span>TzKT discovery unavailable</span>'}
            <span class="chamber-footer-sep">·</span>
            <a class="panel-direct-link" href="/#l2chamber" aria-label="Direct link to Tezlink Governance Chamber">Direct: /#l2chamber</a>
        </div>
    `;
    container.querySelectorAll('[data-etherlink-track]').forEach((button) => {
        button.addEventListener('click', () => {
            activeTrackKey = button.dataset.etherlinkTrack || 'fast';
            renderChamber(data, container);
        });
    });
    container.querySelectorAll('.etherlink-gov-voter-row[href^="#baker="]').forEach((link) => {
        link.addEventListener('click', closeEtherlinkGovernanceChamber);
    });
}

async function refreshEntryCard({ force = false } = {}) {
    try {
        const data = await fetchEtherlinkGovernanceData({ force });
        renderEntryCard(data);
    } catch (error) {
        console.warn('Tezlink governance entry refresh failed:', error);
        renderEntryError();
    }
}

function startEntryRefresh() {
    if (entryTimer) return;
    entryTimer = window.setInterval(() => {
        if (document.visibilityState === 'visible') refreshEntryCard();
    }, ENTRY_REFRESH_MS);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) refreshEntryCard({ force: true });
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

function handleEscape(event) {
    if (event.key === 'Escape') closeEtherlinkGovernanceChamber();
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
        const data = await fetchEtherlinkGovernanceData({ force });
        if (overlay.classList.contains('active')) renderChamber(data, body);
    } catch (error) {
        console.warn('Tezlink governance chamber refresh failed:', error);
        if (!body.dataset.rendered) {
            body.innerHTML = `
                <div class="chamber-error">
                    <div class="error-icon">!</div>
                    <div class="error-title">Could not reach Tezlink governance data</div>
                    <div class="error-detail">TzKT contract storage may be temporarily unavailable. Try again in a moment.</div>
                    <button class="chamber-retry-btn" id="etherlink-governance-retry">Retry</button>
                </div>
            `;
            body.querySelector('#etherlink-governance-retry')?.addEventListener('click', () => refreshChamber({ force: true }));
        }
    } finally {
        body.dataset.rendered = 'true';
        chamberInFlight = false;
        const state = document.getElementById('etherlink-governance-refresh-state');
        if (state) state.textContent = `auto-refresh ${Math.round(CHAMBER_REFRESH_MS / 1000)}s`;
    }
}

export async function openEtherlinkGovernanceChamber(trackKey = '') {
    if (trackKey && TRACK_TEMPLATES.some((track) => track.key === trackKey)) activeTrackKey = trackKey;
    let overlay = document.getElementById('etherlink-governance-modal');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'etherlink-governance-modal';
        overlay.className = 'modal-overlay chamber-overlay lb-overlay etherlink-gov-overlay';
        overlay.innerHTML = `
            <div class="modal-content modal-large chamber-content lb-content etherlink-gov-content" role="dialog" aria-modal="true" aria-labelledby="etherlink-governance-title">
                <button class="modal-close chamber-close" type="button" aria-label="Close Tezlink Governance Chamber">&times;</button>
                <div class="chamber-body lb-body etherlink-gov-body" id="etherlink-governance-body">
                    <div class="chamber-loading">
                        <div class="chamber-loading-text">Opening Tezlink Governance Chamber...</div>
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

    document.addEventListener('keydown', handleEscape);
    lockPageScroll();
    overlay.classList.add('active');
    const content = overlay.querySelector('.etherlink-gov-content');
    if (content) content.scrollTop = 0;
    await refreshChamber({ force: true });
    stopChamberRefresh();
    chamberTimer = window.setInterval(() => {
        if (document.visibilityState === 'visible') refreshChamber();
    }, CHAMBER_REFRESH_MS);
}

export function closeEtherlinkGovernanceChamber() {
    document.removeEventListener('keydown', handleEscape);
    stopChamberRefresh();
    const overlay = document.getElementById('etherlink-governance-modal');
    if (overlay) overlay.classList.remove('active');
    unlockPageScroll();
}

export function initEtherlinkGovernanceChamber() {
    if (document.getElementById('etherlink-governance-entry-card')) {
        startEntryRefresh();
        refreshEntryCard();
        return;
    }

    const grid = document.getElementById('chambers-grid') || document.getElementById('governance-section')?.querySelector('.stats-grid');
    if (!grid) return;

    const card = document.createElement('div');
    card.id = 'etherlink-governance-entry-card';
    card.className = 'stat-card chamber-entry-card etherlink-governance-entry-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', 'Open Tezlink Governance Chamber');
    card.title = 'Open Tezlink Governance Chamber';
    card.innerHTML = `
        <button class="card-copy-link" type="button" data-copy-hash="#l2chamber" aria-label="Copy Tezlink Governance Chamber direct link" title="Copy Tezlink Governance link">🔗</button>
        <div class="card-inner">
            <div class="card-front chamber-entry-front etherlink-governance-entry-front">
                <div class="tezlink-entry-main">
                    <h2 class="stat-label">Tezlink Governance</h2>
                    <div class="stat-value etherlink-gov-entry-value" id="etherlink-governance-entry-value"><span class="loading">...</span></div>
                    <p class="stat-description" id="etherlink-governance-entry-description">FAST, SLOW, and Sequencer tracks</p>
                    <div class="chamber-entry-status live" id="etherlink-governance-entry-mini">Loading governance tracks</div>
                </div>
                <div class="tezlink-entry-metrics etherlink-gov-entry-metrics" id="etherlink-governance-entry-metrics" aria-label="Tezlink governance track status" hidden></div>
            </div>
        </div>
        <span class="chamber-expand-cue" title="Opens a full window" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4h5v5"/><path d="M9 20H4v-5"/><path d="M20 4l-7 7"/><path d="M4 20l7-7"/></svg></span>
    `;

    card.addEventListener('click', (event) => {
        if (isAbortableTarget(event.target)) return;
        openEtherlinkGovernanceChamber();
    });
    card.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        openEtherlinkGovernanceChamber();
    });

    const tezlinkCard = document.getElementById('tezlink-entry-card');
    if (tezlinkCard?.parentElement === grid) {
        tezlinkCard.after(card);
    } else {
        grid.prepend(card);
    }

    refreshEntryCard({ force: true });
    startEntryRefresh();
}
