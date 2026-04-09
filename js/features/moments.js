/**
 * Network Moments — Milestone detection, toast notifications, and timeline
 * Detects when network stats cross meaningful thresholds and celebrates them.
 */

import { saveMoment, getMoments, isDismissed, dismissMoment } from '../core/storage.js';

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ─── Milestone Rules ─────────────────────────────────────────────

const MILESTONE_RULES = [
    // Staking ratio milestones (every 1% from 25-50%)
    ...Array.from({length: 26}, (_, i) => ({
        id: `staking-${25 + i}`,
        metric: 'stakingRatio',
        threshold: 25 + i,
        direction: 'crosses',
        title: `Staking hits ${25 + i}%!`,
        emoji: '🎉',
        tweet: `Tezos staking just crossed ${25 + i}%! The network keeps getting stronger.\n\nReal-time stats →`
    })),

    // Baker count milestones (every 25 from 200-500)
    ...Array.from({length: 13}, (_, i) => ({
        id: `bakers-${200 + i * 25}`,
        metric: 'totalBakers',
        threshold: 200 + i * 25,
        direction: 'crosses',
        title: `${200 + i * 25} Active Bakers!`,
        emoji: '🍞',
        tweet: `Tezos now has ${200 + i * 25}+ active bakers securing the network. Permissionless validation at its finest.\n\nReal-time stats →`
    })),

    // BLS/tz4 adoption milestones (every 5% from 10-100%)
    ...Array.from({length: 19}, (_, i) => ({
        id: `tz4-${10 + i * 5}`,
        metric: 'tz4Percentage',
        threshold: 10 + i * 5,
        direction: 'up',
        title: `BLS Adoption: ${10 + i * 5}%!`,
        emoji: '🔑',
        tweet: `${10 + i * 5}% of Tezos bakers now use BLS consensus keys (tz4). The future of signing is here.\n\nReal-time stats →`
    })),

    // Funded accounts milestones (every 100K)
    ...Array.from({length: 10}, (_, i) => ({
        id: `accounts-${(i + 1) * 100}k`,
        metric: 'fundedAccounts',
        threshold: (i + 1) * 100000,
        direction: 'up',
        title: `${(i + 1) * 100}K Funded Accounts!`,
        emoji: '👥',
        tweet: `Tezos just passed ${(i + 1) * 100},000 funded accounts. Adoption is real.\n\nReal-time stats →`
    })),

    // New cycle
    {
        id: 'new-cycle',
        metric: 'cycle',
        direction: 'change',
        title: 'New Cycle Started!',
        emoji: '🔄',
        dynamic: true
    },

    // Total burned milestones (every 500K XTZ)
    ...Array.from({length: 20}, (_, i) => ({
        id: `burned-${(i + 1) * 500}k`,
        metric: 'totalBurned',
        threshold: (i + 1) * 500000,
        direction: 'up',
        title: `${((i + 1) * 500 / 1000).toFixed(1)}M XTZ Burned!`,
        emoji: '🔥',
        tweet: `Over ${((i + 1) * 500000).toLocaleString()} XTZ permanently burned on Tezos. Deflationary pressure building.\n\nReal-time stats →`
    })),

    // ─── Governance Moments ─────────────────────────────
    // Governance period transitions
    {
        id: 'gov-period-change',
        metric: 'govPeriodKind',
        direction: 'change',
        title: 'Governance Period Changed!',
        emoji: '🏛️',
        dynamic: true
    },

    // New proposal injected
    {
        id: 'gov-new-proposal',
        metric: 'govProposalCount',
        direction: 'change',
        title: 'New Proposal Injected!',
        emoji: '📜',
        dynamic: true
    },

    // Protocol upgrade activated
    {
        id: 'protocol-upgrade',
        metric: 'upgradeCount',
        direction: 'change',
        title: 'Protocol Upgrade Activated!',
        emoji: '🚀',
        dynamic: true
    }

];

// ─── Detection Logic ─────────────────────────────────────────────

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

/**
 * Check if a milestone was recently triggered (within 24h)
 */
function wasRecentlyTriggered(momentId) {
    const moments = getMoments();
    const recent = moments.find(m => m.id === momentId);
    if (!recent) return false;
    return (Date.now() - recent.timestamp) < TWENTY_FOUR_HOURS;
}

/**
 * Check stats against milestone rules and return triggered moments.
 * @param {Object} prevStats - Previous stats snapshot
 * @param {Object} newStats - Current stats snapshot
 * @returns {Array} Array of triggered moment objects
 */
export function checkMoments(prevStats, newStats) {
    if (!prevStats || !newStats) return [];

    const triggered = [];

    for (const rule of MILESTONE_RULES) {
        const prev = prevStats[rule.metric];
        const curr = newStats[rule.metric];

        if (prev === undefined || curr === undefined) continue;
        if (prev === curr) continue;

        let fired = false;

        if (rule.direction === 'change') {
            // Any change triggers (used for cycle)
            fired = true;
        } else if (rule.direction === 'up') {
            // Crossed threshold going up
            fired = prev < rule.threshold && curr >= rule.threshold;
        } else if (rule.direction === 'crosses') {
            // Crossed threshold in either direction
            const prevBelow = prev < rule.threshold;
            const currBelow = curr < rule.threshold;
            fired = prevBelow !== currBelow;
        }

        if (!fired) continue;

        // Don't re-trigger within 24 hours
        const momentId = rule.dynamic ? `${rule.id}-${curr}` : rule.id;
        if (wasRecentlyTriggered(momentId)) continue;

        // Build the moment object
        let title = rule.title;
        let tweet = rule.tweet || '';

        // Dynamic cycle milestone
        if (rule.dynamic && rule.metric === 'cycle') {
            title = `Cycle ${newStats.cycle} Started!`;
            tweet = `Tezos just entered Cycle ${newStats.cycle}. The network never stops.\n\nReal-time stats →`;
        }

        // Dynamic governance moments
        if (rule.dynamic && rule.metric === 'govPeriodKind') {
            const periodNames = { proposal: 'Proposal', exploration: 'Exploration Vote', cooldown: 'Cooldown', promotion: 'Promotion Vote', adoption: 'Adoption' };
            const periodName = periodNames[curr] || curr;
            const pName = newStats.govProposalName || '';
            title = pName ? `${pName}: ${periodName} Phase!` : `Governance: ${periodName} Phase!`;
            const actionHint = (curr === 'exploration' || curr === 'promotion') ? ' Bakers — time to vote!' : '';
            tweet = `Tezos governance${pName ? ': ' + pName : ''} just entered the ${periodName} phase.${actionHint} On-chain democracy in action.

Watch it live →`;
        }
        if (rule.dynamic && rule.metric === 'govProposalCount') {
            title = `New Governance Proposal!${newStats.govProposalName ? ' ' + newStats.govProposalName : ''}`;
            tweet = `A new protocol proposal just landed on Tezos.${newStats.govProposalName ? ' ' + newStats.govProposalName + ' is' : " It's"} entering the governance pipeline.

Track it live →`;
        }
        if (rule.dynamic && rule.metric === 'upgradeCount') {
            const name = newStats.currentProtocolName || 'New protocol';
            title = `${name} is Live! Upgrade #${curr}`;
            tweet = `Tezos just completed its ${curr}th self-amendment! ${name} is now active. Zero forks. Ever.

Explore →`;
        }

        const moment = {
            id: momentId,
            emoji: rule.emoji,
            title,
            tweet,
            timestamp: Date.now()
        };

        // Save and queue
        saveMoment(moment);
        triggered.push(moment);
    }

    // Show toasts for triggered moments
    if (triggered.length > 0) {
        queueToasts(triggered);
        renderMomentsTimeline(); // Refresh timeline
    }

    return triggered;
}

// ─── Toast Notification System ───────────────────────────────────

let toastQueue = [];
let toastActive = false;

function queueToasts(moments) {
    toastQueue.push(...moments);
    if (!toastActive) showNextToast();
}

function showNextToast() {
    if (toastQueue.length === 0) {
        toastActive = false;
        return;
    }

    toastActive = true;
    const moment = toastQueue.shift();

    // Get or create container
    let container = document.getElementById('moments-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'moments-toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'moment-toast';
    toast.innerHTML = `
        <div class="moment-toast-header">
            <span class="moment-toast-label">${moment.emoji} Network Moment</span>
        </div>
        <div class="moment-toast-title">${escapeHtml(moment.title)}</div>
        <div class="moment-toast-actions">
            <button class="moment-toast-share">Share</button>
            <button class="moment-toast-dismiss">Dismiss</button>
        </div>
        <div class="moment-toast-progress"><div class="moment-toast-progress-bar"></div></div>
    `;

    container.appendChild(toast);

    // Trigger entrance animation
    requestAnimationFrame(() => {
        toast.classList.add('visible');
    });

    // Start progress bar
    const bar = toast.querySelector('.moment-toast-progress-bar');
    requestAnimationFrame(() => {
        bar.style.transition = 'width 15s linear';
        bar.style.width = '0%';
    });

    // Auto-dismiss after 15s
    const autoTimer = setTimeout(() => closeToast(toast, moment.id), 15000);

    // Share button
    toast.querySelector('.moment-toast-share').addEventListener('click', () => {
        const text = encodeURIComponent(moment.tweet + '\n\nhttps://tezos.systems');
        window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank', 'noopener');
    });

    // Dismiss button
    toast.querySelector('.moment-toast-dismiss').addEventListener('click', () => {
        clearTimeout(autoTimer);
        closeToast(toast, moment.id);
    });
}

function closeToast(toast, momentId) {
    dismissMoment(momentId);
    toast.classList.remove('visible');
    toast.classList.add('exiting');
    setTimeout(() => {
        toast.remove();
        showNextToast();
    }, 400);
}

// ─── Moments Timeline Section ────────────────────────────────────

/**
 * Initialize the moments timeline on page load
 */
export function initMomentsTimeline() {
    renderMomentsTimeline();

    // Dismiss-all button hides the section and clears recent moments from view
    const dismissBtn = document.getElementById('moments-dismiss-all');
    if (dismissBtn) {
        dismissBtn.addEventListener('click', () => {
            const section = document.getElementById('moments-section');
            if (section) section.style.display = 'none';
            // Mark all current moments as dismissed so they don't re-show
            const moments = getMoments();
            moments.forEach(m => dismissMoment(m.id));
        });
    }
}

/**
 * Render the timeline from localStorage data
 */
function renderMomentsTimeline() {
    const container = document.getElementById('moments-timeline-content');
    const section = document.getElementById('moments-section');
    if (!container) return;

    const moments = getMoments();
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const recent = moments
        .filter(m => m.timestamp > thirtyDaysAgo && !isDismissed(m.id))
        .sort((a, b) => b.timestamp - a.timestamp);

    // Show/hide section based on whether there are undismissed moments
    if (section) {
        section.style.display = recent.length > 0 ? '' : 'none';
    }

    if (recent.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = recent.map(m => `
        <div class="moment-item">
            <span class="moment-item-emoji">${m.emoji}</span>
            <div class="moment-item-info">
                <span class="moment-item-title">${escapeHtml(m.title)}</span>
                <span class="moment-item-time">${formatRelativeTime(m.timestamp)}</span>
            </div>
            ${m.tweet ? `<button class="moment-item-share" data-tweet="${encodeURIComponent(m.tweet + '\n\nhttps://tezos.systems')}" title="Share on X">𝕏</button>` : ''}
        </div>
    `).join('');

    // Attach share handlers
    container.querySelectorAll('.moment-item-share').forEach(btn => {
        btn.addEventListener('click', () => {
            window.open(`https://twitter.com/intent/tweet?text=${btn.dataset.tweet}`, '_blank', 'noopener');
        });
    });
}

/**
 * Format timestamp as relative time string
 */
function formatRelativeTime(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) {
        const m = Math.floor(seconds / 60);
        return `${m} min ago`;
    }
    if (seconds < 86400) {
        const h = Math.floor(seconds / 3600);
        return h === 1 ? '1 hour ago' : `${h} hours ago`;
    }
    const d = Math.floor(seconds / 86400);
    return d === 1 ? '1 day ago' : `${d} days ago`;
}
