/**
 * The Chamber — Tezos Governance War Room
 * Full-screen governance modal with live voting data, baker heatmap,
 * vote momentum sparklines, and 5-stage pipeline visualization.
 * 
 * v2: Staggered animations, epoch navigation, treemap heatmap,
 *     vote projection, ambient war room effects, historical comparison,
 *     upgraded entry card with live mini-status.
 * 
 * Uses TzKT API for all governance data.
 * Falls back to last complete epoch when no active proposal exists.
 */

import { escapeHtml } from '../core/utils.js';
import { API_URLS } from '../core/config.js';

const TZKT = API_URLS.tzkt;
const PROTOCOL_DATA_URL = '/data/protocol-data.json';
const GOVERNANCE_VOTES_URL = '/data/governance-votes.json';
const GOVERNANCE_REPORT_URL = '/data/governance-refresh-report.json';
const HISTORY_CONTEXT_ROWS = 20;
const CHAMBER_ENTRY_REFRESH_MS = 60000;
const CHAMBER_MARK_SVG = '<svg class="chamber-entry-mark" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><path d="M12 25h40M18 25v25M30 25v25M42 25v25M14 50h36M10 56h44M32 8l22 12H10L32 8Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

let _chamberEntryTimer = null;
let _chamberEntryVisibilityWired = false;
let _chamberEntryRefreshInFlight = false;

const STAGES = [
    {
        key: 'proposal',
        label: 'Proposal',
        icon: '📜',
        detail: 'Bakers upvote candidate protocol hashes; the leading proposal advances.'
    },
    {
        key: 'exploration',
        label: 'Exploration',
        icon: '🔍',
        detail: 'First on-chain ballot. The proposal needs quorum and 80% Yay supermajority.'
    },
    {
        key: 'testing',
        label: 'Cooldown',
        icon: '⏳',
        detail: 'No baker ballots. The proposal is tested and reviewed before the final vote.'
    },
    {
        key: 'promotion',
        label: 'Promotion',
        icon: '🗳️',
        detail: 'Final on-chain ballot. Passing again clears the protocol for activation.'
    },
    {
        key: 'adoption',
        label: 'Adoption',
        icon: '🚀',
        detail: 'The approved protocol activates after the final vote clears.'
    }
];

function isBallotPeriod(periodOrKind) {
    const kind = typeof periodOrKind === 'string' ? periodOrKind : periodOrKind?.kind;
    return kind === 'exploration' || kind === 'promotion';
}

function periodTitle(kind) {
    const labels = {
        proposal: 'Proposal',
        exploration: 'Exploration',
        testing: 'Cooldown',
        cooldown: 'Cooldown',
        promotion: 'Promotion',
        adoption: 'Adoption'
    };
    return labels[kind] || kind || 'Unknown';
}

function votePeriodTitle(period) {
    return period?.kind === 'promotion' ? 'Promotion' : 'Exploration';
}

function isSamePeriod(a, b) {
    return a?.index !== undefined && b?.index !== undefined && a.index === b.index;
}

function chooseVotePeriod(epoch, currentPeriod = null) {
    const periods = epoch?.periods || [];
    if (currentPeriod?.status === 'active' && isBallotPeriod(currentPeriod)) {
        return periods.find(p => p.index === currentPeriod.index) || currentPeriod;
    }

    return [...periods]
        .filter(isBallotPeriod)
        .sort((a, b) => (b.index || 0) - (a.index || 0))[0] || null;
}

let _chamberCache = {};
let _chamberCacheTime = {};
const CACHE_TTL = 60000;
let _currentEpochIndex = null;
let _latestEpochIndex = null;
let _earliestEpochIndex = 1;
let _chamberAnimFrame = null;
let _savedBodyOverflow = null;
let _savedHtmlOverflow = null;
let _savedBodyPosition = null;
let _savedBodyTop = null;
let _savedBodyWidth = null;
let _savedScrollY = 0;
let _protocolHistoryPromise = null;
let _governanceVotesPromise = null;
let _governanceReportPromise = null;
const _ballotTimelinePromises = new Map();

function lockPageScrollForChamber() {
    if (_savedBodyOverflow !== null) return;
    _savedScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    _savedBodyOverflow = document.body.style.overflow;
    _savedHtmlOverflow = document.documentElement.style.overflow;
    _savedBodyPosition = document.body.style.position;
    _savedBodyTop = document.body.style.top;
    _savedBodyWidth = document.body.style.width;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${_savedScrollY}px`;
    document.body.style.width = '100%';
}

function unlockPageScrollForChamber() {
    if (_savedBodyOverflow === null) return;
    document.body.style.overflow = _savedBodyOverflow;
    document.documentElement.style.overflow = _savedHtmlOverflow || '';
    document.body.style.position = _savedBodyPosition || '';
    document.body.style.top = _savedBodyTop || '';
    document.body.style.width = _savedBodyWidth || '';
    window.scrollTo(0, _savedScrollY);
    _savedBodyOverflow = null;
    _savedHtmlOverflow = null;
    _savedBodyPosition = null;
    _savedBodyTop = null;
    _savedBodyWidth = null;
    _savedScrollY = 0;
}

async function fetchEpochData(epochIndex, currentPeriod = null) {
    const [epoch, baseProtocols, report] = await Promise.all([
        (await fetch(`${TZKT}/voting/epochs/${epochIndex}`)).json(),
        loadProtocolHistory(),
        loadGovernanceReport()
    ]);
    const protocols = withActiveProposalName(baseProtocols, report);
    let proposal = epoch.proposals?.[0] || null;

    let votePeriod = chooseVotePeriod(epoch, currentPeriod);
    
    let voters = [];
    if (votePeriod) {
        voters = await (await fetch(`${TZKT}/voting/periods/${votePeriod.index}/voters?sort.desc=votingPower&limit=250`)).json();
    }

    let previousVotePeriod = null;
    let previousVoters = [];
    if (votePeriod?.kind === 'promotion') {
        previousVotePeriod = (epoch.periods || []).find(p => p.kind === 'exploration' && p.index !== votePeriod.index) || null;
        if (previousVotePeriod?.index) {
            try {
                previousVoters = await (await fetch(`${TZKT}/voting/periods/${previousVotePeriod.index}/voters?sort.desc=votingPower&limit=250`)).json();
            } catch (_) {
                previousVoters = [];
            }
        }
    }
    
    return { epoch, proposal, votePeriod, voters, previousVotePeriod, previousVoters, protocols, report };
}

async function fetchChamberData(epochIndex) {
    if (epochIndex && _chamberCache[epochIndex] && (Date.now() - _chamberCacheTime[epochIndex]) < CACHE_TTL) {
        return _chamberCache[epochIndex];
    }
    
    try {
        if (!epochIndex) {
            const currentPeriod = await (await fetch(`${TZKT}/voting/periods/current`)).json();
            let activeEpoch = null;
            let isLive = false;
            
            if (currentPeriod.status === 'active' && currentPeriod.kind !== 'proposal') {
                activeEpoch = currentPeriod.epoch;
                isLive = true;
            } else if (currentPeriod.kind === 'proposal' && currentPeriod.proposalsCount > 0) {
                activeEpoch = currentPeriod.epoch;
                isLive = true;
            }
            
            if (!activeEpoch) {
                const epochs = await (await fetch(`${TZKT}/voting/epochs?sort.desc=id&limit=10`)).json();
                _latestEpochIndex = epochs[0]?.index || 83;
                const lastComplete = epochs.find(e => e.status === 'completed');
                activeEpoch = lastComplete ? lastComplete.index : 83;
            } else {
                _latestEpochIndex = activeEpoch;
            }
            
            epochIndex = activeEpoch;
            const data = await fetchEpochData(epochIndex, currentPeriod);
            data.isLive = isLive;
            data.isLiveVote = isLive && isBallotPeriod(currentPeriod) && isSamePeriod(currentPeriod, data.votePeriod);
            data.currentPeriod = currentPeriod;
            
            _chamberCache[epochIndex] = data;
            _chamberCacheTime[epochIndex] = Date.now();
            _currentEpochIndex = epochIndex;
            return data;
        }
        
        const data = await fetchEpochData(epochIndex);
        data.isLive = false;
        data.isLiveVote = false;
        data.currentPeriod = null;
        
        _chamberCache[epochIndex] = data;
        _chamberCacheTime[epochIndex] = Date.now();
        _currentEpochIndex = epochIndex;
        return data;
    } catch (err) {
        console.error('Chamber: fetch failed', err);
        return null;
    }
}

async function fetchRecentEpochs(count = 5) {
    try {
        const epochs = await (await fetch(`${TZKT}/voting/epochs?sort.desc=id&limit=${count}`)).json();
        return epochs;
    } catch { return []; }
}


async function fetchBallotTimeline(periodIndex) {
    if (_ballotTimelinePromises.has(periodIndex)) return _ballotTimelinePromises.get(periodIndex);

    // Fetch all ballot operations for a period, sorted by time
    // TzKT returns max 10000 per call, paginate if needed
    const promise = (async () => {
        const allBallots = [];
        let offset = 0;
        const limit = 1000;

        while (true) {
            const url = `${TZKT}/operations/ballots?period=${periodIndex}&sort.asc=id&limit=${limit}&offset=${offset}`;
            const batch = await (await fetch(url)).json();
            if (!batch.length) break;
            allBallots.push(...batch);
            if (batch.length < limit) break;
            offset += limit;
            // Safety: cap at 10k ballots
            if (offset >= 10000) break;
        }

        return allBallots.sort((a, b) => (new Date(a.timestamp) - new Date(b.timestamp)) || ((a.id || 0) - (b.id || 0)));
    })().catch(err => {
        _ballotTimelinePromises.delete(periodIndex);
        throw err;
    });

    _ballotTimelinePromises.set(periodIndex, promise);
    return promise;
}

function fmtPower(mutez) {
    const xtz = mutez / 1e6;
    if (xtz >= 1e6) return `${(xtz / 1e6).toFixed(1)}M`;
    if (xtz >= 1e3) return `${(xtz / 1e3).toFixed(0)}K`;
    return xtz.toFixed(0);
}

function formatCount(value) {
    return Number(value || 0).toLocaleString('en-US');
}

function fmtCountdown(endTime) {
    const diff = new Date(endTime) - new Date();
    if (diff <= 0) return 'Ended';
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

function validDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function fmtShortDate(value, includeYear = false) {
    const date = validDate(value);
    if (!date) return '';
    const opts = { month: 'short', day: 'numeric', timeZone: 'UTC' };
    if (includeYear) opts.year = 'numeric';
    return date.toLocaleDateString('en-US', opts);
}

function fmtBallotTime(value) {
    const date = validDate(value);
    if (!date) return 'time n/a';
    return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'UTC'
    });
}

function fmtUtcDateTime(value) {
    const date = validDate(value);
    if (!date) return '';
    return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'UTC'
    });
}

function fmtDateRange(startTime, endTime, includeYear = false) {
    const start = validDate(startTime);
    const end = validDate(endTime);
    if (!start && !end) return '';
    if (!start) return `Ends ${fmtShortDate(endTime, includeYear)}`;
    if (!end) return `Starts ${fmtShortDate(startTime, includeYear)}`;
    const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
    const startText = fmtShortDate(startTime, includeYear && !sameYear);
    const endText = fmtShortDate(endTime, includeYear);
    return `${startText} - ${endText}`;
}

function fmtDurationBetween(startTime, endTime) {
    const start = validDate(startTime);
    const end = validDate(endTime);
    if (!start || !end) return '';
    const diff = end - start;
    if (diff <= 0) return '';
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
    if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    return `${minutes}m`;
}

function periodStatusText(period, isLive) {
    if (!period) return 'Upcoming';
    if (period.status === 'active') {
        return isLive && period.endTime ? `${fmtCountdown(period.endTime)} left` : 'Active';
    }
    if (period.status === 'success') return period.kind === 'proposal' ? 'Selected' : 'Passed';
    if (period.status === 'no_proposals') return 'No proposal';
    if (period.status === 'no_quorum') return 'No quorum';
    if (period.status === 'no_supermajority') return 'No supermajority';
    if (period.status === 'failed') return 'Failed';
    return period.status ? periodTitle(period.status) : 'Recorded';
}

function calcSupermajority(period) {
    if (!period?.yayVotingPower) return null;
    const yay = period.yayVotingPower;
    const nay = period.nayVotingPower || 0;
    const total = yay + nay;
    return total === 0 ? 0 : (yay / total) * 100;
}

function calcQuorum(period, voters) {
    if (!period || !voters) return null;
    const votedPower = voters.filter(v => v.status !== 'none').reduce((s, v) => s + v.votingPower, 0);
    return period.totalVotingPower > 0 ? (votedPower / period.totalVotingPower) * 100 : 0;
}

function protocolHashMatches(hash, prefix) {
    if (!hash || !prefix) return false;
    return hash.startsWith(prefix) || hash.startsWith(prefix.slice(0, 8)) || prefix.startsWith(hash.slice(0, 8));
}

function protocolFromHash(hash, protocols = []) {
    const fromData = protocols.find(p => protocolHashMatches(hash, p.hash));
    if (fromData) return fromData;
    return null;
}

function extractProtoName(hash, protocols = []) {
    const protocol = protocolFromHash(hash, protocols);
    if (protocol?.name) return protocol.name;
    return hash.slice(0, 12) + '…';
}

async function loadProtocolHistory() {
    if (!_protocolHistoryPromise) {
        _protocolHistoryPromise = fetch(PROTOCOL_DATA_URL, { cache: 'no-store' })
            .then(r => r.ok ? r.json() : Promise.reject(new Error(`protocol data HTTP ${r.status}`)))
            .then(data => Array.isArray(data.protocols) ? data.protocols : [])
            .catch(err => {
                console.warn('Chamber: protocol history unavailable', err);
                return [];
            });
    }
    return _protocolHistoryPromise;
}

async function loadGovernanceVotes() {
    if (!_governanceVotesPromise) {
        _governanceVotesPromise = fetch(GOVERNANCE_VOTES_URL, { cache: 'no-store' })
            .then(r => r.ok ? r.json() : Promise.reject(new Error(`governance votes HTTP ${r.status}`)))
            .catch(err => {
                console.warn('Chamber: local governance vote history unavailable', err);
                return null;
            });
    }
    return _governanceVotesPromise;
}

async function loadGovernanceReport() {
    if (!_governanceReportPromise) {
        _governanceReportPromise = fetch(GOVERNANCE_REPORT_URL, { cache: 'no-store' })
            .then(r => r.ok ? r.json() : Promise.reject(new Error(`governance report HTTP ${r.status}`)))
            .catch(err => {
                console.warn('Chamber: governance report unavailable', err);
                return null;
            });
    }
    return _governanceReportPromise;
}

/**
 * Resolve a live, not-yet-activated proposal (e.g. one in its Promotion period)
 * by name without polluting the activated-protocol timeline. The refresh report
 * carries the canonical proposalName/proposalHash; inject a name-only lookup entry
 * so The Chamber shows e.g. "Ushuaia" instead of a raw PsUshuai9… hash. Harmless
 * for historical epochs — the synthetic hash simply won't match their proposals.
 */
function withActiveProposalName(protocols, report) {
    const gov = report?.currentGovernance;
    const hash = gov?.proposalHash;
    const name = gov?.proposalName;
    if (!hash || !name) return protocols;
    if (protocols.some(p => protocolHashMatches(hash, p.hash))) return protocols;
    return [...protocols, { name, hash, active: true }];
}

// ─── Pipeline with staggered animation ───

function renderPipeline(epoch, isLive) {
    const periodMap = {};
    (epoch.periods || []).forEach(p => { periodMap[p.kind] = p; });
    
    return STAGES.map((stage, i) => {
        const period = periodMap[stage.key];
        let stateClass = 'future';
        let statusText = 'Upcoming';
        let dateText = stage.key === 'adoption' ? 'After Promotion' : 'Pending dates';
        let durationText = '';
        
        if (period) {
            if (period.status === 'active') {
                stateClass = 'active';
                statusText = periodStatusText(period, isLive);
            } else if (period.status === 'success' || period.status === 'no_proposals') {
                stateClass = 'completed';
                statusText = periodStatusText(period, isLive);
            } else if (period.status === 'no_quorum' || period.status === 'no_supermajority') {
                stateClass = 'failed';
                statusText = periodStatusText(period, isLive);
            } else {
                statusText = periodStatusText(period, isLive);
            }
            dateText = fmtDateRange(period.startTime, period.endTime);
            durationText = fmtDurationBetween(period.startTime, period.endTime);
        }
        
        const delay = i * 120;
        
        return `
            <div class="chamber-stage ${stateClass} chamber-anim-fade" data-stage="${stage.key}" style="animation-delay:${delay}ms">
                <div class="stage-icon">${stage.icon}</div>
                <div class="stage-label">${stage.label}</div>
                <div class="stage-status">${escapeHtml(statusText)}</div>
                <div class="stage-dates">${escapeHtml(dateText || 'Pending dates')}</div>
                <div class="stage-duration">${durationText ? `${escapeHtml(durationText)} total` : escapeHtml(stage.key === 'adoption' ? 'if approved' : 'not scheduled')}</div>
                ${stateClass === 'active' && isLive ? '<div class="stage-pulse"></div>' : ''}
            </div>
            ${i < STAGES.length - 1 ? `<div class="stage-connector ${stateClass === 'completed' ? 'completed' : ''} chamber-anim-fade" style="animation-delay:${delay + 60}ms"><div class="connector-fill"></div></div>` : ''}
        `;
    }).join('');
}

function renderGovernanceProcess(epoch, { compact = false } = {}) {
    const startTime = epoch?.startTime || epoch?.periods?.[0]?.startTime;
    const endTime = epoch?.endTime || [...(epoch?.periods || [])].reverse().find(p => p.endTime)?.endTime;
    const rangeText = fmtDateRange(startTime, endTime, true) || 'Dates unavailable';
    const durationText = fmtDurationBetween(startTime, endTime);
    const activePeriod = (epoch?.periods || []).find(p => p.status === 'active');
    const activeLabel = activePeriod ? periodTitle(activePeriod.kind) : 'Historical epoch';

    const processBody = `
            <div class="chamber-process-summary">
                <div>
                    <span class="process-kicker">Governance process</span>
                    <h3>Proposal to activation path</h3>
                </div>
                <div class="process-window">
                    <span>Epoch ${escapeHtml(String(epoch?.index || ''))} · ${escapeHtml(activeLabel)}</span>
                    <strong>${escapeHtml(rangeText)}</strong>
                    ${durationText ? `<small>${escapeHtml(durationText)} visible window</small>` : ''}
                </div>
            </div>
            <p class="process-brief">Bakers select a proposal, run an Exploration vote, pause for Cooldown testing, then hold the final Promotion vote before Adoption.</p>
            <div class="chamber-process-steps">
                ${STAGES.map(stage => `
                    <div class="process-step">
                        <span class="process-step-label">${stage.icon} ${escapeHtml(stage.label)}</span>
                        <span>${escapeHtml(stage.detail)}</span>
                    </div>
                `).join('')}
            </div>
    `;

    if (compact) {
        return `
            <details class="chamber-process-card chamber-process-card-compact chamber-anim-fade" aria-label="Tezos governance process" style="animation-delay:620ms">
                <summary>How Tezos governance works</summary>
                ${processBody}
            </details>
        `;
    }

    return `
        <section class="chamber-process-card chamber-anim-fade" aria-label="Tezos governance process" style="animation-delay:80ms">
            ${processBody}
        </section>
    `;
}

// ─── Supermajority gauge with sweep animation ───

function renderSupermajorityGauge(period, data = {}) {
    const pct = calcSupermajority(period);
    if (pct === null) return '<div class="chamber-gauge-empty">No vote data</div>';
    
    const yay = period.yayVotingPower || 0;
    const nay = period.nayVotingPower || 0;
    const pass = period.passVotingPower || 0;
    const threshold = 80;
    const passed = pct >= threshold;
    const isLiveVote = Boolean(data.isLiveVote && isSamePeriod(data.currentPeriod, period));
    const resultLabel = `${votePeriodTitle(period)} ${isLiveVote ? 'live vote' : 'result'}`;
    const contextLabel = isLiveVote
        ? 'Ballots are open now'
        : data.currentPeriod?.kind === 'testing'
            ? 'No ballots are open during Cooldown'
            : period.status === 'success'
                ? 'Completed on-chain vote'
                : 'Recorded on-chain vote';
    
    const radius = 80, cx = 100, cy = 100;
    const startAngle = -180;
    
    function polar(angle) {
        const rad = (angle * Math.PI) / 180;
        return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
    }
    function arc(s, e) {
        const sp = polar(s), ep = polar(e);
        return `M ${sp.x} ${sp.y} A ${radius} ${radius} 0 ${(e - s) > 180 ? 1 : 0} 1 ${ep.x} ${ep.y}`;
    }
    
    const valAngle = startAngle + (pct / 100) * 180;
    const thrAngle = startAngle + (threshold / 100) * 180;
    const thrPos = polar(thrAngle);
    const arcLength = (Math.abs(valAngle - startAngle) / 180) * Math.PI * radius;
    
    return `
        <div class="chamber-gauge chamber-anim-fade" style="animation-delay:200ms">
            <div class="gauge-context-label">${escapeHtml(resultLabel)}</div>
            <div class="gauge-context-meta">${escapeHtml(contextLabel)}</div>
            <svg viewBox="0 0 200 115" class="gauge-svg">
                <path d="${arc(startAngle, 0)}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="14" stroke-linecap="round"/>
                <path d="${arc(startAngle, valAngle)}" fill="none" stroke="${passed ? 'var(--accent-cyan)' : 'var(--accent-pink)'}" stroke-width="14" stroke-linecap="round" class="gauge-arc ${passed ? 'passed' : 'failing'} gauge-sweep" style="stroke-dasharray:${arcLength};stroke-dashoffset:${arcLength}"/>
                <line x1="${thrPos.x}" y1="${thrPos.y - 10}" x2="${thrPos.x}" y2="${thrPos.y + 10}" stroke="var(--accent-purple)" stroke-width="2.5" opacity="0.9"/>
            </svg>
            <div class="gauge-center">
                <div class="gauge-value ${passed ? 'passed' : 'failing'}" data-target="${pct.toFixed(1)}">0.0%</div>
                <div class="gauge-sublabel">Supermajority</div>
            </div>
            <div class="gauge-threshold-note">80% threshold · Yay / (Yay + Nay)</div>
            <div class="gauge-legend">
                <span class="legend-yay">🟢 YAY ${fmtPower(yay)}</span>
                <span class="legend-nay">🔴 NAY ${fmtPower(nay)}</span>
                <span class="legend-pass">🟡 PASS ${fmtPower(pass)}</span>
            </div>
            <div class="chamber-tooltip-hint">80% of voting stake must vote Yay (excluding Pass) for the proposal to advance</div>
        </div>
    `;
}

// ─── Quorum bar ───

function renderQuorumBar(period, voters) {
    const quorum = calcQuorum(period, voters);
    if (quorum === null) return '';
    const required = period.ballotsQuorum || 50;
    const passed = quorum >= required;
    const votedCount = voters.filter(v => v.status !== 'none').length;
    
    return `
        <div class="chamber-quorum chamber-anim-fade" style="animation-delay:400ms">
            <div class="quorum-header">
                <span class="quorum-title">${escapeHtml(votePeriodTitle(period))} Quorum</span>
                <span class="quorum-value ${passed ? 'passed' : 'failing'}">${quorum.toFixed(1)}% / ${required.toFixed(1)}% required</span>
            </div>
            <div class="quorum-bar-track">
                <div class="quorum-bar-fill ${passed ? 'passed' : 'failing'} quorum-animate" style="width: 0%" data-target-width="${Math.min(quorum, 100)}%"></div>
                <div class="quorum-threshold" style="left: ${required}%"></div>
            </div>
            <div class="quorum-meta">${votedCount} of ${voters.length} bakers voted</div>
            <div class="chamber-tooltip-hint">Minimum participation threshold — enough bakers must vote for the result to count</div>
        </div>
    `;
}

// ─── Treemap heatmap with cascade animation ───

function renderBakerHeatmap(voters) {
    if (!voters?.length) return '';
    const sorted = [...voters].sort((a, b) => b.votingPower - a.votingPower);
    const top = sorted.slice(0, 50);
    const maxPower = top[0]?.votingPower || 1;
    
    const cells = top.map((v, idx) => {
        const ratio = v.votingPower / maxPower;
        const sqrtRatio = Math.sqrt(ratio);
        const size = Math.max(18, Math.round(sqrtRatio * 64));
        let colorClass = 'not-voted';
        if (v.status === 'voted_yay') colorClass = 'voted-yay';
        else if (v.status === 'voted_nay') colorClass = 'voted-nay';
        else if (v.status === 'voted_pass') colorClass = 'voted-pass';
        const address = v.delegate.address || '';
        const name = escapeHtml(v.delegate.alias || address.slice(0, 8) + '…');
        const delay = 300 + idx * 30;
        
        return `<a class="heatmap-cell ${colorClass} heatmap-cascade" href="https://tzkt.io/${escapeHtml(address)}" target="_blank" rel="noopener" style="width:${size}px;height:${size}px;animation-delay:${delay}ms" title="${name}: ${fmtPower(v.votingPower)} ꜩ — ${v.status === 'none' ? 'NOT VOTED' : v.status.replace('voted_', '').toUpperCase()}">
            ${size >= 32 ? `<span class="heatmap-label">${name.length > 6 ? name.slice(0, 5) + '…' : name}</span>` : ''}
        </a>`;
    }).join('');
    
    const yayCt = top.filter(v => v.status === 'voted_yay').length;
    const nayCt = top.filter(v => v.status === 'voted_nay').length;
    const passCt = top.filter(v => v.status === 'voted_pass').length;
    const noneCt = top.filter(v => v.status === 'none').length;
    
    return `
        <div class="chamber-heatmap chamber-anim-fade" style="animation-delay:300ms">
            <div class="heatmap-title">Baker Consensus Heatmap</div>
            <div class="heatmap-subtitle">Top 50 bakers · Box size approximates stake power · Color = vote</div>
            <div class="heatmap-scale">Largest: ${fmtPower(sorted[0]?.votingPower || 0)} ꜩ · Smallest shown: ${fmtPower(top[top.length - 1]?.votingPower || 0)} ꜩ</div>
            <div class="heatmap-grid">${cells}</div>
            <div class="heatmap-mobile-summary">
                <span>🟢 ${yayCt}</span>
                <span>🔴 ${nayCt}</span>
                <span>🟡 ${passCt}</span>
                <span>⬜ ${noneCt}</span>
            </div>
            <div class="heatmap-legend">
                <span class="legend-item"><span class="dot voted-yay"></span>Yay</span>
                <span class="legend-item"><span class="dot voted-nay"></span>Nay</span>
                <span class="legend-item"><span class="dot voted-pass"></span>Pass</span>
                <span class="legend-item"><span class="dot not-voted"></span>Not voted</span>
            </div>
        </div>
    `;
}

// ─── Momentum sparkline with projection ───

function renderMomentumSparkline(voters, isLiveVote, votePeriod) {
    if (!voters?.length) return '';
    const voted = voters.filter(v => v.status !== 'none');
    const total = voters.length;
    const totalPower = voters.reduce((s, v) => s + v.votingPower, 0);
    const cumPower = voted.reduce((s, v) => s + v.votingPower, 0);
    
    let projectionHtml = '';
    if (isLiveVote && votePeriod?.endTime) {
        const now = new Date();
        const start = new Date(votePeriod.startTime);
        const end = new Date(votePeriod.endTime);
        const elapsed = now - start;
        const duration = end - start;
        const pctElapsed = Math.min(elapsed / duration, 1);
        
        if (pctElapsed > 0.05 && pctElapsed < 1) {
            const currentParticipation = cumPower / totalPower;
            const projectedParticipation = Math.min(currentParticipation / pctElapsed, 1);
            const projPct = (projectedParticipation * 100).toFixed(1);
            
            const supermajority = calcSupermajority(votePeriod);
            const projStatus = supermajority >= 80 ? 'PASSING' : 'AT RISK';
            const projClass = supermajority >= 80 ? 'proj-passing' : 'proj-risk';
            
            projectionHtml = `
                <div class="chamber-projection ${projClass}">
                    <span class="proj-label">\u26a1 Projected</span>
                    <span class="proj-value">${projStatus}</span>
                    <span class="proj-detail">${projPct}% participation by period end \u00b7 ${Math.round((1 - pctElapsed) * 100)}% time remaining</span>
                </div>
            `;
        }
    }
    
    // Render placeholder, then async-fill with time-ordered ballot data
    const periodIdx = votePeriod?.index;
    const startTime = votePeriod?.startTime;
    const endTime = votePeriod?.endTime;
    const quorumRequired = Number(votePeriod?.ballotsQuorum);
    const quorumY = Number.isFinite(quorumRequired)
        ? Math.max(0, Math.min(60, 60 - (quorumRequired * 0.6)))
        : null;
    
    // Schedule async ballot fetch after render
    if (periodIdx) {
        setTimeout(() => fillMomentumTimeline(periodIdx, totalPower, startTime, endTime), 100);
    }
    
    return `
        <div class="chamber-momentum chamber-anim-fade" style="animation-delay:500ms">
            <div class="momentum-title">Vote Momentum</div>
            <div class="momentum-subtitle">${voted.length} of ${total} bakers \u00b7 ${(cumPower / totalPower * 100).toFixed(1)}% of stake</div>
            <div id="momentum-chart-container" style="position:relative;min-height:80px">
                <div class="momentum-loading" id="momentum-loading">Loading timeline\u2026</div>
                <svg viewBox="-30 -8 335 80" class="momentum-svg" id="momentum-svg" preserveAspectRatio="none" style="display:none">
                    <defs>
                        <linearGradient id="momentumGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--accent-cyan)"/><stop offset="100%" stop-color="transparent"/></linearGradient>
                    </defs>
                    <text x="-4" y="4" fill="var(--text-tertiary, #555)" font-size="7" text-anchor="end" font-family="JetBrains Mono, monospace">100%</text>
                    <text x="-4" y="32" fill="var(--text-tertiary, #555)" font-size="7" text-anchor="end" font-family="JetBrains Mono, monospace">50%</text>
                    <text x="-4" y="62" fill="var(--text-tertiary, #555)" font-size="7" text-anchor="end" font-family="JetBrains Mono, monospace">0%</text>
                    <text x="0" y="72" fill="var(--text-tertiary, #555)" font-size="7" font-family="JetBrains Mono, monospace" id="momentum-x-start"></text>
                    <text x="300" y="72" fill="var(--text-tertiary, #555)" font-size="7" text-anchor="end" font-family="JetBrains Mono, monospace" id="momentum-x-end"></text>
                    <line x1="0" y1="30" x2="300" y2="30" stroke="rgba(255,255,255,0.04)" stroke-width="0.5"/>
                    ${quorumY !== null ? `<line class="momentum-quorum-line" x1="0" y1="${quorumY.toFixed(2)}" x2="300" y2="${quorumY.toFixed(2)}"/><text x="300" y="${Math.max(8, quorumY - 3).toFixed(2)}" fill="var(--chamber-watch-color, #f5b84b)" font-size="7" text-anchor="end" font-family="JetBrains Mono, monospace">quorum ${quorumRequired.toFixed(1)}%</text>` : ''}
                    <path id="momentum-area" fill="url(#momentumGrad)" opacity="0.3"/>
                    <path id="momentum-line" fill="none" stroke="var(--accent-cyan)" stroke-width="2"/>
                </svg>
            </div>
            ${projectionHtml}
        </div>
    `;
}

async function fillMomentumTimeline(periodIndex, totalPower, startTime, endTime) {
    const loading = document.getElementById('momentum-loading');
    const svg = document.getElementById('momentum-svg');
    if (!svg) return;
    
    try {
        const ballots = await fetchBallotTimeline(periodIndex);
        if (!ballots.length) {
            if (loading) loading.textContent = 'No ballot data';
            return;
        }
        
        const start = new Date(startTime).getTime();
        const end = new Date(endTime).getTime();
        const duration = end - start;
        
        // Build cumulative power over time
        let cumPower = 0;
        const timePoints = [{ t: 0, pct: 0 }]; // start at 0
        
        for (const b of ballots) {
            cumPower += b.votingPower;
            const t = (new Date(b.timestamp).getTime() - start) / duration;
            timePoints.push({ t: Math.min(t, 1), pct: cumPower / totalPower * 100 });
        }
        
        // Downsample to ~100 points for smooth rendering
        const maxPoints = 100;
        let sampled = timePoints;
        if (timePoints.length > maxPoints) {
            const step = Math.floor(timePoints.length / maxPoints);
            sampled = [];
            for (let i = 0; i < timePoints.length; i += step) {
                sampled.push(timePoints[i]);
            }
            // Always include the last point
            if (sampled[sampled.length - 1] !== timePoints[timePoints.length - 1]) {
                sampled.push(timePoints[timePoints.length - 1]);
            }
        }
        
        const w = 300, h = 60;
        const pathD = sampled.map((p, i) => {
            const x = (p.t * w).toFixed(1);
            const y = (h - p.pct / 100 * h).toFixed(1);
            return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
        }).join(' ');
        
        const lastPt = sampled[sampled.length - 1];
        const areaD = pathD + ` L ${(lastPt.t * w).toFixed(1)} ${h} L 0 ${h} Z`;
        
        // Calculate path length for draw animation
        let pathLen = 0;
        for (let i = 1; i < sampled.length; i++) {
            const dx = (sampled[i].t - sampled[i-1].t) * w;
            const dy = (sampled[i].pct - sampled[i-1].pct) / 100 * h;
            pathLen += Math.sqrt(dx * dx + dy * dy);
        }
        
        // Set X axis labels
        const startDate = new Date(startTime);
        const endDate = new Date(endTime);
        const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        
        document.getElementById('momentum-x-start').textContent = fmt(startDate);
        document.getElementById('momentum-x-end').textContent = fmt(endDate);
        
        // Set paths
        document.getElementById('momentum-area').setAttribute('d', areaD);
        const line = document.getElementById('momentum-line');
        line.setAttribute('d', pathD);
        line.style.strokeDasharray = pathLen.toFixed(0);
        line.style.strokeDashoffset = pathLen.toFixed(0);
        
        // Show SVG, hide loading
        if (loading) loading.style.display = 'none';
        svg.style.display = '';
        
        // Trigger draw animation
        requestAnimationFrame(() => {
            line.style.transition = 'stroke-dashoffset 1.5s cubic-bezier(0.16, 1, 0.3, 1)';
            line.style.strokeDashoffset = '0';
        });
        
    } catch (err) {
        console.error('Momentum timeline fetch failed:', err);
        if (loading) loading.textContent = 'Timeline unavailable';
    }
}

// ─── My Baker ───

function renderMyBakerVote(voters, votePeriod) {
    const myBaker = localStorage.getItem('tezos-systems-my-baker-address');
    if (!myBaker || !voters?.length) {
        return `<div class="chamber-my-baker chamber-anim-fade" style="animation-delay:500ms"><div class="my-baker-prompt"><a href="/#my-baker" class="set-baker-link">Set your baker</a> to track their vote</div></div>`;
    }
    const baker = voters.find(v => v.delegate.address === myBaker);
    if (!baker) return `<div class="chamber-my-baker chamber-anim-fade" style="animation-delay:500ms"><div class="my-baker-status">Baker not in voter list</div></div>`;
    
    const voted = baker.status !== 'none';
    const voteType = baker.status.replace('voted_', '').toUpperCase();
    const activeBallot = votePeriod?.status === 'active';
    const missingVoteText = activeBallot ? '⚠️ NOT YET VOTED' : 'DID NOT VOTE';
    return `
        <div class="chamber-my-baker ${voted ? 'voted' : 'not-voted'} chamber-anim-fade" style="animation-delay:500ms">
            <div class="my-baker-name">${escapeHtml(baker.delegate.alias || baker.delegate.address.slice(0, 12) + '…')}</div>
            <div class="my-baker-badge ${voted ? 'voted' : 'alert'}">${voted ? `✅ Voted ${voteType}` : missingVoteText}</div>
            <div class="my-baker-power">${fmtPower(baker.votingPower)} ꜩ</div>
            ${!voted && activeBallot ? '<div class="my-baker-cta">Your baker votes on your behalf — your delegated stake carries their decision</div>' : ''}
        </div>
    `;
}

// ─── Top voters table ───

function renderTopVoters(voters) {
    if (!voters?.length) return '';
    const top20 = [...voters].sort((a, b) => b.votingPower - a.votingPower).slice(0, 20);
    
    function buildRows(list) {
        return list.map((v, i) => {
            let icon = '⬜', cls = 'none';
            if (v.status === 'voted_yay') { icon = '🟢'; cls = 'yay'; }
            else if (v.status === 'voted_nay') { icon = '🔴'; cls = 'nay'; }
            else if (v.status === 'voted_pass') { icon = '🟡'; cls = 'pass'; }
            const name = escapeHtml(v.delegate.alias || v.delegate.address.slice(0, 12) + '…');
            return `<div class="voter-row"><span class="voter-rank">${i + 1}</span><span class="voter-name" title="${escapeHtml(v.delegate.address)}">${name}</span><span class="voter-power">${fmtPower(v.votingPower)}</span><span class="voter-vote ${cls}">${icon}</span></div>`;
        }).join('');
    }
    
    const filters = `
        <div class="voters-filters">
            <button class="voter-filter-btn active" data-filter="all">All</button>
            <button class="voter-filter-btn" data-filter="voted_yay">🟢 Yay</button>
            <button class="voter-filter-btn" data-filter="voted_nay">🔴 Nay</button>
            <button class="voter-filter-btn" data-filter="voted_pass">🟡 Pass</button>
            <button class="voter-filter-btn" data-filter="none">⬜ Not voted</button>
        </div>
    `;
    
    const html = `<div class="chamber-voters chamber-anim-fade" style="animation-delay:600ms">
        <div class="voters-title">Top 20 Bakers by Stake</div>
        <div class="chamber-tooltip-hint" style="margin-bottom:8px">All voting data is public on-chain. Baker identities are pseudonymous blockchain addresses.</div>
        ${filters}
        <div class="voters-list" id="chamber-voters-list">${buildRows(top20)}</div>
    </div>`;
    
    window._chamberVoters = voters;
    return html;
}

function initVoterFilters() {
    const container = document.querySelector('.chamber-voters');
    if (!container || !window._chamberVoters) return;
    
    container.querySelectorAll('.voter-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            container.querySelectorAll('.voter-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const filter = btn.dataset.filter;
            const voters = window._chamberVoters;
            let filtered = [...voters].sort((a, b) => b.votingPower - a.votingPower);
            
            if (filter !== 'all') {
                filtered = filtered.filter(v => v.status === filter);
            }
            
            const top = filtered.slice(0, 20);
            const list = document.getElementById('chamber-voters-list');
            if (list) {
                list.innerHTML = top.map((v, i) => {
                    let icon = '⬜', cls = 'none';
                    if (v.status === 'voted_yay') { icon = '🟢'; cls = 'yay'; }
                    else if (v.status === 'voted_nay') { icon = '🔴'; cls = 'nay'; }
                    else if (v.status === 'voted_pass') { icon = '🟡'; cls = 'pass'; }
                    const name = escapeHtml(v.delegate.alias || v.delegate.address.slice(0, 12) + '…');
                    return `<div class="voter-row"><span class="voter-rank">${i + 1}</span><span class="voter-name" title="${escapeHtml(v.delegate.address)}">${name}</span><span class="voter-power">${fmtPower(v.votingPower)}</span><span class="voter-vote ${cls}">${icon}</span></div>`;
                }).join('');
            }
        });
    });
}

// ─── Current stage chronological vote order ───

function ballotVoteMeta(ballot) {
    const vote = String(ballot?.vote || ballot?.status || '').replace(/^voted_/, '').toLowerCase();
    if (vote === 'yay') return { cls: 'yay', icon: '🟢', label: 'Yay' };
    if (vote === 'nay') return { cls: 'nay', icon: '🔴', label: 'Nay' };
    if (vote === 'pass') return { cls: 'pass', icon: '🟡', label: 'Pass' };
    return { cls: 'unknown', icon: '⬜', label: 'Unknown' };
}

function ballotDelegateName(ballot) {
    const address = ballot?.delegate?.address || ballot?.sender?.address || '';
    return ballot?.delegate?.alias
        || ballot?.sender?.alias
        || (address ? `${address.slice(0, 10)}…` : 'Unknown baker');
}

function renderCurrentStageVoteOrder(data) {
    if (!data?.votePeriod || !isBallotPeriod(data.votePeriod)) return '';
    const stageName = votePeriodTitle(data.votePeriod);
    const title = data.isLiveVote ? `Current ${stageName} Vote Order` : `${stageName} Vote Order`;

    return `
        <section class="chamber-current-vote-order chamber-anim-fade" id="chamber-current-vote-order" aria-label="${escapeHtml(stageName)} ballot order" style="animation-delay:640ms">
            <div class="current-vote-header">
                <div>
                    <div class="current-vote-title">${escapeHtml(title)}</div>
                    <div class="current-vote-context">Loading on-chain ballot order...</div>
                </div>
                <div class="current-vote-count"></div>
            </div>
            <div class="current-vote-list" role="list"></div>
        </section>
    `;
}

function renderCurrentStageVoteRow(ballot, index) {
    const vote = ballotVoteMeta(ballot);
    const address = ballot?.delegate?.address || ballot?.sender?.address || '';
    const bakerName = ballotDelegateName(ballot);
    const timeText = fmtBallotTime(ballot?.timestamp);
    const timeMs = validDate(ballot?.timestamp)?.getTime() || 0;
    const power = Number(ballot?.votingPower) || 0;
    const rowNumber = String(index + 1).padStart(2, '0');
    const title = `${timeText} UTC: ${bakerName} voted ${vote.label} with ${fmtPower(power)} ꜩ`;

    return `
        <div class="current-vote-row current-vote-${vote.cls}" role="listitem" data-ballot-time="${escapeHtml(String(timeMs))}" data-ballot-id="${escapeHtml(String(ballot?.id || ''))}" title="${escapeHtml(title)}">
            <span class="current-vote-rank">${rowNumber}</span>
            <span class="current-vote-time">${escapeHtml(timeText)} UTC</span>
            <span class="current-vote-baker" title="${escapeHtml(address)}">${escapeHtml(bakerName)}</span>
            <span class="current-vote-choice">${vote.icon} ${escapeHtml(vote.label)}</span>
            <span class="current-vote-power">${fmtPower(power)} ꜩ</span>
        </div>
    `;
}

async function hydrateCurrentStageVoteOrder(data) {
    const container = document.getElementById('chamber-current-vote-order');
    if (!container || !data?.votePeriod) return;

    const context = container.querySelector('.current-vote-context');
    const count = container.querySelector('.current-vote-count');
    const list = container.querySelector('.current-vote-list');
    const stageName = votePeriodTitle(data.votePeriod);
    const stageScope = data.isLiveVote ? `Current ${stageName} stage` : `Displayed ${stageName} result`;

    try {
        const ballots = await fetchBallotTimeline(data.votePeriod.index);
        if (!ballots.length) {
            context.textContent = `No ${stageName.toLowerCase()} ballots found for this stage yet.`;
            if (count) count.textContent = '';
            if (list) list.innerHTML = '';
            return;
        }

        context.textContent = `${stageScope}, earliest on-chain ballots first`;
        if (count) count.textContent = `${ballots.length} ballot${ballots.length === 1 ? '' : 's'}`;
        if (list) list.innerHTML = ballots.map((ballot, index) => renderCurrentStageVoteRow(ballot, index)).join('');
    } catch (err) {
        console.warn('Chamber: current stage vote order failed', err);
        context.textContent = 'Current-stage ballot order is unavailable right now.';
        if (count) count.textContent = '';
        if (list) list.innerHTML = '';
    }
}

// ─── Historical comparison ───

function isFailedVote(vote) {
    return ['no_quorum', 'no_supermajority'].includes(vote?.status);
}

function voteKey(vote) {
    return `${vote.epoch}:${vote.period}:${vote.kind}`;
}

function currentVoteKey(data) {
    if (!data?.votePeriod) return null;
    return `${data.epoch.index}:${data.votePeriod.index}:${data.votePeriod.kind}`;
}

function statusLabel(status) {
    const labels = {
        success: 'passed',
        active: 'active',
        no_quorum: 'failed quorum',
        no_supermajority: 'failed supermajority',
        no_proposals: 'no proposal',
        failed: 'failed',
        rejected: 'rejected'
    };
    return labels[status] || status || 'unknown';
}

function kindLabel(kind) {
    return kind === 'promotion' ? 'Promotion' : 'Exploration';
}

function voteDisplayName(vote, protocols = []) {
    const protocol = vote.proposalHash ? protocolFromHash(vote.proposalHash, protocols) : null;
    return protocol?.name
        || vote.protocolName
        || vote.displayName
        || vote.proposalAlias
        || (vote.proposalHash ? `${vote.proposalHash.slice(0, 8)}...` : `Epoch ${vote.epoch}`);
}

function pctText(value) {
    return Number.isFinite(value) ? `${value.toFixed(0)}%` : 'n/a';
}

function precisePctText(value) {
    return Number.isFinite(value) ? `${value.toFixed(1)}%` : 'n/a';
}

function bakerDisplay(voter) {
    const address = voter?.delegate?.address || '';
    return voter?.delegate?.alias || (address ? `${address.slice(0, 8)}...${address.slice(-5)}` : 'Unknown');
}

function voteStatusLabel(status) {
    if (status === 'voted_yay') return 'Yay';
    if (status === 'voted_nay') return 'Nay';
    if (status === 'voted_pass') return 'Pass';
    if (status === 'none') return 'Not voted';
    return status || 'Unknown';
}

function findPeriod(epoch, kind) {
    return (epoch?.periods || []).find((period) => period.kind === kind) || null;
}

function proposalDisplayName(data) {
    return data?.proposal?.hash ? extractProtoName(data.proposal.hash, data.protocols || []) : 'Current proposal';
}

function activeProtocolLore(data) {
    if (!data?.proposal?.hash) return null;
    return protocolFromHash(data.proposal.hash, data.protocols || []);
}

function governanceResolutionLine(data) {
    const period = data.currentPeriod || data.votePeriod;
    if (!period) return 'Resolution timing unavailable';
    const end = fmtUtcDateTime(period.endTime);
    if (data.currentPeriod?.kind === 'adoption' && end) {
        return `${proposalDisplayName(data)} activates around ${end} UTC`;
    }
    if (data.currentPeriod?.kind === 'testing') {
        const promotion = findPeriod(data.epoch, 'promotion');
        const adoption = findPeriod(data.epoch, 'adoption');
        const promotionStart = fmtUtcDateTime(promotion?.startTime);
        const activation = fmtUtcDateTime(adoption?.endTime || adoption?.startTime);
        if (promotionStart && activation) return `Promotion starts around ${promotionStart} UTC; activation window around ${activation} UTC if it passes`;
        if (period.endTime) return `Cooldown ends around ${end} UTC before the final vote`;
    }
    if (data.isLiveVote && end) return `${votePeriodTitle(data.votePeriod)} closes around ${end} UTC`;
    if (end) return `${periodTitle(period.kind)} window ends around ${end} UTC`;
    return 'Resolution timing unavailable';
}

function renderProposalIntel(data) {
    const protocol = activeProtocolLore(data);
    const changes = Array.isArray(protocol?.changes) ? protocol.changes.slice(0, 3) : [];
    const proposalPeriod = findPeriod(data.epoch, 'proposal');
    const proposals = Array.isArray(data.epoch?.proposals) ? data.epoch.proposals : [];
    const rivals = Math.max(0, proposals.length - 1);
    const upvotes = data.proposal?.upvotes ? `${formatCount(data.proposal.upvotes)} upvotes` : 'upvote stake unavailable';
    const context = changes.length
        ? changes.map((change) => `<li>${escapeHtml(change)}</li>`).join('')
        : `<li>${escapeHtml(protocol?.headline || data.report?.currentGovernance?.proposalName || 'Curated protocol bullets are pending while this proposal is live.')}</li>`;
    const agoraHref = data.report?.currentGovernance?.proposalHash
        ? `https://www.tezosagora.org/search?q=${encodeURIComponent(data.report.currentGovernance.proposalHash)}`
        : 'https://www.tezosagora.org';

    return `
        <section class="chamber-intel-panel chamber-anim-fade" id="chamber-proposal-intel" style="animation-delay:120ms">
            <div class="chamber-intel-title">Proposal Intel</div>
            <div class="chamber-intel-lede">${escapeHtml(governanceResolutionLine(data))}</div>
            <div class="chamber-intel-grid">
                <div><span>Proposal race</span><strong>${escapeHtml(proposalDisplayName(data))}${rivals ? ` · ${rivals} rival${rivals === 1 ? '' : 's'}` : ''}</strong><small>${escapeHtml(upvotes)}${proposalPeriod?.endTime ? ` · proposal period ended ${escapeHtml(fmtUtcDateTime(proposalPeriod.endTime))} UTC` : ''}</small></div>
                <div><span>Context</span><ul>${context}</ul></div>
            </div>
            <a class="chamber-intel-link" href="${escapeHtml(agoraHref)}" target="_blank" rel="noopener">Agora research →</a>
        </section>
    `;
}

function summarizeStageDelta(data) {
    const current = Array.isArray(data.voters) ? data.voters : [];
    const previous = Array.isArray(data.previousVoters) ? data.previousVoters : [];
    if (!current.length || !previous.length) return null;
    const currentByAddress = new Map(current.map((voter) => [voter.delegate?.address, voter]));
    const previousVoted = previous.filter((voter) => voter.status !== 'none');
    const dropouts = previousVoted.filter((voter) => currentByAddress.get(voter.delegate?.address)?.status === 'none');
    const switchers = previousVoted.filter((voter) => {
        const next = currentByAddress.get(voter.delegate?.address);
        return next && next.status !== 'none' && next.status !== voter.status;
    });
    const dropoutPower = dropouts.reduce((sum, voter) => sum + Number(voter.votingPower || 0), 0);
    return { dropouts, switchers, dropoutPower };
}

function renderGovernanceGapAnalysis(data) {
    const voters = Array.isArray(data.voters) ? data.voters : [];
    const period = data.votePeriod;
    if (!period || !voters.length) return '';
    const totalPower = Number(period.totalVotingPower) || voters.reduce((sum, voter) => sum + Number(voter.votingPower || 0), 0);
    const votedPower = voters.filter((voter) => voter.status !== 'none').reduce((sum, voter) => sum + Number(voter.votingPower || 0), 0);
    const quorumRequired = Number(period.ballotsQuorum || 0);
    const requiredPower = totalPower * (quorumRequired / 100);
    const quorumGap = Math.max(0, requiredPower - votedPower);
    const nonVoters = voters.filter((voter) => voter.status === 'none').sort((a, b) => b.votingPower - a.votingPower);
    const topNonVoters = nonVoters.slice(0, 5);
    const yayVoters = voters.filter((voter) => voter.status === 'voted_yay').sort((a, b) => b.votingPower - a.votingPower);
    const yayPower = yayVoters.reduce((sum, voter) => sum + Number(voter.votingPower || 0), 0);
    const topFiveYayPower = yayVoters.slice(0, 5).reduce((sum, voter) => sum + Number(voter.votingPower || 0), 0);
    const concentration = yayPower > 0 ? (topFiveYayPower / yayPower) * 100 : null;
    const stageDelta = summarizeStageDelta(data);
    const rows = topNonVoters.length
        ? topNonVoters.map((voter) => `
            <div class="chamber-gap-row">
                <span>${escapeHtml(bakerDisplay(voter))}</span>
                <strong>${fmtPower(voter.votingPower)} ꜩ</strong>
            </div>
        `).join('')
        : '<div class="lb-empty-inline">No top non-voters in the displayed voter set.</div>';
    const switcherCopy = stageDelta
        ? `${stageDelta.dropouts.length} dropout${stageDelta.dropouts.length === 1 ? '' : 's'} from Exploration · ${stageDelta.switchers.length} switcher${stageDelta.switchers.length === 1 ? '' : 's'}`
        : 'Stage dropout comparison appears during Promotion';
    const switcherRows = stageDelta?.switchers?.length
        ? stageDelta.switchers.slice(0, 3).map((voter) => {
            const next = voters.find((item) => item.delegate?.address === voter.delegate?.address);
            return `<span>${escapeHtml(bakerDisplay(voter))}: ${escapeHtml(voteStatusLabel(voter.status))} → ${escapeHtml(voteStatusLabel(next?.status))}</span>`;
        }).join('')
        : '';

    return `
        <section class="chamber-gap-panel chamber-anim-fade" id="chamber-gap-analysis" style="animation-delay:660ms">
            <div class="chamber-intel-title">Gap Analysis</div>
            <div class="chamber-intel-grid">
                <div><span>Quorum gap</span><strong>${quorumGap > 0 ? `${fmtPower(quorumGap)} ꜩ` : 'Closed'}</strong><small>${precisePctText((votedPower / totalPower) * 100)} turnout / ${precisePctText(quorumRequired)} required</small></div>
                <div><span>Top 5 Yay concentration</span><strong>${Number.isFinite(concentration) ? precisePctText(concentration) : 'n/a'}</strong><small>${fmtPower(topFiveYayPower)} ꜩ of Yay power</small></div>
                <div><span>Stage movement</span><strong>${escapeHtml(switcherCopy)}</strong><small>${stageDelta ? `${fmtPower(stageDelta.dropoutPower)} ꜩ missing from prior-stage voters` : 'Promotion-only comparison'}</small>${switcherRows ? `<div class="chamber-switcher-list">${switcherRows}</div>` : ''}</div>
            </div>
            <div class="chamber-gap-list">
                <div class="chamber-gap-heading">Largest non-voters</div>
                ${rows}
            </div>
        </section>
    `;
}

function voteTone(vote) {
    if (vote.status === 'active') return 'active';
    if (isFailedVote(vote)) return 'failed';
    if (vote.status === 'success') return 'passed';
    return 'neutral';
}

function voteFillStyle(vote) {
    if (vote.status === 'active') return 'background:linear-gradient(90deg, var(--accent-cyan), var(--accent-purple));';
    if (isFailedVote(vote)) return 'background:linear-gradient(90deg, rgba(255, 80, 110, 0.85), rgba(255, 145, 70, 0.7));';
    return 'background:rgba(255,255,255,0.18);';
}

function chooseHistoricalVotes(data, history) {
    const votes = Array.isArray(history?.periodVotes) ? history.periodVotes : [];
    const ordered = votes
        .filter(v => ['exploration', 'promotion'].includes(v.kind))
        .filter(v => v.yayPct !== null || v.status === 'active' || isFailedVote(v))
        .sort((a, b) => (b.epoch - a.epoch) || (b.period - a.period));

    const currentKey = currentVoteKey(data);
    const selected = new Map();

    for (const vote of ordered.filter(isFailedVote)) {
        selected.set(voteKey(vote), vote);
    }

    for (const vote of ordered) {
        if (voteKey(vote) === currentKey) continue;
        if (selected.size >= HISTORY_CONTEXT_ROWS && !isFailedVote(vote)) continue;
        selected.set(voteKey(vote), vote);
        if (selected.size >= HISTORY_CONTEXT_ROWS) break;
    }

    if (selected.size < HISTORY_CONTEXT_ROWS) {
        for (const vote of ordered) {
            if (voteKey(vote) === currentKey) continue;
            selected.set(voteKey(vote), vote);
            if (selected.size >= HISTORY_CONTEXT_ROWS) break;
        }
    }

    return [...selected.values()]
        .sort((a, b) => (b.epoch - a.epoch) || (b.period - a.period));
}

function compareVotesChronologically(a, b) {
    const epochDelta = (a.epoch || 0) - (b.epoch || 0);
    if (epochDelta) return epochDelta;
    const periodDelta = (a.period || 0) - (b.period || 0);
    if (periodDelta) return periodDelta;
    const aStart = validDate(a.startTime)?.getTime() || 0;
    const bStart = validDate(b.startTime)?.getTime() || 0;
    return aStart - bStart;
}

function chronologicalVotes(history) {
    const votes = Array.isArray(history?.periodVotes) ? history.periodVotes : [];
    return votes
        .filter(vote => ['exploration', 'promotion'].includes(vote.kind))
        .sort(compareVotesChronologically);
}

function renderVoteHistoryRow(vote, protocols) {
    const tone = voteTone(vote);
    const name = voteDisplayName(vote, protocols);
    const yay = typeof vote.yayPct === 'number' ? vote.yayPct : Number.NaN;
    const status = statusLabel(vote.status);
    const participation = typeof vote.participationPct === 'number' ? vote.participationPct : Number.NaN;
    const width = Number.isFinite(participation) ? Math.max(0, Math.min(100, participation)) : 0;
    const quorumRequirement = typeof vote.ballotsQuorum === 'number' ? vote.ballotsQuorum : Number.NaN;
    const quorum = precisePctText(participation);
    const required = precisePctText(quorumRequirement);
    const title = `Epoch ${vote.epoch} ${kindLabel(vote.kind)}: ${name} ${status}. Yay ${precisePctText(yay)}; participation ${quorum}; quorum ${required}.`;

    return `
        <div class="comparison-row vote-history-row vote-${tone}" title="${escapeHtml(title)}">
            <span class="comparison-name vote-history-name">E${escapeHtml(String(vote.epoch))} ${kindLabel(vote.kind)} ${escapeHtml(name)}</span>
            <div class="comparison-bar-track"><div class="comparison-bar-fill" style="width:${width}%;${voteFillStyle(vote)}"></div></div>
            <span class="comparison-pct vote-history-pct">${pctText(participation)}</span>
            <span class="vote-history-status">${escapeHtml(status)} · Yay ${pctText(yay)} · quorum ${quorum}/${required}</span>
        </div>
    `;
}

function renderChronologicalVoteLog() {
    return `
        <section class="chamber-vote-log chamber-anim-fade" id="chamber-vote-log" aria-label="Chronological governance vote log" style="animation-delay:760ms">
            <div class="vote-log-header">
                <div>
                    <div class="comparison-title">Chronological Vote Log</div>
                    <div class="vote-log-context">Loading local governance vote history...</div>
                </div>
                <div class="vote-log-count"></div>
            </div>
            <div class="vote-log-table" role="list"></div>
        </section>
    `;
}

function renderChronologicalVoteRow(vote, protocols, index) {
    const tone = voteTone(vote);
    const name = voteDisplayName(vote, protocols);
    const phase = kindLabel(vote.kind);
    const status = statusLabel(vote.status);
    const startDate = fmtShortDate(vote.startTime, true);
    const endDate = fmtShortDate(vote.endTime, true);
    const dateText = startDate && endDate ? `${startDate} - ${endDate}` : startDate || endDate || `Period ${vote.period}`;
    const yay = typeof vote.yayPct === 'number' ? vote.yayPct : Number.NaN;
    const participation = typeof vote.participationPct === 'number' ? vote.participationPct : Number.NaN;
    const rowNumber = String(index + 1).padStart(2, '0');
    const title = `Epoch ${vote.epoch}, period ${vote.period}: ${name} ${phase} ${status}. Yay ${precisePctText(yay)}; participation ${precisePctText(participation)}.`;

    return `
        <div class="vote-log-row vote-${tone}" role="listitem" data-vote-epoch="${escapeHtml(String(vote.epoch || ''))}" data-vote-period="${escapeHtml(String(vote.period || ''))}" data-vote-start="${escapeHtml(vote.startTime || '')}" title="${escapeHtml(title)}">
            <span class="vote-log-index">${rowNumber}</span>
            <span class="vote-log-date">${escapeHtml(dateText)}</span>
            <span class="vote-log-name">${escapeHtml(name)}</span>
            <span class="vote-log-meta">E${escapeHtml(String(vote.epoch || '?'))} P${escapeHtml(String(vote.period || '?'))} · ${phase} · ${escapeHtml(status)}</span>
            <span class="vote-log-metric">${pctText(yay)} Yay</span>
            <span class="vote-log-metric">${pctText(participation)} turnout</span>
        </div>
    `;
}

function renderHistoricalComparison(data) {
    if (!data.votePeriod) return '';
    
    const currentPct = calcSupermajority(data.votePeriod);
    if (currentPct === null) return '';
    
    const proposalName = data.proposal?.hash ? extractProtoName(data.proposal.hash, data.protocols || []) : `Epoch ${data.epoch.index}`;
    const currentName = data.isLiveVote ? proposalName : `${proposalName} ${votePeriodTitle(data.votePeriod)} result`;
    
    return `
        <div class="chamber-comparison chamber-anim-fade" id="chamber-historical-context" style="animation-delay:700ms">
            <div class="comparison-title">Historical Context</div>
            <div class="comparison-context">Loading local governance vote history…</div>
            <div class="comparison-current">
                <span class="comparison-name current">${currentName}</span>
                <div class="comparison-bar-track"><div class="comparison-bar-fill current" style="width:${currentPct}%"></div></div>
                <span class="comparison-pct current">${currentPct.toFixed(0)}%</span>
            </div>
            <div class="comparison-rows vote-history-list"></div>
        </div>
    `;
}

async function hydrateHistoricalComparison(data) {
    const container = document.getElementById('chamber-historical-context');
    if (!container) return;

    const currentPct = calcSupermajority(data.votePeriod);
    const proposalName = data.proposal?.hash ? extractProtoName(data.proposal.hash, data.protocols || []) : `Epoch ${data.epoch.index}`;
    const currentName = data.isLiveVote ? proposalName : `${proposalName} ${votePeriodTitle(data.votePeriod)} result`;
    const context = container.querySelector('.comparison-context');
    const rowsEl = container.querySelector('.comparison-rows');

    try {
        const [history, fallbackProtocols] = await Promise.all([
            loadGovernanceVotes(),
            loadProtocolHistory()
        ]);
        const protocols = Array.isArray(data.protocols) && data.protocols.length ? data.protocols : fallbackProtocols;
        const votes = chooseHistoricalVotes(data, history);
        if (!votes.length) {
            context.textContent = 'Local governance vote history is unavailable right now.';
            return;
        }

        const failedCount = votes.filter(isFailedVote).length;
        const totalFailures = history?.failedVoteCount ?? failedCount;
        const coveredPeriods = history?.periodVoteCount ?? votes.length;
        const coveredEpochs = history?.epochCount ?? 0;
        if (currentPct >= 99.9) {
            context.textContent = `${currentName}: ${currentPct.toFixed(1)}% — unanimous consensus. Local history covers ${coveredPeriods} exploration/promotion votes across ${coveredEpochs} epochs; all ${totalFailures} failed votes are included below.`;
        } else if (currentPct >= 95) {
            context.textContent = `${currentName}: ${currentPct.toFixed(1)}% — near-unanimous. This 20-row view includes every failed exploration/promotion vote plus recent passed or active periods.`;
        } else if (currentPct >= 80) {
            context.textContent = `${currentName}: ${currentPct.toFixed(1)}% — passing but contested. This 20-row view includes every failed exploration/promotion vote plus recent passed or active periods.`;
        } else {
            context.textContent = `${currentName}: ${currentPct.toFixed(1)}% — below supermajority threshold. This 20-row view includes every failed exploration/promotion vote plus recent passed or active periods.`;
        }

        rowsEl.innerHTML = votes.map(vote => renderVoteHistoryRow(vote, protocols)).join('');
    } catch (err) {
        console.warn('Chamber: historical context failed', err);
        context.textContent = 'Local governance vote history is unavailable right now.';
        if (rowsEl) rowsEl.innerHTML = '';
    }
}

async function hydrateChronologicalVoteLog(data) {
    const container = document.getElementById('chamber-vote-log');
    if (!container) return;

    const context = container.querySelector('.vote-log-context');
    const count = container.querySelector('.vote-log-count');
    const rowsEl = container.querySelector('.vote-log-table');

    try {
        const [history, fallbackProtocols] = await Promise.all([
            loadGovernanceVotes(),
            loadProtocolHistory()
        ]);
        const protocols = Array.isArray(data?.protocols) && data.protocols.length ? data.protocols : fallbackProtocols;
        const votes = chronologicalVotes(history);
        if (!votes.length) {
            context.textContent = 'Local governance vote history is unavailable right now.';
            if (count) count.textContent = '';
            if (rowsEl) rowsEl.innerHTML = '';
            return;
        }

        const first = votes[0];
        const last = votes[votes.length - 1];
        context.textContent = `${votes.length} exploration and promotion votes, oldest to newest`;
        if (count) count.textContent = `E${first.epoch} -> E${last.epoch}`;
        if (rowsEl) rowsEl.innerHTML = votes.map((vote, index) => renderChronologicalVoteRow(vote, protocols, index)).join('');
    } catch (err) {
        console.warn('Chamber: chronological vote log failed', err);
        context.textContent = 'Local governance vote history is unavailable right now.';
        if (count) count.textContent = '';
        if (rowsEl) rowsEl.innerHTML = '';
    }
}

// ─── Epoch navigation ───

function renderEpochNav(epochIndex, isLive) {
    const canPrev = epochIndex > _earliestEpochIndex;
    const canNext = _latestEpochIndex && epochIndex < _latestEpochIndex;
    
    return `
        <div class="chamber-epoch-nav">
            <button class="epoch-nav-btn ${canPrev ? '' : 'disabled'}" id="chamber-prev-epoch" ${canPrev ? '' : 'disabled'}>◀</button>
            <span class="epoch-nav-label">Epoch ${epochIndex}${isLive ? ' · ⚡ LIVE' : ''}</span>
            <button class="epoch-nav-btn ${canNext ? '' : 'disabled'}" id="chamber-next-epoch" ${canNext ? '' : 'disabled'}>▶</button>
        </div>
    `;
}

// ─── Proposal header ───

function renderProposalHeader(data) {
    const { epoch, proposal, isLive, isLiveVote, currentPeriod } = data;
    let proposalName = 'No Active Proposal', proposalHash = '', submitter = '', submitterPower = '';
    
    if (proposal) {
        proposalName = extractProtoName(proposal.hash, data.protocols || []);
        proposalHash = proposal.hash || '';
        submitter = proposal.initiator?.alias || (proposal.initiator?.address?.slice(0, 10) + '…') || '';
        if (proposal.upvotes) submitterPower = `${proposal.upvotes} upvotes`;
    }
    
    let badge = '<span class="chamber-badge historical">📁 HISTORICAL</span>';
    if (isLiveVote) {
        badge = '<span class="chamber-badge live">⚡ LIVE VOTE</span>';
    } else if (isLive && currentPeriod) {
        const tone = currentPeriod.kind === 'testing' ? 'cooldown' : currentPeriod.kind === 'adoption' ? 'adoption' : 'current';
        badge = `<span class="chamber-badge ${tone}">${escapeHtml(periodTitle(currentPeriod.kind))}</span>`;
    }
    
    const systemState = isLiveVote
        ? `Live ${periodTitle(currentPeriod?.kind)} vote`
        : isLive && currentPeriod
            ? `${periodTitle(currentPeriod.kind)} period`
            : 'Historical record';

    return `
        <div class="chamber-header chamber-anim-fade">
            <div class="lb-system-strip chamber-system-strip">
                <span class="lb-system-brand">Tezos.Systems</span>
                <span>Governance</span>
                <span>${escapeHtml(systemState)}</span>
            </div>
            <div class="chamber-title-row">
                <h2 class="chamber-title">The Chamber</h2>
                ${badge}
                ${isLiveVote ? '<button type="button" class="chamber-share-btn" id="chamber-share-vote">Share vote</button>' : ''}
            </div>
            <div class="chamber-proposal-info">
                <div class="proposal-name">${escapeHtml(proposalName)}</div>
                ${proposalHash ? `<div class="proposal-hash" title="${escapeHtml(proposalHash)}">${escapeHtml(proposalHash.slice(0, 24))}…</div>` : ''}
                ${submitter ? `<div class="proposal-submitter">by <strong>${escapeHtml(submitter)}</strong>${submitterPower ? ` · ${escapeHtml(submitterPower)}` : ''}</div>` : ''}
            </div>
            ${renderEpochNav(escapeHtml(String(epoch.index)), isLive)}
        </div>
    `;
}

// ─── Ambient war room effects ───

function initAmbientEffects(container) { return; // CSS-only via ::before/::after
    // Scanlines overlay (CSS-only, no canvas needed)
    let scanlines = container.querySelector('.chamber-scanlines');
    if (!scanlines) {
        scanlines = document.createElement('div');
        scanlines.className = 'chamber-scanlines';
        container.appendChild(scanlines);
    }
    
    // CSS particle dots via pseudo-elements + keyframes (no canvas)
    let particleLayer = container.querySelector('.chamber-particle-layer');
    if (!particleLayer) {
        particleLayer = document.createElement('div');
        particleLayer.className = 'chamber-particle-layer';
        container.appendChild(particleLayer);
    }
}

function stopAmbientEffects() {
    // CSS-only effects, nothing to stop
}

// ─── Post-render animation triggers ───

function triggerAnimations() {
    const gaugeArc = document.querySelector('.gauge-sweep');
    if (gaugeArc) {
        requestAnimationFrame(() => {
            gaugeArc.style.transition = 'stroke-dashoffset 1.2s cubic-bezier(0.16, 1, 0.3, 1)';
            gaugeArc.style.strokeDashoffset = '0';
        });
    }
    
    const gaugeVal = document.querySelector('.gauge-value[data-target]');
    if (gaugeVal) {
        const target = parseFloat(gaugeVal.dataset.target);
        const duration = 1200;
        const start = performance.now();
        function tick(now) {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            gaugeVal.textContent = (target * eased).toFixed(1) + '%';
            if (progress < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
    }
    
    const quorumFill = document.querySelector('.quorum-animate');
    if (quorumFill) {
        const targetWidth = quorumFill.dataset.targetWidth;
        requestAnimationFrame(() => {
            quorumFill.style.transition = 'width 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.5s';
            quorumFill.style.width = targetWidth;
        });
    }
    
    const momentumLine = document.querySelector('.momentum-line-anim');
    if (momentumLine) {
        requestAnimationFrame(() => {
            momentumLine.style.transition = 'stroke-dashoffset 1.5s cubic-bezier(0.16, 1, 0.3, 1) 0.6s';
            momentumLine.style.strokeDashoffset = '0';
        });
    }
}

// ─── Main render ───

function renderChamber(data, container) {
    const { epoch, votePeriod, voters, isLive, isLiveVote, currentPeriod } = data;
    const footerNote = !isLive
        ? 'Showing last completed cycle'
        : !isLiveVote && votePeriod
            ? `Current ${periodTitle(currentPeriod?.kind)} period; showing latest ${votePeriodTitle(votePeriod)} result`
            : '';
    const liveGridHtml = votePeriod ? `
        <div class="chamber-grid ${isLiveVote ? 'chamber-grid-live-first' : ''}">
            <div class="chamber-col-left">
                ${renderSupermajorityGauge(votePeriod, data)}
                ${renderQuorumBar(votePeriod, voters)}
                ${renderMyBakerVote(voters, votePeriod)}
            </div>
            <div class="chamber-col-right">
                ${renderBakerHeatmap(voters)}
                ${renderMomentumSparkline(voters, isLiveVote, votePeriod)}
            </div>
        </div>
        ${renderCurrentStageVoteOrder(data)}
        ${renderGovernanceGapAnalysis(data)}
        ${renderHistoricalComparison(data)}
        ${renderChronologicalVoteLog()}
        ${renderTopVoters(voters)}
    ` : `
        <div class="chamber-no-votes">
            <div class="no-votes-icon">🏛️</div>
            <div class="no-votes-text">No active vote in this epoch</div>
            <div class="no-votes-sub">The Chamber comes alive during Exploration and Promotion periods</div>
        </div>
        ${renderChronologicalVoteLog()}
    `;
    const processHtml = renderGovernanceProcess(epoch, { compact: isLiveVote });
    const pipelineHtml = `<div class="chamber-pipeline ${isLiveVote ? 'chamber-pipeline-compact' : ''}">${renderPipeline(epoch, isLive)}</div>`;

    container.innerHTML = `
        ${renderProposalHeader(data)}
        ${renderProposalIntel(data)}
        ${isLiveVote ? liveGridHtml + pipelineHtml + processHtml : processHtml + pipelineHtml + liveGridHtml}
        <div class="chamber-footer chamber-anim-fade" style="animation-delay:800ms">
            <a href="https://tzkt.io/governance" target="_blank" rel="noopener">TzKT Governance →</a>
            <span class="chamber-footer-sep">·</span>
            <a href="https://www.tezosagora.org" target="_blank" rel="noopener">Agora →</a>
            <span class="chamber-footer-sep">·</span>
            <a class="panel-direct-link" href="/#chamber" aria-label="Direct link to The Chamber">Direct: /#chamber</a>
            <span class="chamber-footer-sep">·</span>
            <span class="chamber-epoch">Epoch ${epoch.index}</span>
            ${footerNote ? `<span class="chamber-footer-sep">·</span><span class="chamber-historical-note">${escapeHtml(footerNote)}</span>` : ''}
        </div>
    `;
    
    const content = container.closest('.chamber-content');
    if (content) initAmbientEffects(content);
    
    hydrateCurrentStageVoteOrder(data);
    hydrateHistoricalComparison(data);
    hydrateChronologicalVoteLog(data);
    initChamberShare(data);
    requestAnimationFrame(() => requestAnimationFrame(triggerAnimations));
}

function initChamberShare(data) {
    const button = document.getElementById('chamber-share-vote');
    if (!button || button.dataset.chamberShareWired) return;
    button.dataset.chamberShareWired = '1';
    button.addEventListener('click', async (event) => {
        event.stopPropagation();
        const originalText = button.textContent;
        button.disabled = true;
        button.textContent = 'Capturing...';
        try {
            const target = document.querySelector('#chamber-modal .chamber-grid') || document.querySelector('#chamber-modal .chamber-body');
            if (!target) throw new Error('Share target unavailable');
            const { loadHtml2Canvas, showShareModal } = await import('../ui/share.js');
            await loadHtml2Canvas();
            const canvas = await window.html2canvas(target, {
                backgroundColor: '#0A0E1A',
                scale: window.innerWidth < 700 ? 1 : 2,
                useCORS: true,
                logging: false
            });
            const proposalName = data.proposal?.hash
                ? extractProtoName(data.proposal.hash, data.protocols || [])
                : 'Tezos governance';
            const stage = periodTitle(data.currentPeriod?.kind || data.votePeriod?.kind);
            showShareModal(canvas, [
                {
                    label: 'Governance',
                    text: `${proposalName} is in a live ${stage} vote on Tezos.\n\nTrack quorum, supermajority, and baker votes at tezos.systems/#chamber`
                }
            ], `The Chamber: ${proposalName}`);
        } catch (error) {
            console.warn('Chamber share failed', error);
            button.textContent = 'Share failed';
            setTimeout(() => {
                button.textContent = originalText;
                button.disabled = false;
            }, 1800);
            return;
        }
        button.textContent = originalText;
        button.disabled = false;
    });
}

// ─── Epoch navigation handlers ───

async function navigateEpoch(direction) {
    const newIndex = _currentEpochIndex + direction;
    if (newIndex < _earliestEpochIndex || (_latestEpochIndex && newIndex > _latestEpochIndex)) return;
    
    const body = document.querySelector('.chamber-body');
    if (!body) return;
    
    body.innerHTML = `<div class="chamber-loading"><div class="chamber-loading-text">Loading Epoch ${escapeHtml(String(newIndex))}…</div><div class="chamber-loading-bar"><div class="chamber-loading-fill"></div></div></div>`;
    
    const data = await fetchChamberData(newIndex);
    if (!data) {
        body.innerHTML = `<div class="chamber-error"><div class="error-icon">⚠️</div><div class="error-title">Epoch ${escapeHtml(String(newIndex))} not found</div><button class="chamber-retry-btn" data-chamber-nav="${-direction}">Go back</button></div>`;
        const retryBtn = body.querySelector('[data-chamber-nav]');
        if (retryBtn) retryBtn.addEventListener('click', () => navigateEpoch(Number(retryBtn.dataset.chamberNav)));
        return;
    }
    
    renderChamber(data, body);
    initVoterFilters();
    initEpochNavListeners();
}

function initEpochNavListeners() {
    const prev = document.getElementById('chamber-prev-epoch');
    const next = document.getElementById('chamber-next-epoch');
    if (prev) prev.addEventListener('click', () => navigateEpoch(-1));
    if (next) next.addEventListener('click', () => navigateEpoch(1));
    window._chamberNav = navigateEpoch;
}

// ─── Open / Close ───

function handleChamberEscape(e) {
    if (e.key === 'Escape') {
        const overlay = document.getElementById('chamber-modal');
        if (overlay && overlay.classList.contains('active')) closeChamber();
    }
}

export async function openChamber() {
    let overlay = document.getElementById('chamber-modal');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'chamber-modal';
        overlay.className = 'modal-overlay chamber-overlay';
        overlay.innerHTML = `
            <div class="modal-content modal-large chamber-content">
                <button class="modal-close chamber-close" aria-label="Close" style="z-index:3">&times;</button>
                <div class="chamber-body">
                    <div class="chamber-loading">
                        <div class="chamber-loading-text">Entering The Chamber…</div>
                        <div class="chamber-loading-bar"><div class="chamber-loading-fill"></div></div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        
        overlay.querySelector('.chamber-close').addEventListener('click', closeChamber);
        overlay.addEventListener('click', e => { if (e.target === overlay) closeChamber(); });
    }
    document.addEventListener('keydown', handleChamberEscape);
    
    overlay.classList.add('active');
    lockPageScrollForChamber();
    const content = overlay.querySelector('.chamber-content');
    if (content) content.scrollTop = 0;
    
    let data;
    try {
        data = await fetchChamberData();
    } catch (err) {
        console.error('Chamber fetch error:', err);
    }
    if (!data) {
        overlay.querySelector('.chamber-body').innerHTML = `
            <div class="chamber-error">
                <div class="error-icon">⚠️</div>
                <div class="error-title">Couldn't reach governance data</div>
                <div class="error-detail">TzKT API may be temporarily unavailable. Try again in a moment.</div>
                <button class="chamber-retry-btn" id="chamber-retry-open">Retry</button>
            </div>
        `;
        const retryBtn = overlay.querySelector('#chamber-retry-open');
        if (retryBtn) {
            retryBtn.addEventListener('click', () => {
                closeChamber();
                setTimeout(() => document.getElementById('chamber-entry-card')?.click(), 300);
            });
        }
        return;
    }
    
    renderChamber(data, overlay.querySelector('.chamber-body'));
    initVoterFilters();
    initEpochNavListeners();
    
    window._chamberShareVote = (bakerName, vote) => {
        const text = `My baker ${bakerName} voted ${vote} on the latest Tezos governance proposal 🗳️\n\nTrack live governance at tezos.systems`;
        const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
        window.open(url, '_blank', 'width=550,height=420');
    };
}

export function closeChamber() {
    stopAmbientEffects();
    document.removeEventListener('keydown', handleChamberEscape);
    const overlay = document.getElementById('chamber-modal');
    if (overlay) overlay.classList.remove('active');
    unlockPageScrollForChamber();
}

// ─── Entry card with live mini-status ───

export function initChamber() {
    const launcherBtn = document.getElementById('chamber-toggle');
    if (launcherBtn && !launcherBtn.dataset.chamberWired) {
        launcherBtn.dataset.chamberWired = '1';
        launcherBtn.addEventListener('click', openChamber);
    }

    const govSection = document.getElementById('governance-section');
    
    const header = govSection?.querySelector('.section-title');
    if (header) {
        header.style.cursor = 'pointer';
        header.title = 'Open The Chamber — Governance War Room';
        header.addEventListener('click', openChamber);
    }
    
    const grid = document.getElementById('chambers-grid') || govSection?.querySelector('.stats-grid');
    if (document.getElementById('chamber-entry-card')) {
        loadEntryCardStatus({ force: true });
        startEntryCardRefresh();
        return;
    }
    if (grid) {
        const card = document.createElement('div');
        card.id = 'chamber-entry-card';
        card.className = 'stat-card chamber-entry-card';
        card.innerHTML = `
            <button class="card-copy-link" type="button" data-copy-hash="#chamber" aria-label="Copy The Chamber direct link" title="Copy The Chamber link">🔗</button>
            <div class="card-inner">
                <div class="card-front chamber-entry-front">
                    <h2 class="stat-label">The Chamber</h2>
                    <div class="stat-value chamber-entry-icon" id="chamber-entry-hero">${CHAMBER_MARK_SVG}</div>
                    <p class="stat-description">Enter governance war room</p>
                    <div class="chamber-entry-status" id="chamber-entry-mini"></div>
                    <div class="chamber-entry-metrics" id="chamber-entry-metrics" hidden></div>
                </div>
            </div>
            <span class="chamber-expand-cue" title="Opens a full window" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4h5v5"/><path d="M9 20H4v-5"/><path d="M20 4l-7 7"/><path d="M4 20l7-7"/></svg></span>
        `;
        card.style.cursor = 'pointer';
        card.addEventListener('click', openChamber);
        grid.prepend(card);
        
        loadEntryCardStatus({ force: true });
        startEntryCardRefresh();
    }
}

function setEntryHero(heroEl, text = '') {
    if (!heroEl) return;
    const cleanText = String(text || '').trim();
    heroEl.classList.toggle('has-proposal-name', Boolean(cleanText));
    heroEl.innerHTML = cleanText
        ? `${CHAMBER_MARK_SVG}<span>${escapeHtml(cleanText)}</span>`
        : CHAMBER_MARK_SVG;
}

function formatEntryPct(value, decimals = 1) {
    if (!Number.isFinite(value)) return '--';
    return `${value.toFixed(decimals)}%`;
}

function formatEntryPower(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '--';
    return fmtPower(number);
}

function entryCountdown(endTime) {
    if (!endTime) return '--';
    return fmtCountdown(endTime);
}

function calcEntryParticipation(period) {
    const total = Number(period?.totalVotingPower);
    const yay = Number(period?.yayVotingPower) || 0;
    const nay = Number(period?.nayVotingPower) || 0;
    const pass = Number(period?.passVotingPower) || 0;
    if (!Number.isFinite(total) || total <= 0) return null;
    return ((yay + nay + pass) / total) * 100;
}

function calcEntryBallots(period) {
    const yay = Number(period?.yayBallots) || 0;
    const nay = Number(period?.nayBallots) || 0;
    const pass = Number(period?.passBallots) || 0;
    const directCount = Number(period?.ballotsCount);
    if (Number.isFinite(directCount) && directCount > 0) return directCount;
    return yay + nay + pass;
}

function setEntryMetrics(metricsEl, metrics) {
    if (!metricsEl) return;
    metricsEl.hidden = false;
    metricsEl.innerHTML = metrics.map((metric) => `
        <div class="chamber-entry-metric ${metric.className || ''}">
            <span>${escapeHtml(metric.label)}</span>
            <strong>${escapeHtml(metric.value)}</strong>
        </div>
    `).join('');
}

function clearEntryMetrics(card, metricsEl) {
    card?.classList.remove('chamber-entry-wide', 'chamber-entry-risk');
    if (card) card.dataset.chamberEntrySize = 'compact';
    if (!metricsEl) return;
    metricsEl.hidden = true;
    metricsEl.innerHTML = '';
}

async function resolveEntryProposalName(currentPeriod) {
    try {
        const [epochResult, protocolsResult, reportResult] = await Promise.allSettled([
            fetch(`${TZKT}/voting/epochs/current`).then((response) => response.ok ? response.json() : null),
            loadProtocolHistory(),
            loadGovernanceReport()
        ]);
        const epoch = epochResult.status === 'fulfilled' ? epochResult.value : null;
        const report = reportResult.status === 'fulfilled' ? reportResult.value : null;
        const protocols = protocolsResult.status === 'fulfilled'
            ? withActiveProposalName(protocolsResult.value, report)
            : [];
        const proposal = epoch?.proposals?.[0]
            || epoch?.proposal
            || currentPeriod?.proposal
            || currentPeriod?.proposalHash
            || report?.activeProposal
            || null;
        const hash = typeof proposal === 'string'
            ? proposal
            : proposal?.hash || proposal?.proposalHash || proposal?.payload || proposal?.protocolHash || '';
        const name = hash ? extractProtoName(hash, protocols) : '';
        return name && !/^Proto[A-Za-z0-9]/.test(name) ? name : name || 'Live Proposal';
    } catch {
        return 'Live Proposal';
    }
}

function startEntryCardRefresh() {
    const card = document.getElementById('chamber-entry-card');
    if (!card || _chamberEntryTimer) return;

    card.dataset.chamberLive = 'true';
    card.dataset.chamberRefreshInterval = String(CHAMBER_ENTRY_REFRESH_MS);
    _chamberEntryTimer = window.setInterval(() => {
        if (document.hidden) return;
        loadEntryCardStatus({ force: true });
    }, CHAMBER_ENTRY_REFRESH_MS);

    if (!_chamberEntryVisibilityWired) {
        _chamberEntryVisibilityWired = true;
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) loadEntryCardStatus({ force: true });
        });
    }
}

async function loadEntryCardStatus({ force = false } = {}) {
    if (_chamberEntryRefreshInFlight && !force) return;
    _chamberEntryRefreshInFlight = true;
    try {
        const mini = document.getElementById('chamber-entry-mini');
        if (!mini) return;
        const card = mini.closest('.chamber-entry-card');
        const metricsEl = document.getElementById('chamber-entry-metrics');
        const heroEl = document.getElementById('chamber-entry-hero');
        const description = card?.querySelector('.stat-description');
        
        const currentPeriod = await (await fetch(`${TZKT}/voting/periods/current`, { cache: force ? 'no-store' : 'default' })).json();
        if (card) {
            const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' });
            card.dataset.updatedLabel = `as of ${time} UTC`;
        }
        const isActive = currentPeriod.status === 'active' && currentPeriod.kind !== 'proposal';
        const isLiveVote = isActive && isBallotPeriod(currentPeriod);
        const stageName = periodTitle(currentPeriod.kind);
        const proposalName = isActive || currentPeriod.kind === 'proposal'
            ? await resolveEntryProposalName(currentPeriod)
            : '';
        
        if (isLiveVote) {
            const supermajority = calcSupermajority(currentPeriod);
            const participation = calcEntryParticipation(currentPeriod);
            const quorum = Number(currentPeriod.ballotsQuorum);
            const threshold = Number(currentPeriod.supermajority) || 80;
            const ballots = calcEntryBallots(currentPeriod);
            const quorumMet = Number.isFinite(participation) && Number.isFinite(quorum) && participation >= quorum;
            const yayMet = Number.isFinite(supermajority) && supermajority >= threshold;
            setEntryHero(heroEl, proposalName);
            if (description) description.textContent = `${stageName} ballot open`;
            mini.innerHTML = `<span class="entry-live-dot"></span> Live ${stageName} vote · refresh 60s`;
            mini.classList.add('live');
            card?.classList.add('chamber-entry-live', 'chamber-entry-wide');
            if (card) card.dataset.chamberEntrySize = 'wide';
            card?.classList.toggle('chamber-entry-risk', !quorumMet || !yayMet);
            setEntryMetrics(metricsEl, [
                { label: 'Time left', value: entryCountdown(currentPeriod.endTime) },
                {
                    label: quorumMet ? 'Quorum met' : 'Quorum gap',
                    value: quorumMet
                        ? `${formatEntryPct(participation)} / ${formatEntryPct(quorum)}`
                        : `${formatEntryPct(Math.max(0, quorum - (participation || 0)))} short`,
                    className: quorumMet ? 'is-good' : 'is-risk'
                },
                {
                    label: yayMet ? 'Yay met' : 'Yay threshold',
                    value: `${formatEntryPct(supermajority)} / ${formatEntryPct(threshold, 0)}`,
                    className: yayMet ? 'is-good' : 'is-risk'
                },
                {
                    label: 'Ballots',
                    value: ballots ? `${ballots.toLocaleString()} · ${formatEntryPower(currentPeriod.yayVotingPower)} Yay` : 'Open'
                }
            ]);
        } else if (isActive) {
            const detail = currentPeriod.kind === 'testing'
                ? 'testing and review'
                : currentPeriod.kind === 'adoption'
                    ? 'activation runway'
                    : 'no ballots open';
            setEntryHero(heroEl, proposalName || stageName);
            if (description) description.textContent = `${stageName} period`;
            mini.innerHTML = `${stageName} · ${detail}`;
            mini.classList.remove('live');
            card?.classList.remove('chamber-entry-live');
            clearEntryMetrics(card, metricsEl);
        } else {
            setEntryHero(heroEl, currentPeriod.kind === 'proposal' ? 'Proposal period' : '');
            if (description) description.textContent = currentPeriod.kind === 'proposal'
                ? 'Governance proposals window'
                : 'Governance watch';
            mini.innerHTML = currentPeriod.kind === 'proposal' ? 'Proposal period · no ballots open' : 'Governance idle';
            mini.classList.remove('live');
            card?.classList.remove('chamber-entry-live');
            clearEntryMetrics(card, metricsEl);
        }
    } catch {
        // Silent fail
    } finally {
        _chamberEntryRefreshInFlight = false;
    }
}
