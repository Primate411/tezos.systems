/**
 * Live data injection for SEO landing pages
 * Lightweight — only fetches what the page needs
 */

const TZKT = 'https://api.tzkt.io/v1';
const OCTEZ = 'https://eu.rpc.tez.capital';

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
        const stakingRatio = ((staked + delegated) / supply * 100);
        const edge = 2;
        const effective = (staked / supply) + (delegated / supply) / (1 + edge);
        const stakeAPY = (netIssuance / 100) / effective * 100;
        const delegateAPY = stakeAPY / (1 + edge);

        inject('staking-apy', `~${stakeAPY.toFixed(1)}%`);
        inject('delegate-apy', `~${delegateAPY.toFixed(1)}%`);
        inject('staking-ratio', `${stakingRatio.toFixed(1)}%`);
        inject('issuance-rate', `${(netIssuance).toFixed(2)}%`);
        inject('total-supply', `${(supply / 1e6).toFixed(2)}B`);
        inject('total-staked', `${(staked / 1e6).toFixed(2)}B`);
        inject('total-delegated', `${(delegated / 1e6).toFixed(2)}B`);
    } catch (e) {
        console.warn('Live staking data unavailable:', e);
    }
}

/**
 * Fetch and inject governance data
 */
export async function loadGovernanceData() {
    try {
        const [votingResp, protocolsResp, headResp] = await Promise.all([
            fetch(`${TZKT}/voting/periods/current`),
            fetch(`${TZKT}/protocols?sort.desc=firstLevel&limit=30`),
            fetch(`${TZKT}/head`)
        ]);
        const voting = await votingResp.json();
        const protocols = await protocolsResp.json();
        const head = await headResp.json();

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
            inject('current-protocol', current.metadata?.alias || 'Unknown');
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
        const [bakersResp, statsResp] = await Promise.all([
            fetch(`${TZKT}/delegates?active=true&stakingBalance.gt=0&select=address,alias,stakingBalance,numDelegators,stakersCount&sort.desc=stakingBalance&limit=10`),
            fetch(`${TZKT}/delegates/count?active=true&stakingBalance.gt=0`)
        ]);
        const topBakers = await bakersResp.json();
        const totalBakers = await statsResp.json();

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
                html += `<tr><td>${i + 1}</td><td><a href="/${b.address}">${name}</a></td><td>${fmtXTZ(b.stakingBalance)} ꜩ</td><td>${b.numDelegators || 0}</td></tr>`;
            });
            html += '</tbody></table>';
            html += `<p class="landing-cta"><a href="/#leaderboard">View all ${totalBakers} bakers →</a></p>`;
            container.innerHTML = html;
        }
    } catch (e) {
        console.warn('Live baker data unavailable:', e);
    }
}
