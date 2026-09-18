import { setTextPending } from '../ui/text-loading.js';
import { debugLog } from './utils.js';

const GITHUB_MAIN_COMMIT_URL = 'https://api.github.com/repos/Primate411/tezos.systems/commits/main';

async function fetchBuildMetadata({ signal } = {}) {
    try {
        const response = await fetch('/version.json', { cache: 'no-store', signal });
        return response.ok ? await response.json() : null;
    } catch (_) {
        return null;
    }
}

function releaseUpdateMetadata(version) {
    const latestChange = typeof version?.latestChange === 'string'
        ? version.latestChange.replace(/\s+/g, ' ').trim().slice(0, 280)
        : '';
    const metaParts = [];
    if (Number.isInteger(version?.build)) metaParts.push(`Build ${version.build}`);
    if (/^\d{4}-\d{2}-\d{2}$/.test(version?.date || '')) metaParts.push(version.date);
    return {
        detail: latestChange
            ? `Latest: ${latestChange}`
            : 'Latest: Tezos Systems fixes and features.',
        meta: metaParts.join(' · ') || 'Build ready'
    };
}

async function fetchReleaseUpdateMetadata() {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 1500);
    try {
        return releaseUpdateMetadata(await fetchBuildMetadata({ signal: controller.signal }));
    } finally {
        window.clearTimeout(timeout);
    }
}

async function fetchLatestMainCommit() {
    try {
        const response = await fetch(GITHUB_MAIN_COMMIT_URL, {
            cache: 'no-store',
            headers: { 'Accept': 'application/vnd.github+json' }
        });
        if (!response.ok) return null;
        const data = await response.json();
        return {
            sha: data?.sha || '',
            date: data?.commit?.committer?.date || '',
            url: data?.html_url || ''
        };
    } catch (_) {
        return null;
    }
}

function shortSha(sha) {
    return sha ? sha.slice(0, 7) : '';
}

// Footer sanity check. `version.json` is served metadata; GitHub gives the exact
// latest main commit because a committed file cannot contain its own final SHA.
async function renderBuildVersion() {
    const el = document.getElementById('build-version');
    if (!el) return;
    el.textContent = 'Reading build metadata…';
    setTextPending(el, true);

    const [version, latest] = await Promise.all([
        fetchBuildMetadata(),
        fetchLatestMainCommit()
    ]);

    const parts = [];
    if (version?.build) parts.push(`build ${version.build}`);
    parts.push(latest?.sha ? `latest ${shortSha(latest.sha)}` : 'latest unavailable');
    if (version?.commit) parts.push(`stamp ${version.commit}`);
    if (version?.date) parts.push(version.date);

    if (!parts.length) return;

    setTextPending(el, false);
    el.textContent = parts.join(' · ');
    const titleParts = [];
    if (latest?.sha) titleParts.push(`Latest main commit: ${latest.sha}`);
    else titleParts.push('Latest main commit unavailable');
    if (version?.commit) titleParts.push(`Stamped parent commit: ${version.commit}`);
    if (latest?.date) titleParts.push(`Latest commit date: ${new Date(latest.date).toISOString().slice(0, 10)}`);
    el.title = titleParts.join(' · ');
}

const SERVICE_WORKER_UPDATE_CHECK_MS = 60 * 60 * 1000;
const SERVICE_WORKER_UPDATE_DEFER_MS = 30 * 60 * 1000;
const SERVICE_WORKER_ACTIVATION_TIMEOUT_MS = 30000;
const SERVICE_WORKER_UPDATE_DEFER_KEY = 'tezos-systems-release-update-deferred-until-v1';
let releaseUpdateUiPromise = null;

function readReleaseUpdateDeferredUntil() {
    try {
        const value = Number(sessionStorage.getItem(SERVICE_WORKER_UPDATE_DEFER_KEY));
        if (Number.isFinite(value) && value > Date.now()) return value;
        sessionStorage.removeItem(SERVICE_WORKER_UPDATE_DEFER_KEY);
    } catch (_) {
        // Storage can be unavailable in privacy-restricted contexts.
    }
    return 0;
}

function writeReleaseUpdateDeferredUntil(value) {
    try {
        sessionStorage.setItem(SERVICE_WORKER_UPDATE_DEFER_KEY, String(value));
    } catch (_) {
        // The in-memory deadline still applies for this document.
    }
}

function loadReleaseUpdateUi() {
    if (!releaseUpdateUiPromise) releaseUpdateUiPromise = import('../ui/release-update.js').catch(error => {
        releaseUpdateUiPromise = null;
        throw error;
    });
    return releaseUpdateUiPromise;
}

function renderedAssetVersion() {
    // Read the version from this document, not fresh network metadata which can
    // describe a newer deployment than the page the reader is actually using.
    const entry = document.querySelector('script[data-dashboard-src], script[type="module"][src*="js/core/app.js?"]');
    const src = entry?.dataset.dashboardSrc || entry?.getAttribute('src');
    return src ? new URL(src, window.location.href).searchParams.get('v') : null;
}

function workerAssetVersion(worker) {
    return new Promise(resolve => {
        const channel = new MessageChannel();
        const finish = version => {
            window.clearTimeout(timeout);
            channel.port1.close();
            channel.port2.close();
            resolve(version);
        };
        const timeout = window.setTimeout(() => finish(null), 1500);
        channel.port1.onmessage = event => finish(
            event.data?.type === 'RELEASE_VERSION' ? String(event.data.version) : null
        );
        try {
            worker.postMessage({ type: 'GET_RELEASE_VERSION' }, [channel.port2]);
        } catch (_) {
            finish(null);
        }
    });
}

function waitForWorker(worker, settledStates) {
    return new Promise((resolve, reject) => {
        const finish = error => {
            window.clearTimeout(timeout);
            worker.removeEventListener('statechange', check);
            if (error) reject(error);
            else resolve();
        };
        const check = () => {
            if (settledStates.includes(worker.state)) finish();
        };
        const timeout = window.setTimeout(() => finish(new Error('Update activation timed out')), SERVICE_WORKER_ACTIVATION_TIMEOUT_MS);
        worker.addEventListener('statechange', check);
        check();
    });
}

function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    let reloadRequested = false;
    let reloading = false;
    let observedController = navigator.serviceWorker.controller;
    let deferredUntil = readReleaseUpdateDeferredUntil();
    let deferredTimer = 0;
    const documentVersion = renderedAssetVersion();
    let promptWorker = null;
    let promptGeneration = 0;
    let appliedElsewhere = false;

    const clearDeferredTimer = () => {
        window.clearTimeout(deferredTimer);
        deferredTimer = 0;
    };

    const reloadThisTab = () => {
        if (reloading) return;
        reloading = true;
        reloadRequested = true;
        promptGeneration += 1;
        clearDeferredTimer();
        writeReleaseUpdateDeferredUntil(0);
        window.location.reload();
    };

    const showPrompt = async (worker, { reg, reloadOnly = false } = {}) => {
        if (!worker || reloadRequested || reloading || document.visibilityState !== 'visible') return;
        const resurface = () => showPrompt(worker, { reg, reloadOnly });
        if (deferredUntil > Date.now()) {
            clearDeferredTimer();
            deferredTimer = window.setTimeout(resurface, deferredUntil - Date.now());
            return;
        }
        // Reserve this worker before loading metadata: registration, visibility,
        // and updatefound can all report the same update concurrently.
        if (promptWorker === worker) return;
        promptWorker = worker;
        const generation = ++promptGeneration;
        let ui, release, workerVersion;
        try {
            [ui, release, workerVersion] = await Promise.all([
                loadReleaseUpdateUi(),
                fetchReleaseUpdateMetadata(),
                workerAssetVersion(worker)
            ]);
        } catch (_) {
            if (generation === promptGeneration) promptWorker = null;
            return;
        }
        if (generation !== promptGeneration || reloadRequested || reloading) return;
        if (document.visibilityState !== 'visible'
            || (reloadOnly ? navigator.serviceWorker.controller !== worker : reg.waiting !== worker)) {
            promptWorker = null;
            return;
        }
        if (documentVersion && workerVersion === documentVersion) {
            // Network-first navigation can already have loaded this build while
            // an older worker still controls the tab. It needs no further reload.
            ui.hideReleaseUpdateDock();
            return;
        }

        const deferPrompt = () => {
            deferredUntil = Date.now() + SERVICE_WORKER_UPDATE_DEFER_MS;
            writeReleaseUpdateDeferredUntil(deferredUntil);
            promptGeneration += 1;
            promptWorker = null;
            ui.hideReleaseUpdateDock();
            clearDeferredTimer();
            deferredTimer = window.setTimeout(resurface, SERVICE_WORKER_UPDATE_DEFER_MS);
        };

        const activateUpdate = async () => {
            reloadRequested = true;
            promptGeneration += 1;
            clearDeferredTimer();
            try {
                // One click accepts the newest available update, including one
                // already installing behind an older waiting worker.
                await reg.update().catch(() => {});
                for (let attempt = 0; attempt < 4; attempt += 1) {
                    if (reg.installing) {
                        await waitForWorker(reg.installing, ['installed', 'activated', 'redundant']);
                    }
                    const waiting = reg.waiting;
                    if (waiting) {
                        waiting.postMessage({ type: 'SKIP_WAITING' });
                        await waitForWorker(waiting, ['activated', 'redundant']);
                        if (waiting.state === 'redundant') continue;
                    } else if (reg.active?.state === 'activating') {
                        await waitForWorker(reg.active, ['activated', 'redundant']);
                    }
                    if (reg.installing || reg.waiting) continue;
                    if (!reg.active || reg.active.state !== 'activated') throw new Error('Update not active');
                    reloadThisTab();
                    return;
                }
                throw new Error('Update changed during activation');
            } catch (_) {
                reloadRequested = false;
                ui.setReleaseUpdateDockState({
                    state: 'error',
                    title: 'Update could not finish',
                    detail: 'The update is still waiting to activate. Please try again.',
                    actionLabel: 'Try update again',
                    pendingLabel: 'Updating…'
                });
            }
        };

        ui.showReleaseUpdateDock({
            state: reloadOnly ? 'reload' : 'ready',
            title: reloadOnly ? 'Update applied in another tab' : 'Update ready',
            detail: release.detail,
            meta: release.meta,
            actionLabel: 'Update & reload',
            pendingLabel: 'Updating…',
            expanded: false,
            onAction: activateUpdate,
            onLater: deferPrompt
        });
    };

    navigator.serviceWorker.addEventListener('controllerchange', () => {
        const controller = navigator.serviceWorker.controller;
        if (!controller || controller === observedController) return;
        const wasControlled = Boolean(observedController);
        observedController = controller;
        promptGeneration += 1;
        promptWorker = null;
        // The accepted action owns activation AND the final reload. A worker
        // change midway through that action must never start a second step.
        if (reloadRequested) return;
        // A first installation does not update this document's existing build.
        if (!wasControlled) return;
        appliedElsewhere = true;
        navigator.serviceWorker.getRegistration().then(reg => {
            if (reg) showPrompt(controller, { reg, reloadOnly: true });
        });
    });

    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then((reg) => {
        debugLog('📦 Service Worker registered, scope:', reg.scope);
        const showAvailablePrompt = () => {
            if (reg.waiting && navigator.serviceWorker.controller) showPrompt(reg.waiting, { reg });
            else if (appliedElsewhere) showPrompt(navigator.serviceWorker.controller, { reg, reloadOnly: true });
        };
        reg.addEventListener('updatefound', () => {
            const worker = reg.installing;
            worker?.addEventListener('statechange', () => {
                if (worker.state === 'installed') showAvailablePrompt();
            });
        });

        let lastUpdateCheck = 0;
        const checkForUpdate = () => {
            if (document.visibilityState !== 'visible') return;
            showAvailablePrompt();
            if (reloadRequested || Date.now() - lastUpdateCheck < SERVICE_WORKER_UPDATE_CHECK_MS) return;
            lastUpdateCheck = Date.now();
            reg.update().catch(() => {});
        };
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') checkForUpdate();
        });
        window.setInterval(checkForUpdate, SERVICE_WORKER_UPDATE_CHECK_MS);
        checkForUpdate();
    }).catch((err) => {
        console.warn('SW registration failed:', err);
    });
}

// ==========================================
// OFFLINE INDICATOR
// ==========================================
function initOfflineIndicator() {
    let banner = null;

    function show() {
        if (banner) return;
        banner = document.createElement('div');
        banner.className = 'offline-banner';
        banner.textContent = '📡 Offline — live network data unavailable';
        document.body.prepend(banner);
    }

    function hide() {
        if (!banner) return;
        banner.classList.add('hidden');
        setTimeout(() => { banner?.remove(); banner = null; }, 300);
    }

    window.addEventListener('online', hide);
    window.addEventListener('offline', show);
    if (!navigator.onLine) show();
}


let lifecycleStarted = false;

export function initShellLifecycle() {
    renderBuildVersion();
    if (lifecycleStarted) return;
    lifecycleStarted = true;
    registerServiceWorker();
    initOfflineIndicator();
}
