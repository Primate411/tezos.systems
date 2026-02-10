/**
 * Staking Rewards Calculator
 * Calculates estimated XTZ staking/delegation rewards with compound projections
 */

import { fetchStakingAPY } from './api.js';

const STORAGE_KEY = 'tezos-calc-state';
const COINGECKO_PRICE_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=tezos&vs_currencies=usd';
const DEBOUNCE_MS = 300;

let debounceTimer = null;
let cachedAPY = null;
let cachedPrice = null;
let apyFetchedAt = 0;
let priceFetchedAt = 0;
const CACHE_TTL = 120000; // 2 min

/**
 * Debounce helper
 */
function debounce(fn, ms) {
    return (...args) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => fn(...args), ms);
    };
}

/**
 * Fetch XTZ price from CoinGecko with caching
 */
async function fetchXTZPrice() {
    if (cachedPrice && Date.now() - priceFetchedAt < CACHE_TTL) {
        return cachedPrice;
    }
    // Try reading from the price bar DOM first (price.js already fetches this)
    const priceEl = document.querySelector('.price-value');
    if (priceEl) {
        const text = priceEl.textContent.replace(/[^0-9.]/g, '');
        const parsed = parseFloat(text);
        if (parsed > 0) {
            cachedPrice = parsed;
            priceFetchedAt = Date.now();
            return cachedPrice;
        }
    }
    // Fallback: fetch from CoinGecko directly
    try {
        const res = await fetch(COINGECKO_PRICE_URL);
        if (!res.ok) throw new Error('CoinGecko fetch failed');
        const data = await res.json();
        cachedPrice = data.tezos.usd;
        priceFetchedAt = Date.now();
        return cachedPrice;
    } catch (err) {
        console.error('Failed to fetch XTZ price:', err);
        return cachedPrice || 0;
    }
}

/**
 * Get APY rates with caching
 */
async function getAPY() {
    if (cachedAPY && Date.now() - apyFetchedAt < CACHE_TTL) {
        return cachedAPY;
    }
    try {
        cachedAPY = await fetchStakingAPY();
        apyFetchedAt = Date.now();
        return cachedAPY;
    } catch (err) {
        console.error('Failed to fetch APY:', err);
        return cachedAPY || { delegateAPY: 3.1, stakeAPY: 9.2 };
    }
}

/**
 * Format number with commas
 */
function formatNum(n, decimals = 2) {
    return n.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

/**
 * Calculate rewards
 */
function calcRewards(amount, apyPct) {
    const rate = apyPct / 100;
    const daily = amount * rate / 365.25;
    const monthly = amount * rate / 12;
    const yearly = amount * rate;
    return { daily, monthly, yearly };
}

/**
 * Calculate compound projection (1-5 years)
 */
function calcCompound(amount, apyPct, years) {
    const rate = apyPct / 100;
    // Compound per cycle (~18h, ~486.7 cycles/year)
    const cyclesPerYear = 486.7;
    const total = amount * Math.pow(1 + rate / cyclesPerYear, cyclesPerYear * years);
    return total;
}

/**
 * Save state to localStorage
 */
function saveState(amount, mode) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ amount, mode }));
    } catch (_) { /* quota exceeded, ignore */ }
}

/**
 * Load state from localStorage
 */
function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (_) {
        return null;
    }
}

/**
 * Update the calculator results in the DOM
 */
async function updateResults() {
    const amountInput = document.getElementById('calc-amount');
    const modeToggle = document.getElementById('calc-mode-toggle');
    const resultsDiv = document.getElementById('calc-results');

    if (!amountInput || !resultsDiv) return;

    const amount = parseFloat(amountInput.value);
    const isStake = modeToggle && modeToggle.checked;
    const mode = isStake ? 'stake' : 'delegate';

    // Save to localStorage
    saveState(amountInput.value, mode);

    // Update toggle label
    const modeLabel = document.getElementById('calc-mode-label');
    if (modeLabel) modeLabel.textContent = isStake ? 'Stake' : 'Delegate';

    if (!amount || amount <= 0 || isNaN(amount)) {
        // Clear results
        setResult('calc-daily-xtz', '—');
        setResult('calc-daily-usd', '—');
        setResult('calc-monthly-xtz', '—');
        setResult('calc-monthly-usd', '—');
        setResult('calc-yearly-xtz', '—');
        setResult('calc-yearly-usd', '—');
        setResult('calc-apy-display', '—');
        clearCompound();
        return;
    }

    // Fetch data
    const [apy, price] = await Promise.all([getAPY(), fetchXTZPrice()]);
    const apyPct = isStake ? apy.stakeAPY : apy.delegateAPY;

    // Update APY display
    setResult('calc-apy-display', formatNum(apyPct, 1) + '%');

    // Simple rewards
    const rewards = calcRewards(amount, apyPct);
    setResult('calc-daily-xtz', formatNum(rewards.daily, 4) + ' ꜩ');
    setResult('calc-daily-usd', '$' + formatNum(rewards.daily * price));
    setResult('calc-monthly-xtz', formatNum(rewards.monthly, 2) + ' ꜩ');
    setResult('calc-monthly-usd', '$' + formatNum(rewards.monthly * price));
    setResult('calc-yearly-xtz', formatNum(rewards.yearly, 2) + ' ꜩ');
    setResult('calc-yearly-usd', '$' + formatNum(rewards.yearly * price));

    // Compound projection
    const compoundRows = document.getElementById('calc-compound-body');
    if (compoundRows) {
        // Clear existing rows
        while (compoundRows.firstChild) {
            compoundRows.removeChild(compoundRows.firstChild);
        }
        for (let y = 1; y <= 5; y++) {
            const total = calcCompound(amount, apyPct, y);
            const earned = total - amount;
            const row = document.createElement('div');
            row.className = 'calc-compound-row';

            const yearEl = document.createElement('span');
            yearEl.className = 'calc-compound-year';
            yearEl.textContent = y + 'Y';

            const xtzEl = document.createElement('span');
            xtzEl.className = 'calc-compound-xtz';
            xtzEl.textContent = formatNum(total, 2) + ' ꜩ';

            const earnedEl = document.createElement('span');
            earnedEl.className = 'calc-compound-earned';
            earnedEl.textContent = '+' + formatNum(earned, 2) + ' ꜩ ($' + formatNum(earned * price) + ')';

            row.appendChild(yearEl);
            row.appendChild(xtzEl);
            row.appendChild(earnedEl);
            compoundRows.appendChild(row);
        }
    }
}

function setResult(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function clearCompound() {
    const body = document.getElementById('calc-compound-body');
    if (body) {
        while (body.firstChild) {
            body.removeChild(body.firstChild);
        }
    }
}

/**
 * Initialize calculator
 */
export function initCalculator() {
    const section = document.getElementById('calculator-section');
    if (!section) return;

    const amountInput = document.getElementById('calc-amount');
    const modeToggle = document.getElementById('calc-mode-toggle');

    if (!amountInput) return;

    // Restore state
    const saved = loadState();
    if (saved) {
        if (saved.amount) amountInput.value = saved.amount;
        if (saved.mode === 'stake' && modeToggle) modeToggle.checked = true;
    }

    const debouncedUpdate = debounce(updateResults, DEBOUNCE_MS);

    amountInput.addEventListener('input', debouncedUpdate);
    if (modeToggle) {
        modeToggle.addEventListener('change', () => {
            updateResults();
        });
    }

    // Initial calculation if there's a saved value
    if (saved && saved.amount) {
        updateResults();
    }
}
