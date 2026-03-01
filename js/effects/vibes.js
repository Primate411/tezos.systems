/**
 * VIBES — Visual Impact & Breathing Effects System
 * 1. Whale Alert Events (shockwave + audio on large transfers)
 * 2. Theme Transitions (radial clip-path wipe)
 * 3. Breathing Cards + Streak Unlocks
 */

// ─── 1. WHALE ALERT EVENTS ───

let audioCtx = null;

function getAudioCtx() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
}

function whaleBooom(amount) {
    // Audio: deep sub-bass boom scaled by amount
    try {
        var ctx = getAudioCtx();
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(60, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.5);
        var vol = Math.min(0.3, 0.1 + (amount / 1000000) * 0.2);
        gain.gain.setValueAtTime(vol, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.6);
    } catch(e) {}
}

function whaleShockwave() {
    var el = document.createElement('div');
    el.className = 'whale-shockwave';
    document.body.appendChild(el);
    requestAnimationFrame(function() { el.classList.add('expanding'); });
    setTimeout(function() { el.remove(); }, 1200);
}

function whaleGlow() {
    var card = document.getElementById('whale-section') || document.getElementById('whale-feed');
    if (card) {
        card.classList.add('whale-alert-glow');
        setTimeout(function() { card.classList.remove('whale-alert-glow'); }, 2000);
    }
}

function screenShake(intensity) {
    document.body.classList.add('whale-shake');
    document.body.style.setProperty('--shake-intensity', intensity + 'px');
    setTimeout(function() {
        document.body.classList.remove('whale-shake');
    }, 500);
}

function onWhaleAlert(e) {
    var tx = e.detail;
    if (!tx || !tx.amount) return;
    var xtz = tx.amount / 1000000;

    // Always: shockwave + card glow
    whaleShockwave();
    whaleGlow();

    // Audio if user has interacted
    if (audioCtx || document.querySelector('[data-ultra]')) {
        whaleBooom(xtz);
    }

    // Screen shake for massive transfers (100K+)
    if (xtz >= 100000) {
        screenShake(Math.min(6, 2 + (xtz / 500000) * 4));
    }
}

// ─── 2. THEME TRANSITIONS ───

var transitionOverlay = null;

function initThemeTransitions() {
    // Intercept theme changes
    var observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(m) {
            if (m.attributeName === 'data-theme') {
                doThemeTransition(m.oldValue);
            }
        });
    });

    observer.observe(document.documentElement, {
        attributes: true,
        attributeOldValue: true,
        attributeFilter: ['data-theme']
    });
}

function doThemeTransition(oldTheme) {
    if (transitionOverlay) return; // Already transitioning

    // Get click position or center
    var x = window.__lastClickX || window.innerWidth / 2;
    var y = window.__lastClickY || window.innerHeight / 2;

    // Calculate max radius needed
    var maxR = Math.sqrt(
        Math.max(x, window.innerWidth - x) ** 2 +
        Math.max(y, window.innerHeight - y) ** 2
    );

    transitionOverlay = document.createElement('div');
    transitionOverlay.className = 'theme-transition-overlay';
    transitionOverlay.style.setProperty('--tx', x + 'px');
    transitionOverlay.style.setProperty('--ty', y + 'px');
    transitionOverlay.style.setProperty('--tr', maxR + 'px');

    // Flash the old theme's accent color
    var accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#00d4ff';
    transitionOverlay.style.background = accent;

    document.body.appendChild(transitionOverlay);

    requestAnimationFrame(function() {
        transitionOverlay.classList.add('wipe-in');
    });

    setTimeout(function() {
        transitionOverlay.classList.add('wipe-out');
    }, 250);

    setTimeout(function() {
        if (transitionOverlay) {
            transitionOverlay.remove();
            transitionOverlay = null;
        }
    }, 600);
}

// Track last click position for theme transitions
document.addEventListener('click', function(e) {
    window.__lastClickX = e.clientX;
    window.__lastClickY = e.clientY;
}, true);

// ─── 3. BREATHING CARDS + STREAK UNLOCKS ───

var breathingEnabled = false;
var heartbeatMode = false;

function initBreathingCards() {
    // All glass cards get subtle breathing
    var cards = document.querySelectorAll('.metric-card, .glass-card, .rt-card, .briefing-content');
    cards.forEach(function(card, i) {
        card.classList.add('breathing-card');
        card.style.animationDelay = (i * 0.6) + 's';
    });
    breathingEnabled = true;

    // Watch for new cards added dynamically
    var mo = new MutationObserver(function(mutations) {
        mutations.forEach(function(m) {
            m.addedNodes.forEach(function(node) {
                if (node.nodeType === 1 && (node.classList.contains('metric-card') || node.classList.contains('glass-card') || node.classList.contains('rt-card'))) {
                    node.classList.add('breathing-card');
                }
            });
        });
    });
    mo.observe(document.body, { childList: true, subtree: true });
}

function checkStreakUnlocks() {
    var streakData = null;
    try { streakData = JSON.parse(localStorage.getItem('tezos-systems-cycle-streak')); } catch(e) {}
    if (!streakData) return;

    var count = streakData.count || 0;

    // Streak 3: heartbeat mode (cards pulse at 72bpm)
    if (count >= 3) {
        document.body.classList.add('streak-heartbeat');
        heartbeatMode = true;
    }

    // Streak 7: ultra mode unlocked without Konami
    if (count >= 7) {
        document.body.classList.add('streak-ultra-unlocked');
        // Show subtle badge
        var badge = document.createElement('div');
        badge.className = 'streak-badge';
        badge.innerHTML = '<span class="streak-fire">\u{1F525}</span><span class="streak-count">' + count + '</span>';
        badge.title = count + '-cycle streak! Ultra mode unlocked.';
        var header = document.querySelector('.header-actions') || document.querySelector('header');
        if (header) header.appendChild(badge);
    }

    // Streak 30: secret theme unlock
    if (count >= 30) {
        document.body.classList.add('streak-legendary');
    }
}

// ─── STYLES ───

function injectStyles() {
    if (document.getElementById('vibes-styles')) return;
    var s = document.createElement('style');
    s.id = 'vibes-styles';
    s.textContent = [
        // Whale shockwave
        '.whale-shockwave{position:fixed;top:50%;left:50%;width:0;height:0;border-radius:50%;border:2px solid var(--accent,#00d4ff);opacity:0.8;pointer-events:none;z-index:9999;transform:translate(-50%,-50%)}',
        '.whale-shockwave.expanding{animation:shockExpand 1s ease-out forwards}',
        '@keyframes shockExpand{0%{width:0;height:0;opacity:0.8;border-width:3px}100%{width:200vmax;height:200vmax;opacity:0;border-width:1px}}',
        // Whale card glow
        '.whale-alert-glow{animation:whaleGlow 2s ease!important}',
        '@keyframes whaleGlow{0%{box-shadow:0 0 0 rgba(var(--accent-rgb,0,212,255),0)}25%{box-shadow:0 0 40px rgba(var(--accent-rgb,0,212,255),0.4)}100%{box-shadow:none}}',
        // Screen shake
        '.whale-shake{animation:whaleShake 0.5s ease}',
        '@keyframes whaleShake{0%,100%{transform:translateX(0)}10%{transform:translateX(calc(var(--shake-intensity,3px)*-1))}20%{transform:translateX(var(--shake-intensity,3px))}30%{transform:translateX(calc(var(--shake-intensity,3px)*-0.7))}40%{transform:translateX(calc(var(--shake-intensity,3px)*0.5))}50%{transform:translateX(calc(var(--shake-intensity,3px)*-0.3))}60%{transform:translateX(calc(var(--shake-intensity,3px)*0.1))}}',
        // Theme transition
        '.theme-transition-overlay{position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999;pointer-events:none;opacity:0;clip-path:circle(0px at var(--tx,50%) var(--ty,50%))}',
        '.theme-transition-overlay.wipe-in{animation:themeWipeIn 250ms ease-out forwards}',
        '.theme-transition-overlay.wipe-out{animation:themeWipeOut 350ms ease-in forwards}',
        '@keyframes themeWipeIn{0%{clip-path:circle(0px at var(--tx) var(--ty));opacity:0.6}100%{clip-path:circle(var(--tr) at var(--tx) var(--ty));opacity:0.15}}',
        '@keyframes themeWipeOut{0%{clip-path:circle(var(--tr) at var(--tx) var(--ty));opacity:0.15}100%{clip-path:circle(var(--tr) at var(--tx) var(--ty));opacity:0}}',
        // Breathing cards
        '.breathing-card{animation:cardBreathe 4s ease-in-out infinite}',
        '@keyframes cardBreathe{0%,100%{box-shadow:0 0 0 rgba(var(--accent-rgb,0,212,255),0);transform:scale(1)}50%{box-shadow:0 0 12px rgba(var(--accent-rgb,0,212,255),0.06);transform:scale(1.002)}}',
        // Heartbeat mode (streak 3+)
        '.streak-heartbeat .breathing-card{animation:cardHeartbeat 0.833s ease-in-out infinite}',
        '@keyframes cardHeartbeat{0%,100%{transform:scale(1)}15%{transform:scale(1.003)}30%{transform:scale(1)}45%{transform:scale(1.002)}}',
        // Streak badge
        '.streak-badge{display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:100px;background:rgba(255,107,43,0.15);font-size:11px;margin-left:8px;cursor:default}',
        '.streak-fire{font-size:12px}',
        '.streak-count{font-family:Orbitron,monospace;font-weight:700;color:var(--accent)}',

        // 1. Briefing card depth hierarchy — deeper tint, softer glow
        '.daily-briefing-section{background:rgba(0,0,0,0.35)!important;border-color:rgba(255,255,255,0.04)!important;box-shadow:0 8px 32px rgba(0,0,0,0.3),0 0 1px rgba(255,255,255,0.06)!important}',

        // 2. Uptime clock scanline + animated border pulse
        '.uptime-clock{overflow:hidden}',
        '.uptime-clock::after{content:\'\';position:absolute;top:0;left:0;right:0;bottom:0;background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(255,255,255,0.015) 2px,rgba(255,255,255,0.015) 4px);pointer-events:none;z-index:1}',



        // 3. Stake/Bake CTA buttons — more prominent
        '.price-cta{opacity:1!important;padding:3px 10px!important;border:1px solid rgba(var(--accent-rgb,0,212,255),0.3)!important;border-radius:4px!important;font-weight:600!important;color:var(--accent,#00d4ff)!important;transition:all 0.25s!important;font-size:0.72rem!important}',
        '.price-cta:hover{background:rgba(var(--accent-rgb,0,212,255),0.15)!important;box-shadow:0 0 12px rgba(var(--accent-rgb,0,212,255),0.2)!important;transform:translateY(-1px)!important}',

        // 4. Matrix rain glass interaction — removed (caused halo artifacts)


        ].join('\n');
    document.head.appendChild(s);
}

// ─── INIT ───

export function initVibes() {
    injectStyles();

    // Whale alerts
    window.addEventListener('whale-alert', onWhaleAlert);

    // Theme transitions
    initThemeTransitions();

    // Breathing cards (slight delay to let DOM populate)
    setTimeout(initBreathingCards, 2000);

    // Streak unlocks
    checkStreakUnlocks();

    // 2. Uptime clock: add pulse border element
    var uptimeClock = document.querySelector('.uptime-clock');
    if (uptimeClock) {
        var pulse = document.createElement('div');
        pulse.className = 'uptime-live-pulse';
        uptimeClock.appendChild(pulse);
    }

    // Init audio context on first interaction
    document.addEventListener('click', function() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
    }, { once: true });
}
