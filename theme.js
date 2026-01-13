/**
 * Theme management module
 * Handles dark/light mode switching and persistence
 */

const THEME_KEY = 'tezos-systems-theme';
const DARK_THEME = 'dark';
const LIGHT_THEME = 'light';

/**
 * Initialize theme system
 * Loads theme from localStorage or system preference
 */
export function initTheme() {
    // Try to load saved theme
    const savedTheme = localStorage.getItem(THEME_KEY);

    // Check system preference
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    // Use saved theme, otherwise use system preference, default to dark
    const theme = savedTheme || (systemPrefersDark ? DARK_THEME : LIGHT_THEME);

    // Apply theme
    setTheme(theme);

    // Listen for system theme changes (only if no saved preference)
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
        // Only auto-switch if user hasn't set a preference
        if (!localStorage.getItem(THEME_KEY)) {
            setTheme(e.matches ? DARK_THEME : LIGHT_THEME);
        }
    });
}

/**
 * Toggle between dark and light themes
 */
export function toggleTheme() {
    const current = getCurrentTheme();
    const next = current === DARK_THEME ? LIGHT_THEME : DARK_THEME;
    setTheme(next);
    localStorage.setItem(THEME_KEY, next);
}

/**
 * Set theme
 * @param {string} theme - Theme to set ('dark' or 'light')
 */
export function setTheme(theme) {
    // Validate theme
    if (theme !== DARK_THEME && theme !== LIGHT_THEME) {
        console.warn(`Invalid theme: ${theme}, defaulting to dark`);
        theme = DARK_THEME;
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
 * @returns {string} Current theme ('dark' or 'light')
 */
export function getCurrentTheme() {
    return document.body.getAttribute('data-theme') || DARK_THEME;
}

/**
 * Update theme toggle button icon
 * @param {string} theme - Current theme
 */
function updateThemeIcon(theme) {
    const icon = document.querySelector('.theme-icon');
    if (icon) {
        // Show sun in dark mode (to switch to light)
        // Show moon in light mode (to switch to dark)
        icon.textContent = theme === DARK_THEME ? '☀️' : '🌙';

        // Update aria-label for accessibility
        const button = document.getElementById('theme-toggle');
        if (button) {
            button.setAttribute('aria-label',
                theme === DARK_THEME
                    ? 'Switch to light mode'
                    : 'Switch to dark mode'
            );
        }
    }
}

/**
 * Check if dark mode is active
 * @returns {boolean} True if dark mode is active
 */
export function isDarkMode() {
    return getCurrentTheme() === DARK_THEME;
}

/**
 * Force set to dark mode
 */
export function setDarkMode() {
    setTheme(DARK_THEME);
    localStorage.setItem(THEME_KEY, DARK_THEME);
}

/**
 * Force set to light mode
 */
export function setLightMode() {
    setTheme(LIGHT_THEME);
    localStorage.setItem(THEME_KEY, LIGHT_THEME);
}

/**
 * Clear saved theme preference
 * Will revert to system preference
 */
export function clearThemePreference() {
    localStorage.removeItem(THEME_KEY);
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setTheme(systemPrefersDark ? DARK_THEME : LIGHT_THEME);
}
