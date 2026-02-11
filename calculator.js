/**
 * Staking Rewards Calculator
 * Calculates estimated XTZ staking/delegation/baker rewards with compound projections
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

let currentMode = 'delegate';

function debounce(fn, ms) {
    return (...args) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => fn(...args), ms);
    };
}

async function fetchXTZPrice() {
    if (cachedPrice && Date.now() - priceFetchedAt < CACHE_TTL) return cachedPrice;
    const priceEl = document.querySelector('.price-value');
    if (priceEl) {
        const parsed = parseFloat(priceEl.textContent.replace(/[^0-9.]/g, ''));
        if (parsed > 0) { cachedPrice = parsed; priceFetchedAt = Date.now(); return cachedPrice; }
    }
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

async function getAPY() {
    if (cachedAPY && Date.now() - apyFetchedAt < CACHE_TTL) return cachedAPY;
    try {
        cachedAPY = await fetchStakingAPY();
        apyFetchedAt = Date.now();
        return cachedAPY;
    } catch (err) {
        console.error('Failed to fetch APY:', err);
        return cachedAPY || { delegateAPY: 3.1, stakeAPY: 9.2 };
    }
}

function formatNum(n, decimals = 2) {
    return n.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

function calcRewards(amount, apyPct) {
    const rate = apyPct / 100;
    return {
        daily: amount * rate / 365.25,
        monthly: amount * rate / 12,
        yearly: amount * rate
    };
}

function calcCompound(amount, apyPct, years) {
    const rate = apyPct / 100;
    const cyclesPerYear = 486.7;
    return amount * Math.pow(1 + rate / cyclesPerYear, cyclesPerYear * years);
}

function saveState() {
    try {
        const state = {
            mode: currentMode,
            amount: document.getElementById('calc-amount')?.value || '',
            extStaked: document.getElementById('calc-ext-staked')?.value || '',
            stakingFee: document.getElementById('calc-staking-fee')?.value || '5',
            extDelegated: document.getElementById('calc-ext-delegated')?.value || '',
            delegPayout: document.getElementById('calc-deleg-payout')?.value || '80'
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {}
}

function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
}

function setResult(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function clearCompound() {
    const body = document.getElementById('calc-compound-body');
    if (body) while (body.firstChild) body.removeChild(body.firstChild);
}

function clearResults() {
    setResult('calc-daily-xtz', '—');
    setResult('calc-daily-usd', '—');
    setResult('calc-monthly-xtz', '—');
    setResult('calc-monthly-usd', '—');
    setResult('calc-yearly-xtz', '—');
    setResult('calc-yearly-usd', '—');
    setResult('calc-apy-display', '—');
    clearCompound();
    removeBreakdown();
}

function removeBreakdown() {
    const existing = document.getElementById('calc-baker-breakdown');
    if (existing) existing.remove();
}

function renderBreakdown(items, container) {
    removeBreakdown();
    const div = document.createElement('div');
    div.className = 'calc-baker-breakdown';
    div.id = 'calc-baker-breakdown';
    const h4 = document.createElement('h4');
    h4.textContent = 'Yearly Income Breakdown';
    div.appendChild(h4);

    for (const item of items) {
        const row = document.createElement('div');
        row.className = 'calc-breakdown-row' + (item.total ? ' calc-breakdown-total' : '');
        const label = document.createElement('span');
        label.className = 'calc-breakdown-label';
        label.textContent = item.label;
        const value = document.createElement('span');
        value.className = 'calc-breakdown-value';
        value.textContent = item.value;
        row.appendChild(label);
        row.appendChild(value);
        div.appendChild(row);
    }

    container.appendChild(div);
}

/**
 * Calculate baker income from all sources
 */
function calcBakerIncome(ownStake, extStaked, stakingFeePct, extDelegated, delegPayoutPct, stakeAPY, delegateAPY) {
    // 1. Own stake rewards (full staker APY on own stake)
    const ownRewards = ownStake * (stakeAPY / 100);

    // 2. Staking fee income (fee % of external stakers' rewards)
    const extStakerRewards = extStaked * (stakeAPY / 100);
    const stakingFeeIncome = extStakerRewards * (stakingFeePct / 100);

    // 3. Delegation income (baker keeps what's not paid out to delegators)
    const delegRewards = extDelegated * (delegateAPY / 100);
    const delegBakerKeep = delegRewards * (1 - delegPayoutPct / 100);

    const total = ownRewards + stakingFeeIncome + delegBakerKeep;
    return { ownRewards, stakingFeeIncome, delegBakerKeep, total };
}

async function updateResults() {
    const amountInput = document.getElementById('calc-amount');
    if (!amountInput) return;

    const amount = parseFloat(amountInput.value) || 0;
    saveState();

    if (currentMode === 'baker') {
        return updateBakerResults(amount);
    }

    // Delegate or Stake mode
    removeBreakdown();
    if (amount <= 0) { clearResults(); return; }

    const [apy, price] = await Promise.all([getAPY(), fetchXTZPrice()]);
    const apyPct = currentMode === 'stake' ? apy.stakeAPY : apy.delegateAPY;

    setResult('calc-apy-display', formatNum(apyPct, 1) + '%');

    const rewards = calcRewards(amount, apyPct);
    setResult('calc-daily-xtz', formatNum(rewards.daily, 4) + ' ꜩ');
    setResult('calc-daily-usd', '$' + formatNum(rewards.daily * price));
    setResult('calc-monthly-xtz', formatNum(rewards.monthly, 2) + ' ꜩ');
    setResult('calc-monthly-usd', '$' + formatNum(rewards.monthly * price));
    setResult('calc-yearly-xtz', formatNum(rewards.yearly, 2) + ' ꜩ');
    setResult('calc-yearly-usd', '$' + formatNum(rewards.yearly * price));

    renderCompound(amount, apyPct, price);
}

async function updateBakerResults(ownStake) {
    const extStaked = parseFloat(document.getElementById('calc-ext-staked')?.value) || 0;
    const stakingFee = parseFloat(document.getElementById('calc-staking-fee')?.value) || 5;
    const extDelegated = parseFloat(document.getElementById('calc-ext-delegated')?.value) || 0;
    const delegPayout = parseFloat(document.getElementById('calc-deleg-payout')?.value) || 80;

    if (ownStake <= 0 && extStaked <= 0 && extDelegated <= 0) { clearResults(); return; }

    const [apy, price] = await Promise.all([getAPY(), fetchXTZPrice()]);
    const income = calcBakerIncome(ownStake, extStaked, stakingFee, extDelegated, delegPayout, apy.stakeAPY, apy.delegateAPY);

    // Show effective APY relative to own stake (if any)
    const effectiveAPY = ownStake > 0 ? (income.total / ownStake) * 100 : 0;
    setResult('calc-apy-display', ownStake > 0 ? formatNum(effectiveAPY, 1) + '%' : '—');

    // Show total baker income in the reward cards
    const daily = income.total / 365.25;
    const monthly = income.total / 12;
    setResult('calc-daily-xtz', formatNum(daily, 4) + ' ꜩ');
    setResult('calc-daily-usd', '$' + formatNum(daily * price));
    setResult('calc-monthly-xtz', formatNum(monthly, 2) + ' ꜩ');
    setResult('calc-monthly-usd', '$' + formatNum(monthly * price));
    setResult('calc-yearly-xtz', formatNum(income.total, 2) + ' ꜩ');
    setResult('calc-yearly-usd', '$' + formatNum(income.total * price));

    // Breakdown
    const resultsGrid = document.getElementById('calc-results');
    if (resultsGrid) {
        const items = [
            { label: `Own Stake (${formatNum(apy.stakeAPY, 1)}% APY)`, value: formatNum(income.ownRewards, 2) + ' ꜩ' },
            { label: `Staking Fee (${stakingFee}% of ext. staker rewards)`, value: formatNum(income.stakingFeeIncome, 2) + ' ꜩ' },
            { label: `Delegation (keep ${100 - delegPayout}% of rewards)`, value: formatNum(income.delegBakerKeep, 2) + ' ꜩ' },
            { label: 'Total Yearly Income', value: formatNum(income.total, 2) + ' ꜩ ($' + formatNum(income.total * price) + ')', total: true }
        ];
        // Insert after results grid, before compound
        const compound = document.querySelector('.calc-compound');
        const container = resultsGrid.parentElement;
        removeBreakdown();
        const breakdownDiv = document.createElement('div');
        breakdownDiv.className = 'calc-baker-breakdown';
        breakdownDiv.id = 'calc-baker-breakdown';
        const h4 = document.createElement('h4');
        h4.textContent = 'Yearly Income Breakdown';
        breakdownDiv.appendChild(h4);
        for (const item of items) {
            const row = document.createElement('div');
            row.className = 'calc-breakdown-row' + (item.total ? ' calc-breakdown-total' : '');
            const label = document.createElement('span');
            label.className = 'calc-breakdown-label';
            label.textContent = item.label;
            const value = document.createElement('span');
            value.className = 'calc-breakdown-value';
            value.textContent = item.value;
            row.appendChild(label);
            row.appendChild(value);
            breakdownDiv.appendChild(row);
        }
        if (compound) container.insertBefore(breakdownDiv, compound);
        else container.appendChild(breakdownDiv);
    }

    // Compound based on total income reinvested to own stake
    renderCompound(ownStake, effectiveAPY, price);
}

function renderCompound(amount, apyPct, price) {
    const compoundRows = document.getElementById('calc-compound-body');
    if (!compoundRows || amount <= 0) { clearCompound(); return; }

    while (compoundRows.firstChild) compoundRows.removeChild(compoundRows.firstChild);

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

function setMode(mode) {
    currentMode = mode;
    const toggle = document.getElementById('calc-mode-toggle');
    if (toggle) {
        toggle.querySelectorAll('.calc-toggle-btn').forEach(btn => {
            btn.classList.toggle('calc-toggle-active', btn.dataset.mode === mode);
        });
    }

    // Show/hide baker fields
    const bakerFields = document.getElementById('calc-baker-fields');
    if (bakerFields) bakerFields.style.display = mode === 'baker' ? '' : 'none';

    // Update amount label
    const label = document.getElementById('calc-amount-label');
    if (label) label.textContent = mode === 'baker' ? 'Own Stake (XTZ)' : 'Amount (XTZ)';

    updateResults();
}

const CALC_VISIBLE_KEY = 'tezos-systems-calc-visible';

function updateCalcVisibility(isVisible) {
    const section = document.getElementById('calculator-section');
    const toggleBtn = document.getElementById('calc-toggle');
    if (section) section.classList.toggle('visible', isVisible);
    if (toggleBtn) {
        toggleBtn.classList.toggle('active', isVisible);
        toggleBtn.title = `Calculator: ${isVisible ? 'ON' : 'OFF'}`;
    }
}

function toggleCalc() {
    const isVisible = localStorage.getItem(CALC_VISIBLE_KEY) === 'true';
    const newState = !isVisible;
    localStorage.setItem(CALC_VISIBLE_KEY, String(newState));
    updateCalcVisibility(newState);
}

export function initCalculator() {
    const section = document.getElementById('calculator-section');
    if (!section) return;

    // Setup toggle button
    const calcToggleBtn = document.getElementById('calc-toggle');
    if (calcToggleBtn) {
        calcToggleBtn.addEventListener('click', toggleCalc);
    }

    // Restore visibility (default: off)
    const visStored = localStorage.getItem(CALC_VISIBLE_KEY);
    const isVisible = visStored === 'true';
    updateCalcVisibility(isVisible);

    const amountInput = document.getElementById('calc-amount');
    if (!amountInput) return;

    // Restore state
    const saved = loadState();
    if (saved) {
        if (saved.amount) amountInput.value = saved.amount;
        if (saved.extStaked) {
            const el = document.getElementById('calc-ext-staked');
            if (el) el.value = saved.extStaked;
        }
        if (saved.stakingFee) {
            const el = document.getElementById('calc-staking-fee');
            if (el) el.value = saved.stakingFee;
        }
        if (saved.extDelegated) {
            const el = document.getElementById('calc-ext-delegated');
            if (el) el.value = saved.extDelegated;
        }
        if (saved.delegPayout) {
            const el = document.getElementById('calc-deleg-payout');
            if (el) el.value = saved.delegPayout;
        }
    }

    // Mode toggle buttons
    const toggle = document.getElementById('calc-mode-toggle');
    if (toggle) {
        toggle.addEventListener('click', (e) => {
            const btn = e.target.closest('.calc-toggle-btn');
            if (btn && btn.dataset.mode) setMode(btn.dataset.mode);
        });
    }

    // Baker field inputs
    const bakerInputs = ['calc-ext-staked', 'calc-staking-fee', 'calc-ext-delegated', 'calc-deleg-payout'];
    const debouncedUpdate = debounce(updateResults, DEBOUNCE_MS);

    amountInput.addEventListener('input', debouncedUpdate);
    for (const id of bakerInputs) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', debouncedUpdate);
    }

    // Set initial mode
    const initialMode = saved?.mode || 'delegate';
    setMode(initialMode);
}
