/** Recognition Hall boot pilot. No dashboard import or polling before intent. */
import { versionedAsset } from './asset-version.js';
import { initSiteWayfinder } from '../ui/wayfinder.js';
import { initSiteJourneyCapture } from './site-journey.js';
import { initShellLifecycle } from './shell-lifecycle.js';
import { findChamberLauncher } from '../ui/chamber-accessibility.js';

const bootScript = document.querySelector('script[data-dashboard-src]');
const dashboardSrc = bootScript.dataset.dashboardSrc;
const pilotEvents = new AbortController();
let dashboardPromise = null;
let dashboardModulePromise = null;
let dashboardModuleAttempt = 0;
let shellInstalled = false;
let transitionIntent = 0;
let transitioning = false;
let roomPromise = null;
let roomModule = null;
let roomAttempt = 0;
let roomOpenIntent = 0;

function openTezosCrpChamber() {
    const intent = ++roomOpenIntent;
    const requestedRoute = location.href;
    const isCurrent = () => intent === roomOpenIntent && !pilotEvents.signal.aborted && location.href === requestedRoute;
    if (!roomPromise) {
        const path = versionedAsset('/js/features/tezoscrp.js');
        roomPromise = import(roomAttempt ? `${path}&chamber-retry=${roomAttempt}` : path).then(module => {
            roomModule = module;
            return module;
        }).catch(error => { roomPromise = null; roomAttempt += 1; throw error; });
    }
    return roomPromise.then(module => isCurrent() ? module.openTezosCrpChamber({ isCurrent }) : undefined);
}

function dashboardDestination({ route = null, search = false, historyNavigation = false } = {}) {
    if (historyNavigation) return location.href;
    if (route) return route;
    const params = new URLSearchParams(location.search);
    for (const key of ['view', 'year', 'period', 'category', 'q']) params.delete(key);
    return `/${params.size ? `?${params}` : ''}${search ? '#search' : ''}`;
}

function transitionStatus(message, { failed = false, retryOptions = {} } = {}) {
    const room = document.querySelector('#tezoscrp-modal .tezoscrp-content') || document.getElementById('main-content');
    if (!room) return;
    let status = room.querySelector('[data-dashboard-transition]');
    if (!message) { status?.remove(); return; }
    if (!status) {
        status = document.createElement('div');
        status.dataset.dashboardTransition = '';
        status.setAttribute('role', 'status');
        // Out of flow: shell preparation must not shift the archive being read.
        status.style.cssText = 'position:fixed;inset:auto 16px 16px;max-width:640px;margin:auto;z-index:20;padding:12px;background:var(--bg-card,#111);color:var(--text-primary,#fff);border:1px solid var(--border-color,#555)';
        room.appendChild(status);
    }
    status.replaceChildren(document.createTextNode(message));
    if (failed) {
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.textContent = 'Retry';
        retry.className = 'glass-button';
        retry.addEventListener('click', () => requestDashboard(retryOptions));
        const fallback = document.createElement('a');
        fallback.href = dashboardDestination(retryOptions);
        fallback.textContent = 'Open dashboard in a new page';
        fallback.dataset.dashboardFallback = '';
        status.append(' ', retry, ' · ', fallback);
    }
}

function loadScript(source) {
    const url = new URL(source.src, location.origin).href;
    if ([...document.scripts].some(script => script.src === url)) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        for (const attr of source.attributes) script.setAttribute(attr.name, attr.value);
        script.src = url;
        script.async = false;
        script.addEventListener('load', resolve, { once: true });
        script.addEventListener('error', () => {
            script.remove();
            reject(new Error(`Dashboard dependency unavailable: ${new URL(url).pathname}`));
        }, { once: true });
        document.body.appendChild(script);
    });
}

function loadDashboardModule() {
    if (!dashboardModulePromise) {
        const source = new URL(dashboardSrc, location.origin);
        if (dashboardModuleAttempt) source.searchParams.set('chamber-retry', String(dashboardModuleAttempt));
        dashboardModulePromise = import(source.href).catch(error => {
            dashboardModulePromise = null;
            dashboardModuleAttempt += 1;
            throw error;
        });
    }
    return dashboardModulePromise;
}

async function prepareDashboard() {
    const response = await fetch('/index.html', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Dashboard shell HTTP ${response.status}`);
    const parsed = new DOMParser().parseFromString(await response.text(), 'text/html');
    const app = [...parsed.scripts].find(script => /\/app\.js(?:\?|$)/.test(new URL(script.getAttribute('src') || '/', location.origin).pathname));
    if (!app || new URL(app.getAttribute('src'), location.origin).href !== new URL(dashboardSrc, location.origin).href) {
        throw new Error('A newer build is available. Open the dashboard in a new page to use it safely.');
    }
    if (!parsed.querySelector('#hero-slot') || !parsed.querySelector('#chambers-grid')) throw new Error('Dashboard shell is incomplete');
    // Root-relative semantics must survive installation on a pretty route.
    for (const node of parsed.querySelectorAll('[src], [href]')) {
        for (const attr of ['src', 'href']) {
            const value = node.getAttribute(attr);
            if (value && !/^(?:https?:|\/|#|mailto:|data:)/.test(value)) node.setAttribute(attr, `/${value}`);
        }
    }

    // Complete style and library preparation before changing the document body.
    for (const link of parsed.querySelectorAll('head link[rel="stylesheet"]')) {
        const href = new URL(link.getAttribute('href'), location.origin).href;
        if ([...document.querySelectorAll('link[rel="stylesheet"]')].some(sheet => sheet.href === href)) continue;
        await new Promise((resolve, reject) => {
            const node = document.importNode(link, true);
            node.href = href;
            node.onload = resolve;
            node.onerror = () => { node.remove(); reject(new Error('Dashboard styles unavailable')); };
            document.head.appendChild(node);
        });
    }
    const scripts = [...parsed.querySelectorAll('script[src]')];
    for (const source of scripts.filter(script => new URL(script.getAttribute('src'), location.origin).origin !== location.origin)) {
        // Analytics has already run from the route head; chart libraries are
        // dependencies of the dashboard, not of the Recognition Hall.
        if (source.hasAttribute('data-goatcounter')) continue;
        const copy = source.cloneNode(true);
        copy.src = new URL(source.getAttribute('src'), location.origin).href;
        await loadScript(copy);
    }

    if (!shellInstalled) {
        parsed.querySelectorAll('script').forEach(script => script.remove());
        const fragment = document.createDocumentFragment();
        for (const child of [...parsed.body.childNodes]) fragment.appendChild(document.importNode(child, true));
        document.getElementById('standalone-chamber-shell').replaceWith(fragment);
        document.documentElement.removeAttribute('data-chamber-route');
        document.documentElement.dataset.dashboardBoot = 'manual';
        document.title = parsed.title;
        for (const selector of ['link[rel="canonical"]', 'meta[name="description"]', 'meta[property^="og:"]', 'meta[name^="twitter:"]']) {
            for (const source of parsed.querySelectorAll(selector)) {
                const key = source.getAttribute('property') || source.getAttribute('name');
                const current = key ? document.querySelector(`meta[property="${key}"], meta[name="${key}"]`) : document.querySelector(selector);
                current?.replaceWith(document.importNode(source, true));
            }
        }
        shellInstalled = true;
    }

    const homePreload = scripts.find(source => /\/home-layout-preload\.js/.test(source.getAttribute('src')));
    if (homePreload) await loadScript(homePreload);
    const dashboard = await loadDashboardModule();
    for (const source of scripts.filter(script => new URL(script.getAttribute('src'), location.origin).origin === location.origin)) {
        const path = new URL(source.getAttribute('src'), location.origin).pathname;
        if (/\/(?:app|theme-preload|goatcounter-init)\.js$/.test(path)) continue;
        const copy = source.cloneNode(true);
        copy.src = new URL(source.getAttribute('src'), location.origin).href;
        await loadScript(copy);
    }
    await dashboard.startDashboard({ applyInitialRoute: false, initialChamber: roomModule ? 'tezoscrp' : '', preloadedChamber: roomModule });
    return dashboard;
}

function ensureDashboard() {
    if (!dashboardPromise) dashboardPromise = prepareDashboard().catch(error => {
        dashboardPromise = null;
        throw error;
    });
    return dashboardPromise;
}

async function requestDashboard({ route = null, search = false, historyNavigation = false } = {}) {
    const intent = ++transitionIntent;
    roomOpenIntent += 1;
    transitioning = true;
    transitionStatus('Preparing the dashboard…');
    try {
        await ensureDashboard();
        if (intent !== transitionIntent) return;
        pilotEvents.abort();
        transitionStatus('');
        document.documentElement.removeAttribute('data-chamber-boot');
        if (!historyNavigation) history.pushState({ ...(history.state || {}), tezosSystemsRoute: 'home' }, '', dashboardDestination({ route, search }));
        roomModule?.closeTezosCrpChamber();
        window.dispatchEvent(new CustomEvent('tezos:routechange'));
        if (!route && !search && !historyNavigation) {
            findChamberLauncher('#tezoscrp-entry-card')?.focus({ preventScroll: true });
        }
    } catch (error) {
        if (intent !== transitionIntent) return;
        console.warn('Dashboard transition unavailable:', error);
        transitionStatus(`${error.message}. The archive remains available.`, { failed: true, retryOptions: { route, search, historyNavigation } });
    } finally {
        if (intent === transitionIntent) transitioning = false;
    }
}

document.addEventListener('tezos:chamber-before-close', event => {
    if (event.detail?.overlay?.id !== 'tezoscrp-modal') return;
    event.preventDefault();
    if (!transitioning) requestDashboard();
}, { signal: pilotEvents.signal });

document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !document.querySelector('#tezoscrp-modal.active')) {
        event.preventDefault();
        requestDashboard();
        return;
    }
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    if (event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    event.preventDefault();
    requestDashboard({ search: true });
}, { signal: pilotEvents.signal });

document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const link = event.target.closest('a[href]');
    if (!link || link.target || link.hasAttribute('download') || link.hasAttribute('data-dashboard-fallback')) return;
    const url = new URL(link.href);
    if (url.origin !== location.origin || !['/', '/my/'].includes(url.pathname)) return;
    event.preventDefault();
    requestDashboard({ route: `${url.pathname}${url.search}${url.hash}` });
}, { signal: pilotEvents.signal });

const routeChanged = () => {
    if (location.pathname.replace(/\/index\.html$/, '/') === '/tezoscrp/' && (!location.hash || location.hash.startsWith('#theme='))) {
        transitionIntent += 1;
        transitioning = false;
        transitionStatus('');
        openTezosCrpChamber().catch(showBootError);
    } else requestDashboard({ historyNavigation: true });
};
window.addEventListener('popstate', routeChanged, { signal: pilotEvents.signal });
window.addEventListener('hashchange', routeChanged, { signal: pilotEvents.signal });
window.addEventListener('tezos:routechange', routeChanged, { signal: pilotEvents.signal });

function showBootError(error) {
    console.warn('Recognition Hall startup unavailable:', error);
    const status = document.getElementById('standalone-chamber-status');
    if (status) status.textContent = 'The recognition archive could not open. Retry or return to the dashboard.';
    document.getElementById('standalone-chamber-retry')?.removeAttribute('hidden');
}

initSiteWayfinder();
initSiteJourneyCapture();
initShellLifecycle();
document.getElementById('standalone-chamber-retry')?.addEventListener('click', event => {
    event.currentTarget.hidden = true;
    openTezosCrpChamber().catch(showBootError);
});
if (location.hash && !location.hash.startsWith('#theme=')) requestDashboard({ historyNavigation: true });
else openTezosCrpChamber().catch(showBootError);
