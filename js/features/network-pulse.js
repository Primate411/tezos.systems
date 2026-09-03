import { renderChamberVerdict, syncChamberVerdict, settleChamberArrival } from '../ui/chamber-reading.js';
import { requestChamberClose, bindChamberVisibility } from '../ui/chamber-accessibility.js';
/**
 * Network Pulse Chamber
 * A categorized chamber surface for live stats, historical deltas, and the
 * deeper rooms that explain each signal.
 */

import {
    DOMAIN_HISTORY_TABLES,
    HISTORY_FRESHNESS_LIMITS,
    fetchAllStats,
    fetchHistoricalData
} from '../core/api.js';
import { versionedAsset } from '../core/asset-version.js';
import { siteMapCanonicalRoute, siteMapRoute } from '../core/site-map.js';
import { siteMapJourneyLinks } from '../core/site-journey.js';
import { getPulseDomainRows, getPulseHistoryRows } from '../core/pulse-history.mjs';
import { loadStats, loadStatsTimestamp, saveStats } from '../core/storage.js';
import { escapeHtml, formatFreshnessStamp, formatLarge, formatPercentage, formatSupply, formatUtcDateTime, pluralize } from '../core/utils.js';
import { activateChamberDialog, deactivateChamberDialog, wireChamberLauncher } from '../ui/chamber-accessibility.js';
import { ensureChamberStylesheet } from '../ui/chamber-styles.js';
import { openCardHistoryModal } from '../ui/history-intent.js';

const CHAMBER_REFRESH_MS = 2 * 60 * 1000;
const STATS_STALE_MS = 10 * 60 * 1000;
const NETWORK_PULSE_CSS_URL = versionedAsset('/css/network-pulse.min.css');
const HISTORY_RANGE = '7d';
const ENTRY_SPARK_RANGE_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_SPARK_POINTS = 50;
const ENTRY_SPARK_POINTS = 30;
const DOMAIN_SOURCES = new Set(['market', 'networkHealth', 'tezosx', 'governance']);
const SOURCE_TABLES = {
    stats: 'tezos_history',
    market: DOMAIN_HISTORY_TABLES.market,
    networkHealth: DOMAIN_HISTORY_TABLES.networkHealth,
    tezosx: DOMAIN_HISTORY_TABLES.tezosx,
    governance: DOMAIN_HISTORY_TABLES.governance
};
const SOURCE_LABELS = {
    market: 'Market history',
    networkHealth: 'Network Health',
    tezosx: 'Tezos X history',
    governance: 'Governance history'
};
const EMPTY_DOMAIN_ROWS = Object.freeze({
    market: [],
    networkHealth: [],
    tezosx: [],
    governance: []
});

let chamberTimer = null;
let activeFetch = null;
let activeHistoryFetch = null;
let activeDomainHistoryFetch = null;
let activeEntryHistoryFetch = null;
let lastStats = null;
let lastStatsAt = 0;
let lastHistoryRows = [];
let lastEntryHistoryRows = [];
let lastDomainRows = { ...EMPTY_DOMAIN_ROWS };
let savedBodyOverflow = null;
let savedHtmlOverflow = null;
let pulseObserver = null;
let entryEventsReady = false;
let entryPriceObserver = null;
let entryPriceFrame = 0;

function ensureNetworkPulseCss() {
    return ensureChamberStylesheet('network-pulse-css', NETWORK_PULSE_CSS_URL);
}

const GROUPS = [
    {
        id: 'consensus',
        label: 'Consensus',
        detail: 'Bakers, cycle position, finality context, and live health.',
        metrics: [
            { label: 'Active Bakers', key: 'totalBakers', format: formatCount, detail: 'Validators currently securing Tezos.', route: '#leaderboard', history: 'total_bakers', historyCard: 'total-bakers', deltaDecimals: 0 },
            { label: 'tz4 Adoption', key: 'tz4Percentage', format: formatTz4, detail: formatTz4Detail, route: '#tz4', history: 'tz4_percentage', historyCard: 'tz4-adoption', deltaDecimals: 1, deltaSuffix: '%' },
            { label: 'Current Cycle', key: 'cycle', format: formatCount, detail: (stats) => `${formatFinite(stats.cycleProgress, 1)}% complete, ${stats.cycleTimeRemaining || 'time remaining warming'}.`, route: '#health' },
            { label: 'Head Block', key: 'blockLevel', format: formatCount, detail: formatHeadBlockDetail, route: '#health' },
            { label: 'Health Score', key: 'healthScore', source: 'networkHealth', column: 'health_score', format: formatSafePercentage, detail: formatHealthScoreDetail, route: '#health', history: 'health_score', historyCard: 'network-health', deltaDecimals: 1, deltaSuffix: '%' },
            { label: 'Block Time', key: 'blockTimeAvg', source: 'networkHealth', column: 'avg_block_seconds', format: formatSeconds, detail: formatBlockTimeDetail, route: '#health', history: 'avg_block_seconds', historyCard: 'block-time', deltaDecimals: 1, deltaSuffix: 's' },
            { label: 'Finality', key: 'finalitySeconds', source: 'networkHealth', format: formatSeconds, detail: 'Two confirmations at current pace.', route: '#health', history: 'finality_seconds', historyCard: 'finality', deriveValue: deriveFinalitySeconds, deltaDecimals: 1, deltaSuffix: 's' },
            { label: 'Round-0 Rate', key: 'roundZeroPct', source: 'networkHealth', column: 'round_zero_pct', format: formatSafePercentage, detail: formatRoundZeroDetail, route: '#health', history: 'round_zero_pct', historyCard: 'round-zero', deltaDecimals: 1, deltaSuffix: '%' },
            { label: 'Missed Attestations', key: 'missedAttestations', source: 'networkHealth', column: 'missed_attestation_slots', format: formatMissedAttestations, detail: formatMissedAttestationsDetail, route: '#health', history: 'missed_attestation_slots', historyCard: 'missed-attestations', deltaDecimals: 0 },
            { label: 'tz4 Power', key: 'tz4PowerPct', format: formatSafePercentage, detail: formatTz4PowerDetail, route: '#tz4', history: 'tz4_power_pct', historyCard: 'tz4-adoption', deltaDecimals: 1, deltaSuffix: '%', value: (_stats, context) => latestMetricValue(context.rows, 'tz4_power_pct') }
        ]
    },
    {
        id: 'economy',
        label: 'Economy',
        detail: 'Issuance, staking, delegation, supply, and burn pressure.',
        metrics: [
            { label: 'Issuance Rate', key: 'currentIssuanceRate', format: formatSafePercentage, detail: formatIssuanceDetail, route: '#section=economy', history: 'current_issuance_rate', historyCard: 'issuance-rate', deltaDecimals: 1, deltaSuffix: '%' },
            { label: 'Stake APY', key: 'stakeAPY', format: formatSafePercentage, detail: (stats) => `Gross delegate context ${formatPct(stats.delegateAPY)} before baker policy.`, route: '#calculator', history: 'staking_apy_stake', historyCard: 'staking-apy', deltaDecimals: 1, deltaSuffix: '%' },
            { label: 'Staking Ratio', key: 'stakingRatio', format: formatSafePercentage, detail: 'Share of XTZ reported as staked by TzKT.', route: '#staking', history: 'staking_ratio', historyCard: 'staking-ratio', deltaDecimals: 1, deltaSuffix: '%' },
            { label: 'Delegated Ratio', key: 'delegatedRatio', format: formatSafePercentage, detail: 'Liquid delegation footprint across bakers.', route: '#section=economy', history: 'delegated_ratio', historyCard: 'delegated', deltaDecimals: 1, deltaSuffix: '%' },
            { label: 'Total Staked', key: 'totalStaked', format: formatSafeSupply, detail: formatTotalStakedDetail, route: '#staking', history: 'total_staked', historyCard: 'total-staked', deltaDecimals: 2 },
            { label: 'LB EMA', key: 'lbEmaPct', format: formatNullablePct, detail: formatLbEmaDetail, route: '#lb', history: 'lb_ema_pct', historyCard: 'lb-entry-card', deltaDecimals: 1, deltaSuffix: '%' },
            { label: 'Baking Power', key: 'bakingPower', format: formatSafeSupply, detail: 'Effective consensus weight for baking and attestation rights.', route: '#section=economy', history: 'total_baking_power', historyCard: 'baking-power', deltaDecimals: 2 },
            { label: 'Staker + Delegator Accounts', key: 'rewardAccounts', format: formatSafeLarge, detail: formatRewardDetail, route: '#section=economy' },
            { label: 'Total Supply', key: 'totalSupply', format: formatSafeSupply, detail: 'Current XTZ supply reported by the stats feed.', route: '#section=economy', history: 'total_supply', historyCard: 'total-supply', deltaDecimals: 2 },
            { label: 'Total Burned', key: 'totalBurned', format: formatSafeSupply, detail: 'XTZ permanently removed from circulation.', route: '#section=economy', history: 'total_burned', historyCard: 'total-burned', deltaDecimals: 2 }
        ]
    },
    {
        id: 'market',
        label: 'Market',
        detail: 'Off-chain tape: price, cap, and volume snapshots on the half hour.',
        metrics: [
            { label: 'XTZ Price', key: 'xtzPrice', source: 'market', column: 'price_usd', format: formatUsdPrice, detail: formatPriceDetail, route: '#price', history: 'price_usd', historyCard: 'xtz-price', deltaDecimals: 1, deltaSuffix: '%', deltaFromRow: (row) => numericValue(row?.change_24h_pct) },
            { label: 'Market Cap', key: 'marketCap', source: 'market', column: 'market_cap_usd', format: formatUsdCompact, detail: 'CoinGecko, USD.', route: '#price', history: 'market_cap_usd', historyCard: 'market-cap', deltaDecimals: 2, deltaPrefix: '$' },
            { label: '24h Volume', key: 'volume24h', source: 'market', column: 'volume_24h_usd', format: formatUsdCompact, detail: 'Spot volume across venues.', route: '#price', history: 'volume_24h_usd', historyCard: 'volume-24h', deltaDecimals: 2, deltaPrefix: '$' },
            { label: 'Sats per Tez', key: 'priceSats', source: 'market', column: 'price_sats', format: formatSats, detail: 'XTZ/BTC cross.', route: '#price', history: 'price_sats', historyCard: 'price-sats', deltaDecimals: 0 }
        ]
    },
    {
        id: 'governance',
        label: 'Governance',
        detail: 'The amendment lane: proposal state, period, turnout, and days remaining.',
        metrics: [
            { label: 'Active Proposal', key: 'proposal', format: formatText, detail: (stats) => stats.proposalDescription || 'Current proposal state from TzKT.', route: '#chamber' },
            { label: 'Voting Period', key: 'votingPeriod', format: formatText, detail: (stats) => stats.votingDescription || 'Current voting period.', route: '#chamber' },
            { label: 'Participation', key: 'participation', format: formatNullablePct, detail: formatParticipationDetail, route: '#chamber' },
            { label: 'Ballot Split', key: 'ballotSplit', source: 'governance', column: 'supermajority_pct', format: formatBallotSplitValue, detail: formatBallotSplitDetail, route: '#chamber', history: 'supermajority_pct', quietWhen: isGovernanceBallotQuiet },
            { label: 'Voters', key: 'governanceVoters', source: 'governance', column: 'voters_voted', format: formatVotersValue, detail: formatVotersDetail, route: '#chamber', history: 'voters_voted', quietWhen: isGovernanceBallotQuiet },
            { label: 'Period Ends', key: 'governancePeriodEnd', source: 'governance', format: formatPeriodEndValue, detail: formatPeriodEndDetail, route: '#chamber', value: (_stats, context) => latestRow(context.domainRows.governance)?.period_end }
        ]
    },
    {
        id: 'activity',
        label: 'Network Activity',
        detail: '24-hour account, transaction, and contract movement.',
        metrics: [
            { label: 'Transactions', key: 'transactionVolume24h', format: formatSafeLarge, detail: 'All Tezos transactions seen in the last 24 hours.', route: '#section=network', history: 'tx_volume_24h', historyCard: 'tx-volume', deltaDecimals: 0 },
            { label: 'Contract Calls', key: 'contractCalls24h', format: formatSafeLarge, detail: 'Entrypoint calls across DeFi, NFTs, and apps.', route: '#section=network', history: 'contract_calls_24h', historyCard: 'contract-calls', deltaDecimals: 0 },
            { label: 'Funded Accounts', key: 'fundedAccounts', format: formatSafeLarge, detail: 'Accounts with non-zero XTZ balance.', route: '#section=network', history: 'funded_accounts', historyCard: 'funded-accounts', deltaDecimals: 0 },
            { label: 'New Accounts', key: 'newAccounts24h', format: formatSafeLarge, detail: 'Accounts whose first activity appeared in the last 24 hours.', route: '#section=network', history: 'new_accounts_24h', historyCard: 'new-accounts', deltaDecimals: 0 },
            { label: 'Giant Awakenings', key: 'giantAwakenings', source: 'client', format: formatGiantAwakeningValue, detail: formatGiantAwakeningDetail, route: '/whales/?view=awakenings', value: () => recentGiantAwakenings().length }
        ]
    },
    {
        id: 'ecosystem',
        label: 'Ecosystem',
        detail: 'Contracts, tokens, rollups, and active app surface.',
        metrics: [
            { label: 'Smart Contracts', key: 'smartContracts', format: formatSafeLarge, detail: 'Total deployed Tezos smart contracts.', route: '#section=ecosystem', history: 'smart_contracts', historyCard: 'smart-contracts', deltaDecimals: 0, monotonic: true, maxDailyRelativeDelta: 0.35 },
            { label: 'Active Contracts', key: 'activeContracts24h', format: formatSafeLarge, detail: 'Contracts with activity in the last 24 hours.', route: '#section=ecosystem', history: 'active_contracts_24h', historyCard: 'active-contracts', deltaDecimals: 0 },
            { label: 'Tokens', key: 'tokens', format: formatSafeLarge, detail: 'FA1.2 and FA2 token contracts and token rows.', route: '#section=ecosystem', history: 'tokens', historyCard: 'tokens', deltaDecimals: 0 },
            { label: 'Smart Rollups', key: 'rollups', format: formatCount, detail: 'L2 rollups registered on Tezos.', route: '#tezosx', history: 'rollups', historyCard: 'rollups', deltaDecimals: 0 },
            { label: 'Etherlink TVL', key: 'etherlinkTvl', source: 'tezosx', column: 'tvl_usd', format: formatUsdCompact, detail: formatEtherlinkTvlDetail, route: '#tezosx', history: 'tvl_usd', historyCard: 'tezlink-entry-card', deltaDecimals: 2, deltaPrefix: '$' },
            { label: 'L2 Transactions', key: 'l2Transactions', source: 'tezosx', column: 'transactions_24h', format: formatSafeLarge, detail: formatL2TransactionsDetail, route: '#tezosx', history: 'transactions_24h', historyCard: 'l2-transactions', deltaDecimals: 0 },
            { label: 'L2 Gas', key: 'l2Gas', source: 'tezosx', column: 'gas_gwei', format: formatGwei, detail: formatL2GasDetail, route: '#tezosx', history: 'gas_gwei', historyCard: 'l2-gas', deltaDecimals: 2 },
            { label: 'L2 Active Addresses', key: 'l2ActiveAddresses', source: 'tezosx', column: 'active_addresses', format: formatSafeLarge, detail: formatL2ActiveAddressesDetail, route: '#tezosx', history: 'active_addresses', historyCard: 'l2-active-addresses', deltaDecimals: 0 }
        ]
    }
];

const METRIC_BY_KEY = new Map(GROUPS.flatMap((group) => group.metrics.map((metric) => [metric.key, metric])));

const ENTRY_METRICS = [
    { label: 'Bakers', topLabel: 'Bakers', key: 'totalBakers', category: 'consensus', tier: 'structural', history: 'total_bakers', format: formatCount },
    { label: 'tz4', topLabel: 'tz4 adoption', key: 'tz4Percentage', category: 'consensus', tier: 'structural', history: 'tz4_percentage', format: formatPct },
    { label: 'Staked', topLabel: 'Staked', key: 'stakingRatio', category: 'economy', tier: 'structural', history: 'staking_ratio', format: formatPct },
    { label: 'Delegated', topLabel: 'Delegated', key: 'delegatedRatio', category: 'economy', tier: 'structural', history: 'delegated_ratio', format: formatPct },
    { label: 'Issuance', topLabel: 'Issuance', key: 'currentIssuanceRate', category: 'economy', tier: 'structural', history: 'current_issuance_rate', format: formatPct },
    { label: 'Stake APY', topLabel: 'Stake APY', key: 'stakeAPY', category: 'economy', tier: 'structural', history: 'staking_apy_stake', format: formatPct },
    { label: 'Tx 24h', topLabel: 'Transactions', key: 'transactionVolume24h', category: 'activity', tier: 'activity', history: 'tx_volume_24h', format: formatSafeLarge },
    { label: 'Calls 24h', topLabel: 'Contract calls', key: 'contractCalls24h', category: 'activity', tier: 'activity', history: 'contract_calls_24h', format: formatSafeLarge },
    { label: 'New accts', topLabel: 'New accounts', key: 'newAccounts24h', category: 'activity', tier: 'activity', history: 'new_accounts_24h', format: formatSafeLarge },
    {
        label: 'Price',
        topLabel: 'Price',
        key: 'price',
        category: 'market',
        tier: 'structural',
        format: formatEntryPrice,
        value: entryPriceValue,
        deltaFromDom: entryPriceChangeDelta
    }
];

const ROOM_VALUE_SELECTORS = {
    anthology: '#protocol-history-entry-current',
    chamber: '#chamber-entry-hero',
    domains: '#tezos-domains-entry-feature',
    health: '#network-health-status',
    'l2-governance': '#etherlink-governance-entry-value',
    'liquidity-baking': '#lb-entry-ema',
    'staking-chamber': '#staking-entry-ratio',
    tezosx: '#tezlink-entry-tvl',
    tz4: '#tz4-entry-preview'
};

const ROOM_FALLBACKS = {
    anthology: 'Protocol memory',
    chamber: 'Vote room',
    ctez: 'Oven guide',
    domains: '.tez identity',
    health: 'Open chamber',
    'hot-today': 'Live signals',
    'l2-governance': 'FAST / SLOW',
    'ledger-flow': 'Account paths',
    'liquidity-baking': 'EMA monitor',
    maxis: 'Ongoing identities',
    'staking-chamber': 'Staking moves >10K',
    tezosx: 'L2 activity',
    tz4: 'BLS keys'
};
const ROOM_VALUE_MAX = 52;

function formatCount(value) {
    const number = numericValue(value);
    if (number === null) return '--';
    return number.toLocaleString('en-US');
}

function formatFinite(value, decimals = 1) {
    const number = numericValue(value);
    if (number === null) return '--';
    return number.toFixed(decimals);
}

function formatPct(value) {
    const number = numericValue(value);
    if (number === null) return '--';
    return `${number.toFixed(1)}%`;
}

function formatNullablePct(value) {
    return numericValue(value) !== null ? formatPercentage(value) : 'Unavailable';
}

function formatSafePercentage(value) {
    return numericValue(value) === null ? '--' : formatPercentage(value);
}

function formatSafeLarge(value) {
    return numericValue(value) === null ? '--' : formatLarge(value);
}

function formatSafeSupply(value) {
    return numericValue(value) === null ? '--' : formatSupply(value);
}

function formatTz4(value) {
    const number = numericValue(value);
    if (number === null) return '-- / 50%';
    return `${number.toFixed(1)} / 50%`;
}

function formatText(value) {
    const text = String(value ?? '').trim();
    return text && text !== 'N/A' && text !== 'None' ? text : 'Quiet';
}

function formatTz4Detail(stats) {
    const tz4 = numericValue(stats.tz4Bakers);
    const total = numericValue(stats.totalBakers);
    if (tz4 !== null && total !== null && total > 0) {
        return `${formatCount(tz4)} of ${formatCount(total)} bakers on BLS keys.`;
    }
    return 'BLS consensus key adoption against the 50% target.';
}

function formatHeadBlockDetail(stats) {
    const parts = ['Latest block level from the live stats feed'];
    const timestamp = Date.parse(stats?.blockTime || '');
    if (Number.isFinite(timestamp)) {
        parts.push(`last head ${formatUtcDateTime(timestamp)} UTC`);
    }
    return `${parts.join('; ')}.`;
}

function formatIssuanceDetail(stats) {
    const protocol = formatPct(stats.protocolIssuanceRate);
    const lb = stats.lbSubsidyDisabled == null
        ? 'LB state unavailable'
        : stats.lbSubsidyDisabled
            ? 'LB disabled'
            : `LB ${formatPct(stats.lbIssuanceRate)}`;
    const ema = numericValue(stats.lbEmaPct) !== null ? `EMA ${formatPct(stats.lbEmaPct)}` : 'EMA unavailable';
    return `${protocol} protocol issuance, ${lb}, ${ema}.`;
}

function formatRewardDetail(stats) {
    const delegators = formatSafeLarge(stats.totalDelegators);
    const stakers = formatSafeLarge(stats.totalStakers);
    return `${delegators} delegators and ${stakers} stakers.`;
}

function formatParticipationDetail(stats) {
    const period = cleanText(stats.govPeriodKind || stats.votingPeriod || 'period');
    const days = numericValue(stats.participationDaysLeft);
    const dayValue = days !== null ? days.toFixed(days < 1 ? 1 : 0) : '';
    const daysLine = days !== null ? `${dayValue} ${pluralize(Number(dayValue), 'day')} left in ${period}` : `${period} timing unavailable`;
    if (period.toLowerCase().includes('proposal')) {
        return `No ballot running — quorum and Yay thresholds begin in Exploration; ${daysLine}.`;
    }
    const quorum = numericValue(stats.participationQuorum) !== null ? `quorum ${formatPct(stats.participationQuorum)}` : 'quorum unavailable';
    const yay = numericValue(stats.participationYayPct) !== null ? `Yay ${formatPct(stats.participationYayPct)}` : 'Yay unavailable';
    return `${quorum}, ${yay}; ${daysLine}.`;
}

function deriveFinalitySeconds(row) {
    const avgBlockSeconds = numericValue(row?.avg_block_seconds);
    return avgBlockSeconds === null ? null : avgBlockSeconds * 2;
}

function formatSeconds(value) {
    const number = numericValue(value);
    if (number === null) return '--';
    return `${number.toFixed(number < 10 ? 1 : 0)}s`;
}

function formatUsdPrice(value) {
    const number = numericValue(value);
    if (number === null) return '--';
    return `$${number.toFixed(number < 1 ? 3 : 2)}`;
}

function formatUsdCompact(value) {
    const number = numericValue(value);
    if (number === null) return '--';
    if (Math.abs(number) >= 1e9) return `$${(number / 1e9).toFixed(2)}B`;
    if (Math.abs(number) >= 1e6) return `$${(number / 1e6).toFixed(2)}M`;
    if (Math.abs(number) >= 1e3) return `$${(number / 1e3).toFixed(2)}K`;
    return `$${number.toFixed(2)}`;
}

function formatSats(value) {
    const number = numericValue(value);
    if (number === null) return '--';
    return `${Math.round(number).toLocaleString('en-US')} sats`;
}

function formatGwei(value) {
    const number = numericValue(value);
    if (number === null) return '--';
    return `${number.toFixed(number < 10 ? 2 : 1)} gwei`;
}

function formatMissedAttestations(value) {
    const number = numericValue(value);
    if (number === null) return '--';
    return number === 0 ? 'None' : formatCount(number);
}

function formatGiantAwakeningValue(value) {
    const count = numericValue(value);
    if (count === null) return 'Unavailable';
    return count > 0 ? formatCount(count) : 'Quiet';
}

function latestRow(rows = []) {
    return Array.isArray(rows) && rows.length ? rows[rows.length - 1] : null;
}

function latestMetricValue(rows = [], column) {
    if (!Array.isArray(rows) || !column) return null;
    for (let index = rows.length - 1; index >= 0; index -= 1) {
        const value = numericValue(rows[index]?.[column]);
        if (value !== null) return value;
    }
    return null;
}

function formatDateShort(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'date unavailable';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function sourceForMetric(metric) {
    return metric.source || 'stats';
}

function rowsForMetric(metric, context = {}) {
    const source = sourceForMetric(metric);
    return DOMAIN_SOURCES.has(source)
        ? context.domainRows?.[source] || []
        : context.rows || [];
}

function rowValue(metric, row) {
    if (!row) return null;
    if (typeof metric.deriveValue === 'function') return metric.deriveValue(row);
    return row?.[metric.column || metric.history || metric.key];
}

function currentMetricValue(metric, stats = {}, context = {}) {
    if (typeof metric.value === 'function') return metric.value(stats, context, metric);
    const source = sourceForMetric(metric);
    if (DOMAIN_SOURCES.has(source)) return rowValue(metric, latestRow(rowsForMetric(metric, context)));
    return stats?.[metric.key];
}

function metricFreshness(metric, context = {}) {
    const source = sourceForMetric(metric);
    if (!DOMAIN_SOURCES.has(source)) return null;
    const row = latestRow(rowsForMetric(metric, context));
    const timestamp = row?.timestamp;
    const time = timestamp ? new Date(timestamp).getTime() : NaN;
    if (!Number.isFinite(time)) return null;
    const table = SOURCE_TABLES[source];
    const limit = HISTORY_FRESHNESS_LIMITS[table] || 90 * 60 * 1000;
    const stale = Date.now() - time > limit;
    return {
        text: `${stale ? 'stale · ' : ''}${formatFreshnessStamp(timestamp, { source: SOURCE_LABELS[source] || table })}`,
        stale
    };
}

function metricContext(stats = {}, rows = lastHistoryRows, domainRows = lastDomainRows) {
    return { stats, rows, domainRows };
}

function formatHealthScoreDetail(_stats, context) {
    const row = latestRow(context.domainRows.networkHealth);
    const sample = Number(row?.sample_blocks);
    return `Attestation power seen across the last ${Number.isFinite(sample) && sample > 0 ? formatCount(sample) : 'sample'} blocks.`;
}

function formatBlockTimeDetail(_stats, context) {
    const row = latestRow(context.domainRows.networkHealth);
    const max = numericValue(row?.max_block_seconds);
    const onTarget = numericValue(row?.on_target_blocks);
    const sample = numericValue(row?.sample_blocks);
    const target = onTarget !== null && sample !== null ? `${formatCount(onTarget)} of ${formatCount(sample)} on target` : 'target sample warming';
    return `${max !== null ? `max ${formatSeconds(max)}` : 'max warming'}, ${target}.`;
}

function formatRoundZeroDetail(_stats, context) {
    const row = latestRow(context.domainRows.networkHealth);
    const maxRound = numericValue(row?.max_round);
    return `Max round ${maxRound !== null ? formatCount(maxRound) : '--'} in the sample.`;
}

function formatMissedAttestationsDetail(_stats, context) {
    const row = latestRow(context.domainRows.networkHealth);
    const slots = numericValue(row?.missed_attestation_slots);
    const rights = numericValue(row?.missed_attestation_rights);
    if (slots === 0) return 'None in the sample window.';
    return `${slots !== null ? formatCount(slots) : '--'} slots across ${rights !== null ? formatCount(rights) : '--'} rights in the sample window.`;
}

function formatTz4PowerDetail(stats, context) {
    const power = latestMetricValue(context.rows, 'tz4_power_active');
    const total = latestMetricValue(context.rows, 'tz4_power_total');
    const bakerCount = formatPct(stats.tz4Percentage);
    if (power !== null && total !== null) {
        return `${formatSupply(power)} of ${formatSupply(total)} consensus power on BLS keys; baker count ${bakerCount}.`;
    }
    return `Consensus power on BLS keys; baker count ${bakerCount}.`;
}

function formatTotalStakedDetail(stats) {
    const delegated = numericValue(stats.totalDelegated);
    return delegated !== null
        ? `${formatSupply(delegated)} delegated, outside the staked total.`
        : 'Delegated total unavailable.';
}

function formatLbEmaDetail(stats) {
    const ema = numericValue(stats.lbEmaPct);
    const distance = ema !== null ? Math.max(0, 66.67 - ema) : null;
    const state = stats.lbSubsidyDisabled == null
        ? 'Subsidy state unavailable'
        : stats.lbSubsidyDisabled
            ? 'Subsidy disabled'
            : 'Subsidy active';
    return distance === null ? `${state}; EMA unavailable.` : `${state}; ${distance.toFixed(1)}pp below the 66.67% off threshold.`;
}

function formatPriceDetail(_stats, context) {
    const row = latestRow(context.domainRows.market);
    const eur = numericValue(row?.price_eur);
    const sats = numericValue(row?.price_sats);
    return `${eur !== null ? `€${eur.toFixed(eur < 1 ? 3 : 2)}` : 'EUR --'} - ${sats !== null ? formatSats(sats) : 'sats --'}.`;
}

function formatBallotSplitValue(value) {
    const yay = numericValue(value);
    return yay !== null ? `${yay.toFixed(1)}% yay` : 'Quiet';
}

function isGovernanceBallotQuiet(_stats, context) {
    const row = latestRow(context.domainRows.governance);
    const kind = cleanText(row?.period_kind).toLowerCase();
    const isBallotPeriod = kind === 'exploration' || kind === 'promotion';
    const supermajority = row?.supermajority_pct;
    return !isBallotPeriod || supermajority === null || supermajority === undefined || !Number.isFinite(Number(supermajority));
}

function formatBallotSplitDetail(_stats, context) {
    const row = latestRow(context.domainRows.governance);
    const yay = numericValue(row?.yay_power);
    const nay = numericValue(row?.nay_power);
    const pass = numericValue(row?.pass_power);
    if (isGovernanceBallotQuiet(_stats, context)) return 'No ballot running this period.';
    return `yay ${formatMxtz(yay)} / nay ${formatMxtz(nay)} / pass ${formatMxtz(pass)}.`;
}

function formatVotersValue(value, _stats, context) {
    if (isGovernanceBallotQuiet(_stats, context)) return 'Quiet';
    const row = latestRow(context.domainRows.governance);
    const voted = numericValue(value);
    const total = numericValue(row?.voters_total);
    if (voted === null || total === null || total <= 0) return 'Quiet';
    return `${formatCount(voted)} / ${formatCount(total)}`;
}

function formatVotersDetail(_stats, context) {
    return isGovernanceBallotQuiet(_stats, context)
        ? 'No ballot running this period.'
        : 'Ballots cluster in the final days.';
}

function formatPeriodEndValue(value) {
    const time = Date.parse(value || '');
    if (!Number.isFinite(time)) return '--';
    const diff = time - Date.now();
    if (diff <= 0) return 'Today';
    const days = Math.ceil(diff / DAY_MS);
    return days <= 1 ? '1 day' : `${formatCount(days)} days`;
}

function formatPeriodEndDetail(_stats, context) {
    const row = latestRow(context.domainRows.governance);
    const kind = cleanText(row?.period_kind || 'period') || 'period';
    return `${kind} ends ${formatDateShort(row?.period_end)}.`;
}

function formatEtherlinkTvlDetail(_stats, context) {
    const row = latestRow(context.domainRows.tezosx);
    const share = numericValue(row?.tvl_share_pct);
    const top = numericValue(row?.top_protocol_tvl_usd);
    return `${share !== null ? `${share.toFixed(1)}%` : '--'} of combined L1+L2 TVL; top protocol ${top !== null ? formatUsdCompact(top) : '--'}.`;
}

function formatL2TransactionsDetail(_stats, context) {
    const row = latestRow(context.domainRows.tezosx);
    const total = numericValue(row?.total_transactions);
    return `${total !== null ? formatLarge(total) : '--'} total since genesis.`;
}

function formatL2GasDetail(_stats, context) {
    const row = latestRow(context.domainRows.tezosx);
    const ms = numericValue(row?.average_block_time_ms);
    return `${ms !== null ? `~${formatCount(ms)}ms` : '~--ms'} blocks.`;
}

function formatL2ActiveAddressesDetail(_stats, context) {
    const row = latestRow(context.domainRows.tezosx);
    const active = numericValue(row?.active_addresses);
    const total = numericValue(row?.total_addresses);
    if (active === null) {
        return `Active-address history unavailable; ${total !== null ? formatLarge(total) : '--'} total addresses.`;
    }
    return `${formatLarge(active)} active addresses; ${total !== null ? formatLarge(total) : '--'} total addresses.`;
}

function formatMxtz(value) {
    const number = numericValue(value);
    if (number === null) return '--Mꜩ';
    return `${(number / 1e6).toFixed(number >= 10_000_000 ? 1 : 2)}Mꜩ`;
}

function recentGiantAwakenings() {
    try {
        const rows = JSON.parse(localStorage.getItem('tezos-systems-awakenings') || '[]');
        if (!Array.isArray(rows)) return [];
        const cutoff = Date.now() - DAY_MS;
        return rows.filter((row) => {
            const timestamp = Number(row?.timestamp) || Date.parse(row?.awakenedAt || '');
            return Number.isFinite(timestamp) && timestamp >= cutoff;
        });
    } catch {
        return [];
    }
}

function formatGiantAwakeningDetail() {
    const rows = recentGiantAwakenings();
    if (!rows.length) return 'No dormant giants stirred in 24h.';
    const largest = rows.reduce((best, row) => Number(row?.balance || 0) > Number(best?.balance || 0) ? row : best, rows[0]);
    const address = cleanText(largest?.alias || largest?.address || 'giant');
    const short = address.length > 14 ? `${address.slice(0, 8)}...${address.slice(-5)}` : address;
    const balance = Number(largest?.balance);
    const dormant = Number(largest?.dormantDays);
    return `${short}, ${Number.isFinite(balance) ? formatSupply(balance) : '--'} ꜩ, dormant ${Number.isFinite(dormant) ? formatCount(dormant) : '--'} days.`;
}

function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function textFrom(selector) {
    const text = cleanText(document.querySelector(selector)?.textContent);
    if (!text || /^loading|preheating|reading/i.test(text)) return '';
    return text;
}

function lastKnownStats() {
    if (lastStats) return lastStats;
    const cached = loadStats();
    if (cached && typeof cached === 'object') {
        lastStats = cached;
        lastStatsAt = loadStatsTimestamp();
        return cached;
    }
    return null;
}

async function getFreshStats({ force = false } = {}) {
    const now = Date.now();
    const cached = lastKnownStats();
    if (!force && cached && lastStatsAt && now - lastStatsAt < STATS_STALE_MS) return cached;
    if (activeFetch) return activeFetch;

    activeFetch = fetchAllStats()
        .then((stats) => {
            lastStats = stats;
            lastStatsAt = Date.now();
            saveStats(stats);
            return stats;
        })
        .finally(() => {
            activeFetch = null;
        });

    return activeFetch;
}

async function getHistoryRows() {
    if (activeHistoryFetch) return activeHistoryFetch;
    activeHistoryFetch = fetchHistoricalData(HISTORY_RANGE)
        .then((rows) => {
            lastHistoryRows = Array.isArray(rows) ? rows : [];
            return lastHistoryRows;
        })
        .catch((error) => {
            console.warn('Network Pulse history fetch failed:', error);
            lastHistoryRows = [];
            return [];
        })
        .finally(() => {
            activeHistoryFetch = null;
        });
    return activeHistoryFetch;
}

async function getDomainHistoryRows() {
    if (activeDomainHistoryFetch) return activeDomainHistoryFetch;
    activeDomainHistoryFetch = getPulseDomainRows()
        .then((rows) => {
            lastDomainRows = {
                market: Array.isArray(rows?.market) ? rows.market : [],
                networkHealth: Array.isArray(rows?.networkHealth) ? rows.networkHealth : [],
                tezosx: Array.isArray(rows?.tezosx) ? rows.tezosx : [],
                governance: Array.isArray(rows?.governance) ? rows.governance : []
            };
            return lastDomainRows;
        })
        .catch((error) => {
            console.warn('Network Pulse domain history fetch failed:', error);
            return lastDomainRows;
        })
        .finally(() => {
            activeDomainHistoryFetch = null;
        });
    return activeDomainHistoryFetch;
}

function summaryLine(stats = {}) {
    const bakers = numericValue(stats.totalBakers);
    const staked = numericValue(stats.stakingRatio);
    const tx = numericValue(stats.transactionVolume24h);
    if (bakers !== null && staked !== null) {
        return `${formatCount(bakers)} bakers - ${formatPct(staked)} staked`;
    }
    if (tx !== null) return `${formatLarge(tx)} transactions in 24h`;
    return 'Live stats chamber';
}

function freshnessLabel(source = 'TzKT + RPC') {
    return formatFreshnessStamp(lastStatsAt || null, { source });
}

function refreshWindowLabel() {
    return `freshness ${Math.round(STATS_STALE_MS / 60000)}m`;
}

function latestMarketRow() {
    return latestRow(lastDomainRows.market);
}

function parsePercentText(text) {
    if (!text || text === '—' || text === '--') return null;
    const value = Number(String(text).replace(/[^0-9.+-]/g, ''));
    return Number.isFinite(value) ? value : null;
}

function isPlaceholderPriceText(text) {
    return !text || text === '—' || text === '--';
}

function entryPriceValue() {
    const domPrice = textFrom('#price-bar .price-value');
    if (!isPlaceholderPriceText(domPrice)) return domPrice;
    const marketPrice = latestMarketRow()?.price_usd;
    return marketPrice === null || marketPrice === undefined ? null : numericValue(marketPrice);
}

function formatEntryPrice(value) {
    if (typeof value === 'string' && value.trim()) return value;
    if (value === null || value === undefined) return '--';
    return numericValue(value) === null ? '--' : formatUsdPrice(value);
}

function entryPriceChangeDelta() {
    const text = textFrom('#price-bar [data-price-change="24h"] .price-change-value');
    const domDelta = parsePercentText(text);
    if (domDelta !== null) return domDelta;
    return numericValue(latestMarketRow()?.change_24h_pct);
}

function entryMetricValue(metric, stats = {}) {
    if (typeof metric.value === 'function') return metric.value(stats, { rows: lastEntryHistoryRows }, metric);
    const liveValue = stats?.[metric.key];
    if (liveValue !== null && liveValue !== undefined && liveValue !== '') return liveValue;
    // Keep boot passive: the history already loaded for sparklines can fill fields omitted by hero stats.
    return metric.history ? latestMetricValue(lastEntryHistoryRows, metric.history) : liveValue;
}

function entryHistorySample(stats = {}) {
    const usesHistory = ENTRY_METRICS.some((metric) => {
        if (!metric.history || typeof metric.value === 'function') return false;
        const liveValue = stats?.[metric.key];
        return (liveValue === null || liveValue === undefined || liveValue === '')
            && latestMetricValue(lastEntryHistoryRows, metric.history) !== null;
    });
    if (!usesHistory) return null;

    const row = latestRow(lastEntryHistoryRows);
    const timestamp = Date.parse(row?.timestamp || '');
    if (!Number.isFinite(timestamp)) return null;
    return {
        timestamp: row.timestamp,
        stale: Date.now() - timestamp > HISTORY_FRESHNESS_LIMITS.tezos_history
    };
}

function entryFreshnessLabel(stats = {}) {
    const sample = entryHistorySample(stats);
    if (sample) {
        const hasLiveStats = Boolean(stats && Object.keys(stats).length);
        const source = hasLiveStats ? 'Live + history' : 'History';
        return `${sample.stale ? 'stale · ' : ''}${formatFreshnessStamp(sample.timestamp, { source })}`;
    }
    return stats && Object.keys(stats).length ? freshnessLabel() : '';
}

function entryMetricPresentation(metric, stats = {}) {
    const raw = entryMetricValue(metric, stats);
    const value = metric.format ? metric.format(raw, stats, { rows: lastEntryHistoryRows }) : formatText(raw);
    return value || '--';
}

function entrySparkRows(rows = []) {
    if (!Array.isArray(rows) || !rows.length) return [];
    const cutoff = Date.now() - ENTRY_SPARK_RANGE_MS;
    const recent = rows.filter((row) => {
        const timestamp = Date.parse(row?.timestamp || '');
        return Number.isFinite(timestamp) && timestamp >= cutoff;
    });
    return recent.length >= 2 ? recent : rows.slice(-ENTRY_SPARK_POINTS);
}

function entryRelativeMove(metric, stats = {}, rows = lastEntryHistoryRows) {
    if (typeof metric.deltaFromDom === 'function') return metric.deltaFromDom();
    if (!metric.history) return null;
    const live = numericValue(entryMetricValue(metric, stats));
    if (live === null) return null;
    const points = historyPoints(metric, rows);
    const baseline = baselinePoint(points);
    if (!baseline || !Number.isFinite(baseline.value) || Math.abs(baseline.value) < 0.000001) return null;
    return ((live - baseline.value) / Math.abs(baseline.value)) * 100;
}

function entryTopMover(stats = {}, rows = lastEntryHistoryRows) {
    const moves = ENTRY_METRICS
        .map((metric) => ({ metric, move: entryRelativeMove(metric, stats, rows) }))
        .filter(({ move }) => Number.isFinite(move))
        .sort((a, b) => Math.abs(b.move) - Math.abs(a.move));
    if (!moves.length) return summaryLine(stats);
    const structural = moves.filter(({ metric, move }) => metric.tier === 'structural' && Math.abs(move) >= 0.5);
    const activity = moves.filter(({ metric, move }) => metric.tier === 'activity' && Math.abs(move) >= 25);
    const top = structural[0] || activity[0];
    if (!top) return 'Steady tape - biggest move under 0.5% in 24h';
    return `Top mover: ${top.metric.topLabel || top.metric.label} ${formatDeltaValue(top.move, { deltaDecimals: 1, deltaSuffix: '%' })} / 24h`;
}

function renderEntryDeltaChip(metric, stats = {}, rows = lastEntryHistoryRows) {
    const delta = typeof metric.deltaFromDom === 'function'
        ? metric.deltaFromDom()
        : entryRelativeMove(metric, stats, rows);
    if (!Number.isFinite(delta)) {
        return '<span class="network-pulse-entry-delta-space" aria-hidden="true"></span>';
    }
    const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
    return `<span class="network-pulse-delta network-pulse-entry-delta ${direction}" data-pulse-entry-delta>${escapeHtml(formatDeltaValue(delta, { deltaDecimals: 1, deltaSuffix: '%' }))} / 24h</span>`;
}

function renderEntrySparkline(metric, rows = lastEntryHistoryRows) {
    if (!metric.history) return '';
    return renderSparkline(metric, entrySparkRows(rows), {
        width: 120,
        height: 12,
        maxPoints: ENTRY_SPARK_POINTS,
        className: 'network-pulse-sparkline-svg network-pulse-entry-sparkline-svg'
    });
}

function renderEntryMetricButton(metric, stats = {}, rows = lastEntryHistoryRows) {
    return `
        <button class="chamber-entry-metric network-pulse-entry-metric" type="button" data-pulse-entry-key="${escapeHtml(metric.key)}" data-pulse-jump="${escapeHtml(metric.category)}" aria-label="Open ${escapeHtml(metric.label)} in Network Pulse Chamber">
            <span class="network-pulse-entry-label">${escapeHtml(metric.label)}</span>
            <strong class="network-pulse-entry-cell-value">${escapeHtml(entryMetricPresentation(metric, stats))}</strong>
            ${renderEntryDeltaChip(metric, stats, rows)}
            <span class="network-pulse-entry-sparkline" aria-hidden="true">${renderEntrySparkline(metric, rows)}</span>
        </button>
    `;
}

function renderEntryMetrics(stats = {}, rows = lastEntryHistoryRows) {
    return ENTRY_METRICS.map((metric) => renderEntryMetricButton(metric, stats, rows)).join('');
}

function updateEntryMetricCell(metricKey, stats = lastKnownStats(), rows = lastEntryHistoryRows) {
    const metric = ENTRY_METRICS.find((entry) => entry.key === metricKey);
    const existing = document.querySelector(`#network-pulse-entry-metrics [data-pulse-entry-key="${CSS.escape(metricKey)}"]`);
    if (!metric || !existing) return;
    existing.outerHTML = renderEntryMetricButton(metric, stats || {}, rows);
}

function priceCellNeedsDomUpdate() {
    const marketPrice = latestMarketRow()?.price_usd;
    return isPlaceholderPriceText(textFrom('#price-bar .price-value')) && (
        marketPrice === null ||
        marketPrice === undefined ||
        numericValue(marketPrice) === null
    );
}

function disconnectEntryPriceObserver() {
    entryPriceObserver?.disconnect();
    entryPriceObserver = null;
    if (entryPriceFrame) {
        window.cancelAnimationFrame(entryPriceFrame);
        entryPriceFrame = 0;
    }
}

function scheduleEntryPriceObserver() {
    if (entryPriceObserver || !priceCellNeedsDomUpdate() || typeof MutationObserver !== 'function') return;
    const priceBar = document.getElementById('price-bar');
    if (!priceBar) return;
    entryPriceObserver = new MutationObserver(() => {
        if (entryPriceFrame) return;
        entryPriceFrame = window.requestAnimationFrame(() => {
            entryPriceFrame = 0;
            updateEntryMetricCell('price', lastKnownStats());
            if (!priceCellNeedsDomUpdate()) disconnectEntryPriceObserver();
        });
    });
    entryPriceObserver.observe(priceBar, {
        childList: true,
        subtree: true,
        characterData: true
    });
}

function updateEntryCard(stats = lastKnownStats()) {
    const card = document.getElementById('network-pulse-entry-card');
    if (!card) return;
    const value = card.querySelector('#network-pulse-entry-value');
    const metrics = card.querySelector('#network-pulse-entry-metrics');
    const freshness = card.querySelector('#network-pulse-entry-freshness');

    if (value) value.textContent = stats ? entryTopMover(stats, lastEntryHistoryRows) : 'Opening pulse';
    if (metrics) metrics.innerHTML = renderEntryMetrics(stats || {}, lastEntryHistoryRows);
    if (freshness) freshness.textContent = entryFreshnessLabel(stats || {});
    delete card.dataset.updatedLabel;
    window.syncChamberEntryFooters?.(card);
    scheduleEntryPriceObserver();
}

function getEntryHistoryRows() {
    if (activeEntryHistoryFetch) return activeEntryHistoryFetch;
    activeEntryHistoryFetch = getPulseHistoryRows()
        .then((rows) => {
            lastEntryHistoryRows = Array.isArray(rows) ? rows : [];
            updateEntryCard(lastKnownStats());
            return lastEntryHistoryRows;
        })
        .catch((error) => {
            console.warn('Network Pulse entry history fetch failed:', error);
            lastEntryHistoryRows = [];
            updateEntryCard(lastKnownStats());
            return [];
        })
        .finally(() => {
            activeEntryHistoryFetch = null;
        });
    return activeEntryHistoryFetch;
}

function scheduleEntryHistoryRefresh() {
    const load = () => { getEntryHistoryRows(); };
    if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(load, { timeout: 2200 });
    }
    window.setTimeout(load, 0);
}

function handleStatsUpdated(event) {
    const stats = event?.detail?.stats || event?.detail;
    if (!stats || typeof stats !== 'object') return;
    const previous = lastKnownStats();
    // A lightweight hero refresh must not erase richer cached or chamber-fetched fields.
    lastStats = event?.detail?.source === 'hero'
        ? { ...(previous || {}), ...stats }
        : stats;
    lastStatsAt = loadStatsTimestamp() || Date.now();
    updateEntryCard(lastStats);
}

function bindEntryStatsEvents() {
    if (entryEventsReady) return;
    window.addEventListener('stats-updated', handleStatsUpdated);
    entryEventsReady = true;
}

function bindEntryDomObservers() {
    scheduleEntryPriceObserver();
}

function metricIsQuiet(metric, stats = {}, context = {}) {
    return typeof metric.quietWhen === 'function' && metric.quietWhen(stats, context, metric);
}

function metricPresentation(metric, stats = {}, rows = lastHistoryRows, domainRows = lastDomainRows) {
    const context = metricContext(stats, rows, domainRows);
    if (metricIsQuiet(metric, stats, context)) {
        const quietDetail = typeof metric.detail === 'function' ? metric.detail(stats || {}, context, metric) : metric.detail;
        return { value: 'Quiet', detail: quietDetail || '', freshness: metricFreshness(metric, context) };
    }
    const raw = currentMetricValue(metric, stats, context);
    const value = metric.format ? metric.format(raw, stats, context) : formatText(raw);
    const detail = typeof metric.detail === 'function' ? metric.detail(stats || {}, context, metric) : metric.detail;
    return { value, detail: detail || '', freshness: metricFreshness(metric, context) };
}

function numericValue(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function historyPoints(metric, rows = lastHistoryRows) {
    if (!metric.history || !Array.isArray(rows)) return [];
    return rows
        .map((row) => {
            const raw = Object.prototype.hasOwnProperty.call(row || {}, metric.history)
                ? row?.[metric.history]
                : rowValue(metric, row);
            const value = numericValue(raw);
            const timestamp = Date.parse(row?.timestamp || '');
            return value === null || !Number.isFinite(timestamp) ? null : { value, timestamp };
        })
        .filter(Boolean);
}

function baselinePoint(points) {
    if (points.length < 2) return null;
    const target = Date.now() - DAY_MS;
    const nearest = points.reduce((best, point) => {
        if (!best) return point;
        return Math.abs(point.timestamp - target) < Math.abs(best.timestamp - target) ? point : best;
    }, null);
    return nearest && Math.abs(nearest.timestamp - target) <= 3 * 60 * 60 * 1000 ? nearest : null;
}

function historyBaselineIsSound(metric, live, baseline) {
    if (!baseline || !Number.isFinite(live) || !Number.isFinite(baseline.value)) return false;
    if (metric.monotonic && baseline.value > live) return false;
    if (Number.isFinite(metric.maxDailyRelativeDelta)) {
        const denominator = Math.max(Math.abs(live), Math.abs(baseline.value), 1);
        if (Math.abs(live - baseline.value) / denominator > metric.maxDailyRelativeDelta) return false;
    }
    return true;
}

function formatDeltaValue(delta, metric) {
    const abs = Math.abs(delta);
    const decimals = metric.deltaDecimals ?? (abs < 10 ? 1 : 0);
    const sign = delta > 0 ? '+' : delta < 0 ? '-' : '±';
    const prefix = metric.deltaPrefix || '';
    if (metric.deltaSuffix === '%') return `${sign}${prefix}${abs.toFixed(decimals)}%`;
    if (metric.deltaSuffix) return `${sign}${prefix}${abs.toFixed(decimals)}${metric.deltaSuffix}`;
    if (abs >= 1000) return `${sign}${prefix}${formatLarge(abs)}`;
    return `${sign}${prefix}${abs.toFixed(decimals)}`;
}

function renderDeltaChip(metric, stats, rows = lastHistoryRows, domainRows = lastDomainRows) {
    const context = metricContext(stats, rows, domainRows);
    if (metricIsQuiet(metric, stats, context)) return '';
    let delta = null;
    if (typeof metric.deltaFromRow === 'function') {
        delta = metric.deltaFromRow(latestRow(rowsForMetric(metric, context)), stats, context);
    } else {
        const live = numericValue(currentMetricValue(metric, stats, context));
        if (!metric.history || live === null) return '';
        const points = historyPoints(metric, rowsForMetric(metric, context));
        const baseline = baselinePoint(points);
        if (!baseline) return '';
        if (!historyBaselineIsSound(metric, live, baseline)) {
            return '<span class="network-pulse-delta unavailable" data-pulse-delta data-pulse-delta-state="discontinuous" title="The 24-hour history point is inconsistent with the live total.">history discontinuity</span>';
        }
        delta = live - baseline.value;
    }
    delta = numericValue(delta);
    if (delta === null) return '';
    const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
    return `<span class="network-pulse-delta ${direction}" data-pulse-delta>${escapeHtml(formatDeltaValue(delta, metric))} / 24h</span>`;
}

function renderSparkline(metric, rows = lastHistoryRows, options = {}) {
    const points = historyPoints(metric, rows);
    if (points.length < 2) return '';
    const maxPoints = options.maxPoints || MAX_SPARK_POINTS;
    const step = Math.max(1, Math.ceil(points.length / maxPoints));
    const sampled = points.filter((_, index) => index % step === 0);
    if (sampled[sampled.length - 1] !== points[points.length - 1]) sampled.push(points[points.length - 1]);
    const values = sampled.map((point) => point.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const mean = values.reduce((total, value) => total + value, 0) / values.length;
    const relativeSpan = (max - min) / Math.max(Math.abs(mean), 0.000001);
    let domainMin = min;
    let domainMax = max;
    if (relativeSpan < 0.01) {
        const pad = Math.max(Math.abs(mean) * 0.01, 0.0001);
        domainMin = mean - pad;
        domainMax = mean + pad;
    }
    const span = Math.max(0.0001, domainMax - domainMin);
    const width = options.width || 220;
    const height = options.height || 42;
    const inset = Math.min(2, Math.max(0, height / 4));
    const drawHeight = Math.max(1, height - (inset * 2));
    const className = options.className || 'network-pulse-sparkline-svg';
    const coords = values.map((value, index) => {
        const x = (index / Math.max(1, values.length - 1)) * width;
        const y = (height - inset) - ((value - domainMin) / span) * drawHeight;
        return `${x.toFixed(1)},${Math.max(inset, Math.min(height - inset, y)).toFixed(1)}`;
    }).join(' ');
    return `
        <svg class="${escapeHtml(className)}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true" focusable="false">
            <polyline points="${coords}"></polyline>
        </svg>
    `;
}

function renderDetailContent({ detail, freshness }) {
    const age = freshness
        ? ` <span class="network-pulse-source-age${freshness.stale ? ' stale' : ''}" data-pulse-source-age>${escapeHtml(freshness.text)}</span>`
        : '';
    return `${escapeHtml(detail || '')}${age}`;
}

function renderHistoryButton(metric) {
    if (!metric.historyCard) return '';
    return `
        <button class="network-pulse-history-btn" type="button" data-pulse-history="${escapeHtml(metric.historyCard)}" aria-label="Open ${escapeHtml(metric.label)} history" title="Open ${escapeHtml(metric.label)} history">📊</button>
    `;
}

function renderMetricCard(metric, stats, rows = lastHistoryRows, domainRows = lastDomainRows) {
    const presentation = metricPresentation(metric, stats, rows, domainRows);
    const context = metricContext(stats, rows, domainRows);
    const sparkline = metricIsQuiet(metric, stats, context)
        ? ''
        : renderSparkline(metric, rowsForMetric(metric, context));
    const route = metric.route ? siteMapCanonicalRoute(metric.route) : '';
    const action = route ? `<a class="network-pulse-card-action" href="${escapeHtml(route)}">Open</a>` : '';
    const routeAttrs = route
        ? ` data-route="${escapeHtml(route)}" role="link" tabindex="0"`
        : '';
    return `
        <article class="network-pulse-card${metric.route ? ' network-pulse-card-clickable' : ''}" data-network-pulse-metric="${escapeHtml(metric.key)}"${routeAttrs}>
            <div class="network-pulse-card-top">
                <span class="network-pulse-card-label">${escapeHtml(metric.label)}</span>
                ${renderDeltaChip(metric, stats, rows, domainRows)}
            </div>
            <strong data-pulse-value data-chamber-arrival="value">${escapeHtml(presentation.value)}</strong>
            <p data-pulse-detail>${renderDetailContent(presentation)}</p>
            <div class="network-pulse-sparkline" data-pulse-sparkline>${sparkline}</div>
            <div class="network-pulse-card-actions">
                ${renderHistoryButton(metric)}
                ${action}
            </div>
        </article>
    `;
}

function renderGroup(group, stats, rows = lastHistoryRows, domainRows = lastDomainRows) {
    return `
        <section class="network-pulse-category" id="network-pulse-${escapeHtml(group.id)}" data-network-pulse-section="${escapeHtml(group.id)}">
            <div class="network-pulse-category-head">
                <div>
                    <span>Pulse category</span>
                    <h3>${escapeHtml(group.label)}</h3>
                </div>
                <p>${escapeHtml(group.detail)}</p>
            </div>
            <div class="network-pulse-card-grid">
                ${group.metrics.map((metric) => renderMetricCard(metric, stats, rows, domainRows)).join('')}
            </div>
        </section>
    `;
}

function roomRoute(item) {
    return siteMapRoute(item) || item.href || item.hash || '/';
}

function roomOverrideValue(id) {
    if (id === 'tz4') {
        return cleanText(document.querySelector('.stat-card[data-stat="tz4-adoption"]')?.dataset.tz4PowerDescription);
    }
    return '';
}

function compactRoomValue(value, fallback = 'Open chamber') {
    const text = cleanText(value) || fallback;
    if (text.length <= ROOM_VALUE_MAX) return text;
    const head = text.slice(0, ROOM_VALUE_MAX - 3).trim();
    const softBreak = head.replace(/\s+\S*$/, '').trim();
    return `${softBreak || head}...`;
}

function roomValue(item) {
    return compactRoomValue(
        roomOverrideValue(item.id) || textFrom(ROOM_VALUE_SELECTORS[item.id]),
        ROOM_FALLBACKS[item.id] || 'Open chamber'
    );
}

function chamberLinks() {
    return siteMapJourneyLinks('pulse', { limit: 4 })
        .filter((item) => item.id !== 'pulse' && (item.hash || item.href))
        .map((item) => ({
            id: item.id,
            label: item.title,
            detail: item.detail,
            route: roomRoute(item),
            value: () => roomValue(item)
        }));
}

function renderChamberLinks() {
    return `
        <section class="network-pulse-category network-pulse-category-rooms" id="network-pulse-rooms" data-network-pulse-section="rooms" data-site-wayfinder-native>
            <div class="network-pulse-category-head">
                <div>
                    <span>Keep exploring</span>
                    <h3>Next from Network Pulse</h3>
                </div>
                <p>Four related destinations continue the stories behind this live field.</p>
            </div>
            <div class="network-pulse-card-grid network-pulse-room-grid">
                ${chamberLinks().map((item) => `
                    <a class="network-pulse-card network-pulse-room-card" href="${escapeHtml(item.route)}" data-network-pulse-room="${escapeHtml(item.id)}" data-site-journey data-journey-from="pulse" data-journey-from-entry="pulse" data-journey-to="${escapeHtml(item.id)}" data-journey-surface="native-wayfinder" data-journey-reason="related-destination">
                        <span>${escapeHtml(item.label)}</span>
                        <strong data-pulse-room-value>${escapeHtml(cleanText(item.value()) || 'Open chamber')}</strong>
                        <p>${escapeHtml(item.detail)}</p>
                        <em>Open</em>
                    </a>
                `).join('')}
            </div>
            <nav class="site-wayfinder-actions" aria-label="More Tezos Systems destinations">
                <a class="site-wayfinder-action" href="/#chambers">All Chambers</a>
                <a class="site-wayfinder-action" href="/#search">Search Tezos Systems</a>
            </nav>
        </section>
    `;
}

function headerMeta(stats) {
    if (!stats) return 'Fetching live stats';
    return `${summaryLine(stats)} - ${freshnessLabel()}`;
}

function hasSeedStats(stats) {
    return Boolean(stats && typeof stats === 'object' && Object.keys(stats).length);
}

function pulseReading(stats) {
    return { key: 'pulse', state: hasSeedStats(stats) ? 'observed' : 'unavailable', sentence: 'This field combines network measurements with different capture clocks; a missing measurement is not zero.', receipts: [['Scope', 'Tezos L1 + L2'], ['Sources', 'TzKT, RPC, and captured history']], timestamp: lastStatsAt || null, clockLabel: 'Stats read' };
}

function renderNetworkPulseChamber(stats, container, { loading = false, rows = lastHistoryRows, domainRows = lastDomainRows } = {}) {
    if (!container) return;
    const seeded = hasSeedStats(stats);
    const fieldClasses = [
        'network-pulse-field',
        loading && !seeded ? 'is-loading' : '',
        loading && seeded ? 'is-refreshing' : ''
    ].filter(Boolean).join(' ');
    container.innerHTML = `
        <div class="chamber-header network-pulse-header chamber-anim-fade">
            <div class="lb-system-strip">
                <span class="lb-system-brand">Tezos.Systems</span>
                <span>Network Pulse</span>
                <span>TzKT + RPC live stats</span>
            </div>
            <div class="chamber-title-row">
                <h2 class="chamber-title">Network Pulse Chamber</h2>
                <span class="chamber-badge live" data-pulse-live-badge>${loading ? (seeded ? 'Warming' : 'Syncing') : 'Live'}</span>
                <span class="lb-live-pill lb-refresh-pill" data-pulse-refresh-pill>${refreshWindowLabel()}</span>
            </div>
            <div class="chamber-proposal-info">
                <div class="proposal-name">The full stats field in one place</div>
                <div class="proposal-hash" data-pulse-header-meta>${escapeHtml(headerMeta(stats))}</div>
            </div>
        </div>
        ${renderChamberVerdict(pulseReading(stats))}
        <div class="network-pulse-nav" aria-label="Network Pulse categories">
            ${GROUPS.map((group) => `<button type="button" data-pulse-target="network-pulse-${escapeHtml(group.id)}">${escapeHtml(group.label)}</button>`).join('')}
            <button type="button" data-pulse-target="network-pulse-rooms">Chambers</button>
        </div>
        <div class="${fieldClasses}">
            ${GROUPS.map((group) => renderGroup(group, stats || {}, rows, domainRows)).join('')}
            ${renderChamberLinks()}
        </div>
        <div class="chamber-footer chamber-anim-fade">
            <a href="#section=consensus">Inline stats -></a>
            <span class="chamber-footer-sep">·</span>
            <a href="https://tzkt.io/stats" target="_blank" rel="noopener">TzKT Stats -></a>
            <span class="chamber-footer-sep">·</span>
            <a class="panel-direct-link" href="/pulse/" aria-label="Direct link to Network Pulse Chamber">Direct: /pulse/</a>
        </div>
    `;
    container.dataset.networkPulseRendered = '1';
    settleChamberArrival(container, { quiet: loading });
    startScrollSpy();
}

function patchNetworkPulseChamber(stats, rows = lastHistoryRows, { loading = false, domainRows = lastDomainRows } = {}) {
    const overlay = document.getElementById('network-pulse-modal');
    const body = overlay?.querySelector('.network-pulse-body');
    if (!body || body.dataset.networkPulseRendered !== '1') return false;
    syncChamberVerdict(body, pulseReading(stats));

    const seeded = hasSeedStats(stats);
    body.querySelector('[data-pulse-live-badge]')?.replaceChildren(document.createTextNode(loading ? (seeded ? 'Warming' : 'Syncing') : 'Live'));
    body.querySelector('[data-pulse-refresh-pill]')?.replaceChildren(document.createTextNode(refreshWindowLabel()));
    body.querySelector('[data-pulse-header-meta]')?.replaceChildren(document.createTextNode(headerMeta(stats)));
    const field = body.querySelector('.network-pulse-field');
    field?.classList.toggle('is-loading', loading && !seeded);
    field?.classList.toggle('is-refreshing', loading && seeded);

    METRIC_BY_KEY.forEach((metric, key) => {
        const card = body.querySelector(`[data-network-pulse-metric="${CSS.escape(key)}"]`);
        if (!card) return;
        const presentation = metricPresentation(metric, stats || {}, rows, domainRows);
        card.querySelector('[data-pulse-value]')?.replaceChildren(document.createTextNode(presentation.value));
        const detail = card.querySelector('[data-pulse-detail]');
        if (detail) detail.innerHTML = renderDetailContent(presentation);
        const top = card.querySelector('.network-pulse-card-top');
        const existingDelta = top?.querySelector('[data-pulse-delta]');
        const nextDelta = renderDeltaChip(metric, stats || {}, rows, domainRows);
        if (top) {
            existingDelta?.remove();
            if (nextDelta) top.insertAdjacentHTML('beforeend', nextDelta);
        }
        const spark = card.querySelector('[data-pulse-sparkline]');
        if (spark) spark.innerHTML = renderSparkline(metric, rowsForMetric(metric, metricContext(stats || {}, rows, domainRows)));
    });

    chamberLinks().forEach((item) => {
        const room = body.querySelector(`[data-network-pulse-room="${CSS.escape(item.id)}"] [data-pulse-room-value]`);
        if (room) room.textContent = cleanText(item.value()) || 'Open chamber';
    });

    return true;
}

function renderNetworkPulseError(container) {
    if (!container) return;
    container.innerHTML = `
        <div class="chamber-error">
            <div class="error-icon">!</div>
            <div class="error-title">Couldn't reach Network Pulse data</div>
            <div class="error-detail">The chamber keeps cached values when it has them. Try again in a moment.</div>
            <button class="chamber-retry-btn" id="network-pulse-retry">Retry</button>
        </div>
        ${renderChamberLinks()}
    `;
    container.dataset.networkPulseRendered = '0';
    container.querySelector('#network-pulse-retry')?.addEventListener('click', () => refreshNetworkPulseChamber({ force: true }));
}

function lockPageScroll() {
    if (savedBodyOverflow !== null) return;
    savedBodyOverflow = document.body.style.overflow;
    savedHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
}

function unlockPageScroll() {
    if (savedBodyOverflow === null) return;
    document.body.style.overflow = savedBodyOverflow;
    document.documentElement.style.overflow = savedHtmlOverflow || '';
    savedBodyOverflow = null;
    savedHtmlOverflow = null;
}

function isInChamberAnchor(href) {
    return href && href.startsWith('#network-pulse-');
}

function closeBeforeRoute(route) {
    if (!route || isInChamberAnchor(route)) return;
    closeNetworkPulseChamber();
}

function shouldCloseForLink(link) {
    if (!link) return false;
    if (link.target === '_blank') return false;
    const rawHref = link.getAttribute('href') || '';
    if (!rawHref || isInChamberAnchor(rawHref)) return false;
    try {
        const url = new URL(link.href, window.location.href);
        if (url.origin !== window.location.origin) return false;
    } catch {
        return false;
    }
    return true;
}

function scrollToPulseTarget(targetId) {
    const target = document.getElementById(targetId);
    if (!target) return;
    setPulseNavActive(targetId);
    target.scrollIntoView({ behavior: 'auto', block: 'start' });
}

function setPulseNavActive(targetId) {
    const overlay = document.getElementById('network-pulse-modal');
    overlay?.querySelectorAll('[data-pulse-target]').forEach((button) => {
        const active = button.dataset.pulseTarget === targetId;
        button.classList.toggle('active', active);
        button.setAttribute('aria-current', active ? 'true' : 'false');
    });
}

function handlePulseBodyClick(event) {
    const historyButton = event.target.closest('[data-pulse-history]');
    if (historyButton) {
        event.preventDefault();
        event.stopPropagation();
        openCardHistoryModal(historyButton.dataset.pulseHistory);
        return;
    }

    const navButton = event.target.closest('[data-pulse-target]');
    if (navButton) {
        event.preventDefault();
        scrollToPulseTarget(navButton.dataset.pulseTarget);
        return;
    }

    const link = event.target.closest('a[href]');
    if (link) {
        const href = link.getAttribute('href') || '';
        if (shouldCloseForLink(link)) closeBeforeRoute(href);
        return;
    }

    const card = event.target.closest('.network-pulse-card-clickable[data-route]');
    if (!card) return;
    const route = card.dataset.route;
    if (!route) return;
    event.preventDefault();
    closeBeforeRoute(route);
    if (route.startsWith('#')) {
        window.location.hash = route.slice(1);
    } else {
        window.location.href = route;
    }
}

function handlePulseBodyKeydown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const card = event.target.closest('.network-pulse-card-clickable[data-route]');
    if (!card || event.target.closest('button, a')) return;
    event.preventDefault();
    const route = card.dataset.route;
    closeBeforeRoute(route);
    if (route?.startsWith('#')) window.location.hash = route.slice(1);
    else if (route) window.location.href = route;
}

function ensureOverlay() {
    let overlay = document.getElementById('network-pulse-modal');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'network-pulse-modal';
    overlay.className = 'modal-overlay chamber-overlay lb-overlay network-pulse-overlay';
    overlay.innerHTML = `
        <div class="modal-content modal-large chamber-content lb-content network-pulse-content" role="dialog" aria-modal="true" aria-label="Network Pulse Chamber" tabindex="-1">
            <button class="modal-close chamber-close" aria-label="Close">&times;</button>
            <div class="chamber-body lb-body network-pulse-body"></div>
        </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('.chamber-close')?.addEventListener('click', closeNetworkPulseChamber);
    overlay.querySelector('.network-pulse-body')?.addEventListener('click', handlePulseBodyClick);
    overlay.querySelector('.network-pulse-body')?.addEventListener('keydown', handlePulseBodyKeydown);
    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) closeNetworkPulseChamber();
    });
    return overlay;
}

function startScrollSpy() {
    if (pulseObserver) pulseObserver.disconnect();
    const overlay = document.getElementById('network-pulse-modal');
    const content = overlay?.querySelector('.network-pulse-content');
    const body = overlay?.querySelector('.network-pulse-body');
    if (!content || !body || typeof IntersectionObserver === 'undefined') return;

    pulseObserver = new IntersectionObserver(() => {
        window.requestAnimationFrame(() => {
            if (!overlay.classList.contains('active')) return;
            const contentRect = content.getBoundingClientRect();
            const anchor = contentRect.top + Math.min(110, contentRect.height * 0.22);
            const visible = Array.from(body.querySelectorAll('.network-pulse-category[id]'))
                .map((section, index) => ({ section, index, rect: section.getBoundingClientRect() }))
                .filter(({ rect }) => rect.bottom > contentRect.top + 72 && rect.top < contentRect.bottom - 12)
                .sort((left, right) => (
                    Math.abs(left.rect.top - anchor) - Math.abs(right.rect.top - anchor)
                    || right.index - left.index
                ))[0];
            if (visible?.section?.id) setPulseNavActive(visible.section.id);
        });
    }, { root: content, rootMargin: '-90px 0px -55% 0px', threshold: 0.08 });

    body.querySelectorAll('.network-pulse-category[id]').forEach((section) => pulseObserver.observe(section));
    setPulseNavActive('network-pulse-consensus');
}

function stopScrollSpy() {
    if (pulseObserver) pulseObserver.disconnect();
    pulseObserver = null;
}

async function refreshNetworkPulseChamber({ force = false } = {}) {
    const overlay = document.getElementById('network-pulse-modal');
    const body = overlay?.querySelector('.network-pulse-body');
    if (!body) return;

    const cached = lastKnownStats();
    if (cached && body.dataset.networkPulseRendered !== '1') {
        renderNetworkPulseChamber(cached, body, { loading: true, rows: lastHistoryRows, domainRows: lastDomainRows });
    } else if (cached) {
        patchNetworkPulseChamber(cached, lastHistoryRows, { loading: true, domainRows: lastDomainRows });
    }

    try {
        const [stats, rows, domainRows] = await Promise.all([
            getFreshStats({ force }),
            getHistoryRows(),
            getDomainHistoryRows()
        ]);
        if (!patchNetworkPulseChamber(stats, rows, { domainRows })) {
            renderNetworkPulseChamber(stats, body, { rows, domainRows });
        }
        updateEntryCard(stats);
    } catch (error) {
        console.warn('Network Pulse chamber refresh failed:', error);
        if (cached) {
            if (!patchNetworkPulseChamber(cached, lastHistoryRows, { domainRows: lastDomainRows })) renderNetworkPulseChamber(cached, body, { rows: lastHistoryRows, domainRows: lastDomainRows });
        } else {
            renderNetworkPulseError(body);
        }
    }
}

function startChamberRefresh() {
    if (chamberTimer) return;
    chamberTimer = window.setInterval(() => {
        if (document.visibilityState === 'visible') refreshNetworkPulseChamber();
    }, CHAMBER_REFRESH_MS);
}

function stopChamberRefresh() {
    if (chamberTimer) window.clearInterval(chamberTimer);
    chamberTimer = null;
}

async function openNetworkPulseSection(sectionId) {
    const targetId = sectionId ? `network-pulse-${sectionId}` : '';
    const openPromise = openNetworkPulseChamber();
    if (targetId) {
        window.requestAnimationFrame(() => scrollToPulseTarget(targetId));
        window.setTimeout(() => scrollToPulseTarget(targetId), 250);
    }
    await openPromise;
    if (targetId) window.requestAnimationFrame(() => scrollToPulseTarget(targetId));
}

function handleEntryMetricClick(event) {
    const button = event.target.closest('[data-pulse-jump]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    openNetworkPulseSection(button.dataset.pulseJump);
}

function bindEntryMetricJumps(card) {
    const metrics = card?.querySelector('#network-pulse-entry-metrics');
    if (!metrics || metrics.dataset.pulseJumpWired === '1') return;
    metrics.dataset.pulseJumpWired = '1';
    metrics.addEventListener('click', handleEntryMetricClick);
}

function bindEntryOpenAction(card) {
    const button = card?.querySelector('.network-pulse-entry-open');
    if (!button || button.dataset.pulseOpenWired === '1') return;
    button.dataset.pulseOpenWired = '1';
    button.addEventListener('click', () => openNetworkPulseChamber());
}

function wireEntryLauncher(card) {
    wireChamberLauncher(card, {
        open: openNetworkPulseChamber,
        label: 'Open Network Pulse Chamber',
        titleSelector: '#network-pulse-entry-title, .stat-label'
    });
}

export async function openNetworkPulseChamber({ isCurrent = () => true } = {}) {
    if (!isCurrent()) return;
    bindChamberVisibility('network-pulse-modal', () => refreshNetworkPulseChamber());
    await ensureNetworkPulseCss();
    if (!isCurrent()) return;
    const overlay = ensureOverlay();
    const body = overlay.querySelector('.network-pulse-body');
    body.dataset.networkPulseRendered = '0';
    renderNetworkPulseChamber(lastKnownStats(), body, { loading: true, rows: lastHistoryRows, domainRows: lastDomainRows });
    overlay.classList.add('active');
    activateChamberDialog(overlay, {
        close: closeNetworkPulseChamber,
        dialogSelector: '.network-pulse-content',
        label: 'Network Pulse Chamber',
        restoreFocusSelector: '#network-pulse-entry-card'
    });
    lockPageScroll();
    const content = overlay.querySelector('.network-pulse-content');
    if (content) content.scrollTop = 0;
    await refreshNetworkPulseChamber({ force: true });
    if (!isCurrent() || !overlay.classList.contains('active')) return;
    startChamberRefresh();
}

export function closeNetworkPulseChamber() {
    const overlay = document.getElementById('network-pulse-modal');
    if (!requestChamberClose(overlay)) return;
    stopChamberRefresh();
    stopScrollSpy();
    overlay?.classList.remove('active');
    deactivateChamberDialog(overlay);
    unlockPageScroll();
}

export function initNetworkPulseChamber() {
    ensureNetworkPulseCss().catch((error) => console.warn('Network Pulse styles unavailable', error));
    bindEntryStatsEvents();
    bindEntryDomObservers();
    if (document.getElementById('network-pulse-entry-card')) {
        const existing = document.getElementById('network-pulse-entry-card');
        bindEntryMetricJumps(existing);
        bindEntryOpenAction(existing);
        wireEntryLauncher(existing);
        updateEntryCard(lastKnownStats());
        scheduleEntryHistoryRefresh();
        return;
    }

    const grid = document.getElementById('chambers-grid');
    if (!grid) return;

    const card = document.createElement('article');
    card.id = 'network-pulse-entry-card';
    card.className = 'stat-card chamber-entry-card chamber-entry-wide chamber-entry-live network-pulse-entry-card';
    card.setAttribute('aria-labelledby', 'network-pulse-entry-title');
    card.innerHTML = `
        <button class="card-copy-link" type="button" data-copy-hash="#pulse" aria-label="Copy Network Pulse Chamber direct link" title="Copy Network Pulse link">&#128279;</button>
        <div class="card-inner">
            <div class="card-front chamber-entry-front network-pulse-entry-front">
                <div class="network-pulse-entry-head">
                    <h2 class="stat-label" id="network-pulse-entry-title">Network Pulse</h2>
                    <div class="stat-value network-pulse-entry-value" id="network-pulse-entry-value">Opening pulse</div>
                    <span class="network-pulse-entry-freshness" id="network-pulse-entry-freshness"></span>
                </div>
                <div class="chamber-entry-metrics network-pulse-entry-metrics" id="network-pulse-entry-metrics">${renderEntryMetrics(lastKnownStats() || {})}</div>
                <button class="network-pulse-entry-open" type="button">Open Network Pulse <span aria-hidden="true">→</span></button>
            </div>
        </div>
    `;

    bindEntryMetricJumps(card);
    bindEntryOpenAction(card);

    grid.prepend(card);
    wireEntryLauncher(card);
    updateEntryCard(lastKnownStats());
    scheduleEntryHistoryRefresh();
}
