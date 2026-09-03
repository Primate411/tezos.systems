import { setChamberReadingState, renderAgeingLabel, renderChamberVerdict, renderChamberGuide, syncChamberReading } from '../ui/chamber-reading.js';
/**
 * Critical Minerals Chamber
 *
 * A 60-mineral, receipt-backed atlas spanning annual USGS context, source-
 * native World Bank monthly series, and bounded Etherlink token observations.
 * Collection remains generator-side; the browser verifies same-origin
 * artifacts and quietly reconciles background updates without moving readers.
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
    key: 'minerals', validateSnapshot, validateSummary: validateEntrySummary,
    receiptFor: (summary) => summary.fullSnapshot
});

const MINERALS_CSS_URL = versionedAsset('/css/minerals-chamber.min.css');
const MARKET_ROOM_CSS_URL = versionedAsset('/css/market-room.min.css');
const MINERALS_SNAPSHOT_URL = '/data/minerals-snapshot.json';
const MINERALS_ENTRY_SUMMARY_URL = '/data/minerals-entry-summary.json';
const DEFAULT_REFRESH_MS = 5 * 60 * 1000;
const STALE_AFTER_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const VIEWS = Object.freeze([
    { id: 'atlas', label: 'Atlas', title: 'Critical Mineral Atlas', detail: 'Search and filter the complete 60-mineral catalog without turning missing evidence into a synthetic score.' },
    { id: 'supply', label: 'Supply', title: 'Supply Exposure', detail: 'U.S. net-import reliance and source-native production concentration, with USGS qualifiers kept intact.' },
    { id: 'markets', label: 'Markets', title: 'Monthly Market Ledger', detail: 'One World Bank commodity series at a time, in its published unit, beside the annual USGS price ledger.' },
    { id: 'etherlink', label: 'Etherlink', title: 'Etherlink Receipts', detail: 'Bounded xCo, xNi, and RARE chain observations kept separate from attributed issuer claims.' },
    { id: 'proofbook', label: 'Proofbook', title: 'Proofbook', detail: 'Source clocks, methodology, unavailable evidence, integrity receipts, and adjacent commodity rooms.' }
]);
const VIEW_IDS = new Set(VIEWS.map(({ id }) => id));

const ATLAS_FILTERS = Object.freeze([
    { id: 'all', label: 'All' },
    { id: 'rare-earths', label: 'Rare earths' },
    { id: 'import-reliant', label: '100% import reliant' },
    { id: 'monthly-market', label: 'Monthly market' },
    { id: 'token-receipt', label: 'Token receipt' }
]);
const ATLAS_FILTER_IDS = new Set(ATLAS_FILTERS.map(({ id }) => id));

const MARKET_RANGES = Object.freeze([
    { id: '1Y', label: '1Y', observations: 13, performanceKey: 'oneYear' },
    { id: '5Y', label: '5Y', observations: 61, performanceKey: 'fiveYear' },
    { id: '10Y', label: '10Y', observations: 121, performanceKey: 'tenYear' },
    { id: 'ALL', label: 'All', observations: Infinity, performanceKey: '' }
]);
const MARKET_RANGE_IDS = new Set(MARKET_RANGES.map(({ id }) => id));
const TOKEN_ORDER = Object.freeze(['xCo', 'xNi', 'RARE']);

let currentView = 'atlas';
let currentSeries = '';
let currentRange = '5Y';
let atlasFilter = 'all';
let atlasQuery = '';
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
let routeReady = false;
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

function formatNumber(value, maximumFractionDigits = 2) {
    const number = numeric(value);
    if (number === null) return 'Unavailable';
    return number.toLocaleString('en-US', { maximumFractionDigits });
}

function formatCompact(value, maximumFractionDigits = 2) {
    const number = numeric(value);
    if (number === null) return 'Unavailable';
    return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits }).format(number);
}

function formatPct(value, signed = false) {
    const number = numeric(value);
    if (number === null) return 'Unavailable';
    return `${signed && number > 0 ? '+' : ''}${number.toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
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

function statusClass(value) {
    const status = String(value || '').toLowerCase();
    if (['ok', 'online', 'current', 'verified', 'catalogued', 'available'].includes(status)) return 'is-good';
    if (['stale', 'partial', 'review', 'dated', 'last-good', 'attributed'].includes(status)) return 'is-warn';
    return 'is-bad';
}

function directionClass(value) {
    const number = numeric(value);
    if (number === null || Math.abs(number) < .005) return 'is-flat';
    return number > 0 ? 'is-positive' : 'is-negative';
}

function performanceValue(value) {
    return firstNumeric(value?.changePct, value?.value, value);
}

function friendlyId(value) {
    return String(value || '')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/[-_]+/g, ' ')
        .replace(/^./, (character) => character.toUpperCase());
}

function truncate(value, head = 8, tail = 6) {
    const text = String(value || '');
    return text.length <= head + tail + 1 ? text : `${text.slice(0, head)}…${text.slice(-tail)}`;
}

function generatedAtOf(value) {
    return firstText(value?.generatedAt, value?.fullSnapshot?.generatedAt, value?.identity?.generatedAt);
}

function freshnessModel(value) {
    const generatedAt = generatedAtOf(value);
    const timestamp = Date.parse(generatedAt || '');
    const stale = !Number.isFinite(timestamp) || Date.now() - timestamp > STALE_AFTER_MS;
    const prefix = stale ? 'Last generated' : 'Generated';
    const label = `${prefix} ${ageLabel(generatedAt)} · ${GENERATED_PROOFBOOK_SCHEDULE_LABEL}`;
    return { generatedAt, stale, label };
}

function syncMineralsFreshness(snapshot) {
    setChamberReadingState(document.getElementById('minerals-chamber-body'), lastRefreshError || freshnessModel(snapshot).stale ? 'watch' : 'snapshot');
    syncSnapshotStatus(document.getElementById('minerals-chamber-body'), savedSnapshot, lastRefreshError);
    const freshness = freshnessModel(snapshot);
    const chamberFreshness = document.getElementById('minerals-freshness');
    if (chamberFreshness) {
        quietlySyncHtml(chamberFreshness, renderAgeingLabel(freshness.label, snapshot.generatedAt, ageLabel(snapshot.generatedAt)));
        chamberFreshness.classList.toggle('is-stale', freshness.stale);
    }
    const proofFreshness = document.getElementById('minerals-proof-freshness');
    if (proofFreshness) quietlySyncHtml(proofFreshness, renderAgeingLabel(freshness.label, snapshot.generatedAt, ageLabel(snapshot.generatedAt)));
    const entryFreshness = document.querySelector('#minerals-entry-front .minerals-entry-freshness');
    const entryLabel = formatFreshnessStamp(generatedAtOf(snapshot), { source: 'Generated minerals receipt' });
    if (entryFreshness && entryFreshness.textContent !== entryLabel) entryFreshness.textContent = entryLabel;
    const receiptState = document.querySelector('#minerals-entry-front [data-minerals-receipt-state]');
    if (receiptState) {
        receiptState.classList.toggle('is-warn', freshness.stale);
        receiptState.classList.toggle('is-good', !freshness.stale);
        const value = receiptState.querySelector('strong');
        const label = freshness.stale ? 'Last-good' : 'Verified';
        if (value && value.textContent !== label) value.textContent = label;
    }
    const card = document.getElementById('minerals-entry-card');
    if (card && entryLabel && card.dataset.updatedLabel !== entryLabel) {
        card.dataset.updatedLabel = entryLabel;
        window.syncChamberEntryFooters?.(card);
    }
}

function ensureMineralsCss() {
    return Promise.all([
        ensureChamberStylesheet('minerals-chamber-css', MINERALS_CSS_URL),
        ensureChamberStylesheet('market-room-css', MARKET_ROOM_CSS_URL)
    ]);
}

function mineralRows(snapshot) {
    return Array.isArray(snapshot?.taxonomy?.minerals) ? snapshot.taxonomy.minerals : [];
}

function annualFor(snapshot, id) {
    return snapshot?.annual?.minerals?.[id] || {};
}

function marketEntries(snapshot) {
    return Object.entries(snapshot?.markets?.series || {})
        .filter(([, series]) => series && typeof series === 'object' && Array.isArray(series.rows))
        .sort(([, a], [, b]) => firstText(a.name, a.seriesId).localeCompare(firstText(b.name, b.seriesId)));
}

function tokenProductsMap(snapshot) {
    const products = snapshot?.tokenized?.products;
    return products && !Array.isArray(products) && typeof products === 'object' ? products : {};
}

function tokenProductSummaries(value) {
    const products = value?.tokenized?.products;
    if (Array.isArray(products)) return products;
    if (products && typeof products === 'object') {
        return TOKEN_ORDER.map((key) => {
            const product = products[key];
            if (!product) return null;
            return {
                symbol: firstText(product.symbol, product.chain?.token?.symbol, key),
                name: firstText(product.name, product.chain?.token?.name, key),
                catalogStatus: firstText(product.catalogStatus, 'unavailable'),
                address: firstText(product.chain?.token?.address),
                totalSupply: firstNumeric(product.chain?.token?.totalSupply),
                holderAddresses: firstNumeric(product.chain?.counters?.holderAddresses),
                transfers: firstNumeric(product.chain?.counters?.transfers),
                observedAt: firstText(product.chain?.observedAt),
                status: firstText(product.chain?.status, 'unavailable')
            };
        }).filter(Boolean);
    }
    return [];
}

async function validateSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object' || snapshot.schemaVersion !== 1) {
        throw new Error('Minerals snapshot schemaVersion 1 is required.');
    }
    const rows = mineralRows(snapshot);
    const ids = rows.map(({ id }) => firstText(id));
    if (!Number.isFinite(Date.parse(snapshot.generatedAt || ''))
        || !/^[0-9a-f]{64}$/i.test(snapshot.contentHash || '')
        || rows.length !== 60
        || ids.some((id) => !id)
        || new Set(ids).size !== 60
        || !snapshot.identity
        || !snapshot.annual?.minerals
        || !snapshot.markets?.series
        || !snapshot.tokenized?.products
        || !snapshot.sources
        || !Array.isArray(snapshot.unavailable)) {
        throw new Error('Minerals snapshot is missing its 60-mineral atlas, ledgers, token receipts, or proofbook.');
    }
    if (!TOKEN_ORDER.every((key) => snapshot.tokenized.products[key])) {
        throw new Error('Minerals snapshot requires bounded xCo, xNi, and RARE product receipts.');
    }
    const { contentHash, ...unsigned } = snapshot;
    const actualHash = await sha256Text(JSON.stringify(stableJsonValue(unsigned)));
    if (actualHash.toLowerCase() !== contentHash.toLowerCase()) {
        throw new Error('Minerals snapshot failed its SHA-256 integrity receipt.');
    }
    return snapshot;
}

async function validateEntrySummary(summary) {
    if (!summary || typeof summary !== 'object' || summary.schemaVersion !== 1) {
        throw new Error('Minerals entry summary schemaVersion 1 is required.');
    }
    const products = summary?.tokenized?.products;
    const receiptPath = String(summary?.fullSnapshot?.path || '').replace(/^\//, '');
    if (!Number.isFinite(Date.parse(summary.generatedAt || ''))
        || !/^[0-9a-f]{64}$/i.test(summary.contentHash || '')
        || receiptPath !== 'data/minerals-snapshot.json'
        || summary.fullSnapshot?.schemaVersion !== 1
        || summary.fullSnapshot?.generatedAt !== summary.generatedAt
        || !/^[0-9a-f]{64}$/i.test(summary.fullSnapshot?.contentHash || '')
        || !/^[0-9a-f]{64}$/i.test(summary.fullSnapshot?.fileSha256 || '')
        || numeric(summary?.headline?.criticalCount) !== 60
        || !summary.marketPulse
        || !Array.isArray(summary.marketPulse.rows)
        || !Array.isArray(products)
        || !TOKEN_ORDER.every((key) => products.some((product) => firstText(product?.symbol).toLowerCase() === key.toLowerCase()))) {
        throw new Error('Minerals entry summary is missing its launcher projection or full-snapshot receipt.');
    }
    const { contentHash, ...unsigned } = summary;
    const actualHash = await sha256Text(JSON.stringify(stableJsonValue(unsigned)));
    if (actualHash.toLowerCase() !== contentHash.toLowerCase()) {
        throw new Error('Minerals entry summary failed its SHA-256 integrity receipt.');
    }
    return summary;
}

function fetchMineralsSnapshot(summary = lastEntrySummary) {
    if (activeFetch) return activeFetch;
    const sourceReceipt = summary?.fullSnapshot || null;
    activeFetch = fetch(MINERALS_SNAPSHOT_URL, { cache: 'no-cache', headers: { Accept: 'application/json' } })
        .then(async (response) => {
            if (!response.ok) throw new Error(`Minerals snapshot HTTP ${response.status}`);
            const text = await response.text();
            let snapshot;
            try {
                snapshot = JSON.parse(text);
            } catch {
                throw new Error('Minerals snapshot is not valid JSON.');
            }
            await validateSnapshot(snapshot);
            await assertSnapshotMatchesProjection(snapshot, text, sourceReceipt, { label: 'Minerals snapshot' });
            void snapshotCache.save(text, summary);
            return snapshot;
        })
        .finally(() => { activeFetch = null; });
    return activeFetch;
}

function fetchMineralsEntrySummary() {
    if (activeEntryFetch) return activeEntryFetch;
    activeEntryFetch = fetch(MINERALS_ENTRY_SUMMARY_URL, { cache: 'no-cache', headers: { Accept: 'application/json' } })
        .then((response) => {
            if (!response.ok) throw new Error(`Minerals entry summary HTTP ${response.status}`);
            return response.json();
        })
        .then(validateEntrySummary)
        .finally(() => { activeEntryFetch = null; });
    return activeEntryFetch;
}

function mineralsSnapshotHash(summary) {
    return String(summary?.fullSnapshot?.contentHash || '').toLowerCase();
}

async function resolveMineralsSnapshotRefresh() {
    let summary = lastEntrySummary;

    if (lastSnapshot || !summary || lastRefreshError) {
        try {
            summary = await fetchMineralsEntrySummary();
            lastEntrySummary = summary;
        } catch (error) {
            if (lastSnapshot) throw error;
            console.warn('Minerals summary poll failed during open; trying the complete snapshot:', error);
            summary = null;
        }
    }

    const projectedHash = mineralsSnapshotHash(summary);
    const loadedHash = String(lastSnapshot?.contentHash || '').toLowerCase();
    if (lastSnapshot && projectedHash && projectedHash === loadedHash) {
        return { snapshot: lastSnapshot, changed: false };
    }
    if (lastSnapshot && projectedHash) {
        const projectedAt = Date.parse(summary?.fullSnapshot?.generatedAt || summary?.generatedAt || '');
        const loadedAt = Date.parse(lastSnapshot.generatedAt || '');
        if (!Number.isFinite(projectedAt) || !Number.isFinite(loadedAt) || projectedAt <= loadedAt) {
            throw new Error('Minerals launcher projection is not newer than the loaded snapshot; retaining last-good data.');
        }
    }

    return { snapshot: await fetchMineralsSnapshot(summary), changed: true };
}

function corePicture(className = '') {
    return `<figure class="minerals-core-stage market-room-core-stage ${className}"><picture><source srcset="/assets/minerals/minerals-core-640.webp 640w, /assets/minerals/minerals-core.webp 1536w" sizes="(max-width: 700px) 100vw, 50vw" type="image/webp"><img src="/assets/minerals/minerals-core.webp" width="1536" height="1024" loading="lazy" decoding="async" alt="A dark specimen tableau of polished and raw mineral samples arranged on a circular display."></picture><figcaption>Original mineral-atlas artwork · visual identity, not a specimen-identification guide.</figcaption></figure>`;
}

function launcherPicture() {
    return `<figure class="minerals-launcher-art"><picture><source srcset="/assets/minerals/minerals-launcher-480.webp 480w, /assets/minerals/minerals-launcher.webp 960w" sizes="(max-width: 700px) 42vw, 260px" type="image/webp"><img src="/assets/minerals/minerals-launcher.webp" width="960" height="640" loading="lazy" decoding="async" alt="Six mineral specimens arranged in separate compartments in a dark display tray."></picture></figure>`;
}

function rawMetric(metric, { valueDigits = 2 } = {}) {
    if (!metric || typeof metric !== 'object') return 'Unavailable';
    const raw = firstText(metric.rawValue);
    const qualifier = firstText(metric.qualifier);
    const unit = firstText(metric.unit);
    if (raw) {
        if (['E', 'NA', 'W', 's', 'XX'].includes(raw)) {
            return `${firstText(qualifier, 'source code')} (${raw})`;
        }
        if (raw === '—') return `reported zero${unit ? ` ${unit}` : ''}`;
        const unitSuffix = unit && !raw.toLowerCase().includes(unit.toLowerCase()) ? ` ${unit}` : '';
        return `${raw}${unitSuffix}`.trim();
    }
    const value = numeric(metric.value);
    if (value === null) return 'Unavailable';
    return `${qualifier}${formatNumber(value, valueDigits)}${unit ? ` ${unit}` : ''}`.trim();
}

function annualPriceLabel(price) {
    if (!price) return 'Unavailable';
    const value = rawMetric(price, { valueDigits: 4 });
    return `${value}${price.year ? ` · ${price.year}` : ''}`;
}

function relianceLabel(reliance) {
    if (!reliance) return 'Unavailable';
    return `${rawMetric(reliance)}${reliance.year ? ` · ${reliance.year}` : ''}`;
}

function isFullyImportReliant(snapshot, mineral) {
    const reliance = annualFor(snapshot, mineral.id)?.netImportReliance;
    return reliance?.comparable === true && numeric(reliance?.value) !== null && numeric(reliance.value) >= 100;
}

function atlasMatch(snapshot, mineral) {
    const query = atlasQuery.trim().toLowerCase();
    const annual = annualFor(snapshot, mineral.id);
    const haystack = [mineral.id, mineral.name, mineral.symbol, annual.mcsCommodity]
        .filter(Boolean).join(' ').toLowerCase();
    if (query && !haystack.includes(query)) return false;
    if (atlasFilter === 'rare-earths') return mineral.isRareEarth === true;
    if (atlasFilter === 'import-reliant') return isFullyImportReliant(snapshot, mineral);
    if (atlasFilter === 'monthly-market') return Boolean(mineral.worldBankSeries && snapshot?.markets?.series?.[mineral.worldBankSeries]);
    if (atlasFilter === 'token-receipt') return Array.isArray(mineral.tokenProducts) && mineral.tokenProducts.length > 0;
    return true;
}

function renderAtlasCard(snapshot, mineral) {
    const annual = annualFor(snapshot, mineral.id);
    const reliance = annual.netImportReliance;
    const hasMarket = Boolean(mineral.worldBankSeries && snapshot?.markets?.series?.[mineral.worldBankSeries]);
    const tokens = Array.isArray(mineral.tokenProducts) ? mineral.tokenProducts : [];
    const visible = atlasMatch(snapshot, mineral);
    const search = [mineral.id, mineral.name, mineral.symbol, annual.mcsCommodity].filter(Boolean).join(' ').toLowerCase();
    return `<article class="minerals-atlas-card" data-minerals-id="${escapeHtml(mineral.id)}" data-minerals-search="${escapeHtml(search)}" data-minerals-rare="${mineral.isRareEarth === true}" data-minerals-import-reliant="${isFullyImportReliant(snapshot, mineral)}" data-minerals-monthly-market="${hasMarket}" data-minerals-token-receipt="${tokens.length > 0}" data-quiet-key="mineral-${escapeHtml(mineral.id)}"${visible ? '' : ' hidden'}><div class="minerals-symbol"><strong>${escapeHtml(firstText(mineral.symbol, '—'))}</strong><span>${mineral.isRareEarth ? 'REE' : 'CM'}</span></div><div class="minerals-atlas-copy"><h4>${escapeHtml(mineral.name)}</h4><p>${escapeHtml(firstText(annual.mcsCommodity, 'USGS catalog entry'))}</p><div class="minerals-mini-tags">${mineral.isRareEarth ? '<span>Rare earth</span>' : ''}${isFullyImportReliant(snapshot, mineral) ? '<span>100% reliant</span>' : ''}${hasMarket ? '<span>Monthly series</span>' : ''}${tokens.map((token) => `<span>${escapeHtml(token)} receipt</span>`).join('')}</div><dl><div><dt>Net import reliance</dt><dd>${escapeHtml(relianceLabel(reliance))}</dd></div><div><dt>Annual price</dt><dd>${escapeHtml(annualPriceLabel(annual.price))}</dd></div></dl></div></article>`;
}

function renderAtlas(snapshot) {
    const rows = mineralRows(snapshot);
    const identity = snapshot.identity || {};
    const visibleCount = rows.filter((mineral) => atlasMatch(snapshot, mineral)).length;
    const rareCount = rows.filter((mineral) => mineral.isRareEarth).length;
    const fullReliance = rows.filter((mineral) => isFullyImportReliant(snapshot, mineral)).length;
    const marketCount = rows.filter((mineral) => mineral.worldBankSeries && snapshot?.markets?.series?.[mineral.worldBankSeries]).length;
    return `<section class="minerals-hero"><div class="minerals-hero-copy"><span class="minerals-kicker">${escapeHtml(firstText(identity.listEdition, 'USGS critical-minerals list'))}</span><h3>Sixty materials. Separate clocks. Visible gaps.</h3><p>${escapeHtml(firstText(identity.scope, 'A source-bounded directory of critical minerals, supply exposure, monthly commodity series, and selected Etherlink receipts.'))}</p><div class="minerals-hero-metrics"><span><strong>${escapeHtml(formatNumber(identity.criticalCount ?? rows.length, 0))}</strong><small>critical minerals</small></span><span><strong>${escapeHtml(formatNumber(identity.rareEarthCount ?? rareCount, 0))}</strong><small>rare earths</small></span><span><strong>${escapeHtml(formatNumber(fullReliance, 0))}</strong><small>100% reliant</small></span><span><strong>${escapeHtml(formatNumber(marketCount, 0))}</strong><small>monthly series</small></span></div></div>${corePicture('is-room')}</section><section class="minerals-atlas-panel"><div class="minerals-atlas-tools"><label class="minerals-search"><span>Search all 60 minerals</span><input id="minerals-atlas-search" type="search" value="${escapeHtml(atlasQuery)}" placeholder="Name, symbol, or USGS commodity" autocomplete="off" data-minerals-search-input></label><div class="minerals-filter-rail" role="group" aria-label="Filter mineral atlas">${ATLAS_FILTERS.map((filter) => `<button type="button" data-minerals-filter="${filter.id}" aria-pressed="${atlasFilter === filter.id}">${escapeHtml(filter.label)}</button>`).join('')}</div><p id="minerals-atlas-count" class="minerals-result-count" role="status" aria-live="polite">${visibleCount} of ${rows.length} minerals</p></div><div class="minerals-atlas-directory" aria-label="Critical mineral directory">${rows.map((mineral) => renderAtlasCard(snapshot, mineral)).join('')}</div></section><aside class="minerals-boundary"><strong>Catalog boundary</strong><p>Critical-list membership is not a market recommendation. A mineral card can be complete as taxonomy while its price, reliance, production, or token evidence remains unavailable.</p></aside>`;
}

function producerSummary(production) {
    const leaders = Array.isArray(production?.topProducers) ? production.topProducers : [];
    const leader = production?.leader || leaders[0];
    if (!leader) return 'Unavailable';
    const share = numeric(leader.sharePct);
    return `${firstText(leader.country, 'Unknown')}${share === null ? '' : ` · ${formatPct(share)}`}`;
}

function topProducerList(production) {
    const rows = Array.isArray(production?.topProducers) ? production.topProducers.slice(0, 3) : [];
    if (!rows.length) return 'Unavailable';
    return rows.map((row) => `${firstText(row.country, 'Unknown')} ${numeric(row.sharePct) === null ? rawMetric({ value: row.value, unit: production.unit }) : formatPct(row.sharePct)}`).join(' · ');
}

function importSourceList(sources) {
    if (!Array.isArray(sources) || !sources.length) return 'Unavailable';
    return sources.map((row) => `${firstText(row.country, 'Unknown')} ${firstText(row.rawValue, numeric(row.valuePct) === null ? '' : formatPct(row.valuePct))}`.trim()).join(' · ');
}

function annualCoverageNotes(snapshot) {
    return mineralRows(snapshot)
        .map((mineral) => ({ mineral, annual: annualFor(snapshot, mineral.id) }))
        .filter(({ annual }) => firstText(annual.coverageNote));
}

function renderAnnualCoverageNotes(snapshot) {
    const notes = annualCoverageNotes(snapshot);
    if (!notes.length) return '';
    return `<section class="minerals-panel minerals-coverage-panel"><div class="minerals-panel-head"><div><span class="minerals-eyebrow">Exact-row coverage notes</span><h4>Named gaps and form boundaries</h4><p>These notes belong to the named mineral row. Group chapters and adjacent commodities do not fill an exact-row gap.</p></div><span class="minerals-unit-chip">${notes.length} declared</span></div><div class="minerals-coverage-grid">${notes.map(({ mineral, annual }) => `<article class="minerals-coverage-card" data-quiet-key="coverage-${escapeHtml(mineral.id)}"><span>${escapeHtml(firstText(annual.mcsCommodity, 'No exact MCS chapter'))}</span><strong>${escapeHtml(mineral.name)}</strong><p>${escapeHtml(annual.coverageNote)}</p></article>`).join('')}</div></section>`;
}

function renderGroupContexts(snapshot) {
    const groups = Object.entries(snapshot?.annual?.groupContexts || {})
        .filter(([, context]) => context?.scope === 'group-context' && firstText(context.mcsCommodity));
    if (!groups.length) return '';
    return `<section class="minerals-panel minerals-group-context-panel"><div class="minerals-panel-head"><div><span class="minerals-eyebrow">Group-only MCS context</span><h4>Useful context that never becomes an element fact</h4><p>USGS group chapters stay outside the 60 exact mineral rows. Their units, forms, and exclusions apply only to the named group.</p></div><span class="minerals-unit-chip">${groups.length} group receipts</span></div><div class="minerals-group-context-grid">${groups.map(([id, context]) => {
        const relianceVariants = Array.isArray(context.netImportRelianceVariants) ? context.netImportRelianceVariants : [];
        const priceVariants = Array.isArray(context.priceVariants) ? context.priceVariants : [];
        const reliance = context.netImportReliance
            ? relianceLabel(context.netImportReliance)
            : relianceVariants.length
                ? `${relianceVariants.length} source forms · not collapsed`
                : 'Unavailable';
        const price = context.price
            ? annualPriceLabel(context.price)
            : priceVariants.length
                ? `${priceVariants.length} product forms · no single price`
                : 'Unavailable';
        const production = context.production;
        const note = firstText(context.coverageNote, context.selectionNote, context.priceSelectionNote, 'No promoted metric is available for this group receipt.');
        return `<article class="minerals-group-context-card" data-quiet-key="group-context-${escapeHtml(id)}"><header><span>Group-only</span><h5>${escapeHtml(context.mcsCommodity)}</h5></header><dl><div><dt>Net import reliance</dt><dd>${escapeHtml(reliance)}</dd></div><div><dt>Leading producer</dt><dd>${escapeHtml(producerSummary(production))}</dd></div><div><dt>Annual price</dt><dd>${escapeHtml(price)}</dd></div></dl>${production ? `<p>${escapeHtml(topProducerList(production))}<small>${escapeHtml(`${production.year} · ${firstText(production.unit, 'source unit')}`)}</small></p>` : ''}<p class="minerals-group-boundary">Applies only to the USGS ${escapeHtml(context.mcsCommodity)} group chapter; it is not copied to an individual mineral.</p><small class="minerals-group-note">${escapeHtml(note)}</small></article>`;
    }).join('')}</div></section>`;
}

function renderSupply(snapshot) {
    const rows = mineralRows(snapshot);
    const withReliance = rows.filter((row) => annualFor(snapshot, row.id).netImportReliance);
    const fullyReliant = rows.filter((row) => isFullyImportReliant(snapshot, row));
    const withProduction = rows.filter((row) => annualFor(snapshot, row.id).production?.leader);
    const reportingYear = firstText(String(snapshot.identity?.reportingYear || ''), 'source-native reporting years');
    const summary = `<section class="minerals-supply-summary"><article><span class="minerals-eyebrow">USGS reliance ledger</span><strong>${withReliance.length} / 60</strong><small>minerals with a reported net-import-reliance receipt</small></article><article><span class="minerals-eyebrow">Complete reliance</span><strong>${fullyReliant.length}</strong><small>rows reported at 100%; qualifiers are not rounded away</small></article><article><span class="minerals-eyebrow">Production concentration</span><strong>${withProduction.length}</strong><small>rows with a source-native leading producer</small></article></section>`;
    const ledger = `<section class="minerals-panel"><div class="minerals-panel-head"><div><span class="minerals-eyebrow">${escapeHtml(reportingYear)}</span><h4>Reliance and production ledger</h4><p>Percent reliance, quantity units, country shares, and reporting years retain their source meanings. Blank evidence stays unavailable.</p></div></div><div class="minerals-table-wrap" tabindex="0" aria-label="Scrollable critical mineral supply table"><table class="minerals-table minerals-supply-table"><thead><tr><th>Mineral</th><th>Net import reliance</th><th>Leading producer</th><th>Top producers</th><th>U.S. import sources</th></tr></thead><tbody>${rows.map((mineral) => { const annual = annualFor(snapshot, mineral.id); const reliance = annual.netImportReliance; const production = annual.production; const relianceValue = reliance?.comparable === true ? numeric(reliance?.value) : null; const meter = relianceValue === null ? '' : `<span class="minerals-reliance-meter" aria-hidden="true"><i style="--reliance:${Math.max(0, Math.min(100, relianceValue))}%"></i></span>`; return `<tr data-quiet-key="supply-${escapeHtml(mineral.id)}"><th scope="row"><b>${escapeHtml(mineral.name)}</b><small>${escapeHtml(firstText(mineral.symbol, mineral.id))}</small>${annual.coverageNote ? '<em class="minerals-coverage-flag">coverage note below</em>' : ''}</th><td><b>${escapeHtml(relianceLabel(reliance))}</b>${meter}<small>${escapeHtml(firstText(reliance?.detail, 'No additional qualifier'))}</small></td><td><b>${escapeHtml(producerSummary(production))}</b><small>${escapeHtml(production?.year ? `${production.year} · ${firstText(production.unit, 'source unit')}` : 'Unavailable')}</small></td><td>${escapeHtml(topProducerList(production))}</td><td>${escapeHtml(importSourceList(annual.importSources))}</td></tr>`; }).join('')}</tbody></table></div></section>`;
    return `${summary}${renderAnnualCoverageNotes(snapshot)}${ledger}${renderGroupContexts(snapshot)}<p class="minerals-footnote">A reported reliance value is a USGS measure for the stated year, not a forecast of shortage. Group context is never copied onto an element row, and producer share is shown only where the source receipt supports it.</p>`;
}

function normalizedSeriesRows(series) {
    return (Array.isArray(series?.rows) ? series.rows : [])
        .map((row) => ({ month: firstText(row?.month), value: numeric(row?.value) }))
        .filter((row) => row.month && row.value !== null && Number.isFinite(Date.parse(row.month)))
        .sort((a, b) => Date.parse(a.month) - Date.parse(b.month));
}

function selectedMarket(snapshot) {
    const entries = marketEntries(snapshot);
    if (!entries.length) return ['', null];
    if (!entries.some(([id]) => id === currentSeries)) currentSeries = entries[0][0];
    return entries.find(([id]) => id === currentSeries) || entries[0];
}

function rangedRows(series) {
    const range = MARKET_RANGES.find(({ id }) => id === currentRange) || MARKET_RANGES[1];
    const rows = normalizedSeriesRows(series);
    return Number.isFinite(range.observations) ? rows.slice(-range.observations) : rows;
}

function seriesValue(value, unit) {
    const number = numeric(value);
    if (number === null) return 'Unavailable';
    return `${formatNumber(number, Math.abs(number) < 1 ? 4 : 2)}${unit ? ` ${unit}` : ''}`;
}

function marketChart(series, seriesId, { compact = false } = {}) {
    const allRows = normalizedSeriesRows(series);
    const rows = compact ? allRows.slice(-36) : rangedRows(series);
    if (rows.length < 2) return '<div class="minerals-chart-empty">Monthly history unavailable for this series and range.</div>';
    const width = compact ? 600 : 1000;
    const height = compact ? 112 : 360;
    const pad = compact ? 5 : 38;
    const values = rows.map(({ value }) => value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const coordinates = rows.map((row, index) => ({
        ...row,
        x: pad + ((width - pad * 2) * index / Math.max(1, rows.length - 1)),
        y: pad + ((height - pad * 2) * (1 - ((row.value - min) / span)))
    }));
    const line = coordinates.map(({ x, y }) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
    const area = `${coordinates[0].x.toFixed(2)},${height - pad} ${line} ${coordinates.at(-1).x.toFixed(2)},${height - pad}`;
    const first = rows[0];
    const last = rows.at(-1);
    const change = first.value === 0 ? null : ((last.value / first.value) - 1) * 100;
    const safeId = `${String(seriesId).replace(/[^a-zA-Z0-9_-]/g, '-')}-${compact ? 'entry' : currentRange.toLowerCase()}`;
    return `<div class="minerals-chart${compact ? ' is-compact' : ''}"><svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="minerals-chart-title-${safeId} minerals-chart-desc-${safeId}" preserveAspectRatio="none"><title id="minerals-chart-title-${safeId}">${escapeHtml(firstText(series?.name, seriesId))} monthly history</title><desc id="minerals-chart-desc-${safeId}">${escapeHtml(formatDate(first.month, true))} ${escapeHtml(seriesValue(first.value, series?.unit))} to ${escapeHtml(formatDate(last.month, true))} ${escapeHtml(seriesValue(last.value, series?.unit))}${change === null ? '' : `, ${escapeHtml(formatPct(change, true))}`}. Values retain the source unit.</desc><defs><linearGradient id="minerals-fill-${safeId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6ce5e8" stop-opacity=".34"/><stop offset=".58" stop-color="#bd7652" stop-opacity=".12"/><stop offset="1" stop-color="#a94436" stop-opacity="0"/></linearGradient></defs><polygon points="${area}" fill="url(#minerals-fill-${safeId})"/><polyline points="${line}" fill="none" stroke="#73e2e5" stroke-width="${compact ? 5 : 3}" vector-effect="non-scaling-stroke"/></svg>${compact ? '' : `<div class="minerals-chart-scale"><span>${escapeHtml(formatNumber(max, 4))}</span><span>${escapeHtml(formatNumber(min, 4))}</span></div>`}</div>`;
}

function renderMarkets(snapshot) {
    const entries = marketEntries(snapshot);
    if (!entries.length) return '<div class="minerals-empty">No World Bank monthly series passed the snapshot receipt.</div>';
    const [seriesId, series] = selectedMarket(snapshot);
    const rows = rangedRows(series);
    const first = rows[0];
    const last = rows.at(-1);
    const range = MARKET_RANGES.find(({ id }) => id === currentRange) || MARKET_RANGES[1];
    const suppliedPerformance = range.performanceKey ? performanceValue(series.performancePct?.[range.performanceKey]) : null;
    const derivedPerformance = first?.value && last?.value !== undefined ? ((last.value / first.value) - 1) * 100 : null;
    const performance = suppliedPerformance ?? derivedPerformance;
    const annualRows = mineralRows(snapshot).map((mineral) => ({ mineral, price: annualFor(snapshot, mineral.id).price })).filter(({ price }) => price);
    return `<section class="minerals-market-console"><div class="minerals-market-controls"><label><span>World Bank monthly series</span><select data-minerals-series aria-label="Choose World Bank monthly commodity series">${entries.map(([id, option]) => `<option value="${escapeHtml(id)}"${id === seriesId ? ' selected' : ''}>${escapeHtml(firstText(option.name, option.seriesId, id))}</option>`).join('')}</select></label><div class="minerals-range-rail" role="group" aria-label="Choose chart history range">${MARKET_RANGES.map((item) => `<button type="button" data-minerals-range="${item.id}" aria-pressed="${item.id === currentRange}">${escapeHtml(item.label)}</button>`).join('')}</div></div><div class="minerals-market-clock"><div><span class="minerals-eyebrow">Latest completed month</span><strong>${escapeHtml(seriesValue(series.latest?.value ?? last?.value, series.unit))}</strong><small>${escapeHtml(formatDate(series.latest?.month || last?.month, true))} · ${escapeHtml(firstText(series.name, seriesId))}</small></div><div><span class="minerals-eyebrow">${escapeHtml(range.label)} performance</span><strong class="${directionClass(performance)}">${escapeHtml(formatPct(performance, true))}</strong><small>${escapeHtml(formatDate(first?.month, true))} to ${escapeHtml(formatDate(last?.month, true))} · same series and unit</small></div></div><section class="minerals-panel minerals-market-panel"><div class="minerals-panel-head"><div><span class="minerals-eyebrow">${escapeHtml(firstText(series.seriesId, seriesId))}</span><h4>${escapeHtml(firstText(series.name, seriesId))}</h4><p>${escapeHtml(firstText(series.description, 'Monthly commodity observations.'))}</p></div><span class="minerals-unit-chip">${escapeHtml(firstText(series.unit, 'unit unavailable'))}</span></div>${marketChart(series, seriesId)}<div class="minerals-market-footer"><span><b>${escapeHtml(formatDate(series.coverage?.from || normalizedSeriesRows(series)[0]?.month, true))}</b> first retained month</span><span><b>${escapeHtml(formatDate(series.coverage?.to || series.latest?.month, true))}</b> latest completed month</span><span><b>${escapeHtml(formatNumber(series.coverage?.observations ?? normalizedSeriesRows(series).length, 0))}</b> observations</span><span><b>${escapeHtml(firstText(series.unit, 'Unavailable'))}</b> source-native unit</span></div></section></section><section class="minerals-panel"><div class="minerals-panel-head"><div><span class="minerals-eyebrow">USGS annual context</span><h4>Source-native price ledger</h4><p>These annual rows are not chart substitutes. Their raw values, units, detail, and reporting years remain independent of the selected monthly series.</p></div></div><div class="minerals-table-wrap" tabindex="0" aria-label="Scrollable annual critical mineral price table"><table class="minerals-table"><thead><tr><th>Mineral</th><th>Annual observation</th><th>Raw value</th><th>Source detail</th></tr></thead><tbody>${annualRows.map(({ mineral, price }) => `<tr data-quiet-key="price-${escapeHtml(mineral.id)}"><th scope="row"><b>${escapeHtml(mineral.name)}</b><small>${escapeHtml(firstText(mineral.symbol, mineral.id))}</small></th><td><b>${escapeHtml(rawMetric(price, { valueDigits: 4 }))}</b><small>${escapeHtml(price.year ? String(price.year) : 'Year unavailable')}</small></td><td>${escapeHtml(firstText(price.rawValue, 'Unavailable'))}</td><td>${escapeHtml(firstText(price.detail, 'No additional source detail'))}</td></tr>`).join('')}</tbody></table></div></section><aside class="minerals-boundary"><strong>Unit boundary</strong><p>Unlike units are never normalized, ranked, or plotted together. Monthly World Bank observations are dated reference data—not live quotes, dealer offers, or executable prices.</p></aside>`;
}

function contractLine(label, address) {
    if (!address) return `<div class="minerals-contract"><span>${escapeHtml(label)}</span><code>Unavailable</code></div>`;
    return `<div class="minerals-contract"><span>${escapeHtml(label)}</span><code title="${escapeHtml(address)}">${escapeHtml(truncate(address))}</code><button type="button" data-minerals-copy="${escapeHtml(address)}" aria-label="Copy ${escapeHtml(label)} address">Copy</button></div>`;
}

function renderIssuerClaims(claims) {
    if (!claims) return '<p>Issuer claims unavailable.</p>';
    const fields = [
        ['Summary', claims.summary],
        ['Storage', claims.storage],
        ['Redemption', claims.redemption],
        ['Price discovery', claims.priceDiscovery]
    ].filter(([, value]) => firstText(value));
    const limitations = Array.isArray(claims.limitations) ? claims.limitations.filter(Boolean) : [];
    return `<div class="minerals-claim-clock"><span>Issuer claim</span><b>${escapeHtml(formatTimestamp(claims.claimAt))}</b></div>${fields.map(([label, value]) => `<div class="minerals-claim-row"><strong>${escapeHtml(label)}</strong><p>${escapeHtml(value)}</p></div>`).join('')}${limitations.length ? `<div class="minerals-limitations"><strong>Stated limitations</strong><ul>${limitations.map((item) => `<li>${escapeHtml(String(item))}</li>`).join('')}</ul></div>` : ''}`;
}

function renderTokenProduct(key, product) {
    const chain = product?.chain || {};
    const token = chain.token || {};
    const counters = chain.counters || {};
    const holders = Array.isArray(chain.topHolders) ? chain.topHolders.slice(0, 5) : [];
    const transfers = Array.isArray(chain.recentTransfers) ? chain.recentTransfers.slice(0, 5) : [];
    const controls = chain.controls || {};
    return `<article class="minerals-token-product" data-quiet-key="token-${escapeHtml(key)}"><header><div><span class="minerals-token-symbol">${escapeHtml(firstText(product.symbol, token.symbol, key))}</span><h4>${escapeHtml(firstText(product.name, token.name, key))}</h4></div><div class="minerals-token-status"><span class="minerals-status ${statusClass(product.catalogStatus)}">${escapeHtml(firstText(product.catalogStatus, 'catalog unavailable'))}</span><span class="minerals-status ${statusClass(chain.status)}">chain ${escapeHtml(firstText(chain.status, 'unavailable'))}</span></div></header><p class="minerals-token-commodities">Catalog commodities · ${escapeHtml(Array.isArray(product.commodityIds) && product.commodityIds.length ? product.commodityIds.join(' · ') : 'Unavailable')}</p>${contractLine('Etherlink token', token.address)}<div class="minerals-chain-kpis"><span><small>Total supply</small><strong>${escapeHtml(formatNumber(token.totalSupply, 6))}</strong></span><span><small>Holder addresses</small><strong>${escapeHtml(formatNumber(counters.holderAddresses, 0))}</strong></span><span><small>Indexed transfers</small><strong>${escapeHtml(formatNumber(counters.transfers, 0))}</strong></span><span><small>Observed</small><strong>${escapeHtml(formatTimestamp(chain.observedAt))}</strong></span></div><details class="minerals-token-details"><summary>Issuer claims</summary>${renderIssuerClaims(product.issuerClaims)}</details><details class="minerals-token-details"><summary>Bounded holder and transfer receipts</summary><div class="minerals-receipt-columns"><div><h5>Top indexed holders</h5>${holders.length ? `<ol>${holders.map((holder) => `<li><code title="${escapeHtml(holder.address)}">${escapeHtml(truncate(holder.address))}</code><span>${escapeHtml(formatNumber(holder.value, 6))}</span></li>`).join('')}</ol>` : '<p>Unavailable.</p>'}</div><div><h5>Recent indexed transfers</h5>${transfers.length ? `<ol>${transfers.map((transfer) => `<li><span><time datetime="${escapeHtml(transfer.timestamp || '')}">${escapeHtml(formatTimestamp(transfer.timestamp))}</time><code title="${escapeHtml(transfer.transactionHash)}">${escapeHtml(truncate(transfer.transactionHash))}</code></span><b>${escapeHtml(formatNumber(transfer.value, 6))}</b><small>${escapeHtml(truncate(transfer.from))} → ${escapeHtml(truncate(transfer.to))}</small></li>`).join('')}</ol>` : '<p>Unavailable.</p>'}</div></div></details><details class="minerals-token-details"><summary>Contract controls</summary><dl class="minerals-control-grid"><div><dt>Proxy type</dt><dd>${escapeHtml(firstText(controls.proxyType, 'Unavailable'))}</dd></div><div><dt>Implementation</dt><dd>${escapeHtml(firstText(controls.implementationName, 'Unavailable'))}</dd></div><div><dt>Implementation address</dt><dd><code title="${escapeHtml(controls.implementationAddress || '')}">${escapeHtml(controls.implementationAddress ? truncate(controls.implementationAddress) : 'Unavailable')}</code></dd></div><div><dt>Verified</dt><dd>${controls.verified === true ? 'Yes' : controls.verified === false ? 'No' : 'Unavailable'}</dd></div></dl></details></article>`;
}

function renderRareBasket(snapshot) {
    const basket = snapshot?.tokenized?.rareBasket || {};
    const rows = Array.isArray(basket.composition) ? basket.composition : [];
    return `<section class="minerals-panel minerals-basket"><div class="minerals-panel-head"><div><span class="minerals-eyebrow">RARE fixed basket receipt</span><h4>Published composition</h4><p>The listed quantities, units, and purity remain issuer-defined product terms. They are not inferred from token balances.</p></div><span class="minerals-status ${statusClass(basket.compositionStatus)}">${escapeHtml(firstText(basket.compositionStatus, 'unavailable'))}</span></div><div class="minerals-basket-grid">${rows.length ? rows.map((row) => `<article><span>${escapeHtml(firstText(row.label, row.commodityId, 'Component'))}</span><strong>${escapeHtml(formatNumber(row.quantity, 6))} ${escapeHtml(firstText(row.unit))}</strong><small>${escapeHtml(firstText(row.purity, 'Purity not stated'))}</small></article>`).join('') : '<p>Basket composition unavailable.</p>'}</div>${basket.conflictNote ? `<aside class="minerals-conflict"><strong>Receipt conflict</strong><p>${escapeHtml(basket.conflictNote)}</p></aside>` : ''}</section>`;
}

function renderEtherlink(snapshot) {
    const products = tokenProductsMap(snapshot);
    return `<section class="minerals-etherlink-hero"><div><span class="minerals-kicker">Three bounded product receipts</span><h3>Chain state is not an issuer claim.</h3><p>Addresses, indexed supply, holder-address counts, transfers, and controls are presented as dated Etherlink observations. Storage, redemption, composition, and price-discovery language remains explicitly attributed to each issuer.</p></div><div><strong>3</strong><span>xCo · xNi · RARE</span><small>No buy, sell, swap, bridge, or redeem action is provided.</small></div></section><div class="minerals-token-grid">${TOKEN_ORDER.map((key) => products[key] ? renderTokenProduct(key, products[key]) : `<article class="minerals-token-product"><h4>${escapeHtml(key)}</h4><p>Product receipt unavailable.</p></article>`).join('')}</div>${renderRareBasket(snapshot)}<aside class="minerals-boundary"><strong>Receipt boundary</strong><p>Token transfers do not prove custody, ownership of underlying material, liquidity, redemption availability, backing, or execution. Address counts are addresses, not people.</p></aside>`;
}

function sourceRows(snapshot) {
    return Object.entries(snapshot?.sources || {}).map(([id, receipt]) => ({
        id,
        label: firstText(receipt?.label, friendlyId(id)),
        url: safeExternalUrl(receipt?.url),
        status: firstText(receipt?.status, 'unavailable'),
        observedAt: firstText(receipt?.observedAt),
        retrievedAt: firstText(receipt?.retrievedAt),
        reviewedAt: firstText(receipt?.reviewedAt),
        expiresAt: firstText(receipt?.expiresAt),
        credit: firstText(receipt?.credit),
        receipt: typeof receipt?.receipt === 'string'
            ? receipt.receipt
            : receipt?.receipt && typeof receipt.receipt === 'object'
                ? `Structured receipt · ${Object.keys(receipt.receipt).length} fields`
                : '',
        error: firstText(receipt?.error)
    }));
}

function methodologyCards(methodology) {
    if (!methodology) return '<article><strong>Methodology unavailable</strong><p>No methodology receipt was included.</p></article>';
    if (typeof methodology === 'string') return `<article><strong>Methodology</strong><p>${escapeHtml(methodology)}</p></article>`;
    if (Array.isArray(methodology)) return methodology.map((item, index) => `<article><strong>Step ${index + 1}</strong><p>${escapeHtml(typeof item === 'string' ? item : JSON.stringify(item))}</p></article>`).join('');
    return Object.entries(methodology).map(([key, value]) => {
        const text = Array.isArray(value) ? value.join(' · ') : typeof value === 'object' && value ? JSON.stringify(value) : String(value ?? 'Unavailable');
        return `<article><strong>${escapeHtml(friendlyId(key))}</strong><p>${escapeHtml(text)}</p></article>`;
    }).join('');
}

function renderProofbook(snapshot) {
    const sources = sourceRows(snapshot);
    const unavailable = [
        ...(Array.isArray(snapshot.unavailable) ? snapshot.unavailable : []),
        ...annualCoverageNotes(snapshot).map(({ mineral, annual }) => ({
            id: `mcs-${mineral.id}-coverage`,
            label: `${mineral.name} annual coverage`,
            reason: annual.coverageNote
        }))
    ];
    const freshness = freshnessModel(snapshot);
    return `<section class="minerals-proof-hero"><div><span class="minerals-kicker">Integrity before interpretation</span><h3>Every clock keeps its own name.</h3><p>List edition, annual report year, completed market month, issuer-claim date, chain observation, retrieval, review, and generation are different facts. The proofbook does not upgrade any of them to “live.”</p></div><div><strong>60</strong><span>taxonomy rows</span><small id="minerals-proof-freshness">${renderAgeingLabel(freshness.label, snapshot.generatedAt, ageLabel(snapshot.generatedAt))}</small></div></section><section class="minerals-proof-grid">${methodologyCards(snapshot.methodology)}</section><section class="minerals-panel"><div class="minerals-panel-head"><div><span class="minerals-eyebrow">Public receipts</span><h4>Source clocks</h4><p>Status and clock fields are reproduced independently. Retrieval does not change an observation’s effective date.</p></div><span class="minerals-status ${lastRefreshError ? 'is-bad' : 'is-good'}" id="minerals-proof-refresh-status">${lastRefreshError ? 'last-good retained' : 'integrity verified'}</span></div><div class="minerals-table-wrap" tabindex="0" aria-label="Scrollable minerals source proofbook"><table class="minerals-table minerals-source-table"><thead><tr><th>Source</th><th>Status</th><th>Observed / reviewed</th><th>Retrieved / expiry</th><th>Receipt</th></tr></thead><tbody>${sources.map((source) => `<tr data-quiet-key="source-${escapeHtml(source.id)}"><th scope="row"><b>${source.url ? `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.label)} ↗</a>` : escapeHtml(source.label)}</b><small>${escapeHtml(source.credit || source.id)}</small></th><td><span class="minerals-status ${statusClass(source.status)}">${escapeHtml(source.status)}</span>${source.error ? `<small>${escapeHtml(source.error)}</small>` : ''}</td><td><b>${escapeHtml(formatTimestamp(source.observedAt || source.reviewedAt))}</b><small>${source.observedAt && source.reviewedAt ? `reviewed ${escapeHtml(formatTimestamp(source.reviewedAt))}` : 'Natural clock shown'}</small></td><td><b>${escapeHtml(formatTimestamp(source.retrievedAt))}</b><small>${source.expiresAt ? `expires ${escapeHtml(formatTimestamp(source.expiresAt))}` : 'No expiry supplied'}</small></td><td>${escapeHtml(source.receipt || 'Public-source receipt')}</td></tr>`).join('')}</tbody></table></div></section><section class="minerals-panel"><div class="minerals-panel-head"><div><span class="minerals-eyebrow">Deliberate gaps</span><h4>Unavailable evidence</h4><p>Unavailable is retained as a first-class result, never silently converted to zero.</p></div></div><div class="minerals-unavailable-grid">${unavailable.length ? unavailable.map((item) => `<article><span>${escapeHtml(firstText(item.id, 'gap'))}</span><strong>${escapeHtml(firstText(item.label, 'Unavailable'))}</strong><p>${escapeHtml(firstText(item.reason, 'No defensible public receipt was retained.'))}</p></article>`).join('') : '<article><strong>No declared gaps</strong><p>The generator did not publish an unavailable-evidence row.</p></article>'}</div></section><section class="minerals-integrity"><div><span>Snapshot SHA-256 content receipt</span><code title="${escapeHtml(snapshot.contentHash)}">${escapeHtml(snapshot.contentHash)}</code></div><div><span>Schema</span><strong>v${escapeHtml(String(snapshot.schemaVersion))}</strong></div><div><span>Generated</span><strong>${escapeHtml(formatTimestamp(snapshot.generatedAt))}</strong></div></section><nav class="minerals-pathways" aria-label="Adjacent commodity Chambers"><a href="/uranium/"><strong>Uranium Chamber</strong><small>xU3O8, uranium references, and bounded Etherlink receipts</small></a><a href="/metals/"><strong>Precious Metals Chamber</strong><small>Eight-metal assay, completed-month history, and VNXAU evidence</small></a></nav>`;
}

function renderView(snapshot) {
    if (currentView === 'supply') return renderSupply(snapshot);
    if (currentView === 'markets') return renderMarkets(snapshot);
    if (currentView === 'etherlink') return renderEtherlink(snapshot);
    if (currentView === 'proofbook') return renderProofbook(snapshot);
    return renderAtlas(snapshot);
}

function renderChamber(snapshot) {
    const view = VIEWS.find(({ id }) => id === currentView) || VIEWS[0];
    const freshness = freshnessModel(snapshot);
    return `<header class="minerals-header market-room-header" data-quiet-key="minerals-header"><div class="minerals-system-strip market-room-system-strip"><strong>Tezos Systems</strong><span aria-hidden="true">/</span><span>critical-mineral intelligence</span></div><div class="minerals-title-row market-room-title-row"><h2 class="market-room-title is-editorial" id="minerals-title">${escapeHtml(firstText(snapshot.identity?.title, 'Critical Minerals Chamber'))}</h2><span class="minerals-badge market-room-badge">60 minerals</span><span class="minerals-freshness market-room-freshness${freshness.stale ? ' is-stale' : ''}" id="minerals-freshness" aria-live="polite">${renderAgeingLabel(freshness.label, snapshot.generatedAt, ageLabel(snapshot.generatedAt))}</span></div>${snapshotStatusMarkup(savedSnapshot, lastRefreshError)}<div class="minerals-tabs market-room-tabs" role="tablist" aria-label="Critical Minerals Chamber views">${VIEWS.map((item) => `<button class="minerals-tab market-room-tab" id="minerals-tab-${item.id}" type="button" role="tab" aria-selected="${item.id === currentView}" aria-controls="minerals-view-panel" tabindex="${item.id === currentView ? '0' : '-1'}" data-minerals-view="${item.id}">${escapeHtml(item.label)}</button>`).join('')}</div></header>${renderChamberVerdict({ key: 'minerals', state: lastRefreshError || freshness.stale ? 'watch' : 'snapshot', sentence: 'The atlas covers the full official list; monthly price coverage is deliberately narrower.', receipts: [['Minerals', mineralRows(snapshot).length], ['Monthly series', Object.keys(snapshot.markets?.series || {}).length]], timestamp: snapshot.generatedAt })}${renderChamberGuide('minerals')}<section class="minerals-view-shell market-room-view-shell" id="minerals-view-panel" role="tabpanel" aria-labelledby="minerals-tab-${view.id}" data-quiet-key="minerals-view-panel"><div class="minerals-view-head market-room-view-head"><div><h3>${escapeHtml(view.title)}</h3><p>${escapeHtml(view.detail)}</p></div></div><div class="minerals-view-content market-room-view-content" id="minerals-view-content" data-quiet-key="minerals-view-content">${renderView(snapshot)}</div></section><p class="minerals-disclaimer">Information only · public-source observations · no investment, custody, legal, redemption, or execution advice.</p>`;
}

function renderLoading(body) {
    body.innerHTML = chamberSkeleton({
        title: 'Critical Minerals Chamber', titleId: 'minerals-title',
        sections: ["Mineral atlas","Supply + annual context","Monthly markets","Etherlink proofbook"]
    });
}

function renderError(body, error) {
    body.innerHTML = `<div class="minerals-error chamber-state chamber-state-error" role="alert"><div><strong>Critical-minerals snapshot unavailable</strong><span>${escapeHtml(error?.message || error || 'The generated snapshot could not be loaded.')}</span><button class="chamber-action" type="button" data-minerals-retry>Retry</button></div></div>`;
}

function renderBody(snapshot, { quiet = false } = {}) {
    const body = document.getElementById('minerals-chamber-body');
    if (!body || !snapshot) return;
    const markup = renderChamber(snapshot);
    syncChamberReading(body, markup, { quiet: quiet && body.dataset.mineralsRendered === '1' });
    body.dataset.mineralsRendered = '1';
}

function headlineOf(value) {
    const headline = value?.headline || {};
    const identity = value?.identity || {};
    return {
        criticalCount: firstNumeric(headline.criticalCount, identity.criticalCount, mineralRows(value).length),
        rareEarthCount: firstNumeric(headline.rareEarthCount, identity.rareEarthCount),
        monthlySeriesCount: firstNumeric(headline.monthlySeriesCount, marketEntries(value).length),
        fullyImportReliantCount: firstNumeric(headline.fullyImportReliantCount),
        tokenProductCount: firstNumeric(headline.tokenProductCount, tokenProductSummaries(value).length)
    };
}

function entryMarketPulse(value) {
    if (value?.marketPulse) return value.marketPulse;
    const [seriesId, series] = marketEntries(value)[0] || [];
    return series ? { ...series, seriesId, rows: series.rows } : {};
}

function entryMarkup(value) {
    const headline = headlineOf(value);
    const pulse = entryMarketPulse(value);
    const latest = pulse.latest || normalizedSeriesRows(pulse).at(-1) || {};
    const performance = performanceValue(pulse.performancePct?.oneYear ?? pulse.performancePct);
    const products = tokenProductSummaries(value);
    const availableProducts = products.filter((product) => !['unavailable', 'error', 'missing'].includes(String(product.status || product.catalogStatus).toLowerCase())).length;
    const freshness = freshnessModel(value);
    const seriesName = firstText(pulse.name, pulse.seriesId, 'Monthly reference');
    return `<div class="minerals-entry-copy"><div class="minerals-entry-title-line"><h2 class="stat-label" id="minerals-entry-title">Critical Minerals</h2><span class="minerals-entry-chip">60-material atlas</span></div><div class="stat-value minerals-entry-value">${escapeHtml(formatNumber(headline.criticalCount, 0))}</div><div class="minerals-entry-delta ${directionClass(performance)}">${escapeHtml(formatPct(performance, true))} <span>${escapeHtml(seriesName)} · 1Y</span></div><div class="stat-description">Supply exposure, monthly series, and Etherlink receipts</div><div class="minerals-entry-freshness">${escapeHtml(formatFreshnessStamp(generatedAtOf(value), { source: 'Generated minerals receipt' }))}</div></div><div class="minerals-entry-art">${launcherPicture()}</div><div class="minerals-entry-kpis"><span><small>Rare earths</small><strong>${escapeHtml(formatNumber(headline.rareEarthCount, 0))}</strong></span><span><small>Monthly series</small><strong>${escapeHtml(formatNumber(headline.monthlySeriesCount, 0))}</strong></span><span><small>Etherlink products</small><strong>${availableProducts} / ${escapeHtml(formatNumber(headline.tokenProductCount, 0))}</strong></span><span data-minerals-receipt-state class="${freshness.stale ? 'is-warn' : 'is-good'}"><small>Receipt state</small><strong>${freshness.stale ? 'Last-good' : 'Verified'}</strong></span></div><div class="minerals-entry-chart"><span class="minerals-entry-chart-clock">${escapeHtml(seriesName)} · ${escapeHtml(firstText(pulse.unit, 'source unit'))} · ${escapeHtml(formatDate(latest.month, true))}</span>${marketChart({ ...pulse, rows: pulse.rows || [] }, firstText(pulse.seriesId, 'pulse'), { compact: true })}</div>`;
}

function wireEntry(card) {
    if (!card) return;
    wireChamberLauncher(card, { open: openMineralsChamber, label: 'Open Critical Minerals Chamber', titleSelector: '#minerals-entry-title, .stat-label' });
}

function updateEntry(value, { quiet = false } = {}) {
    const front = document.getElementById('minerals-entry-front');
    if (!front || !value) return;
    const markup = entryMarkup(value);
    const card = document.getElementById('minerals-entry-card');
    if (quiet && front.dataset.mineralsRendered === '1') {
        if (card) card.dataset.quietRefreshing = 'true';
        quietlySyncHtml(front, markup);
        front.dataset.quietRefreshSettled = 'true';
        if (card) {
            card.dataset.quietRefreshSettled = 'true';
            requestAnimationFrame(() => { if (card.isConnected) delete card.dataset.quietRefreshing; });
        }
    } else front.innerHTML = markup;
    front.dataset.mineralsRendered = '1';
    const label = front.querySelector('.minerals-entry-freshness')?.textContent?.trim() || '';
    if (card && label) card.dataset.updatedLabel = label;
    else delete card?.dataset.updatedLabel;
    window.syncChamberEntryFooters?.(card);
    wireEntry(card);
}

function renderEntryUnavailable(error) {
    const front = document.getElementById('minerals-entry-front');
    const card = document.getElementById('minerals-entry-card');
    if (!front || !card) return;
    front.innerHTML = `<div class="minerals-entry-copy" role="alert"><div class="minerals-entry-title-line"><h2 class="stat-label" id="minerals-entry-title">Critical Minerals</h2><span class="minerals-entry-chip">60-material atlas</span></div><div class="stat-value minerals-entry-value">Unavailable</div><div class="minerals-entry-delta is-flat"><span>Snapshot could not be verified</span></div><div class="stat-description">Open the Chamber to retry its source-bounded proofbook.</div><div class="minerals-entry-freshness">Refresh failed · no last-good receipt</div></div><div class="minerals-entry-art">${launcherPicture()}</div><div class="minerals-entry-kpis"><span><small>Failure</small><strong>${escapeHtml(firstText(error?.message, String(error || ''), 'Load failed'))}</strong></span></div>`;
    front.dataset.mineralsRendered = 'error';
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
    const front = document.getElementById('minerals-entry-front');
    const card = document.getElementById('minerals-entry-card');
    const label = `Compact receipt last-good ${ageLabel(generatedAtOf(retained))} · refresh failed`;
    const freshness = front?.querySelector('.minerals-entry-freshness');
    if (freshness) freshness.textContent = label;
    if (card) {
        card.dataset.updatedLabel = label;
        window.syncChamberEntryFooters?.(card);
    }
}

function markRefreshFailure(error) {
    syncSnapshotStatus(document.getElementById('minerals-chamber-body'), savedSnapshot, lastRefreshError);
    const freshness = document.getElementById('minerals-freshness');
    if (freshness && lastSnapshot) {
        const failedLabel = `Last good ${ageLabel(lastSnapshot.generatedAt)} · refresh failed · ${GENERATED_PROOFBOOK_SCHEDULE_LABEL}`;
        quietlySyncHtml(freshness, renderAgeingLabel(failedLabel, lastSnapshot.generatedAt, ageLabel(lastSnapshot.generatedAt)));
        setChamberReadingState(document.getElementById('minerals-chamber-body'), 'watch');
        freshness.classList.add('is-stale');
    }
    const card = document.getElementById('minerals-entry-card');
    if (card && (lastSnapshot || lastEntrySummary)) {
        card.dataset.updatedLabel = `Last good ${ageLabel(generatedAtOf(lastSnapshot || lastEntrySummary))} · refresh failed`;
        window.syncChamberEntryFooters?.(card);
    } else if (!lastSnapshot && !lastEntrySummary) renderEntryUnavailable(error);
    const proofStatus = document.getElementById('minerals-proof-refresh-status');
    if (proofStatus) {
        proofStatus.textContent = 'last-good retained';
        proofStatus.className = 'minerals-status is-bad';
    }
}

function isMineralsRoute() {
    return window.location.pathname.replace(/\/+$/, '') === '/minerals';
}

function applyRouteState() {
    if (!isMineralsRoute()) return;
    const url = new URL(window.location.href);
    const view = url.searchParams.get('view') || '';
    const series = url.searchParams.get('series') || '';
    const range = (url.searchParams.get('range') || '').toUpperCase();
    if (VIEW_IDS.has(view)) currentView = view;
    if (series) currentSeries = series;
    if (MARKET_RANGE_IDS.has(range)) currentRange = range;
}

function updateRouteState() {
    if (!isMineralsRoute()) return;
    const url = new URL(window.location.href);
    url.searchParams.set('view', currentView);
    if (currentView === 'markets') {
        if (currentSeries) url.searchParams.set('series', currentSeries);
        url.searchParams.set('range', currentRange.toLowerCase());
    } else {
        url.searchParams.delete('series');
        url.searchParams.delete('range');
    }
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

function bindRouteState() {
    if (routeReady) return;
    routeReady = true;
    window.addEventListener('popstate', () => {
        if (!isMineralsRoute()) return;
        applyRouteState();
        if (lastSnapshot && document.getElementById('minerals-modal')?.classList.contains('active')) renderBody(lastSnapshot);
    });
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

function applyAtlasFilters(body) {
    if (!body) return;
    const query = atlasQuery.trim().toLowerCase();
    let visible = 0;
    const cards = [...body.querySelectorAll('.minerals-atlas-card')];
    for (const card of cards) {
        const queryMatch = !query || String(card.dataset.mineralsSearch || '').includes(query);
        const filterDatasetKeys = {
            'rare-earths': 'mineralsRare',
            'import-reliant': 'mineralsImportReliant',
            'monthly-market': 'mineralsMonthlyMarket',
            'token-receipt': 'mineralsTokenReceipt'
        };
        const filterMatch = atlasFilter === 'all' || card.dataset[filterDatasetKeys[atlasFilter]] === 'true';
        card.hidden = !(queryMatch && filterMatch);
        if (!card.hidden) visible += 1;
    }
    body.querySelectorAll('[data-minerals-filter]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.mineralsFilter === atlasFilter)));
    const count = body.querySelector('#minerals-atlas-count');
    if (count) count.textContent = `${visible} of ${cards.length} minerals`;
}

function bindBodyEvents(body) {
    if (!body || body.dataset.mineralsEventsWired === '1') return;
    body.dataset.mineralsEventsWired = '1';
    body.addEventListener('click', (event) => {
        const viewButton = event.target.closest('[data-minerals-view]');
        if (viewButton && VIEW_IDS.has(viewButton.dataset.mineralsView)) {
            currentView = viewButton.dataset.mineralsView;
            updateRouteState();
            renderBody(lastSnapshot);
            focusChamberTab(document.getElementById(`minerals-tab-${currentView}`));
            return;
        }
        const filterButton = event.target.closest('[data-minerals-filter]');
        if (filterButton && ATLAS_FILTER_IDS.has(filterButton.dataset.mineralsFilter)) {
            atlasFilter = filterButton.dataset.mineralsFilter;
            applyAtlasFilters(body);
            return;
        }
        const rangeButton = event.target.closest('[data-minerals-range]');
        if (rangeButton && MARKET_RANGE_IDS.has(rangeButton.dataset.mineralsRange)) {
            currentRange = rangeButton.dataset.mineralsRange;
            updateRouteState();
            renderBody(lastSnapshot);
            document.querySelector(`[data-minerals-range="${currentRange}"]`)?.focus({ preventScroll: true });
            return;
        }
        const copyButton = event.target.closest('[data-minerals-copy]');
        if (copyButton) copyText(copyButton, copyButton.dataset.mineralsCopy);
        if (event.target.closest('[data-minerals-retry]')) refreshMineralsChamber({ quiet: false });
    });
    body.addEventListener('input', (event) => {
        if (!event.target.matches('[data-minerals-search-input]')) return;
        atlasQuery = event.target.value;
        applyAtlasFilters(body);
    });
    body.addEventListener('change', (event) => {
        if (!event.target.matches('[data-minerals-series]')) return;
        currentSeries = event.target.value;
        updateRouteState();
        renderBody(lastSnapshot);
        document.querySelector('[data-minerals-series]')?.focus({ preventScroll: true });
    });
    body.addEventListener('keydown', (event) => {
        const activeTab = event.target.closest('[role="tab"][data-minerals-view]');
        if (activeTab && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            const index = VIEWS.findIndex(({ id }) => id === activeTab.dataset.mineralsView);
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? VIEWS.length - 1 : event.key === 'ArrowLeft' ? (index - 1 + VIEWS.length) % VIEWS.length : (index + 1) % VIEWS.length;
            currentView = VIEWS[next].id;
            updateRouteState();
            renderBody(lastSnapshot);
            focusChamberTab(document.getElementById(`minerals-tab-${currentView}`));
            return;
        }
        if (event.key === 'Escape' && event.target.matches('[data-minerals-search-input]') && event.target.value) {
            event.preventDefault();
            event.target.value = '';
            atlasQuery = '';
            applyAtlasFilters(body);
        }
    });
}

function ensureOverlay() {
    let overlay = document.getElementById('minerals-modal');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'minerals-modal';
    overlay.className = 'modal-overlay chamber-overlay minerals-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `<div class="modal-content modal-large chamber-content minerals-content market-room-shell" role="dialog" aria-modal="true" aria-labelledby="minerals-title"><button class="modal-close chamber-close" type="button" aria-label="Close Critical Minerals Chamber">&times;</button><div class="minerals-body market-room-body" id="minerals-chamber-body"></div></div>`;
    overlay.querySelector('.chamber-close').addEventListener('click', closeMineralsChamber);
    overlay.addEventListener('click', (event) => { if (event.target === overlay) closeMineralsChamber(); });
    bindBodyEvents(overlay.querySelector('.minerals-body'));
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
    const override = numeric(window.__MINERALS_CHAMBER_REFRESH_MS__);
    return override !== null && override >= 1000 ? override : DEFAULT_REFRESH_MS;
}

function entryRefreshInterval() {
    const override = numeric(window.__MINERALS_ENTRY_REFRESH_MS__);
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
        refreshMineralsChamber({ quiet: true });
    }, refreshInterval());
}

function startEntryRefreshTimer() {
    if (entryTimer) return;
    entryTimer = window.setInterval(() => {
        if (document.visibilityState !== 'visible') {
            entryRefreshDeferred = true;
            return;
        }
        if (document.getElementById('minerals-modal')?.classList.contains('active')) return;
        refreshMineralsEntry({ quiet: true });
    }, entryRefreshInterval());
}

function bindVisibilityRefresh() {
    if (visibilityReady) return;
    visibilityReady = true;
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;
        const overlayOpen = document.getElementById('minerals-modal')?.classList.contains('active');
        if (entryRefreshDeferred && !overlayOpen) {
            entryRefreshDeferred = false;
            refreshMineralsEntry({ quiet: true });
        }
        if (overlayOpen) entryRefreshDeferred = false;
        if (!refreshDeferred && !overlayOpen) return;
        refreshDeferred = false;
        refreshMineralsChamber({ quiet: true });
    });
}

async function refreshMineralsEntry({ quiet = true } = {}) {
    if (document.visibilityState !== 'visible') {
        entryRefreshDeferred = true;
        return lastSnapshot || lastEntrySummary;
    }
    try {
        const summary = await fetchMineralsEntrySummary();
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
        console.warn('Minerals entry summary refresh failed:', error);
        markEntryRefreshFailure(error, { quiet });
        return lastEntrySummary || lastSnapshot;
    }
}

async function refreshMineralsChamber({ quiet = true, initial = false } = {}) {
    // Only a requested, not-yet-painted room may finish its initial load hidden.
    // All repeat rendering, network polling, and catch-up work remain gated.
    const mayRender = () => document.visibilityState === 'visible'
        || (initial && !lastSnapshot && document.getElementById('minerals-modal')?.classList.contains('active'));
    if (!mayRender()) {
        refreshDeferred = true;
        return lastSnapshot;
    }
    if (chamberRefreshWork) return chamberRefreshWork;
    quiet = quiet || Boolean(lastSnapshot);
    chamberRefreshWork = (async () => {
        try {
            const hadRefreshError = Boolean(lastRefreshError);
            const result = pendingSnapshotRefresh || await resolveMineralsSnapshotRefresh();
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
                else syncMineralsFreshness(snapshot);
            }
            if ((changed || hadRefreshError) && document.getElementById('minerals-modal')?.classList.contains('active')) {
                renderBody(snapshot, { quiet });
            }
            return snapshot;
        } catch (error) {
            if (!mayRender()) {
                refreshDeferred = true;
                return lastSnapshot;
            }
            console.warn('Minerals snapshot refresh failed:', error);
            lastRefreshError = error?.message || String(error);
            markRefreshFailure(error);
            const body = document.getElementById('minerals-chamber-body');
            if (!lastSnapshot && body && document.getElementById('minerals-modal')?.classList.contains('active')) renderError(body, error);
            return lastSnapshot;
        }
    })().finally(() => { chamberRefreshWork = null; });
    return chamberRefreshWork;
}

function ensureEntryCard() {
    const existing = document.getElementById('minerals-entry-card');
    if (existing) return existing;
    const grid = document.getElementById('chambers-grid');
    if (!grid) return null;
    const card = document.createElement('article');
    card.id = 'minerals-entry-card';
    card.className = 'stat-card chamber-entry-card chamber-entry-wide chamber-entry-live minerals-entry-card';
    card.dataset.chamberEntrySize = 'wide';
    card.innerHTML = `<button class="card-copy-link" type="button" data-copy-hash="#minerals" aria-label="Copy Critical Minerals Chamber direct link" title="Copy Critical Minerals Chamber link">&#128279;</button><div class="card-inner"><div class="card-front chamber-entry-front minerals-entry-front" id="minerals-entry-front"><div class="minerals-entry-copy" role="status" aria-live="polite"><div class="minerals-entry-title-line"><h2 class="stat-label" id="minerals-entry-title">Critical Minerals</h2><span class="minerals-entry-chip">60-material atlas</span></div><div class="stat-value minerals-entry-value">Opening core</div><div class="stat-description">Supply exposure, monthly series, and Etherlink receipts</div></div><div class="minerals-entry-art">${launcherPicture()}</div><div class="minerals-entry-kpis"><span><small>Proofbook</small><strong>Verifying</strong></span></div></div></div>`;
    grid.appendChild(card);
    return card;
}

export async function openMineralsChamber({ isCurrent = () => true } = {}) {
    const opening = ++openEpoch;
    const cached = !lastSnapshot ? snapshotCache.read() : null;
    await ensureMineralsCss();
    if (opening !== openEpoch || !isCurrent()) return;
    bindVisibilityRefresh();
    applyRouteState();
    const overlay = ensureOverlay();
    const body = overlay.querySelector('.minerals-body');
    overlay.classList.add('active');
    lockPageScroll();
    const painted = Boolean(lastSnapshot);
    if (painted) renderBody(lastSnapshot);
    else renderLoading(body);
    body.scrollTop = 0;
    activateChamberDialog(overlay, {
        close: closeMineralsChamber,
        dialogSelector: '.minerals-content',
        titleId: 'minerals-title',
        label: 'Critical Minerals Chamber',
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
    await refreshMineralsChamber({ quiet: true, initial: true });
    if (opening === openEpoch && overlay.classList.contains('active')) startRefreshTimer();
}

export function closeMineralsChamber() {
    const overlay = document.getElementById('minerals-modal');
    if (!requestChamberClose(overlay)) return;
    openEpoch += 1;
    stopRefreshTimer();
    overlay?.classList.remove('active');
    deactivateChamberDialog(overlay);
    unlockPageScroll();
}

export function initMineralsChamber() {
    ensureMineralsCss().catch((error) => console.warn('Critical Minerals styles unavailable', error));
    bindVisibilityRefresh();
    bindRouteState();
    startEntryRefreshTimer();
    const card = ensureEntryCard();
    wireEntry(card);
    if (lastSnapshot) updateEntry(lastSnapshot);
    else if (lastEntrySummary) updateEntry(lastEntrySummary);
    else if (document.visibilityState === 'visible') refreshMineralsEntry({ quiet: false });
    else entryRefreshDeferred = true;
}
