/**
 * Baker Leaderboard — sortable ranking of all active Tezos bakers
 * Shows stake, delegators, tz4 status, capacity usage
 */

import { API_URLS } from '../core/config.js';
import { formatNumber, escapeHtml } from '../core/utils.js';

const TZKT = API_URLS.tzkt;
const TOGGLE_KEY = 'tezos-systems-leaderboard-visible';
const SORT_KEY = 'tezos-systems-leaderboard-sort';
const CACHE_KEY = 'tezos-systems-leaderboard-cache';
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

let bakersData = [];
let currentSort = { col: 'stake', dir: 'desc' };

/**
 * Fetch all active bakers from TzKT
 */
async function fetchBakers() {
    // Check cache
    try {
        const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
        if (cached && Date.now() - cached.ts < CACHE_TTL) {
            return cached.data;
        }
    } catch { /* ignore */ }

    const limit = 500;
    let offset = 0;
    let all = [];

    // Fetch active bakers with staking balance > 0
    while (true) {
        const resp = await fetch(
            `${TZKT}/delegates?active=true&stakingBalance.gt=0&select=address,alias,stakingBalance,externalStakedBalance,externalDelegatedBalance,numDelegators,stakersCount,stakedBalance,balance,software&sort.desc=id&limit=${limit}&offset=${offset}`
        );
        if (!resp.ok) throw new Error('Failed to fetch bakers');
        const batch = await resp.json();
        all = all.concat(batch);
        if (batch.length < limit) break;
        offset += limit;
    }

    // Cache it
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: all }));
    } catch { /* quota */ }

    return all;
}

/**
 * Fetch consensus key map: baker address → latest consensus key hash
 */
async function fetchConsensusKeys(bakerAddresses) {
    const map = {};
    try {
        const resp = await fetch(
            `${TZKT}/operations/update_consensus_key?limit=10000&sort.desc=id&select=sender,publicKeyHash`
        );
        if (!resp.ok) return map;
        const ops = await resp.json();
        const addrSet = new Set(bakerAddresses);
        for (const op of ops) {
            const baker = op.sender?.address;
            const keyHash = op.publicKeyHash || '';
            if (baker && !map[baker] && addrSet.has(baker)) {
                map[baker] = keyHash;
            }
        }
    } catch { /* fail silently */ }
    return map;
}

/**
 * Determine if baker has tz4 consensus key
 */
function isTz4(addr, consensusKeys) {
    if (addr && addr.startsWith('tz4')) return true;
    return consensusKeys[addr]?.startsWith('tz4') || false;
}

/**
 * Format XTZ amount (compact)
 */
function fmtXTZ(mutez) {
    const xtz = (mutez || 0) / 1e6;
    if (xtz >= 1e6) return (xtz / 1e6).toFixed(2) + 'M';
    if (xtz >= 1e3) return (xtz / 1e3).toFixed(1) + 'K';
    return xtz.toFixed(0);
}

/**
 * Compute derived fields for sorting
 */
function enrichBaker(b, consensusKeys) {
    const stake = (b.stakingBalance || 0) / 1e6;
    const ownStake = (b.stakedBalance || 0) / 1e6;
    const extStaked = (b.externalStakedBalance || 0) / 1e6;
    const extDelegated = (b.externalDelegatedBalance || 0) / 1e6;
    const delegators = b.numDelegators || 0;
    const stakers = b.stakersCount || 0;
    const maxDelegation = ownStake * 9;
    const delegationUsage = maxDelegation > 0 ? (extDelegated / maxDelegation) * 100 : 0;

    return {
        ...b,
        stake,
        ownStake,
        extStaked,
        extDelegated,
        delegators,
        stakers,
        tz4: isTz4(b.address, consensusKeys),
        delegationUsage: Math.min(delegationUsage, 100),
        name: b.alias || (b.address.slice(0, 8) + '…'),
    };
}

/**
 * Sort bakers by column
 */
function sortBakers(bakers, col, dir) {
    const mult = dir === 'desc' ? -1 : 1;
    return [...bakers].sort((a, b) => {
        let va, vb;
        switch (col) {
            case 'stake': va = a.stake; vb = b.stake; break;
            case 'delegators': va = a.delegators; vb = b.delegators; break;
            case 'stakers': va = a.stakers; vb = b.stakers; break;
            case 'capacity': va = a.delegationUsage; vb = b.delegationUsage; break;
            case 'tz4': va = a.tz4 ? 1 : 0; vb = b.tz4 ? 1 : 0; break;
            case 'name': return mult * a.name.localeCompare(b.name);
            default: va = a.stake; vb = b.stake;
        }
        return mult * (va - vb);
    });
}

/**
 * Render the leaderboard table
 */
function render(container) {
    const sorted = sortBakers(bakersData, currentSort.col, currentSort.dir);
    
    const arrow = (col) => {
        if (currentSort.col !== col) return '';
        return currentSort.dir === 'desc' ? ' ▾' : ' ▴';
    };

    const headerClass = (col) => currentSort.col === col ? 'lb-th active' : 'lb-th';

    let html = `
        <div class="leaderboard-table-wrap">
            <table class="leaderboard-table">
                <thead>
                    <tr>
                        <th class="lb-th lb-rank">#</th>
                        <th class="${headerClass('name')}" data-col="name">Baker${arrow('name')}</th>
                        <th class="${headerClass('stake')}" data-col="stake">Staking Power${arrow('stake')}</th>
                        <th class="${headerClass('delegators')}" data-col="delegators">Delegators${arrow('delegators')}</th>
                        <th class="${headerClass('stakers')}" data-col="stakers">Stakers${arrow('stakers')}</th>
                        <th class="${headerClass('capacity')}" data-col="capacity">Capacity${arrow('capacity')}</th>
                        <th class="${headerClass('tz4')}" data-col="tz4">tz4${arrow('tz4')}</th>
                    </tr>
                </thead>
                <tbody>
    `;

    sorted.forEach((b, i) => {
        const capacityClass = b.delegationUsage >= 90 ? 'cap-critical' : b.delegationUsage >= 70 ? 'cap-warning' : '';
        html += `
            <tr class="lb-row" data-address="${escapeHtml(b.address)}">
                <td class="lb-rank">${i + 1}</td>
                <td class="lb-name" title="${escapeHtml(b.address)}">${escapeHtml(b.name)}</td>
                <td class="lb-num">${fmtXTZ(b.stakingBalance)}</td>
                <td class="lb-num">${b.delegators}</td>
                <td class="lb-num">${b.stakers}</td>
                <td class="lb-num ${capacityClass}">${b.delegationUsage.toFixed(0)}%</td>
                <td class="lb-tz4">${b.tz4 ? '✅' : '—'}</td>
            </tr>
        `;
    });

    html += `</tbody></table></div>`;
    html += `<div class="leaderboard-footer">${sorted.length} active bakers</div>`;

    container.innerHTML = html;

    // Wire sort headers
    container.querySelectorAll('.lb-th[data-col]').forEach(th => {
        th.style.cursor = 'pointer';
        th.addEventListener('click', () => {
            const col = th.dataset.col;
            if (currentSort.col === col) {
                currentSort.dir = currentSort.dir === 'desc' ? 'asc' : 'desc';
            } else {
                currentSort.col = col;
                currentSort.dir = col === 'name' ? 'asc' : 'desc';
            }
            try { localStorage.setItem(SORT_KEY, JSON.stringify(currentSort)); } catch {}
            render(container);
        });
    });

    // Wire row clicks → populate My Baker
    container.querySelectorAll('.lb-row').forEach(row => {
        row.style.cursor = 'pointer';
        row.addEventListener('click', () => {
            const addr = row.dataset.address;
            if (!addr) return;
            // Populate My Baker input and trigger save
            const input = document.getElementById('my-baker-input');
            const saveBtn = document.getElementById('my-baker-save');
            const toggleBtn = document.getElementById('my-baker-toggle');
            const section = document.getElementById('my-baker-section');
            
            if (input) input.value = addr;
            if (saveBtn) saveBtn.click();
            
            // Open My Baker if closed
            if (section && !section.classList.contains('visible') && toggleBtn) {
                toggleBtn.click();
            }
            
            // Scroll to My Baker
            if (section) section.scrollIntoView({ behavior: 'smooth' });
        });
    });
}

/**
 * Load and render the leaderboard
 */
async function loadLeaderboard(container) {
    container.innerHTML = '<div class="leaderboard-loading">Loading bakers…</div>';
    
    try {
        const raw = await fetchBakers();
        const consensusKeys = await fetchConsensusKeys(raw.map(b => b.address));
        bakersData = raw.map(b => enrichBaker(b, consensusKeys));
        render(container);
    } catch (err) {
        container.innerHTML = '<div class="leaderboard-error">Failed to load baker data. Try again later.</div>';
        console.error('Leaderboard fetch error:', err);
    }
}

/**
 * Initialize leaderboard section
 */
export function initLeaderboard() {
    const section = document.getElementById('leaderboard-section');
    if (!section) return;

    const toggleBtn = document.getElementById('leaderboard-toggle');
    const container = document.getElementById('leaderboard-results');
    if (!toggleBtn || !container) return;

    // Restore sort preference
    try {
        const saved = JSON.parse(localStorage.getItem(SORT_KEY));
        if (saved?.col) currentSort = saved;
    } catch {}

    let loaded = false;

    function updateVis(isVisible) {
        section.classList.toggle('visible', isVisible);
        toggleBtn.classList.toggle('active', isVisible);
        toggleBtn.title = `Leaderboard: ${isVisible ? 'ON' : 'OFF'}`;
        
        // Lazy-load on first open
        if (isVisible && !loaded) {
            loaded = true;
            loadLeaderboard(container);
        }
    }

    toggleBtn.addEventListener('click', () => {
        const isVisible = localStorage.getItem(TOGGLE_KEY) === 'true';
        const newState = !isVisible;
        localStorage.setItem(TOGGLE_KEY, String(newState));
        updateVis(newState);
        if (newState) {
            const optContainer = document.getElementById('optional-sections');
            if (optContainer && section.parentElement === optContainer) {
                optContainer.prepend(section);
            }
        }
    });

    // Restore visibility
    const isVisible = localStorage.getItem(TOGGLE_KEY) === 'true';
    updateVis(isVisible);
}

/**
 * Refresh leaderboard data (called on main refresh)
 */
export function refreshLeaderboard() {
    const container = document.getElementById('leaderboard-results');
    if (!container || !bakersData.length) return;
    // Only refresh if section is visible
    const section = document.getElementById('leaderboard-section');
    if (section?.classList.contains('visible')) {
        loadLeaderboard(container);
    }
}
