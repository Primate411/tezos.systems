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
 * Fetch recent rewards for an address (last 100 cycles for streak counting)
 */
async function fetchRecentRewards(address) {
    try {
        const resp = await fetch(`${TZKT}/rewards/delegators/${encodeURIComponent(address)}?limit=100&sort.desc=cycle`);
        if (!resp.ok) {
            // Might be a baker — try baker rewards
            const bakerResp = await fetch(`${TZKT}/rewards/bakers/${encodeURIComponent(address)}?limit=100&sort.desc=cycle`);
            if (!bakerResp.ok) return null;
            return await bakerResp.json();
        }
        return await resp.json();
    } catch { return null; }
}

/**
 * Calculate reward streak — consecutive cycles with non-zero rewards
 */
function calcRewardStreak(rewards) {
    if (!rewards || !rewards.length) return 0;
    let streak = 0;
    // Rewards sorted desc by cycle — walk forward checking consecutiveness
    for (let i = 0; i < rewards.length; i++) {
        const r = rewards[i];
        // Check if this cycle had rewards
        const earned = getRewardAmount(r);
        if (earned <= 0) break;
        // Check cycle is consecutive with previous
        if (i > 0 && rewards[i-1].cycle - r.cycle !== 1) break;
        streak++;
    }
    return streak;
}

/**
 * Get reward amount from a reward entry (works for both delegator and baker rewards)
 */
function getRewardAmount(r) {
    if (r.stakingBalance !== undefined) {
        // Baker rewards
        return ((r.ownBlockRewards || 0) + (r.ownEndorsementRewards || 0) +
                (r.extraBlockRewards || 0) + (r.extraEndorsementRewards || 0)) / 1e6;
    }
    // Delegator rewards — use the reward fields if available
    if (r.futureBlockRewards !== undefined) {
        return ((r.futureBlockRewards || 0) + (r.futureEndorsementRewards || 0)) / 1e6;
    }
    // Fallback: estimate from balance and APY
    return (r.balance || 0) / 1e6 * 0.03 / 365;
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
 * Generate and share a cyberpunk staking stats card
 */
async function shareMyTezosCard(data) {
    try {
        // Dynamically import share utilities if available
        const { loadHtml2Canvas, showShareModal } = await import('../ui/share.js');
        await loadHtml2Canvas();

        const isMatrix = document.body.getAttribute('data-theme') === 'matrix';
        const bgColor = isMatrix ? '#0a0a0a' : '#0a0a14';
        const brand = isMatrix ? '#00ff00' : '#00d4ff';
        const brandRgb = isMatrix ? '0,255,0' : '0,212,255';
        const accent = isMatrix ? 'rgba(0,255,0,0.15)' : 'rgba(0,212,255,0.15)';

        const wrapper = document.createElement('div');
        wrapper.style.cssText = `
            position: fixed; top: -9999px; left: -9999px;
            width: 500px; padding: 32px;
            background: linear-gradient(135deg, ${bgColor} 0%, ${isMatrix ? '#0a120a' : '#0a0a1e'} 100%);
            font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
            color: white; border-radius: 16px;
            border: 1px solid rgba(${brandRgb}, 0.2);
        `;

        wrapper.innerHTML = `
            <div style="font-family:'Orbitron',sans-serif; font-size:18px; font-weight:900;
                color:${brand}; letter-spacing:3px; text-transform:uppercase; margin-bottom:2px;
                text-shadow: 0 0 20px rgba(${brandRgb},0.5);">MY TEZOS</div>
            <div style="font-size:10px; color:rgba(255,255,255,0.3); text-transform:uppercase;
                letter-spacing:2px; margin-bottom:20px;">tezos.systems</div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:20px;">
                <div style="background:${accent}; border-radius:10px; padding:14px; text-align:center;">
                    <div style="font-size:10px; color:rgba(255,255,255,0.5); text-transform:uppercase; letter-spacing:1px;">Portfolio</div>
                    <div style="font-family:'Orbitron',sans-serif; font-size:20px; font-weight:700; color:white; margin-top:4px;">${data.totalXTZ} ꜩ</div>
                </div>
                <div style="background:${accent}; border-radius:10px; padding:14px; text-align:center;">
                    <div style="font-size:10px; color:rgba(255,255,255,0.5); text-transform:uppercase; letter-spacing:1px;">Est. Annual Yield</div>
                    <div style="font-family:'Orbitron',sans-serif; font-size:20px; font-weight:700; color:${brand}; margin-top:4px;">+${data.estAnnual} ꜩ</div>
                </div>
            </div>

            <div style="display:flex; justify-content:space-between; margin-bottom:16px;">
                <div style="text-align:center; flex:1;">
                    <div style="font-size:10px; color:rgba(255,255,255,0.4); text-transform:uppercase;">APY</div>
                    <div style="font-family:'Orbitron',sans-serif; font-size:16px; font-weight:700; color:${brand};">${data.apyRate}%</div>
                    <div style="font-size:9px; color:rgba(255,255,255,0.3);">${data.isStaker ? 'Staker' : 'Delegator'}</div>
                </div>
                ${data.streak > 0 ? `
                <div style="text-align:center; flex:1;">
                    <div style="font-size:10px; color:rgba(255,255,255,0.4); text-transform:uppercase;">Streak 🔥</div>
                    <div style="font-family:'Orbitron',sans-serif; font-size:16px; font-weight:700; color:#f59e0b;">${data.streak}</div>
                    <div style="font-size:9px; color:rgba(255,255,255,0.3);">cycles</div>
                </div>` : ''}
                <div style="text-align:center; flex:1;">
                    <div style="font-size:10px; color:rgba(255,255,255,0.4); text-transform:uppercase;">Baker</div>
                    <div style="font-size:13px; font-weight:600; color:white; margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:120px;">${data.bakerName}</div>
                </div>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:16px; padding-top:12px; border-top:1px solid rgba(${brandRgb},0.1);">
                <span style="font-size:10px; color:rgba(255,255,255,0.25);">${data.address}</span>
                <span style="font-size:10px; color:rgba(255,255,255,0.25);">${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            </div>
        `;

        document.body.appendChild(wrapper);
        const canvas = await html2canvas(wrapper, {
            backgroundColor: bgColor, scale: 2, useCORS: true, logging: false,
            width: 500, windowWidth: 500
        });
        wrapper.remove();

        const tweetOptions = [
            { label: 'Flex', text: `Staking ${data.totalXTZ} ꜩ on Tezos at ${data.apyRate}% APY${data.streak > 0 ? ` — ${data.streak} cycle reward streak 🔥` : ''}.\n\ntezos.systems` },
            { label: 'Recruit', text: `Earning ~${data.estAnnual} ꜩ/year just by staking on Tezos. No lockup. Keep your keys.\n\nCheck your own stats:\ntezos.systems` },
            { label: 'Data', text: `My Tezos staking dashboard:\n\n📊 ${data.totalXTZ} ꜩ portfolio\n📈 ${data.apyRate}% APY\n💰 ~${data.estAnnual} ꜩ/year est.\n${data.streak > 0 ? `🔥 ${data.streak} cycle streak\n` : ''}\ntezos.systems` },
            { label: 'Casual', text: `Tezos staking rewards just keep coming in. Paste your address and see your stats:\n\ntezos.systems` },
        ];

        showShareModal(canvas, tweetOptions, 'My Tezos Stats');
    } catch (err) {
        console.error('Share card error:', err);
    }
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
        let rewardsLastCycle = 0;
        let rewardsTotal = 0;
        let rewardStreak = 0;
        if (rewards && rewards.length) {
            // Last cycle rewards
            rewardsLastCycle = getRewardAmount(rewards[0]);
            // Total across all fetched cycles
            rewards.forEach(r => { rewardsTotal += getRewardAmount(r); });
            // Streak
            rewardStreak = calcRewardStreak(rewards);
        }

        // Estimate daily/annual reward from APY
        const isStaker = staked > 0;
        const apyRate = isStaker ? apy.stakeAPY : apy.delegateAPY;
        const estDailyReward = totalXTZ * (apyRate / 100) / 365.25;
        const estAnnualReward = totalXTZ * (apyRate / 100);
        const estDailyUsd = xtzPrice ? estDailyReward * xtzPrice : null;
        const estAnnualUsd = xtzPrice ? estAnnualReward * xtzPrice : null;

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

        // Streak display
        const streakHtml = rewardStreak > 0
            ? `<div class="my-tezos-cell my-tezos-streak">
                    <div class="my-tezos-label">Reward Streak 🔥</div>
                    <div class="my-tezos-value">${rewardStreak}</div>
                    <div class="my-tezos-sub">consecutive cycles</div>
                </div>`
            : '';

        // Share data for the card
        const shareData = {
            address: address.slice(0, 8) + '…' + address.slice(-4),
            totalXTZ: fmtCompact(totalXTZ),
            apyRate,
            estAnnual: estAnnualReward.toFixed(2),
            streak: rewardStreak,
            bakerName,
            isStaker,
        };

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
                    <div class="my-tezos-label">Est. Annual</div>
                    <div class="my-tezos-value">+${estAnnualReward.toFixed(1)} ꜩ</div>
                    <div class="my-tezos-sub">~${estDailyReward.toFixed(2)}/day${estDailyUsd !== null ? ` · $${estDailyUsd.toFixed(2)}` : ''}</div>
                </div>
                ${streakHtml}
                <div class="my-tezos-cell my-tezos-baker">
                    <div class="my-tezos-label">Baker ${health.icon}</div>
                    <div class="my-tezos-value my-tezos-baker-name">${escapeHtml(bakerName)}</div>
                    <div class="my-tezos-sub" style="color:${health.color}">${health.text}${healthScore !== null ? ` (${healthScore})` : ''}</div>
                </div>
                <div class="my-tezos-cell my-tezos-last-cycle">
                    <div class="my-tezos-label">Last Cycle</div>
                    <div class="my-tezos-value">${rewardsLastCycle > 0 ? '+' + rewardsLastCycle.toFixed(2) + ' ꜩ' : '—'}</div>
                    <div class="my-tezos-sub">${rewards?.length ? rewards.length + ' cycles tracked' : ''}</div>
                </div>
            </div>
            <div class="my-tezos-actions">
                <button class="my-tezos-share" id="my-tezos-share" title="Share your staking stats">📸</button>
                <button class="my-tezos-edit" id="my-tezos-edit" title="Change address">✏️</button>
                <button class="my-tezos-close" id="my-tezos-close" title="Hide My Tezos">×</button>
            </div>
        `;

        // Store share data for the share button
        strip._shareData = shareData;

        // Wire share button
        document.getElementById('my-tezos-share')?.addEventListener('click', () => {
            shareMyTezosCard(strip._shareData);
        });

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
