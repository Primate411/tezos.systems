import {
    SITE_MAP,
    SITE_MAP_NAV_GROUPS,
    SITE_MAP_RELATIONS,
    findSiteMapEntry,
    siteMapDirectoryChildren,
    siteMapGroup,
    siteMapRoute
} from './site-map.js';

export const SITE_HANDOFF_QUESTIONS = Object.freeze([
    Object.freeze({ id: 'build', prompt: 'What’s being built?', label: 'Ecosystem', entryId: 'ecosystem' }),
    Object.freeze({ id: 'move', prompt: 'Where is value moving?', label: 'Flow', entryId: 'ledger-flow' }),
    Object.freeze({ id: 'now', prompt: 'What now?', label: 'Network Pulse', entryId: 'pulse' }),
    Object.freeze({ id: 'mine', prompt: 'What’s mine?', label: 'My Tezos', entryId: 'my-tezos' }),
    Object.freeze({ id: 'decide', prompt: 'What are we deciding?', label: 'Governance', entryId: 'chamber' }),
    Object.freeze({ id: 'before', prompt: 'What came before?', label: 'History', entryId: 'anthology' }),
    Object.freeze({ id: 'power', prompt: 'Where does power gather?', label: 'Staking', entryId: 'staking-chamber' }),
    Object.freeze({ id: 'health', prompt: 'Is the chain healthy?', label: 'Network Health', entryId: 'health', tier: 'satellite' }),
    Object.freeze({ id: 'capital', prompt: 'What gives Tezos value?', label: 'Capital', entryId: 'capital', tier: 'satellite' }),
    Object.freeze({ id: 'etherlink', prompt: 'What’s happening on Etherlink?', label: 'Tezos X', entryId: 'tezosx', tier: 'satellite' }),
    Object.freeze({ id: 'bakers', prompt: 'Who keeps it running?', label: 'Baker Directory', entryId: 'leaderboard', tier: 'satellite' }),
    Object.freeze({ id: 'maxis', prompt: 'Who leads each lane?', label: 'Maxis', entryId: 'maxis', tier: 'satellite' }),
    Object.freeze({ id: 'recognition', prompt: 'Who gets recognized?', label: 'TezosCRP', entryId: 'tezoscrp', tier: 'satellite' })
]);

const QUESTION_CONTEXTS = Object.freeze({
    build: Object.freeze(['ecosystem', 'chambers', 'hen', 'widgets']),
    move: Object.freeze(['ledger-flow', 'whales', 'minerals', 'metals', 'uranium', 'ctez', 'liquidity-baking']),
    now: Object.freeze(['home', 'pulse', 'price', 'snapshot', 'live-compare']),
    mine: Object.freeze(['my-tezos', 'domains']),
    decide: Object.freeze(['chamber', 'l2-governance', 'governance-guide']),
    before: Object.freeze(['anthology', 'history', 'compare']),
    power: Object.freeze(['staking-chamber', 'staking', 'calculator']),
    health: Object.freeze(['health', 'tz4']),
    capital: Object.freeze(['capital']),
    etherlink: Object.freeze(['tezosx']),
    bakers: Object.freeze(['leaderboard', 'bakers-guide']),
    maxis: Object.freeze(['maxis']),
    recognition: Object.freeze(['tezoscrp'])
});

const QUESTION_POSITIONS = Object.freeze({
    build: Object.freeze({ x: 0.08, y: 0.12 }),
    move: Object.freeze({ x: 0.86, y: 0.12 }),
    now: Object.freeze({ x: 0.42, y: 0.38 }),
    mine: Object.freeze({ x: 0.08, y: 0.55 }),
    decide: Object.freeze({ x: 0.86, y: 0.5 }),
    before: Object.freeze({ x: 0.33, y: 0.86 }),
    power: Object.freeze({ x: 0.86, y: 0.84 }),
    health: Object.freeze({ x: 0.06, y: 0.28 }),
    capital: Object.freeze({ x: 0.96, y: 0.29 }),
    etherlink: Object.freeze({ x: 0.62, y: 0.65 }),
    bakers: Object.freeze({ x: 0.04, y: 0.77 }),
    maxis: Object.freeze({ x: 0.28, y: 0.34 }),
    recognition: Object.freeze({ x: 0.4, y: 0.72 })
});

const handoffCleanup = new WeakMap();
let handoffSequence = 0;

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function entryRoute(entry) {
    return siteMapRoute(entry) || entry?.href || entry?.hash || '/';
}

function questionEntries() {
    return SITE_HANDOFF_QUESTIONS
        .map((question) => ({ ...question, entry: findSiteMapEntry(question.entryId) }))
        .filter((question) => question.entry);
}

function questionIdForEntryId(entryId, fallback = 'now') {
    const exact = SITE_HANDOFF_QUESTIONS.find((question) => question.entryId === entryId);
    if (exact) return exact.id;
    return Object.entries(QUESTION_CONTEXTS)
        .find(([, entryIds]) => entryIds.includes(entryId))?.[0] || fallback;
}

function contextualQuestionId(current, context) {
    return questionIdForEntryId(context?.entryId || current?.id || 'home');
}

function relatedQuestionIds(questionId) {
    const activeQuestion = SITE_HANDOFF_QUESTIONS.find((question) => question.id === questionId);
    if (!activeQuestion) return new Set();
    const related = new Set(
        (SITE_MAP_RELATIONS[activeQuestion.entryId] || [])
            .map((entryId) => questionIdForEntryId(entryId, null))
            .filter((id) => id && id !== questionId)
    );
    SITE_HANDOFF_QUESTIONS.forEach((question) => {
        if (question.id === questionId) return;
        const reachesActive = (SITE_MAP_RELATIONS[question.entryId] || [])
            .map((entryId) => questionIdForEntryId(entryId, null))
            .includes(questionId);
        if (reachesActive) related.add(question.id);
    });
    return related;
}

function constellationVariables(activeId, questionId, relation) {
    const active = QUESTION_POSITIONS[activeId] || QUESTION_POSITIONS.now;
    const question = QUESTION_POSITIONS[questionId] || QUESTION_POSITIONS.now;
    const dx = active.x - question.x;
    const dy = active.y - question.y;
    const span = Math.max(Math.abs(dx), Math.abs(dy), 0.001);
    const unitX = dx / span;
    const unitY = dy / span;
    const settle = relation === 'near' ? 5 : relation === 'far' ? 1.25 : 2.4;
    const settleY = relation === 'near' ? 4 : relation === 'far' ? 1 : 2;
    const activeTowardCenterX = relation === 'center' ? Math.sign(0.5 - active.x) : unitX;
    const activeTowardCenterY = relation === 'center' ? Math.sign(0.5 - active.y) : unitY;
    return {
        settleX: `${(activeTowardCenterX * settle).toFixed(2)}px`,
        settleY: `${(activeTowardCenterY * settleY).toFixed(2)}px`,
        settleScale: relation === 'center' ? '1.016' : relation === 'near' ? '1.006' : '1'
    };
}

function signalQuestionId(signal) {
    if (!signal || typeof signal !== 'object') return null;
    const words = [signal.category, signal.visual, signal.kind, signal.id, signal.title]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
    if (!words) return null;
    if (/govern|proposal|ballot|vote/.test(words)) return 'decide';
    if (/wallet|account|domain|personal|identity/.test(words)) return 'mine';
    if (/history|protocol|anniversary|archive|memory/.test(words)) return 'before';
    if (/award|recognition|community reward|tezoscrp/.test(words)) return 'recognition';
    if (/maxi|champion|passport|crown/.test(words)) return 'maxis';
    if (/etherlink|tezos x|rollup|layer 2|\bl2\b/.test(words)) return 'etherlink';
    if (/baker|validator|baker directory/.test(words)) return 'bakers';
    if (/health|finality|attest|block|consensus|quorum|octez|\btz4\b/.test(words)) return 'health';
    if (/stake|staking|delegat|power|cycle/.test(words)) return 'power';
    if (/contract|ecosystem|dapp|app|nft|collect/.test(words)) return 'build';
    if (/capital|economy|tvl|stablecoin|real.world.asset|\brwa\b/.test(words)) return 'capital';
    if (/market|price|whale|capital|flow|token|liquidity|volume/.test(words)) return 'move';
    return 'now';
}

function handoffIsVisible(container) {
    if (document.visibilityState !== 'visible') return false;
    const rect = container.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
}

function handoffReaderIsHolding(container) {
    const selection = window.getSelection?.();
    const selectionHeld = Boolean(
        selection
        && !selection.isCollapsed
        && selection.anchorNode
        && container.contains(selection.anchorNode)
    );
    return container.matches(':hover') || container.contains(document.activeElement) || selectionHeld;
}

function settleQuestionMotion(container) {
    container.querySelectorAll('.site-handoff-question.is-signal-arriving')
        .forEach((link) => link.classList.remove('is-signal-arriving'));
}

function applyQuestionEmphasis(container, questionId, source = 'context') {
    const available = new Set(SITE_HANDOFF_QUESTIONS.map((question) => question.id));
    const nextId = available.has(questionId) ? questionId : 'now';
    const related = relatedQuestionIds(nextId);
    const previousId = container.dataset.siteHandoffEmphasis || '';
    const shouldSettle = source === 'signal'
        && previousId !== nextId
        && handoffIsVisible(container)
        && !handoffReaderIsHolding(container);
    container.dataset.siteHandoffEmphasis = nextId;
    container.dataset.siteHandoffEmphasisSource = source;
    container.dataset.siteHandoffConstellation = nextId;
    container.querySelectorAll('[data-handoff-question]').forEach((link) => {
        const linkId = link.dataset.handoffQuestion;
        const relation = linkId === nextId ? 'center' : related.has(linkId) ? 'near' : 'far';
        const variables = constellationVariables(nextId, linkId, relation);
        link.classList.toggle('is-emphasized', relation === 'center');
        link.classList.toggle('is-related', relation === 'near');
        link.classList.toggle('is-distant', relation === 'far');
        link.dataset.handoffRelation = relation;
        link.style.setProperty('--handoff-signal-x', variables.settleX);
        link.style.setProperty('--handoff-signal-y', variables.settleY);
        link.style.setProperty('--handoff-signal-scale', variables.settleScale);
        link.classList.remove('is-signal-arriving');
        if (shouldSettle) {
            void link.offsetWidth;
            link.classList.add('is-signal-arriving');
        }
    });
}

function wireQuestionEmphasis(container, contextQuestion) {
    handoffCleanup.get(container)?.();
    if (typeof window === 'undefined') return;

    const applySignal = (event) => {
        const signal = event?.detail?.signal || event?.detail?.top || event?.detail || null;
        const questionId = signalQuestionId(signal);
        applyQuestionEmphasis(container, questionId || contextQuestion, questionId ? 'signal' : 'context');
    };
    const settleHeldMotion = () => settleQuestionMotion(container);
    window.addEventListener('hot-signal-rendered', applySignal);
    window.addEventListener('site-handoff-signal', applySignal);
    container.addEventListener('pointerenter', settleHeldMotion);
    container.addEventListener('focusin', settleHeldMotion);
    handoffCleanup.set(container, () => {
        window.removeEventListener('hot-signal-rendered', applySignal);
        window.removeEventListener('site-handoff-signal', applySignal);
        container.removeEventListener('pointerenter', settleHeldMotion);
        container.removeEventListener('focusin', settleHeldMotion);
    });
}

function journeyAttributes(context, destination, surface, reason) {
    const from = context.intentId || context.entryId;
    return [
        'data-site-journey',
        `data-journey-from="${escapeHtml(from)}"`,
        `data-journey-from-entry="${escapeHtml(context.entryId)}"`,
        context.intentId ? `data-journey-from-intent="${escapeHtml(context.intentId)}"` : '',
        `data-journey-to="${escapeHtml(destination.id)}"`,
        `data-journey-surface="${escapeHtml(surface)}"`,
        `data-journey-reason="${escapeHtml(reason)}"`
    ].filter(Boolean).join(' ');
}

function questionLinkHtml(question, current, context, emphasisQuestion) {
    const currentPage = question.entry.id === current?.id;
    const classes = [
        'site-handoff-question',
        `site-handoff-question-${question.id}`,
        question.tier === 'satellite' ? 'is-satellite' : 'is-anchor',
        question.id === emphasisQuestion ? 'is-emphasized' : '',
        currentPage ? 'is-current-page' : ''
    ].filter(Boolean).join(' ');
    return `
        <a class="${classes}" href="${escapeHtml(entryRoute(question.entry))}" data-handoff-question="${escapeHtml(question.id)}" data-handoff-tier="${escapeHtml(question.tier || 'anchor')}" data-site-map-entry="${escapeHtml(question.entry.id)}" ${journeyAttributes(context, question.entry, 'site-handoff', `question-${question.id}`)}${currentPage ? ' aria-current="page"' : ''}>
            <span>${escapeHtml(question.prompt)}</span>
            <small>${escapeHtml(question.label)}</small>
        </a>
    `;
}

function directoryLinkHtml(entry, current, className = 'site-map-link') {
    const currentPage = entry?.id === current?.id;
    const type = String(entry?.href || '').endsWith('.xml') ? ' type="application/rss+xml"' : '';
    return `
        <a class="${className}${currentPage ? ' is-active' : ''}" href="${escapeHtml(entryRoute(entry))}" data-site-map-entry="${escapeHtml(entry?.id || '')}"${currentPage ? ' aria-current="page"' : ''}${type}>
            <span>${escapeHtml(entry?.title || '')}</span>
            ${entry?.fresh ? '<small>New</small>' : ''}
        </a>
    `;
}

function directoryGroupHtml(label, current, sequence) {
    const entries = siteMapGroup(label);
    if (!entries.length) return '';
    const headingId = `site-map-group-${sequence}-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    return `
        <section class="site-map-group" aria-labelledby="${escapeHtml(headingId)}">
            <h3 id="${escapeHtml(headingId)}">${escapeHtml(label)}</h3>
            <div class="site-map-links">
                ${entries.map((entry) => {
                    const children = siteMapDirectoryChildren(entry);
                    return `
                        <div class="site-map-link-cluster${children.length ? ' has-children' : ''}">
                            ${directoryLinkHtml(entry, current)}
                            ${children.length ? `<div class="site-map-sublinks">${children.map((child) => directoryLinkHtml(child, current, 'site-map-sublink')).join('')}</div>` : ''}
                        </div>
                    `;
                }).join('')}
            </div>
        </section>
    `;
}

function destinationCount() {
    return SITE_MAP.reduce(
        (count, entry) => count + 1 + siteMapDirectoryChildren(entry).length,
        0
    );
}

export function renderSiteHandoff(container, {
    currentEntry = null,
    currentContext = null
} = {}) {
    if (!container) return;
    const sequence = ++handoffSequence;
    const current = currentEntry || currentContext?.entry || findSiteMapEntry('home') || SITE_MAP[0] || null;
    const context = currentContext || {
        id: current.id,
        entry: current,
        intent: null,
        entryId: current.id,
        intentId: null,
        route: current.href
    };
    const questions = questionEntries();
    const emphasisQuestion = contextualQuestionId(current, context);
    const totalDestinations = destinationCount();
    const titleId = sequence === 1 ? 'site-handoff-title' : `site-handoff-title-${sequence}`;
    const copyId = `${titleId}-copy`;
    const mapId = sequence === 1 ? 'site-map' : `site-map-${sequence}`;

    container.classList.add('site-map-shell', 'site-map-footer', 'site-handoff-shell');
    container.setAttribute('data-site-handoff', 'true');
    container.setAttribute('aria-labelledby', titleId);
    container.innerHTML = `
        <div class="site-handoff-main">
            <header class="site-handoff-head">
                <div class="site-handoff-head-copy">
                    <span class="site-map-kicker">The Handoff</span>
                    <h2 id="${titleId}">Follow a question, not a menu.</h2>
                    <p id="${copyId}">Stay awhile. When one of these feels like yours, follow it.</p>
                </div>
                ${container.id === 'recruit-section' ? `
                    <button class="home-block-hide site-handoff-hide" type="button" data-home-hide="handoff" aria-label="Hide Keep Exploring" title="Hide Keep Exploring">
                        <svg class="home-block-hide-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 10.7a2 2 0 002.7 2.7M9.9 4.2A10.8 10.8 0 0112 4c5.2 0 8.8 5.3 8.8 5.3a13 13 0 01-2.3 2.7M6.2 6.2A15.7 15.7 0 003.2 9.3S6.8 14.7 12 14.7c1 0 1.9-.2 2.7-.5"/></svg>
                        <span class="home-block-hide-label">Hide</span>
                    </button>
                ` : ''}
            </header>
            <nav class="site-handoff-question-field" aria-label="Questions that open Tezos Systems destinations" aria-describedby="${copyId}">
                ${questions.map((question) => questionLinkHtml(question, current, context, emphasisQuestion)).join('')}
            </nav>
            <p class="site-handoff-question-note">The field gathers around what feels most alive · exact facts stay in the ticker and rooms.</p>
        </div>
        <details class="site-map-disclosure" id="${mapId}">
            <summary>
                <span class="site-map-disclosure-label">Open the complete map · ${totalDestinations} destinations</span>
                <span class="site-map-disclosure-hint">Every destination, one system.</span>
            </summary>
            <nav class="site-map-grid" aria-label="Complete Tezos Systems map">
                ${SITE_MAP_NAV_GROUPS.map((label) => directoryGroupHtml(label, current, sequence)).join('')}
            </nav>
        </details>
    `;
    applyQuestionEmphasis(container, emphasisQuestion, 'context');
    wireQuestionEmphasis(container, emphasisQuestion);
}
