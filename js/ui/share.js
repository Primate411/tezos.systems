/**
 * Share/Screenshot functionality for tezos.systems
 */

let html2canvasLoaded = false;
let _html2canvasPromise = null;

const CARD_SHARE_ICON_SVG = '<svg class="card-share-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 4h-5L7.8 6H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-2.8L14.5 4Z"/><circle cx="12" cy="13" r="3.2"/></svg>';
const CARD_SHARE_LOADING_ICON = '<span class="card-share-loading" aria-hidden="true">...</span>';

// Mobile devices have strict canvas size limits (iOS Safari ~16MP)
// Use scale 1 on mobile to avoid OOM failures
const IS_MOBILE_UA = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
const CAPTURE_SCALE = IS_MOBILE_UA ? 1 : 2;

/**
 * Escape HTML special characters for safe injection into innerHTML
 */
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Fix html2canvas word-spacing bug: force explicit neutral word-spacing on text elements
 * before capture, returns a restore function to call after.
 */
async function fixWordSpacing(container) {
    // Wait for all fonts to load before capture (prevents metric mismatch)
    if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
    }
    const els = container.querySelectorAll('*');
    const orig = [];
    els.forEach(el => {
        orig.push(el.style.wordSpacing);
        if (!el.style.wordSpacing || el.style.wordSpacing === 'normal') {
            el.style.wordSpacing = '0px';
        }
    });
    return () => els.forEach((el, i) => { el.style.wordSpacing = orig[i]; });
}

// Tweet data loaded lazily from tweets.json
let _tweetsData = null;
async function loadTweetsData() {
    if (_tweetsData) return _tweetsData;
    try {
        const resp = await fetch('/data/tweets.json');
        _tweetsData = await resp.json();
        return _tweetsData;
    } catch (e) {
        console.error("Failed to load tweets.json", e);
        return null;
    }
}

// Live APY values — updated by app.js via setLiveAPY()
let _liveAPY = { delegateAPY: null, bakerAPY: null };

/**
 * Set live APY values for tweet template substitution.
 * Called by app.js when staking data is fetched.
 * @param {number} delegateAPY - delegation APY (e.g. 3.1)
 * @param {number} bakerAPY - baker/staker APY (e.g. 9.2)
 */
export function setLiveAPY(delegateAPY, bakerAPY) {
    _liveAPY = { delegateAPY, bakerAPY };
}

/**
 * Substitute placeholders in tweet text.
 * Merges live APY values into replacements automatically.
 */
function substituteTweet(template, replacements) {
    // Build APY strings (e.g. "3.1" or "~3.1")
    const apyReplacements = {};
    if (_liveAPY.delegateAPY !== null) {
        apyReplacements.delegateAPY = _liveAPY.delegateAPY.toFixed(1);
    }
    if (_liveAPY.bakerAPY !== null) {
        apyReplacements.bakerAPY = _liveAPY.bakerAPY.toFixed(1);
    }

    const allReplacements = { ...apyReplacements, ...replacements };
    let text = template;
    for (const [key, val] of Object.entries(allReplacements)) {
        text = text.replace(new RegExp("\\{" + key + "\\}", "g"), val);
    }
    return text;
}

/**
 * Get protocol-specific tweet options, falling back to generic
 */
async function getProtocolTweetOptions(protocol, num, total) {
    const data = await loadTweetsData();
    if (!data) return [{ label: "📊 Standard", text: `Tezos upgrade: ${protocol.name}` }];
    const replacements = { name: protocol.name, num: String(num), headline: protocol.headline, total: String(total) };
    const specific = data.PROTOCOL_TWEET_OPTIONS_BY_NAME[protocol.name];
    const options = specific || data.PROTOCOL_TWEET_OPTIONS_GENERIC;
    return options.map(o => ({
        label: o.label,
        text: substituteTweet(o.text, replacements)
    }));
}

const TWEET_SUFFIX = '\n\ntezos.systems';
const DASHBOARD_TWEET = 'Real-time Tezos network stats — bakers, staking, governance, burns, and more.\n\ntezos.systems';

/**
 * Load html2canvas dynamically
 */
export async function loadHtml2Canvas() {
    if (window.html2canvas) {
        html2canvasLoaded = true;
        _html2canvasPromise = null;
        return;
    }
    if (html2canvasLoaded) return;
    if (_html2canvasPromise) return _html2canvasPromise;
    
    _html2canvasPromise = new Promise((resolve, reject) => {
        // Check if script is already in DOM (loading or errored)
        const existing = document.querySelector('script[src*="html2canvas"]');
        if (existing) {
            if (window.html2canvas) {
                html2canvasLoaded = true;
                _html2canvasPromise = null;
                resolve();
                return;
            }
            // Already added to DOM — wait for it or reuse
            if (html2canvasLoaded) {
                resolve();
                return;
            }
            existing.addEventListener('load', () => { html2canvasLoaded = true; resolve(); }, { once: true });
            existing.addEventListener('error', reject, { once: true });
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
        script.onload = () => {
            html2canvasLoaded = true;
            _html2canvasPromise = null;
            resolve();
        };
        script.onerror = () => {
            _html2canvasPromise = null;
            reject(new Error('Failed to load html2canvas'));
        };
        document.head.appendChild(script);
    });

    return _html2canvasPromise;
}

/**
 * Get change direction from a card's trend arrow
 */
function getCardChange(card) {
    if (!card) return '';
    const trend = card.querySelector('.trend-arrow');
    if (!trend) return '';
    if (trend.classList.contains('up')) return 'up';
    if (trend.classList.contains('down')) return 'down';
    return 'neutral';
}

/**
 * Shuffle array in-place (Fisher-Yates)
 */
function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

/**
 * Pick a random subset of options, ensuring category diversity
 */
function pickRandomOptions(allOptions, count = 4) {
    if (allOptions.length <= count) return [...allOptions];
    // Try to get diverse categories
    const byCategory = {};
    allOptions.forEach(o => {
        const cat = o.label.split(' ')[1] || o.label;
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(o);
    });
    const categories = Object.keys(byCategory);
    shuffleArray(categories);
    const picked = [];
    // One from each category first
    for (const cat of categories) {
        if (picked.length >= count) break;
        const items = byCategory[cat];
        picked.push(items[Math.floor(Math.random() * items.length)]);
    }
    // Fill remaining slots randomly from unpicked
    if (picked.length < count) {
        const remaining = allOptions.filter(o => !picked.includes(o));
        shuffleArray(remaining);
        picked.push(...remaining.slice(0, count - picked.length));
    }
    return shuffleArray(picked);
}

/**
 * Get all tweet options for a card
 */
async function getTweetOptions(card) {
    if (!card) return [{ label: '📊 Standard', text: DASHBOARD_TWEET }];
    const stat = card.getAttribute('data-stat');
    const valueFront = card.querySelector('.stat-value');
    const value = valueFront ? valueFront.textContent.trim() : '';
    const change = getCardChange(card);
    const data = await loadTweetsData();
    const options = data?.TWEET_OPTIONS?.[stat];
    if (options && value) {
        return options.map(o => {
            // Handle conditional tweets (textDown/textUp)
            let template;
            if (o.textDown !== undefined) {
                template = change === 'down' ? o.textDown : o.textUp;
            } else {
                template = o.text;
            }
            return { label: o.label, text: substituteTweet(template, { value, change }) + TWEET_SUFFIX };
        });
    }
    const label = card.querySelector('.stat-label');
    const labelText = label ? label.textContent.trim() : 'Tezos stats';
    return [{ label: '📊 Standard', text: `${labelText}: ${value}\n\ntezos.systems` }];
}

/**
 * Get randomized subset of tweet options for display
 */
async function getRandomTweetOptions(card) {
    const all = await getTweetOptions(card);
    return pickRandomOptions(all, 4);
}

/**
 * Get smart tweet text for a card (first option, backward compat)
 */
async function getTweetText(card) {
    return (await getTweetOptions(card))[0].text;
}

/**
 * Get human-readable card title
 */
function getCardTitle(card) {
    if (!card) return 'Dashboard';
    const label = card.querySelector('.stat-label');
    return label ? label.textContent.trim() : 'Stat';
}

function getShareSectionName(titleEl) {
    if (!titleEl) return '';
    const fullTitle = titleEl.querySelector('.full-title')?.textContent.trim();
    if (fullTitle) {
        const prefix = Array.from(titleEl.childNodes)
            .filter(n => n.nodeType === Node.TEXT_NODE)
            .map(n => n.textContent.trim())
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
        return `${prefix} ${fullTitle}`.replace(/\s+/g, ' ').trim();
    }
    const clone = titleEl.cloneNode(true);
    clone.querySelectorAll('.section-chevron, .short-title').forEach(el => el.remove());
    return clone.textContent.replace(/\s+/g, ' ').trim();
}

function isCapturableSection(section) {
    const style = getComputedStyle(section);
    return style.display !== 'none' && style.visibility !== 'hidden';
}

/**
 * Initialize share functionality
 */
export function initShare() {
    const shareBtn = document.getElementById('share-btn');
    if (shareBtn) {
        shareBtn.addEventListener('click', captureAndShare);
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
            captureCard(card);
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

function isChamberShareCard(card) {
    return card?.classList?.contains('chamber-entry-card');
}

function compactShareText(node) {
    return node?.textContent?.replace(/\s+/g, ' ').trim() || '';
}

function isVisibleForShare(node) {
    if (!node || node.hidden) return false;
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const box = node.getBoundingClientRect();
    return box.width > 0 && box.height > 0;
}

function pushUniqueLine(lines, value) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text || text === '...' || /^loading/i.test(text)) return;
    if (lines.some((line) => line.toLowerCase() === text.toLowerCase())) return;
    lines.push(text);
}

function getChamberShareRoute(card) {
    const hash = card.querySelector(':scope > .card-copy-link')?.dataset?.copyHash || '';
    const routes = {
        '#chamber': '/chamber/',
        '#health': '/health/',
        '#tezosx': '/tezosx/',
        '#l2chamber': '/l2chamber/',
        '#tz4': '/tz4/',
        '#lb': '/lb/',
        '#ledger-flow': '/ledger-flow/',
        '#domains': '/domains/',
        '#tezos-domains': '/domains/'
    };
    if (routes[hash]) return `tezos.systems${routes[hash]}`;
    if (hash === '#protocol-history') return 'tezos.systems/#protocol-history';
    return 'tezos.systems/#chambers';
}

function getChamberShareSummary(card) {
    const front = card.querySelector(':scope .card-front');
    const title = getCardTitle(card);
    const value = compactShareText(front?.querySelector('.stat-value')) || title;
    const detailLines = [];
    const highlightLines = [];

    front?.querySelectorAll('.stat-description, .chamber-entry-status, .network-health-status, .tezlink-entry-value-label')
        .forEach((node) => {
            if (isVisibleForShare(node)) pushUniqueLine(detailLines, compactShareText(node));
        });

    front?.querySelectorAll([
        '.chamber-entry-metric',
        '.tezlink-entry-metric',
        '.etherlink-gov-entry-metric',
        '.network-health-period',
        '.tz4-entry-preview-title',
        '.tz4-entry-preview-row',
        '.health-live-tape-row',
        '.lb-entry-vote-row',
        '.tezlink-tape-row',
        '.ledger-flow-entry-metrics .chamber-entry-metric',
        '.protocol-history-entry-count',
        '.protocol-history-entry-current',
        '.protocol-history-entry-facets span',
        '.protocol-history-entry-spine-item'
    ].join(',')).forEach((node) => {
        if (isVisibleForShare(node)) pushUniqueLine(highlightLines, compactShareText(node));
    });

    const freshness = card.dataset.updatedLabel
        || compactShareText(front?.querySelector('.chamber-entry-freshness'))
        || new Date().toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

    return {
        title,
        value,
        details: detailLines.slice(0, 3),
        highlights: highlightLines.slice(0, 5),
        freshness,
        route: getChamberShareRoute(card)
    };
}

function convertCloneCanvases(sourceCard, clone) {
    const sourceCanvases = new Map();
    sourceCard.querySelectorAll('canvas').forEach((canvas) => {
        if (canvas.id) sourceCanvases.set(canvas.id, canvas);
    });

    clone.querySelectorAll('canvas').forEach((cloneCanvas) => {
        const sourceCanvas = sourceCanvases.get(cloneCanvas.id);
        if (!sourceCanvas || sourceCanvas.width <= 0 || sourceCanvas.height <= 0) return;
        try {
            const img = document.createElement('img');
            img.src = sourceCanvas.toDataURL('image/png');
            img.width = sourceCanvas.width;
            img.height = sourceCanvas.height;
            img.style.cssText = cloneCanvas.style.cssText || 'width:100%;height:100%;display:block;';
            cloneCanvas.replaceWith(img);
        } catch {
            // Some canvases may be tainted or mid-render; keep the live clone intact.
        }
    });
}

const HTML2CANVAS_UNSUPPORTED_COLOR_RE = /\b(?:color|color-mix|lab|lch|oklab|oklch)\(/i;

function hasHtml2CanvasUnsupportedColor(value) {
    return HTML2CANVAS_UNSUPPORTED_COLOR_RE.test(String(value || ''));
}

function sanitizeCaptureModernColorStyles(root, {
    textColor = '#ffffff',
    panelBg = 'rgba(255,255,255,0.055)',
    panelBorder = 'rgba(255,255,255,0.14)'
} = {}) {
    if (!root) return;

    const nodes = [root, ...root.querySelectorAll('*')];
    const transparent = 'rgba(0,0,0,0)';
    const borderProps = [
        'borderTopColor',
        'borderRightColor',
        'borderBottomColor',
        'borderLeftColor',
        'outlineColor',
        'columnRuleColor',
        'textDecorationColor',
        'caretColor'
    ];

    nodes.forEach((node) => {
        const computed = getComputedStyle(node);

        if (hasHtml2CanvasUnsupportedColor(computed.color)) node.style.color = textColor;
        if (hasHtml2CanvasUnsupportedColor(computed.backgroundColor)) node.style.backgroundColor = transparent;
        if (hasHtml2CanvasUnsupportedColor(computed.backgroundImage)) node.style.backgroundImage = 'none';
        if (hasHtml2CanvasUnsupportedColor(computed.boxShadow)) node.style.boxShadow = 'none';
        if (hasHtml2CanvasUnsupportedColor(computed.textShadow)) node.style.textShadow = 'none';
        if (hasHtml2CanvasUnsupportedColor(computed.filter)) node.style.filter = 'none';

        borderProps.forEach((prop) => {
            if (hasHtml2CanvasUnsupportedColor(computed[prop])) node.style[prop] = panelBorder;
        });

        const fill = computed.getPropertyValue('fill');
        if (fill !== 'none' && hasHtml2CanvasUnsupportedColor(fill)) node.style.fill = panelBg;

        const stroke = computed.getPropertyValue('stroke');
        if (stroke !== 'none' && hasHtml2CanvasUnsupportedColor(stroke)) node.style.stroke = panelBorder;
    });
}

function cloneChamberPanel(card) {
    const clone = card.cloneNode(true);
    clone.classList.add('chamber-share-source-card');
    clone.removeAttribute('title');
    clone.removeAttribute('role');
    clone.removeAttribute('tabindex');
    clone.querySelectorAll([
        '.card-share-btn',
        '.card-copy-link',
        '.card-info-btn',
        '.card-tooltip',
        '.card-history-btn',
        '.card-back'
    ].join(',')).forEach((node) => node.remove());
    clone.querySelectorAll('.chamber-entry-footer > :not(.chamber-entry-freshness)')
        .forEach((node) => node.remove());
    clone.classList.remove('chamber-entry-live', 'chamber-entry-risk', 'chamber-data-stale');
    clone.querySelectorAll('[role="button"]').forEach((node) => {
        node.removeAttribute('role');
        node.removeAttribute('tabindex');
    });
    convertCloneCanvases(card, clone);
    return clone;
}

/**
 * Capture a Chamber entry card with the visible panel content preserved.
 */
async function captureChamberCard(card) {
    let wrapper = null;
    let restoreSpacing = null;

    try {
        await loadHtml2Canvas();

        const {
            brand: brandColor,
            bg: bgColor,
            brandRgb,
            isClean,
            isDark
        } = getThemeColors();
        const summary = getChamberShareSummary(card);
        const panelClone = cloneChamberPanel(card);
        const textColor = isClean ? '#101827' : '#ffffff';
        const softText = isClean ? 'rgba(0,0,0,0.58)' : isDark ? 'rgba(232,232,232,0.62)' : 'rgba(255,255,255,0.64)';
        const mutedText = isClean ? 'rgba(0,0,0,0.40)' : isDark ? 'rgba(232,232,232,0.44)' : 'rgba(255,255,255,0.42)';
        const panelBg = isClean ? 'rgba(255,255,255,0.78)' : isDark ? 'rgba(255,255,255,0.055)' : `rgba(${brandRgb},0.055)`;
        const panelBorder = isClean ? 'rgba(37,99,235,0.16)' : isDark ? 'rgba(255,255,255,0.12)' : `rgba(${brandRgb},0.22)`;
        const highlightHtml = summary.highlights.length
            ? summary.highlights.map((line) => `
                <div style="padding:12px 14px;border:1px solid ${panelBorder};border-radius:10px;background:${panelBg};font-size:17px;line-height:1.25;color:${softText};font-family:'JetBrains Mono',monospace;overflow-wrap:anywhere;">${escapeHtml(line)}</div>
            `).join('')
            : `<div style="padding:12px 14px;border:1px solid ${panelBorder};border-radius:10px;background:${panelBg};font-size:17px;line-height:1.25;color:${softText};">Live Chamber panel snapshot</div>`;

        wrapper = document.createElement('div');
        wrapper.style.cssText = `
            position: fixed; top: -9999px; left: -9999px;
            width: 1200px; height: 630px;
            background: ${bgColor};
            font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'SF Pro Display', sans-serif;
            color: ${textColor};
            overflow: hidden;
            box-sizing: border-box;
        `;

        const shareStyle = document.createElement('style');
        shareStyle.textContent = `
            .chamber-share-panel *,
            .chamber-share-panel *::before,
            .chamber-share-panel *::after {
                filter: none !important;
                text-shadow: none !important;
                box-shadow: none !important;
                border-color: rgba(${brandRgb},0.22) !important;
            }
            .chamber-share-panel *::before,
            .chamber-share-panel *::after {
                content: none !important;
                background: none !important;
                border-color: transparent !important;
            }
            .chamber-share-panel .stat-card {
                width: 100% !important;
                height: 100% !important;
                min-height: 0 !important;
                margin: 0 !important;
                transform: none !important;
                overflow: hidden !important;
                border: 1px solid ${panelBorder} !important;
                border-radius: 18px !important;
                background: ${panelBg} !important;
                box-shadow: 0 26px 68px rgba(0,0,0,0.28), inset 0 0 40px rgba(${brandRgb},0.035) !important;
                pointer-events: none !important;
            }
            .chamber-share-panel .stat-card:hover {
                transform: none !important;
            }
            .chamber-share-panel .card-inner {
                position: relative !important;
                width: 100% !important;
                height: 100% !important;
                transform: none !important;
                pointer-events: none !important;
            }
            .chamber-share-panel .card-front {
                position: relative !important;
                width: 100% !important;
                height: 100% !important;
                min-height: 0 !important;
                padding: 32px 36px 62px !important;
                overflow: hidden !important;
                box-sizing: border-box !important;
                backface-visibility: visible !important;
                -webkit-backface-visibility: visible !important;
            }
            .chamber-share-panel .card-back {
                display: none !important;
            }
            .chamber-share-panel .stat-label {
                font-size: 17px !important;
                letter-spacing: 0 !important;
            }
            .chamber-share-panel .stat-description,
            .chamber-share-panel .chamber-entry-status {
                font-size: 16px !important;
                line-height: 1.35 !important;
            }
            .chamber-share-panel .stat-value {
                max-width: 100% !important;
            }
            .chamber-share-panel .chamber-entry-footer {
                left: 36px !important;
                right: 36px !important;
                bottom: 22px !important;
                min-height: 28px !important;
                padding-top: 8px !important;
            }
            .chamber-share-panel .chamber-entry-freshness,
            .chamber-share-panel .chamber-entry-footer > span:last-child {
                font-size: 11px !important;
            }
            .chamber-share-panel .chamber-entry-footer > span:last-child {
                min-height: 25px !important;
            }
            .chamber-share-panel .tz4-entry-preview-title,
            .chamber-share-panel .tz4-entry-preview-row,
            .chamber-share-panel .tezlink-tape-row,
            .chamber-share-panel .network-health-period,
            .chamber-share-panel .chamber-entry-metric span,
            .chamber-share-panel .tezlink-entry-metric span,
            .chamber-share-panel .etherlink-gov-entry-metric span {
                font-size: 12px !important;
            }
            .chamber-share-panel .chamber-entry-metric strong,
            .chamber-share-panel .tezlink-entry-metric strong,
            .chamber-share-panel .etherlink-gov-entry-metric strong {
                font-size: 15px !important;
            }
            .chamber-share-panel .tezlink-entry-tape,
            .chamber-share-panel .health-live-tape {
                max-height: 150px !important;
                overflow: hidden !important;
            }
        `;
        wrapper.appendChild(shareStyle);

        const glow = document.createElement('div');
        glow.style.cssText = `
            position:absolute;inset:0;pointer-events:none;
            background:
                radial-gradient(ellipse at 17% 18%, rgba(${brandRgb},0.14), transparent 42%),
                radial-gradient(ellipse at 86% 24%, rgba(124,92,246,0.14), transparent 38%),
                radial-gradient(ellipse at 68% 90%, rgba(${brandRgb},0.08), transparent 44%);
        `;
        wrapper.appendChild(glow);

        const border = document.createElement('div');
        border.style.cssText = `
            position:absolute;inset:18px;border:1px solid ${panelBorder};border-radius:18px;
            box-shadow:${isClean || isDark ? '0 18px 52px rgba(0,0,0,0.12)' : `inset 0 0 48px rgba(${brandRgb},0.045), 0 0 30px rgba(${brandRgb},0.08)`};
            pointer-events:none;
        `;
        wrapper.appendChild(border);

        const content = document.createElement('div');
        content.style.cssText = `
            position:relative;z-index:1;width:100%;height:100%;box-sizing:border-box;
            display:grid;grid-template-columns:390px minmax(0,1fr);gap:34px;
            padding:44px 52px 40px;
        `;

        const left = document.createElement('section');
        left.style.cssText = 'display:flex;flex-direction:column;min-width:0;';
        left.innerHTML = `
            <div style="font-family:'Orbitron',sans-serif;font-size:26px;font-weight:900;letter-spacing:0;text-transform:uppercase;color:${brandColor};text-shadow:${isClean || isDark ? 'none' : `0 0 28px rgba(${brandRgb},0.45)`};">TEZOS SYSTEMS</div>
            <div style="width:210px;height:1px;background:${brandColor};opacity:0.72;margin:14px 0 26px;"></div>
            <div style="font-size:13px;font-weight:850;letter-spacing:0;text-transform:uppercase;color:${mutedText};">Chambers · Panel Snapshot</div>
            <h1 style="margin:13px 0 12px;font-size:${summary.title.length > 18 ? '42px' : '50px'};line-height:1.02;font-weight:850;letter-spacing:0;color:${brandColor};overflow-wrap:anywhere;">${escapeHtml(summary.title)}</h1>
            <div style="font-size:${summary.value.length > 18 ? '30px' : '36px'};line-height:1.08;font-weight:850;color:${textColor};margin-bottom:14px;overflow-wrap:anywhere;">${escapeHtml(summary.value)}</div>
            ${summary.details.map((line) => `<p style="margin:0 0 8px;font-size:18px;line-height:1.34;color:${softText};">${escapeHtml(line)}</p>`).join('')}
            <div style="display:grid;gap:10px;margin-top:18px;">
                ${highlightHtml}
            </div>
            <div style="margin-top:auto;padding-top:18px;display:flex;flex-direction:column;gap:8px;font-size:15px;color:${mutedText};">
                <span>${escapeHtml(summary.freshness)}</span>
                <span style="color:${brandColor};font-weight:850;letter-spacing:0;">${escapeHtml(summary.route)}</span>
            </div>
        `;

        const right = document.createElement('section');
        right.style.cssText = 'min-width:0;display:flex;flex-direction:column;gap:14px;';
        right.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:18px;">
                <div style="font-size:13px;font-weight:850;letter-spacing:0;text-transform:uppercase;color:${softText};">Visible Chamber Panel</div>
                <div style="font-size:13px;color:${mutedText};">non-detailed view</div>
            </div>
        `;
        const panel = document.createElement('div');
        panel.className = 'chamber-share-panel';
        panel.style.cssText = `
            min-height:0;flex:1;display:flex;align-items:stretch;
            border:1px solid ${panelBorder};border-radius:20px;background:${panelBg};
            padding:18px;box-sizing:border-box;overflow:hidden;
        `;
        panel.appendChild(panelClone);
        right.appendChild(panel);

        content.appendChild(left);
        content.appendChild(right);
        wrapper.appendChild(content);
        document.body.appendChild(wrapper);
        sanitizeCaptureModernColorStyles(panelClone, { textColor, panelBg, panelBorder });

        restoreSpacing = await fixWordSpacing(wrapper);
        const canvas = await window.html2canvas(wrapper, {
            backgroundColor: bgColor,
            scale: 1,
            useCORS: true,
            logging: false,
            width: 1200,
            height: 630,
            windowWidth: 1200
        });

        restoreSpacing();
        restoreSpacing = null;
        wrapper.remove();
        wrapper = null;

        const allOptions = await getTweetOptions(card);
        const displayOptions = pickRandomOptions(allOptions, 4);
        showShareModal(canvas, displayOptions, `${summary.title} Chamber`, allOptions);
    } catch (error) {
        console.error('Chamber card screenshot failed:', error);
        showNotification('Screenshot failed. Try again.', 'error');
    } finally {
        if (restoreSpacing) restoreSpacing();
        if (wrapper?.isConnected) wrapper.remove();
    }
}

/**
 * Capture a single card and show share modal
 */
async function captureCard(card) {
    const btn = card.querySelector('.card-share-btn');
    let wrapper = null;
    let restoreSpacing = null;
    if (btn) {
        btn.innerHTML = CARD_SHARE_LOADING_ICON;
        btn.style.opacity = '1';
    }
    
    try {
        if (isChamberShareCard(card)) {
            await captureChamberCard(card);
            return;
        }

        await loadHtml2Canvas();
        
        const {
            brand: brandColor,
            bg: bgColor,
            isClean,
            isDark,
            isMatrix,
            isBubblegum
        } = getThemeColors();
        
        // Read data from the card
        const statLabel = card.querySelector('.stat-label')?.textContent.trim() || '';
        const statValue = card.querySelector('.stat-value')?.textContent.trim() || '';
        const trendEl = card.querySelector('.trend-arrow');
        const trendText = trendEl ? trendEl.textContent.trim() : '';
        const trendClass = trendEl ? (trendEl.classList.contains('up') ? 'up' : trendEl.classList.contains('down') ? 'down' : 'neutral') : '';
        
        // Check for issuance breakdown subtitle (e.g. "3.18% Protocol · 0.24% LB")
        const breakdownEl = card.querySelector('.issuance-breakdown');
        const breakdownText = breakdownEl ? breakdownEl.textContent.trim() : '';
        
        // Get section name
        const section = card.closest('.stats-section');
        const sectionName = section?.querySelector('.section-title')?.textContent.trim() || '';
        
        // Try to extract sparkline data from Chart.js
        let sparklineData = null;
        const sparkCanvas = card.querySelector('.sparkline-chart');
        if (sparkCanvas && typeof Chart !== 'undefined') {
            try {
                const chart = Chart.getChart(sparkCanvas);
                if (chart && chart.data.datasets[0]) {
                    sparklineData = chart.data.datasets[0].data.slice();
                }
            } catch (e) { /* Chart.js not available, skip */ }
        }
        
        // Create branded 1200x630 wrapper
        wrapper = document.createElement('div');
        wrapper.style.cssText = `
            position: fixed; top: -9999px; left: -9999px;
            width: 600px; height: 630px;
            background: ${bgColor};
            font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'SF Pro Display', sans-serif;
            color: white;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 0;
        `;
        
        // Background gradients for depth
        const gradient = document.createElement('div');
        gradient.style.cssText = `
            position: absolute; top: 0; left: 0; right: 0; bottom: 0; pointer-events: none;
            background: ${isClean || isDark ? 'none' : `
                radial-gradient(ellipse at 30% 20%, ${isMatrix ? 'rgba(0,255,0,0.08)' : isBubblegum ? 'rgba(255,105,180,0.08)' : 'rgba(0,212,255,0.08)'} 0%, transparent 50%),
                radial-gradient(ellipse at 70% 80%, ${isMatrix ? 'rgba(0,200,0,0.05)' : isBubblegum ? 'rgba(196,122,255,0.05)' : 'rgba(183,148,246,0.05)'} 0%, transparent 50%),
                radial-gradient(circle at 50% 50%, ${isMatrix ? 'rgba(0,255,0,0.03)' : isBubblegum ? 'rgba(255,105,180,0.03)' : 'rgba(0,212,255,0.03)'} 0%, transparent 70%)`};
        `;
        wrapper.appendChild(gradient);
        
        // Inner border glow
        const borderGlow = document.createElement('div');
        borderGlow.style.cssText = `
            position: absolute; top: 12px; left: 12px; right: 12px; bottom: 12px;
            border: 1px solid ${isClean ? 'rgba(0,0,0,0.08)' : isDark ? 'rgba(51,51,51,0.5)' : isMatrix ? 'rgba(0,255,0,0.15)' : 'rgba(0,212,255,0.15)'};
            border-radius: 12px;
            box-shadow: ${isClean || isDark ? '0 1px 3px rgba(0,0,0,0.06)' : `inset 0 0 30px ${isMatrix ? 'rgba(0,255,0,0.03)' : 'rgba(0,212,255,0.03)'},
                        0 0 15px ${isMatrix ? 'rgba(0,255,0,0.05)' : 'rgba(0,212,255,0.05)'}`};
            pointer-events: none;
        `;
        wrapper.appendChild(borderGlow);
        
        // Content container
        const content = document.createElement('div');
        content.style.cssText = `
            position: relative; z-index: 1;
            width: 100%; height: 100%;
            display: flex; flex-direction: column;
            align-items: center; justify-content: center;
            padding: 40px 60px;
            box-sizing: border-box;
        `;
        
        // Title: TEZOS SYSTEMS
        const title = document.createElement('div');
        title.style.cssText = `
            font-family: 'Orbitron', sans-serif;
            font-size: 28px; font-weight: 900;
            color: ${brandColor};
            letter-spacing: 4px;
            text-transform: uppercase;
            text-shadow: ${isClean || isDark ? 'none' : `0 0 30px ${isMatrix ? 'rgba(0,255,0,0.5)' : 'rgba(0,212,255,0.5)'},
                         0 0 60px ${isMatrix ? 'rgba(0,255,0,0.3)' : 'rgba(0,212,255,0.3)'},
                         0 0 90px ${isMatrix ? 'rgba(0,255,0,0.1)' : 'rgba(0,212,255,0.1)'}`};
            margin-bottom: 6px;
        `;
        title.textContent = 'TEZOS SYSTEMS';
        content.appendChild(title);
        
        // Divider line
        const divider = document.createElement('div');
        divider.style.cssText = `
            width: 200px; height: 1px;
            background: linear-gradient(90deg, transparent, ${isClean ? 'rgba(37,99,235,0.3)' : isDark ? 'rgba(200,200,200,0.3)' : isMatrix ? 'rgba(0,255,0,0.4)' : 'rgba(0,212,255,0.4)'}, transparent);
            margin: 10px 0 16px 0;
        `;
        content.appendChild(divider);
        
        // Section label
        if (sectionName) {
            const sectionEl = document.createElement('div');
            sectionEl.style.cssText = `
                font-size: 14px; font-weight: 600;
                color: ${isClean ? 'rgba(37,99,235,0.5)' : isDark ? 'rgba(200,200,200,0.4)' : isMatrix ? 'rgba(0,255,0,0.4)' : 'rgba(0,212,255,0.4)'};
                text-transform: uppercase;
                letter-spacing: 3px;
                margin-bottom: 20px;
            `;
            sectionEl.textContent = sectionName;
            content.appendChild(sectionEl);
        }
        
        // Stat label
        const labelEl = document.createElement('div');
        labelEl.style.cssText = `
            font-size: 18px; font-weight: 600;
            color: ${isClean ? 'rgba(0,0,0,0.5)' : isDark ? 'rgba(232,232,232,0.5)' : 'rgba(255,255,255,0.5)'};
            text-transform: uppercase;
            letter-spacing: 2px;
            margin-bottom: 12px;
        `;
        labelEl.textContent = statLabel;
        content.appendChild(labelEl);
        
        // HERO stat value
        const valueEl = document.createElement('div');
        valueEl.style.cssText = `
            font-size: 72px; font-weight: 800;
            color: ${brandColor};
            line-height: 1;
            letter-spacing: -2px;
            text-shadow: ${isClean || isDark ? 'none' : `0 0 40px ${isMatrix ? 'rgba(0,255,0,0.4)' : 'rgba(0,212,255,0.4)'},
                         0 0 80px ${isMatrix ? 'rgba(0,255,0,0.2)' : 'rgba(0,212,255,0.2)'}`};
            margin-bottom: 12px;
            text-align: center;
            max-width: 520px;
            overflow: hidden;
        `;
        // Scale down font for long values
        const valLen = statValue.length;
        if (valLen > 12) {
            valueEl.style.fontSize = '40px';
        } else if (valLen > 8) {
            valueEl.style.fontSize = '48px';
        } else if (valLen > 5) {
            valueEl.style.fontSize = '60px';
        }
        valueEl.textContent = statValue;
        content.appendChild(valueEl);
        
        // Issuance breakdown subtitle (Protocol · LB)
        if (breakdownText) {
            const breakdownDiv = document.createElement('div');
            breakdownDiv.style.cssText = `
                font-size: 18px; font-weight: 500;
                color: ${isClean ? 'rgba(0,0,0,0.45)' : isDark ? 'rgba(232,232,232,0.45)' : 'rgba(255,255,255,0.45)'};
                margin-bottom: 12px;
                letter-spacing: 0.5px;
            `;
            breakdownDiv.textContent = breakdownText;
            content.appendChild(breakdownDiv);
        }
        
        // Trend indicator
        if (trendText) {
            const trendColors = { up: '#00ff88', down: '#ff4466', neutral: '#666666' };
            const trendBgColors = { up: 'rgba(0,255,136,0.1)', down: 'rgba(255,68,102,0.1)', neutral: 'rgba(255,255,255,0.05)' };
            const trendColor = trendColors[trendClass] || '#666';
            const trendBg = trendBgColors[trendClass] || 'rgba(255,255,255,0.05)';
            const trendElNew = document.createElement('div');
            trendElNew.style.cssText = `
                font-size: 24px; font-weight: 700;
                color: ${trendColor};
                padding: 6px 18px;
                background: ${trendBg};
                border: 1px solid ${trendColor}33;
                border-radius: 8px;
                margin-bottom: 16px;
                letter-spacing: 0.5px;
            `;
            trendElNew.textContent = trendText;
            content.appendChild(trendElNew);
        }
        
        // Sparkline as SVG (or decorative bars)
        const sparkContainer = document.createElement('div');
        sparkContainer.style.cssText = 'width: 300px; height: 50px; margin-bottom: 8px;';
        
        if (sparklineData && sparklineData.length > 1) {
            // Render as inline SVG polyline
            const w = 300, h = 50;
            const nums = sparklineData.map(Number).filter(n => !isNaN(n));
            const min = Math.min(...nums);
            const max = Math.max(...nums);
            const range = max - min || 1;
            const points = nums.map((v, i) => {
                const x = (i / (nums.length - 1)) * w;
                const y = h - ((v - min) / range) * (h - 4) - 2;
                return `${x.toFixed(1)},${y.toFixed(1)}`;
            }).join(' ');
            
            const sparkColor = isClean ? '#2563EB' : isDark ? '#C8C8C8' : isMatrix ? '#00ff00' : isBubblegum ? '#FF69B4' : '#00d4ff';
            sparkContainer.innerHTML = `
                <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stop-color="${sparkColor}" stop-opacity="0.2"/>
                            <stop offset="100%" stop-color="${sparkColor}" stop-opacity="0"/>
                        </linearGradient>
                    </defs>
                    <polygon points="${(nums.map((v, i) => {
                        const x = (i / (nums.length - 1)) * w;
                        const y = h - ((v - min) / range) * (h - 4) - 2;
                        return `${x.toFixed(1)},${y.toFixed(1)}`;
                    }).join(' '))} ${w},${h} 0,${h}" fill="url(#sparkFill)"/>
                    <polyline points="${points}" fill="none" stroke="${sparkColor}" stroke-width="2" stroke-opacity="0.7" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            `;
        } else {
            // Fallback when no sparkline data available
            sparkContainer.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:12px;color:${isClean ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)'};letter-spacing:1px;text-transform:uppercase;">Historical trend</div>`;
        }
        content.appendChild(sparkContainer);
        
        wrapper.appendChild(content);
        
        // Footer (absolute positioned at bottom)
        const footer = document.createElement('div');
        footer.style.cssText = `
            position: absolute; bottom: 24px; left: 40px; right: 40px;
            display: flex; justify-content: space-between; align-items: center;
            z-index: 1;
        `;
        footer.innerHTML = `
            <span style="font-size: 13px; color: ${isClean ? 'rgba(0,0,0,0.35)' : isDark ? 'rgba(200,200,200,0.4)' : 'rgba(255,255,255,0.3)'};">${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            <span style="font-size: 13px; color: ${brandColor}; font-weight: 600; letter-spacing: 1px;">tezos.systems</span>
            <span style="font-size: 13px; color: ${isClean ? 'rgba(0,0,0,0.35)' : isDark ? 'rgba(200,200,200,0.4)' : 'rgba(255,255,255,0.35)'}; letter-spacing: 0.5px;">Powered by <span style="color: ${brandColor}; font-weight: 600;">Tez Capital</span></span>
        `;
        wrapper.appendChild(footer);
        
        document.body.appendChild(wrapper);
        restoreSpacing = await fixWordSpacing(wrapper);
        
        const canvas = await html2canvas(wrapper, {
            backgroundColor: bgColor,
            scale: CAPTURE_SCALE,
            useCORS: true,
            logging: false,
            width: 600,
            height: 630,
            windowWidth: 600
        });
        
        restoreSpacing();
        restoreSpacing = null;
        wrapper.remove();
        wrapper = null;
        
        const allOptions = await getTweetOptions(card);
        const displayOptions = pickRandomOptions(allOptions, 4);
        const cardTitle = getCardTitle(card);
        showShareModal(canvas, displayOptions, cardTitle, allOptions);
        
    } catch (error) {
        console.error('Card screenshot failed:', error);
        showNotification('Screenshot failed. Try again.', 'error');
    } finally {
        if (restoreSpacing) restoreSpacing();
        if (wrapper?.isConnected) wrapper.remove();
        if (btn) {
            btn.innerHTML = CARD_SHARE_ICON_SVG;
            btn.style.opacity = '';
        }
    }
}

/**
 * Show section picker modal, then capture selected sections
 */
async function captureAndShare() {
    const sections = [];
    // Add Protocols section (upgrade clock)
    const upgradeClock = document.getElementById('upgrade-clock');
    if (upgradeClock) {
        sections.push({ name: 'Protocols', element: upgradeClock });
    }
    document.querySelectorAll('.stats-section').forEach(sec => {
        if (!isCapturableSection(sec)) return;
        const titleEl = sec.querySelector('.section-header .section-title');
        if (titleEl) {
            sections.push({ name: getShareSectionName(titleEl), element: sec });
        }
    });
    
    // Build picker modal
    const existing = document.getElementById('section-picker-modal');
    if (existing) {
        existing._pickerCleanup?.();
        existing.remove();
    }
    
    const modal = document.createElement('div');
    modal.id = 'section-picker-modal';
    modal.className = 'share-modal-overlay';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'section-picker-title');
    modal.innerHTML = `
        <div class="share-modal-content" style="max-width: 460px;">
            <div class="share-modal-header">
                <h3 id="section-picker-title">Select Sections to Capture</h3>
                <button class="share-modal-close" aria-label="Close section picker">×</button>
            </div>
            <div class="section-picker-body">
                <div class="section-picker-toolbar">
                    <span class="section-picker-note">Preview exactly what will become the share image.</span>
                    <button id="section-toggle-all" class="section-picker-toggle" type="button">Deselect All</button>
                </div>
                <div id="section-checkboxes" class="section-picker-list">
                    ${sections.map((s, i) => `
                        <label class="section-picker-option">
                            <input type="checkbox" checked data-section-idx="${i}">
                            <span class="section-picker-label">${escapeHtml(s.name)}</span>
                        </label>
                    `).join('')}
                </div>
            </div>
            <div class="section-picker-actions">
                <button id="section-capture-btn" class="share-action-btn" style="flex: 1;">
                    <span>📸</span> Capture
                </button>
                <button id="section-cancel-btn" class="share-action-btn" style="flex: 0 0 auto;" type="button">
                    Cancel
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('visible'));
    
    const closeModal = () => {
        modal.classList.remove('visible');
        setTimeout(() => modal.remove(), 200);
    };
    const closeWithCleanup = () => {
        modal._pickerCleanup?.();
        closeModal();
    };
    const onKeyDown = (e) => {
        if (e.key === 'Escape') closeWithCleanup();
    };
    document.addEventListener('keydown', onKeyDown);
    modal._pickerCleanup = () => document.removeEventListener('keydown', onKeyDown);
    
    modal.querySelector('.share-modal-close').addEventListener('click', closeWithCleanup);
    modal.querySelector('#section-cancel-btn').addEventListener('click', closeWithCleanup);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeWithCleanup(); });
    
    // Toggle all
    const toggleBtn = modal.querySelector('#section-toggle-all');
    toggleBtn.addEventListener('click', () => {
        const boxes = modal.querySelectorAll('input[type="checkbox"]');
        const allChecked = Array.from(boxes).every(b => b.checked);
        boxes.forEach(b => b.checked = !allChecked);
        toggleBtn.textContent = allChecked ? 'Select All' : 'Deselect All';
    });
    
    // Update toggle text on individual change
    modal.querySelector('#section-checkboxes').addEventListener('change', () => {
        const boxes = modal.querySelectorAll('input[type="checkbox"]');
        const allChecked = Array.from(boxes).every(b => b.checked);
        toggleBtn.textContent = allChecked ? 'Deselect All' : 'Select All';
    });
    
    // Capture button
    modal.querySelector('#section-capture-btn').addEventListener('click', () => {
        const boxes = modal.querySelectorAll('input[type="checkbox"]');
        const selectedIndices = Array.from(boxes).filter(b => b.checked).map(b => parseInt(b.dataset.sectionIdx));
        if (selectedIndices.length === 0) {
            showNotification('Select at least one section.', 'error');
            return;
        }
        const selectedSections = selectedIndices.map(i => sections[i]);
        closeWithCleanup();
        doCaptureAndShare(selectedSections);
    });
}

/**
 * Actually capture the dashboard with selected sections
 */
async function doCaptureAndShare(selectedSections) {
    const shareBtn = document.getElementById('share-btn');
    const originalText = shareBtn?.innerHTML || '';
    let elementsToHide = [];
    let wrapper = null;
    let restoreSpacing = null;
    
    try {
        if (shareBtn) {
            shareBtn.innerHTML = '<span class="share-icon">⏳</span>';
            shareBtn.disabled = true;
        }
        
        await loadHtml2Canvas();
        
        elementsToHide = [
            document.querySelector('.header'),
            document.querySelector('.corner-ribbon'),
            document.getElementById('ultra-canvas'),
            document.getElementById('ultra-selector'),
            document.querySelector('.matrix-rain'),
            ...document.querySelectorAll('.card-share-btn')
        ].filter(Boolean);
        
        elementsToHide.forEach(el => el.style.visibility = 'hidden');
        
        wrapper = document.createElement('div');
        wrapper.id = 'screenshot-wrapper';
        wrapper.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 600px;
            background: ${getComputedStyle(document.body).background};
            padding: 30px;
            z-index: -1;
            overflow: hidden;
        `;
        
        const mainContent = document.querySelector('.main-content');
        const clone = mainContent.cloneNode(true);
        clone.style.cssText = 'margin: 0; padding: 0;';
        
        // Add Protocols section (upgrade-clock is outside .main-content)
        const selectedNames = new Set(selectedSections.map(s => s.name));
        if (selectedNames.has('Protocols')) {
            const ucOriginal = document.getElementById('upgrade-clock');
            if (ucOriginal) {
                const ucClone = ucOriginal.cloneNode(true);
                ucClone.style.marginBottom = '20px';
                // Remove infographic (too tall for capture) and toggle
                ucClone.querySelectorAll('.protocol-infographic, .infographic-toggle, .section-copy-link, .card-copy-link, .upgrade-share-btn, .timeline-share-btn').forEach(el => el.remove());
                clone.insertBefore(ucClone, clone.firstChild);
            }
        }
        
        // Remove card share buttons, history buttons, and info buttons from clone
        clone.querySelectorAll('.card-share-btn, .card-history-btn, .card-copy-link, .card-info-btn, .card-tooltip, .section-copy-link, .feature-copy-link, .upgrade-share-btn, .timeline-share-btn').forEach(el => el.remove());
        
        // Remove unselected sections from clone (upgrade-clock already handled above)
        if (!selectedNames.has('Protocols')) {
            const uc = clone.querySelector('.upgrade-clock');
            if (uc) uc.remove();
        }
        
        clone.querySelectorAll('.stats-section').forEach(sec => {
            const titleEl = sec.querySelector('.section-header .section-title');
            if (titleEl) {
                const cleanName = getShareSectionName(titleEl);
                if (!selectedNames.has(cleanName)) {
                    sec.remove();
                }
            }
        });
        
        // Remove bottom margin/padding on last visible section
        const lastSection = clone.querySelector('.stats-section:last-child');
        if (lastSection) lastSection.style.marginBottom = '0';
        
        // Remove section chevrons and infographic toggle from capture
        clone.querySelectorAll('.section-chevron, .infographic-toggle').forEach(el => el.remove());
        
        // Convert sparkline canvases to images (html2canvas can't render Chart.js canvases from clones)
        document.querySelectorAll('canvas[id$="-sparkline"]').forEach(origCanvas => {
            const cloneCanvas = clone.querySelector('#' + origCanvas.id);
            if (cloneCanvas && origCanvas.width > 0) {
                try {
                    const img = document.createElement('img');
                    img.src = origCanvas.toDataURL('image/png');
                    img.style.cssText = cloneCanvas.style.cssText || 'width:100%;height:100%;';
                    img.width = origCanvas.width;
                    img.height = origCanvas.height;
                    cloneCanvas.parentNode.replaceChild(img, cloneCanvas);
                } catch(e) { /* ignore CORS errors */ }
            }
        });
        
        // Expand any collapsed sections in clone
        clone.querySelectorAll('.stats-section.collapsed').forEach(sec => {
            sec.classList.remove('collapsed');
            var grid = sec.querySelector('.stats-grid');
            if (grid) { grid.style.maxHeight = ''; grid.style.overflow = ''; grid.style.opacity = '1'; }
        });
        
        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 24px;
            padding-bottom: 16px;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        `;
        
        const _secTheme = document.body.getAttribute('data-theme');
        const isMatrix = _secTheme === 'matrix';
        const isClean = _secTheme === 'clean';
        const isDark = _secTheme === 'dark';
        const isBubblegum = _secTheme === 'bubblegum';
        const { brand: brandColor } = getThemeColors();
        
        header.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px;">
                <span style="font-family: 'Orbitron', sans-serif; font-size: 28px; font-weight: 900; color: ${brandColor}; letter-spacing: 2px; text-transform: uppercase; text-shadow: ${isClean || isDark ? 'none' : `0 0 20px ${brandColor}40, 0 0 40px ${brandColor}20`};">TEZOS SYSTEMS</span>
            </div>
            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
                <div style="font-size: 14px; color: ${isClean ? 'rgba(0,0,0,0.5)' : isDark ? 'rgba(232,232,232,0.6)' : 'rgba(255,255,255,0.6)'};">
                    ${new Date().toLocaleString('en-US', { 
                        month: 'short', 
                        day: 'numeric', 
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    })}
                </div>
                <span style="font-size: 13px; color: ${brandColor}; font-weight: 600; letter-spacing: 1px;">tezos.systems</span>
                <span style="font-size: 13px; color: ${isClean ? 'rgba(0,0,0,0.4)' : isDark ? 'rgba(232,232,232,0.4)' : 'rgba(255,255,255,0.4)'}; letter-spacing: 0.5px;">Powered by <span style="color: ${brandColor}; font-weight: 600;">Tez Capital</span></span>
            </div>
        `;
        
        wrapper.appendChild(header);
        wrapper.appendChild(clone);
        
        // Trim bottom padding — measure actual content
        clone.style.paddingBottom = '0';
        clone.style.marginBottom = '0';
        
        document.body.appendChild(wrapper);
        
        // Trim wrapper height to actual content (avoid dead space)
        const actualHeight = wrapper.scrollHeight;
        wrapper.style.height = actualHeight + 'px';
        restoreSpacing = await fixWordSpacing(wrapper);
        
        const canvas = await html2canvas(wrapper, {
            backgroundColor: isClean ? '#F8F9FA' : isDark ? '#1A1A1A' : isMatrix ? '#000000' : '#0a0a0f',
            scale: CAPTURE_SCALE,
            useCORS: true,
            logging: false,
            width: 600,
            height: actualHeight,
            windowWidth: 600
        });
        
        restoreSpacing();
        restoreSpacing = null;
        wrapper.remove();
        wrapper = null;
        
        showShareModal(canvas, DASHBOARD_TWEET, 'Dashboard');
        
    } catch (error) {
        console.error('Screenshot failed:', error);
        showNotification('Screenshot failed. Try again.', 'error');
    } finally {
        if (restoreSpacing) restoreSpacing();
        if (wrapper?.isConnected) wrapper.remove();
        elementsToHide.forEach(el => el.style.visibility = '');
        if (shareBtn) {
            shareBtn.innerHTML = originalText;
            shareBtn.disabled = false;
        }
    }
}

/**
 * Capture Tezos L1 Governance's live vote panel inside a branded 1200x630 share frame.
 */
export async function captureBrandedChamberShare(target, details = {}) {
    if (!target) throw new Error('Share target unavailable');

    let wrapper = null;
    let restoreSpacing = null;
    const {
        brand: brandColor,
        bg: bgColor,
        brandRgb: brandRgb,
        isClean,
        isDark
    } = getThemeColors();
    const softText = isClean ? 'rgba(0,0,0,0.56)' : isDark ? 'rgba(232,232,232,0.58)' : 'rgba(255,255,255,0.62)';
    const mutedText = isClean ? 'rgba(0,0,0,0.38)' : isDark ? 'rgba(232,232,232,0.42)' : 'rgba(255,255,255,0.42)';
    const panelBg = isClean ? 'rgba(255,255,255,0.82)' : isDark ? 'rgba(255,255,255,0.055)' : `rgba(${brandRgb},0.055)`;
    const panelBorder = isClean ? 'rgba(37,99,235,0.16)' : isDark ? 'rgba(255,255,255,0.12)' : `rgba(${brandRgb},0.22)`;

    await loadHtml2Canvas();

    const captureDate = details.date || new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
    const proposalName = details.proposalName || 'Tezos governance';
    const stage = details.stage || 'Live vote';
    const summary = details.summary || 'Track quorum, supermajority, and baker voting in real time.';
    const directUrl = details.directUrl || 'tezos.systems/#chamber';
    const stats = Array.isArray(details.stats) ? details.stats.slice(0, 4) : [];

    try {
        wrapper = document.createElement('div');
        wrapper.style.cssText = `
            position: fixed; top: -9999px; left: -9999px;
            width: 1200px; height: 630px;
            background: ${bgColor};
            font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'SF Pro Display', sans-serif;
            color: ${isClean ? '#101827' : '#ffffff'};
            overflow: hidden;
            box-sizing: border-box;
        `;

        const border = document.createElement('div');
        border.style.cssText = `
            position: absolute; inset: 18px;
            border: 1px solid ${panelBorder};
            border-radius: 16px;
            box-shadow: ${isClean || isDark ? '0 16px 48px rgba(0,0,0,0.12)' : `inset 0 0 46px rgba(${brandRgb},0.045), 0 0 28px rgba(${brandRgb},0.08)`};
            pointer-events: none;
        `;
        wrapper.appendChild(border);

        const content = document.createElement('div');
        content.style.cssText = `
            position: relative; z-index: 1;
            height: 100%;
            display: grid;
            grid-template-columns: 430px 1fr;
            gap: 34px;
            padding: 44px 52px 40px;
            box-sizing: border-box;
        `;

        const left = document.createElement('section');
        left.style.cssText = 'display:flex;flex-direction:column;min-width:0;';
        left.innerHTML = `
            <div style="font-family:'Orbitron',sans-serif;font-size:28px;font-weight:900;letter-spacing:3px;text-transform:uppercase;color:${brandColor};text-shadow:${isClean || isDark ? 'none' : `0 0 28px rgba(${brandRgb},0.45)`};">TEZOS SYSTEMS</div>
            <div style="width:210px;height:1px;background:${brandColor};opacity:0.72;margin:14px 0 30px;"></div>
            <div style="font-size:13px;font-weight:800;letter-spacing:2.5px;text-transform:uppercase;color:${softText};">Tezos L1 Governance · ${escapeHtml(stage)}</div>
            <h1 style="margin:16px 0 12px;font-size:${proposalName.length > 22 ? '52px' : '62px'};line-height:0.96;font-weight:850;letter-spacing:0;color:${brandColor};max-width:420px;overflow-wrap:anywhere;">${escapeHtml(proposalName)}</h1>
            <p style="margin:0 0 26px;font-size:19px;line-height:1.42;color:${softText};">${escapeHtml(summary)}</p>
        `;

        const statGrid = document.createElement('div');
        statGrid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:auto;';
        for (const stat of stats) {
            const card = document.createElement('div');
            const tone = stat.tone === 'good' ? '#00d084' : stat.tone === 'risk' ? '#ff6b7a' : brandColor;
            card.style.cssText = `
                min-height: 82px;
                padding: 13px 14px;
                border-radius: 10px;
                border: 1px solid ${panelBorder};
                background: ${panelBg};
                box-sizing: border-box;
            `;
            card.innerHTML = `
                <div style="font-size:11px;font-weight:800;letter-spacing:1.7px;text-transform:uppercase;color:${mutedText};margin-bottom:8px;">${escapeHtml(stat.label)}</div>
                <div style="font-size:${String(stat.value || '').length > 14 ? '19px' : '24px'};line-height:1.04;font-weight:850;color:${tone};overflow-wrap:anywhere;">${escapeHtml(stat.value)}</div>
            `;
            statGrid.appendChild(card);
        }
        left.appendChild(statGrid);

        const footer = document.createElement('div');
        footer.style.cssText = `display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:28px;font-size:15px;color:${mutedText};`;
        footer.innerHTML = `
            <span>${escapeHtml(captureDate)}</span>
            <span style="color:${brandColor};font-weight:800;letter-spacing:1px;">${escapeHtml(directUrl)}</span>
        `;
        left.appendChild(footer);

        const right = document.createElement('section');
        right.style.cssText = `
            min-width:0;
            display:flex;
            flex-direction:column;
            gap:14px;
        `;
        const stageLabels = ['Proposal', 'Exploration', 'Cooldown', 'Promotion', 'Adoption'];
        const activeStage = stage.toLowerCase();
        const stageRail = stageLabels.map(label => {
            const active = activeStage.includes(label.toLowerCase());
            return `
                <div style="display:flex;align-items:center;gap:9px;min-width:0;">
                    <span style="width:13px;height:13px;border-radius:999px;background:${active ? brandColor : 'transparent'};border:1px solid ${active ? brandColor : panelBorder};box-shadow:${active && !isClean ? `0 0 16px rgba(${brandRgb},0.7)` : 'none'};flex:0 0 auto;"></span>
                    <span style="font-size:13px;font-weight:800;letter-spacing:1.3px;text-transform:uppercase;color:${active ? brandColor : mutedText};white-space:nowrap;">${escapeHtml(label)}</span>
                </div>
            `;
        }).join('');
        const barStats = stats.filter(stat => Number.isFinite(stat.progress) && Number.isFinite(stat.threshold)).slice(0, 2);
        const barRows = barStats.map(stat => {
            const progress = Math.max(0, Math.min(100, Number(stat.progress)));
            const threshold = Math.max(0, Math.min(100, Number(stat.threshold)));
            const passed = progress >= threshold;
            const fillColor = passed ? '#00d084' : '#ffb84d';
            return `
                <div style="padding:20px;border:1px solid ${panelBorder};border-radius:12px;background:${isClean ? 'rgba(255,255,255,0.76)' : 'rgba(255,255,255,0.045)'};">
                    <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:14px;">
                        <div>
                            <div style="font-size:12px;font-weight:850;letter-spacing:1.8px;text-transform:uppercase;color:${mutedText};">${escapeHtml(stat.label)}</div>
                            <div style="font-size:34px;line-height:1.08;font-weight:900;color:${fillColor};margin-top:4px;">${escapeHtml(stat.value)}</div>
                        </div>
                        <div style="font-size:13px;font-weight:800;letter-spacing:1.3px;text-transform:uppercase;color:${passed ? '#00d084' : '#ffb84d'};">${passed ? 'Cleared' : 'Watch'}</div>
                    </div>
                    <div style="position:relative;height:14px;border-radius:999px;background:${isClean ? 'rgba(15,23,42,0.10)' : 'rgba(255,255,255,0.10)'};overflow:hidden;">
                        <div style="height:100%;width:${progress.toFixed(2)}%;border-radius:999px;background:${fillColor};"></div>
                        <span style="position:absolute;top:-5px;left:${threshold.toFixed(2)}%;width:2px;height:24px;background:${isClean ? 'rgba(15,23,42,0.42)' : 'rgba(255,255,255,0.58)'};"></span>
                    </div>
                </div>
            `;
        }).join('');
        const smallStats = stats.slice(2, 4).map(stat => `
            <div style="padding:18px;border:1px solid ${panelBorder};border-radius:12px;background:${isClean ? 'rgba(255,255,255,0.76)' : 'rgba(255,255,255,0.045)'};">
                <div style="font-size:12px;font-weight:850;letter-spacing:1.8px;text-transform:uppercase;color:${mutedText};margin-bottom:9px;">${escapeHtml(stat.label)}</div>
                <div style="font-size:${String(stat.value || '').length > 18 ? '23px' : '30px'};line-height:1.08;font-weight:900;color:${stat.tone === 'risk' ? '#ff6b7a' : brandColor};overflow-wrap:anywhere;">${escapeHtml(stat.value)}</div>
            </div>
        `).join('');

        right.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;gap:18px;">
                <div style="font-size:13px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:${softText};">Live Vote Room</div>
                <div style="font-size:13px;color:${mutedText};">Chamber signal card</div>
            </div>
            <div style="height:496px;border:1px solid ${panelBorder};border-radius:14px;background:${panelBg};box-shadow:${isClean ? '0 20px 54px rgba(17,24,39,0.10)' : `0 24px 64px rgba(0,0,0,0.32), inset 0 0 36px rgba(${brandRgb},0.035)`};overflow:hidden;padding:24px;box-sizing:border-box;display:flex;flex-direction:column;gap:18px;">
                <div style="display:grid;grid-template-columns:repeat(5, minmax(0, 1fr));gap:10px;padding:14px 16px;border:1px solid ${panelBorder};border-radius:12px;background:${isClean ? 'rgba(255,255,255,0.68)' : 'rgba(0,0,0,0.16)'};">
                    ${stageRail}
                </div>
                <div style="display:grid;grid-template-columns:1fr;gap:14px;">
                    ${barRows}
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
                    ${smallStats}
                </div>
            </div>
        `;

        content.appendChild(left);
        content.appendChild(right);
        wrapper.appendChild(content);
        document.body.appendChild(wrapper);

        restoreSpacing = await fixWordSpacing(wrapper);
        const canvas = await window.html2canvas(wrapper, {
            backgroundColor: bgColor,
            scale: 1,
            useCORS: true,
            logging: false,
            width: 1200,
            height: 630,
            windowWidth: 1200
        });

        restoreSpacing();
        restoreSpacing = null;
        return canvas;
    } finally {
        if (restoreSpacing) restoreSpacing();
        if (wrapper?.isConnected) wrapper.remove();
    }
}

const TEZOS_SHARE_LINK_RE = /\b(?:https?:\/\/)?tezos\.systems(?:\/[^\s<>"']*)?/gi;

function shareSlug(value) {
    return String(value || 'share')
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64) || 'share';
}

function trackShareEvent(action, context, extra = {}) {
    window.trackTezosSystemsEvent?.(`share_${action}`, {
        context,
        ...extra
    });
}

export function trackedTezosUrl(raw = 'https://tezos.systems/', context = 'share', medium = 'social') {
    try {
        const url = new URL(String(raw).startsWith('http') ? raw : `https://${raw}`);
        if (url.hostname !== 'tezos.systems') return raw;
        url.searchParams.set('utm_source', 'tezos_systems');
        url.searchParams.set('utm_medium', shareSlug(medium));
        url.searchParams.set('utm_campaign', 'growth_loops');
        url.searchParams.set('utm_content', shareSlug(context));
        return url.toString();
    } catch (_) {
        return raw;
    }
}

function addShareTrackingToText(text, context, medium = 'social') {
    const rawText = String(text || '').trim();
    let replaced = false;
    const updated = rawText.replace(TEZOS_SHARE_LINK_RE, (match) => {
        const trailing = match.match(/[),.!?:;]+$/)?.[0] || '';
        const core = trailing ? match.slice(0, -trailing.length) : match;
        replaced = true;
        return `${trackedTezosUrl(core, context, medium)}${trailing}`;
    });
    return replaced ? updated : `${rawText}\n\n${trackedTezosUrl('https://tezos.systems/', context, medium)}`;
}

/**
 * Native share via Web Share API
 */
async function nativeShare(canvas, text, context) {
    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
    if (!blob) throw new Error('Failed to create share image');
    const file = new File([blob], 'tezos-stats.png', { type: 'image/png' });
    const url = trackedTezosUrl('https://tezos.systems/', context, 'native_share');
    if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ text, url, files: [file] });
    } else if (typeof navigator.share === 'function') {
        await navigator.share({ text, url });
    } else {
        throw new Error('Native share unavailable');
    }
}

/**
 * Show modal with share options
 * tweetTextOrOptions: string (legacy) or array of {label, text}
 */
export function showShareModal(canvas, tweetTextOrOptions, title, allOptionsForRefresh) {
    const existing = document.getElementById('share-modal');
    if (existing) {
        existing._shareCleanup?.();
        existing.remove();
    }
    
    const shareContext = shareSlug(title || 'snapshot');

    // Normalize to options array
    let tweetOptions = Array.isArray(tweetTextOrOptions)
        ? tweetTextOrOptions
        : [{ label: '📊 Standard', text: tweetTextOrOptions }];
    tweetOptions = tweetOptions.map((option, index) => ({
        label: String(option?.label || `Option ${index + 1}`),
        text: addShareTrackingToText(option?.text ?? '', shareContext)
    }));
    
    // Keep all options for refresh functionality
    const allTweetOptions = (allOptionsForRefresh || tweetOptions).map((option, index) => ({
        label: String(option?.label || `Option ${index + 1}`),
        text: addShareTrackingToText(option?.text ?? '', shareContext)
    }));
    trackShareEvent('modal_opened', shareContext, { title });
    
    const { brand: accent, brandRgb: accentRgb, isClean, isDark } = getThemeColors();
    
    // Check Web Share API support
    const canNativeShare = typeof navigator.share === 'function';
    const nativeShareBtn = canNativeShare 
        ? `<button class="share-action-btn" id="share-native"><span>📱</span> Share</button>` 
        : '';
    
    // Build tweet picker HTML helper
    function buildPickerHtml(options) {
        if (options.length <= 1) return '';
        const canRefresh = allTweetOptions.length > options.length;
        return `
        <div class="tweet-picker" style="
            padding: 12px 16px;
            border-bottom: 1px solid rgba(255,255,255,0.08);
            max-height: 200px;
            overflow-y: auto;
        ">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <div style="font-size: 0.7rem; text-transform: uppercase; letter-spacing: 1.5px;
                    color: rgba(${accentRgb},0.6); font-weight: 600;">
                    Choose tweet style
                </div>
                ${canRefresh ? `<button id="tweet-refresh-btn" title="Shuffle options" aria-label="Shuffle tweet options" style="
                    background: none; border: 1px solid rgba(${accentRgb},0.2); color: rgba(${accentRgb},0.6);
                    width: 28px; height: 28px; border-radius: 6px; cursor: pointer; font-size: 14px;
                    display: flex; align-items: center; justify-content: center;
                    transition: all 0.2s;
                ">🔄</button>` : ''}
            </div>
            ${options.map((opt, i) => `
                <label class="tweet-option" style="
                    display: flex; align-items: flex-start; gap: 10px;
                    padding: 8px 10px; margin-bottom: 4px;
                    background: ${i === 0 ? `rgba(${accentRgb},0.08)` : 'rgba(255,255,255,0.02)'};
                    border: 1px solid ${i === 0 ? `rgba(${accentRgb},0.25)` : 'rgba(255,255,255,0.06)'};
                    border-radius: 8px; cursor: pointer;
                    transition: all 0.2s ease;
                ">
                    <input type="radio" name="tweet-choice" value="${i}" ${i === 0 ? 'checked' : ''}
                        style="accent-color: ${accent}; margin-top: 2px; flex-shrink: 0;">
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-size: 0.75rem; font-weight: 600; color: rgba(255,255,255,0.7); margin-bottom: 2px;">
                            ${escapeHtml(opt.label)}
                        </div>
                        <div style="font-size: 0.68rem; color: rgba(255,255,255,0.4); line-height: 1.4;
                            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${escapeHtml(opt.text.split('\n')[0])}
                        </div>
                    </div>
                </label>
            `).join('')}
        </div>
    `;
    }
    const pickerHtml = buildPickerHtml(tweetOptions);
    
    const modal = document.createElement('div');
    modal.id = 'share-modal';
    modal.className = 'share-modal-overlay';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'share-modal-title');
    modal.innerHTML = `
        <div class="share-modal-content" style="max-height: 90vh; overflow-y: auto;">
            <div class="share-modal-header">
                <h3 id="share-modal-title">Share: ${escapeHtml(title || 'Snapshot')}</h3>
                <button class="share-modal-close" aria-label="Close share modal">×</button>
            </div>
            <div class="share-modal-preview">
                <img src="${canvas.toDataURL('image/png')}" alt="Snapshot" />
            </div>
            ${pickerHtml}
            <div class="share-modal-actions">
                <button class="share-action-btn" id="share-download">
                    <span>💾</span> ${/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ? 'Save' : 'Download'}
                </button>
                <button class="share-action-btn" id="share-copy">
                    <span>📋</span> Copy
                </button>
                <button class="share-action-btn" id="share-twitter">
                    <span>𝕏</span> Post
                </button>
                ${nativeShareBtn}
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    requestAnimationFrame(() => {
        modal.classList.add('visible');
    });
    
    // Style tweet option hover/selection
    const styleOptions = () => {
        modal.querySelectorAll('.tweet-option').forEach(label => {
            const radio = label.querySelector('input[type="radio"]');
            if (radio.checked) {
                label.style.background = `rgba(${accentRgb},0.08)`;
                label.style.borderColor = `rgba(${accentRgb},0.25)`;
            } else {
                label.style.background = 'rgba(255,255,255,0.02)';
                label.style.borderColor = 'rgba(255,255,255,0.06)';
            }
        });
    };
    
    const wirePickerEvents = () => {
        modal.querySelectorAll('.tweet-option').forEach(label => {
            label.addEventListener('change', styleOptions);
            label.addEventListener('mouseenter', () => {
                const radio = label.querySelector('input[type="radio"]');
                if (!radio.checked) label.style.background = `rgba(${accentRgb},0.04)`;
            });
            label.addEventListener('mouseleave', () => styleOptions());
        });
    };
    wirePickerEvents();
    
    // Refresh button — reshuffle tweet options
    const wireRefresh = () => {
        const btn = modal.querySelector('#tweet-refresh-btn');
        if (!btn || allTweetOptions.length <= 4) return;
        btn.addEventListener('click', () => {
            tweetOptions = pickRandomOptions(allTweetOptions, 4);
            const picker = modal.querySelector('.tweet-picker');
            if (picker) {
                picker.outerHTML = buildPickerHtml(tweetOptions);
                wirePickerEvents();
                wireRefresh();
            }
        });
    };
    wireRefresh();
    
    // Helper to get selected tweet text
    const getSelectedTweet = () => {
        const checked = modal.querySelector('input[name="tweet-choice"]:checked');
        const idx = checked ? parseInt(checked.value) : 0;
        return tweetOptions[idx]?.text || tweetOptions[0]?.text || '';
    };
    
    const closeModal = () => closeShareModal(modal);
    const onKeyDown = (e) => {
        if (e.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', onKeyDown);
    modal._shareCleanup = () => document.removeEventListener('keydown', onKeyDown);

    modal.querySelector('.share-modal-close').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
    
    // Download / Save
    modal.querySelector('#share-download').addEventListener('click', async () => {
        trackShareEvent('download', shareContext);
        const isApple = /iPhone|iPad|iPod|Mac/i.test(navigator.userAgent) && 'ontouchend' in document;
        const isMobile = isApple || /Android/i.test(navigator.userAgent);
        
        if (isMobile && navigator.share) {
            // Mobile: always try Web Share API first — gives iOS "Save to Photos"
            try {
                const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                const file = new File([blob], `tezos-systems-${Date.now()}.png`, { type: 'image/png' });
                await navigator.share({ files: [file] });
                showNotification('Saved!', 'success');
                return;
            } catch (err) {
                if (err.name === 'AbortError') return;
                // Share failed — fall through to fallback
            }
        }
        
        if (isMobile) {
            // Fallback: overlay with long-press save
            const dataUrl = canvas.toDataURL('image/png');
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:99999;background:rgba(0,0,0,0.95);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;';
            overlay.innerHTML = `
                <p style="color:#aaa;font-family:sans-serif;font-size:14px;margin-bottom:16px;text-align:center;">Long-press the image → Save to Photos</p>
                <img src="${dataUrl}" style="max-width:100%;max-height:75vh;border-radius:8px;">
                <button style="margin-top:20px;padding:12px 32px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:white;border-radius:8px;font-size:16px;cursor:pointer;">Close</button>
            `;
            overlay.querySelector('button').addEventListener('click', () => overlay.remove());
            overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
            document.body.appendChild(overlay);
        } else {
            // Desktop: standard download
            const link = document.createElement('a');
            link.download = `tezos-systems-${Date.now()}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
            showNotification('Image downloaded!', 'success');
        }
    });
    
    // Copy to clipboard
    modal.querySelector('#share-copy').addEventListener('click', async () => {
        trackShareEvent('copy_image', shareContext);
        try {
            // Pass a Promise to ClipboardItem to preserve the user gesture context
            // (required by Chrome — resolving the blob async loses the gesture)
            const item = new ClipboardItem({
                'image/png': new Promise((resolve) => {
                    canvas.toBlob((blob) => resolve(blob), 'image/png');
                })
            });
            await navigator.clipboard.write([item]);
            showNotification('Copied to clipboard!', 'success');
        } catch (err) {
            // Fallback: try legacy canvas-to-clipboard via selection hack
            try {
                const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
                const data = [new ClipboardItem({ 'image/png': blob })];
                await navigator.clipboard.write(data);
                showNotification('Copied to clipboard!', 'success');
            } catch (err2) {
                // Final fallback: auto-download instead
                const link = document.createElement('a');
                link.download = `tezos-systems-${Date.now()}.png`;
                link.href = canvas.toDataURL('image/png');
                link.click();
                showNotification('Clipboard unavailable — image downloaded instead.', 'info');
            }
        }
    });
    
    // Share on X/Twitter — open X first (must be synchronous for mobile popup blocker),
    // then try to copy image to clipboard in background
    modal.querySelector('#share-twitter').addEventListener('click', async () => {
        const selectedTweet = getSelectedTweet();
        const text = encodeURIComponent(selectedTweet);
        trackShareEvent('post_x', shareContext);
        // Open X immediately to preserve user gesture (mobile Safari blocks async window.open)
        window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank');
        // Then try clipboard copy in background (use Promise-based ClipboardItem)
        try {
            const item = new ClipboardItem({
                'image/png': new Promise((resolve) => {
                    canvas.toBlob((blob) => resolve(blob), 'image/png');
                })
            });
            await navigator.clipboard.write([item]);
            showNotification('Image copied! Paste it into your tweet (Ctrl+V / ⌘V)', 'success');
        } catch (err) {
            // Clipboard not available — that's fine, X is already open
        }
    });
    
    // Native share
    const nativeBtn = modal.querySelector('#share-native');
    if (nativeBtn) {
        nativeBtn.addEventListener('click', async () => {
            try {
                trackShareEvent('native', shareContext);
                await nativeShare(canvas, getSelectedTweet(), shareContext);
            } catch (err) {
                if (err.name !== 'AbortError') {
                    showNotification('Share failed.', 'error');
                }
            }
        });
    }
}

/**
 * Close share modal
 */
function closeShareModal(modal) {
    modal._shareCleanup?.();
    modal.classList.remove('visible');
    setTimeout(() => modal.remove(), 200);
}

/**
 * Show notification toast
 */
function showNotification(message, type = 'info') {
    const existing = document.querySelector('.share-notification');
    if (existing) existing.remove();
    
    const _notifTheme = document.body.getAttribute('data-theme');
    const isMatrix = _notifTheme === 'matrix';
    const isClean = _notifTheme === 'clean';
    const isDark = _notifTheme === 'dark';
    const colors = {
        success: isClean ? '#059669' : isDark ? '#4ADE80' : isMatrix ? '#00ff00' : '#10b981',
        error: isClean ? '#DC2626' : isDark ? '#F87171' : isMatrix ? '#ff0000' : '#ef4444',
        info: isClean ? '#2563EB' : isDark ? '#C8C8C8' : isMatrix ? '#00ff00' : '#00d4ff'
    };
    
    const notification = document.createElement('div');
    notification.className = 'share-notification';
    notification.style.cssText = `
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%) translateY(20px);
        background: rgba(0, 0, 0, 0.9);
        border: 1px solid ${colors[type]};
        color: ${colors[type]};
        padding: 12px 24px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        z-index: 10010;
        opacity: 0;
        transition: all 0.2s ease;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    requestAnimationFrame(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translateX(-50%) translateY(0)';
    });
    
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(-50%) translateY(20px)';
        setTimeout(() => notification.remove(), 200);
    }, 3000);
}

// ─── Protocol History Share ─────────────────────────────────────────

let protocolDataCache = null;

async function getProtocolData() {
    if (protocolDataCache) return protocolDataCache;
    try {
        const resp = await fetch('/data/protocol-data.json');
        protocolDataCache = await resp.json();
        return protocolDataCache;
    } catch (e) {
        console.error('Failed to load protocol-data.json', e);
        return null;
    }
}

function getThemeColors() {
    const currentTheme = document.body.getAttribute('data-theme');
    const themeColors = {
        aurora: { brand: '#45E0C8', bg: '#070B1A', brandRgb: '69,224,200' },
        matrix: { brand: '#00ff00', bg: '#0a0a0a', brandRgb: '0,255,0' },
        void: { brand: '#8B5CF6', bg: '#06060f', brandRgb: '139,92,246' },
        ember: { brand: '#FF9F43', bg: '#0f0806', brandRgb: '255,159,67' },
        signal: { brand: '#00E4A0', bg: '#060a08', brandRgb: '0,228,160' },
        clean: { brand: '#2563EB', bg: '#F8F9FA', brandRgb: '37,99,235' },
        dark: { brand: '#C8C8C8', bg: '#1A1A1A', brandRgb: '200,200,200' },
        bubblegum: { brand: '#FF69B4', bg: '#1F0E18', brandRgb: '255,105,180' },
        abyss: { brand: '#00E5FF', bg: '#020A1E', brandRgb: '0,229,255' },
        moss: { brand: '#50E850', bg: '#040C02', brandRgb: '80,232,80' },
        nerv: { brand: '#FF9830', bg: '#000000', brandRgb: '255,152,48' },
        warzone: { brand: '#FFC000', bg: '#080A02', brandRgb: '255,192,0' },
        default: { brand: '#00d4ff', bg: '#0a0a0f', brandRgb: '0,212,255' }
    };
    const colors = themeColors[currentTheme] || themeColors.default;
    const isMatrix = currentTheme === 'matrix';
    const isDark = currentTheme === 'dark';
    const isClean = currentTheme === 'clean';
    const isBubblegum = currentTheme === 'bubblegum';
    const { brand, bg, brandRgb } = colors;
    return { isMatrix, isDark, isClean, isBubblegum, brand, bg, brandRgb };
}

function createBaseWrapper(bg, brandRgb) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
        position: fixed; top: -9999px; left: -9999px;
        width: 600px; height: 630px;
        background: ${bg};
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'SF Pro Display', sans-serif;
        color: white; overflow: hidden;
        display: flex; flex-direction: column;
        padding: 0;
    `;
    // Background gradients
    const gradient = document.createElement('div');
    gradient.style.cssText = `
        position: absolute; top: 0; left: 0; right: 0; bottom: 0; pointer-events: none;
        background:
            radial-gradient(ellipse at 30% 20%, rgba(${brandRgb},0.08) 0%, transparent 50%),
            radial-gradient(ellipse at 70% 80%, rgba(${brandRgb},0.04) 0%, transparent 50%),
            radial-gradient(circle at 50% 50%, rgba(${brandRgb},0.03) 0%, transparent 70%);
    `;
    wrapper.appendChild(gradient);
    // Border glow
    const border = document.createElement('div');
    border.style.cssText = `
        position: absolute; top: 12px; left: 12px; right: 12px; bottom: 12px;
        border: 1px solid rgba(${brandRgb},0.15); border-radius: 12px;
        box-shadow: inset 0 0 30px rgba(${brandRgb},0.03), 0 0 15px rgba(${brandRgb},0.05);
        pointer-events: none;
    `;
    wrapper.appendChild(border);
    return wrapper;
}

function addFooter(wrapper, brand, leftText, { isClean = false, isDark = false } = {}) {
    const footer = document.createElement('div');
    footer.style.cssText = `
        position: absolute; bottom: 24px; left: 40px; right: 40px;
        display: flex; justify-content: space-between; align-items: center; z-index: 1;
    `;
    const textColor = isClean ? 'rgba(0,0,0,0.35)' : isDark ? 'rgba(200,200,200,0.4)' : 'rgba(255,255,255,0.35)';
    footer.innerHTML = `
        <span style="font-size: 13px; color: ${textColor};">${leftText}</span>
        <span style="font-size: 13px; color: ${brand}; font-weight: 600; letter-spacing: 1px;">tezos.systems</span>
        <span style="font-size: 13px; color: ${textColor}; letter-spacing: 0.5px;">Powered by <span style="color: ${brand}; font-weight: 600;">Tez Capital</span></span>
    `;
    wrapper.appendChild(footer);
}

/**
 * Capture a single protocol card as a shareable 1200×630 image
 */
export async function captureProtocol(protocol) {
    let wrapper = null;
    let restoreSpacing = null;
    try {
        await loadHtml2Canvas();
        const { brand, bg, brandRgb, isClean, isDark } = getThemeColors();
        const data = await getProtocolData();
        const total = data?.meta?.totalUpgrades || 21;

        wrapper = createBaseWrapper(bg, brandRgb);

        const content = document.createElement('div');
        content.style.cssText = `
            position: relative; z-index: 1;
            width: 100%; height: 100%;
            display: flex; flex-direction: column;
            padding: 36px 36px 60px 36px;
            box-sizing: border-box;
        `;

        // Title
        content.innerHTML += `
            <div style="font-family:'Orbitron',sans-serif; font-size:22px; font-weight:900; color:${brand};
                letter-spacing:3px; text-transform:uppercase; margin-bottom:2px;
                text-shadow: 0 0 30px rgba(${brandRgb},0.5), 0 0 60px rgba(${brandRgb},0.3), 0 0 90px rgba(${brandRgb},0.1);">
                TEZOS SYSTEMS
            </div>
            <div style="font-size:11px; font-weight:600; color:rgba(${brandRgb},0.4); text-transform:uppercase;
                letter-spacing:3px; margin-bottom:10px;">PROTOCOL HISTORY</div>
            <div style="width:200px; height:1px; background:linear-gradient(90deg, transparent, rgba(${brandRgb},0.4), transparent); margin-bottom:28px;"></div>
        `;

        // Protocol number + name
        const num = protocol.number - 3; // Athens is #1 (code 4)
        content.innerHTML += `
            <div style="display:flex; align-items:baseline; gap:10px; margin-bottom:8px;">
                <span style="font-family:'Orbitron',sans-serif; font-size:32px; font-weight:900; color:rgba(255,255,255,0.15);">#${num}</span>
                <span style="font-family:'Orbitron',sans-serif; font-size:32px; font-weight:900; color:${brand};
                    text-shadow: 0 0 30px rgba(${brandRgb},0.4);">${protocol.name.toUpperCase()}</span>
            </div>
        `;

        // Date
        const dateStr = new Date(protocol.date + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
        content.innerHTML += `
            <div style="font-size:16px; color:rgba(255,255,255,0.4); margin-bottom:20px;">Activated: ${dateStr}</div>
        `;

        // Headline quote
        content.innerHTML += `
            <div style="font-size:15px; font-style:italic; color:rgba(255,255,255,0.7); margin-bottom:20px;
                padding-left:14px; border-left:3px solid rgba(${brandRgb},0.3);">
                "${protocol.headline}"
            </div>
        `;

        // Key changes
        const changes = (protocol.changes || []).slice(0, 5);
        if (changes.length) {
            let changesHtml = `<div style="font-size:12px; font-weight:700; color:rgba(255,255,255,0.5); text-transform:uppercase; letter-spacing:2px; margin-bottom:8px;">Key Changes</div>`;
            changes.forEach(c => {
                changesHtml += `<div style="font-size:13px; color:rgba(255,255,255,0.65); margin-bottom:5px; padding-left:8px;">• ${c}</div>`;
            });
            content.innerHTML += `<div>${changesHtml}</div>`;
        }

        wrapper.appendChild(content);
        addFooter(wrapper, brand, `${total} upgrades • Zero forks`, { isClean, isDark });
        document.body.appendChild(wrapper);
        restoreSpacing = await fixWordSpacing(wrapper);

        const canvas = await html2canvas(wrapper, {
            backgroundColor: bg, scale: CAPTURE_SCALE, useCORS: true, logging: false, width: 600, height: 630, windowWidth: 600
        });
        restoreSpacing();
        restoreSpacing = null;
        wrapper.remove();
        wrapper = null;

        const suffix = '\n\ntezos.systems';
        const protoOptions = await getProtocolTweetOptions(protocol, num, total);
        const allOptions = protoOptions.map(o => ({
            ...o,
            text: o.text + suffix
        }));
        const displayOptions = pickRandomOptions(allOptions, 4);
        showShareModal(canvas, displayOptions, `Protocol #${num}: ${protocol.name}`, allOptions);
    } catch (error) {
        console.error('Protocol capture failed:', error);
        showNotification('Screenshot failed. Try again.', 'error');
    } finally {
        if (restoreSpacing) restoreSpacing();
        if (wrapper?.isConnected) wrapper.remove();
    }
}

/**
 * Capture the full protocol timeline as a 1200×630 image
 */
export async function captureTimeline(allProtocols) {
    let wrapper = null;
    let restoreSpacing = null;
    try {
        await loadHtml2Canvas();
        const { brand, bg, brandRgb, isClean, isDark } = getThemeColors();
        const total = allProtocols.length;

        wrapper = createBaseWrapper(bg, brandRgb);

        const content = document.createElement('div');
        content.style.cssText = `
            position: relative; z-index: 1;
            width: 100%; height: 100%;
            display: flex; flex-direction: column;
            align-items: center; justify-content: center;
            padding: 36px 24px 60px 24px;
            box-sizing: border-box;
        `;

        // Title
        content.innerHTML += `
            <div style="font-family:'Orbitron',sans-serif; font-size:18px; font-weight:900; color:${brand};
                letter-spacing:3px; text-transform:uppercase; margin-bottom:8px;
                text-shadow: 0 0 30px rgba(${brandRgb},0.5), 0 0 60px rgba(${brandRgb},0.3), 0 0 90px rgba(${brandRgb},0.1);">
                TEZOS SYSTEMS — PROTOCOL HISTORY
            </div>
            <div style="width:300px; height:1px; background:linear-gradient(90deg, transparent, rgba(${brandRgb},0.4), transparent); margin-bottom:40px;"></div>
        `;

        // Timeline pills
        const pillSize = 22;
        const gap = 3;
        const totalWidth = allProtocols.length * (pillSize + gap) - gap;
        let pillsHtml = `<div style="display:flex; gap:${gap}px; justify-content:center; margin-bottom:12px;">`;
        allProtocols.forEach((p, i) => {
            const isCurrent = i === allProtocols.length - 1;
            pillsHtml += `<div style="
                width:${pillSize}px; height:${pillSize}px; border-radius:50%;
                display:flex; align-items:center; justify-content:center;
                font-family:'Orbitron',sans-serif; font-size:9px; font-weight:900;
                color:${isCurrent ? bg : 'rgba(255,255,255,0.7)'};
                background:${isCurrent ? brand : `rgba(${brandRgb},0.12)`};
                border:1px solid ${isCurrent ? brand : `rgba(${brandRgb},0.25)`};
                ${isCurrent ? `box-shadow: 0 0 15px rgba(${brandRgb},0.5);` : ''}
            ">${p.name[0]}</div>`;
        });
        pillsHtml += '</div>';
        content.innerHTML += pillsHtml;

        // Year markers
        const years = {};
        allProtocols.forEach((p, i) => {
            const yr = "'" + p.date.slice(2, 4);
            if (!years[yr]) years[yr] = i;
        });
        let yearHtml = `<div style="display:flex; position:relative; width:${totalWidth}px; height:20px; margin-bottom:36px;">`;
        for (const [yr, idx] of Object.entries(years)) {
            const left = idx * (pillSize + gap) + pillSize / 2;
            yearHtml += `<span style="position:absolute; left:${left}px; transform:translateX(-50%); font-size:12px; color:rgba(255,255,255,0.3); font-weight:600;">${yr}</span>`;
        }
        yearHtml += '</div>';
        content.innerHTML += yearHtml;

        // Tagline
        content.innerHTML += `
            <div style="font-size:16px; font-weight:700; color:rgba(255,255,255,0.6); letter-spacing:1px;">
                ${total} Self-Amendments • Zero Hard Forks • Since 2018
            </div>
        `;

        wrapper.appendChild(content);
        addFooter(wrapper, brand, new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), { isClean, isDark });
        document.body.appendChild(wrapper);
        restoreSpacing = await fixWordSpacing(wrapper);

        const canvas = await html2canvas(wrapper, {
            backgroundColor: bg, scale: CAPTURE_SCALE, useCORS: true, logging: false, width: 600, height: 630, windowWidth: 600
        });
        restoreSpacing();
        restoreSpacing = null;
        wrapper.remove();
        wrapper = null;

        const suffix = '\n\ntezos.systems';
        const tweetsData = await loadTweetsData();
        const timelineTemplates = tweetsData?.TIMELINE_TWEET_OPTIONS || [];
        const allOptions = timelineTemplates.map(o => ({
            label: o.label,
            text: substituteTweet(o.text, { total: String(total) }) + suffix
        }));
        const displayOptions = pickRandomOptions(allOptions, 4);
        showShareModal(canvas, displayOptions, 'Protocol Timeline', allOptions);
    } catch (error) {
        console.error('Timeline capture failed:', error);
        showNotification('Screenshot failed. Try again.', 'error');
    } finally {
        if (restoreSpacing) restoreSpacing();
        if (wrapper?.isConnected) wrapper.remove();
    }
}

/**
 * Initialize protocol share buttons on timeline items + timeline share button
 */
export async function initProtocolShare() {
    const data = await getProtocolData();
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
            if (protocol) captureProtocol(protocol);
        });
        timelineEl.dataset.protocolShareWired = '1';
    }

    // Add "Share Timeline" button
    const badgesContainer = document.querySelector('.upgrade-badges');
    const historyHeader = document.querySelector('#protocol-history-chamber-modal .protocol-history-chamber-header')
        || document.querySelector('#protocol-history-feature .section-header');
    const timelineButtonHost = badgesContainer || historyHeader;
    if (timelineButtonHost) {
        let btn = timelineButtonHost.querySelector(':scope > .timeline-share-btn');
        if (!btn) {
            btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'timeline-share-btn';
            btn.innerHTML = '📸';
            btn.setAttribute('aria-label', 'Share the full protocol timeline');
            btn.title = 'Share the full protocol timeline';
            btn.style.cssText = `
                background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
                color: rgba(255,255,255,0.5); width: 36px; height: 36px; border-radius: 8px;
                cursor: pointer; font-size: 16px;
                display: flex; align-items: center; justify-content: center;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                flex-shrink: 0;
                opacity: 1; pointer-events: auto;
            `;
            if (badgesContainer) badgesContainer.insertBefore(btn, badgesContainer.firstChild);
            else timelineButtonHost.appendChild(btn);
        }
        if (!btn.dataset.protocolShareButtonWired) {
            btn.addEventListener('mouseenter', () => {
                const c = getThemeColors();
                btn.style.borderColor = c.brand;
                btn.style.color = c.brand;
                btn.style.background = `rgba(${c.brand === '#00d4ff' ? '0,212,255' : '0,255,0'},0.1)`;
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.borderColor = 'rgba(255,255,255,0.1)';
                btn.style.color = 'rgba(255,255,255,0.5)';
                btn.style.background = 'rgba(255,255,255,0.05)';
            });
            btn.addEventListener('click', () => captureTimeline(protocols));
            btn.dataset.protocolShareButtonWired = '1';
        }

        const timelineSection = document.querySelector('#protocol-history-chamber-modal .protocol-history-content')
            || document.querySelector('#protocol-history-feature')
            || document.querySelector('.upgrade-clock-content');
        if (timelineSection && !timelineSection.dataset.timelineShareHoverWired) {
            btn.style.opacity = '1';
            btn.style.pointerEvents = 'auto';
            timelineSection.dataset.timelineShareHoverWired = '1';
        }
    }
}

/**
 * Build a purpose-built 1200×630px share card DOM element for a protocol history
 */
function buildProtocolHistoryCardDOM(protocol, num) {
    const { brand: accent, bg, brandRgb } = getThemeColors();
    const accent10 = accent + '1a';
    const accent30 = accent + '4d';

    const card = document.createElement('div');
    card.style.cssText = `
        width: 1200px; height: 630px; background: ${bg};
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        color: #e0e0e0; position: fixed; left: -9999px; top: 0;
        overflow: hidden; box-sizing: border-box;
    `;

    const history = protocol.history;
    const hasHistory = history && history.sections && history.sections.length > 0;

    let bodyHTML = '';

    if (hasHistory) {
        // Find interesting sections
        const versusSection = history.sections.find(s => s.type === 'versus');
        const timelineSection = history.sections.find(s => s.type === 'timeline');
        const textSections = history.sections.filter(s => !s.type || s.type === 'text');

        // Extract a key quote from text sections
        let keyQuote = null;
        for (const ts of textSections) {
            if (ts.content) {
                const quoteMatch = ts.content.match(/"([^"]{40,200})"/);
                if (quoteMatch) {
                    keyQuote = quoteMatch[1].length > 160
                        ? quoteMatch[1].slice(0, 157) + '…'
                        : quoteMatch[1];
                    break;
                }
            }
        }

        if (versusSection) {
            // Versus layout: two sides side by side
            const L = versusSection.left || {};
            const R = versusSection.right || {};
            const truncate = (str, max) => str && str.length > max ? str.slice(0, max - 1) + '…' : (str || '');

            bodyHTML = `
                <div style="display:flex;gap:16px;height:100%;">
                    <!-- Left side -->
                    <div style="flex:1;background:${accent10};border:1px solid ${accent30};border-radius:12px;padding:20px;display:flex;flex-direction:column;gap:10px;">
                        <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;color:${accent};opacity:0.7;">Team</div>
                        <div style="font-size:18px;font-weight:700;color:#fff;">${escapeHtml(L.name || '')}</div>
                        <div style="font-size:11px;color:rgba(255,255,255,0.45);">${escapeHtml(L.team || '')}</div>
                        <div style="flex:1;font-size:13px;color:rgba(255,255,255,0.75);line-height:1.55;border-top:1px solid rgba(255,255,255,0.08);padding-top:10px;">${escapeHtml(truncate(L.position, 220))}</div>
                        ${L.quote ? `<div style="font-size:12px;font-style:italic;color:${accent};opacity:0.85;border-left:3px solid ${accent};padding-left:10px;line-height:1.4;">"${escapeHtml(truncate(L.quote, 150))}"</div>` : ''}
                    </div>
                    <!-- VS divider -->
                    <div style="display:flex;align-items:center;justify-content:center;flex:0 0 48px;">
                        <div style="font-size:20px;font-weight:900;color:${accent};opacity:0.5;text-shadow:0 0 12px ${accent}80;">VS</div>
                    </div>
                    <!-- Right side -->
                    <div style="flex:1;background:rgba(255,80,80,0.08);border:1px solid rgba(255,80,80,0.2);border-radius:12px;padding:20px;display:flex;flex-direction:column;gap:10px;">
                        <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#ff8080;opacity:0.7;">Team</div>
                        <div style="font-size:18px;font-weight:700;color:#fff;">${escapeHtml(R.name || '')}</div>
                        <div style="font-size:11px;color:rgba(255,255,255,0.45);">${escapeHtml(R.team || '')}</div>
                        <div style="flex:1;font-size:13px;color:rgba(255,255,255,0.75);line-height:1.55;border-top:1px solid rgba(255,255,255,0.08);padding-top:10px;">${escapeHtml(truncate(R.position, 220))}</div>
                        ${R.quote ? `<div style="font-size:12px;font-style:italic;color:#ff8080;border-left:3px solid #ff8080;padding-left:10px;line-height:1.4;">"${escapeHtml(truncate(R.quote, 150))}"</div>` : ''}
                    </div>
                </div>
            `;
        } else if (timelineSection && timelineSection.events && timelineSection.events.length > 0) {
            // Timeline layout: pick 4 representative events
            const events = timelineSection.events;
            let picks = [];
            if (events.length <= 4) {
                picks = events;
            } else {
                const mid1 = Math.floor(events.length / 3);
                const mid2 = Math.floor(2 * events.length / 3);
                picks = [events[0], events[mid1], events[mid2], events[events.length - 1]];
            }

            const dotColor = (side) => {
                if (!side || side === 'neutral') return accent;
                if (side === 'left' || side === 'quebec') return accent;
                return '#ff8080';
            };

            const truncate = (str, max) => str && str.length > max ? str.slice(0, max - 1) + '…' : (str || '');

            const eventItems = picks.map(ev => `
                <div style="display:flex;gap:14px;align-items:flex-start;">
                    <div style="flex:0 0 auto;display:flex;flex-direction:column;align-items:center;">
                        <div style="width:10px;height:10px;border-radius:50%;background:${dotColor(ev.side)};box-shadow:0 0 6px ${dotColor(ev.side)}80;margin-top:3px;"></div>
                        <div style="width:1px;flex:1;background:rgba(255,255,255,0.1);min-height:20px;"></div>
                    </div>
                    <div style="flex:1;padding-bottom:14px;">
                        <div style="font-size:10px;font-family:'JetBrains Mono',monospace;color:${accent};opacity:0.7;margin-bottom:3px;">${escapeHtml(ev.date || '')}</div>
                        <div style="font-size:13px;color:rgba(255,255,255,0.85);line-height:1.4;">${escapeHtml(truncate(ev.text, 140))}</div>
                    </div>
                </div>
            `).join('');

            bodyHTML = `
                <div style="display:flex;flex-direction:column;gap:0;height:100%;overflow:hidden;">
                    ${eventItems}
                    ${keyQuote ? `
                    <div style="margin-top:auto;padding:14px;background:${accent10};border-left:3px solid ${accent};border-radius:0 8px 8px 0;">
                        <div style="font-size:12px;font-style:italic;color:rgba(255,255,255,0.8);line-height:1.45;">"${escapeHtml(keyQuote)}"</div>
                    </div>` : ''}
                </div>
            `;
        } else if (keyQuote) {
            // Quote + debate fallback
            const debate = protocol.debate ? protocol.debate.slice(0, 280) : '';
            bodyHTML = `
                <div style="display:flex;flex-direction:column;gap:20px;height:100%;justify-content:center;">
                    <div style="padding:20px;background:${accent10};border-left:4px solid ${accent};border-radius:0 12px 12px 0;">
                        <div style="font-size:15px;font-style:italic;color:rgba(255,255,255,0.9);line-height:1.55;">"${escapeHtml(keyQuote)}"</div>
                    </div>
                    ${debate ? `<div style="font-size:13px;color:rgba(255,255,255,0.55);line-height:1.5;">${escapeHtml(debate.slice(0, 280))}${protocol.debate && protocol.debate.length > 280 ? '…' : ''}</div>` : ''}
                </div>
            `;
        } else {
            // Generic history: show features + debate
            bodyHTML = buildProtocolFeaturesBody(protocol, accent, accent10);
        }
    } else {
        // No detailed history — show features + debate
        bodyHTML = buildProtocolFeaturesBody(protocol, accent, accent10);
    }

    const titleText = hasHistory ? escapeHtml(history.title) : escapeHtml(`${protocol.name} Protocol`);
    const subtitleText = hasHistory
        ? escapeHtml(history.subtitle)
        : escapeHtml(protocol.headline || '');

    const gridLine = `rgba(${brandRgb},0.03)`;

    card.innerHTML = `
        <!-- Grid overlay -->
        <div style="position:absolute;inset:0;background:linear-gradient(${gridLine} 1px,transparent 1px),linear-gradient(90deg,${gridLine} 1px,transparent 1px);background-size:30px 30px;pointer-events:none;z-index:0;"></div>
        <!-- Top accent bar -->
        <div style="position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,${accent},${accent}00);z-index:1;"></div>

        <div style="position:relative;z-index:1;display:flex;flex-direction:column;height:100%;padding:36px 44px 28px;box-sizing:border-box;gap:0;">

            <!-- Header -->
            <div style="margin-bottom:18px;flex:0 0 auto;">
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:6px;">
                    <div style="font-size:11px;text-transform:uppercase;letter-spacing:2.5px;color:${accent};opacity:0.65;font-family:'JetBrains Mono',monospace;">Protocol ${num !== '?' ? '#' + num : ''} · Tezos Governance</div>
                    ${protocol.contention ? `<div style="font-size:10px;background:rgba(255,80,80,0.15);border:1px solid rgba(255,80,80,0.3);color:#ff8080;padding:2px 8px;border-radius:20px;letter-spacing:1px;">CONTESTED</div>` : ''}
                </div>
                <div style="font-size:28px;font-weight:800;color:#fff;line-height:1.2;margin-bottom:6px;max-width:820px;">${titleText}</div>
                <div style="font-size:14px;color:rgba(255,255,255,0.5);line-height:1.4;max-width:780px;">${subtitleText}</div>
            </div>

            <!-- Divider -->
            <div style="height:1px;background:linear-gradient(90deg,${accent}40,transparent);margin-bottom:18px;flex:0 0 auto;"></div>

            <!-- Body -->
            <div style="flex:1;overflow:hidden;min-height:0;">
                ${bodyHTML}
            </div>

            <!-- Footer -->
            <div style="flex:0 0 auto;display:flex;justify-content:space-between;align-items:center;padding-top:14px;border-top:1px solid rgba(255,255,255,0.06);margin-top:14px;">
                <div style="display:flex;align-items:center;gap:8px;">
                    <div style="font-size:13px;font-weight:600;color:${accent};letter-spacing:0.5px;">tezos.systems</div>
                </div>
                <div style="font-size:11px;color:rgba(255,255,255,0.25);font-family:'JetBrains Mono',monospace;">${escapeHtml(protocol.name)} · ${protocol.date ? protocol.date.slice(0, 7) : ''}</div>
            </div>
        </div>
    `;

    return card;
}

/**
 * Build the body HTML for protocols without detailed history
 */
function buildProtocolFeaturesBody(protocol, accent, accent10) {
    const changes = (protocol.changes || []).slice(0, 6);
    const debate = protocol.debate || '';

    const featureItems = changes.map(c => `
        <div style="display:flex;align-items:flex-start;gap:10px;">
            <div style="flex:0 0 6px;height:6px;width:6px;border-radius:50%;background:${accent};margin-top:6px;box-shadow:0 0 4px ${accent}80;"></div>
            <div style="font-size:13px;color:rgba(255,255,255,0.8);line-height:1.45;">${escapeHtml(c)}</div>
        </div>
    `).join('');

    return `
        <div style="display:flex;flex-direction:column;gap:16px;height:100%;overflow:hidden;">
            ${changes.length > 0 ? `
            <div>
                <div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:${accent};opacity:0.6;margin-bottom:10px;">Key Changes</div>
                <div style="display:flex;flex-direction:column;gap:8px;">${featureItems}</div>
            </div>` : ''}
            ${debate ? `
            <div style="margin-top:auto;padding:14px 16px;background:${accent10};border-left:3px solid ${accent};border-radius:0 8px 8px 0;overflow:hidden;">
                <div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:${accent};opacity:0.6;margin-bottom:6px;">Governance Note</div>
                <div style="font-size:12px;color:rgba(255,255,255,0.7);line-height:1.5;">${escapeHtml(debate.slice(0, 220))}${debate.length > 220 ? '…' : ''}</div>
            </div>` : ''}
        </div>
    `;
}

/**
 * Capture the protocol history modal as a shareable image
 */
async function captureProtocolHistory(protocolName) {
    let card = null;
    try {
        await loadHtml2Canvas();

        const data = await getProtocolData();
        const protocols = data?.protocols || [];
        const protocol = protocols.find(p => p.name === protocolName);
        const total = data?.meta?.totalUpgrades || 21;
        const num = protocol ? protocol.number - 3 : '?';

        if (!protocol) {
            showNotification('Protocol data not found.', 'error');
            return;
        }

        // Build the purpose-built 1200×630 card
        card = buildProtocolHistoryCardDOM(protocol, num);
        document.body.appendChild(card);

        // Allow layout to settle
        await new Promise(r => setTimeout(r, 100));

        const canvas = await html2canvas(card, {
            backgroundColor: null,
            scale: 1,
            useCORS: true,
            logging: false,
            width: 1200,
            height: 630,
            windowWidth: 1200,
            windowHeight: 630
        });

        card.remove();
        card = null;

        // Get tweet options for this protocol
        const suffix = '\n\ntezos.systems';
        const protoOpts = await getProtocolTweetOptions(protocol, num, total);
        const allOptions = protoOpts.map(o => ({
            ...o,
            text: o.text + suffix
        }));
        const displayOptions = pickRandomOptions(allOptions, 4);
        showShareModal(canvas, displayOptions, `⚔ ${protocolName} History`, allOptions);
    } catch (error) {
        console.error('History capture failed:', error);
        showNotification('Screenshot failed. Try again.', 'error');
    } finally {
        if (card?.isConnected) card.remove();
    }
}

// Expose captureProtocol globally for infographic row clicks
window.captureProtocol = captureProtocol;
window.captureProtocolHistory = captureProtocolHistory;

/**
 * Capture the Historical Data modal as a shareable image
 */
async function captureHistoricalData() {
    let modalContent = null;
    let closeBtn = null;
    let shareBtn = null;
    let copyBtn = null;
    let modalTitle = null;
    let origTitleStyle = '';
    let origMaxHeight = '';
    let origOverflow = '';
    let canvasBackups = [];
    let restoreSpacing = null;
    try {
        await loadHtml2Canvas();
        modalContent = document.querySelector('#history-modal .modal-large');
        if (!modalContent) return;

        // Get selected time range
        const activeBtn = document.querySelector('.time-range-btn.active');
        const range = activeBtn ? activeBtn.textContent.trim() : '7 Days';

        // Hide close & share buttons during capture
        closeBtn = modalContent.querySelector('.modal-close');
        shareBtn = modalContent.querySelector('#history-share-btn');
        copyBtn = modalContent.querySelector('#history-copy-link');
        if (closeBtn) closeBtn.style.display = 'none';
        if (shareBtn) shareBtn.style.display = 'none';
        if (copyBtn) copyBtn.style.display = 'none';

        // Fix gradient text (html2canvas can't render background-clip: text)
        const theme = document.body.getAttribute('data-theme') || 'default';
        modalTitle = modalContent.querySelector('.modal-title');
        origTitleStyle = modalTitle ? modalTitle.style.cssText : '';
        if (modalTitle) {
            const accentColors = { aurora: '#45E0C8', matrix: '#00ff41', void: '#8B5CF6', ember: '#FF9F43', signal: '#00FFC8', bubblegum: '#FF69B4', default: '#00d4ff' };
            const titleColor = accentColors[theme] || '#00d4ff';
            modalTitle.style.background = 'none';
            modalTitle.style.webkitBackgroundClip = 'unset';
            modalTitle.style.backgroundClip = 'unset';
            modalTitle.style.webkitTextFillColor = titleColor;
            modalTitle.style.color = titleColor;
        }

        // Temporarily remove scroll constraints so html2canvas captures ALL charts
        origMaxHeight = modalContent.style.maxHeight;
        origOverflow = modalContent.style.overflow;
        modalContent.style.maxHeight = 'none';
        modalContent.style.overflow = 'visible';

        // Convert Chart.js canvases to images (html2canvas can't render them)
        const chartCanvases = Array.from(modalContent.querySelectorAll('canvas'));
        chartCanvases.forEach(origCanvas => {
            const parent = origCanvas.parentNode;
            if (!parent) return;
            const nextSib = origCanvas.nextSibling;
            if (origCanvas.width > 0 && origCanvas.height > 0) {
                try {
                    const img = document.createElement('img');
                    img.src = origCanvas.toDataURL('image/png');
                    img.style.width = '100%';
                    img.style.height = origCanvas.offsetHeight + 'px';
                    img.style.display = 'block';
                    parent.replaceChild(img, origCanvas);
                    canvasBackups.push({ canvas: origCanvas, img, parent, nextSib });
                } catch(e) { /* ignore */ }
            } else {
                const placeholder = document.createElement('div');
                placeholder.setAttribute('aria-hidden', 'true');
                placeholder.style.width = '100%';
                placeholder.style.height = `${Math.max(origCanvas.offsetHeight, origCanvas.parentElement?.clientHeight || 120)}px`;
                placeholder.style.minHeight = '120px';
                placeholder.style.display = 'block';
                parent.replaceChild(placeholder, origCanvas);
                canvasBackups.push({ canvas: origCanvas, img: placeholder, parent, nextSib });
            }
        });

        // Force reflow after canvas→img swap so scrollHeight is accurate
        void modalContent.offsetHeight;
        // Wait a tick for images to settle in layout
        await new Promise(r => setTimeout(r, 100));

        const fullHeight = modalContent.scrollHeight;
        const fullWidth = modalContent.scrollWidth;
        const bgColors = { aurora: '#070B1A', matrix: '#000800', void: '#06060f', ember: '#0f0806', signal: '#060a0f', bubblegum: '#1F0E18', default: '#08081a' };
        restoreSpacing = await fixWordSpacing(modalContent);
        const canvas = await html2canvas(modalContent, {
            backgroundColor: bgColors[theme] || '#08081a',
            scale: CAPTURE_SCALE,
            useCORS: true,
            logging: false,
            height: fullHeight,
            windowHeight: fullHeight,
            width: fullWidth,
            windowWidth: fullWidth
        });

        restoreSpacing();
        restoreSpacing = null;

        // Restore original canvases
        canvasBackups.reverse().forEach(({ canvas: orig, img, parent }) => {
            if (img.parentNode === parent) parent.replaceChild(orig, img);
        });
        canvasBackups = [];

        // Restore scroll constraints & buttons
        modalContent.style.maxHeight = origMaxHeight;
        modalContent.style.overflow = origOverflow;
        if (closeBtn) closeBtn.style.display = '';
        if (shareBtn) shareBtn.style.display = '';
        if (copyBtn) copyBtn.style.display = '';
        if (modalTitle) modalTitle.style.cssText = origTitleStyle;

        const tweetOptions = [
            { label: '📊 Standard', text: `Tezos historical data — ${range} view\n\ntezos.systems/#history` }
        ];
        showShareModal(canvas, tweetOptions, `📈 Historical Data (${range})`);
    } catch (error) {
        console.error('Historical data capture failed:', error);
        showNotification('Screenshot failed. Try again.', 'error');
    } finally {
        if (restoreSpacing) restoreSpacing();
        canvasBackups.reverse().forEach(({ canvas: orig, img, parent }) => {
            if (img.parentNode === parent) parent.replaceChild(orig, img);
        });
        if (modalContent) {
            modalContent.style.maxHeight = origMaxHeight;
            modalContent.style.overflow = origOverflow;
        }
        if (closeBtn) closeBtn.style.display = '';
        if (shareBtn) shareBtn.style.display = '';
        if (copyBtn) copyBtn.style.display = '';
        if (modalTitle) modalTitle.style.cssText = origTitleStyle;
    }
}

window.captureHistoricalData = captureHistoricalData;
