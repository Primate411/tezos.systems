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

/**
 * Specialized formatters for different stat types
 */
export const formatters = {
    tez: (amount) => formatXTZ(amount),
    percentage: (value) => formatPercentage(value),
    count: (num) => formatCount(num),
    large: (num) => formatLarge(num),
    timestamp: (date) => formatTimestamp(date)
};
