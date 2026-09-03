import { requestChamberClose } from '../ui/chamber-accessibility.js';
/**
 * Staking Chamber
 * A compact launcher and complete applied stake/unstake tape above 10,000 tez.
 */

import { API_URLS } from '../core/config.js';
import { versionedAsset } from '../core/asset-version.js';
import { fetchHistoricalData, fetchIssuance, fetchStakingAPY, fetchStakingRatio } from '../core/api.js';
import { siteMapRoute } from '../core/site-map.js';
import { siteMapJourneyLinks } from '../core/site-journey.js';
import { STAKING_GUIDE_COPY } from '../core/staking-guide-content.mjs';
import { loadStats, loadStatsTimestamp } from '../core/storage.js';
import { escapeHtml, formatFreshnessStamp, matchesTextQuery, pluralize, setDataFreshnessState } from '../core/utils.js';
import { activateChamberDialog, deactivateChamberDialog, wireChamberLauncher } from '../ui/chamber-accessibility.js';
import { ensureChamberStylesheet } from '../ui/chamber-styles.js';
import { openCardHistoryModal } from '../ui/history-intent.js';

const STAKING_CSS_URL = versionedAsset('/css/staking-chamber.min.css');
const LARGE_MOVE_THRESHOLD_XTZ = 10_000;
const LARGE_MOVE_THRESHOLD_MUTEZ = LARGE_MOVE_THRESHOLD_XTZ * 1e6;
const ENTRY_SCAN_LIMIT = 1_000;
const ARCHIVE_SCAN_LIMIT = 10_000;
const TABLE_PAGE_SIZE = 50;
const ENTRY_REFRESH_MS = 2 * 60 * 1000;
const ARCHIVE_CACHE_MS = 5 * 60 * 1000;
const ARCHIVE_STORAGE_KEY = 'tezos-systems-staking-large-moves-v2';
const ENTRY_STALE_MS = 10 * 60 * 1000;
const STAKING_HOT_SIGNAL_TTL_MS = 24 * 60 * 60 * 1000;

let entryPromise = null;
let entryData = null;
let entryCheckedAt = 0;
let entryTimer = null;
let entryStatsBound = false;
let archivePromise = null;
let archiveRows = null;
let archiveCheckedAt = 0;
let archiveProgress = null;
let archiveViewCount = TABLE_PAGE_SIZE;
let archiveAction = 'all';
let archiveSort = 'newest';
let archiveQuery = '';
let archiveTableRequest = 0;
let archiveCacheLoaded = false;
let archiveBoundaries = { stake: 0, unstake: 0 };
let overviewData = null;
let savedBodyOverflow = null;
let savedHtmlOverflow = null;
let moverTrail = null;
let moverTrailRequest = 0;
let moverTrailReturnFocus = null;
let guideOpen = false;
const richRowCache = new Map();
const moverTrailCache = new Map();

function ensureStakingStyles() {
    return ensureChamberStylesheet('staking-chamber-css', STAKING_CSS_URL);
}

function amountMutez(row) {
    const amount = Number(row?.amount);
    return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function isLargeMove(row) {
    return amountMutez(row) > LARGE_MOVE_THRESHOLD_MUTEZ;
}

function compactAddress(address) {
    const value = String(address || '');
    if (value.length <= 15) return value || 'Unknown';
    return `${value.slice(0, 7)}…${value.slice(-5)}`;
}

function accountLabel(account) {
    return account?.alias || compactAddress(account?.address);
}

function formatExactXtz(mutez, options = {}) {
    if (mutez === null || mutez === undefined || mutez === '') return '—';
    const amount = Number(mutez) / 1e6;
    if (!Number.isFinite(amount)) return '—';
    return `${amount.toLocaleString('en-US', {
        minimumFractionDigits: options.minimumFractionDigits || 0,
        maximumFractionDigits: 6
    })} ꜩ`;
}

function formatCompactXtz(mutez) {
    if (mutez === null || mutez === undefined || mutez === '') return '—';
    const amount = Number(mutez) / 1e6;
    if (!Number.isFinite(amount)) return '—';
    const absolute = Math.abs(amount);
    if (absolute >= 1e9) return `${(amount / 1e9).toFixed(absolute >= 1e10 ? 1 : 2)}B ꜩ`;
    if (absolute >= 1e6) return `${(amount / 1e6).toFixed(absolute >= 1e7 ? 1 : 2)}M ꜩ`;
    if (absolute >= 1e3) return `${(amount / 1e3).toFixed(absolute >= 1e5 ? 0 : 1)}K ꜩ`;
    return formatExactXtz(mutez);
}

function formatSignedXtz(mutez) {
    const value = Number(mutez) || 0;
    return `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatCompactXtz(Math.abs(value))}`;
}

function formatCount(value) {
    if (value === null || value === undefined || value === '') return '—';
    return Number(value || 0).toLocaleString('en-US');
}

function formatRatio(value, digits = 2) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? `${number.toFixed(digits)}%` : '—';
}

function formatRatioDelta(value) {
    if (value === null || value === undefined || value === '') return '—';
    const number = Number(value);
    if (!Number.isFinite(number)) return '—';
    return `${number > 0 ? '+' : ''}${number.toFixed(2)}pp`;
}

function formatRate(value, digits = 1) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? `~${number.toFixed(digits)}%` : 'Unavailable';
}

function guideViewRequested() {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('view') === 'guide';
}

function updateGuideRoute(open) {
    if (typeof window === 'undefined' || !/^\/stake\/?$/.test(window.location.pathname)) return;
    const url = new URL(window.location.href);
    if (open) url.searchParams.set('view', 'guide');
    else url.searchParams.delete('view');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

function guideFreshness(overview) {
    const quality = overview?.stakingAPYQuality || {};
    const status = quality.status || 'unavailable';
    const observedAt = quality.observedAt || quality.checkedAt || null;
    if (status === 'live') return { status, label: `live inputs · ${formatAge(observedAt)}` };
    if (status === 'stale') return { status, label: `last good inputs · ${formatAge(observedAt)}` };
    return { status: 'unavailable', label: 'rate inputs unavailable' };
}

function guideIssuanceDetail(overview) {
    const protocol = Number(overview?.protocolIssuanceRate);
    const lb = Number(overview?.lbIssuanceRate);
    if (!Number.isFinite(protocol) || protocol <= 0) return 'Protocol and LB inputs unavailable';
    if (overview?.lbSubsidyDisabled === true) return `${protocol.toFixed(2)}% protocol · 0.00% LB (disabled)`;
    if (Number.isFinite(lb) && lb >= 0) return `${protocol.toFixed(2)}% protocol · ${lb.toFixed(2)}% LB`;
    return `${protocol.toFixed(2)}% protocol · LB state unavailable`;
}

function renderStakingGuide(overview = null) {
    const copy = STAKING_GUIDE_COPY;
    const freshness = guideFreshness(overview);
    const totalDelegated = overview?.totalDelegated === null || overview?.totalDelegated === undefined
        ? 'Unavailable'
        : formatCompactXtz(Number(overview.totalDelegated) * 1e6);
    const totalIssuance = Number(overview?.currentIssuanceRate);
    return `
        <details class="staking-guide-panel chamber-anim-fade" id="staking-guide"${guideOpen ? ' open' : ''}>
            <summary>
                <span class="staking-guide-summary-copy">
                    <span>${escapeHtml(copy.kicker)}</span>
                    <strong>${escapeHtml(copy.title)}</strong>
                    <small>Role differences, live rate context, risks, and a careful start path</small>
                </span>
                <span class="staking-guide-summary-action" data-staking-guide-action>${guideOpen ? 'Close guide' : 'Open guide'}</span>
            </summary>
            <div class="staking-guide-body">
                <p class="staking-guide-intro">${escapeHtml(copy.intro)}</p>

                <section class="staking-guide-role-grid" aria-label="Tezos staking roles">
                    ${copy.roles.map((role) => `
                        <article data-staking-role="${escapeHtml(role.id)}">
                            <span>${escapeHtml(role.label)}</span>
                            <strong>${escapeHtml(role.summary)}</strong>
                            <p>${escapeHtml(role.detail)}</p>
                        </article>
                    `).join('')}
                </section>

                <section class="staking-guide-economics" aria-labelledby="staking-guide-economics-title">
                    <div class="staking-guide-section-head">
                        <div><span>Live network context</span><h2 id="staking-guide-economics-title">Rates and participation</h2></div>
                        <span class="staking-guide-freshness" data-quality="${escapeHtml(freshness.status)}">${escapeHtml(freshness.label)}</span>
                    </div>
                    <div class="staking-guide-metric-grid">
                        <div><span>Direct-staking gross rate</span><strong>${escapeHtml(formatRate(overview?.stakeAPY))}</strong><small>Before the selected baker's edge</small></div>
                        <div><span>Delegation gross context</span><strong>${escapeHtml(formatRate(overview?.delegateAPY))}</strong><small>Before the baker's off-chain policy</small></div>
                        <div><span>Issuance rate</span><strong>${escapeHtml(Number.isFinite(totalIssuance) && totalIssuance > 0 ? `${totalIssuance.toFixed(2)}%` : 'Unavailable')}</strong><small>${escapeHtml(guideIssuanceDetail(overview))}</small></div>
                        <div><span>Total delegated</span><strong>${escapeHtml(totalDelegated)}</strong><small>Liquid delegation, separate from frozen stake</small></div>
                    </div>
                    <p class="staking-guide-rate-note">${escapeHtml(copy.apyNote)}</p>
                </section>

                <section class="staking-guide-comparison" aria-labelledby="staking-guide-comparison-title">
                    <div class="staking-guide-section-head"><div><span>Role comparison</span><h2 id="staking-guide-comparison-title">Delegation vs direct staking</h2></div></div>
                    <div class="staking-guide-table-wrap">
                        <table>
                            <thead><tr><th scope="col">Question</th><th scope="col">Delegation</th><th scope="col">Direct staking</th></tr></thead>
                            <tbody>${copy.comparisonRows.map((row) => `<tr><th scope="row">${escapeHtml(row.label)}</th><td>${escapeHtml(row.delegation)}</td><td>${escapeHtml(row.staking)}</td></tr>`).join('')}</tbody>
                        </table>
                    </div>
                    <p class="staking-guide-edge-note">${escapeHtml(copy.edgeNote)}</p>
                </section>

                <div class="staking-guide-lower-grid">
                    <section aria-labelledby="staking-guide-start-title">
                        <div class="staking-guide-section-head"><div><span>Start carefully</span><h2 id="staking-guide-start-title">How to begin</h2></div></div>
                        <ol>${copy.steps.map((step) => `<li><strong>${escapeHtml(step.label)}</strong><span>${escapeHtml(step.detail)}</span></li>`).join('')}</ol>
                    </section>
                    <section aria-labelledby="staking-guide-context-title">
                        <div class="staking-guide-section-head"><div><span>Tezos context</span><h2 id="staking-guide-context-title">What remains true</h2></div></div>
                        <ul>${copy.context.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
                    </section>
                </div>

                <section class="staking-guide-faq" aria-labelledby="staking-guide-faq-title">
                    <div class="staking-guide-section-head"><div><span>Common questions</span><h2 id="staking-guide-faq-title">Staking FAQ</h2></div></div>
                    <div>${copy.faq.map((item) => `<details><summary>${escapeHtml(item.question)}</summary><p>${escapeHtml(item.answer)}</p></details>`).join('')}</div>
                </section>

                <nav class="staking-guide-actions" aria-label="Staking next steps">
                    <a href="/#calculator">Calculate reward scenarios</a>
                    <a href="/leaderboard/">Browse the Baker Directory</a>
                    <a href="https://stake.tezos.com" target="_blank" rel="noopener">Open the official staking app ↗</a>
                    <a href="https://docs.tez.capital" target="_blank" rel="noopener">Run a baker with Tez Capital docs ↗</a>
                </nav>
            </div>
        </details>
    `;
}

function wireGuideDisclosure() {
    const guide = document.getElementById('staking-guide');
    if (!guide || guide.dataset.stakingGuideWired) return;
    guide.dataset.stakingGuideWired = '1';
    guide.addEventListener('toggle', () => {
        guideOpen = guide.open;
        const action = guide.querySelector('[data-staking-guide-action]');
        if (action) action.textContent = guideOpen ? 'Close guide' : 'Open guide';
        updateGuideRoute(guideOpen);
    });
}

function formatAge(timestamp) {
    const time = new Date(timestamp).getTime();
    const diff = Date.now() - time;
    if (!Number.isFinite(diff) || diff < 0) return 'just now';
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    if (months < 24) return `${months}mo ago`;
    return `${Math.floor(days / 365)}y ago`;
}

function formatDateTime(timestamp) {
    if (!timestamp) return 'no qualifying receipt';
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return 'time unavailable';
    return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: date.getUTCFullYear() === new Date().getUTCFullYear() ? undefined : 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC',
        timeZoneName: 'short'
    });
}

function safeHotId(value, fallback = 'move') {
    return String(value || fallback).replace(/[^a-z0-9-]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase() || fallback;
}

function dispatchLargeMoveHotSignal(row) {
    if (typeof window === 'undefined' || typeof window.CustomEvent !== 'function' || !isLargeMove(row)) return;
    const occurredAt = new Date(row?.timestamp || '').getTime();
    const age = Date.now() - occurredAt;
    if (!Number.isFinite(age) || age < 0 || age >= STAKING_HOT_SIGNAL_TTL_MS) return;
    const amountXtz = amountMutez(row) / 1e6;
    const action = row?.action === 'unstake' ? 'unstake' : 'stake';
    const actor = accountLabel(row?.staker || row?.sender);
    const target = row?.baker ? ` with ${accountLabel(row.baker)}` : '';
    window.dispatchEvent(new CustomEvent('hot-signal', {
        detail: {
            id: `staking-${action}-${safeHotId(row?.hash || row?.id)}`,
            category: 'staking',
            kind: 'event',
            visual: 'staking',
            spectacle: amountXtz >= 1_000_000 ? 'peacock' : amountXtz >= 250_000 ? 'headliner' : 'curious',
            score: amountXtz >= 1_000_000 ? 128 : amountXtz >= 250_000 ? 114 : 98,
            title: action === 'unstake' ? 'Large unstake' : 'Large stake',
            icon: action === 'unstake' ? '↘' : '↗',
            text: `${actor} ${action === 'unstake' ? 'unstaked' : 'staked'} ${formatCompactXtz(row.amount)}${target}.`,
            detail: `Applied ${action} · block ${formatCount(row?.level)}`,
            route: '/stake/',
            createdAt: occurredAt,
            ttlMs: STAKING_HOT_SIGNAL_TTL_MS
        }
    }));
}

function normalizeRichRow(row, fallbackAction = '') {
    const staker = row?.staker || row?.sender || null;
    return {
        id: Number(row?.id) || 0,
        level: Number(row?.level) || 0,
        timestamp: row?.timestamp || null,
        hash: row?.hash || '',
        action: row?.action || fallbackAction,
        amount: amountMutez(row),
        staker,
        baker: row?.baker || null,
        status: row?.status || 'applied'
    };
}

function normalizeCompactRow(row, action) {
    return {
        id: Number(row?.id) || 0,
        timestamp: row?.timestamp || null,
        amount: amountMutez(row),
        action
    };
}

async function fetchStakingPage({ action, limit, cursor = null, afterId = 0, rich = false, staker = '' }) {
    const params = new URLSearchParams();
    params.set('action', action);
    params.set('status', 'applied');
    params.set('sort.desc', 'id');
    params.set('limit', String(limit));
    if (cursor) params.set('offset.cr', String(cursor));
    if (afterId) params.set('id.gt', String(afterId));
    if (staker) params.set('staker', staker);
    params.set('select', rich
        ? 'id,level,timestamp,hash,staker,sender,baker,action,amount,status'
        : 'id,timestamp,amount');
    const response = await fetch(`${API_URLS.tzkt}/operations/staking?${params}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`TzKT staking HTTP ${response.status}`);
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error('TzKT staking response was not an array');
    return rows;
}

async function scanLatestLargeMove(action) {
    let cursor = null;
    while (true) {
        const rows = await fetchStakingPage({ action, limit: ENTRY_SCAN_LIMIT, cursor });
        const match = rows.find(isLargeMove);
        if (match) {
            const [hydrated] = await hydrateRows([normalizeCompactRow(match, action)]);
            return normalizeRichRow(hydrated, action);
        }
        if (rows.length < ENTRY_SCAN_LIMIT) return null;
        const next = Number(rows.at(-1)?.id) || 0;
        if (!next || next === cursor) return null;
        cursor = next;
    }
}

async function fetchLatestLargeMoves({ force = false } = {}) {
    if (!force && entryData && Date.now() - entryCheckedAt < ENTRY_REFRESH_MS) return entryData;
    if (entryPromise) return entryPromise;
    entryPromise = Promise.all([
        scanLatestLargeMove('stake'),
        scanLatestLargeMove('unstake')
    ]).then(([stake, unstake]) => {
        entryData = { stake, unstake };
        entryCheckedAt = Date.now();
        [stake, unstake].filter(Boolean).forEach((row) => richRowCache.set(row.id, row));
        [stake, unstake].filter(Boolean).forEach(dispatchLargeMoveHotSignal);
        return entryData;
    }).finally(() => {
        entryPromise = null;
    });
    return entryPromise;
}

function emitArchiveProgress(progress) {
    archiveProgress = progress;
    const status = document.getElementById('staking-archive-progress');
    if (!status) return;
    const mode = progress.incremental ? 'Checking new' : 'Scanning';
    status.textContent = `${mode} ${formatCount(progress.scanned)} applied ${pluralize(progress.scanned, 'operation')} · ${formatCount(progress.matches)} moves over 10K found`;
}

async function scanActionArchive(action, sharedProgress, afterId = 0) {
    const rows = [];
    let cursor = null;
    let newestId = afterId;
    while (true) {
        const page = await fetchStakingPage({ action, limit: ARCHIVE_SCAN_LIMIT, cursor, afterId });
        const normalized = page.map((row) => normalizeCompactRow(row, action));
        rows.push(...normalized.filter(isLargeMove));
        newestId = Math.max(newestId, ...normalized.map((row) => row.id));
        sharedProgress.scanned += normalized.length;
        sharedProgress.matches += normalized.filter(isLargeMove).length;
        emitArchiveProgress(sharedProgress);
        if (page.length < ARCHIVE_SCAN_LIMIT) break;
        const next = Number(page.at(-1)?.id) || 0;
        if (!next || next === cursor) throw new Error(`TzKT ${action} cursor did not advance`);
        cursor = next;
    }
    return { rows, newestId };
}

function loadStoredArchive() {
    if (archiveCacheLoaded) return;
    archiveCacheLoaded = true;
    try {
        const stored = JSON.parse(localStorage.getItem(ARCHIVE_STORAGE_KEY) || 'null');
        if (stored?.version !== 2 || !Array.isArray(stored.rows)) return;
        const rows = stored.rows
            .map((row) => normalizeRichRow(row, row?.action))
            .filter((row) => row.id && isLargeMove(row));
        rows.forEach((row) => richRowCache.set(row.id, row));
        archiveRows = rows.sort((a, b) => b.id - a.id);
        archiveCheckedAt = Number(stored.checkedAt) || 0;
        archiveBoundaries = {
            stake: Number(stored.boundaries?.stake) || 0,
            unstake: Number(stored.boundaries?.unstake) || 0
        };
    } catch {
        localStorage.removeItem(ARCHIVE_STORAGE_KEY);
    }
}

function saveStoredArchive() {
    try {
        localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify({
            version: 2,
            checkedAt: archiveCheckedAt,
            boundaries: archiveBoundaries,
            rows: archiveRows || []
        }));
    } catch {
        // The in-memory archive remains usable when storage is unavailable.
    }
}

async function fetchLargeMoveArchive({ force = false } = {}) {
    loadStoredArchive();
    if (!force && archiveRows && Date.now() - archiveCheckedAt < ARCHIVE_CACHE_MS) return archiveRows;
    if (archivePromise) return archivePromise;
    const hasStoredArchive = Array.isArray(archiveRows) && (archiveBoundaries.stake > 0 || archiveBoundaries.unstake > 0);
    const progress = { scanned: 0, matches: 0, incremental: hasStoredArchive };
    emitArchiveProgress(progress);
    archivePromise = Promise.all([
        scanActionArchive('stake', progress, hasStoredArchive ? archiveBoundaries.stake : 0),
        scanActionArchive('unstake', progress, hasStoredArchive ? archiveBoundaries.unstake : 0)
    ]).then(async ([stakes, unstakes]) => {
        const additions = await hydrateRows([...stakes.rows, ...unstakes.rows]);
        const unique = new Map();
        [...(archiveRows || []), ...additions].forEach((row) => {
            const normalized = normalizeRichRow(row, row.action);
            if (normalized.id && !unique.has(normalized.id)) unique.set(normalized.id, normalized);
        });
        archiveRows = [...unique.values()].sort((a, b) => b.id - a.id);
        archiveCheckedAt = Date.now();
        archiveBoundaries = {
            stake: Math.max(archiveBoundaries.stake, stakes.newestId),
            unstake: Math.max(archiveBoundaries.unstake, unstakes.newestId)
        };
        archiveProgress = { ...progress, complete: true };
        archiveRows.forEach((row) => richRowCache.set(row.id, row));
        saveStoredArchive();
        return archiveRows;
    }).finally(() => {
        archivePromise = null;
    });
    return archivePromise;
}

async function hydrateRows(rows) {
    const missing = rows.filter((row) => row?.id && !richRowCache.has(row.id));
    for (let offset = 0; offset < missing.length; offset += TABLE_PAGE_SIZE) {
        const ids = missing.slice(offset, offset + TABLE_PAGE_SIZE).map((row) => row.id);
        if (!ids.length) continue;
        const params = new URLSearchParams();
        params.set('id.in', ids.join(','));
        params.set('select', 'id,level,timestamp,hash,staker,sender,baker,action,amount,status');
        const response = await fetch(`${API_URLS.tzkt}/operations/staking?${params}`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`TzKT staking receipts HTTP ${response.status}`);
        const payload = await response.json();
        if (!Array.isArray(payload)) throw new Error('TzKT staking receipts response was not an array');
        payload.forEach((row) => {
            const normalized = normalizeRichRow(row);
            if (normalized.id) richRowCache.set(normalized.id, normalized);
        });
    }
    const unresolved = rows.filter((row) => row?.id && !richRowCache.has(row.id));
    if (unresolved.length) {
        throw new Error(`TzKT omitted ${unresolved.length} requested staking receipt${unresolved.length === 1 ? '' : 's'}`);
    }
    return rows.map((row) => richRowCache.get(row.id) || row);
}

function sevenDayRatioDelta(rows, currentRatio) {
    const points = (Array.isArray(rows) ? rows : [])
        .map((row) => ({ time: new Date(row?.timestamp).getTime(), value: Number(row?.staking_ratio) }))
        .filter((point) => Number.isFinite(point.time) && Number.isFinite(point.value) && point.value > 0)
        .sort((a, b) => a.time - b.time);
    if (!points.length || !Number.isFinite(Number(currentRatio)) || Number(currentRatio) <= 0) return null;
    return Number(currentRatio) - points[0].value;
}

async function fetchOverview() {
    const cached = loadStats() || {};
    const [live, history, apy, issuance] = await Promise.all([
        fetchStakingRatio(),
        fetchHistoricalData('7d'),
        fetchStakingAPY(),
        fetchIssuance()
    ]);
    const stakingRatio = Number(live?.stakingRatio) > 0
        ? Number(live.stakingRatio)
        : Number(cached?.stakingRatio) > 0 ? Number(cached.stakingRatio) : null;
    const totalStaked = Number(live?.totalStaked) > 0
        ? Number(live.totalStaked)
        : Number(cached?.totalStaked) > 0 ? Number(cached.totalStaked) : null;
    const totalStakers = Number(live?.totalStakers) > 0
        ? Number(live.totalStakers)
        : Number(cached?.totalStakers) > 0 ? Number(cached.totalStakers) : null;
    return {
        ...live,
        stakingRatio,
        totalStaked,
        totalStakers,
        totalDelegated: live?.totalDelegated ?? cached?.totalDelegated ?? null,
        delegateAPY: apy?.delegateAPY ?? cached?.delegateAPY ?? null,
        stakeAPY: apy?.stakeAPY ?? cached?.stakeAPY ?? null,
        stakingAPYQuality: apy?._quality || null,
        currentIssuanceRate: issuance?.total ?? cached?.currentIssuanceRate ?? null,
        protocolIssuanceRate: issuance?.protocol ?? cached?.protocolIssuanceRate ?? null,
        lbIssuanceRate: issuance?.lb ?? cached?.lbIssuanceRate ?? null,
        lbSubsidyDisabled: issuance?.lbDisabled ?? cached?.lbSubsidyDisabled ?? null,
        issuanceQuality: issuance?._quality || null,
        ratioDelta7d: sevenDayRatioDelta(history, stakingRatio),
        statsTimestamp: loadStatsTimestamp() || Date.now()
    };
}

function updateEntryRatio(stats) {
    const ratio = Number(stats?.stakingRatio);
    const value = document.getElementById('staking-entry-ratio');
    if (value && Number.isFinite(ratio) && ratio > 0) value.textContent = formatRatio(ratio);
}

function renderEntryMove(action, row) {
    if (!row) {
        return `
            <div class="staking-entry-move is-empty" data-staking-action="${action}">
                <span class="staking-entry-action">${action}</span>
                <strong>No qualifying move</strong>
                <small>Complete scan found no ${action} over 10K ꜩ</small>
            </div>
        `;
    }
    const actor = row.staker;
    const baker = row.baker;
    const actorName = accountLabel(actor);
    const bakerName = accountLabel(baker);
    const detail = actor?.address === baker?.address
        ? `${actorName} · own stake`
        : `${actorName} → ${bakerName}`;
    return `
        <button class="staking-entry-move" type="button" data-staking-action="${escapeHtml(action)}" data-staking-amount="${row.amount}" aria-label="Open ${escapeHtml(action)} by ${escapeHtml(actorName)} for ${escapeHtml(formatExactXtz(row.amount))}">
            <span class="staking-entry-action">${escapeHtml(action)}</span>
            <strong title="${escapeHtml(formatExactXtz(row.amount))}">${escapeHtml(formatCompactXtz(row.amount))}</strong>
            <small title="${escapeHtml(actor?.address || '')}">${escapeHtml(detail)} · ${escapeHtml(formatAge(row.timestamp))}</small>
        </button>
    `;
}

function renderEntryData(card, data) {
    const tape = card.querySelector('#staking-entry-tape');
    if (tape) tape.innerHTML = `${renderEntryMove('stake', data?.stake)}${renderEntryMove('unstake', data?.unstake)}`;
    card.dataset.updatedLabel = formatFreshnessStamp(entryCheckedAt, { source: 'TzKT' });
    card.setAttribute('aria-busy', 'false');
    setDataFreshnessState(card, entryCheckedAt, ENTRY_STALE_MS);
    window.syncChamberEntryFooters?.(document.getElementById('chambers-grid'));
}

function renderEntryError(card) {
    if (entryData) {
        renderEntryData(card, entryData);
        card.dataset.updatedLabel = `delayed · ${formatFreshnessStamp(entryCheckedAt, { source: 'TzKT' })}`;
        card.classList.add('chamber-data-stale');
        window.syncChamberEntryFooters?.(document.getElementById('chambers-grid'));
        return;
    }
    const tape = card.querySelector('#staking-entry-tape');
    if (tape) tape.innerHTML = '<div class="staking-entry-state">Large-move tape is temporarily unavailable.</div>';
    card.dataset.updatedLabel = 'TzKT delayed · tap to retry';
    card.setAttribute('aria-busy', 'false');
    card.classList.add('chamber-data-stale');
    window.syncChamberEntryFooters?.(document.getElementById('chambers-grid'));
}

async function refreshEntryCard({ force = false } = {}) {
    const card = document.getElementById('staking-entry-card');
    if (!card) return;
    card.setAttribute('aria-busy', 'true');
    try {
        renderEntryData(card, await fetchLatestLargeMoves({ force }));
    } catch (error) {
        console.warn('Staking Chamber entry refresh failed', error);
        renderEntryError(card);
    }
}

function ensureEntryCard() {
    const grid = document.getElementById('chambers-grid');
    if (!grid) return null;
    let card = document.getElementById('staking-entry-card');
    if (!card) {
        card = document.createElement('div');
        card.id = 'staking-entry-card';
        card.className = 'stat-card chamber-entry-card staking-entry-card chamber-entry-live';
        card.setAttribute('aria-busy', 'true');
        card.dataset.updatedLabel = 'Opening TzKT tape';
        card.innerHTML = `
            <button class="card-copy-link" type="button" data-copy-hash="#staking" aria-label="Copy Staking Chamber direct link" title="Copy Staking Chamber link">🔗</button>
            <div class="card-inner">
                <div class="card-front staking-entry-front">
                    <div class="staking-entry-head">
                        <div>
                            <h2 class="stat-label">Staking Chamber</h2>
                            <span class="staking-entry-threshold">&gt;10K ꜩ</span>
                        </div>
                        <div class="staking-entry-ratio"><span>Network staked</span><strong id="staking-entry-ratio">—</strong></div>
                    </div>
                    <div class="staking-entry-tape" id="staking-entry-tape">
                        <div class="staking-entry-skeleton"></div>
                        <div class="staking-entry-skeleton"></div>
                    </div>
                </div>
                <div class="card-back" aria-hidden="true">
                    <h2 class="stat-label">Staking Chamber</h2>
                    <div class="stat-value">&gt;10K ꜩ</div>
                    <p class="stat-description">Large explicit stake and unstake receipts.</p>
                </div>
            </div>
        `;
        grid.appendChild(card);
    }

    wireChamberLauncher(card, {
        open: openStakingChamber,
        label: 'Open Staking Chamber',
        titleSelector: '.stat-label'
    });
    card.dataset.stakingWired = '1';
    return card;
}

function bindEntryStats() {
    if (entryStatsBound) return;
    entryStatsBound = true;
    window.addEventListener('stats-updated', (event) => {
        const stats = event?.detail?.stats || event?.detail;
        if (stats && typeof stats === 'object') updateEntryRatio(stats);
        if (!entryData && !entryPromise) refreshEntryCard();
    });
}

function startEntryRefresh() {
    if (entryTimer) return;
    entryTimer = window.setInterval(() => {
        if (!document.hidden) refreshEntryCard({ force: true });
    }, ENTRY_REFRESH_MS);
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

function ensureOverlay() {
    let overlay = document.getElementById('staking-chamber-modal');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'staking-chamber-modal';
    overlay.className = 'modal-overlay chamber-overlay staking-chamber-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'staking-chamber-title');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
        <div class="modal-content modal-large chamber-content staking-chamber-content">
            <button class="modal-close chamber-close" type="button" aria-label="Close Staking Chamber">&times;</button>
            <div class="chamber-body staking-chamber-body"></div>
        </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('.chamber-close')?.addEventListener('click', closeStakingChamber);
    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) closeStakingChamber();
    });
    return overlay;
}

function renderLoadingRoom() {
    const body = document.querySelector('#staking-chamber-modal .staking-chamber-body');
    if (!body) return;
    body.setAttribute('aria-busy', 'true');
    body.innerHTML = `
        <header class="staking-chamber-header chamber-anim-fade">
            <div>
                <span class="staking-chamber-kicker">Tezos capital movement</span>
                <h1 class="chamber-title" id="staking-chamber-title">Staking Chamber</h1>
                <p>Applied explicit stake and unstake receipts, filtered client-side by their actual processed amount.</p>
            </div>
            <span class="staking-live-pill">&gt;10,000 ꜩ</span>
        </header>
        ${renderStakingGuide(overviewData)}
        <section class="staking-overview-grid" aria-label="Current staking overview">
            <div class="staking-overview-card is-primary"><span>Current staked</span><strong id="staking-loading-ratio">—</strong><small>own + external stake / supply</small></div>
            <div class="staking-overview-card"><span>History scan</span><strong>Opening</strong><small id="staking-archive-progress">Scanning applied operations</small></div>
        </section>
        <div class="staking-room-loading" role="status">
            <span></span><span></span><span></span>
            <p>Building the complete &gt;10K stake / unstake tape…</p>
        </div>
    `;
    wireGuideDisclosure();
}

function patchLoadingOverview(overview) {
    const ratio = document.getElementById('staking-loading-ratio');
    if (ratio) ratio.textContent = formatRatio(overview?.stakingRatio);
    const currentGuide = document.getElementById('staking-guide');
    if (currentGuide) {
        guideOpen = currentGuide.open;
        const template = document.createElement('template');
        template.innerHTML = renderStakingGuide(overview).trim();
        currentGuide.replaceWith(template.content.firstElementChild);
        wireGuideDisclosure();
    }
}

function archiveSummary(rows) {
    const now = Date.now();
    const cutoff24h = now - 24 * 60 * 60 * 1000;
    const last24h = rows.filter((row) => new Date(row.timestamp).getTime() >= cutoff24h);
    const stakes24h = last24h.filter((row) => row.action === 'stake');
    const unstakes24h = last24h.filter((row) => row.action === 'unstake');
    const stakeVolume24h = stakes24h.reduce((sum, row) => sum + row.amount, 0);
    const unstakeVolume24h = unstakes24h.reduce((sum, row) => sum + row.amount, 0);
    return {
        stakeCount24h: stakes24h.length,
        unstakeCount24h: unstakes24h.length,
        stakeVolume24h,
        unstakeVolume24h,
        netVolume24h: stakeVolume24h - unstakeVolume24h,
        stakeCount: rows.filter((row) => row.action === 'stake').length,
        unstakeCount: rows.filter((row) => row.action === 'unstake').length,
        oldest: rows.at(-1)?.timestamp || null
    };
}

function filteredArchiveRows() {
    const rows = Array.isArray(archiveRows) ? [...archiveRows] : [];
    const filtered = rows.filter((row) => {
        if (archiveAction !== 'all' && row.action !== archiveAction) return false;
        return matchesTextQuery(
            archiveQuery,
            row.id,
            row.hash,
            row.action,
            row.staker?.alias,
            row.staker?.address,
            row.baker?.alias,
            row.baker?.address
        );
    });
    if (archiveSort === 'oldest') filtered.sort((a, b) => a.id - b.id);
    else if (archiveSort === 'largest') filtered.sort((a, b) => b.amount - a.amount || b.id - a.id);
    else filtered.sort((a, b) => b.id - a.id);
    return filtered;
}

function csvCell(value) {
    const text = String(value ?? '');
    return `"${text.replace(/"/g, '""')}"`;
}

function exportArchiveCsv() {
    const rows = filteredArchiveRows();
    const header = [
        'operation_id',
        'level',
        'timestamp_utc',
        'action',
        'amount_xtz',
        'staker_address',
        'staker_alias',
        'baker_address',
        'baker_alias',
        'hash',
        'tzkt_url'
    ];
    const lines = rows.map((row) => [
        row.id,
        row.level,
        row.timestamp,
        row.action,
        row.amount / 1e6,
        row.staker?.address,
        row.staker?.alias,
        row.baker?.address,
        row.baker?.alias,
        row.hash,
        `https://tzkt.io/${row.hash}`
    ].map(csvCell).join(','));
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `tezos-staking-moves-over-10k-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function accountActionLinks(account, className = '') {
    const address = account?.address || '';
    const label = accountLabel(account);
    if (!address) return `<span class="staking-account-name ${className}">Unknown account</span>`;
    const encoded = encodeURIComponent(address);
    return `
        <span class="staking-account-links ${className}" title="${escapeHtml(address)}">
            <button class="staking-mover-focus" type="button" data-staking-mover="${escapeHtml(address)}" data-staking-mover-label="${escapeHtml(label)}" title="Show this mover's full staking trail">${escapeHtml(label)}</button>
            <a href="#ledger-flow=${encoded}" title="Open ${escapeHtml(label)} in Ledger Flow">Flow</a>
            <a href="https://tzkt.io/${encoded}" target="_blank" rel="noopener" title="Open ${escapeHtml(address)} on TzKT">TzKT</a>
        </span>
    `;
}

function bakerLinks(baker) {
    const address = baker?.address || '';
    const label = accountLabel(baker);
    if (!address) return '<span>Unknown baker</span>';
    const encoded = encodeURIComponent(address);
    return `
        <span class="staking-baker-links" title="${escapeHtml(address)}">
            <a href="#baker=${encoded}" title="Open baker profile">${escapeHtml(label)}</a>
            <a href="https://tzkt.io/${encoded}" target="_blank" rel="noopener">TzKT</a>
        </span>
    `;
}

function renderOperationRow(row, { moverTrailRow = false } = {}) {
    const action = row.action === 'unstake' ? 'unstake' : 'stake';
    const ownStake = row.staker?.address && row.staker.address === row.baker?.address;
    return `
        <article class="staking-operation-row${moverTrailRow ? ' is-mover-trail' : ''}" data-staking-operation="${row.id}" data-staking-action="${action}">
            <span class="staking-action-badge">${action}</span>
            <strong class="staking-operation-amount" title="${escapeHtml(formatExactXtz(row.amount))}">${escapeHtml(formatExactXtz(row.amount))}</strong>
            <div class="staking-operation-actor">
                ${accountActionLinks(row.staker)}
                <small>${ownStake ? 'Own baker stake' : `to ${escapeHtml(accountLabel(row.baker))}`}</small>
            </div>
            <div class="staking-operation-baker">${bakerLinks(row.baker)}</div>
            <div class="staking-operation-time">
                <span>${escapeHtml(formatDateTime(row.timestamp))}</span>
                <small>block ${formatCount(row.level)}</small>
            </div>
            <a class="staking-operation-receipt" href="https://tzkt.io/${encodeURIComponent(row.hash)}" target="_blank" rel="noopener" aria-label="Open staking operation receipt on TzKT">Receipt ↗</a>
        </article>
    `;
}

function renderArchiveState(message, className = '') {
    return `<div class="staking-archive-state ${className}" role="status">${escapeHtml(message)}</div>`;
}

async function updateArchiveTable({ reset = false } = {}) {
    const container = document.getElementById('staking-archive-rows');
    const count = document.getElementById('staking-archive-count');
    const more = document.getElementById('staking-load-more');
    if (!container || !archiveRows) return;
    const request = ++archiveTableRequest;
    if (reset) archiveViewCount = TABLE_PAGE_SIZE;
    const filtered = filteredArchiveRows();
    const visible = filtered.slice(0, archiveViewCount);
    container.setAttribute('aria-busy', 'true');
    container.innerHTML = renderArchiveState('Hydrating visible TzKT receipts…', 'is-loading');
    try {
        const rich = await hydrateRows(visible);
        if (request !== archiveTableRequest || !document.getElementById('staking-archive-rows')) return;
        container.innerHTML = rich.length
            ? rich.map((row) => renderOperationRow(normalizeRichRow(row, row.action))).join('')
            : renderArchiveState(`No ${archiveAction === 'all' ? '' : `${archiveAction} `}moves match this view.`);
        container.setAttribute('aria-busy', 'false');
        if (count) {
            count.textContent = `Showing ${formatCount(Math.min(visible.length, filtered.length))} of ${formatCount(filtered.length)} complete >10K ${pluralize(filtered.length, 'move')}`;
        }
        if (more) {
            more.hidden = visible.length >= filtered.length;
            more.textContent = `Load ${formatCount(Math.min(TABLE_PAGE_SIZE, filtered.length - visible.length))} older`;
            more.disabled = false;
        }
        wireInternalRoomLinks(container);
    } catch (error) {
        if (request !== archiveTableRequest) return;
        console.warn('Staking Chamber receipt hydration failed', error);
        container.setAttribute('aria-busy', 'false');
        container.innerHTML = `${renderArchiveState('Visible receipt identities are temporarily unavailable. The complete amount scan is preserved.', 'is-error')}<button class="staking-retry-inline" type="button" id="staking-retry-visible">Retry visible receipts</button>`;
        document.getElementById('staking-retry-visible')?.addEventListener('click', () => updateArchiveTable());
        if (more) more.disabled = false;
    }
}

function renderLatestMoveCard(action, row) {
    if (!row) return `<article class="staking-latest-card" data-staking-action="${action}"><span>${action}</span><strong>None found</strong><small>No applied move over 10K.</small></article>`;
    return `
        <article class="staking-latest-card" data-staking-action="${escapeHtml(action)}">
            <div><span>Latest ${escapeHtml(action)}</span><small>${escapeHtml(formatAge(row.timestamp))}</small></div>
            <strong title="${escapeHtml(formatExactXtz(row.amount))}">${escapeHtml(formatExactXtz(row.amount))}</strong>
            ${accountActionLinks(row.staker, 'staking-latest-actor')}
            <small>${row.staker?.address === row.baker?.address ? 'Own stake' : `to ${escapeHtml(accountLabel(row.baker))}`} · block ${formatCount(row.level)}</small>
        </article>
    `;
}

function renderOtherRooms() {
    return siteMapJourneyLinks('staking-chamber', { limit: 4 })
        .map((entry) => `
            <li class="site-wayfinder-item">
                <a class="site-wayfinder-link" href="${escapeHtml(siteMapRoute(entry))}" data-site-wayfinder-entry="${escapeHtml(entry.id)}" data-site-journey data-journey-from="staking-chamber" data-journey-from-entry="staking-chamber" data-journey-to="${escapeHtml(entry.id)}" data-journey-surface="native-wayfinder" data-journey-reason="${escapeHtml(entry.journeyReason || 'related-destination')}">
                    <span class="site-wayfinder-link-title">${escapeHtml(entry.title)}</span>
                    <span class="site-wayfinder-link-detail">${escapeHtml(entry.detail || entry.group || 'Open on Tezos Systems')}</span>
                </a>
            </li>
        `)
        .join('');
}

function renderNativeWayfinder() {
    return `
        <nav class="site-wayfinder chamber-anim-fade" data-site-wayfinder-native data-staking-wayfinder aria-labelledby="staking-wayfinder-label">
            <div class="site-wayfinder-head">
                <span class="site-wayfinder-label" id="staking-wayfinder-label">Next from Staking Chamber</span>
            </div>
            <ul class="site-wayfinder-links">${renderOtherRooms()}</ul>
            <div class="site-wayfinder-actions" aria-label="More Tezos Systems destinations">
                <a class="site-wayfinder-action" href="/#chambers">All Chambers</a>
                <a class="site-wayfinder-action" href="/#search">Search Tezos Systems</a>
            </div>
        </nav>
    `;
}

function renderMoverTrailPanel() {
    if (!moverTrail) return '';
    if (moverTrail.loading) {
        return `
            <section class="staking-mover-panel" id="staking-mover-panel" aria-busy="true">
                <div class="staking-panel-head"><div><span>Mover trail</span><h2>${escapeHtml(moverTrail.label)}</h2></div><button type="button" data-staking-close-mover>Close</button></div>
                ${renderArchiveState('Reading this account’s complete explicit staking trail…', 'is-loading')}
            </section>
        `;
    }
    if (moverTrail.error) {
        return `
            <section class="staking-mover-panel" id="staking-mover-panel">
                <div class="staking-panel-head"><div><span>Mover trail</span><h2>${escapeHtml(moverTrail.label)}</h2></div><button type="button" data-staking-close-mover>Close</button></div>
                ${renderArchiveState('This mover trail is temporarily unavailable.', 'is-error')}
                <button class="staking-retry-inline" type="button" data-staking-retry-mover>Retry mover trail</button>
            </section>
        `;
    }
    const rows = moverTrail.rows || [];
    const totalStake = rows.filter((row) => row.action === 'stake').reduce((sum, row) => sum + row.amount, 0);
    const totalUnstake = rows.filter((row) => row.action === 'unstake').reduce((sum, row) => sum + row.amount, 0);
    const visible = rows.slice(0, 50);
    return `
        <section class="staking-mover-panel" id="staking-mover-panel">
            <div class="staking-panel-head">
                <div><span>Complete mover trail</span><h2>${escapeHtml(moverTrail.label)}</h2><small title="${escapeHtml(moverTrail.address)}">${escapeHtml(moverTrail.address)}</small></div>
                <button type="button" data-staking-close-mover>Close</button>
            </div>
            <div class="staking-mover-summary">
                <div><span>Operations</span><strong>${formatCount(rows.length)}</strong></div>
                <div><span>Gross staked</span><strong>${escapeHtml(formatCompactXtz(totalStake))}</strong></div>
                <div><span>Gross unstaked</span><strong>${escapeHtml(formatCompactXtz(totalUnstake))}</strong></div>
                <a href="#ledger-flow=${encodeURIComponent(moverTrail.address)}">Open Ledger Flow →</a>
            </div>
            <div class="staking-mover-rows">${visible.map((row) => renderOperationRow(row, { moverTrailRow: true })).join('') || renderArchiveState('No explicit stake or unstake operations found.')}</div>
            ${rows.length > visible.length ? `<p class="staking-panel-note">Showing the newest ${formatCount(visible.length)} of ${formatCount(rows.length)} operations.</p>` : ''}
        </section>
    `;
}

function renderRoom() {
    const body = document.querySelector('#staking-chamber-modal .staking-chamber-body');
    if (!body || !archiveRows || !overviewData) return;
    body.setAttribute('aria-busy', 'false');
    const summary = archiveSummary(archiveRows);
    const stake = entryData?.stake || richRowCache.get(archiveRows.find((row) => row.action === 'stake')?.id);
    const unstake = entryData?.unstake || richRowCache.get(archiveRows.find((row) => row.action === 'unstake')?.id);
    body.innerHTML = `
        <header class="staking-chamber-header chamber-anim-fade">
            <div>
                <span class="staking-chamber-kicker">Tezos capital movement</span>
                <h1 class="chamber-title" id="staking-chamber-title">Staking Chamber</h1>
                <p>Who explicitly staked or unstaked more than 10,000 ꜩ, where they staked, and every qualifying receipt since staking began.</p>
            </div>
            <span class="staking-live-pill">complete &gt;10K tape</span>
        </header>

        ${renderStakingGuide(overviewData)}

        <section class="staking-overview-grid chamber-anim-fade" aria-label="Current staking overview">
            <div class="staking-overview-card is-primary">
                <span>Current staked</span>
                <strong>${escapeHtml(formatRatio(overviewData.stakingRatio))}</strong>
                <small>own + external stake / total supply</small>
            </div>
            <div class="staking-overview-card">
                <span>Total staked</span>
                <strong>${escapeHtml(formatCompactXtz(overviewData.totalStaked === null || overviewData.totalStaked === undefined ? null : Number(overviewData.totalStaked) * 1e6))}</strong>
                <small>${formatCount(overviewData.totalStakers)} current stakers</small>
            </div>
            <div class="staking-overview-card">
                <span>7-day ratio move</span>
                <strong class="${overviewData.ratioDelta7d === null || overviewData.ratioDelta7d === undefined ? '' : Number(overviewData.ratioDelta7d) >= 0 ? 'is-positive' : 'is-negative'}">${escapeHtml(formatRatioDelta(overviewData.ratioDelta7d))}</strong>
                <button type="button" id="staking-ratio-history">Open all-time ratio history</button>
            </div>
        </section>

        <section class="staking-flow-strip chamber-anim-fade" aria-label="Large operation flow over the last 24 hours">
            <div data-staking-flow="stake"><span>&gt;10K gross stake · 24h</span><strong>${escapeHtml(formatCompactXtz(summary.stakeVolume24h))}</strong><small>${formatCount(summary.stakeCount24h)} ${pluralize(summary.stakeCount24h, 'operation')}</small></div>
            <div data-staking-flow="unstake"><span>&gt;10K gross unstake · 24h</span><strong>${escapeHtml(formatCompactXtz(summary.unstakeVolume24h))}</strong><small>${formatCount(summary.unstakeCount24h)} ${pluralize(summary.unstakeCount24h, 'operation')}</small></div>
            <div data-staking-flow="net"><span>&gt;10K net operation flow</span><strong class="${summary.netVolume24h >= 0 ? 'is-positive' : 'is-negative'}">${escapeHtml(formatSignedXtz(summary.netVolume24h))}</strong><small>Explicit operations only</small></div>
        </section>

        <section class="staking-latest-grid chamber-anim-fade" aria-label="Latest large staking moves">
            ${renderLatestMoveCard('stake', stake)}
            ${renderLatestMoveCard('unstake', unstake)}
        </section>

        <div id="staking-mover-slot">${renderMoverTrailPanel()}</div>

        <section class="staking-archive-panel chamber-anim-fade" aria-labelledby="staking-archive-title">
            <div class="staking-panel-head">
                <div>
                    <span>Complete history</span>
                    <h2 id="staking-archive-title" tabindex="-1">All applied moves over 10,000 ꜩ</h2>
                    <small>${formatCount(archiveRows.length)} matching receipts · ${formatCount(summary.stakeCount)} ${pluralize(summary.stakeCount, 'stake')} / ${formatCount(summary.unstakeCount)} ${pluralize(summary.unstakeCount, 'unstake')} · back to ${escapeHtml(formatDateTime(summary.oldest))}</small>
                </div>
                <span class="staking-complete-badge">incremental receipt cache · ${escapeHtml(formatAge(archiveCheckedAt))}</span>
            </div>
            <div class="staking-archive-controls">
                <div class="staking-action-filter" role="group" aria-label="Filter staking operations">
                    <button type="button" data-staking-filter="all" aria-pressed="${archiveAction === 'all'}">All</button>
                    <button type="button" data-staking-filter="stake" aria-pressed="${archiveAction === 'stake'}">Stake</button>
                    <button type="button" data-staking-filter="unstake" aria-pressed="${archiveAction === 'unstake'}">Unstake</button>
                </div>
                <label class="staking-archive-search">Find
                    <input type="search" id="staking-archive-search" value="${escapeHtml(archiveQuery)}" placeholder="Alias, address, hash, or ID" autocomplete="off">
                </label>
                <label>Sort
                    <select id="staking-archive-sort">
                        <option value="newest"${archiveSort === 'newest' ? ' selected' : ''}>Newest</option>
                        <option value="oldest"${archiveSort === 'oldest' ? ' selected' : ''}>Oldest</option>
                        <option value="largest"${archiveSort === 'largest' ? ' selected' : ''}>Largest</option>
                    </select>
                </label>
                <button type="button" id="staking-export-csv">Export CSV</button>
            </div>
            <div class="staking-table-head" aria-hidden="true"><span>Action</span><span>Amount</span><span>Staker</span><span>Baker</span><span>When</span><span>Proof</span></div>
            <div class="staking-archive-rows" id="staking-archive-rows" aria-live="polite"></div>
            <div class="staking-archive-foot">
                <span id="staking-archive-count"></span>
                <button type="button" id="staking-load-more">Load older</button>
            </div>
        </section>

        <section class="staking-method-panel chamber-anim-fade">
            <div>
                <span>Method</span>
                <p><strong>Strictly over 10,000 ꜩ.</strong> TzKT does not expose an amount filter here, so the first visit cursor-scans applied explicit <code>stake</code> and <code>unstake</code> receipts, filters the actual processed <code>amount</code>, then keeps a versioned local receipt cache. Later visits request only operation IDs newer than each action’s saved high-water mark. Exactly 10,000 ꜩ is excluded.</p>
                <p>Rewards, slashes, automatic baker staking, and unstake finalization are separate protocol events and are not presented as new user stake decisions.</p>
            </div>
            <nav aria-label="Staking Chamber sources and routes">
                <a href="https://api.tzkt.io/" target="_blank" rel="noopener">TzKT API ↗</a>
                <a href="/stake/?view=guide">How staking works</a>
                <a href="/stake/">Direct: /stake/</a>
            </nav>
        </section>

        ${renderNativeWayfinder()}
    `;
    wireRoomInteractions();
    updateArchiveTable({ reset: true });
}

function renderRoomError(error) {
    const body = document.querySelector('#staking-chamber-modal .staking-chamber-body');
    if (!body) return;
    body.setAttribute('aria-busy', 'false');
    body.innerHTML = `
        <header class="staking-chamber-header">
            <div><span class="staking-chamber-kicker">Tezos capital movement</span><h1 class="chamber-title" id="staking-chamber-title">Staking Chamber</h1></div>
            <span class="staking-live-pill">&gt;10,000 ꜩ</span>
        </header>
        ${renderStakingGuide(overviewData)}
        <section class="staking-overview-grid">
            <div class="staking-overview-card is-primary"><span>Current staked</span><strong>${escapeHtml(formatRatio(overviewData?.stakingRatio))}</strong><small>The ratio remains available independently of the tape.</small></div>
        </section>
        <div class="staking-room-error" role="alert">
            <span>⚠</span>
            <h2>Complete staking history is temporarily unavailable</h2>
            <p>${escapeHtml(error?.message || 'TzKT did not return a complete applied-operation scan.')}</p>
            <button type="button" id="staking-room-retry">Retry complete scan</button>
        </div>
        <section class="staking-method-panel">
            <nav><a href="https://tzkt.io/staking" target="_blank" rel="noopener">Open TzKT ↗</a><a href="/stake/?view=guide">How staking works</a><a href="/stake/">Direct: /stake/</a></nav>
        </section>
        ${renderNativeWayfinder()}
    `;
    document.getElementById('staking-room-retry')?.addEventListener('click', () => loadRoom({ force: true }));
    wireGuideDisclosure();
}

function wireInternalRoomLinks(root = document) {
    root.querySelectorAll?.('a[href^="#ledger-flow="], a[href^="#baker="]').forEach((link) => {
        if (link.dataset.stakingRouteWired) return;
        link.dataset.stakingRouteWired = '1';
        link.addEventListener('click', () => closeStakingChamber());
    });
    root.querySelectorAll?.('[data-staking-mover]').forEach((button) => {
        if (button.dataset.stakingMoverWired) return;
        button.dataset.stakingMoverWired = '1';
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            moverTrailReturnFocus = button;
            loadMoverTrail(button.dataset.stakingMover, button.dataset.stakingMoverLabel);
        });
    });
}

function wireRoomInteractions() {
    wireGuideDisclosure();
    document.getElementById('staking-ratio-history')?.addEventListener('click', () => {
        openCardHistoryModal('staking-ratio', 'all');
    });
    document.querySelectorAll('[data-staking-filter]').forEach((button) => {
        button.addEventListener('click', async () => {
            archiveAction = button.dataset.stakingFilter || 'all';
            document.querySelectorAll('[data-staking-filter]').forEach((other) => other.setAttribute('aria-pressed', String(other === button)));
            await updateArchiveTable({ reset: true });
        });
    });
    document.getElementById('staking-archive-sort')?.addEventListener('change', async (event) => {
        archiveSort = event.target.value || 'newest';
        await updateArchiveTable({ reset: true });
    });
    document.getElementById('staking-archive-search')?.addEventListener('input', async (event) => {
        archiveQuery = event.target.value || '';
        await updateArchiveTable({ reset: true });
    });
    document.getElementById('staking-export-csv')?.addEventListener('click', exportArchiveCsv);
    document.getElementById('staking-load-more')?.addEventListener('click', async (event) => {
        event.currentTarget.disabled = true;
        archiveViewCount += TABLE_PAGE_SIZE;
        await updateArchiveTable();
    });
    wireInternalRoomLinks(document.getElementById('staking-chamber-modal'));
    wireMoverTrailControls();
}

function wireMoverTrailControls() {
    document.querySelector('[data-staking-close-mover]')?.addEventListener('click', () => {
        const returnFocus = moverTrailReturnFocus;
        moverTrail = null;
        const slot = document.getElementById('staking-mover-slot');
        if (slot) slot.innerHTML = '';
        if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
        else document.getElementById('staking-archive-title')?.focus({ preventScroll: true });
        moverTrailReturnFocus = null;
    });
    document.querySelector('[data-staking-retry-mover]')?.addEventListener('click', () => {
        if (moverTrail?.address) loadMoverTrail(moverTrail.address, moverTrail.label, { force: true });
    });
}

async function fetchMoverTrail(address, { force = false } = {}) {
    if (!force && moverTrailCache.has(address)) return moverTrailCache.get(address);
    async function scanMoverAction(action) {
        const rows = [];
        let cursor = null;
        while (true) {
            const page = await fetchStakingPage({
                action,
                limit: ARCHIVE_SCAN_LIMIT,
                cursor,
                rich: true,
                staker: address
            });
            rows.push(...page);
            if (page.length < ARCHIVE_SCAN_LIMIT) return rows;
            const next = Number(page.at(-1)?.id) || 0;
            if (!next || next === cursor) throw new Error(`TzKT ${action} mover cursor did not advance`);
            cursor = next;
        }
    }
    const [stakes, unstakes] = await Promise.all([
        scanMoverAction('stake'),
        scanMoverAction('unstake')
    ]);
    const unique = new Map();
    [...stakes, ...unstakes].forEach((row) => {
        const normalized = normalizeRichRow(row);
        if (normalized.id && !unique.has(normalized.id)) unique.set(normalized.id, normalized);
    });
    const rows = [...unique.values()].sort((a, b) => b.id - a.id);
    moverTrailCache.set(address, rows);
    return rows;
}

async function loadMoverTrail(address, label, { force = false } = {}) {
    if (!address) return;
    const request = ++moverTrailRequest;
    moverTrail = { address, label: label || compactAddress(address), loading: true };
    const slot = document.getElementById('staking-mover-slot');
    if (slot) slot.innerHTML = renderMoverTrailPanel();
    wireMoverTrailControls();
    slot?.scrollIntoView({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
    try {
        const rows = await fetchMoverTrail(address, { force });
        if (request !== moverTrailRequest) return;
        moverTrail = { address, label: label || compactAddress(address), rows };
    } catch (error) {
        console.warn('Staking mover trail failed', error);
        if (request !== moverTrailRequest) return;
        moverTrail = { address, label: label || compactAddress(address), error: true };
    }
    const current = document.getElementById('staking-mover-slot');
    if (current) current.innerHTML = renderMoverTrailPanel();
    wireInternalRoomLinks(current);
    wireMoverTrailControls();
}

async function loadRoom({ force = false } = {}) {
    renderLoadingRoom();
    const overviewPromise = fetchOverview().then((overview) => {
        overviewData = overview;
        patchLoadingOverview(overview);
        return overview;
    });
    try {
        const [, archive, latest] = await Promise.all([
            overviewPromise,
            fetchLargeMoveArchive({ force }),
            fetchLatestLargeMoves({ force })
        ]);
        if (!document.getElementById('staking-chamber-modal')?.classList.contains('active')) return;
        archiveRows = archive;
        entryData = latest;
        const merged = new Map(archiveRows.map((row) => [row.id, row]));
        [latest?.stake, latest?.unstake].filter((row) => row?.id && isLargeMove(row)).forEach((row) => {
            richRowCache.set(row.id, row);
            merged.set(row.id, normalizeRichRow(row, row.action));
        });
        archiveRows = [...merged.values()].sort((a, b) => b.id - a.id);
        renderRoom();
    } catch (error) {
        console.error('Staking Chamber load failed', error);
        await overviewPromise.catch(() => null);
        if (document.getElementById('staking-chamber-modal')?.classList.contains('active')) renderRoomError(error);
    }
}

export async function openStakingChamber({ isCurrent = () => true } = {}) {
    if (!isCurrent()) return;
    await ensureStakingStyles();
    if (!isCurrent()) return;
    if (guideViewRequested()) guideOpen = true;
    const overlay = ensureOverlay();
    overlay.classList.add('active');
    activateChamberDialog(overlay, {
        close: closeStakingChamber,
        dialogSelector: '.staking-chamber-content',
        titleId: 'staking-chamber-title',
        restoreFocusSelector: '#staking-entry-card'
    });
    lockPageScroll();
    const content = overlay.querySelector('.staking-chamber-content');
    if (content) content.scrollTop = 0;
    await loadRoom();
    if (!isCurrent() || !overlay.classList.contains('active')) return;
}

export function closeStakingChamber() {
    const overlay = document.getElementById('staking-chamber-modal');
    if (!requestChamberClose(overlay)) return;
    if (!overlay?.classList.contains('active')) return;
    overlay.classList.remove('active');
    deactivateChamberDialog(overlay);
    moverTrailRequest += 1;
    moverTrail = null;
    unlockPageScroll();
}

export function initStakingChamber() {
    ensureStakingStyles().catch((error) => console.warn('Staking Chamber styles unavailable', error));
    const card = ensureEntryCard();
    if (!card) return;
    bindEntryStats();
    startEntryRefresh();
    updateEntryRatio(loadStats());
    window.openStakingChamber = openStakingChamber;
    window.closeStakingChamber = closeStakingChamber;
    const queue = () => refreshEntryCard();
    if ('requestIdleCallback' in window) window.requestIdleCallback(queue, { timeout: 5000 });
    else window.setTimeout(queue, 2500);
}
