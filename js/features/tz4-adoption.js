/**
 * tz4 Adoption Chamber
 * Live baker consensus-key adoption status and first-mover timing.
 */

import { API_URLS } from '../core/config.js';
import { escapeHtml, formatMutez } from '../core/utils.js';

const TZKT = API_URLS.tzkt;
const STORAGE_KEY = 'tezos-systems-my-baker-address';
const CACHE_TTL = 60000;
const MODAL_REFRESH_MS = 60000;
const LATEST_SWITCH_LIMIT = 5;
const ENTRY_PREVIEW_SWITCH_LIMIT = 3;
const PENDING_QUEUE_LIMIT = 8;
const BAKER_STATUS_PREVIEW_LIMIT = 20;

let _tz4Cache = null;
let _tz4CacheTime = 0;
let _savedBodyOverflow = null;
let _savedHtmlOverflow = null;
let _tz4ActiveFilter = 'all';
let _tz4ShowAllBakers = false;
let _tz4ModalTimer = null;
let _tz4ModalRefreshInFlight = false;

function formatCount(value) {
    return Number(value || 0).toLocaleString('en-US');
}

function formatPercent(value, decimals = 1) {
    if (!Number.isFinite(value)) return '--';
    return `${value.toFixed(decimals)}%`;
}

function formatDate(value) {
    if (!value) return 'Timing unavailable';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Timing unavailable';
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

function formatAge(value) {
    if (!value) return 'timing unavailable';
    const diff = Date.now() - new Date(value).getTime();
    if (!Number.isFinite(diff) || diff < 0) return 'just now';
    const days = Math.floor(diff / 86400000);
    if (days < 1) return 'today';
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    const years = Math.floor(months / 12);
    const rest = months % 12;
    return rest ? `${years}y ${rest}mo ago` : `${years}y ago`;
}

function bakerName(baker) {
    return baker?.alias || `${baker?.address?.slice(0, 8) || 'tz'}...${baker?.address?.slice(-5) || ''}`;
}

function isTz4Address(value) {
    return String(value || '').startsWith('tz4');
}

function isBlsConsensusUpdate(operation) {
    const publicKey = String(operation?.publicKey || '');
    const publicKeyHash = String(operation?.publicKeyHash || '');
    return publicKey.startsWith('BLpk') || publicKeyHash.startsWith('tz4');
}

function bakerLinks(address, name) {
    const label = name || (address ? `${address.slice(0, 8)}...${address.slice(-5)}` : 'Unknown baker');
    if (!address) return `<span class="lb-baker-name">${escapeHtml(label)}</span>`;
    const encoded = encodeURIComponent(address);
    return `
        <span class="lb-baker-link-wrap" title="${escapeHtml(address)}">
            <a class="lb-baker-name-link" href="#baker=${encoded}" title="Open Tezos.Systems baker profile">${escapeHtml(label)}</a>
            <a class="lb-baker-source-link" href="https://tzkt.io/${encoded}" target="_blank" rel="noopener" title="Open baker on TzKT">TzKT</a>
        </span>
    `;
}

async function fetchJson(url) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`TzKT HTTP ${response.status}`);
    return response.json();
}

async function fetchActiveBakers() {
    const limit = 500;
    let offset = 0;
    let bakers = [];
    while (true) {
        const url = `${TZKT}/delegates?active=true&select=address,alias,stakingBalance,bakingPower,consensusAddress,externalStakedBalance,externalDelegatedBalance,numDelegators,stakersCount,software&sort.desc=bakingPower&limit=${limit}&offset=${offset}`;
        const batch = await fetchJson(url);
        if (!Array.isArray(batch)) break;
        bakers = bakers.concat(batch);
        if (batch.length < limit) break;
        offset += limit;
    }
    return bakers.filter((baker) => Number(baker.bakingPower || 0) > 0);
}

async function fetchConsensusKeyUpdates() {
    const url = `${TZKT}/operations/update_consensus_key?status=applied&sort.asc=level&limit=10000&select=level,timestamp,sender,publicKey,publicKeyHash,activationCycle,status`;
    const operations = await fetchJson(url);
    return Array.isArray(operations) ? operations.filter(isBlsConsensusUpdate) : [];
}

async function fetchHeadCycle() {
    try {
        const head = await fetchJson(`${TZKT}/head`);
        return Number(head?.cycle);
    } catch (error) {
        console.warn('tz4 Adoption: current cycle unavailable', error);
        return null;
    }
}

function buildOperationMaps(operations, currentCycle) {
    const earliest = new Map();
    const pending = new Map();
    for (const operation of operations) {
        const address = operation?.sender?.address;
        if (!address) continue;
        if (!earliest.has(address)) earliest.set(address, operation);
        const activationCycle = Number(operation.activationCycle);
        if (Number.isFinite(currentCycle) && Number.isFinite(activationCycle) && activationCycle > currentCycle && !pending.has(address)) {
            pending.set(address, operation);
        }
    }
    return { earliest, pending };
}

function enrichBakers(bakers, operations, currentCycle) {
    const { earliest, pending } = buildOperationMaps(operations, currentCycle);
    const totalPower = bakers.reduce((sum, baker) => sum + Number(baker.bakingPower || 0), 0);

    return bakers.map((baker) => {
        const consensusAddress = baker.consensusAddress || baker.address || '';
        const active = isTz4Address(consensusAddress);
        const firstTz4 = earliest.get(baker.address) || null;
        const pendingTz4 = pending.get(baker.address) || null;
        const status = active ? 'active' : pendingTz4 ? 'pending' : 'not-yet';
        const activationCycle = active ? firstTz4?.activationCycle : pendingTz4?.activationCycle;
        const switchedAt = active ? firstTz4?.timestamp : null;
        const name = bakerName(baker);
        const bakingPower = Number(baker.bakingPower || 0);
        return {
            ...baker,
            name,
            active,
            pending: status === 'pending',
            status,
            consensusAddress,
            firstTz4,
            pendingTz4,
            switchedAt,
            activationCycle,
            bakingPowerShare: totalPower ? (bakingPower / totalPower) * 100 : 0
        };
    });
}

function summarize(bakers, currentCycle) {
    const total = bakers.length;
    const active = bakers.filter((baker) => baker.status === 'active');
    const pending = bakers.filter((baker) => baker.status === 'pending');
    const notYet = bakers.filter((baker) => baker.status === 'not-yet');
    const totalPower = bakers.reduce((sum, baker) => sum + Number(baker.bakingPower || 0), 0);
    const activePower = active.reduce((sum, baker) => sum + Number(baker.bakingPower || 0), 0);
    const adoptionPct = total ? (active.length / total) * 100 : 0;
    const pendingPct = total ? (pending.length / total) * 100 : 0;
    const activePowerPct = totalPower ? (activePower / totalPower) * 100 : 0;
    return {
        bakers,
        total,
        activeCount: active.length,
        pendingCount: pending.length,
        notYetCount: notYet.length,
        adoptionPct,
        pendingPct,
        activePowerPct,
        totalPower,
        activePower,
        latestSwitches: latestSwitches(active),
        pendingQueue: pendingQueue(pending),
        currentCycle
    };
}

function timestampValue(value) {
    const time = new Date(value || '').getTime();
    return Number.isFinite(time) ? time : 0;
}

function latestSwitches(bakers, limit = LATEST_SWITCH_LIMIT) {
    return [...bakers]
        .filter((baker) => baker.switchedAt && timestampValue(baker.switchedAt))
        .sort((a, b) => {
            const timeDiff = timestampValue(b.switchedAt) - timestampValue(a.switchedAt);
            if (timeDiff) return timeDiff;
            return Number(b.activationCycle || 0) - Number(a.activationCycle || 0);
        })
        .slice(0, limit);
}

function pendingQueue(bakers, limit = PENDING_QUEUE_LIMIT) {
    return [...bakers]
        .sort((a, b) => {
            const cycleDiff = Number(a.activationCycle || Number.MAX_SAFE_INTEGER) - Number(b.activationCycle || Number.MAX_SAFE_INTEGER);
            if (cycleDiff) return cycleDiff;
            const timeDiff = timestampValue(a.pendingTz4?.timestamp) - timestampValue(b.pendingTz4?.timestamp);
            if (timeDiff) return timeDiff;
            return Number(b.bakingPower || 0) - Number(a.bakingPower || 0);
        })
        .slice(0, limit);
}

function sortBakersForTable(bakers) {
    const statusOrder = { active: 0, pending: 1, 'not-yet': 2 };
    return [...bakers].sort((a, b) => {
        const statusDiff = (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
        if (statusDiff) return statusDiff;
        if (a.status === 'active') {
            const aTime = a.switchedAt ? new Date(a.switchedAt).getTime() : Number.MAX_SAFE_INTEGER;
            const bTime = b.switchedAt ? new Date(b.switchedAt).getTime() : Number.MAX_SAFE_INTEGER;
            if (aTime !== bTime) return aTime - bTime;
        }
        if (a.status === 'pending') {
            const aCycle = Number(a.activationCycle || Number.MAX_SAFE_INTEGER);
            const bCycle = Number(b.activationCycle || Number.MAX_SAFE_INTEGER);
            if (aCycle !== bCycle) return aCycle - bCycle;
        }
        return Number(b.bakingPower || 0) - Number(a.bakingPower || 0);
    });
}

async function fetchTz4AdoptionData({ force = false } = {}) {
    if (!force && _tz4Cache && Date.now() - _tz4CacheTime < CACHE_TTL) {
        renderTz4EntryPreview(_tz4Cache);
        return _tz4Cache;
    }
    const [bakers, operations, currentCycle] = await Promise.all([
        fetchActiveBakers(),
        fetchConsensusKeyUpdates(),
        fetchHeadCycle()
    ]);
    const data = summarize(enrichBakers(bakers, operations, currentCycle), currentCycle);
    _tz4Cache = data;
    _tz4CacheTime = Date.now();
    renderTz4EntryPreview(data);
    return data;
}

function lockPageScroll() {
    if (_savedBodyOverflow !== null) return;
    _savedBodyOverflow = document.body.style.overflow;
    _savedHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
}

function unlockPageScroll() {
    if (_savedBodyOverflow === null) return;
    document.body.style.overflow = _savedBodyOverflow || '';
    document.documentElement.style.overflow = _savedHtmlOverflow || '';
    _savedBodyOverflow = null;
    _savedHtmlOverflow = null;
}

function statusBadge(baker) {
    if (baker.status === 'active') return '<span class="tz4-status-badge active">Active</span>';
    if (baker.status === 'pending') return '<span class="tz4-status-badge pending">Pending</span>';
    return '<span class="tz4-status-badge not-yet">Not yet</span>';
}

function statusDetail(baker) {
    if (baker.status === 'active') {
        const switched = baker.switchedAt ? `${formatDate(baker.switchedAt)} - ${formatAge(baker.switchedAt)}` : 'Active timing unavailable';
        const cycle = baker.activationCycle ? `cycle ${formatCount(baker.activationCycle)}` : 'active now';
        return `${switched} - ${cycle}`;
    }
    if (baker.status === 'pending') {
        return baker.activationCycle
            ? `Activates cycle ${formatCount(baker.activationCycle)}`
            : 'tz4 consensus key submitted';
    }
    return 'Current consensus key is not tz4';
}

function compactBakerName(baker) {
    const name = bakerName(baker);
    const address = baker?.address || '';
    return `<span class="tz4-entry-baker-name" title="${escapeHtml(address)}">${escapeHtml(name)}</span>`;
}

function renderTz4EntryPreviewRows(bakers, mode) {
    if (!bakers.length) {
        const copy = mode === 'pending' ? 'No pending activations' : 'No switch timing yet';
        return `<div class="tz4-entry-preview-empty">${copy}</div>`;
    }
    return bakers.map((baker) => {
        const detail = mode === 'pending'
            ? `Activates cycle ${formatCount(baker.activationCycle || 0)}`
            : `${formatAge(baker.switchedAt)} - cycle ${formatCount(baker.activationCycle || 0)}`;
        return `
            <div class="tz4-entry-preview-row ${mode === 'pending' ? 'pending' : ''}">
                ${compactBakerName(baker)}
                <span>${escapeHtml(detail)}</span>
            </div>
        `;
    }).join('');
}

function renderTz4EntryPreview(data) {
    const card = document.querySelector('.stat-card[data-stat="tz4-adoption"]');
    const target = document.getElementById('tz4-entry-preview');
    if (!card || !target || !data) return;

    card.classList.add('chamber-entry-wide');
    card.classList.toggle('tz4-entry-pending', data.pendingCount > 0);
    card.dataset.tz4EntrySize = 'wide';
    card.dataset.tz4Pending = String(data.pendingCount || 0);
    const latest = (data.latestSwitches || []).slice(0, ENTRY_PREVIEW_SWITCH_LIMIT);
    const pending = (data.pendingQueue || []).slice(0, 1);
    const hiddenPending = Math.max(0, (data.pendingCount || 0) - pending.length);
    card.dataset.tz4LatestSwitches = String(latest.length || 0);
    card.dataset.tz4PowerDescription = `${formatCount(data.activeCount)} / ${formatCount(data.total)} bakers active · ${formatPercent(data.activePowerPct)} power`;
    card.dataset.updatedLabel = `as of ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })} UTC`;
    const description = document.getElementById('tz4-description');
    if (description) {
        description.textContent = card.dataset.tz4PowerDescription;
    }
    target.innerHTML = `
        <div class="tz4-entry-preview-section">
            <div class="tz4-entry-preview-title"><span>Latest switches</span><strong>${formatCount(latest.length)}</strong></div>
            ${renderTz4EntryPreviewRows(latest, 'latest')}
        </div>
        <div class="tz4-entry-preview-section pending">
            <div class="tz4-entry-preview-title"><span>Pending</span><strong>${formatCount(data.pendingCount || 0)}</strong></div>
            ${renderTz4EntryPreviewRows(pending, 'pending')}
            ${hiddenPending ? `<div class="tz4-entry-preview-more">+${formatCount(hiddenPending)} more pending</div>` : ''}
        </div>
    `;
}

function renderAdoptionBar(data) {
    const active = Math.max(0, Math.min(100, data.adoptionPct));
    const pending = Math.max(0, Math.min(100 - active, data.pendingPct));
    return `
        <div class="tz4-adoption-meter" aria-label="tz4 baker adoption">
            <div class="tz4-adoption-fill active" style="width:${active.toFixed(2)}%"></div>
            <div class="tz4-adoption-fill pending" style="left:${active.toFixed(2)}%;width:${pending.toFixed(2)}%"></div>
        </div>
        <div class="tz4-adoption-legend">
            <span><i class="active"></i>${formatCount(data.activeCount)} active</span>
            <span><i class="pending"></i>${formatCount(data.pendingCount)} pending</span>
            <span><i class="not-yet"></i>${formatCount(data.notYetCount)} not yet</span>
        </div>
    `;
}

function renderIntro(data) {
    return `
        <section class="lb-explainer tz4-explainer chamber-anim-fade">
            <div class="lb-explainer-main">
                <div class="lb-explainer-kicker">BLS rollout</div>
                <p><strong>tz4 consensus keys</strong> use BLS signatures. This chamber tracks which active bakers already bake with tz4, who has a pending switch, and who has not moved yet.</p>
                <p>First-mover timing is based on each baker's first applied BLS consensus-key update, with current status checked against the active consensus address.</p>
            </div>
            <div class="lb-explainer-facts" aria-label="tz4 adoption quick facts">
                <span><strong>Active</strong> ${formatCount(data.activeCount)} / ${formatCount(data.total)}</span>
                <span><strong>Pending</strong> ${formatCount(data.pendingCount)} queued</span>
                <span><strong>Power</strong> ${formatPercent(data.activePowerPct)} tz4</span>
            </div>
        </section>
    `;
}

function renderGlobalMetrics(data) {
    return `
        <section class="lb-panel tz4-panel tz4-global-panel chamber-anim-fade">
            <div class="lb-panel-title">Network Status</div>
            <div class="tz4-hero-number">${formatPercent(data.adoptionPct)}</div>
            <div class="tz4-hero-copy">${formatCount(data.activeCount)} of ${formatCount(data.total)} active bakers have tz4 consensus keys active.</div>
            ${renderAdoptionBar(data)}
        </section>
    `;
}

function renderPowerMetrics(data) {
    return `
        <section class="lb-panel tz4-panel chamber-anim-fade" style="animation-delay:80ms">
            <div class="lb-panel-title">Baking Power</div>
            <div class="lb-metric-grid tz4-metric-grid">
                <div><span>tz4 power</span><strong>${formatPercent(data.activePowerPct)}</strong></div>
                <div><span>Active</span><strong>${formatMutez(data.activePower)} XTZ</strong></div>
                <div><span>Total</span><strong>${formatMutez(data.totalPower)} XTZ</strong></div>
            </div>
            <div class="lb-panel-subtitle">Baking-power share uses the same active funded-baker set as the dashboard baker count.</div>
        </section>
    `;
}

function projectionToTarget(data, targetPct = 50) {
    const activeWithDates = data.bakers
        .filter((baker) => baker.status === 'active' && baker.switchedAt)
        .sort((a, b) => timestampValue(a.switchedAt) - timestampValue(b.switchedAt));
    if (!activeWithDates.length || data.adoptionPct >= targetPct) {
        return { label: data.adoptionPct >= targetPct ? 'Target reached' : 'No pace yet', detail: 'Projection needs switch timing.' };
    }
    const now = Date.now();
    const cutoff = now - 90 * 86400000;
    const recent = activeWithDates.filter((baker) => timestampValue(baker.switchedAt) >= cutoff);
    const needed = Math.max(0, Math.ceil((targetPct / 100) * data.total) - data.activeCount);
    const pacePerDay = recent.length / 90;
    if (!needed || pacePerDay <= 0) return { label: 'No current pace', detail: `${needed} more baker${needed === 1 ? '' : 's'} needed for ${targetPct}% by count.` };
    const days = needed / pacePerDay;
    const date = new Date(now + days * 86400000);
    return {
        label: `~${date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`,
        detail: `${needed} more baker${needed === 1 ? '' : 's'} at the 90-day pace (${(pacePerDay * 30).toFixed(1)}/mo).`
    };
}

function renderProjectionPanel(data) {
    const projection = projectionToTarget(data);
    return `
        <section class="lb-panel tz4-panel tz4-projection-panel chamber-anim-fade" id="tz4-projection-panel" style="animation-delay:100ms">
            <div class="lb-panel-title">Projection to 50%</div>
            <div class="tz4-hero-number">${escapeHtml(projection.label)}</div>
            <div class="tz4-hero-copy">${escapeHtml(projection.detail)}</div>
            <div class="lb-metric-grid tz4-metric-grid">
                <div><span>Bakers</span><strong>${formatPercent(data.adoptionPct)}</strong></div>
                <div><span>Power</span><strong>${formatPercent(data.activePowerPct)}</strong></div>
                <div><span>Pending</span><strong>${formatCount(data.pendingCount)}</strong></div>
            </div>
        </section>
    `;
}

function renderHoldoutRows(data) {
    const holdouts = data.bakers
        .filter((baker) => baker.status === 'not-yet')
        .sort((a, b) => Number(b.bakingPower || 0) - Number(a.bakingPower || 0))
        .slice(0, 8);
    if (!holdouts.length) return '<div class="lb-empty-inline">No non-tz4 holdouts in the active funded-baker set.</div>';
    return holdouts.map((baker, index) => `
        <div class="lb-table-row tz4-holdout-row">
            <span>${index + 1}</span>
            <div class="lb-baker-cell">${bakerLinks(baker.address, baker.name)}</div>
            <span>${formatMutez(baker.bakingPower)} XTZ</span>
            <strong>${formatPercent(baker.bakingPowerShare)}</strong>
        </div>
    `).join('');
}

function renderHoldoutsPanel(data) {
    return `
        <section class="lb-panel tz4-panel tz4-holdouts-panel chamber-anim-fade" id="tz4-holdouts-panel" style="animation-delay:180ms">
            <div class="lb-panel-title">Largest Holdouts</div>
            <div class="lb-panel-subtitle">Top active funded bakers whose current consensus key is not tz4.</div>
            <div class="lb-table tz4-holdout-table">
                <div class="lb-table-head tz4-holdout-row"><span>#</span><span>Baker</span><span>Baking power</span><span>Share</span></div>
                ${renderHoldoutRows(data)}
            </div>
        </section>
    `;
}

function monthKey(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function renderSwitchMomentumPanel(data) {
    const counts = new Map();
    data.bakers
        .filter((baker) => baker.status === 'active' && baker.switchedAt)
        .forEach((baker) => {
            const key = monthKey(baker.switchedAt);
            if (key) counts.set(key, (counts.get(key) || 0) + 1);
        });
    const rows = [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-12);
    const max = Math.max(1, ...rows.map(([, count]) => count));
    const bars = rows.length ? rows.map(([key, count]) => `
        <div class="tz4-month-bar" title="${escapeHtml(key)}: ${formatCount(count)} switches">
            <span style="height:${Math.max(8, (count / max) * 100).toFixed(1)}%"></span>
            <small>${escapeHtml(key.slice(5))}</small>
        </div>
    `).join('') : '<div class="lb-empty-inline">No monthly switch timing yet.</div>';
    return `
        <section class="lb-panel tz4-panel tz4-momentum-panel chamber-anim-fade" id="tz4-switch-momentum" style="animation-delay:220ms">
            <div class="lb-panel-title">Switches per Month</div>
            <div class="tz4-month-bars">${bars}</div>
            <div class="lb-panel-subtitle">Momentum from first applied BLS consensus-key updates.</div>
        </section>
    `;
}

function powerMilestones(data) {
    const active = data.bakers
        .filter((baker) => baker.status === 'active' && baker.switchedAt)
        .sort((a, b) => timestampValue(a.switchedAt) - timestampValue(b.switchedAt));
    const markers = [10, 20, 30, 40, 50];
    const found = [];
    let power = 0;
    for (const baker of active) {
        power += Number(baker.bakingPower || 0);
        const pct = data.totalPower ? (power / data.totalPower) * 100 : 0;
        while (markers.length && pct >= markers[0]) {
            found.push({ pct: markers.shift(), date: baker.switchedAt });
        }
    }
    return found;
}

function renderMilestonesPanel(data) {
    const milestones = powerMilestones(data);
    const body = milestones.length ? milestones.map((milestone) => `
        <div class="tz4-focus-row">
            <div class="tz4-focus-main"><strong>${formatCount(milestone.pct)}% power</strong><span class="tz4-focus-meta">${escapeHtml(formatDate(milestone.date))}</span></div>
            <span class="tz4-focus-chip">${escapeHtml(formatAge(milestone.date))}</span>
        </div>
    `).join('') : '<div class="lb-empty-inline">Power milestones are still building.</div>';
    return `
        <section class="lb-panel tz4-panel tz4-milestones-panel chamber-anim-fade" id="tz4-power-milestones" style="animation-delay:260ms">
            <div class="lb-panel-title">Power Milestones</div>
            <div class="tz4-focus-list">${body}</div>
        </section>
    `;
}

function renderSavedBaker(data) {
    const saved = localStorage.getItem(STORAGE_KEY);
    const baker = saved ? data.bakers.find((item) => item.address === saved) : null;
    if (!saved) {
        return `
            <section class="lb-panel tz4-panel tz4-saved-baker tz4-saved-baker-compact chamber-anim-fade" style="animation-delay:120ms">
                <div class="lb-panel-title">Your Baker</div>
                <div class="lb-empty-inline"><a href="/#my-baker">Set your baker</a> to track their tz4 status.</div>
            </section>
        `;
    }
    if (!baker) {
        return `
            <section class="lb-panel tz4-panel tz4-saved-baker tz4-saved-baker-compact chamber-anim-fade" style="animation-delay:120ms">
                <div class="lb-panel-title">Your Baker</div>
                <div class="lb-empty-inline">Saved baker is not in the active funded-baker set.</div>
            </section>
        `;
    }
    return `
        <section class="lb-panel tz4-panel tz4-saved-baker tz4-saved-${baker.status} chamber-anim-fade" style="animation-delay:120ms">
            <div class="lb-panel-title">Your Baker</div>
            <div class="tz4-saved-row">
                <div class="lb-baker-cell">${bakerLinks(baker.address, baker.name)}</div>
                ${statusBadge(baker)}
                <span class="tz4-row-detail">${escapeHtml(statusDetail(baker))}</span>
                ${baker.status === 'active' ? '<button type="button" class="lb-filter-btn tz4-share-switch" data-tz4-share-switch>Share switch</button>' : ''}
            </div>
        </section>
    `;
}

function initTz4Share(container, data) {
    const button = container.querySelector('[data-tz4-share-switch]');
    if (!button || button.dataset.tz4ShareWired) return;
    const saved = localStorage.getItem(STORAGE_KEY);
    const baker = saved ? data.bakers.find((item) => item.address === saved) : null;
    if (!baker) return;
    button.dataset.tz4ShareWired = '1';
    button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const name = baker.name || baker.address;
        const text = `${name} is baking with a tz4/BLS consensus key on Tezos.\n\nTrack the tz4 rollout at tezos.systems/#tz4`;
        if (navigator.share) {
            navigator.share({ text, url: 'https://tezos.systems/#tz4' }).catch(() => {});
            return;
        }
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank', 'width=550,height=420');
    });
}

function renderFirstMoverRows(bakers) {
    const firstMovers = bakers
        .filter((baker) => baker.status === 'active' && baker.switchedAt)
        .sort((a, b) => new Date(a.switchedAt).getTime() - new Date(b.switchedAt).getTime())
        .slice(0, 8);
    if (!firstMovers.length) return '<div class="lb-empty-inline">No first-switch timing is available yet.</div>';
    return firstMovers.map((baker, index) => `
        <div class="tz4-first-row">
            <span class="tz4-first-rank">#${index + 1}</span>
            <div class="lb-baker-cell">${bakerLinks(baker.address, baker.name)}</div>
            <span>${escapeHtml(formatDate(baker.switchedAt))}</span>
            <span>cycle ${escapeHtml(formatCount(baker.activationCycle || 0))}</span>
        </div>
    `).join('');
}

function renderFirstMovers(data) {
    return `
        <section class="lb-panel tz4-panel tz4-first-panel chamber-anim-fade" style="animation-delay:240ms">
            <div class="lb-panel-title">First Movers</div>
            <div class="tz4-first-list">
                <div class="tz4-first-head"><span>#</span><span>Baker</span><span>Switched</span><span>Activation</span></div>
                ${renderFirstMoverRows(data.bakers)}
            </div>
        </section>
    `;
}

function renderLatestSwitchRows(bakers) {
    if (!bakers.length) return '<div class="lb-empty-inline">No recent tz4 switch timing is available yet.</div>';
    return bakers.map((baker) => `
        <div class="tz4-focus-row" data-tz4-latest-switch="${escapeHtml(baker.address)}">
            <div class="tz4-focus-main">
                <div class="lb-baker-cell">${bakerLinks(baker.address, baker.name)}</div>
                <span class="tz4-focus-meta">Switched ${escapeHtml(formatDate(baker.switchedAt))} - ${escapeHtml(formatAge(baker.switchedAt))}</span>
            </div>
            <span class="tz4-focus-chip">cycle ${escapeHtml(formatCount(baker.activationCycle || 0))}</span>
        </div>
    `).join('');
}

function renderLatestSwitches(data) {
    return `
        <section class="lb-panel tz4-panel tz4-latest-panel chamber-anim-fade" style="animation-delay:160ms">
            <div class="lb-panel-title">Latest Switches</div>
            <div class="lb-panel-subtitle">Most recent active bakers to complete tz4 activation.</div>
            <div class="tz4-focus-list">
                ${renderLatestSwitchRows(data.latestSwitches)}
            </div>
        </section>
    `;
}

function renderPendingQueueRows(bakers, total) {
    if (!bakers.length) return '<div class="lb-empty-inline">No bakers are currently pending tz4 activation.</div>';
    const hiddenCount = Math.max(0, total - bakers.length);
    return `
        ${bakers.map((baker) => `
            <div class="tz4-focus-row pending" data-tz4-pending-queue="${escapeHtml(baker.address)}">
                <div class="tz4-focus-main">
                    <div class="lb-baker-cell">${bakerLinks(baker.address, baker.name)}</div>
                    <span class="tz4-focus-meta">${escapeHtml(statusDetail(baker))}${baker.pendingTz4?.timestamp ? ` - submitted ${escapeHtml(formatDate(baker.pendingTz4.timestamp))}` : ''}</span>
                </div>
                ${statusBadge(baker)}
            </div>
        `).join('')}
        ${hiddenCount ? `<div class="tz4-focus-note">${formatCount(hiddenCount)} more pending in the Baker Status filter.</div>` : ''}
    `;
}

function renderPendingQueue(data) {
    return `
        <section class="lb-panel tz4-panel tz4-pending-panel chamber-anim-fade" style="animation-delay:200ms">
            <div class="lb-panel-title">Pending Queue</div>
            <div class="lb-panel-subtitle">Bakers with applied tz4 consensus-key updates waiting for activation.</div>
            <div class="tz4-focus-list">
                ${renderPendingQueueRows(data.pendingQueue, data.pendingCount)}
            </div>
        </section>
    `;
}

function filterBakers(bakers, filter) {
    if (filter === 'all') return bakers;
    return bakers.filter((baker) => baker.status === filter);
}

function renderBakerRows(bakers, { showAll = false } = {}) {
    if (!bakers.length) return '<div class="lb-empty-inline">No bakers match this filter.</div>';
    const rows = sortBakersForTable(bakers);
    const visible = showAll ? rows : rows.slice(0, BAKER_STATUS_PREVIEW_LIMIT);
    return visible.map((baker) => `
        <div class="lb-table-row tz4-table-row" data-tz4-baker="${escapeHtml(baker.address)}" data-tz4-status="${escapeHtml(baker.status)}">
            <div class="lb-baker-cell">${bakerLinks(baker.address, baker.name)}</div>
            <span>${statusBadge(baker)}</span>
            <span>${escapeHtml(baker.status === 'not-yet' ? 'Awaiting switch' : statusDetail(baker))}</span>
            <span>${formatMutez(baker.bakingPower)} XTZ - ${formatPercent(baker.bakingPowerShare)}</span>
        </div>
    `).join('');
}

function renderBakerStatusActions(bakers, showAll = _tz4ShowAllBakers) {
    if (!bakers.length || bakers.length <= BAKER_STATUS_PREVIEW_LIMIT || showAll) return '';
    return `<button type="button" class="lb-filter-btn tz4-show-all-btn" data-tz4-show-all>Show all ${formatCount(bakers.length)}</button>`;
}

function renderBakerStatus(data, activeFilter = _tz4ActiveFilter) {
    window._tz4Bakers = data.bakers;
    const filter = ['all', 'active', 'pending', 'not-yet'].includes(activeFilter) ? activeFilter : 'all';
    const filtered = filterBakers(data.bakers, filter);
    return `
        <section class="lb-panel tz4-panel tz4-bakers-panel chamber-anim-fade" style="animation-delay:300ms">
            <div class="lb-panel-title">Baker Status</div>
            <div class="lb-panel-subtitle">One row per active funded baker. Active rows are ordered by first tz4 switch timing, pending rows by activation cycle.</div>
            <div class="lb-filter-row tz4-filter-row">
                <button class="lb-filter-btn ${filter === 'all' ? 'active' : ''}" data-tz4-filter="all">All ${formatCount(data.total)}</button>
                <button class="lb-filter-btn ${filter === 'active' ? 'active' : ''}" data-tz4-filter="active">Active ${formatCount(data.activeCount)}</button>
                <button class="lb-filter-btn ${filter === 'pending' ? 'active' : ''}" data-tz4-filter="pending">Pending ${formatCount(data.pendingCount)}</button>
                <button class="lb-filter-btn ${filter === 'not-yet' ? 'active' : ''}" data-tz4-filter="not-yet">Not yet ${formatCount(data.notYetCount)}</button>
            </div>
            <div class="lb-table tz4-baker-table">
                <div class="lb-table-head"><span>Baker</span><span>Status</span><span>Timing</span><span>Baking power</span></div>
                <div id="tz4-baker-status-list">${renderBakerRows(filtered, { showAll: _tz4ShowAllBakers })}</div>
            </div>
            <div class="tz4-baker-actions" id="tz4-baker-status-actions">${renderBakerStatusActions(filtered)}</div>
        </section>
    `;
}

function initBakerProfileLinks(root = document) {
    root.querySelectorAll('.lb-baker-name-link').forEach((link) => {
        if (link.dataset.tz4ProfileWired) return;
        link.dataset.tz4ProfileWired = '1';
        link.addEventListener('click', () => closeTz4AdoptionChamber());
    });
}

function initBakerFilters(activeFilter = _tz4ActiveFilter) {
    const container = document.querySelector('.tz4-bakers-panel');
    const list = document.getElementById('tz4-baker-status-list');
    const actions = document.getElementById('tz4-baker-status-actions');
    if (!container || !list || !window._tz4Bakers) return;
    _tz4ActiveFilter = ['all', 'active', 'pending', 'not-yet'].includes(activeFilter) ? activeFilter : 'all';

    function rerenderRows() {
        const filtered = filterBakers(window._tz4Bakers, _tz4ActiveFilter);
        list.innerHTML = renderBakerRows(filtered, { showAll: _tz4ShowAllBakers });
        if (actions) actions.innerHTML = renderBakerStatusActions(filtered);
        initBakerProfileLinks(list);
        actions?.querySelector('[data-tz4-show-all]')?.addEventListener('click', () => {
            _tz4ShowAllBakers = true;
            rerenderRows();
        });
    }

    container.querySelectorAll('[data-tz4-filter]').forEach((button) => {
        button.addEventListener('click', () => {
            container.querySelectorAll('[data-tz4-filter]').forEach((other) => other.classList.remove('active'));
            button.classList.add('active');
            _tz4ActiveFilter = button.dataset.tz4Filter || 'all';
            _tz4ShowAllBakers = false;
            rerenderRows();
        });
    });
    rerenderRows();
}

function renderTz4Adoption(data, container, activeFilter = _tz4ActiveFilter) {
    container.innerHTML = `
        <div class="chamber-header lb-header tz4-header chamber-anim-fade">
            <div class="lb-system-strip">
                <span class="lb-system-brand">Tezos.Systems</span>
                <span>tz4 Adoption</span>
                <span>Consensus keys</span>
            </div>
            <div class="chamber-title-row">
                <h2 class="chamber-title">tz4 Adoption Chamber</h2>
                <span class="chamber-badge ${data.pendingCount ? 'current' : 'live'}">${formatPercent(data.adoptionPct)} active</span>
                <span class="lb-live-pill lb-refresh-pill" id="tz4-refresh-state">auto-refresh ${Math.round(MODAL_REFRESH_MS / 1000)}s</span>
            </div>
            <div class="chamber-proposal-info">
                <div class="proposal-name">BLS consensus-key rollout</div>
                <div class="proposal-hash">Current cycle ${Number.isFinite(data.currentCycle) ? formatCount(data.currentCycle) : 'unknown'} - ${formatCount(data.activeCount)} active - ${formatCount(data.pendingCount)} pending</div>
            </div>
        </div>
        ${renderIntro(data)}
        <div class="lb-dashboard-grid tz4-dashboard-grid">
            ${renderGlobalMetrics(data)}
            ${renderPowerMetrics(data)}
            ${renderProjectionPanel(data)}
            ${renderSavedBaker(data)}
            ${renderLatestSwitches(data)}
            ${renderHoldoutsPanel(data)}
            ${renderPendingQueue(data)}
            ${renderSwitchMomentumPanel(data)}
            ${renderMilestonesPanel(data)}
            ${renderFirstMovers(data)}
        </div>
        ${renderBakerStatus(data, activeFilter)}
        <div class="chamber-footer chamber-anim-fade" style="animation-delay:340ms">
            <a href="https://tzkt.io/bakers" target="_blank" rel="noopener">TzKT Bakers -></a>
            <span class="chamber-footer-sep">&middot;</span>
            <a href="https://octez.tezos.com/docs/user/key-management.html" target="_blank" rel="noopener">Octez Key Docs -></a>
            <span class="chamber-footer-sep">&middot;</span>
            <a class="panel-direct-link" href="/#tz4" aria-label="Direct link to tz4 Adoption Chamber">Direct: /#tz4</a>
        </div>
    `;
    container.dataset.tz4Rendered = 'true';
    initBakerFilters(activeFilter);
    initBakerProfileLinks(container);
    initTz4Share(container, data);
}

async function refreshTz4AdoptionChamber({ initial = false } = {}) {
    const overlay = document.getElementById('tz4-adoption-modal');
    const body = overlay?.querySelector('.tz4-body');
    if (!overlay?.classList.contains('active') || !body || _tz4ModalRefreshInFlight) return;

    const content = overlay.querySelector('.tz4-content');
    const scrollTop = content?.scrollTop || 0;
    const activeFilter = document.querySelector('.tz4-filter-row .lb-filter-btn.active')?.dataset.tz4Filter || _tz4ActiveFilter;
    _tz4ModalRefreshInFlight = true;
    overlay.classList.add('tz4-refreshing');
    try {
        const data = await fetchTz4AdoptionData({ force: !initial });
        if (!overlay.classList.contains('active')) return;
        renderTz4Adoption(data, body, activeFilter);
        if (content) content.scrollTop = scrollTop;
    } catch (error) {
        if (initial) throw error;
        console.warn('tz4 Adoption refresh failed', error);
        const state = document.getElementById('tz4-refresh-state');
        if (state) state.textContent = 'refresh delayed';
    } finally {
        overlay.classList.remove('tz4-refreshing');
        _tz4ModalRefreshInFlight = false;
    }
}

function handleEscape(event) {
    if (event.key === 'Escape') closeTz4AdoptionChamber();
}

function startModalRefresh() {
    stopModalRefresh();
    const overlay = document.getElementById('tz4-adoption-modal');
    if (overlay) overlay.dataset.tz4Live = 'true';
    _tz4ModalTimer = window.setInterval(() => {
        if (document.hidden) return;
        refreshTz4AdoptionChamber();
    }, MODAL_REFRESH_MS);
}

function stopModalRefresh() {
    if (_tz4ModalTimer) {
        window.clearInterval(_tz4ModalTimer);
        _tz4ModalTimer = null;
    }
    const overlay = document.getElementById('tz4-adoption-modal');
    if (overlay) overlay.dataset.tz4Live = 'false';
}

export async function openTz4AdoptionChamber() {
    let overlay = document.getElementById('tz4-adoption-modal');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'tz4-adoption-modal';
        overlay.className = 'modal-overlay chamber-overlay lb-overlay tz4-overlay';
        overlay.innerHTML = `
            <div class="modal-content modal-large chamber-content lb-content tz4-content">
                <button class="modal-close chamber-close" aria-label="Close" style="z-index:3">&times;</button>
                <div class="chamber-body lb-body tz4-body">
                    <div class="chamber-loading">
                        <div class="chamber-loading-text">Loading tz4 adoption...</div>
                        <div class="chamber-loading-bar"><div class="chamber-loading-fill"></div></div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        overlay.querySelector('.chamber-close').addEventListener('click', closeTz4AdoptionChamber);
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) closeTz4AdoptionChamber();
        });
    }

    document.addEventListener('keydown', handleEscape);
    overlay.classList.add('active');
    lockPageScroll();
    const content = overlay.querySelector('.tz4-content');
    if (content) content.scrollTop = 0;

    try {
        await refreshTz4AdoptionChamber({ initial: true });
        startModalRefresh();
    } catch (error) {
        console.error('tz4 Adoption fetch error:', error);
        overlay.querySelector('.tz4-body').innerHTML = `
            <div class="chamber-error">
                <div class="error-icon">!</div>
                <div class="error-title">Couldn't reach tz4 adoption data</div>
                <div class="error-detail">TzKT baker data may be temporarily unavailable. Try again in a moment.</div>
                <button class="chamber-retry-btn" id="tz4-retry-open">Retry</button>
            </div>
        `;
        overlay.querySelector('#tz4-retry-open')?.addEventListener('click', openTz4AdoptionChamber);
    }
}

export function closeTz4AdoptionChamber() {
    document.removeEventListener('keydown', handleEscape);
    stopModalRefresh();
    const overlay = document.getElementById('tz4-adoption-modal');
    if (overlay) overlay.classList.remove('active');
    unlockPageScroll();
}

function wireTz4AdoptionTile() {
    const card = document.querySelector('.stat-card[data-stat="tz4-adoption"]');
    if (!card || card.dataset.tz4ChamberWired) return;
    card.dataset.tz4ChamberWired = '1';
    card.classList.add('chamber-entry-card', 'tz4-entry-card');
    card.style.cursor = 'pointer';
    card.title = 'Open tz4 Adoption Chamber';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', 'Open tz4 Adoption Chamber');

    const shouldIgnore = (target) => Boolean(target?.closest(
        '.card-info-btn, .card-tooltip, .card-share-btn, .card-history-btn, .card-copy-link, a, button'
    ));

    const openFromTile = (event) => {
        if (shouldIgnore(event.target)) return;
        openTz4AdoptionChamber();
    };

    card.addEventListener('click', openFromTile);
    card.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        if (shouldIgnore(event.target)) return;
        event.preventDefault();
        openTz4AdoptionChamber();
    });
}

export function initTz4AdoptionChamber() {
    const launcherBtn = document.getElementById('tz4-adoption-toggle');
    if (launcherBtn && !launcherBtn.dataset.tz4Wired) {
        launcherBtn.dataset.tz4Wired = '1';
        launcherBtn.addEventListener('click', openTz4AdoptionChamber);
    }

    wireTz4AdoptionTile();
    const preview = document.getElementById('tz4-entry-preview');
    if (preview && !preview.dataset.tz4PreviewRequested) {
        preview.dataset.tz4PreviewRequested = '1';
        fetchTz4AdoptionData().catch((error) => {
            console.warn('tz4 Adoption tile preview failed', error);
            preview.innerHTML = '<div class="tz4-entry-preview-empty">tz4 switch list delayed</div>';
        });
    }
}
