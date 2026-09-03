import { renderChamberVerdict, renderChamberGuide, renderChamberStamp, settleChamberArrival } from '../ui/chamber-reading.js';
import { requestChamberClose } from '../ui/chamber-accessibility.js';
/**
 * Ledger Flow Chamber
 * Account-level diagram for bounded tez transfers and all-time account context.
 */

import { API_URLS } from '../core/config.js';
import { versionedAsset } from '../core/asset-version.js';
import { fetchWithRetry } from '../core/api.js';
import { quietlyMutate, quietlySyncHtml } from '../core/quiet-refresh.js';
import {
    isTezDomainName,
    isTezosAddress,
    normalizeTezDomainName,
    resolveTezDomainRecord
} from '../core/tezos-domains.js';
import { escapeHtml, formatFreshnessStamp } from '../core/utils.js';
import { activateChamberDialog, deactivateChamberDialog, wireChamberLauncher } from '../ui/chamber-accessibility.js';
import { ensureChamberStylesheet } from '../ui/chamber-styles.js';
import {
    getWhaleWatchArtifact,
    peekWhaleWatchArtifactState,
    subscribeWhaleWatchArtifact
} from './whale-chamber.js';
import {
    buildLedgerFlowEntryProjection,
    buildLedgerFlowModel,
    buildLedgerFlowTimeline,
    filterLedgerCounterparties,
    layoutLedgerFlowNodes
} from './ledger-flow-model.mjs';

const TZKT = API_URLS.tzkt;
const STORAGE_KEY = 'tezos-systems-my-baker-address';
const LAST_TARGET_KEY = 'tezos-systems-ledger-flow-target';
const WINDOW_KEY = 'tezos-systems-ledger-flow-window';
const THRESHOLD_KEY = 'tezos-systems-ledger-flow-threshold-index';
const LEDGER_FLOW_CSS_URL = versionedAsset('/css/ledger-flow.min.css');
const DEFAULT_WINDOW = '30d';
const TRANSFER_PAGE_LIMIT = 10000;
const EXACT_ROW_LIMIT = 20000;
const SAMPLE_ROW_LIMIT = 10000;
const LOAD_TIMEOUT_MS = 20000;
const TRANSFER_FIELDS = 'id,hash,level,timestamp,amount,sender,target';
const NODE_MIN_WIDTH = 188;
const NODE_MAX_WIDTH = 252;
const NODE_HEIGHT = 62;
const NODE_TEXT_PAD = 30;
const NODE_MIN_GAP = 18;
const DESKTOP_DIRECTION_PREVIEW = 4;
const COUNTERPARTY_PAGE_SIZE = 25;
const MOBILE_DIRECTION_PREVIEW = 5;

const WINDOW_OPTIONS = [
    { key: '24h', label: '24H', ms: 24 * 60 * 60 * 1000 },
    { key: '7d', label: '7D', ms: 7 * 24 * 60 * 60 * 1000 },
    { key: '30d', label: '30D', ms: 30 * 24 * 60 * 60 * 1000 },
    { key: '1y', label: '1Y', ms: 365 * 24 * 60 * 60 * 1000 },
    { key: 'all', label: 'All', ms: null }
];

const THRESHOLDS = [
    { label: '0 XTZ', mutez: 0 },
    { label: '1 XTZ', mutez: 1e6 },
    { label: '10 XTZ', mutez: 10e6 },
    { label: '100 XTZ', mutez: 100e6 },
    { label: '1K XTZ', mutez: 1000e6 },
    { label: '10K XTZ', mutez: 10000e6 },
    { label: '100K XTZ', mutez: 100000e6 }
];

let savedBodyOverflow = null;
let savedHtmlOverflow = null;
let activeWindow = loadStoredWindow();
let thresholdIndex = loadStoredThresholdIndex();
let activeTarget = '';
let activeLabel = '';
let activeData = null;
let renderSeq = 0;
let activeLoad = null;
let thresholdReloadTimer = null;
let whaleSeed = null;
let selectedEdgeId = '';
let chamberOpenGeneration = 0;
let whaleArtifactState = null;
let whaleArtifactUnsubscribe = null;
let ledgerEntryProjection = null;
let entryResumeListenersReady = false;
let counterpartyQuery = '';
let counterpartySort = 'total';
let counterpartyVisibleCount = COUNTERPARTY_PAGE_SIZE;
const mobileExpandedDirections = {
    received: false,
    sent: false
};

function ensureLedgerFlowStyles() {
    return ensureChamberStylesheet('ledger-flow-css', LEDGER_FLOW_CSS_URL);
}

function readStorage(key) {
    try {
        return localStorage.getItem(key) || '';
    } catch {
        return '';
    }
}

function writeStorage(key, value) {
    try {
        localStorage.setItem(key, String(value));
        return true;
    } catch {
        return false;
    }
}

function loadStoredWindow() {
    const stored = readStorage(WINDOW_KEY);
    return WINDOW_OPTIONS.some((item) => item.key === stored) ? stored : DEFAULT_WINDOW;
}

function loadStoredThresholdIndex() {
    const stored = Number(readStorage(THRESHOLD_KEY));
    return Number.isFinite(stored) && stored >= 0 && stored < THRESHOLDS.length ? stored : 0;
}

function isTezosAccount(value) {
    return isTezosAddress(String(value || '').trim());
}

function shortAddress(address) {
    const value = String(address || '');
    if (value.length <= 14) return value || 'unknown';
    return `${value.slice(0, 7)}...${value.slice(-5)}`;
}

function accountHref(address) {
    return `#my-baker=${encodeURIComponent(address)}`;
}

function tzktAccountHref(address) {
    return `https://tzkt.io/${encodeURIComponent(address)}`;
}

function formatCompactXTZ(mutez, options = {}) {
    const xtz = Number(mutez || 0) / 1e6;
    if (!Number.isFinite(xtz)) return '0 XTZ';
    if (xtz === 0) return '0 XTZ';
    const suffix = options.withUnit === false ? '' : ' XTZ';
    if (Math.abs(xtz) >= 1000000) return `${(xtz / 1000000).toFixed(2)}M${suffix}`;
    if (Math.abs(xtz) >= 1000) return `${(xtz / 1000).toFixed(1)}K${suffix}`;
    if (Math.abs(xtz) >= 10) return `${xtz.toFixed(1)}${suffix}`;
    if (Math.abs(xtz) >= 1) return `${xtz.toFixed(2)}${suffix}`;
    return `<0.01${suffix}`;
}

function formatCount(value) {
    return Number(value || 0).toLocaleString('en-US');
}

function formatDate(value) {
    if (!value) return 'unknown';
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return 'unknown';
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC'
    });
}

function formatAge(value) {
    if (!value) return 'time unknown';
    const diff = Date.now() - new Date(value).getTime();
    if (!Number.isFinite(diff)) return 'time unknown';
    if (diff < 0) return 'just now';
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 365) return `${days}d ago`;
    return `${Math.floor(days / 365)}y ago`;
}

function transactionUrl(params) {
    const url = new URL(`${TZKT}/operations/transactions`);
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    });
    return url.toString();
}

function transactionCountUrl(params) {
    const url = new URL(`${TZKT}/operations/transactions/count`);
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    });
    return url.toString();
}

function originationUrl(params) {
    const url = new URL(`${TZKT}/operations/originations`);
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    });
    return url.toString();
}

async function fetchJson(url, signal) {
    return fetchWithRetry(url, {
        signal,
        memoryCache: false,
        cache: 'no-store',
        timeoutMs: 12000
    }, 2);
}

async function resolveLedgerTarget(rawTarget, signal) {
    const target = String(rawTarget || '').trim();
    if (!target) return { address: '', label: '', resolution: null };
    if (isTezosAccount(target)) {
        return {
            address: target,
            label: target,
            resolution: { name: '', address: target, source: 'address' }
        };
    }
    if (isTezDomainName(target)) {
        const domain = normalizeTezDomainName(target);
        const record = await resolveTezDomainRecord(domain, { signal });
        return {
            address: record?.resolvedAddress || record?.address || '',
            label: domain,
            resolution: record
        };
    }
    return { address: '', label: target, resolution: null };
}

function windowTimestamp(windowKey, until = new Date().toISOString()) {
    const option = WINDOW_OPTIONS.find((item) => item.key === windowKey) || WINDOW_OPTIONS[2];
    if (!option.ms) return null;
    return new Date(new Date(until).getTime() - option.ms).toISOString();
}

function transferScope(address, boundary, thresholdMutez) {
    const params = {
        status: 'applied',
        'anyof.sender.target': address,
        'timestamp.lt': boundary.until
    };
    if (Number(thresholdMutez || 0) > 0) params['amount.ge'] = Number(thresholdMutez);
    else params['amount.gt'] = 0;
    if (boundary.since) params['timestamp.gt'] = boundary.since;
    return params;
}

async function fetchTransferCount(address, boundary, thresholdMutez, signal) {
    const value = await fetchJson(
        transactionCountUrl(transferScope(address, boundary, thresholdMutez)),
        signal
    );
    const count = Number(value);
    if (!Number.isSafeInteger(count) || count < 0) {
        throw new Error('TzKT transfer count returned an invalid value');
    }
    return count;
}

async function fetchTransfers(address, boundary, thresholdMutez, coverage, signal) {
    const rows = [];
    let cursor = '';
    const rowLimit = coverage.mode === 'sample' ? SAMPLE_ROW_LIMIT : coverage.totalRows;
    const maxRequests = coverage.mode === 'sample' ? 1 : Math.ceil(EXACT_ROW_LIMIT / TRANSFER_PAGE_LIMIT);
    let requestCount = 0;

    while (rows.length < rowLimit && requestCount < maxRequests) {
        const remaining = rowLimit - rows.length;
        const params = {
            ...transferScope(address, boundary, thresholdMutez),
            select: TRANSFER_FIELDS,
            limit: Math.min(TRANSFER_PAGE_LIMIT, remaining)
        };
        if (coverage.mode === 'sample') {
            params['sort.desc'] = 'amount';
        } else {
            params['sort.desc'] = 'id';
            if (cursor) params['id.lt'] = cursor;
        }

        requestCount += 1;
        const page = await fetchJson(transactionUrl(params), signal);
        if (!Array.isArray(page)) throw new Error('TzKT transfer history returned a non-array response');
        rows.push(...page);
        if (coverage.mode === 'sample' || page.length < Number(params.limit)) break;

        const nextCursor = String(page.at(-1)?.id || '');
        if (!/^\d+$/.test(nextCursor) || nextCursor === cursor) {
            throw new Error('TzKT transfer history pagination did not advance');
        }
        cursor = nextCursor;
    }

    if (rows.length < Math.min(rowLimit, coverage.totalRows)) {
        throw new Error('TzKT transfer history ended before its observed count');
    }
    return rows;
}

async function fetchFirstInbound(address, signal) {
    const rows = await fetchJson(transactionUrl({
        target: address,
        'sender.ne': address,
        status: 'applied',
        'amount.gt': 0,
        'sort.asc': 'id',
        select: TRANSFER_FIELDS,
        limit: 1
    }), signal);
    return Array.isArray(rows) ? rows[0] || null : null;
}

async function fetchOrigination(address, signal) {
    const rows = await fetchJson(originationUrl({
        originatedContract: address,
        status: 'applied',
        'sort.asc': 'id',
        select: 'id,level,timestamp,sender,originatedContract,contractBalance',
        limit: 1
    }), signal);
    return Array.isArray(rows) ? rows[0] || null : null;
}

async function fetchAccount(address, signal) {
    try {
        return await fetchJson(`${TZKT}/accounts/${encodeURIComponent(address)}`, signal);
    } catch (error) {
        if (error?.name === 'AbortError') throw error;
        if (/^HTTP 404\b/.test(String(error?.message || ''))) {
            throw new Error('TzKT does not recognize this account.');
        }
        return null;
    }
}

function edgeWidth(amount, maxAmount) {
    const max = Math.max(Number(maxAmount || 0), 1);
    const value = Math.max(Number(amount || 0), 1);
    const ratio = Math.log10(value + 1) / Math.log10(max + 1);
    return 1.1 + Math.max(0, Math.min(1, ratio)) * 6.4;
}

function edgeOpacity(amount, maxAmount) {
    const max = Math.max(Number(maxAmount || 0), 1);
    const value = Math.max(Number(amount || 0), 1);
    const ratio = Math.log10(value + 1) / Math.log10(max + 1);
    return 0.22 + Math.max(0, Math.min(1, ratio)) * 0.68;
}

function nodeLabel(item) {
    return item.label || item.alias || shortAddress(item.address);
}

function nodeSubLabel(item) {
    const sample = item.sample ? ' sample' : '';
    if (item.isCohort) {
        return `${formatCount(item.memberCount)} counterparties · ${formatCompactXTZ(item.total)}${sample}`;
    }
    if (item.isContext) return 'all-time first value';
    if (item.isFirstValue) return `first value · ${formatCompactXTZ(item.total)}${sample}`;
    return `${formatCompactXTZ(item.total)}${sample}`;
}

function truncate(value, max = 22) {
    const text = String(value || '');
    if (text.length <= max) return text;
    return `${text.slice(0, Math.max(0, max - 1))}...`;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function fittedText(value, width, charWidth) {
    const maxChars = Math.max(4, Math.floor((width - NODE_TEXT_PAD) / charWidth));
    return truncate(value, maxChars);
}

function nodeGeometry(item) {
    const title = nodeLabel(item);
    const sub = nodeSubLabel(item);
    const desired = Math.max(title.length * 8.5, sub.length * 6.2) + 42;
    return {
        width: clamp(Math.ceil(desired), NODE_MIN_WIDTH, NODE_MAX_WIDTH),
        height: NODE_HEIGHT
    };
}

function accountLinksMarkup(account, options = {}) {
    const address = account?.address || '';
    if (!address) return '';
    const label = options.label || nodeLabel(account);
    const nameClass = options.nameClass ? ` ${options.nameClass}` : '';
    const wrapClass = options.wrapClass ? ` ${options.wrapClass}` : '';
    return `
        <span class="ledger-flow-account-actions${wrapClass}" title="${escapeHtml(address)}">
            <a class="ledger-flow-account-link ledger-flow-my-tezos-link${nameClass}" href="${accountHref(address)}" title="Open in My Tezos">${escapeHtml(label)}</a>
            <a class="lb-baker-source-link ledger-flow-tzkt-pill" href="${tzktAccountHref(address)}" target="_blank" rel="noopener" title="View on TzKT">TzKT</a>
        </span>
    `;
}

function addressLinkMarkup(address, options = {}) {
    if (!address) return '';
    const text = options.text || shortAddress(address);
    const className = options.className ? ` ${options.className}` : '';
    return `<a class="ledger-flow-address-link ledger-flow-my-tezos-link${className}" href="${accountHref(address)}" title="Open ${escapeHtml(address)} in My Tezos">${escapeHtml(text)}</a>`;
}

function renderEdge(edge, layout, maxAmount, index) {
    const center = layout.center;
    const pos = layout.positions.get(edge.counterparty.key);
    if (!pos) return '';
    const from = edge.direction === 'sent' ? center : pos;
    const to = edge.direction === 'sent' ? pos : center;
    const leftToRight = to.x > from.x;
    const curve = edge.direction === 'first' ? 58 : (edge.direction === 'sent' ? 92 : -92);
    const c1x = from.x + (leftToRight ? 150 : -150);
    const c2x = to.x + (leftToRight ? -150 : 150);
    const c1y = from.y + curve;
    const c2y = to.y + curve;
    const width = edge.direction === 'first'
        ? '2.40'
        : edgeWidth(edge.amount, maxAmount).toFixed(2);
    const opacity = edge.direction === 'first'
        ? '0.82'
        : edgeOpacity(edge.amount, maxAmount).toFixed(2);
    const marker = edge.direction === 'sent'
        ? 'sent'
        : edge.direction === 'first' || edge.isFirstValue ? 'first' : 'received';
    const firstLabel = edge.event?.kind === 'origination' ? 'Funded at origination by' : 'First inbound from';
    const amountLabel = edge.amount > 0 ? ` ${formatCompactXTZ(edge.amount)}` : '';
    const label = edge.direction === 'first'
        ? `${firstLabel}${amountLabel} ${nodeLabel(edge.counterparty)}`
        : `${edge.direction === 'sent' ? 'Sent' : 'Received'} ${formatCompactXTZ(edge.amount)} ${edge.direction === 'sent' ? 'to' : 'from'} ${nodeLabel(edge.counterparty)}`;
    const classes = [
        'ledger-flow-edge',
        `ledger-flow-edge-${edge.direction}`,
        edge.isFirstValue ? 'ledger-flow-edge-first ledger-flow-edge-first-value is-first-value' : ''
    ].filter(Boolean).join(' ');
    const path = `M ${from.x} ${from.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${to.x} ${to.y}`;
    return `
        <path class="${classes}" data-ledger-edge="${escapeHtml(edge.id)}" d="${path}" stroke-width="${width}" opacity="${opacity}" marker-end="url(#ledger-arrow-${marker})">
            <title>${escapeHtml(label)}</title>
        </path>
        ${edge.isFirstValue ? `<circle class="ledger-flow-first-pulse" cx="${from.x}" cy="${from.y}" r="${14 + (index % 2) * 3}"></circle>` : ''}
    `;
}

function renderNode(item, layout) {
    const pos = layout.positions.get(item.key);
    if (!pos) return '';
    const classes = ['ledger-flow-node'];
    if (item.isFirstValue || item.isContext) classes.push('is-first');
    if (item.isCohort) classes.push('is-cohort');
    const geometry = nodeGeometry(item);
    const x = pos.x - geometry.width / 2;
    const y = pos.y - geometry.height / 2;
    const label = fittedText(nodeLabel(item), geometry.width, 8.5);
    const sub = fittedText(nodeSubLabel(item), geometry.width, 6.2);
    return `
        <g class="${classes.join(' ')}" transform="translate(${x} ${y})">
            <rect width="${geometry.width}" height="${geometry.height}" rx="9"></rect>
            <text class="ledger-flow-node-title" x="${geometry.width / 2}" y="25" text-anchor="middle">${escapeHtml(label)}</text>
            <text class="ledger-flow-node-sub" x="${geometry.width / 2}" y="43" text-anchor="middle">${escapeHtml(sub)}</text>
        </g>
    `;
}

function renderFlowRow(edge, model, options = {}) {
    const counterparty = edge.counterparty;
    const selected = selectedEdgeId === edge.id;
    const direction = edge.direction === 'sent'
        ? 'Out to'
        : edge.direction === 'first'
            ? 'All-time first value from'
            : 'In from';
    const amount = edge.amount > 0 ? formatCompactXTZ(edge.amount) : 'origin receipt';
    const scope = model.coverage?.mode === 'sample' ? ' · sample' : '';
    const links = !counterparty.isCohort && counterparty.address
        ? accountLinksMarkup(counterparty, { wrapClass: 'ledger-flow-row-links' })
        : '';
    return `
        <article class="ledger-flow-flow-row${selected ? ' is-selected' : ''}" data-chamber-arrival="row" data-quiet-key="${escapeHtml(edge.id)}">
            <button type="button" class="ledger-flow-path-button" data-ledger-edge="${escapeHtml(edge.id)}" aria-pressed="${selected ? 'true' : 'false'}" aria-controls="${escapeHtml(options.controls || 'ledger-flow-detail-panel')}">
                <span class="ledger-flow-path-direction">${escapeHtml(direction)}</span>
                <strong>${escapeHtml(nodeLabel(counterparty))}</strong>
                <small>${escapeHtml(amount)}${scope} · ${escapeHtml(formatCount(edge.count))} ${edge.count === 1 ? 'row' : 'rows'}</small>
            </button>
            ${links}
        </article>
    `;
}

function renderDirectionRatio(model) {
    const received = Number(model.totals.received || 0);
    const sent = Number(model.totals.sent || 0);
    const gross = received + sent;
    const receivedPercent = gross > 0 ? (received / gross) * 100 : 0;
    const sentPercent = gross > 0 ? 100 - receivedPercent : 0;
    const ratioLabel = gross > 0
        ? `Received ${receivedPercent.toFixed(1)} percent and sent ${sentPercent.toFixed(1)} percent of mapped tez`
        : 'No matching window tez to compare by direction';
    return `
        <div class="ledger-flow-direction-ratio" role="img" aria-label="${escapeHtml(ratioLabel)}">
            <div class="ledger-flow-direction-ratio-labels">
                <span><i data-kind="received"></i>In ${escapeHtml(formatCompactXTZ(received))}</span>
                <span>Out ${escapeHtml(formatCompactXTZ(sent))}<i data-kind="sent"></i></span>
            </div>
            <div class="ledger-flow-direction-ratio-track" aria-hidden="true">
                <i data-kind="received" style="width:${receivedPercent.toFixed(2)}%"></i>
                <i data-kind="sent" style="width:${sentPercent.toFixed(2)}%"></i>
            </div>
        </div>
    `;
}

function renderMobileDirection(edges, model, direction) {
    const inbound = direction === 'received';
    const label = inbound ? 'Into account' : 'Out of account';
    const visible = edges.slice(0, MOBILE_DIRECTION_PREVIEW);
    const hidden = edges.slice(MOBILE_DIRECTION_PREVIEW);
    return `
        <section class="ledger-flow-mobile-direction" aria-labelledby="ledger-flow-mobile-${escapeHtml(direction)}">
            <h3 id="ledger-flow-mobile-${escapeHtml(direction)}">${escapeHtml(label)}</h3>
            <div class="ledger-flow-mobile-rows">
                ${visible.length
                    ? visible.map((edge) => renderFlowRow(edge, model, { controls: 'ledger-flow-mobile-detail' })).join('')
                    : `<p class="ledger-flow-muted">No ${inbound ? 'inbound' : 'outbound'} tez transfers match this view.</p>`}
            </div>
            ${hidden.length ? `
                <details class="ledger-flow-mobile-more" data-ledger-mobile-direction="${escapeHtml(direction)}" data-quiet-key="mobile-more:${escapeHtml(direction)}"${mobileExpandedDirections[direction] ? ' open' : ''}>
                    <summary>Show ${escapeHtml(formatCount(hidden.length))} more ${inbound ? 'incoming' : 'outgoing'} ${hidden.length === 1 ? 'path' : 'paths'}</summary>
                    <div class="ledger-flow-mobile-rows">
                        ${hidden.map((edge) => renderFlowRow(edge, model, { controls: 'ledger-flow-mobile-detail' })).join('')}
                    </div>
                </details>
            ` : ''}
        </section>
    `;
}

function renderMobileDiagram(model) {
    const inbound = model.edges.filter((edge) => edge.direction !== 'sent');
    const outbound = model.edges.filter((edge) => edge.direction === 'sent');
    const selected = [...model.edges, ...model.counterpartyEdges]
        .find((edge) => edge.id === selectedEdgeId)
        || model.edges[0]
        || null;
    return `
        <div class="ledger-flow-mobile-map" aria-label="Ledger Flow paths">
            <div class="ledger-flow-mobile-account">
                <span>Selected account</span>
                <strong>${escapeHtml(model.account?.alias || activeLabel || shortAddress(model.address))}</strong>
                <small>${escapeHtml(shortAddress(model.address))}</small>
            </div>
            ${renderDirectionRatio(model)}
            <div class="ledger-flow-mobile-inline-detail" id="ledger-flow-mobile-detail" aria-live="polite">
                ${edgeDetail(selected, model)}
            </div>
            ${renderMobileDirection(inbound, model, 'received')}
            ${renderMobileDirection(outbound, model, 'sent')}
        </div>
    `;
}

function renderDiagram(model) {
    if (!model.visibleCounterparties.length || !model.edges.length) {
        return `
            <div class="ledger-flow-empty-graph">
                <strong>No visible transfers</strong>
                <span>Lower the minimum amount or widen the time window.</span>
            </div>
        `;
    }
    const layout = layoutLedgerFlowNodes(model.visibleCounterparties, {
        nodeHeight: NODE_HEIGHT,
        minimumGap: NODE_MIN_GAP
    });
    const maxAmount = Math.max(...model.edges.map((edge) => edge.amount), 1);
    const centerY = layout.center.y;
    const mapStartX = model.visibleCounterparties.some((item) => item.side !== 'right')
        ? Math.max(60, layout.columns.left - 120)
        : layout.center.x - 130;
    const mapEndX = model.visibleCounterparties.some((item) => item.side === 'right')
        ? Math.min(940, layout.columns.right + 120)
        : layout.center.x + 130;
    return `
        ${renderMobileDiagram(model)}
        <svg class="ledger-flow-svg" viewBox="0 0 1000 ${layout.viewHeight}" aria-hidden="true" focusable="false">
            <defs>
                <marker id="ledger-arrow-sent" viewBox="0 0 10 10" refX="8.2" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" class="ledger-flow-arrow-sent"></path>
                </marker>
                <marker id="ledger-arrow-received" viewBox="0 0 10 10" refX="8.2" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" class="ledger-flow-arrow-received"></path>
                </marker>
                <marker id="ledger-arrow-first" viewBox="0 0 10 10" refX="8.2" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" class="ledger-flow-arrow-first"></path>
                </marker>
            </defs>
            <g class="ledger-flow-grid-lines" aria-hidden="true">
                <line x1="${layout.center.x}" x2="${layout.center.x}" y1="36" y2="${layout.viewHeight - 36}"></line>
                <line x1="${mapStartX}" x2="${mapEndX}" y1="${centerY}" y2="${centerY}"></line>
            </g>
            <g class="ledger-flow-edges">
                ${model.edges.map((edge, index) => renderEdge(edge, layout, maxAmount, index)).join('')}
            </g>
            <g class="ledger-flow-center-node" transform="translate(${layout.center.x - 110} ${centerY - 60})">
                <rect width="220" height="120" rx="16"></rect>
                <text class="ledger-flow-center-kicker" x="110" y="34" text-anchor="middle">selected account</text>
                <text class="ledger-flow-center-title" x="110" y="62" text-anchor="middle">${escapeHtml(truncate(model.account?.alias || activeLabel || shortAddress(model.address), 20))}</text>
                <text class="ledger-flow-center-address" x="110" y="86" text-anchor="middle">${escapeHtml(shortAddress(model.address))}</text>
            </g>
            <g class="ledger-flow-nodes">
                ${model.visibleCounterparties.map((item) => renderNode(item, layout)).join('')}
            </g>
        </svg>
    `;
}

function edgeDetail(edge, model) {
    if (!edge) {
        const selectedAccount = {
            address: model.address,
            alias: model.account?.alias || activeLabel || shortAddress(model.address)
        };
        return `
            <div class="ledger-flow-detail-empty">
                ${accountLinksMarkup(selectedAccount, { nameClass: 'ledger-flow-detail-name', wrapClass: 'ledger-flow-detail-account' })}
                ${addressLinkMarkup(model.address, { text: model.address, className: 'ledger-flow-detail-address' })}
                <p>Select a path to inspect its direction, amount, row count, and latest matching receipt.</p>
            </div>
        `;
    }
    const counterparty = edge.counterparty;
    const verb = edge.direction === 'sent'
        ? 'Sent to'
        : edge.direction === 'first'
            ? edge.event?.kind === 'origination' ? 'Funded at origination by' : 'First inbound from'
            : edge.isFirstValue ? 'First inbound from' : 'Received from';
    const links = counterparty.isCohort
        ? `<strong class="ledger-flow-detail-name">${escapeHtml(nodeLabel(counterparty))}</strong>`
        : `
            ${accountLinksMarkup(counterparty, { nameClass: 'ledger-flow-detail-name', wrapClass: 'ledger-flow-detail-account' })}
            ${addressLinkMarkup(counterparty.address, { text: counterparty.address, className: 'ledger-flow-detail-address' })}
        `;
    const when = edge.event?.timestamp || edge.latest || '';
    const amount = edge.amount > 0 ? formatCompactXTZ(edge.amount) : 'n/a';
    const scope = edge.direction === 'first'
        ? 'All-time first-value context'
        : model.coverage?.mode === 'sample'
            ? 'Largest-row sample'
            : 'Exact observed window';
    return `
        <div class="ledger-flow-detail-card" data-direction="${escapeHtml(edge.direction)}">
            <span class="ledger-flow-detail-kicker">${escapeHtml(verb)}</span>
            ${links}
            <div class="ledger-flow-detail-metrics">
                <span><small>${edge.direction === 'first' ? 'First value' : model.coverage?.mode === 'sample' ? 'Sample amount' : 'Amount'}</small><b>${escapeHtml(amount)}</b></span>
                <span><small>Rows</small><b>${escapeHtml(formatCount(edge.count))}</b></span>
                <span><small>Latest</small><b>${escapeHtml(when ? formatAge(when) : 'n/a')}</b></span>
            </div>
            <small class="ledger-flow-detail-scope">${escapeHtml(scope)}${counterparty.isCohort ? ` · ${formatCount(counterparty.memberCount)} counterparties` : ''}</small>
        </div>
    `;
}

function renderOriginContext(model) {
    const origin = model.accountOrigin;
    const inbound = model.firstInbound;
    if (!origin && !inbound) {
        return '<div class="ledger-flow-origin-empty">No origination or first inbound receipt was found.</div>';
    }
    const eventMarkup = (event, label) => {
        if (!event) return '';
        const counterparty = event.counterparty;
        const amount = Number(event.amountMutez || 0);
        return `
            <div class="ledger-flow-origin-row">
                <span>${escapeHtml(label)}</span>
                <strong>${counterparty?.address ? accountLinksMarkup(counterparty) : 'unknown'}</strong>
                <small>${escapeHtml(formatDate(event.timestamp))}${amount > 0 ? ` · ${escapeHtml(formatCompactXTZ(amount))}` : event.kind === 'origination' ? ' · zero initial balance' : ''}</small>
            </div>
        `;
    };
    return `
        <div class="ledger-flow-origin-context" aria-label="All-time account context">
            <div class="ledger-flow-origin-heading">All-time account context</div>
            ${eventMarkup(origin, 'Origination')}
            ${eventMarkup(inbound, 'First inbound transaction')}
        </div>
    `;
}

function counterpartyEdgesFor(model, address) {
    return model.counterpartyEdges.filter((edge) => edge.counterparty.address === address);
}

function renderCounterpartyRow(item, model) {
    const edges = counterpartyEdgesFor(model, item.address);
    const latest = [item.sentLatest, item.receivedLatest]
        .filter(Boolean)
        .sort((left, right) => Date.parse(right) - Date.parse(left))[0] || '';
    const actions = edges.map((edge) => {
        const direction = edge.direction === 'received' ? 'Inspect inbound' : 'Inspect outbound';
        return `
            <button type="button" class="ledger-flow-row-select" data-ledger-edge="${escapeHtml(edge.id)}" aria-pressed="${selectedEdgeId === edge.id ? 'true' : 'false'}" aria-controls="ledger-flow-detail-panel ledger-flow-mobile-detail">${escapeHtml(direction)}</button>
        `;
    }).join('');
    const selected = edges.some((edge) => selectedEdgeId === edge.id);
    return `
        <article class="ledger-flow-counterparty-row${selected ? ' is-selected' : ''}" data-quiet-key="counterparty:${escapeHtml(item.address)}">
            <span class="ledger-flow-row-name">
                ${accountLinksMarkup(item)}
                ${item.alias ? addressLinkMarkup(item.address) : ''}
            </span>
            <span class="ledger-flow-row-directions">
                <small data-kind="received">In <b>${escapeHtml(formatCompactXTZ(item.received))}</b></small>
                <small data-kind="sent">Out <b>${escapeHtml(formatCompactXTZ(item.sent))}</b></small>
            </span>
            <span class="ledger-flow-row-receipts">${escapeHtml(formatCount(item.count))} ${item.count === 1 ? 'row' : 'rows'} · ${escapeHtml(latest ? formatAge(latest) : 'time unknown')}</span>
            <span class="ledger-flow-row-actions">${actions}</span>
        </article>
    `;
}

function counterpartyResults(model) {
    return filterLedgerCounterparties(model.counterparties, {
        query: counterpartyQuery,
        sort: counterpartySort
    });
}

function renderCounterpartyResults(model) {
    const rows = counterpartyResults(model);
    const visible = rows.slice(0, counterpartyVisibleCount);
    const remaining = Math.max(0, rows.length - visible.length);
    const queryCopy = counterpartyQuery
        ? ` matching “${counterpartyQuery}”`
        : '';
    return `
        <div class="ledger-flow-counterparty-status" role="status">
            Showing ${escapeHtml(formatCount(visible.length))} of ${escapeHtml(formatCount(rows.length))}${escapeHtml(queryCopy)} · ${escapeHtml(formatCount(model.counterparties.length))} loaded total. The map above keeps the ${escapeHtml(formatCount(DESKTOP_DIRECTION_PREVIEW))} largest paths per direction and reconciles the rest into “Other”.
        </div>
        <div class="ledger-flow-counterparty-list">
            ${visible.length
                ? visible.map((item) => renderCounterpartyRow(item, model)).join('')
                : '<div class="ledger-flow-muted">No loaded counterparty matches that alias or address prefix.</div>'}
        </div>
        ${remaining ? `<button type="button" class="ledger-flow-show-more" data-ledger-counterparty-more>Show ${escapeHtml(formatCount(Math.min(COUNTERPARTY_PAGE_SIZE, remaining)))} more</button>` : ''}
    `;
}

function renderCounterpartyExplorer(model) {
    const sortOptions = [
        ['total', 'Total tez'],
        ['received', 'Received'],
        ['sent', 'Sent'],
        ['count', 'Row count'],
        ['latest', 'Most recent']
    ];
    return `
        <div class="ledger-flow-counterparty-controls">
            <label for="ledger-flow-counterparty-query">
                <span>Find counterparty</span>
                <input id="ledger-flow-counterparty-query" type="search" value="${escapeHtml(counterpartyQuery)}" placeholder="Alias or address prefix" autocomplete="off" spellcheck="false">
            </label>
            <label for="ledger-flow-counterparty-sort">
                <span>Sort</span>
                <select id="ledger-flow-counterparty-sort">
                    ${sortOptions.map(([value, label]) => `<option value="${escapeHtml(value)}"${counterpartySort === value ? ' selected' : ''}>${escapeHtml(label)}</option>`).join('')}
                </select>
            </label>
        </div>
        <div id="ledger-flow-counterparty-results">
            ${renderCounterpartyResults(model)}
        </div>
    `;
}

function renderStats(model) {
    const sample = model.coverage?.mode === 'sample';
    const shown = model.threshold > 0;
    const qualifier = sample ? ' sample' : shown ? ' shown' : '';
    const firstValue = model.firstValueEvent;
    return `
        <div class="ledger-flow-stats" aria-label="Ledger Flow summary">
            <div><span>Received${escapeHtml(qualifier)}</span><strong>${escapeHtml(formatCompactXTZ(model.totals.received))}</strong></div>
            <div><span>Sent${escapeHtml(qualifier)}</span><strong>${escapeHtml(formatCompactXTZ(model.totals.sent))}</strong></div>
            <div><span>Counterparties${sample ? ' in sample' : shown ? ' shown' : ''}</span><strong>${escapeHtml(formatCount(model.counterparties.length))}</strong></div>
            <div><span>First value</span><strong>${firstValue?.amountMutez > 0 ? escapeHtml(formatCompactXTZ(firstValue.amountMutez)) : firstValue ? 'receipt' : 'n/a'}</strong></div>
        </div>
    `;
}

function directionShape(model, direction) {
    const total = Number(model.totals?.[direction] || 0);
    if (!(total > 0)) return null;
    const category = [...model.composition]
        .sort((left, right) => Number(right?.[direction] || 0) - Number(left?.[direction] || 0))[0];
    const topCounterparty = [...model.counterparties]
        .filter((item) => Number(item?.[direction] || 0) > 0)
        .sort((left, right) => (
            Number(right?.[direction] || 0) - Number(left?.[direction] || 0)
            || left.address.localeCompare(right.address)
        ))[0];
    return {
        category,
        categoryPercent: category ? (Number(category[direction] || 0) / total) * 100 : 0,
        topCounterparty,
        topPercent: topCounterparty ? (Number(topCounterparty[direction] || 0) / total) * 100 : 0
    };
}

function renderShapeSummary(model) {
    const sample = model.coverage?.mode === 'sample';
    const directions = [
        ['received', 'Inbound'],
        ['sent', 'Outbound']
    ];
    const items = directions.map(([direction, label]) => {
        const shape = directionShape(model, direction);
        if (!shape) {
            return `<div><span>${escapeHtml(label)}</span><strong>No matching tez</strong></div>`;
        }
        const topLabel = nodeLabel(shape.topCounterparty);
        return `
            <div>
                <span>${escapeHtml(label)}${sample ? ' sample' : ''}</span>
                <strong>${escapeHtml(shape.categoryPercent.toFixed(1))}% of ${escapeHtml(label.toLowerCase())} tez ${direction === 'received' ? 'from' : 'to'} ${escapeHtml(shape.category.label.toLowerCase())}</strong>
                <small>Largest counterparty: ${escapeHtml(topLabel)} · ${escapeHtml(shape.topPercent.toFixed(1))}% of ${escapeHtml(label.toLowerCase())} tez</small>
            </div>
        `;
    }).join('');
    return `
        <div class="ledger-flow-shape" aria-label="Receipt-proven account shape">
            ${items}
            <p>${sample ? 'Within the largest-row sample. ' : ''}Categories use only contract address form and aliases returned with TzKT transfer rows; they do not infer ownership or business type.</p>
        </div>
    `;
}

function timelineBoundaryLabel(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    return date.toLocaleString('en-US', {
        timeZone: 'UTC',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
}

function renderTimeline(model) {
    const timeline = buildLedgerFlowTimeline(model);
    if (!timeline.available) {
        const copy = timeline.reason === 'sample'
            ? 'Time profile hidden: the largest-row sample cannot represent activity over time.'
            : timeline.reason === 'all-window'
                ? 'Choose 24H, 7D, 30D, or 1Y for a bounded time profile.'
                : timeline.reason === 'invalid-rows'
                    ? `Time profile hidden: ${formatCount(timeline.ignoredRows)} loaded ${timeline.ignoredRows === 1 ? 'row has' : 'rows have'} invalid or out-of-window time receipts.`
                : 'Time profile unavailable for this window.';
        return `<div class="ledger-flow-timeline-unavailable">${escapeHtml(copy)}</div>`;
    }
    const maximum = Math.max(
        ...timeline.buckets.map((bucket) => Math.max(bucket.received, bucket.sent)),
        1
    );
    const bars = timeline.buckets.map((bucket) => {
        const receivedHeight = bucket.received > 0
            ? Math.max(4, (bucket.received / maximum) * 100)
            : 0;
        const sentHeight = bucket.sent > 0
            ? Math.max(4, (bucket.sent / maximum) * 100)
            : 0;
        const title = `${timelineBoundaryLabel(bucket.start)}–${timelineBoundaryLabel(bucket.end)} UTC · received ${formatCompactXTZ(bucket.received)} · sent ${formatCompactXTZ(bucket.sent)} · ${formatCount(bucket.count)} rows`;
        return `
            <li title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">
                <i data-kind="received" style="height:${receivedHeight.toFixed(2)}%"></i>
                <i data-kind="sent" style="height:${sentHeight.toFixed(2)}%"></i>
            </li>
        `;
    }).join('');
    return `
        <section class="ledger-flow-timeline" aria-labelledby="ledger-flow-timeline-title">
            <div class="ledger-flow-timeline-heading">
                <div>
                    <span id="ledger-flow-timeline-title">Flow over time</span>
                    <small>${escapeHtml(timeline.unit === 'hour' ? 'Hourly' : timeline.unit === 'day' ? 'Daily' : 'Monday-to-Monday weekly')} UTC calendar buckets · exact window${timeline.partialEndpoints ? ' · partial endpoints' : ''}</small>
                </div>
                <div class="ledger-flow-timeline-legend"><i data-kind="received"></i>In <i data-kind="sent"></i>Out</div>
            </div>
            <ol class="ledger-flow-timeline-bars">${bars}</ol>
            <div class="ledger-flow-timeline-axis">
                <span>${escapeHtml(timelineBoundaryLabel(timeline.since))} UTC</span>
                <span>${escapeHtml(timelineBoundaryLabel(timeline.until))} UTC</span>
            </div>
        </section>
    `;
}

function renderWindowContext(model) {
    const windowKey = model.coverage?.windowKey || activeWindow;
    if (model.totals.count > 0 || windowKey === 'all') return '';
    const label = WINDOW_OPTIONS.find((item) => item.key === windowKey)?.label || windowKey.toUpperCase();
    return `
        <div class="ledger-flow-window-empty" role="status">
            <span>No transfers were found in ${escapeHtml(label)}.</span>
            <small>The origination and first-inbound facts below are all-time context and are not counted as current-window counterparties.</small>
            <button type="button" data-ledger-window="all">Show all time</button>
        </div>
    `;
}

function renderControls(model = null, valueOverride = '') {
    const threshold = THRESHOLDS[thresholdIndex] || THRESHOLDS[0];
    const value = valueOverride || activeLabel || activeTarget || '';
    return `
        <form class="ledger-flow-search" id="ledger-flow-search-form" autocomplete="off">
            <label for="ledger-flow-input">Account</label>
            <input id="ledger-flow-input" name="ledger-flow-input" type="search" spellcheck="false" placeholder="tz1 / KT1 / name.tez" value="${escapeHtml(value)}">
            <button type="submit">Map</button>
        </form>
        <div class="ledger-flow-controls" aria-label="Ledger Flow controls">
            <div class="ledger-flow-segmented" role="group" aria-label="Time window">
                ${WINDOW_OPTIONS.map((item) => `
                    <button type="button" data-ledger-window="${escapeHtml(item.key)}" class="${activeWindow === item.key ? 'active' : ''}" aria-pressed="${activeWindow === item.key ? 'true' : 'false'}">${escapeHtml(item.label)}</button>
                `).join('')}
            </div>
            <label class="ledger-flow-threshold" for="ledger-flow-threshold">
                <span>Min transfer</span>
                <input id="ledger-flow-threshold" type="range" min="0" max="${THRESHOLDS.length - 1}" step="1" value="${thresholdIndex}" aria-valuetext="${escapeHtml(threshold.label)}">
                <output id="ledger-flow-threshold-label" for="ledger-flow-threshold">${escapeHtml(threshold.label)}</output>
            </label>
        </div>
        <div class="ledger-flow-load-status" id="ledger-flow-load-status" role="status" aria-live="polite"></div>
    `;
}

function renderLegend() {
    return `
        <div class="ledger-flow-legend" aria-label="Ledger Flow legend">
            <span><i data-kind="received"></i>Received</span>
            <span><i data-kind="sent"></i>Sent</span>
            <span><i data-kind="first"></i>All-time first value</span>
        </div>
    `;
}

function renderExampleChips() {
    if (!whaleSeed?.target) return '';
    const label = whaleSeed.alias || shortAddress(whaleSeed.target);
    const observed = whaleSeed.timestamp ? formatAge(whaleSeed.timestamp) : 'time unknown';
    return `
        <div class="ledger-flow-examples" aria-label="Live Ledger Flow starting point">
            <button type="button" data-ledger-example="${escapeHtml(whaleSeed.target)}" aria-label="Map ${escapeHtml(label)}, sender of Whale Watch's largest archived 24-hour move">
                <span>Largest archived 24h sender · ${escapeHtml(observed)}</span>
                <strong>${escapeHtml(label)}</strong>
                <small>${escapeHtml(shortAddress(whaleSeed.target))} · TzKT alias if named</small>
            </button>
        </div>
    `;
}

function renderScopeDisclosure() {
    return `
        <div class="ledger-flow-scope">
            <strong>Scope:</strong> applied tez transaction rows only. Account-to-itself rows are excluded from path totals. Token transfers, delegations, originations, tickets, and stake moves are not part of the window totals.
            <a href="/my/?view=portfolio">View tokens in My Tezos</a>.
        </div>
    `;
}

function renderCoverage(model) {
    const coverage = model.coverage || {};
    const windowLabel = WINDOW_OPTIONS.find((item) => item.key === coverage.windowKey)?.label || String(coverage.windowKey || '').toUpperCase();
    const selfRows = Number(model.selfTransferRows || 0);
    const selfDisclosure = selfRows
        ? ` ${formatCount(selfRows)} account-to-itself ${selfRows === 1 ? 'row is' : 'rows are'} excluded from the map totals.`
        : '';
    if (Number(coverage.thresholdMutez || 0) !== Number(model.threshold || 0)) {
        return `
            <div class="ledger-flow-coverage is-pending" role="note">
                <strong>Local filter preview</strong>
                <span>The mounted rows are filtered at ${escapeHtml(THRESHOLDS[thresholdIndex]?.label || '0 XTZ')} per transfer. Release the control to re-count this window and verify whether the result is exact or sampled.</span>
            </div>
        `;
    }
    if (coverage.mode === 'sample') {
        return `
            <div class="ledger-flow-coverage is-sample" role="note">
                <strong>Largest-row sample</strong>
                <span>${escapeHtml(formatCount(coverage.fetchedRows))} largest matching tez transaction rows of ${escapeHtml(formatCount(coverage.totalRows))} observed in ${escapeHtml(windowLabel)}. Every amount, rank, and counterparty count below describes this sample, not the complete account.${escapeHtml(selfDisclosure)}</span>
            </div>
        `;
    }
    return `
            <div class="ledger-flow-coverage is-exact" role="note">
                <strong>Exact observed window</strong>
            <span>All ${escapeHtml(formatCount(coverage.totalRows))} matching tez transaction rows through ${escapeHtml(formatDate(coverage.until))}${model.threshold > 0 ? ` at ${escapeHtml(THRESHOLDS.find((item) => item.mutez === coverage.thresholdMutez)?.label || formatCompactXTZ(coverage.thresholdMutez))} or more per transfer` : ''}.${escapeHtml(selfDisclosure)}</span>
        </div>
    `;
}

function renderEmptyState(container, valueOverride = '') {
    container.innerHTML = `
        <div class="chamber-header lb-header ledger-flow-header chamber-anim-fade">
            <div class="chamber-title-row">
                <h2 class="chamber-title" id="ledger-flow-title">Ledger Flow</h2>
                <span class="chamber-badge current">Account map</span>
            </div>
            <div class="chamber-proposal-info">Map bounded tez transfers with receipt-backed origination and first-inbound context.</div>
        </div>
        <section class="lb-explainer ledger-flow-explainer chamber-anim-fade">
            ${renderChamberVerdict({ key: 'ledger-flow', state: 'guide', sentence: 'Choose an account to inspect its transfer window; no account data is loaded yet.', receipts: [['Input', 'Wallet, contract, or .tez'], ['Source', 'TzKT']] })}
            ${renderChamberGuide('ledger-flow')}
            ${renderControls(null, valueOverride)}
            ${renderExampleChips()}
            <div class="ledger-flow-empty-panel">
                <strong>Choose an account</strong>
                <span>Paste a wallet, contract, or .tez name, or start with the latest validated Whale Watch receipt.</span>
            </div>
            ${renderScopeDisclosure()}
        </section>
        <div class="chamber-footer chamber-anim-fade">
            <span>Source: TzKT transactions</span>
            <span class="chamber-footer-sep">·</span>
            <a class="panel-direct-link" href="/ledger-flow/" aria-label="Direct link to Ledger Flow">Direct: /ledger-flow/</a>
        </div>
    `;
    wireLedgerFlowControls(container);
}

function applyLedgerBodyMarkup(container, markup, options = {}) {
    const content = container.closest('.ledger-flow-content');
    if (options.quiet && content) {
        quietlyMutate(content, () => quietlySyncHtml(container, markup));
    } else {
        container.innerHTML = markup;
    }
    settleChamberArrival(container, { quiet: Boolean(options.quiet) });
}

function renderLedgerFlow(data, options = {}) {
    const container = document.querySelector('#ledger-flow-modal .ledger-flow-body');
    if (!container) return;
    if (!data?.address) {
        renderEmptyState(container);
        return;
    }
    const model = buildLedgerFlowModel(data, {
        thresholdMutez: THRESHOLDS[thresholdIndex]?.mutez || 0,
        directionNodeBudget: DESKTOP_DIRECTION_PREVIEW
    });
    if (model.coverage?.mode === 'sample') {
        [...model.visibleCounterparties, ...model.listCounterparties].forEach((item) => {
            item.sample = true;
        });
    }
    const selectableEdges = [...model.edges, ...model.counterpartyEdges];
    if (!selectableEdges.some((edge) => edge.id === selectedEdgeId)) {
        selectedEdgeId = selectableEdges.find((edge) => edge.isFirstValue)?.id
            || selectableEdges[0]?.id
            || '';
    }
    const firstDetail = selectableEdges.find((edge) => edge.id === selectedEdgeId) || null;
    const windowLabel = WINDOW_OPTIONS.find((item) => item.key === model.coverage?.windowKey)?.label
        || String(model.coverage?.windowKey || '').toUpperCase();
    const ownerFallback = model.resolution?.source === 'owner';
    const identity = ownerFallback
        ? `${model.resolution.name} · owner wallet · ${shortAddress(model.address)}`
        : `${model.account?.alias || model.label || shortAddress(model.address)} · ${shortAddress(model.address)}`;
    const markup = `
        <div class="chamber-header lb-header ledger-flow-header chamber-anim-fade">
            <div class="chamber-title-row">
                <h2 class="chamber-title" id="ledger-flow-title">Ledger Flow</h2>
                <span class="chamber-badge ${model.coverage?.mode === 'sample' ? 'current' : 'live'}">${model.coverage?.mode === 'sample' ? 'Sample' : 'Exact'}</span>
            </div>
            <div class="chamber-proposal-info${ownerFallback ? ' is-owner-fallback' : ''}">
                ${escapeHtml(identity)} · ${escapeHtml(windowLabel)}
            </div>
        </div>
        <section class="lb-explainer ledger-flow-explainer chamber-anim-fade">
            ${renderChamberVerdict({ key: 'ledger-flow', state: model.coverage?.mode === 'sample' ? 'partial' : 'observed', sentence: model.coverage?.mode === 'sample' ? 'This account map is a bounded sample; its flows must not be read as complete account history.' : 'These gross transfers belong to the selected account window; counterparties do not establish common ownership.', receipts: [['Received', formatCompactXTZ(model.totals.received)], ['Sent', formatCompactXTZ(model.totals.sent)]] })}
            ${renderChamberGuide('ledger-flow')}
            ${renderControls(model)}
            ${renderCoverage(model)}
            ${renderStats(model)}
            ${renderShapeSummary(model)}
            ${renderWindowContext(model)}
            ${renderLegend()}
            ${renderScopeDisclosure()}
        </section>
        <section class="lb-panel ledger-flow-panel ledger-flow-map-panel chamber-anim-fade" style="animation-delay:70ms">
            <div class="lb-panel-title">Transfer Map</div>
            ${renderDiagram(model)}
            ${renderTimeline(model)}
        </section>
        <section class="lb-panel ledger-flow-panel ledger-flow-origin-panel chamber-anim-fade" style="animation-delay:100ms">
            ${renderOriginContext(model)}
        </section>
        <div class="ledger-flow-lower-grid">
            <section class="lb-panel ledger-flow-panel ledger-flow-counterparties chamber-anim-fade" style="animation-delay:120ms">
                <div class="lb-panel-title">${model.coverage?.mode === 'sample' ? 'Counterparties in Sample' : 'Loaded Counterparties'}</div>
                ${renderCounterpartyExplorer(model)}
            </section>
            <section class="lb-panel ledger-flow-panel ledger-flow-detail chamber-anim-fade" style="animation-delay:160ms">
                <div class="lb-panel-title">Selected Path</div>
                <div id="ledger-flow-detail-panel" aria-live="polite">${edgeDetail(firstDetail, model)}</div>
            </section>
        </div>
        <div class="chamber-footer chamber-anim-fade" style="animation-delay:220ms">
            <span>Source: TzKT transactions</span>
            <span class="chamber-footer-sep">·</span>
            ${renderChamberStamp(model.updatedAt, 'Fetched')}
            <span class="chamber-footer-sep">·</span>
            ${renderChamberStamp(model.latest, 'Last matching transfer')}
            <span class="chamber-footer-sep">·</span>
            <a class="panel-direct-link" href="https://tzkt.io/${encodeURIComponent(model.address)}/operations/" target="_blank" rel="noopener">TzKT operations</a>
            <span class="chamber-footer-sep">·</span>
            <a class="panel-direct-link" href="/ledger-flow/" aria-label="Direct link to Ledger Flow">Direct: /ledger-flow/</a>
        </div>
    `;
    applyLedgerBodyMarkup(container, markup, { quiet: options.quiet });
    container.dataset.ledgerFlowModel = 'ready';
    container.dataset.ledgerFlowWindow = model.coverage?.windowKey || '';
    container.dataset.ledgerFlowMode = model.coverage?.mode || '';
    container._ledgerFlowModel = model;
    wireLedgerFlowControls(container);
    const mountedThreshold = container.querySelector('#ledger-flow-threshold');
    if (mountedThreshold) {
        const label = THRESHOLDS[thresholdIndex]?.label || THRESHOLDS[0].label;
        mountedThreshold.value = String(thresholdIndex);
        mountedThreshold.setAttribute('aria-valuetext', label);
        const output = container.querySelector('#ledger-flow-threshold-label');
        if (output) output.textContent = label;
    }
}

function setDetailForEdge(edgeId, container) {
    const model = container?._ledgerFlowModel;
    if (!model || !edgeId) return;
    const edge = [...model.edges, ...model.counterpartyEdges].find((item) => item.id === edgeId);
    if (!edge) return;
    selectedEdgeId = edgeId;
    const content = container.closest('.ledger-flow-content') || container;
    quietlyMutate(content, () => {
        const markup = edgeDetail(edge, model);
        const panel = container.querySelector('#ledger-flow-detail-panel');
        const mobilePanel = container.querySelector('#ledger-flow-mobile-detail');
        if (panel) panel.innerHTML = markup;
        if (mobilePanel) mobilePanel.innerHTML = markup;
        container.querySelectorAll('[data-ledger-edge]').forEach((item) => {
            const selected = item.dataset.ledgerEdge === edgeId;
            item.classList.toggle('is-selected', selected);
            if (item.matches('button')) item.setAttribute('aria-pressed', selected ? 'true' : 'false');
        });
        container.querySelectorAll('[data-quiet-key]').forEach((item) => {
            item.classList.toggle('is-selected', item.getAttribute('data-quiet-key') === edgeId);
        });
        container.querySelectorAll('.ledger-flow-counterparty-row').forEach((row) => {
            row.classList.toggle('is-selected', Boolean(
                row.querySelector(`[data-ledger-edge="${CSS.escape(edgeId)}"]`)
            ));
        });
    });
}

function updateCounterpartyResults(container) {
    const model = container?._ledgerFlowModel;
    const results = container?.querySelector('#ledger-flow-counterparty-results');
    if (!model || !results) return;
    const content = container.closest('.ledger-flow-content') || container;
    quietlyMutate(content, () => {
        quietlySyncHtml(results, renderCounterpartyResults(model));
    });
}

function wireLedgerFlowControls(container) {
    const form = container.querySelector('#ledger-flow-search-form');
    if (form && !form.dataset.ledgerFlowWired) {
        form.dataset.ledgerFlowWired = '1';
        form.addEventListener('submit', (event) => {
            event.preventDefault();
            const value = form.querySelector('#ledger-flow-input')?.value || '';
            loadLedgerFlow(value);
        });
    }

    container.querySelectorAll('[data-ledger-window]').forEach((button) => {
        if (button.dataset.ledgerFlowWired) return;
        button.dataset.ledgerFlowWired = '1';
        button.addEventListener('click', () => {
            const next = button.dataset.ledgerWindow;
            if (!WINDOW_OPTIONS.some((item) => item.key === next)) return;
            activeWindow = next;
            writeStorage(WINDOW_KEY, activeWindow);
            if (activeTarget) loadLedgerFlow(activeTarget);
            else renderLedgerFlow(null);
        });
    });

    const threshold = container.querySelector('#ledger-flow-threshold');
    if (threshold && !threshold.dataset.ledgerFlowWired) {
        threshold.dataset.ledgerFlowWired = '1';
        threshold.addEventListener('input', () => {
            const next = Number(threshold.value);
            thresholdIndex = Number.isFinite(next) ? Math.max(0, Math.min(THRESHOLDS.length - 1, next)) : 0;
            writeStorage(THRESHOLD_KEY, String(thresholdIndex));
            const label = THRESHOLDS[thresholdIndex]?.label || THRESHOLDS[0].label;
            threshold.setAttribute('aria-valuetext', label);
            const output = container.querySelector('#ledger-flow-threshold-label');
            if (output) output.textContent = label;
            if (activeData) renderLedgerFlow(activeData, { quiet: true });
            else renderLedgerFlow(null);
        });
        threshold.addEventListener('change', () => {
            window.clearTimeout(thresholdReloadTimer);
            thresholdReloadTimer = window.setTimeout(() => {
                thresholdReloadTimer = null;
                const overlay = document.getElementById('ledger-flow-modal');
                if (overlay?.classList.contains('active') && activeTarget) loadLedgerFlow(activeTarget);
            }, 120);
        });
    }

    const counterpartyInput = container.querySelector('#ledger-flow-counterparty-query');
    if (counterpartyInput && !counterpartyInput.dataset.ledgerFlowWired) {
        counterpartyInput.dataset.ledgerFlowWired = '1';
        counterpartyInput.addEventListener('input', () => {
            counterpartyQuery = counterpartyInput.value.slice(0, 96);
            counterpartyVisibleCount = COUNTERPARTY_PAGE_SIZE;
            updateCounterpartyResults(container);
        });
    }

    const counterpartySelect = container.querySelector('#ledger-flow-counterparty-sort');
    if (counterpartySelect && !counterpartySelect.dataset.ledgerFlowWired) {
        counterpartySelect.dataset.ledgerFlowWired = '1';
        counterpartySelect.addEventListener('change', () => {
            if (!['total', 'received', 'sent', 'count', 'latest'].includes(counterpartySelect.value)) return;
            counterpartySort = counterpartySelect.value;
            counterpartyVisibleCount = COUNTERPARTY_PAGE_SIZE;
            updateCounterpartyResults(container);
        });
    }

    container.querySelectorAll('[data-ledger-mobile-direction]').forEach((details) => {
        if (details.dataset.ledgerFlowWired) return;
        details.dataset.ledgerFlowWired = '1';
        details.addEventListener('toggle', () => {
            const direction = details.dataset.ledgerMobileDirection;
            if (direction in mobileExpandedDirections) {
                mobileExpandedDirections[direction] = details.open;
            }
        });
    });

    if (!container.dataset.ledgerFlowEdgeWired) {
        container.dataset.ledgerFlowEdgeWired = '1';
        container.addEventListener('click', (event) => {
            const example = event.target.closest('[data-ledger-example]');
            if (example) {
                event.preventDefault();
                loadLedgerFlow(example.dataset.ledgerExample);
                return;
            }
            const showMore = event.target.closest('[data-ledger-counterparty-more]');
            if (showMore) {
                event.preventDefault();
                counterpartyVisibleCount += COUNTERPARTY_PAGE_SIZE;
                updateCounterpartyResults(container);
                return;
            }
            const accountLink = event.target.closest('.ledger-flow-my-tezos-link');
            if (accountLink) {
                if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) closeLedgerFlowChamber();
                return;
            }
            if (event.target.closest('a')) return;
            const target = event.target.closest('[data-ledger-edge]');
            if (!target) return;
            event.preventDefault();
            setDetailForEdge(target.dataset.ledgerEdge, container);
        });
    }
}

function setLoadStatus(message = '', tone = '') {
    const body = document.querySelector('#ledger-flow-modal .ledger-flow-body');
    if (!body) return;
    const content = body.closest('.ledger-flow-content') || body;
    quietlyMutate(content, () => {
        const busy = Boolean(message) && tone === 'loading';
        body.setAttribute('aria-busy', busy ? 'true' : 'false');
        body.dataset.ledgerFlowLoading = busy ? 'true' : 'false';
        const status = body.querySelector('#ledger-flow-load-status');
        if (status) {
            status.textContent = message;
            status.dataset.tone = tone;
        }
    });
}

function renderLoading(label = 'Opening Ledger Flow...', requestedTarget = '') {
    const body = document.querySelector('#ledger-flow-modal .ledger-flow-body');
    if (!body) return;
    if (!body.querySelector('#ledger-flow-search-form')) renderEmptyState(body, requestedTarget);
    quietlyMutate(body.closest('.ledger-flow-content') || body, () => {
        const input = body.querySelector('#ledger-flow-input');
        if (input && requestedTarget && input.value !== requestedTarget) input.value = requestedTarget;
        body.querySelectorAll('[data-ledger-window]').forEach((button) => {
            const active = button.dataset.ledgerWindow === activeWindow;
            button.classList.toggle('active', active);
            button.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
    });
    setLoadStatus(label, 'loading');
}

function renderError(message, detail = '') {
    const body = document.querySelector('#ledger-flow-modal .ledger-flow-body');
    if (!body) return;
    if (!body.querySelector('#ledger-flow-search-form')) renderEmptyState(body);
    setLoadStatus(`${message}${detail ? ` — ${detail}` : ''}`, 'error');
}

function abortActiveLoad(reason = 'superseded') {
    if (!activeLoad) return;
    window.clearTimeout(activeLoad.timeoutId);
    activeLoad.abortReason = reason;
    activeLoad.controller.abort();
    activeLoad = null;
}

function accountAlias(value) {
    return {
        address: value?.address || '',
        alias: value?.alias || ''
    };
}

function buildOriginEvent(origination) {
    const counterparty = accountAlias(origination?.sender);
    if (!counterparty.address) return null;
    return {
        kind: 'origination',
        id: origination?.id || null,
        timestamp: origination?.timestamp || '',
        amountMutez: Math.max(0, Number(origination?.contractBalance || 0)),
        counterparty
    };
}

function buildFirstInboundEvent(transaction) {
    const counterparty = accountAlias(transaction?.sender);
    if (!counterparty.address) return null;
    return {
        kind: 'first-inbound',
        id: transaction?.id || null,
        transactionId: transaction?.id || null,
        timestamp: transaction?.timestamp || '',
        amountMutez: Math.max(0, Number(transaction?.amount || 0)),
        counterparty
    };
}

async function loadLedgerFlow(rawTarget) {
    const body = document.querySelector('#ledger-flow-modal .ledger-flow-body');
    if (!body) return;
    const target = String(rawTarget || '').trim();
    abortActiveLoad('superseded');
    if (!target) {
        activeTarget = '';
        activeLabel = '';
        activeData = null;
        selectedEdgeId = '';
        renderLedgerFlow(null);
        return;
    }

    const seq = ++renderSeq;
    const previous = {
        target: activeTarget,
        label: activeLabel,
        data: activeData,
        window: activeData?.coverage?.windowKey || activeWindow,
        thresholdIndex: (() => {
            const value = Number(activeData?.coverage?.thresholdMutez);
            const index = THRESHOLDS.findIndex((item) => item.mutez === value);
            return index >= 0 ? index : thresholdIndex;
        })()
    };
    const requestedWindow = activeWindow;
    const thresholdMutez = THRESHOLDS[thresholdIndex]?.mutez || 0;
    const controller = new AbortController();
    const load = {
        seq,
        controller,
        timeoutId: 0,
        timedOut: false,
        abortReason: ''
    };
    load.timeoutId = window.setTimeout(() => {
        load.timedOut = true;
        load.abortReason = 'timeout';
        controller.abort();
    }, LOAD_TIMEOUT_MS);
    activeLoad = load;
    renderLoading('Mapping account transfers...', target);

    try {
        const resolved = await resolveLedgerTarget(target, controller.signal);
        if (seq !== renderSeq || controller.signal.aborted) return;
        if (!resolved.address) {
            throw new Error('Account not found. Use a valid tz1/tz2/tz3/tz4 wallet, KT1 contract, or resolvable .tez name.');
        }

        const until = new Date().toISOString();
        const boundary = {
            since: windowTimestamp(requestedWindow, until),
            until
        };
        const [account, totalRows, firstInboundRaw, originationRaw] = await Promise.all([
            fetchAccount(resolved.address, controller.signal),
            fetchTransferCount(resolved.address, boundary, thresholdMutez, controller.signal),
            fetchFirstInbound(resolved.address, controller.signal),
            resolved.address.startsWith('KT1')
                ? fetchOrigination(resolved.address, controller.signal)
                : Promise.resolve(null)
        ]);
        const coverage = {
            mode: totalRows > EXACT_ROW_LIMIT ? 'sample' : 'exact',
            totalRows,
            fetchedRows: 0,
            windowKey: requestedWindow,
            since: boundary.since,
            until: boundary.until,
            thresholdMutez
        };
        const transactions = await fetchTransfers(
            resolved.address,
            boundary,
            thresholdMutez,
            coverage,
            controller.signal
        );
        if (seq !== renderSeq) return;
        coverage.fetchedRows = transactions.length;
        const accountOrigin = buildOriginEvent(originationRaw);
        const firstInboundEvent = buildFirstInboundEvent(firstInboundRaw);
        const firstValueEvent = accountOrigin?.amountMutez > 0 ? accountOrigin : firstInboundEvent;
        if (resolved.address !== previous.target) {
            counterpartyQuery = '';
            counterpartySort = 'total';
            counterpartyVisibleCount = COUNTERPARTY_PAGE_SIZE;
            mobileExpandedDirections.received = false;
            mobileExpandedDirections.sent = false;
            selectedEdgeId = '';
        }
        activeTarget = resolved.address;
        activeLabel = resolved.label || resolved.address;
        activeData = {
            address: resolved.address,
            label: resolved.label,
            resolution: resolved.resolution,
            account,
            transactions,
            accountOrigin,
            firstInboundEvent,
            firstValueEvent,
            coverage,
            updatedAt: new Date().toISOString()
        };
        writeStorage(LAST_TARGET_KEY, resolved.address);
        updateLedgerFlowEntry(whaleArtifactState || peekWhaleWatchArtifactState());
        renderLedgerFlow(activeData, { quiet: true });
        setLoadStatus('');
    } catch (error) {
        const abortedByNewLoad = error?.name === 'AbortError' && load.abortReason === 'superseded';
        const abortedByClose = error?.name === 'AbortError' && load.abortReason === 'closed';
        if (seq !== renderSeq || abortedByNewLoad || abortedByClose) return;
        console.warn('Ledger Flow failed', error);
        activeTarget = previous.target;
        activeLabel = previous.label;
        activeData = previous.data;
        activeWindow = previous.window;
        thresholdIndex = previous.thresholdIndex;
        writeStorage(WINDOW_KEY, activeWindow);
        writeStorage(THRESHOLD_KEY, String(thresholdIndex));
        const reason = load.timedOut
            ? 'The bounded request timed out.'
            : error?.message || 'TzKT did not answer.';
        if (activeData) {
            renderLedgerFlow(activeData, { quiet: true });
            setLoadStatus(`Could not load ${target}; still showing the last-good ${String(activeData.coverage?.windowKey || '').toUpperCase()} view. ${reason}`, 'error');
        } else {
            renderError('Ledger Flow data is delayed', `${reason} Try again in a moment.`);
        }
    } finally {
        window.clearTimeout(load.timeoutId);
        if (activeLoad === load) activeLoad = null;
    }
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

function defaultTarget() {
    return readStorage(LAST_TARGET_KEY)
        || readStorage(STORAGE_KEY)
        || '';
}

async function loadWhaleSeed() {
    if (whaleSeed?.target) return whaleSeed;
    try {
        const artifact = await getWhaleWatchArtifact();
        const operation = artifact?.transfers24h?.largestOperation;
        const sender = String(operation?.sender || '');
        const target = String(operation?.target || '');
        if (String(operation?.status || '').toLowerCase() !== 'applied'
            || !isTezosAccount(sender)
            || !isTezosAccount(target)
            || sender === target
            || !(Number(operation?.amountMutez || 0) > 0)) {
            return null;
        }
        whaleSeed = {
            target: sender,
            alias: String(operation?.senderAlias || ''),
            timestamp: operation?.timestamp || artifact?.generatedAt || '',
            amountMutez: Number(operation.amountMutez)
        };
        return whaleSeed;
    } catch {
        return null;
    }
}

export async function openLedgerFlowChamber(target = '', { isCurrent = () => true } = {}) {
    if (!isCurrent()) return;
    const openGeneration = ++chamberOpenGeneration;
    await ensureLedgerFlowStyles();
    if (!isCurrent()) return;
    let overlay = document.getElementById('ledger-flow-modal');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'ledger-flow-modal';
        overlay.className = 'modal-overlay chamber-overlay lb-overlay ledger-flow-overlay';
        overlay.setAttribute('aria-hidden', 'true');
        overlay.innerHTML = `
            <div class="modal-content modal-large chamber-content lb-content ledger-flow-content" role="dialog" aria-modal="true" aria-labelledby="ledger-flow-title" tabindex="-1">
                <button class="modal-close chamber-close" type="button" aria-label="Close Ledger Flow Chamber" style="z-index:3">&times;</button>
                <div class="chamber-body lb-body ledger-flow-body"></div>
            </div>
        `;
        document.body.appendChild(overlay);
        overlay.querySelector('.chamber-close')?.addEventListener('click', closeLedgerFlowChamber);
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) closeLedgerFlowChamber();
        });
    }

    overlay.classList.add('active');
    activateChamberDialog(overlay, {
        close: closeLedgerFlowChamber,
        dialogSelector: '.ledger-flow-content',
        titleId: 'ledger-flow-title',
        label: 'Ledger Flow Chamber'
    });
    lockPageScroll();
    const content = overlay.querySelector('.ledger-flow-content');
    if (content) content.scrollTop = 0;

    let nextTarget = String(target || '').trim() || defaultTarget();
    if (!nextTarget) {
        renderLedgerFlow(null);
        const seed = await loadWhaleSeed();
        if (openGeneration !== chamberOpenGeneration || !overlay.classList.contains('active')) return;
        nextTarget = seed?.target || '';
    }
    if (nextTarget) {
        await loadLedgerFlow(nextTarget);
    } else {
        renderLedgerFlow(null);
    }
}

export function closeLedgerFlowChamber() {
    const overlay = document.getElementById('ledger-flow-modal');
    if (!requestChamberClose(overlay)) return;
    chamberOpenGeneration += 1;
    window.clearTimeout(thresholdReloadTimer);
    thresholdReloadTimer = null;
    abortActiveLoad('closed');
    renderSeq += 1;
    if (overlay) {
        overlay.classList.remove('active');
        deactivateChamberDialog(overlay);
    }
    unlockPageScroll();
}

function miniMapSvg() {
    return `
        <svg class="ledger-flow-entry-svg" viewBox="0 0 360 118" aria-hidden="true">
            <path class="ledger-flow-entry-line received" d="M26 30 C105 14, 116 55, 178 56"></path>
            <path class="ledger-flow-entry-line sent" d="M180 62 C238 54, 260 92, 332 82"></path>
            <path class="ledger-flow-entry-line first" d="M52 92 C112 82, 128 66, 178 64"></path>
            <circle class="ledger-flow-entry-node" cx="180" cy="60" r="18"></circle>
            <circle class="ledger-flow-entry-dot received" cx="26" cy="30" r="7"></circle>
            <circle class="ledger-flow-entry-dot sent" cx="332" cy="82" r="7"></circle>
            <circle class="ledger-flow-entry-dot first" cx="52" cy="92" r="7"></circle>
        </svg>
    `;
}

function storedEntryResume() {
    const lastTarget = readStorage(LAST_TARGET_KEY);
    if (isTezosAccount(lastTarget)) {
        return { address: lastTarget, source: 'ledger-flow-last-target' };
    }
    const myTezos = readStorage(STORAGE_KEY);
    if (isTezosAccount(myTezos)) {
        return { address: myTezos, source: 'my-tezos' };
    }
    return { address: '', source: '' };
}

function entryFreshnessLabel(state, projection) {
    const schedule = state?.scheduleLabel || '6h schedule';
    if (projection?.source?.generatedAt) {
        const source = state?.phase === 'last-good' || state?.refreshFailed
            ? 'Last good'
            : 'Archive generated';
        const failure = state?.refreshFailed ? ' · refresh failed' : '';
        return `${formatFreshnessStamp(projection.source.generatedAt, { source })}${failure} · ${schedule}`;
    }
    if (state?.phase === 'unavailable') return `Archive unavailable · refresh failed · ${schedule}`;
    return `Awaiting shared archive · ${schedule}`;
}

function entryEntityMarkup(entity) {
    const alias = String(entity?.alias || '').trim();
    const label = alias || shortAddress(entity?.address);
    const detail = alias ? shortAddress(entity?.address) : 'Unaliased address';
    return `
        <span class="ledger-flow-entry-path-node" title="${escapeHtml(entity?.address || '')}">
            <strong>${escapeHtml(label)}</strong>
            <small>${escapeHtml(detail)}</small>
        </span>
    `;
}

function entryHeroMarkup(projection) {
    const hero = projection?.hero;
    if (!hero) {
        return `
            <div class="ledger-flow-entry-hero is-fallback" aria-label="Ledger Flow archive preview awaiting shared data">
                <span class="ledger-flow-entry-kicker">Latest loaded 24h archive</span>
                ${miniMapSvg()}
                <strong>Waiting for Whale Watch receipts</strong>
            </div>
        `;
    }
    const senderLabel = hero.sender.alias || shortAddress(hero.sender.address);
    const targetLabel = hero.target.alias || shortAddress(hero.target.address);
    return `
        <a class="ledger-flow-entry-hero" href="#ledger-flow=${encodeURIComponent(hero.sender.address)}" aria-label="Map ${escapeHtml(senderLabel)}, sender of the largest move in the latest loaded 24-hour Whale Watch archive">
            <span class="ledger-flow-entry-kicker">Largest loaded 24h move</span>
            <span class="ledger-flow-entry-path">
                ${entryEntityMarkup(hero.sender)}
                <span class="ledger-flow-entry-path-edge">
                    <i aria-hidden="true"></i>
                    <strong>${escapeHtml(formatCompactXTZ(hero.amountMutez))}</strong>
                    <small>${escapeHtml(formatAge(hero.timestamp))}</small>
                </span>
                ${entryEntityMarkup(hero.target)}
            </span>
            <small class="ledger-flow-entry-path-caption">${escapeHtml(senderLabel)} → ${escapeHtml(targetLabel)} · open the sender map</small>
        </a>
    `;
}

function entryResumeMarkup(projection) {
    const resume = projection?.resume;
    if (!resume) return '';
    const label = resume.alias || shortAddress(resume.address);
    const kicker = resume.source === 'my-tezos' ? 'Map your account' : 'Resume last map';
    return `
        <a class="ledger-flow-entry-resume" data-share-exclude href="#ledger-flow=${encodeURIComponent(resume.address)}">
            <span>${escapeHtml(kicker)}</span>
            <strong>${escapeHtml(label)}</strong>
            <small>${escapeHtml(shortAddress(resume.address))}</small>
        </a>
    `;
}

function entryStoryMarkup(projection) {
    const stories = projection?.stories?.slice(0, 2) || [];
    if (!stories.length) return '';
    return `
        <div class="ledger-flow-entry-stories" aria-label="Loaded Whale Watch paths to explore">
            ${stories.map((story) => {
                const label = story.alias || shortAddress(story.address);
                return `
                    <a href="#ledger-flow=${encodeURIComponent(story.address)}">
                        <span>Explore loaded path</span>
                        <strong>${escapeHtml(label)}</strong>
                        <small>${escapeHtml(formatCompactXTZ(story.amountMutez))} · ${escapeHtml(formatAge(story.timestamp))}</small>
                    </a>
                `;
            }).join('')}
        </div>
    `;
}

function entryMetricsMarkup(projection) {
    const metrics = projection?.metrics;
    const values = metrics ? [
        ['24h moves', formatCount(metrics.operationCount), `≥${formatCount(metrics.minimumXtz)} XTZ`],
        ['Senders', formatCount(metrics.uniqueSenders), 'distinct addresses'],
        ['Recipients', formatCount(metrics.uniqueTargets), 'distinct addresses'],
        ['Gross observed', formatCompactXTZ(metrics.grossObservedMutez), 'not economic volume']
    ] : [
        ['24h moves', '—', 'awaiting archive'],
        ['Senders', '—', 'awaiting archive'],
        ['Recipients', '—', 'awaiting archive'],
        ['Gross observed', '—', 'awaiting archive']
    ];
    return `
        <div class="chamber-entry-metrics ledger-flow-entry-metrics"${metrics ? ` title="${escapeHtml(metrics.semantics)}"` : ''}>
            ${values.map(([label, value, detail], index) => `
                <div class="chamber-entry-metric" data-ledger-flow-metric="${index}">
                    <span>${escapeHtml(label)}</span>
                    <strong>${escapeHtml(value)}</strong>
                    <small>${escapeHtml(detail)}</small>
                </div>
            `).join('')}
        </div>
    `;
}

function ledgerFlowEntryLiveMarkup(projection, state) {
    const archiveState = projection?.metrics
        ? state?.refreshFailed ? 'Last-good archive retained' : 'Complete generated archive'
        : state?.phase === 'unavailable' ? 'Shared archive unavailable' : 'Awaiting shared archive';
    return `
        <div class="ledger-flow-entry-deck">
            <div class="ledger-flow-entry-copy">
                <div class="chamber-entry-icon">Follow the tez</div>
                <p class="stat-description">Bounded account paths, complete counterparty discovery, and receipt-backed first-value context.</p>
                <span class="ledger-flow-entry-state">${escapeHtml(archiveState)}</span>
            </div>
            ${entryHeroMarkup(projection)}
            <div class="ledger-flow-entry-actions${projection?.resume ? '' : ' is-resume-empty'}">
                ${entryResumeMarkup(projection)}
                ${entryStoryMarkup(projection)}
            </div>
        </div>
        ${entryMetricsMarkup(projection)}
    `;
}

function openLedgerFlowEntryHero() {
    return openLedgerFlowChamber(ledgerEntryProjection?.hero?.sender?.address || '');
}

function updateLedgerFlowEntry(state = peekWhaleWatchArtifactState()) {
    whaleArtifactState = state;
    const resume = storedEntryResume();
    const projection = buildLedgerFlowEntryProjection(state?.artifact, {
        resumeAddress: resume.address,
        resumeSource: resume.source,
        isValidAddress: isTezosAccount
    });
    ledgerEntryProjection = projection;
    whaleSeed = projection.hero
        ? {
            target: projection.hero.sender.address,
            alias: projection.hero.sender.alias,
            timestamp: projection.hero.timestamp,
            amountMutez: projection.hero.amountMutez
        }
        : null;
    const card = document.getElementById('ledger-flow-entry-card');
    const live = card?.querySelector('#ledger-flow-entry-live');
    if (!card || !live) return;
    quietlyMutate(card, () => {
        quietlySyncHtml(live, ledgerFlowEntryLiveMarkup(projection, state));
    });
    card.dataset.updatedLabel = entryFreshnessLabel(state, projection);
    card.dataset.shareValue = projection.metrics
        ? `${formatCount(projection.metrics.operationCount)} moves ≥${formatCount(projection.metrics.minimumXtz)} XTZ · loaded 24h`
        : 'Account transfer map';
    card.classList.toggle('chamber-data-stale', Boolean(state?.refreshFailed) || !projection.metrics);
    window.syncChamberEntryFooters?.(card);
}

function ensureLedgerFlowEntryCard() {
    const grid = document.getElementById('chambers-grid');
    if (!grid) return null;
    let card = document.getElementById('ledger-flow-entry-card');
    if (!card) {
        card = document.createElement('div');
        card.id = 'ledger-flow-entry-card';
        card.className = 'stat-card chamber-entry-card chamber-entry-wide ledger-flow-entry-card chamber-entry-adoption';
        card.dataset.updatedLabel = 'Awaiting shared archive · 6h schedule';
        card.dataset.shareValue = 'Account transfer map';
        card.innerHTML = `
            <button class="card-copy-link" type="button" data-copy-hash="#ledger-flow" aria-label="Copy Ledger Flow direct link" title="Copy Ledger Flow link">🔗</button>
            <div class="card-inner">
                <div class="card-front ledger-flow-entry-front">
                    <h2 class="stat-label" id="ledger-flow-entry-title">Ledger Flow</h2>
                    <div class="ledger-flow-entry-live" id="ledger-flow-entry-live">
                        ${ledgerFlowEntryLiveMarkup(null, { phase: 'idle' })}
                    </div>
                </div>
                <div class="card-back" aria-hidden="true">
                    <h2 class="stat-label">Ledger Flow</h2>
                    <div class="stat-value">Graph</div>
                    <p class="stat-description">Received paths are blue, sent paths are pink, and all-time first-value context is gold. Line weight follows observed tez.</p>
                </div>
            </div>
        `;
        grid.appendChild(card);
    }

    wireChamberLauncher(card, {
        open: openLedgerFlowEntryHero,
        label: 'Open Ledger Flow Chamber',
        titleSelector: '#ledger-flow-entry-title, .stat-label'
    });
    card.dataset.ledgerFlowWired = '1';

    return card;
}

function bindLedgerFlowEntryResumeUpdates() {
    if (entryResumeListenersReady) return;
    entryResumeListenersReady = true;
    const refresh = () => updateLedgerFlowEntry(
        whaleArtifactState || peekWhaleWatchArtifactState()
    );
    window.addEventListener('my-baker-updated', refresh);
    window.addEventListener('storage', (event) => {
        if (event.key !== null && ![STORAGE_KEY, LAST_TARGET_KEY].includes(event.key)) return;
        refresh();
    });
}

export function initLedgerFlowChamber() {
    ensureLedgerFlowStyles().catch((error) => console.warn('Ledger Flow styles unavailable', error));
    window.openLedgerFlowChamber = openLedgerFlowChamber;
    ensureLedgerFlowEntryCard();
    bindLedgerFlowEntryResumeUpdates();
    if (!whaleArtifactUnsubscribe) {
        whaleArtifactUnsubscribe = subscribeWhaleWatchArtifact((state) => {
            updateLedgerFlowEntry(state);
        });
    } else {
        updateLedgerFlowEntry(peekWhaleWatchArtifactState());
    }
    if (document.visibilityState === 'visible') {
        getWhaleWatchArtifact().catch(() => {
            // The shared store publishes its unavailable/last-good state to the
            // subscriber, which keeps the launcher honest without a fallback fetch.
        });
    }
}
