import { setTextPending } from '../ui/text-loading.js';
/**
 * Tezos vs Others - Comparison Cards
 * Shows Tezos metrics side-by-side with Ethereum and Solana
 */

const COMPARISON_CAPTURE_SCALE = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ? 1 : 2;

import { CHAIN_COMPARISON } from '../core/config.js';
import { escapeHtml } from '../core/utils.js';

function displayedUpgradeCount() {
    return CHAIN_COMPARISON.tezosStatic.selfAmendments;
}

// --- Full comparison tweet options ---
function getComparisonTweets() {
  const upgradeCount = displayedUpgradeCount();
  const tezosFinality = CHAIN_COMPARISON.tezosStatic.finality;
  const ethereumFinality = CHAIN_COMPARISON.ethereum.finality;
  return [
  { label: "Data Drop", text: `Five-chain comparison context:

🔹 Tezos: ${upgradeCount} on-chain upgrades, normal ${tezosFinality} BFT finality target
🔹 Ethereum: checkpoint finality normally ${ethereumFinality}
🔹 Solana: fast target blocks; review its published incident history separately

Finality timings depend on each protocol's safety, quorum, and network assumptions.

tezos.systems` },
  { label: "Flex", text: `${upgradeCount} protocol upgrades through on-chain governance. Tenderbake normally targets finality in ${tezosFinality} when quorum and network conditions hold.

No persistent upgrade-driven Tezos community split is recorded in the tracked history.

tezos.systems` },
  { label: "Operating record", text: `Ethereum: socially coordinated client upgrades
Solana: client and operator coordinated releases
Tezos: mainnet since 2018 with an on-chain upgrade record

Availability is separate from chain age; compare published incident records directly.

tezos.systems` },
  { label: "Understated", text: `Tezos normally targets ${tezosFinality} Tenderbake finality under stated BFT assumptions and uses protocol-level self-amendment.

Energy, fees, and throughput need dated, methodology-aligned sources.

tezos.systems` },
  { label: "Question", text: `Your chain has had how many hard forks again? 🤔

Tezos: ${upgradeCount} protocol upgrades; no persistent upgrade-driven community split in the tracked history.

tezos.systems` },
  { label: "Builder", text: `Upgrade processes differ across proof-of-stake networks.

✅ Self-amending protocols
✅ Tenderbake BFT finality under stated fault and quorum assumptions
✅ Protocol-level upgrade coordination

tezos.systems` },
  { label: "Data Drop", text: `Energy comparisons need aligned boundaries, load, date, and methodology.

Tezos, Ethereum, Solana, Cardano, and Algorand are all proof-of-stake networks, but their published estimates are not one live apples-to-apples feed.

tezos.systems` },
  { label: "Flex", text: `Tenderbake normally targets finality in ${tezosFinality} at today's block time.

Safety, liveness, quorum, and network assumptions still apply.

tezos.systems` },
  { label: "Dunk", text: `Stake concentration is measurable. Governance quality is too.

Tezos has governed ${upgradeCount} protocol upgrades via on-chain voting, with no persistent upgrade-driven community split recorded in the tracked history.

tezos.systems` },
  { label: "Understated", text: `Block time, fees, and throughput move on different clocks and need aligned measurements.

Tezos's protocol-level upgrade record is a separate, inspectable signal.

tezos.systems` },
  { label: "Question", text: `What's more decentralized: social coordination around hard forks, or on-chain governance that has coordinated ${upgradeCount}+ protocol upgrades?

tezos.systems` },
  { label: "Energy", text: `Tezos has a low-energy proof-of-stake profile and protocol-level self-amendment. Compare energy studies only after aligning scope, load, and date.

Build sustainably:
tezos.systems` },
  { label: "5-Chain", text: `5 chains. Live Tezos context plus a dated peer snapshot.

🔹 Tezos: ${upgradeCount} on-chain upgrades
🔹 Ethereum: checkpoint finality normally ${ethereumFinality}
🔹 Solana: fast target blocks; published incident history is a separate lens
🔹 Cardano: Stake-pool consensus, Voltaire-era governance
🔹 Algorand: Immediate finality, foundation-coordinated releases

tezos.systems` },
  { label: "Governance", text: `Protocol-change processes:
🟢 Tezos: ${upgradeCount}+ on-chain amendments
🟡 Ethereum: social governance + coordinated hard forks
🟡 Solana: feature and operator coordination
🟡 Cardano: on-chain governance
🟡 Algorand: foundation-coordinated releases

Compare who proposes, votes, and activates changes.

tezos.systems` },
  { label: "Data Drop", text: `Protocol-change records:
🔹 Tezos: ${upgradeCount}+ on-chain amendments
🔹 Ethereum: social/client coordination
🔹 Solana: client/operator coordination

These are different mechanisms, not one numeric scoreboard.

tezos.systems` },
  { label: "Flex", text: `Don't choose between fast, cheap, or decentralized.

Choose a defined BFT finality rule, self-amendment, and an on-chain upgrade record—with the assumptions stated.

tezos.systems` },
  { label: "Dunk", text: `Chains make different tradeoffs across speed, fees, liquidity, governance, and operator concentration.

Different chains make different tradeoffs. Tezos has completed ${upgradeCount} on-chain protocol upgrades.

tezos.systems` },
  { label: "Operator path", text: `Validator entry rules differ by protocol and change over time.

Compare current own-stake requirements, hardware, delegation mechanics, and independently controlled operators from dated primary sources.

tezos.systems` },
  { label: "Formal", text: `Michelson is designed to support formal verification of specified smart-contract properties before deployment.

Assurance still depends on sound specifications, proofs, audits, and operational controls.

tezos.systems` },
  { label: "Operating Record", text: `Solana: published outage history
Ethereum: hard-fork upgrade path
Tezos: mainnet since 2018 with on-chain protocol upgrades

Chain age is not an uptime measurement. Compare incident records directly.

tezos.systems` },
  { label: "Self-Amend", text: `Ethereum coordinates protocol changes through client releases and hard forks.
Solana coordinates features through client and operator processes.
Tezos uses on-chain proposal, voting, and activation periods.

${upgradeCount} times and counting.

tezos.systems` },
  { label: "Lido Problem", text: `Lido represents a large share of staked ETH and adds protocol-level concentration and smart-contract dependencies.

Tezos delegation is native, permissionless, and non-custodial. Baker payout/default, wallet, market, and operational risks still remain.

tezos.systems` },
  { label: "Energy Flex", text: `Proof-of-stake footprint estimates vary with validator scope, transaction load, and study date.

Tezos publishes a low-energy profile; compare it with peer studies only after aligning methodology.

tezos.systems` },
  { label: "Evolution", text: `Other chains ship a roadmap. Tezos ships a process.

${upgradeCount} upgrades through on-chain governance. The protocol carries a built-in amendment process.

tezos.systems` },
  { label: "Builder", text: `Why formal verification matters:

🔹 Michelson is designed for it
🔹 Mathematical proofs for specified properties
🔹 Stronger assurance when specifications and proofs are sound

Security isn't a feature. It's the foundation.

tezos.systems` }
];
}

// --- Per-metric tweet options ---
function getPerMetricTweets() {
  const upgradeCount = displayedUpgradeCount();
  const tezosBlockTime = CHAIN_COMPARISON.tezosStatic.blockTime;
  const tezosFinality = CHAIN_COMPARISON.tezosStatic.finality;
  const ethereumBlockTime = CHAIN_COMPARISON.ethereum.blockTime;
  const ethereumFinality = CHAIN_COMPARISON.ethereum.finality;
  const solanaBlockTime = CHAIN_COMPARISON.solana.blockTime;
  const solanaFinality = CHAIN_COMPARISON.solana.finality;
  const solanaFinalityNote = CHAIN_COMPARISON.solana.finalityNote;
  const algorandFinality = CHAIN_COMPARISON.algorand.finality;
  return {
  blockTime: [
    { label: "Honest", text: `Block time:
🔴 Tezos: ${tezosBlockTime}
🟡 Ethereum: ${ethereumBlockTime}
🟢 Solana: ${solanaBlockTime}

Solana targets shorter block intervals. Tezos normally targets finality in ${tezosFinality} when Tenderbake quorum and network conditions hold.` },
    { label: "Tradeoff", text: `Tezos blocks: ${tezosBlockTime}, with normal Tenderbake finality in ${tezosFinality} under stated BFT assumptions.
Solana blocks: ${solanaBlockTime}, finalized in ${solanaFinality}.

Block interval and finality are separate measurements.` },
  { label: "Technical", text: `We're not the fastest at ${tezosBlockTime} blocks. Tenderbake normally targets finality in ${tezosFinality}, provided its BFT safety, quorum, and network assumptions hold.` },
    { label: "Competitive", text: `${tezosBlockTime} blocks alongside ${upgradeCount} protocol upgrades coordinated through on-chain governance.

Stability has its own velocity.` },
    { label: "Perspective", text: `Solana: ${solanaBlockTime} blocks, ${solanaFinality} to finality
Tezos: ${tezosBlockTime} blocks, ${tezosFinality} to finality

The finality targets are close. Availability is a separate question that should be judged from incident records, not chain age.` }
  ],
  finality: [
    { label: "Data Drop", text: `Normal finality targets:
⚡ Algorand: ${algorandFinality} instant
🟢 Tezos: ${tezosFinality} Tenderbake target
🟡 Solana: ${solanaFinality} finalized
⏳ Cardano: probabilistic confirmation policy
🔴 Ethereum: ${ethereumFinality} checkpoint finality

Mechanisms and safety, quorum, and network assumptions differ.` },
    { label: "Developer", text: `Tenderbake normally targets finality in ${tezosFinality} today.

That BFT safety claim is conditional on the protocol's fault assumptions; liveness also needs quorum and network operation.

This is what serious DeFi needs.` },
    { label: "Dunk", text: `Ethereum: checkpoint finality normally ${ethereumFinality}
Solana: finalized in ${solanaFinality}, ${solanaFinalityNote}
Tezos: normal Tenderbake target ${tezosFinality}

Compare the mechanisms and assumptions, not just the stopwatch.` },
    { label: "Business", text: `Defined finality matters:
• Know the protocol rule
• Know its fault and quorum thresholds
• Monitor the network assumptions

Tezos: normal ${tezosFinality} Tenderbake target when those conditions hold.` }
  ],
  validators: [
    { label: "Honest", text: `Nakamoto Coefficient:
🔄 Tezos: live baker concentration
🔄 Ethereum: staking-entity concentration
🔄 Solana: validator concentration

Distribution matters. So do availability, governance, and who can join.` },
    { label: "Context", text: `Validator concentration is one metric. Address counts, independently controlled operators, thresholds, and time windows must be labeled separately.` },
    { label: "Governance", text: `Tezos validator distribution has room to improve.

These validators have governed ${upgradeCount}+ protocol upgrades. That coordination record is a separate lens from stake concentration.` },
    { label: "Realistic", text: `Nakamoto coefficient is one lens on decentralization.

Tezos keeps improving through binding on-chain governance and a documented upgrade record.` },
    { label: "Entry", text: `Active baker addresses secure Tezos, but address count is not an independently controlled operator count. Compare current validator-entry and own-stake rules from each protocol's primary documentation.` }
  ],
  stakingPct: [
    { label: "Participation", text: `Staking participation is dynamic, and chains define delegated, bonded, and directly staked balances differently.

Tezos is live on tezos.systems; align the timestamp and denominator before comparing peer snapshots.` },
    { label: "Governance", text: `Stake and delegation assign voting power; eligible bakers cast the protocol ballots.

${upgradeCount} completed protocol upgrades have passed that on-chain governance process.` },
    { label: "Quality", text: `Staking isn't just about percentages — it's about quality.

Tezos bakers have voted through ${upgradeCount} protocol upgrades with power assigned through stake and delegation.` }
  ],
  annualIssuance: [
    { label: "Data Drop", text: `Annual issuance:
🔄 Tezos: adaptive — adjusts to staking participation
🔄 Ethereum: low gross issuance, burn-dependent net issuance
🔄 Solana: disinflation schedule

Lowest issuance is not always the whole story. Networks still need security incentives.` },
    { label: "Sustainable", text: `Issuance comparisons need aligned timestamps and definitions: gross issuance, burns, subsidies, and security budgets are different quantities.

Tezos adaptive issuance responds to staking participation.` },
    { label: "Honest", text: `Tezos adaptive issuance changes with staking participation. Compare its live protocol rate and Liquidity Baking state against dated peer data—not a timeless winner label.` }
  ],
  selfAmendments: [
    { label: "Victory", text: `Protocol-change records:
🔹 Tezos: ${upgradeCount}+ on-chain amendments
🔹 Ethereum: social/client coordination
🔹 Solana: client/operator coordination

Tezos makes protocol amendment a first-class on-chain process; the mechanisms are not one comparable count.` },
    { label: "Evolution", text: `${upgradeCount} protocol amendments through the on-chain governance process.

No persistent upgrade-driven community split is recorded in the tracked Tezos history.` },
    { label: "Developer", text: `Self-amending protocols mean:
✅ A defined proposal and voting process
✅ Protocol-level activation
✅ Continuous improvement

${upgradeCount} upgrades and counting.` },
    { label: "Governance", text: `${upgradeCount} completed protocol upgrades through Tezos governance.

The amendment record is visible on-chain.` },
    { label: "Future", text: `While others debate hard forks, Tezos just upgrades.

${upgradeCount} amendments in. Future changes still depend on proposals, votes, and protocol activation.` },
    { label: "Process", text: `How Tezos upgrades:
1. Developer submits proposal
2. Bakers vote (quorum and 80% yay supermajority apply in Exploration and Promotion)
3. Protocol activates automatically

The process is encoded in the protocol; community judgment still shapes proposals and votes.

${upgradeCount} times so far.` }
  ],
  hardForks: [
    { label: "Upgrade Record", text: `Upgrade path snapshot:
🟢 Tezos: protocol-level self-amendment
🟢 Algorand: foundation-coordinated releases
🟡 Cardano: hard-fork combinator upgrades
🟡 Ethereum: coordinated hard forks
🟡 Solana: operator-coordinated releases

No persistent upgrade-driven Tezos community split is recorded in the tracked history.` },
    { label: "Unity", text: `Tezos moves protocol changes through on-chain proposals and votes.

Its tracked upgrade history records no persistent upgrade-driven community split.` },
    { label: "Stability", text: `Different chains use different upgrade mechanisms.

Tezos's protocol-level self-amendment aims to coordinate routine upgrades through one visible process.` },
    { label: "Philosophical", text: `"Hard forks are a feature" 🤔

Tezos has completed ${upgradeCount} on-chain upgrades, with no persistent upgrade-driven community split recorded in the tracked history.

Mature governance > breaking changes.` }
  ],
  energyPerTx: [
    { label: "Climate", text: `Energy-per-transaction estimates depend on validator scope, transaction load, allocation method, and study date.

Compare proof-of-stake networks only from aligned source studies.` },
    { label: "Green", text: `Tezos has a published low-energy proof-of-stake profile.

For procurement or ESG claims, attach the study date, system boundary, and methodology.` },
    { label: "Efficiency", text: `A single energy-per-transaction number is not a protocol constant.

Treat it as a dated study result, not a live categorical winner.` },
    { label: "ESG", text: `Corporate sustainability goals?

Review current, independently auditable footprint studies rather than relying on an undated cross-chain badge.` },
    { label: "Scale", text: `At scale, energy methodology matters.

Network energy, validator energy, transaction load, and allocation assumptions must be aligned before ranking chains.` }
  ],
  slashing: [
    { label: "Safety", text: `Slashing comparison:
🟡 Tezos: Adaptive (scales with offense)
🟢 Cardano: No slashing
🟢 Solana: No slashing (delinquency)
🟢 Algorand: No slashing
🔴 Ethereum: Up to full stake

Tezos adaptive slashing applies to protocol-defined slashable offenses, not ordinary downtime.` },
    { label: "Honest", text: `Tezos uses adaptive slashing: penalties scale with protocol-defined slashable offenses, while ordinary downtime reduces rewards and can lead to deactivation rather than slashing.

Proportional accountability, not punitive terror.` },
    { label: "Delegator", text: `Delegated Tezos balances are not protocol-slashable. Direct stake can be slashed for double-baking or double-attesting; delegation still carries baker payout/default, wallet, market, and operational risks.

Non-custodial does not eliminate risk.` },
    { label: "Technical", text: `Under current Tezos rules, adaptive slashing scales penalties for double-baking or double-attesting. Ordinary downtime reduces rewards and can lead to deactivation rather than slashing.

Security without the binary punishment model.` }
  ],
  avgTxFee: [
    { label: "Honest", text: `Transaction fees are dynamic and transaction-type dependent.

Compare median or representative fees over the same dated window, denomination, and workload.` },
    { label: "Value", text: `Tezos fees are generally designed for low-cost transactions, but a static dollar estimate moves with network conditions, operation type, and XTZ price.` },
    { label: "Reliability", text: `Cost and availability are separate tradeoffs.

Use aligned fee windows and published incident records rather than one hard-coded winner.` },
    { label: "Economics", text: `A fee comparison needs the same operation type and timestamp across chains.

Low cost, spam resistance, and validator economics are separate design questions.` }
  ]
};
}
import { loadHtml2Canvas, showShareModal } from '../ui/share.js';

// Metric definitions: key, label, tezosLive getter, winner logic
const METRICS = [
    {
        key: 'blockTime',
        label: 'Block Time',
        icon: '⏱',
        tezosLive: (stats) => stats.blockTime || CHAIN_COMPARISON.tezosStatic.blockTime,
        winner: 'solana', // fastest block time
        winNote: 'Fastest',
    },
    {
        key: 'finality',
        label: 'Finality',
        icon: '✅',
        tezosLive: () => CHAIN_COMPARISON.tezosStatic.finality,
        tezosNote: () => CHAIN_COMPARISON.tezosStatic.finalityNote,
        winner: 'algorand', // ~2.8s instant finality
        winNote: 'Instant finality',
    },
    {
        key: 'validators',
        label: 'Stake Concentration Lens',
        icon: '🛡',
        tezosLive: () => CHAIN_COMPARISON.tezosStatic.validators,
        tezosNote: () => CHAIN_COMPARISON.tezosStatic.validatorsNote,
        winner: null,
    },
    {
        key: 'stakingPct',
        label: 'Staking %',
        icon: '🔒',
        tezosLive: (stats) => Number.isFinite(stats.stakingRatio) ? stats.stakingRatio.toFixed(1) + '%' : '—',
        winner: null,
    },
    {
        key: 'slashing',
        label: 'Slashing',
        icon: '🔪',
        tezosLive: () => CHAIN_COMPARISON.tezosStatic.slashing,
        tezosNote: () => CHAIN_COMPARISON.tezosStatic.slashingNote,
        winner: null,
        lowerBetter: true,
    },
    {
        key: 'annualIssuance',
        label: 'Annual Issuance',
        icon: '📈',
        tezosLive: (stats) => Number.isFinite(stats.currentIssuanceRate) ? stats.currentIssuanceRate.toFixed(2) + '%' : '—',
        winner: null,
        lowerBetter: true,
    },
    {
        key: 'selfAmendments',
        label: 'Governance Upgrade Record',
        icon: '🔄',
        tezosLive: (stats) => String(displayedUpgradeCount(stats)),
        tezosNote: () => 'named protocol activations through Tezos governance',
        winner: null,
    },
    {
        key: 'hardForks',
        label: 'Upgrade Path',
        icon: '🔀',
        tezosLive: () => CHAIN_COMPARISON.tezosStatic.hardForks,
        tezosNote: () => CHAIN_COMPARISON.tezosStatic.hardForksNote,
        winner: null,
        lowerBetter: true,
    },
    {
        key: 'energyPerTx',
        label: 'Energy / Transaction',
        icon: '⚡',
        tezosLive: () => CHAIN_COMPARISON.tezosStatic.energyPerTx,
        winner: null,
        lowerBetter: true,
    },
    {
        key: 'avgTxFee',
        label: 'Avg Transaction Fee',
        icon: '💰',
        tezosLive: (stats) => stats.avgTxFee || CHAIN_COMPARISON.tezosStatic.avgTxFee,
        winner: null,
        lowerBetter: true,
    },
];

const CHAIN_ORDER = ['tezos', 'ethereum', 'solana', 'cardano', 'algorand'];

const CHAIN_STANDINGS = {
    tezos: {
        name: 'Tezos',
        role: 'Self-upgrading baseline',
        body: (stats) => {
            const upgradeCount = displayedUpgradeCount(stats);
            return `${upgradeCount} on-chain upgrades, a normal ${CHAIN_COMPARISON.tezosStatic.finality} Tenderbake target under stated BFT assumptions, and no persistent upgrade-driven community split in the tracked history.`;
        },
        watch: 'Live fees and concentration should be compared on aligned windows and methodology.',
    },
    ethereum: {
        name: 'Ethereum',
        role: 'Issuance profile',
        href: '/compare/tezos-vs-ethereum.html',
        body: () => 'Proof-of-stake checkpoint finality with a socially coordinated hard-fork upgrade process.',
        watch: 'Issuance, staking concentration, and fees are dynamic and need dated sources.',
    },
    solana: {
        name: 'Solana',
        role: 'Speed specialist',
        href: '/compare/tezos-vs-solana.html',
        body: () => 'Short target block times with a feature- and operator-coordinated upgrade process.',
        watch: 'No on-chain self-amendment; review its published incident history separately.',
    },
    cardano: {
        name: 'Cardano',
        role: 'On-chain governance entrant',
        href: '/compare/tezos-vs-cardano.html',
        body: () => 'Voltaire-era on-chain governance alongside Ouroboros consensus.',
        watch: 'Confirmation policy and governance maturity need their own dated comparison.',
    },
    algorand: {
        name: 'Algorand',
        role: 'Finality and efficiency profile',
        href: '/compare/tezos-vs-algorand.html',
        body: () => 'Fast finality with a foundation-coordinated release process.',
        watch: 'Upgrade process is more foundation-coordinated than self-amending.',
    },
};

/**
 * Get the value for a chain from static config
 */
function getStaticValue(chain, key) {
    const c = CHAIN_COMPARISON[chain];
    if (!c) return '—';
    return c[key] || '—';
}

/**
 * Get note for a chain metric
 */
function getStaticNote(chain, key) {
    const c = CHAIN_COMPARISON[chain];
    if (!c) return '';
    return c[key + 'Note'] || '';
}

/**
 * Get tooltip for a chain metric (if any)
 */
function getStaticTooltip(chain, key) {
    const c = CHAIN_COMPARISON[chain];
    if (!c) return '';
    return c[key + 'Tooltip'] || '';
}

function appendText(parent, tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    el.textContent = text;
    parent.appendChild(el);
    return el;
}

function metricWinLabels(chainKey) {
    return METRICS
        .filter((metric) => metric.winner === chainKey)
        .map((metric) => metric.label);
}

function buildStandingCard(chainKey, stats) {
    const standing = CHAIN_STANDINGS[chainKey];
    const winLabels = metricWinLabels(chainKey);
    const card = document.createElement(standing.href ? 'a' : 'article');
    card.className = `comparison-card comparison-standing-card comparison-standing-${chainKey}`;
    card.style.cssText = 'display:flex;flex-direction:column;gap:.85rem;min-height:14rem;color:var(--text-primary);text-decoration:none;';
    if (standing.href) {
        card.href = standing.href;
        card.setAttribute('aria-label', `${standing.name} comparison details`);
    }

    const head = document.createElement('div');
    head.className = 'comparison-card-header';
    head.style.gap = '.75rem';

    appendText(head, 'span', 'comparison-metric-name', `${standing.name} · ${standing.role}`);
    const profile = document.createElement('div');
    profile.className = 'comparison-win-badge';
    profile.textContent = 'Chain profile';
    head.appendChild(profile);
    card.appendChild(head);

    const body = appendText(card, 'p', 'comparison-standing-body', standing.body(stats || {}));
    body.style.cssText = 'margin:0;color:var(--text-secondary);font-size:.84rem;line-height:1.45;overflow-wrap:anywhere;';

    const detail = document.createElement('div');
    detail.className = 'comparison-standing-detail';
    detail.style.cssText = 'display:grid;gap:.45rem;margin-top:auto;padding-top:.75rem;border-top:1px solid var(--glass-border);';

    for (const item of [
        ['Highlighted strengths', winLabels.length ? winLabels.join(', ') : 'No single numeric category is highlighted'],
        ['Watch', standing.watch],
    ]) {
        const row = document.createElement('div');
        row.style.cssText = 'display:grid;gap:.15rem;';
        appendText(row, 'div', 'comparison-chain-name', item[0]);
        const value = appendText(row, 'div', 'comparison-chain-note', item[1]);
        value.style.cssText = 'margin:0;color:var(--text-secondary);font-size:.72rem;word-spacing:normal;line-height:1.35;';
        detail.appendChild(row);
    }
    card.appendChild(detail);

    return card;
}

function renderComparisonSummary(stats) {
    const container = document.getElementById('comparison-summary');
    if (!container) return;

    container.textContent = '';
    const intro = document.createElement('div');
    intro.className = 'comparison-card';
    intro.style.cssText = 'margin-bottom:1rem;padding:1rem;';
    appendText(intro, 'span', 'comparison-summary-kicker', 'Chain profiles');
    const introCopy = appendText(intro, 'p', '', 'Editorial orientation, not a composite ranking: Tezos emphasizes protocol continuity, Solana short block targets, Algorand fast finality, Ethereum checkpoint consensus, and Cardano newer on-chain governance. Dynamic or method-dependent staking, issuance, energy, fee, concentration, and slashing rows have no categorical winner. Concentration and slashing rows are contextual, not winner-take-all scores.');
    introCopy.style.cssText = 'margin:.5rem 0 0;color:var(--text-secondary);font-size:.84rem;line-height:1.45;';
    container.appendChild(intro);

    const grid = document.createElement('div');
    grid.className = 'comparison-standing-grid comparison-grid';
    grid.style.marginBottom = '1.25rem';
    for (const chainKey of CHAIN_ORDER) {
        grid.appendChild(buildStandingCard(chainKey, stats || {}));
    }
    container.appendChild(grid);
}

/**
 * Build a single comparison card element
 */
function buildComparisonCard(metric, stats) {
    const card = document.createElement('div');
    card.className = 'comparison-card';
    card.setAttribute('data-metric', metric.key);

    const tezosValue = metric.tezosLive(stats);
    const tezosNote = metric.tezosNote ? metric.tezosNote() : '';
    const ethValue = getStaticValue('ethereum', metric.key);
    const ethNote = getStaticNote('ethereum', metric.key);
    const solValue = getStaticValue('solana', metric.key);
    const solNote = getStaticNote('solana', metric.key);

    // Header row
    const header = document.createElement('div');
    header.className = 'comparison-card-header';

    const titleSpan = document.createElement('span');
    titleSpan.className = 'comparison-metric-name';
    titleSpan.textContent = metric.icon + ' ' + metric.label;
    header.appendChild(titleSpan);

    const shareBtn = document.createElement('button');
    shareBtn.className = 'card-share-btn comparison-share-btn';
    shareBtn.textContent = '📸';
    shareBtn.title = 'Share this comparison';
    shareBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        shareComparisonCard(card, metric);
    });
    header.appendChild(shareBtn);

    card.appendChild(header);

    // Columns container
    const cols = document.createElement('div');
    cols.className = 'comparison-columns';

    // Build each chain column
    const adaValue = getStaticValue('cardano', metric.key);
    const adaNote = getStaticNote('cardano', metric.key);
    const algoValue = getStaticValue('algorand', metric.key);
    const algoNote = getStaticNote('algorand', metric.key);

    const ethTooltip = getStaticTooltip('ethereum', metric.key);
    const solTooltip = getStaticTooltip('solana', metric.key);
    const adaTooltip = getStaticTooltip('cardano', metric.key);
    const algoTooltip = getStaticTooltip('algorand', metric.key);

    const chains = [
        { name: 'Tezos', value: tezosValue, note: tezosNote, tooltip: '', cls: 'tezos', isWinner: metric.winner === 'tezos' },
        { name: 'Ethereum', value: ethValue, note: ethNote, tooltip: ethTooltip, cls: 'ethereum', isWinner: metric.winner === 'ethereum' },
        { name: 'Solana', value: solValue, note: solNote, tooltip: solTooltip, cls: 'solana', isWinner: metric.winner === 'solana' },
        { name: 'Cardano', value: adaValue, note: adaNote, tooltip: adaTooltip, cls: 'cardano', isWinner: metric.winner === 'cardano' },
        { name: 'Algorand', value: algoValue, note: algoNote, tooltip: algoTooltip, cls: 'algorand', isWinner: metric.winner === 'algorand' },
    ];

    for (const chain of chains) {
        const col = document.createElement('div');
        col.className = 'comparison-col comparison-col-' + chain.cls;
        if (chain.isWinner) col.classList.add('comparison-winner');

        const nameEl = document.createElement('div');
        nameEl.className = 'comparison-chain-name';
        nameEl.textContent = chain.name;
        col.appendChild(nameEl);

        const valEl = document.createElement('div');
        valEl.className = 'comparison-chain-value';
        valEl.textContent = chain.value;
        setTextPending(valEl, chain.cls === 'tezos' && chain.value === '—' && !Object.keys(stats).length);
        col.appendChild(valEl);

        if (chain.note) {
            const noteEl = document.createElement('div');
            noteEl.className = 'comparison-chain-note';
            noteEl.textContent = chain.note;
            col.appendChild(noteEl);
        }

        if (chain.tooltip) {
            const tipWrap = document.createElement('div');
            tipWrap.className = 'comparison-tooltip-wrap';
            const tipBtn = document.createElement('span');
            tipBtn.className = 'comparison-tooltip-icon';
            tipBtn.textContent = 'ⓘ';
            tipBtn.setAttribute('tabindex', '0');
            const tipText = document.createElement('div');
            tipText.className = 'comparison-tooltip-text';
            tipText.textContent = chain.tooltip;
            tipWrap.appendChild(tipBtn);
            tipWrap.appendChild(tipText);
            col.appendChild(tipWrap);
        }

        if (chain.isWinner) {
            const badge = document.createElement('div');
            badge.className = 'comparison-win-badge';
            badge.textContent = metric.winNote || '★';
            col.appendChild(badge);
        }

        cols.appendChild(col);
    }

    card.appendChild(cols);
    return card;
}

/**
 * Share a single comparison card (delegates to share.js pattern)
 */
async function shareComparisonCard(cardEl, metric) {
    const btn = cardEl.querySelector('.comparison-share-btn');
    if (btn) { btn.textContent = '⏳'; btn.style.opacity = '1'; }
    try {
        const canvas = await captureComparisonImage(cardEl, metric.label);
        const tweetOptions = getPerMetricTweets()[metric.key] || [
            { label: 'Standard', text: `Tezos vs the field — ${metric.label}\n\ntezos.systems` }
        ];
        showShareModal(canvas, tweetOptions, `Comparison: ${metric.label}`);
    } catch (err) {
        console.error('Comparison card share failed:', err);
    } finally {
        if (btn) { btn.textContent = '📸'; btn.style.opacity = ''; }
    }
}

/**
 * Capture all comparison cards as a single image
 */
async function shareAllComparisons() {
    try {
        await loadHtml2Canvas();
        const isMatrix = document.body.getAttribute('data-theme') === 'matrix';
        const bgColor = isMatrix ? '#0a0a0a' : '#0a0a0f';
        const brand = isMatrix ? '#00ff00' : '#00d4ff';
        const brandRgb = isMatrix ? '0,255,0' : '0,212,255';

        const wrapper = document.createElement('div');
        wrapper.style.cssText = `
            position: fixed; top: -9999px; left: -9999px;
            width: 700px; padding: 32px;
            background: ${bgColor};
            font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'SF Pro Display', sans-serif;
            color: white;
        `;

        const title = document.createElement('div');
        title.style.cssText = `font-family:'Orbitron',sans-serif; font-size:20px; font-weight:900;
            color:${brand}; letter-spacing:3px; text-transform:uppercase; margin-bottom:4px;
            text-shadow: 0 0 20px rgba(${brandRgb},0.5);`;
        title.textContent = 'TEZOS SYSTEMS';
        wrapper.appendChild(title);

        const subtitle = document.createElement('div');
        subtitle.style.cssText = `font-size:11px; color:rgba(255,255,255,0.4); text-transform:uppercase;
            letter-spacing:2px; margin-bottom:20px;`;
        subtitle.textContent = 'How Tezos Compares';
        wrapper.appendChild(subtitle);

        const sysFont = "-apple-system, BlinkMacSystemFont, 'Inter', 'SF Pro Display', sans-serif";
        const winColor = '#00ff88';

        // Build each card with inline styles
        const cards = document.querySelectorAll('.comparison-card');
        const grid = document.createElement('div');
        grid.style.cssText = 'display:flex; flex-direction:column; gap:16px;';
        cards.forEach(card => {
            const data = extractCardData(card);
            const row = document.createElement('div');
            row.innerHTML = `
                <div style="font-size:12px; font-weight:600; color:rgba(255,255,255,0.7); margin-bottom:8px;">${escapeHtml(data.metricName)}</div>
                <div style="display:flex; gap:6px;">
                    ${data.chains.map(c => {
                        const valColor = c.isWinner ? winColor : c.isTezos ? brand : 'rgba(255,255,255,0.5)';
                        const nameColor = c.isTezos ? brand : 'rgba(255,255,255,0.4)';
                        return `<div style="flex:1; text-align:center; padding:8px 4px; border-radius:8px;
                            background:${c.isTezos ? `rgba(${brandRgb},0.06)` : 'rgba(255,255,255,0.02)'};
                            border:1px solid ${c.isTezos ? `rgba(${brandRgb},0.15)` : 'rgba(255,255,255,0.04)'};">
                            <div style="font-size:8px; font-weight:600; text-transform:uppercase; color:${nameColor}; margin-bottom:4px;">${escapeHtml(c.name)}</div>
                            <div style="font-size:13px; font-weight:700; color:${valColor};">${escapeHtml(c.value)}</div>
                            ${c.badge ? `<div style="font-size:7px; color:${winColor}; margin-top:3px;">${escapeHtml(c.badge)}</div>` : ''}
                        </div>`;
                    }).join('')}
                </div>
            `;
            grid.appendChild(row);
        });
        wrapper.appendChild(grid);

        const footer = document.createElement('div');
        footer.style.cssText = `display:flex; justify-content:space-between; margin-top:16px; font-size:12px; color:rgba(255,255,255,0.3);`;
        const left = document.createElement('span');
        left.textContent = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const right = document.createElement('span');
        right.textContent = 'tezos.systems';
        footer.appendChild(left);
        footer.appendChild(right);
        wrapper.appendChild(footer);

        document.body.appendChild(wrapper);
        const canvas = await html2canvas(wrapper, {
            backgroundColor: bgColor, scale: COMPARISON_CAPTURE_SCALE, useCORS: true, logging: false,
            width: 700, windowWidth: 700
        });
        wrapper.remove();

        const tweetOptions = getComparisonTweets();
        showShareModal(canvas, tweetOptions, 'How Tezos Compares');
    } catch (err) {
        console.error('All comparisons share failed:', err);
    }
}

/**
 * Extract chain data from a comparison card element for share image generation
 */
function extractCardData(cardEl) {
    const metricName = cardEl.querySelector('.comparison-metric-name')?.textContent || '';
    const cols = cardEl.querySelectorAll('.comparison-col');
    const chains = [];
    cols.forEach(col => {
        const name = col.querySelector('.comparison-chain-name')?.textContent || '';
        const value = col.querySelector('.comparison-chain-value')?.textContent || '';
        const note = col.querySelector('.comparison-chain-note')?.textContent || '';
        const badge = col.querySelector('.comparison-win-badge')?.textContent || '';
        const isWinner = col.classList.contains('comparison-winner');
        const isTezos = col.classList.contains('comparison-col-tezos');
        chains.push({ name, value, note, badge, isWinner, isTezos });
    });
    return { metricName, chains };
}

/**
 * Capture a single comparison card as an image — built with inline styles for reliable rendering
 */
async function captureComparisonImage(cardEl, label) {
    await loadHtml2Canvas();
    const isMatrix = document.body.getAttribute('data-theme') === 'matrix';
    const bgColor = isMatrix ? '#0a0a0a' : '#0a0a0f';
    const brand = isMatrix ? '#00ff00' : '#00d4ff';
    const brandRgb = isMatrix ? '0,255,0' : '0,212,255';
    const winColor = '#00ff88';
    const sysFont = "-apple-system, BlinkMacSystemFont, 'Inter', 'SF Pro Display', sans-serif";

    const data = extractCardData(cardEl);

    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
        position: fixed; top: -9999px; left: -9999px;
        width: 700px; padding: 32px;
        background: ${bgColor};
        font-family: ${sysFont};
        color: white;
    `;

    // Header
    wrapper.innerHTML = `
        <div style="font-family:'Orbitron',sans-serif; font-size:18px; font-weight:900;
            color:${brand}; letter-spacing:3px; text-transform:uppercase; margin-bottom:2px;
            text-shadow: 0 0 20px rgba(${brandRgb},0.5);">TEZOS SYSTEMS</div>
        <div style="font-size:11px; color:rgba(255,255,255,0.35); text-transform:uppercase;
            letter-spacing:2px; margin-bottom:24px;">How Tezos Compares</div>

        <div style="font-size:14px; font-weight:600; color:rgba(255,255,255,0.8); margin-bottom:16px;">
            ${escapeHtml(data.metricName)}
        </div>

        <div style="display:flex; gap:10px; margin-bottom:24px;">
            ${data.chains.map(c => {
                const valColor = c.isWinner ? winColor : c.isTezos ? brand : 'rgba(255,255,255,0.5)';
                const nameColor = c.isTezos ? brand : 'rgba(255,255,255,0.4)';
                const bg = c.isTezos
                    ? `rgba(${brandRgb},0.08)`
                    : 'rgba(255,255,255,0.03)';
                const border = c.isTezos
                    ? `rgba(${brandRgb},0.2)`
                    : 'rgba(255,255,255,0.06)';
                return `
                <div style="flex:1; text-align:center; padding:14px 8px; border-radius:10px;
                    background:${bg}; border:1px solid ${border};">
                    <div style="font-size:10px; font-weight:600; text-transform:uppercase;
                        letter-spacing:0.5px; color:${nameColor}; margin-bottom:8px;">${escapeHtml(c.name)}</div>
                    <div style="font-size:18px; font-weight:700; color:${valColor};
                        ${c.isWinner ? `text-shadow:0 0 12px rgba(0,255,136,0.4);` : ''}">${escapeHtml(c.value)}</div>
                    ${c.note ? `<div style="font-size:10px; color:rgba(255,255,255,0.3); margin-top:4px;">${escapeHtml(c.note)}</div>` : ''}
                    ${c.badge ? `<div style="font-size:9px; font-weight:700; text-transform:uppercase;
                        letter-spacing:0.5px; color:${winColor}; background:rgba(0,255,136,0.1);
                        padding:2px 8px; border-radius:4px; margin-top:8px; display:inline-block;">${escapeHtml(c.badge)}</div>` : ''}
                </div>`;
            }).join('')}
        </div>

        <div style="display:flex; justify-content:space-between; font-size:11px; color:rgba(255,255,255,0.25);">
            <span>${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            <span>tezos.systems</span>
        </div>
    `;

    document.body.appendChild(wrapper);
    const canvas = await html2canvas(wrapper, {
        backgroundColor: bgColor, scale: COMPARISON_CAPTURE_SCALE, useCORS: true, logging: false,
        width: 700, windowWidth: 700
    });
    wrapper.remove();
    return canvas;
}

/**
 * Initialize the comparison section
 * @param {Object} stats - Current dashboard stats (from app.js state)
 */
export function initComparison(stats) {
    const container = document.getElementById('comparison-grid');
    if (!container) return;

    renderComparisonSummary(stats || {});

    // Clear existing
    container.textContent = '';

    for (const metric of METRICS) {
        const card = buildComparisonCard(metric, stats || {});
        container.appendChild(card);
    }

    // Update the lastUpdated display
    const updatedEl = document.getElementById('comparison-last-updated');
    if (updatedEl) {
        const d = new Date(CHAIN_COMPARISON.lastUpdated + 'T00:00:00Z');
        updatedEl.textContent = 'Comparison data as of ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) + ' · ';
        const receipt = document.createElement('a');
        receipt.href = CHAIN_COMPARISON.verification.report;
        receipt.textContent = `${CHAIN_COMPARISON.verification.numericClaims} double-checked static numbers`;
        updatedEl.appendChild(receipt);
    }

    // Wire up section-level share button
    const shareAllBtn = document.getElementById('comparison-share-all-btn');
    if (shareAllBtn && !shareAllBtn._wired) {
        shareAllBtn._wired = true;
        shareAllBtn.addEventListener('click', shareAllComparisons);
    }
}

/**
 * Update comparison with fresh stats (called after data refresh)
 */
export function updateComparison(stats) {
    initComparison(stats);
}
