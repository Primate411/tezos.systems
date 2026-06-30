/**
 * Network Health
 * Tracks recent Tezos attestation power against the 7,000-power block committee.
 */

import { API_URLS } from '../core/config.js';
import { escapeHtml, refreshDataFreshnessStates, setDataFreshnessState } from '../core/utils.js';
import { fetchWithRetry } from '../core/api.js';

const TZKT = API_URLS.tzkt;
const TEZTALE = API_URLS.teztale;
const POWER_PER_BLOCK = 7000;
const TARGET_BLOCK_SECONDS = 6;
const LAST_BLOCK_LIMIT = 5;
const CHAMBER_BLOCK_LIMIT = 16;
const TEZTALE_BLOCK_LOOKBACK = 12;
const TEZTALE_QUORUM_TARGET = 0.66;
const TEZTALE_REPORT_URL = 'https://nomadic-labs.gitlab.io/teztale-dataviz/';
const TEZTALE_SOURCE_URL = 'https://gitlab.com/nomadic-labs/teztale';
const MISSED_BLOCK_LOOKBACK = 120;
const MISSED_RIGHTS_LIMIT = 90;
const RANGE_PAGE_LIMIT = 10000;
const SAMPLE_SIZE = 180;
const PERIOD_TTL = 30 * 60 * 1000;
const LIVE_REFRESH_INTERVAL = 6 * 1000;
const CHAMBER_REFRESH_INTERVAL = 6 * 1000;
const AGE_TICK_INTERVAL = 1000;
const BLOCK_PULSE_THROTTLE = 4 * 1000;
const ACTIVITY_TAPE_TTL = 60 * 1000;
const ACTIVITY_TAPE_LIMIT = 5;
const CYCLE_TIMING_LIMIT = 8;
const CYCLE_TIMING_TTL = 10 * 60 * 1000;
const CYCLE_TARGET_SECONDS_FALLBACK = 24 * 60 * 60;
const CYCLE_DRIFT_PEAK_PCT = 1;
const CYCLE_DRIFT_WATCH_PCT = 3;
const CYCLE_DRIFT_DEGRADED_PCT = 4;
const PROTOCOL_CONSTANTS_TTL = 30 * 60 * 1000;
const OCTEZ_VERSIONS_TTL = 30 * 60 * 1000;
const OCTEZ_VERSION_PAGE_LIMIT = 500;
const STORAGE_KEY = 'tezos-systems-network-health';
const MY_BAKER_STORAGE_KEY = 'tezos-systems-my-baker-address';

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
let lastBlockPulseAt = 0;
let chamberTimer = null;
let ageTimer = null;
let chamberRefreshInFlight = false;
let savedBodyOverflow = null;
let savedHtmlOverflow = null;
let activityTapeCache = [];
let activityTapeCacheAt = 0;
let activityTapeInFlight = null;
let blockTickerAnimationTimer = null;
let cycleTimingCache = null;
let cycleTimingCacheAt = 0;
let cycleTimingInFlight = null;
let protocolConstantsCache = null;
let protocolConstantsCacheAt = 0;
let octezVersionsCache = null;
let octezVersionsCacheAt = 0;
let octezVersionsInFlight = null;

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

function formatDuration(value) {
    const seconds = Math.abs(Number(value));
    if (!Number.isFinite(seconds)) return '--';
    const totalMinutes = Math.round(seconds / 60);
    if (totalMinutes <= 0) return `${Math.round(seconds)}s`;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}

function formatSignedDuration(value) {
    const seconds = Number(value);
    if (!Number.isFinite(seconds)) return '--';
    if (Math.abs(seconds) < 30) return 'on target';
    return `${seconds > 0 ? '+' : '-'}${formatDuration(seconds)}`;
}

function formatSignedPct(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '--';
    const sign = number > 0 ? '+' : '';
    return `${sign}${number.toFixed(2)}%`;
}

function formatAge(timestamp) {
    if (!timestamp) return '--';
    const timestampMs = new Date(timestamp).getTime();
    if (!Number.isFinite(timestampMs)) return '--';
    const diff = Date.now() - timestampMs;
    if (diff < 0) return 'just now';
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ${minutes % 60}m ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h ago`;
}

function formatTickerAge(timestamp) {
    if (!timestamp) return '--';
    const timestampMs = new Date(timestamp).getTime();
    if (!Number.isFinite(timestampMs)) return '--';
    const diff = Date.now() - timestampMs;
    if (diff < 0) return '00s ago';
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return `${String(seconds).padStart(2, '0')}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${String(minutes).padStart(2, '0')}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${String(hours).padStart(2, '0')}h ago`;
    const days = Math.floor(hours / 24);
    return `${Math.min(days, 99).toString().padStart(2, '0')}d ago`;
}

function getHeadTimestamp(data) {
    return data?.headTimestamp || data?.blocks?.[0]?.timestamp || null;
}

function healthAgeAttr(timestamp) {
    return timestamp ? ` data-health-age="${escapeHtml(timestamp)}"` : '';
}

function refreshHealthAgeLabels(root = document) {
    root.querySelectorAll('[data-health-age]').forEach((element) => {
        const formatter = element.dataset.healthAgeFormat === 'ticker' ? formatTickerAge : formatAge;
        element.textContent = formatter(element.dataset.healthAge);
    });
    refreshDataFreshnessStates(root);
}

function startHealthAgeTicker() {
    if (ageTimer) return;
    ageTimer = window.setInterval(() => refreshHealthAgeLabels(document), AGE_TICK_INTERVAL);
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

function cycleTimingClass(driftPct) {
    if (!Number.isFinite(driftPct)) return 'unknown';
    const abs = Math.abs(driftPct);
    if (abs <= CYCLE_DRIFT_PEAK_PCT) return 'peak';
    if (abs <= CYCLE_DRIFT_WATCH_PCT) return 'healthy';
    if (abs <= CYCLE_DRIFT_DEGRADED_PCT) return 'watch';
    return 'degraded';
}

function cycleTimingLabel(driftPct) {
    if (!Number.isFinite(driftPct)) return 'Warming';
    const abs = Math.abs(driftPct);
    if (abs <= CYCLE_DRIFT_PEAK_PCT) return 'On target';
    if (abs <= CYCLE_DRIFT_WATCH_PCT) return driftPct > 0 ? 'Slightly slow' : 'Slightly fast';
    if (abs <= CYCLE_DRIFT_DEGRADED_PCT) return 'Watch';
    return driftPct > 0 ? 'Slow cycle' : 'Fast cycle';
}

function shortAddress(address) {
    if (!address) return 'Unknown baker';
    return `${address.slice(0, 7)}...${address.slice(-5)}`;
}

function bakerName(baker) {
    return baker?.alias || shortAddress(baker?.address);
}

function formatBakingPower(value) {
    const power = Number(value);
    if (!Number.isFinite(power)) return '--';
    return `${formatCompactPower(power / 1e6)} XTZ`;
}

function latestBlockStatus(block) {
    const score = Number(block?.score);
    return {
        label: healthLabel(score),
        className: healthClass(score)
    };
}

function findOctezVersionBaker(octezVersions, address) {
    if (!address || !Array.isArray(octezVersions?.bakers)) return null;
    return octezVersions.bakers.find((baker) => baker.address === address) || null;
}

function tickerOctezSignal(producer, octezVersions) {
    const software = findOctezVersionBaker(octezVersions, producer?.address)?.software
        || normalizeOctezSoftware(producer?.software);
    const latestVersion = octezVersions?.latestVersion || '';
    const status = classifyOctezVersion(software.version, latestVersion);
    const colors = {
        current: '#35e894',
        watch: '#f5b84b',
        critical: '#ff6b7a'
    };
    return {
        value: software.known ? software.version : '--',
        className: status.className,
        label: status.label,
        latestVersion: status.latestVersion,
        known: software.known,
        color: colors[status.className] || ''
    };
}

function blockTickerFallback(message, className = 'loading') {
    const line = document.getElementById('block-ticker-line');
    const strip = document.getElementById('block-ticker-strip');
    if (!line || !strip) return;
    const signature = `fallback:${className}:${message}`;
    if (line.dataset.blockTickerSignature === signature) return;
    line.dataset.blockTickerSignature = signature;
    line.dataset.blockTickerTransitionCount = '0';
    strip.dataset.blockHealth = className;
    line.innerHTML = `<span class="block-ticker-placeholder">${escapeHtml(message)}</span>`;
}

function animateBlockTicker(strip, line, changed) {
    if (!strip) return;
    strip.classList.remove('is-updating');
    void strip.offsetWidth;
    if (line) line.dataset.blockTickerTransitionCount = changed ? '1' : '0';
    strip.dataset.tickerTransitionCount = changed ? '1' : '0';
    if (!changed) return;
    strip.classList.add('is-updating');
    if (blockTickerAnimationTimer) window.clearTimeout(blockTickerAnimationTimer);
    blockTickerAnimationTimer = window.setTimeout(() => {
        strip.classList.remove('is-updating');
        blockTickerAnimationTimer = null;
    }, 520);
}

function renderBlockTickerLine(block, timestamp, octezVersions) {
    const status = latestBlockStatus(block);
    const producer = block?.producer || {};
    const name = bakerName(producer);
    const round = Number.isFinite(Number(block?.blockRound)) ? `R${formatCount(block.blockRound)}` : 'R--';
    const octez = tickerOctezSignal(producer, octezVersions);
    const octezTitle = octez.known
        ? `Octez ${octez.value}: ${octez.label}${octez.latestVersion ? `; latest observed ${octez.latestVersion}` : ''}`
        : 'Octez version unavailable for this baker';
    const octezStyle = octez.color ? ` style="color:${octez.color}"` : '';

    return `
        <span class="block-ticker-segment block-ticker-level">
            <span class="block-ticker-label">Block</span>
            <strong class="block-ticker-value">#${formatCount(block.level)}</strong>
        </span>
        <span class="block-ticker-segment block-ticker-baker">
            <span class="block-ticker-label">Baker</span>
            <strong class="block-ticker-value" title="${escapeHtml(producer.address || name)}">${escapeHtml(name)}</strong>
        </span>
        <span class="block-ticker-segment block-ticker-health ${status.className}">
            <span class="block-ticker-label">Health</span>
            <strong class="block-ticker-value">${escapeHtml(status.label)}</strong>
        </span>
        <span class="block-ticker-segment block-ticker-octez ${octez.className}" data-ticker-priority="core">
            <span class="block-ticker-label">Octez</span>
            <strong class="block-ticker-value" title="${escapeHtml(octezTitle)}"${octezStyle}>${escapeHtml(octez.value)}</strong>
        </span>
        <span class="block-ticker-segment block-ticker-power" data-ticker-priority="core">
            <span class="block-ticker-label">Attested</span>
            <strong class="block-ticker-value">${formatCount(block.power)}<small>/${formatCount(block.committee)}</small></strong>
        </span>
        <span class="block-ticker-segment block-ticker-round" data-ticker-priority="optional">
            <span class="block-ticker-label">Round</span>
            <strong class="block-ticker-value">${escapeHtml(round)}</strong>
        </span>
        <span class="block-ticker-segment block-ticker-age" data-ticker-priority="optional">
            <span class="block-ticker-label">Age</span>
            <strong class="block-ticker-value" data-health-age="${escapeHtml(timestamp || '')}" data-health-age-format="ticker">${escapeHtml(formatTickerAge(timestamp))}</strong>
        </span>
    `;
}

function updateBlockTicker(data, { error = false } = {}) {
    const strip = document.getElementById('block-ticker-strip');
    const button = document.getElementById('block-ticker-button');
    const line = document.getElementById('block-ticker-line');
    if (!strip || !button || !line) return;

    if (!button.dataset.blockTickerWired) {
        button.dataset.blockTickerWired = '1';
        button.addEventListener('click', openNetworkHealthChamber);
    }

    const latest = data?.blocks?.[0] || null;
    if (!latest) {
        blockTickerFallback(error ? 'Live block feed unavailable' : 'Syncing latest head block', error ? 'degraded' : 'loading');
        return;
    }

    const timestamp = getHeadTimestamp(data);
    const status = latestBlockStatus(latest);
    const producerName = bakerName(latest.producer);
    const octez = tickerOctezSignal(latest.producer, data?.octezVersions);
    const signature = [
        latest.level,
        latest.producer?.address || producerName,
        latest.power,
        latest.committee,
        latest.blockRound,
        octez.value,
        octez.className,
        octez.latestVersion
    ].join(':');
    const octezTitle = octez.known
        ? ` Octez ${octez.value}: ${octez.label}${octez.latestVersion ? `; latest observed ${octez.latestVersion}.` : '.'}`
        : ' Octez version unavailable for this baker.';
    const title = `Block ${formatCount(latest.level)} baked by ${producerName}. ${status.label}: ${formatCount(latest.power)} / ${formatCount(latest.committee)} attested, ${formatCount(latest.missedPower)} missed, round ${formatCount(latest.blockRound)}.${octezTitle}`;

    strip.dataset.blockHealth = status.className;
    button.title = title;
    button.setAttribute('aria-label', `Open Network Health Chamber. ${title}`);

    if (line.dataset.blockTickerSignature === signature) {
        refreshHealthAgeLabels(strip);
        return;
    }

    const previousSignature = line.dataset.blockTickerSignature || '';
    line.dataset.blockTickerSignature = signature;
    line.innerHTML = renderBlockTickerLine(latest, timestamp, data?.octezVersions);
    animateBlockTicker(strip, line, Boolean(previousSignature && previousSignature !== signature));
}

function wireCycleChipHealthLauncher() {
    const chip = document.getElementById('cycle-chip');
    if (!chip || chip.dataset.healthChamberWired) return;

    chip.dataset.healthChamberWired = '1';
    chip.addEventListener('click', (event) => {
        event.preventDefault();
        openNetworkHealthChamber();
    });
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

function getSavedMyBakerAddress() {
    try {
        return localStorage.getItem(MY_BAKER_STORAGE_KEY) || '';
    } catch {
        return '';
    }
}

function bakerAddressMatches(baker, address) {
    return Boolean(address && baker?.address === address);
}

function findBakerDisplayName(data, address) {
    if (!address) return '';
    const blockBaker = data.blocks.find((block) => bakerAddressMatches(block.producer, address))?.producer;
    if (blockBaker) return bakerName(blockBaker);
    const missedBlockBaker = data.missedBlocks.find((right) => bakerAddressMatches(right.baker, address))?.baker;
    if (missedBlockBaker) return bakerName(missedBlockBaker);
    const missedAttester = data.missedAttesters.find((item) => item.address === address);
    return missedAttester?.name || shortAddress(address);
}

function summarizeMyTezosBaker(data) {
    const address = getSavedMyBakerAddress();
    if (!address) return null;

    const missedAttestations = data.missedAttestations.filter((right) => bakerAddressMatches(right.baker, address));
    const missedBlocks = data.missedBlocks.filter((right) => bakerAddressMatches(right.baker, address));
    const latestBlock = data.blocks.find((block) => bakerAddressMatches(block.producer, address)) || null;
    const missedSlots = missedAttestations.reduce((sum, right) => sum + right.slots, 0);

    let label = 'Clear in sample';
    let className = 'healthy';
    let copy = latestBlock
        ? `Produced block ${formatCount(latestBlock.level)} ${formatAge(latestBlock.timestamp)} with no missed rights in this sample.`
        : 'No missed rights in this sample; not among the most recent block producers.';

    if (missedBlocks.length) {
        label = 'Missed block';
        className = 'degraded';
        copy = `${formatCount(missedBlocks.length)} missed baking right in the recent lookback.`;
    } else if (missedSlots) {
        label = 'Missed attestations';
        className = 'watch';
        copy = `${formatCount(missedSlots)} attestation power missed in the current block sample.`;
    }

    return {
        address,
        name: findBakerDisplayName(data, address),
        missedSlots,
        missedBlockCount: missedBlocks.length,
        latestBlock,
        label,
        className,
        copy
    };
}

async function fetchJson(url, retries = 2) {
    return fetchWithRetry(url, { cache: 'no-store', memoryCache: false }, retries + 1);
}

function formatMilliseconds(value) {
    if (!Number.isFinite(value)) return '--';
    return formatSeconds(value / 1000);
}

function teztaleUrl(path) {
    const base = String(TEZTALE || '').replace(/\/+$/, '');
    const cleanPath = String(path || '').replace(/^\/+/, '');
    return `${base}/${cleanPath}`;
}

async function fetchTeztaleJson(path, retries = 1) {
    if (!TEZTALE) throw new Error('Teztale endpoint is not configured');
    return fetchJson(teztaleUrl(path), retries);
}

function timestampMs(value) {
    const ms = new Date(value || '').getTime();
    return Number.isFinite(ms) ? ms : null;
}

function minFinite(values) {
    const finite = values.filter(Number.isFinite);
    return finite.length ? Math.min(...finite) : null;
}

function averageFinite(values) {
    const finite = values.filter(Number.isFinite);
    return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null;
}

function teztaleReceptionMs(operation) {
    return minFinite((operation?.received_in_mempools || [])
        .map((item) => timestampMs(item.reception_time))
        .filter(Number.isFinite));
}

function teztaleBlockDelayMs(block, key) {
    const timestamp = timestampMs(block?.timestamp);
    if (timestamp === null) return null;
    const observed = minFinite((block?.reception_times || [])
        .map((item) => timestampMs(item[key]))
        .filter(Number.isFinite));
    return observed === null ? null : observed - timestamp;
}

function teztalePowerByDelegate(data) {
    const powers = new Map();
    (data?.endorsements || []).forEach((item) => {
        if (!item?.delegate) return;
        powers.set(item.delegate, Math.max(1, Number(item.endorsing_power) || 1));
    });
    return powers;
}

function teztaleSourceCount(data) {
    const sources = new Set();
    (data?.blocks || []).forEach((block) => {
        (block.reception_times || []).forEach((item) => {
            if (item?.source) sources.add(item.source);
        });
    });
    (data?.endorsements || []).forEach((endorsement) => {
        (endorsement.operations || []).forEach((operation) => {
            (operation.received_in_mempools || []).forEach((item) => {
                if (item?.source) sources.add(item.source);
            });
        });
    });
    return sources.size;
}

function teztaleThresholdDelayMs(entries, powers, threshold) {
    const totalPower = [...powers.values()].reduce((sum, value) => sum + value, 0);
    if (!totalPower) return null;
    const target = totalPower * threshold;
    const sorted = entries
        .filter((entry) => Number.isFinite(entry.delayMs))
        .sort((a, b) => a.delayMs - b.delayMs);
    let observedPower = 0;
    for (const entry of sorted) {
        observedPower += powers.get(entry.delegate) || 1;
        if (observedPower >= target) return entry.delayMs;
    }
    return null;
}

function emptyTeztaleRound(level, round, block, sourceCount, powers) {
    const totalPower = [...powers.values()].reduce((sum, value) => sum + value, 0);
    return {
        level,
        round,
        blockHash: block?.hash || '',
        baker: block?.delegate || '',
        timestamp: block?.timestamp || null,
        validationDelayMs: teztaleBlockDelayMs(block, 'validation'),
        applicationDelayMs: teztaleBlockDelayMs(block, 'application'),
        sourceCount,
        missingBlocks: 0,
        validOps: 0,
        lostOps: 0,
        heldOps: 0,
        erroneousOps: 0,
        silentDelegates: 0,
        delegateCount: powers.size,
        totalPower,
        preattestations: [],
        attestations: [],
        powers
    };
}

function summarizeTeztaleLevel(item) {
    const level = Number(item?.level) || 0;
    const data = item?.data || {};
    const powers = teztalePowerByDelegate(data);
    const sourceCount = teztaleSourceCount(data);
    const byRound = new Map();
    const ensureRound = (round, block = null) => {
        const key = Number.isFinite(Number(round)) ? Number(round) : 0;
        if (!byRound.has(key)) {
            byRound.set(key, emptyTeztaleRound(level, key, block, sourceCount, powers));
        } else if (block) {
            const row = byRound.get(key);
            row.blockHash = block.hash || row.blockHash;
            row.baker = block.delegate || row.baker;
            row.timestamp = block.timestamp || row.timestamp;
            row.validationDelayMs = teztaleBlockDelayMs(block, 'validation');
            row.applicationDelayMs = teztaleBlockDelayMs(block, 'application');
        }
        return byRound.get(key);
    };

    (data.blocks || []).forEach((block) => ensureRound(numericRound(block.round), block));
    if (!byRound.size) ensureRound(0, null);

    (data.missing_blocks || []).forEach((missing) => {
        const row = ensureRound(missing?.baking_right?.round || 0);
        row.missingBlocks += 1;
        if (!row.baker && missing?.baking_right?.delegate) row.baker = missing.baking_right.delegate;
    });

    (data.endorsements || []).forEach((endorsement) => {
        const operations = endorsement.operations || [];
        if (!operations.length) {
            ensureRound(0).silentDelegates += 1;
            return;
        }

        operations.forEach((operation) => {
            const row = ensureRound(operation.round || 0);
            const receptionMs = teztaleReceptionMs(operation);
            const blockTimestampMs = timestampMs(row.timestamp);
            const delayMs = receptionMs !== null && blockTimestampMs !== null
                ? receptionMs - blockTimestampMs
                : null;
            const entry = { delegate: endorsement.delegate, delayMs };
            const hasErrors = (operation.received_in_mempools || []).some((item) => Boolean(item.errors));
            const included = (operation.included_in_blocks || []).length > 0;

            if (operation.kind === 'Preendorsement') {
                row.preattestations.push(entry);
            } else {
                row.attestations.push(entry);
            }

            if (hasErrors) row.erroneousOps += 1;
            if (receptionMs === null && included) {
                row.heldOps += 1;
            } else if (receptionMs !== null && !included && operation.kind !== 'Preendorsement') {
                row.lostOps += 1;
            } else {
                row.validOps += 1;
            }
        });
    });

    return [...byRound.values()].map((row) => {
        const preQuorumMs = teztaleThresholdDelayMs(row.preattestations, row.powers, TEZTALE_QUORUM_TARGET);
        const quorumMs = teztaleThresholdDelayMs(row.attestations, row.powers, TEZTALE_QUORUM_TARGET);
        const preattestationCount = row.preattestations.length;
        const attestationCount = row.attestations.length;
        return {
            ...row,
            preattestationCount,
            attestationCount,
            complete: Number.isFinite(quorumMs) && attestationCount > 0,
            preQuorumMs,
            quorumMs,
            pre90Ms: teztaleThresholdDelayMs(row.preattestations, row.powers, 0.9),
            quorum90Ms: teztaleThresholdDelayMs(row.attestations, row.powers, 0.9),
            powers: undefined,
            preattestations: undefined,
            attestations: undefined
        };
    });
}

function teztaleFallback(error = '') {
    return {
        available: false,
        label: 'Unavailable',
        className: 'unknown',
        error,
        sourceUrl: TEZTALE_REPORT_URL,
        creditUrl: TEZTALE_SOURCE_URL
    };
}

function buildTeztaleLens(batch, teztaleHeadLevel) {
    const rows = (Array.isArray(batch) ? batch : [])
        .flatMap(summarizeTeztaleLevel)
        .filter((row) => row.level > 0)
        .sort((a, b) => b.level - a.level || b.round - a.round);
    const latestRaw = rows[0] || null;
    const completeRows = rows.filter((row) => row.complete);
    const latest = completeRows[0] || rows.find((row) => Number.isFinite(row.validationDelayMs)) || latestRaw;
    if (!latest) return teztaleFallback('No recent Teztale block data returned');

    const recentRows = (completeRows.length ? completeRows : rows).slice(0, TEZTALE_BLOCK_LOOKBACK);
    const sampleLevelCount = new Set(rows.map((row) => row.level)).size;
    const pendingHeadLevel = latestRaw && latestRaw.level > latest.level ? latestRaw.level : null;
    const alertSampleRows = rows.slice(0, Math.max(TEZTALE_BLOCK_LOOKBACK, recentRows.length + 2));
    const maxRound = alertSampleRows.reduce((max, row) => Math.max(max, row.round), 0);
    const maxQuorumMs = Math.max(...recentRows.map((row) => row.quorumMs).filter(Number.isFinite), 0);
    const maxValidationMs = Math.max(...alertSampleRows.map((row) => row.validationDelayMs).filter(Number.isFinite), 0);
    const alertRows = alertSampleRows.filter((row) => (
        row.round > 0
        || row.missingBlocks > 0
        || (row.quorumMs || 0) > 7000
        || (row.validationDelayMs || 0) > 3000
    ));

    let className = 'healthy';
    let label = 'Comfortable';
    if (maxRound > 1 || maxQuorumMs > 8000 || maxValidationMs > 3500 || recentRows.some((row) => row.missingBlocks > 0)) {
        className = 'degraded';
        label = 'Investigate';
    } else if (maxRound > 0 || maxQuorumMs > 6000 || maxValidationMs > 2200 || alertRows.length) {
        className = 'watch';
        label = 'Watch';
    } else if (maxQuorumMs <= 3000 && maxValidationMs <= 1200) {
        className = 'peak';
        label = 'Comfortable';
    }

    return {
        available: true,
        className,
        label,
        teztaleHeadLevel,
        windowCount: recentRows.length,
        completeCount: completeRows.length,
        sampleLevelCount,
        pendingHeadLevel,
        latest,
        avgPreQuorumMs: averageFinite(recentRows.map((row) => row.preQuorumMs)),
        avgQuorumMs: averageFinite(recentRows.map((row) => row.quorumMs)),
        maxQuorumMs,
        maxValidationMs,
        maxRound,
        lostOps: recentRows.reduce((sum, row) => sum + row.lostOps, 0),
        heldOps: recentRows.reduce((sum, row) => sum + row.heldOps, 0),
        erroneousOps: recentRows.reduce((sum, row) => sum + row.erroneousOps, 0),
        silentDelegates: recentRows.reduce((sum, row) => sum + row.silentDelegates, 0),
        missingBlocks: recentRows.reduce((sum, row) => sum + row.missingBlocks, 0),
        reportMode: alertRows.length ? 'alerts' : 'recent',
        reportRows: (alertRows.length ? alertRows : recentRows).slice(0, 5),
        sourceUrl: `${TEZTALE_REPORT_URL}#block=${latest.level}&round=${latest.round}&server=${encodeURIComponent(TEZTALE)}`,
        creditUrl: TEZTALE_SOURCE_URL
    };
}

async function fetchTeztaleConsensusLens(tzktHeadLevel = 0) {
    try {
        const head = await fetchTeztaleJson('head.json', 1);
        const teztaleHeadLevel = Number(head?.level) || Number(tzktHeadLevel) || 0;
        if (!teztaleHeadLevel) return teztaleFallback('No Teztale head level returned');
        const first = Math.max(1, teztaleHeadLevel - TEZTALE_BLOCK_LOOKBACK + 1);
        const batch = await fetchTeztaleJson(`${first}-${teztaleHeadLevel}.json`, 1);
        return buildTeztaleLens(batch, teztaleHeadLevel);
    } catch (error) {
        console.warn('Network Health Teztale consensus lens failed:', error);
        return teztaleFallback(error?.message || 'Teztale fetch failed');
    }
}

function normalizeActivityTx(tx) {
    const amountMutez = Number(tx.amount);
    const method = tx.parameter?.entrypoint || tx.entrypoint || 'transfer';
    return {
        hash: tx.hash || '',
        timestamp: tx.timestamp || null,
        amount: Number.isFinite(amountMutez) ? amountMutez / 1e6 : null,
        method,
        sender: bakerName(tx.sender),
        target: bakerName(tx.target)
    };
}

function collapseActivityRows(rows, limit = 8) {
    const collapsed = [];
    for (const row of rows || []) {
        const previous = collapsed[collapsed.length - 1];
        const sameAsPrevious = previous
            && previous.method === row.method
            && previous.target === row.target
            && previous.amount === row.amount;
        if (sameAsPrevious) {
            previous.count += 1;
            previous.hashes.push(row.hash);
            continue;
        }
        collapsed.push({ ...row, count: 1, hashes: [row.hash] });
        if (collapsed.length >= limit) break;
    }
    return collapsed;
}

function activityMethodLabel(row) {
    return row.count > 1 ? `${row.method} x${row.count}` : row.method;
}

async function fetchActivityTape({ force = false } = {}) {
    if (!force && activityTapeCache.length && Date.now() - activityTapeCacheAt < ACTIVITY_TAPE_TTL) {
        return activityTapeCache;
    }
    if (activityTapeInFlight) return activityTapeInFlight;

    const url = `${TZKT}/operations/transactions?status=applied&amount.ge=1000000000&sort.desc=id&limit=${ACTIVITY_TAPE_LIMIT}`;
    activityTapeInFlight = fetchJson(url)
        .then((rows) => {
            activityTapeCache = (Array.isArray(rows) ? rows : []).map(normalizeActivityTx);
            activityTapeCacheAt = Date.now();
            return activityTapeCache;
        })
        .catch((error) => {
            console.warn('Network Health activity tape failed:', error);
            return activityTapeCache;
        })
        .finally(() => {
            activityTapeInFlight = null;
        });

    return activityTapeInFlight;
}

function normalizeOctezSoftware(software) {
    const rawVersion = typeof software === 'string' ? software : software?.version;
    const rawDate = typeof software === 'object' && software ? software.date : null;
    const version = String(rawVersion || '').trim();
    const known = Boolean(version) && !/^unknown$/i.test(version) && !/^octez$/i.test(version);
    return {
        known,
        version: known ? version : 'Unknown',
        date: rawDate || null
    };
}

function versionParts(version) {
    const parts = String(version || '').match(/\d+/g);
    return parts ? parts.map((part) => Number(part)) : [];
}

function compareVersionLabels(a, b) {
    const left = versionParts(a);
    const right = versionParts(b);
    if (!left.length && !right.length) return String(a || '').localeCompare(String(b || ''));
    if (!left.length) return -1;
    if (!right.length) return 1;
    const length = Math.max(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
        const delta = (left[index] || 0) - (right[index] || 0);
        if (delta) return delta;
    }
    return String(a || '').localeCompare(String(b || ''));
}

export function classifyOctezVersion(version, latestVersion) {
    const current = String(version || '').trim();
    const latest = String(latestVersion || '').trim();
    if (!current || /^unknown$/i.test(current) || !latest || /^unknown$/i.test(latest)) {
        return {
            state: 'unknown',
            className: 'unknown',
            label: 'Unknown',
            latestVersion: latest || 'Unknown'
        };
    }

    const comparison = compareVersionLabels(current, latest);
    if (comparison >= 0) {
        return {
            state: 'ok',
            className: 'current',
            label: current === latest ? 'Latest observed' : 'Newer than latest observed',
            latestVersion: latest
        };
    }

    const currentParts = versionParts(current);
    const latestParts = versionParts(latest);
    const currentMajor = currentParts[0] || 0;
    const latestMajor = latestParts[0] || 0;
    if (latestMajor > currentMajor) {
        return {
            state: 'issue',
            className: 'critical',
            label: 'Major upgrade behind',
            latestVersion: latest
        };
    }

    return {
        state: 'watch',
        className: 'watch',
        label: 'Behind latest observed',
        latestVersion: latest
    };
}

function normalizeOctezVersionBaker(row) {
    const software = normalizeOctezSoftware(row?.software);
    return {
        address: row?.address || '',
        alias: row?.alias || '',
        bakingPower: Math.max(0, Number(row?.bakingPower) || 0),
        software
    };
}

function octezVersionsFallback(error = '') {
    return {
        available: false,
        label: 'Unavailable',
        className: 'unknown',
        error,
        latestVersion: 'Unknown',
        latestPowerShare: null,
        totalBakers: 0,
        knownBakers: 0,
        totalPower: 0,
        latestPower: 0,
        outdatedPower: 0,
        bakers: [],
        versionRows: [],
        laggingBakers: [],
        freshestDate: null
    };
}

function buildOctezVersions(rows) {
    const bakers = (Array.isArray(rows) ? rows : [])
        .map(normalizeOctezVersionBaker)
        .filter((baker) => baker.address && baker.bakingPower > 0);
    if (!bakers.length) return octezVersionsFallback('No active baker software data returned');

    const totalPower = bakers.reduce((sum, baker) => sum + baker.bakingPower, 0);
    const groups = new Map();
    let freshestDate = null;

    for (const baker of bakers) {
        const key = baker.software.version;
        const current = groups.get(key) || {
            version: key,
            known: baker.software.known,
            bakerCount: 0,
            power: 0,
            latestDate: null
        };
        current.bakerCount += 1;
        current.power += baker.bakingPower;
        if (baker.software.date) {
            const dateMs = new Date(baker.software.date).getTime();
            const currentMs = current.latestDate ? new Date(current.latestDate).getTime() : 0;
            const freshestMs = freshestDate ? new Date(freshestDate).getTime() : 0;
            if (Number.isFinite(dateMs) && dateMs > currentMs) current.latestDate = baker.software.date;
            if (Number.isFinite(dateMs) && dateMs > freshestMs) freshestDate = baker.software.date;
        }
        groups.set(key, current);
    }

    const knownVersions = [...groups.values()]
        .filter((group) => group.known)
        .map((group) => group.version)
        .sort(compareVersionLabels);
    const latestVersion = knownVersions[knownVersions.length - 1] || 'Unknown';
    const latestPower = latestVersion === 'Unknown' ? 0 : (groups.get(latestVersion)?.power || 0);
    const latestPowerShare = totalPower > 0 ? (latestPower / totalPower) * 100 : 0;
    const versionRows = [...groups.values()].map((group) => ({
        ...group,
        powerShare: totalPower > 0 ? (group.power / totalPower) * 100 : 0,
        current: group.version === latestVersion && group.known
    })).sort((a, b) => {
        if (a.current !== b.current) return a.current ? -1 : 1;
        if (a.known !== b.known) return a.known ? -1 : 1;
        const versionDelta = compareVersionLabels(b.version, a.version);
        return versionDelta || b.power - a.power;
    });

    const laggingBakers = bakers
        .filter((baker) => !baker.software.known || baker.software.version !== latestVersion)
        .sort((a, b) => b.bakingPower - a.bakingPower)
        .slice(0, 5);

    let className = 'degraded';
    let label = 'Upgrade gap';
    if (latestPowerShare >= 90) {
        className = 'peak';
        label = 'Broadly current';
    } else if (latestPowerShare >= 75) {
        className = 'healthy';
        label = 'Mostly current';
    } else if (latestPowerShare >= 50) {
        className = 'watch';
        label = 'Split fleet';
    }

    return {
        available: true,
        className,
        label,
        latestVersion,
        latestPowerShare,
        totalBakers: bakers.length,
        knownBakers: bakers.filter((baker) => baker.software.known).length,
        totalPower,
        latestPower,
        outdatedPower: Math.max(0, totalPower - latestPower),
        bakers,
        versionRows,
        laggingBakers,
        freshestDate
    };
}

export async function fetchOctezVersions({ force = false } = {}) {
    if (!force && octezVersionsCache && Date.now() - octezVersionsCacheAt < OCTEZ_VERSIONS_TTL) {
        return octezVersionsCache;
    }
    if (octezVersionsInFlight) return octezVersionsInFlight;

    octezVersionsInFlight = (async () => {
        const fields = 'address,alias,bakingPower,software';
        const rows = [];
        let offset = 0;
        while (true) {
            const url = `${TZKT}/delegates?active=true&select=${fields}&sort.desc=bakingPower&limit=${OCTEZ_VERSION_PAGE_LIMIT}&offset=${offset}`;
            const page = await fetchJson(url, 1);
            if (!Array.isArray(page)) break;
            rows.push(...page);
            if (page.length < OCTEZ_VERSION_PAGE_LIMIT) break;
            offset += OCTEZ_VERSION_PAGE_LIMIT;
        }
        octezVersionsCache = buildOctezVersions(rows);
        octezVersionsCacheAt = Date.now();
        return octezVersionsCache;
    })().catch((error) => {
        console.warn('Network Health Octez version telemetry failed:', error);
        return octezVersionsCache || octezVersionsFallback(error?.message || 'TzKT delegate software fetch failed');
    }).finally(() => {
        octezVersionsInFlight = null;
    });

    return octezVersionsInFlight;
}

async function fetchProtocolCycleTargetSeconds() {
    if (protocolConstantsCache && Date.now() - protocolConstantsCacheAt < PROTOCOL_CONSTANTS_TTL) {
        return protocolConstantsCache;
    }

    try {
        const constants = await fetchJson(`${API_URLS.octez}/chains/main/blocks/head/context/constants`, 1);
        const blockDelay = Array.isArray(constants?.minimal_block_delay)
            ? Number(constants.minimal_block_delay[0])
            : Number(constants?.minimal_block_delay);
        const blocksPerCycle = Number(constants?.blocks_per_cycle);
        const target = blocksPerCycle > 0 && blockDelay > 0
            ? blocksPerCycle * blockDelay
            : CYCLE_TARGET_SECONDS_FALLBACK;
        protocolConstantsCache = target;
        protocolConstantsCacheAt = Date.now();
        return target;
    } catch (error) {
        console.warn('Network Health cycle target lookup failed:', error);
        return protocolConstantsCache || CYCLE_TARGET_SECONDS_FALLBACK;
    }
}

function normalizeCycleRow(row) {
    const timestampMs = new Date(row?.timestamp).getTime();
    return {
        cycle: Number(row?.cycle),
        level: Number(row?.level) || 0,
        timestamp: row?.timestamp || null,
        timestampMs
    };
}

function buildCycleTiming(rows, targetSeconds) {
    const sorted = (Array.isArray(rows) ? rows : [])
        .map(normalizeCycleRow)
        .filter((row) => Number.isFinite(row.cycle) && Number.isFinite(row.timestampMs))
        .sort((a, b) => b.cycle - a.cycle);
    const intervals = [];

    for (let index = 0; index < sorted.length - 1; index += 1) {
        const later = sorted[index];
        const earlier = sorted[index + 1];
        const seconds = (later.timestampMs - earlier.timestampMs) / 1000;
        if (!Number.isFinite(seconds) || seconds <= 0) continue;
        const driftSeconds = seconds - targetSeconds;
        const driftPct = targetSeconds > 0 ? (driftSeconds / targetSeconds) * 100 : 0;
        intervals.push({
            cycle: earlier.cycle,
            start: earlier.timestamp,
            end: later.timestamp,
            seconds,
            driftSeconds,
            driftPct,
            className: cycleTimingClass(driftPct),
            label: cycleTimingLabel(driftPct)
        });
    }

    const latest = intervals[0] || null;
    const averageSeconds = intervals.length
        ? intervals.reduce((sum, interval) => sum + interval.seconds, 0) / intervals.length
        : null;
    const averageDriftPct = Number.isFinite(averageSeconds) && targetSeconds > 0
        ? ((averageSeconds - targetSeconds) / targetSeconds) * 100
        : null;
    const worst = intervals.reduce((candidate, interval) => (
        !candidate || Math.abs(interval.driftPct) > Math.abs(candidate.driftPct) ? interval : candidate
    ), null);

    return {
        updatedAt: Date.now(),
        targetSeconds,
        latest,
        averageSeconds,
        averageDriftPct,
        worst,
        intervals
    };
}

async function fetchCycleTiming({ force = false } = {}) {
    if (!force && cycleTimingCache && Date.now() - cycleTimingCacheAt < CYCLE_TIMING_TTL) {
        return cycleTimingCache;
    }
    if (cycleTimingInFlight) return cycleTimingInFlight;

    const url = `${TZKT}/statistics/cyclic?limit=${CYCLE_TIMING_LIMIT}&sort.desc=cycle&select=cycle,level,timestamp`;
    cycleTimingInFlight = Promise.all([
        fetchJson(url, 2),
        fetchProtocolCycleTargetSeconds()
    ]).then(([rows, targetSeconds]) => {
        cycleTimingCache = buildCycleTiming(rows, targetSeconds);
        cycleTimingCacheAt = Date.now();
        return cycleTimingCache;
    }).catch((error) => {
        console.warn('Network Health cycle timing failed:', error);
        return cycleTimingCache;
    }).finally(() => {
        cycleTimingInFlight = null;
    });

    return cycleTimingInFlight;
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
    const [lastBlocks, cycleTiming, octezVersions] = await Promise.all([
        fetchLastBlocks(),
        fetchCycleTiming(),
        fetchOctezVersions()
    ]);
    const summary = summarizeBlocks(lastBlocks);
    const headLevel = lastBlocks[0]?.level || 0;
    const headTimestamp = lastBlocks[0]?.timestamp || null;
    const now = new Date();

    let periods = cachedData?.periods || [];
    const shouldFetchPeriods = forcePeriods || !periodCacheIsFresh(cachedData) || !periods.length;

    if (headLevel && shouldFetchPeriods) {
        periods = await Promise.all(PERIODS.map((period) => fetchPeriod(period, headLevel, now)));
        lastFullFetch = Date.now();
    }

    return {
        updatedAt: Date.now(),
        headTimestamp,
        periodUpdatedAt: shouldFetchPeriods ? Date.now() : (cachedData?.periodUpdatedAt || 0),
        headLevel,
        blocks: lastBlocks,
        summary,
        periods,
        cycleTiming,
        octezVersions: octezVersions || cachedData?.octezVersions || null
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

function healthVerdict(data) {
    const status = chamberStatus(data);
    const score = Number(data.summary?.score || 0);
    const avgSeconds = Number(data.timing?.avgSeconds || 0);
    const maxRound = Number(data.timing?.maxRound || 0);
    const missedBlocks = data.missedBlocks?.length || 0;
    const head = data.blocks?.[0]?.level ? `head ${formatCount(data.blocks[0].level)}` : 'live head pending';
    const powerText = score ? `${score.toFixed(score >= 99.5 ? 2 : 1)}% attestation power` : 'attestation power warming up';

    if (status.label === 'Healthy') {
        return {
            ...status,
            tone: 'green',
            sentence: `Everything looks OK: recent blocks are landing near target with ${powerText}.`,
            meta: `${head} · avg ${formatSeconds(avgSeconds)} · round ${maxRound}`
        };
    }
    if (status.label === 'Watch') {
        const reason = missedBlocks
            ? `${missedBlocks} missed block signal${missedBlocks === 1 ? '' : 's'} in the sample`
            : maxRound > 0
                ? `a recent non-zero round reached R${maxRound}`
                : `average cadence is ${formatSeconds(avgSeconds)}`;
        return {
            ...status,
            tone: 'amber',
            sentence: `The chain is moving, but worth watching: ${reason}.`,
            meta: `${head} · ${powerText}`
        };
    }
    return {
        ...status,
        tone: 'red',
        sentence: `Network health needs attention: cadence, rounds, or attestation power are outside the comfort zone.`,
        meta: `${head} · avg ${formatSeconds(avgSeconds)} · ${powerText}`
    };
}

function renderHealthVerdictPanel(data) {
    const verdict = healthVerdict(data);
    return `
        <section class="health-verdict-panel ${escapeHtml(verdict.tone)} chamber-anim-fade" id="health-verdict-panel" aria-label="Network health verdict" style="animation-delay:90ms">
            <div class="health-verdict-status">
                <span class="health-verdict-dot" aria-hidden="true"></span>
                <span>${escapeHtml(verdict.label)}</span>
            </div>
            <div class="health-verdict-copy">
                <strong>${escapeHtml(verdict.sentence)}</strong>
                <span>${escapeHtml(verdict.meta)}</span>
            </div>
        </section>
    `;
}

function updateHealthVerdictPanel(data) {
    const panel = document.getElementById('health-verdict-panel');
    if (!panel) return;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = renderHealthVerdictPanel(data).trim();
    const next = wrapper.firstElementChild;
    if (next) panel.replaceWith(next);
}

async function fetchNetworkHealthChamberData() {
    const [blocks, cycleTiming] = await Promise.all([
        fetchRecentBlocks(CHAMBER_BLOCK_LIMIT),
        fetchCycleTiming()
    ]);
    const summary = summarizeBlocks(blocks);
    const timing = summarizeTiming(blocks);
    const headLevel = blocks[0]?.level || 0;
    const headTimestamp = blocks[0]?.timestamp || null;
    const oldestLevel = blocks[blocks.length - 1]?.level || headLevel;
    const missedBlockStart = Math.max(1, headLevel - MISSED_BLOCK_LOOKBACK);
    const octezVersionsPromise = fetchOctezVersions();
    let missedAttestations = [];
    let missedBlocks = [];
    let activityTape = [];
    let teztaleLens = teztaleFallback('TzKT head level unavailable');
    let octezVersions = null;

    if (headLevel) {
        [missedAttestations, missedBlocks, activityTape, teztaleLens, octezVersions] = await Promise.all([
            fetchMissedRights('attestation', oldestLevel, headLevel),
            fetchMissedRights('baking', missedBlockStart, headLevel, 30),
            fetchActivityTape(),
            fetchTeztaleConsensusLens(headLevel),
            octezVersionsPromise
        ]);
    } else {
        octezVersions = await octezVersionsPromise;
    }

    return {
        updatedAt: Date.now(),
        headTimestamp,
        headLevel,
        oldestLevel,
        blocks,
        summary,
        timing,
        missedAttestations,
        missedAttesters: summarizeMissedAttesters(missedAttestations),
        missedBlocks,
        activityTape,
        teztaleLens,
        octezVersions,
        periods: cachedData?.periods || [],
        cycleTiming: cycleTiming || cachedData?.cycleTiming || null
    };
}

function renderBlock(block) {
    const cls = healthClass(block.score);
    const levelTail = block.level ? String(block.level).slice(-3).padStart(3, '0') : '---';
    const width = Math.max(2, Math.min(100, block.score));
    const title = `Block ${block.level.toLocaleString()}: ${block.power.toLocaleString()} / ${block.committee.toLocaleString()} power`;

    return `
        <div class="network-health-block ${cls}" title="${title}" aria-label="${title}">
            <span class="network-health-block-bar"><span style="height:${width}%"></span></span>
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

function renderCycleTimingBackRow(cycleTiming) {
    const latest = cycleTiming?.latest;
    if (!latest) return '';
    const title = `Cycle ${formatCount(latest.cycle)} ran ${formatDuration(latest.seconds)}, ${formatSignedDuration(latest.driftSeconds)} vs protocol target`;
    return `
        <div class="network-health-back-row network-health-cycle-row">
            <span>Last cycle</span>
            <strong title="${escapeHtml(title)}">${formatDuration(latest.seconds)} · ${formatSignedPct(latest.driftPct)}</strong>
        </div>
    `;
}

function renderCycleTimingCell(interval) {
    const title = `Cycle ${formatCount(interval.cycle)}: ${formatDuration(interval.seconds)}, ${formatSignedDuration(interval.driftSeconds)} vs target`;
    return `
        <span class="health-cycle-cell ${interval.className}" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">
            <span>C${formatCount(interval.cycle)}</span>
            <strong>${formatDuration(interval.seconds)}</strong>
        </span>
    `;
}

function renderCycleTimingPanel(data) {
    const timing = data?.cycleTiming;
    const latest = timing?.latest;
    if (!latest) {
        return `
            <section class="lb-panel health-panel health-cycle-panel chamber-anim-fade" id="health-cycle-timing" style="animation-delay:120ms">
                <div class="lb-panel-title">Cycle Timing <span class="lb-live-pill">TzKT cyclic</span></div>
                <div class="lb-empty-inline">Cycle timing is warming up from TzKT cyclic statistics.</div>
            </section>
        `;
    }

    const cls = cycleTimingClass(latest.driftPct);
    const average = Number.isFinite(timing.averageSeconds) ? formatDuration(timing.averageSeconds) : '--';
    const averageDrift = Number.isFinite(timing.averageDriftPct) ? formatSignedPct(timing.averageDriftPct) : '--';
    const worst = timing.worst;
    const cells = timing.intervals.slice(0, 6).map(renderCycleTimingCell).join('');

    return `
        <section class="lb-panel health-panel health-cycle-panel chamber-anim-fade" id="health-cycle-timing" style="animation-delay:120ms">
            <div class="lb-panel-title">Cycle Timing <span class="lb-live-pill">TzKT cyclic</span></div>
            <div class="health-cycle-hero ${cls}">
                <strong id="health-cycle-duration">${formatDuration(latest.seconds)}</strong>
                <span id="health-cycle-status">${escapeHtml(latest.label)} · ${formatSignedPct(latest.driftPct)} vs target</span>
            </div>
            <div class="lb-metric-grid health-metric-grid">
                <div><span>Last cycle</span><strong id="health-cycle-last">C${formatCount(latest.cycle)}</strong></div>
                <div><span>Target</span><strong id="health-cycle-target">${formatDuration(timing.targetSeconds)}</strong></div>
                <div><span>Recent avg</span><strong id="health-cycle-average">${average} · ${averageDrift}</strong></div>
            </div>
            <div class="health-cycle-strip" id="health-cycle-strip" aria-label="Recent completed cycle durations">${cells}</div>
            <div class="health-timing-note" id="health-cycle-note">
                Worst recent drift ${worst ? `${formatSignedPct(worst.driftPct)} on C${formatCount(worst.cycle)}` : '--'}; cycle-start deltas catch network-wide slowdowns without scanning every block.
            </div>
        </section>
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
        statusEl.title = 'Status combines recent attestation power, missed baking rights, block round, and cadence.';
    }

    blocksEl.innerHTML = data.blocks.map(renderBlock).join('');
    periodsEl.innerHTML = data.periods.map(renderPeriod).join('');

    if (backEl) {
        backEl.innerHTML = `${renderCycleTimingBackRow(data.cycleTiming)}${data.periods.map((period) => `
            <div class="network-health-back-row">
                <span>${period.label}</span>
                <strong>${formatCompactPower(period.actualPower)} / ${formatCompactPower(period.possiblePower)}</strong>
            </div>
        `).join('')}`;
    }

    if (descEl) {
        descEl.textContent = `${formatCompactPower(data.summary.totalPower)} / ${formatCompactPower(data.summary.totalCommittee)} power across last 5 blocks`;
    }

    const card = document.querySelector('.stat-card[data-stat="network-health"]');
    if (card) {
        const labelTimestamp = data.headTimestamp || data.updatedAt || Date.now();
        const freshnessTimestamp = data.updatedAt || Date.now();
        const time = new Date(labelTimestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' });
        card.dataset.updatedLabel = `as of ${time} UTC`;
        setDataFreshnessState(card, freshnessTimestamp, LIVE_REFRESH_INTERVAL * 2);
    }

    ensureHealthEntryTape();
    refreshNetworkHealthTape();
    updateBlockTicker(data);
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
    renderHealthEntryTape([]);
    updateBlockTicker(null, { error: true });
}

function ensureHealthEntryTape() {
    const card = document.querySelector('.stat-card[data-stat="network-health"]');
    const front = card?.querySelector('.card-front');
    if (!front) return null;

    let tape = document.getElementById('network-health-live-tape');
    if (!tape) {
        tape = document.createElement('div');
        tape.id = 'network-health-live-tape';
        tape.className = 'health-live-tape';
        tape.setAttribute('aria-label', 'Network activity live tape');
        tape.innerHTML = `
            <div class="health-live-tape-title">Live Tape</div>
            <div class="health-live-tape-rows" id="network-health-live-tape-rows">
                <div class="health-live-empty">Loading transfers</div>
            </div>
        `;
        front.appendChild(tape);
    }

    return tape;
}

function renderHealthEntryTape(rows) {
    const tape = ensureHealthEntryTape();
    const rowsEl = tape?.querySelector('#network-health-live-tape-rows');
    if (!rowsEl) return;

    if (!rows?.length) {
        rowsEl.innerHTML = '<div class="health-live-empty">Large transfers unavailable</div>';
        return;
    }

    rowsEl.innerHTML = collapseActivityRows(rows, 3).map((row) => `
        <div class="health-live-row">
            <span class="health-live-method">${escapeHtml(activityMethodLabel(row))}</span>
            <span class="health-live-amount">${row.amount === null ? '--' : `${formatCompactPower(row.amount)} XTZ`}</span>
            <span class="health-live-age"${healthAgeAttr(row.timestamp)}>${escapeHtml(formatAge(row.timestamp))}</span>
        </div>
    `).join('');
}

async function refreshNetworkHealthTape({ force = false } = {}) {
    const rows = await fetchActivityTape({ force });
    renderHealthEntryTape(rows);
    return rows;
}

function setTextIfChanged(target, value, { pulse = true } = {}) {
    const element = typeof target === 'string' ? document.querySelector(target) : target;
    if (!element) return false;
    const next = String(value ?? '');
    if (element.textContent === next) return false;
    element.textContent = next;
    if (pulse) {
        element.classList.remove('health-value-updated');
        void element.offsetWidth;
        element.classList.add('health-value-updated');
    }
    return true;
}

function setClassNameIfChanged(target, className) {
    const element = typeof target === 'string' ? document.querySelector(target) : target;
    if (!element || element.className === className) return false;
    element.className = className;
    return true;
}

function setHtmlIfSignatureChanged(target, html, signature, { softClass = 'health-soft-updated', pulse = false } = {}) {
    const element = typeof target === 'string' ? document.querySelector(target) : target;
    if (!element) return false;
    const nextSignature = String(signature ?? html);
    if (element.dataset.healthSignature === nextSignature) return false;
    element.dataset.healthSignature = nextSignature;
    element.innerHTML = html;
    if (pulse) {
        element.classList.remove(softClass);
        void element.offsetWidth;
        element.classList.add(softClass);
    }
    return true;
}

function renderHealthScorePanel(data) {
    const cls = healthClass(data.summary.score);
    const width = Math.max(2, Math.min(100, data.summary.score));
    const headTimestamp = getHeadTimestamp(data);
    return `
        <section class="lb-panel health-panel health-score-panel chamber-anim-fade">
            <div class="lb-panel-title">Consensus Power</div>
            <div class="health-hero-number ${cls}" id="health-hero-score">${formatPct(data.summary.score)}%</div>
            <div class="health-hero-copy" id="health-hero-copy">Last ${formatCount(data.summary.count)} blocks recorded ${formatCompactPower(data.summary.totalPower)} / ${formatCompactPower(data.summary.totalCommittee)} attestation power.</div>
            <div class="health-score-meter" aria-label="Recent attestation power">
                <div class="health-score-fill ${cls}" id="health-score-fill" style="width:${width.toFixed(2)}%"></div>
            </div>
            <div class="lb-metric-grid health-metric-grid">
                <div><span>Missed power</span><strong id="health-summary-missed">${formatCompactPower(data.summary.missingPower)}</strong></div>
                <div><span>Block range</span><strong id="health-summary-range">${formatCount(data.oldestLevel)} -> ${formatCount(data.headLevel)}</strong></div>
                <div><span>Updated</span><strong id="health-summary-updated"${healthAgeAttr(headTimestamp)}>${formatAge(headTimestamp)}</strong></div>
            </div>
        </section>
    `;
}

function renderContinuityProofPanel() {
    const runtimeHtml = document.getElementById('uptime-counter')?.innerHTML || '—';
    const bakersText = document.getElementById('uptime-bakers')?.textContent || '—';
    const finalityText = document.getElementById('uptime-finality')?.textContent || '12s';
    const stakedText = document.getElementById('uptime-staked')?.textContent || '—';
    const issuanceText = document.getElementById('uptime-issuance')?.textContent || '—';
    return `
        <section class="lb-panel health-panel health-continuity-panel chamber-anim-fade" id="health-chain-proof" aria-label="Tezos chain continuity proof" style="animation-delay:40ms">
            <div class="lb-panel-title">Continuity Proof <span class="lb-live-pill">zero forks · zero outages</span></div>
            <div class="health-continuity-runtime" id="chain-uptime-counter">${runtimeHtml}</div>
            <p class="health-continuity-copy">Mainnet keeps producing blocks while the protocol upgrades underneath it.</p>
            <div class="health-continuity-grid">
                <div>
                    <span>Bakers</span>
                    <strong id="chain-uptime-bakers">${escapeHtml(bakersText)}</strong>
                </div>
                <div>
                    <span>Finality</span>
                    <strong id="chain-uptime-finality">${escapeHtml(finalityText)}</strong>
                </div>
                <div>
                    <span>Staked</span>
                    <strong id="chain-uptime-staked">${escapeHtml(stakedText)}</strong>
                </div>
                <div>
                    <span>Issuance</span>
                    <strong id="chain-uptime-issuance">${escapeHtml(issuanceText)}</strong>
                </div>
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
                <div><span>On target</span><strong id="health-on-target">${formatPct(onTargetPct)}%</strong></div>
                <div><span>Round 0</span><strong id="health-round-zero">${formatPct(data.timing.roundZeroPct)}%</strong></div>
            </div>
            <div class="health-timing-strip" id="health-timing-strip" aria-label="Recent block intervals">${cells}</div>
            <div class="health-timing-note" id="health-timing-note">Max round ${formatCount(data.timing.maxRound)} across the live sample.</div>
        </section>
    `;
}

function renderTeztaleReportRows(lens) {
    if (!lens.reportRows?.length) {
        return '<div class="health-consensus-empty">Teztale is still collecting enough consensus data for a round summary.</div>';
    }
    return lens.reportRows.map((row) => `
        <div class="health-consensus-event ${row.round > 0 || row.missingBlocks ? 'watch' : 'healthy'}">
            <span>#${formatCount(row.level)} · R${formatCount(row.round)}</span>
            <strong>${formatMilliseconds(row.quorumMs)} quorum</strong>
            <em>${row.missingBlocks ? `${formatCount(row.missingBlocks)} missing block report` : `${formatCount(row.sourceCount)} src · validation ${formatMilliseconds(row.validationDelayMs)}`}</em>
        </div>
    `).join('');
}

function renderTeztaleConsensusPanel(data) {
    const lens = data.teztaleLens || teztaleFallback();
    if (!lens.available) {
        return `
            <section class="lb-panel health-panel health-consensus-panel chamber-anim-fade unavailable" id="health-teztale-consensus" style="animation-delay:120ms">
                <div class="lb-panel-title">Consensus Lens <span class="lb-live-pill">Teztale</span></div>
                <div class="health-consensus-empty">
                    Teztale consensus data is unavailable right now; core TzKT health remains live.
                </div>
                <div class="health-consensus-credit">
                    Credit: <a href="${TEZTALE_SOURCE_URL}" target="_blank" rel="noopener">Teztale by Nomadic Labs</a>
                </div>
            </section>
        `;
    }

    const latest = lens.latest;
    const levelLabel = `#${formatCount(latest.level)} · R${formatCount(latest.round)}`;
    const headStatus = lens.pendingHeadLevel
        ? ` · head #${formatCount(lens.pendingHeadLevel)} collecting`
        : '';
    const coverageReport = [
        `${formatCount(lens.windowCount)} complete rounds`,
        `${formatCount(lens.sampleLevelCount)} sampled levels`,
        `${formatCount(latest.totalPower)} power`
    ].join(' / ');
    const rowsLabel = lens.reportMode === 'alerts' ? 'Rounds to inspect' : 'Recent complete rounds';

    return `
        <section class="lb-panel health-panel health-consensus-panel chamber-anim-fade" id="health-teztale-consensus" style="animation-delay:120ms">
            <div class="lb-panel-title">Consensus Lens <span class="lb-live-pill">Teztale</span></div>
            <div class="health-consensus-hero ${lens.className}">
                <strong id="health-teztale-quorum">${formatMilliseconds(latest.quorumMs)}</strong>
                <span id="health-teztale-status">${escapeHtml(lens.label)} · 66% attestation quorum at ${escapeHtml(levelLabel)}${escapeHtml(headStatus)}</span>
            </div>
            <div class="lb-metric-grid health-metric-grid health-consensus-metrics">
                <div><span>Pre-quorum</span><strong id="health-teztale-prequorum">${formatMilliseconds(latest.preQuorumMs)}</strong></div>
                <div><span>Validation</span><strong id="health-teztale-validation">${formatMilliseconds(latest.validationDelayMs)}</strong></div>
                <div><span>Sources</span><strong id="health-teztale-source-count">${formatCount(latest.sourceCount)}</strong></div>
            </div>
            <div class="health-consensus-ops" id="health-teztale-ops">
                <span>Coverage</span>
                <strong>${escapeHtml(coverageReport)}</strong>
            </div>
            <div class="health-consensus-events-label">${escapeHtml(rowsLabel)}</div>
            <div class="health-consensus-events" id="health-teztale-events">
                ${renderTeztaleReportRows(lens)}
            </div>
            <div class="health-consensus-credit" id="health-teztale-credit">
                Powered by <a href="${escapeHtml(lens.sourceUrl)}" target="_blank" rel="noopener">Teztale consensus data</a>.
                Credit: <a href="${TEZTALE_SOURCE_URL}" target="_blank" rel="noopener">Nomadic Labs</a>.
            </div>
        </section>
    `;
}

function renderOctezVersionRows(rows) {
    if (!rows?.length) return '<div class="health-consensus-empty">No Octez version distribution returned.</div>';
    return rows.slice(0, 5).map((row) => {
        const width = Math.max(2, Math.min(100, row.powerShare || 0));
        return `
            <div class="health-octez-version-row ${row.current ? 'current' : ''}">
                <div class="health-octez-version-main">
                    <strong>${escapeHtml(row.version)}</strong>
                    <span>${row.current ? 'Latest observed' : `${formatCount(row.bakerCount)} bakers`}</span>
                </div>
                <div class="health-octez-version-meter" aria-hidden="true"><span style="width:${width.toFixed(2)}%"></span></div>
                <div class="health-octez-version-share">
                    <strong>${formatPct(row.powerShare)}%</strong>
                    <span>${formatBakingPower(row.power)}</span>
                </div>
            </div>
        `;
    }).join('');
}

function renderOctezLaggardRows(rows) {
    if (!rows?.length) {
        return '<div class="lb-empty-inline">All known baking power is on the latest observed Octez version.</div>';
    }
    return rows.map((baker) => `
        <div class="lb-table-row health-octez-laggard-row">
            <div class="lb-baker-cell">${bakerLinks(baker.address, bakerName(baker))}</div>
            <strong>${escapeHtml(baker.software.version)}</strong>
            <span>${formatBakingPower(baker.bakingPower)}</span>
        </div>
    `).join('');
}

function renderOctezVersionsPanel(data) {
    const versions = data.octezVersions || octezVersionsFallback();
    if (!versions.available) {
        return `
            <section class="lb-panel health-panel health-octez-panel chamber-anim-fade unavailable" id="health-octez-versions" style="animation-delay:135ms">
                <div class="lb-panel-title">Octez Versions <span class="lb-live-pill">TzKT delegates</span></div>
                <div class="health-consensus-empty">
                    Baker Octez version telemetry is unavailable right now; block and consensus health remain live.
                </div>
            </section>
        `;
    }

    return `
        <section class="lb-panel health-panel health-octez-panel chamber-anim-fade" id="health-octez-versions" style="animation-delay:135ms">
            <div class="lb-panel-title">Octez Versions <span class="lb-live-pill">TzKT delegates</span></div>
            <div class="health-octez-hero ${versions.className}">
                <strong id="health-octez-current">${escapeHtml(versions.latestVersion)}</strong>
                <span id="health-octez-status">${escapeHtml(versions.label)} · latest observed on ${formatPct(versions.latestPowerShare)}% of baking power</span>
            </div>
            <div class="lb-metric-grid health-metric-grid health-octez-metrics">
                <div><span>Latest power</span><strong id="health-octez-latest-power">${formatPct(versions.latestPowerShare)}%</strong></div>
                <div><span>Known bakers</span><strong id="health-octez-known">${formatCount(versions.knownBakers)} / ${formatCount(versions.totalBakers)}</strong></div>
                <div><span>Freshest report</span><strong id="health-octez-updated"${healthAgeAttr(versions.freshestDate)}>${formatAge(versions.freshestDate)}</strong></div>
            </div>
            <div class="health-octez-version-list" id="health-octez-version-list">
                ${renderOctezVersionRows(versions.versionRows)}
            </div>
            <div class="health-consensus-events-label">Largest not on latest observed</div>
            <div class="lb-table health-octez-laggard-table">
                <div class="lb-table-head"><span>Baker</span><span>Version</span><span>Power</span></div>
                <div id="health-octez-laggards">${renderOctezLaggardRows(versions.laggingBakers)}</div>
            </div>
            <div class="health-timing-note">TzKT delegate software reports observed baker node versions; use it as upgrade-readiness telemetry, not a formal protocol requirement.</div>
        </section>
    `;
}

function renderMyTezosBakerPanel(data) {
    const baker = summarizeMyTezosBaker(data);
    if (!baker) return '';

    return `
        <section class="lb-panel health-panel health-my-baker-panel chamber-anim-fade" id="health-my-baker-panel" style="animation-delay:120ms">
            <div class="health-my-baker-head">
                <div>
                    <div class="lb-panel-title">My Tezos Baker</div>
                    <div class="health-my-baker-name" id="health-my-baker-name">${bakerLinks(baker.address, baker.name)}</div>
                </div>
                <span class="health-my-baker-status ${baker.className}" id="health-my-baker-status">${escapeHtml(baker.label)}</span>
            </div>
            <p class="health-my-baker-copy" id="health-my-baker-copy">${escapeHtml(baker.copy)}</p>
            <div class="lb-metric-grid health-metric-grid health-my-baker-metrics">
                <div><span>Attestation misses</span><strong id="health-my-baker-attestations">${formatCount(baker.missedSlots)}</strong></div>
                <div><span>Block misses</span><strong id="health-my-baker-blocks">${formatCount(baker.missedBlockCount)}</strong></div>
                <div><span>Latest block</span><strong id="health-my-baker-latest">${baker.latestBlock ? formatCount(baker.latestBlock.level) : 'Not in sample'}</strong></div>
            </div>
        </section>
    `;
}

function renderAttesterRows(attesters) {
    if (!attesters.length) return '<div class="lb-empty-inline">No missed attestations in the current block sample.</div>';
    return attesters.slice(0, 12).map((item) => `
        <div class="lb-table-row health-attester-row" data-health-baker="${escapeHtml(item.address)}">
            <div class="lb-baker-cell">${bakerLinks(item.address, item.name)}</div>
            <span>${formatCount(item.slots)}</span>
            <span>${formatCount(item.latestLevel)} · <span${healthAgeAttr(item.latestTimestamp)}>${escapeHtml(formatAge(item.latestTimestamp))}</span></span>
        </div>
    `).join('');
}

function renderMissedAttestationsPanel(data) {
    const missedPower = data.missedAttestations.reduce((sum, item) => sum + item.slots, 0);
    return `
        <section class="lb-panel health-panel health-missed-attestations chamber-anim-fade" style="animation-delay:180ms">
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
        <section class="lb-panel health-panel health-missed-blocks chamber-anim-fade" style="animation-delay:240ms">
            <div class="lb-panel-title">Missed Blocks</div>
            <div class="lb-panel-subtitle">Last ${formatCount(MISSED_BLOCK_LOOKBACK)} levels ending at head.</div>
            <div class="lb-table health-missed-block-table">
                <div class="lb-table-head"><span>Level</span><span>Round</span><span>Baker</span></div>
                <div id="health-missed-block-list">${renderMissedBlockRows(data.missedBlocks)}</div>
            </div>
        </section>
    `;
}

function renderActivityTapePanel(data) {
    const rows = collapseActivityRows(data.activityTape || [], 8);
    const body = rows.length ? rows.map((row) => `
        <a class="lb-table-row health-activity-row" href="https://tzkt.io/${escapeHtml(row.hash)}" target="_blank" rel="noopener">
            <span>${escapeHtml(activityMethodLabel(row))}</span>
            <span>${row.amount === null ? '--' : `${formatCount(Math.round(row.amount))} XTZ`}</span>
            <span>${escapeHtml(row.target)}</span>
            <span${healthAgeAttr(row.timestamp)}>${escapeHtml(formatAge(row.timestamp))}</span>
        </a>
    `).join('') : '<div class="lb-empty-inline">No large transfers returned in the live sample.</div>';

    return `
        <section class="lb-panel health-panel health-activity-panel chamber-anim-fade" style="animation-delay:300ms">
            <div class="lb-panel-title">Live Activity Tape <span class="lb-live-pill">1,000+ XTZ</span></div>
            <div class="lb-table health-activity-table">
                <div class="lb-table-head"><span>Method</span><span>Amount</span><span>Target</span><span>Age</span></div>
                <div id="health-activity-list">${body}</div>
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

function renderRecentBlockRow(block, { isNew = false } = {}) {
        const cls = healthClass(block.score);
        const timeCls = timingClass(block.intervalSeconds);
        return `
            <div class="lb-table-row health-block-row ${isNew ? 'lb-row-new' : ''}" data-health-level="${Number(block.level) || 0}">
                <span>${formatCount(block.level)}</span>
                <span class="health-interval ${timeCls}">${formatSeconds(block.intervalSeconds)}</span>
                <span>${renderRoundBadge(block)}</span>
                <span class="health-power ${cls}">${formatCount(block.power)}<small>/${formatCount(block.committee)}</small></span>
                <span>${formatCount(block.missedPower)}</span>
                <div class="lb-baker-cell">${bakerLinks(block.producer?.address, bakerName(block.producer))}</div>
            </div>
        `;
}

function renderRecentBlockRows(blocks, { markLatest = true } = {}) {
    return blocks.map((block, index) => renderRecentBlockRow(block, { isNew: markLatest && index === 0 })).join('');
}

function renderRecentBlocksPanel(data) {
    return `
        <section class="lb-panel health-panel health-recent-blocks chamber-anim-fade" style="animation-delay:300ms">
            <div class="lb-panel-title">Passing Blocks <span class="lb-live-pill">live</span></div>
            <div class="lb-table health-block-table">
                <div class="lb-table-head"><span>Level</span><span>Delta</span><span>Round</span><span>Attested</span><span>Missed</span><span>Baker</span></div>
                <div id="health-recent-block-list">${renderRecentBlockRows(data.blocks)}</div>
            </div>
        </section>
    `;
}

function latestIncident(data) {
    const roundIncident = data.blocks.find((block) => block.blockRound > 0 || block.missedPower > 0);
    const missedBlock = data.missedBlocks[0] || null;
    const incidents = [
        roundIncident ? {
            label: roundIncident.blockRound > 0 ? `round-${roundIncident.blockRound} block` : `${formatCompactPower(roundIncident.missedPower)} missed power`,
            timestamp: roundIncident.timestamp,
            detail: `block ${formatCount(roundIncident.level)}`
        } : null,
        missedBlock ? {
            label: 'missed baking right',
            timestamp: missedBlock.timestamp,
            detail: `level ${formatCount(missedBlock.level)}`
        } : null
    ].filter(Boolean).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return incidents[0] || null;
}

function renderIncidentMemoryPanel(data) {
    const incident = latestIncident(data);
    const roundBlocks = data.blocks.filter((block) => block.blockRound > 0).length;
    const missedPowerBlocks = data.blocks.filter((block) => block.missedPower > 0).length;
    return `
        <section class="lb-panel health-panel health-incident-panel chamber-anim-fade" id="health-incident-memory" style="animation-delay:90ms">
            <div class="lb-panel-title">Incident Memory</div>
            <div class="lb-metric-grid health-metric-grid">
                <div><span>Last incident</span><strong>${incident ? escapeHtml(formatAge(incident.timestamp)) : 'None in sample'}</strong></div>
                <div><span>Round > 0</span><strong>${formatCount(roundBlocks)}</strong></div>
                <div><span>Missed power blocks</span><strong>${formatCount(missedPowerBlocks)}</strong></div>
            </div>
            <div class="health-timing-note">${incident ? `${escapeHtml(incident.label)} at ${escapeHtml(incident.detail)}` : 'The current chamber sample is clean; longer period scores remain below.'}</div>
        </section>
    `;
}

function renderPeriodTelemetryPanel(data) {
    const periods = data.periods || [];
    const rows = periods.length ? periods.map((period) => `
        <div class="health-uptime-cell ${healthClass(period.score)}" title="${escapeHtml(period.label)} ${formatPct(period.score)}%">
            <span>${escapeHtml(period.label)}</span>
            <strong>${formatPct(period.score)}%</strong>
        </div>
    `).join('') : '<div class="lb-empty-inline">Period health cache is warming up.</div>';
    return `
        <section class="lb-panel health-panel health-period-panel chamber-anim-fade" id="health-period-telemetry" style="animation-delay:150ms">
            <div class="lb-panel-title">Period Telemetry</div>
            <div class="health-uptime-strip">${rows}</div>
            <div class="lb-metric-grid health-metric-grid">
                <div><span>24h score</span><strong>${periods[0] ? `${formatPct(periods[0].score)}%` : '--'}</strong></div>
                <div><span>7d score</span><strong>${periods[1] ? `${formatPct(periods[1].score)}%` : '--'}</strong></div>
                <div><span>31d score</span><strong>${periods[2] ? `${formatPct(periods[2].score)}%` : '--'}</strong></div>
            </div>
            <div class="health-timing-note">Status-page style period memory from sampled TzKT block ranges.</div>
        </section>
    `;
}

function renderNetworkLoadPanel(data) {
    const tape = data.activityTape || [];
    const totalAmount = tape.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
    const methods = new Set(tape.map((row) => row.method).filter(Boolean));
    return `
        <section class="lb-panel health-panel health-load-panel chamber-anim-fade" id="health-network-load" style="animation-delay:210ms">
            <div class="lb-panel-title">Network Load</div>
            <div class="lb-metric-grid health-metric-grid">
                <div><span>Large tx rows</span><strong>${formatCount(tape.length)}</strong></div>
                <div><span>Large XTZ moved</span><strong>${formatCompactPower(totalAmount)} XTZ</strong></div>
                <div><span>Methods</span><strong>${formatCount(methods.size)}</strong></div>
            </div>
            <div class="health-timing-note">This is the chamber live-tape sample for 1,000+ XTZ transfers, not a full mempool.</div>
        </section>
    `;
}

function renderNetworkHealthChamber(data, container) {
    const latest = data.blocks[0] || null;
    const headTimestamp = getHeadTimestamp(data);
    const headAge = latest
        ? `<span${healthAgeAttr(headTimestamp)}>${escapeHtml(formatAge(headTimestamp))}</span>`
        : '';
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
                <div class="proposal-hash" id="health-head-meta">${latest ? `Head block ${formatCount(latest.level)} · ${headAge} · avg ${formatSeconds(data.timing.avgSeconds)}` : 'Live TzKT block feed'}</div>
            </div>
        </div>
        ${renderHealthVerdictPanel(data)}
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
        ${renderContinuityProofPanel()}
        <div class="lb-dashboard-grid health-dashboard-grid">
            ${renderHealthScorePanel(data)}
            ${renderTimingPanel(data)}
            ${renderTeztaleConsensusPanel(data)}
            ${renderOctezVersionsPanel(data)}
            ${renderCycleTimingPanel(data)}
            ${renderIncidentMemoryPanel(data)}
            ${renderPeriodTelemetryPanel(data)}
            ${renderNetworkLoadPanel(data)}
            ${renderMyTezosBakerPanel(data)}
            ${renderMissedAttestationsPanel(data)}
            ${renderActivityTapePanel(data)}
            ${renderMissedBlocksPanel(data)}
        </div>
        ${renderRecentBlocksPanel(data)}
        <div class="chamber-footer chamber-anim-fade" style="animation-delay:360ms">
            <a href="https://tzkt.io/blocks" target="_blank" rel="noopener">TzKT Blocks -></a>
            <span class="chamber-footer-sep">·</span>
            <a href="https://tzkt.io/rights" target="_blank" rel="noopener">TzKT Rights -></a>
            <span class="chamber-footer-sep">·</span>
            <a href="${TEZTALE_REPORT_URL}" target="_blank" rel="noopener">Teztale by Nomadic Labs -></a>
            <span class="chamber-footer-sep">·</span>
            <a class="panel-direct-link" href="/health/" aria-label="Direct link to Network Health Chamber">Direct: /health/</a>
        </div>
    `;
    container.dataset.healthRendered = 'true';
    initHealthBakerProfileLinks(container);
    refreshHealthAgeLabels(container);
}

function updateHealthHeader(data) {
    const latest = data.blocks[0] || null;
    const headTimestamp = getHeadTimestamp(data);
    const headAge = latest
        ? `<span${healthAgeAttr(headTimestamp)}>${escapeHtml(formatAge(headTimestamp))}</span>`
        : '';
    const status = chamberStatus(data);
    const badge = document.getElementById('health-header-badge');
    if (badge) {
        setTextIfChanged(badge, status.label);
        badge.className = `chamber-badge ${status.className}`;
    }
    setTextIfChanged('#health-refresh-state', `auto-refresh ${Math.round(CHAMBER_REFRESH_INTERVAL / 1000)}s`, { pulse: false });
    const metaHtml = latest
        ? `Head block ${formatCount(latest.level)} · ${headAge} · avg ${formatSeconds(data.timing.avgSeconds)}`
        : 'Live TzKT block feed';
    setHtmlIfSignatureChanged(
        '#health-head-meta',
        metaHtml,
        `${latest?.level || 0}:${headTimestamp || ''}:${formatSeconds(data.timing.avgSeconds)}`
    );
}

function updateHealthScorePanel(data) {
    const cls = healthClass(data.summary.score);
    const width = Math.max(2, Math.min(100, data.summary.score));
    const headTimestamp = getHeadTimestamp(data);
    setTextIfChanged('#health-hero-score', `${formatPct(data.summary.score)}%`);
    setClassNameIfChanged('#health-hero-score', `health-hero-number ${cls}`);
    setTextIfChanged('#health-hero-copy', `Last ${formatCount(data.summary.count)} blocks recorded ${formatCompactPower(data.summary.totalPower)} / ${formatCompactPower(data.summary.totalCommittee)} attestation power.`, { pulse: false });
    const fill = document.getElementById('health-score-fill');
    if (fill) {
        fill.className = `health-score-fill ${cls}`;
        fill.style.width = `${width.toFixed(2)}%`;
    }
    setTextIfChanged('#health-summary-missed', formatCompactPower(data.summary.missingPower));
    setTextIfChanged('#health-summary-range', `${formatCount(data.oldestLevel)} -> ${formatCount(data.headLevel)}`);
    const updated = document.getElementById('health-summary-updated');
    if (updated) {
        updated.dataset.healthAge = headTimestamp || '';
        setTextIfChanged(updated, formatAge(headTimestamp), { pulse: false });
    }
}

function updateHealthTimingPanel(data) {
    const onTargetPct = data.timing.intervalCount ? (data.timing.onTarget / data.timing.intervalCount) * 100 : 0;
    const cells = data.blocks.slice(0, -1).map((block) => {
        const cls = timingClass(block.intervalSeconds);
        return `
            <span class="health-timing-cell ${cls}" title="Block ${formatCount(block.level)} interval ${formatSeconds(block.intervalSeconds)}">
                ${formatSeconds(block.intervalSeconds)}
            </span>
        `;
    }).join('');
    setTextIfChanged('#health-avg-block', formatSeconds(data.timing.avgSeconds));
    setTextIfChanged('#health-on-target', `${formatPct(onTargetPct)}%`);
    setTextIfChanged('#health-round-zero', `${formatPct(data.timing.roundZeroPct)}%`);
    setHtmlIfSignatureChanged(
        '#health-timing-strip',
        cells,
        data.blocks.slice(0, -1).map((block) => `${block.level}:${formatSeconds(block.intervalSeconds)}`).join('|')
    );
    setTextIfChanged('#health-timing-note', `Max round ${formatCount(data.timing.maxRound)} across the live sample.`, { pulse: false });
}

function updateMyTezosBakerPanel(data) {
    const baker = summarizeMyTezosBaker(data);
    const panel = document.getElementById('health-my-baker-panel');
    if (!baker) {
        panel?.remove();
        return;
    }
    if (!panel) {
        document.querySelector('.health-missed-attestations')?.insertAdjacentHTML('beforebegin', renderMyTezosBakerPanel(data));
        initHealthBakerProfileLinks(document.getElementById('health-my-baker-panel') || document);
        return;
    }
    setHtmlIfSignatureChanged(
        '#health-my-baker-name',
        bakerLinks(baker.address, baker.name),
        `${baker.address}:${baker.name}`
    );
    const status = document.getElementById('health-my-baker-status');
    if (status) {
        setTextIfChanged(status, baker.label);
        status.className = `health-my-baker-status ${baker.className}`;
    }
    setTextIfChanged('#health-my-baker-copy', baker.copy, { pulse: false });
    setTextIfChanged('#health-my-baker-attestations', formatCount(baker.missedSlots));
    setTextIfChanged('#health-my-baker-blocks', formatCount(baker.missedBlockCount));
    setTextIfChanged('#health-my-baker-latest', baker.latestBlock ? formatCount(baker.latestBlock.level) : 'Not in sample');
    initHealthBakerProfileLinks(panel);
}

function updateListIfChanged(selector, html, signature) {
    const changed = setHtmlIfSignatureChanged(selector, html, signature, { pulse: true });
    const root = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (changed) initHealthBakerProfileLinks(root || document);
}

function updateRecentBlockRows(blocks) {
    const list = document.getElementById('health-recent-block-list');
    if (!list) return;
    const nextBlocks = blocks.slice(0, CHAMBER_BLOCK_LIMIT);
    const signature = nextBlocks.map((block) => `${block.level}:${block.power}:${block.committee}:${block.missedPower}:${block.blockRound}`).join('|');
    if (!list.children.length) {
        setHtmlIfSignatureChanged(list, renderRecentBlockRows(nextBlocks), signature);
        initHealthBakerProfileLinks(list);
        return;
    }

    const existingLevels = new Set([...list.querySelectorAll('.health-block-row')].map((row) => row.dataset.healthLevel));
    const freshBlocks = nextBlocks.filter((block) => !existingLevels.has(String(Number(block.level) || 0)));
    if (!freshBlocks.length) {
        updateListIfChanged(list, renderRecentBlockRows(nextBlocks, { markLatest: false }), signature);
        return;
    }

    for (const block of [...freshBlocks].reverse()) {
        list.insertAdjacentHTML('afterbegin', renderRecentBlockRow(block, { isNew: true }));
    }
    while (list.querySelectorAll('.health-block-row').length > nextBlocks.length) {
        list.querySelector('.health-block-row:last-child')?.remove();
    }
    list.dataset.healthSignature = signature;
    initHealthBakerProfileLinks(list);
}

function updateHealthStoryPanels(data) {
    const consensus = document.getElementById('health-teztale-consensus');
    if (consensus) consensus.outerHTML = renderTeztaleConsensusPanel(data);
    const octez = document.getElementById('health-octez-versions');
    if (octez) {
        octez.outerHTML = renderOctezVersionsPanel(data);
        initHealthBakerProfileLinks(document.getElementById('health-octez-versions') || document);
    }
    const cycle = document.getElementById('health-cycle-timing');
    if (cycle) cycle.outerHTML = renderCycleTimingPanel(data);
    const incident = document.getElementById('health-incident-memory');
    if (incident) incident.outerHTML = renderIncidentMemoryPanel(data);
    const periods = document.getElementById('health-period-telemetry');
    if (periods) periods.outerHTML = renderPeriodTelemetryPanel(data);
    const load = document.getElementById('health-network-load');
    if (load) load.outerHTML = renderNetworkLoadPanel(data);
}

function updateNetworkHealthInPlace(data, container) {
    if (!container.dataset.healthRendered || !document.getElementById('health-hero-score')) {
        renderNetworkHealthChamber(data, container);
        return;
    }
    container.dataset.healthRefreshMode = 'in-place';
    updateHealthHeader(data);
    updateHealthVerdictPanel(data);
    updateHealthScorePanel(data);
    updateHealthTimingPanel(data);
    updateHealthStoryPanels(data);
    updateMyTezosBakerPanel(data);
    updateListIfChanged(
        '#health-missed-attester-list',
        renderAttesterRows(data.missedAttesters),
        data.missedAttesters.map((item) => `${item.address}:${item.slots}:${item.latestLevel}`).join('|')
    );
    updateListIfChanged(
        '#health-missed-block-list',
        renderMissedBlockRows(data.missedBlocks),
        data.missedBlocks.map((right) => `${right.level}:${right.round}:${right.baker?.address || ''}`).join('|')
    );
    updateListIfChanged(
        '#health-activity-list',
        (data.activityTape || []).length
            ? data.activityTape.slice(0, 8).map((row) => `
        <a class="lb-table-row health-activity-row" href="https://tzkt.io/${escapeHtml(row.hash)}" target="_blank" rel="noopener">
            <span>${escapeHtml(row.method)}</span>
            <span>${row.amount === null ? '--' : `${formatCount(Math.round(row.amount))} XTZ`}</span>
            <span>${escapeHtml(row.target)}</span>
            <span${healthAgeAttr(row.timestamp)}>${escapeHtml(formatAge(row.timestamp))}</span>
        </a>
    `).join('')
            : '<div class="lb-empty-inline">No large transfers returned in the live sample.</div>',
        (data.activityTape || []).map((row) => `${row.hash}:${row.amount}:${row.timestamp}`).join('|')
    );
    updateRecentBlockRows(data.blocks);
    updateBlockTicker(data);
    refreshHealthAgeLabels(container);
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
        if (initial) renderNetworkHealthChamber(data, body);
        else updateNetworkHealthInPlace(data, body);
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
    startHealthAgeTicker();
    chamberTimer = window.setInterval(() => {
        if (document.hidden) return;
        const pulseStale = !lastBlockPulseAt || Date.now() - lastBlockPulseAt > CHAMBER_REFRESH_INTERVAL * 2;
        if (pulseStale) refreshNetworkHealthChamber();
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
    card.classList.add('chamber-entry-card', 'health-entry-card', 'chamber-entry-wide');
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

    ensureHealthEntryTape();
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
            refreshNetworkHealthTape();
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

    wireCycleChipHealthLauncher();
    wireNetworkHealthCard();
    startHealthAgeTicker();

    cachedData = loadCachedData();
    if (cachedData) {
        lastFullFetch = cachedData.periodUpdatedAt || cachedData.updatedAt || 0;
        renderNetworkHealth(cachedData);
    } else {
        updateBlockTicker(null);
    }

    refreshNetworkHealth({ force: !periodCacheIsFresh(cachedData) });

    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
        if (document.visibilityState !== 'visible') return;
        const pulseStale = !lastBlockPulseAt || Date.now() - lastBlockPulseAt > LIVE_REFRESH_INTERVAL * 2;
        if (pulseStale) refreshNetworkHealth();
    }, LIVE_REFRESH_INTERVAL);

    window.addEventListener('block-pulse', () => {
        const now = Date.now();
        lastBlockPulseAt = now;
        if (now - lastBlockPulseFetch < BLOCK_PULSE_THROTTLE) return;
        lastBlockPulseFetch = now;
        refreshNetworkHealth();
        if (document.getElementById('network-health-modal')?.classList.contains('active')) {
            refreshNetworkHealthChamber();
        }
    });
}
