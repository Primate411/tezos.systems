/**
 * My Baker - Personal baker/delegation tracker
 * Shows delegation target, staking balance, estimated rewards, and baker info
 */

import { API_URLS } from '../core/config.js';
import { escapeHtml, formatNumber } from '../core/utils.js';
// objkt.js moved to standalone section

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
 * Check if input looks like a Tezos domain
 */
function isTezDomain(input) {
    return input && input.endsWith('.tez') && input.length > 4;
}

/**
 * Resolve a .tez domain to an address
 */
async function resolveForwardDomain(name) {
    try {
        const resp = await fetch('https://api.tezos.domains/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: `query ResolveDomain($name: String!) { domain(name: $name) { address } }`,
                variables: { name }
            })
        });
        const data = await resp.json();
        return data?.data?.domain?.address || null;
    } catch {
        return null;
    }
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
                query: `query ReverseLookup($address: String!) { reverseRecord(address: $address) { domain { name } } }`,
                variables: { address }
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
 * Fetch consensus participation from Octez RPC
 */
async function fetchParticipation(bakerAddr) {
    try {
        const resp = await fetch(`${API_URLS.octez}/chains/main/blocks/head/context/delegates/${bakerAddr}/participation`);
        if (!resp.ok) return null;
        return await resp.json();
    } catch { return null; }
}

/**
 * Fetch missed blocks/attestations from TzKT rights API (current cycle + lifetime)
 */
async function fetchMissedRights(bakerAddr, cycle) {
    const enc = encodeURIComponent(bakerAddr);
    const safeFetch = async (url, retries = 3) => {
        for (let i = 0; i <= retries; i++) {
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout per query
                const r = await fetch(url, { signal: controller.signal });
                clearTimeout(timeout);
                if (r.status === 429) {
                    await new Promise(res => setTimeout(res, 2000 * (i + 1)));
                    continue;
                }
                if (!r.ok) return 0;
                const n = parseInt(await r.text(), 10);
                return isNaN(n) ? 0 : n;
            } catch { if (i === retries) return 0; }
        }
        return 0;
    };
    try {
        // Current cycle misses are fast (small dataset) — fetch these first
        const cyBlocks = await safeFetch(`${TZKT}/rights/count?baker=${enc}&status=missed&type=baking&cycle=${cycle}`);
        const cyAttest = await safeFetch(`${TZKT}/rights/count?baker=${enc}&status=missed&type=attestation&cycle=${cycle}`);
        
        // Lifetime/all-time misses cause TzKT 504 timeouts for active bakers
        // Use last 10 cycles (~10 days on Tallinn) — fast and actionable
        const startCycle = Math.max(0, cycle - 10);
        const recentBlocks = await safeFetch(`${TZKT}/rights/count?baker=${enc}&status=missed&type=baking&cycle.ge=${startCycle}`);
        const recentAttest = await safeFetch(`${TZKT}/rights/count?baker=${enc}&status=missed&type=attestation&cycle.ge=${startCycle}`);
        return {
            cycle: { blocks: cyBlocks, attest: cyAttest },
            recent: { blocks: recentBlocks, attest: recentAttest },
        };
    } catch {
        return null;
    }
}

/**
 * Fetch DAL participation from Octez RPC
 */
async function fetchDALParticipation(bakerAddr) {
    try {
        const resp = await fetch(`${API_URLS.octez}/chains/main/blocks/head/context/delegates/${bakerAddr}/dal_participation`);
        if (!resp.ok) return null;
        return await resp.json();
    } catch { return null; }
}

/**
 * Create a stat item element
 */
function createStatItem(label, value, tooltip) {
    const div = document.createElement('div');
    div.className = 'my-baker-stat';
    if (tooltip) div.title = tooltip;
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
 * Create a capacity bar card showing used vs max capacity
 */
function createCapacityBar(label, used, max, note) {
    const pct = max > 0 ? Math.min((used / max) * 100, 100) : 0;
    const remaining = Math.max(max - used, 0);

    const card = document.createElement('div');
    card.className = 'capacity-bar-card';

    const header = document.createElement('div');
    header.className = 'capacity-bar-header';
    header.innerHTML = `
        <span class="capacity-bar-label">${label}</span>
        <span class="capacity-bar-pct">${pct.toFixed(1)}%</span>
    `;

    const barTrack = document.createElement('div');
    barTrack.className = 'capacity-bar-track';
    const barFill = document.createElement('div');
    barFill.className = 'capacity-bar-fill';
    barFill.style.width = `${pct}%`;
    // Color based on fill level
    if (pct >= 90) barFill.classList.add('capacity-critical');
    else if (pct >= 70) barFill.classList.add('capacity-warning');
    barTrack.appendChild(barFill);

    const details = document.createElement('div');
    details.className = 'capacity-bar-details';
    details.innerHTML = `
        <span>${formatNumber(used, { decimals: 0 })} ꜩ used</span>
        <span>${formatNumber(remaining, { decimals: 0 })} ꜩ free</span>
    `;

    const noteEl = document.createElement('div');
    noteEl.className = 'capacity-bar-note';
    noteEl.textContent = `Max: ${formatNumber(max, { decimals: 0 })} ꜩ (${note})`;

    card.appendChild(header);
    card.appendChild(barTrack);
    card.appendChild(details);
    card.appendChild(noteEl);
    return card;
}

/**
 * Create a subtle matrix-style character shimmer loader
 */
function createMatrixLoader() {
    const wrapper = document.createElement('div');
    wrapper.className = 'my-baker-loading-matrix';

    const chars = 'tz14KTꜩ0xABCDEF89';
    const count = 24;

    for (let i = 0; i < count; i++) {
        const span = document.createElement('span');
        span.className = 'matrix-char';
        span.textContent = chars[Math.floor(Math.random() * chars.length)];
        span.style.animationDelay = `${(Math.random() * 2).toFixed(2)}s`;
        span.style.animationDuration = `${(1.2 + Math.random() * 1.6).toFixed(2)}s`;
        wrapper.appendChild(span);
    }

    // Cycle characters periodically
    const interval = setInterval(() => {
        const spans = wrapper.querySelectorAll('.matrix-char');
        const idx = Math.floor(Math.random() * spans.length);
        spans[idx].textContent = chars[Math.floor(Math.random() * chars.length)];
    }, 150);

    const observer = new MutationObserver(() => {
        if (!wrapper.isConnected) {
            clearInterval(interval);
            observer.disconnect();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return wrapper;
}

/**
 * Render the My Baker data into the results container
 */
async function renderBakerData(address, container) {
    container.innerHTML = '';
    const loadingEl = createMatrixLoader();
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

        // Determine baker address for participation lookups
        const participationAddr = bakerData ? address : account.delegate?.address;

        // Get current cycle from Octez RPC (avoids TzKT rate limits)
        let currentCycle = null;
        try {
            const lvlResp = await fetch(`${API_URLS.octez}/chains/main/blocks/head/helpers/current_level`);
            if (lvlResp.ok) { const lvl = await lvlResp.json(); currentCycle = lvl.cycle; }
        } catch { /* ignore */ }

        // Fetch APY, domain, and participation data in parallel (missed rights deferred to avoid 429s)
        const [apy, delegateDomain, participation, dalParticipation] = await Promise.all([
            getStakingAPY(),
            account.delegate?.address ? resolveDomain(account.delegate.address) : Promise.resolve(null),
            participationAddr ? fetchParticipation(participationAddr) : Promise.resolve(null),
            participationAddr ? fetchDALParticipation(participationAddr) : Promise.resolve(null),
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
            grid.appendChild(createStatItem('Bkr Staking Power', fmtXTZ(delegateBakerData.stakingBalance)));
            grid.appendChild(createStatItem('Bkr Stakers', formatNumber(delegateBakerData.stakersCount || 0, { decimals: 0, useAbbreviation: false })));
            grid.appendChild(createStatItem('Bkr Delegators', formatNumber(delegateBakerData.numDelegators || 0, { decimals: 0, useAbbreviation: false })));
        }

        // If baker, show baker-specific stats
        if (bakerData) {
            grid.appendChild(createStatItem('Staking Power', fmtXTZ(bakerData.stakingBalance)));
            grid.appendChild(createStatItem('Ext. Staked', fmtXTZ(bakerData.externalStakedBalance)));
            grid.appendChild(createStatItem('Ext. Delegated', fmtXTZ(bakerData.externalDelegatedBalance)));
            grid.appendChild(createStatItem('Stakers', formatNumber(bakerData.stakersCount || 0, { decimals: 0, useAbbreviation: false })));
            grid.appendChild(createStatItem('Delegators', formatNumber(bakerData.numDelegators || 0, { decimals: 0, useAbbreviation: false })));
        }

        // Participation & missed stats (grouped together)
        if (participation) {
            const expected = participation.expected_cycle_activity || 0;
            const missedSlots = participation.missed_slots || 0;
            const attested = expected - missedSlots;
            const pct = expected > 0 ? ((attested / expected) * 100) : 0;
            const ok = pct >= 66.67;
            const icon = ok ? '✅' : '❌';
            grid.appendChild(createStatItem('Attest Rate', `${icon} ${pct.toFixed(2)}%`, 'Consensus attestation rate for current cycle'));
        }

        // Missed rights: render placeholder cards, then fill async
        let missedCycleEl = null;
        let missedLifetimeEl = null;
        if (participationAddr && currentCycle) {
            missedCycleEl = createStatItem('Missed (Cycle)', 'Loading...', 'Missed blocks / missed attestations this cycle');
            missedLifetimeEl = createStatItem('Missed (10d)', 'Loading...', 'Missed blocks / missed attestations (last ~10 days)');
            grid.appendChild(missedCycleEl);
            grid.appendChild(missedLifetimeEl);
        }

        if (dalParticipation) {
            const ok = dalParticipation.sufficient_dal_participation;
            const attested = dalParticipation.delegate_attested_dal_slots || 0;
            const attestable = dalParticipation.delegate_attestable_dal_slots || 0;
            const icon = ok ? '✅' : '❌';
            const ratio = attestable > 0 ? `${attested}/${attestable}` : 'N/A';
            grid.appendChild(createStatItem('DAL', `${icon} ${ratio} slots`));
        }

        // Estimated rewards based on staked balance or total balance
        const stakedAmt = (account.stakedBalance || 0) / 1e6;
        const balanceAmt = (account.balance || 0) / 1e6;
        const rewardBase = stakedAmt > 0 ? stakedAmt : balanceAmt;

        // Determine the baker's edge fee for APY adjustment
        const activeBaker = bakerData || delegateBakerData;
        const bakerEdge = activeBaker?.edgeOfBakingOverStaking != null
            ? activeBaker.edgeOfBakingOverStaking / 1e9
            : 0;

        let apyRate, apyLabel;
        if (stakedAmt > 0) {
            // For stakers: effective APY = raw stakeAPY reduced by baker's edge fee
            apyRate = bakerEdge > 0
                ? Math.round(apy.stakeAPY / (1 + bakerEdge) * 10) / 10
                : apy.stakeAPY;
            apyLabel = 'Staker';
        } else {
            apyRate = apy.delegateAPY;
            apyLabel = 'Delegator';
        }

        if (rewardBase > 0 && apyRate > 0) {
            const yearly = rewardBase * (apyRate / 100);
            const monthly = yearly / 12;
            const daily = yearly / 365.25;

            const feeNote = bakerEdge > 0 ? ` (${(bakerEdge * 100).toFixed(0)}% fee)` : '';
            grid.appendChild(createStatItem(`APY (${apyLabel})${feeNote}`, `${apyRate}%`));
            grid.appendChild(createStatItem('Est. Daily', `${daily.toFixed(2)} ꜩ`));
            grid.appendChild(createStatItem('Est. Monthly', `${monthly.toFixed(2)} ꜩ`));
            grid.appendChild(createStatItem('Est. Yearly', `${yearly.toFixed(2)} ꜩ`));
        }

        // Capacity bars for bakers — shown at top
        if (bakerData) {
            const ownStake = (bakerData.stakedBalance || 0) / 1e6;
            const extStaked = (bakerData.externalStakedBalance || 0) / 1e6;
            const extDelegated = (bakerData.externalDelegatedBalance || 0) / 1e6;

            // Staking capacity: baker's limitOfStakingOverBaking (in millionths, default 0 = disabled)
            const stakingMultiplier = (bakerData.limitOfStakingOverBaking || 0) / 1e6;
            const maxStaking = ownStake * stakingMultiplier;

            // Delegation capacity: always 9x own stake
            const maxDelegation = ownStake * 9;

            const barsContainer = document.createElement('div');
            barsContainer.className = 'capacity-bars';

            if (stakingMultiplier > 0) {
                barsContainer.appendChild(createCapacityBar(
                    'Staking Capacity',
                    extStaked,
                    maxStaking,
                    `${stakingMultiplier}x multiplier`
                ));
            }

            barsContainer.appendChild(createCapacityBar(
                'Delegation Capacity',
                extDelegated,
                maxDelegation,
                '9x multiplier'
            ));

            container.appendChild(barsContainer);
        }

        container.appendChild(grid);

        // Fetch missed rights (no delay — sequential calls handle rate limits)
        if (participationAddr && currentCycle && missedCycleEl && missedLifetimeEl) {
            // Never leave placeholders stuck forever
            const fallbackTimer = setTimeout(() => {
                const cVal = missedCycleEl.querySelector('.my-baker-stat-value');
                const lVal = missedLifetimeEl.querySelector('.my-baker-stat-value');
                if (cVal && cVal.textContent === 'Loading...') cVal.textContent = 'N/A';
                if (lVal && lVal.textContent === 'Loading...') lVal.textContent = 'N/A';
            }, 20000);

            // Run async without blocking the rest of the render
            (async () => {
                try {
                    const missedRights = await fetchMissedRights(participationAddr, currentCycle);
                    clearTimeout(fallbackTimer);
                    if (missedRights) {
                        const fmtN = (n) => formatNumber(n, { decimals: 0, useAbbreviation: false });
                        missedCycleEl.querySelector('.my-baker-stat-value').textContent = `${fmtN(missedRights.cycle.blocks)} / ${fmtN(missedRights.cycle.attest)}`;
                        missedLifetimeEl.querySelector('.my-baker-stat-value').textContent = `${fmtN(missedRights.recent.blocks)} / ${fmtN(missedRights.recent.attest)}`;
                    } else {
                        missedCycleEl.querySelector('.my-baker-stat-value').textContent = 'N/A';
                        missedLifetimeEl.querySelector('.my-baker-stat-value').textContent = 'N/A';
                    }
                } catch {
                    clearTimeout(fallbackTimer);
                    missedCycleEl.querySelector('.my-baker-stat-value').textContent = 'N/A';
                    missedLifetimeEl.querySelector('.my-baker-stat-value').textContent = 'N/A';
                }
            })();
        }

        // Sync address to Objkt section if it exists
        const objktInput = document.getElementById('objkt-input');
        if (objktInput && !objktInput.value) objktInput.value = address;
    } catch (err) {
        container.innerHTML = '';
        const errorEl = document.createElement('div');
        errorEl.className = 'my-baker-error';
        errorEl.textContent = 'Failed to load account data. Check the address and try again.';
        container.appendChild(errorEl);
    }
}

/* Objkt rendering moved to objkt-ui.js */

/**
 * Initialize the My Baker section
 */
/**
 * Toggle visibility of My Baker section (independent of calculator)
 */
function updateBakerVisibility(isVisible) {
    const bakerSection = document.getElementById('my-baker-section');
    const toggleBtn = document.getElementById('my-baker-toggle');

    if (bakerSection) bakerSection.classList.toggle('visible', isVisible);
    if (toggleBtn) {
        toggleBtn.classList.toggle('active', isVisible);
        toggleBtn.title = `My Baker: ${isVisible ? 'ON' : 'OFF'}`;
    }
}

function bringToTop(sectionId) {
    const container = document.getElementById('optional-sections');
    const section = document.getElementById(sectionId);
    if (container && section && section.parentElement === container) {
        container.prepend(section);
    }
}

function toggleMyBaker() {
    const isVisible = localStorage.getItem(TOGGLE_KEY) === 'true';
    const newState = !isVisible;
    localStorage.setItem(TOGGLE_KEY, String(newState));
    updateBakerVisibility(newState);
    if (newState) bringToTop('my-baker-section');
}

export function init() {
    const section = document.getElementById('my-baker-section');
    if (!section) return;

    // Setup toggle button
    const toggleBtn = document.getElementById('my-baker-toggle');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', toggleMyBaker);
    }

    // Restore visibility preference (default: off)
    const stored = localStorage.getItem(TOGGLE_KEY);
    const isVisible = stored === 'true';
    updateBakerVisibility(isVisible);

    const input = document.getElementById('my-baker-input');
    const saveBtn = document.getElementById('my-baker-save');
    const clearBtn = document.getElementById('my-baker-clear');
    const shareLinkBtn = document.getElementById('my-baker-share-link');
    const results = document.getElementById('my-baker-results');
    const errorMsg = document.getElementById('my-baker-error-msg');

    if (!input || !saveBtn || !clearBtn || !results) return;

    function updateShareLink(addr) {
        if (shareLinkBtn) {
            shareLinkBtn.style.display = addr ? '' : 'none';
            shareLinkBtn.onclick = () => {
                const url = `https://tezos.systems/${addr}`;
                function fallbackCopy(text) {
                    const ta = document.createElement('textarea');
                    ta.value = text;
                    ta.style.cssText = 'position:fixed;opacity:0';
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                }
                if (navigator.clipboard?.writeText) {
                    navigator.clipboard.writeText(url).then(() => {
                        shareLinkBtn.textContent = '✓';
                        setTimeout(() => { shareLinkBtn.textContent = '🔗'; }, 1500);
                    }).catch(() => {
                        fallbackCopy(url);
                        shareLinkBtn.textContent = '✓';
                        setTimeout(() => { shareLinkBtn.textContent = '🔗'; }, 1500);
                    });
                } else {
                    fallbackCopy(url);
                    shareLinkBtn.textContent = '✓';
                    setTimeout(() => { shareLinkBtn.textContent = '🔗'; }, 1500);
                }
            };
        }
    }

    // Load saved address
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && isValidAddress(saved)) {
        input.value = saved;
        renderBakerData(saved, results);
        updateShareLink(saved);
    }

    saveBtn.addEventListener('click', async () => {
        const raw = input.value.trim();
        errorMsg.textContent = '';

        let addr = raw;
        if (isTezDomain(raw)) {
            errorMsg.textContent = 'Resolving domain...';
            const resolved = await resolveForwardDomain(raw.toLowerCase());
            if (!resolved) {
                errorMsg.textContent = `Could not resolve "${raw}". Domain not found.`;
                return;
            }
            addr = resolved;
            input.value = addr;
            errorMsg.textContent = '';
        }

        if (!isValidAddress(addr)) {
            errorMsg.textContent = 'Invalid address. Enter a tz1…/KT1… address or a .tez domain.';
            return;
        }
        localStorage.setItem(STORAGE_KEY, addr);
        renderBakerData(addr, results);
        updateShareLink(addr);
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
        updateShareLink(null);
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
