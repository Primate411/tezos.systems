/**
 * Ledger Flow Chamber
 * Account-level transfer diagram for sent, received, and first-funding paths.
 */

import { API_URLS } from '../core/config.js';
import { escapeHtml } from '../core/utils.js';

const TZKT = API_URLS.tzkt;
const STORAGE_KEY = 'tezos-systems-my-baker-address';
const LAST_TARGET_KEY = 'tezos-systems-ledger-flow-target';
const WINDOW_KEY = 'tezos-systems-ledger-flow-window';
const THRESHOLD_KEY = 'tezos-systems-ledger-flow-threshold-index';
const LEDGER_FLOW_CSS_URL = '/css/ledger-flow.css?v=305';
const DEFAULT_WINDOW = '30d';
const TRANSFER_LIMIT = 60;
const MAX_VISIBLE_COUNTERPARTIES = 12;
const TEZOS_ACCOUNT_RE = /^(tz[1-4]|KT1)[0-9A-Za-z]{33}$/;
const TEZ_DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+tez$/i;
const NODE_MIN_WIDTH = 188;
const NODE_MAX_WIDTH = 252;
const NODE_HEIGHT = 62;
const NODE_TEXT_PAD = 30;

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

function ensureLedgerFlowStyles() {
    if (document.getElementById('ledger-flow-css')) return;
    const link = document.createElement('link');
    link.id = 'ledger-flow-css';
    link.rel = 'stylesheet';
    link.href = LEDGER_FLOW_CSS_URL;
    document.head.appendChild(link);
}

function loadStoredWindow() {
    let stored = '';
    try {
        stored = localStorage.getItem(WINDOW_KEY);
    } catch {
        stored = '';
    }
    return WINDOW_OPTIONS.some((item) => item.key === stored) ? stored : DEFAULT_WINDOW;
}

function loadStoredThresholdIndex() {
    let stored = NaN;
    try {
        stored = Number(localStorage.getItem(THRESHOLD_KEY));
    } catch {
        stored = NaN;
    }
    return Number.isFinite(stored) && stored >= 0 && stored < THRESHOLDS.length ? stored : 0;
}

function isTezosAccount(value) {
    return TEZOS_ACCOUNT_RE.test(String(value || '').trim());
}

function isTezDomain(value) {
    return TEZ_DOMAIN_RE.test(String(value || '').trim());
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
    if (!Number.isFinite(diff) || diff < 0) return 'just now';
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

async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`TzKT request failed: ${response.status}`);
    return response.json();
}

async function resolveForwardDomain(name) {
    const normalized = String(name || '').trim().toLowerCase();
    if (!isTezDomain(normalized)) return null;
    try {
        const response = await fetch('https://api.tezos.domains/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: 'query ResolveDomain($name: String!) { domain(name: $name) { address owner } }',
                variables: { name: normalized }
            })
        });
        if (!response.ok) return null;
        const data = await response.json();
        const domain = data?.data?.domain || {};
        return [domain.address, domain.owner].find(isTezosAccount) || null;
    } catch {
        return null;
    }
}

async function resolveLedgerTarget(rawTarget) {
    const target = String(rawTarget || '').trim();
    if (!target) return { address: '', label: '' };
    if (isTezosAccount(target)) return { address: target, label: target };
    if (isTezDomain(target)) {
        const domain = target.toLowerCase();
        const address = await resolveForwardDomain(domain);
        return { address: address || '', label: domain };
    }
    return { address: '', label: target };
}

function windowTimestamp(windowKey) {
    const option = WINDOW_OPTIONS.find((item) => item.key === windowKey) || WINDOW_OPTIONS[2];
    if (!option.ms) return null;
    return new Date(Date.now() - option.ms).toISOString();
}

async function fetchTransfers(address, direction, windowKey) {
    const since = windowTimestamp(windowKey);
    const params = {
        status: 'applied',
        'amount.gt': 0,
        'sort.desc': 'level',
        limit: TRANSFER_LIMIT
    };
    if (direction === 'sent') params.sender = address;
    else params.target = address;
    if (since) params['timestamp.gt'] = since;
    const rows = await fetchJson(transactionUrl(params));
    return Array.isArray(rows) ? rows : [];
}

async function fetchFirstInbound(address) {
    const rows = await fetchJson(transactionUrl({
        target: address,
        status: 'applied',
        'amount.gt': 0,
        'sort.asc': 'level',
        limit: 1
    }));
    return Array.isArray(rows) ? rows[0] || null : null;
}

async function fetchAccount(address) {
    try {
        return await fetchJson(`${TZKT}/accounts/${encodeURIComponent(address)}`);
    } catch {
        return null;
    }
}

function getTxKey(tx) {
    return tx?.id || tx?.hash || `${tx?.level || ''}:${tx?.sender?.address || ''}:${tx?.target?.address || ''}:${tx?.amount || 0}`;
}

function normalizeTx(tx, address, explicitDirection = '') {
    const sender = tx?.sender || {};
    const target = tx?.target || {};
    const senderAddress = sender.address || '';
    const targetAddress = target.address || '';
    const amount = Number(tx?.amount || 0);
    if (!senderAddress || !targetAddress || !Number.isFinite(amount) || amount <= 0) return null;

    let direction = explicitDirection;
    if (!direction) {
        if (senderAddress === address && targetAddress !== address) direction = 'sent';
        if (targetAddress === address && senderAddress !== address) direction = 'received';
    }
    if (!direction || senderAddress === targetAddress) return null;

    const counterparty = direction === 'sent' ? target : sender;
    return {
        id: getTxKey(tx),
        hash: tx.hash || '',
        level: tx.level || 0,
        timestamp: tx.timestamp || '',
        amount,
        direction,
        sender,
        target,
        counterparty: {
            address: counterparty.address || '',
            alias: counterparty.alias || ''
        }
    };
}

function addCounterparty(map, tx) {
    const address = tx.counterparty.address;
    if (!address) return;
    if (!map.has(address)) {
        map.set(address, {
            address,
            alias: tx.counterparty.alias || '',
            sent: 0,
            received: 0,
            count: 0,
            firstFunding: false,
            latest: tx.timestamp || ''
        });
    }
    const item = map.get(address);
    if (tx.counterparty.alias && !item.alias) item.alias = tx.counterparty.alias;
    item[tx.direction] += tx.amount;
    item.count += 1;
    if (tx.timestamp && (!item.latest || new Date(tx.timestamp) > new Date(item.latest))) item.latest = tx.timestamp;
}

function buildFlowModel(data) {
    const threshold = THRESHOLDS[thresholdIndex]?.mutez || 0;
    const address = data.address;
    const txById = new Map();
    const transfers = [];
    const counterparties = new Map();

    for (const raw of data.sent || []) {
        const tx = normalizeTx(raw, address, 'sent');
        if (tx && !txById.has(tx.id)) {
            txById.set(tx.id, tx);
            transfers.push(tx);
            addCounterparty(counterparties, tx);
        }
    }
    for (const raw of data.received || []) {
        const tx = normalizeTx(raw, address, 'received');
        if (tx && !txById.has(tx.id)) {
            txById.set(tx.id, tx);
            transfers.push(tx);
            addCounterparty(counterparties, tx);
        }
    }

    const firstTx = data.firstInbound ? normalizeTx(data.firstInbound, address, 'received') : null;
    if (firstTx && firstTx.counterparty.address) {
        if (!counterparties.has(firstTx.counterparty.address)) {
            counterparties.set(firstTx.counterparty.address, {
                address: firstTx.counterparty.address,
                alias: firstTx.counterparty.alias || '',
                sent: 0,
                received: 0,
                count: 0,
                firstFunding: true,
                latest: firstTx.timestamp || ''
            });
        }
        const firstCounterparty = counterparties.get(firstTx.counterparty.address);
        firstCounterparty.firstFunding = true;
        if (firstTx.counterparty.alias && !firstCounterparty.alias) firstCounterparty.alias = firstTx.counterparty.alias;
    }

    const ranked = [...counterparties.values()]
        .map((item) => ({
            ...item,
            total: item.sent + item.received,
            side: item.sent > item.received && !item.firstFunding ? 'right' : 'left'
        }))
        .sort((a, b) => {
            if (a.firstFunding !== b.firstFunding) return a.firstFunding ? -1 : 1;
            return b.total - a.total;
        });

    const thresholded = ranked.filter((item) => item.total >= threshold || item.firstFunding);
    const visibleCounterparties = thresholded.slice(0, MAX_VISIBLE_COUNTERPARTIES);
    const visibleAddresses = new Set(visibleCounterparties.map((item) => item.address));
    const edges = [];

    visibleCounterparties.forEach((item) => {
        if (item.received >= threshold && item.received > 0) {
            edges.push({
                id: `${item.address}:received`,
                direction: 'received',
                counterparty: item,
                amount: item.received,
                count: item.count
            });
        }
        if (item.sent >= threshold && item.sent > 0) {
            edges.push({
                id: `${item.address}:sent`,
                direction: 'sent',
                counterparty: item,
                amount: item.sent,
                count: item.count
            });
        }
    });

    if (firstTx && visibleAddresses.has(firstTx.counterparty.address)) {
        edges.push({
            id: `${firstTx.counterparty.address}:first`,
            direction: 'first',
            counterparty: counterparties.get(firstTx.counterparty.address),
            amount: firstTx.amount,
            count: 1,
            tx: firstTx
        });
    }

    const totals = transfers.reduce((sum, tx) => {
        sum[tx.direction] += tx.amount;
        sum.count += 1;
        return sum;
    }, { sent: 0, received: 0, count: 0 });

    return {
        address,
        label: data.label || address,
        account: data.account,
        transfers,
        firstTx,
        counterparties: ranked,
        visibleCounterparties,
        edges,
        hiddenCount: Math.max(0, thresholded.length - visibleCounterparties.length),
        threshold,
        totals,
        latest: transfers.map((tx) => tx.timestamp).filter(Boolean).sort().pop() || data.updatedAt
    };
}

function layoutNodes(counterparties) {
    const left = counterparties.filter((item) => item.side !== 'right');
    const right = counterparties.filter((item) => item.side === 'right');
    const positions = new Map();
    const place = (items, x) => {
        const count = Math.max(items.length, 1);
        const start = count === 1 ? 280 : 86;
        const gap = count === 1 ? 0 : 388 / (count - 1);
        items.forEach((item, index) => {
            positions.set(item.address, { x, y: start + gap * index });
        });
    };
    place(left, 175);
    place(right, 825);
    return positions;
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
    return item.alias || shortAddress(item.address);
}

function nodeSubLabel(item) {
    return item.firstFunding ? 'first funding' : `${formatCompactXTZ(item.total)} total`;
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

function renderEdge(edge, positions, maxAmount, index) {
    const center = { x: 500, y: 280 };
    const pos = positions.get(edge.counterparty.address);
    if (!pos) return '';
    const from = edge.direction === 'sent' ? center : pos;
    const to = edge.direction === 'sent' ? pos : center;
    const leftToRight = to.x > from.x;
    const curve = edge.direction === 'first' ? 58 : (edge.direction === 'sent' ? 92 : -92);
    const c1x = from.x + (leftToRight ? 150 : -150);
    const c2x = to.x + (leftToRight ? -150 : 150);
    const c1y = from.y + curve;
    const c2y = to.y + curve;
    const width = edgeWidth(edge.amount, maxAmount).toFixed(2);
    const opacity = edgeOpacity(edge.amount, maxAmount).toFixed(2);
    const marker = edge.direction === 'sent' ? 'sent' : edge.direction === 'first' ? 'first' : 'received';
    const label = `${edge.direction === 'sent' ? 'Sent' : edge.direction === 'first' ? 'First funding' : 'Received'} ${formatCompactXTZ(edge.amount)} ${edge.direction === 'sent' ? 'to' : 'from'} ${nodeLabel(edge.counterparty)}`;
    const path = `M ${from.x} ${from.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${to.x} ${to.y}`;
    return `
        <path class="ledger-flow-edge ledger-flow-edge-${edge.direction}" data-ledger-edge="${escapeHtml(edge.id)}" d="${path}" stroke-width="${width}" opacity="${opacity}" marker-end="url(#ledger-arrow-${marker})">
            <title>${escapeHtml(label)}</title>
        </path>
        <path class="ledger-flow-edge-hit" data-ledger-edge="${escapeHtml(edge.id)}" d="${path}" stroke-width="${Math.max(10, Number(width) + 5)}">
            <title>${escapeHtml(label)}</title>
        </path>
        ${edge.direction === 'first' ? `<circle class="ledger-flow-first-pulse" cx="${from.x}" cy="${from.y}" r="${14 + (index % 2) * 3}"></circle>` : ''}
    `;
}

function renderNode(item, positions) {
    const pos = positions.get(item.address);
    if (!pos) return '';
    const classes = ['ledger-flow-node'];
    if (item.firstFunding) classes.push('is-first');
    const geometry = nodeGeometry(item);
    const x = pos.x - geometry.width / 2;
    const y = pos.y - geometry.height / 2;
    const label = fittedText(nodeLabel(item), geometry.width, 8.5);
    const sub = fittedText(nodeSubLabel(item), geometry.width, 6.2);
    const pillX = pos.x < 500 ? geometry.width + 6 : -42;
    return `
        <g class="${classes.join(' ')}" transform="translate(${x} ${y})">
            <a class="ledger-flow-node-profile-link" href="${accountHref(item.address)}" aria-label="Open ${escapeHtml(nodeLabel(item))} in My Tezos">
                <rect width="${geometry.width}" height="${geometry.height}" rx="9"></rect>
                <text class="ledger-flow-node-title" x="${geometry.width / 2}" y="25" text-anchor="middle">${escapeHtml(label)}</text>
                <text class="ledger-flow-node-sub" x="${geometry.width / 2}" y="43" text-anchor="middle">${escapeHtml(sub)}</text>
            </a>
            <a class="ledger-flow-node-tzkt-link" href="${tzktAccountHref(item.address)}" target="_blank" rel="noopener" aria-label="View ${escapeHtml(nodeLabel(item))} on TzKT">
                <rect class="ledger-flow-node-tzkt-bg" x="${pillX}" y="7" width="36" height="16" rx="3"></rect>
                <text class="ledger-flow-node-tzkt-text" x="${pillX + 18}" y="18" text-anchor="middle">TzKT</text>
            </a>
        </g>
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
    const positions = layoutNodes(model.visibleCounterparties);
    const maxAmount = Math.max(...model.edges.map((edge) => edge.amount), 1);
    return `
        <svg class="ledger-flow-svg" viewBox="0 0 1000 560" role="img" aria-label="Ledger Flow diagram for ${escapeHtml(model.label)}">
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
                <line x1="500" x2="500" y1="36" y2="524"></line>
                <line x1="100" x2="900" y1="280" y2="280"></line>
            </g>
            <g class="ledger-flow-edges">
                ${model.edges.map((edge, index) => renderEdge(edge, positions, maxAmount, index)).join('')}
            </g>
            <g class="ledger-flow-center-node" transform="translate(390 220)">
                <rect width="220" height="120" rx="16"></rect>
                <text class="ledger-flow-center-kicker" x="110" y="34" text-anchor="middle">selected account</text>
                <text class="ledger-flow-center-title" x="110" y="62" text-anchor="middle">${escapeHtml(truncate(model.account?.alias || activeLabel || shortAddress(model.address), 20))}</text>
                <text class="ledger-flow-center-address" x="110" y="86" text-anchor="middle">${escapeHtml(shortAddress(model.address))}</text>
            </g>
            <g class="ledger-flow-nodes">
                ${model.visibleCounterparties.map((item) => renderNode(item, positions)).join('')}
            </g>
        </svg>
    `;
}

function edgeDetail(edge, model) {
    if (!edge) {
        const first = model.firstTx;
        const selectedAccount = {
            address: model.address,
            alias: model.account?.alias || activeLabel || shortAddress(model.address)
        };
        return `
            <div class="ledger-flow-detail-empty">
                ${accountLinksMarkup(selectedAccount, { nameClass: 'ledger-flow-detail-name', wrapClass: 'ledger-flow-detail-account' })}
                ${addressLinkMarkup(model.address, { text: model.address, className: 'ledger-flow-detail-address' })}
                ${first ? `<p>First funded by ${accountLinksMarkup(first.counterparty, { wrapClass: 'ledger-flow-inline-account' })} on ${escapeHtml(formatDate(first.timestamp))} for ${escapeHtml(formatCompactXTZ(first.amount))}.</p>` : '<p>No first inbound transfer was found in the TzKT transaction history.</p>'}
            </div>
        `;
    }
    const counterparty = edge.counterparty;
    const verb = edge.direction === 'sent' ? 'Sent to' : edge.direction === 'first' ? 'First funded by' : 'Received from';
    return `
        <div class="ledger-flow-detail-card" data-direction="${escapeHtml(edge.direction)}">
            <span class="ledger-flow-detail-kicker">${escapeHtml(verb)}</span>
            ${accountLinksMarkup(counterparty, { nameClass: 'ledger-flow-detail-name', wrapClass: 'ledger-flow-detail-account' })}
            ${addressLinkMarkup(counterparty.address, { text: counterparty.address, className: 'ledger-flow-detail-address' })}
            <div class="ledger-flow-detail-metrics">
                <span><small>Amount</small><b>${escapeHtml(formatCompactXTZ(edge.amount))}</b></span>
                <span><small>Rows</small><b>${escapeHtml(formatCount(edge.count))}</b></span>
                <span><small>When</small><b>${escapeHtml(edge.tx ? formatDate(edge.tx.timestamp) : formatAge(counterparty.latest))}</b></span>
            </div>
        </div>
    `;
}

function renderCounterpartyRows(model) {
    const rows = model.visibleCounterparties.map((item) => {
        const primaryDirection = item.sent > item.received ? 'sent' : 'received';
        const edgeId = item.firstFunding ? `${item.address}:first` : `${item.address}:${primaryDirection}`;
        const badge = item.firstFunding ? 'first' : (item.sent && item.received ? 'both' : primaryDirection);
        return `
            <div class="ledger-flow-counterparty-row" role="button" tabindex="0" data-ledger-edge="${escapeHtml(edgeId)}">
                <span class="ledger-flow-row-name">
                    ${accountLinksMarkup(item)}
                    ${addressLinkMarkup(item.address)}
                </span>
                <span class="ledger-flow-row-amount">${escapeHtml(formatCompactXTZ(item.total, { withUnit: false }))}</span>
                <span class="ledger-flow-row-badge" data-kind="${escapeHtml(badge)}">${escapeHtml(badge)}</span>
            </div>
        `;
    }).join('');
    return rows || '<div class="ledger-flow-muted">No counterparties match the current filter.</div>';
}

function renderStats(model) {
    const first = model.firstTx;
    return `
        <div class="ledger-flow-stats" aria-label="Ledger Flow summary">
            <div><span>Received</span><strong>${escapeHtml(formatCompactXTZ(model.totals.received))}</strong></div>
            <div><span>Sent</span><strong>${escapeHtml(formatCompactXTZ(model.totals.sent))}</strong></div>
            <div><span>Counterparties</span><strong>${escapeHtml(formatCount(model.counterparties.length))}</strong></div>
            <div><span>First in</span><strong>${first ? escapeHtml(formatCompactXTZ(first.amount)) : 'n/a'}</strong></div>
        </div>
    `;
}

function renderControls(model = null) {
    const threshold = THRESHOLDS[thresholdIndex] || THRESHOLDS[0];
    const value = activeLabel || activeTarget || '';
    return `
        <form class="ledger-flow-search" id="ledger-flow-search-form" autocomplete="off">
            <label for="ledger-flow-input">Account</label>
            <input id="ledger-flow-input" name="ledger-flow-input" type="search" spellcheck="false" placeholder="tz1 / KT1 / name.tez" value="${escapeHtml(value)}">
            <button type="submit">Map</button>
        </form>
        <div class="ledger-flow-controls" aria-label="Ledger Flow controls">
            <div class="ledger-flow-segmented" role="group" aria-label="Time window">
                ${WINDOW_OPTIONS.map((item) => `
                    <button type="button" data-ledger-window="${escapeHtml(item.key)}" class="${activeWindow === item.key ? 'active' : ''}">${escapeHtml(item.label)}</button>
                `).join('')}
            </div>
            <label class="ledger-flow-threshold" for="ledger-flow-threshold">
                <span>Min amount</span>
                <input id="ledger-flow-threshold" type="range" min="0" max="${THRESHOLDS.length - 1}" step="1" value="${thresholdIndex}">
                <strong id="ledger-flow-threshold-label">${escapeHtml(threshold.label)}</strong>
            </label>
        </div>
        ${model?.hiddenCount ? `<div class="ledger-flow-filter-note">${escapeHtml(formatCount(model.hiddenCount))} lower-ranked counterparties hidden from the diagram.</div>` : ''}
    `;
}

function renderLegend() {
    return `
        <div class="ledger-flow-legend" aria-label="Ledger Flow legend">
            <span><i data-kind="received"></i>Received</span>
            <span><i data-kind="sent"></i>Sent</span>
            <span><i data-kind="first"></i>First in</span>
        </div>
    `;
}

function renderEmptyState(container) {
    container.innerHTML = `
        <div class="chamber-header lb-header ledger-flow-header chamber-anim-fade">
            <div class="chamber-title-row">
                <h2 class="chamber-title">Ledger Flow</h2>
                <span class="chamber-badge current">Account map</span>
            </div>
            <div class="chamber-proposal-info">Map sent, received, and first-funding paths around a Tezos account.</div>
        </div>
        <section class="lb-explainer ledger-flow-explainer chamber-anim-fade">
            ${renderControls()}
            <div class="ledger-flow-empty-panel">
                <strong>Choose an account</strong>
                <span>Paste a wallet, contract, or .tez name to build the transfer diagram.</span>
            </div>
        </section>
        <div class="chamber-footer chamber-anim-fade">
            <span>Source: TzKT transactions</span>
            <span class="chamber-footer-sep">·</span>
            <a class="panel-direct-link" href="/ledger-flow/" aria-label="Direct link to Ledger Flow">Direct: /ledger-flow/</a>
        </div>
    `;
    wireLedgerFlowControls(container);
}

function renderLedgerFlow(data) {
    const container = document.querySelector('#ledger-flow-modal .ledger-flow-body');
    if (!container) return;
    if (!data?.address) {
        renderEmptyState(container);
        return;
    }
    const model = buildFlowModel(data);
    const firstEdge = model.firstTx ? model.edges.find((edge) => edge.direction === 'first') : null;
    const firstDetail = firstEdge || model.edges[0] || null;
    container.innerHTML = `
        <div class="chamber-header lb-header ledger-flow-header chamber-anim-fade">
            <div class="chamber-title-row">
                <h2 class="chamber-title">Ledger Flow</h2>
                <span class="chamber-badge live">TzKT</span>
            </div>
            <div class="chamber-proposal-info">
                ${escapeHtml(model.account?.alias || activeLabel || shortAddress(model.address))} · ${escapeHtml(shortAddress(model.address))} · ${escapeHtml(activeWindow.toUpperCase())}
            </div>
        </div>
        <section class="lb-explainer ledger-flow-explainer chamber-anim-fade">
            ${renderControls(model)}
            ${renderStats(model)}
            ${renderLegend()}
        </section>
        <section class="lb-panel ledger-flow-panel ledger-flow-map-panel chamber-anim-fade" style="animation-delay:70ms">
            <div class="lb-panel-title">Transfer Diagram</div>
            ${renderDiagram(model)}
        </section>
        <div class="ledger-flow-lower-grid">
            <section class="lb-panel ledger-flow-panel ledger-flow-counterparties chamber-anim-fade" style="animation-delay:120ms">
                <div class="lb-panel-title">Top Counterparties</div>
                <div class="ledger-flow-counterparty-list">${renderCounterpartyRows(model)}</div>
            </section>
            <section class="lb-panel ledger-flow-panel ledger-flow-detail chamber-anim-fade" style="animation-delay:160ms">
                <div class="lb-panel-title">Selected Path</div>
                <div id="ledger-flow-detail-panel">${edgeDetail(firstDetail, model)}</div>
            </section>
        </div>
        <div class="chamber-footer chamber-anim-fade" style="animation-delay:220ms">
            <span>Source: TzKT transactions</span>
            <span class="chamber-footer-sep">·</span>
            <span>Updated ${escapeHtml(formatAge(model.latest))}</span>
            <span class="chamber-footer-sep">·</span>
            <a class="panel-direct-link" href="https://tzkt.io/${encodeURIComponent(model.address)}/operations/" target="_blank" rel="noopener">TzKT operations</a>
            <span class="chamber-footer-sep">·</span>
            <a class="panel-direct-link" href="/ledger-flow/" aria-label="Direct link to Ledger Flow">Direct: /ledger-flow/</a>
        </div>
    `;
    container.dataset.ledgerFlowModel = 'ready';
    container._ledgerFlowModel = model;
    wireLedgerFlowControls(container);
}

function setDetailForEdge(edgeId, container) {
    const model = container?._ledgerFlowModel;
    if (!model || !edgeId) return;
    const edge = model.edges.find((item) => item.id === edgeId);
    if (!edge) return;
    const panel = container.querySelector('#ledger-flow-detail-panel');
    if (panel) panel.innerHTML = edgeDetail(edge, model);
    container.querySelectorAll('[data-ledger-edge]').forEach((item) => {
        item.classList.toggle('is-selected', item.dataset.ledgerEdge === edgeId);
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
            localStorage.setItem(WINDOW_KEY, activeWindow);
            if (activeTarget) loadLedgerFlow(activeLabel || activeTarget);
            else renderLedgerFlow(null);
        });
    });

    const threshold = container.querySelector('#ledger-flow-threshold');
    if (threshold && !threshold.dataset.ledgerFlowWired) {
        threshold.dataset.ledgerFlowWired = '1';
        threshold.addEventListener('input', () => {
            const next = Number(threshold.value);
            thresholdIndex = Number.isFinite(next) ? Math.max(0, Math.min(THRESHOLDS.length - 1, next)) : 0;
            localStorage.setItem(THRESHOLD_KEY, String(thresholdIndex));
            if (activeData) renderLedgerFlow(activeData);
            else renderLedgerFlow(null);
        });
    }

    if (!container.dataset.ledgerFlowEdgeWired) {
        container.dataset.ledgerFlowEdgeWired = '1';
        container.addEventListener('click', (event) => {
            const accountLink = event.target.closest('.ledger-flow-my-tezos-link, .ledger-flow-node-profile-link');
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
        container.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            if (event.target.closest('a')) return;
            const target = event.target.closest('[data-ledger-edge]');
            if (!target) return;
            event.preventDefault();
            setDetailForEdge(target.dataset.ledgerEdge, container);
        });
    }
}

function renderLoading(label = 'Opening Ledger Flow...') {
    const body = document.querySelector('#ledger-flow-modal .ledger-flow-body');
    if (!body) return;
    body.innerHTML = `
        <div class="chamber-loading">
            <div class="chamber-loading-text">${escapeHtml(label)}</div>
            <div class="chamber-loading-bar"><div class="chamber-loading-fill"></div></div>
        </div>
    `;
}

function renderError(message, detail = '') {
    const body = document.querySelector('#ledger-flow-modal .ledger-flow-body');
    if (!body) return;
    body.innerHTML = `
        <div class="chamber-error">
            <div class="error-icon">!</div>
            <div class="error-title">${escapeHtml(message)}</div>
            ${detail ? `<div class="error-detail">${escapeHtml(detail)}</div>` : ''}
            <button class="chamber-retry-btn" id="ledger-flow-retry">Retry</button>
        </div>
    `;
    body.querySelector('#ledger-flow-retry')?.addEventListener('click', () => loadLedgerFlow(activeLabel || activeTarget));
}

async function loadLedgerFlow(rawTarget) {
    const body = document.querySelector('#ledger-flow-modal .ledger-flow-body');
    if (!body) return;
    const target = String(rawTarget || '').trim();
    if (!target) {
        activeTarget = '';
        activeLabel = '';
        activeData = null;
        renderLedgerFlow(null);
        return;
    }

    const seq = ++renderSeq;
    renderLoading('Mapping account transfers...');
    const resolved = await resolveLedgerTarget(target);
    if (seq !== renderSeq) return;
    if (!resolved.address) {
        activeTarget = '';
        activeLabel = resolved.label || target;
        activeData = null;
        renderError('Account not found', 'Use a tz1/tz2/tz3/tz4 wallet, KT1 contract, or resolvable .tez name.');
        return;
    }

    activeTarget = resolved.address;
    activeLabel = resolved.label || resolved.address;
    localStorage.setItem(LAST_TARGET_KEY, activeLabel);

    try {
        const [account, sent, received, firstInbound] = await Promise.all([
            fetchAccount(resolved.address),
            fetchTransfers(resolved.address, 'sent', activeWindow),
            fetchTransfers(resolved.address, 'received', activeWindow),
            fetchFirstInbound(resolved.address)
        ]);
        if (seq !== renderSeq) return;
        activeData = {
            address: resolved.address,
            label: resolved.label,
            account,
            sent,
            received,
            firstInbound,
            updatedAt: new Date().toISOString()
        };
        renderLedgerFlow(activeData);
    } catch (error) {
        console.warn('Ledger Flow failed', error);
        if (seq !== renderSeq) return;
        renderError('Ledger Flow data is delayed', 'TzKT account transfer history did not answer in time. Try again in a moment.');
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

function handleEscape(event) {
    if (event.key === 'Escape') closeLedgerFlowChamber();
}

function defaultTarget() {
    return localStorage.getItem(LAST_TARGET_KEY)
        || localStorage.getItem(STORAGE_KEY)
        || '';
}

export async function openLedgerFlowChamber(target = '') {
    ensureLedgerFlowStyles();
    let overlay = document.getElementById('ledger-flow-modal');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'ledger-flow-modal';
        overlay.className = 'modal-overlay chamber-overlay lb-overlay ledger-flow-overlay';
        overlay.innerHTML = `
            <div class="modal-content modal-large chamber-content lb-content ledger-flow-content">
                <button class="modal-close chamber-close" aria-label="Close" style="z-index:3">&times;</button>
                <div class="chamber-body lb-body ledger-flow-body"></div>
            </div>
        `;
        document.body.appendChild(overlay);
        overlay.querySelector('.chamber-close')?.addEventListener('click', closeLedgerFlowChamber);
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) closeLedgerFlowChamber();
        });
    }

    document.addEventListener('keydown', handleEscape);
    overlay.classList.add('active');
    lockPageScroll();
    const content = overlay.querySelector('.ledger-flow-content');
    if (content) content.scrollTop = 0;

    const nextTarget = String(target || '').trim() || defaultTarget();
    if (nextTarget) {
        await loadLedgerFlow(nextTarget);
    } else {
        renderLedgerFlow(null);
    }
}

export function closeLedgerFlowChamber() {
    document.removeEventListener('keydown', handleEscape);
    const overlay = document.getElementById('ledger-flow-modal');
    if (overlay) overlay.classList.remove('active');
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

function ensureLedgerFlowEntryCard() {
    const grid = document.getElementById('chambers-grid');
    if (!grid) return null;
    let card = document.getElementById('ledger-flow-entry-card');
    if (!card) {
        card = document.createElement('div');
        card.id = 'ledger-flow-entry-card';
        card.className = 'stat-card chamber-entry-card chamber-entry-wide ledger-flow-entry-card chamber-entry-adoption';
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.setAttribute('aria-label', 'Open Ledger Flow Chamber');
        card.dataset.updatedLabel = 'TzKT account transfers';
        card.innerHTML = `
            <button class="card-copy-link" type="button" data-copy-hash="#ledger-flow" aria-label="Copy Ledger Flow direct link" title="Copy Ledger Flow link">🔗</button>
            <div class="card-inner">
                <div class="card-front ledger-flow-entry-front">
                    <h2 class="stat-label">Ledger Flow</h2>
                    <div class="ledger-flow-entry-main">
                        ${miniMapSvg()}
                        <div class="ledger-flow-entry-copy">
                            <div class="chamber-entry-icon">Account transfer map</div>
                            <p class="stat-description">Sent, received, and first-funding paths around any Tezos wallet or contract.</p>
                        </div>
                    </div>
                    <div class="chamber-entry-metrics ledger-flow-entry-metrics">
                        <div class="chamber-entry-metric" data-ledger-flow-metric="received"><span>Received</span><strong>blue</strong></div>
                        <div class="chamber-entry-metric" data-ledger-flow-metric="sent"><span>Sent</span><strong>pink</strong></div>
                        <div class="chamber-entry-metric" data-ledger-flow-metric="first"><span>First in</span><strong>gold</strong></div>
                        <div class="chamber-entry-metric"><span>Weight</span><strong>amount</strong></div>
                    </div>
                </div>
                <div class="card-back" aria-hidden="true">
                    <h2 class="stat-label">Ledger Flow</h2>
                    <div class="stat-value">Graph</div>
                    <p class="stat-description">Open account transfer paths.</p>
                </div>
            </div>
        `;
        grid.appendChild(card);
    }

    if (!card.dataset.ledgerFlowWired) {
        const open = (event) => {
            if (event?.target?.closest?.('button, a, .card-tooltip')) return;
            openLedgerFlowChamber();
        };
        card.addEventListener('click', open);
        card.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            open(event);
        });
        card.dataset.ledgerFlowWired = '1';
    }

    return card;
}

export function initLedgerFlowChamber() {
    ensureLedgerFlowStyles();
    window.openLedgerFlowChamber = openLedgerFlowChamber;
    ensureLedgerFlowEntryCard();
}
