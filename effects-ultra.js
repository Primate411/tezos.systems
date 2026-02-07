/**
 * ULTRA EFFECTS SYSTEM - BOMBASTIC EDITION
 * Maximum visual impact for tezos.systems
 * 
 * Features:
 * - Matrix digital rain
 * - 3D parallax cards
 * - Glitch text effects
 * - Particle explosions
 * - Holographic surfaces
 * - Magnetic cursor
 * - Sound design (optional)
 */

// ============================================
// CONFIGURATION
// ============================================
const ULTRA_CONFIG = {
    matrix: {
        enabled: true,
        fontSize: 16,
        speed: 50,  // ms between frames - faster for Matrix effect
        density: 0.97,
        chars: 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン日月火水木金土01'
    },
    particles: {
        count: 50,
        colors: ['#00ffff', '#ff00ff', '#00ff00', '#ffff00', '#ff6600', '#0066ff'],
        maxSize: 4,
        speed: 3
    },
    glitch: {
        interval: 3000,
        duration: 200
    },
    parallax: {
        intensity: 20,
        perspective: 1000
    }
};

// ============================================
// MATRIX RAIN EFFECT
// ============================================
class MatrixRain {
    constructor() {
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'matrix-canvas';
        this.canvas.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: -2;
            opacity: 0.4;
            pointer-events: none;
        `;
        document.body.prepend(this.canvas);
        
        this.ctx = this.canvas.getContext('2d');
        this.columns = [];
        this.lastFrame = 0;  // Throttle tracking
        this.resize();
        
        window.addEventListener('resize', () => this.resize());
        requestAnimationFrame((t) => this.animate(t));
    }
    
    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        
        const columnCount = Math.floor(this.canvas.width / ULTRA_CONFIG.matrix.fontSize);
        this.columns = Array(columnCount).fill(0).map(() => 
            Math.floor(Math.random() * -100)
        );
    }
    
    animate(timestamp) {
        if (!ULTRA_CONFIG.matrix.enabled) return;
        
        // Throttle based on speed config
        const elapsed = timestamp - this.lastFrame;
        if (elapsed < ULTRA_CONFIG.matrix.speed) {
            requestAnimationFrame((t) => this.animate(t));
            return;
        }
        this.lastFrame = timestamp;
        
        // Fade effect
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw characters
        this.ctx.fillStyle = '#0f0';
        this.ctx.font = `${ULTRA_CONFIG.matrix.fontSize}px monospace`;
        
        this.columns.forEach((y, i) => {
            const char = ULTRA_CONFIG.matrix.chars[Math.floor(Math.random() * ULTRA_CONFIG.matrix.chars.length)];
            const x = i * ULTRA_CONFIG.matrix.fontSize;
            
            // Gradient from bright to dim
            const gradient = this.ctx.createLinearGradient(x, y - 50, x, y);
            gradient.addColorStop(0, 'rgba(0, 255, 0, 0)');
            gradient.addColorStop(0.5, 'rgba(0, 255, 100, 0.5)');
            gradient.addColorStop(1, '#0f0');
            
            this.ctx.fillStyle = gradient;
            this.ctx.fillText(char, x, y);
            
            // Random bright flash
            if (Math.random() > 0.98) {
                this.ctx.fillStyle = '#fff';
                this.ctx.fillText(char, x, y);
            }
            
            // Reset or advance
            if (y > this.canvas.height && Math.random() > ULTRA_CONFIG.matrix.density) {
                this.columns[i] = 0;
            } else {
                this.columns[i] = y + ULTRA_CONFIG.matrix.fontSize;
            }
        });
        
        requestAnimationFrame((t) => this.animate(t));
    }
}

// ============================================
// FLOATING PARTICLES
// ============================================
class FloatingParticles {
    constructor() {
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'particles-canvas';
        this.canvas.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: -1;
            pointer-events: none;
        `;
        document.body.prepend(this.canvas);
        
        this.ctx = this.canvas.getContext('2d');
        this.particles = [];
        this.mouse = { x: null, y: null };
        
        this.resize();
        this.createParticles();
        
        window.addEventListener('resize', () => this.resize());
        window.addEventListener('mousemove', (e) => {
            this.mouse.x = e.clientX;
            this.mouse.y = e.clientY;
        });
        
        this.animate();
    }
    
    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }
    
    createParticles() {
        this.particles = [];
        for (let i = 0; i < ULTRA_CONFIG.particles.count; i++) {
            this.particles.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                vx: (Math.random() - 0.5) * ULTRA_CONFIG.particles.speed,
                vy: (Math.random() - 0.5) * ULTRA_CONFIG.particles.speed,
                size: Math.random() * ULTRA_CONFIG.particles.maxSize + 1,
                color: ULTRA_CONFIG.particles.colors[Math.floor(Math.random() * ULTRA_CONFIG.particles.colors.length)],
                alpha: Math.random() * 0.5 + 0.2,
                pulse: Math.random() * Math.PI * 2
            });
        }
    }
    
    animate() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.particles.forEach((p, i) => {
            // Update position
            p.x += p.vx;
            p.y += p.vy;
            p.pulse += 0.05;
            
            // Mouse attraction
            if (this.mouse.x && this.mouse.y) {
                const dx = this.mouse.x - p.x;
                const dy = this.mouse.y - p.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                if (dist < 200) {
                    p.vx += dx * 0.0003;
                    p.vy += dy * 0.0003;
                }
            }
            
            // Friction
            p.vx *= 0.99;
            p.vy *= 0.99;
            
            // Bounds
            if (p.x < 0 || p.x > this.canvas.width) p.vx *= -1;
            if (p.y < 0 || p.y > this.canvas.height) p.vy *= -1;
            
            // Draw with glow
            const pulseAlpha = p.alpha + Math.sin(p.pulse) * 0.2;
            
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size + Math.sin(p.pulse) * 2, 0, Math.PI * 2);
            this.ctx.fillStyle = p.color;
            this.ctx.globalAlpha = pulseAlpha;
            this.ctx.shadowColor = p.color;
            this.ctx.shadowBlur = 20;
            this.ctx.fill();
            
            // Connect nearby particles
            this.particles.slice(i + 1).forEach(p2 => {
                const dx = p.x - p2.x;
                const dy = p.y - p2.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                if (dist < 150) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(p.x, p.y);
                    this.ctx.lineTo(p2.x, p2.y);
                    this.ctx.strokeStyle = p.color;
                    this.ctx.globalAlpha = (1 - dist / 150) * 0.3;
                    this.ctx.lineWidth = 0.5;
                    this.ctx.stroke();
                }
            });
        });
        
        this.ctx.globalAlpha = 1;
        this.ctx.shadowBlur = 0;
        
        requestAnimationFrame(() => this.animate());
    }
}

// ============================================
// GLITCH TEXT EFFECT
// ============================================
class GlitchText {
    constructor(element) {
        this.element = element;
        this.originalText = element.textContent;
        this.isGlitching = false;
        
        // Create layers
        this.setupLayers();
        this.startGlitchCycle();
    }
    
    setupLayers() {
        this.element.style.position = 'relative';
        this.element.setAttribute('data-text', this.originalText);
        this.element.classList.add('glitch-text');
    }
    
    startGlitchCycle() {
        setInterval(() => this.glitch(), ULTRA_CONFIG.glitch.interval);
    }
    
    glitch() {
        if (this.isGlitching) return;
        this.isGlitching = true;
        
        this.element.classList.add('glitching');
        
        // Random character replacements
        const glitchChars = '!@#$%^&*()_+-=[]{}|;:,.<>?/~`';
        let iterations = 0;
        const maxIterations = 10;
        
        const interval = setInterval(() => {
            this.element.textContent = this.originalText
                .split('')
                .map((char, i) => {
                    if (Math.random() < 0.1) {
                        return glitchChars[Math.floor(Math.random() * glitchChars.length)];
                    }
                    return char;
                })
                .join('');
            
            iterations++;
            if (iterations >= maxIterations) {
                clearInterval(interval);
                this.element.textContent = this.originalText;
                this.element.classList.remove('glitching');
                this.isGlitching = false;
            }
        }, 50);
    }
}

// ============================================
// 3D PARALLAX CARDS
// ============================================
class ParallaxCard {
    constructor(element) {
        this.element = element;
        this.element.style.transformStyle = 'preserve-3d';
        this.element.style.transition = 'transform 0.1s ease-out';
        
        this.bindEvents();
    }
    
    bindEvents() {
        this.element.addEventListener('mousemove', (e) => this.handleMove(e));
        this.element.addEventListener('mouseleave', () => this.handleLeave());
        this.element.addEventListener('mouseenter', () => this.handleEnter());
    }
    
    handleMove(e) {
        const rect = this.element.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        
        const rotateX = (y - centerY) / centerY * -ULTRA_CONFIG.parallax.intensity;
        const rotateY = (x - centerX) / centerX * ULTRA_CONFIG.parallax.intensity;
        
        this.element.style.transform = `
            perspective(${ULTRA_CONFIG.parallax.perspective}px)
            rotateX(${rotateX}deg)
            rotateY(${rotateY}deg)
            scale3d(1.02, 1.02, 1.02)
        `;
        
        // Move inner elements for depth
        const inner = this.element.querySelector('.card-inner, .stat-value');
        if (inner) {
            inner.style.transform = `translateZ(30px)`;
        }
    }
    
    handleLeave() {
        this.element.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) scale3d(1, 1, 1)';
        
        const inner = this.element.querySelector('.card-inner, .stat-value');
        if (inner) {
            inner.style.transform = 'translateZ(0)';
        }
    }
    
    handleEnter() {
        // Burst effect
        this.createBurst();
    }
    
    createBurst() {
        const rect = this.element.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        for (let i = 0; i < 8; i++) {
            const particle = document.createElement('div');
            particle.className = 'burst-particle';
            particle.style.cssText = `
                position: fixed;
                left: ${centerX}px;
                top: ${centerY}px;
                width: 4px;
                height: 4px;
                background: ${ULTRA_CONFIG.particles.colors[Math.floor(Math.random() * ULTRA_CONFIG.particles.colors.length)]};
                border-radius: 50%;
                pointer-events: none;
                z-index: 9999;
                box-shadow: 0 0 10px currentColor;
            `;
            document.body.appendChild(particle);
            
            const angle = (i / 8) * Math.PI * 2;
            const velocity = 100 + Math.random() * 50;
            const targetX = centerX + Math.cos(angle) * velocity;
            const targetY = centerY + Math.sin(angle) * velocity;
            
            particle.animate([
                { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
                { transform: `translate(${targetX - centerX}px, ${targetY - centerY}px) scale(0)`, opacity: 0 }
            ], {
                duration: 600,
                easing: 'cubic-bezier(0, 0.55, 0.45, 1)'
            }).onfinish = () => particle.remove();
        }
    }
}

// ============================================
// MAGNETIC CURSOR
// ============================================
class MagneticCursor {
    constructor() {
        this.cursor = document.createElement('div');
        this.cursorDot = document.createElement('div');
        
        this.cursor.className = 'magnetic-cursor';
        this.cursorDot.className = 'magnetic-cursor-dot';
        
        this.cursor.style.cssText = `
            position: fixed;
            width: 40px;
            height: 40px;
            border: 2px solid rgba(0, 255, 255, 0.5);
            border-radius: 50%;
            pointer-events: none;
            z-index: 10000;
            transition: transform 0.15s ease-out, width 0.2s, height 0.2s, border-color 0.2s;
            transform: translate(-50%, -50%);
            mix-blend-mode: difference;
        `;
        
        this.cursorDot.style.cssText = `
            position: fixed;
            width: 8px;
            height: 8px;
            background: #00ffff;
            border-radius: 50%;
            pointer-events: none;
            z-index: 10001;
            transform: translate(-50%, -50%);
            box-shadow: 0 0 20px #00ffff;
        `;
        
        document.body.appendChild(this.cursor);
        document.body.appendChild(this.cursorDot);
        
        this.pos = { x: 0, y: 0 };
        this.mouse = { x: 0, y: 0 };
        
        document.addEventListener('mousemove', (e) => {
            this.mouse.x = e.clientX;
            this.mouse.y = e.clientY;
        });
        
        // Hover effects
        document.querySelectorAll('a, button, .stat-card').forEach(el => {
            el.addEventListener('mouseenter', () => {
                this.cursor.style.transform = 'translate(-50%, -50%) scale(1.5)';
                this.cursor.style.borderColor = 'rgba(255, 0, 255, 0.8)';
            });
            el.addEventListener('mouseleave', () => {
                this.cursor.style.transform = 'translate(-50%, -50%) scale(1)';
                this.cursor.style.borderColor = 'rgba(0, 255, 255, 0.5)';
            });
        });
        
        this.animate();
    }
    
    animate() {
        // Smooth follow
        this.pos.x += (this.mouse.x - this.pos.x) * 0.15;
        this.pos.y += (this.mouse.y - this.pos.y) * 0.15;
        
        this.cursor.style.left = `${this.pos.x}px`;
        this.cursor.style.top = `${this.pos.y}px`;
        
        this.cursorDot.style.left = `${this.mouse.x}px`;
        this.cursorDot.style.top = `${this.mouse.y}px`;
        
        requestAnimationFrame(() => this.animate());
    }
}

// ============================================
// HACKER NUMBER COUNTER
// ============================================
class HackerCounter {
    constructor(element, targetValue) {
        this.element = element;
        this.targetValue = targetValue;
        this.duration = 2000;
        this.chars = '0123456789';
        this.scrambleChars = '!@#$%^&*';
    }
    
    start() {
        const startTime = Date.now();
        const isNumber = !isNaN(parseFloat(this.targetValue));
        
        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / this.duration, 1);
            
            if (isNumber) {
                // Numeric value - count up with scramble
                const targetNum = parseFloat(this.targetValue.toString().replace(/[^0-9.-]/g, ''));
                const suffix = this.targetValue.toString().replace(/[0-9.-]/g, '');
                const current = targetNum * this.easeOutExpo(progress);
                
                if (progress < 0.8) {
                    // Scramble phase
                    const scrambled = Math.floor(current).toString().split('').map((c, i) => {
                        if (Math.random() < 0.3) {
                            return this.scrambleChars[Math.floor(Math.random() * this.scrambleChars.length)];
                        }
                        return c;
                    }).join('');
                    this.element.textContent = scrambled + suffix;
                } else {
                    // Settle phase
                    this.element.textContent = this.formatNumber(current) + suffix;
                }
            } else {
                // Text value - reveal character by character
                const revealCount = Math.floor(this.targetValue.length * progress);
                let display = '';
                for (let i = 0; i < this.targetValue.length; i++) {
                    if (i < revealCount) {
                        display += this.targetValue[i];
                    } else if (i === revealCount && progress < 1) {
                        display += this.scrambleChars[Math.floor(Math.random() * this.scrambleChars.length)];
                    }
                }
                this.element.textContent = display;
            }
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                this.element.textContent = this.targetValue;
                this.element.classList.add('counter-complete');
            }
        };
        
        requestAnimationFrame(animate);
    }
    
    easeOutExpo(x) {
        return x === 1 ? 1 : 1 - Math.pow(2, -10 * x);
    }
    
    formatNumber(num) {
        if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return Math.floor(num).toLocaleString();
    }
}

// ============================================
// ENERGY BORDER EFFECT
// ============================================
class EnergyBorder {
    constructor(element) {
        this.element = element;
        this.element.style.position = 'relative';
        this.element.style.overflow = 'visible';
        
        this.createBorder();
        this.animate();
    }
    
    createBorder() {
        this.border = document.createElement('div');
        this.border.className = 'energy-border';
        this.border.style.cssText = `
            position: absolute;
            inset: -2px;
            border-radius: inherit;
            background: linear-gradient(90deg, 
                #00ffff, #ff00ff, #00ff00, #ffff00, #00ffff);
            background-size: 400% 100%;
            z-index: -1;
            opacity: 0;
            transition: opacity 0.3s;
            filter: blur(4px);
        `;
        
        this.element.appendChild(this.border);
        
        this.element.addEventListener('mouseenter', () => {
            this.border.style.opacity = '1';
        });
        
        this.element.addEventListener('mouseleave', () => {
            this.border.style.opacity = '0';
        });
    }
    
    animate() {
        let position = 0;
        setInterval(() => {
            position = (position + 1) % 400;
            this.border.style.backgroundPosition = `${position}% 0`;
        }, 20);
    }
}

// ============================================
// HOLOGRAPHIC SURFACE
// ============================================
function applyHolographicEffect(element) {
    element.style.position = 'relative';
    element.style.overflow = 'hidden';
    
    const hologram = document.createElement('div');
    hologram.className = 'holographic-overlay';
    hologram.style.cssText = `
        position: absolute;
        inset: 0;
        background: linear-gradient(
            135deg,
            transparent 0%,
            rgba(255, 0, 255, 0.1) 25%,
            rgba(0, 255, 255, 0.1) 50%,
            rgba(255, 255, 0, 0.1) 75%,
            transparent 100%
        );
        background-size: 200% 200%;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.3s;
    `;
    
    element.appendChild(hologram);
    
    element.addEventListener('mousemove', (e) => {
        const rect = element.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        
        hologram.style.backgroundPosition = `${x}% ${y}%`;
        hologram.style.opacity = '1';
    });
    
    element.addEventListener('mouseleave', () => {
        hologram.style.opacity = '0';
    });
}

// ============================================
// SCANLINE EFFECT
// ============================================
function createScanlines() {
    const scanlines = document.createElement('div');
    scanlines.className = 'scanlines';
    scanlines.style.cssText = `
        position: fixed;
        inset: 0;
        background: repeating-linear-gradient(
            0deg,
            transparent,
            transparent 2px,
            rgba(0, 0, 0, 0.03) 2px,
            rgba(0, 0, 0, 0.03) 4px
        );
        pointer-events: none;
        z-index: 9998;
    `;
    document.body.appendChild(scanlines);
}

// ============================================
// CLICK RIPPLE EFFECT
// ============================================
function setupClickRipple() {
    document.addEventListener('click', (e) => {
        const ripple = document.createElement('div');
        ripple.style.cssText = `
            position: fixed;
            left: ${e.clientX}px;
            top: ${e.clientY}px;
            width: 0;
            height: 0;
            border: 2px solid #00ffff;
            border-radius: 50%;
            pointer-events: none;
            z-index: 10000;
            transform: translate(-50%, -50%);
            box-shadow: 0 0 20px #00ffff, inset 0 0 20px #00ffff;
        `;
        document.body.appendChild(ripple);
        
        ripple.animate([
            { width: '0px', height: '0px', opacity: 1 },
            { width: '100px', height: '100px', opacity: 0 }
        ], {
            duration: 500,
            easing: 'ease-out'
        }).onfinish = () => ripple.remove();
    });
}

// ============================================
// INITIALIZE ALL EFFECTS
// ============================================
export function initUltraEffects() {
    console.log('🚀 Initializing ULTRA effects...');
    
    // Background effects
    new MatrixRain();
    new FloatingParticles();
    createScanlines();
    
    // Cursor
    if (window.innerWidth > 768) {
        new MagneticCursor();
        document.body.style.cursor = 'none';
    }
    
    // Title glitch
    const title = document.querySelector('.title, h1');
    if (title) {
        new GlitchText(title);
    }
    
    // Card effects
    document.querySelectorAll('.stat-card').forEach(card => {
        new ParallaxCard(card);
        new EnergyBorder(card);
        applyHolographicEffect(card);
    });
    
    // Click effects
    setupClickRipple();
    
    // Number counters - will be triggered when data loads
    window.initHackerCounter = (element, value) => {
        const counter = new HackerCounter(element, value);
        counter.start();
    };
    
    console.log('✨ ULTRA effects active!');
}

// Auto-init on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUltraEffects);
} else {
    initUltraEffects();
}

// ============================================
// ULTRA MODE - MAXIMUM INTENSITY
// ============================================
let ultraModeActive = false;

export function toggleUltraMode() {
    ultraModeActive = !ultraModeActive;
    document.body.classList.toggle('ultra-mode', ultraModeActive);
    
    if (ultraModeActive) {
        // Increase particle count
        ULTRA_CONFIG.particles.count = 100;
        ULTRA_CONFIG.matrix.density = 0.99;
        
        // Add screen shake
        shakeScreen();
        
        // Flash effect
        flashScreen();
        
        // Sound effect (if Web Audio available)
        playUltraSound();
        
        // More frequent glitches
        ULTRA_CONFIG.glitch.interval = 1000;
        
        console.log('🔥 ULTRA MODE ACTIVATED!');
    } else {
        ULTRA_CONFIG.particles.count = 50;
        ULTRA_CONFIG.matrix.density = 0.98;
        ULTRA_CONFIG.glitch.interval = 3000;
        console.log('😎 Ultra mode deactivated');
    }
    
    return ultraModeActive;
}

function shakeScreen() {
    document.body.animate([
        { transform: 'translate(0, 0)' },
        { transform: 'translate(-5px, 5px)' },
        { transform: 'translate(5px, -5px)' },
        { transform: 'translate(-3px, -3px)' },
        { transform: 'translate(3px, 3px)' },
        { transform: 'translate(0, 0)' }
    ], {
        duration: 300,
        easing: 'ease-out'
    });
}

function flashScreen() {
    const flash = document.createElement('div');
    flash.style.cssText = `
        position: fixed;
        inset: 0;
        background: white;
        z-index: 99999;
        pointer-events: none;
    `;
    document.body.appendChild(flash);
    flash.animate([
        { opacity: 0.8 },
        { opacity: 0 }
    ], {
        duration: 200
    }).onfinish = () => flash.remove();
}

function playUltraSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.1);
        osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.3);
        
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.3);
    } catch (e) {
        // Audio not supported, ignore
    }
}

// Hook up ultra mode button
document.addEventListener('DOMContentLoaded', () => {
    const ultraBtn = document.getElementById('ultra-mode-btn');
    if (ultraBtn) {
        ultraBtn.addEventListener('click', () => {
            const active = toggleUltraMode();
            ultraBtn.classList.toggle('active', active);
            ultraBtn.innerHTML = active ? '<span>🔥</span>' : '<span>⚡</span>';
        });
    }
});

// Export for global access
window.toggleUltraMode = toggleUltraMode;
