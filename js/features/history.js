// Historical data visualization module
// Handles sparklines and full charts using Chart.js

import {
    fetchChamberHistoricalData,
    fetchHistoricalData,
    fetchSupabaseHistoryFreshness
} from '../core/api.js';
import { debugLog } from '../core/utils.js';
import { getCurrentTheme } from '../ui/theme.js';

// Store chart instances for cleanup
const chartInstances = {};
const FULL_CHART_POINT_LIMITS = {
    '24h': 180,
    '7d': 240,
    '30d': 360,
    '90d': 480,
    all: 720,
    default: 360
};
const FAST_RENDER_POINT_THRESHOLD = 180;
const latestLiveMetricPoints = new Map();
const FRESHNESS_LABELS = {
    tezos_history: 'Global',
    market_history: 'Market',
    network_health_history: 'Health',
    tezosx_history: 'Tezos X',
    governance_period_history: 'Governance'
};
const DOMAIN_HISTORY_CHARTS = [
    {
        source: 'market',
        canvasId: 'chart-price',
        metric: 'price_usd',
        label: 'XTZ Price',
        unit: ' USD'
    },
    {
        source: 'networkHealth',
        canvasId: 'chart-network-health',
        metric: 'health_score',
        label: 'Network Health',
        unit: '%'
    },
    {
        source: 'tezosx',
        canvasId: 'chart-tezosx-tvl',
        metric: 'tvl_usd',
        label: 'Tezos X TVL',
        unit: ' USD'
    },
    {
        source: 'tezosx',
        canvasId: 'chart-tezosx-transactions',
        metric: 'transactions_24h',
        label: 'Tezos X Transactions',
        unit: ''
    },
    {
        source: 'governance',
        canvasId: 'chart-governance-participation',
        metric: 'participation_pct',
        label: 'Governance Participation',
        unit: '%',
        statusText: 'No ballots',
        emptyTitle: 'No ballot samples in this range',
        emptyBody: 'Governance participation only charts Exploration and Promotion ballot windows. Quiet periods stay tracked in the digest while the chart waits for ballot snapshots.'
    }
];
const CORE_HISTORY_CHARTS = [
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
        canvasId: 'chart-total-staked',
        metric: 'total_staked',
        label: 'Total Staked',
        unit: ' XTZ'
    },
    {
        canvasId: 'chart-staking-apy',
        metric: 'staking_apy_stake',
        label: 'Stake APY',
        unit: '%'
    },
    {
        canvasId: 'chart-tz4-power',
        metric: 'tz4_power_pct',
        label: 'tz4 Power Adoption',
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
        canvasId: 'chart-protocol-issuance',
        metric: 'protocol_issuance_rate',
        label: 'Protocol Issuance',
        unit: '%'
    },
    {
        canvasId: 'chart-lb-ema',
        metric: 'lb_ema_pct',
        label: 'Liquidity Baking EMA',
        unit: '%'
    },
    {
        canvasId: 'chart-supply',
        metric: 'total_supply',
        label: 'Total Supply',
        unit: ' XTZ'
    }
];

function destroyChartInstance(canvasId) {
    if (chartInstances[canvasId]) {
        chartInstances[canvasId].destroy();
        delete chartInstances[canvasId];
    }
}

function normalizeMetricPoints(data, metric) {
    const points = data
        .map(d => ({ value: metricValue(d[metric]), timestamp: new Date(d.timestamp) }))
        .filter(point => Number.isFinite(point.value) && !isNaN(point.timestamp.getTime()));

    return withLatestLiveMetricPoint(points, metric);
}

function metricValue(value) {
    if (value === null || value === undefined || value === '') return NaN;
    return Number(value);
}

function formatAgeLabel(ageMs) {
    if (!Number.isFinite(ageMs) || ageMs < 0) return 'unknown';
    const minutes = Math.round(ageMs / 60000);
    if (minutes < 1) return 'now';
    if (minutes < 90) return `${minutes}m`;
    const hours = Math.round(minutes / 60);
    if (hours < 48) return `${hours}h`;
    const days = Math.round(hours / 24);
    return `${days}d`;
}

function escapeAttr(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function latestRow(data) {
    return Array.isArray(data) && data.length ? data[data.length - 1] : null;
}

function latestNumericRow(data, metric) {
    if (!Array.isArray(data)) return null;
    for (let index = data.length - 1; index >= 0; index -= 1) {
        if (Number.isFinite(metricValue(data[index]?.[metric]))) return data[index];
    }
    return latestRow(data);
}

function numericField(row, metric) {
    return row ? metricValue(row[metric]) : NaN;
}

function formatCompact(value, options = {}) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '--';
    const abs = Math.abs(number);
    const maximumFractionDigits = options.maximumFractionDigits ?? (abs >= 100 ? 1 : 2);
    const minimumFractionDigits = options.minimumFractionDigits ?? 0;
    return new Intl.NumberFormat('en-US', {
        notation: abs >= 10000 ? 'compact' : 'standard',
        maximumFractionDigits,
        minimumFractionDigits
    }).format(number);
}

function formatPct(value, digits = 1) {
    const number = Number(value);
    return Number.isFinite(number) ? `${number.toFixed(digits)}%` : '--';
}

function formatUsd(value, options = {}) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '--';
    if (options.price || Math.abs(number) < 10) {
        return `$${number.toLocaleString('en-US', {
            minimumFractionDigits: number < 1 ? 3 : 2,
            maximumFractionDigits: number < 1 ? 4 : 2
        })}`;
    }
    return `$${formatCompact(number, { maximumFractionDigits: 2 })}`;
}

function formatXTZ(value) {
    const number = Number(value);
    return Number.isFinite(number) ? `${formatCompact(number, { maximumFractionDigits: 2 })} XTZ` : '--';
}

function formatMaybe(value, formatter) {
    const number = Number(value);
    return Number.isFinite(number) ? formatter(number) : '--';
}

function formatMs(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '--';
    if (number >= 1000) return `${(number / 1000).toFixed(2)}s`;
    return `${Math.round(number)}ms`;
}

function shortHash(value) {
    const text = String(value || '');
    if (text.length <= 16) return text || '--';
    return `${text.slice(0, 8)}...${text.slice(-5)}`;
}

function rangeLabel(range) {
    return ({
        '24h': '24h',
        '7d': '7d',
        '30d': '30d',
        '90d': '90d',
        all: 'all time'
    })[range] || range || 'selected range';
}

function formatUtcDate(value) {
    if (!value) return '--';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--';
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC',
        timeZoneName: 'short'
    });
}

function trendForMetric(data, metric, unit = '', options = {}) {
    const points = normalizeMetricPoints(data || [], metric);
    if (points.length < 2) return null;
    const first = points[0].value;
    const current = points[points.length - 1].value;
    if (!Number.isFinite(first) || !Number.isFinite(current)) return null;

    const change = options.points || unit === '%'
        ? current - first
        : first !== 0
            ? ((current - first) / first) * 100
            : 0;
    if (!Number.isFinite(change)) return null;

    const abs = Math.abs(change);
    const suffix = options.points || unit === '%' ? 'pp' : '%';
    const digits = abs < 1 ? 2 : 1;
    const sign = change > 0 ? '+' : change < 0 ? '-' : '';
    const tone = change > 0 ? (options.inverted ? 'negative' : 'positive') : change < 0 ? (options.inverted ? 'positive' : 'negative') : 'neutral';

    return {
        tone,
        text: `${sign}${abs.toFixed(digits)}${suffix}`,
        raw: change
    };
}

function digestMetric(label, value) {
    return `
        <div class="history-digest-metric">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value)}</strong>
        </div>
    `;
}

function renderDigestCard(card) {
    const trend = card.trend || { text: card.status || 'steady', tone: 'neutral' };
    return `
        <article class="history-digest-card" data-tone="${escapeAttr(card.tone || 'default')}">
            <div class="history-digest-kicker">${escapeHtml(card.kicker)}</div>
            <div class="history-digest-main">
                <div>
                    <h4>${escapeHtml(card.title)}</h4>
                    <strong>${escapeHtml(card.value)}</strong>
                </div>
                <span class="history-digest-trend ${escapeAttr(trend.tone)}">${escapeHtml(trend.text)}</span>
            </div>
            <p>${escapeHtml(card.body)}</p>
            <div class="history-digest-metrics">
                ${(card.metrics || []).map(item => digestMetric(item.label, item.value)).join('')}
            </div>
        </article>
    `;
}

function buildConsensusDigest(data) {
    const row = latestNumericRow(data, 'tz4_power_pct') || latestNumericRow(data, 'tz4_percentage');
    const powerPct = numericField(row, 'tz4_power_pct');
    const countPct = numericField(row, 'tz4_percentage');
    const activePower = numericField(row, 'tz4_power_active');
    const totalPower = numericField(row, 'tz4_power_total');
    const gap = Number.isFinite(powerPct) && Number.isFinite(countPct) ? powerPct - countPct : NaN;
    const body = Number.isFinite(gap)
        ? `Power-weighted adoption is ${Math.abs(gap).toFixed(1)}pp ${gap >= 0 ? 'ahead of' : 'behind'} baker-count adoption.`
        : 'Power-weighted tz4 capture is warming up from the expanded history rows.';

    return {
        tone: 'consensus',
        kicker: 'Consensus',
        title: 'tz4 power',
        value: Number.isFinite(powerPct) ? formatPct(powerPct) : formatPct(countPct),
        trend: trendForMetric(data, Number.isFinite(powerPct) ? 'tz4_power_pct' : 'tz4_percentage', '%'),
        body,
        metrics: [
            { label: 'By count', value: formatPct(countPct) },
            { label: 'Active power', value: formatXTZ(activePower) },
            { label: 'Total power', value: formatXTZ(totalPower) }
        ]
    };
}

function buildEconomyDigest(data) {
    const row = latestNumericRow(data, 'total_staked') || latestRow(data);
    const staked = numericField(row, 'total_staked');
    const delegated = numericField(row, 'total_delegated');
    const supply = numericField(row, 'total_supply');
    const stakePct = Number.isFinite(staked) && Number.isFinite(supply) && supply > 0 ? (staked / supply) * 100 : numericField(row, 'staking_ratio');
    const delegatedPct = Number.isFinite(delegated) && Number.isFinite(supply) && supply > 0 ? (delegated / supply) * 100 : numericField(row, 'delegated_ratio');

    return {
        tone: 'economy',
        kicker: 'Economy',
        title: 'Staking base',
        value: formatXTZ(staked),
        trend: trendForMetric(data, 'total_staked', ' XTZ'),
        body: `${formatPct(stakePct)} staked and ${formatPct(delegatedPct)} delegated in the latest global snapshot.`,
        metrics: [
            { label: 'Stake APY', value: formatPct(numericField(row, 'staking_apy_stake')) },
            { label: 'Delegate APY', value: formatPct(numericField(row, 'staking_apy_delegate')) },
            { label: 'Baking power', value: formatXTZ(numericField(row, 'total_baking_power')) }
        ]
    };
}

function buildLiquidityDigest(data) {
    const row = latestNumericRow(data, 'lb_ema_pct') || latestRow(data);
    const emaPct = numericField(row, 'lb_ema_pct');
    const disabled = row?.lb_subsidy_disabled === true;
    const distance = Number.isFinite(emaPct) ? Math.abs(emaPct - 50) : NaN;
    const body = Number.isFinite(emaPct)
        ? disabled
            ? `Subsidy is disabled; OFF-vote EMA sits ${distance.toFixed(1)}pp past the 50% threshold.`
            : `Subsidy is active; OFF-vote EMA is ${distance.toFixed(1)}pp from the 50% threshold.`
        : 'Liquidity Baking EMA capture is warming up.';

    return {
        tone: disabled ? 'warning' : 'liquidity',
        kicker: 'Liquidity Baking',
        title: disabled ? 'Subsidy disabled' : 'Subsidy active',
        value: formatPct(emaPct),
        trend: trendForMetric(data, 'lb_ema_pct', '%', { inverted: true }),
        body,
        metrics: [
            { label: 'Protocol issuance', value: formatPct(numericField(row, 'protocol_issuance_rate'), 2) },
            { label: 'LB issuance', value: formatPct(numericField(row, 'lb_issuance_rate'), 2) },
            { label: 'Raw EMA', value: formatCompact(numericField(row, 'lb_ema'), { maximumFractionDigits: 0 }) }
        ]
    };
}

function buildMarketDigest(rows) {
    const row = latestNumericRow(rows, 'price_usd');
    const change = numericField(row, 'change_24h_pct');
    const body = Number.isFinite(change)
        ? `CoinGecko 24h move is ${change >= 0 ? '+' : ''}${change.toFixed(2)}% with ${formatUsd(numericField(row, 'volume_24h_usd'))} in volume.`
        : 'Market capture is warming up.';

    return {
        tone: 'market',
        kicker: 'Market',
        title: 'XTZ spot',
        value: formatUsd(numericField(row, 'price_usd'), { price: true }),
        trend: trendForMetric(rows, 'price_usd', ' USD'),
        body,
        metrics: [
            { label: 'Market cap', value: formatUsd(numericField(row, 'market_cap_usd')) },
            { label: 'Sats', value: formatMaybe(numericField(row, 'price_sats'), value => `${Math.round(value)} sats`) },
            { label: 'EUR', value: formatUsd(numericField(row, 'price_eur'), { price: true }).replace('$', '€') }
        ]
    };
}

function buildHealthDigest(rows) {
    const row = latestNumericRow(rows, 'health_score');
    const missedSlots = numericField(row, 'missed_attestation_slots');
    const sampleBlocks = numericField(row, 'sample_blocks');
    const body = Number.isFinite(missedSlots)
        ? `${formatCompact(missedSlots, { maximumFractionDigits: 0 })} missed attestation slots across the latest ${formatCompact(sampleBlocks, { maximumFractionDigits: 0 })}-block sample.`
        : 'Network Health capture is warming up.';

    return {
        tone: 'health',
        kicker: 'Network Health',
        title: 'Attestation power',
        value: formatPct(numericField(row, 'health_score'), 2),
        trend: trendForMetric(rows, 'health_score', '%'),
        body,
        metrics: [
            { label: 'Avg block', value: formatMaybe(numericField(row, 'avg_block_seconds'), value => `${value.toFixed(value < 10 ? 1 : 0)}s`) },
            { label: 'Round zero', value: formatPct(numericField(row, 'round_zero_pct')) },
            { label: 'Max round', value: formatCompact(numericField(row, 'max_round'), { maximumFractionDigits: 0 }) }
        ]
    };
}

function buildTezosXDigest(rows) {
    const row = latestNumericRow(rows, 'tvl_usd');
    const headGap = numericField(row, 'rpc_head') - numericField(row, 'explorer_head');
    const share = numericField(row, 'tvl_share_pct');
    const tx = numericField(row, 'transactions_24h');
    const body = Number.isFinite(tx)
        ? `${formatCompact(tx, { maximumFractionDigits: 1 })} L2 transactions in 24h${Number.isFinite(share) ? ` and ${formatPct(share)} of combined L1/L2 TVL` : ''}.`
        : 'Tezos X capture is warming up.';

    return {
        tone: 'tezosx',
        kicker: 'Tezos X',
        title: 'Atomic L2 pulse',
        value: formatUsd(numericField(row, 'tvl_usd')),
        trend: trendForMetric(rows, 'tvl_usd', ' USD'),
        body,
        metrics: [
            { label: 'Gas', value: formatMaybe(numericField(row, 'gas_gwei'), value => `${value.toFixed(2)} gwei`) },
            { label: 'Block time', value: formatMs(numericField(row, 'average_block_time_ms')) },
            { label: 'Head gap', value: Number.isFinite(headGap) ? formatCompact(Math.abs(headGap), { maximumFractionDigits: 0 }) : '--' }
        ]
    };
}

function buildGovernanceDigest(rows) {
    const row = latestRow(rows);
    const kind = String(row?.period_kind || 'period').replace(/_/g, ' ');
    const status = String(row?.period_status || 'warming');
    const participation = numericField(row, 'participation_pct');
    const votePower = numericField(row, 'voting_power_voted');
    const votersVoted = numericField(row, 'voters_voted');
    const votersTotal = numericField(row, 'voters_total');
    const body = Number.isFinite(participation)
        ? `${formatPct(participation)} participation toward ${formatPct(numericField(row, 'quorum_pct'))} quorum.`
        : `${kind || 'Governance'} is ${status}; ballot metrics appear during Exploration and Promotion.`;

    return {
        tone: 'governance',
        kicker: 'Governance',
        title: `${kind} ${status}`.trim(),
        value: Number.isFinite(participation) ? formatPct(participation) : formatUtcDate(row?.period_end),
        trend: trendForMetric(rows, 'participation_pct', '%') || { text: status, tone: status === 'active' ? 'positive' : 'neutral' },
        body,
        metrics: [
            { label: 'Proposal', value: shortHash(row?.proposal) },
            { label: 'Voters', value: Number.isFinite(votersVoted) && Number.isFinite(votersTotal) ? `${formatCompact(votersVoted, { maximumFractionDigits: 0 })}/${formatCompact(votersTotal, { maximumFractionDigits: 0 })}` : '--' },
            { label: 'Vote power', value: formatXTZ(votePower) }
        ]
    };
}

function renderHistoryDigest(data, domainData, range) {
    const el = document.getElementById('history-digest');
    if (!el) return;

    const coreRows = Array.isArray(data) ? data : [];
    const cards = [
        buildConsensusDigest(coreRows),
        buildEconomyDigest(coreRows),
        buildLiquidityDigest(coreRows),
        buildMarketDigest(domainData?.market || []),
        buildHealthDigest(domainData?.networkHealth || []),
        buildTezosXDigest(domainData?.tezosx || []),
        buildGovernanceDigest(domainData?.governance || [])
    ];

    el.innerHTML = `
        <section class="history-digest-panel">
            <div class="history-digest-head">
                <span>Captured Signals</span>
                <strong>${escapeHtml(rangeLabel(range))}</strong>
            </div>
            <div class="history-digest-grid">
                ${cards.map(renderDigestCard).join('')}
            </div>
        </section>
    `;
}

function renderHistoryFreshness(rows) {
    const el = document.getElementById('history-freshness-strip');
    if (!el) return;

    const items = Array.isArray(rows) ? rows : [];
    if (!items.length) {
        el.innerHTML = '<span class="history-freshness-pill stale"><strong>Capture</strong><span>unknown</span></span>';
        return;
    }

    el.innerHTML = items.map(item => {
        const label = FRESHNESS_LABELS[item.table] || item.table;
        const state = item.ok ? 'ok' : 'stale';
        const title = item.timestamp ? new Date(item.timestamp).toLocaleString() : (item.error || 'No snapshot');
        return `
            <span class="history-freshness-pill ${state}" title="${escapeAttr(title)}">
                <strong>${label}</strong>
                <span>${formatAgeLabel(item.ageMs)}</span>
            </span>
        `;
    }).join('');
}

function chartContainerFor(canvas) {
    return canvas?.closest('.chart-section') || canvas?.parentElement || null;
}

function clearChartEmptyState(canvas) {
    const container = chartContainerFor(canvas);
    if (!container) return;

    container.classList.remove('is-empty');
    canvas.removeAttribute('aria-hidden');
    const emptyState = container.querySelector('.history-chart-empty');
    if (emptyState && emptyState.parentElement === container) {
        emptyState.remove();
    }
}

function renderChartEmptyState(canvas, options = {}) {
    const container = chartContainerFor(canvas);
    if (!container) return;

    const rangeText = options.range ? ` for ${rangeLabel(options.range)}` : '';
    const title = options.emptyTitle || `Collecting ${options.label || 'history'}`;
    const body = options.emptyBody || `This chart needs at least two captured samples${rangeText}. It will draw automatically once enough history exists.`;

    container.classList.add('is-empty');
    canvas.setAttribute('aria-hidden', 'true');

    let emptyState = container.querySelector('.history-chart-empty');
    if (!emptyState || emptyState.parentElement !== container) {
        emptyState = document.createElement('div');
        emptyState.className = 'history-chart-empty';
        emptyState.setAttribute('role', 'status');
        canvas.insertAdjacentElement('afterend', emptyState);
    }

    emptyState.innerHTML = `
        <div class="history-chart-empty-kicker">Waiting for signal</div>
        <strong class="history-chart-empty-title">${escapeHtml(title)}</strong>
        <p>${escapeHtml(body)}</p>
    `;
}

function clearChartStatus(canvasId, options = {}) {
    const config = typeof options === 'string' ? { statusText: options } : options;
    const text = config.statusText || 'Collecting';
    const statsEl = document.getElementById(`stats-${canvasId}`);
    if (statsEl) {
        statsEl.innerHTML = `<span class="stat-item"><span class="stat-label">Status</span><span class="stat-value neutral">${text}</span></span>`;
    }
    const canvas = document.getElementById(canvasId);
    if (canvas) {
        renderChartEmptyState(canvas, config);
    }
    destroyChartInstance(canvasId);
}

export function setLatestLiveMetric(metric, value, timestamp = new Date()) {
    const numericValue = Number(value);
    const pointTime = new Date(timestamp);
    if (!metric || !Number.isFinite(numericValue) || isNaN(pointTime.getTime())) return;

    latestLiveMetricPoints.set(metric, {
        value: numericValue,
        timestamp: pointTime
    });
}

function withLatestLiveMetricPoint(points, metric) {
    const latest = latestLiveMetricPoints.get(metric);
    if (!latest) return points;

    const next = points.slice();
    const last = next[next.length - 1];
    if (!last) return next;

    if (latest.timestamp.getTime() < last.timestamp.getTime()) return next;
    next[next.length - 1] = latest;
    return next;
}

function formatSparklineTooltipValue(metric, value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return '';
    if (metric === 'tz4_percentage' || metric === 'staking_ratio') return `${numericValue.toFixed(1)}%`;
    if (metric === 'current_issuance_rate') return `${numericValue.toFixed(2)}%`;
    return numericValue.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function pushUniquePoint(points, point) {
    if (!point || points[points.length - 1] === point) return;
    points.push(point);
}

function evenlySamplePoints(points, maxPoints) {
    if (points.length <= maxPoints) return points;
    const sampled = [points[0]];
    const step = (points.length - 1) / (maxPoints - 1);

    for (let i = 1; i < maxPoints - 1; i++) {
        pushUniquePoint(sampled, points[Math.round(i * step)]);
    }

    pushUniquePoint(sampled, points[points.length - 1]);
    return sampled;
}

function downsampleTimeSeries(points, maxPoints) {
    if (points.length <= maxPoints) return points;
    if (maxPoints < 3) return points.slice(0, maxPoints);

    const sampled = [points[0]];
    const bucketCount = Math.max(1, Math.floor((maxPoints - 2) / 2));
    const bucketSize = (points.length - 2) / bucketCount;

    for (let bucket = 0; bucket < bucketCount; bucket++) {
        const start = 1 + Math.floor(bucket * bucketSize);
        const end = Math.min(points.length - 1, 1 + Math.floor((bucket + 1) * bucketSize));
        let minPoint = null;
        let maxPoint = null;
        let minIndex = -1;
        let maxIndex = -1;

        for (let i = start; i < end; i++) {
            const point = points[i];
            if (!minPoint || point.value < minPoint.value) {
                minPoint = point;
                minIndex = i;
            }
            if (!maxPoint || point.value > maxPoint.value) {
                maxPoint = point;
                maxIndex = i;
            }
        }

        if (minIndex === -1) continue;
        if (minIndex === maxIndex) {
            pushUniquePoint(sampled, minPoint);
        } else if (minIndex < maxIndex) {
            pushUniquePoint(sampled, minPoint);
            pushUniquePoint(sampled, maxPoint);
        } else {
            pushUniquePoint(sampled, maxPoint);
            pushUniquePoint(sampled, minPoint);
        }
    }

    pushUniquePoint(sampled, points[points.length - 1]);
    return evenlySamplePoints(sampled, maxPoints);
}

function getFullChartPointLimit(range) {
    return FULL_CHART_POINT_LIMITS[range] || FULL_CHART_POINT_LIMITS.default;
}

function getFullChartTimeScale(range) {
    switch (range) {
        case '24h':
            return { unit: 'hour', displayFormats: { hour: 'ha' } };
        case '7d':
        case '30d':
            return { unit: 'day', displayFormats: { day: 'MMM d' } };
        case '90d':
            return { unit: 'week', displayFormats: { week: 'MMM d' } };
        case 'all':
            return { unit: 'month', displayFormats: { month: 'MMM yyyy' } };
        default:
            return { unit: 'day', displayFormats: { day: 'MMM d' } };
    }
}

// Create mini sparkline for stat cards
export function createSparkline(canvasId, data, metric) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    // Extract values and timestamps
    const points = normalizeMetricPoints(data, metric);
    if (points.length < 2) return;

    const values = points.map(point => point.value);
    const timestamps = points.map(point => point.timestamp);

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
    } else if (currentThemeVal === 'nerv') {
        lineColor = isPositive ? '#FF9830' : '#E0533C';
    } else if (currentThemeVal === 'abyss') {
        lineColor = isPositive ? '#00E5FF' : '#FF5277';
    } else if (currentThemeVal === 'moss') {
        lineColor = isPositive ? '#50E850' : '#E05050';
    } else if (currentThemeVal === 'warzone') {
        lineColor = isPositive ? '#FFC000' : '#E0533C';
    } else if (currentThemeVal === 'aurora') {
        lineColor = isPositive ? '#45E0C8' : '#F472B6';
    } else {
        // default (Midnight) theme
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
                            const idx = items[0].dataIndex;
                            const date = timestamps[idx];
                            if (!date || isNaN(date.getTime())) return '';
                            return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                        },
                        label: (item) => formatSparklineTooltipValue(metric, item.raw)
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

    // Force resize after creation to fix layout timing issues
    requestAnimationFrame(() => {
        if (chartInstances[canvasId]) {
            chartInstances[canvasId].resize();
        }
    });
}

// Calculate stats for a metric
function calculateStats(data, metric, unit = '') {
    const values = Array.isArray(data) && data.length && data[0]?.timestamp instanceof Date
        ? data.map(point => point.value)
        : data.map(d => metricValue(d[metric])).filter(Number.isFinite);
    if (values.length === 0) return null;
    
    const current = values[values.length - 1];
    const first = values[0];
    let high = values[0];
    let low = values[0];
    for (const value of values) {
        if (value > high) high = value;
        if (value < low) low = value;
    }
    const change = unit === '%'
        ? current - first
        : first !== 0 ? ((current - first) / first) * 100 : 0;
    const changeUnit = unit === '%' ? 'pp' : '%';
    
    return { current, high, low, change, changeUnit };
}

// Create detailed line chart for history modal
export function createFullChart(canvasId, data, metric, label, unit = '', options = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    // Destroy existing chart if any
    destroyChartInstance(canvasId);

    // Extract values and timestamps
    const points = normalizeMetricPoints(data, metric);
    if (points.length < 2) {
        clearChartStatus(canvasId, {
            label,
            range: options.range,
            statusText: options.statusText || 'Collecting',
            emptyTitle: options.emptyTitle,
            emptyBody: options.emptyBody
        });
        return;
    }
    clearChartEmptyState(canvas);

    const range = options.range || '7d';
    const maxPoints = getFullChartPointLimit(range);
    const chartPoints = downsampleTimeSeries(points, maxPoints);
    const chartData = chartPoints.map(point => ({
        x: point.timestamp.getTime(),
        y: point.value
    }));
    const fastRender = points.length > FAST_RENDER_POINT_THRESHOLD || chartPoints.length > FAST_RENDER_POINT_THRESHOLD;
    const timeScale = getFullChartTimeScale(range);
    
    // Calculate stats for this metric
    const stats = calculateStats(points, metric, unit);
    
    // Update stats display if element exists
    const statsEl = document.getElementById(`stats-${canvasId}`);
    if (statsEl && stats) {
        const changeClass = stats.change > 0 ? 'positive' : stats.change < 0 ? 'negative' : 'neutral';
        const changeArrow = stats.change > 0 ? '↑' : stats.change < 0 ? '↓' : '→';
        statsEl.innerHTML = `
            <span class="stat-item">
                <span class="stat-label">Change</span>
                <span class="stat-value ${changeClass}">${changeArrow} ${Math.abs(stats.change).toFixed(2)}${stats.changeUnit}</span>
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
        nerv:      { primary: '#FF9830',  glow: 'rgba(255, 152, 48, 0.8)', fill: [0.35, 0.12] },
        abyss:     { primary: '#00E5FF',  glow: 'rgba(0, 229, 255, 0.8)',  fill: [0.4, 0.15] },
        moss:      { primary: '#50E850',  glow: 'rgba(80, 232, 80, 0.8)',  fill: [0.35, 0.12] },
        warzone:   { primary: '#FFC000',  glow: 'rgba(255, 192, 0, 0.8)',  fill: [0.35, 0.12] },
        aurora:    { primary: '#45E0C8',  glow: 'rgba(64, 224, 200, 0.8)', fill: [0.4, 0.15] },
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
            datasets: [{
                label: label,
                data: chartData,
                borderColor: primaryColor,
                backgroundColor: gradient,
                borderWidth: 3,
                fill: true,
                pointRadius: 0,
                pointHoverRadius: 8,
                pointHoverBackgroundColor: primaryColor,
                pointHoverBorderColor: '#fff',
                pointHoverBorderWidth: 2,
                tension: fastRender ? 0.15 : 0.4,
                // Glow effect via shadow
                borderCapStyle: 'round',
                borderJoinStyle: 'round'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            parsing: false,
            normalized: true,
            animation: fastRender ? false : {
                duration: 450,
                easing: 'easeOutQuart'
            },
            transitions: {
                active: { animation: { duration: 0 } },
                resize: { animation: { duration: 0 } }
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
                            const date = new Date(contexts[0].parsed.x);
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
                        unit: timeScale.unit,
                        displayFormats: timeScale.displayFormats
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
        plugins: fastRender ? [] : [{
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
function calculateTrend(data, metric, mode = 'relative') {
    if (data.length < 2) return null;
    
    const now = Date.now();
    const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
    
    const points = normalizeMetricPoints(data, metric)
        .map(point => ({ value: point.value, timestamp: point.timestamp.getTime() }))
        .filter(point => Number.isFinite(point.value) && Number.isFinite(point.timestamp));
    if (points.length < 2) return null;

    // Get current value (latest)
    const currentValue = points[points.length - 1].value;
    
    // Find value closest to 7 days ago
    let weekAgoValue = points[0].value; // fallback to oldest
    for (let i = points.length - 1; i >= 0; i--) {
        if (points[i].timestamp <= sevenDaysAgo) {
            weekAgoValue = points[i].value;
            break;
        }
    }
    
    if (!Number.isFinite(currentValue) || !Number.isFinite(weekAgoValue) || weekAgoValue === 0) return null;
    
    const change = mode === 'points'
        ? currentValue - weekAgoValue
        : ((currentValue - weekAgoValue) / weekAgoValue) * 100;
    return change;
}

// Update trend arrow element
function updateTrendArrow(trendId, change, inverted = false, unit = '%') {
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
        text = `${arrow}${absChange.toFixed(2)}${unit}`;
    } else {
        text = `${arrow}${absChange.toFixed(1)}${unit}`;
    }
    
    el.textContent = text;
    el.className = `trend-arrow ${direction}${inverted ? ' inverted' : ''}`;
    const titleUnit = unit === 'pp' ? ' percentage points' : '%';
    el.title = `7-day change: ${change > 0 ? '+' : ''}${change.toFixed(2)}${titleUnit}`;
}

// Update all sparklines on the page
export async function updateSparklines() {
    try {
        const data = await fetchHistoricalData('30d');

        if (data.length === 0) {
            debugLog('No historical data available yet');
            return;
        }

        // Only show sparklines if we have at least 3 data points
        if (data.length < 3) {
            debugLog('Waiting for more data points (need at least 3)');
            return;
        }

        // Update sparklines for priority metrics
        const sparklines = [
            { canvasId: 'tz4-sparkline', metric: 'tz4_percentage', trendId: 'tz4-trend', changeMode: 'points' },
            { canvasId: 'staking-sparkline', metric: 'staking_ratio', trendId: 'staking-trend', changeMode: 'points' },
            { canvasId: 'staking-apy-sparkline', metric: 'staking_apy_stake', trendId: 'staking-apy-trend', changeMode: 'points' },
            { canvasId: 'delegated-sparkline', metric: 'delegated_ratio', trendId: 'delegated-trend', changeMode: 'points' },
            { canvasId: 'bakers-sparkline', metric: 'total_bakers', trendId: 'bakers-trend' },
            { canvasId: 'issuance-sparkline', metric: 'current_issuance_rate', trendId: 'issuance-trend', inverted: true, changeMode: 'points' },
            { canvasId: 'supply-sparkline', metric: 'total_supply', trendId: 'supply-trend' },
            { canvasId: 'total-burned-sparkline', metric: 'total_burned', trendId: 'total-burned-trend' },
            { canvasId: 'baking-power-sparkline', metric: 'total_baking_power', trendId: 'baking-power-trend' },
            // Network Activity
            { canvasId: 'tx-volume-sparkline', metric: 'tx_volume_24h', trendId: 'tx-volume-trend' },
            { canvasId: 'contract-calls-sparkline', metric: 'contract_calls_24h', trendId: 'contract-calls-trend' },
            { canvasId: 'funded-accounts-sparkline', metric: 'funded_accounts', trendId: 'funded-accounts-trend' },
            { canvasId: 'new-accounts-sparkline', metric: 'new_accounts_24h', trendId: 'new-accounts-trend' },
            // Ecosystem
            { canvasId: 'smart-contracts-sparkline', metric: 'smart_contracts', trendId: 'smart-contracts-trend' },
            { canvasId: 'tokens-sparkline', metric: 'tokens', trendId: 'tokens-trend' },
            { canvasId: 'rollups-sparkline', metric: 'rollups', trendId: 'rollups-trend' },
            { canvasId: 'active-contracts-sparkline', metric: 'active_contracts_24h', trendId: 'active-contracts-trend' }
        ];

        sparklines.forEach(({ canvasId, metric, trendId, inverted, changeMode }) => {
            createSparkline(canvasId, data, metric);
            const trend = calculateTrend(data, metric, changeMode);
            updateTrendArrow(trendId, trend, inverted, changeMode === 'points' ? 'pp' : '%');
        });

        debugLog(`Updated ${sparklines.length} sparklines with ${data.length} data points`);
    } catch (error) {
        console.error('Failed to update sparklines:', error);
    }
}

// Listen for theme changes to update sparkline colors (skip initial theme set)
let _themeInitialized = false;
window.addEventListener('themechange', () => {
    if (!_themeInitialized) { _themeInitialized = true; return; }
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
        const [data, domainData, freshness] = await Promise.all([
            fetchHistoricalData(range),
            fetchChamberHistoricalData(range),
            fetchSupabaseHistoryFreshness()
        ]);
        renderHistoryFreshness(freshness);
        renderHistoryDigest(data, domainData, range);

        if (data.length === 0) {
            debugLog('No historical data available yet');
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

        CORE_HISTORY_CHARTS.forEach(({ canvasId, metric, label, unit }) => {
            createFullChart(canvasId, data, metric, label, unit, { range });
        });
        DOMAIN_HISTORY_CHARTS.forEach(({ source, canvasId, metric, label, unit, statusText, emptyTitle, emptyBody }) => {
            createFullChart(canvasId, domainData?.[source] || [], metric, label, unit, { range, statusText, emptyTitle, emptyBody });
        });

        debugLog(`Updated ${CORE_HISTORY_CHARTS.length + DOMAIN_HISTORY_CHARTS.length} history charts with ${data.length} core data points`);
    } catch (error) {
        console.error('Failed to update history charts:', error);
    }
}

// Card-to-metric mapping for history feature
const CARD_METRICS = {
    'total-bakers': { metric: 'total_bakers', label: 'Total Bakers', unit: '' },
    'tz4-adoption': {
        metric: 'tz4_power_pct',
        label: 'tz4 Power Adoption',
        unit: '%',
        fallbacks: [
            { metric: 'tz4_percentage', label: 'tz4 Baker Adoption', unit: '%' }
        ]
    },
    'issuance-rate': { metric: 'current_issuance_rate', label: 'Issuance Rate', unit: '%' },
    'staking-apy': { metric: 'staking_apy_stake', label: 'Stake APY', unit: '%' },
    'staking-ratio': { metric: 'staking_ratio', label: 'Staking Ratio', unit: '%' },
    'delegated': { metric: 'delegated_ratio', label: 'Delegated Ratio', unit: '%' },
    'total-supply': { metric: 'total_supply', label: 'Total Supply', unit: ' XTZ' },
    'total-burned': { metric: 'total_burned', label: 'Total Burned', unit: ' XTZ' },
    'baking-power': { metric: 'total_baking_power', label: 'Baking Power', unit: ' XTZ' },
    'tx-volume': { metric: 'tx_volume_24h', label: 'TX Volume (24h)', unit: '' },
    'contract-calls': { metric: 'contract_calls_24h', label: 'Contract Calls (24h)', unit: '' },
    'funded-accounts': { metric: 'funded_accounts', label: 'Funded Accounts', unit: '' },
    'new-accounts': { metric: 'new_accounts_24h', label: 'New Accounts (24h)', unit: '' },
    'smart-contracts': { metric: 'smart_contracts', label: 'Smart Contracts', unit: '' },
    'tokens': { metric: 'tokens', label: 'Tokens', unit: '' },
    'rollups': { metric: 'rollups', label: 'Rollups', unit: '' },
    'active-contracts': { metric: 'active_contracts_24h', label: 'Active Contracts (24h)', unit: '' },
    'network-health': { source: 'networkHealth', metric: 'health_score', label: 'Network Health', unit: '%' },
    'chamber-entry-card': {
        selector: '#chamber-entry-card',
        source: 'governance',
        metric: 'participation_pct',
        label: 'Tezos L1 Governance Participation',
        unit: '%'
    },
    'lb-entry-card': {
        selector: '#lb-entry-card',
        metric: 'lb_ema_pct',
        label: 'Liquidity Baking EMA',
        unit: '%'
    },
    'tezlink-entry-card': {
        selector: '#tezlink-entry-card',
        source: 'tezosx',
        metric: 'tvl_usd',
        label: 'Tezos X TVL',
        unit: ' USD'
    }
};

const CARD_HISTORY_RANGES = [
    { range: '7d', label: '7d' },
    { range: '30d', label: '30d' },
    { range: '90d', label: '90d' },
    { range: 'all', label: 'All Time' }
];

let cardHistoryRequestId = 0;
let cardHistoryObserver = null;

function getCardHistorySelector(cardId, config) {
    return config.selector || `[data-stat="${cardId}"]`;
}

function attachCardHistoryButton(cardId, config, root = document) {
    const selector = getCardHistorySelector(cardId, config);
    const card = root.querySelector?.(selector) || document.querySelector(selector);
    if (!card || card.dataset.cardHistoryWired === '1') return;

    card.dataset.cardHistoryWired = '1';
    const btn = document.createElement('button');
    btn.className = 'card-history-btn';
    btn.type = 'button';
    btn.innerHTML = '📊';
    btn.title = `View ${config.label} history`;
    btn.setAttribute('aria-label', `View ${config.label} history`);
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openCardHistoryModal(cardId);
    });
    card.appendChild(btn);
}

function countMetricPoints(data, metric) {
    return data.reduce((count, row) => count + (Number.isFinite(metricValue(row?.[metric])) ? 1 : 0), 0);
}

function selectCardHistoryMetric(data, config) {
    const candidates = [
        { metric: config.metric, label: config.label, unit: config.unit },
        ...(config.fallbacks || [])
    ];

    return candidates.find(candidate => countMetricPoints(data, candidate.metric) >= 2) || candidates[0];
}

async function fetchCardHistoryData(config, range) {
    if (!config.source) return fetchHistoricalData(range);
    const domainData = await fetchChamberHistoricalData(range);
    return domainData?.[config.source] || [];
}

/**
 * Add history buttons to stat cards with sparklines
 */
export function addCardHistoryButtons() {
    Object.entries(CARD_METRICS).forEach(([cardId, config]) => {
        attachCardHistoryButton(cardId, config);
    });

    if (cardHistoryObserver) return;
    const root = document.getElementById('chambers-grid') || document.body;
    cardHistoryObserver = new MutationObserver((mutations) => {
        if (!mutations.some(mutation => mutation.addedNodes.length)) return;
        Object.entries(CARD_METRICS).forEach(([cardId, config]) => {
            attachCardHistoryButton(cardId, config);
        });
    });
    cardHistoryObserver.observe(root, { childList: true, subtree: true });
}

/**
 * Open the card history modal for a specific metric
 */
async function openCardHistoryModal(cardId) {
    const config = CARD_METRICS[cardId];
    if (!config) return;

    // Create modal if it doesn't exist
    let modal = document.getElementById('card-history-modal');
    if (!modal) {
        modal = createCardHistoryModal();
        document.body.appendChild(modal);
    }

    // Update modal content
    const title = modal.querySelector('.card-history-title');
    
    if (title) {
        title.textContent = config.label;
    }

    // Show modal
    modal.dataset.cardHistoryCard = cardId;
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    await renderCardHistoryChart(modal, config, '30d');
}

function setCardHistoryRangeState(modal, range) {
    modal.querySelectorAll('.card-history-range-btn').forEach(btn => {
        const isActive = btn.dataset.range === range;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-pressed', String(isActive));
    });
}

async function renderCardHistoryChart(modal, config, range) {
    const chartContainer = modal.querySelector('.card-history-chart');
    if (!chartContainer) return;

    const canvasId = 'card-history-canvas';
    const requestId = ++cardHistoryRequestId;
    modal.dataset.cardHistoryRange = range;
    setCardHistoryRangeState(modal, range);
    destroyChartInstance(canvasId);
    chartContainer.innerHTML = '<div class="card-history-state">Loading...</div>';

    // Load data and render chart
    try {
        const data = await fetchCardHistoryData(config, range);

        if (requestId !== cardHistoryRequestId || !modal.classList.contains('active')) {
            return;
        }

        const metricConfig = selectCardHistoryMetric(data, config);
        const metricPoints = data.filter(row => Number.isFinite(metricValue(row[metricConfig.metric])));
        if (data.length === 0 || metricPoints.length < 2) {
            chartContainer.innerHTML = `
                <div class="card-history-state">
                    <p>Historical data is being collected.</p>
                    <p>Charts will appear once data is available.</p>
                </div>
            `;
            return;
        }

        // Create canvas for the chart
        chartContainer.innerHTML = `<canvas id="${canvasId}"></canvas>`;
        
        // Render the chart
        createFullChart(canvasId, data, metricConfig.metric, metricConfig.label, metricConfig.unit, { range });
    } catch (error) {
        if (requestId !== cardHistoryRequestId) {
            return;
        }

        console.error('Failed to load card history:', error);
        chartContainer.innerHTML = `
            <div class="card-history-state card-history-state-error">
                <p>Failed to load historical data.</p>
                <p>Please try again later.</p>
            </div>
        `;
    }
}

/**
 * Create the card history modal structure
 */
function createCardHistoryModal() {
    const modal = document.createElement('div');
    modal.id = 'card-history-modal';
    modal.className = 'card-history-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    modal.innerHTML = `
        <div class="card-history-content">
            <button class="card-history-close" id="card-history-close" aria-label="Close">×</button>
            <h2 class="card-history-title"></h2>
            <div class="card-history-controls" role="group" aria-label="History range">
                ${CARD_HISTORY_RANGES.map(({ range, label }) => `
                    <button class="time-range-btn card-history-range-btn${range === '30d' ? ' active' : ''}" type="button" data-range="${range}" aria-pressed="${range === '30d'}">${label}</button>
                `).join('')}
            </div>
            <div class="card-history-chart"></div>
        </div>
    `;

    modal.querySelectorAll('.card-history-range-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const cardId = modal.dataset.cardHistoryCard;
            const config = CARD_METRICS[cardId];
            const range = btn.dataset.range || '30d';
            if (!config || range === modal.dataset.cardHistoryRange) return;
            renderCardHistoryChart(modal, config, range);
        });
    });

    // Close button handler
    const closeBtn = modal.querySelector('.card-history-close');
    const closeModal = () => {
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        cardHistoryRequestId += 1;
        destroyChartInstance('card-history-canvas');
    };

    closeBtn.addEventListener('click', closeModal);
    
    // Click backdrop to close
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    // ESC key to close
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
            closeModal();
        }
    });

    return modal;
}
