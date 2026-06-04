/**
 * Governance / Upgrade Clock Module
 * Fetches protocol history and current voting status
 */

import { API_URLS } from '../core/config.js';

const TZKT_BASE = API_URLS.tzkt;
const PROTOCOL_DATA_URL = '/data/protocol-data.json';
const GOVERNANCE_REPORT_URL = '/data/governance-refresh-report.json';

// Cache for protocol list (avoid redundant fetches within a session)
let _protocolsCache = null;
let _protocolsCacheTime = 0;
const PROTOCOLS_CACHE_TTL = 300000; // 5 minutes
let _protocolLoreCache = null;
let _protocolLoreCacheTime = 0;
let _governanceReportCache = null;
let _governanceReportCacheTime = 0;

async function loadProtocolLore() {
    if (_protocolLoreCache && (Date.now() - _protocolLoreCacheTime) < PROTOCOLS_CACHE_TTL) {
        return _protocolLoreCache;
    }

    try {
        const response = await fetch(`${PROTOCOL_DATA_URL}?v=2`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        _protocolLoreCache = Array.isArray(data.protocols) ? data.protocols : [];
        _protocolLoreCacheTime = Date.now();
        return _protocolLoreCache;
    } catch (error) {
        console.warn('Failed to load protocol lore:', error);
        return _protocolLoreCache || [];
    }
}

async function loadGovernanceReport() {
    if (_governanceReportCache && (Date.now() - _governanceReportCacheTime) < PROTOCOLS_CACHE_TTL) {
        return _governanceReportCache;
    }

    try {
        const response = await fetch(`${GOVERNANCE_REPORT_URL}?v=1`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        _governanceReportCache = await response.json();
        _governanceReportCacheTime = Date.now();
        return _governanceReportCache;
    } catch (_) {
        return _governanceReportCache || null;
    }
}

function protocolHashMatches(hash, prefix) {
    if (!hash || !prefix) return false;
    return hash.startsWith(prefix) || hash.startsWith(prefix.slice(0, 8)) || prefix.startsWith(hash.slice(0, 8));
}

function findProtocolLore(protocol, lore) {
    return lore.find(p => p.name === protocol.name)
        || lore.find(p => protocolHashMatches(protocol.hash, p.hash))
        || null;
}

function formatProtocolDate(lore, protocol) {
    const raw = lore?.date || protocol.startTime;
    if (!raw) return '';
    const d = new Date(raw.includes('T') ? raw : `${raw}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/**
 * Build a fallback highlight for unknown protocols from TzKT data
 */
function buildFallbackHighlight(protocol) {
    let dateStr = '';
    if (protocol.startTime) {
        const d = new Date(protocol.startTime);
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        dateStr = ` • ${months[d.getMonth()]} ${d.getFullYear()}`;
    }
    return `Protocol upgrade #${protocol.code - 3}${dateStr}`;
}

function buildLoreHighlight(lore, protocol) {
    const dateStr = formatProtocolDate(lore, protocol);
    if (lore?.headline) return `${lore.headline}${dateStr ? ` • ${dateStr}` : ''}`;
    if (lore?.changes?.length) {
        const summary = lore.changes.slice(0, 2).join(' • ');
        return `${summary}${dateStr ? ` • ${dateStr}` : ''}`;
    }
    return buildFallbackHighlight(protocol);
}

function isReportCurrentProtocol(protocol, currentProtocol) {
    if (!currentProtocol) return !protocol.lastLevel;
    return protocol.code === currentProtocol.code
        || protocol.name === currentProtocol.name
        || protocolHashMatches(protocol.hash, currentProtocol.hash);
}

function normalizeProtocol(protocol, loreEntry, currentProtocol = null) {
    const code = protocol.code ?? protocol.number;
    const name = protocol.name || protocol.extras?.alias || `Protocol ${code}`;
    return {
        code,
        name,
        hash: protocol.hash,
        firstLevel: protocol.firstLevel ?? protocol.block ?? null,
        lastLevel: protocol.lastLevel ?? null,
        startTime: protocol.startTime || loreEntry?.date || protocol.date || null,
        date: loreEntry?.date || protocol.date || protocol.startTime || null,
        highlight: buildLoreHighlight(loreEntry, { ...protocol, code, name }),
        debate: loreEntry?.debate || null,
        contention: Boolean(loreEntry?.contention || loreEntry?.history),
        isCurrent: isReportCurrentProtocol({ ...protocol, code, name }, currentProtocol)
    };
}

async function buildStaticProtocolFallback(lore = null, report = null) {
    const [protocolLore, governanceReport] = await Promise.all([
        lore ? Promise.resolve(lore) : loadProtocolLore(),
        report ? Promise.resolve(report) : loadGovernanceReport()
    ]);
    const currentProtocol = governanceReport?.currentProtocol || null;
    const protocols = protocolLore.map((entry, index) => {
        const protocol = normalizeProtocol(entry, entry, currentProtocol);
        if (!currentProtocol) protocol.isCurrent = index === protocolLore.length - 1;
        return protocol;
    });

    if (protocols.length && currentProtocol && !protocols.some(p => p.isCurrent)) {
        protocols[protocols.length - 1].isCurrent = true;
    }

    if (!protocols.length && currentProtocol) {
        protocols.push(normalizeProtocol(currentProtocol, null, currentProtocol));
    }

    return protocols;
}

function chooseEpochProposal(period, epoch) {
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

function proposalDisplayName(proposal, report = null) {
    if (!proposal) return null;
    if (report?.currentGovernance?.proposalHash === proposal.hash && report.currentGovernance.proposalName) {
        return report.currentGovernance.proposalName;
    }
    return proposal.alias
        || proposal.extras?.alias
        || proposal.metadata?.alias
        || (proposal.hash ? `${proposal.hash.slice(0, 8)}...` : null);
}

function governancePeriodName(kind) {
    const names = {
        proposal: 'Proposal Period',
        exploration: 'Exploration Vote',
        testing: 'Cooldown Period',
        cooldown: 'Cooldown Period',
        promotion: 'Promotion Vote',
        adoption: 'Adoption Period'
    };
    return names[kind] || kind || 'Unknown';
}

async function fetchVotingEpoch(epochIndex) {
    if (epochIndex === undefined || epochIndex === null) return null;
    try {
        const response = await fetch(`${TZKT_BASE}/voting/epochs/${epochIndex}`);
        return response.ok ? response.json() : null;
    } catch (_) {
        return null;
    }
}

/**
 * Fetch all protocol upgrades
 */
export async function fetchProtocols() {
    if (_protocolsCache && (Date.now() - _protocolsCacheTime) < PROTOCOLS_CACHE_TTL) {
        return _protocolsCache;
    }
    try {
        const [response, lore, report] = await Promise.all([
            fetch(`${TZKT_BASE}/protocols?sort.asc=code`, { cache: 'no-store' }),
            loadProtocolLore(),
            loadGovernanceReport()
        ]);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const protocols = await response.json();
        if (!Array.isArray(protocols)) throw new Error('Unexpected protocols response');
        
        const namedProtocols = protocols.filter(p => 
            p.code >= 4 && p.extras?.alias
        );
        if (!namedProtocols.length) throw new Error('No named protocols in response');
        
        const result = namedProtocols.map(p => {
            const name = p.extras?.alias || `Protocol ${p.code}`;
            const loreEntry = findProtocolLore({ name, hash: p.hash }, lore);
            return normalizeProtocol({ ...p, name }, loreEntry, report?.currentProtocol || null);
        });

        _protocolsCache = result;
        _protocolsCacheTime = Date.now();
        return result;
    } catch (error) {
        console.error('Failed to fetch protocols:', error);
        const fallback = await buildStaticProtocolFallback();
        if (fallback.length) {
            console.warn('Using local protocol fallback');
            _protocolsCache = fallback;
            _protocolsCacheTime = Date.now();
            return fallback;
        }
        return _protocolsCache || [];
    }
}

function buildVotingStatusFromReport(report) {
    const gov = report?.currentGovernance;
    if (!gov) return null;
    const proposal = gov.proposalHash ? {
        hash: gov.proposalHash,
        alias: gov.proposalName,
        status: gov.proposalStatus
    } : null;

    return {
        kind: gov.kind,
        status: gov.status,
        startTime: gov.startTime,
        endTime: gov.endTime,
        participationPct: gov.tally?.participationPct ?? null,
        epoch: {
            index: gov.epoch,
            status: gov.epochStatus,
            proposal
        },
        proposal,
        proposalName: gov.proposalName || null,
        totalBakers: null,
        totalVotingPower: gov.votingPower || null,
        topVotingPower: gov.votingPower || null,
        proposalsCount: proposal ? 1 : 0,
        yayVotingPower: gov.tally?.yayVotingPower || 0,
        nayVotingPower: gov.tally?.nayVotingPower || 0,
        passVotingPower: gov.tally?.passVotingPower || 0,
        ballotsQuorum: gov.tally?.ballotsQuorum,
        supermajority: gov.tally?.supermajority
    };
}

/**
 * Fetch current voting period status
 */
export async function fetchVotingStatus() {
    try {
        const response = await fetch(`${TZKT_BASE}/voting/periods/current`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const period = await response.json();
        const [epoch, report] = await Promise.all([
            fetchVotingEpoch(period.epoch),
            loadGovernanceReport()
        ]);
        const proposal = chooseEpochProposal(period, epoch);

        // Canonical participation comes from the governance refresh report (computed
        // server-side on every commit). Only trust it when its proposal matches the
        // live one — otherwise let the caller fall back to a client-side estimate.
        const reportGov = report?.currentGovernance;
        const participationPct = (reportGov?.proposalHash && reportGov.proposalHash === proposal?.hash)
            ? (reportGov.tally?.participationPct ?? null)
            : null;

        return {
            kind: period.kind, // proposal, exploration, testing/cooldown, promotion, adoption
            status: period.status,
            startTime: period.startTime,
            endTime: period.endTime,
            participationPct,
            epoch: epoch ? {
                index: epoch.index,
                status: epoch.status,
                proposal
            } : period.epoch,
            proposal,
            proposalName: proposalDisplayName(proposal, report),
            totalBakers: period.totalBakers,
            totalVotingPower: period.totalVotingPower,
            topVotingPower: period.topVotingPower,
            proposalsCount: period.proposalsCount,
            yayVotingPower: period.yayVotingPower,
            nayVotingPower: period.nayVotingPower,
            passVotingPower: period.passVotingPower,
            ballotsQuorum: period.ballotsQuorum,
            supermajority: period.supermajority
        };
    } catch (error) {
        console.error('Failed to fetch voting status:', error);
        return buildVotingStatusFromReport(await loadGovernanceReport());
    }
}

/**
 * Get upgrade count (named protocols from Athens onwards)
 */
export async function getUpgradeCount() {
    const protocols = await fetchProtocols();
    return protocols.length;
}

/**
 * Format time until next voting milestone
 */
export function formatTimeRemaining(endTime) {
    const end = new Date(endTime);
    const now = new Date();
    const diff = end - now;
    
    if (diff <= 0) return 'Ending soon';
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (days > 0) return `${days}d ${hours}h remaining`;
    return `${hours}h remaining`;
}

/**
 * Get voting period display name
 */
export function getVotingPeriodName(kind) {
    return governancePeriodName(kind);
}
