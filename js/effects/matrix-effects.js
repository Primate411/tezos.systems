/**
 * Matrix Rain Effect
 * Digital rain background for matrix theme
 */

// Configuration
const MATRIX_CONFIG = {
    fontSize: 16,
    speed: 50,  // ms between frames
    density: 0.97,
    chars: 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン日月火水木金土01',
    opacity: 0.3
};

class MatrixRain {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.columns = [];
        this.lastFrame = 0;
        this.animationId = null;
        this.isActive = false;
    }

    start() {
        if (this.isActive) return;

        console.log('Starting Matrix rain effect');
        this.isActive = true;

        // Create canvas
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'matrix-canvas';
        this.canvas.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: -2;
            opacity: ${MATRIX_CONFIG.opacity};
            pointer-events: none;
        `;
        document.body.prepend(this.canvas);

        this.ctx = this.canvas.getContext('2d');
        this.resize();

        // Start animation
        this.animationId = requestAnimationFrame((t) => this.animate(t));

        // Handle window resize
        this.resizeHandler = () => this.resize();
        window.addEventListener('resize', this.resizeHandler);
    }

    stop() {
        if (!this.isActive) return;

        console.log('Stopping Matrix rain effect');
        this.isActive = false;

        // Cancel animation
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }

        // Remove canvas
        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }
        this.canvas = null;
        this.ctx = null;

        // Remove resize listener
        if (this.resizeHandler) {
            window.removeEventListener('resize', this.resizeHandler);
            this.resizeHandler = null;
        }
    }

    resize() {
        if (!this.canvas) return;

        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;

        const columnCount = Math.floor(this.canvas.width / MATRIX_CONFIG.fontSize);
        this.columns = Array(columnCount).fill(0).map(() =>
            Math.floor(Math.random() * -100)
        );
    }

    animate(timestamp) {
        if (!this.isActive) return;

        // Throttle based on speed config
        const elapsed = timestamp - this.lastFrame;
        if (elapsed < MATRIX_CONFIG.speed) {
            this.animationId = requestAnimationFrame((t) => this.animate(t));
            return;
        }
        this.lastFrame = timestamp;

        // Fade effect
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw characters
        this.ctx.font = `${MATRIX_CONFIG.fontSize}px monospace`;

        this.columns.forEach((y, i) => {
            const char = MATRIX_CONFIG.chars[Math.floor(Math.random() * MATRIX_CONFIG.chars.length)];
            const x = i * MATRIX_CONFIG.fontSize;

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
            if (y > this.canvas.height && Math.random() > MATRIX_CONFIG.density) {
                this.columns[i] = 0;
            } else {
                this.columns[i] = y + MATRIX_CONFIG.fontSize;
            }
        });

        this.animationId = requestAnimationFrame((t) => this.animate(t));
    }
}

// ============================================
// INITIALIZATION
// ============================================

const matrixRain = new MatrixRain();

// Start/stop based on theme
function handleThemeChange() {
    const theme = document.body.getAttribute('data-theme');

    if (theme === 'matrix') {
        matrixRain.start();
    } else {
        matrixRain.stop();
    }
}

// Listen for theme changes
window.addEventListener('themechange', handleThemeChange);

// Check initial theme
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(handleThemeChange, 100);
});

console.log('Matrix effects module loaded');
