// Historical data visualization module
// Handles sparklines and full charts using Chart.js

import { fetchHistoricalData } from './api.js';
import { getCurrentTheme } from './theme.js';

// Store chart instances for cleanup
const chartInstances = {};

// Create mini sparkline for stat cards
export function createSparkline(canvasId, data, metric) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    // Destroy existing chart if any
    if (chartInstances[canvasId]) {
        chartInstances[canvasId].destroy();
    }

    // Extract values and timestamps
    const values = data.map(d => d[metric]);
    const timestamps = data.map(d => new Date(d.timestamp));

    // Determine color based on trend and theme
    const firstValue = values[0];
    const lastValue = values[values.length - 1];
    const isPositive = lastValue >= firstValue;
    const isMatrix = getCurrentTheme() === 'matrix';

    // Matrix theme: all lines green. Default theme: cyan/pink based on trend
    let lineColor;
    if (isMatrix) {
        lineColor = '#00ff41';  // Matrix green for all lines
    } else {
        const positiveColor = '#00d4ff';
        const negativeColor = '#ff6b9d';
        const colorMap = {
            tz4_percentage: isPositive ? positiveColor : negativeColor,
            staking_ratio: isPositive ? positiveColor : negativeColor,
            total_bakers: isPositive ? positiveColor : negativeColor,
            current_issuance_rate: !isPositive ? positiveColor : negativeColor, // Lower is better
            total_supply: positiveColor
        };
        lineColor = colorMap[metric] || positiveColor;
    }

    const ctx = canvas.getContext('2d');
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
            plugins: {
                legend: { display: false },
                tooltip: {
                    enabled: true,
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#00ff41',
                    bodyColor: '#fff',
                    borderColor: '#00ff41',
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
                y: { display: false }
            },
            interaction: { mode: 'index', intersect: false }
        }
    });
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

    // Gradient fill
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, 'rgba(0, 212, 255, 0.3)');
    gradient.addColorStop(1, 'rgba(0, 212, 255, 0)');

    chartInstances[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: timestamps,
            datasets: [{
                label: label,
                data: values,
                borderColor: '#00d4ff',
                backgroundColor: gradient,
                borderWidth: 2,
                fill: true,
                pointRadius: 3,
                pointHoverRadius: 5,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#00d4ff',
                    bodyColor: '#fff',
                    borderColor: '#00d4ff',
                    borderWidth: 1,
                    callbacks: {
                        label: (context) => {
                            return `${label}: ${context.parsed.y.toFixed(2)}${unit}`;
                        },
                        title: (contexts) => {
                            const date = new Date(contexts[0].label);
                            return date.toLocaleString('en-US', {
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
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#999'
                    }
                },
                y: {
                    beginAtZero: false,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#999',
                        callback: (value) => value.toFixed(1) + unit
                    }
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            }
        }
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
            { canvasId: 'supply-sparkline', metric: 'total_supply', trendId: 'supply-trend' }
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
