/**
 * Dynamic Page Title — rotates key stats in document.title
 */

const FALLBACK_TITLE = 'Tezos Systems — Real-time Network Dashboard';
const PREFIX = 'Tezos Systems';
const ROTATE_INTERVAL = 10000; // 10 seconds

let rotateTimer = null;
let currentIndex = 0;
let currentVariants = [];
let routeTitle = document.documentElement.hasAttribute('data-chamber-boot') ? document.title : '';

function ensureTitleRotation() {
    if (rotateTimer || currentVariants.length <= 1) return;
    rotateTimer = setInterval(() => {
        if (routeTitle) {
            document.title = routeTitle;
            return;
        }
        currentIndex = (currentIndex + 1) % currentVariants.length;
        document.title = currentVariants[currentIndex];
    }, ROTATE_INTERVAL);
}

/**
 * Hold a destination title while a routed room is open. Dynamic telemetry can
 * keep refreshing underneath, but it must not rename browser-history entries.
 */
export function setPageTitleRoute(title = '', fallbackTitle = FALLBACK_TITLE) {
    routeTitle = String(title || '').trim();
    if (routeTitle) {
        document.title = routeTitle;
        return;
    }
    document.title = currentVariants[currentIndex % Math.max(1, currentVariants.length)]
        || fallbackTitle
        || FALLBACK_TITLE;
    ensureTitleRotation();
}

/**
 * Build an array of title strings from current stats
 */
function buildTitleVariants(stats) {
    if (!stats || !Object.keys(stats).length) return [];

    const variants = [];

    // Variant 1: Bakers + Staking
    const parts1 = [];
    if (stats.totalBakers) parts1.push(`${stats.totalBakers} Bakers`);
    if (stats.stakingRatio) parts1.push(`${stats.stakingRatio.toFixed(1)}% Staked`);
    if (parts1.length) variants.push(`${PREFIX} | ${parts1.join(' | ')}`);

    // Variant 2: Issuance + APY
    const parts2 = [];
    if (stats.currentIssuanceRate) parts2.push(`${stats.currentIssuanceRate.toFixed(2)}% Issuance`);
    if (stats.stakeAPY) parts2.push(`${stats.stakeAPY.toFixed(1)}% Stake APY`);
    if (parts2.length) variants.push(`${PREFIX} | ${parts2.join(' | ')}`);

    // Variant 3: Network activity
    const parts3 = [];
    if (stats.fundedAccounts) parts3.push(`${(stats.fundedAccounts / 1000).toFixed(0)}K Accounts`);
    if (stats.contractCalls24h) parts3.push(`${(stats.contractCalls24h / 1000).toFixed(1)}K Calls/24h`);
    if (parts3.length) variants.push(`${PREFIX} | ${parts3.join(' | ')}`);

    // Variant 4: Cycle + tz4 adoption
    const parts4 = [];
    if (stats.cycle) parts4.push(`Cycle ${stats.cycle}`);
    if (stats.tz4Percentage) parts4.push(`tz4: ${stats.tz4Percentage.toFixed(1)}%`);
    if (parts4.length) variants.push(`${PREFIX} | ${parts4.join(' | ')}`);

    return variants;
}

/**
 * Start rotating the page title using current stats.
 * Call this after each stats update.
 */
export function updatePageTitle(stats) {
    const variants = buildTitleVariants(stats);
    currentVariants = variants;

    // Clear old timer before any early return so route-title ownership is
    // deterministic even when a refresh is empty or partial.
    if (rotateTimer) clearInterval(rotateTimer);
    rotateTimer = null;

    if (routeTitle) {
        document.title = routeTitle;
        return;
    }
    if (!variants.length) {
        document.title = FALLBACK_TITLE;
        return;
    }

    // Set immediately
    document.title = variants[0];
    currentIndex = 0;

    // Only rotate if multiple variants
    ensureTitleRotation();
}
