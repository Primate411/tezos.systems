/** Independent Chamber boot. No dashboard import or polling before intent. */
import './tzkt-throttle.js';
import { versionedAsset } from './asset-version.js';
import { CHAMBER_FEATURES } from './chamber-features.mjs';
import { initSiteWayfinder } from '../ui/wayfinder.js';
import { initSiteJourneyCapture } from './site-journey.js';
import { initShellLifecycle } from './shell-lifecycle.js';
import { findChamberLauncher } from '../ui/chamber-accessibility.js';
import { activeOverlayCount } from '../ui/overlay-stack.js';
import { initChamberThemeEffects } from '../ui/chamber-theme-effects.js';

const bootScript = document.querySelector('script[data-dashboard-src]');
const dashboardSrc = bootScript.dataset.dashboardSrc;
const entryId = document.documentElement.dataset.chamberBoot;
const chamber = CHAMBER_FEATURES[entryId];
const room = chamber.standalone;
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

function isRoomRoute() {
    const path = location.pathname.replace(/\/index\.html$/, '/').replace(/\/+$/, '');
    return (path === `/${room.route}` || room.aliases?.some(alias => path === `/${alias}`)
        || (room.children && path.startsWith(`/${room.route}/`)))
        && (!location.hash || location.hash.startsWith('#theme='));
}

function openStandaloneChamber() {
    const intent = ++roomOpenIntent;
    const requestedRoute = location.href;
    const isCurrent = () => intent === roomOpenIntent && !pilotEvents.signal.aborted && isRoomRoute();
    if (!roomPromise) {
        const path = versionedAsset(new URL(chamber.modulePath, import.meta.url).pathname);
        roomPromise = import(roomAttempt ? `${path}&chamber-retry=${roomAttempt}` : path).then(module => {
            roomModule = module;
            return module;
        }).catch(error => { roomPromise = null; roomAttempt += 1; throw error; });
    }
    return roomPromise.then(async module => {
        if (!isCurrent() || location.href !== requestedRoute) return;
        if (room.controller) (await loadDashboardModule()).seedChamberFeature(entryId, module);
        if (!isCurrent()) return;
        await (room.positional ? module[chamber.open]('', { isCurrent }) : module[chamber.open]({ isCurrent }));
        if (isCurrent()) document.documentElement.dataset.chamberReady = entryId;
    });
}

function dashboardDestination({ route = null, search = false, historyNavigation = false } = {}) {
    if (historyNavigation) return location.href;
    if (route) return route;
    const params = new URLSearchParams(location.search);
    for (const key of room.queryKeys) params.delete(key);
    return `/${params.size ? `?${params}` : ''}${search ? '#search' : ''}`;
}

function transitionStatus(message, { failed = false, retryOptions = {} } = {}) {
    const overlay = document.getElementById(room.overlayId);
    const surface = (room.dialogSelector === ':scope' ? overlay : overlay?.querySelector(room.dialogSelector)) || document.getElementById('main-content');
    if (!surface) return;
    let status = surface.querySelector('[data-dashboard-transition]');
    if (!message) { status?.remove(); return; }
    if (!status) {
        status = document.createElement('div');
        status.dataset.dashboardTransition = '';
        status.setAttribute('role', 'status');
        // Out of flow: shell preparation must not shift the archive being read.
        status.style.cssText = 'position:fixed;inset:auto 16px 16px;max-width:640px;margin:auto;z-index:20;padding:12px;background:var(--bg-card,#111);color:var(--text-primary,#fff);border:1px solid var(--border-color,#555)';
        surface.appendChild(status);
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
        // dependencies of the dashboard, not of these independent rooms.
        if (source.hasAttribute('data-goatcounter')) continue;
        const copy = source.cloneNode(true);
        copy.src = new URL(source.getAttribute('src'), location.origin).href;
        await loadScript(copy);
    }

    // Import failures are recoverable before any retained live nodes move.
    const dashboard = await loadDashboardModule();
    if (roomModule) dashboard.seedChamberFeature(entryId, roomModule);
    await dashboard.prepareDashboardDependencies();
    if (!shellInstalled) {
        parsed.querySelectorAll('script').forEach(script => script.remove());
        for (const stat of room.fragmentStats || []) parsed.querySelector(`[data-stat="${stat}"]`)?.remove();
        // Static, already-wired History/My Tezos surfaces remain the exact nodes.
        // Keep them in the live document while dependencies prepare.
        const retained = (room.fragments || []).map(id => {
            const current = document.getElementById(id);
            const replacement = parsed.getElementById(id);
            if (!current || !replacement) return null;
            const marker = parsed.createElement('span');
            marker.dataset.standaloneRetained = id;
            replacement.replaceWith(marker);
            return current;
        }).filter(Boolean);
        const fragment = document.createDocumentFragment();
        for (const child of [...parsed.body.childNodes]) fragment.appendChild(document.importNode(child, true));
        for (const current of retained) {
            if (document.getElementById('standalone-chamber-shell').contains(current)) document.body.appendChild(current);
        }
        document.getElementById('standalone-chamber-shell').replaceWith(fragment);
        for (const current of retained) {
            const marker = document.querySelector(`[data-standalone-retained="${current.id}"]`);
            marker?.replaceWith(current);
        }
        document.querySelectorAll('[data-standalone-control]').forEach(node => node.remove());
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
    for (const source of scripts.filter(script => new URL(script.getAttribute('src'), location.origin).origin === location.origin)) {
        const path = new URL(source.getAttribute('src'), location.origin).pathname;
        if (/\/(?:app|theme-preload|goatcounter-init)\.js$/.test(path)) continue;
        const copy = source.cloneNode(true);
        copy.src = new URL(source.getAttribute('src'), location.origin).href;
        await loadScript(copy);
    }
    await dashboard.startDashboard({ applyInitialRoute: false, initialChamber: roomModule ? entryId : '', preloadedChamber: roomModule });
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
        roomModule?.[chamber.close](...(chamber.closeArgs || []));
        window.dispatchEvent(new CustomEvent('tezos:routechange'));
        if (!route && !search && !historyNavigation) {
            (findChamberLauncher(room.launcher) || document.querySelector(room.launcher))?.focus({ preventScroll: true });
        }
    } catch (error) {
        if (intent !== transitionIntent) return;
        console.warn('Dashboard transition unavailable:', error);
        transitionStatus(`${error.message}. Your Chamber remains available.`, { failed: true, retryOptions: { route, search, historyNavigation } });
    } finally {
        if (intent === transitionIntent) transitioning = false;
    }
}

document.addEventListener('tezos:chamber-before-close', event => {
    if (event.detail?.overlay?.id !== room.overlayId) return;
    event.preventDefault();
    if (!transitioning) requestDashboard();
}, { signal: pilotEvents.signal });

document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !event.defaultPrevented && activeOverlayCount() === 0 && (room.controller === 'chambers' || !document.getElementById(room.overlayId)?.matches('.active, .open'))) {
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
    if (event.target.closest('[data-copy-hash]')) {
        event.preventDefault();
        navigator.clipboard?.writeText(`https://tezos.systems${location.pathname}${location.search}${location.hash}`).catch(() => {});
        return;
    }
    const link = event.target.closest('a[href]');
    if (!link || link.target || link.hasAttribute('download') || link.hasAttribute('data-dashboard-fallback')) return;
    const url = new URL(link.href);
    if (url.origin !== location.origin || !['/', '/my/'].includes(url.pathname)) return;
    event.preventDefault();
    requestDashboard({ route: `${url.pathname}${url.search}${url.hash}` });
}, { signal: pilotEvents.signal });

const routeChanged = () => {
    if (isRoomRoute()) {
        transitionIntent += 1;
        transitioning = false;
        transitionStatus('');
        openStandaloneChamber().catch(showBootError);
    } else requestDashboard({ historyNavigation: true });
};
window.addEventListener('popstate', routeChanged, { signal: pilotEvents.signal });
window.addEventListener('hashchange', routeChanged, { signal: pilotEvents.signal });
window.addEventListener('tezos:routechange', routeChanged, { signal: pilotEvents.signal });

function showBootError(error) {
    console.warn('Chamber startup unavailable:', error);
    const status = document.getElementById('standalone-chamber-status');
    if (status) status.textContent = 'This Chamber could not open. Retry or return to the dashboard.';
    document.getElementById('standalone-chamber-retry')?.removeAttribute('hidden');
}

initSiteWayfinder();
initSiteJourneyCapture();
initShellLifecycle();
initChamberThemeEffects();
document.getElementById('standalone-chamber-retry')?.addEventListener('click', event => {
    event.currentTarget.hidden = true;
    openStandaloneChamber().catch(showBootError);
});
if (location.hash && !location.hash.startsWith('#theme=')) requestDashboard({ historyNavigation: true });
else openStandaloneChamber().catch(showBootError);
