/**
 * Theme preload — runs render-blocking, before first paint, to apply the saved
 * (or default) theme and prevent a flash of the wrong theme on load.
 *
 * Must stay a CLASSIC script (not a module) so it executes synchronously, and
 * must mirror the theme list / deep-link + default logic in js/ui/theme.js.
 * Loaded from index.html as <script src="..."></script> (no defer/async).
 */
(function () {
    var DEFAULT = 'aurora';
    var THEME_CSS_VERSION = '620';
    var VALID = ['aurora', 'matrix', 'hen', 'default', 'void', 'ember', 'signal', 'nerv', 'clean', 'dark', 'bubblegum', 'abyss', 'moss', 'valley', 'warzone'];
    var THEME_FONTS = {
        aurora: ['Chakra+Petch:wght@400;600;700'],
        matrix: ['Share+Tech+Mono'],
        default: ['Chakra+Petch:wght@400;600;700'],
        void: ['Exo+2:wght@300;400;600'],
        ember: ['Chakra+Petch:wght@400;600;700'],
        signal: ['IBM+Plex+Mono:wght@400;500;600;700'],
        nerv: ['IBM+Plex+Mono:wght@400;500;600;700', 'Archivo+Black'],
        bubblegum: ['Nunito:wght@400;500;600;700;800;900'],
        abyss: ['Exo+2:wght@300;400;600', 'IBM+Plex+Mono:wght@400;500;600;700'],
        moss: ['Major+Mono+Display', 'Nunito:wght@400;500;600;700;800;900'],
        valley: ['Nunito:wght@400;500;600;700;800;900'],
        warzone: ['Chakra+Petch:wght@400;600;700', 'IBM+Plex+Mono:wght@400;500;600;700', 'Silkscreen:wght@400;700']
    };
    var t = null;
    try {
        var h = new URLSearchParams(window.location.hash.slice(1)).get('theme');
        if (h && VALID.indexOf(h) !== -1) t = h;
        var p = new URLSearchParams(window.location.search).get('theme');
        if (!t && p && VALID.indexOf(p) !== -1) t = p;
    } catch (e) {}
    if (!t) {
        try { t = localStorage.getItem('tezos-systems-theme'); } catch (e) {}
    }
    if (!t || VALID.indexOf(t) === -1) t = DEFAULT;
    document.body.setAttribute('data-theme', t);
    var fonts = THEME_FONTS[t] || [];
    if (fonts.length) {
        var fontLink = document.createElement('link');
        fontLink.id = 'theme-fonts-' + t;
        fontLink.rel = 'stylesheet';
        fontLink.href = 'https://fonts.googleapis.com/css2?' + fonts.map(function (family) {
            return 'family=' + family;
        }).join('&') + '&display=swap';
        document.head.appendChild(fontLink);
    }
    var link = document.createElement('link');
    link.id = 'theme-css-' + t;
    link.rel = 'stylesheet';
    link.href = '/css/themes/' + t + '.min.css?v=' + THEME_CSS_VERSION;
    document.head.appendChild(link);
})();
