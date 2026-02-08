/**
 * ARCADE EFFECTS SYSTEM
 * Wild interactive effects for tezos.systems
 */

// Configuration
const CONFIG = {
    particles: {
        count: 30,
        lifetime: 1000,
        spread: 100,
        colors: ['#00d4ff', '#b794f6', '#ff6b9d', '#5b8def', '#10b981', '#f59e0b']
    },
    trail: {
        maxPoints: 20,
        fadeTime: 500
    },
    shake: {
        intensity: 8,
        duration: 300
    },
    combo: {
        timeout: 1500,
        maxCombo: 50
    }
};

// State
let comboCount = 0;
let comboTimeout = null;
let mouseTrail = [];
let activeEffects = new Set();

/**
 * Initialize arcade effects
 */
export function initArcadeEffects() {
    setupMouseTrail();
    setupCardEffects();
    setupButtonEffects();
    setupComboSystem();
    createEffectsCanvas();
    setupKonamiCode();
    setupSectionHeaderEffects();
    console.log('🎮 Arcade effects activated!');
}

/**
 * Create canvas for effects overlay
 */
function createEffectsCanvas() {
    const canvas = document.createElement('canvas');
    canvas.id = 'arcade-effects-canvas';
    canvas.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 9999;
    `;
    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    window.addEventListener('resize', () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    });

    return { canvas, ctx };
}

/**
 * Mouse trail effect
 */
function setupMouseTrail() {
    const trail = [];

    document.addEventListener('mousemove', (e) => {
        trail.push({
            x: e.clientX,
            y: e.clientY,
            timestamp: Date.now(),
            color: CONFIG.particles.colors[Math.floor(Math.random() * CONFIG.particles.colors.length)]
        });

        // Keep trail at max length
        if (trail.length > CONFIG.trail.maxPoints) {
            trail.shift();
        }

        renderTrail(trail);
    });
}

/**
 * Render neon mouse trail
 */
function renderTrail(trail) {
    const canvas = document.getElementById('arcade-effects-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const now = Date.now();

    // Clear old trails
    const validTrail = trail.filter(point => now - point.timestamp < CONFIG.trail.fadeTime);
    trail.length = 0;
    trail.push(...validTrail);

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw trail
    if (trail.length < 2) return;

    for (let i = 1; i < trail.length; i++) {
        const point = trail[i];
        const prev = trail[i - 1];
        const age = now - point.timestamp;
        const alpha = 1 - (age / CONFIG.trail.fadeTime);
        const width = 3 * alpha;

        ctx.strokeStyle = point.color + Math.floor(alpha * 255).toString(16).padStart(2, '0');
        ctx.lineWidth = width;
        ctx.lineCap = 'round';

        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(point.x, point.y);
        ctx.stroke();

        // Glow effect
        ctx.shadowBlur = 10 * alpha;
        ctx.shadowColor = point.color;
    }

    // Continue animation
    if (trail.length > 0) {
        requestAnimationFrame(() => renderTrail(trail));
    }
}

/**
 * Particle explosion effect
 */
export function createExplosion(x, y, color = null) {
    const canvas = document.getElementById('arcade-effects-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const particles = [];

    // Create particles
    for (let i = 0; i < CONFIG.particles.count; i++) {
        const angle = (Math.PI * 2 * i) / CONFIG.particles.count;
        const velocity = 2 + Math.random() * 3;
        const particleColor = color || CONFIG.particles.colors[Math.floor(Math.random() * CONFIG.particles.colors.length)];

        particles.push({
            x,
            y,
            vx: Math.cos(angle) * velocity,
            vy: Math.sin(angle) * velocity,
            life: CONFIG.particles.lifetime,
            color: particleColor,
            size: 2 + Math.random() * 3
        });
    }

    // Animate particles
    const startTime = Date.now();

    function animate() {
        const elapsed = Date.now() - startTime;
        const alpha = 1 - (elapsed / CONFIG.particles.lifetime);

        if (alpha <= 0) return;

        particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.2; // Gravity

            const particleAlpha = alpha * 0.8;
            ctx.fillStyle = p.color + Math.floor(particleAlpha * 255).toString(16).padStart(2, '0');

            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
            ctx.fill();

            // Glow
            ctx.shadowBlur = 15 * alpha;
            ctx.shadowColor = p.color;
        });

        requestAnimationFrame(animate);
    }

    animate();
}

/**
 * Screen shake effect
 */
export function screenShake(intensity = CONFIG.shake.intensity) {
    const body = document.body;
    const duration = CONFIG.shake.duration;
    const startTime = Date.now();

    function shake() {
        const elapsed = Date.now() - startTime;
        const progress = elapsed / duration;

        if (progress >= 1) {
            body.style.transform = '';
            return;
        }

        const currentIntensity = intensity * (1 - progress);
        const x = (Math.random() - 0.5) * currentIntensity;
        const y = (Math.random() - 0.5) * currentIntensity;

        body.style.transform = `translate(${x}px, ${y}px)`;
        requestAnimationFrame(shake);
    }

    shake();
}

/**
 * CRT scanline effect on hover
 */
function createScanlines(element) {
    const scanlines = document.createElement('div');
    scanlines.className = 'arcade-scanlines';
    scanlines.innerHTML = `
        <style>
            .arcade-scanlines {
                position: absolute;
                inset: 0;
                pointer-events: none;
                opacity: 0;
                transition: opacity 0.3s ease;
                background: repeating-linear-gradient(
                    0deg,
                    transparent,
                    transparent 2px,
                    rgba(0, 212, 255, 0.03) 2px,
                    rgba(0, 212, 255, 0.03) 4px
                );
                border-radius: 20px;
                overflow: hidden;
            }
            .arcade-scanlines.active {
                opacity: 1;
            }
            .arcade-scanlines::after {
                content: '';
                position: absolute;
                inset: 0;
                background: linear-gradient(
                    transparent 0%,
                    rgba(255, 255, 255, 0.02) 50%,
                    transparent 100%
                );
                animation: scanline-sweep 2s linear infinite;
            }
            @keyframes scanline-sweep {
                0% { transform: translateY(-100%); }
                100% { transform: translateY(100%); }
            }
        </style>
    `;
    element.appendChild(scanlines);
    return scanlines;
}

/**
 * Pixel burst effect
 */
export function pixelBurst(element) {
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    // Create pixel particles
    for (let i = 0; i < 12; i++) {
        const pixel = document.createElement('div');
        const angle = (Math.PI * 2 * i) / 12;
        const distance = 50 + Math.random() * 30;
        const color = CONFIG.particles.colors[i % CONFIG.particles.colors.length];

        pixel.style.cssText = `
            position: fixed;
            left: ${centerX}px;
            top: ${centerY}px;
            width: 4px;
            height: 4px;
            background: ${color};
            box-shadow: 0 0 10px ${color};
            pointer-events: none;
            z-index: 10000;
            border-radius: 1px;
        `;

        document.body.appendChild(pixel);

        // Animate
        const tx = Math.cos(angle) * distance;
        const ty = Math.sin(angle) * distance;

        pixel.animate([
            { transform: 'translate(0, 0) scale(1)', opacity: 1 },
            { transform: `translate(${tx}px, ${ty}px) scale(0)`, opacity: 0 }
        ], {
            duration: 600,
            easing: 'cubic-bezier(0.4, 0, 0.2, 1)'
        }).onfinish = () => pixel.remove();
    }
}

/**
 * Glitch effect
 */
export function glitchEffect(element) {
    element.classList.add('arcade-glitch');

    // Add glitch styles if not already present
    if (!document.getElementById('arcade-glitch-styles')) {
        const style = document.createElement('style');
        style.id = 'arcade-glitch-styles';
        style.textContent = `
            .arcade-glitch {
                animation: glitch 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94) both;
            }
            @keyframes glitch {
                0%, 100% {
                    transform: translate(0);
                    filter: hue-rotate(0deg);
                }
                20% {
                    transform: translate(-2px, 2px);
                    filter: hue-rotate(90deg);
                }
                40% {
                    transform: translate(-2px, -2px);
                    filter: hue-rotate(180deg);
                }
                60% {
                    transform: translate(2px, 2px);
                    filter: hue-rotate(270deg);
                }
                80% {
                    transform: translate(2px, -2px);
                    filter: hue-rotate(360deg);
                }
            }
            .arcade-hit {
                animation: hit-flash 0.2s ease;
            }
            @keyframes hit-flash {
                0%, 100% { filter: brightness(1); }
                50% { filter: brightness(1.5) saturate(1.5); }
            }
            .arcade-pulse {
                animation: arcade-pulse 0.6s ease;
            }
            @keyframes arcade-pulse {
                0% { transform: scale(1); }
                50% { transform: scale(1.05); }
                100% { transform: scale(1); }
            }
        `;
        document.head.appendChild(style);
    }

    setTimeout(() => element.classList.remove('arcade-glitch'), 300);
}

/**
 * Combo system
 */
function setupComboSystem() {
    const comboDisplay = document.createElement('div');
    comboDisplay.id = 'combo-display';
    comboDisplay.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) scale(0);
        font-size: 4rem;
        font-weight: 900;
        color: #00d4ff;
        text-shadow: 0 0 20px #00d4ff, 0 0 40px #00d4ff;
        pointer-events: none;
        z-index: 10001;
        font-family: 'Orbitron', sans-serif;
        opacity: 0;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    `;
    document.body.appendChild(comboDisplay);
}

/**
 * Increment combo counter
 */
export function incrementCombo() {
    comboCount++;

    // Clear existing timeout
    if (comboTimeout) {
        clearTimeout(comboTimeout);
    }

    // Show combo if > 2
    if (comboCount > 2) {
        showCombo(comboCount);
    }

    // Reset combo after timeout
    comboTimeout = setTimeout(() => {
        comboCount = 0;
    }, CONFIG.combo.timeout);
}

/**
 * Display combo counter
 */
function showCombo(count) {
    const display = document.getElementById('combo-display');
    if (!display) return;

    const comboText = count >= CONFIG.combo.maxCombo ? '🔥 MAX COMBO! 🔥' : `${count}x COMBO!`;
    display.textContent = comboText;

    // Animate in
    display.style.opacity = '1';
    display.style.transform = 'translate(-50%, -50%) scale(1)';

    // Pulse animation
    display.animate([
        { transform: 'translate(-50%, -50%) scale(1)' },
        { transform: 'translate(-50%, -50%) scale(1.2)' },
        { transform: 'translate(-50%, -50%) scale(1)' }
    ], {
        duration: 300,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)'
    });

    // Fade out
    setTimeout(() => {
        display.style.opacity = '0';
        display.style.transform = 'translate(-50%, -50%) scale(0.8)';
    }, 500);
}

/**
 * Score popup effect
 */
export function scorePopup(element, text, color = '#00d4ff') {
    const rect = element.getBoundingClientRect();
    const popup = document.createElement('div');

    popup.textContent = text;
    popup.style.cssText = `
        position: fixed;
        left: ${rect.left + rect.width / 2}px;
        top: ${rect.top}px;
        transform: translate(-50%, 0);
        font-size: 1.5rem;
        font-weight: 700;
        color: ${color};
        text-shadow: 0 0 10px ${color};
        pointer-events: none;
        z-index: 10000;
        font-family: 'Orbitron', sans-serif;
    `;

    document.body.appendChild(popup);

    // Animate
    popup.animate([
        { transform: 'translate(-50%, 0)', opacity: 1 },
        { transform: 'translate(-50%, -100px)', opacity: 0 }
    ], {
        duration: 1000,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)'
    }).onfinish = () => popup.remove();
}

/**
 * Hit flash effect
 */
export function hitFlash(element) {
    element.classList.add('arcade-hit');
    setTimeout(() => element.classList.remove('arcade-hit'), 200);
}

/**
 * Pulse effect
 */
export function pulseEffect(element) {
    element.classList.add('arcade-pulse');
    setTimeout(() => element.classList.remove('arcade-pulse'), 600);
}

/**
 * Setup card interaction effects
 */
function setupCardEffects() {
    const cards = document.querySelectorAll('.stat-card');

    cards.forEach(card => {
        // Add scanlines overlay
        const scanlines = createScanlines(card);

        // Hover effects
        card.addEventListener('mouseenter', () => {
            scanlines.classList.add('active');
            // Removed pulseEffect - was too bright
        });

        card.addEventListener('mouseleave', () => {
            scanlines.classList.remove('active');
        });

        // Click effects
        card.addEventListener('click', (e) => {
            const rect = card.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;

            // Multiple effects (fireworks removed)
            hitFlash(card);
            glitchEffect(card);
            incrementCombo();

            // Screen shake on high combo
            if (comboCount > 5) {
                screenShake(comboCount);
            }

            // Random score popup
            const scores = ['+100', '+250', '+500', 'NICE!', 'GREAT!', 'AWESOME!'];
            const score = scores[Math.floor(Math.random() * scores.length)];
            scorePopup(card, score);
        });
    });
}

/**
 * Setup button effects
 */
function setupButtonEffects() {
    const buttons = document.querySelectorAll('.glass-button, .info-button');

    buttons.forEach(button => {
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            pixelBurst(button);
            hitFlash(button);

            // Extra effects for refresh button
            if (button.id === 'refresh-btn') {
                screenShake(5);
            }
        });
    });
}

/**
 * Celebration effect (for major updates)
 */
export function celebrate() {
    // Multiple explosions across screen
    for (let i = 0; i < 5; i++) {
        setTimeout(() => {
            const x = Math.random() * window.innerWidth;
            const y = Math.random() * window.innerHeight;
            createExplosion(x, y);
        }, i * 200);
    }

    screenShake(15);

    // Show celebration message
    const msg = document.createElement('div');
    msg.textContent = '🎮 LEGENDARY! 🎮';
    msg.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: 3rem;
        font-weight: 900;
        color: #ff6b9d;
        text-shadow: 0 0 30px #ff6b9d;
        pointer-events: none;
        z-index: 10002;
        font-family: 'Orbitron', sans-serif;
    `;
    document.body.appendChild(msg);

    msg.animate([
        { transform: 'translate(-50%, -50%) scale(0) rotate(-10deg)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1.2) rotate(5deg)', opacity: 1 },
        { transform: 'translate(-50%, -50%) scale(1) rotate(0deg)', opacity: 1 },
        { transform: 'translate(-50%, -50%) scale(0) rotate(10deg)', opacity: 0 }
    ], {
        duration: 2000,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)'
    }).onfinish = () => msg.remove();
}

/**
 * Random arcade effect (for variety)
 */
export function randomArcadeEffect(element) {
    const effects = [hitFlash, glitchEffect, pulseEffect];
    const effect = effects[Math.floor(Math.random() * effects.length)];
    effect(element);
}

/**
 * Konami Code easter egg
 * Up Up Down Down Left Right Left Right B A
 */
function setupKonamiCode() {
    const konamiCode = [
        'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
        'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight',
        'b', 'a'
    ];
    let konamiIndex = 0;

    document.addEventListener('keydown', (e) => {
        const key = e.key.toLowerCase();

        if (key === konamiCode[konamiIndex] || e.key === konamiCode[konamiIndex]) {
            konamiIndex++;

            if (konamiIndex === konamiCode.length) {
                activateArcadeMode();
                konamiIndex = 0;
            }
        } else {
            konamiIndex = 0;
        }
    });
}

/**
 * Activate ULTIMATE ARCADE MODE
 */
function activateArcadeMode() {
    document.body.classList.add('arcade-mode', 'high-combo');

    screenShake(20);

    // Show epic message
    const msg = document.createElement('div');
    msg.innerHTML = `
        <div style="
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            font-family: 'Orbitron', sans-serif;
            text-align: center;
            z-index: 10003;
            pointer-events: none;
        ">
            <div style="
                font-size: 4rem;
                font-weight: 900;
                background: linear-gradient(135deg, #00d4ff, #b794f6, #ff6b9d);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
                text-shadow: 0 0 60px rgba(0, 212, 255, 0.8);
                margin-bottom: 1rem;
            ">ARCADE MODE</div>
            <div style="
                font-size: 2rem;
                color: #00d4ff;
                text-shadow: 0 0 30px #00d4ff;
            ">🎮 ACTIVATED 🎮</div>
        </div>
    `;

    document.body.appendChild(msg);

    msg.animate([
        { opacity: 0, transform: 'translate(-50%, -50%) scale(0) rotate(-20deg)' },
        { opacity: 1, transform: 'translate(-50%, -50%) scale(1.2) rotate(5deg)' },
        { opacity: 1, transform: 'translate(-50%, -50%) scale(1) rotate(0deg)' },
        { opacity: 0, transform: 'translate(-50%, -50%) scale(0) rotate(20deg)' }
    ], {
        duration: 3000,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)'
    }).onfinish = () => msg.remove();

    // Add rainbow pulsing to cards
    setTimeout(() => {
        document.body.classList.remove('high-combo');
    }, 10000);
}

/**
 * Section header hover effects
 */
function setupSectionHeaderEffects() {
    const sections = document.querySelectorAll('.stats-section');

    sections.forEach(section => {
        const header = section.querySelector('.section-title');
        if (!header) return;

        section.addEventListener('mouseenter', () => {
            pulseEffect(header);
        });
    });
}

/**
 * Add ripple effect on click
 */
export function rippleEffect(element, x, y) {
    const ripple = document.createElement('div');
    const rect = element.getBoundingClientRect();

    ripple.style.cssText = `
        position: absolute;
        left: ${x - rect.left}px;
        top: ${y - rect.top}px;
        width: 0;
        height: 0;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(0, 212, 255, 0.5), transparent);
        pointer-events: none;
        transform: translate(-50%, -50%);
    `;

    element.style.position = 'relative';
    element.style.overflow = 'hidden';
    element.appendChild(ripple);

    ripple.animate([
        { width: '0px', height: '0px', opacity: 1 },
        { width: '300px', height: '300px', opacity: 0 }
    ], {
        duration: 600,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)'
    }).onfinish = () => ripple.remove();
}

/**
 * Power-up visual effect
 */
export function powerUp(element, color = '#00d4ff') {
    const ring = document.createElement('div');
    const rect = element.getBoundingClientRect();

    ring.style.cssText = `
        position: fixed;
        left: ${rect.left + rect.width / 2}px;
        top: ${rect.top + rect.height / 2}px;
        width: 0;
        height: 0;
        border: 3px solid ${color};
        border-radius: 50%;
        pointer-events: none;
        z-index: 10000;
        transform: translate(-50%, -50%);
        box-shadow: 0 0 20px ${color};
    `;

    document.body.appendChild(ring);

    ring.animate([
        { width: '0px', height: '0px', opacity: 1 },
        { width: '200px', height: '200px', opacity: 0 }
    ], {
        duration: 800,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)'
    }).onfinish = () => ring.remove();
}
