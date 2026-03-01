/**
 * Theme management module
 * Handles visual theme switching and persistence
 */

const THEME_KEY = 'tezos-systems-theme';
const THEMES = ['matrix', 'default', 'void', 'ember', 'signal', 'clean', 'dark', 'bubblegum'];
const DEFAULT_THEME = 'matrix';

// Theme color definitions for the picker dots
const THEME_COLORS = {
    'matrix': { bg: '#0a0f0a', accent: '#00ff00', text: '#00ff41' },
    'void': { bg: '#0a0a14', accent: '#8b5cf6', text: '#a78bfa' },
    'ember': { bg: '#0f0a08', accent: '#ff6b2b', text: '#ff9f43' },
    'signal': { bg: '#0a0f0e', accent: '#00ffc8', text: '#00d4ff' },
    'clean': { bg: '#ffffff', accent: '#0784c3', text: '#1e2022' },
    'dark': { bg: '#1A1A1A', accent: '#C8C8C8', text: '#E8E8E8' },
    'default': { bg: '#0f0f1a', accent: '#00d4ff', text: '#b794f6' },
    'bubblegum': { bg: '#1F0E18', accent: '#FF69B4', text: '#F5E0EE' }
};

let currentPreviewTheme = null;
let originalTheme = null;

/**
 * Initialize theme system
 * Loads theme from localStorage or shows first-visit modal
 */
export function initTheme() {
    // Check URL for theme deep link (?theme=matrix, etc.)
    const urlParams = new URLSearchParams(window.location.search);
    const urlTheme = urlParams.get('theme');
    if (urlTheme && THEMES.includes(urlTheme)) {
        setTheme(urlTheme);
        localStorage.setItem(THEME_KEY, urlTheme);
        return;
    }

    // Try to load saved theme
    const savedTheme = localStorage.getItem(THEME_KEY);

    if (!savedTheme) {
        // First visit - show picker modal
        showFirstVisitPicker();
        // Set default theme temporarily
        setTheme(DEFAULT_THEME);
        return;
    }

    // Use saved theme
    const theme = THEMES.includes(savedTheme) ? savedTheme : DEFAULT_THEME;
    setTheme(theme);
}

/**
 * Show first-visit theme picker modal
 */
const THEME_VIBES = {
    'matrix': { tagline: 'Code the Future', icon: '🟢' },
    'default': { tagline: 'Refined Discovery', icon: '💎' },
    'void': { tagline: 'Deep Space', icon: '🔮' },
    'ember': { tagline: 'Phoenix Rising', icon: '🔥' },
    'signal': { tagline: 'Decode the Data', icon: '📡' },
    'clean': { tagline: 'Pure Analytics', icon: '📊' },
    'dark': { tagline: 'Zero Distractions', icon: '🌑' },
    'bubblegum': { tagline: 'Sweet Simplicity', icon: '🫧' }
};

function showFirstVisitPicker() {
    // First visit — set default theme and let them in
    // Full landing experience available at /landing.html
    setTheme(DEFAULT_THEME);
    localStorage.setItem(THEME_KEY, DEFAULT_THEME);
}


/**
 * Open theme picker dropdown
 */
export function openThemePicker() {
    // Remove any existing theme picker
    const existingPicker = document.getElementById('theme-picker-dropdown');
    if (existingPicker) {
        existingPicker.remove();
    }

    const currentTheme = getCurrentTheme();
    originalTheme = currentTheme;

    // Create picker HTML
    const pickerHTML = `
        <div id="theme-picker-dropdown" class="theme-picker-dropdown">
            ${THEMES.map(theme => `
                <div class="theme-row" data-theme="${theme}">
                    <div class="theme-dots">
                        <span class="theme-dot" style="background-color: ${THEME_COLORS[theme].bg};"></span>
                        <span class="theme-dot" style="background-color: ${THEME_COLORS[theme].accent};"></span>
                        <span class="theme-dot" style="background-color: ${THEME_COLORS[theme].text};"></span>
                    </div>
                    <span class="theme-label">${capitalizeTheme(theme)}</span>
                    <span class="theme-checkmark" ${currentTheme === theme ? '' : 'style="display: none;"'}>✓</span>
                </div>
            `).join('')}
        </div>
    `;

    // Position picker (mobile vs desktop)
    // Always append to body with fixed positioning to avoid layout shifts during theme preview
    document.body.insertAdjacentHTML('beforeend', pickerHTML);
    const pickerEl = document.getElementById('theme-picker-dropdown');
    
    if (window.innerWidth < 768) {
        // Mobile: bottom sheet
        pickerEl.classList.add('mobile-bottom-sheet');
    } else {
        // Desktop: position fixed, anchored to the settings gear button
        const settingsBtn = document.getElementById('settings-gear');
        if (settingsBtn) {
            const rect = settingsBtn.getBoundingClientRect();
            pickerEl.style.position = 'fixed';
            pickerEl.style.top = (rect.bottom + 8) + 'px';
            pickerEl.style.right = (window.innerWidth - rect.right) + 'px';
            pickerEl.style.left = 'auto';
        }
    }

    // Get the picker element
    const picker = document.getElementById('theme-picker-dropdown');

    // Add event listeners
    const themeRows = picker.querySelectorAll('.theme-row');

    themeRows.forEach(row => {
        const theme = row.dataset.theme;

        // Hover preview (desktop only)
        if (window.innerWidth >= 768) {
            row.addEventListener('mouseenter', () => {
                currentPreviewTheme = theme;
                setTheme(theme, true); // true = preview mode
            });
        }

        // Click to select
        row.addEventListener('click', (e) => {
            e.stopPropagation();
            currentPreviewTheme = null;
            setTheme(theme);
            localStorage.setItem(THEME_KEY, theme);
            closeThemePicker();
        });
    });

    // Hover out of picker - revert to original
    if (window.innerWidth >= 768) {
        picker.addEventListener('mouseleave', () => {
            if (currentPreviewTheme && originalTheme) {
                setTheme(originalTheme, true);
                currentPreviewTheme = null;
            }
        });
    }

    // Close on outside click
    const closeHandler = (e) => {
        if (!picker.contains(e.target)) {
            closeThemePicker();
            document.removeEventListener('click', closeHandler);
        }
    };
    
    setTimeout(() => {
        document.addEventListener('click', closeHandler);
    }, 100);

    // Close on escape
    const escapeHandler = (e) => {
        if (e.key === 'Escape') {
            closeThemePicker();
            document.removeEventListener('keydown', escapeHandler);
        }
    };
    document.addEventListener('keydown', escapeHandler);

    // Show picker
    picker.classList.add('open');
}

/**
 * Close theme picker and cleanup
 */
function closeThemePicker() {
    const picker = document.getElementById('theme-picker-dropdown');
    if (!picker) return;

    // Revert any preview
    if (currentPreviewTheme && originalTheme) {
        setTheme(originalTheme);
        currentPreviewTheme = null;
    }

    picker.remove();
}

/**
 * Cycle to next theme (kept for backward compatibility)
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
 * @param {boolean} isPreview - If true, don't update UI elements (for hover preview)
 */
export function setTheme(theme, isPreview = false) {
    // Validate theme
    if (!THEMES.includes(theme)) {
        console.warn(`Invalid theme: ${theme}, defaulting to ${DEFAULT_THEME}`);
        theme = DEFAULT_THEME;
    }

    // Apply theme to body
    document.body.setAttribute('data-theme', theme);

    // Always dispatch themechange so canvas effects (matrix rain, particles) start/stop
    window.dispatchEvent(new CustomEvent('themechange', {
        detail: { theme, isPreview }
    }));

    if (!isPreview) {
        // Update theme icon
        updateThemeIcon(theme);
    }
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
            'signal': '📡',
            'clean': '📊',
            'dark': '🌑',
            'bubblegum': '🫧'
        };

        icon.textContent = icons[theme] || '🎨';

        // Update aria-label for accessibility
        const button = document.getElementById('theme-toggle');
        if (button) {
            button.setAttribute('aria-label', `Select theme`);
            button.setAttribute('title', `Theme: ${capitalizeTheme(theme)}`);
        }
    }
}

/**
 * Capitalize theme name for display
 * @param {string} theme - Theme name
 * @returns {string} Capitalized theme name
 */
function capitalizeTheme(theme) {
    return theme.charAt(0).toUpperCase() + theme.slice(1);
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