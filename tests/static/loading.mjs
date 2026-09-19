// Static contracts owned by loading. Shared dependencies remain explicit.
export function createLoadingStaticChecks({
  CHAMBER_FEATURES,
  CHAMBER_ROUTES,
  ROOT,
  STATIC_CHECKS,
  assert,
  createHash,
  fail,
  fs,
  pass,
  path,
  readInitialLoadMeasurementSource,
  readText,
  stableJsonHash,
  standaloneFeatureForRoute
}) {
  async function checkInitialLoadMeasurementContracts() {
    const measurement = await readInitialLoadMeasurementSource();
    const baselineText = await readText('tests/fixtures/initial-load-baseline.json');
    const baseline = JSON.parse(baselineText);
    if (createHash('sha256').update(baselineText).digest('hex') !== '3ce79dfc474f4490f12c412aac30495e51d80bc2d2f390cac627e0ba4d21f752') {
      fail('the historical initial-load baseline must remain byte-for-byte unchanged; publish new dated measurements separately');
    }
    const packageJson = JSON.parse(await readText('package.json'));
    const requiredMeasurementContracts = [
      "require('./lib/playwright-browser.cjs')",
      "serviceWorkers: profile.cache === 'installed-worker' ? 'allow' : 'block'",
      'Network.setCacheDisabled',
      'cacheDisabled: false',
      "document.visibilityState",
      "type: 'layout-shift'",
      "type: 'longtask'",
      'eagerJsDecodedBytes',
      'sameOriginDecodedBytes',
      'domInteractiveMs',
      'domContentLoadedMs',
      'longestTaskMs',
      'totalBlockingTimeMs',
      'serviceWorkerResponseCount',
      'readiness',
      'deferredChamberResources',
      'classifyLauncherResources',
      'assessInitialLoadResources',
      'validateInitialLoadReadiness',
      'launcherIntersections',
      'visibleLauncherResources',
      'duplicateModuleRequests',
      'forbiddenHeavyResources',
      "page.on('pageerror'",
      'decodedBytesWithinFivePct',
      'rawLongTasksWithinFifteenPct',
      'totalBlockingTimeMaxAdjacentDeltaPct',
      'totalBlockingTimeWithinFifteenPct',
      'warmupRuns',
      'warmupDiagnostics',
      '--warmup-runs',
      '--require-stable',
      'stability acceptance failed'
    ];
    for (const contract of requiredMeasurementContracts) {
      if (!measurement.includes(contract)) fail(`initial-load measurement harness is missing contract: ${contract}`);
    }
    if (/\bpage\.clock\./.test(measurement)) {
      fail('initial-load measurements must preserve native Performance APIs; use Date-only fixture time instead of the Playwright clock');
    }
    if (packageJson.scripts?.['measure:load'] !== 'node scripts/measure-initial-load.mjs') {
      fail('package scripts must expose the repeatable initial-load measurement harness');
    }
    if (packageJson.scripts?.['measure:load:stable'] !== 'node scripts/measure-initial-load.mjs --require-stable') {
      fail('package scripts must expose the threshold-enforcing initial-load measurement mode');
    }
    if (baseline.schemaVersion !== 1
      || !/^[0-9a-f]{40}$/.test(baseline.commit || '')
      || baseline.profile?.serviceWorkers !== 'blocked'
      || baseline.profile?.runs !== 5
      || baseline.medians?.sameOriginDecodedBytes < 1_000_000
      || typeof baseline.stability?.decodedBytesWithinFivePct !== 'boolean'
      || typeof baseline.stability?.longTasksWithinFifteenPct !== 'boolean'
      || !Array.isArray(baseline.largestResources)
      || baseline.largestResources.length < 20
      || baseline.largestResources.some((resource) => !Number.isFinite(resource.medianDecodedBytes) || resource.observedRuns !== 5)) {
      fail('initial-load baseline must retain the dated five-run clean-profile reference row');
    }

    pass(`initial-load measurement harness and ${baseline.measuredAt.slice(0, 10)} baseline checked`);

    const chamberMeasurement = await readText('scripts/measure-chamber-boot.mjs');
    if (packageJson.scripts?.['measure:chamber-boot'] !== 'node scripts/measure-chamber-boot.mjs') {
      fail('package scripts must expose the cache-enabled Chamber boot measurement');
    }
    for (const contract of ["require('./lib/playwright-browser.cjs')", 'Network.setCacheDisabled',
      'cacheDisabled: false', 'Network.setBlockedURLs', 'Emulation.setCPUThrottlingRate',
      'cachedScripts', 'warm scripts reached the HTTP server', 'Archive changed between trees',
      "page.goto('about:blank')", 'not a measured physical phone', 'totalBlockingTimeMs',
      'metrics.jsResources - metrics.readingModules - metrics.codecModules < 20',
      'Compact browser archive must retain the exact baseline content']) {
      if (!chamberMeasurement.includes(contract)) fail(`Chamber boot measurement missing ${contract}`);
    }
    if (/\b(?:context|page)\.route\s*\(/.test(chamberMeasurement)) {
      fail('Chamber cached-repeat measurement must not disable HTTP caching through Playwright routing');
    }
    const pilotReceipt = JSON.parse(await readText('tests/fixtures/chamber-boot-pilot.json'));
    assert.equal(pilotReceipt.schemaVersion, 1);
    assert.match(pilotReceipt.baselineCommit, /^[a-f0-9]{40}$/);
    assert.match(pilotReceipt.candidateCommit, /^[a-f0-9]{40}$/);
    assert.equal(pilotReceipt.runsPerGroup, 3);
    assert.equal(pilotReceipt.summary.length, 8);
    assert.equal(new Set(pilotReceipt.summary.map(row => `${row.profile}/${row.label}/${row.warmth}`)).size, 8);
    for (const row of pilotReceipt.summary) {
      assert(row.readyMs > 0 && row.jsDecodedBytes > 0 && row.domNodes > 0);
      if (row.warmth === 'warm') {
        assert.equal(row.cachedScripts, row.jsResources);
        assert.equal(row.jsTransferBytes, 0);
      }
    }
    pass('Chamber boot measurement retains real HTTP-cache receipts and explicitly synthetic CPU profiles');
  }

  async function checkChamberEfficiencyContracts() {
    const app = await readText('js/core/app.js');
    const registry = await readText('js/core/chamber-features.mjs');
    const index = await readText('index.html');
    const chamberStyles = await readText('js/ui/chamber-styles.js');
    const chamberAccessibility = await readText('js/ui/chamber-accessibility.js');
    const marketRoomStyles = await readText('css/market-room.css');
    const shellExtras = await readText('css/shell-extras.css');
    const historyChamberStyles = await readText('css/history-chamber.css');
    const stakingChamberStyles = await readText('css/staking-chamber.css');
    const mainStyles = await readText('css/styles.css');
    const networkPulseStyles = await readText('css/network-pulse.css');
    const dataAssets = await readText('js/core/data-assets.js');
    const dailyBriefing = await readText('js/features/daily-briefing.js');
    const maxis = await readText('js/features/maxis.js');
    const smoke = await readText('tests/smoke.mjs');
    const sw = await readText('sw.js');
    const lazyModules = [
      'network-pulse.js', 'tezlink.js', 'capital-chamber.js', 'minerals-chamber.js',
      'uranium-chamber.js', 'metals-chamber.js', 'whale-chamber.js', 'staking-chamber.js',
      'ecosystem-chamber.js', 'tz4-adoption.js', 'chamber.js', 'etherlink-governance.js',
      'liquidity-baking.js', 'leaderboard.js', 'ledger-flow.js', 'tezos-domains.js', 'maxis.js',
      'tezoscrp.js', 'ctez.js'
    ];
    for (const moduleName of lazyModules) {
      const modulePath = `../features/${moduleName}`;
      if (!registry.includes(`modulePath: '${modulePath}'`)) {
        fail(`lazy Chamber registry is missing ${modulePath}`);
      }
      if (new RegExp(`^import\\s+[\\s\\S]*?from\\s+['"]\\.\\./features/${moduleName.replace('.', '\\.') }['"];?`, 'm').test(app)) {
        fail(`app.js must not statically import lazy Chamber module ${moduleName}`);
      }
      if (index.includes(`modulepreload\" href=\"/js/features/${moduleName}`)
        || index.includes(`modulepreload\" href=\"js/features/${moduleName}`)) {
        fail(`index.html must not eagerly modulepreload ${moduleName}`);
      }
    }
    for (const statefulModule of ['leaderboard.js', 'whale-chamber.js']) {
      if (smoke.includes(`import('/js/features/${statefulModule}')`)) {
        fail(`browser smoke probes must import the loaded stamped ${statefulModule} URL instead of creating a second module instance`);
      }
    }
    for (const snippet of [
      'const _chamberModuleAttempts = new Map()',
      '_chamberModulePromises.delete(entryId)',
      'versionedAsset(new URL(config.modulePath, import.meta.url).pathname)',
      '&chamber-retry=${attempt}',
      '_chamberModuleAttempts.set(entryId, attempt + 1)',
      'let _chamberOpenEpoch = 0',
      'const openEpoch = _chamberOpenEpoch',
      'if (openEpoch !== _chamberOpenEpoch)',
      '_chamberOpenEpoch += 1',
      'isChamberOpenCancelled(error)',
      "hydrated?.querySelector?.('.chamber-expand-cue')",
      'focusTarget?.focus?.({ preventScroll: true })',
      'closeLoadedChamberFeatures()',
      "'tezoscrp-modal': { entryIds: ['tezoscrp'], hashes: ['tezoscrp', 'community-rewards', 'crp'] }"
    ]) {
      if (!app.includes(snippet)) fail(`lazy Chamber runtime is missing contract: ${snippet}`);
    }

    const focusHydrationStart = app.indexOf('function initStaticChamberEntry(entryId, initializer)');
    const moduleLoadStart = app.indexOf('function loadChamberFeature(entryId', focusHydrationStart);
    const moduleLoadEnd = app.indexOf('\nfunction callLoadedChamberFeature(', moduleLoadStart);
    const focusHydrationSource = app.slice(focusHydrationStart, moduleLoadStart);
    const moduleLoadSource = app.slice(moduleLoadStart, moduleLoadEnd);
    if (focusHydrationStart < 0
      || moduleLoadStart < 0
      || !focusHydrationSource.includes('document.activeElement === placeholder || placeholder.contains(document.activeElement)')
      || !focusHydrationSource.includes("hydrated?.querySelector?.('.chamber-expand-cue')")
      || !focusHydrationSource.includes('focusTarget?.focus?.({ preventScroll: true })')) {
      fail('focused static Chamber shells must transfer focus into the hydrated launcher without scrolling');
    }
    if (moduleLoadEnd < 0
      || !moduleLoadSource.includes('.catch((error) => {\n            _chamberModulePromises.delete(entryId);')
      || !moduleLoadSource.includes('_chamberModuleAttempts.set(entryId, attempt + 1);\n            throw error;')) {
      fail('failed lazy Chamber imports must evict their rejected promise and advance the cache-busting retry attempt');
    }
    for (const snippet of [
      'focusAfter.activeTagName === \'BUTTON\'',
      'focusAfter.activeTabIndex === 0',
      "await page.keyboard.press('Enter')",
      "const firstModuleFailureSettled = retryPage.waitForEvent('console'",
      "retryUrl.searchParams.get('chamber-retry') === '1'"
    ]) {
      if (!smoke.includes(snippet)) fail(`lazy Chamber focused browser regression is missing contract: ${snippet}`);
    }

    for (const snippet of [
      'const stylesheetPromises = new Map()',
      'if (existing?.sheet) return Promise.resolve(existing)',
      "link.addEventListener('load'",
      "link.addEventListener('error'",
      'stylesheetPromises.delete(id)',
      'link.remove()'
    ]) {
      if (!chamberStyles.includes(snippet)) fail(`shared Chamber stylesheet loader is missing contract: ${snippet}`);
    }
    for (const reservation of ['236px', '248px', '320px', '538px', '428px', '318px', '344px']) {
      if (!shellExtras.includes(`--chamber-entry-reserved-height: ${reservation}`)) {
        fail(`render-blocking Chamber shell is missing semantic reservation ${reservation}`);
      }
    }
    if (!shellExtras.includes('min-height: var(--chamber-entry-reserved-height)')
      || !mainStyles.includes('min-height: var(--chamber-entry-reserved-height)')
      || !networkPulseStyles.includes('#chambers-grid .network-pulse-entry-card.chamber-entry-wide { min-height: 538px; }')
      || !networkPulseStyles.includes('#chambers-grid .network-pulse-entry-card.chamber-entry-wide { min-height: 428px; }')
      || !mainStyles.includes('#chambers-grid .tezlink-entry-card.chamber-entry-wide {\n        min-height: 344px;')
      || !mainStyles.includes('#chambers-grid .health-entry-card.chamber-entry-wide {\n        min-height: 318px;')) {
      fail('render-blocking mobile Network shell floors must exactly match the hydrated Pulse, Health, and Tezos X floors');
    }
    const roomShellCss = shellExtras.match(/\.chamber-room-shell\[data-room-size\] \{[\s\S]*?\n\}/)?.[0] || '';
    if (!roomShellCss.includes('height: calc(100dvh - (2 * var(--space-4))) !important;')
        || roomShellCss.includes('--room-max-height')) {
      fail('Shared Chambers must fill the available tall viewport without a fixed height cap');
    }
    for (const snippet of [
      'const WIDE_CHAMBER_DIALOG_SELECTOR',
      'dialog.dataset.roomSize = roomSize',
      "scrollContainer.classList.add('chamber-room-scroll')",
      "'tezos:chamber-dialog-active'",
      "'release-radar-overlay'",
      "'ctez-overlay'",
      'export function focusChamberTab(tab)',
      'tab.focus({ preventScroll: true })',
      'tablist.scrollLeft +='
    ]) {
      if (!chamberAccessibility.includes(snippet)) fail(`shared Chamber shell normalizer is missing contract: ${snippet}`);
    }
    for (const snippet of [
      '.market-room-shell',
      '.market-room-title.is-display',
      '.market-room-title.is-editorial',
      '.market-room-tabs',
      '.market-room-view-shell',
      '.market-room-core-stage figcaption',
      '.chamber-state-error'
    ]) {
      if (!marketRoomStyles.includes(snippet)) fail(`market-room component layer is missing contract: ${snippet}`);
    }
    if (!marketRoomStyles.includes('font-size: var(--type-room-title)')
      || !stakingChamberStyles.includes('font-size: var(--type-room-title)')
      || !historyChamberStyles.includes('font-size: var(--type-room-title)')) {
      fail('shared Chamber title scale must own market, Staking, and Cycle History room titles');
    }
    for (const snippet of [
      "window.addEventListener('wheel', markReaderScrollIntent, scrollIntentOptions)",
      "window.addEventListener('touchmove', markReaderScrollIntent, scrollIntentOptions)",
      'const maxRestoreFrames = 8',
      'if (restoreFrame < maxRestoreFrames) requestAnimationFrame(restoreBrowserShift)',
      'else clearScrollIntentListeners()',
      'const simulatedAnchoringShift = 369',
      '&& window.__chamberCategoryAnchorShift',
      'afterToggle.anchorShift.after - afterToggle.anchorShift.before === simulatedAnchoringShift',
      'afterReaderScroll.displacingCallsAfterIntent === 0'
    ]) {
      if (!(app.includes(snippet) || smoke.includes(snippet))) {
        fail(`mobile Chamber disclosure scroll preservation is missing contract: ${snippet}`);
      }
    }
    const styleGatedModules = [
      ['capital-chamber.js', 'await ensureCapitalCss()'],
      ['ecosystem-chamber.js', 'await ensureEcosystemCss()'],
      ['history.js', 'await Promise.all([ensureCycleHistoryStyles(), ensureChartLibraries()])'],
      ['leaderboard.js', 'await ensureLeaderboardStyles()'],
      ['ledger-flow.js', 'await ensureLedgerFlowStyles()'],
      ['maxis.js', 'await ensureMaxisStyles()'],
      ['metals-chamber.js', 'await ensureMetalsCss()'],
      ['minerals-chamber.js', 'await ensureMineralsCss()'],
      ['network-health.js', 'await ensureNetworkHealthCss()'],
      ['network-pulse.js', 'await ensureNetworkPulseCss()'],
      ['staking-chamber.js', 'await ensureStakingStyles()'],
      ['tezos-domains.js', 'await ensureTezosDomainsStyles()'],
      ['tezoscrp.js', 'await ensureStyles()'],
      ['uranium-chamber.js', 'await ensureUraniumCss()'],
      ['whale-chamber.js', 'await ensureWhaleCss()']
    ];
    for (const [moduleName, awaitContract] of styleGatedModules) {
      const source = await readText(`js/features/${moduleName}`);
      if (!source.includes("from '../ui/chamber-styles.js'")) {
        fail(`${moduleName} must use the shared Chamber stylesheet loader`);
      }
      if (!source.includes(awaitContract)) {
        fail(`${moduleName} must await its stylesheet before activating the room`);
      }
    }
    for (const moduleName of ['capital-chamber.js', 'metals-chamber.js', 'minerals-chamber.js', 'uranium-chamber.js']) {
      const source = await readText(`js/features/${moduleName}`);
      for (const contract of ["versionedAsset('/css/market-room.min.css')", "ensureChamberStylesheet('market-room-css'", 'market-room-shell', 'market-room-header', 'market-room-tabs', 'market-room-view-shell', 'focusChamberTab(']) {
        if (!source.includes(contract)) fail(`${moduleName} is missing shared market-room contract: ${contract}`);
      }
    }
    for (const moduleName of [
      'network-pulse.js',
      'staking-chamber.js',
      'network-health.js',
      'maxis.js',
      'tezoscrp.js',
      'liquidity-baking.js',
      'chamber.js'
    ]) {
      const source = await readText(`js/features/${moduleName}`);
      if (!source.includes('activateChamberDialog(overlay') || !source.includes('deactivateChamberDialog(overlay')) {
        fail(`${moduleName} must use the shared Chamber dialog and shell lifecycle`);
      }
    }
    const marketRoomLegacyStyles = {
      capital: await readText('css/capital.css'),
      metals: await readText('css/metals-chamber.css'),
      minerals: await readText('css/minerals-chamber.css'),
      uranium: await readText('css/uranium-chamber.css')
    };
    const ruleBody = (source, selector) => source.match(new RegExp(`\\.${selector}\\s*\\{([^}]*)\\}`))?.[1] || '';
    const ownsProperty = (body, property) => new RegExp(`(?:^|\\n)\\s*${property}\\s*:`, 'm').test(body);
    for (const [prefix, source] of Object.entries(marketRoomLegacyStyles)) {
      const content = ruleBody(source, `${prefix}-content`);
      const header = ruleBody(source, `${prefix}-header`);
      const title = ruleBody(source, `${prefix}-title-row h2`);
      const tab = ruleBody(source, `${prefix}-tab`);
      const coreStage = ruleBody(source, `${prefix}-core-stage`);
      for (const property of ['width', 'max-width', 'height', 'max-height', 'padding', 'overflow', 'border-radius']) {
        if (ownsProperty(content, property)) fail(`${prefix} room content must not override shared ${property} geometry`);
      }
      for (const property of ['position', 'z-index', 'top', 'padding', 'backdrop-filter']) {
        if (ownsProperty(header, property)) fail(`${prefix} room header must not override shared ${property} structure`);
      }
      if (ownsProperty(title, 'font') || ownsProperty(title, 'font-size')) {
        fail(`${prefix} room title must not override the shared title scale`);
      }
      for (const property of ['position', 'display', 'flex', 'padding', 'border', 'background', 'cursor']) {
        if (ownsProperty(tab, property)) fail(`${prefix} room tab must not override shared ${property} structure`);
      }
      for (const property of ['position', 'min-width', 'margin', 'overflow']) {
        if (ownsProperty(coreStage, property)) fail(`${prefix} room artwork frame must not override shared ${property} structure`);
      }
    }
    for (const stylesheet of ['css/metals-chamber.css', 'css/minerals-chamber.css', 'css/uranium-chamber.css']) {
      const source = await readText(stylesheet);
      if (source.includes('Space Grotesk')) fail(`${stylesheet} must not reference an unloaded Space Grotesk face`);
    }

    const freshnessModules = [
      ['capital-chamber.js', 'syncCapitalFreshness'],
      ['ecosystem-chamber.js', 'syncEcosystemFreshness'],
      ['minerals-chamber.js', 'syncMineralsFreshness'],
      ['metals-chamber.js', 'syncMetalsFreshness'],
      ['uranium-chamber.js', 'syncUraniumFreshness']
    ];
    for (const [moduleName, helper] of freshnessModules) {
      const source = await readText(`js/features/${moduleName}`);
      if (!source.includes(`function ${helper}(`) || !source.includes(`${helper}(`)) {
        fail(`${moduleName} must reconcile freshness when an unchanged summary hash crosses its stale threshold`);
      }
    }

    for (const snippet of [
      'const DATA_ASSET_CACHE_MODES',
      "protocolData: 'default'",
      "governanceVotes: 'no-cache'",
      "force ? 'reload'",
      'DATA_ASSET_CACHE_MODES[name]'
    ]) {
      if (!dataAssets.includes(snippet)) fail(`data asset cache policy is missing contract: ${snippet}`);
    }
    for (const dataPath of [
      '/data/capital-entry-summary.json', '/data/capital-snapshot.json',
      '/data/ecosystem-entry-summary.json', '/data/ecosystem-stats.json',
      '/data/minerals-entry-summary.json', '/data/minerals-snapshot.json',
      '/data/metals-entry-summary.json', '/data/metals-snapshot.json',
      '/data/uranium-entry-summary.json', '/data/uranium-snapshot.json',
      '/data/baker-governance-signals.json'
    ]) {
      if (!sw.includes(`'${dataPath}'`)) fail(`service worker network-only data inventory is missing ${dataPath}`);
    }
    if (!sw.includes('isNetworkOnlyDataPath(url.pathname)')) {
      fail('service worker must route generated mutable receipts through the network-only predicate');
    }
    if (!sw.includes('event.respondWith(generatedDataNetworkFirst(request, event))')
      || !sw.includes("fetchWithTimeout(request, API_NETWORK_TIMEOUT_MS, { cache: 'no-cache' })")) {
      fail('service worker generated receipts must conditionally revalidate without a Cache Storage fallback');
    }
    if (!sw.includes('event.respondWith(apiNetworkFirst(request, event))')
      || !sw.includes("fetchWithTimeout(request, API_NETWORK_TIMEOUT_MS, { cache: 'no-store' })")) {
      fail('service worker live API reads must remain network-only and bypass browser caching');
    }
    if (!sw.includes('self.navigator?.onLine === false') || !sw.includes('unavailableDataResponse()')) {
      fail('service worker network-only generated receipts must fail closed while the browser is explicitly offline');
    }
    if (!dailyBriefing.includes("fetch(MILESTONE_CATALOG_URL, { cache: 'no-cache'")) {
      fail('the mutable milestone catalog must conditionally revalidate instead of opting out of HTTP caching');
    }
    if (!maxis.includes("fetchGeneratedSnapshot(sourceUrl.pathname, { cache: 'default' })")) {
      fail('immutable, hash-verified Maxis Passport shards must use normal HTTP caching');
    }
    if (sw.includes('/passports\\/[0-9a-f]{2}\\.json$/.test(pathname)')) {
      fail('immutable Maxis Passport shards must not use the service worker network-only data branch');
    }

    pass(`lazy Chamber registry, stylesheet readiness, freshness reconciliation, and cache policy checked across ${lazyModules.length} deferred modules`);

    const changelogLauncher = await readText('js/ui/changelog-launcher.js');
    const henLoader = await readText('js/core/hen-init.js');
    if (app.includes("from '../features/changelog.js'")
      || !app.includes("from '../ui/changelog-launcher.js'")
      || !changelogLauncher.includes('module.openChangelog()')
      || !changelogLauncher.includes('importAttempt += 1')) {
      fail('changelog archive must remain lazy, shared, and retryable after a failed module fetch');
    }
    if (index.includes('href="css/protocol-anthology.css')
      || !app.includes("ensureChamberStylesheet('protocol-anthology-css', versionedAsset('/css/protocol-anthology.min.css'))")
      || !app.includes('loadProtocolData(), ensureProtocolAnthologyCss()')
      || !app.includes('if (!await ensureProtocolAnthologyCss()')) {
      fail('Anthology library and story openers must both await their lazy stylesheet');
    }
    if (!henLoader.includes('runtimePromise = null')
      || !henLoader.includes('window.location.href !== requestedRoute')
      || !henLoader.includes("closest('#hen-launcher, [data-hen-launch]')")
      || !app.includes('window.openHenMode?.()')) {
      fail('lazy HEN must retain shared loading, retries, cancelled routes, launchers, and the legacy NFT route');
    }
    pass('optional startup assets remain deferred without changing shared HEN styles or route entry points');

    const boot = await readText('js/core/standalone-chamber.js');
    const dashboardInit = app.slice(app.indexOf('async function init('));
    for (const initializer of ['chamberCategories', 'chambersSurface', 'lazyChamberLaunchers']) {
      const offset = dashboardInit.indexOf(`safe('${initializer}',`);
      assert.ok(offset >= 0 && offset < dashboardInit.indexOf('await prepareDashboardDependencies()'), `${initializer} responds before deferred imports`);
    }
    assert.match(await readText('js/features/history.js'), /positionCycleHistoryEntryCard\(card\);[\s\S]*?updateCycleHistoryEntryFreshness\(cycleHistoryEntryFreshnessRows\)/, 'New home launcher reuses direct History receipts');
    assert.match(await readText('js/features/search.js'), /else if \(document.activeElement === input\)\s*\{[\s\S]*?setOpen\(true\);[\s\S]*?render\(\);/, 'Deferred Search honors already-focused input');
    assert.doesNotMatch(await readText('index.html'), /<script[^>]+src="js\/features\/(?:history|my-tezos|network-health)\.js/, 'Only the catalog owns heavy feature module instances');
    for (const feature of ['network-health', 'my-tezos', 'history']) {
      assert.doesNotMatch(app, new RegExp(`^import[^;]+features/${feature}\\.js`, 'm'), `${feature} stays out of the eager app graph`);
    }
    for (const feature of ['my-tezos', 'my-baker']) {
      const source = await readText(`js/features/${feature}.js`);
      assert.ok(source.includes("from '../core/octez-versions.js'"));
      assert.doesNotMatch(source, /from ['"].*network-health\.js/);
    }
    for (const feature of ['network-pulse', 'staking-chamber']) {
      const source = await readText(`js/features/${feature}.js`);
      assert.ok(source.includes("from '../ui/history-intent.js'"));
      assert.doesNotMatch(source, /from ['"].*\/history\.js/);
    }
    assert.ok(boot.indexOf('dashboard.seedChamberFeature(entryId, roomModule)') < boot.indexOf('await dashboard.prepareDashboardDependencies()'));
    assert.ok(boot.indexOf('await dashboard.prepareDashboardDependencies()') < boot.indexOf("document.getElementById('standalone-chamber-shell').replaceWith(fragment)"));
    assert.ok(boot.includes('activeOverlayCount() === 0'), 'Directory Escape respects nested dialogs');
    const themeEffects = await readText('js/ui/chamber-theme-effects.js');
    assert.ok(themeEffects.includes('if (motion.matches) return;') && themeEffects.includes('loaded.has(source)'));
    assert.ok(themeEffects.includes("versionedAsset('/js/effects/valley-loader.js')"));
    const chartLoader = await readText('js/ui/chart-loader.js');
    assert.doesNotMatch(index, /<script[^>]+src=["'][^"']*(?:chart\.umd|chartjs-adapter)/, 'Home chart libraries load only on chart intent');
    assert.doesNotMatch(app, /safe\('myTezosCss'/, 'Home leaves drawer styles behind launcher intent');
    for (const feature of ['leaderboard', 'my-baker', 'my-tezos']) {
      const source = await readText(`js/features/${feature}.js`);
      assert.doesNotMatch(source, /drawer\.classList\.add\('open'\)/, `${feature} must use the shared styled drawer opener`);
      assert.match(source, /tezosSystemsOpenMyTezos/, `${feature} routes drawer activation through the shared opener`);
    }
    assert.match(app, /await ensureMyTezosCss\(\)/, 'Drawer opening waits for its stylesheet');
    for (const file of ['my-tezos.js', 'my-tezos-portfolio.js', 'upgrade-effect.js']) {
      assert.match(await readText(`js/features/${file}`), /await ensureChartLibraries\(\)/, `${file} awaits the shared chart loader`);
    }
    assert.ok(chartLoader.includes('if (!chartWork)') && chartLoader.includes('chartWork = null; throw error;'));
    const lifecycle = await readText('js/core/shell-lifecycle.js');
    const generator = await readText('scripts/lib/standalone-chamber-shell.mjs');
    const routeGenerator = await readText('scripts/generate-chamber-routes.mjs');
    for (const source of [app, boot, routeGenerator]) assert.match(source, /import \{ CHAMBER_FEATURES/);
    for (const route of CHAMBER_ROUTES) assert.ok(standaloneFeatureForRoute(route.slug), `${route.slug} has an independent boot owner`);
    for (const snippet of ["init: 'initCtezChamber'", 'exclusiveLaunchers: true', 'closeFeatureMenu: true']) assert.ok(registry.includes(snippet));
    for (const [id, feature] of Object.entries(CHAMBER_FEATURES)) {
      if (!feature.standalone) continue;
      const shell = await readText(`${feature.standalone.route}/index.html`);
      for (const forbidden of ['id="hero-slot"', 'id="chambers-grid"', 'id="my-tezos-drawer"', 'rel="modulepreload"', 'chart.umd', ' src="/js/core/app.js']) {
        if ((id === 'my' && forbidden === 'id="my-tezos-drawer"') || (id === 'chambers' && forbidden === 'id="chambers-grid"')) continue;
        if (shell.includes(forbidden)) fail(`Standalone ${id} must not construct or preload dashboard work: ${forbidden}`);
      }
      assert.equal(standaloneFeatureForRoute(feature.standalone.route), id);
      assert.ok(shell.includes(`data-chamber-boot="${id}"`));
      assert.ok(shell.includes('https://github.com/Primate411/tezos.systems'));
      assert.ok(shell.includes('MPL-2.0'));
      const source = await fs.readFile(new URL(feature.modulePath, new URL('../../js/core/chamber-features.mjs', import.meta.url)), 'utf8');
      const opening = source.slice(source.indexOf(`function ${feature.open}`));
      if (id !== 'my') assert.ok(opening.includes('!isCurrent()') || opening.includes('!options.isCurrent()'), `${id} cancels asynchronous styles after navigation`);
      const closing = source.slice(source.indexOf(`export function ${feature.close}`));
      if (id !== 'my') assert.ok(closing.includes('requestChamberClose(overlay)'), `${id} allows deferred close`);
      if (['capital', 'minerals', 'metals', 'uranium', 'ecosystem'].includes(id)) {
        assert.ok(opening.includes('bindVisibilityRefresh();'), `${id} owns visibility handling without launcher init`);
        assert.ok(closing.indexOf('requestChamberClose(overlay)') < closing.indexOf('stopRefreshTimer()'), `${id} failed exits retain polling`);
      }
    }
    assert.ok(generator.includes('renderStandaloneChamberShell(html, route,'));
    const routeRefresh = (await readText('scripts/refresh-generated-surfaces.mjs')).split('const routeTouched =')[1]?.split('if (routeTouched)')[0];
    assert.ok(routeRefresh?.includes('chamber-features') && routeRefresh.includes('standalone-chamber-shell'), 'boot catalog and shell edits regenerate opted-in routes');
    assert.ok(boot.includes('for (const key of room.queryKeys) params.delete(key)'));
    assert.ok(chamberAccessibility.includes("new CustomEvent('tezos:chamber-before-close'"));
    for (const snippet of ['loadDashboardModule()', 'dashboardModuleAttempt', 'preloadedChamber: roomModule', 'initialChamber:', 'shellInstalled', 'transitionIntent', 'data-dashboard-fallback', "cache: 'no-cache'", "initShellLifecycle()", 'newer build is available']) {
      if (!boot.includes(snippet)) fail(`Standalone boot handoff is missing ${snippet}`);
    }
    if (/requestIdleCallback|setTimeout\(/.test(boot)) fail('Standalone boot must not start the dashboard through an idle or timed callback');
    if (!app.includes('export function startDashboard') || !app.includes('dashboardInitialization') || !app.includes('options.preloadedChamber') || !lifecycle.includes('if (lifecycleStarted) return')) fail('Both boot modes must retain single dashboard and release-controller initialization');
    const installAssets = sw.match(/const SHELL_ASSETS = \[([\s\S]*?)\];/)?.[1] || '';
    for (const asset of ['app.js', 'api.js', 'home-layout-preload.js', 'hero-search.css']) {
      if (installAssets.includes(asset)) fail(`Service-worker installation must not bypass the standalone boundary with ${asset}`);
    }
    pass('All generated rooms share a boot catalog, scoped shells, cancellable lifecycle, and a version-checked single-instance dashboard transition');
  }

  async function checkLauncherProjectionContracts() {
    const [
      capitalProjectionText,
      capitalSourceText,
      ecosystemProjectionText,
      ecosystemSourceText,
      maxisProjectionText,
      bakerSignalsProjectionText,
      bakerCareersSourceText,
      governanceVotesSourceText,
      capitalGenerator,
      ecosystemGenerator,
      maxisGenerator,
      bakerSignalsGenerator,
      aggregateGenerator,
      capitalFeature,
      ecosystemFeature,
      maxisFeature,
      leaderboardFeature,
      measurement,
      packageText,
      orchestrator,
      readmeGuard,
      smoke
    ] = await Promise.all([
      readText('data/capital-entry-summary.json'),
      readText('data/capital-snapshot.json'),
      readText('data/ecosystem-entry-summary.json'),
      readText('data/ecosystem-stats.json'),
      readText('data/maxis/entry-summary.json'),
      readText('data/baker-governance-signals.json'),
      readText('data/maxis-careers.json'),
      readText('data/governance-votes.json'),
      readText('scripts/generate-capital-entry-summary.mjs'),
      readText('scripts/generate-ecosystem-entry-summary.mjs'),
      readText('scripts/generate-maxis-entry-summary.mjs'),
      readText('scripts/generate-baker-governance-signals.mjs'),
      readText('scripts/generate-launcher-projections.mjs'),
      readText('js/features/capital-chamber.js'),
      readText('js/features/ecosystem-chamber.js'),
      readText('js/features/maxis.js'),
      readText('js/features/leaderboard.js'),
      readInitialLoadMeasurementSource(),
      readText('package.json'),
      readText('scripts/refresh-generated-surfaces.mjs'),
      readText('scripts/guard-readme-sync.mjs'),
      readText('tests/smoke.mjs')
    ]);
    const capitalProjection = JSON.parse(capitalProjectionText);
    const capitalSource = JSON.parse(capitalSourceText);
    const ecosystemProjection = JSON.parse(ecosystemProjectionText);
    const ecosystemSource = JSON.parse(ecosystemSourceText);
    const maxisProjection = JSON.parse(maxisProjectionText);
    const bakerSignalsProjection = JSON.parse(bakerSignalsProjectionText);
    const packageJson = JSON.parse(packageText);

    if (Buffer.byteLength(capitalProjectionText) > 16 * 1024) {
      fail(`Capital launcher projection exceeds its 16 KiB budget: ${Buffer.byteLength(capitalProjectionText)} bytes`);
    }
    const { contentHash: capitalProjectionHash, ...capitalUnsigned } = capitalProjection;
    if (capitalProjection.schemaVersion !== 1
      || stableJsonHash(capitalUnsigned) !== capitalProjectionHash
      || capitalProjection.source?.path !== 'data/capital-snapshot.json'
      || capitalProjection.source?.generatedAt !== capitalSource.generatedAt
      || capitalProjection.source?.contentHash !== capitalSource.contentHash
      || capitalProjection.source?.fileSha256 !== createHash('sha256').update(capitalSourceText).digest('hex')) {
      fail('Capital launcher projection must match its stable payload and exact reviewed source receipt');
    }
    if (capitalProjection.markets?.xtz?.coin?.lastUpdated !== capitalSource.markets?.xtz?.coin?.lastUpdated
      || capitalProjection.markets?.xtz?.coin?.sourceStatus !== capitalSource.sources?.coingecko?.status) {
      fail('Capital launcher projection must carry the reviewed CoinGecko observation time and source status');
    }

    if (Buffer.byteLength(maxisProjectionText) > 24 * 1024) {
      fail(`Maxis launcher projection exceeds its 24 KiB budget: ${Buffer.byteLength(maxisProjectionText)} bytes`);
    }

    if (Buffer.byteLength(ecosystemProjectionText) > 16 * 1024) {
      fail(`Ecosystem launcher projection exceeds its 16 KiB budget: ${Buffer.byteLength(ecosystemProjectionText)} bytes`);
    }
    const { contentHash: ecosystemProjectionHash, ...ecosystemUnsigned } = ecosystemProjection;
    if (ecosystemProjection.schemaVersion !== 1
      || stableJsonHash(ecosystemUnsigned) !== ecosystemProjectionHash
      || ecosystemProjection.source?.path !== 'data/ecosystem-stats.json'
      || ecosystemProjection.source?.generatedAt !== ecosystemSource.generatedAt
      || ecosystemProjection.source?.contentHash !== ecosystemSource.contentHash
      || ecosystemProjection.source?.fileSha256 !== createHash('sha256').update(ecosystemSourceText).digest('hex')) {
      fail('Ecosystem launcher projection must match its stable payload and exact reviewed source receipt');
    }
    const { integrity: maxisIntegrity, ...maxisUnsigned } = maxisProjection;
    if (maxisProjection.schema !== 1
      || maxisProjection.kind !== 'maxis-entry-summary'
      || maxisIntegrity?.algorithm !== 'sha256-stable-json-v1'
      || maxisIntegrity?.contentHash !== stableJsonHash(maxisUnsigned)) {
      fail('Maxis launcher projection must retain its stable integrity receipt');
    }
    for (const [key, receipt] of Object.entries(maxisProjection.sourceReceipts || {})) {
      const sourcePath = String(receipt?.path || '').replace(/^\/+/, '');
      if (!sourcePath.startsWith('data/')) {
        fail(`Maxis launcher projection ${key} receipt must name a first-party data artifact`);
        continue;
      }
      const sourceText = await readText(sourcePath);
      if (receipt.bytes !== Buffer.byteLength(sourceText)
        || receipt.sha256 !== createHash('sha256').update(sourceText).digest('hex')) {
        fail(`Maxis launcher projection ${key} receipt has drifted from ${sourcePath}`);
      }
    }

    const { integrity: bakerSignalsIntegrity, ...bakerSignalsUnsigned } = bakerSignalsProjection;
    if (Buffer.byteLength(bakerSignalsProjectionText) > 96 * 1024
      || bakerSignalsProjection.schema !== 1
      || bakerSignalsProjection.kind !== 'baker-governance-signals'
      || bakerSignalsProjection.coverage?.status !== 'complete'
      || bakerSignalsProjection.coverage?.mode !== 'source-active-delegate-governance-signal-projection'
      || bakerSignalsProjection.recordCount !== Object.keys(bakerSignalsProjection.records || {}).length
      || bakerSignalsIntegrity?.algorithm !== 'sha256-stable-json-v1'
      || bakerSignalsIntegrity?.contentHash !== stableJsonHash(bakerSignalsUnsigned)
      || bakerSignalsProjection.sources?.careers?.path !== 'data/maxis-careers.json'
      || bakerSignalsProjection.sources?.careers?.fileSha256 !== createHash('sha256').update(bakerCareersSourceText).digest('hex')
      || bakerSignalsProjection.sources?.governanceVotes?.path !== 'data/governance-votes.json'
      || bakerSignalsProjection.sources?.governanceVotes?.fileSha256 !== createHash('sha256').update(governanceVotesSourceText).digest('hex')) {
      fail('Baker governance signal projection must remain compact, complete, integrity-checked, and tied to both exact source files');
    }

    if (packageJson.scripts?.['refresh:launcher-projections'] !== 'node scripts/generate-launcher-projections.mjs'
      || packageJson.scripts?.['check:launcher-projections'] !== 'node scripts/generate-launcher-projections.mjs --check'
      || packageJson.scripts?.['test:baker-governance-signals'] !== 'node tests/baker-governance-signals-check.mjs'
      || !STATIC_CHECKS.some(entry => entry.script === 'tests/baker-governance-signals-check.mjs')
      || !aggregateGenerator.includes('generate-capital-entry-summary.mjs')
      || !aggregateGenerator.includes('generate-ecosystem-entry-summary.mjs')
      || !aggregateGenerator.includes('generate-maxis-entry-summary.mjs')
      || !aggregateGenerator.includes('generate-baker-governance-signals.mjs')) {
      fail('package scripts must expose one deterministic launcher-projection refresh and check path');
    }
    const projectionCheckIndex = orchestrator.indexOf("nodeScript('scripts/generate-launcher-projections.mjs', ['--check'])");
    const bakerSignalsPrecommitIndex = orchestrator.indexOf("nodeScript('scripts/generate-baker-governance-signals.mjs')");
    const projectionPrecommitStageIndex = orchestrator.indexOf('if (shouldStage) stageTargets(LAUNCHER_PROJECTION_TARGETS)', projectionCheckIndex);
    const whaleCheckIndex = orchestrator.indexOf("nodeScript('scripts/refresh-whale-watch-data.mjs', ['--check'])", projectionCheckIndex);
    if (!capitalGenerator.includes('MAX_OUTPUT_BYTES = 16 * 1024')
      || !ecosystemGenerator.includes('MAX_OUTPUT_BYTES = 16 * 1024')
      || !maxisGenerator.includes('MAX_OUTPUT_BYTES = 24 * 1024')
      || !bakerSignalsGenerator.includes('MAX_OUTPUT_BYTES = 96 * 1024')
      || !bakerSignalsGenerator.includes("proposal?.status !== 'accepted'")
      || !bakerSignalsGenerator.includes('proposal.initiator.address')
      || !maxisGenerator.includes("integrity: {\n      algorithm: 'sha256-stable-json-v1'")
      || !orchestrator.includes("'data/baker-governance-signals.json'")
      || projectionCheckIndex < 0
      || bakerSignalsPrecommitIndex < 0
      || bakerSignalsPrecommitIndex > projectionCheckIndex
      || projectionPrecommitStageIndex < projectionCheckIndex
      || projectionPrecommitStageIndex > whaleCheckIndex
      || !orchestrator.includes("nodeScript('scripts/generate-launcher-projections.mjs')")
      || !orchestrator.includes('stageTargets(LAUNCHER_PROJECTION_TARGETS)')) {
      fail('generated-surface orchestration must validate, refresh, budget, and optionally stage all launcher projections');
    }
    for (const guardedPath of [
      'generate-capital-entry-summary',
      'generate-ecosystem-entry-summary',
      'generate-maxis-entry-summary',
      'generate-baker-governance-signals',
      'generate-launcher-projections',
      'generate-llms-txt',
      'measure-initial-load',
      'openapi'
    ]) {
      if (!readmeGuard.includes(guardedPath)) {
        fail(`README guard must cover the documented ${guardedPath} contract`);
      }
    }

    for (const [label, feature, snippets] of [
      ['Capital', capitalFeature, [
        "import { sha256Text, stableJsonValue } from '../core/sha256.js?serialization=1'",
        "const CAPITAL_ENTRY_SUMMARY_URL = '/data/capital-entry-summary.json'",
        'fetchCapitalEntrySummary',
        'fetchCapitalSnapshot',
        'priceFreshnessLabel',
        'GENERATED_PROOFBOOK_SCHEDULE_LABEL',
        'Capital snapshot failed its SHA-256 integrity receipt',
        'const sourceReceipt = summary?.source || null',
        'assertSnapshotMatchesProjection(snapshot, sourceText, sourceReceipt'
      ]],
      ['Ecosystem', ecosystemFeature, [
        "import { sha256Text, stableJsonValue } from '../core/sha256.js?serialization=1'",
        "const ECOSYSTEM_ENTRY_SUMMARY_URL = '/data/ecosystem-entry-summary.json'",
        'fetchEntrySummary',
        'fetchSnapshot',
        'Ecosystem snapshot failed its SHA-256 integrity receipt',
        'const sourceReceipt = summary?.source || null',
        'assertSnapshotMatchesProjection(value, text, sourceReceipt'
      ]],
      ['Maxis', maxisFeature, [
        "import { sha256Text, stableJsonValue } from '../core/sha256.js?serialization=1'",
        "const ENTRY_SUMMARY_URL = '/data/maxis/entry-summary.json'",
        'loadEntrySummaryProjection',
        'The compact Maxis launcher receipt is temporarily unavailable.',
        'entryHydrationSerial',
        'failed its SHA-256 integrity receipt',
        'missing a canonical identity',
        'season does not match its manifest and source receipt'
      ]]
    ]) {
      for (const snippet of snippets) {
        if (!feature.includes(snippet)) fail(`${label} launcher projection contract is missing: ${snippet}`);
      }
      if (/async function sha256Text\s*\(/.test(feature)
        || /(?:SHA-256 verification|Web Crypto) is unavailable/.test(feature)) {
        fail(`${label} receipt verification must retain the shared deterministic fallback on plain-HTTP LAN origins`);
      }
    }
    if (maxisFeature.includes('progressiveEntryLoad')) {
      fail('Maxis launcher projection failures must fail closed instead of loading full room artifacts');
    }
    for (const snippet of [
      "name: 'launcher-projections'",
      '/data/capital-entry-summary.json',
      '/data/ecosystem-entry-summary.json',
      '/data/maxis/entry-summary.json',
      'full Capital data loaded before its Chamber opened',
      'full Ecosystem data loaded before its Chamber opened',
      'full Maxis data loaded before its Chamber opened',
      'plain-HTTP launcher receipt fixture did not disable SubtleCrypto',
      'projection failure loaded full data before explicit room intent',
      'delayed Maxis projection overwrote full launcher data'
    ]) {
      if (!smoke.includes(snippet)) fail(`launcher-projection browser regression contract is missing: ${snippet}`);
    }
    if (!leaderboardFeature.includes('refreshBakerDirectoryChamber({ quiet: false, includeGovernance: false })')
      || !leaderboardFeature.includes('if (includeGovernance) requests.push(fetchGovernanceSignals())')
      || !leaderboardFeature.includes("GOVERNANCE_SIGNALS_URL = '/data/baker-governance-signals.json'")
      || !measurement.includes("'/data/ecosystem-entry-summary.json'")
      || !measurement.includes("'/data/ecosystem-stats.json'")
      || !measurement.includes("'/data/baker-governance-signals.json'")
      || !measurement.includes("'/data/maxis-careers.json'")
      || !smoke.includes('bakerGovernanceHeavyRequests === 0')
      || !smoke.includes("!hasPath('/data/maxis-careers.json')")
      || !smoke.includes("hasPath('/data/maxis-careers.json')")) {
      fail('initial-load QA must defer the Baker Directory compact signal receipt and full Maxis career ledger until explicit room intent');
    }

    const sourceBytes = Buffer.byteLength(capitalSourceText)
      + Buffer.byteLength(ecosystemSourceText)
      + Buffer.byteLength(bakerCareersSourceText)
      + Buffer.byteLength(governanceVotesSourceText)
      + Object.values(maxisProjection.sourceReceipts || {}).reduce((total, receipt) => total + Number(receipt?.bytes || 0), 0);
    const projectionBytes = Buffer.byteLength(capitalProjectionText)
      + Buffer.byteLength(ecosystemProjectionText)
      + Buffer.byteLength(maxisProjectionText)
      + Buffer.byteLength(bakerSignalsProjectionText);
    pass(`launcher projections retain exact source receipts within ${projectionBytes} bytes versus ${sourceBytes} reviewed source bytes`);
  }

  async function checkChamberFirstPaintContracts() {
    for (const key of ['capital', 'ecosystem', 'minerals', 'metals', 'uranium', 'whale']) {
      const source = await fs.readFile(path.join(ROOT, `js/features/${key}-chamber.js`), 'utf8');
      for (const contract of ['createChamberSnapshotCache', 'snapshotCache.read()', 'snapshotCache.save(', 'initial = false',
        "document.visibilityState === 'visible'", 'chamberRefreshWork', 'openEpoch', 'quiet: true']) {
        assert(source.includes(contract), `${key}: missing first-paint contract ${contract}`);
      }
      if (key !== 'whale') {
        assert(source.includes('chamberSkeleton(') && source.includes('pendingSnapshotRefresh'), `${key}: missing frames or queued receipt`);
        assert(source.includes('snapshotStatusMarkup(') && source.includes('syncSnapshotStatus(') && source.includes('assertSnapshotMatchesProjection('), `${key}: missing honest saved-state receipt`);
      }
    }
    const cache = await fs.readFile(path.join(ROOT, 'js/core/chamber-snapshot-cache.js'), 'utf8');
    for (const contract of ['4 * 1024 * 1024', '7 * 24 * 60 * 60 * 1000', 'STORAGE_TIMEOUT_MS',
      'validateSnapshot(JSON.parse(record.text))', 'validateSummary(record.summary)', 'assertSnapshotMatchesProjection(',
      'sha256Text(record.text)', 'snapshot.generatedAt !== record.generatedAt']) assert(cache.includes(contract), `cache safety: ${contract}`);
    assert(!cache.includes('fetch(') && !cache.includes('localStorage'), 'saved snapshots must not intercept HTTP or exhaust localStorage');
    const styles = await fs.readFile(path.join(ROOT, 'css/loading.css'), 'utf8');
    assert(styles.includes('.chamber-first-paint-grid') && styles.includes('grid-template-columns: minmax(0, 1fr)'), 'static loading frames must fit phones');
    pass('six Chambers separate requested first paint from gated polling and verify bounded saved receipts before quiet revalidation');
  }

  async function checkChamberReadingContracts() {
    const source = await fs.readFile(path.join(ROOT, 'js/ui/chamber-reading.js'), 'utf8');
    for (const contract of ['renderChamberVerdict', 'renderChamberGuide', 'renderAgeingLabel', 'relativeChamberAge', 'quietlyMutate(root,', 'quietlySyncHtml(root, html)', "document.visibilityState !== 'visible'", 'visibilitychange', 'clearInterval(stampTimer)', 'prefers-reduced-motion: reduce', '!first || !chamberArrivalAllowed']) {
      assert(source.includes(contract), `Chamber reading helper missing ${contract}`);
    }
    for (const name of ['capital-chamber', 'minerals-chamber', 'metals-chamber', 'uranium-chamber', 'ecosystem-chamber', 'whale-chamber', 'community-funding', 'tezoscrp', 'maxis', 'history', 'leaderboard', 'ctez', 'chamber', 'etherlink-governance', 'liquidity-baking', 'ledger-flow', 'network-pulse', 'staking-chamber', 'tezlink', 'tezos-domains', 'tz4-adoption', 'my-tezos']) {
      const feature = await fs.readFile(path.join(ROOT, `js/features/${name}.js`), 'utf8');
      assert(feature.includes('renderChamberVerdict('), `${name}: missing room summary`);
    }
    pass('Chamber summaries, reference guides, visible-only clocks, and first-paint-only arrival helpers checked');
  }

  return { checkInitialLoadMeasurementContracts, checkChamberEfficiencyContracts, checkLauncherProjectionContracts, checkChamberFirstPaintContracts, checkChamberReadingContracts };
}
