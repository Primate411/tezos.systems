import { fetchVotingStatus, formatTimeRemaining, getVotingPeriodName } from './governance.js';
import { fetchBakerVoteStatus, formatGovTimeLeft } from './my-tezos.js';
import { escapeHtml } from '../core/utils.js';

const ROOT_ID = 'governance-alert-strip';
const SAVED_BAKER_KEY = 'tezos-systems-my-baker-address';
const ALERTS_ENABLED_KEY = 'tezos-systems-governance-alerts-enabled';
const ALERT_NOTIFIED_KEY = 'tezos-systems-governance-alert-notified';
const REFRESH_MS = 10 * 60 * 1000;

let refreshTimer = null;

function canNotify() {
    return 'Notification' in window;
}

function alertsEnabled() {
    return localStorage.getItem(ALERTS_ENABLED_KEY) === '1' && canNotify() && Notification.permission === 'granted';
}

function track(action, details = {}) {
    window.trackTezosSystemsEvent?.(`governance_alert_${action}`, details);
}

function activeKind(kind) {
    return ['proposal', 'exploration', 'promotion'].includes(kind);
}

function proposalCount(period) {
    if (period?.proposalsCount === undefined || period?.proposalsCount === null) return null;
    const count = Number(period.proposalsCount);
    return Number.isFinite(count) ? count : null;
}

function hasSubmittedProposal(period) {
    if (!period || period.kind !== 'proposal') return true;
    const count = proposalCount(period);
    if (count !== null) return count > 0;
    return Boolean(period.proposalHash || period.proposalName || period.proposal?.hash || period.proposal?.alias);
}

function alertablePeriod(period) {
    if (!period || !activeKind(period.kind)) return false;
    if (period.kind === 'proposal') return hasSubmittedProposal(period);
    return true;
}

function hide(root) {
    root.hidden = true;
    root.innerHTML = '';
}

function phaseName(kind) {
    return getVotingPeriodName(kind).replace(/\s+(Period|Vote)$/i, '');
}

function proposalLabel(period, vote) {
    return vote?.proposal
        || period?.proposalName
        || period?.proposal?.alias
        || period?.proposal?.hash?.slice(0, 8)
        || 'current proposal';
}

function alertKey(period, vote) {
    return [
        period?.kind || 'unknown',
        period?.startTime || '',
        period?.endTime || '',
        proposalLabel(period, vote),
        vote?.voted ? `voted-${vote.vote || vote.voteType || 'yes'}` : 'open'
    ].join('|');
}

function sendNotification(period, vote, savedBaker) {
    if (!alertsEnabled() || !alertablePeriod(period)) return;
    const key = alertKey(period, vote);
    if (localStorage.getItem(ALERT_NOTIFIED_KEY) === key) return;

    const title = vote && savedBaker && !vote.voted
        ? 'Your baker has not voted yet'
        : 'Tezos governance is live';
    const body = vote && savedBaker && !vote.voted
        ? `${proposalLabel(period, vote)} closes ${formatGovTimeLeft(vote.endTime || period.endTime)}.`
        : `${phaseName(period.kind)}: ${proposalLabel(period, vote)}.`;

    try {
        const notification = new Notification(title, {
            body,
            tag: 'tezos-systems-governance-alert'
        });
        notification.onclick = () => {
            window.focus();
            window.location.hash = 'chamber';
            track('notification_click', { kind: period.kind });
            notification.close();
        };
        localStorage.setItem(ALERT_NOTIFIED_KEY, key);
        track('notification_sent', { kind: period.kind, saved_baker: savedBaker ? 'yes' : 'no' });
    } catch (_) {}
}

function voteStatusCopy(period, vote, savedBaker) {
    if (!savedBaker) {
        const proposalWindow = period.kind === 'proposal';
        return {
            tone: 'active',
            kicker: `${phaseName(period.kind)} live`,
            title: proposalWindow
                ? `${proposalLabel(period, vote)} is gathering Proposal upvotes.`
                : `${proposalLabel(period, vote)} vote is live.`,
            body: proposalWindow
                ? 'Save My Tezos once and this strip becomes a personal baker upvote check when proposals are submitted.'
                : 'Save My Tezos once and this strip becomes a personal baker vote check during every governance window.',
            meta: period.endTime ? `${formatTimeRemaining(period.endTime)} until the period closes` : 'Live governance period'
        };
    }

    if (!vote) {
        return {
            tone: 'active',
            kicker: `${phaseName(period.kind)} live`,
            title: 'Vote check is warming up.',
            body: 'The saved-baker signal is loading from TzKT. The Chamber already has the full live vote room.',
            meta: period.endTime ? `${formatTimeRemaining(period.endTime)} remaining` : 'Live governance period'
        };
    }

    if (vote.voted) {
        const label = vote.voteType === 'upvote'
            ? 'upvoted in Proposal'
            : `voted ${String(vote.vote || '').toUpperCase()}`;
        return {
            tone: 'settled',
            kicker: 'Saved baker checked',
            title: `${proposalLabel(period, vote)} is covered.`,
            body: `Your saved baker ${label}. Share the live Chamber if delegators are asking what changed.`,
            meta: vote.endTime ? `${formatGovTimeLeft(vote.endTime)} left in this window` : 'Vote recorded'
        };
    }

    return {
        tone: vote.urgency > 0.85 ? 'urgent' : vote.urgency > 0.7 ? 'watch' : 'active',
        kicker: 'Saved baker needs a look',
        title: `${proposalLabel(period, vote)} is still missing your baker vote.`,
        body: 'Open My Tezos or the Chamber to check quorum, supermajority, and the largest non-voters before the window closes.',
        meta: vote.endTime ? `${formatGovTimeLeft(vote.endTime)} left` : 'Live voting window'
    };
}

function render(root, period, vote, savedBaker) {
    const copy = voteStatusCopy(period, vote, savedBaker);
    const notifyLabel = alertsEnabled()
        ? 'Reminders on'
        : canNotify()
            ? 'Enable reminders'
            : 'RSS only';

    root.hidden = false;
    root.innerHTML = `
        <div class="governance-alert-card governance-alert-${escapeHtml(copy.tone)}">
            <div class="governance-alert-copy">
                <span class="governance-alert-kicker">${escapeHtml(copy.kicker)}</span>
                <strong>${escapeHtml(copy.title)}</strong>
                <p>${escapeHtml(copy.body)}</p>
                <small>${escapeHtml(copy.meta)}</small>
            </div>
            <div class="governance-alert-actions">
                <a class="governance-alert-primary" href="/chamber/" data-governance-alert-action="chamber">Open Chamber</a>
                <a href="#my-tezos" data-governance-alert-action="my-tezos">My Tezos</a>
                <a href="/feed.xml" type="application/rss+xml" data-governance-alert-action="rss">RSS</a>
                <button type="button" data-governance-alert-action="notify" ${canNotify() ? '' : 'disabled'}>${escapeHtml(notifyLabel)}</button>
            </div>
        </div>
    `;

    root.querySelectorAll('[data-governance-alert-action]').forEach((control) => {
        control.addEventListener('click', async (event) => {
            const action = control.dataset.governanceAlertAction;
            track(action, { kind: period?.kind || 'unknown', saved_baker: savedBaker ? 'yes' : 'no' });
            if (action !== 'notify') return;
            event.preventDefault();
            if (!canNotify()) return;
            const permission = Notification.permission === 'granted'
                ? 'granted'
                : await Notification.requestPermission();
            if (permission === 'granted') {
                localStorage.setItem(ALERTS_ENABLED_KEY, '1');
                control.textContent = 'Reminders on';
                sendNotification(period, vote, savedBaker);
            }
        });
    });

    sendNotification(period, vote, savedBaker);
}

async function refreshGovernanceAlert() {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;

    try {
        const period = await fetchVotingStatus();
        if (!alertablePeriod(period)) {
            hide(root);
            return;
        }

        const savedBaker = localStorage.getItem(SAVED_BAKER_KEY) || '';
        const vote = savedBaker
            ? await fetchBakerVoteStatus(savedBaker)
            : null;
        render(root, period, vote, savedBaker);
    } catch (error) {
        hide(root);
        console.warn('Governance alert failed', error);
    }
}

export function initGovernanceAlerts() {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    refreshGovernanceAlert();
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(refreshGovernanceAlert, REFRESH_MS);
    window.addEventListener('my-baker-updated', refreshGovernanceAlert);
}
