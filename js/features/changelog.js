/**
 * Changelog Modal
 * Displays version history and updates
 */

const CHANGELOG = [
    {
        date: '2026-02-28',
        entries: [
            { type: '🔧', text: 'Corrected ETH staking concentration copy: ~5–7 entities for 50% (Lido ~23%), not ~2' },
            { type: '🔧', text: 'Fixed Chain Comparison live Tezos values when Stats section is collapsed — staking and issuance now populate on initial load' },
            { type: '🔧', text: 'Comparison cards now treat 0 as a valid numeric value instead of rendering em dash' },
            { type: '🔧', text: 'Fixed clipboard copy on desktop — images now copy reliably (Promise-based ClipboardItem preserves user gesture)' },
        ]
    },
    {
        date: '2026-02-27',
        entries: [
            { type: '✨', text: 'Nav redesign — clean header: 👤 My Tezos | 🧩 Features | ⚙️ | Stake ↗ | Bake ↗' },
            { type: '✨', text: 'Living Uptime Clock — real-time ticking counter (2,720d+), block pulse with heartbeat animation, network status dot' },
            { type: '✨', text: 'Block updates via TzC RPC (eu.rpc.tez.capital) — real-time every 6s, dot turns red if stale >18s' },
            { type: '✨', text: 'Baker Report Card — shareable monthly performance summary with letter grades (A+ to F), rank, stats, PNG export' },
            { type: '🔧', text: 'Killed "Compare" button confusion — chain comparison is now a toggleable section ("Chains" in Features), defaults visible' },
            { type: '🔧', text: 'Features & Settings split into separate dropdowns (features toggle content, settings configure)' },
            { type: '🔧', text: 'My Baker section renamed to My Tezos — unified personalization branding' },
            { type: '🔧', text: 'Removed redundant badges (Stake-o-meter gauge, Zero Forks, Days Live) — data now in uptime clock' },
            { type: '🔧', text: 'Removed price bar network pulse indicator — uptime clock dot is the sole liveness indicator' },
            { type: '🔧', text: 'Fixed Last Cycle rewards showing "—" — updated to Tallinn-era TzKT field names' },
            { type: '🔧', text: 'Fixed Leaderboard toggle always appearing active when off' },
            { type: '🔧', text: 'Fixed header button spacing and Compare emoji rendering' },
            { type: '🎨', text: 'Uptime clock glass-morphism box with theme-aware colors (all 7 themes)' },
            { type: '🎨', text: 'Fixed-width counter digits — no more layout shift on tick' },
            { type: '🎨', text: 'My Tezos connected state: subtle inner glow instead of underline' },
            { type: '🎨', text: 'Tighter upgrade section proportions — reduced height, better column balance' },
        ]
    },
    {
        date: '2026-02-26',
        entries: [
            { type: '⚡', text: 'Chart.js now loads with defer — no longer blocks initial render' },
            { type: '⚡', text: 'Critical JS modules preloaded in parallel (modulepreload) — faster startup' },
            { type: '⚡', text: 'Sparkline refresh skipped when tab is backgrounded — fewer wasted API calls' },
            { type: '🔧', text: 'Protocol timeline tooltips now match theme after switching (no longer stale)' },
            { type: '✨', text: 'Offline mode — Service Worker caches the dashboard for instant loads and offline viewing' },
            { type: '✨', text: 'URL deep-linking — share links like #my-baker=tz1..., #compare, #theme=void, #history' },
            { type: '✨', text: 'Keyboard shortcuts — press ? for the full list (r=refresh, t=theme, m=baker, h=history…)' },
            { type: '⚡', text: 'Baker fetch optimized — uses /count + select=address (saves ~2-5MB per load)' },
            { type: '⚡', text: 'CSS minified — 230KB → 159KB (31% smaller)' },
            { type: '⚡', text: 'Theme fonts lazy-loaded — only Orbitron blocks initial render now' },
            { type: '⚡', text: 'Images optimized to WebP — OG image 277KB → 57KB, icons 117KB → 19KB' },
            { type: '🔒', text: 'Fixed GraphQL injection in .tez domain resolver — now uses parameterized variables' },
            { type: '🔒', text: 'Protocol history modal now escapes all interpolated data (XSS prevention)' },
            { type: '🔧', text: 'Whale tracker and Sleeping Giants polling now pauses when tab is backgrounded' },
            { type: '🔧', text: 'Fixed duplicate sparkline rendering on initial page load' },
            { type: '🔧', text: 'Fixed mainnet launch date: Sep 17, 2018 (was incorrectly using Jun 30 fundraiser date)' },
            { type: '✨', text: 'Mobile Overview tab now shows headline metrics (Bakers, APY, Staked, Transactions)' },
            { type: '✨', text: 'Offline indicator banner when network is unavailable' },
            { type: '🎨', text: 'Loading shimmer animation on stat cards instead of static "..."' },
            { type: '✨', text: 'Keyboard shortcuts accessible from ⚙️ Settings → ⌨️ Shortcuts (discoverable on mobile too)' },
            { type: '✨', text: 'Protocol timeline now shows year labels under key upgrade letters for at-a-glance context' },
            { type: '🔧', text: 'Clarified ETH comparison: "2 entities control 50% of stake" (was misleading)' },
            { type: '⚡', text: 'Removed cache-buster on tweets.json fetch — now properly cached by Service Worker' },
            { type: '🔧', text: 'Aligned dead price refresh config to 30min (matching actual cache TTL)' },
            { type: '🔧', text: 'Meta description no longer hardcodes stale baker counts — now generic' },
            { type: '🔧', text: 'Cycle time now fetched from RPC constants instead of hardcoded 6s' },
            { type: '⚡', text: 'Deduplicated TzKT statistics endpoint — 4 concurrent calls reduced to 1' },
            { type: '⚡', text: 'TzKT 429 rate-limit detection with exponential backoff' },
            { type: '✨', text: '"Zero Forks" badge now shows the exact fork-free day count' },
            { type: '✨', text: 'Governance countdown banner — shows active voting periods prominently' },
            { type: '✨', text: 'Network health pulse — green/yellow/red dot showing if blocks are on schedule' },
            { type: '✨', text: 'Data export — download all stats as JSON or CSV from ⚙️ → 📥 Export' },
            { type: '✨', text: 'Branded 404 page — "This block was never baked"' },
            { type: '🎨', text: 'Mobile tab labels shortened on small screens (Gov, Eco) to prevent clipping' },
        ]
    },
    {
        date: '2026-02-16',
        entries: [
            { type: '✨', text: 'Changelog — view full site history from ⚙️ settings' },
            { type: '✨', text: 'Per-card historical charts — click 📊 on any card with a sparkline' },
            { type: '🔧', text: 'My Baker: Fixed missed stats — now shows actual missed blocks/attestations for cycle and lifetime' },
            { type: '🔧', text: 'My Baker: Deferred missed rights API calls to avoid TzKT rate limiting (429s)' },
            { type: '✨', text: 'Added LB (Liquid Baking) to issuance card' },
        ]
    },
    {
        date: '2026-02-15',
        entries: [
            { type: '🔧', text: 'Fixed mobile view layout issues' },
        ]
    },
    {
        date: '2026-02-12',
        entries: [
            { type: '✨', text: 'Network Moments — dismissable highlights at the top' },
            { type: '✨', text: 'Hero section redesign' },
            { type: '✨', text: 'Search engine and agent discovery optimization' },
            { type: '✨', text: 'Hotstream & "since last visit" theme elements' },
            { type: '🎨', text: 'Bubblegum theme added' },
            { type: '🎨', text: 'Title rework and formatting improvements' },
            { type: '🎨', text: 'Better theme picker and README update' },
            { type: '✨', text: 'Feedback/contribute link added' },
            { type: '🎨', text: 'Card footers and simple design cleanup' },
            { type: '✨', text: 'New OG image for social sharing' },
            { type: '🔧', text: 'Fix historical data sharing' },
            { type: '🔧', text: 'Fix sparklines color across themes' },
            { type: '✨', text: 'New favicon' },
        ]
    },
    {
        date: '2026-02-11',
        entries: [
            { type: '✨', text: 'Price ticker moved to top' },
            { type: '✨', text: 'Staker/delegator capacity bars on My Baker' },
            { type: '✨', text: 'Pulse indicators on Giants & Whales' },
            { type: '✨', text: 'Attestation rate and DAL participation via Octez RPC' },
            { type: '✨', text: 'Bake & Stake action buttons in nav' },
            { type: '🎨', text: 'More themes: Dark, Clean, Void, Ember, Signal' },
            { type: '✨', text: 'My Baker: .tez domain resolution' },
            { type: '✨', text: 'My Baker expanded with baker estimated payments' },
            { type: '✨', text: 'Rewards calculator split out as separate feature' },
            { type: '✨', text: 'OG image for social media previews' },
            { type: '🔧', text: 'Mobile screenshot and gap fixes' },
            { type: '🎨', text: 'Mobile-specific info buttons and AI explanation on Stake-o-meter' },
        ]
    },
    {
        date: '2026-02-10',
        entries: [
            { type: '✨', text: 'My Baker lookup, Rewards Calculator, and How Tezos Compares section' },
            { type: '✨', text: 'Stake-o-meter gauge, price display, and hot streak counter' },
            { type: '✨', text: 'Social sharing with contentious protocol tweet cards' },
            { type: '✨', text: 'Sparkline bragging rights' },
            { type: '🔒', text: 'Security audit: escapeHtml, parameterized GraphQL, CSP tuning' },
            { type: '🔧', text: 'Fix APY calculation' },
            { type: '🔧', text: 'Fix favicon and mini whales display' },
            { type: '⚡', text: 'API rate limiting improvements' },
        ]
    },
    {
        date: '2026-02-09',
        entries: [
            { type: '✨', text: 'Historical data charts with full modal view' },
            { type: '✨', text: 'Sparklines on all stat cards with trend arrows' },
            { type: '✨', text: 'Protocol upgrade history timeline' },
            { type: '✨', text: 'Ultra mode with sound effects' },
            { type: '✨', text: 'Sleeping Giants tracker' },
            { type: '✨', text: '"Start Baking" banner' },
            { type: '🎨', text: 'Matrix theme set as default' },
            { type: '⚡', text: 'Data caching and "since last visit" tracking' },
            { type: '🔧', text: 'Mobile view and whale watch fixes' },
            { type: '✨', text: '7-day % change on trendlines' },
        ]
    },
    {
        date: '2026-02-08',
        entries: [
            { type: '✨', text: 'Historical data collection system' },
            { type: '🔧', text: 'Fix tz4 counting — use consensus keys, not addresses' },
            { type: '🔧', text: 'Switch to TzKT API with multiple RPC fallbacks' },
            { type: '🔧', text: 'Use tez.capital RPCs for reliability' },
        ]
    },
    {
        date: '2026-02-07',
        entries: [
            { type: '🎨', text: 'Matrix visual theme introduced' },
        ]
    },
    {
        date: '2026-01-31',
        entries: [
            { type: '✨', text: 'Updated for 6-second blocks (Tallinn protocol)' },
            { type: '✨', text: 'Arcade effects added' },
        ]
    },
    {
        date: '2026-01-14',
        entries: [
            { type: '✨', text: 'Major expansion: 5 sections, 18 stats' },
            { type: '✨', text: 'Hover tooltips for all metrics' },
            { type: '✨', text: 'Light mode toggle' },
            { type: '🎨', text: 'Premium glassmorphism redesign' },
            { type: '🔧', text: 'Fix issuance calculation and tz4 adoption targets' },
            { type: '⚡', text: '15-minute auto-refresh' },
        ]
    },
    {
        date: '2026-01-13',
        entries: [
            { type: '✨', text: 'Initial launch — Tezos Statistics Dashboard' },
        ]
    },
];

/**
 * Format date for display (e.g., "February 16, 2026")
 */
function formatDate(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
}

/**
 * Render changelog entries into the modal
 */
function renderChangelog() {
    const body = document.getElementById('changelog-body');
    if (!body) return;

    let html = '';
    
    for (const section of CHANGELOG) {
        html += `
            <div class="changelog-section">
                <div class="changelog-date">${formatDate(section.date)}</div>
                <ul class="changelog-entries">
        `;
        
        for (const entry of section.entries) {
            html += `
                    <li class="changelog-entry">
                        <span class="changelog-type">${entry.type}</span>
                        <span class="changelog-text">${entry.text}</span>
                    </li>
            `;
        }
        
        html += `
                </ul>
            </div>
        `;
    }
    
    body.innerHTML = html;
}

/**
 * Open the changelog modal
 */
function openChangelog() {
    const modal = document.getElementById('changelog-modal');
    if (!modal) return;
    
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
}

/**
 * Close the changelog modal
 */
function closeChangelog() {
    const modal = document.getElementById('changelog-modal');
    if (!modal) return;
    
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
}

/**
 * Initialize changelog modal and button
 */
export function initChangelog() {
    // Render the changelog content
    renderChangelog();
    
    // Get DOM elements
    const button = document.getElementById('changelog-btn');
    const modal = document.getElementById('changelog-modal');
    const closeBtn = modal?.querySelector('.changelog-modal-close');
    const backdrop = modal?.querySelector('.changelog-modal-backdrop');
    
    // Open modal when button is clicked
    if (button) {
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            openChangelog();
        });
    }
    
    // Close modal with close button
    if (closeBtn) {
        closeBtn.addEventListener('click', closeChangelog);
    }
    
    // Close modal with backdrop click
    if (backdrop) {
        backdrop.addEventListener('click', closeChangelog);
    }
    
    // Close modal with ESC key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal?.getAttribute('aria-hidden') === 'false') {
            closeChangelog();
        }
    });
}
