import { requestChamberClose } from '../ui/chamber-accessibility.js';
/**
 * Whale Watch Chamber
 *
 * The generated /data/whale-watch.json artifact is the complete shared source
 * for the 24-hour overview, flow stories, dormant cohort, and awakenings.
 * Direct TzKT reads remain a bounded, current Live Tape. Those two clocks are
 * labelled independently and never combined into an "economic volume" claim.
 */

import { GENERATED_PROOFBOOK_SCHEDULE_LABEL } from '../core/freshness-contracts.mjs';
import { versionedAsset } from '../core/asset-version.js';
import { escapeHtml, formatUtcDateTime } from '../core/utils.js';
import { quietlySyncHtml } from '../core/quiet-refresh.js';
import { createChamberSnapshotCache } from '../core/chamber-snapshot-cache.js';
import {
    activateChamberDialog,
    deactivateChamberDialog,
    findChamberLauncher,
    wireChamberLauncher
} from '../ui/chamber-accessibility.js';
import { ensureChamberStylesheet } from '../ui/chamber-styles.js';
import {
    formatWhaleAmount,
    getWhaleAddressLabel,
    getWhaleOperationContext,
    getWhaleSnapshot,
    groupWhaleOperations,
    refreshWhaleData,
    whaleOperationAmount,
    whaleOperationAmountPresentation,
    whaleOperationGroupHash,
    whaleOperationId,
    whaleOperationThresholdAmount
} from './whales.js';
import {
    disableAwakeningNotifications,
    formatDormancy,
    formatGiantAmount,
    getAwakeningNotificationState,
    getSleepingGiantsSnapshot,
    refreshSleepingGiantsData,
    requestAwakeningNotifications
} from './sleeping-giants.js';

const CSS_URL = versionedAsset('/css/whale-chamber.min.css');
const ARTIFACT_URL = '/data/whale-watch.json';
const snapshotCache = createChamberSnapshotCache({ key: 'whales', validateSnapshot: validateArtifact });
const LIVE_REFRESH_MS = 20_000;
const ARTIFACT_REFRESH_MS = 5 * 60_000;
const GIANT_MONITOR_MS = 5 * 60_000;
const VIEWS = Object.freeze([
    { id: 'overview', label: 'Overview', detail: 'Complete shared 24-hour receipts and coverage.' },
    { id: 'live', label: 'Live Tape', detail: 'A bounded current sample of large applied operations.' },
    { id: 'flows', label: 'Flow Stories', detail: 'Related operation legs joined by operation-group hash.' },
    { id: 'dormant', label: 'Deep Sleep', detail: 'Large accounts quiet for at least one year.' },
    { id: 'awakenings', label: 'Awakenings', detail: 'Operation receipts observed after dormancy.' }
]);
const VIEW_IDS = new Set(VIEWS.map(({ id }) => id));
const FILTER_TYPES = new Set(['all', 'transaction', 'stake', 'unstake', 'delegation']);
const MINIMUMS = new Set([1000, 10000, 100000, 1000000]);

let currentView = 'overview';
let minimumXtz = 1000;
let operationType = 'all';
let searchQuery = '';
let lastArtifact = null;
let savedArtifact = false;
let openEpoch = 0;
let chamberRefreshWork = null;
let activeForcedRefresh = false;
let queuedForcedRefresh = null;
let artifactError = '';
let liveError = '';
let artifactFetch = null;
let refreshTimer = null;
let refreshDeferred = false;
let visibilityReady = false;
let lastArtifactRead = 0;
let lastGiantMonitor = 0;
let savedBodyOverflow = null;
let savedHtmlOverflow = null;
let whaleWatchFocusedBeforeOpen = null;
const artifactSubscribers = new Set();

function whaleWatchArtifactPhase() {
    if (lastArtifact) return artifactError || savedArtifact ? 'last-good' : 'ready';
    if (artifactFetch) return 'loading';
    return artifactError ? 'unavailable' : 'idle';
}

export function peekWhaleWatchArtifactState() {
    return Object.freeze({
        phase: whaleWatchArtifactPhase(),
        artifact: lastArtifact,
        refreshing: Boolean(artifactFetch),
        refreshFailed: Boolean(artifactError),
        cached: savedArtifact,
        error: artifactError || '',
        fetchedAt: lastArtifactRead || null,
        scheduleLabel: GENERATED_PROOFBOOK_SCHEDULE_LABEL
    });
}

function publishWhaleWatchArtifactState() {
    if (document.visibilityState !== 'visible') return;
    if (!artifactSubscribers.size) return;
    const state = peekWhaleWatchArtifactState();
    [...artifactSubscribers].forEach((listener) => {
        try {
            listener(state);
        } catch (error) {
            console.warn('Whale Watch artifact subscriber failed', error);
        }
    });
}

export function subscribeWhaleWatchArtifact(listener) {
    if (typeof listener !== 'function') return () => {};
    artifactSubscribers.add(listener);
    try {
        listener(peekWhaleWatchArtifactState());
    } catch (error) {
        console.warn('Whale Watch artifact subscriber failed', error);
    }
    return () => artifactSubscribers.delete(listener);
}

function number(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function compact(value, maximumFractionDigits = 1) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 'Unavailable';
    return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits }).format(parsed);
}

function exact(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed.toLocaleString('en-US') : 'Unavailable';
}

function xtz(mutez, digits = 1) {
    const parsed = Number(mutez);
    return Number.isFinite(parsed) ? `${formatWhaleAmount(parsed, digits)} ꜩ` : 'Amount unavailable';
}

function short(value, head = 10, tail = 5) {
    const text = String(value || 'Unknown');
    return text.length > head + tail + 3 ? `${text.slice(0, head)}…${text.slice(-tail)}` : text;
}

function formatDate(value, includeTime = true) {
    const timestamp = Date.parse(value || '');
    if (!Number.isFinite(timestamp)) return 'Unavailable';
    return new Date(timestamp).toLocaleString('en-US', includeTime
        ? { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }
        : { year: 'numeric', month: 'short', day: 'numeric' });
}

function ageLabel(value) {
    const timestamp = Date.parse(value || '');
    if (!Number.isFinite(timestamp)) return 'not yet refreshed';
    const elapsed = Math.max(0, Date.now() - timestamp);
    if (elapsed < 60_000) return 'just now';
    if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m ago`;
    if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h ago`;
    return `${Math.floor(elapsed / 86_400_000)}d ago`;
}

function archiveWindowLabel(transfer = lastArtifact?.transfers24h) {
    const since = transfer?.window?.since;
    const until = transfer?.window?.until;
    if (!Number.isFinite(Date.parse(since || '')) || !Number.isFinite(Date.parse(until || ''))) {
        return 'window unavailable';
    }
    return `${formatUtcDateTime(since)} → ${formatUtcDateTime(until)} UTC`;
}

function receiptHref(hash, address = '') {
    const target = hash || address;
    return target ? `https://tzkt.io/${encodeURIComponent(target)}` : 'https://tzkt.io';
}

function ensureWhaleCss() {
    return ensureChamberStylesheet('whale-chamber-css', CSS_URL);
}

function validateArtifact(value) {
    if (!value || value.kind !== 'tezos-whale-watch' || value.version !== 1) {
        throw new Error('Whale Watch artifact v1 is required.');
    }
    if (!value.generatedAt || !Array.isArray(value.transfers24h?.topFlowStories)
        || !Array.isArray(value.transfers24h?.thresholds)
        || !Array.isArray(value.dormant?.records)
        || !Array.isArray(value.awakenings)) {
        throw new Error('Whale Watch artifact is missing required receipt collections.');
    }
    const generatedAt = Date.parse(value.generatedAt);
    const windowSince = Date.parse(value.transfers24h?.window?.since || '');
    const windowUntil = Date.parse(value.transfers24h?.window?.until || '');
    if (!Number.isFinite(generatedAt)
        || value.coverage?.largeAccounts?.complete !== true
        || value.coverage?.transfers24h?.complete !== true
        || value.transfers24h?.complete !== true
        || windowUntil !== generatedAt
        || windowUntil - windowSince !== 86_400_000) {
        throw new Error('Whale Watch artifact requires complete ledgers and an exact generated-at 24-hour window.');
    }
    const minimumDormantDays = Number(value.methodology?.minimumDormantDays);
    if (!Number.isFinite(minimumDormantDays) || minimumDormantDays < 1) {
        throw new Error('Whale Watch artifact is missing its dormancy threshold.');
    }
    if (value.awakenings.some((event) => {
        const rawType = String(event?.receipt?.type || '').toLowerCase();
        const semanticType = rawType === 'staking'
            ? String(event?.receipt?.action || '').toLowerCase()
            : rawType;
        const amount = event?.receipt?.amountMutez;
        const previousActivity = Date.parse(event?.previousActivityTime || '');
        const awakenedAt = Date.parse(event?.awakenedAt || '');
        const receiptDormantDays = Math.floor((awakenedAt - previousActivity) / 86_400_000);
        return !event?.receipt?.hash
            || !event.receipt.timestamp
            || event.awakenedAt !== event.receipt.timestamp
            || String(event.receipt.status || '').toLowerCase() !== 'applied'
            || !Number.isFinite(previousActivity)
            || previousActivity >= awakenedAt
            || awakenedAt > generatedAt
            || !Number.isFinite(Number(event.dormantDays))
            || Number(event.dormantDays) < minimumDormantDays
            || Number(event.dormantDays) !== receiptDormantDays
            || (event.movedAmountMutez ?? null) !== (amount ?? null)
            || (amount != null && (!Number.isFinite(Number(amount))
                || Number(amount) < 0
                || !['transaction', 'stake', 'unstake'].includes(semanticType)));
    })) {
        throw new Error('Whale Watch awakenings require an applied receipt with a type-safe moved amount.');
    }
    return value;
}

async function fetchWhaleArtifact({ force = false } = {}) {
    if (!force && lastArtifact && Date.now() - lastArtifactRead < ARTIFACT_REFRESH_MS) return lastArtifact;
    if (artifactFetch) return artifactFetch;
    artifactFetch = fetch(ARTIFACT_URL, { cache: 'no-cache' })
        .then(async (response) => {
            if (!response.ok) throw new Error(`Shared Whale Watch snapshot unavailable (${response.status})`);
            const text = await response.text();
            const artifact = validateArtifact(JSON.parse(text));
            if (lastArtifact && Date.parse(artifact.generatedAt) < Date.parse(lastArtifact.generatedAt)) {
                throw new Error('Shared archive is older than the retained receipt.');
            }
            void snapshotCache.save(text);
            return artifact;
        })
        .then((artifact) => {
            lastArtifact = artifact;
            savedArtifact = false;
            artifactError = '';
            lastArtifactRead = Date.now();
            return artifact;
        })
        .catch((error) => {
            artifactError = error?.message || String(error);
            if (lastArtifact) return lastArtifact;
            throw error;
        })
        .finally(() => {
            artifactFetch = null;
            publishWhaleWatchArtifactState();
        });
    publishWhaleWatchArtifactState();
    return artifactFetch;
}

export function getWhaleWatchArtifact(options = {}) {
    return fetchWhaleArtifact(options);
}

function isWhaleRoute() {
    return window.location.pathname.replace(/\/+$/, '') === '/whales';
}

function leaveWhaleRoute() {
    if (!isWhaleRoute()) return;
    window.history.replaceState(
        { ...(window.history.state || {}), tezosSystemsRoute: 'home' },
        '',
        '/'
    );
    window.dispatchEvent(new CustomEvent('tezos:routechange', {
        detail: { entryId: 'home', route: '/', replace: true, current: false }
    }));
}

function readRouteState() {
    if (!isWhaleRoute()) return;
    const params = new URL(window.location.href).searchParams;
    const view = params.get('view');
    const minimum = Number(params.get('min'));
    const type = params.get('type');
    if (VIEW_IDS.has(view)) currentView = view;
    if (MINIMUMS.has(minimum)) minimumXtz = minimum;
    if (FILTER_TYPES.has(type)) operationType = type;
    searchQuery = (params.get('q') || '').slice(0, 80);
}

function updateRouteState() {
    if (!isWhaleRoute()) return;
    const url = new URL(window.location.href);
    url.searchParams.set('view', currentView);
    if (minimumXtz === 1000) url.searchParams.delete('min');
    else url.searchParams.set('min', String(minimumXtz));
    if (operationType === 'all') url.searchParams.delete('type');
    else url.searchParams.set('type', operationType);
    if (searchQuery) url.searchParams.set('q', searchQuery);
    else url.searchParams.delete('q');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

function liveOperations() {
    return getWhaleSnapshot().operations || [];
}

function addressSearchText(operation) {
    return [
        operation?.sender?.address,
        operation?.sender?.alias,
        operation?.target?.address,
        operation?.target?.alias,
        operation?.baker?.address,
        operation?.baker?.alias,
        operation?.hash,
        operation?.id,
        operation?.type
    ].filter(Boolean).join(' ').toLowerCase();
}

function matchesType(operation) {
    if (operationType === 'all') return true;
    return operation?.type === operationType;
}

function filteredLiveOperations() {
    const query = searchQuery.trim().toLowerCase();
    return liveOperations().filter((operation) => (
        (whaleOperationThresholdAmount(operation) ?? -1) >= minimumXtz * 1e6
        && matchesType(operation)
        && (!query || addressSearchText(operation).includes(query))
    ));
}

function namedEndpointSample(operations) {
    const endpoints = new Map();
    let appliedTransactions = 0;
    let labeledTransactions = 0;
    operations.forEach((operation) => {
        if (operation?.type !== 'transaction' || String(operation?.status || '').toLowerCase() !== 'applied') return;
        appliedTransactions += 1;
        let labeled = false;
        for (const account of [operation?.sender, operation?.target]) {
            if (!account?.address || !account?.alias) continue;
            labeled = true;
            endpoints.set(account.address, { address: account.address, alias: account.alias });
        }
        if (labeled) labeledTransactions += 1;
    });
    return {
        appliedTransactions,
        labeledTransactions,
        unlabeledTransactions: Math.max(0, appliedTransactions - labeledTransactions),
        endpoints: [...endpoints.values()].sort((left, right) => left.alias.localeCompare(right.alias))
    };
}

function namedEndpointReceiptsMarkup(endpoints) {
    if (!endpoints.length) return '<p>No TzKT alias appears on the endpoints in the current bounded transaction sample.</p>';
    return `<details class="whale-watch-label-receipts"><summary>Inspect ${exact(endpoints.length)} current TzKT alias receipts</summary><div>${endpoints.map(({ address, alias }) => `
        <a href="https://tzkt.io/${encodeURIComponent(address)}" target="_blank" rel="noopener" title="Inspect ${escapeHtml(alias)} on TzKT">
            <span>📛 ${escapeHtml(alias)}</span>
            <code>${escapeHtml(short(address, 10, 5))}</code>
            <small>current live-sample label</small>
        </a>`).join('')}</div></details>`;
}

function filtersMarkup({ showType = true } = {}) {
    return `
        <div class="whale-watch-filters" aria-label="Whale Watch filters">
            <label><span>Minimum</span><select id="whale-watch-minimum" data-whale-filter="minimum">
                ${[1000, 10000, 100000, 1000000].map((value) => `<option value="${value}"${minimumXtz === value ? ' selected' : ''}>${compact(value)} ꜩ</option>`).join('')}
            </select></label>
            ${showType ? `<label><span>Operation</span><select id="whale-watch-type" data-whale-filter="type">
                <option value="all"${operationType === 'all' ? ' selected' : ''}>All kinds</option>
                <option value="transaction"${operationType === 'transaction' ? ' selected' : ''}>Transfers</option>
                <option value="stake"${operationType === 'stake' ? ' selected' : ''}>Stake</option>
                <option value="unstake"${operationType === 'unstake' ? ' selected' : ''}>Unstake</option>
                <option value="delegation"${operationType === 'delegation' ? ' selected' : ''}>Delegation</option>
            </select></label>` : ''}
            <label class="whale-watch-search"><span>Find entity or receipt</span><input id="whale-watch-search" data-whale-filter="search" type="search" value="${escapeHtml(searchQuery)}" maxlength="80" autocomplete="off" placeholder="Address, alias, hash…"></label>
        </div>`;
}

function sourceStripMarkup() {
    const generatedAt = lastArtifact?.generatedAt;
    const stale = artifactError ? ' is-stale' : '';
    return `
        <div class="whale-watch-source-strip${stale}" id="whale-watch-freshness" role="status" aria-live="polite">
            <span class="whale-watch-live-dot" aria-hidden="true"></span>
            <strong>Shared archive</strong>
            <span>${generatedAt ? `generated ${escapeHtml(ageLabel(generatedAt))} · ${escapeHtml(GENERATED_PROOFBOOK_SCHEDULE_LABEL)}` : 'not yet available'}</span>
            ${lastArtifact?.transfers24h ? `<span>window ${escapeHtml(archiveWindowLabel())}</span>` : ''}
            <a href="${ARTIFACT_URL}" target="_blank" rel="noopener">JSON receipt</a>
            <span class="whale-watch-cache-state">${artifactError ? (lastArtifact ? 'Last-good retained · refresh failed' : 'Archive unavailable · refresh failed') : savedArtifact ? 'Saved snapshot · update pending' : generatedAt ? 'Generated archive verified' : 'Awaiting generated archive'}</span>
        </div>`;
}

function headerMarkup() {
    const active = VIEWS.find(({ id }) => id === currentView) || VIEWS[0];
    return `
        <header class="whale-watch-header">
            <div class="whale-watch-system-line"><span>Tezos L1</span><span>Public-source observation</span><span>No inferred ownership</span></div>
            <div class="whale-watch-title-row">
                <div><p class="whale-watch-kicker">Capital movement · account dormancy · operation receipts</p><h2 id="whale-watch-title">Whale Watch</h2><p>${escapeHtml(active.detail)}</p></div>
                <button class="whale-watch-refresh" type="button" data-whale-action="refresh" aria-label="Refresh Whale Watch data">Refresh</button>
            </div>
            <nav class="whale-watch-tabs" role="tablist" aria-label="Whale Watch views">
                ${VIEWS.map((view) => `<button id="whale-watch-tab-${view.id}" type="button" role="tab" aria-selected="${currentView === view.id}" aria-controls="whale-watch-panel-${view.id}" tabindex="${currentView === view.id ? '0' : '-1'}" data-whale-view="${view.id}">${escapeHtml(view.label)}</button>`).join('')}
            </nav>
            ${VIEWS.filter((view) => view.id !== currentView).map((view) => `<div id="whale-watch-panel-${view.id}" role="tabpanel" aria-labelledby="whale-watch-tab-${view.id}" tabindex="0" hidden inert aria-hidden="true"></div>`).join('')}
            ${sourceStripMarkup()}
        </header>`;
}

function thresholdTableMarkup(rows = []) {
    return `
        <div class="whale-watch-table-wrap"><table class="whale-watch-table">
            <thead><tr><th>Threshold</th><th>Operations</th><th>Groups</th><th>Gross observed legs</th></tr></thead>
            <tbody>${rows.map((row) => `<tr><th>≥ ${compact(row.thresholdXtz)} ꜩ</th><td>${exact(row.operationCount)}</td><td>${exact(row.operationGroupCount)}</td><td>${xtz(row.grossObservedMutez, 2)}</td></tr>`).join('')}</tbody>
        </table></div>`;
}

function largestOperationMarkup(operation) {
    if (!operation) return '<div class="whale-watch-empty">No qualifying operation receipt in this window.</div>';
    return `
        <a class="whale-watch-largest" href="${escapeHtml(receiptHref(operation.hash))}" target="_blank" rel="noopener">
            <span><small>Largest single operation</small><strong>${xtz(operation.amountMutez, 2)}</strong></span>
            <span><small>${escapeHtml(formatDate(operation.timestamp))}</small><strong>${escapeHtml(short(operation.sender))} → ${escapeHtml(short(operation.target))}</strong></span>
            <span class="whale-watch-receipt-cue">Open receipt ↗</span>
        </a>`;
}

function overviewMarkup() {
    if (!lastArtifact) return unavailableMarkup('Shared 24-hour archive is unavailable.', artifactError);
    const transfer = lastArtifact.transfers24h;
    const dormant = lastArtifact.dormant;
    const named = namedEndpointSample(liveOperations());
    return `
        <section class="whale-watch-view" id="whale-watch-panel-overview" role="tabpanel" aria-labelledby="whale-watch-tab-overview" tabindex="0">
            <div class="whale-watch-view-heading"><div><p class="whale-watch-eyebrow">Complete paged window</p><h3>Twenty-four hours, counted end to end</h3></div><p>${escapeHtml(transfer.semantics)}</p></div>
            <div class="whale-watch-metrics">
                <article><span>Applied transfers</span><strong>${exact(transfer.operationCount)}</strong><small>${exact(transfer.operationGroupCount)} operation groups</small></article>
                <article><span>Distinct endpoints</span><strong>${exact(transfer.uniqueSenders)} / ${exact(transfer.uniqueTargets)}</strong><small>senders / targets; sets may overlap</small></article>
                <article><span>Gross observed legs</span><strong>${xtz(transfer.grossObservedMutez, 2)}</strong><small>not economic volume</small></article>
                <article><span>Dormant cohort</span><strong>${exact(dormant.eligibleCount)}</strong><small>${xtz(dormant.eligibleBalanceMutez, 2)} observed holdings</small></article>
            </div>
            <div class="whale-watch-grid whale-watch-grid-overview">
                <article class="whale-watch-panel"><div class="whale-watch-panel-title"><div><span>Receipt of scale</span><h4>Largest observed operation</h4></div><span class="whale-watch-chip">Archived window</span></div>${largestOperationMarkup(transfer.largestOperation)}</article>
                <article class="whale-watch-panel"><div class="whale-watch-panel-title"><div><span>Source-native names</span><h4>TzKT-labeled endpoints</h4></div><span class="whale-watch-chip">Live tape</span></div>
                    <div class="whale-watch-endpoint-sample"><div><span>Applied transfers</span><strong>${exact(named.appliedTransactions)}</strong></div><div><span>Touching an alias</span><strong>${exact(named.labeledTransactions)}</strong></div><div><span>Distinct named endpoints</span><strong>${exact(named.endpoints.length)}</strong></div></div>
                    <p>${exact(named.unlabeledTransactions)} applied transaction rows have no endpoint alias in the bounded live sample. TzKT aliases are presented as source context only; Whale Watch does not infer exchange ownership or beneficial control.</p>
                    ${namedEndpointReceiptsMarkup(named.endpoints)}
                </article>
            </div>
            <article class="whale-watch-panel whale-watch-thresholds"><div class="whale-watch-panel-title"><div><span>Complete threshold ladder</span><h4>How the window changes with size</h4></div><span class="whale-watch-chip">TzKT</span></div>${thresholdTableMarkup(transfer.thresholds)}</article>
            <aside class="whale-watch-method"><strong>How to read this</strong><p>One operation id is one tape row. One operation-group hash can connect several related hops. Adding those hops describes observed transfer legs; it does not prove unique capital, beneficial ownership, or economic volume.</p></aside>
        </section>`;
}

function operationParties(operation) {
    const sender = getWhaleAddressLabel(operation?.sender?.address, operation?.sender?.alias);
    const targetAddress = operation?.target?.address || operation?.baker?.address;
    const targetAlias = operation?.target?.alias || operation?.baker?.alias;
    const target = targetAddress ? getWhaleAddressLabel(targetAddress, targetAlias) : { name: 'No target', icon: '—' };
    return { sender, target, senderAddress: operation?.sender?.address || '', targetAddress: targetAddress || '' };
}

function liveOperationMarkup(operation) {
    const context = getWhaleOperationContext(operation);
    const parties = operationParties(operation);
    const id = whaleOperationId(operation);
    const hash = whaleOperationGroupHash(operation);
    const amount = whaleOperationAmountPresentation(operation);
    const amountValue = amount.value === null ? '—' : xtz(amount.value, 2);
    return `
        <article class="whale-watch-tape-row" data-quiet-key="whale-watch-op-${escapeHtml(id)}">
            <div class="whale-watch-tape-kind"><span>${escapeHtml(context.emoji)}</span><strong>${escapeHtml(context.label)}</strong><small>${escapeHtml(formatDate(operation.timestamp))}</small></div>
            <div class="whale-watch-tape-amount"><strong>${amountValue}</strong><small>${escapeHtml(amount.label)} · TzKT operation ${escapeHtml(id)}</small></div>
            <div class="whale-watch-tape-flow"><span title="${escapeHtml(parties.senderAddress)}">${escapeHtml(parties.sender.icon)} ${escapeHtml(parties.sender.name)}</span><b>→</b><span title="${escapeHtml(parties.targetAddress)}">${escapeHtml(parties.target.icon)} ${escapeHtml(parties.target.name)}</span></div>
            <a href="${escapeHtml(receiptHref(hash, parties.senderAddress))}" target="_blank" rel="noopener" aria-label="Open operation ${escapeHtml(id)} receipt">Receipt ↗</a>
        </article>`;
}

function liveMarkup() {
    const operations = filteredLiveOperations();
    const snapshot = getWhaleSnapshot();
    return `
        <section class="whale-watch-view" id="whale-watch-panel-live" role="tabpanel" aria-labelledby="whale-watch-tab-live" tabindex="0">
            <div class="whale-watch-view-heading"><div><p class="whale-watch-eyebrow">Current bounded observation</p><h3>Live Tape</h3></div><p>Transfers and stake changes use the applied operation's actual amount. Delegation changes qualify by TzKT sender balance and are labeled as balance context, never tez moved. This tape is a sample, not a complete historical total.</p></div>
            ${filtersMarkup()}
            <div class="whale-watch-result-line"><span>${exact(operations.length)} matching operations</span><span>All four TzKT lanes required · last good ${escapeHtml(ageLabel(snapshot.updatedAt))}${liveError ? ' · refresh failed' : ''}</span></div>
            <div class="whale-watch-tape" id="whale-watch-live-tape">${operations.length ? operations.map(liveOperationMarkup).join('') : `<div class="whale-watch-empty">${escapeHtml(liveError || 'No operations match these filters in the bounded live sample.')}</div>`}</div>
        </section>`;
}

function artifactOperationFlow(operation) {
    const sender = operation.senderAlias || short(operation.sender);
    const target = operation.targetAlias || short(operation.target);
    return `<li data-quiet-key="flow-leg-${escapeHtml(String(operation.id || `${operation.hash}-${operation.timestamp}`))}"><span>${escapeHtml(sender)}</span><b>→</b><span>${escapeHtml(target)}</span><strong>${xtz(operation.amountMutez, 2)}</strong><small>op ${escapeHtml(String(operation.id || 'unavailable'))}</small></li>`;
}

function storySearchText(story) {
    return [story.hash, ...story.operations.flatMap((operation) => [operation.sender, operation.senderAlias, operation.target, operation.targetAlias])].filter(Boolean).join(' ').toLowerCase();
}

function flowStoryMarkup(story, rank) {
    return `
        <article class="whale-watch-story" data-quiet-key="flow-story-${escapeHtml(story.hash)}">
            <div class="whale-watch-story-head"><span class="whale-watch-story-rank">${String(rank).padStart(2, '0')}</span><div><span>${escapeHtml(formatDate(story.timestamp))}</span><h4>${story.operationCount > 1 ? `${exact(story.operationCount)} related hops` : 'Single-operation flow'}</h4></div><strong>${xtz(story.grossObservedMutez, 2)}<small>gross observed legs</small></strong></div>
            <ol>${story.operations.map(artifactOperationFlow).join('')}</ol>
            <div class="whale-watch-story-foot"><span>${story.operationCount > 1 ? 'Grouped by shared operation hash; repeated capital is possible.' : 'One operation in this group.'}</span><a href="${escapeHtml(receiptHref(story.hash))}" target="_blank" rel="noopener">Group receipt ↗</a></div>
        </article>`;
}

function flowsMarkup() {
    if (!lastArtifact) return unavailableMarkup('Shared flow stories are unavailable.', artifactError);
    const query = searchQuery.trim().toLowerCase();
    const stories = lastArtifact.transfers24h.topFlowStories.filter((story) => (
        number(story.grossObservedMutez) >= minimumXtz * 1e6
        && (!query || storySearchText(story).includes(query))
    ));
    return `
        <section class="whale-watch-view" id="whale-watch-panel-flows" role="tabpanel" aria-labelledby="whale-watch-tab-flows" tabindex="0">
            <div class="whale-watch-view-heading"><div><p class="whale-watch-eyebrow">Hash-level reconstruction</p><h3>Flow Stories</h3></div><p>Top complete-window groups. Related hops share an operation-group hash; operation ids remain distinct receipts.</p></div>
            ${filtersMarkup({ showType: false })}
            <div class="whale-watch-result-line"><span>${exact(stories.length)} published stories</span><span>Top ${exact(lastArtifact.transfers24h.topFlowStories.length)} by gross observed legs</span></div>
            <div class="whale-watch-stories">${stories.length ? stories.map(flowStoryMarkup).join('') : '<div class="whale-watch-empty">No published story matches these filters.</div>'}</div>
        </section>`;
}

function artifactAccountType(record) {
    const value = String(record.accountType || 'account').replaceAll('-', ' ');
    return value.replace(/^\w/, (character) => character.toUpperCase());
}

function dormantMarkup() {
    if (!lastArtifact) return unavailableMarkup('Shared dormant-account archive is unavailable.', artifactError);
    const query = searchQuery.trim().toLowerCase();
    const rows = lastArtifact.dormant.records.filter((record) => (
        !query || [record.address, record.alias, record.accountType, record.lastActivityLevel].filter(Boolean).join(' ').toLowerCase().includes(query)
    ));
    return `
        <section class="whale-watch-view" id="whale-watch-panel-dormant" role="tabpanel" aria-labelledby="whale-watch-tab-dormant" tabindex="0">
            <div class="whale-watch-view-heading"><div><p class="whale-watch-eyebrow">Complete large-account scan</p><h3>Deep Sleep</h3></div><p>Accounts holding at least ${compact(lastArtifact.methodology.minimumDormantBalanceXtz)} ꜩ whose TzKT last-activity timestamp is at least ${exact(lastArtifact.methodology.minimumDormantDays)} days old.</p></div>
            <div class="whale-watch-dormant-summary"><div><span>Eligible accounts</span><strong>${exact(lastArtifact.dormant.eligibleCount)}</strong></div><div><span>Observed holdings</span><strong>${xtz(lastArtifact.dormant.eligibleBalanceMutez, 2)}</strong></div><div><span>Coverage</span><strong>${lastArtifact.coverage.largeAccounts.complete ? 'Complete' : 'Partial'}</strong></div></div>
            <div class="whale-watch-filters whale-watch-dormant-filter"><label class="whale-watch-search"><span>Find account</span><input id="whale-watch-search" data-whale-filter="search" type="search" value="${escapeHtml(searchQuery)}" maxlength="80" autocomplete="off" placeholder="Address, alias, type, level…"></label></div>
            <div class="whale-watch-result-line"><span>${exact(rows.length)} displayed accounts</span><span>lastActivityTime drives dormancy · level retained as receipt</span></div>
            <div class="whale-watch-dormant-list">${rows.length ? rows.map((record, index) => `
                <a class="whale-watch-dormant-row" data-quiet-key="dormant-${escapeHtml(record.address)}" href="${escapeHtml(receiptHref('', record.address))}" target="_blank" rel="noopener">
                    <span class="whale-watch-dormant-rank">${String(index + 1).padStart(2, '0')}</span><span><small>${escapeHtml(artifactAccountType(record))}${record.labelSource ? ` · ${escapeHtml(record.labelSource)}` : ''}</small><strong>${escapeHtml(record.alias || short(record.address, 14, 6))}</strong><em>${escapeHtml(short(record.address, 14, 6))}</em></span>
                    <span><small>Observed holdings</small><strong>${xtz(record.balanceMutez, 2)}</strong></span><span><small>Quiet for</small><strong>${escapeHtml(formatDormancy(number(record.dormantDays)))}</strong></span><span><small>Last activity</small><strong>${escapeHtml(formatDate(record.lastActivityTime, false))}</strong><em>block ${exact(record.lastActivityLevel)}</em></span><b>Receipt ↗</b>
                </a>`).join('') : '<div class="whale-watch-empty">No dormant account matches this search.</div>'}</div>
        </section>`;
}

function normalizedAwakenings() {
    const shared = (lastArtifact?.awakenings || []).map((event) => ({ ...event, source: 'shared archive' }));
    const local = (getSleepingGiantsSnapshot().awakenings || []).map((event) => ({
        id: `local:${event.operation?.id || event.operation?.hash || event.address}:${event.awakenedAt}`,
        address: event.address,
        alias: event.alias || null,
        accountType: event.accountType?.id || event.type || 'account',
        balanceBeforeMutez: event.holdingBalance,
        balanceAfterMutez: null,
        dormantDays: event.dormantDays,
        awakenedAt: event.awakenedAt,
        movedAmountMutez: event.movedAmount,
        receipt: event.operation,
        source: 'local observation'
    }));
    const seen = new Set();
    return [...shared, ...local].filter((event) => {
        const key = String(event.receipt?.id || event.receipt?.hash || event.id);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    }).sort((a, b) => Date.parse(b.awakenedAt || '') - Date.parse(a.awakenedAt || ''));
}

function awakeningMarkup(event) {
    const moved = event.movedAmountMutez === null || event.movedAmountMutez === undefined
        ? 'No transfer/stake amount for this activity'
        : `${xtz(event.movedAmountMutez, 2)} moved`;
    const receipt = event.receipt || {};
    return `
        <article class="whale-watch-awakening" data-quiet-key="awakening-${escapeHtml(String(event.id || receipt.id || receipt.hash))}">
            <div><span class="whale-watch-awakening-pulse" aria-hidden="true"></span><small>${escapeHtml(event.source)} · ${escapeHtml(formatDate(event.awakenedAt))}</small><h4>${escapeHtml(moved)}</h4><p>${escapeHtml(event.alias || short(event.address, 14, 6))} became active after ${escapeHtml(formatDormancy(number(event.dormantDays)))} quiet.</p></div>
            <dl><div><dt>Account type</dt><dd>${escapeHtml(artifactAccountType(event))}</dd></div><div><dt>Holding before</dt><dd>${xtz(event.balanceBeforeMutez, 2)}</dd></div><div><dt>Operation</dt><dd>${escapeHtml(String(receipt.type || receipt.kind || 'activity'))}</dd></div></dl>
            <a href="${escapeHtml(receiptHref(receipt.hash || receipt.operationGroupHash, event.address))}" target="_blank" rel="noopener">Operation receipt ↗</a>
        </article>`;
}

function notificationMarkup() {
    const state = getAwakeningNotificationState();
    if (!state.supported) return '<div class="whale-watch-notification"><div><strong>Browser alerts unavailable</strong><span>This browser does not expose the Notifications API.</span></div></div>';
    const denied = state.permission === 'denied';
    return `
        <div class="whale-watch-notification">
            <div><strong>${state.enabled ? 'Awakening alerts enabled' : denied ? 'Awakening alerts blocked by browser' : 'Awakening alerts are off'}</strong><span>Permission is requested only when you press the button. Monitoring runs while Whale Watch or the legacy tracker is active.</span></div>
            ${state.enabled
                ? '<button type="button" data-whale-action="disable-notifications">Turn off alerts</button>'
                : `<button type="button" data-whale-action="enable-notifications"${denied ? ' disabled' : ''}>${denied ? 'Blocked in browser settings' : 'Enable browser alerts'}</button>`}
        </div>`;
}

function awakeningsMarkup() {
    if (!lastArtifact) return unavailableMarkup('Shared awakening archive is unavailable.', artifactError);
    const events = normalizedAwakenings();
    return `
        <section class="whale-watch-view" id="whale-watch-panel-awakenings" role="tabpanel" aria-labelledby="whale-watch-tab-awakenings" tabindex="0">
            <div class="whale-watch-view-heading"><div><p class="whale-watch-eyebrow">Verified post-dormancy activity</p><h3>Awakenings</h3></div><p>The trigger is the earliest applied operation after dormancy. A moved figure appears only for an applied transaction or the actual processed stake/unstake amount; balances, requests, deposits, and activation allocations are never substituted.</p></div>
            ${notificationMarkup()}
            <div class="whale-watch-result-line"><span>${exact(events.length)} awakening receipts</span><span>Shared archive plus deduplicated local observations</span></div>
            <div class="whale-watch-awakenings">${events.length ? events.map(awakeningMarkup).join('') : '<div class="whale-watch-empty whale-watch-awakenings-empty"><span>🌊</span><strong>No shared awakenings recorded</strong><p>The generated archive has not observed a qualifying dormant account become active in its retained window.</p></div>'}</div>
        </section>`;
}

function unavailableMarkup(title, error = '') {
    const local = getSleepingGiantsSnapshot();
    return `
        <section class="whale-watch-view whale-watch-unavailable" id="whale-watch-panel-${escapeHtml(currentView)}" role="tabpanel" aria-labelledby="whale-watch-tab-${escapeHtml(currentView)}" tabindex="0">
            <div><span>🌫️</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(error || 'No last-good shared artifact is available in this session.')}</p><button type="button" data-whale-action="refresh">Retry shared snapshot</button></div>
            ${local.giants.length ? `<p>A local cohort exists, but Whale Watch is withholding it here because the complete generated archive is the canonical shared source.</p>` : ''}
        </section>`;
}

function activeViewMarkup() {
    if (currentView === 'live') return liveMarkup();
    if (currentView === 'flows') return flowsMarkup();
    if (currentView === 'dormant') return dormantMarkup();
    if (currentView === 'awakenings') return awakeningsMarkup();
    return overviewMarkup();
}

function chamberMarkup() {
    return `${headerMarkup()}<main class="whale-watch-main">${activeViewMarkup()}</main><footer class="whale-watch-footer"><span>Source: complete generated TzKT archive + bounded live TzKT tape</span><span>Labels are source context, not beneficial-ownership claims.</span></footer>`;
}

function captureLiveTapeAnchor(body) {
    if (currentView !== 'live' || body.scrollTop <= 0) return null;
    const viewportTop = body.getBoundingClientRect().top;
    const rows = [...body.querySelectorAll('#whale-watch-live-tape [data-quiet-key]')];
    const row = rows.find((candidate) => candidate.getBoundingClientRect().bottom > viewportTop + 1);
    return {
        key: row?.getAttribute('data-quiet-key') || '',
        offset: row ? row.getBoundingClientRect().top - viewportTop : 0,
        scrollTop: body.scrollTop,
        scrollHeight: body.scrollHeight
    };
}

function restoreLiveTapeAnchor(body, anchor) {
    if (!anchor) return;
    const viewportTop = body.getBoundingClientRect().top;
    const row = [...body.querySelectorAll('#whale-watch-live-tape [data-quiet-key]')]
        .find((candidate) => candidate.getAttribute('data-quiet-key') === anchor.key);
    if (row) {
        body.scrollTop += row.getBoundingClientRect().top - viewportTop - anchor.offset;
        return;
    }
    body.scrollTop = anchor.scrollTop + Math.max(0, body.scrollHeight - anchor.scrollHeight);
}

function renderBody({ quiet = false } = {}) {
    const body = document.getElementById('whale-watch-body');
    if (!body) return;
    const markup = chamberMarkup();
    if (quiet && body.dataset.whaleWatchRendered === '1') {
        const tapeAnchor = captureLiveTapeAnchor(body);
        const activeInput = body.contains(document.activeElement) && document.activeElement instanceof HTMLInputElement
            ? document.activeElement
            : null;
        const inputSelection = activeInput && Number.isFinite(activeInput.selectionStart)
            ? { start: activeInput.selectionStart, end: activeInput.selectionEnd, direction: activeInput.selectionDirection }
            : null;
        quietlySyncHtml(body, markup);
        restoreLiveTapeAnchor(body, tapeAnchor);
        if (activeInput?.isConnected && inputSelection) {
            try {
                activeInput.setSelectionRange(inputSelection.start, inputSelection.end, inputSelection.direction || 'none');
            } catch { /* non-text input type */ }
        }
    } else body.innerHTML = markup;
    body.dataset.whaleWatchRendered = '1';
}

function entryFooterMarkup() {
    return document.querySelector('#whale-watch-entry-front > .chamber-entry-footer')?.outerHTML || '';
}

function entryMarkup() {
    const transfer = lastArtifact?.transfers24h;
    const dormant = lastArtifact?.dormant;
    return `
        <div class="whale-watch-entry-copy">
            <div class="whale-watch-entry-title-line"><h2 class="stat-label" id="whale-watch-entry-title">Whale Watch</h2><span class="whale-watch-entry-chip">TzKT receipts</span></div>
            <div class="stat-value whale-watch-entry-value">${transfer ? `${exact(transfer.operationCount)} large transfers` : 'Reading the deep'}</div>
            <div class="stat-description">Live tape, related flows, deep sleep, and awakenings</div>
        </div>
        <div class="whale-watch-entry-sonar" aria-hidden="true"><i></i><i></i><i></i><b>🐋</b></div>
        <div class="whale-watch-entry-metrics">
            <div><span>Largest · archive</span><strong>${transfer?.largestOperation ? xtz(transfer.largestOperation.amountMutez, 2) : 'Loading'}</strong></div>
            <div><span>Operation groups</span><strong>${transfer ? exact(transfer.operationGroupCount) : '—'}</strong></div>
            <div><span>Dormant accounts</span><strong>${dormant ? exact(dormant.eligibleCount) : '—'}</strong></div>
        </div>
        <div class="whale-watch-entry-rails"><span>Overview</span><span>Live Tape</span><span>Flow Stories</span><span>Deep Sleep</span><span>Awakenings</span></div>
        ${entryFooterMarkup()}`;
}

function ensureEntryCard() {
    const existing = document.getElementById('whale-watch-entry-card');
    if (existing) return existing;
    const grid = document.getElementById('chambers-grid');
    if (!grid) return null;
    const card = document.createElement('article');
    card.id = 'whale-watch-entry-card';
    card.className = 'stat-card chamber-entry-card chamber-entry-wide chamber-entry-live whale-watch-entry-card';
    card.dataset.chamberEntrySize = 'wide';
    card.innerHTML = `<button class="card-copy-link" type="button" data-copy-hash="#whales" aria-label="Copy Whale Watch direct link" title="Copy Whale Watch link">&#128279;</button><div class="card-inner"><div class="card-front chamber-entry-front whale-watch-entry-front" id="whale-watch-entry-front">${entryMarkup()}</div></div>`;
    grid.appendChild(card);
    return card;
}

export function updateWhaleWatchEntry({ quiet = false } = {}) {
    const front = document.getElementById('whale-watch-entry-front');
    if (!front) return;
    if (quiet || front.childNodes.length) quietlySyncHtml(front, entryMarkup());
    else front.innerHTML = entryMarkup();
    front.dataset.whaleWatchRendered = '1';
    const card = document.getElementById('whale-watch-entry-card');
    if (card) {
        card.dataset.updatedLabel = lastArtifact
            ? artifactError
                ? `Last-good archive · ${ageLabel(lastArtifact.generatedAt)} · refresh failed · ${GENERATED_PROOFBOOK_SCHEDULE_LABEL}`
                : `Archive generated ${ageLabel(lastArtifact.generatedAt)} · ${GENERATED_PROOFBOOK_SCHEDULE_LABEL}`
            : 'Archive freshness unavailable';
        card.classList.toggle('chamber-data-stale', Boolean(artifactError) || !lastArtifact);
    }
    window.syncChamberEntryFooters?.(card);
    wireEntry(card);
}

function wireEntry(card) {
    if (!card) return;
    wireChamberLauncher(card, {
        open: openWhaleChamber,
        label: 'Open Whale Watch Chamber',
        titleSelector: '#whale-watch-entry-title, .stat-label'
    });
}

function ensureOverlay() {
    let overlay = document.getElementById('whale-watch-modal');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'whale-watch-modal';
    overlay.className = 'modal-overlay chamber-overlay whale-watch-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
        <div class="modal-content modal-large chamber-content whale-watch-content" role="dialog" aria-modal="true" aria-labelledby="whale-watch-title">
            <button class="modal-close chamber-close" type="button" aria-label="Close Whale Watch Chamber">&times;</button>
            <div class="whale-watch-body" id="whale-watch-body"></div>
        </div>`;
    overlay.querySelector('.chamber-close').addEventListener('click', closeWhaleChamber);
    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) closeWhaleChamber();
    });
    bindBodyEvents(overlay.querySelector('.whale-watch-body'));
    document.body.appendChild(overlay);
    return overlay;
}

function bindBodyEvents(body) {
    if (!body || body.dataset.whaleWatchEventsWired === '1') return;
    body.dataset.whaleWatchEventsWired = '1';
    body.addEventListener('click', async (event) => {
        const viewButton = event.target.closest('[data-whale-view]');
        if (viewButton && VIEW_IDS.has(viewButton.dataset.whaleView)) {
            currentView = viewButton.dataset.whaleView;
            updateRouteState();
            renderBody();
            document.getElementById(`whale-watch-tab-${currentView}`)?.focus({ preventScroll: true });
            return;
        }
        const action = event.target.closest('[data-whale-action]')?.dataset.whaleAction;
        if (action === 'refresh') await refreshWhaleChamber({ quiet: true, forceArtifact: true });
        if (action === 'enable-notifications') {
            await requestAwakeningNotifications();
            if (getAwakeningNotificationState().enabled) {
                try {
                    await refreshSleepingGiantsData({ checkForAwakenings: false });
                    lastGiantMonitor = Date.now();
                } catch {
                    // Notification permission remains explicit even if seeding fails.
                }
            }
            renderBody({ quiet: true });
        }
        if (action === 'disable-notifications') {
            disableAwakeningNotifications();
            renderBody({ quiet: true });
        }
    });
    body.addEventListener('change', (event) => {
        const filter = event.target.dataset.whaleFilter;
        if (filter === 'minimum' && MINIMUMS.has(Number(event.target.value))) minimumXtz = Number(event.target.value);
        if (filter === 'type' && FILTER_TYPES.has(event.target.value)) operationType = event.target.value;
        if (filter) {
            updateRouteState();
            renderBody({ quiet: true });
        }
    });
    body.addEventListener('input', (event) => {
        if (event.target.dataset.whaleFilter !== 'search') return;
        searchQuery = event.target.value.slice(0, 80);
        updateRouteState();
        renderBody({ quiet: true });
    });
    body.addEventListener('keydown', (event) => {
        const tab = event.target.closest('[role="tab"][data-whale-view]');
        if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const index = VIEWS.findIndex(({ id }) => id === tab.dataset.whaleView);
        let next = index;
        if (event.key === 'ArrowLeft') next = (index - 1 + VIEWS.length) % VIEWS.length;
        if (event.key === 'ArrowRight') next = (index + 1) % VIEWS.length;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = VIEWS.length - 1;
        currentView = VIEWS[next].id;
        updateRouteState();
        renderBody();
        document.getElementById(`whale-watch-tab-${currentView}`)?.focus({ preventScroll: true });
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
    document.body.style.overflow = savedBodyOverflow;
    document.documentElement.style.overflow = savedHtmlOverflow || '';
    savedBodyOverflow = null;
    savedHtmlOverflow = null;
}

async function monitorAwakeningsIfEnabled() {
    if (!getAwakeningNotificationState().enabled || Date.now() - lastGiantMonitor < GIANT_MONITOR_MS) return;
    try {
        await refreshSleepingGiantsData({ checkForAwakenings: true });
        lastGiantMonitor = Date.now();
    } catch {
        // The generated shared archive remains the visible last-good source.
    }
}

export async function refreshWhaleChamber({ quiet = true, forceArtifact = false, initial = false } = {}) {
    const initialPaint = initial && !lastArtifact;
    const mayRender = () => document.visibilityState === 'visible'
        || (initialPaint && document.getElementById('whale-watch-modal')?.classList.contains('active'));
    if (!mayRender()) {
        refreshDeferred = true;
        return { artifact: lastArtifact, live: getWhaleSnapshot() };
    }
    if (chamberRefreshWork) {
        // A user-requested archive retry must not disappear behind an ordinary
        // live-tape tick. Coalesce simultaneous retries into one follow-up.
        if (!forceArtifact || activeForcedRefresh) return chamberRefreshWork;
        if (!queuedForcedRefresh) {
            queuedForcedRefresh = chamberRefreshWork.then(() => refreshWhaleChamber({ quiet: true, forceArtifact: true }))
                .finally(() => { queuedForcedRefresh = null; });
        }
        return queuedForcedRefresh;
    }
    activeForcedRefresh = forceArtifact;
    chamberRefreshWork = (async () => {
        // The generated archive has its own clock and must not wait for live APIs.
        const artifactPromise = fetchWhaleArtifact({ force: forceArtifact }).catch(() => lastArtifact).then((artifact) => {
            // Split the requested first paint only; background catch-ups still
            // reconcile once, after the live lanes have settled below.
            if (!initial) return artifact;
            if (!mayRender()) { refreshDeferred = true; return artifact; }
            if (document.visibilityState === 'visible') updateWhaleWatchEntry({ quiet: true });
            if (document.getElementById('whale-watch-modal')?.classList.contains('active')) renderBody({ quiet: true });
            return artifact;
        });
        const livePromise = document.visibilityState !== 'visible' ? Promise.resolve(getWhaleSnapshot())
            : refreshWhaleData({ initial: liveOperations().length === 0 })
            .then((snapshot) => {
                liveError = '';
                return snapshot;
            })
            .catch((error) => {
                liveError = error?.message || String(error);
                return getWhaleSnapshot();
            });
        const monitor = document.visibilityState === 'visible' ? monitorAwakeningsIfEnabled() : null;
        const [artifact, live] = await Promise.all([artifactPromise, livePromise, monitor]).then(([shared, tape]) => [shared, tape]);
        refreshDeferred = document.visibilityState !== 'visible';
        if (document.visibilityState === 'visible') {
            publishWhaleWatchArtifactState();
            updateWhaleWatchEntry({ quiet: true });
            if (document.getElementById('whale-watch-modal')?.classList.contains('active')) renderBody({ quiet: true });
        }
        return { artifact, live };
    })().finally(() => { chamberRefreshWork = null; activeForcedRefresh = false; });
    return chamberRefreshWork;
}

function stopRefreshTimer() {
    if (refreshTimer) window.clearInterval(refreshTimer);
    refreshTimer = null;
}

function startRefreshTimer() {
    stopRefreshTimer();
    refreshTimer = window.setInterval(() => {
        if (document.visibilityState !== 'visible') {
            refreshDeferred = true;
            return;
        }
        refreshWhaleChamber({ quiet: true });
    }, number(window.__WHALE_WATCH_REFRESH_MS__, LIVE_REFRESH_MS));
}

function bindVisibilityRefresh() {
    if (visibilityReady) return;
    visibilityReady = true;
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;
        const open = document.getElementById('whale-watch-modal')?.classList.contains('active');
        if (!refreshDeferred && !open) return;
        refreshDeferred = false;
        refreshWhaleChamber({ quiet: true });
    });
}

export async function openWhaleChamber(requestedView = '', { isCurrent = () => true } = {}) {
    if (!isCurrent()) return;
    bindVisibilityRefresh();
    const opening = ++openEpoch;
    const cached = !lastArtifact ? snapshotCache.read() : null;
    await ensureWhaleCss();
    if (!isCurrent()) return;
    if (opening !== openEpoch) return;
    readRouteState();
    const normalizedView = requestedView === 'giants' ? 'dormant' : requestedView;
    if (VIEW_IDS.has(normalizedView)) currentView = normalizedView;
    else if (window.location.hash === '#giants') currentView = 'dormant';
    else if (window.location.hash === '#whales' && !isWhaleRoute()) currentView = 'overview';
    const overlay = ensureOverlay();
    const body = overlay.querySelector('.whale-watch-body');
    if (!overlay.classList.contains('active')) {
        whaleWatchFocusedBeforeOpen = document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
    }
    overlay.classList.add('active');
    lockPageScroll();
    renderBody();
    body.scrollTop = 0;
    activateChamberDialog(overlay, {
        close: closeWhaleChamber,
        dialogSelector: '.whale-watch-content',
        titleId: 'whale-watch-title',
        label: 'Whale Watch Chamber',
        initialFocusSelector: '.chamber-close'
    });
    const retained = await cached;
    if (opening !== openEpoch || !overlay.classList.contains('active')) return;
    if (!lastArtifact && retained) {
        lastArtifact = retained.snapshot;
        savedArtifact = true;
        renderBody({ quiet: true });
    }
    await refreshWhaleChamber({ quiet: true, forceArtifact: savedArtifact || !lastArtifact, initial: true });
    if (!isCurrent() || !overlay.classList.contains('active')) return;
    if (opening === openEpoch && overlay.classList.contains('active')) startRefreshTimer();
}

export function closeWhaleChamber({ preserveRoute = false } = {}) {
    const overlay = document.getElementById('whale-watch-modal');
    if (!requestChamberClose(overlay)) return;
    openEpoch += 1;
    stopRefreshTimer();
    overlay?.classList.remove('active');
    deactivateChamberDialog(overlay, { restoreFocus: !preserveRoute });
    unlockPageScroll();
    const remembered = whaleWatchFocusedBeforeOpen;
    const isVisibleFocusTarget = (element) => Boolean(
        element?.isConnected
        && element !== document.body
        && element.getClientRects().length
        && getComputedStyle(element).visibility !== 'hidden'
    );
    const focusTarget = [
        remembered,
        findChamberLauncher('#whale-watch-entry-card'),
        document.getElementById('features-gear'),
        document.getElementById('whale-toggle')
    ].find(isVisibleFocusTarget) || null;
    whaleWatchFocusedBeforeOpen = null;
    if (!preserveRoute) leaveWhaleRoute();
    if (!preserveRoute && focusTarget) {
        requestAnimationFrame(() => requestAnimationFrame(() => {
            if (isVisibleFocusTarget(focusTarget)) focusTarget.focus({ preventScroll: true });
        }));
    }
}

export function initWhaleChamber() {
    ensureWhaleCss().catch((error) => console.warn('Whale Watch styles unavailable', error));
    bindVisibilityRefresh();
    const card = ensureEntryCard();
    wireEntry(card);
    window.openWhaleChamber = openWhaleChamber;
    window.closeWhaleChamber = closeWhaleChamber;
    if (lastArtifact) updateWhaleWatchEntry();
    else if (document.visibilityState === 'visible') {
        fetchWhaleArtifact()
            .catch(() => null)
            .then(() => {
                if (document.visibilityState === 'visible') updateWhaleWatchEntry({ quiet: true });
                else refreshDeferred = true;
            });
    } else refreshDeferred = true;
}
