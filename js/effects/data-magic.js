/**
 * DATA-MAGIC — async data arrival effects, tuned per theme
 *
 * The "magic" layer for numbers and text as they land:
 *   • tweenNumber  — odometer / count-up on a raw numeric value (formatter applied per frame)
 *   • scrambleText — glyph-decode reveal for strings (proposal names, headlines)
 *   • focusReveal  — understated blur-to-sharp reveal (classic themes)
 *   • revealValue  — theme-aware dispatch: picks scramble vs focus per personality
 *   • pulseFresh   — one-shot accent shimmer sweep signalling "this value just updated"
 *   • blockTick    — mechanical up-tick for the block-height number (the chain's heartbeat)
 *   • initDataMagic — themechange tracking + the ambient loop (sparse idle re-decodes)
 *
 * Every theme carries an effect personality: bombastic themes (matrix, nerv,
 * warzone…) decode through theme-flavoured glyph sets with flair classes;
 * classic themes (default, dark, clean) and aurora get a quiet blur-focus
 * reveal instead — no glyph noise, still alive.
 *
 * All effects honour prefers-reduced-motion (fall back to an instant set) and pause
 * while the tab is hidden.
 */

const TWEEN_DEFAULT_MS = 900;
const SCRAMBLE_DEFAULT_MS = 700;
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
 *   mode     'scramble' (glyph decode) | 'focus' (blur-to-sharp)
 *   glyphs   scramble alphabet — the theme's texture
 *   scrambleMs / tweenMs / focusMs — pacing (bombastic = slower, savoured)
 *   flair    CSS class applied to the element while revealing (extra character)
 */
const THEME_PERSONALITIES = {
    // ── Bombastic ──
    matrix:    { mode: 'scramble', glyphs: 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉ0123456789Z', scrambleMs: 950, tweenMs: 1200, flair: 'dm-crt' },
    nerv:      { mode: 'scramble', glyphs: '0123456789ABCDEF!▲■◤◢', scrambleMs: 450, tweenMs: 700, flair: 'dm-jitter' },
    warzone:   { mode: 'scramble', glyphs: '█▓▒░', scrambleMs: 850, tweenMs: 1100 },
    ember:     { mode: 'scramble', glyphs: '▲△∴·˟*', scrambleMs: 750, tweenMs: 1000, flair: 'dm-flicker' },
    hen:       { mode: 'scramble', glyphs: '▓▒░█▄▀▌▐', scrambleMs: 700, tweenMs: 900 },
    signal:    { mode: 'scramble', glyphs: '01<>/\\|=+-_', scrambleMs: 700, tweenMs: 900 },
    abyss:     { mode: 'scramble', glyphs: '~≈∿·°˚∴', scrambleMs: 850, tweenMs: 1100 },
    moss:      { mode: 'scramble', glyphs: '·:⁚⁘*ᵕꞏ', scrambleMs: 800, tweenMs: 1000 },
    bubblegum: { mode: 'scramble', glyphs: '○●◐◑◌♡', scrambleMs: 650, tweenMs: 900, flair: 'dm-pop' },
    void:      { mode: 'focus', focusMs: 900, tweenMs: 1000 },
    // ── Understated (classic + aurora) — no glyph noise, quiet confidence ──
    aurora:    { mode: 'focus', focusMs: 650, tweenMs: 900 },
    default:   { mode: 'focus', focusMs: 450, tweenMs: 750 },
    dark:      { mode: 'focus', focusMs: 450, tweenMs: 750 },
    clean:     { mode: 'focus', focusMs: 400, tweenMs: 700 }
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
    el.__dmLastWrite = str;
    el.textContent = str;
}

function cancelMagic(el) {
    if (!el) return;
    if (el.__dmMagicCancel) {
        el.__dmMagicCancel();
        el.__dmMagicCancel = null;
    }
    if (el.__dmTweenCancel) el.__dmTweenCancel();
    if (el.__dmScrambleCancel) el.__dmScrambleCancel();
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
        dmWrite(el, formatter(value));
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
        dmWrite(el, out);
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

/**
 * Theme-aware text reveal: scramble on bombastic themes, blur-focus on
 * understated ones. The one entry point callers should reach for.
 */
export function revealValue(el, finalText, opts = {}) {
    return getPersonality().mode === 'focus'
        ? focusReveal(el, finalText, opts)
        : scrambleText(el, finalText, opts);
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
        '.uptime-counter',
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

/**
 * Theme-aware setter for prominent live numeric text. This is the preferred
 * write path for realtime values big enough to make motion useful.
 */
export function setMagicNumber(el, finalText, opts = {}) {
    if (!el) return false;
    const text = finalText == null ? '' : String(finalText);
    const previousText = el.__dmMagicFinalText ?? el.textContent.trim();
    const unchanged = !opts.changed && previousText === text;
    el.__dmMagicFinalText = text;

    if (unchanged) {
        opts.onDone?.();
        return false;
    }

    if (!isMagicNumberText(text) || opts.animate === false || isHidden() || !isMajorMagicTarget(el, opts)) {
        cancelMagic(el);
        dmWrite(el, text);
        opts.onDone?.();
        return false;
    }

    if (opts.animateInitial === false && isPlaceholderText(previousText)) {
        cancelMagic(el);
        dmWrite(el, text);
        opts.onDone?.();
        return false;
    }

    cancelMagic(el);
    injectStyles();
    if (!inViewport(el)) {
        dmWrite(el, text);
        queueVisibleMagic(el, text, opts);
        opts.onDone?.();
        return false;
    }
    const cancel = revealValue(el, text, {
        duration: opts.duration,
        onDone: () => {
            el.__dmMagicCancel = null;
            opts.onDone?.();
        }
    });
    el.__dmMagicCancel = cancel;
    return true;
}

/**
 * One-shot accent shimmer sweep across an element — "this value is fresh."
 * No-op under reduced motion.
 */
export function pulseFresh(el) {
    if (!el || prefersReducedMotion()) return;
    injectStyles();
    el.classList.remove('dm-fresh');
    void el.offsetWidth; // restart animation
    el.classList.add('dm-fresh');
    setTimeout(() => el.classList.remove('dm-fresh'), 1000);
}

/**
 * Mechanical up-tick for the block-height number on each new block.
 * The signature "chain is breathing" micro-moment.
 */
export function blockTick(el) {
    if (!el || prefersReducedMotion()) return;
    injectStyles();
    el.classList.remove('dm-block-tick');
    void el.offsetWidth;
    el.classList.add('dm-block-tick');
    setTimeout(() => el.classList.remove('dm-block-tick'), 500);
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
    '.uptime-counter',
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
let magicVisibilityObserver = null;
const lastSeenText = new WeakMap();
const pendingVisibleText = new WeakMap();

function isPlaceholderText(text) {
    return !text || text === '---' || text === '--' || text === '—';
}

function inViewport(el) {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
}

function ensureMagicVisibilityObserver() {
    if (magicVisibilityObserver || typeof IntersectionObserver === 'undefined') return magicVisibilityObserver;
    magicVisibilityObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const el = entry.target;
            const pending = pendingVisibleText.get(el);
            if (!pending) {
                magicVisibilityObserver.unobserve(el);
                continue;
            }
            const text = el.textContent.trim();
            pendingVisibleText.delete(el);
            magicVisibilityObserver.unobserve(el);
            if (text !== pending.text || isHidden() || prefersReducedMotion() || !isMajorMagicTarget(el, pending.opts)) continue;
            cancelMagic(el);
            const cancel = revealValue(el, text, {
                duration: pending.opts?.duration,
                onDone: () => {
                    el.__dmMagicCancel = null;
                }
            });
            el.__dmMagicCancel = cancel;
        }
    }, { root: null, threshold: 0.2 });
    return magicVisibilityObserver;
}

function queueVisibleMagic(el, text, opts = {}) {
    if (!el || opts.queue === false || isHidden() || prefersReducedMotion()) return false;
    const observer = ensureMagicVisibilityObserver();
    if (!observer) return false;
    pendingVisibleText.set(el, { text, opts });
    observer.observe(el);
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

function collectScopedMagicNumbers(touched, root) {
    if (!root?.querySelectorAll || !isMagicNumberScope(root)) return;
    for (const el of root.querySelectorAll('*')) {
        if (isLeafMagicNumberCandidate(el)) touched.add(el);
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

function collectAddedMagicTargets(touched, added) {
    if (added.nodeType === 3) {
        addMagicTouch(touched, added.parentElement);
        return;
    }
    if (added.nodeType !== 1) return;
    if (added.matches?.(MAGIC_TEXT_SELECTORS) || isLeafMagicNumberCandidate(added)) touched.add(added);
    if (added.querySelectorAll) {
        for (const el of added.querySelectorAll(MAGIC_TEXT_SELECTORS)) touched.add(el);
        for (const el of added.querySelectorAll(MAGIC_NUMBER_CANDIDATE_SELECTORS)) {
            if (isLeafMagicNumberCandidate(el)) touched.add(el);
        }
        collectScopedMagicNumbers(touched, added);
    }
}

function onMagicMutations(mutations) {
    const touched = new Set();
    for (const m of mutations) {
        const node = m.target.nodeType === 3 ? m.target.parentElement : m.target;
        addMagicTouch(touched, node);
        // innerHTML renders (the chamber pattern) insert whole subtrees: the
        // matching elements arrive inside addedNodes, never as the target.
        for (const added of m.addedNodes) {
            collectAddedMagicTargets(touched, added);
        }
    }
    let staggerIndex = 0;
    for (const el of touched) {
        if (el.children.length > 0 || el.matches(MAGIC_EXCLUDE)) continue; // leaf text only
        const text = el.textContent.trim();
        if (isPlaceholderText(text)) continue;
        // Engine's own frames: adopt without re-animating.
        if (el.__dmLastWrite !== undefined && String(el.__dmLastWrite).trim() === text) {
            lastSeenText.set(el, text);
            continue;
        }
        // Unchanged rewrites (features often re-set identical text every refresh).
        if (lastSeenText.get(el) === text) continue;
        lastSeenText.set(el, text);
        const delay = Math.min(staggerIndex++, 8) * 60;
        const reveal = () => {
            if (isMagicNumberText(text)) {
                setMagicNumber(el, text, { animateInitial: true, changed: true });
            } else {
                revealValue(el, text);
            }
        };
        if (!inViewport(el)) {
            if (isMagicNumberText(text)) {
                queueVisibleMagic(el, text, { animateInitial: true, changed: true });
            }
        } else if (delay > 0) {
            setTimeout(reveal, delay);
        } else {
            reveal();
        }
    }
}

export function observeMagic() {
    if (magicObserver || typeof MutationObserver === 'undefined' || !document.body) return;
    magicObserver = new MutationObserver(onMagicMutations);
    magicObserver.observe(document.body, { childList: true, characterData: true, subtree: true });
}

// ─── AMBIENT LOOP ───
// Every 18–35s, one random visible stat quietly re-decodes (scramble themes)
// or shimmers (focus themes). Sparse enough to feel alive, not busy.

const AMBIENT_MIN_MS = 18000;
const AMBIENT_MAX_MS = 35000;
const AMBIENT_REDECODE_MS = 420;
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
        if (el.__dmTweenCancel || el.__dmScrambleCancel) return false; // mid-animation
        return inViewport(el);
    });
}

function ambientTick() {
    scheduleAmbient();
    if (isHidden() || prefersReducedMotion()) return;

    const targets = ambientTargets();
    if (!targets.length) return;
    const el = targets[(Math.random() * targets.length) | 0];

    if (getPersonality().mode === 'scramble') {
        // Re-decode the value in place — same text, brief glyph shiver.
        scrambleText(el, el.textContent.trim(), { duration: AMBIENT_REDECODE_MS });
    } else {
        const card = el.closest('[data-stat]');
        pulseFresh(card?.querySelector('.card-inner') || el);
    }
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
        // Block heartbeat tick — quick upward mechanical nudge + accent flash
        '.dm-block-tick{animation:dmBlockTick 0.45s cubic-bezier(0.22,1,0.36,1)}',
        '@keyframes dmBlockTick{0%{transform:translateY(0.35em);opacity:0.35;filter:brightness(1.6)}' +
            '55%{transform:translateY(-0.06em)}100%{transform:translateY(0);opacity:1;filter:brightness(1)}}',
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
        // Flair: flame flicker (ember)
        '.dm-flicker{animation:dmFlicker 0.18s ease-in-out infinite}',
        '@keyframes dmFlicker{0%,100%{filter:brightness(1)}50%{filter:brightness(1.35) saturate(1.2)}}',
        // Flair: alarm jitter (nerv)
        '.dm-jitter{animation:dmJitter 0.09s steps(2) infinite}',
        '@keyframes dmJitter{0%{transform:translate(0.5px,-0.5px)}100%{transform:translate(-0.5px,0.5px)}}',
        // Flair: settle pop (bubblegum)
        '.dm-pop{animation:dmPop 0.5s cubic-bezier(0.34,1.56,0.64,1)}',
        '@keyframes dmPop{0%{transform:scale(0.96)}60%{transform:scale(1.04)}100%{transform:scale(1)}}',
        // Honour reduced motion globally for this layer
        '@media (prefers-reduced-motion: reduce){.dm-fresh::after,.dm-block-tick,.dm-focus-in,.dm-crt,.dm-flicker,.dm-jitter,.dm-pop{animation:none!important}}',
    ].join('\n');
    (document.head || document.documentElement).appendChild(s);
    stylesInjected = true;
}
