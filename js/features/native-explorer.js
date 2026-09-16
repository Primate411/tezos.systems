import { loadingText, loadingRows } from '../ui/text-loading.js';
/**
 * Native Tezos entity lens for command-bar account, operation, and block hits.
 */

import { API_URLS } from '../core/config.js';
import { escapeHtml } from '../core/utils.js';
import { parseSearchEntity, validateBase58Check } from '../core/search-entities.js';
import { activateOverlayDialog, deactivateOverlayDialog } from '../ui/overlay-stack.js';

const TZKT = API_URLS.tzkt;
const OVERLAY_ID = 'native-explorer-overlay';

let requestGeneration = 0;
let currentRequest = null;
const lastGoodLenses = new Map();

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

function circulationLinks() {
    return [
        '<a href="/#search">Search Tezos Systems</a>',
        '<a href="/#site-map">View site map</a>'
    ].join('');
}

async function fetchJson(url) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
        const error = new Error(`TzKT request failed: ${response.status}`);
        error.status = response.status;
        throw error;
    }
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
    return {
        rows: rows
        .filter((tx) => {
            const key = tx.id || `${tx.hash}:${tx.nonce || 0}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .sort((a, b) => Number(b.level || 0) - Number(a.level || 0))
        .slice(0, 6),
        complete: sent.status === 'fulfilled' && received.status === 'fulfilled'
    };
}

function sourceQuality(sources) {
    const failed = sources.filter((source) => !source.ok);
    return {
        status: failed.length ? 'partial' : 'complete',
        observedAt: new Date().toISOString(),
        sources,
        failed: failed.map((source) => source.label),
        lastGood: [],
        lastGoodAt: null
    };
}

function reconcileLastGoodLens(key, lens) {
    if (lens.quality.status === 'complete') {
        lastGoodLenses.set(key, lens);
        return lens;
    }
    const previous = lastGoodLenses.get(key);
    if (!previous) return lens;
    for (const source of lens.quality.sources) {
        if (source.ok || !(source.key in previous)) continue;
        lens[source.key] = previous[source.key];
        lens.quality.lastGood.push(source.label);
    }
    if (lens.quality.lastGood.length) lens.quality.lastGoodAt = previous.quality?.observedAt || null;
    return lens;
}

async function fetchAccountLens(address) {
    const encoded = encodeURIComponent(address);
    const [account, delegate, recent] = await Promise.allSettled([
        fetchJson(`${TZKT}/accounts/${encoded}`),
        address.startsWith('tz') ? fetchJson(`${TZKT}/delegates/${encoded}`) : Promise.resolve(null),
        fetchRecentAccountTransactions(address)
    ]);
    const recentResult = recent.status === 'fulfilled'
        ? recent.value
        : { rows: [], complete: false };
    const delegateExpectedAbsent = delegate.status === 'rejected' && delegate.reason?.status === 404;
    const lens = {
        address,
        account: account.status === 'fulfilled' ? account.value : null,
        delegate: delegate.status === 'fulfilled' ? delegate.value : null,
        recent: recentResult.rows,
        quality: sourceQuality([
            { key: 'account', label: 'account identity and balances', ok: account.status === 'fulfilled' },
            { key: 'delegate', label: 'delegate profile', ok: delegate.status === 'fulfilled' || delegateExpectedAbsent },
            { key: 'recent', label: 'recent account flow', ok: recent.status === 'fulfilled' && recentResult.complete }
        ])
    };
    return reconcileLastGoodLens(`account:${address}`, lens);
}

async function fetchContractLens(address) {
    const encoded = encodeURIComponent(address);
    const [account, contract, recent, entrypoints, sameCode] = await Promise.allSettled([
        fetchJson(`${TZKT}/accounts/${encoded}`),
        fetchJson(`${TZKT}/contracts/${encoded}`),
        fetchRecentAccountTransactions(address),
        fetchJson(`${TZKT}/contracts/${encoded}/entrypoints`),
        fetchJson(`${TZKT}/contracts/${encoded}/same`)
    ]);
    const recentResult = recent.status === 'fulfilled'
        ? recent.value
        : { rows: [], complete: false };
    const lens = {
        address,
        account: account.status === 'fulfilled' ? account.value : null,
        contract: contract.status === 'fulfilled' ? contract.value : null,
        recent: recentResult.rows,
        entrypoints: entrypoints.status === 'fulfilled' && Array.isArray(entrypoints.value) ? entrypoints.value : [],
        sameCode: sameCode.status === 'fulfilled' && Array.isArray(sameCode.value) ? sameCode.value : [],
        quality: sourceQuality([
            { key: 'account', label: 'account balances and counters', ok: account.status === 'fulfilled' },
            { key: 'contract', label: 'contract identity', ok: contract.status === 'fulfilled' },
            { key: 'recent', label: 'recent contract flow', ok: recent.status === 'fulfilled' && recentResult.complete },
            { key: 'entrypoints', label: 'decoded entrypoints', ok: entrypoints.status === 'fulfilled' },
            { key: 'sameCode', label: 'related deployments', ok: sameCode.status === 'fulfilled' }
        ])
    };
    return reconcileLastGoodLens(`contract:${address}`, lens);
}

function qualitySourceAvailable(data, key) {
    const source = data.quality?.sources?.find((candidate) => candidate.key === key);
    if (!source) return true;
    return source.ok !== false || data.quality?.lastGood?.includes(source.label);
}

function formatQualityTime(value) {
    const date = new Date(value || '');
    if (!Number.isFinite(date.getTime())) return 'time unavailable';
    return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: 'UTC',
        timeZoneName: 'short'
    });
}

function renderSourceQuality(data) {
    const quality = data.quality;
    if (!quality) return '';
    if (quality.status === 'complete') {
        return `
            <div class="native-explorer-source-status" data-state="complete" role="status" tabindex="-1">
                <strong>Complete TzKT read</strong>
                <span>Observed ${escapeHtml(formatQualityTime(quality.observedAt))}</span>
            </div>
        `;
    }
    const retained = quality.lastGood?.length
        ? ` Last-good ${quality.lastGood.join(', ')} retained from ${formatQualityTime(quality.lastGoodAt)}.`
        : '';
    return `
        <div class="native-explorer-source-status" data-state="partial" role="status" tabindex="-1">
            <span>
                <strong>Partial TzKT read</strong>
                ${escapeHtml(quality.failed.join(', '))} unavailable at ${escapeHtml(formatQualityTime(quality.observedAt))}.
                Successful panels remain visible; unavailable fields are not zero.${escapeHtml(retained)}
            </span>
            <button type="button" data-native-retry>Retry missing data</button>
        </div>
    `;
}

async function fetchOperationLens(hash) {
    const rows = await fetchJson(`${TZKT}/operations/${encodeURIComponent(hash)}`);
    return Array.isArray(rows) ? rows : [];
}

async function fetchBlockLens(value) {
    return fetchJson(`${TZKT}/blocks/${encodeURIComponent(value)}`);
}

function renderRecentTransactions(rows, address, { available = true } = {}) {
    if (!available) {
        return '<div class="native-explorer-empty">Recent TzKT flow is unavailable for this read. Retry without treating this as an empty account.</div>';
    }
    if (!rows.length) {
        return '<div class="native-explorer-empty">No recent transaction rows found for this account.</div>';
    }
    return rows.map((tx) => {
        const direction = tx.sender?.address === address ? 'Sent' : tx.target?.address === address ? 'Received' : tx.type || 'Tx';
        const counterparty = direction === 'Sent' ? tx.target : tx.sender;
        const counterpartyLabel = counterparty?.alias || counterparty?.address || 'unknown';
        return `
            <a class="native-explorer-event" href="/#operation=${encodeURIComponent(tx.hash || '')}">
                <span>${escapeHtml(direction)}</span>
                <strong>${escapeHtml(formatMutez(tx.amount || 0, { compact: true }))}</strong>
                <em>${escapeHtml(counterpartyLabel)}</em>
                <small>${escapeHtml(formatDate(tx.timestamp))}</small>
            </a>
        `;
    }).join('');
}

function renderAccountLens(data) {
    const account = data.account || {};
    const delegate = data.delegate || null;
    const display = entityName(delegate || account || { address: data.address });
    const type = account.type || 'account';
    const metrics = [
        metric('Balance', formatMutez(account.balance ?? delegate?.balance), type),
        metric('Last activity', account.lastActivity ? formatNumber(account.lastActivity) : '--', formatDate(account.lastActivityTime)),
        metric('Transactions', formatNumber(account.numTransactions ?? delegate?.numTransactions)),
        metric('Delegators', formatNumber(delegate?.numDelegators), delegate?.active ? 'active baker' : 'account')
    ].join('');
    const actions = [
        `<a href="/#ledger-flow=${encodeURIComponent(data.address)}">Open Ledger Flow</a>`,
        delegate?.active ? `<a href="/#baker=${encodeURIComponent(data.address)}">Open baker profile</a>` : '',
        `<a href="/#my-baker=${encodeURIComponent(data.address)}">Track in My Tezos</a>`,
        externalTzktLink(data.address),
        circulationLinks()
    ].filter(Boolean).join('');

    return `
        ${renderSourceQuality(data)}
        <div class="native-explorer-hero">
            <span>Native account view</span>
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
                ${renderRecentTransactions(data.recent, data.address, { available: qualitySourceAvailable(data, 'recent') })}
            </div>
        </section>
    `;
}

function schemaSummary(value, depth = 0) {
    if (value === null || value === undefined) return 'unit';
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return `[${value.slice(0, 3).map((item) => schemaSummary(item, depth + 1)).join(', ')}${value.length > 3 ? ', …' : ''}]`;
    if (typeof value !== 'object') return String(value);
    const entries = Object.entries(value);
    if (depth >= 2) return entries.map(([key]) => key.replace(/^schema:/, '')).slice(0, 4).join(', ') || 'object';
    const summary = entries.slice(0, 5).map(([key, nested]) => {
        const label = key.replace(/^schema:/, '').replace(/:[a-z_]+(?=:|$)/gi, '');
        return `${label}: ${schemaSummary(nested, depth + 1)}`;
    }).join(' · ');
    return `${summary}${entries.length > 5 ? ' · …' : ''}`;
}

function renderContractEntrypoints(entrypoints, { available = true } = {}) {
    if (!available) {
        return '<div class="native-explorer-empty">Decoded entrypoints are unavailable for this read. Retry without interpreting this as a zero-entrypoint contract.</div>';
    }
    if (!entrypoints.length) {
        return '<div class="native-explorer-empty">TzKT did not return a decoded entrypoint list for this contract.</div>';
    }
    return entrypoints.map((entrypoint) => `
        <article class="native-contract-entrypoint">
            <div>
                <strong>${escapeHtml(entrypoint.name || 'default')}</strong>
                ${entrypoint.unused ? '<span>unused</span>' : ''}
            </div>
            <code>${escapeHtml(schemaSummary(entrypoint.jsonParameters))}</code>
        </article>
    `).join('');
}

function renderSameCode(rows, address, { available = true } = {}) {
    if (!available) {
        return '<div class="native-explorer-empty">Related deployments are unavailable for this read. Retry without interpreting this as an empty same-code index.</div>';
    }
    const matches = rows.filter((row) => row?.address && row.address !== address).slice(0, 8);
    if (!matches.length) return '<div class="native-explorer-empty">No additional matching deployments were returned.</div>';
    return matches.map((match) => `
        <a class="native-contract-match" href="#contract=${encodeURIComponent(match.address)}" data-native-entity-link>
            <strong>${escapeHtml(match.alias || shortHash(match.address, 12, 8))}</strong>
            <code>${escapeHtml(match.address)}</code>
            <span>${escapeHtml(match.kind || 'same code')}</span>
        </a>
    `).join('');
}

function renderContractLens(data) {
    const account = data.account || {};
    const contract = data.contract || {};
    const display = entityName(contract || account || { address: data.address });
    const recentAvailable = qualitySourceAvailable(data, 'recent');
    const entrypointsAvailable = qualitySourceAvailable(data, 'entrypoints');
    const sameCodeAvailable = qualitySourceAvailable(data, 'sameCode');
    const metrics = [
        metric('Balance', formatMutez(account.balance ?? contract.balance), contract.kind || 'smart contract'),
        metric('Deployed', formatDate(contract.firstActivityTime || account.firstActivityTime), contract.firstActivity ? `level ${formatNumber(contract.firstActivity)}` : ''),
        metric('Transactions', formatNumber(account.numTransactions ?? contract.numTransactions), recentAvailable ? `${formatNumber(data.recent.length)} recent flow rows` : 'recent flow unavailable'),
        metric('Entrypoints', entrypointsAvailable ? formatNumber(data.entrypoints.length) : '--', entrypointsAvailable ? 'decoded TzKT interface' : 'source unavailable'),
        metric('Active tokens', formatNumber(contract.activeTokensCount ?? account.activeTokensCount), 'contract-issued assets'),
        metric('Token transfers', formatNumber(contract.tokenTransfersCount ?? account.tokenTransfersCount), 'indexed token movements'),
        metric('Events', formatNumber(contract.eventsCount ?? account.eventsCount), 'indexed contract events')
    ].join('');
    const identity = [
        row('Creator', contract.creator?.alias || contract.creator?.address),
        row('Kind', contract.kind || account.type),
        row('Code hash', contract.codeHash),
        row('Type hash', contract.typeHash),
        row('TZIPs', Array.isArray(contract.tzips) ? contract.tzips.join(', ') : contract.tzips)
    ].join('');
    const rawCodeUrl = `${TZKT}/contracts/${encodeURIComponent(data.address)}/code?format=1`;
    const actions = [
        `<a href="/#ledger-flow=${encodeURIComponent(data.address)}">Open Ledger Flow</a>`,
        externalTzktLink(data.address),
        `<a href="${escapeHtml(rawCodeUrl)}" target="_blank" rel="noopener">View raw contract code</a>`,
        circulationLinks()
    ].join('');
    return `
        ${renderSourceQuality(data)}
        <div class="native-explorer-hero native-contract-hero">
            <span>Native smart contract view</span>
            <h2>${escapeHtml(display)}</h2>
            <code>${escapeHtml(data.address)}</code>
        </div>
        <div class="native-explorer-metrics native-contract-metrics">${metrics}</div>
        <div class="native-explorer-actions">${actions}</div>
        <section class="native-explorer-section">
            <div class="native-explorer-section-head">
                <h3>Contract identity</h3>
                <span>TzKT indexed deployment facts</span>
            </div>
            <div class="native-contract-identity">${identity}</div>
        </section>
        <section class="native-explorer-section">
            <div class="native-explorer-section-head">
                <h3>Entrypoints</h3>
                <span>${entrypointsAvailable ? `${escapeHtml(formatNumber(data.entrypoints.length))} decoded calls · parameter shapes are summaries` : 'Decoded interface unavailable in this read'}</span>
            </div>
            <div class="native-contract-entrypoints">${renderContractEntrypoints(data.entrypoints, { available: entrypointsAvailable })}</div>
        </section>
        <section class="native-explorer-section">
            <div class="native-explorer-section-head">
                <h3>Related deployments</h3>
                <span>${sameCodeAvailable ? "Contracts returned by TzKT's same-code index" : 'TzKT same-code index unavailable in this read'}</span>
            </div>
            <div class="native-contract-matches">${renderSameCode(data.sameCode, data.address, { available: sameCodeAvailable })}</div>
        </section>
        <section class="native-explorer-section">
            <div class="native-explorer-section-head">
                <h3>Recent contract flow</h3>
                <span>${recentAvailable ? 'Applied account-level transactions' : 'Recent flow unavailable in this read'}</span>
            </div>
            <div class="native-explorer-events">${renderRecentTransactions(data.recent, data.address, { available: recentAvailable })}</div>
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
        <div class="native-explorer-actions">
            <a href="/health/">Open Network Health</a>
            ${externalTzktLink(hash)}
            ${circulationLinks()}
        </div>
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
            <a href="/health/">Open Network Health</a>
            ${externalTzktLink(String(level || hash))}
            ${circulationLinks()}
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
        <div class="modal-content modal-large native-explorer-content" role="dialog" aria-modal="true" aria-label="Tezos native explorer" tabindex="-1">
            <button class="modal-close native-explorer-close" type="button" aria-label="Close native explorer">&times;</button>
            <div class="native-explorer-body"></div>
        </div>
    `;
    overlay.addEventListener('click', (event) => {
        if (event.target === overlay || event.target.closest('.native-explorer-close')) closeNativeExplorer();
        const retry = event.target.closest('[data-native-retry]');
        if (retry && currentRequest) {
            event.preventDefault();
            if (retry.dataset.nativeRetrying === 'true') return;
            retry.dataset.nativeRetrying = 'true';
            retry.setAttribute('aria-busy', 'true');
            retry.setAttribute('aria-disabled', 'true');
            retry.textContent = 'Retrying…';
            openNativeExplorer(currentRequest.type, currentRequest.value, {
                preserveRendered: true,
                focusAfterRetry: true
            });
            return;
        }
        const link = event.target.closest('[data-native-entity-link]');
        if (!link || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        if (!link.getAttribute('href')?.startsWith('#')) return;
        event.preventDefault();
        window.location.hash = link.getAttribute('href');
    });
    document.body.appendChild(overlay);
    return overlay;
}

function renderOverlay(html, { focusAfterRetry = false } = {}) {
    const overlay = ensureOverlay();
    const body = overlay.querySelector('.native-explorer-body');
    if (body) body.innerHTML = html;
    overlay.classList.add('active');
    activateOverlayDialog(overlay, {
        close: closeNativeExplorer,
        dialogSelector: '.native-explorer-content',
        label: 'Tezos native explorer',
        initialFocusSelector: '.native-explorer-close',
        restoreFocusSelector: '#hero-search-input, #features-gear'
    });
    if (focusAfterRetry) {
        window.requestAnimationFrame(() => {
            const target = overlay.querySelector('[data-native-retry]')
                || overlay.querySelector('.native-explorer-source-status')
                || overlay.querySelector('.native-explorer-close');
            target?.focus({ preventScroll: true });
        });
    }
}

function renderLoading(type, value) {
    renderOverlay(`
        <div class="native-explorer-loading">
            <span>${escapeHtml(type)}</span>
            <strong>${escapeHtml(shortHash(value, 18, 8))}</strong>
            <p>${loadingText("Loading Tezos data")}</p>${loadingRows("Loading entity details")}
        </div>
    `);
}

function renderError(type, value, error, options = {}) {
    renderOverlay(`
        <div class="native-explorer-error">
            <span>${escapeHtml(type)}</span>
            <h2>Native view could not load</h2>
            <code>${escapeHtml(value)}</code>
            <p>${escapeHtml(error?.message || 'The API did not return data for this entity.')}</p>
            <div class="native-explorer-actions">
                ${externalTzktLink(value, 'Check TzKT directly')}
                ${circulationLinks()}
            </div>
        </div>
    `, options);
}

export function closeNativeExplorer() {
    requestGeneration += 1;
    currentRequest = null;
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    overlay.classList.remove('active');
    deactivateOverlayDialog(overlay);
}

export async function openNativeExplorer(type, rawValue, {
    preserveRendered = false,
    focusAfterRetry = false
} = {}) {
    const parsed = parseSearchEntity(rawValue);
    const value = parsed?.value || String(rawValue || '').trim();
    if (!value || !parsed) return;
    const generation = ++requestGeneration;
    const normalizedType = type === 'op' ? 'operation' : type;
    currentRequest = { type: normalizedType, value };
    if (!preserveRendered) renderLoading(normalizedType, value);
    try {
        if (parsed.requiresChecksum && !await validateBase58Check(value)) {
            throw new Error('Base58 checksum failed. Tezos identifiers are case-sensitive.');
        }
        if (generation !== requestGeneration) return;
        if (normalizedType === 'contract' && parsed.kind === 'contract') {
            const lens = await fetchContractLens(value);
            if (generation !== requestGeneration) return;
            renderOverlay(renderContractLens(lens), { focusAfterRetry });
            return;
        }
        if (normalizedType === 'account' && parsed.kind === 'account') {
            const lens = await fetchAccountLens(value);
            if (generation !== requestGeneration) return;
            renderOverlay(renderAccountLens(lens), { focusAfterRetry });
            return;
        }
        if (normalizedType === 'operation' && parsed.kind === 'operation') {
            const rows = await fetchOperationLens(value);
            if (generation !== requestGeneration) return;
            renderOverlay(renderOperationLens(value, rows), { focusAfterRetry });
            return;
        }
        if (normalizedType === 'block' && parsed.kind === 'block') {
            const block = await fetchBlockLens(value);
            if (generation !== requestGeneration) return;
            renderOverlay(renderBlockLens(block), { focusAfterRetry });
            return;
        }
        throw new Error('Unsupported Tezos entity shape.');
    } catch (error) {
        if (generation !== requestGeneration) return;
        renderError(normalizedType, value, error, { focusAfterRetry });
    }
}

export function initNativeExplorer() {
    window.TezosNativeExplorer = {
        open: openNativeExplorer,
        close: closeNativeExplorer
    };
}
