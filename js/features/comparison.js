/**
 * Tezos vs Others - Comparison Cards
 * Shows Tezos metrics side-by-side with Ethereum and Solana
 */

const COMPARISON_CAPTURE_SCALE = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ? 1 : 2;

import { CHAIN_COMPARISON, API_URLS } from '../core/config.js';

// --- Full comparison tweet options ---
const COMPARISON_TWEETS_FULL = [
    { label: 'Data Drop', text: 'The blockchain trilemma, quantified:\n\n🔹 Tezos: 0 hard forks, 21 upgrades, deterministic finality\n🔹 Ethereum: 14+ forks, ~13min finality\n🔹 Solana: Fast blocks, but multiple outages\n\ntezos.systems' },
    { label: 'Flex', text: '21 seamless protocol upgrades. Zero network splits. Deterministic 12s finality.\n\nWhile others fork and fragment, Tezos evolves.\n\ntezos.systems' },
    { label: 'Dunk', text: 'Ethereum: 14+ hard forks 📈\nSolana: Multiple outages 🍴\nTezos: Zero forks. Zero downtime. 🎯\n\nSome chains break to upgrade. Others just... upgrade.\n\ntezos.systems' },
    { label: 'Understated', text: 'Not the fastest. Not the cheapest. But 0 hard forks, deterministic finality, and the lowest energy per tx of any major chain.\n\nSometimes steady wins.\n\ntezos.systems' },
    { label: 'Question', text: 'Your chain has had how many hard forks again? 🤔\n\nTezos: 21 protocol upgrades, 0 network splits.\n\ntezos.systems' },
    { label: 'Recruit', text: 'Building on a chain that forks every upgrade? There\'s a better way.\n\n✅ Self-amending protocols\n✅ Deterministic finality\n✅ Zero breaking changes\n\ntezos.systems' },
    { label: 'Data Drop', text: 'Energy per transaction:\n🟢 Tezos: <0.001 kWh\n🟡 Ethereum: 0.003 kWh\n🔴 Solana: 0.00051 kWh\n\nEfficiency matters.\n\ntezos.systems' },
    { label: 'Flex', text: 'Deterministic finality in 12 seconds. Not "probabilistic eventually." Not "2 epochs."\n\nActual finality. Guaranteed.\n\ntezos.systems' },
    { label: 'Dunk', text: '2 entities control 50% of Ethereum consensus 👀\n\nMeanwhile Tezos has governed 21 protocol upgrades via on-chain voting without a single contentious fork.\n\ntezos.systems' },
    { label: 'Understated', text: 'We\'re not winning block time (Solana\'s faster). We\'re not winning fees (Solana\'s cheaper).\n\nBut we\'ve never forked and upgrade seamlessly.\n\ntezos.systems' },
    { label: 'Question', text: 'What\'s more decentralized: a chain where 2 entities control 50%, or one where governance has coordinated 21+ upgrades without a single fork?\n\ntezos.systems' },
    { label: 'Recruit', text: 'Climate-conscious devs: Tezos uses less energy per tx than any major PoS chain. Zero hard forks means zero wasted effort.\n\nBuild sustainably:\ntezos.systems' },
    { label: 'Data Drop', text: 'Self-amendment scoreboard:\n🏆 Tezos: 21+ successful upgrades\n❌ Ethereum: 0 (hard forks only)\n❌ Solana: 0 (no on-chain governance)\n\ntezos.systems' },
    { label: 'Flex', text: 'Don\'t choose between fast, cheap, or decentralized.\n\nChoose deterministic finality, self-amendment, and zero forks.\n\ntezos.systems' },
    { label: 'Dunk', text: 'Yes, Solana is faster and cheaper. Yes, Ethereum has more TVL.\n\nBut when they break (and they do), Tezos keeps building. 21 upgrades, 0 forks.\n\ntezos.systems' },
];

// --- Per-metric tweet options ---
const COMPARISON_TWEETS_PER_METRIC = {
    blockTime: [
        { label: 'Honest', text: 'Block time:\n🔴 Tezos: ~6s\n🟡 Ethereum: ~12s\n🟢 Solana: ~0.4s\n\nSolana wins speed. But our blocks are deterministically final in ~12s total.' },
        { label: 'Tradeoff', text: 'Tezos blocks: ~6 seconds, deterministically final in 12s.\nSolana blocks: 0.4 seconds, 6.4s to confirmed.\n\nConsistent finality > raw speed.' },
        { label: 'Technical', text: 'We\'re not the fastest at ~6s blocks. But every block is guaranteed final within 12s. No reorgs, no "eventual consistency."' },
        { label: 'Competitive', text: '6-second blocks powering 21 seamless protocol upgrades without a single fork.\n\nStability has its own velocity.' },
    ],
    finality: [
        { label: 'Data Drop', text: 'Finality:\n🏆 Tezos: 12s deterministic\n⏳ Ethereum: ~13 min (2 epochs)\n⚡ Solana: ~6.4s probabilistic\n\nDeterministic = guaranteed. No takebacks.' },
        { label: 'Developer', text: 'Deterministic finality in 12 seconds. Not "probably final." Not "economically final."\n\nMathematically guaranteed finality.\n\nThis is what serious DeFi needs.' },
        { label: 'Dunk', text: 'Ethereum: "Final in 13 min... probably"\nSolana: "Final in 6s... we think"\nTezos: "Final in 12s. Guaranteed."\n\nDeterministic > probabilistic.' },
        { label: 'Business', text: 'Instant finality matters:\n• No transaction reversals\n• No reorg risk\n• No "economic finality" guesswork\n\nTezos: 12s deterministic finality. Every time.' },
    ],
    validators: [
        { label: 'Honest', text: 'Nakamoto Coefficient:\n🔴 Tezos: 4 bakers for 33%\n🟡 Ethereum: ~2 entities for 50%\n🟢 Solana: ~20 for 33%\n\nSolana\'s more distributed by this metric.' },
        { label: 'Context', text: 'Yes, Solana has a higher Nakamoto coefficient (~20 vs our 4). But they\'ve also had multiple outages.\n\nDecentralization isn\'t just validator count — it\'s reliability.' },
        { label: 'Governance', text: '4 bakers for 33% of Tezos validation. Room to improve.\n\nBut these validators have governed 21+ upgrades without a single contentious fork. That\'s coordination, not capture.' },
        { label: 'Realistic', text: 'Nakamoto coefficient: 4 for Tezos vs ~20 for Solana.\n\nWe\'re working on it. But we\'ve never halted, and our governance actually works.' },
    ],
    stakingPct: [
        { label: 'Participation', text: 'Staking participation:\n🟢 Solana: ~65%\n🟡 Ethereum: ~28%\n🔄 Tezos: Live data\n\nHigh participation = strong security. Check tezos.systems for live numbers.' },
        { label: 'Governance', text: 'Our stakers don\'t just secure the network — they govern it.\n\n21 successful protocol votes. 0 contentious forks. That\'s engaged staking.' },
        { label: 'Quality', text: 'Staking isn\'t just about percentages — it\'s about quality.\n\nTezos stakers have voted through 21 protocol upgrades. Active governance, not passive yield farming.' },
    ],
    annualIssuance: [
        { label: 'Data Drop', text: 'Annual issuance:\n🟢 Ethereum: ~0.5%\n🔄 Tezos: Adaptive\n🔴 Solana: ~5.4%\n\nETH wins lowest inflation. But deflationary isn\'t always better — networks need incentives.' },
        { label: 'Sustainable', text: 'Low inflation sounds good until your network can\'t fund development.\n\nTezos adaptive issuance funds both security AND evolution. That\'s how we ship upgrades.' },
        { label: 'Honest', text: 'Ethereum\'s ~0.5% issuance wins the inflation game.\n\nTezos trades higher issuance for sustainable protocol development and baker incentives. Different priorities.' },
    ],
    selfAmendments: [
        { label: 'Victory', text: 'Self-amendment scoreboard:\n🏆 Tezos: 21+ upgrades\n❌ Ethereum: 0 (hard forks only)\n❌ Solana: 0\n\nOnly one chain evolves without breaking.' },
        { label: 'Evolution', text: '21 protocol amendments. Zero network splits. Zero community drama.\n\nThis is what evolution looks like when your blockchain can actually evolve.' },
        { label: 'Developer', text: 'Self-amending protocols mean:\n✅ No hard fork uncertainty\n✅ No ecosystem splits\n✅ Continuous improvement\n\n21 upgrades and counting.' },
        { label: 'Governance', text: '21 successful protocol votes. 100% implementation rate. 0 contentious forks.\n\nFunctional blockchain governance exists. It\'s called Tezos.' },
        { label: 'Future', text: 'While others debate hard forks, Tezos just upgrades.\n\n21 amendments in. Infinite amendments possible. The only future-proof architecture.' },
    ],
    hardForks: [
        { label: 'Zero', text: 'Hard fork count:\n🏆 Tezos: 0\n🔴 Ethereum: 14+\n🔴 Solana: Multiple outages\n\nZero forks. Zero splits. Evolution > revolution.' },
        { label: 'Unity', text: '0 hard forks = 0 ecosystem splits.\n\nWhile other chains fragment their communities, Tezos keeps everyone together.' },
        { label: 'Stability', text: '14+ Ethereum hard forks. Multiple Solana outages. 0 Tezos forks.\n\nImagine building on a platform that never breaks backward compatibility.' },
        { label: 'Philosophical', text: '"Hard forks are a feature" 🤔\n\nTezos disagrees. 21 upgrades, 0 forks, 0 splits.\n\nMature governance > breaking changes.' },
    ],
    energyPerTx: [
        { label: 'Climate', text: 'Energy per transaction:\n🟢 Tezos: <0.001 kWh\n🟡 Ethereum: 0.003 kWh\n🔴 Solana: 0.00051 kWh\n\nSpeed isn\'t everything. Sustainability matters.' },
        { label: 'Green', text: 'Building on Tezos = less energy per tx than any major PoS chain.\n\nYour dApp\'s carbon footprint matters. Choose sustainable infra.' },
        { label: 'Efficiency', text: '<0.001 kWh per transaction.\n\nThat\'s not just green — that\'s efficient. More throughput per watt than any major chain.' },
        { label: 'ESG', text: 'Corporate sustainability goals?\n\nTezos uses less energy per tx than Ethereum and Solana. Your CFO will thank you.' },
    ],
    avgTxFee: [
        { label: 'Honest', text: 'Transaction fees:\n🟢 Solana: ~$0.005\n🟡 Tezos: ~$0.01\n🔴 Ethereum: $1–5\n\nSolana wins cost. We\'re cheap but not cheapest. Middle ground has its place.' },
        { label: 'Value', text: 'Tezos fees: ~$0.01 per transaction.\n\nNot the cheapest (Solana), not the priciest (Ethereum).\n\nSometimes the middle path is the right path.' },
        { label: 'Reliability', text: '$0.01/tx on Tezos vs $0.005 on Solana.\n\nYes, we cost a bit more. But we\'ve never had a network outage. Reliability is worth a penny.' },
        { label: 'Economics', text: '~$0.01 per transaction.\n\nAffordable enough for real apps, expensive enough to prevent spam. The sweet spot for sustainable economics.' },
    ],
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
        winner: 'tezos', // ~12s deterministic finality vs Solana probabilistic
        winNote: 'Deterministic',
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
        tezosLive: (stats) => stats.stakingRatio ? stats.stakingRatio.toFixed(1) + '%' : '—',
        winner: 'solana', // highest staking
        winNote: 'Highest participation',
    },
    {
        key: 'annualIssuance',
        label: 'Annual Issuance',
        icon: '📈',
        tezosLive: (stats) => stats.currentIssuanceRate ? stats.currentIssuanceRate.toFixed(2) + '%' : '—',
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
        winner: 'tezos',
        winNote: 'Most efficient',
        lowerBetter: true,
    },
    {
        key: 'avgTxFee',
        label: 'Avg Transaction Fee',
        icon: '💰',
        tezosLive: (stats) => stats.avgTxFee || CHAIN_COMPARISON.tezosStatic.avgTxFee,
        winner: 'solana',
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
    const chains = [
        { name: 'Tezos', value: tezosValue, note: tezosNote, cls: 'tezos', isWinner: metric.winner === 'tezos' },
        { name: 'Ethereum', value: ethValue, note: ethNote, cls: 'ethereum', isWinner: metric.winner === 'ethereum' },
        { name: 'Solana', value: solValue, note: solNote, cls: 'solana', isWinner: metric.winner === 'solana' },
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
            width: 600px; padding: 32px;
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

        // Clone all comparison cards
        const cards = document.querySelectorAll('.comparison-card');
        const grid = document.createElement('div');
        grid.style.cssText = 'display:flex; flex-direction:column; gap:12px;';
        cards.forEach(card => {
            const clone = card.cloneNode(true);
            const btn = clone.querySelector('.comparison-share-btn');
            if (btn) btn.remove();
            clone.style.margin = '0';
            grid.appendChild(clone);
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
            width: 600, windowWidth: 600
        });
        wrapper.remove();

        const tweetOptions = COMPARISON_TWEETS_FULL;
        showShareModal(canvas, tweetOptions, 'How Tezos Compares');
    } catch (err) {
        console.error('All comparisons share failed:', err);
    }
}

/**
 * Capture a single comparison card as an image
 */
async function captureComparisonImage(cardEl, label) {
    await loadHtml2Canvas();
    const isMatrix = document.body.getAttribute('data-theme') === 'matrix';
    const bgColor = isMatrix ? '#0a0a0a' : '#0a0a0f';
    const brand = isMatrix ? '#00ff00' : '#00d4ff';
    const brandRgb = isMatrix ? '0,255,0' : '0,212,255';

    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
        position: fixed; top: -9999px; left: -9999px;
        width: 600px; padding: 32px;
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

    const clone = cardEl.cloneNode(true);
    const cloneBtn = clone.querySelector('.comparison-share-btn');
    if (cloneBtn) cloneBtn.remove();
    clone.style.margin = '0';
    wrapper.appendChild(clone);

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
        width: 600, windowWidth: 600
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
        updatedEl.textContent = 'ETH/SOL data as of ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
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
