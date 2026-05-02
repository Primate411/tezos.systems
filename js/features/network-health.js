/**
 * Network Health
 * Tracks recent Tezos attestation power against the 7,000-power block committee.
 */

import { API_URLS } from '../core/config.js';

const POWER_PER_BLOCK = 7000;
const LAST_BLOCK_LIMIT = 5;
const RANGE_PAGE_LIMIT = 10000;
const SAMPLE_SIZE = 180;
const PERIOD_TTL = 30 * 60 * 1000;
const LIVE_REFRESH_INTERVAL = 6 * 1000;
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

async function fetchJson(url, retries = 2) {
    for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
            const response = await fetch(url, { headers: { Accept: 'application/json' } });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } catch (error) {
            if (attempt === retries) throw error;
            await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
        }
    }
}

function normalizeBlock(block) {
    const committee = Number(block.attestationCommittee) || POWER_PER_BLOCK;
    const power = Math.max(0, Math.min(Number(block.attestationPower) || 0, committee));
    return {
        level: Number(block.level) || 0,
        timestamp: block.timestamp || null,
        power,
        committee,
        score: committee > 0 ? (power / committee) * 100 : 0
    };
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

async function fetchLastBlocks() {
    const fields = 'level,timestamp,attestationPower,attestationCommittee';
    const url = `${API_URLS.tzkt}/blocks?sort.desc=level&limit=${LAST_BLOCK_LIMIT}&select=${fields}`;
    const blocks = await fetchJson(url);
    return blocks.map(normalizeBlock);
}

async function fetchLevelAt(date) {
    const timestamp = encodeURIComponent(date.toISOString());
    const level = await fetchJson(`${API_URLS.tzkt}/blocks/${timestamp}/level`);
    return Number(level) || 0;
}

async function fetchBlocksInRange(startLevel, endLevel) {
    const fields = 'level,attestationPower,attestationCommittee';
    const blocks = [];
    let offset = 0;

    while (startLevel <= endLevel) {
        const url = `${API_URLS.tzkt}/blocks?level.ge=${startLevel}&level.le=${endLevel}&sort.asc=level&offset=${offset}&limit=${RANGE_PAGE_LIMIT}&select=${fields}`;
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
        const url = `${API_URLS.tzkt}/blocks?level.in=${chunk.join(',')}&sort.asc=level&limit=${chunk.length}&select=${fields}`;
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
    });
}
