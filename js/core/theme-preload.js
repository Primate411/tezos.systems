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
    var THEME_CSS_VERSION = '241';
    var VALID = ['aurora', 'matrix', 'default', 'void', 'ember', 'signal', 'nerv', 'clean', 'dark', 'bubblegum', 'abyss', 'moss', 'warzone'];
    var t = null;
    try {
        var p = new URLSearchParams(window.location.search).get('theme');
        if (p && VALID.indexOf(p) !== -1) t = p;
    } catch (e) {}
    if (!t) {
        try { t = localStorage.getItem('tezos-systems-theme'); } catch (e) {}
    }
    if (!t || VALID.indexOf(t) === -1) t = DEFAULT;
    document.body.setAttribute('data-theme', t);
    if (t !== DEFAULT) {
        var link = document.createElement('link');
        link.id = 'theme-css-' + t;
        link.rel = 'stylesheet';
        link.href = '/css/themes/' + t + '.min.css?v=' + THEME_CSS_VERSION;
        document.head.appendChild(link);
    }
})();
