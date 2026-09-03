/**
 * My Baker - Personal baker/delegation tracker
 * Shows delegation target, staking balance, estimated rewards, and baker info
 */

import { API_URLS } from '../core/config.js';
import { escapeHtml, formatNumber } from '../core/utils.js';
import { fetchProtocolConstants, fetchStakingAPY, fetchWithDeadline, getExternalStakerApy } from '../core/api.js';
import { fetchBakerLiquidityBakingVote } from '../core/liquidity-baking-vote.js';
import { classifyOctezVersion, fetchOctezVersions } from '../core/octez-versions.js';
import { quietlySyncHtml } from '../core/quiet-refresh.js';
import {
    MAX_SAVED_MY_TEZOS_ADDRESSES,
    MY_TEZOS_ADDRESS_KEY,
    readSavedMyTezosEntries,
    upsertSavedMyTezosEntry,
    writeSavedMyTezosEntries
} from '../core/wallet.js';

const STORAGE_KEY = MY_TEZOS_ADDRESS_KEY;
const TZKT = API_URLS.tzkt;
const TEZ_DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+tez$/i;
const DEFAULT_DELEGATION_LIMIT = 9;
const INTERACTIVE_TZKT_INIT = { __tezosSystemsPriority: 'interactive' };
let _bakerRenderSeq = 0;
let _delegationLimit = DEFAULT_DELEGATION_LIMIT;
let _delegationLimitPromise = null;

/**
 * Validate a Tezos address
 */
export function isValidAddress(addr) {
    if (!addr || addr.length !== 36) return false;
    return /^(tz[1-4]|KT1)[a-zA-Z0-9]{33}$/.test(addr);
}

/**
 * Check if input looks like a Tezos domain
 */
function isTezDomain(input) {
    const domain = String(input || '').trim();
    return domain.length <= 253 && TEZ_DOMAIN_RE.test(domain);
}

/**
 * Resolve a .tez domain to an address
 */
async function resolveForwardDomain(name) {
    try {
        const resp = await fetchWithDeadline('https://api.tezos.domains/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: `query ResolveDomain($name: String!) { domain(name: $name) { address owner } }`,
                variables: { name }
            })
        });
        const data = await resp.json();
        const domain = data?.data?.domain || {};
        return [domain.address, domain.owner].find(isValidAddress) || null;
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

function normalizeOctezSoftware(software) {
    const rawVersion = typeof software === 'string'
        ? software
        : (software?.version || '');
    const version = String(rawVersion || '').trim();
    const known = Boolean(version) && !/^unknown$/i.test(version) && !/^octez$/i.test(version);
    const reportedAt = typeof software === 'object' && software ? software.date : null;
    return {
        known,
        version: known ? version : 'Unknown',
        reportedAt
    };
}

function octezVersionTooltip(software) {
    const info = normalizeOctezSoftware(software);
    if (!info.known) return 'TzKT has no Octez version report for this baker yet';
    if (!info.reportedAt) return 'TzKT-reported delegate software version';
    const date = new Date(info.reportedAt);
    if (!Number.isFinite(date.getTime())) return 'TzKT-reported delegate software version';
    return `TzKT reported this baker software version on ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

function octezVersionDisplay(software, latestVersion) {
    const info = normalizeOctezSoftware(software);
    const status = classifyOctezVersion(info.version, latestVersion);
    const latestText = status.latestVersion && status.latestVersion !== 'Unknown'
        ? ` Latest observed: ${status.latestVersion}.`
        : '';
    return {
        value: info.version,
        className: `my-baker-octez-${status.className}`,
        tooltip: `${octezVersionTooltip(software)}.${latestText}`.replace(/\.\./g, '.')
    };
}

/**
 * Resolve Tezos Domains name for an address
 */
async function resolveDomain(address) {
    try {
        const resp = await fetchWithDeadline('https://api.tezos.domains/graphql', {
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

async function getStakingAPY() {
    return fetchStakingAPY();
}

async function getDelegationLimit() {
    if (_delegationLimitPromise) return _delegationLimitPromise;
    _delegationLimitPromise = fetchProtocolConstants()
        .then((constants) => {
            const limit = Number(constants?.limit_of_delegation_over_baking);
            if (Number.isFinite(limit) && limit > 0) _delegationLimit = limit;
            return _delegationLimit;
        })
        .catch(() => _delegationLimit);
    return _delegationLimitPromise;
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
            let timeout;
            try {
                const controller = new AbortController();
                timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout per query
                const r = await fetch(url, { signal: controller.signal });
                if (r.status === 429) {
                    await new Promise(res => setTimeout(res, 2000 * (i + 1)));
                    continue;
                }
                if (!r.ok) return null;
                const raw = (await r.text()).trim();
                if (!/^\d+$/.test(raw)) return null;
                const count = Number(raw);
                return Number.isSafeInteger(count) && count >= 0 ? count : null;
            } catch {
                if (i === retries) return null;
            } finally {
                clearTimeout(timeout);
            }
        }
        return null;
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
function createStatItem(label, value, tooltip, extraClass = '') {
    const div = document.createElement('div');
    div.className = 'my-baker-stat';
    div.dataset.quietKey = `my-baker-stat:${label}`;
    if (extraClass) div.classList.add(extraClass);
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

function formatLiquidityBakingVote(vote) {
    if (!vote) return 'N/A';
    if (!vote.found) return vote.label || 'Unavailable';
    return `${vote.icon || ''} ${vote.label}`.trim();
}

function liquidityBakingVoteTooltip(vote) {
    if (!vote?.found) return 'Latest Liquidity Baking vote was not available from recent TzKT block data';
    const status = vote.subsidyDisabled ? 'subsidy disabled' : 'subsidy active';
    return `Latest block produced by this baker: ${vote.level?.toLocaleString?.('en-US') || vote.level} (${vote.age}). EMA ${vote.emaPct.toFixed(1)}%; ${status}.`;
}

/**
 * Create a capacity bar card showing used vs max capacity
 */
function createCapacityBar(label, used, max, note) {
    const rawPct = max > 0 ? (used / max) * 100 : (used > 0 ? 100 : 0);
    const pct = Number.isFinite(rawPct) ? Math.max(rawPct, 0) : 0;
    const fillPct = Math.min(pct, 100);
    const remaining = max - used;
    const isOverCapacity = remaining < 0;
    const freeAmount = formatNumber(remaining, {
        decimals: 0,
        useAbbreviation: !isOverCapacity
    });

    const card = document.createElement('div');
    card.className = 'capacity-bar-card';
    card.dataset.quietKey = `capacity-bar:${label}`;
    if (isOverCapacity) card.classList.add('capacity-over');

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
    barFill.style.width = `${fillPct}%`;
    // Color based on fill level
    if (isOverCapacity) barFill.classList.add('capacity-over');
    if (pct >= 90) barFill.classList.add('capacity-critical');
    else if (pct >= 70) barFill.classList.add('capacity-warning');
    barTrack.appendChild(barFill);

    const details = document.createElement('div');
    details.className = 'capacity-bar-details';
    details.innerHTML = `
        <span>${formatNumber(used, { decimals: 0 })} ꜩ used</span>
        <span>${freeAmount} ꜩ free</span>
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
 * Create a shape-correct account-stat loader that holds the drawer geometry
 * while the first TzKT/RPC reads are in flight.
 */
function createMatrixLoader() {
    const wrapper = document.createElement('div');
    wrapper.className = 'my-baker-loading-matrix';
    wrapper.setAttribute('role', 'status');
    wrapper.setAttribute('aria-label', 'Reading account statistics');
    wrapper.innerHTML = `
        <span class="drawer-loading-kicker">Reading account statistics</span>
        <div class="my-baker-loading-grid" aria-hidden="true">
            ${Array.from({ length: 8 }, () => '<span class="my-baker-loading-stat"></span>').join('')}
        </div>
    `;

    return wrapper;
}

/**
 * Render the My Baker data into the results container
 */
async function renderBakerData(address, container, { quiet = false } = {}) {
    const renderSeq = ++_bakerRenderSeq;
    const renderTarget = quiet ? document.createElement('div') : container;
    if (!quiet) container.innerHTML = '';
    // Remove stale report card button so MutationObserver recreates with fresh address
    const section = container.closest('#drawer-baker') || container.closest('#my-baker-section');
    if (!quiet && section) { const oldBtn = section.querySelector('.report-card-btn'); if (oldBtn) oldBtn.remove(); }
    if (!quiet) {
        const loadingEl = createMatrixLoader();
        container.appendChild(loadingEl);
    }

    try {
        // Fetch account data
        const accountResp = await fetch(`${TZKT}/accounts/${encodeURIComponent(address)}`, INTERACTIVE_TZKT_INIT);
        if (!accountResp.ok) throw new Error('Account not found');
        const account = await accountResp.json();

        // Check if this address is a baker
        let bakerData = null;
        if (account.type === 'delegate' || account.delegate?.address === address) {
            try {
                const bakerResp = await fetch(`${TZKT}/delegates/${encodeURIComponent(address)}`, INTERACTIVE_TZKT_INIT);
                if (bakerResp.ok) bakerData = await bakerResp.json();
            } catch { /* not a baker */ }
        }

        // If not a baker but has a delegate, fetch the delegate's baker data
        let delegateBakerData = null;
        if (!bakerData && account.delegate?.address) {
            try {
                const dResp = await fetch(`${TZKT}/delegates/${encodeURIComponent(account.delegate.address)}`, INTERACTIVE_TZKT_INIT);
                if (dResp.ok) delegateBakerData = await dResp.json();
            } catch { /* ignore */ }
        }

        // Determine baker address for participation lookups
        const participationAddr = bakerData ? address : account.delegate?.address;
        const activeBaker = bakerData || delegateBakerData;

        // Get current cycle from Octez RPC (avoids TzKT rate limits)
        let currentCycle = null;
        try {
            const lvlResp = await fetch(`${API_URLS.octez}/chains/main/blocks/head/helpers/current_level`);
            if (lvlResp.ok) { const lvl = await lvlResp.json(); currentCycle = lvl.cycle; }
        } catch { /* ignore */ }

        // Fetch APY, domain, and participation data in parallel (missed rights deferred to avoid 429s)
        const [apy, delegateDomain, participation, dalParticipation, lbVote, octezVersions, delegationLimit] = await Promise.all([
            getStakingAPY(),
            account.delegate?.address ? resolveDomain(account.delegate.address) : Promise.resolve(null),
            participationAddr ? fetchParticipation(participationAddr) : Promise.resolve(null),
            participationAddr ? fetchDALParticipation(participationAddr) : Promise.resolve(null),
            participationAddr ? fetchBakerLiquidityBakingVote(participationAddr, { priority: 'interactive' }) : Promise.resolve(null),
            activeBaker ? fetchOctezVersions({ priority: 'interactive' }).catch(() => null) : Promise.resolve(null),
            getDelegationLimit(),
        ]);

        if (renderSeq !== _bakerRenderSeq) return;
        renderTarget.innerHTML = '';

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
            const octez = octezVersionDisplay(delegateBakerData.software, octezVersions?.latestVersion);
            grid.appendChild(createStatItem('Bkr Octez', octez.value, octez.tooltip, octez.className));
            grid.appendChild(createStatItem('Bkr Staking Power', fmtXTZ(delegateBakerData.stakingBalance)));
            grid.appendChild(createStatItem('Bkr Stakers', formatNumber(delegateBakerData.stakersCount || 0, { decimals: 0, useAbbreviation: false })));
            grid.appendChild(createStatItem('Bkr Delegators', formatNumber(delegateBakerData.numDelegators || 0, { decimals: 0, useAbbreviation: false })));
        }

        if (lbVote) {
            grid.appendChild(createStatItem(
                bakerData ? 'LB Vote' : 'Bkr LB Vote',
                formatLiquidityBakingVote(lbVote),
                liquidityBakingVoteTooltip(lbVote)
            ));
        }

        // If baker, show baker-specific stats
        if (bakerData) {
            const octez = octezVersionDisplay(bakerData.software, octezVersions?.latestVersion);
            grid.appendChild(createStatItem('Octez Version', octez.value, octez.tooltip, octez.className));
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
            grid.appendChild(createStatItem('Attestation power (cycle)', `${icon} ${pct.toFixed(2)}%`, 'Octez current-cycle expected activity minus missed attestation slots'));
        }

        // Missed rights: render placeholder cards, then fill async
        let missedCycleEl = null;
        let missedLifetimeEl = null;
        if (participationAddr && currentCycle) {
            missedCycleEl = createStatItem('Missed rights (cycle)', 'Checking rights', 'TzKT missed baking rights and missed attestation rights in the current cycle');
            missedLifetimeEl = createStatItem('Missed rights (10 cycles)', 'Checking rights', 'TzKT missed baking rights and missed attestation rights over the last 10 cycles');
            grid.appendChild(missedCycleEl);
            grid.appendChild(missedLifetimeEl);
        }

        if (dalParticipation) {
            const ok = dalParticipation.sufficient_dal_participation;
            const attested = dalParticipation.delegate_attested_dal_slots || 0;
            const attestable = dalParticipation.delegate_attestable_dal_slots || 0;
            const icon = ok ? '✅' : '❌';
            const ratio = attestable > 0 ? `${attested}/${attestable}` : 'N/A';
            grid.appendChild(createStatItem('DAL power (cycle)', `${icon} ${ratio} slots`, 'Octez delegate-attested / delegate-attestable DAL slots at the current RPC head'));
        }

        // Estimated rewards based on staked balance or total balance
        const stakedAmt = (account.stakedBalance || 0) / 1e6;
        const balanceAmt = (account.balance || 0) / 1e6;
        const rewardBase = stakedAmt > 0 ? stakedAmt : balanceAmt;
        const hasRewardRole = Boolean(bakerData || stakedAmt > 0 || account.delegate?.address);
        const rewardRoleActive = bakerData
            ? bakerData.active !== false
            : account.delegate?.address
                ? account.delegate.active !== false && delegateBakerData?.active !== false
                : false;

        const bakerEdge = activeBaker?.edgeOfBakingOverStaking != null
            ? Number(activeBaker.edgeOfBakingOverStaking) / 1e9
            : null;

        let apyRate;
        let apyLabel;
        let apyTooltip;
        if (stakedAmt > 0 && bakerData) {
            apyRate = Number.isFinite(apy.stakeAPY) ? apy.stakeAPY : null;
            apyLabel = 'Baker own stake';
            apyTooltip = 'Gross protocol staking estimate for this baker’s own frozen stake.';
        } else if (stakedAmt > 0) {
            apyRate = getExternalStakerApy(apy.stakeAPY, activeBaker?.edgeOfBakingOverStaking);
            apyLabel = 'External staker';
            apyTooltip = Number.isFinite(bakerEdge)
                ? `Gross protocol staking estimate after the baker keeps ${(bakerEdge * 100).toFixed(1)}% of externally staked rewards.`
                : 'The baker’s on-chain staking edge is unavailable, so no personalized estimate is shown.';
        } else {
            apyRate = apy.delegateAPY;
            apyLabel = 'Delegation gross';
            apyTooltip = 'Protocol-level delegation estimate only. A baker’s off-chain payout policy and fees can change the amount received.';
        }

        if (!hasRewardRole) {
            grid.appendChild(createStatItem(
                'Reward Status',
                'Not active',
                'This address is not currently baking, staking, or delegating.'
            ));
        } else if (!rewardRoleActive) {
            grid.appendChild(createStatItem(
                'Reward Status',
                'Baker inactive',
                'No current reward estimate is shown while the baker or delegate is inactive.'
            ));
        } else if (!Number.isFinite(apyRate) || apyRate < 0) {
            grid.appendChild(createStatItem(
                `APY (${apyLabel})`,
                'Unavailable',
                apyTooltip || 'The live issuance or staking inputs could not be verified, so no estimate is shown.'
            ));
        } else if (apyLabel === 'Delegation gross') {
            grid.appendChild(createStatItem('Gross APY (Delegation)', `${apyRate}%`, apyTooltip));
            grid.appendChild(createStatItem(
                'Personal Projection',
                'Policy-dependent',
                'No daily, monthly, or yearly personal estimate is shown without this baker’s off-chain payout percentage and cadence.'
            ));
        } else if (rewardBase > 0) {
            const yearly = rewardBase * (apyRate / 100);
            const monthly = yearly / 12;
            const daily = yearly / 365.25;

            grid.appendChild(createStatItem(`APY (${apyLabel})`, `${apyRate}%`, apyTooltip));
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

            const activeDelegationLimit = Number.isFinite(Number(delegationLimit)) && Number(delegationLimit) > 0
                ? Number(delegationLimit)
                : DEFAULT_DELEGATION_LIMIT;
            const maxDelegation = ownStake * activeDelegationLimit;

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
                `${activeDelegationLimit}x current protocol limit`
            ));

            renderTarget.appendChild(barsContainer);
        }

        renderTarget.appendChild(grid);
        if (quiet) {
            quietlySyncHtml(container, renderTarget.innerHTML);
            missedCycleEl = container.querySelector('[data-quiet-key="my-baker-stat:Missed rights (cycle)"]');
            missedLifetimeEl = container.querySelector('[data-quiet-key="my-baker-stat:Missed rights (10 cycles)"]');
        }
        if (renderSeq === _bakerRenderSeq) {
            window.dispatchEvent(new CustomEvent('my-tezos-current-account-ready', {
                detail: {
                    address,
                    account,
                    observedAt: Date.now()
                }
            }));
        }

        // Fetch missed rights (no delay — sequential calls handle rate limits)
        if (participationAddr && currentCycle && missedCycleEl && missedLifetimeEl) {
            // Never leave placeholders stuck forever
            const fallbackTimer = setTimeout(() => {
                const cVal = missedCycleEl.querySelector('.my-baker-stat-value');
                const lVal = missedLifetimeEl.querySelector('.my-baker-stat-value');
                if (cVal && cVal.textContent === 'Checking rights') cVal.textContent = 'N/A';
                if (lVal && lVal.textContent === 'Checking rights') lVal.textContent = 'N/A';
            }, 20000);

            // Run async without blocking the rest of the render
            (async () => {
                try {
                    const missedRights = await fetchMissedRights(participationAddr, currentCycle);
                    clearTimeout(fallbackTimer);
                    if (renderSeq !== _bakerRenderSeq) return;
                    if (missedRights) {
                        const fmtN = (n) => formatNumber(n, { decimals: 0, useAbbreviation: false });
                        const renderRightsPair = (element, pair) => {
                            const blocksKnown = Number.isFinite(pair?.blocks);
                            const attestKnown = Number.isFinite(pair?.attest);
                            const value = element.querySelector('.my-baker-stat-value');
                            if (!value) return;
                            if (!blocksKnown && !attestKnown) {
                                value.textContent = 'N/A';
                                element.dataset.quality = 'unavailable';
                                return;
                            }
                            value.textContent = `${blocksKnown ? fmtN(pair.blocks) : 'N/A'} blocks · ${attestKnown ? fmtN(pair.attest) : 'N/A'} attestations${blocksKnown && attestKnown ? '' : ' (partial)'}`;
                            element.dataset.quality = blocksKnown && attestKnown ? 'live' : 'partial';
                        };
                        renderRightsPair(missedCycleEl, missedRights.cycle);
                        renderRightsPair(missedLifetimeEl, missedRights.recent);
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
    } catch (err) {
        if (renderSeq !== _bakerRenderSeq) return;
        if (quiet && container.children.length) return;
        container.innerHTML = '';
        const errorEl = document.createElement('div');
        errorEl.className = 'my-baker-load-state my-baker-load-state-error';
        const title = document.createElement('strong');
        title.textContent = 'Account statistics unavailable';
        const detail = document.createElement('span');
        detail.textContent = 'The address is still saved. Retry this read without clearing the rest of My Tezos.';
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'glass-button my-baker-load-retry';
        retry.textContent = 'Retry account stats';
        retry.addEventListener('click', () => renderBakerData(address, container));
        errorEl.append(title, detail, retry);
        container.appendChild(errorEl);
    }
}

/**
 * Initialize the My Baker section
 */
/**
 * Toggle visibility of My Baker section (independent of calculator)
 */
// updateBakerVisibility, bringToTop, toggleMyBaker removed — content now lives in drawer

export function init() {
    // Elements now live inside the My Tezos drawer

    const input = document.getElementById('my-baker-input');
    const saveBtn = document.getElementById('my-baker-save');
    const clearBtn = document.getElementById('my-baker-clear');
    const shareLinkBtn = document.getElementById('my-baker-share-link');
    const ledgerFlowLink = document.getElementById('my-tezos-ledger-flow-link');
    const maxiPassportLink = document.getElementById('my-tezos-maxi-passport-link');
    const results = document.getElementById('my-baker-results');
    const errorMsg = document.getElementById('my-baker-error-msg');

    if (!input || !saveBtn || !clearBtn || !results) return;
    if (input.dataset.bakerInitialized === '1') return;
    input.dataset.bakerInitialized = '1';

    // Feature 4: Copy-to-clipboard mode — after save, button becomes Copy
    function showCopyMode(address) {
        saveBtn.textContent = '📋 Copy';
        saveBtn.dataset.mode = 'copy';
        saveBtn.dataset.copyAddress = address;
    }
    function restoreSaveMode() {
        saveBtn.textContent = 'Save';
        delete saveBtn.dataset.mode;
        delete saveBtn.dataset.copyAddress;
    }

    function syncSaveModeToInput() {
        if (saveBtn.dataset.mode !== 'copy') return;
        const active = saveBtn.dataset.copyAddress || localStorage.getItem(STORAGE_KEY) || '';
        if (input.value.trim() !== active) {
            restoreSaveMode();
        }
    }

    // Feature 9: Multi-address support
    function addToSavedAddresses(addr, label = null) {
        upsertSavedMyTezosEntry(addr, { label, source: 'my-baker' });
        renderSavedAddresses();
    }

    async function combineSavedBalances(saved, button, status) {
        if (!button || !status || saved.length < 2) return;
        button.disabled = true;
        button.textContent = 'Combining...';
        status.textContent = `Checking ${saved.length} saved addresses through TzKT...`;

        const balances = await Promise.all(saved.map(async ({ address }) => {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);
            try {
                const response = await fetch(`${TZKT}/accounts/${encodeURIComponent(address)}`, {
                    cache: 'no-store',
                    signal: controller.signal
                });
                if (!response.ok) return null;
                const account = await response.json();
                const rawBalance = account?.balance;
                const balance = Number(rawBalance);
                return rawBalance != null && Number.isFinite(balance) && balance >= 0 ? balance : null;
            } catch {
                return null;
            } finally {
                clearTimeout(timeout);
            }
        }));

        const loaded = balances.filter((balance) => balance !== null);
        button.disabled = false;
        button.textContent = 'Refresh total';
        if (!loaded.length) {
            status.textContent = `Saved-wallet total unavailable · 0/${saved.length} loaded`;
            return;
        }

        const total = loaded.reduce((sum, balance) => sum + balance, 0);
        const coverage = loaded.length === saved.length
            ? `${loaded.length}/${saved.length} loaded`
            : `${loaded.length}/${saved.length} loaded · partial`;
        status.textContent = `Saved-wallet total: ${fmtXTZ(total)} · ${coverage}`;
    }

    function renderSavedAddresses() {
        const container = document.getElementById('drawer-saved-addresses');
        if (!container || container.dataset.portfolioOwned === 'true') return;
        const saved = readSavedMyTezosEntries();
        const active = localStorage.getItem(STORAGE_KEY);
        if (!saved.length) { container.innerHTML = ''; return; }

        const savedButtons = saved.map(s => {
            const short = s.address.slice(0, 8) + '…' + s.address.slice(-4);
            const isActive = s.address === active;
            const rawLabel = String(s.label || short);
            const displayLabel = rawLabel.length > 32 ? `${rawLabel.slice(0, 29)}…` : rawLabel;
            const label = escapeHtml(displayLabel);
            const fullLabel = escapeHtml(rawLabel);
            const removeButton = isActive ? '' : `
                <button type="button" class="glass-button wallet-connect-btn saved-addr-remove" data-addr="${escapeHtml(s.address)}" aria-label="Remove ${fullLabel} from saved wallets" title="Remove ${fullLabel}">✕</button>
            `;
            return `<span class="saved-addr-entry" role="group" aria-label="${fullLabel}">
                <button type="button" class="glass-button wallet-connect-btn saved-addr ${isActive ? 'active' : ''}" data-addr="${escapeHtml(s.address)}" aria-pressed="${isActive ? 'true' : 'false'}" title="${isActive ? 'Current My Tezos wallet' : `Switch My Tezos to ${fullLabel}`}">
                    ${isActive ? '●' : '○'} ${label}
                </button>
                ${removeButton}
            </span>`;
        }).join('');

        const combineAction = saved.length > 1 ? `
            <div class="wallet-connect-row">
                <button type="button" class="glass-button wallet-connect-btn" data-saved-wallet-combine>Combine balances</button>
                <span class="wallet-connect-status" data-saved-wallet-total>Optional: asks TzKT for every listed address, then totals their XTZ account balances here (not tokens, NFTs, or DeFi).</span>
            </div>
        ` : '';

        container.innerHTML = `
            <div class="saved-wallet-heading">
                <strong>Saved wallets</strong>
                <span>${saved.length}/${MAX_SAVED_MY_TEZOS_ADDRESSES} local</span>
            </div>
            <div class="wallet-connect-status" data-saved-wallet-note>Saved only in this browser · no wallet connection or on-chain claim required. Paste another address above, then Save.</div>
            <div class="wallet-connect-row" role="group" aria-label="Saved My Tezos wallets">${savedButtons}</div>
            ${combineAction}
        `;

        container.querySelectorAll('.saved-addr-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                const addr = btn.dataset.addr;
                const newSaved = saved.filter(s => s.address !== addr);
                writeSavedMyTezosEntries(newSaved, { source: 'my-baker' });
                renderSavedAddresses();
            });
        });

        container.querySelectorAll('.saved-addr').forEach(btn => {
            btn.addEventListener('click', () => {
                const previousAddress = localStorage.getItem(STORAGE_KEY);
                const addr = btn.dataset.addr;
                localStorage.setItem(STORAGE_KEY, addr);
                input.value = addr;
                renderBakerData(addr, results);
                updateLedgerFlowLink(addr);
                showCopyMode(addr);
                setDrawerConnectionState(true);
                window.dispatchEvent(new CustomEvent('my-baker-updated', { detail: { address: addr, source: 'my-baker', previousAddress } }));
                renderSavedAddresses();
            });
        });

        const combineButton = container.querySelector('[data-saved-wallet-combine]');
        const totalStatus = container.querySelector('[data-saved-wallet-total]');
        combineButton?.addEventListener('click', () => {
            combineSavedBalances(saved, combineButton, totalStatus);
        });
    }

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

    function updateLedgerFlowLink(addr) {
        if (!ledgerFlowLink && !maxiPassportLink) return;
        if (!addr) {
            [ledgerFlowLink, maxiPassportLink].filter(Boolean).forEach((link) => {
                link.hidden = true;
                link.style.display = 'none';
                link.removeAttribute('title');
                link.removeAttribute('aria-label');
            });
        }
        window.dispatchEvent(new CustomEvent('my-tezos-journeys-request', {
            detail: { hasAddress: Boolean(addr) }
        }));
    }

    function setDrawerConnectionState(hasAddress) {
        const emptyState = document.getElementById('drawer-empty-state');
        const connectedState = document.getElementById('drawer-connected');
        if (emptyState) emptyState.style.display = hasAddress ? 'none' : '';
        if (connectedState) connectedState.style.display = hasAddress ? '' : 'none';
    }

    function openDrawer(hasAddress) {
        const drawer = document.getElementById('my-tezos-drawer');
        const scrim = document.getElementById('my-tezos-drawer-scrim');
        if (drawer && scrim) {
            drawer.classList.add('open');
            scrim.classList.add('open');
            document.body.style.overflow = 'hidden';
        }
        setDrawerConnectionState(hasAddress);
    }

    function setStatus(target, message, tone = '') {
        if (!target) return;
        target.textContent = message || '';
        if (tone) target.dataset.tone = tone;
        else delete target.dataset.tone;
        if (tone === 'error') {
            target.setAttribute('role', 'alert');
            target.setAttribute('aria-live', 'assertive');
        } else {
            target.removeAttribute('role');
            target.setAttribute('aria-live', 'polite');
        }
    }

    async function normalizeAddressInput(raw, statusEl) {
        const label = String(raw || '').trim();
        if (!label) {
            setStatus(statusEl, 'Paste a wallet or .tez name first.', 'error');
            return '';
        }
        if (isTezDomain(label)) {
            setStatus(statusEl, 'Resolving domain...', 'loading');
            const resolved = await resolveForwardDomain(label.toLowerCase());
            if (!resolved) {
                setStatus(statusEl, `Could not resolve "${label}". Domain not found.`, 'error');
                return '';
            }
            return resolved;
        }
        return label;
    }

    async function saveAddress(raw, options = {}) {
        const statusEl = options.statusEl || errorMsg;
        const openAfterSave = options.openDrawer !== false;
        setStatus(statusEl, '');

        const addr = await normalizeAddressInput(raw, statusEl);
        if (!addr) return '';

        if (!isValidAddress(addr)) {
            setStatus(statusEl, 'Invalid address. Enter a tz1.../KT1... address or a .tez domain.', 'error');
            return '';
        }

        setStatus(statusEl, '');
        const previousAddress = localStorage.getItem(STORAGE_KEY);
        localStorage.setItem(STORAGE_KEY, addr);
        input.value = addr;
        renderBakerData(addr, results);
        updateShareLink(addr);
        updateLedgerFlowLink(addr);
        showCopyMode(addr);
        addToSavedAddresses(addr, isTezDomain(raw) ? raw.trim().toLowerCase() : null);
        setDrawerConnectionState(true);
        if (openAfterSave) openDrawer(true);
        window.dispatchEvent(new CustomEvent('my-baker-updated', { detail: { address: addr, source: 'my-baker', previousAddress } }));
        return addr;
    }

    // Load saved address
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && isValidAddress(saved)) {
        input.value = saved;
        renderBakerData(saved, results);
        updateShareLink(saved);
        updateLedgerFlowLink(saved);
        showCopyMode(saved);
        // Preserve profiles saved before the local wallet switcher existed.
        addToSavedAddresses(saved);
    } else {
        updateLedgerFlowLink(null);
    }
    renderSavedAddresses();

    window.addEventListener('my-baker-updated', (e) => {
        const source = e.detail?.source || '';
        const addr = e.detail?.address || '';
        if (!source || source === 'my-baker' || !isValidAddress(addr)) return;
        input.value = addr;
        renderBakerData(addr, results);
        updateShareLink(addr);
        updateLedgerFlowLink(addr);
        showCopyMode(addr);
        setDrawerConnectionState(true);
        renderSavedAddresses();
    });

    async function copyCurrentAddress(addr) {
        try {
            await navigator.clipboard.writeText(addr);
            saveBtn.textContent = '✅ Copied';
            setTimeout(() => { saveBtn.textContent = '📋 Copy'; }, 1500);
        } catch {
            const ta = document.createElement('textarea');
            ta.value = addr; ta.style.cssText = 'position:fixed;opacity:0';
            document.body.appendChild(ta); ta.select();
            document.execCommand('copy'); document.body.removeChild(ta);
            saveBtn.textContent = '✅ Copied';
            setTimeout(() => { saveBtn.textContent = '📋 Copy'; }, 1500);
        }
    }

    saveBtn.addEventListener('click', async () => {
        const raw = input.value.trim();
        if (saveBtn.dataset.mode === 'copy' && raw === saveBtn.dataset.copyAddress) {
            await copyCurrentAddress(raw);
            return;
        }
        await saveAddress(raw, { statusEl: errorMsg, openDrawer: false });
    });

    // Allow Enter key
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') saveBtn.click();
    });
    input.addEventListener('input', syncSaveModeToInput);

    clearBtn.addEventListener('click', () => {
        localStorage.removeItem(STORAGE_KEY);
        input.value = '';
        results.innerHTML = '';
        setStatus(errorMsg, '');
        updateShareLink(null);
        updateLedgerFlowLink(null);
        restoreSaveMode();
        // Notify My Tezos strip
        window.dispatchEvent(new CustomEvent('my-baker-updated', { detail: { address: null, source: 'my-baker' } }));
        setDrawerConnectionState(false);
    });

    // Drawer empty-state connect button
    const drawerConnectBtn = document.getElementById('drawer-connect-btn');
    const drawerAddressInput = document.getElementById('drawer-address-input');
    const drawerAddressStatus = document.getElementById('drawer-address-status');
    if (drawerConnectBtn && drawerAddressInput) {
        drawerConnectBtn.addEventListener('click', async () => {
            const raw = drawerAddressInput.value.trim();
            await saveAddress(raw, { statusEl: drawerAddressStatus, openDrawer: false });
        });
        drawerAddressInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') drawerConnectBtn.click();
        });
    }
}

/**
 * Refresh My Baker data (called on dashboard refresh interval)
 */
export function refresh({ quiet = false } = {}) {
    const saved = localStorage.getItem(STORAGE_KEY);
    const results = document.getElementById('my-baker-results');
    if (saved && isValidAddress(saved) && results) {
        return renderBakerData(saved, results, { quiet });
    }
    return Promise.resolve();
}
