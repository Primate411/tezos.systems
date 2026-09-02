// The pilot keeps route metadata and shared styles, not the dashboard body or
// its preload graph. The canonical index remains the deferred dashboard source.
export function renderStandaloneChamberShell(html) {
  const appSrc = html.match(/<script type="module" src="([^"]*\/app\.js\?v=[^"]+)"><\/script>/)?.[1];
  const preload = html.match(/<script src="[^"]*\/theme-preload\.js\?v=[^"]+"><\/script>/)?.[0];
  const footer = html.match(/<footer[^>]*id="site-footer"[^>]*>[\s\S]*?<\/footer>/)?.[0]
    .replace(/\s*<button[^>]*data-home-hide="credits"[^>]*>[\s\S]*?<\/button>/, '');
  if (!appSrc || !preload || !footer) throw new Error('Standalone shell requires versioned dashboard, theme, and attribution');
  const bootSrc = appSrc.replace('/app.js?', '/standalone-chamber.js?');
  let head = html.slice(0, html.indexOf('<body>'))
    .replace(/\s*<link rel="modulepreload"[^>]+>/g, '')
    .replace(/\s*<link id="hero-search-css"[^>]+>/, '')
    .replace(/\s*<script src="[^"]*\/hen-init\.js[^>]+><\/script>/, '');
  head = head.replace('data-chamber-route="tezoscrp"', 'data-chamber-route="tezoscrp" data-chamber-boot="tezoscrp"');
  head = head.replace('</head>', `<style>
    #standalone-chamber-shell [hidden] { display: none !important; }
    #standalone-chamber-retry, [data-dashboard-transition] button {
        display: inline-flex; width: auto; height: auto; min-height: 44px;
        padding: 8px 16px; vertical-align: middle;
    }
    </style>
</head>`);
  return `${head}<body>
    ${preload}
    <div id="standalone-chamber-shell">
        <a class="skip-link" href="#main-content">Skip to main content</a>
        <main id="main-content" class="chamber-loading" aria-live="polite">
            <h1>TezosCRP Recognition Hall</h1>
            <p id="standalone-chamber-status">Opening the official recognition archive…</p>
            <button type="button" id="standalone-chamber-retry" class="glass-button" hidden>Retry opening the archive</button>
            <noscript><p>JavaScript is required for the interactive recognition archive.</p></noscript>
            <p><a href="/">Return to Tezos Systems</a></p>
        </main>
        ${footer}
    </div>
    <script type="module" src="${bootSrc}" data-dashboard-src="${appSrc}"></script>
</body>
</html>
`;
}
