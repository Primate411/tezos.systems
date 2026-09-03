/** Keep the selected theme's existing character without loading other painters. */
import { versionedAsset } from '../core/asset-version.js';
const backgroundThemes = new Set(['void', 'ember', 'signal', 'bubblegum', 'nerv', 'abyss', 'moss', 'warzone']);
const loaded = new Map();
export function initChamberThemeEffects() {
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
        if (motion.matches) return;
        const theme = document.body.dataset.theme;
        const source = theme === 'matrix' ? '/js/effects/matrix-effects.js'
            : backgroundThemes.has(theme) ? '/js/effects/bg-effects.js'
                : theme === 'valley' ? versionedAsset('/js/effects/valley-loader.js') : null;
        if (!source || loaded.has(source)) return;
        loaded.set(source, import(source).catch(error => {
            loaded.delete(source);
            console.warn('Theme background unavailable:', error);
        }));
    };
    window.addEventListener('themechange', sync);
    motion.addEventListener('change', sync);
    sync();
}
