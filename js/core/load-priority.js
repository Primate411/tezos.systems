/** Reading position owns pending work; dispatched requests keep their lifetime. */
let overlay = null;
const intents = new Map();
const tasks = new Map();
let frame = null;
let running = 0;

export function currentLoadSurface() {
    if (overlay?.isConnected) return overlay;
    // My Tezos owns its drawer lifecycle outside the shared modal stack.
    return typeof document === 'undefined' ? null : document.querySelector('#my-tezos-drawer.open');
}

export function beginLoadIntent(selector) {
    const token = Symbol('load-intent');
    intents.set(token, selector);
    return () => { intents.delete(token); wake(); };
}

function elements(surface) {
    if (typeof surface === 'function') return elements(surface());
    if (typeof surface === 'string') return [...document.querySelectorAll(surface)];
    return surface?.isConnected ? [surface] : [];
}

/** Higher scores win. Geometry is read afresh so scrolling can reorder a queue. */
export function loadPriority(surface, priority = 'normal') {
    const top = currentLoadSurface();
    const pending = [...intents.values()].at(-1);
    const nodes = elements(surface);
    const detail = priority === 'enrichment';
    let score = surface ? 0 : (priority === 'interactive' ? 700 : 100);
    for (const node of nodes) {
        if (top && (top === node || top.contains(node))) {
            score = Math.max(score, detail ? 850 : 1000);
            continue;
        }
        if (pending && node.matches(pending)) {
            score = Math.max(score, 1000);
            continue;
        }
        if (top || pending || node.closest('[hidden], [inert], [aria-hidden="true"]')) continue;
        const rect = node.getBoundingClientRect();
        if (!rect.width || !rect.height || getComputedStyle(node).visibility === 'hidden') continue;
        const height = window.innerHeight;
        if (rect.bottom > 0 && rect.top < height) {
            // All visible essentials precede enrichment, then read top to bottom.
            const order = Math.min(99, Math.max(0, rect.top) / height * 99);
            score = Math.max(score, (priority === 'interactive' ? 800 : detail ? 400 : 600) - order);
        } else if (rect.top >= height && rect.top < height + 300) {
            score = Math.max(score, 200 - (rect.top - height) / 10);
        } else score = Math.max(score, 20);
    }
    return score;
}

function wake() {
    if (frame !== null || !tasks.size || document.visibilityState !== 'visible') return;
    frame = requestAnimationFrame(drain);
}

function drain() {
    frame = null;
    if (currentLoadSurface() || intents.size || document.visibilityState !== 'visible') return;
    const ordered = [...tasks.values()].map(task => ({ task, score: loadPriority(task.surface) }))
        .filter(item => item.score >= 170).sort((a, b) => b.score - a.score);
    for (const { task } of ordered) {
        if (running >= 2) break;
        tasks.delete(task.key);
        running += 1;
        Promise.resolve().then(task.run).then(task.resolve, task.reject).finally(() => { running -= 1; wake(); });
    }
}

/** Defer optional launcher work until visible/nearby. User opens bypass this. */
export function scheduleViewportLoad(key, surface, run) {
    const existing = tasks.get(key);
    if (existing) {
        wake();
        return existing.promise;
    }
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    tasks.set(key, { key, surface, run, resolve, reject, promise });
    wake();
    return promise;
}

if (typeof document !== 'undefined') {
    document.addEventListener('tezos:overlay-stack-change', event => {
        overlay = event.detail?.topOverlay || null;
        wake();
    });
    document.addEventListener('visibilitychange', wake);
    document.addEventListener('scroll', wake, { capture: true, passive: true });
    window.addEventListener('resize', wake, { passive: true });
    window.addEventListener('my-tezos-drawer-opened', wake);
    window.addEventListener('my-tezos-drawer-closed', wake);
}
