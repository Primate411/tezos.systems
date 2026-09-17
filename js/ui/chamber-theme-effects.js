/** Shared by the dashboard and standalone Chambers: load only the selected painter. */
import { versionedAsset } from '../core/asset-version.js';
const backgroundThemes = new Set(['void', 'ember', 'signal', 'bubblegum', 'nerv', 'abyss', 'moss', 'warzone']);
const loaded = new Map();
const attempts = new Map();
let initialized = false;

export function initChamberThemeEffects() {
    // A standalone room can install the dashboard shell in this same document.
    if (initialized) return;
    initialized = true;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
        if (motion.matches) return;
        const theme = document.body.dataset.theme;
        const source = theme === 'matrix' ? '/js/effects/matrix-effects.js'
            : backgroundThemes.has(theme) ? '/js/effects/bg-effects.js'
                : theme === 'valley' ? versionedAsset('/js/effects/valley-loader.js') : null;
        if (!source || loaded.has(source)) return;
        // Keep one canonical successful instance. A rejected native import can
        // stay cached, so only a later user intent retries under a fresh URL.
        const attempt = attempts.get(source) || 0;
        const url = attempt ? `${source}${source.includes('?') ? '&' : '?'}theme-retry=${attempt}` : source;
        loaded.set(source, import(url).catch(error => {
            loaded.delete(source);
            attempts.set(source, attempt + 1);
            console.warn('Theme background unavailable:', error);
        }));
        // Painters inspect the current DOM theme when they finish importing and
        // own subsequent start/stop events. Never replay a stale preview event.
    };
    window.addEventListener('themechange', sync);
    if (motion.addEventListener) motion.addEventListener('change', sync);
    else motion.addListener?.(sync);
    sync();
}
