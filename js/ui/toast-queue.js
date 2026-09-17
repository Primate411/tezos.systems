/**
 * Global toast coordinator.
 * Keeps ambient, streak, and network moment toasts from stacking on top of
 * each other, while letting the hero arrival finish before the first toast.
 */

let sequence = 0;
let active = false;
let queue = [];
let gatePromise = null;
let gateSettled = false;
const safeAreaReservations = new Map();

function normalizeSafeAreaBottom(bottomPx) {
    const bottom = Number(bottomPx);
    if (!Number.isFinite(bottom) || bottom <= 0) return 0;
    return Math.ceil(bottom);
}

function applyToastSafeArea() {
    if (typeof document === 'undefined') return;
    let bottom = 0;
    safeAreaReservations.forEach((value) => {
        bottom = Math.max(bottom, normalizeSafeAreaBottom(value));
    });

    const root = document.documentElement;
    if (bottom > 0) {
        root.style.setProperty('--toast-safe-bottom', `calc(${bottom}px + env(safe-area-inset-bottom, 0px))`);
        document.body?.classList.add('toast-safe-area-raised');
    } else {
        root.style.removeProperty('--toast-safe-bottom');
        document.body?.classList.remove('toast-safe-area-raised');
    }
}

export function reserveToastSafeArea(key, bottomPx) {
    if (!key) return;
    const bottom = normalizeSafeAreaBottom(bottomPx);
    if (bottom <= 0) {
        safeAreaReservations.delete(key);
    } else {
        safeAreaReservations.set(key, bottom);
    }
    applyToastSafeArea();
}

export function releaseToastSafeArea(key) {
    if (!key) return;
    safeAreaReservations.delete(key);
    applyToastSafeArea();
}

if (typeof window !== 'undefined') {
    window.tezosSystemsToastSafeArea = {
        reserve: reserveToastSafeArea,
        release: releaseToastSafeArea
    };
}

function getWindowGate() {
    if (gatePromise || gateSettled || typeof window === 'undefined') return gatePromise;
    const candidate = window.tezosSystemsHeroSettled;
    if (candidate && typeof candidate.then === 'function') gatePromise = candidate;
    return gatePromise;
}

async function waitForGate() {
    if (gateSettled) return;
    const gate = getWindowGate();
    if (!gate) {
        gateSettled = true;
        return;
    }
    try {
        await Promise.race([
            gate,
            new Promise((resolve) => window.setTimeout(resolve, 6000))
        ]);
    } catch (_) {
        // A broken hero gate should not strand toasts forever.
    }
    gateSettled = true;
}

function sortQueue() {
    queue.sort((a, b) => (a.priority - b.priority) || (a.sequence - b.sequence));
}

async function drainQueue() {
    if (active) return;
    active = true;
    await waitForGate();

    while (queue.length) {
        sortQueue();
        const item = queue.shift();
        await new Promise((resolve) => {
            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                resolve();
            };
            try {
                item.show(finish, item.duration);
            } catch (error) {
                console.warn('[toast-queue] toast failed:', error);
                finish();
            }
        });
    }

    active = false;
}

export function setToastGate(promise) {
    if (!promise || typeof promise.then !== 'function') {
        gateSettled = true;
        gatePromise = null;
        drainQueue();
        return;
    }
    gatePromise = promise;
    gateSettled = false;
    drainQueue();
}

export function enqueueToast({ priority = 4, show, duration = 6000 } = {}) {
    if (typeof show !== 'function') return;
    queue.push({
        priority: Number.isFinite(Number(priority)) ? Number(priority) : 4,
        duration,
        show,
        sequence: sequence++
    });
    drainQueue();
}
