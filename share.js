/**
 * Share/Screenshot functionality for tezos.systems
 */

let html2canvasLoaded = false;

/**
 * Load html2canvas dynamically
 */
async function loadHtml2Canvas() {
    if (html2canvasLoaded) return;
    
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
        script.onload = () => {
            html2canvasLoaded = true;
            resolve();
        };
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

/**
 * Initialize share functionality
 */
export function initShare() {
    const shareBtn = document.getElementById('share-btn');
    if (shareBtn) {
        shareBtn.addEventListener('click', captureAndShare);
    }
}

/**
 * Capture the dashboard and show share options
 */
async function captureAndShare() {
    const shareBtn = document.getElementById('share-btn');
    const originalText = shareBtn.innerHTML;
    
    try {
        // Show loading state
        shareBtn.innerHTML = '<span class="share-icon">⏳</span>';
        shareBtn.disabled = true;
        
        // Load html2canvas if needed
        await loadHtml2Canvas();
        
        // Hide UI elements we don't want in screenshot
        const elementsToHide = [
            document.querySelector('.header'),
            document.querySelector('.corner-ribbon'),
            document.getElementById('ultra-canvas'),
            document.getElementById('ultra-selector'),
            document.querySelector('.matrix-rain')
        ].filter(Boolean);
        
        elementsToHide.forEach(el => el.style.visibility = 'hidden');
        
        // Create a wrapper for the screenshot with branding
        const wrapper = document.createElement('div');
        wrapper.id = 'screenshot-wrapper';
        wrapper.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 1200px;
            min-height: 800px;
            background: ${getComputedStyle(document.body).background};
            padding: 30px;
            z-index: -1;
            overflow: hidden;
        `;
        
        // Clone the main content
        const mainContent = document.querySelector('.main-content');
        const clone = mainContent.cloneNode(true);
        clone.style.cssText = 'margin: 0; padding: 0;';
        
        // Add header with branding
        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 24px;
            padding-bottom: 16px;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        `;
        
        const isMatrix = document.body.getAttribute('data-theme') === 'matrix';
        const brandColor = isMatrix ? '#00ff00' : '#00d4ff';
        
        header.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px;">
                <span style="font-size: 24px; font-weight: 700; color: ${brandColor};">tezos.systems</span>
            </div>
            <div style="font-size: 14px; color: rgba(255,255,255,0.6);">
                ${new Date().toLocaleString('en-US', { 
                    month: 'short', 
                    day: 'numeric', 
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                })}
            </div>
        `;
        
        wrapper.appendChild(header);
        wrapper.appendChild(clone);
        document.body.appendChild(wrapper);
        
        // Capture
        const canvas = await html2canvas(wrapper, {
            backgroundColor: isMatrix ? '#000000' : '#0a0a0f',
            scale: 2,
            useCORS: true,
            logging: false,
            width: 1200,
            windowWidth: 1200
        });
        
        // Clean up
        wrapper.remove();
        elementsToHide.forEach(el => el.style.visibility = '');
        
        // Show share modal
        showShareModal(canvas);
        
    } catch (error) {
        console.error('Screenshot failed:', error);
        showNotification('Screenshot failed. Try again.', 'error');
    } finally {
        shareBtn.innerHTML = originalText;
        shareBtn.disabled = false;
    }
}

/**
 * Show modal with share options
 */
function showShareModal(canvas) {
    // Remove existing modal if any
    const existing = document.getElementById('share-modal');
    if (existing) existing.remove();
    
    const isMatrix = document.body.getAttribute('data-theme') === 'matrix';
    const brandColor = isMatrix ? '#00ff00' : '#00d4ff';
    
    const modal = document.createElement('div');
    modal.id = 'share-modal';
    modal.className = 'share-modal-overlay';
    modal.innerHTML = `
        <div class="share-modal-content">
            <div class="share-modal-header">
                <h3>Share Snapshot</h3>
                <button class="share-modal-close">×</button>
            </div>
            <div class="share-modal-preview">
                <img src="${canvas.toDataURL('image/png')}" alt="Dashboard snapshot" />
            </div>
            <div class="share-modal-actions">
                <button class="share-action-btn" id="share-download">
                    <span>💾</span> Download PNG
                </button>
                <button class="share-action-btn" id="share-copy">
                    <span>📋</span> Copy to Clipboard
                </button>
                <button class="share-action-btn" id="share-twitter">
                    <span>𝕏</span> Share on X
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Animate in
    requestAnimationFrame(() => {
        modal.classList.add('visible');
    });
    
    // Event listeners
    modal.querySelector('.share-modal-close').addEventListener('click', () => closeShareModal(modal));
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeShareModal(modal);
    });
    
    // Download
    modal.querySelector('#share-download').addEventListener('click', () => {
        const link = document.createElement('a');
        link.download = `tezos-systems-${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        showNotification('Image downloaded!', 'success');
    });
    
    // Copy to clipboard
    modal.querySelector('#share-copy').addEventListener('click', async () => {
        try {
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob })
            ]);
            showNotification('Copied to clipboard!', 'success');
        } catch (err) {
            // Fallback: copy URL
            showNotification('Clipboard not supported. Use download instead.', 'error');
        }
    });
    
    // Share on X/Twitter
    modal.querySelector('#share-twitter').addEventListener('click', () => {
        const text = encodeURIComponent('Check out the latest Tezos network stats! 📊\n\n#Tezos #XTZ #Blockchain');
        const url = encodeURIComponent('https://tezos.systems');
        window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank');
    });
}

/**
 * Close share modal
 */
function closeShareModal(modal) {
    modal.classList.remove('visible');
    setTimeout(() => modal.remove(), 200);
}

/**
 * Show notification toast
 */
function showNotification(message, type = 'info') {
    const existing = document.querySelector('.share-notification');
    if (existing) existing.remove();
    
    const isMatrix = document.body.getAttribute('data-theme') === 'matrix';
    const colors = {
        success: isMatrix ? '#00ff00' : '#10b981',
        error: isMatrix ? '#ff0000' : '#ef4444',
        info: isMatrix ? '#00ff00' : '#00d4ff'
    };
    
    const notification = document.createElement('div');
    notification.className = 'share-notification';
    notification.style.cssText = `
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%) translateY(20px);
        background: rgba(0, 0, 0, 0.9);
        border: 1px solid ${colors[type]};
        color: ${colors[type]};
        padding: 12px 24px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        z-index: 10010;
        opacity: 0;
        transition: all 0.2s ease;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    requestAnimationFrame(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translateX(-50%) translateY(0)';
    });
    
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(-50%) translateY(20px)';
        setTimeout(() => notification.remove(), 200);
    }, 3000);
}
