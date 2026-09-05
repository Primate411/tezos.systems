/**
 * Tezos Systems - XTZ Price Bar Module
 * Displays live XTZ price in USD, EUR, and BTC with 24h/7d/30d changes and market cap
 * Caches data per user session, refreshes every 30 minutes
 */

const COINGECKO_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=tezos&vs_currencies=usd,eur,btc&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true';
const COINGECKO_HORIZONS_URL = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=tezos&order=market_cap_desc&per_page=1&page=1&sparkline=false&price_change_percentage=24h,7d,30d';
const CACHE_KEY = 'tezos_price_cache';
const CACHE_SCHEMA = 2;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const FETCH_TIMEOUT_MS = 15_000;

let priceTimer = null;
let lastPrice = null;

/**
 * Get cached price data if still fresh
 */
function getCachedPrice() {
    try {
        const raw = sessionStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const cached = JSON.parse(raw);
        if (cached.schema === CACHE_SCHEMA && Date.now() - cached.timestamp < CACHE_TTL) {
            return cached.data;
        }
        sessionStorage.removeItem(CACHE_KEY);
    } catch (e) {
        // Ignore storage errors
    }
    return null;
}

/**
 * Cache price data
 */
function setCachedPrice(data) {
    try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({
            schema: CACHE_SCHEMA,
            timestamp: Date.now(),
            data
        }));
    } catch (e) {
        // Ignore storage errors
    }
}

/**
 * Fetch XTZ price data from CoinGecko (or cache)
 */
async function fetchPrice() {
    // Check cache first
    const cached = getCachedPrice();
    if (cached) return cached;

    try {
        const fetchJson = async (url) => {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
            try {
                const res = await fetch(url, { signal: controller.signal });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return await res.json();
            } finally {
                clearTimeout(timer);
            }
        };
        const [spotResult, horizonsResult] = await Promise.allSettled([
            fetchJson(COINGECKO_URL),
            fetchJson(COINGECKO_HORIZONS_URL)
        ]);
        const spot = spotResult.status === 'fulfilled' ? spotResult.value?.tezos : null;
        const horizons = horizonsResult.status === 'fulfilled' && Array.isArray(horizonsResult.value)
            ? horizonsResult.value[0]
            : null;
        if (!spot && !horizons) {
            const reason = spotResult.reason?.message || horizonsResult.reason?.message || 'unavailable';
            throw new Error(reason);
        }
        const priceData = {
            ...(spot || {}),
            usd: spot?.usd ?? horizons?.current_price ?? null,
            usd_24h_change: spot?.usd_24h_change
                ?? horizons?.price_change_percentage_24h_in_currency
                ?? horizons?.price_change_percentage_24h
                ?? null,
            usd_7d_change: horizons?.price_change_percentage_7d_in_currency ?? null,
            usd_30d_change: horizons?.price_change_percentage_30d_in_currency ?? null,
            usd_market_cap: spot?.usd_market_cap ?? horizons?.market_cap ?? null,
            usd_24h_vol: spot?.usd_24h_vol ?? horizons?.total_volume ?? null
        };
        if (priceData) {
            setCachedPrice(priceData);
            lastPrice = priceData.usd ?? lastPrice;
        }
        return priceData;
    } catch (e) {
        console.warn('Price fetch failed:', e.message);
        return null;
    }
}

/**
 * Share pending CoinGecko requests and the 30-minute session cache.
 * Exported for use by calculator.js, hen-mode.js, my-tezos.js, price-intelligence.js.
 */
let _xtzPricePromise = null;
export async function fetchXTZPrice() {
    // Return session-cached data if fresh enough
    const cached = getCachedPrice();
    if (cached) return cached;
    // Dedup concurrent callers
    if (_xtzPricePromise) return _xtzPricePromise;
    _xtzPricePromise = fetchPrice().finally(() => { _xtzPricePromise = null; });
    return _xtzPricePromise;
}

/**
 * Format currency price with consistent decimals
 */
function formatCurrency(value, symbol) {
    if (value >= 1) return `${symbol}${value.toFixed(2)}`;
    if (value >= 0.01) return `${symbol}${value.toFixed(3)}`;
    return `${symbol}${value.toFixed(4)}`;
}

function formatPrice(usd) { return formatCurrency(usd, '$'); }
function formatEur(eur) { return formatCurrency(eur, '€'); }

/**
 * Format BTC price as sats with ₿ symbol
 */
function formatBtc(btc) {
    const sats = Math.round(btc * 1e8);
    return `${sats.toLocaleString()} sats`;
}

/**
 * Format 24h change as "+4.5%" or "-2.1%"
 */
function formatChange(pct) {
    const sign = pct >= 0 ? '+' : '';
    return `${sign}${pct.toFixed(1)}%`;
}

/**
 * Format market cap
 */
function formatMarketCap(mc) {
    if (mc >= 1e9) return `$${(mc / 1e9).toFixed(2)}B`;
    if (mc >= 1e6) return `$${(mc / 1e6).toFixed(0)}M`;
    return `$${mc.toLocaleString()}`;
}

/**
 * Update the price bar DOM
 */
function updatePriceBar(data) {
    const bar = document.getElementById('price-bar');
    if (!bar) return;

    const priceEl = bar.querySelector('.price-value');
    const eurEl = document.getElementById('price-eur');
    const btcEl = document.getElementById('price-btc');
    const mcapEl = bar.querySelector('.price-mcap');

    const price = data.usd;
    const mcap = data.usd_market_cap;

    // Update USD price
    priceEl.textContent = formatPrice(price);

    // Pulse animation on price change
    if (lastPrice !== null && lastPrice !== price) {
        priceEl.classList.remove('price-pulse');
        void priceEl.offsetWidth; // reflow
        priceEl.classList.add('price-pulse');
    }
    lastPrice = price;

    // Update compact rolling USD changes without rebuilding the price strip.
    const changes = [
        ['24h', '24 hour', data.usd_24h_change],
        ['7d', '7 day', data.usd_7d_change],
        ['30d', '30 day', data.usd_30d_change]
    ];
    changes.forEach(([period, spokenPeriod, rawChange]) => {
        const changeEl = bar.querySelector(`[data-price-change="${period}"]`);
        const valueEl = changeEl?.querySelector('.price-change-value');
        if (rawChange === null || rawChange === undefined || rawChange === '') return;
        const change = Number(rawChange);
        if (!changeEl || !valueEl || !Number.isFinite(change)) return;
        const formatted = formatChange(change);
        valueEl.textContent = formatted;
        changeEl.classList.toggle('positive', change >= 0);
        changeEl.classList.toggle('negative', change < 0);
        changeEl.setAttribute('aria-label', `XTZ ${spokenPeriod} price change ${formatted}`);
    });

    // Update EUR (removed from bar)
    if (eurEl && data.eur) {
        eurEl.textContent = formatEur(data.eur);
    }

    // Update BTC
    if (btcEl && data.btc) {
        btcEl.textContent = formatBtc(data.btc);
    }

    // Update market cap
    if (mcap) {
        mcapEl.textContent = `MCap ${formatMarketCap(mcap)}`;
    }

    bar.classList.add('visible');
}

/**
 * Fetch and update price
 */
async function refreshPrice() {
    if (document.visibilityState !== 'visible') return;
    const data = await fetchXTZPrice();
    if (data) {
        updatePriceBar(data);
    }
}

/**
 * Initialize the price bar
 */
export function initPriceBar() {
    const bar = document.getElementById('price-bar');
    if (!bar) return;

    // Initial fetch (may hit cache)
    refreshPrice();

    // Auto-refresh every 30 minutes (matches cache TTL)
    if (priceTimer !== null) clearInterval(priceTimer);
    priceTimer = setInterval(refreshPrice, CACHE_TTL);
}
