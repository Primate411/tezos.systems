/**
 * Tezos vs Others - Comparison Cards
 * Shows Tezos metrics side-by-side with Ethereum and Solana
 */

const COMPARISON_CAPTURE_SCALE = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ? 1 : 2;

import { CHAIN_COMPARISON, API_URLS } from '../core/config.js?v=20260228a';

// --- Full comparison tweet options ---
const COMPARISON_TWEETS_FULL = [
  { label: "Data Drop", text: `The blockchain trilemma, quantified:

🔹 Tezos: 0 hard forks, 21 upgrades, deterministic finality
🔹 Ethereum: 17+ forks, ~13min finality
🔹 Solana: Fast blocks, but multiple outages

tezos.systems` },
  { label: "Flex", text: `21 seamless protocol upgrades. Zero network splits. Deterministic 12s finality.

While others fork and fragment, Tezos evolves.

tezos.systems` },
  { label: "Dunk", text: `Ethereum: 17+ hard forks 📈
Solana: Multiple outages 🍴
Tezos: Zero forks. Zero downtime. 🎯

Some chains break to upgrade. Others just... upgrade.

tezos.systems` },
  { label: "Understated", text: `Not the fastest. Not the cheapest. But 0 hard forks, deterministic finality, and the lowest energy per tx of any major chain.

Sometimes steady wins.

tezos.systems` },
  { label: "Question", text: `Your chain has had how many hard forks again? 🤔

Tezos: 21 protocol upgrades, 0 network splits.

tezos.systems` },
  { label: "Recruit", text: `Building on a chain that forks every upgrade? There's a better way.

✅ Self-amending protocols
✅ Deterministic finality
✅ Zero breaking changes

tezos.systems` },
  { label: "Data Drop", text: `Energy per transaction:
🟢 Tezos: <0.001 kWh
🟡 Solana: ~0.00051 kWh
🔴 Ethereum: ~0.003 kWh

Efficiency matters.

tezos.systems` },
  { label: "Flex", text: `Deterministic finality in 12 seconds. Not "probabilistic eventually." Not "2 epochs."

Actual finality. Guaranteed.

tezos.systems` },
  { label: "Dunk", text: `6 entities control 50% of Ethereum stake 👀

Meanwhile Tezos has governed 21 protocol upgrades via on-chain voting without a single contentious fork.

tezos.systems` },
  { label: "Understated", text: `We're not winning block time (Solana's faster). We're not winning fees (Solana's cheaper).

But we've never forked and upgrade seamlessly.

tezos.systems` },
  { label: "Question", text: `What's more decentralized: a chain where 6 entities control 50% of stake, or one where governance has coordinated 21+ upgrades without a single fork?

tezos.systems` },
  { label: "Recruit", text: `Climate-conscious devs: Tezos uses less energy per tx than any major PoS chain. Zero hard forks means zero wasted effort.

Build sustainably:
tezos.systems` },
  { label: "5-Chain", text: `5 chains. 1 comparison. Live data.

🔹 Tezos: 21 upgrades, 0 forks
🔹 Ethereum: Most TVL, slowest finality
🔹 Solana: Fastest blocks, outage history
🔹 Cardano: High staking %, slow blocks
🔹 Algorand: Instant finality, centralized upgrades

tezos.systems` },
  { label: "Governance", text: `Self-amendment scoreboard:
🏆 Tezos: 21+ on-chain upgrades
❌ Ethereum: Hard forks only
❌ Solana: No on-chain governance
🟡 Cardano: 1 (CIP-1694, Sep 2024)
❌ Algorand: Foundation-controlled

Only one chain truly governs itself.

tezos.systems` },
  { label: "Data Drop", text: `Self-amendment scoreboard:
🏆 Tezos: 21+ successful upgrades
❌ Ethereum: 0 (hard forks only)
❌ Solana: 0 (no on-chain governance)

tezos.systems` },
  { label: "Flex", text: `Don't choose between fast, cheap, or decentralized.

Choose deterministic finality, self-amendment, and zero forks.

tezos.systems` },
  { label: "Dunk", text: `Yes, Solana is faster and cheaper. Yes, Ethereum has more TVL.

But when they break (and they do), Tezos keeps building. 21 upgrades, 0 forks.

tezos.systems` },
  { label: "Barrier", text: `To validate on Ethereum you need 32 ETH (~$100K+).
To bake on Tezos you need 6,000 XTZ.

One of these is accessible. The other created Lido.

tezos.systems` },
  { label: "Formal", text: `Tezos smart contracts can be formally verified — mathematically proven correct before deployment.

Ethereum? "Move fast and break things" cost DeFi billions in exploits.

tezos.systems` },
  { label: "Uptime", text: `Solana: 7+ major outages since launch
Ethereum: Beacon chain close calls
Tezos: Zero downtime. Ever.

21 protocol upgrades without a single second of unplanned downtime.

tezos.systems` },
  { label: "Self-Amend", text: `Ethereum needs social consensus + hard fork to change anything.
Solana needs a feature gate + validator restart.
Tezos? On-chain proposal → vote → automatic activation.

21 times and counting.

tezos.systems` },
  { label: "Lido Problem", text: `Lido controls ~30% of all staked ETH. One protocol, one point of failure.

Tezos doesn't need liquid staking middlemen — delegation is native, permissionless, and doesn't pool custody.

tezos.systems` },
  { label: "Energy Flex", text: `Proof of Stake isn't all equal.

Tezos: <0.001 kWh/tx, ~248 bakers, 6s blocks
Ethereum: ~0.003 kWh/tx, 802 entities, 12s blocks

Smaller, leaner, greener.

tezos.systems` },
  { label: "Evolution", text: `Other chains ship a roadmap. Tezos ships a process.

21 upgrades through on-chain governance. The protocol evolves itself. No foundation decree. No hard fork drama.

tezos.systems` },
  { label: "Builder", text: `Why formal verification matters:

🔹 Michelson is designed for it
🔹 Mathematical proof your contract works
🔹 No "oops we lost $600M" moments

Security isn't a feature. It's the foundation.

tezos.systems` }
];

// --- Per-metric tweet options ---
const COMPARISON_TWEETS_PER_METRIC = {
  blockTime: [
    { label: "Honest", text: `Block time:
🔴 Tezos: ~6s
🟡 Ethereum: ~12s
🟢 Solana: ~0.4s

Solana wins speed. But our blocks are deterministically final in ~12s total.` },
    { label: "Tradeoff", text: `Tezos blocks: ~6 seconds, deterministically final in 12s.
Solana blocks: 0.4 seconds, finalized in ~12.8s.

Consistent finality > raw speed.` },
    { label: "Technical", text: `We're not the fastest at ~6s blocks. But every block is guaranteed final within 12s. No reorgs, no "eventual consistency."` },
    { label: "Competitive", text: `6-second blocks powering 21 seamless protocol upgrades without a single fork.

Stability has its own velocity.` },
    { label: "Perspective", text: `Solana: 0.4s blocks, ~12.8s to finality
Tezos: 6s blocks, ~12s to finality

The gap in actual finality? Negligible. The gap in uptime? Not even close.` }
  ],
  finality: [
    { label: "Data Drop", text: `Finality:
⚡ Algorand: ~3.3s instant
🟢 Tezos: 12s deterministic
🟡 Solana: ~12.8s finalized
⏳ Cardano: ~12 min
🔴 Ethereum: ~13 min

Deterministic = guaranteed. No takebacks.` },
    { label: "Developer", text: `Deterministic finality in 12 seconds. Not "probably final." Not "economically final."

Mathematically guaranteed finality.

This is what serious DeFi needs.` },
    { label: "Dunk", text: `Ethereum: "Final in 13 min... probably"
Solana: "Finalized in ~13s after 31 blocks"
Tezos: "Final in 12s. Guaranteed."

Deterministic > probabilistic.` },
    { label: "Business", text: `Instant finality matters:
• No transaction reversals
• No reorg risk
• No "economic finality" guesswork

Tezos: 12s deterministic finality. Every time.` }
  ],
  validators: [
    { label: "Honest", text: `Nakamoto Coefficient:
🔴 Tezos: 4 bakers for 33%
🟡 Ethereum: 6 entities for 50% (802 actual entities)
🟢 Solana: ~20 for 33%

Solana's more distributed by this metric.` },
    { label: "Context", text: `Yes, Solana has a higher Nakamoto coefficient (~20 vs our 4). But they've also had multiple outages.

Decentralization isn't just validator count — it's reliability.` },
    { label: "Governance", text: `4 bakers for 33% of Tezos validation. Room to improve.

But these validators have governed 21+ upgrades without a single contentious fork. That's coordination, not capture.` },
    { label: "Realistic", text: `Nakamoto coefficient: 4 for Tezos vs ~20 for Solana.

We're working on it. But we've never halted, and our governance actually works.` },
    { label: "Entry", text: `~248 bakers secure Tezos. Anyone with 6,000 XTZ can join.

Ethereum? 32 ETH minimum (~$100K+). No wonder Lido controls 30%.` }
  ],
  stakingPct: [
    { label: "Participation", text: `Staking participation:
🟢 Solana: ~67%
🟡 Ethereum: ~30%
🔄 Tezos: Live data

High participation = strong security. Check tezos.systems for live numbers.` },
    { label: "Governance", text: `Our stakers don't just secure the network — they govern it.

21 successful protocol votes. 0 contentious forks. That's engaged staking.` },
    { label: "Quality", text: `Staking isn't just about percentages — it's about quality.

Tezos stakers have voted through 21 protocol upgrades. Active governance, not passive yield farming.` }
  ],
  annualIssuance: [
    { label: "Data Drop", text: `Annual issuance:
🟢 Ethereum: ~0.5%
🔄 Tezos: ~3.52% (adaptive)
🔴 Solana: ~4.2%

ETH wins lowest inflation. But deflationary isn't always better — networks need incentives.` },
    { label: "Sustainable", text: `Low inflation sounds good until your network can't fund development.

Tezos adaptive issuance funds both security AND evolution. That's how we ship 21 upgrades.` },
    { label: "Honest", text: `Ethereum's ~0.5% issuance wins the inflation game.

Tezos trades higher issuance (~3.52%) for sustainable protocol development and baker incentives. Different priorities.` }
  ],
  selfAmendments: [
    { label: "Victory", text: `Self-amendment scoreboard:
🏆 Tezos: 21+ upgrades
❌ Ethereum: 0 (hard forks only)
❌ Solana: 0

Only one chain evolves without breaking.` },
    { label: "Evolution", text: `21 protocol amendments. Zero network splits. Zero community drama.

This is what evolution looks like when your blockchain can actually evolve.` },
    { label: "Developer", text: `Self-amending protocols mean:
✅ No hard fork uncertainty
✅ No ecosystem splits
✅ Continuous improvement

21 upgrades and counting.` },
    { label: "Governance", text: `21 successful protocol votes. 100% implementation rate. 0 contentious forks.

Functional blockchain governance exists. It's called Tezos.` },
    { label: "Future", text: `While others debate hard forks, Tezos just upgrades.

21 amendments in. Infinite amendments possible. The only future-proof architecture.` },
    { label: "Process", text: `How Tezos upgrades:
1. Developer submits proposal
2. Bakers vote (80% supermajority needed)
3. Protocol activates automatically

No social consensus wars. No emergency calls. Just math.

21 times so far.` }
  ],
  hardForks: [
    { label: "Zero", text: `Hard fork count:
🏆 Tezos: 0
🟡 Algorand: 0 (foundation-controlled)
🔴 Cardano: 8+
🔴 Ethereum: 17+
🔴 Solana: Multiple outages

Zero forks. Zero splits.` },
    { label: "Unity", text: `0 hard forks = 0 ecosystem splits.

While other chains fragment their communities, Tezos keeps everyone together.` },
    { label: "Stability", text: `17+ Ethereum hard forks. Multiple Solana outages. 0 Tezos forks.

Imagine building on a platform that never breaks backward compatibility.` },
    { label: "Philosophical", text: `"Hard forks are a feature" 🤔

Tezos disagrees. 21 upgrades, 0 forks, 0 splits.

Mature governance > breaking changes.` }
  ],
  energyPerTx: [
    { label: "Climate", text: `Energy per transaction:
🟢 Tezos: <0.001 kWh
🟡 Solana: ~0.00051 kWh
🔴 Ethereum: ~0.003 kWh

Speed isn't everything. Sustainability matters.` },
    { label: "Green", text: `Building on Tezos = less energy per tx than any major PoS chain.

Your dApp's carbon footprint matters. Choose sustainable infra.` },
    { label: "Efficiency", text: `<0.001 kWh per transaction.

That's not just green — that's efficient. More throughput per watt than any major chain.` },
    { label: "ESG", text: `Corporate sustainability goals?

Tezos uses less energy per tx than Ethereum and Solana. Your CFO will thank you.` },
    { label: "Scale", text: `At scale, energy per tx compounds.

Tezos: <0.001 kWh
Ethereum: ~0.003 kWh (3x more)

~248 bakers vs 802 entities. Lean consensus, lean energy.` }
  ],
  slashing: [
    { label: "Safety", text: `Slashing comparison:
🟢 Tezos: Minimal (double-bake/attest only)
🟢 Cardano: No slashing
🟢 Solana: No slashing (delinquency)
🟢 Algorand: No slashing
🔴 Ethereum: Up to full stake

Stake without fear.` },
    { label: "Honest", text: `Ethereum can slash your entire 32 ETH stake. Tezos only penalizes provable double-baking/attesting — the minimum needed for security.

Most chains skip slashing entirely. Tezos found the middle ground.` },
    { label: "Delegator", text: `Delegating on Tezos? Your slashing risk is minimal — only triggered by provable double operations, not downtime.

Ethereum validators risk their entire 32 ETH. Different philosophy.` },
    { label: "Technical", text: `Tezos slashing is surgical: only double-baking and double-attesting are penalized. No slashing for downtime, no cascading penalties.

Security without the terror.` }
  ],
  avgTxFee: [
    { label: "Honest", text: `Transaction fees:
🟢 Solana: ~$0.005
🟡 Tezos: ~$0.01
🔴 Ethereum: ~$0.01–$0.10 (spikes to $1+)

Solana wins cost. We're cheap but not cheapest.` },
    { label: "Value", text: `Tezos fees: ~$0.01 per transaction.

Not the cheapest (Solana), not the priciest (Ethereum).

Sometimes the middle path is the right path.` },
    { label: "Reliability", text: `$0.01/tx on Tezos vs $0.005 on Solana.

Yes, we cost a bit more. But we've never had a network outage. Reliability is worth a penny.` },
    { label: "Economics", text: `~$0.01 per transaction.

Affordable enough for real apps, expensive enough to prevent spam. The sweet spot for sustainable economics.` }
  ]
};
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
        label: 'Nakamoto Coefficient',
        icon: '🛡',
        tezosLive: () => '4',
        tezosNote: () => 'bakers for 33%',
        winner: 'solana', // ~20 for 33%
        winNote: 'Most distributed stake',
    },
    {
        key: 'stakingPct',
        label: 'Staking %',
        icon: '🔒',
        tezosLive: (stats) => Number.isFinite(stats.stakingRatio) ? stats.stakingRatio.toFixed(1) + '%' : '—',
        winner: 'solana', // highest staking
        winNote: 'Highest participation',
    },
    {
        key: 'slashing',
        label: 'Slashing',
        icon: '🔪',
        tezosLive: () => CHAIN_COMPARISON.tezosStatic.slashing,
        tezosNote: () => CHAIN_COMPARISON.tezosStatic.slashingNote,
        winner: 'tezos',
        winNote: 'Minimal risk',
        lowerBetter: true,
    },
    {
        key: 'annualIssuance',
        label: 'Annual Issuance',
        icon: '📈',
        tezosLive: (stats) => Number.isFinite(stats.currentIssuanceRate) ? stats.currentIssuanceRate.toFixed(2) + '%' : '—',
        winner: 'ethereum', // lowest issuance
        winNote: 'Lowest inflation',
        lowerBetter: true,
    },
    {
        key: 'selfAmendments',
        label: 'Self-Amendments',
        icon: '🔄',
        tezosLive: (stats) => stats.protocolCount ? String(stats.protocolCount) : '21',
        winner: 'tezos',
        winNote: 'Only self-amending chain',
    },
    {
        key: 'hardForks',
        label: 'Hard Forks',
        icon: '🔀',
        tezosLive: () => CHAIN_COMPARISON.tezosStatic.hardForks,
        winner: 'tezos',
        winNote: 'Zero forks',
        lowerBetter: true,
    },
    {
        key: 'energyPerTx',
        label: 'Energy / Transaction',
        icon: '⚡',
        tezosLive: () => CHAIN_COMPARISON.tezosStatic.energyPerTx,
        winner: 'algorand',
        winNote: 'Carbon negative',
        lowerBetter: true,
    },
    {
        key: 'avgTxFee',
        label: 'Avg Transaction Fee',
        icon: '💰',
        tezosLive: (stats) => stats.avgTxFee || CHAIN_COMPARISON.tezosStatic.avgTxFee,
        winner: 'algorand',
        winNote: 'Cheapest',
        lowerBetter: true,
    },
];

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
        const tweetOptions = COMPARISON_TWEETS_PER_METRIC[metric.key] || [
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
                <div style="font-size:12px; font-weight:600; color:rgba(255,255,255,0.7); margin-bottom:8px;">${data.metricName}</div>
                <div style="display:flex; gap:6px;">
                    ${data.chains.map(c => {
                        const valColor = c.isWinner ? winColor : c.isTezos ? brand : 'rgba(255,255,255,0.5)';
                        const nameColor = c.isTezos ? brand : 'rgba(255,255,255,0.4)';
                        return `<div style="flex:1; text-align:center; padding:8px 4px; border-radius:8px;
                            background:${c.isTezos ? `rgba(${brandRgb},0.06)` : 'rgba(255,255,255,0.02)'};
                            border:1px solid ${c.isTezos ? `rgba(${brandRgb},0.15)` : 'rgba(255,255,255,0.04)'};">
                            <div style="font-size:8px; font-weight:600; text-transform:uppercase; color:${nameColor}; margin-bottom:4px;">${c.name}</div>
                            <div style="font-size:13px; font-weight:700; color:${valColor};">${c.value}</div>
                            ${c.badge ? `<div style="font-size:7px; color:${winColor}; margin-top:3px;">${c.badge}</div>` : ''}
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

        const tweetOptions = COMPARISON_TWEETS_FULL;
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
            ${data.metricName}
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
                        letter-spacing:0.5px; color:${nameColor}; margin-bottom:8px;">${c.name}</div>
                    <div style="font-size:18px; font-weight:700; color:${valColor};
                        ${c.isWinner ? `text-shadow:0 0 12px rgba(0,255,136,0.4);` : ''}">${c.value}</div>
                    ${c.note ? `<div style="font-size:10px; color:rgba(255,255,255,0.3); margin-top:4px;">${c.note}</div>` : ''}
                    ${c.badge ? `<div style="font-size:9px; font-weight:700; text-transform:uppercase;
                        letter-spacing:0.5px; color:${winColor}; background:rgba(0,255,136,0.1);
                        padding:2px 8px; border-radius:4px; margin-top:8px; display:inline-block;">${c.badge}</div>` : ''}
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
        updatedEl.textContent = 'Comparison data as of ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
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
