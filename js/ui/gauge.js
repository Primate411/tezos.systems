/**
 * Staking Target Gauge - Semi-circular gauge showing staking progress toward 50% target
 * ES Module - Add <script type="module" src="gauge.js"></script> to index.html
 */

const TARGET = 50; // 50% staking target

function getAccentColor() {
    return { r: 0, g: 200, b: 60 };
}

function lerpColor(from, to, t) {
    return {
        r: Math.round(from.r + (to.r - from.r) * t),
        g: Math.round(from.g + (to.g - from.g) * t),
        b: Math.round(from.b + (to.b - from.b) * t),
    };
}

function drawGauge(canvas, ratio, animated = true) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const cx = w / 2;
    const isSmall = w < 150;
    const cy = isSmall ? h * 0.82 : h * 0.65;
    const radius = isSmall ? Math.min(w, h) * 0.65 : Math.min(w, h) * 0.48;
    const lineWidth = radius * 0.18;
    const progress = Math.min(ratio / TARGET, 1); // 0..1 toward target
    const startAngle = Math.PI;
    const endAngle = 2 * Math.PI;

    function render(t) {
        ctx.clearRect(0, 0, w, h);

        // Background arc (dark)
        ctx.beginPath();
        ctx.arc(cx, cy, radius, startAngle, endAngle);
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = lineWidth;
        ctx.lineCap = 'round';
        ctx.stroke();

        // Tick marks at 10% intervals (0%, 10%, 20%, 30%, 40%, 50%)
        for (let i = 0; i <= 5; i++) {
            const tickProgress = (i * 10) / TARGET;
            const angle = startAngle + (endAngle - startAngle) * Math.min(tickProgress, 1);
            const inner = radius - lineWidth / 2 - 4;
            const outer = radius - lineWidth / 2 - 10;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
            ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
            ctx.strokeStyle = 'rgba(255,255,255,0.15)';
            ctx.lineWidth = 1.5;
            ctx.lineCap = 'round';
            ctx.stroke();
        }

        // Progress arc
        if (t > 0) {
            const red = { r: 220, g: 30, b: 30 };
            const green = { r: 0, g: 220, b: 80 };
            const currentColor = lerpColor(red, green, t * progress);
            const sweepAngle = startAngle + (endAngle - startAngle) * progress * t;

            // Glow
            ctx.save();
            ctx.shadowColor = `rgba(${currentColor.r},${currentColor.g},${currentColor.b},0.5)`;
            ctx.shadowBlur = 18;
            ctx.beginPath();
            ctx.arc(cx, cy, radius, startAngle, sweepAngle);
            ctx.strokeStyle = `rgb(${currentColor.r},${currentColor.g},${currentColor.b})`;
            ctx.lineWidth = lineWidth;
            ctx.lineCap = 'round';
            ctx.stroke();
            ctx.restore();
        }

        // Center text
        const displayRatio = (ratio * t).toFixed(1);
        const textColor = '#00ff00';

        // Large percentage
        ctx.font = `700 ${radius * 0.38}px 'Orbitron', monospace`;
        ctx.fillStyle = textColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${displayRatio}%`, cx, cy - radius * 0.08);

        // Subtitle
        const subSize = isSmall ? radius * 0.2 : radius * 0.13;
        ctx.font = `400 ${subSize}px 'Orbitron', sans-serif`;
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.fillText(`of ${TARGET}% target`, cx, cy + radius * 0.18);

        // Label removed — now an HTML element above canvas
    }

    if (animated) {
        let start = null;
        const duration = 1200;
        function step(ts) {
            if (!start) start = ts;
            const elapsed = ts - start;
            const t = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
            render(eased);
            if (t < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
    } else {
        render(1);
    }
}

function getStakingRatio() {
    const el = document.getElementById('staking-ratio-front');
    if (!el) return null;
    const text = el.textContent.trim();
    const match = text.match(/([\d.]+)/);
    return match ? parseFloat(match[1]) : null;
}

function initGauge() {
    const canvas = document.getElementById('staking-gauge-canvas');
    if (!canvas) return;

    let lastRatio = null;
    let hasAnimated = false;

    function update(animate) {
        const ratio = getStakingRatio();
        if (ratio === null || ratio === lastRatio) return;
        lastRatio = ratio;
        drawGauge(canvas, ratio, animate && !hasAnimated);
        hasAnimated = true;
        // Keep hidden stat-value in sync for share system
        const valEl = document.getElementById('stake-o-meter-value');
        if (valEl) valEl.textContent = ratio.toFixed(1) + '%';
    }

    // Observe for value changes
    const target = document.getElementById('staking-ratio-front');
    if (target) {
        const observer = new MutationObserver(() => update(true));
        observer.observe(target, { childList: true, characterData: true, subtree: true });
    }

    // Also handle theme changes
    const themeObserver = new MutationObserver(() => {
        if (lastRatio !== null) drawGauge(canvas, lastRatio, false);
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    // Resize
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (lastRatio !== null) drawGauge(canvas, lastRatio, false);
        }, 200);
    });

    // Initial draw attempt
    update(true);

    // Retry if data not loaded yet
    if (lastRatio === null) {
        const interval = setInterval(() => {
            update(true);
            if (lastRatio !== null) clearInterval(interval);
        }, 500);
        setTimeout(() => clearInterval(interval), 30000);
    }
}

// Init on DOM ready — share handled by share.js (same as other stat-cards)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { initGauge(); });
} else {
    initGauge();
}
