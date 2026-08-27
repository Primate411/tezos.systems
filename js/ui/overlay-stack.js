/**
 * Shared modal stack for Tezos Systems overlays.
 *
 * The stack owns keyboard containment, background isolation, optional scroll
 * locking, and focus restoration. Feature modules remain responsible for
 * their visual open/close classes and route state.
 */

const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'summary',
    '[contenteditable="true"]',
    '[tabindex]:not([tabindex="-1"])'
].join(',');

const OVERLAY_BRANCH_EXCLUSIONS = new Set(['SCRIPT', 'STYLE', 'LINK', 'META']);
const statesByOverlay = new WeakMap();
const overlayStack = [];
const inertSnapshots = new Map();
const managedInertElements = new Set();

let keydownListening = false;
let savedBodyOverflow = null;
let savedHtmlOverflow = null;
let scrollLocked = false;
let removalObserver = null;
let userInteractionEpoch = 0;

if (typeof document !== 'undefined') {
    const recordUserInteraction = (event) => {
        if (event.isTrusted) userInteractionEpoch += 1;
    };
    document.addEventListener('pointerdown', recordUserInteraction, true);
    document.addEventListener('keydown', recordUserInteraction, true);
}

function isHTMLElement(value) {
    return typeof HTMLElement !== 'undefined' && value instanceof HTMLElement;
}

function isVisibleFocusable(element) {
    if (!isHTMLElement(element)
        || element.closest('[inert], [hidden], [aria-hidden="true"]')
        || element.getAttribute('aria-hidden') === 'true') return false;
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    return element.getClientRects().length > 0;
}

function visibleFocusableElements(root) {
    if (!root) return [];
    return [...root.querySelectorAll(FOCUSABLE_SELECTOR)].filter(isVisibleFocusable);
}

function pruneStack() {
    let changed = false;
    for (let index = overlayStack.length - 1; index >= 0; index -= 1) {
        const state = overlayStack[index];
        if (state.overlay.isConnected && state.dialog.isConnected) continue;
        overlayStack.splice(index, 1);
        statesByOverlay.delete(state.overlay);
        changed = true;
    }
    return changed;
}

function topState() {
    if (pruneStack()) syncOverlayEnvironment();
    return overlayStack.at(-1) || null;
}

function snapshotInert(element) {
    if (inertSnapshots.has(element)) return;
    inertSnapshots.set(element, {
        hadAttribute: element.hasAttribute('inert'),
        inert: Boolean(element.inert)
    });
}

function restoreManagedInert(element) {
    const snapshot = inertSnapshots.get(element);
    if (!snapshot) return;
    if (snapshot.hadAttribute) element.setAttribute('inert', '');
    else element.removeAttribute('inert');
    element.inert = snapshot.inert;
}

function desiredInertElements(activeOverlay) {
    const desired = new Set();
    let branch = activeOverlay;
    while (branch?.parentElement) {
        const parent = branch.parentElement;
        for (const sibling of parent.children) {
            const portalOwner = sibling.getAttribute?.('data-overlay-portal-owner') || '';
            if (sibling === branch
                || sibling.contains(activeOverlay)
                || (portalOwner && portalOwner === activeOverlay.id)
                || OVERLAY_BRANCH_EXCLUSIONS.has(sibling.tagName)) continue;
            desired.add(sibling);
        }
        if (parent === document.body) break;
        branch = parent;
    }
    return desired;
}

function syncBackgroundIsolation() {
    const state = overlayStack.at(-1) || null;
    const desired = state ? desiredInertElements(state.overlay) : new Set();

    for (const element of [...managedInertElements]) {
        if (desired.has(element)) continue;
        restoreManagedInert(element);
        managedInertElements.delete(element);
    }

    for (const element of desired) {
        snapshotInert(element);
        element.setAttribute('inert', '');
        element.inert = true;
        managedInertElements.add(element);
    }

    if (!state) {
        for (const [element] of inertSnapshots) restoreManagedInert(element);
        managedInertElements.clear();
        inertSnapshots.clear();
    }
}

function syncScrollLock() {
    const shouldLock = overlayStack.some((state) => state.lockScroll);
    if (shouldLock) {
        if (!scrollLocked) {
            savedBodyOverflow = document.body.style.overflow;
            savedHtmlOverflow = document.documentElement.style.overflow;
            scrollLocked = true;
        }
        // Reassert ownership if a legacy feature restored its own scroll
        // snapshot while another managed overlay is still active.
        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';
        return;
    }
    if (!shouldLock && scrollLocked) {
        document.body.style.overflow = savedBodyOverflow || '';
        document.documentElement.style.overflow = savedHtmlOverflow || '';
        savedBodyOverflow = null;
        savedHtmlOverflow = null;
        scrollLocked = false;
    }
}

function resolveInitialFocus(state) {
    if (isHTMLElement(state.initialFocus) && isVisibleFocusable(state.initialFocus)) {
        return state.initialFocus;
    }
    if (typeof state.initialFocusSelector === 'string' && state.initialFocusSelector) {
        const selected = state.dialog.querySelector(state.initialFocusSelector);
        if (isVisibleFocusable(selected)) return selected;
    }
    return visibleFocusableElements(state.dialog)[0] || state.dialog;
}

function resolveRestoreFocus(state) {
    if (isHTMLElement(state.opener)
        && state.opener !== document.body
        && state.opener.isConnected
        && isVisibleFocusable(state.opener)) return state.opener;

    const fallback = typeof state.restoreFocusTarget === 'function'
        ? state.restoreFocusTarget()
        : state.restoreFocusTarget;
    if (isHTMLElement(fallback) && isVisibleFocusable(fallback)) return fallback;

    if (typeof state.restoreFocusSelector === 'string' && state.restoreFocusSelector) {
        return [...document.querySelectorAll(state.restoreFocusSelector)].find(isVisibleFocusable) || null;
    }
    return null;
}

function scheduleRestoreFocus(state, remainingFrames = 24, interactionAtClose = userInteractionEpoch) {
    window.requestAnimationFrame(() => {
        // Never override a reader who has already clicked or pressed a key
        // after closing. Without new input, keep the exact opener authoritative
        // through route reconciliation and the closing transition: either can
        // replace the launcher or move focus after the first animation frame.
        if (userInteractionEpoch !== interactionAtClose) return;
        const target = resolveRestoreFocus(state);
        const activeState = topState();
        // A nested child may return to its parent dialog. If an unrelated
        // overlay opened during cleanup, let that newer surface own focus.
        if (target?.isConnected
            && document.activeElement !== target
            && (!activeState || activeState.dialog.contains(target))) {
            target.focus({ preventScroll: true });
        }
        if (remainingFrames > 1) {
            scheduleRestoreFocus(state, remainingFrames - 1, interactionAtClose);
        }
    });
}

function scheduleInitialFocus(state, remainingFrames = 6) {
    window.requestAnimationFrame(() => {
        if (topState() !== state || state.closing) return;
        const target = resolveInitialFocus(state);
        target?.focus({ preventScroll: true });
        const settledOnRequestedControl = target !== state.dialog
            && state.dialog.contains(document.activeElement);
        if (!settledOnRequestedControl && remainingFrames > 1) {
            scheduleInitialFocus(state, remainingFrames - 1);
        }
    });
}

function handleKeydown(event) {
    const state = topState();
    if (!state) return;

    if (event.key === 'Escape') {
        if (state.dialog.querySelector('[data-overlay-escape-open="true"]')) return;
        if (state.closeOnEscape === false) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        state.close?.({ reason: 'escape' });
        return;
    }
    if (event.key !== 'Tab') return;

    const activeElement = document.activeElement;
    const focusable = visibleFocusableElements(state.dialog);
    if (!focusable.length) {
        event.preventDefault();
        state.dialog.focus({ preventScroll: true });
        return;
    }

    const first = focusable[0];
    const last = focusable.at(-1);
    if (!focusable.includes(activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus({ preventScroll: true });
    } else if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
    } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
    }
}

function syncGlobalListener() {
    if (overlayStack.length && !keydownListening) {
        document.addEventListener('keydown', handleKeydown, true);
        keydownListening = true;
    } else if (!overlayStack.length && keydownListening) {
        document.removeEventListener('keydown', handleKeydown, true);
        keydownListening = false;
    }
}

function syncRemovalObserver() {
    if (typeof MutationObserver === 'undefined' || !document.documentElement) return;
    if (overlayStack.length) {
        if (!removalObserver) {
            removalObserver = new MutationObserver(() => {
                if (pruneStack()) syncOverlayEnvironment();
                else syncBackgroundIsolation();
            });
        }
        removalObserver.observe(document.documentElement, { childList: true, subtree: true });
        return;
    }
    removalObserver?.disconnect();
}

function announceStackChange() {
    document.dispatchEvent(new CustomEvent('tezos:overlay-stack-change', {
        detail: {
            activeCount: overlayStack.length,
            topOverlay: overlayStack.at(-1)?.overlay || null
        }
    }));
}

function syncOverlayEnvironment() {
    pruneStack();
    syncBackgroundIsolation();
    syncScrollLock();
    syncGlobalListener();
    syncRemovalObserver();
    announceStackChange();
}

function reportCloseError(state, error) {
    document.dispatchEvent(new CustomEvent('tezos:overlay-close-error', {
        detail: { overlay: state.overlay, error }
    }));
}

/**
 * Register a visible overlay as the top modal dialog.
 */
export function activateOverlayDialog(overlay, {
    close,
    dialogSelector = '[role="dialog"]',
    titleId = '',
    label = '',
    initialFocus = null,
    initialFocusSelector = '',
    opener = null,
    restoreFocusTarget = null,
    restoreFocusSelector = '',
    lockScroll = true,
    closeOnEscape = true
} = {}) {
    if (!isHTMLElement(overlay) || typeof close !== 'function') return null;
    const dialog = typeof dialogSelector === 'string'
        ? overlay.querySelector(dialogSelector)
        : dialogSelector;
    if (!isHTMLElement(dialog)) return null;

    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('tabindex', '-1');
    if (titleId) {
        dialog.setAttribute('aria-labelledby', titleId);
        dialog.removeAttribute('aria-label');
    } else if (label) {
        dialog.setAttribute('aria-label', label);
        dialog.removeAttribute('aria-labelledby');
    }
    overlay.setAttribute('aria-hidden', 'false');

    let state = statesByOverlay.get(overlay);
    let shouldMoveFocus = false;
    if (state) {
        Object.assign(state, {
            close,
            dialog,
            initialFocus,
            initialFocusSelector,
            restoreFocusTarget,
            restoreFocusSelector,
            lockScroll: Boolean(lockScroll),
            closeOnEscape
        });
        const index = overlayStack.indexOf(state);
        if (index >= 0 && index !== overlayStack.length - 1) {
            overlayStack.splice(index, 1);
            overlayStack.push(state);
            shouldMoveFocus = true;
        }
    } else {
        state = {
            overlay,
            dialog,
            close,
            initialFocus,
            initialFocusSelector,
            opener: isHTMLElement(opener) ? opener : document.activeElement,
            restoreFocusTarget,
            restoreFocusSelector,
            lockScroll: Boolean(lockScroll),
            closeOnEscape,
            closing: false
        };
        statesByOverlay.set(overlay, state);
        overlayStack.push(state);
        shouldMoveFocus = true;
    }

    syncOverlayEnvironment();

    if (shouldMoveFocus) scheduleInitialFocus(state);
    return dialog;
}

/**
 * Remove an overlay from the stack and restore its opener once any nested
 * overlays have closed. Calling this for a parent also closes its descendants
 * so a child can never be left orphaned.
 */
export function deactivateOverlayDialog(overlay, {
    restoreFocus = true,
    closeChildren = true
} = {}) {
    const state = statesByOverlay.get(overlay);
    if (!state || state.closing) {
        if (overlay) overlay.setAttribute('aria-hidden', 'true');
        return false;
    }
    state.closing = true;

    const index = overlayStack.indexOf(state);
    if (closeChildren && index >= 0) {
        const children = overlayStack.slice(index + 1).reverse();
        for (const child of children) {
            if (child.closing) continue;
            try {
                child.close?.({ reason: 'parent-close' });
            } catch (error) {
                reportCloseError(child, error);
            } finally {
                // Feature callbacks normally deactivate themselves. Force a
                // synchronous fallback so a thrown or deferred callback can
                // never strand its parent behind inert/scroll locks.
                if (statesByOverlay.has(child.overlay)) {
                    deactivateOverlayDialog(child.overlay, {
                        restoreFocus: false,
                        closeChildren: true
                    });
                }
            }
        }
    }

    const currentIndex = overlayStack.indexOf(state);
    if (currentIndex >= 0) overlayStack.splice(currentIndex, 1);
    statesByOverlay.delete(overlay);
    overlay.setAttribute('aria-hidden', 'true');

    syncOverlayEnvironment();

    if (restoreFocus) scheduleRestoreFocus(state);
    return true;
}

export function isTopOverlay(overlay) {
    return topState()?.overlay === overlay;
}

export function activeOverlayCount() {
    if (pruneStack()) syncOverlayEnvironment();
    return overlayStack.length;
}

/** Reconcile global ownership after a legacy overlay restores its own styles. */
export function reconcileOverlayEnvironment() {
    syncOverlayEnvironment();
}
