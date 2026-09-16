import { loadingRows } from '../ui/text-loading.js';
/**
 * Sleeping Giants - dormant large-account observation and awakening receipts.
 *
 * TzKT `lastActivity` is a block level. Dormancy is calculated exclusively
 * from `lastActivityTime` (with a timestamp-shaped legacy-fixture fallback),
 * and awakening amounts come from the triggering operation, never the
 * account's current holding balance.
 */

import { debugLog, escapeHtml } from '../core/utils.js';
import { quietlyMutate, quietlySyncHtml } from '../core/quiet-refresh.js';
import { THRESHOLDS, API_URLS, MAINNET_LAUNCH } from '../core/config.js';

const CONFIG = Object.freeze({
    minBalance: THRESHOLDS.giantMinBalance,
    minDormantDays: 365,
    maxGiants: 25,
    pollInterval: 300_000,
    apiBase: API_URLS.tzkt
});
const STORAGE_KEY = 'tezos-systems-giants-enabled';
const AWAKENINGS_KEY = 'tezos-systems-awakenings';
const NOTIFICATIONS_KEY = 'tezos-systems-awakening-notifications';
const MAX_STORED_AWAKENINGS = 20;
const MAINNET_LAUNCH_MS = Date.parse(MAINNET_LAUNCH);
const DAY_MS = 86_400_000;
const ACCOUNT_OPERATION_PAGE_SIZE = 100;
const MAX_ACCOUNT_OPERATION_PAGES = 100;

export const giants = [];
export const awakenings = [];
let lastGoodAt = null;
let lastError = '';
let pollTimer = null;
let isEnabled = false;
let notificationsEnabled = false;
let initialLoadPromise = null;

function number(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function timestampValue(value) {
    if (!value || typeof value !== 'string' || /^\d+$/.test(value.trim())) return '';
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : '';
}

/** `lastActivity` is retained as a block-level receipt, never parsed as time. */
export function giantActivityTime(account) {
    return timestampValue(account?.lastActivityTime) || timestampValue(account?.lastActivity);
}

export function classifyLargeAccount(account) {
    const type = String(account?.type || '').toLowerCase().replaceAll('_', ' ');
    const address = String(account?.address || '');
    if (type.includes('delegate') || type.includes('baker')) return { id: 'baker', label: 'Baker', icon: '🍞' };
    if (type.includes('smart') || type.includes('contract') || address.startsWith('KT1')) return { id: 'contract', label: 'Contract', icon: '🧩' };
    if (type.includes('rollup') || address.startsWith('sr1')) return { id: 'rollup', label: 'Rollup', icon: '🧱' };
    if (type.includes('user') || /^tz[1-4]/.test(address)) return { id: 'account', label: 'Implicit account', icon: '👤' };
    return { id: 'unknown', label: 'Unclassified account', icon: '❔' };
}

export function awakeningMovedAmount(operation) {
    if (String(operation?.status || '').toLowerCase() !== 'applied') return null;
    const rawType = String(operation?.type || operation?.kind || '').toLowerCase();
    const type = rawType === 'staking' ? String(operation?.action || 'staking').toLowerCase() : rawType;
    if (!['transaction', 'stake', 'unstake'].includes(type)) return null;
    const candidate = operation?.movedAmountMutez ?? operation?.amount;
    if (candidate === null || candidate === undefined || candidate === '') return null;
    const value = Number(candidate);
    return Number.isFinite(value) && value >= 0 ? value : null;
}

export function formatGiantAmount(mutez, maximumFractionDigits = 1) {
    const xtz = number(mutez) / 1e6;
    if (xtz >= 1_000_000) return `${(xtz / 1_000_000).toFixed(2)}M`;
    if (xtz >= 1_000) return `${(xtz / 1_000).toFixed(0)}K`;
    return xtz.toLocaleString('en-US', { maximumFractionDigits });
}

function shortAddress(address, head = 10, tail = 4) {
    const value = String(address || '');
    return value.length <= head + tail + 3 ? value : `${value.slice(0, head)}...${value.slice(-tail)}`;
}

export function daysSinceActivity(accountOrTimestamp) {
    const timestamp = typeof accountOrTimestamp === 'object'
        ? giantActivityTime(accountOrTimestamp)
        : timestampValue(accountOrTimestamp);
    const activityTime = timestamp ? Date.parse(timestamp) : MAINNET_LAUNCH_MS;
    return Math.max(0, Math.floor((Date.now() - Math.max(activityTime, MAINNET_LAUNCH_MS)) / DAY_MS));
}

export function formatDormancy(days) {
    if (days >= 365) {
        const years = Math.floor(days / 365);
        const months = Math.floor((days % 365) / 30);
        return months ? `${years}y ${months}mo` : `${years}y`;
    }
    return days >= 30 ? `${Math.floor(days / 30)}mo` : `${days}d`;
}

export function getDormancyTier(days) {
    if (days >= 1825) return { tier: 'ancient', label: '5+ years quiet', emoji: '🦴' };
    if (days >= 1095) return { tier: 'legendary', label: '3+ years quiet', emoji: '👑' };
    if (days >= 730) return { tier: 'epic', label: '2+ years quiet', emoji: '💎' };
    if (days >= 365) return { tier: 'rare', label: '1+ year quiet', emoji: '⭐' };
    return { tier: 'common', label: 'Dormant', emoji: '😴' };
}

function operationLabel(operation) {
    const type = String(operation?.type || operation?.kind || 'operation').replaceAll('_', ' ').toLowerCase();
    return type.replace(/^\w/, (character) => character.toUpperCase());
}

function operationIdentity(operation, address = '') {
    if (operation?.id !== null && operation?.id !== undefined) return String(operation.id);
    return `${operation?.hash || operation?.operationGroupHash || 'operation'}:${address}`;
}

function operationHref(awakening) {
    const hash = awakening?.operation?.hash || awakening?.operation?.operationGroupHash;
    return hash ? `https://tzkt.io/${encodeURIComponent(hash)}` : `https://tzkt.io/${encodeURIComponent(awakening.address)}`;
}

function safeHotId(value, fallback = 'awakening') {
    return String(value || fallback).replace(/[^a-z0-9-]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase() || fallback;
}

function dispatchAwakeningHotSignal(awakening) {
    if (typeof window === 'undefined' || typeof window.CustomEvent !== 'function') return;
    const operationId = operationIdentity(awakening?.operation, awakening?.address);
    const awakenedAt = Date.parse(awakening?.awakenedAt || '') || Date.now();
    const moved = awakening.movedAmount === null
        ? 'performed a new operation'
        : `moved ${formatGiantAmount(awakening.movedAmount)} XTZ`;
    window.dispatchEvent(new CustomEvent('hot-signal', {
        detail: {
            id: `giant-awakening-${safeHotId(operationId)}`,
            category: 'whales',
            kind: 'event',
            visual: 'giant',
            spectacle: 'peacock',
            score: 126,
            title: 'Giant awakening',
            detail: operationLabel(awakening?.operation),
            text: `A large ${classifyLargeAccount(awakening).label.toLowerCase()} ${moved} after ${formatDormancy(awakening.dormantDays)} quiet.`,
            route: '#giants',
            createdAt: awakenedAt,
            ttlMs: 86_400_000
        }
    }));
}

function normalizeStoredAwakening(event) {
    const operationTimestamp = timestampValue(event?.operation?.timestamp);
    const awakenedTimestamp = timestampValue(event?.awakenedAt);
    const previousTimestamp = timestampValue(event?.previousActivityTime);
    const operationTime = Date.parse(operationTimestamp || '');
    const awakenedAt = Date.parse(awakenedTimestamp || '');
    const previousActivity = Date.parse(previousTimestamp || '');
    const dormantDays = Math.floor((awakenedAt - previousActivity) / DAY_MS);
    if (!event?.address
        || String(event?.operation?.status || '').toLowerCase() !== 'applied'
        || !Number.isFinite(operationTime)
        || operationTime <= MAINNET_LAUNCH_MS
        || !Number.isFinite(awakenedAt)
        || awakenedAt !== operationTime
        || !Number.isFinite(previousActivity)
        || previousActivity < MAINNET_LAUNCH_MS
        || previousActivity >= awakenedAt
        || !Number.isFinite(dormantDays)
        || dormantDays < CONFIG.minDormantDays
        || (!event?.operation?.id && !event?.operation?.hash && !event?.operation?.operationGroupHash)) {
        return null;
    }
    return {
        ...event,
        operation: { ...event.operation, timestamp: operationTimestamp },
        awakenedAt: new Date(awakenedAt).toISOString(),
        previousActivityTime: new Date(previousActivity).toISOString(),
        dormantDays,
        movedAmount: awakeningMovedAmount(event.operation)
    };
}

function loadStoredAwakenings() {
    try {
        const parsed = JSON.parse(localStorage.getItem(AWAKENINGS_KEY) || '[]');
        const safe = (Array.isArray(parsed) ? parsed : [])
            .map(normalizeStoredAwakening)
            .filter(Boolean)
            .slice(0, MAX_STORED_AWAKENINGS);
        awakenings.splice(0, awakenings.length, ...safe);
        if (JSON.stringify(parsed) !== JSON.stringify(safe)) {
            localStorage.setItem(AWAKENINGS_KEY, JSON.stringify(safe));
        }
    } catch {
        awakenings.splice(0);
        try { localStorage.setItem(AWAKENINGS_KEY, '[]'); } catch {}
    }
}

function saveAwakenings() {
    try {
        localStorage.setItem(AWAKENINGS_KEY, JSON.stringify(awakenings.slice(0, MAX_STORED_AWAKENINGS)));
    } catch (error) {
        console.warn('Failed to save awakening receipts:', error);
    }
}

export function getAwakeningNotificationState() {
    const supported = typeof window !== 'undefined' && 'Notification' in window;
    return {
        supported,
        enabled: supported && notificationsEnabled && Notification.permission === 'granted',
        permission: supported ? Notification.permission : 'unsupported'
    };
}

/** Must be called only from a direct user action, such as the Chamber button. */
export async function requestAwakeningNotifications() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'denied') {
        notificationsEnabled = false;
        localStorage.removeItem(NOTIFICATIONS_KEY);
        return false;
    }
    const permission = Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission();
    notificationsEnabled = permission === 'granted';
    if (notificationsEnabled) localStorage.setItem(NOTIFICATIONS_KEY, 'true');
    else localStorage.removeItem(NOTIFICATIONS_KEY);
    window.dispatchEvent?.(new CustomEvent('awakening-notifications-changed', { detail: getAwakeningNotificationState() }));
    return notificationsEnabled;
}

export function disableAwakeningNotifications() {
    notificationsEnabled = false;
    localStorage.removeItem(NOTIFICATIONS_KEY);
    window.dispatchEvent?.(new CustomEvent('awakening-notifications-changed', { detail: getAwakeningNotificationState() }));
}

function sendAwakeningNotification(awakening) {
    if (!getAwakeningNotificationState().enabled) return;
    const amount = awakening.movedAmount === null
        ? `${operationLabel(awakening.operation)} recorded; no transfer/stake amount`
        : `${formatGiantAmount(awakening.movedAmount)} ꜩ moved`;
    const notification = new Notification('🚨 Large account awakened', {
        body: `${amount} after ${formatDormancy(awakening.dormantDays)} quiet`,
        icon: '/favicon.svg',
        badge: '/favicon.svg',
        tag: `awakening-${operationIdentity(awakening.operation, awakening.address)}`,
        requireInteraction: true
    });
    notification.onclick = () => {
        window.focus();
        window.open(operationHref(awakening), '_blank', 'noopener');
        notification.close();
    };
}

export async function fetchSleepingGiants() {
    const params = new URLSearchParams({
        'balance.ge': String(CONFIG.minBalance),
        'sort.desc': 'balance',
        limit: '100',
        select: 'address,alias,type,balance,lastActivity,lastActivityTime'
    });
    const response = await fetch(`${CONFIG.apiBase}/accounts?${params}`);
    if (!response.ok) throw new Error(`TzKT large accounts unavailable (${response.status})`);
    const accounts = await response.json();
    return accounts
        .map((account) => ({
            ...account,
            accountType: classifyLargeAccount(account),
            activityTime: giantActivityTime(account),
            dormantDays: daysSinceActivity(account)
        }))
        .filter((account) => account.dormantDays >= CONFIG.minDormantDays)
        .sort((a, b) => {
            const timeDelta = (Date.parse(a.activityTime) || 0) - (Date.parse(b.activityTime) || 0);
            return timeDelta || number(b.balance) - number(a.balance);
        })
        .slice(0, CONFIG.maxGiants);
}

function operationChronology(left, right) {
    const timeDelta = Date.parse(left?.timestamp || '') - Date.parse(right?.timestamp || '');
    if (timeDelta) return timeDelta;
    return number(left?.id, Number.MAX_SAFE_INTEGER) - number(right?.id, Number.MAX_SAFE_INTEGER);
}

async function earliestAppliedAccountOperation(address, afterTime) {
    const after = Date.parse(afterTime || '');
    if (!Number.isFinite(after)) return null;
    let earliest = null;
    let offset = 0;
    for (let page = 0; page < MAX_ACCOUNT_OPERATION_PAGES; page += 1) {
        const params = new URLSearchParams({
            limit: String(ACCOUNT_OPERATION_PAGE_SIZE),
            offset: String(offset),
            'sort.desc': 'id'
        });
        const response = await fetch(`${CONFIG.apiBase}/accounts/${encodeURIComponent(address)}/operations?${params}`);
        if (!response.ok) return null;
        const rows = await response.json();
        if (!Array.isArray(rows)) return null;
        let crossedBoundary = false;
        for (const operation of rows) {
            const timestamp = Date.parse(operation?.timestamp || '');
            if (!Number.isFinite(timestamp)) continue;
            if (timestamp <= after) {
                crossedBoundary = true;
                continue;
            }
            if (String(operation?.status || '').toLowerCase() !== 'applied') continue;
            if (!earliest || operationChronology(operation, earliest) < 0) earliest = operation;
        }
        if (crossedBoundary || rows.length < ACCOUNT_OPERATION_PAGE_SIZE) return earliest;
        offset += ACCOUNT_OPERATION_PAGE_SIZE;
    }
    return null;
}

export async function checkAwakenings(previousGiants) {
    if (!previousGiants.length) return [];
    const found = [];
    for (const giant of previousGiants) {
        try {
            const previousActivity = Date.parse(giantActivityTime(giant)) || MAINNET_LAUNCH_MS;
            const operation = await earliestAppliedAccountOperation(giant.address, new Date(previousActivity).toISOString());
            if (!operation?.timestamp) continue;
            const operationTime = Date.parse(operation.timestamp);
            if (!Number.isFinite(operationTime) || operationTime <= previousActivity) continue;
            const dormantDays = Math.floor((operationTime - previousActivity) / DAY_MS);
            if (!Number.isFinite(dormantDays) || dormantDays < CONFIG.minDormantDays) continue;
            found.push({
                address: giant.address,
                alias: giant.alias || '',
                type: giant.type || '',
                accountType: classifyLargeAccount(giant),
                holdingBalance: number(giant.balance),
                movedAmount: awakeningMovedAmount(operation),
                dormantDays,
                previousActivityTime: giantActivityTime(giant) || new Date(MAINNET_LAUNCH_MS).toISOString(),
                awakenedAt: operation.timestamp,
                operation
            });
        } catch {
            // A single account receipt failure must not discard the cohort.
        }
    }
    return found;
}

function addAwakening(awakening, { notify = true } = {}) {
    const id = operationIdentity(awakening.operation, awakening.address);
    if (awakenings.some((candidate) => operationIdentity(candidate.operation, candidate.address) === id)) return false;
    awakenings.unshift({ ...awakening, timestamp: Date.now() });
    awakenings.splice(MAX_STORED_AWAKENINGS);
    saveAwakenings();
    updateAwakeningsLog();
    const alerts = document.getElementById('awakening-alerts');
    if (alerts) quietlyMutate(alerts, () => alerts.prepend(createAwakeningAlert(awakening)));
    if (notify) sendAwakeningNotification(awakening);
    dispatchAwakeningHotSignal(awakening);
    window.dispatchEvent?.(new CustomEvent('giant-awakening', { detail: awakening }));
    if (window.playSound) window.playSound('alert');
    return true;
}

export function getSleepingGiantsSnapshot() {
    return {
        giants: [...giants],
        awakenings: [...awakenings],
        updatedAt: lastGoodAt,
        error: lastError,
        minimumBalance: CONFIG.minBalance,
        minimumDormantDays: CONFIG.minDormantDays,
        notifications: getAwakeningNotificationState()
    };
}

export async function refreshSleepingGiantsData({ checkForAwakenings = true } = {}) {
    if (document.visibilityState !== 'visible') return getSleepingGiantsSnapshot();
    const previous = [...giants];
    try {
        const fresh = await fetchSleepingGiants();
        const events = checkForAwakenings && previous.length ? await checkAwakenings(previous) : [];
        giants.splice(0, giants.length, ...fresh);
        events.forEach((event) => addAwakening(event));
        lastGoodAt = new Date().toISOString();
        lastError = '';
        window.dispatchEvent?.(new CustomEvent('sleeping-giants-data-updated', { detail: getSleepingGiantsSnapshot() }));
        return getSleepingGiantsSnapshot();
    } catch (error) {
        lastError = error?.message || String(error);
        window.dispatchEvent?.(new CustomEvent('sleeping-giants-data-error', { detail: { error: lastError, snapshot: getSleepingGiantsSnapshot() } }));
        throw error;
    }
}

function giantCardMarkup(giant, rank) {
    const dormantDays = giant.dormantDays ?? daysSinceActivity(giant);
    const tier = getDormancyTier(dormantDays);
    const kind = giant.accountType || classifyLargeAccount(giant);
    const activityTime = giantActivityTime(giant);
    return `
        <div class="giant-card giant-${escapeHtml(tier.tier)}" data-quiet-key="giant-${escapeHtml(giant.address)}" data-address="${escapeHtml(giant.address)}" role="link" tabindex="0" aria-label="View ${escapeHtml(kind.label)} on TzKT">
            <div class="giant-rank">#${rank}</div>
            <div class="giant-status"><span class="giant-emoji">${escapeHtml(activityTime ? tier.emoji : '🥚')}</span><span class="giant-tier">${escapeHtml(kind.label)}</span></div>
            <div class="giant-balance">${escapeHtml(formatGiantAmount(giant.balance))} <span class="xtz">ꜩ</span></div>
            <div class="giant-dormancy"><span class="dormancy-label">Quiet for</span><span class="dormancy-value">${escapeHtml(activityTime ? formatDormancy(dormantDays) : 'Since mainnet launch')}</span></div>
            <div class="giant-address" title="${escapeHtml(giant.address)}">${escapeHtml(shortAddress(giant.alias || giant.address, 12, 5))}</div>
            <div class="giant-heartbeat" aria-hidden="true"><svg viewBox="0 0 100 30" class="flatline"><polyline points="0,15 100,15" /></svg></div>
        </div>`;
}

function awakeningAmountLabel(awakening) {
    return awakening.movedAmount === null || awakening.movedAmount === undefined
        ? 'No transfer/stake amount'
        : `${formatGiantAmount(awakening.movedAmount)} ꜩ moved`;
}

function createAwakeningAlert(awakening) {
    const alert = document.createElement('div');
    alert.className = 'awakening-alert';
    alert.dataset.quietKey = `awakening-${operationIdentity(awakening.operation, awakening.address)}`;
    alert.innerHTML = `
        <div class="awakening-header awakening-event-header"><span class="awakening-icon">🚨</span><span class="awakening-title">Awakening receipt</span><span class="awakening-op-type">${escapeHtml(operationLabel(awakening.operation))}</span></div>
        <div class="awakening-event-headline"><strong>${escapeHtml(awakeningAmountLabel(awakening))}</strong><span>after ${escapeHtml(formatDormancy(awakening.dormantDays))} quiet</span></div>
        <div class="awakening-details awakening-event-details"><span class="awakening-balance">Holding observed before event: ${escapeHtml(formatGiantAmount(awakening.holdingBalance))} ꜩ</span><span class="awakening-dormancy">${escapeHtml((awakening.accountType || classifyLargeAccount(awakening)).label)}</span></div>
        <div class="awakening-address">${escapeHtml(shortAddress(awakening.address, 12, 5))}</div>
        <a class="awakening-action" href="${escapeHtml(operationHref(awakening))}" target="_blank" rel="noopener">View operation receipt</a>`;
    return alert;
}

function wireGiantGrid(container) {
    if (!container || container.dataset.giantGridWired === 'true') return;
    container.dataset.giantGridWired = 'true';
    const openAccount = (target) => {
        const card = target.closest?.('.giant-card[data-address]');
        if (card && container.contains(card)) window.open(`https://tzkt.io/${encodeURIComponent(card.dataset.address)}`, '_blank', 'noopener');
    };
    container.addEventListener('click', (event) => openAccount(event.target));
    container.addEventListener('keydown', (event) => {
        if (!['Enter', ' '].includes(event.key) || !event.target.closest?.('.giant-card')) return;
        event.preventDefault();
        openAccount(event.target);
    });
}

function updateUI({ loading = false } = {}) {
    const container = document.getElementById('giants-grid');
    const stats = document.getElementById('giants-stats');
    if (!container) return;
    wireGiantGrid(container);
    if (loading && !giants.length) {
        quietlySyncHtml(container, `<div class="giants-loading">${loadingRows("Searching for dormant large accounts")}</div>`);
        return;
    }
    if (!giants.length) {
        const detail = lastError ? `Last refresh failed: ${lastError}` : 'No accounts meet the current balance and dormancy thresholds.';
        quietlySyncHtml(container, `<div class="giants-empty"><span class="giants-empty-icon">😴</span><span>${escapeHtml(detail)}</span></div>`);
        return;
    }
    const totalHoldings = giants.reduce((sum, giant) => sum + number(giant.balance), 0);
    const averageDormancy = giants.reduce((sum, giant) => sum + (giant.dormantDays ?? daysSinceActivity(giant)), 0) / giants.length;
    if (stats) quietlySyncHtml(stats, `
        <div class="giants-stat"><span class="stat-value">${escapeHtml(formatGiantAmount(totalHoldings))}</span><span class="stat-label">Observed holdings</span></div>
        <div class="giants-stat"><span class="stat-value">${Math.round(averageDormancy)}</span><span class="stat-label">Avg quiet days</span></div>
        <div class="giants-stat"><span class="stat-value">${giants.length}</span><span class="stat-label">Large accounts</span></div>`);
    quietlySyncHtml(container, giants.map(giantCardMarkup).join(''));
}

function formatTimeAgo(timestamp) {
    const seconds = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000));
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return new Date(timestamp).toLocaleDateString();
}

function updateAwakeningsLog() {
    const log = document.getElementById('awakenings-log');
    if (!log) return;
    if (!awakenings.length) {
        quietlySyncHtml(log, '<div class="awakenings-empty">No locally observed awakening receipts yet.</div>');
        return;
    }
    quietlySyncHtml(log, awakenings.map((awakening) => `
        <a class="awakening-log-item" data-quiet-key="awakening-log-${escapeHtml(operationIdentity(awakening.operation, awakening.address))}" href="${escapeHtml(operationHref(awakening))}" target="_blank" rel="noopener">
            <div class="log-item-main"><span class="log-event-kicker">${escapeHtml(operationLabel(awakening.operation))}</span><span class="log-balance">${escapeHtml(awakeningAmountLabel(awakening))}</span><span class="log-dormancy">after ${escapeHtml(formatDormancy(awakening.dormantDays))}</span></div>
            <div class="log-item-meta"><span class="log-address">${escapeHtml(shortAddress(awakening.address))}</span><span class="log-op-type">${escapeHtml((awakening.accountType || classifyLargeAccount(awakening)).label)}</span><span class="log-time">${escapeHtml(formatTimeAgo(awakening.awakenedAt || awakening.timestamp))}</span></div>
        </a>`).join(''));
}

async function pollForUpdates() {
    if (document.visibilityState !== 'visible') return getSleepingGiantsSnapshot();
    try {
        const snapshot = await refreshSleepingGiantsData();
        updateUI();
        updateAwakeningsLog();
        return snapshot;
    } catch (error) {
        console.warn('Sleeping Giants refresh failed; keeping last-good cohort:', error);
        updateUI();
        return getSleepingGiantsSnapshot();
    }
}

function startPolling() {
    if (pollTimer) return;
    pollTimer = window.setInterval(() => {
        if (document.visibilityState === 'visible') pollForUpdates();
    }, CONFIG.pollInterval);
}

function stopPolling() {
    if (pollTimer) window.clearInterval(pollTimer);
    pollTimer = null;
}

function setLauncherToggleState(button, on) {
    const helper = window.tezosSystemsLauncher?.setToggleState;
    if (helper) return helper(button, on);
    button?.classList.toggle('active', on);
    button?.setAttribute('aria-pressed', String(on));
    const pill = button?.querySelector('.feature-status');
    if (pill) pill.textContent = button?.dataset[on ? 'statusOn' : 'statusOff'] || (on ? 'Showing' : 'Hidden');
}

function updateVisibility() {
    const section = document.getElementById('giants-section');
    const toggleButton = document.getElementById('giants-toggle');
    section?.classList.toggle('visible', isEnabled);
    if (toggleButton) {
        setLauncherToggleState(toggleButton, isEnabled);
        toggleButton.title = `Dormant Account Movement: ${isEnabled ? 'Showing' : 'Hidden'}`;
    }
    if (isEnabled) startPolling();
    else stopPolling();
}

async function loadInitialData() {
    if (initialLoadPromise) return initialLoadPromise;
    updateUI({ loading: true });
    initialLoadPromise = refreshSleepingGiantsData({ checkForAwakenings: false })
        .then((snapshot) => {
            updateUI();
            updateAwakeningsLog();
            return snapshot;
        })
        .catch((error) => {
            console.warn('Sleeping Giants initial load failed:', error);
            updateUI();
            return getSleepingGiantsSnapshot();
        })
        .finally(() => { initialLoadPromise = null; });
    return initialLoadPromise;
}

export function toggleSleepingGiants() {
    isEnabled = !isEnabled;
    localStorage.setItem(STORAGE_KEY, String(isEnabled));
    updateVisibility();
    if (isEnabled) {
        const container = document.getElementById('optional-sections');
        const section = document.getElementById('giants-section');
        if (container && section?.parentElement === container) container.prepend(section);
        if (!giants.length) loadInitialData();
        else updateUI();
        updateAwakeningsLog();
    }
    return isEnabled;
}

export async function initSleepingGiants({ legacyUi = true } = {}) {
    if (!legacyUi) {
        debugLog('Initializing dormant-account data without the legacy inline section...');
        loadStoredAwakenings();
        notificationsEnabled = localStorage.getItem(NOTIFICATIONS_KEY) === 'true'
            && 'Notification' in window
            && Notification.permission === 'granted';
        window.sleepingGiantsData = {
            get giants() { return giants; },
            get awakenings() { return awakenings; },
            get snapshot() { return getSleepingGiantsSnapshot(); }
        };
        return;
    }
    const section = document.getElementById('giants-section');
    if (!section) {
        debugLog('Giants section not found');
        return;
    }
    debugLog('Initializing Sleeping Giants...');
    isEnabled = localStorage.getItem(STORAGE_KEY) === 'true';
    loadStoredAwakenings();
    notificationsEnabled = localStorage.getItem(NOTIFICATIONS_KEY) === 'true'
        && 'Notification' in window
        && Notification.permission === 'granted';
    const toggleButton = document.getElementById('giants-toggle');
    if (toggleButton && toggleButton.dataset.giantsToggleWired !== '1') {
        toggleButton.dataset.giantsToggleWired = '1';
        toggleButton.addEventListener('click', toggleSleepingGiants);
    }
    updateVisibility();
    if (isEnabled) await loadInitialData();
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') stopPolling();
        else if (isEnabled) {
            pollForUpdates();
            startPolling();
        }
    });
    window.sleepingGiantsData = {
        get giants() { return giants; },
        get awakenings() { return awakenings; },
        get snapshot() { return getSleepingGiantsSnapshot(); }
    };
}
