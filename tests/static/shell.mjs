// Static contracts owned by shell. Shared dependencies remain explicit.
export function createShellStaticChecks({
  CHAMBER_FEATURES,
  CHAMBER_ROUTES,
  ROOT,
  assert,
  fail,
  fs,
  pass,
  path,
  pathExists,
  readText,
  standaloneFeatureForRoute,
  vm,
  walk
}) {
  async function checkCacheBustAlignment() {
    const index = await readText('index.html');
    const sw = await readText('sw.js');
    // Both entry points use the same release/update implementation.
    const app = await readText('js/core/app.js') + await readText('js/core/shell-lifecycle.js');
    const releaseUpdate = await readText('js/ui/release-update.js');
    const changelogSource = await readText('js/features/changelog.js');
    const changelogModuleUrl = `data:text/javascript;base64,${Buffer.from(changelogSource).toString('base64')}`;
    const { CHANGELOG } = await import(changelogModuleUrl);
    const latestChangelogEntry = await readText('scripts/latest-changelog-entry.mjs');
    const stampVersion = await readText('scripts/stamp-version.sh');
    const version = JSON.parse(await readText('version.json'));
    const styles = await readText('css/styles.css');
    const heroSearch = await readText('js/features/search.js');
    const leaderboard = await readText('js/features/leaderboard.js');
    const ledgerFlow = await readText('js/features/ledger-flow.js');
    const networkPulse = await readText('js/features/network-pulse.js');
    const stakingChamber = await readText('js/features/staking-chamber.js');
    const networkHealth = await readText('js/features/network-health.js');
    const maxis = await readText('js/features/maxis.js');
    const assetVersion = await readText('js/core/asset-version.js');
    const themePreload = await readText('js/core/theme-preload.js');
    const themeUi = await readText('js/ui/theme.js');
    const cssMatch = index.match(/css\/styles\.min\.css\?v=(\d+)/);
    const loadingCssLinkMatch = index.match(/css\/loading\.min\.css\?v=(\d+)/);
    const heroCssLinkMatch = index.match(/css\/hero-search\.min\.css\?v=(\d+)/);
    const siteMapCssLinkMatch = index.match(/css\/site-map\.min\.css\?v=(\d+)/);
    const appPreloadMatch = index.match(/js\/core\/app\.js\?v=(\d+)/);
    const appScriptMatch = index.match(/<script[^>]+src=["']js\/core\/app\.js\?v=(\d+)["']/);
    const myTezosPreloadMatch = index.match(/<link rel="modulepreload" href="js\/features\/my-tezos\.js\?v=(\d+)">/);
    const themePreloadScriptMatch = index.match(/js\/core\/theme-preload\.js\?v=(\d+)/);
    const cacheMatch = sw.match(/CACHE_NAME\s*=\s*['"]tezos-systems-v(\d+)['"]/);
    const shellExtrasCssMatch = index.match(/css\/shell-extras\.min\.css\?v=(\d+)/);
    const assetVersionMatch = assetVersion.match(/ASSET_VERSION\s*=\s*['"](\d+)['"]/);
    const themePreloadMatch = themePreload.match(/THEME_CSS_VERSION\s*=\s*['"](\d+)['"]/);
    const themeUiMatch = themeUi.match(/THEME_CSS_VERSION\s*=\s*['"](\d+)['"]/);
    const runtimeCssContracts = [
      ['search.js hero-search.css', heroSearch, "versionedAsset('/css/hero-search.min.css')"],
      ['app.js generated My Tezos CSS', app, "versionedAsset('/css/my-tezos.min.css')"],
      ['leaderboard.js leaderboard CSS', leaderboard, "versionedAsset('/css/leaderboard.min.css')"],
      ['ledger-flow.js Ledger Flow CSS', ledgerFlow, "versionedAsset('/css/ledger-flow.min.css')"],
      ['network-pulse.js Network Pulse CSS', networkPulse, "versionedAsset('/css/network-pulse.min.css')"],
      ['staking-chamber.js Staking CSS', stakingChamber, "versionedAsset('/css/staking-chamber.min.css')"],
      ['network-health.js Network Health CSS', networkHealth, "versionedAsset('/css/network-health.min.css')"],
      ['maxis.js Maxis CSS', maxis, "versionedAsset('/css/maxis.min.css')"]
    ];

    if (!cssMatch) fail('index.html must serve css/styles.min.css with a ?v= cache stamp');
    if (!loadingCssLinkMatch) fail('index.html must serve css/loading.min.css with a ?v= cache stamp');
    if (!heroCssLinkMatch) fail('index.html must serve css/hero-search.css with a ?v= cache stamp');
    if (!siteMapCssLinkMatch) fail('index.html must serve css/site-map.min.css with a ?v= cache stamp');
    if (!appPreloadMatch) fail('index.html modulepreload for js/core/app.js must carry a ?v= cache stamp');
    if (!appScriptMatch) fail('index.html app module script must carry a ?v= cache stamp');
    if (!myTezosPreloadMatch) fail('My Tezos preload must match its versioned Chamber import');
    if (!themePreloadScriptMatch) fail('index.html theme-preload.js script must carry a ?v= cache stamp');
    if (!cacheMatch) fail('sw.js CACHE_NAME must be tezos-systems-vNN');
    if (!shellExtrasCssMatch) fail('index.html must serve the render-blocking minified shell-extras bundle with a ?v= cache stamp');
    if (!assetVersionMatch) fail('asset-version.js must expose the shared runtime ASSET_VERSION');
    for (const [label, source, contract] of runtimeCssContracts) {
      if (!source.includes(contract)) fail(`${label} loader must use the shared versionedAsset() cache stamp`);
    }
    if (!themePreloadMatch) fail('theme-preload.js must expose THEME_CSS_VERSION');
    if (!themeUiMatch) fail('theme.js must expose THEME_CSS_VERSION');

    const versions = [
      cssMatch?.[1],
      loadingCssLinkMatch?.[1],
      heroCssLinkMatch?.[1],
      siteMapCssLinkMatch?.[1],
      appPreloadMatch?.[1],
      appScriptMatch?.[1],
      myTezosPreloadMatch?.[1],
      themePreloadScriptMatch?.[1],
      cacheMatch?.[1],
      shellExtrasCssMatch?.[1],
      assetVersionMatch?.[1],
      themePreloadMatch?.[1],
      themeUiMatch?.[1]
    ].filter(Boolean);
    if (new Set(versions).size > 1) {
      fail(`cache stamps are out of sync: ${versions.join(', ')}`);
    } else if (versions.length === 12) {
      pass(`cache stamps aligned at v${versions[0]}`);
    }

    const generatedRouteCacheRefs = [
      ['styles', /<link rel="stylesheet" href="\/css\/styles\.min\.css\?v=(\d+)">/],
      ['loading', /<link rel="stylesheet" href="\/css\/loading\.min\.css\?v=(\d+)">/],
      ['hero search', /<link id="hero-search-css" rel="stylesheet" href="\/css\/hero-search\.min\.css\?v=(\d+)">/],
      ['site map', /<link rel="stylesheet" href="\/css\/site-map\.min\.css\?v=(\d+)">/],
      ['app module preload', /<link rel="modulepreload" href="\/js\/core\/app\.js\?v=(\d+)">/],
      ['theme preload', /<script src="\/js\/core\/theme-preload\.js\?v=(\d+)"><\/script>/],
      ['app module script', /<script type="module" src="\/js\/core\/app\.js\?v=(\d+)"><\/script>/]
    ];
    const generatedRouteCacheVersion = cacheMatch?.[1];
    if (generatedRouteCacheVersion) {
      for (const route of CHAMBER_ROUTES) {
        const routeShell = await readText(`${route.slug}/index.html`);
        for (const [label, pattern] of generatedRouteCacheRefs) {
          if (standaloneFeatureForRoute(route.slug) && ['hero search', 'app module preload', 'app module script'].includes(label)) continue;
          const routeVersion = routeShell.match(pattern)?.[1];
          if (routeVersion !== generatedRouteCacheVersion) {
            fail(`${route.slug}/index.html ${label} cache stamp must match v${generatedRouteCacheVersion}, saw ${routeVersion || 'missing'}`);
          }
        }
      }
      for (const [id, feature] of Object.entries(CHAMBER_FEATURES)) {
        if (!feature.standalone) continue;
        const shell = await readText(`${feature.standalone.route}/index.html`);
        if (!shell.includes(`/js/core/standalone-chamber.js?v=${generatedRouteCacheVersion}`)
          || !shell.includes(`data-dashboard-src="/js/core/app.js?v=${generatedRouteCacheVersion}"`)) fail(`Standalone ${id} boot and deferred dashboard must use the same shell version`);
      }
      pass(`${CHAMBER_ROUTES.length} generated Chamber shells align seven cache-stamped shell references at v${generatedRouteCacheVersion}`);
    }

    const themeVersions = [themePreloadMatch?.[1], themeUiMatch?.[1], cssMatch?.[1]].filter(Boolean);
    if (new Set(themeVersions).size > 1) {
      fail(`lazy theme CSS versions are out of sync: ${themeVersions.join(', ')}`);
    } else if (themeVersions.length === 3) {
      pass(`lazy theme CSS version aligned at v${themeVersions[0]}`);
    }

    if (!sw.includes("'/version.json'") && !sw.includes('/version.json')) {
      fail('sw.js must handle version.json freshness');
    } else {
      pass('service worker handles version.json freshness');
    }

    const shellAssetsBlock = sw.match(/const SHELL_ASSETS = \[([\s\S]*?)\];/)?.[1] || '';
    for (const optionalAsset of ["'/anthology/'", "'/pulse/'", "'/widgets/builder.html'", "'/css/styles.css'", "'/css/network-health.css'", "'/data/maxis/manifest.json'"]) {
      if (shellAssetsBlock.includes(optionalAsset)) fail(`sw.js install shell should not precache optional asset ${optionalAsset}`);
    }
    for (const contract of ['RUNTIME_CACHE_LIMIT', "_quality: { status: 'unavailable', observedAt: null }"]) {
      if (!sw.includes(contract)) fail(`sw.js bounded runtime/explicit API failure contract missing ${contract}`);
    }
    if (sw.includes('staleApiFallback') || sw.includes('API_CACHE_MAX_AGE_MS')) {
      fail('sw.js must not return cached API payloads as successful current responses to provenance-unaware consumers');
    }
    if (!shellAssetsBlock.includes("'/offline.html'") || !sw.includes("caches.match('/offline.html')")) {
      fail('sw.js must precache and serve the self-contained offline navigation page');
    }
    if (shellAssetsBlock.includes("'/'") || shellAssetsBlock.includes("'/index.html'")) {
      fail('sw.js must not precache navigable dashboard HTML when offline navigations deliberately use offline.html');
    }
    if (!sw.includes("event.data?.type === 'SKIP_WAITING'") || !app.includes("waiting.postMessage({ type: 'SKIP_WAITING' })")) {
      fail('service-worker updates must wait for an explicit visible user action');
    }
    const releaseUpdateContracts = [
      ["import('../ui/release-update.js')", app],
      ['SERVICE_WORKER_UPDATE_CHECK_MS', app],
      ['SERVICE_WORKER_UPDATE_DEFER_MS', app],
      ['SERVICE_WORKER_UPDATE_DEFER_KEY', app],
      ['sessionStorage.setItem(SERVICE_WORKER_UPDATE_DEFER_KEY', app],
      ['sessionStorage.getItem(SERVICE_WORKER_UPDATE_DEFER_KEY', app],
      ['SERVICE_WORKER_ACTIVATION_TIMEOUT_MS', app],
      ['window.setInterval(checkForUpdate, SERVICE_WORKER_UPDATE_CHECK_MS)', app],
      ["document.visibilityState === 'visible'", app],
      ['Update applied in another tab', app],
      ['Update could not finish', app],
      ['if (promptWorker === worker) return', app],
      ['generation !== promptGeneration', app],
      ['deferredUntil > Date.now()', app],
      ['compactControls.append(actionButton)', releaseUpdate],
      ['workerVersion === documentVersion', app],
      ["await reg.update().catch(() => {})", app],
      ["GET_RELEASE_VERSION", sw],
      ['fetchReleaseUpdateMetadata', app],
      ['version?.latestChange', app],
      ['hydrateIncomingReleaseContext', releaseUpdate],
      ['showReleaseUpdateDock', releaseUpdate],
      ['reserveToastSafeArea(SAFE_AREA_KEY', releaseUpdate],
      ['--release-update-safe-bottom', releaseUpdate],
      ['release-update-safe-area-raised', releaseUpdate],
      ['tezos:overlay-stack-change', releaseUpdate],
      ['activeOverlayCount', releaseUpdate],
      ['overlaySuppressed', releaseUpdate],
      ["pill.addEventListener('click'", releaseUpdate],
      ['release-update-transmission-header', releaseUpdate],
      ['System transmission · incoming', releaseUpdate],
      [".release-update-action", styles],
      [".release-update-transmission-header", styles],
      ['left: 50%', styles],
      ['.release-update-dock[data-state="error"]', styles],
      ['--release-accent: #45E0C8', styles],
      ['min-height: 44px', styles],
      [".release-update-dock.is-collapsed", styles],
      ['expanded = false', releaseUpdate]
    ];
    for (const [snippet, source] of releaseUpdateContracts) {
      if (!source.includes(snippet)) fail(`service-worker release dock contract missing: ${snippet}`);
    }
    if (!shellAssetsBlock.includes("'/js/ui/release-update.js'")) {
      fail('service-worker install shell must include the dedicated release update UI');
    }
    const currentLatestChange = CHANGELOG[0]?.entries?.at(-1)?.text || '';
    if (!currentLatestChange
        || version.latestChange !== currentLatestChange
        || !latestChangelogEntry.includes("CHANGELOG[0]")
        || !stampVersion.includes('latest-changelog-entry.mjs')) {
      fail('version metadata must carry the latest user-facing changelog entry for the release transmission');
    } else {
      pass('release transmission metadata matches the latest user-facing changelog entry');
    }
    if (app.includes('service-worker-update-toast') || app.includes('duration: 15000')) {
      fail('service-worker updates must not regress to the expiring ambient toast');
    }
    if (!themePreload.includes("window.location.hash.slice(1)") || !themePreload.includes("get('theme')")) {
      fail('theme-preload.js must honor hash theme deep links before first paint');
    }
    if (!themeUi.includes("window.location.hash.slice(1)") || !themeUi.includes("hashParams.get('theme')")) {
      fail('theme.js runtime initialization must preserve hash theme precedence over saved preferences');
    }
    pass('service worker uses a bottom-center System Transmission with current release context, visible hourly checks, cross-tab recovery, a small install shell, bounded runtime cache, explicit API failures, and an offline navigation page');

    if (!index.includes('<meta property="og:image:width" content="1200">') || !index.includes('<meta property="og:image:height" content="630">')) {
      fail('index.html root OG image metadata must match generated og-image.png at 1200x630');
    } else {
      pass('root OG image dimensions match generator output');
    }
    const rootOgUrl = index.match(/<meta property="og:image" content="(https:\/\/tezos\.systems\/og-image\.png\?v=[^"]+)">/)?.[1];
    if (!rootOgUrl || !index.includes(`<meta name="twitter:image" content="${rootOgUrl}">`)) {
      fail('index.html root OG and X metadata must share one cache-busted social-card URL');
    } else {
      const rootOgConsumers = [
        'landing.html',
        'governance/index.html',
        'bakers/index.html',
        'hen/index.html',
        'compare/index.html',
        'compare/tezos-vs-ethereum.html',
        'compare/tezos-vs-solana.html',
        'compare/tezos-vs-cardano.html',
        'compare/tezos-vs-algorand.html'
      ];
      for (const file of rootOgConsumers) {
        const html = await readText(file);
        const references = [...html.matchAll(/https:\/\/tezos\.systems\/og-image\.png(?:\?v=[^"']+)?/g)].map((match) => match[0]);
        if (!references.length || references.some((reference) => reference !== rootOgUrl)) {
          fail(`${file} must use the shared cache-busted root social-card URL`);
        }
      }
      pass(`root social-card cache key aligned across ${rootOgConsumers.length + 1} public surfaces`);
    }

    if (!app.includes("fetch('/version.json'")) {
      fail('app.js must fetch /version.json from the site root so clean route pages do not request nested version metadata');
    } else {
      pass('app.js fetches version metadata from the site root');
    }
  }

  async function checkCsp() {
    const index = await readText('index.html');
    const cspMatch = index.match(/http-equiv=["']Content-Security-Policy["'][^>]*content="([^"]+)"/i)
      || index.match(/http-equiv=["']Content-Security-Policy["'][^>]*content='([^']+)'/i);
    if (!cspMatch) {
      fail('index.html is missing a Content-Security-Policy meta tag');
      return;
    }

    const csp = cspMatch[1];
    const requiredScript = [
      'cdn.jsdelivr.net',
      'https://esm.sh'
    ];
    for (const domain of requiredScript) {
      if (!csp.includes(domain)) fail(`CSP script-src is missing ${domain}`);
    }

    const requiredConnect = [
      'api.coingecko.com',
      '*.tzkt.io',
      'api.tezos.domains',
      '*.rpc.tez.capital',
      '*.supabase.co',
      'data.objkt.com',
      'api.github.com',
      'cdn.jsdelivr.net',
      'https://esm.sh',
      '*.octez.io',
      'teztale-server-mainnet-ro-prd.octez.tech',
      'wss://*.octez.io',
      'https://*.papers.tech',
      'wss://*.papers.tech',
      'wss://relay.walletconnect.com',
      'wss://ws.kraken.com',
      'api.llama.fi',
      'explorer.etherlink.com',
      'node.mainnet.etherlink.com'
    ];
    for (const domain of requiredConnect) {
      if (!csp.includes(domain)) fail(`CSP connect-src is missing ${domain}`);
    }
    const mediaDirective = csp.match(/media-src\s+([^;]+)/)?.[1] || '';
    for (const domain of ['assets.objkt.media', 'dweb.link', 'nftstorage.link', 'ipfs.io', 'gateway.pinata.cloud']) {
      if (!mediaDirective.includes(domain)) fail(`CSP media-src is missing HEN media gateway ${domain}`);
    }
    pass('CSP includes required live-data domains');
  }

  async function checkSelectorContracts() {
    const index = await readText('index.html');
    const themePreload = await readText('js/core/theme-preload.js');
    const networkHealth = await readText('js/features/network-health.js');
    const siteMapSource = await readText('js/core/site-map.js');
    const siteHandoffSource = await readText('js/core/site-handoff.js');
    const siteMapModuleUrl = `data:text/javascript;base64,${Buffer.from(siteMapSource).toString('base64')}`;
    const { siteMapStarters } = await import(siteMapModuleUrl);
    const governanceLanding = await readText('governance/index.html');
    const landingLiveData = await readText('js/landing/live-data.js');
    const shareSnippetSource = (await Promise.all(['js/ui/share.js', 'js/ui/share-renderer.js', 'js/ui/share-state.js'].map(readText))).join('\n');
    const requiredIds = [
      'price-bar',
      'ctez-launcher',
      'tzsafe-launcher',
      'features-gear',
      'features-dropdown',
      'ctez-feature-btn',
      'tzsafe-feature-link',
      'chambers-toggle',
      'chambers-section',
      'chambers-grid',
      'hot-today-info-btn',
      'pulse-ticker-strip',
      'pulse-ticker-viewport',
      'pulse-ticker-shelf',
      'live-head',
      'live-head-stack',
      'live-head-next',
      'live-head-depth-toggle',
      'live-head-depth-setting',
      'header-activity-button',
      'header-activity-line',
      'header-protocol-chip',
      'header-current-protocol',
      'hero-slot',
      'hero-search-form',
      'hero-search-input',
      'hero-search-panel',
      'recruit-section',
      'comparison-summary',
      'widgets-gallery',
      'settings-gear',
      'settings-dropdown',
      'my-tezos-btn',
      'my-tezos-drawer',
      'drawer-close',
      'calc-toggle',
      'calculator-section',
      'share-btn',
      'changelog-btn',
      'changelog-modal',
      'history-copy-link',
      'governance-alert-strip',
      'build-version'
    ];

    for (const id of requiredIds) {
      if (!index.includes(`id="${id}"`)) fail(`index.html missing required QA selector #${id}`);
    }
    pass(`required QA selectors checked: ${requiredIds.length}`);

    const requiredSnippets = [
      ['feature launcher grouped menu', 'class="settings-dropdown feature-launcher"'],
      ['expanded My Tezos header action', 'class="glass-button header-nav-btn header-primary-action"'],
      ['My Tezos emoji and text label', '<span class="my-tezos-icon">👤</span> <span class="nav-label">My Tezos</span>'],
      ['feature launcher decorative map icon', '<span aria-hidden="true">🗺️</span> <span class="nav-label">Explore</span>'],
      ['header Setup action', '<span aria-hidden="true">⚙️</span> <span class="nav-label">Setup</span>'],
      ['feature launcher Explore title', 'class="feature-launcher-intro-copy"'],
      ['feature launcher progressive-disclosure copy', 'Start with a live room, then open a category when you need more.'],
      ['feature launcher starter group', '<div class="dropdown-section-label">Start here</div>'],
      ['feature launcher disclosure groups', 'class="feature-launcher-group feature-launcher-disclosure"'],
      ['feature launcher disclosure grid', 'class="feature-launcher-disclosure-grid"'],
      ['feature launcher explicit close control', 'data-dropdown-close aria-label="Close Explore"'],
      ['feature launcher Tezos Domains row', 'id="domains-feature-link"'],
      ['feature launcher legacy group', 'feature-launcher-group feature-launcher-disclosure feature-launcher-legacy'],
      ['combined chambers launcher copy link', 'data-copy-hash="#chambers"'],
      ['direct feature copy links', 'data-copy-hash="#compare"'],
      ['widget embed utility panel', 'class="widget-utility-panel"'],
      ['widget embed utility hidden by default', 'class="stats-section widget-utility-section toggleable-section"'],
      ['widget builder CTA', 'href="/widgets/builder.html"'],
      ['share picker styles hook', 'section-picker-note'],
      ['price bar change surface', 'class="price-change"'],
      ['price bar 7-day change surface', 'data-price-change="7d"'],
      ['price bar 30-day change surface', 'data-price-change="30d"'],
      ['price bar cycle health launcher', 'class="cycle-chip" id="cycle-chip" href="#health"'],
      ['Tezos Handoff navigation hook', 'data-site-handoff data-site-context="home"'],
      ['Separate Tezos footer hook', 'data-site-footer data-site-context="home"'],
      ['Separate Tezos footer styling hook', 'class="footer site-footer-separate"'],
      ['Tezos Handoff attribution hook', 'data-site-footer-attribution'],
      ['Tezos Handoff title', 'Follow a question, not a menu.', siteHandoffSource],
      ['Tezos Handoff question field', 'class="site-handoff-question-field"', siteHandoffSource],
      ['Tezos Handoff complete map disclosure', 'Open the complete map · ${totalDestinations} destinations', siteHandoffSource],
      ['Tezos Handoff human question route', 'What’s being built?', siteHandoffSource],
      ['Tezos Handoff hospitable invitation', 'Stay awhile. When one of these feels like yours, follow it.', siteHandoffSource],
      ['Tezos Handoff topical signal hook', "window.addEventListener('hot-signal-rendered', applySignal)", siteHandoffSource],
      ['Live Head search placeholder', 'placeholder="Search Tezos"'],
      ['timeline share fallback host', 'document.querySelector(\'.upgrade-badges\')'],
      ['timeline share protocol history chamber fallback', 'document.querySelector(\'#protocol-history-chamber-modal .protocol-history-feature-panel\')'],
      ['header protocol chip', 'id="header-protocol-chip" href="#protocol-history"'],
      ['Live Head combined shell', 'class="live-head-panel lb-panel" id="live-head"'],
      ['hero command bar slot', 'class="hero-slot" id="hero-slot"'],
      ['hero command bar combobox', 'aria-controls="hero-search-panel"'],
      ['Governance alert strip shell', 'class="stats-section governance-alert-section"'],
      ['History modal direct link copy button', 'id="history-copy-link"'],
      ['Governance SEO nonblank voting fallback', 'data-live="voting-period">Checking TzKT', governanceLanding],
      ['Governance SEO source freshness note', 'data-live="governance-freshness"', governanceLanding],
      ['Governance SEO retry fallback', 'Live governance status is retrying', landingLiveData],
      ['Governance SEO checked-at freshness helper', 'function checkedAtLabel', landingLiveData]
    ];

    for (const [label, snippet, source] of requiredSnippets) {
      const text = source || `${index}\n${shareSnippetSource}`;
      if (!text.includes(snippet)) {
        fail(`missing selector contract: ${label}`);
      }
    }
    pass(`new UX selector contracts checked: ${requiredSnippets.length}`);

    if (index.includes('return-greeting')) {
      fail('the header must not restore the personalized return greeting beside My Tezos');
    }

    if (index.includes('Start from anything.') || index.includes('data-loop-aura')) {
      fail('dashboard footer must not restore the retired search-recipe console');
    }

    const uptimeClusterStart = index.indexOf('<div class="top-uptime-cluster">');
    const milestonePopoverIndex = index.indexOf('<span class="top-continuity-milestone-popover"', uptimeClusterStart);
    const milestoneOutlineIndex = index.indexOf('<span class="top-continuity-milestone-outline"', uptimeClusterStart);
    const milestoneNewIndex = index.indexOf('<span class="top-continuity-milestone-new"', milestoneOutlineIndex);
    const milestoneCloseIndex = index.indexOf('<button class="top-continuity-milestone-close"', uptimeClusterStart);
    const milestoneLinkIndex = index.indexOf('<a class="top-continuity-milestone-link"', uptimeClusterStart);
    const uptimeYearIndex = index.indexOf('<button class="top-continuity-history"', uptimeClusterStart);
    const uptimeCounterIndex = index.indexOf('id="hero-chain-uptime-counter"', uptimeYearIndex);
    const uptimeClaimIndex = index.indexOf('class="top-continuity-claim"', uptimeCounterIndex);
    if (
      uptimeClusterStart < 0
      || uptimeYearIndex < uptimeClusterStart
      || uptimeCounterIndex < uptimeYearIndex
      || milestoneOutlineIndex < uptimeCounterIndex
      || milestoneNewIndex < milestoneOutlineIndex
      || !index.includes('<span class="top-continuity-milestone-outline" aria-hidden="true" hidden></span>\n                                        <span class="top-continuity-milestone-new" aria-hidden="true">New</span>')
      || uptimeClaimIndex < milestoneNewIndex
      || milestonePopoverIndex < uptimeClaimIndex
      || milestoneCloseIndex < milestonePopoverIndex
      || milestoneLinkIndex < milestonePopoverIndex
    ) {
      fail('header milestone clean outline must wrap the uptime counter, attach its NEW marker, and keep its closeable disclosure anchored after the clock');
    }
    if (index.includes('top-continuity-milestone-orbit') || index.includes('top-continuity-milestone-eclipse')) {
      fail('header milestone clean outline must not restore the retired chronograph or ellipse');
    }
    const brandStackStart = index.indexOf('<div class="header-brand-stack">');
    const titleRowIndex = index.indexOf('<div class="header-title-row"', brandStackStart);
    const continuityRowIndex = index.indexOf('<div class="top-continuity-row">', titleRowIndex);
    const liveHeadIndex = index.indexOf('id="live-head"');
    const activityButtonIndex = index.indexOf('id="header-activity-button"');
    const liveHeadFilterIndex = index.indexOf('id="live-head-filter-toggle"', liveHeadIndex);
    if (brandStackStart < 0 || titleRowIndex < brandStackStart || continuityRowIndex < titleRowIndex || uptimeClusterStart < continuityRowIndex) {
      fail('header must keep title first, then mainnet age in the lower continuity row');
    }
    if (liveHeadIndex < 0 || activityButtonIndex < liveHeadIndex || liveHeadFilterIndex < activityButtonIndex) {
      fail('trailing-hour activity must move into the Live Head right rail immediately before its activity setup control');
    }
    if (index.includes('Syncing 1H activity')) {
      fail('header first paint must not expose the retired one-hour activity loading sentence');
    }
    const initialActivityEnd = index.indexOf('</button>', activityButtonIndex);
    const initialActivityMarkup = index.slice(activityButtonIndex, initialActivityEnd);
    if (!initialActivityMarkup.includes('header-activity-cluster is-loading')
        || !initialActivityMarkup.includes('>1H Activity</span>')
        || !['tx', 'moved', 'nft', 'whale'].every((slot) => initialActivityMarkup.includes(`data-usage-slot="${slot}"`))) {
      fail('header first paint must reserve the final one-hour metric cluster before JavaScript runs');
    }
    if (!networkHealth.includes('>1H Activity</span>${segments}')) {
      fail('live Network Health refresh must preserve the descriptive 1H Activity header label');
    }

    const chambersLauncherIndex = index.indexOf('id="chambers-toggle"');
    const pulseLauncherIndex = index.indexOf('id="tezos-stats-toggle"');
    const stakingLauncherIndex = index.indexOf('id="staking-chamber-feature-link"');
    const maxisLauncherIndex = index.indexOf('id="maxis-feature-link"');
    const ctezLauncherIndex = index.indexOf('id="ctez-feature-btn"');
    const legacyLauncherIndex = index.indexOf('feature-launcher-group feature-launcher-disclosure feature-launcher-legacy');
    if (chambersLauncherIndex < 0 || ctezLauncherIndex < 0 || chambersLauncherIndex > ctezLauncherIndex) {
      fail('Explore launcher must keep Chambers ahead of ctez recovery tools');
    }
    if (![chambersLauncherIndex, pulseLauncherIndex, stakingLauncherIndex, maxisLauncherIndex].every((position) => position >= 0)
        || !(chambersLauncherIndex < pulseLauncherIndex && pulseLauncherIndex < stakingLauncherIndex && stakingLauncherIndex < maxisLauncherIndex)) {
      fail('Explore starter order must be Chambers, Network Pulse, Staking Chamber, then Tezos Maxis');
    }
    if (legacyLauncherIndex < 0 || ctezLauncherIndex < 0 || legacyLauncherIndex > ctezLauncherIndex) {
      fail('Explore launcher ctez recovery tools must stay inside the legacy group');
    }

    const promotedStarterIds = [...index.matchAll(/data-site-map-starter="([^"]+)"/g)].map((match) => match[1]);
    if (JSON.stringify(promotedStarterIds) !== JSON.stringify(['pulse', 'staking-chamber', 'maxis'])) {
      fail(`Explore promoted starter set drifted: ${promotedStarterIds.join(', ')}`);
    }
    const canonicalStarterIds = new Set(siteMapStarters().map((entry) => entry.id));
    if (promotedStarterIds.some((id) => !canonicalStarterIds.has(id))) {
      fail('Explore promoted rows must come from the canonical site-map starter set');
    }

    for (const retiredSnippet of ['feature-live-crumb', 'explore-chambers-live', 'my-tezos-feature-btn']) {
      if (index.includes(retiredSnippet)) fail(`Explore launcher contains retired duplicate surface: ${retiredSnippet}`);
    }
    pass('Explore launcher hierarchy checked');

    const retiredLauncherSnippets = [
      ['individual Chamber launcher', 'id="chamber-toggle"'],
      ['individual LB launcher', 'id="liquidity-baking-toggle"'],
      ['individual tz4 launcher', 'id="tz4-adoption-toggle"'],
      ['individual tz4 launcher copy link', 'feature-copy-link" type="button" data-copy-hash="#tz4"']
    ];
    for (const [label, snippet] of retiredLauncherSnippets) {
      if (index.includes(snippet)) fail(`retired launcher still present: ${label}`);
    }
    pass(`retired chamber launcher contracts checked: ${retiredLauncherSnippets.length}`);

    const app = await readText('js/core/app.js');
    const siteMap = await readText('js/core/site-map.js');
    const siteHandoff = await readText('js/core/site-handoff.js');
    const siteNav = await readText('js/landing/site-nav.js');
    const search = await readText('js/features/search.js');
    const heroSearchCss = await readText('css/hero-search.css');
    const siteMapCss = await readText('css/site-map.css');
    const shellExtrasCss = await readText('css/shell-extras.css');
    const loadingCss = await readText('css/loading.css');
    const henModeCss = (await readText('css/hen-mode.css')) + (await readText('css/hen-feed.css'));
    const henMode = await readText('js/features/hen-mode.js');
    const henInit = await readText('js/core/hen-init.js');
    const henPage = await readText('hen/index.html');
    const objkt = await readText('js/features/objkt.js');
      const chamber = await readText('js/features/chamber.js');
      const lb = await readText('js/features/liquidity-baking.js');
      const api = await readText('js/core/api.js');
      const tezlink = await readText('js/features/tezlink.js');
    const etherlinkGovernance = await readText('js/features/etherlink-governance.js');
    const etherlinkGovernanceContracts = await readText('js/core/etherlink-governance-contracts.mjs');
    const tz4 = await readText('js/features/tz4-adoption.js');
    const ctez = await readText('js/features/ctez.js');
    const ledgerFlow = await readText('js/features/ledger-flow.js');
    const ledgerFlowModel = await readText('js/features/ledger-flow-model.mjs');
    const tezosDomains = await readText('js/features/tezos-domains.js');
    const maxis = await readText('js/features/maxis.js');
    const chamberAccessibility = await readText('js/ui/chamber-accessibility.js');
    const overlayStack = await readText('js/ui/overlay-stack.js');
    const wallet = await readText('js/core/wallet.js');
    const health = await readText('js/features/network-health.js');
    const octezVersions = await readText('js/core/octez-versions.js');
    const networkPulse = await readText('js/features/network-pulse.js');
    const history = await readText('js/features/history.js');
    const nativeExplorer = await readText('js/features/native-explorer.js');
    const share = (await Promise.all(['js/ui/share.js', 'js/ui/share-renderer.js', 'js/ui/share-state.js'].map(readText))).join('\n');
    const moments = await readText('js/features/moments.js');
    const streak = await readText('js/features/streak.js');
    const toastQueue = await readText('js/ui/toast-queue.js');
    const governanceAlerts = await readText('js/features/governance-alerts.js');
    const leaderboard = await readText('js/features/leaderboard.js');
    const myTezos = await readText('js/features/my-tezos.js');
    const myBaker = await readText('js/features/my-baker.js');
    const softwareModel = vm.runInNewContext(`${octezVersions.slice(
      octezVersions.indexOf('export function normalizeBakerSoftware('),
      octezVersions.indexOf('function startOctezVersionsRequest(')
    ).replace(/^export /gm, '')}; ({ normalizeBakerSoftware, classifyOctezVersion, buildOctezVersions })`);
    const oldSoftwareDate = '2026-01-01T00:00:00Z';
    const bakerVersionTime = new Date(Date.now() - 3 * 86400000).toISOString();
    const bakerSoftwareReceipt = { address: 'qa-baker', bakingPower: 10, software: { version: 'v25.1', date: oldSoftwareDate }, softwareUpdateTime: bakerVersionTime };
    assert.equal(softwareModel.normalizeBakerSoftware(bakerSoftwareReceipt).firstUsedAt, bakerVersionTime);
    for (const softwareUpdateTime of [undefined, null, '', 'invalid', new Date(Date.now() + 86400000).toISOString()]) {
      assert.equal(softwareModel.normalizeBakerSoftware({ ...bakerSoftwareReceipt, softwareUpdateTime }).firstUsedAt, null,
        'Missing/invalid baker-specific dates must never fall back to the software catalog date');
    }
    assert.equal(softwareModel.buildOctezVersions([bakerSoftwareReceipt]).freshestDate, bakerVersionTime);
    assert.equal(softwareModel.buildOctezVersions([{ ...bakerSoftwareReceipt, softwareUpdateTime: null }]).freshestDate, null);
    assert(octezVersions.includes("const fields = 'address,alias,bakingPower,software,softwareUpdateTime'"));
    assert(health.includes('Latest version change') && !health.includes('Freshest report'));
    const summarizeSoftware = vm.runInNewContext(`${myTezos.slice(
      myTezos.indexOf('function summarizeOctezSoftware('), myTezos.indexOf('async function fetchBakerOctezSoftware(')
    )}; summarizeOctezSoftware`, { ...softwareModel, relativeTime: (date) => date });
    assert(summarizeSoftware(bakerSoftwareReceipt, 'v25.2').detail.includes(bakerVersionTime));
    assert(!summarizeSoftware(bakerSoftwareReceipt, 'v25.2').detail.includes(oldSoftwareDate));
    assert(summarizeSoftware({ ...bakerSoftwareReceipt, softwareUpdateTime: null }, 'v25.2').detail.includes('time unavailable'));
    const softwareTooltip = vm.runInNewContext(`${myBaker.slice(
      myBaker.indexOf('function octezVersionTooltip('), myBaker.indexOf('/**\n * Resolve Tezos Domains name')
    )}; octezVersionTooltip`, softwareModel);
    assert(softwareTooltip(bakerSoftwareReceipt).includes(new Date(bakerVersionTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })));
    assert(softwareTooltip({ ...bakerSoftwareReceipt, softwareUpdateTime: null }).includes('time unavailable'));
    let currentSoftwareReceipt = bakerSoftwareReceipt;
    let softwareReads = 0;
    const readSoftware = vm.runInNewContext(`${myTezos.slice(
      myTezos.indexOf('async function fetchBakerOctezSoftware('), myTezos.indexOf('function rightsUrl(')
    )}; fetchBakerOctezSoftware`, {
      TZKT: 'https://api.tzkt.io/v1', _lastGoodOctezSoftware: new Map(), summarizeOctezSoftware: summarizeSoftware,
      fetchOctezVersions: async () => ({ latestVersion: 'v25.2' }),
      fetchJsonWithTimeout: async () => { softwareReads++; return currentSoftwareReceipt; }
    });
    assert.equal((await readSoftware('qa-baker')).version, 'v25.1');
    currentSoftwareReceipt = { ...bakerSoftwareReceipt, software: { ...bakerSoftwareReceipt.software, version: 'v25.2' } };
    assert.equal((await readSoftware('qa-baker')).version, 'v25.2', 'A new operator read must not reuse a cached software version');
    currentSoftwareReceipt = null;
    const failedSoftwareRead = await readSoftware('qa-baker');
    assert.equal(failedSoftwareRead.version, 'v25.2');
    assert(failedSoftwareRead.detail.includes('refresh unavailable'));
    assert.equal((await readSoftware('another-baker')).version, 'Unknown', 'Last-good software must remain scoped to its baker');
    assert.equal(softwareReads, 4);
    const siteJourney = await readText('js/core/site-journey.js');
    const comparison = await readText('js/features/comparison.js');
    const compareIndex = await readText('compare/index.html');
    const chamberRoutes = await readText('scripts/lib/chamber-routes.mjs');
    const chamberRouteGenerator = await readText('scripts/generate-chamber-routes.mjs');
    const themeUi = await readText('js/ui/theme.js');
    const styles = await readText('css/styles.css');
    const networkHealthCss = await readText('css/network-health.css');
    const healthStyles = `${styles}\n${networkHealthCss}`;
    const leaderboardCss = await readText('css/leaderboard.css');
    const networkPulseCss = await readText('css/network-pulse.css');
    const stakingChamber = await readText('js/features/staking-chamber.js');
    const stakingChamberCss = await readText('css/staking-chamber.css');
    const ledgerFlowCss = await readText('css/ledger-flow.css');
    const maxisCss = await readText('css/maxis.css');
    const tezosDomainsCss = await readText('css/tezos-domains.css');
    if (app.includes('updateReturnGreeting') || styles.includes('.return-greeting')) {
      fail('the retired personalized return greeting must not leave renderer or style code behind');
    }
    if (/TEZOS_LOOP_STORAGE_KEY|initTezosLoopConsole|initSiteFooterMap/.test(app)) {
      fail('app.js must not retain the retired loop-console or duplicate dashboard footer renderers');
    }
    const deepLinkContracts = [
      ['Chamber hash route', "hash === 'chamber'", app],
      ['Chambers hash route', "hash === 'chambers'", app],
      ['Tezos X Governance hash route', "hash === 'l2chamber'", app],
      ['Tezos X hash route', "hash === 'tezosx'", app],
      ['Legacy Tezlink hash route', "hash === 'tezlink'", app],
      ['Network Pulse hash route', "hash === 'pulse'", app],
      ['Health hash route', "hash === 'health'", app],
      ['Ledger Flow hash route', "hash === 'ledger-flow'", app],
      ['Ledger Flow scoped hash route', "params.has('ledger-flow')", app],
      ['Ledger Flow modal cleanup', 'closeLedgerFlowChamber', await readText('js/core/chamber-features.mjs')],
      ['Domains hash route', "hash === 'domains'", app],
      ['Domains legacy hash route', "hash === 'tezos-domains'", app],
      ['Domains modal cleanup', 'closeTezosDomainsChamber', await readText('js/core/chamber-features.mjs')],
      ['Protocol history legacy hash route', "params.get('protocol')", app],
      ['Protocol History Chamber hash route', "hash === 'protocol-history'", app],
      ['Protocol history global opener', 'window.openProtocolHistoryByName = openProtocolHistoryByName', app],
      ['Protocol History Chamber global opener', 'window.openProtocolHistoryChamber = openProtocolHistoryChamber', app],
      ['Protocol History header launcher', 'function initProtocolHistoryHeaderLauncher', app],
      ['Protocol History chamber current-first timeline', 'const displayProtocols = isHistoryChamber ? [...protocols].reverse() : protocols', app],
      ['Protocol History Chamber card', "card.id = 'protocol-history-entry-card'", app],
      ['Protocol Anthology card copy', 'Protocol Anthology', app],
      ['Protocol Anthology pretty route map', "href: '/anthology/'", siteMap],
      ['Protocol Anthology crawlable route source', "slug: 'anthology'", chamberRoutes],
      ['Protocol Anthology card anatomy', 'protocol-history-entry-anthology', app],
      ['Protocol Anthology recent spines', 'protocol-history-entry-spine-item', app],
      ['Protocol Anthology library host', 'protocol-history-anthology-board', app],
      ['Protocol Anthology real-data renderer', 'function renderProtocolAnthologyBoard', app],
      ['Protocol Anthology protocol page links', 'protocolStoryPath(protocol)', app],
      ['Protocol Anthology searchable index', 'protocol-anthology-search', app],
      ['Protocol Anthology filter controls', 'data-anthology-filter', app],
      ['Protocol Anthology chapter list styles', '.protocol-anthology-chapter', await readText('css/protocol-anthology.css')],
      ['Protocol Anthology reader styles', '.protocol-story-article', await readText('css/protocol-anthology.css')],
      ['Protocol Anthology timeline crowd styles', '.contention-crowd', heroSearchCss],
      ['Protocol History Chamber modal', "overlay.id = 'protocol-history-chamber-modal'", app],
      ['Protocol History Chamber technical disclosure', 'protocol-anthology-tools', app],
      ['Protocol History chapter pretty route', '/anthology/${encodeURIComponent(slug)}/', app],
      ['Protocol search opens canonical Anthology chapter URLs', '/anthology/${encodeURIComponent(slug)}/', search],
      ['Protocol History stable read button', 'history-expand-btn', app],
      ['Protocol History copy-link action', 'history-modal-copy-link', app],
      ['Protocol History native-share action', 'history-modal-native-share', app],
      ['Protocol History image action', 'history-modal-share', app],
      ['Protocol History print button', 'history-modal-print', app],
      ['Protocol History print helper', 'function printProtocolHistory', app],
      ['Protocol History Chamber reveal helper', 'function revealProtocolHistorySection', app],
      ['shared Chamber launcher article semantics', "card.setAttribute('role', 'article')", chamberAccessibility],
      ['shared Chamber native Open action', "cue.tagName !== 'BUTTON'", chamberAccessibility],
      ['shared Chamber title normalization', "title.classList.add('chamber-entry-title')", chamberAccessibility],
      ['shared Chamber full-card launcher', "card.dataset.chamberSurfaceWired !== '1'", chamberAccessibility],
      ['shared Chamber nested control exclusion', 'target.closest(CHAMBER_INTERACTIVE_SELECTOR)', chamberAccessibility],
      ['shared Chamber close controls stay unframed', '.chamber-close {\n    background: transparent !important;\n    border: 0 !important;\n    box-shadow: none !important;\n    outline: 0 !important;\n}', styles],
      ['shared Chamber close focus stays on the X', '.chamber-close:is(:hover, :focus-visible)', styles],
      ['shared overlay focus trap', "event.key !== 'Tab'", overlayStack],
      ['shared overlay topmost Escape close', "event.key === 'Escape'", overlayStack],
      ['shared overlay opener restoration', 'state.opener.isConnected', overlayStack],
      ['shared overlay background isolation', "element.setAttribute('inert', '')", overlayStack],
      ['shared overlay nested orphan prevention', "reason: 'parent-close'", overlayStack],
      ['shared overlay raw-removal recovery', 'new MutationObserver', overlayStack],
      ['shared overlay exception-safe child close', 'tezos:overlay-close-error', overlayStack],
      ['shared overlay legacy-state reconciliation', 'reconcileOverlayEnvironment', overlayStack],
      ['Chambers use the shared overlay stack', 'activateOverlayDialog(overlay', chamberAccessibility],
      ['Share uses the shared overlay stack', 'activateOverlayDialog(modal', share],
      ['Share mobile save fallback uses the shared overlay stack', 'activateOverlayDialog(overlay', share],
      ['Share dialog owns its accessible title', 'aria-labelledby="share-modal-title"', share],
      ['Protocol Stories use the shared overlay stack', 'activateOverlayDialog(modal', app],
      ['Protocol History Chamber delegates scroll ownership', 'lockScroll: true', app],
      ['Protocol Stories clear direct route state', 'clearDirectStoryRoute', app],
      ['Protocol Stories expose an accessible title', 'aria-labelledby="protocol-history-story-title"', app],
      ['card history uses the shared overlay stack', 'close: () => closeCardHistoryModal(modal)', history],
      ['card history owns its accessible title', 'aria-labelledby="card-history-title"', history],
      ['Native Explorer uses the shared overlay stack', 'activateOverlayDialog(overlay', nativeExplorer],
      ['Native Explorer provides direct-route focus fallback', "restoreFocusSelector: '#hero-search-input, #features-gear'", nativeExplorer],
      ['Protocol Anthology accessible launcher', 'wireChamberLauncher(card', app],
      ['Network Pulse accessible launcher', 'wireChamberLauncher(card', networkPulse],
      ['Tezos L1 Governance accessible launcher', 'wireChamberLauncher(card', chamber],
      ['Liquidity Baking accessible launcher', 'wireChamberLauncher(card', lb],
      ['Staking accessible launcher', 'wireChamberLauncher(card', stakingChamber],
      ['Tezos X accessible launcher and dialog', 'activateChamberDialog(overlay', tezlink],
      ['Tezos X Governance accessible launcher and dialog', 'activateChamberDialog(overlay', etherlinkGovernance],
      ['tz4 accessible launcher and dialog', 'activateChamberDialog(overlay', tz4],
      ['Ledger Flow accessible launcher and dialog', 'activateChamberDialog(overlay', ledgerFlow],
      ['Tezos Domains accessible launcher and dialog', 'activateChamberDialog(overlay', tezosDomains],
      ['Network Health accessible launcher', 'wireChamberLauncher(card', health],
      ['Tezos Maxis accessible launcher', 'wireChamberLauncher(card', maxis],
      ['Staking uses the shared plain Chamber label', '<h2 class="stat-label">Staking Chamber</h2>', stakingChamber],
      ['Staking compact Chamber label size', 'font-size: 0.75rem;', stakingChamberCss],
      ['Maxis compact Chamber label override', '#chambers-grid .maxis-entry-season-title.chamber-entry-title', maxisCss],
      ['Maxis launcher crown-holder names', 'maxis-entry-identity-leader', maxis],
      ['Maxis launcher crown-holder styles', '.maxis-entry-identity-leader', maxisCss],
      ['Maxis launcher protocol-season leaders', 'maxis-entry-season-crowns', maxis],
      ['Maxis launcher protocol-season leader styles', '.maxis-entry-season-crowns', maxisCss],
      ['Protocol History Chamber timeline toggle target', 'protocol-timeline-toggle-btn', app],
      ['Protocol History Chamber action styles', '.protocol-history-chamber-action', heroSearchCss],
      ['Hero search mode body class', "document.body.classList.toggle('hero-search-mode'", search],
      ['Hero search attaches the composed index room to Live Head', '.live-head-panel .hero-search-panel', heroSearchCss],
      ['Hero search uses a bounded empty starter menu', 'MISSION_STARTERS', search],
      ['Hero search defines six semantic Index Loom paths', 'INDEX_LOOM_ROUTES', search],
      ['Hero search renders the idle Index Loom', 'function indexLoomHtml', search],
      ['Index Loom renders cross-branch weave paths', 'class="hero-search-index-weave"', search],
      ['Index Loom draws from live node geometry', 'const drawIndexLoomWeave', search],
      ['Hero search explains typed results with a Loom path', 'function indexLoomBreadcrumbHtml', search],
      ['Hero search Loom breadcrumbs link to related chambers', 'href="${escapeHtml(route.href)}"', search],
      ['Hero search recovers unmatched queries through the Loom', 'function indexLoomRecoveryHtml', search],
      ['Hero search Loom nodes seed real queries', 'data-hero-loom-query', search],
      ['Hero search renders a state-aware index threshold', 'function searchPanelHeaderHtml', search],
      ['Hero search index threshold has chamber-level anatomy', '.live-head-panel .hero-search-panel-head', heroSearchCss],
      ['Hero search starters use a curated responsive card grid', '.live-head-panel .hero-search-group.is-starter', heroSearchCss],
      ['Hero search offers a real clipboard hash action', "result.action === 'paste'", search],
      ['Hero search imports ranked site map search', 'searchSiteMap', search],
      ['Hero search derives starter rows from site map', 'siteMapStarters', search],
      ['Hero search derives quick chips from site map', 'siteMapSearchChips', search],
      ['Hero search uses canonical site-map routes', 'siteMapRoute', search],
      ['Hero search root hash page normalization', 'const rootHashEntry', search],
      ['Site map manifest exports groups', 'SITE_MAP_NAV_GROUPS', siteMap],
      ['Site map manifest includes anthology route', "href: '/anthology/'", siteMap],
      ['Site map manifest includes Network Pulse route', "href: '/pulse/'", siteMap],
      ['Landing pages share site nav renderer', 'function renderFooter()', siteNav],
      ['Shared Handoff renderer', 'function renderSiteHandoff', siteHandoff],
      ['Shared Handoff stable question catalog', "{ id: 'now', prompt: 'What now?', label: 'Network Pulse', entryId: 'pulse' }", siteHandoff],
      ['Shared Handoff quiet satellite catalog', "{ id: 'health', prompt: 'Is the chain healthy?', label: 'Network Health', entryId: 'health', tier: 'satellite' }", siteHandoff],
      ['Shared Handoff satellite hierarchy hook', "question.tier === 'satellite' ? 'is-satellite' : 'is-anchor'", siteHandoff],
      ['Shared Handoff contextual question emphasis', 'function contextualQuestionId', siteHandoff],
      ['Shared Handoff canonical semantic relations', 'SITE_MAP_RELATIONS', siteHandoff],
      ['Shared Handoff coordinated constellation state', 'container.dataset.siteHandoffConstellation = nextId', siteHandoff],
      ['Shared Handoff near and far relationship state', 'link.dataset.handoffRelation = relation', siteHandoff],
      ['Shared Handoff directory uses canonical groups', 'SITE_MAP_NAV_GROUPS.map', siteHandoff],
      ['Shared Handoff desktop question field styles', '.site-handoff-question-field', siteMapCss],
      ['Shared Handoff event-bound signal settle', '@keyframes site-handoff-signal-settle', siteMapCss],
      ['Shared Handoff signal settle applies only to arriving inner content', '.site-handoff-question.is-signal-arriving > span', siteMapCss],
      ['Shared Handoff visible destination cue', 'content: " ↗";', siteMapCss],
      ['Shared Handoff quiet satellite typography', '.site-handoff-question.is-satellite', siteMapCss],
      ['Shared Handoff reduced-motion breath removal', 'scale: none;', siteMapCss],
      ['Shared Handoff mobile question composition', 'grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);', siteMapCss],
      ['Shared Handoff mobile readable UI typography', 'font-family: var(--font-ui, system-ui', siteMapCss],
      ['Hero search runtime-only quick chips', 'RUNTIME_QUICK_CHIPS', search],
      ['Hero search runtime-only commands', 'RUNTIME_COMMANDS', search],
      ['Hero search complete browse index', 'siteMapBrowseEntries', search],
      ['Hero search complete nested view index', 'siteMapBrowseIntents', search],
      ['Hero search manifest subfeature intents', 'searchSiteMapIntents', search],
      ['Hero search explicit mobile close', 'id="hero-search-close"', index],
      ['Hero search runtime changelog command', "title: '/changelog'", search],
      ['Hero search runtime export command', "title: '/export'", search],
      ['Hero search uses the shared overlay accessibility stack', 'activateOverlayDialog(overlay', search],
      ['Hero search precreates an instant full-screen Index Chamber', "overlay.id = 'hero-search-overlay'", search],
      ['Hero search moves the same search root into its Chamber', 'chamber.appendChild(root)', search],
      ['Hero search restores its original DOM position', 'restoreSearchRoot', search],
      ['Hero search follows the complete visual viewport', '--hero-search-vv-height', heroSearchCss],
      ['Hero search overlay is a fixed full-screen room', '.hero-search-overlay.live-head-panel', heroSearchCss],
      ['Hero search Loom uses an unboxed six-path desktop grid', '.hero-search-index-routes', heroSearchCss],
      ['Hero search typed result sheet reaches the Chamber floor', '.hero-search-sheet:is(.is-results, .is-empty)', heroSearchCss],
      ['Hero search mobile Loom keeps two discovery columns', 'grid-template-columns: repeat(2, minmax(0, 1fr));', heroSearchCss],
      ['Hero search keeps two starter columns on the narrowest supported screen', '@media (max-width: 359px)', heroSearchCss],
      ['Hero search hides shortcut chips outside HEN presentation', '.live-head-panel .hero-search-chips', heroSearchCss],
      ['Top continuity mobile explainer reserves flow', '.top-continuity-explain.is-visible', shellExtrasCss],
      ['Hero search .tez scoped Domains route', '#domains=${encodeURIComponent(domain)}', search],
      ['Hero search Ledger Flow command', 'Ledger Flow', search],
      ['Hero search Ledger Flow scoped account route', '#ledger-flow=${encodeURIComponent(address)}', search],
      ['Hero search KT1 starter route', "['kt1', 'KT1 Contracts']", search],
      ['Hero search grouped visual order normalization', 'groupOrderedResults', search],
      ['Hero search Maxi Passport intent route', '/maxis/?view=passport', siteMap],
      ['Hero search Maxis Season intent route', '/maxis/?view=season', siteMap],
      ['Hero search address-scoped Maxi Passport route', 'view=passport&address=${encodeURIComponent(target)}', search],
      ['Hero search explicit full-directory mode', 'data-hero-browse-all="true"', search],
      ['Standalone footer progressive disclosure', 'class="site-map-disclosure"', siteHandoff],
      ['Hero search manifest page result adapter', 'function siteMapResult', search],
      ['LB tile hash route', "hash === 'lb-tile'", app],
      ['tz4 hash route', "hash === 'tz4'", app],
      ['comparison summary renderer', 'function renderComparisonSummary', comparison],
      ['comparison summary standing copy', 'Self-upgrading baseline', comparison],
      ['comparison summary grid', 'comparison-standing-grid comparison-grid', comparison],
      ['comparison hub standing summary', 'Where the major proof-of-stake chains stand', compareIndex],
      ['comparison hub all peer links', '/compare/tezos-vs-algorand.html', compareIndex],
      ['Chambers launcher button', 'id="chambers-toggle"', index],
      ['Chambers launcher copy link', 'data-copy-hash="#chambers"', index],
      ['Network Pulse launcher copy link', 'data-copy-hash="#pulse"', index],
      ['Chambers section info button', 'id="chambers-info-btn"', index],
      ['Live Pulse section info button', 'id="hot-today-info-btn"', index],
      ['Shared section explainer wiring', 'function initSectionExplainers()', app],
      ['Explore Tezos section explainer route', "href: '/chambers/'", app],
      ['Live Pulse section explainer route', "href: '/pulse/'", app],
      ['Dedicated section collapse button support', "header.querySelector('[data-section-collapse]')", app],
      ['Collapsed header inline spacing reset', "header.style.marginBottom = '0'", app],
      ['Chambers visibility uses Home layout registry', "setHomeBlockVisible('explore'", app],
      ['Pretty chamber path route map', 'function getPrettyChamberPathRoute()', app],
      ['Pretty chamber route resolves through site map', 'findCurrentSiteMapEntry({', app],
      ['Pretty chamber route uses canonical hash identity', "entry.hash.replace(/^#/, '')", app],
      ['Dashboard uses shared Handoff renderer', 'renderSiteHandoff', app],
      ['Dashboard Handoff hook', 'data-site-handoff data-site-context="home"', index],
      ['Dashboard separate footer hook', 'data-site-footer data-site-context="home"', index],
      ['Dashboard separate footer styles', '.site-footer-separate', siteMapCss],
      ['Dashboard footer canonical map id', "sequence === 1 ? 'site-map'", siteHandoff],
      ['Pretty chamber route generator hydrates dashboard shell', "dashboardShell = await fs.readFile", chamberRouteGenerator],
      ['Network Pulse feature import', 'initNetworkPulseChamber', await readText('js/core/chamber-features.mjs')],
      ['Network Pulse card copy link', 'data-copy-hash="#pulse"', networkPulse],
      ['Network Pulse modal', 'network-pulse-modal', networkPulse],
      ['Network Pulse lazy CSS loader', 'network-pulse-css', networkPulse],
      ['Network Pulse real cache timestamp', 'loadStatsTimestamp', networkPulse],
      ['Network Pulse history data fetch', 'fetchHistoricalData', networkPulse],
      ['Network Pulse shared chamber history data fetch', 'getPulseDomainRows', networkPulse],
      ['Network Pulse Market category', "id: 'market'", networkPulse],
      ['Network Pulse Market source cards', "source: 'market'", networkPulse],
      ['Network Pulse sourced freshness label', 'network-pulse-source-age', networkPulse],
      ['Network Pulse card history modal', 'openCardHistoryModal', networkPulse],
      ['Network Pulse semantic room source', "siteMapJourneyLinks('pulse', { limit: 4 })", networkPulse],
      ['Network Pulse nav buttons avoid hash pollution', 'data-pulse-target', networkPulse],
      ['Network Pulse scrollspy wiring', 'IntersectionObserver', networkPulse],
      ['Network Pulse delta chip markup', 'network-pulse-delta', networkPulse],
      ['Network Pulse entry delta chip', 'network-pulse-entry-delta', networkPulse],
      ['Network Pulse entry cell jumps', 'data-pulse-jump', networkPulse],
      ['Network Pulse entry semantic article', "document.createElement('article')", networkPulse],
      ['Network Pulse explicit open action', 'network-pulse-entry-open', networkPulse],
      ['Network Pulse entry header freshness', 'network-pulse-entry-freshness', networkPulse],
      ['Network Pulse entry history value fallback', 'latestMetricValue(lastEntryHistoryRows, metric.history)', networkPulse],
      ['Network Pulse partial hero merge', "event?.detail?.source === 'hero'", networkPulse],
      ['Network Pulse tiered top mover', "tier: 'structural'", networkPulse],
      ['Network Pulse quiet ballot guard', 'quietWhen: isGovernanceBallotQuiet', networkPulse],
      ['Network Pulse USD delta prefix', "deltaPrefix: '$'", networkPulse],
      ['Network Pulse sparkline markup', 'network-pulse-sparkline', networkPulse],
      ['Network Pulse history button markup', 'data-pulse-history', networkPulse],
      ['Network Pulse card grid CSS', '.network-pulse-card-grid', networkPulseCss],
      ['Network Pulse dense entry cells CSS', '.network-pulse-entry-metric', networkPulseCss],
      ['Network Pulse flex entry header CSS', '.network-pulse-entry-head', networkPulseCss],
      ['Network Pulse hover headline transform guard', 'network-pulse-entry-card:hover .network-pulse-entry-value', networkPulseCss],
      ['Network Pulse entry footer cue alignment', '.network-pulse-entry-card .chamber-entry-footer', networkPulseCss],
      ['Network Pulse explicit open action styles', '.network-pulse-entry-open', networkPulseCss],
      ['Network Pulse entry sparkline CSS', '.network-pulse-entry-sparkline', networkPulseCss],
      ['Network Pulse loading state CSS', '.network-pulse-field.is-loading', networkPulseCss],
      ['Network Pulse scroll-margin CSS', 'scroll-margin-top', networkPulseCss],
      ['Network Pulse active nav CSS', '.network-pulse-nav button.active', networkPulseCss],
      ['Network Pulse mobile nav wraps on phones', 'flex-wrap: wrap', networkPulseCss],
      ['Network Pulse direct footer link', 'Direct: /pulse/', networkPulse],
      ['Network Pulse pretty route', "slug: 'pulse'", chamberRoutes],
      ['Network Pulse chamber category facet', "chamberCategory: 'network'", siteMap],
      ['Network Pulse chamber category target', "pulse: { selector: '#network-pulse-entry-card', layout: 'featured' }", app],
      ['Network Pulse share route', 'siteMapCanonicalRoute', share],
      ['Network Pulse hero stats spread', '...heroStats', app],
      ['Network Pulse hero stats fallback event', "source: 'hero'", app],
      ['Network Pulse delegated hero stat', 'delegatedRatio: staking.delegatedRatio', api],
      ['API request deadline', 'DEFAULT_FETCH_TIMEOUT_MS', api],
      ['API caller abort forwarding', "signal: requestSignal(resource, options)", api],
      ['API Retry-After cap', 'MAX_RETRY_AFTER_MS', api],
      ['API aggregate quality receipt', 'qualityFromSettled', api],
      ['API failed category receipt', 'failedCategories', api],
      ['API unavailable APY receipt', "status: 'unavailable'", api],
      ['Network Pulse XTZ price card history', "'xtz-price'", history],
      ['Network Pulse market cap card history', "'market-cap'", history],
      ['Network Pulse L2 transactions card history', "'l2-transactions'", history],
      ['Staking Chamber feature import', 'initStakingChamber', await readText('js/core/chamber-features.mjs')],
      ['Staking Chamber hash route', "hash === 'staking'", app],
      ['Staking Chamber legacy short hash route', "hash === 'stake'", app],
      ['Staking Chamber pretty route opens without hash redirect', "case 'staking':", app],
      ['Staking Chamber modal cleanup', 'closeStakingChamber', await readText('js/core/chamber-features.mjs')],
      ['Staking Chamber Capital category facet', "id: 'staking-chamber'", siteMap],
      ['Staking Chamber category target', "'staking-chamber': { selector: '#staking-entry-card', layout: 'compact' }", app],
      ['Staking Chamber card copy link', 'data-copy-hash="#staking"', stakingChamber],
      ['Staking Chamber card ratio', 'id="staking-entry-ratio"', stakingChamber],
      ['Staking Chamber two-action tape', "renderEntryMove('stake', data?.stake)}${renderEntryMove('unstake', data?.unstake)", stakingChamber],
      ['Staking Chamber modal', "overlay.id = 'staking-chamber-modal'", stakingChamber],
      ['Staking Chamber canonical current ratio', 'fetchStakingRatio()', stakingChamber],
      ['Staking Chamber 7-day ratio context', "fetchHistoricalData('7d')", stakingChamber],
      ['Staking Chamber strict actual-amount threshold', 'return amountMutez(row) > LARGE_MOVE_THRESHOLD_MUTEZ', stakingChamber],
      ['Staking Chamber applied-operation filter', "params.set('status', 'applied')", stakingChamber],
      ['Staking Chamber cursor archive scan', "params.set('offset.cr', String(cursor))", stakingChamber],
      ['Staking Chamber compact archive select', "'id,timestamp,amount'", stakingChamber],
      ['Staking Chamber visible receipt hydration', "params.set('id.in', ids.join(','))", stakingChamber],
      ['Staking Chamber 24-hour gross and net flow', 'data-staking-flow="net"', stakingChamber],
      ['Staking Chamber mover trail', 'id="staking-mover-panel"', stakingChamber],
      ['Staking Chamber Ledger Flow drilldown', 'href="#ledger-flow=${encodeURIComponent(moverTrail.address)}"', stakingChamber],
      ['Staking Chamber complete-history disclosure', 'All applied moves over 10,000 ꜩ', stakingChamber],
      ['Staking Chamber exact-10K exclusion disclosure', 'Exactly 10,000 ꜩ is excluded.', stakingChamber],
      ['Staking Chamber direct footer link', 'Direct: /stake/', stakingChamber],
      ['Staking Chamber crawlable route source', "slug: 'stake'", chamberRoutes],
      ['Staking Chamber site-map route', "href: '/stake/'", siteMap],
      ['Staking Chamber hero-search manifest source', 'siteMapSearchChips()', search],
      ['Staking Chamber share route', 'siteMapCanonicalRoute', share],
      ['Staking Chamber Capital category membership', "entryIds: Object.freeze(['capital', 'minerals', 'uranium', 'metals', 'whales', 'staking-chamber'])", siteMap],
      ['Staking Chamber category-aware desktop geometry', '#chambers-grid .staking-entry-card', stakingChamberCss],
      ['Chamber info tooltip viewport positioning', 'positionChamberInfoTooltip(button)', app],
      ['Chamber info tooltip bounded height without a lazy room', '--card-tooltip-max-height', shellExtrasCss],
      ['Chamber info tooltip late-layout observer', 'chamberInfoResizeObserver = new ResizeObserver', app],
      ['Staking Chamber mobile operation rows', '.staking-operation-row {', stakingChamberCss],
      ['Chamber card copy link', 'data-copy-hash="#chamber"', chamber],
      ['Tezos L1 Governance card label', 'Tezos L1 Governance', chamber],
      ['Tezos L1 Governance quiet headline', "setEntryHero(heroEl, isQuietProposalPeriod ? 'No Proposal' : '')", chamber],
      ['Tezos L1 Governance quiet period metrics', "label: 'Candidates',\n                        value: 'None'", chamber],
      ['Tezos L1 Governance quiet status', 'No active L1 proposal · refresh 60s', chamber],
      ['Chamber current state panel', 'id="chamber-now-panel"', chamber],
      ['Chamber current state watch list', 'chamber-now-watch', chamber],
      ['Chamber current state styles', '.chamber-now-panel', styles],
      ['Chamber proposal intel panel', 'id="chamber-proposal-intel"', chamber],
      ['Chamber gap analysis panel', 'id="chamber-gap-analysis"', chamber],
      ['Chamber promotion delta uses epoch periods', '(epoch.periods || []).find', chamber],
      ['Chamber branded share capture helper', 'captureBrandedChamberShare', share],
      ['Chamber share direct link baked into image', 'tezos.systems/chamber/', chamber],
      ['Governance alerts reuse voting status', 'fetchVotingStatus', governanceAlerts],
      ['Governance alerts reuse My Tezos vote signal', 'fetchBakerVoteStatus', governanceAlerts],
      ['Governance alerts expose RSS action', 'href="/feed.xml"', governanceAlerts],
      ['Governance alerts browser reminder opt-in', 'Notification.requestPermission', governanceAlerts],
      ['My Tezos exports baker vote check', 'export async function fetchBakerVoteStatus', myTezos],
      ['My Tezos Morning Brief vote card', "title: 'Vote Check'", myTezos],
      ['Tezos X Governance card copy link', 'data-copy-hash="#l2chamber"', etherlinkGovernance],
      ['Tezos X Governance L2 dashboard note', 'L2 Governance · FAST', etherlinkGovernance],
      ['Tezos X Governance direct footer link', 'Direct: /l2chamber/', etherlinkGovernance],
      ['Tezos X Governance chamber wiring', 'openEtherlinkGovernanceChamber', etherlinkGovernance],
      ['Tezos X Governance TzKT discovery', 'discoverGovernanceTracks', etherlinkGovernance],
      ['Tezos X Governance shared reviewed registry', 'ETHERLINK_GOVERNANCE_PRODUCTION_CONTRACTS', etherlinkGovernance],
      ['Tezos X Governance official current Sequencer contract', 'KT1KiVz8ZpHo3HpE1GCP5HLgywPDRwVUkCFh', etherlinkGovernanceContracts],
      ['Tezos X Governance current registry', 'ETHERLINK_GOVERNANCE_CURRENT_CONTRACTS', etherlinkGovernanceContracts],
      ['Tezos X Governance shared configuration classifier', 'classifyEtherlinkGovernanceTrack', etherlinkGovernanceContracts],
      ['Tezos X Governance discovery failure copy', 'contract discovery unavailable', etherlinkGovernance],
      ['Tezos X Governance track rules panel', 'id="etherlink-gov-rules"', etherlinkGovernance],
      ['Tezos X Governance track memory panel', 'id="etherlink-gov-memory"', etherlinkGovernance],
      ['Tezos X Governance merged timeline panel', 'id="etherlink-gov-timeline"', etherlinkGovernance],
      ['Tezos X Governance phase hero', 'id="etherlink-governance-phase-hero"', etherlinkGovernance],
      ['Tezos X Governance current-state panel', 'id="etherlink-governance-now"', etherlinkGovernance],
      ['Tezos X Governance recent baker quorum panel', 'id="etherlink-governance-recent-bakers"', etherlinkGovernance],
      ['Tezos X Governance complete L1 voting-power snapshot', 'fetchAllRows(`${TZKT}/voting/periods/current/voters?select=delegate,votingPower`)', etherlinkGovernance],
      ['Tezos X Governance complete baker receipt ledger', 'fetchAllBigmapKeys(track.promotion.votersPtr', etherlinkGovernance],
      ['Tezos X Governance receipt-level operation provenance', 'fetchReceiptOperations(track, receipts)', etherlinkGovernance],
      ['Tezos X Governance chronological quorum crossing', 'quorum reached here', etherlinkGovernance],
      ['Tezos X Governance voting-key expansion disclosure', 'Voting-key calls are expanded into the represented L1 baker accounts', etherlinkGovernance],
      ['Tezos X Governance background history hydration', 'hydrateHistoricalProposals(data)', etherlinkGovernance],
      ['Tezos X Governance highest-priority hot score', 'score: 260', etherlinkGovernance],
      ['Tezos X Governance historic hot treatment', "spectacle: 'historic'", etherlinkGovernance],
      ['Tezos X Governance breaking hot treatment', 'breaking: true', etherlinkGovernance],
      ['Tezos X Governance two-gate Promotion verdict', "headline: 'CANNOT PASS'", etherlinkGovernance],
      ['Tezos X Governance maximum possible supermajority', 'maximumPromotionSupermajority', etherlinkGovernance],
      ['Tezos X Governance visible quorum and Yea gates', 'class="etherlink-gov-entry-gates"', etherlinkGovernance],
      ['Tezos X Governance hydrates its launcher class', "card.classList.add('etherlink-governance-entry-card')", etherlinkGovernance],
      ['Tezos X Governance official docs path', 'How L2 governance works', etherlinkGovernance],
      ['Tezos X card copy link', 'data-copy-hash="#tezosx"', tezlink],
      ['Tezos X direct footer link', 'Direct: /tezosx/', tezlink],
      ['Tezos X 30d trend panel', 'id="tezlink-trend-panel"', tezlink],
      ['Tezos X 30d trend fallback copy', 'formatDirectionDelta', tezlink],
      ['Tezos X 30d trend metric helper', 'renderTrendMetric', tezlink],
      ['Tezos X L1 anchor panel', 'id="tezlink-anchor-panel"', tezlink],
      ['Tezos X gas oracle panel', 'id="tezlink-gas-oracle"', tezlink],
      ['Tezos X top tokens panel', 'id="tezlink-token-panel"', tezlink],
      ['LB chamber copy link', 'data-copy-hash="#lb"', lb],
      ['LB entry vote tape rows', 'id="lb-entry-vote-rows"', lb],
      ['LB entry vote tape limit', 'LB_ENTRY_VOTE_LIMIT', lb],
      ['LB EMA forecast panel', 'id="lb-ema-forecast"', lb],
      ['LB EMA history panel', 'id="lb-ema-history"', lb],
      ['LB vote change feed', 'id="lb-vote-change-feed"', lb],
      ['Ledger Flow feature import', 'initLedgerFlowChamber', await readText('js/core/chamber-features.mjs')],
      ['Ledger Flow card copy link', 'data-copy-hash="#ledger-flow"', ledgerFlow],
      ['Ledger Flow card info copy', 'ledger-flow-entry-card', app],
      ['Ledger Flow direct footer link', 'Direct: /ledger-flow/', ledgerFlow],
      ['Ledger Flow pretty route', "slug: 'ledger-flow'", chamberRoutes],
      ['Ledger Flow lazy CSS loader', 'ledger-flow-css', ledgerFlow],
      ['Ledger Flow sent color class', '.ledger-flow-edge-sent', ledgerFlowCss],
      ['Ledger Flow received color class', '.ledger-flow-edge-received', ledgerFlowCss],
      ['Ledger Flow first-funding color class', '.ledger-flow-edge-first', ledgerFlowCss],
      ['Ledger Flow shared archive subscription', 'subscribeWhaleWatchArtifact', ledgerFlow],
      ['Ledger Flow card real 24-hour metrics', "['24h moves', formatCount(metrics.operationCount)", ledgerFlow],
      ['Ledger Flow card gross-observed qualifier', "'not economic volume'", ledgerFlow],
      ['Ledger Flow measured share headline', 'card.dataset.shareValue = projection.metrics', ledgerFlow],
      ['Ledger Flow private resume share exclusion', 'data-share-exclude href="#ledger-flow=', ledgerFlow],
      ['Chamber share clone private exclusion', "'[data-share-exclude]'", share],
      ['Ledger Flow card metric color CSS', '.chamber-entry-metric[data-ledger-flow-metric] strong', ledgerFlowCss],
      ['Ledger Flow threshold slider', 'id="ledger-flow-threshold"', ledgerFlow],
      ['Ledger Flow amount-weighted edge width', 'function edgeWidth', ledgerFlow],
      ['Ledger Flow first inbound fetch', 'async function fetchFirstInbound', ledgerFlow],
      ['Ledger Flow TzKT count-first request', 'transactionCountUrl(transferScope(address', ledgerFlow],
      ['Ledger Flow unified directional query', "'anyof.sender.target': address", ledgerFlow],
      ['Ledger Flow exact row budget', 'const EXACT_ROW_LIMIT = 20000', ledgerFlow],
      ['Ledger Flow sampled row budget', 'const SAMPLE_ROW_LIMIT = 10000', ledgerFlow],
      ['Ledger Flow bounded exact request count', 'Math.ceil(EXACT_ROW_LIMIT / TRANSFER_PAGE_LIMIT)', ledgerFlow],
      ['Ledger Flow largest-row sampling', "params['sort.desc'] = 'amount'", ledgerFlow],
      ['Ledger Flow superseded-load cancellation', "abortActiveLoad('superseded')", ledgerFlow],
      ['Ledger Flow close cancellation', "abortActiveLoad('closed')", ledgerFlow],
      ['Ledger Flow close invalidates pending seed work', 'openGeneration !== chamberOpenGeneration', ledgerFlow],
      ['Ledger Flow close clears delayed threshold work', 'window.clearTimeout(thresholdReloadTimer)', ledgerFlow],
      ['Ledger Flow last-good failure copy', 'still showing the last-good', ledgerFlow],
      ['Ledger Flow rejects missing indexed accounts', 'TzKT does not recognize this account.', ledgerFlow],
      ['Ledger Flow discloses excluded self transfers', 'Account-to-itself rows are excluded from path totals.', ledgerFlow],
      ['Ledger Flow contract origination fetch', 'async function fetchOrigination', ledgerFlow],
      ['Ledger Flow funded origination receipt', 'origination?.contractBalance', ledgerFlow],
      ['Ledger Flow honest scope disclosure', 'applied tez transaction rows only', ledgerFlow],
      ['Ledger Flow quiet body reconciliation', 'quietlySyncHtml(container, markup)', ledgerFlow],
      ['Ledger Flow mobile flow list', 'ledger-flow-mobile-map', ledgerFlow],
      ['Ledger Flow subject-first mobile ratio', 'ledger-flow-direction-ratio', ledgerFlow],
      ['Ledger Flow complete counterparty query', 'id="ledger-flow-counterparty-query"', ledgerFlow],
      ['Ledger Flow complete counterparty sort', 'id="ledger-flow-counterparty-sort"', ledgerFlow],
      ['Ledger Flow passive exact time profile', 'function renderTimeline(model)', ledgerFlow],
      ['Ledger Flow receipt-proven composition', 'Categories use only contract address form and aliases returned with TzKT transfer rows', ledgerFlow],
      ['Ledger Flow projected transfer fields', 'select: TRANSFER_FIELDS', ledgerFlow],
      ['Ledger Flow My Tezos counterparty links', '#my-baker=${encodeURIComponent(address)}', ledgerFlow],
      ['Ledger Flow compact TzKT pills', 'ledger-flow-tzkt-pill', ledgerFlow],
      ['Ledger Flow label-aware node width', 'function nodeGeometry', ledgerFlow],
      ['Ledger Flow pure accounting model', 'export function buildLedgerFlowModel', ledgerFlowModel],
      ['Ledger Flow pure launcher projection', 'export function buildLedgerFlowEntryProjection', ledgerFlowModel],
      ['Ledger Flow pure counterparty discovery', 'export function filterLedgerCounterparties', ledgerFlowModel],
      ['Ledger Flow pure time profile', 'export function buildLedgerFlowTimeline', ledgerFlowModel],
      ['Ledger Flow dynamic layout model', 'export function layoutLedgerFlowNodes', ledgerFlowModel],
      ['Ledger Flow directional cohort key', '`cohort:${direction}`', ledgerFlowModel],
      ['Tezos Domains feature import', 'initTezosDomainsChamber', await readText('js/core/chamber-features.mjs')],
      ['Tezos Domains card copy link', 'data-copy-hash="#domains"', tezosDomains],
      ['Tezos Domains direct footer link', 'Direct: /domains/', tezosDomains],
      ['Tezos Domains pretty route', "slug: 'domains'", chamberRoutes],
      ['Tezos Domains lazy CSS loader', 'tezos-domains-css', tezosDomains],
      ['Tezos Domains live GraphQL endpoint', 'https://api.tezos.domains/graphql', tezosDomains],
      ['Tezos Domains name lookup query', 'query TezosDomainsNameLookup', tezosDomains],
      ['Tezos Domains lookup form', 'tezos-domains-lookup-input', tezosDomains],
      ['Tezos Domains scoped deep link opener', 'openTezosDomainsChamber(initialName', tezosDomains],
      ['Tezos Domains premium threshold', "MIN_HIGH_VALUE_MUTEZ = '25000000'", tezosDomains],
      ['Tezos Domains event query', 'recentEvents: events', tezosDomains],
      ['Tezos Domains reverse-record metric', 'reverseRecords24h: events', tezosDomains],
      ['Tezos Domains auction query', 'liveAuctions: auctions', tezosDomains],
      ['Tezos Domains sell offer query', 'sellOffers: offers', tezosDomains],
      ['Tezos Domains buy offer query', 'buyOffers: buyOffers', tezosDomains],
      ['Tezos Domains expiring soon query', 'expiringSoon: domains', tezosDomains],
      ['Tezos Domains 30-day expiration window', 'lessThanOrEqualTo: $soon', tezosDomains],
      ['Tezos Domains chamber modal', 'tezos-domains-modal', tezosDomains],
      ['Tezos Domains People category facet', "chamberCategory: 'people'", siteMap],
      ['Tezos Domains category target', "domains: { selector: '#tezos-domains-entry-card', layout: 'featured' }", app],
      ['Tezos Domains lookup panel CSS', '.td-lookup-panel', tezosDomainsCss],
      ['Tezos Domains category-aware CSS', '#chambers-grid > .chamber-category > .chamber-category-cards > .tezos-domains-entry-card', tezosDomainsCss],
      ['Tezos Domains share route', 'siteMapCanonicalRoute', share],
      ['ctez hash route', "hash === 'ctez'", app],
      ['ctez feature copy link', 'data-copy-hash="#ctez"', index],
      ['ctez top-left launcher', 'id="ctez-launcher"', index],
      ['ctez feature launcher', 'id="ctez-feature-btn"', index],
      ['TzSafe top-left launcher', 'id="tzsafe-launcher"', index],
      ['TzSafe feature launcher', 'id="tzsafe-feature-link"', index],
      ['TzSafe canonical external link', 'href="https://tzsafe.tez.page/"', index],
      ['TzSafe feature copy', 'KT1 Multisig Recovery', index],
      ['TzSafe cleanup hint', 'External cleanup path for legacy TzSafe KT1 safes', index],
      ['TzSafe external action button', 'feature-external-link" href="https://tzsafe.tez.page/"', index],
      ['TzSafe feature row polish', '.tzsafe-feature-link', henModeCss],
      ['TzSafe tray icon style', '.tzsafe-launcher', henModeCss],
      ['TzSafe key mark style', '.tzsafe-logo-key', henModeCss],
      ['corner gift items removed from closed tray layout', 'position: absolute;\n    top: 100%;\n    left: 50%;', henModeCss],
      ['mobile corner gift has an in-flow utility slot', 'grid-template-columns: 30px minmax(0, 1fr);', henModeCss],
      ['mobile corner gift scrolls with utility row', 'position: relative;\n        top: auto;\n        left: auto;', henModeCss],
      ['narrow mobile price actions collapse before clipping', '@media (max-width: 350px)', henModeCss],
      ['HEN source all tab', 'data-hen-mode="all"', index],
      ['HEN source Teia tab', 'data-hen-mode="teia"', index],
      ['HEN source OBJKT tab', 'data-hen-mode="objkt"', index],
      ['HEN standalone canonical URL', '<link rel="canonical" href="https://tezos.systems/hen/">', henPage],
      ['HEN standalone live overlay', 'id="hen-overlay"', henPage],
      ['HEN standalone lazy activator', '/js/core/hen-init.js?v=83', henPage],
      ['HEN CSS cache stamp', 'css/hen-mode.min.css?v=100', index],
      ['HEN JS cache stamp', '/js/features/hen-mode.js?v=98', henInit],
      ['HEN setup status strip', 'id="hen-status-strip"', index],
      ['HEN permanent now line', 'id="hen-now-line"', index],
      ['HEN mobile filter toggle', 'id="hen-mobile-filter-toggle"', index],
      ['HEN persistent filter bar', 'id="hen-filterbar"', index],
      ['HEN for-sale filter control', 'id="hen-filter-listed"', index],
      ['HEN visible search input', 'id="hen-search-input"', index],
      ['HEN saved filter control', 'id="hen-filter-saved"', index],
      ['HEN hide-owned filter control', 'id="hen-filter-hide-owned"', index],
      ['HEN minimal wallet connect', 'id="hen-wallet-connect"', index],
      ['HEN minimal wallet input', 'id="hen-wallet-input"', index],
      ['HEN collector profile panel', 'id="hen-profile-panel"', index],
      ['HEN default mixed source mode', "const DEFAULT_FEED_MODE = 'all'", henMode],
      ['HEN source preference key', "const HEN_SOURCE_KEY = 'tezos-systems-hen-source'", henMode],
      ['HEN sort preference key', "const HEN_SORT_KEY = 'tezos-systems-hen-sort'", henMode],
      ['HEN favorites key', "const HEN_FAVORITES_KEY = 'tezos-systems-hen-favorites'", henMode],
      ['HEN eager-loads first two desktop rows', 'const HEN_EAGER_CARD_LIMIT = 8', henMode],
      ['HEN eager card limit controls lazy loading', 'staggerIdx < HEN_EAGER_CARD_LIMIT && offset === 0', henMode],
      ['HEN standalone lore styles', '.hen-header.has-lore', henModeCss],
      ['HEN standalone box sizing', '.hen-overlay *::after', henModeCss],
      ['HEN stable grid shell', '.hen-overlay.active {\n    display: grid;', henModeCss],
      ['HEN viewport row edge guard', '.hen-overlay > .hen-header,\n.hen-overlay > .hen-status-strip,\n.hen-overlay > .hen-feed,\n.hen-overlay > .hen-cli', henModeCss],
      ['HEN rows clamp to viewport width', 'max-width: 100vw;', henModeCss],
      ['HEN fixed status strip height', 'height: 44px;', henModeCss],
      ['HEN visible status line', 'position: static;\n    flex: 0 1 clamp', henModeCss],
      ['HEN filter bar does not wrap vertically', 'flex-wrap: nowrap;', henModeCss],
      ['HEN CLI scrollback anchors to overlay', "output.className = 'hen-cli-output'", henMode],
      ['HEN CLI scrollback is appended off-flow', 'ov.appendChild(output)', henMode],
      ['HEN mint pulse is a floating button', "pulseEl.className = 'hen-mint-pulse'", henMode],
      ['HEN scroll compensation for off-top live prepends', 'previousScrollHeight', henMode],
      ['HEN idle resets only on actual fresh mints', 'if (fresh.length > 0) {\n                resetIdleIndicator();', henMode],
      ['HEN paged live poll avoids skipping busy windows', 'async function fetchFreshTokens', henMode],
      ['HEN modal suppresses live chrome', 'if (!expandedActive) {\n                    showMintPulse', henMode],
      ['HEN global keys stop behind expander', 'if (expandedActive) return;', henMode],
      ['HEN now-playing throttle', 'NOW_PLAYING_MIN_INTERVAL', henMode],
      ['HEN sticky mint count is cumulative', 'pendingMintCount += freshTokens.length;', henMode],
      ['HEN token cache is capped', 'trimMapCache(tokenCache, TOKEN_CACHE_LIMIT)', henMode],
      ['HEN timestamp timer starts only while active', 'function startCardTimeUpdates', henMode],
      ['HEN CLI dismissal clears retained scrollback', 'if (reset !== false) cliScrollback = [];', henMode],
      ['HEN artist command validates addresses', '> invalid artist address', henMode],
      ['HEN GraphQL escape strips control chars', "replace(/[\\u0000-\\u001F\\u007F]/g, ' ')", henMode],
      ['HEN live paused sort status', 'live paused (sorted by ', henMode],
      ['HEN source tab live pulse', 'source-live-pulse', henMode],
      ['HEN platform edge rule classes', "card.className = 'hen-card hen-card-platform-' + platformKey(token)", henMode],
      ['HEN hover video playback path', 'function activateCardVideo', henMode],
      ['HEN random keyboard ritual', "case 'random': case 'r':", henMode],
      ['HEN CRT vibe command', "case 'crt': case 'vibe':", henMode],
      ['HEN now-playing overlay', 'function showNowPlaying', henMode],
      ['HEN warm glow opacity variable', '--warm-start-opacity', henMode],
      ['HEN saved filter uses every favorite key', 'var keys = Array.from(favoriteKeys);', henMode],
      ['HEN first-run hint key', "const HEN_HINT_DISMISSED_KEY = 'tezos-systems-hen-loop-hint-dismissed'", henMode],
      ['HEN viewer wallet key', "const HEN_VIEWER_KEY = 'tezos-systems-hen-viewer-address'", henMode],
      ['HEN My Tezos address key', "const MY_TEZOS_ADDRESS_KEY = 'tezos-systems-my-baker-address'", henMode],
      ['HEN periodic image retry delays', 'const DEFAULT_IMAGE_RETRY_DELAYS = [3000, 10000, 30000, 120000, 300000]', henMode],
      ['HEN retryable image handler', 'function setupImageRetry', henMode],
      ['HEN OBJKT CDN media base', "const OBJKT_ASSETS_BASE = 'https://assets.objkt.media/file/assets-003/'", henMode],
      ['HEN OBJKT CDN media helper', 'function mediaCdnUrl', henMode],
      ['HEN Collection media candidate reuse', 'mediaCandidates: mediaCandidates', henMode],
      ['HEN share meta prefers OBJKT CDN image', "var image = mediaCdnUrl(token, 'thumb400') || resolveUri(token.display_uri || token.thumbnail_uri || '');", henMode],
      ['HEN primary live IPFS gateway', "const IPFS_GW = 'https://gateway.pinata.cloud/ipfs/'", henMode],
      ['HEN nftstorage fallback gateway', "'https://nftstorage.link/ipfs/'", henMode],
      ['HEN CSP allows dweb fallback images', 'dweb.link *.dweb.link nftstorage.link ipfs.io gateway.pinata.cloud', index],
      ['HEN direct-load blackout cleanup', 'function clearInitialBlackout', henMode],
      ['HEN blackout style removal', "document.getElementById('hen-initial-blackout')", henMode],
      ['HEN wallet connect bridge', 'async function connectWalletFromHen', henMode],
      ['HEN My Tezos sync bridge', 'rememberMyTezosAddress(viewerAddress', henMode],
      ['HEN Objkt profile reuse', 'mod.fetchObjktProfile(address)', henMode],
      ['OBJKT profile preserves tzdomain for HEN identity labels', 'tzdomain: holder.tzdomain || null', objkt],
      ['OBJKT profile recent acquisitions ordered by latest held increment', 'order_by: {last_incremented_at: desc}', objkt],
      ['OBJKT profile carries collection logos for HEN rows', 'fa { name contract collection_id logo }', objkt],
      ['OBJKT profile carries recent acquisition token ids for CDN thumbnails', 'tokenId: h.token.token_id', objkt],
      ['HEN public activator', 'window.HenMode = HenMode', henMode],
      ['HEN site-map live route', "href: '/hen/'", siteMap],
      ['HEN site-map slash alias', "'/nfts'", siteMap],
      ['shared My Tezos address helper', 'export function rememberMyTezosAddress', wallet],
      ['shared My Tezos saved history key', "export const SAVED_ADDRESSES_KEY = 'tezos-systems-saved-addresses'", wallet],
      ['wallet connect syncs My Tezos', "source: 'octez-connect'", wallet],
      ['My Tezos listens for external identity updates', "window.addEventListener('my-baker-updated'", myBaker],
      ['HEN Teia contract constant', "const HEN_CONTRACT = 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton'", henMode],
      ['HEN Teia contract source filter', 'fa_contract: {_eq: "\' + HEN_CONTRACT + \'"', henMode],
      ['HEN OBJKT excludes HEN source filter', 'fa_contract: {_neq: "\' + HEN_CONTRACT + \'"', henMode],
      ['HEN saved source reader', 'function getSavedFeedMode', henMode],
      ['HEN saved source writer', 'persistFeedMode(mode)', henMode],
      ['HEN price filter state', 'let priceMaxMutez = null', henMode],
      ['HEN listed-only filter state', 'let listedOnly = false', henMode],
      ['HEN edition filter state', 'let editionMax = null', henMode],
      ['HEN hide-owned filter state', 'let hideOwned = false', henMode],
      ['HEN saved-only filter state', 'let savedOnly = false', henMode],
      ['HEN price GraphQL filter', 'lowest_ask: {_gt: "0", _lte:', henMode],
      ['HEN listed-only GraphQL filter', 'function listingWhereClause', henMode],
      ['HEN edition GraphQL filter', 'supply: {_lte:', henMode],
      ['HEN sort order GraphQL parameter', 'function orderByClause', henMode],
      ['HEN wallet holdings query', 'query HenViewerHoldings', henMode],
      ['HEN CLI Teia source command', "case 'teia': case 'hen': case 'hic':", henMode],
      ['HEN CLI OBJKT source command', "case 'objkt': case 'objkts':", henMode],
      ['HEN CLI price filter command', "case 'price': case 'under': case 'max':", henMode],
      ['HEN CLI for-sale filter command', "case 'forsale': case 'listed':", henMode],
      ['HEN CLI edition filter command', "case 'edition': case 'editions': case 'supply':", henMode],
      ['HEN CLI sort filter command', "case 'sort':", henMode],
      ['HEN CLI saved filter command', "case 'saved': case 'favorites': case 'watchlist':", henMode],
      ['HEN CLI hide-owned filter command', "case 'hideowned': case 'hide-owned':", henMode],
      ['HEN CLI wallet command', "case 'wallet':", henMode],
      ['HEN live mints prepend automatically', 'g.prepend(shell)', henMode],
      ['HEN fresh poll keeps near-top readers current', 'wasNearTop', henMode],
      ['HEN source tabs style', '.hen-source-tabs', henModeCss],
      ['HEN status strip style', '.hen-status-strip', henModeCss],
      ['HEN filter bar style', '.hen-filterbar', henModeCss],
      ['HEN desktop filter overflow fade', 'mask-image: linear-gradient(90deg, #000 calc(100% - 28px), transparent);', henModeCss],
      ['HEN expanded modal stays above live chrome', 'z-index: 10010;', henModeCss],
      ['HEN mobile filter collapsed style', '.mobile-filters-open', henModeCss],
      ['HEN first-run loop hint style', '.hen-loop-hint', henModeCss],
      ['HEN wallet controls style', '.hen-wallet-controls', henModeCss],
      ['HEN profile panel style', '.hen-profile-panel', henModeCss],
      ['HEN price pill style', '.hen-card-price-pill', henModeCss],
      ['HEN favorite button style', '.hen-card-favorite', henModeCss],
      ['HEN image retry style', '.hen-image-retrying', henModeCss],
      ['HEN owned badge style', '.hen-card-owned-badge', henModeCss],
      ['HEN listing status style', '.hen-card-listing', henModeCss],
      ['ctez end of life chamber copy', 'ctez End of Life', ctez],
      ['ctez chamber wiring', 'openCtezChamber', ctez],
      ['ctez launcher wiring', 'wireCtezLauncher', ctez],
      ['ctez direct footer link', 'Direct: /ctez/', ctez],
      ['ctez contract address', 'KT1GWnsoFZVHGh7roXEER3qeCcgJgrXT3de2', ctez],
      ['ctez official-style console shell', 'ctez-console-shell', ctez],
      ['ctez sunset banner', 'ctez-sunset-banner', ctez],
      ['ctez oven summary strip', 'ctez-summary-strip', ctez],
      ['ctez oven detail cards', 'ctez-detail-card', ctez],
      ['ctez detected oven list', 'ctez-oven-list', ctez],
      ['ctez automatic oven lookup', 'fetchCtezOvens', ctez],
      ['ctez TzKT big-map lookup', '/bigmaps/${ovensPtr}/keys', ctez],
      ['ctez Octez.Connect controls', 'ctez-wallet-connect', ctez],
      ['ctez wallet refresh control', 'ctez-wallet-refresh', ctez],
      ['ctez close plan preview', 'ctez-close-plan', ctez],
      ['ctez one-batch close control', 'ctez-wallet-close', ctez],
      ['ctez batch close operation builder', 'buildCtezCloseOvenOperations', ctez],
      ['ctez community tool reference', 'https://purplematter.com/ctez-tool/', ctez],
      ['ctez community builder reference', 'https://x.com/webidente', ctez],
      ['ctez no manual raw fields copy', 'No manual contract pages or raw recovery fields are required', ctez],
      ['ctez mint_or_burn operation builder', 'buildCtezMintOrBurnOperation', ctez],
      ['ctez withdraw operation builder', 'buildCtezWithdrawOperation', ctez],
      ['ctez wallet request path', 'requestWalletOperation(operations)', ctez],
      ['Baking Benjamins canonical delegate address', "BAKING_BENJAMINS_DELEGATE_ADDRESS = 'tz1S5WxdZR5f9NzsPXhr7L9L1vrEb5spZFur'", wallet],
      ['Baking Benjamins connected-wallet delegation request', 'requestConnectedWalletDelegation', wallet],
      ['Baking Benjamins Beacon delegation operation kind', "TezosOperationType?.DELEGATION || 'delegation'", wallet],
      ['Baking Benjamins footer wallet action', "button.dataset.footerDelegate = 'true'", wallet],
      ['dashboard initializes footer delegation', "safe('footerDelegation', () => initFooterDelegation(document))", app],
      ['standalone footer initializes delegation', 'initFooterDelegation(footer)', siteNav],
      ['footer delegation button styling', '.footer-delegate-button', siteMapCss],
      ['Octez.Connect SDK pin', '@tezos-x/octez.connect-sdk@${OCTEZ_CONNECT_VERSION}', wallet],
      ['Octez.Connect ESM loader', 'https://esm.sh/@tezos-x/octez.connect-sdk@${OCTEZ_CONNECT_VERSION}?bundle', wallet],
      ['Octez.Connect lazy loader', 'loadOctezConnect', wallet],
      ['Octez.Connect preload helper', 'preloadOctezConnect', wallet],
      ['Octez.Connect SDK timeout', 'WALLET_SDK_TIMEOUT_MS', wallet],
      ['Octez.Connect permission timeout', 'WALLET_CONNECT_TIMEOUT_MS', wallet],
      ['Octez.Connect connect timeout override', '__TEZOS_WALLET_CONNECT_TIMEOUT_MS__', wallet],
      ['Octez.Connect My Tezos sync key', 'tezos-systems-my-baker-address', wallet],
      ['Octez.Connect wallet storage key', 'tezos-systems-octez-wallet-address', wallet],
      ['HEN wallet preconnect helper', 'function preloadWalletConnect()', henMode],
      ['HEN wallet preconnect on activate', 'preloadWalletConnect();', henMode],
      ['HEN wallet waiting status', 'wallet prompt waiting', henMode],
      ['HEN wallet timeout status', 'wallet prompt timed out', henMode],
      ['HEN allows Beacon modal roots', '[id*="beacon" i]', henModeCss],
      ['HEN allows WalletConnect modal roots', '[id*="walletconnect" i]', henModeCss],
      ['My Tezos wallet connect control', 'id="drawer-wallet-connect-btn"', index],
      ['My Tezos connected wallet control', 'id="my-tezos-wallet-connect"', index],
      ['My Tezos Your Story tab', 'data-my-tezos-view="story"', index],
      ['My Tezos Your Story panel', 'data-my-tezos-panel="story"', index],
      ['My Tezos Story renderer', 'function renderStoryPanel(card, data)', myTezos],
      ['My Tezos Story Memory handoff', "registerMyTezosView('story', () => activateMyTezosMemory({ activityOnly: true }))", myTezos],
      ['My Tezos Ledger Flow link control', 'id="my-tezos-ledger-flow-link"', index],
      ['My Tezos Ledger Flow explain card', 'drawer-ledger-flow-card', index],
      ['My Tezos Ledger Flow explain copy', 'Trace bounded sent and received tez paths with all-time receipt context.', index],
      ['My Tezos unified account journeys', 'Explore this account', index],
      ['My Tezos shared account journey card', '.drawer-account-journey-card', styles],
      ['My Tezos contextual journey builder', 'buildMyTezosJourneyLinks', myTezos],
      ['My Tezos active-address scoped journey routes', '/#ledger-flow=${encodeURIComponent(address)}', siteJourney],
      ['My Tezos shared drawer state controller', 'setMyTezosDrawerOpenState = setDrawerOpen', app],
      ['My Tezos Chamber handoff closes drawer without stale focus restore', 'setMyTezosDrawerOpenState?.(false, { restoreFocus: false })', app],
      ['My Tezos Octez operator fetch', '/delegates/${encodeURIComponent(bakerAddr)}', myTezos],
      ['My Tezos Octez version classifier', 'classifyOctezVersion', myTezos],
      ['My Tezos Octez operator tile', "renderOperatorTile(\n        'Octez'", myTezos],
      ['My Baker Octez version stat', 'Octez Version', myBaker],
      ['My Baker delegate Octez version stat', 'Bkr Octez', myBaker],
      ['My Baker Octez status class factory', 'my-baker-octez-${status.className}', myBaker],
      ['tz4 tile card copy link', 'data-copy-hash="#tz4"', index],
      ['tz4 tile expand cue', 'data-stat="tz4-adoption"', index],
      ['tz4 tile chamber wiring', 'openTz4AdoptionChamber', tz4],
      ['tz4 direct footer link', 'Direct: /tz4/', tz4],
      ['tz4 projection panel', 'id="tz4-projection-panel"', tz4],
      ['tz4 holdouts panel', 'id="tz4-holdouts-panel"', tz4],
      ['tz4 holdout baker-name wrapping', '.tz4-holdout-table .lb-baker-name-link', styles],
      ['tz4 monthly switch panel', 'id="tz4-switch-momentum"', tz4],
      ['tz4 power milestone panel', 'id="tz4-power-milestones"', tz4],
      ['404 address/domain redirect', '#my-baker=', await fs.readFile(path.join(ROOT, '404.html'), 'utf8')],
      ['404 My Tezos route fallback', "path.toLowerCase() === 'my'", await fs.readFile(path.join(ROOT, '404.html'), 'utf8')],
      ['app direct account path handler', 'function getMyTezosPathTarget()', app],
      ['app My Tezos pretty route handler', "case 'my-tezos':", app],
      ['app direct domain resolver', 'function resolveForwardTezDomain(name)', app],
      ['health tile card copy link', 'data-copy-hash="#health"', index],
      ['health tile expand cue', 'data-stat="network-health"', index],
      ['health tile chamber wiring', 'openNetworkHealthChamber', health],
      ['health direct footer link', 'Direct: /health/', health],
      ['health incident memory panel', 'id="health-incident-memory"', health],
      ['health cycle timing panel', 'id="health-cycle-timing"', health],
      ['health current cycle progress value', 'id="health-cycle-progress"', health],
      ['health current cycle progressbar', 'role="progressbar"', health],
      ['health current cycle Octez source', 'fetchCurrentCycleProgress', health],
      ['health cycle timing TzKT source', '/statistics/cyclic', health],
      ['health Teztale consensus panel', 'id="health-teztale-consensus"', health],
      ['health Teztale exact quorum target', 'const TEZTALE_QUORUM_TARGET = 2 / 3', health],
      ['health Teztale propagation builder', 'function buildTeztaleReceptionHistogram', health],
      ['health Teztale propagation renderer', 'function renderTeztaleReceptionHistogram', health],
      ['health Teztale propagation panel', 'id="health-teztale-propagation"', health],
      ['health Teztale average pre-attestation 66 value', 'id="health-teztale-pre-66-avg"', health],
      ['health Teztale average pre-attestation 90 value', 'id="health-teztale-pre-90-avg"', health],
      ['health Teztale average attestation 66 value', 'id="health-teztale-att-66-avg"', health],
      ['health Teztale average attestation 90 value', 'id="health-teztale-att-90-avg"', health],
      ['health Teztale reception histogram bins', 'health-consensus-histogram-bin', health],
      ['health Teztale histogram bin width', 'const TEZTALE_RECEPTION_BIN_MS = 500', health],
      ['health Teztale earliest-observer disclosure', 'Earliest Teztale observer reception', health],
      ['health Teztale endorsing-power weighting disclosure', 'endorsing-power weighted', health],
      ['health Teztale validation-observed path label', 'Validation observed', health],
      ['health Teztale validation-to-pre-quorum path label', 'Validation → pre-quorum', health],
      ['health Teztale pre-quorum-to-quorum path label', 'Pre-quorum → quorum', health],
      ['health Teztale validation-to-quorum path label', 'Validation → quorum', health],
      ['health Teztale source URL', 'TEZTALE_REPORT_URL', health],
      ['health Teztale Nomadic Labs credit', 'Teztale by Nomadic Labs', health],
      ['health Teztale config endpoint', "teztale: 'https://teztale-server-mainnet-ro-prd.octez.tech'", await readText('js/core/config.js')],
      ['health Nakamoto coefficient panel', 'id="health-nakamoto-coefficient"', health],
      ['health Nakamoto one-third value', 'id="health-nc-33"', health],
      ['health Nakamoto two-thirds value', 'id="health-nc-66"', health],
      ['health Nakamoto print button', 'id="health-nc-print"', health],
      ['health Nakamoto share button', 'id="health-nc-share"', health],
      ['health Nakamoto print-document helper', 'function renderNakamotoPrintDocument', health],
      ['health Nakamoto print helper', 'function printNakamotoCoefficient', health],
      ['health Nakamoto share helper', 'function shareNakamotoCoefficient', health],
      ['health Nakamoto current-cycle RPC', 'baking_power_distribution_for_current_cycle', health],
      ['health Nakamoto explainer', 'Explain the Nakamoto Coefficient', health],
      ['health Nakamoto Chainspect disclosure', 'Chainspect', await readText('data/nakamoto-sources.json')],
      ['health Nakamoto Edinburgh disclosure', 'Edinburgh EDI', await readText('data/nakamoto-sources.json')],
      ['health Octez versions panel', 'id="health-octez-versions"', health],
      ['shared Octez versions TzKT source', '/delegates?active=true', octezVersions],
      ['shared Octez versions cache TTL', 'OCTEZ_VERSIONS_TTL', octezVersions],
      ['health period telemetry panel', 'id="health-period-telemetry"', health],
      ['health network load panel', 'id="health-network-load"', health],
      ['health chain proof panel', 'id="health-chain-proof"', health],
      ['health chain-age methodology label', 'chain age · upgrade history', health],
      ['health chain uptime counter', 'id="chain-uptime-counter"', health],
      ['top continuity stat panel', 'id="top-continuity-panel"', index],
      ['top continuity title-stack uptime launcher', 'id="top-continuity-history"', index],
      ['top continuity proof opens Protocol Anthology', 'aria-controls="protocol-history-chamber-modal"', index],
      ['expanded My Tezos nav label at narrow widths', '#my-tezos-btn .nav-label', heroSearchCss],
      ['top continuity statement wrapper', 'class="top-continuity-statement"', index],
      ['top continuity outage statement claim', 'top-continuity-claim">Zero outages', index],
      ['top continuity statement subline', 'class="top-continuity-subline"', index],
      ['top continuity accessible launch origin', 'Tezos mainnet days since 2018.', index],
      ['top continuity milestone runtime outline', 'class="top-continuity-milestone-outline"', index],
      ['top continuity milestone NEW marker', 'class="top-continuity-milestone-new"', index],
      ['top continuity milestone anchored disclosure', 'id="top-continuity-milestone-popover" role="group"', index],
      ['top continuity milestone close action', 'id="top-continuity-milestone-close"', index],
      ['top continuity milestone explicit action', 'id="top-continuity-milestone-link"', index],
      ['header trailing-hour activity launcher', 'id="header-activity-button"', index],
      ['header trailing-hour activity cluster', 'class="header-activity-cluster"', health],
      ['header trailing-hour activity updater', 'function updateHeaderActivity', health],
      ['top continuity proof baker metric', 'id="hero-chain-uptime-bakers"', index],
      ['top continuity baker all-time pill', 'data-card-history="total-bakers"', index],
      ['top continuity baker right-change roster', 'id="top-continuity-baker-roster"', app],
      ['top continuity 7D baker-set baseline snapshot', "const BAKER_SET_BASELINE_DAYS = 7", app],
      ['top continuity protocol baker-set comparison', "with_minimal_stake=true", app],
      ['top continuity exact baker baseline block lookup', "select: 'level,hash,timestamp'", app],
      ['top continuity funded active baker filter', "params.set('bakingPower.gt', '0')", app],
      ['top continuity baker TzKT transient retry path', 'function fetchTopContinuityTzktJson', app],
      ['top continuity baker shared network-share size tiers', "import { bakerSizeTier } from './baker-size.mjs'", app],
      ['Live Head reuses current-cycle baker power', 'powerByDelegate', health],
      ['top continuity closed baker cycle-size receipt', '/rewards/bakers/${encodeURIComponent(row.address)}', app],
      ['top continuity closed baker one-year lookback', 'oneYearBeforeBakerEvent(row.eventTime)', app],
      ['top continuity closed baker timestamp cycle lookup', "'timestamp.le': targetTime", app],
      ['top continuity 7D New and Reactivated Bakers heading', "renderTopContinuityBakerList('7D New + Reactivated', 'active set entered'", app],
      ['top continuity latest baker prior-block classification', "'anyof.proposer.producer': row.address", app],
      ['top continuity first-time and reactivated baker marker', '>REACTIVATED</span>', app],
      ['top continuity 7d 30d 90d changes', "{ label: '90D', days: 90 }", app],
      ['top continuity scheduled-history receipt', "fetchHistoricalDataReceipt('90d')", app],
      ['top continuity open trend refresh follows live metric settlement', 'TOP_CONTINUITY_TREND_METRICS[explainActiveKey]', app],
      ['top continuity contextual Chamber action', 'data-open-top-continuity-chamber="${escapeHtml(copy.chamberEntry)}"', app],
      ['top continuity Chamber action navigation', 'navigateSiteMapEntry(entryId)', app],
      ['top continuity Baker Directory handoff', "chamberEntry: 'leaderboard'", app],
      ['top continuity Network Health handoff', "chamberEntry: 'health'", app],
      ['top continuity Staking Chamber handoff', "chamberEntry: 'staking-chamber'", app],
      ['top continuity paired action spacing', 'gap: 0.42rem', shellExtrasCss],
      ['top continuity mobile paired action columns', 'grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr)', shellExtrasCss],
      ['top continuity 7D Closed Bakers heading', "renderTopContinuityBakerList('7D Closed Bakers', 'active set left'", app],
      ['top continuity baker Tezos Domains batch', 'resolveTezReverseNames(', app],
      ['top continuity baker saved My Tezos action', 'data-baker-set-save-address', app],
      ['top continuity baker My Tezos link', 'data-baker-set-my-address', app],
      ['top continuity baker TzKT link', 'https://tzkt.io/${encodeURIComponent(row.address)}', app],
      ['top continuity baker quiet roster sync', 'quietlySyncHtml(roster', app],
      ['top continuity baker idle preload', 'window.requestIdleCallback(preload, { timeout: 3000 })', app],
      ['top continuity baker preload defers optional details', 'refreshTopContinuityBakerRoster({ details: false });', app],
      ['top continuity baker preload visibility gate', "bakerSetPreloadScheduled || !chainBakersText || document.visibilityState !== 'visible'", app],
      ['top continuity baker rows precede optional details', 'if (force || !fresh) bakerSetSnapshot = await fetchTopContinuityBakerSet();\n                renderTopContinuityBakerRoster();', app],
      ['top continuity explainer title follows the settled live value', 'value?.dataset?.finalText || value?.textContent?.trim()', app],
      ['top continuity finality all-time pill', 'data-card-history="finality"', index],
      ['top continuity staked all-time pill', 'data-card-history="staking-ratio"', index],
      ['top continuity issuance all-time pill', 'data-card-history="issuance-rate"', index],
      ['Live Head renderer', 'function updateBlockTicker', health],
      ['Live Head fixed age formatter', 'function formatTickerAge', health],
      ['Live Head keyed block rows', 'data-quiet-key="live-head-block-${block.level}"', health],
      ['Live Head inspector identity survives accessible-label updates', 'data-quiet-key="live-head-info-${block.level}"', health],
      ['Live Head search floor', 'class="hero-slot" id="hero-slot"', index],
      ['Live Head search usage help', 'id="hero-search-help">Wallets · .tez names · bakers · KT1 contracts · operations · blocks · protocols · Chambers — press / anywhere', index],
      ['Live Head countdown stays outside its announcer', 'data-magic="off"', health],
      ['Live Head dedicated block announcer', 'id="chain-heartbeat-announcer" aria-live="polite"', index],
      ['Live Head exact next R0 right', 'function fetchHeartbeatNextRight', health],
      ['Live Head per-block activity receipts', 'function fetchHeartbeatActivity', health],
      ['Live Head per-block missed-attester receipts', 'function liveHeadMissedState', health],
      ['Live Head exact missed-attester threshold', 'LIVE_HEAD_POWER_DETAIL_THRESHOLD = 6969', health],
      ['Live Head quiet-block missed-attester trigger', 'const quiet = story?.quiet === true', health],
      ['Live Head missed-attester identity pills', 'data-missed-baker-address=', health],
      ['Live Head width-aware pill fitting', 'function fitLiveHeadPills', health],
      ['Live Head responsive pill observer', 'new ResizeObserver', health],
      ['Live Head full producer addresses', "producerHasAlias ? producer.alias : (producer.address || 'Unknown baker')", health],
      ['Live Head preserved address suffix', 'escapeHtml(name.slice(-5))', health],
      ['Live Head adaptive address prefix', 'escapeHtml(name.slice(0, -5))', health],
      ['Live Head two-thirds consensus status', 'const quorumPower = Math.ceil(committee * 2 / 3)', health],
      ['Live Head signed missing-power label', "const missingSign = missingPower > 0 ? '−' : ''", health],
      ['Live Head missing power relative to full committee', 'Math.max(0, block.committee - block.power)', health],
      ['Live Head top-line Quiet indicator', 'class="live-head-quiet"', health],
      ['Live Head exact manager gas receipt', '/operations/3', health],
      ['Live Head protocol gas-limit denominator', 'hard_gas_limit_per_block', health],
      ['Live Head internal manager gas aggregation', 'internal_operation_results', health],
      ['Live Head non-quiet gas fullness pill', 'class="live-head-gas is-${gas.className}"', health],
      ['Live Head gas severity tiers', "pct >= 85 ? 'hot' : pct >= 60 ? 'busy' : pct >= 25 ? 'active' : 'open'", health],
      ['Live Head quiet removed from detail pills', "filter((fragment) => fragment.key !== 'quiet')", health],
      ['Live Head compact responsive cap', 'function compactLiveHeadBlockLimit', health],
      ['Live Head four presets and custom mode', "LIVE_HEAD_DEPTH_MODES = ['compact', '10', '15', '20', 'custom']", health],
      ['Live Head custom bounded by the existing feed', 'LIVE_HEAD_MAX_ROWS = CHAIN_HEALTH_BLOCK_LIMIT', health],
      ['Live Head legacy preference migration', "saved.expanded === true ? '10' : 'compact'", health],
      ['Live Head stacked custom stepper', 'class="live-head-depth-stepper"', index],
      ['Live Head custom validation', 'input.reportValidity()', health],
      ['Live Head persistent depth preference', 'tezos-systems-live-head-depth-v1', health],
      ['Live Head shared corner and Setup depth controls', 'function wireLiveHeadDepthControls', health],
      ['Network Health Passing Blocks shares the depth control', 'id="health-block-depth-toggle"', health],
      ['Network Health Passing Blocks compact desktop depth', 'CHAMBER_COMPACT_DESKTOP_BLOCK_LIMIT = 8', health],
      ['Network Health Passing Blocks compact mobile depth', 'CHAMBER_COMPACT_MOBILE_BLOCK_LIMIT = 6', health],
      ['Network Health Passing Blocks expanded desktop depth', 'CHAMBER_BLOCK_LIMIT = 15', health],
      ['Network Health Passing Blocks expanded mobile depth', 'CHAMBER_EXPANDED_MOBILE_BLOCK_LIMIT = 12', health],
      ['Network Health Passing Blocks depth wiring', 'function wireHealthBlockDepthControl', health],
      ['Network Health Passing Blocks activity Setup', 'id="health-block-filter-toggle"', health],
      ['Network Health Passing Blocks receipt rail', 'data-health-block-receipts', health],
      ['Network Health Passing Blocks shared supplement request', 'function requestRecentBlockSupplements', health],
      ['Network Health Passing Blocks quiet receipt update', 'quietlySyncElement(receipt, renderRecentBlockReceipts(block))', health],
      ['Live Head expanded receipt cache', 'HEARTBEAT_ACTIVITY_CACHE_LIMIT = 2 * CHAIN_HEALTH_BLOCK_LIMIT', health],
      ['Live Head quiet keyed row reconciliation', 'quietlySyncElement(row, renderLiveHeadRow', health],
      ['Live Head FLIP row shift', 'function smoothlyShiftLiveHeadRows', health],
      ['Live Head Passing Blocks level field', 'class="live-head-level"', health],
      ['Live Head Passing Blocks round field', '${renderRoundBadge(block)}', health],
      ['Live Head Passing Blocks delta field', 'live-head-delta health-interval', health],
      ['Live Head Passing Blocks attestation field', 'live-head-power health-power', health],
      ['Live Head once-per-margin bar signature', 'data-bar-signature="${barSignature}"', health],
      ['Live Head opaque first paint', 'class="live-head-skeleton-primary"', index],
      ['Live Head bottom-right depth arrow', 'id="live-head-depth-toggle"', index],
      ['Live Head Setup depth option', 'id="live-head-depth-setting"', index],
      ['Live Head visibility-gated supplements', "document.visibilityState !== 'visible'", health],
      ['Live Head health feed hook', 'updateBlockTicker(data)', health],
      ['price bar cycle health wiring', 'function wireCycleChipHealthLauncher', health],
      ['Live Head landing-page panel styles', '.live-head-panel.lb-panel', heroSearchCss],
      ['Live Head redundant status badge removed', '.live-head-state {\n    display: none;\n}', heroSearchCss],
      ['Live Head story chip styles', '.live-head-story-chip', heroSearchCss],
      ['Live Head missed-attester pill styles', '.live-head-miss-pill', heroSearchCss],
      ['Live Head clear attestation pill remains complete', '.live-head-miss-pill.is-clear {\n    max-width: none;', heroSearchCss],
      ['Live Head gas fullness fill styles', '.live-head-gas::before', heroSearchCss],
      ['Live Head mobile info-and-age fact rail', 'grid-template-columns: 10.5ch minmax(0, 1fr) max-content;', heroSearchCss],
      ['Live Head mobile viewport-width panel', 'width: var(--page-col);', heroSearchCss],
      ['Live Head full-bleed search unclamped', 'max-width: none;', heroSearchCss],
      ['Live Head reduced-motion settle', '.live-head-story-chip,', heroSearchCss],
      ['Live Head mini-selector styling', '.live-head-depth-menu > button[aria-pressed="true"]', heroSearchCss],
      ['Network Health Passing Blocks depth arrow styling', '.health-block-depth-toggle[aria-expanded="true"] svg', networkHealthCss],
      ['Network Health Passing Blocks compact row styling', '#health-recent-block-list .health-block-row:nth-child(n + 9)', networkHealthCss],
      ['Network Health Passing Blocks expanded mobile row styling', 'html[data-live-head-expanded="true"] #health-recent-block-list .health-block-row:nth-child(n + 13)', networkHealthCss],
      ['Network Health Passing Blocks reclaimed level lane', 'grid-template-columns: 124px 58px 58px 112px 56px', networkHealthCss],
      ['Network Health Passing Blocks right receipt rail styling', '.health-block-receipts {', networkHealthCss],
      ['Network Health Passing Blocks Setup styling', '.health-block-filter-toggle.live-head-filter-toggle', networkHealthCss],
      ['network health continuity panel styles', '.health-continuity-panel', styles],
      ['network health continuity runtime styles', '.health-continuity-runtime', styles],
      ['visible chain uptime reconciliation', 'quietlySyncHtml(clock, healthChainAge())', health],
      ['top continuity counter updater', 'setTopContinuityRuntime(totalDays);', app],
      ['top continuity decrypt duration', 'TOP_CONTINUITY_SHUFFLE_MS = 1500', app],
      ['top continuity Protocol Anthology launcher wiring', 'openProtocolHistoryChamber();', app],
      ['top continuity Protocol Anthology hash wiring', "window.history.pushState(null, '', '#protocol-history');", app],
      ['top continuity all-time pill history wiring', "openCardHistoryModal(key, 'all')", app],
      ['top continuity finality history metric', "metric: 'finality_seconds'", await readText('js/features/history.js')],
      ['chain uptime baker updater', "setChainText('chain-uptime-bakers'", app],
      ['top continuity proof styles', '.top-continuity-panel', styles],
      ['header uptime badge title stack styles', '.header-brand-stack', styles],
      ['header continuity row styles', '.header-continuity-row', heroSearchCss],
      ['header render-blocking trailing-hour activity styles', '.header-activity-button', heroSearchCss],
      ['header first-paint activity loading state', '.header-activity-cluster.is-loading .block-ticker-value', heroSearchCss],
      ['header compact desktop breakpoint', '@media (min-width: 801px) and (max-width: 1180px)', heroSearchCss],
      ['header protocol wraps by available title-row width', 'flex-wrap: wrap;', heroSearchCss],
      ['header centered tablet breakpoint', '@media (min-width: 641px) and (max-width: 800px)', heroSearchCss],
      ['top continuity stat rail right aligned', 'justify-content: flex-end', styles],
      ['top continuity rail is borderless tape', 'border: 0;', styles],
      ['top continuity identity claim styles', '.top-continuity-claim', heroSearchCss],
      ['top continuity statement runtime scale', 'font-size: clamp(1.85rem, 2.6vw, 2.4rem);', heroSearchCss],
      ['top continuity dedicated runtime font role', 'font-family: var(--font-runtime);', heroSearchCss],
      ['Handoff display font role', 'font-family: var(--font-display, Orbitron', siteMapCss],
      ['Live Pulse display font role', "var(--font-display, 'Space Grotesk'", shellExtrasCss],
      ['Live Pulse clock explicit presentation', '.hot-today-clock:is(:link, :visited)', shellExtrasCss],
      ['Live Pulse clock suppresses visited-link decoration', 'text-decoration: none;', shellExtrasCss],
      ['Maxis display font role', "font-family: var(--font-display, 'Orbitron'", maxisCss],
      ['top continuity runtime readability scale', 'font-size: 1.08em;', heroSearchCss],
      ['top continuity runtime real font weight', 'font-weight: 700;', heroSearchCss],
      ['top continuity statement caption scale', 'font-size: clamp(0.72rem, 0.92vw, 0.875rem);', heroSearchCss],
      ['top continuity statement separator scale', 'font-size: clamp(0.7rem, 0.85vw, 0.82rem);', heroSearchCss],
      ['top continuity mobile direct runtime scale', 'font-size: clamp(1.65rem, 7vw, 1.9rem);', heroSearchCss],
      ['top continuity mobile removes zoom offset', 'zoom: 1;', styles],
      ['mobile title and protocol stack independently', 'grid-template-columns: minmax(0, 1fr);', heroSearchCss],
      ['top continuity runtime natural segment gap', 'gap: 0.5ch;', heroSearchCss],
      ['top continuity hover affordance', '.top-continuity-history:is(:hover, :focus-visible) .top-continuity-arrow', heroSearchCss],
      ['top continuity completed-day renderer', 'renderTopContinuityRuntime(totalDays)', app],
      ['top continuity hero settled promise', 'window.tezosSystemsHeroSettled = heroSettled', app],
      ['top continuity toast gate waits for hero', 'setToastGate(heroSettled)', app],
      ['toast queue waits for hero gate', 'await waitForGate();', toastQueue],
      ['top continuity counter tween', 'tweenNumber(el, 0, totalDays', app],
      ['top continuity pill stagger', '}, index * 80);', app],
      ['top continuity arrival pending class', 'hero-arrival-pending', app],
      ['top continuity arrival completion class', 'hero-arrived', app],
      ['top continuity milestone event bridge', "window.addEventListener('hot-signal-rendered'", app],
      ['top continuity milestone destination resolver', 'uptimeMilestoneDestination(signal)', app],
      ['top continuity milestone marker binding', "querySelector('.top-continuity-milestone-new')", app],
      ['top continuity milestone near state', "topContinuityProof?.classList.toggle('is-milestone-near', near)", app],
      ['top continuity milestone crossed state', "topContinuityProof?.classList.toggle('is-milestone-crossed', crossed)", app],
      ['top continuity milestone status label', "topContinuityMilestoneNew.textContent = near ? 'Soon' : 'New';", app],
      ['top continuity nullable milestone expiry guard', "if (value == null || value === '') return null;", app],
      ['top continuity milestone clean outline', '.top-continuity-milestone-outline', shellExtrasCss],
      ['top continuity milestone transparent interior', 'background: transparent;', shellExtrasCss],
      ['top continuity milestone hairline border', 'border: 1px solid color-mix(in srgb, var(--uptime-badge-label) 58%, var(--uptime-badge-value));', shellExtrasCss],
      ['top continuity approaching milestone dashed outline', '.top-uptime-cluster.is-milestone-near .top-continuity-milestone-outline', shellExtrasCss],
      ['top continuity approaching milestone dashed treatment', 'border-style: dashed;', shellExtrasCss],
      ['top continuity crossed milestone solid outline', '.top-uptime-cluster.is-milestone-crossed .top-continuity-milestone-outline', shellExtrasCss],
      ['top continuity milestone NEW marker styles', '.top-continuity-milestone-new', shellExtrasCss],
      ['top continuity milestone NEW marker above outline paint layer', 'z-index: 2;', shellExtrasCss],
      ['top continuity milestone NEW marker visible for unseen signal', '.top-uptime-cluster.has-milestone-signal .top-continuity-milestone-new', shellExtrasCss],
      ['top continuity milestone NEW marker separated above outline', 'top: -1.3rem;', shellExtrasCss],
      ['top continuity milestone removes offset highlight', 'box-shadow: none;', shellExtrasCss],
      ['top continuity milestone one-shot reveal', 'uptimeMilestoneNewReveal 720ms', shellExtrasCss],
      ['top continuity milestone delayed one-shot nudge', 'uptimeMilestoneNewNudge 420ms ease-out 5.1s 1', shellExtrasCss],
      ['top continuity milestone popover styles', '.top-continuity-milestone-popover', shellExtrasCss],
      ['top continuity mobile fixed milestone sheet', 'bottom: max(0.72rem, env(safe-area-inset-bottom));', shellExtrasCss],
      ['top continuity milestone action styles', '.top-continuity-milestone-link', shellExtrasCss],
      ['top continuity baker compact row styles', '.top-continuity-baker-row', shellExtrasCss],
      ['top continuity baker right-side actions', '.top-continuity-baker-actions', shellExtrasCss],
      ['top continuity baker size badge styles', '.top-continuity-baker-size', shellExtrasCss],
      ['top continuity baker mobile action targets', 'min-width: 44px;', shellExtrasCss],
      ['top continuity milestone close wiring', "topContinuityMilestoneClose?.addEventListener('click'", app],
      ['top continuity rolling seen-state key', "tezos-systems-uptime-milestone-seen-v1", app],
      ['top continuity id-status seen identity', '`${id}|${uptimeMilestoneStatus(signal)}`', app],
      ['top continuity touch disclosure detector', 'function uptimeMilestoneNeedsDisclosureStep()', app],
      ['top continuity first touch opens disclosure', 'setUptimeMilestonePopoverVisible(true, { lockDisclosure: true });', app],
      ['top continuity second activation marks seen', 'markUptimeMilestoneSeen(milestoneSignal);', app],
      ['top continuity second activation opens destination', 'openUptimeMilestoneDestination(milestoneSignal);', app],
      ['top continuity cross-tab seen sync', 'event.key !== UPTIME_MILESTONE_SEEN_KEY', app],
      ['top continuity explicit destination action', "topContinuityMilestoneLink?.addEventListener('click'", app],
      ['milestone ticker word and glyph styles', '.pulse-ticker-weight', shellExtrasCss],
      ['milestone ticker weight selector', '[data-pulse-weight="milestone"]', shellExtrasCss],
      ['milestone ticker arrival treatment', '.pulse-ticker-item.is-arriving', shellExtrasCss],
      ['top continuity loading skeleton respects arrived pills', '.hero-arrival-pending .top-continuity-stat:not(.hero-arrived) strong', loadingCss],
      ['top continuity title theme token', '--header-title-color', styles],
      ['top continuity uptime statement transparent bg', 'background: transparent;', styles],
      ['top continuity uptime statement unboxed border', 'border: 0;', styles],
      ['top continuity uptime badge label token', 'color: var(--uptime-badge-label);', styles],
      ['top continuity uptime value token', 'color: var(--uptime-badge-value);', styles],
      ['top continuity value color tokens', 'var(--pill-color, var(--top-pill-bakers))', styles],
      ['top continuity baker color selector', '.top-continuity-stat[data-card-history="total-bakers"]', styles],
      ['top continuity finality color selector', '.top-continuity-stat[data-card-history="finality"]', styles],
      ['top continuity staked color selector', '.top-continuity-stat[data-card-history="staking-ratio"]', styles],
      ['top continuity issuance color selector', '.top-continuity-stat[data-card-history="issuance-rate"]', styles],
      ['top continuity metric-sized settled value slots', 'min-width: var(--pill-value-width);', styles],
      ['top continuity metric-sized loading value slots', 'width: var(--pill-value-width);', loadingCss],
      ['top continuity loading bar matches the visible value width', 'width: var(--pill-value-width);', loadingCss],
      ['top continuity empty loading value preserves the settled line box', '.top-continuity-stat.is-loading strong:empty::after', loadingCss],
      ['top continuity mobile pill grid', 'grid-template-columns: repeat(2, minmax(0, 1fr))', styles],
      ['top continuity isolated decrypt styles', '.top-continuity-stat.is-shuffling', styles],
      ['top continuity stable finality slot', '--pill-value-width: 4ch;', styles],
      ['top continuity arrival hides pending pills only', '.top-continuity-panel.hero-arrival-pending .top-continuity-stat:not(.hero-arrived)', heroSearchCss],
      ['top continuity arrival reveal class', '.top-continuity-stat.hero-arrived', heroSearchCss],
      ['health cycle timing styles', '.health-cycle-panel', styles],
      ['health current cycle progress styles', '.health-cycle-progress-track', networkHealthCss],
      ['health Teztale consensus styles', '.health-consensus-panel', healthStyles],
      ['health Teztale propagation styles', '.health-consensus-propagation', healthStyles],
      ['health Teztale histogram styles', '.health-consensus-histogram', healthStyles],
      ['health Teztale histogram-bin styles', '.health-consensus-histogram-bin', healthStyles],
      ['health Clean-theme consensus contrast override', '[data-theme="clean"] .health-consensus-panel', networkHealthCss],
      ['health Nakamoto panel styles', '.health-nakamoto-panel', networkHealthCss],
      ['health Nakamoto source-row styles', '.health-nc-source-row', networkHealthCss],
      ['health Nakamoto action-group styles', '.health-nc-actions', healthStyles],
      ['health Nakamoto action-button styles', '.health-nc-action', healthStyles],
      ['health Octez versions styles', '.health-octez-panel', styles],
      ['My Tezos Octez warning styles', '.drawer-operator-watch', styles],
      ['My Baker Octez critical styles', '.my-baker-stat.my-baker-octez-critical', styles],
      ['canonical chamber expand cue factory', 'function createChamberExpandCue()', app],
      ['canonical chamber expand cue class', "cue.className = 'chamber-expand-cue'", app],
      ['shared chamber footer rail style', '.chamber-entry-footer', styles],
      ['shared chamber freshness text style', '.chamber-entry-freshness', styles],
      ['Network moments monotonic change guard', 'MONOTONIC_CHANGE_METRICS', moments],
      ['Network moments shared rule gate', 'function ruleFires', moments],
      ['My Tezos era card button', 'tezos-era-share-btn', myTezos],
      ['My Tezos era card share helper', 'function shareEraCard', myTezos],
      ['Tezos Story action styles', '.tezos-story-actions', styles],
      ['Delegator fit finder questions', 'FIT_QUESTIONS', leaderboard],
      ['Delegator fit strict factual matcher', 'function bakerMatchesFit', leaderboard],
      ['Delegator fit lexicographic comparator', 'function compareBakerFit', leaderboard],
      ['Delegator fit factual ordering', 'function factualBakerFits', leaderboard],
      ['Delegator fit finder styles', '.baker-fit-finder', leaderboardCss],
      ['Delegator fit finder truth disclosure', 'No blended score is calculated', leaderboard],
      ['Leaderboard native sort controls', 'class="lb-sort-btn"', leaderboard],
      ['Leaderboard column sort state', 'aria-sort="${direction}"', leaderboard],
      ['Leaderboard explicit baker action', 'class="lb-baker-open"', leaderboard],
      ['Leaderboard compact governance signal source', "GOVERNANCE_SIGNALS_URL = '/data/baker-governance-signals.json'", leaderboard],
      ['Leaderboard governance signal integrity receipt', 'failed its SHA-256 integrity receipt', leaderboard],
      ['Leaderboard accepted proposal projection', 'record.acceptedProposals.map', leaderboard],
      ['Leaderboard completed ballot streak signal', 'currentBallotPeriodStreak', leaderboard],
      ['Leaderboard multi-signal badge rail', 'class="lb-badge-rail"', leaderboard],
      ['Leaderboard progressive signal legend', '.leaderboard-signal-legend', leaderboardCss],
      ['Leaderboard sort focus styles', '.lb-sort-btn:focus-visible', leaderboardCss],
      ['Theme picker native radio controls', 'class="theme-radio" type="radio"', themeUi],
      ['Theme picker radio group label', 'role="radiogroup" aria-label="Choose a site theme"', themeUi],
      ['Theme picker row-safe copy controls', 'class="theme-link-copy" type="button" data-copy-hash="#theme=${theme}"', themeUi],
      ['Theme picker copy control accessible label', 'aria-label="Copy ${label} theme link"', themeUi],
      ['Theme picker copy control focus style', '.theme-link-copy:focus-visible', shellExtrasCss],
      ['Clean dark Chamber surface token', '--chamber-surface-bg: #07101D', styles],
      ['Clean dark Chamber semantic exclusion', '.chamber-content:not(.maxis-content):not(.staking-chamber-content)', styles]
    ];
    for (const [label, snippet, text] of deepLinkContracts) {
      if (!text.includes(snippet)) fail(`missing deep-link contract: ${label}`);
    }
    if (heroSearchCss.includes('body.hero-search-mode .main-content')
        || heroSearchCss.includes('body.hero-search-mode .command-deck')
        || search.includes('setBackgroundInert')
        || /event\.key === ['"]Tab['"]/.test(search)) {
      fail('Live Head search must not dim, blur, inert, fix, or keyboard-trap the landing page');
    }
    if (index.includes('id="block-ticker-strip"') || index.includes('id="upgrade-clock"')) {
      fail('The retired ticker strip and command-deck sibling must not survive as hidden compatibility markup');
    }

    const chamberPollingContracts = [
      ['Liquidity Baking bounded incremental page', 'const LB_INCREMENTAL_BLOCK_LIMIT = 32', lb],
      ['Liquidity Baking overlap depth', 'const LB_INCREMENTAL_OVERLAP_LEVELS = 4', lb],
      ['Liquidity Baking block hash receipt', "select: 'level,hash,timestamp,producer,lbToggle,lbToggleEma'", lb],
      ['Liquidity Baking incremental level filter', "params.set('level.ge'", lb],
      ['Liquidity Baking deduplicated ring merge', 'function mergeBlockWindow(', lb],
      ['Liquidity Baking continuity catch-up', 'return fetchCanonicalBlockWindow();', lb],
      ['Liquidity Baking canonical launcher sample', 'fetchLiquidityBakingData(LB_MODAL_BLOCK_LIMIT, { force })', lb],
      ['Liquidity Baking launcher/modal request coalescing', 'let _lbWindowFetchPromise = null', lb],
      ['Liquidity Baking initial modal cache reuse', 'fetchLiquidityBakingData(LB_MODAL_BLOCK_LIMIT, { force: !initial })', lb],
      ['Liquidity Baking recent switcher summary', 'function recentUniqueVoteChanges(', lb],
      ['Liquidity Baking switcher quiet reconciliation', 'quietlySyncElement(switcherStrip, renderEntrySwitcherStrip(data))', lb],
      ['Liquidity Baking latest-vote quiet reconciliation', 'quietlySyncHtml(voteRows, renderEntryVoteTape(data.blocks))', lb],
      ['Liquidity Baking last-good launcher state', "card.dataset.lbRefreshState = 'delayed'", lb],
      ['Liquidity Baking visible-tab catch-up', 'handleLiquidityBakingVisibilityChange', lb],
      ['tz4 explicit operation page size', 'const CONSENSUS_OPERATION_PAGE_SIZE = 1000', tz4],
      ['tz4 safe overlap depth', 'const CONSENSUS_UPDATE_OVERLAP_LEVELS = 64', tz4],
      ['tz4 explicit operation offset', 'offset: String(offset)', tz4],
      ['tz4 incremental level filter', "params.set('level.ge'", tz4],
      ['tz4 operation receipt deduplication', 'function consensusOperationIdentity(', tz4],
      ['tz4 ten-minute baker snapshot cache', 'const BAKER_CACHE_TTL = 10 * 60 * 1000', tz4],
      ['tz4 launcher-room request coalescing', 'let _tz4FetchPromise = null', tz4],
      ['tz4 truthful paged-history coverage', "mode: 'complete-paged'", tz4],
      ['tz4 visible-tab catch-up', 'handleTz4VisibilityChange', tz4],
      ['Liquidity Baking static launcher shell', 'data-chamber-entry-id="liquidity-baking"', index],
      ['Liquidity Baking dynamic module registry', "modulePath: '../features/liquidity-baking.js'", await readText('js/core/chamber-features.mjs')],
      ['tz4 dynamic module registry', "modulePath: '../features/tz4-adoption.js'", await readText('js/core/chamber-features.mjs')]
    ];
    for (const [label, snippet, text] of chamberPollingContracts) {
      if (!text.includes(snippet)) fail(`missing Chamber polling contract: ${label}`);
    }
    if (/^import\s+\{[^\n]*(?:initLiquidityBaking|initTz4AdoptionChamber)[^\n]*\}\s+from/m.test(app)) {
      fail('Liquidity Baking and tz4 launchers must not regain eager static imports');
    }
    pass(`Liquidity Baking and tz4 lazy polling contracts checked: ${chamberPollingContracts.length}`);

    const uptimeMilestoneClickStart = app.indexOf("topContinuityHistory.addEventListener('click'");
    const uptimeMilestoneLinkStart = app.indexOf("topContinuityMilestoneLink?.addEventListener('click'", uptimeMilestoneClickStart);
    const uptimeMilestoneClick = app.slice(uptimeMilestoneClickStart, uptimeMilestoneLinkStart);
    const firstDisclosureIndex = uptimeMilestoneClick.indexOf('setUptimeMilestonePopoverVisible(true, { lockDisclosure: true });');
    const seenIndex = uptimeMilestoneClick.indexOf('markUptimeMilestoneSeen(milestoneSignal);');
    const destinationIndex = uptimeMilestoneClick.indexOf('openUptimeMilestoneDestination(milestoneSignal);');
    if (
      uptimeMilestoneClickStart < 0
      || uptimeMilestoneLinkStart < 0
      || !uptimeMilestoneClick.includes('uptimeMilestoneNeedsDisclosureStep() && !uptimeMilestoneDisclosureLocked')
      || firstDisclosureIndex < 0
      || seenIndex < firstDisclosureIndex
      || destinationIndex < seenIndex
    ) {
      fail('mobile uptime milestone must disclose on the first tap, then mark seen and open its Chamber on the second tap');
    }

    for (const staleMilestoneState of [
      'is-milestone-celebrating',
      'has-milestone-near',
      'has-milestone-celebration'
    ]) {
      if (app.includes(staleMilestoneState)) {
        fail(`header milestone must not retain dead state class: ${staleMilestoneState}`);
      }
    }
    if (
      app.includes("topContinuityHistory?.classList.toggle('is-milestone-near'")
      || app.includes("topContinuityHistory?.classList.toggle('is-milestone-crossed'")
    ) {
      fail('header milestone state classes belong only on the top uptime cluster');
    }
    const criticalMyTezosDrawer = loadingCss.match(/\.my-tezos-drawer\s*\{([^}]*)\}/)?.[1] || '';
    const criticalMyTezosScrim = loadingCss.match(/\.drawer-scrim\s*\{([^}]*)\}/)?.[1] || '';
    for (const declaration of [
      'position: fixed',
      'right: 0',
      'max-width: 100vw',
      'transform: translateX(100%)'
    ]) {
      if (!criticalMyTezosDrawer.includes(declaration)) {
        fail(`My Tezos critical first-paint drawer state is missing ${declaration}`);
      }
    }
    for (const declaration of ['position: fixed', 'opacity: 0', 'pointer-events: none']) {
      if (!criticalMyTezosScrim.includes(declaration)) {
        fail(`My Tezos critical first-paint scrim state is missing ${declaration}`);
      }
    }
    pass('My Tezos critical first-paint closed state checked');
    if (/function\s+scoreBakerFit|\bfitScore\b|\bcompositeFitScore\b/.test(leaderboard)) {
      fail('Delegator fit must use strict factual filters and lexicographic facts, never a hidden composite score');
    }
    if (leaderboard.includes('lb-share-btn') || leaderboard.includes('lb-share-col')) {
      fail('Baker Leaderboard must not restore one share control per row');
    }
    if (!leaderboard.includes('const OG_LAST_YEAR = 2018;')
        || !leaderboard.includes('const VETERAN_LAST_YEAR = 2021;')
        || !leaderboard.includes("artifact?.kind !== 'baker-governance-signals'")
        || !leaderboard.includes('acceptedProposalCount !== Number(artifact.acceptedProposalCount)')) {
      fail('Baker Leaderboard badge cutoffs or compact governance receipt validation have drifted');
    }
    if (leaderboard.includes('computeBakerScores') || leaderboard.includes("value: 'reliability'") || leaderboard.includes('grade ${')) {
      fail('Delegator fit must not present synthetic participation defaults as reliability or performance grades');
    }
    if (/card\.setAttribute\(['"]role['"],\s*['"]button['"]\)/.test(networkPulse)) {
      fail('Network Pulse entry card must not wrap its inner controls in an outer button role');
    }
    if (/const\s+(?:CHAMBERS|COMMANDS|QUICK_CHIPS)\s*=/.test(search)) {
      fail('Hero search must not restore manual site-map destination catalogs');
    }
    if (search.includes("value: 'Ushuaia'") || search.includes('${result.value}${result.hash}')) {
      fail('Hero search must not hard-code the current protocol or append redundant hashes to pretty routes');
    }
    if (stakingChamber.includes('requestedAmount')) {
      fail('Staking Chamber must filter TzKT actual processed amount, never requestedAmount');
    }
    if (/amountMutez\(row\)\s*>=\s*LARGE_MOVE_THRESHOLD_MUTEZ/.test(stakingChamber)) {
      fail('Staking Chamber threshold must stay strictly greater than 10,000 tez');
    }
    if (!/@media\s*\(max-width:\s*759px\)[\s\S]*?\.staking-chamber-content\s*\{[\s\S]*?width:\s*calc\(100vw\s*-\s*0\.875rem\)/.test(stakingChamberCss)) {
      fail('Staking Chamber mobile modal must remain viewport-contained');
    }
    pass('Staking Chamber strict amount, archive, route, and responsive contracts checked');
    if (!/\.health-consensus-panel[^\{]*\{[^}]*grid-column:\s*1\s*\/\s*-1\s*;/s.test(healthStyles)) {
      fail('Network Health Consensus Lens must span the full dashboard width');
    }
    const continuityPanelIndex = health.indexOf('${renderContinuityProofPanel(data)}');
    const promotedCyclePanelIndex = health.indexOf('${renderCycleTimingPanel(data)}', continuityPanelIndex);
    const healthDashboardIndex = health.indexOf('<div class="lb-dashboard-grid health-dashboard-grid">', continuityPanelIndex);
    if (!(continuityPanelIndex >= 0
        && promotedCyclePanelIndex > continuityPanelIndex
        && promotedCyclePanelIndex < healthDashboardIndex)) {
      fail('Network Health cycle progress must sit directly below Mainnet Continuity and above the detailed health grid');
    }
    if (!/\.health-continuity-runtime\s*\{[^}]*font-size:\s*clamp\(1\.3rem,\s*2\.5vw,\s*1\.9rem\);/s.test(styles)
        || !/@media\s*\(max-width:\s*760px\)[\s\S]*?\.health-continuity-runtime\s*\{[^}]*font-size:\s*clamp\(1rem,\s*4\.5vw,\s*1\.35rem\);/s.test(styles)) {
      fail('Network Health Mainnet Continuity counter must retain its compact desktop and mobile type scales');
    }
    pass('Network Health continuity and cycle-progress hierarchy checked');
    if (styles.includes('top-continuity-digits-') || app.includes('top-continuity-digits-')) {
      fail('top continuity runtime must use natural segment widths, not fixed digit slots');
    }
    if (index.includes('live-feed-pill') || index.includes('header-nft-feed-btn')) {
      fail('header must not expose a separate NFT Feed action');
    }
    const headerMyTezosIndex = index.indexOf('id="my-tezos-btn"');
    const headerExploreIndex = index.indexOf('id="features-gear"', headerMyTezosIndex);
    const headerSetupIndex = index.indexOf('id="settings-gear"', headerExploreIndex);
    if (!(headerMyTezosIndex >= 0
        && headerExploreIndex > headerMyTezosIndex
        && headerSetupIndex > headerExploreIndex)) {
      fail('header actions must stay ordered My Tezos, Explore, Setup');
    }
    if (!index.includes('id="hen-launcher" class="hen-launcher corner-gift-item" href="/hen/"')) {
      fail('HEN must remain discoverable through the corner gift tray');
    }
    for (const snippet of [
      'id="features-gear" class="glass-button header-nav-btn" aria-label="Open feature launcher" aria-haspopup="dialog" aria-controls="features-dropdown" aria-expanded="false"',
      'id="features-dropdown" role="dialog" aria-label="Explore Tezos Systems"',
      'id="settings-gear" class="glass-button header-nav-btn header-setup-btn" aria-label="Open setup and settings" aria-haspopup="dialog" aria-controls="settings-dropdown" aria-expanded="false"',
      'id="settings-dropdown" role="dialog" aria-label="Setup and settings"'
    ]) {
      if (!index.includes(snippet)) fail(`header popup semantics missing: ${snippet}`);
    }
    pass('header action priority and responsive labels checked');
    const networkPulseMobileNavBlock = networkPulseCss.match(/@media\s*\(max-width:\s*759px\)\s*\{[\s\S]*?\.network-pulse-nav\s*\{([\s\S]*?)\n\s*\}/)?.[1] || '';
    if (!networkPulseMobileNavBlock.includes('position: static') || !networkPulseMobileNavBlock.includes('flex-wrap: wrap')) {
      fail('Network Pulse mobile nav must wrap in normal flow instead of using an off-viewport scroll strip');
    }
    if (networkPulseMobileNavBlock.includes('overflow-x: auto') || networkPulseMobileNavBlock.includes('flex-wrap: nowrap')) {
      fail('Network Pulse mobile nav must not use horizontal overflow or nowrap pills');
    }
    const roomSelectorBlock = networkPulse.match(/const ROOM_VALUE_SELECTORS\s*=\s*\{([\s\S]*?)\n\};/)?.[1] || '';
    if (!roomSelectorBlock) {
      fail('Network Pulse room value selectors must stay explicit and checkable');
    } else {
      const selectorIds = Array.from(roomSelectorBlock.matchAll(/:\s*['"]#([^'"]+)['"]/g), (match) => match[1]);
      const selectorSurfaceFiles = await walk('.', (file) => /\.(?:html|js|mjs)$/.test(file) && !file.startsWith('node_modules/'));
      const selectorSurfaceText = (await Promise.all(selectorSurfaceFiles.map((file) => readText(file)))).join('\n');
      for (const id of selectorIds) {
        const hasId = selectorSurfaceText.includes(`id="${id}"`) || selectorSurfaceText.includes(`id='${id}'`);
        if (!hasId) fail(`Network Pulse room selector references missing DOM id: #${id}`);
      }
      pass(`Network Pulse room selectors checked: ${selectorIds.length}`);
    }
    const protocolEntryRailBlock = app.match(/function buildProtocolEntryRail[\s\S]*?function protocolDate/)?.[0] || '';
    if (!protocolEntryRailBlock.includes('PROTOCOL_ENTRY_RECENT_FALLBACK') || !protocolEntryRailBlock.includes('getProtocolEntryOrdinal(protocol, list)')) {
      fail('Protocol Anthology rail must use shared upgrade ordinals so Paris C stays a follow-up');
    }
    if (protocolEntryRailBlock.includes('chapterBase') || protocolEntryRailBlock.includes('list.length : 22')) {
      fail('Protocol Anthology rail must not derive chapter labels from raw protocol record length');
    }
    const protocolAnthologyBoardBlock = app.match(/function renderProtocolAnthologyBoard[\s\S]*?function updateProtocolHistoryEntryCard/)?.[0] || '';
    if (!protocolAnthologyBoardBlock.includes('const chapterCount = countProtocolUpgrades(enriched)')) {
      fail('Protocol Anthology board metric must use shared upgrade count convention');
    }
    const protocolEntryCardBlock = app.match(/function updateProtocolHistoryEntryCard[\s\S]*?function ensureProtocolHistoryEntryCard/)?.[0] || '';
    if (!protocolEntryCardBlock.includes('const count = Math.max(CANONICAL_UPGRADE_COUNT, countProtocolUpgrades(list, 0))')) {
      fail('Protocol Anthology entry card total must use shared upgrade count convention with canonical fallback');
    }
    if (protocolEntryCardBlock.includes('list.length || 22') || protocolEntryCardBlock.includes('id="protocol-history-entry-count">22')) {
      fail('Protocol Anthology entry card must not show raw 22-record protocol total');
    }
    if (heroSearchCss.includes('dissolve-into-search') || heroSearchCss.includes('blockTickerAperture')) {
      fail('Live Head rows must not dissolve into the search well');
    }
    const chainHeartbeatUpdateBlock = health.match(/function updateBlockTicker[\s\S]*?function wireCycleChipHealthLauncher/)?.[0] || '';
    const chainHealthStripBlock = health.match(/function updateChainHealthStrip[\s\S]*?function blockTickerFallback/)?.[0] || '';
    if (!health.includes('const CHAIN_HEALTH_BLOCK_LIMIT = 25;')
        || !health.includes('const LAST_BLOCK_LIMIT = CHAIN_HEALTH_BLOCK_LIMIT;')
        || !chainHealthStripBlock.includes("document.visibilityState !== 'visible'")
        || !chainHealthStripBlock.includes('quietlySyncHtml(viewport,')
        || !chainHealthStripBlock.includes('latestBlockStatus(block)')
        || !chainHealthStripBlock.includes('liveHeadMotionAllowed({ suppressMotion })')
        || !chainHealthStripBlock.includes('error && viewport.children.length')
        || !chainHealthStripBlock.includes('advance > 0 && advance < visibleBlockLimit')
        || !index.includes('id="chain-health-window"')) {
      fail('Chain health must retain 25 keyed attestation receipts with visibility-gated quiet reconciliation, last-good failure state, and new-head-only motion');
    }
    const chainHealthStateBlock = health.match(/function chainHealthState[\s\S]*?function updateChainHealthStrip/)?.[0] || '';
    const chainHealthCssBlock = heroSearchCss.match(/\.chain-health \{[\s\S]*?\.live-head-filter-toggle \{/)?.[0] || '';
    if (!index.includes('class="chain-health-heading"')
        || !index.includes('class="chain-health-separator" aria-hidden="true">•</span>')
        || !index.includes('class="chain-health-divider" aria-hidden="true"')
        || !chainHealthStateBlock.includes('data-quiet-key="chain-health-count"')
        || !heroSearchCss.includes('.chain-health-count {\n    display: inline-block;\n    width: 2ch;'))
      fail('Chain Health must retain a keyed two-digit numerator and a balanced divider');
    if (!index.includes('class="chain-health-heading"')
        || !heroSearchCss.includes('.header-activity-cluster-kicker,\n.chain-health-heading')
        || !chainHealthCssBlock.includes('grid-template-rows: 22px;')
        || heroSearchCss.includes('.chain-health-label-lead { display: none; }')) {
      fail('Activity and Chain Health must share single-line full headings with the health readout inline');
    }
    if (!chainHealthStateBlock.includes('latestBlockStatus(block)')
        || !chainHealthStateBlock.includes('status.safetyMargin < 0')
        || !chainHealthStateBlock.includes('const total = states.length')
        || !['perfect', 'strong', 'watch', 'low', 'dire', 'risk', 'unknown'].every(tone => chainHealthStateBlock.includes('${counts.' + tone + '}/${total}'))
        || !chainHealthStateBlock.includes('counts.unknown')
        || !chainHealthStateBlock.includes("tone === 'risk' ? readout.sentence : ''")
        || !chainHealthStripBlock.includes('sourceStamp <= Number(button.dataset.sourceStamp || 0)')
        || !chainHealthStripBlock.includes("? ' is-head' : ''")
        || !chainHealthStripBlock.includes('chainHealthMissedCopy(block, missedStates[index])')
        || !health.includes('fetchHeartbeatMissedRights(data.chainHealthBlocks || data.blocks)')
        || !health.includes('function renderChainHealthInspector')
        || index.indexOf('id="header-activity-button"') > index.indexOf('id="chain-health"')
        || !index.includes('aria-describedby="chain-health-legend"')
        || !index.includes('id="chain-health-announcer"')
        || !chainHealthCssBlock.includes('--chain-health-count: 25')
        || !chainHealthCssBlock.includes('--attestation-perfect-color')
        || !chainHealthCssBlock.includes('height: var(--attestation-strip-height)')
        || !['100%', '80%', '60%', '40%', '20%'].every(fill => heroSearchCss.includes(`--attestation-fill: ${fill};`))
        || !styles.includes('height: var(--attestation-fill)')
        || !chainHealthCssBlock.includes('@media (forced-colors: active)')
        || /#[a-f\d]{3,8}\b/i.test(chainHealthCssBlock)) {
      fail('Chain health must share quorum semantics, disclose the complete window including unknowns, announce only risk entry, retain source failure, and use theme-aware height cues');
    }
    // Exercise production classification at both sides of each display boundary,
    // including a different committee and the integer-rounded quorum.
    const classifyReceipt = vm.runInNewContext(`${health.slice(health.indexOf('function latestBlockStatus('), health.indexOf('function chainHealthReadout('))}; ({ latestBlockStatus, chainHealthState })`, { formatCount: String });
    for (const [committee, power, expected] of [
      [7000, 7000, 'perfect'], [7000, 6999, 'strong'], [7000, 6500, 'strong'],
      [7000, 6499, 'watch'], [7000, 6000, 'watch'],
      [7000, 5999, 'low'], [7000, 5500, 'low'],
      [7000, 5499, 'dire'], [7000, 5000, 'dire'], [7000, 4700, 'dire'],
      [7000, 4667, 'dire'], [7000, 4666, 'risk'], [7000, 0, 'risk'],
      [14000, 14000, 'perfect'], [14000, 13999, 'strong'], [14000, 13000, 'strong'],
      [14000, 12999, 'watch'], [14000, 12000, 'watch'],
      [14000, 11999, 'low'], [14000, 11000, 'low'],
      [14000, 10999, 'dire'], [14000, 9400, 'dire'],
      [14000, 9334, 'dire'], [14000, 9333, 'risk']
    ]) {
      const block = { committee, power, score: power / committee * 100 };
      assert.equal(classifyReceipt.chainHealthState(block), expected, `${power}/${committee} attestation band`);
      assert.equal(classifyReceipt.latestBlockStatus(block).safetyMargin, power - Math.ceil(committee * 2 / 3));
    }
    for (const block of [{}, { score: null, power: null, committee: 7000 }, { score: 100, power: 0, committee: 0 }]) {
      assert.equal(classifyReceipt.chainHealthState(block), 'unknown', 'Unavailable power is not healthy or a quorum failure');
    }
    for (const renderer of ['renderLiveHeadRow', 'renderRecentBlockRow', 'renderBlock']) {
      const block = health.slice(health.indexOf(`function ${renderer}(`)).split('\nfunction ')[0];
      assert(block.includes('chainHealthState(block)') && block.includes('data-attestation-tone='), `${renderer} shares receipt classification and palette`);
    }
    const chainHeartbeatActivityBlock = health.match(/async function fetchHeartbeatActivity[\s\S]*?function requestHeartbeatSupplements/)?.[0] || '';
    const liveHeadRowBlock = health.match(/function renderLiveHeadRow[\s\S]*?function renderLiveHeadRows/)?.[0] || '';
    if (!health.includes('function updateLiveHeadRows')
        || !health.includes('quietlySyncElement(row, renderLiveHeadRow')
        || !health.includes("stack.insertAdjacentHTML('afterbegin'")) {
      fail('Live Head updates must reconcile compatible keyed rows in place');
    }
    if (chainHeartbeatUpdateBlock.includes('stack.innerHTML')) {
      fail('Live Head background updates must not replace the full live stack');
    }
    if (!chainHeartbeatActivityBlock.includes('Promise.allSettled')
        || !chainHeartbeatActivityBlock.includes('story?.complete === true && gas?.complete === true')
        || !health.includes('/operations/ballots?${query}')
        || !health.includes('/operations/proposals?${query}')
        || !health.includes('/voting/periods?firstLevel.ge=${startLevel}')
        || !health.includes('fetchHeartbeatL1Voting(visible)')
        || !chainHeartbeatActivityBlock.includes('transactions?.filter(isEtherlinkGovernanceActivity)')
        || !chainHeartbeatActivityBlock.includes('managerOperations !== null')
        || !chainHeartbeatActivityBlock.includes('evidenceRows !== null')
        || !chainHeartbeatActivityBlock.includes('milestoneRows')) {
      fail('Live Head stories must preserve partial-source receipt truth instead of coercing unavailable data to zero');
    }
    const powerIndex = liveHeadRowBlock.indexOf('live-head-power health-power');
    const trackIndex = liveHeadRowBlock.indexOf('live-head-power-track');
    const activityStatusIndex = liveHeadRowBlock.indexOf('${activityStatus}');
    if (!(powerIndex >= 0 && trackIndex > powerIndex && activityStatusIndex > trackIndex)
        || liveHeadRowBlock.includes('class="live-head-missed"')
        || liveHeadRowBlock.includes('${missed}')) {
      fail('Live Head must read attestation power, safety-margin rail, then Quiet/gas status without repeating aggregate missed power');
    }
    if (!health.includes("if (story.quiet === true) return { state: 'quiet'")
        || !health.includes("if (gas.state === 'quiet')")
        || !health.includes("if (gas.state === 'unavailable')")
        || !health.includes('data-gas-percent=')) {
      fail('Live Head must render Quiet and factual gas fullness as mutually exclusive, truth-preserving top-line states');
    }
    if (!index.includes('id="live-head-inspector"')
        || !health.includes('function renderLiveHeadInspector(')
        || !health.includes('function wireLiveHeadInspector(')
        || !health.includes('function liveHeadReadingPaused()')
        || !health.includes('function queueLiveHeadPausedUpdate(')
        || !health.includes('function resumeLiveHeadAfterInspector()')
        || !health.includes("panel.dataset.readingPaused = 'true'")
        || !health.includes('suppressMotion: true')
        || !health.includes("document.addEventListener('pointerdown'")
        || !health.includes("event.target.closest('#live-head-inspector')")
        || !health.includes("event.target.closest('.live-head-info')")
        || !health.includes("event.target.closest('.live-head-row[data-live-head-level]')")
        || !health.includes("event.target.closest('a, button, input, select, textarea, [role=\"button\"], [contenteditable=\"true\"]')")
        || !health.includes('class="live-head-info"')
        || !health.includes('liveHeadBlockUrl(level, { operations: true })')
        || !health.includes('href="/#my-baker=${encoded}"')
        || !health.includes('data-live-head-open-health')
        || !health.includes('maxFragments: LIVE_HEAD_ACTIVITY_TYPES.length + 3')
        || !heroSearchCss.includes('.live-head-inspector-fact')
        || !heroSearchCss.includes('.live-head-inspector-health')
        || !heroSearchCss.includes('.live-head-info:is(:hover, :focus-visible)')) {
      fail('Every Live Head block must expose its complete linked inspector from info hover/focus or a non-interactive row click, retain the lock while that receipt scrolls, and release one quiet catch-up on click-away');
    }
    if (!index.includes('id="live-head-alert"')
        || !index.includes('id="chain-stall-announcer"')
        || !index.includes('data-live-head-alert-duration')
        || !health.includes('const LIVE_HEAD_STALLED_AFTER = 24 * 1000')
        || !health.includes('function confirmLiveHeadObservation(')
        || !health.includes("liveHeadStallLatchedLevel = level")
        || !health.includes("label.textContent = state === 'stalled' ? 'CHAIN STALLED' : 'BLOCKS DELAYED'")
        || !health.includes('liveHeadResumePendingLevel = level')
        || !health.includes("state === 'live' && (previousState === 'stalled' || liveHeadResumePendingLevel > 0)")
        || !heroSearchCss.includes('.live-head-panel[data-chain-state="stalled"]')
        || !heroSearchCss.includes('.live-head-alert-copy strong')
        || !/\.live-head-panel \.live-head-alert\[data-chain-state="stalled"\]\s*\{\s*inset: -1px;/.test(heroSearchCss)
        || !heroSearchCss.includes('place-items: center;')
        || !/\.live-head-alert\s*\{[\s\S]*?position:\s*absolute;/.test(heroSearchCss)) {
      fail('Live Head must latch a source-confirmed stale head into an unmistakable chain-stall alert until a newer block resumes the chain');
    }
    if (!index.includes('id="live-head-filter-menu"')
        || !['l1-vote', 'l2-vote', 'etherlink', 'dal', 'art', 'defi', 'gaming', 'bridge', 'domains', 'stake', 'unstake', 'delegate', 'tokens', 'contract', 'transfers', 'calls'].every((kind) => index.includes(`data-live-head-filter-kind="${kind}"`))
        || !health.includes('id="health-block-filter-menu"')
        || !['l1-vote', 'l2-vote', 'etherlink', 'dal', 'art', 'defi', 'gaming', 'bridge', 'domains', 'stake', 'unstake', 'delegate', 'tokens', 'contract', 'transfers', 'calls'].every((kind) => health.includes(`data-live-head-filter-kind="${kind}"`))
        || !health.includes('LIVE_HEAD_ACTIVITY_FILTER_STORAGE_KEY')
        || !health.includes("tezos-systems-live-head-activity-filter-v3")
        || !health.includes('function wireLiveHeadActivityFilter(')
        || !health.includes('function syncAllLiveHeadActivityFilterUis(')
        || !health.includes('data-live-head-kind=')
        || !health.includes('data-live-head-mandatory=')
        || !health.includes("pill.dataset.liveHeadMandatory !== 'true'")
        || !health.includes('fitLiveHeadPills(panel)')
        || !heroSearchCss.includes('.live-head-filter-menu button[aria-pressed="false"]')) {
      fail('Live Head and Network Health Passing Blocks must share one persisted all-on normal-activity setup, keep exceptional chain receipts unfiltered, and apply each category choice through measured pill fitting');
    }
    if (!index.includes('id="live-head-my-tezos-setting"')
        || (index.match(/data-live-head-my-tezos-toggle/g) || []).length < 2
        || !health.includes('data-live-head-my-tezos-toggle')
        || !health.includes("import { readSavedMyTezosEntries } from '../core/wallet.js'")
        || !health.includes('LIVE_HEAD_MY_TEZOS_STORAGE_KEY')
        || !health.includes('actorAddresses: collectHeartbeatActorAddresses(')
        || !chainHeartbeatActivityBlock.includes('managerOperations,')
        || !chainHeartbeatActivityBlock.includes('evidenceRows,')
        || !health.includes('&& !transactionsClipped')
        || !health.includes('&& !stakingClipped')
        || !health.includes('&& !tokenTransfersClipped')
        || !health.includes('&& !l1VotingClipped')
        || !health.includes('function syncLiveHeadMyTezosRows()')
        || !health.includes('quietlyMutate(surface.container')
        || !health.includes('data-my-tezos-block-state="${personal.state}"')
        || !health.includes("!row.classList.contains('is-my-tezos-filtered-out') && row.getClientRects().length > 0")
        || !health.includes('const exitGhosts = motionAllowed && !liveHeadMyTezosOnly')
        || !health.includes("window.addEventListener('my-tezos-portfolio-changed'")
        || health.includes('ensureLiveHeadMyTezosStatus')
        || health.includes('Watching My Tezos')
        || !heroSearchCss.includes('.live-head-row.is-my-tezos-filtered-out')
        || heroSearchCss.includes('.live-head-my-tezos-status')
        || !heroSearchCss.includes('--live-head-row-pitch: 62px')
        || !heroSearchCss.includes('--live-head-row-pitch: 66px')
        || !heroSearchCss.includes('var(--live-head-row-count, var(--live-head-default-rows))')
        || !heroSearchCss.includes('html[data-live-head-my-tezos-only="true"] .live-head-stack')
        || !heroSearchCss.includes('height: var(--live-head-stack-height)')
        || !heroSearchCss.includes('max-height: var(--live-head-stack-height)')
        || !/\.live-head-depth-rail\s*\{[\s\S]*?justify-content:\s*flex-end;/.test(heroSearchCss)
        || !networkHealthCss.includes('.health-block-row.is-my-tezos-filtered-out')
        || !shellExtrasCss.includes('.live-head-my-tezos-setting-count')) {
      fail('Setup must persist one silent My Tezos-only block monitor, preclassify rows before insertion, exclude hidden rows from exit ghosts, preserve selected row geometry, align the mini selector to the right edge, and reconcile both block surfaces quietly');
    }
    if (!health.includes('live-head-baker-name')
        || !health.includes('live-head-story-connector')
        || !heroSearchCss.includes('.live-head-story-connector::after')) {
      fail('Live Head baker identities must hand receipts across a restrained right-pointing connector without spending receipt width');
    }
    if (!/\.live-head-baker-prefix\s*\{[^}]*min-width:\s*0;[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;/.test(heroSearchCss)
        || !/\.live-head-baker-suffix\s*\{[^}]*display:\s*inline-block;/.test(heroSearchCss)
        || !health.includes("name.style.setProperty('--live-head-baker-suffix-width', value)")) {
      fail('Live Head raw addresses must shorten only their prefix while retaining their identifying suffix and complete DOM text');
    }
    if (!app.includes("import { initPlatformTextFallbacks } from './platform-text.js'")
        || !app.includes("safe('platformTextFallbacks', initPlatformTextFallbacks)")
        || !(await pathExists('js/core/platform-text.js'))) {
      fail('dashboard must initialize the iOS-safe Tezos glyph text fallback');
    }
    if (!heroSearchCss.includes('.live-head-quiet,\n.live-head-gas,\n.live-head-story-chip,\n.live-head-miss-pill')
        || !heroSearchCss.includes('background: rgba(11, 18, 34, 0.88);')
        || !heroSearchCss.includes('box-shadow: inset 0 0 0 1px color-mix(in srgb, currentColor 10%, transparent)')
        || !heroSearchCss.includes('text-shadow: 0 1px 2px rgba(2, 8, 18, 0.9);')
        || !heroSearchCss.includes('backdrop-filter: blur(4px);')) {
      fail('Every Live Head pill must inherit Quiet\'s opaque theme-invariant backing, shadow, and blur');
    }
    const storyPillCss = heroSearchCss.match(/\.live-head-story-chip:not\(\.is-round-miss\),\n\.live-head-miss-pill \{[\s\S]*?\n\}/)?.[0] || '';
    if (!storyPillCss.includes('border-color: transparent;') || storyPillCss.includes('inset')) {
      fail('Every lower-line pill except a missed-round receipt must keep its fill without a visible border or inset outline');
    }
    if (!chainHeartbeatActivityBlock.includes('/tokens/transfers?level=${level}')
        || chainHeartbeatActivityBlock.includes('token.metadata.artifactUri.null=false')
        || !chainHeartbeatActivityBlock.includes('token.metadata.symbol as symbol')
        || !chainHeartbeatActivityBlock.includes('HEARTBEAT_TOKEN_TRANSFER_LIMIT')
        || !chainHeartbeatActivityBlock.includes('tokenTransfersClipped')
        || !health.includes('/operations/3`')
        || !health.includes('/operations/2`')
        || !health.includes('flattenAppliedManagerOperations')
        || !health.includes('flattenAppliedEvidenceOperations')
        || !health.includes('data-live-head-details=')
        || !health.includes('LIVE_HEAD_DETAIL_MIN_WIDTH = 420')
        || !health.includes('pill.scrollWidth > pill.clientWidth + 1')
        || health.includes("story.fragments.filter((fragment) => fragment.key !== 'quiet').slice(0, 2)")) {
      fail('Live Head activity pills must reuse exact block receipts, classify all token transfers without double-counting art, and spend only measured spare row width on richer details');
    }
    const heartbeatBaseCacheIndex = chainHeartbeatActivityBlock.indexOf('heartbeatActivityCache.set(level, activity)');
    const heartbeatEnrichmentIndex = chainHeartbeatActivityBlock.indexOf('const needsDelegationEnrichment');
    const heartbeatEnrichmentBlock = chainHeartbeatActivityBlock.match(/const enrichmentPromise = Promise\.allSettled\([\s\S]*?heartbeatActivityEnrichmentInFlight\.set\(level, enrichmentPromise\);/)?.[0] || '';
    if (!health.includes('const heartbeatActivityEnrichmentInFlight = new Map()')
        || !(heartbeatBaseCacheIndex >= 0 && heartbeatEnrichmentIndex > heartbeatBaseCacheIndex)
        || !chainHeartbeatActivityBlock.includes('delegationRows: []')
        || !chainHeartbeatActivityBlock.includes('originationRows: []')
        || !chainHeartbeatActivityBlock.includes('heartbeatActivityCache.get(level) !== activity')
        || !heartbeatEnrichmentBlock.includes('/operations/delegations?level=${level}')
        || !heartbeatEnrichmentBlock.includes('/operations/originations?level=${level}')
        || heartbeatEnrichmentBlock.includes("priority: 'interactive'")
        || !heartbeatEnrichmentBlock.includes('updateBlockTicker(heartbeatData, { supplemental: true })')) {
      fail('Optional delegation and origination enrichment must yield to explicit user work, leave the complete base receipt available first, and reconcile only the matching cached block');
    }
    for (const bannedLiveHeadCopy of ['Syncing latest head block', 'Waiting for recent block receipts', 'Receipts syncing', 'Preparing block stories']) {
      if (index.includes(bannedLiveHeadCopy) || chainHeartbeatUpdateBlock.includes(bannedLiveHeadCopy)) {
        fail(`Live Head first paint must use opaque objects instead of visible status copy: ${bannedLiveHeadCopy}`);
      }
    }
    if (!heroSearchCss.includes('height: var(--hero-search-vv-height, 100dvh)')
        || heroSearchCss.includes('max-height: min(40vh, 420px')
        || !search.includes('!event.target.isConnected')
        || !search.includes("window.visualViewport?.addEventListener('scroll', syncViewportGeometry)")) {
      fail('Live Head search must fill the visual viewport and preserve detached result-menu clicks');
    }
    if (index.includes('id="live-head-bakers"')
        || health.includes('function updateLiveHeadBakers')
        || health.includes('LIVE_HEAD_MISS_PILL_LIMIT')
        || !health.includes('data-miss-state=')
        || !health.includes('data-live-head-missed-snapshot=')
        || !health.includes('liveHeadMissedStateFromRow(row, level)')
        || !heroSearchCss.includes('.live-head-story-chip.is-transfers')
        || !heroSearchCss.includes('.live-head-story-chip.is-art')
        || !heroSearchCss.includes('.live-head-miss-pill')
        || !heroSearchCss.includes('text-overflow: ellipsis;')
        || !heroSearchCss.includes('width: calc(100% + 32px);')
        || !heroSearchCss.includes('margin: 4px -16px -8px;')
        || !heroSearchCss.includes('border-top: 0;')) {
      fail('Live Head must put color-coded truncated facts on each block and join the block stack directly to the search well');
    }
    const liveHeadRowCss = heroSearchCss.match(/\.live-head-row \{[\s\S]*?\n\}/)?.[0] || '';
    const liveHeadPanelRuleCss = heroSearchCss.match(/\.live-head-panel\.lb-panel::before \{[\s\S]*?\n\}/)?.[0] || '';
    const liveHeadSearchFormCss = heroSearchCss.match(/\.live-head-panel \.hero-search-form \{[\s\S]*?\n\}/)?.[0] || '';
    if (!liveHeadRowCss
        || /border-bottom\s*:/.test(liveHeadRowCss)
        || !liveHeadRowCss.includes('height: 60px;')
        || !liveHeadRowCss.includes('row-gap: 4px;')
        || !liveHeadPanelRuleCss.includes('content: none;')
        || !liveHeadPanelRuleCss.includes('display: none;')
        || !liveHeadSearchFormCss.includes('border: 0;')
        || !liveHeadSearchFormCss.includes('border-top: 1px solid')
        || !heroSearchCss.includes('.live-head-baker.is-address')
        || !/\.live-head-baker\s*\{[\s\S]*?font-family:\s*'JetBrains Mono'/.test(heroSearchCss)
        || !heroSearchCss.includes('.live-head-panel .hero-search-form > .hero-search-copy > .hero-search-help')
        || !heroSearchCss.includes('@keyframes liveHeadRowReveal')
        || !heroSearchCss.includes('@keyframes liveHeadRowExit')
        || !health.includes("row.style.transform = `translate3d(0, ${delta}px, 0)`")
        || health.includes("import { blockTick }")
        || heroSearchCss.includes('.live-head-power-track::after')
        || heroSearchCss.includes('.live-head-consensus-cue')
        || !heroSearchCss.includes('width: calc(100% * var(--live-head-margin, 0));')
        || !health.includes('data-safety-margin=')) {
      fail('Live Head must remove decorative rules, replace row lines with spacing, and use the search well as its integrated bottom edge');
    }
    if (!health.includes("document.addEventListener('visibilitychange'") || !health.includes("document.visibilityState !== 'visible'")) {
      fail('Chain Heartbeat polling and catch-up must remain visibility gated');
    }
    const roundAlert = health.match(/function dispatchContestedRoundHotSignal\(block\) \{[\s\S]*?\n\}/)?.[0] || '';
    if (!roundAlert.includes('round < 2') || roundAlert.indexOf('round < 2') > roundAlert.indexOf('contestedRoundLastSignalAt()')) {
      fail('R0/R1 must not emit contested-round news or consume its cooldown');
    }
    const marginFillCss = heroSearchCss.match(/\.live-head-power-fill \{[\s\S]*?\n\}/)?.[0] || '';
    const marginLabelCss = heroSearchCss.match(/\.live-head-margin \{[\s\S]*?\n\}/)?.[0] || '';
    if (!heroSearchCss.includes('clamp(61px, 5.6vw, 77px)')
        || !/\.live-head-power-track\s*\{[^}]*min-width:\s*max-content;/.test(heroSearchCss)) {
      fail('Live Head health rails must retain their compact width and a content-sized floor for readable missing-power labels');
    }
    if (!heroSearchCss.includes('grid-template-columns: max-content 100px;')
        || !heroSearchCss.includes('grid-template-columns: max-content 75px;')
        || !marginLabelCss.includes('font: 800 10px/12px var(--font-runtime);')) {
      fail('Chain Health must retain whole-pixel line slots and stable, unscaled margin labels');
    }
    if (!marginFillCss.includes('position: absolute;') || !marginFillCss.includes('inset: 0 auto 0 0;')
        || !marginLabelCss.includes('background: var(--bg-primary);') || !marginLabelCss.includes('color: var(--text-primary);')) {
      fail('The health fill must occupy the full rail with an opaque theme-readable label above it');
    }
    if (marginFillCss.includes('transform:') || !marginFillCss.includes('width: calc(100% * var(--live-head-margin, 0));')) {
      fail('Health rails must size the factual margin without scaling or distorting their rounded fill');
    }
    if (health.includes('fillLiveHeadBars') || heroSearchCss.includes('liveHeadPowerFill') || heroSearchCss.includes('is-bar-filling')) {
      fail('Health rails must paint their factual width immediately without a delayed empty-to-full sweep');
    }
    const bakingMissFetcher = health.match(/async function fetchHeartbeatBakingMisses\(blocks\) \{[\s\S]*?\n\}/)?.[0] || '';
    if (!bakingMissFetcher.includes("document.visibilityState !== 'visible'")
        || !bakingMissFetcher.includes("right.status !== 'missed'")
        || !bakingMissFetcher.includes('right.round >= block.blockRound')
        || !health.includes('data-live-head-baking-snapshot=')
        || !health.includes('data-inspector-baking-misses')
        || !health.includes('fetchHeartbeatBakingMisses(visible)')) {
      fail('R1+ block receipts must list exact earlier missed baking rights with visibility-gated fetching and locked inspector snapshots');
    }
    if (henMode.includes('feed.insertBefore(output, grid())')) {
      fail('HEN CLI output must stay off-flow instead of inserting before the grid');
    }
    if (henMode.includes('hen-listening') || henMode.includes('origPoll')) {
      fail('HEN idle state must use the header/status dot path, not the old injected listening row or dead poll stub');
    }
    if (index.includes('</html>\n>')) {
      fail('index.html must not leave stray text after the closing html tag');
    }
    if (henPage.includes('http-equiv="refresh"') || henPage.includes('location.replace')) {
      fail('/hen/ must render a crawlable entry page instead of an empty redirect stub');
    }
    if (chamberRouteGenerator.includes('location.replace') || chamberRouteGenerator.includes('http-equiv="refresh"')) {
      fail('pretty chamber routes must hydrate the dashboard shell instead of redirecting to hash routes');
    }
    if (henMode.includes('cloudflare-ipfs.com')) {
      fail('HEN mode must not retry through the retired Cloudflare public IPFS gateway');
    }
    if (index.includes('cloudflare-ipfs.com')) {
      fail('CSP must not allow the retired Cloudflare public IPFS gateway');
    }
    if (api.includes('delegateAPY: 3.1') || api.includes('stakeAPY: 9.2')) {
      fail('shared API must not present hardcoded APY fallback values as live measurements');
    }
    for (const retiredSearchCopy of ['Wallet/.tez', 'wallet/domain retrieval surface', 'TzKT boundary', 'No Tezos.Systems room']) {
      if (search.includes(retiredSearchCopy)) fail(`hero search should not retain confusing copy: ${retiredSearchCopy}`);
    }
    if (!/@media \(max-width: 768px\)[\s\S]*?\.hero-search-input\s*\{[\s\S]*?font-size:\s*16px;/.test(heroSearchCss)) {
      fail('mobile hero search input must keep 16px text to avoid iOS focus zoom');
    }
    if (search.includes('window.scrollBy') || search.includes('--hero-search-available-height')) {
      fail('hero search must fill the visual viewport without moving the reader or measuring a below-the-fold remainder');
    }
    if (/<button[\s\S]{0,320}?role="option"/.test(search) || !/<div[\s\S]{0,320}?role="option"/.test(search)) {
      fail('hero search options must use the combobox active-descendant pattern without entering the dialog Tab order');
    }
    if (!/@media \(max-width: 359px\)[\s\S]*?\.hero-search-overlay\.live-head-panel \.hero-search-group\.is-starter\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/.test(heroSearchCss)) {
      fail('the Index Chamber must keep all six starter actions in a two-column grid at 320px');
    }
    if (index.includes('top-continuity-proof-item') || styles.includes('.top-continuity-proof-item')) {
      fail('top header uptime badge should not retain the old Zero Forks / Zero Outages proof stamps');
    }
    if (index.includes('continuity-proof') || styles.includes('continuity-proof') || heroSearchCss.includes('continuity-proof') || app.includes('continuity-proof')) {
      fail('homepage should not retain the retired continuity-proof panel');
    }
    for (const [sourceName, source] of [['index.html', index], ['app.js', app], ['hero-search.css', heroSearchCss], ['styles.css', styles]]) {
      if (source.includes('protocol-ribbon') || source.includes('protocolRibbon') || source.includes('protocol_ribbon') || source.includes('PROTOCOL_RIBBON')) {
        fail(`${sourceName} should not retain the retired homepage protocol ribbon`);
      }
    }
    if (/style=["'][^"']*--pill-color/.test(index)) {
      fail('top header stat pills should use theme palette tokens, not inline --pill-color styles');
    }
    const themeListMatch = themeUi.match(/export const THEMES\s*=\s*\[([\s\S]*?)\];/);
    const registeredThemes = themeListMatch ? Array.from(themeListMatch[1].matchAll(/'([^']+)'/g), (match) => match[1]) : [];
    if (!registeredThemes.length) {
      fail('theme registry should expose the active THEMES list');
    }
    const headerPaletteTokens = [
      '--font-ui',
      '--font-display',
      '--font-data',
      '--font-runtime',
      '--header-title-color',
      '--header-title-glow',
      '--uptime-badge-bg',
      '--uptime-badge-border',
      '--uptime-badge-label',
      '--uptime-badge-value',
      '--uptime-badge-note',
      '--top-pill-bg',
      '--top-pill-bakers',
      '--top-pill-finality',
      '--top-pill-staked',
      '--top-pill-issuance'
    ];
    const rootPaletteBlock = styles.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1] || '';
    for (const theme of registeredThemes) {
      const themeBlockMatch = styles.match(new RegExp(`\\[data-theme="${theme}"\\]\\s*\\{([\\s\\S]*?)\\n\\}`));
      if (!themeBlockMatch) {
        fail(`theme ${theme} should define a CSS variable block for header palette tokens`);
        continue;
      }
      const paletteScope = theme === 'aurora' ? `${rootPaletteBlock}\n${themeBlockMatch[1]}` : themeBlockMatch[1];
      for (const token of headerPaletteTokens) {
        if (!paletteScope.includes(`${token}:`)) {
          fail(`theme ${theme} should define ${token} for title, uptime, and pill colors`);
        }
      }
    }
    const auroraBlock = `${rootPaletteBlock}\n${styles.match(/\[data-theme="aurora"\]\s*\{([\s\S]*?)\n\}/)?.[1] || ''}`;
    for (const color of ['#07111F', '#0D102A', '#45E0C8', '#9B8CFF']) {
      if (!auroraBlock.includes(color)) {
        fail(`Aurora uptime palette should keep the recommended teal-to-violet token ${color}`);
      }
    }
    if (!/Nunito:wght@400;500;600;700;800;900/.test(themePreload)) {
      fail('theme font request should load the rounded Nunito family used by Bubblegum and Moss');
    }
    const bubblegumTypography = styles.match(/\[data-theme="bubblegum"\]\s*\{([\s\S]*?)\n\}/)?.[1] || '';
    if (!bubblegumTypography.includes("--font-ui: 'Nunito'") || !bubblegumTypography.includes("--font-runtime: 'Nunito'")) {
      fail('Bubblegum should use the rounded Nunito UI and runtime roles');
    }
    if (!styles.includes('[data-theme="nerv"] .title') || !styles.includes("--font-display: 'Archivo Black'")) {
      fail('NERV should pair its IBM console UI with the Archivo Black display role');
    }
    pass(`top header theme palette tokens checked: ${registeredThemes.length} themes`);
    const removedProtocolPromptContracts = [
      ['app banner renderer', 'updateGovernanceBanner', app],
      ['app banner selector', 'gov-countdown-banner', app],
      ['app banner slot', 'gov-countdown-banner-slot', app],
      ['index banner slot', 'gov-countdown-banner-slot', index],
      ['source banner styles', 'gov-countdown-banner', styles]
    ];
    for (const [label, snippet, text] of removedProtocolPromptContracts) {
      if (text.includes(snippet)) fail(`removed Current Protocol prompt resurfaced: ${label}`);
    }
    pass(`removed Current Protocol prompt guard checked: ${removedProtocolPromptContracts.length}`);

    const forbiddenCtezInterfaceStrings = [
      'better-call.dev',
      'ctez-wallet-oven-id',
      'ctez-wallet-withdraw-to',
      'ctez-tez-input',
      'ctez-outstanding-input',
      'CTEZ_STORAGE_URL',
      'decimalToMicroString',
      'Wallet flow',
      'chamber-entry-wide ctez-entry-card',
      'ctez-entry-card'
    ];
    for (const snippet of forbiddenCtezInterfaceStrings) {
      if (ctez.includes(snippet)) fail(`ctez chamber should not expose manual recovery UI: ${snippet}`);
    }
    if (wallet.includes('dist/octez.connect.min.js') || wallet.includes('loadScript(')) {
      fail('Octez.Connect wallet loader must avoid the CSP-hostile UMD script bundle');
    }
    const fixedEtherlinkContracts = [
      'KT19oUVQPnVLuUBYXrBVd46WJnNAMpqkKSwo',
      'KT1AXRU3wLc87WNhLhVGrgqDGubLACUMUgPb',
      'KT1VGyd2cRSHoDnxDnSuqGJD3mL8DzcVqX98'
    ];
    for (const address of fixedEtherlinkContracts) {
      if (etherlinkGovernance.includes(address)) fail(`Tezos X Governance chamber should discover active contract, not hardcode ${address}`);
    }
    pass(`deep-link selector contracts checked: ${deepLinkContracts.length}`);
    pass('Protocol Anthology chapter-count convention checked');

    const cardControlContracts = [
      ['Health card copy slot', '.health-entry-card .card-copy-link', styles],
      ['Health card camera slot', '.health-entry-card .card-share-btn', styles],
      ['Network Health pre-init camera slot', '.stat-card[data-stat="network-health"] .card-share-btn', styles],
      ['Chamber history/stat slot', '#chambers-grid .chamber-entry-card > .card-history-btn', styles],
      ['Chamber desktop controls are 80 percent size', '--chamber-control-size: 25.6px;', styles],
      ['Chamber mobile controls are 80 percent size', '--chamber-control-size: 27.2px;', styles],
      ['Chamber controls use shared compact size', 'width: var(--chamber-control-size);', styles],
      ['Chamber camera icon is 80 percent size', '#chambers-grid .chamber-entry-card > .card-share-btn > svg {\n    width: 12px;', styles],
      ['Chamber info icon is 80 percent size', '#chambers-grid .chamber-entry-card > .card-info-btn > svg {\n    width: 12.8px;', styles],
      ['Chamber history/stat desktop bottom placement', 'top: calc(0.85rem + 102px);', styles],
      ['Chamber history/stat mobile bottom placement', 'top: calc(0.78rem + 108px);', styles],
      ['Chamber share helper export', 'export function ensureCardShareButton(card)', share],
      ['Chamber share sync call', 'ensureCardShareButton(card);', app],
      ['Chamber rich share capture helper', 'async function captureChamberCard(card)', share],
      ['Chamber rich share clones visible panel', 'cloneChamberPanel(card)', share],
      ['Chamber rich share html2canvas color sanitizer', 'sanitizeCaptureModernColorStyles(panelClone', share],
      ['Chamber rich share canonical route helper imports', "import { findSiteMapDestination, siteMapCanonicalRoute } from '../core/site-map.js';", share],
      ['Chamber rich share canonical route resolver', "siteMapCanonicalRoute(hash || '#chambers')", share],
      ['Chamber rich share panel label', 'Visible Chamber Panel', share],
      ['Chamber generated info helper', 'function ensureChamberInfoButton(card)', app],
      ['Chamber generated info copy', 'CHAMBER_INFO_COPY', app],
      ['Chamber generated info canonical tooltip id', 'tooltip.id = `tooltip-${key}`;', app],
      ['Chamber top control lane', '--chamber-control-lane', styles],
      ['Chamber content avoids top-right controls', 'padding-right: var(--chamber-control-lane);', styles],
      ['Chamber controls layer above card content', '#chambers-grid .chamber-entry-card > .card-copy-link', styles],
      ['Chamber footer rail exists in flow', '.chamber-entry-footer', styles],
      ['Chamber footer is absolute bottom rail', 'position: absolute;', styles],
      ['Chamber footer uses shared right edge', 'right: var(--chamber-card-inline-padding);', styles],
      ['Chamber footer uses shared left edge', 'left: var(--chamber-card-inline-padding);', styles],
      ['Chamber footer bottom placement is fixed', 'bottom: 0.75rem;', styles],
      ['Chamber open cue style is global', '.chamber-expand-cue {', styles],
      ['Chamber stale freshness uses footer text', '.chamber-entry-card.chamber-data-stale .chamber-entry-freshness', styles],
      ['Chamber pseudo freshness disabled', '.chamber-entry-card[data-updated-label]::after', styles]
    ];
    for (const [label, snippet, text] of cardControlContracts) {
      if (!text.includes(snippet)) fail(`missing card control spacing contract: ${label}`);
    }
    pass(`card control spacing contracts checked: ${cardControlContracts.length}`);

    const expandCueMarkupFiles = [
      'index.html',
      ...(await walk('js', (file) => file.endsWith('.js')
        && file !== 'js/core/app.js'
        && file !== 'js/ui/chamber-accessibility.js'))
    ];
    for (const file of expandCueMarkupFiles) {
      const text = file === 'index.html' ? index : await readText(file);
      if (text.includes('chamber-expand-cue')) {
        fail(`chamber expand cue must be created only by js/core/app.js, found in ${file}`);
      }
    }

    const scopedCueSelectors = [];
    for (const match of styles.matchAll(/([^{}]+)\{/g)) {
      const selectorBlock = match[1].trim();
      if (!selectorBlock.includes('.chamber-expand-cue')) continue;
      selectorBlock.split(',').map((selector) => selector.trim()).forEach((selector) => {
        if (!selector.startsWith('.chamber-expand-cue')) scopedCueSelectors.push(selector);
      });
    }
    if (scopedCueSelectors.length) {
      fail(`chamber expand cue styles must stay unscoped: ${scopedCueSelectors.join(', ')}`);
    }
    pass(`chamber expand cue canonical contracts checked: ${expandCueMarkupFiles.length} source files`);

    const chamberRendererStyleContracts = [
      ['Tezos X Governance timeline row style', '.etherlink-gov-table .etherlink-gov-timeline-row', styles],
      ['Tezos X Governance timeline row removes browser underline', 'a.etherlink-gov-timeline-row:hover', styles],
      ['Tezos X Governance failure-red launcher state', '[data-etherlink-governance-state="risk"] .etherlink-gov-entry-value', shellExtrasCss],
      ['Tezos X Governance recent baker quorum styles', '.etherlink-gov-baker-vote-row', shellExtrasCss],
      ['tz4 monthly bar rail style', '.tz4-month-bars', styles],
      ['tz4 monthly bar column style', '.tz4-month-bar {', styles],
      ['tz4 monthly bar visible count style', '.tz4-month-count', styles],
      ['tz4 monthly bar fill style', '.tz4-month-fill', styles],
      ['tz4 first movers top 10 cap', '.slice(0, 10)', tz4],
      ['ctez console shell style', '.ctez-console-shell', styles],
      ['ctez summary strip style', '.ctez-summary-strip', styles],
      ['ctez oven panel style', '.ctez-oven-panel', styles],
      ['ctez oven card style', '.ctez-oven-card', styles],
      ['ctez utilization bar style', '.ctez-utilization-bar', styles],
      ['ctez detail card style', '.ctez-detail-card', styles],
      ['ctez action button grid style', '.ctez-action-buttons', styles]
    ];
    for (const [label, snippet, text] of chamberRendererStyleContracts) {
      if (!text.includes(snippet)) fail(`missing chamber renderer style contract: ${label}`);
    }
    pass(`chamber renderer style contracts checked: ${chamberRendererStyleContracts.length}`);

    const goatcounterInit = await readText('js/core/goatcounter-init.js');
    const shareTrackingContracts = [
      ['tracked Tezos URL helper', 'export function trackedTezosUrl', share],
      ['stable share campaign', "const SHARE_UTM_CAMPAIGN = 'tezos_systems_shares'", share],
      ['X share source', "return { source: 'x', medium: 'social' }", share],
      ['native share source', "return { source: 'native_share', medium: 'share' }", share],
      ['visible canonical share URL', 'addPreferredShareUrlToText', share],
      ['share text tracking rewrite', 'addShareTrackingToText', share],
      ['preferred canonical share URL', 'preferredUrl || core', share],
      ['share modal event tracking', "trackShareEvent('modal_opened'", share],
      ['native share tracked URL', "'native_share'", share],
      ['X post event tracking', "trackShareEvent('post_x'", share],
      ['editable share tweet composer', 'tweet-compose-text', share],
      ['share handle storage', 'tezos-systems-share-handle', share],
      ['Network Moments share capture helper', 'captureNetworkMomentShare', share],
      ['Network Moments use share modal pipeline', 'captureNetworkMomentShare(moment)', moments],
      ['history share deep link', 'tezos.systems/#history', share],
      ['history copy hidden during capture', 'copyBtn.style.display', share],
      ['GoatCounter event helper', 'trackTezosSystemsEvent', goatcounterInit],
      ['GoatCounter single pageview mode', 'window.goatcounter.no_onload = true', goatcounterInit],
      ['GoatCounter bounded readiness retry', 'flushAttempts >= 40', goatcounterInit]
    ];
    for (const [label, snippet, text] of shareTrackingContracts) {
      if (!text.includes(snippet)) fail(`missing share/tracking contract: ${label}`);
    }
    pass(`share and loop tracking contracts checked: ${shareTrackingContracts.length}`);

    const goatcounterEndpoint = 'data-goatcounter="https://tezsys.goatcounter.com/count"';
    const widgetBuilder = await readText('widgets/builder.html');
    if (!index.includes(goatcounterEndpoint)) fail('dashboard must configure the GoatCounter collection endpoint');
    if (index.indexOf('js/core/goatcounter-init.js') > index.indexOf('src="//gc.zgo.at/count.js"')) {
      fail('dashboard must initialize GoatCounter settings before loading count.js');
    }
    if (!widgetBuilder.includes(goatcounterEndpoint)) fail('widget builder must configure the GoatCounter collection endpoint');
    if (widgetBuilder.indexOf('../js/core/goatcounter-init.js') > widgetBuilder.indexOf('src="//gc.zgo.at/count.js"')) {
      fail('widget builder must initialize GoatCounter settings before loading count.js');
    }
    pass('GoatCounter endpoint and single-pageview initialization checked');

    const rawWidgetLinks = [
      'href="/widgets/price.html"',
      'href="/widgets/baker-card.html"',
      'href="/widgets/staking-ratio.html"',
      'href="/widgets/governance.html"',
      'href="/widgets/combo.html"'
    ];
    for (const rawLink of rawWidgetLinks) {
      if (index.includes(rawLink)) fail(`dashboard should not link directly to raw widget endpoint: ${rawLink}`);
    }
    pass('dashboard widget utility avoids raw widget endpoint links');
  }

  async function checkWidgetRuntimeContracts() {
    const runtimeSource = await readText('widgets/runtime.js');
    const builder = await readText('widgets/builder.html');
    const sw = await readText('sw.js');
    const config = await readText('js/core/config.js');
    const htmlFiles = await walk('widgets', (file) => file.endsWith('.html'));
    const rawWidgetFiles = htmlFiles.filter((file) => file !== 'widgets/builder.html');
    const catalog = Array.from(runtimeSource.matchAll(/type:\s*'([^']+)'[\s\S]*?path:\s*'([^']+)'/g))
      .map((match) => ({ type: match[1], path: match[2] }));
    const catalogPaths = new Set(catalog.map((widget) => `widgets/${widget.path}`));
    const comboStatKeys = Array.from(runtimeSource.matchAll(/key:\s*'([^']+)'/g)).map((match) => match[1]);

    if (!runtimeSource.includes("import '../js/core/tzkt-throttle.js';")) {
      fail('widgets/runtime.js must install the shared TzKT throttle');
    }
    if (!runtimeSource.includes("import { fetchWithRetry } from '../js/core/api.js';")) {
      fail('widgets/runtime.js must reuse the shared fetchWithRetry helper');
    }
    if (!runtimeSource.includes("import { API_URLS, FETCH_LIMITS, STAKING_TARGET } from '../js/core/config.js';")) {
      fail('widgets/runtime.js must read endpoint/fetch/staking constants from js/core/config.js');
    }
    if (!runtimeSource.includes("import { DEFAULT_THEME, THEME_COLORS, THEMES } from '../js/ui/theme.js';")) {
      fail('widgets/runtime.js must share dashboard theme metadata from js/ui/theme.js');
    }
    if (!config.includes("coingecko: 'https://api.coingecko.com/api/v3'")) {
      fail('js/core/config.js must expose the CoinGecko API base for widgets and price surfaces');
    }

    if (!runtimeSource.includes('export const DEFAULT_WIDGET_THEME = DEFAULT_THEME')) {
      fail('widget default theme should follow dashboard DEFAULT_THEME');
    }
    for (const snippet of ["WIDGET_THEME_ORDER = [...THEMES, 'transparent']", 'transparent: { bg:']) {
      if (!runtimeSource.includes(snippet)) fail(`widget theme runtime missing ${snippet}`);
    }
    for (const snippet of [
      'WIDGET_UTM_CAMPAIGN',
      'export function trackedDashboardUrl',
      "params.set('utm_medium', 'widget')",
      'widget_attribution',
      'export function markdownCode'
    ]) {
      if (!runtimeSource.includes(snippet)) fail(`widget attribution runtime missing ${snippet}`);
    }
    for (const key of ['health', 'tz4']) {
      if (!comboStatKeys.includes(key)) {
        fail(`combo widget options missing latest signal: ${key}`);
      }
    }

    for (const file of rawWidgetFiles) {
      const text = await readText(file);
      if (!catalogPaths.has(file)) fail(`widgets/runtime.js catalog missing raw widget page ${file}`);
      if (!text.includes("from './runtime.js'")) fail(`${file} must import widgets/runtime.js`);
      if (/https:\/\/api\.tzkt\.io\/v1|https:\/\/api\.coingecko\.com\/api\/v3/.test(text)) {
        fail(`${file} must not hardcode TzKT/CoinGecko API hosts; use widgets/runtime.js`);
      }
      if (text.includes("const THEMES") || text.includes('THEME_NAMES')) {
        fail(`${file} must not maintain a private theme list`);
      }
      if (!text.includes('utm_medium=widget_attribution')) {
        fail(`${file} footer must link back with widget attribution params`);
      }
      if (!text.includes('powered by tezos.systems ->')) {
        fail(`${file} footer must visibly credit tezos.systems`);
      }
      if (text.includes('gc.zgo.at') || text.includes('../js/core/goatcounter-init.js')) {
        fail(`${file} must not load third-party analytics inside an embedding site`);
      }
    }

    for (const widget of catalog) {
      const file = `widgets/${widget.path}`;
      if (!(await pathExists(file))) fail(`widgets/runtime.js catalog points at missing widget ${file}`);
    }
    if (catalog.length !== rawWidgetFiles.length) {
      fail(`widgets/runtime.js catalog count ${catalog.length} must match raw widget pages ${rawWidgetFiles.length}`);
    }

    for (const snippet of ['WIDGET_CATALOG', 'WIDGET_THEME_ORDER', 'COMBO_STAT_OPTIONS', "from './runtime.js'"]) {
      if (!builder.includes(snippet)) fail(`widgets/builder.html must derive ${snippet} from widgets/runtime.js`);
    }
    if (!builder.includes('max="3600"')) {
      fail('widgets/builder.html refresh slider must support the runtime one-hour upper bound');
    }
    if (!builder.includes('widget_builder_copy')) {
      fail('widgets/builder.html must track embed-code copy events');
    }
    if (!runtimeSource.includes('activeBakerCount()') || !runtimeSource.includes('/delegates/count?active=true&bakingPower.gt=0')) {
      fail('baker-count widgets must use the TzKT aggregate count endpoint');
    }
    if (!runtimeSource.includes('document.hidden') || !runtimeSource.includes("document.addEventListener('visibilitychange'")) {
      fail('widget refresh loops must pause while their document is hidden');
    }
    if (!runtimeSource.includes("directUrl.searchParams.set('utm_medium', 'widget_markdown')")
        || !/return `\[Open the Tezos \$\{type\} widget\]\(\$\{directUrl\.toString\(\)\}\)`/.test(runtimeSource)) {
      fail('Markdown widget output must be a directly attributed working link, not image syntax pointed at HTML');
    }

    if (!sw.includes('RUNTIME_CACHE_LIMIT') || !sw.includes('putBounded(RUNTIME_CACHE')) {
      fail('sw.js must cache optional widgets and feature assets on use in a bounded runtime cache');
    }
    for (const file of ['widgets/runtime.js', ...htmlFiles]) {
      if (sw.includes(`'/${file}'`) || sw.includes(`"/${file}"`)) {
        fail(`sw.js install shell must not eagerly precache optional widget asset /${file}`);
      }
    }

    pass(`widget runtime contracts checked: ${catalog.length} widgets, ${comboStatKeys.length} combo stat options`);
  }

  return { checkCacheBustAlignment, checkCsp, checkSelectorContracts, checkWidgetRuntimeContracts };
}
