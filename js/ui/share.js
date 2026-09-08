/** Lightweight share controls; image code loads only after a capture action. */
import { loadDataAsset } from '../core/data-assets.js';
import { CARD_SHARE_ICON_SVG } from './share-state.js';
export { appendCardSeal, setLiveAPY, trackedTezosUrl } from './share-state.js';

let rendererPromise = null;
let renderer = null;
let importAttempt = 0;
const pendingActions = new WeakMap();

export function loadShareRenderer() {
    if (!rendererPromise) {
        const path = './share-renderer.js';
        rendererPromise = import(importAttempt ? `${path}?share-retry=${importAttempt}` : path)
            .then(module => { renderer = module; return module; })
            .catch(error => {
                rendererPromise = null;
                importAttempt += 1;
                throw error;
            });
    }
    return rendererPromise;
}

async function runShareAction(opener, action) {
    if (pendingActions.has(opener)) return pendingActions.get(opener);
    const route = location.href;
    let cancelled = false;
    const cancel = event => { if (event.key === 'Escape') cancelled = true; };
    document.addEventListener('keydown', cancel);
    const title = opener.title;
    opener.setAttribute('aria-busy', 'true');
    opener.title = 'Preparing image tools…';
    const pending = loadShareRenderer().then(module => {
        if (!cancelled && location.href === route && opener.isConnected) return action(module);
    }).catch(error => {
        console.warn('Share unavailable; activate again to retry:', error);
        opener.title = 'Share unavailable — activate again to retry';
    }).finally(() => {
        if (opener.title === 'Preparing image tools…') opener.title = title;
        opener.removeAttribute('aria-busy');
        document.removeEventListener('keydown', cancel);
        pendingActions.delete(opener);
    });
    pendingActions.set(opener, pending);
    return pending;
}

export const loadHtml2Canvas = (...args) => loadShareRenderer().then(module => module.loadHtml2Canvas(...args));
export const captureBrandedChamberShare = (...args) => loadShareRenderer().then(module => module.captureBrandedChamberShare(...args));
export const captureNetworkMomentShare = (...args) => loadShareRenderer().then(module => module.captureNetworkMomentShare(...args));
export const captureProtocol = (...args) => loadShareRenderer().then(module => module.captureProtocol(...args));
export const captureTimeline = (...args) => loadShareRenderer().then(module => module.captureTimeline(...args));

// Existing callers await loadHtml2Canvas/capture before opening the preview;
// preserve their synchronous modal creation once the renderer is present.
export function showShareModal(...args) {
    if (renderer) return renderer.showShareModal(...args);
    return loadShareRenderer().then(module => module.showShareModal(...args));
}

window.captureProtocol = (...args) => runShareAction(document.activeElement || document.body, module => module.captureProtocol(...args));
window.captureProtocolHistory = (...args) => runShareAction(document.activeElement || document.body, module => module.captureProtocolHistory(...args));
window.captureHistoricalData = (...args) => runShareAction(document.activeElement || document.body, module => module.captureHistoricalData(...args));

/**
 * Initialize share functionality
 */
export function initShare() {
    const shareBtn = document.getElementById('share-btn');
    if (shareBtn) {
        if (!shareBtn.dataset.dashboardShareWired) {
            shareBtn.dataset.dashboardShareWired = '1';
            shareBtn.addEventListener('click', () => runShareAction(shareBtn, module => module.captureAndShare()));
        }
    }
    
    // Add per-card share buttons
    addCardShareButtons();
}

export function ensureCardShareButton(card) {
    if (!card) return null;
    let btn = card.querySelector(':scope > .card-share-btn');
    if (!btn) {
        btn = document.createElement('button');
        btn.className = 'card-share-btn';
        card.appendChild(btn);
    }

    btn.type = 'button';
    if (!btn.querySelector('svg.card-share-icon')) btn.innerHTML = CARD_SHARE_ICON_SVG;
    btn.title = 'Share this card';
    btn.setAttribute('aria-label', 'Share this card');

    if (!btn.dataset.cardShareWired) {
        btn.dataset.cardShareWired = '1';
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            runShareAction(btn, module => module.captureCard(card));
        });
    }

    return btn;
}

/**
 * Add share buttons to all stat cards
 */
function addCardShareButtons() {
    document.querySelectorAll('.stat-card').forEach(ensureCardShareButton);
}

/**
 * Initialize protocol share buttons on timeline items + timeline share button
 */
export async function initProtocolShare() {
    const data = await loadDataAsset('protocolData').catch(() => null);
    if (!data) return;

    const protocols = data.protocols;

    // Wire up per-protocol share on timeline items
    const timelineEl = document.getElementById('upgrade-timeline');
    if (timelineEl && !timelineEl.dataset.protocolShareWired) {
        timelineEl.addEventListener('click', (e) => {
            const item = e.target.closest('.timeline-item');
            if (!item) return;
            if (item.classList.contains('contentious')) return;
            const name = item.getAttribute('data-protocol');
            if (!name) return;
            const protocol = protocols.find(p => p.name === name);
            if (protocol) runShareAction(item, module => module.captureProtocol(protocol));
        });
        timelineEl.dataset.protocolShareWired = '1';
    }

    // Add "Share Timeline" button
    const badgesContainer = document.querySelector('.upgrade-badges');
    const historyHeader = document.querySelector('#protocol-history-chamber-modal .protocol-history-feature-panel')
        || document.querySelector('#protocol-history-feature .section-header');
    const timelineButtonHost = badgesContainer || historyHeader;
    if (timelineButtonHost) {
        let btn = timelineButtonHost.querySelector(':scope > .timeline-share-btn');
        if (!btn) {
            btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'timeline-share-btn';
            btn.textContent = 'Timeline image';
            btn.setAttribute('aria-label', 'Share the full protocol timeline');
            btn.title = 'Share the full protocol timeline';
            btn.classList.add('protocol-history-chamber-link');
            if (badgesContainer) badgesContainer.insertBefore(btn, badgesContainer.firstChild);
            else timelineButtonHost.appendChild(btn);
        }
        if (!btn.dataset.protocolShareButtonWired) {
            btn.addEventListener('click', () => runShareAction(btn, module => module.captureTimeline(protocols)));
            btn.dataset.protocolShareButtonWired = '1';
        }

        const timelineSection = document.querySelector('#protocol-history-chamber-modal .protocol-history-content')
            || document.querySelector('#protocol-history-feature')
            || document.querySelector('.upgrade-clock-content');
        if (timelineSection && !timelineSection.dataset.timelineShareHoverWired) {
            timelineSection.dataset.timelineShareHoverWired = '1';
        }
    }
}
