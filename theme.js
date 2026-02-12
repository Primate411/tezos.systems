/**
 * Theme management module
 * Handles visual theme switching and persistence
 */

const THEME_KEY = 'tezos-systems-theme';
const THEMES = ['matrix', 'void', 'ember', 'signal', 'default'];
const DEFAULT_THEME = 'matrix';

/**
 * Initialize theme system
 * Loads theme from localStorage or defaults to 'default'
 */
export function initTheme() {
    // Try to load saved theme
    const savedTheme = localStorage.getItem(THEME_KEY);

    // Use saved theme, otherwise default
    const theme = savedTheme && THEMES.includes(savedTheme) ? savedTheme : DEFAULT_THEME;

    // Apply theme
    setTheme(theme);
}

/**
 * Cycle to next theme
 */
export function toggleTheme() {
    const current = getCurrentTheme();
    const currentIndex = THEMES.indexOf(current);
    const nextIndex = (currentIndex + 1) % THEMES.length;
    const next = THEMES[nextIndex];

    setTheme(next);
    localStorage.setItem(THEME_KEY, next);
}

/**
 * Set theme
 * @param {string} theme - Theme to set ('default' or 'matrix')
 */
export function setTheme(theme) {
    // Validate theme
    if (!THEMES.includes(theme)) {
        console.warn(`Invalid theme: ${theme}, defaulting to ${DEFAULT_THEME}`);
        theme = DEFAULT_THEME;
    }

    // Apply theme to body
    document.body.setAttribute('data-theme', theme);

    // Update theme icon
    updateThemeIcon(theme);

    // Dispatch custom event for other components
    window.dispatchEvent(new CustomEvent('themechange', {
        detail: { theme }
    }));
}

/**
 * Get current theme
 * @returns {string} Current theme
 */
export function getCurrentTheme() {
    return document.body.getAttribute('data-theme') || DEFAULT_THEME;
}

/**
 * Update theme toggle button icon
 * @param {string} theme - Current theme
 */
function updateThemeIcon(theme) {
    const icon = document.querySelector('.theme-icon');
    if (icon) {
        // Show icon based on current theme
        const icons = {
            'default': '🎨',
            'matrix': '💚',
            'void': '🕳️',
            'ember': '🌋',
            'signal': '📡'
        };

        icon.textContent = icons[theme] || '🎨';

        // Update aria-label for accessibility
        const button = document.getElementById('theme-toggle');
        if (button) {
            const nextIndex = (THEMES.indexOf(theme) + 1) % THEMES.length;
            const nextTheme = THEMES[nextIndex];
            button.setAttribute('aria-label', `Switch to ${nextTheme} theme`);
            button.setAttribute('title', `Theme: ${theme}`);
        }
    }
}

/**
 * Get all available themes
 * @returns {Array} Array of theme names
 */
export function getAvailableThemes() {
    return [...THEMES];
}

/**
 * Clear saved theme preference
 * Will revert to default theme
 */
export function clearThemePreference() {
    localStorage.removeItem(THEME_KEY);
    setTheme(DEFAULT_THEME);
}
