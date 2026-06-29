/**
 * Native Tezos entity lens for command-bar account, operation, and block hits.
 */

import { API_URLS } from '../core/config.js';
import { escapeHtml } from '../core/utils.js';

const TZKT = API_URLS.tzkt;
const ACCOUNT_RE = /^(tz[1-4]|KT1)[0-9A-Za-z]{33}$/;
const OPERATION_RE = /^o[0-9A-Za-z]{50}$/;
const BLOCK_HASH_RE = /^B[0-9A-Za-z]{50}$/;
const BLOCK_LEVEL_RE = /^\d{1,}$/;
const OVERLAY_ID = 'native-explorer-overlay';

let escHandler = null;

function shortHash(value, head = 10, tail = 6) {
    const text = String(value || '');
    if (text.length <= head + tail + 1) return text;
    return `${text.slice(0, head)}...${text.slice(-tail)}`;
}

function formatDate(value) {
    if (!value) return 'unknown';
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return 'unknown';
    return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC',
        timeZoneName: 'short'
    });
}

function formatMutez(value, options = {}) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '--';
    const xtz = number / 1e6;
    const maximumFractionDigits = options.compact ? (xtz >= 1000 ? 1 : 2) : 6;
    return `${xtz.toLocaleString('en-US', { maximumFractionDigits })} XTZ`;
}

function formatNumber(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '--';
    return number.toLocaleString('en-US');
}

function entityName(entity) {
    return entity?.alias || entity?.address || 'unknown';
}

function metric(label, value, note = '') {
    return `
        <div class="native-explorer-metric">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value)}</strong>
            ${note ? `<small>${escapeHtml(note)}</small>` : ''}
        </div>
    `;
}

function row(label, value) {
    if (value === undefined || value === null || value === '') return '';
    return `
        <div class="native-explorer-row">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(String(value))}</strong>
        </div>
    `;
}

function externalTzktLink(path, label = 'Open TzKT audit trail') {
    return `<a href="https://tzkt.io/${escapeHtml(path)}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`;
}

async function fetchJson(url) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`TzKT request failed: ${response.status}`);
    return response.json();
}

function txUrl(params) {
    const url = new URL(`${TZKT}/operations/transactions`);
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    });
    return url.toString();
}

async function fetchRecentAccountTransactions(address) {
    const [sent, received] = await Promise.allSettled([
        fetchJson(txUrl({ sender: address, limit: 4, 'sort.desc': 'level' })),
        fetchJson(txUrl({ target: address, limit: 4, 'sort.desc': 'level' }))
    ]);
    const rows = [
        ...(sent.status === 'fulfilled' && Array.isArray(sent.value) ? sent.value : []),
        ...(received.status === 'fulfilled' && Array.isArray(received.value) ? received.value : [])
    ];
    const seen = new Set();
    return rows
        .filter((tx) => {
            const key = tx.id || `${tx.hash}:${tx.nonce || 0}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .sort((a, b) => Number(b.level || 0) - Number(a.level || 0))
        .slice(0, 6);
}

async function fetchAccountLens(address) {
    const encoded = encodeURIComponent(address);
    const [account, delegate, contract, recent] = await Promise.allSettled([
        fetchJson(`${TZKT}/accounts/${encoded}`),
        address.startsWith('tz') ? fetchJson(`${TZKT}/delegates/${encoded}`) : Promise.resolve(null),
        address.startsWith('KT1') ? fetchJson(`${TZKT}/contracts/${encoded}`) : Promise.resolve(null),
        fetchRecentAccountTransactions(address)
    ]);
    return {
        address,
        account: account.status === 'fulfilled' ? account.value : null,
        delegate: delegate.status === 'fulfilled' ? delegate.value : null,
        contract: contract.status === 'fulfilled' ? contract.value : null,
        recent: recent.status === 'fulfilled' ? recent.value : []
    };
}

async function fetchOperationLens(hash) {
    const rows = await fetchJson(`${TZKT}/operations/${encodeURIComponent(hash)}`);
    return Array.isArray(rows) ? rows : [];
}

async function fetchBlockLens(value) {
    return fetchJson(`${TZKT}/blocks/${encodeURIComponent(value)}`);
}

function renderRecentTransactions(rows, address) {
    if (!rows.length) {
        return '<div class="native-explorer-empty">No recent transaction rows found for this account.</div>';
    }
    return rows.map((tx) => {
        const direction = tx.sender?.address === address ? 'Sent' : tx.target?.address === address ? 'Received' : tx.type || 'Tx';
        const counterparty = direction === 'Sent' ? tx.target : tx.sender;
        const counterpartyLabel = counterparty?.alias || counterparty?.address || 'unknown';
        return `
            <a class="native-explorer-event" href="#operation=${encodeURIComponent(tx.hash || '')}" data-native-entity-link>
                <span>${escapeHtml(direction)}</span>
                <strong>${escapeHtml(formatMutez(tx.amount || 0, { compact: true }))}</strong>
                <em>${escapeHtml(counterpartyLabel)}</em>
                <small>${escapeHtml(formatDate(tx.timestamp))}</small>
            </a>
        `;
    }).join('');
}

function renderAccountLens(data, kind) {
    const account = data.account || {};
    const delegate = data.delegate || null;
    const contract = data.contract || null;
    const display = entityName(delegate || contract || account || { address: data.address });
    const isContract = kind === 'contract' || data.address.startsWith('KT1');
    const type = contract?.kind || account.type || (isContract ? 'contract' : 'account');
    const metrics = [
        metric('Balance', formatMutez(account.balance ?? delegate?.balance ?? contract?.balance), type),
        metric('Last activity', account.lastActivity ? formatNumber(account.lastActivity) : '--', formatDate(account.lastActivityTime)),
        metric('Transactions', formatNumber(account.numTransactions ?? delegate?.numTransactions ?? contract?.numTransactions)),
        isContract
            ? metric('Entrypoints', formatNumber(contract?.entrypoints ?? contract?.numEntrypoints), 'contract surface')
            : metric('Delegators', formatNumber(delegate?.numDelegators), delegate?.active ? 'active baker' : 'account')
    ].join('');
    const actions = [
        `<a href="#ledger-flow=${encodeURIComponent(data.address)}">Open Ledger Flow</a>`,
        data.address.startsWith('tz') ? `<a href="#baker=${encodeURIComponent(data.address)}">Try baker profile</a>` : '',
        `<a href="#my-baker=${encodeURIComponent(data.address)}">Track in My Tezos</a>`,
        externalTzktLink(data.address)
    ].filter(Boolean).join('');

    return `
        <div class="native-explorer-hero">
            <span>${escapeHtml(isContract ? 'Native contract view' : 'Native account view')}</span>
            <h2>${escapeHtml(display)}</h2>
            <code>${escapeHtml(data.address)}</code>
        </div>
        <div class="native-explorer-metrics">${metrics}</div>
        <div class="native-explorer-actions">${actions}</div>
        <section class="native-explorer-section">
            <div class="native-explorer-section-head">
                <h3>Recent account flow</h3>
                <span>Live TzKT rows rendered here</span>
            </div>
            <div class="native-explorer-events">
                ${renderRecentTransactions(data.recent, data.address)}
            </div>
        </section>
    `;
}

function renderOperationRows(rows) {
    if (!rows.length) {
        return '<div class="native-explorer-empty">No operation contents were found for this hash yet.</div>';
    }
    return rows.map((op, index) => `
        <article class="native-explorer-op">
            <div class="native-explorer-op-head">
                <span>${escapeHtml(op.type || 'operation')} #${index + 1}</span>
                <strong class="native-explorer-status-${escapeHtml(op.status || 'unknown')}">${escapeHtml(op.status || 'unknown')}</strong>
            </div>
            <div class="native-explorer-op-grid">
                ${row('Level', formatNumber(op.level))}
                ${row('Time', formatDate(op.timestamp))}
                ${row('Amount', formatMutez(op.amount || 0))}
                ${row('Fee', formatMutez(op.bakerFee || 0))}
                ${row('Sender', op.sender?.alias || op.sender?.address)}
                ${row('Target', op.target?.alias || op.target?.address)}
                ${row('Entrypoint', op.parameter?.entrypoint)}
                ${row('Gas used', formatNumber(op.gasUsed))}
            </div>
        </article>
    `).join('');
}

function renderOperationLens(hash, rows) {
    const first = rows[0] || {};
    const metrics = [
        metric('Contents', formatNumber(rows.length), rows.length === 1 ? 'single operation' : 'batched/internal rows'),
        metric('Status', first.status || '--', first.type || 'operation'),
        metric('Level', formatNumber(first.level), formatDate(first.timestamp)),
        metric('Fees', formatMutez(rows.reduce((sum, op) => sum + Number(op.bakerFee || 0), 0)))
    ].join('');
    return `
        <div class="native-explorer-hero">
            <span>Native operation view</span>
            <h2>${escapeHtml(shortHash(hash, 16, 10))}</h2>
            <code>${escapeHtml(hash)}</code>
        </div>
        <div class="native-explorer-metrics">${metrics}</div>
        <div class="native-explorer-actions">${externalTzktLink(hash)}</div>
        <section class="native-explorer-section">
            <div class="native-explorer-section-head">
                <h3>Operation contents</h3>
                <span>${escapeHtml(rows.length ? 'Decoded from TzKT operations API' : 'Hash not indexed in this response')}</span>
            </div>
            <div class="native-explorer-ops">${renderOperationRows(rows)}</div>
        </section>
    `;
}

function renderBlockLens(block) {
    const level = block?.level || '';
    const hash = block?.hash || '';
    const metrics = [
        metric('Level', formatNumber(level), formatDate(block?.timestamp)),
        metric('Attestation power', `${formatNumber(block?.attestationPower)} / ${formatNumber(block?.attestationCommittee)}`, 'recent consensus'),
        metric('Payload round', formatNumber(block?.payloadRound ?? block?.blockRound)),
        metric('Fees', formatMutez(block?.fees || 0))
    ].join('');
    return `
        <div class="native-explorer-hero">
            <span>Native block view</span>
            <h2>Block ${escapeHtml(formatNumber(level))}</h2>
            <code>${escapeHtml(hash)}</code>
        </div>
        <div class="native-explorer-metrics">${metrics}</div>
        <div class="native-explorer-actions">
            <a href="#health">Open Network Health</a>
            ${externalTzktLink(String(level || hash))}
        </div>
        <section class="native-explorer-section">
            <div class="native-explorer-section-head">
                <h3>Block producer</h3>
                <span>Consensus receipt</span>
            </div>
            <div class="native-explorer-block-producer">
                ${row('Proposer', block?.proposer?.alias || block?.proposer?.address)}
                ${row('Producer', block?.producer?.alias || block?.producer?.address)}
                ${row('Octez', block?.software?.version)}
                ${row('Protocol', block?.proto)}
            </div>
        </section>
    `;
}

function ensureOverlay() {
    let overlay = document.getElementById(OVERLAY_ID);
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.className = 'modal-overlay native-explorer-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
        <div class="modal-content modal-large native-explorer-content" role="dialog" aria-modal="true" aria-label="Tezos native explorer">
            <button class="modal-close native-explorer-close" type="button" aria-label="Close native explorer">&times;</button>
            <div class="native-explorer-body"></div>
        </div>
    `;
    overlay.addEventListener('click', (event) => {
        if (event.target === overlay || event.target.closest('.native-explorer-close')) closeNativeExplorer();
        const link = event.target.closest('[data-native-entity-link]');
        if (!link || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        if (!link.getAttribute('href')?.startsWith('#')) return;
        event.preventDefault();
        window.location.hash = link.getAttribute('href');
    });
    document.body.appendChild(overlay);
    return overlay;
}

function renderOverlay(html) {
    const overlay = ensureOverlay();
    const body = overlay.querySelector('.native-explorer-body');
    if (body) body.innerHTML = html;
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    if (!escHandler) {
        escHandler = (event) => {
            if (event.key === 'Escape') closeNativeExplorer();
        };
        document.addEventListener('keydown', escHandler);
    }
}

function renderLoading(type, value) {
    renderOverlay(`
        <div class="native-explorer-loading">
            <span>${escapeHtml(type)}</span>
            <strong>${escapeHtml(shortHash(value, 18, 8))}</strong>
            <p>Loading Tezos data...</p>
        </div>
    `);
}

function renderError(type, value, error) {
    renderOverlay(`
        <div class="native-explorer-error">
            <span>${escapeHtml(type)}</span>
            <h2>Native view could not load</h2>
            <code>${escapeHtml(value)}</code>
            <p>${escapeHtml(error?.message || 'The API did not return data for this entity.')}</p>
            <div class="native-explorer-actions">${externalTzktLink(value, 'Check TzKT directly')}</div>
        </div>
    `);
}

export function closeNativeExplorer() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (escHandler) {
        document.removeEventListener('keydown', escHandler);
        escHandler = null;
    }
}

export async function openNativeExplorer(type, rawValue) {
    const value = String(rawValue || '').trim();
    if (!value) return;
    const normalizedType = type === 'op' ? 'operation' : type;
    renderLoading(normalizedType, value);
    try {
        if ((normalizedType === 'account' || normalizedType === 'contract') && ACCOUNT_RE.test(value)) {
            const lens = await fetchAccountLens(value);
            renderOverlay(renderAccountLens(lens, normalizedType));
            return;
        }
        if (normalizedType === 'operation' && OPERATION_RE.test(value)) {
            const rows = await fetchOperationLens(value);
            renderOverlay(renderOperationLens(value, rows));
            return;
        }
        if (normalizedType === 'block' && (BLOCK_HASH_RE.test(value) || BLOCK_LEVEL_RE.test(value))) {
            const block = await fetchBlockLens(value);
            renderOverlay(renderBlockLens(block));
            return;
        }
        throw new Error('Unsupported Tezos entity shape.');
    } catch (error) {
        renderError(normalizedType, value, error);
    }
}

export function initNativeExplorer() {
    window.TezosNativeExplorer = {
        open: openNativeExplorer,
        close: closeNativeExplorer
    };
}
