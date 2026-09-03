import { setChamberReadingState, renderAgeingLabel, renderChamberStamp, renderChamberVerdict, renderChamberGuide, syncChamberReading } from '../ui/chamber-reading.js';
/**
 * Precious Metals Chamber
 *
 * Eight-metal taxonomy, source-separated market clocks, and bounded VNXAU
 * chain receipts. External collection stays generator-side; the browser reads
 * integrity-checked same-origin artifacts and reconciles background updates in
 * place without moving the reader.
 */

import { quietlySyncHtml } from '../core/quiet-refresh.js';
import { createChamberSnapshotCache } from '../core/chamber-snapshot-cache.js';
import { chamberSkeleton, snapshotStatusMarkup, syncSnapshotStatus } from '../ui/chamber-skeleton.js';
import { versionedAsset } from '../core/asset-version.js';
import { GENERATED_PROOFBOOK_SCHEDULE_LABEL } from '../core/freshness-contracts.mjs';
import { sha256Text } from '../core/sha256.js';
import { assertSnapshotMatchesProjection } from '../core/snapshot-receipt.js';
import { escapeHtml, formatFreshnessStamp } from '../core/utils.js';
import {
    activateChamberDialog,
    deactivateChamberDialog,
    requestChamberClose,
    focusChamberTab,
    wireChamberLauncher
} from '../ui/chamber-accessibility.js';
import { ensureChamberStylesheet } from '../ui/chamber-styles.js';

const snapshotCache = createChamberSnapshotCache({
    key: 'metals', validateSnapshot, validateSummary: validateEntrySummary,
    receiptFor: (summary) => summary.source
});

const METALS_CSS_URL = versionedAsset('/css/metals-chamber.min.css');
const MARKET_ROOM_CSS_URL = versionedAsset('/css/market-room.min.css');
const METALS_SNAPSHOT_URL = '/data/metals-snapshot.json';
const METALS_ENTRY_SUMMARY_URL = '/data/metals-entry-summary.json';
const DEFAULT_REFRESH_MS = 5 * 60 * 1000;
const STALE_AFTER_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const TROY_OUNCE_GRAMS = 31.1034768;

const METAL_ORDER = Object.freeze(['XAU', 'XAG', 'XPT', 'XPD', 'XRH', 'XRU', 'XIR', 'XOS']);
const METAL_META = Object.freeze({
    XAU: { name: 'Gold', symbol: 'Au', number: 79, family: 'Monetary metals', tone: '#f5ca61' },
    XAG: { name: 'Silver', symbol: 'Ag', number: 47, family: 'Monetary metals', tone: '#d7e0e7' },
    XPT: { name: 'Platinum', symbol: 'Pt', number: 78, family: 'Platinum group', tone: '#c9d6df' },
    XPD: { name: 'Palladium', symbol: 'Pd', number: 46, family: 'Platinum group', tone: '#8fb7c8' },
    XRH: { name: 'Rhodium', symbol: 'Rh', number: 45, family: 'Platinum group', tone: '#e8e3dc' },
    XRU: { name: 'Ruthenium', symbol: 'Ru', number: 44, family: 'Platinum group', tone: '#88919d' },
    XIR: { name: 'Iridium', symbol: 'Ir', number: 77, family: 'Platinum group', tone: '#aab5c9' },
    XOS: { name: 'Osmium', symbol: 'Os', number: 76, family: 'Platinum group', tone: '#6984a7' }
});

const VIEWS = Object.freeze([
    { id: 'assay', label: 'Assay', title: 'Eight-Metal Assay', detail: 'The complete precious-metal taxonomy, with comparable observations and deliberate gaps kept visible.' },
    { id: 'markets', label: 'Markets', title: 'Market Ledger', detail: 'Indicative current quotes and completed-month IMF averages, never collapsed into one clock.' },
    { id: 'vnxau', label: 'VNXAU', title: 'VNX Gold Receipts', detail: 'Token market, Etherlink state, historical Tezos deployment, issuer terms, and dated procedures kept separate.' },
    { id: 'proofbook', label: 'Proofbook', title: 'Proofbook', detail: 'Source status, evidence clocks, exclusions, rights boundaries, and reproducible methodology.' }
]);
const VIEW_IDS = new Set(VIEWS.map(({ id }) => id));

let currentView = 'assay';
let currentMetal = 'XAU';
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
let entryTimer = null;
let visibilityReady = false;
let refreshDeferred = false;
let entryRefreshDeferred = false;
let savedBodyOverflow = null;
let savedHtmlOverflow = null;

function numeric(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function firstNumeric(...values) {
    for (const value of values) {
        const number = numeric(value);
        if (number !== null) return number;
    }
    return null;
}

function firstText(...values) {
    return values.find((value) => typeof value === 'string' && value.trim()) || '';
}

function readableList(value) {
    if (Array.isArray(value)) return value.filter((item) => typeof item === 'string' && item.trim()).join(' ');
    return firstText(value);
}

function hasCurrentStatus(status) {
    return ['ok', 'online', 'current'].includes(String(status || '').toLowerCase());
}

function hasCurrentClock(value) {
    const timestamp = Date.parse(value || '');
    if (!Number.isFinite(timestamp)) return false;
    const age = Date.now() - timestamp;
    return age >= -(5 * 60 * 1000) && age <= STALE_AFTER_MS;
}

function observationState({ status, observedAt, price }) {
    if (numeric(price) === null) return 'unavailable';
    return hasCurrentStatus(status) && hasCurrentClock(observedAt) ? 'current' : 'last-good';
}

function stableJsonValue(value) {
    if (Array.isArray(value)) return value.map(stableJsonValue);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableJsonValue(value[key])]));
}

function safeExternalUrl(value) {
    try {
        const url = new URL(String(value || ''));
        return url.protocol === 'https:' ? url.href : '';
    } catch {
        return '';
    }
}

function formatNumber(value, maximumFractionDigits = 0) {
    const number = numeric(value);
    if (number === null) return 'Unavailable';
    return number.toLocaleString('en-US', { maximumFractionDigits });
}

function formatCompact(value, maximumFractionDigits = 1) {
    const number = numeric(value);
    if (number === null) return 'Unavailable';
    return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits }).format(number);
}

function formatUsd(value, digits = null) {
    const number = numeric(value);
    if (number === null) return 'Unavailable';
    return number.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: digits ?? (Math.abs(number) < 10 ? 3 : 2)
    });
}

function formatPct(value, signed = true) {
    const number = numeric(value);
    if (number === null) return 'Unavailable';
    return `${signed && number > 0 ? '+' : ''}${number.toFixed(2)}%`;
}

function formatDate(value, monthOnly = false) {
    const timestamp = Date.parse(value || '');
    if (!Number.isFinite(timestamp)) return firstText(value, 'Unavailable');
    return new Date(timestamp).toLocaleDateString('en-US', {
        year: 'numeric',
        month: monthOnly ? 'long' : 'short',
        ...(monthOnly ? {} : { day: 'numeric' }),
        timeZone: 'UTC'
    });
}

function formatTimestamp(value) {
    const timestamp = Date.parse(value || '');
    if (!Number.isFinite(timestamp)) return 'Unavailable';
    return new Date(timestamp).toLocaleString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
        hour12: false, timeZone: 'UTC', timeZoneName: 'short'
    });
}

function ageLabel(value) {
    const timestamp = Date.parse(value || '');
    if (!Number.isFinite(timestamp)) return 'freshness unavailable';
    const elapsed = Math.max(0, Date.now() - timestamp);
    if (elapsed < 60 * 1000) return 'under 1m ago';
    if (elapsed < 60 * 60 * 1000) return `${Math.floor(elapsed / (60 * 1000))}m ago`;
    if (elapsed < DAY_MS) return `${Math.floor(elapsed / (60 * 60 * 1000))}h ago`;
    return `${Math.floor(elapsed / DAY_MS)}d ago`;
}

function statusClass(status) {
    if (['ok', 'online', 'current'].includes(status)) return 'is-good';
    if (['stale', 'partial', 'review', 'dated', 'last-good'].includes(status)) return 'is-warn';
    return 'is-bad';
}

function directionClass(value) {
    const number = numeric(value);
    if (number === null || Math.abs(number) < .005) return 'is-flat';
    return number > 0 ? 'is-positive' : 'is-negative';
}

function ensureMetalsCss() {
    return Promise.all([
        ensureChamberStylesheet('metals-chamber-css', METALS_CSS_URL),
        ensureChamberStylesheet('market-room-css', MARKET_ROOM_CSS_URL)
    ]);
}

function metalKey(row) {
    const semanticIds = {
        gold: 'XAU', silver: 'XAG', platinum: 'XPT', palladium: 'XPD',
        rhodium: 'XRH', ruthenium: 'XRU', iridium: 'XIR', osmium: 'XOS'
    };
    const semantic = semanticIds[String(row?.id || '').toLowerCase()];
    if (semantic) return semantic;
    const raw = firstText(row?.marketSymbol, row?.code, row?.symbol, row?.id).toUpperCase();
    if (METAL_ORDER.includes(raw)) return raw;
    const elemental = Object.entries(METAL_META).find(([, meta]) => meta.symbol.toUpperCase() === raw);
    return elemental?.[0] || '';
}

function metalRows(snapshot) {
    const incoming = Array.isArray(snapshot?.metals) ? snapshot.metals : [];
    const byKey = new Map(incoming.map((row) => [metalKey(row), row]).filter(([key]) => key));
    return METAL_ORDER.map((id) => {
        const source = byKey.get(id) || {};
        return { ...METAL_META[id], ...source, elementId: source.id || null, id };
    });
}

function quoteModel(row) {
    const quote = row?.quote || row?.market || {};
    return {
        status: firstText(quote.status, 'unavailable'),
        kind: firstText(quote.kind, quote.type, 'unavailable'),
        price: firstNumeric(quote.priceUsdPerTroyOunce, quote.priceUsd, quote.value),
        change24h: firstNumeric(quote.change24hPct, quote.changePct24h),
        observedAt: firstText(quote.observedAt, quote.updatedAt),
        sourceKey: firstText(quote.sourceKey, quote.source),
        methodology: firstText(quote.methodology, quote.note),
        limitations: readableList(quote.limitations) || firstText(quote.caveat)
    };
}

function annualModel(row) {
    const context = row?.annualContext || row?.annual || {};
    return {
        status: firstText(context.status, 'unavailable'),
        value: firstNumeric(context.priceUsdPerTroyOunce, context.referencePriceUsdPerTroyOunce, context.value),
        period: firstText(context.period, context.referenceYear ? String(context.referenceYear) : '', context.year ? String(context.year) : '', context.asOf),
        sourceKey: firstText(context.sourceKey, context.source),
        note: firstText(context.note, context.methodology, context.limitations)
    };
}

function sourceReceipt(snapshot, id) {
    return snapshot?.sources?.[id] || snapshot?.sourceStatuses?.[id] || {};
}

function retainedSourceState(snapshot, id, { observedAt, value, naturalClock = false } = {}) {
    if (value === null || value === undefined) return 'unavailable';
    const receipt = sourceReceipt(snapshot, id);
    const status = firstText(receipt?.status, 'unavailable');
    if (!hasCurrentStatus(status)) return 'last-good';
    if (naturalClock) return 'current';
    const receiptClock = firstText(observedAt, receipt?.observedAt, receipt?.retrievedAt, receipt?.checkedAt);
    return hasCurrentClock(receiptClock) ? 'current' : 'last-good';
}

function sourceInventory(snapshot) {
    const inventory = snapshot?.sources || snapshot?.sourceStatuses || {};
    return Object.entries(inventory).map(([id, receipt]) => ({
        id,
        label: firstText(receipt?.label, receipt?.name, id),
        status: firstText(receipt?.status, 'unavailable'),
        url: safeExternalUrl(firstText(receipt?.url, receipt?.sourceUrl)),
        observedAt: firstText(receipt?.periodEnd, receipt?.statementAsOf, receipt?.observedAt, receipt?.reviewedAt, receipt?.retrievedAt, receipt?.checkedAt),
        checkedAt: firstText(receipt?.checkedAt, receipt?.retrievedAt),
        note: firstText(receipt?.note, receipt?.coverage, receipt?.credit, 'Public receipt')
    }));
}

async function validateSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object' || snapshot.schemaVersion !== 1) {
        throw new Error('Metals snapshot schemaVersion 1 is required.');
    }
    const inventory = Array.isArray(snapshot.metals) ? snapshot.metals : [];
    const inventoryKeys = inventory.map(metalKey);
    if (!Number.isFinite(Date.parse(snapshot.generatedAt || ''))
        || !/^[0-9a-f]{64}$/.test(snapshot.contentHash || '')
        || inventory.length !== 8
        || inventoryKeys.join(',') !== METAL_ORDER.join(',')
        || new Set(inventoryKeys).size !== 8
        || !snapshot.taxonomy
        || !snapshot.vnxau
        || !snapshot.sources) {
        throw new Error('Metals snapshot is missing its eight-metal taxonomy, VNXAU, or source receipts.');
    }
    const { contentHash, ...unsigned } = snapshot;
    const actualHash = await sha256Text(JSON.stringify(stableJsonValue(unsigned)));
    if (actualHash.toLowerCase() !== contentHash.toLowerCase()) {
        throw new Error('Metals snapshot failed its SHA-256 integrity receipt.');
    }
    return snapshot;
}

async function validateEntrySummary(summary) {
    if (!summary || typeof summary !== 'object' || summary.schemaVersion !== 1) {
        throw new Error('Metals entry summary schemaVersion 1 is required.');
    }
    const inventoryKeys = Array.isArray(summary.metals) ? summary.metals.map(metalKey) : [];
    if (!Number.isFinite(Date.parse(summary.generatedAt || ''))
        || !/^[0-9a-f]{64}$/.test(summary.contentHash || '')
        || summary.source?.path !== 'data/metals-snapshot.json'
        || summary.source?.schemaVersion !== 1
        || summary.source?.generatedAt !== summary.generatedAt
        || !/^[0-9a-f]{64}$/.test(summary.source?.contentHash || '')
        || !/^[0-9a-f]{64}$/.test(summary.source?.fileSha256 || '')
        || !Array.isArray(summary.metals)
        || summary.metals.length !== 8
        || inventoryKeys.join(',') !== METAL_ORDER.join(',')
        || new Set(inventoryKeys).size !== 8
        || !summary.vnxau) {
        throw new Error('Metals entry summary is missing its projection receipt or launcher fields.');
    }
    const { contentHash, ...unsigned } = summary;
    const actualHash = await sha256Text(JSON.stringify(stableJsonValue(unsigned)));
    if (actualHash.toLowerCase() !== contentHash.toLowerCase()) {
        throw new Error('Metals entry summary failed its SHA-256 integrity receipt.');
    }
    return summary;
}

function fetchMetalsSnapshot(summary = lastEntrySummary) {
    if (activeFetch) return activeFetch;
    const sourceReceipt = summary?.source || null;
    activeFetch = fetch(METALS_SNAPSHOT_URL, { cache: 'no-cache', headers: { Accept: 'application/json' } })
        .then(async (response) => {
            if (!response.ok) throw new Error(`Metals snapshot HTTP ${response.status}`);
            const sourceText = await response.text();
            let snapshot;
            try {
                snapshot = JSON.parse(sourceText);
            } catch {
                throw new Error('Metals snapshot is not valid JSON.');
            }
            await validateSnapshot(snapshot);
            await assertSnapshotMatchesProjection(snapshot, sourceText, sourceReceipt, { label: 'Metals snapshot' });
            void snapshotCache.save(sourceText, summary);
            return snapshot;
        })
        .finally(() => { activeFetch = null; });
    return activeFetch;
}

function fetchMetalsEntrySummary() {
    if (activeEntryFetch) return activeEntryFetch;
    activeEntryFetch = fetch(METALS_ENTRY_SUMMARY_URL, { cache: 'no-cache', headers: { Accept: 'application/json' } })
        .then((response) => {
            if (!response.ok) throw new Error(`Metals entry summary HTTP ${response.status}`);
            return response.json();
        })
        .then(validateEntrySummary)
        .finally(() => { activeEntryFetch = null; });
    return activeEntryFetch;
}

function metalsSnapshotHash(summary) {
    return String(summary?.source?.contentHash || '').toLowerCase();
}

async function resolveMetalsSnapshotRefresh() {
    let summary = lastEntrySummary;

    if (lastSnapshot || !summary || lastRefreshError) {
        try {
            summary = await fetchMetalsEntrySummary();
            lastEntrySummary = summary;
        } catch (error) {
            if (lastSnapshot) throw error;
            console.warn('Metals summary poll failed during open; trying the complete snapshot:', error);
            summary = null;
        }
    }

    const projectedHash = metalsSnapshotHash(summary);
    const loadedHash = String(lastSnapshot?.contentHash || '').toLowerCase();
    if (lastSnapshot && projectedHash && projectedHash === loadedHash) {
        return { snapshot: lastSnapshot, changed: false };
    }
    if (lastSnapshot && projectedHash) {
        const projectedAt = Date.parse(summary?.source?.generatedAt || summary?.generatedAt || '');
        const loadedAt = Date.parse(lastSnapshot.generatedAt || '');
        if (!Number.isFinite(projectedAt) || !Number.isFinite(loadedAt) || projectedAt <= loadedAt) {
            throw new Error('Metals launcher projection is not newer than the loaded snapshot; retaining last-good data.');
        }
    }

    return { snapshot: await fetchMetalsSnapshot(summary), changed: true };
}

function corePicture(className = '') {
    return `<figure class="metals-core-stage market-room-core-stage ${className}"><picture><source srcset="/assets/metals/metals-core-640.webp 640w, /assets/metals/metals-core.webp 1536w" sizes="(max-width: 700px) 100vw, 52vw" type="image/webp"><img src="/assets/metals/metals-core.webp" width="1536" height="1024" loading="lazy" decoding="async" alt="Eight distinct polished precious-metal specimens arranged in a dark assay display: gold, silver, platinum, palladium, rhodium, ruthenium, iridium, and osmium."></picture><figcaption>Original eight-metal study · visual identity, not a specimen-identification guide.</figcaption></figure>`;
}

function launcherPicture() {
    return `<figure class="metals-launcher-art"><picture><source srcset="/assets/metals/metals-launcher-480.webp 480w, /assets/metals/metals-launcher.webp 960w" sizes="(max-width: 700px) 38vw, 260px" type="image/webp"><img src="/assets/metals/metals-launcher.webp" width="960" height="640" loading="lazy" decoding="async" alt="Eight polished precious-metal specimens in gold, silver, and platinum-group tones."></picture></figure>`;
}

function normalizeHistoryRows(snapshot, id) {
    const history = snapshot?.marketHistory || {};
    const rawSeries = history.series?.[id] || history.series?.[METAL_META[id]?.symbol] || [];
    const rows = Array.isArray(rawSeries) ? rawSeries : (rawSeries?.rows || rawSeries?.months || rawSeries?.observations || []);
    const normalized = rows.map((row) => ({
        period: firstText(row?.period, row?.date, row?.month, row?.timestamp),
        value: firstNumeric(row?.priceUsdPerTroyOunce, row?.value, row?.priceUsd, row?.averageUsd),
        mom: firstNumeric(row?.monthOverMonthPct, row?.momPct, row?.changeMoMPct),
        yoy: firstNumeric(row?.yearOverYearPct, row?.yoyPct, row?.changeYoYPct)
    })).filter((row) => row.period && row.value !== null)
        .sort((a, b) => Date.parse(a.period) - Date.parse(b.period));
    return normalized.map((row, index) => ({
        ...row,
        mom: row.mom ?? (index > 0 ? ((row.value / normalized[index - 1].value) - 1) * 100 : null),
        yoy: row.yoy ?? (index >= 12 ? ((row.value / normalized[index - 12].value) - 1) * 100 : null)
    }));
}

function chartMarkup(rows, id, { compact = false } = {}) {
    if (rows.length < 2) return `<div class="metals-chart-empty">Comparable completed-month history unavailable.</div>`;
    const points = rows.slice(compact ? -24 : -120);
    const width = compact ? 600 : 1000;
    const height = compact ? 112 : 340;
    const pad = compact ? 5 : 38;
    const values = points.map(({ value }) => value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const coords = points.map((point, index) => ({
        x: pad + ((width - (pad * 2)) * index / Math.max(1, points.length - 1)),
        y: pad + ((height - (pad * 2)) * (1 - ((point.value - min) / span))),
        ...point
    }));
    const line = coords.map(({ x, y }) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
    const area = `${coords[0].x.toFixed(2)},${height - pad} ${line} ${coords.at(-1).x.toFixed(2)},${height - pad}`;
    const meta = METAL_META[id];
    const chartId = `${id}-${compact ? 'entry' : 'room'}`;
    const first = points[0];
    const last = points.at(-1);
    const change = ((last.value / first.value) - 1) * 100;
    return `<div class="metals-chart${compact ? ' is-compact' : ''}" style="--metal-tone:${meta.tone}"><svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="metals-chart-title-${chartId} metals-chart-desc-${chartId}" preserveAspectRatio="none"><title id="metals-chart-title-${chartId}">${escapeHtml(meta.name)} completed-month price history</title><desc id="metals-chart-desc-${chartId}">${escapeHtml(formatDate(first.period, true))} ${escapeHtml(formatUsd(first.value))} to ${escapeHtml(formatDate(last.period, true))} ${escapeHtml(formatUsd(last.value))} per troy ounce, ${escapeHtml(formatPct(change))}.</desc><defs><linearGradient id="metals-fill-${chartId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${meta.tone}" stop-opacity=".36"/><stop offset="1" stop-color="${meta.tone}" stop-opacity="0"/></linearGradient></defs><polygon points="${area}" fill="url(#metals-fill-${chartId})"/><polyline points="${line}" fill="none" stroke="${meta.tone}" stroke-width="${compact ? 5 : 3}" vector-effect="non-scaling-stroke"/></svg>${compact ? '' : `<div class="metals-chart-scale"><span>${escapeHtml(formatUsd(max))}</span><span>${escapeHtml(formatUsd(min))}</span></div>`}</div>`;
}

function latestHistory(snapshot, id) {
    return normalizeHistoryRows(snapshot, id).at(-1) || null;
}

function historyCoverage(snapshot, id = currentMetal) {
    const history = snapshot?.marketHistory || {};
    const coverage = history.coverage || {};
    const seriesCoverage = history.series?.[id]?.coverage || {};
    return {
        start: firstText(seriesCoverage.start, seriesCoverage.from, coverage.start, coverage.from, history.start),
        end: firstText(seriesCoverage.end, seriesCoverage.to, coverage.latestCompletedMonth, coverage.end, coverage.to, history.end, latestHistory(snapshot, id)?.period),
        frequency: firstText(history.frequency, 'monthly'),
        unit: firstText(history.unit, 'USD per troy ounce')
    };
}

function renderAssayCard(row) {
    const meta = METAL_META[row.id];
    const quote = quoteModel(row);
    const annual = annualModel(row);
    const quoteState = observationState(quote);
    const isCurrent = quoteState === 'current';
    const isRetained = quoteState === 'last-good';
    const specialist = ['XRH', 'XRU', 'XIR'].includes(row.id);
    const availability = isCurrent ? 'Indicative current quote' : isRetained ? 'Last-good indicative quote' : specialist ? 'Annual context only' : 'No comparable public quote';
    const value = isCurrent || isRetained ? `${formatUsd(quote.price)} / oz` : annual.value !== null ? `${formatUsd(annual.value)} annual ref.` : 'Unavailable — not zero';
    const detail = isCurrent || isRetained
        ? `${formatFreshnessStamp(quote.observedAt, { source: 'indicative quote' })}. ${quote.limitations || 'Not a benchmark or executable price.'}`
        : annual.value !== null
            ? `${annual.period || 'Dated'} annual USGS context; not a current market quote. ${annual.note}`
            : 'No defensible comparable public quotation is included. Taxonomy coverage remains complete.';
    return `<article class="metals-assay-card" style="--metal-tone:${meta.tone}"><div class="metals-element"><span>${meta.number}</span><strong>${meta.symbol}</strong><small>${meta.name}</small></div><div class="metals-assay-copy"><span class="metals-status ${isCurrent ? 'is-good' : isRetained || annual.value !== null ? 'is-warn' : 'is-bad'}">${escapeHtml(availability)}</span><h4>${escapeHtml(value)}</h4><p>${escapeHtml(detail)}</p><small>${escapeHtml(meta.family)} · ${escapeHtml(quote.sourceKey || annual.sourceKey || 'availability receipt')}</small></div></article>`;
}

function renderAssay(snapshot) {
    const rows = metalRows(snapshot);
    const states = rows.map((row) => observationState(quoteModel(row)));
    const currentCount = states.filter((state) => state === 'current').length;
    const retainedCount = states.filter((state) => state === 'last-good').length;
    const annualCount = rows.filter((row, index) => states[index] === 'unavailable' && annualModel(row).value !== null).length;
    const unavailableCount = 8 - currentCount - retainedCount - annualCount;
    return `<section class="metals-hero"><div class="metals-hero-copy"><span class="metals-kicker">Au · Ag · six platinum-group metals</span><h3>Every precious metal. No synthetic completeness.</h3><p>Gold and silver join platinum, palladium, rhodium, ruthenium, iridium, and osmium. The assay shows all eight even when comparable public market data stops—because “unavailable” is evidence, not an invitation to fill a gap with a guess.</p><div class="metals-hero-metrics"><span><strong>8</strong><small>canonical metals</small></span><span><strong>${currentCount}</strong><small>indicative-current</small></span>${retainedCount ? `<span><strong>${retainedCount}</strong><small>last-good quote</small></span>` : ''}<span><strong>${annualCount}</strong><small>annual-only</small></span><span><strong>${unavailableCount}</strong><small>quote unavailable</small></span></div></div>${corePicture('is-room')}</section><section class="metals-assay-grid" aria-label="All eight precious metals">${rows.map(renderAssayCard).join('')}</section><aside class="metals-boundary"><strong>Taxonomy boundary</strong><p>Uranium, cobalt, nickel, copper, and commercial basket tokens are adjacent commodity or product contexts, not members of this eight-metal precious-metal set.</p></aside>`;
}

function renderMarkets(snapshot) {
    const rows = metalRows(snapshot);
    const chosen = rows.find(({ id }) => id === currentMetal) || rows[0];
    const quote = quoteModel(chosen);
    const history = normalizeHistoryRows(snapshot, chosen.id);
    const latest = history.at(-1);
    const coverage = historyCoverage(snapshot, chosen.id);
    const quartet = rows.filter(({ id }) => ['XAU', 'XAG', 'XPT', 'XPD'].includes(id));
    const quoteState = observationState(quote);
    const quoteHeading = quoteState === 'current' ? 'Indicative current · Gold API' : quoteState === 'last-good' ? 'Last-good indicative · Gold API' : 'Indicative quote unavailable · Gold API';
    return `<section class="metals-clock-pair"><article><span class="metals-eyebrow">${quoteHeading}</span><strong>${escapeHtml(formatUsd(quote.price))}</strong><small>${escapeHtml(chosen.name)} · USD/troy oz · ${escapeHtml(formatTimestamp(quote.observedAt))}</small><p>${quoteState === 'last-good' ? 'A retained provider observation is shown for context and is not current. ' : ''}Public indicative observation with an undisclosed upstream methodology. It is not an LBMA benchmark, dealer quote, or executable price.</p></article><article><span class="metals-eyebrow">Completed-month · IMF PCPS</span><strong>${escapeHtml(formatUsd(latest?.value))}</strong><small>${escapeHtml(chosen.name)} · ${escapeHtml(formatDate(latest?.period, true))} monthly average</small><p>${escapeHtml(coverage.frequency)} · ${escapeHtml(coverage.unit)}. Retrieval time never upgrades a completed-month average into “live.”</p></article></section><section class="metals-panel metals-market-panel"><div class="metals-panel-head"><div><span class="metals-eyebrow">Comparable quartet</span><h4>Completed-month market history</h4></div><div class="metals-metal-switch" role="group" aria-label="Choose metal history">${quartet.map((row) => `<button type="button" data-metals-metal="${row.id}" aria-pressed="${row.id === currentMetal}" style="--metal-tone:${METAL_META[row.id].tone}">${METAL_META[row.id].symbol}<span>${METAL_META[row.id].name}</span></button>`).join('')}</div></div>${chartMarkup(history, chosen.id)}<div class="metals-market-footer"><span><b>${escapeHtml(coverage.start ? formatDate(coverage.start, true) : 'Coverage')}</b> first retained month</span><span><b>${escapeHtml(formatDate(coverage.end, true))}</b> latest completed month</span><span><b>${escapeHtml(latest?.mom === null ? 'Unavailable' : formatPct(latest?.mom))}</b> month over month</span><span><b>${escapeHtml(latest?.yoy === null ? 'Unavailable' : formatPct(latest?.yoy))}</b> year over year</span></div></section><section class="metals-quote-grid">${quartet.map((row) => { const current = quoteModel(row); const state = observationState(current); const month = latestHistory(snapshot, row.id); const label = state === 'current' ? 'indicative current' : state === 'last-good' ? 'last-good indicative' : 'indicative quote unavailable'; return `<article><span>${METAL_META[row.id].symbol} · ${METAL_META[row.id].name}</span><strong>${escapeHtml(formatUsd(current.price))}</strong><small>${label} · ${escapeHtml(formatTimestamp(current.observedAt))}</small><hr><b>${escapeHtml(formatUsd(month?.value))}</b><small>${escapeHtml(formatDate(month?.period, true))} IMF monthly average</small></article>`; }).join('')}</section><p class="metals-footnote">One troy ounce equals ${TROY_OUNCE_GRAMS} grams. All conversions and same-month ratios are derived only from observations sharing the stated source clock.</p>`;
}

function vnxModel(snapshot) {
    const vnx = snapshot?.vnxau || {};
    const market = vnx.market || {};
    const etherlink = vnx.etherlink || {};
    const tezos = vnx.tezosHistorical || vnx.tezos || {};
    const identity = vnx.identity || {};
    return {
        name: firstText(identity.name, vnx.name, 'VNX Gold'),
        unit: firstText(identity.assetDenomination, identity.unit, identity.tokenRepresentation, 'one token is described by the issuer as one gram'),
        marketStatus: firstText(market.status, 'unavailable'),
        price: firstNumeric(market.priceUsd, market.currentPriceUsd, market.coin?.priceUsd, market.coinGecko?.priceUsd),
        change24h: firstNumeric(market.change24hPct, market.coin?.change24hPct, market.coinGecko?.change24hPct),
        updatedAt: firstText(market.updatedAt, market.observedAt, market.coin?.observedAt, market.coinGecko?.updatedAt),
        history: Array.isArray(market.priceHistoryUsd) ? market.priceHistoryUsd : (Array.isArray(market.historyUsd) ? market.historyUsd : (market.coinGecko?.historyUsd || [])),
        etherlink: {
            contract: firstText(etherlink.contract, etherlink.address, etherlink.token?.address, identity.etherlinkContract),
            supply: firstNumeric(etherlink.totalSupplyTokens, etherlink.totalSupply, etherlink.supply, etherlink.token?.totalSupply),
            holders: firstNumeric(etherlink.holderAddresses, etherlink.holders, etherlink.holdersCount, etherlink.counters?.tokenHoldersCount, etherlink.token?.holdersCount),
            transfers: firstNumeric(etherlink.transferCount, etherlink.transfers, etherlink.counters?.transfersCount),
            observedAt: firstText(etherlink.observedAt, etherlink.checkedAt, etherlink.latestTransferAt, etherlink.token?.observedAt),
            status: firstText(etherlink.status, 'unavailable')
        },
        tezos: {
            contract: firstText(tezos.contract?.address, tezos.contract, tezos.address, identity.tezosHistoricalContract),
            status: firstText(tezos.status, 'unavailable'),
            state: firstText(tezos.state, 'unavailable'),
            supply: firstNumeric(
                tezos.totalSupply,
                tezos.supply,
                Array.isArray(tezos.indexedTokens) && tezos.indexedTokens.length
                    ? tezos.indexedTokens.reduce((sum, token) => sum + (numeric(token.totalSupplyExact) || 0), 0)
                    : tezos.state === 'deployed-no-current-indexed-token-rows-or-ledger-keys' ? 0 : null
            ),
            ledgerKeys: firstNumeric(
                tezos.ledgerKeys,
                tezos.holders,
                Array.isArray(tezos.bigMaps)
                    ? tezos.bigMaps.filter((map) => map.active && map.path === 'ledger').reduce((sum, map) => sum + (numeric(map.totalKeys) || 0), 0)
                    : tezos.contract?.tokenBalancesCount
            ),
            lastActivityAt: firstText(tezos.lastActivityAt, tezos.observedAt, tezos.contract?.lastActivityAt),
            note: firstText(tezos.note, tezos.conclusion, tezos.coverage?.state)
        },
        issuer: vnx.issuer || {},
        productStatus: vnx.productStatus || vnx.issuer?.productStatus || {},
        catalog: vnx.issuer?.catalog || {},
        operationalNotice: vnx.issuer?.operationalNotice || {},
        reserveAup: vnx.issuer?.reserveAup || {},
        boundaries: vnx.boundaries || []
    };
}

function truncate(value, head = 11, tail = 7) {
    const text = String(value || '');
    return text.length <= head + tail + 1 ? text : `${text.slice(0, head)}…${text.slice(-tail)}`;
}

function contractStrip(label, address, prefix) {
    if (!address) return `<div class="metals-contract"><span>${escapeHtml(label)}</span><strong>Unavailable</strong></div>`;
    return `<div class="metals-contract"><span>${escapeHtml(label)}</span><code title="${escapeHtml(address)}">${escapeHtml(truncate(address))}</code><button type="button" data-metals-copy="${escapeHtml(address)}" aria-label="Copy ${escapeHtml(label)} contract address">Copy</button>${prefix ? `<small>${escapeHtml(prefix)}</small>` : ''}</div>`;
}

function renderVnxau(snapshot) {
    const vnx = vnxModel(snapshot);
    const gold = metalRows(snapshot).find(({ id }) => id === 'XAU');
    const goldQuote = quoteModel(gold);
    const goldState = observationState(goldQuote);
    const tokenState = observationState({ status: vnx.marketStatus, observedAt: vnx.updatedAt, price: vnx.price });
    const perGram = goldState === 'current' ? goldQuote.price / TROY_OUNCE_GRAMS : null;
    const premium = tokenState === 'current' && perGram !== null ? ((vnx.price / perGram) - 1) * 100 : null;
    const boundaries = Array.isArray(vnx.boundaries) ? vnx.boundaries : Object.values(vnx.boundaries || {});
    const catalog = Array.isArray(vnx.catalog?.preciousMetals) ? vnx.catalog.preciousMetals : [];
    const aupUrl = safeExternalUrl(firstText(vnx.reserveAup?.file?.url, sourceReceipt(snapshot, 'vnxReserveAup')?.url));
    const notice = vnx.operationalNotice;
    const noticeUrl = safeExternalUrl(sourceReceipt(snapshot, 'vnxIssuer')?.endpoints?.find((url) => url.includes('important-notice')));
    const vnxDelta = tokenState !== 'current' ? 'current 24h change unavailable' : vnx.change24h === null ? '24h change unavailable' : `${formatPct(vnx.change24h)} · 24h`;
    const marketLabel = tokenState === 'current' ? 'current third-party market observation' : tokenState === 'last-good' ? 'last-good third-party market observation' : 'third-party market observation unavailable';
    const comparisonNote = tokenState === 'current' && goldState === 'current'
        ? 'Comparison only · no peg or arbitrage claim'
        : 'Unavailable unless both independent observations are current';
    const tezosReceiptCurrent = hasCurrentStatus(vnx.tezos.status);
    const tezosHasState = vnx.tezos.supply !== null && vnx.tezos.ledgerKeys !== null;
    const tezosHeading = !tezosReceiptCurrent || !tezosHasState
        ? 'Current indexed state unavailable'
        : vnx.tezos.supply === 0 && vnx.tezos.ledgerKeys === 0
            ? 'Deployed; no current indexed supply observed'
            : 'Current indexed token state observed';
    return `<section class="metals-vnx-hero"><div><span class="metals-kicker">VNXAU · token market, not a gold benchmark · Metals.io ${escapeHtml(firstText(vnx.productStatus?.status, 'status unavailable'))}</span><h3>${escapeHtml(formatUsd(vnx.price))}</h3><p>${escapeHtml(vnx.name)} ${marketLabel} · <span class="${directionClass(tokenState === 'current' ? vnx.change24h : null)}">${escapeHtml(vnxDelta)}</span> · ${escapeHtml(formatTimestamp(vnx.updatedAt))}</p><small>${escapeHtml(vnx.unit)}. This Chamber reports that issuer description without treating it as independently proven current backing or redemption availability.</small></div><div class="metals-comparison"><span>Indicative gold / gram</span><strong>${escapeHtml(formatUsd(perGram))}</strong><small>${goldState === 'current' ? `Gold API ounce quote ÷ ${TROY_OUNCE_GRAMS}` : 'Current Gold API observation unavailable'}</small><span>Observed token difference</span><strong class="${directionClass(premium)}">${escapeHtml(formatPct(premium))}</strong><small>${comparisonNote}</small></div></section><section class="metals-chain-grid"><article class="metals-panel"><span class="metals-eyebrow">Etherlink · observed chain state</span><h4>${escapeHtml(formatNumber(vnx.etherlink.supply, 5))} VNXAU</h4><div class="metals-ledger-kpis"><span><b>${escapeHtml(formatNumber(vnx.etherlink.holders))}</b><small>holder addresses</small></span><span><b>${escapeHtml(formatCompact(vnx.etherlink.transfers))}</b><small>indexed transfers</small></span><span><b>${escapeHtml(vnx.etherlink.status)}</b><small>source status</small></span></div>${contractStrip('Etherlink', vnx.etherlink.contract, `Observed ${formatTimestamp(vnx.etherlink.observedAt)}`)}</article><article class="metals-panel is-historical"><span class="metals-eyebrow">Tezos L1 · historical deployment</span><h4>${tezosHeading}</h4><p>${escapeHtml(vnx.tezos.note || 'Contract metadata exists, but the bounded ledger receipt did not observe issued supply or ledger keys.')}</p><div class="metals-ledger-kpis"><span><b>${escapeHtml(formatNumber(vnx.tezos.supply))}</b><small>observed supply</small></span><span><b>${escapeHtml(formatNumber(vnx.tezos.ledgerKeys))}</b><small>ledger keys</small></span><span><b>${escapeHtml(formatDate(vnx.tezos.lastActivityAt))}</b><small>last activity</small></span></div>${contractStrip('Tezos', vnx.tezos.contract)}</article></section>${catalog.length ? `<section class="metals-panel"><div class="metals-panel-head"><div><span class="metals-eyebrow">Metals.io catalog · reviewed ${escapeHtml(formatDate(sourceReceipt(snapshot, 'metalsIo')?.reviewedAt))}</span><h4>Precious-metal product status is not taxonomy</h4></div></div><div class="metals-catalog-grid">${catalog.map((item) => `<article><span>${escapeHtml(METAL_META[METAL_ORDER.find((id) => METAL_META[id].name.toLowerCase() === item.metal)]?.symbol || item.metal)}</span><strong>${escapeHtml(item.symbol || 'No product listed')}</strong><small class="${statusClass(item.productStatus === 'live' ? 'ok' : item.productStatus === 'coming-soon' ? 'review' : 'unavailable')}">${escapeHtml(item.productStatus)}</small></article>`).join('')}</div><p class="metals-footnote">${escapeHtml(firstText(vnx.catalog?.boundary, 'Reviewed catalog status is dated and does not imply future availability.'))}</p></section>` : ''}<section class="metals-panel metals-evidence-warning"><span class="metals-eyebrow">Evidence boundary</span><h4>Dated procedures are not current chain-specific assurance</h4><p>The VNXAU document is ${escapeHtml(firstText(vnx.reserveAup?.reportType, 'an agreed-upon procedures report'))} as of ${escapeHtml(formatDate(vnx.reserveAup?.statementAsAt))}—not an audit, review, or assurance conclusion. Its listed chain scope excludes ${escapeHtml((vnx.reserveAup?.networksNotSpecificallyReconciled || ['Etherlink', 'Tezos']).join(' and '))}. The legacy-platform notice says exchange operations and bridging ended ${escapeHtml(formatDate(notice?.exchangeOperationsSuspendedAt))}, with its withdrawal window ending ${escapeHtml(formatDate(notice?.withdrawalWindowEndedAt))}. No backing ratio or present redemption claim is calculated here.</p><div class="metals-proof-actions">${aupUrl ? `<a href="${escapeHtml(aupUrl)}" target="_blank" rel="noopener noreferrer">Open dated procedures ↗</a>` : ''}${noticeUrl ? `<a href="${escapeHtml(noticeUrl)}" target="_blank" rel="noopener noreferrer">Open operations notice ↗</a>` : ''}</div></section>${boundaries.length ? `<section class="metals-boundary-grid">${boundaries.map((item) => `<article><strong>Boundary</strong><p>${escapeHtml(firstText(item?.note, item?.detail, item?.value, String(item)))}</p></article>`).join('')}</section>` : ''}<p class="metals-footnote">Token price, underlying indicative quote, on-chain supply, issuer terms, and dated procedures are independent receipts. Agreement between two numbers is not proof that every token is presently backed or redeemable.</p>`;
}

function renderSources(snapshot) {
    const rows = sourceInventory(snapshot);
    return `<div class="metals-table-wrap"><table class="metals-table"><caption class="sr-only">Precious Metals Chamber source and freshness ledger</caption><thead><tr><th>Source</th><th>Status</th><th>Evidence clock</th><th>Coverage boundary</th></tr></thead><tbody>${rows.map((source) => `<tr><td>${source.url ? `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.label)} ↗</a>` : escapeHtml(source.label)}</td><td><span class="metals-status ${statusClass(source.status)}">${escapeHtml(source.status)}</span></td><td><b>${escapeHtml(formatTimestamp(source.observedAt))}</b>${source.checkedAt && source.checkedAt !== source.observedAt ? `<small>Checked ${escapeHtml(formatTimestamp(source.checkedAt))}</small>` : ''}</td><td>${escapeHtml(source.note)}</td></tr>`).join('') || '<tr><td colspan="4">No source receipts available.</td></tr>'}</tbody></table></div>`;
}

function renderProofbook(snapshot) {
    const taxonomy = snapshot?.taxonomy || {};
    const methodology = snapshot?.methodology || {};
    const exclusions = taxonomy.exclusions || taxonomy.excluded || methodology.exclusions || [];
    const exclusionRows = Array.isArray(exclusions) ? exclusions : Object.entries(exclusions).map(([label, note]) => ({ label, note }));
    return `<section class="metals-proof-hero"><div><span class="metals-kicker">Source-bounded by design</span><h3>Clocks before conclusions.</h3><p>Indicative observations, monthly averages, annual mineral context, chain state, issuer terms, and dated procedures answer different questions. The Chamber preserves those differences all the way to the interface.</p></div><div><strong>8 / 8</strong><span>taxonomy coverage</span><small>Price coverage is intentionally narrower.</small></div></section><section class="metals-panel"><div class="metals-panel-head"><div><span class="metals-eyebrow">Receipt ledger</span><h4>Source health and natural clocks</h4></div><span class="metals-status ${lastRefreshError ? 'is-bad' : 'is-good'}" id="metals-proof-refresh-status">${lastRefreshError ? 'last-good retained' : renderChamberStamp(snapshot.generatedAt, 'Generated')}</span></div>${renderSources(snapshot)}</section><section class="metals-proof-grid"><article><span>Indicative current</span><h4>Gold API quartet</h4><p>Au, Ag, Pt, and Pd public quotes are indicative observations with disclosed limitations, not regulated benchmarks or executable dealer prices.</p></article><article><span>Completed month</span><h4>IMF PCPS history</h4><p>Monthly averages remain labeled by observation period. The workbook retrieval date is a check clock, never a market clock.</p></article><article><span>Annual context</span><h4>USGS mineral record</h4><p>Annual estimates and bounded references cannot substitute for current prices. Combined PGM figures remain combined rather than being invented per metal.</p></article><article><span>Token evidence</span><h4>VNXAU layers</h4><p>Market, contracts, supply, holders, issuer claims, operations notices, and dated procedures stay separate. No current backing ratio is inferred.</p></article></section>${exclusionRows.length ? `<section class="metals-panel"><span class="metals-eyebrow">Explicit exclusions</span><div class="metals-exclusion-grid">${exclusionRows.map((item) => `<article><strong>${escapeHtml(firstText(item?.label, item?.id, item?.name, 'Excluded claim'))}</strong><p>${escapeHtml(firstText(item?.note, item?.reason, item?.detail, String(item)))}</p></article>`).join('')}</div></section>` : ''}<nav class="metals-pathways" aria-label="Continue through related Tezos Chambers"><a href="/minerals/">Critical Minerals<small>Inspect the official strategic-materials atlas and its source-native supply context</small></a><a href="/uranium/">Uranium Chamber<small>Inspect a separate commodity and Etherlink token system</small></a><a href="/capital/">Capital Chamber<small>Place assets inside the wider Tezos capital map</small></a><a href="/#price">Price Intelligence<small>Read XTZ-specific market context</small></a></nav>`;
}

function renderView(snapshot) {
    if (currentView === 'markets') return renderMarkets(snapshot);
    if (currentView === 'vnxau') return renderVnxau(snapshot);
    if (currentView === 'proofbook') return renderProofbook(snapshot);
    return renderAssay(snapshot);
}

function freshnessPresentation(snapshot) {
    const generated = Date.parse(snapshot.generatedAt || '');
    const degraded = sourceInventory(snapshot).filter(({ status }) => status !== 'ok');
    const stale = !Number.isFinite(generated) || Date.now() - generated > STALE_AFTER_MS;
    const degradedLabel = degraded.length === 1 ? `${degraded[0].label} ${degraded[0].status}` : degraded.length > 1 ? `${degraded.length} sources degraded` : '';
    const base = lastRefreshError ? `Last good ${ageLabel(snapshot.generatedAt)} · refresh failed` : `Generated ${ageLabel(snapshot.generatedAt)}`;
    return { label: `${base} · ${GENERATED_PROOFBOOK_SCHEDULE_LABEL}${degradedLabel ? ` · ${degradedLabel}` : ''}`, stale: stale || Boolean(lastRefreshError) || degraded.length > 0 };
}

function syncMetalsFreshness(snapshot) {
    setChamberReadingState(document.getElementById('metals-chamber-body'), lastRefreshError || freshnessPresentation(snapshot).stale ? 'watch' : 'snapshot');
    syncSnapshotStatus(document.getElementById('metals-chamber-body'), savedSnapshot, lastRefreshError);
    const presentation = freshnessPresentation(snapshot);
    const freshness = document.getElementById('metals-freshness');
    if (freshness) {
        quietlySyncHtml(freshness, renderAgeingLabel(presentation.label, snapshot.generatedAt, ageLabel(snapshot.generatedAt)));
        freshness.classList.toggle('is-stale', presentation.stale);
    }
    const proofStatus = document.getElementById('metals-proof-refresh-status');
    if (proofStatus) {
        const label = lastRefreshError ? 'last-good retained' : renderChamberStamp(snapshot.generatedAt, 'Generated');
        quietlySyncHtml(proofStatus, label);
        proofStatus.classList.toggle('is-bad', Boolean(lastRefreshError));
        proofStatus.classList.toggle('is-good', !lastRefreshError);
    }
}

function renderChamber(snapshot) {
    const view = VIEWS.find(({ id }) => id === currentView) || VIEWS[0];
    const freshness = freshnessPresentation(snapshot);
    return `<header class="metals-header market-room-header" data-quiet-key="metals-header"><div class="metals-system-strip market-room-system-strip"><strong>Tezos Systems</strong><span aria-hidden="true">/</span><span>precious-metal intelligence</span></div><div class="metals-title-row market-room-title-row"><h2 class="market-room-title is-editorial" id="metals-title">Precious Metals Chamber</h2><span class="metals-badge market-room-badge">8 metals</span><span class="metals-freshness market-room-freshness${freshness.stale ? ' is-stale' : ''}" id="metals-freshness" aria-live="polite">${renderAgeingLabel(freshness.label, snapshot.generatedAt, ageLabel(snapshot.generatedAt))}</span></div>${snapshotStatusMarkup(savedSnapshot, lastRefreshError)}<div class="metals-tabs market-room-tabs" role="tablist" aria-label="Precious Metals Chamber views">${VIEWS.map((item) => `<button class="metals-tab market-room-tab" id="metals-tab-${item.id}" type="button" role="tab" aria-selected="${item.id === currentView}" aria-controls="metals-view-panel" tabindex="${item.id === currentView ? '0' : '-1'}" data-metals-view="${item.id}">${escapeHtml(item.label)}</button>`).join('')}</div></header>${renderChamberVerdict({ key: 'metals', state: lastRefreshError || freshness.stale ? 'watch' : 'snapshot', sentence: 'All eight metals belong in the room, but comparable monthly prices cover only the IMF quartet.', receipts: [['Metals', metalRows(snapshot).length], ['Monthly histories', metalRows(snapshot).filter(row => normalizeHistoryRows(snapshot, row.id).length).length]], timestamp: snapshot.generatedAt })}${renderChamberGuide('metals')}<section class="metals-view-shell market-room-view-shell" id="metals-view-panel" role="tabpanel" aria-labelledby="metals-tab-${view.id}" data-quiet-key="metals-view-panel"><div class="metals-view-head market-room-view-head"><div><h3>${escapeHtml(view.title)}</h3><p>${escapeHtml(view.detail)}</p></div></div><div class="metals-view-content market-room-view-content" id="metals-view-content" data-quiet-key="metals-view-content">${renderView(snapshot)}</div></section><p class="metals-disclaimer">Information only · public-source observations · not investment, custody, legal, redemption, or trading advice.</p>`;
}

function renderLoading(body) {
    body.innerHTML = chamberSkeleton({
        title: 'Precious Metals Chamber', titleId: 'metals-title',
        sections: ["Eight-metal assay","Monthly market history","VNXAU evidence","Source proofbook"]
    });
}

function renderError(body, error) {
    body.innerHTML = `<div class="metals-error chamber-state chamber-state-error" role="alert"><div><strong>Precious-metals snapshot unavailable</strong><span>${escapeHtml(error?.message || error || 'The generated snapshot could not be loaded.')}</span><button class="chamber-action" type="button" data-metals-retry>Retry</button></div></div>`;
}

function renderBody(snapshot, { quiet = false } = {}) {
    const body = document.getElementById('metals-chamber-body');
    if (!body || !snapshot) return;
    const markup = renderChamber(snapshot);
    syncChamberReading(body, markup, { quiet: quiet && body.dataset.metalsRendered === '1' });
    body.dataset.metalsRendered = '1';
}

function entryMarkup(snapshot) {
    const gold = metalRows(snapshot).find(({ id }) => id === 'XAU');
    const silver = metalRows(snapshot).find(({ id }) => id === 'XAG');
    const goldQuote = quoteModel(gold);
    const silverQuote = quoteModel(silver);
    const history = normalizeHistoryRows(snapshot, 'XAU');
    const vnx = vnxModel(snapshot);
    const goldState = observationState(goldQuote);
    const silverState = observationState(silverQuote);
    const current = metalRows(snapshot).filter((row) => observationState(quoteModel(row)) === 'current').length;
    const delta = goldState !== 'current'
        ? '<span>Last-good Au observation · not current</span>'
        : goldQuote.change24h === null
        ? '<span>Au indicative observation</span>'
        : `${escapeHtml(formatPct(goldQuote.change24h))} <span>Au indicative 24h</span>`;
    const goldSourceLabel = goldState === 'current' ? 'indicative gold quote' : 'last-good gold quote';
    const silverLabel = silverState === 'current' ? 'Silver current' : silverState === 'last-good' ? 'Silver last-good' : 'Silver unavailable';
    const historyLatest = history.at(-1);
    const historyState = retainedSourceState(snapshot, 'imfPcps', {
        value: historyLatest?.value,
        naturalClock: true
    });
    const etherlinkReceipt = sourceReceipt(snapshot, 'blockscoutVnxau');
    const etherlinkState = retainedSourceState(snapshot, 'blockscoutVnxau', {
        observedAt: vnx.etherlink.observedAt,
        value: vnx.etherlink.holders
    });
    const holderState = hasCurrentStatus(vnx.etherlink.status) && hasCurrentStatus(etherlinkReceipt?.status)
        ? etherlinkState
        : vnx.etherlink.holders === null ? 'unavailable' : 'last-good';
    const holderLabel = holderState === 'current'
        ? 'VNXAU current holder addresses'
        : holderState === 'last-good' ? 'VNXAU last-good holder addresses' : 'VNXAU holders unavailable';
    const historyLabel = historyState === 'current'
        ? `IMF completed month · ${formatDate(historyLatest?.period, true)}`
        : historyState === 'last-good'
            ? `IMF last-good history · through ${formatDate(historyLatest?.period, true)}`
            : 'IMF history unavailable';
    return `<div class="metals-entry-copy"><div class="metals-entry-title-line"><h2 class="stat-label" id="metals-entry-title">Precious Metals</h2><span class="metals-entry-chip">8-metal assay</span><span class="metals-entry-live ${statusClass(goldState === 'current' ? 'ok' : goldState)}">${escapeHtml(goldState)}</span></div><div class="stat-value metals-entry-value">${escapeHtml(formatUsd(goldQuote.price))}</div><div class="metals-entry-delta ${directionClass(goldState === 'current' ? goldQuote.change24h : null)}">${delta}</div><div class="stat-description">Gold, silver, six PGMs, and VNXAU receipts</div><div class="metals-entry-freshness">${escapeHtml(formatFreshnessStamp(goldQuote.observedAt || snapshot.generatedAt, { source: `Gold clock · ${goldSourceLabel}` }))}</div></div><div class="metals-entry-art">${launcherPicture()}</div><div class="metals-entry-kpis"><span><small>Current quotes</small><strong>${current} / 8</strong></span><span><small>${silverLabel}</small><strong>${escapeHtml(formatUsd(silverQuote.price))}</strong></span><span class="${statusClass(holderState === 'current' ? 'ok' : holderState)}"><small>${escapeHtml(holderLabel)}</small><strong>${escapeHtml(formatNumber(vnx.etherlink.holders))}</strong></span></div><div class="metals-entry-chart"><span class="metals-entry-chart-clock ${statusClass(historyState === 'current' ? 'ok' : historyState)}">${escapeHtml(historyLabel)}</span>${chartMarkup(history, 'XAU', { compact: true })}</div>`;
}

function wireEntry(card) {
    if (!card) return;
    wireChamberLauncher(card, { open: openMetalsChamber, label: 'Open Precious Metals Chamber', titleSelector: '#metals-entry-title, .stat-label' });
}

function updateEntry(snapshot, { quiet = false } = {}) {
    const front = document.getElementById('metals-entry-front');
    if (!front || !snapshot) return;
    const markup = entryMarkup(snapshot);
    const card = document.getElementById('metals-entry-card');
    if (quiet && front.dataset.metalsRendered === '1') {
        if (card) card.dataset.quietRefreshing = 'true';
        quietlySyncHtml(front, markup);
        if (card) {
            card.dataset.quietRefreshSettled = 'true';
            requestAnimationFrame(() => { if (card.isConnected) delete card.dataset.quietRefreshing; });
        }
    } else front.innerHTML = markup;
    front.dataset.metalsRendered = '1';
    const label = front.querySelector('.metals-entry-freshness')?.textContent?.trim() || '';
    if (card && label) card.dataset.updatedLabel = label;
    else delete card?.dataset.updatedLabel;
    window.syncChamberEntryFooters?.(card);
    wireEntry(card);
}

function renderEntryUnavailable(error) {
    const front = document.getElementById('metals-entry-front');
    const card = document.getElementById('metals-entry-card');
    if (!front || !card) return;
    front.innerHTML = `<div class="metals-entry-copy" role="alert"><div class="metals-entry-title-line"><h2 class="stat-label" id="metals-entry-title">Precious Metals</h2><span class="metals-entry-chip">8-metal assay</span><span class="metals-entry-live is-bad">unavailable</span></div><div class="stat-value metals-entry-value">Unavailable</div><div class="metals-entry-delta is-flat"><span>Snapshot could not be verified</span></div><div class="stat-description">Open the Chamber to retry its source-bounded proofbook.</div><div class="metals-entry-freshness">Refresh failed · no last-good receipt</div></div><div class="metals-entry-art">${launcherPicture()}</div><div class="metals-entry-kpis"><span><small>Proofbook</small><strong>Unavailable</strong></span><span><small>Failure</small><strong>${escapeHtml(firstText(error?.message, String(error || ''), 'Load failed'))}</strong></span></div>`;
    front.dataset.metalsRendered = 'error';
    card.dataset.updatedLabel = 'Unavailable · refresh failed · no last-good receipt';
    window.syncChamberEntryFooters?.(card);
    wireEntry(card);
}

function markEntryRefreshFailure(error, { quiet = true } = {}) {
    const retained = lastEntrySummary || lastSnapshot;
    if (!retained) {
        renderEntryUnavailable(error);
        return;
    }
    updateEntry(retained, { quiet });
    const front = document.getElementById('metals-entry-front');
    const card = document.getElementById('metals-entry-card');
    const label = `Compact receipt last-good ${ageLabel(retained.generatedAt)} · refresh failed`;
    const freshness = front?.querySelector('.metals-entry-freshness');
    if (freshness) freshness.textContent = label;
    if (card) {
        card.dataset.updatedLabel = label;
        window.syncChamberEntryFooters?.(card);
    }
}

function markRefreshFailure(error) {
    syncSnapshotStatus(document.getElementById('metals-chamber-body'), savedSnapshot, lastRefreshError);
    const freshness = document.getElementById('metals-freshness');
    if (freshness && lastSnapshot) {
        const failedLabel = `Last good ${ageLabel(lastSnapshot.generatedAt)} · refresh failed · ${GENERATED_PROOFBOOK_SCHEDULE_LABEL}`;
        quietlySyncHtml(freshness, renderAgeingLabel(failedLabel, lastSnapshot.generatedAt, ageLabel(lastSnapshot.generatedAt)));
        setChamberReadingState(document.getElementById('metals-chamber-body'), 'watch');
        freshness.classList.add('is-stale');
    }
    const card = document.getElementById('metals-entry-card');
    if (card && (lastSnapshot || lastEntrySummary)) {
        card.dataset.updatedLabel = `Last good ${ageLabel((lastSnapshot || lastEntrySummary).generatedAt)} · refresh failed`;
        window.syncChamberEntryFooters?.(card);
    } else if (!lastSnapshot && !lastEntrySummary) {
        renderEntryUnavailable(error);
    }
    const proofStatus = document.getElementById('metals-proof-refresh-status');
    if (proofStatus) {
        proofStatus.textContent = 'last-good retained';
        proofStatus.classList.remove('is-good', 'is-warn');
        proofStatus.classList.add('is-bad');
    }
}

function isMetalsRoute() {
    return window.location.pathname.replace(/\/+$/, '') === '/metals';
}

function applyRouteState() {
    if (!isMetalsRoute()) return;
    const url = new URL(window.location.href);
    const view = url.searchParams.get('view') || '';
    const metal = url.searchParams.get('metal')?.toUpperCase() || '';
    if (VIEW_IDS.has(view)) currentView = view;
    if (METAL_ORDER.slice(0, 4).includes(metal)) currentMetal = metal;
}

function updateRouteState() {
    if (!isMetalsRoute()) return;
    const url = new URL(window.location.href);
    url.searchParams.set('view', currentView);
    if (currentView === 'markets') url.searchParams.set('metal', currentMetal);
    else url.searchParams.delete('metal');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

async function copyText(button, value) {
    if (!value) return;
    try {
        await navigator.clipboard.writeText(value);
        const original = button.textContent;
        button.textContent = 'Copied';
        window.setTimeout(() => { if (button.isConnected) button.textContent = original; }, 1400);
    } catch {
        button.textContent = 'Copy failed';
    }
}

function bindBodyEvents(body) {
    if (!body || body.dataset.metalsEventsWired === '1') return;
    body.dataset.metalsEventsWired = '1';
    body.addEventListener('click', (event) => {
        const viewButton = event.target.closest('[data-metals-view]');
        if (viewButton && VIEW_IDS.has(viewButton.dataset.metalsView)) {
            currentView = viewButton.dataset.metalsView;
            updateRouteState();
            renderBody(lastSnapshot);
            focusChamberTab(document.getElementById(`metals-tab-${currentView}`));
            return;
        }
        const metalButton = event.target.closest('[data-metals-metal]');
        if (metalButton && METAL_ORDER.slice(0, 4).includes(metalButton.dataset.metalsMetal)) {
            currentMetal = metalButton.dataset.metalsMetal;
            updateRouteState();
            renderBody(lastSnapshot);
            document.querySelector(`[data-metals-metal="${currentMetal}"]`)?.focus({ preventScroll: true });
            return;
        }
        const copyButton = event.target.closest('[data-metals-copy]');
        if (copyButton) copyText(copyButton, copyButton.dataset.metalsCopy);
        if (event.target.closest('[data-metals-retry]')) refreshMetalsChamber({ quiet: false });
    });
    body.addEventListener('keydown', (event) => {
        const activeTab = event.target.closest('[role="tab"][data-metals-view]');
        if (!activeTab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const index = VIEWS.findIndex(({ id }) => id === activeTab.dataset.metalsView);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? VIEWS.length - 1 : event.key === 'ArrowLeft' ? (index - 1 + VIEWS.length) % VIEWS.length : (index + 1) % VIEWS.length;
        currentView = VIEWS[next].id;
        updateRouteState();
        renderBody(lastSnapshot);
        focusChamberTab(document.getElementById(`metals-tab-${currentView}`));
    });
}

function ensureOverlay() {
    let overlay = document.getElementById('metals-modal');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'metals-modal';
    overlay.className = 'modal-overlay chamber-overlay metals-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `<div class="modal-content modal-large chamber-content metals-content market-room-shell" role="dialog" aria-modal="true" aria-labelledby="metals-title"><button class="modal-close chamber-close" type="button" aria-label="Close Precious Metals Chamber">&times;</button><div class="metals-body market-room-body" id="metals-chamber-body"></div></div>`;
    overlay.querySelector('.chamber-close').addEventListener('click', closeMetalsChamber);
    overlay.addEventListener('click', (event) => { if (event.target === overlay) closeMetalsChamber(); });
    bindBodyEvents(overlay.querySelector('.metals-body'));
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
    const override = numeric(window.__METALS_CHAMBER_REFRESH_MS__);
    return override !== null && override >= 1000 ? override : DEFAULT_REFRESH_MS;
}

function entryRefreshInterval() {
    const override = numeric(window.__METALS_ENTRY_REFRESH_MS__);
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
        refreshMetalsChamber({ quiet: true });
    }, refreshInterval());
}

function startEntryRefreshTimer() {
    if (entryTimer) return;
    entryTimer = window.setInterval(() => {
        if (document.visibilityState !== 'visible') {
            entryRefreshDeferred = true;
            return;
        }
        if (document.getElementById('metals-modal')?.classList.contains('active')) return;
        refreshMetalsEntry({ quiet: true });
    }, entryRefreshInterval());
}

function bindVisibilityRefresh() {
    if (visibilityReady) return;
    visibilityReady = true;
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;
        const overlayOpen = document.getElementById('metals-modal')?.classList.contains('active');
        if (entryRefreshDeferred && !overlayOpen) {
            entryRefreshDeferred = false;
            refreshMetalsEntry({ quiet: true });
        }
        if (overlayOpen) entryRefreshDeferred = false;
        if (!refreshDeferred && !overlayOpen) return;
        refreshDeferred = false;
        refreshMetalsChamber({ quiet: true });
    });
}

async function refreshMetalsEntry({ quiet = true } = {}) {
    if (document.visibilityState !== 'visible') {
        entryRefreshDeferred = true;
        return lastSnapshot || lastEntrySummary;
    }
    try {
        const summary = await fetchMetalsEntrySummary();
        if (document.visibilityState !== 'visible') {
            entryRefreshDeferred = true;
            return lastSnapshot || lastEntrySummary;
        }
        lastEntrySummary = summary;
        entryRefreshDeferred = false;
        const snapshotAt = Date.parse(lastSnapshot?.generatedAt || '');
        const summaryAt = Date.parse(summary.generatedAt || '');
        const latest = lastSnapshot && Number.isFinite(snapshotAt) && snapshotAt > summaryAt ? lastSnapshot : summary;
        updateEntry(latest, { quiet });
        return latest;
    } catch (error) {
        if (document.visibilityState !== 'visible') {
            entryRefreshDeferred = true;
            return lastSnapshot || lastEntrySummary;
        }
        console.warn('Metals entry summary refresh failed:', error);
        markEntryRefreshFailure(error, { quiet });
        return lastEntrySummary || lastSnapshot;
    }
}

async function refreshMetalsChamber({ quiet = true, initial = false } = {}) {
    // Only a requested, not-yet-painted room may finish its initial load hidden.
    // All repeat rendering, network polling, and catch-up work remain gated.
    const mayRender = () => document.visibilityState === 'visible'
        || (initial && !lastSnapshot && document.getElementById('metals-modal')?.classList.contains('active'));
    if (!mayRender()) {
        refreshDeferred = true;
        return lastSnapshot;
    }
    if (chamberRefreshWork) return chamberRefreshWork;
    quiet = quiet || Boolean(lastSnapshot);
    chamberRefreshWork = (async () => {
        try {
            const hadRefreshError = Boolean(lastRefreshError);
            const result = pendingSnapshotRefresh || await resolveMetalsSnapshotRefresh();
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
                else syncMetalsFreshness(snapshot);
            }
            if ((changed || hadRefreshError) && document.getElementById('metals-modal')?.classList.contains('active')) {
                renderBody(snapshot, { quiet });
            }
            return snapshot;
        } catch (error) {
            if (!mayRender()) {
                refreshDeferred = true;
                return lastSnapshot;
            }
            console.warn('Metals snapshot refresh failed:', error);
            lastRefreshError = error?.message || String(error);
            markRefreshFailure(error);
            const body = document.getElementById('metals-chamber-body');
            if (!lastSnapshot && body && document.getElementById('metals-modal')?.classList.contains('active')) renderError(body, error);
            return lastSnapshot;
        }
    })().finally(() => { chamberRefreshWork = null; });
    return chamberRefreshWork;
}

function ensureEntryCard() {
    const existing = document.getElementById('metals-entry-card');
    if (existing) return existing;
    const grid = document.getElementById('chambers-grid');
    if (!grid) return null;
    const card = document.createElement('article');
    card.id = 'metals-entry-card';
    card.className = 'stat-card chamber-entry-card chamber-entry-wide chamber-entry-live metals-entry-card';
    card.dataset.chamberEntrySize = 'wide';
    card.innerHTML = `<button class="card-copy-link" type="button" data-copy-hash="#metals" aria-label="Copy Precious Metals Chamber direct link" title="Copy Precious Metals Chamber link">&#128279;</button><div class="card-inner"><div class="card-front chamber-entry-front metals-entry-front" id="metals-entry-front"><div class="metals-entry-copy" role="status" aria-live="polite"><div class="metals-entry-title-line"><h2 class="stat-label" id="metals-entry-title">Precious Metals</h2><span class="metals-entry-chip">8-metal assay</span></div><div class="stat-value metals-entry-value">Opening vault</div><div class="stat-description">Gold, silver, six PGMs, and VNXAU receipts</div></div><div class="metals-entry-art">${launcherPicture()}</div><div class="metals-entry-kpis"><span><small>Proofbook</small><strong>Verifying</strong></span></div></div></div>`;
    grid.appendChild(card);
    return card;
}

export async function openMetalsChamber({ isCurrent = () => true } = {}) {
    const opening = ++openEpoch;
    const cached = !lastSnapshot ? snapshotCache.read() : null;
    await ensureMetalsCss();
    if (opening !== openEpoch || !isCurrent()) return;
    bindVisibilityRefresh();
    applyRouteState();
    const overlay = ensureOverlay();
    const body = overlay.querySelector('.metals-body');
    overlay.classList.add('active');
    lockPageScroll();
    const painted = Boolean(lastSnapshot);
    if (painted) renderBody(lastSnapshot);
    else renderLoading(body);
    body.scrollTop = 0;
    activateChamberDialog(overlay, {
        close: closeMetalsChamber,
        dialogSelector: '.metals-content',
        titleId: 'metals-title',
        label: 'Precious Metals Chamber',
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
    await refreshMetalsChamber({ quiet: true, initial: true });
    if (opening === openEpoch && overlay.classList.contains('active')) startRefreshTimer();
}

export function closeMetalsChamber() {
    const overlay = document.getElementById('metals-modal');
    if (!requestChamberClose(overlay)) return;
    openEpoch += 1;
    stopRefreshTimer();
    overlay?.classList.remove('active');
    deactivateChamberDialog(overlay);
    unlockPageScroll();
}

export function initMetalsChamber() {
    ensureMetalsCss().catch((error) => console.warn('Precious Metals styles unavailable', error));
    bindVisibilityRefresh();
    startEntryRefreshTimer();
    const card = ensureEntryCard();
    wireEntry(card);
    if (lastSnapshot) updateEntry(lastSnapshot);
    else if (lastEntrySummary) updateEntry(lastEntrySummary);
    else if (document.visibilityState === 'visible') refreshMetalsEntry({ quiet: false });
    else entryRefreshDeferred = true;
}
