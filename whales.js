/**
 * Whale Tracker - Live Large Transaction Feed
 * Shows notable XTZ movements with context
 */

import { escapeHtml } from './utils.js';
import { THRESHOLDS, API_URLS } from './config.js';

// Known address labels
const ADDRESS_LABELS = {
    // Exchanges
    'tz1hThMBD8jQjFt78heuCnKxJnJtQo9Ao25X': { name: 'Kraken', type: 'exchange', icon: '🏦' },
    'tz1aWXP237BLwNHJcCD4b3DutCevhqq2T1Z9': { name: 'Binance', type: 'exchange', icon: '🏦' },
    'tz1KzpjBnunNJVABHBnzfG4iuLmphitExwWK': { name: 'Gate.io', type: 'exchange', icon: '🏦' },
    'tz1YgNQBeLTgbwNH8sFv4gP5hKwkRqMvP9ma': { name: 'Coinbase', type: 'exchange', icon: '🏦' },
    'tz1VQnqCCqX4K5sP3FNkVSNKTdCAMJDd3E1n': { name: 'Huobi', type: 'exchange', icon: '🏦' },
    
    // Foundations & DAOs
    'tz1Wh75gwhhvZz3Fb1M65PXZ6T3VDvP3xV3v': { name: 'Tezos Foundation', type: 'foundation', icon: '🏛️' },
    'tz1VQd5L4M9zKbUmtZdW3qBvvxvYLbGnN5Nk': { name: 'TF Cold Wallet', type: 'foundation', icon: '🏛️' },
    
    // Notable bakers (top 10)
    'tz1WCd2jm4uSt4vntk4vSuUWoZQGhLcDuR9q': { name: 'Chorus One', type: 'baker', icon: '🍞' },
    'tz1Kf25fX1VdmYGSEzwFy1wNmkbSEZ2V83sY': { name: 'Everstake', type: 'baker', icon: '🍞' },
    'tz1irJKkXS2DBWkU1NnmFQx1c1L7pbGg4yhk': { name: 'Coinbase Baker', type: 'baker', icon: '🍞' },
    'tz1NortRftucvAkD1J58L32EhSVrQEWJCEnB': { name: 'P2P Validator', type: 'baker', icon: '🍞' },
    
    // Burn address
    'tz1burnburnburnburnburnburnburjAYjjX': { name: 'Burn Address', type: 'burn', icon: '🔥' },
};

// Configuration
const CONFIG = {
    minAmount: THRESHOLDS.whaleMinAmount,
    maxItems: 25,
    pollInterval: 20000, // 20 seconds (more activity at lower threshold)
    apiBase: API_URLS.tzkt
};

// State
let transactions = [];
let lastTimestamp = null;
let pollTimer = null;
let isVisible = true;
let isEnabled = false; // Off by default

const STORAGE_KEY = 'tezos-systems-whale-enabled';

/**
 * Format XTZ amount
 */
function formatAmount(mutez) {
    const xtz = mutez / 1e6;
    if (xtz >= 1000000) {
        return `${(xtz / 1000000).toFixed(2)}M`;
    } else if (xtz >= 1000) {
        return `${(xtz / 1000).toFixed(1)}K`;
    }
    return xtz.toLocaleString();
}

// Cache for resolved Tezos Domains names
const domainCache = new Map();

/**
 * Resolve address to Tezos Domains name via GraphQL
 */
async function resolveDomain(address) {
    if (!address) return null;
    if (domainCache.has(address)) return domainCache.get(address);
    
    try {
        const response = await fetch('https://api.tezos.domains/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: `query GetReverseDomain($address: String!) { reverseRecord(address: $address) { domain { name } } }`,
                variables: { address: address }
            })
        });
        
        if (!response.ok) return null;
        const data = await response.json();
        const name = data?.data?.reverseRecord?.domain?.name || null;
        domainCache.set(address, name);
        return name;
    } catch {
        return null;
    }
}

/**
 * Batch resolve multiple addresses
 */
async function batchResolveDomains(addresses) {
    const unresolved = addresses.filter(a => a && !domainCache.has(a));
    if (unresolved.length === 0) return;
    
    // Resolve in parallel (limit to 10 at a time)
    const batch = unresolved.slice(0, 10);
    await Promise.all(batch.map(resolveDomain));
}

/**
 * Get label for an address (with alias from API or domain resolution)
 */
function getAddressLabel(address, alias = null) {
    // Use TzKT alias if provided (includes Tezos Domains)
    if (alias) {
        // Check if it's a .tez domain
        if (alias.endsWith('.tez')) {
            return { name: alias, type: 'domain', icon: '🌐' };
        }
        return { name: alias, type: 'labeled', icon: '📛' };
    }
    
    // Check our static labels
    if (ADDRESS_LABELS[address]) {
        return ADDRESS_LABELS[address];
    }
    
    // Check domain cache
    const cachedDomain = domainCache.get(address);
    if (cachedDomain) {
        return { name: cachedDomain, type: 'domain', icon: '🌐' };
    }
    
    // Default: show shortened address
    return {
        name: `${address.slice(0, 8)}...${address.slice(-4)}`,
        type: 'unknown',
        icon: '👤'
    };
}

/**
 * Calculate time ago string
 */
function timeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

/**
 * Determine transaction type/context
 */
function getTransactionContext(tx) {
    const sender = ADDRESS_LABELS[tx.sender?.address];
    const target = ADDRESS_LABELS[tx.target?.address];
    
    // Staking operations
    if (tx.type === 'stake') {
        return { label: 'Staking', class: 'stake', emoji: '🔒' };
    }
    
    if (tx.type === 'unstake') {
        return { label: 'Unstaking', class: 'unstake', emoji: '🔓' };
    }
    
    // Delegation
    if (tx.type === 'delegation') {
        if (!tx.target) {
            return { label: 'Undelegation', class: 'undelegate', emoji: '🚪' };
        }
        return { label: 'Delegation', class: 'delegate', emoji: '🤝' };
    }
    
    // Exchange deposit
    if (target?.type === 'exchange') {
        return { label: 'Exchange Deposit', class: 'deposit', emoji: '📥' };
    }
    
    // Exchange withdrawal
    if (sender?.type === 'exchange') {
        return { label: 'Exchange Withdrawal', class: 'withdrawal', emoji: '📤' };
    }
    
    // Foundation movement
    if (sender?.type === 'foundation' || target?.type === 'foundation') {
        return { label: 'Foundation Move', class: 'foundation', emoji: '🏛️' };
    }
    
    // Baker related
    if (sender?.type === 'baker' || target?.type === 'baker') {
        return { label: 'Baker Transfer', class: 'baker', emoji: '🍞' };
    }
    
    // Burn
    if (target?.type === 'burn') {
        return { label: 'Token Burn', class: 'burn', emoji: '🔥' };
    }
    
    // Transfer between unknowns
    return { label: 'Transfer', class: 'whale', emoji: '🐬' };
}

/**
 * Fetch large transactions from TzKT
 */
async function fetchTransactions(since) {
    const params = new URLSearchParams({
        'amount.ge': CONFIG.minAmount,
        'sort.desc': 'id',
        'limit': 15,
        'status': 'applied'
    });
    if (since) params.set('timestamp.gt', since);
    
    const response = await fetch(`${CONFIG.apiBase}/operations/transactions?${params}`);
    if (!response.ok) throw new Error('API error');
    return response.json();
}

/**
 * Fetch large delegations from TzKT
 */
async function fetchDelegations(since) {
    const params = new URLSearchParams({
        'sort.desc': 'id',
        'limit': 30,
        'status': 'applied'
    });
    if (since) params.set('timestamp.gt', since);
    
    try {
        const response = await fetch(`${CONFIG.apiBase}/operations/delegations?${params}`);
        if (!response.ok) return [];
        const data = await response.json();
        
        // Filter client-side — TzKT's amount.ge doesn't reliably filter delegations
        return data
            .filter(d => (d.amount || 0) >= CONFIG.minAmount)
            .map(d => ({
                ...d,
                type: 'delegation',
                amount: d.amount || 0,
                target: d.newDelegate ? { address: d.newDelegate.address, alias: d.newDelegate.alias } : null
            }));
    } catch {
        return [];
    }
}

/**
 * Fetch staking operations from TzKT
 */
async function fetchStaking(since) {
    try {
        const params = new URLSearchParams({
            'sort.desc': 'id',
            'limit': 30,
            'status': 'applied'
        });
        if (since) params.set('timestamp.gt', since);
        
        // Fetch both stake and unstake
        const [stakeRes, unstakeRes] = await Promise.all([
            fetch(`${CONFIG.apiBase}/operations/staking?${params}&action=stake`).catch(() => ({ ok: false })),
            fetch(`${CONFIG.apiBase}/operations/staking?${params}&action=unstake`).catch(() => ({ ok: false }))
        ]);
        
        const stakes = stakeRes.ok ? await stakeRes.json() : [];
        const unstakes = unstakeRes.ok ? await unstakeRes.json() : [];
        
        // Normalize, tag, and filter client-side (TzKT amount.ge unreliable for staking)
        const all = [
            ...stakes.map(s => ({ ...s, type: 'stake' })),
            ...unstakes.map(s => ({ ...s, type: 'unstake' }))
        ];
        return all.filter(s => (s.amount || s.requestedAmount || 0) >= CONFIG.minAmount);
    } catch {
        return [];
    }
}

/**
 * Fetch all whale operations
 */
async function fetchWhaleTransactions() {
    try {
        const [txs, delegations, staking] = await Promise.all([
            fetchTransactions(lastTimestamp),
            fetchDelegations(lastTimestamp),
            fetchStaking(lastTimestamp)
        ]);
        
        // Combine and sort by timestamp
        const all = [...txs, ...delegations, ...staking];
        all.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        return all.slice(0, 25);
    } catch (error) {
        console.error('Whale tracker fetch error:', error);
        return [];
    }
}

/**
 * Create transaction element
 */
function createTransactionElement(tx) {
    // Use alias from TzKT response if available
    const sender = getAddressLabel(tx.sender?.address, tx.sender?.alias);
    const context = getTransactionContext(tx);
    const amount = formatAmount(tx.amount);
    
    const el = document.createElement('div');
    el.className = `whale-tx whale-tx-${context.class}`;
    el.dataset.hash = tx.hash;
    
    // Build flow text based on operation type
    let flowHtml;
    if (tx.type === 'delegation') {
        if (tx.target || tx.newDelegate) {
            const delegateAddr = tx.target?.address || tx.newDelegate?.address;
            const delegateAlias = tx.target?.alias || tx.newDelegate?.alias;
            const baker = getAddressLabel(delegateAddr, delegateAlias);
            flowHtml = `
                <span class="whale-tx-addr" title="${escapeHtml(tx.sender?.address)}">${escapeHtml(sender.icon)} ${escapeHtml(sender.name)}</span>
                <span class="whale-tx-arrow">→</span>
                <span class="whale-tx-addr" title="${escapeHtml(delegateAddr)}">${escapeHtml(baker.icon)} ${escapeHtml(baker.name)}</span>
            `;
        } else {
            flowHtml = `
                <span class="whale-tx-addr" title="${escapeHtml(tx.sender?.address)}">${escapeHtml(sender.icon)} ${escapeHtml(sender.name)}</span>
                <span class="whale-tx-arrow">→</span>
                <span class="whale-tx-addr">None</span>
            `;
        }
    } else if (tx.type === 'stake' || tx.type === 'unstake') {
        const baker = tx.baker ? getAddressLabel(tx.baker.address, tx.baker.alias) : null;
        flowHtml = `
            <span class="whale-tx-addr" title="${escapeHtml(tx.sender?.address)}">${escapeHtml(sender.icon)} ${escapeHtml(sender.name)}</span>
            ${baker ? `<span class="whale-tx-arrow">↔</span><span class="whale-tx-addr" title="${escapeHtml(tx.baker.address)}">${escapeHtml(baker.icon)} ${escapeHtml(baker.name)}</span>` : ''}
        `;
    } else {
        const target = getAddressLabel(tx.target?.address, tx.target?.alias);
        flowHtml = `
            <span class="whale-tx-addr" title="${escapeHtml(tx.sender?.address)}">${escapeHtml(sender.icon)} ${escapeHtml(sender.name)}</span>
            <span class="whale-tx-arrow">→</span>
            <span class="whale-tx-addr" title="${escapeHtml(tx.target?.address)}">${escapeHtml(target.icon)} ${escapeHtml(target.name)}</span>
        `;
    }
    
    el.innerHTML = `
        <div class="whale-tx-header">
            <span class="whale-tx-context">${escapeHtml(context.emoji)} ${escapeHtml(context.label)}</span>
            <span class="whale-tx-time">${escapeHtml(timeAgo(tx.timestamp))}</span>
        </div>
        <div class="whale-tx-amount">${escapeHtml(amount)} <span class="xtz">ꜩ</span></div>
        <div class="whale-tx-flow">${flowHtml}</div>
    `;
    
    // Click to open in TzKT
    el.addEventListener('click', () => {
        window.open(`https://tzkt.io/${tx.hash}`, '_blank');
    });
    
    return el;
}

/**
 * Collect addresses needing domain resolution
 */
function collectUnresolvedAddresses(txs) {
    const addresses = new Set();
    txs.forEach(tx => {
        // Only resolve if no alias from TzKT
        if (tx.sender?.address && !tx.sender?.alias) addresses.add(tx.sender.address);
        if (tx.target?.address && !tx.target?.alias) addresses.add(tx.target.address);
        if (tx.baker?.address && !tx.baker?.alias) addresses.add(tx.baker.address);
        if (tx.newDelegate?.address && !tx.newDelegate?.alias) addresses.add(tx.newDelegate.address);
    });
    return Array.from(addresses);
}

/**
 * Update the whale feed UI
 */
function updateFeed(newTxs) {
    const container = document.getElementById('whale-feed');
    if (!container) return;
    
    // Background resolve domains for addresses without aliases
    const unresolvedAddresses = collectUnresolvedAddresses(newTxs);
    if (unresolvedAddresses.length > 0) {
        batchResolveDomains(unresolvedAddresses).then(() => {
            // Re-render cards that might have new domain names
            refreshDisplayedNames();
        });
    }
    
    // Add new transactions to the top
    newTxs.forEach(tx => {
        // Skip if already in list
        if (transactions.find(t => t.hash === tx.hash)) return;
        
        transactions.unshift(tx);
        const el = createTransactionElement(tx);
        el.classList.add('whale-tx-new');
        
        if (container.firstChild) {
            container.insertBefore(el, container.firstChild);
        } else {
            container.appendChild(el);
        }
        
        // Remove animation class after animation
        setTimeout(() => el.classList.remove('whale-tx-new'), 500);
    });
    
    // Trim old transactions
    while (transactions.length > CONFIG.maxItems) {
        transactions.pop();
        if (container.lastChild) {
            container.lastChild.classList.add('whale-tx-exit');
            setTimeout(() => container.lastChild?.remove(), 300);
        }
    }
    
    // Update last timestamp
    if (newTxs.length > 0) {
        lastTimestamp = newTxs[0].timestamp;
    }
    
    // Update empty state
    const emptyState = document.getElementById('whale-empty');
    if (emptyState) {
        emptyState.style.display = transactions.length === 0 ? 'block' : 'none';
    }
}

/**
 * Refresh displayed names after domain resolution
 */
function refreshDisplayedNames() {
    const container = document.getElementById('whale-feed');
    if (!container) return;
    
    // Re-render all transaction cards
    container.innerHTML = '';
    transactions.forEach(tx => {
        container.appendChild(createTransactionElement(tx));
    });
}

/**
 * Initial load of transactions
 */
async function loadInitialTransactions() {
    const container = document.getElementById('whale-feed');
    if (!container) return;
    
    // Show loading state
    container.innerHTML = '<div class="whale-loading">Scanning for whales...</div>';
    
    const txs = await fetchWhaleTransactions();
    container.innerHTML = '';
    
    if (txs.length === 0) {
        container.innerHTML = `
            <div id="whale-empty" class="whale-empty">
                <span class="whale-empty-icon">🐬</span>
                <span>No activity detected recently</span>
                <span class="whale-empty-sub">Watching transfers, stakes & delegations > 1,000 ꜩ</span>
            </div>
        `;
        return;
    }
    
    // Add transactions
    txs.reverse().forEach(tx => {
        transactions.unshift(tx);
        container.insertBefore(createTransactionElement(tx), container.firstChild);
    });
    
    if (txs.length > 0) {
        lastTimestamp = txs[txs.length - 1].timestamp;
    }
}

/**
 * Poll for new transactions
 */
async function pollForUpdates() {
    if (!isVisible) return;
    
    const newTxs = await fetchWhaleTransactions();
    if (newTxs.length > 0) {
        updateFeed(newTxs.reverse());
    }
}

/**
 * Start polling
 */
function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(pollForUpdates, CONFIG.pollInterval);
}

/**
 * Stop polling
 */
function stopPolling() {
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
}

/**
 * Handle visibility change
 */
function handleVisibilityChange() {
    if (document.hidden) {
        isVisible = false;
        stopPolling();
    } else {
        isVisible = true;
        if (isEnabled) {
            pollForUpdates();
            startPolling();
        }
    }
}

/**
 * Toggle whale tracker visibility
 */
export function toggleWhaleTracker() {
    isEnabled = !isEnabled;
    localStorage.setItem(STORAGE_KEY, isEnabled ? 'true' : 'false');
    updateWhaleVisibility();
    
    if (isEnabled && transactions.length === 0) {
        loadInitialTransactions();
    }
    
    return isEnabled;
}

/**
 * Update UI based on enabled state
 */
function updateWhaleVisibility() {
    const section = document.getElementById('whale-section');
    const toggleBtn = document.getElementById('whale-toggle');
    
    if (section) {
        section.classList.toggle('visible', isEnabled);
    }
    
    if (toggleBtn) {
        toggleBtn.classList.toggle('active', isEnabled);
        toggleBtn.title = `Mini Whale: ${isEnabled ? 'ON' : 'OFF'}`;
    }
    
    // Start/stop polling based on state
    if (isEnabled) {
        startPolling();
    } else {
        stopPolling();
    }
}

/**
 * Initialize whale tracker
 */
export async function initWhaleTracker() {
    const section = document.getElementById('whale-section');
    if (!section) {
        console.log('Whale section not found, skipping initialization');
        return;
    }
    
    console.log('Initializing Whale Tracker...');
    
    // Load saved preference (default: off)
    isEnabled = localStorage.getItem(STORAGE_KEY) === 'true';
    
    // Setup toggle button
    const toggleBtn = document.getElementById('whale-toggle');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', toggleWhaleTracker);
    }
    
    // Set initial visibility
    updateWhaleVisibility();
    
    // Only load data if enabled (delay to avoid TzKT rate limits on page load)
    if (isEnabled) {
        setTimeout(async () => {
            await loadInitialTransactions();
            startPolling();
        }, 3000);
    }
    
    // Handle tab visibility
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Expose for debugging
    window.whaleTracker = { transactions, refresh: pollForUpdates, toggle: toggleWhaleTracker };
}

export { fetchWhaleTransactions, ADDRESS_LABELS };
