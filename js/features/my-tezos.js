/**
 * My Tezos — Morning Brief + Your Tezos Story
 * Replaces the old hero strip with a rotating daily brief and personal timeline.
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

// Protocol eras — map block levels to protocol names
const PROTOCOL_ERAS = [
    { name: 'Genesis', level: 0, date: '2018-06-30' },
    { name: 'Athens', level: 458753, date: '2019-05-30' },
    { name: 'Babylon', level: 655361, date: '2019-10-18' },
    { name: 'Carthage', level: 851969, date: '2020-03-05' },
    { name: 'Delphi', level: 1212417, date: '2020-11-12' },
    { name: 'Edo', level: 1343489, date: '2021-02-13' },
    { name: 'Florence', level: 1466369, date: '2021-05-11' },
    { name: 'Granada', level: 1589249, date: '2021-08-06' },
    { name: 'Hangzhou', level: 1916929, date: '2021-12-04' },
    { name: 'Ithaca', level: 2244609, date: '2022-04-01' },
    { name: 'Jakarta', level: 2490369, date: '2022-06-18' },
    { name: 'Kathmandu', level: 2736129, date: '2022-09-28' },
    { name: 'Lima', level: 2981889, date: '2022-12-17' },
    { name: 'Mumbai', level: 3268609, date: '2023-03-29' },
    { name: 'Nairobi', level: 3760129, date: '2023-06-24' },
    { name: 'Oxford', level: 4456449, date: '2023-12-05' },
    { name: 'Paris', level: 5726209, date: '2024-06-04' },
    { name: 'Quebec', level: 6422529, date: '2024-11-19' },
    { name: 'Rio', level: 7118849, date: '2025-05-06' },
    { name: 'Sao Paolo', level: 7815169, date: '2025-07-22' },
    { name: 'Tallinn', level: 11468801, date: '2026-01-21' },
];

// ─── Helpers ─────────────────────────────────────────

async function getXtzPrice() {
    try {
        const cached = sessionStorage.getItem('tezos_price_cache');
        if (cached) {
            const data = JSON.parse(cached);
            if (Date.now() - data.timestamp < 30 * 60 * 1000) return data.data?.tezos?.usd || null;
        }
        const resp = await fetch(COINGECKO_URL);
        if (!resp.ok) return null;
        const data = await resp.json();
        return data?.tezos?.usd || null;
    } catch { return null; }
}

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

async function fetchRecentRewards(address) {
    try {
        const resp = await fetch(`${TZKT}/rewards/delegators/${encodeURIComponent(address)}?limit=100&sort.desc=cycle`);
        if (!resp.ok) {
            const bakerResp = await fetch(`${TZKT}/rewards/bakers/${encodeURIComponent(address)}?limit=100&sort.desc=cycle`);
            if (!bakerResp.ok) return null;
            return await bakerResp.json();
        }
        return await resp.json();
    } catch { return null; }
}

function getRewardAmount(r) {
    const blockRewards = (r.blockRewardsDelegated || 0) + (r.blockRewardsStakedOwn || 0) +
                         (r.blockRewardsStakedEdge || 0) + (r.blockRewardsStakedShared || 0);
    const attestRewards = (r.attestationRewardsDelegated || 0) + (r.attestationRewardsStakedOwn || 0) +
                          (r.attestationRewardsStakedEdge || 0) + (r.attestationRewardsStakedShared || 0);
    const dalRewards = (r.dalAttestationRewardsDelegated || 0) + (r.dalAttestationRewardsStakedOwn || 0) +
                       (r.dalAttestationRewardsStakedEdge || 0) + (r.dalAttestationRewardsStakedShared || 0);
    const actual = blockRewards + attestRewards + dalRewards + (r.blockFees || 0);
    if (actual > 0) return actual / 1e6;
    const future = (r.futureBlockRewards || 0) + (r.futureAttestationRewards || 0) + (r.futureDalAttestationRewards || 0);
    if (future > 0) return future / 1e6;
    if (r.ownBlockRewards !== undefined) {
        return ((r.ownBlockRewards || 0) + (r.ownEndorsementRewards || 0) +
                (r.extraBlockRewards || 0) + (r.extraEndorsementRewards || 0)) / 1e6;
    }
    return 0;
}

function calcRewardStreak(rewards) {
    if (!rewards || !rewards.length) return 0;
    let streak = 0;
    for (let i = 0; i < rewards.length; i++) {
        if (getRewardAmount(rewards[i]) <= 0) break;
        if (i > 0 && rewards[i-1].cycle - rewards[i].cycle !== 1) break;
        streak++;
    }
    return streak;
}

async function fetchParticipation(bakerAddr) {
    try {
        const resp = await fetch(`${OCTEZ}/chains/main/blocks/head/context/delegates/${bakerAddr}/participation`);
        if (!resp.ok) return null;
        return await resp.json();
    } catch { return null; }
}

function calcBakerHealth(participation) {
    if (!participation) return null;
    const expected = participation.expected_cycle_activity || 0;
    const missed = participation.missed_slots || 0;
    if (expected === 0) return 100;
    const rate = ((expected - missed) / expected) * 100;
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

function fmtCompact(xtz) {
    if (xtz >= 1e6) return (xtz / 1e6).toFixed(2) + 'M';
    if (xtz >= 1e3) return (xtz / 1e3).toFixed(1) + 'K';
    return xtz.toFixed(2);
}

function getGreeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
}

function getProtocolEra(firstActivityLevel) {
    let era = PROTOCOL_ERAS[0];
    for (const p of PROTOCOL_ERAS) {
        if (firstActivityLevel >= p.level) era = p;
    }
    return era;
}

function countUpgradesSince(firstActivityLevel) {
    return PROTOCOL_ERAS.filter(p => p.level > firstActivityLevel).length;
}

// ─── Morning Brief ─────────────────────────────────────

/**
 * Build the Morning Brief — rotating card with 3 states
 */
function buildMorningBrief(data) {
    const cards = [];

    // Card 1: Earnings summary
    const usdNote = data.xtzPrice ? ` That's $${(data.rewardsLastCycle * data.xtzPrice).toFixed(2)}.` : '';
    const bakerInactive = data.bakerInactive;
    let earningsLine, dailyLine;
    if (bakerInactive) {
        earningsLine = `<strong>${fmtCompact(data.totalXTZ)} XTZ</strong> — <strong style="color:#ef4444">baker inactive, earning nothing</strong>`;
        dailyLine = `<span style="color:#ef4444">⚠️ Re-delegate to start earning</span>`;
    } else if (data.rewardsLastCycle > 0) {
        earningsLine = `<strong>+${data.rewardsLastCycle.toFixed(2)} XTZ</strong> last cycle${usdNote}`;
        dailyLine = `~${data.estDaily.toFixed(2)} XTZ/day · ${data.apyRate}% APY`;
    } else {
        earningsLine = `<strong>${fmtCompact(data.totalXTZ)} XTZ</strong> earning ~<strong>${data.apyRate}% APY</strong>`;
        dailyLine = `~${data.estDaily.toFixed(2)} XTZ/day`;
    }
    cards.push({
        icon: '💰',
        title: `${getGreeting()}.`,
        body: `${earningsLine}<br><span class="brief-sub">${dailyLine}</span>`,
        accent: 'earnings',
    });

    // Card 2: Baker health + streak
    const streakText = data.rewardStreak > 0
        ? `<strong>${data.rewardStreak}-cycle streak</strong> 🔥`
        : '';
    let healthText;
    if (data.bakerInactive) {
        healthText = `<strong>${escapeHtml(data.bakerName)}</strong> — <strong style="color:#ef4444">inactive ⚠️</strong>`;
    } else if (data.healthScore !== null && data.attestRate) {
        healthText = `<strong>${escapeHtml(data.bakerName)}</strong> ${data.health.icon} ${data.attestRate}% attestation`;
    } else {
        healthText = `<strong>${escapeHtml(data.bakerName || 'No baker')}</strong>`;
    }
    cards.push({
        icon: '🍞',
        title: 'Baker Status',
        body: `${streakText}${streakText ? '<br>' : ''}${healthText}`,
        accent: 'baker',
    });

    // Card 3: Governance / Tezos Story teaser
    const storyText = data.story
        ? `Joined under <strong>${data.story.joinedEra}</strong> · <strong>${data.story.upgradesSeen} upgrades</strong> witnessed · zero forks`
        : 'Enter your address to see your Tezos Story.';
    const govText = data.activeProposal
        ? `<br><span class="brief-sub">Active governance: ${escapeHtml(data.activeProposal)}</span>`
        : '';
    cards.push({
        icon: '📜',
        title: 'Your Tezos Story',
        body: `${storyText}${govText}`,
        accent: 'story',
    });

    return cards;
}

// ─── Tezos Story Card ──────────────────────────────────

async function fetchTezosStory(address, account) {
    const firstActivity = account.firstActivity;
    const firstActivityTime = account.firstActivityTime;
    if (!firstActivity) return null;

    const joinedEra = getProtocolEra(firstActivity);
    const upgradesSeen = countUpgradesSince(firstActivity);
    const daysSinceJoin = Math.floor((Date.now() - new Date(firstActivityTime).getTime()) / 86400000);

    // Fetch governance participation count
    let govCycles = 0;
    try {
        // Count voting periods since user's first activity
        const resp = await fetch(`${TZKT}/voting/periods?limit=0&offset=0`);
        if (resp.ok) {
            // Use the count from the API (we only need the total)
            const allPeriodsResp = await fetch(`${TZKT}/voting/periods?limit=1000&select=firstLevel,kind`);
            if (allPeriodsResp.ok) {
                const periods = await allPeriodsResp.json();
                govCycles = periods.filter(p => p.firstLevel >= firstActivity).length;
            }
        }
    } catch {}

    return {
        joinedEra: joinedEra.name,
        joinedDate: joinedEra.date,
        firstActivityTime,
        upgradesSeen,
        daysSinceJoin,
        govCycles,
        currentEra: PROTOCOL_ERAS[PROTOCOL_ERAS.length - 1].name,
    };
}

/**
 * Share Tezos Story as PNG card
 */
async function shareTezosStory(data) {
    try {
        const { loadHtml2Canvas, showShareModal } = await import('../ui/share.js');
        await loadHtml2Canvas();

        const isMatrix = document.body.getAttribute('data-theme') === 'matrix';
        const bgColor = isMatrix ? '#0a0a0a' : '#0a0a14';
        const brand = isMatrix ? '#00ff00' : '#00d4ff';
        const brandRgb = isMatrix ? '0,255,0' : '0,212,255';

        const wrapper = document.createElement('div');
        wrapper.style.cssText = `
            position: fixed; top: -9999px; left: -9999px;
            width: 600px; height: 630px;
            background: linear-gradient(135deg, ${bgColor} 0%, ${isMatrix ? '#0a120a' : '#0a0a1e'} 100%);
            font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
            color: white; overflow: hidden;
            display: flex; flex-direction: column;
            align-items: center; justify-content: center;
            padding: 48px;
            box-sizing: border-box;
        `;

        // Build protocol badge trail
        const badgeEras = PROTOCOL_ERAS.filter(p => p.name !== 'Genesis');
        const joinIdx = badgeEras.findIndex(p => p.name === data.story.joinedEra);
        const badgesHtml = badgeEras.map((p, i) => {
            const isJoined = p.name === data.story.joinedEra;
            const isCurrent = i === badgeEras.length - 1;
            const isWitnessed = i >= joinIdx;
            const opacity = isWitnessed ? 1 : 0.2;
            const bg = isJoined ? brand : (isCurrent ? brand : `rgba(${brandRgb}, ${isWitnessed ? 0.15 : 0.05})`);
            const color = (isJoined || isCurrent) ? bgColor : `rgba(255,255,255,${isWitnessed ? 0.7 : 0.2})`;
            const border = isJoined ? `2px solid ${brand}` : `1px solid rgba(${brandRgb}, ${isWitnessed ? 0.3 : 0.1})`;
            const shadow = isJoined ? `0 0 12px rgba(${brandRgb}, 0.5)` : 'none';
            return `<div style="width:24px;height:24px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;
                font-size:8px;font-weight:900;font-family:'Orbitron',sans-serif;
                background:${bg};color:${color};border:${border};box-shadow:${shadow};opacity:${opacity};
                flex-shrink:0;">${p.name[0]}</div>`;
        }).join('');

        wrapper.innerHTML = `
            <div style="position:absolute;top:0;left:0;right:0;bottom:0;pointer-events:none;
                background:radial-gradient(ellipse at 30% 20%, rgba(${brandRgb},0.08) 0%, transparent 50%),
                radial-gradient(ellipse at 70% 80%, rgba(${brandRgb},0.04) 0%, transparent 50%);"></div>
            <div style="position:absolute;top:12px;left:12px;right:12px;bottom:12px;
                border:1px solid rgba(${brandRgb},0.15);border-radius:12px;pointer-events:none;"></div>

            <div style="position:relative;z-index:1;text-align:center;">
                <div style="font-family:'Orbitron',sans-serif;font-size:14px;font-weight:600;
                    color:rgba(${brandRgb},0.5);letter-spacing:3px;text-transform:uppercase;margin-bottom:8px;">
                    YOUR TEZOS STORY
                </div>
                <div style="font-family:'Orbitron',sans-serif;font-size:24px;font-weight:900;
                    color:${brand};letter-spacing:3px;text-transform:uppercase;margin-bottom:24px;
                    text-shadow:0 0 30px rgba(${brandRgb},0.5);">
                    TEZOS SYSTEMS
                </div>

                <div style="width:200px;height:1px;background:linear-gradient(90deg,transparent,rgba(${brandRgb},0.4),transparent);margin:0 auto 32px;"></div>

                <div style="font-size:48px;font-weight:900;font-family:'Orbitron',sans-serif;
                    color:${brand};margin-bottom:8px;line-height:1;
                    text-shadow:0 0 40px rgba(${brandRgb},0.4);">
                    ${data.story.daysSinceJoin.toLocaleString()}
                </div>
                <div style="font-size:14px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:2px;margin-bottom:32px;">
                    Days on Tezos
                </div>

                <div style="font-size:16px;color:rgba(255,255,255,0.7);line-height:1.8;margin-bottom:24px;">
                    Joined under <span style="color:${brand};font-weight:700;">${data.story.joinedEra}</span><br>
                    Witnessed <span style="color:${brand};font-weight:700;">${data.story.upgradesSeen} protocol upgrades</span><br>
                    ${data.story.govCycles > 0 ? `Lived through <span style="color:${brand};font-weight:700;">${data.story.govCycles} governance cycles</span><br>` : ''}
                    Zero hard forks. Ever.
                </div>

                <div style="display:flex;gap:3px;justify-content:center;flex-wrap:wrap;max-width:500px;margin:0 auto;">
                    ${badgesHtml}
                </div>
            </div>

            <div style="position:absolute;bottom:24px;left:40px;right:40px;display:flex;justify-content:space-between;align-items:center;z-index:1;">
                <span style="font-size:13px;color:rgba(255,255,255,0.3);">${data.address}</span>
                <span style="font-size:13px;color:${brand};font-weight:600;letter-spacing:1px;">tezos.systems</span>
            </div>
        `;

        document.body.appendChild(wrapper);
        const canvas = await html2canvas(wrapper, {
            backgroundColor: bgColor, scale: 2, useCORS: true, logging: false,
            width: 600, height: 630, windowWidth: 600
        });
        wrapper.remove();

        const tweetOptions = [
            { label: '📜 Story', text: `I've been on Tezos for ${data.story.daysSinceJoin.toLocaleString()} days. Joined under ${data.story.joinedEra}. Witnessed ${data.story.upgradesSeen} protocol upgrades. Zero hard forks.\n\nWhat's your Tezos story?\ntezos.systems` },
            { label: '🏛️ OG', text: `${data.story.joinedEra} era. ${data.story.upgradesSeen} upgrades witnessed. ${data.story.daysSinceJoin.toLocaleString()} days and counting.\n\nTezos doesn't fork. It evolves.\ntezos.systems` },
            { label: '📊 Data', text: `My Tezos Story:\n\n📅 ${data.story.daysSinceJoin.toLocaleString()} days on-chain\n🏛️ Joined: ${data.story.joinedEra}\n🔄 ${data.story.upgradesSeen} upgrades witnessed\n🔗 Zero forks\n\ntezos.systems` },
        ];

        showShareModal(canvas, tweetOptions, 'Your Tezos Story');
    } catch (err) {
        console.error('Story share error:', err);
    }
}

/**
 * Share Morning Brief as PNG
 */
async function shareMorningBrief(data) {
    try {
        const { loadHtml2Canvas, showShareModal } = await import('../ui/share.js');
        await loadHtml2Canvas();

        const isMatrix = document.body.getAttribute('data-theme') === 'matrix';
        const bgColor = isMatrix ? '#0a0a0a' : '#0a0a14';
        const brand = isMatrix ? '#00ff00' : '#00d4ff';
        const brandRgb = isMatrix ? '0,255,0' : '0,212,255';

        const wrapper = document.createElement('div');
        wrapper.style.cssText = `
            position: fixed; top: -9999px; left: -9999px;
            width: 500px; padding: 32px;
            background: linear-gradient(135deg, ${bgColor} 0%, ${isMatrix ? '#0a120a' : '#0a0a1e'} 100%);
            font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
            color: white; border-radius: 16px;
            border: 1px solid rgba(${brandRgb}, 0.2);
        `;

        const sysFont = "-apple-system, BlinkMacSystemFont, 'Inter', 'SF Pro Display', sans-serif";

        wrapper.innerHTML = `
            <div style="font-family:'Orbitron',sans-serif; font-size:16px; font-weight:900;
                color:${brand}; letter-spacing:3px; text-transform:uppercase; margin-bottom:2px;
                text-shadow: 0 0 20px rgba(${brandRgb},0.5);">MY TEZOS</div>
            <div style="font-family:${sysFont}; font-size:10px; color:rgba(255,255,255,0.3); text-transform:uppercase;
                letter-spacing:2px; margin-bottom:24px;">tezos.systems</div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:24px;">
                <div style="background:rgba(${brandRgb},0.08); border:1px solid rgba(${brandRgb},0.12); border-radius:12px; padding:18px 14px; text-align:center;">
                    <div style="font-family:${sysFont}; font-size:10px; color:rgba(255,255,255,0.5); text-transform:uppercase; letter-spacing:1.5px;">Portfolio</div>
                    <div style="font-family:${sysFont}; font-size:22px; font-weight:800; color:white; margin-top:6px;">${fmtCompact(data.totalXTZ)} XTZ</div>
                </div>
                <div style="background:rgba(${brandRgb},0.08); border:1px solid rgba(${brandRgb},0.12); border-radius:12px; padding:18px 14px; text-align:center;">
                    <div style="font-family:${sysFont}; font-size:10px; color:rgba(255,255,255,0.5); text-transform:uppercase; letter-spacing:1.5px;">Est. Annual Yield</div>
                    <div style="font-family:${sysFont}; font-size:22px; font-weight:800; color:${brand}; margin-top:6px;">+${data.estAnnual.toFixed(1)} XTZ</div>
                </div>
            </div>

            <div style="display:grid; grid-template-columns:${data.rewardStreak > 0 ? '1fr 1fr 1fr' : '1fr 1fr'}; gap:14px; text-align:center;">
                <div>
                    <div style="font-family:${sysFont}; font-size:10px; color:rgba(255,255,255,0.4); text-transform:uppercase; letter-spacing:1px;">APY</div>
                    <div style="font-family:'Orbitron',sans-serif; font-size:18px; font-weight:700; color:${brand}; margin-top:4px;">${data.apyRate}%</div>
                </div>
                ${data.rewardStreak > 0 ? `
                <div>
                    <div style="font-family:${sysFont}; font-size:10px; color:rgba(255,255,255,0.4); text-transform:uppercase; letter-spacing:1px;">Streak</div>
                    <div style="font-family:'Orbitron',sans-serif; font-size:18px; font-weight:700; color:#f59e0b; margin-top:4px;">${data.rewardStreak} 🔥</div>
                </div>` : ''}
                <div>
                    <div style="font-family:${sysFont}; font-size:10px; color:rgba(255,255,255,0.4); text-transform:uppercase; letter-spacing:1px;">Baker</div>
                    <div style="font-family:${sysFont}; font-size:14px; font-weight:600; color:white; margin-top:6px;">${escapeHtml(data.bakerName)}</div>
                </div>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:24px; padding-top:14px; border-top:1px solid rgba(${brandRgb},0.1);">
                <span style="font-family:${sysFont}; font-size:10px; color:rgba(255,255,255,0.25);">${data.address}</span>
                <span style="font-family:${sysFont}; font-size:10px; color:rgba(255,255,255,0.25);">${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            </div>
        `;

        document.body.appendChild(wrapper);
        const canvas = await html2canvas(wrapper, {
            backgroundColor: bgColor, scale: 2, useCORS: true, logging: false,
            width: 500, windowWidth: 500
        });
        wrapper.remove();

        const tweetOptions = [
            { label: 'Flex', text: `Staking ${fmtCompact(data.totalXTZ)} XTZ on Tezos at ${data.apyRate}% APY${data.rewardStreak > 0 ? ` — ${data.rewardStreak} cycle reward streak 🔥` : ''}.\n\ntezos.systems` },
            { label: 'Recruit', text: `Earning ~${data.estAnnual.toFixed(0)} XTZ/year just by staking on Tezos. No lockup. Keep your keys.\n\nCheck your own stats:\ntezos.systems` },
            { label: 'Data', text: `My Tezos staking dashboard:\n\n📊 ${fmtCompact(data.totalXTZ)} XTZ portfolio\n📈 ${data.apyRate}% APY\n💰 ~${data.estAnnual.toFixed(0)} XTZ/year est.\n${data.rewardStreak > 0 ? `🔥 ${data.rewardStreak} cycle streak\n` : ''}\ntezos.systems` },
        ];

        showShareModal(canvas, tweetOptions, 'My Tezos Stats');
    } catch (err) {
        console.error('Share card error:', err);
    }
}

// ─── Render ──────────────────────────────────────────

// ─── Pulse Visualization ─────────────────────────────

/**
 * Radial staking pulse — ambient canvas behind the Morning Brief
 * Baker at center, user node orbiting, staker dots on rings
 */
function initPulseViz(strip, data) {
    // Remove existing canvas if re-rendering
    strip.querySelector('.pulse-canvas')?.remove();

    const canvas = document.createElement('canvas');
    canvas.className = 'pulse-canvas';
    canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;opacity:0.25;z-index:0;';
    strip.style.position = 'relative';
    strip.insertBefore(canvas, strip.firstChild);

    // Ensure brief content is above canvas
    const briefEl = strip.querySelector('.morning-brief');
    if (briefEl) briefEl.style.position = 'relative';

    const ctx = canvas.getContext('2d');
    let animId = null;
    let isVisible = true;

    // Get theme color
    function getAccentColor() {
        const theme = document.body.getAttribute('data-theme') || 'matrix';
        const colors = {
            matrix: [0, 255, 0],
            dark: [0, 212, 255],
            clean: [59, 130, 246],
            bubblegum: [255, 105, 180],
            void: [139, 92, 246],
            ember: [255, 159, 67],
            signal: [0, 255, 200],
        };
        return colors[theme] || colors.matrix;
    }

    // Staker dots — random but seeded positions
    const stakersCount = Math.min(data.stakersCount || 30, 60);
    const stakers = [];
    for (let i = 0; i < stakersCount; i++) {
        stakers.push({
            angle: (Math.PI * 2 * i / stakersCount) + (Math.random() * 0.3 - 0.15),
            radius: 0.55 + Math.random() * 0.3, // 55-85% of max radius
            speed: 0.0003 + Math.random() * 0.0004, // slow drift
            size: 1 + Math.random() * 1.5,
            brightness: 0.3 + Math.random() * 0.4,
        });
    }

    // User node
    const userNode = {
        angle: 0,
        radius: 0.45,
        speed: 0.0008,
        pulsePhase: 0,
    };

    // Block pulse effect
    let blockPulse = 0;
    window.addEventListener('block-pulse', () => { blockPulse = 1; });

    function resize() {
        const rect = strip.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
    }

    function draw(time) {
        if (!isVisible) { animId = requestAnimationFrame(draw); return; }

        const rect = strip.getBoundingClientRect();
        const w = rect.width;
        const h = rect.height;
        const cx = w * 0.82; // offset right so it doesn't cover text
        const cy = h * 0.5;
        const maxR = Math.min(w * 0.35, h * 0.9);

        const [r, g, b] = getAccentColor();

        ctx.clearRect(0, 0, w, h);

        // Orbit rings (subtle)
        for (let ring = 0.3; ring <= 0.85; ring += 0.18) {
            ctx.beginPath();
            ctx.arc(cx, cy, maxR * ring, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(${r},${g},${b},0.04)`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
        }

        // Baker node at center
        const bakerGlow = 4 + Math.sin(time * 0.001) * 2;
        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},0.8)`;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx, cy, bakerGlow + 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},0.1)`;
        ctx.fill();

        // Staker dots
        for (const s of stakers) {
            s.angle += s.speed;
            const x = cx + Math.cos(s.angle) * maxR * s.radius;
            const y = cy + Math.sin(s.angle) * maxR * s.radius;
            ctx.beginPath();
            ctx.arc(x, y, s.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${r},${g},${b},${s.brightness * 0.4})`;
            ctx.fill();
        }

        // User node (brighter, larger)
        userNode.angle += userNode.speed;
        userNode.pulsePhase += 0.03;
        const userPulse = 1 + Math.sin(userNode.pulsePhase) * 0.3;
        const ux = cx + Math.cos(userNode.angle) * maxR * userNode.radius;
        const uy = cy + Math.sin(userNode.angle) * maxR * userNode.radius;

        // Connection line to baker
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(ux, uy);
        ctx.strokeStyle = `rgba(${r},${g},${b},0.12)`;
        ctx.lineWidth = 1;
        ctx.stroke();

        // User dot
        const userSize = 3.5 * userPulse;
        ctx.beginPath();
        ctx.arc(ux, uy, userSize, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},0.9)`;
        ctx.fill();

        // User glow
        ctx.beginPath();
        ctx.arc(ux, uy, userSize + 4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},0.15)`;
        ctx.fill();

        // Block pulse — expanding ring from center
        if (blockPulse > 0) {
            const pulseR = maxR * (1 - blockPulse) * 0.8;
            ctx.beginPath();
            ctx.arc(cx, cy, pulseR, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(${r},${g},${b},${blockPulse * 0.3})`;
            ctx.lineWidth = 1.5;
            ctx.stroke();
            blockPulse -= 0.015;
            if (blockPulse < 0) blockPulse = 0;
        }

        animId = requestAnimationFrame(draw);
    }

    // IntersectionObserver — pause when not in viewport
    const observer = new IntersectionObserver(([entry]) => {
        isVisible = entry.isIntersecting;
    }, { threshold: 0.1 });
    observer.observe(strip);

    // Handle resize
    window.addEventListener('resize', resize);
    resize();
    animId = requestAnimationFrame(draw);

    // Cleanup function
    strip._pulseCleanup = () => {
        if (animId) cancelAnimationFrame(animId);
        observer.disconnect();
        window.removeEventListener('resize', resize);
    };
}

let _briefRendering = false;
let _briefRenderedAddr = null;

async function renderMorningBrief(address, force = false) {
    const strip = document.getElementById('my-tezos-strip');
    if (!strip) return;
    
    // Prevent double-render of same address
    if (!force && _briefRendering) return;
    if (!force && _briefRenderedAddr === address && strip.classList.contains('visible') && strip.querySelector('.morning-brief')) return;
    
    _briefRendering = true;
    _briefRenderedAddr = address;

    strip.classList.add('visible');
    strip.innerHTML = `<div class="my-tezos-loading"><span class="my-tezos-loading-text">Loading your Tezos…</span></div>`;

    try {
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

        const isBaker = account.type === 'delegate' || account.delegate?.address === address;
        const bakerAddr = isBaker ? address : account.delegate?.address;
        const bakerName = isBaker ? 'Self (Baker)' : (account.delegate?.alias || (bakerAddr ? bakerAddr.slice(0, 8) + '…' : 'None'));
        const bakerActive = isBaker ? account.active !== false : account.delegate?.active !== false;
        const bakerInactive = !bakerActive;

        const [participation, rewards, story] = await Promise.all([
            bakerAddr ? fetchParticipation(bakerAddr) : Promise.resolve(null),
            fetchRecentRewards(address),
            fetchTezosStory(address, account),
        ]);

        const healthScore = calcBakerHealth(participation);
        const health = healthLabel(healthScore);

        let rewardsLastCycle = 0;
        let rewardStreak = 0;
        if (rewards && rewards.length) {
            rewardsLastCycle = getRewardAmount(rewards[0]);
            rewardStreak = calcRewardStreak(rewards);
        }

        const isStaker = staked > 0;
        const apyRate = isStaker ? apy.stakeAPY : apy.delegateAPY;
        const estDaily = totalXTZ * (apyRate / 100) / 365.25;
        const estAnnual = totalXTZ * (apyRate / 100);

        // Attestation rate
        let attestRate = null;
        if (participation) {
            const expected = participation.expected_cycle_activity || 0;
            const missed = participation.missed_slots || 0;
            if (expected > 0) attestRate = (((expected - missed) / expected) * 100).toFixed(1);
        }

        // Active governance proposal
        let activeProposal = null;
        try {
            const govResp = await fetch(`${TZKT}/voting/periods/current`);
            if (govResp.ok) {
                const period = await govResp.json();
                if (period && period.kind !== 'proposal') {
                    activeProposal = `${period.kind} phase — ${period.epoch?.proposal?.alias || 'Unknown'}`;
                }
            }
        } catch {}

        // Save portfolio for deltas
        try {
            localStorage.setItem(LAST_PORTFOLIO_KEY, JSON.stringify({ address, balance: totalXTZ, ts: Date.now() }));
        } catch {}

        const data = {
            address: address.slice(0, 8) + '…' + address.slice(-4),
            fullAddress: address,
            totalXTZ, staked, xtzPrice, apyRate, estDaily, estAnnual,
            rewardsLastCycle, rewardStreak,
            bakerName, bakerInactive, healthScore, health, attestRate,
            isStaker, story, activeProposal,
        };

        const cards = buildMorningBrief(data);

        // Render the brief
        let currentCard = 0;
        let autoTimer = null;

        function renderCard(idx) {
            const card = cards[idx];
            const dotsHtml = cards.map((_, i) =>
                `<span class="brief-dot${i === idx ? ' active' : ''}" data-idx="${i}"></span>`
            ).join('');

            strip.innerHTML = `
                <div class="morning-brief morning-brief-${card.accent}">
                    <div class="brief-content">
                        <div class="brief-icon">${card.icon}</div>
                        <div class="brief-text">
                            <div class="brief-title">${card.title}</div>
                            <div class="brief-body">${card.body}</div>
                        </div>
                    </div>
                    <div class="brief-footer">
                        <div class="brief-dots">${dotsHtml}</div>
                        <div class="brief-actions">
                            <button class="brief-action-btn" id="brief-share" title="Share">📸</button>
                            <button class="brief-action-btn" id="brief-story" title="Your Tezos Story">📜</button>
                            <button class="brief-action-btn" id="brief-edit" title="Change address">✏️</button>
                            <button class="brief-action-btn brief-close" id="brief-close" title="Hide">×</button>
                        </div>
                    </div>
                </div>
            `;

            // Lock height to prevent layout shift
            if (strip._briefHeight) {
                const content = strip.querySelector('.brief-content');
                if (content) content.style.minHeight = strip._briefHeight;
            }

            // Wire dots for manual navigation
            strip.querySelectorAll('.brief-dot').forEach(dot => {
                dot.addEventListener('click', () => {
                    currentCard = parseInt(dot.dataset.idx);
                    renderCard(currentCard);
                    resetAutoRotate();
                });
            });

            // Tap on content to advance
            strip.querySelector('.brief-content')?.addEventListener('click', () => {
                currentCard = (currentCard + 1) % cards.length;
                renderCard(currentCard);
                resetAutoRotate();
            });

            // Wire buttons
            document.getElementById('brief-share')?.addEventListener('click', (e) => {
                e.stopPropagation();
                if (currentCard === 2 && data.story) {
                    shareTezosStory(data);
                } else {
                    shareMorningBrief(data);
                }
            });

            document.getElementById('brief-story')?.addEventListener('click', (e) => {
                e.stopPropagation();
                currentCard = 2; // Jump to story card
                renderCard(currentCard);
                resetAutoRotate();
            });

            document.getElementById('brief-close')?.addEventListener('click', (e) => {
                e.stopPropagation();
                strip.classList.remove('visible');
                localStorage.setItem('tezos-systems-my-tezos-hidden', '1');
                if (autoTimer) clearInterval(autoTimer);
            });

            document.getElementById('brief-edit')?.addEventListener('click', (e) => {
                e.stopPropagation();
                const toggle = document.getElementById('my-baker-toggle');
                const section = document.getElementById('my-baker-section');
                if (section && !section.classList.contains('visible') && toggle) toggle.click();
                const input = document.getElementById('my-baker-input');
                if (input) { input.focus(); input.select(); }
                if (section) section.scrollIntoView({ behavior: 'smooth' });
            });
        }

        let rotationCount = 0; // counts full cycles through all cards
        const MAX_ROTATIONS = 3;

        function resetAutoRotate() {
            if (autoTimer) clearInterval(autoTimer);
            autoTimer = setInterval(() => {
                currentCard = (currentCard + 1) % cards.length;
                if (currentCard === 0) rotationCount++;
                
                if (rotationCount >= MAX_ROTATIONS) {
                    clearInterval(autoTimer);
                    collapseBrief();
                    return;
                }
                renderCard(currentCard);
            }, 8000);
        }

        function collapseBrief() {
            if (autoTimer) clearInterval(autoTimer);
            if (strip._pulseCleanup) strip._pulseCleanup();

            // Phase 1: fade content to 0
            strip.style.transition = 'padding 0.6s ease, border-color 0.6s ease';
            const brief = strip.querySelector('.morning-brief');
            if (brief) {
                brief.style.transition = 'opacity 0.3s ease';
                brief.style.opacity = '0';
            }

            // Phase 2: collapse the strip height smoothly
            setTimeout(() => {
                strip.innerHTML = `
                    <div class="brief-collapsed" id="brief-collapsed">
                        <div class="brief-dots-collapsed">
                            <span class="brief-dot active"></span>
                            <span class="brief-dot active"></span>
                            <span class="brief-dot active"></span>
                        </div>
                    </div>
                `;
                strip.style.padding = '6px 16px';
                strip.style.borderBottom = '1px solid transparent';
                strip.style.background = 'transparent';

                const collapsed = document.getElementById('brief-collapsed');
                if (collapsed) {
                    collapsed.addEventListener('click', () => expandBrief());
                }
            }, 350);
        }

        function expandBrief() {
            strip.style.padding = '';
            strip.style.borderBottom = '';
            strip.style.background = '';
            strip.style.transition = '';
            rotationCount = 0;
            currentCard = 0;
            renderCard(0);
            resetAutoRotate();

            // Re-init pulse
            try {
                if (strip._pulseCleanup) strip._pulseCleanup();
                initPulseViz(strip, { stakersCount: data.story?.govCycles || 30 });
            } catch (e) {}
        }

        // Expose expand for the My Tezos header button
        strip._expandBrief = expandBrief;

        // Measure tallest card and lock height
        let maxH = 0;
        for (let i = 0; i < cards.length; i++) {
            renderCard(i);
            const content = strip.querySelector('.brief-content');
            if (content) {
                content.style.minHeight = '';
                maxH = Math.max(maxH, content.scrollHeight);
            }
        }
        if (maxH > 0) {
            strip._briefHeight = maxH + 'px';
        }

        // Initial render with locked height
        renderCard(0);
        resetAutoRotate();

        // Initialize pulse visualization behind the brief
        try {
            if (strip._pulseCleanup) strip._pulseCleanup();
            initPulseViz(strip, {
                stakersCount: data.story?.govCycles || 30,
            });
        } catch (e) { console.warn('Pulse viz error:', e); }

        // Store data for external use
        strip._briefData = data;
        _briefRendering = false;

    } catch (err) {
        _briefRendering = false;
        console.warn('Morning Brief error:', err);
        strip.innerHTML = `
            <div class="morning-brief">
                <div class="brief-content">
                    <div class="brief-icon">⚠️</div>
                    <div class="brief-text">
                        <div class="brief-title">Could not load your data</div>
                        <div class="brief-body"><button id="brief-retry" class="brief-action-btn">Retry</button></div>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('brief-retry')?.addEventListener('click', () => renderMorningBrief(address));
    }
}

// ─── Onboarding ──────────────────────────────────────

function showOnboarding(strip) {
    strip.classList.add('visible', 'onboarding');
    strip.innerHTML = `
        <div class="my-tezos-onboard">
            <div class="my-tezos-onboard-text">
                <span class="my-tezos-onboard-title">Make this your Tezos homepage</span>
                <span class="my-tezos-onboard-sub">Paste your address to see your Morning Brief, rewards & Tezos Story</span>
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

        const bakerInput = document.getElementById('my-baker-input');
        const bakerSave = document.getElementById('my-baker-save');
        if (bakerInput) bakerInput.value = addr;
        if (bakerSave) bakerSave.click();

        strip.classList.remove('onboarding');
        renderMorningBrief(addr);
    }

    goBtn.addEventListener('click', handleGo);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleGo(); });
    dismiss.addEventListener('click', () => {
        strip.classList.remove('visible', 'onboarding');
        localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    });
}

// ─── Init & Export ───────────────────────────────────

export function initMyTezos() {
    let strip = document.getElementById('my-tezos-strip');
    if (!strip) {
        strip = document.createElement('div');
        strip.id = 'my-tezos-strip';
        strip.className = 'my-tezos-strip';
        const priceBar = document.getElementById('price-bar');
        if (priceBar) {
            priceBar.after(strip);
        } else {
            const header = document.querySelector('.header');
            if (header) header.after(strip);
        }
    }

    const address = localStorage.getItem(STORAGE_KEY);
    const hidden = localStorage.getItem('tezos-systems-my-tezos-hidden') === '1';

    window.addEventListener('my-baker-updated', (e) => {
        const newAddr = e.detail?.address;
        if (newAddr) {
            localStorage.removeItem('tezos-systems-my-tezos-hidden');
            renderMorningBrief(newAddr);
        } else {
            strip.classList.remove('visible');
        }
    });

    window.addEventListener('my-tezos-show-onboarding', () => {
        if (!localStorage.getItem(STORAGE_KEY)) {
            showOnboarding(strip);
        } else if (strip._expandBrief) {
            // Re-expand collapsed brief
            strip._expandBrief();
        }
    });

    if (address && !hidden) {
        renderMorningBrief(address);
    }
}

export function refreshMyTezos() {
    const address = localStorage.getItem(STORAGE_KEY);
    const hidden = localStorage.getItem('tezos-systems-my-tezos-hidden') === '1';
    if (address && !hidden) {
        renderMorningBrief(address);
    }
}
