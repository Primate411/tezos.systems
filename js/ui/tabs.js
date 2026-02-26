/**
 * Mobile Swipeable Tabs
 * Horizontal tab navigation for mobile devices
 */

const TABS = [
    { id: 'overview', label: 'Overview', shortLabel: 'Overview', icon: '📊' },
    { id: 'consensus', label: 'Consensus', shortLabel: 'Consensus', icon: '🔗' },
    { id: 'economy', label: 'Economy', shortLabel: 'Economy', icon: '💰' },
    { id: 'governance', label: 'Governance', shortLabel: 'Gov', icon: '🗳️' },
    { id: 'network', label: 'Network', shortLabel: 'Network', icon: '⚡' },
    { id: 'ecosystem', label: 'Ecosystem', shortLabel: 'Eco', icon: '🌐' }
];

let currentTab = 0;
let touchStartX = 0;
let touchEndX = 0;
let isMobile = false;

/**
 * Check if we're in mobile view
 */
function checkMobile() {
    return window.innerWidth < 768;
}

/**
 * Create tab navigation UI
 */
function createTabNav() {
    const nav = document.createElement('nav');
    nav.className = 'mobile-tabs';
    nav.setAttribute('aria-label', 'Content sections');
    
    const tabList = document.createElement('div');
    tabList.className = 'tab-list';
    tabList.setAttribute('role', 'tablist');
    
    TABS.forEach((tab, index) => {
        const button = document.createElement('button');
        button.className = `tab-button${index === 0 ? ' active' : ''}`;
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-selected', index === 0);
        button.setAttribute('data-tab', tab.id);
        const displayLabel = window.innerWidth < 400 ? tab.shortLabel : tab.label;
        button.innerHTML = `<span class="tab-icon">${tab.icon}</span><span class="tab-label">${displayLabel}</span>`;
        button.addEventListener('click', () => switchTab(index));
        tabList.appendChild(button);
    });
    
    nav.appendChild(tabList);
    
    // Insert after header
    const header = document.querySelector('.header');
    if (header) {
        header.after(nav);
    }
    
    return nav;
}

/**
 * Create mobile overview summary with headline metrics
 */
function createOverviewSummary() {
    const existing = document.getElementById('mobile-overview-summary');
    if (existing) return;

    const summary = document.createElement('div');
    summary.id = 'mobile-overview-summary';
    summary.className = 'mobile-overview-summary';
    summary.innerHTML = `
        <div class="overview-metric">
            <div class="overview-metric-label">Bakers</div>
            <div class="overview-metric-value" id="overview-bakers">...</div>
        </div>
        <div class="overview-metric">
            <div class="overview-metric-label">Staking APY</div>
            <div class="overview-metric-value" id="overview-apy">...</div>
        </div>
        <div class="overview-metric">
            <div class="overview-metric-label">Staked</div>
            <div class="overview-metric-value" id="overview-staked">...</div>
        </div>
        <div class="overview-metric">
            <div class="overview-metric-label">Transactions</div>
            <div class="overview-metric-value" id="overview-txns">...</div>
        </div>
    `;

    // Insert after the upgrade clock section
    const upgradeSection = document.getElementById('upgrade-clock');
    if (upgradeSection) {
        upgradeSection.after(summary);
        summary.setAttribute('data-tab-panel', 'overview');
    }
}

/**
 * Update mobile overview summary with live data
 */
export function updateOverviewSummary(stats) {
    if (!stats) return;
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('overview-bakers', stats.totalBakers?.toLocaleString() || '...');
    set('overview-apy', stats.stakeAPY ? `${stats.stakeAPY.toFixed(1)}%` : '...');
    set('overview-staked', stats.stakingRatio ? `${stats.stakingRatio.toFixed(1)}%` : '...');
    set('overview-txns', stats.transactions ? (stats.transactions >= 1000 ? `${(stats.transactions / 1000).toFixed(1)}K` : stats.transactions.toString()) : '...');
}

/**
 * Wrap sections for tabbed view
 */
function setupSections() {
    const main = document.querySelector('.main-content');
    const upgradeSection = document.getElementById('upgrade-clock');
    
    // Add data-tab attributes to sections
    if (upgradeSection) {
        upgradeSection.setAttribute('data-tab-panel', 'overview');
    }
    
    // Map section titles to tab IDs explicitly to avoid index mismatches
    // when non-dashboard sections (Moments, Compares, etc.) are present
    const titleToTab = {
        'Consensus':        'consensus',
        'Economy':          'economy',
        'Governance':       'governance',
        'Network Activity': 'network',
        'Ecosystem':        'ecosystem'
    };
    
    const sections = main.querySelectorAll('.stats-section');
    sections.forEach(section => {
        const titleEl = section.querySelector('.section-title');
        if (!titleEl) return;
        // Strip emoji and collapse markers (▾) to get clean title
        const clean = titleEl.textContent.replace(/[^\w\s]/g, '').trim();
        const tabId = Object.keys(titleToTab).find(key => clean.includes(key));
        if (tabId) {
            section.setAttribute('data-tab-panel', titleToTab[tabId]);
        }
    });
}

/**
 * Switch to a specific tab
 */
function switchTab(index, animate = true) {
    if (index < 0 || index >= TABS.length) return;
    if (index === currentTab && animate) return;
    
    const direction = index > currentTab ? 'left' : 'right';
    currentTab = index;
    
    // Set active tab on body for CSS targeting
    document.body.setAttribute('data-active-tab', TABS[index].id);
    
    // Update tab buttons
    document.querySelectorAll('.tab-button').forEach((btn, i) => {
        btn.classList.toggle('active', i === index);
        btn.setAttribute('aria-selected', i === index);
    });
    
    // Scroll active tab into view
    const activeTab = document.querySelector('.tab-button.active');
    if (activeTab) {
        activeTab.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
    
    // Show/hide sections
    const allPanels = document.querySelectorAll('[data-tab-panel]');
    allPanels.forEach(panel => {
        const tabId = panel.getAttribute('data-tab-panel');
        const isActive = tabId === TABS[index].id;
        
        if (animate && isActive) {
            panel.classList.add('tab-entering');
            panel.classList.add(`slide-from-${direction}`);
        }
        
        panel.classList.toggle('tab-active', isActive);
        panel.classList.toggle('tab-hidden', !isActive);
        
        if (animate && isActive) {
            requestAnimationFrame(() => {
                panel.classList.remove('tab-entering', 'slide-from-left', 'slide-from-right');
            });
        }
    });
    
    // Scroll to top of content
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Handle touch start
 */
function handleTouchStart(e) {
    touchStartX = e.touches[0].clientX;
}

/**
 * Handle touch end and detect swipe
 */
function handleTouchEnd(e) {
    touchEndX = e.changedTouches[0].clientX;
    handleSwipe();
}

/**
 * Process swipe gesture
 */
function handleSwipe() {
    const swipeThreshold = 50;
    const diff = touchStartX - touchEndX;
    
    if (Math.abs(diff) < swipeThreshold) return;
    
    if (diff > 0 && currentTab < TABS.length - 1) {
        // Swipe left - next tab
        switchTab(currentTab + 1);
    } else if (diff < 0 && currentTab > 0) {
        // Swipe right - previous tab
        switchTab(currentTab - 1);
    }
}

/**
 * Enable/disable mobile tabs based on viewport
 */
function toggleMobileMode() {
    const wasMobile = isMobile;
    isMobile = checkMobile();
    
    const nav = document.querySelector('.mobile-tabs');
    const body = document.body;
    
    if (isMobile && !wasMobile) {
        // Entering mobile mode
        body.classList.add('mobile-tabs-active');
        if (nav) nav.style.display = 'block';
        switchTab(currentTab, false);
    } else if (!isMobile && wasMobile) {
        // Exiting mobile mode
        body.classList.remove('mobile-tabs-active');
        if (nav) nav.style.display = 'none';
        
        // Show all sections
        document.querySelectorAll('[data-tab-panel]').forEach(panel => {
            panel.classList.remove('tab-active', 'tab-hidden');
        });
    }
}

/**
 * Initialize mobile tabs
 */
export function initTabs() {
    // Create navigation
    createTabNav();
    
    // Setup section attributes
    setupSections();

    // Create mobile overview summary
    createOverviewSummary();
    
    // Check initial state
    toggleMobileMode();
    
    // Listen for resize
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(toggleMobileMode, 100);
    });
    
    // Touch events for swipe
    const main = document.querySelector('.main-content');
    const upgradeSection = document.getElementById('upgrade-clock');
    
    [main, upgradeSection].forEach(el => {
        if (el) {
            el.addEventListener('touchstart', handleTouchStart, { passive: true });
            el.addEventListener('touchend', handleTouchEnd, { passive: true });
        }
    });
    
    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
        if (!isMobile) return;
        
        if (e.key === 'ArrowLeft' && currentTab > 0) {
            switchTab(currentTab - 1);
        } else if (e.key === 'ArrowRight' && currentTab < TABS.length - 1) {
            switchTab(currentTab + 1);
        }
    });
}

export { TABS, switchTab };
