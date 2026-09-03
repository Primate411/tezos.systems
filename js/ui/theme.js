/**
 * Theme management module
 * Handles visual theme switching and persistence
 */

const THEME_KEY = 'tezos-systems-theme';
export const THEMES = ['aurora', 'matrix', 'hen', 'default', 'void', 'ember', 'signal', 'nerv', 'clean', 'dark', 'bubblegum', 'abyss', 'moss', 'valley', 'warzone'];
// Aurora — bespoke animated default; striking but legible.
export const DEFAULT_THEME = 'aurora';
const THEME_CSS_VERSION = '617';
const THEME_FONT_FAMILIES = {
    aurora: ['Chakra+Petch:wght@400;600;700'],
    matrix: ['Share+Tech+Mono'],
    default: ['Chakra+Petch:wght@400;600;700'],
    void: ['Exo+2:wght@300;400;600'],
    ember: ['Chakra+Petch:wght@400;600;700'],
    signal: ['IBM+Plex+Mono:wght@400;500;600;700'],
    nerv: ['IBM+Plex+Mono:wght@400;500;600;700', 'Archivo+Black'],
    bubblegum: ['Nunito:wght@400;500;600;700;800;900'],
    abyss: ['Exo+2:wght@300;400;600', 'IBM+Plex+Mono:wght@400;500;600;700'],
    moss: ['Major+Mono+Display', 'Nunito:wght@400;500;600;700;800;900'],
    valley: ['Nunito:wght@400;500;600;700;800;900'],
    warzone: ['Chakra+Petch:wght@400;600;700', 'IBM+Plex+Mono:wght@400;500;600;700', 'Silkscreen:wght@400;700']
};

// Theme color definitions for the picker dots
export const THEME_COLORS = {
    'aurora': { bg: '#070B1A', accent: '#45E0C8', text: '#EAF0FF' },
    'matrix': { bg: '#0a0f0a', accent: '#00ff00', text: '#00ff41' },
    'hen': { bg: '#111111', accent: '#00d4ff', text: '#00ff88' },
    'void': { bg: '#06060C', accent: '#8B5CF6', text: '#D8D0FF' },
    'ember': { bg: '#0D0806', accent: '#FF9F43', text: '#FFE8D6' },
    'signal': { bg: '#060A08', accent: '#00E4A0', text: '#C8F0E0' },
    'nerv': { bg: '#000000', accent: '#FF9830', text: '#F0D8B0' },
    'clean': { bg: '#F8F9FC', accent: '#2563EB', text: '#1A1D26' },
    'dark': { bg: '#161716', accent: '#D0D0D0', text: '#F0F0F0' },
    'default': { bg: '#0A0E1A', accent: '#5B8DEF', text: '#D8E0F0' },
    'bubblegum': { bg: '#1F0E18', accent: '#FF69B4', text: '#F5E0EE' },
    'abyss': { bg: '#020A1E', accent: '#00E5FF', text: '#A8D8FF' },
    'moss': { bg: '#040C02', accent: '#50E850', text: '#D0E8B8' },
    'valley': { bg: '#171A12', accent: '#E7B66C', text: '#FFF4D6' },
    'warzone': { bg: '#080A02', accent: '#FFC000', text: '#E0D8A0' }
};

let currentPreviewTheme = null;
let originalTheme = null;
let themePickerTrigger = null;
let themePickerOutsideHandler = null;
let themePickerEscapeHandler = null;

function themeCssHref(theme) {
    return `/css/themes/${theme}.min.css?v=${THEME_CSS_VERSION}`;
}

function ensureThemeStylesheet(theme) {
    if (!THEMES.includes(theme)) return;
    const id = `theme-css-${theme}`;
    if (document.getElementById(id)) return;

    const preload = document.getElementById(`theme-css-preload-${theme}`);
    if (preload) {
        preload.id = id;
        preload.rel = 'stylesheet';
        preload.removeAttribute('as');
        return;
    }

    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = themeCssHref(theme);
    document.head.appendChild(link);
}

function ensureThemeFonts(theme) {
    const families = THEME_FONT_FAMILIES[theme] || [];
    if (!families.length || document.getElementById(`theme-fonts-${theme}`)) return;
    const link = document.createElement('link');
    link.id = `theme-fonts-${theme}`;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?${families.map((family) => `family=${family}`).join('&')}&display=swap`;
    document.head.appendChild(link);
}

function preloadThemeStylesheets() {
    THEMES.forEach((theme) => {
        if (document.getElementById(`theme-css-${theme}`) || document.getElementById(`theme-css-preload-${theme}`)) return;
        const link = document.createElement('link');
        link.id = `theme-css-preload-${theme}`;
        link.rel = 'preload';
        link.as = 'style';
        link.href = themeCssHref(theme);
        document.head.appendChild(link);
    });
}

/**
 * Initialize theme system
 * Loads theme from localStorage or applies the default theme for new visitors
 */
export function initTheme() {
    // Match the render-blocking preload contract: hash links win, then query
    // links, before any saved preference can repaint the page.
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const urlParams = new URLSearchParams(window.location.search);
    const hashTheme = hashParams.get('theme');
    const queryTheme = urlParams.get('theme');
    const urlTheme = THEMES.includes(hashTheme)
        ? hashTheme
        : queryTheme;
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
 * First visits now land directly on the dashboard; the guided tour handles onboarding.
 */
const THEME_VIBES = {
    'aurora': { tagline: 'Liquid Aurora', icon: '🌌' },
    'matrix': { tagline: 'Code the Future', icon: '🟢' },
    'hen': { tagline: 'Here & Now', icon: '▓' },
    'default': { tagline: 'Midnight Premium', icon: '💎' },
    'void': { tagline: 'Deep Space', icon: '🔮' },
    'ember': { tagline: 'Phoenix Rising', icon: '🔥' },
    'signal': { tagline: 'Decode the Data', icon: '📡' },
    'nerv': { tagline: 'Operations Console', icon: '⚡' },
    'clean': { tagline: 'Pure Analytics', icon: '📊' },
    'dark': { tagline: 'Zero Distractions', icon: '🌑' },
    'bubblegum': { tagline: 'Sweet Simplicity', icon: '🫧' },
    'abyss': { tagline: 'Deep Signal', icon: '🌊' },
    'moss': { tagline: 'Living Network', icon: '🌿' },
    'valley': { tagline: 'Painted Horizon', icon: '🏞️' },
    'warzone': { tagline: 'Command & Control', icon: '⚔️' }
};

function showFirstVisitPicker() {
    setTheme(DEFAULT_THEME);
}


/**
 * Open theme picker dropdown
 */
export function openThemePicker() {
    preloadThemeStylesheets();

    // Remove any existing theme picker
    const existingPicker = document.getElementById('theme-picker-dropdown');
    if (existingPicker) {
        closeThemePicker();
    }

    const currentTheme = getCurrentTheme();
    originalTheme = currentTheme;
    themePickerTrigger = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : document.getElementById('theme-toggle');

    // Theme categories for organized picker
    const ANIMATED_THEMES = ['aurora', 'matrix', 'hen', 'void', 'ember', 'signal', 'abyss', 'moss', 'valley', 'warzone', 'nerv', 'bubblegum'];
    const CLASSIC_THEMES = ['default', 'dark', 'clean'];

    function renderThemeRow(theme) {
        const vibe = THEME_VIBES[theme] || {};
        const label = capitalizeTheme(theme);
        return `
            <div class="theme-row-shell" data-theme-choice="${theme}">
                <label class="theme-row${theme === 'hen' ? ' theme-row-hen' : ''}" data-theme="${theme}">
                    <input class="theme-radio" type="radio" name="tezos-systems-theme" value="${theme}" ${currentTheme === theme ? 'checked' : ''} aria-label="${label}: ${vibe.tagline || 'theme'}">
                    <span class="theme-dots" aria-hidden="true">
                        <span class="theme-dot" style="background-color: ${THEME_COLORS[theme].bg};"></span>
                        <span class="theme-dot" style="background-color: ${THEME_COLORS[theme].accent};"></span>
                        <span class="theme-dot" style="background-color: ${THEME_COLORS[theme].text};"></span>
                    </span>
                    <span class="theme-label">${label}</span>
                    <span class="theme-tagline-hint">${vibe.tagline || ''}</span>
                </label>
                <button class="theme-link-copy" type="button" data-copy-hash="#theme=${theme}" aria-label="Copy ${label} theme link" title="Copy ${label} theme link">
                    <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                        <path d="M6.25 9.75 9.75 6.25M5.1 11.95l-1.05 1.05a2.12 2.12 0 0 1-3-3L4 7.05a2.12 2.12 0 0 1 3 0M10.9 4.05 11.95 3a2.12 2.12 0 0 1 3 3L12 8.95a2.12 2.12 0 0 1-3 0"></path>
                    </svg>
                </button>
            </div>`;
    }

    // Create picker HTML
    const pickerHTML = `
        <div id="theme-picker-dropdown" class="theme-picker-dropdown" role="radiogroup" aria-label="Choose a site theme">
            <div class="theme-group-label" aria-hidden="true">✦ Animated</div>
            ${ANIMATED_THEMES.map(renderThemeRow).join('')}
            <div class="theme-group-label" aria-hidden="true">◆ Classic</div>
            ${CLASSIC_THEMES.map(renderThemeRow).join('')}
        </div>
    `;

    // Position picker (mobile vs desktop)
    // Always append to body with fixed positioning to avoid layout shifts during theme preview
    document.body.insertAdjacentHTML('beforeend', pickerHTML);
    const pickerEl = document.getElementById('theme-picker-dropdown');
    
    if (window.innerWidth < 768) {
        // Mobile: bottom sheet
        pickerEl.classList.add('mobile-bottom-sheet');
        // Keep the full theme catalogue reachable on short and landscape screens.
        pickerEl.style.maxHeight = '88vh';
        pickerEl.style.setProperty('max-height', '88dvh');
        pickerEl.style.overflowY = 'auto';
        pickerEl.style.overscrollBehavior = 'contain';
        pickerEl.style.webkitOverflowScrolling = 'touch';
    } else {
        // Desktop: position fixed, anchored to the settings gear button
        const settingsBtn = document.getElementById('settings-gear');
        if (settingsBtn) {
            const rect = settingsBtn.getBoundingClientRect();
            pickerEl.style.position = 'fixed';
            pickerEl.style.top = (rect.bottom + 8) + 'px';
            pickerEl.style.right = (window.innerWidth - rect.right) + 'px';
            pickerEl.style.left = 'auto';
            pickerEl.style.maxHeight = `${Math.max(160, window.innerHeight - rect.bottom - 16)}px`;
            pickerEl.style.overflowY = 'auto';
            pickerEl.style.overscrollBehavior = 'contain';
        }
    }

    // Get the picker element
    const picker = document.getElementById('theme-picker-dropdown');

    // Add event listeners
    const themeRows = picker.querySelectorAll('.theme-row');
    const themeRadios = picker.querySelectorAll('.theme-radio');
    const themeCopyButtons = picker.querySelectorAll('.theme-link-copy');

    themeRows.forEach(row => {
        const theme = row.dataset.theme;

        // Hover preview (desktop only)
        if (window.innerWidth >= 768) {
            row.addEventListener('mouseenter', () => {
                currentPreviewTheme = theme;
                setTheme(theme, true); // true = preview mode
            });
        }

        // Pointer selection keeps the familiar one-click-and-close behavior.
        // Native radio keyboard events report detail 0 and remain open so arrow
        // keys can compare adjacent themes.
        row.addEventListener('click', (event) => {
            if (event.detail <= 0) return;
            window.setTimeout(() => closeThemePicker({ restoreFocus: true }), 0);
        });

    });

    themeRadios.forEach(radio => {
        const theme = radio.value;

        // Native radio changes include arrow-key selection. Keep the picker open
        // so keyboard users can compare themes, and persist each confirmed choice.
        radio.addEventListener('change', () => {
            currentPreviewTheme = null;
            setTheme(theme);
            localStorage.setItem(THEME_KEY, theme);
            originalTheme = theme;
        });

    });

    const restoreConfirmedThemeBeforeCopy = () => {
        if (!currentPreviewTheme || !originalTheme) return;
        setTheme(originalTheme, true);
        currentPreviewTheme = null;
    };
    themeCopyButtons.forEach(button => {
        button.addEventListener('pointerenter', restoreConfirmedThemeBeforeCopy);
        button.addEventListener('focus', restoreConfirmedThemeBeforeCopy);
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
    themePickerOutsideHandler = (e) => {
        if (!picker.contains(e.target)) {
            closeThemePicker();
        }
    };
    
    setTimeout(() => {
        if (document.body.contains(picker) && themePickerOutsideHandler) {
            document.addEventListener('click', themePickerOutsideHandler);
        }
    }, 100);

    // Close on escape
    themePickerEscapeHandler = (e) => {
        if (e.key === 'Escape') {
            closeThemePicker({ restoreFocus: true });
        }
    };
    document.addEventListener('keydown', themePickerEscapeHandler);

    // Show picker
    picker.classList.add('open');
    picker.querySelector('.theme-radio:checked')?.focus({ preventScroll: true });
}

/**
 * Close theme picker and cleanup
 */
function closeThemePicker({ restoreFocus = false } = {}) {
    const picker = document.getElementById('theme-picker-dropdown');
    if (!picker) return;

    // Revert any preview
    if (currentPreviewTheme && originalTheme) {
        setTheme(originalTheme);
        currentPreviewTheme = null;
    }

    if (themePickerOutsideHandler) {
        document.removeEventListener('click', themePickerOutsideHandler);
        themePickerOutsideHandler = null;
    }
    if (themePickerEscapeHandler) {
        document.removeEventListener('keydown', themePickerEscapeHandler);
        themePickerEscapeHandler = null;
    }

    picker.remove();
    if (restoreFocus && themePickerTrigger?.isConnected) {
        themePickerTrigger.focus({ preventScroll: true });
    }
    themePickerTrigger = null;
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
    ensureThemeStylesheet(theme);
    ensureThemeFonts(theme);
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
            'hen': '▓',
            'void': '🕳️',
            'ember': '🌋',
            'signal': '📡',
            'clean': '📊',
            'dark': '🌑',
            'nerv': '⚡',
            'bubblegum': '🫧',
            'abyss': '🌊',
            'moss': '🌿',
            'valley': '🏞️',
            'warzone': '⚔️'
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
 * Get theme color palette for the current (or specified) theme.
 * Returns { accent, bg, textPrimary, textSecondary } for use in Chart.js and canvas effects.
 */
export function getThemeColors(theme) {
    const t = theme || document.body.getAttribute('data-theme') || 'matrix';
    const colors = THEME_COLORS[t] || THEME_COLORS['matrix'];
    return {
        accent: colors.accent,
        bg: colors.bg,
        textPrimary: colors.text,
        textSecondary: colors.text + '99' // 60% opacity variant
    };
}
