/**
 * My Baker - Personal baker/delegation tracker
 * Shows delegation target, staking balance, estimated rewards, and baker info
 */

import { API_URLS } from './config.js';
import { escapeHtml, formatNumber } from './utils.js';

const STORAGE_KEY = 'tezos-systems-my-baker-address';
const TOGGLE_KEY = 'tezos-systems-my-baker-visible';
const TZKT = API_URLS.tzkt;

/**
 * Validate a Tezos address
 */
function isValidAddress(addr) {
    if (!addr || addr.length !== 36) return false;
    return /^(tz[1-4]|KT1)[a-zA-Z0-9]{33}$/.test(addr);
}

/**
 * Format mutez to XTZ with commas
 */
function fmtXTZ(mutez) {
    const xtz = (mutez || 0) / 1e6;
    return xtz.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ꜩ';
}

/**
 * Resolve Tezos Domains name for an address
 */
async function resolveDomain(address) {
    try {
        const resp = await fetch(`https://api.tezos.domains/graphql`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: `query { reverseRecord(address: "${address}") { domain { name } } }`
            })
        });
        const data = await resp.json();
        return data?.data?.reverseRecord?.domain?.name || null;
    } catch {
        return null;
    }
}

/**
 * Fetch current staking APY from Octez RPC + TzKT (same logic as api.js fetchStakingAPY)
 */
async function getStakingAPY() {
    try {
        const [rateResp, statsResp] = await Promise.all([
            fetch(`${API_URLS.octez}/chains/main/blocks/head/context/issuance/current_yearly_rate`),
            fetch(`${TZKT}/statistics/current`)
        ]);
        const rateText = await rateResp.text();
        const stats = await statsResp.json();
        const netIssuance = parseFloat(rateText.replace(/"/g, ''));
        const supply = stats.totalSupply / 1e6;
        const staked = ((stats.totalOwnStaked || 0) + (stats.totalExternalStaked || 0)) / 1e6;
        const delegated = ((stats.totalOwnDelegated || 0) + (stats.totalExternalDelegated || 0)) / 1e6;
        const edge = 2;
        const effective = (staked / supply) + (delegated / supply) / (1 + edge);
        const stakeAPY = (netIssuance / 100) / effective * 100;
        const delegateAPY = stakeAPY / (1 + edge);
        return { delegateAPY: Math.round(delegateAPY * 10) / 10, stakeAPY: Math.round(stakeAPY * 10) / 10 };
    } catch {
        return { delegateAPY: 3.1, stakeAPY: 9.2 };
    }
}

/**
 * Create a stat item element
 */
function createStatItem(label, value) {
    const div = document.createElement('div');
    div.className = 'my-baker-stat';
    const labelEl = document.createElement('span');
    labelEl.className = 'my-baker-stat-label';
    labelEl.textContent = label;
    const valueEl = document.createElement('span');
    valueEl.className = 'my-baker-stat-value';
    valueEl.textContent = value;
    div.appendChild(labelEl);
    div.appendChild(valueEl);
    return div;
}

/**
 * Render the My Baker data into the results container
 */
async function renderBakerData(address, container) {
    container.innerHTML = '';
    const loadingEl = document.createElement('div');
    loadingEl.className = 'my-baker-loading';
    loadingEl.textContent = 'Loading...';
    container.appendChild(loadingEl);

    try {
        // Fetch account data
        const accountResp = await fetch(`${TZKT}/accounts/${encodeURIComponent(address)}`);
        if (!accountResp.ok) throw new Error('Account not found');
        const account = await accountResp.json();

        // Check if this address is a baker
        let bakerData = null;
        if (account.type === 'delegate' || account.delegate?.address === address) {
            try {
                const bakerResp = await fetch(`${TZKT}/delegates/${encodeURIComponent(address)}`);
                if (bakerResp.ok) bakerData = await bakerResp.json();
            } catch { /* not a baker */ }
        }

        // If not a baker but has a delegate, fetch the delegate's baker data
        let delegateBakerData = null;
        if (!bakerData && account.delegate?.address) {
            try {
                const dResp = await fetch(`${TZKT}/delegates/${encodeURIComponent(account.delegate.address)}`);
                if (dResp.ok) delegateBakerData = await dResp.json();
            } catch { /* ignore */ }
        }

        // Fetch APY and domain resolution in parallel
        const [apy, delegateDomain] = await Promise.all([
            getStakingAPY(),
            account.delegate?.address ? resolveDomain(account.delegate.address) : Promise.resolve(null)
        ]);

        container.innerHTML = '';

        const grid = document.createElement('div');
        grid.className = 'my-baker-grid';

        // Balance
        grid.appendChild(createStatItem('Balance', fmtXTZ(account.balance)));

        // Staked balance
        if (account.stakedBalance > 0) {
            grid.appendChild(createStatItem('Staked', fmtXTZ(account.stakedBalance)));
        }

        // Delegate info (skip for bakers — the baker IS the delegate)
        if (bakerData) {
            // This address is a baker, no need to show delegate
        } else if (account.delegate) {
            const delegateName = delegateDomain
                || account.delegate.alias
                || (account.delegate.address.slice(0, 8) + '…');
            const delegateEl = createStatItem('Delegate', delegateName);
            delegateEl.querySelector('.my-baker-stat-value').title = account.delegate.address;
            grid.appendChild(delegateEl);
        } else {
            grid.appendChild(createStatItem('Delegate', 'None'));
        }

        // Show delegate's baker stats for non-baker addresses
        if (!bakerData && delegateBakerData) {
            grid.appendChild(createStatItem('Baker Stakers', formatNumber(delegateBakerData.stakersCount || 0, { decimals: 0, useAbbreviation: false })));
            grid.appendChild(createStatItem('Baker Delegators', formatNumber(delegateBakerData.numDelegators || 0, { decimals: 0, useAbbreviation: false })));
            grid.appendChild(createStatItem('Baker Staking Power', fmtXTZ(delegateBakerData.stakingBalance)));
        }

        // If baker, show baker-specific stats
        if (bakerData) {
            grid.appendChild(createStatItem('Baker Staking Power', fmtXTZ(bakerData.stakingBalance)));
            grid.appendChild(createStatItem('External Staked', fmtXTZ(bakerData.externalStakedBalance)));
            grid.appendChild(createStatItem('External Delegated', fmtXTZ(bakerData.externalDelegatedBalance)));
            grid.appendChild(createStatItem('Stakers', formatNumber(bakerData.stakersCount || 0, { decimals: 0, useAbbreviation: false })));
            grid.appendChild(createStatItem('Delegators', formatNumber(bakerData.numDelegators || 0, { decimals: 0, useAbbreviation: false })));

            const totalMissed = (bakerData.missedBlocks || 0) + (bakerData.missedEndorsements || 0);
            grid.appendChild(createStatItem('Missed (Blocks/Endorse)', `${bakerData.missedBlocks || 0} / ${bakerData.missedEndorsements || 0}`));
        }

        // Estimated rewards based on staked balance or total balance
        const stakedAmt = (account.stakedBalance || 0) / 1e6;
        const balanceAmt = (account.balance || 0) / 1e6;
        const rewardBase = stakedAmt > 0 ? stakedAmt : balanceAmt;
        const apyRate = stakedAmt > 0 ? apy.stakeAPY : apy.delegateAPY;
        const apyLabel = stakedAmt > 0 ? 'Staker' : 'Delegator';

        if (rewardBase > 0 && apyRate > 0) {
            const yearly = rewardBase * (apyRate / 100);
            const monthly = yearly / 12;
            const daily = yearly / 365.25;

            grid.appendChild(createStatItem(`APY (${apyLabel})`, `${apyRate}%`));
            grid.appendChild(createStatItem('Est. Daily', `${daily.toFixed(2)} ꜩ`));
            grid.appendChild(createStatItem('Est. Monthly', `${monthly.toFixed(2)} ꜩ`));
            grid.appendChild(createStatItem('Est. Yearly', `${yearly.toFixed(2)} ꜩ`));
        }

        container.appendChild(grid);
    } catch (err) {
        container.innerHTML = '';
        const errorEl = document.createElement('div');
        errorEl.className = 'my-baker-error';
        errorEl.textContent = 'Failed to load account data. Check the address and try again.';
        container.appendChild(errorEl);
    }
}

/**
 * Initialize the My Baker section
 */
/**
 * Toggle visibility of My Baker + Calculator sections
 */
function updateVisibility(isVisible) {
    const bakerSection = document.getElementById('my-baker-section');
    const calcSection = document.getElementById('calculator-section');
    const toggleBtn = document.getElementById('my-baker-toggle');

    if (bakerSection) bakerSection.classList.toggle('visible', isVisible);
    if (calcSection) calcSection.classList.toggle('visible', isVisible);
    if (toggleBtn) {
        toggleBtn.classList.toggle('active', isVisible);
        toggleBtn.title = `My Baker: ${isVisible ? 'ON' : 'OFF'}`;
    }
}

function toggleMyBaker() {
    const isVisible = localStorage.getItem(TOGGLE_KEY) === 'true';
    const newState = !isVisible;
    localStorage.setItem(TOGGLE_KEY, String(newState));
    updateVisibility(newState);
}

export function init() {
    const section = document.getElementById('my-baker-section');
    if (!section) return;

    // Setup toggle button
    const toggleBtn = document.getElementById('my-baker-toggle');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', toggleMyBaker);
    }

    // Restore visibility preference (default: on)
    const stored = localStorage.getItem(TOGGLE_KEY);
    const isVisible = stored === null ? true : stored === 'true';
    updateVisibility(isVisible);

    const input = document.getElementById('my-baker-input');
    const saveBtn = document.getElementById('my-baker-save');
    const clearBtn = document.getElementById('my-baker-clear');
    const results = document.getElementById('my-baker-results');
    const errorMsg = document.getElementById('my-baker-error-msg');

    if (!input || !saveBtn || !clearBtn || !results) return;

    // Load saved address
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && isValidAddress(saved)) {
        input.value = saved;
        renderBakerData(saved, results);
    }

    saveBtn.addEventListener('click', () => {
        const addr = input.value.trim();
        errorMsg.textContent = '';
        if (!isValidAddress(addr)) {
            errorMsg.textContent = 'Invalid address. Must be tz1/tz2/tz3/tz4/KT1 and 36 characters.';
            return;
        }
        localStorage.setItem(STORAGE_KEY, addr);
        renderBakerData(addr, results);
    });

    // Allow Enter key
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') saveBtn.click();
    });

    clearBtn.addEventListener('click', () => {
        localStorage.removeItem(STORAGE_KEY);
        input.value = '';
        results.innerHTML = '';
        errorMsg.textContent = '';
    });
}

/**
 * Refresh My Baker data (called on dashboard refresh interval)
 */
export function refresh() {
    const saved = localStorage.getItem(STORAGE_KEY);
    const results = document.getElementById('my-baker-results');
    if (saved && isValidAddress(saved) && results) {
        renderBakerData(saved, results);
    }
}
