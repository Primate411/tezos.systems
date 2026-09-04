const VIEW_SESSION_KEY = 'tezos-systems-my-tezos-view';
export const MY_TEZOS_VIEWS = Object.freeze(['overview', 'baker-signal', 'portfolio', 'transactions', 'collection', 'story', 'tezos-x']);

const activators = new Map();
const viewScrollPositions = new Map();
let initialized = false;

function routeCanOwnView() {
    return typeof window !== 'undefined' && window.location.pathname.replace(/\/+$/, '') === '/my';
}

function normalizeView(view) {
    return MY_TEZOS_VIEWS.includes(view) ? view : 'overview';
}

function revealSelectedTab(button) {
    const tablist = button?.closest('[role="tablist"]');
    if (!tablist) return;
    requestAnimationFrame(() => {
        const listRect = tablist.getBoundingClientRect();
        const tabRect = button.getBoundingClientRect();
        if (tabRect.left < listRect.left) {
            tablist.scrollLeft += tabRect.left - listRect.left;
        } else if (tabRect.right > listRect.right) {
            tablist.scrollLeft += tabRect.right - listRect.right;
        }
    });
}

function syncRoute(view, mode = 'replace') {
    if (!routeCanOwnView()) return;
    const url = new URL(window.location.href);
    if (view === 'overview') url.searchParams.delete('view');
    else url.searchParams.set('view', view);
    const next = `${url.pathname}${url.search}${url.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (next === current) return;
    if (mode === 'push') history.pushState(history.state, '', next);
    else history.replaceState(history.state, '', next);
}

export function registerMyTezosView(view, activate) {
    const normalized = normalizeView(view);
    if (typeof activate === 'function') activators.set(normalized, activate);
}

export function setMyTezosView(view, {
    focus = false,
    syncRoute: shouldSyncRoute = true,
    routeMode = 'replace'
} = {}) {
    const selected = normalizeView(view);
    const body = document.getElementById('drawer-body');
    const previous = document.querySelector('[data-my-tezos-view][aria-selected="true"]')?.dataset.myTezosView;
    const viewChanged = previous !== selected;
    if (body && previous && viewChanged) viewScrollPositions.set(previous, body.scrollTop);
    let selectedButton = null;
    document.querySelectorAll('[data-my-tezos-view]').forEach((button) => {
        const active = button.dataset.myTezosView === selected;
        button.classList.toggle('active', active);
        button.setAttribute('aria-selected', String(active));
        button.tabIndex = active ? 0 : -1;
        if (active) {
            selectedButton = button;
            if (focus) button.focus({ preventScroll: true });
        }
    });
    revealSelectedTab(selectedButton);
    document.querySelectorAll('[data-my-tezos-panel]').forEach((panel) => {
        const active = panel.dataset.myTezosPanel === selected;
        panel.classList.toggle('active', active);
        panel.hidden = !active;
    });
    try { sessionStorage.setItem(VIEW_SESSION_KEY, selected); } catch {}
    if (shouldSyncRoute) syncRoute(selected, routeMode);
    Promise.resolve(activators.get(selected)?.()).catch((error) => {
        console.warn(`[my-tezos] ${selected} activation failed:`, error);
    });
    window.dispatchEvent(new CustomEvent('my-tezos-view-changed', { detail: { view: selected } }));
    // Restore synchronously after the journey footer moves. A deferred restore
    // could overwrite a scroll the reader makes immediately after choosing a tab.
    if (body && viewChanged) body.scrollTop = viewScrollPositions.get(selected) || 0;
    return selected;
}

export function initMyTezosTabs() {
    if (initialized) return;
    initialized = true;
    const tabs = Array.from(document.querySelectorAll('[data-my-tezos-view]'));
    if (!tabs.length) return;
    tabs.forEach((button, index) => {
        button.addEventListener('click', () => setMyTezosView(button.dataset.myTezosView, { routeMode: 'push' }));
        button.addEventListener('keydown', (event) => {
            let nextIndex = null;
            if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
            if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
            if (event.key === 'Home') nextIndex = 0;
            if (event.key === 'End') nextIndex = tabs.length - 1;
            if (nextIndex == null) return;
            event.preventDefault();
            setMyTezosView(tabs[nextIndex].dataset.myTezosView, { focus: true, routeMode: 'push' });
        });
    });
    window.addEventListener('my-tezos-view-request', (event) => {
        setMyTezosView(event.detail?.view || 'overview');
    });
    window.addEventListener('my-tezos-drawer-opened', () => {
        const selected = document.querySelector('[data-my-tezos-view][aria-selected="true"]')?.dataset.myTezosView || 'overview';
        Promise.resolve(activators.get(selected)?.()).catch(() => {});
    });
    window.addEventListener('popstate', () => {
        if (!routeCanOwnView()) return;
        const routeView = new URLSearchParams(window.location.search).get('view');
        setMyTezosView(routeView || 'overview', { syncRoute: false });
    });

    let initial = 'overview';
    const routeView = routeCanOwnView() ? new URLSearchParams(window.location.search).get('view') : '';
    if (MY_TEZOS_VIEWS.includes(routeView)) {
        initial = routeView;
    } else {
        try { initial = normalizeView(sessionStorage.getItem(VIEW_SESSION_KEY) || 'overview'); } catch {}
    }
    setMyTezosView(initial, { syncRoute: false });
}

export function resetMyTezosTabsForTests() {
    initialized = false;
    activators.clear();
    viewScrollPositions.clear();
}
