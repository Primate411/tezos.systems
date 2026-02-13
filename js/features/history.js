// Historical data visualization module
// Handles sparklines and full charts using Chart.js

import { fetchHistoricalData } from '../core/api.js';
import { getCurrentTheme } from '../ui/theme.js';

// Store chart instances for cleanup
const chartInstances = {};

// Create mini sparkline for stat cards
export function createSparkline(canvasId, data, metric) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    // Extract values and timestamps
    const values = data.map(d => d[metric]);
    const timestamps = data.map(d => new Date(d.timestamp));

    // Determine color based on trend and theme
    const firstValue = values[0];
    const lastValue = values[values.length - 1];
    const isPositive = lastValue >= firstValue;
    const isMatrix = getCurrentTheme() === 'matrix';

    // Theme-aware sparkline colors
    const currentThemeVal = getCurrentTheme();
    let lineColor;
    if (currentThemeVal === 'matrix') {
        lineColor = '#00ff41';
    } else if (currentThemeVal === 'dark') {
        // Achromatic: light gray for positive, dimmer gray for negative
        lineColor = isPositive ? '#999999' : '#666666';
    } else if (currentThemeVal === 'clean') {
        lineColor = isPositive ? '#0784c3' : '#dc3545';
    } else if (currentThemeVal === 'bubblegum') {
        lineColor = isPositive ? '#FF69B4' : '#FF5E8A';
    } else if (currentThemeVal === 'void') {
        lineColor = isPositive ? '#a855f7' : '#7c3aed';
    } else if (currentThemeVal === 'ember') {
        lineColor = isPositive ? '#f97316' : '#dc2626';
    } else if (currentThemeVal === 'signal') {
        lineColor = isPositive ? '#22c55e' : '#ef4444';
    } else {
        // default theme
        lineColor = isPositive ? '#00d4ff' : '#ff6b9d';
    }

    const ctx = canvas.getContext('2d');
    // Destroy existing chart so it picks up fresh options (e.g. grace)
    if (chartInstances[canvasId]) {
        chartInstances[canvasId].destroy();
        delete chartInstances[canvasId];
    }

    chartInstances[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: timestamps,
            datasets: [{
                data: values,
                borderColor: lineColor,
                borderWidth: 2,
                fill: true,
                backgroundColor: lineColor + '33',  // 20% opacity
                pointRadius: 0,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 15, bottom: 2 } },
            animation: { duration: 500 },  // Shorter initial animation
            plugins: {
                legend: { display: false },
                tooltip: {
                    enabled: true,
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: lineColor,
                    bodyColor: '#fff',
                    borderColor: lineColor,
                    borderWidth: 1,
                    padding: 8,
                    displayColors: false,
                    callbacks: {
                        title: (items) => {
                            const date = new Date(items[0].label);
                            return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                        },
                        label: (item) => item.formattedValue
                    }
                }
            },
            scales: {
                x: { display: false },
                y: {
                    display: false,
                    grace: '30%'
                }
            },
            interaction: { mode: 'index', intersect: false }
        }
    });
}

// Calculate stats for a metric
function calculateStats(data, metric) {
    const values = data.map(d => d[metric]).filter(v => v != null);
    if (values.length === 0) return null;
    
    const current = values[values.length - 1];
    const first = values[0];
    const high = Math.max(...values);
    const low = Math.min(...values);
    const change = first !== 0 ? ((current - first) / first) * 100 : 0;
    
    return { current, high, low, change };
}

// Create detailed line chart for history modal
export function createFullChart(canvasId, data, metric, label, unit = '') {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    // Destroy existing chart if any
    if (chartInstances[canvasId]) {
        chartInstances[canvasId].destroy();
    }

    // Extract values and timestamps
    const values = data.map(d => d[metric]);
    const timestamps = data.map(d => new Date(d.timestamp));
    
    // Calculate stats for this metric
    const stats = calculateStats(data, metric);
    
    // Update stats display if element exists
    const statsEl = document.getElementById(`stats-${canvasId}`);
    if (statsEl && stats) {
        const changeClass = stats.change > 0 ? 'positive' : stats.change < 0 ? 'negative' : 'neutral';
        const changeArrow = stats.change > 0 ? '↑' : stats.change < 0 ? '↓' : '→';
        statsEl.innerHTML = `
            <span class="stat-item">
                <span class="stat-label">Change</span>
                <span class="stat-value ${changeClass}">${changeArrow} ${Math.abs(stats.change).toFixed(2)}%</span>
            </span>
            <span class="stat-item">
                <span class="stat-label">High</span>
                <span class="stat-value">${stats.high.toFixed(2)}${unit}</span>
            </span>
            <span class="stat-item">
                <span class="stat-label">Low</span>
                <span class="stat-value">${stats.low.toFixed(2)}${unit}</span>
            </span>
        `;
    }

    // Check theme for colors
    const expandedTheme = getCurrentTheme();
    const themeColorMap = {
        matrix:    { primary: '#00ff00',  glow: 'rgba(0, 255, 0, 0.8)',    fill: [0.4, 0.15] },
        dark:      { primary: '#999999',  glow: 'rgba(153, 153, 153, 0.8)', fill: [0.25, 0.08] },
        clean:     { primary: '#0784c3',  glow: 'rgba(7, 132, 195, 0.8)',  fill: [0.3, 0.1] },
        bubblegum: { primary: '#FF69B4',  glow: 'rgba(255, 105, 180, 0.8)', fill: [0.35, 0.12] },
        void:      { primary: '#a855f7',  glow: 'rgba(168, 85, 247, 0.8)', fill: [0.35, 0.12] },
        ember:     { primary: '#f97316',  glow: 'rgba(249, 115, 22, 0.8)', fill: [0.35, 0.12] },
        signal:    { primary: '#22c55e',  glow: 'rgba(34, 197, 94, 0.8)',  fill: [0.35, 0.12] },
        default:   { primary: '#00d4ff',  glow: 'rgba(0, 212, 255, 0.8)', fill: [0.4, 0.15] }
    };
    const tc = themeColorMap[expandedTheme] || themeColorMap.default;
    const primaryColor = tc.primary;
    const glowColor = tc.glow;

    // Gradient fill
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, primaryColor + Math.round(tc.fill[0] * 255).toString(16).padStart(2, '0'));
    gradient.addColorStop(0.5, primaryColor + Math.round(tc.fill[1] * 255).toString(16).padStart(2, '0'));
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    chartInstances[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: timestamps,
            datasets: [{
                label: label,
                data: values,
                borderColor: primaryColor,
                backgroundColor: gradient,
                borderWidth: 3,
                fill: true,
                pointRadius: 0,
                pointHoverRadius: 8,
                pointHoverBackgroundColor: primaryColor,
                pointHoverBorderColor: '#fff',
                pointHoverBorderWidth: 2,
                tension: 0.4,
                // Glow effect via shadow
                borderCapStyle: 'round',
                borderJoinStyle: 'round'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 1500,
                easing: 'easeOutQuart',
                delay: (context) => context.dataIndex * 10
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    enabled: true,
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(0, 0, 0, 0.9)',
                    titleColor: primaryColor,
                    bodyColor: '#fff',
                    borderColor: primaryColor,
                    borderWidth: 2,
                    cornerRadius: 8,
                    padding: 12,
                    titleFont: { size: 14, weight: 'bold' },
                    bodyFont: { size: 16, weight: 'bold' },
                    displayColors: false,
                    callbacks: {
                        label: (context) => {
                            const val = context.parsed.y;
                            return `${val.toLocaleString(undefined, {maximumFractionDigits: 2})}${unit}`;
                        },
                        title: (contexts) => {
                            const date = new Date(contexts[0].label);
                            return date.toLocaleString('en-US', {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                            });
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'hour',
                        displayFormats: {
                            hour: 'MMM d, ha'
                        }
                    },
                    grid: {
                        color: expandedTheme === 'clean' ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.05)',
                        drawBorder: false
                    },
                    ticks: {
                        color: expandedTheme === 'clean' ? 'rgba(0, 0, 0, 0.5)' : 'rgba(255, 255, 255, 0.5)',
                        font: { size: 11 },
                        maxRotation: 0
                    }
                },
                y: {
                    beginAtZero: false,
                    grid: {
                        color: expandedTheme === 'clean' ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.05)',
                        drawBorder: false
                    },
                    ticks: {
                        color: expandedTheme === 'clean' ? 'rgba(0, 0, 0, 0.5)' : 'rgba(255, 255, 255, 0.5)',
                        font: { size: 11 },
                        callback: (value) => value.toLocaleString(undefined, {maximumFractionDigits: 1}) + unit,
                        padding: 10
                    }
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            },
            elements: {
                line: {
                    borderCapStyle: 'round'
                }
            }
        },
        plugins: [{
            // Custom plugin for glow effect
            id: 'glowEffect',
            beforeDatasetsDraw: (chart) => {
                const ctx = chart.ctx;
                ctx.save();
                ctx.shadowColor = glowColor;
                ctx.shadowBlur = 15;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
            },
            afterDatasetsDraw: (chart) => {
                chart.ctx.restore();
            }
        }]
    });
}

// Calculate 7-day trend from data
function calculateTrend(data, metric) {
    if (data.length < 2) return null;
    
    const now = Date.now();
    const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
    
    // Get current value (latest)
    const currentValue = data[data.length - 1][metric];
    
    // Find value closest to 7 days ago
    let weekAgoValue = data[0][metric]; // fallback to oldest
    for (let i = data.length - 1; i >= 0; i--) {
        const timestamp = new Date(data[i].timestamp).getTime();
        if (timestamp <= sevenDaysAgo) {
            weekAgoValue = data[i][metric];
            break;
        }
    }
    
    if (weekAgoValue === 0) return null;
    
    const change = ((currentValue - weekAgoValue) / weekAgoValue) * 100;
    return change;
}

// Update trend arrow element
function updateTrendArrow(trendId, change, inverted = false) {
    const el = document.getElementById(trendId);
    if (!el) return;
    
    if (change === null) {
        el.textContent = '';
        el.className = 'trend-arrow';
        return;
    }
    
    const absChange = Math.abs(change);
    const arrow = change > 0.1 ? '↑' : change < -0.1 ? '↓' : '→';
    const direction = change > 0.1 ? 'up' : change < -0.1 ? 'down' : 'neutral';
    
    // Format the percentage
    let text;
    if (absChange < 0.1) {
        text = '→ flat';
    } else if (absChange < 1) {
        text = `${arrow}${absChange.toFixed(2)}%`;
    } else {
        text = `${arrow}${absChange.toFixed(1)}%`;
    }
    
    el.textContent = text;
    el.className = `trend-arrow ${direction}${inverted ? ' inverted' : ''}`;
    el.title = `7-day change: ${change > 0 ? '+' : ''}${change.toFixed(2)}%`;
}

// Update all sparklines on the page
export async function updateSparklines() {
    try {
        const data = await fetchHistoricalData('30d');

        if (data.length === 0) {
            console.log('No historical data available yet');
            return;
        }

        // Only show sparklines if we have at least 3 data points
        if (data.length < 3) {
            console.log('Waiting for more data points (need at least 3)');
            return;
        }

        // Update sparklines for priority metrics
        const sparklines = [
            { canvasId: 'tz4-sparkline', metric: 'tz4_percentage', trendId: 'tz4-trend' },
            { canvasId: 'staking-sparkline', metric: 'staking_ratio', trendId: 'staking-trend' },
            { canvasId: 'bakers-sparkline', metric: 'total_bakers', trendId: 'bakers-trend' },
            { canvasId: 'issuance-sparkline', metric: 'current_issuance_rate', trendId: 'issuance-trend', inverted: true },
            { canvasId: 'supply-sparkline', metric: 'total_supply', trendId: 'supply-trend' },
            // Network Activity
            { canvasId: 'tx-volume-sparkline', metric: 'tx_volume_24h', trendId: 'tx-volume-trend' },
            { canvasId: 'contract-calls-sparkline', metric: 'contract_calls_24h', trendId: 'contract-calls-trend' },
            { canvasId: 'funded-accounts-sparkline', metric: 'funded_accounts', trendId: 'funded-accounts-trend' },
            // Ecosystem
            { canvasId: 'smart-contracts-sparkline', metric: 'smart_contracts', trendId: 'smart-contracts-trend' },
            { canvasId: 'tokens-sparkline', metric: 'tokens', trendId: 'tokens-trend' },
            { canvasId: 'rollups-sparkline', metric: 'rollups', trendId: 'rollups-trend' }
        ];

        sparklines.forEach(({ canvasId, metric, trendId, inverted }) => {
            createSparkline(canvasId, data, metric);
            const trend = calculateTrend(data, metric);
            updateTrendArrow(trendId, trend, inverted);
        });

        console.log(`Updated ${sparklines.length} sparklines with ${data.length} data points`);
    } catch (error) {
        console.error('Failed to update sparklines:', error);
    }
}

// Listen for theme changes to update sparkline colors
window.addEventListener('themechange', () => {
    updateSparklines();
});

// Initialize history modal functionality
export function initHistoryModal() {
    const modal = document.getElementById('history-modal');
    const openBtn = document.getElementById('history-btn');
    const closeBtn = document.getElementById('history-modal-close');

    if (!modal || !openBtn || !closeBtn) {
        console.warn('History modal elements not found');
        return;
    }

    let currentRange = 'all';

    // Open modal
    openBtn.addEventListener('click', async () => {
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';

        // Load initial charts
        await updateHistoryCharts(currentRange);
    });

    // Close modal
    const closeModal = () => {
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    };

    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    // Time range buttons
    const timeRangeBtns = document.querySelectorAll('.time-range-btn');
    timeRangeBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            // Update active state
            timeRangeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Update range and reload charts
            currentRange = btn.dataset.range;
            await updateHistoryCharts(currentRange);
        });
    });

    // Share button
    const shareBtn = document.getElementById('history-share-btn');
    if (shareBtn) {
        shareBtn.addEventListener('click', () => {
            if (typeof window.captureHistoricalData === 'function') {
                window.captureHistoricalData();
            }
        });
    }
}

// Update all charts in history modal
async function updateHistoryCharts(range) {
    try {
        const data = await fetchHistoricalData(range);

        if (data.length === 0) {
            console.log('No historical data available yet');
            // Show message to user
            const chartsContainer = document.querySelector('.charts-container');
            if (chartsContainer) {
                chartsContainer.innerHTML = `
                    <div style="text-align: center; padding: 40px; color: #999;">
                        <p>Historical data is being collected.</p>
                        <p>Charts will appear once data is available (usually within 2-4 hours).</p>
                    </div>
                `;
            }
            return;
        }

        // Create all charts
        const charts = [
            {
                canvasId: 'chart-tz4',
                metric: 'tz4_percentage',
                label: 'tz4 Adoption',
                unit: '%'
            },
            {
                canvasId: 'chart-staking',
                metric: 'staking_ratio',
                label: 'Staking Ratio',
                unit: '%'
            },
            {
                canvasId: 'chart-bakers',
                metric: 'total_bakers',
                label: 'Total Active Bakers',
                unit: ''
            },
            {
                canvasId: 'chart-issuance',
                metric: 'current_issuance_rate',
                label: 'Issuance Rate',
                unit: '%'
            },
            {
                canvasId: 'chart-supply',
                metric: 'total_supply',
                label: 'Total Supply',
                unit: ' XTZ'
            }
        ];

        charts.forEach(({ canvasId, metric, label, unit }) => {
            createFullChart(canvasId, data, metric, label, unit);
        });

        console.log(`Updated ${charts.length} history charts with ${data.length} data points`);
    } catch (error) {
        console.error('Failed to update history charts:', error);
    }
}

// Cleanup function to destroy all charts
export function destroyAllCharts() {
    Object.values(chartInstances).forEach(chart => chart.destroy());
    Object.keys(chartInstances).forEach(key => delete chartInstances[key]);
}
