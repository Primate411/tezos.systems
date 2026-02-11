/**
 * Tezos Systems - XTZ Price Bar Module
 * Displays live XTZ price in USD, EUR, and BTC with 24h change and market cap
 * Caches data per user session, refreshes every 30 minutes
 */

import { REFRESH_INTERVALS } from './config.js';

const COINGECKO_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=tezos&vs_currencies=usd,eur,btc&include_24hr_change=true&include_market_cap=true';
const COINGECKO_PAGE = 'https://www.coingecko.com/en/coins/tezos';
const CACHE_KEY = 'tezos_price_cache';
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

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
        if (Date.now() - cached.timestamp < CACHE_TTL) {
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
        const res = await fetch(COINGECKO_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const priceData = data.tezos || null;
        if (priceData) setCachedPrice(priceData);
        return priceData;
    } catch (e) {
        console.warn('Price fetch failed:', e.message);
        return null;
    }
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
    const changeEl = bar.querySelector('.price-change');
    const eurEl = document.getElementById('price-eur');
    const btcEl = document.getElementById('price-btc');
    const mcapEl = bar.querySelector('.price-mcap');

    const price = data.usd;
    const change = data.usd_24h_change;
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

    // Update 24h change
    if (change != null) {
        changeEl.textContent = formatChange(change);
        changeEl.className = 'price-change ' + (change >= 0 ? 'positive' : 'negative');
    }

    // Update EUR
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

    // Initial fetch (may hit cache)
    refreshPrice();

    // Auto-refresh every 30 minutes (matches cache TTL)
    priceTimer = setInterval(refreshPrice, CACHE_TTL);
}
