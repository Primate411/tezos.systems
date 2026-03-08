/**
 * Background Effects for Void, Ember, and Signal themes
 * Shares the same canvas pattern as matrix-effects.js
 */

const BG_THEMES = ['void', 'ember', 'signal', 'bubblegum', 'nerv', 'abyss', 'moss', 'warzone'];

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
            // Light pink range: #FF85C8 to #FF9ED2
            r = 255; g = 133 + Math.random() * 25; b = 200 + Math.random() * 10;
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

class NervEffect {
    constructor(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.scanlineOffset = 0;
        this.hexCells = [];
        this.nextAlert = 4000 + Math.random() * 6000;
        this.alertTimer = 0;
        this.flickerPhase = 0;
        this.scanBeamY = 0;
        this.scanBeamSpeed = 0.06; // pixels per ms
        this.dataStreams = [];
        this.glitchTimer = 0;
        this.nextGlitch = 5000 + Math.random() * 10000;
        this.glitchActive = false;
        this.glitchDuration = 0;
        this.glitchElapsed = 0;
        this.animationId = null;
    }

    init() {
        const w = this.canvas.width;
        const h = this.canvas.height;

        // Dense hex grid — more cells, tighter spacing
        this.hexCells = [];
        const hexSize = 32;
        const hexH = hexSize * 1.1547;
        const cols = Math.ceil(w / (hexSize + 3)) + 2;
        const rows = Math.ceil(h / (hexH * 0.75)) + 2;
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const x = col * (hexSize + 3) + (row % 2 ? (hexSize + 3) / 2 : 0);
                const y = row * hexH * 0.75;
                // 40% visible — denser than v1
                if (Math.random() < 0.4) {
                    this.hexCells.push({
                        x, y, size: hexSize,
                        baseOpacity: 0.025 + Math.random() * 0.04,
                        opacity: 0,
                        alert: false,
                        alertAge: 0,
                        pulsePhase: Math.random() * Math.PI * 2,
                        revealed: false,
                        revealTime: 0
                    });
                }
            }
        }

        // Vertical data streams (like matrix rain but orange text fragments)
        this.dataStreams = [];
        const streamCount = Math.floor(w / 120);
        for (let i = 0; i < streamCount; i++) {
            this.dataStreams.push({
                x: 40 + Math.random() * (w - 80),
                y: -Math.random() * h,
                speed: 0.015 + Math.random() * 0.03,
                chars: this._genDataString(),
                opacity: 0.03 + Math.random() * 0.04,
                charSize: 8 + Math.random() * 2
            });
        }

        this.scanBeamY = 0;
    }

    _genDataString() {
        // Mix of hex addresses, numbers, and status codes
        const fragments = [
            'FF9830', '50FF50', '20F0FF', 'E0E0D8',
            '00:00:00', '127.0.0.1', 'SYNC OK',
            'PATTERN BLUE', 'LCL NOMINAL', 'AT FIELD',
            '0x7F3A', 'ACK', 'MAGI-01', 'CASPER',
            'BALTHASAR', 'MELCHIOR', '>>>',
            '作戦', '警告', '認証', '緊急',
            '====', '----', '||||', '▓▓▓▓'
        ];
        let s = '';
        const len = 3 + Math.floor(Math.random() * 5);
        for (let i = 0; i < len; i++) {
            s += fragments[Math.floor(Math.random() * fragments.length)] + ' ';
        }
        return s;
    }

    update(dt) {
        const w = this.canvas.width;
        const h = this.canvas.height;

        // Scanline phase
        this.scanlineOffset = (this.scanlineOffset + dt * 0.015) % 4;

        // Phosphor flicker
        this.flickerPhase += dt;

        // Scan beam sweeps top to bottom every ~12 seconds
        this.scanBeamY += this.scanBeamSpeed * dt;
        if (this.scanBeamY > h + 100) this.scanBeamY = -100;

        // Reveal hex cells as scan beam passes
        for (const cell of this.hexCells) {
            if (!cell.revealed && Math.abs(cell.y - this.scanBeamY) < 30) {
                cell.revealed = true;
                cell.revealTime = performance.now();
            }
            // Fade revealed cells
            if (cell.revealed) {
                const age = performance.now() - cell.revealTime;
                if (age < 500) {
                    cell.opacity = cell.baseOpacity * (age / 500);
                } else if (age > 8000) {
                    cell.opacity = cell.baseOpacity * Math.max(0, 1 - (age - 8000) / 2000);
                    if (age > 10000) {
                        cell.revealed = false;
                        cell.opacity = 0;
                    }
                } else {
                    // Subtle pulse while visible
                    const pulse = 1 + 0.3 * Math.sin(performance.now() * 0.001 + cell.pulsePhase);
                    cell.opacity = cell.baseOpacity * pulse;
                }
            }
        }

        // Random hex cell alerts
        this.alertTimer += dt;
        if (this.alertTimer > this.nextAlert) {
            this.alertTimer = 0;
            this.nextAlert = 4000 + Math.random() * 6000;
            const count = 1 + Math.floor(Math.random() * 4);
            for (let i = 0; i < count; i++) {
                if (this.hexCells.length > 0) {
                    const idx = Math.floor(Math.random() * this.hexCells.length);
                    this.hexCells[idx].alert = true;
                    this.hexCells[idx].alertAge = 0;
                    this.hexCells[idx].revealed = true;
                    this.hexCells[idx].revealTime = performance.now();
                }
            }
        }

        for (const cell of this.hexCells) {
            if (cell.alert) {
                cell.alertAge += dt;
                if (cell.alertAge > 3000) {
                    cell.alert = false;
                    cell.alertAge = 0;
                }
            }
        }

        // Data streams scroll down
        for (const stream of this.dataStreams) {
            stream.y += stream.speed * dt;
            if (stream.y > h + 200) {
                stream.y = -200 - Math.random() * 300;
                stream.x = 40 + Math.random() * (w - 80);
                stream.chars = this._genDataString();
            }
        }

        // Glitch events — brief horizontal displacement
        this.glitchTimer += dt;
        if (!this.glitchActive && this.glitchTimer > this.nextGlitch) {
            this.glitchActive = true;
            this.glitchDuration = 50 + Math.random() * 150;
            this.glitchElapsed = 0;
            this.glitchTimer = 0;
            this.nextGlitch = 5000 + Math.random() * 10000;
        }
        if (this.glitchActive) {
            this.glitchElapsed += dt;
            if (this.glitchElapsed > this.glitchDuration) {
                this.glitchActive = false;
            }
        }
    }

    _drawHex(ctx, cx, cy, size) {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i - Math.PI / 6;
            const x = cx + (size / 2) * Math.cos(angle);
            const y = cy + (size / 2) * Math.sin(angle);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
    }

    draw(time) {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        ctx.clearRect(0, 0, w, h);

        // Global phosphor flicker
        const flicker = 0.96 + 0.04 * Math.sin(this.flickerPhase * 0.08);
        ctx.globalAlpha = flicker;

        // === Layer 1: Measurement grid (always visible, very faint) ===
        ctx.strokeStyle = 'rgba(224, 224, 216, 0.02)';
        ctx.lineWidth = 0.5;
        for (let x = 0; x < w; x += 60) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
        }
        for (let y = 0; y < h; y += 60) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }
        // Major grid lines every 300px
        ctx.strokeStyle = 'rgba(255, 152, 48, 0.025)';
        ctx.lineWidth = 0.8;
        for (let x = 0; x < w; x += 300) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
        }
        for (let y = 0; y < h; y += 300) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }

        // === Layer 2: Hex grid with scan-reveal ===
        for (const cell of this.hexCells) {
            if (cell.opacity <= 0.001) continue;
            this._drawHex(ctx, cell.x, cell.y, cell.size);
            if (cell.alert) {
                const fade = 1 - (cell.alertAge / 3000);
                const pulse = 0.5 + 0.5 * Math.sin(cell.alertAge * 0.01);
                ctx.strokeStyle = `rgba(255, 72, 64, ${(0.2 + pulse * 0.15) * fade})`;
                ctx.fillStyle = `rgba(255, 72, 64, ${0.06 * fade})`;
                ctx.lineWidth = 1.2;
                ctx.fill();
                ctx.stroke();
                // Glow
                ctx.shadowColor = '#FF4840';
                ctx.shadowBlur = 8 * fade;
                ctx.stroke();
                ctx.shadowBlur = 0;
            } else {
                ctx.strokeStyle = `rgba(32, 240, 255, ${cell.opacity})`;
                ctx.lineWidth = 0.6;
                ctx.stroke();
            }
        }

        // === Layer 3: Scan beam ===
        const beamGrad = ctx.createLinearGradient(0, this.scanBeamY - 40, 0, this.scanBeamY + 40);
        beamGrad.addColorStop(0, 'rgba(32, 240, 255, 0)');
        beamGrad.addColorStop(0.3, 'rgba(32, 240, 255, 0.02)');
        beamGrad.addColorStop(0.5, 'rgba(32, 240, 255, 0.06)');
        beamGrad.addColorStop(0.7, 'rgba(32, 240, 255, 0.02)');
        beamGrad.addColorStop(1, 'rgba(32, 240, 255, 0)');
        ctx.fillStyle = beamGrad;
        ctx.fillRect(0, this.scanBeamY - 40, w, 80);
        // Bright center line
        ctx.strokeStyle = 'rgba(32, 240, 255, 0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, this.scanBeamY);
        ctx.lineTo(w, this.scanBeamY);
        ctx.stroke();

        // === Layer 4: Vertical data streams ===
        ctx.font = '8px monospace';
        for (const stream of this.dataStreams) {
            const chars = stream.chars.split('');
            for (let i = 0; i < chars.length; i++) {
                const cy = stream.y + i * (stream.charSize + 1);
                if (cy < -20 || cy > h + 20) continue;
                // Fade at edges
                const edgeFade = Math.min(1, Math.min(cy + 20, h + 20 - cy) / 100);
                ctx.fillStyle = `rgba(255, 152, 48, ${stream.opacity * edgeFade})`;
                ctx.fillText(chars[i], stream.x, cy);
            }
        }

        // === Layer 5: CRT scanlines (more visible) ===
        ctx.fillStyle = 'rgba(0, 0, 0, 0.055)';
        for (let y = this.scanlineOffset; y < h; y += 3) {
            ctx.fillRect(0, y, w, 1.5);
        }

        // === Layer 6: Heavy vignette ===
        const vig = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.65);
        vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
        vig.addColorStop(0.7, 'rgba(0, 0, 0, 0.1)');
        vig.addColorStop(1, 'rgba(0, 0, 0, 0.4)');
        ctx.fillStyle = vig;
        ctx.fillRect(0, 0, w, h);

        // === Layer 7: Registration marks / crosshairs ===
        const markSize = 16;
        const markInset = 24;
        ctx.lineWidth = 1;
        const corners = [
            [markInset, markInset],
            [w - markInset, markInset],
            [markInset, h - markInset],
            [w - markInset, h - markInset]
        ];
        for (const [cx, cy] of corners) {
            // Orange crosshair
            ctx.strokeStyle = 'rgba(255, 152, 48, 0.12)';
            ctx.beginPath();
            ctx.moveTo(cx - markSize, cy);
            ctx.lineTo(cx + markSize, cy);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cx, cy - markSize);
            ctx.lineTo(cx, cy + markSize);
            ctx.stroke();
            // Small circle
            ctx.beginPath();
            ctx.arc(cx, cy, 4, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Scale markers along bottom edge
        ctx.fillStyle = 'rgba(255, 152, 48, 0.06)';
        ctx.font = '7px monospace';
        for (let x = 60; x < w; x += 120) {
            ctx.fillRect(x, h - 8, 1, 6);
            ctx.fillText(x.toString(), x + 3, h - 3);
        }

        // === Layer 8: Glitch displacement ===
        if (this.glitchActive) {
            const sliceH = 2 + Math.random() * 6;
            const sliceY = Math.random() * h;
            const shift = (Math.random() - 0.5) * 20;
            const imgData = ctx.getImageData(0, sliceY, w, sliceH);
            ctx.putImageData(imgData, shift, sliceY);
            // Red glitch line
            ctx.strokeStyle = 'rgba(255, 72, 64, 0.15)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, sliceY);
            ctx.lineTo(w, sliceY);
            ctx.stroke();
        }

        ctx.globalAlpha = 1;
    }
}

// ============================================
// ABYSS — Bioluminescent deep ocean
// ============================================

class AbyssEffect {
    constructor(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.spores = [];
        this.blooms = [];
        this.maxSpores = 140;
        this.bloomTimer = 0;
        this.nextBloom = 1500 + Math.random() * 3000;
        this.animationId = null;
    }

    init() {
        const w = this.canvas.width;
        const h = this.canvas.height;
        this.spores = [];
        for (let i = 0; i < this.maxSpores; i++) {
            this.spawnSpore(w, h, true);
        }
        this.blooms = [];
    }

    spawnSpore(w, h, randomAge) {
        const life = 8000 + Math.random() * 8000;
        // Color: 70% cyan-blue, 20% teal, 10% coral-pink
        const colorRoll = Math.random();
        let r, g, b;
        if (colorRoll < 0.7) {
            r = 0; g = 180 + Math.random() * 75; b = 255;
        } else if (colorRoll < 0.9) {
            r = 0; g = 200 + Math.random() * 55; b = 200 + Math.random() * 30;
        } else {
            r = 255; g = 107 + Math.random() * 30; b = 138 + Math.random() * 30;
        }
        this.spores.push({
            x: Math.random() * w,
            y: Math.random() * h,
            size: 2 + Math.random() * 4,
            r, g, b,
            opacity: 0.15 + Math.random() * 0.25,
            maxOpacity: 0.15 + Math.random() * 0.25,
            vx: (Math.random() - 0.5) * 0.2,
            vy: -0.08 - Math.random() * 0.2,
            pulsePhase: Math.random() * Math.PI * 2,
            pulseSpeed: 0.001 + Math.random() * 0.002,
            life,
            age: randomAge ? Math.random() * life : 0
        });
    }

    update(dt) {
        const w = this.canvas.width;
        const h = this.canvas.height;

        // Bloom events
        this.bloomTimer += dt;
        if (this.bloomTimer > this.nextBloom) {
            this.bloomTimer = 0;
            this.nextBloom = 1500 + Math.random() * 3000;
            this.blooms.push({
                x: Math.random() * w,
                y: h * 0.2 + Math.random() * h * 0.6,
                maxRadius: 80 + Math.random() * 120,
                life: 3000 + Math.random() * 2000,
                age: 0
            });
        }

        // Update blooms
        for (let i = this.blooms.length - 1; i >= 0; i--) {
            this.blooms[i].age += dt;
            if (this.blooms[i].age > this.blooms[i].life) {
                this.blooms.splice(i, 1);
            }
        }

        // Update spores
        for (let i = this.spores.length - 1; i >= 0; i--) {
            const s = this.spores[i];
            s.age += dt;
            if (s.age > s.life) {
                this.spores.splice(i, 1);
                this.spawnSpore(w, h, false);
                continue;
            }

            // Gentle drift
            s.x += s.vx;
            s.y += s.vy;

            // Bloom attraction — spores near a bloom pulse brighter and drift toward it
            for (const bloom of this.blooms) {
                const dx = bloom.x - s.x;
                const dy = bloom.y - s.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const bloomFrac = bloom.age / bloom.life;
                if (dist < bloom.maxRadius * 2 && bloomFrac < 0.5) {
                    const strength = 0.02 * (1 - dist / (bloom.maxRadius * 2));
                    s.vx += (dx / dist) * strength;
                    s.vy += (dy / dist) * strength;
                }
            }

            // Damping
            s.vx *= 0.995;
            s.vy *= 0.995;

            // Pulse opacity
            const pulse = 0.7 + 0.3 * Math.sin(s.age * s.pulseSpeed + s.pulsePhase);
            const lifeFrac = s.age / s.life;
            const fade = lifeFrac < 0.1 ? lifeFrac / 0.1 : lifeFrac > 0.8 ? (1 - lifeFrac) / 0.2 : 1;
            s.opacity = s.maxOpacity * pulse * fade;

            // Wrap
            if (s.x < -10) s.x += w + 20;
            if (s.x > w + 10) s.x -= w + 20;
            if (s.y < -10) s.y += h + 20;
            if (s.y > h + 10) s.y -= h + 20;
        }
    }

    draw(time) {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        ctx.clearRect(0, 0, w, h);

        // Depth gradient — subtle dark blue at bottom
        const depthGrad = ctx.createLinearGradient(0, 0, 0, h);
        depthGrad.addColorStop(0, 'rgba(0, 20, 40, 0)');
        depthGrad.addColorStop(1, 'rgba(0, 10, 30, 0.15)');
        ctx.fillStyle = depthGrad;
        ctx.fillRect(0, 0, w, h);

        // Bloom pulse rings
        for (const bloom of this.blooms) {
            const frac = bloom.age / bloom.life;
            const radius = bloom.maxRadius * Math.min(frac * 2, 1);
            const alpha = frac < 0.5 ? 0.25 * (frac / 0.5) : 0.25 * (1 - frac) / 0.5;

            // Outer glow ring
            ctx.beginPath();
            ctx.arc(bloom.x, bloom.y, radius, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(0, 229, 255, ${alpha * 1.5})`;
            ctx.lineWidth = 2.5;
            ctx.shadowColor = '#00E5FF';
            ctx.shadowBlur = 35;
            ctx.stroke();
            ctx.shadowBlur = 0;

            // Inner fill
            const fillGrad = ctx.createRadialGradient(bloom.x, bloom.y, 0, bloom.x, bloom.y, radius);
            fillGrad.addColorStop(0, `rgba(0, 229, 255, ${alpha * 0.8})`);
            fillGrad.addColorStop(0.5, `rgba(0, 180, 220, ${alpha * 0.3})`);
            fillGrad.addColorStop(1, 'rgba(0, 229, 255, 0)');
            ctx.fillStyle = fillGrad;
            ctx.fill();
        }

        // Connecting filaments between nearby spores
        ctx.lineWidth = 0.8;
        for (let i = 0; i < this.spores.length; i++) {
            for (let j = i + 1; j < this.spores.length; j++) {
                const a = this.spores[i];
                const b = this.spores[j];
                const dx = a.x - b.x;
                const dy = a.y - b.y;
                if (Math.abs(dx) < 80 && Math.abs(dy) < 80) {
                    const d = Math.sqrt(dx * dx + dy * dy);
                    if (d < 80) {
                        const alpha = (1 - d / 80) * Math.min(a.opacity, b.opacity) * 1.2;
                        ctx.strokeStyle = `rgba(0, 229, 255, ${alpha})`;
                        ctx.beginPath();
                        ctx.moveTo(a.x, a.y);
                        ctx.lineTo(b.x, b.y);
                        ctx.stroke();
                    }
                }
            }
        }

        // Spores
        for (const s of this.spores) {
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${Math.round(s.r)}, ${Math.round(s.g)}, ${Math.round(s.b)}, ${s.opacity})`;
            ctx.shadowColor = `rgb(${Math.round(s.r)}, ${Math.round(s.g)}, ${Math.round(s.b)})`;
            ctx.shadowBlur = 15;
            ctx.fill();
            ctx.shadowBlur = 0;
        }
    }
}

// ============================================
// MOSS — Organic mycelium network
// ============================================

class MossEffect {
    constructor(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.branches = [];
        this.maxBranches = 300;
        this.spawnTimer = 0;
        this.spawnInterval = 400;
        this.nodes = [];
        this.animationId = null;
    }

    init() {
        const w = this.canvas.width;
        const h = this.canvas.height;
        this.branches = [];
        this.nodes = [];

        // Seed a few initial growth points
        for (let i = 0; i < 5; i++) {
            this._spawnBranch(w, h);
        }
    }

    _spawnBranch(w, h) {
        // Start from edges or existing nodes
        let x, y;
        if (this.nodes.length > 3 && Math.random() < 0.4) {
            const node = this.nodes[Math.floor(Math.random() * this.nodes.length)];
            x = node.x;
            y = node.y;
        } else {
            // Edge spawn
            const edge = Math.floor(Math.random() * 4);
            if (edge === 0) { x = Math.random() * w; y = 0; }
            else if (edge === 1) { x = w; y = Math.random() * h; }
            else if (edge === 2) { x = Math.random() * w; y = h; }
            else { x = 0; y = Math.random() * h; }
        }

        const angle = Math.random() * Math.PI * 2;
        const speed = 0.03 + Math.random() * 0.04;
        const life = 8000 + Math.random() * 10000;
        const branchChance = 0.002 + Math.random() * 0.003;

        this.branches.push({
            points: [{ x, y }],
            angle,
            speed,
            turnRate: (Math.random() - 0.5) * 0.003,
            life,
            age: 0,
            maxOpacity: 0.15 + Math.random() * 0.15,
            branchChance,
            // Color: 75% green, 25% warm brown
            isWarm: Math.random() > 0.75,
            segmentTimer: 0
        });
    }

    update(dt) {
        const w = this.canvas.width;
        const h = this.canvas.height;

        // Spawn new branches periodically
        this.spawnTimer += dt;
        if (this.spawnTimer > this.spawnInterval && this.branches.length < this.maxBranches) {
            this.spawnTimer = 0;
            this._spawnBranch(w, h);
        }

        for (let i = this.branches.length - 1; i >= 0; i--) {
            const b = this.branches[i];
            b.age += dt;

            if (b.age > b.life) {
                this.branches.splice(i, 1);
                continue;
            }

            // Grow tip
            b.segmentTimer += dt;
            if (b.segmentTimer > 60) {
                b.segmentTimer = 0;
                const tip = b.points[b.points.length - 1];

                // Organic wandering
                b.angle += b.turnRate + (Math.random() - 0.5) * 0.08;
                const newX = tip.x + Math.cos(b.angle) * b.speed * dt;
                const newY = tip.y + Math.sin(b.angle) * b.speed * dt;

                // Keep in bounds
                if (newX > -20 && newX < w + 20 && newY > -20 && newY < h + 20) {
                    b.points.push({ x: newX, y: newY });

                    // Cap points to prevent memory issues
                    if (b.points.length > 150) {
                        b.points.shift();
                    }

                    // Chance to branch
                    if (Math.random() < b.branchChance && this.branches.length < this.maxBranches) {
                        const forkAngle = b.angle + (Math.random() > 0.5 ? 1 : -1) * (0.3 + Math.random() * 0.8);
                        this.branches.push({
                            points: [{ x: newX, y: newY }],
                            angle: forkAngle,
                            speed: b.speed * (0.7 + Math.random() * 0.3),
                            turnRate: (Math.random() - 0.5) * 0.004,
                            life: b.life * 0.5,
                            age: 0,
                            maxOpacity: b.maxOpacity * 0.7,
                            branchChance: b.branchChance * 0.5,
                            isWarm: Math.random() > 0.85,
                            segmentTimer: 0
                        });

                        // Node at branch point
                        this.nodes.push({ x: newX, y: newY, age: 0, life: b.life * 0.6 });
                        if (this.nodes.length > 50) this.nodes.shift();
                    }
                }
            }
        }

        // Age nodes
        for (let i = this.nodes.length - 1; i >= 0; i--) {
            this.nodes[i].age += dt;
            if (this.nodes[i].age > this.nodes[i].life) {
                this.nodes.splice(i, 1);
            }
        }
    }

    draw(time) {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        // Semi-transparent clear for trail effect
        ctx.fillStyle = 'rgba(6, 13, 4, 0.03)';
        ctx.fillRect(0, 0, w, h);

        // Draw branches
        for (const b of this.branches) {
            if (b.points.length < 2) continue;

            const lifeFrac = b.age / b.life;
            const alpha = lifeFrac < 0.1 ? b.maxOpacity * (lifeFrac / 0.1) :
                          lifeFrac > 0.7 ? b.maxOpacity * (1 - lifeFrac) / 0.3 :
                          b.maxOpacity;

            if (b.isWarm) {
                ctx.strokeStyle = `rgba(212, 160, 80, ${alpha})`;
            } else {
                ctx.strokeStyle = `rgba(100, 224, 100, ${alpha})`;
            }
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(b.points[0].x, b.points[0].y);
            for (let j = 1; j < b.points.length; j++) {
                ctx.lineTo(b.points[j].x, b.points[j].y);
            }
            ctx.stroke();

            // Glow on tip
            if (lifeFrac < 0.8) {
                const tip = b.points[b.points.length - 1];
                ctx.beginPath();
                ctx.arc(tip.x, tip.y, 3, 0, Math.PI * 2);
                if (b.isWarm) {
                    ctx.fillStyle = `rgba(212, 160, 80, ${Math.min(alpha * 3, 0.6)})`;
                    ctx.shadowColor = '#D4A050';
                } else {
                    ctx.fillStyle = `rgba(100, 224, 100, ${Math.min(alpha * 3, 0.6)})`;
                    ctx.shadowColor = '#66E066';
                }
                ctx.shadowBlur = 12;
                ctx.fill();
                ctx.shadowBlur = 0;
            }
        }

        // Draw nodes (branch points) as small glowing dots
        for (const node of this.nodes) {
            const nodeFrac = node.age / node.life;
            const nodeAlpha = nodeFrac < 0.1 ? 0.35 * (nodeFrac / 0.1) :
                              nodeFrac > 0.6 ? 0.35 * (1 - nodeFrac) / 0.4 : 0.35;
            ctx.beginPath();
            ctx.arc(node.x, node.y, 4, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(100, 224, 100, ${nodeAlpha})`;
            ctx.shadowColor = '#66E066';
            ctx.shadowBlur = 18;
            ctx.fill();
            ctx.shadowBlur = 0;
        }
    }
}

// ============================================
// WARZONE — Military HUD / radar
// ============================================

class WarzoneEffect {
    constructor(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.radarAngle = 0;
        this.gridPulsePhase = 0;
        this.targets = [];
        this.maxTargets = 18;
        this.scanLines = [];
        this.alertTimer = 0;
        this.nextAlert = 1500 + Math.random() * 3000;
        this.animationId = null;
    }

    init() {
        const w = this.canvas.width;
        const h = this.canvas.height;

        this.targets = [];
        for (let i = 0; i < this.maxTargets; i++) {
            this.targets.push({
                x: Math.random() * w,
                y: Math.random() * h,
                size: 3 + Math.random() * 4,
                revealTime: -10000,
                type: Math.random() > 0.7 ? 'hostile' : 'friendly'
            });
        }

        // Horizontal scan lines at random positions
        this.scanLines = [];
        for (let i = 0; i < 4; i++) {
            this.scanLines.push({
                y: Math.random() * h,
                speed: 0.03 + Math.random() * 0.04,
                opacity: 0.06 + Math.random() * 0.04
            });
        }
    }

    update(dt) {
        const w = this.canvas.width;
        const h = this.canvas.height;

        // Radar sweep — full rotation every 6 seconds
        this.radarAngle += (Math.PI * 2 / 6000) * dt;
        if (this.radarAngle > Math.PI * 2) this.radarAngle -= Math.PI * 2;

        // Grid pulse
        this.gridPulsePhase += dt * 0.0008;

        // Radar center
        const cx = w * 0.85;
        const cy = h * 0.15;
        const radarRadius = Math.min(w, h) * 0.12;

        // Reveal targets near radar sweep
        const now = performance.now();
        const beamAngle = this.radarAngle;
        for (const t of this.targets) {
            const dx = t.x - cx;
            const dy = t.y - cy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < radarRadius * 3) {
                const tAngle = Math.atan2(dy, dx);
                let diff = tAngle - beamAngle;
                while (diff > Math.PI) diff -= Math.PI * 2;
                while (diff < -Math.PI) diff += Math.PI * 2;
                if (Math.abs(diff) < 0.15) {
                    t.revealTime = now;
                }
            }
        }

        // Scan lines
        for (const line of this.scanLines) {
            line.y += line.speed * dt;
            if (line.y > h + 10) line.y = -10;
        }

        // Random target repositioning
        this.alertTimer += dt;
        if (this.alertTimer > this.nextAlert) {
            this.alertTimer = 0;
            this.nextAlert = 2000 + Math.random() * 4000;
            const idx = Math.floor(Math.random() * this.targets.length);
            this.targets[idx].x = Math.random() * w;
            this.targets[idx].y = Math.random() * h;
            this.targets[idx].revealTime = now;
        }
    }

    draw(time) {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        ctx.clearRect(0, 0, w, h);

        const pulse = 0.5 + 0.5 * Math.sin(this.gridPulsePhase);

        // === Layer 1: Tactical grid ===
        ctx.strokeStyle = `rgba(255, 192, 0, ${0.05 + pulse * 0.03})`;
        ctx.lineWidth = 0.5;
        const gridSize = 80;
        for (let x = 0; x < w; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
        }
        for (let y = 0; y < h; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }

        // === Layer 2: Horizontal scan lines ===
        for (const line of this.scanLines) {
            const grad = ctx.createLinearGradient(0, line.y - 4, 0, line.y + 4);
            grad.addColorStop(0, 'rgba(255, 184, 0, 0)');
            grad.addColorStop(0.5, `rgba(255, 184, 0, ${line.opacity})`);
            grad.addColorStop(1, 'rgba(255, 184, 0, 0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, line.y - 4, w, 8);
        }

        // === Layer 3: Mini radar (top-right) ===
        const cx = w * 0.85;
        const cy = h * 0.15;
        const rr = Math.min(w, h) * 0.08;

        // Radar circle
        ctx.beginPath();
        ctx.arc(cx, cy, rr, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 192, 0, 0.3)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Inner rings
        ctx.beginPath();
        ctx.arc(cx, cy, rr * 0.5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 192, 0, 0.15)';
        ctx.stroke();

        // Crosshairs
        ctx.strokeStyle = 'rgba(255, 192, 0, 0.2)';
        ctx.beginPath();
        ctx.moveTo(cx - rr, cy);
        ctx.lineTo(cx + rr, cy);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx, cy - rr);
        ctx.lineTo(cx, cy + rr);
        ctx.stroke();

        // Sweep beam
        const beamLen = rr;
        const beamX = cx + Math.cos(this.radarAngle) * beamLen;
        const beamY = cy + Math.sin(this.radarAngle) * beamLen;

        // Sweep trail (arc fill)
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, rr, this.radarAngle - 0.5, this.radarAngle);
        ctx.closePath();
        const sweepGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr);
        sweepGrad.addColorStop(0, 'rgba(255, 192, 0, 0.2)');
        sweepGrad.addColorStop(1, 'rgba(255, 192, 0, 0)');
        ctx.fillStyle = sweepGrad;
        ctx.fill();

        // Beam line
        ctx.strokeStyle = 'rgba(255, 192, 0, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(beamX, beamY);
        ctx.stroke();

        // === Layer 4: Target markers across full screen ===
        const now = time;
        for (const t of this.targets) {
            const age = now - t.revealTime;
            if (age < 5000) {
                const alpha = 0.5 * (1 - age / 5000);
                const color = t.type === 'hostile' ? '255, 48, 48' : '255, 192, 0';

                // Diamond marker
                const s = t.size;
                ctx.save();
                ctx.translate(t.x, t.y);
                ctx.rotate(Math.PI / 4);
                ctx.strokeStyle = `rgba(${color}, ${alpha})`;
                ctx.lineWidth = 1;
                ctx.strokeRect(-s / 2, -s / 2, s, s);
                ctx.restore();

                // Range ring
                if (t.type === 'hostile') {
                    ctx.beginPath();
                    ctx.arc(t.x, t.y, s * 2, 0, Math.PI * 2);
                    ctx.strokeStyle = `rgba(255, 45, 45, ${alpha * 0.5})`;
                    ctx.stroke();
                }
            }
        }

        // === Layer 5: Corner brackets (HUD frame) ===
        const bracketSize = 30;
        const bracketInset = 15;
        ctx.strokeStyle = 'rgba(255, 192, 0, 0.25)';
        ctx.lineWidth = 2;

        // Top-left
        ctx.beginPath();
        ctx.moveTo(bracketInset, bracketInset + bracketSize);
        ctx.lineTo(bracketInset, bracketInset);
        ctx.lineTo(bracketInset + bracketSize, bracketInset);
        ctx.stroke();
        // Top-right
        ctx.beginPath();
        ctx.moveTo(w - bracketInset - bracketSize, bracketInset);
        ctx.lineTo(w - bracketInset, bracketInset);
        ctx.lineTo(w - bracketInset, bracketInset + bracketSize);
        ctx.stroke();
        // Bottom-left
        ctx.beginPath();
        ctx.moveTo(bracketInset, h - bracketInset - bracketSize);
        ctx.lineTo(bracketInset, h - bracketInset);
        ctx.lineTo(bracketInset + bracketSize, h - bracketInset);
        ctx.stroke();
        // Bottom-right
        ctx.beginPath();
        ctx.moveTo(w - bracketInset - bracketSize, h - bracketInset);
        ctx.lineTo(w - bracketInset, h - bracketInset);
        ctx.lineTo(w - bracketInset, h - bracketInset - bracketSize);
        ctx.stroke();

        // === Layer 6: Subtle vignette ===
        const vig = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.6);
        vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
        vig.addColorStop(1, 'rgba(0, 0, 0, 0.2)');
        ctx.fillStyle = vig;
        ctx.fillRect(0, 0, w, h);
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
    } else if (themeName === 'nerv') {
        currentEffect = new NervEffect(canvas, ctx);
    } else if (themeName === 'abyss') {
        currentEffect = new AbyssEffect(canvas, ctx);
    } else if (themeName === 'moss') {
        currentEffect = new MossEffect(canvas, ctx);
    } else if (themeName === 'warzone') {
        currentEffect = new WarzoneEffect(canvas, ctx);
    }

    if (currentEffect) {
        // Per-theme canvas opacity — new themes need more visibility
        const canvasOpacity = {
            'abyss': 0.85,
            'moss': 0.9,
            'warzone': 0.85
        };
        canvas.style.opacity = canvasOpacity[themeName] || '0.5';

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
