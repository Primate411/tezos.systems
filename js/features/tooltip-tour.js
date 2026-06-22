// Optional help map — 5 steps through the core ways to move around tezos.systems
(function () {
    const TOUR_KEY = 'tezos-toured';
    const WELCOMED_KEY = 'tezos-welcomed'; // respect welcome-terminal key too
    if (localStorage.getItem(TOUR_KEY) || localStorage.getItem(WELCOMED_KEY)) return;

    // Deep links should go straight to their target. Do not consume the tour flag.
    const hash = window.location.hash.slice(1);
    if (hash) return;

    const steps = [
        {
            target: '#hero-search-form',
            title: 'Search is the map',
            text: 'Press / from anywhere or paste a wallet, .tez name, baker, KT1, operation hash, block, protocol, or slash command.',
        },
        {
            target: '#chambers-section',
            title: 'Live rooms explain the chain',
            text: 'Chambers are the deeper rooms: health, governance, Tezos X, Liquidity Baking, tz4, ctez, and protocol history.',
        },
        {
            target: '#my-tezos-btn',
            title: 'Make it yours when useful',
            text: 'Add a wallet or .tez name to personalize baker, rewards, NFTs, governance, and daily context. Skip it if you are just browsing.',
        },
        {
            target: '#features-gear',
            title: 'Everything else is optional',
            text: 'Open market, baker, history, widgets, and activity tools from one launcher. Pin only what matters today.',
        },
        {
            target: '#theme-toggle',
            title: 'Tune the surface',
            text: '13 themes, HEN mode, share tools, and export controls live here. Treat it as customization, not homework.',
            action: function () { if (typeof HenMode !== 'undefined') HenMode.activate(); },
            actionLabel: 'launch HEN mode',
        },
    ];

    let current = 0;
    let overlay = null;
    let tooltip = null;
    let backdrop = null;
    let nudge = null;

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
                    '<button class="tour-skip">skip</button>' +
                    '<button class="tour-action" style="display:none"></button>' +
                    '<button class="tour-next">next →</button>' +
                '</div>' +
            '</div>';
        overlay.appendChild(tooltip);
        document.body.appendChild(overlay);

        overlay.querySelector('.tour-skip').addEventListener('click', end);
        overlay.querySelector('.tour-next').addEventListener('click', next);
        document.addEventListener('keydown', onKey);
        backdrop.addEventListener('click', end);
    }

    function onKey(e) {
        if (e.key === 'Escape') end();
        if (e.key === 'Enter' || e.key === 'ArrowRight') next();
        if (e.key === 'ArrowLeft' && current > 0) { current -= 2; next(); }
    }

    function show(index) {
        var step = steps[index];
        var el = document.querySelector(step.target);

        // If target missing, try to open the settings dropdown for theme-toggle
        if (!el && step.target === '#theme-toggle') {
            var gear = document.querySelector('#settings-gear');
            if (gear) { gear.click(); el = document.querySelector(step.target); }
        }
        if (!el) { next(); return; }

        // For header buttons, we may need to open their dropdown first
        if (step.target === '#theme-toggle') {
            var dropdown = document.querySelector('#settings-dropdown');
            if (dropdown) dropdown.classList.add('show');
        }

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

        el.scrollIntoView({ behavior: 'smooth', block: 'center' });

        setTimeout(function () {
            var rect = el.getBoundingClientRect();
            var pad = 10;

            // Spotlight cutout
            backdrop.style.clipPath = 'polygon(' +
                '0 0, 100% 0, 100% 100%, 0 100%, 0 0, ' +
                (rect.left - pad) + 'px ' + (rect.top - pad) + 'px, ' +
                (rect.left - pad) + 'px ' + (rect.bottom + pad) + 'px, ' +
                (rect.right + pad) + 'px ' + (rect.bottom + pad) + 'px, ' +
                (rect.right + pad) + 'px ' + (rect.top - pad) + 'px, ' +
                (rect.left - pad) + 'px ' + (rect.top - pad) + 'px)';

            // Position tooltip
            var ttWidth = 340;
            var left = Math.max(16, rect.left + rect.width / 2 - ttWidth / 2);
            left = Math.min(left, window.innerWidth - ttWidth - 16);

            var top = rect.bottom + 16;
            if (top + 160 > window.innerHeight) {
                top = Math.max(16, rect.top - 160);
            }

            tooltip.style.left = left + 'px';
            tooltip.style.top = top + 'px';
            tooltip.style.width = ttWidth + 'px';

            // Animate in
            requestAnimationFrame(function () {
                tooltip.classList.add('tour-visible');
            });
        }, 400);
    }

    function next() {
        tooltip.classList.remove('tour-visible');

        // Close settings dropdown if it was opened for theme step
        if (steps[current] && steps[current].target === '#theme-toggle') {
            var dropdown = document.querySelector('#settings-dropdown');
            if (dropdown) dropdown.classList.remove('show');
        }

        current++;
        if (current >= steps.length) { end(); return; }

        setTimeout(function () { show(current); }, 200);
    }

    function end() {
        localStorage.setItem(TOUR_KEY, '1');
        document.removeEventListener('keydown', onKey);

        // Close any dropdown we opened
        var dropdown = document.querySelector('#settings-dropdown');
        if (dropdown) dropdown.classList.remove('show');

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
                '<span>Search handles addresses, .tez names, bakers, KT1s, blocks, operations, protocols, and slash commands. Help is available when you want it.</span>' +
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
