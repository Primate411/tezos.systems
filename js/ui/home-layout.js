import { activateOverlayDialog, deactivateOverlayDialog } from './overlay-stack.js';
import { enqueueToast } from './toast-queue.js';

export const HOME_LAYOUT_STORAGE_KEY = 'tezos-systems-home-layout-v1';

export const HOME_BLOCKS = Object.freeze([
    Object.freeze({ id: 'ticker', label: 'Latest block ticker', selectors: ['#block-ticker-strip'] }),
    Object.freeze({ id: 'search', label: 'Search and command deck', selectors: ['#upgrade-clock'] }),
    Object.freeze({ id: 'live-pulse', label: 'Live Pulse', selectors: ['#governance-alert-strip', '#pulse-ticker-strip'] }),
    Object.freeze({ id: 'explore', label: 'Explore Tezos', selectors: ['#chambers-section'] }),
    Object.freeze({ id: 'moments', label: 'Network Moments', selectors: ['#moments-section'] }),
    Object.freeze({ id: 'handoff', label: 'Keep Exploring', selectors: ['#recruit-section'] }),
    Object.freeze({ id: 'credits', label: 'Credits and sources', selectors: ['#site-footer'] })
]);

const VALID_IDS = new Set(HOME_BLOCKS.map((block) => block.id));
const LEGACY_KEYS = Object.freeze([
    'tezos-systems-chambers-visible',
    'tezos-systems-collapsed-pulse-ticker',
    'tezos-systems-collapsed-chambers-section',
    'tezos-systems-collapsed-moments-section'
]);

let hiddenIds = new Set();
let initialized = false;
let previewDepth = 0;
let previewSource = '';

function normalizePreference(value) {
    if (!value || value.version !== 1 || !Array.isArray(value.hidden)) return null;
    if (value.hidden.some((id) => typeof id !== 'string' || !VALID_IDS.has(id))) return null;
    return HOME_BLOCKS.map((block) => block.id).filter((id) => value.hidden.includes(id));
}

function readPreference() {
    try {
        const raw = localStorage.getItem(HOME_LAYOUT_STORAGE_KEY);
        if (raw === null) return [];
        return normalizePreference(JSON.parse(raw)) || [];
    } catch (_) {
        return [];
    }
}

function persistPreference() {
    try {
        localStorage.setItem(HOME_LAYOUT_STORAGE_KEY, JSON.stringify({
            version: 1,
            hidden: HOME_BLOCKS.map((block) => block.id).filter((id) => hiddenIds.has(id))
        }));
    } catch (_) {}
}

function retireLegacyKeys() {
    try {
        LEGACY_KEYS.forEach((key) => localStorage.removeItem(key));
    } catch (_) {}
}

function syncRootState() {
    const ordered = HOME_BLOCKS.map((block) => block.id).filter((id) => hiddenIds.has(id));
    document.documentElement.setAttribute('data-home-hidden', ordered.join(' '));
}

function blockFor(id) {
    return HOME_BLOCKS.find((block) => block.id === id) || null;
}

function blockElements(block) {
    return block?.selectors.flatMap((selector) => [...document.querySelectorAll(selector)]) || [];
}

function isRendered(element) {
    if (!element?.isConnected) return false;
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
}

function firstRenderedElement(block) {
    return blockElements(block).find(isRendered) || blockElements(block)[0] || null;
}

function captureLayoutAnchor(id, nextHiddenIds = hiddenIds) {
    const index = HOME_BLOCKS.findIndex((block) => block.id === id);
    if (index < 0) return null;
    const candidates = HOME_BLOCKS.slice(index + 1)
        .filter((block) => !nextHiddenIds.has(block.id))
        .flatMap((block) => blockElements(block));
    if (id !== 'credits') candidates.push(document.getElementById('site-footer'));
    const element = candidates.find(isRendered);
    return element ? { element, top: element.getBoundingClientRect().top } : null;
}

function preserveLayoutAnchor(anchor) {
    if (!anchor?.element?.isConnected) return;
    requestAnimationFrame(() => {
        if (!anchor.element.isConnected) return;
        const delta = anchor.element.getBoundingClientRect().top - anchor.top;
        if (Math.abs(delta) > 0.5) window.scrollBy({ top: delta, left: 0, behavior: 'auto' });
    });
}

function dispatchChange(id, visible, source) {
    window.dispatchEvent(new CustomEvent('tezos:home-layout-change', {
        detail: { id, visible, source }
    }));
}

function syncControls() {
    HOME_BLOCKS.forEach((block) => {
        const visible = !hiddenIds.has(block.id);
        document.querySelectorAll(`[data-home-layout-toggle="${block.id}"]`).forEach((input) => {
            input.checked = visible;
        });
    });
    const shown = HOME_BLOCKS.length - hiddenIds.size;
    document.querySelectorAll('[data-home-layout-count]').forEach((badge) => {
        badge.textContent = `${shown} shown`;
        badge.setAttribute('aria-label', `${shown} of ${HOME_BLOCKS.length} home blocks shown`);
    });
    const showAll = document.getElementById('home-layout-show-all');
    if (showAll) showAll.disabled = hiddenIds.size === 0;
}

export function isHomeBlockVisible(id) {
    return VALID_IDS.has(id) && !hiddenIds.has(id);
}

export function setHomeBlockVisible(id, visible, source = 'api') {
    if (!VALID_IDS.has(id)) return false;
    const nextVisible = Boolean(visible);
    const wasVisible = !hiddenIds.has(id);
    if (wasVisible === nextVisible) return false;

    const nextHiddenIds = new Set(hiddenIds);
    if (nextVisible) nextHiddenIds.delete(id);
    else nextHiddenIds.add(id);
    const anchor = nextVisible ? null : captureLayoutAnchor(id, nextHiddenIds);

    hiddenIds = nextHiddenIds;
    syncRootState();
    persistPreference();
    syncControls();
    preserveLayoutAnchor(anchor);
    dispatchChange(id, nextVisible, source);
    return true;
}

export function showAllHomeBlocks(source = 'show-all') {
    if (!hiddenIds.size) return false;
    const changed = HOME_BLOCKS.filter((block) => hiddenIds.has(block.id));
    hiddenIds = new Set();
    syncRootState();
    persistPreference();
    syncControls();
    changed.forEach((block) => dispatchChange(block.id, true, source));
    return true;
}

function beginPreview(source = 'preview') {
    previewDepth += 1;
    previewSource = source;
    document.documentElement.setAttribute('data-home-layout-preview', 'all');
    window.dispatchEvent(new CustomEvent('tezos:home-layout-preview', { detail: { active: true, source } }));
}

function endPreview(source = previewSource || 'preview') {
    previewDepth = Math.max(0, previewDepth - 1);
    if (previewDepth) return;
    previewSource = '';
    document.documentElement.removeAttribute('data-home-layout-preview');
    window.dispatchEvent(new CustomEvent('tezos:home-layout-preview', { detail: { active: false, source } }));
}

function showUndoToast(block, keyboardTriggered) {
    enqueueToast({
        priority: 1,
        duration: 6500,
        show(done, duration) {
            const toast = document.createElement('div');
            toast.className = 'home-layout-toast';
            toast.setAttribute('role', 'status');
            toast.innerHTML = `<span>${block.label} hidden</span><span aria-hidden="true">·</span><button type="button">Undo</button>`;
            document.body.appendChild(toast);
            const undo = toast.querySelector('button');
            let timer = 0;
            const finish = ({ restoreFallback = false } = {}) => {
                if (!toast.isConnected) return;
                window.clearTimeout(timer);
                const ownedFocus = toast.contains(document.activeElement);
                toast.classList.add('is-leaving');
                window.setTimeout(() => {
                    toast.remove();
                    if (restoreFallback && ownedFocus) {
                        document.getElementById('customize-home-btn')?.focus({ preventScroll: true });
                    }
                    done();
                }, 160);
            };
            undo.addEventListener('click', () => {
                setHomeBlockVisible(block.id, true, 'undo');
                finish();
                requestAnimationFrame(() => {
                    document.querySelector(`[data-home-hide="${block.id}"]`)?.focus({ preventScroll: true });
                });
            });
            requestAnimationFrame(() => {
                toast.classList.add('is-visible');
                if (keyboardTriggered) undo.focus({ preventScroll: true });
            });
            timer = window.setTimeout(() => finish({ restoreFallback: keyboardTriggered }), duration);
        }
    });
}

function closeHomeLayout({ restoreFocus = true } = {}) {
    const overlay = document.getElementById('home-layout-modal');
    if (!overlay?.classList.contains('active')) return;
    overlay.classList.remove('active');
    deactivateOverlayDialog(overlay, { restoreFocus });
}

function openHomeLayout() {
    const overlay = document.getElementById('home-layout-modal');
    const opener = document.getElementById('customize-home-btn');
    if (!overlay || overlay.classList.contains('active')) return;
    document.getElementById('settings-dropdown')?.classList.remove('open');
    document.getElementById('settings-gear')?.setAttribute('aria-expanded', 'false');
    syncControls();
    overlay.classList.add('active');
    activateOverlayDialog(overlay, {
        close: () => closeHomeLayout(),
        titleId: 'home-layout-title',
        initialFocusSelector: '[data-home-layout-toggle]',
        opener,
        restoreFocusTarget: document.getElementById('settings-gear')
    });
}

function syncFromStorage(event) {
    if (event.key !== HOME_LAYOUT_STORAGE_KEY) return;
    let next = [];
    try {
        next = event.newValue === null ? [] : (normalizePreference(JSON.parse(event.newValue)) || []);
    } catch (_) {}
    const nextHiddenIds = new Set(next);
    const changed = HOME_BLOCKS.filter((block) => hiddenIds.has(block.id) !== nextHiddenIds.has(block.id));
    if (!changed.length) return;
    const firstHidden = changed.find((block) => !hiddenIds.has(block.id) && nextHiddenIds.has(block.id));
    const anchor = firstHidden ? captureLayoutAnchor(firstHidden.id, nextHiddenIds) : null;
    hiddenIds = nextHiddenIds;
    syncRootState();
    syncControls();
    preserveLayoutAnchor(anchor);
    changed.forEach((block) => dispatchChange(block.id, !hiddenIds.has(block.id), 'storage'));
}

export function initHomeLayout() {
    if (initialized) return;
    initialized = true;
    hiddenIds = new Set(readPreference());
    syncRootState();
    retireLegacyKeys();
    syncControls();

    document.getElementById('customize-home-btn')?.addEventListener('click', openHomeLayout);
    document.getElementById('home-layout-close')?.addEventListener('click', () => closeHomeLayout());
    document.getElementById('home-layout-show-all')?.addEventListener('click', () => showAllHomeBlocks());
    document.getElementById('home-layout-modal')?.addEventListener('click', (event) => {
        if (event.target === event.currentTarget) closeHomeLayout();
    });
    document.querySelectorAll('[data-home-layout-toggle]').forEach((input) => {
        input.addEventListener('change', () => setHomeBlockVisible(input.dataset.homeLayoutToggle, input.checked, 'panel'));
    });
    document.addEventListener('click', (event) => {
        const button = event.target.closest('[data-home-hide]');
        if (!button || !button.isConnected) return;
        const block = blockFor(button.dataset.homeHide);
        if (!block) return;
        const keyboardTriggered = event.detail === 0;
        if (setHomeBlockVisible(block.id, false, keyboardTriggered ? 'inline-keyboard' : 'inline-pointer')) {
            showUndoToast(block, keyboardTriggered);
        }
    });
    window.addEventListener('storage', syncFromStorage);

    window.tezosSystemsHomeLayout = Object.freeze({
        beginPreview,
        endPreview,
        initHomeLayout,
        isHomeBlockVisible,
        open: openHomeLayout,
        setHomeBlockVisible,
        showAllHomeBlocks
    });
}
