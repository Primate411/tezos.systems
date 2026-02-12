/**
 * Background Effects for Void, Ember, and Signal themes
 * Shares the same canvas pattern as matrix-effects.js
 */

const BG_THEMES = ['void', 'ember', 'signal', 'bubblegum'];

class VoidEffect {
    constructor(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.particles = [];
        this.stars = [];
        this.gravityWell = null;
        this.gravityTimer = 0;
        this.nextGravity = 8000 + Math.random() * 4000;
        this.animationId = null;
        this.lastTime = 0;
    }

    init() {
        const w = this.canvas.width;
        const h = this.canvas.height;
        this.particles = [];
        for (let i = 0; i < 150; i++) {
            this.particles.push({
                x: Math.random() * w,
                y: Math.random() * h,
                vx: (Math.random() - 0.5) * 0.15,
                vy: (Math.random() - 0.5) * 0.15,
                size: 1 + Math.random(),
                opacity: 0.1 + Math.random() * 0.3
            });
        }
        this.stars = [];
        for (let i = 0; i < 3; i++) {
            this.stars.push({
                x: Math.random() * w,
                y: Math.random() * h,
                size: 3 + Math.random(),
                phase: Math.random() * Math.PI * 2
            });
        }
    }

    update(dt) {
        const w = this.canvas.width;
        const h = this.canvas.height;
        const cx = w / 2;
        const cy = h / 2;

        this.gravityTimer += dt;
        if (!this.gravityWell && this.gravityTimer > this.nextGravity) {
            this.gravityWell = {
                x: Math.random() * w,
                y: Math.random() * h,
                life: 3000,
                elapsed: 0
            };
            this.gravityTimer = 0;
            this.nextGravity = 8000 + Math.random() * 4000;
        }

        if (this.gravityWell) {
            this.gravityWell.elapsed += dt;
            if (this.gravityWell.elapsed > this.gravityWell.life) {
                this.gravityWell = null;
            }
        }

        for (const p of this.particles) {
            // Drift outward from center
            const dx = p.x - cx;
            const dy = p.y - cy;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            p.vx += (dx / dist) * 0.002;
            p.vy += (dy / dist) * 0.002;

            // Gravity well spiral
            if (this.gravityWell) {
                const gx = this.gravityWell.x - p.x;
                const gy = this.gravityWell.y - p.y;
                const gd = Math.sqrt(gx * gx + gy * gy) || 1;
                if (gd < 200) {
                    const strength = 0.05 * (1 - gd / 200);
                    // Spiral: tangential + radial
                    p.vx += (gx / gd * strength * 0.5 + -gy / gd * strength * 0.8);
                    p.vy += (gy / gd * strength * 0.5 + gx / gd * strength * 0.8);
                }
            }

            // Damping
            p.vx *= 0.998;
            p.vy *= 0.998;

            p.x += p.vx;
            p.y += p.vy;

            // Wrap
            if (p.x < 0) p.x += w;
            if (p.x > w) p.x -= w;
            if (p.y < 0) p.y += h;
            if (p.y > h) p.y -= h;
        }
    }

    draw(time) {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        ctx.clearRect(0, 0, w, h);

        // Connecting lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.lineWidth = 0.5;
        for (let i = 0; i < this.particles.length; i++) {
            for (let j = i + 1; j < this.particles.length; j++) {
                const dx = this.particles[i].x - this.particles[j].x;
                const dy = this.particles[i].y - this.particles[j].y;
                if (Math.abs(dx) < 80 && Math.abs(dy) < 80) {
                    const d = Math.sqrt(dx * dx + dy * dy);
                    if (d < 80) {
                        ctx.beginPath();
                        ctx.moveTo(this.particles[i].x, this.particles[i].y);
                        ctx.lineTo(this.particles[j].x, this.particles[j].y);
                        ctx.stroke();
                    }
                }
            }
        }

        // Particles
        for (const p of this.particles) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 255, ${p.opacity})`;
            ctx.fill();
        }

        // Stars with purple glow
        for (const s of this.stars) {
            const pulse = 0.5 + 0.5 * Math.sin(time * 0.001 + s.phase);
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(139, 92, 246, ${0.3 + pulse * 0.4})`;
            ctx.shadowColor = '#8B5CF6';
            ctx.shadowBlur = 15 * pulse;
            ctx.fill();
            ctx.shadowBlur = 0;
        }
    }
}

class EmberEffect {
    constructor(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.particles = [];
        this.shimmerLines = [];
        this.glowPhase = 0;
        this.animationId = null;
    }

    init() {
        const w = this.canvas.width;
        const h = this.canvas.height;
        this.particles = [];
        for (let i = 0; i < 60; i++) {
            this.spawnParticle(w, h, true);
        }
        this.shimmerLines = [];
        const lineCount = Math.floor(h / 200);
        for (let i = 0; i < lineCount; i++) {
            this.shimmerLines.push({
                y: i * 200 + Math.random() * 100,
                speed: 0.1 + Math.random() * 0.1
            });
        }
    }

    spawnParticle(w, h, randomAge) {
        const life = 4000 + Math.random() * 4000;
        this.particles.push({
            x: Math.random() * w,
            y: h * 0.7 + Math.random() * h * 0.3,
            startX: 0,
            size: 2 + Math.random(),
            opacity: 0.2 + Math.random() * 0.5,
            speed: 0.3 + Math.random() * 0.5,
            wobbleAmp: 10 + Math.random() * 20,
            wobbleFreq: 0.002 + Math.random() * 0.002,
            life: life,
            age: randomAge ? Math.random() * life : 0,
            hue: Math.random() > 0.5 ? 25 : 10 // orange vs red
        });
        const p = this.particles[this.particles.length - 1];
        p.startX = p.x;
    }

    update(dt) {
        const w = this.canvas.width;
        const h = this.canvas.height;
        const topLimit = h * 0.2;

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.age += dt;
            if (p.age > p.life || p.y < topLimit) {
                this.particles.splice(i, 1);
                this.spawnParticle(w, h, false);
                continue;
            }
            p.y -= p.speed;
            p.x = p.startX + Math.sin(p.age * p.wobbleFreq) * p.wobbleAmp;
        }

        // Shimmer lines drift up
        for (const line of this.shimmerLines) {
            line.y -= line.speed;
            if (line.y < -10) line.y = h + 10;
        }

        this.glowPhase += dt;
    }

    draw(time) {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        ctx.clearRect(0, 0, w, h);

        // Heat shimmer lines
        for (const line of this.shimmerLines) {
            ctx.strokeStyle = 'rgba(255, 159, 67, 0.03)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, line.y);
            ctx.lineTo(w, line.y);
            ctx.stroke();
        }

        // Bottom glow
        const glowPulse = 0.5 + 0.5 * Math.sin(this.glowPhase * 0.001);
        const gradient = ctx.createLinearGradient(0, h, 0, h - 60);
        gradient.addColorStop(0, `rgba(255, 159, 67, ${0.04 + glowPulse * 0.04})`);
        gradient.addColorStop(1, 'rgba(255, 159, 67, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, h - 60, w, 60);

        // Ember particles
        for (const p of this.particles) {
            const lifeFrac = p.age / p.life;
            const fadeOut = lifeFrac > 0.7 ? 1 - (lifeFrac - 0.7) / 0.3 : 1;
            const fadeIn = lifeFrac < 0.1 ? lifeFrac / 0.1 : 1;
            const alpha = p.opacity * fadeOut * fadeIn;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            if (p.hue > 20) {
                ctx.fillStyle = `rgba(255, 159, 67, ${alpha})`;
            } else {
                ctx.fillStyle = `rgba(229, 80, 57, ${alpha})`;
            }
            ctx.fill();
        }
    }
}

class SignalEffect {
    constructor(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.scanY = 0;
        this.radarAngle = -Math.PI / 2; // start from left of 90deg arc
        this.gridDots = []; // {x, y, revealTime}
        this.animationId = null;
    }

    init() {
        this.scanY = 0;
        this.radarAngle = -Math.PI / 2;
        this.gridDots = [];
        const w = this.canvas.width;
        const h = this.canvas.height;
        for (let x = 60; x < w; x += 120) {
            for (let y = 60; y < h; y += 120) {
                this.gridDots.push({ x, y, revealTime: -10000 });
            }
        }
    }

    update(dt) {
        const h = this.canvas.height;
        const w = this.canvas.width;

        // Scan band sweeps top to bottom in 10 seconds
        this.scanY += (h / 10000) * dt;
        if (this.scanY > h) this.scanY = 0;

        // Radar sweeps 90 degree arc (from -PI/4 to -3PI/4 from center bottom) in 8 seconds
        this.radarAngle += (Math.PI / 2 / 8000) * dt;
        if (this.radarAngle > 0) this.radarAngle = -Math.PI / 2;

        // Check which grid dots the radar beam passes over
        const beamOriginX = w / 2;
        const beamOriginY = h;
        const beamLen = Math.max(w, h) * 1.5;
        const realAngle = this.radarAngle - Math.PI / 2; // map to canvas coords
        const beamEndX = beamOriginX + Math.cos(realAngle) * beamLen;
        const beamEndY = beamOriginY + Math.sin(realAngle) * beamLen;
        const now = performance.now();

        for (const dot of this.gridDots) {
            // Point-to-line distance
            const dx = beamEndX - beamOriginX;
            const dy = beamEndY - beamOriginY;
            const len = Math.sqrt(dx * dx + dy * dy);
            const nx = -dy / len;
            const ny = dx / len;
            const dist = Math.abs((dot.x - beamOriginX) * nx + (dot.y - beamOriginY) * ny);
            if (dist < 30) {
                // Also check it's in front of the origin
                const proj = (dot.x - beamOriginX) * dx / len + (dot.y - beamOriginY) * dy / len;
                if (proj > 0 && proj < beamLen) {
                    dot.revealTime = now;
                }
            }
        }
    }

    draw(time) {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        ctx.clearRect(0, 0, w, h);

        // Layer 1: Faint horizontal lines every 3px
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.025)';
        ctx.lineWidth = 0.5;
        for (let y = 0; y < h; y += 3) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }

        // Bright scan band
        const bandGrad = ctx.createLinearGradient(0, this.scanY - 6, 0, this.scanY + 6);
        bandGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
        bandGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.06)');
        bandGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = bandGrad;
        ctx.fillRect(0, this.scanY - 6, w, 12);

        // Layer 2: Radar beam from center bottom
        const beamOriginX = w / 2;
        const beamOriginY = h;
        const realAngle = this.radarAngle - Math.PI / 2;
        const beamLen = Math.max(w, h) * 1.5;

        ctx.save();
        ctx.translate(beamOriginX, beamOriginY);
        ctx.rotate(realAngle);
        const beamGrad = ctx.createLinearGradient(0, 0, beamLen, 0);
        beamGrad.addColorStop(0, 'rgba(0, 255, 200, 0.06)');
        beamGrad.addColorStop(1, 'rgba(0, 255, 200, 0)');
        ctx.fillStyle = beamGrad;
        ctx.beginPath();
        ctx.moveTo(0, -2);
        ctx.lineTo(beamLen, -15);
        ctx.lineTo(beamLen, 15);
        ctx.lineTo(0, 2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // Grid dots that fade after beam reveals them
        const now = time;
        for (const dot of this.gridDots) {
            const age = now - dot.revealTime;
            if (age < 2000) {
                const alpha = 0.15 * (1 - age / 2000);
                ctx.beginPath();
                ctx.arc(dot.x, dot.y, 1, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(0, 255, 200, ${alpha})`;
                ctx.fill();
            }
        }
    }
}

class BubblegumEffect {
    constructor(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.bubbles = [];
        this.maxBubbles = 28;
        this.animationId = null;
    }

    init() {
        this.bubbles = [];
        for (let i = 0; i < this.maxBubbles; i++) {
            this.spawnBubble(true);
        }
    }

    spawnBubble(randomAge) {
        const w = this.canvas.width;
        const h = this.canvas.height;

        // Pick tier: 0=large/faint, 1=medium/glossy, 2=tiny
        const tierRoll = Math.random();
        let tier, radius, opacity;
        if (tierRoll < 0.25) {
            tier = 0; // large faint
            radius = 30 + Math.random() * 30;
            opacity = 0.04 + Math.random() * 0.02;
        } else if (tierRoll < 0.6) {
            tier = 1; // medium glossy
            radius = 8 + Math.random() * 12;
            opacity = 0.08 + Math.random() * 0.04;
        } else {
            tier = 2; // tiny
            radius = 2 + Math.random() * 3;
            opacity = 0.1 + Math.random() * 0.08;
        }

        // Pick color: 60% pink, 30% purple, 10% mint
        const colorRoll = Math.random();
        let r, g, b;
        if (colorRoll < 0.6) {
            // Pink range: #FF69B4 to #FF85C8
            r = 255; g = 105 + Math.random() * 28; b = 180 + Math.random() * 20;
        } else if (colorRoll < 0.9) {
            // Purple range: #C47AFF to #9B59D0
            r = 155 + Math.random() * 41; g = 89 + Math.random() * 33; b = 208 + Math.random() * 47;
        } else {
            // Mint: #7FFFBA
            r = 127; g = 255; b = 186;
        }

        const life = 6000 + Math.random() * 6000;
        this.bubbles.push({
            x: Math.random() * w,
            y: h + radius + Math.random() * 100,
            radius,
            opacity,
            maxOpacity: opacity,
            tier,
            r, g, b,
            speed: 0.2 + Math.random() * 0.4,
            swayAmp: 15 + Math.random() * 25,
            swayFreq: 0.001 + Math.random() * 0.002,
            swayPhase: Math.random() * Math.PI * 2,
            life,
            age: randomAge ? Math.random() * life : 0,
            scale: 1,
        });
    }

    update(dt) {
        const w = this.canvas.width;
        const h = this.canvas.height;

        for (let i = this.bubbles.length - 1; i >= 0; i--) {
            const b = this.bubbles[i];
            b.age += dt;

            if (b.age > b.life || b.y + b.radius < -50) {
                this.bubbles.splice(i, 1);
                this.spawnBubble(false);
                continue;
            }

            // Move up
            b.y -= b.speed;

            // Sine sway
            b.x += Math.sin(b.age * b.swayFreq + b.swayPhase) * 0.3;

            // Fade in/out with scale-up dissolve
            const lifeFrac = b.age / b.life;
            if (lifeFrac < 0.1) {
                b.opacity = b.maxOpacity * (lifeFrac / 0.1);
                b.scale = 1;
            } else if (lifeFrac > 0.75) {
                const fadeOut = 1 - (lifeFrac - 0.75) / 0.25;
                b.opacity = b.maxOpacity * fadeOut;
                b.scale = 1 + (1 - fadeOut) * 0.3; // gentle scale up
            } else {
                b.opacity = b.maxOpacity;
                b.scale = 1;
            }
        }
    }

    draw(time) {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        ctx.clearRect(0, 0, w, h);

        for (const b of this.bubbles) {
            const r = b.radius * b.scale;

            ctx.beginPath();
            ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${Math.round(b.r)}, ${Math.round(b.g)}, ${Math.round(b.b)}, ${b.opacity})`;
            ctx.fill();

            // Medium glossy bubbles get a white arc highlight
            if (b.tier === 1) {
                ctx.beginPath();
                ctx.arc(b.x - r * 0.3, b.y - r * 0.3, r * 0.45, Math.PI * 1.1, Math.PI * 1.7);
                ctx.strokeStyle = `rgba(255, 255, 255, ${b.opacity * 0.6})`;
                ctx.lineWidth = Math.max(1, r * 0.1);
                ctx.stroke();
            }
        }
    }
}

// ============================================
// MANAGER
// ============================================

let currentEffect = null;
let canvas = null;
let ctx = null;
let animationId = null;
let lastTime = 0;

function getOrCreateCanvas() {
    canvas = document.getElementById('bg-effects-canvas');
    if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.id = 'bg-effects-canvas';
        canvas.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: -2;
            opacity: 0.5;
            pointer-events: none;
        `;
        document.body.prepend(canvas);
    }
    ctx = canvas.getContext('2d');
    resize();
}

function resize() {
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    if (currentEffect) currentEffect.init();
}

let resizeHandler = null;

function startEffect(themeName) {
    stopEffect();

    if (!BG_THEMES.includes(themeName)) return;

    getOrCreateCanvas();

    if (themeName === 'void') {
        currentEffect = new VoidEffect(canvas, ctx);
    } else if (themeName === 'ember') {
        currentEffect = new EmberEffect(canvas, ctx);
    } else if (themeName === 'signal') {
        currentEffect = new SignalEffect(canvas, ctx);
    } else if (themeName === 'bubblegum') {
        currentEffect = new BubblegumEffect(canvas, ctx);
    }

    if (currentEffect) {
        currentEffect.init();
        lastTime = performance.now();
        animationId = requestAnimationFrame(animate);
        resizeHandler = resize;
        window.addEventListener('resize', resizeHandler);
    }
}

function stopEffect() {
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
    currentEffect = null;
    if (canvas && canvas.parentNode) {
        canvas.parentNode.removeChild(canvas);
    }
    canvas = null;
    ctx = null;
    if (resizeHandler) {
        window.removeEventListener('resize', resizeHandler);
        resizeHandler = null;
    }
}

function animate(time) {
    if (!currentEffect) return;
    const dt = Math.min(time - lastTime, 50); // cap dt
    lastTime = time;
    currentEffect.update(dt);
    currentEffect.draw(time);
    animationId = requestAnimationFrame(animate);
}

// ============================================
// THEME CHANGE LISTENER
// ============================================

function handleThemeChange() {
    const theme = document.body.getAttribute('data-theme');
    if (BG_THEMES.includes(theme)) {
        startEffect(theme);
    } else {
        stopEffect();
    }
}

window.addEventListener('themechange', handleThemeChange);

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(handleThemeChange, 150);
});

console.log('Background effects module loaded');
