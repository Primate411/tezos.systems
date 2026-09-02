import { debugLog } from './utils.js';

const GITHUB_MAIN_COMMIT_URL = 'https://api.github.com/repos/Primate411/tezos.systems/commits/main';

async function fetchBuildMetadata({ signal } = {}) {
    try {
        const response = await fetch('/version.json', { cache: 'no-store', signal });
        return response.ok ? response.json() : null;
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
const SERVICE_WORKER_ACTIVATION_FALLBACK_MS = 8000;
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
    if (!releaseUpdateUiPromise) releaseUpdateUiPromise = import('../ui/release-update.js');
    return releaseUpdateUiPromise;
}

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        let reloadRequested = false;
        let reloading = false;
        let controlledAtRegistration = Boolean(navigator.serviceWorker.controller);
        let deferredUntil = readReleaseUpdateDeferredUntil();
        let deferredTimer = 0;
        let activationFallbackTimer = 0;

        const clearDeferredTimer = () => {
            if (!deferredTimer) return;
            window.clearTimeout(deferredTimer);
            deferredTimer = 0;
        };

        const scheduleResurface = (callback) => {
            clearDeferredTimer();
            const delay = Math.max(0, deferredUntil - Date.now());
            deferredTimer = window.setTimeout(() => {
                deferredTimer = 0;
                if (document.visibilityState === 'visible') callback();
            }, delay);
        };

        const deferPrompt = (resurface) => {
            deferredUntil = Date.now() + SERVICE_WORKER_UPDATE_DEFER_MS;
            writeReleaseUpdateDeferredUntil(deferredUntil);
            scheduleResurface(resurface);
        };

        const reloadThisTab = () => {
            reloadRequested = true;
            window.location.reload();
        };

        const showAppliedElsewherePrompt = async () => {
            const [ui, release] = await Promise.all([
                loadReleaseUpdateUi(),
                fetchReleaseUpdateMetadata()
            ]);
            const resurface = () => showAppliedElsewherePrompt();
            ui.showReleaseUpdateDock({
                state: 'reload',
                title: 'Update applied in another tab',
                detail: release.detail,
                meta: release.meta,
                actionLabel: 'Reload this tab',
                pendingLabel: 'Reloading…',
                pillLabel: 'Reload transmission',
                expanded: false,
                onAction: reloadThisTab,
                onLater: () => deferPrompt(resurface)
            });
        };

        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (activationFallbackTimer) {
                window.clearTimeout(activationFallbackTimer);
                activationFallbackTimer = 0;
            }
            if (reloadRequested && !reloading) {
                reloading = true;
                window.location.reload();
                return;
            }
            if (!controlledAtRegistration) {
                controlledAtRegistration = true;
                return;
            }
            showAppliedElsewherePrompt();
        });

        const showUpdatePrompt = async (reg) => {
            if (!reg.waiting || !navigator.serviceWorker.controller) return;
            const [ui, release] = await Promise.all([
                loadReleaseUpdateUi(),
                fetchReleaseUpdateMetadata()
            ]);
            if (!reg.waiting || !navigator.serviceWorker.controller) return;

            const resurface = () => showUpdatePrompt(reg);
            const showReloadFallback = () => {
                ui.setReleaseUpdateDockState({
                    state: 'reload',
                    title: 'Update ready to finish',
                    detail: release.detail,
                    meta: release.meta,
                    actionLabel: 'Reload now',
                    pendingLabel: 'Reloading…',
                    pillLabel: 'Reload transmission',
                    onAction: reloadThisTab,
                    onLater: () => {
                        reloadRequested = false;
                        deferPrompt(resurface);
                    }
                });
            };

            ui.showReleaseUpdateDock({
                state: 'ready',
                title: 'Update ready',
                detail: release.detail,
                meta: release.meta,
                actionLabel: 'Update & reload',
                pendingLabel: 'Updating…',
                pillLabel: 'Update transmission',
                expanded: false,
                onLater: () => deferPrompt(resurface),
                onAction() {
                    const waiting = reg.waiting;
                    if (!waiting) {
                        reloadThisTab();
                        return;
                    }
                    reloadRequested = true;
                    waiting.postMessage({ type: 'SKIP_WAITING' });
                    if (activationFallbackTimer) window.clearTimeout(activationFallbackTimer);
                    activationFallbackTimer = window.setTimeout(() => {
                        activationFallbackTimer = 0;
                        if (!reloading) showReloadFallback();
                    }, SERVICE_WORKER_ACTIVATION_FALLBACK_MS);
                }
            });
        };

        navigator.serviceWorker.register('/sw.js').then((reg) => {
            debugLog('📦 Service Worker registered, scope:', reg.scope);
            showUpdatePrompt(reg);
            reg.addEventListener('updatefound', () => {
                const worker = reg.installing;
                worker?.addEventListener('statechange', () => {
                    if (worker.state === 'installed') showUpdatePrompt(reg);
                });
            });

            let lastUpdateCheck = 0;
            const checkForUpdate = () => {
                if (document.visibilityState !== 'visible') return;
                if (reg.waiting) showUpdatePrompt(reg);
                if (Date.now() - lastUpdateCheck < SERVICE_WORKER_UPDATE_CHECK_MS) return;
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

