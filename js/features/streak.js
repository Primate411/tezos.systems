/**
 * Tezos Systems - Visit Streak Counter
 * Tracks consecutive daily visits using localStorage
 */

const STORAGE_KEY_COUNT = 'tezos_streak_count';
const STORAGE_KEY_LAST = 'tezos_streak_last_visit';
const MILESTONES = new Set([7, 14, 30, 60, 100, 365]);

/**
 * Get today's date string in user's local timezone (YYYY-MM-DD)
 */
function getToday() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * Get yesterday's date string in user's local timezone
 */
function getYesterday() {
    const now = new Date();
    now.setDate(now.getDate() - 1);
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * Calculate and update the streak, returns { count, isNew }
 */
function updateStreak() {
    const today = getToday();
    const lastVisit = localStorage.getItem(STORAGE_KEY_LAST);
    let count = parseInt(localStorage.getItem(STORAGE_KEY_COUNT), 10) || 0;
    let isNew = false;

    if (!lastVisit) {
        // First ever visit
        isNew = true;
        count = 1;
    } else if (lastVisit === today) {
        // Same day revisit — no change
        return { count, isNew: false };
    } else if (lastVisit === getYesterday()) {
        // Consecutive day
        count += 1;
    } else {
        // Missed a day — reset
        count = 1;
    }

    localStorage.setItem(STORAGE_KEY_COUNT, count);
    localStorage.setItem(STORAGE_KEY_LAST, today);
    return { count, isNew };
}

/**
 * Format the streak text
 */
function formatStreak(count) {
    return `🔥 ${count} day${count !== 1 ? ' streak' : ''}`;
}

/**
 * Create and display the streak badge
 */
export function initStreak() {
    const { count, isNew } = updateStreak();

    const badge = document.createElement('div');
    badge.className = 'streak-badge';
    if (MILESTONES.has(count)) {
        badge.classList.add('milestone');
    }

    if (isNew) {
        badge.textContent = 'Welcome! 👋';
        document.body.appendChild(badge);
        // Animate in
        requestAnimationFrame(() => badge.classList.add('visible'));
        // Switch to streak after 2s
        setTimeout(() => {
            badge.classList.remove('visible');
            setTimeout(() => {
                badge.textContent = formatStreak(count);
                badge.classList.add('visible');
            }, 400);
        }, 2000);
    } else {
        badge.textContent = formatStreak(count);
        document.body.appendChild(badge);
        requestAnimationFrame(() => badge.classList.add('visible'));
    }

    // Auto-hide after 6 seconds
    setTimeout(() => {
        badge.classList.remove('visible');
        setTimeout(() => badge.remove(), 500);
    }, 6000);
}
