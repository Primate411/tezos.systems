import '../js/core/tzkt-throttle.js';
import { fetchWithRetry } from '../js/core/api.js';
import { API_URLS, FETCH_LIMITS, STAKING_TARGET } from '../js/core/config.js';
import { DEFAULT_THEME, THEME_COLORS, THEMES } from '../js/ui/theme.js';

const WIDGET_REFRESH_DEFAULT_SECONDS = 60;
const WIDGET_REFRESH_MIN_SECONDS = 10;
const WIDGET_REFRESH_MAX_SECONDS = 3600;

export const DEFAULT_WIDGET_THEME = DEFAULT_THEME;
export const WIDGET_THEMES = {
    ...THEME_COLORS,
    light: THEME_COLORS.clean,
    'dark-theme': THEME_COLORS.dark,
    transparent: { bg: 'transparent', accent: '#ffffff', text: '#ffffff' }
};
export const WIDGET_THEME_ORDER = [...THEMES, 'transparent'];

export const WIDGET_CATALOG = [
    {
        type: 'baker-count',
        path: 'baker-count.html',
        icon: '🥐',
        name: 'Baker Count',
        description: 'Active bakers',
        defaultWidth: 300,
        defaultHeight: 120
    },
    {
        type: 'price',
        path: 'price.html',
        icon: '💰',
        name: 'XTZ Price',
        description: 'Price + 24h change',
        defaultWidth: 300,
        defaultHeight: 120
    },
    {
        type: 'block-height',
        path: 'block-height.html',
        icon: '⛓️',
        name: 'Block Height',
        description: 'Live ticker',
        defaultWidth: 300,
        defaultHeight: 120
    },
    {
        type: 'staking-ratio',
        path: 'staking-ratio.html',
        icon: '🔒',
        name: 'Staking Ratio',
        description: 'Gauge chart',
        defaultWidth: 300,
        defaultHeight: 120
    },
    {
        type: 'protocol',
        path: 'protocol.html',
        icon: '⚡',
        name: 'Protocol',
        description: 'Current protocol',
        defaultWidth: 300,
        defaultHeight: 120
    },
    {
        type: 'governance',
        path: 'governance.html',
        icon: '🗳️',
        name: 'Governance',
        description: 'Voting period',
        defaultWidth: 300,
        defaultHeight: 120
    },
    {
        type: 'baker-card',
        path: 'baker-card.html',
        icon: '📋',
        name: 'Baker Card',
        description: 'Baker report',
        defaultWidth: 300,
        defaultHeight: 120,
        requiresBaker: true
    },
    {
        type: 'combo',
        path: 'combo.html',
        icon: '📊',
        name: 'Combo Strip',
        description: 'Multi-stat',
        defaultWidth: 400,
        defaultHeight: 120,
        defaultStats: ['bakers', 'price', 'blocks']
    }
];

export const COMBO_STAT_OPTIONS = [
    { key: 'bakers', label: 'Bakers', sub: 'Active' },
    { key: 'price', label: 'XTZ Price', sub: 'USD' },
    { key: 'blocks', label: 'Block', sub: 'Height' },
    { key: 'staking', label: 'Staked', sub: '% of Supply' },
    { key: 'protocol', label: 'Protocol', sub: 'Version' },
    { key: 'cycle', label: 'Cycle', sub: 'Current' },
    { key: 'health', label: 'Head Age', sub: 'Freshness' },
    { key: 'tz4', label: 'tz4 Power', sub: 'BLS Adoption' }
];

const COMBO_STAT_KEYS = new Set(COMBO_STAT_OPTIONS.map((stat) => stat.key));

export const WIDGET_ENDPOINTS = {
    activeBakers() {
        return `${API_URLS.tzkt}/delegates?active=true&select=address,alias,consensusAddress,bakingPower&limit=${FETCH_LIMITS.bakers}`;
    },
    baker(address) {
        return `${API_URLS.tzkt}/delegates/${encodeURIComponent(address)}`;
    },
    head() {
        return `${API_URLS.tzkt}/head`;
    },
    statistics() {
        return `${API_URLS.tzkt}/statistics/current`;
    },
    price() {
        return `${API_URLS.coingecko}/simple/price?ids=tezos&vs_currencies=usd&include_24hr_change=true`;
    },
    currentProtocol() {
        return `${API_URLS.tzkt}/protocols/current`;
    },
    protocols() {
        return `${API_URLS.tzkt}/protocols?limit=200`;
    },
    currentVotingPeriod() {
        return `${API_URLS.tzkt}/voting/periods/current`;
    }
};

export function getWidgetByType(type) {
    return WIDGET_CATALOG.find((widget) => widget.type === type) || WIDGET_CATALOG[0];
}

export function getWidgetTypeFromPath(pathname = location.pathname) {
    const file = pathname.split('/').pop() || '';
    const type = file.replace(/\.html$/, '');
    return getWidgetByType(type).type;
}

export function normalizeWidgetTheme(value) {
    const key = String(value || '').trim().toLowerCase();
    if (WIDGET_THEMES[key]) return key;
    return DEFAULT_WIDGET_THEME;
}

export function normalizeAccent(value) {
    if (!value) return '';
    const hex = String(value).trim().replace(/^#/, '');
    return /^[0-9a-fA-F]{6}$/.test(hex) ? `#${hex}` : '';
}

export function normalizeRefreshSeconds(value, fallback = WIDGET_REFRESH_DEFAULT_SECONDS) {
    const parsed = Number.parseInt(value, 10);
    const seconds = Number.isFinite(parsed) ? parsed : fallback;
    return Math.max(WIDGET_REFRESH_MIN_SECONDS, Math.min(WIDGET_REFRESH_MAX_SECONDS, seconds));
}

export function getWidgetSettings(defaults = {}) {
    const params = new URLSearchParams(location.search);
    const theme = normalizeWidgetTheme(params.get('theme') || defaults.theme || DEFAULT_WIDGET_THEME);
    const accent = normalizeAccent(params.get('accent') || defaults.accent || '');
    const refreshSeconds = normalizeRefreshSeconds(params.get('refresh'), defaults.refreshSeconds);
    return {
        params,
        theme,
        accent,
        refreshSeconds,
        refreshMs: refreshSeconds * 1000
    };
}

export function applyWidgetTheme(settings = getWidgetSettings()) {
    const theme = WIDGET_THEMES[settings.theme] || WIDGET_THEMES[DEFAULT_WIDGET_THEME];
    const root = document.documentElement;
    root.style.setProperty('--bg', theme.bg);
    root.style.setProperty('--accent', settings.accent || theme.accent);
    root.style.setProperty('--text', theme.text);
    root.dataset.widgetTheme = settings.theme;
    return settings;
}

export function widgetUrl({
    origin = location.origin,
    type,
    theme = DEFAULT_WIDGET_THEME,
    refreshSeconds = WIDGET_REFRESH_DEFAULT_SECONDS,
    accent = '',
    baker = '',
    stats = []
}) {
    const widget = getWidgetByType(type);
    const params = new URLSearchParams();
    params.set('theme', normalizeWidgetTheme(theme));
    const normalizedRefresh = normalizeRefreshSeconds(refreshSeconds);
    if (normalizedRefresh !== WIDGET_REFRESH_DEFAULT_SECONDS) {
        params.set('refresh', normalizedRefresh);
    }
    const normalizedAccent = normalizeAccent(accent);
    if (normalizedAccent) params.set('accent', normalizedAccent.slice(1));
    if (widget.requiresBaker && baker) params.set('baker', baker);
    if (widget.type === 'combo') {
        const comboStats = normalizeComboStats(stats);
        if (comboStats.length) params.set('stats', comboStats.join(','));
    }
    return `${origin}/widgets/${widget.path}?${params.toString()}`;
}

export function iframeCode(url, width, height) {
    return `<iframe src="${url}"\n  width="${width}" height="${height}" frameborder="0"\n  style="border-radius: 8px; overflow: hidden;">\n</iframe>`;
}

export function markdownCode(url, type) {
    return `[![Tezos ${type} widget](${url})](https://tezos.systems)`;
}

export function normalizeComboStats(stats, fallback = ['bakers', 'price', 'blocks']) {
    const raw = Array.isArray(stats) ? stats : String(stats || '').split(',');
    const normalized = raw
        .map((item) => String(item || '').trim().toLowerCase())
        .filter((item, index, arr) => COMBO_STAT_KEYS.has(item) && arr.indexOf(item) === index)
        .slice(0, 4);
    return normalized.length ? normalized : fallback;
}

export async function fetchWidgetJson(url, options = {}) {
    return fetchWithRetry(url, { cache: 'no-store', memoryCache: true, ...options }, 2);
}

export function startWidgetRefresh(fetcher, refreshMs) {
    fetcher();
    return window.setInterval(fetcher, Math.max(WIDGET_REFRESH_MIN_SECONDS * 1000, refreshMs));
}

export function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
}

export function formatCount(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toLocaleString('en-US') : '—';
}

export function formatCompact(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '—';
    const abs = Math.abs(number);
    if (abs >= 1e9) return `${(number / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `${(number / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `${(number / 1e3).toFixed(1)}K`;
    return number.toLocaleString('en-US');
}

export function formatPercent(value, decimals = 1) {
    const number = Number(value);
    return Number.isFinite(number) ? `${number.toFixed(decimals)}%` : '—';
}

export function shortAddress(address) {
    const value = String(address || '');
    return value ? `${value.slice(0, 6)}…${value.slice(-4)}` : '—';
}

export function poweredBakers(bakers) {
    return Array.isArray(bakers)
        ? bakers.filter((baker) => Number(baker?.bakingPower || 0) > 0)
        : [];
}

export function stakingRatioFromStats(stats) {
    const staked = Number(stats?.totalOwnStaked || 0) + Number(stats?.totalExternalStaked || 0) || Number(stats?.totalFrozen || 0);
    const supply = Number(stats?.totalSupply || 0);
    return staked && supply ? (staked / supply) * 100 : null;
}

export function targetLabel() {
    return `${STAKING_TARGET}%`;
}

export function protocolAlias(protocol) {
    return protocol?.extras?.alias
        || protocol?.metadata?.alias
        || protocol?.alias
        || protocol?.hash?.slice(0, 8)
        || '—';
}

export function summarizeTz4Power(bakers) {
    const powered = poweredBakers(bakers);
    const totalPower = powered.reduce((sum, baker) => sum + Number(baker.bakingPower || 0), 0);
    const activePower = powered
        .filter((baker) => String(baker.consensusAddress || baker.address || '').startsWith('tz4'))
        .reduce((sum, baker) => sum + Number(baker.bakingPower || 0), 0);
    return totalPower ? (activePower / totalPower) * 100 : null;
}

export function formatHeadAge(timestamp) {
    if (!timestamp) return '—';
    const diff = Date.now() - new Date(timestamp).getTime();
    if (!Number.isFinite(diff)) return '—';
    if (diff < 0) return 'now';
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h`;
}
