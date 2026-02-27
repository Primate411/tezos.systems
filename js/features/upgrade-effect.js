/**
 * Upgrade Effect — Protocol-indexed impact visualization
 * Step chart showing how key metrics changed with each protocol upgrade
 * Uses hardcoded historical data (from TzKT statistics/daily at activation dates)
 */

import { getCurrentTheme } from '../ui/theme.js';

let chartInstance = null;
let currentMetric = 'blockTime';

// Protocol data with metrics at activation
// blockTime: seconds, minStake: XTZ, bakers: count, supply: mutez, consensus: name
const PROTOCOLS = [
    { name: 'Athens',    letter: 'A', date: '2019-05', blockTime: 60, minStake: 10000, bakers: 526, supply: 797566025, consensus: 'Emmy' },
    { name: 'Babylon',   letter: 'B', date: '2019-10', blockTime: 60, minStake: 8000,  bakers: 481, supply: 812838220, consensus: 'Emmy+' },
    { name: 'Carthage',  letter: 'C', date: '2020-03', blockTime: 60, minStake: 8000,  bakers: 479, supply: 828053118, consensus: 'Emmy+' },
    { name: 'Delphi',    letter: 'D', date: '2020-11', blockTime: 60, minStake: 8000,  bakers: 424, supply: 856206445, consensus: 'Emmy+' },
    { name: 'Edo',       letter: 'E', date: '2021-02', blockTime: 60, minStake: 8000,  bakers: 423, supply: 866222987, consensus: 'Emmy+' },
    { name: 'Florence',  letter: 'F', date: '2021-05', blockTime: 60, minStake: 8000,  bakers: 427, supply: 875760908, consensus: 'Emmy+' },
    { name: 'Granada',   letter: 'G', date: '2021-08', blockTime: 30, minStake: 8000,  bakers: 399, supply: 884977172, consensus: 'Emmy*' },
    { name: 'Hangzhou',  letter: 'H', date: '2021-12', blockTime: 30, minStake: 8000,  bakers: 385, supply: 898046791, consensus: 'Emmy*' },
    { name: 'Ithaca',    letter: 'I', date: '2022-04', blockTime: 15, minStake: 6000,  bakers: 408, supply: 911276170, consensus: 'Tenderbake' },
    { name: 'Jakarta',   letter: 'J', date: '2022-06', blockTime: 15, minStake: 6000,  bakers: 402, supply: 921277451, consensus: 'Tenderbake' },
    { name: 'Kathmandu', letter: 'K', date: '2022-09', blockTime: 15, minStake: 6000,  bakers: 407, supply: 931498510, consensus: 'Tenderbake' },
    { name: 'Lima',      letter: 'L', date: '2022-12', blockTime: 15, minStake: 6000,  bakers: 407, supply: 941790169, consensus: 'Tenderbake' },
    { name: 'Mumbai',    letter: 'M', date: '2023-03', blockTime: 15, minStake: 6000,  bakers: 421, supply: 953713142, consensus: 'Tenderbake' },
    { name: 'Nairobi',   letter: 'N', date: '2023-06', blockTime: 15, minStake: 6000,  bakers: 417, supply: 964008602, consensus: 'Tenderbake' },
    { name: 'Oxford',    letter: 'O', date: '2024-02', blockTime: 15, minStake: 6000,  bakers: 404, supply: 991337925, consensus: 'Tenderbake' },
    { name: 'Paris',     letter: 'P', date: '2024-06', blockTime: 10, minStake: 6000,  bakers: 363, supply: 1004894530, consensus: 'Tenderbake' },
    { name: 'Quebec',    letter: 'Q', date: '2025-01', blockTime: 8,  minStake: 6000,  bakers: 293, supply: 1046218589, consensus: 'Tenderbake' },
    { name: 'Rio',       letter: 'R', date: '2025-05', blockTime: 8,  minStake: 6000,  bakers: 292, supply: 1061902537, consensus: 'Tenderbake' },
    { name: 'Seoul',     letter: 'S', date: '2025-09', blockTime: 8,  minStake: 6000,  bakers: 267, supply: 1079110335, consensus: 'Tenderbake' },
    { name: 'Tallinn',   letter: 'T', date: '2026-01', blockTime: 6,  minStake: 6000,  bakers: 262, supply: 1093238688, consensus: 'Tenderbake' },
];

const METRICS = [
    { key: 'blockTime', label: 'Block Time', unit: 's', format: v => v + 's', story: '60s → 6s — 10x faster blocks through governance' },
    { key: 'bakers', label: 'Active Bakers', unit: '', format: v => v.toLocaleString(), story: 'Baker count from genesis to today' },
    { key: 'supply', label: 'Total Supply', unit: 'M ꜩ', format: v => (v / 1e6).toFixed(1) + 'M', story: 'XTZ supply growth through inflation' },
    { key: 'minStake', label: 'Min Stake', unit: ' ꜩ', format: v => v.toLocaleString() + ' ꜩ', story: '10K → 8K → 6K — progressively lowered barrier' },
    { key: 'finality', label: 'Finality Time', unit: 's', format: v => v + 's', story: 'From minutes to 12 seconds — deterministic', compute: p => p.blockTime * 2 },
    { key: 'blocksPerDay', label: 'Blocks/Day', unit: '', format: v => v.toLocaleString(), story: 'Network throughput capacity over time', compute: p => Math.round(86400 / p.blockTime) },
];

/**
 * Get theme-aware colors
 */
function getColors() {
    const theme = getCurrentTheme();
    const map = {
        matrix: { bar: '#00ff41', barBg: 'rgba(0,255,65,0.15)', step: 'rgba(0,255,0,0.6)', text: '#00ff00', grid: 'rgba(0,255,0,0.08)', highlight: '#00ff88' },
        dark: { bar: '#888', barBg: 'rgba(153,153,153,0.12)', step: 'rgba(200,200,200,0.4)', text: '#aaa', grid: 'rgba(255,255,255,0.05)', highlight: '#ccc' },
        clean: { bar: '#2563EB', barBg: 'rgba(37,99,235,0.12)', step: 'rgba(37,99,235,0.4)', text: '#555', grid: 'rgba(0,0,0,0.05)', highlight: '#1d4ed8' },
        bubblegum: { bar: '#FF69B4', barBg: 'rgba(255,105,180,0.12)', step: 'rgba(255,105,180,0.4)', text: '#F0E0F6', grid: 'rgba(255,105,180,0.05)', highlight: '#ff1493' },
        void: { bar: '#a855f7', barBg: 'rgba(168,85,247,0.12)', step: 'rgba(168,85,247,0.4)', text: '#d0c0e0', grid: 'rgba(168,85,247,0.05)', highlight: '#7c3aed' },
        ember: { bar: '#f97316', barBg: 'rgba(249,115,22,0.12)', step: 'rgba(249,115,22,0.4)', text: '#fde0c0', grid: 'rgba(249,115,22,0.05)', highlight: '#ea580c' },
        signal: { bar: '#22c55e', barBg: 'rgba(34,197,94,0.12)', step: 'rgba(34,197,94,0.4)', text: '#c0e8d0', grid: 'rgba(34,197,94,0.05)', highlight: '#16a34a' },
    };
    return map[theme] || { bar: '#00d4ff', barBg: 'rgba(0,212,255,0.12)', step: 'rgba(0,212,255,0.4)', text: '#e8e8f0', grid: 'rgba(255,255,255,0.05)', highlight: '#00b8db' };
}

/**
 * Get value for a metric from a protocol entry
 */
function getValue(protocol, metricKey) {
    const metric = METRICS.find(m => m.key === metricKey);
    if (metric?.compute) return metric.compute(protocol);
    return protocol[metricKey];
}

/**
 * Detect where value changed (for highlighting step changes)
 */
function getChangeIndices(metricKey) {
    const changes = [];
    for (let i = 1; i < PROTOCOLS.length; i++) {
        if (getValue(PROTOCOLS[i], metricKey) !== getValue(PROTOCOLS[i-1], metricKey)) {
            changes.push(i);
        }
    }
    return changes;
}

/**
 * Render the step chart
 */
function renderChart(container, metricKey) {
    const canvasId = 'upgrade-effect-canvas';
    let canvas = document.getElementById(canvasId);
    if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.id = canvasId;
        canvas.style.cssText = 'width:100%; height:280px;';
        container.innerHTML = '';
        container.appendChild(canvas);
    }

    if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
    }

    const colors = getColors();
    const metric = METRICS.find(m => m.key === metricKey);
    const values = PROTOCOLS.map(p => getValue(p, metricKey));
    const labels = PROTOCOLS.map(p => p.letter);
    const changeIndices = new Set(getChangeIndices(metricKey));

    // Color bars: highlight protocols where value changed
    const barColors = PROTOCOLS.map((_, i) =>
        changeIndices.has(i) ? colors.highlight : colors.bar
    );
    const barBgColors = PROTOCOLS.map((_, i) =>
        changeIndices.has(i) ? colors.bar : colors.barBg
    );

    const ctx = canvas.getContext('2d');
    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: barBgColors,
                borderColor: barColors,
                borderWidth: 2,
                borderRadius: 4,
                maxBarThickness: 36,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 8 } },
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(0,0,0,0.9)',
                    titleFont: { size: 12, family: 'Orbitron' },
                    bodyFont: { size: 11 },
                    callbacks: {
                        title: (items) => {
                            const idx = items[0].dataIndex;
                            const p = PROTOCOLS[idx];
                            return `${p.name} (${p.date})`;
                        },
                        label: (item) => {
                            const val = item.parsed.y;
                            return `${metric.label}: ${metric.format(val)}`;
                        },
                        afterLabel: (item) => {
                            const idx = item.dataIndex;
                            if (idx > 0) {
                                const prev = getValue(PROTOCOLS[idx-1], metricKey);
                                const curr = getValue(PROTOCOLS[idx], metricKey);
                                if (curr !== prev) {
                                    const pct = ((curr - prev) / prev * 100).toFixed(1);
                                    const sign = curr > prev ? '+' : '';
                                    return `Change: ${sign}${pct}%`;
                                }
                            }
                            return '';
                        }
                    }
                },
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: {
                        color: colors.text,
                        font: { size: 11, family: 'Orbitron', weight: '700' },
                    },
                    border: { display: false }
                },
                y: {
                    grid: { color: colors.grid },
                    ticks: {
                        color: colors.text,
                        font: { size: 10 },
                        callback: (val) => metric.format(val)
                    },
                    border: { display: false },
                    grace: '10%',
                    beginAtZero: metricKey === 'blockTime' || metricKey === 'finality' || metricKey === 'minStake',
                }
            }
        }
    });

    // Update story text
    const storyEl = document.getElementById('upgrade-effect-story');
    if (storyEl) storyEl.textContent = metric.story;
}

/**
 * Build the metric selector pills
 */
function buildPills(container, onSelect) {
    const pills = document.createElement('div');
    pills.className = 'upgrade-effect-pills';

    METRICS.forEach(m => {
        const btn = document.createElement('button');
        btn.className = 'upgrade-effect-pill' + (m.key === currentMetric ? ' active' : '');
        btn.textContent = m.label;
        btn.addEventListener('click', () => {
            currentMetric = m.key;
            pills.querySelectorAll('.upgrade-effect-pill').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            onSelect(m.key);
        });
        pills.appendChild(btn);
    });

    container.appendChild(pills);
}

/**
 * Initialize the Upgrade Effect panel
 */
export function initUpgradeEffect() {
    const timelineEl = document.getElementById('upgrade-timeline');
    if (!timelineEl) return;

    // Prevent duplicate init
    if (document.getElementById('upgrade-effect-panel')) return;

    const upgradeCount = document.querySelector('.upgrade-count');
    if (!upgradeCount) return;

    // Toggle button
    const toggleDiv = document.createElement('div');
    toggleDiv.className = 'infographic-toggle';
    toggleDiv.innerHTML = '<button class="infographic-toggle-btn upgrade-effect-toggle-btn">View Impact ▾</button>';
    upgradeCount.appendChild(toggleDiv);

    // Panel
    const panel = document.createElement('div');
    panel.id = 'upgrade-effect-panel';
    panel.className = 'upgrade-effect-panel';
    timelineEl.appendChild(panel);

    // Pills
    buildPills(panel, (metric) => {
        renderChart(chartContainer, metric);
    });

    // Story line
    const story = document.createElement('div');
    story.id = 'upgrade-effect-story';
    story.className = 'upgrade-effect-story';
    story.textContent = METRICS[0].story;
    panel.appendChild(story);

    // Chart container
    const chartContainer = document.createElement('div');
    chartContainer.className = 'upgrade-effect-chart';
    chartContainer.id = 'upgrade-effect-chart';
    panel.appendChild(chartContainer);

    // Toggle
    const btn = toggleDiv.querySelector('.upgrade-effect-toggle-btn');
    btn.addEventListener('click', () => {
        const expanded = panel.classList.toggle('expanded');
        btn.textContent = expanded ? 'Hide Impact ▴' : 'View Impact ▾';
        if (expanded) {
            renderChart(chartContainer, currentMetric);
        }
    });
}
