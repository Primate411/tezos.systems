/**
 * Network Health
 * Tracks recent Tezos attestation power against the 7,000-power block committee.
 */

import { API_URLS } from '../core/config.js';
import { escapeHtml } from '../core/utils.js';

const TZKT = API_URLS.tzkt;
const POWER_PER_BLOCK = 7000;
const TARGET_BLOCK_SECONDS = 6;
const LAST_BLOCK_LIMIT = 5;
const CHAMBER_BLOCK_LIMIT = 16;
const MISSED_BLOCK_LOOKBACK = 120;
const MISSED_RIGHTS_LIMIT = 90;
const RANGE_PAGE_LIMIT = 10000;
const SAMPLE_SIZE = 180;
const PERIOD_TTL = 30 * 60 * 1000;
const LIVE_REFRESH_INTERVAL = 6 * 1000;
const CHAMBER_REFRESH_INTERVAL = 6 * 1000;
const BLOCK_PULSE_THROTTLE = 4 * 1000;
const STORAGE_KEY = 'tezos-systems-network-health';

const PERIODS = [
    { key: '24h', label: '24H', hours: 24, exactLimit: 22000 },
    { key: '7d', label: '7D', hours: 24 * 7 },
    { key: '31d', label: '31D', hours: 24 * 31 }
];

let refreshTimer = null;
let refreshInFlight = null;
let cachedData = null;
let lastFullFetch = 0;
let lastBlockPulseFetch = 0;
let chamberTimer = null;
let chamberRefreshInFlight = false;
let savedBodyOverflow = null;
let savedHtmlOverflow = null;

function formatCount(value) {
    return Number(value || 0).toLocaleString('en-US');
}

function formatPct(value) {
    if (!Number.isFinite(value)) return '--';
    return value >= 99.95 ? value.toFixed(2) : value.toFixed(1);
}

function formatCompactPower(value) {
    if (!Number.isFinite(value)) return '--';
    return Intl.NumberFormat('en-US', {
        notation: 'compact',
        maximumFractionDigits: value >= 100000000 ? 2 : 1
    }).format(value);
}

function formatBlockDenominator(value) {
    if (!Number.isFinite(value)) return '/--';
    if (value === POWER_PER_BLOCK) return '/7k';
    if (value >= 1000 && value % 1000 === 0) return `/${value / 1000}k`;
    return `/${value.toLocaleString()}`;
}

function formatSeconds(value) {
    if (!Number.isFinite(value)) return '--';
    if (value < 10 && value % 1 !== 0) return `${value.toFixed(1)}s`;
    return `${Math.round(value)}s`;
}

function formatAge(timestamp) {
    const diff = Date.now() - new Date(timestamp).getTime();
    if (!Number.isFinite(diff) || diff < 0) return 'just now';
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ${minutes % 60}m ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h ago`;
}

function healthClass(score) {
    if (score >= 99.5) return 'peak';
    if (score >= 98.5) return 'healthy';
    if (score >= 95) return 'watch';
    return 'degraded';
}

function healthLabel(score) {
    if (score >= 99.5) return 'Peak';
    if (score >= 98.5) return 'Healthy';
    if (score >= 95) return 'Watch';
    return 'Degraded';
}

function timingClass(seconds) {
    if (!Number.isFinite(seconds)) return 'unknown';
    if (seconds <= TARGET_BLOCK_SECONDS + 2) return 'peak';
    if (seconds <= TARGET_BLOCK_SECONDS + 6) return 'watch';
    return 'degraded';
}

function shortAddress(address) {
    if (!address) return 'Unknown baker';
    return `${address.slice(0, 7)}...${address.slice(-5)}`;
}

function bakerName(baker) {
    return baker?.alias || shortAddress(baker?.address);
}

function bakerLinks(address, name) {
    const label = name || shortAddress(address);
    if (!address) return `<span class="lb-baker-name">${escapeHtml(label)}</span>`;
    const encoded = encodeURIComponent(address);
    return `
        <span class="lb-baker-link-wrap" title="${escapeHtml(address)}">
            <a class="lb-baker-name-link health-baker-name-link" href="#baker=${encoded}" title="Open Tezos.Systems baker profile">${escapeHtml(label)}</a>
            <a class="lb-baker-source-link" href="https://tzkt.io/${encoded}" target="_blank" rel="noopener" title="Open baker on TzKT">TzKT</a>
        </span>
    `;
}

async function fetchJson(url, retries = 2) {
    for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
            const response = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } catch (error) {
            if (attempt === retries) throw error;
            await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
        }
    }
}

function numericRound(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

function normalizeBlock(block) {
    const committee = Number(block.attestationCommittee) || POWER_PER_BLOCK;
    const rawPower = Number(block.attestationPower ?? block.validations ?? 0);
    const power = Math.max(0, Math.min(Number.isFinite(rawPower) ? rawPower : 0, committee));
    const payloadRound = numericRound(block.payloadRound);
    const blockRound = Number.isFinite(Number(block.blockRound)) ? Number(block.blockRound) : payloadRound;
    return {
        level: Number(block.level) || 0,
        timestamp: block.timestamp || null,
        producer: block.producer || null,
        proposer: block.proposer || null,
        payloadRound,
        blockRound,
        power,
        committee,
        missedPower: Math.max(0, committee - power),
        intervalSeconds: null,
        score: committee > 0 ? (power / committee) * 100 : 0
    };
}

function addBlockIntervals(blocks) {
    return blocks.map((block, index) => {
        const older = blocks[index + 1];
        if (!block.timestamp || !older?.timestamp) return block;
        const diff = (new Date(block.timestamp).getTime() - new Date(older.timestamp).getTime()) / 1000;
        return {
            ...block,
            intervalSeconds: Number.isFinite(diff) && diff >= 0 ? diff : null
        };
    });
}

function summarizeBlocks(blocks) {
    const totalPower = blocks.reduce((sum, block) => sum + block.power, 0);
    const totalCommittee = blocks.reduce((sum, block) => sum + block.committee, 0);
    const score = totalCommittee > 0 ? (totalPower / totalCommittee) * 100 : 0;

    return {
        score,
        totalPower,
        totalCommittee,
        missingPower: Math.max(0, totalCommittee - totalPower),
        count: blocks.length
    };
}

function summarizeTiming(blocks) {
    const intervals = blocks.map((block) => block.intervalSeconds).filter(Number.isFinite);
    const roundZero = blocks.filter((block) => block.blockRound === 0).length;
    const avgSeconds = intervals.length
        ? intervals.reduce((sum, value) => sum + value, 0) / intervals.length
        : null;
    const maxSeconds = intervals.length ? Math.max(...intervals) : null;
    const onTarget = intervals.filter((value) => value <= TARGET_BLOCK_SECONDS + 2).length;
    const maxRound = blocks.reduce((max, block) => Math.max(max, block.blockRound), 0);

    return {
        intervals,
        avgSeconds,
        maxSeconds,
        onTarget,
        intervalCount: intervals.length,
        roundZero,
        roundZeroPct: blocks.length ? (roundZero / blocks.length) * 100 : 0,
        maxRound
    };
}

async function fetchRecentBlocks(limit = LAST_BLOCK_LIMIT) {
    const fields = 'level,timestamp,producer,proposer,attestationPower,attestationCommittee,payloadRound,blockRound';
    const url = `${TZKT}/blocks?sort.desc=level&limit=${limit}&select=${fields}`;
    const blocks = await fetchJson(url);
    return addBlockIntervals((Array.isArray(blocks) ? blocks : []).map(normalizeBlock));
}

async function fetchLastBlocks() {
    return fetchRecentBlocks(LAST_BLOCK_LIMIT);
}

async function fetchLevelAt(date) {
    const timestamp = encodeURIComponent(date.toISOString());
    const level = await fetchJson(`${TZKT}/blocks/${timestamp}/level`);
    return Number(level) || 0;
}

async function fetchBlocksInRange(startLevel, endLevel) {
    const fields = 'level,attestationPower,attestationCommittee';
    const blocks = [];
    let offset = 0;

    while (startLevel <= endLevel) {
        const url = `${TZKT}/blocks?level.ge=${startLevel}&level.le=${endLevel}&sort.asc=level&offset=${offset}&limit=${RANGE_PAGE_LIMIT}&select=${fields}`;
        const page = await fetchJson(url);
        blocks.push(...page.map(normalizeBlock));
        if (page.length < RANGE_PAGE_LIMIT) break;
        offset += RANGE_PAGE_LIMIT;
    }

    return blocks;
}

function buildSampleLevels(startLevel, endLevel, sampleSize) {
    const total = Math.max(1, endLevel - startLevel + 1);
    const count = Math.min(sampleSize, total);
    if (count <= 1) return [endLevel];

    const levels = new Set();
    const step = (endLevel - startLevel) / (count - 1);
    for (let i = 0; i < count; i += 1) {
        levels.add(Math.round(startLevel + step * i));
    }
    levels.add(endLevel);
    return Array.from(levels).sort((a, b) => a - b);
}

async function fetchBlocksByLevels(levels) {
    if (!levels.length) return [];
    const fields = 'level,attestationPower,attestationCommittee';
    const chunks = [];
    for (let i = 0; i < levels.length; i += 200) {
        chunks.push(levels.slice(i, i + 200));
    }

    const pages = await Promise.all(chunks.map((chunk) => {
        const url = `${TZKT}/blocks?level.in=${chunk.join(',')}&sort.asc=level&limit=${chunk.length}&select=${fields}`;
        return fetchJson(url);
    }));

    return pages.flat().map(normalizeBlock);
}

async function fetchPeriod(period, headLevel, now) {
    const cutoff = new Date(now.getTime() - period.hours * 60 * 60 * 1000);
    const cutoffLevel = await fetchLevelAt(cutoff);
    const startLevel = Math.max(1, cutoffLevel + 1);
    const totalBlocks = Math.max(1, headLevel - cutoffLevel);

    let blocks;
    let sampled = true;

    if (period.exactLimit && totalBlocks <= period.exactLimit) {
        blocks = await fetchBlocksInRange(startLevel, headLevel);
        sampled = false;
    } else {
        const sampleLevels = buildSampleLevels(startLevel, headLevel, SAMPLE_SIZE);
        blocks = await fetchBlocksByLevels(sampleLevels);
    }

    const summary = summarizeBlocks(blocks);
    const possiblePower = totalBlocks * POWER_PER_BLOCK;
    const actualPower = Math.round((summary.score / 100) * possiblePower);

    return {
        key: period.key,
        label: period.label,
        score: summary.score,
        actualPower,
        possiblePower,
        missingPower: Math.max(0, possiblePower - actualPower),
        blocks: totalBlocks,
        sampleSize: blocks.length,
        sampled
    };
}

function loadCachedData() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (!data?.updatedAt) return null;
        return data;
    } catch {
        return null;
    }
}

function saveCachedData(data) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
        // Non-critical cache.
    }
}

function periodCacheIsFresh(data) {
    const periodUpdatedAt = data?.periodUpdatedAt || 0;
    return data?.periods?.length === PERIODS.length && Date.now() - periodUpdatedAt < PERIOD_TTL;
}

async function fetchNetworkHealth({ forcePeriods = false } = {}) {
    const lastBlocks = await fetchLastBlocks();
    const summary = summarizeBlocks(lastBlocks);
    const headLevel = lastBlocks[0]?.level || 0;
    const now = new Date();

    let periods = cachedData?.periods || [];
    const shouldFetchPeriods = forcePeriods || !periodCacheIsFresh(cachedData) || !periods.length;

    if (headLevel && shouldFetchPeriods) {
        periods = await Promise.all(PERIODS.map((period) => fetchPeriod(period, headLevel, now)));
        lastFullFetch = Date.now();
    }

    return {
        updatedAt: Date.now(),
        periodUpdatedAt: shouldFetchPeriods ? Date.now() : (cachedData?.periodUpdatedAt || 0),
        headLevel,
        blocks: lastBlocks,
        summary,
        periods
    };
}

function normalizeRight(right, type) {
    return {
        type,
        level: Number(right.level) || 0,
        timestamp: right.timestamp || null,
        round: right.round === null || right.round === undefined ? null : Number(right.round),
        slots: Math.max(0, Number(right.slots) || 0),
        baker: right.baker || {}
    };
}

async function fetchMissedRights(type, startLevel, endLevel, limit = MISSED_RIGHTS_LIMIT) {
    if (!startLevel || !endLevel || startLevel > endLevel) return [];
    const fields = type === 'attestation'
        ? 'level,timestamp,slots,baker,status,type'
        : 'level,timestamp,round,baker,status,type';
    const url = `${TZKT}/rights?sort.desc=level&limit=${limit}&status=missed&type=${type}&level.ge=${startLevel}&level.le=${endLevel}&select=${fields}`;
    const rights = await fetchJson(url);
    return (Array.isArray(rights) ? rights : []).map((right) => normalizeRight(right, type));
}

function summarizeMissedAttesters(rights) {
    const byBaker = new Map();
    for (const right of rights) {
        const address = right.baker?.address || 'unknown';
        const current = byBaker.get(address) || {
            address,
            name: bakerName(right.baker),
            slots: 0,
            count: 0,
            latestLevel: 0,
            latestTimestamp: null
        };
        current.slots += right.slots;
        current.count += 1;
        if (right.level > current.latestLevel) {
            current.latestLevel = right.level;
            current.latestTimestamp = right.timestamp;
        }
        byBaker.set(address, current);
    }
    return [...byBaker.values()].sort((a, b) => b.slots - a.slots || b.latestLevel - a.latestLevel);
}

function chamberStatus(data) {
    if (data.summary.score < 95 || data.timing.maxRound > 1 || (data.timing.avgSeconds || 0) > 12) {
        return { label: 'Degraded', className: 'historical' };
    }
    if (data.summary.score < 99.5 || data.timing.maxRound > 0 || (data.timing.avgSeconds || 0) > 8 || data.missedBlocks.length) {
        return { label: 'Watch', className: 'current' };
    }
    return { label: 'Healthy', className: 'live' };
}

async function fetchNetworkHealthChamberData() {
    const blocks = await fetchRecentBlocks(CHAMBER_BLOCK_LIMIT);
    const summary = summarizeBlocks(blocks);
    const timing = summarizeTiming(blocks);
    const headLevel = blocks[0]?.level || 0;
    const oldestLevel = blocks[blocks.length - 1]?.level || headLevel;
    const missedBlockStart = Math.max(1, headLevel - MISSED_BLOCK_LOOKBACK);
    const [missedAttestations, missedBlocks] = headLevel
        ? await Promise.all([
            fetchMissedRights('attestation', oldestLevel, headLevel),
            fetchMissedRights('baking', missedBlockStart, headLevel, 30)
        ])
        : [[], []];

    return {
        updatedAt: Date.now(),
        headLevel,
        oldestLevel,
        blocks,
        summary,
        timing,
        missedAttestations,
        missedAttesters: summarizeMissedAttesters(missedAttestations),
        missedBlocks,
        periods: cachedData?.periods || []
    };
}

function renderBlock(block) {
    const cls = healthClass(block.score);
    const levelTail = block.level ? String(block.level).slice(-3).padStart(3, '0') : '---';
    const width = Math.max(2, Math.min(100, block.score));
    const title = `Block ${block.level.toLocaleString()}: ${block.power.toLocaleString()} / ${block.committee.toLocaleString()} power`;

    return `
        <div class="network-health-block ${cls}" title="${title}" aria-label="${title}">
            <span class="network-health-block-power">${block.power.toLocaleString()}<span class="network-health-denominator">${formatBlockDenominator(block.committee)}</span></span>
            <span class="network-health-meter"><span style="width:${width}%"></span></span>
            <span class="network-health-block-level">#${levelTail}</span>
        </div>
    `;
}

function renderPeriod(period) {
    const cls = healthClass(period.score);
    const title = `${period.label}: ${formatCompactPower(period.actualPower)} / ${formatCompactPower(period.possiblePower)} power${period.sampled ? ' (sampled)' : ''}`;

    return `
        <div class="network-health-period ${cls}" title="${title}" aria-label="${title}">
            <span class="network-health-period-label">${period.label}</span>
            <span class="network-health-period-value">${formatPct(period.score)}%</span>
        </div>
    `;
}

function renderNetworkHealth(data) {
    const scoreEl = document.getElementById('network-health-front');
    const statusEl = document.getElementById('network-health-status');
    const blocksEl = document.getElementById('network-health-blocks');
    const periodsEl = document.getElementById('network-health-periods');
    const backEl = document.getElementById('network-health-back');
    const descEl = document.getElementById('network-health-description');
    if (!scoreEl || !blocksEl || !periodsEl) return;

    const cls = healthClass(data.summary.score);
    const label = healthLabel(data.summary.score);

    scoreEl.textContent = `${formatPct(data.summary.score)}%`;
    scoreEl.className = `stat-value network-health-score ${cls}`;

    if (statusEl) {
        statusEl.textContent = label;
        statusEl.className = `network-health-status ${cls}`;
    }

    blocksEl.innerHTML = data.blocks.map(renderBlock).join('');
    periodsEl.innerHTML = data.periods.map(renderPeriod).join('');

    if (backEl) {
        backEl.innerHTML = data.periods.map((period) => `
            <div class="network-health-back-row">
                <span>${period.label}</span>
                <strong>${formatCompactPower(period.actualPower)} / ${formatCompactPower(period.possiblePower)}</strong>
            </div>
        `).join('');
    }

    if (descEl) {
        descEl.textContent = `${formatCompactPower(data.summary.totalPower)} / ${formatCompactPower(data.summary.totalCommittee)} power across last 5 blocks`;
    }
}

function renderNetworkHealthError() {
    const scoreEl = document.getElementById('network-health-front');
    const statusEl = document.getElementById('network-health-status');
    const blocksEl = document.getElementById('network-health-blocks');
    const periodsEl = document.getElementById('network-health-periods');

    if (scoreEl) {
        scoreEl.textContent = '--';
        scoreEl.className = 'stat-value network-health-score degraded';
    }
    if (statusEl) {
        statusEl.textContent = 'Offline';
        statusEl.className = 'network-health-status degraded';
    }
    if (blocksEl) blocksEl.innerHTML = '<span class="network-health-muted">TzKT unavailable</span>';
    if (periodsEl) periodsEl.innerHTML = '';
}

function renderHealthScorePanel(data) {
    const cls = healthClass(data.summary.score);
    const width = Math.max(2, Math.min(100, data.summary.score));
    return `
        <section class="lb-panel health-panel health-score-panel chamber-anim-fade">
            <div class="lb-panel-title">Consensus Power</div>
            <div class="health-hero-number ${cls}" id="health-hero-score">${formatPct(data.summary.score)}%</div>
            <div class="health-hero-copy">Last ${formatCount(data.summary.count)} blocks recorded ${formatCompactPower(data.summary.totalPower)} / ${formatCompactPower(data.summary.totalCommittee)} attestation power.</div>
            <div class="health-score-meter" aria-label="Recent attestation power">
                <div class="health-score-fill ${cls}" style="width:${width.toFixed(2)}%"></div>
            </div>
            <div class="lb-metric-grid health-metric-grid">
                <div><span>Missed power</span><strong>${formatCompactPower(data.summary.missingPower)}</strong></div>
                <div><span>Block range</span><strong>${formatCount(data.oldestLevel)} -> ${formatCount(data.headLevel)}</strong></div>
                <div><span>Updated</span><strong>${formatAge(data.updatedAt)}</strong></div>
            </div>
        </section>
    `;
}

function renderTimingPanel(data) {
    const onTargetPct = data.timing.intervalCount ? (data.timing.onTarget / data.timing.intervalCount) * 100 : 0;
    const cells = data.blocks.slice(0, -1).map((block) => {
        const cls = timingClass(block.intervalSeconds);
        return `
            <span class="health-timing-cell ${cls}" title="Block ${formatCount(block.level)} interval ${formatSeconds(block.intervalSeconds)}">
                ${formatSeconds(block.intervalSeconds)}
            </span>
        `;
    }).join('');

    return `
        <section class="lb-panel health-panel health-timing-panel chamber-anim-fade" style="animation-delay:60ms">
            <div class="lb-panel-title">Block Cadence <span class="lb-live-pill">target ${TARGET_BLOCK_SECONDS}s</span></div>
            <div class="lb-metric-grid health-metric-grid">
                <div><span>Average</span><strong id="health-avg-block">${formatSeconds(data.timing.avgSeconds)}</strong></div>
                <div><span>On target</span><strong>${formatPct(onTargetPct)}%</strong></div>
                <div><span>Round 0</span><strong>${formatPct(data.timing.roundZeroPct)}%</strong></div>
            </div>
            <div class="health-timing-strip" aria-label="Recent block intervals">${cells}</div>
            <div class="health-timing-note">Max round ${formatCount(data.timing.maxRound)} across the live sample.</div>
        </section>
    `;
}

function renderAttesterRows(attesters) {
    if (!attesters.length) return '<div class="lb-empty-inline">No missed attestations in the current block sample.</div>';
    return attesters.slice(0, 12).map((item) => `
        <div class="lb-table-row health-attester-row" data-health-baker="${escapeHtml(item.address)}">
            <div class="lb-baker-cell">${bakerLinks(item.address, item.name)}</div>
            <span>${formatCount(item.slots)}</span>
            <span>${formatCount(item.latestLevel)} · ${escapeHtml(formatAge(item.latestTimestamp))}</span>
        </div>
    `).join('');
}

function renderMissedAttestationsPanel(data) {
    const missedPower = data.missedAttestations.reduce((sum, item) => sum + item.slots, 0);
    return `
        <section class="lb-panel health-panel health-missed-attestations chamber-anim-fade" style="animation-delay:120ms">
            <div class="lb-panel-title">Missed Attestations</div>
            <div class="lb-metric-grid health-metric-grid">
                <div><span>Missed power</span><strong>${formatCount(missedPower)}</strong></div>
                <div><span>Attesters</span><strong>${formatCount(data.missedAttesters.length)}</strong></div>
                <div><span>Rows</span><strong>${formatCount(data.missedAttestations.length)}</strong></div>
            </div>
            <div class="lb-table health-attester-table">
                <div class="lb-table-head"><span>Baker</span><span>Power</span><span>Latest miss</span></div>
                <div id="health-missed-attester-list">${renderAttesterRows(data.missedAttesters)}</div>
            </div>
        </section>
    `;
}

function renderMissedBlockRows(missedBlocks) {
    if (!missedBlocks.length) return '<div class="lb-empty-inline">No missed baking rights in the recent lookback.</div>';
    return missedBlocks.slice(0, 12).map((right) => `
        <div class="lb-table-row health-missed-block-row" data-health-level="${Number(right.level) || 0}">
            <span>${formatCount(right.level)}</span>
            <span>${right.round === null ? '--' : `R${formatCount(right.round)}`}</span>
            <div class="lb-baker-cell">${bakerLinks(right.baker?.address, bakerName(right.baker))}</div>
        </div>
    `).join('');
}

function renderMissedBlocksPanel(data) {
    return `
        <section class="lb-panel health-panel health-missed-blocks chamber-anim-fade" style="animation-delay:180ms">
            <div class="lb-panel-title">Missed Blocks</div>
            <div class="lb-panel-subtitle">Last ${formatCount(MISSED_BLOCK_LOOKBACK)} levels ending at head.</div>
            <div class="lb-table health-missed-block-table">
                <div class="lb-table-head"><span>Level</span><span>Round</span><span>Baker</span></div>
                <div id="health-missed-block-list">${renderMissedBlockRows(data.missedBlocks)}</div>
            </div>
        </section>
    `;
}

function renderRoundBadge(block) {
    const cls = block.blockRound === 0 ? 'round-zero' : (block.blockRound === 1 ? 'round-watch' : 'round-late');
    const title = block.payloadRound !== block.blockRound
        ? `block round ${block.blockRound}, payload round ${block.payloadRound}`
        : `round ${block.blockRound}`;
    return `<span class="health-round-badge ${cls}" title="${escapeHtml(title)}">R${formatCount(block.blockRound)}</span>`;
}

function renderRecentBlockRows(blocks) {
    return blocks.map((block, index) => {
        const cls = healthClass(block.score);
        const timeCls = timingClass(block.intervalSeconds);
        const isNew = index === 0 ? 'lb-row-new' : '';
        return `
            <div class="lb-table-row health-block-row ${isNew}" data-health-level="${Number(block.level) || 0}">
                <span>${formatCount(block.level)}</span>
                <span class="health-interval ${timeCls}">${formatSeconds(block.intervalSeconds)}</span>
                <span>${renderRoundBadge(block)}</span>
                <span class="health-power ${cls}">${formatCount(block.power)}<small>/${formatCount(block.committee)}</small></span>
                <span>${formatCount(block.missedPower)}</span>
                <div class="lb-baker-cell">${bakerLinks(block.producer?.address, bakerName(block.producer))}</div>
            </div>
        `;
    }).join('');
}

function renderRecentBlocksPanel(data) {
    return `
        <section class="lb-panel health-panel health-recent-blocks chamber-anim-fade" style="animation-delay:240ms">
            <div class="lb-panel-title">Passing Blocks <span class="lb-live-pill">live</span></div>
            <div class="lb-table health-block-table">
                <div class="lb-table-head"><span>Level</span><span>Delta</span><span>Round</span><span>Attested</span><span>Missed</span><span>Baker</span></div>
                <div id="health-recent-block-list">${renderRecentBlockRows(data.blocks)}</div>
            </div>
        </section>
    `;
}

function renderNetworkHealthChamber(data, container) {
    const latest = data.blocks[0] || null;
    const status = chamberStatus(data);
    container.innerHTML = `
        <div class="chamber-header lb-header health-header chamber-anim-fade">
            <div class="lb-system-strip">
                <span class="lb-system-brand">Tezos.Systems</span>
                <span>Network Health</span>
                <span>Live consensus feed</span>
            </div>
            <div class="chamber-title-row">
                <h2 class="chamber-title">Network Health Chamber</h2>
                <span class="chamber-badge ${status.className}" id="health-header-badge">${escapeHtml(status.label)}</span>
                <span class="lb-live-pill lb-refresh-pill" id="health-refresh-state">auto-refresh ${Math.round(CHAMBER_REFRESH_INTERVAL / 1000)}s</span>
            </div>
            <div class="chamber-proposal-info">
                <div class="proposal-name">Immediate block and consensus health</div>
                <div class="proposal-hash" id="health-head-meta">${latest ? `Head block ${formatCount(latest.level)} · ${escapeHtml(formatAge(latest.timestamp))} · avg ${formatSeconds(data.timing.avgSeconds)}` : 'Live TzKT block feed'}</div>
            </div>
        </div>
        <section class="lb-explainer health-explainer chamber-anim-fade">
            <div class="lb-explainer-main">
                <div class="lb-explainer-kicker">Right now</div>
                <p><strong>Immediate health</strong> follows block cadence, consensus round, and attestation power as each new Tezos block lands.</p>
            </div>
            <div class="lb-explainer-facts" aria-label="Network health quick facts">
                <span><strong>Cadence</strong> ${TARGET_BLOCK_SECONDS}s target</span>
                <span><strong>Round</strong> R0 ideal</span>
                <span><strong>Power</strong> ${formatCount(POWER_PER_BLOCK)} per block</span>
            </div>
        </section>
        <div class="lb-dashboard-grid health-dashboard-grid">
            ${renderHealthScorePanel(data)}
            ${renderTimingPanel(data)}
            ${renderMissedAttestationsPanel(data)}
            ${renderMissedBlocksPanel(data)}
        </div>
        ${renderRecentBlocksPanel(data)}
        <div class="chamber-footer chamber-anim-fade" style="animation-delay:300ms">
            <a href="https://tzkt.io/blocks" target="_blank" rel="noopener">TzKT Blocks -></a>
            <span class="chamber-footer-sep">·</span>
            <a href="https://tzkt.io/rights" target="_blank" rel="noopener">TzKT Rights -></a>
            <span class="chamber-footer-sep">·</span>
            <a class="panel-direct-link" href="/#health" aria-label="Direct link to Network Health Chamber">Direct: /#health</a>
        </div>
    `;
    container.dataset.healthRendered = 'true';
    initHealthBakerProfileLinks(container);
}

function initHealthBakerProfileLinks(root = document) {
    root.querySelectorAll('.health-baker-name-link').forEach((link) => {
        if (link.dataset.healthProfileWired) return;
        link.dataset.healthProfileWired = '1';
        link.addEventListener('click', closeNetworkHealthChamber);
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

function handleChamberEscape(event) {
    if (event.key === 'Escape') closeNetworkHealthChamber();
}

async function refreshNetworkHealthChamber({ initial = false } = {}) {
    const overlay = document.getElementById('network-health-modal');
    const body = overlay?.querySelector('.health-body');
    if (!overlay?.classList.contains('active') || !body || chamberRefreshInFlight) return;
    chamberRefreshInFlight = true;
    overlay.classList.add('health-refreshing');

    try {
        const data = await fetchNetworkHealthChamberData();
        if (!overlay.classList.contains('active')) return;
        renderNetworkHealthChamber(data, body);
    } catch (error) {
        if (initial) throw error;
        console.warn('Network Health chamber refresh failed', error);
        const state = document.getElementById('health-refresh-state');
        if (state) state.textContent = 'refresh delayed';
    } finally {
        overlay.classList.remove('health-refreshing');
        chamberRefreshInFlight = false;
    }
}

function startChamberRefresh() {
    stopChamberRefresh();
    const overlay = document.getElementById('network-health-modal');
    if (overlay) overlay.dataset.healthLive = 'true';
    chamberTimer = window.setInterval(() => {
        if (document.hidden) return;
        refreshNetworkHealthChamber();
    }, CHAMBER_REFRESH_INTERVAL);
}

function stopChamberRefresh() {
    if (chamberTimer) {
        window.clearInterval(chamberTimer);
        chamberTimer = null;
    }
    const overlay = document.getElementById('network-health-modal');
    if (overlay) overlay.dataset.healthLive = 'false';
}

export async function openNetworkHealthChamber() {
    document.getElementById('tooltip-network-health')?.classList.remove('is-open');
    let overlay = document.getElementById('network-health-modal');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'network-health-modal';
        overlay.className = 'modal-overlay chamber-overlay lb-overlay health-overlay';
        overlay.innerHTML = `
            <div class="modal-content modal-large chamber-content lb-content health-content">
                <button class="modal-close chamber-close" aria-label="Close" style="z-index:3">&times;</button>
                <div class="chamber-body lb-body health-body">
                    <div class="chamber-loading">
                        <div class="chamber-loading-text">Opening Network Health Chamber...</div>
                        <div class="chamber-loading-bar"><div class="chamber-loading-fill"></div></div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        overlay.querySelector('.chamber-close')?.addEventListener('click', closeNetworkHealthChamber);
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) closeNetworkHealthChamber();
        });
    }

    document.addEventListener('keydown', handleChamberEscape);
    overlay.classList.add('active');
    lockPageScroll();
    const content = overlay.querySelector('.health-content');
    if (content) content.scrollTop = 0;

    try {
        await refreshNetworkHealthChamber({ initial: true });
        startChamberRefresh();
    } catch (error) {
        console.error('Network Health chamber fetch error:', error);
        overlay.querySelector('.health-body').innerHTML = `
            <div class="chamber-error">
                <div class="error-icon">!</div>
                <div class="error-title">Couldn't reach network health data</div>
                <div class="error-detail">TzKT block or rights data may be temporarily unavailable. Try again in a moment.</div>
                <button class="chamber-retry-btn" id="health-retry-open">Retry</button>
            </div>
        `;
        overlay.querySelector('#health-retry-open')?.addEventListener('click', openNetworkHealthChamber);
    }
}

export function closeNetworkHealthChamber() {
    document.removeEventListener('keydown', handleChamberEscape);
    stopChamberRefresh();
    const overlay = document.getElementById('network-health-modal');
    if (overlay) overlay.classList.remove('active');
    document.getElementById('tooltip-network-health')?.classList.remove('is-open');
    unlockPageScroll();
}

function wireNetworkHealthCard() {
    const card = document.querySelector('.stat-card[data-stat="network-health"]');
    if (!card || card.dataset.healthChamberWired) return;
    card.dataset.healthChamberWired = '1';
    card.classList.add('chamber-entry-card', 'health-entry-card');
    card.style.cursor = 'pointer';
    card.title = 'Open Network Health Chamber';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', 'Open Network Health Chamber');

    const shouldIgnore = (target) => Boolean(target?.closest(
        '.card-info-btn, .card-tooltip, .card-share-btn, .card-history-btn, .card-copy-link, a, button'
    ));

    card.addEventListener('click', (event) => {
        if (shouldIgnore(event.target)) return;
        openNetworkHealthChamber();
    });

    card.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        if (shouldIgnore(event.target)) return;
        event.preventDefault();
        openNetworkHealthChamber();
    });
}

export async function refreshNetworkHealth({ force = false } = {}) {
    if (refreshInFlight) return refreshInFlight;

    const forcePeriods = force || !cachedData || Date.now() - lastFullFetch > PERIOD_TTL;
    refreshInFlight = fetchNetworkHealth({ forcePeriods })
        .then((data) => {
            cachedData = data;
            lastFullFetch = data.periodUpdatedAt || lastFullFetch;
            saveCachedData(data);
            renderNetworkHealth(data);
            return data;
        })
        .catch((error) => {
            console.warn('Network health refresh failed:', error);
            if (cachedData) renderNetworkHealth(cachedData);
            else renderNetworkHealthError();
            return cachedData;
        })
        .finally(() => {
            refreshInFlight = null;
        });

    return refreshInFlight;
}

export function initNetworkHealth() {
    if (!document.querySelector('[data-stat="network-health"]')) return;

    wireNetworkHealthCard();

    cachedData = loadCachedData();
    if (cachedData) {
        lastFullFetch = cachedData.periodUpdatedAt || cachedData.updatedAt || 0;
        renderNetworkHealth(cachedData);
    }

    refreshNetworkHealth({ force: !periodCacheIsFresh(cachedData) });

    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
        if (document.visibilityState === 'visible') refreshNetworkHealth();
    }, LIVE_REFRESH_INTERVAL);

    window.addEventListener('block-pulse', () => {
        const now = Date.now();
        if (now - lastBlockPulseFetch < BLOCK_PULSE_THROTTLE) return;
        lastBlockPulseFetch = now;
        refreshNetworkHealth();
        if (document.getElementById('network-health-modal')?.classList.contains('active')) {
            refreshNetworkHealthChamber();
        }
    });
}
