import { setChamberReadingState, renderAgeingLabel, renderChamberStamp, renderChamberVerdict, renderChamberGuide, syncChamberReading } from '../ui/chamber-reading.js';
/**
 * Capital Chamber
 *
 * A public-source, generated intelligence surface for the Tezos system. The
 * browser deliberately reads one bounded first-party snapshot; source crawling
 * and heavy aggregation stay in scripts/refresh-capital-data.mjs.
 */

import { quietlySyncHtml } from '../core/quiet-refresh.js';
import { createChamberSnapshotCache } from '../core/chamber-snapshot-cache.js';
import { chamberSkeleton, snapshotStatusMarkup, syncSnapshotStatus } from '../ui/chamber-skeleton.js';
import { versionedAsset } from '../core/asset-version.js';
import { GENERATED_PROOFBOOK_SCHEDULE_LABEL } from '../core/freshness-contracts.mjs';
import { sha256Text } from '../core/sha256.js';
import { assertSnapshotMatchesProjection } from '../core/snapshot-receipt.js';
import { escapeHtml, formatFreshnessStamp } from '../core/utils.js';
import { getChamberScrollContainer,
    activateChamberDialog,
    deactivateChamberDialog,
    requestChamberClose,
    focusChamberTab,
    wireChamberLauncher
} from '../ui/chamber-accessibility.js';
import { ensureChamberStylesheet } from '../ui/chamber-styles.js';

const snapshotCache = createChamberSnapshotCache({
    key: 'capital', validateSnapshot, validateSummary: validateEntrySummary,
    receiptFor: (summary) => summary.source
});

const CAPITAL_CSS_URL = versionedAsset('/css/capital.min.css');
const MARKET_ROOM_CSS_URL = versionedAsset('/css/market-room.min.css');
const CAPITAL_SNAPSHOT_URL = '/data/capital-snapshot.json';
const CAPITAL_ENTRY_SUMMARY_URL = '/data/capital-entry-summary.json';
const DEFAULT_REFRESH_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_AFTER_MS = 6 * 60 * 60 * 1000;

const VIEWS = Object.freeze([
    { id: 'system', label: 'One System', title: 'One System', detail: 'Tezos L1 and Etherlink L2 kept semantically separate, then read together.' },
    { id: 'markets', label: 'Markets', title: 'Markets', detail: 'XTZ price, returns, liquidity context, and venue-quality receipts.' },
    { id: 'assets', label: 'Assets', title: 'Assets + RWA', detail: 'Protocol capital, mapped tokens, and proofbooks for real-world assets.' },
    { id: 'art', label: 'Art', title: 'Art Economy', detail: 'Gross marketplace activity, collections, collectors, and artists on Tezos L1.' }
]);
const VIEW_IDS = new Set(VIEWS.map(({ id }) => id));

const RANGES = Object.freeze([
    { id: '30D', label: '30D', days: 30 },
    { id: '3M', label: '3M', days: 90 },
    { id: '6M', label: '6M', days: 183 },
    { id: '1Y', label: '1Y', days: 365 },
    { id: '2Y', label: '2Y', days: 730 }
]);
const RANGE_BY_ID = new Map(RANGES.map((range) => [range.id, range]));
const AVAILABLE_RANGES = Object.freeze({
    system: new Set(RANGES.map(({ id }) => id)),
    markets: new Set(['30D', '3M', '6M', '1Y']),
    assets: new Set(),
    art: new Set(['30D'])
});

let currentView = 'system';
let currentRange = '30D';
let lastSnapshot = null;
let lastEntrySummary = null;
let lastRefreshError = '';
let savedSnapshot = false;
let openEpoch = 0;
let chamberRefreshWork = null;
let pendingSnapshotRefresh = null;
let activeFetch = null;
let activeEntryFetch = null;
let chamberTimer = null;
let visibilityReady = false;
let refreshDeferred = false;
let entryRefreshDeferred = false;
let savedBodyOverflow = null;
let savedHtmlOverflow = null;

function numeric(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(number) ? number : null;
}

function stableJsonValue(value) {
    if (Array.isArray(value)) return value.map(stableJsonValue);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableJsonValue(value[key])]));
}

function finiteValues(values) {
    return values.map(numeric).filter((value) => value !== null);
}

function sum(values, { requireAll = false } = {}) {
    const normalized = values.map(numeric);
    const available = normalized.filter((value) => value !== null);
    if (!available.length || (requireAll && available.length !== normalized.length)) return null;
    return available.reduce((total, value) => total + value, 0);
}

function formatNumber(value, maximumFractionDigits = 0) {
    const number = numeric(value);
    if (number === null) return 'Unavailable';
    return number.toLocaleString('en-US', { maximumFractionDigits });
}

function formatCompact(value, maximumFractionDigits = 1) {
    const number = numeric(value);
    if (number === null) return 'Unavailable';
    return new Intl.NumberFormat('en-US', {
        notation: 'compact',
        maximumFractionDigits
    }).format(number);
}

function formatUsd(value, compact = true) {
    const number = numeric(value);
    if (number === null) return 'Unavailable';
    if (compact && Math.abs(number) >= 1000) return `$${formatCompact(number, 2)}`;
    const digits = Math.abs(number) < 1 ? 4 : 2;
    return number.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: digits
    });
}

function formatXtz(value) {
    const number = numeric(value);
    return number === null ? 'Unavailable' : `${formatCompact(number, 2)} ꜩ`;
}

function formatXtzExact(value, maximumFractionDigits = 6) {
    const number = numeric(value);
    if (number === null) return 'Unavailable';
    return `${number.toLocaleString('en-US', {
        minimumFractionDigits: number !== 0 && Math.abs(number) < .01 ? Math.min(3, maximumFractionDigits) : 0,
        maximumFractionDigits
    })} ꜩ`;
}

function formatMutezAsXtz(value, maximumFractionDigits = 6) {
    const number = numeric(value);
    return number === null ? 'Unavailable' : formatXtzExact(number / 1_000_000, maximumFractionDigits);
}

function formatGwei(value) {
    const number = numeric(value);
    return number === null ? 'Unavailable' : `${number.toLocaleString('en-US', { maximumFractionDigits: 3 })} gwei`;
}

function formatPct(value, { signed = false } = {}) {
    const number = numeric(value);
    if (number === null) return 'Unavailable';
    const prefix = signed && number > 0 ? '+' : '';
    return `${prefix}${number.toFixed(2)}%`;
}

function formatRate(value) {
    const number = numeric(value);
    if (number === null) return 'Unavailable';
    return `${number.toFixed(number < 1 ? 3 : 2)}/s`;
}

function formatDate(value) {
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) return 'Unavailable';
    return new Date(timestamp).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC'
    });
}

function formatTimestamp(value) {
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) return 'Unavailable';
    return new Date(timestamp).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'UTC',
        timeZoneName: 'short'
    });
}

function ageLabel(value) {
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) return 'freshness unavailable';
    const elapsed = Math.max(0, Date.now() - timestamp);
    if (elapsed < 60 * 1000) return 'under 1m ago';
    if (elapsed < 60 * 60 * 1000) return `${Math.floor(elapsed / (60 * 1000))}m ago`;
    if (elapsed < DAY_MS) return `${Math.floor(elapsed / (60 * 60 * 1000))}h ago`;
    return `${Math.floor(elapsed / DAY_MS)}d ago`;
}

function priceFreshnessLabel(snapshot) {
    const coin = snapshot?.markets?.xtz?.coin || {};
    const source = snapshot?.sources?.coingecko || {};
    const observedAt = coin.lastUpdated || source.retrievedAt;
    const sourceStatus = source.status || coin.sourceStatus || 'unavailable';
    if (!Number.isFinite(Date.parse(observedAt || ''))) return 'CoinGecko · observation time unavailable';
    const label = sourceStatus === 'ok'
        ? 'CoinGecko'
        : sourceStatus === 'stale'
            ? 'last-good CoinGecko'
            : 'CoinGecko unavailable';
    return formatFreshnessStamp(observedAt, { source: label });
}

function truncate(value, length = 20) {
    const text = String(value ?? '');
    if (text.length <= length) return text;
    return `${text.slice(0, Math.max(6, length - 7))}…${text.slice(-6)}`;
}

function safeExternalUrl(value) {
    try {
        const url = new URL(String(value));
        return url.protocol === 'https:' ? url.href : '';
    } catch {
        return '';
    }
}

function ensureCapitalCss() {
    return Promise.all([
        ensureChamberStylesheet('capital-css', CAPITAL_CSS_URL),
        ensureChamberStylesheet('market-room-css', MARKET_ROOM_CSS_URL)
    ]);
}

async function validateSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object' || snapshot.schemaVersion !== 1) {
        throw new Error('Capital snapshot schemaVersion 1 is required.');
    }
    if (!snapshot.generatedAt
        || !Number.isFinite(Date.parse(snapshot.generatedAt))
        || !/^[0-9a-f]{64}$/.test(snapshot.contentHash || '')
        || !snapshot.sources
        || !Array.isArray(snapshot.defi?.chains)
        || !snapshot.network?.tezos
        || !snapshot.network?.etherlink
        || !snapshot.markets?.xtz
        || !snapshot.rwa
        || !snapshot.art
        || !snapshot.development) {
        throw new Error('Capital snapshot is missing required generated sections.');
    }
    const { contentHash, ...unsigned } = snapshot;
    const actualHash = await sha256Text(JSON.stringify(stableJsonValue(unsigned)));
    if (actualHash.toLowerCase() !== contentHash.toLowerCase()) {
        throw new Error('Capital snapshot failed its SHA-256 integrity receipt.');
    }
    return snapshot;
}

async function validateEntrySummary(summary) {
    if (!summary || typeof summary !== 'object' || summary.schemaVersion !== 1) {
        throw new Error('Capital entry summary schemaVersion 1 is required.');
    }
    if (!summary.generatedAt
        || !Number.isFinite(Date.parse(summary.generatedAt))
        || !/^[0-9a-f]{64}$/.test(summary.contentHash || '')
        || summary.source?.path !== 'data/capital-snapshot.json'
        || !/^[0-9a-f]{64}$/.test(summary.source?.contentHash || '')
        || !/^[0-9a-f]{64}$/.test(summary.source?.fileSha256 || '')
        || !Array.isArray(summary.defi?.chains)
        || !summary.markets?.xtz?.coin
        || !Array.isArray(summary.markets?.xtz?.priceHistory?.usd)
        || summary.source?.schemaVersion !== 1
        || summary.source?.generatedAt !== summary.generatedAt) {
        throw new Error('Capital entry summary is missing its projection receipt or launcher fields.');
    }
    const chains = new Map(summary.defi.chains.map((row) => [row?.id, row]));
    for (const id of ['tezos', 'etherlink']) {
        const row = chains.get(id);
        if (numeric(row?.tvl?.currentUsd) === null || numeric(row?.stablecoins?.currentUsd) === null) {
            throw new Error(`Capital entry summary is missing ${id} launcher values.`);
        }
    }
    const history = summary.markets.xtz.priceHistory.usd;
    if (numeric(summary.markets.xtz.coin.currentPriceUsd) === null
        || numeric(summary.markets.xtz.coin.change24hPct) === null
        || !Number.isFinite(Date.parse(summary.markets.xtz.coin.lastUpdated || ''))
        || !['ok', 'stale', 'unavailable'].includes(summary.markets.xtz.coin.sourceStatus)
        || history.length < 2
        || history.some((row) => !Number.isFinite(Date.parse(row?.date)) || numeric(row?.value) === null)) {
        throw new Error('Capital entry summary has invalid XTZ launcher history.');
    }
    const { contentHash, ...unsigned } = summary;
    const actualHash = await sha256Text(JSON.stringify(stableJsonValue(unsigned)));
    if (actualHash.toLowerCase() !== contentHash.toLowerCase()) {
        throw new Error('Capital entry summary failed its SHA-256 integrity receipt.');
    }
    return summary;
}

function fetchCapitalSnapshot(summary = lastEntrySummary) {
    if (activeFetch) return activeFetch;
    const sourceReceipt = summary?.source || null;
    activeFetch = fetch(CAPITAL_SNAPSHOT_URL, {
        cache: 'no-cache',
        headers: { Accept: 'application/json' }
    })
        .then(async (response) => {
            if (!response.ok) throw new Error(`Capital snapshot HTTP ${response.status}`);
            const sourceText = await response.text();
            let snapshot;
            try {
                snapshot = JSON.parse(sourceText);
            } catch {
                throw new Error('Capital snapshot is not valid JSON.');
            }
            await validateSnapshot(snapshot);
            await assertSnapshotMatchesProjection(snapshot, sourceText, sourceReceipt, { label: 'Capital snapshot' });
            void snapshotCache.save(sourceText, summary);
            return snapshot;
        })
        .finally(() => {
            activeFetch = null;
        });
    return activeFetch;
}

function fetchCapitalEntrySummary() {
    if (activeEntryFetch) return activeEntryFetch;
    activeEntryFetch = fetch(CAPITAL_ENTRY_SUMMARY_URL, {
        cache: 'no-cache',
        headers: { Accept: 'application/json' }
    })
        .then((response) => {
            if (!response.ok) throw new Error(`Capital entry summary HTTP ${response.status}`);
            return response.json();
        })
        .then(validateEntrySummary)
        .finally(() => {
            activeEntryFetch = null;
        });
    return activeEntryFetch;
}

function capitalSnapshotHash(summary) {
    return String(summary?.source?.contentHash || '').toLowerCase();
}

async function resolveCapitalSnapshotRefresh() {
    let summary = lastEntrySummary;

    // Once a complete snapshot is resident, the compact projection is the
    // change detector. A first open may reuse the projection already verified
    // for the launcher rather than issuing the same small request twice.
    if (lastSnapshot || !summary || lastRefreshError) {
        try {
            summary = await fetchCapitalEntrySummary();
            lastEntrySummary = summary;
        } catch (error) {
            if (lastSnapshot) throw error;
            console.warn('Capital Chamber summary poll failed during open; trying the complete snapshot:', error);
            summary = null;
        }
    }

    const projectedHash = capitalSnapshotHash(summary);
    const loadedHash = String(lastSnapshot?.contentHash || '').toLowerCase();
    if (lastSnapshot && projectedHash && projectedHash === loadedHash) {
        return { snapshot: lastSnapshot, changed: false };
    }
    if (lastSnapshot && projectedHash) {
        const projectedAt = Date.parse(summary?.source?.generatedAt || summary?.generatedAt || '');
        const loadedAt = Date.parse(lastSnapshot.generatedAt || '');
        if (!Number.isFinite(projectedAt) || !Number.isFinite(loadedAt) || projectedAt <= loadedAt) {
            throw new Error('Capital launcher projection is not newer than the loaded snapshot; retaining last-good data.');
        }
    }

    return { snapshot: await fetchCapitalSnapshot(summary), changed: true };
}

function chain(snapshot, id) {
    return snapshot.defi?.chains?.find((row) => row.id === id) || {};
}

function normalizePoints(rows, valueKey = 'value') {
    return (Array.isArray(rows) ? rows : [])
        .map((row) => ({
            date: row?.date || row?.timestamp,
            timestamp: Date.parse(row?.date || row?.timestamp),
            value: numeric(row?.[valueKey])
        }))
        .filter((point) => Number.isFinite(point.timestamp) && point.value !== null)
        .sort((a, b) => a.timestamp - b.timestamp);
}

function pointsForRange(rows, valueKey, rangeId = currentRange) {
    const points = normalizePoints(rows, valueKey);
    const days = RANGE_BY_ID.get(rangeId)?.days;
    if (!points.length || !days) return points;
    const cutoff = points.at(-1).timestamp - (days * DAY_MS);
    return points.filter((point) => point.timestamp >= cutoff);
}

function downsample(points, maxPoints = 180) {
    if (points.length <= maxPoints) return points;
    const step = (points.length - 1) / (maxPoints - 1);
    return Array.from({ length: maxPoints }, (_, index) => points[Math.round(index * step)]);
}

function renderChart(series, label) {
    const usable = series
        .map((item) => ({ ...item, points: downsample(item.points || []) }))
        .filter((item) => item.points.length);
    if (!usable.length) {
        return `<div class="capital-chart-empty">No comparable points are available in this snapshot.</div>`;
    }

    const values = usable.flatMap((item) => item.points.map((point) => point.value));
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (min === max) {
        min -= Math.abs(min || 1) * .05;
        max += Math.abs(max || 1) * .05;
    }
    const allTimes = usable.flatMap((item) => item.points.map((point) => point.timestamp));
    const firstTime = Math.min(...allTimes);
    const lastTime = Math.max(...allTimes);
    const timeSpan = Math.max(1, lastTime - firstTime);
    const x = (timestamp) => 34 + (((timestamp - firstTime) / timeSpan) * 704);
    const y = (value) => 156 - (((value - min) / (max - min)) * 136);
    const pathFor = (points) => points.map((point, index) => `${index ? 'L' : 'M'}${x(point.timestamp).toFixed(2)},${y(point.value).toFixed(2)}`).join(' ');
    const firstPath = pathFor(usable[0].points);
    const firstStartX = x(usable[0].points[0].timestamp).toFixed(2);
    const firstEndX = x(usable[0].points.at(-1).timestamp).toFixed(2);
    const grid = [20, 65, 110, 156].map((gridY) => `<line class="capital-chart-grid" x1="34" y1="${gridY}" x2="738" y2="${gridY}"></line>`).join('');
    const paths = usable.map((item) => `<path class="capital-chart-line" stroke="${escapeHtml(item.color)}" d="${pathFor(item.points)}"></path>`).join('');
    const legend = usable.map((item) => `<span style="--legend-color:${escapeHtml(item.color)}">${escapeHtml(item.label)}</span>`).join('');

    return `
        <div class="capital-chart" role="img" aria-label="${escapeHtml(label)}">
            <svg viewBox="0 0 760 184" preserveAspectRatio="none" aria-hidden="true" focusable="false">
                ${grid}
                <path class="capital-chart-area" fill="${escapeHtml(usable[0].color)}" d="${firstPath} L${firstEndX},166 L${firstStartX},166 Z"></path>
                ${paths}
                <text x="34" y="179" fill="#7189a0" font-size="9">${escapeHtml(formatDate(new Date(firstTime).toISOString()))}</text>
                <text x="738" y="179" fill="#7189a0" font-size="9" text-anchor="end">${escapeHtml(formatDate(new Date(lastTime).toISOString()))}</text>
            </svg>
            <div class="capital-legend">${legend}</div>
        </div>
    `;
}

function priceHistoryModel(rows, rangeId) {
    const points = downsample(pointsForRange(rows, 'value', rangeId), 240);
    if (points.length < 2) return null;
    const values = points.map((point) => point.value);
    const first = points[0];
    const latest = points.at(-1);
    const low = Math.min(...values);
    const high = Math.max(...values);
    const spread = Math.max(high - low, Math.abs(high || 1) * .02);
    const floor = Math.max(0, low - (spread * .08));
    const ceiling = high + (spread * .08);
    const changePct = first.value === 0 ? null : ((latest.value / first.value) - 1) * 100;
    return { points, first, latest, low, high, floor, ceiling, changePct };
}

function priceDirection(value) {
    const number = numeric(value);
    if (number === null || Math.abs(number) < .005) return 'is-flat';
    return number > 0 ? 'is-positive' : 'is-negative';
}

function priceHistoryLabel(model, rangeId) {
    return `XTZ USD ${rangeId} daily close history from ${formatDate(model.first.date)} to ${formatDate(model.latest.date)}. Open ${formatUsd(model.first.value, false)}, latest ${formatUsd(model.latest.value, false)}, high ${formatUsd(model.high, false)}, low ${formatUsd(model.low, false)}, range return ${formatPct(model.changePct, { signed: true })}.`;
}

function renderPriceHistory(rows, rangeId, market = {}) {
    const model = priceHistoryModel(rows, rangeId);
    if (!model) return '<div class="capital-chart-empty">No comparable XTZ price history is available in this snapshot.</div>';

    const width = 1040;
    const height = 300;
    const left = 70;
    const right = 1012;
    const top = 24;
    const bottom = 238;
    const timeSpan = Math.max(1, model.latest.timestamp - model.first.timestamp);
    const valueSpan = Math.max(Number.EPSILON, model.ceiling - model.floor);
    const x = (timestamp) => left + (((timestamp - model.first.timestamp) / timeSpan) * (right - left));
    const y = (value) => bottom - (((value - model.floor) / valueSpan) * (bottom - top));
    const path = model.points.map((point, index) => `${index ? 'L' : 'M'}${x(point.timestamp).toFixed(2)},${y(point.value).toFixed(2)}`).join(' ');
    const firstX = x(model.first.timestamp).toFixed(2);
    const lastX = x(model.latest.timestamp).toFixed(2);
    const lastY = y(model.latest.value).toFixed(2);
    const midPoint = model.points[Math.floor((model.points.length - 1) / 2)];
    const gridRatios = [0, .333, .667, 1];
    const grid = gridRatios.map((ratio) => {
        const gridValue = model.ceiling - ((model.ceiling - model.floor) * ratio);
        const gridY = top + ((bottom - top) * ratio);
        return `
            <line class="capital-price-grid" x1="${left}" y1="${gridY.toFixed(2)}" x2="${right}" y2="${gridY.toFixed(2)}"></line>
            <text class="capital-price-axis" x="${left - 12}" y="${(gridY + 3).toFixed(2)}" text-anchor="end">${escapeHtml(formatUsd(gridValue, false))}</text>
        `;
    }).join('');

    return `
        <div class="capital-price-history">
            <div class="capital-price-summary" aria-hidden="true">
                <span><small>Open</small><strong>${escapeHtml(formatUsd(model.first.value, false))}</strong></span>
                <span><small>High</small><strong>${escapeHtml(formatUsd(model.high, false))}</strong></span>
                <span><small>Low</small><strong>${escapeHtml(formatUsd(model.low, false))}</strong></span>
                <span><small>Latest</small><strong>${escapeHtml(formatUsd(model.latest.value, false))}</strong></span>
                <span class="${priceDirection(model.changePct)}"><small>${escapeHtml(rangeId)} return</small><strong>${escapeHtml(formatPct(model.changePct, { signed: true }))}</strong></span>
                <span><small>Market cap</small><strong>${escapeHtml(formatUsd(market.marketCapUsd))}</strong></span>
                <span><small>24h volume</small><strong>${escapeHtml(formatUsd(market.volume24hUsd))}</strong></span>
                <span class="${priceDirection(market.change24hPct)}"><small>24h return</small><strong>${escapeHtml(formatPct(market.change24hPct, { signed: true }))}</strong></span>
            </div>
            <div class="capital-chart capital-featured-price-chart" role="img" aria-label="${escapeHtml(priceHistoryLabel(model, rangeId))}">
                <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true" focusable="false">
                    <defs>
                        <linearGradient id="capital-price-area-gradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stop-color="#69e7c3" stop-opacity=".28"></stop>
                            <stop offset="100%" stop-color="#69e7c3" stop-opacity="0"></stop>
                        </linearGradient>
                    </defs>
                    ${grid}
                    <path class="capital-price-area" d="${path} L${lastX},${bottom} L${firstX},${bottom} Z"></path>
                    <path class="capital-price-line" d="${path}"></path>
                    <circle class="capital-price-end-halo" cx="${lastX}" cy="${lastY}" r="8"></circle>
                    <circle class="capital-price-end" cx="${lastX}" cy="${lastY}" r="3.5"></circle>
                    <text class="capital-price-date" x="${left}" y="282">${escapeHtml(formatDate(model.first.date))}</text>
                    <text class="capital-price-date" x="${x(midPoint.timestamp).toFixed(2)}" y="282" text-anchor="middle">${escapeHtml(formatDate(midPoint.date))}</text>
                    <text class="capital-price-date" x="${right}" y="282" text-anchor="end">${escapeHtml(formatDate(model.latest.date))}</text>
                </svg>
            </div>
        </div>
    `;
}

function renderEntryPriceHistory(rows) {
    const rangeId = '3M';
    const model = priceHistoryModel(rows, rangeId);
    if (!model) return '<div class="capital-entry-price-empty">90D XTZ history unavailable</div>';
    const width = 760;
    const height = 48;
    const top = 4;
    const bottom = 44;
    const timeSpan = Math.max(1, model.latest.timestamp - model.first.timestamp);
    const valueSpan = Math.max(Number.EPSILON, model.ceiling - model.floor);
    const x = (timestamp) => ((timestamp - model.first.timestamp) / timeSpan) * width;
    const y = (value) => bottom - (((value - model.floor) / valueSpan) * (bottom - top));
    const path = model.points.map((point, index) => `${index ? 'L' : 'M'}${x(point.timestamp).toFixed(2)},${y(point.value).toFixed(2)}`).join(' ');
    const lastX = x(model.latest.timestamp).toFixed(2);
    const lastY = y(model.latest.value).toFixed(2);
    return `
        <div class="capital-entry-price-chart" role="img" aria-label="${escapeHtml(priceHistoryLabel(model, '90D'))}">
            <div class="capital-entry-price-copy" aria-hidden="true">
                <span>XTZ / USD</span>
                <strong class="${priceDirection(model.changePct)}">90D ${escapeHtml(formatPct(model.changePct, { signed: true }))}</strong>
            </div>
            <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true" focusable="false">
                <path class="capital-entry-price-area" d="${path} L${lastX},${height} L0,${height} Z"></path>
                <path class="capital-entry-price-line" d="${path}"></path>
                <circle class="capital-entry-price-end" cx="${lastX}" cy="${lastY}" r="3"></circle>
            </svg>
        </div>
    `;
}

function renderBarChart(rows, label) {
    const usable = (Array.isArray(rows) ? rows : [])
        .map((row) => ({ label: row.label, value: numeric(row.value), color: row.color || '#69e7c3' }))
        .filter((row) => row.value !== null && row.value > 0)
        .slice(0, 8);
    if (!usable.length) return '<div class="capital-chart-empty">No positive values are available.</div>';
    const max = Math.max(...usable.map((row) => row.value));
    const height = Math.max(184, usable.length * 26 + 26);
    const bars = usable.map((row, index) => {
        const y = 12 + (index * 26);
        const width = Math.max(2, (row.value / max) * 500);
        return `
            <text x="4" y="${y + 12}" fill="#9fb2c5" font-size="9">${escapeHtml(truncate(row.label, 18))}</text>
            <rect x="135" y="${y}" width="${width.toFixed(2)}" height="14" rx="3" fill="${escapeHtml(row.color)}" opacity=".72"></rect>
            <text x="${Math.min(725, 142 + width)}" y="${y + 11}" fill="#cbd8e5" font-size="9">${escapeHtml(formatXtz(row.value))}</text>
        `;
    }).join('');
    return `<div class="capital-chart" role="img" aria-label="${escapeHtml(label)}"><svg viewBox="0 0 760 ${height}" style="height:${height}px" aria-hidden="true">${bars}</svg></div>`;
}

function kpi(label, value, note, tone = '') {
    return `
        <article class="capital-kpi"${tone ? ` data-tone="${escapeHtml(tone)}"` : ''}>
            <div class="capital-kpi-label">${escapeHtml(label)}</div>
            <div class="capital-kpi-value">${escapeHtml(value)}</div>
            <div class="capital-kpi-note">${escapeHtml(note)}</div>
        </article>
    `;
}

function panel(title, kicker, content, coverage = '', wide = false, className = '') {
    return `
        <section class="capital-panel${wide ? ' capital-panel-wide' : ''}${className ? ` ${escapeHtml(className)}` : ''}">
            <div class="capital-panel-head">
                <div><div class="capital-panel-kicker">${escapeHtml(kicker)}</div><h4>${escapeHtml(title)}</h4></div>
                ${coverage ? `<div class="capital-coverage">${escapeHtml(coverage)}</div>` : ''}
            </div>
            ${content}
        </section>
    `;
}

function compactCoverage(value) {
    if (value === null || value === undefined) return 'unavailable';
    if (Array.isArray(value)) return value.slice(0, 5).map((item) => typeof item === 'object' ? (item.id || item.name || 'row') : item).join(', ');
    if (typeof value === 'object') {
        return Object.entries(value).slice(0, 5).map(([key, item]) => `${key} ${typeof item === 'object' ? compactCoverage(item) : item}`).join(' · ');
    }
    return String(value);
}

function sourceBar(snapshot, sourceIds, receipt = '') {
    const sources = [...new Set(sourceIds)]
        .map((id) => snapshot.sources?.[id])
        .filter(Boolean);
    const links = sources.map((source) => {
            const url = safeExternalUrl(source.url);
            if (!url) return '';
            const status = source.status && source.status !== 'ok' ? ` · ${source.status}` : '';
            return `<a class="capital-source-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.label || source.credit || 'Source')}${escapeHtml(status)}</a>`;
        })
        .join('');
    const ledger = sources.map((source) => {
        const retrieved = source.retrievedAt ? formatTimestamp(source.retrievedAt) : 'Unavailable';
        const checked = source.checkedAt && source.checkedAt !== source.retrievedAt ? ` · checked ${formatTimestamp(source.checkedAt)}` : '';
        return `<article><strong>${escapeHtml(source.label || 'Source')}</strong><span class="is-${escapeHtml(source.status || 'unavailable')}">${escapeHtml(source.status || 'unavailable')}</span><p>Retrieved ${escapeHtml(retrieved)}${escapeHtml(checked)} · ${escapeHtml(compactCoverage(source.coverage))}</p></article>`;
    }).join('');
    return `
        <div class="capital-source-bar">
            <span class="capital-source-receipt">${renderChamberStamp(snapshot.generatedAt, 'Snapshot')}${receipt ? ` · ${escapeHtml(receipt)}` : ''}</span>
            ${links}
            <details class="capital-source-ledger">
                <summary>Inspect ${sources.length} source receipt${sources.length === 1 ? '' : 's'}</summary>
                <div>${ledger}</div>
            </details>
        </div>
    `;
}

function unavailableReceipt(snapshot, id) {
    const item = snapshot.unavailable?.find((row) => row.id === id);
    if (!item) return '';
    const requirements = Array.isArray(item.requirements) && item.requirements.length
        ? ` Needed: ${item.requirements.join('; ')}.`
        : '';
    return `
        <article class="capital-gap-card capital-unavailable">
            <span class="capital-gap-label">Unavailable · not calculated</span>
            <h4>${escapeHtml(item.label)}</h4>
            <p>${escapeHtml(item.reason)}${escapeHtml(requirements)}</p>
        </article>
    `;
}

function renderRangeControl(view) {
    const available = AVAILABLE_RANGES[view];
    if (!available?.size) return '';
    const ranges = RANGES.filter((range) => available.has(range.id));
    const selected = available.has(currentRange) ? currentRange : [...available].at(-1) || '30D';
    if (ranges.length === 1) {
        return `
            <div class="capital-range-wrap">
                <span class="capital-range-label">Range</span>
                <div class="capital-range capital-range-static" aria-label="Room chart range">
                    <span>${escapeHtml(ranges[0].label)} source window</span>
                </div>
            </div>
        `;
    }
    return `
        <div class="capital-range-wrap">
            <span class="capital-range-label">Range</span>
            <div class="capital-range" role="group" aria-label="Room chart range">
                ${ranges.map((range) => `<button class="capital-range-btn" type="button" data-capital-range="${range.id}" aria-pressed="${selected === range.id}">${range.label}</button>`).join('')}
            </div>
        </div>
    `;
}

function effectiveRange(view) {
    const available = AVAILABLE_RANGES[view];
    if (available?.has(currentRange)) return currentRange;
    return view === 'markets' ? '1Y' : '30D';
}

function returnFromHistory(rows, period) {
    const points = normalizePoints(rows, 'value');
    if (points.length < 2 || period === '1h' || period === '4h') return null;
    const end = points.at(-1);
    let targetTimestamp;
    const dayOffsets = { '24h': 1, '7d': 7, '30d': 30, '90d': 90, '180d': 180, '365d': 365 };
    if (dayOffsets[period]) targetTimestamp = end.timestamp - (dayOffsets[period] * DAY_MS);
    if (period === 'MTD') {
        const date = new Date(end.timestamp);
        targetTimestamp = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
    }
    if (period === 'QTD') {
        const date = new Date(end.timestamp);
        targetTimestamp = Date.UTC(date.getUTCFullYear(), Math.floor(date.getUTCMonth() / 3) * 3, 1);
    }
    if (!Number.isFinite(targetTimestamp)) return null;
    const start = points.reduce((candidate, point) => (
        Math.abs(point.timestamp - targetTimestamp) < Math.abs(candidate.timestamp - targetTimestamp) ? point : candidate
    ), points[0]);
    if (!start?.value || start.timestamp === end.timestamp) return null;
    if (period === '365d' && end.timestamp - start.timestamp < 350 * DAY_MS) return null;
    return ((end.value / start.value) - 1) * 100;
}

function renderReturnMatrix(snapshot) {
    const history = snapshot.markets.xtz?.priceHistory || {};
    const periods = ['1h', '4h', '24h', '7d', '30d', '90d', '180d', '365d', 'MTD', 'QTD'];
    const rows = periods.map((period) => `
        <tr>
            <td>${period}</td>
            ${['usd', 'btc', 'eth'].map((quote) => {
                const value = returnFromHistory(history[quote], period);
                return `<td class="is-number">${value === null ? '<span title="Intraday or full-period source data unavailable">—</span>' : escapeHtml(formatPct(value, { signed: true }))}</td>`;
            }).join('')}
        </tr>
    `).join('');
    return `
        <div class="capital-table-wrap"><table class="capital-table capital-return-table">
            <caption class="sr-only">XTZ return matrix from generated daily closes</caption>
            <thead><tr><th>Window</th><th class="is-number">USD</th><th class="is-number">BTC</th><th class="is-number">ETH</th></tr></thead>
            <tbody>${rows}</tbody>
        </table></div>
    `;
}

function tickerQuality(ticker) {
    const spread = numeric(ticker.bidAskSpreadPct);
    const up = numeric(ticker.costToMoveUpUsd);
    const down = numeric(ticker.costToMoveDownUsd);
    if (ticker.isStale || ticker.isAnomaly || (spread !== null && spread > 5) || up === 0 || down === 0) {
        return { id: 'bad', label: 'Quarantined' };
    }
    if (ticker.trustScore === 'red' || ticker.trustScore == null || (spread !== null && spread > 1.5) || (up !== null && up < 1000) || (down !== null && down < 1000)) {
        return { id: 'warn', label: 'Review' };
    }
    return { id: 'good', label: 'Usable' };
}

function renderTickerTable(tickers, caption, limit = 28) {
    const rows = tickers.slice(0, limit).map((ticker) => {
        const quality = tickerQuality(ticker);
        return `
            <tr class="capital-market-row">
                <td>${escapeHtml(ticker.market || 'Unknown')}</td>
                <td>${escapeHtml(`${ticker.base || 'XTZ'}/${ticker.target || '—'}`)}</td>
                <td class="is-number">${escapeHtml(formatUsd(ticker.convertedVolumeUsd))}</td>
                <td class="is-number">${escapeHtml(formatPct(ticker.bidAskSpreadPct))}</td>
                <td class="is-number">${escapeHtml(formatUsd(ticker.costToMoveUpUsd))}</td>
                <td class="is-number">${escapeHtml(formatUsd(ticker.costToMoveDownUsd))}</td>
                <td><span class="capital-quality is-${quality.id}">${quality.label}</span></td>
            </tr>
        `;
    }).join('');
    return `
        <div class="capital-table-wrap"><table class="capital-table">
            <caption class="sr-only">${escapeHtml(caption)}</caption>
            <thead><tr><th>Venue</th><th>Pair</th><th class="is-number">24h volume</th><th class="is-number">Spread</th><th class="is-number">+2% depth</th><th class="is-number">−2% depth</th><th>Quality</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="7">No rows.</td></tr>'}</tbody>
        </table></div>
    `;
}

function renderSystem(snapshot) {
    const range = effectiveRange('system');
    const tezos = chain(snapshot, 'tezos');
    const etherlink = chain(snapshot, 'etherlink');
    const tzStats = snapshot.network.tezos?.statistics || {};
    const tzAccounts = snapshot.network.tezos?.accounts || {};
    const tzTransactions = snapshot.network.tezos?.transactions || {};
    const tzFees = snapshot.network.tezos?.fees || {};
    const l2Counters = snapshot.network.etherlink?.counters || {};
    const l2Series = snapshot.network.etherlink?.series || {};
    const coin = snapshot.markets.xtz?.coin || {};
    const octez = snapshot.development?.octez || {};
    const totalStable = sum([tezos.stablecoins?.currentUsd, etherlink.stablecoins?.currentUsd], { requireAll: true });
    const totalTvl = sum([tezos.tvl?.currentUsd, etherlink.tvl?.currentUsd], { requireAll: true });
    const latestL1Day = tzTransactions.daily?.at(-1) || {};
    const latestCompleteL2Day = [...(l2Series.newTransactions || [])].reverse().find((row) => !row.approximate) || {};
    const latestL1FeeDay = tzFees.latestCompletedDay || {};
    const latestCompleteL2FeeDay = [...(l2Series.transactionFees || [])].reverse().find((row) => !row.approximate) || {};
    const latestCompleteL2AverageFee = [...(l2Series.averageTransactionFee || [])].reverse().find((row) => !row.approximate) || {};
    const completedL2TransactionFees = (l2Series.transactionFees || []).filter((row) => !row.approximate);
    const completedL2AverageFees = (l2Series.averageTransactionFee || []).filter((row) => !row.approximate);
    const completedL2GasPrices = (l2Series.averageGasPrice || []).filter((row) => !row.approximate);
    const weeklyL1 = sum((tzTransactions.daily || []).slice(-7).map((row) => row.count), { requireAll: true });
    const weeklyL2 = sum((l2Series.newTransactions || []).filter((row) => !row.approximate).slice(-7).map((row) => row.value), { requireAll: true });
    const l1FeeHistory = (tzFees.daily || []).map((row) => ({
        date: row.date,
        totalXtz: numeric(row.totalMutez) === null ? null : row.totalMutez / 1_000_000
    }));

    const tvlChart = renderChart([
        { label: 'Tezos L1 TVL', color: '#69e7c3', points: pointsForRange(tezos.tvl?.history, 'valueUsd', range) },
        { label: 'Etherlink L2 TVL', color: '#62b6ff', points: pointsForRange(etherlink.tvl?.history, 'valueUsd', range) }
    ], 'Tezos L1 and Etherlink L2 TVL history');
    const stableChart = renderChart([
        { label: 'Tezos L1 stablecoins', color: '#f3c969', points: pointsForRange(tezos.stablecoins?.history, 'valueUsd', range) },
        { label: 'Etherlink L2 stablecoins', color: '#f28ca8', points: pointsForRange(etherlink.stablecoins?.history, 'valueUsd', range) }
    ], 'Stablecoin value by layer');
    const activityChart = renderChart([
        { label: 'L1 applied transaction operations', color: '#69e7c3', points: pointsForRange(tzTransactions.daily, 'count', range) },
        { label: 'L2 EVM transactions', color: '#62b6ff', points: pointsForRange(l2Series.newTransactions, 'value', range) }
    ], 'Layer-specific transaction activity');
    const accountsChart = renderChart([
        { label: 'L2 active accounts', color: '#f3c969', points: pointsForRange(l2Series.activeAccounts, 'value', range) },
        { label: 'L2 new accounts · daily delta', color: '#f28ca8', points: pointsForRange(l2Series.newAccounts, 'value', range) }
    ], 'Etherlink active and new account history');
    const priceChart = renderChart([
        { label: 'XTZ / USD daily close', color: '#69e7c3', points: pointsForRange(snapshot.markets.xtz?.priceHistory?.usd, 'value', range) }
    ], 'XTZ USD daily price');
    const devChart = renderChart([
        { label: 'Octez commits', color: '#62b6ff', points: pointsForRange(octez.daily, 'commits', range) },
        { label: 'Distinct author-name strings', color: '#f3c969', points: pointsForRange(octez.daily, 'authors', range) }
    ], 'Canonical Octez development activity');
    const feeTotalChart = renderChart([
        { label: 'Tezos L1 block fee pools', color: '#69e7c3', points: pointsForRange(l1FeeHistory, 'totalXtz', range) },
        { label: 'Etherlink L2 transaction fees', color: '#62b6ff', points: pointsForRange(completedL2TransactionFees, 'value', range) }
    ], 'Daily transaction fees by layer in XTZ');
    const l2AverageFeeChart = renderChart([
        { label: 'Etherlink average transaction fee', color: '#f3c969', points: pointsForRange(completedL2AverageFees, 'value', range) }
    ], 'Etherlink average transaction fee in XTZ');
    const l2GasChart = renderChart([
        { label: 'Etherlink average gas price', color: '#f28ca8', points: pointsForRange(completedL2GasPrices, 'value', range) }
    ], 'Etherlink average gas price in gwei');
    const feeCoverage = range === '30D'
        ? '30D · completed UTC days by layer'
        : `${range} requested · L1 shows its available 30D; L2 follows the room range`;
    const gasPrices = l2Counters.gasPricesGwei || {};

    return `
        <div class="capital-kpi-grid">
            ${kpi('Tezos L1 TVL', formatUsd(tezos.tvl?.currentUsd), 'DefiLlama exact-chain row')}
            ${kpi('Etherlink L2 TVL', formatUsd(etherlink.tvl?.currentUsd), 'DefiLlama exact-chain row', 'blue')}
            ${kpi('Stablecoins · both layers', formatUsd(totalStable), 'Layer values summed; bridge overlap remains possible', 'gold')}
            ${kpi('XTZ / USD', formatUsd(coin.currentPriceUsd, false), `${formatPct(coin.change24hPct, { signed: true })} over 24h · ${priceFreshnessLabel(snapshot)}`, 'rose')}
            ${kpi('L1 daily avg operations', formatRate(numeric(latestL1Day.count) === null ? null : latestL1Day.count / 86400), `${latestL1Day.date || 'Unavailable'} · applied operations, not EVM TPS`, 'blue')}
            ${kpi('L2 daily avg transactions', formatRate(numeric(latestCompleteL2Day.value) === null ? null : latestCompleteL2Day.value / 86400), `${latestCompleteL2Day.date || 'Unavailable'} · completed-day EVM average`, 'gold')}
        </div>
        <div class="capital-proof-grid">
            <article class="capital-proof-card"><h4>One system, ${escapeHtml(formatUsd(totalTvl))} in DeFi TVL</h4><p>The headline can be read together, while every chart keeps L1 and L2 definitions separate. L1 applied operations are not relabelled as EVM transactions.</p></article>
            <article class="capital-proof-card"><h4>Tezos L1 accounts</h4><dl><dt>Total indexed</dt><dd>${escapeHtml(formatNumber(tzAccounts.total))}</dd><dt>Funded</dt><dd>${escapeHtml(formatNumber(tzAccounts.funded))}</dd><dt>Bakers</dt><dd>${escapeHtml(formatNumber(tzStats.totalBakers))}</dd><dt>Staking ratio</dt><dd>${escapeHtml(formatPct(tzStats.stakingRatioPct))}</dd></dl></article>
            <article class="capital-proof-card"><h4>Etherlink L2 counters</h4><dl><dt>Total addresses</dt><dd>${escapeHtml(formatNumber(l2Counters.totalAddresses))}</dd><dt>Total transactions</dt><dd>${escapeHtml(formatNumber(l2Counters.totalTransactions))}</dd><dt>Today · partial</dt><dd>${escapeHtml(formatNumber(l2Counters.transactionsToday))}</dd><dt>Block time</dt><dd>${escapeHtml(numeric(l2Counters.averageBlockTimeMs) === null ? 'Unavailable' : `${(l2Counters.averageBlockTimeMs / 1000).toFixed(2)}s`)}</dd></dl></article>
            <article class="capital-proof-card"><h4>Seven completed days</h4><dl><dt>L1 applied operations</dt><dd>${escapeHtml(formatNumber(weeklyL1))}</dd><dt>L2 EVM transactions</dt><dd>${escapeHtml(formatNumber(weeklyL2))}</dd></dl><p>These are parallel weekly rollups, never a combined transaction total.</p></article>
        </div>
        <section class="capital-cost-section" id="capital-network-costs" aria-labelledby="capital-network-costs-title">
            <div class="capital-section-head">
                <div><span>Network costs</span><h4 id="capital-network-costs-title">Fees by layer</h4></div>
                <p>Tezos L1 block fee pools and Etherlink L2 gas fees share an XTZ denomination, but remain separate receipts with different execution semantics.</p>
            </div>
            <div class="capital-kpi-grid">
                ${kpi('L1 fees · completed day', formatMutezAsXtz(latestL1FeeDay.totalMutez, 3), `${latestL1FeeDay.date || 'Unavailable'} · sum of indexed block fee pools`)}
                ${kpi('L1 average fee pool / block', formatMutezAsXtz(latestL1FeeDay.averagePerBlockMutez, 6), `${formatNumber(latestL1FeeDay.blockCount)} indexed blocks`, 'blue')}
                ${kpi('L2 fees · completed day', formatXtzExact(latestCompleteL2FeeDay.value, 3), `${latestCompleteL2FeeDay.date || 'Unavailable'} · Blockscout transaction fees`, 'gold')}
                ${kpi('L2 average fee / transaction', formatXtzExact(latestCompleteL2AverageFee.value, 6), `${latestCompleteL2AverageFee.date || 'Unavailable'} · completed-day average`, 'rose')}
            </div>
            <div class="capital-panel-grid">
                ${panel('Daily transaction fees', 'Layer receipts', feeTotalChart, feeCoverage, true)}
                ${panel('Etherlink average transaction fee', 'User cost', l2AverageFeeChart, `${range} · XTZ spent on gas per transaction`)}
                ${panel('Etherlink average gas price', 'Gas market', l2GasChart, `${range} · gwei per unit of gas`)}
            </div>
            <div class="capital-proof-grid" style="margin-top:12px">
                <article class="capital-proof-card"><h4>Live Etherlink gas oracle</h4><dl><dt>Slow</dt><dd>${escapeHtml(formatGwei(gasPrices.slow))}</dd><dt>Average</dt><dd>${escapeHtml(formatGwei(gasPrices.average))}</dd><dt>Fast</dt><dd>${escapeHtml(formatGwei(gasPrices.fast))}</dd></dl><p>Current Blockscout tiers; the historical chart uses completed daily averages.</p></article>
                <article class="capital-proof-card"><h4>No fictional combined total</h4><p>L1 totals are fees gathered into indexed blocks. L2 totals are XTZ spent on EVM gas. The Chamber aligns their clocks and units without adding them into a synthetic one-system number.</p></article>
                <article class="capital-proof-card"><h4>Coverage follows the receipts</h4><p>L1 history is intentionally bounded to ${escapeHtml(String(tzFees.coverage?.days || 0))} completed UTC days. Etherlink’s public stats service supplies the longer daily fee and gas series selected by the room range.</p></article>
            </div>
        </section>
        <div class="capital-panel-grid" style="margin-top:12px">
            ${panel('DeFi TVL by layer', 'Capital locked', tvlChart, `${range} · full DefiLlama daily history`)}
            ${panel('Stablecoins by layer', 'Dollar rails', stableChart, `${range} · all peg categories`)}
            ${panel('Activity stays layer-native', 'Transactions', activityChart, 'L1 is bounded to 30 completed UTC days; L2 history extends to 2Y')}
            ${panel('Account formation', 'Participation', accountsChart, `${range} · L2 time series; L1 current snapshot above`)}
            ${panel('XTZ market context', 'Native asset', priceChart, 'Up to 1Y of CoinGecko daily closes; longer room ranges clip to source coverage')}
            ${panel('Canonical Octez development', 'Builders', devChart, '28D canonical tezos/tezos master · merges and bots included')}
        </div>
        <div class="capital-proof-grid" style="margin-top:12px">
            ${unavailableReceipt(snapshot, 'proprietary-community-composite')}
            <article class="capital-proof-card"><h4>Existing Tezos Systems context</h4><p>Hot Today and the Daily Briefing remain the home for curated ecosystem news; this room does not duplicate them into a noisy capital feed.</p></article>
            <article class="capital-proof-card"><h4>Account counts are not people</h4><p>L1 indexed accounts and L2 addresses are layer-native counters. Cross-layer identities are not deduplicated into a fictional combined-wallet total.</p></article>
        </div>
        <nav class="capital-pathways" aria-label="Continue through system intelligence">
            <a class="capital-pathway" href="/pulse/">Network Pulse<small>Broader live network context</small></a>
            <a class="capital-pathway" href="/stake/">Staking Chamber<small>Staked supply, movement, and receipts</small></a>
            <a class="capital-pathway" href="/tezosx/">Tezos X<small>Deeper Etherlink activity and tokens</small></a>
            <a class="capital-pathway" href="/#hot-today">What's Hot Today<small>Curated news and unusual activity</small></a>
        </nav>
        ${sourceBar(snapshot, ['defillama', 'tzkt', 'etherlinkBlockscout', 'etherlinkStats', 'coingecko', 'gitlab'], 'Layer semantics, freshness, and bounded histories are disclosed per source')}
    `;
}

function renderMarkets(snapshot) {
    const range = effectiveRange('markets');
    const xtz = snapshot.markets.xtz || {};
    const coin = xtz.coin || {};
    const tickers = Array.isArray(xtz.tickers) ? [...xtz.tickers] : [];
    tickers.sort((a, b) => (numeric(b.convertedVolumeUsd) || 0) - (numeric(a.convertedVolumeUsd) || 0));
    const usable = tickers.filter((ticker) => tickerQuality(ticker).id !== 'bad');
    const quarantined = tickers.filter((ticker) => tickerQuality(ticker).id === 'bad');
    const priceChart = renderPriceHistory(xtz.priceHistory?.usd, range, coin);
    return `
        <div class="capital-panel-grid">
            ${panel('XTZ / USD daily close', 'Price history', priceChart, `${range} · daily close · ${priceFreshnessLabel(snapshot)}`, true, 'capital-market-price-panel')}
            ${panel('Return matrix', 'Relative performance', renderReturnMatrix(snapshot), '1h and 4h intentionally unavailable; daily-close basis', true)}
            ${panel('Venue tape', 'Quality-screened tickers', renderTickerTable(usable, 'CoinGecko XTZ market tickers requiring no quarantine'), `${usable.length} reviewable rows · showing up to 28`, true)}
            ${panel('Quarantine', 'Stale, anomalous, or structurally thin', renderTickerTable(quarantined, 'Quarantined CoinGecko XTZ ticker rows', 18), `${quarantined.length} of ${tickers.length} rows · no trading call to action`, true)}
        </div>
        <div class="capital-proof-grid" style="margin-top:12px">
            ${unavailableReceipt(snapshot, 'comprehensive-cex-net-flows')}
            <article class="capital-proof-card"><h4>Ticker quality is a receipt, not an endorsement</h4><p>Rows preserve provider stale/anomaly fields, spread, and reported ±2% depth. Missing trust scores remain Review; suspect rows are quarantined. The Chamber offers no Trade action.</p></article>
            <article class="capital-proof-card"><h4>Coverage boundary</h4><p>${escapeHtml(xtz.coverage?.tickerRows ?? tickers.length)} ticker rows from page ${escapeHtml(xtz.coverage?.tickerPage ?? 1)}; hard cap ${escapeHtml(xtz.coverage?.tickerHardCap ?? 'unknown')}. ${xtz.coverage?.tickerTruncated ? 'The venue set is truncated.' : 'The provider set was not truncated.'}</p></article>
        </div>
        <nav class="capital-pathways" aria-label="Continue through markets and flows">
            <a class="capital-pathway" href="/#price">Price Intelligence<small>Alerts and focused XTZ context</small></a>
            <a class="capital-pathway" href="/ledger-flow/">Ledger Flow<small>Inspectable on-chain movement</small></a>
            <a class="capital-pathway" href="/#whales">Large Tez Transfers<small>Live high-value movement</small></a>
            <a class="capital-pathway" href="/compare/">Chain Compare<small>Sourced cross-chain context</small></a>
        </nav>
        ${sourceBar(snapshot, ['coingecko'], `${xtz.coverage?.historyDays || 365} daily price points; ticker filters are client-side and inspectable`)}
    `;
}

function protocolRows(snapshot) {
    return snapshot.defi.chains.flatMap((network) => (network.protocols || []).map((protocol) => ({ ...protocol, network: network.label || network.id })));
}

function renderAssets(snapshot) {
    const protocols = protocolRows(snapshot).sort((a, b) => (numeric(b.tvlUsd) || 0) - (numeric(a.tvlUsd) || 0));
    const rwaProtocols = Array.isArray(snapshot.rwa?.protocols) ? snapshot.rwa.protocols : [];
    const tokens = Array.isArray(snapshot.rwa?.tokens) ? snapshot.rwa.tokens : [];
    const asset = snapshot.rwa?.assets?.find((row) => row.id === 'xu3o8') || snapshot.rwa?.assets?.[0] || {};
    const protocolTable = `
        <div class="capital-table-wrap"><table class="capital-table"><caption class="sr-only">Protocol TVL and exact-chain share</caption>
            <thead><tr><th>Protocol</th><th>Layer</th><th>Category</th><th class="is-number">TVL</th><th class="is-number">Index-row share</th></tr></thead>
            <tbody>${protocols.map((row) => `<tr><td>${escapeHtml(row.name)}</td><td>${escapeHtml(row.network)}</td><td>${escapeHtml(row.category || 'Other')}</td><td class="is-number">${escapeHtml(formatUsd(row.tvlUsd))}</td><td class="is-number">${escapeHtml(formatPct(row.sharePct))}</td></tr>`).join('')}</tbody>
        </table></div>`;
    const rwaProtocolTable = `
        <div class="capital-table-wrap"><table class="capital-table"><caption class="sr-only">Etherlink RWA protocol TVL</caption>
            <thead><tr><th>Protocol</th><th>Category</th><th>Chains</th><th class="is-number">TVL</th><th class="is-number">Etherlink TVL</th></tr></thead>
            <tbody>${rwaProtocols.map((row) => `<tr><td>${escapeHtml(row.name)}</td><td>${escapeHtml(row.category)}</td><td>${escapeHtml((row.chains || []).join(', '))}</td><td class="is-number">${escapeHtml(formatUsd(row.tvlUsd))}</td><td class="is-number">${escapeHtml(formatUsd(row.chainTvlUsd?.etherlink))}</td></tr>`).join('')}</tbody>
        </table></div>`;
    const tokenTable = `
        <div class="capital-table-wrap"><table class="capital-table"><caption class="sr-only">Mapped real-world asset tokens</caption>
            <thead><tr><th>Token</th><th>Provider</th><th>Network / contract</th><th>Verification</th></tr></thead>
            <tbody>${tokens.map((token) => {
                const platform = token.platforms?.[0] || {};
                return `<tr><td>${escapeHtml(token.symbol || token.name)}<br><small>${escapeHtml(token.name || '')}</small></td><td>${escapeHtml(token.provider || 'Unavailable')}</td><td>${escapeHtml(platform.network || 'Unavailable')}<br><small title="${escapeHtml(platform.contract || '')}">${escapeHtml(truncate(platform.contract, 22))}</small></td><td><span class="capital-quality is-warn">Registry mapping</span></td></tr>`;
            }).join('')}</tbody>
        </table></div>`;
    return `
        <div class="capital-kpi-grid">
            ${kpi('DeFi protocol rows', formatNumber(protocols.length), 'Exact-chain DefiLlama rows')}
            ${kpi('RWA protocols', formatNumber(rwaProtocols.length), 'Registry-discovered; not issuer verification', 'blue')}
            ${kpi('Mapped RWA tokens', formatNumber(tokens.length), 'CoinGecko platform-contract mappings', 'gold')}
            ${kpi('xU3O8 holders', formatNumber(asset.counters?.holders ?? asset.token?.holders), 'Current Etherlink Blockscout counter', 'rose')}
        </div>
        <div class="capital-panel-grid">
            ${panel('Protocol TVL index', 'Capital map', protocolTable, `${protocols.length} exact-chain rows · share uses the positive-row sum, not chain TVL`, true)}
            ${panel('RWA protocol capital', 'Etherlink registry', rwaProtocolTable, 'DefiLlama RWA registry rows; issuer verification is not implied', true)}
            ${panel('Mapped RWA token registry', 'Assets', tokenTable, 'Contract mappings only; provider prices and market caps were not collected', true)}
        </div>
        <div class="capital-proof-grid" style="margin-top:12px">
            <article class="capital-proof-card"><h4>xU3O8 issuer-confirmed contract</h4><p>${escapeHtml(asset.name || 'Uranium')} on Etherlink has a bounded issuer and Blockscout proofbook.</p><dl><dt>Contract</dt><dd>${escapeHtml(asset.contract || 'Unavailable')}</dd><dt>Total supply</dt><dd>${escapeHtml(formatNumber(asset.token?.totalSupply, 4))}</dd><dt>Exchange rate</dt><dd>${escapeHtml(formatUsd(asset.token?.exchangeRateUsd, false))}</dd><dt>Transfers</dt><dd>${escapeHtml(formatNumber(asset.counters?.transfers))}</dd><dt>Latest receipt</dt><dd>${escapeHtml(formatDate(asset.latestTransfer?.timestamp))}</dd></dl></article>
            <article class="capital-proof-card"><h4>Proof boundary</h4><p>Issuer confirmation identifies the contract. Current token counters and only the latest transfer come from Blockscout; this snapshot does not reconstruct a historical transfer ledger.</p></article>
            ${unavailableReceipt(snapshot, 'xu3o8-sruuf-return-spread')}
        </div>
        <div class="capital-proof-grid" style="margin-top:12px">
            <article class="capital-gap-card"><span class="capital-gap-label">Bounded v1 coverage</span><h4>General ecosystem token parity</h4><p>The current snapshot does not claim a comparable price, FDV, active-address, and transaction table across every L1 and L2 token. Etherlink token detail continues in Tezos X; registry-only rows stay visibly separate here.</p></article>
            <article class="capital-gap-card"><span class="capital-gap-label">Bounded v1 coverage</span><h4>Protocol and xU3O8 histories</h4><p>Protocol rows are current snapshots. xU3O8 exposes current holders, counters, and one latest receipt—not holder growth, top contracts by transfer volume, or a reconstructed usage ledger.</p></article>
            <article class="capital-proof-card"><h4>Why the boundary matters</h4><p>Transfer events alone do not prove a holder snapshot, economic usage, or comparable active addresses. A future backfill needs versioned pagination and complete-address methodology before those charts can be labelled honestly.</p></article>
        </div>
        <nav class="capital-pathways" aria-label="Continue through assets and flows">
            <a class="capital-pathway" href="/tezosx/">Tezos X<small>Etherlink token and activity detail</small></a>
            <a class="capital-pathway" href="/minerals/">Critical Minerals<small>Strategic supply, market, and source receipts</small></a>
            <a class="capital-pathway" href="/uranium/">Uranium<small>xU3O8 markets and receipt-bounded custody evidence</small></a>
            <a class="capital-pathway" href="/metals/">Precious Metals<small>Eight-metal markets and VNXAU chain receipts</small></a>
            <a class="capital-pathway" href="/#price">Price Intelligence<small>Focused XTZ market context</small></a>
        </nav>
        ${sourceBar(snapshot, ['defillama', 'defillamaRwa', 'coingeckoRwa', 'uraniumIssuer', 'etherlinkBlockscoutRwa'], 'Third-party registry discovery is labelled separately from issuer-confirmed proof')}
    `;
}

function renderLeaderTable(rows, caption, roleLabel) {
    return `
        <div class="capital-table-wrap"><table class="capital-table"><caption class="sr-only">${escapeHtml(caption)}</caption>
            <thead><tr><th>Rank</th><th>${escapeHtml(roleLabel)}</th><th>Address</th><th class="is-number">Gross volume</th></tr></thead>
            <tbody>${rows.slice(0, 12).map((row, index) => `<tr><td>${escapeHtml(row.rank || index + 1)}</td><td>${escapeHtml(row.name || 'Unnamed')}</td><td title="${escapeHtml(row.address)}">${escapeHtml(truncate(row.address, 20))}</td><td class="is-number">${escapeHtml(formatXtz(row.volumeXtz))}</td></tr>`).join('')}</tbody>
        </table></div>`;
}

function renderArt(snapshot) {
    const art = snapshot.art || {};
    const marketplaces = Array.isArray(art.marketplaces) ? [...art.marketplaces] : [];
    marketplaces.sort((a, b) => (numeric(b.volumeXtz) || 0) - (numeric(a.volumeXtz) || 0));
    const grossVolume = sum(marketplaces.map((row) => row.volumeXtz));
    const grossSales = sum(marketplaces.map((row) => row.salesCount));
    const mintEditions = sum((art.dailyMints || []).map((row) => row.mints));
    const participantRoles = sum(marketplaces.flatMap((row) => [row.buyers, row.sellers]));
    const coveredDailySales = (art.dailySales || []).filter((row) => row.coverage !== 'uncovered');
    const coveredDailyMints = (art.dailyMints || []).filter((row) => row.coverage !== 'uncovered');
    const marketChart = renderBarChart(marketplaces.map((row) => ({ label: row.name, value: row.volumeXtz })), 'Gross marketplace volume over the bounded OBJKT window');
    const marketplaceRows = marketplaces.map((row) => {
        const volume = numeric(row.volumeXtz);
        const share = volume !== null && numeric(grossVolume) !== null && grossVolume > 0 ? (volume / grossVolume) * 100 : null;
        return `<tr><td>${escapeHtml(row.name || row.id || 'Unknown')}</td><td class="is-number">${escapeHtml(formatXtz(row.volumeXtz))}</td><td class="is-number">${escapeHtml(formatPct(share))}</td><td class="is-number">${escapeHtml(formatNumber(row.salesCount))}</td><td class="is-number">${escapeHtml(formatNumber(row.buyers))}</td><td class="is-number">${escapeHtml(formatNumber(row.sellers))}</td></tr>`;
    }).join('');
    const marketplaceTable = `<div class="capital-table-wrap"><table class="capital-table"><caption class="sr-only">Marketplace gross-volume share and participant roles</caption><thead><tr><th>Marketplace</th><th class="is-number">Gross volume</th><th class="is-number">Volume share</th><th class="is-number">Sales</th><th class="is-number">Buyer roles</th><th class="is-number">Seller roles</th></tr></thead><tbody>${marketplaceRows}</tbody></table></div>`;
    const salesChart = renderChart([
        { label: 'Gross sale volume · XTZ', color: '#69e7c3', points: pointsForRange(coveredDailySales, 'volumeXtz', '30D') }
    ], 'Daily gross art sale volume');
    const mintChart = renderChart([
        { label: 'Minted editions', color: '#f3c969', points: pointsForRange(coveredDailyMints, 'mints', '30D') },
        { label: 'Mint operations', color: '#62b6ff', points: pointsForRange(coveredDailyMints, 'mintOperations', '30D') }
    ], 'Daily Tezos art mint activity');
    const collectionRows = (art.topCollections30d || []).slice(0, 16).map((row) => `<tr><td>${escapeHtml(row.name || 'Unnamed')}</td><td title="${escapeHtml(row.contract)}">${escapeHtml(truncate(row.contract, 21))}</td><td class="is-number">${escapeHtml(formatNumber(row.salesCount))}</td><td class="is-number">${escapeHtml(formatXtz(row.volumeXtz))}</td><td class="is-number">${escapeHtml(formatNumber(row.buyers))}</td><td class="is-number">${escapeHtml(formatNumber(row.sellers))}</td></tr>`).join('');
    const collectionTable = `<div class="capital-table-wrap"><table class="capital-table"><caption class="sr-only">Top collections in the bounded 30-day sales prefix</caption><thead><tr><th>Collection</th><th>Contract</th><th class="is-number">Sales</th><th class="is-number">Gross volume</th><th class="is-number">Buyers</th><th class="is-number">Sellers</th></tr></thead><tbody>${collectionRows}</tbody></table></div>`;
    return `
        <div class="capital-kpi-grid">
            ${kpi('Gross marketplace volume', formatXtz(grossVolume), 'Summed marketplace groups; not creator profit')}
            ${kpi('Indexed sales', formatNumber(grossSales), 'Most-recent bounded sales prefix', 'blue')}
            ${kpi('Minted editions', formatNumber(mintEditions), 'Editions, distinct from mint operations', 'gold')}
            ${kpi('Buyer + seller roles', formatNumber(participantRoles), 'Marketplace-summed roles; not unique people', 'rose')}
        </div>
        <div class="capital-panel-grid">
            ${panel('Marketplace gross volume', '30-day economy', marketChart, `${marketplaces.length} indexed marketplace groups · raw XTZ, not percentage share`)}
            ${panel('Marketplace share + roles', 'Market structure', marketplaceTable, 'Shares use the bounded gross-volume total; roles are not deduplicated people', true)}
            ${panel('Gross daily sale volume', 'Sales', salesChart, 'Uncovered days render as gaps, not zero; partial days remain labelled in the source receipt')}
            ${panel('Mints', 'Creation', mintChart, 'Mint editions and operations remain separate')}
            ${panel('Top collections · 30D', 'Collections', collectionTable, 'Up to 16 shown from a 50-row bounded set', true)}
            ${panel('Top buyers · 30D', 'Collectors', renderLeaderTable(art.topBuyers30d || [], 'Top art buyers', 'Buyer'), 'Gross purchase volume; not profit')}
            ${panel('Top artists · 30D', 'Creators', renderLeaderTable(art.topArtists30d || [], 'Top artists by sales volume', 'Artist'), 'Gross sale volume; not creator net earnings')}
        </div>
        <div class="capital-proof-grid" style="margin-top:12px">
            <article class="capital-proof-card"><h4>Gross, never net</h4><p>${escapeHtml(art.coverage?.saleVolumeDefinition || 'Listing-sale volume is gross and is not creator earnings or trader profit.')}</p></article>
            <article class="capital-proof-card"><h4>Coverage is bounded</h4><p>${escapeHtml((art.coverage?.notes || []).join(' '))}</p></article>
            <article class="capital-proof-card"><h4>Lifetime collections</h4><p>${escapeHtml(formatNumber(art.topCollectionsLifetime?.length || 0))} live FA2 collection rows are retained separately from the bounded 30-day sales reconstruction.</p></article>
        </div>
        <div class="capital-proof-grid" style="margin-top:12px">
            <article class="capital-gap-card"><span class="capital-gap-label">Methodology boundary</span><h4>Unique users and transactions per user</h4><p>Buyer and seller roles are unique only inside each marketplace group and may overlap with one another or across markets. The Chamber does not divide transactions by that non-deduplicated role sum and call it users.</p></article>
            <article class="capital-proof-card"><h4>Marketplace share denominator</h4><p>Each percentage uses the sum of the bounded OBJKT-indexed marketplace groups shown here. It is not a claim about every historical or independent Tezos marketplace.</p></article>
            <article class="capital-proof-card"><h4>Creation is separate</h4><p>Minted editions, mint operations, sales, and collection volume remain distinct measures; uncovered source days render as gaps instead of invented zero activity.</p></article>
        </div>
        <nav class="capital-pathways" aria-label="Continue through Tezos art and identity">
            <a class="capital-pathway" href="/hen/">Enter HEN mode<small>Collecting history and Tezos art identity</small></a>
            <a class="capital-pathway" href="/maxis/">Open Tezos Maxis<small>Inspect ongoing ecosystem identities</small></a>
            <a class="capital-pathway" href="#whales">Whale Watch<small>Follow large on-chain movements</small></a>
            <a class="capital-pathway" href="#history">Protocol Anthology<small>Place the economy in protocol time</small></a>
        </nav>
        ${sourceBar(snapshot, ['objkt'], `Tezos L1 only · ${art.windowDays || 30}D bounded window · gross sale and mint definitions disclosed`)}
    `;
}

function renderView(snapshot) {
    if (currentView === 'markets') return renderMarkets(snapshot);
    if (currentView === 'assets') return renderAssets(snapshot);
    if (currentView === 'art') return renderArt(snapshot);
    return renderSystem(snapshot);
}

function freshnessPresentation(snapshot) {
    const generated = Date.parse(snapshot.generatedAt);
    const stale = !Number.isFinite(generated) || Date.now() - generated > STALE_AFTER_MS;
    const label = lastRefreshError
        ? `Last good ${ageLabel(snapshot.generatedAt)} · refresh failed · ${GENERATED_PROOFBOOK_SCHEDULE_LABEL}`
        : `Generated ${ageLabel(snapshot.generatedAt)} · ${GENERATED_PROOFBOOK_SCHEDULE_LABEL}`;
    return { label, stale: stale || Boolean(lastRefreshError) };
}

function syncCapitalFreshness(snapshot) {
    setChamberReadingState(document.getElementById('capital-chamber-body'), lastRefreshError || freshnessPresentation(snapshot).stale ? 'watch' : 'snapshot');
    syncSnapshotStatus(document.getElementById('capital-chamber-body'), savedSnapshot, lastRefreshError);
    const presentation = freshnessPresentation(snapshot);
    const freshness = document.getElementById('capital-freshness');
    if (freshness) {
        quietlySyncHtml(freshness, renderAgeingLabel(presentation.label, snapshot.generatedAt, ageLabel(snapshot.generatedAt)));
        freshness.classList.toggle('is-stale', presentation.stale);
    }
    const entrySource = document.querySelector('#capital-entry-front .capital-entry-source-label');
    const entryLabel = `snapshot ${ageLabel(snapshot.generatedAt)} · ${GENERATED_PROOFBOOK_SCHEDULE_LABEL}`;
    if (entrySource && entrySource.textContent !== entryLabel) entrySource.textContent = entryLabel;
}

function capitalReading(snapshot) {
    const tezos = chain(snapshot, 'tezos');
    const etherlink = chain(snapshot, 'etherlink');
    return renderChamberVerdict({ key: 'capital', state: lastRefreshError || freshnessPresentation(snapshot).stale ? 'watch' : 'snapshot',
        sentence: 'Tezos L1 and Etherlink capital are shown side by side; TVL is not trading volume or a measure of users.',
        receipts: [['L1 DeFi TVL', formatUsd(tezos.tvl?.currentUsd)], ['L2 DeFi TVL', formatUsd(etherlink.tvl?.currentUsd)]]
    });
}

function renderChamber(snapshot) {
    const view = VIEWS.find((item) => item.id === currentView) || VIEWS[0];
    const freshness = freshnessPresentation(snapshot);
    return `
        <header class="capital-header market-room-header" data-quiet-key="capital-header">
            <div class="capital-system-strip market-room-system-strip"><strong>Tezos Systems</strong><span aria-hidden="true">/</span><span>public-source capital intelligence</span></div>
            <div class="capital-title-row market-room-title-row">
                <h2 class="market-room-title is-display" id="capital-title">Capital Chamber</h2>
                <span class="capital-badge market-room-badge">Generated proofbook</span>
                <span class="capital-freshness market-room-freshness${freshness.stale ? ' is-stale' : ''}" id="capital-freshness">${renderAgeingLabel(freshness.label, snapshot.generatedAt, ageLabel(snapshot.generatedAt))}</span>
            </div>
            ${snapshotStatusMarkup(savedSnapshot, lastRefreshError, snapshot.sources)}

        </header><div class="capital-tabs market-room-tabs" role="tablist" aria-label="Capital Chamber views">
                ${VIEWS.map((item) => `<button class="capital-tab market-room-tab" id="capital-tab-${item.id}" type="button" role="tab" aria-selected="${item.id === currentView}" aria-controls="capital-view-panel" tabindex="${item.id === currentView ? '0' : '-1'}" data-capital-view="${item.id}">${escapeHtml(item.label)}</button>`).join('')}
            </div>
        ${capitalReading(snapshot)}
        <section class="capital-view-shell market-room-view-shell" id="capital-view-panel" role="tabpanel" aria-labelledby="capital-tab-${view.id}" data-quiet-key="capital-view-panel">
            <div class="capital-view-head market-room-view-head">
                <div><h3>${escapeHtml(view.title)}</h3><p>${escapeHtml(view.detail)}</p></div>
                ${renderRangeControl(view.id)}
            </div>
            <div class="market-room-view-content" id="capital-view-content" data-quiet-key="capital-view-content">${renderView(snapshot)}</div>
        </section>
        ${renderChamberGuide('capital')}
    `;
}

function renderLoading(body) {
    body.innerHTML = chamberSkeleton({
        title: 'Capital Chamber', titleId: 'capital-title',
        sections: ["Tezos L1 + Etherlink L2","Markets","Assets + RWA","Art economy"]
    });
}

function renderError(body, error) {
    body.innerHTML = `<div class="capital-error chamber-state chamber-state-error"><div><strong>Capital snapshot unavailable</strong><span>${escapeHtml(error?.message || error || 'The generated snapshot could not be loaded.')}</span><br><button class="chamber-action" type="button" data-capital-retry>Retry</button></div></div>`;
}

function renderBody(snapshot, { quiet = false } = {}) {
    const body = document.getElementById('capital-chamber-body');
    if (!body || !snapshot) return;
    const markup = renderChamber(snapshot);
    syncChamberReading(body, markup, { quiet: quiet && body.dataset.capitalRendered === '1' });
    body.dataset.capitalRendered = '1';
}

function entryMarkup(snapshot) {
    const tezos = chain(snapshot, 'tezos');
    const etherlink = chain(snapshot, 'etherlink');
    const totalTvl = sum([tezos.tvl?.currentUsd, etherlink.tvl?.currentUsd], { requireAll: true });
    const totalStable = sum([tezos.stablecoins?.currentUsd, etherlink.stablecoins?.currentUsd], { requireAll: true });
    const coin = snapshot.markets.xtz?.coin || {};
    return `
        <div>
            <div class="capital-entry-title-line"><h2 class="stat-label" id="capital-entry-title">Capital Chamber</h2><span class="capital-entry-chip">Public-source</span></div>
            <div class="stat-value capital-entry-value">${escapeHtml(formatUsd(totalTvl))}</div>
            <div class="capital-source-line"><span class="stat-description">One-system DeFi TVL</span><span class="capital-entry-source-label">snapshot ${escapeHtml(ageLabel(snapshot.generatedAt))} · ${escapeHtml(GENERATED_PROOFBOOK_SCHEDULE_LABEL)}</span></div>
        </div>
        <div class="capital-entry-kpis">
            <div class="capital-entry-kpi"><span>Tezos L1 TVL</span><strong>${escapeHtml(formatUsd(tezos.tvl?.currentUsd))}</strong><small>Exact-chain</small></div>
            <div class="capital-entry-kpi"><span>Etherlink L2 TVL</span><strong>${escapeHtml(formatUsd(etherlink.tvl?.currentUsd))}</strong><small>Exact-chain</small></div>
            <div class="capital-entry-kpi"><span>Stablecoins</span><strong>${escapeHtml(formatUsd(totalStable))}</strong><small>Both layers</small></div>
            <div class="capital-entry-kpi"><span>XTZ</span><strong>${escapeHtml(formatUsd(coin.currentPriceUsd, false))}</strong><small>${escapeHtml(formatPct(coin.change24hPct, { signed: true }))} · 24h · ${escapeHtml(priceFreshnessLabel(snapshot))}</small></div>
        </div>
        ${renderEntryPriceHistory(snapshot.markets.xtz?.priceHistory?.usd)}
    `;
}

function updateEntry(snapshot, { quiet = false } = {}) {
    const front = document.getElementById('capital-entry-front');
    if (!front || !snapshot) return;
    const markup = entryMarkup(snapshot);
    if (quiet && front.dataset.capitalRendered === '1') quietlySyncHtml(front, markup);
    else front.innerHTML = markup;
    front.dataset.capitalRendered = '1';
    const card = document.getElementById('capital-entry-card');
    delete card?.dataset.updatedLabel;
    window.syncChamberEntryFooters?.(card);
    wireEntry(card);
}

function markRefreshFailure() {
    syncSnapshotStatus(document.getElementById('capital-chamber-body'), savedSnapshot, lastRefreshError);
    const freshness = document.getElementById('capital-freshness');
    if (freshness && lastSnapshot) {
        const failedLabel = `Last good ${ageLabel(lastSnapshot.generatedAt)} · refresh failed · ${GENERATED_PROOFBOOK_SCHEDULE_LABEL}`;
        quietlySyncHtml(freshness, renderAgeingLabel(failedLabel, lastSnapshot.generatedAt, ageLabel(lastSnapshot.generatedAt)));
        setChamberReadingState(document.getElementById('capital-chamber-body'), 'watch');
        freshness.classList.add('is-stale');
    }
    const card = document.getElementById('capital-entry-card');
    if (card && lastSnapshot) {
        card.dataset.updatedLabel = `Last good ${ageLabel(lastSnapshot.generatedAt)} · refresh failed · ${GENERATED_PROOFBOOK_SCHEDULE_LABEL}`;
        window.syncChamberEntryFooters?.(card);
    }
}

function isCapitalRoute() {
    return window.location.pathname.replace(/\/+$/, '') === '/capital';
}

function routeView() {
    if (!isCapitalRoute()) return '';
    const value = new URL(window.location.href).searchParams.get('view') || '';
    return VIEW_IDS.has(value) ? value : '';
}

function routeFocus() {
    if (!isCapitalRoute()) return '';
    return new URL(window.location.href).searchParams.get('focus') === 'fees' ? 'fees' : '';
}

function updateRouteView() {
    if (!isCapitalRoute()) return;
    const url = new URL(window.location.href);
    url.searchParams.set('view', currentView);
    url.searchParams.delete('focus');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

function bindBodyEvents(body) {
    if (!body || body.dataset.capitalEventsWired === '1') return;
    body.dataset.capitalEventsWired = '1';
    body.addEventListener('click', (event) => {
        const viewButton = event.target.closest('[data-capital-view]');
        if (viewButton && VIEW_IDS.has(viewButton.dataset.capitalView)) {
            currentView = viewButton.dataset.capitalView;
            updateRouteView();
            renderBody(lastSnapshot);
            focusChamberTab(document.getElementById(`capital-tab-${currentView}`));
            return;
        }
        const rangeButton = event.target.closest('[data-capital-range]');
        if (rangeButton && !rangeButton.disabled && RANGE_BY_ID.has(rangeButton.dataset.capitalRange)) {
            currentRange = rangeButton.dataset.capitalRange;
            renderBody(lastSnapshot);
            return;
        }
        if (event.target.closest('[data-capital-retry]')) refreshCapitalChamber({ quiet: false });
    });
    body.addEventListener('keydown', (event) => {
        const activeTab = event.target.closest('[role="tab"][data-capital-view]');
        if (!activeTab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const index = VIEWS.findIndex(({ id }) => id === activeTab.dataset.capitalView);
        let next = index;
        if (event.key === 'ArrowLeft') next = (index - 1 + VIEWS.length) % VIEWS.length;
        if (event.key === 'ArrowRight') next = (index + 1) % VIEWS.length;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = VIEWS.length - 1;
        currentView = VIEWS[next].id;
        updateRouteView();
        renderBody(lastSnapshot);
        focusChamberTab(document.getElementById(`capital-tab-${currentView}`));
    });
}

function ensureOverlay() {
    let overlay = document.getElementById('capital-modal');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'capital-modal';
    overlay.className = 'modal-overlay chamber-overlay capital-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
        <div class="modal-content modal-large chamber-content capital-content market-room-shell" role="dialog" aria-modal="true" aria-labelledby="capital-title">
            <button class="modal-close chamber-close" type="button" aria-label="Close Capital Chamber">&times;</button>
            <div class="capital-body market-room-body" id="capital-chamber-body"></div>
        </div>
    `;
    overlay.querySelector('.chamber-close').addEventListener('click', closeCapitalChamber);
    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) closeCapitalChamber();
    });
    bindBodyEvents(overlay.querySelector('.capital-body'));
    document.body.appendChild(overlay);
    return overlay;
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
    document.body.style.overflow = savedBodyOverflow;
    document.documentElement.style.overflow = savedHtmlOverflow || '';
    savedBodyOverflow = null;
    savedHtmlOverflow = null;
}

function refreshInterval() {
    const override = numeric(window.__CAPITAL_CHAMBER_REFRESH_MS__);
    return override !== null && override >= 1000 ? override : DEFAULT_REFRESH_MS;
}

function stopRefreshTimer() {
    if (chamberTimer) window.clearInterval(chamberTimer);
    chamberTimer = null;
}

function startRefreshTimer() {
    stopRefreshTimer();
    chamberTimer = window.setInterval(() => {
        if (document.visibilityState !== 'visible') {
            refreshDeferred = true;
            return;
        }
        refreshCapitalChamber({ quiet: true });
    }, refreshInterval());
}

function bindVisibilityRefresh() {
    if (visibilityReady) return;
    visibilityReady = true;
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;
        if (entryRefreshDeferred) {
            entryRefreshDeferred = false;
            refreshCapitalEntry({ quiet: true });
        }
        const overlayOpen = document.getElementById('capital-modal')?.classList.contains('active');
        if (!refreshDeferred && !overlayOpen) return;
        refreshDeferred = false;
        refreshCapitalChamber({ quiet: true });
    });
}

async function refreshCapitalEntry({ quiet = true } = {}) {
    if (document.visibilityState !== 'visible') {
        entryRefreshDeferred = true;
        return lastSnapshot || lastEntrySummary;
    }
    try {
        const summary = await fetchCapitalEntrySummary();
        if (document.visibilityState !== 'visible') {
            entryRefreshDeferred = true;
            return lastSnapshot || lastEntrySummary;
        }
        lastEntrySummary = summary;
        entryRefreshDeferred = false;
        if (lastSnapshot) return lastSnapshot;
        updateEntry(summary, { quiet });
        return summary;
    } catch (error) {
        if (document.visibilityState !== 'visible') {
            entryRefreshDeferred = true;
            return lastSnapshot || lastEntrySummary;
        }
        console.warn('Capital Chamber entry summary refresh failed; retaining the last good launcher:', error);
        entryRefreshDeferred = true;
        const retained = lastEntrySummary || lastSnapshot;
        if (!retained) markCapitalEntryUnavailable(error);
        return retained;
    }
}

function markCapitalEntryUnavailable(error) {
    const card = document.getElementById('capital-entry-card');
    if (!card) return;
    const value = card.querySelector('.capital-entry-value');
    if (value) {
        value.textContent = 'Unavailable';
        value.setAttribute('role', 'status');
        value.setAttribute('aria-live', 'polite');
    }
    const kpis = card.querySelector('.capital-entry-kpis');
    if (kpis) kpis.innerHTML = '<div class="capital-entry-kpi"><span>Generated snapshot</span><strong>Unavailable</strong><small>No verified launcher receipt</small></div>';
    const history = card.querySelector('.capital-entry-price-empty');
    if (history) history.textContent = 'Open the Chamber to retry the proofbook.';
    card.classList.add('chamber-data-stale');
    card.dataset.updatedLabel = 'Unavailable · refresh failed · no last-good receipt';
    card.title = error?.message || 'Capital launcher receipt unavailable';
    window.syncChamberEntryFooters?.(card);
}

async function refreshCapitalChamber({ quiet = true, initial = false } = {}) {
    // Only a requested, not-yet-painted room may finish its initial load hidden.
    // All repeat rendering, network polling, and catch-up work remain gated.
    const mayRender = () => document.visibilityState === 'visible'
        || (initial && !lastSnapshot && document.getElementById('capital-modal')?.classList.contains('active'));
    if (!mayRender()) {
        refreshDeferred = true;
        return lastSnapshot;
    }
    if (chamberRefreshWork) return chamberRefreshWork;
    quiet = quiet || Boolean(lastSnapshot);
    chamberRefreshWork = (async () => {
        try {
            const hadRefreshError = Boolean(lastRefreshError);
            const result = pendingSnapshotRefresh || await resolveCapitalSnapshotRefresh();
            const { snapshot, changed } = result;
            if (!mayRender()) {
                pendingSnapshotRefresh = result;
                refreshDeferred = true;
                return lastSnapshot;
            }
            pendingSnapshotRefresh = null;
            lastSnapshot = snapshot;
            savedSnapshot = false;
            lastRefreshError = '';
            refreshDeferred = document.visibilityState !== 'visible';
            if (document.visibilityState === 'visible') {
                if (changed || hadRefreshError) updateEntry(snapshot, { quiet: true });
                else syncCapitalFreshness(snapshot);
            }
            if ((changed || hadRefreshError) && document.getElementById('capital-modal')?.classList.contains('active')) {
                renderBody(snapshot, { quiet });
            }
            return snapshot;
        } catch (error) {
            if (!mayRender()) {
                refreshDeferred = true;
                return lastSnapshot;
            }
            console.warn('Capital Chamber snapshot refresh failed:', error);
            lastRefreshError = error?.message || String(error);
            markRefreshFailure();
            const body = document.getElementById('capital-chamber-body');
            if (!lastSnapshot && body && document.getElementById('capital-modal')?.classList.contains('active')) {
                renderError(body, error);
            }
            return lastSnapshot;
        }
    })().finally(() => { chamberRefreshWork = null; });
    return chamberRefreshWork;
}

function ensureEntryCard() {
    const existing = document.getElementById('capital-entry-card');
    if (existing) return existing;
    const grid = document.getElementById('chambers-grid');
    if (!grid) return null;
    const card = document.createElement('article');
    card.id = 'capital-entry-card';
    card.className = 'stat-card chamber-entry-card chamber-entry-wide chamber-entry-live capital-entry-card';
    card.dataset.chamberEntrySize = 'wide';
    card.innerHTML = `
        <button class="card-copy-link" type="button" data-copy-hash="#capital" aria-label="Copy Capital Chamber direct link" title="Copy Capital Chamber link">&#128279;</button>
        <div class="card-inner">
            <div class="card-front chamber-entry-front capital-entry-front" id="capital-entry-front">
                <div><div class="capital-entry-title-line"><h2 class="stat-label" id="capital-entry-title">Capital Chamber</h2><span class="capital-entry-chip">Public-source</span></div><div class="stat-value capital-entry-value">Loading proofbook</div><div class="stat-description">Tezos and Etherlink capital intelligence</div></div>
                <div class="capital-entry-kpis"><div class="capital-entry-kpi"><span>Generated snapshot</span><strong>Loading</strong><small>First-party JSON only</small></div></div>
                <div class="capital-entry-price-empty">Loading 90D XTZ history</div>
            </div>
        </div>
    `;
    grid.appendChild(card);
    return card;
}

function wireEntry(card) {
    if (!card) return;
    wireChamberLauncher(card, {
        open: openCapitalChamber,
        label: 'Open Capital Chamber',
        titleSelector: '#capital-entry-title, .stat-label'
    });
}

export async function openCapitalChamber({ isCurrent = () => true } = {}) {
    const opening = ++openEpoch;
    const cached = !lastSnapshot ? snapshotCache.read() : null;
    await ensureCapitalCss();
    if (opening !== openEpoch || !isCurrent()) return;
    bindVisibilityRefresh();
    const route = routeView();
    const focus = routeFocus();
    if (route) currentView = route;
    const overlay = ensureOverlay();
    const body = overlay.querySelector('.capital-body');
    overlay.classList.add('active');
    lockPageScroll();
    if (lastSnapshot) renderBody(lastSnapshot);
    else renderLoading(body);
    getChamberScrollContainer(body).scrollTop = 0;
    activateChamberDialog(overlay, {
        close: closeCapitalChamber,
        dialogSelector: '.capital-content',
        titleId: 'capital-title',
        label: 'Capital Chamber',
        initialFocusSelector: '.chamber-close'
    });
    const retained = await cached;
    if (opening !== openEpoch || !overlay.classList.contains('active')) return;
    if (!lastSnapshot && retained) {
        lastSnapshot = retained.snapshot;
        lastEntrySummary ||= retained.summary;
        savedSnapshot = true;
        renderBody(lastSnapshot, { quiet: true });
    }
    await refreshCapitalChamber({ quiet: true, initial: true });
    if (focus === 'fees' && opening === openEpoch && getChamberScrollContainer(body).scrollTop === 0 && overlay.classList.contains('active')) {
        const target = document.getElementById('capital-network-costs');
        const rail = body.querySelector('.capital-tabs');
        const scroll = getChamberScrollContainer(body);
        if (target) scroll.scrollTop += target.getBoundingClientRect().top - scroll.getBoundingClientRect().top - (rail?.offsetHeight || 0) - 12;
    }
    if (opening === openEpoch && overlay.classList.contains('active')) startRefreshTimer();
}

export function closeCapitalChamber() {
    const overlay = document.getElementById('capital-modal');
    if (!requestChamberClose(overlay)) return;
    openEpoch += 1;
    stopRefreshTimer();
    overlay?.classList.remove('active');
    deactivateChamberDialog(overlay);
    unlockPageScroll();
}

export function initCapitalChamber() {
    ensureCapitalCss().catch((error) => console.warn('Capital Chamber styles unavailable', error));
    bindVisibilityRefresh();
    const card = ensureEntryCard();
    wireEntry(card);
    if (lastSnapshot) updateEntry(lastSnapshot);
    else if (lastEntrySummary) updateEntry(lastEntrySummary);
    else if (document.visibilityState === 'visible') refreshCapitalEntry({ quiet: false });
    else entryRefreshDeferred = true;
}
