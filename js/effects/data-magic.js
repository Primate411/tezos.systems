/**
 * DATA-MAGIC — async data arrival effects
 *
 * The "magic" layer for numbers and text as they land:
 *   • tweenNumber  — odometer / count-up on a raw numeric value (formatter applied per frame)
 *   • scrambleText — glyph-decode reveal for strings (proposal names, headlines)
 *   • pulseFresh   — one-shot accent shimmer sweep signalling "this value just updated"
 *   • blockTick    — mechanical up-tick for the block-height number (the chain's heartbeat)
 *
 * All effects honour prefers-reduced-motion (fall back to an instant set) and pause
 * while the tab is hidden (the existing refresh/poll intervals already gate on this,
 * but tweens started just before a tab-hide should not spin in the background).
 */

const TWEEN_DEFAULT_MS = 900;
const SCRAMBLE_DEFAULT_MS = 700;
const SCRAMBLE_GLYPHS = '0123456789ABCDEFXTZ$#%◆◇▲▼⬡ꜩ';

export function prefersReducedMotion() {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
}

function isHidden() {
    return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

// easeOutExpo — fast start, gentle mechanical settle
function easeOutExpo(t) {
    return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

/**
 * Count a numeric value from → to, applying `formatter` on every frame so the
 * displayed string (e.g. "1.05B", "42.3%") rolls naturally to its final form.
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
    const duration = opts.duration ?? TWEEN_DEFAULT_MS;

    if (!el) return () => {};

    const start = Number(from);
    const end = Number(to);

    // Guard: non-finite target, no motion budget, or hidden tab → set final instantly.
    if (!Number.isFinite(end) || !Number.isFinite(start) || prefersReducedMotion() || isHidden() || duration <= 0) {
        el.textContent = formatter(Number.isFinite(end) ? end : to);
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
        el.textContent = formatter(value);
        if (p < 1) {
            rafId = requestAnimationFrame(step);
        } else {
            el.textContent = formatter(end);
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
 *
 * @param {HTMLElement} el
 * @param {string} finalText
 * @param {object} [opts]
 * @param {number} [opts.duration]
 * @param {()=>void} [opts.onDone]
 * @returns {() => void} cancel function
 */
export function scrambleText(el, finalText, opts = {}) {
    if (!el) return () => {};
    const text = finalText == null ? '' : String(finalText);
    const duration = opts.duration ?? SCRAMBLE_DEFAULT_MS;

    if (prefersReducedMotion() || isHidden() || duration <= 0 || !text) {
        el.textContent = text;
        opts.onDone?.();
        return () => {};
    }

    if (el.__dmScrambleCancel) el.__dmScrambleCancel();

    const glyph = () => SCRAMBLE_GLYPHS[(Math.random() * SCRAMBLE_GLYPHS.length) | 0] || '0';
    const startedAt = performance.now();
    let rafId = 0;
    let cancelled = false;

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
        el.textContent = out;
        if (p < 1) {
            rafId = requestAnimationFrame(step);
        } else {
            el.textContent = text;
            el.__dmScrambleCancel = null;
            opts.onDone?.();
        }
    };

    const cancel = () => {
        cancelled = true;
        if (rafId) cancelAnimationFrame(rafId);
        el.textContent = text;
        el.__dmScrambleCancel = null;
    };
    el.__dmScrambleCancel = cancel;
    rafId = requestAnimationFrame(step);
    return cancel;
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
        // Honour reduced motion globally for this layer
        '@media (prefers-reduced-motion: reduce){.dm-fresh::after,.dm-block-tick{animation:none!important}}',
    ].join('\n');
    (document.head || document.documentElement).appendChild(s);
    stylesInjected = true;
}
