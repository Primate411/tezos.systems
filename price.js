/**
 * Tezos Systems - XTZ Price Bar Module
 * Displays live XTZ/USD price, 24h change, and market cap rank
 */

const COINGECKO_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=tezos&vs_currencies=usd&include_24hr_change=true&include_market_cap=true';
const COINGECKO_PAGE = 'https://www.coingecko.com/en/coins/tezos';
const REFRESH_INTERVAL = 60000;

let priceTimer = null;
let lastPrice = null;

/**
 * Fetch XTZ price data from CoinGecko
 */
async function fetchPrice() {
    try {
        const res = await fetch(COINGECKO_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return data.tezos || null;
    } catch (e) {
        console.warn('Price fetch failed:', e.message);
        return null;
    }
}

/**
 * Format price as "$1.23"
 */
function formatPrice(usd) {
    if (usd >= 1) return `$${usd.toFixed(2)}`;
    if (usd >= 0.01) return `$${usd.toFixed(3)}`;
    return `$${usd.toFixed(4)}`;
}

/**
 * Format 24h change as "+4.5%" or "-2.1%"
 */
function formatChange(pct) {
    const sign = pct >= 0 ? '+' : '';
    return `${sign}${pct.toFixed(1)}%`;
}

/**
 * Estimate market cap rank from market cap value
 * CoinGecko simple/price doesn't return rank, so we show market cap instead
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
    const changeEl = bar.querySelector('.price-change');
    const mcapEl = bar.querySelector('.price-mcap');

    const price = data.usd;
    const change = data.usd_24h_change;
    const mcap = data.usd_market_cap;

    // Update price
    priceEl.textContent = formatPrice(price);

    // Pulse animation on price change
    if (lastPrice !== null && lastPrice !== price) {
        priceEl.classList.remove('price-pulse');
        void priceEl.offsetWidth; // reflow
        priceEl.classList.add('price-pulse');
    }
    lastPrice = price;

    // Update 24h change
    if (change != null) {
        changeEl.textContent = formatChange(change);
        changeEl.className = 'price-change ' + (change >= 0 ? 'positive' : 'negative');
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
    const data = await fetchPrice();
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

    // Initial fetch
    refreshPrice();

    // Auto-refresh
    priceTimer = setInterval(refreshPrice, REFRESH_INTERVAL);
}
