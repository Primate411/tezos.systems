import { setTextPending, loadingRows } from '../ui/text-loading.js';
/**
 * My Tezos Memory — exact L1 total history plus human-readable activity.
 */

import {
    getAllMyTezosRecords,
    getMyTezosRecord,
    initMyTezosDb,
    commitMyTezosPage,
    pruneMyTezosActivityRecords,
    setMyTezosMeta
} from '../core/my-tezos-db.mjs';
import { myTezosAccountKey } from '../core/my-tezos-models.mjs';
import { quietlySyncHtml } from '../core/quiet-refresh.js';
import { escapeHtml, formatFreshnessStamp } from '../core/utils.js';
import { readSavedMyTezosEntries } from '../core/wallet.js';
import {
    activityDisplay,
    aggregateMyTezosActivities
} from './my-tezos-activity-model.mjs';
import {
    fetchMyTezosActivityPage
} from './my-tezos-tzkt-adapter.mjs';
import {
    readCachedExactBalanceHistory,
    syncExactBalanceHistory
} from './my-tezos-balance-history.mjs';
import {
    readMyTezosScope,
    readScopedMyTezosEntries
} from './my-tezos-scope.mjs';

const INITIAL_DAYS = 365;
const INITIAL_PAGE_LIMIT = 3;
const LOAD_EARLIER_PAGE_LIMIT = 5;
const LAST_SEEN_KEY = 'tezos-systems-my-tezos-memory-last-seen-v1';
const STORAGE_NOTICE_ID = 'my-tezos-memory-storage-notice';

let initialized = false;
let activeGeneration = 0;
let syncInFlight = null;
let syncController = null;
let syncMode = null;
let successfulVisibleRender = false;
let currentActivities = [];
let currentHistory = null;
let activityFilter = 'transfers';
let activityReadState = 'loading';
const confirmedActivityScopes = new Set();
const activityScopeKey = () => includedEntries().map(entry => entry.address).sort().join('|');
let unseenOnly = false;
let loadEarlierQueued = false;

function includedEntries() {
    return readSavedMyTezosEntries().filter((entry) => entry.included !== false);
}

function memorySurfaceVisible() {
    return document.visibilityState === 'visible'
        && (
            document.getElementById('my-tezos-panel-overview')?.hidden === false
            || document.getElementById('my-tezos-panel-portfolio')?.hidden === false
            || document.getElementById('my-tezos-panel-transactions')?.hidden === false
            || document.getElementById('my-tezos-panel-story')?.hidden === false
        )
        && document.getElementById('my-tezos-drawer')?.classList.contains('open') === true;
}

function panelVisible({ activityOnly = false } = {}) {
    return document.visibilityState === 'visible'
        && (
            (activityOnly && document.getElementById('my-tezos-panel-overview')?.hidden === false)
            || document.getElementById('my-tezos-panel-portfolio')?.hidden === false
            || document.getElementById('my-tezos-panel-transactions')?.hidden === false
            || document.getElementById('my-tezos-panel-story')?.hidden === false
        )
        && document.getElementById('my-tezos-drawer')?.classList.contains('open') === true;
}

function visibleSyncMode() {
    if (!memorySurfaceVisible()) return null;
    return document.getElementById('my-tezos-panel-portfolio')?.hidden === false
        ? 'full'
        : 'activity';
}

function setStorageNotice(message = '') {
    const notice = document.getElementById(STORAGE_NOTICE_ID);
    if (!notice) return;
    notice.textContent = message;
    notice.hidden = !message;
}

function setStatus(message, state = '', activityState = state) {
    activityReadState = activityState;
    if (state !== 'loading') {
        renderOverviewActivity(currentActivities);
        renderActivity(currentActivities);
        renderTransactionSummary(currentActivities, readScopedMyTezosEntries());
    }
    [
        document.getElementById('portfolio-memory-status'),
        document.getElementById('my-tezos-overview-activity-status')
    ].filter(Boolean).forEach((status) => {
        status.textContent = message;
        status.dataset.state = state;
    });
}

function setLoadEarlierState({ busy = false, queued = false } = {}) {
    const button = document.getElementById('portfolio-load-earlier');
    if (!button) return;
    button.disabled = busy;
    button.setAttribute('aria-busy', String(busy));
    button.dataset.queued = queued ? 'true' : 'false';
    button.textContent = queued ? 'Queued…' : busy ? 'Loading…' : 'Load earlier';
}

function requestEarlierReceipts() {
    if (syncInFlight) {
        if (loadEarlierQueued) return;
        loadEarlierQueued = true;
        setLoadEarlierState({ busy: true, queued: true });
        setStatus('Finishing the current receipt sync, then loading earlier history…', 'loading');
        syncInFlight.finally(() => {
            if (!loadEarlierQueued) return;
            loadEarlierQueued = false;
            if (!memorySurfaceVisible()) {
                setLoadEarlierState();
                return;
            }
            requestEarlierReceipts();
        });
        return;
    }
    setLoadEarlierState({ busy: true });
    syncMemory({ loadEarlier: true })
        .catch(() => {})
        .finally(() => setLoadEarlierState());
}

function renderWhileAway(activities, { baselineCreated = false } = {}) {
    const target = document.getElementById('portfolio-while-away');
    if (!target) return;
    const lastSeen = Number(localStorage.getItem(LAST_SEEN_KEY)) || 0;
    if (!lastSeen || baselineCreated) {
        quietlySyncHtml(target, `
            <div class="portfolio-memory-empty">
                <strong>Memory is ready</strong>
                <span>Future on-chain changes will appear here after you return. Historical backfill is not marked as unseen.</span>
            </div>
        `);
        return;
    }
    const unseen = activities.filter((activity) => activity.timestamp > lastSeen);
    if (!unseen.length) {
        quietlySyncHtml(target, `
            <div class="portfolio-memory-empty">
                <strong>No new indexed activity</strong>
                <span>Nothing in the indexed receipts changed since ${escapeHtml(new Date(lastSeen).toLocaleString())}.</span>
            </div>
        `);
        return;
    }
    const kinds = new Map();
    unseen.forEach((activity) => kinds.set(activity.kind, (kinds.get(activity.kind) || 0) + 1));
    const chips = [...kinds.entries()].slice(0, 4)
        .map(([kind, count]) => `<span>${escapeHtml(kind.replaceAll('-', ' '))} · ${count}</span>`)
        .join('');
    quietlySyncHtml(target, `
        <div class="portfolio-memory-delta">
            <strong>${unseen.length} change${unseen.length === 1 ? '' : 's'} since your last visit</strong>
            <div>${chips}</div>
        </div>
    `);
}

function activityRowHtml(activity) {
    const display = activityDisplay(activity);
    const direction = activity.direction === 'in' ? '↓' : activity.direction === 'out' ? '↑' : activity.direction === 'self' ? '↔' : '•';
    const interactionType = activity.kind.startsWith('nft-') ? 'nft' : 'transfer';
    return `
        <article class="portfolio-activity-item activity-item-${interactionType}" data-quiet-key="${escapeHtml(activity.id)}" data-activity-id="${escapeHtml(activity.id)}" data-activity-type="${interactionType}">
            <span class="portfolio-activity-direction" data-direction="${escapeHtml(activity.direction)}" aria-hidden="true">${direction}</span>
            <div>
                <strong>${escapeHtml(display.title)}</strong>
                <span>${escapeHtml(new Date(activity.timestamp).toLocaleString())}${display.amountText ? ` · ${escapeHtml(display.amountText)}` : ''}</span>
                <small>${escapeHtml(display.confidence)} · ${escapeHtml(activity.layer === 'l2' ? 'Etherlink L2' : 'Tezos L1')}</small>
            </div>
            ${display.explorerUrl ? `<a href="${escapeHtml(display.explorerUrl)}" target="_blank" rel="noopener" aria-label="Open source receipt">↗</a>` : ''}
        </article>
    `;
}

function renderActivityList(target, empty, activities, emptyMessage) {
    if (!target || !empty) return;
    empty.hidden = activities.length > 0;
    if (!activities.length) {
        const pending = activityReadState === 'loading' && !confirmedActivityScopes.has(activityScopeKey()) && includedEntries().length > 0;
        quietlySyncHtml(target, pending ? loadingRows('Reading account activity') : '');
        empty.hidden = pending;
        empty.textContent = activityReadState === 'error' ? 'Account activity unavailable. Retry to read receipts.' : emptyMessage;
        return;
    }
    quietlySyncHtml(target, activities.map(activityRowHtml).join(''));
}

function renderOverviewActivity(activities) {
    renderActivityList(
        document.getElementById('my-tezos-overview-activity-list'),
        document.getElementById('my-tezos-overview-activity-empty'),
        activities.slice(0, 3),
        'No recent applied account activity is loaded yet.'
    );
}

function renderActivity(activities) {
    const lastSeen = Number(localStorage.getItem(LAST_SEEN_KEY)) || 0;
    const filtered = activities.filter((activity) => {
        const isNft = activity.kind.startsWith('nft-');
        if (activityFilter === 'nft' ? !isNft : isNft) return false;
        return !unseenOnly || activity.timestamp > lastSeen;
    }).slice(0, 80);
    renderActivityList(
        document.getElementById('portfolio-activity-list'),
        document.getElementById('portfolio-activity-empty'),
        filtered,
        unseenOnly
            ? `No new ${activityFilter === 'nft' ? 'NFT interactions' : 'transfers'} remain in the loaded window.`
            : activityFilter === 'nft'
                ? 'No NFT interactions are classified in the loaded activity window.'
                : 'No transfer or account receipts are loaded yet.'
    );
}

function renderTransactionSummary(activities, entries) {
    const values = {
        receipts: activities.length,
        transfers: activities.filter((activity) => !activity.kind.startsWith('nft-')).length,
        nfts: activities.filter((activity) => activity.kind.startsWith('nft-')).length,
        wallets: entries.length
    };
    Object.entries(values).forEach(([key, value]) => {
        const target = document.querySelector(`[data-transactions-total="${key}"] strong`);
        if (target) target.textContent = key !== 'wallets' && !activities.length && activityReadState === 'error' ? '—' : Number(value).toLocaleString();
        setTextPending(target, key !== 'wallets' && !activities.length && entries.length > 0 && activityReadState === 'loading' && !confirmedActivityScopes.has(activityScopeKey()));
    });
}

function setActivityFilter(filter, { onlyUnseen = false } = {}) {
    activityFilter = filter === 'nft' ? 'nft' : 'transfers';
    unseenOnly = onlyUnseen;
    document.querySelectorAll('[data-activity-filter]').forEach((button) => {
        const active = button.dataset.activityFilter === activityFilter;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
    });
    renderActivity(currentActivities);
}

export function prepareMyTezosChangesView() {
    const lastSeen = Number(localStorage.getItem(LAST_SEEN_KEY)) || 0;
    const unseen = lastSeen
        ? currentActivities.filter((activity) => activity.timestamp > lastSeen)
        : [];
    const nextFilter = unseen.some((activity) => activity.kind.startsWith('nft-')) ? 'nft' : 'transfers';
    setActivityFilter(nextFilter, { onlyUnseen: unseen.length > 0 });
    return unseen.length;
}

function renderMemory(entries, history, activities, { status = 'cached', baselineCreated = false } = {}) {
    if (status !== 'loading' && status !== 'cached') activityReadState = status;
    currentHistory = history;
    const scopedEntries = readScopedMyTezosEntries(entries);
    currentActivities = aggregateMyTezosActivities(activities, scopedEntries.map((entry) => entry.address));
    renderWhileAway(currentActivities, { baselineCreated });
    renderOverviewActivity(currentActivities);
    renderActivity(currentActivities);
    renderTransactionSummary(currentActivities, scopedEntries);
    window.dispatchEvent(new CustomEvent('my-tezos-memory-ready', {
        detail: {
            compositionAddresses: entries.map((entry) => entry.address),
            scopeAddresses: scopedEntries.map((entry) => entry.address),
            scope: readMyTezosScope(entries),
            scheduleVersion: history?.scheduleVersion || null,
            seriesByAddress: history?.seriesByAddress || {},
            aggregate: history?.aggregate || [],
            coverageByAddress: history?.coverageByAddress || {},
            aggregateCoverage: history?.aggregateCoverage || {
                completed: 0,
                target: 0,
                dailyCompleted: 0,
                dailyTarget: 0,
                complete: false
            },
            sourceStatus: {
                ...history?.sourceStatus,
                stage: ['complete', 'partial', 'error'].includes(status) ? status : history?.sourceStatus?.stage || status
            },
            activities: currentActivities,
            status
        }
    }));
}

async function readCachedMemory(entries) {
    const history = await readCachedExactBalanceHistory(entries);
    const activities = [];
    for (const entry of entries) {
        const accountActivities = await getAllMyTezosRecords('activityByAccount', {
            index: 'accountKey',
            query: IDBKeyRange.only(myTezosAccountKey('l1', entry.address)),
            direction: 'prev',
            limit: 50_000
        });
        activities.push(...accountActivities);
    }
    return { history, activities };
}

async function syncActivity(entries, ownedAddresses, { loadEarlier = false, signal } = {}) {
    const addressKey = entries.map((entry) => entry.address).sort().join(',');
    const stateId = `tzkt:activity:${addressKey}`;
    const state = await getMyTezosRecord('syncState', stateId);
    if (loadEarlier && state?.complete) return [];
    let lastId = loadEarlier ? Number(state?.cursor) || null : null;
    let resumeCursor = Number(state?.cursor) || null;
    const cutoff = Date.now() - INITIAL_DAYS * 24 * 60 * 60 * 1000;
    const limit = loadEarlier ? LOAD_EARLIER_PAGE_LIMIT : INITIAL_PAGE_LIMIT;
    const collected = [];
    let complete = false;
    for (let page = 0; page < limit; page += 1) {
        const result = await fetchMyTezosActivityPage(entries.map((entry) => entry.address), {
            ownedAddresses,
            lastId,
            from: loadEarlier ? '' : new Date(cutoff).toISOString(),
            signal
        });
        collected.push(...result.rows);
        complete = result.complete || result.rows.some((row) => row.timestamp <= cutoff);
        lastId = result.nextCursor;
        if (loadEarlier || !resumeCursor) resumeCursor = result.nextCursor;
        await commitMyTezosPage('activityByAccount', result.rows, {
            id: stateId,
            adapter: 'tzkt',
            accountKey: `aggregate:l1:${addressKey}`,
            stream: 'activity',
            cursor: loadEarlier && result.complete ? null : resumeCursor,
            watermark: result.rows[0]?.timestamp || state?.watermark || null,
            complete: loadEarlier ? result.complete : false,
            windowComplete: !loadEarlier && complete,
            updatedAt: Date.now(),
            error: null
        });
        if (complete || result.nextCursor == null) break;
    }
    await Promise.all(entries.map((entry) => (
        pruneMyTezosActivityRecords(myTezosAccountKey('l1', entry.address))
    )));
    return collected;
}

async function syncMemory({ loadEarlier = false, force = false, activityOnly = false } = {}) {
    if (!panelVisible({ activityOnly })) return null;
    const requestedMode = activityOnly ? 'activity' : 'full';
    const upgrading = requestedMode === 'full' && syncMode === 'activity';
    if (syncInFlight && !force && !upgrading) return syncInFlight;
    if (syncInFlight && (force || upgrading)) syncController?.abort();
    const entries = includedEntries();
    const generation = ++activeGeneration;
    if (!entries.length) {
        const cached = await readCachedMemory([]);
        renderMemory([], cached.history, [], { status: 'empty' });
        setStatus('Include an L1 address to load Memory.', 'empty');
        return null;
    }
    setStatus(
        loadEarlier
            ? 'Loading earlier TzKT receipts…'
            : activityOnly
                ? 'Refreshing recent applied receipts…'
                : 'Syncing account receipts while exact balance history fills…',
        'loading'
    );
    const controller = new AbortController();
    syncController = controller;
    syncMode = requestedMode;
    const ownedAddresses = entries.map((entry) => entry.address);

    const pending = (async () => {
        const before = await readCachedMemory(entries);
        let latestHistory = before.history;
        const jobs = [
            syncActivity(entries, ownedAddresses, {
                loadEarlier,
                signal: controller.signal
            })
        ];
        if (!activityOnly) {
            jobs.unshift(
                loadEarlier
                    ? Promise.resolve(latestHistory)
                    : syncExactBalanceHistory(entries, {
                        signal: controller.signal,
                        onProgress: async (history) => {
                            latestHistory = history;
                            if (generation !== activeGeneration || !memorySurfaceVisible()) return;
                            renderMemory(entries, history, before.activities, { status: 'loading' });
                        }
                    })
            );
        }
        const results = await Promise.allSettled(jobs);
        const historyResult = activityOnly ? null : results[0];
        const activityResult = activityOnly ? results[0] : results[1];
        if (activityResult.status === 'fulfilled') confirmedActivityScopes.add(entries.map(entry => entry.address).sort().join('|'));
        if (generation !== activeGeneration || !memorySurfaceVisible()) return null;
        const cached = await readCachedMemory(entries);
        if (historyResult?.status === 'fulfilled') latestHistory = historyResult.value;
        let baselineCreated = false;
        const requiredResults = [historyResult, activityResult].filter(Boolean);
        const successCount = requiredResults.filter((result) => result.status === 'fulfilled').length;
        if (successCount > 0 && !Number(localStorage.getItem(LAST_SEEN_KEY))) {
            localStorage.setItem(LAST_SEEN_KEY, String(Date.now()));
            baselineCreated = true;
        }
        renderMemory(entries, cached.history?.aggregate?.length ? cached.history : latestHistory, cached.activities, {
            status: successCount === requiredResults.length ? 'complete' : 'partial',
            baselineCreated
        });
        successfulVisibleRender = successCount > 0;
        const failedResults = requiredResults.filter((result) => result.status === 'rejected');
        const failures = failedResults.length;
        const failureSummary = failedResults
            .map((result) => result.reason?.message || String(result.reason || 'source unavailable'))
            .filter(Boolean)
            .join(' · ');
        setStatus(
            failures
                ? `Memory updated with partial source coverage · ${failureSummary || `${failures} request${failures === 1 ? '' : 's'} unavailable`}`
                : `${loadEarlier ? 'Earlier receipts loaded' : activityOnly ? 'Recent transactions current' : 'Memory current'} · ${formatFreshnessStamp(new Date(), { source: 'TzKT' })}`,
            failures ? 'partial' : 'complete',
            activityResult.status === 'rejected' ? 'error' : 'complete'
        );
        await setMyTezosMeta('memory-last-success', {
            timestamp: Date.now(),
            addresses: ownedAddresses,
            partial: failures > 0
        });
        return { entries, ...cached, failures };
    })().catch((error) => {
        if (generation === activeGeneration) {
            setStatus(`${error.message || 'Memory refresh failed'} · showing saved receipts`, 'error');
        }
        return null;
    }).finally(() => {
        if (syncInFlight === pending) {
            syncInFlight = null;
            syncController = null;
            syncMode = null;
        }
    });
    syncInFlight = pending;
    return pending;
}

function scheduleSync({ force = false, activityOnly = false } = {}) {
    const run = () => syncMemory({ force, activityOnly }).catch(() => {});
    if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 1200 });
    else setTimeout(run, 250);
}

export async function activateMyTezosMemory({ force = false, activityOnly = false } = {}) {
    const entries = includedEntries();
    activityReadState = 'loading';
    try {
        await initMyTezosDb();
        setStorageNotice('');
        const cached = await readCachedMemory(entries);
        renderMemory(entries, cached.history, cached.activities, { status: 'cached' });
        scheduleSync({ force, activityOnly });
    } catch (error) {
        setStorageNotice('History cannot be saved on this device. Current data remains available for this visit.');
        setStatus(error.message || 'Memory storage unavailable', 'error');
    }
}

export function refreshMyTezosMemory({ force = false } = {}) {
    return syncMemory({ force, activityOnly: true });
}

export function initMyTezosMemory() {
    if (initialized) return;
    initialized = true;
    document.getElementById('portfolio-load-earlier')?.addEventListener('click', () => {
        requestEarlierReceipts();
    });
    document.getElementById('my-tezos-overview-transactions-link')?.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('my-tezos-view-request', { detail: { view: 'transactions' } }));
    });
    document.querySelectorAll('[data-activity-filter]').forEach((button) => {
        button.addEventListener('click', () => {
            setActivityFilter(button.dataset.activityFilter || 'transfers');
        });
    });
    window.addEventListener('my-tezos-activity-filter', (event) => {
        const filter = event.detail?.filter || 'transfers';
        setActivityFilter(filter, { onlyUnseen: filter === 'unseen' });
    });
    window.addEventListener('my-tezos-drawer-closed', () => {
        if (!successfulVisibleRender) return;
        localStorage.setItem(LAST_SEEN_KEY, String(Date.now()));
        successfulVisibleRender = false;
    });
    window.addEventListener('my-tezos-portfolio-changed', () => {
        activeGeneration += 1;
        const mode = visibleSyncMode();
        if (mode) activateMyTezosMemory({ force: true, activityOnly: mode === 'activity' }).catch(() => {});
    });
    window.addEventListener('my-tezos-scope-changed', () => {
        activeGeneration += 1;
        const mode = visibleSyncMode();
        if (mode) activateMyTezosMemory({ activityOnly: mode === 'activity' }).catch(() => {});
    });
    document.addEventListener('visibilitychange', () => {
        const mode = visibleSyncMode();
        if (mode) scheduleSync({ activityOnly: mode === 'activity' });
    });
}

export function destroyMyTezosMemoryForTests() {
    activeGeneration += 1;
    syncController?.abort();
    syncController = null;
    syncInFlight = null;
    syncMode = null;
    successfulVisibleRender = false;
    currentActivities = [];
    currentHistory = null;
    activityFilter = 'transfers';
    unseenOnly = false;
    initialized = false;
}
