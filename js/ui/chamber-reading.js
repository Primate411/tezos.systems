/** Shared reading cues. Source clocks are evidence clocks, never fetch clocks. */
import { escapeHtml } from '../core/utils.js';
import { quietlyMutate, quietlySyncHtml, quietlySyncElement } from '../core/quiet-refresh.js';

const STATES = new Set(['snapshot', 'archive', 'observed', 'partial', 'watch', 'unavailable', 'guide', 'healthy', 'degraded']);

export function relativeChamberAge(value, now = Date.now()) {
    const timestamp = typeof value === 'number' ? value : Date.parse(value || '');
    if (!Number.isFinite(timestamp)) return 'time unavailable';
    const seconds = Math.floor((now - timestamp) / 1000);
    if (seconds < -60) return 'clock ahead';
    if (seconds < 60) return 'under 1m ago';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

export function renderChamberStamp(value, label = 'Observed') {
    const timestamp = typeof value === 'number' ? value : Date.parse(value || '');
    const iso = Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : '';
    return `<span class="chamber-reading-clock" aria-live="off">${escapeHtml(label)} <time data-chamber-stamp${iso ? ` datetime="${iso}" title="${iso}"` : ''}>${relativeChamberAge(iso)}</time></span>`;
}

/** Preserve a feature's failure/source wording while advancing only its age. */
export function renderAgeingLabel(label, value, previousAge) {
    const template = String(label).replace(previousAge, '{age}');
    const [before, after] = template.split('{age}');
    if (after === undefined) return escapeHtml(label);
    return `<span>${escapeHtml(before)}${renderChamberStamp(value, '')}${escapeHtml(after)}</span>`;
}

/** All text is escaped; no verdict infers a score from unrelated metrics. */
export function renderChamberVerdict({ key, state = 'snapshot', sentence, receipts = [], timestamp, clockLabel = 'Generated' }) {
    const status = STATES.has(state) ? state : 'unavailable';
    return `<section class="chamber-reading-verdict" data-quiet-key="verdict-${escapeHtml(key)}" data-chamber-verdict="${escapeHtml(key)}" data-state="${status}" aria-label="Room summary">
        <span class="chamber-reading-state">${escapeHtml(status)}</span>
        <div class="chamber-reading-copy"><p>${escapeHtml(sentence)}</p><div class="chamber-reading-receipts">${receipts.map(([label, value]) => `<span><span>${escapeHtml(label)}</span> <strong data-chamber-arrival="value" data-chamber-arrival-key="${escapeHtml(`${key}-${label}`)}">${escapeHtml(value ?? 'Unavailable')}</strong></span>`).join('')}${timestamp !== undefined ? renderChamberStamp(timestamp, clockLabel) : ''}</div></div>
    </section>`;
}

export function syncChamberVerdict(root, model) {
    const panel = root?.querySelector(`[data-chamber-verdict="${CSS.escape(model.key)}"]`);
    if (panel) quietlySyncElement(panel, renderChamberVerdict(model));
}

export function setChamberReadingState(root, state) {
    const panel = root?.querySelector('.chamber-reading-verdict');
    if (!panel || !STATES.has(state) || panel.dataset.state === state) return;
    quietlyMutate(panel, () => {
        panel.dataset.state = state;
        panel.querySelector('.chamber-reading-state').firstChild.nodeValue = state;
    });
}

const GUIDES = {
    capital: ['TVL, stablecoin supply, and trading activity measure different things. Compare matching sources and windows; they are not one pool of capital.', [['TVL', 'Value in tracked DeFi protocols'], ['Stablecoins', 'Tracked stablecoin value on each chain'], ['Volume', 'Trading flow over its stated window']]],
    minerals: ['Read the material and its product form first. The full federal list is broader than the price history, and a listed mineral need not have a token or a market quote.', [['Atlas', '60 official critical minerals'], ['Supply', 'Annual USGS observations; original units'], ['Markets', '10 matching monthly product series']]],
    metals: ['A monthly average, an indicative quote, and a token price are different observations. Missing prices stay missing; none of these numbers proves token backing.', [['History', 'Completed-month IMF USD / troy oz'], ['Indications', 'Separate Gold API observation clock'], ['VNXAU', 'Token, issuer, and procedure receipts kept apart']]],
    uranium: ['A token-market quote is not a physical uranium price. Read the unit, observation date, and evidence scope before comparing either with a custody statement.', [['xU3O8', 'Token venue price and liquidity'], ['U3O8', 'Physical reference in its source unit'], ['Custody', 'Dated attributed evidence, not chain proof']]],
    'ledger-flow': ['This is an account’s returned transfer window, not its complete economic history or a map of common ownership.', [['Exact', 'Complete returned window under the disclosed limits'], ['Sample', 'Bounded rows; totals cover that sample only'], ['Flows', 'Gross sent and received, not profit']]],
};

export function renderChamberGuide(key) {
    const guide = GUIDES[key];
    if (!guide) return '';
    return renderChamberDisclosure(`guide-${key}`, 'How to read this', `<div class="chamber-reading-guide"><p>${escapeHtml(guide[0])}</p><dl>${guide[1].map(([label, target]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(target)}</dd></div>`).join('')}</dl></div>`);
}

/** Content is trusted renderer markup; labels and keys are always escaped. */
export function renderChamberDisclosure(key, label, content) {
    return `<details class="chamber-disclosure" data-chamber-disclosure data-quiet-key="${escapeHtml(key)}"><summary>${escapeHtml(label)}</summary><div class="chamber-disclosure-content">${content}</div></details>`;
}

// One visible-room clock; no polling, layout measurement, or background-tab work.
const readingRooms = new Set();
let stampTimer = null;
let visibilityBound = false;

export function updateChamberStamps(root, now = Date.now()) {
    if (document.visibilityState !== 'visible' || !root?.isConnected || root.closest('[inert], [aria-hidden="true"]')) return;
    const changed = [...root.querySelectorAll('time[data-chamber-stamp]')]
        .map(node => [node, relativeChamberAge(node.getAttribute('datetime'), now)])
        .filter(([node, label]) => node.textContent !== label);
    if (!changed.length) return;
    quietlyMutate(root, () => changed.forEach(([node, label]) => {
        if (node.firstChild?.nodeType === Node.TEXT_NODE) node.firstChild.nodeValue = label;
        else node.textContent = label;
    }));
}

function syncReadingClock() {
    if (stampTimer !== null) clearInterval(stampTimer);
    stampTimer = null;
    if (document.visibilityState !== 'visible' || !readingRooms.size) return;
    readingRooms.forEach(root => updateChamberStamps(root));
    stampTimer = setInterval(() => readingRooms.forEach(root => updateChamberStamps(root)), 30000);
}

export function startChamberReading(root) {
    if (!root) return;
    readingRooms.add(root);
    if (!visibilityBound) {
        visibilityBound = true;
        document.addEventListener('visibilitychange', syncReadingClock);
    }
    syncReadingClock();
}

export function stopChamberReading(root) {
    readingRooms.delete(root);
    syncReadingClock();
}

// Arrival polish is opt-in and first-paint only. A refresh always settles
// immediately; it never flashes a number, replays a row, or creates a fake tick.
const arrivedRoots = new WeakSet();
export function chamberArrivalAllowed(root, { quiet = true } = {}) {
    return !quiet && document.visibilityState === 'visible' && root?.isConnected
        && !root.closest('[inert], [aria-hidden="true"]')
        && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function reveal(nodes, duration) {
    nodes.slice(0, 12).forEach(node => node.animate?.([{ opacity: 0.7 }, { opacity: 1 }], { duration, easing: 'ease-out' }));
}

export function enterChamberRows(root, options) {
    if (!chamberArrivalAllowed(root, options)) return;
    reveal([...root.querySelectorAll('[data-chamber-arrival="row"]')], 220);
}

export function settleChamberValues(root, options) {
    if (!chamberArrivalAllowed(root, options)) return;
    reveal([...root.querySelectorAll('[data-chamber-arrival="value"]')], 180);
}

export function settleChamberArrival(root, { quiet = true } = {}) {
    if (!root) return;
    const first = !arrivedRoots.has(root);
    arrivedRoots.add(root);
    if (!first || !chamberArrivalAllowed(root, { quiet })) return;
    enterChamberRows(root, { quiet });
    settleChamberValues(root, { quiet });
}

export function syncChamberReading(root, html, { quiet = false } = {}) {
    if (quiet) quietlySyncHtml(root, html);
    else root.innerHTML = html;
    settleChamberArrival(root, { quiet });
}
