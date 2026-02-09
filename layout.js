/**
 * Card Layout management module
 * Handles switching between different card layout designs
 */

const LAYOUT_KEY = 'tezos-systems-layout';
const LAYOUTS = [
    'option-1',  // Clean Stack
    'option-2',  // Centered Zen
    'option-3',  // Compact Grid
    'option-4',  // Dashboard Pro
    'option-5',  // Asymmetric Modern
    'option-6',  // Card Header Style
    'option-7',  // Minimal Dividers
    'option-8',  // Inline Compact
    'option-9',  // Traditional Card
    'option-10'  // Split Layout
];

const LAYOUT_NAMES = {
    'option-1': 'Clean Stack',
    'option-2': 'Centered Zen',
    'option-3': 'Compact Grid',
    'option-4': 'Dashboard Pro',
    'option-5': 'Asymmetric Modern',
    'option-6': 'Card Header',
    'option-7': 'Minimal Dividers',
    'option-8': 'Inline Compact',
    'option-9': 'Traditional Card',
    'option-10': 'Split Layout'
};

const LAYOUT_ICONS = {
    'option-1': '📋',  // Clean Stack
    'option-2': '⚪',  // Centered Zen
    'option-3': '⚡',  // Compact Grid
    'option-4': '📊',  // Dashboard Pro
    'option-5': '🔷',  // Asymmetric Modern
    'option-6': '🎯',  // Card Header
    'option-7': '▭',   // Minimal Dividers
    'option-8': '⚬',   // Inline Compact
    'option-9': '🃏',  // Traditional Card
    'option-10': '◧'   // Split Layout
};

const DEFAULT_LAYOUT = 'option-1';

/**
 * Initialize layout system
 * Loads layout from localStorage or defaults to 'option-1'
 */
export function initLayout() {
    // Try to load saved layout
    const savedLayout = localStorage.getItem(LAYOUT_KEY);

    // Use saved layout, otherwise default
    const layout = savedLayout && LAYOUTS.includes(savedLayout) ? savedLayout : DEFAULT_LAYOUT;

    // Apply layout
    setLayout(layout);

    // Setup click handler
    const toggleButton = document.getElementById('layout-toggle');
    if (toggleButton) {
        toggleButton.addEventListener('click', toggleLayout);
    }
}

/**
 * Cycle to next layout
 */
export function toggleLayout() {
    const current = getCurrentLayout();
    const currentIndex = LAYOUTS.indexOf(current);
    const nextIndex = (currentIndex + 1) % LAYOUTS.length;
    const next = LAYOUTS[nextIndex];

    setLayout(next);
    localStorage.setItem(LAYOUT_KEY, next);
}

/**
 * Set layout
 * @param {string} layout - Layout to set ('option-1' through 'option-10')
 */
export function setLayout(layout) {
    // Validate layout
    if (!LAYOUTS.includes(layout)) {
        console.warn(`Invalid layout: ${layout}, defaulting to ${DEFAULT_LAYOUT}`);
        layout = DEFAULT_LAYOUT;
    }

    // Apply layout to body
    document.body.setAttribute('data-card-layout', layout);

    // Update layout icon
    updateLayoutIcon(layout);

    // Dispatch custom event for other components
    window.dispatchEvent(new CustomEvent('layoutchange', {
        detail: { layout }
    }));
}

/**
 * Get current layout
 * @returns {string} Current layout
 */
export function getCurrentLayout() {
    return document.body.getAttribute('data-card-layout') || DEFAULT_LAYOUT;
}

/**
 * Update layout toggle button icon
 * @param {string} layout - Current layout
 */
function updateLayoutIcon(layout) {
    const icon = document.querySelector('.layout-icon');
    if (icon) {
        // Show icon based on current layout
        icon.textContent = LAYOUT_ICONS[layout] || '⚡';

        // Update aria-label for accessibility
        const button = document.getElementById('layout-toggle');
        if (button) {
            const currentIndex = LAYOUTS.indexOf(layout);
            const nextIndex = (currentIndex + 1) % LAYOUTS.length;
            const nextLayout = LAYOUTS[nextIndex];
            button.setAttribute('aria-label', `Switch to ${LAYOUT_NAMES[nextLayout]}`);
            button.setAttribute('title', `Layout: ${LAYOUT_NAMES[layout]}`);
        }
    }
}

/**
 * Get all available layouts
 * @returns {Array} Array of layout names
 */
export function getAvailableLayouts() {
    return [...LAYOUTS];
}

/**
 * Clear saved layout preference
 * Will revert to default layout
 */
export function clearLayoutPreference() {
    localStorage.removeItem(LAYOUT_KEY);
    setLayout(DEFAULT_LAYOUT);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLayout);
} else {
    initLayout();
}
