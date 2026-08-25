// Optional help map through the core ways to move around tezos.systems.
(function () {
    const TOUR_KEY = 'tezos-toured';
    const WELCOMED_KEY = 'tezos-welcomed'; // respect welcome-terminal key too
    const TOAST_SAFE_AREA_KEY = 'tour-nudge';
    const VIEWPORT_PAD = 16;
    const TOOLTIP_GAP = 16;
    const hash = window.location.hash.slice(1);
    const shouldOfferTour = !localStorage.getItem(TOUR_KEY)
        && !localStorage.getItem(WELCOMED_KEY)
        && !hash;

    const steps = [
        {
            target: '#top-continuity-history',
            title: 'Start with mainnet history',
            text: 'The chain-age counter opens Protocol Anthology; each bright stat pill opens its own all-time chart.',
        },
        {
            target: '#live-head-button',
            title: 'Read the latest blocks',
            text: 'Live Head turns recent block receipts into Art, DeFi, gaming, transfer, bridge, and staking stories. Open any row for Network Health.',
        },
        {
            target: '#hero-search-form',
            title: 'Find anything',
            text: 'Press / from anywhere or paste a wallet address, .tez name, baker, KT1 contract, operation hash, block, protocol, Chamber, or slash command.',
        },
        {
            target: '#chambers-section .section-header',
            title: 'Explore Tezos by question',
            text: 'Choose Network, Capital, Bakers, Governance, People & Accounts, or History, then open the focused room that answers your question.',
        },
        {
            target: '#my-tezos-btn',
            title: 'Make it yours when useful',
            text: 'Add a wallet or .tez name to pull baker activity, rewards, NFTs, governance attribution, Your Tezos Story, and Network Context into one drawer.',
        },
        {
            target: '#recruit-section .site-handoff-head',
            title: 'Follow the lifeline',
            text: 'At the bottom of every page, one recommended next signal leads into Now, You, Flow, Power, Memory, and People. The complete map stays folded underneath.',
        },
        {
            target: '#features-gear',
            title: 'Explore without the wall of choices',
            text: 'Explore leads with all topics, Network Pulse, Staking, and Maxis. Live signals and specialist tools stay folded by category until you need them.',
        },
        {
            target: '#settings-gear',
            title: 'Make the Home yours',
            text: 'Setup starts with Customize home, where you can show only the blocks you use. All 15 themes, Ultra, sharing, export, shortcuts, and changelog stay nearby.',
        },
    ];

    let current = 0;
    let overlay = null;
    let tooltip = null;
    let backdrop = null;
    let nudge = null;
    let activeTarget = null;
    let positionFrame = 0;
    let positionTimer = 0;
    let nudgeResizeHandler = null;
    let surfaceObserver = null;

    function ensureNudgeAvoidanceStyle() {
        if (document.getElementById('tour-nudge-toast-avoidance')) return;
        var style = document.createElement('style');
        style.id = 'tour-nudge-toast-avoidance';
        style.textContent = [
            'body.tour-nudge-visible #moments-toast-container{z-index:100000;}',
            'body.tour-nudge-visible .visit-streak-toast{z-index:100000;}',
            '@media(max-width:600px){body.tour-nudge-visible #moments-toast-container{left:8px;right:8px;width:auto;transform:none;align-items:stretch;}body.tour-nudge-visible #moments-toast-container .moment-toast{width:100%;min-width:0;max-width:none;box-sizing:border-box;}}'
        ].join('');
        document.head.appendChild(style);
    }

    function reserveToastSpace(bottom) {
        var manager = window.tezosSystemsToastSafeArea;
        if (manager && typeof manager.reserve === 'function') {
            manager.reserve(TOAST_SAFE_AREA_KEY, bottom);
            return;
        }
        document.documentElement.style.setProperty('--toast-safe-bottom', 'calc(' + bottom + 'px + env(safe-area-inset-bottom, 0px))');
    }

    function releaseToastSpace() {
        var manager = window.tezosSystemsToastSafeArea;
        if (manager && typeof manager.release === 'function') {
            manager.release(TOAST_SAFE_AREA_KEY);
            return;
        }
        document.documentElement.style.removeProperty('--toast-safe-bottom');
    }

    function syncNudgeToastOffset() {
        if (!nudge) return;
        if (nudge.closest('#hero-slot') || window.getComputedStyle(nudge).position === 'static') {
            releaseToastSpace();
            return;
        }
        var rect = nudge.getBoundingClientRect();
        var bottom = Math.ceil(window.innerHeight - rect.top + 12);
        reserveToastSpace(bottom);
    }

    function setNudgeVisibleState() {
        ensureNudgeAvoidanceStyle();
        document.body.classList.add('tour-nudge-visible');
        syncNudgeToastOffset();
        requestAnimationFrame(syncNudgeToastOffset);
        if (!nudgeResizeHandler) {
            nudgeResizeHandler = syncNudgeToastOffset;
            window.addEventListener('resize', nudgeResizeHandler, { passive: true });
        }
    }

    function clearNudgeVisibleState() {
        document.body.classList.remove('tour-nudge-visible');
        releaseToastSpace();
        if (nudgeResizeHandler) {
            window.removeEventListener('resize', nudgeResizeHandler);
            nudgeResizeHandler = null;
        }
    }

    function hasActiveSurface() {
        return Boolean(document.querySelector(
            'body.hero-search-mode, .my-tezos-drawer.open, .modal-overlay.active, .chamber-overlay.active, .share-modal-overlay.visible, .share-modal-overlay.active, .settings-dropdown.open, .visit-streak-toast.visible, .moment-toast.visible'
        ));
    }

    function removeNudge() {
        if (nudge) {
            nudge.remove();
            nudge = null;
        }
        clearNudgeVisibleState();
    }

    function suspendNudgeForSurface() {
        if (!nudge || !hasActiveSurface()) return;
        removeNudge();
        deferNudge();
    }

    function watchActiveSurfaces() {
        if (surfaceObserver) return;
        surfaceObserver = new MutationObserver(suspendNudgeForSurface);
        surfaceObserver.observe(document.body, {
            attributes: true,
            attributeFilter: ['class'],
        });
        document.querySelectorAll(
            '.my-tezos-drawer, .modal-overlay, .chamber-overlay, .share-modal-overlay, .settings-dropdown'
        ).forEach(function (surface) {
            surfaceObserver.observe(surface, {
                attributes: true,
                attributeFilter: ['class', 'aria-hidden'],
            });
        });
    }

    function stopWatchingActiveSurfaces() {
        if (!surfaceObserver) return;
        surfaceObserver.disconnect();
        surfaceObserver = null;
    }

    function deferNudge() {
        setTimeout(function () {
            if (nudge || overlay || window.scrollY > 300 || hasActiveSurface()) {
                if (hasActiveSurface()) deferNudge();
                return;
            }
            createNudge();
        }, 1400);
    }

    function create() {
        overlay = document.createElement('div');
        overlay.id = 'tour-overlay';

        backdrop = document.createElement('div');
        backdrop.className = 'tour-backdrop';
        overlay.appendChild(backdrop);

        tooltip = document.createElement('div');
        tooltip.className = 'tour-tooltip';
        tooltip.innerHTML =
            '<div class="tour-title"></div>' +
            '<div class="tour-text"></div>' +
            '<div class="tour-footer">' +
                '<span class="tour-progress"></span>' +
                '<div class="tour-actions">' +
                    '<button class="tour-skip" type="button">skip</button>' +
                    '<button class="tour-action" type="button" style="display:none"></button>' +
                    '<button class="tour-next" type="button">next →</button>' +
                '</div>' +
            '</div>';
        overlay.appendChild(tooltip);
        document.body.appendChild(overlay);

        overlay.querySelector('.tour-skip').addEventListener('click', end);
        overlay.querySelector('.tour-next').addEventListener('click', next);
        document.addEventListener('keydown', onKey);
        window.addEventListener('resize', schedulePosition, { passive: true });
        window.addEventListener('scroll', schedulePosition, { passive: true });
        positionTimer = window.setInterval(schedulePosition, 250);
        backdrop.addEventListener('click', end);
    }

    function onKey(e) {
        if (e.key === 'Escape') end();
        if (e.key === 'Enter' || e.key === 'ArrowRight') next();
        if (e.key === 'ArrowLeft' && current > 0) { current -= 2; next(); }
    }

    function getTargetScrollTop(el) {
        var rect = el.getBoundingClientRect();
        var absoluteTop = rect.top + window.scrollY;
        var viewportHeight = window.innerHeight;
        var targetIsTall = rect.height > viewportHeight * 0.72;

        if (targetIsTall) {
            return Math.max(0, absoluteTop - VIEWPORT_PAD);
        }

        return Math.max(0, absoluteTop + (rect.height / 2) - (viewportHeight / 2));
    }

    function scrollTargetIntoView(el) {
        var root = document.documentElement;
        var body = document.body;
        var previousRootScroll = root.style.scrollBehavior;
        var previousBodyScroll = body.style.scrollBehavior;

        root.style.scrollBehavior = 'auto';
        body.style.scrollBehavior = 'auto';
        window.scrollTo({
            top: getTargetScrollTop(el),
            left: window.scrollX,
            behavior: 'auto',
        });

        requestAnimationFrame(function () {
            root.style.scrollBehavior = previousRootScroll;
            body.style.scrollBehavior = previousBodyScroll;
        });
    }

    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    function schedulePosition() {
        if (!activeTarget || !tooltip) return;
        if (positionFrame) return;

        positionFrame = requestAnimationFrame(function () {
            positionFrame = 0;
            positionTooltip(activeTarget);
        });
    }

    function positionTooltip(el) {
        if (!tooltip || !backdrop || !el) return;

        var rect = el.getBoundingClientRect();
        var targetOffscreen = rect.bottom <= VIEWPORT_PAD
            || rect.top >= window.innerHeight - VIEWPORT_PAD
            || rect.right <= VIEWPORT_PAD
            || rect.left >= window.innerWidth - VIEWPORT_PAD;
        if (targetOffscreen) {
            scrollTargetIntoView(el);
            rect = el.getBoundingClientRect();
        }
        var pad = Math.max(8, Math.min(10, window.innerWidth * 0.025));
        var highlightLeft = Math.max(0, rect.left - pad);
        var highlightTop = Math.max(0, rect.top - pad);
        var highlightRight = Math.min(window.innerWidth, rect.right + pad);
        var highlightBottom = Math.min(window.innerHeight, rect.bottom + pad);

        // Spotlight cutout
        backdrop.style.clipPath = 'polygon(' +
            '0 0, 100% 0, 100% 100%, 0 100%, 0 0, ' +
            highlightLeft + 'px ' + highlightTop + 'px, ' +
            highlightLeft + 'px ' + highlightBottom + 'px, ' +
            highlightRight + 'px ' + highlightBottom + 'px, ' +
            highlightRight + 'px ' + highlightTop + 'px, ' +
            highlightLeft + 'px ' + highlightTop + 'px)';

        // Position tooltip
        var ttWidth = Math.min(360, Math.max(260, window.innerWidth - (VIEWPORT_PAD * 2)));
        tooltip.style.width = ttWidth + 'px';
        tooltip.style.maxHeight = Math.max(160, window.innerHeight - (VIEWPORT_PAD * 2)) + 'px';
        tooltip.style.overflowY = 'auto';

        var ttHeight = Math.min(tooltip.offsetHeight || 190, window.innerHeight - (VIEWPORT_PAD * 2));
        var leftMax = Math.max(VIEWPORT_PAD, window.innerWidth - ttWidth - VIEWPORT_PAD);
        var left = clamp(rect.left + rect.width / 2 - ttWidth / 2, VIEWPORT_PAD, leftMax);

        var spaceBelow = window.innerHeight - rect.bottom - TOOLTIP_GAP - VIEWPORT_PAD;
        var spaceAbove = rect.top - TOOLTIP_GAP - VIEWPORT_PAD;
        var top = rect.bottom + TOOLTIP_GAP;
        if (spaceBelow < ttHeight && spaceAbove > spaceBelow) {
            top = rect.top - ttHeight - TOOLTIP_GAP;
        }

        var topMax = Math.max(VIEWPORT_PAD, window.innerHeight - ttHeight - VIEWPORT_PAD);
        top = clamp(top, VIEWPORT_PAD, topMax);

        tooltip.style.left = left + 'px';
        tooltip.style.top = top + 'px';
    }

    function show(index) {
        var step = steps[index];
        var el = document.querySelector(step.target);

        if (!el) { next(); return; }

        tooltip.querySelector('.tour-title').textContent = step.title;
        tooltip.querySelector('.tour-text').textContent = step.text;
        tooltip.querySelector('.tour-progress').textContent = (index + 1) + ' / ' + steps.length;

        // Show action button if step has one, otherwise show next/dive-in
        var actionBtn = tooltip.querySelector('.tour-action');
        var nextBtn = tooltip.querySelector('.tour-next');
        if (step.action) {
            nextBtn.style.display = 'none';
            actionBtn.style.display = '';
            actionBtn.textContent = step.actionLabel || 'try it';
            actionBtn.onclick = function () { end(); step.action(); };
        } else {
            nextBtn.style.display = '';
            actionBtn.style.display = 'none';
            nextBtn.textContent = index === steps.length - 1 ? 'dive in ✓' : 'next →';
        }

        activeTarget = el;
        scrollTargetIntoView(el);

        requestAnimationFrame(function () {
            positionTooltip(el);
            requestAnimationFrame(function () {
                positionTooltip(el);
                tooltip.classList.add('tour-visible');
            });
        });
    }

    function next() {
        tooltip.classList.remove('tour-visible');

        current++;
        if (current >= steps.length) { end(); return; }

        setTimeout(function () { show(current); }, 200);
    }

    function end(markComplete = true) {
        if (markComplete) localStorage.setItem(TOUR_KEY, '1');
        window.tezosSystemsHomeLayout?.endPreview?.('guided-tour');
        window.tezosSystemsChamberCategories?.endPreview?.('guided-tour');
        document.removeEventListener('keydown', onKey);
        window.removeEventListener('resize', schedulePosition);
        window.removeEventListener('scroll', schedulePosition);
        activeTarget = null;
        if (positionFrame) {
            cancelAnimationFrame(positionFrame);
            positionFrame = 0;
        }
        if (positionTimer) {
            window.clearInterval(positionTimer);
            positionTimer = 0;
        }

        if (overlay) {
            var oldOverlay = overlay;
            overlay = null;
            oldOverlay.style.opacity = '0';
            setTimeout(function () { oldOverlay.remove(); }, 300);
        }
        if (nudge) {
            removeNudge();
        }
        stopWatchingActiveSurfaces();
    }

    function startTour() {
        removeNudge();
        stopWatchingActiveSurfaces();
        window.tezosSystemsHomeLayout?.beginPreview?.('guided-tour');
        window.tezosSystemsChamberCategories?.beginPreview?.('guided-tour');
        create();
        show(0);
    }

    function replayTour() {
        end(false);
        localStorage.removeItem(TOUR_KEY);
        current = 0;
        setTimeout(startTour, 320);
    }

    function keepNudgeInSearchRail() {
        if (!nudge) return;
        var host = document.getElementById('hero-search-form');
        if (host && nudge.parentElement !== host) {
            host.insertBefore(nudge, host.querySelector('.hero-search-submit'));
        }
    }

    function createNudge() {
        if (hasActiveSurface()) {
            deferNudge();
            return;
        }
        nudge = document.createElement('div');
        nudge.className = 'tour-nudge';
        nudge.setAttribute('role', 'group');
        nudge.setAttribute('aria-label', 'Optional Tezos Systems tour');
        nudge.innerHTML =
            '<button class="tour-start" type="button">' +
                '<span>Quick tour</span>' +
            '</button>' +
            '<button class="tour-dismiss" type="button" aria-label="Dismiss tour offer">×</button>';
        const heroSlot = document.getElementById('hero-slot');
        const host = document.getElementById('hero-search-form');
        if (host) {
            host.insertBefore(nudge, host.querySelector('.hero-search-submit'));
        } else {
            (heroSlot || document.getElementById('live-head') || document.body).appendChild(nudge);
        }
        setNudgeVisibleState();
        nudge.querySelector('.tour-start').addEventListener('click', startTour);
        nudge.querySelector('.tour-dismiss').addEventListener('click', end);
    }

    window.TezosSystemsTour = { replay: replayTour };
    window.addEventListener('hot-signal-rendered', keepNudgeInSearchRail);

    if (shouldOfferTour) {
        // Offer the tour after page settles without blocking the dashboard.
        watchActiveSurfaces();
        setTimeout(function () {
            if (window.scrollY > 300) return;
            if (document.activeElement && document.activeElement.id === 'hero-search-input') return;
            if (hasActiveSurface()) { deferNudge(); return; }
            createNudge();
        }, 4000);
    }
})();
