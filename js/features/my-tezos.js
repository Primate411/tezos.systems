/**
 * My Tezos — Morning Brief + Your Tezos Story
 * Replaces the old hero strip with a rotating daily brief and personal timeline.
 * Persists address in localStorage. When active, this becomes the user's homepage.
 */

import { API_URLS } from '../core/config.js';
import { escapeHtml } from '../core/utils.js';
import { fetchSharedStats, fetchWithRetry, getTzktTotalDelegated, getTzktTotalStaked } from '../core/api.js';
import { fetchXTZPrice } from './price.js';
import { letterGrade } from './baker-report-card.js';
import { fetchVotingStatus, getVotingPeriodName } from './governance.js';
import { fetchObjktProfile } from './objkt.js';

const TZKT = API_URLS.tzkt;
const OCTEZ = API_URLS.octez;
const STORAGE_KEY = 'tezos-systems-my-baker-address';
const REWARDS_HISTORY_KEY = 'tezos-systems-my-rewards-history';
const LAST_PORTFOLIO_KEY = 'tezos-systems-my-last-portfolio';
const OVERNIGHT_KEY = 'tezos-systems-overnight-snapshot';
const RECENT_BAKER_ACTIVITY_DAYS = 14;
const RECENT_BAKER_ACTIVITY_LIMIT = 40;
const RECENT_BAKER_ACTIVITY_DISPLAY_LIMIT = 6;
const RECENT_OPERATOR_ATTESTATIONS = 10;
const RIGHTS_FETCH_TIMEOUT_MS = 12000;
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
    { name: 'Oxford', level: 4456449, date: '2023-12-05' },
    { name: 'Paris', level: 5726209, date: '2024-06-04' },
    { name: 'Quebec', level: 6422529, date: '2024-11-19' },
    { name: 'Rio', level: 7118849, date: '2025-05-06' },
    { name: 'Sao Paolo', level: 7815169, date: '2025-07-22' },
    { name: 'Tallinn', level: 11468801, date: '2026-01-21' },
];

// Dynamically extend PROTOCOL_ERAS from TzKT on first load
let _erasLoaded = false;
async function fetchTzktJson(url, attempts = 2) {
    return fetchWithRetry(url, { cache: 'no-store', memoryCache: false }, attempts);
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
    try {
        const [rateResp, stakeResp, supplyResp, stats] = await Promise.all([
            fetch(`${OCTEZ}/chains/main/blocks/head/context/issuance/current_yearly_rate`),
            fetch(`${OCTEZ}/chains/main/blocks/head/context/total_frozen_stake`),
            fetch(`${OCTEZ}/chains/main/blocks/head/context/total_supply`),
            fetchSharedStats()
        ]);
        const [rateText, stakeText, supplyText] = await Promise.all([
            rateResp.text(),
            stakeResp.text(),
            supplyResp.text()
        ]);
        const netIssuance = parseFloat(rateText.replace(/"/g, ''));
        const supplyMutez = Number(stats.totalSupply || 0) || parseInt(String(supplyText).replace(/"/g, ''), 10) || 0;
        const stakedMutez = getTzktTotalStaked(stats)
            || parseInt(String(stakeText).replace(/"/g, ''), 10)
            || 0;
        const supply = supplyMutez / 1e6;
        const staked = stakedMutez / 1e6;
        const delegated = getTzktTotalDelegated(stats) / 1e6;
        if (!Number.isFinite(netIssuance) || netIssuance <= 0 || supply <= 0 || staked <= 0) {
            throw new Error('Missing staking APY inputs');
        }
        const edge = 2;
        const effective = (staked / supply) + (delegated / supply) / (1 + edge);
        const stakeAPY = (netIssuance / 100) / effective * 100;
        const delegateAPY = stakeAPY / (1 + edge);
        return { delegateAPY: Math.round(delegateAPY * 10) / 10, stakeAPY: Math.round(stakeAPY * 10) / 10 };
    } catch {
        return { delegateAPY: 3.1, stakeAPY: 9.2 };
    }
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

function getRewardAmount(r) {
    if (!r) return 0;
    if (r.rewards !== undefined) return (Number(r.rewards) || 0) / 1e6;
    if (r.bakerRewards) return getDelegatorRewardEstimateMutez(r) / 1e6;

    const actual = getBakerRewardMutez(r);
    if (actual > 0) return actual / 1e6;

    const attestFuture = r.futureAttestationRewards ?? r.futureEndorsementRewards ?? 0;
    const future = (Number(r.futureBlockRewards) || 0)
        + (Number(attestFuture) || 0)
        + (Number(r.futureDalAttestationRewards) || 0);
    if (future > 0) return future / 1e6;

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
        if (getRewardAmount(rewards[i]) <= 0) break;
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
        return await fetchWithRetry(url, { signal: controller.signal, cache: 'no-store', memoryCache: false }, 2);
    } catch {
        return fallback;
    } finally {
        clearTimeout(timeout);
    }
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
    if (!right) return { state: 'unknown', text: 'No recent right', detail: 'TzKT returned no completed right yet' };
    const status = String(right.status || 'unknown').toLowerCase();
    const ok = status === 'realized';
    return {
        state: ok ? 'ok' : 'issue',
        text: ok ? 'OK' : status.toUpperCase(),
        detail: `Level ${formatLevel(right.level)}${right.round != null ? `, round ${right.round}` : ''}`
    };
}

function summarizeRecentAttestations(rows) {
    const recent = (rows || []).filter((row) => row.status !== 'future').slice(0, RECENT_OPERATOR_ATTESTATIONS);
    const issues = recent.filter((row) => row.status !== 'realized');
    if (!recent.length) {
        return { state: 'unknown', rate: null, value: 'No data', detail: 'No completed attestation rights returned' };
    }
    const okCount = recent.length - issues.length;
    const rate = (okCount / recent.length) * 100;
    return {
        state: issues.length ? 'issue' : 'ok',
        rate,
        value: `${rate.toFixed(1)}%`,
        detail: issues.length
            ? `${issues.length}/${recent.length} recent attestation issue${issues.length > 1 ? 's' : ''}`
            : `Last ${recent.length} attestations OK`
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

async function fetchBakerOperatorStatus(bakerAddr, participation) {
    if (!bakerAddr) return null;
    const [head, blockDelaySeconds, dalParticipation] = await Promise.all([
        fetchJsonWithTimeout(`${TZKT}/head`, null, 8000),
        fetchBlockDelaySeconds(),
        fetchDALParticipation(bakerAddr)
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
        };
    }

    const enc = bakerAddr;
    const [nextBlocks, latestBlocks, latestAttestations] = await Promise.all([
        fetchJsonWithTimeout(rightsUrl({
            baker: enc,
            type: 'baking',
            status: 'future',
            'level.gt': String(headLevel),
            limit: '1',
            'sort.asc': 'level',
            select: 'level,cycle,round,status,type'
        }), []),
        fetchJsonWithTimeout(rightsUrl({
            baker: enc,
            type: 'baking',
            ...(head.cycle != null ? { cycle: String(head.cycle) } : {}),
            'level.le': String(headLevel),
            limit: '1',
            'sort.desc': 'level',
            select: 'level,cycle,round,status,type'
        }), []),
        fetchJsonWithTimeout(rightsUrl({
            baker: enc,
            type: 'attestation',
            'level.le': String(headLevel),
            limit: String(RECENT_OPERATOR_ATTESTATIONS),
            'sort.desc': 'level',
            select: 'level,slots,status,type'
        }), [])
    ]);

    const next = Array.isArray(nextBlocks) ? nextBlocks[0] : null;
    const levelDiff = next ? Number(next.level) - headLevel : null;
    const etaMs = Number.isFinite(levelDiff) ? levelDiff * blockDelaySeconds * 1000 : null;
    const latestBlock = summarizeRightStatus(Array.isArray(latestBlocks) ? latestBlocks[0] : null);
    const recentAttestations = summarizeRecentAttestations(Array.isArray(latestAttestations) ? latestAttestations : []);
    const dal = summarizeDalParticipation(dalParticipation);
    const attestation = summarizeCycleAttestation(participation, recentAttestations);
    const hasIssue = latestBlock.state === 'issue' || recentAttestations.state === 'issue';
    const liveState = hasIssue ? 'issue' : (latestBlock.state === 'unknown' && recentAttestations.state === 'unknown' ? 'unknown' : 'ok');

    return {
        live: {
            state: liveState,
            value: liveState === 'issue' ? 'Check now' : liveState === 'ok' ? 'Working' : 'No data',
            detail: `${latestBlock.state === 'ok' ? 'Last block OK' : latestBlock.text} · ${recentAttestations.detail}`
        },
        nextBlock: next ? {
            level: next.level,
            round: next.round,
            eta: formatDuration(etaMs),
            detail: `Level ${formatLevel(next.level)}${next.round != null ? `, round ${next.round}` : ''}`
        } : null,
        lastBlock: latestBlock,
        attestation,
        dal,
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

async function fetchBakerVoteStatus(bakerAddr) {
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
            
            // Check this baker's vote
            let voted = false, vote = null;
            try {
                const entry = await fetchCurrentVoter(bakerAddr);
                vote = normalizeBallotStatus(entry?.status);
                voted = Boolean(vote);
            } catch {}
            
            return { ...base, proposal: proposalName, voted, vote, voteType: 'ballot', quorumPct, yayPct };
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
        container.hidden = true;
        container.innerHTML = '';
        return;
    }

    container.hidden = false;
    container.innerHTML = `
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
}

function renderOperatorTile(label, value, detail, state = 'unknown', extraClass = '') {
    const safeState = ['ok', 'issue', 'unknown'].includes(state) ? state : 'unknown';
    return `
        <div class="drawer-operator-tile drawer-operator-${safeState} ${extraClass}">
            <span class="drawer-operator-label">${escapeHtml(label)}</span>
            <strong class="drawer-operator-value">${escapeHtml(value)}</strong>
            <span class="drawer-operator-detail">${escapeHtml(detail || '')}</span>
        </div>
    `;
}

function renderBakerOperatorStatus(status, isBaker) {
    const container = document.getElementById('drawer-operator-status');
    if (!container) return;
    if (!status) {
        container.hidden = true;
        container.innerHTML = '';
        return;
    }

    const next = status.nextBlock
        ? renderOperatorTile('Next block', status.nextBlock.eta, status.nextBlock.detail, 'ok', 'drawer-operator-next')
        : renderOperatorTile('Next block', 'No right found', 'No upcoming baking right returned', 'unknown', 'drawer-operator-next');
    const live = renderOperatorTile(
        'Baker working?',
        status.live.value,
        status.live.detail,
        status.live.state
    );
    const attest = renderOperatorTile('Attestation', status.attestation.value, status.attestation.detail, status.attestation.state);
    const dal = renderOperatorTile('DAL', status.dal.value, status.dal.detail, status.dal.state);

    container.hidden = false;
    container.innerHTML = `
        <div class="drawer-operator-panel">
            <div class="drawer-operator-header">
                <h3>${isBaker ? 'Baker signal' : 'Your baker signal'}</h3>
                <p>Fresh rights check from the latest block and last ${RECENT_OPERATOR_ATTESTATIONS} attestations</p>
            </div>
            <div class="drawer-operator-grid">
                ${next}
                ${live}
                ${attest}
                ${dal}
            </div>
        </div>
    `;
}

function getGreeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
}

function formatGovTimeLeft(endTime) {
    const diff = new Date(endTime) - Date.now();
    if (diff <= 0) return 'ending now';
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    if (days > 0) return `${days}d ${hours}h`;
    return `${hours}h`;
}

function getProtocolEra(firstActivityLevel) {
    let era = PROTOCOL_ERAS[0];
    for (const p of PROTOCOL_ERAS) {
        if (firstActivityLevel >= p.level) era = p;
    }
    return era;
}

function countUpgradesSince(firstActivityLevel) {
    return PROTOCOL_ERAS.filter(p => p.level > firstActivityLevel).length;
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
            balance: data.totalXTZ,
            staked: data.staked,
            xtzPrice: data.xtzPrice,
            usdValue: data.xtzPrice ? data.totalXTZ * data.xtzPrice : null,
            rewardsLastCycle: data.rewardsLastCycle,
            rewardStreak: data.rewardStreak,
            bakerName: data.bakerName,
            healthScore: data.healthScore,
            attestRate: data.attestRate,
            apyRate: data.apyRate,
        }));
    } catch {}
}

function getOvernightSnapshot() {
    try {
        const raw = localStorage.getItem(OVERNIGHT_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

function formatTimeSince(ms) {
    const hours = Math.floor(ms / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
}

function buildOvernightCard(data, snapshot) {
    if (!snapshot || !snapshot.ts) return null;
    const elapsed = Date.now() - snapshot.ts;
    if (elapsed < 3600000) return null; // Skip if < 1 hour

    const bullets = [];

    // Balance change (only show if we have a real previous balance to compare)
    const prevBalance = snapshot.balance;
    const balDelta = prevBalance != null && prevBalance > 0 ? data.totalXTZ - prevBalance : 0;
    if (Math.abs(balDelta) >= 0.01) {
        const sign = balDelta >= 0 ? '+' : '';
        const color = balDelta >= 0 ? 'var(--color-success, #10b981)' : 'var(--color-error, #ef4444)';
        bullets.push(`<span style="color:${color}"><strong>${sign}${balDelta.toFixed(2)} XTZ</strong></span> balance change`);
    }

    // USD delta
    if (data.xtzPrice && snapshot.usdValue) {
        const usdDelta = (data.totalXTZ * data.xtzPrice) - snapshot.usdValue;
        if (Math.abs(usdDelta) >= 0.01) {
            const sign = usdDelta >= 0 ? '+' : '';
            const color = usdDelta >= 0 ? 'var(--color-success, #10b981)' : 'var(--color-error, #ef4444)';
            bullets.push(`Portfolio <span style="color:${color}"><strong>${sign}$${Math.abs(usdDelta).toFixed(2)}</strong></span> in USD`);
        }
    }

    // Price movement
    if (data.xtzPrice && snapshot.xtzPrice) {
        const pricePct = ((data.xtzPrice - snapshot.xtzPrice) / snapshot.xtzPrice) * 100;
        if (Math.abs(pricePct) >= 0.5) {
            const sign = pricePct >= 0 ? '+' : '';
            const color = pricePct >= 0 ? 'var(--color-success, #10b981)' : 'var(--color-error, #ef4444)';
            bullets.push(`XTZ price <span style="color:${color}"><strong>${sign}${pricePct.toFixed(1)}%</strong></span> ($${data.xtzPrice.toFixed(3)})`);
        }
    }

    // Rewards
    if (data.rewardsLastCycle > 0) {
        const usd = data.xtzPrice ? ` ($${(data.rewardsLastCycle * data.xtzPrice).toFixed(2)})` : '';
        bullets.push(`Earned <strong>+${data.rewardsLastCycle.toFixed(2)} XTZ</strong>${usd} last cycle`);
    }

    // Baker health change
    if (snapshot.healthScore !== null && data.healthScore !== null && snapshot.healthScore !== data.healthScore) {
        const better = data.healthScore > snapshot.healthScore;
        const color = better ? 'var(--color-success, #10b981)' : 'var(--color-error, #ef4444)';
        bullets.push(`Baker health <span style="color:${color}"><strong>${better ? 'improved' : 'declined'}</strong></span> — ${data.health.icon} ${data.attestRate || ''}%`);
    }

    // Streak milestone
    if (data.rewardStreak > 0 && data.rewardStreak > (snapshot.rewardStreak || 0)) {
        bullets.push(`Reward streak: <strong>${data.rewardStreak} cycles</strong> 🔥`);
    }

    // Calm fallback
    if (bullets.length === 0) {
        bullets.push(`Your <strong>${fmtCompact(data.totalXTZ)} XTZ</strong> is quietly compounding at <strong>${data.apyRate}%</strong>`);
    }

    return {
        icon: '🌙',
        title: `While you were away (${formatTimeSince(elapsed)})`,
        body: `<div class="overnight-bullets">${bullets.map(b => `<span class="overnight-bullet">· ${b}</span>`).join('')}</div>`,
        accent: 'overnight',
    };
}

function buildMorningBrief(data) {
    const cards = [];

    // Card 1: Earnings summary
    const usdNote = data.xtzPrice ? ` That's $${(data.rewardsLastCycle * data.xtzPrice).toFixed(2)}.` : '';
    const bakerInactive = data.bakerInactive;
    let earningsLine, dailyLine;
    if (bakerInactive) {
        earningsLine = `<strong>${fmtCompact(data.totalXTZ)} XTZ</strong> — <strong style="color:#ef4444">baker inactive, earning nothing</strong>`;
        dailyLine = `<span style="color:#ef4444">⚠️ Re-delegate to start earning</span>`;
    } else if (data.rewardsLastCycle > 0) {
        earningsLine = `<strong>+${data.rewardsLastCycle.toFixed(2)} XTZ</strong> last cycle${usdNote}`;
        dailyLine = `~${data.estDaily.toFixed(2)} XTZ/day · ${data.apyRate}% APY`;
    } else {
        earningsLine = `<strong>${fmtCompact(data.totalXTZ)} XTZ</strong> earning ~<strong>${data.apyRate}% APY</strong>`;
        dailyLine = `~${data.estDaily.toFixed(2)} XTZ/day`;
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
        healthText = `<strong>${escapeHtml(data.bakerName)}</strong> ${data.health.icon} ${data.attestRate}% attestation`;
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
                voteText = `<br><span class="brief-sub" style="color:${color}">${icon} <strong>Hasn't voted</strong> on ${escapeHtml(v.proposal)}${urgencyNote}${timeLeft ? ' (' + timeLeft + ' left)' : ''}</span>`;
            }
        }
        
        // Quorum/supermajority context (exploration/promotion only)
        if (v.quorumPct !== null && v.quorumPct !== undefined) {
            const qColor = v.quorumPct < 50 ? 'var(--color-warning, #f59e0b)' : 'var(--text-dim, #888)';
            const supermajority = v.yayPct !== null ? ` • ${v.yayPct.toFixed(1)}% yay (needs 80%)` : '';
            voteText += `<br><span class="brief-sub" style="font-size:0.85em;color:${qColor}">🗳️ Participation: ${v.quorumPct.toFixed(1)}%${supermajority}</span>`;
        }
    }
    cards.push({
        icon: '🍞',
        title: 'Baker Status',
        body: `${streakText}${streakText ? '<br>' : ''}${healthText}${voteText}`,
        accent: 'baker',
    });

    // Card 3: Governance / Tezos Story teaser
    let storyText;
    if (data.story) {
        storyText = data.story.domainAlias
            ? `Known as <strong>${escapeHtml(data.story.domainAlias)}</strong><br>`
            : '';
        storyText += `Joined under <strong>${data.story.joinedEra}</strong> · <strong>${data.story.upgradesSeen} upgrades</strong> witnessed · zero forks`;
        if (data.story.proposalsInjected > 0) {
            storyText += `<br>📜 Injected <strong>${data.story.proposalsInjected} accepted proposal${data.story.proposalsInjected > 1 ? 's' : ''}</strong>`;
            if (data.story.proposalNames.length <= 4) {
                storyText += `: ${data.story.proposalNames.map(escapeHtml).join(', ')}`;
            }
        }
        if (data.story.bakerProposalsInjected > 0) {
            storyText += `<br>📜 Baker injected <strong>${data.story.bakerProposalsInjected} accepted proposal${data.story.bakerProposalsInjected > 1 ? 's' : ''}</strong>`;
            if (data.story.bakerProposalNames.length <= 4) {
                storyText += `: ${data.story.bakerProposalNames.map(escapeHtml).join(', ')}`;
            }
        }
        if (Number.isFinite(data.story.nftAssetsCollected)) {
            storyText += `<br>🖼️ Collected <strong>${fmtCount(data.story.nftAssetsCollected)} ${pluralize(data.story.nftAssetsCollected, 'NFT')}</strong>`;
        }
        if (hasCreatorStats(data.story.creatorStats)) {
            storyText += `<br>🎨 ${getCreatorSummaryHtml(data.story.creatorStats)}`;
        }
    } else {
        storyText = 'No on-chain history found for this address yet.';
    }
    const govText = data.activeProposal
        ? `<br><span class="brief-sub">Active governance: ${escapeHtml(data.activeProposal)}</span>`
        : '';
    cards.push({
        icon: '📜',
        title: 'Your Tezos Story',
        body: `${storyText}${govText}`,
        accent: 'story',
        shareBtn: !!data.story,
    });

    return cards;
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

    try {
        const resp = await fetch('https://api.tezos.domains/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: 'query ReverseLookup($address: String!) { reverseRecord(address: $address) { domain { name } } }',
                variables: { address }
            })
        });
        if (resp.ok) {
            const json = await resp.json();
            const name = json?.data?.reverseRecord?.domain?.name || null;
            domainAlias = isTezDomainAlias(name) ? name.toLowerCase() : null;
        }
    } catch {}

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

/**
 * Share Tezos Story as PNG card
 */
async function shareTezosStory(data) {
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
            width: 600px; height: 630px;
            background: linear-gradient(135deg, ${bgColor} 0%, ${isMatrix ? '#0a120a' : '#0a0a1e'} 100%);
            font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
            color: white; overflow: hidden;
            display: flex; flex-direction: column;
            align-items: center; justify-content: center;
            padding: 48px;
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
                    Zero hard forks. Ever.
                </div>

                <div style="display:flex;gap:3px;justify-content:center;flex-wrap:wrap;max-width:500px;margin:0 auto;">
                    ${badgesHtml}
                </div>
            </div>

            <div style="position:absolute;bottom:24px;left:40px;right:40px;display:flex;justify-content:space-between;align-items:center;z-index:1;">
                <span style="font-size:13px;color:rgba(255,255,255,0.3);">${data.address}</span>
                <span style="font-size:13px;color:${brand};font-weight:600;letter-spacing:1px;">tezos.systems</span>
            </div>
        `;

        document.body.appendChild(wrapper);
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
            { label: '📜 Story', text: `I've been on Tezos for ${data.story.daysSinceJoin.toLocaleString()} days.${domainSentence} Joined under ${data.story.joinedEra}. Witnessed ${data.story.upgradesSeen} protocol upgrades.${storyProposalSentence}${nftSentence}${creatorSentence} Zero hard forks.\n\nWhat's your Tezos story?\ntezos.systems` },
            { label: '🏛️ OG', text: `${data.story.joinedEra} era. ${data.story.upgradesSeen} upgrades witnessed. ${data.story.daysSinceJoin.toLocaleString()} days and counting.${domainSentence}${ogProposalSentence}${nftSentence}${creatorSentence}\n\nTezos doesn't fork. It evolves.\ntezos.systems` },
            { label: '📊 Data', text: `My Tezos Story:${domainLine}\n\n📅 ${data.story.daysSinceJoin.toLocaleString()} days on-chain\n🏛️ Joined: ${data.story.joinedEra}\n🔄 ${data.story.upgradesSeen} upgrades witnessed${injectedLine}${nftLine}${creatorLine}\n🔗 Zero forks\n\ntezos.systems` },
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
                    <div style="font-family:${sysFont}; font-size:10px; color:rgba(255,255,255,0.5); text-transform:uppercase; letter-spacing:1.5px;">Est. Annual Yield</div>
                    <div style="font-family:${sysFont}; font-size:22px; font-weight:800; color:${brand}; margin-top:6px;">+${data.estAnnual.toFixed(1)} XTZ</div>
                </div>
            </div>

            <div style="display:grid; grid-template-columns:${data.rewardStreak > 0 ? '1fr 1fr 1fr' : '1fr 1fr'}; gap:14px; text-align:center;">
                <div>
                    <div style="font-family:${sysFont}; font-size:10px; color:rgba(255,255,255,0.4); text-transform:uppercase; letter-spacing:1px;">APY</div>
                    <div style="font-family:'Orbitron',sans-serif; font-size:18px; font-weight:700; color:${brand}; margin-top:4px;">${data.apyRate}%</div>
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

        const tweetOptions = [
            { label: 'Flex', text: `Staking ${fmtCompact(data.totalXTZ)} XTZ on Tezos at ${data.apyRate}% APY${data.rewardStreak > 0 ? ` — ${data.rewardStreak} cycle reward streak 🔥` : ''}.\n\ntezos.systems` },
            { label: 'Recruit', text: `Earning ~${data.estAnnual.toFixed(0)} XTZ/year just by staking on Tezos. No lockup. Keep your keys.\n\nCheck your own stats:\ntezos.systems` },
            { label: 'Data', text: `My Tezos staking dashboard:\n\n📊 ${fmtCompact(data.totalXTZ)} XTZ portfolio\n📈 ${data.apyRate}% APY\n💰 ~${data.estAnnual.toFixed(0)} XTZ/year est.\n${data.rewardStreak > 0 ? `🔥 ${data.rewardStreak} cycle streak\n` : ''}\ntezos.systems` },
        ];

        showShareModal(canvas, tweetOptions, 'My Tezos Stats');
    } catch (err) {
        console.error('Share card error:', err);
    }
}

// ─── Render ──────────────────────────────────────────

// ─── Pulse Visualization ─────────────────────────────

/**
 * Radial staking pulse — ambient canvas behind the Morning Brief
 * Baker at center, user node orbiting, staker dots on rings
 */
function initPulseViz(strip, data) {
    // Remove existing canvas if re-rendering
    strip.querySelector('.pulse-canvas')?.remove();

    const canvas = document.createElement('canvas');
    canvas.className = 'pulse-canvas';
    canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;opacity:0.25;z-index:0;';
    strip.style.position = 'relative';
    strip.insertBefore(canvas, strip.firstChild);

    // Ensure brief content is above canvas
    const briefEl = strip.querySelector('.morning-brief');
    if (briefEl) briefEl.style.position = 'relative';

    const ctx = canvas.getContext('2d');
    let animId = null;
    let isVisible = true;

    // Get theme color
    function getAccentColor() {
        const theme = document.body.getAttribute('data-theme') || 'matrix';
        const colors = {
            matrix: [0, 255, 0],
            dark: [0, 212, 255],
            clean: [59, 130, 246],
            bubblegum: [255, 105, 180],
            void: [139, 92, 246],
            ember: [255, 159, 67],
            signal: [0, 255, 200],
        };
        return colors[theme] || colors.matrix;
    }

    // Staker dots — random but seeded positions
    const stakersCount = Math.min(data.stakersCount || 30, 60);
    const stakers = [];
    for (let i = 0; i < stakersCount; i++) {
        stakers.push({
            angle: (Math.PI * 2 * i / stakersCount) + (Math.random() * 0.3 - 0.15),
            radius: 0.55 + Math.random() * 0.3, // 55-85% of max radius
            speed: 0.0003 + Math.random() * 0.0004, // slow drift
            size: 1 + Math.random() * 1.5,
            brightness: 0.3 + Math.random() * 0.4,
        });
    }

    // User node
    const userNode = {
        angle: 0,
        radius: 0.45,
        speed: 0.0008,
        pulsePhase: 0,
    };

    // Block pulse effect
    let blockPulse = 0;
    window.addEventListener('block-pulse', () => { blockPulse = 1; });

    function resize() {
        const rect = strip.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
    }

    function draw(time) {
        if (!isVisible) { animId = requestAnimationFrame(draw); return; }

        const rect = strip.getBoundingClientRect();
        const w = rect.width;
        const h = rect.height;
        const cx = w * 0.82; // offset right so it doesn't cover text
        const cy = h * 0.5;
        const maxR = Math.min(w * 0.35, h * 0.9);

        const [r, g, b] = getAccentColor();

        ctx.clearRect(0, 0, w, h);

        // Orbit rings (subtle)
        for (let ring = 0.3; ring <= 0.85; ring += 0.18) {
            ctx.beginPath();
            ctx.arc(cx, cy, maxR * ring, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(${r},${g},${b},0.04)`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
        }

        // Baker node at center
        const bakerGlow = 4 + Math.sin(time * 0.001) * 2;
        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},0.8)`;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx, cy, bakerGlow + 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},0.1)`;
        ctx.fill();

        // Staker dots
        for (const s of stakers) {
            s.angle += s.speed;
            const x = cx + Math.cos(s.angle) * maxR * s.radius;
            const y = cy + Math.sin(s.angle) * maxR * s.radius;
            ctx.beginPath();
            ctx.arc(x, y, s.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${r},${g},${b},${s.brightness * 0.4})`;
            ctx.fill();
        }

        // User node (brighter, larger)
        userNode.angle += userNode.speed;
        userNode.pulsePhase += 0.03;
        const userPulse = 1 + Math.sin(userNode.pulsePhase) * 0.3;
        const ux = cx + Math.cos(userNode.angle) * maxR * userNode.radius;
        const uy = cy + Math.sin(userNode.angle) * maxR * userNode.radius;

        // Connection line to baker
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(ux, uy);
        ctx.strokeStyle = `rgba(${r},${g},${b},0.12)`;
        ctx.lineWidth = 1;
        ctx.stroke();

        // User dot
        const userSize = 3.5 * userPulse;
        ctx.beginPath();
        ctx.arc(ux, uy, userSize, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},0.9)`;
        ctx.fill();

        // User glow
        ctx.beginPath();
        ctx.arc(ux, uy, userSize + 4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},0.15)`;
        ctx.fill();

        // Block pulse — expanding ring from center
        if (blockPulse > 0) {
            const pulseR = maxR * (1 - blockPulse) * 0.8;
            ctx.beginPath();
            ctx.arc(cx, cy, pulseR, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(${r},${g},${b},${blockPulse * 0.3})`;
            ctx.lineWidth = 1.5;
            ctx.stroke();
            blockPulse -= 0.015;
            if (blockPulse < 0) blockPulse = 0;
        }

        animId = requestAnimationFrame(draw);
    }

    // IntersectionObserver — pause when not in viewport
    const observer = new IntersectionObserver(([entry]) => {
        isVisible = entry.isIntersecting;
    }, { threshold: 0.1 });
    observer.observe(strip);

    // Handle resize
    window.addEventListener('resize', resize);
    resize();
    animId = requestAnimationFrame(draw);

    // Cleanup function
    strip._pulseCleanup = () => {
        if (animId) cancelAnimationFrame(animId);
        observer.disconnect();
        window.removeEventListener('resize', resize);
    };
}

let _briefRendering = false;
let _briefRenderedAddr = null;
let _pendingBriefAddr = null;
let _briefRequestSeq = 0;

function renderBriefTabs(cards, data) {
    const container = document.getElementById('drawer-brief');
    if (!container) return;
    
    const sectionsHtml = cards.map(card => 
        `<div class="brief-section">
            <h4 class="brief-section-title">${card.icon} ${card.title}</h4>
            <div class="brief-body">${card.body}</div>
            ${card.shareBtn ? `<button class="glass-button drawer-share-btn story-share-btn" style="margin-top:12px;width:100%;">📸 Share Your Story</button>` : ''}
        </div>`
    ).join('');
    
    container.innerHTML = sectionsHtml;

    container.querySelectorAll('.story-share-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (data && data.story) {
                shareTezosStory(data);
            } else {
                const d = window._myTezosData;
                if (d && d.story) shareTezosStory(d);
            }
        });
    });
}

// Minibar removed — address shown in nav button, details in drawer
function createMinibar() {}
function updateMinibar() {}

async function renderMorningBrief(address, force = false) {
    // Prevent double-render of same address
    if (!force && _briefRendering) {
        _pendingBriefAddr = address; // queue new address for after current render
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
        const bakerAddr = isBaker ? address : account.delegate?.address;
        const bakerName = isBaker ? 'Self (Baker)' : (account.delegate?.alias || (bakerAddr ? bakerAddr.slice(0, 8) + '…' : 'None'));
        const bakerActive = isBaker ? account.active !== false : account.delegate?.active !== false;
        const bakerInactive = !bakerActive;

        const [participation, rewards, story, bakerVote, bakerActivity] = await Promise.all([
            bakerAddr ? fetchParticipation(bakerAddr) : Promise.resolve(null),
            fetchRecentRewards(address, account),
            fetchTezosStory(address, account, bakerAddr),
            bakerAddr ? fetchBakerVoteStatus(bakerAddr) : Promise.resolve(null),
            isBaker ? fetchRecentBakerActivity(address) : Promise.resolve(null),
        ]);
        const operatorStatus = bakerAddr ? await fetchBakerOperatorStatus(bakerAddr, participation) : null;

        const healthScore = calcBakerHealth(participation);
        const health = healthLabel(healthScore);

        let rewardsLastCycle = 0;
        let rewardStreak = 0;
        if (rewards && rewards.length) {
            rewardsLastCycle = getRewardAmount(rewards[0]);
            rewardStreak = calcRewardStreak(rewards);
        }

        const isStaker = staked > 0;
        const apyRate = isStaker ? apy.stakeAPY : apy.delegateAPY;
        const estDaily = totalXTZ * (apyRate / 100) / 365.25;
        const estAnnual = totalXTZ * (apyRate / 100);

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
            totalXTZ, staked, xtzPrice, apyRate, estDaily, estAnnual,
            rewardsLastCycle, rewardStreak,
            bakerName, bakerInactive, healthScore, health, attestRate,
            isStaker, story, activeProposal, bakerVote, bakerActivity, operatorStatus,
        };

        const cards = buildMorningBrief(data);
        if (requestSeq !== _briefRequestSeq || localStorage.getItem(STORAGE_KEY) !== address) {
            if (requestSeq === _briefRequestSeq) _briefRendering = false;
            return;
        }

        // Overnight Report — prepend if returning user
        const overnight = buildOvernightCard(data, getOvernightSnapshot());
        if (overnight) cards.unshift(overnight);
        saveOvernightSnapshot(data);

        // Render morning brief sections in drawer
        renderBakerOperatorStatus(operatorStatus, isBaker);
        renderBriefTabs(cards, data);
        renderBakerActivity(bakerActivity);

        // Feature 6: Baker health grade in drawer
        if (healthScore !== null) {
            const gradeInfo = letterGrade(healthScore);
            const gradeContainer = document.getElementById('drawer-baker');
            if (gradeContainer) {
                // Remove old grade if re-rendering
                gradeContainer.querySelector('.drawer-baker-grade')?.remove();
                const gradeEl = document.createElement('div');
                gradeEl.className = 'drawer-baker-grade';
                gradeEl.innerHTML = `
                    <span class="grade-letter" style="color:${gradeInfo.color}">${gradeInfo.grade}</span>
                    <span class="grade-label">Baker Grade</span>
                    <span class="grade-score">${healthScore}/100</span>
                `;
                gradeContainer.insertBefore(gradeEl, gradeContainer.firstChild);
            }
        }

        // Feature 7: Historical rewards sparkline
        if (rewards && rewards.length > 1) {
            const rewardsSection = document.getElementById('drawer-rewards');
            if (rewardsSection) {
                // Remove old sparkline
                rewardsSection.querySelector('.drawer-rewards-spark')?.remove();
                const sparkContainer = document.createElement('div');
                sparkContainer.className = 'drawer-rewards-spark';
                sparkContainer.style.cssText = 'position:relative;width:100%;height:80px;margin-top:12px;';
                sparkContainer.innerHTML = `
                    <div class="spark-label" style="font-size:0.7rem;color:var(--text-muted);margin-bottom:4px;">Earnings Trend (${rewards.length} cycles)</div>
                    <div style="position:relative;height:60px;">
                        <canvas id="drawer-rewards-sparkline"></canvas>
                    </div>
                `;
                rewardsSection.appendChild(sparkContainer);

                const values = rewards.map(r => getRewardAmount(r)).reverse();
                const ctx = document.getElementById('drawer-rewards-sparkline')?.getContext('2d');
                if (ctx && window.Chart) {
                    if (window._drawerRewardsChart) window._drawerRewardsChart.destroy();
                    window._drawerRewardsChart = new Chart(ctx, {
                        type: 'line',
                        data: { labels: values.map((_, i) => i), datasets: [{ data: values, borderColor: 'rgba(0,212,255,0.8)', borderWidth: 1.5, fill: true, backgroundColor: 'rgba(0,212,255,0.08)', pointRadius: 0, tension: 0.3 }] },
                        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, scales: { x: { display: false }, y: { display: false, grace: '20%' } } }
                    });
                }
            }
        }

        // Feature 8: Non-baker conditional CTA
        if (!bakerAddr && !isBaker) {
            const bakerResults = document.getElementById('my-baker-results');
            if (bakerResults) {
                bakerResults.innerHTML = `
                    <div class="drawer-no-baker">
                        <p>💡 This address isn't delegated or staking.</p>
                        <p>Delegate to a baker to start earning ~${apy.delegateAPY}% APY on your ${balance.toLocaleString()} XTZ.</p>
                        <a href="https://gov.tez.capital" target="_blank" class="glass-button" style="margin-top:8px;">🥩 Browse Bakers</a>
                    </div>
                `;
            }
        }

        // Feature 10: Freshness indicator
        updateFreshness();

        // Update minibar on main page
        updateMinibar(data);

        // Store data for external use
        window._myTezosData = data;
        window.dispatchEvent(new Event('my-tezos-data-ready'));
        _briefRendering = false;
        const pending = _pendingBriefAddr;
        _pendingBriefAddr = null;
        if (pending && pending !== _briefRenderedAddr) {
            renderMorningBrief(pending, true).catch(() => {});
        }

    } catch (err) {
        if (requestSeq !== _briefRequestSeq || localStorage.getItem(STORAGE_KEY) !== address) {
            if (requestSeq === _briefRequestSeq) _briefRendering = false;
            return;
        }
        _briefRendering = false;
        console.warn('Morning Brief error:', err);
        const container = document.getElementById('drawer-brief');
        if (container) {
            container.innerHTML = `<div style="color:var(--text-dim);font-size:0.85rem;">⚠️ Could not load data. <button id="brief-retry" style="background:none;border:none;color:var(--accent);cursor:pointer;">Retry</button></div>`;
            document.getElementById('brief-retry')?.addEventListener('click', () => renderMorningBrief(address, true));
        }
        renderBakerOperatorStatus(null, false);
        renderBakerActivity(null);
    }
}

// Feature 10: Freshness indicator
function updateFreshness() {
    const el = document.getElementById('drawer-freshness');
    if (!el) return;
    const now = new Date();
    el.innerHTML = `
        <span class="freshness-time">Updated ${now.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}</span>
        <button id="drawer-refresh" class="freshness-refresh">↻ Refresh</button>
    `;
    document.getElementById('drawer-refresh')?.addEventListener('click', (e) => {
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
    });
}

// ─── Init & Export ───────────────────────────────────

export function initMyTezos() {
    // Create minibar under price bar
    createMinibar();

    const address = localStorage.getItem(STORAGE_KEY);

    window.addEventListener('my-baker-updated', (e) => {
        const newAddr = e.detail?.address;
        if (newAddr) {
            renderMorningBrief(newAddr, true);
        } else {
            // Clear drawer sections
            ['drawer-operator-status', 'drawer-brief', 'drawer-network', 'drawer-rewards', 'drawer-baker-activity'].forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    el.innerHTML = '';
                    if (id === 'drawer-baker-activity' || id === 'drawer-operator-status') el.hidden = true;
                }
            });
        }
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
}
