// Static contracts owned by routing. Shared dependencies remain explicit.
export function createRoutingStaticChecks({
  CHAMBER_ROUTES,
  ROOT,
  assert,
  fail,
  openApiPathPattern,
  pass,
  path,
  pathExists,
  pathToFileURL,
  readText,
  renderLlmsTxt,
  walk
}) {
  async function checkSiteMapGraphContracts() {
    const source = await readText('js/core/site-map.js');
    const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
    const {
      SITE_MAP,
      SITE_MAP_NAV_GROUPS,
      SITE_MAP_RELATIONS,
      findCurrentSiteMapContext,
      findSiteMapDestination,
      searchSiteMap,
      searchSiteMapIntents,
      siteMapBrowseEntries,
      siteMapBrowseIntents,
      siteMapDirectoryChildren,
      siteMapRelated,
      siteMapSearchChips,
      siteMapSitemapEntries,
      siteMapStarters
    } = await import(moduleUrl);
    const journeySource = (await readText('js/core/site-journey.js'))
      .replace("'./site-map.js'", JSON.stringify(moduleUrl))
      .replace(
        "'./my-tezos-models.mjs'",
        JSON.stringify(pathToFileURL(path.join(ROOT, 'js/core/my-tezos-models.mjs')).href)
      );
    const journeyModuleUrl = `data:text/javascript;base64,${Buffer.from(journeySource).toString('base64')}`;
    const {
      MY_TEZOS_JOURNEY_ORIGIN_KEY,
      buildMyTezosJourneyLinks,
      journeyAnalyticsDetails,
      readMyTezosJourneyOrigin,
      siteMapJourneyLinks
    } = await import(journeyModuleUrl);

    const ids = SITE_MAP.map((entry) => entry.id);
    const hrefs = SITE_MAP.map((entry) => entry.href);
    const knownIds = new Set(ids);
    if (knownIds.size !== ids.length) fail('site map entry ids must be unique');
    if (new Set(hrefs).size !== hrefs.length) fail('site map entry hrefs must be unique');
    const intentEntries = SITE_MAP.flatMap((entry) => (entry.searchIntents || []).map((intent) => ({ ...intent, parentId: entry.id })));
    const intentIds = intentEntries.map((entry) => entry.id);
    if (new Set(intentIds).size !== intentIds.length) fail('site map child intent ids must be unique');
    if (intentIds.some((id) => knownIds.has(id))) fail('site map child intent ids must not collide with top-level ids');

    for (const group of SITE_MAP_NAV_GROUPS) {
      if (!SITE_MAP.some((entry) => entry.group === group)) fail(`site map nav group is empty: ${group}`);
    }
    for (const entry of SITE_MAP) {
      if (!SITE_MAP_NAV_GROUPS.includes(entry.group)) fail(`site map destination is missing from the complete directory groups: ${entry.id}`);
    }
    if (new Set(Object.keys(SITE_MAP_RELATIONS)).size !== SITE_MAP.length || SITE_MAP.some((entry) => !SITE_MAP_RELATIONS[entry.id])) {
      fail('every site map destination must own a semantic relation set');
    }
    for (const [sourceId, relatedIds] of Object.entries(SITE_MAP_RELATIONS)) {
      if (!knownIds.has(sourceId)) fail(`site map relation source is unknown: ${sourceId}`);
      if (new Set(relatedIds).size !== relatedIds.length) fail(`site map relation ${sourceId} contains duplicates`);
      for (const relatedId of relatedIds) {
        if (!knownIds.has(relatedId)) fail(`site map relation ${sourceId} points to unknown id ${relatedId}`);
        if (relatedId === sourceId) fail(`site map relation ${sourceId} must not point to itself`);
      }
    }

    const starterIds = siteMapStarters().map((entry) => entry.id);
    for (const required of ['my-tezos', 'pulse', 'staking-chamber', 'maxis', 'health']) {
      if (!starterIds.includes(required)) fail(`site map starter set is missing ${required}`);
    }
    const chipIds = siteMapSearchChips().map((entry) => entry.id);
    for (const required of ['my-tezos', 'pulse', 'staking-chamber', 'maxis', 'domains', 'health']) {
      if (!chipIds.includes(required)) fail(`site map search chips are missing ${required}`);
    }

    const starterOrders = SITE_MAP.filter((entry) => Number.isFinite(entry.starter)).map((entry) => entry.starter);
    if (new Set(starterOrders).size !== starterOrders.length) fail('site map starter orders must be unique');
    const chipOrders = SITE_MAP.filter((entry) => entry.searchChip).map((entry) => entry.searchChip.order);
    if (new Set(chipOrders).size !== chipOrders.length) fail('site map search chip orders must be unique');

    const expectedBrowseIds = SITE_MAP
      .filter((entry) => SITE_MAP_NAV_GROUPS.includes(entry.group))
      .sort((a, b) => SITE_MAP_NAV_GROUPS.indexOf(a.group) - SITE_MAP_NAV_GROUPS.indexOf(b.group) || ids.indexOf(a.id) - ids.indexOf(b.id))
      .map((entry) => entry.id);
    const browseIds = siteMapBrowseEntries().map((entry) => entry.id);
    if (JSON.stringify(browseIds) !== JSON.stringify(expectedBrowseIds)) {
      fail(`site map browse order must cover every grouped destination exactly once: ${browseIds.join(', ')}`);
    }
    if (browseIds.length !== SITE_MAP.length) fail(`complete site map must include all ${SITE_MAP.length} top-level destinations, got ${browseIds.length}`);

    const inbound = new Map(ids.map((id) => [id, 0]));
    for (const sourceId of ids) {
      for (const related of siteMapRelated(sourceId, 4)) inbound.set(related.id, (inbound.get(related.id) || 0) + 1);
    }
    for (const [id, count] of inbound) {
      if (!count) fail(`site map destination has no rendered inbound semantic route: ${id}`);
    }
    for (const startId of ids) {
      const seen = new Set([startId]);
      const queue = [startId];
      while (queue.length) {
        for (const related of siteMapRelated(queue.shift(), 4)) {
          if (seen.has(related.id)) continue;
          seen.add(related.id);
          queue.push(related.id);
        }
      }
      if (seen.size !== SITE_MAP.length) {
        fail(`site map relation graph is not circular from ${startId}; missing ${ids.filter((id) => !seen.has(id)).join(', ')}`);
      }
    }

    const contextCases = [
      ['/capital/?view=art', 'capital', 'capital-art'],
      ['/capital/?view=system&focus=fees', 'capital', 'capital-fees'],
      ['/ecosystem/?layer=etherlink', 'ecosystem', 'ecosystem-l2'],
      ['/maxis/?view=passport&address=tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb', 'maxis', 'maxis-passport'],
      ['/maxis/?view=season&lane=staking', 'maxis', 'maxis-season'],
      ['/whales/?view=awakenings&search=tz1ignored', 'whales', 'whales-awakenings'],
      ['/leaderboard/?view=discover', 'leaderboard', 'leaderboard-discover'],
      ['/compare/tezos-vs-ethereum.html', 'compare', 'compare-ethereum'],
      ['/capital/?unknown=1', 'capital', null]
    ];
    for (const [route, entryId, intentId] of contextCases) {
      const url = new URL(route, 'https://tezos.systems');
      const context = findCurrentSiteMapContext(url);
      if (context.entryId !== entryId || context.intentId !== intentId) {
        fail(`site map context ${route} should resolve ${entryId}/${intentId || 'parent'}, got ${context.entryId}/${context.intentId || 'parent'}`);
      }
    }
    if (findSiteMapDestination('capital-art')?.parentId !== 'capital') {
      fail('site map child destination lookup must preserve its canonical parent');
    }

    for (const contextId of ['pulse', 'staking-chamber', 'ledger-flow', 'capital-art', 'maxis-passport', 'ecosystem-l2']) {
      const links = siteMapJourneyLinks(contextId, { limit: 4, hasLinkedL2: false });
      if (
        links.length !== 4
        || new Set(links.map((entry) => entry.id)).size !== 4
        || links.some((entry) => (entry.parentId || entry.id) === (findSiteMapDestination(contextId)?.parentId || contextId))
      ) {
        fail(`site journey ${contextId} must expose four unique destinations outside its current family`);
      }
    }
    const pulseJourneyIds = siteMapJourneyLinks('pulse', { limit: 4 }).map((entry) => entry.id);
    const pulseRelatedIds = siteMapRelated('pulse', 4).map((entry) => entry.id);
    if (JSON.stringify(pulseJourneyIds) !== JSON.stringify(pulseRelatedIds)) {
      fail('Network Pulse must retain its established four-link relation order');
    }
    const stakingJourney = siteMapJourneyLinks('staking-chamber', { limit: 4 });
    if (stakingJourney[0]?.id !== 'my-tezos' || stakingJourney[0]?.href !== '/my/?view=portfolio') {
      fail('Staking Chamber must continue naturally into My Tezos Portfolio');
    }
    const unlinkedL2Journey = siteMapJourneyLinks('ecosystem-l2', { limit: 4, hasLinkedL2: false });
    if (unlinkedL2Journey.some((entry) => entry.id === 'my-tezos')) {
      fail('L2 contexts must not recommend My Tezos X without an explicit local link');
    }
    const linkedL2Journey = siteMapJourneyLinks('ecosystem-l2', { limit: 4, hasLinkedL2: true });
    if (linkedL2Journey[0]?.href !== '/my/?view=tezos-x') {
      fail('explicitly linked L2 contexts must continue into My Tezos X');
    }

    const activeAddress = 'tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb';
    const baseData = { fullAddress: activeAddress, loading: false, story: {} };
    const recommendationCases = [
      ['baker overview', { view: 'overview', data: { ...baseData, isBaker: true } }, ['health', 'chamber']],
      ['staker overview', { view: 'overview', data: { ...baseData, isStaker: true, staked: 1 } }, ['staking-chamber', 'calculator']],
      ['delegator overview', { view: 'overview', data: { ...baseData, bakerAddr: activeAddress } }, ['leaderboard-discover', 'health']],
      ['creator overview', { view: 'overview', data: { ...baseData, story: { creatorStats: { totalCreated: 1 } } } }, ['capital-art', 'maxis-artist']],
      ['collector overview', { view: 'overview', data: { ...baseData, story: { nftAssetsCollected: 2 } } }, ['hen', 'maxis-collector']],
      ['domain overview', { view: 'overview', data: { ...baseData, story: { domainAlias: 'person.tez' } } }, ['domains', 'ledger-flow']],
      ['portfolio tab', { view: 'portfolio', data: baseData }, ['ledger-flow', 'price']],
      ['transactions tab', { view: 'transactions', data: baseData }, ['ledger-flow', 'whales']],
      ['collection tab', { view: 'collection', data: baseData }, ['hen', 'capital-art']],
      ['story tab', { view: 'story', data: baseData }, ['maxis-passport', 'anthology']],
      ['linked Tezos X tab', { view: 'tezos-x', data: baseData, hasLinkedL2: true }, ['tezosx', 'ecosystem-l2']]
    ];
    for (const [label, options, expected] of recommendationCases) {
      const actual = buildMyTezosJourneyLinks({ address: activeAddress, ...options, origin: null }).map((entry) => entry.id);
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        fail(`${label} journey cards should be ${expected.join(', ')}, got ${actual.join(', ')}`);
      }
    }
    const unlinkedPersonalIds = buildMyTezosJourneyLinks({
      view: 'tezos-x',
      data: baseData,
      address: activeAddress,
      hasLinkedL2: false,
      origin: null
    }).map((entry) => entry.id);
    if (unlinkedPersonalIds.some((id) => ['tezosx', 'ecosystem-l2', 'l2-governance'].includes(id))) {
      fail('My Tezos must not infer an L2 continuation without an explicit active-address link');
    }
    const returnCards = buildMyTezosJourneyLinks({
      view: 'collection',
      data: baseData,
      address: activeAddress,
      origin: { entryId: 'capital', intentId: 'capital-art' }
    });
    if (returnCards[0]?.title !== 'Return to Art Economy' || returnCards[0]?.href !== '/capital/?view=art' || !returnCards[0]?.isReturn) {
      fail('My Tezos must reconstruct a canonical child-view Return card without raw route state');
    }

    const analytics = journeyAnalyticsDetails({
      from: 'capital-art',
      to: 'my-tezos',
      surface: 'generic-wayfinder',
      reason: 'account-collection'
    });
    if (
      JSON.stringify(Object.keys(analytics || {})) !== JSON.stringify(['from', 'to', 'surface', 'reason'])
      || Object.values(analytics || {}).some((value) => /(?:tz[1-4]|KT1|0x[0-9a-f]{40}|\.tez|address=)/i.test(value))
    ) {
      fail('journey analytics must contain only the four privacy-safe canonical dimensions');
    }
    const originalSessionStorage = globalThis.sessionStorage;
    const sessionValues = new Map();
    globalThis.sessionStorage = {
      getItem: (key) => sessionValues.get(key) || null,
      setItem: (key, value) => sessionValues.set(key, value),
      removeItem: (key) => sessionValues.delete(key)
    };
    sessionValues.set(MY_TEZOS_JOURNEY_ORIGIN_KEY, JSON.stringify({
      entryId: 'capital',
      intentId: 'capital-art',
      address: activeAddress
    }));
    if (readMyTezosJourneyOrigin() !== null || sessionValues.has(MY_TEZOS_JOURNEY_ORIGIN_KEY)) {
      fail('journey origin memory must reject and clear records with raw or extra fields');
    }
    if (originalSessionStorage === undefined) delete globalThis.sessionStorage;
    else globalThis.sessionStorage = originalSessionStorage;

    const rankedIntent = {
      'my tezos': 'my-tezos',
      wallet: 'my-tezos',
      '/history': 'history',
      '/leaderboard': 'leaderboard',
      '/compare': 'live-compare',
      widgets: 'widgets',
      '/stake': 'staking-chamber',
      chambers: 'chambers',
      governance: 'chamber',
      staking: 'staking-chamber',
      liquidity: 'liquidity-baking',
      finality: 'health',
      'rewards tracker': 'my-tezos',
      'nakamoto coefficient': 'health',
      "what's hot today": 'hot-today',
      nft: 'hen'
    };
    for (const [query, expectedId] of Object.entries(rankedIntent)) {
      const actual = searchSiteMap(query)[0]?.id;
      if (actual !== expectedId) fail(`site map search ${JSON.stringify(query)} should rank ${expectedId} first, got ${actual || 'none'}`);
    }
    const governanceOrder = searchSiteMap('governance').map((entry) => entry.id);
    if (!(governanceOrder.indexOf('chamber') < governanceOrder.indexOf('governance-guide')
      && governanceOrder.indexOf('governance-guide') < governanceOrder.indexOf('maxis'))) {
      fail(`site map search "governance" should keep the chamber first and rank the guide above Maxis, got ${governanceOrder.slice(0, 5).join(', ')}`);
    }

    const rankedSubfeatureIntent = {
      season: ['maxis-season', '/maxis/?view=season'],
      passport: ['maxis-passport', '/maxis/?view=passport'],
      champions: ['maxis-champions', '/maxis/?view=champions'],
      'transaction maxi': ['maxis-transaction', '/maxis/?lane=transaction'],
      'transaction season': ['maxis-transaction', '/maxis/?view=season&lane=transaction'],
      'transaction maxi season': ['maxis-transaction', '/maxis/?view=season&lane=transaction'],
      transaction: ['maxis-transaction', '/maxis/?lane=transaction'],
      'delegation maxi': ['maxis-delegation', '/maxis/?view=season&lane=delegation'],
      'bridge maxi': ['maxis-bridge', '/maxis/?view=season&lane=bridge'],
      'tezos vs ethereum': ['compare-ethereum', '/compare/tezos-vs-ethereum.html'],
      ethereum: ['compare-ethereum', '/compare/tezos-vs-ethereum.html'],
      'price widget': ['widget-price', '/widgets/price.html'],
      'baker card widget': ['widget-baker-card', '/widgets/baker-card.html']
    };
    for (const [query, [expectedId, expectedHref]] of Object.entries(rankedSubfeatureIntent)) {
      const actual = searchSiteMapIntents(query)[0];
      if (actual?.id !== expectedId || actual?.href !== expectedHref) {
        fail(`site map subfeature search ${JSON.stringify(query)} should rank ${expectedId} at ${expectedHref}, got ${actual?.id || 'none'} at ${actual?.href || 'none'}`);
      }
    }

    const transactionSeason = searchSiteMapIntents('transaction season')[0];
    if (transactionSeason?.title !== 'Transaction Maxi Season' || !/protocol-season Transaction Maxi race/.test(transactionSeason?.detail || '')) {
      fail('season lane intents must switch title and detail together with their season route');
    }

    const visibleLauncherQueries = {
      'HEN / Teia Collecting': 'hen',
      'Baker Directory': 'leaderboard',
      'Staking Rewards Estimator': 'calculator',
      'Tezos Widgets': 'widgets',
      'ctez Oven Exit': 'ctez'
    };
    for (const [query, expectedId] of Object.entries(visibleLauncherQueries)) {
      if (searchSiteMap(query)[0]?.id !== expectedId) fail(`visible Explore label ${JSON.stringify(query)} must resolve to ${expectedId}`);
    }

    const directoryIntentIds = new Set(SITE_MAP.flatMap((entry) => siteMapDirectoryChildren(entry).map((intent) => intent.id)));
    const browseIntentIds = siteMapBrowseIntents().map((intent) => intent.id);
    if (new Set(browseIntentIds).size !== browseIntentIds.length
      || JSON.stringify([...browseIntentIds].sort()) !== JSON.stringify([...directoryIntentIds].sort())) {
      fail('empty search browse must expose every nested directory view exactly once');
    }
    for (const entry of siteMapSitemapEntries()) {
      if (entry.parentId && !directoryIntentIds.has(entry.id)) fail(`crawlable child route is missing from the complete human map: ${entry.id}`);
    }

    const expectedWidgetFiles = (await walk('widgets', (name) => name.endsWith('.html') && !name.endsWith('/builder.html')))
      .map((file) => `/${file}`);
    const widgetIntentHrefs = new Set(intentEntries.filter((entry) => entry.parentId === 'widgets').map((entry) => entry.href));
    for (const href of expectedWidgetFiles) {
      if (!widgetIntentHrefs.has(href)) fail(`widget endpoint is missing from canonical site map intents: ${href}`);
    }

    for (const intent of intentEntries) {
      const url = new URL(intent.href, 'https://tezos.systems');
      if (url.origin !== 'https://tezos.systems') continue;
      const local = url.pathname.endsWith('/') ? `${url.pathname.slice(1)}index.html` : url.pathname.slice(1);
      if (local && !(await pathExists(local))) fail(`site map intent ${intent.id} points to missing local route ${intent.href}`);
    }

    for (const route of CHAMBER_ROUTES) {
      const canonicalSlug = route.canonicalSlug || route.slug;
      if (!SITE_MAP.some((entry) => entry.href === `/${canonicalSlug}/`)) {
        fail(`site map is missing canonical chamber route /${canonicalSlug}/`);
      }
      const routeShell = await readText(`${route.slug}/index.html`);
      if (routeShell.includes('chamber-route-shell-intro')
        || routeShell.includes('data-chamber-route-shell')
        || routeShell.includes('chamber-route-title')
        || routeShell.includes('Opening the live room')) {
        fail(`${route.slug}/index.html must not leave a redundant route introduction behind the live room`);
      }
      if (!routeShell.includes(`<meta name="description" content="${route.description}">`)
        || !routeShell.includes(`<title>${route.title} | tezos.systems</title>`)) {
        fail(`${route.slug}/index.html must keep its route-specific title and summary in document metadata`);
      }
      const shouldExposeFaq = route.slug === 'stake';
      if (!routeShell.includes('"@type": "WebPage"')
        || !routeShell.includes('"@type": "BreadcrumbList"')
        || routeShell.includes('"@type": "FAQPage"') !== shouldExposeFaq) {
        fail(`${route.slug}/index.html must use route-specific WebPage/Breadcrumb schema${shouldExposeFaq ? ' plus the canonical visible guide FAQ' : ' without inherited dashboard FAQ claims'}`);
      }
    }

    const standalonePages = [
      'governance/index.html',
      'bakers/index.html',
      'landing.html',
      'compare/index.html',
      'compare/tezos-vs-ethereum.html',
      'compare/tezos-vs-solana.html',
      'compare/tezos-vs-cardano.html',
      'compare/tezos-vs-algorand.html',
      'hen/index.html',
      '404.html',
      'widgets/builder.html'
    ];
    for (const file of standalonePages) {
      const html = await readText(file);
      if (!html.includes('data-site-circulation') || !html.includes('data-site-footer') || !html.includes('/css/site-map.min.css') || !html.includes('/js/landing/site-nav.js')) {
        fail(`${file} must expose contextual circulation and the complete shared site map`);
      }
    }

    const search = await readText('js/features/search.js');
    const searchEntities = await readText('js/core/search-entities.js');
    const searchCatalogSource = await readText('js/core/search-catalog.js');
    const nativeExplorer = await readText('js/features/native-explorer.js');
    const tezosCrpSearch = await readText('js/features/tezoscrp.js');
    const searchCatalog = JSON.parse(await readText('data/search-catalog.json'));
    const ecosystemAppsForSearch = JSON.parse(await readText('data/ecosystem-apps.json'));
    const app = await readText('js/core/app.js');
    const index = await readText('index.html');
    const siteHandoff = await readText('js/core/site-handoff.js');
    const wayfinder = await readText('js/ui/wayfinder.js');
    if (/const\s+CHAMBERS\s*=/.test(search)) fail('hero search must not keep a duplicate Chamber catalog');
    const searchContracts = [
      ['generated first-party catalog loader', 'loadSearchCatalog', search],
      ['stable quiet result reconciliation', 'quietlySyncHtml(panel', search],
      ['nonselectable loading results', 'selectable: false', search],
      ['no pointer-move rerender', "panel.addEventListener('mousemove'", search, false],
      ['pointer-move selection without rerender', "panel.addEventListener('pointermove'", search],
      ['state-sized Index Chamber sheet', 'hero-search-sheet ${idle ?', search],
      ['bounded first-paint search results', 'budgetResultGroups', search],
      ['search match explanations', 'searchMatchRanges', search],
      ['Base58 checksum validation', 'validateBase58Check', searchEntities],
      ['case-sensitive address warning', 'case-sensitive', search],
      ['catalog ranking through shared indexed score', 'siteMapScoreIndexed(siteMapSearchIndex(row), shape)', searchCatalogSource],
      ['contract entrypoint endpoint', '/entrypoints', nativeExplorer],
      ['contract same-code endpoint', '/same', nativeExplorer],
      ['contract raw-code endpoint', '/code?format=1', nativeExplorer],
      ['stale contract response guard', 'generation !== requestGeneration', nativeExplorer],
      ['partial Native Explorer source status', 'Partial TzKT read', nativeExplorer],
      ['Native Explorer last-good preservation', 'reconcileLastGoodLens', nativeExplorer],
      ['Native Explorer retry control', 'data-native-retry', nativeExplorer],
      ['Native Explorer unavailable-is-not-zero copy', 'unavailable fields are not zero', nativeExplorer],
      ['TezosCRP archive query route', "url.searchParams.set('q'", tezosCrpSearch]
    ];
    for (const [label, snippet, source, expected = true] of searchContracts) {
      const present = source.includes(snippet);
      if (present !== expected) fail(`search contract mismatch: ${label}`);
    }
    const searchCatalogKinds = searchCatalog.rows?.reduce((counts, row) => counts.add(row.kind), new Set()) || new Set();
    if (searchCatalog.schemaVersion !== 1
      || searchCatalog.rows?.length < 850
      || !['app', 'identity', 'history', 'milestone'].every((kind) => searchCatalogKinds.has(kind))) {
      fail('generated search catalog is incomplete');
    } else {
      pass(`search safety, catalog, contract-lens, and stable-interaction contracts checked: ${searchCatalog.rows.length} rows`);
    }
    const catalogAppNames = new Set(searchCatalog.rows?.filter((row) => row.kind === 'app').map((row) => row.title));
    const missingSearchApps = (ecosystemAppsForSearch.apps || []).map((appEntry) => appEntry.name).filter((name) => !catalogAppNames.has(name));
    if (missingSearchApps.length) fail(`generated search catalog omits reviewed apps: ${missingSearchApps.join(', ')}`);
    if (!index.includes('data-site-handoff data-site-context="home"')
      || !index.includes('data-site-footer data-site-context="home"')
      || !siteHandoff.includes('SITE_MAP_NAV_GROUPS.map')) {
      fail('dashboard must expose separate manifest-backed Handoff and footer surfaces');
    }
    for (const [questionId, entryId] of [
      ['build', 'ecosystem'],
      ['move', 'ledger-flow'],
      ['now', 'pulse'],
      ['mine', 'my-tezos'],
      ['decide', 'chamber'],
      ['before', 'anthology'],
      ['power', 'staking-chamber']
    ]) {
      if (!siteHandoff.includes(`id: '${questionId}'`) || !siteHandoff.includes(`entryId: '${entryId}'`)) {
        fail(`Handoff question ${questionId} must resolve through the canonical ${entryId} entry`);
      }
    }
    if (!siteHandoff.includes("window.addEventListener('site-handoff-signal', applySignal)")
      || !siteHandoff.includes("link.classList.toggle('is-emphasized'")
      || !siteHandoff.includes("container.dataset.siteHandoffEmphasisSource = source")
      || !siteHandoff.includes("document.visibilityState !== 'visible'")
      || !siteHandoff.includes("!handoffReaderIsHolding(container)")) {
      fail('Handoff signal emphasis must reconcile in place without rebuilding the navigation field');
    }
    if (!app.includes('initSiteWayfinder') || !wayfinder.includes('siteMapJourneyLinks')) fail('dashboard Chambers must initialize the shared semantic wayfinder');
    if (!index.includes('data-site-map-complete') || !index.includes('class="feature-launcher-directory-link"') || !index.includes('href="/#site-map"')) {
      fail('Explore must expose one quiet complete-directory utility');
    }
    if (index.includes('id="search-everything-feature-link"')) {
      fail('Explore must not duplicate the global search surface as another feature row');
    }
    const nativePulse = await readText('js/features/network-pulse.js');
    const nativeStaking = await readText('js/features/staking-chamber.js');
    const nativeWayfinders = [nativePulse, nativeStaking];
    for (const native of nativeWayfinders) {
      if (!native.includes('data-site-wayfinder-native') || !native.includes('siteMapJourneyLinks(') || !native.includes('href="/#chambers"') || !native.includes('href="/#search"')) {
        fail('native Chamber wayfinders must expose four semantic neighbors plus Chambers and search exits');
      }
    }
    const siteMapCss = await readText('css/site-map.css');
    if (siteMapCss.includes('var(--handoff-constellation-x)')
        || siteMapCss.includes('var(--handoff-constellation-compact-x)')) {
      fail('Handoff signal emphasis must not translate its interactive link targets');
    }
    if (!siteMapCss.includes('.chamber-overlay [data-site-wayfinder-native]')) {
      fail('native Chamber wayfinders must inherit the shared wayfinder color and border variables');
    }
    if ((nativePulse.match(/renderChamberLinks\(\)/g) || []).length < 3 || (nativeStaking.match(/renderNativeWayfinder\(\)/g) || []).length < 3) {
      fail('native Chamber wayfinders must survive both successful and failed live-data renders');
    }

    const jsonLdMatch = index.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/);
    const webAppSchema = jsonLdMatch ? JSON.parse(jsonLdMatch[1]) : null;
    const featureList = new Set(Array.isArray(webAppSchema?.featureList) ? webAppSchema.featureList : []);
    for (const entry of SITE_MAP.filter((item) => item.id !== 'home')) {
      if (!featureList.has(entry.title)) fail(`WebApplication featureList is missing canonical ware: ${entry.title}`);
    }

    pass(`site map graph checked: ${SITE_MAP.length} destinations, ${intentEntries.length} child views, ${SITE_MAP_NAV_GROUPS.length} groups, ${standalonePages.length} standalone surfaces`);
  }

  async function checkSitemapCoverage() {
    const sitemap = await readText('sitemap.xml');
    const locs = new Set(Array.from(sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)).map((match) => match[1].replaceAll('&amp;', '&')));
    const source = await readText('js/core/site-map.js');
    const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
    const { siteMapSitemapEntries } = await import(moduleUrl);
    const expected = new Set(siteMapSitemapEntries().map((entry) => new URL(entry.href, 'https://tezos.systems').toString()));
    const protocolData = JSON.parse(await readText('data/protocol-data.json'));
    for (const protocol of protocolData.protocols || []) {
      const slug = String(protocol?.name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      if (slug) expected.add(`https://tezos.systems/anthology/${slug}/`);
    }

    for (const url of expected) {
      if (!locs.has(url)) fail(`sitemap.xml missing ${url}`);
    }
    for (const url of locs) {
      if (!expected.has(url)) fail(`sitemap.xml contains a route outside the canonical site map: ${url}`);
      if (url.includes('#')) fail(`sitemap.xml should use crawlable paths instead of hash fragments: ${url}`);
    }

    const canonicalPages = {
      'landing.html': 'https://tezos.systems/',
      'staking/index.html': 'https://tezos.systems/stake/',
      'governance/index.html': 'https://tezos.systems/governance/',
      'bakers/index.html': 'https://tezos.systems/bakers/',
      'hen/index.html': 'https://tezos.systems/hen/',
      'widgets/builder.html': 'https://tezos.systems/widgets/builder.html'
    };
    for (const file of await walk('widgets', (name) => name.endsWith('.html') && !name.endsWith('/builder.html'))) {
      canonicalPages[file] = `https://tezos.systems/${file}`;
    }
    for (const [file, canonical] of Object.entries(canonicalPages)) {
      const html = await readText(file);
      if (!html.includes(`<link rel="canonical" href="${canonical}">`)) fail(`${file} canonical URL must agree with the site map: ${canonical}`);
      if (file === 'landing.html' && !html.includes(`<meta property="og:url" content="${canonical}">`)) {
        fail(`landing.html Open Graph URL must agree with its Dashboard canonical: ${canonical}`);
      }
    }

    const stakingRedirect = await readText('staking/index.html');
    const stakingRedirectScript = await readText('js/landing/staking-redirect.js');
    if (!stakingRedirect.includes('<meta name="robots" content="noindex, follow">')
      || !stakingRedirect.includes('<meta http-equiv="refresh" content="0; url=/stake/?view=guide">')
      || !stakingRedirect.includes('href="/stake/?view=guide"')
      || !stakingRedirect.includes('src="/js/landing/staking-redirect.js"')
      || !stakingRedirectScript.includes("window.location.replace('/stake/?view=guide')")) {
      fail('/staking/ must remain a noindex compatibility redirect into the canonical /stake/ guide view');
    }

    pass(`canonical sitemap equality checked: ${locs.size} URLs`);
  }

  async function checkPublicDataDiscoveryContracts() {
    const pagesConfig = await readText('_config.yml');
    const openApi = JSON.parse(await readText('.well-known/openapi.json'));
    const aiPlugin = JSON.parse(await readText('.well-known/ai-plugin.json'));
    const maxisManifest = JSON.parse(await readText('data/maxis/manifest.json'));
    const llms = await readText('llms.txt');
    const sitemap = await readText('sitemap.xml');
    const generator = await readText('scripts/generate-llms-txt.mjs');
    const orchestrator = await readText('scripts/refresh-generated-surfaces.mjs');
    const dataFiles = await walk('data', (file) => file.endsWith('.json'));
    const publicPathPatterns = [];
    const operationIds = new Set();
    const resolveLocalRef = (ref) => {
      if (!String(ref || '').startsWith('#/')) return undefined;
      return ref.slice(2).split('/').reduce((value, part) => value?.[part.replace(/~1/g, '/').replace(/~0/g, '~')], openApi);
    };
    const inspectRefs = (value) => {
      if (Array.isArray(value)) {
        value.forEach(inspectRefs);
        return;
      }
      if (!value || typeof value !== 'object') return;
      if ('$ref' in value && (!String(value.$ref).startsWith('#/') || resolveLocalRef(value.$ref) === undefined)) {
        fail(`OpenAPI catalogue has an unresolved or non-local reference: ${value.$ref}`);
      }
      Object.values(value).forEach(inspectRefs);
    };

    inspectRefs(openApi);
    if (openApi.openapi !== '3.0.3'
      || openApi.servers?.[0]?.url !== 'https://tezos.systems') {
      fail('OpenAPI public data catalogue must be a site-owned OpenAPI 3.0 document');
    }
    if (!/^include:\s*\n\s*-\s*\.well-known\s*$/m.test(pagesConfig)) {
      fail('GitHub Pages Jekyll config must include the public .well-known directory');
    }

    const passportShardParameter = openApi.components?.parameters?.PassportShard;
    const passportSharding = maxisManifest.passportSharding;
    const passportShardCount = Number(passportSharding?.shardCount);
    if (!Number.isInteger(passportShardCount) || passportShardCount < 1 || passportShardCount > 256) {
      fail(`Maxis manifest Passport shard count must be an integer from 1 to 256, saw ${passportSharding?.shardCount}`);
    } else {
      const expectedPassportShards = Array.from(
        { length: passportShardCount },
        (_, index) => index.toString(16).padStart(2, '0')
      );
      const passportShardRange = `${expectedPassportShards[0]}..${expectedPassportShards.at(-1)}`;
      const manifestOutput = String(passportSharding?.output || '');
      const parameterDescription = String(passportShardParameter?.description || '');
      const parameterPatternSource = String(passportShardParameter?.schema?.pattern || '');
      let passportShardPattern = null;
      try {
        passportShardPattern = new RegExp(parameterPatternSource);
      } catch {
        fail(`OpenAPI PassportShard pattern is invalid: ${parameterPatternSource}`);
      }
      if (!manifestOutput.includes(passportShardRange)) {
        fail(`Maxis manifest Passport shard output must disclose its derived ${passportShardRange} range`);
      }
      if (!parameterDescription.includes(String(passportShardCount))
        || !parameterDescription.includes(passportShardRange)) {
        fail(`OpenAPI PassportShard description must disclose the manifest's ${passportShardCount}-shard ${passportShardRange} range`);
      }
      if (passportShardPattern) {
        const documentedPassportShards = Array.from(
          { length: 256 },
          (_, index) => index.toString(16).padStart(2, '0')
        ).filter((shard) => passportShardPattern.test(shard));
        assert.deepEqual(
          documentedPassportShards,
          expectedPassportShards,
          'OpenAPI PassportShard pattern must match exactly the manifest-derived shard range'
        );
        const invalidPassportShardExamples = ['', '0', '000', '0A', '3F', '40', 'ff', 'gg', ' 00', '00 '];
        if (!parameterPatternSource.startsWith('^')
          || !parameterPatternSource.endsWith('$')
          || invalidPassportShardExamples.some((shard) => passportShardPattern.test(shard))) {
          fail('OpenAPI PassportShard pattern must reject values outside the exact two-character lowercase manifest range');
        }
      }
      for (const season of maxisManifest.seasons || []) {
        assert.deepEqual(
          season.availableShards,
          expectedPassportShards,
          `${season.id} availableShards must match the manifest Passport sharding contract`
        );
      }
    }

    for (const [publicPath, pathItem] of Object.entries(openApi.paths || {})) {
      const operation = pathItem.get;
      if (!operation) continue;
      if (!operation.operationId || operationIds.has(operation.operationId)) {
        fail(`OpenAPI public data operation ${publicPath} has a missing or duplicate operationId`);
      }
      operationIds.add(operation.operationId);
      if (!operation.responses?.['200'] || operation.requestBody) {
        fail(`OpenAPI public data operation ${publicPath} must be read-only with a documented 200 response`);
      }
      const declaredParameters = [...(pathItem.parameters || []), ...(operation.parameters || [])]
        .map((parameter) => parameter?.$ref ? resolveLocalRef(parameter.$ref) : parameter)
        .filter(Boolean);
      const templateParameters = Array.from(publicPath.matchAll(/\{([^}]+)\}/g), (match) => match[1]).sort();
      const documentedPathParameters = declaredParameters
        .filter((parameter) => parameter.in === 'path' && parameter.required === true)
        .map((parameter) => parameter.name)
        .sort();
      if (JSON.stringify(templateParameters) !== JSON.stringify(documentedPathParameters)) {
        fail(`OpenAPI path parameters do not match ${publicPath}: ${documentedPathParameters.join(', ')}`);
      }
      for (const field of ['summary', 'description', 'x-refresh-cadence', 'x-license-boundary']) {
        if (!String(operation[field] || '').trim()) {
          fail(`OpenAPI public data operation ${publicPath} is missing ${field}`);
        }
      }
      if (publicPath.startsWith('/data/')) {
        const pattern = openApiPathPattern(publicPath);
        publicPathPatterns.push(pattern);
        if (!dataFiles.some((file) => pattern.test(file))) {
          fail(`OpenAPI public data path family has no matching artifact: ${publicPath}`);
        }
      }
    }

    const internalArtifactPatterns = [
      // Versioned browser encodings derive exact bytes from the public sources;
      // the expanded source schemas remain the supported public data interface.
      /^data\/transports\/v1\/data\/(?:capital-snapshot|minerals-snapshot|ecosystem-stats)\.json$/,
      /^data\/transports\/v1\/data\/maxis\/seasons\/[^/]+\/passports\/[0-9a-f]{2}\.json$/,
      /^data\/maxis-contracts\.json$/,
      /^data\/maxis\/seasons\/[^/]+\/transaction-state(?:\.building)?\.json$/,
      /^data\/tezoscrp-identity-aliases\.json$/,
      /^data\/tweets\.json$/
    ];
    for (const file of dataFiles) {
      if (!publicPathPatterns.some((pattern) => pattern.test(file))
        && !internalArtifactPatterns.some((pattern) => pattern.test(file))) {
        fail(`tracked data artifact is neither catalogued nor explicitly internal: ${file}`);
      }
    }

    const sitemapUrls = Array.from(sitemap.matchAll(/<loc>(https:\/\/tezos\.systems\/[^<]*)<\/loc>/g), (match) => match[1]).sort();
    const destinationBlock = llms.split('## Canonical destinations\n\n')[1]?.split('\n\n## Public JSON data')[0] || '';
    const llmsDestinationUrls = Array.from(destinationBlock.matchAll(/\]\((https:\/\/tezos\.systems\/[^)]*)\)/g), (match) => match[1]).sort();
    assert.deepEqual(llmsDestinationUrls, sitemapUrls, 'llms.txt canonical destinations must match sitemap.xml exactly');

    for (const [publicPath, pathItem] of Object.entries(openApi.paths || {})) {
      const summary = pathItem.get?.summary;
      const expectedSummary = publicPath.includes('{')
        ? `${summary} — path template: \`${publicPath}\``
        : `[${summary}](`;
      if (summary && !llms.includes(expectedSummary)) {
        fail(`llms.txt is missing OpenAPI dataset summary: ${summary}`);
      }
    }
    assert.equal(llms, await renderLlmsTxt(), 'llms.txt must match its canonical generator byte-for-byte');
    if (/%7B|%7D/.test(llms)) fail('llms.txt must not publish encoded path-template placeholders as broken links');
    if (!generator.includes("js/core/site-map.js") || !generator.includes(".well-known', 'openapi.json")) {
      fail('llms.txt generator must derive from the canonical site map and OpenAPI catalogue');
    }
    if (!orchestrator.includes("nodeScript('scripts/generate-llms-txt.mjs')") || !orchestrator.includes("const LLMS_TARGETS = ['llms.txt']")) {
      fail('generated-surface orchestration must refresh and track llms.txt');
    }
    if (!aiPlugin.description_for_model.includes('/llms.txt')
      || !aiPlugin.description_for_model.includes('OpenAPI document catalogues intentionally public JSON artifacts')) {
      fail('AI plugin metadata must direct models to the complete public data catalogue and llms.txt');
    }

    pass(`public data discovery covers ${dataFiles.length} JSON artifacts across ${publicPathPatterns.length} public path families and explicit internal families`);
  }

  return { checkSiteMapGraphContracts, checkSitemapCoverage, checkPublicDataDiscoveryContracts };
}
