/**
 * DATA-MAGIC — async data arrival effects, tuned per theme
 *
 * The "magic" layer for numbers and text as they land:
 *   • tweenNumber  — odometer / count-up on a raw numeric value (formatter applied per frame)
 *   • scrambleText — glyph-decode reveal for strings (proposal names, headlines)
 *   • auroraResolve — a restrained left-to-right glyph wave for Aurora
 *   • themed reveals — Kindle, Sweep Lock, Delta Tick, Sonar Echo,
 *     Mycelial Bloom, and Target Lock for their matching themes
 *   • focusReveal  — understated blur-to-sharp reveal (classic themes)
 *   • revealValue  — theme-aware dispatch across the theme personalities
 *   • pulseFresh   — one-shot accent shimmer sweep signalling "this value just updated"
 *   • initDataMagic — themechange tracking + a sparse decorative ambient pulse
 *
 * Every theme carries an effect personality. Matrix, HEN, NERV, and Bubblegum
 * keep their strong themed decodes; the environment-led themes use bespoke
 * motion, while Default, Void, and Dark retain a quiet blur-focus reveal.
 *
 * All effects honour prefers-reduced-motion (fall back to an instant set) and pause
 * while the tab is hidden.
 */

const TWEEN_DEFAULT_MS = 900;
const SCRAMBLE_DEFAULT_MS = 700;
const AURORA_RESOLVE_DEFAULT_MS = 880;
const FOCUS_DEFAULT_MS = 500;
const DEFAULT_GLYPHS = '0123456789ABCDEFXTZ$#%◆◇▲▼⬡ꜩ';
const MAGIC_NUMBER_MIN_FONT_PX = 16;
const MAGIC_NUMBER_UNITS = [
    'k', 'm', 'b', 't', 'ms', 's', 'sec', 'secs', 'second', 'seconds',
    'min', 'mins', 'minute', 'minutes', 'h', 'hr', 'hrs', 'hour', 'hours',
    'd', 'day', 'days', 'y', 'yr', 'yrs', 'year', 'years',
    'xtz', 'tez', 'ꜩ', 'ctez', 'tzbtc', 'xtz/min',
    'block', 'blocks', 'baker', 'bakers', 'vote', 'votes', 'ballot', 'ballots',
    'row', 'rows', 'op', 'ops', 'tx', 'txs', 'source', 'sources',
    'account', 'accounts', 'contract', 'contracts', 'domain', 'domains',
    'name', 'names', 'event', 'events', 'oven', 'ovens', 'cycle', 'cycles',
    'epoch', 'epochs'
].join('|');
const MAGIC_NUMBER_RE = new RegExp(
    '^[\\s~≈<>+\\-−–—$€£¥ꜩ#%.,:/()]*\\d[\\d\\s~≈<>+\\-−–—$€£¥ꜩ#%.,:/()]*' +
    `(?:\\s*(?:${MAGIC_NUMBER_UNITS}))?$`,
    'i'
);

/**
 * Effect personality per theme.
 *   mode     reveal primitive dispatched by revealValue(...)
 *   glyphs   scramble alphabet — the theme's texture
 *   *Ms      theme-specific reveal pacing
 *   flair    CSS class applied to the element while revealing (extra character)
 */
const THEME_PERSONALITIES = {
    // ── Bombastic ──
    matrix:    { mode: 'scramble', glyphs: 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉ0123456789Z', scrambleMs: 950, tweenMs: 1200, flair: 'dm-crt' },
    nerv:      { mode: 'scramble', glyphs: '0123456789ABCDEF!▲■◤◢', scrambleMs: 450, tweenMs: 700, flair: 'dm-jitter' },
    hen:       { mode: 'scramble', glyphs: '▓▒░█▄▀▌▐', scrambleMs: 700, tweenMs: 900 },
    bubblegum: { mode: 'scramble', glyphs: '○●◐◑◌♡', scrambleMs: 650, tweenMs: 900, flair: 'dm-pop' },
    // ── Environment-led ──
    ember:     { mode: 'kindle', kindleMs: 720, tweenMs: 1000 },
    signal:    { mode: 'sweep', sweepMs: 620, tweenMs: 900 },
    abyss:     { mode: 'sonar', sonarMs: 900, tweenMs: 1100 },
    moss:      { mode: 'growth', growthMs: 780, tweenMs: 1000 },
    valley:    { mode: 'growth', growthMs: 920, tweenMs: 1050 },
    warzone:   { mode: 'lock', lockMs: 600, tweenMs: 1100 },
    void:      { mode: 'focus', focusMs: 900, tweenMs: 1000 },
    // ── Understated — no heavy glyph noise, quiet confidence ──
    aurora:    { mode: 'resolve', glyphs: '·˚°◦○', resolveMs: 880, tweenMs: 850 },
    default:   { mode: 'focus', focusMs: 450, tweenMs: 750 },
    dark:      { mode: 'focus', focusMs: 450, tweenMs: 750 },
    clean:     { mode: 'delta', deltaMs: 260, tweenMs: 700 }
};
const FALLBACK_PERSONALITY = THEME_PERSONALITIES.aurora;

let cachedPersonality = null;

export function getPersonality() {
    if (cachedPersonality) return cachedPersonality;
    const theme = document.body?.getAttribute('data-theme');
    cachedPersonality = THEME_PERSONALITIES[theme] || FALLBACK_PERSONALITY;
    return cachedPersonality;
}

export function prefersReducedMotion() {
    const testOverride = typeof window !== 'undefined' ? window.__DATA_MAGIC_TEST__?.forceMotion : undefined;
    if (typeof testOverride === 'boolean') return !testOverride;
    // Automation (Playwright/Selenium set navigator.webdriver) gets instant
    // text: assertions must never race a decode animation.
    if (typeof navigator !== 'undefined' && navigator.webdriver === true) return true;
    return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
}

function isHidden() {
    return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

// easeOutExpo — fast start, gentle mechanical settle
function easeOutExpo(t) {
    return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

// All engine writes go through here so the magic observer can distinguish
// its own frames from external updates (and skip re-animating them).
function dmWrite(el, str) {
    // A selection can begin between animation frames, before selectionchange
    // is delivered. Claim it synchronously at the write boundary so the next
    // glyph frame cannot replace the reader's range.
    if (
        !el.__dmSelectionSettling
        && el.__dmMagicCancel
        && el.__dmMagicFinalText !== undefined
        && selectionIntersects(el)
    ) {
        const selection = captureTargetSelection(el);
        const finalText = String(el.__dmMagicFinalText);
        el.__dmSelectionSettling = true;
        try {
            cancelMagic(el, { completeOwner: true });
            if (el.textContent !== finalText) {
                el.__dmLastWrite = finalText;
                el.textContent = finalText;
            }
        } finally {
            restoreTargetSelection(el, selection);
            delete el.__dmSelectionSettling;
        }
        return false;
    }
    el.__dmLastWrite = str;
    el.textContent = str;
    return true;
}

function selectionIntersects(el) {
    const selection = document.getSelection?.();
    if (!selection?.rangeCount) return false;
    for (let index = 0; index < selection.rangeCount; index++) {
        try {
            if (selection.getRangeAt(index).intersectsNode(el)) return true;
        } catch {}
    }
    return false;
}

function captureSelectionBoundary(root, node, offset) {
    if (!node) return null;
    if (node === root || root.contains(node)) {
        try {
            const prefix = document.createRange();
            prefix.selectNodeContents(root);
            prefix.setEnd(node, offset);
            return { inside: true, textOffset: prefix.toString().length };
        } catch {
            return { inside: true, textOffset: 0 };
        }
    }
    return { inside: false, node, offset };
}

function resolveSelectionBoundary(root, boundary) {
    if (!boundary) return null;
    if (!boundary.inside) {
        if (!boundary.node?.isConnected) return null;
        const max = boundary.node.nodeType === Node.TEXT_NODE
            ? boundary.node.length
            : boundary.node.childNodes?.length ?? 0;
        return { node: boundary.node, offset: Math.min(boundary.offset, max) };
    }

    let remaining = Math.max(0, boundary.textOffset);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let textNode = walker.nextNode();
    let lastTextNode = null;
    while (textNode) {
        lastTextNode = textNode;
        if (remaining <= textNode.length) return { node: textNode, offset: remaining };
        remaining -= textNode.length;
        textNode = walker.nextNode();
    }
    if (lastTextNode) return { node: lastTextNode, offset: lastTextNode.length };
    return { node: root, offset: 0 };
}

function captureTargetSelection(root) {
    const selection = document.getSelection?.();
    if (!selection?.rangeCount) return null;
    const ranges = [];
    for (let index = 0; index < selection.rangeCount; index++) {
        const range = selection.getRangeAt(index);
        ranges.push({
            start: captureSelectionBoundary(root, range.startContainer, range.startOffset),
            end: captureSelectionBoundary(root, range.endContainer, range.endOffset)
        });
    }
    return {
        ranges,
        anchor: captureSelectionBoundary(root, selection.anchorNode, selection.anchorOffset),
        focus: captureSelectionBoundary(root, selection.focusNode, selection.focusOffset)
    };
}

function restoreTargetSelection(root, snapshot) {
    if (!snapshot) return;
    const selection = document.getSelection?.();
    if (!selection) return;
    try {
        const anchor = resolveSelectionBoundary(root, snapshot.anchor);
        const focus = resolveSelectionBoundary(root, snapshot.focus);
        selection.removeAllRanges();
        if (
            snapshot.ranges.length === 1
            && anchor
            && focus
            && typeof selection.setBaseAndExtent === 'function'
        ) {
            selection.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset);
            return;
        }
        for (const savedRange of snapshot.ranges) {
            const start = resolveSelectionBoundary(root, savedRange.start);
            const end = resolveSelectionBoundary(root, savedRange.end);
            if (!start || !end) continue;
            const range = document.createRange();
            range.setStart(start.node, start.offset);
            range.setEnd(end.node, end.offset);
            selection.addRange(range);
        }
    } catch {
        // The selected value changed shape; the factual write still wins.
    }
}

/**
 * Keep the settled value exposed to assistive technology while visual glyph
 * frames run. Author-provided accessibility metadata is restored exactly when
 * the reveal settles or is superseded.
 */
function holdAccessibleFinalText(el, text) {
    const hadLabel = el.hasAttribute('aria-label');
    const previousLabel = el.getAttribute('aria-label');
    const hadBusy = el.hasAttribute('aria-busy');
    const previousBusy = el.getAttribute('aria-busy');
    let restored = false;

    el.setAttribute('aria-label', text);
    el.setAttribute('aria-busy', 'true');

    return () => {
        if (restored) return;
        restored = true;
        if (hadLabel) el.setAttribute('aria-label', previousLabel);
        else el.removeAttribute('aria-label');
        if (hadBusy) el.setAttribute('aria-busy', previousBusy);
        else el.removeAttribute('aria-busy');
    };
}

export function cancelMagic(el, { completeOwner = false } = {}) {
    if (!el) return;
    if (el.__dmMagicCancel) {
        el.__dmMagicCancel({ complete: completeOwner });
        el.__dmMagicCancel = null;
    }
    if (el.__dmTweenCancel) el.__dmTweenCancel();
    if (el.__dmScrambleCancel) el.__dmScrambleCancel();
    if (el.__dmAuroraCancel) el.__dmAuroraCancel();
    if (el.__dmThemeCancel) el.__dmThemeCancel();
}

function settleMagicText(el, text, {
    preserveSelection = false,
    completeOwner = false
} = {}) {
    const selection = preserveSelection && selectionIntersects(el)
        ? captureTargetSelection(el)
        : null;
    cancelMagic(el, { completeOwner });
    if (el.textContent !== text) dmWrite(el, text);
    restoreTargetSelection(el, selection);
}

function hasActiveMagic(el) {
    return Boolean(
        el?.__dmMagicCancel
        || el?.__dmTweenCancel
        || el?.__dmScrambleCancel
        || el?.__dmAuroraCancel
        || el?.__dmThemeCancel
    );
}

function applyFlair(el, personality) {
    if (personality.flair) el.classList.add(personality.flair);
}

function clearFlair(el, personality) {
    if (personality.flair) el.classList.remove(personality.flair);
}

/**
 * Count a numeric value from → to, applying `formatter` on every frame so the
 * displayed string (e.g. "1.05B", "42.3%") rolls naturally to its final form.
 * Duration defaults to the current theme personality's pacing.
 *
 * @param {HTMLElement} el
 * @param {number} from
 * @param {number} to
 * @param {object} [opts]
 * @param {(n:number)=>string} [opts.formatter]  raw-number → display string
 * @param {number} [opts.duration]
 * @param {()=>void} [opts.onDone]
 * @returns {() => void} cancel function
 */
export function tweenNumber(el, from, to, opts = {}) {
    const formatter = opts.formatter || ((n) => String(n));
    const duration = opts.duration ?? getPersonality().tweenMs ?? TWEEN_DEFAULT_MS;

    if (!el) return () => {};

    const start = Number(from);
    const end = Number(to);

    // Guard: non-finite target, no motion budget, or hidden tab → set final instantly.
    if (!Number.isFinite(end) || !Number.isFinite(start) || prefersReducedMotion() || isHidden() || duration <= 0) {
        dmWrite(el, formatter(Number.isFinite(end) ? end : to));
        opts.onDone?.();
        return () => {};
    }

    // Cancel any in-flight tween on this element.
    if (el.__dmTweenCancel) el.__dmTweenCancel();

    const startedAt = performance.now();
    let rafId = 0;
    let cancelled = false;

    const step = (now) => {
        if (cancelled) return;
        const p = Math.min(1, (now - startedAt) / duration);
        const value = start + (end - start) * easeOutExpo(p);
        if (!dmWrite(el, formatter(value))) return;
        if (p < 1) {
            rafId = requestAnimationFrame(step);
        } else {
            dmWrite(el, formatter(end));
            el.__dmTweenCancel = null;
            opts.onDone?.();
        }
    };

    const cancel = () => {
        cancelled = true;
        if (rafId) cancelAnimationFrame(rafId);
        el.__dmTweenCancel = null;
    };
    el.__dmTweenCancel = cancel;
    rafId = requestAnimationFrame(step);
    return cancel;
}

/**
 * Decode-reveal a string: scrambled glyphs resolve left-to-right into the final
 * text. Punctuation/whitespace are held stable so the shape reads early.
 * Glyph set + duration + flair default to the current theme personality.
 *
 * @param {HTMLElement} el
 * @param {string} finalText
 * @param {object} [opts]
 * @param {number} [opts.duration]
 * @param {string} [opts.glyphs]
 * @param {()=>void} [opts.onDone]
 * @returns {() => void} cancel function
 */
export function scrambleText(el, finalText, opts = {}) {
    if (!el) return () => {};
    const personality = getPersonality();
    const text = finalText == null ? '' : String(finalText);
    const duration = opts.duration ?? personality.scrambleMs ?? SCRAMBLE_DEFAULT_MS;
    const glyphs = opts.glyphs || personality.glyphs || DEFAULT_GLYPHS;

    if (prefersReducedMotion() || isHidden() || duration <= 0 || !text) {
        dmWrite(el, text);
        opts.onDone?.();
        return () => {};
    }

    if (el.__dmScrambleCancel) el.__dmScrambleCancel();
    injectStyles();
    applyFlair(el, personality);

    const glyphArr = Array.from(glyphs); // code-point safe (katakana etc.)
    const glyph = () => glyphArr[(Math.random() * glyphArr.length) | 0] || '0';
    const startedAt = performance.now();
    let rafId = 0;
    let cancelled = false;

    const finish = () => {
        dmWrite(el, text);
        clearFlair(el, personality);
        el.__dmScrambleCancel = null;
    };

    const step = (now) => {
        if (cancelled) return;
        const p = Math.min(1, (now - startedAt) / duration);
        const revealed = Math.floor(text.length * p);
        let out = '';
        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            if (i < revealed || /\s/.test(ch) || /[,%.\/·—–-]/.test(ch)) {
                out += ch;
            } else {
                out += glyph();
            }
        }
        if (!dmWrite(el, out)) return;
        if (p < 1) {
            rafId = requestAnimationFrame(step);
        } else {
            finish();
            opts.onDone?.();
        }
    };

    const cancel = () => {
        cancelled = true;
        if (rafId) cancelAnimationFrame(rafId);
        finish();
    };
    el.__dmScrambleCancel = cancel;
    rafId = requestAnimationFrame(step);
    return cancel;
}

/**
 * Aurora Resolve: keep most of the old value legible while a two-character
 * teal/violet glyph wave resolves the new value from left to right. It borrows
 * Matrix's decode idea without scrambling the full string or moving its box.
 */
export function auroraResolve(el, finalText, opts = {}) {
    if (!el) return () => {};
    const personality = getPersonality();
    const text = finalText == null ? '' : String(finalText);
    const duration = opts.duration ?? personality.resolveMs ?? AURORA_RESOLVE_DEFAULT_MS;

    if (prefersReducedMotion() || isHidden() || duration <= 0 || !text) {
        dmWrite(el, text);
        opts.onDone?.();
        return () => {};
    }

    if (el.__dmAuroraCancel) el.__dmAuroraCancel();
    injectStyles();

    const previous = Array.from(el.textContent || '');
    const finalChars = Array.from(text);
    const activeIndexes = finalChars
        .map((ch, index) => (/\s|[,%.\/·—–-]/.test(ch) ? -1 : index))
        .filter((index) => index >= 0);
    const orderByIndex = new Map(activeIndexes.map((index, order) => [index, order]));
    const glyphs = Array.from(opts.glyphs || personality.glyphs || '·˚°◦○');
    const waveWidth = Math.min(2, Math.max(1, activeIndexes.length));
    const startedAt = performance.now();
    let rafId = 0;
    let cancelled = false;
    let done = false;

    el.style.setProperty('--dm-aurora-ms', duration + 'ms');
    el.classList.remove('dm-aurora-resolve');
    void el.offsetWidth;
    el.classList.add('dm-aurora-resolve');

    const finish = (callDone = false) => {
        if (done) return;
        done = true;
        dmWrite(el, text);
        el.classList.remove('dm-aurora-resolve');
        el.__dmAuroraCancel = null;
        if (callDone) opts.onDone?.();
    };

    const step = (now) => {
        if (cancelled) return;
        const p = Math.min(1, (now - startedAt) / duration);
        const waveLead = p * (activeIndexes.length + waveWidth) - waveWidth;
        const frame = Math.floor((now - startedAt) / 95);
        const out = finalChars.map((ch, index) => {
            const order = orderByIndex.get(index);
            if (order === undefined) return ch;
            if (order < waveLead) return ch;
            if (order <= waveLead + waveWidth) {
                return glyphs[(frame + order * 2) % glyphs.length] || '·';
            }
            const oldChar = previous[index];
            return oldChar && !/\s/.test(oldChar) ? oldChar : '·';
        });
        if (!dmWrite(el, out.join(''))) return;
        if (p < 1) {
            rafId = requestAnimationFrame(step);
        } else {
            finish(true);
        }
    };

    const cancel = () => {
        cancelled = true;
        if (rafId) cancelAnimationFrame(rafId);
        finish(false);
    };
    el.__dmAuroraCancel = cancel;
    rafId = requestAnimationFrame(step);
    return cancel;
}

const STABLE_REVEAL_CHAR_RE = /\s|[,%.\/:·—–-]/;

function revealableIndexes(chars) {
    return chars
        .map((ch, index) => (STABLE_REVEAL_CHAR_RE.test(ch) ? -1 : index))
        .filter((index) => index >= 0);
}

function changedActiveIndexes(previous, finalChars, activeIndexes) {
    return activeIndexes.filter((index) => previous[index] !== finalChars[index]);
}

/**
 * Shared narrow-wave runner for effects whose identity comes from the order,
 * boundary glyph, and CSS treatment rather than full-string random noise.
 */
function runWaveReveal(el, finalText, opts = {}) {
    if (!el) return () => {};
    const text = finalText == null ? '' : String(finalText);
    const duration = opts.duration ?? SCRAMBLE_DEFAULT_MS;

    if (prefersReducedMotion() || isHidden() || duration <= 0 || !text) {
        dmWrite(el, text);
        opts.onDone?.();
        return () => {};
    }

    if (el.__dmThemeCancel) el.__dmThemeCancel();
    injectStyles();

    const previous = Array.from(el.textContent || '');
    const finalChars = Array.from(text);
    const activeIndexes = revealableIndexes(finalChars);
    const requestedOrder = opts.getOrder?.(previous, finalChars, activeIndexes) || activeIndexes;
    const activeSet = new Set(activeIndexes);
    const order = Array.from(new Set(requestedOrder)).filter((index) => activeSet.has(index));
    const rankByIndex = new Map(order.map((index, rank) => [index, rank]));
    const glyphs = Array.from(opts.glyphs || '·');
    const waveWidth = Math.min(opts.waveWidth ?? 1, Math.max(1, order.length));
    const startedAt = performance.now();
    let rafId = 0;
    let cancelled = false;
    let done = false;

    el.style.setProperty('--dm-theme-ms', duration + 'ms');
    if (opts.dataAttribute) el.setAttribute(opts.dataAttribute, text);
    el.classList.remove(opts.className);
    void el.offsetWidth;
    el.classList.add(opts.className);

    const finish = (callDone = false) => {
        if (done) return;
        done = true;
        dmWrite(el, text);
        el.classList.remove(opts.className);
        if (opts.dataAttribute) el.removeAttribute(opts.dataAttribute);
        el.__dmThemeCancel = null;
        if (callDone) opts.onDone?.();
    };

    const step = (now) => {
        if (cancelled) return;
        const p = Math.min(1, (now - startedAt) / duration);
        const waveLead = p * (order.length + waveWidth) - waveWidth;
        const frame = Math.floor((now - startedAt) / (opts.frameMs || 110));
        const out = finalChars.map((ch, index) => {
            const rank = rankByIndex.get(index);
            if (rank === undefined) return ch;
            if (rank < waveLead) return ch;
            if (rank <= waveLead + waveWidth) {
                return glyphs[(frame + rank) % glyphs.length] || '·';
            }
            const oldChar = previous[index];
            return oldChar && !/\s/.test(oldChar) ? oldChar : '·';
        });
        if (!dmWrite(el, out.join(''))) return;
        if (p < 1) {
            rafId = requestAnimationFrame(step);
        } else {
            finish(true);
        }
    };

    const cancel = () => {
        cancelled = true;
        if (rafId) cancelAnimationFrame(rafId);
        finish(false);
    };
    el.__dmThemeCancel = cancel;
    rafId = requestAnimationFrame(step);
    return cancel;
}

/**
 * Shared character runner for effects that animate only selected final glyphs.
 * Temporary spans opt out of the mutation observer so they cannot recursively
 * become new data-magic targets.
 */
function runCharacterReveal(el, finalText, opts = {}) {
    if (!el) return () => {};
    const text = finalText == null ? '' : String(finalText);
    const duration = opts.duration ?? FOCUS_DEFAULT_MS;

    if (prefersReducedMotion() || isHidden() || duration <= 0 || !text) {
        dmWrite(el, text);
        opts.onDone?.();
        return () => {};
    }

    if (el.__dmThemeCancel) el.__dmThemeCancel();
    injectStyles();

    const previous = Array.from(el.textContent || '');
    const finalChars = Array.from(text);
    const activeIndexes = revealableIndexes(finalChars);
    const requestedOrder = opts.getOrder?.(previous, finalChars, activeIndexes) || activeIndexes;
    const activeSet = new Set(activeIndexes);
    const order = Array.from(new Set(requestedOrder)).filter((index) => activeSet.has(index));
    const rankByIndex = new Map(order.map((index, rank) => [index, rank]));

    if (!order.length) {
        dmWrite(el, text);
        opts.onDone?.();
        return () => {};
    }

    const staggerSteps = Math.max(1, Math.min(order.length - 1, 8));
    const staggerWindow = duration * 0.35;
    const charDuration = Math.max(120, duration - staggerWindow);
    const fragment = document.createDocumentFragment();

    let word = null;
    finalChars.forEach((ch, index) => {
        if (/\s/.test(ch)) {
            word = null;
            fragment.append(document.createTextNode(ch));
            return;
        }

        if (!word) {
            word = document.createElement('span');
            word.className = 'dm-glyph-word';
            word.setAttribute('data-magic', 'off');
            fragment.append(word);
        }

        const rank = rankByIndex.get(index);
        if (rank === undefined) {
            word.append(document.createTextNode(ch));
            return;
        }
        const span = document.createElement('span');
        span.className = opts.charClass;
        span.setAttribute('data-magic', 'off');
        span.textContent = ch;
        span.style.setProperty('--dm-char-ms', charDuration + 'ms');
        span.style.setProperty('--dm-char-delay', Math.min(rank, 8) / staggerSteps * staggerWindow + 'ms');
        word.append(span);
    });

    let done = false;
    let timer = 0;
    el.style.setProperty('--dm-theme-ms', duration + 'ms');
    el.classList.remove(opts.className);
    el.__dmLastWrite = text;
    el.replaceChildren(fragment);
    void el.offsetWidth;
    el.classList.add(opts.className);

    const finish = (callDone = false) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        dmWrite(el, text);
        el.classList.remove(opts.className);
        el.__dmThemeCancel = null;
        if (callDone) opts.onDone?.();
    };

    const cancel = () => finish(false);
    el.__dmThemeCancel = cancel;
    timer = setTimeout(() => finish(true), duration + 70);
    return cancel;
}

/** Ember — changed characters kindle through a tiny spark front, then cool. */
export function kindleReveal(el, finalText, opts = {}) {
    const personality = getPersonality();
    return runWaveReveal(el, finalText, {
        ...opts,
        duration: opts.duration ?? personality.kindleMs ?? 720,
        className: 'dm-kindle-reveal',
        glyphs: '·*˟',
        waveWidth: 1,
        frameMs: 120,
        getOrder: (previous, finalChars, activeIndexes) => {
            const changed = changedActiveIndexes(previous, finalChars, activeIndexes);
            return changed.length ? changed : activeIndexes;
        }
    });
}

/** Signal — a scan beam resolves and locks the value from left to right. */
export function sweepLockReveal(el, finalText, opts = {}) {
    const personality = getPersonality();
    return runWaveReveal(el, finalText, {
        ...opts,
        duration: opts.duration ?? personality.sweepMs ?? 620,
        className: 'dm-sweep-lock',
        glyphs: '_|',
        waveWidth: 1,
        frameMs: 95
    });
}

/** Clean — only changed glyphs make a crisp, tiny analytics-style delta tick. */
export function deltaTickReveal(el, finalText, opts = {}) {
    const personality = getPersonality();
    return runCharacterReveal(el, finalText, {
        ...opts,
        duration: opts.duration ?? personality.deltaMs ?? 260,
        className: 'dm-delta-tick',
        charClass: 'dm-delta-char',
        getOrder: (previous, finalChars, activeIndexes) => {
            const changed = changedActiveIndexes(previous, finalChars, activeIndexes);
            return changed.length ? changed : activeIndexes;
        }
    });
}

/** Abyss — resolve from the center while cyan pressure echoes drift outward. */
export function sonarEchoReveal(el, finalText, opts = {}) {
    const personality = getPersonality();
    return runWaveReveal(el, finalText, {
        ...opts,
        duration: opts.duration ?? personality.sonarMs ?? 900,
        className: 'dm-sonar-echo',
        dataAttribute: 'data-dm-sonar',
        glyphs: '≈',
        waveWidth: 1,
        getOrder: (_previous, _finalChars, activeIndexes) => {
            const center = activeIndexes.length
                ? (activeIndexes[0] + activeIndexes[activeIndexes.length - 1]) / 2
                : 0;
            return [...activeIndexes].sort((a, b) => Math.abs(a - center) - Math.abs(b - center) || a - b);
        }
    });
}

/** Moss — final glyphs grow in a branching order from the first changed node. */
export function mycelialBloomReveal(el, finalText, opts = {}) {
    const personality = getPersonality();
    return runCharacterReveal(el, finalText, {
        ...opts,
        duration: opts.duration ?? personality.growthMs ?? 780,
        className: 'dm-mycelial-bloom',
        charClass: 'dm-mycelial-char',
        getOrder: (previous, finalChars, activeIndexes) => {
            const changed = changedActiveIndexes(previous, finalChars, activeIndexes);
            const seed = changed[0] ?? activeIndexes[Math.floor(activeIndexes.length / 2)] ?? 0;
            return [...activeIndexes].sort((a, b) => Math.abs(a - seed) - Math.abs(b - seed) || a - b);
        }
    });
}

/** Warzone — changed glyphs hard-lock while acquisition brackets close in. */
export function targetLockReveal(el, finalText, opts = {}) {
    const personality = getPersonality();
    return runCharacterReveal(el, finalText, {
        ...opts,
        duration: opts.duration ?? personality.lockMs ?? 600,
        className: 'dm-target-lock',
        charClass: 'dm-lock-char',
        getOrder: (previous, finalChars, activeIndexes) => {
            const changed = changedActiveIndexes(previous, finalChars, activeIndexes);
            return changed.length ? changed : activeIndexes;
        }
    });
}

/**
 * Understated reveal: set the final text immediately, then sharpen it from a
 * soft blur. The classic themes' answer to the scramble — calm, precise.
 */
export function focusReveal(el, finalText, opts = {}) {
    if (!el) return () => {};
    const text = finalText == null ? '' : String(finalText);
    const duration = opts.duration ?? getPersonality().focusMs ?? FOCUS_DEFAULT_MS;

    dmWrite(el, text);
    if (prefersReducedMotion() || isHidden() || duration <= 0 || !text) {
        opts.onDone?.();
        return () => {};
    }

    injectStyles();
    el.style.setProperty('--dm-focus-ms', duration + 'ms');
    el.classList.remove('dm-focus-in');
    void el.offsetWidth;
    el.classList.add('dm-focus-in');
    const timer = setTimeout(() => {
        el.classList.remove('dm-focus-in');
        opts.onDone?.();
    }, duration + 50);
    return () => {
        clearTimeout(timer);
        el.classList.remove('dm-focus-in');
    };
}

/** Theme-aware text reveal. The one entry point callers should reach for. */
export function revealValue(el, finalText, opts = {}) {
    switch (getPersonality().mode) {
        case 'resolve': return auroraResolve(el, finalText, opts);
        case 'kindle': return kindleReveal(el, finalText, opts);
        case 'sweep': return sweepLockReveal(el, finalText, opts);
        case 'delta': return deltaTickReveal(el, finalText, opts);
        case 'sonar': return sonarEchoReveal(el, finalText, opts);
        case 'growth': return mycelialBloomReveal(el, finalText, opts);
        case 'lock': return targetLockReveal(el, finalText, opts);
        case 'focus': return focusReveal(el, finalText, opts);
        default: return scrambleText(el, finalText, opts);
    }
}

function hasNumericText(text) {
    return /-?\d/.test(String(text || ''));
}

function isMagicNumberText(text) {
    const value = String(text || '').trim();
    if (!hasNumericText(value) || value.length > 32) return false;
    return MAGIC_NUMBER_RE.test(value);
}

function isMagicDisabled(el) {
    return Boolean(el?.closest?.([
        '[data-magic="off"]',
        '[data-magic-number="minor"]',
        '[data-live-countdown]',
        '[data-hot-live="clock"]',
        '[data-health-age]',
        '#hero-chain-uptime-counter',
        '#chain-uptime-counter',
        '.loading',
        '.error-state'
    ].join(', ')));
}

function isMajorMagicTarget(el, opts = {}) {
    if (!el || isMagicDisabled(el) || el.matches?.(MAGIC_EXCLUDE)) return false;
    if (opts.force || opts.major || el.dataset.magicNumber === 'major') return true;
    const minFontPx = opts.minFontPx ?? MAGIC_NUMBER_MIN_FONT_PX;
    const fontSize = parseFloat(window.getComputedStyle?.(el)?.fontSize || '0');
    return Number.isFinite(fontSize) && fontSize >= minFontPx;
}

function beginOwnedMagicReveal(el, text, opts = {}) {
    cancelMagic(el);
    injectStyles();
    const restoreAccessibility = holdAccessibleFinalText(el, text);
    let settled = false;
    const finish = () => {
        if (settled) return;
        settled = true;
        restoreAccessibility();
        el.__dmMagicCancel = null;
        opts.onDone?.();
    };
    const effectCancel = revealValue(el, text, {
        duration: opts.duration,
        onDone: finish
    });
    if (settled) return false;
    const cancel = ({ complete = false } = {}) => {
        if (settled) return;
        settled = true;
        el.__dmMagicCancel = null;
        effectCancel();
        restoreAccessibility();
        if (complete) opts.onDone?.();
    };
    el.__dmMagicCancel = cancel;
    return true;
}

/**
 * Theme-aware setter for prominent live numeric text. This is the preferred
 * write path for realtime values big enough to make motion useful.
 */
export function setMagicNumber(el, finalText, opts = {}) {
    if (!el) return false;
    const text = finalText == null ? '' : String(finalText);
    // Explicitly reconciled values have one writer: their setter. The global
    // observer remains available for legacy/injected live text, but must not
    // race the same node and replay its intermediate frames.
    if (!opts.observer) el.__dmExplicitMagic = true;
    const renderedText = el.textContent.trim();
    const trackedText = el.__dmMagicFinalText;
    // An active reveal's DOM contains transitional glyphs, so its tracked
    // target is authoritative. Once settled, an external loading/error write
    // may supersede that target and the actual rendered text must win.
    const previousText = opts.previousText ?? (
        el.__dmMagicCancel || renderedText === trackedText
            ? trackedText ?? renderedText
            : renderedText
    );
    const unchanged = previousText === text;
    el.__dmMagicFinalText = text;

    // A reader selecting this value takes priority over equality. An
    // unchanged request may still be arriving while the same target is
    // mid-reveal; stop those glyph frames and settle the selection in place.
    if (selectionIntersects(el)) {
        settleMagicText(el, text, {
            preserveSelection: true,
            completeOwner: true
        });
        opts.onDone?.();
        return false;
    }

    if (unchanged) {
        // A duplicate live writer targeting the same final text must not tear
        // down the reveal that is already painting that value. Only an
        // explicit settle-now writer (loading/error/reduced-motion takeover)
        // owns cancellation; the original reveal owns its completion callback.
        const active = hasActiveMagic(el);
        const sameActiveTarget = active && trackedText === text;
        const mustSettle = (
            opts.animate === false
            || isHidden()
            || prefersReducedMotion()
            || !inViewport(el)
            || !isMajorMagicTarget(el, opts)
        );
        if (active && (mustSettle || !sameActiveTarget)) {
            settleMagicText(el, text, {
                preserveSelection: true,
                // Environmental settlement completes the current owner. A
                // same-visible-text observer write that supersedes a different
                // target cancels that stale owner without firing its callback.
                completeOwner: sameActiveTarget
            });
            opts.onDone?.();
        } else if (!active) {
            opts.onDone?.();
        }
        return false;
    }

    if (opts.animate === false) {
        settleMagicText(el, text);
        opts.onDone?.();
        return false;
    }

    if (
        (!opts.allowText && !isMagicNumberText(text))
        || (opts.allowText && !text)
        || isHidden()
        || prefersReducedMotion()
        || !inViewport(el)
        || !isMajorMagicTarget(el, opts)
    ) {
        settleMagicText(el, text);
        opts.onDone?.();
        return false;
    }

    if (opts.animateInitial === false && isPlaceholderText(previousText)) {
        settleMagicText(el, text);
        opts.onDone?.();
        return false;
    }

    return beginOwnedMagicReveal(el, text, opts);
}

/**
 * Theme-aware setter for prominent numeric or textual values. This shares the
 * number setter's visibility, ownership, selection, and accessibility guards.
 */
export function setMagicValue(el, finalText, opts = {}) {
    return setMagicNumber(el, finalText, { ...opts, allowText: true });
}

/**
 * One-shot accent shimmer sweep across an element — "this value is fresh."
 * No-op under reduced motion.
 */
export function pulseFresh(el) {
    if (!el || prefersReducedMotion()) return;
    injectStyles();
    if (el.__dmFreshTimer) clearTimeout(el.__dmFreshTimer);
    el.classList.remove('dm-fresh');
    void el.offsetWidth; // restart animation
    el.classList.add('dm-fresh');
    el.__dmFreshTimer = setTimeout(() => {
        el.classList.remove('dm-fresh');
        el.__dmFreshTimer = null;
    }, 1000);
}

export function cancelFresh(el) {
    if (!el) return;
    if (el.__dmFreshTimer) clearTimeout(el.__dmFreshTimer);
    el.__dmFreshTimer = null;
    el.classList.remove('dm-fresh');
}

// ─── MAGIC OBSERVER ───
// Auto-reveal for text that other features write in place (or re-render via
// innerHTML): governance descriptions, briefing hot-today values, chamber
// entry metrics. New surfaces can opt in with a data-magic-text attribute —
// no wiring required.

// Per-second tickers must never animate: a reveal would settle on stale text.
const MAGIC_EXCLUDE = [
    '[data-live-countdown]',
    '[data-hot-live="clock"]',
    '[data-health-age]',
    '#hero-chain-uptime-counter',
    '#chain-uptime-counter',
    '.loading',
    '.error-state'
].join(', ');
const MAGIC_TEXT_SELECTORS = [
    '#proposal-description', '#voting-description', '#participation-description',
    '#cycle-description', '#tz4-description',
    '[data-hot-live]',
    '#chamber-entry-mini', '.chamber-entry-metric strong', '#chamber-entry-hero span',
    '.chamber-now-card strong', '.lb-metric-grid strong', '.tezlink-entry-metric strong',
    '.td-entry-metric strong', '.td-pulse-metric strong',
    '.ctez-console-metric strong', '.ctez-summary-strip strong', '.ctez-selected-summary strong',
    '.ledger-flow-detail-metrics strong',
    '.top-continuity-stat strong', '.stat-value', '.network-health-score',
    '.drawer-operator-value', '.my-baker-stat-value', '.rt-accent',
    '[data-magic-text]'
].join(', ');
const MAGIC_NUMBER_CANDIDATE_SELECTORS = [
    'span', 'strong', 'b', 'em', 'output', 'code', 'td', 'th',
    '[class*="value"]', '[class*="number"]', '[class*="count"]', '[class*="metric"]',
    '[class*="score"]', '[class*="amount"]', '[class*="power"]', '[class*="percent"]',
    '[class*="pct"]', '[class*="rate"]', '[class*="tvl"]', '[class*="ema"]',
    '[class*="balance"]', '[class*="debt"]', '[class*="total"]', '[class*="share"]',
    '[id*="value"]', '[id*="number"]', '[id*="count"]', '[id*="metric"]',
    '[id*="score"]', '[id*="amount"]', '[id*="power"]', '[id*="percent"]',
    '[id*="pct"]', '[id*="rate"]', '[id*="tvl"]', '[id*="ema"]',
    '[id*="balance"]', '[id*="debt"]', '[id*="total"]', '[id*="share"]'
].join(', ');
const MAGIC_NUMBER_SCOPE_SELECTORS = [
    '#chambers-section',
    '#chambers-grid',
    '.chamber-entry-card',
    '.chamber-card-pair',
    '.chamber-content',
    '.chamber-body',
    '.chamber-now-card',
    '.lb-panel',
    '.health-panel',
    '.tezlink-panel',
    '.etherlink-gov-panel',
    '.tz4-panel',
    '.ctez-console-shell',
    '.ctez-summary-strip',
    '.ctez-selected-summary',
    '.ledger-flow-panel',
    '.tezos-domains-body',
    '.td-panel',
    '.td-pulse-grid',
    '#protocol-history-chamber-modal'
].join(', ');

let magicObserver = null;
const lastSeenText = new WeakMap();

function isPlaceholderText(text) {
    return !text || text === '---' || text === '--' || text === '—';
}

function inViewport(el) {
    const override = typeof window !== 'undefined' ? window.__DATA_MAGIC_TEST__?.isInViewport : null;
    if (typeof override === 'function') return Boolean(override(el));
    const style = window.getComputedStyle?.(el);
    if (style?.display === 'none' || style?.visibility === 'hidden' || style?.visibility === 'collapse') return false;
    let rect = el.getBoundingClientRect();
    if ((rect.width <= 0 || rect.height <= 0) && isPlaceholderText(el.textContent.trim())) {
        const reservedSurface = el.closest?.('.top-continuity-stat, [data-stat]');
        if (reservedSurface && reservedSurface !== el) {
            rect = reservedSurface.getBoundingClientRect();
        }
    }
    if (
        rect.width <= 0
        || rect.height <= 0
        || rect.bottom <= 0
        || rect.top >= window.innerHeight
        || rect.right <= 0
        || rect.left >= window.innerWidth
        || el.closest?.('[hidden], [aria-hidden="true"]')
    ) return false;

    let visibleLeft = Math.max(0, rect.left);
    let visibleRight = Math.min(window.innerWidth, rect.right);
    let visibleTop = Math.max(0, rect.top);
    let visibleBottom = Math.min(window.innerHeight, rect.bottom);
    const clippingValues = new Set(['auto', 'hidden', 'clip', 'scroll', 'overlay']);
    for (let ancestor = el.parentElement; ancestor; ancestor = ancestor.parentElement) {
        if (ancestor === document.body || ancestor === document.documentElement) continue;
        const ancestorStyle = window.getComputedStyle?.(ancestor);
        const clipsX = clippingValues.has(ancestorStyle?.overflowX);
        const clipsY = clippingValues.has(ancestorStyle?.overflowY);
        if (!clipsX && !clipsY) continue;
        const ancestorRect = ancestor.getBoundingClientRect();
        const clipLeft = ancestorRect.left + ancestor.clientLeft;
        const clipTop = ancestorRect.top + ancestor.clientTop;
        if (clipsX) {
            visibleLeft = Math.max(visibleLeft, clipLeft);
            visibleRight = Math.min(visibleRight, clipLeft + ancestor.clientWidth);
        }
        if (clipsY) {
            visibleTop = Math.max(visibleTop, clipTop);
            visibleBottom = Math.min(visibleBottom, clipTop + ancestor.clientHeight);
        }
        if (visibleRight <= visibleLeft || visibleBottom <= visibleTop) return false;
    }
    return true;
}

function isLeafMagicNumberCandidate(el) {
    if (!el || el.nodeType !== 1 || el.children.length > 0 || el.matches(MAGIC_EXCLUDE)) return false;
    const text = el.textContent.trim();
    return !isPlaceholderText(text) && isMagicNumberText(text) && isMajorMagicTarget(el);
}

function isMagicNumberScope(el) {
    return Boolean(el?.matches?.(MAGIC_NUMBER_SCOPE_SELECTORS) || el?.closest?.(MAGIC_NUMBER_SCOPE_SELECTORS));
}

function collectScopedMagicNumbers(touched, root, addedTargets) {
    if (!root?.querySelectorAll || !isMagicNumberScope(root)) return;
    for (const el of root.querySelectorAll('*')) {
        if (!isLeafMagicNumberCandidate(el)) continue;
        touched.add(el);
        addedTargets?.add(el);
    }
}

function addMagicTouch(touched, el) {
    if (!el || el.nodeType !== 1 || !el.closest) return;
    const explicitTarget = el.closest(MAGIC_TEXT_SELECTORS);
    if (explicitTarget) {
        touched.add(explicitTarget);
        return;
    }
    if (isLeafMagicNumberCandidate(el)) touched.add(el);
}

function collectAddedMagicTargets(touched, added, addedTargets) {
    if (added.nodeType === 3) {
        addMagicTouch(touched, added.parentElement);
        return;
    }
    if (added.nodeType !== 1) return;
    if (added.matches?.(MAGIC_TEXT_SELECTORS) || isLeafMagicNumberCandidate(added)) {
        touched.add(added);
        addedTargets.add(added);
    }
    if (added.querySelectorAll) {
        for (const el of added.querySelectorAll(MAGIC_TEXT_SELECTORS)) {
            touched.add(el);
            addedTargets.add(el);
        }
        for (const el of added.querySelectorAll(MAGIC_NUMBER_CANDIDATE_SELECTORS)) {
            if (!isLeafMagicNumberCandidate(el)) continue;
            touched.add(el);
            addedTargets.add(el);
        }
        collectScopedMagicNumbers(touched, added, addedTargets);
    }
}

function onMagicMutations(mutations) {
    const touched = new Set();
    const addedTargets = new Set();
    const previousMutationText = new Map();
    for (const m of mutations) {
        const node = m.target.nodeType === 3 ? m.target.parentElement : m.target;
        addMagicTouch(touched, node);
        if (node && !previousMutationText.has(node)) {
            const previous = m.type === 'characterData'
                ? m.oldValue
                : Array.from(m.removedNodes || []).map((removed) => removed.textContent || '').join('');
            if (previous != null && String(previous).trim()) {
                previousMutationText.set(node, String(previous).trim());
            }
        }
        // innerHTML renders (the chamber pattern) insert whole subtrees: the
        // matching elements arrive inside addedNodes, never as the target.
        for (const added of m.addedNodes) {
            collectAddedMagicTargets(touched, added, addedTargets);
        }
    }
    for (const el of touched) {
        if (el.children.length > 0) continue; // leaf text only
        const text = el.textContent.trim();
        if (isPlaceholderText(text)) continue;
        if (el.__dmExplicitMagic) {
            lastSeenText.set(el, String(el.__dmMagicFinalText ?? text).trim());
            continue;
        }
        const engineWrite = (
            el.__dmLastWrite !== undefined
            && String(el.__dmLastWrite).trim() === text
        );
        if (el.matches(MAGIC_EXCLUDE)) {
            // Exclusion suppresses new motion; it must never preserve an old
            // owner. When the current mutation is one of that owner's frames,
            // settle its tracked target rather than adopting a glyph frame.
            const settledText = engineWrite && el.__dmMagicFinalText !== undefined
                ? String(el.__dmMagicFinalText)
                : text;
            el.__dmMagicFinalText = settledText;
            settleMagicText(el, settledText, {
                preserveSelection: true,
                completeOwner: true
            });
            lastSeenText.set(el, settledText);
            continue;
        }
        // Engine's own frames: adopt without re-animating.
        if (engineWrite) {
            lastSeenText.set(el, text);
            continue;
        }
        // Unchanged rewrites (features often re-set identical text every refresh).
        const previousText = lastSeenText.get(el)
            ?? previousMutationText.get(el)
            ?? (addedTargets.has(el) ? '—' : undefined);
        const conflictingActiveTarget = (
            hasActiveMagic(el)
            && el.__dmMagicFinalText !== undefined
            && String(el.__dmMagicFinalText).trim() !== text
        );
        if (previousText === text && !conflictingActiveTarget) continue;
        lastSeenText.set(el, text);
        // Offscreen/hidden writes are already settled by their owner. They must
        // not queue a reveal that surprises the reader after scrolling.
        if (!inViewport(el)) {
            settleMagicText(el, text, {
                preserveSelection: true,
                completeOwner: true
            });
            el.__dmMagicFinalText = text;
            continue;
        }
        if (isMagicNumberText(text)) {
            setMagicNumber(el, text, {
                animateInitial: true,
                previousText,
                observer: true
            });
        } else {
            setMagicValue(el, text, {
                animateInitial: true,
                previousText,
                observer: true,
                force: true
            });
        }
    }
}

let selectionGuardInstalled = false;

function guardSelectedMagic() {
    const selection = document.getSelection?.();
    if (!selection?.rangeCount) return;
    for (const el of document.querySelectorAll('[aria-busy="true"]')) {
        if (
            !el.__dmMagicCancel
            || el.__dmMagicFinalText === undefined
            || !selectionIntersects(el)
        ) continue;
        settleMagicText(el, String(el.__dmMagicFinalText), {
            preserveSelection: true,
            completeOwner: true
        });
    }
}

export function observeMagic() {
    if (magicObserver || typeof MutationObserver === 'undefined' || !document.body) return;
    magicObserver = new MutationObserver(onMagicMutations);
    magicObserver.observe(document.body, {
        childList: true,
        characterData: true,
        characterDataOldValue: true,
        subtree: true
    });
    if (!selectionGuardInstalled) {
        document.addEventListener('selectionchange', guardSelectedMagic);
        selectionGuardInstalled = true;
    }
}

// ─── AMBIENT LOOP ───
// Every 18–35s, one random visible stat receives a decorative shimmer. Ambient
// personality never rewrites factual text; glyph reveals mean the data changed.

const AMBIENT_MIN_MS = 18000;
const AMBIENT_MAX_MS = 35000;
let ambientTimer = null;

// Stat-grid fronts plus chamber metrics and the hero chain chips. The hero
// uptime *counter* stays out: it ticks every second, so a re-decode would
// settle on stale digits.
const AMBIENT_SELECTORS = [
    '[data-stat] [id$="-front"]',
    '.chamber-entry-metric strong', '#chamber-entry-hero span', '#chamber-entry-mini',
    '.chamber-now-card strong', '.lb-metric-grid strong', '.tezlink-entry-metric strong',
    '#hero-chain-uptime-bakers', '#hero-chain-uptime-staked',
    '#hero-chain-uptime-issuance', '#hero-chain-uptime-finality',
    '#chain-uptime-bakers', '#chain-uptime-staked',
    '#chain-uptime-issuance', '#chain-uptime-finality',
    '[data-magic-text]'
].join(', ');

function ambientTargets() {
    return Array.from(document.querySelectorAll(AMBIENT_SELECTORS)).filter((el) => {
        if (el.children.length > 0 || el.matches(MAGIC_EXCLUDE)) return false;
        const text = el.textContent.trim();
        if (isPlaceholderText(text)) return false;
        // Loading copy can outlive its class (cached-stats path): real stat values
        // are short or contain a digit; prose like "Preheating the oven" is neither.
        if (text.length > 16 && !/\d/.test(text)) return false;
        if (
            el.__dmMagicCancel
            || el.__dmTweenCancel
            || el.__dmScrambleCancel
            || el.__dmAuroraCancel
            || el.__dmThemeCancel
        ) return false; // mid-animation
        return inViewport(el);
    });
}

function ambientTick({ reschedule = true } = {}) {
    if (reschedule) scheduleAmbient();
    if (isHidden() || prefersReducedMotion()) return;

    const targets = ambientTargets();
    if (!targets.length) return;
    const el = targets[(Math.random() * targets.length) | 0];
    const card = el.closest('[data-stat]');
    pulseFresh(card?.querySelector('.card-inner') || el);
}

/**
 * Deterministic browser-test seam: run one ambient pass without arming a timer.
 * Tests may provide window.__DATA_MAGIC_TEST__.forceMotion/isInViewport.
 */
export function flushAmbientForTest() {
    ambientTick({ reschedule: false });
}

function scheduleAmbient() {
    if (ambientTimer) clearTimeout(ambientTimer);
    const delay = AMBIENT_MIN_MS + Math.random() * (AMBIENT_MAX_MS - AMBIENT_MIN_MS);
    ambientTimer = setTimeout(ambientTick, delay);
}

/**
 * Start theme tracking + the ambient loop. Call once at app init.
 */
export function initDataMagic() {
    injectStyles();
    // Personality follows whatever theme is on screen (including picker previews).
    window.addEventListener('themechange', (e) => {
        cachedPersonality = THEME_PERSONALITIES[e.detail?.theme] || FALLBACK_PERSONALITY;
    });
    observeMagic();
    scheduleAmbient();
}

let stylesInjected = false;
export function injectStyles() {
    if (stylesInjected || typeof document === 'undefined') return;
    if (document.getElementById('data-magic-styles')) { stylesInjected = true; return; }
    const s = document.createElement('style');
    s.id = 'data-magic-styles';
    s.textContent = [
        // Fresh-data shimmer sweep
        '.dm-fresh{position:relative}',
        '.dm-fresh::after{content:"";position:absolute;inset:0;pointer-events:none;border-radius:inherit;' +
            'background:linear-gradient(105deg,transparent 30%,rgba(var(--accent-rgb,0,212,255),0.14) 50%,transparent 70%);' +
            'background-size:220% 100%;animation:dmShimmer 0.9s ease-out forwards;z-index:2}',
        '@keyframes dmShimmer{0%{background-position:180% 0;opacity:0}15%{opacity:1}100%{background-position:-80% 0;opacity:0}}',
        // Understated blur-to-sharp reveal (classic themes + aurora/void)
        '.dm-focus-in{animation:dmFocusIn var(--dm-focus-ms,500ms) cubic-bezier(0.22,1,0.36,1)}',
        '@keyframes dmFocusIn{0%{filter:blur(10px) brightness(1.45);opacity:0.08;' +
            'text-shadow:0 0 20px rgba(var(--accent-rgb,0,212,255),0.55)}' +
            '42%{filter:blur(2px) brightness(1.18);opacity:1;' +
            'text-shadow:0 0 14px rgba(var(--accent-rgb,0,212,255),0.38)}' +
            '100%{filter:blur(0) brightness(1);opacity:1;text-shadow:0 0 0 rgba(var(--accent-rgb,0,212,255),0)}}',
        // Flair: CRT glow flicker (matrix)
        '.dm-crt{animation:dmCrt 0.12s steps(2) infinite;text-shadow:0 0 6px rgba(var(--accent-rgb,0,255,65),0.55)}',
        '@keyframes dmCrt{0%{opacity:1}100%{opacity:0.88}}',
        // Flair: alarm jitter (nerv)
        '.dm-jitter{animation:dmJitter 0.09s steps(2) infinite}',
        '@keyframes dmJitter{0%{transform:translate(0.5px,-0.5px)}100%{transform:translate(-0.5px,0.5px)}}',
        // Flair: settle pop (bubblegum)
        '.dm-pop{animation:dmPop 0.5s cubic-bezier(0.34,1.56,0.64,1)}',
        '@keyframes dmPop{0%{transform:scale(0.96)}60%{transform:scale(1.04)}100%{transform:scale(1)}}',
        // Aurora Resolve — a restrained teal-to-violet glow behind the glyph wave
        '.dm-aurora-resolve{animation:dmAuroraResolve var(--dm-aurora-ms,880ms) cubic-bezier(0.22,1,0.36,1)}',
        '@keyframes dmAuroraResolve{0%{filter:brightness(1);text-shadow:0 0 0 rgba(69,224,200,0)}' +
            '28%{filter:brightness(1.12) saturate(1.08);text-shadow:0 0 10px rgba(69,224,200,0.52)}' +
            '62%{filter:brightness(1.08) saturate(1.06);text-shadow:0 0 9px rgba(155,140,255,0.42)}' +
            '100%{filter:brightness(1);text-shadow:0 0 0 rgba(244,154,209,0)}}',
        // Ember Kindle — changed glyphs ignite, flare once, then cool
        '.dm-kindle-reveal{animation:dmKindleReveal var(--dm-theme-ms,720ms) cubic-bezier(0.22,1,0.36,1)}',
        '@keyframes dmKindleReveal{0%{filter:brightness(0.92);text-shadow:0 0 0 rgba(229,80,57,0)}' +
            '28%{filter:brightness(1.24) saturate(1.16);text-shadow:0 0 5px rgba(229,80,57,0.72),0 0 14px rgba(255,99,32,0.34)}' +
            '58%{filter:brightness(1.14) saturate(1.1);text-shadow:0 0 6px rgba(255,159,67,0.55)}' +
            '100%{filter:brightness(1);text-shadow:0 0 0 rgba(255,159,67,0)}}',
        // Signal Sweep Lock — a narrow scan beam resolves the value behind it
        '.dm-sweep-lock{position:relative;animation:dmSignalLock var(--dm-theme-ms,620ms) steps(4,end)}',
        '.dm-sweep-lock::after{content:"";position:absolute;top:-0.14em;bottom:-0.14em;left:0;width:2px;' +
            'pointer-events:none;background:#c8fff0;box-shadow:0 0 5px #00e4a0,0 0 12px rgba(0,228,160,0.65);' +
            'animation:dmSignalBeam var(--dm-theme-ms,620ms) linear forwards}',
        '@keyframes dmSignalLock{0%,22%{text-shadow:0 0 0 rgba(0,228,160,0)}' +
            '52%{text-shadow:0 0 7px rgba(0,228,160,0.55)}100%{text-shadow:0 0 0 rgba(0,228,160,0)}}',
        '@keyframes dmSignalBeam{0%{left:0;opacity:0}10%{opacity:1}88%{opacity:0.85}100%{left:100%;opacity:0}}',
        // Clean Delta Tick — crisp per-glyph movement plus a single blue hairline
        '.dm-delta-tick{position:relative}',
        '.dm-delta-tick::after{content:"";position:absolute;left:50%;bottom:-0.08em;width:1.5em;height:1px;margin-left:-0.75em;pointer-events:none;' +
            'background:#2563eb;transform-origin:center;animation:dmDeltaLine var(--dm-theme-ms,260ms) ease-out forwards}',
        '.dm-delta-char{display:inline-block!important;animation:dmDeltaChar var(--dm-char-ms,170ms) cubic-bezier(0.22,1,0.36,1) both;' +
            'animation-delay:var(--dm-char-delay,0ms)}',
        '@keyframes dmDeltaChar{0%{opacity:0;transform:translateY(2px);color:#2563eb}' +
            '100%{opacity:1;transform:translateY(0);color:inherit}}',
        '@keyframes dmDeltaLine{0%{opacity:0;transform:scaleX(0)}25%{opacity:0.8}100%{opacity:0;transform:scaleX(1)}}',
        // Character reveals retain ordinary word-level wrapping instead of creating
        // a temporary line-break opportunity between every animated glyph. These
        // renderer-owned nodes must win over component descendant selectors: a
        // temporary block glyph would resize the settled card and move the reader.
        '.dm-glyph-word{display:inline-block!important;white-space:nowrap!important}',
        // Abyss Sonar Echo — center-out resolve with two cyan pressure echoes
        '.dm-sonar-echo{position:relative;animation:dmSonarCore var(--dm-theme-ms,900ms) ease-out}',
        '.dm-sonar-echo::before,.dm-sonar-echo::after{content:attr(data-dm-sonar);position:absolute;inset:0;pointer-events:none;' +
            'color:#00e5ff;font:inherit;line-height:inherit;text-align:inherit;white-space:inherit;opacity:0}',
        '.dm-sonar-echo::before{animation:dmSonarEchoOne var(--dm-theme-ms,900ms) ease-out forwards}',
        '.dm-sonar-echo::after{animation:dmSonarEchoTwo var(--dm-theme-ms,900ms) ease-out 90ms forwards}',
        '@keyframes dmSonarCore{0%{filter:brightness(0.9)}45%{filter:brightness(1.2)}100%{filter:brightness(1)}}',
        '@keyframes dmSonarEchoOne{12%{opacity:0.42;transform:scale(0.96);filter:blur(0)}' +
            '100%{opacity:0;transform:scale(1.08);filter:blur(3px)}}',
        '@keyframes dmSonarEchoTwo{16%{opacity:0.28;transform:scale(0.98);filter:blur(0)}' +
            '100%{opacity:0;transform:scale(1.14);filter:blur(5px)}}',
        // Moss Mycelial Bloom — characters grow outward from the changed node
        '.dm-mycelial-char{display:inline-block!important;transform-origin:50% 85%;animation:dmMycelialChar var(--dm-char-ms,500ms) ease-out both;' +
            'animation-delay:var(--dm-char-delay,0ms)}',
        '@keyframes dmMycelialChar{0%{opacity:0.18;transform:scale(0.58);color:#d4a050;text-shadow:0 0 11px rgba(212,160,80,0.86)}' +
            '42%{opacity:1;transform:scale(1.08);color:#66e066;text-shadow:0 0 8px rgba(102,224,102,0.72)}' +
            '100%{opacity:1;transform:scale(1);color:inherit;text-shadow:0 0 0 rgba(102,224,102,0)}}',
        // Warzone Target Lock — acquisition brackets, scan beam, hard glyph snap
        '.dm-target-lock{position:relative}',
        '.dm-target-lock::before{content:"";position:absolute;inset:-0.3em -0.42em;pointer-events:none;' +
            'background:linear-gradient(#ffc000,#ffc000) left top/9px 1px no-repeat,' +
            'linear-gradient(#ffc000,#ffc000) left top/1px 9px no-repeat,' +
            'linear-gradient(#ffc000,#ffc000) right top/9px 1px no-repeat,' +
            'linear-gradient(#ffc000,#ffc000) right top/1px 9px no-repeat,' +
            'linear-gradient(#ffc000,#ffc000) left bottom/9px 1px no-repeat,' +
            'linear-gradient(#ffc000,#ffc000) left bottom/1px 9px no-repeat,' +
            'linear-gradient(#ffc000,#ffc000) right bottom/9px 1px no-repeat,' +
            'linear-gradient(#ffc000,#ffc000) right bottom/1px 9px no-repeat;' +
            'animation:dmTargetBrackets var(--dm-theme-ms,600ms) cubic-bezier(0.22,1,0.36,1) forwards}',
        '.dm-target-lock::after{content:"";position:absolute;top:-0.12em;bottom:-0.12em;left:0;width:1px;pointer-events:none;' +
            'background:#fff1a8;box-shadow:0 0 7px rgba(255,192,0,0.9);animation:dmTargetScan var(--dm-theme-ms,600ms) linear forwards}',
        '.dm-lock-char{display:inline-block!important;animation:dmLockChar var(--dm-char-ms,390ms) steps(3,end) both;' +
            'animation-delay:var(--dm-char-delay,0ms)}',
        '@keyframes dmTargetBrackets{0%{opacity:0;transform:scale(1.5)}18%{opacity:0.9}' +
            '72%{opacity:0.72;transform:scale(1)}100%{opacity:0}}',
        '@keyframes dmTargetScan{0%{left:0;opacity:0}15%{opacity:1}82%{opacity:0.85}100%{left:100%;opacity:0}}',
        '@keyframes dmLockChar{0%{opacity:0.12;transform:scaleX(0.58);color:#ffc000}' +
            '66%{opacity:1;transform:scaleX(1.08);color:#fff1a8}100%{opacity:1;transform:scaleX(1);color:inherit}}',
        // Honour reduced motion globally for this layer
        '@media (prefers-reduced-motion: reduce){.dm-fresh::after,.dm-focus-in,.dm-crt,.dm-jitter,.dm-pop,' +
            '.dm-aurora-resolve,.dm-kindle-reveal,.dm-sweep-lock,.dm-sweep-lock::after,.dm-delta-tick::after,.dm-delta-char,' +
            '.dm-sonar-echo,.dm-sonar-echo::before,.dm-sonar-echo::after,.dm-mycelial-char,.dm-target-lock::before,' +
            '.dm-target-lock::after,.dm-lock-char{animation:none!important}}',
    ].join('\n');
    (document.head || document.documentElement).appendChild(s);
    stylesInjected = true;
}
