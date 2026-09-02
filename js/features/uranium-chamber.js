/**
 * Uranium Chamber
 *
 * A receipt-backed xU3O8 and uranium-market surface. Heavy source collection
 * remains generator-side; the browser reads bounded, integrity-checked
 * first-party artifacts and quietly reconciles them without moving the reader.
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
    focusChamberTab,
    wireChamberLauncher
} from '../ui/chamber-accessibility.js';
import { ensureChamberStylesheet } from '../ui/chamber-styles.js';

const snapshotCache = createChamberSnapshotCache({
    key: 'uranium', validateSnapshot, validateSummary: validateEntrySummary,
    receiptFor: (summary) => summary.source
});

const URANIUM_CSS_URL = versionedAsset('/css/uranium-chamber.min.css');
const MARKET_ROOM_CSS_URL = versionedAsset('/css/market-room.min.css');
const URANIUM_SNAPSHOT_URL = '/data/uranium-snapshot.json';
const URANIUM_ENTRY_SUMMARY_URL = '/data/uranium-entry-summary.json';
const KRAKEN_WS_URL = 'wss://ws.kraken.com/v2';
const DEFAULT_REFRESH_MS = 5 * 60 * 1000;
const DEFAULT_KRAKEN_RECONNECT_MS = 30 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_AFTER_MS = 8 * 60 * 60 * 1000;

const TOKEN_CONTRACT = '0x79052Ab3C166D4899a1e0DD033aC3b379AF0B1fD';
const APP_CONTRACT = '0xF02B8aE0D525157797414953103F67D9d4Ee6F0a';

const VIEWS = Object.freeze([
    { id: 'overview', label: 'Core Sample', title: 'Core Sample', detail: 'The token, the physical claim, the current market, and the boundaries between them.' },
    { id: 'markets', label: 'Markets', title: 'Market Reactor', detail: 'Kraken price discovery, attributed venue context, and a non-executable uranium reference kept on separate clocks.' },
    { id: 'onchain', label: 'On-chain', title: 'Etherlink Ledger', detail: 'Indexed addresses, token supply, bounded transfer receipts, and disclosed contract controls.' },
    { id: 'proofbook', label: 'Proofbook', title: 'Proofbook', detail: 'Custody statements, cross-source arithmetic, rights, caveats, freshness, and every public receipt.' }
]);
const VIEW_IDS = new Set(VIEWS.map(({ id }) => id));
const SOURCE_STATUS_LABELS = Object.freeze({
    krakenMarket: 'Kraken market',
    krakenListing: 'Kraken listing',
    coinGecko: 'CoinGecko',
    blockscoutToken: 'Etherlink token',
    blockscoutContracts: 'contract lineage',
    etherlinkRpc: 'Etherlink RPC',
    defiLlama: 'DefiLlama',
    uraniumOracle: 'uranium reference',
    uraniumIssuer: 'issuer terms',
    proofOfReserves: 'custody statement'
});

const RANGES = Object.freeze([
    { id: '24H', label: '24H', days: 1, source: 'kraken', intervalMinutes: 5 },
    { id: '7D', label: '7D', days: 7, source: 'kraken', intervalMinutes: 15 },
    { id: '30D', label: '30D', days: 30, source: 'coinGecko', intervalMinutes: 1440 },
    { id: '90D', label: '90D', days: 90, source: 'coinGecko', intervalMinutes: 1440 },
    { id: '1Y', label: '1Y', days: 365, source: 'coinGecko', intervalMinutes: 1440 }
]);
const RANGE_BY_ID = new Map(RANGES.map((range) => [range.id, range]));

let currentView = 'overview';
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
let liveKrakenMarket = null;
let liveKrakenError = '';
let krakenSocket = null;
let krakenHistorySocket = null;
let krakenReconnectTimer = null;
let krakenHistoryReconnectTimer = null;
let krakenReconcileTimer = null;
let chamberTimer = null;
let visibilityReady = false;
let refreshDeferred = false;
let entryRefreshDeferred = false;
let savedBodyOverflow = null;
let savedHtmlOverflow = null;
const chartLookupState = new Map();
const chartSeriesRegistry = new Map();

function numeric(value) {
    if (value === null || value === undefined || value === '') return null;
    const normalized = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(normalized) ? normalized : null;
}

function stableJsonValue(value) {
    if (Array.isArray(value)) return value.map(stableJsonValue);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableJsonValue(value[key])]));
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

function formatUsd(value, { compact = false, digits = null } = {}) {
    const number = numeric(value);
    if (number === null) return 'Unavailable';
    if (compact && Math.abs(number) >= 1000) return `$${formatCompact(number, 2)}`;
    const maximumFractionDigits = digits ?? (Math.abs(number) < 1 ? 4 : 2);
    return number.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits
    });
}

function formatPct(value, { signed = false } = {}) {
    const number = numeric(value);
    if (number === null) return 'Unavailable';
    return `${signed && number > 0 ? '+' : ''}${number.toFixed(2)}%`;
}

function formatDate(value) {
    const timestamp = Date.parse(value || '');
    if (!Number.isFinite(timestamp)) return 'Unavailable';
    return new Date(timestamp).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC'
    });
}

function formatTimestamp(value) {
    const timestamp = Date.parse(value || '');
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
    const timestamp = Date.parse(value || '');
    if (!Number.isFinite(timestamp)) return 'freshness unavailable';
    const elapsed = Math.max(0, Date.now() - timestamp);
    if (elapsed < 60 * 1000) return 'under 1m ago';
    if (elapsed < 60 * 60 * 1000) return `${Math.floor(elapsed / (60 * 1000))}m ago`;
    if (elapsed < DAY_MS) return `${Math.floor(elapsed / (60 * 60 * 1000))}h ago`;
    return `${Math.floor(elapsed / DAY_MS)}d ago`;
}

function truncate(value, head = 8, tail = 6) {
    const text = String(value || '');
    return text.length <= head + tail + 1 ? text : `${text.slice(0, head)}…${text.slice(-tail)}`;
}

function safeExternalUrl(value) {
    try {
        const url = new URL(String(value || ''));
        return url.protocol === 'https:' ? url.href : '';
    } catch {
        return '';
    }
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

function statusClass(status) {
    if (status === 'ok' || status === 'online' || status === 'current') return 'is-good';
    if (status === 'stale' || status === 'partial' || status === 'review') return 'is-warn';
    return 'is-bad';
}

function sourceReceiptFor(snapshot, id) {
    const full = snapshot?.sources?.[id];
    if (full && typeof full === 'object') return full;
    const projected = snapshot?.sourceStatuses?.[id];
    return projected && typeof projected === 'object' ? projected : {};
}

function sourceStatus(snapshot, id) {
    return firstText(sourceReceiptFor(snapshot, id).status, 'unavailable');
}

function sourceInventory(snapshot) {
    const inventory = snapshot?.sources || snapshot?.sourceStatuses || {};
    return Object.entries(inventory).map(([id, receipt]) => ({
        id,
        label: firstText(receipt?.label, SOURCE_STATUS_LABELS[id], id),
        status: firstText(receipt?.status, 'unavailable')
    }));
}

function issuerReceiptLink(value, label = 'Issuer receipt') {
    const url = safeExternalUrl(value);
    return url ? ` <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)} ↗</a>` : '';
}

function issuerTermsModel(snapshot) {
    const terms = snapshot?.identity?.terms || {};
    const ownership = terms.ownership || {};
    const custody = terms.custody || {};
    const redemption = terms.redemption || {};
    const fees = terms.fees || {};
    const rights = terms.rights || {};
    const priceDiscovery = terms.priceDiscovery || {};
    const deniedRights = [
        rights.equityRights === false || rights.equity === false ? 'equity' : '',
        rights.governanceRights === false || rights.governance === false ? 'governance' : '',
        rights.votingRights === false || rights.voting === false ? 'voting' : ''
    ].filter(Boolean);
    return {
        ownershipDescription: firstText(
            ownership.issuerDescription,
            ownership.currentSemantics,
            ownership.kind,
            'Current issuer ownership semantics are unavailable in this snapshot.'
        ),
        ownershipReceipt: firstText(ownership.receipts?.at?.(-1), ownership.receipt),
        trustee: firstText(custody.trusteeAccount, 'the disclosed trustee account'),
        storageOperator: firstText(custody.storageOperator, 'the disclosed storage operator'),
        custodyReceipt: firstText(custody.receipt),
        redemptionCondition: firstText(
            redemption.condition,
            redemption.retailPhysicalDelivery === false
                ? 'Issuer terms do not offer ordinary retail physical delivery.'
                : 'Current issuer redemption terms are unavailable in this snapshot.'
        ),
        redemptionReceipt: firstText(redemption.receipt),
        feeCeilingPct: firstNumeric(fees.custodyAndAdministrationMaximumAnnualPct, fees.maximumAnnualPct),
        feeCurrentlyCharged: firstNumeric(fees.currentlyCharged),
        feeStatusNote: firstText(fees.currentStatusNote, 'The currently charged rate is not confirmed by this snapshot.'),
        feeReceipt: firstText(fees.receipt),
        deniedRights,
        profitSharing: rights.profitSharingRights ?? rights.profitSharing ?? null,
        rightsReceipt: firstText(rights.receipt),
        rightsNote: firstText(rights.note),
        formalPeg: priceDiscovery.formalPeg,
        priceReceipt: firstText(priceDiscovery.receipt),
        caveat: firstText(terms.caveat, 'Issuer descriptions are not independent legal conclusions.')
    };
}

function issuerRightsSummary(terms) {
    const denied = terms.deniedRights;
    const deniedText = denied.length
        ? `The issuer whitepaper states that ${denied.length === 1 ? denied[0] : `${denied.slice(0, -1).join(', ')}, and ${denied.at(-1)}`} rights are not provided.`
        : 'This snapshot does not contain an equally direct issuer statement about equity, governance, or voting rights.';
    const profitText = terms.profitSharing === null
        ? 'No profit-sharing right is asserted because this snapshot lacks an equally direct receipt.'
        : terms.profitSharing === false
            ? 'The issuer receipt states that no profit-sharing right is provided.'
            : 'The issuer receipt describes a profit-sharing right; consult the current terms before relying on it.';
    return `${deniedText} ${profitText}`;
}

function directionClass(value) {
    const number = numeric(value);
    if (number === null || Math.abs(number) < .005) return 'is-flat';
    return number > 0 ? 'is-positive' : 'is-negative';
}

function ensureUraniumCss() {
    return Promise.all([
        ensureChamberStylesheet('uranium-chamber-css', URANIUM_CSS_URL),
        ensureChamberStylesheet('market-room-css', MARKET_ROOM_CSS_URL)
    ]);
}

async function validateSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object' || snapshot.schemaVersion !== 1) {
        throw new Error('Uranium snapshot schemaVersion 1 is required.');
    }
    if (!Number.isFinite(Date.parse(snapshot.generatedAt || ''))
        || !/^[0-9a-f]{64}$/.test(snapshot.contentHash || '')
        || snapshot.identity?.tokenContract?.toLowerCase() !== TOKEN_CONTRACT.toLowerCase()
        || firstText(snapshot.identity?.appContract, snapshot.identity?.companionAppContract).toLowerCase() !== APP_CONTRACT.toLowerCase()
        || !snapshot.market?.coin
        || !snapshot.market?.kraken
        || !snapshot.physical?.proof
        || !snapshot.chain?.token
        || !snapshot.sources) {
        throw new Error('Uranium snapshot is missing required market, physical, chain, or receipt sections.');
    }
    const { contentHash, ...unsigned } = snapshot;
    const actualHash = await sha256Text(JSON.stringify(stableJsonValue(unsigned)));
    if (actualHash.toLowerCase() !== contentHash.toLowerCase()) {
        throw new Error('Uranium snapshot failed its SHA-256 integrity receipt.');
    }
    return snapshot;
}

async function validateEntrySummary(summary) {
    if (!summary || typeof summary !== 'object' || summary.schemaVersion !== 1) {
        throw new Error('Uranium entry summary schemaVersion 1 is required.');
    }
    if (!Number.isFinite(Date.parse(summary.generatedAt || ''))
        || !/^[0-9a-f]{64}$/.test(summary.contentHash || '')
        || summary.source?.path !== 'data/uranium-snapshot.json'
        || summary.source?.schemaVersion !== 1
        || summary.source?.generatedAt !== summary.generatedAt
        || !/^[0-9a-f]{64}$/.test(summary.source?.contentHash || '')
        || !/^[0-9a-f]{64}$/.test(summary.source?.fileSha256 || '')
        || summary.identity?.tokenContract?.toLowerCase() !== TOKEN_CONTRACT.toLowerCase()
        || !summary.market?.coin
        || !summary.market?.kraken
        || !summary.physical?.proof
        || !summary.chain?.token) {
        throw new Error('Uranium entry summary is missing its projection receipt or launcher fields.');
    }
    const { contentHash, ...unsigned } = summary;
    const actualHash = await sha256Text(JSON.stringify(stableJsonValue(unsigned)));
    if (actualHash.toLowerCase() !== contentHash.toLowerCase()) {
        throw new Error('Uranium entry summary failed its SHA-256 integrity receipt.');
    }
    return summary;
}

function fetchUraniumSnapshot(summary = lastEntrySummary) {
    if (activeFetch) return activeFetch;
    const sourceReceipt = summary?.source || null;
    activeFetch = fetch(URANIUM_SNAPSHOT_URL, { cache: 'no-cache', headers: { Accept: 'application/json' } })
        .then(async (response) => {
            if (!response.ok) throw new Error(`Uranium snapshot HTTP ${response.status}`);
            const sourceText = await response.text();
            let snapshot;
            try {
                snapshot = JSON.parse(sourceText);
            } catch {
                throw new Error('Uranium snapshot is not valid JSON.');
            }
            await validateSnapshot(snapshot);
            await assertSnapshotMatchesProjection(snapshot, sourceText, sourceReceipt, { label: 'Uranium snapshot' });
            void snapshotCache.save(sourceText, summary);
            return snapshot;
        })
        .finally(() => { activeFetch = null; });
    return activeFetch;
}

function fetchUraniumEntrySummary() {
    if (activeEntryFetch) return activeEntryFetch;
    activeEntryFetch = fetch(URANIUM_ENTRY_SUMMARY_URL, { cache: 'no-cache', headers: { Accept: 'application/json' } })
        .then((response) => {
            if (!response.ok) throw new Error(`Uranium entry summary HTTP ${response.status}`);
            return response.json();
        })
        .then(validateEntrySummary)
        .finally(() => { activeEntryFetch = null; });
    return activeEntryFetch;
}

function uraniumSnapshotHash(summary) {
    return String(summary?.source?.contentHash || '').toLowerCase();
}

async function resolveUraniumSnapshotRefresh() {
    let summary = lastEntrySummary;

    if (lastSnapshot || !summary || lastRefreshError) {
        try {
            summary = await fetchUraniumEntrySummary();
            lastEntrySummary = summary;
        } catch (error) {
            if (lastSnapshot) throw error;
            console.warn('Uranium summary poll failed during open; trying the complete snapshot:', error);
            summary = null;
        }
    }

    const projectedHash = uraniumSnapshotHash(summary);
    const loadedHash = String(lastSnapshot?.contentHash || '').toLowerCase();
    if (lastSnapshot && projectedHash && projectedHash === loadedHash) {
        return { snapshot: lastSnapshot, changed: false };
    }
    if (lastSnapshot && projectedHash) {
        const projectedAt = Date.parse(summary?.source?.generatedAt || summary?.generatedAt || '');
        const loadedAt = Date.parse(lastSnapshot.generatedAt || '');
        if (!Number.isFinite(projectedAt) || !Number.isFinite(loadedAt) || projectedAt <= loadedAt) {
            throw new Error('Uranium launcher projection is not newer than the loaded snapshot; retaining last-good data.');
        }
    }

    return { snapshot: await fetchUraniumSnapshot(summary), changed: true };
}

function krakenWebSocketAllowed() {
    if (typeof WebSocket !== 'function') return false;
    const policy = document.querySelector('meta[http-equiv="Content-Security-Policy" i]')?.content || '';
    if (!policy) return true;
    const connectSource = policy.split(';').map((part) => part.trim()).find((part) => part.startsWith('connect-src')) || '';
    return connectSource.includes('wss://ws.kraken.com') || /(?:^|\s)\*(?:\s|$)/.test(connectSource);
}

function krakenReconnectInterval() {
    const override = numeric(window.__URANIUM_KRAKEN_RECONNECT_MS__);
    return override !== null && override >= 1000 ? override : DEFAULT_KRAKEN_RECONNECT_MS;
}

function normalizeKrakenSocketCandle(row) {
    const timestamp = firstText(row?.interval_begin, row?.timestamp);
    return {
        date: timestamp.slice(0, 10),
        timestamp,
        openUsd: firstNumeric(row?.open),
        highUsd: firstNumeric(row?.high),
        lowUsd: firstNumeric(row?.low),
        closeUsd: firstNumeric(row?.close),
        vwapUsd: firstNumeric(row?.vwap),
        volume: firstNumeric(row?.volume),
        trades: firstNumeric(row?.trades)
    };
}

function reconcileLiveKrakenDom() {
    krakenReconcileTimer = null;
    if (!lastSnapshot || document.visibilityState !== 'visible') return;
    updateEntry(lastSnapshot, { quiet: true });
    if (document.getElementById('uranium-modal')?.classList.contains('active')) {
        renderBody(lastSnapshot, { quiet: true });
    }
}

function scheduleLiveKrakenReconcile() {
    if (krakenReconcileTimer || document.visibilityState !== 'visible') return;
    krakenReconcileTimer = window.setTimeout(reconcileLiveKrakenDom, 200);
}

function retainKrakenSocketError(message) {
    liveKrakenError = firstText(message, 'Kraken WebSocket unavailable.');
    if (liveKrakenMarket) {
        liveKrakenMarket = { ...liveKrakenMarket, status: 'stale', checkedAt: new Date().toISOString(), error: liveKrakenError };
        scheduleLiveKrakenReconcile();
    }
}

function retainKrakenHistoryError(message) {
    liveKrakenMarket = {
        ...(liveKrakenMarket || {}),
        intervalStatuses: { ...(liveKrakenMarket?.intervalStatuses || {}), 15: 'stale' },
        historyError: firstText(message, 'Kraken 15-minute history unavailable.'),
        checkedAt: new Date().toISOString()
    };
    scheduleLiveKrakenReconcile();
}

function ingestKrakenSocketMessage(message) {
    if (!message || typeof message !== 'object') return false;
    if (message.success === false) {
        retainKrakenSocketError(firstText(message.error, 'Kraken subscription failed.'));
        return false;
    }
    if (!['ticker', 'ohlc'].includes(message.channel) || !Array.isArray(message.data)) return false;
    const checkedAt = new Date().toISOString();
    if (message.channel === 'ticker') {
        const row = message.data.find((item) => item?.symbol === 'XU3O8/USD') || message.data[0];
        if (!row) return false;
        const volume24hTokens = firstNumeric(row.volume);
        const vwapUsd24h = firstNumeric(row.vwap);
        liveKrakenMarket = {
            ...(liveKrakenMarket || {}),
            status: 'ok',
            checkedAt,
            error: '',
            ticker: {
                observedAt: firstText(row.timestamp, checkedAt),
                lastUsd: firstNumeric(row.last),
                lastPriceUsd: firstNumeric(row.last),
                highUsd24h: firstNumeric(row.high),
                lowUsd24h: firstNumeric(row.low),
                vwapUsd24h,
                volume24h: volume24hTokens,
                volume24hTokens,
                volume24hUsd: volume24hTokens !== null && vwapUsd24h !== null ? volume24hTokens * vwapUsd24h : null,
                change24hPct: firstNumeric(row.change_pct),
                trades24h: firstNumeric(row.trades),
                askUsd: firstNumeric(row.ask),
                bidUsd: firstNumeric(row.bid)
            }
        };
        liveKrakenError = '';
    } else {
        const nextByInterval = { ...(liveKrakenMarket?.ohlcByInterval || {}) };
        const intervalStatuses = { ...(liveKrakenMarket?.intervalStatuses || {}) };
        for (const row of message.data.filter((item) => item?.symbol === 'XU3O8/USD' || !item?.symbol)) {
            const candle = normalizeKrakenSocketCandle(row);
            const interval = String(firstNumeric(row?.interval, 5));
            if (!candle.timestamp || candle.closeUsd === null) continue;
            intervalStatuses[interval] = 'ok';
            const previous = Array.isArray(nextByInterval[interval]) ? [...nextByInterval[interval]] : [];
            const existingIndex = previous.findIndex((item) => item.timestamp === candle.timestamp);
            if (existingIndex >= 0) previous[existingIndex] = candle;
            else previous.push(candle);
            previous.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
            nextByInterval[interval] = previous.slice(-720);
        }
        liveKrakenMarket = {
            ...(liveKrakenMarket || {}),
            status: 'ok',
            checkedAt,
            error: '',
            ohlcByInterval: nextByInterval,
            intervalStatuses
        };
        liveKrakenError = '';
    }
    scheduleLiveKrakenReconcile();
    return true;
}

function stopKrakenStream({ reconnect = false } = {}) {
    if (krakenReconnectTimer) window.clearTimeout(krakenReconnectTimer);
    if (krakenHistoryReconnectTimer) window.clearTimeout(krakenHistoryReconnectTimer);
    krakenReconnectTimer = null;
    krakenHistoryReconnectTimer = null;
    if (krakenReconcileTimer) window.clearTimeout(krakenReconcileTimer);
    krakenReconcileTimer = null;
    const sockets = [krakenSocket, krakenHistorySocket].filter(Boolean);
    krakenSocket = null;
    krakenHistorySocket = null;
    for (const socket of sockets) {
        socket.__uraniumIntentionalClose = !reconnect;
        if (socket.readyState === WebSocket.CONNECTING) continue;
        try { socket.close(1000, 'Uranium Chamber paused'); } catch { /* already closed */ }
    }
}

function krakenStreamAllowed() {
    return krakenWebSocketAllowed()
        && document.visibilityState === 'visible'
        && document.getElementById('uranium-modal')?.classList.contains('active');
}

function startKrakenPrimaryStream() {
    if (!krakenStreamAllowed()
        || krakenSocket?.readyState === WebSocket.OPEN
        || krakenSocket?.readyState === WebSocket.CONNECTING) return;
    const socket = new WebSocket(KRAKEN_WS_URL);
    krakenSocket = socket;
    socket.addEventListener('open', () => {
        if (socket !== krakenSocket || !krakenStreamAllowed()) {
            socket.__uraniumIntentionalClose = true;
            try { socket.close(1000, 'Uranium Chamber paused'); } catch { /* already closed */ }
            return;
        }
        socket.send(JSON.stringify({ method: 'subscribe', params: { channel: 'ticker', symbol: ['XU3O8/USD'], event_trigger: 'bbo', snapshot: true }, req_id: 1 }));
        socket.send(JSON.stringify({ method: 'subscribe', params: { channel: 'ohlc', symbol: ['XU3O8/USD'], interval: 5, snapshot: true }, req_id: 2 }));
    });
    socket.addEventListener('message', (event) => {
        if (socket !== krakenSocket) return;
        try {
            ingestKrakenSocketMessage(JSON.parse(event.data));
        } catch {
            retainKrakenSocketError('Kraken WebSocket returned an unreadable update.');
        }
    });
    socket.addEventListener('error', () => retainKrakenSocketError('Kraken WebSocket connection failed.'));
    socket.addEventListener('close', () => {
        if (socket !== krakenSocket) return;
        krakenSocket = null;
        if (socket.__uraniumIntentionalClose) return;
        retainKrakenSocketError('Kraken WebSocket disconnected; retaining the last good quote.');
        if (krakenStreamAllowed()) {
            krakenReconnectTimer = window.setTimeout(startKrakenPrimaryStream, krakenReconnectInterval());
        }
    });
}

function startKrakenHistoryStream() {
    if (!krakenStreamAllowed()
        || krakenHistorySocket?.readyState === WebSocket.OPEN
        || krakenHistorySocket?.readyState === WebSocket.CONNECTING) return;
    const socket = new WebSocket(KRAKEN_WS_URL);
    krakenHistorySocket = socket;
    socket.addEventListener('open', () => {
        if (socket !== krakenHistorySocket || !krakenStreamAllowed()) {
            socket.__uraniumIntentionalClose = true;
            try { socket.close(1000, 'Uranium Chamber paused'); } catch { /* already closed */ }
            return;
        }
        socket.send(JSON.stringify({ method: 'subscribe', params: { channel: 'ohlc', symbol: ['XU3O8/USD'], interval: 15, snapshot: true }, req_id: 3 }));
    });
    socket.addEventListener('message', (event) => {
        if (socket !== krakenHistorySocket) return;
        try {
            const message = JSON.parse(event.data);
            if (message?.success === false) {
                retainKrakenHistoryError(firstText(message.error, 'Kraken 15-minute history subscription failed.'));
                return;
            }
            ingestKrakenSocketMessage(message);
        } catch {
            retainKrakenHistoryError('Kraken 15-minute history returned an unreadable update.');
        }
    });
    socket.addEventListener('error', () => retainKrakenHistoryError('Kraken 15-minute history connection failed.'));
    socket.addEventListener('close', () => {
        if (socket !== krakenHistorySocket) return;
        krakenHistorySocket = null;
        if (socket.__uraniumIntentionalClose) return;
        retainKrakenHistoryError('Kraken 15-minute history disconnected; retaining the last good chart.');
        if (krakenStreamAllowed()) {
            krakenHistoryReconnectTimer = window.setTimeout(startKrakenHistoryStream, krakenReconnectInterval());
        }
    });
}

function startKrakenStream() {
    if (!krakenStreamAllowed()) return;
    startKrakenPrimaryStream();
    startKrakenHistoryStream();
}

function coinModel(snapshot) {
    const coin = snapshot?.market?.coin || {};
    const ticker = snapshot?.market?.kraken?.ticker || {};
    return {
        price: firstNumeric(coin.currentPriceUsd, coin.priceUsd, ticker.lastPriceUsd, ticker.last),
        change24h: firstNumeric(coin.change24hPct, coin.priceChange24hPct, ticker.change24hPct),
        volume24h: firstNumeric(coin.volume24hUsd, coin.totalVolumeUsd, ticker.volume24hUsd),
        marketCap: firstNumeric(coin.marketCapUsd, coin.marketCap),
        updatedAt: firstText(coin.lastUpdated, coin.observedAt, ticker.observedAt, snapshot?.market?.clock?.observedAt)
    };
}

function krakenModel(snapshot) {
    const generated = snapshot?.market?.kraken || {};
    const live = liveKrakenMarket;
    const generatedIntervals = {
        ...(generated.ohlcByInterval || {}),
        ...(Array.isArray(generated.ohlc5m) ? { 5: generated.ohlc5m } : {}),
        ...(Array.isArray(generated.ohlc15m) ? { 15: generated.ohlc15m } : {})
    };
    const kraken = {
        ...generated,
        ticker: live?.ticker || generated.ticker,
        orderBook: live?.orderBook || generated.orderBook
    };
    const ticker = kraken.ticker || {};
    const pair = kraken.pair || {};
    const book = kraken.orderBook || {};
    const receipt = sourceReceiptFor(snapshot, 'krakenMarket');
    const receiptStatus = live?.ticker ? live.status : sourceStatus(snapshot, 'krakenMarket');
    const venueStatus = firstText(pair.status, kraken.status, 'unavailable');
    const bids = Array.isArray(book.bids) ? book.bids : [];
    const asks = Array.isArray(book.asks) ? book.asks : [];
    const bestBid = firstNumeric(ticker.bidUsd, ticker.bid, bids[0]?.priceUsd, bids[0]?.price, bids[0]?.[0]);
    const bestAsk = firstNumeric(ticker.askUsd, ticker.ask, asks[0]?.priceUsd, asks[0]?.price, asks[0]?.[0]);
    const mid = bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : null;
    const spreadPct = firstNumeric(ticker.spreadPct, book.spreadPct,
        mid && bestAsk !== null && bestBid !== null ? ((bestAsk - bestBid) / mid) * 100 : null);
    return {
        pair: firstText(pair.displayName, pair.pair, pair.wsname, pair.websocketName, kraken.pairName, 'XU3O8/USD'),
        status: receiptStatus === 'ok' ? venueStatus : receiptStatus,
        venueStatus,
        sourceStatus: receiptStatus,
        sourceCheckedAt: firstText(live?.checkedAt, receipt.checkedAt),
        sourceKind: live?.ticker ? 'direct' : 'generated',
        sourceError: firstText(liveKrakenError, live?.error),
        minimumOrder: firstNumeric(pair.orderMinimum, pair.ordermin, kraken.orderMinimum),
        tickSize: firstNumeric(pair.tickSizeUsd, pair.tickSize, kraken.tickSizeUsd),
        last: firstNumeric(ticker.lastPriceUsd, ticker.lastUsd, ticker.last, ticker.close),
        change24h: firstNumeric(ticker.change24hPct, ticker.priceChange24hPct,
            ticker.openUsd ? ((firstNumeric(ticker.lastUsd, ticker.last) / ticker.openUsd) - 1) * 100 : null),
        high24h: firstNumeric(ticker.highUsd24h, ticker.high24h, ticker.high),
        low24h: firstNumeric(ticker.lowUsd24h, ticker.low24h, ticker.low),
        vwap24h: firstNumeric(ticker.vwapUsd24h, ticker.vwap24h, ticker.vwap),
        volume24h: firstNumeric(ticker.volume24hUsd, ticker.vwapVolumeUsd, ticker.volumeUsd,
            ticker.volume24h && ticker.vwapUsd24h ? ticker.volume24h * ticker.vwapUsd24h : null),
        volume24hTokens: firstNumeric(ticker.volume24hTokens, ticker.volume24h),
        trades24h: firstNumeric(ticker.trades24h, ticker.tradeCount24h),
        bestBid: firstNumeric(book.bestBidUsd, bestBid),
        bestAsk: firstNumeric(book.bestAskUsd, bestAsk),
        spreadPct,
        bids,
        asks,
        observedAt: firstText(live?.ticker?.observedAt, ticker.observedAt, book.observedAt, snapshot?.market?.clock?.krakenRetrievedAt, snapshot?.market?.clock?.observedAt),
        bookObservedAt: firstText(book.observedAt, snapshot?.market?.clock?.krakenRetrievedAt),
        firstTradeAt: firstText(generated.firstTradeAt, generated.firstTrade?.timestamp),
        firstTrade: generated.firstTrade || {},
        recentTrades: Array.isArray(generated.recentTrades) ? generated.recentTrades : [],
        ohlc: Array.isArray(generated.ohlc) ? generated.ohlc : (Array.isArray(generated.ohlcDaily) ? generated.ohlcDaily : []),
        ohlcByInterval: { ...generatedIntervals, ...(live?.ohlcByInterval || {}) }
    };
}

function physicalModel(snapshot) {
    const physical = snapshot?.physical || {};
    const oracle = physical.oracle || {};
    const proof = physical.proof || {};
    const derived = physical.derived || {};
    return {
        oraclePrice: firstNumeric(oracle.priceUsdPerLb, oracle.priceUsdPerLbU3O8, oracle.valueUsdPerLb, oracle.price),
        oracleUpdatedAt: firstText(oracle.updatedAt, oracle.observedAt, physical.clock?.oracleObservedAt, physical.clock?.observedAt),
        statementDate: firstText(proof.statementDate, proof.statementAsOf, proof.asAt, physical.clock?.proofStatementAsOf),
        reserveKg: firstNumeric(proof.endingBalanceKgU, proof.endingBalanceKgUAsU3O8, proof.balanceKgU, proof.reserveKgU3O8),
        reserveLb: firstNumeric(proof.endingBalanceLb, proof.balanceLb, derived.reserveLb, derived.estimatedU3O8Lb),
        statementUrl: safeExternalUrl(firstText(proof.pdfUrl, proof.url)),
        proofPageUrl: safeExternalUrl(firstText(proof.pageUrl, 'https://uranium.io/en/proof-of-reserves')),
        ouncesPerToken: firstNumeric(derived.ouncesPerToken, derived.reserveOuncesPerToken, derived.estimatedU3O8OzPerToken),
        referenceValue: firstNumeric(derived.referenceValueUsd, derived.impliedTokenReferenceUsd, derived.oracleImpliedValuePerTokenUsd),
        basisPct: firstNumeric(derived.marketBasisPct, derived.premiumDiscountPct, derived.tokenPremiumDiscountPct),
        supplyUsed: firstNumeric(derived.tokenSupply, derived.tokenSupplyInput, snapshot?.chain?.token?.totalSupply),
        method: firstText(derived.method, 'Reserve pounds × 16 ÷ token supply')
    };
}

function chainModel(snapshot) {
    const chain = snapshot?.chain || {};
    const token = chain.token || {};
    const counters = chain.counters || {};
    return {
        supply: firstNumeric(token.totalSupply, token.totalSupplyTokens, counters.totalSupply),
        holders: firstNumeric(counters.holders, counters.holderCount, token.holders),
        transfers: firstNumeric(counters.transfers, counters.transferCount, token.transfers),
        observedAt: firstText(chain.clock?.tokenObservedAt, chain.clock?.liveStateObservedAt, chain.clock?.observedAt, token.observedAt, counters.observedAt),
        block: firstNumeric(chain.clock?.blockNumber, token.blockNumber, chain.controls?.liveState?.blockNumber),
        topHolders: Array.isArray(chain.topHolders) ? chain.topHolders : [],
        recentTransfers: Array.isArray(chain.recentTransfers) ? chain.recentTransfers : [],
        controls: {
            ...(chain.controls || {}),
            paused: chain.controls?.liveState?.paused ?? chain.controls?.paused,
            blacklistable: chain.controls?.liveState?.blacklistable ?? chain.controls?.blacklistable,
            kycable: chain.controls?.liveState?.kycable ?? chain.controls?.kycable,
            upgradeable: chain.controls?.token?.capabilities?.upgradeable ?? chain.controls?.upgradeable
        }
    };
}

function protocolModel(snapshot) {
    const protocol = snapshot?.protocol || {};
    return {
        tvl: firstNumeric(protocol.currentTvlUsd, protocol.tvlUsd, protocol.tvl?.currentUsd),
        change24h: firstNumeric(protocol.change24hPct, protocol.tvl?.change24hPct),
        observedAt: firstText(protocol.clock?.latestTvlAt, protocol.clock?.observedAt, protocol.observedAt),
        history: Array.isArray(protocol.history) ? protocol.history : (Array.isArray(protocol.dailyTvlUsd) ? protocol.dailyTvlUsd : [])
    };
}

function intervalLabel(minutes) {
    if (minutes === 1440) return 'daily';
    if (minutes === 60) return 'hourly';
    return `${formatNumber(minutes)}m`;
}

function formatChartTimestamp(value, intervalMinutes = 1440) {
    const timestamp = numeric(value);
    if (timestamp === null) return 'Unavailable';
    const options = intervalMinutes >= 1440
        ? { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }
        : { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC', timeZoneName: 'short' };
    return new Date(timestamp).toLocaleString('en-US', options);
}

function formatAxisUsd(value) {
    const number = numeric(value);
    if (number === null) return '—';
    return `$${number.toFixed(number < 10 ? 3 : 2)}`;
}

function normalizeHistory(rows, { kind = 'coinGecko', intervalMinutes = 1440 } = {}) {
    const points = (Array.isArray(rows) ? rows : []).map((row) => {
        const timestampText = firstText(row?.timestamp, row?.date);
        const timestamp = Date.parse(timestampText);
        const openUsd = firstNumeric(row?.openUsd, row?.open, row?.[1]);
        const highUsd = firstNumeric(row?.highUsd, row?.high, row?.[2]);
        const lowUsd = firstNumeric(row?.lowUsd, row?.low, row?.[3]);
        const closeUsd = firstNumeric(row?.closeUsd, row?.close, row?.priceUsd, row?.value, row?.[4]);
        const volumeTokens = firstNumeric(row?.volumeTokens, row?.volume, row?.[6]);
        const vwapUsd = firstNumeric(row?.vwapUsd, row?.vwap, row?.[5]);
        return {
            date: firstText(row?.date, timestampText),
            timestamp,
            value: closeUsd,
            openUsd,
            highUsd: highUsd ?? closeUsd,
            lowUsd: lowUsd ?? closeUsd,
            closeUsd,
            vwapUsd,
            volumeTokens,
            volumeUsd: firstNumeric(row?.volumeUsd, volumeTokens !== null && vwapUsd !== null ? volumeTokens * vwapUsd : null),
            marketCapUsd: firstNumeric(row?.marketCapUsd),
            trades: firstNumeric(row?.trades),
            complete: row?.complete,
            kind,
            intervalMinutes
        };
    }).filter((row) => Number.isFinite(row.timestamp) && row.value !== null).sort((a, b) => a.timestamp - b.timestamp);
    return points.map((point, index) => ({
        ...point,
        complete: typeof point.complete === 'boolean'
            ? point.complete
            : index < points.length - 1
    }));
}

function historyForRange(rows, rangeId = currentRange, options = {}) {
    const points = normalizeHistory(rows, options);
    const days = RANGE_BY_ID.get(rangeId)?.days;
    if (!points.length || !days) return points;
    const cutoff = points.at(-1).timestamp - (days * DAY_MS);
    return points.filter((point) => point.timestamp >= cutoff);
}

function downsample(points, maximum = 240) {
    if (points.length <= maximum) return points;
    const step = (points.length - 1) / (maximum - 1);
    return Array.from({ length: maximum }, (_, index) => points[Math.round(index * step)]);
}

function marketEventMarkers(snapshot) {
    const kraken = krakenModel(snapshot);
    const listingAt = firstText(kraken.firstTradeAt, snapshot?.identity?.krakenListing?.announcedLiveDate);
    return Number.isFinite(Date.parse(listingAt || ''))
        ? [{ id: 'kraken-usd-live', timestamp: Date.parse(listingAt), label: 'Kraken USD live' }]
        : [];
}

function mergeOhlcRows(...collections) {
    const rows = new Map();
    for (const row of collections.flatMap((collection) => Array.isArray(collection) ? collection : [])) {
        const timestamp = firstText(row?.timestamp, row?.interval_begin, row?.date);
        if (timestamp) rows.set(timestamp, row);
    }
    return [...rows.values()].sort((a, b) => Date.parse(firstText(a?.timestamp, a?.interval_begin, a?.date)) - Date.parse(firstText(b?.timestamp, b?.interval_begin, b?.date)));
}

function marketSeriesForRange(snapshot, rangeId = currentRange) {
    const range = RANGE_BY_ID.get(rangeId) || RANGE_BY_ID.get('30D');
    if (range.source === 'kraken') {
        const kraken = krakenModel(snapshot);
        const generated = snapshot?.market?.kraken || {};
        const generatedRows = generated.ohlcByInterval?.[String(range.intervalMinutes)]
            || (range.intervalMinutes === 5 ? generated.ohlc5m : range.intervalMinutes === 15 ? generated.ohlc15m : [])
            || [];
        const socketRows = liveKrakenMarket?.ohlcByInterval?.[String(range.intervalMinutes)] || [];
        const intervalRows = mergeOhlcRows(generatedRows, socketRows);
        const useInterval = intervalRows.length >= 2;
        const rows = useInterval ? intervalRows : kraken.ohlc;
        const intervalMinutes = useInterval ? range.intervalMinutes : 1440;
        const sourceLabel = useInterval
            ? generatedRows.length && socketRows.length
                ? 'Kraken generated history + direct WebSocket update'
                : socketRows.length
                    ? 'Kraken direct WebSocket snapshot'
                    : 'Kraken generated intraday snapshot'
            : 'Kraken generated snapshot';
        const liveIntervalStatus = liveKrakenMarket?.intervalStatuses?.[String(range.intervalMinutes)];
        const points = historyForRange(rows, range.id, { kind: 'kraken', intervalMinutes });
        return {
            id: `kraken-${range.id}`,
            rangeId: range.id,
            points,
            kind: 'kraken',
            intervalMinutes,
            sourceLabel,
            status: socketRows.length
                ? liveIntervalStatus || kraken.status
                : liveIntervalStatus === 'stale' ? 'stale' : sourceStatus(snapshot, 'krakenMarket'),
            requestedCoverage: range.label,
            note: useInterval
                ? `Direct XU3O8/USD ${intervalLabel(intervalMinutes)} candles; the final interval is still forming.`
                : `Direct intraday candles are unavailable; showing the ${intervalLabel(intervalMinutes)} Kraken history actually retained.`,
            events: marketEventMarkers(snapshot)
        };
    }
    return {
        id: `coingecko-${range.id}`,
        rangeId: range.id,
        points: historyForRange(snapshot?.market?.priceHistoryUsd, range.id, { kind: 'coinGecko', intervalMinutes: 1440 }),
        kind: 'coinGecko',
        intervalMinutes: 1440,
        sourceLabel: 'CoinGecko cross-venue aggregate',
        status: sourceStatus(snapshot, 'coinGecko'),
        requestedCoverage: range.label,
        note: 'Daily USD observations with attributed 24h volume and market cap; not Kraken closing prices.',
        events: marketEventMarkers(snapshot)
    };
}

function chartPointDetail(point, series) {
    const time = formatChartTimestamp(point?.timestamp, series.intervalMinutes);
    const price = formatUsd(point?.value, { digits: 3 });
    if (series.kind === 'kraken') {
        const ohlc = `Open ${formatUsd(point?.openUsd, { digits: 3 })} · High ${formatUsd(point?.highUsd, { digits: 3 })} · Low ${formatUsd(point?.lowUsd, { digits: 3 })} · Close ${price}`;
        const activity = `${formatNumber(point?.volumeTokens, 3)} xU3O8 · ${formatNumber(point?.trades)} trades${point?.complete ? '' : ' · interval forming'}`;
        return { time, price, primary: ohlc, secondary: activity, aria: `${time}. ${ohlc}. ${activity}.` };
    }
    const activity = `24h volume ${formatUsd(point?.volumeUsd, { compact: true })} · market cap ${formatUsd(point?.marketCapUsd, { compact: true })}${point?.complete ? '' : ' · latest partial observation'}`;
    return { time, price, primary: `Price ${price}`, secondary: activity, aria: `${time}. Price ${price}. ${activity}.` };
}

function renderPriceChart(input, rangeId = currentRange, compact = false) {
    const series = Array.isArray(input)
        ? {
            id: `entry-${rangeId}`,
            rangeId,
            points: historyForRange(input, rangeId, { kind: 'coinGecko', intervalMinutes: 1440 }),
            kind: 'coinGecko',
            intervalMinutes: 1440,
            sourceLabel: 'CoinGecko aggregate',
            status: 'ok',
            requestedCoverage: rangeId,
            note: '',
            events: []
        }
        : input;
    const points = compact ? downsample(series?.points || [], 90) : (series?.points || []);
    if (points.length < 2) return `<div class="uranium-chart-empty">No ${escapeHtml(series?.rangeId || rangeId)} token-price history is available in this snapshot.</div>`;
    const values = points.flatMap((point) => [point.lowUsd ?? point.value, point.highUsd ?? point.value]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = Math.max(max - min, Math.abs(max || 1) * .025);
    const floor = Math.max(0, min - (span * .08));
    const ceiling = max + (span * .08);
    const first = points[0];
    const latest = points.at(-1);
    const width = compact ? 520 : Math.max(360, Math.min(1000, Math.round(window.innerWidth - 44)));
    const height = compact ? 84 : 320;
    const narrowChart = !compact && width < 560;
    const left = compact ? 4 : narrowChart ? 56 : 78;
    const right = compact ? width - 4 : width - (narrowChart ? 10 : 18);
    const top = compact ? 6 : 48;
    const bottom = compact ? height - 7 : 220;
    const volumeTop = compact ? bottom : 242;
    const volumeBottom = compact ? bottom : 282;
    const x = (time) => left + (((time - first.timestamp) / Math.max(1, latest.timestamp - first.timestamp)) * (right - left));
    const y = (value) => bottom - (((value - floor) / Math.max(Number.EPSILON, ceiling - floor)) * (bottom - top));
    const path = points.map((point, index) => `${index ? 'L' : 'M'}${x(point.timestamp).toFixed(2)},${y(point.value).toFixed(2)}`).join(' ');
    const change = first.value ? ((latest.value / first.value) - 1) * 100 : null;
    const label = `xU3O8 USD ${series.rangeId || rangeId} history from ${formatChartTimestamp(first.timestamp, series.intervalMinutes)} to ${formatChartTimestamp(latest.timestamp, series.intervalMinutes)}. First ${formatUsd(first.value)}, latest ${formatUsd(latest.value)}, high ${formatUsd(max)}, low ${formatUsd(min)}, return ${formatPct(change, { signed: true })}. Source: ${series.sourceLabel}.`;
    if (compact) {
        return `
            <div class="uranium-chart is-compact" role="img" aria-label="${escapeHtml(label)}">
                <div class="uranium-chart-compact-meta"><span>${escapeHtml(series.rangeId || rangeId)} · CoinGecko</span><strong class="${directionClass(change)}">${escapeHtml(formatPct(change, { signed: true }))}</strong></div>
                <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true" focusable="false">
                    <defs><linearGradient id="uranium-chart-fill-compact" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8dff45" stop-opacity=".35"></stop><stop offset="1" stop-color="#8dff45" stop-opacity="0"></stop></linearGradient></defs>
                    <path class="uranium-chart-area" d="${path} L${right},${bottom} L${left},${bottom} Z" fill="url(#uranium-chart-fill-compact)"></path>
                    <path class="uranium-chart-line" d="${path}"></path>
                    <circle class="uranium-chart-end" cx="${x(latest.timestamp).toFixed(2)}" cy="${y(latest.value).toFixed(2)}" r="3"></circle>
                </svg>
            </div>
        `;
    }

    const chartId = `uranium-chart-${series.id}`;
    const storedTime = chartLookupState.get(series.rangeId);
    const selectedIndex = Number.isFinite(storedTime)
        ? points.reduce((best, point, index) => Math.abs(point.timestamp - storedTime) < Math.abs(points[best].timestamp - storedTime) ? index : best, 0)
        : points.length - 1;
    const selected = points[selectedIndex];
    const selectedDetail = chartPointDetail(selected, series);
    const maxVolume = Math.max(0, ...points.map((point) => point.volumeUsd ?? point.volumeTokens ?? 0));
    const barStep = (right - left) / Math.max(1, points.length);
    const barWidth = Math.max(.8, Math.min(8, barStep * .72));
    const priceTicks = Array.from({ length: 4 }, (_, index) => ceiling - ((ceiling - floor) * (index / 3)));
    const totalVolumeTokens = series.kind === 'kraken' ? points.reduce((sum, point) => sum + (point.volumeTokens || 0), 0) : null;
    const totalTrades = series.kind === 'kraken' ? points.reduce((sum, point) => sum + (point.trades || 0), 0) : null;
    const context = series.kind === 'kraken'
        ? `${formatNumber(totalVolumeTokens, 2)} xU3O8 volume · ${formatNumber(totalTrades)} trades`
        : `Latest 24h volume ${formatUsd(latest.volumeUsd, { compact: true })} · market cap ${formatUsd(latest.marketCapUsd, { compact: true })}`;
    const actualCoverage = `${formatChartTimestamp(first.timestamp, series.intervalMinutes)} → ${formatChartTimestamp(latest.timestamp, series.intervalMinutes)} · ${formatNumber(points.length)} ${intervalLabel(series.intervalMinutes)} observations`;
    const coordinates = points.map((point) => ({ x: x(point.timestamp), y: y(point.value) }));
    chartSeriesRegistry.set(chartId, { ...series, points, coordinates, left, right, top, bottom });
    const rangeDays = RANGE_BY_ID.get(series.rangeId)?.days;
    const requestedStart = Number.isFinite(rangeDays) ? latest.timestamp - (rangeDays * DAY_MS) : first.timestamp;
    const intervalMs = Math.max(0, Number(series.intervalMinutes) || 0) * 60 * 1000;
    const markerStart = Math.max(requestedStart, first.timestamp - intervalMs);
    const markerMarkup = (series.events || []).filter((event) => event.timestamp >= markerStart && event.timestamp <= latest.timestamp).map((event) => {
        const markerX = Math.max(left, Math.min(right, x(event.timestamp)));
        const labelX = Math.max(left + 52, Math.min(right - 52, markerX));
        return `<g class="uranium-chart-event" data-uranium-event="${escapeHtml(event.id)}"><line x1="${markerX.toFixed(2)}" y1="${top}" x2="${markerX.toFixed(2)}" y2="${volumeBottom}"></line><text x="${labelX.toFixed(2)}" y="${top - 9}" text-anchor="middle">${escapeHtml(event.label)}</text></g>`;
    }).join('');
    return `
        <div class="uranium-chart is-interactive" data-uranium-chart="${escapeHtml(chartId)}" data-quiet-key="${escapeHtml(chartId)}">
            <div class="uranium-chart-summary" aria-hidden="true"><span>${escapeHtml(series.rangeId)} return</span><strong class="${directionClass(change)}">${escapeHtml(formatPct(change, { signed: true }))}</strong><small>${escapeHtml(formatUsd(first.value, { digits: 3 }))} start · ${escapeHtml(formatUsd(latest.value, { digits: 3 }))} latest · ${escapeHtml(formatUsd(min, { digits: 3 }))} low · ${escapeHtml(formatUsd(max, { digits: 3 }))} high</small><small>${escapeHtml(context)}</small></div>
            <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="group" aria-label="${escapeHtml(label)}">
                <defs><linearGradient id="${escapeHtml(chartId)}-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8dff45" stop-opacity=".35"></stop><stop offset="1" stop-color="#8dff45" stop-opacity="0"></stop></linearGradient></defs>
                ${priceTicks.map((tick) => { const tickY = y(tick); return `<g class="uranium-chart-axis"><line class="uranium-chart-grid" x1="${left}" y1="${tickY.toFixed(2)}" x2="${right}" y2="${tickY.toFixed(2)}"></line><text x="${left - 10}" y="${(tickY + 3).toFixed(2)}" text-anchor="end">${escapeHtml(formatAxisUsd(tick))}</text></g>`; }).join('')}
                <line class="uranium-chart-volume-axis" x1="${left}" y1="${volumeBottom}" x2="${right}" y2="${volumeBottom}"></line>
                ${points.map((point, index) => { const volume = point.volumeUsd ?? point.volumeTokens ?? 0; const barHeight = maxVolume ? (volume / maxVolume) * (volumeBottom - volumeTop) : 0; return `<rect class="uranium-chart-volume-bar" x="${(coordinates[index].x - (barWidth / 2)).toFixed(2)}" y="${(volumeBottom - barHeight).toFixed(2)}" width="${barWidth.toFixed(2)}" height="${Math.max(.5, barHeight).toFixed(2)}"></rect>`; }).join('')}
                <path class="uranium-chart-area" d="${path} L${right},${bottom} L${left},${bottom} Z" fill="url(#${escapeHtml(chartId)}-fill)"></path>
                <path class="uranium-chart-line" d="${path}"></path>
                ${markerMarkup}
                <circle class="uranium-chart-end" cx="${x(latest.timestamp).toFixed(2)}" cy="${y(latest.value).toFixed(2)}" r="4"></circle>
                <g class="uranium-chart-crosshair" data-uranium-chart-crosshair><line x1="${coordinates[selectedIndex].x.toFixed(2)}" y1="${top}" x2="${coordinates[selectedIndex].x.toFixed(2)}" y2="${volumeBottom}"></line><circle cx="${coordinates[selectedIndex].x.toFixed(2)}" cy="${coordinates[selectedIndex].y.toFixed(2)}" r="5"></circle></g>
                <text x="${left}" y="306">${escapeHtml(formatChartTimestamp(first.timestamp, series.intervalMinutes))}</text><text x="${right}" y="306" text-anchor="end">${escapeHtml(formatChartTimestamp(latest.timestamp, series.intervalMinutes))}</text>
                <rect class="uranium-chart-hitbox" data-uranium-chart-hitbox x="${left}" y="${top}" width="${right - left}" height="${volumeBottom - top}" fill="transparent" tabindex="0" role="slider" aria-label="Explore xU3O8 ${escapeHtml(series.rangeId)} price history" aria-valuemin="0" aria-valuemax="${points.length - 1}" aria-valuenow="${selectedIndex}" aria-valuetext="${escapeHtml(selectedDetail.aria)}"></rect>
            </svg>
            <div class="uranium-chart-readout" data-uranium-chart-readout><time data-uranium-chart-time>${escapeHtml(selectedDetail.time)}</time><strong data-uranium-chart-price>${escapeHtml(selectedDetail.price)}</strong><span data-uranium-chart-primary>${escapeHtml(selectedDetail.primary)}</span><small data-uranium-chart-secondary>${escapeHtml(selectedDetail.secondary)}</small></div>
            <div class="uranium-chart-provenance"><span><b>${escapeHtml(series.sourceLabel)}</b> · ${escapeHtml(intervalLabel(series.intervalMinutes))} · <em class="uranium-status ${statusClass(series.status)}">${escapeHtml(series.status)}</em></span><span>${escapeHtml(actualCoverage)}</span><small>${escapeHtml(series.note)}</small></div>
            <p class="sr-only">${escapeHtml(label)}</p>
        </div>
    `;
}

function renderMetric(label, value, note = '', className = '') {
    return `<article class="uranium-metric ${className}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>${note ? `<small>${escapeHtml(note)}</small>` : ''}</article>`;
}

function renderClock(label, value, source = '') {
    return `<span class="uranium-clock"><b>${escapeHtml(label)}</b> ${escapeHtml(formatTimestamp(value))}${source ? ` · ${escapeHtml(source)}` : ''}</span>`;
}

function heroPicture(className = '') {
    return `
        <figure class="uranium-core-stage market-room-core-stage ${className}">
            <picture>
                <source srcset="/assets/uranium/uranium-core-640.webp 640w, /assets/uranium/uranium-core.webp 1280w" sizes="(max-width: 700px) 92vw, 46vw" type="image/webp">
                <img src="/assets/uranium/uranium-core.webp" width="1280" height="853" loading="lazy" decoding="async" alt="Cute cartoon uranium-rock mascot glowing with vivid emerald-green energy.">
            </picture>
            <figcaption>Stylized uranium mascot · physical U3O8 is yellowcake concentrate, not a glowing rock.</figcaption>
        </figure>
    `;
}

function launcherPicture(className = '') {
    return `
        <figure class="uranium-core-stage ${className}">
            <picture>
                <source srcset="/assets/uranium/uranium-launcher-480.webp 480w, /assets/uranium/uranium-launcher.webp 960w" sizes="(max-width: 700px) 34vw, 240px" type="image/webp">
                <img src="/assets/uranium/uranium-launcher.webp" width="960" height="960" loading="lazy" decoding="async" alt="Polished translucent light-green mineral specimen with a bright emerald inner glow.">
            </picture>
        </figure>
    `;
}

function renderOverview(snapshot) {
    const coin = coinModel(snapshot);
    const physical = physicalModel(snapshot);
    const chain = chainModel(snapshot);
    const protocol = protocolModel(snapshot);
    const terms = issuerTermsModel(snapshot);
    return `
        <section class="uranium-hero-panel">
            <div class="uranium-hero-copy">
                <div class="uranium-kicker">xU3O8 · Etherlink · physical-asset token</div>
                <h3>Uranium, with every layer exposed.</h3>
                <p>Uranium.io describes xU3O8 this way: ${escapeHtml(terms.ownershipDescription)} The token market, indicative uranium reference, custody statement, and Etherlink ledger are related—but none substitutes for the others.</p>
                <div class="uranium-hero-price">
                    <span>Token market</span>
                    <strong>${escapeHtml(formatUsd(coin.price))}</strong>
                    <em class="${directionClass(coin.change24h)}">${escapeHtml(formatPct(coin.change24h, { signed: true }))} · 24h</em>
                    <small>${escapeHtml(formatFreshnessStamp(coin.updatedAt, { source: 'CoinGecko' }))}</small>
                </div>
                <div class="uranium-contract-strip"><span>xU3O8</span><code title="${TOKEN_CONTRACT}">${escapeHtml(truncate(TOKEN_CONTRACT, 12, 8))}</code><button type="button" data-uranium-copy="${TOKEN_CONTRACT}" aria-label="Copy xU3O8 contract address">Copy</button></div>
            </div>
            ${heroPicture('is-room')}
        </section>
        <section class="uranium-metric-grid">
            ${renderMetric('Indicative uranium', formatUsd(physical.oraclePrice, { digits: 2 }), 'USD/lb · non-executable')}
            ${renderMetric('Derived representation', physical.ouncesPerToken === null ? 'Unavailable' : `${formatNumber(physical.ouncesPerToken, 4)} oz`, `per token · statement ${formatDate(physical.statementDate)}`)}
            ${renderMetric('Indexed supply', chain.supply === null ? 'Unavailable' : `${formatCompact(chain.supply, 3)} xU3O8`, 'Etherlink observation')}
            ${renderMetric('Uranium.io TVL', formatUsd(protocol.tvl, { compact: true }), 'DefiLlama protocol context')}
        </section>
        <section class="uranium-grid uranium-overview-grid">
            <article class="uranium-panel uranium-basis-panel">
                <div class="uranium-panel-head"><div><span class="uranium-eyebrow">Cross-source arithmetic</span><h4>Market versus reference</h4></div><span class="uranium-status is-neutral">Not a peg</span></div>
                <div class="uranium-basis-orbit"><strong>${escapeHtml(formatPct(physical.basisPct, { signed: true }))}</strong><span>premium / discount</span></div>
                <p>The indicative token reference is the uranium oracle in USD/lb multiplied by the dated derived ounces represented per token, divided by 16. It is not executable and does not establish an arbitrage or redemption path.</p>
                <div class="uranium-equation"><span>${escapeHtml(formatUsd(physical.oraclePrice))}/lb</span><i>×</i><span>${escapeHtml(formatNumber(physical.ouncesPerToken, 4))} oz</span><i>÷</i><span>16</span><i>=</i><strong>${escapeHtml(formatUsd(physical.referenceValue))}</strong></div>
            </article>
            <article class="uranium-panel uranium-proof-flash">
                <div class="uranium-panel-head"><div><span class="uranium-eyebrow">Physical receipt</span><h4>Cameco balance statement</h4></div><span class="uranium-status is-good">Dated statement</span></div>
                <strong class="uranium-proof-amount">${escapeHtml(formatNumber(physical.reserveKg, 3))} <small>kgU as U3O8</small></strong>
                <p>Ending contract balance as at ${escapeHtml(formatDate(physical.statementDate))}. This issuer-published custodian statement is a point-in-time document, not a continuous independent audit.</p>
                <div class="uranium-link-row"><a href="${escapeHtml(physical.statementUrl || physical.proofPageUrl)}" target="_blank" rel="noopener noreferrer">Open the statement ↗</a><button type="button" data-uranium-view="proofbook">Read the proofbook</button></div>
            </article>
            <article class="uranium-panel uranium-boundary-panel">
                <span class="uranium-eyebrow">What the token is</span>
                <h4>Issuer-described terms, not uranium in your wallet.</h4>
                <ul class="uranium-fact-list">
                    <li><strong>Ownership</strong><span>Issuer description: ${escapeHtml(terms.ownershipDescription)}${issuerReceiptLink(terms.ownershipReceipt)}</span></li>
                    <li><strong>Custody</strong><span>Issuer documents name ${escapeHtml(terms.trustee)} as the trustee account and ${escapeHtml(terms.storageOperator)} as the storage operator.${issuerReceiptLink(terms.custodyReceipt)}</span></li>
                    <li><strong>Redemption</strong><span>Issuer terms: ${escapeHtml(terms.redemptionCondition)}${issuerReceiptLink(terms.redemptionReceipt)}</span></li>
                    <li><strong>Rights</strong><span>${escapeHtml(issuerRightsSummary(terms))}${issuerReceiptLink(terms.rightsReceipt, 'Issuer whitepaper')}</span></li>
                </ul>
                <p class="uranium-footnote">${escapeHtml(terms.caveat)}</p>
            </article>
            <article class="uranium-panel uranium-ledger-panel">
                <span class="uranium-eyebrow">Three clocks, kept honest</span>
                <h4>Price discovery is not proof of reserves.</h4>
                <div class="uranium-clock-stack">
                    ${renderClock('Token market', coin.updatedAt, 'CoinGecko / venues')}
                    ${renderClock('Uranium reference', physical.oracleUpdatedAt, 'Uranium.io oracle')}
                    ${renderClock('Etherlink ledger', chain.observedAt, chain.block === null ? '' : `block ${formatNumber(chain.block)}`)}
                    ${renderClock('Custody document', physical.statementDate, 'Cameco statement')}
                </div>
            </article>
        </section>
    `;
}

function renderRangeControl() {
    return `<div class="uranium-range" role="group" aria-label="Token price range">${RANGES.map((range) => `<button type="button" data-uranium-range="${range.id}" aria-pressed="${range.id === currentRange}">${range.label}</button>`).join('')}</div>`;
}

function renderBookSide(rows, side) {
    const normalized = rows.slice(0, 8).map((row) => ({
        price: firstNumeric(row?.priceUsd, row?.price, row?.[0]),
        amount: firstNumeric(row?.amountTokens, row?.volume, row?.amount, row?.[1])
    }));
    return `
        <div class="uranium-book-side is-${side}">
            <h5>${side === 'bid' ? 'Bids' : 'Asks'}</h5>
            <div class="uranium-book-labels"><span>Price</span><span>xU3O8</span></div>
            ${normalized.length ? normalized.map((row, index) => `<div class="uranium-book-row" style="--depth:${Math.max(12, 100 - (index * 10))}%"><span>${escapeHtml(formatUsd(row.price, { digits: 3 }))}</span><span>${escapeHtml(formatNumber(row.amount, 3))}</span></div>`).join('') : '<p class="uranium-empty-copy">No bounded book rows.</p>'}
        </div>
    `;
}

function renderTrades(rows) {
    const normalized = rows.slice(0, 14);
    return `
        <div class="uranium-table-wrap"><table class="uranium-table">
            <caption class="sr-only">Most recent bounded Kraken xU3O8 trades</caption>
            <thead><tr><th>Time</th><th>Side</th><th class="is-number">Price</th><th class="is-number">xU3O8</th></tr></thead>
            <tbody>${normalized.length ? normalized.map((trade) => {
                const side = firstText(trade?.side, trade?.type, '—');
                return `<tr><td>${escapeHtml(formatTimestamp(firstText(trade?.timestamp, trade?.observedAt, trade?.time)))}</td><td><span class="uranium-trade-side is-${side.toLowerCase() === 'buy' || side.toLowerCase() === 'b' ? 'buy' : 'sell'}">${escapeHtml(side)}</span></td><td class="is-number">${escapeHtml(formatUsd(firstNumeric(trade?.priceUsd, trade?.price), { digits: 3 }))}</td><td class="is-number">${escapeHtml(formatNumber(firstNumeric(trade?.amountTokens, trade?.volume, trade?.amount), 4))}</td></tr>`;
            }).join('') : '<tr><td colspan="4">No recent trades in this bounded receipt.</td></tr>'}</tbody>
        </table></div>
    `;
}

function renderVenues(rows) {
    const normalized = Array.isArray(rows) ? rows.slice(0, 20) : [];
    return `
        <div class="uranium-table-wrap"><table class="uranium-table">
            <caption class="sr-only">Attributed xU3O8 venue directory</caption>
            <thead><tr><th>Venue</th><th>Pair</th><th class="is-number">Last</th><th class="is-number">24h volume</th><th>Receipt</th></tr></thead>
            <tbody>${normalized.length ? normalized.map((venue) => {
                const url = safeExternalUrl(firstText(venue?.tradeUrl, venue?.url));
                return `<tr><td>${escapeHtml(firstText(venue?.market, venue?.name, 'Unknown'))}</td><td>${escapeHtml(`${firstText(venue?.base, 'xU3O8')}/${firstText(venue?.target, venue?.quote, '—')}`)}</td><td class="is-number">${escapeHtml(formatUsd(firstNumeric(venue?.lastPriceUsd, venue?.convertedLastUsd, venue?.lastUsd, venue?.last), { digits: 4 }))}</td><td class="is-number">${escapeHtml(formatUsd(firstNumeric(venue?.volume24hUsd, venue?.convertedVolumeUsd, venue?.volumeUsd), { compact: true }))}</td><td>${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Source ↗</a>` : '<span class="uranium-muted">Attributed feed</span>'}</td></tr>`;
            }).join('') : '<tr><td colspan="5">No attributed venue rows are available.</td></tr>'}</tbody>
        </table></div>
    `;
}

function renderMarkets(snapshot) {
    const coin = coinModel(snapshot);
    const kraken = krakenModel(snapshot);
    const physical = physicalModel(snapshot);
    const history = marketSeriesForRange(snapshot, currentRange);
    return `
        <section class="uranium-market-lead">
            <div class="uranium-market-lockup"><span class="uranium-eyebrow">Kraken listing · public USD book</span><h3>${escapeHtml(kraken.pair)}</h3><p>Kraken says trading went live July 30, 2026. Its public tape adds a direct dollar book, OHLC, spread, depth, and trade receipts; it does not add reserve or redemption proof.</p></div>
            <div class="uranium-live-quote"><span class="uranium-status ${statusClass(kraken.status)}">${escapeHtml(kraken.status)}</span><strong>${escapeHtml(formatUsd(kraken.last ?? coin.price, { digits: 3 }))}</strong><small>${escapeHtml(kraken.sourceStatus === 'ok' ? formatTimestamp(kraken.observedAt) : `Last good ${formatTimestamp(kraken.observedAt)} · checked ${formatTimestamp(kraken.sourceCheckedAt)}`)}</small></div>
        </section>
        <section class="uranium-metric-grid is-market">
            ${renderMetric('Best bid', formatUsd(kraken.bestBid, { digits: 3 }), 'Kraken public book')}
            ${renderMetric('Best ask', formatUsd(kraken.bestAsk, { digits: 3 }), 'Kraken public book')}
            ${renderMetric('Spread', formatPct(kraken.spreadPct), 'Observed, not guaranteed')}
            ${renderMetric('Kraken 24h volume', kraken.volume24h !== null ? formatUsd(kraken.volume24h, { compact: true }) : `${formatCompact(kraken.volume24hTokens, 2)} xU3O8`, kraken.trades24h === null ? 'Public ticker' : `${formatNumber(kraken.trades24h)} trades`)}
            ${renderMetric('Global 24h volume', formatUsd(coin.volume24h, { compact: true }), 'CoinGecko attributed aggregate')}
            ${renderMetric('Market cap', formatUsd(coin.marketCap, { compact: true }), 'Token market, not reserve value')}
        </section>
        <section class="uranium-panel uranium-price-panel">
            <div class="uranium-panel-head"><div><span class="uranium-eyebrow">Token price · source-separated history</span><h4>xU3O8 / USD</h4></div>${renderRangeControl()}</div>
            ${renderPriceChart(history, currentRange)}
        </section>
        <section class="uranium-grid uranium-market-grid">
            <article class="uranium-panel">
                <div class="uranium-panel-head"><div><span class="uranium-eyebrow">Kraken depth</span><h4>Public order book</h4></div><span class="uranium-status is-neutral">Bounded top levels</span></div>
                <div class="uranium-order-book">${renderBookSide(kraken.bids, 'bid')}${renderBookSide(kraken.asks, 'ask')}</div>
                <p class="uranium-footnote">A visible book is not a liquidity promise. Slippage and fill quality can change before an order executes.</p>
            </article>
            <article class="uranium-panel">
                <div class="uranium-panel-head"><div><span class="uranium-eyebrow">Physical reference</span><h4>${escapeHtml(formatUsd(physical.oraclePrice))} / lb</h4></div><span class="uranium-status is-warn">Indicative</span></div>
                <p>Uranium.io publishes a proprietary fair-value estimate between official industry prints. It updates separately from token venues and is explicitly non-executable.</p>
                <div class="uranium-basis-readout"><span>Derived token reference</span><strong>${escapeHtml(formatUsd(physical.referenceValue))}</strong><small>${escapeHtml(formatNumber(physical.ouncesPerToken, 4))} oz/token · ${escapeHtml(formatTimestamp(physical.oracleUpdatedAt))}</small></div>
                <div class="uranium-basis-readout"><span>Token market basis</span><strong class="${directionClass(physical.basisPct)}">${escapeHtml(formatPct(physical.basisPct, { signed: true }))}</strong><small>premium / discount · not a peg</small></div>
            </article>
        </section>
        <section class="uranium-panel">
            <div class="uranium-panel-head"><div><span class="uranium-eyebrow">Kraken tape</span><h4>Recent public trades</h4></div><span class="uranium-status is-neutral">First observed ${escapeHtml(formatTimestamp(kraken.firstTradeAt))}</span></div>
            ${renderTrades(kraken.recentTrades)}
        </section>
        <section class="uranium-panel">
            <div class="uranium-panel-head"><div><span class="uranium-eyebrow">Attributed venue directory</span><h4>Where the token is quoted</h4></div><span class="uranium-status is-neutral">No cross-venue ownership inference</span></div>
            ${renderVenues(snapshot.market?.venues)}
        </section>
    `;
}

function holderShare(holder, totalSupply) {
    const explicit = firstNumeric(holder?.sharePct, holder?.percentage);
    if (explicit !== null) return explicit;
    const balance = firstNumeric(holder?.balanceTokens, holder?.balance, holder?.value);
    return balance !== null && totalSupply ? (balance / totalSupply) * 100 : null;
}

function renderHolders(rows, supply) {
    const normalized = rows.slice(0, 16);
    return `
        <div class="uranium-table-wrap"><table class="uranium-table">
            <caption class="sr-only">Top indexed xU3O8 token addresses</caption>
            <thead><tr><th>Indexed address</th><th class="is-number">Balance</th><th class="is-number">Supply share</th></tr></thead>
            <tbody>${normalized.length ? normalized.map((holder) => {
                const address = firstText(holder?.address, holder?.hash, holder?.holder);
                const url = safeExternalUrl(firstText(holder?.explorerUrl, address ? `https://explorer.etherlink.com/address/${address}` : ''));
                return `<tr><td>${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"><code>${escapeHtml(truncate(address))}</code> ↗</a>` : `<code>${escapeHtml(truncate(address))}</code>`}</td><td class="is-number">${escapeHtml(formatNumber(firstNumeric(holder?.balanceTokens, holder?.balance, holder?.value), 4))}</td><td class="is-number">${escapeHtml(formatPct(holderShare(holder, supply)))}</td></tr>`;
            }).join('') : '<tr><td colspan="3">No bounded holder rows.</td></tr>'}</tbody>
        </table></div>
    `;
}

function renderTransfers(rows) {
    const normalized = rows.slice(0, 18);
    return `
        <div class="uranium-table-wrap"><table class="uranium-table">
            <caption class="sr-only">Most recent bounded xU3O8 transfers indexed by Etherlink Blockscout</caption>
            <thead><tr><th>Time</th><th>From → to</th><th class="is-number">Amount</th><th>Receipt</th></tr></thead>
            <tbody>${normalized.length ? normalized.map((transfer) => {
                const from = firstText(transfer?.from?.address, transfer?.from, transfer?.fromAddress);
                const to = firstText(transfer?.to?.address, transfer?.to, transfer?.toAddress);
                const hash = firstText(transfer?.transactionHash, transfer?.txHash, transfer?.hash);
                const url = safeExternalUrl(firstText(transfer?.explorerUrl, hash ? `https://explorer.etherlink.com/tx/${hash}` : ''));
                return `<tr><td>${escapeHtml(formatTimestamp(firstText(transfer?.timestamp, transfer?.observedAt, transfer?.blockTimestamp)))}</td><td><code>${escapeHtml(truncate(from, 6, 4))}</code> <span aria-label="to">→</span> <code>${escapeHtml(truncate(to, 6, 4))}</code></td><td class="is-number">${escapeHtml(formatNumber(firstNumeric(transfer?.amountTokens, transfer?.value, transfer?.amount), 4))}</td><td>${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(truncate(hash, 7, 5))} ↗</a>` : '—'}</td></tr>`;
            }).join('') : '<tr><td colspan="4">No bounded transfer rows.</td></tr>'}</tbody>
        </table></div>
    `;
}

function controlValue(controls, key, fallback = null) {
    if (key in controls) return controls[key];
    return fallback;
}

function renderControl(label, value, note) {
    const enabled = value === true;
    const unavailable = value === null || value === undefined;
    return `<article class="uranium-control"><span class="uranium-status ${unavailable ? 'is-neutral' : enabled ? 'is-warn' : 'is-good'}">${unavailable ? 'Unverified' : enabled ? 'Enabled' : 'Disabled'}</span><h5>${escapeHtml(label)}</h5><p>${escapeHtml(note)}</p></article>`;
}

function renderChain(snapshot) {
    const chain = chainModel(snapshot);
    const controls = chain.controls;
    return `
        <section class="uranium-chain-head">
            <div><span class="uranium-eyebrow">Etherlink mainnet · chain ID 42793</span><h3>xU3O8 ledger state</h3><p>Blockscout indexes addresses, balances, and transfers. An address is not necessarily a person: contracts, venue omnibus wallets, and custody structures can pool many users.</p></div>
            <div class="uranium-contract-card"><span>Verified token contract</span><code>${TOKEN_CONTRACT}</code><div><button type="button" data-uranium-copy="${TOKEN_CONTRACT}">Copy address</button><a href="https://explorer.etherlink.com/address/${TOKEN_CONTRACT}" target="_blank" rel="noopener noreferrer">Explorer ↗</a></div></div>
        </section>
        <section class="uranium-metric-grid">
            ${renderMetric('Total supply', chain.supply === null ? 'Unavailable' : `${formatNumber(chain.supply, 4)} xU3O8`, 'Observed token state')}
            ${renderMetric('Indexed holders', formatNumber(chain.holders), 'Addresses, not investors')}
            ${renderMetric('Indexed transfers', formatNumber(chain.transfers), 'Blockscout counter')}
            ${chain.block === null
        ? renderMetric('State observed', formatTimestamp(chain.observedAt), 'Etherlink / Blockscout clock')
        : renderMetric('Observed block', formatNumber(chain.block), formatTimestamp(chain.observedAt))}
        </section>
        <section class="uranium-control-grid">
            ${renderControl('Paused', controlValue(controls, 'paused'), 'Whether ordinary transfers are currently paused.')}
            ${renderControl('Blacklistable', controlValue(controls, 'blacklistable', controlValue(controls, 'isBlacklistable')), 'The verified implementation exposes an address-control path.')}
            ${renderControl('KYC gate', controlValue(controls, 'kycable', controlValue(controls, 'isKYCable')), 'Whether the current token state reports a KYC transfer gate.')}
            ${renderControl('Upgradeable', controlValue(controls, 'upgradeable'), 'The proxy and implementation can change through authorized control.')}
        </section>
        <section class="uranium-grid uranium-chain-grid">
            <article class="uranium-panel"><div class="uranium-panel-head"><div><span class="uranium-eyebrow">Bounded distribution</span><h4>Top indexed addresses</h4></div><span class="uranium-status is-neutral">Address ≠ owner</span></div>${renderHolders(chain.topHolders, chain.supply)}</article>
            <article class="uranium-panel"><div class="uranium-panel-head"><div><span class="uranium-eyebrow">Bounded activity</span><h4>Recent token transfers</h4></div><span class="uranium-status is-neutral">Applied receipts</span></div>${renderTransfers(chain.recentTransfers)}</article>
        </section>
        <article class="uranium-panel uranium-app-boundary">
            <div><span class="uranium-eyebrow">Do not cross the wires</span><h4>Token contract and Uranium.io app contract are different.</h4></div>
            <div class="uranium-address-compare"><span><b>xU3O8 token</b><code>${TOKEN_CONTRACT}</code></span><span><b>Uranium.io app</b><code>${APP_CONTRACT}</code></span></div>
            <p>Token transfers describe xU3O8 movement. Calls to the Uranium.io application describe interactions with that reviewed app contract. Neither is silently relabeled as a sale or a unique investor.</p>
        </article>
    `;
}

function sourceClockFor(snapshot, id, source) {
    const coverage = source?.coverage || {};
    const observed = {
        krakenMarket: snapshot?.market?.kraken?.ticker?.observedAt,
        coinGecko: snapshot?.market?.coin?.lastUpdated,
        blockscoutToken: snapshot?.chain?.clock?.tokenObservedAt,
        blockscoutContracts: snapshot?.chain?.clock?.contractsObservedAt,
        etherlinkRpc: snapshot?.chain?.clock?.liveStateObservedAt,
        defiLlama: firstText(snapshot?.protocol?.clock?.latestTvlAt, snapshot?.protocol?.clock?.observedAt),
        uraniumOracle: firstText(snapshot?.physical?.oracle?.observedAt, snapshot?.physical?.clock?.oracleObservedAt)
    }[id];
    if (id === 'krakenListing') {
        return {
            label: 'Announced live',
            value: firstText(snapshot?.identity?.krakenListing?.announcedLiveDate, coverage.announcedLiveDate),
            dateOnly: true,
            checkedAt: source?.checkedAt
        };
    }
    if (id === 'uraniumIssuer') {
        return {
            label: 'Reviewed',
            value: firstText(source?.reviewedAt, coverage.reviewedOn, source?.retrievedAt),
            dateOnly: true,
            checkedAt: source?.checkedAt
        };
    }
    if (id === 'proofOfReserves') {
        return {
            label: 'Statement as at',
            value: firstText(snapshot?.physical?.proof?.statementAsOf, snapshot?.physical?.proof?.statementDate),
            dateOnly: true,
            checkedAt: firstText(snapshot?.physical?.proof?.retrievedAt, source?.checkedAt)
        };
    }
    return {
        label: 'Observed',
        value: firstText(observed, source?.retrievedAt),
        dateOnly: false,
        checkedAt: source?.checkedAt
    };
}

function renderSourceClock(clock) {
    const primary = clock.dateOnly ? formatDate(clock.value) : formatTimestamp(clock.value);
    const primaryTime = Date.parse(clock.value || '');
    const checkedTime = Date.parse(clock.checkedAt || '');
    const showChecked = Number.isFinite(checkedTime)
        && (!Number.isFinite(primaryTime) || Math.abs(checkedTime - primaryTime) > 60 * 1000);
    return `<span class="uranium-source-clock"><b>${escapeHtml(clock.label)}</b><span>${escapeHtml(primary)}</span>${showChecked ? `<small>Checked ${escapeHtml(formatTimestamp(clock.checkedAt))}</small>` : ''}</span>`;
}

function renderSources(snapshot) {
    const rows = Object.entries(snapshot?.sources || {}).map(([id, source]) => {
        const normalized = source && typeof source === 'object' ? source : {};
        const url = safeExternalUrl(firstText(normalized.url, normalized.sourceUrl));
        const label = firstText(normalized.label, normalized.name, id.replaceAll('-', ' '));
        const status = firstText(normalized.status, 'unavailable');
        const clock = sourceClockFor(snapshot, id, normalized);
        return `<tr><td>${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)} ↗</a>` : escapeHtml(label)}</td><td><span class="uranium-status ${statusClass(status)}">${escapeHtml(status)}</span></td><td>${renderSourceClock(clock)}</td><td>${escapeHtml(firstText(normalized.note, normalized.credit, 'Public receipt'))}</td></tr>`;
    });
    return `<div class="uranium-table-wrap"><table class="uranium-table"><caption class="sr-only">Uranium Chamber source and freshness ledger</caption><thead><tr><th>Source</th><th>Status</th><th>Evidence clock</th><th>Coverage</th></tr></thead><tbody>${rows.join('') || '<tr><td colspan="4">No source receipts available.</td></tr>'}</tbody></table></div>`;
}

function renderUnavailable(rows) {
    const normalized = Array.isArray(rows) ? rows : [];
    if (!normalized.length) return '';
    return `<div class="uranium-gap-grid">${normalized.map((item) => `<article class="uranium-gap"><span>Unavailable by design</span><h5>${escapeHtml(firstText(item?.label, item?.id, 'Coverage gap'))}</h5><p>${escapeHtml(firstText(item?.reason, item?.note, 'No reproducible public receipt is available.'))}</p></article>`).join('')}</div>`;
}

function renderProof(snapshot) {
    const physical = physicalModel(snapshot);
    const chain = chainModel(snapshot);
    const terms = issuerTermsModel(snapshot);
    const feeCeiling = terms.feeCeilingPct === null
        ? 'The issuer fee ceiling is unavailable in this snapshot.'
        : `Issuer documentation permits custody and administration fees of up to ${formatNumber(terms.feeCeilingPct, 2)}% annually, potentially implemented through token issuance.`;
    const currentFee = terms.feeCurrentlyCharged === null
        ? terms.feeStatusNote
        : `The snapshot reports a currently charged rate of ${formatNumber(terms.feeCurrentlyCharged, 2)}%.`;
    const pegCopy = terms.formalPeg === false
        ? 'Issuer documentation says there is no formal peg. Venues perform their own price discovery.'
        : 'This snapshot does not contain an equally direct current formal-peg statement.';
    return `
        <section class="uranium-proof-hero">
            <div><span class="uranium-eyebrow">Custody statement · point-in-time receipt</span><h3>${escapeHtml(formatNumber(physical.reserveKg, 3))} kgU as U3O8</h3><p>Cameco contract ending balance as at ${escapeHtml(formatDate(physical.statementDate))}. The issuer links the statement publicly; this Chamber preserves its document date and does not relabel it as live reserves.</p></div>
            <div class="uranium-proof-actions"><a href="${escapeHtml(physical.statementUrl || physical.proofPageUrl)}" target="_blank" rel="noopener noreferrer">Open PDF statement ↗</a><a href="${escapeHtml(physical.proofPageUrl)}" target="_blank" rel="noopener noreferrer">Issuer proof page ↗</a></div>
        </section>
        <section class="uranium-reconciliation" aria-label="Reserve-to-token reconciliation">
            <div><span>Statement balance</span><strong>${escapeHtml(formatNumber(physical.reserveLb, 3))} lb</strong><small>${escapeHtml(formatDate(physical.statementDate))}</small></div><i>×</i>
            <div><span>Avoirdupois ounces</span><strong>16</strong><small>per pound</small></div><i>÷</i>
            <div><span>Observed supply</span><strong>${escapeHtml(formatNumber(physical.supplyUsed ?? chain.supply, 4))}</strong><small>xU3O8</small></div><i>=</i>
            <div class="is-result"><span>Derived representation</span><strong>${escapeHtml(formatNumber(physical.ouncesPerToken, 6))} oz</strong><small>per token · dated arithmetic</small></div>
        </section>
        <p class="uranium-proof-warning">This reconciliation joins a dated custody document to a later on-chain supply observation. It is transparent arithmetic, not an independent audit, continuous attestation, legal opinion, or redemption guarantee. Future custody or administration-fee minting can change the amount represented by each token.</p>
        <section class="uranium-grid uranium-rights-grid">
            <article class="uranium-panel"><span class="uranium-eyebrow">Custody chain</span><h4>${escapeHtml(terms.trustee)} + ${escapeHtml(terms.storageOperator)}</h4><p>Issuer documents name ${escapeHtml(terms.trustee)} as the trustee account and ${escapeHtml(terms.storageOperator)} as the storage operator reflected by the contract statement.${issuerReceiptLink(terms.custodyReceipt)}</p></article>
            <article class="uranium-panel"><span class="uranium-eyebrow">Physical redemption</span><h4>Issuer-restricted, not ordinary retail delivery</h4><p>${escapeHtml(terms.redemptionCondition)}${issuerReceiptLink(terms.redemptionReceipt)}</p></article>
            <article class="uranium-panel"><span class="uranium-eyebrow">Fees and dilution</span><h4>Read the denominator</h4><p>${escapeHtml(feeCeiling)} ${escapeHtml(currentFee)}${issuerReceiptLink(terms.feeReceipt)}</p></article>
            <article class="uranium-panel"><span class="uranium-eyebrow">Market structure</span><h4>No assumed peg</h4><p>${escapeHtml(pegCopy)} A token can trade above or below the indicative uranium reference; neither quote is proof of executable physical value.${issuerReceiptLink(terms.priceReceipt)}</p></article>
        </section>
        <p class="uranium-footnote">${escapeHtml(terms.caveat)} ${escapeHtml(issuerRightsSummary(terms))}${issuerReceiptLink(terms.rightsReceipt, 'Issuer whitepaper')}</p>
        <section class="uranium-panel"><div class="uranium-panel-head"><div><span class="uranium-eyebrow">Source ledger</span><h4>Receipts and independent clocks</h4></div><span class="uranium-status is-neutral" id="uranium-proof-generated">Generated ${escapeHtml(ageLabel(snapshot.generatedAt))}</span></div>${renderSources(snapshot)}</section>
        ${renderUnavailable(snapshot.unavailable)}
        <nav class="uranium-pathways" aria-label="Continue through related Tezos Chambers">
            <a href="/minerals/">Critical Minerals<small>Place uranium beside the official strategic-minerals atlas</small></a>
            <a href="/metals/">Precious Metals<small>Compare gold, silver, six PGMs, and VNXAU receipts</small></a>
            <a href="/capital/">Capital Chamber<small>Place xU3O8 inside the wider Tezos capital system</small></a>
            <a href="/whales/">Whale Watch<small>Follow receipt-backed large movements</small></a>
        </nav>
    `;
}

function renderView(snapshot) {
    if (currentView === 'markets') return renderMarkets(snapshot);
    if (currentView === 'onchain') return renderChain(snapshot);
    if (currentView === 'proofbook') return renderProof(snapshot);
    return renderOverview(snapshot);
}

function freshnessPresentation(snapshot) {
    const generated = Date.parse(snapshot.generatedAt || '');
    const stale = !Number.isFinite(generated) || Date.now() - generated > STALE_AFTER_MS;
    const degraded = sourceInventory(snapshot).filter(({ status }) => status !== 'ok');
    const degradedLabel = degraded.length === 1
        ? `${degraded[0].label} ${degraded[0].status}`
        : degraded.length > 1 ? `${degraded.length} sources degraded` : '';
    const baseLabel = lastRefreshError
        ? `Last good ${ageLabel(snapshot.generatedAt)} · refresh failed · ${GENERATED_PROOFBOOK_SCHEDULE_LABEL}`
        : `Generated ${ageLabel(snapshot.generatedAt)} · ${GENERATED_PROOFBOOK_SCHEDULE_LABEL}`;
    return {
        label: degradedLabel ? `${baseLabel} · ${degradedLabel}` : baseLabel,
        stale: stale || Boolean(lastRefreshError) || degraded.length > 0
    };
}

function syncUraniumFreshness(snapshot) {
    syncSnapshotStatus(document.getElementById('uranium-chamber-body'), savedSnapshot, lastRefreshError);
    const presentation = freshnessPresentation(snapshot);
    const freshness = document.getElementById('uranium-freshness');
    if (freshness) {
        if (freshness.textContent !== presentation.label) freshness.textContent = presentation.label;
        freshness.classList.toggle('is-stale', presentation.stale);
    }
    const proofGenerated = document.getElementById('uranium-proof-generated');
    const proofLabel = `Generated ${ageLabel(snapshot.generatedAt)}`;
    if (proofGenerated && proofGenerated.textContent !== proofLabel) proofGenerated.textContent = proofLabel;
}

function renderChamber(snapshot) {
    const view = VIEWS.find(({ id }) => id === currentView) || VIEWS[0];
    const freshness = freshnessPresentation(snapshot);
    return `
        <header class="uranium-header market-room-header" data-quiet-key="uranium-header">
            <div class="uranium-system-strip market-room-system-strip"><strong>Tezos Systems</strong><span aria-hidden="true">/</span><span>commodity market intelligence</span></div>
            <div class="uranium-title-row market-room-title-row"><h2 class="market-room-title is-editorial" id="uranium-title">Uranium Chamber</h2><span class="uranium-badge market-room-badge">xU3O8</span><span class="uranium-freshness market-room-freshness${freshness.stale ? ' is-stale' : ''}" id="uranium-freshness" aria-live="polite">${escapeHtml(freshness.label)}</span></div>
            ${snapshotStatusMarkup(savedSnapshot, lastRefreshError)}<p class="uranium-intro market-room-intro">A source-bounded view of xU3O8, physical U3O8 custody receipts, Uranium.io, Kraken price discovery, and Etherlink state—with each claim kept on its natural clock.</p>
            <div class="uranium-tabs market-room-tabs" role="tablist" aria-label="Uranium Chamber views">${VIEWS.map((item) => `<button class="uranium-tab market-room-tab" id="uranium-tab-${item.id}" type="button" role="tab" aria-selected="${item.id === currentView}" aria-controls="uranium-view-panel" tabindex="${item.id === currentView ? '0' : '-1'}" data-uranium-view="${item.id}">${escapeHtml(item.label)}</button>`).join('')}</div>
        </header>
        <section class="uranium-view-shell market-room-view-shell" id="uranium-view-panel" role="tabpanel" aria-labelledby="uranium-tab-${view.id}" data-quiet-key="uranium-view-panel">
            <div class="uranium-view-head market-room-view-head"><div><h3>${escapeHtml(view.title)}</h3><p>${escapeHtml(view.detail)}</p></div></div>
            <div class="uranium-view-content market-room-view-content" id="uranium-view-content" data-quiet-key="uranium-view-content">${renderView(snapshot)}</div>
        </section>
        <p class="uranium-disclaimer">Information only · public-source observations · not investment, custody, legal, or trading advice.</p>
    `;
}

function renderLoading(body) {
    body.innerHTML = chamberSkeleton({
        title: 'Uranium Chamber', titleId: 'uranium-title',
        sections: ["Uranium references","Market history","Etherlink token receipts","Source proofbook"]
    });
}

function renderError(body, error) {
    body.innerHTML = `<div class="uranium-error chamber-state chamber-state-error"><div><strong>Uranium snapshot unavailable</strong><span>${escapeHtml(error?.message || error || 'The generated snapshot could not be loaded.')}</span><button class="chamber-action" type="button" data-uranium-retry>Retry</button></div></div>`;
}

function renderBody(snapshot, { quiet = false } = {}) {
    const body = document.getElementById('uranium-chamber-body');
    if (!body || !snapshot) return;
    const markup = renderChamber(snapshot);
    if (quiet && body.dataset.uraniumRendered === '1') quietlySyncHtml(body, markup);
    else body.innerHTML = markup;
    body.dataset.uraniumRendered = '1';
}

function entryMarkup(snapshot) {
    const coin = coinModel(snapshot);
    const kraken = krakenModel(snapshot);
    const physical = physicalModel(snapshot);
    const chain = chainModel(snapshot);
    const marketFreshnessSource = kraken.status === 'online'
        ? 'Kraken online'
        : (kraken.sourceKind === 'direct' ? 'Kraken WebSocket' : 'token market');
    return `
        <div class="uranium-entry-copy">
            <div class="uranium-entry-title-line"><h2 class="stat-label" id="uranium-entry-title">Uranium</h2><span class="uranium-entry-chip">xU3O8</span><span class="uranium-entry-live ${statusClass(kraken.status)}">Kraken ${escapeHtml(kraken.status)}</span></div>
            <div class="stat-value uranium-entry-value">${escapeHtml(formatUsd(kraken.last ?? coin.price, { digits: 3 }))}</div>
            <div class="uranium-entry-delta ${directionClass(kraken.change24h)}">${escapeHtml(formatPct(kraken.change24h, { signed: true }))} <span>Kraken 24h</span></div>
            <div class="stat-description">Physical uranium meets Etherlink price discovery</div>
            <div class="uranium-entry-freshness">${escapeHtml(formatFreshnessStamp(kraken.observedAt || coin.updatedAt || snapshot.generatedAt, { source: marketFreshnessSource }))}</div>
        </div>
        <div class="uranium-entry-art">${launcherPicture('is-entry')}</div>
        <div class="uranium-entry-kpis">
            <span><small>U₃O₈ oracle</small><strong>${escapeHtml(formatUsd(physical.oraclePrice))}/lb</strong></span>
            <span><small>Dated ratio</small><strong>${escapeHtml(formatNumber(physical.ouncesPerToken, 3))} oz/token</strong></span>
            <span><small>Holders</small><strong>${escapeHtml(formatNumber(chain.holders))}</strong></span>
        </div>
        <div class="uranium-entry-chart">${renderPriceChart(snapshot.market?.priceHistoryUsd, '30D', true)}</div>
    `;
}

function wireEntry(card) {
    if (!card) return;
    wireChamberLauncher(card, { open: openUraniumChamber, label: 'Open Uranium Chamber', titleSelector: '#uranium-entry-title, .stat-label' });
}

function updateEntry(snapshot, { quiet = false } = {}) {
    const front = document.getElementById('uranium-entry-front');
    if (!front || !snapshot) return;
    const markup = entryMarkup(snapshot);
    if (quiet && front.dataset.uraniumRendered === '1') quietlySyncHtml(front, markup);
    else front.innerHTML = markup;
    front.dataset.uraniumRendered = '1';
    const card = document.getElementById('uranium-entry-card');
    const currentFreshness = front.querySelector('.uranium-entry-freshness')?.textContent?.trim() || '';
    if (card && currentFreshness) card.dataset.updatedLabel = currentFreshness;
    else delete card?.dataset.updatedLabel;
    window.syncChamberEntryFooters?.(card);
    wireEntry(card);
}

function markRefreshFailure() {
    syncSnapshotStatus(document.getElementById('uranium-chamber-body'), savedSnapshot, lastRefreshError);
    const freshness = document.getElementById('uranium-freshness');
    if (freshness && lastSnapshot) {
        freshness.textContent = `Last good ${ageLabel(lastSnapshot.generatedAt)} · refresh failed · ${GENERATED_PROOFBOOK_SCHEDULE_LABEL}`;
        freshness.classList.add('is-stale');
    }
    const card = document.getElementById('uranium-entry-card');
    if (card && (lastSnapshot || lastEntrySummary)) {
        const source = lastSnapshot || lastEntrySummary;
        card.dataset.updatedLabel = `Last good ${ageLabel(source.generatedAt)} · refresh failed · ${GENERATED_PROOFBOOK_SCHEDULE_LABEL}`;
        window.syncChamberEntryFooters?.(card);
    }
}

function isUraniumRoute() {
    return window.location.pathname.replace(/\/+$/, '') === '/uranium';
}

function routeView() {
    if (!isUraniumRoute()) return '';
    const value = new URL(window.location.href).searchParams.get('view') || '';
    return VIEW_IDS.has(value) ? value : '';
}

function routeRange() {
    if (!isUraniumRoute()) return '';
    const value = new URL(window.location.href).searchParams.get('range')?.toUpperCase() || '';
    return RANGE_BY_ID.has(value) ? value : '';
}

function updateRouteView() {
    if (!isUraniumRoute()) return;
    const url = new URL(window.location.href);
    url.searchParams.set('view', currentView);
    if (currentView === 'markets') url.searchParams.set('range', currentRange);
    else url.searchParams.delete('range');
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

function updateChartLookup(chart, requestedIndex) {
    const chartId = chart?.dataset?.uraniumChart;
    const series = chartSeriesRegistry.get(chartId);
    if (!chart || !series?.points?.length) return;
    const index = Math.max(0, Math.min(series.points.length - 1, Math.round(requestedIndex)));
    const point = series.points[index];
    const coordinate = series.coordinates[index];
    const detail = chartPointDetail(point, series);
    chartLookupState.set(series.rangeId, point.timestamp);
    const crosshair = chart.querySelector('[data-uranium-chart-crosshair]');
    const line = crosshair?.querySelector('line');
    const circle = crosshair?.querySelector('circle');
    if (line) {
        line.setAttribute('x1', coordinate.x.toFixed(2));
        line.setAttribute('x2', coordinate.x.toFixed(2));
    }
    if (circle) {
        circle.setAttribute('cx', coordinate.x.toFixed(2));
        circle.setAttribute('cy', coordinate.y.toFixed(2));
    }
    const hitbox = chart.querySelector('[data-uranium-chart-hitbox]');
    hitbox?.setAttribute('aria-valuenow', String(index));
    hitbox?.setAttribute('aria-valuetext', detail.aria);
    const values = {
        '[data-uranium-chart-time]': detail.time,
        '[data-uranium-chart-price]': detail.price,
        '[data-uranium-chart-primary]': detail.primary,
        '[data-uranium-chart-secondary]': detail.secondary
    };
    for (const [selector, value] of Object.entries(values)) {
        const node = chart.querySelector(selector);
        if (node) node.textContent = value;
    }
}

function chartIndexFromPointer(hitbox, clientX) {
    const chart = hitbox?.closest('[data-uranium-chart]');
    const series = chartSeriesRegistry.get(chart?.dataset?.uraniumChart);
    const bounds = hitbox?.getBoundingClientRect();
    if (!series?.points?.length || !bounds?.width) return null;
    const ratio = Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width));
    const targetX = series.left + (ratio * (series.right - series.left));
    return series.coordinates.reduce((best, coordinate, index) => (
        Math.abs(coordinate.x - targetX) < Math.abs(series.coordinates[best].x - targetX) ? index : best
    ), 0);
}

function bindBodyEvents(body) {
    if (!body || body.dataset.uraniumEventsWired === '1') return;
    body.dataset.uraniumEventsWired = '1';
    body.addEventListener('click', (event) => {
        const viewButton = event.target.closest('[data-uranium-view]');
        if (viewButton && VIEW_IDS.has(viewButton.dataset.uraniumView)) {
            currentView = viewButton.dataset.uraniumView;
            updateRouteView();
            renderBody(lastSnapshot);
            focusChamberTab(document.getElementById(`uranium-tab-${currentView}`));
            return;
        }
        const rangeButton = event.target.closest('[data-uranium-range]');
        if (rangeButton && RANGE_BY_ID.has(rangeButton.dataset.uraniumRange)) {
            currentRange = rangeButton.dataset.uraniumRange;
            updateRouteView();
            renderBody(lastSnapshot);
            document.querySelector(`[data-uranium-range="${currentRange}"]`)?.focus({ preventScroll: true });
            return;
        }
        const copyButton = event.target.closest('[data-uranium-copy]');
        if (copyButton) {
            copyText(copyButton, copyButton.dataset.uraniumCopy);
            return;
        }
        if (event.target.closest('[data-uranium-retry]')) refreshUraniumChamber({ quiet: false });
    });
    body.addEventListener('pointermove', (event) => {
        const hitbox = event.target.closest('[data-uranium-chart-hitbox]');
        if (!hitbox) return;
        const index = chartIndexFromPointer(hitbox, event.clientX);
        if (index !== null) updateChartLookup(hitbox.closest('[data-uranium-chart]'), index);
    });
    body.addEventListener('pointerdown', (event) => {
        const hitbox = event.target.closest('[data-uranium-chart-hitbox]');
        if (!hitbox) return;
        const index = chartIndexFromPointer(hitbox, event.clientX);
        if (index !== null) updateChartLookup(hitbox.closest('[data-uranium-chart]'), index);
    });
    body.addEventListener('keydown', (event) => {
        const chartHitbox = event.target.closest('[data-uranium-chart-hitbox]');
        if (chartHitbox && ['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) {
            event.preventDefault();
            const chart = chartHitbox.closest('[data-uranium-chart]');
            const series = chartSeriesRegistry.get(chart?.dataset?.uraniumChart);
            if (!series?.points?.length) return;
            const current = Number(chartHitbox.getAttribute('aria-valuenow')) || 0;
            const page = Math.max(1, Math.round(series.points.length / 10));
            const next = event.key === 'Home' ? 0
                : event.key === 'End' ? series.points.length - 1
                    : event.key === 'ArrowLeft' ? current - 1
                        : event.key === 'ArrowRight' ? current + 1
                            : event.key === 'PageUp' ? current + page
                                : current - page;
            updateChartLookup(chart, next);
            return;
        }
        const activeTab = event.target.closest('[role="tab"][data-uranium-view]');
        if (!activeTab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const index = VIEWS.findIndex(({ id }) => id === activeTab.dataset.uraniumView);
        let next = index;
        if (event.key === 'ArrowLeft') next = (index - 1 + VIEWS.length) % VIEWS.length;
        if (event.key === 'ArrowRight') next = (index + 1) % VIEWS.length;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = VIEWS.length - 1;
        currentView = VIEWS[next].id;
        updateRouteView();
        renderBody(lastSnapshot);
        focusChamberTab(document.getElementById(`uranium-tab-${currentView}`));
    });
}

function ensureOverlay() {
    let overlay = document.getElementById('uranium-modal');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'uranium-modal';
    overlay.className = 'modal-overlay chamber-overlay uranium-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
        <div class="modal-content modal-large chamber-content uranium-content market-room-shell" role="dialog" aria-modal="true" aria-labelledby="uranium-title">
            <button class="modal-close chamber-close" type="button" aria-label="Close Uranium Chamber">&times;</button>
            <div class="uranium-body market-room-body" id="uranium-chamber-body"></div>
        </div>
    `;
    overlay.querySelector('.chamber-close').addEventListener('click', closeUraniumChamber);
    overlay.addEventListener('click', (event) => { if (event.target === overlay) closeUraniumChamber(); });
    bindBodyEvents(overlay.querySelector('.uranium-body'));
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
    const override = numeric(window.__URANIUM_CHAMBER_REFRESH_MS__);
    return override !== null && override >= 1000 ? override : DEFAULT_REFRESH_MS;
}

function stopRefreshTimer() {
    if (chamberTimer) window.clearInterval(chamberTimer);
    chamberTimer = null;
}

function startRefreshTimer() {
    stopRefreshTimer();
    startKrakenStream();
    chamberTimer = window.setInterval(() => {
        if (document.visibilityState !== 'visible') {
            refreshDeferred = true;
            return;
        }
        refreshUraniumChamber({ quiet: true });
        startKrakenStream();
    }, refreshInterval());
}

function bindVisibilityRefresh() {
    if (visibilityReady) return;
    visibilityReady = true;
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') {
            stopKrakenStream();
            return;
        }
        if (entryRefreshDeferred) {
            entryRefreshDeferred = false;
            refreshUraniumEntry({ quiet: true });
        }
        const overlayOpen = document.getElementById('uranium-modal')?.classList.contains('active');
        if (overlayOpen) startKrakenStream();
        if (!refreshDeferred && !overlayOpen) return;
        refreshDeferred = false;
        refreshUraniumChamber({ quiet: true });
    });
}

async function refreshUraniumEntry({ quiet = true } = {}) {
    if (document.visibilityState !== 'visible') {
        entryRefreshDeferred = true;
        return lastSnapshot || lastEntrySummary;
    }
    try {
        const summary = await fetchUraniumEntrySummary();
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
        console.warn('Uranium Chamber entry summary refresh failed; retaining the last good launcher:', error);
        entryRefreshDeferred = true;
        const retained = lastEntrySummary || lastSnapshot;
        if (!retained) markUraniumEntryUnavailable(error);
        return retained;
    }
}

function markUraniumEntryUnavailable(error) {
    const card = document.getElementById('uranium-entry-card');
    if (!card) return;
    const value = card.querySelector('.uranium-entry-value');
    if (value) {
        value.textContent = 'Unavailable';
        value.setAttribute('role', 'status');
        value.setAttribute('aria-live', 'polite');
    }
    const kpis = card.querySelector('.uranium-entry-kpis');
    if (kpis) kpis.innerHTML = '<span><small>Proofbook</small><strong>Unavailable</strong></span><span><small>Receipt</small><strong>No last-good summary</strong></span>';
    card.classList.add('chamber-data-stale');
    card.dataset.updatedLabel = 'Unavailable · refresh failed · no last-good receipt';
    card.title = error?.message || 'Uranium launcher receipt unavailable';
    window.syncChamberEntryFooters?.(card);
}

async function refreshUraniumChamber({ quiet = true, initial = false } = {}) {
    // Only a requested, not-yet-painted room may finish its initial load hidden.
    // All repeat rendering, network polling, and catch-up work remain gated.
    const mayRender = () => document.visibilityState === 'visible'
        || (initial && !lastSnapshot && document.getElementById('uranium-modal')?.classList.contains('active'));
    if (!mayRender()) {
        refreshDeferred = true;
        return lastSnapshot;
    }
    if (chamberRefreshWork) return chamberRefreshWork;
    quiet = quiet || Boolean(lastSnapshot);
    chamberRefreshWork = (async () => {
        try {
            const hadRefreshError = Boolean(lastRefreshError);
            const result = pendingSnapshotRefresh || await resolveUraniumSnapshotRefresh();
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
                else syncUraniumFreshness(snapshot);
            }
            if ((changed || hadRefreshError) && document.getElementById('uranium-modal')?.classList.contains('active')) {
                renderBody(snapshot, { quiet });
            }
            return snapshot;
        } catch (error) {
            if (!mayRender()) {
                refreshDeferred = true;
                return lastSnapshot;
            }
            console.warn('Uranium Chamber snapshot refresh failed:', error);
            lastRefreshError = error?.message || String(error);
            markRefreshFailure();
            const body = document.getElementById('uranium-chamber-body');
            if (!lastSnapshot && body && document.getElementById('uranium-modal')?.classList.contains('active')) renderError(body, error);
            return lastSnapshot;
        }
    })().finally(() => { chamberRefreshWork = null; });
    return chamberRefreshWork;
}

function ensureEntryCard() {
    const existing = document.getElementById('uranium-entry-card');
    if (existing) return existing;
    const grid = document.getElementById('chambers-grid');
    if (!grid) return null;
    const card = document.createElement('article');
    card.id = 'uranium-entry-card';
    card.className = 'stat-card chamber-entry-card chamber-entry-wide chamber-entry-live uranium-entry-card';
    card.dataset.chamberEntrySize = 'wide';
    card.innerHTML = `
        <button class="card-copy-link" type="button" data-copy-hash="#uranium" aria-label="Copy Uranium Chamber direct link" title="Copy Uranium Chamber link">&#128279;</button>
        <div class="card-inner"><div class="card-front chamber-entry-front uranium-entry-front" id="uranium-entry-front">
            <div class="uranium-entry-copy"><div class="uranium-entry-title-line"><h2 class="stat-label" id="uranium-entry-title">Uranium</h2><span class="uranium-entry-chip">xU3O8</span></div><div class="stat-value uranium-entry-value">Loading core</div><div class="stat-description">Physical uranium meets Etherlink price discovery</div></div>
            <div class="uranium-entry-art">${launcherPicture('is-entry')}</div>
            <div class="uranium-entry-kpis"><span><small>Proofbook</small><strong>Verifying</strong></span></div>
        </div></div>
    `;
    grid.appendChild(card);
    return card;
}

export async function openUraniumChamber() {
    const opening = ++openEpoch;
    const cached = !lastSnapshot ? snapshotCache.read() : null;
    await ensureUraniumCss();
    if (opening !== openEpoch) return;
    const route = routeView();
    if (route) currentView = route;
    const range = routeRange();
    if (range) currentRange = range;
    const overlay = ensureOverlay();
    const body = overlay.querySelector('.uranium-body');
    overlay.classList.add('active');
    lockPageScroll();
    const paintedSnapshot = Boolean(lastSnapshot);
    if (paintedSnapshot) renderBody(lastSnapshot);
    else renderLoading(body);
    body.scrollTop = 0;
    activateChamberDialog(overlay, {
        close: closeUraniumChamber,
        dialogSelector: '.uranium-content',
        titleId: 'uranium-title',
        label: 'Uranium Chamber',
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
    await refreshUraniumChamber({ quiet: true, initial: true });
    if (opening === openEpoch && overlay.classList.contains('active')) {
        startRefreshTimer();
        startKrakenStream();
    }
}

export function closeUraniumChamber() {
    openEpoch += 1;
    stopRefreshTimer();
    stopKrakenStream();
    const overlay = document.getElementById('uranium-modal');
    overlay?.classList.remove('active');
    deactivateChamberDialog(overlay);
    unlockPageScroll();
}

export function initUraniumChamber() {
    ensureUraniumCss().catch((error) => console.warn('Uranium Chamber styles unavailable', error));
    bindVisibilityRefresh();
    const card = ensureEntryCard();
    wireEntry(card);
    if (lastSnapshot) updateEntry(lastSnapshot);
    else if (lastEntrySummary) updateEntry(lastEntrySummary);
    else if (document.visibilityState === 'visible') refreshUraniumEntry({ quiet: false });
    else entryRefreshDeferred = true;
}
