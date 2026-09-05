/**
 * Staking Rewards Calculator
 * Calculates estimated XTZ staking/delegation/baker rewards with compound projections
 */

import { fetchProtocolConstants, fetchStakingAPY } from '../core/api.js';
import { tweenNumber } from '../effects/data-magic.js';
import { fetchXTZPrice } from './price.js';

const STORAGE_KEY = 'tezos-calc-state';
const DEBOUNCE_MS = 300;
const HOURS_PER_YEAR = 365.25 * 24;
const FALLBACK_CYCLE_HOURS = 18;
const FALLBACK_ACTIVATION_DELAY_CYCLES = 2;

let debounceTimer = null;
let cachedAPY = null;
let apyFetchedAt = 0;
let cachedProtocolTiming = null;
let protocolTimingFetchedAt = 0;
const CACHE_TTL = 120000; // 2 min

let currentMode = 'delegate';
let latestProjection = null;
let updateSequence = 0;

function debounce(fn, ms) {
    return (...args) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => fn(...args), ms);
    };
}

async function getXTZPrice() {
    try {
        const data = await fetchXTZPrice();
        const price = Number(data?.usd);
        return Number.isFinite(price) && price > 0 ? price : null;
    } catch (err) {
        console.error('Failed to fetch XTZ price:', err);
        return null;
    }
}

async function getAPY() {
    if (cachedAPY && Date.now() - apyFetchedAt < CACHE_TTL) return cachedAPY;
    try {
        const result = await fetchStakingAPY();
        if (Number.isFinite(result?.delegateAPY) && Number.isFinite(result?.stakeAPY)) {
            cachedAPY = result;
            apyFetchedAt = Date.now();
        }
        return result;
    } catch (err) {
        console.error('Failed to fetch APY:', err);
        return cachedAPY || {
            delegateAPY: null,
            stakeAPY: null,
            _quality: { status: 'unavailable', observedAt: null, error: err.message }
        };
    }
}

function formatNum(n, decimals = 2) {
    return n.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

function readPercentInput(id, fallback = null) {
    const raw = document.getElementById(id)?.value;
    if (raw == null || String(raw).trim() === '') return fallback;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(100, Math.max(0, parsed));
}

function setUsdResult(id, xtzAmount, price) {
    if (!Number.isFinite(price) || price <= 0) {
        setResult(id, 'Price unavailable');
        return;
    }
    setResultNumber(id, xtzAmount * price, (val) => `$${formatNum(val)}`);
}

function calcRewards(amount, apyPct) {
    const rate = apyPct / 100;
    return {
        daily: amount * rate / 365.25,
        monthly: amount * rate / 12,
        yearly: amount * rate
    };
}

function calcCompound(amount, apyPct, years, cyclesPerYear) {
    const rate = apyPct / 100;
    return amount * Math.pow(1 + rate / cyclesPerYear, cyclesPerYear * years);
}

function saveState() {
    try {
        const state = {
            mode: currentMode,
            amount: document.getElementById('calc-amount')?.value || '',
            delegatePayoutAssumption: document.getElementById('calc-delegate-payout-assumption')?.value ?? '',
            stakeEdgeAssumption: document.getElementById('calc-stake-edge-assumption')?.value ?? '',
            extStaked: document.getElementById('calc-ext-staked')?.value || '',
            stakingFee: document.getElementById('calc-staking-fee')?.value ?? '5',
            extDelegated: document.getElementById('calc-ext-delegated')?.value || '',
            delegPayout: document.getElementById('calc-deleg-payout')?.value ?? '80'
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

function setResultNumber(id, value, formatter, duration = 250) {
    const el = document.getElementById(id);
    if (!el) return;
    const target = Number(value);
    if (!Number.isFinite(target)) {
        el.textContent = formatter(value);
        delete el.dataset.calcValue;
        return;
    }
    const previous = Number(el.dataset.calcValue);
    const from = Number.isFinite(previous) ? previous : target;
    el.dataset.calcValue = String(target);
    tweenNumber(el, from, target, { duration, formatter });
}

function clearPayoutLine() {
    const line = document.getElementById('calc-payout-line');
    if (!line) return;
    line.hidden = true;
    line.textContent = '';
}

async function getProtocolTiming() {
    if (cachedProtocolTiming && Date.now() - protocolTimingFetchedAt < CACHE_TTL) return cachedProtocolTiming;
    protocolTimingFetchedAt = Date.now();

    try {
        const constants = await fetchProtocolConstants();
        const delay = Number(constants?.consensus_rights_delay);
        const blockDelay = Number(Array.isArray(constants?.minimal_block_delay)
            ? constants.minimal_block_delay[0]
            : constants?.minimal_block_delay);
        const blocksPerCycle = Number(constants?.blocks_per_cycle);
        const liveCycleHours = Number.isFinite(blockDelay) && blockDelay > 0 && Number.isFinite(blocksPerCycle) && blocksPerCycle > 0
            ? (blockDelay * blocksPerCycle) / 3600
            : null;

        cachedProtocolTiming = {
            verified: Number.isFinite(delay) && delay >= 0,
            activationDelayCycles: Number.isFinite(delay) && delay >= 0 ? delay : FALLBACK_ACTIVATION_DELAY_CYCLES,
            cycleVerified: Number.isFinite(liveCycleHours),
            cycleHours: liveCycleHours || FALLBACK_CYCLE_HOURS
        };
        return cachedProtocolTiming;
    } catch (_) {
        cachedProtocolTiming = {
            verified: false,
            activationDelayCycles: FALLBACK_ACTIVATION_DELAY_CYCLES,
            cycleVerified: false,
            cycleHours: FALLBACK_CYCLE_HOURS
        };
        return cachedProtocolTiming;
    }
}

function formatCycleHours(hours) {
    if (!Number.isFinite(hours) || hours <= 0) return '24h';
    if (hours < 24) return `${Math.round(hours)}h`;
    const rounded = Math.round(hours);
    return `${rounded}h`;
}

async function renderPayoutLine() {
    const line = document.getElementById('calc-payout-line');
    if (!line || currentMode === 'baker') {
        clearPayoutLine();
        return;
    }
    line.hidden = false;

    if (currentMode === 'delegate') {
        const payout = readPercentInput('calc-delegate-payout-assumption');
        line.textContent = payout == null
            ? 'Enter your baker’s payout percentage to calculate a scenario. Delegation payout cadence and fees are off-chain baker policy.'
            : `Scenario uses a ${payout}% baker payout assumption. Actual delegation fees, missed rewards, and payout cadence depend on the baker’s off-chain policy.`;
        return;
    }

    const edge = readPercentInput('calc-stake-edge-assumption');
    const timing = await getProtocolTiming();
    const cycleLabel = formatCycleHours(timing.cycleHours);
    const timingNote = timing.verified
        ? `Current protocol rights delay: ${timing.activationDelayCycles} cycles of roughly ${cycleLabel} each.`
        : 'Protocol activation timing could not be verified.';
    line.textContent = edge == null
        ? `Enter the baker’s on-chain external-staker edge to calculate a scenario. ${timingNote}`
        : `Scenario uses a ${edge}% external-staker edge; the baker keeps that share of rewards. ${timingNote}`;
}

function setApyDisplay(value, label = 'live network rate') {
    const el = document.getElementById('calc-apy-display');
    if (el) el.title = 'Protocol context is measured from current chain data; personal scenarios also use the assumptions shown.';
    setResultNumber('calc-apy-display', value, (val) => `${formatNum(val, 1)}% — ${label} ⓘ`);
}

function showApyUnavailable() {
    const el = document.getElementById('calc-apy-display');
    if (el) {
        el.textContent = 'APY unavailable — retry shortly';
        el.title = 'The live issuance or staking inputs could not be verified, so no reward estimate is shown.';
        delete el.dataset.calcValue;
    }
    setResult('calc-daily-xtz', '—');
    setResult('calc-daily-usd', '—');
    setResult('calc-monthly-xtz', '—');
    setResult('calc-monthly-usd', '—');
    setResult('calc-yearly-xtz', '—');
    setResult('calc-yearly-usd', '—');
    clearPayoutLine();
    clearCompound();
    removeBreakdown();
    latestProjection = null;
}

function showAssumptionRequired(grossApy, message) {
    setApyDisplay(grossApy, 'gross protocol context only');
    setResult('calc-daily-xtz', 'Add assumption');
    setResult('calc-daily-usd', '—');
    setResult('calc-monthly-xtz', 'Add assumption');
    setResult('calc-monthly-usd', '—');
    setResult('calc-yearly-xtz', 'Add assumption');
    setResult('calc-yearly-usd', '—');
    const line = document.getElementById('calc-payout-line');
    if (line) {
        line.hidden = false;
        line.textContent = message;
    }
    clearCompound();
    removeBreakdown();
    latestProjection = null;
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
    clearPayoutLine();
    clearCompound();
    removeBreakdown();
    latestProjection = null;
}

function removeBreakdown() {
    const existing = document.getElementById('calc-baker-breakdown');
    if (existing) existing.remove();
}

/**
 * Calculate baker income from all sources
 */
function calcBakerIncome(ownStake, extStaked, externalStakerEdgePct, extDelegated, delegPayoutPct, stakeAPY, delegateAPY) {
    // 1. Own stake rewards (full staker APY on own stake)
    const ownRewards = ownStake * (stakeAPY / 100);

    // 2. On-chain baker edge from external stakers' rewards.
    const extStakerRewards = extStaked * (stakeAPY / 100);
    const stakingFeeIncome = extStakerRewards * (externalStakerEdgePct / 100);

    // 3. Delegation income (baker keeps what's not paid out to delegators)
    const delegRewards = extDelegated * (delegateAPY / 100);
    const delegBakerKeep = delegRewards * (1 - delegPayoutPct / 100);

    const total = ownRewards + stakingFeeIncome + delegBakerKeep;
    return { ownRewards, stakingFeeIncome, delegBakerKeep, total };
}

async function updateResults() {
    const updateId = ++updateSequence;
    const mode = currentMode;
    const amountInput = document.getElementById('calc-amount');
    if (!amountInput) return;

    const amount = parseFloat(amountInput.value) || 0;
    saveState();

    if (mode === 'baker') {
        return updateBakerResults(amount, updateId);
    }

    // Delegate or Stake mode
    removeBreakdown();
    if (amount <= 0) { clearResults(); return; }

    const [apy, price, timing] = await Promise.all([getAPY(), getXTZPrice(), getProtocolTiming()]);
    if (updateId !== updateSequence || mode !== currentMode) return;
    const grossApy = mode === 'stake' ? apy.stakeAPY : apy.delegateAPY;
    if (!Number.isFinite(grossApy) || grossApy <= 0) {
        showApyUnavailable();
        return;
    }

    let apyPct;
    let assumptionLabel;
    if (mode === 'stake') {
        const edge = readPercentInput('calc-stake-edge-assumption');
        if (edge == null) {
            showAssumptionRequired(
                grossApy,
                'Enter the baker’s on-chain external-staker edge (0–100%) to calculate a personal staking scenario.'
            );
            return;
        }
        apyPct = grossApy * (1 - edge / 100);
        assumptionLabel = `${edge}% external-staker edge`;
    } else {
        const payout = readPercentInput('calc-delegate-payout-assumption');
        if (payout == null) {
            showAssumptionRequired(
                grossApy,
                'Enter your baker’s off-chain payout percentage (0–100%) to calculate a personal delegation scenario.'
            );
            return;
        }
        apyPct = grossApy * (payout / 100);
        assumptionLabel = `${payout}% baker payout`;
    }

    const freshness = apy?._quality?.status === 'stale' ? 'stale network context' : 'live network context';
    const rateLabel = `scenario · ${assumptionLabel} · ${freshness}`;
    setApyDisplay(apyPct, rateLabel);

    const rewards = calcRewards(amount, apyPct);
    setResultNumber('calc-daily-xtz', rewards.daily, (val) => `${formatNum(val, 4)} ꜩ`);
    setUsdResult('calc-daily-usd', rewards.daily, price);
    setResultNumber('calc-monthly-xtz', rewards.monthly, (val) => `${formatNum(val, 2)} ꜩ`);
    setUsdResult('calc-monthly-usd', rewards.monthly, price);
    setResultNumber('calc-yearly-xtz', rewards.yearly, (val) => `${formatNum(val, 2)} ꜩ`);
    setUsdResult('calc-yearly-usd', rewards.yearly, price);
    renderPayoutLine();

    renderCompound(amount, apyPct, price, assumptionLabel, timing);
}

async function updateBakerResults(ownStake, updateId) {
    const extStaked = parseFloat(document.getElementById('calc-ext-staked')?.value) || 0;
    const stakingFee = readPercentInput('calc-staking-fee', 5);
    const extDelegated = parseFloat(document.getElementById('calc-ext-delegated')?.value) || 0;
    const delegPayout = readPercentInput('calc-deleg-payout', 80);

    if (ownStake <= 0 && extStaked <= 0 && extDelegated <= 0) { clearResults(); return; }

    const [apy, price, timing] = await Promise.all([getAPY(), getXTZPrice(), getProtocolTiming()]);
    if (updateId !== updateSequence || currentMode !== 'baker') return;
    if (!Number.isFinite(apy?.stakeAPY) || apy.stakeAPY <= 0
        || !Number.isFinite(apy?.delegateAPY) || apy.delegateAPY <= 0) {
        showApyUnavailable();
        return;
    }
    const income = calcBakerIncome(ownStake, extStaked, stakingFee, extDelegated, delegPayout, apy.stakeAPY, apy.delegateAPY);

    // Show effective APY relative to own stake (if any)
    const effectiveAPY = ownStake > 0 ? (income.total / ownStake) * 100 : 0;
    if (ownStake > 0) {
        const rateLabel = apy?._quality?.status === 'stale'
            ? 'effective baker rate from stale network inputs'
            : 'effective baker rate';
        setApyDisplay(effectiveAPY, rateLabel);
    }
    else setResult('calc-apy-display', '—');
    clearPayoutLine();

    // Show total baker income in the reward cards
    const daily = income.total / 365.25;
    const monthly = income.total / 12;
    setResultNumber('calc-daily-xtz', daily, (val) => `${formatNum(val, 4)} ꜩ`);
    setUsdResult('calc-daily-usd', daily, price);
    setResultNumber('calc-monthly-xtz', monthly, (val) => `${formatNum(val, 2)} ꜩ`);
    setUsdResult('calc-monthly-usd', monthly, price);
    setResultNumber('calc-yearly-xtz', income.total, (val) => `${formatNum(val, 2)} ꜩ`);
    setUsdResult('calc-yearly-usd', income.total, price);

    // Breakdown
    const resultsGrid = document.getElementById('calc-results');
    if (resultsGrid) {
        const items = [
            { label: `Own Stake (${formatNum(apy.stakeAPY, 1)}% APY)`, value: formatNum(income.ownRewards, 2) + ' ꜩ' },
            { label: `External-staker edge (${stakingFee}% kept)`, value: formatNum(income.stakingFeeIncome, 2) + ' ꜩ' },
            { label: `Delegation (keep ${100 - delegPayout}% of rewards)`, value: formatNum(income.delegBakerKeep, 2) + ' ꜩ' },
            { label: 'Total Yearly Income', value: formatNum(income.total, 2) + ' ꜩ' + (Number.isFinite(price) && price > 0 ? ' ($' + formatNum(income.total * price) + ')' : ' (USD unavailable)'), total: true }
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
    renderCompound(ownStake, effectiveAPY, price, `${stakingFee}% external-staker edge · ${delegPayout}% delegator payout`, timing);
}

function renderCompound(amount, apyPct, price, assumptionLabel = '', timing = null) {
    const compoundRows = document.getElementById('calc-compound-body');
    if (!compoundRows || amount <= 0) { clearCompound(); return; }
    const cycleHours = Number(timing?.cycleHours) > 0 ? Number(timing.cycleHours) : FALLBACK_CYCLE_HOURS;
    const cyclesPerYear = HOURS_PER_YEAR / cycleHours;

    while (compoundRows.firstChild) compoundRows.removeChild(compoundRows.firstChild);
    latestProjection = {
        amount,
        apyPct,
        price,
        mode: currentMode,
        assumptionLabel,
        cycleHours,
        cycleVerified: timing?.cycleVerified === true,
        rows: []
    };

    for (let y = 1; y <= 5; y++) {
        const total = calcCompound(amount, apyPct, y, cyclesPerYear);
        const earned = total - amount;
        const gainPct = (earned / amount) * 100;
        latestProjection.rows.push({ year: y, total, earned, gainPct });
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
        earnedEl.textContent = '+' + formatNum(earned, 2) + ' ꜩ'
            + (Number.isFinite(price) && price > 0 ? ' ($' + formatNum(earned * price) + ')' : ' (USD unavailable)');

        row.appendChild(yearEl);
        row.appendChild(xtzEl);
        row.appendChild(earnedEl);
        compoundRows.appendChild(row);
    }
}

function closeProjectionOverlay(overlay) {
    overlay?.classList.remove('visible');
    setTimeout(() => overlay?.remove(), 160);
}

async function shareProjection(showAmounts, overlay) {
    if (!latestProjection?.rows?.length) return;
    const button = overlay?.querySelector('#calc-projection-generate');
    const originalText = button?.textContent || '';
    let card = null;
    try {
        if (button) {
            button.disabled = true;
            button.textContent = 'Generating...';
        }
        const { loadHtml2Canvas, showShareModal, appendCardSeal } = await import('../ui/share.js');
        await loadHtml2Canvas();
        const cycleLabel = formatCycleHours(latestProjection.cycleHours);
        const cycleSource = latestProjection.cycleVerified ? 'current protocol timing' : 'an 18h fallback cadence';
        const fiveYear = latestProjection.rows[latestProjection.rows.length - 1];
        const gainText = `+${formatNum(fiveYear.gainPct, 1)}%`;
        const modeLabel = latestProjection.mode === 'delegate'
            ? 'Delegation scenario'
            : latestProjection.mode === 'stake'
                ? 'External-staking scenario'
                : 'Baker scenario';
        const assumptionText = latestProjection.assumptionLabel || 'user-entered assumptions';
        const rowsHtml = latestProjection.rows.map((row) => `
            <div style="display:grid;grid-template-columns:74px 1fr ${showAmounts ? '1fr' : ''};gap:14px;align-items:center;padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
                <span style="font-size:13px;color:rgba(255,255,255,0.44);font-weight:800;">${row.year}Y</span>
                <strong style="font-size:20px;color:#00ff88;">+${formatNum(row.gainPct, 1)}%</strong>
                ${showAmounts ? `<span style="font-size:17px;color:rgba(255,255,255,0.72);text-align:right;">${formatNum(row.total, 2)} ꜩ</span>` : ''}
            </div>
        `).join('');

        card = document.createElement('div');
        card.style.cssText = `
            position:fixed;left:-9999px;top:-9999px;width:760px;min-height:560px;
            padding:36px 42px 66px;background:#0a0e1a;color:#f7fbff;
            border:1px solid rgba(0,255,136,0.18);border-radius:16px;
            font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
            box-sizing:border-box;overflow:hidden;
        `;
        card.innerHTML = `
            <div style="position:absolute;inset:0;background:linear-gradient(rgba(0,255,136,0.022) 1px,transparent 1px),linear-gradient(90deg,rgba(0,255,136,0.022) 1px,transparent 1px);background-size:22px 22px;pointer-events:none;"></div>
            <div style="position:relative;z-index:1;">
                <div style="font-family:Orbitron,sans-serif;font-size:22px;font-weight:900;color:#00ff88;text-transform:uppercase;letter-spacing:0;">TEZOS SYSTEMS</div>
                <div style="width:220px;height:1px;background:#00ff88;opacity:0.5;margin:14px 0 28px;"></div>
                <div style="font-size:13px;color:rgba(255,255,255,0.42);text-transform:uppercase;font-weight:850;letter-spacing:0;">${modeLabel}</div>
                <h1 style="margin:12px 0 10px;font-size:58px;line-height:1;font-weight:900;color:#ffffff;">${gainText} over 5 years</h1>
                <p style="margin:0 0 24px;font-size:19px;line-height:1.38;color:rgba(255,255,255,0.62);">Current network context · ${assumptionText}. Model assumes reinvestment every ~${cycleLabel} from ${cycleSource}; returns are not promised. ${showAmounts ? 'Amounts included by request.' : 'Percentages only.'}</p>
                <div style="display:grid;gap:0;margin-top:8px;">${rowsHtml}</div>
            </div>
        `;
        appendCardSeal(card);
        document.body.appendChild(card);
        const canvas = await window.html2canvas(card, {
            backgroundColor: '#0a0e1a',
            scale: 2,
            useCORS: true,
            logging: false
        });
        card.remove();
        card = null;
        closeProjectionOverlay(overlay);

        showShareModal(canvas, [
            { label: '📈 Projection', text: `My Tezos calculator scenario uses current network context and ${assumptionText}: ${gainText} over 5 years if rewards are reinvested each cycle. Not a promised return.\n\nRun yours → tezos.systems` },
            { label: '🔒 Private', text: `Scenario model: ${assumptionText}, with reinvestment every ~${cycleLabel}. Actual rewards and timing can differ.\n\ntezos.systems` }
        ], 'Compound Projection');
    } catch (error) {
        console.error('Projection share failed:', error);
    } finally {
        if (card?.isConnected) card.remove();
        if (button) {
            button.disabled = false;
            button.textContent = originalText;
        }
    }
}

function openProjectionShareOverlay() {
    if (!latestProjection?.rows?.length) return;
    document.getElementById('calc-projection-share-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'calc-projection-share-overlay';
    overlay.className = 'calc-projection-share-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
        <div class="calc-projection-share-dialog">
            <div class="calc-projection-share-head">
                <strong>Compound Projection</strong>
                <button type="button" class="calc-projection-close" aria-label="Close projection share">×</button>
            </div>
            <label class="calc-projection-amounts">
                <input type="checkbox" id="calc-projection-show-amounts">
                <span>Show amounts on card</span>
            </label>
            <button type="button" id="calc-projection-generate" class="glass-button calc-projection-generate">Generate share card</button>
        </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));
    overlay.querySelector('.calc-projection-close')?.addEventListener('click', () => closeProjectionOverlay(overlay));
    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) closeProjectionOverlay(overlay);
    });
    overlay.querySelector('#calc-projection-generate')?.addEventListener('click', () => {
        const showAmounts = overlay.querySelector('#calc-projection-show-amounts')?.checked === true;
        shareProjection(showAmounts, overlay);
    });
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
    const delegateFields = document.getElementById('calc-delegate-fields');
    if (delegateFields) delegateFields.style.display = mode === 'delegate' ? '' : 'none';
    const stakeFields = document.getElementById('calc-stake-fields');
    if (stakeFields) stakeFields.style.display = mode === 'stake' ? '' : 'none';
    if (mode === 'baker') clearPayoutLine();

    // Update amount label
    const label = document.getElementById('calc-amount-label');
    if (label) label.textContent = mode === 'baker' ? 'Own Stake (XTZ)' : 'Amount (XTZ)';

    updateResults();
}

const CALC_VISIBLE_KEY = 'tezos-systems-calc-visible';

function setLauncherToggleState(btn, isOn) {
    const helper = window.tezosSystemsLauncher?.setToggleState;
    if (helper) {
        helper(btn, isOn);
        return;
    }
    btn?.classList.toggle('active', isOn);
    btn?.setAttribute('aria-pressed', String(isOn));
    const pill = btn?.querySelector('.feature-status');
    if (pill) pill.textContent = btn?.dataset[isOn ? 'statusOn' : 'statusOff'] || (isOn ? 'Showing' : 'Hidden');
}

function updateCalcVisibility(isVisible) {
    const section = document.getElementById('calculator-section');
    const toggleBtn = document.getElementById('calc-toggle');
    if (section) section.classList.toggle('visible', isVisible);
    if (toggleBtn) {
        setLauncherToggleState(toggleBtn, isVisible);
        toggleBtn.title = `Staking Rewards Estimator: ${isVisible ? 'Showing' : 'Hidden'}`;
    }
}

function toggleCalc() {
    const isVisible = localStorage.getItem(CALC_VISIBLE_KEY) === 'true';
    const newState = !isVisible;
    localStorage.setItem(CALC_VISIBLE_KEY, String(newState));
    updateCalcVisibility(newState);
    if (newState) {
        const container = document.getElementById('optional-sections');
        const section = document.getElementById('calculator-section');
        if (container && section && section.parentElement === container) container.prepend(section);
    }
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
        if (saved.delegatePayoutAssumption != null) {
            const el = document.getElementById('calc-delegate-payout-assumption');
            if (el) el.value = saved.delegatePayoutAssumption;
        }
        if (saved.stakeEdgeAssumption != null) {
            const el = document.getElementById('calc-stake-edge-assumption');
            if (el) el.value = saved.stakeEdgeAssumption;
        }
        if (saved.extStaked) {
            const el = document.getElementById('calc-ext-staked');
            if (el) el.value = saved.extStaked;
        }
        if (saved.stakingFee != null) {
            const el = document.getElementById('calc-staking-fee');
            if (el) el.value = saved.stakingFee;
        }
        if (saved.extDelegated) {
            const el = document.getElementById('calc-ext-delegated');
            if (el) el.value = saved.extDelegated;
        }
        if (saved.delegPayout != null) {
            const el = document.getElementById('calc-deleg-payout');
            if (el) el.value = saved.delegPayout;
        }
    } else {
        amountInput.value = '1000';
    }

    document.getElementById('calc-projection-share-btn')?.addEventListener('click', openProjectionShareOverlay);

    // Mode toggle buttons
    const toggle = document.getElementById('calc-mode-toggle');
    if (toggle) {
        toggle.addEventListener('click', (e) => {
            const btn = e.target.closest('.calc-toggle-btn');
            if (btn && btn.dataset.mode) setMode(btn.dataset.mode);
        });
    }

    // Baker field inputs
    const bakerInputs = [
        'calc-delegate-payout-assumption',
        'calc-stake-edge-assumption',
        'calc-ext-staked',
        'calc-staking-fee',
        'calc-ext-delegated',
        'calc-deleg-payout'
    ];
    const debouncedUpdate = debounce(updateResults, DEBOUNCE_MS);
    const scheduleUpdate = () => {
        // Invalidate any request already in flight as soon as an assumption
        // changes; only the debounced update for the newest inputs may render.
        updateSequence += 1;
        debouncedUpdate();
    };

    amountInput.addEventListener('input', scheduleUpdate);
    for (const id of bakerInputs) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', scheduleUpdate);
    }

    // Set initial mode
    const initialMode = saved?.mode || 'delegate';
    setMode(initialMode);
}
