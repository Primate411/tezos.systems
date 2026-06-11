/**
 * Tezlink Chamber
 * Atomic L2 rollup surface backed by current mainnet L2 data sources.
 */

import { API_URLS } from '../core/config.js';
import { escapeHtml } from '../core/utils.js';

const DEFILLAMA = API_URLS.defillama;
const EXPLORER = API_URLS.tezlinkExplorer;
const RPC = API_URLS.tezlinkRpc;
const TZKT = API_URLS.tzkt;
const ENTRY_REFRESH_MS = 60 * 1000;
const CHAMBER_REFRESH_MS = 60 * 1000;
const CACHE_TTL = 45 * 1000;
const CHAIN_NAME = 'Etherlink';

let cachedData = null;
let cachedAt = 0;
let entryTimer = null;
let chamberTimer = null;
let chamberInFlight = false;
let savedBodyOverflow = null;
let savedHtmlOverflow = null;

function isAbortableTarget(target) {
    return target.closest?.('button, a, .card-info-btn, .card-tooltip');
}

async function fetchJson(url, options = {}) {
    const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        ...options
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

async function rpcCall(method, params = []) {
    const response = await fetch(RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
    });
    if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
    const payload = await response.json();
    if (payload.error) throw new Error(payload.error.message || 'RPC error');
    return payload.result;
}

function toNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function hexToNumber(value) {
    if (typeof value !== 'string') return null;
    const parsed = Number.parseInt(value, 16);
    return Number.isFinite(parsed) ? parsed : null;
}

function compactNumber(value, options = {}) {
    const number = toNumber(value);
    if (number === null) return '--';
    return Intl.NumberFormat('en-US', {
        notation: 'compact',
        maximumFractionDigits: options.maximumFractionDigits ?? (Math.abs(number) >= 1000 ? 1 : 2)
    }).format(number);
}

function formatUsd(value) {
    const number = toNumber(value);
    if (number === null) return '--';
    if (number >= 1_000_000_000) return `$${(number / 1_000_000_000).toFixed(2)}B`;
    if (number >= 1_000_000) return `$${(number / 1_000_000).toFixed(1)}M`;
    if (number >= 1_000) return `$${(number / 1_000).toFixed(1)}K`;
    return `$${number.toFixed(0)}`;
}

function formatGas(value) {
    const number = toNumber(value);
    if (number === null) return '--';
    return `${number.toFixed(number < 10 ? 2 : 1)} gwei`;
}

function formatMs(value) {
    const number = toNumber(value);
    if (number === null) return '--';
    if (number < 1000) return `${Math.round(number)}ms`;
    return `${(number / 1000).toFixed(2)}s`;
}

function shortHash(hash) {
    if (!hash || typeof hash !== 'string') return '0x...';
    return `${hash.slice(0, 7)}...${hash.slice(-5)}`;
}

function formatAge(timestamp) {
    if (!timestamp) return '--';
    const ms = new Date(timestamp).getTime();
    if (!Number.isFinite(ms)) return '--';
    const diff = Date.now() - ms;
    if (diff < 0) return 'now';
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
}

function displayAddress(address) {
    if (!address?.hash) return 'Contract';
    return address.name || address.ens_domain_name || shortHash(address.hash);
}

function friendlyMethod(method) {
    const raw = String(method || '').trim();
    const lower = raw.toLowerCase();
    const known = {
        '0xae7e8d81': 'oracle update',
        updatepricefeedsifnecessary: 'oracle update',
        updatepricefeeds: 'oracle update',
        transfer: 'transfer',
        approve: 'approve',
        swap: 'swap'
    };
    if (known[lower]) return known[lower];
    if (/^0x[a-f0-9]{8}$/i.test(raw)) return 'contract call';
    return raw.replace(/_/g, ' ') || 'transaction';
}

function collapseTxRows(txs, limit = 8) {
    const rows = [];
    for (const tx of txs || []) {
        const method = friendlyMethod(tx.method);
        const previous = rows[rows.length - 1];
        if (previous && previous.method === method && previous.to === tx.to) {
            previous.count += 1;
            previous.hashes.push(tx.hash);
            continue;
        }
        rows.push({ ...tx, method, count: 1, hashes: [tx.hash] });
        if (rows.length >= limit) break;
    }
    return rows;
}

function txMethodLabel(tx) {
    return tx.count > 1 ? `${tx.method} x${tx.count}` : tx.method;
}

function normalizeTx(tx) {
    const feeValue = toNumber(tx?.fee?.value) ?? toNumber(tx?.transaction_burnt_fee);
    const feeMutezLike = feeValue === null ? null : feeValue / 1e18;
    return {
        hash: tx?.hash || '',
        method: tx?.method || tx?.decoded_input?.method_call?.split('(')?.[0] || tx?.transaction_types?.[0] || 'tx',
        timestamp: tx?.timestamp || null,
        blockNumber: toNumber(tx?.block_number),
        fee: feeMutezLike,
        status: tx?.status || tx?.result || 'ok',
        to: displayAddress(tx?.to),
        from: displayAddress(tx?.from)
    };
}

function normalizeProtocols(protocols) {
    if (!Array.isArray(protocols)) return [];
    return protocols
        .map((protocol) => ({
            name: protocol.name || 'Protocol',
            category: protocol.category || 'DeFi',
            tvl: toNumber(protocol.chainTvls?.[CHAIN_NAME]) ?? 0,
            url: protocol.url || (protocol.slug ? `https://defillama.com/protocol/${protocol.slug}` : 'https://defillama.com/chain/Etherlink')
        }))
        .filter((protocol) => protocol.tvl > 0)
        .sort((a, b) => b.tvl - a.tvl)
        .slice(0, 8);
}

function normalizeChainTvls(chains) {
    const rows = Array.isArray(chains) ? chains : [];
    const l2 = rows.find((chain) => chain.name === CHAIN_NAME);
    const l1 = rows.find((chain) => chain.name === 'Tezos');
    return {
        l2Tvl: toNumber(l2?.tvl),
        l1Tvl: toNumber(l1?.tvl)
    };
}

function normalizeStats(stats, txPayload, rpcResults, chainTvls, protocols) {
    const txs = Array.isArray(txPayload?.items) ? txPayload.items.map(normalizeTx).slice(0, 8) : [];
    const rpcHead = hexToNumber(rpcResults?.head);
    const rpcGasWei = hexToNumber(rpcResults?.gasPrice);
    const explorerGas = toNumber(stats?.gas_prices?.average);
    const rpcGasGwei = rpcGasWei === null ? null : rpcGasWei / 1e9;
    const averageBlockTime = toNumber(stats?.average_block_time);

    return {
        updatedAt: Date.now(),
        tvl: chainTvls.l2Tvl ?? toNumber(stats?.tvl),
        tezosTvl: chainTvls.l1Tvl,
        tvlShare: chainTvls.l2Tvl && chainTvls.l1Tvl ? (chainTvls.l2Tvl / (chainTvls.l2Tvl + chainTvls.l1Tvl)) * 100 : null,
        transactionsToday: toNumber(stats?.transactions_today),
        totalTransactions: toNumber(stats?.total_transactions),
        totalAddresses: toNumber(stats?.total_addresses),
        averageBlockTime,
        gasGwei: explorerGas ?? rpcGasGwei,
        gasUpdatedAt: stats?.gas_price_updated_at || null,
        rpcHead,
        explorerHead: toNumber(stats?.total_blocks),
        protocols,
        txs
    };
}

function normalizeTvlHistory(rows) {
    if (!Array.isArray(rows)) return [];
    return rows
        .map((row) => ({
            date: row.date || row.timestamp || row.time,
            tvl: toNumber(row.tvl ?? row.totalLiquidityUSD ?? row.value)
        }))
        .filter((row) => row.date && row.tvl !== null)
        .slice(-30);
}

function normalizeChartRows(payload, valueKeys = ['value', 'transactions', 'count']) {
    const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.chart_data) ? payload.chart_data : Array.isArray(payload?.items) ? payload.items : [];
    return rows
        .map((row) => {
            const valueKey = valueKeys.find((key) => row[key] !== undefined);
            return {
                date: row.date || row.timestamp || row.day,
                value: valueKey ? toNumber(row[valueKey]) : null
            };
        })
        .filter((row) => row.date && row.value !== null)
        .slice(-30);
}

function normalizeTokens(payload) {
    const rows = Array.isArray(payload?.items) ? payload.items : Array.isArray(payload) ? payload : [];
    return rows
        .map((token) => ({
            name: token.name || token.token?.name || 'Token',
            symbol: token.symbol || token.token?.symbol || '',
            holders: toNumber(token.holders_count ?? token.holders ?? token.token?.holders_count),
            address: token.address || token.token?.address || token.token?.address_hash || ''
        }))
        .filter((token) => token.holders !== null)
        .sort((a, b) => b.holders - a.holders)
        .slice(0, 6);
}

function normalizeAnchor(payload) {
    const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.items) ? payload.items : [];
    const anchor = rows[0] || payload || null;
    if (!anchor || Array.isArray(anchor)) return null;
    return {
        address: anchor.address || anchor.hash || anchor.rollup || anchor.smart_rollup || '',
        level: toNumber(anchor.lastCommitmentLevel ?? anchor.last_commitment_level ?? anchor.lastActivity ?? anchor.lastLevel),
        inboxLevel: toNumber(anchor.inboxLevel ?? anchor.inbox_level),
        updatedAt: anchor.lastActivityTime || anchor.timestamp || anchor.updatedAt || null
    };
}

function trendDelta(rows, key = 'value') {
    if (!rows?.length) return null;
    const first = rows[0]?.[key];
    const last = rows[rows.length - 1]?.[key];
    if (!Number.isFinite(first) || !Number.isFinite(last)) return null;
    return {
        first,
        last,
        absolute: last - first,
        pct: first ? ((last - first) / first) * 100 : null
    };
}

async function fetchTezlinkData({ force = false } = {}) {
    if (!force && cachedData && Date.now() - cachedAt < CACHE_TTL) return cachedData;

    const [chainsResult, protocolsResult, statsResult, txsResult, headResult, gasResult, tvlHistoryResult, txChartResult, activeAccountsResult, tokensResult, anchorResult] = await Promise.allSettled([
        fetchJson(`${DEFILLAMA}/v2/chains`),
        fetchJson(`${DEFILLAMA}/protocols`),
        fetchJson(`${EXPLORER}/stats`),
        fetchJson(`${EXPLORER}/transactions?filter=validated`),
        rpcCall('eth_blockNumber'),
        rpcCall('eth_gasPrice'),
        fetchJson(`${DEFILLAMA}/v2/historicalChainTvl/${CHAIN_NAME}`),
        fetchJson(`${EXPLORER}/stats/charts/transactions`),
        fetchJson(`${EXPLORER}/stats/charts/active-accounts`),
        fetchJson(`${EXPLORER}/tokens?type=ERC-20&sort=holders_count&order=desc`),
        fetchJson(`${TZKT}/smart_rollups?limit=5&sort.desc=lastActivity`)
    ]);

    const chains = chainsResult.status === 'fulfilled' ? chainsResult.value : [];
    const protocolsRaw = protocolsResult.status === 'fulfilled' ? protocolsResult.value : [];
    const stats = statsResult.status === 'fulfilled' ? statsResult.value : {};
    const txPayload = txsResult.status === 'fulfilled' ? txsResult.value : {};
    const protocols = normalizeProtocols(protocolsRaw);
    const chainTvls = normalizeChainTvls(chains);

    const data = normalizeStats(stats, txPayload, {
        head: headResult.status === 'fulfilled' ? headResult.value : null,
        gasPrice: gasResult.status === 'fulfilled' ? gasResult.value : null
    }, chainTvls, protocols);
    data.tvlHistory = tvlHistoryResult.status === 'fulfilled' ? normalizeTvlHistory(tvlHistoryResult.value) : [];
    data.txHistory = txChartResult.status === 'fulfilled' ? normalizeChartRows(txChartResult.value, ['transactions', 'value', 'count']) : [];
    data.activeAccountsHistory = activeAccountsResult.status === 'fulfilled' ? normalizeChartRows(activeAccountsResult.value, ['active_accounts', 'accounts', 'value']) : [];
    data.tokens = tokensResult.status === 'fulfilled' ? normalizeTokens(tokensResult.value) : [];
    data.anchor = anchorResult.status === 'fulfilled' ? normalizeAnchor(anchorResult.value) : null;
    data.gasPrices = stats?.gas_prices || {};

    if (!data.tvl && !data.transactionsToday && !data.totalTransactions && !data.totalAddresses && !data.txs.length) {
        throw new Error('Tezlink data unavailable');
    }

    cachedData = data;
    cachedAt = Date.now();
    return data;
}

function renderEntryTape(txs) {
    if (!txs?.length) return '<div class="tezlink-tape-empty">Waiting for L2 transactions</div>';
    return collapseTxRows(txs, 3).map((tx) => `
        <div class="tezlink-tape-row">
            <span class="tezlink-tape-method">${escapeHtml(txMethodLabel(tx))}</span>
            <span class="tezlink-tape-target">${escapeHtml(tx.to)}</span>
            <span class="tezlink-tape-age">${escapeHtml(formatAge(tx.timestamp))}</span>
        </div>
    `).join('');
}

function renderEntryMetrics(data) {
    return `
        <div class="tezlink-entry-metric">
            <span>24h tx</span>
            <strong>${compactNumber(data.transactionsToday)}</strong>
        </div>
        <div class="tezlink-entry-metric">
            <span>Gas</span>
            <strong>${formatGas(data.gasGwei)}</strong>
        </div>
        <div class="tezlink-entry-metric">
            <span>Addresses</span>
            <strong>${compactNumber(data.totalAddresses)}</strong>
        </div>
        <div class="tezlink-entry-metric">
            <span>Cadence</span>
            <strong>${formatMs(data.averageBlockTime)}</strong>
        </div>
    `;
}

function renderEntryCard(data) {
    const card = document.getElementById('tezlink-entry-card');
    const value = document.getElementById('tezlink-entry-tvl');
    const description = document.getElementById('tezlink-entry-description');
    const metrics = document.getElementById('tezlink-entry-metrics');
    const tape = document.getElementById('tezlink-entry-tape');
    const mini = document.getElementById('tezlink-entry-mini');

    if (value) value.textContent = formatUsd(data.tvl);
    if (description) {
        const tvlDelta = trendDelta(data.tvlHistory, 'tvl');
        description.textContent = Number.isFinite(tvlDelta?.pct) ? `Atomic L2 rollup · 30d ${tvlDelta.pct >= 0 ? '+' : ''}${tvlDelta.pct.toFixed(1)}% TVL` : 'Atomic L2 rollup';
    }
    if (metrics) metrics.innerHTML = renderEntryMetrics(data);
    if (tape) tape.innerHTML = renderEntryTape(data.txs);
    if (mini) {
        const head = data.rpcHead || data.explorerHead;
        mini.textContent = head ? `Head ${compactNumber(head)} · live L2 feed` : 'Live L2 feed';
    }
    if (card) {
        const time = new Date(data.updatedAt || Date.now()).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' });
        card.dataset.updatedLabel = `as of ${time} UTC`;
    }
}

function renderEntryError() {
    const value = document.getElementById('tezlink-entry-tvl');
    const description = document.getElementById('tezlink-entry-description');
    const mini = document.getElementById('tezlink-entry-mini');
    if (value) value.textContent = '--';
    if (description) description.textContent = 'L2 data unavailable';
    if (mini) mini.textContent = 'Retrying Tezlink sources';
}

function renderProtocolRows(protocols) {
    if (!protocols?.length) return '<div class="lb-empty-inline">No Tezlink protocol TVL rows returned.</div>';
    return protocols.slice(0, 8).map((protocol, index) => `
        <div class="lb-table-row tezlink-protocol-row">
            <span>${index + 1}</span>
            <div class="tezlink-protocol-name">
                <strong>${escapeHtml(protocol.name)}</strong>
                <small>${escapeHtml(protocol.category)}</small>
            </div>
            <span>${formatUsd(protocol.tvl)}</span>
        </div>
    `).join('');
}

function renderTransactionRows(txs) {
    if (!txs?.length) return '<div class="lb-empty-inline">No validated L2 transactions returned.</div>';
    return collapseTxRows(txs, 8).map((tx) => `
        <a class="lb-table-row tezlink-tx-row" href="https://explorer.etherlink.com/tx/${escapeHtml(tx.hash)}" target="_blank" rel="noopener">
            <span>${escapeHtml(txMethodLabel(tx))}</span>
            <span>${escapeHtml(tx.to)}</span>
            <span>${tx.fee === null ? '--' : `${tx.fee.toFixed(6)} XTZ`}</span>
            <span>${escapeHtml(formatAge(tx.timestamp))}</span>
        </a>
    `).join('');
}

function renderPulsePanel(data) {
    return `
        <section class="lb-panel tezlink-panel chamber-anim-fade">
            <div class="lb-panel-title">Atomic Rollup Pulse <span class="lb-live-pill">live</span></div>
            <div class="tezlink-hero-number">${formatUsd(data.tvl)}</div>
            <div class="health-hero-copy">DefiLlama chain TVL for the Tezlink L2 surface, sourced from current mainnet rollup data.</div>
            <div class="lb-metric-grid health-metric-grid">
                <div><span>24h tx</span><strong>${compactNumber(data.transactionsToday)}</strong></div>
                <div><span>Addresses</span><strong>${compactNumber(data.totalAddresses)}</strong></div>
                <div><span>Tezos share</span><strong>${data.tvlShare === null ? '--' : `${data.tvlShare.toFixed(1)}%`}</strong></div>
            </div>
        </section>
    `;
}

function renderThroughputPanel(data) {
    return `
        <section class="lb-panel tezlink-panel chamber-anim-fade" style="animation-delay:60ms">
            <div class="lb-panel-title">Cost + Throughput</div>
            <div class="lb-metric-grid health-metric-grid">
                <div><span>Gas</span><strong>${formatGas(data.gasGwei)}</strong></div>
                <div><span>Block time</span><strong>${formatMs(data.averageBlockTime)}</strong></div>
                <div><span>Total tx</span><strong>${compactNumber(data.totalTransactions)}</strong></div>
                <div><span>RPC head</span><strong>${compactNumber(data.rpcHead || data.explorerHead)}</strong></div>
            </div>
            <div class="health-timing-note">Explorer stats plus JSON-RPC head and gas price.</div>
        </section>
    `;
}

function renderProtocolPanel(data) {
    return `
        <section class="lb-panel tezlink-panel chamber-anim-fade" style="animation-delay:120ms">
            <div class="lb-panel-title">Protocol TVL</div>
            <div class="lb-table tezlink-protocol-table">
                <div class="lb-table-head"><span>#</span><span>Protocol</span><span>TVL</span></div>
                <div>${renderProtocolRows(data.protocols)}</div>
            </div>
        </section>
    `;
}

function renderTransactionPanel(data) {
    return `
        <section class="lb-panel tezlink-panel tezlink-transaction-panel chamber-anim-fade" style="animation-delay:180ms">
            <div class="lb-panel-title">Live Transaction Tape <span class="lb-live-pill">validated</span></div>
            <div class="lb-table tezlink-tx-table">
                <div class="lb-table-head"><span>Method</span><span>Target</span><span>Fee</span><span>Age</span></div>
                <div id="tezlink-tx-list">${renderTransactionRows(data.txs)}</div>
            </div>
        </section>
    `;
}

function renderMiniSparkline(rows, key = 'value') {
    const values = (rows || []).map((row) => row[key]).filter(Number.isFinite);
    if (values.length < 2) return '<div class="lb-empty-inline">Trend history unavailable.</div>';
    const width = 240;
    const height = 54;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = Math.max(1, max - min);
    const points = values.map((value, index) => {
        const x = (index / Math.max(1, values.length - 1)) * width;
        const y = height - ((value - min) / span) * height;
        return `${x.toFixed(1)},${Math.max(0, Math.min(height, y)).toFixed(1)}`;
    }).join(' ');
    return `<svg class="tezlink-mini-sparkline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"><polyline points="${points}"/></svg>`;
}

function renderTrendPanel(data) {
    const tvlDelta = trendDelta(data.tvlHistory, 'tvl');
    const txDelta = trendDelta(data.txHistory, 'value');
    const activeDelta = trendDelta(data.activeAccountsHistory, 'value');
    return `
        <section class="lb-panel tezlink-panel tezlink-trend-panel chamber-anim-fade" id="tezlink-trend-panel" style="animation-delay:90ms">
            <div class="lb-panel-title">30d Direction</div>
            <div class="lb-metric-grid health-metric-grid">
                <div><span>TVL</span><strong>${Number.isFinite(tvlDelta?.pct) ? `${tvlDelta.pct >= 0 ? '+' : ''}${tvlDelta.pct.toFixed(1)}%` : '--'}</strong></div>
                <div><span>Daily tx</span><strong>${Number.isFinite(txDelta?.pct) ? `${txDelta.pct >= 0 ? '+' : ''}${txDelta.pct.toFixed(1)}%` : '--'}</strong></div>
                <div><span>Active addresses</span><strong>${data.activeAccountsHistory?.length ? compactNumber(data.activeAccountsHistory.at(-1)?.value) : '--'}</strong></div>
            </div>
            ${renderMiniSparkline(data.tvlHistory, 'tvl')}
            <div class="health-timing-note">Cumulative addresses always rise; active-address history is the honest activity check.</div>
        </section>
    `;
}

function renderAnchorPanel(data) {
    const anchor = data.anchor;
    return `
        <section class="lb-panel tezlink-panel tezlink-anchor-panel chamber-anim-fade" id="tezlink-anchor-panel" style="animation-delay:100ms">
            <div class="lb-panel-title">L1 Anchor</div>
            <div class="lb-metric-grid health-metric-grid">
                <div><span>Rollup</span><strong>${anchor?.address ? escapeHtml(shortHash(anchor.address)) : '--'}</strong></div>
                <div><span>Commit level</span><strong>${anchor?.level ? compactNumber(anchor.level) : '--'}</strong></div>
                <div><span>Inbox level</span><strong>${anchor?.inboxLevel ? compactNumber(anchor.inboxLevel) : '--'}</strong></div>
            </div>
            <div class="health-timing-note">${anchor?.updatedAt ? `TzKT rollup activity ${escapeHtml(formatAge(anchor.updatedAt))} ago.` : 'Rollup anchor metadata is best-effort from TzKT smart-rollup rows.'}</div>
        </section>
    `;
}

function renderGasOraclePanel(data) {
    const slow = toNumber(data.gasPrices?.slow);
    const avg = toNumber(data.gasPrices?.average) ?? data.gasGwei;
    const fast = toNumber(data.gasPrices?.fast);
    const transferGas = 21000;
    const transferEth = Number.isFinite(avg) ? (avg * 1e9 * transferGas) / 1e18 : null;
    return `
        <section class="lb-panel tezlink-panel tezlink-gas-panel chamber-anim-fade" id="tezlink-gas-oracle" style="animation-delay:130ms">
            <div class="lb-panel-title">Gas Oracle</div>
            <div class="lb-metric-grid health-metric-grid">
                <div><span>Slow</span><strong>${formatGas(slow)}</strong></div>
                <div><span>Average</span><strong>${formatGas(avg)}</strong></div>
                <div><span>Fast</span><strong>${formatGas(fast)}</strong></div>
            </div>
            <div class="health-timing-note">Simple transfer gas at average: ${transferEth === null ? '--' : `${transferEth.toFixed(8)} XTZ-equivalent gas units`}.</div>
        </section>
    `;
}

function renderTokensPanel(data) {
    const rows = data.tokens?.length ? data.tokens.map((token) => `
        <div class="lb-table-row">
            <span>${escapeHtml(token.symbol || token.name)}</span>
            <span>${escapeHtml(token.name)}</span>
            <span>${compactNumber(token.holders)}</span>
        </div>
    `).join('') : '<div class="lb-empty-inline">Token holder rows unavailable.</div>';
    return `
        <section class="lb-panel tezlink-panel tezlink-token-panel chamber-anim-fade" id="tezlink-token-panel" style="animation-delay:150ms">
            <div class="lb-panel-title">Top Tokens by Holders</div>
            <div class="lb-table">
                <div class="lb-table-head"><span>Symbol</span><span>Name</span><span>Holders</span></div>
                ${rows}
            </div>
        </section>
    `;
}

function renderTezlinkChamber(data, container) {
    const head = data.rpcHead || data.explorerHead;
    container.innerHTML = `
        <div class="chamber-header lb-header tezlink-header chamber-anim-fade">
            <div class="lb-system-strip">
                <span class="lb-system-brand">Tezos.Systems</span>
                <span>Tezlink</span>
                <span>Atomic L2 rollup</span>
            </div>
            <div class="chamber-title-row">
                <h2 class="chamber-title" id="tezlink-title">Tezlink Chamber</h2>
                <span class="chamber-badge live">Live L2</span>
                <span class="lb-live-pill lb-refresh-pill" id="tezlink-refresh-state">auto-refresh ${Math.round(CHAMBER_REFRESH_MS / 1000)}s</span>
            </div>
            <div class="chamber-proposal-info">
                <div class="proposal-name">Single atomic L2 rollup surface</div>
                <div class="proposal-hash">${head ? `Head ${compactNumber(head)} · ${formatUsd(data.tvl)} TVL · ${compactNumber(data.transactionsToday)} tx today` : 'DefiLlama + Blockscout + JSON-RPC'}</div>
            </div>
        </div>
        <section class="lb-explainer tezlink-explainer chamber-anim-fade">
            <div class="lb-explainer-main">
                <div class="lb-explainer-kicker">Right now</div>
                <p><strong>Tezlink</strong> tracks the atomic L2 execution surface Tezos users care about: TVL, cost, active transaction flow, and protocol mix.</p>
            </div>
            <div class="lb-explainer-facts" aria-label="Tezlink quick facts">
                <span><strong>TVL</strong> ${formatUsd(data.tvl)}</span>
                <span><strong>24h tx</strong> ${compactNumber(data.transactionsToday)}</span>
                <span><strong>Gas</strong> ${formatGas(data.gasGwei)}</span>
            </div>
        </section>
        <div class="lb-dashboard-grid tezlink-dashboard-grid">
            ${renderPulsePanel(data)}
            ${renderTrendPanel(data)}
            ${renderAnchorPanel(data)}
            ${renderThroughputPanel(data)}
            ${renderGasOraclePanel(data)}
            ${renderProtocolPanel(data)}
            ${renderTokensPanel(data)}
            ${renderTransactionPanel(data)}
        </div>
        <div class="chamber-footer chamber-anim-fade" style="animation-delay:240ms">
            <a href="https://defillama.com/chain/Etherlink" target="_blank" rel="noopener">DefiLlama TVL -></a>
            <span class="chamber-footer-sep">·</span>
            <a href="https://explorer.etherlink.com/" target="_blank" rel="noopener">Blockscout -></a>
            <span class="chamber-footer-sep">·</span>
            <a class="panel-direct-link" href="/#tezlink" aria-label="Direct link to Tezlink Chamber">Direct: /#tezlink</a>
        </div>
    `;
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

function handleEscape(event) {
    if (event.key === 'Escape') closeTezlinkChamber();
}

function stopChamberRefresh() {
    if (!chamberTimer) return;
    window.clearInterval(chamberTimer);
    chamberTimer = null;
}

async function refreshTezlinkChamber({ force = false } = {}) {
    if (chamberInFlight) return;
    const body = document.getElementById('tezlink-chamber-body');
    const state = document.getElementById('tezlink-refresh-state');
    if (!body) return;

    chamberInFlight = true;
    if (state) state.textContent = 'refreshing...';
    try {
        const data = await fetchTezlinkData({ force });
        renderEntryCard(data);
        renderTezlinkChamber(data, body);
    } catch (error) {
        console.warn('Tezlink chamber refresh failed:', error);
        if (!body.dataset.rendered) {
            body.innerHTML = `
                <div class="lb-error">
                    <strong>Tezlink data unavailable.</strong>
                    <button type="button" class="primary-btn" id="tezlink-retry-open">Retry</button>
                </div>
            `;
            body.querySelector('#tezlink-retry-open')?.addEventListener('click', () => refreshTezlinkChamber({ force: true }));
        }
    } finally {
        chamberInFlight = false;
        body.dataset.rendered = 'true';
        const refreshed = document.getElementById('tezlink-refresh-state');
        if (refreshed) refreshed.textContent = `auto-refresh ${Math.round(CHAMBER_REFRESH_MS / 1000)}s`;
    }
}

export async function openTezlinkChamber() {
    let overlay = document.getElementById('tezlink-modal');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'tezlink-modal';
        overlay.className = 'modal-overlay chamber-overlay lb-overlay tezlink-overlay';
        overlay.innerHTML = `
            <div class="modal-content modal-large chamber-content lb-content tezlink-content" role="dialog" aria-modal="true" aria-labelledby="tezlink-title">
                <button class="modal-close chamber-close" type="button" aria-label="Close Tezlink Chamber">&times;</button>
                <div class="chamber-body lb-body tezlink-body" id="tezlink-chamber-body">
                    <div class="loading">Loading Tezlink chamber...</div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        overlay.querySelector('.modal-close')?.addEventListener('click', closeTezlinkChamber);
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) closeTezlinkChamber();
        });
    }

    lockPageScroll();
    document.addEventListener('keydown', handleEscape);
    overlay.classList.add('active');
    await refreshTezlinkChamber({ force: true });

    stopChamberRefresh();
    chamberTimer = window.setInterval(() => {
        if (document.visibilityState === 'visible') refreshTezlinkChamber();
    }, CHAMBER_REFRESH_MS);
}

export function closeTezlinkChamber() {
    document.removeEventListener('keydown', handleEscape);
    stopChamberRefresh();
    const overlay = document.getElementById('tezlink-modal');
    if (overlay) overlay.classList.remove('active');
    unlockPageScroll();
}

async function refreshEntryCard({ force = false } = {}) {
    try {
        const data = await fetchTezlinkData({ force });
        renderEntryCard(data);
    } catch (error) {
        console.warn('Tezlink entry refresh failed:', error);
        renderEntryError();
    }
}

function startEntryRefresh() {
    if (entryTimer) return;
    entryTimer = window.setInterval(() => {
        if (document.visibilityState === 'visible') refreshEntryCard();
    }, ENTRY_REFRESH_MS);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) refreshEntryCard({ force: true });
    });
}

export function initTezlinkChamber() {
    if (document.getElementById('tezlink-entry-card')) {
        startEntryRefresh();
        refreshEntryCard();
        return;
    }

    const grid = document.getElementById('chambers-grid') || document.getElementById('governance-section')?.querySelector('.stats-grid');
    if (!grid) return;

    const card = document.createElement('div');
    card.id = 'tezlink-entry-card';
    card.className = 'stat-card chamber-entry-card chamber-entry-wide tezlink-entry-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', 'Open Tezlink Chamber');
    card.title = 'Open Tezlink Chamber';
    card.innerHTML = `
        <button class="card-copy-link" type="button" data-copy-hash="#tezlink" aria-label="Copy Tezlink direct link" title="Copy Tezlink link">🔗</button>
        <div class="card-inner">
            <div class="card-front chamber-entry-front tezlink-entry-front">
                <div class="tezlink-entry-main">
                    <h2 class="stat-label">Tezlink</h2>
                    <div class="stat-value tezlink-entry-value" id="tezlink-entry-tvl"><span class="loading">...</span></div>
                    <span class="tezlink-entry-value-label">TVL</span>
                    <p class="stat-description" id="tezlink-entry-description">Atomic L2 rollup</p>
                    <div class="chamber-entry-status live" id="tezlink-entry-mini">Loading L2 feed</div>
                </div>
                <div class="tezlink-entry-metrics" id="tezlink-entry-metrics" aria-label="Tezlink live metrics"></div>
                <div class="tezlink-entry-tape" id="tezlink-entry-tape" aria-label="Tezlink live transaction tape">
                    <div class="tezlink-tape-empty">Loading transactions</div>
                </div>
            </div>
        </div>
        <span class="chamber-expand-cue" title="Opens a full window" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4h5v5"/><path d="M9 20H4v-5"/><path d="M20 4l-7 7"/><path d="M4 20l7-7"/></svg></span>
    `;

    card.addEventListener('click', (event) => {
        if (isAbortableTarget(event.target)) return;
        openTezlinkChamber();
    });
    card.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        openTezlinkChamber();
    });

    const chamberCard = document.getElementById('chamber-entry-card');
    if (chamberCard?.parentElement === grid) {
        chamberCard.after(card);
    } else {
        grid.prepend(card);
    }

    refreshEntryCard({ force: true });
    startEntryRefresh();
}
