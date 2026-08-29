/**
 * Ecosystem Activity Chamber
 *
 * The browser reads generated first-party aggregates only. Contract discovery,
 * wallet deduplication, weekly bucketing, and historical backfills belong to
 * scripts/refresh-ecosystem-stats.mjs.
 */

import { quietlySyncHtml } from '../core/quiet-refresh.js';
import { versionedAsset } from '../core/asset-version.js';
import { GENERATED_PROOFBOOK_SCHEDULE_LABEL } from '../core/freshness-contracts.mjs';
import { sha256Text } from '../core/sha256.js';
import { assertSnapshotMatchesProjection } from '../core/snapshot-receipt.js';
import { escapeHtml } from '../core/utils.js';
import {
    activateChamberDialog,
    deactivateChamberDialog,
    wireChamberLauncher
} from '../ui/chamber-accessibility.js';
import { ensureChamberStylesheet } from '../ui/chamber-styles.js';

const ECOSYSTEM_CSS_URL = versionedAsset('/css/ecosystem.min.css');
const ECOSYSTEM_SNAPSHOT_URL = '/data/ecosystem-stats.json';
const ECOSYSTEM_ENTRY_SUMMARY_URL = '/data/ecosystem-entry-summary.json';
const DEFAULT_REFRESH_MS = 5 * 60 * 1000;
const STALE_AFTER_MS = 36 * 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const LAYERS = Object.freeze([
    { id: 'all', label: 'All layers', short: 'All' },
    { id: 'tezos', label: 'Tezos L1', short: 'L1' },
    { id: 'etherlink', label: 'Etherlink L2', short: 'L2' }
]);
const LAYER_IDS = new Set(LAYERS.map(({ id }) => id));
const RANGES = Object.freeze([
    { id: '12w', label: '12W', weeks: 12 },
    { id: '1y', label: '1Y', weeks: 52 },
    { id: '3y', label: '3Y', weeks: 156 },
    { id: 'all', label: 'All', weeks: Infinity }
]);
const RANGE_IDS = new Set(RANGES.map(({ id }) => id));
const CATEGORY_LABELS = Object.freeze({
    bridge: 'Bridge',
    defi: 'DeFi',
    gaming: 'Gaming',
    identity: 'Identity',
    nft: 'NFT',
    rwa: 'RWA'
});

let currentLayer = 'all';
let currentRange = '1y';
let currentCategory = 'all';
let currentApp = '';
let lastSnapshot = null;
let lastEntrySummary = null;
let lastRefreshError = '';
let activeSnapshotFetch = null;
let activeEntryFetch = null;
let chamberTimer = null;
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

function formatNumber(value, maximumFractionDigits = 0) {
    const number = numeric(value);
    return number === null
        ? 'Unavailable'
        : number.toLocaleString('en-US', { maximumFractionDigits });
}

function formatCompact(value) {
    const number = numeric(value);
    return number === null
        ? 'Unavailable'
        : new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(number);
}

function formatPct(value, { signed = false } = {}) {
    const number = numeric(value);
    if (number === null) return '—';
    return `${signed && number > 0 ? '+' : ''}${number.toFixed(1)}%`;
}

function formatWeek(value) {
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) return 'Unavailable';
    return new Date(timestamp).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC'
    });
}

function formatTimestamp(value) {
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) return 'Unavailable';
    return new Date(timestamp).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
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
    if (elapsed < 24 * 60 * 60 * 1000) return `${Math.floor(elapsed / (60 * 60 * 1000))}h ago`;
    return `${Math.floor(elapsed / (24 * 60 * 60 * 1000))}d ago`;
}

function safeExternalUrl(value) {
    try {
        const url = new URL(String(value));
        return url.protocol === 'https:' ? url.href : '';
    } catch {
        return '';
    }
}

function truncate(value, length = 24) {
    const text = String(value || '');
    return text.length <= length ? text : `${text.slice(0, length - 7)}…${text.slice(-6)}`;
}

function stableJsonValue(value) {
    if (Array.isArray(value)) return value.map(stableJsonValue);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableJsonValue(value[key])]));
}

async function verifyStableHash(payload, label, integrityFailure = `${label} failed its SHA-256 integrity receipt.`) {
    const { contentHash, ...unsigned } = payload || {};
    if (!/^[0-9a-f]{64}$/.test(contentHash || '')) throw new Error(`${label} content receipt is missing.`);
    const actual = await sha256Text(JSON.stringify(stableJsonValue(unsigned)));
    if (actual.toLowerCase() !== contentHash.toLowerCase()) throw new Error(integrityFailure);
}

async function validateEntrySummary(summary) {
    if (summary?.schemaVersion !== 1
        || !Number.isFinite(Date.parse(summary.generatedAt || ''))
        || summary.source?.path !== 'data/ecosystem-stats.json'
        || summary.source?.schemaVersion !== 1
        || summary.source?.generatedAt !== summary.generatedAt
        || !/^[0-9a-f]{64}$/.test(summary.source?.contentHash || '')
        || !/^[0-9a-f]{64}$/.test(summary.source?.fileSha256 || '')
        || !Array.isArray(summary.weeks)
        || summary.weeks.length === 0
        || !Array.isArray(summary.networkActivity?.weeks)
        || summary.networkActivity.weeks.length === 0
        || !summary.networkActivity?.partialWeek
        || !Array.isArray(summary.leaders?.all)
        || summary.leaders.all.length < 3) {
        throw new Error('Ecosystem launcher projection is missing required sections.');
    }
    await verifyStableHash(summary, 'Ecosystem launcher projection');
    return summary;
}

async function validateSnapshot(snapshot) {
    if (snapshot?.schemaVersion !== 1
        || !Number.isFinite(Date.parse(snapshot.generatedAt || ''))
        || !Array.isArray(snapshot.apps)
        || snapshot.apps.length < 10
        || !Array.isArray(snapshot.weeks)
        || snapshot.weeks.length === 0
        || !Array.isArray(snapshot.networkActivity?.weeks)
        || snapshot.networkActivity.weeks.length === 0
        || !snapshot.networkActivity?.partialWeek
        || !Array.isArray(snapshot.rankings?.all)
        || snapshot.rankings.all.length < 10
        || !snapshot.methodology
        || !snapshot.partialWeek
        || !snapshot.sourceReceipts) {
        throw new Error('Ecosystem snapshot is missing required generated sections.');
    }
    await verifyStableHash(
        snapshot,
        'Ecosystem snapshot',
        'Ecosystem snapshot failed its SHA-256 integrity receipt.'
    );
    return snapshot;
}

async function fetchJsonText(url) {
    const response = await fetch(url, {
        cache: 'no-cache',
        headers: { Accept: 'application/json' }
    });
    if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
    const text = await response.text();
    return { text, value: JSON.parse(text) };
}

async function fetchEntrySummary() {
    if (activeEntryFetch) return activeEntryFetch;
    activeEntryFetch = fetchJsonText(ECOSYSTEM_ENTRY_SUMMARY_URL)
        .then(({ value }) => validateEntrySummary(value))
        .finally(() => {
            activeEntryFetch = null;
        });
    return activeEntryFetch;
}

async function fetchSnapshot(summary = lastEntrySummary) {
    if (activeSnapshotFetch) return activeSnapshotFetch;
    const sourceReceipt = summary?.source || null;
    activeSnapshotFetch = fetchJsonText(ECOSYSTEM_SNAPSHOT_URL)
        .then(async ({ value, text }) => {
            await validateSnapshot(value);
            await assertSnapshotMatchesProjection(value, text, sourceReceipt, { label: 'Ecosystem snapshot' });
            return value;
        })
        .finally(() => {
            activeSnapshotFetch = null;
        });
    return activeSnapshotFetch;
}

function ecosystemSnapshotHash(summary) {
    return String(summary?.source?.contentHash || '').toLowerCase();
}

async function resolveEcosystemSnapshotRefresh() {
    let summary = lastEntrySummary;

    if (lastSnapshot || !summary || lastRefreshError) {
        try {
            summary = await fetchEntrySummary();
            lastEntrySummary = summary;
        } catch (error) {
            if (lastSnapshot) throw error;
            console.warn('Ecosystem Activity summary poll failed during open; trying the complete snapshot:', error);
            summary = null;
        }
    }

    const projectedHash = ecosystemSnapshotHash(summary);
    const loadedHash = String(lastSnapshot?.contentHash || '').toLowerCase();
    if (lastSnapshot && projectedHash && projectedHash === loadedHash) {
        return { snapshot: lastSnapshot, changed: false };
    }
    if (lastSnapshot && projectedHash) {
        const projectedAt = Date.parse(summary?.source?.generatedAt || summary?.generatedAt || '');
        const loadedAt = Date.parse(lastSnapshot.generatedAt || '');
        if (!Number.isFinite(projectedAt) || !Number.isFinite(loadedAt) || projectedAt <= loadedAt) {
            throw new Error('Ecosystem launcher projection is not newer than the loaded snapshot; retaining last-good data.');
        }
    }

    return { snapshot: await fetchSnapshot(summary), changed: true };
}

function ensureEcosystemCss() {
    return ensureChamberStylesheet('ecosystem-css', ECOSYSTEM_CSS_URL);
}

function layerLabel(layer = currentLayer) {
    return LAYERS.find(({ id }) => id === layer)?.label || 'All layers';
}

function categoryLabel(category) {
    return category === 'all' ? 'All categories' : (CATEGORY_LABELS[category] || category);
}

function metricFor(row, layer = currentLayer) {
    if (!row) return null;
    if (layer === 'all') return row.all || null;
    const metric = row.layers?.[layer] || row[layer] || null;
    return metric?.status === 'not-active' || metric?.status === 'not-tracked' ? null : metric;
}

function pctChange(current, previous) {
    const left = numeric(current);
    const right = numeric(previous);
    return left === null || right === null || right === 0
        ? null
        : ((left - right) / right) * 100;
}

function summarizeRows(rows, layer = currentLayer) {
    const usable = (rows || []).filter((row) => numeric(metricFor(row, layer)?.activeWallets) !== null);
    const latestRow = usable.at(-1) || null;
    const previousRow = usable.at(-2) || null;
    const latest = metricFor(latestRow, layer);
    const previous = metricFor(previousRow, layer);
    const yoyStart = latestRow ? new Date(Date.parse(latestRow.weekStart) - (52 * WEEK_MS)).toISOString() : '';
    const yoyRow = yoyStart ? usable.find((row) => row.weekStart === yoyStart) : null;
    const yoy = metricFor(yoyRow, layer);
    return {
        weekStart: latestRow?.weekStart || null,
        activeWallets: latest?.activeWallets ?? null,
        interactions: latest?.interactions ?? null,
        callsPerWallet: latest?.callsPerWallet ?? null,
        returningWalletRate: latest?.returningWalletRate ?? null,
        wowPct: pctChange(latest?.activeWallets, previous?.activeWallets),
        yoyPct: pctChange(latest?.activeWallets, yoy?.activeWallets)
    };
}

function appSummary(app, layer = currentLayer) {
    return summarizeRows(app?.weekly, layer);
}

function filteredApps(snapshot) {
    return snapshot.apps.filter((app) => (
        (currentCategory === 'all' || app.category === currentCategory)
        && (currentLayer === 'all' || app.layers.some((layer) => layer.id === currentLayer))
    ));
}

function rankedApps(snapshot) {
    return filteredApps(snapshot)
        .map((app) => ({ app, summary: appSummary(app) }))
        .filter(({ summary }) => numeric(summary.activeWallets) !== null)
        .sort((left, right) => (
            right.summary.activeWallets - left.summary.activeWallets
            || (right.summary.interactions || 0) - (left.summary.interactions || 0)
            || left.app.name.localeCompare(right.app.name, 'en')
        ))
        .map((item, index) => ({ rank: index + 1, ...item }));
}

function rangeRows(rows) {
    const range = RANGES.find(({ id }) => id === currentRange) || RANGES[1];
    return Number.isFinite(range.weeks) ? (rows || []).slice(-range.weeks) : [...(rows || [])];
}

function trendClass(value) {
    const number = numeric(value);
    if (number === null || number === 0) return '';
    return number > 0 ? ' is-up' : ' is-down';
}

function lineChart(rows, metricName, title, colorClass) {
    const data = rows
        .map((row) => ({ row, value: numeric(metricFor(row)?.[metricName]) }))
        .filter(({ value }) => value !== null);
    if (!data.length) {
        return `<div class="ecosystem-chart-empty">No ${escapeHtml(title.toLowerCase())} coverage in this range.</div>`;
    }
    const width = 760;
    const height = 210;
    const padX = 12;
    const padY = 18;
    const max = Math.max(1, ...data.map(({ value }) => value));
    const min = Math.min(0, ...data.map(({ value }) => value));
    const span = Math.max(1, max - min);
    const x = (index) => padX + ((width - (2 * padX)) * (data.length === 1 ? 0.5 : index / (data.length - 1)));
    const y = (value) => padY + ((height - (2 * padY)) * (1 - ((value - min) / span)));
    const points = data.map(({ value }, index) => `${x(index).toFixed(2)},${y(value).toFixed(2)}`).join(' ');
    const area = `${padX},${height - padY} ${points} ${width - padX},${height - padY}`;
    const first = data[0];
    const last = data.at(-1);
    return `
        <figure class="ecosystem-chart">
            <figcaption><strong>${escapeHtml(title)}</strong><span>${escapeHtml(formatCompact(last.value))} latest · ${escapeHtml(formatCompact(max))} peak</span></figcaption>
            <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(`${title} from ${formatWeek(first.row.weekStart)} through ${formatWeek(last.row.weekStart)}`)}" preserveAspectRatio="none">
                <line x1="${padX}" y1="${height - padY}" x2="${width - padX}" y2="${height - padY}" class="ecosystem-chart-axis"></line>
                <polygon points="${area}" class="ecosystem-chart-area ${colorClass}"></polygon>
                <polyline points="${points}" class="ecosystem-chart-line ${colorClass}"></polyline>
                <circle cx="${x(data.length - 1)}" cy="${y(last.value)}" r="4" class="ecosystem-chart-dot ${colorClass}"></circle>
            </svg>
            <div class="ecosystem-chart-dates"><span>${escapeHtml(formatWeek(first.row.weekStart))}</span><span>${escapeHtml(formatWeek(last.row.weekStart))}</span></div>
        </figure>
    `;
}

function renderLayerTabs() {
    return `
        <div class="ecosystem-tabs" role="tablist" aria-label="Ecosystem layer">
            ${LAYERS.map((layer) => `<button type="button" role="tab" id="ecosystem-tab-${layer.id}" aria-selected="${currentLayer === layer.id}" tabindex="${currentLayer === layer.id ? '0' : '-1'}" data-ecosystem-layer="${layer.id}">${escapeHtml(layer.label)}</button>`).join('')}
        </div>
    `;
}

function renderRangeTabs() {
    return `
        <div class="ecosystem-ranges" aria-label="History range">
            ${RANGES.map((range) => `<button type="button" class="${currentRange === range.id ? 'is-active' : ''}" aria-pressed="${currentRange === range.id}" data-ecosystem-range="${range.id}">${escapeHtml(range.label)}</button>`).join('')}
        </div>
    `;
}

function renderCategoryFilters(snapshot) {
    const categories = ['all', ...(snapshot.universe?.categories || [])];
    return `
        <div class="ecosystem-category-wrap">
            <span>Filter ranking + directory</span>
            <div class="ecosystem-categories" aria-label="App category">
                ${categories.map((category) => `<button type="button" class="${currentCategory === category ? 'is-active' : ''}" aria-pressed="${currentCategory === category}" data-ecosystem-category="${escapeHtml(category)}">${escapeHtml(categoryLabel(category))}</button>`).join('')}
            </div>
        </div>
    `;
}

function networkRows(snapshot) {
    return snapshot?.networkActivity?.weeks || [];
}

function networkSplit(row) {
    return `${formatNumber(metricFor(row, 'tezos')?.activeWallets)} L1 · ${formatNumber(metricFor(row, 'etherlink')?.activeWallets)} Etherlink`;
}

function renderKpis(rows, snapshot) {
    const tracked = summarizeRows(rows);
    const networkWeek = networkRows(snapshot).at(-1);
    const network = metricFor(networkWeek);
    const networkPartial = metricFor(snapshot.networkActivity?.partialWeek);
    const networkLabel = currentLayer === 'all' ? 'All active' : `${layerLabel()} active`;
    const trackedAppCount = currentLayer === 'all'
        ? snapshot.universe?.eligibleApps
        : snapshot.universe?.layers?.[currentLayer];
    return `
        <div class="ecosystem-kpis">
            <article class="is-network-primary" data-ecosystem-network-kpi><span>${escapeHtml(`${networkLabel} addresses`)}</span><strong>${escapeHtml(formatNumber(network?.activeWallets))}</strong><small>${escapeHtml(currentLayer === 'all' ? networkSplit(networkWeek) : layerLabel())} · completed week</small></article>
            <article><span>Tracked-app wallets</span><strong>${escapeHtml(formatNumber(tracked.activeWallets))}</strong><small>${escapeHtml(formatNumber(trackedAppCount))} reviewed dapps · same week</small></article>
            <article><span>Tracked interactions</span><strong>${escapeHtml(formatNumber(tracked.interactions))}</strong><small>${escapeHtml(formatNumber(tracked.callsPerWallet, 2))} calls / tracked wallet</small></article>
            <article><span>Returning tracked wallets</span><strong>${escapeHtml(formatPct(tracked.returningWalletRate))}</strong><small>from the prior completed week</small></article>
            <article class="is-partial"><span>${escapeHtml(networkLabel)} · current week</span><strong>${escapeHtml(formatNumber(networkPartial?.activeWallets))}</strong><small>partial through ${escapeHtml(formatTimestamp(snapshot.networkActivity?.partialWeek?.observedAt))}</small></article>
        </div>
    `;
}

function renderRankTable(snapshot) {
    const ranking = rankedApps(snapshot).slice(0, 10);
    const rows = ranking.length
        ? ranking.map(({ rank, app, summary }) => `
            <tr>
                <td class="is-rank">${rank}</td>
                <td><button type="button" class="ecosystem-app-link" data-ecosystem-app="${escapeHtml(app.id)}"><strong>${escapeHtml(app.name)}</strong><small>${escapeHtml(categoryLabel(app.category))}</small></button></td>
                <td>${app.layers.map((layer) => `<span class="ecosystem-layer-chip is-${escapeHtml(layer.id)}">${layer.id === 'tezos' ? 'L1' : 'L2'}</span>`).join(' ')}</td>
                <td class="is-number"><strong>${escapeHtml(formatNumber(summary.activeWallets))}</strong></td>
                <td class="is-number">${escapeHtml(formatNumber(summary.interactions))}</td>
                <td class="is-number"><span class="ecosystem-trend${trendClass(summary.wowPct)}">${escapeHtml(formatPct(summary.wowPct, { signed: true }))}</span></td>
                <td class="is-number"><span class="ecosystem-trend${trendClass(summary.yoyPct)}">${escapeHtml(formatPct(summary.yoyPct, { signed: true }))}</span></td>
            </tr>
        `).join('')
        : '<tr><td colspan="7" class="ecosystem-empty-cell">No tracked apps have completed-week coverage for this filter.</td></tr>';
    return `
        <section class="ecosystem-panel" data-quiet-key="ecosystem-top-ten">
            <div class="ecosystem-panel-head"><div><span class="ecosystem-eyebrow">Reviewed-app ranking</span><h3>Top 10 dapps</h3><p>Distinct addresses that called reviewed app contracts in the last completed Monday-to-Monday UTC week; this ranking is separate from the network-wide total above.</p></div><span class="ecosystem-week-label">${escapeHtml(formatWeek(snapshot.completeWeek?.weekStart))}</span></div>
            <div class="ecosystem-table-wrap">
                <table class="ecosystem-table">
                    <caption class="sr-only">Top dapps by weekly active wallet address</caption>
                    <thead><tr><th>#</th><th>Dapp</th><th>Layer</th><th class="is-number">Active wallets</th><th class="is-number">Interactions</th><th class="is-number">WoW</th><th class="is-number">YoY</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </section>
    `;
}

function renderDirectory(snapshot) {
    const ranking = rankedApps(snapshot);
    const cards = ranking.map(({ rank, app, summary }) => `
        <button type="button" class="ecosystem-directory-card${currentApp === app.id ? ' is-selected' : ''}" data-ecosystem-app="${escapeHtml(app.id)}">
            <span class="ecosystem-directory-rank">#${rank}</span>
            <span class="ecosystem-directory-copy"><strong>${escapeHtml(app.name)}</strong><small>${escapeHtml(app.description)}</small></span>
            <span class="ecosystem-directory-metric"><strong>${escapeHtml(formatNumber(summary.activeWallets))}</strong><small>active wallets</small></span>
        </button>
    `).join('');
    return `
        <section class="ecosystem-panel" data-quiet-key="ecosystem-directory">
            <div class="ecosystem-panel-head"><div><span class="ecosystem-eyebrow">Complete disclosed universe</span><h3>App directory</h3><p>${ranking.length} matching apps · select one for its complete weekly ledger and contract proofbook.</p></div></div>
            <div class="ecosystem-directory">${cards || '<p class="ecosystem-empty-cell">No apps match this layer and category.</p>'}</div>
        </section>
    `;
}

function renderHistoryTable(rows) {
    const body = [...rows].reverse().map((row) => {
        const metric = metricFor(row);
        return `
            <tr>
                <td>${escapeHtml(formatWeek(row.weekStart))}</td>
                <td class="is-number">${escapeHtml(formatNumber(metric?.activeWallets))}</td>
                <td class="is-number">${escapeHtml(formatNumber(metric?.interactions))}</td>
                <td class="is-number">${escapeHtml(formatNumber(metric?.callsPerWallet, 2))}</td>
                <td class="is-number">${escapeHtml(formatPct(metric?.returningWalletRate))}</td>
            </tr>
        `;
    }).join('');
    return `
        <details class="ecosystem-history-ledger">
            <summary>Inspect ${rows.length} weekly rows</summary>
            <div class="ecosystem-table-wrap">
                <table class="ecosystem-table">
                    <caption class="sr-only">Weekly active wallet and interaction history</caption>
                    <thead><tr><th>Week beginning</th><th class="is-number">Active wallets</th><th class="is-number">Interactions</th><th class="is-number">Calls / wallet</th><th class="is-number">Returning</th></tr></thead>
                    <tbody>${body}</tbody>
                </table>
            </div>
        </details>
    `;
}

function renderContractProofbook(app) {
    return `
        <div class="ecosystem-proof-grid">
            ${app.layers.map((layer) => {
                const visibleContracts = layer.contracts.slice(0, 24);
                return `
                    <article class="ecosystem-proof-card">
                        <div class="ecosystem-proof-title"><h4>${layer.id === 'tezos' ? 'Tezos L1' : 'Etherlink L2'} contracts</h4><span>${escapeHtml(formatNumber(layer.contractCount))}</span></div>
                        <p>${layer.contractSource === 'tzkt_alias_catalog' ? 'Exhaustively resolved from the disclosed TzKT alias taxonomy; exact addresses are frozen in this artifact.' : 'Explicit reviewed address list.'}</p>
                        <div class="ecosystem-contract-list">
                            ${visibleContracts.map((contract) => `<a href="${escapeHtml(safeExternalUrl(contract.sourceUrl))}" target="_blank" rel="noopener" title="${escapeHtml(contract.address)}"><span>${escapeHtml(contract.alias || truncate(contract.address))}</span><code>${escapeHtml(truncate(contract.address, 20))}</code></a>`).join('')}
                        </div>
                        ${layer.contractCount > visibleContracts.length ? `<p class="ecosystem-proof-note">${escapeHtml(formatNumber(layer.contractCount - visibleContracts.length))} more frozen addresses are retained in the downloadable dataset.</p>` : ''}
                        <div class="ecosystem-proof-links">
                            ${(layer.proofUrls || []).map((url) => `<a href="${escapeHtml(safeExternalUrl(url))}" target="_blank" rel="noopener">Review identity proof ↗</a>`).join('')}
                        </div>
                    </article>
                `;
            }).join('')}
        </div>
    `;
}

function renderHistoryPanel(snapshot) {
    const selected = currentApp ? snapshot.apps.find((app) => app.id === currentApp) : null;
    const sourceRows = selected?.weekly || snapshot.weeks;
    const rows = rangeRows(sourceRows).filter((row) => numeric(metricFor(row)?.activeWallets) !== null);
    const title = selected ? selected.name : 'Tracked dapp universe';
    const summary = summarizeRows(sourceRows);
    const partial = selected ? metricFor(selected.partial) : metricFor(snapshot.partialWeek);
    return `
        <section class="ecosystem-panel ecosystem-history-panel" id="ecosystem-history-detail" data-quiet-key="ecosystem-history-detail">
            <div class="ecosystem-panel-head">
                <div>
                    <span class="ecosystem-eyebrow">${selected ? escapeHtml(categoryLabel(selected.category)) : 'Historical activity'}</span>
                    <h3 id="ecosystem-detail-title" tabindex="-1">${escapeHtml(title)}</h3>
                    <p>${selected ? escapeHtml(selected.description) : 'Unique wallet-layer identities that touched the disclosed app universe. This is the reviewed-app subset, not the all-address network count.'}</p>
                </div>
                <div class="ecosystem-detail-actions">
                    ${selected ? `<a href="${escapeHtml(safeExternalUrl(selected.website))}" target="_blank" rel="noopener">Open dapp ↗</a><button type="button" data-ecosystem-clear-app>Show ecosystem</button>` : ''}
                </div>
            </div>
            <div class="ecosystem-detail-kpis">
                <span><small>Completed week</small><strong>${escapeHtml(formatNumber(summary.activeWallets))}</strong><em>${selected ? 'active wallets' : 'tracked-app wallets'}</em></span>
                <span><small>WoW</small><strong class="${trendClass(summary.wowPct)}">${escapeHtml(formatPct(summary.wowPct, { signed: true }))}</strong><em>weekly change</em></span>
                <span><small>YoY</small><strong class="${trendClass(summary.yoyPct)}">${escapeHtml(formatPct(summary.yoyPct, { signed: true }))}</strong><em>52-week change</em></span>
                <span class="is-partial"><small>Partial week</small><strong>${escapeHtml(formatNumber(partial?.activeWallets))}</strong><em>not ranked</em></span>
            </div>
            <div class="ecosystem-chart-grid">
                ${lineChart(rows, 'activeWallets', `${title} active wallets`, 'is-wallets')}
                ${lineChart(rows, 'interactions', `${title} interactions`, 'is-interactions')}
            </div>
            ${renderHistoryTable(rows)}
            ${selected ? renderContractProofbook(selected) : ''}
        </section>
    `;
}

function freshnessPresentation(snapshot) {
    const generated = Date.parse(snapshot.generatedAt);
    const stale = !Number.isFinite(generated) || Date.now() - generated > STALE_AFTER_MS;
    return {
        stale: stale || Boolean(lastRefreshError),
        label: lastRefreshError
            ? `Last good ${ageLabel(snapshot.generatedAt)} · refresh failed · ${GENERATED_PROOFBOOK_SCHEDULE_LABEL}`
            : `Generated ${ageLabel(snapshot.generatedAt)} · ${GENERATED_PROOFBOOK_SCHEDULE_LABEL}`
    };
}

function syncEcosystemFreshness(snapshot) {
    const presentation = freshnessPresentation(snapshot);
    const freshness = document.getElementById('ecosystem-freshness');
    if (freshness) {
        if (freshness.textContent !== presentation.label) freshness.textContent = presentation.label;
        freshness.classList.toggle('is-stale', presentation.stale);
    }
    const card = document.getElementById('ecosystem-entry-card');
    if (card && card.dataset.updatedLabel !== presentation.label) {
        card.dataset.updatedLabel = presentation.label;
        window.syncChamberEntryFooters?.(card);
    }
}

function renderMethodology(snapshot) {
    const method = snapshot.methodology || {};
    const catalogReceipt = (snapshot.sourceReceipts?.tzkt?.catalog || [])
        .map((receipt) => `${formatNumber(receipt.aliasedContracts)} aliased ${String(receipt.kind || '').replace('_', ' ')} rows via ${receipt.pagination}, ${formatNumber(receipt.pageSize)} per page`)
        .join(' · ');
    return `
        <details class="ecosystem-methodology">
            <summary>Methodology and coverage boundary</summary>
            <div class="ecosystem-method-grid">
                <p><strong>Week:</strong> ${escapeHtml(method.weekBoundary || '')}</p>
                <p><strong>All active:</strong> ${escapeHtml(method.networkActivity || '')}</p>
                <p><strong>L1 all active:</strong> ${escapeHtml(method.networkTezosWallet || '')}</p>
                <p><strong>L2 all active:</strong> ${escapeHtml(method.networkEtherlinkWallet || '')}</p>
                <p><strong>Ranked dapps:</strong> ${escapeHtml(method.ranking || '')}</p>
                <p><strong>Tezos:</strong> ${escapeHtml(method.tezosWallet || '')}</p>
                <p><strong>Etherlink:</strong> ${escapeHtml(method.etherlinkWallet || '')}</p>
                <p><strong>Cross-layer:</strong> ${escapeHtml(method.allLayerIdentity || '')}</p>
                <p><strong>Interaction:</strong> ${escapeHtml(method.interaction || '')}</p>
                <p><strong>Returning:</strong> ${escapeHtml(method.retention || '')}</p>
                <p><strong>YoY:</strong> ${escapeHtml(method.yoy || '')}</p>
                <p><strong>Boundary:</strong> ${escapeHtml(method.caveat || '')}</p>
            </div>
            <div class="ecosystem-receipts">
                <p><strong>Network coverage begins:</strong> ${escapeHtml(formatWeek(snapshot.networkActivity?.coverageStart))}</p>
                <p><strong>TzKT all-address scan:</strong> ${escapeHtml(snapshot.sourceReceipts?.tzkt?.networkActivity?.filter || 'Receipt unavailable')} · ${escapeHtml(snapshot.sourceReceipts?.tzkt?.networkActivity?.pagination || 'Pagination unavailable')}</p>
                <p><strong>Etherlink all-address chart:</strong> ${escapeHtml(snapshot.sourceReceipts?.etherlink?.networkActivity?.chart || 'Receipt unavailable')} · ${escapeHtml(snapshot.sourceReceipts?.etherlink?.networkActivity?.resolution || 'Resolution unavailable')}</p>
                <p><strong>TzKT catalog:</strong> ${escapeHtml(catalogReceipt || 'Catalog receipt unavailable')}</p>
                <p><strong>Content SHA-256:</strong> <code>${escapeHtml(snapshot.contentHash || 'Unavailable')}</code></p>
                <p><strong>Contract-universe SHA-256:</strong> <code>${escapeHtml(snapshot.contractUniverseHash || 'Unavailable')}</code></p>
                <p><strong>Manifest SHA-256:</strong> <code>${escapeHtml(snapshot.manifestHash || 'Unavailable')}</code></p>
            </div>
        </details>
    `;
}

function renderChamber(snapshot) {
    if (!snapshot.universe.categories.includes(currentCategory)) currentCategory = 'all';
    if (currentApp && !snapshot.apps.some((app) => app.id === currentApp)) currentApp = '';
    const rows = snapshot.weeks;
    const freshness = freshnessPresentation(snapshot);
    return `
        <header class="ecosystem-header" data-quiet-key="ecosystem-header">
            <div class="ecosystem-system-strip"><strong>Tezos Systems</strong><span aria-hidden="true">/</span><span>network-wide + app activity</span></div>
            <div class="ecosystem-title-row">
                <h2 id="ecosystem-title">Ecosystem Activity</h2>
                <span class="ecosystem-badge">Weekly address ledger</span>
                <span class="ecosystem-freshness${freshness.stale ? ' is-stale' : ''}" id="ecosystem-freshness">${escapeHtml(freshness.label)}</span>
            </div>
            <p class="ecosystem-intro">All transaction-originating addresses across Tezos L1 and Etherlink, beside the distinct subset that touched reviewed dapps. Network-wide activity, app rankings, partial-week telemetry, and contract receipts stay explicitly separate.</p>
            ${renderLayerTabs()}
        </header>
        <div class="ecosystem-toolbar" data-quiet-key="ecosystem-toolbar">
            ${renderRangeTabs()}
            ${renderCategoryFilters(snapshot)}
        </div>
        ${renderKpis(rows, snapshot)}
        <div class="ecosystem-chart-grid ecosystem-overview-charts">
            ${lineChart(rangeRows(rows), 'activeWallets', `${layerLabel()} tracked-app wallets`, 'is-wallets')}
            ${lineChart(rangeRows(rows), 'interactions', `${layerLabel()} tracked-app interactions`, 'is-interactions')}
        </div>
        ${renderRankTable(snapshot)}
        ${renderDirectory(snapshot)}
        ${renderHistoryPanel(snapshot)}
        ${renderMethodology(snapshot)}
        <footer class="ecosystem-footer">
            <span>Powered by <a href="${escapeHtml(safeExternalUrl(snapshot.sourceReceipts?.tzkt?.url))}" target="_blank" rel="noopener">TzKT API</a> and <a href="${escapeHtml(safeExternalUrl(snapshot.sourceReceipts?.etherlink?.url))}" target="_blank" rel="noopener">Etherlink Blockscout</a>.</span>
            <span><a href="/data/ecosystem-stats.json" target="_blank" rel="noopener">Download full JSON ↗</a> · <a href="/data/ecosystem-apps.json" target="_blank" rel="noopener">Review app manifest ↗</a> · <a href="https://github.com/Primate411/tezos.systems/blob/main/scripts/refresh-ecosystem-stats.mjs" target="_blank" rel="noopener">Rebuild source ↗</a> · <a href="/history/">Network signal history →</a></span>
        </footer>
    `;
}

function renderLoading(body) {
    body.innerHTML = '<div class="ecosystem-loading"><div><strong>Opening the activity ledger…</strong><span>Loading the generated first-party history.</span></div></div>';
}

function renderError(body, error) {
    body.innerHTML = `<div class="ecosystem-error"><div><strong>Ecosystem history unavailable</strong><span>${escapeHtml(error?.message || error || 'The generated snapshot could not be loaded.')}</span><button type="button" data-ecosystem-retry>Retry</button></div></div>`;
}

function renderBody(snapshot, { quiet = false } = {}) {
    const body = document.getElementById('ecosystem-chamber-body');
    if (!body || !snapshot) return;
    const markup = renderChamber(snapshot);
    if (quiet && body.dataset.ecosystemRendered === '1') quietlySyncHtml(body, markup);
    else body.innerHTML = markup;
    body.dataset.ecosystemRendered = '1';
}

function summaryRows(snapshot) {
    return (snapshot.weeks || []).slice(-26);
}

function networkSummaryRows(snapshot) {
    return networkRows(snapshot).slice(-26);
}

function summaryLeaders(snapshot) {
    const ranked = snapshot.leaders?.all || snapshot.rankings?.all || [];
    return Array.from({ length: 3 }, (_unused, index) => ranked[index] || null);
}

function entryLeaderMarkup(leader, index) {
    const rank = leader?.rank || index + 1;
    const layers = (leader?.layers || []).map((layer) => layerLabel(layer)).join(' + ') || 'Layer building';
    return `
        <div class="ecosystem-entry-tile ecosystem-entry-leader" role="listitem" data-ecosystem-leader-rank="${rank}">
            <small>#${rank} app · ${escapeHtml(leader ? categoryLabel(leader.category) : 'Building')} · ${escapeHtml(layers)}</small>
            <strong>${escapeHtml(leader?.name || 'Building')}</strong>
            <em>${escapeHtml(formatNumber(leader?.activeWallets))} active wallets</em>
        </div>
    `;
}

function entrySparkline(rows) {
    const values = (rows || []).map((row) => numeric(metricFor(row, 'all')?.activeWallets)).filter((value) => value !== null);
    if (values.length < 2) return '<div class="ecosystem-entry-empty">Network monitor starts here</div>';
    const width = 360;
    const height = 76;
    const max = Math.max(1, ...values);
    const min = Math.min(...values);
    const span = Math.max(1, max - min);
    const points = values.map((value, index) => {
        const x = (index / (values.length - 1)) * width;
        const y = 6 + ((height - 12) * (1 - ((value - min) / span)));
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    return `<svg class="ecosystem-entry-sparkline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Trailing network-wide weekly active address history"><polyline points="${points}"></polyline></svg>`;
}

function entryMarkup(snapshot) {
    const trackedRows = summaryRows(snapshot);
    const trackedLatest = metricFor(trackedRows.at(-1), 'all');
    const allAddressRows = networkSummaryRows(snapshot);
    const networkWeek = allAddressRows.at(-1);
    const networkLatest = metricFor(networkWeek, 'all');
    const networkPartial = metricFor(snapshot.networkActivity?.partialWeek, 'all');
    const leaders = summaryLeaders(snapshot);
    const completedWeek = snapshot.completeWeek?.weekStart || networkWeek?.weekStart;
    const layerUniverse = snapshot.universe?.layers || {};
    return `
        <div class="ecosystem-entry-heading">
            <div class="ecosystem-entry-title-line"><h2 class="stat-label" id="ecosystem-entry-title">Ecosystem Activity</h2><span>Weekly</span></div>
            <p>All active addresses plus the reviewed-dapp subset · completed Monday-to-Monday UTC week</p>
        </div>
        <div class="ecosystem-entry-kpis ecosystem-entry-grid" role="list" aria-label="Top apps, all active addresses, and reviewed-dapp activity">
            ${leaders.map(entryLeaderMarkup).join('')}
            <div class="ecosystem-entry-tile ecosystem-entry-summary ecosystem-entry-completed ecosystem-entry-network" role="listitem">
                <small>All active · ${escapeHtml(formatWeek(completedWeek))}</small>
                <strong class="ecosystem-entry-value">${escapeHtml(formatNumber(networkLatest?.activeWallets))}</strong>
                <em>${escapeHtml(networkSplit(networkWeek))}</em>
                <div class="ecosystem-entry-chart">${entrySparkline(allAddressRows)}<span>Network-wide weekly history</span></div>
            </div>
            <div class="ecosystem-entry-tile ecosystem-entry-summary" role="listitem">
                <small>Tracked-dapp activity</small>
                <strong>${escapeHtml(formatNumber(trackedLatest?.activeWallets))}</strong>
                <em>${escapeHtml(formatNumber(snapshot.universe?.eligibleApps))} apps · ${escapeHtml(formatNumber(layerUniverse.tezos))} L1 / ${escapeHtml(formatNumber(layerUniverse.etherlink))} L2</em>
            </div>
            <div class="ecosystem-entry-tile ecosystem-entry-summary is-partial" role="listitem">
                <small>All active · partial</small>
                <strong>${escapeHtml(formatNumber(networkPartial?.activeWallets))}</strong>
                <em>${escapeHtml(networkSplit(snapshot.networkActivity?.partialWeek))}</em>
            </div>
        </div>
    `;
}

function updateEntry(snapshot, { quiet = false } = {}) {
    const front = document.getElementById('ecosystem-entry-front');
    if (!front || !snapshot) return;
    const markup = entryMarkup(snapshot);
    if (quiet && front.dataset.ecosystemRendered === '1') quietlySyncHtml(front, markup);
    else front.innerHTML = markup;
    front.dataset.ecosystemRendered = '1';
    const card = document.getElementById('ecosystem-entry-card');
    if (card) card.dataset.updatedLabel = freshnessPresentation(snapshot).label;
    window.syncChamberEntryFooters?.(card);
    wireEntry(card);
}

function markRefreshFailure() {
    const freshness = document.getElementById('ecosystem-freshness');
    if (freshness && lastSnapshot) {
        freshness.textContent = `Last good ${ageLabel(lastSnapshot.generatedAt)} · refresh failed · ${GENERATED_PROOFBOOK_SCHEDULE_LABEL}`;
        freshness.classList.add('is-stale');
    }
    const card = document.getElementById('ecosystem-entry-card');
    if (card && (lastSnapshot || lastEntrySummary)) {
        card.dataset.updatedLabel = `Last good ${ageLabel((lastSnapshot || lastEntrySummary).generatedAt)} · refresh failed · ${GENERATED_PROOFBOOK_SCHEDULE_LABEL}`;
        window.syncChamberEntryFooters?.(card);
    }
}

function isEcosystemRoute() {
    return window.location.pathname.replace(/\/+$/, '') === '/ecosystem';
}

function readRouteState() {
    if (!isEcosystemRoute()) return;
    const params = new URL(window.location.href).searchParams;
    const layer = params.get('layer');
    const range = params.get('range');
    if (LAYER_IDS.has(layer)) currentLayer = layer;
    if (RANGE_IDS.has(range)) currentRange = range;
    currentCategory = params.get('category') || 'all';
    currentApp = params.get('app') || '';
}

function updateRouteState() {
    if (!isEcosystemRoute()) return;
    const url = new URL(window.location.href);
    if (currentLayer === 'all') url.searchParams.delete('layer');
    else url.searchParams.set('layer', currentLayer);
    if (currentRange === '1y') url.searchParams.delete('range');
    else url.searchParams.set('range', currentRange);
    if (currentCategory === 'all') url.searchParams.delete('category');
    else url.searchParams.set('category', currentCategory);
    if (currentApp) url.searchParams.set('app', currentApp);
    else url.searchParams.delete('app');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

function selectAndRender({ scrollDetail = false, focusDetail = false, focusApp = '' } = {}) {
    updateRouteState();
    renderBody(lastSnapshot);
    if (scrollDetail || focusDetail || focusApp) {
        requestAnimationFrame(() => {
            const body = document.getElementById('ecosystem-chamber-body');
            const target = document.getElementById('ecosystem-history-detail');
            if (focusDetail) {
                document.getElementById('ecosystem-detail-title')?.focus({ preventScroll: true });
            } else if (focusApp) {
                [...document.querySelectorAll('#ecosystem-activity-modal [data-ecosystem-app]')]
                    .find((candidate) => candidate.dataset.ecosystemApp === focusApp)
                    ?.focus({ preventScroll: true });
            }
            if (scrollDetail && body && target) {
                body.scrollTo({ top: Math.max(0, target.offsetTop - 12), behavior: 'smooth' });
            }
        });
    }
}

function bindBodyEvents(body) {
    if (!body || body.dataset.ecosystemEventsWired === '1') return;
    body.dataset.ecosystemEventsWired = '1';
    body.addEventListener('click', (event) => {
        const layer = event.target.closest('[data-ecosystem-layer]')?.dataset.ecosystemLayer;
        if (LAYER_IDS.has(layer)) {
            currentLayer = layer;
            if (currentApp && !lastSnapshot?.apps.find((app) => app.id === currentApp)?.layers.some((item) => item.id === layer) && layer !== 'all') currentApp = '';
            selectAndRender();
            document.getElementById(`ecosystem-tab-${currentLayer}`)?.focus({ preventScroll: true });
            return;
        }
        const range = event.target.closest('[data-ecosystem-range]')?.dataset.ecosystemRange;
        if (RANGE_IDS.has(range)) {
            currentRange = range;
            selectAndRender();
            return;
        }
        const category = event.target.closest('[data-ecosystem-category]')?.dataset.ecosystemCategory;
        if (category) {
            currentCategory = category;
            if (currentApp && lastSnapshot?.apps.find((app) => app.id === currentApp)?.category !== category && category !== 'all') currentApp = '';
            selectAndRender();
            return;
        }
        const appId = event.target.closest('[data-ecosystem-app]')?.dataset.ecosystemApp;
        if (appId && lastSnapshot?.apps.some((app) => app.id === appId)) {
            currentApp = appId;
            selectAndRender({ scrollDetail: true, focusDetail: true });
            return;
        }
        if (event.target.closest('[data-ecosystem-clear-app]')) {
            const previousApp = currentApp;
            currentApp = '';
            selectAndRender({ focusApp: previousApp });
            return;
        }
        if (event.target.closest('[data-ecosystem-retry]')) refreshEcosystemChamber({ quiet: false });
    });
    body.addEventListener('keydown', (event) => {
        const tab = event.target.closest('[role="tab"][data-ecosystem-layer]');
        if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const index = LAYERS.findIndex(({ id }) => id === tab.dataset.ecosystemLayer);
        let next = index;
        if (event.key === 'ArrowLeft') next = (index - 1 + LAYERS.length) % LAYERS.length;
        if (event.key === 'ArrowRight') next = (index + 1) % LAYERS.length;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = LAYERS.length - 1;
        currentLayer = LAYERS[next].id;
        selectAndRender();
        document.getElementById(`ecosystem-tab-${currentLayer}`)?.focus({ preventScroll: true });
    });
}

function ensureOverlay() {
    let overlay = document.getElementById('ecosystem-activity-modal');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'ecosystem-activity-modal';
    overlay.className = 'modal-overlay chamber-overlay ecosystem-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
        <div class="modal-content modal-large chamber-content ecosystem-content" role="dialog" aria-modal="true" aria-labelledby="ecosystem-title">
            <button class="modal-close chamber-close" type="button" aria-label="Close Ecosystem Activity">&times;</button>
            <div class="ecosystem-body" id="ecosystem-chamber-body"></div>
        </div>
    `;
    overlay.querySelector('.chamber-close').addEventListener('click', closeEcosystemChamber);
    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) closeEcosystemChamber();
    });
    bindBodyEvents(overlay.querySelector('.ecosystem-body'));
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
    const override = numeric(window.__ECOSYSTEM_CHAMBER_REFRESH_MS__);
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
        refreshEcosystemChamber({ quiet: true });
    }, refreshInterval());
}

function bindVisibilityRefresh() {
    if (visibilityReady) return;
    visibilityReady = true;
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;
        if (entryRefreshDeferred) {
            entryRefreshDeferred = false;
            refreshEcosystemEntry({ quiet: true });
        }
        const overlayOpen = document.getElementById('ecosystem-activity-modal')?.classList.contains('active');
        if (!refreshDeferred && !overlayOpen) return;
        refreshDeferred = false;
        refreshEcosystemChamber({ quiet: true });
    });
}

async function refreshEcosystemEntry({ quiet = true } = {}) {
    if (document.visibilityState !== 'visible') {
        entryRefreshDeferred = true;
        return lastSnapshot || lastEntrySummary;
    }
    try {
        const summary = await fetchEntrySummary();
        if (document.visibilityState !== 'visible') {
            entryRefreshDeferred = true;
            return lastSnapshot || lastEntrySummary;
        }
        lastEntrySummary = summary;
        entryRefreshDeferred = false;
        if (!lastSnapshot) updateEntry(summary, { quiet });
        return lastSnapshot || summary;
    } catch (error) {
        if (document.visibilityState !== 'visible') {
            entryRefreshDeferred = true;
            return lastSnapshot || lastEntrySummary;
        }
        console.warn('Ecosystem Activity launcher projection refresh failed; retaining the last good launcher:', error);
        entryRefreshDeferred = true;
        const retained = lastEntrySummary || lastSnapshot;
        if (!retained) markEcosystemEntryUnavailable(error);
        return retained;
    }
}

function markEcosystemEntryUnavailable(error) {
    const card = document.getElementById('ecosystem-entry-card');
    if (!card) return;
    const value = card.querySelector('.ecosystem-entry-value');
    if (value) {
        value.textContent = 'Unavailable';
        value.setAttribute('role', 'status');
        value.setAttribute('aria-live', 'polite');
    }
    const kpis = card.querySelector('.ecosystem-entry-kpis');
    if (kpis) kpis.innerHTML = '<div class="ecosystem-entry-tile ecosystem-entry-summary"><small>Generated ledger</small><strong class="ecosystem-entry-value">Unavailable</strong><em>No verified launcher receipt</em></div>';
    const history = card.querySelector('.ecosystem-entry-empty');
    if (history) history.textContent = 'Open the Chamber to retry the weekly ledger.';
    card.classList.add('chamber-data-stale');
    card.dataset.updatedLabel = 'Unavailable · refresh failed · no last-good receipt';
    card.title = error?.message || 'Ecosystem launcher receipt unavailable';
    window.syncChamberEntryFooters?.(card);
}

async function refreshEcosystemChamber({ quiet = true } = {}) {
    if (document.visibilityState !== 'visible') {
        refreshDeferred = true;
        return lastSnapshot;
    }
    try {
        const hadRefreshError = Boolean(lastRefreshError);
        const { snapshot, changed } = await resolveEcosystemSnapshotRefresh();
        if (document.visibilityState !== 'visible') {
            refreshDeferred = true;
            return lastSnapshot;
        }
        lastSnapshot = snapshot;
        lastRefreshError = '';
        refreshDeferred = false;
        if (changed || hadRefreshError) updateEntry(snapshot, { quiet });
        else syncEcosystemFreshness(snapshot);
        if ((changed || hadRefreshError) && document.getElementById('ecosystem-activity-modal')?.classList.contains('active')) {
            renderBody(snapshot, { quiet });
        }
        return snapshot;
    } catch (error) {
        if (document.visibilityState !== 'visible') {
            refreshDeferred = true;
            return lastSnapshot;
        }
        console.warn('Ecosystem Activity snapshot refresh failed:', error);
        lastRefreshError = error?.message || String(error);
        markRefreshFailure();
        const body = document.getElementById('ecosystem-chamber-body');
        if (!lastSnapshot && body && document.getElementById('ecosystem-activity-modal')?.classList.contains('active')) renderError(body, error);
        return lastSnapshot;
    }
}

function ensureEntryCard() {
    const existing = document.getElementById('ecosystem-entry-card');
    if (existing) return existing;
    const grid = document.getElementById('chambers-grid');
    if (!grid) return null;
    const card = document.createElement('article');
    card.id = 'ecosystem-entry-card';
    card.className = 'stat-card chamber-entry-card chamber-entry-wide chamber-entry-live ecosystem-entry-card';
    card.dataset.chamberEntrySize = 'wide';
    card.innerHTML = `
        <button class="card-copy-link" type="button" data-copy-hash="#ecosystem" aria-label="Copy Ecosystem Activity direct link" title="Copy Ecosystem Activity link">&#128279;</button>
        <div class="card-inner">
            <div class="card-front chamber-entry-front ecosystem-entry-front" id="ecosystem-entry-front">
                <div class="ecosystem-entry-heading"><div class="ecosystem-entry-title-line"><h2 class="stat-label" id="ecosystem-entry-title">Ecosystem Activity</h2><span>Weekly</span></div><p>Loading the completed-week app ranking</p></div>
                <div class="ecosystem-entry-kpis ecosystem-entry-grid"><div class="ecosystem-entry-tile ecosystem-entry-summary"><small>Generated ledger</small><strong class="ecosystem-entry-value">Loading</strong><em>first-party JSON</em></div></div>
            </div>
        </div>
    `;
    grid.appendChild(card);
    return card;
}

function wireEntry(card) {
    if (!card) return;
    wireChamberLauncher(card, {
        open: openEcosystemChamber,
        label: 'Open Ecosystem Activity',
        titleSelector: '#ecosystem-entry-title, .stat-label'
    });
}

export async function openEcosystemChamber() {
    await ensureEcosystemCss();
    readRouteState();
    const overlay = ensureOverlay();
    const body = overlay.querySelector('.ecosystem-body');
    overlay.classList.add('active');
    lockPageScroll();
    if (lastSnapshot) renderBody(lastSnapshot);
    else renderLoading(body);
    body.scrollTop = 0;
    activateChamberDialog(overlay, {
        close: closeEcosystemChamber,
        dialogSelector: '.ecosystem-content',
        titleId: 'ecosystem-title',
        label: 'Ecosystem Activity',
        initialFocusSelector: '.chamber-close'
    });
    await refreshEcosystemChamber({ quiet: false });
    if (overlay.classList.contains('active')) startRefreshTimer();
}

export function closeEcosystemChamber() {
    stopRefreshTimer();
    const overlay = document.getElementById('ecosystem-activity-modal');
    overlay?.classList.remove('active');
    deactivateChamberDialog(overlay);
    unlockPageScroll();
}

export function initEcosystemChamber() {
    ensureEcosystemCss().catch((error) => console.warn('Ecosystem Activity styles unavailable', error));
    bindVisibilityRefresh();
    const card = ensureEntryCard();
    wireEntry(card);
    if (lastSnapshot) updateEntry(lastSnapshot);
    else if (lastEntrySummary) updateEntry(lastEntrySummary);
    else if (document.visibilityState === 'visible') refreshEcosystemEntry({ quiet: false });
    else entryRefreshDeferred = true;
}
