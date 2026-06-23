// Optional help map through the core ways to move around tezos.systems.
(function () {
    const TOUR_KEY = 'tezos-toured';
    const WELCOMED_KEY = 'tezos-welcomed'; // respect welcome-terminal key too
    const VIEWPORT_PAD = 16;
    const TOOLTIP_GAP = 16;
    if (localStorage.getItem(TOUR_KEY) || localStorage.getItem(WELCOMED_KEY)) return;

    // Deep links should go straight to their target. Do not consume the tour flag.
    const hash = window.location.hash.slice(1);
    if (hash) return;

    const steps = [
        {
            target: '#top-continuity-history',
            title: 'Start with live proof',
            text: 'The uptime badge opens Protocol Anthology; each bright stat pill opens its own all-time chart.',
        },
        {
            target: '#block-ticker-button',
            title: 'Read the latest head',
            text: 'The block ticker tracks the current head, baker, Octez version, freshness, and attestation health. Click it for the Network Health Chamber.',
        },
        {
            target: '#hero-search-form',
            title: 'Search is the map',
            text: 'Press / from anywhere or paste a wallet address, .tez name, baker, KT1 contract, operation hash, block, protocol, Chamber, or slash command.',
        },
        {
            target: '#chambers-section .section-header',
            title: 'Chambers explain the chain',
            text: 'Open Network Health, L1 Governance, Tezos X, Tezos X Governance, tz4, Liquidity Baking, and Protocol Anthology from here or with direct routes.',
        },
        {
            target: '#my-tezos-btn',
            title: 'Make it yours when useful',
            text: 'Add a wallet or .tez name to pull baker activity, rewards, NFTs, governance attribution, Your Tezos Story, and Network Context into one drawer.',
        },
        {
            target: '#tezos-loop-chips',
            title: 'Use the recipe console',
            text: 'Wallet, Baker, Contracts, NFTs, Governance, and Market lanes seed the command bar when you are not sure what to type.',
        },
        {
            target: '#features-gear',
            title: 'Explore without clutter',
            text: 'Explore opens optional tools: Network Stats, ctez, Price Intel, Compare, leaderboard, calculator, activity feeds, NFT Profile, History, State of Tezos, and widgets.',
        },
        {
            target: '#settings-gear',
            title: 'Tune and export',
            text: 'Settings keeps 13 themes, Ultra, share captures, data export, About, shortcuts, and changelog nearby. HEN mode stays available from the corner launcher.',
        },
    ];

    let current = 0;
    let overlay = null;
    let tooltip = null;
    let backdrop = null;
    let nudge = null;
    let activeTarget = null;
    let positionFrame = 0;

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

    function end() {
        localStorage.setItem(TOUR_KEY, '1');
        document.removeEventListener('keydown', onKey);
        window.removeEventListener('resize', schedulePosition);
        window.removeEventListener('scroll', schedulePosition);
        activeTarget = null;
        if (positionFrame) {
            cancelAnimationFrame(positionFrame);
            positionFrame = 0;
        }

        if (overlay) {
            overlay.style.opacity = '0';
            setTimeout(function () { overlay.remove(); overlay = null; }, 300);
        }
        if (nudge) {
            nudge.remove();
            nudge = null;
        }
    }

    function startTour() {
        if (nudge) {
            nudge.remove();
            nudge = null;
        }
        create();
        show(0);
    }

    function createNudge() {
        nudge = document.createElement('div');
        nudge.className = 'tour-nudge';
        nudge.setAttribute('role', 'dialog');
        nudge.setAttribute('aria-label', 'Tezos Systems help');
        nudge.innerHTML =
            '<div>' +
                '<strong>Need a map?</strong>' +
                '<span>Start with live uptime proof, then use / search for wallet addresses, .tez names, bakers, KT1 contracts, blocks, operations, protocols, Chambers, and tools. Help is available when you want it.</span>' +
            '</div>' +
            '<div class="tour-nudge-actions">' +
                '<button class="tour-dismiss" type="button">Not now</button>' +
                '<button class="tour-start" type="button">Show help</button>' +
            '</div>';
        document.body.appendChild(nudge);
        nudge.querySelector('.tour-start').addEventListener('click', startTour);
        nudge.querySelector('.tour-dismiss').addEventListener('click', end);
    }

    // Offer the tour after page settles without blocking the dashboard.
    setTimeout(function () {
        if (window.scrollY > 300) return;
        if (document.activeElement && document.activeElement.id === 'hero-search-input') return;
        createNudge();
    }, 4000);
})();
