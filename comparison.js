/**
 * Tezos vs Others - Comparison Cards
 * Shows Tezos metrics side-by-side with Ethereum and Solana
 */

import { CHAIN_COMPARISON, API_URLS } from './config.js';
import { loadHtml2Canvas, showShareModal } from './share.js';

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
        const tweetOptions = [
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
            backgroundColor: bgColor, scale: 2, useCORS: true, logging: false,
            width: 600, windowWidth: 600
        });
        wrapper.remove();

        const tweetOptions = [
            { label: 'Data Drop', text: 'Tezos vs Ethereum vs Solana — the numbers speak for themselves\n\ntezos.systems' },
            { label: 'Flex', text: '21 self-amendments. Zero hard forks. 6-second finality. How does your chain compare?\n\ntezos.systems' },
            { label: 'Understated', text: 'Side by side, metric by metric. Tezos holds its own against the biggest chains.\n\ntezos.systems' }
        ];
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
        backgroundColor: bgColor, scale: 2, useCORS: true, logging: false,
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
