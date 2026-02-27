/**
 * My Tezos — Personalized homepage hero strip
 * Shows portfolio value, rewards, baker health, and personal deltas
 * Persists address in localStorage. When active, this becomes the user's homepage.
 */

import { API_URLS } from '../core/config.js';
import { formatNumber, escapeHtml } from '../core/utils.js';

const TZKT = API_URLS.tzkt;
const OCTEZ = API_URLS.octez;
const STORAGE_KEY = 'tezos-systems-my-baker-address';
const REWARDS_HISTORY_KEY = 'tezos-systems-my-rewards-history';
const LAST_PORTFOLIO_KEY = 'tezos-systems-my-last-portfolio';
const COINGECKO_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=tezos&vs_currencies=usd';

/**
 * Get XTZ price in USD (uses session cache from price module)
 */
async function getXtzPrice() {
    try {
        const cached = sessionStorage.getItem('tezos_price_cache');
        if (cached) {
            const data = JSON.parse(cached);
            if (Date.now() - data.timestamp < 30 * 60 * 1000) {
                return data.data?.tezos?.usd || null;
            }
        }
        const resp = await fetch(COINGECKO_URL);
        if (!resp.ok) return null;
        const data = await resp.json();
        return data?.tezos?.usd || null;
    } catch { return null; }
}

/**
 * Fetch staking APY (reuse logic from my-baker)
 */
async function getStakingAPY() {
    try {
        const [rateResp, statsResp] = await Promise.all([
            fetch(`${OCTEZ}/chains/main/blocks/head/context/issuance/current_yearly_rate`),
            fetch(`${TZKT}/statistics/current`)
        ]);
        const rateText = await rateResp.text();
        const stats = await statsResp.json();
        const netIssuance = parseFloat(rateText.replace(/"/g, ''));
        const supply = stats.totalSupply / 1e6;
        const staked = ((stats.totalOwnStaked || 0) + (stats.totalExternalStaked || 0)) / 1e6;
        const delegated = ((stats.totalOwnDelegated || 0) + (stats.totalExternalDelegated || 0)) / 1e6;
        const edge = 2;
        const effective = (staked / supply) + (delegated / supply) / (1 + edge);
        const stakeAPY = (netIssuance / 100) / effective * 100;
        const delegateAPY = stakeAPY / (1 + edge);
        return { delegateAPY: Math.round(delegateAPY * 10) / 10, stakeAPY: Math.round(stakeAPY * 10) / 10 };
    } catch {
        return { delegateAPY: 3.1, stakeAPY: 9.2 };
    }
}

/**
 * Fetch recent rewards for an address (last 10 cycles)
 */
async function fetchRecentRewards(address) {
    try {
        const resp = await fetch(`${TZKT}/rewards/delegators/${encodeURIComponent(address)}?limit=10&sort.desc=cycle`);
        if (!resp.ok) {
            // Might be a baker — try baker rewards
            const bakerResp = await fetch(`${TZKT}/rewards/bakers/${encodeURIComponent(address)}?limit=10&sort.desc=cycle`);
            if (!bakerResp.ok) return null;
            return await bakerResp.json();
        }
        return await resp.json();
    } catch { return null; }
}

/**
 * Fetch consensus participation for a baker
 */
async function fetchParticipation(bakerAddr) {
    try {
        const resp = await fetch(`${OCTEZ}/chains/main/blocks/head/context/delegates/${bakerAddr}/participation`);
        if (!resp.ok) return null;
        return await resp.json();
    } catch { return null; }
}

/**
 * Format mutez to XTZ
 */
function fmtXTZ(mutez, decimals = 2) {
    const xtz = (mutez || 0) / 1e6;
    return xtz.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/**
 * Compact XTZ format
 */
function fmtCompact(xtz) {
    if (xtz >= 1e6) return (xtz / 1e6).toFixed(2) + 'M';
    if (xtz >= 1e3) return (xtz / 1e3).toFixed(1) + 'K';
    return xtz.toFixed(2);
}

/**
 * Calculate baker health score (0-100)
 */
function calcBakerHealth(participation) {
    if (!participation) return null;
    const expected = participation.expected_cycle_activity || 0;
    const missed = participation.missed_slots || 0;
    if (expected === 0) return 100;
    const rate = ((expected - missed) / expected) * 100;
    // Score: 100 at perfect, drops fast below 95%
    if (rate >= 99) return 100;
    if (rate >= 97) return 95;
    if (rate >= 95) return 90;
    if (rate >= 90) return 75;
    if (rate >= 67) return 50;
    return 25;
}

function healthLabel(score) {
    if (score === null) return { text: '—', color: 'var(--text-dim)', icon: '⚪' };
    if (score >= 95) return { text: 'Excellent', color: 'var(--color-success, #10b981)', icon: '🟢' };
    if (score >= 75) return { text: 'Good', color: 'var(--color-success, #10b981)', icon: '🟡' };
    if (score >= 50) return { text: 'Fair', color: 'var(--color-warning, #f59e0b)', icon: '🟠' };
    return { text: 'At Risk', color: 'var(--color-error, #ef4444)', icon: '🔴' };
}

/**
 * Build and render the My Tezos hero strip
 */
async function renderHeroStrip(address) {
    const strip = document.getElementById('my-tezos-strip');
    if (!strip) return;

    strip.classList.add('visible');
    strip.innerHTML = `
        <div class="my-tezos-loading">
            <span class="my-tezos-loading-text">Loading your Tezos…</span>
        </div>
    `;

    try {
        // Parallel fetch: account, price, APY
        const [accountResp, xtzPrice, apy] = await Promise.all([
            fetch(`${TZKT}/accounts/${encodeURIComponent(address)}`),
            getXtzPrice(),
            getStakingAPY()
        ]);

        if (!accountResp.ok) throw new Error('Account not found');
        const account = await accountResp.json();

        const balance = (account.balance || 0) / 1e6;
        const staked = (account.stakedBalance || 0) / 1e6;
        const totalXTZ = balance;
        const usdValue = xtzPrice ? totalXTZ * xtzPrice : null;

        // Determine baker
        const isBaker = account.type === 'delegate' || account.delegate?.address === address;
        const bakerAddr = isBaker ? address : account.delegate?.address;
        const bakerName = isBaker ? 'Self (Baker)' : (account.delegate?.alias || (bakerAddr ? bakerAddr.slice(0, 8) + '…' : 'None'));

        // Fetch baker participation + rewards in parallel
        const [participation, rewards] = await Promise.all([
            bakerAddr ? fetchParticipation(bakerAddr) : Promise.resolve(null),
            fetchRecentRewards(address)
        ]);

        // Baker health
        const healthScore = calcBakerHealth(participation);
        const health = healthLabel(healthScore);

        // Reward calculations
        let rewardsThisCycle = 0;
        let rewardsLast10 = 0;
        let rewardCycles = 0;
        if (rewards && rewards.length) {
            rewardsThisCycle = (rewards[0]?.stakingBalance ? rewards[0]?.ownBlockRewards + rewards[0]?.ownEndorsementRewards : rewards[0]?.balance) || 0;
            rewardsThisCycle = rewardsThisCycle / 1e6 || 0;
            rewards.forEach(r => {
                const amt = r.stakingBalance
                    ? ((r.ownBlockRewards || 0) + (r.ownEndorsementRewards || 0) + (r.extraBlockRewards || 0) + (r.extraEndorsementRewards || 0)) / 1e6
                    : ((r.balance || 0) * (apy.delegateAPY / 100) / 365.25) || 0; // estimate if no direct rewards
                rewardsLast10 += amt;
            });
            rewardCycles = rewards.length;
        }

        // Estimate daily reward from APY
        const isStaker = staked > 0;
        const apyRate = isStaker ? apy.stakeAPY : apy.delegateAPY;
        const estDailyReward = totalXTZ * (apyRate / 100) / 365.25;
        const estDailyUsd = xtzPrice ? estDailyReward * xtzPrice : null;

        // Personal deltas: compare with last saved portfolio
        let deltaHtml = '';
        try {
            const last = JSON.parse(localStorage.getItem(LAST_PORTFOLIO_KEY));
            if (last && last.address === address && last.balance) {
                const diff = totalXTZ - last.balance;
                const timeDiff = Date.now() - last.ts;
                if (timeDiff > 3600000 && Math.abs(diff) > 0.01) { // >1hr, >0.01 XTZ change
                    const sign = diff > 0 ? '+' : '';
                    const color = diff > 0 ? 'var(--color-success, #10b981)' : 'var(--color-error, #ef4444)';
                    const arrow = diff > 0 ? '↑' : '↓';
                    const hours = Math.round(timeDiff / 3600000);
                    const timeLabel = hours >= 24 ? `${Math.round(hours/24)}d ago` : `${hours}h ago`;
                    deltaHtml = `<span class="my-tezos-delta" style="color:${color}">${arrow} ${sign}${diff.toFixed(2)} ꜩ since ${timeLabel}</span>`;
                }
            }
        } catch { /* ignore */ }

        // Save current portfolio for next delta
        try {
            localStorage.setItem(LAST_PORTFOLIO_KEY, JSON.stringify({
                address, balance: totalXTZ, ts: Date.now()
            }));
        } catch {}

        // Render
        strip.innerHTML = `
            <div class="my-tezos-grid">
                <div class="my-tezos-cell my-tezos-portfolio">
                    <div class="my-tezos-label">My Portfolio</div>
                    <div class="my-tezos-value">${fmtCompact(totalXTZ)} ꜩ</div>
                    ${usdValue !== null ? `<div class="my-tezos-sub">$${fmtCompact(usdValue)} USD</div>` : ''}
                    ${deltaHtml}
                </div>
                <div class="my-tezos-cell my-tezos-staking">
                    <div class="my-tezos-label">${isStaker ? 'Staked' : 'Delegated'}</div>
                    <div class="my-tezos-value">${isStaker ? fmtCompact(staked) + ' ꜩ' : fmtCompact(totalXTZ) + ' ꜩ'}</div>
                    <div class="my-tezos-sub">${apyRate}% APY (${isStaker ? 'staker' : 'delegator'})</div>
                </div>
                <div class="my-tezos-cell my-tezos-rewards">
                    <div class="my-tezos-label">Est. Daily Reward</div>
                    <div class="my-tezos-value">+${estDailyReward.toFixed(2)} ꜩ</div>
                    ${estDailyUsd !== null ? `<div class="my-tezos-sub">≈ $${estDailyUsd.toFixed(2)}/day</div>` : ''}
                </div>
                <div class="my-tezos-cell my-tezos-baker">
                    <div class="my-tezos-label">Baker ${health.icon}</div>
                    <div class="my-tezos-value my-tezos-baker-name">${escapeHtml(bakerName)}</div>
                    <div class="my-tezos-sub" style="color:${health.color}">${health.text}${healthScore !== null ? ` (${healthScore})` : ''}</div>
                </div>
            </div>
            <div class="my-tezos-actions">
                <button class="my-tezos-edit" id="my-tezos-edit" title="Change address">✏️</button>
                <button class="my-tezos-close" id="my-tezos-close" title="Hide My Tezos">×</button>
            </div>
        `;

        // Wire actions
        document.getElementById('my-tezos-close').addEventListener('click', () => {
            strip.classList.remove('visible');
            localStorage.setItem('tezos-systems-my-tezos-hidden', '1');
        });

        document.getElementById('my-tezos-edit').addEventListener('click', () => {
            // Open My Baker section and focus input
            const toggle = document.getElementById('my-baker-toggle');
            const section = document.getElementById('my-baker-section');
            if (section && !section.classList.contains('visible') && toggle) toggle.click();
            const input = document.getElementById('my-baker-input');
            if (input) { input.focus(); input.select(); }
            if (section) section.scrollIntoView({ behavior: 'smooth' });
        });

    } catch (err) {
        console.warn('My Tezos strip error:', err);
        strip.innerHTML = `
            <div class="my-tezos-grid">
                <div class="my-tezos-cell" style="grid-column: 1/-1; text-align:center;">
                    <div class="my-tezos-sub">Could not load portfolio. <button id="my-tezos-retry" class="my-tezos-edit">Retry</button></div>
                </div>
            </div>
        `;
        const retry = document.getElementById('my-tezos-retry');
        if (retry) retry.addEventListener('click', () => renderHeroStrip(address));
    }
}

/**
 * First-time onboarding prompt (shown when no address is saved)
 */
function showOnboarding(strip) {
    strip.classList.add('visible', 'onboarding');
    strip.innerHTML = `
        <div class="my-tezos-onboard">
            <div class="my-tezos-onboard-text">
                <span class="my-tezos-onboard-title">Make this your Tezos homepage</span>
                <span class="my-tezos-onboard-sub">Paste your address to see portfolio, rewards & baker health</span>
            </div>
            <div class="my-tezos-onboard-input">
                <input type="text" id="my-tezos-address-input" placeholder="tz1… or name.tez" spellcheck="false" autocomplete="off">
                <button id="my-tezos-go" class="my-tezos-go-btn">Go →</button>
            </div>
            <button id="my-tezos-dismiss" class="my-tezos-dismiss">Not now</button>
        </div>
    `;

    const input = document.getElementById('my-tezos-address-input');
    const goBtn = document.getElementById('my-tezos-go');
    const dismiss = document.getElementById('my-tezos-dismiss');

    async function handleGo() {
        let addr = input.value.trim();
        if (!addr) return;

        // Handle .tez domains
        if (addr.endsWith('.tez') && addr.length > 4) {
            try {
                const resp = await fetch('https://api.tezos.domains/graphql', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        query: `query ResolveDomain($name: String!) { domain(name: $name) { address } }`,
                        variables: { name: addr.toLowerCase() }
                    })
                });
                const data = await resp.json();
                const resolved = data?.data?.domain?.address;
                if (resolved) addr = resolved;
            } catch {}
        }

        if (!/^(tz[1-4]|KT1)[a-zA-Z0-9]{33}$/.test(addr)) {
            input.style.borderColor = 'var(--color-error, #ef4444)';
            setTimeout(() => { input.style.borderColor = ''; }, 2000);
            return;
        }

        localStorage.setItem(STORAGE_KEY, addr);
        localStorage.removeItem('tezos-systems-my-tezos-hidden');
        localStorage.removeItem('tezos-systems-my-tezos-dismissed');

        // Also sync to My Baker
        const bakerInput = document.getElementById('my-baker-input');
        const bakerSave = document.getElementById('my-baker-save');
        if (bakerInput) bakerInput.value = addr;
        if (bakerSave) bakerSave.click();

        strip.classList.remove('onboarding');
        renderHeroStrip(addr);
    }

    goBtn.addEventListener('click', handleGo);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleGo(); });

    dismiss.addEventListener('click', () => {
        strip.classList.remove('visible', 'onboarding');
        localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    });
}

/**
 * Initialize My Tezos hero strip
 */
export function initMyTezos() {
    // Create the strip element if not in HTML
    let strip = document.getElementById('my-tezos-strip');
    if (!strip) {
        strip = document.createElement('div');
        strip.id = 'my-tezos-strip';
        strip.className = 'my-tezos-strip';
        // Insert after price bar
        const priceBar = document.getElementById('price-bar');
        if (priceBar) {
            priceBar.after(strip);
        } else {
            const header = document.querySelector('.header');
            if (header) header.before(strip);
        }
    }

    const address = localStorage.getItem(STORAGE_KEY);
    const hidden = localStorage.getItem('tezos-systems-my-tezos-hidden') === '1';
    const dismissed = localStorage.getItem('tezos-systems-my-tezos-dismissed') === '1';

    if (address && !hidden) {
        renderHeroStrip(address);
    } else if (!address && !dismissed) {
        // Show onboarding prompt for first-time visitors
        // Delay slightly so it doesn't compete with initial load
        setTimeout(() => showOnboarding(strip), 2000);
    }
}

/**
 * Refresh My Tezos strip (called on dashboard refresh)
 */
export function refreshMyTezos() {
    const address = localStorage.getItem(STORAGE_KEY);
    const hidden = localStorage.getItem('tezos-systems-my-tezos-hidden') === '1';
    if (address && !hidden) {
        renderHeroStrip(address);
    }
}
