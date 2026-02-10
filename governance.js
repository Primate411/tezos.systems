/**
 * Governance / Upgrade Clock Module
 * Fetches protocol history and current voting status
 */

const TZKT_BASE = 'https://api.tzkt.io/v1';

// Human-readable upgrade summaries with activation dates
// Research sources: TzKT, Tezos docs, Agora discussions, Nomadic Labs
// Key debates: Oslo vs Oxford (AI parameters), Quebec A vs B (delegation weight)
const UPGRADE_HIGHLIGHTS = {
    'Athens': 'First ever self-amendment • Baking threshold 10k→8k tez • May 2019',
    'Babylon': 'Emmy+ consensus • Entrypoints • Direct delegation • Oct 2019',
    'Carthage': '+30% gas capacity • Improved reward formula • Mar 2020',
    'Delphi': '4× cheaper storage (1→0.25 tez/KB) • Gas revolution • Nov 2020',
    'Edo': 'Sapling privacy • Tickets for L2 • 5th voting period • Feb 2021',
    'Florence': 'Depth-first execution • 32KB ops • Baking Accounts removed • May 2021',
    'Granada': '2× faster (30s blocks) • Liquidity Baking introduced ⚡ • Aug 2021',
    'Hangzhou': 'Timelocks • On-chain views • Global constants • Dec 2021',
    'Ithaca': 'Tenderbake: deterministic finality • LB extended ⚡ • Apr 2022',
    'Jakarta': 'Transaction rollups • LB Toggle Vote ⚡ • tz4 addresses • Jun 2022',
    'Kathmandu': 'Contract events • VDF randomness • SCORU prep • Sep 2022',
    'Lima': 'Consensus keys • Timelocks disabled (security) • Dec 2022',
    'Mumbai': '2× faster (15s blocks) • Smart Rollups live • TORU removed • Mar 2023',
    'Nairobi': 'Smart Rollups production • Precise signature gas • Jun 2023',
    'Oxford': 'REJECTED then passed without AI ⚠️ • Oslo debate: AI params • Feb 2024',
    'Paris': '1.5× faster (10s blocks) • DAL launched • AI voting enabled • Jun 2024',
    'Paris C': 'DAL activation follow-up • Quick patch • Jun 2024',
    'Quebec': '8s blocks • Adaptive Maximum issuance • Quebec vs Qena economic governance battle ⚔️ • Jan 2025',
    'Rio': 'DAL rewards • Daily cycles (~1 day) • May 2025',
    'Seoul': 'Attestation aggregation • BLS proof-of-possession • Sep 2025',
    'Tallinn': '1.33× faster (6s blocks) • All Bakers Attest prep • Jan 2026'
};

// Protocol debates for expanded tooltips
const PROTOCOL_DEBATES = {
    'Granada': 'Introduced Liquidity Baking: 2.5 tez/block to tzBTC/XTZ pool. Most debated feature ever - some called it protocol-level market manipulation.',
    'Ithaca': 'Extended LB sunset by ~10 months. Community split between "valuable liquidity" vs "inappropriate subsidy" camps.',
    'Jakarta': 'Redesigned LB "Escape Hatch" into "Toggle Vote" for ongoing democratic control.',
    'Lima': 'Timelocks disabled after security vulnerability found - adversary could forge proofs.',
    'Oxford': 'MAJOR: First Oxford REJECTED at Promotion stage. Oslo proposal competed with different AI params (7.5% max vs 5%). Oxford 2 passed with AI disabled pending more work.',
    'Quebec': 'Tezos\' first economic governance crisis. Quebec\'s "adaptive maximum" issuance curve vs Tez Capital\'s Qena alternatives championing natural market forces. Qena variants won 75-80% support but failed 80% supermajority thresholds across multiple cycles. The 6-month battle established precedents for community scrutiny of economic changes and tested whether governance would remain developer-led or evolve toward community-driven decisions.'
};

/**
 * Fetch all protocol upgrades
 */
export async function fetchProtocols() {
    try {
        const response = await fetch(`${TZKT_BASE}/protocols`);
        const protocols = await response.json();
        
        // Filter to named protocols only (Athens onwards, code >= 4)
        const namedProtocols = protocols.filter(p => 
            p.code >= 4 && p.extras?.alias
        );
        
        return namedProtocols.map(p => {
            const name = p.extras?.alias || `Protocol ${p.code}`;
            return {
                code: p.code,
                name,
                hash: p.hash,
                firstLevel: p.firstLevel,
                lastLevel: p.lastLevel,
                startTime: null,
                highlight: UPGRADE_HIGHLIGHTS[name] || 'Network upgrade',
                debate: PROTOCOL_DEBATES[name] || null,
                isCurrent: !p.lastLevel
            };
        });
    } catch (error) {
        console.error('Failed to fetch protocols:', error);
        return [];
    }
}

/**
 * Fetch current voting period status
 */
export async function fetchVotingStatus() {
    try {
        const response = await fetch(`${TZKT_BASE}/voting/periods/current`);
        const period = await response.json();
        
        return {
            kind: period.kind, // proposal, exploration, cooldown, promotion, adoption
            status: period.status,
            startTime: period.startTime,
            endTime: period.endTime,
            epoch: period.epoch,
            totalBakers: period.totalBakers,
            topVotingPower: period.topVotingPower,
            proposalsCount: period.proposalsCount
        };
    } catch (error) {
        console.error('Failed to fetch voting status:', error);
        return null;
    }
}

/**
 * Get upgrade count (named protocols from Athens onwards)
 */
export async function getUpgradeCount() {
    const protocols = await fetchProtocols();
    return protocols.length;
}

/**
 * Get current protocol info
 */
export async function getCurrentProtocol() {
    const protocols = await fetchProtocols();
    return protocols.find(p => p.isCurrent) || protocols[protocols.length - 1];
}

/**
 * Format time until next voting milestone
 */
export function formatTimeRemaining(endTime) {
    const end = new Date(endTime);
    const now = new Date();
    const diff = end - now;
    
    if (diff <= 0) return 'Ending soon';
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (days > 0) return `${days}d ${hours}h remaining`;
    return `${hours}h remaining`;
}

/**
 * Get voting period display name
 */
export function getVotingPeriodName(kind) {
    const names = {
        'proposal': 'Proposal Period',
        'exploration': 'Exploration Vote',
        'cooldown': 'Cooldown Period',
        'promotion': 'Promotion Vote',
        'adoption': 'Adoption Period'
    };
    return names[kind] || kind;
}
