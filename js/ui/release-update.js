/**
 * Dedicated service-worker release notice.
 *
 * This surface is intentionally independent from the ambient toast queue:
 * updates remain reachable without blocking Network Moments, while the shared
 * safe-area reservation keeps those notices above the release dock.
 */

import { releaseToastSafeArea, reserveToastSafeArea } from './toast-queue.js';
import { activeOverlayCount } from './overlay-stack.js';

const SAFE_AREA_KEY = 'release-update-dock';
const ENTER_FRAME_COUNT = 2;

let dock = null;
let card = null;
let pill = null;
let compactControls = null;
let actions = null;
let title = null;
let detail = null;
let releaseMeta = null;
let actionButton = null;
let laterButton = null;
let currentAction = null;
let currentLater = null;
let currentPendingLabel = 'Updating…';
let safeAreaFrame = 0;
let resizeObserver = null;
let requestedVisible = false;
let overlaySuppressed = false;

function isGenericReleaseDetail(value) {
    return value === 'Latest: Tezos Systems fixes and features.'
        || value === 'Reload for the latest Tezos Systems fixes and features.'
        || value === 'Reload this tab to finish using the new Tezos Systems build.';
}

async function hydrateIncomingReleaseContext(expectedDetail) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 1500);
    try {
        const response = await fetch('/version.json', {
            cache: 'no-store',
            signal: controller.signal
        });
        const version = response.ok ? await response.json() : null;
        const latestChange = typeof version?.latestChange === 'string'
            ? version.latestChange.replace(/\s+/g, ' ').trim().slice(0, 280)
            : '';
        if (!latestChange || detail?.textContent !== expectedDetail) return;
        detail.textContent = `Latest: ${latestChange}`;
        const metaParts = [];
        if (Number.isInteger(version?.build)) metaParts.push(`Build ${version.build}`);
        if (/^\d{4}-\d{2}-\d{2}$/.test(version?.date || '')) metaParts.push(version.date);
        if (releaseMeta?.textContent === 'Build ready' && metaParts.length) {
            releaseMeta.textContent = metaParts.join(' · ');
        }
        scheduleSafeAreaReservation();
    } catch (_) {
        // Keep the generic release copy when metadata is unavailable.
    } finally {
        window.clearTimeout(timeout);
    }
}

function scheduleSafeAreaReservation() {
    if (typeof window === 'undefined') return;
    if (safeAreaFrame) window.cancelAnimationFrame(safeAreaFrame);
    safeAreaFrame = window.requestAnimationFrame(() => {
        safeAreaFrame = 0;
        if (!dock || dock.hidden) {
            releaseToastSafeArea(SAFE_AREA_KEY);
            document.documentElement.style.removeProperty('--release-update-safe-bottom');
            document.body?.classList.remove('release-update-safe-area-raised');
            return;
        }
        const rect = dock.getBoundingClientRect();
        const safeBottom = window.innerHeight - rect.top + 12;
        reserveToastSafeArea(SAFE_AREA_KEY, safeBottom);
        document.documentElement.style.setProperty('--release-update-safe-bottom', `${safeBottom}px`);
        document.body?.classList.add('release-update-safe-area-raised');
    });
}

function setCollapsed(collapsed, { moveFocus = false } = {}) {
    if (!dock || !card || !pill) return;
    dock.classList.toggle('is-collapsed', collapsed);
    card.hidden = collapsed;
    pill.hidden = !collapsed;
    compactControls.hidden = !collapsed;
    pill.setAttribute('aria-expanded', String(!collapsed));
    if (collapsed && actionButton.parentElement !== compactControls) compactControls.append(actionButton);
    else if (!collapsed && actionButton.parentElement !== actions) actions.prepend(actionButton);
    scheduleSafeAreaReservation();

    if (!moveFocus) return;
    const focusTarget = collapsed ? pill : actionButton;
    window.requestAnimationFrame(() => {
        if (!dock.hidden) focusTarget?.focus({ preventScroll: true });
    });
}

function clearSafeAreaReservation() {
    releaseToastSafeArea(SAFE_AREA_KEY);
    document.documentElement.style.removeProperty('--release-update-safe-bottom');
    document.body?.classList.remove('release-update-safe-area-raised');
}

function syncOverlaySuppression(activeCount = activeOverlayCount()) {
    const nextSuppressed = activeCount > 0;
    if (overlaySuppressed === nextSuppressed && dock?.hidden === (!requestedVisible || nextSuppressed)) return;
    overlaySuppressed = nextSuppressed;
    if (!dock) return;

    if (!requestedVisible || overlaySuppressed) {
        dock.classList.remove('is-visible');
        dock.hidden = true;
        clearSafeAreaReservation();
        return;
    }

    // A deferred update returns only as the compact pill after the reader
    // leaves a modal; it never competes with the modal or steals focus.
    setCollapsed(true);
    dock.hidden = false;
    window.requestAnimationFrame(() => {
        if (!dock || dock.hidden || overlaySuppressed || !requestedVisible) return;
        dock.classList.add('is-visible');
        scheduleSafeAreaReservation();
    });
}

function ensureDock() {
    if (dock || typeof document === 'undefined') return dock;

    dock = document.createElement('aside');
    dock.id = 'release-update-dock';
    dock.className = 'release-update-dock';
    dock.dataset.releaseUpdateDock = '';
    dock.dataset.state = 'ready';
    dock.setAttribute('aria-label', 'Tezos Systems update transmission');
    dock.hidden = true;

    pill = document.createElement('button');
    pill.className = 'release-update-pill';
    pill.type = 'button';
    pill.hidden = true;
    pill.innerHTML = '<span class="release-update-symbol" aria-hidden="true">››</span><span data-release-update-pill-label>Update transmission</span><span aria-hidden="true">⌃</span>';
    pill.setAttribute('aria-label', 'Update transmission — see what changed');
    pill.setAttribute('aria-controls', 'release-update-card');
    compactControls = document.createElement('div');
    compactControls.className = 'release-update-controls';
    compactControls.append(pill);

    card = document.createElement('div');
    card.className = 'release-update-card';
    card.id = 'release-update-card';

    const transmissionHeader = document.createElement('div');
    transmissionHeader.className = 'release-update-transmission-header';
    transmissionHeader.style.display = 'none';

    const transmissionLabel = document.createElement('span');
    transmissionLabel.className = 'release-update-transmission-label';
    transmissionLabel.innerHTML = '<span aria-hidden="true">››</span> System transmission · incoming';

    releaseMeta = document.createElement('span');
    releaseMeta.className = 'release-update-transmission-meta';
    releaseMeta.textContent = 'Build ready';
    transmissionHeader.append(transmissionLabel, releaseMeta);

    const icon = document.createElement('span');
    icon.className = 'release-update-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '›';

    const copy = document.createElement('div');
    copy.className = 'release-update-copy';
    copy.setAttribute('role', 'status');
    copy.setAttribute('aria-live', 'polite');
    copy.setAttribute('aria-atomic', 'true');

    title = document.createElement('strong');
    title.className = 'release-update-title';

    detail = document.createElement('span');
    detail.className = 'release-update-detail';
    copy.append(title, detail);

    actions = document.createElement('div');
    actions.className = 'release-update-actions';

    actionButton = document.createElement('button');
    actionButton.className = 'release-update-action';
    actionButton.type = 'button';
    actionButton.dataset.releaseUpdateAction = '';

    laterButton = document.createElement('button');
    laterButton.className = 'release-update-later';
    laterButton.type = 'button';
    laterButton.dataset.releaseUpdateLater = '';
    laterButton.textContent = 'Later';

    actions.append(actionButton, laterButton);
    card.append(transmissionHeader, icon, copy, actions);
    dock.append(card, compactControls);
    document.body.appendChild(dock);

    const runAction = () => {
        if (actionButton.disabled || typeof currentAction !== 'function') return;
        setReleaseUpdateDockState({ state: 'updating' });
        Promise.resolve().then(() => currentAction()).catch(() => {
            setReleaseUpdateDockState({
                state: 'error',
                title: 'Update needs another try',
                detail: 'The new build is still ready. Try the update again.',
                actionLabel: 'Try again'
            });
        });
    };
    actionButton.addEventListener('click', runAction);

    laterButton.addEventListener('click', () => {
        setCollapsed(true, { moveFocus: true });
        currentLater?.();
    });

    pill.addEventListener('click', () => {
        setCollapsed(false, { moveFocus: true });
    });

    window.addEventListener('resize', scheduleSafeAreaReservation, { passive: true });
    document.addEventListener('tezos:overlay-stack-change', (event) => {
        syncOverlaySuppression(Number(event.detail?.activeCount) || 0);
    });
    if ('ResizeObserver' in window) {
        resizeObserver = new ResizeObserver(scheduleSafeAreaReservation);
        resizeObserver.observe(dock);
    }

    overlaySuppressed = activeOverlayCount() > 0;

    return dock;
}

export function setReleaseUpdateDockState({
    state = 'ready',
    title: nextTitle,
    detail: nextDetail,
    meta: nextMeta,
    actionLabel,
    pendingLabel,
    pillLabel,
    onAction,
    onLater,
    canDefer
} = {}) {
    ensureDock();
    if (!dock) return;

    dock.dataset.state = state;
    if (nextTitle !== undefined) title.textContent = nextTitle;
    if (nextDetail !== undefined) detail.textContent = nextDetail;
    if (nextMeta !== undefined) releaseMeta.textContent = nextMeta;
    if (actionLabel !== undefined) actionButton.textContent = actionLabel;
    if (pendingLabel !== undefined) currentPendingLabel = pendingLabel;
    if (pillLabel !== undefined) {
        const label = pill.querySelector('[data-release-update-pill-label]');
        if (label) label.textContent = pillLabel;
    }
    if (onAction !== undefined) currentAction = onAction;
    if (onLater !== undefined) currentLater = onLater;
    if (canDefer !== undefined) laterButton.hidden = !canDefer;

    actionButton.disabled = state === 'updating';
    laterButton.disabled = actionButton.disabled;
    dock.setAttribute('aria-busy', String(actionButton.disabled));
    if (state === 'updating') {
        actionButton.textContent = currentPendingLabel;
    }
    scheduleSafeAreaReservation();
}

export function showReleaseUpdateDock({
    state = 'ready',
    title = 'Update ready',
    detail = 'Latest: Tezos Systems fixes and features.',
    meta = 'Build ready',
    actionLabel = 'Update & reload',
    pendingLabel = 'Updating…',
    pillLabel = 'Update transmission',
    onAction,
    onLater,
    canDefer = true,
    expanded = false
} = {}) {
    ensureDock();
    if (!dock) return;
    const wasVisible = requestedVisible && !dock.hidden;
    requestedVisible = true;

    setReleaseUpdateDockState({
        state,
        title,
        detail,
        meta,
        actionLabel,
        pendingLabel,
        pillLabel,
        onAction,
        onLater,
        canDefer
    });

    overlaySuppressed = activeOverlayCount() > 0;
    if (overlaySuppressed) {
        dock.classList.remove('is-visible');
        dock.hidden = true;
        clearSafeAreaReservation();
        return;
    }

    dock.hidden = false;
    setCollapsed(!expanded);
    if (meta === 'Build ready' && isGenericReleaseDetail(detail)) {
        hydrateIncomingReleaseContext(detail);
    }
    if (wasVisible) {
        dock.classList.add('is-visible');
        scheduleSafeAreaReservation();
        return;
    }
    dock.classList.remove('is-visible');
    let frames = 0;
    const enter = () => {
        if (!dock || dock.hidden || overlaySuppressed || !requestedVisible) return;
        frames += 1;
        if (frames < ENTER_FRAME_COUNT) {
            window.requestAnimationFrame(enter);
            return;
        }
        dock.classList.add('is-visible');
        scheduleSafeAreaReservation();
    };
    window.requestAnimationFrame(enter);
}

export function expandReleaseUpdateDock({ moveFocus = false } = {}) {
    if (!dock || dock.hidden) return;
    setCollapsed(false, { moveFocus });
}

export function hideReleaseUpdateDock() {
    if (!dock) return;
    requestedVisible = false;
    dock.classList.remove('is-visible');
    dock.hidden = true;
    clearSafeAreaReservation();
}
