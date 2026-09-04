/**
 * My Tezos wallet scope — one shared L1 scope for every drawer view.
 *
 * "All" is the default. A specific address is only selected after a direct
 * user choice and then becomes the active account for account-only surfaces.
 */

import { quietlySyncHtml } from '../core/quiet-refresh.js';
import { escapeHtml } from '../core/utils.js';
import {
    MY_TEZOS_ADDRESS_KEY,
    readSavedMyTezosEntries,
    rememberMyTezosAddress,
    shortAddress
} from '../core/wallet.js';

export const MY_TEZOS_SCOPE_ALL = 'all';
const SCOPE_SESSION_KEY = 'tezos-systems-my-tezos-wallet-scope-v1';

let initialized = false;
let latestPortfolioDetail = null;

function includedEntries(entries = readSavedMyTezosEntries()) {
    return entries.filter((entry) => entry.included !== false);
}

export function readMyTezosScope(entries = readSavedMyTezosEntries()) {
    const included = includedEntries(entries);
    let stored = MY_TEZOS_SCOPE_ALL;
    try {
        stored = sessionStorage.getItem(SCOPE_SESSION_KEY) || MY_TEZOS_SCOPE_ALL;
    } catch {}
    return stored === MY_TEZOS_SCOPE_ALL || included.some((entry) => entry.address === stored)
        ? stored
        : MY_TEZOS_SCOPE_ALL;
}

export function readScopedMyTezosEntries(entries = readSavedMyTezosEntries()) {
    const included = includedEntries(entries);
    const scope = readMyTezosScope(entries);
    return scope === MY_TEZOS_SCOPE_ALL
        ? included
        : included.filter((entry) => entry.address === scope);
}

export function myTezosScopeLabel(scope = readMyTezosScope(), entries = readSavedMyTezosEntries()) {
    const included = includedEntries(entries);
    if (scope === MY_TEZOS_SCOPE_ALL) return `All included wallets (${included.length})`;
    const entry = included.find((candidate) => candidate.address === scope);
    return entry?.label || (entry ? shortAddress(entry.address) : 'All included wallets');
}

function formatXtz(mutez) {
    const value = Number(mutez) / 1e6;
    if (!Number.isFinite(value)) return '—';
    return `${value.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })} ꜩ`;
}

function resetScopeTotals(count) {
    const values = {
        wallets: String(count),
        total: 'Updating…',
        spendable: '—',
        staked: '—'
    };
    Object.entries(values).forEach(([key, value]) => {
        const target = document.querySelector(`[data-my-tezos-scope-total="${key}"] strong`);
        if (target) target.textContent = value;
    });
    const freshness = document.getElementById('my-tezos-scope-freshness');
    if (freshness) freshness.textContent = count
        ? 'Downloading current public balances to this browser…'
        : 'Include a saved wallet to calculate totals.';
}

function renderScopeTotals(detail = latestPortfolioDetail) {
    const currentScope = readMyTezosScope();
    if (!detail || detail.scope !== currentScope) {
        resetScopeTotals(readScopedMyTezosEntries().length);
        return;
    }
    const values = {
        wallets: String(detail.count || 0),
        total: formatXtz(detail.totals?.total),
        spendable: formatXtz(detail.totals?.spendable),
        staked: formatXtz(detail.totals?.staked)
    };
    Object.entries(values).forEach(([key, value]) => {
        const target = document.querySelector(`[data-my-tezos-scope-total="${key}"] strong`);
        if (target) target.textContent = value;
    });
    const freshness = document.getElementById('my-tezos-scope-freshness');
    if (freshness) {
        freshness.textContent = detail.count
            ? `Complete current read · calculated locally from ${detail.count} wallet${detail.count === 1 ? '' : 's'}`
            : 'Include a saved wallet to calculate totals.';
    }
}

function renderAccountOnlyBoundaries(scope, entries) {
    const allWallets = scope === MY_TEZOS_SCOPE_ALL;
    const combinedWallets = allWallets && includedEntries(entries).length > 1;
    const activeAddress = localStorage.getItem(MY_TEZOS_ADDRESS_KEY) || '';
    const activeEntry = entries.find((entry) => entry.address === activeAddress);
    const activeLabel = activeEntry?.label || (activeAddress ? shortAddress(activeAddress) : 'the active wallet');
    const overviewBoundary = document.getElementById('my-tezos-overview-scope-boundary');
    if (overviewBoundary) overviewBoundary.hidden = !combinedWallets;
    const overviewCopy = document.getElementById('my-tezos-overview-scope-boundary-copy');
    if (overviewCopy) {
        overviewCopy.textContent = `Rewards and identity follow ${activeLabel}. Choose one wallet above to focus every panel.`;
    }
    const signalBoundary = document.getElementById('my-tezos-baker-signal-scope');
    if (signalBoundary) signalBoundary.hidden = !allWallets || includedEntries(entries).length < 2;
    const signalCopy = document.getElementById('my-tezos-baker-signal-scope-copy');
    if (signalCopy) signalCopy.textContent = `Showing the baker for ${activeLabel}. Choose a wallet above to inspect its baker.`;
    const storyBoundary = document.getElementById('my-tezos-story-scope-boundary');
    if (storyBoundary) storyBoundary.hidden = !combinedWallets;
    const storyContent = document.getElementById('my-tezos-story-content');
    if (storyContent) storyContent.hidden = combinedWallets;
    const storyAction = document.getElementById('my-tezos-story-active-wallet');
    if (storyAction) {
        storyAction.hidden = !includedEntries(entries).some((entry) => entry.address === activeAddress);
        storyAction.textContent = `Read ${activeLabel}’s story`;
    }
}

export function renderMyTezosScope() {
    const bar = document.getElementById('my-tezos-wallet-scope-bar');
    const select = document.getElementById('my-tezos-wallet-scope');
    if (!bar || !select) return;
    const entries = readSavedMyTezosEntries();
    const included = includedEntries(entries);
    const scope = readMyTezosScope(entries);
    if (scope === MY_TEZOS_SCOPE_ALL) {
        try { sessionStorage.setItem(SCOPE_SESSION_KEY, MY_TEZOS_SCOPE_ALL); } catch {}
    }
    bar.hidden = included.length === 0;
    const signature = included.map((entry) => `${entry.address}:${entry.label || ''}`).join('|');
    if (select.dataset.signature !== signature) {
        quietlySyncHtml(select, [
            `<option value="${MY_TEZOS_SCOPE_ALL}">All included wallets (${included.length})</option>`,
            ...included.map((entry) => (
                `<option value="${escapeHtml(entry.address)}">${escapeHtml(entry.label || shortAddress(entry.address))}</option>`
            ))
        ].join(''));
        select.dataset.signature = signature;
    }
    select.value = scope;
    const label = document.getElementById('my-tezos-scope-label');
    if (label) label.textContent = myTezosScopeLabel(scope, entries);
    const description = document.getElementById('my-tezos-scope-description');
    if (description) {
        description.textContent = scope === MY_TEZOS_SCOPE_ALL
            ? 'Totals combine included wallets; baker and identity facts follow the active wallet. Choose one wallet to focus every tab.'
            : 'Every tab is focused on this wallet until you switch back to all included wallets.';
    }
    document.getElementById('my-tezos-drawer')?.classList.toggle('is-all-wallet-scope', scope === MY_TEZOS_SCOPE_ALL);
    renderAccountOnlyBoundaries(scope, entries);
    renderScopeTotals();
}

export function setMyTezosScope(nextScope, { source = 'scope' } = {}) {
    const entries = readSavedMyTezosEntries();
    const included = includedEntries(entries);
    const scope = nextScope === MY_TEZOS_SCOPE_ALL || included.some((entry) => entry.address === nextScope)
        ? nextScope
        : MY_TEZOS_SCOPE_ALL;
    try { sessionStorage.setItem(SCOPE_SESSION_KEY, scope); } catch {}
    latestPortfolioDetail = null;
    if (scope !== MY_TEZOS_SCOPE_ALL) {
        const entry = included.find((candidate) => candidate.address === scope);
        const activeAddress = localStorage.getItem(MY_TEZOS_ADDRESS_KEY) || '';
        if (entry && activeAddress !== entry.address) {
            rememberMyTezosAddress(entry.address, {
                label: entry.label,
                source: 'my-tezos-scope'
            });
        }
    }
    renderMyTezosScope();
    window.dispatchEvent(new CustomEvent('my-tezos-scope-changed', {
        detail: {
            scope,
            entries: readScopedMyTezosEntries(entries),
            allEntries: included,
            label: myTezosScopeLabel(scope, entries),
            source
        }
    }));
    return scope;
}

export function initMyTezosScope() {
    if (initialized) return;
    initialized = true;
    document.getElementById('my-tezos-wallet-scope')?.addEventListener('change', (event) => {
        setMyTezosScope(event.currentTarget.value || MY_TEZOS_SCOPE_ALL, { source: 'control' });
    });
    document.getElementById('my-tezos-story-active-wallet')?.addEventListener('click', () => {
        const address = localStorage.getItem(MY_TEZOS_ADDRESS_KEY);
        if (address) {
            setMyTezosScope(address, { source: 'story' });
            document.getElementById('my-tezos-story-content')?.focus({ preventScroll: true });
        }
    });
    window.addEventListener('my-tezos-portfolio-changed', () => {
        const nextScope = readMyTezosScope();
        try { sessionStorage.setItem(SCOPE_SESSION_KEY, nextScope); } catch {}
        latestPortfolioDetail = null;
        renderMyTezosScope();
    });
    window.addEventListener('my-tezos-portfolio-ready', (event) => {
        if (!event.detail || event.detail.scope !== readMyTezosScope()) return;
        latestPortfolioDetail = event.detail;
        renderScopeTotals(event.detail);
    });
    window.addEventListener('my-tezos-drawer-opened', renderMyTezosScope);
    renderMyTezosScope();
}

export function resetMyTezosScopeForTests() {
    initialized = false;
    latestPortfolioDetail = null;
}
