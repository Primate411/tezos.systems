/**
 * Live data injection for SEO landing pages
 * Lightweight — only fetches what the page needs
 */
import '../core/tzkt-throttle.js';
import { fetchCurrentVotingPeriod, fetchWithRetry } from '../core/api.js';
import { escapeHtml } from '../core/utils.js';

const TZKT = 'https://api.tzkt.io/v1';
const OCTEZ = 'https://eu.rpc.tez.capital';
const LB_EMA_DISABLE_THRESHOLD = 1_000_000_000;
const LB_MINUTES_PER_YEAR = 365.25 * 24 * 60;

async function fetchJson(url) {
    return fetchWithRetry(url, { cache: 'no-store', memoryCache: false }, 2);
}

async function fetchText(url) {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`${url} failed: ${resp.status}`);
    return resp.text();
}

function parseMutez(value) {
    const parsed = parseInt(String(value ?? '').replace(/"/g, ''), 10);
    return Number.isFinite(parsed) ? parsed : 0;
}

function getTzktTotalStaked(stats = {}) {
    const total = Number(stats.totalOwnStaked || 0) + Number(stats.totalExternalStaked || 0);
    return total > 0 ? total : Number(stats.totalFrozen || 0);
}

function getTzktTotalDelegated(stats = {}) {
    return Number(stats.totalOwnDelegated || 0) + Number(stats.totalExternalDelegated || 0);
}

async function fetchLiquidityBakingSubsidyState() {
    try {
        const blocks = await fetchJson(`${TZKT}/blocks?sort.desc=level&limit=1&select=level,lbToggleEma`);
        const latest = Array.isArray(blocks) ? blocks[0] : null;
        const ema = Number(latest?.lbToggleEma);
        const known = Number.isFinite(ema);
        return {
            disabled: known && ema >= LB_EMA_DISABLE_THRESHOLD,
            known,
            ema: known ? ema : null
        };
    } catch (e) {
        console.warn('Liquidity Baking subsidy state unavailable:', e);
        return { disabled: false, known: false, ema: null };
    }
}

async function fetchProtocolConstants() {
    try {
        return await fetchJson(`${OCTEZ}/chains/main/blocks/head/context/constants`);
    } catch (e) {
        console.warn('Protocol constants unavailable:', e);
        return null;
    }
}

function calculateLbIssuanceRate(constants, supplyMutez, lbDisabled) {
    if (lbDisabled || !constants || !supplyMutez) return 0;
    const lbSubsidyPerMinute = parseMutez(constants.liquidity_baking_subsidy);
    const supply = supplyMutez / 1e6;
    if (!lbSubsidyPerMinute || !supply) return 0;
    const lbXTZPerYear = (lbSubsidyPerMinute / 1e6) * LB_MINUTES_PER_YEAR;
    return (lbXTZPerYear / supply) * 100;
}

/**
 * Inject text into elements by data-live attribute
 * <span data-live="staking-apy">~9%</span> → replaced with real value
 */
function inject(key, value) {
    document.querySelectorAll(`[data-live="${key}"]`).forEach(el => {
        el.textContent = value;
        el.classList.add('live-loaded');
    });
}

/**
 * Fetch and inject staking data
 */
export async function loadStakingData() {
    try {
        const [rateText, frozenStakeText, supplyText, stats, constants, lbState] = await Promise.all([
            fetchText(`${OCTEZ}/chains/main/blocks/head/context/issuance/current_yearly_rate`),
            fetchText(`${OCTEZ}/chains/main/blocks/head/context/total_frozen_stake`),
            fetchText(`${OCTEZ}/chains/main/blocks/head/context/total_supply`),
            fetchJson(`${TZKT}/statistics/current`),
            fetchProtocolConstants(),
            fetchLiquidityBakingSubsidyState()
        ]);

        const parsedProtocolIssuance = parseFloat(rateText.replace(/"/g, ''));
        const protocolIssuance = Number.isFinite(parsedProtocolIssuance) ? parsedProtocolIssuance : 0;
        const supplyMutez = Number(stats.totalSupply || 0) || parseMutez(supplyText) || 0;
        const stakedMutez = getTzktTotalStaked(stats) || parseMutez(frozenStakeText) || 0;
        const canEstimateLb = Boolean(constants && supplyMutez);
        const lbIssuance = calculateLbIssuanceRate(constants, supplyMutez, lbState.disabled);
        const totalIssuance = protocolIssuance + lbIssuance;
        const supply = supplyMutez / 1e6;
        const staked = stakedMutez / 1e6;
        const delegated = getTzktTotalDelegated(stats) / 1e6;
        const stakingRatio = supply > 0 ? (staked / supply * 100) : 0;
        const edge = 2;
        const effective = supply > 0 ? (staked / supply) + (delegated / supply) / (1 + edge) : 0;
        const stakeAPY = effective > 0 ? (protocolIssuance / 100) / effective * 100 : 0;
        const delegateAPY = stakeAPY / (1 + edge);
        const lbBreakdown = lbState.disabled
            ? '0.00% LB (disabled)'
            : canEstimateLb ? `${lbIssuance.toFixed(2)}% LB` : 'LB active';

        inject('staking-apy', `~${stakeAPY.toFixed(1)}%`);
        inject('delegate-apy', `~${delegateAPY.toFixed(1)}%`);
        inject('staking-ratio', `${stakingRatio.toFixed(1)}%`);
        inject('issuance-rate', `${totalIssuance.toFixed(2)}%`);
        inject('issuance-breakdown', `${protocolIssuance.toFixed(2)}% protocol · ${lbBreakdown}`);
        inject('total-supply', `${(supply / 1e9).toFixed(2)}B`);
        inject('total-staked', `${(staked / 1e9).toFixed(2)}B`);
        inject('total-delegated', `${(delegated / 1e9).toFixed(2)}B`);
    } catch (e) {
        console.warn('Live staking data unavailable:', e);
    }
}

/**
 * Fetch and inject governance data
 */
export async function loadGovernanceData() {
    try {
        const [voting, protocols, headMeta] = await Promise.all([
            fetchCurrentVotingPeriod(),
            fetchJson(`${TZKT}/protocols?sort.desc=firstLevel&limit=30`),
            fetchJson('https://eu.rpc.tez.capital/chains/main/blocks/head/metadata')
        ]);
        const head = { cycle: headMeta?.level_info?.cycle, level: headMeta?.level_info?.level };

        // Current period
        const periodNames = {
            proposal: 'Proposal',
            exploration: 'Exploration Vote',
            cooldown: 'Cooldown',
            promotion: 'Promotion Vote',
            adoption: 'Adoption'
        };
        inject('voting-period', periodNames[voting.kind] || voting.kind);

        // Time remaining
        if (voting.endTime) {
            const remaining = new Date(voting.endTime) - new Date();
            if (remaining > 0) {
                const days = Math.floor(remaining / 86400000);
                const hours = Math.floor((remaining % 86400000) / 3600000);
                inject('voting-time-left', days > 0 ? `${days}d ${hours}h` : `${hours}h`);
            }
        }

        // Protocol count
        const activeProtocols = protocols.filter(p => p.firstLevel > 0);
        inject('protocol-count', activeProtocols.length.toString());

        // Current protocol
        const current = activeProtocols[0];
        if (current) {
            inject('current-protocol', current.extras?.alias || current.metadata?.alias || 'Unknown');
        }

        // Days live
        const mainnetLaunch = new Date('2018-09-17T00:00:00Z');
        const daysLive = Math.floor((new Date() - mainnetLaunch) / 86400000);
        inject('days-live', daysLive.toLocaleString());

    } catch (e) {
        console.warn('Live governance data unavailable:', e);
    }
}

/**
 * Fetch and inject baker/consensus data
 */
export async function loadBakerData() {
    try {
        const bakers = await fetchJson(`${TZKT}/delegates?active=true&select=address,alias,stakingBalance,bakingPower,numDelegators,stakersCount&limit=10000`);
        const fundedBakers = Array.isArray(bakers)
            ? bakers.filter((b) => Number(b.bakingPower || 0) > 0)
            : [];
        const topBakers = fundedBakers.length
            ? fundedBakers.sort((a, b) => (b.stakingBalance || 0) - (a.stakingBalance || 0)).slice(0, 10)
            : [];
        const totalBakers = fundedBakers.length;

        inject('total-bakers', totalBakers.toString());

        // Render top 10 into a table if container exists
        const container = document.getElementById('top-bakers-list');
        if (container && topBakers.length) {
            const fmtXTZ = (mutez) => {
                const xtz = (mutez || 0) / 1e6;
                if (xtz >= 1e6) return (xtz / 1e6).toFixed(2) + 'M';
                if (xtz >= 1e3) return (xtz / 1e3).toFixed(1) + 'K';
                return xtz.toFixed(0);
            };
            let html = '<table class="landing-table"><thead><tr><th>#</th><th>Baker</th><th>Staking Power</th><th>Delegators</th></tr></thead><tbody>';
            topBakers.forEach((b, i) => {
                const name = b.alias || (b.address.slice(0, 10) + '…');
                const address = b.address || '';
                html += `<tr><td>${i + 1}</td><td><a href="/#baker=${encodeURIComponent(address)}">${escapeHtml(name)}</a></td><td>${fmtXTZ(b.stakingBalance)} ꜩ</td><td>${b.numDelegators || 0}</td></tr>`;
            });
            html += '</tbody></table>';
            html += `<p class="landing-cta"><a href="/#leaderboard">View all ${totalBakers} bakers →</a></p>`;
            container.innerHTML = html;
        }
    } catch (e) {
        console.warn('Live baker data unavailable:', e);
    }
}
