/**
 * Baker Leaderboard — sortable ranking of all active Tezos bakers
 * Shows stake, delegators, tz4 status, capacity usage
 */

import { API_URLS } from '../core/config.js';
import { formatNumber, escapeHtml } from '../core/utils.js';
import { letterGrade, computeBakerScores } from './baker-report-card.js?v=20260324a';
import { loadHtml2Canvas, showShareModal } from '../ui/share.js';

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
 * Build a stat cell for the ranking card (inline-styled for html2canvas)
 */
function buildRankStatCell(label, value) {
    return `
        <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:8px;padding:10px 12px;text-align:center;">
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.35);margin-bottom:4px;">${label}</div>
            <div style="font-size:16px;font-weight:600;color:#fff;">${value}</div>
        </div>
    `;
}

/**
 * Build the ranking card DOM for a baker (inline-styled for html2canvas)
 */
function buildRankingCardDOM(baker, rank, total, scores) {
    const { grade, color } = letterGrade(scores.overall);
    const name = escapeHtml(baker.name);
    const addr = escapeHtml(baker.address.slice(0, 8) + '…' + baker.address.slice(-4));
    const topPct = Math.max(1, Math.ceil((rank / total) * 100));

    const card = document.createElement('div');
    card.style.cssText = `
        width: 680px; padding: 32px; background: #0a0e1a;
        border: 1px solid rgba(0,255,136,0.2); border-radius: 16px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        color: #e0e0e0; position: relative; overflow: hidden;
    `;

    card.innerHTML = `
        <div style="position:absolute;inset:0;background:linear-gradient(rgba(0,255,136,0.02) 1px,transparent 1px),linear-gradient(90deg,rgba(0,255,136,0.02) 1px,transparent 1px);background-size:20px 20px;pointer-events:none;"></div>

        <div style="position:relative;z-index:1;">
            <!-- Header -->
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;">
                <div>
                    <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;color:rgba(0,255,136,0.5);margin-bottom:4px;">Baker Ranking</div>
                    <div style="font-size:24px;font-weight:700;color:#fff;">${name}</div>
                    <div style="font-size:12px;color:rgba(255,255,255,0.4);font-family:monospace;margin-top:2px;">${addr}</div>
                </div>
                <div style="text-align:center;">
                    <div style="font-size:56px;font-weight:900;color:${color};line-height:1;text-shadow:0 0 20px ${color}40;">${grade}</div>
                    <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:4px;">${scores.overall}/100</div>
                </div>
            </div>

            <!-- Rank banner -->
            <div style="background:rgba(0,255,136,0.06);border:1px solid rgba(0,255,136,0.12);border-radius:8px;padding:10px 16px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;">
                <span style="font-size:13px;color:rgba(255,255,255,0.6);">Leaderboard Rank</span>
                <span style="font-size:18px;font-weight:700;color:#00ff88;">#${rank} <span style="font-size:12px;color:rgba(255,255,255,0.3);">of ${total}</span></span>
            </div>

            <!-- Stats grid -->
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px;">
                ${buildRankStatCell('Staking Power', fmtXTZ(baker.stakingBalance) + ' XTZ')}
                ${buildRankStatCell('Delegators', String(baker.delegators))}
                ${buildRankStatCell('Stakers', String(baker.stakers))}
                ${buildRankStatCell('Capacity', baker.delegationUsage.toFixed(0) + '%')}
                ${buildRankStatCell('tz4 Key', baker.tz4 ? '✅ Yes' : '— No')}
                ${buildRankStatCell('Rank Percentile', 'Top ' + topPct + '%')}
            </div>

            <!-- Footer -->
            <div style="display:flex;justify-content:space-between;align-items:center;padding-top:12px;border-top:1px solid rgba(255,255,255,0.06);">
                <span style="font-size:11px;color:rgba(255,255,255,0.25);">tezos.systems</span>
                <span style="font-size:11px;color:rgba(255,255,255,0.25);">${new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
            </div>
        </div>
    `;

    return card;
}

/**
 * Generate and show a shareable ranking card for a baker
 */
async function showBakerRankingCard(baker, rank, total, scores) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:9999;
        display:flex;align-items:center;justify-content:center;
        backdrop-filter:blur(4px);
    `;
    overlay.innerHTML = '<div style="color:#00ff88;font-size:16px;">Generating ranking card…</div>';
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);

    try {
        const card = buildRankingCardDOM(baker, rank, total, scores);
        card.style.position = 'fixed';
        card.style.left = '-9999px';
        document.body.appendChild(card);

        await loadHtml2Canvas();
        const canvas = await window.html2canvas(card, {
            backgroundColor: '#0a0e1a',
            scale: 2,
            useCORS: true,
        });

        card.remove();
        overlay.remove();

        const name = escapeHtml(baker.name);
        const statsLine = `${fmtXTZ(baker.stakingBalance)} XTZ | ${baker.delegators} delegators | ${baker.stakers} stakers`;
        const tweetOptions = [
            { label: '🍞 My Baker', text: `My baker ${name} is ranked #${rank} of ${total} on Tezos 🍞 Check yours at tezos.systems` },
            { label: '📊 Stats', text: `${name} — #${rank} baker on Tezos by staking power.\n${statsLine}\ntezos.systems` },
            { label: '❓ Challenge', text: `How does your Tezos baker rank? tezos.systems` },
        ];

        showShareModal(canvas, tweetOptions, `Baker Ranking: ${name}`);
    } catch (err) {
        overlay.innerHTML = `<div style="color:#ff4444;font-size:14px;text-align:center;padding:20px;">
            Failed to generate ranking card<br><span style="font-size:12px;color:rgba(255,255,255,0.4);">${err.message}</span>
        </div>`;
        setTimeout(() => overlay.remove(), 3000);
    }
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
                        <th class="${headerClass('stake')}" data-col="stake"><span class="full-title">Staking Power</span><span class="short-title">🍞 Power</span>${arrow('stake')}</th>
                        <th class="${headerClass('delegators')}" data-col="delegators">Delegators${arrow('delegators')}</th>
                        <th class="${headerClass('stakers')}" data-col="stakers">Stakers${arrow('stakers')}</th>
                        <th class="${headerClass('capacity')}" data-col="capacity">Capacity${arrow('capacity')}</th>
                        <th class="${headerClass('tz4')}" data-col="tz4">tz4${arrow('tz4')}</th>
                        <th class="lb-th lb-share-col"></th>
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
                <td class="lb-share-cell"><button class="lb-share-btn" title="Share ranking card">📸</button></td>
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

    // Wire share buttons → generate ranking card
    container.querySelectorAll('.lb-share-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const row = btn.closest('.lb-row');
            const addr = row?.dataset.address;
            if (!addr) return;
            const rank = parseInt(row.querySelector('.lb-rank')?.textContent, 10);
            const bakerData = sorted.find(b => b.address === addr);
            if (!bakerData || !rank) return;
            const scores = computeBakerScores(bakerData, null);
            showBakerRankingCard(bakerData, rank, sorted.length, scores);
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
            const drawer = document.getElementById('my-tezos-drawer');
            const scrim = document.getElementById('my-tezos-drawer-scrim');
            const emptyState = document.getElementById('drawer-empty-state');
            const connectedState = document.getElementById('drawer-connected');

            if (input) input.value = addr;
            if (saveBtn) saveBtn.click();

            // Open My Tezos drawer in connected state
            if (drawer && scrim) {
                drawer.classList.add('open');
                scrim.classList.add('open');
                document.body.style.overflow = 'hidden';
                if (emptyState) emptyState.style.display = 'none';
                if (connectedState) connectedState.style.display = '';
            }
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

/**
 * Open a baker profile modal by address (used for #baker=ADDRESS deep link)
 */
export async function openBakerProfile(address) {
    // Resolve .tez domains to tz addresses
    if (address.endsWith('.tez')) {
        try {
            const domainResp = await fetch('https://api.tezos.domains/graphql', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: `{ domain(name: "${address}") { address } }` }),
            });
            const domainData = await domainResp.json();
            const resolved = domainData?.data?.domain?.address;
            if (!resolved) throw new Error(`Domain "${address}" not found`);
            address = resolved;
        } catch (err) {
            // Show error immediately for domain resolution failures
            const overlay = document.createElement('div');
            overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);`;
            overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
            overlay.innerHTML = `
                <div style="background:#0a0e1a;border:1px solid rgba(255,68,68,0.3);border-radius:16px;padding:32px;max-width:400px;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
                    <div style="font-size:32px;margin-bottom:12px;">⚠️</div>
                    <div style="font-size:16px;font-weight:600;color:#ff4444;margin-bottom:8px;">Domain Not Found</div>
                    <div style="font-size:13px;color:rgba(255,255,255,0.5);margin-bottom:4px;">${escapeHtml(err.message)}</div>
                    <div style="margin-top:20px;">
                        <button onclick="this.closest('[style*=fixed]').remove()" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:8px;color:#fff;padding:8px 20px;cursor:pointer;font-size:13px;">Close</button>
                    </div>
                </div>`;
            document.body.appendChild(overlay);
            setTimeout(() => overlay.remove(), 8000);
            return;
        }
    }

    // Show loading overlay immediately
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:9999;
        display:flex;align-items:center;justify-content:center;
        backdrop-filter:blur(4px);
    `;
    overlay.innerHTML = '<div style="color:#00ff88;font-size:16px;">Loading baker profile…</div>';
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);

    // Also ensure leaderboard section is open
    const section = document.getElementById('leaderboard-section');
    const toggleBtn = document.getElementById('leaderboard-toggle');
    if (section && toggleBtn && !section.classList.contains('visible')) {
        localStorage.setItem(TOGGLE_KEY, 'true');
        section.classList.add('visible');
        toggleBtn.classList.add('active');
    }

    try {
        // Fetch baker data from TzKT
        const resp = await fetch(`${TZKT}/delegates/${encodeURIComponent(address)}`);
        if (!resp.ok || resp.status === 204) throw new Error(`Baker not found (${resp.status})`);
        const baker = await resp.json();

        // Validate baker is active
        if (!baker || !baker.active) {
            throw new Error('Baker is not currently active');
        }

        // Remove loading overlay
        overlay.remove();

        // Populate My Baker and open drawer (same as row click)
        const input = document.getElementById('my-baker-input');
        const saveBtn = document.getElementById('my-baker-save');
        const drawer = document.getElementById('my-tezos-drawer');
        const scrim = document.getElementById('my-tezos-drawer-scrim');
        const emptyState = document.getElementById('drawer-empty-state');
        const connectedState = document.getElementById('drawer-connected');

        if (input) input.value = address;
        if (saveBtn) saveBtn.click();

        if (drawer && scrim) {
            drawer.classList.add('open');
            scrim.classList.add('open');
            document.body.style.overflow = 'hidden';
            if (emptyState) emptyState.style.display = 'none';
            if (connectedState) connectedState.style.display = '';
        }
    } catch (err) {
        overlay.innerHTML = `
            <div style="background:#0a0e1a;border:1px solid rgba(255,68,68,0.3);border-radius:16px;padding:32px;max-width:400px;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
                <div style="font-size:32px;margin-bottom:12px;">⚠️</div>
                <div style="font-size:16px;font-weight:600;color:#ff4444;margin-bottom:8px;">Baker Not Found</div>
                <div style="font-size:13px;color:rgba(255,255,255,0.5);margin-bottom:4px;font-family:monospace;word-break:break-all;">${escapeHtml(address)}</div>
                <div style="font-size:12px;color:rgba(255,255,255,0.35);margin-top:12px;">${escapeHtml(err.message)}</div>
                <div style="margin-top:20px;">
                    <button onclick="this.closest('[style*=fixed]').remove()" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:8px;color:#fff;padding:8px 20px;cursor:pointer;font-size:13px;">Close</button>
                </div>
            </div>
        `;
        setTimeout(() => overlay.remove(), 8000);
    }
}
