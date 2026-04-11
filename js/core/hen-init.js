// Instant blackout for HEN mode — prevents dashboard flash
if (new URLSearchParams(window.location.search).has('hen')) {
    document.documentElement.style.background = '#111';
    document.write('<style>body>*:not(.hen-overlay){display:none!important}body{background:#111!important}</style>');
}
