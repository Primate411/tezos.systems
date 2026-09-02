// Keep the archive and its thousands of hidden nodes off the startup path.
let modulePromise = null;
let importAttempt = 0;

function loadChangelog() {
    if (!modulePromise) {
        const path = '../features/changelog.js';
        modulePromise = import(importAttempt ? `${path}?retry=${importAttempt}` : path)
            .catch((error) => {
                modulePromise = null;
                importAttempt += 1;
                throw error;
            });
    }
    return modulePromise;
}

export function initChangelog() {
    const button = document.getElementById('changelog-btn');
    if (!button || button.dataset.changelogLauncherWired === '1') return;
    button.dataset.changelogLauncherWired = '1';
    let pending = false;
    let cancelled = false;
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && pending) cancelled = true;
    });
    button.addEventListener('click', async (event) => {
        event.stopPropagation();
        if (pending) return;
        pending = true;
        cancelled = false;
        const route = window.location.href;
        const title = button.title;
        button.setAttribute('aria-busy', 'true');
        button.title = 'Loading changelog…';
        try {
            const module = await loadChangelog();
            button.title = title;
            if (!cancelled && window.location.href === route) module.openChangelog();
        } catch (error) {
            console.warn('Changelog unavailable; activate again to retry:', error);
            button.title = 'Changelog unavailable — activate again to retry';
        } finally {
            pending = false;
            button.removeAttribute('aria-busy');
        }
    });
}
