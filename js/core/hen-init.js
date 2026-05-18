// Instant blackout for HEN mode — prevents dashboard flash
if (new URLSearchParams(window.location.search).has('hen')) {
    document.documentElement.style.background = '#111';
    const style = document.createElement('style');
    style.id = 'hen-initial-blackout';
    style.textContent = 'body>*:not(.hen-overlay){display:none!important}body{background:#111!important}';
    (document.head || document.documentElement).appendChild(style);
}
