/**
 * My Tezos Portfolio — watch-only Tezos L1 XTZ aggregation and local history.
 * No address grouping, balances, or history leaves the visitor's browser.
 */

import {
    getAllMyTezosRecords,
    getMyTezosMeta,
    initMyTezosDb,
    deleteMyTezosRecord,
    putMyTezosRecords,
    setMyTezosMeta
} from '../core/my-tezos-db.mjs';
import { LINKED_ETHERLINK_ACCOUNTS_KEY } from '../core/etherlink-client.mjs';
import { ensureChartLibraries } from '../ui/chart-loader.js';
import { normalizeLinkedL2Accounts } from '../core/my-tezos-models.mjs';
import { escapeHtml, formatFreshnessStamp } from '../core/utils.js';
import { quietlyMutate, quietlySyncHtml } from '../core/quiet-refresh.js';
import {
    MAX_SAVED_MY_TEZOS_ADDRESSES,
    MY_TEZOS_ADDRESS_KEY,
    isTezosAddress,
    normalizeSavedMyTezosEntries,
    readSavedMyTezosEntries,
    rememberMyTezosAddress,
    shortAddress,
    upsertSavedMyTezosEntry,
    writeSavedMyTezosEntries
} from '../core/wallet.js';
import { isTezDomainName, normalizeTezDomainName, resolveTezDomainAddress } from '../core/tezos-domains.js';
import { fetchXTZPrice } from './price.js';
import { fetchMyTezosAccounts } from './my-tezos-tzkt-adapter.mjs';
import {
    activateMyTezosMemory,
    initMyTezosMemory
} from './my-tezos-memory.mjs';
import {
    MY_TEZOS_SCOPE_ALL,
    readMyTezosScope,
    readScopedMyTezosEntries
} from './my-tezos-scope.mjs';
import {
    MY_TEZOS_PORTFOLIO_HISTORY_SCHEMA,
    MY_TEZOS_PORTFOLIO_SCHEMA,
    appendPortfolioSnapshot,
    calculatePortfolioTotals,
    compactPortfolioHistory,
    mergePortfolioEntries,
    parsePortfolioImport,
    portfolioCompositionKey,
    portfolioRowFromAccount
} from './my-tezos-portfolio-model.mjs';

export {
    appendPortfolioSnapshot,
    calculatePortfolioTotals,
    compactPortfolioHistory,
    mergePortfolioEntries,
    parsePortfolioImport,
    portfolioCompositionKey,
    portfolioRowFromAccount
} from './my-tezos-portfolio-model.mjs';

const HISTORY_KEY = 'tezos-systems-my-tezos-portfolio-history-v1';
const ONE_HOUR_MS = 60 * 60 * 1000;

let lastCompletePortfolio = null;
let portfolioChart = null;
let historyRenderIntent = 0;
let historyChartFailed = false;
let portfolioRange = '1y';
let portfolioRefreshInFlight = null;
let portfolioRefreshController = null;
let portfolioGeneration = 0;
let portfolioInitialized = false;
let portfolioCompositionRefreshQueued = false;
let exactHistoryState = {
    seriesByAddress: {},
    aggregate: [],
    coverageByAddress: {},
    aggregateCoverage: {
        completed: 0,
        target: 0,
        dailyCompleted: 0,
        dailyTarget: 0,
        complete: false
    },
    sourceStatus: { stage: 'cached' }
};

function getPortfolioPanel() {
    return document.getElementById('my-tezos-panel-portfolio');
}

function isPortfolioVisible() {
    const panel = getPortfolioPanel();
    return document.visibilityState === 'visible'
        && panel?.hidden === false
        && document.getElementById('my-tezos-drawer')?.classList.contains('open') === true;
}

function isMyTezosVisible() {
    return document.visibilityState === 'visible'
        && document.getElementById('my-tezos-drawer')?.classList.contains('open') === true;
}

function formatXtz(mutez, maximumFractionDigits = 2) {
    const value = Number(mutez) / 1e6;
    if (!Number.isFinite(value)) return '—';
    return `${value.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits
    })} ꜩ`;
}

function formatFiat(mutez, price, symbol) {
    const value = (Number(mutez) / 1e6) * Number(price);
    if (!Number.isFinite(value)) return '';
    return `${symbol}${value.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;
}

function readHistoryStore() {
    try {
        const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || 'null');
        if (parsed?.schema === MY_TEZOS_PORTFOLIO_HISTORY_SCHEMA && parsed.series && typeof parsed.series === 'object') {
            return parsed;
        }
    } catch {}
    return { schema: MY_TEZOS_PORTFOLIO_HISTORY_SCHEMA, series: {} };
}

function writeHistoryStore(store) {
    try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(store));
    } catch {}
}

function persistObservedSnapshot(composition, snapshot) {
    const record = {
        id: `observed:${composition}:${snapshot.timestamp}`,
        scopeId: composition,
        timestamp: snapshot.timestamp,
        sourceType: 'observed',
        total: snapshot.total,
        spendable: snapshot.spendable,
        staked: snapshot.staked,
        unstaking: snapshot.unstaking,
        confidence: 'exact'
    };
    putMyTezosRecords('snapshots', record).then(async () => {
        const records = await getAllMyTezosRecords('snapshots', {
            index: 'scopeTimestamp',
            query: IDBKeyRange.bound([composition, 0], [composition, Number.MAX_SAFE_INTEGER]),
            limit: 5_100
        });
        const excess = Math.max(0, records.length - 5_000);
        await Promise.all(records.slice(0, excess).map((point) => deleteMyTezosRecord('snapshots', point.id)));
    }).catch(() => {});
}

function saveCompleteSnapshot(composition, totals, timestamp = Date.now()) {
    const store = readHistoryStore();
    const existing = Array.isArray(store.series?.[composition]) ? store.series[composition] : [];
    const last = existing.at(-1);
    const snapshot = {
        timestamp,
        total: totals.total,
        spendable: totals.spendable,
        staked: totals.staked,
        unstaking: totals.unstaking
    };
    // Keep one point per hour, but replace the current hour with the newest
    // complete read so a manual refresh improves rather than duplicates it.
    if (last && Math.floor(last.timestamp / ONE_HOUR_MS) === Math.floor(timestamp / ONE_HOUR_MS)) {
        existing[existing.length - 1] = snapshot;
        store.series[composition] = compactPortfolioHistory(existing, { now: timestamp });
        writeHistoryStore(store);
        persistObservedSnapshot(composition, snapshot);
        return;
    }
    writeHistoryStore(appendPortfolioSnapshot(store, composition, snapshot, { now: timestamp }));
    persistObservedSnapshot(composition, snapshot);
}

function currentEntries() {
    return readSavedMyTezosEntries();
}

function includedEntries(entries = currentEntries()) {
    return entries.filter((entry) => entry.included !== false);
}

function renderEmptySummary(message = 'Add or include an address to calculate a complete portfolio.') {
    const summary = document.getElementById('portfolio-summary');
    if (summary) quietlyMutate(summary, () => {
        summary.querySelectorAll('[data-portfolio-total]').forEach((card) => {
            const value = card.querySelector('strong');
            const note = card.querySelector('small');
            if (value) value.textContent = '—';
            if (note) note.textContent = card.dataset.portfolioTotal === 'total' ? 'Current XTZ' : card.dataset.portfolioTotal;
        });
    });
    const coverage = document.getElementById('portfolio-coverage');
    if (coverage) coverage.textContent = message;
    const rates = document.getElementById('portfolio-rates');
    if (rates) rates.textContent = 'Current fiat equivalents appear when the shared XTZ price is available.';
}

function renderSummary(model) {
    const summary = document.getElementById('portfolio-summary');
    if (!summary) return;
    const { prices, entries, rows, timestamp } = model;
    const scope = readMyTezosScope();
    const scopedEntries = readScopedMyTezosEntries(entries);
    const scopedAddresses = new Set(scopedEntries.map((entry) => entry.address));
    const totals = calculatePortfolioTotals(rows.filter((row) => scopedAddresses.has(row.address)));
    quietlyMutate(summary, () => {
        for (const key of ['total', 'spendable', 'staked', 'unstaking']) {
            const card = summary.querySelector(`[data-portfolio-total="${key}"]`);
            const value = card?.querySelector('strong');
            const note = card?.querySelector('small');
            if (value) value.textContent = formatXtz(totals[key]);
            if (note) {
                const usd = prices?.usd ? formatFiat(totals[key], prices.usd, '$') : '';
                const eur = prices?.eur ? formatFiat(totals[key], prices.eur, '€') : '';
                note.textContent = [usd, eur].filter(Boolean).join(' · ') || 'XTZ value';
            }
        }
    });
    const coverage = document.getElementById('portfolio-coverage');
    if (coverage) {
        coverage.textContent = scope === MY_TEZOS_SCOPE_ALL
            ? `${scopedEntries.length}/${currentEntries().length} saved addresses included · complete current read`
            : `${scopedEntries[0]?.label || shortAddress(scopedEntries[0]?.address)} selected · complete current read`;
    }
    const rates = document.getElementById('portfolio-rates');
    if (rates) {
        const priceCopy = prices?.usd && prices?.eur
            ? `1 ꜩ = $${Number(prices.usd).toFixed(4)} · €${Number(prices.eur).toFixed(4)}`
            : 'XTZ price unavailable; on-chain totals remain current.';
        rates.textContent = `${priceCopy} · ${formatFreshnessStamp(new Date(timestamp), { source: 'Portfolio' })}`;
    }
    window.dispatchEvent(new CustomEvent('my-tezos-portfolio-ready', {
        detail: {
            composition: model.composition,
            scope,
            totals,
            count: scopedEntries.length,
            prices,
            timestamp
        }
    }));
}

function walletValue(row, key) {
    if (!row) return '<span class="portfolio-wallet-unavailable">—</span>';
    return `<strong>${escapeHtml(formatXtz(row[key]))}</strong>`;
}

function walletBaker(row) {
    if (!row?.baker) return '<span class="portfolio-wallet-muted">None</span>';
    const display = row.baker.self
        ? (row.baker.alias || 'Self (Baker)')
        : (row.baker.alias || shortAddress(row.baker.address));
    return `<span class="portfolio-wallet-baker${row.baker.self ? ' self' : ''}" title="${escapeHtml(row.baker.address)}">${escapeHtml(display)}</span>`;
}

function renderWalletList(entries, model = lastCompletePortfolio) {
    const container = document.getElementById('drawer-saved-addresses');
    if (!container) return;
    const includedCount = includedEntries(entries).length;
    const count = document.getElementById('portfolio-wallet-count');
    if (count) {
        count.textContent = entries.length
            ? `${includedCount} included · ${entries.length}/${MAX_SAVED_MY_TEZOS_ADDRESSES} saved`
            : `0/${MAX_SAVED_MY_TEZOS_ADDRESSES} saved`;
    }
    const active = localStorage.getItem(MY_TEZOS_ADDRESS_KEY) || '';
    const rows = model?.composition === portfolioCompositionKey(includedEntries(entries))
        ? new Map(model.rows.map((row) => [row.address, row]))
        : new Map();

    if (!entries.length) {
        quietlySyncHtml(container, `
            <div class="portfolio-wallet-empty">
                <strong>No saved addresses yet</strong>
                <span>Add a public Tezos address or .tez name above. No wallet connection is required.</span>
            </div>
        `);
        return;
    }

    const header = `
        <div class="portfolio-wallet-row portfolio-wallet-row-header" aria-hidden="true">
            <span>Use</span><span>Name</span><span>Baker</span><span>Total</span><span>Spendable</span><span>Staked</span><span>Unstaking</span><span>Actions</span>
        </div>
    `;
    const body = entries.map((entry) => {
        const row = entry.included === false ? null : rows.get(entry.address);
        const label = entry.label || shortAddress(entry.address);
        const isActive = entry.address === active;
        return `
            <article class="portfolio-wallet-row${entry.included === false ? ' excluded' : ''}${isActive ? ' active' : ''}" data-address="${escapeHtml(entry.address)}">
                <label class="portfolio-include-control" title="${entry.included === false ? 'Include in totals' : 'Included in totals'}">
                    <input type="checkbox" data-portfolio-include="${escapeHtml(entry.address)}" ${entry.included === false ? '' : 'checked'} aria-label="Include ${escapeHtml(label)} in portfolio totals">
                    <span aria-hidden="true"></span>
                </label>
                <div class="portfolio-wallet-identity">
                    <button type="button" class="saved-addr portfolio-wallet-activate" data-portfolio-activate="${escapeHtml(entry.address)}" aria-pressed="${isActive ? 'true' : 'false'}" title="${isActive ? 'Current Overview address' : `Open ${escapeHtml(label)} in Overview`}">
                        ${isActive ? '<span class="portfolio-active-dot" aria-hidden="true"></span>' : ''}${escapeHtml(label)}
                    </button>
                    <span title="${escapeHtml(entry.address)}">${escapeHtml(shortAddress(entry.address))}</span>
                    <input type="text" class="portfolio-wallet-label-input" data-portfolio-label="${escapeHtml(entry.address)}" value="${escapeHtml(entry.label || '')}" maxlength="80" aria-label="Label for ${escapeHtml(entry.address)}" placeholder="Add label">
                </div>
                <div data-label="Baker">${entry.included === false ? '<span class="portfolio-wallet-muted">Excluded</span>' : walletBaker(row)}</div>
                <div data-label="Total">${entry.included === false ? '—' : walletValue(row, 'total')}</div>
                <div data-label="Spendable">${entry.included === false ? '—' : walletValue(row, 'spendable')}</div>
                <div data-label="Staked">${entry.included === false ? '—' : walletValue(row, 'staked')}</div>
                <div data-label="Unstaking">${entry.included === false ? '—' : walletValue(row, 'unstaking')}</div>
                <div class="portfolio-wallet-actions">
                    <button type="button" data-portfolio-copy="${escapeHtml(entry.address)}" aria-label="Copy ${escapeHtml(label)} address" title="Copy address">⧉</button>
                    <button type="button" data-portfolio-remove="${escapeHtml(entry.address)}" aria-label="Remove ${escapeHtml(label)}" title="Remove from this browser">✕</button>
                </div>
            </article>
        `;
    }).join('');

    quietlySyncHtml(container, header + body);
    wireWalletList(entries);
}

function setManagementStatus(message, state = '') {
    const status = document.getElementById('portfolio-management-status');
    if (!status) return;
    status.textContent = message;
    status.dataset.state = state;
}

async function copyAddress(address, button) {
    try {
        await navigator.clipboard.writeText(address);
    } catch {
        const input = document.createElement('textarea');
        input.value = address;
        input.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        input.remove();
    }
    const original = button.textContent;
    button.textContent = '✓';
    setTimeout(() => { if (button.isConnected) button.textContent = original; }, 1200);
}

function wireWalletList(entries) {
    const container = document.getElementById('drawer-saved-addresses');
    if (!container) return;

    container.querySelectorAll('[data-portfolio-include]').forEach((input) => {
        input.onchange = () => {
            const address = input.dataset.portfolioInclude;
            writeSavedMyTezosEntries(entries.map((entry) => (
                entry.address === address ? { ...entry, included: input.checked } : entry
            )), { source: 'portfolio-inclusion' });
            schedulePortfolioCompositionRefresh('Portfolio inclusion changed.');
        };
    });

    container.querySelectorAll('[data-portfolio-activate]').forEach((button) => {
        button.onclick = () => {
            const entry = entries.find((item) => item.address === button.dataset.portfolioActivate);
            if (!entry) return;
            rememberMyTezosAddress(entry.address, { label: entry.label, source: 'portfolio' });
            window.dispatchEvent(new CustomEvent('my-tezos-view-request', { detail: { view: 'overview' } }));
        };
    });

    container.querySelectorAll('[data-portfolio-label]').forEach((input) => {
        const save = () => {
            const address = input.dataset.portfolioLabel;
            const label = input.value.trim().slice(0, 80) || null;
            const current = readSavedMyTezosEntries();
            writeSavedMyTezosEntries(current.map((entry) => (
                entry.address === address ? { ...entry, label } : entry
            )), { source: 'portfolio-label' });
        };
        let lastSaved = input.value;
        const saveIfChanged = () => {
            if (input.value === lastSaved) return;
            lastSaved = input.value;
            save();
        };
        input.onchange = saveIfChanged;
        input.onblur = saveIfChanged;
        input.onkeydown = (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                saveIfChanged();
                input.blur();
            }
        };
    });

    container.querySelectorAll('[data-portfolio-copy]').forEach((button) => {
        button.onclick = () => copyAddress(button.dataset.portfolioCopy, button);
    });

    container.querySelectorAll('[data-portfolio-remove]').forEach((button) => {
        button.onclick = () => {
            const address = button.dataset.portfolioRemove;
            const current = readSavedMyTezosEntries();
            const next = current.filter((entry) => entry.address !== address);
            writeSavedMyTezosEntries(next, { source: 'portfolio-remove' });
            if (localStorage.getItem(MY_TEZOS_ADDRESS_KEY) === address) {
                const replacement = next.find((entry) => entry.included !== false) || next[0];
                if (replacement) {
                    rememberMyTezosAddress(replacement.address, { label: replacement.label, source: 'portfolio-remove' });
                } else {
                    localStorage.removeItem(MY_TEZOS_ADDRESS_KEY);
                    window.dispatchEvent(new CustomEvent('my-baker-updated', {
                        detail: { address: null, source: 'portfolio-remove', previousAddress: address }
                    }));
                    document.getElementById('drawer-empty-state')?.style.removeProperty('display');
                    const connected = document.getElementById('drawer-connected');
                    if (connected) connected.style.display = 'none';
                }
            }
            schedulePortfolioCompositionRefresh('Account removed. Recalculating the remaining portfolio.');
        };
    });
}

function reconcilePortfolioComposition(message = 'Portfolio composition changed. Waiting for a complete current read.') {
    const entries = currentEntries();
    const composition = portfolioCompositionKey(includedEntries(entries));
    renderWalletList(entries);
    if (lastCompletePortfolio?.composition !== composition) {
        portfolioGeneration += 1;
        portfolioRefreshController?.abort();
        renderEmptySummary(message);
    }
    renderHistory();
    if (!isMyTezosVisible()) return Promise.resolve(null);
    return refreshMyTezosPortfolio({ force: true, allowHidden: !isPortfolioVisible() });
}

function schedulePortfolioCompositionRefresh(message) {
    if (portfolioCompositionRefreshQueued) return;
    portfolioCompositionRefreshQueued = true;
    queueMicrotask(() => {
        portfolioCompositionRefreshQueued = false;
        reconcilePortfolioComposition(message).catch(() => {});
    });
}

function historyPointsForRange(points, range, now = Date.now()) {
    const duration = range === '30d' ? 30 * 24 * 60 * 60 * 1000
        : range === '90d' ? 90 * 24 * 60 * 60 * 1000
            : range === '1y' ? 365 * 24 * 60 * 60 * 1000
                : Infinity;
    return duration === Infinity ? points : points.filter((point) => point.timestamp >= now - duration);
}

function chartLabel(timestamp, range) {
    const date = new Date(timestamp);
    if (range === 'all') return date.toLocaleDateString([], { month: 'short', year: 'numeric' });
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function historySourceLabel(point) {
    const sources = point?.sources?.length ? point.sources : [point?.source];
    return [...new Set(sources.filter(Boolean).map((source) => ({
        'tzkt-stepped-balance-history': 'TzKT stepped history',
        'tzkt-balance-history': 'TzKT point history',
        'octez-archive': 'Octez archive',
        'tzkt-rpc-archive': 'TzKT archive RPC',
        'pre-creation-zero': 'account lifecycle',
        'mixed-exact-sources': 'mixed exact sources'
    }[source] || source)))].join(' + ') || 'exact source pending';
}

function selectedHistory() {
    const scope = readMyTezosScope();
    if (scope === MY_TEZOS_SCOPE_ALL) {
        return {
            points: exactHistoryState.aggregate || [],
            coverage: exactHistoryState.aggregateCoverage || {}
        };
    }
    return {
        points: exactHistoryState.seriesByAddress?.[scope] || [],
        coverage: exactHistoryState.coverageByAddress?.[scope] || {}
    };
}

function renderHistoryStatus(points, coverage) {
    const status = document.getElementById('portfolio-history-status');
    if (!status) return;
    const completed = Number(coverage?.completed) || 0;
    const target = Number(coverage?.target) || 0;
    const earliest = points[0]?.timestamp
        ? new Date(points[0].timestamp).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })
        : 'pending';
    const latestLevel = points.at(-1)?.level || coverage?.latestLevel;
    const sources = [...new Set(points.flatMap((point) => historySourceLabel(point).split(' + ')))].join(' + ');
    const stage = exactHistoryState.sourceStatus?.stage || 'cached';
    status.textContent = target
        ? `${completed}/${target} exact points · earliest ${earliest} · daily latest year, weekly earlier${latestLevel ? ` · block ${Number(latestLevel).toLocaleString()}` : ''}${sources ? ` · ${sources}` : ''}`
        : 'Preparing the exact one-year schedule…';
    status.dataset.state = !target
        ? 'empty'
        : coverage?.complete
        ? 'complete'
        : stage === 'daily' || stage === 'lifetime'
            ? 'loading'
            : completed > 0
                ? 'partial'
                : 'empty';
}

function showHistoryChartFailure(empty) {
    empty.hidden = false;
    if (empty.querySelector('[data-chart-retry]')) return;
    const retryButton = document.createElement('button');
    retryButton.type = 'button';
    retryButton.className = 'glass-button';
    retryButton.dataset.chartRetry = '';
    retryButton.textContent = 'Chart unavailable · Retry';
    retryButton.onclick = () => renderHistory({ retry: true });
    empty.replaceChildren(retryButton);
}

async function renderHistory({ retry = false } = {}) {
    const intent = ++historyRenderIntent;
    if (retry) historyChartFailed = false;
    const canvas = document.getElementById('portfolio-history-chart');
    const empty = document.getElementById('portfolio-history-empty');
    if (!canvas || !empty) return;
    const selected = selectedHistory();
    const points = historyPointsForRange(selected.points, portfolioRange);
    renderHistoryStatus(selected.points, selected.coverage);

    if (points.length < 2) {
        canvas.hidden = true;
        empty.hidden = false;
        const first = points[0];
        empty.textContent = first
            ? `Exact history begins ${new Date(first.timestamp).toLocaleString()}. Another point is needed to draw this range.`
            : selected.coverage?.target
                ? 'Loading missing exact points. Saved points remain on this device and resume when My Tezos is visible.'
                : 'Building the exact daily one-year schedule…';
        if (portfolioChart) {
            portfolioChart.data.labels = [];
            portfolioChart.data.datasets[0].data = [];
            portfolioChart.$exactHistoryPoints = [];
            portfolioChart.update('none');
        }
        return;
    }

    if (!isPortfolioVisible()) return;
    if (historyChartFailed) {
        showHistoryChartFailure(empty);
        return;
    }
    const isCurrent = () => intent === historyRenderIntent && canvas.isConnected && isPortfolioVisible();
    if (!portfolioChart) {
        canvas.hidden = true;
        empty.hidden = false;
        empty.textContent = 'Loading chart…';
    }
    try {
        await ensureChartLibraries();
    } catch (error) {
        // Data can arrive while the shared script is loading. Its failure is
        // still real even if that older chart render has been superseded.
        historyChartFailed = true;
        if (isCurrent()) showHistoryChartFailure(empty);
        return;
    }
    if (!isCurrent()) return;

    canvas.hidden = false;
    empty.hidden = true;
    const labels = points.map((point) => chartLabel(point.timestamp, portfolioRange));
    const datasets = [{
        label: 'Total XTZ',
        data: points.map((point) => point.totalMutez / 1e6),
        borderColor: '#4dd4ff',
        backgroundColor: '#4dd4ff18',
        borderWidth: 2.5,
        pointRadius: points.length > 48 ? 0 : 2,
        pointHoverRadius: 3,
        tension: 0.2,
        fill: false,
        spanGaps: false
    }];

    if (portfolioChart) {
        portfolioChart.data.labels = labels;
        portfolioChart.data.datasets = datasets;
        portfolioChart.$exactHistoryPoints = points;
        portfolioChart.update('none');
        return;
    }

    portfolioChart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    align: 'start',
                    labels: {
                        color: getComputedStyle(document.body).getPropertyValue('--text-secondary') || '#9aa5b1',
                        boxWidth: 10,
                        boxHeight: 3,
                        padding: 16,
                        usePointStyle: true,
                        pointStyle: 'line'
                    }
                },
                tooltip: {
                    callbacks: {
                        label: (context) => `${context.dataset.label}: ${Number(context.raw).toLocaleString('en-US', { maximumFractionDigits: 2 })} ꜩ`,
                        afterLabel: (context) => {
                            const point = context.chart.$exactHistoryPoints?.[context.dataIndex];
                            if (!point) return [];
                            return [
                                `Block ${Number(point.level).toLocaleString()}`,
                                `${point.cadence === 'daily' ? 'Daily' : 'Weekly'} sample · ${historySourceLabel(point)}`
                            ];
                        }
                    }
                }
            },
            scales: {
                x: { ticks: { color: '#7e8998', maxTicksLimit: 8 }, grid: { display: false } },
                y: {
                    beginAtZero: false,
                    ticks: { color: '#7e8998', callback: (value) => `${Number(value).toLocaleString('en-US', { notation: 'compact' })}ꜩ` },
                    grid: { color: 'rgba(127,140,160,0.12)' }
                }
            }
        }
    });
    portfolioChart.$exactHistoryPoints = points;
}

async function fetchPortfolioAccounts(entries, signal) {
    const result = await fetchMyTezosAccounts(entries, { priority: 'interactive', signal });
    return entries.map((entry, index) => portfolioRowFromAccount(entry, result.rows[index]));
}

function setFreshness(message, state = '') {
    const freshness = document.getElementById('portfolio-freshness');
    if (!freshness) return;
    freshness.textContent = message;
    freshness.dataset.state = state;
}

function setPortfolioRefreshState(loading, count = includedEntries().length) {
    const button = document.getElementById('portfolio-refresh');
    if (!button) return;
    const label = button.querySelector('[data-portfolio-refresh-label]');
    button.disabled = loading;
    button.dataset.state = loading ? 'loading' : 'idle';
    button.setAttribute('aria-busy', String(loading));
    if (label) {
        label.textContent = loading
            ? `Updating ${count} wallet${count === 1 ? '' : 's'}…`
            : 'Update portfolio';
    } else {
        button.textContent = loading ? 'Updating portfolio…' : 'Update portfolio';
    }
}

export async function refreshMyTezosPortfolio({ force = false, allowHidden = false } = {}) {
    if (allowHidden ? !isMyTezosVisible() : !isPortfolioVisible()) return null;
    if (portfolioRefreshInFlight && !force) return portfolioRefreshInFlight;
    if (portfolioRefreshInFlight && force) portfolioRefreshController?.abort();

    const entries = currentEntries();
    renderWalletList(entries);
    const included = includedEntries(entries);
    const composition = portfolioCompositionKey(included);
    if (!included.length) {
        lastCompletePortfolio = null;
        renderEmptySummary();
        renderHistory();
        setFreshness('No addresses are currently included.', 'empty');
        return null;
    }
    if (lastCompletePortfolio?.composition !== composition) {
        renderEmptySummary('Portfolio composition changed. Waiting for a complete current read.');
    }

    const refreshButton = document.getElementById('portfolio-refresh');
    setPortfolioRefreshState(true, included.length);
    setFreshness(`Checking ${included.length} included address${included.length === 1 ? '' : 'es'} through TzKT…`, 'loading');

    const requestGeneration = ++portfolioGeneration;
    const controller = new AbortController();
    portfolioRefreshController = controller;
    const pending = (async () => {
        try {
            const [rows, prices] = await Promise.all([
                fetchPortfolioAccounts(included, controller.signal),
                fetchXTZPrice().catch(() => null)
            ]);
            if (requestGeneration !== portfolioGeneration || portfolioCompositionKey(includedEntries(currentEntries())) !== composition) return null;
            const totals = calculatePortfolioTotals(rows);
            const model = {
                composition,
                entries: included,
                rows,
                totals,
                prices,
                timestamp: Date.now()
            };
            lastCompletePortfolio = model;
            saveCompleteSnapshot(composition, totals, model.timestamp);
            setMyTezosMeta(`portfolio-last-good:${composition}`, model).catch(() => {});
            renderSummary(model);
            renderWalletList(currentEntries(), model);
            renderHistory();
            setFreshness(`Complete · ${included.length}/${included.length} included addresses · ${formatFreshnessStamp(new Date(model.timestamp), { source: 'Portfolio' })}`, 'complete');
            return model;
        } catch (error) {
            if (error?.name === 'AbortError' || requestGeneration !== portfolioGeneration) return null;
            const sameComposition = lastCompletePortfolio?.composition === composition;
            if (sameComposition) {
                renderSummary(lastCompletePortfolio);
                renderWalletList(currentEntries(), lastCompletePortfolio);
                renderHistory();
            } else {
                renderEmptySummary('Current portfolio unavailable. No partial total is shown.');
            }
            setFreshness(`${error.message || 'Portfolio refresh failed'} · ${sameComposition ? 'showing last complete read' : 'try again'}`, 'error');
            return null;
        } finally {
            if (portfolioRefreshInFlight === pending) {
                portfolioRefreshInFlight = null;
                portfolioRefreshController = null;
                if (refreshButton) setPortfolioRefreshState(false);
            }
        }
    })();
    portfolioRefreshInFlight = pending;
    return pending;
}

async function addPortfolioAddress(rawAddress, rawLabel) {
    const raw = String(rawAddress || '').trim();
    let address = raw;
    let label = String(rawLabel || '').trim().slice(0, 80) || null;
    if (isTezDomainName(raw)) {
        const domain = normalizeTezDomainName(raw);
        setManagementStatus(`Resolving ${domain}…`, 'loading');
        address = await resolveTezDomainAddress(domain);
        if (!address) throw new Error(`${domain} did not resolve to a Tezos address.`);
        if (!label) label = domain;
    }
    if (!isTezosAddress(address)) throw new Error('Enter a valid tz1/tz2/tz3/tz4/KT1 address or .tez name.');
    const current = readSavedMyTezosEntries();
    const existed = current.some((entry) => entry.address === address);
    if (!existed && current.length >= MAX_SAVED_MY_TEZOS_ADDRESSES) {
        throw new Error(`My Tezos can keep up to ${MAX_SAVED_MY_TEZOS_ADDRESSES} local addresses.`);
    }
    upsertSavedMyTezosEntry(address, { label, included: true, source: 'portfolio-add' });
    if (!localStorage.getItem(MY_TEZOS_ADDRESS_KEY)) {
        rememberMyTezosAddress(address, { label, source: 'portfolio-add' });
    }
    return { address, label, existed };
}

async function exportPortfolio() {
    const entries = readSavedMyTezosEntries();
    if (!entries.length) {
        setManagementStatus('Add an address before exporting.', 'error');
        return;
    }
    let observedSnapshots = [];
    try {
        await initMyTezosDb();
        observedSnapshots = (await getAllMyTezosRecords('snapshots'))
            .filter((point) => point.sourceType === 'observed')
            .map(({ id, sourceType, confidence, ...point }) => point)
            .slice(-25_000);
    } catch {}
    let linkedL2Accounts = [];
    try {
        linkedL2Accounts = normalizeLinkedL2Accounts(JSON.parse(localStorage.getItem(LINKED_ETHERLINK_ACCOUNTS_KEY) || '[]'));
    } catch {}
    const payload = {
        schema: MY_TEZOS_PORTFOLIO_SCHEMA,
        exportedAt: new Date().toISOString(),
        entries: entries.map(({ network, address, label, included, addedAt }) => ({ network, address, label, included, addedAt })),
        linkedL2Accounts,
        observedSnapshots,
        seenWatermarks: {
            memoryLastSeen: Number(localStorage.getItem('tezos-systems-my-tezos-memory-last-seen-v1')) || null
        }
    };
    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `tezos-systems-portfolio-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setManagementStatus(`Exported ${entries.length} L1 address${entries.length === 1 ? '' : 'es'}, ${linkedL2Accounts.length} device-local L2 link${linkedL2Accounts.length === 1 ? '' : 's'}, and ${observedSnapshots.length} observed snapshot${observedSnapshots.length === 1 ? '' : 's'}.`, 'success');
}

async function importPortfolioFile(file) {
    if (!file) return;
    const payload = JSON.parse(await file.text());
    const parsed = parsePortfolioImport(payload);
    const current = readSavedMyTezosEntries();
    const conflicts = parsed.entries.filter((incoming) => current.some((entry) => entry.address === incoming.address)).length;
    const available = Math.max(0, MAX_SAVED_MY_TEZOS_ADDRESSES - current.length + conflicts);
    const newCount = parsed.entries.length - conflicts;
    const acceptedNew = Math.min(newCount, available);
    const description = [
        `${parsed.entries.length} valid address${parsed.entries.length === 1 ? '' : 'es'}`,
        conflicts ? `${conflicts} update${conflicts === 1 ? '' : 's'}` : '',
        parsed.skipped ? `${parsed.skipped} invalid or extra skipped` : '',
        newCount > acceptedNew ? `${newCount - acceptedNew} over the local limit skipped` : ''
    ].filter(Boolean).join(' · ');
    const extraDescription = [
        parsed.linkedL2Accounts.length ? `${parsed.linkedL2Accounts.length} device-local Etherlink link${parsed.linkedL2Accounts.length === 1 ? '' : 's'}` : '',
        parsed.observedSnapshots.length ? `${parsed.observedSnapshots.length} observed snapshot${parsed.observedSnapshots.length === 1 ? '' : 's'}` : ''
    ].filter(Boolean).join(' · ');
    if (!window.confirm(`Import this My Tezos file?\n\n${description}${extraDescription ? ` · ${extraDescription}` : ''}\n\nThe complete file is validated before this browser is updated.`)) {
        setManagementStatus('Import cancelled.', '');
        return;
    }
    const merged = normalizeSavedMyTezosEntries(mergePortfolioEntries(current, parsed.entries));
    const previousLinks = localStorage.getItem(LINKED_ETHERLINK_ACCOUNTS_KEY);
    const previousSeen = localStorage.getItem('tezos-systems-my-tezos-memory-last-seen-v1');
    try {
        localStorage.setItem(LINKED_ETHERLINK_ACCOUNTS_KEY, JSON.stringify(parsed.linkedL2Accounts));
        if (parsed.seenWatermarks.memoryLastSeen) {
            localStorage.setItem('tezos-systems-my-tezos-memory-last-seen-v1', String(parsed.seenWatermarks.memoryLastSeen));
        }
        writeSavedMyTezosEntries(merged, { source: 'portfolio-import' });
        if (parsed.observedSnapshots.length) {
            await initMyTezosDb();
            await putMyTezosRecords('snapshots', parsed.observedSnapshots.map((point) => ({
                ...point,
                id: `observed:${point.scopeId}:${point.timestamp}`
            })));
        }
        window.dispatchEvent(new CustomEvent('my-tezos-linked-l2-changed', {
            detail: { entries: parsed.linkedL2Accounts, source: 'portfolio-import' }
        }));
    } catch (error) {
        writeSavedMyTezosEntries(current, { source: 'portfolio-import-rollback' });
        if (previousLinks == null) localStorage.removeItem(LINKED_ETHERLINK_ACCOUNTS_KEY);
        else localStorage.setItem(LINKED_ETHERLINK_ACCOUNTS_KEY, previousLinks);
        if (previousSeen == null) localStorage.removeItem('tezos-systems-my-tezos-memory-last-seen-v1');
        else localStorage.setItem('tezos-systems-my-tezos-memory-last-seen-v1', previousSeen);
        throw error;
    }
    setManagementStatus(`Imported My Tezos · ${description}${extraDescription ? ` · ${extraDescription}` : ''}`, 'success');
}

function wirePortfolioControls() {
    const refresh = document.getElementById('portfolio-refresh');
    if (refresh) {
        refresh.onclick = () => refreshMyTezosPortfolio({ force: true });
        refresh.dataset.portfolioRefreshWired = 'true';
    }

    document.querySelectorAll('[data-portfolio-range]').forEach((button) => {
        button.onclick = () => {
            portfolioRange = button.dataset.portfolioRange;
            document.querySelectorAll('[data-portfolio-range]').forEach((candidate) => {
                const active = candidate === button;
                candidate.classList.toggle('active', active);
                candidate.setAttribute('aria-pressed', String(active));
            });
            renderHistory();
        };
    });

    const form = document.getElementById('portfolio-add-form');
    if (form) form.onsubmit = async (event) => {
        event.preventDefault();
        const addressInput = document.getElementById('portfolio-add-address');
        const labelInput = document.getElementById('portfolio-add-label');
        const submit = form.querySelector('button[type="submit"]');
        if (submit) submit.disabled = true;
        try {
            const added = await addPortfolioAddress(addressInput?.value, labelInput?.value);
            if (addressInput) addressInput.value = '';
            if (labelInput) labelInput.value = '';
            setManagementStatus(
                added.existed
                    ? `${added.label || shortAddress(added.address)} is already saved on this device.`
                    : `Added ${added.label || shortAddress(added.address)} to this browser.`,
                'success'
            );
        } catch (error) {
            setManagementStatus(error.message || 'Could not add that address.', 'error');
        } finally {
            if (submit) submit.disabled = false;
        }
    };

    const exportButton = document.getElementById('portfolio-export');
    if (exportButton) exportButton.onclick = () => exportPortfolio().catch((error) => {
        setManagementStatus(error.message || 'Could not export My Tezos.', 'error');
    });
    const importButton = document.getElementById('portfolio-import');
    const importFile = document.getElementById('portfolio-import-file');
    if (importButton && importFile) {
        importButton.onclick = () => importFile.click();
        importFile.onchange = async () => {
            try {
                await importPortfolioFile(importFile.files?.[0]);
            } catch (error) {
                setManagementStatus(error.message || 'Could not import that portfolio.', 'error');
            } finally {
                importFile.value = '';
            }
        };
    }
}

export async function activateMyTezosPortfolio({ force = false } = {}) {
    // Reset only at the start of user activation. History receipts can arrive
    // while the saved portfolio is loading; do not retry their failed script
    // again when that unrelated read finishes.
    historyChartFailed = false;
    // Rebind idempotently on activation so route/view rehydration cannot leave
    // a visible Portfolio control pointing at an earlier element instance.
    wirePortfolioControls();
    const entries = currentEntries();
    renderWalletList(entries);
    const composition = portfolioCompositionKey(includedEntries(entries));
    if (lastCompletePortfolio?.composition !== composition) {
        try {
            const persisted = await getMyTezosMeta(`portfolio-last-good:${composition}`);
            if (persisted?.composition === composition) lastCompletePortfolio = persisted;
        } catch {}
    }
    if (lastCompletePortfolio?.composition === composition) {
        renderSummary(lastCompletePortfolio);
    } else if (!includedEntries(entries).length) {
        renderEmptySummary();
    }
    renderHistory();
    activateMyTezosMemory().catch(() => {});
    return refreshMyTezosPortfolio({ force: force || !lastCompletePortfolio || lastCompletePortfolio.composition !== composition });
}

export function initMyTezosPortfolio() {
    if (portfolioInitialized) return;
    portfolioInitialized = true;
    readSavedMyTezosEntries(); // Normalize legacy saved entries in place.
    initMyTezosDb().catch(() => {});
    initMyTezosMemory();
    wirePortfolioControls();
    renderWalletList(currentEntries());
    renderHistory();

    window.addEventListener('my-tezos-portfolio-changed', () => {
        schedulePortfolioCompositionRefresh('Portfolio composition changed. Waiting for a complete current read.');
    });
    window.addEventListener('my-tezos-scope-changed', () => {
        if (lastCompletePortfolio?.composition === portfolioCompositionKey(includedEntries())) {
            renderSummary(lastCompletePortfolio);
        } else {
            renderEmptySummary('Wallet scope changed. Waiting for a complete current read.');
        }
        renderHistory();
    });
    window.addEventListener('my-baker-updated', () => renderWalletList(currentEntries()));
    const drawer = document.getElementById('my-tezos-drawer');
    if (drawer) {
        new MutationObserver(() => {
            if (isPortfolioVisible()) refreshMyTezosPortfolio({ force: true }).catch(() => {});
        }).observe(drawer, { attributes: true, attributeFilter: ['class'] });
    }
    document.addEventListener('visibilitychange', () => {
        if (isPortfolioVisible()) refreshMyTezosPortfolio({ force: true }).catch(() => {});
    });
    window.addEventListener('my-tezos-memory-ready', (event) => {
        const expected = includedEntries().map((entry) => entry.address).sort().join('|');
        const received = (event.detail?.compositionAddresses || []).slice().sort().join('|');
        if (expected !== received) return;
        exactHistoryState = {
            seriesByAddress: event.detail?.seriesByAddress || {},
            aggregate: Array.isArray(event.detail?.aggregate) ? event.detail.aggregate : [],
            coverageByAddress: event.detail?.coverageByAddress || {},
            aggregateCoverage: event.detail?.aggregateCoverage || {
                completed: 0,
                target: 0,
                dailyCompleted: 0,
                dailyTarget: 0,
                complete: false
            },
            sourceStatus: event.detail?.sourceStatus || { stage: event.detail?.status || 'cached' }
        };
        renderHistory();
    });
}

export function destroyMyTezosPortfolioForTests() {
    if (portfolioChart) portfolioChart.destroy();
    portfolioChart = null;
    historyRenderIntent += 1;
    historyChartFailed = false;
    portfolioGeneration += 1;
    portfolioRefreshController?.abort();
    portfolioRefreshController = null;
    portfolioRefreshInFlight = null;
    portfolioRange = '1y';
    exactHistoryState = {
        seriesByAddress: {},
        aggregate: [],
        coverageByAddress: {},
        aggregateCoverage: {
            completed: 0,
            target: 0,
            dailyCompleted: 0,
            dailyTarget: 0,
            complete: false
        },
        sourceStatus: { stage: 'cached' }
    };
    portfolioInitialized = false;
}
