// Lightweight 3-step tooltip tour for first-time visitors
(function() {
    const TOUR_KEY = 'tezos-toured';
    if (localStorage.getItem(TOUR_KEY)) return;

    const steps = [
        {
            target: '.upgrade-clock',
            text: 'Live network stats \u2014 uptime, bakers, finality, staking ratio. All real-time.',
        },
        {
            target: '.nav-buttons',
            text: 'Paste your tz address in My Tezos to see your balance, rewards, and baker stats.',
        },
        {
            target: '#settings-gear',
            text: '7 themes, social sharing, keyboard shortcuts, and hidden easter eggs in here.',
        }
    ];

    let currentStep = 0;
    let overlay = null;

    function createOverlay() {
        overlay = document.createElement('div');
        overlay.id = 'tour-overlay';
        overlay.innerHTML =
            '<div class="tour-backdrop" style="position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,0.7);transition:clip-path 0.4s ease;"></div>' +
            '<div class="tour-tooltip" style="position:fixed;z-index:99999;opacity:0;transition:opacity 0.3s ease, top 0.3s ease, left 0.3s ease;">' +
                '<div class="tour-text"></div>' +
                '<div class="tour-footer">' +
                    '<span class="tour-progress"></span>' +
                    '<div class="tour-actions">' +
                        '<button class="tour-skip">skip</button>' +
                        '<button class="tour-next">next \u2192</button>' +
                    '</div>' +
                '</div>' +
            '</div>';
        document.body.appendChild(overlay);

        overlay.querySelector('.tour-skip').addEventListener('click', endTour);
        overlay.querySelector('.tour-next').addEventListener('click', nextStep);
        document.addEventListener('keydown', function handler(e) {
            if (e.key === 'Escape') { endTour(); document.removeEventListener('keydown', handler); }
            if (e.key === 'Enter' || e.key === 'ArrowRight') { nextStep(); }
        });
    }

    function showStep(index) {
        var step = steps[index];
        var el = document.querySelector(step.target);
        if (!el) { nextStep(); return; }

        var tooltip = overlay.querySelector('.tour-tooltip');
        var backdrop = overlay.querySelector('.tour-backdrop');

        overlay.querySelector('.tour-text').textContent = step.text;
        overlay.querySelector('.tour-progress').textContent = (index + 1) + ' / ' + steps.length;
        overlay.querySelector('.tour-next').textContent = index === steps.length - 1 ? 'done \u2713' : 'next \u2192';

        el.scrollIntoView({ behavior: 'smooth', block: 'center' });

        setTimeout(function() {
            var rect = el.getBoundingClientRect();
            var pad = 12;

            backdrop.style.clipPath = 'polygon(' +
                '0 0, 100% 0, 100% 100%, 0 100%, 0 0, ' +
                (rect.left - pad) + 'px ' + (rect.top - pad) + 'px, ' +
                (rect.left - pad) + 'px ' + (rect.bottom + pad) + 'px, ' +
                (rect.right + pad) + 'px ' + (rect.bottom + pad) + 'px, ' +
                (rect.right + pad) + 'px ' + (rect.top - pad) + 'px, ' +
                (rect.left - pad) + 'px ' + (rect.top - pad) + 'px)';

            var ttWidth = 300;
            var left = Math.max(16, rect.left + rect.width / 2 - ttWidth / 2);
            left = Math.min(left, window.innerWidth - ttWidth - 16);
            var top = rect.bottom + 16;

            if (top + 120 > window.innerHeight) {
                top = Math.max(16, rect.top - 140);
            }

            tooltip.style.left = left + 'px';
            tooltip.style.top = top + 'px';
            tooltip.style.width = ttWidth + 'px';
            tooltip.style.opacity = '1';
        }, 500);
    }

    function nextStep() {
        currentStep++;
        if (currentStep >= steps.length) { endTour(); return; }
        showStep(currentStep);
    }

    function endTour() {
        localStorage.setItem(TOUR_KEY, '1');
        if (overlay) overlay.remove();
        overlay = null;
    }

    setTimeout(function() {
        if (window.scrollY > 300) return;
        createOverlay();
        showStep(0);
    }, 2500);
})();
