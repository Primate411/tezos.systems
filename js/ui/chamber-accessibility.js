/**
 * Shared accessibility wiring for Chamber launch cards and modal dialogs.
 */

import { activateOverlayDialog, deactivateOverlayDialog } from './overlay-stack.js';
import { startChamberReading, stopChamberReading } from './chamber-reading.js';

const launcherOpens = new WeakMap();
const roomVisibility = new Map();

/** An open room owns its catch-up even when its dashboard tile never existed. */
export function bindChamberVisibility(overlayId, refresh) {
    if (roomVisibility.has(overlayId)) return;
    roomVisibility.set(overlayId, refresh);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible' || !document.getElementById(overlayId)?.classList.contains('active')) return;
        Promise.resolve().then(refresh).catch(error => console.warn('Chamber catch-up unavailable:', error));
    });
}
const CHAMBER_SHELL_EXCLUSIONS = new Set(['release-radar-overlay', 'ctez-overlay']);
const WIDE_CHAMBER_DIALOG_SELECTOR = [
    '.capital-content',
    '.minerals-content',
    '.uranium-content',
    '.metals-content',
    '.ecosystem-content',
    '.whale-watch-content',
    '.baker-directory-content'
].join(',');
const CHAMBER_INTERACTIVE_SELECTOR = [
    'a[href]',
    'button',
    'input',
    'select',
    'textarea',
    'summary',
    '[role="button"]',
    '[contenteditable="true"]',
    '.card-tooltip'
].join(',');

function findChamberScrollContainer(dialog) {
    const candidates = [dialog, ...dialog.querySelectorAll(':scope > .chamber-body, :scope > [class$="-body"]')];
    return candidates.find((element) => ['auto', 'scroll'].includes(getComputedStyle(element).overflowY)) || dialog;
}

function normalizeChamberShell(overlay, dialog) {
    if (!overlay.classList.contains('chamber-overlay')
        || [...CHAMBER_SHELL_EXCLUSIONS].some((className) => overlay.classList.contains(className))) return;

    const roomSize = dialog.matches('.staking-chamber-content')
        ? 'narrow'
        : dialog.matches(WIDE_CHAMBER_DIALOG_SELECTOR) ? 'wide' : 'standard';
    overlay.classList.add('chamber-shell-normalized');
    dialog.classList.add('chamber-room-shell');
    dialog.dataset.roomSize = roomSize;

    const scrollContainer = findChamberScrollContainer(dialog);
    const basePaddingBottom = getComputedStyle(scrollContainer).paddingBottom || '0px';
    scrollContainer.classList.add('chamber-room-scroll');
    if (!scrollContainer.style.getPropertyValue('--chamber-room-base-padding-bottom')) {
        scrollContainer.style.setProperty('--chamber-room-base-padding-bottom', basePaddingBottom);
    }

    document.dispatchEvent(new CustomEvent('tezos:chamber-dialog-active', {
        detail: { overlay, dialog, scrollContainer, roomSize }
    }));
}

function ensureLauncherTitle(card, titleSelector, fallbackId) {
    const title = card.querySelector(titleSelector || 'h1, h2, h3, .stat-label');
    if (!title) return '';
    title.classList.add('chamber-entry-title');
    if (!title.id) title.id = fallbackId;
    return title.id;
}

function ensureOpenButton(card, label) {
    window.syncChamberEntryFooters?.(card.parentElement || document);
    let cue = card.querySelector('.chamber-entry-footer > .chamber-expand-cue');
    if (!cue) return null;

    if (cue.tagName !== 'BUTTON') {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = cue.className;
        button.innerHTML = cue.innerHTML;
        cue.replaceWith(button);
        cue = button;
    }
    cue.type = 'button';
    cue.removeAttribute('aria-hidden');
    cue.setAttribute('aria-label', label);
    cue.title = label;
    return cue;
}

export function findChamberLauncher(cardSelector) {
    return document.querySelector(cardSelector)?.querySelector('.chamber-expand-cue') || null;
}

/**
 * Restore focus after a user-selected Chamber tab re-renders its tablist, then
 * reveal that tab inside a horizontally scrolling rail without moving the
 * room's vertical reading position.
 */
export function focusChamberTab(tab) {
    if (!(tab instanceof HTMLElement)) return;
    tab.focus({ preventScroll: true });

    const tablist = tab.closest('[role="tablist"]');
    if (!(tablist instanceof HTMLElement)) return;
    const tabBounds = tab.getBoundingClientRect();
    const listBounds = tablist.getBoundingClientRect();
    const inset = 4;
    if (tabBounds.left < listBounds.left + inset) {
        tablist.scrollLeft += tabBounds.left - listBounds.left - inset;
    } else if (tabBounds.right > listBounds.right - inset) {
        tablist.scrollLeft += tabBounds.right - listBounds.right + inset;
    }
}

/**
 * Make a Chamber card a labelled article whose quiet surface and explicit
 * native Open action launch the room. Nested controls retain their own action.
 */
export function wireChamberLauncher(card, {
    open,
    label,
    titleSelector = 'h1, h2, h3, .stat-label'
} = {}) {
    if (!card || typeof open !== 'function') return null;

    const titleId = ensureLauncherTitle(card, titleSelector, `${card.id || card.dataset.stat || 'chamber'}-title`);
    card.setAttribute('role', 'article');
    if (titleId) card.setAttribute('aria-labelledby', titleId);
    else card.setAttribute('aria-label', label);
    card.removeAttribute('tabindex');
    card.removeAttribute('title');
    card.style.cursor = 'pointer';
    card.classList.add('chamber-entry-launcher');
    launcherOpens.set(card, open);

    if (card.dataset.chamberSurfaceWired !== '1') {
        card.dataset.chamberSurfaceWired = '1';
        card.addEventListener('click', (event) => {
            if (event.defaultPrevented) return;
            const target = event.target instanceof Element ? event.target : null;
            if (!target || target.closest(CHAMBER_INTERACTIVE_SELECTOR)) return;
            launcherOpens.get(card)?.();
        });
    }

    const button = ensureOpenButton(card, label);
    if (!button) return null;
    if (button.dataset.chamberOpenWired !== '1') {
        button.dataset.chamberOpenWired = '1';
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            launcherOpens.get(card)?.();
        });
    }
    return button;
}

/**
 * Activate an existing Chamber overlay as a keyboard-contained modal dialog.
 */
export function activateChamberDialog(overlay, {
    close,
    dialogSelector = '[role="dialog"], .chamber-content',
    titleId = '',
    label = '',
    initialFocusSelector = '.chamber-close',
    restoreFocusSelector = '',
    lockScroll = false
} = {}) {
    if (!overlay || typeof close !== 'function') return;
    const dialog = overlay.querySelector(dialogSelector);
    if (!dialog) return;

    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('tabindex', '-1');
    if (titleId) dialog.setAttribute('aria-labelledby', titleId);
    if (label) dialog.setAttribute('aria-label', label);
    normalizeChamberShell(overlay, dialog);
    activateOverlayDialog(overlay, {
        close,
        dialogSelector: dialog,
        titleId,
        label,
        initialFocusSelector,
        restoreFocusTarget: () => restoreFocusSelector
            ? findChamberLauncher(restoreFocusSelector) || document.querySelector(restoreFocusSelector)
            : null,
        // Most Chambers retain their established per-feature scroll lock.
        // New or migrated rooms can opt into the shared stack's ownership.
        lockScroll
    });
    startChamberReading(dialog);
}

/**
 * Deactivate a Chamber dialog and return focus to the control that opened it.
 */
export function deactivateChamberDialog(overlay, { restoreFocus = true } = {}) {
    if (!overlay) return;
    stopChamberReading(overlay.matches('[role="dialog"]') ? overlay : overlay.querySelector('[role="dialog"]'));
    deactivateOverlayDialog(overlay, { restoreFocus });
}

/** A standalone owner may retain the room while preparing its dashboard exit. */
export function requestChamberClose(overlay) {
    return !overlay?.matches('.active, .open') || document.dispatchEvent(new CustomEvent('tezos:chamber-before-close', {
        cancelable: true, detail: { overlay }
    }));
}
