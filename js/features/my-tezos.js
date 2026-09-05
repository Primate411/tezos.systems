import { renderChamberVerdict } from '../ui/chamber-reading.js';
/**
 * My Tezos — Morning Brief + Your Tezos Story
 * Replaces the old hero strip with a rotating daily brief and personal timeline.
 * Persists address in localStorage. When active, this becomes the user's homepage.
 */

import { API_URLS } from '../core/config.js';
import { versionedAsset } from '../core/asset-version.js';
import { formatGovTimeLeft } from '../core/governance-time.js';
export { formatGovTimeLeft } from '../core/governance-time.js';
import { escapeHtml, formatFreshnessStamp } from '../core/utils.js';
import { countsAsProtocolUpgrade } from '../core/protocol-count.js';
import { fetchProtocolConstants, fetchStakingAPY, fetchWithRetry, getExternalStakerApy } from '../core/api.js';
import { buildBakerCapacitySnapshot } from '../core/baker-capacity.mjs';
import {
    BAKING_BENJAMINS_DELEGATE_ADDRESS,
    getWalletAccount,
    requestConnectedWalletDelegation,
    shortAddress as shortWalletAddress
} from '../core/wallet.js';
import { fetchXTZPrice } from './price.js';
import { letterGrade } from './baker-report-card.js';
import { fetchVotingStatus, getVotingPeriodName } from './governance.js';
import { classifyOctezVersion, fetchOctezVersions } from '../core/octez-versions.js';
import { fetchObjktProfile } from './objkt.js';
import { refresh as refreshMyBakerStats } from './my-baker.js';
import { initRewardsTracker } from './rewards-tracker.js';
import { getDailyDeltaSignalSummaries } from './daily-briefing.js';
import {
    activateMyTezosPortfolio,
    initMyTezosPortfolio,
    refreshMyTezosPortfolio
} from './my-tezos-portfolio.js';
import {
    activateMyTezosMemory,
    prepareMyTezosChangesView,
    refreshMyTezosMemory
} from './my-tezos-memory.mjs';
import {
    initMyTezosTabs,
    registerMyTezosView,
    setMyTezosView
} from './my-tezos-tabs.mjs';
import {
    initMyTezosScope,
    readScopedMyTezosEntries,
    readMyTezosScope,
    MY_TEZOS_SCOPE_ALL
} from './my-tezos-scope.mjs';
import { enqueueToast } from '../ui/toast-queue.js';
import { quietlyMutate, quietlySyncElement, quietlySyncHtml } from '../core/quiet-refresh.js';
import {
    buildMyTezosJourneyLinks,
    hasExplicitLinkedEtherlinkAccount,
    readMyTezosJourneyOrigin
} from '../core/site-journey.js';

const TZKT = API_URLS.tzkt;
const OCTEZ = API_URLS.octez;
const STORAGE_KEY = 'tezos-systems-my-baker-address';
const LAST_PORTFOLIO_KEY = 'tezos-systems-my-last-portfolio';
const OVERNIGHT_KEY = 'tezos-systems-overnight-snapshot';
const TEZ_NAME_CACHE_KEY = 'tezos-tez-name-cache';
const TEZ_NAME_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const ANNIVERSARY_KEY_PREFIX = 'tezos-anniversary-shown';
const RECENT_BAKER_ACTIVITY_DAYS = 14;
const RECENT_BAKER_ACTIVITY_LIMIT = 40;
const RECENT_BAKER_ACTIVITY_DISPLAY_LIMIT = 6;
const RECENT_OPERATOR_ATTESTATIONS = 10;
const RIGHTS_FETCH_TIMEOUT_MS = 12000;
const OCTEZ_VERSION_TTL_MS = 10 * 60 * 1000;
const OPERATOR_SIGNAL_REFRESH_MS = 15000;
const DRAWER_STATS_REFRESH_MS = 30000;
const ACTIVE_VIEW_REFRESH_MS = 30000;
const BAKING_BENJAMINS_NAME = 'Baking Benjamins';
const _octezSoftwareCache = new Map();
const _tezNameMemoryCache = new Map();
let _activeOvernightReport = null;
let _activeOvernightAddress = '';
let _latestOperatorSignal = null;
// Protocol eras — map block levels to protocol names
const PROTOCOL_ERAS = [
    { name: 'Genesis', level: 0, date: '2018-06-30' },
    { name: 'Athens', level: 458753, date: '2019-05-30' },
    { name: 'Babylon', level: 655361, date: '2019-10-18' },
    { name: 'Carthage', level: 851969, date: '2020-03-05' },
    { name: 'Delphi', level: 1212417, date: '2020-11-12' },
    { name: 'Edo', level: 1343489, date: '2021-02-13' },
    { name: 'Florence', level: 1466369, date: '2021-05-11' },
    { name: 'Granada', level: 1589249, date: '2021-08-06' },
    { name: 'Hangzhou', level: 1916929, date: '2021-12-04' },
    { name: 'Ithaca', level: 2244609, date: '2022-04-01' },
    { name: 'Jakarta', level: 2490369, date: '2022-06-18' },
    { name: 'Kathmandu', level: 2736129, date: '2022-09-28' },
    { name: 'Lima', level: 2981889, date: '2022-12-17' },
    { name: 'Mumbai', level: 3268609, date: '2023-03-29' },
    { name: 'Nairobi', level: 3760129, date: '2023-06-24' },
    { name: 'Oxford', level: 5070849, date: '2024-02-09' },
    { name: 'Paris', level: 5726209, date: '2024-06-04' },
    { name: 'Paris C', level: 5898242, date: '2024-06-25', countsAsUpgrade: false },
    { name: 'Quebec', level: 7692289, date: '2025-01-20' },
    { name: 'Rio', level: 8767489, date: '2025-05-01' },
    { name: 'Seoul', level: 10279489, date: '2025-09-19' },
    { name: 'Tallinn', level: 11640289, date: '2026-01-24' },
    { name: 'Ushuaia', level: 13857889, date: '2026-06-30' },
];

// Dynamically extend PROTOCOL_ERAS from TzKT on first load
let _erasLoaded = false;
async function fetchTzktJson(url, attempts = 2) {
    return fetchWithRetry(url, {
        cache: 'no-store',
        memoryCache: false,
        __tezosSystemsPriority: 'interactive'
    }, attempts);
}

async function ensureProtocolEras() {
    if (_erasLoaded) return;
    _erasLoaded = true;
    try {
        const protocols = await fetchTzktJson(TZKT + '/protocols?sort.asc=code');
        const named = protocols.filter(p => p.code >= 4 && p.extras?.alias);
        for (const p of named) {
            const name = p.extras.alias;
            const exists = PROTOCOL_ERAS.find(e => e.name === name);
            if (!exists) {
                PROTOCOL_ERAS.push({
                    name,
                    level: p.firstLevel,
                    date: p.startTime ? p.startTime.split('T')[0] : null
                });
            }
        }
        // Sort by level
        PROTOCOL_ERAS.sort((a, b) => a.level - b.level);
    } catch {}
}

// ─── Helpers ─────────────────────────────────────────

async function getXtzPrice() {
    try {
        const data = await fetchXTZPrice();
        return (data && data.usd) ? data.usd : null;
    } catch { return null; }
}

async function getStakingAPY() {
    return fetchStakingAPY();
}

async function fetchRecentRewards(address, account = null) {
    const enc = encodeURIComponent(address);
    const tryFetchRows = async (url) => {
        try {
            const rows = await fetchTzktJson(url);
            return Array.isArray(rows) && rows.length ? rows : null;
        } catch {
            return null;
        }
    };

    const isBaker = account?.type === 'delegate' || account?.delegate?.address === address;
    const hasStake = (Number(account?.stakedBalance) || 0) > 0;

    if (isBaker) {
        const bakerRows = await tryFetchRows(`${TZKT}/rewards/bakers/${enc}?limit=100&sort.desc=cycle`);
        if (bakerRows) return bakerRows;
    }
    if (hasStake) {
        const stakerRows = await tryFetchRows(`${TZKT}/rewards/stakers/${enc}?limit=100&sort.desc=cycle`);
        if (stakerRows) return stakerRows;
    }

    return await tryFetchRows(`${TZKT}/rewards/delegators/${enc}?limit=100&sort.desc=cycle`)
        || await tryFetchRows(`${TZKT}/rewards/stakers/${enc}?limit=100&sort.desc=cycle`)
        || await tryFetchRows(`${TZKT}/rewards/bakers/${enc}?limit=100&sort.desc=cycle`);
}

function sumRewardFields(r, fields) {
    return fields.reduce((sum, field) => sum + (Number(r?.[field]) || 0), 0);
}

function getBakerRewardMutez(r) {
    return sumRewardFields(r, [
        'blockRewardsDelegated',
        'blockRewardsStakedOwn',
        'blockRewardsStakedEdge',
        'blockRewardsStakedShared',
        'attestationRewardsDelegated',
        'attestationRewardsStakedOwn',
        'attestationRewardsStakedEdge',
        'attestationRewardsStakedShared',
        'dalAttestationRewardsDelegated',
        'dalAttestationRewardsStakedOwn',
        'dalAttestationRewardsStakedEdge',
        'dalAttestationRewardsStakedShared',
        'vdfRevelationRewardsDelegated',
        'vdfRevelationRewardsStakedOwn',
        'vdfRevelationRewardsStakedEdge',
        'vdfRevelationRewardsStakedShared',
        'nonceRevelationRewardsDelegated',
        'nonceRevelationRewardsStakedOwn',
        'nonceRevelationRewardsStakedEdge',
        'nonceRevelationRewardsStakedShared',
        'blockFees'
    ]);
}

function getDelegatorRewardEstimateMutez(r) {
    const baker = r?.bakerRewards || r;
    const delegated = Number(r?.delegatedBalance) || 0;
    const externalDelegated = Number(baker?.externalDelegatedBalance ?? r?.externalDelegatedBalance) || 0;
    if (delegated <= 0 || externalDelegated <= 0) return 0;
    const delegatedPool = sumRewardFields(baker, [
        'blockRewardsDelegated',
        'attestationRewardsDelegated',
        'dalAttestationRewardsDelegated',
        'vdfRevelationRewardsDelegated',
        'nonceRevelationRewardsDelegated'
    ]);
    return Math.round(delegatedPool * delegated / externalDelegated);
}

function getRecordedRewardAmount(r) {
    if (!r) return 0;
    if (r.rewards !== undefined) return (Number(r.rewards) || 0) / 1e6;
    if (r.bakerRewards) return getDelegatorRewardEstimateMutez(r) / 1e6;

    const actual = getBakerRewardMutez(r);
    if (actual > 0) return actual / 1e6;

    if (r.ownBlockRewards !== undefined) {
        return ((r.ownBlockRewards || 0) + (r.ownEndorsementRewards || 0) +
                (r.extraBlockRewards || 0) + (r.extraEndorsementRewards || 0)) / 1e6;
    }
    return 0;
}

function calcRewardStreak(rewards) {
    if (!rewards || !rewards.length) return 0;
    let streak = 0;
    for (let i = 0; i < rewards.length; i++) {
        if (getRecordedRewardAmount(rewards[i]) <= 0) break;
        if (i > 0 && rewards[i-1].cycle - rewards[i].cycle !== 1) break;
        streak++;
    }
    return streak;
}

async function fetchParticipation(bakerAddr) {
    try {
        const resp = await fetch(`${OCTEZ}/chains/main/blocks/head/context/delegates/${bakerAddr}/participation`);
        if (!resp.ok) return null;
        return await resp.json();
    } catch { return null; }
}

async function fetchDALParticipation(bakerAddr) {
    try {
        const resp = await fetch(`${OCTEZ}/chains/main/blocks/head/context/delegates/${bakerAddr}/dal_participation`);
        if (!resp.ok) return null;
        return await resp.json();
    } catch { return null; }
}

async function fetchJsonWithTimeout(url, fallback = null, timeoutMs = RIGHTS_FETCH_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetchWithRetry(url, {
            signal: controller.signal,
            cache: 'no-store',
            memoryCache: false,
            __tezosSystemsPriority: 'interactive'
        }, 2);
    } catch {
        return fallback;
    } finally {
        clearTimeout(timeout);
    }
}

function summarizeOctezSoftware(software, latestVersion = 'Unknown') {
    const rawVersion = typeof software === 'string'
        ? software
        : (software?.version || '');
    const version = String(rawVersion || '').trim();
    const known = Boolean(version) && !/^unknown$/i.test(version) && !/^octez$/i.test(version);
    const reportedAt = typeof software === 'object' && software ? software.date : null;
    const status = classifyOctezVersion(known ? version : 'Unknown', latestVersion);
    const reportDetail = reportedAt ? `reported ${relativeTime(reportedAt)}` : 'TzKT delegate software';
    const detail = known
        ? `${status.label}${status.latestVersion && status.latestVersion !== 'Unknown' ? ` · latest ${status.latestVersion}` : ''} · ${reportDetail}`
        : 'No TzKT version report yet';
    return {
        known,
        version: known ? version : 'Unknown',
        detail,
        latestVersion: status.latestVersion,
        state: status.state,
        className: status.className
    };
}

async function fetchBakerOctezSoftware(bakerAddr) {
    const now = Date.now();
    const cached = _octezSoftwareCache.get(bakerAddr);
    if (cached && now - cached.time < OCTEZ_VERSION_TTL_MS) return cached.value;

    const [delegate, versions] = await Promise.all([
        fetchJsonWithTimeout(`${TZKT}/delegates/${encodeURIComponent(bakerAddr)}`, null, 8000),
        fetchOctezVersions().catch(() => null)
    ]);
    const value = summarizeOctezSoftware(delegate?.software, versions?.latestVersion);
    _octezSoftwareCache.set(bakerAddr, { time: now, value });
    return value;
}

function rightsUrl(params) {
    return `${TZKT}/rights?${new URLSearchParams(params).toString()}`;
}

function parseBlockDelaySeconds(constants) {
    const raw = constants?.minimal_block_delay;
    const value = Array.isArray(raw) ? raw[0] : raw;
    const seconds = parseFloat(String(value ?? '').replace(/"/g, ''));
    return Number.isFinite(seconds) && seconds > 0 ? seconds : 6;
}

async function fetchBlockDelaySeconds() {
    const constants = await fetchJsonWithTimeout(`${OCTEZ}/chains/main/blocks/head/context/constants`, null, 8000);
    return parseBlockDelaySeconds(constants);
}

function formatDuration(ms) {
    if (!Number.isFinite(ms)) return 'soon';
    const totalMinutes = Math.max(0, Math.round(ms / 60000));
    if (totalMinutes < 1) return '<1m';
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}

function formatLevel(level) {
    const n = Number(level);
    return Number.isFinite(n) ? n.toLocaleString() : 'unknown level';
}

function summarizeRightStatus(right) {
    if (!right) return { state: 'unknown', text: 'No recent round 0 right', detail: 'TzKT returned no completed round 0 baking right yet' };
    const status = String(right.status || 'unknown').toLowerCase();
    const ok = status === 'realized';
    return {
        state: ok ? 'ok' : 'issue',
        text: ok ? 'OK' : status.toUpperCase(),
        detail: `Level ${formatLevel(right.level)}${right.round != null ? `, round ${right.round}` : ''}`
    };
}

function isRoundZeroRight(right) {
    return Number(right?.round) === 0;
}

function firstRoundZeroRight(rows) {
    return (Array.isArray(rows) ? rows : []).find(isRoundZeroRight) || null;
}

function summarizeRecentAttestations(rows) {
    const recent = (rows || []).filter((row) => row.status !== 'future').slice(0, RECENT_OPERATOR_ATTESTATIONS);
    const issues = recent.filter((row) => row.status !== 'realized');
    if (!recent.length) {
        return { state: 'unknown', rate: null, value: 'No data', detail: 'No completed attestation rights returned', latest: null };
    }
    const okCount = recent.length - issues.length;
    const rate = (okCount / recent.length) * 100;
    const latest = recent[0] || null;
    return {
        state: issues.length ? 'issue' : 'ok',
        rate,
        value: `${rate.toFixed(1)}%`,
        latest,
        detail: issues.length
            ? `${issues.length}/${recent.length} recent attestation issue${issues.length > 1 ? 's' : ''}`
            : `Last ${recent.length} attestations OK · latest level ${formatLevel(latest?.level)}`
    };
}

function summarizeDalParticipation(dal) {
    if (!dal) return { state: 'unknown', value: 'No data', detail: 'DAL participation unavailable' };
    const attested = dal.delegate_attested_dal_slots || 0;
    const attestable = dal.delegate_attestable_dal_slots || 0;
    if (attestable <= 0) {
        return { state: 'unknown', value: 'N/A', detail: 'No DAL slots assigned' };
    }
    const rate = (attested / attestable) * 100;
    const ok = dal.sufficient_dal_participation !== false;
    return {
        state: ok ? 'ok' : 'issue',
        value: `${rate.toFixed(1)}%`,
        detail: `${attested}/${attestable} DAL slots${ok ? ' attested' : ' attested, below threshold'}`
    };
}

function summarizeCycleAttestation(participation, recent) {
    if (!participation) {
        return { state: recent?.state || 'unknown', value: recent?.value || 'No data', detail: recent?.detail || 'Participation unavailable' };
    }
    const expected = participation.expected_cycle_activity || 0;
    const missed = participation.missed_slots || 0;
    if (expected <= 0) {
        return { state: recent?.state || 'unknown', value: 'N/A', detail: recent?.detail || 'No cycle activity expected' };
    }
    const rate = ((expected - missed) / expected) * 100;
    return {
        state: recent?.state || (rate >= 99 ? 'ok' : 'issue'),
        value: `${rate.toFixed(1)}%`,
        detail: recent?.detail || `${missed} missed slots this cycle`
    };
}

function summarizeLiveOperatorStatus(latestBlock, recentAttestations) {
    if (recentAttestations.state === 'ok' && latestBlock.state === 'issue') {
        return {
            state: 'ok',
            value: 'Back online',
            detail: `Fresh attestations OK · prior round 0 block ${latestBlock.text}`
        };
    }

    if (recentAttestations.state === 'ok') {
        return {
            state: 'ok',
            value: 'Working',
            detail: `${latestBlock.state === 'ok' ? 'Last round 0 block OK' : latestBlock.text} · ${recentAttestations.detail}`
        };
    }

    if (recentAttestations.state === 'issue') {
        return {
            state: 'issue',
            value: 'Check now',
            detail: `${latestBlock.text} · ${recentAttestations.detail}`
        };
    }

    if (latestBlock.state === 'issue') {
        return {
            state: 'issue',
            value: 'Check now',
            detail: `${latestBlock.text} · no fresh attestation confirmation`
        };
    }

    if (latestBlock.state === 'ok') {
        return {
            state: 'ok',
            value: 'Working',
            detail: `Last round 0 block OK · ${recentAttestations.detail}`
        };
    }

    return {
        state: 'unknown',
        value: 'No data',
        detail: `${latestBlock.text} · ${recentAttestations.detail}`
    };
}

async function fetchOperatorHead() {
    const tzktHead = await fetchJsonWithTimeout(`${TZKT}/head`, null, 8000);
    if (Number.isFinite(Number(tzktHead?.level))) return tzktHead;

    const [header, metadata] = await Promise.all([
        fetchJsonWithTimeout(`${OCTEZ}/chains/main/blocks/head/header`, null, 8000),
        fetchJsonWithTimeout(`${OCTEZ}/chains/main/blocks/head/metadata`, null, 8000)
    ]);
    if (!Number.isFinite(Number(header?.level))) return null;
    return {
        ...header,
        cycle: metadata?.level_info?.cycle ?? null,
        source: 'Octez RPC fallback'
    };
}

async function fetchBakerOperatorStatus(bakerAddr, participation) {
    if (!bakerAddr) return null;
    const [head, blockDelaySeconds, dalParticipation, octez] = await Promise.all([
        fetchOperatorHead(),
        fetchBlockDelaySeconds(),
        fetchDALParticipation(bakerAddr),
        fetchBakerOctezSoftware(bakerAddr)
    ]);
    const headLevel = Number(head?.level);
    if (!Number.isFinite(headLevel)) {
        const dal = summarizeDalParticipation(dalParticipation);
        const attestation = summarizeCycleAttestation(participation, null);
        return {
            live: { state: 'unknown', value: 'No data', detail: 'Could not read current chain head' },
            nextBlock: null,
            lastBlock: null,
            attestation,
            dal,
            octez,
        };
    }

    const enc = bakerAddr;
    const [nextBlocks, latestBlocks, latestAttestations] = await Promise.all([
        fetchJsonWithTimeout(rightsUrl({
            baker: enc,
            type: 'baking',
            status: 'future',
            'level.gt': String(headLevel),
            round: '0',
            limit: '20',
            'sort.asc': 'level',
            select: 'level,cycle,round,status,type'
        }), []),
        fetchJsonWithTimeout(rightsUrl({
            baker: enc,
            type: 'baking',
            ...(head.cycle != null ? { cycle: String(head.cycle) } : {}),
            'level.le': String(headLevel),
            round: '0',
            limit: '5',
            'sort.desc': 'level',
            select: 'level,timestamp,cycle,round,status,type'
        }), []),
        fetchJsonWithTimeout(rightsUrl({
            baker: enc,
            type: 'attestation',
            'level.le': String(headLevel),
            limit: String(RECENT_OPERATOR_ATTESTATIONS),
            'sort.desc': 'level',
            select: 'level,timestamp,slots,status,type'
        }), [])
    ]);

    const next = firstRoundZeroRight(nextBlocks);
    const levelDiff = next ? Number(next.level) - headLevel : null;
    const etaMs = Number.isFinite(levelDiff) ? levelDiff * blockDelaySeconds * 1000 : null;
    const latestBlock = summarizeRightStatus(firstRoundZeroRight(latestBlocks));
    const recentAttestations = summarizeRecentAttestations(Array.isArray(latestAttestations) ? latestAttestations : []);
    const dal = summarizeDalParticipation(dalParticipation);
    const attestation = summarizeCycleAttestation(participation, recentAttestations);
    const live = summarizeLiveOperatorStatus(latestBlock, recentAttestations);

    return {
        live,
        nextBlock: next ? {
            level: next.level,
            round: next.round,
            eta: formatDuration(etaMs),
            detail: `Level ${formatLevel(next.level)}${next.round != null ? `, round ${next.round}` : ''}`
        } : null,
        lastBlock: latestBlock,
        attestation,
        dal,
        octez,
    };
}

function normalizeBallotStatus(status) {
    if (!status || status === 'none') return null;
    return String(status).replace(/^voted_/, '');
}

function isCastVote(status) {
    return Boolean(normalizeBallotStatus(status));
}

function governancePhaseName(kind) {
    return getVotingPeriodName(kind).replace(/\s+(Period|Vote)$/i, '').toLowerCase();
}

async function fetchCurrentVoter(bakerAddr) {
    try {
        return await fetchTzktJson(`${TZKT}/voting/periods/current/voters/${encodeURIComponent(bakerAddr)}`);
    } catch {
        return null;
    }
}

export async function fetchBakerVoteStatus(bakerAddr) {
    try {
        const period = await fetchVotingStatus();
        if (!period) return null;
        
        // Calculate time urgency (0–1, where 1 = period almost over)
        let urgency = 0;
        if (period.startTime && period.endTime) {
            const elapsed = Date.now() - new Date(period.startTime).getTime();
            const total = new Date(period.endTime).getTime() - new Date(period.startTime).getTime();
            urgency = Math.min(1, Math.max(0, elapsed / total));
        }
        
        const base = { periodKind: period.kind, urgency, startTime: period.startTime, endTime: period.endTime };
        
        // Proposal period — check if baker upvoted any proposal
        if (period.kind === 'proposal') {
            const proposalsCount = period.proposalsCount || 0;
            if (proposalsCount === 0) return null;
            try {
                const entry = await fetchCurrentVoter(bakerAddr);
                const hasUpvoted = entry && isCastVote(entry.status);
                return { ...base, proposal: `${proposalsCount} proposal${proposalsCount > 1 ? 's' : ''} injected`, voted: !!hasUpvoted, voteType: 'upvote', proposalsCount };
            } catch {}
            return { ...base, proposal: `${proposalsCount} proposal${proposalsCount > 1 ? 's' : ''}`, voted: false, voteType: 'upvote', proposalsCount };
        }
        
        // Exploration / promotion — check yay/nay/pass + tally
        if (period.kind === 'exploration' || period.kind === 'promotion') {
            const proposalName = period.proposalName || period.proposal?.alias || period.proposal?.hash?.slice(0, 8) || 'Unknown';
            const yayPower = period.yayVotingPower || 0;
            const nayPower = period.nayVotingPower || 0;
            const passPower = period.passVotingPower || 0;
            const totalVoted = yayPower + nayPower + passPower;
            const totalEligible = period.totalVotingPower || 0;
            const quorumPct = totalEligible > 0 ? ((totalVoted / totalEligible) * 100) : null;
            const yayNay = yayPower + nayPower;
            const yayPct = yayNay > 0 ? ((yayPower / yayNay) * 100) : null;
            const quorumNeeded = Number(period.ballotsQuorum);
            
            // Check this baker's vote
            let voted = false, vote = null;
            try {
                const entry = await fetchCurrentVoter(bakerAddr);
                vote = normalizeBallotStatus(entry?.status);
                voted = Boolean(vote);
            } catch {}
            
            return { ...base, proposal: proposalName, voted, vote, voteType: 'ballot', quorumPct, yayPct, quorumNeeded };
        }
        
        return null; // cooldown/adoption — no vote needed
    } catch { return null; }
}

function calcBakerHealth(participation) {
    if (!participation) return null;
    const expected = participation.expected_cycle_activity || 0;
    const missed = participation.missed_slots || 0;
    if (expected === 0) return 100;
    const rate = ((expected - missed) / expected) * 100;
    if (rate >= 99) return 100;
    if (rate >= 97) return 95;
    if (rate >= 95) return 90;
    if (rate >= 90) return 75;
    if (rate >= 67) return 50;
    return 25;
}

function healthLabel(score) {
    if (score === null) return { text: '—', color: 'var(--text-dim)', icon: '⚪' };
    if (score >= 95) return { text: 'Excellent', color: 'var(--color-success, #10b981)', icon: '🟢' };
    if (score >= 75) return { text: 'Good', color: 'var(--color-success, #10b981)', icon: '🟡' };
    if (score >= 50) return { text: 'Fair', color: 'var(--color-warning, #f59e0b)', icon: '🟠' };
    return { text: 'At Risk', color: 'var(--color-error, #ef4444)', icon: '🔴' };
}

function fmtCompact(xtz) {
    if (xtz >= 1e6) return (xtz / 1e6).toFixed(2) + 'M';
    if (xtz >= 1e3) return (xtz / 1e3).toFixed(1) + 'K';
    return xtz.toFixed(2);
}

function fmtMutez(mutez) {
    const xtz = (mutez || 0) / 1e6;
    if (!Number.isFinite(xtz) || xtz <= 0) return '0 XTZ';
    if (xtz < 0.01) return '<0.01 XTZ';
    if (xtz < 100) return `${xtz.toFixed(2).replace(/\.?0+$/, '')} XTZ`;
    return `${fmtCompact(xtz)} XTZ`;
}

function fmtCount(count) {
    const n = Number(count);
    return Number.isFinite(n) ? Math.max(0, Math.trunc(n)).toLocaleString() : '0';
}

function pluralize(count, singular, plural = `${singular}s`) {
    return Number(count) === 1 ? singular : plural;
}

function hasCreatorStats(stats) {
    return Boolean(stats && (
        stats.totalCreated > 0 ||
        stats.collectionCount > 0 ||
        stats.totalSalesCount > 0 ||
        stats.totalSalesVolume > 0
    ));
}

function getCreatorCreatedLabel(stats) {
    if (!stats) return '';
    if (stats.totalCreated > 0) {
        return `${fmtCount(stats.totalCreated)} ${pluralize(stats.totalCreated, 'NFT')}`;
    }
    if (stats.collectionCount > 0) {
        return `${fmtCount(stats.collectionCount)} ${pluralize(stats.collectionCount, 'collection')}`;
    }
    return '';
}

function getCreatorSalesLabel(stats) {
    if (!stats || stats.totalSalesVolume <= 0) return '';
    return `${fmtCompact(stats.totalSalesVolume)} XTZ sales`;
}

function getCreatorSummaryHtml(stats, brand = null) {
    const created = getCreatorCreatedLabel(stats);
    const sales = getCreatorSalesLabel(stats);
    if (!created && !sales) return '';
    if (!created) return `Creator sales <strong>${sales}</strong>`;
    if (!sales) return `Created <strong>${created}</strong>`;
    const createdText = brand ? `<span style="color:${brand};font-weight:700;">${created}</span>` : `<strong>${created}</strong>`;
    const salesText = brand ? `<span style="color:${brand};font-weight:700;">${sales}</span>` : `<strong>${sales}</strong>`;
    return `Created ${createdText} · ${salesText}`;
}

function getCreatorSummaryText(stats) {
    const created = getCreatorCreatedLabel(stats);
    const sales = getCreatorSalesLabel(stats);
    if (!created && !sales) return '';
    if (!created) return `Creator sales ${sales}`;
    if (!sales) return `Created ${created}`;
    return `Created ${created} with ${sales}`;
}

function isTezDomainAlias(value) {
    return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+tez$/i.test(String(value || '').trim());
}

function shortAddress(address) {
    if (!address) return 'Unknown';
    return `${address.slice(0, 8)}...${address.slice(-4)}`;
}

function loadTezNameCache() {
    try {
        const parsed = JSON.parse(localStorage.getItem(TEZ_NAME_CACHE_KEY) || '{}');
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
        return {};
    }
}

function saveTezNameCache(cache) {
    try {
        localStorage.setItem(TEZ_NAME_CACHE_KEY, JSON.stringify(cache));
    } catch (_) {}
}

async function resolveTezReverseName(address) {
    const key = String(address || '').trim();
    if (!key) return null;
    const memory = _tezNameMemoryCache.get(key);
    if (memory && Date.now() - memory.ts < TEZ_NAME_CACHE_TTL_MS) return memory.name || null;

    const cache = loadTezNameCache();
    const cached = cache[key];
    if (cached && Date.now() - Number(cached.ts || 0) < TEZ_NAME_CACHE_TTL_MS) {
        _tezNameMemoryCache.set(key, cached);
        return cached.name || null;
    }

    let name = null;
    try {
        const resp = await fetch('https://api.tezos.domains/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: 'query ReverseLookup($address: String!) { reverseRecord(address: $address) { domain { name } } }',
                variables: { address: key }
            })
        });
        if (resp.ok) {
            const json = await resp.json();
            const candidate = json?.data?.reverseRecord?.domain?.name || null;
            name = isTezDomainAlias(candidate) ? candidate.toLowerCase() : null;
        }
    } catch (_) {}

    const entry = { name, ts: Date.now() };
    _tezNameMemoryCache.set(key, entry);
    cache[key] = entry;
    saveTezNameCache(cache);
    return name;
}

export async function resolveTezName(address, account = null) {
    const reverseName = await resolveTezReverseName(address);
    return reverseName || account?.alias || shortAddress(address);
}

function getGreetingPeriod() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 18) return 'afternoon';
    return 'evening';
}

function updateDrawerGreeting(name) {
    const greeting = document.getElementById('my-tezos-greeting');
    if (!greeting) return;
    const cleanName = String(name || '').trim();
    const nextText = cleanName ? `Good ${getGreetingPeriod()}, ${cleanName}` : '';
    const applyGreeting = () => {
        // The shell reserves one line for this async identity result. Keep the
        // node in flow so a late reverse-name response cannot move a reader
        // who is already browsing farther down the drawer.
        greeting.hidden = false;
        greeting.textContent = nextText;
        greeting.setAttribute('aria-hidden', cleanName ? 'false' : 'true');
    };
    if (greeting.textContent === nextText && !greeting.hidden) {
        greeting.setAttribute('aria-hidden', cleanName ? 'false' : 'true');
        return;
    }
    const drawerBody = document.getElementById('drawer-body');
    if (drawerBody) quietlyMutate(drawerBody, applyGreeting);
    else applyGreeting();
}

function accountName(account) {
    return account?.alias || shortAddress(account?.address);
}

function relativeTime(timestamp) {
    const time = new Date(timestamp).getTime();
    if (!Number.isFinite(time)) return '';
    const diff = Math.max(0, Date.now() - time);
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

function recentActivityUrl(path, params) {
    const search = new URLSearchParams({
        'timestamp.ge': new Date(Date.now() - RECENT_BAKER_ACTIVITY_DAYS * 86400000).toISOString(),
        status: 'applied',
        limit: String(RECENT_BAKER_ACTIVITY_LIMIT),
        'sort.desc': 'id',
        ...params
    });
    return `${TZKT}${path}?${search.toString()}`;
}

function uniqueRecentAccounts(ops, mapOp) {
    const seen = new Set();
    const rows = [];
    for (const op of ops || []) {
        const address = op.sender?.address;
        if (!address || seen.has(address)) continue;
        seen.add(address);
        rows.push(mapOp(op));
        if (rows.length >= RECENT_BAKER_ACTIVITY_DISPLAY_LIMIT) break;
    }
    return rows;
}

async function fetchJsonArray(url) {
    try {
        const rows = await fetchTzktJson(url);
        return Array.isArray(rows) ? rows : [];
    } catch {
        return [];
    }
}

async function fetchRecentBakerActivity(bakerAddr) {
    const selectDelegations = 'id,timestamp,sender,newDelegate,prevDelegate';
    const selectStaking = 'id,timestamp,sender,baker,amount,action';
    const [delegationOps, stakingOps] = await Promise.all([
        fetchJsonArray(recentActivityUrl('/operations/delegations', {
            newDelegate: bakerAddr,
            select: selectDelegations
        })),
        fetchJsonArray(recentActivityUrl('/operations/staking', {
            baker: bakerAddr,
            action: 'stake',
            select: selectStaking
        }))
    ]);

    const delegators = uniqueRecentAccounts(delegationOps, (op) => ({
        address: op.sender.address,
        alias: op.sender.alias,
        timestamp: op.timestamp,
        previousBaker: op.prevDelegate ? accountName(op.prevDelegate) : null,
    }));

    const stakers = uniqueRecentAccounts(stakingOps, (op) => ({
        address: op.sender.address,
        alias: op.sender.alias,
        timestamp: op.timestamp,
        amount: op.amount || 0,
    }));

    return { delegators, stakers, days: RECENT_BAKER_ACTIVITY_DAYS };
}

function renderBakerActivityRows(rows, type) {
    return rows.map((row) => {
        const name = escapeHtml(row.alias || shortAddress(row.address));
        const address = escapeHtml(row.address);
        const time = escapeHtml(relativeTime(row.timestamp));
        const meta = type === 'delegator'
            ? (row.previousBaker ? `from ${escapeHtml(row.previousBaker)}` : 'new delegation')
            : `staked ${escapeHtml(fmtMutez(row.amount))}`;
        return `
            <a class="drawer-activity-row" href="https://tzkt.io/${address}" target="_blank" rel="noopener">
                <span class="drawer-activity-main">
                    <span class="drawer-activity-name">${name}</span>
                    <span class="drawer-activity-address">${address}</span>
                </span>
                <span class="drawer-activity-meta">${meta}<span>${time ? ` · ${time}` : ''}</span></span>
            </a>
        `;
    }).join('');
}

function renderBakerActivityGroup(title, rows, type) {
    if (!rows.length) return '';
    return `
        <div class="drawer-activity-group">
            <div class="drawer-activity-group-head">
                <span>${title}</span>
                <span>${rows.length}</span>
            </div>
            <div class="drawer-activity-list">
                ${renderBakerActivityRows(rows, type)}
            </div>
        </div>
    `;
}

function renderBakerActivity(activity) {
    const container = document.getElementById('drawer-baker-activity');
    if (!container) return;
    const delegators = activity?.delegators || [];
    const stakers = activity?.stakers || [];
    if (!delegators.length && !stakers.length) {
        if (!container.hidden) quietlyMutate(container, () => {
            container.hidden = true;
            container.innerHTML = '';
        });
        return;
    }

    const wasHidden = container.hidden;
    const html = `
        <div class="drawer-activity-panel">
            <div class="drawer-activity-header">
                <div>
                    <h3>Latest reward accounts</h3>
                    <p>New delegators and stakers in the last ${activity.days} days</p>
                </div>
                <span>${delegators.length + stakers.length}</span>
            </div>
            ${renderBakerActivityGroup('Latest delegators', delegators, 'delegator')}
            ${renderBakerActivityGroup('Latest stakers', stakers, 'staker')}
        </div>
    `;
    if (container.children.length) quietlySyncHtml(container, html);
    else container.innerHTML = html;
    if (wasHidden) quietlyMutate(container, () => { container.hidden = false; });
}

function renderOperatorTile(label, value, detail, state = 'unknown', extraClass = '') {
    const safeState = ['ok', 'watch', 'issue', 'unknown'].includes(state) ? state : 'unknown';
    return `
        <div class="drawer-operator-tile drawer-operator-${safeState} ${extraClass}">
            <span class="drawer-operator-label">${escapeHtml(label)}</span>
            <strong class="drawer-operator-value">${escapeHtml(value)}</strong>
            <span class="drawer-operator-detail">${escapeHtml(detail || '')}</span>
        </div>
    `;
}

function renderBakerSignalMessage(message) {
    const empty = document.getElementById('my-tezos-baker-signal-empty');
    const copy = document.getElementById('my-tezos-baker-signal-message');
    if (copy) quietlySyncHtml(copy, escapeHtml(message));
    if (empty) quietlyMutate(empty, () => { empty.hidden = false; });
}

function renderBakerSignalUnavailable() {
    // Keep the last confirmed signal on transient source failures.
    if (document.getElementById('drawer-operator-status')?.hidden) {
        renderBakerSignalMessage('Baker Signal is unavailable. We’ll retry while My Tezos is open.');
    }
}

function renderBakerOperatorStatus(status, isBaker, bakerName = '') {
    const container = document.getElementById('drawer-operator-status');
    if (!container) return;
    if (!status) {
        _latestOperatorSignal = null;
        renderBakerSignalMessage(localStorage.getItem(STORAGE_KEY)
            ? 'This account has no baker. Choose another wallet above or manage the account in Overview.'
            : 'Add a Tezos account in Overview to follow its baker.');
        if (!container.hidden) quietlyMutate(container, () => {
            container.hidden = true;
            container.innerHTML = '';
        });
        return;
    }

    _latestOperatorSignal = { address: localStorage.getItem(STORAGE_KEY), status };
    const empty = document.getElementById('my-tezos-baker-signal-empty');
    if (empty && !empty.hidden) quietlyMutate(empty, () => { empty.hidden = true; });

    const next = status.nextBlock
        ? renderOperatorTile('Next round 0', status.nextBlock.eta, status.nextBlock.detail, 'ok', 'drawer-operator-next')
        : renderOperatorTile('Next round 0', 'No right found', 'No upcoming round 0 baking right returned', 'unknown', 'drawer-operator-next');
    const live = renderOperatorTile(
        'Baker working?',
        status.live.value,
        status.live.detail,
        status.live.state
    );
    const attest = renderOperatorTile('Attestation', status.attestation.value, status.attestation.detail, status.attestation.state);
    const dal = renderOperatorTile('DAL', status.dal.value, status.dal.detail, status.dal.state);
    const octez = renderOperatorTile(
        'Octez',
        status.octez?.version || 'Unknown',
        status.octez?.detail || 'TzKT delegate software',
        status.octez?.state || (status.octez?.known ? 'ok' : 'unknown')
    );

    const wasHidden = container.hidden;
    const signalHeading = !isBaker && bakerName && bakerName !== 'None'
        ? `Your baker signal · ${bakerName}`
        : (isBaker ? 'Baker signal' : 'Your baker signal');
    const html = `
        <div class="drawer-operator-panel">
            <div class="drawer-operator-header">
                <h3>${escapeHtml(signalHeading)}</h3>
                <p>Fresh round 0 rights, Octez version, and last ${RECENT_OPERATOR_ATTESTATIONS} attestations</p>
            </div>
            <div class="drawer-operator-grid">
                ${next}
                ${octez}
                ${live}
                ${attest}
                ${dal}
            </div>
        </div>
    `;
    if (container.children.length) quietlySyncHtml(container, html);
    else container.innerHTML = html;
    if (wasHidden) quietlyMutate(container, () => { container.hidden = false; });
}

function getGreeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
}


function getProtocolEra(firstActivityLevel) {
    let era = PROTOCOL_ERAS[0];
    for (const p of PROTOCOL_ERAS) {
        if (firstActivityLevel >= p.level) era = p;
    }
    return era;
}

function countUpgradesSince(firstActivityLevel) {
    return PROTOCOL_ERAS.filter(p => p.level > firstActivityLevel && countsAsProtocolUpgrade(p)).length;
}

function escapeAttr(value) {
    return escapeHtml(String(value ?? '')).replace(/"/g, '&quot;');
}

function safeTone(value) {
    return String(value || 'default').replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'default';
}

function formatStoryDate(value) {
    const time = new Date(value).getTime();
    if (!Number.isFinite(time)) return 'first activity';
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(time));
}

function formatStoryTenure(days) {
    const n = Number(days);
    if (!Number.isFinite(n) || n < 0) return 'New';
    if (n >= 365) return `${(n / 365.25).toFixed(1)} years`;
    return `${Math.max(1, Math.trunc(n)).toLocaleString()} days`;
}

function getStoryPersona(data) {
    const story = data.story;
    const traits = [];
    if (story.proposalsInjected > 0) traits.push('protocol author');
    else if (story.bakerProposalsInjected > 0) traits.push('governance-linked');
    if (data.isBaker) traits.push('baker');
    else if (data.bakerAddr) traits.push('delegator');
    if (hasCreatorStats(story.creatorStats)) traits.push('creator');
    if ((Number(story.nftAssetsCollected) || 0) > 0) traits.push('collector');
    if (data.isStaker) traits.push('staker');
    if (!traits.length) traits.push('on-chain participant');

    const era = story.upgradesSeen >= 15
        ? 'deep-history'
        : story.upgradesSeen >= 8
            ? 'seasoned'
            : 'new-era';
    return `${era} ${traits.slice(0, 3).join(' · ')}`;
}

function renderStoryMetric(label, value, detail, tone = 'default') {
    return `
        <div class="tezos-story-metric tezos-story-metric-${safeTone(tone)}">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value)}</strong>
            <small>${escapeHtml(detail)}</small>
        </div>
    `;
}

function renderStoryBadge(text, detail, tone = 'default') {
    return `
        <div class="tezos-story-badge tezos-story-badge-${safeTone(tone)}">
            <strong>${text}</strong>
            <span>${escapeHtml(detail)}</span>
        </div>
    `;
}

function renderStoryEraRail(story) {
    const eras = PROTOCOL_ERAS.filter(p => p.name !== 'Genesis');
    const joinIdx = eras.findIndex(p => p.name === story.joinedEra);
    const safeJoinIdx = joinIdx >= 0 ? joinIdx : 0;
    return `
        <div class="tezos-story-era-rail" aria-label="Protocol eras witnessed">
            ${eras.map((era, index) => {
                const witnessed = index >= safeJoinIdx;
                const joined = era.name === story.joinedEra;
                const current = era.name === story.currentEra;
                const state = joined ? 'joined' : current ? 'current' : witnessed ? 'witnessed' : 'before';
                return `<span class="tezos-story-era-dot ${state}" title="${escapeAttr(era.name)}">${escapeHtml(era.name[0] || '')}</span>`;
            }).join('')}
        </div>
    `;
}

function getStoryNextSignal(data) {
    if (data.activeProposal) {
        return {
            label: 'Now watching',
            value: `Active governance: ${data.activeProposal}`,
            tone: 'governance'
        };
    }
    if (data.bakerInactive) {
        return {
            label: 'Now watching',
            value: `${data.bakerName || 'Your baker'} is inactive, so rewards need attention.`,
            tone: 'risk'
        };
    }
    if (!data.hasRewardRole) {
        return {
            label: 'Reward status',
            value: 'This address is not currently baking, staking, or delegating.',
            tone: 'default'
        };
    }
    if (data.bakerVote && !data.bakerVote.voted) {
        const left = data.bakerVote.endTime ? ` · ${formatGovTimeLeft(data.bakerVote.endTime)} left` : '';
        return {
            label: 'Now watching',
            value: `${data.bakerName || 'Your baker'} has not voted${data.bakerVote.proposal ? ` on ${data.bakerVote.proposal}` : ''}${left}.`,
            tone: 'watch'
        };
    }
    if (data.rewardStreak > 1) {
        return {
            label: 'Now compounding',
            value: Number.isFinite(data.apyRate)
                ? `${data.rewardStreak} reward cycles in a row with ${data.apyRate}% APY context.`
                : `${data.rewardStreak} reward cycles in a row. The current APY estimate is unavailable.`,
            tone: 'rewards'
        };
    }
    return {
        label: 'Now watching',
        value: 'Quiet governance, live rewards, and the next cycle pulse.',
        tone: 'default'
    };
}

function buildStoryBadges(data) {
    const story = data.story;
    const badges = [];
    if (story.domainAlias) {
        badges.push(renderStoryBadge(`Known as ${escapeHtml(story.domainAlias)}`, 'Tezos Domains identity', 'identity'));
    }
    badges.push(renderStoryBadge(
        `Joined under ${escapeHtml(story.joinedEra)} · ${escapeHtml(String(story.upgradesSeen))} upgrades witnessed`,
        'Named protocol upgrades in your on-chain arc',
        'era'
    ));
    if (story.proposalsInjected > 0) {
        const names = story.proposalNames.length <= 4 ? ` · ${story.proposalNames.map(escapeHtml).join(', ')}` : '';
        badges.push(renderStoryBadge(
            `Injected ${escapeHtml(String(story.proposalsInjected))} accepted proposal${story.proposalsInjected > 1 ? 's' : ''}${names}`,
            'Direct protocol authorship',
            'governance'
        ));
    }
    if (story.bakerProposalsInjected > 0) {
        const names = story.bakerProposalNames.length <= 4 ? ` · ${story.bakerProposalNames.map(escapeHtml).join(', ')}` : '';
        badges.push(renderStoryBadge(
            `Baker injected ${escapeHtml(String(story.bakerProposalsInjected))} accepted proposal${story.bakerProposalsInjected > 1 ? 's' : ''}${names}`,
            'Governance lineage through your baker',
            'governance'
        ));
    }
    if (Number.isFinite(story.nftAssetsCollected)) {
        badges.push(renderStoryBadge(
            `Collected ${escapeHtml(fmtCount(story.nftAssetsCollected))} ${pluralize(story.nftAssetsCollected, 'NFT')}`,
            'Objkt collector trail',
            'collector'
        ));
    }
    if (hasCreatorStats(story.creatorStats)) {
        badges.push(renderStoryBadge(
            escapeHtml(getCreatorSummaryText(story.creatorStats)),
            'Creator footprint',
            'creator'
        ));
    }
    if (data.isBaker) {
        badges.push(renderStoryBadge('Baker account', 'Blocks, attestations, and delegators matter here', 'baker'));
    } else if (data.bakerAddr) {
        badges.push(renderStoryBadge(`Delegating to ${escapeHtml(data.bakerName || shortAddress(data.bakerAddr))}`, 'Your rewards depend on this baker lane', 'baker'));
    }
    if (data.isStaker) {
        badges.push(renderStoryBadge(
            'Staker',
            Number.isFinite(data.apyRate) ? `${data.apyRate}% APY context` : 'Current APY unavailable',
            'rewards'
        ));
    }
    return badges;
}

function renderTezosStoryBody(data) {
    const story = data.story;
    if (!story) {
        return '<div class="tezos-story-empty">No on-chain history found for this address yet.</div>';
    }

    const identity = story.domainAlias
        ? `Known as <strong>${escapeHtml(story.domainAlias)}</strong>`
        : `Address <strong>${escapeHtml(data.address)}</strong>`;
    const since = formatStoryDate(story.firstActivityTime || story.joinedDate);
    const nftValue = Number.isFinite(story.nftAssetsCollected)
        ? `${fmtCount(story.nftAssetsCollected)} ${pluralize(story.nftAssetsCollected, 'NFT')}`
        : `${fmtCompact(data.totalXTZ)} XTZ`;
    const nftDetail = Number.isFinite(story.nftAssetsCollected)
        ? `Collected ${fmtCount(story.nftAssetsCollected)} ${pluralize(story.nftAssetsCollected, 'NFT')}`
        : 'Portfolio footprint';
    const governanceCount = story.proposalsInjected + story.bakerProposalsInjected;
    const governanceValue = governanceCount > 0
        ? `${governanceCount} accepted`
        : (data.activeProposal ? 'active' : 'quiet');
    const governanceDetail = story.proposalsInjected > 0
        ? `${story.proposalsInjected} direct proposal${story.proposalsInjected > 1 ? 's' : ''}`
        : story.bakerProposalsInjected > 0
            ? `${story.bakerProposalsInjected} via baker`
            : data.activeProposal || 'No live proposal';
    const next = getStoryNextSignal(data);
    const badges = buildStoryBadges(data);

    return `
        <div class="tezos-story-dossier">
            <div class="tezos-story-identity">
                <span class="tezos-story-persona">${escapeHtml(getStoryPersona(data))}</span>
                <div class="tezos-story-name">${identity}</div>
                <div class="tezos-story-summary">
                    Joined under <strong>${escapeHtml(story.joinedEra)}</strong> · <strong>${escapeHtml(String(story.upgradesSeen))} named upgrades</strong> witnessed
                </div>
            </div>
            <div class="tezos-story-metrics">
                ${renderStoryMetric('On-chain since', formatStoryTenure(story.daysSinceJoin), `first seen ${since}`, 'time')}
                ${renderStoryMetric('Protocol arc', story.joinedEra, `now ${story.currentEra}`, 'era')}
                ${renderStoryMetric('Culture', nftValue, nftDetail, 'collector')}
                ${renderStoryMetric('Governance', governanceValue, governanceDetail, 'governance')}
            </div>
            <div class="tezos-story-badges">
                ${badges.join('')}
            </div>
            <div class="tezos-story-actions">
                <button class="tezos-era-share-btn" type="button">Share era card</button>
                <a href="/anthology/">Protocol Anthology</a>
            </div>
            ${renderStoryEraRail(story)}
            <div class="tezos-story-next tezos-story-next-${safeTone(next.tone)}">
                <span>${escapeHtml(next.label)}</span>
                <strong>${escapeHtml(next.value)}</strong>
            </div>
        </div>
    `;
}

// ─── Morning Brief ─────────────────────────────────────

/**
 * Build the Morning Brief — rotating card with 3 states
 */
// ─── Overnight Report ──────────────────────────────────

function saveOvernightSnapshot(data) {
    try {
        localStorage.setItem(OVERNIGHT_KEY, JSON.stringify({
            ts: Date.now(),
            address: data.fullAddress,
            balance: data.totalXTZ,
            staked: data.staked,
            xtzPrice: data.xtzPrice,
            usdValue: data.xtzPrice ? data.totalXTZ * data.xtzPrice : null,
            rewardsLastCycle: data.rewardsLastCycle,
            latestRewardCycle: data.latestRewardCycle,
            rewardStreak: data.rewardStreak,
            bakerName: data.bakerName,
            healthScore: data.healthScore,
            attestRate: data.attestRate,
            apyRate: data.apyRate,
        }));
    } catch {}
}

function getOvernightSnapshot(address = '') {
    try {
        const raw = localStorage.getItem(OVERNIGHT_KEY);
        const snapshot = raw ? JSON.parse(raw) : null;
        if (address && snapshot?.address !== address) return null;
        return snapshot;
    } catch { return null; }
}

function formatTimeSince(ms) {
    const hours = Math.floor(ms / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
}

function renderOvernightBullet(bullet) {
    const tone = ['positive', 'negative', 'neutral', 'network'].includes(bullet.tone)
        ? bullet.tone
        : 'neutral';
    return `<span class="overnight-bullet overnight-bullet-${tone}"><span aria-hidden="true">·</span><span>${escapeHtml(bullet.lead || '')}${bullet.value ? `<strong>${escapeHtml(bullet.value)}</strong>` : ''}${escapeHtml(bullet.tail || '')}</span></span>`;
}

function buildOvernightCard(data, snapshot) {
    if (!snapshot || !snapshot.ts) return null;
    const elapsed = Date.now() - snapshot.ts;
    if (elapsed < 3600000) return null; // Skip if < 1 hour

    const accountBullets = [];

    // Balance change (only show if we have a real previous balance to compare)
    const prevBalance = snapshot.balance;
    const balDelta = prevBalance != null && prevBalance > 0 ? data.totalXTZ - prevBalance : 0;
    if (Math.abs(balDelta) >= 0.01) {
        const sign = balDelta >= 0 ? '+' : '';
        accountBullets.push({
            lead: '',
            value: `${sign}${balDelta.toFixed(2)} XTZ`,
            tail: ' balance change',
            tone: balDelta >= 0 ? 'positive' : 'negative'
        });
    }

    // USD delta
    if (data.xtzPrice && snapshot.usdValue) {
        const usdDelta = (data.totalXTZ * data.xtzPrice) - snapshot.usdValue;
        if (Math.abs(usdDelta) >= 0.01) {
            const sign = usdDelta >= 0 ? '+' : '';
            accountBullets.push({
                lead: 'Portfolio ',
                value: `${sign}$${Math.abs(usdDelta).toFixed(2)}`,
                tail: ' in USD',
                tone: usdDelta >= 0 ? 'positive' : 'negative'
            });
        }
    }

    // Price movement
    if (data.xtzPrice && snapshot.xtzPrice) {
        const pricePct = ((data.xtzPrice - snapshot.xtzPrice) / snapshot.xtzPrice) * 100;
        if (Math.abs(pricePct) >= 0.5) {
            const sign = pricePct >= 0 ? '+' : '';
            accountBullets.push({
                lead: 'XTZ price ',
                value: `${sign}${pricePct.toFixed(1)}%`,
                tail: ` ($${data.xtzPrice.toFixed(3)})`,
                tone: pricePct >= 0 ? 'positive' : 'negative'
            });
        }
    }

    // Rewards
    if (data.rewardsLastCycle > 0) {
        const usd = data.xtzPrice ? ` ($${(data.rewardsLastCycle * data.xtzPrice).toFixed(2)})` : '';
        const cycle = Number.isFinite(data.latestRewardCycle) ? ` in cycle ${data.latestRewardCycle}` : '';
        accountBullets.push({
            lead: 'Latest reward record: ',
            value: `+${data.rewardsLastCycle.toFixed(2)} XTZ`,
            tail: `${usd}${cycle}`,
            tone: 'positive'
        });
    }

    // Baker health change
    if (snapshot.healthScore !== null && data.healthScore !== null && snapshot.healthScore !== data.healthScore) {
        const better = data.healthScore > snapshot.healthScore;
        accountBullets.push({
            lead: 'Baker cycle attestation power ',
            value: better ? 'improved' : 'declined',
            tail: ` — ${data.health.icon} ${data.attestRate || ''}%`,
            tone: better ? 'positive' : 'negative'
        });
    }

    // Streak milestone
    if (data.rewardStreak > 0 && data.rewardStreak > (snapshot.rewardStreak || 0)) {
        accountBullets.push({
            lead: 'Reward streak: ',
            value: `${data.rewardStreak} cycles`,
            tail: ' 🔥',
            tone: 'positive'
        });
    }

    // Calm account fallback
    if (accountBullets.length === 0) {
        if (!data.hasRewardRole) {
            accountBullets.push({ lead: 'Your ', value: `${fmtCompact(data.totalXTZ)} XTZ`, tail: ' has no active baking, staking, or delegation reward role', tone: 'neutral' });
        } else if (data.activeRewardEstimate && Number.isFinite(data.apyRate)) {
            accountBullets.push({ lead: 'Your eligible stake has a current estimate of ', value: `${data.apyRate}% APY`, tone: 'neutral' });
        } else if (data.apyBasis === 'gross-delegation-context' && Number.isFinite(data.apyRate)) {
            accountBullets.push({ lead: 'Gross delegation context is ', value: `${data.apyRate}%`, tail: ' before your baker’s off-chain fee and payout policy', tone: 'neutral' });
        } else {
            accountBullets.push({ lead: 'Your ', value: `${fmtCompact(data.totalXTZ)} XTZ`, tail: ' is connected, but the current APY estimate is unavailable', tone: 'neutral' });
        }
    }

    return {
        elapsed,
        bullets: accountBullets.slice(0, 3)
    };
}

function ensureDailySinceWording(signal) {
    const text = String(signal?.text || '').trim();
    const since = String(signal?.since || '').trim();
    if (!text || !since || text.toLowerCase().includes(since.toLowerCase())) return text;
    return `${text.replace(/[.\s]+$/, '')} ${since}.`;
}

function buildNetworkAwayBullets() {
    return getDailyDeltaSignalSummaries(2).map(signal => ({
        lead: `${signal.title}: `,
        value: '',
        tail: `${ensureDailySinceWording(signal)}${signal.context ? ` ${signal.context}` : ''}`,
        tone: 'network',
        referenceAt: signal.referenceAt
    }));
}

function buildWhileAwayReport() {
    const activeAddress = String(window._myTezosData?.fullAddress || localStorage.getItem(STORAGE_KEY) || '');
    const account = activeAddress && _activeOvernightAddress === activeAddress
        ? _activeOvernightReport
        : null;
    const networkBullets = buildNetworkAwayBullets();
    const accountBullets = account?.bullets || [];
    if (!accountBullets.length && !networkBullets.length) return null;
    const networkReferenceAt = Number(networkBullets.find(bullet => Number.isFinite(bullet.referenceAt))?.referenceAt);
    const elapsed = Number.isFinite(account?.elapsed)
        ? account.elapsed
        : Number.isFinite(networkReferenceAt)
            ? Math.max(0, Date.now() - networkReferenceAt)
            : 0;
    return {
        elapsed,
        accountBullets: accountBullets.slice(0, 3),
        networkBullets: networkBullets.slice(0, 2)
    };
}

function renderWhileAwayNetworkCard() {
    const slot = document.querySelector('#drawer-network [data-network-away-slot]');
    if (!slot) return;
    const report = buildWhileAwayReport();
    const html = report ? `
        <article class="network-away-card" data-quiet-key="network-away-card">
            <header class="network-away-head">
                <span class="network-away-mark" aria-hidden="true">◔</span>
                <div>
                    <small class="network-away-eyebrow">${escapeHtml(formatTimeSince(report.elapsed))} ago</small>
                    <h4>While you were away</h4>
                </div>
            </header>
            <div class="network-away-sections">
                ${report.accountBullets.length ? `
                    <section data-away-section="account">
                        <small>Your account</small>
                        <div class="overnight-bullets">${report.accountBullets.map(renderOvernightBullet).join('')}</div>
                    </section>
                ` : ''}
                ${report.networkBullets.length ? `
                    <section data-away-section="network">
                        <small>Tezos network</small>
                        <div class="overnight-bullets">${report.networkBullets.map(renderOvernightBullet).join('')}</div>
                    </section>
                ` : ''}
            </div>
        </article>
    ` : '';
    quietlySyncHtml(slot, html);
}

function buildMorningBrief(data) {
    const cards = [];

    if (data.bakerVote && !data.bakerVote.voted) {
        const v = data.bakerVote;
        const timeLeft = v.endTime ? formatGovTimeLeft(v.endTime) : '';
        const proposal = v.proposal ? escapeHtml(v.proposal) : 'the current governance period';
        const action = v.voteType === 'upvote' ? 'has not upvoted any proposal' : 'has not voted';
        const quorum = v.quorumPct !== null && v.quorumPct !== undefined
            ? `<br><span class="brief-sub">Participation: ${v.quorumPct.toFixed(1)}%${v.yayPct !== null && v.yayPct !== undefined ? ` · ${v.yayPct.toFixed(1)}% yay` : ''}</span>`
            : '';
        cards.push({
            icon: '🏛️',
            title: 'Vote Check',
            body: `<strong>${escapeHtml(data.bakerName || 'Your baker')}</strong> ${action} on ${proposal}.${timeLeft ? ` <span class="brief-sub">${timeLeft} left.</span>` : ''}${quorum}<br><span class="brief-sub"><a href="#chamber">Open Chamber</a> · <a href="/feed.xml" type="application/rss+xml">RSS feed</a></span>`,
            accent: 'governance',
        });
    }

    // Card 1: Earnings summary
    const usdNote = data.xtzPrice ? ` That's $${(data.rewardsLastCycle * data.xtzPrice).toFixed(2)}.` : '';
    const bakerInactive = data.bakerInactive;
    let earningsLine, dailyLine;
    if (!data.hasRewardRole) {
        earningsLine = `<strong>${fmtCompact(data.totalXTZ)} XTZ</strong> — not currently baking, staking, or delegating`;
        dailyLine = 'No active reward estimate';
    } else if (bakerInactive) {
        earningsLine = `<strong>${fmtCompact(data.totalXTZ)} XTZ</strong> — <strong style="color:#ef4444">baker inactive</strong>`;
        dailyLine = `<span style="color:#ef4444">⚠️ No forward reward estimate shown; review or re-delegate</span>`;
    } else if (data.rewardsLastCycle > 0) {
        const cycle = Number.isFinite(data.latestRewardCycle) ? ` in cycle ${data.latestRewardCycle}` : '';
        earningsLine = `<strong>+${data.rewardsLastCycle.toFixed(2)} XTZ</strong> recorded${cycle}${usdNote}`;
        dailyLine = data.activeRewardEstimate && Number.isFinite(data.estDaily) && Number.isFinite(data.apyRate)
            ? `~${data.estDaily.toFixed(2)} XTZ/day · ${data.apyRate}% APY estimate`
            : data.apyBasis === 'gross-delegation-context' && Number.isFinite(data.apyRate)
                ? `${data.apyRate}% gross protocol context; baker payout policy varies`
                : 'Current APY estimate unavailable';
    } else if (data.activeRewardEstimate && Number.isFinite(data.apyRate) && Number.isFinite(data.estDaily)) {
        earningsLine = `<strong>${fmtCompact(data.totalXTZ)} XTZ</strong> with an estimated <strong>${data.apyRate}% APY</strong>`;
        dailyLine = `~${data.estDaily.toFixed(2)} XTZ/day estimate`;
    } else if (data.apyBasis === 'gross-delegation-context' && Number.isFinite(data.apyRate)) {
        earningsLine = `<strong>${fmtCompact(data.totalXTZ)} XTZ</strong> · <strong>${data.apyRate}% gross protocol context</strong>`;
        dailyLine = 'No personal projection: your baker’s off-chain fee and payout policy determine delegation rewards';
    } else {
        earningsLine = `<strong>${fmtCompact(data.totalXTZ)} XTZ</strong> — reward rate unavailable`;
        dailyLine = 'Could not calculate a current APY estimate';
    }
    cards.push({
        icon: '💰',
        title: `${getGreeting()}.`,
        body: `${earningsLine}<br><span class="brief-sub">${dailyLine}</span>`,
        accent: 'earnings',
    });

    // Card 2: Baker health + streak + governance vote status
    const streakText = data.rewardStreak > 0
        ? `<strong>${data.rewardStreak}-cycle streak</strong> 🔥`
        : '';
    let healthText;
    if (data.bakerInactive) {
        healthText = `<strong>${escapeHtml(data.bakerName)}</strong> — <strong style="color:#ef4444">inactive ⚠️</strong>`;
    } else if (data.operatorStatus?.live) {
        const live = data.operatorStatus.live;
        const color = live.state === 'issue' ? 'var(--color-error, #ef4444)' : live.state === 'ok' ? 'var(--color-success, #10b981)' : 'var(--text-dim, #888)';
        healthText = `<strong>${escapeHtml(data.bakerName)}</strong> — <strong style="color:${color}">${escapeHtml(live.value)}</strong><br><span class="brief-sub">${escapeHtml(live.detail)}</span>`;
    } else if (data.healthScore !== null && data.attestRate) {
        healthText = `<strong>${escapeHtml(data.bakerName)}</strong> ${data.health.icon} ${data.attestRate}% cycle attestation power`;
    } else {
        healthText = `<strong>${escapeHtml(data.bakerName || 'No baker')}</strong>`;
    }
    // Baker governance vote indicator with urgency + quorum context
    let voteText = '';
    if (data.bakerVote) {
        const v = data.bakerVote;
        const urgency = v.urgency || 0;
        
        if (v.voted) {
            if (v.voteType === 'upvote') {
                voteText = `<br><span class="brief-sub">✅ Upvoted proposals this period</span>`;
            } else {
                const voteEmoji = v.vote === 'yay' ? '✅' : v.vote === 'nay' ? '❌' : '⏸️';
                voteText = `<br><span class="brief-sub">${voteEmoji} Voted <strong>${v.vote}</strong> on ${escapeHtml(v.proposal)}</span>`;
            }
        } else {
            // Time-weighted urgency: gentle early, red alert late
            const isLate = urgency > 0.7;
            const isUrgent = urgency > 0.85;
            const color = isUrgent ? 'var(--color-error, #ef4444)' : isLate ? 'var(--color-warning, #f59e0b)' : 'var(--text-dim, #888)';
            const icon = isUrgent ? '🚨' : '⚠️';
            const timeLeft = v.endTime ? formatGovTimeLeft(v.endTime) : '';
            const urgencyNote = isUrgent ? ' — TIME RUNNING OUT' : isLate ? ' — period ending soon' : '';
            
            if (v.voteType === 'upvote') {
                voteText = `<br><span class="brief-sub" style="color:${color}">${icon} <strong>No proposal upvotes</strong> this period${urgencyNote}${timeLeft ? ' (' + timeLeft + ' left)' : ''}</span>`;
            } else {
                const leftCopy = timeLeft ? `${timeLeft} left` : 'time remains';
                voteText = `<br><span class="brief-sub" style="color:${color}">${icon} Your baker hasn't weighed in on ${escapeHtml(v.proposal)} yet — ${escapeHtml(leftCopy)}. History is written by the ones who show up.</span>`;
            }
        }
        
        // Quorum/supermajority context (exploration/promotion only)
        if (v.quorumPct !== null && v.quorumPct !== undefined) {
            const daysLeft = daysLeftInPeriod(v.endTime);
            const quorumNeeded = Number.isFinite(Number(v.quorumNeeded)) ? Number(v.quorumNeeded) : null;
            const lateAndLow = daysLeft !== null && daysLeft <= 2 && quorumNeeded !== null && v.quorumPct < quorumNeeded;
            const qColor = lateAndLow ? 'var(--color-warning, #f59e0b)' : 'var(--text-dim, #888)';
            const supermajority = v.yayPct !== null ? ` • ${v.yayPct.toFixed(1)}% yay (needs 80%)` : '';
            const daysCopy = daysLeft === null
                ? 'Time remains.'
                : `${daysLeft} days remain.`;
            const quorumCopy = lateAndLow && quorumNeeded !== null
                ? `🗳️ ${v.quorumPct.toFixed(1)}% — quorum needs ${quorumNeeded.toFixed(1)}%. ${daysCopy}`
                : `🗳️ ${v.quorumPct.toFixed(1)}% so far — ballots usually land in the final days. ${daysCopy}`;
            voteText += `<br><span class="brief-sub" style="font-size:0.85em;color:${qColor}">${escapeHtml(quorumCopy)}${supermajority}</span>`;
        }
    }
    if (data.bakerAddr) {
        cards.push({
            icon: '🍞',
            title: 'Baker Status',
            body: `${streakText}${streakText ? '<br>' : ''}${healthText}${voteText}`,
            accent: 'baker',
        });
    }

    cards.push({
        icon: '📜',
        title: 'Your Tezos Story',
        body: renderTezosStoryBody(data),
        accent: 'story',
        shareBtn: !!data.story,
    });

    return cards;
}

function daysLeftInPeriod(endTime) {
    if (!endTime) return null;
    const diff = new Date(endTime).getTime() - Date.now();
    if (!Number.isFinite(diff)) return null;
    return Math.max(0, Math.ceil(diff / 86400000));
}

// ─── Tezos Story Card ──────────────────────────────────

async function fetchTezosStory(address, account, bakerAddress) {
    await ensureProtocolEras();
    const firstActivity = account.firstActivity;
    const firstActivityTime = account.firstActivityTime;
    if (!firstActivity) return null;

    const joinedEra = getProtocolEra(firstActivity);
    const upgradesSeen = countUpgradesSince(firstActivity);
    const daysSinceJoin = Math.floor((Date.now() - new Date(firstActivityTime).getTime()) / 86400000);

    // Fetch governance proposal attribution.
    let proposalsInjected = 0;
    let proposalNames = [];
    let nftAssetsCollected = null;
    let creatorStats = null;
    let domainAlias = null;

    let bakerProposalsInjected = 0;
    let bakerProposalNames = [];
    try {
        const allProposals = await fetchTzktJson(`${TZKT}/voting/proposals?limit=200`);
        const accepted = allProposals.filter(p => p.status === 'accepted' && p.initiator?.address === address);
        proposalsInjected = accepted.length;
        proposalNames = accepted.map(p => (p.extras?.alias) || p.hash.slice(0, 8)).filter(Boolean);
        if (bakerAddress && bakerAddress !== address) {
            const bakerAccepted = allProposals.filter(p => p.status === 'accepted' && p.initiator?.address === bakerAddress);
            bakerProposalsInjected = bakerAccepted.length;
            bakerProposalNames = bakerAccepted.map(p => (p.extras?.alias) || p.hash.slice(0, 8)).filter(Boolean);
        }
    } catch {}

    try {
        const profile = await fetchObjktProfile(address);
        nftAssetsCollected = profile?.collector
            ? Math.max(0, Math.trunc(Number(profile.collector.uniqueAssetsHeld ?? profile.collector.totalHeld) || 0))
            : 0;
        if (profile?.creator) {
            creatorStats = {
                totalCreated: Math.max(0, Math.trunc(Number(profile.creator.totalCreated) || 0)),
                collectionCount: Array.isArray(profile.creator.collections) ? profile.creator.collections.length : 0,
                totalSalesCount: Math.max(0, Math.trunc(Number(profile.creator.totalSalesCount) || 0)),
                totalSalesVolume: Math.max(0, Number(profile.creator.totalSalesVolume) || 0)
            };
        }
    } catch {}

    domainAlias = await resolveTezReverseName(address);

    return {
        joinedEra: joinedEra.name,
        joinedDate: joinedEra.date,
        firstActivityTime,
        upgradesSeen,
        daysSinceJoin,
        proposalsInjected,
        proposalNames,
        bakerProposalsInjected,
        bakerProposalNames,
        nftAssetsCollected,
        creatorStats,
        domainAlias,
        currentEra: PROTOCOL_ERAS[PROTOCOL_ERAS.length - 1].name,
    };
}

function anniversaryYears(firstActivityTime) {
    const first = new Date(firstActivityTime);
    const now = new Date();
    if (Number.isNaN(first.getTime())) return 0;
    if (first.getMonth() !== now.getMonth() || first.getDate() !== now.getDate()) return 0;
    return Math.max(0, now.getFullYear() - first.getFullYear());
}

function anniversaryKey(address) {
    return `${ANNIVERSARY_KEY_PREFIX}-${String(address || '').trim()}`;
}

async function shareAnniversaryCard(details, button) {
    const original = button?.textContent || '';
    try {
        if (button) {
            button.disabled = true;
            button.textContent = '...';
        }
        const { loadHtml2Canvas, showShareModal, appendCardSeal } = await import('../ui/share.js');
        await loadHtml2Canvas();
        const yearsLabel = `${details.years} year${details.years === 1 ? '' : 's'}`;
        const heading = details.heading || `${yearsLabel} on Tezos`;
        const kicker = details.kicker || 'Tezos Anniversary';
        const card = document.createElement('div');
        card.style.cssText = `
            position:fixed;left:-9999px;top:0;width:620px;padding:42px 42px 72px;
            background:#0a0e1a;color:#fff;border:1px solid rgba(0,212,255,0.22);
            border-radius:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
            overflow:hidden;box-sizing:border-box;
        `;
        card.innerHTML = `
            <div style="position:absolute;inset:0;background:radial-gradient(circle at 22% 18%,rgba(0,212,255,0.12),transparent 34%),linear-gradient(rgba(0,212,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(0,212,255,0.025) 1px,transparent 1px);background-size:auto,22px 22px,22px 22px;pointer-events:none;"></div>
            <div style="position:relative;z-index:1;">
                <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;color:rgba(0,212,255,0.62);margin-bottom:12px;">${escapeHtml(kicker)}</div>
                <div style="font-size:42px;line-height:1.05;font-weight:900;color:#fff;margin-bottom:18px;">${escapeHtml(heading)}</div>
                <p style="font-size:20px;line-height:1.45;color:rgba(255,255,255,0.78);margin:0 0 24px;">Joined in the <strong style="color:#00d4ff;">${escapeHtml(details.era)}</strong> era — <strong style="color:#00d4ff;">${details.upgrades}</strong> named on-chain upgrades witnessed.</p>
                <div style="display:flex;gap:10px;flex-wrap:wrap;">
                    <span style="font-size:12px;border:1px solid rgba(255,255,255,0.1);border-radius:999px;padding:7px 10px;color:rgba(255,255,255,0.76);">First seen ${escapeHtml(String(details.joinYear))}</span>
                    <span style="font-size:12px;border:1px solid rgba(255,255,255,0.1);border-radius:999px;padding:7px 10px;color:rgba(255,255,255,0.76);">Self-amending since day one</span>
                </div>
            </div>
        `;
        document.body.appendChild(card);
        appendCardSeal(card);
        const canvas = await html2canvas(card, {
            backgroundColor: '#0a0e1a',
            scale: 2,
            useCORS: true,
            logging: false,
            width: 620,
            windowWidth: 620
        });
        card.remove();
        const tweetOptions = [
            { label: '🎂 Anniversary', text: `${details.years} years on Tezos today. Joined in the ${details.era} era and witnessed ${details.upgrades} named on-chain upgrades.\n\ntezos.systems` },
            { label: '📜 Story', text: `My Tezos story: since ${details.era} (${details.joinYear}), through ${details.upgrades} named self-amendments on Tezos.\n\ntezos.systems` },
        ];
        showShareModal(canvas, tweetOptions, kicker);
    } catch (error) {
        console.error('Anniversary share failed:', error);
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = original;
        }
    }
}

function shareEraCard(data, button) {
    const story = data?.story;
    if (!story) return;
    const first = new Date(story.firstActivityTime || story.joinedDate);
    const years = Math.max(1, anniversaryYears(story.firstActivityTime || story.joinedDate) || Math.floor((story.daysSinceJoin || 365) / 365));
    const details = {
        years,
        era: story.joinedEra,
        upgrades: story.upgradesSeen,
        joinYear: Number.isNaN(first.getTime()) ? '' : first.getFullYear(),
        heading: `${story.joinedEra} era account`,
        kicker: 'Tezos Era Card'
    };
    shareAnniversaryCard(details, button);
}

function showAnniversaryToast(details, done, duration = 12000) {
    let container = document.getElementById('moments-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'moments-toast-container';
        document.body.appendChild(container);
    }

    const yearsLabel = `${details.years} year${details.years === 1 ? '' : 's'}`;
    const toast = document.createElement('div');
    toast.className = 'moment-toast tezos-anniversary-toast';
    toast.innerHTML = `
        <div class="moment-toast-header"><span class="moment-toast-label">🎂 Tezos Anniversary</span></div>
        <div class="moment-toast-title">${escapeHtml(yearsLabel)} on Tezos today.</div>
        <div class="moment-toast-body">Joined in the ${escapeHtml(details.era)} era — ${details.upgrades} named on-chain upgrades witnessed.</div>
        <div class="moment-toast-actions">
            <button class="moment-toast-share" type="button">Share</button>
            <button class="moment-toast-dismiss" type="button">Dismiss</button>
        </div>
        <div class="moment-toast-progress"><div class="moment-toast-progress-bar"></div></div>
    `;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('visible'));
    const bar = toast.querySelector('.moment-toast-progress-bar');
    requestAnimationFrame(() => {
        if (!bar) return;
        bar.style.transition = `width ${duration}ms linear`;
        bar.style.width = '0%';
    });

    let closed = false;
    const close = () => {
        if (closed) return;
        closed = true;
        clearTimeout(timer);
        toast.classList.remove('visible');
        toast.classList.add('exiting');
        setTimeout(() => {
            toast.remove();
            done?.();
        }, 400);
    };
    const timer = setTimeout(close, duration);
    toast.querySelector('.moment-toast-share')?.addEventListener('click', (event) => {
        shareAnniversaryCard(details, event.currentTarget);
    });
    toast.querySelector('.moment-toast-dismiss')?.addEventListener('click', close);
}

function maybeQueueAnniversaryToast(data) {
    const story = data?.story;
    const fullAddress = data?.fullAddress;
    if (!story?.firstActivityTime || !fullAddress) return;
    const years = anniversaryYears(story.firstActivityTime);
    if (years < 1) return;

    const now = new Date();
    const key = anniversaryKey(fullAddress);
    try {
        if (localStorage.getItem(key) === String(now.getFullYear())) return;
        localStorage.setItem(key, String(now.getFullYear()));
    } catch (_) {}

    const first = new Date(story.firstActivityTime);
    const details = {
        years,
        era: story.joinedEra,
        upgrades: story.upgradesSeen,
        joinYear: Number.isNaN(first.getTime()) ? '' : first.getFullYear()
    };

    enqueueToast({
        priority: 2,
        duration: 12000,
        show: (done, duration) => showAnniversaryToast(details, done, duration)
    });
}

/**
 * Share Tezos Story as PNG card
 */
async function shareTezosStory(data) {
    try {
        const { loadHtml2Canvas, showShareModal, appendCardSeal } = await import('../ui/share.js');
        await loadHtml2Canvas();

        const isMatrix = document.body.getAttribute('data-theme') === 'matrix';
        const bgColor = isMatrix ? '#0a0a0a' : '#0a0a14';
        const brand = isMatrix ? '#00ff00' : '#00d4ff';
        const brandRgb = isMatrix ? '0,255,0' : '0,212,255';

        const wrapper = document.createElement('div');
        wrapper.style.cssText = `
            position: fixed; top: -9999px; left: -9999px;
            width: 600px; height: 630px;
            background: linear-gradient(135deg, ${bgColor} 0%, ${isMatrix ? '#0a120a' : '#0a0a1e'} 100%);
            font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
            color: white; overflow: hidden;
            display: flex; flex-direction: column;
            align-items: center; justify-content: center;
            padding: 48px 48px 72px;
            box-sizing: border-box;
        `;

        // Build protocol badge trail
        const badgeEras = PROTOCOL_ERAS.filter(p => p.name !== 'Genesis');
        const joinIdx = badgeEras.findIndex(p => p.name === data.story.joinedEra);
        const proposalLinesHtml = [
            data.story.proposalsInjected > 0
                ? `Injected <span style="color:${brand};font-weight:700;">${data.story.proposalsInjected} accepted proposal${data.story.proposalsInjected > 1 ? 's' : ''}</span><br>`
                : '',
            data.story.bakerProposalsInjected > 0
                ? `Baker injected <span style="color:${brand};font-weight:700;">${data.story.bakerProposalsInjected} accepted proposal${data.story.bakerProposalsInjected > 1 ? 's' : ''}</span><br>`
                : ''
        ].join('');
        const nftLineHtml = Number.isFinite(data.story.nftAssetsCollected)
            ? `Collected <span style="color:${brand};font-weight:700;">${fmtCount(data.story.nftAssetsCollected)} ${pluralize(data.story.nftAssetsCollected, 'NFT')}</span><br>`
            : '';
        const domainLineHtml = data.story.domainAlias
            ? `Known as <span style="color:${brand};font-weight:700;">${escapeHtml(data.story.domainAlias)}</span><br>`
            : '';
        const creatorLineHtml = hasCreatorStats(data.story.creatorStats)
            ? `${getCreatorSummaryHtml(data.story.creatorStats, brand)}<br>`
            : '';
        const badgesHtml = badgeEras.map((p, i) => {
            const isJoined = p.name === data.story.joinedEra;
            const isCurrent = i === badgeEras.length - 1;
            const isWitnessed = i >= joinIdx;
            const opacity = isWitnessed ? 1 : 0.2;
            const bg = isJoined ? brand : (isCurrent ? brand : `rgba(${brandRgb}, ${isWitnessed ? 0.15 : 0.05})`);
            const color = (isJoined || isCurrent) ? bgColor : `rgba(255,255,255,${isWitnessed ? 0.7 : 0.2})`;
            const border = isJoined ? `2px solid ${brand}` : `1px solid rgba(${brandRgb}, ${isWitnessed ? 0.3 : 0.1})`;
            const shadow = isJoined ? `0 0 12px rgba(${brandRgb}, 0.5)` : 'none';
            return `<div style="width:24px;height:24px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;
                font-size:8px;font-weight:900;font-family:'Orbitron',sans-serif;
                background:${bg};color:${color};border:${border};box-shadow:${shadow};opacity:${opacity};
                flex-shrink:0;">${p.name[0]}</div>`;
        }).join('');

        wrapper.innerHTML = `
            <div style="position:absolute;top:0;left:0;right:0;bottom:0;pointer-events:none;
                background:radial-gradient(ellipse at 30% 20%, rgba(${brandRgb},0.08) 0%, transparent 50%),
                radial-gradient(ellipse at 70% 80%, rgba(${brandRgb},0.04) 0%, transparent 50%);"></div>
            <div style="position:absolute;top:12px;left:12px;right:12px;bottom:12px;
                border:1px solid rgba(${brandRgb},0.15);border-radius:12px;pointer-events:none;"></div>

            <div style="position:relative;z-index:1;text-align:center;">
                <div style="font-family:'Orbitron',sans-serif;font-size:14px;font-weight:600;
                    color:rgba(${brandRgb},0.5);letter-spacing:3px;text-transform:uppercase;margin-bottom:8px;">
                    YOUR TEZOS STORY
                </div>
                <div style="font-family:'Orbitron',sans-serif;font-size:24px;font-weight:900;
                    color:${brand};letter-spacing:3px;text-transform:uppercase;margin-bottom:24px;
                    text-shadow:0 0 30px rgba(${brandRgb},0.5);">
                    TEZOS SYSTEMS
                </div>

                <div style="width:200px;height:1px;background:linear-gradient(90deg,transparent,rgba(${brandRgb},0.4),transparent);margin:0 auto 32px;"></div>

                <div style="font-size:48px;font-weight:900;font-family:'Orbitron',sans-serif;
                    color:${brand};margin-bottom:8px;line-height:1;
                    text-shadow:0 0 40px rgba(${brandRgb},0.4);">
                    ${data.story.daysSinceJoin.toLocaleString()}
                </div>
                <div style="font-size:14px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:2px;margin-bottom:32px;">
                    Days on Tezos
                </div>

                <div style="font-size:16px;color:rgba(255,255,255,0.7);line-height:1.8;margin-bottom:24px;">
                    ${domainLineHtml}
                    Joined under <span style="color:${brand};font-weight:700;">${data.story.joinedEra}</span><br>
                    Witnessed <span style="color:${brand};font-weight:700;">${data.story.upgradesSeen} protocol upgrades</span><br>
                    ${proposalLinesHtml}
                    ${nftLineHtml}
                    ${creatorLineHtml}
                    Named upgrades through Tezos on-chain governance.
                </div>

                <div style="display:flex;gap:3px;justify-content:center;flex-wrap:wrap;max-width:500px;margin:0 auto;">
                    ${badgesHtml}
                </div>
            </div>

            <div style="position:absolute;bottom:44px;left:40px;right:40px;display:flex;justify-content:space-between;align-items:center;z-index:1;">
                <span style="font-size:13px;color:rgba(255,255,255,0.3);">${data.address}</span>
                <span style="font-size:13px;color:${brand};font-weight:600;letter-spacing:1px;">tezos.systems</span>
            </div>
        `;

        document.body.appendChild(wrapper);
        appendCardSeal(wrapper);
        const canvas = await html2canvas(wrapper, {
            backgroundColor: bgColor, scale: 2, useCORS: true, logging: false,
            width: 600, height: 630, windowWidth: 600
        });
        wrapper.remove();

        const injectedLines = [
            data.story.proposalsInjected > 0
                ? `📜 ${data.story.proposalsInjected} accepted proposal${data.story.proposalsInjected > 1 ? 's' : ''} injected`
                : '',
            data.story.bakerProposalsInjected > 0
                ? `📜 My baker injected ${data.story.bakerProposalsInjected} accepted proposal${data.story.bakerProposalsInjected > 1 ? 's' : ''}`
                : ''
        ].filter(Boolean);
        const injectedLine = injectedLines.length ? `\n${injectedLines.join('\n')}` : '';
        const nftLine = Number.isFinite(data.story.nftAssetsCollected)
            ? `\n🖼️ ${fmtCount(data.story.nftAssetsCollected)} ${pluralize(data.story.nftAssetsCollected, 'NFT')} collected`
            : '';
        const nftSentence = Number.isFinite(data.story.nftAssetsCollected)
            ? ` Collected ${fmtCount(data.story.nftAssetsCollected)} ${pluralize(data.story.nftAssetsCollected, 'NFT')}.`
            : '';
        const domainSentence = data.story.domainAlias ? ` Known as ${data.story.domainAlias}.` : '';
        const domainLine = data.story.domainAlias ? `\n🌐 ${data.story.domainAlias}` : '';
        const creatorSummary = hasCreatorStats(data.story.creatorStats) ? getCreatorSummaryText(data.story.creatorStats) : '';
        const creatorSentence = creatorSummary ? ` ${creatorSummary}.` : '';
        const creatorLine = creatorSummary ? `\n🎨 ${creatorSummary}` : '';
        const storyProposalSentence = [
            data.story.proposalsInjected > 0 ? ` Injected ${data.story.proposalsInjected} accepted proposal${data.story.proposalsInjected > 1 ? 's' : ''}.` : '',
            data.story.bakerProposalsInjected > 0 ? ` My baker injected ${data.story.bakerProposalsInjected} accepted proposal${data.story.bakerProposalsInjected > 1 ? 's' : ''}.` : ''
        ].join('');
        const ogProposalSentence = [
            data.story.proposalsInjected > 0 ? ` ${data.story.proposalsInjected} proposal${data.story.proposalsInjected > 1 ? 's' : ''} I injected became Tezos law.` : '',
            data.story.bakerProposalsInjected > 0 ? ` My baker injected ${data.story.bakerProposalsInjected} proposal${data.story.bakerProposalsInjected > 1 ? 's' : ''} that became Tezos law.` : ''
        ].join('');
        const tweetOptions = [
            { label: '📜 Story', text: `I've been on Tezos for ${data.story.daysSinceJoin.toLocaleString()} days.${domainSentence} Joined under ${data.story.joinedEra}. Witnessed ${data.story.upgradesSeen} named protocol upgrades.${storyProposalSentence}${nftSentence}${creatorSentence}\n\nWhat's your Tezos story?\ntezos.systems` },
            { label: '🏛️ OG', text: `${data.story.joinedEra} era. ${data.story.upgradesSeen} named upgrades witnessed. ${data.story.daysSinceJoin.toLocaleString()} days and counting.${domainSentence}${ogProposalSentence}${nftSentence}${creatorSentence}\n\nTezos upgrades through binding on-chain governance.\ntezos.systems` },
            { label: '📊 Data', text: `My Tezos Story:${domainLine}\n\n📅 ${data.story.daysSinceJoin.toLocaleString()} days on-chain\n🏛️ Joined: ${data.story.joinedEra}\n🔄 ${data.story.upgradesSeen} named upgrades witnessed${injectedLine}${nftLine}${creatorLine}\n\ntezos.systems` },
        ];

        showShareModal(canvas, tweetOptions, 'Your Tezos Story');
    } catch (err) {
        console.error('Story share error:', err);
    }
}

/**
 * Share Morning Brief as PNG
 */
async function shareMorningBrief(data) {
    try {
        const { loadHtml2Canvas, showShareModal } = await import('../ui/share.js');
        await loadHtml2Canvas();

        const isMatrix = document.body.getAttribute('data-theme') === 'matrix';
        const bgColor = isMatrix ? '#0a0a0a' : '#0a0a14';
        const brand = isMatrix ? '#00ff00' : '#00d4ff';
        const brandRgb = isMatrix ? '0,255,0' : '0,212,255';

        const wrapper = document.createElement('div');
        wrapper.style.cssText = `
            position: fixed; top: -9999px; left: -9999px;
            width: 500px; padding: 32px;
            background: linear-gradient(135deg, ${bgColor} 0%, ${isMatrix ? '#0a120a' : '#0a0a1e'} 100%);
            font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
            color: white; border-radius: 16px;
            border: 1px solid rgba(${brandRgb}, 0.2);
        `;

        const sysFont = "-apple-system, BlinkMacSystemFont, 'Inter', 'SF Pro Display', sans-serif";
        const annualYieldTitle = data.activeRewardEstimate ? 'Est. Annual Yield' : 'Reward Projection';
        const annualYieldValue = data.activeRewardEstimate && Number.isFinite(data.estAnnual)
            ? `+${data.estAnnual.toFixed(1)} XTZ`
            : data.hasRewardRole
                ? 'Not personalized'
                : 'Not active';
        const apyTitle = data.apyBasis === 'gross-delegation-context' ? 'Gross context' : 'APY';
        const apyValue = !data.bakerInactive && Number.isFinite(data.apyRate)
            ? `${data.apyRate}%`
            : '—';

        wrapper.innerHTML = `
            <div style="font-family:'Orbitron',sans-serif; font-size:16px; font-weight:900;
                color:${brand}; letter-spacing:3px; text-transform:uppercase; margin-bottom:2px;
                text-shadow: 0 0 20px rgba(${brandRgb},0.5);">MY TEZOS</div>
            <div style="font-family:${sysFont}; font-size:10px; color:rgba(255,255,255,0.3); text-transform:uppercase;
                letter-spacing:2px; margin-bottom:24px;">tezos.systems</div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:24px;">
                <div style="background:rgba(${brandRgb},0.08); border:1px solid rgba(${brandRgb},0.12); border-radius:12px; padding:18px 14px; text-align:center;">
                    <div style="font-family:${sysFont}; font-size:10px; color:rgba(255,255,255,0.5); text-transform:uppercase; letter-spacing:1.5px;">Portfolio</div>
                    <div style="font-family:${sysFont}; font-size:22px; font-weight:800; color:white; margin-top:6px;">${fmtCompact(data.totalXTZ)} XTZ</div>
                </div>
                <div style="background:rgba(${brandRgb},0.08); border:1px solid rgba(${brandRgb},0.12); border-radius:12px; padding:18px 14px; text-align:center;">
                    <div style="font-family:${sysFont}; font-size:10px; color:rgba(255,255,255,0.5); text-transform:uppercase; letter-spacing:1.5px;">${annualYieldTitle}</div>
                    <div style="font-family:${sysFont}; font-size:22px; font-weight:800; color:${brand}; margin-top:6px;">${annualYieldValue}</div>
                </div>
            </div>

            <div style="display:grid; grid-template-columns:${data.rewardStreak > 0 ? '1fr 1fr 1fr' : '1fr 1fr'}; gap:14px; text-align:center;">
                <div>
                    <div style="font-family:${sysFont}; font-size:10px; color:rgba(255,255,255,0.4); text-transform:uppercase; letter-spacing:1px;">${apyTitle}</div>
                    <div style="font-family:'Orbitron',sans-serif; font-size:18px; font-weight:700; color:${brand}; margin-top:4px;">${apyValue}</div>
                </div>
                ${data.rewardStreak > 0 ? `
                <div>
                    <div style="font-family:${sysFont}; font-size:10px; color:rgba(255,255,255,0.4); text-transform:uppercase; letter-spacing:1px;">Streak</div>
                    <div style="font-family:'Orbitron',sans-serif; font-size:18px; font-weight:700; color:#f59e0b; margin-top:4px;">${data.rewardStreak} 🔥</div>
                </div>` : ''}
                <div>
                    <div style="font-family:${sysFont}; font-size:10px; color:rgba(255,255,255,0.4); text-transform:uppercase; letter-spacing:1px;">Baker</div>
                    <div style="font-family:${sysFont}; font-size:14px; font-weight:600; color:white; margin-top:6px;">${escapeHtml(data.bakerName)}</div>
                </div>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:24px; padding-top:14px; border-top:1px solid rgba(${brandRgb},0.1);">
                <span style="font-family:${sysFont}; font-size:10px; color:rgba(255,255,255,0.25);">${data.address}</span>
                <span style="font-family:${sysFont}; font-size:10px; color:rgba(255,255,255,0.25);">${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            </div>
        `;

        document.body.appendChild(wrapper);
        const canvas = await html2canvas(wrapper, {
            backgroundColor: bgColor, scale: 2, useCORS: true, logging: false,
            width: 500, windowWidth: 500
        });
        wrapper.remove();

        const tweetOptions = data.activeRewardEstimate && Number.isFinite(data.apyRate) && Number.isFinite(data.estAnnual)
            ? [
                { label: 'Rewards', text: `Tracking ${fmtCompact(data.totalXTZ)} XTZ on Tezos with a current ${data.apyRate}% APY estimate${data.rewardStreak > 0 ? ` — ${data.rewardStreak} cycle reward streak 🔥` : ''}.\n\ntezos.systems` },
                { label: 'Data', text: `My Tezos rewards view:\n\n📊 ${fmtCompact(data.totalXTZ)} XTZ portfolio\n📈 ${data.apyRate}% estimated APY\n💰 ~${data.estAnnual.toFixed(0)} XTZ/year estimate\n${data.rewardStreak > 0 ? `🔥 ${data.rewardStreak} cycle streak\n` : ''}\ntezos.systems` },
            ]
            : [
                { label: 'Portfolio', text: `My Tezos view: ${fmtCompact(data.totalXTZ)} XTZ. ${data.apyBasis === 'gross-delegation-context' && Number.isFinite(data.apyRate) ? `${data.apyRate}% gross delegation context before my baker’s off-chain fee and payout policy.` : data.hasRewardRole ? 'No verified personal forward reward estimate is available.' : 'No active baking, staking, or delegation reward role.'}\n\ntezos.systems` }
            ];

        showShareModal(canvas, tweetOptions, 'My Tezos Stats');
    } catch (err) {
        console.error('Share card error:', err);
    }
}

// ─── Render ──────────────────────────────────────────

// ─── Pulse Visualization ─────────────────────────────

let _briefRendering = false;
let _briefRenderedAddr = null;
let _pendingBriefAddr = null;
let _briefRequestSeq = 0;
let _operatorSignalTimer = null;
let _operatorSignalInFlight = false;
let _operatorSignalSeq = 0;
let _operatorDrawerObserver = null;
let _drawerStatsTimer = null;
let _drawerStatsInFlight = false;
let _activeViewRefreshTimer = null;

function isDrawerOpen() {
    return document.getElementById('my-tezos-drawer')?.classList.contains('open') === true;
}

function getOperatorSignalRefreshMs() {
    const override = Number(window.__MY_TEZOS_OPERATOR_REFRESH_MS__);
    return Number.isFinite(override) && override >= 1000 ? override : OPERATOR_SIGNAL_REFRESH_MS;
}

function getDrawerStatsRefreshMs() {
    const override = Number(window.__MY_TEZOS_DRAWER_REFRESH_MS__);
    return Number.isFinite(override) && override >= 1000 ? override : DRAWER_STATS_REFRESH_MS;
}

function getActiveViewRefreshMs() {
    const override = Number(window.__MY_TEZOS_VIEW_REFRESH_MS__);
    return Number.isFinite(override) && override >= 1000 ? override : ACTIVE_VIEW_REFRESH_MS;
}

async function refreshActiveMyTezosView() {
    if (!isDrawerOpen() || document.visibilityState !== 'visible') return null;
    switch (activeMyTezosView()) {
        case 'baker-signal':
            // The existing 15-second operator timer owns this view's refresh.
            return null;
        case 'portfolio':
            return refreshMyTezosPortfolio();
        case 'collection': {
            const module = await import('./my-tezos-collection.mjs');
            return module.refreshMyTezosCollection({ background: true });
        }
        case 'tezos-x': {
            const module = await import('./my-tezos-tezosx.mjs');
            return module.refreshMyTezosTezosX({ background: true });
        }
        case 'overview':
        case 'transactions':
        case 'story':
        default:
            return refreshMyTezosMemory();
    }
}

function getCurrentDrawerXtzPrice() {
    return parseFloat(document.querySelector('.price-value')?.textContent?.replace(/[^0-9.]/g, '') || '0') || 0;
}

function getActiveMyTezosContext(address) {
    const data = window._myTezosData;
    if (!data || data.fullAddress !== address) return null;
    return {
        bakerAddr: data.bakerAddr || null,
        isBaker: data.isBaker === true,
        bakerName: data.bakerName || ''
    };
}

function formatGuidanceXtz(value) {
    const number = Number(value);
    return Number.isFinite(number)
        ? Math.max(0, Math.floor(number)).toLocaleString('en-US')
        : 'Unavailable';
}

async function fetchDelegationGuidanceState() {
    const [baker, constants, wallet] = await Promise.all([
        fetchJsonWithTimeout(`${TZKT}/delegates/${encodeURIComponent(BAKING_BENJAMINS_DELEGATE_ADDRESS)}`, null, 8000),
        fetchProtocolConstants().catch(() => null),
        getWalletAccount({ quiet: true })
    ]);
    const globalLimit = Number(constants?.limit_of_delegation_over_baking) || 9;
    const capacity = buildBakerCapacitySnapshot(baker, globalLimit);
    const account = wallet?.address
        ? await fetchJsonWithTimeout(`${TZKT}/accounts/${encodeURIComponent(wallet.address)}`, null, 8000)
        : null;
    return { baker, capacity, wallet, account };
}

function guidanceBlockedReason({ baker, capacity, wallet, account }) {
    if (!wallet?.address) return 'Connect a wallet above to delegate.';
    if (wallet.network?.type && wallet.network.type !== 'mainnet') return 'Switch the connected wallet to Tezos Mainnet.';
    if (account?.type === 'delegate') return 'Registered baker accounts are not handled by this delegator action.';
    if (account?.delegate?.address === BAKING_BENJAMINS_DELEGATE_ADDRESS) return 'This wallet already delegates to Baking Benjamins.';
    if (account?.delegate?.address) return `This wallet already delegates to ${account.delegate.alias || shortWalletAddress(account.delegate.address)}. Baker switching is not offered here.`;
    if (baker?.active === false || !capacity?.active) return 'Baking Benjamins is not currently active.';
    const walletBalance = Math.max(0, Number(account?.balance || 0) / 1_000_000);
    if (walletBalance > Math.max(0, Number(capacity?.freeDelegationCapacity || 0))) {
        return 'This connected wallet is larger than the baker’s reported delegation room.';
    }
    return '';
}

async function pollGuidanceDelegation(operationHash, address) {
    if (!operationHash) return;
    for (let attempt = 0; attempt < 12; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 3000));
        if (localStorage.getItem(STORAGE_KEY) !== address) return;
        try {
            const response = await fetch(`${TZKT}/operations/delegations/${encodeURIComponent(operationHash)}/status`, { cache: 'no-store' });
            if (!response.ok) continue;
            const status = String(await response.json()).replaceAll('"', '').toLowerCase();
            const node = document.querySelector('[data-my-tezos-delegation-status]');
            if (status === 'applied') {
                if (node) {
                    node.textContent = 'Delegation confirmed on-chain.';
                    node.dataset.tone = 'success';
                }
                return;
            }
            if (['failed', 'backtracked', 'skipped'].includes(status)) {
                if (node) {
                    node.textContent = `Operation ${status}.`;
                    node.dataset.tone = 'error';
                }
                return;
            }
        } catch { /* wait for the indexer */ }
    }
}

async function renderDelegationGuidance(data, requestSeq) {
    const container = document.getElementById('my-tezos-delegation-guidance');
    if (!container) return;
    if (data?.bakerAddr) {
        container.hidden = true;
        container.innerHTML = '';
        return;
    }

    container.hidden = false;
    const loadingHtml = `
        <section class="my-tezos-delegation-guide" data-quiet-key="my-tezos-delegation-guide">
            <span class="feature-kicker">Choose your baker</span>
            <h3>Delegate to an active baker you trust</h3>
            <p>Compare current capacity and source-backed signals. Verify fees, payout timing, and service policy with the baker.</p>
            <a class="glass-button my-tezos-directory-action" href="/leaderboard/?view=directory">
                <span class="my-tezos-directory-label">Compare all active bakers</span>
                <span aria-hidden="true">→</span>
            </a>
            <div class="my-tezos-builder-baker" role="status">Reading Baking Benjamins capacity…</div>
        </section>
    `;
    if (!container.querySelector('.my-tezos-builder-baker strong')) {
        if (container.children.length) quietlySyncHtml(container, loadingHtml);
        else container.innerHTML = loadingHtml;
    }

    try {
        const state = await fetchDelegationGuidanceState();
        if (
            requestSeq !== _briefRequestSeq
            || localStorage.getItem(STORAGE_KEY) !== data.fullAddress
            || window._myTezosData?.bakerAddr
        ) return;
        const blocked = guidanceBlockedReason(state);
        const free = formatGuidanceXtz(state.capacity.freeDelegationCapacity);
        const html = `
            <section class="my-tezos-delegation-guide" data-quiet-key="my-tezos-delegation-guide">
                <span class="feature-kicker">Choose your baker</span>
                <h3>Delegate to an active baker you trust</h3>
                <p>Compare current capacity and source-backed signals. Verify fees, payout timing, and service policy with the baker.</p>
                <a class="glass-button my-tezos-directory-action" href="/leaderboard/?view=directory">
                    <span class="my-tezos-directory-label">Compare all active bakers</span>
                    <span aria-hidden="true">→</span>
                </a>
                <div class="my-tezos-builder-baker">
                    <span class="my-tezos-builder-disclosure">Delegate to the builder of this site</span>
                    <strong>${BAKING_BENJAMINS_NAME}</strong>
                    <span>${free} XTZ reported delegation room</span>
                    <div class="my-tezos-builder-actions">
                        <a href="/leaderboard/?view=directory&baker=${encodeURIComponent(BAKING_BENJAMINS_DELEGATE_ADDRESS)}">Review baker facts</a>
                        <button type="button" data-my-tezos-bb-delegate ${blocked ? 'disabled' : ''}>Delegate connected wallet</button>
                    </div>
                    ${blocked ? `<p class="my-tezos-delegation-blocked">${escapeHtml(blocked)}</p>` : ''}
                    <p data-my-tezos-delegation-status role="status" aria-live="polite"></p>
                </div>
            </section>
        `;
        quietlySyncHtml(container, html);
        const button = container.querySelector('[data-my-tezos-bb-delegate]');
        if (button && !button.disabled) {
            button.onclick = async () => {
                button.disabled = true;
                const status = container.querySelector('[data-my-tezos-delegation-status]');
                if (status) status.textContent = 'Rechecking wallet and capacity…';
                try {
                    const fresh = await fetchDelegationGuidanceState();
                    const freshBlocked = guidanceBlockedReason(fresh);
                    if (freshBlocked) throw new Error(freshBlocked);
                    const { result } = await requestConnectedWalletDelegation(BAKING_BENJAMINS_DELEGATE_ADDRESS);
                    const operationHash = String(result?.operationHash || result?.transactionHash || '');
                    if (status) {
                        status.innerHTML = operationHash
                            ? `Submitted; waiting for confirmation. <a href="https://tzkt.io/${encodeURIComponent(operationHash)}" target="_blank" rel="noopener noreferrer">View operation</a>`
                            : 'Submitted; waiting for confirmation.';
                        status.dataset.tone = 'success';
                    }
                    pollGuidanceDelegation(operationHash, data.fullAddress).catch(() => {});
                } catch (error) {
                    if (status) {
                        status.textContent = /abort|cancel|declin|reject|denied/i.test(String(error?.message || error))
                            ? 'The wallet did not submit the operation.'
                            : (error?.message || 'Delegation could not be submitted.');
                        status.dataset.tone = 'error';
                    }
                    button.disabled = false;
                }
            };
        }
    } catch {
        if (container.querySelector('.my-tezos-builder-baker strong')) return;
        const fallback = `
            <section class="my-tezos-delegation-guide" data-quiet-key="my-tezos-delegation-guide">
                <span class="feature-kicker">Choose your baker</span>
                <h3>Delegate to an active baker you trust</h3>
                <p>Live capacity is temporarily unavailable. Compare current baker facts before taking action.</p>
                <a class="glass-button my-tezos-directory-action" href="/leaderboard/?view=directory">
                    <span class="my-tezos-directory-label">Open the Baker Directory</span>
                    <span aria-hidden="true">→</span>
                </a>
            </section>
        `;
        quietlySyncHtml(container, fallback);
    }
}

function renderBriefCards(items) {
    return items.map(card => {
        const accent = safeTone(card.accent);
        return `<div class="brief-section brief-section-${accent}" data-brief-accent="${accent}">
            <h4 class="brief-section-title">${card.icon} ${card.title}</h4>
            <div class="brief-body">${card.body}</div>
        </div>`;
    }).join('');
}

function renderBakerBrief(cards) {
    const bakerBrief = document.getElementById('drawer-baker-brief');
    if (!bakerBrief) return;
    const bakerCards = cards.filter(card => card.accent === 'baker' || card.accent === 'governance');
    quietlySyncHtml(bakerBrief, renderBriefCards(bakerCards));
    quietlyMutate(bakerBrief, () => { bakerBrief.hidden = bakerCards.length === 0; });
}

function renderBriefTabs(cards, data) {
    const container = document.getElementById('drawer-brief');
    if (!container) return;
    const storyCard = cards.find(card => card.accent === 'story') || null;
    const bakerCards = cards.filter(card => card.accent === 'baker' || card.accent === 'governance');
    const briefCards = cards.filter(card => card.accent !== 'story' && !bakerCards.includes(card));
    const connected = container.closest('.drawer-connected');
    const withoutBaker = !data?.bakerAddr;
    quietlyMutate(container, () => {
        container.classList.toggle('is-without-baker', withoutBaker);
    });
    if (connected) {
        quietlyMutate(connected, () => {
            connected.classList.toggle('is-without-baker', withoutBaker);
        });
    }
    
    const sectionsHtml = renderBriefCards(briefCards);
    if (container.children.length) quietlySyncHtml(container, sectionsHtml);
    else container.innerHTML = sectionsHtml;

    renderBakerBrief(cards);

    renderStoryPanel(storyCard, data);
}

function renderStoryPanel(card, data) {
    const container = document.getElementById('my-tezos-story-content');
    if (!container) return;
    const html = card
        ? `<div class="brief-section brief-section-story my-tezos-story-card" data-brief-accent="story">
            <h4 class="brief-section-title">${card.icon} ${card.title}</h4>
            <div class="brief-body">${card.body}</div>
            ${card.shareBtn ? '<button class="glass-button drawer-share-btn story-share-btn">📸 Share Your Story</button>' : ''}
        </div>`
        : '<div class="portfolio-memory-empty"><strong>No on-chain story yet</strong><span>This address does not have enough public history to build a story.</span></div>';
    if (container.children.length) quietlySyncHtml(container, html);
    else container.innerHTML = html;

    // A cold Story route can finish the account read after the shared wallet
    // scope has already rendered. Reassert the account-only boundary at the
    // moment the dossier is published so an active wallet can never look like
    // the combined "All included wallets" story.
    container.hidden = readMyTezosScope() === MY_TEZOS_SCOPE_ALL && readScopedMyTezosEntries().length > 1;

    container.querySelectorAll('.story-share-btn').forEach(btn => {
        btn.onclick = () => {
            if (data && data.story) {
                shareTezosStory(data);
            } else {
                const d = window._myTezosData;
                if (d && d.story) shareTezosStory(d);
            }
        };
    });
    container.querySelectorAll('.tezos-era-share-btn').forEach(btn => {
        btn.onclick = () => {
            const d = data?.story ? data : window._myTezosData;
            if (d?.story) shareEraCard(d, btn);
        };
    });
}

// Minibar removed — address shown in nav button, details in drawer
function createMinibar() {}
function updateMinibar() {}

function finishBriefRender(address, requestSeq) {
    if (requestSeq !== _briefRequestSeq) return;
    _briefRendering = false;
    const pending = _pendingBriefAddr;
    _pendingBriefAddr = null;
    if (pending && pending === localStorage.getItem(STORAGE_KEY)) {
        renderMorningBrief(pending, true).catch(() => {});
    }
}

async function renderMorningBrief(address, force = false) {
    // Coalesce same-address refreshes so a late force refresh cannot invalidate
    // a completed model milliseconds before it publishes. Address switches
    // still supersede the current request immediately.
    if (_briefRendering && _briefRenderedAddr === address) {
        if (force) _pendingBriefAddr = address;
        return;
    }
    if (!force && _briefRenderedAddr === address) return;
    
    const requestSeq = ++_briefRequestSeq;
    _briefRendering = true;
    _briefRenderedAddr = address;

    try {
        const [accountResp, xtzPrice, apy] = await Promise.all([
            fetchTzktJson(`${TZKT}/accounts/${encodeURIComponent(address)}`),
            getXtzPrice(),
            getStakingAPY()
        ]);

        const account = accountResp;

        const balance = (account.balance || 0) / 1e6;
        const staked = (account.stakedBalance || 0) / 1e6;
        const totalXTZ = balance;

        const isBaker = account.type === 'delegate' || account.delegate?.address === address;
        const isStaker = staked > 0;
        const bakerAddr = isBaker ? address : account.delegate?.address;
        const bakerName = isBaker ? 'Self (Baker)' : (account.delegate?.alias || (bakerAddr ? bakerAddr.slice(0, 8) + '…' : 'None'));
        const hasRewardRole = isBaker || isStaker || Boolean(bakerAddr);

        const participationPromise = bakerAddr ? fetchParticipation(bakerAddr) : Promise.resolve(null);
        const rewardBakerPromise = bakerAddr
            ? fetchJsonWithTimeout(`${TZKT}/delegates/${encodeURIComponent(bakerAddr)}`, null, 8000)
            : Promise.resolve(null);
        const operatorStatusPromise = bakerAddr
            ? participationPromise.then((participation) => fetchBakerOperatorStatus(bakerAddr, participation))
            : Promise.resolve(null);
        operatorStatusPromise.then((status) => {
            if (requestSeq !== _briefRequestSeq || localStorage.getItem(STORAGE_KEY) !== address) return;
            renderBakerOperatorStatus(status, isBaker, bakerName);
        }).catch(() => {});
        const bakerActivityPromise = isBaker
            ? fetchRecentBakerActivity(address)
            : Promise.resolve(null);
        bakerActivityPromise.then((activity) => {
            if (requestSeq !== _briefRequestSeq || localStorage.getItem(STORAGE_KEY) !== address) return;
            renderBakerActivity(activity);
        }).catch(() => {});

        const [participation, rewards, story, bakerVote, bakerActivity, operatorStatus, greetingName, rewardBaker] = await Promise.all([
            participationPromise,
            fetchRecentRewards(address, account),
            fetchTezosStory(address, account, bakerAddr),
            bakerAddr ? fetchBakerVoteStatus(bakerAddr) : Promise.resolve(null),
            bakerActivityPromise,
            operatorStatusPromise,
            resolveTezName(address, account),
            rewardBakerPromise,
        ]);

        const bakerActive = Boolean(bakerAddr)
            && account.delegate?.active !== false
            && rewardBaker?.active !== false
            && (!isBaker || account.active !== false);
        const bakerInactive = Boolean(bakerAddr) && !bakerActive;

        const healthScore = calcBakerHealth(participation);
        const health = healthLabel(healthScore);

        let rewardsLastCycle = 0;
        let latestRewardCycle = null;
        let rewardStreak = 0;
        if (rewards && rewards.length) {
            const recordedRewards = rewards.filter((row) => getRecordedRewardAmount(row) > 0);
            const latestRecorded = recordedRewards[0] || null;
            if (latestRecorded) {
                rewardsLastCycle = getRecordedRewardAmount(latestRecorded);
                const parsedCycle = Number(latestRecorded.cycle);
                latestRewardCycle = Number.isFinite(parsedCycle) ? parsedCycle : null;
            }
            rewardStreak = calcRewardStreak(recordedRewards);
        }

        let selectedApy = null;
        let apyBasis = 'unavailable';
        if (isStaker && isBaker) {
            selectedApy = Number.isFinite(apy.stakeAPY) ? apy.stakeAPY : null;
            apyBasis = 'baker-own-stake';
        } else if (isStaker) {
            selectedApy = getExternalStakerApy(apy.stakeAPY, rewardBaker?.edgeOfBakingOverStaking);
            apyBasis = 'external-stake-after-edge';
        } else if (bakerAddr) {
            selectedApy = Number.isFinite(apy.delegateAPY) ? apy.delegateAPY : null;
            apyBasis = 'gross-delegation-context';
        }

        // Direct staking has an on-chain reward split, so a personalized
        // forward estimate is possible when the edge is known. Delegation
        // payouts depend on the baker's off-chain fee and payment policy; show
        // the gross protocol rate as context without inventing personal yield.
        const activeRewardEstimate = hasRewardRole
            && !bakerInactive
            && (isBaker || isStaker)
            && Number.isFinite(selectedApy)
            && selectedApy >= 0;
        const apyRate = hasRewardRole && !bakerInactive && Number.isFinite(selectedApy)
            ? selectedApy
            : null;
        const rewardBase = isStaker ? staked : totalXTZ;
        const estDaily = activeRewardEstimate ? rewardBase * (apyRate / 100) / 365.25 : null;
        const estAnnual = activeRewardEstimate ? rewardBase * (apyRate / 100) : null;

        // Attestation rate
        let attestRate = null;
        if (participation) {
            const expected = participation.expected_cycle_activity || 0;
            const missed = participation.missed_slots || 0;
            if (expected > 0) attestRate = (((expected - missed) / expected) * 100).toFixed(1);
        }

        // Active governance proposal
        let activeProposal = null;
        if (bakerVote?.proposal && bakerVote.periodKind && bakerVote.periodKind !== 'proposal') {
            activeProposal = `${governancePhaseName(bakerVote.periodKind)} phase — ${bakerVote.proposal}`;
        } else {
            try {
                const period = await fetchVotingStatus();
                if (period && period.kind !== 'proposal') {
                    const proposal = period.proposalName || period.proposal?.alias || period.proposal?.hash?.slice(0, 8) || 'Unknown';
                    activeProposal = `${governancePhaseName(period.kind)} phase — ${proposal}`;
                }
            } catch {}
        }

        // Save portfolio for deltas
        try {
            localStorage.setItem(LAST_PORTFOLIO_KEY, JSON.stringify({ address, balance: totalXTZ, ts: Date.now() }));
        } catch {}

        const data = {
            address: address.slice(0, 8) + '…' + address.slice(-4),
            fullAddress: address,
            bakerAddr, isBaker,
            totalXTZ, staked, xtzPrice, apyRate, apyBasis, activeRewardEstimate, estDaily, estAnnual,
            rewardsLastCycle, latestRewardCycle, rewardStreak,
            bakerName, bakerInactive, healthScore, health, attestRate,
            isStaker, hasRewardRole, story, activeProposal, bakerVote, bakerActivity, greetingName,
            operatorStatus: _latestOperatorSignal?.address === address ? _latestOperatorSignal.status : operatorStatus,
        };

        if (
            requestSeq !== _briefRequestSeq
            || localStorage.getItem(STORAGE_KEY) !== address
        ) {
            finishBriefRender(address, requestSeq);
            return;
        }

        // Publish the data contract before optional drawer embellishments.
        window._myTezosData = data;
        maybeQueueAnniversaryToast(data);

        const overnightReport = buildOvernightCard(data, getOvernightSnapshot(data.fullAddress));
        if (overnightReport) {
            _activeOvernightReport = overnightReport;
            _activeOvernightAddress = data.fullAddress;
        } else if (_activeOvernightAddress !== data.fullAddress) {
            _activeOvernightReport = null;
            _activeOvernightAddress = '';
        }
        const cards = buildMorningBrief(data);
        saveOvernightSnapshot(data);

        // Render morning brief sections in drawer
        updateDrawerGreeting(greetingName);
        // The early operator promise already painted the signal; do not replay
        // its older snapshot after slower account/story requests finish.
        renderBriefTabs(cards, data);
        renderWhileAwayNetworkCard();
        renderBakerActivity(bakerActivity);
        renderDelegationGuidance(data, requestSeq).catch(() => {});

        // Feature 6: Baker health grade in drawer
        if (healthScore !== null) {
            const gradeInfo = letterGrade(healthScore);
            const gradeContainer = document.getElementById('drawer-baker');
            if (gradeContainer) {
                const gradeEl = document.createElement('div');
                gradeEl.className = 'drawer-baker-grade';
                gradeEl.innerHTML = `
                    <span class="grade-letter" style="color:${gradeInfo.color}">${gradeInfo.grade}</span>
                    <span class="grade-label">Baker Grade</span>
                    <span class="grade-score">${healthScore}/100</span>
                `;
                const existingGrade = gradeContainer.querySelector('.drawer-baker-grade');
                if (existingGrade) quietlySyncElement(existingGrade, gradeEl.outerHTML);
                else gradeContainer.insertBefore(gradeEl, gradeContainer.firstChild);
            }
        }

        // Feature 7: Historical rewards sparkline
        if (rewards && rewards.length > 1) {
            const rewardsSection = document.getElementById('drawer-rewards');
            if (rewardsSection) {
                let sparkContainer = rewardsSection.querySelector('.drawer-rewards-spark');
                if (!sparkContainer) {
                    sparkContainer = document.createElement('div');
                    sparkContainer.className = 'drawer-rewards-spark';
                    sparkContainer.style.cssText = 'position:relative;width:100%;height:80px;margin-top:12px;';
                    sparkContainer.innerHTML = `
                        <div class="spark-label" style="font-size:0.7rem;color:var(--text-muted);margin-bottom:4px;"></div>
                        <div style="position:relative;height:60px;">
                            <canvas id="drawer-rewards-sparkline"></canvas>
                        </div>
                    `;
                    rewardsSection.appendChild(sparkContainer);
                }
                const sparkLabel = sparkContainer.querySelector('.spark-label');
                if (sparkLabel) sparkLabel.textContent = `Earnings Trend (${rewards.length} cycles)`;

                const values = rewards.map(r => getRecordedRewardAmount(r)).reverse();
                const ctx = document.getElementById('drawer-rewards-sparkline')?.getContext('2d');
                if (ctx && window.Chart) {
                    if (window._drawerRewardsChart) {
                        window._drawerRewardsChart.data.labels = values.map((_, i) => i);
                        window._drawerRewardsChart.data.datasets[0].data = values;
                        window._drawerRewardsChart.update('none');
                    } else window._drawerRewardsChart = new Chart(ctx, {
                        type: 'line',
                        data: { labels: values.map((_, i) => i), datasets: [{ data: values, borderColor: 'rgba(0,212,255,0.8)', borderWidth: 1.5, fill: true, backgroundColor: 'rgba(0,212,255,0.08)', pointRadius: 0, tension: 0.3 }] },
                        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, scales: { x: { display: false }, y: { display: false, grace: '20%' } } }
                    });
                }
            }
        }

        // Feature 10: Freshness indicator
        updateFreshness();

        // Update minibar on main page
        updateMinibar(data);

        window.dispatchEvent(new Event('my-tezos-data-ready'));
        finishBriefRender(address, requestSeq);

    } catch (err) {
        if (requestSeq !== _briefRequestSeq || localStorage.getItem(STORAGE_KEY) !== address) {
            finishBriefRender(address, requestSeq);
            return;
        }
        console.warn('Morning Brief error:', err);
        const container = document.getElementById('drawer-brief');
        if (container) {
            const hasLastGoodBrief = container.querySelector('.brief-section:not(.drawer-loading-card)');
            if (!hasLastGoodBrief) {
                const errorHtml = `
                    <div class="my-baker-load-state my-baker-load-state-error drawer-brief-error">
                        <strong>Personal brief unavailable</strong>
                        <span>Your saved address is intact. Retry the account read without clearing the rest of My Tezos.</span>
                        <button id="brief-retry" class="glass-button my-baker-load-retry" type="button">Retry personal brief</button>
                    </div>
                `;
                if (container.children.length) quietlySyncHtml(container, errorHtml);
                else container.innerHTML = errorHtml;
                document.getElementById('brief-retry')?.addEventListener('click', () => renderMorningBrief(address, true));
            }
        }
        const storyContainer = document.getElementById('my-tezos-story-content');
        if (storyContainer && !storyContainer.querySelector('.tezos-story-dossier')) {
            const storyErrorHtml = `
                <div class="my-baker-load-state my-baker-load-state-error">
                    <strong>Your Story is unavailable</strong>
                    <span>The saved address is intact. Retry the account read from Overview.</span>
                </div>
            `;
            if (storyContainer.children.length) quietlySyncHtml(storyContainer, storyErrorHtml);
            else storyContainer.innerHTML = storyErrorHtml;
        }
        renderBakerSignalUnavailable();
        renderBakerActivity(null);
        finishBriefRender(address, requestSeq);
    }
}

// Feature 10: Freshness indicator
function updateFreshness({ signalLive = false } = {}) {
    const el = document.getElementById('drawer-freshness');
    if (!el) return;
    const now = new Date();
    const source = signalLive ? 'Operator signal' : 'My Tezos';
    const html = `
        <span class="freshness-time" title="Operator signal checks every 15 seconds; drawer totals refresh every 30 seconds.">${formatFreshnessStamp(now, { source })}</span>
        <button id="drawer-refresh" class="freshness-refresh">↻ Refresh</button>
    `;
    if (el.children.length) quietlySyncHtml(el, html);
    else el.innerHTML = html;
    const refreshButton = document.getElementById('drawer-refresh');
    if (refreshButton) refreshButton.onclick = (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = '↻ Refreshing…';
        const addr = localStorage.getItem(STORAGE_KEY);
        if (addr) {
            _briefRenderedAddr = null;
            renderMorningBrief(addr, true).finally(() => {
                btn.disabled = false;
                btn.textContent = '↻ Refresh';
            });
        } else {
            btn.disabled = false;
            btn.textContent = '↻ Refresh';
        }
    };
}

async function getOperatorSignalContext(address) {
    const loaded = getActiveMyTezosContext(address);
    if (loaded?.bakerAddr) return loaded;
    try {
        const account = await fetchTzktJson(`${TZKT}/accounts/${encodeURIComponent(address)}`);
        const isBaker = account.type === 'delegate' || account.delegate?.address === address;
        const bakerAddr = isBaker ? address : account.delegate?.address || null;
        return {
            bakerAddr,
            isBaker,
            bakerName: isBaker
                ? 'Self (Baker)'
                : (account.delegate?.alias || (bakerAddr ? `${bakerAddr.slice(0, 8)}…` : ''))
        };
    } catch {
        return null;
    }
}

async function refreshOperatorSignal({ force = false } = {}) {
    const address = localStorage.getItem(STORAGE_KEY);
    if (!address) return;
    if (!force && (!isDrawerOpen() || document.visibilityState !== 'visible')) return;
    if (_operatorSignalInFlight) return;

    const requestSeq = ++_operatorSignalSeq;
    _operatorSignalInFlight = true;

    try {
        const context = await getOperatorSignalContext(address);
        if (requestSeq !== _operatorSignalSeq || localStorage.getItem(STORAGE_KEY) !== address) return;
        if (!context) {
            renderBakerSignalUnavailable();
            return;
        }
        if (!context.bakerAddr) {
            renderBakerOperatorStatus(null, false);
            return;
        }

        const participation = await fetchParticipation(context.bakerAddr);
        const operatorStatus = await fetchBakerOperatorStatus(context.bakerAddr, participation);
        if (requestSeq !== _operatorSignalSeq || localStorage.getItem(STORAGE_KEY) !== address) return;

        renderBakerOperatorStatus(operatorStatus, context.isBaker, context.bakerName);
        if (window._myTezosData?.fullAddress === address) {
            window._myTezosData = {
                ...window._myTezosData,
                bakerAddr: context.bakerAddr,
                isBaker: context.isBaker,
                bakerName: context.bakerName || window._myTezosData.bakerName,
                operatorStatus,
            };
            if (!window._myTezosData.loading) renderBakerBrief(buildMorningBrief(window._myTezosData));
        }
        updateFreshness({ signalLive: true });
        window.dispatchEvent(new Event('my-tezos-operator-signal-ready'));
    } catch (error) {
        if (requestSeq === _operatorSignalSeq && localStorage.getItem(STORAGE_KEY) === address) {
            renderBakerSignalUnavailable();
        }
        console.warn('My Tezos operator signal refresh failed:', error);
    } finally {
        _operatorSignalInFlight = false;
    }
}

async function refreshDrawerStats({ force = false } = {}) {
    const address = localStorage.getItem(STORAGE_KEY);
    if (!address) return;
    if (!force && (!isDrawerOpen() || document.visibilityState !== 'visible')) return;
    if (_drawerStatsInFlight) return;

    _drawerStatsInFlight = true;
    try {
        const refreshes = [
            Promise.resolve(refreshMyBakerStats({ quiet: true })),
            initRewardsTracker({}, getCurrentDrawerXtzPrice(), { force, quiet: true })
        ];

        if (_briefRendering) {
            _pendingBriefAddr = address;
        } else {
            refreshes.push(renderMorningBrief(address, true));
        }

        const results = await Promise.allSettled(refreshes);
        for (const result of results) {
            if (result.status === 'rejected') {
                console.warn('My Tezos drawer refresh failed:', result.reason);
            }
        }
    } finally {
        _drawerStatsInFlight = false;
    }
}

function initDrawerLiveRefresh() {
    if (!_operatorSignalTimer) {
        _operatorSignalTimer = setInterval(() => {
            refreshOperatorSignal().catch(() => {});
        }, getOperatorSignalRefreshMs());
    }

    if (!_drawerStatsTimer) {
        _drawerStatsTimer = setInterval(() => {
            refreshDrawerStats().catch(() => {});
        }, getDrawerStatsRefreshMs());
    }

    if (!_activeViewRefreshTimer) {
        _activeViewRefreshTimer = setInterval(() => {
            refreshActiveMyTezosView().catch(() => {});
        }, getActiveViewRefreshMs());
    }

    const drawer = document.getElementById('my-tezos-drawer');
    if (drawer && !_operatorDrawerObserver) {
        _operatorDrawerObserver = new MutationObserver(() => {
            if (!isDrawerOpen()) return;
            refreshDrawerStats({ force: true }).catch(() => {});
            refreshOperatorSignal({ force: true }).catch(() => {});
        });
        _operatorDrawerObserver.observe(drawer, { attributes: true, attributeFilter: ['class'] });
    }

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && isDrawerOpen()) {
            refreshDrawerStats({ force: true }).catch(() => {});
            refreshOperatorSignal({ force: true }).catch(() => {});
            refreshActiveMyTezosView().catch(() => {});
        }
    }, { once: false });
}

// ─── Init & Export ───────────────────────────────────

function drawerLoadingCard(label, size = '') {
    const sizeClass = size ? ` drawer-loading-card-${size}` : '';
    return `
        <div class="drawer-loading-card${sizeClass}" role="status" aria-label="${escapeHtml(label)}">
            <span class="drawer-loading-kicker">${escapeHtml(label)}</span>
            <span class="drawer-loading-line drawer-loading-line-strong"></span>
            <span class="drawer-loading-line"></span>
            <span class="drawer-loading-line drawer-loading-line-short"></span>
        </div>
    `;
}

function seedDrawerLoadingState() {
    if (document.getElementById('drawer-operator-status')?.hidden) {
        renderBakerSignalMessage('Checking the active wallet’s baker signal…');
    }
    const details = document.getElementById('drawer-baker-details');
    if (details) details.hidden = false;
    const brief = document.getElementById('drawer-brief');
    if (brief && !brief.children.length) {
        brief.innerHTML = drawerLoadingCard('Reading your account');
    }
    const bakerBrief = document.getElementById('drawer-baker-brief');
    if (bakerBrief && !bakerBrief.children.length) {
        bakerBrief.hidden = false;
        bakerBrief.innerHTML = drawerLoadingCard('Checking baker status');
    }

    const story = document.getElementById('my-tezos-story-content');
    if (story && !story.querySelector('.tezos-story-dossier')) {
        story.innerHTML = drawerLoadingCard('Building your Tezos story', 'story');
    }

    const rewards = document.getElementById('drawer-rewards');
    if (rewards && !rewards.children.length) {
        rewards.innerHTML = drawerLoadingCard('Syncing rewards', 'panel');
    }

    const network = document.getElementById('drawer-network');
    if (network && !network.children.length) {
        network.innerHTML = drawerLoadingCard('Reading network context', 'panel');
    }
}

function organizeDrawerJourneys() {
    const connected = document.getElementById('drawer-connected');
    const share = connected?.querySelector('.drawer-share-section');
    const rewards = document.getElementById('drawer-rewards');
    const brief = document.getElementById('drawer-brief');
    const network = document.getElementById('drawer-network');
    const more = document.getElementById('drawer-more-section');
    const actions = document.getElementById('drawer-more-actions');
    if (!connected || !share || !rewards || !brief || !network || !more || !actions) return;

    let columns = connected.querySelector('.drawer-live-columns');
    if (!columns) {
        columns = document.createElement('div');
        columns.className = 'drawer-live-columns';
        columns.innerHTML = `
            <div class="drawer-live-column drawer-live-column-primary"></div>
            <div class="drawer-live-column drawer-live-column-secondary"></div>
        `;
        connected.insertBefore(columns, more);
    }

    const primary = columns.querySelector('.drawer-live-column-primary');
    const secondary = columns.querySelector('.drawer-live-column-secondary');
    if (!primary || !secondary) return;

    primary.appendChild(rewards);
    secondary.appendChild(brief);
    columns.appendChild(network);
    if (more.parentElement !== connected) connected.insertBefore(more, share);
    connected.querySelector('#drawer-more-section-secondary')?.remove();

    const ledger = document.getElementById('my-tezos-ledger-flow-link');
    const passport = document.getElementById('my-tezos-maxi-passport-link');
    if (ledger && ledger.parentElement !== actions) actions.appendChild(ledger);
    if (passport && passport.parentElement !== actions) actions.appendChild(passport);
}

function activeMyTezosView() {
    return document.querySelector('[data-my-tezos-view][aria-selected="true"]')?.dataset.myTezosView || 'overview';
}

function placeJourneySection(view = activeMyTezosView()) {
    const section = document.getElementById('drawer-more-section');
    if (!section) return;
    if (view === 'overview') {
        const connected = document.getElementById('drawer-connected');
        const share = connected?.querySelector('.drawer-share-section');
        if (connected && section.parentElement !== connected) connected.insertBefore(section, share || null);
        return;
    }
    const panel = document.querySelector(`[data-my-tezos-panel="${view}"]`);
    if (panel && section.parentElement !== panel) panel.appendChild(section);
}

function updateJourneyCard(link, journey, slot, view) {
    if (!link) return;
    if (!journey) {
        link.hidden = true;
        link.style.display = 'none';
        delete link.dataset.journeyTo;
        return;
    }

    const from = view === 'overview' ? 'my-tezos' : `my-tezos-${view}`;
    link.hidden = false;
    link.style.display = 'grid';
    link.href = journey.href;
    link.title = `Open ${journey.title}`;
    link.setAttribute('aria-label', `Open ${journey.title}`);
    link.dataset.myTezosJourneySlot = slot;
    link.dataset.myTezosJourneyDestination = journey.id;
    link.dataset.siteJourney = 'true';
    link.dataset.journeyFrom = from;
    link.dataset.journeyFromEntry = 'my-tezos';
    if (view === 'overview') delete link.dataset.journeyFromIntent;
    else link.dataset.journeyFromIntent = from;
    link.dataset.journeyTo = journey.id;
    link.dataset.journeySurface = 'my-tezos';
    link.dataset.journeyReason = journey.reason;
    if (journey.isReturn) link.dataset.journeyReturn = 'true';
    else delete link.dataset.journeyReturn;
    link.classList.toggle('drawer-account-journey-passport', journey.tone === 'passport');

    const icon = link.querySelector('.drawer-account-journey-icon');
    const kicker = link.querySelector('.drawer-account-journey-kicker');
    const title = link.querySelector('.drawer-account-journey-copy strong');
    const detail = link.querySelector('.drawer-account-journey-copy small');
    if (icon) icon.textContent = journey.icon;
    if (kicker) kicker.textContent = journey.kicker;
    if (title) title.textContent = journey.title;
    if (detail) detail.textContent = journey.detail || 'Continue through Tezos Systems.';
}

function renderMyTezosJourneys({ place = false } = {}) {
    const view = activeMyTezosView();
    if (place) placeJourneySection(view);
    const address = String(localStorage.getItem(STORAGE_KEY) || '');
    const journeys = buildMyTezosJourneyLinks({
        view,
        data: window._myTezosData,
        address,
        hasLinkedL2: hasExplicitLinkedEtherlinkAccount(address),
        origin: readMyTezosJourneyOrigin()
    });
    updateJourneyCard(
        document.getElementById('my-tezos-ledger-flow-link'),
        journeys[0],
        'primary',
        view
    );
    updateJourneyCard(
        document.getElementById('my-tezos-maxi-passport-link'),
        journeys[1],
        'secondary',
        view
    );
    const section = document.getElementById('drawer-more-section');
    if (section) section.hidden = journeys.length !== 2;
}

export { setMyTezosView };

export function initMyTezos() {
    const drawer = document.getElementById('my-tezos-drawer');
    if (!drawer || drawer.dataset.personalInitialized === '1') return;
    drawer.dataset.personalInitialized = '1';
    const reading = document.getElementById('my-tezos-reading-verdict');
    if (reading) reading.innerHTML = renderChamberVerdict({ key: 'my', state: 'guide', sentence: 'This room follows your selected wallet scope; activity does not establish a person’s identity or link an L2 account.', receipts: [['Scope', 'Selected wallets'], ['Linked accounts', 'Explicit only']] });
    organizeDrawerJourneys();
    initMyTezosPortfolio();
    initMyTezosScope();
    registerMyTezosView('overview', () => activateMyTezosMemory({ activityOnly: true }));
    registerMyTezosView('baker-signal', () => refreshOperatorSignal());
    registerMyTezosView('portfolio', () => activateMyTezosPortfolio());
    registerMyTezosView('transactions', () => activateMyTezosMemory({ activityOnly: true }));
    registerMyTezosView('collection', () => import('./my-tezos-collection.mjs')
        .then((module) => module.activateMyTezosCollection()));
    registerMyTezosView('story', () => activateMyTezosMemory({ activityOnly: true }));
    registerMyTezosView('tezos-x', () => import('./my-tezos-tezosx.mjs')
        .then((module) => module.activateMyTezosTezosX()));
    initMyTezosTabs();
    window.addEventListener('my-tezos-drawer-opened', () => {
        refreshMyTezosPortfolio({ allowHidden: true }).catch(() => {});
    });
    window.addEventListener('my-tezos-scope-changed', () => {
        refreshMyTezosPortfolio({ allowHidden: true }).catch(() => {});
        const scope = readMyTezosScope();
        const activeView = document.querySelector('[data-my-tezos-view][aria-selected="true"]')?.dataset.myTezosView;
        if (scope === MY_TEZOS_SCOPE_ALL && (activeView === 'overview' || activeView === 'story')) {
            renderMyTezosJourneys();
        }
    });
    renderMyTezosJourneys({ place: true });
    window.addEventListener('my-tezos-view-changed', () => renderMyTezosJourneys({ place: true }));
    window.addEventListener('my-tezos-data-ready', () => {
        renderMyTezosJourneys();
        renderWhileAwayNetworkCard();
    });
    window.addEventListener('my-tezos-network-context-rendered', renderWhileAwayNetworkCard);
    window.addEventListener('my-tezos-linked-l2-changed', () => renderMyTezosJourneys());
    window.addEventListener('my-tezos-journeys-request', () => renderMyTezosJourneys());
    document.getElementById('my-tezos-story-transactions')?.addEventListener('click', () => {
        prepareMyTezosChangesView();
        setMyTezosView('transactions', { routeMode: 'push' });
        requestAnimationFrame(() => {
            document.getElementById('portfolio-activity-title')?.scrollIntoView({ block: 'nearest' });
        });
    });
    document.getElementById('my-tezos-baker-signal-overview')?.addEventListener('click', () => {
        setMyTezosView('overview', { focus: true, routeMode: 'push' });
    });
    // Create minibar under price bar
    createMinibar();
    initDrawerLiveRefresh();

    const address = localStorage.getItem(STORAGE_KEY);
    if (address) seedDrawerLoadingState();

    window.addEventListener('my-baker-updated', (e) => {
        const newAddr = e.detail?.address;
        if (newAddr) {
            updateDrawerGreeting('');
            document.querySelector('#drawer-baker .drawer-baker-grade')?.remove();
            const bakerBrief = document.getElementById('drawer-baker-brief');
            if (bakerBrief) bakerBrief.innerHTML = '';
            renderBakerOperatorStatus(null, false);
            seedDrawerLoadingState();
            const previousAddress = e.detail?.previousAddress;
            if (previousAddress && previousAddress !== newAddr) {
                window._myTezosData = {
                    fullAddress: newAddr,
                    address: shortAddress(newAddr),
                    bakerAddr: null,
                    isBaker: false,
                    loading: true
                };
            }
            renderMorningBrief(newAddr, true);
        } else {
            window._myTezosData = null;
            renderBakerOperatorStatus(null, false);
            _activeOvernightReport = null;
            _activeOvernightAddress = '';
            updateDrawerGreeting('');
            const details = document.getElementById('drawer-baker-details');
            if (details) details.hidden = true;
            document.querySelector('#drawer-baker .drawer-baker-grade')?.remove();
            // Clear drawer sections
            ['drawer-operator-status', 'drawer-baker-brief', 'drawer-brief', 'drawer-network', 'drawer-rewards', 'drawer-baker-activity', 'my-tezos-delegation-guidance'].forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    el.innerHTML = '';
                    if (id === 'drawer-baker-activity' || id === 'drawer-operator-status' || id === 'my-tezos-delegation-guidance') el.hidden = true;
                }
            });
        }
        renderMyTezosJourneys();
    });
    window.addEventListener('my-tezos-current-account-ready', (event) => {
        const address = String(event.detail?.address || '');
        const account = event.detail?.account;
        const current = window._myTezosData;
        if (
            !address
            || !account
            || localStorage.getItem(STORAGE_KEY) !== address
            || current?.fullAddress !== address
            || current.loading
        ) return;
        const totalXTZ = Math.max(0, Number(account.balance) || 0) / 1e6;
        const staked = Math.max(0, Number(account.stakedBalance) || 0) / 1e6;
        const isBaker = account.type === 'delegate' || account.delegate?.address === address;
        const isStaker = staked > 0;
        const bakerAddr = isBaker ? address : account.delegate?.address || null;
        const bakerName = isBaker
            ? 'Self (Baker)'
            : account.delegate?.alias || current.bakerName || (bakerAddr ? shortAddress(bakerAddr) : 'None');
        const activeRewardEstimate = current.activeRewardEstimate === true
            && (isBaker || isStaker)
            && Number.isFinite(Number(current.apyRate));
        const rewardBase = isStaker ? staked : totalXTZ;
        const estAnnual = activeRewardEstimate ? rewardBase * (Number(current.apyRate) / 100) : null;
        const updated = {
            ...current,
            totalXTZ,
            staked,
            isBaker,
            isStaker,
            bakerAddr,
            bakerName,
            activeRewardEstimate,
            estDaily: estAnnual == null ? null : estAnnual / 365.25,
            estAnnual
        };
        window._myTezosData = updated;
        renderBriefTabs(buildMorningBrief(updated), updated);
        renderDelegationGuidance(updated, _briefRequestSeq).catch(() => {});
        window.dispatchEvent(new Event('my-tezos-data-ready'));
    });

    window.addEventListener('my-tezos-show-onboarding', () => {
        // Open drawer in empty state
        const drawer = document.getElementById('my-tezos-drawer');
        const scrim = document.getElementById('my-tezos-drawer-scrim');
        if (drawer && scrim) {
            drawer.classList.add('open');
            scrim.classList.add('open');
            document.body.style.overflow = 'hidden';
            const emptyState = document.getElementById('drawer-empty-state');
            const connectedState = document.getElementById('drawer-connected');
            if (emptyState) emptyState.style.display = '';
            if (connectedState) connectedState.style.display = 'none';
        }
    });

    if (address) {
        renderMorningBrief(address);
    }

    // Feature 5: Share button in drawer
    document.getElementById('drawer-share-btn')?.addEventListener('click', async () => {
        const data = window._myTezosData;
        if (!data) return;
        try {
            await shareMorningBrief(data);
        } catch (e) {
            console.warn('Share failed:', e);
        }
    });
}

export function refreshMyTezos() {
    const address = localStorage.getItem(STORAGE_KEY);
    if (address) {
        renderMorningBrief(address, true);
    }
    refreshMyTezosPortfolio().catch(() => {});
}

export async function openMyTezosChamber(options = {}) {
    const controller = await import(versionedAsset('/js/core/app.js'));
    return controller.openStandaloneMyTezos(options);
}

export function closeMyTezosChamber() {
    window.tezosSystemsCloseMyTezos?.();
}
