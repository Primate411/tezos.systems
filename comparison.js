/**
 * Tezos vs Others - Comparison Cards
 * Shows Tezos metrics side-by-side with Ethereum and Solana
 */

import { CHAIN_COMPARISON, API_URLS } from './config.js';

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
        winner: 'tezos', // ~6s deterministic finality
        winNote: 'Fastest deterministic',
    },
    {
        key: 'validators',
        label: 'Validators / Bakers',
        icon: '🏗',
        tezosLive: (stats) => stats.totalBakers ? stats.totalBakers.toLocaleString() : '—',
        winner: 'ethereum', // most validators
        winNote: 'Most decentralized',
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
    // Use the same captureCard approach — find the share module
    // For now, trigger html2canvas on the card
    const btn = cardEl.querySelector('.comparison-share-btn');
    if (btn) {
        btn.textContent = '⏳';
        btn.style.opacity = '1';
    }
    try {
        // Dynamically load html2canvas if needed
        if (typeof html2canvas === 'undefined') {
            await new Promise((resolve, reject) => {
                if (document.querySelector('script[src*="html2canvas"]')) {
                    // Already loading, wait for it
                    const check = setInterval(() => {
                        if (typeof html2canvas !== 'undefined') { clearInterval(check); resolve(); }
                    }, 100);
                    setTimeout(() => { clearInterval(check); reject(new Error('timeout')); }, 5000);
                } else {
                    const script = document.createElement('script');
                    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
                    script.onload = resolve;
                    script.onerror = reject;
                    document.head.appendChild(script);
                }
            });
        }

        const isMatrix = document.body.getAttribute('data-theme') === 'matrix';
        const bgColor = isMatrix ? '#0a0a0a' : '#0a0a0f';
        const brand = isMatrix ? '#00ff00' : '#00d4ff';

        // Create a branded wrapper for the screenshot
        const wrapper = document.createElement('div');
        wrapper.style.cssText = `
            position: fixed; top: -9999px; left: -9999px;
            width: 600px; padding: 32px;
            background: ${bgColor};
            font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'SF Pro Display', sans-serif;
            color: white;
        `;

        // Title
        const title = document.createElement('div');
        title.style.cssText = `
            font-family: 'Orbitron', sans-serif; font-size: 20px; font-weight: 900;
            color: ${brand}; letter-spacing: 3px; text-transform: uppercase;
            margin-bottom: 4px;
            text-shadow: 0 0 20px ${isMatrix ? 'rgba(0,255,0,0.5)' : 'rgba(0,212,255,0.5)'};
        `;
        title.textContent = 'TEZOS SYSTEMS';
        wrapper.appendChild(title);

        const subtitle = document.createElement('div');
        subtitle.style.cssText = `font-size: 11px; color: rgba(255,255,255,0.4); text-transform: uppercase;
            letter-spacing: 2px; margin-bottom: 20px;`;
        subtitle.textContent = 'How Tezos Compares';
        wrapper.appendChild(subtitle);

        // Clone the card
        const clone = cardEl.cloneNode(true);
        // Remove share button from clone
        const cloneBtn = clone.querySelector('.comparison-share-btn');
        if (cloneBtn) cloneBtn.remove();
        clone.style.margin = '0';
        wrapper.appendChild(clone);

        // Footer
        const footer = document.createElement('div');
        footer.style.cssText = `display: flex; justify-content: space-between; margin-top: 16px; font-size: 12px; color: rgba(255,255,255,0.3);`;
        const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const left = document.createElement('span');
        left.textContent = dateStr;
        const right = document.createElement('span');
        right.innerHTML = 'tezos.systems';
        footer.appendChild(left);
        footer.appendChild(right);
        wrapper.appendChild(footer);

        document.body.appendChild(wrapper);

        const canvas = await html2canvas(wrapper, {
            backgroundColor: bgColor, scale: 2, useCORS: true, logging: false,
            width: 600, windowWidth: 600
        });
        wrapper.remove();

        // Simple share: download
        const link = document.createElement('a');
        link.download = 'tezos-vs-' + metric.key + '.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
    } catch (err) {
        console.error('Comparison card share failed:', err);
    } finally {
        if (btn) {
            btn.textContent = '📸';
            btn.style.opacity = '';
        }
    }
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
}

/**
 * Update comparison with fresh stats (called after data refresh)
 */
export function updateComparison(stats) {
    initComparison(stats);
}
