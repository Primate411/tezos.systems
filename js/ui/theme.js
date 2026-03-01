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
    const existingModal = document.getElementById('first-visit-modal');
    if (existingModal) existingModal.remove();

    const features = [
        { cat: 'Network Intelligence', icon: '\u{1F4E1}', items: [
            { name: 'Live Stats', desc: '18 real-time metrics across economy, consensus, market, protocol, and network' },
            { name: 'Protocol Timeline', desc: '21 upgrades visualized — tap any to see its impact on the network' },
            { name: 'Daily Briefing', desc: 'Auto-generated narrative summary that updates every cycle' },
            { name: 'Cycle Pulse', desc: 'Live cycle progress with block-by-block chain health monitoring' },
        ]},
        { cat: 'Your Portfolio', icon: '\u{1F4BC}', items: [
            { name: 'My Tezos', desc: 'Enter your address \u2014 see your baker, rewards, delegation, and .tez domain' },
            { name: 'Rewards Tracker', desc: 'This-cycle earnings, lifetime totals, 30-cycle heatmap, baker efficiency' },
            { name: 'Staking Calculator', desc: 'Estimate your staking and baking returns with live APY data' },
        ]},
        { cat: 'Market & Discovery', icon: '\u{1F50D}', items: [
            { name: 'Price Intelligence', desc: 'Per-cycle prediction game, price alerts, and market context' },
            { name: 'Chain Comparison', desc: 'Tezos vs Ethereum, Solana, Cardano, Algorand \u2014 live side-by-side data' },
            { name: 'Baker Leaderboard', desc: 'Top bakers ranked by staking power and operational efficiency' },
        ]},
        { cat: 'On-Chain Stories', icon: '\u{1F4D6}', items: [
            { name: 'Whale Tracker', desc: 'Live feed of transfers over 1,000 XTZ \u2014 see the big moves as they happen' },
            { name: 'Sleeping Giants', desc: 'Dormant wallets waking up after months or years of silence' },
            { name: 'NFT Profile', desc: 'Your Objkt.com creator and collector stats, beautifully rendered' },
        ]},
        { cat: 'The Vibes', icon: '\u{2728}', items: [
            { name: '7 Themes', desc: 'Matrix, Dark, Clean, Bubblegum, Void, Ember, Signal \u2014 three with live animations' },
            { name: 'Social Sharing', desc: 'Per-card screenshots with 767 pre-written tweets ready to share' },
            { name: 'Arcade Mode', desc: 'Konami code unlocks it. Easter eggs hidden everywhere.' },
        ]},
    ];

    // Build feature sections HTML
    let featuresHTML = '';
    features.forEach(function(cat) {
        let itemsHTML = '';
        cat.items.forEach(function(item) {
            itemsHTML += '<div class="fv-feature-item"><div class="fv-feature-name">' + item.name + '</div><div class="fv-feature-desc">' + item.desc + '</div></div>';
        });
        featuresHTML += '<div class="fv-feature-cat"><div class="fv-cat-header"><span class="fv-cat-icon">' + cat.icon + '</span><span class="fv-cat-name">' + cat.cat + '</span></div><div class="fv-cat-items">' + itemsHTML + '</div></div>';
    });

    // Build theme cards
    let themeCardsHTML = '';
    THEMES.forEach(function(theme) {
        themeCardsHTML += '<div class="theme-card" data-theme="' + theme + '">' +
            '<div class="theme-preview" style="background: ' + THEME_COLORS[theme].bg + ';">' +
            '<div class="theme-accent" style="background: ' + THEME_COLORS[theme].accent + ';"></div></div>' +
            '<span class="theme-name">' + capitalizeTheme(theme) + '</span>' +
            '<span class="theme-tagline">' + THEME_VIBES[theme].tagline + '</span></div>';
    });

    const modalHTML = '<div id="first-visit-modal" class="first-visit-modal fv-landing">' +
        '<div class="first-visit-modal-backdrop"></div>' +
        '<div class="first-visit-modal-content fv-scroll">' +

        // Section 1: Hero
        '<section class="fv-hero">' +
        '<h1 class="hero-title">The Bloomberg Terminal<br>for Tezos</h1>' +
        '<p class="hero-subtitle">Free. Real-time. Beautiful.</p>' +
        '<button class="fv-enter-btn" id="fv-enter-top">Enter Dashboard \u2192</button>' +
        '<div class="fv-scroll-hint">\u2193 See what\'s inside</div>' +
        '</section>' +

        // Section 2: Live Proof
        '<section class="fv-live">' +
        '<div class="fv-live-grid">' +
        '<div class="fv-live-card"><div class="fv-live-value" id="fv-price">$\u2014</div><div class="fv-live-label">XTZ Price</div></div>' +
        '<div class="fv-live-card"><div class="fv-live-value" id="fv-staked">\u2014</div><div class="fv-live-label">Staked</div></div>' +
        '<div class="fv-live-card"><div class="fv-live-value" id="fv-bakers">\u2014</div><div class="fv-live-label">Active Bakers</div></div>' +
        '<div class="fv-live-card"><div class="fv-live-value" id="fv-cycle">\u2014</div><div class="fv-live-label">Current Cycle</div></div>' +
        '</div></section>' +

        // Section 3: Features
        '<section class="fv-features">' +
        '<h2 class="fv-section-title">18+ Features. Zero Clutter.</h2>' +
        '<p class="fv-section-sub">Toggle what you need. Hide what you don\'t.</p>' +
        '<div class="fv-features-grid">' + featuresHTML + '</div>' +
        '</section>' +

        // Section 4: Theme Picker
        '<section class="fv-themes">' +
        '<h2 class="fv-section-title">Choose Your Vibe</h2>' +
        '<div class="theme-grid">' + themeCardsHTML + '</div>' +
        '</section>' +

        // Section 5: Final CTA
        '<section class="fv-final">' +
        '<button class="fv-enter-btn fv-enter-big" id="fv-enter-bottom">Enter Dashboard \u2192</button>' +
        '<div class="fv-compare-links">' +
        '<a href="/compare/tezos-vs-ethereum.html">Tezos vs Ethereum</a>' +
        '<a href="/compare/tezos-vs-solana.html">Tezos vs Solana</a>' +
        '<a href="/compare/tezos-vs-cardano.html">Tezos vs Cardano</a>' +
        '<a href="/compare/tezos-vs-algorand.html">Tezos vs Algorand</a>' +
        '</div></section>' +

        '</div></div>';

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const modal = document.getElementById('first-visit-modal');

    // Fetch live data for the proof section
    fetchLandingData();

    // Theme card clicks
    modal.querySelectorAll('.theme-card').forEach(function(card) {
        card.addEventListener('click', function() {
            var theme = card.dataset.theme;
            setTheme(theme);
            localStorage.setItem(THEME_KEY, theme);
            // Visual feedback
            modal.querySelectorAll('.theme-card').forEach(function(c) { c.classList.remove('selected'); });
            card.classList.add('selected');
        });
    });

    // Enter buttons
    function enterDashboard() {
        if (!localStorage.getItem(THEME_KEY)) {
            localStorage.setItem(THEME_KEY, DEFAULT_THEME);
        }
        modal.classList.add('closing');
        setTimeout(function() { modal.remove(); }, 300);
    }
    var topBtn = document.getElementById('fv-enter-top');
    var bottomBtn = document.getElementById('fv-enter-bottom');
    if (topBtn) topBtn.addEventListener('click', enterDashboard);
    if (bottomBtn) bottomBtn.addEventListener('click', enterDashboard);
}

async function fetchLandingData() {
    try {
        var [head, price] = await Promise.all([
            fetch('https://api.tzkt.io/v1/head').then(function(r) { return r.json(); }),
            fetch('https://api.coingecko.com/api/v3/simple/price?ids=tezos&vs_currencies=usd').then(function(r) { return r.json(); }),
        ]);
        var priceEl = document.getElementById('fv-price');
        var stakedEl = document.getElementById('fv-staked');
        var bakersEl = document.getElementById('fv-bakers');
        var cycleEl = document.getElementById('fv-cycle');
        if (priceEl && price.tezos) priceEl.textContent = '$' + price.tezos.usd.toFixed(3);
        if (stakedEl && head.stakingPercentage) stakedEl.textContent = head.stakingPercentage.toFixed(1) + '%';
        if (bakersEl && head.activeBakers) bakersEl.textContent = head.activeBakers;
        if (cycleEl && head.cycle) cycleEl.textContent = 'C' + head.cycle;
    } catch(e) {
        console.warn('Landing data fetch failed:', e);
    }
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