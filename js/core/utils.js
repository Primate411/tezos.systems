/**
 * Utility functions for formatting and helper operations
 */

/**
 * Format large numbers with abbreviations (K, M, B, T)
 * @param {number} num - The number to format
 * @param {Object} options - Formatting options
 * @param {number} options.decimals - Number of decimal places (default: 2)
 * @param {boolean} options.useAbbreviation - Whether to abbreviate large numbers (default: true)
 * @param {string} options.locale - Locale for number formatting (default: 'en-US')
 * @returns {string} Formatted number string
 */
export function formatNumber(num, options = {}) {
    const {
        decimals = 2,
        useAbbreviation = true,
        locale = 'en-US'
    } = options;

    // Handle invalid numbers
    if (!isFinite(num) || num === null || num === undefined) {
        return '---';
    }

    // Abbreviate large numbers
    if (useAbbreviation) {
        const abbreviations = [
            { value: 1e12, symbol: 'T' },
            { value: 1e9, symbol: 'B' },
            { value: 1e6, symbol: 'M' },
            { value: 1e3, symbol: 'K' }
        ];

        for (const { value, symbol } of abbreviations) {
            if (Math.abs(num) >= value) {
                return (num / value).toFixed(decimals) + symbol;
            }
        }
    }

    // Use locale-specific formatting with commas
    return num.toLocaleString(locale, {
        minimumFractionDigits: 0,
        maximumFractionDigits: decimals
    });
}

/**
 * Format XTZ amounts with proper decimals
 * @param {number} amount - The amount in XTZ
 * @returns {string} Formatted XTZ string
 */
export function formatXTZ(amount) {
    return formatNumber(amount, { decimals: 2 }) + ' XTZ';
}

/**
 * Format mutez as compact XTZ string (e.g. "98.43M", "12.5K", "0")
 * Used for table displays where space is constrained.
 * @param {number} mutez - Amount in mutez (1 XTZ = 1e6 mutez)
 * @returns {string} Compact formatted XTZ string (no ꜩ symbol)
 */
export function formatMutez(mutez) {
    const xtz = (mutez || 0) / 1e6;
    if (xtz >= 1e6) return (xtz / 1e6).toFixed(2) + 'M';
    if (xtz >= 1e3) return (xtz / 1e3).toFixed(1) + 'K';
    return xtz.toFixed(0);
}

/**
 * Format percentage values
 * @param {number} value - The percentage value
 * @param {number} decimals - Number of decimal places (default: 2)
 * @returns {string} Formatted percentage string
 */
export function formatPercentage(value, decimals = 2) {
    if (!isFinite(value) || value === null || value === undefined) {
        return '---';
    }
    return value.toFixed(decimals) + '%';
}

/**
 * Format count (no abbreviation)
 * @param {number} num - The count to format
 * @returns {string} Formatted count string
 */
export function formatCount(num) {
    return formatNumber(num, { decimals: 0, useAbbreviation: false });
}

export function debugLog(...args) {
    try {
        const enabled = localStorage.getItem('tezos-systems-debug') === 'true'
            || localStorage.getItem('tezos-systems-debug') === '1'
            || window.location.hostname === 'localhost'
            || window.location.hostname === '127.0.0.1';
        if (enabled) console.log(...args);
    } catch {
        // Debug logging should never affect production flow.
    }
}

function applyDataFreshnessState(element, timestampMs, staleAfterMs) {
    const stale = Number.isFinite(timestampMs)
        && Number.isFinite(staleAfterMs)
        && staleAfterMs > 0
        && Date.now() - timestampMs > staleAfterMs;
    element.classList.toggle('chamber-data-stale', stale);
    element.dataset.freshnessState = stale ? 'stale' : 'fresh';
    return stale;
}

/**
 * Mark live chamber cards stale when their source timestamp falls behind.
 * The stamp text remains unchanged; this only controls the visual state.
 */
export function setDataFreshnessState(element, timestamp, staleAfterMs) {
    if (!element) return false;
    const time = timestamp ? new Date(timestamp).getTime() : NaN;
    if (Number.isFinite(time)) {
        element.dataset.freshnessTimestamp = String(time);
    } else {
        delete element.dataset.freshnessTimestamp;
    }
    if (Number.isFinite(staleAfterMs) && staleAfterMs > 0) {
        element.dataset.freshnessStaleAfter = String(staleAfterMs);
    } else {
        delete element.dataset.freshnessStaleAfter;
    }
    return applyDataFreshnessState(element, time, staleAfterMs);
}

export function refreshDataFreshnessStates(root = document) {
    root.querySelectorAll('[data-freshness-timestamp][data-freshness-stale-after]').forEach((element) => {
        applyDataFreshnessState(
            element,
            Number(element.dataset.freshnessTimestamp),
            Number(element.dataset.freshnessStaleAfter)
        );
    });
}

let liveTimeTicker = null;

function liveTimeParts(ms) {
    const totalSeconds = Math.max(0, Math.floor(Math.abs(ms) / 1000));
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return { days, hours, minutes, seconds };
}

export function formatLiveDuration(ms, { includeSeconds = true } = {}) {
    if (!Number.isFinite(ms)) return 'unknown';
    const { days, hours, minutes, seconds } = liveTimeParts(ms);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return includeSeconds ? `${hours}h ${minutes}m ${seconds}s` : `${hours}h ${minutes}m`;
    if (minutes > 0) return includeSeconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
    return `${seconds}s`;
}

export function formatLiveAge(value) {
    if (!value) return 'time unknown';
    const time = new Date(value).getTime();
    if (!Number.isFinite(time)) return 'time unknown';
    const diff = Date.now() - time;
    if (diff < 0) return 'just now';
    const seconds = Math.floor(diff / 1000);
    if (seconds < 10) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 365) return `${days}d ago`;
    return `${Math.floor(days / 365)}y ago`;
}

export function formatLiveCountdown(value, options = {}) {
    const time = new Date(value).getTime();
    if (!Number.isFinite(time)) return options.emptyText || 'Timing unknown';
    const diff = time - Date.now();
    if (diff <= 0) return options.endedText || 'Ended';
    return formatLiveDuration(diff, { includeSeconds: options.includeSeconds !== false });
}

function applyLiveText(element, text) {
    const prefix = element.dataset.livePrefix || '';
    const suffix = element.dataset.liveSuffix || '';
    element.textContent = `${prefix}${text}${suffix}`;
}

export function refreshLiveTimeLabels(root = document) {
    root.querySelectorAll('[data-live-age]').forEach((element) => {
        applyLiveText(element, formatLiveAge(element.dataset.liveAge));
    });
    root.querySelectorAll('[data-live-countdown]').forEach((element) => {
        applyLiveText(element, formatLiveCountdown(element.dataset.liveCountdown, {
            emptyText: element.dataset.liveEmpty,
            endedText: element.dataset.liveEnded,
            includeSeconds: element.dataset.liveSeconds !== 'false'
        }));
    });
    root.querySelectorAll('[data-live-duration-since]').forEach((element) => {
        const time = new Date(element.dataset.liveDurationSince).getTime();
        const diff = Number.isFinite(time) ? Date.now() - time : NaN;
        applyLiveText(element, formatLiveDuration(diff, { includeSeconds: element.dataset.liveSeconds !== 'false' }));
    });
    root.querySelectorAll('[data-live-duration-until]').forEach((element) => {
        const time = new Date(element.dataset.liveDurationUntil).getTime();
        const diff = Number.isFinite(time) ? time - Date.now() : NaN;
        applyLiveText(element, formatLiveDuration(diff, { includeSeconds: element.dataset.liveSeconds !== 'false' }));
    });
    refreshDataFreshnessStates(root);
}

export function startLiveTimeTicker(root = document) {
    refreshLiveTimeLabels(root);
    if (liveTimeTicker) return liveTimeTicker;
    liveTimeTicker = window.setInterval(() => {
        if (document.visibilityState !== 'visible') return;
        refreshLiveTimeLabels(document);
    }, 1000);
    return liveTimeTicker;
}

/**
 * Format large numbers with abbreviations
 * @param {number} num - The number to format
 * @returns {string} Formatted large number string
 */
export function formatLarge(num) {
    return formatNumber(num, { decimals: 2, useAbbreviation: true });
}

/**
 * Format total supply in billions with XTZ suffix
 * @param {number} num - The supply amount in mutez or XTZ
 * @returns {string} Formatted supply string (e.g., "1.05B")
 */
export function formatSupply(num) {
    if (!isFinite(num) || num === null || num === undefined) {
        return '---';
    }
    // Format in billions
    if (num >= 1e9) {
        return (num / 1e9).toFixed(2) + 'B';
    }
    // Format in millions
    if (num >= 1e6) {
        return (num / 1e6).toFixed(2) + 'M';
    }
    return formatNumber(num, { decimals: 0, useAbbreviation: true });
}

/**
 * Format timestamp to human-readable time
 * @param {Date} date - The date to format
 * @returns {string} Formatted time string
 */
export function formatTimestamp(date) {
    if (!(date instanceof Date) || isNaN(date)) {
        return 'Never';
    }

    return new Intl.DateTimeFormat('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).format(date);
}

/**
 * Format relative time (e.g., "2 minutes ago")
 * @param {Date} date - The date to format
 * @returns {string} Relative time string
 */
export function formatRelativeTime(date) {
    if (!(date instanceof Date) || isNaN(date)) {
        return 'Never';
    }

    const seconds = Math.floor((new Date() - date) / 1000);

    if (seconds < 10) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

/**
 * Debounce function to limit execution rate
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Throttle function to limit execution rate
 * @param {Function} func - Function to throttle
 * @param {number} limit - Time limit in milliseconds
 * @returns {Function} Throttled function
 */
export function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

/**
 * Escape HTML special characters to prevent XSS
 * @param {*} str - Value to escape (converted to string)
 * @returns {string} Escaped string safe for innerHTML interpolation
 */
export function escapeHtml(str) {
    const s = String(str ?? '');
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Sleep/delay function
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} Promise that resolves after delay
 */
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate percentage
 * @param {number} part - The part value
 * @param {number} total - The total value
 * @returns {number} Percentage value
 */
export function calculatePercentage(part, total) {
    if (total === 0 || !isFinite(part) || !isFinite(total)) {
        return 0;
    }
    return (part / total) * 100;
}
