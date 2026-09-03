// Standalone rooms keep route metadata and shared styles, not the dashboard body or
// its preload graph. The canonical index remains the deferred dashboard source.
function extractElement(html, id, attribute = 'id') {
  const marker = html.indexOf(`${attribute}="${id}"`);
  const start = html.lastIndexOf('<', marker);
  const tag = html.slice(start).match(/^<([a-z][\w-]*)\b/i)?.[1];
  if (marker < 0 || !tag) throw new Error(`Missing standalone fragment: ${id}`);
  const tags = new RegExp(`</?${tag}\\b[^>]*>`, 'gi');
  tags.lastIndex = start;
  let depth = 0;
  for (let match; (match = tags.exec(html));) {
    depth += match[0].startsWith('</') ? -1 : 1;
    if (!depth) return html.slice(start, tags.lastIndex);
  }
  throw new Error(`Unclosed standalone fragment: ${id}`);
}

export function renderStandaloneChamberShell(html, route, featureId = route.slug, room = {}) {
  const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const title = escape(route.shortTitle);
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
  head = head.replace(`data-chamber-route="${escape(route.slug)}"`, `data-chamber-route="${escape(route.slug)}" data-chamber-boot="${escape(featureId)}" data-dashboard-boot="manual"`);
  const fragments = (room.fragments || []).map(id => {
    let fragment = extractElement(html, id);
    if (id === 'chambers-section') {
      for (const stat of room.fragmentStats || []) {
        const slot = stat === 'network-health' ? 'health' : 'tz4';
        fragment = fragment.replace(new RegExp(`<div[^>]+data-chamber-slot="${slot}"[^>]*></div>`), extractElement(html, stat, 'data-stat'));
      }
    }
    return id === 'my-tezos-btn' ? `<div data-standalone-control hidden>${fragment}</div>` : fragment;
  }).join('\n');
  head = head.replace('</head>', `<style>
    #standalone-chamber-shell [hidden] { display: none !important; }
    #standalone-chamber-retry, [data-dashboard-transition] button {
        display: inline-flex; width: auto; height: auto; min-height: 44px;
        padding: 8px 16px; vertical-align: middle;
    }
    #standalone-chamber-shell #customize-home-btn {
        display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap;
        width: auto; height: auto; min-height: 44px; max-width: 100%;
        padding: 8px 12px; white-space: normal;
    }
    </style>
</head>`);
  return `${head}<body>
    ${preload}
    <div id="standalone-chamber-shell">
        <a class="skip-link" href="#main-content">Skip to main content</a>
        <main id="main-content" class="chamber-loading" aria-live="polite">
            <h1>${title}</h1>
            <p id="standalone-chamber-status">Opening ${title}…</p>
            <button type="button" id="standalone-chamber-retry" class="glass-button" hidden>Retry opening the Chamber</button>
            <noscript><p>JavaScript is required for this interactive Chamber.</p></noscript>
            <p><a href="/">Return to Tezos Systems</a></p>
        </main>
        ${footer}
    </div>
    ${fragments}
    <script type="module" src="${bootSrc}" data-dashboard-src="${appSrc}"></script>
</body>
</html>
`;
}
