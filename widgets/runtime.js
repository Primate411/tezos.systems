import '../js/core/tzkt-throttle.js';
import { fetchWithRetry } from '../js/core/api.js';
import { API_URLS, FETCH_LIMITS, STAKING_TARGET } from '../js/core/config.js';
import { quietlyMutate, quietlySyncHtml } from '../js/core/quiet-refresh.js';
import { DEFAULT_THEME, THEME_COLORS, THEMES } from '../js/ui/theme.js';

const WIDGET_REFRESH_DEFAULT_SECONDS = 60;
const WIDGET_REFRESH_MIN_SECONDS = 10;
const WIDGET_REFRESH_MAX_SECONDS = 3600;
const WIDGET_UTM_CAMPAIGN = 'tezos_systems_widgets';

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
const PROTOCOL_HASH_NAMES = {
    PsUshuai: 'Ushuaia',
    PtTALLiN: 'Tallinn',
    PtSeouLo: 'Seoul',
    PsRiotum: 'Rio',
    PsQuebec: 'Quebec',
    PsParisC: 'Paris C',
    PtParisB: 'Paris'
};

export const WIDGET_ENDPOINTS = {
    activeBakerCount() {
        return `${API_URLS.tzkt}/delegates/count?active=true&bakingPower.gt=0`;
    },
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

function widgetSlug(value) {
    return String(value || 'widget')
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64) || 'widget';
}

export function trackedDashboardUrl({
    origin = location.origin,
    path = '/',
    medium = 'widget',
    campaign = WIDGET_UTM_CAMPAIGN,
    content = getWidgetTypeFromPath()
} = {}) {
    const url = new URL(path, origin);
    url.searchParams.set('utm_source', 'tezos_systems');
    url.searchParams.set('utm_medium', widgetSlug(medium));
    url.searchParams.set('utm_campaign', widgetSlug(campaign));
    url.searchParams.set('utm_content', widgetSlug(content));
    return url.toString();
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
    document.querySelectorAll('a.footer[href*="tezos.systems"]').forEach((link) => {
        link.href = trackedDashboardUrl({
            origin: 'https://tezos.systems',
            medium: 'widget_attribution',
            content: getWidgetTypeFromPath()
        });
        link.textContent = 'powered by tezos.systems ->';
        link.dataset.trackedAttribution = 'true';
    });
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
    params.set('utm_source', 'tezos_systems');
    params.set('utm_medium', 'widget');
    params.set('utm_campaign', WIDGET_UTM_CAMPAIGN);
    params.set('utm_content', widget.type);
    return `${origin}/widgets/${widget.path}?${params.toString()}`;
}

export function iframeCode(url, width, height) {
    return `<iframe src="${url}"\n  width="${width}" height="${height}" frameborder="0"\n  style="border-radius: 8px; overflow: hidden;">\n</iframe>`;
}

export function markdownCode(url, type) {
    const directUrl = new URL(url, 'https://tezos.systems');
    directUrl.searchParams.set('utm_medium', 'widget_markdown');
    return `[Open the Tezos ${type} widget](${directUrl.toString()})`;
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
    // A refreshed timestamp must describe a new source response, not a memory-cache hit.
    return fetchWithRetry(url, { cache: 'no-store', ...options, memoryCache: false }, 2);
}

export async function fetchWidgetBatch(urls) {
    const results = await Promise.allSettled(urls.map(url => fetchWidgetJson(url)));
    const failure = results.find(result => result.status === 'rejected');
    if (failure) throw failure.reason;
    return results.map(result => result.value);
}

/** Load first, then commit one complete reading only while the embed is visible. */
export function startWidgetRefresh(fetcher, refreshMs, view = null) {
    const intervalMs = Math.max(WIDGET_REFRESH_MIN_SECONDS * 1000, refreshMs);
    let lastRun = 0;
    let inFlight = false;
    let pending = null;
    const apply = (outcome) => {
        if (view) view.commit(outcome);
        else if (!outcome.error && typeof outcome.render === 'function') outcome.render();
    };
    const runIfVisible = () => {
        if (document.hidden || inFlight) return;
        lastRun = Date.now();
        inFlight = true;
        Promise.resolve().then(fetcher)
            .then(render => ({ render, receivedAt: Date.now() }), error => ({ error }))
            .then(outcome => {
                if (document.hidden) pending = outcome;
                else apply(outcome);
            })
            .catch(() => {})
            .finally(() => { inFlight = false; });
    };
    const intervalId = window.setInterval(runIfVisible, intervalMs);
    document.addEventListener('visibilitychange', () => {
        if (document.hidden || inFlight) return;
        // A response that completed while hidden is applied once on return. If
        // already due, discard it and make one new complete catch-up request.
        if (Date.now() - lastRun >= intervalMs) {
            pending = null;
            runIfVisible();
        } else if (pending) {
            const outcome = pending;
            pending = null;
            apply(outcome);
        }
    });
    view?.retry.addEventListener('click', runIfVisible);
    runIfVisible();
    return intervalId;
}

/** Existing text nodes preserve selection and SVG/control identity. */
export function setWidgetText(element, value) {
    const text = String(value);
    if (element.childNodes.length === 1 && element.firstChild.nodeType === Node.TEXT_NODE) {
        if (element.firstChild.nodeValue !== text) element.firstChild.nodeValue = text;
    } else if (element.textContent !== text) element.textContent = text;
}

export function syncWidgetHtml(element, html) {
    quietlySyncHtml(element, html);
}

export function createWidgetView({ source = 'TzKT', empty = null, notFound = false } = {}) {
    const root = document.querySelector('.widget');
    const status = root.querySelector('.widget-freshness');
    const retry = root.querySelector('.widget-retry');
    let lastGoodAt = null;
    return {
        retry,
        commit({ render, error, receivedAt }) {
            quietlyMutate(root, () => {
                if (!error) {
                    render();
                    lastGoodAt = receivedAt;
                } else if (lastGoodAt === null) {
                    empty?.(error);
                    root.querySelectorAll('.loading').forEach(element => element.classList.remove('loading'));
                }
                const missing = notFound && error?.status === 404;
                const state = error ? (missing ? 'missing' : lastGoodAt === null ? 'unavailable' : 'stale') : 'current';
                const clock = lastGoodAt === null ? '' : new Date(lastGoodAt).toISOString().slice(11, 16);
                const age = lastGoodAt === null ? '' : Math.max(0, Math.floor((Date.now() - lastGoodAt) / 60000)) + 'm';
                const label = error ? (missing ? 'Not found' : lastGoodAt === null ? 'Unavailable' : 'Stale ' + age) : clock + ' UTC';
                setWidgetText(status, source + ' · ' + label);
                status.dataset.state = state;
                status.title = source + (error ? (missing ? ': baker not found' : ': refresh unavailable') : ': source received')
                    + (lastGoodAt === null ? '' : '; last successful reading ' + new Date(lastGoodAt).toISOString());
                if (lastGoodAt !== null) status.dataset.lastGoodAt = String(lastGoodAt);
                setWidgetText(retry, error ? 'Retry' : 'Refresh');
            });
        }
    };
}

// JSON null, blanks and booleans are absence, not numeric zero.
export function widgetNumber(value) {
    if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

export function requireWidgetNumber(value, { integer = false, minimum = 0 } = {}) {
    const number = widgetNumber(value);
    if (number === null || number < minimum || (integer && !Number.isSafeInteger(number))) {
        throw new Error('Unavailable numeric reading');
    }
    return number;
}

export function requireWidgetProtocol(protocol) {
    if (!protocol || typeof protocol.hash !== 'string' || !protocol.hash.trim()) throw new Error('Unavailable protocol');
    requireWidgetNumber(protocol.code, { integer: true });
    return protocol;
}

export function requireWidgetBakers(bakers) {
    if (!Array.isArray(bakers) || !bakers.length) throw new Error('Unavailable baker catalog');
    for (const baker of bakers) {
        if (!baker || typeof baker.address !== 'string') throw new Error('Unavailable baker identity');
        requireWidgetNumber(baker.bakingPower);
    }
    return bakers;
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
    const number = widgetNumber(value);
    return number !== null ? number.toLocaleString('en-US') : '—';
}

export function formatCompact(value) {
    const number = widgetNumber(value);
    if (number === null) return '—';
    const abs = Math.abs(number);
    if (abs >= 1e9) return `${(number / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `${(number / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `${(number / 1e3).toFixed(1)}K`;
    return number.toLocaleString('en-US');
}

export function formatPercent(value, decimals = 1) {
    const number = widgetNumber(value);
    return number !== null ? `${number.toFixed(decimals)}%` : '—';
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
    const supply = widgetNumber(stats?.totalSupply);
    const own = widgetNumber(stats?.totalOwnStaked);
    const external = widgetNumber(stats?.totalExternalStaked);
    // Legacy totalFrozen is usable only when both modern fields are absent.
    // One missing modern field is an incomplete snapshot, not a zero component.
    const modern = stats?.totalOwnStaked != null || stats?.totalExternalStaked != null;
    const staked = modern
        ? own !== null && external !== null && own >= 0 && external >= 0 ? own + external : null
        : widgetNumber(stats?.totalFrozen);
    return supply !== null && supply > 0 && staked !== null && staked >= 0 && staked <= supply
        ? (staked / supply) * 100 : null;
}

export function targetLabel() {
    return `${STAKING_TARGET}%`;
}

export function protocolAlias(protocol) {
    const hashPrefix = protocol?.hash ? String(protocol.hash).slice(0, 8) : '';
    return protocol?.extras?.alias
        || protocol?.metadata?.alias
        || protocol?.alias
        || PROTOCOL_HASH_NAMES[hashPrefix]
        || hashPrefix
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
