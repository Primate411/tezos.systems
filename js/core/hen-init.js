// Shared HEN/theme styles stay eager; feed styles and runtime load on intent.
(() => {
    const isHenRoute = /^\/hen(?:\/|\/index\.html)?$/.test(window.location.pathname)
        || new URLSearchParams(window.location.search).has('hen');
    let runtimePromise = null;
    let runtimeAttempts = 0;
    let stylesPromise = null;
    let stylesAttempts = 0;
    let activationIntent = 0;
    const domReady = document.readyState === 'loading'
        ? new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }))
        : Promise.resolve();

    function clearBlackout() {
        document.getElementById('hen-initial-blackout')?.remove();
        document.documentElement.style.background = '';
    }

    if (isHenRoute) {
        document.documentElement.style.background = '#111';
        const style = document.createElement('style');
        style.id = 'hen-initial-blackout';
        style.textContent = 'body>*:not(.hen-overlay){display:none!important}body{background:#111!important}';
        document.head.appendChild(style);
        window.__henBlackoutClaimed = false;
        window.__henBlackoutFailOpenTimer = window.setTimeout(() => {
            if (!window.__henBlackoutClaimed) clearBlackout();
        }, 2500);
    }

    function loadHenMode() {
        if (window.HenMode) return Promise.resolve(window.HenMode);
        if (runtimePromise) return runtimePromise;
        runtimePromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.id = 'hen-runtime';
            script.type = 'module';
            const attempt = runtimeAttempts++;
            // A failed module URL is cached by the browser; explicit retries
            // need a fresh URL while concurrent launchers still share one load.
            script.src = '/js/features/hen-mode.js?v=98' + (attempt ? `&retry=${attempt}` : '');
            script.async = true;
            script.addEventListener('load', () => {
                if (window.HenMode) resolve(window.HenMode);
                else {
                    script.remove();
                    reject(new Error('HEN runtime did not initialize'));
                }
            }, { once: true });
            script.addEventListener('error', () => {
                script.remove();
                reject(new Error('HEN runtime unavailable'));
            }, { once: true });
            document.head.appendChild(script);
        }).catch((error) => {
            runtimePromise = null;
            throw error;
        });
        return runtimePromise;
    }

    function loadHenStyles() {
        const existing = document.getElementById('hen-feed-css');
        if (existing?.sheet) return Promise.resolve(existing);
        if (stylesPromise) return stylesPromise;
        stylesPromise = new Promise((resolve, reject) => {
            const link = existing || document.createElement('link');
            if (!existing) {
                const attempt = stylesAttempts++;
                link.id = 'hen-feed-css';
                link.rel = 'stylesheet';
                link.href = '/css/hen-feed.min.css?v=100' + (attempt ? `&retry=${attempt}` : '');
            }
            link.addEventListener('load', () => resolve(link), { once: true });
            link.addEventListener('error', () => {
                link.remove();
                reject(new Error('HEN styles unavailable'));
            }, { once: true });
            // Preserve the original cascade position relative to other styles.
            if (!existing) {
                const shared = document.getElementById('hen-shared-css');
                if (shared) shared.after(link);
                else document.head.appendChild(link);
            }
        }).catch(error => {
            stylesPromise = null;
            throw error;
        });
        return stylesPromise;
    }

    window.openHenMode = async (launcher = null) => {
        const intent = ++activationIntent;
        const requestedRoute = window.location.href;
        const title = launcher?.title || '';
        launcher?.setAttribute('aria-busy', 'true');
        try {
            const [runtime] = await Promise.all([loadHenMode(), loadHenStyles(), domReady]);
            if (intent !== activationIntent || window.location.href !== requestedRoute) return false;
            runtime.init();
            if (launcher) launcher.title = title;
            await runtime.activate();
            return true;
        } catch (error) {
            clearBlackout();
            console.warn('HEN unavailable; activate the launcher again to retry:', error);
            if (launcher) launcher.title = 'HEN unavailable — activate again to retry';
            return false;
        } finally {
            launcher?.removeAttribute('aria-busy');
        }
    };

    document.addEventListener('click', (event) => {
        const launcher = event.target instanceof Element
            ? event.target.closest('#hen-launcher, [data-hen-launch]') : null;
        if (!launcher || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
        window.openHenMode(launcher);
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !window.HenMode?.isActive()) {
            activationIntent += 1;
            clearBlackout();
        }
    });

    // Preserve the one-time doorway hint without loading the feed to show it.
    const doorwayKey = 'tezos-hen-doorway-seen';
    const doorwaySeen = () => {
        try { return localStorage.getItem(doorwayKey) === '1'; } catch { return false; }
    };
    function primeDoorway() {
        const link = document.querySelector('.header-nft-feed-btn') || document.getElementById('hen-launcher');
        if (!link || doorwaySeen()) return;
        link.title = '🌱 hic et nunc lives here — enter the feed';
        const reducedMotion = typeof window.tezosSystemsPrefersReducedMotion === 'function'
            ? window.tezosSystemsPrefersReducedMotion()
            : window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        if (!reducedMotion) {
            link.classList.add('hen-doorway-attention');
            window.setTimeout(() => link.classList.remove('hen-doorway-attention'), 5200);
        }
        try { localStorage.setItem(doorwayKey, '1'); } catch {}
    }
    if (!doorwaySeen()) {
        let attempts = 0;
        const waitForHero = () => {
            const gate = window.tezosSystemsHeroSettled;
            if (gate?.then) gate.then(primeDoorway).catch(primeDoorway);
            else if (++attempts < 50) window.setTimeout(waitForHero, 100);
            else primeDoorway();
        };
        waitForHero();
    }

    if (isHenRoute) window.openHenMode();
})();
