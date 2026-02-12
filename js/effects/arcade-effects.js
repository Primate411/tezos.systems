/**
 * ULTRA MODE SYSTEM
 * 5 distinct sub-modes for tezos.systems
 */

import { initAudio, playClick, playHover, playActivate, playTrail, toggleAudio, isAudioEnabled } from './audio.js';
import { throttle, debounce } from '../core/utils.js';

const ULTRA_MODES = {
    terminal: {
        name: 'TERMINAL',
        desc: 'CRT phosphor trails, cursor echo, hex underlayer',
        icon: '▮'
    },
    signal: {
        name: 'SIGNAL', 
        desc: 'Oscilloscope waves, EKG pulses, scanline sweeps',
        icon: '〜'
    },
    circuit: {
        name: 'CIRCUIT',
        desc: 'Packet routing, card traces, bracket lock-on',
        icon: '⎔'
    },
    glitch: {
        name: 'GLITCH',
        desc: 'RGB splits, slice distortion, data corruption',
        icon: '▦'
    },
    network: {
        name: 'NETWORK',
        desc: 'Node mesh, connections, delta pulses',
        icon: '◉'
    }
};

// State
let ultraEnabled = false;
let currentMode = 'terminal';
let canvas = null;
let ctx = null;
let animationId = null;
let trailPoints = [];
let networkNodes = [];
let lastMousePos = { x: 0, y: 0 };
let mouseVelocity = 0;

/**
 * Get theme-aware colors
 */
function getColors() {
    const theme = document.body.getAttribute('data-theme') || 'default';
    switch (theme) {
        case 'matrix':
            return { primary: '#00ff41', secondary: '#00aa00', tertiary: '#005500', glow: 'rgba(0,255,65,0.3)', bg: '#000000' };
        case 'void':
            return { primary: '#a78bfa', secondary: '#7C4DFF', tertiary: '#4a2d8a', glow: 'rgba(167,139,250,0.3)', bg: '#0a0a12' };
        case 'ember':
            return { primary: '#ff9f43', secondary: '#FF6B00', tertiary: '#993f00', glow: 'rgba(255,159,67,0.3)', bg: '#0f0a05' };
        case 'signal':
            return { primary: '#00ffc8', secondary: '#00BFA5', tertiary: '#007a6a', glow: 'rgba(0,255,200,0.3)', bg: '#050f0d' };
        case 'clean':
            return { primary: '#0784c3', secondary: '#055a85', tertiary: '#033b57', glow: 'rgba(7,132,195,0.15)', bg: '#f0f0f0' };
        case 'dark':
            return { primary: '#C8C8C8', secondary: '#888888', tertiary: '#444444', glow: 'rgba(200,200,200,0.1)', bg: '#0a0a0a' };
        case 'bubblegum':
            return { primary: '#FF69B4', secondary: '#FF85C8', tertiary: '#cc3587', glow: 'rgba(255,105,180,0.3)', bg: '#120a10' };
        default:
            return { primary: '#00d4ff', secondary: '#b794f6', tertiary: '#ff6b9d', glow: 'rgba(0,212,255,0.3)', bg: '#0a0a0f' };
    }
}

/**
 * Initialize the Ultra system
 */
export function initArcadeEffects() {
    // Load saved preferences
    ultraEnabled = localStorage.getItem('ultraEnabled') === 'true';
    currentMode = localStorage.getItem('ultraMode') || 'terminal';
    
    if (ultraEnabled) {
        document.body.classList.add('ultra-mode');
        document.body.setAttribute('data-ultra', currentMode);
    }

    createCanvas();
    createModeSelector();
    setupEventListeners();
    initAudio();
    
    if (ultraEnabled) {
        startEffects();
    }

    console.log(`🎮 Ultra system ready (${ultraEnabled ? currentMode.toUpperCase() : 'OFF'})`);
}

/**
 * Create effects canvas
 */
function createCanvas() {
    canvas = document.createElement('canvas');
    canvas.id = 'ultra-canvas';
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
    resizeCanvas();
    window.addEventListener('resize', debounce(resizeCanvas, 150));
}

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

/**
 * Create mode selector dropdown
 */
function createModeSelector() {
    const audioOn = localStorage.getItem('ultraAudio') !== 'false';
    
    const selector = document.createElement('div');
    selector.id = 'ultra-selector';
    selector.className = 'ultra-selector';
    selector.innerHTML = `
        <div class="ultra-selector-header">
            <span class="ultra-selector-title">ULTRA MODE</span>
            <span class="ultra-selector-close">×</span>
        </div>
        <div class="ultra-selector-modes">
            ${Object.entries(ULTRA_MODES).map(([key, mode]) => `
                <button class="ultra-mode-btn ${key === currentMode ? 'active' : ''}" data-mode="${key}">
                    <span class="ultra-mode-icon">${mode.icon}</span>
                    <span class="ultra-mode-name">${mode.name}</span>
                    <span class="ultra-mode-desc">${mode.desc}</span>
                </button>
            `).join('')}
        </div>
        <div class="ultra-selector-footer">
            <button id="ultra-audio-btn" class="${audioOn ? 'active' : ''}" title="Toggle sound effects">
                ${audioOn ? '🔊' : '🔇'}
            </button>
            <button id="ultra-power-btn" class="${ultraEnabled ? 'active' : ''}">
                ${ultraEnabled ? '⚡ ENABLED' : '○ DISABLED'}
            </button>
        </div>
    `;
    document.body.appendChild(selector);

    // Event listeners for selector
    selector.querySelector('.ultra-selector-close').addEventListener('click', () => {
        selector.classList.remove('visible');
    });

    // Click outside to close
    document.addEventListener('click', (e) => {
        if (!selector.classList.contains('visible')) return;
        const ultraToggle = document.getElementById('ultra-toggle');
        if (!selector.contains(e.target) && e.target !== ultraToggle && !ultraToggle?.contains(e.target)) {
            selector.classList.remove('visible');
        }
    });

    selector.querySelectorAll('.ultra-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            selectMode(btn.dataset.mode);
            selector.querySelectorAll('.ultra-mode-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            // Auto-enable ultra when selecting a mode
            if (!ultraEnabled) {
                toggleUltra();
                powerBtn.className = 'active';
                powerBtn.textContent = '⚡ ENABLED';
            }
        });
    });

    const powerBtn = selector.querySelector('#ultra-power-btn');
    powerBtn.addEventListener('click', () => {
        toggleUltra();
        powerBtn.className = ultraEnabled ? 'active' : '';
        powerBtn.textContent = ultraEnabled ? '⚡ ENABLED' : '○ DISABLED';
    });
    
    const audioBtn = selector.querySelector('#ultra-audio-btn');
    audioBtn.addEventListener('click', () => {
        const isOn = toggleAudio();
        audioBtn.className = isOn ? 'active' : '';
        audioBtn.textContent = isOn ? '🔊' : '🔇';
    });
}

/**
 * Toggle Ultra on/off
 */
function toggleUltra() {
    ultraEnabled = !ultraEnabled;
    localStorage.setItem('ultraEnabled', ultraEnabled.toString());
    document.body.classList.toggle('ultra-mode', ultraEnabled);
    
    if (ultraEnabled) {
        document.body.setAttribute('data-ultra', currentMode);
        startEffects();
        playActivate(currentMode);
    } else {
        document.body.removeAttribute('data-ultra');
        stopEffects();
    }
    
    updateToggleButton();
}

/**
 * Select a specific mode
 */
function selectMode(mode) {
    currentMode = mode;
    localStorage.setItem('ultraMode', mode);
    document.body.setAttribute('data-ultra', mode);
    
    // Restart effects with new mode
    if (ultraEnabled) {
        stopEffects();
        resetState();
        startEffects();
        playActivate(mode);
    }
    
    updateToggleButton();
}

function resetState() {
    trailPoints = [];
    networkNodes = [];
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function updateToggleButton() {
    const btn = document.getElementById('ultra-toggle');
    if (btn) {
        btn.classList.toggle('active', ultraEnabled);
        btn.title = ultraEnabled ? `Ultra: ${ULTRA_MODES[currentMode].name}` : 'Ultra: OFF';
    }
}

/**
 * Toggle selector visibility
 */
export function toggleUltraMode() {
    const selector = document.getElementById('ultra-selector');
    selector.classList.toggle('visible');
    return ultraEnabled;
}

/**
 * Setup event listeners
 */
const throttledMouseMove = throttle(handleMouseMove, 16);

function setupEventListeners() {
    document.addEventListener('mousemove', throttledMouseMove);
    document.addEventListener('click', handleClick);
    
    // Card hover effects
    document.querySelectorAll('.stat-card').forEach(card => {
        card.addEventListener('mouseenter', () => handleCardEnter(card));
        card.addEventListener('mouseleave', () => handleCardLeave(card));
    });
}

/**
 * Start effects loop
 */
function startEffects() {
    if (currentMode === 'network') {
        initNetworkNodes();
    }
    
    function loop() {
        if (!ultraEnabled) return;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        switch (currentMode) {
            case 'terminal':
                renderTerminalTrail();
                break;
            case 'signal':
                renderSignalTrail();
                break;
            case 'circuit':
                renderCircuitTrail();
                break;
            case 'glitch':
                renderGlitchTrail();
                break;
            case 'network':
                renderNetworkMesh();
                break;
        }
        
        animationId = requestAnimationFrame(loop);
    }
    
    loop();
}

function stopEffects() {
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
}

/**
 * Mouse move handler
 */
function handleMouseMove(e) {
    if (!ultraEnabled) return;
    
    const dx = e.clientX - lastMousePos.x;
    const dy = e.clientY - lastMousePos.y;
    mouseVelocity = Math.sqrt(dx * dx + dy * dy);
    
    lastMousePos = { x: e.clientX, y: e.clientY };
    
    trailPoints.push({
        x: e.clientX,
        y: e.clientY,
        time: Date.now(),
        velocity: mouseVelocity
    });
    
    // Keep trail manageable
    const maxPoints = currentMode === 'signal' ? 30 : 15;
    if (trailPoints.length > maxPoints) {
        trailPoints.shift();
    }
}

/**
 * Click handler
 */
function handleClick(e) {
    if (!ultraEnabled) return;
    
    // Play click sound
    playClick(currentMode);
    
    switch (currentMode) {
        case 'terminal':
            terminalCursorEcho(e.clientX, e.clientY);
            break;
        case 'signal':
            ekgPulse(e.clientX, e.clientY);
            break;
        case 'circuit':
            packetBurst(e.clientX, e.clientY);
            break;
        case 'glitch':
            glitchSlice(e.target);
            break;
        case 'network':
            hexBurst(e.clientX, e.clientY);
            break;
    }
}

// ============================================
// TERMINAL MODE
// ============================================

function renderTerminalTrail() {
    const colors = getColors();
    const now = Date.now();
    
    trailPoints = trailPoints.filter(p => now - p.time < 600);
    
    trailPoints.forEach((point, i) => {
        const age = now - point.time;
        const alpha = Math.pow(1 - age / 600, 2); // Logarithmic decay
        const size = 8 * alpha;
        
        ctx.beginPath();
        ctx.arc(point.x, point.y, size, 0, Math.PI * 2);
        ctx.fillStyle = colors.primary;
        ctx.globalAlpha = alpha * 0.6;
        ctx.fill();
        
        // Outer glow
        ctx.beginPath();
        ctx.arc(point.x, point.y, size * 2, 0, Math.PI * 2);
        ctx.fillStyle = colors.glow;
        ctx.globalAlpha = alpha * 0.3;
        ctx.fill();
    });
    
    ctx.globalAlpha = 1;
}

function terminalCursorEcho(x, y) {
    const colors = getColors();
    const echo = document.createElement('div');
    echo.className = 'terminal-echo';
    echo.style.cssText = `
        position: fixed;
        left: ${x}px;
        top: ${y}px;
        width: 12px;
        height: 20px;
        border: 2px solid ${colors.primary};
        transform: translate(-50%, -50%);
        pointer-events: none;
        z-index: 10000;
        box-shadow: 0 0 10px ${colors.glow};
    `;
    document.body.appendChild(echo);
    
    echo.animate([
        { width: '12px', height: '20px', opacity: 0.9 },
        { width: '100px', height: '120px', opacity: 0 }
    ], {
        duration: 400,
        easing: 'ease-out'
    }).onfinish = () => echo.remove();
}

// ============================================
// SIGNAL MODE
// ============================================

function renderSignalTrail() {
    const colors = getColors();
    const now = Date.now();
    
    trailPoints = trailPoints.filter(p => now - p.time < 800);
    
    if (trailPoints.length < 2) return;
    
    ctx.beginPath();
    ctx.strokeStyle = colors.primary;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.8;
    ctx.shadowBlur = 10;
    ctx.shadowColor = colors.primary;
    
    for (let i = 1; i < trailPoints.length; i++) {
        const p = trailPoints[i];
        const prev = trailPoints[i - 1];
        const age = now - p.time;
        const alpha = 1 - age / 800;
        
        // Oscilloscope wave based on velocity
        const frequency = Math.min(p.velocity / 5, 15);
        const amplitude = 5 + p.velocity / 3;
        const offset = Math.sin(i * frequency * 0.3) * amplitude;
        
        if (i === 1) {
            ctx.moveTo(prev.x, prev.y);
        }
        
        // Draw with perpendicular wave offset
        const dx = p.x - prev.x;
        const dy = p.y - prev.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        
        ctx.lineTo(p.x + nx * offset, p.y + ny * offset);
        ctx.globalAlpha = alpha * 0.8;
    }
    
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    
    // Voltage tick marks
    for (let i = 0; i < trailPoints.length; i += 3) {
        const p = trailPoints[i];
        const age = now - p.time;
        const alpha = 1 - age / 800;
        
        ctx.strokeStyle = colors.secondary;
        ctx.globalAlpha = alpha * 0.4;
        ctx.beginPath();
        ctx.moveTo(p.x - 4, p.y);
        ctx.lineTo(p.x + 4, p.y);
        ctx.stroke();
    }
    
    ctx.globalAlpha = 1;
}

function ekgPulse(x, y) {
    const colors = getColors();
    
    for (let ring = 0; ring < 3; ring++) {
        setTimeout(() => {
            const pulse = document.createElement('div');
            pulse.className = 'ekg-pulse';
            pulse.style.cssText = `
                position: fixed;
                left: ${x}px;
                top: ${y}px;
                width: 20px;
                height: 20px;
                border: 2px solid ${colors.primary};
                border-radius: 50%;
                transform: translate(-50%, -50%);
                pointer-events: none;
                z-index: 10000;
            `;
            document.body.appendChild(pulse);
            
            pulse.animate([
                { width: '20px', height: '20px', opacity: 0.8, borderWidth: '2px' },
                { width: '200px', height: '200px', opacity: 0, borderWidth: '1px' }
            ], {
                duration: 600,
                easing: 'ease-out'
            }).onfinish = () => pulse.remove();
        }, ring * 100);
    }
}

// ============================================
// CIRCUIT MODE
// ============================================

function renderCircuitTrail() {
    const colors = getColors();
    const now = Date.now();
    
    trailPoints = trailPoints.filter(p => now - p.time < 400);
    
    if (trailPoints.length < 2) return;
    
    ctx.strokeStyle = colors.primary;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.7;
    
    // Draw right-angle paths
    for (let i = 1; i < trailPoints.length; i++) {
        const p = trailPoints[i];
        const prev = trailPoints[i - 1];
        const age = now - p.time;
        const alpha = 1 - age / 400;
        
        ctx.globalAlpha = alpha * 0.7;
        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        // Horizontal then vertical
        ctx.lineTo(p.x, prev.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
    }
    
    ctx.globalAlpha = 1;
}

function packetBurst(x, y) {
    const colors = getColors();
    const targets = document.querySelectorAll('.stat-card, .glass-button');
    const packets = [];
    
    // Create 6-8 packets
    for (let i = 0; i < 8; i++) {
        const packet = document.createElement('div');
        packet.style.cssText = `
            position: fixed;
            left: ${x}px;
            top: ${y}px;
            width: 6px;
            height: 3px;
            background: ${colors.primary};
            box-shadow: 0 0 8px ${colors.primary};
            pointer-events: none;
            z-index: 10000;
        `;
        document.body.appendChild(packet);
        
        // Pick a random target
        const target = targets[Math.floor(Math.random() * targets.length)];
        const rect = target.getBoundingClientRect();
        const tx = rect.left + rect.width / 2;
        const ty = rect.top + rect.height / 2;
        
        // Animate with right-angle path
        const midX = x + (tx - x) * 0.5;
        
        packet.animate([
            { left: `${x}px`, top: `${y}px`, opacity: 1 },
            { left: `${midX}px`, top: `${y}px`, opacity: 1, offset: 0.3 },
            { left: `${midX}px`, top: `${ty}px`, opacity: 1, offset: 0.7 },
            { left: `${tx}px`, top: `${ty}px`, opacity: 0 }
        ], {
            duration: 500 + Math.random() * 300,
            easing: 'ease-out'
        }).onfinish = () => packet.remove();
    }
}

// ============================================
// GLITCH MODE
// ============================================

function renderGlitchTrail() {
    const colors = getColors();
    const now = Date.now();
    
    trailPoints = trailPoints.filter(p => now - p.time < 300);
    
    // RGB split trail
    trailPoints.forEach((point, i) => {
        const age = now - point.time;
        const alpha = 1 - age / 300;
        const offset = point.velocity / 3;
        
        // Red channel (offset left)
        ctx.fillStyle = '#ff0000';
        ctx.globalAlpha = alpha * 0.3;
        ctx.fillRect(point.x - offset - 3, point.y - 3, 6, 6);
        
        // Green channel (center)
        ctx.fillStyle = '#00ff00';
        ctx.globalAlpha = alpha * 0.3;
        ctx.fillRect(point.x - 3, point.y - 3, 6, 6);
        
        // Blue channel (offset right)
        ctx.fillStyle = '#0000ff';
        ctx.globalAlpha = alpha * 0.3;
        ctx.fillRect(point.x + offset - 3, point.y - 3, 6, 6);
    });
    
    ctx.globalAlpha = 1;
    
    // Random noise pixels
    if (Math.random() < 0.3) {
        for (let i = 0; i < 5; i++) {
            const nx = lastMousePos.x + (Math.random() - 0.5) * 100;
            const ny = lastMousePos.y + (Math.random() - 0.5) * 100;
            ctx.fillStyle = colors.primary;
            ctx.globalAlpha = Math.random() * 0.5;
            ctx.fillRect(nx, ny, 2, 2);
        }
    }
    
    ctx.globalAlpha = 1;
}

function glitchSlice(element) {
    if (!element.classList) return;
    
    element.style.animation = 'none';
    element.offsetHeight; // Reflow
    element.classList.add('glitch-active');
    
    setTimeout(() => {
        element.classList.remove('glitch-active');
    }, 150);
}

// ============================================
// NETWORK MODE
// ============================================

function initNetworkNodes() {
    networkNodes = [];
    for (let i = 0; i < 20; i++) {
        networkNodes.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            vx: (Math.random() - 0.5) * 0.5,
            vy: (Math.random() - 0.5) * 0.5,
            size: 3 + Math.random() * 3
        });
    }
}

function renderNetworkMesh() {
    const colors = getColors();
    
    // Update node positions
    networkNodes.forEach(node => {
        // Brownian motion
        node.x += node.vx;
        node.y += node.vy;
        
        // Bounce off edges
        if (node.x < 0 || node.x > canvas.width) node.vx *= -1;
        if (node.y < 0 || node.y > canvas.height) node.vy *= -1;
        
        // Cursor gravity
        const dx = lastMousePos.x - node.x;
        const dy = lastMousePos.y - node.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < 200) {
            const force = (200 - dist) / 200 * 0.02;
            node.vx += dx * force;
            node.vy += dy * force;
        }
        
        // Damping
        node.vx *= 0.98;
        node.vy *= 0.98;
    });
    
    // Draw connections
    ctx.strokeStyle = colors.primary;
    ctx.lineWidth = 1;
    
    for (let i = 0; i < networkNodes.length; i++) {
        for (let j = i + 1; j < networkNodes.length; j++) {
            const a = networkNodes[i];
            const b = networkNodes[j];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist < 150) {
                ctx.globalAlpha = (1 - dist / 150) * 0.3;
                ctx.beginPath();
                ctx.moveTo(a.x, a.y);
                ctx.lineTo(b.x, b.y);
                ctx.stroke();
            }
        }
    }
    
    // Draw nodes
    ctx.fillStyle = colors.primary;
    networkNodes.forEach(node => {
        const dx = lastMousePos.x - node.x;
        const dy = lastMousePos.y - node.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const glow = dist < 200 ? 1 : 0.4;
        
        ctx.globalAlpha = glow;
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.size, 0, Math.PI * 2);
        ctx.fill();
    });
    
    ctx.globalAlpha = 1;
}

function hexBurst(x, y) {
    const colors = getColors();
    
    // 6 radial lines at 60° intervals
    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI * 2 * i) / 6;
        const line = document.createElement('div');
        line.style.cssText = `
            position: fixed;
            left: ${x}px;
            top: ${y}px;
            width: 2px;
            height: 0;
            background: ${colors.primary};
            box-shadow: 0 0 8px ${colors.primary};
            transform-origin: center top;
            transform: translate(-50%, 0) rotate(${angle}rad);
            pointer-events: none;
            z-index: 10000;
        `;
        document.body.appendChild(line);
        
        line.animate([
            { height: '0px', opacity: 1 },
            { height: '60px', opacity: 0 }
        ], {
            duration: 400,
            easing: 'ease-out'
        }).onfinish = () => line.remove();
    }
}

// ============================================
// CARD HOVER EFFECTS
// ============================================

function handleCardEnter(card) {
    if (!ultraEnabled) return;
    
    // Play hover sound
    playHover(currentMode);
    
    switch (currentMode) {
        case 'terminal':
            addHexUnderlayer(card);
            break;
        case 'signal':
            addScanlineSweep(card);
            break;
        case 'circuit':
            addBracketLockOn(card);
            break;
        case 'glitch':
            addStaticNoise(card);
            break;
        case 'network':
            addPulseGlow(card);
            break;
    }
}

function handleCardLeave(card) {
    if (!ultraEnabled) return;
    
    // Clean up any hover effects
    card.querySelectorAll('.ultra-hover-effect').forEach(el => el.remove());
    card.classList.remove('bracket-locked', 'scanline-active', 'hex-active', 'static-active', 'pulse-active');
}

function addHexUnderlayer(card) {
    card.classList.add('hex-active');
}

function addScanlineSweep(card) {
    card.classList.add('scanline-active');
    
    const scanline = document.createElement('div');
    scanline.className = 'ultra-hover-effect scanline-sweep';
    card.appendChild(scanline);
    
    setTimeout(() => scanline.remove(), 500);
}

function addBracketLockOn(card) {
    card.classList.add('bracket-locked');
}

function addStaticNoise(card) {
    card.classList.add('static-active');
}

function addPulseGlow(card) {
    card.classList.add('pulse-active');
}

// ULTRA_MODES also exported for external use
export { ULTRA_MODES };
