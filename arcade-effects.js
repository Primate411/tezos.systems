/**
 * ARCADE EFFECTS SYSTEM
 * Ultra mode: interactive effects for tezos.systems
 * Default mode: no interactive effects (just existing CSS animations)
 */

// Configuration
const CONFIG = {
    particles: {
        count: 30,
        lifetime: 1000,
        colors: {
            default: ['#00d4ff', '#b794f6', '#ff6b9d', '#5b8def', '#10b981'],
            matrix: ['#00ff00', '#00cc00', '#00ff66', '#33ff33']
        }
    },
    trail: {
        maxPoints: 20,
        fadeTime: 400
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
let ultraMode = false;
let comboCount = 0;
let comboTimeout = null;
let trailPoints = [];
let canvas = null;
let ctx = null;
let animating = false;

/**
 * Check if Ultra mode is enabled
 */
function isUltra() {
    return ultraMode || document.body.classList.contains('ultra-mode');
}

/**
 * Get theme-aware colors
 */
function getColors() {
    const theme = document.body.getAttribute('data-theme');
    return theme === 'matrix' ? CONFIG.particles.colors.matrix : CONFIG.particles.colors.default;
}

/**
 * Get random color from current theme
 */
function randomColor() {
    const colors = getColors();
    return colors[Math.floor(Math.random() * colors.length)];
}

/**
 * Initialize arcade effects
 */
export function initArcadeEffects() {
    // Load saved Ultra preference
    ultraMode = localStorage.getItem('ultraMode') === 'true';
    if (ultraMode) {
        document.body.classList.add('ultra-mode');
    }

    // Create canvas (used only in Ultra mode)
    createEffectsCanvas();

    // Setup listeners (they check isUltra() internally)
    setupMouseTrail();
    setupClickEffects();
    setupComboDisplay();
    setupEasterEggs();

    console.log(`🎮 Arcade effects initialized (Ultra: ${ultraMode ? 'ON' : 'OFF'})`);
}

/**
 * Toggle Ultra mode
 */
export function toggleUltraMode() {
    ultraMode = !ultraMode;
    localStorage.setItem('ultraMode', ultraMode.toString());
    document.body.classList.toggle('ultra-mode', ultraMode);

    if (ultraMode) {
        // Activation fanfare
        showMessage('⚡ ULTRA MODE ⚡', '#ff6b9d');
        screenShake(10);
    } else {
        // Clear any active effects
        if (ctx && canvas) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        trailPoints = [];
    }

    return ultraMode;
}

/**
 * Create effects canvas
 */
function createEffectsCanvas() {
    canvas = document.createElement('canvas');
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
    ctx = canvas.getContext('2d');

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);
}

/**
 * Mouse trail - ULTRA ONLY
 */
function setupMouseTrail() {
    document.addEventListener('mousemove', (e) => {
        if (!isUltra()) return;

        trailPoints.push({
            x: e.clientX,
            y: e.clientY,
            time: Date.now(),
            color: randomColor()
        });

        if (trailPoints.length > CONFIG.trail.maxPoints) {
            trailPoints.shift();
        }

        if (!animating) {
            animating = true;
            renderTrail();
        }
    });
}

/**
 * Render mouse trail
 */
function renderTrail() {
    if (!ctx || !canvas) return;

    const now = Date.now();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Filter old points
    trailPoints = trailPoints.filter(p => now - p.time < CONFIG.trail.fadeTime);

    if (trailPoints.length < 2 || !isUltra()) {
        animating = false;
        return;
    }

    // Draw trail
    for (let i = 1; i < trailPoints.length; i++) {
        const p = trailPoints[i];
        const prev = trailPoints[i - 1];
        const age = now - p.time;
        const alpha = 1 - (age / CONFIG.trail.fadeTime);

        ctx.strokeStyle = p.color;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 3 * alpha;
        ctx.lineCap = 'round';
        ctx.shadowBlur = 10 * alpha;
        ctx.shadowColor = p.color;

        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
    }

    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    requestAnimationFrame(renderTrail);
}

/**
 * Click effects - ULTRA ONLY
 */
function setupClickEffects() {
    document.addEventListener('click', (e) => {
        if (!isUltra()) return;

        createExplosion(e.clientX, e.clientY);
        incrementCombo();

        // Find clicked element for score popup
        const target = e.target.closest('.stat-card, .glass-button, .info-button');
        if (target) {
            const scores = ['+100', '+250', 'NICE!', 'GREAT!'];
            scorePopup(target, scores[Math.floor(Math.random() * scores.length)]);

            // Screen shake on high combo
            if (comboCount > 5) {
                screenShake(Math.min(comboCount, 15));
            }
        }
    });
}

/**
 * Particle explosion
 */
function createExplosion(x, y) {
    if (!ctx) return;

    const particles = [];
    const colors = getColors();

    for (let i = 0; i < CONFIG.particles.count; i++) {
        const angle = (Math.PI * 2 * i) / CONFIG.particles.count;
        const velocity = 2 + Math.random() * 3;

        particles.push({
            x, y,
            vx: Math.cos(angle) * velocity,
            vy: Math.sin(angle) * velocity,
            color: colors[Math.floor(Math.random() * colors.length)],
            size: 2 + Math.random() * 3,
            life: 1
        });
    }

    function animate() {
        particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.15; // gravity
            p.life -= 0.02;

            if (p.life > 0) {
                ctx.fillStyle = p.color;
                ctx.globalAlpha = p.life;
                ctx.shadowBlur = 10 * p.life;
                ctx.shadowColor = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
                ctx.fill();
            }
        });

        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;

        if (particles.some(p => p.life > 0)) {
            requestAnimationFrame(animate);
        }
    }

    animate();
}

/**
 * Screen shake
 */
function screenShake(intensity = CONFIG.shake.intensity) {
    const duration = CONFIG.shake.duration;
    const start = Date.now();

    function shake() {
        const elapsed = Date.now() - start;
        const progress = elapsed / duration;

        if (progress >= 1) {
            document.body.style.transform = '';
            return;
        }

        const amt = intensity * (1 - progress);
        const x = (Math.random() - 0.5) * amt;
        const y = (Math.random() - 0.5) * amt;
        document.body.style.transform = `translate(${x}px, ${y}px)`;

        requestAnimationFrame(shake);
    }

    shake();
}

/**
 * Combo display setup
 */
function setupComboDisplay() {
    const display = document.createElement('div');
    display.id = 'combo-display';
    display.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) scale(0);
        font-size: 4rem;
        font-weight: 900;
        pointer-events: none;
        z-index: 10001;
        font-family: 'Orbitron', monospace;
        opacity: 0;
        transition: all 0.3s ease;
    `;
    document.body.appendChild(display);
}

/**
 * Increment combo
 */
function incrementCombo() {
    comboCount++;
    if (comboTimeout) clearTimeout(comboTimeout);

    if (comboCount > 2) {
        showCombo();
    }

    comboTimeout = setTimeout(() => {
        comboCount = 0;
    }, CONFIG.combo.timeout);
}

/**
 * Show combo counter
 */
function showCombo() {
    const display = document.getElementById('combo-display');
    if (!display) return;

    const color = randomColor();
    display.textContent = comboCount >= CONFIG.combo.maxCombo ? '🔥 MAX COMBO! 🔥' : `${comboCount}x COMBO!`;
    display.style.color = color;
    display.style.textShadow = `0 0 20px ${color}, 0 0 40px ${color}`;
    display.style.opacity = '1';
    display.style.transform = 'translate(-50%, -50%) scale(1)';

    setTimeout(() => {
        display.style.opacity = '0';
        display.style.transform = 'translate(-50%, -50%) scale(0.8)';
    }, 500);
}

/**
 * Score popup
 */
function scorePopup(element, text) {
    const rect = element.getBoundingClientRect();
    const popup = document.createElement('div');
    const color = randomColor();

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
        font-family: 'Orbitron', monospace;
    `;

    document.body.appendChild(popup);

    popup.animate([
        { transform: 'translate(-50%, 0)', opacity: 1 },
        { transform: 'translate(-50%, -80px)', opacity: 0 }
    ], {
        duration: 800,
        easing: 'ease-out'
    }).onfinish = () => popup.remove();
}

/**
 * Show centered message
 */
function showMessage(text, color = '#00d4ff') {
    const msg = document.createElement('div');
    msg.textContent = text;
    msg.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: 3rem;
        font-weight: 900;
        color: ${color};
        text-shadow: 0 0 30px ${color};
        pointer-events: none;
        z-index: 10002;
        font-family: 'Orbitron', monospace;
    `;
    document.body.appendChild(msg);

    msg.animate([
        { transform: 'translate(-50%, -50%) scale(0)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1.2)', opacity: 1 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
        { transform: 'translate(-50%, -50%) scale(0)', opacity: 0 }
    ], {
        duration: 2000,
        easing: 'ease-out'
    }).onfinish = () => msg.remove();
}

/**
 * Easter eggs - ULTRA ONLY
 */
function setupEasterEggs() {
    // Konami code: ↑↑↓↓←→←→BA
    const konami = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
    let konamiIdx = 0;

    // Text buffer for word-based eggs
    let textBuffer = '';
    let textTimeout = null;

    document.addEventListener('keydown', (e) => {
        if (!isUltra()) return;

        // Konami code check
        const key = e.key.toLowerCase();
        if (key === konami[konamiIdx] || e.key === konami[konamiIdx]) {
            konamiIdx++;
            if (konamiIdx === konami.length) {
                triggerKonami();
                konamiIdx = 0;
            }
        } else {
            konamiIdx = 0;
        }

        // Text-based easter eggs
        if (e.key.length === 1) {
            textBuffer += e.key.toLowerCase();
            if (textTimeout) clearTimeout(textTimeout);
            textTimeout = setTimeout(() => { textBuffer = ''; }, 2000);

            if (textBuffer.includes('hodl')) {
                triggerHodl();
                textBuffer = '';
            } else if (textBuffer.includes(':wq')) {
                triggerVim();
                textBuffer = '';
            } else if (textBuffer.includes('bake')) {
                triggerBake();
                textBuffer = '';
            }
        }
    });
}

/**
 * Konami code activation
 */
function triggerKonami() {
    showMessage('🎮 LEGENDARY MODE 🎮', '#ff6b9d');

    // Multiple explosions
    for (let i = 0; i < 8; i++) {
        setTimeout(() => {
            createExplosion(
                Math.random() * window.innerWidth,
                Math.random() * window.innerHeight
            );
        }, i * 150);
    }

    screenShake(20);
}

/**
 * HODL easter egg - diamond hands
 */
function triggerHodl() {
    showMessage('💎 DIAMOND HANDS 💎', '#00d4ff');

    // Freeze effect
    document.body.style.filter = 'saturate(0.5) brightness(1.2)';
    setTimeout(() => {
        document.body.style.filter = '';
    }, 2000);
}

/**
 * Vim easter egg
 */
function triggerVim() {
    showMessage('> saved and quit', '#10b981');
}

/**
 * Bake easter egg - bread rain
 */
function triggerBake() {
    showMessage('🍞 BAKING TIME 🍞', '#f59e0b');

    for (let i = 0; i < 20; i++) {
        setTimeout(() => {
            const bread = document.createElement('div');
            bread.textContent = '🍞';
            bread.style.cssText = `
                position: fixed;
                left: ${Math.random() * 100}%;
                top: -50px;
                font-size: 2rem;
                pointer-events: none;
                z-index: 10000;
            `;
            document.body.appendChild(bread);

            bread.animate([
                { transform: 'translateY(0) rotate(0deg)', opacity: 1 },
                { transform: `translateY(${window.innerHeight + 100}px) rotate(${Math.random() * 720 - 360}deg)`, opacity: 0.5 }
            ], {
                duration: 3000 + Math.random() * 2000,
                easing: 'ease-in'
            }).onfinish = () => bread.remove();
        }, i * 100);
    }
}

// Export for external use
export { isUltra, screenShake, createExplosion };
