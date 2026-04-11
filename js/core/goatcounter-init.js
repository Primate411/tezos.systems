// GoatCounter path override — count with -v2 suffix
if (window.goatcounter) {
    window.goatcounter.count({ path: function(p) { return p + '-v2'; } });
}
