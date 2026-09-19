// Static contracts owned by chambers. Shared dependencies remain explicit.
export function createChambersStaticChecks({
  CHAMBER_ROUTES,
  assert,
  fail,
  pass,
  pathExists,
  readText,
  routeUrl,
  stableJsonHash,
  standaloneFeatureForRoute,
  vm
}) {
  async function checkMetalsIntegrationContracts() {
    const [
      snapshotText,
      entryText,
      feature,
      css,
      generator,
      packageText,
      generatedSurfaces,
      siteMap,
      app,
      routeHtml,
      ogGenerator,
      sw,
      openApiText,
      smoke
    ] = await Promise.all([
      readText('data/metals-snapshot.json'),
      readText('data/metals-entry-summary.json'),
      readText('js/features/metals-chamber.js'),
      readText('css/metals-chamber.css'),
      readText('scripts/refresh-metals-data.mjs'),
      readText('package.json'),
      readText('scripts/refresh-generated-surfaces.mjs'),
      readText('js/core/site-map.js'),
      readText('js/core/app.js'),
      readText('metals/index.html'),
      readText('scripts/generate-chamber-og-images.mjs'),
      readText('sw.js'),
      readText('.well-known/openapi.json'),
      readText('tests/smoke.mjs')
    ]);
    const snapshot = JSON.parse(snapshotText);
    const entry = JSON.parse(entryText);
    const packageJson = JSON.parse(packageText);
    const openApi = JSON.parse(openApiText);
    const expectedMetals = ['gold', 'silver', 'platinum', 'palladium', 'rhodium', 'ruthenium', 'iridium', 'osmium'];
    const expectedSymbols = ['Au', 'Ag', 'Pt', 'Pd', 'Rh', 'Ru', 'Ir', 'Os'];
    const metalIds = (snapshot.metals || []).map((row) => row.id);
    const metalSymbols = (snapshot.metals || []).map((row) => row.symbol);

    const { contentHash: snapshotHash, ...unsignedSnapshot } = snapshot;
    const { contentHash: entryHash, ...unsignedEntry } = entry;
    if (snapshot.schemaVersion !== 1
        || stableJsonHash(unsignedSnapshot) !== snapshotHash
        || JSON.stringify(metalIds) !== JSON.stringify(expectedMetals)
        || JSON.stringify(metalSymbols) !== JSON.stringify(expectedSymbols)
        || JSON.stringify(snapshot.taxonomy?.includedSymbols) !== JSON.stringify(expectedSymbols)) {
      fail('Precious Metals snapshot must retain one valid stable receipt for the canonical ordered eight-metal assay');
    }
    if (entry.schemaVersion !== 1
        || stableJsonHash(unsignedEntry) !== entryHash
        || entry.source?.path !== 'data/metals-snapshot.json'
        || entry.source?.contentHash !== snapshot.contentHash
        || !Array.isArray(entry.metals)
        || entry.metals.length !== expectedMetals.length) {
      fail('Precious Metals launcher projection must match the complete snapshot receipt and retain all eight availability rows');
    }

    const route = CHAMBER_ROUTES.find(({ slug }) => slug === 'metals');
    if (!route
        || route.hash !== '#metals'
        || routeUrl(route) !== 'https://tezos.systems/metals/'
        || !/eight/i.test(route.title)
        || !/without inferring backing/i.test(route.description)) {
      fail('Precious Metals canonical route metadata must retain its eight-metal and non-backing identity');
    }
    for (const [label, snippet, source] of [
      ['site-map destination', "id: 'metals'", siteMap],
      ['site-map canonical route', "href: '/metals/'", siteMap],
      ['site-map Assay view', "href: '/metals/?view=assay'", siteMap],
      ['site-map Markets view', "href: '/metals/?view=markets'", siteMap],
      ['site-map VNXAU view', "href: '/metals/?view=vnxau'", siteMap],
      ['site-map Proofbook view', "href: '/metals/?view=proofbook'", siteMap],
      ['app feature import', 'initMetalsChamber', await readText('js/core/chamber-features.mjs')],
      ['app pretty-route opener', "case 'metals':", app],
      ['app hash alias', "params.has('precious-metals')", app],
      ['app modal cleanup', 'closeMetalsChamber', await readText('js/core/chamber-features.mjs')],
      ['app routed overlay', "'metals-modal': { entryIds: ['metals']", app],
      ['app featured launcher target', "metals: { selector: '#metals-entry-card', layout: 'featured' }", app],
      ['explicit OG content', 'metals: {', ogGenerator]
    ]) {
      if (!source.includes(snippet)) fail(`Precious Metals ${label} contract is missing`);
    }
    if (!routeHtml.includes('data-chamber-route="metals"')
        || !routeHtml.includes('<link rel="canonical" href="https://tezos.systems/metals/">')
        || !routeHtml.includes('/og/metals.png')
        || !routeHtml.includes('Precious Metals')) {
      fail('Precious Metals generated route must retain its identity, canonical URL, title, and dedicated OG image');
    }

    const snapshotOperation = openApi.paths?.['/data/metals-snapshot.json']?.get;
    const entryOperation = openApi.paths?.['/data/metals-entry-summary.json']?.get;
    if (snapshotOperation?.operationId !== 'getMetalsSnapshot'
        || entryOperation?.operationId !== 'getMetalsEntrySummary'
        || !/complete Precious Metals/i.test(snapshotOperation?.summary || '')
        || !/compact Precious Metals/i.test(entryOperation?.summary || '')) {
      fail('OpenAPI must expose distinct complete and compact Precious Metals read-only artifacts');
    }
    for (const dataPath of ['/data/metals-entry-summary.json', '/data/metals-snapshot.json']) {
      if (!sw.includes(`'${dataPath}'`)) fail(`service worker network-only data inventory is missing ${dataPath}`);
    }
    if (!sw.includes('isNetworkOnlyDataPath(url.pathname)')) {
      fail('Precious Metals generated receipts must use the service worker network-only data branch');
    }

    if (packageJson.scripts?.['refresh:metals'] !== 'node scripts/refresh-metals-data.mjs'
        || packageJson.scripts?.['check:metals'] !== 'node scripts/refresh-metals-data.mjs --check'
        || packageJson.scripts?.['test:metals'] !== 'node tests/metals-check.mjs') {
      fail('package scripts must expose Precious Metals refresh, offline validation, and focused data checks');
    }
    for (const snippet of [
      "const METALS_TARGETS = ['data/metals-snapshot.json', 'data/metals-entry-summary.json']",
      "nodeScript('scripts/refresh-metals-data.mjs', ['--check'])",
      "nodeScript('scripts/refresh-metals-data.mjs')",
      'stageTargets(METALS_TARGETS)'
    ]) {
      if (!generatedSurfaces.includes(snippet)) fail(`generated-surface orchestration is missing Precious Metals contract ${snippet}`);
    }
    if (!generator.includes('data/metals-snapshot.json')
        || !generator.includes('data/metals-entry-summary.json')
        || !generator.includes('--check')) {
      fail('Precious Metals generator must own both bounded artifacts and an offline check mode');
    }

    for (const snippet of [
      "const METALS_SNAPSHOT_URL = '/data/metals-snapshot.json'",
      "const METALS_ENTRY_SUMMARY_URL = '/data/metals-entry-summary.json'",
      "['XAU', 'XAG', 'XPT', 'XPD', 'XRH', 'XRU', 'XIR', 'XOS']",
      "{ id: 'assay'",
      "{ id: 'markets'",
      "{ id: 'vnxau'",
      "{ id: 'proofbook'",
      'syncChamberReading(body, markup, { quiet:',
      'quietlySyncHtml(front, markup)',
      'document.visibilityState',
      'visibilitychange',
      '__METALS_CHAMBER_REFRESH_MS__',
      '__METALS_ENTRY_REFRESH_MS__',
      'Last good',
      'No backing ratio or present redemption claim is calculated here.'
    ]) {
      if (!feature.includes(snippet)) fail(`Precious Metals browser truth/refresh contract is missing ${snippet}`);
    }
    const entryMarkupBlock = feature.match(/function entryMarkup\(snapshot\)[\s\S]*?(?=\nfunction wireEntry\()/)?.[0] || '';
    const entryTimerBlock = feature.match(/function startEntryRefreshTimer\(\)[\s\S]*?(?=\nfunction bindVisibilityRefresh\()/)?.[0] || '';
    const visibilityBlock = feature.match(/function bindVisibilityRefresh\(\)[\s\S]*?(?=\nasync function refreshMetalsEntry\()/)?.[0] || '';
    const entryRefreshBlock = feature.match(/async function refreshMetalsEntry\([\s\S]*?(?=\nasync function refreshMetalsChamber\()/)?.[0] || '';
    if (!entry.sourceStatuses?.imfPcps || !entry.sourceStatuses?.blockscoutVnxau
        || !entryMarkupBlock.includes("retainedSourceState(snapshot, 'imfPcps'")
        || !entryMarkupBlock.includes("retainedSourceState(snapshot, 'blockscoutVnxau'")
        || !entryMarkupBlock.includes('IMF last-good history')
        || !entryMarkupBlock.includes('VNXAU last-good holder addresses')) {
      fail('Precious Metals compact launcher must retain independent IMF and Blockscout receipts with explicit last-good labels');
    }
    if (!entryTimerBlock.includes("document.visibilityState !== 'visible'")
        || !entryTimerBlock.includes('entryRefreshDeferred = true')
        || !entryTimerBlock.includes("classList.contains('active')")
        || !entryTimerBlock.includes('refreshMetalsEntry({ quiet: true })')
        || !visibilityBlock.includes('entryRefreshDeferred && !overlayOpen')
        || !visibilityBlock.includes('refreshMetalsEntry({ quiet: true })')) {
      fail('Precious Metals compact timer must be room-aware, visibility-gated, and perform one compact catch-up');
    }
    if (!entryRefreshBlock.includes('markEntryRefreshFailure(error, { quiet })')
        || entryRefreshBlock.includes('refreshMetalsChamber')
        || entryRefreshBlock.includes('METALS_SNAPSHOT_URL')) {
      fail('Precious Metals compact-summary failure must retain or mark the launcher without falling back to the full snapshot');
    }
    for (const smokeContract of [
      '__METALS_ENTRY_REFRESH_MS__',
      'compact failure fetched the full room or remained in verification',
      'hidden launcher timer polled or mutated the closed card',
      'catch-up hid stale IMF/Blockscout clocks behind fresh Gold'
    ]) {
      if (!smoke.includes(smokeContract)) fail(`Precious Metals smoke is missing compact-launcher contract ${smokeContract}`);
    }
    if (/fetch\(\s*['"`]https?:/i.test(feature)
        || /data-metals-(?:buy|sell|trade|swap|bridge|redeem)|tradeUrl/i.test(feature)) {
      fail('Precious Metals browser must stay on same-origin generated receipts and expose no execution CTA contract');
    }
    for (const selector of [
      '.metals-entry-card',
      '.metals-content',
      '.metals-body',
      '.metals-tab',
      '.metals-metal-switch',
      '.metals-assay-grid',
      '.metals-clock-pair',
      '.metals-chain-grid',
      '.metals-proof-grid'
    ]) {
      if (!css.includes(selector)) fail(`Precious Metals CSS is missing ${selector}`);
    }
    const entryPerimeterBlock = css.match(/\.metals-entry-card::before\s*\{[^}]*\}/)?.[0] || '';
    if (!entryPerimeterBlock || /\banimation\s*:/.test(entryPerimeterBlock)) {
      fail('Precious Metals ordinary launcher perimeter must remain static; continuous attention is risk-only');
    }
    if (!smoke.includes("name: 'metals-chamber'")) {
      fail('smoke catalog must include the focused Precious Metals Chamber suite');
    }

    pass('Precious Metals route, artifacts, compact-only timers/failures, source clocks, and quiet-refresh integration contracts checked');
  }

  async function checkCapitalContracts() {
    const [snapshotText, feature, css, capitalGenerator, packageText, generatedSurfaces, chamberRoutes, siteMap, app, smoke] = await Promise.all([
      readText('data/capital-snapshot.json'),
      readText('js/features/capital-chamber.js'),
      readText('css/capital.css'),
      readText('scripts/refresh-capital-data.mjs'),
      readText('package.json'),
      readText('scripts/refresh-generated-surfaces.mjs'),
      readText('scripts/lib/chamber-routes.mjs'),
      readText('js/core/site-map.js'),
      readText('js/core/app.js'),
      readText('tests/smoke.mjs')
    ]);
    const snapshot = JSON.parse(snapshotText);
    const packageJson = JSON.parse(packageText);
    const { contentHash, ...unsignedSnapshot } = snapshot;

    if (snapshot.schemaVersion !== 1 || !Number.isFinite(Date.parse(snapshot.generatedAt || ''))) {
      fail('Capital snapshot must use schemaVersion 1 with an ISO generatedAt receipt');
    }
    if (!/^[0-9a-f]{64}$/.test(contentHash || '') || stableJsonHash(unsignedSnapshot) !== contentHash) {
      fail('Capital snapshot contentHash must match the stable unsigned snapshot payload');
    }
    if (Buffer.byteLength(snapshotText) > 2 * 1024 * 1024) {
      fail(`Capital snapshot exceeds the 2 MiB browser payload budget: ${Buffer.byteLength(snapshotText)} bytes`);
    }

    const defiChains = new Map((snapshot.defi?.chains || []).map((chain) => [chain.id, chain]));
    for (const chainId of ['tezos', 'etherlink']) {
      const chain = defiChains.get(chainId);
      if (!chain || !Array.isArray(chain.tvl?.history) || !chain.tvl.history.length
        || !Array.isArray(chain.stablecoins?.history) || !chain.stablecoins.history.length) {
        fail(`Capital snapshot must retain public TVL and stablecoin history for ${chainId}`);
      }
    }
    if (!Array.isArray(snapshot.network?.tezos?.transactions?.daily) || !snapshot.network.tezos.transactions.daily.length
      || !Array.isArray(snapshot.network?.etherlink?.series?.newTransactions) || !snapshot.network.etherlink.series.newTransactions.length
      || !Array.isArray(snapshot.network?.etherlink?.series?.newAccounts) || !snapshot.network.etherlink.series.newAccounts.length) {
      fail('Capital snapshot must retain explicitly labeled Tezos and Etherlink transaction histories');
    }
    if (!Array.isArray(snapshot.network?.tezos?.fees?.daily)
        || snapshot.network.tezos.fees.daily.length < 28
        || snapshot.network.tezos.fees.daily.some((row) => !Number.isFinite(row.totalMutez) || !Number.isFinite(row.blockCount))) {
      fail('Capital snapshot must retain at least 28 completed days of numeric Tezos L1 block-fee pools');
    }
    for (const key of ['transactionFees', 'averageTransactionFee', 'averageGasPrice']) {
      if (!Array.isArray(snapshot.network?.etherlink?.series?.[key]) || snapshot.network.etherlink.series[key].length < 300) {
        fail(`Capital snapshot must retain a long Etherlink ${key} daily series`);
      }
    }
    const capitalStats = snapshot.network?.tezos?.statistics || {};
    const expectedStakingRatio = ((capitalStats.ownStakedMutez + capitalStats.externalStakedMutez) / capitalStats.totalSupplyMutez) * 100;
    if (![capitalStats.ownStakedMutez, capitalStats.externalStakedMutez, capitalStats.totalSupplyMutez, capitalStats.stakingRatioPct].every(Number.isFinite)
      || Math.abs(capitalStats.stakingRatioPct - expectedStakingRatio) > 0.0001) {
      fail('Capital snapshot staking ratio must be own plus external staked XTZ divided by total supply');
    }
    for (const currency of ['usd', 'btc', 'eth']) {
      if (!Array.isArray(snapshot.markets?.xtz?.priceHistory?.[currency]) || snapshot.markets.xtz.priceHistory[currency].length < 365) {
        fail(`Capital snapshot must retain a 365-day XTZ/${currency.toUpperCase()} return input series`);
      }
    }
    if (snapshot.markets?.xtz?.tickers?.length !== 100 || snapshot.markets?.xtz?.coverage?.tickerHardCap !== 100) {
      fail('Capital snapshot must retain the complete disclosed first page of 100 CoinGecko ticker rows');
    }
    if (!capitalGenerator.includes('tickers.length !== COINGECKO_TICKER_PAGE_SIZE')
      || !capitalGenerator.includes('expected the complete first page of ${COINGECKO_TICKER_PAGE_SIZE}')) {
      fail('Capital generator must reject incomplete CoinGecko ticker pages so the last-known-good section survives');
    }
    const xu3o8 = (snapshot.rwa?.assets || []).find((asset) => asset.id === 'xu3o8');
    if (xu3o8?.contract?.toLowerCase() !== '0x79052ab3c166d4899a1e0dd033ac3b379af0b1fd'
      || xu3o8?.issuer !== 'Uranium.io' || xu3o8?.decimals !== 18) {
      fail('Capital snapshot must preserve the issuer-confirmed Etherlink xU3O8 contract receipt');
    }
    if (!Array.isArray(snapshot.art?.marketplaces) || snapshot.art.marketplaces.length < 3
      || !Array.isArray(snapshot.art?.topCollections30d) || !snapshot.art.topCollections30d.length
      || !Array.isArray(snapshot.art?.topBuyers30d) || !snapshot.art.topBuyers30d.length
      || !Array.isArray(snapshot.art?.topArtists30d) || !snapshot.art.topArtists30d.length
      || !/gross sales, not creator earnings or trader profit/i.test(snapshot.art?.coverage?.saleVolumeDefinition || '')) {
      fail('Capital snapshot must retain marketplace, collection, buyer, and artist coverage without a net-earnings claim');
    }
    if (!Array.isArray(snapshot.development?.octez?.daily) || !snapshot.development.octez.daily.length
      || snapshot.development?.octez?.windowDays !== 28
      || !/not all Tezos ecosystem development/i.test(snapshot.development?.octez?.scope || '')) {
      fail('Capital snapshot must retain a scoped 28-day Octez development receipt');
    }
    const unavailableById = new Map((snapshot.unavailable || []).map((item) => [item.id, item]));
    for (const id of ['comprehensive-cex-net-flows', 'proprietary-community-composite', 'xu3o8-sruuf-return-spread']) {
      const receipt = unavailableById.get(id);
      if (receipt?.status !== 'unavailable' || receipt?.methodology !== 'not-calculated' || !receipt?.reason) {
        fail(`Capital snapshot must carry an explicit unavailable methodology receipt for ${id}`);
      }
    }

    if (packageJson.scripts?.['refresh:capital'] !== 'node scripts/refresh-capital-data.mjs'
      || packageJson.scripts?.['check:capital'] !== 'node scripts/refresh-capital-data.mjs --check') {
      fail('package scripts must expose Capital snapshot refresh and offline validation');
    }
    const capitalCheckIndex = generatedSurfaces.indexOf("nodeScript('scripts/refresh-capital-data.mjs', ['--check'])");
    const capitalRefreshIndex = generatedSurfaces.indexOf("nodeScript('scripts/refresh-capital-data.mjs')");
    const milestoneIndex = generatedSurfaces.indexOf("nodeScript('scripts/generate-milestone-catalog.mjs'");
    if (capitalCheckIndex < 0 || capitalRefreshIndex < 0 || milestoneIndex < 0
      || capitalCheckIndex > milestoneIndex || capitalRefreshIndex > milestoneIndex
      || !generatedSurfaces.includes("const CAPITAL_TARGETS = ['data/capital-snapshot.json']")
      || !generatedSurfaces.includes('stageTargets(CAPITAL_TARGETS)')) {
      fail('generated surfaces must check/refresh and optionally stage Capital data before downstream generated outputs');
    }

    const routeContracts = [
      ['Capital Chamber route metadata', "slug: 'capital'", chamberRoutes],
      ['Capital Chamber site-map destination', "href: '/capital/'", siteMap],
      ['Capital Chamber site-map direct Markets view', "href: '/capital/?view=markets'", siteMap],
      ['Capital Chamber site-map direct network-fees view', "href: '/capital/?view=system&focus=fees'", siteMap],
      ['Capital Chamber app import', 'initCapitalChamber', await readText('js/core/chamber-features.mjs')],
      ['Capital Chamber pretty route opener', "case 'capital':", app],
      ['Capital Chamber hash route', "hash === 'capital'", app],
      ['Capital Chamber close cleanup', 'closeCapitalChamber', await readText('js/core/chamber-features.mjs')],
      ['Capital Chamber routed overlay', "'capital-modal': { entryIds: ['capital']", app],
      ['Capital Chamber category membership', "entryIds: Object.freeze(['capital', 'minerals', 'uranium', 'metals', 'whales', 'staking-chamber'])", siteMap]
    ];
    for (const [label, needle, source] of routeContracts) {
      if (!source.includes(needle)) fail(`${label} contract is missing`);
    }

    if (!feature.includes('data/capital-snapshot.json')) {
      fail('Capital Chamber must render from the first-party committed Capital snapshot');
    }
    if (!capitalGenerator.includes("select: 'fees'")
        || !capitalGenerator.includes("['transactionFees', 'txnsFee'")
        || !capitalGenerator.includes("['averageTransactionFee', 'averageTxnFee'")
        || !capitalGenerator.includes("['averageGasPrice', 'averageGasPrice'")) {
      fail('Capital generator must retain source-native L1 block fees plus Etherlink transaction-fee and gas histories');
    }
    for (const view of ['system', 'markets', 'assets', 'art']) {
      if (!new RegExp(`["']${view}["']`).test(feature)) fail(`Capital Chamber must expose the ${view} view`);
    }
    if (!/isStale|isAnomaly|trustScore/.test(feature) || !/quarantin|quality/i.test(feature)) {
      fail('Capital Markets must visibly quarantine low-quality, stale, or anomalous venue rows');
    }
    if (/\.tradeUrl\b|data-capital-trade|>\s*Trade\s*</i.test(feature)) {
      fail('Capital Markets must not ship direct exchange trading CTAs');
    }
    if (!feature.includes('RANGES.filter((range) => available.has(range.id))')
        || !feature.includes('source window')
        || !feature.includes('capital-network-costs')
        || !feature.includes('No fictional combined total')) {
      fail('Capital Chamber must expose only valid view ranges and keep network fees layer-separated');
    }
    if (!feature.includes('quiet-refresh.js') || !feature.includes('quietlySyncHtml')
      || !feature.includes("document.visibilityState === 'visible'")
      || !feature.includes('visibilitychange')
      || !feature.includes('__CAPITAL_CHAMBER_REFRESH_MS__')
      || !/lastGood|last-good|last good/i.test(feature)) {
      fail('Capital Chamber must use quiet reconciliation, a visibility gate/catch-up, test interval override, and last-good data');
    }
    for (const selector of ['.capital-entry-card', '.capital-entry-price-chart', '.capital-overlay', '.capital-tabs', '.capital-tab', '.capital-range-wrap', '.capital-range-static', '.capital-cost-section', '.capital-market-price-panel', '.capital-featured-price-chart', '.capital-quality', '.capital-source-receipt']) {
      if (!css.includes(selector)) fail(`Capital Chamber CSS is missing ${selector}`);
    }
    if (!smoke.includes("name: 'capital-chamber'")
        || !smoke.includes('window.__CAPITAL_CHAMBER_REFRESH_MS__')
        || !smoke.includes('window.__capitalSmokeTimerTick')) {
      fail('smoke catalog must include the focused Capital Chamber quiet-refresh suite');
    }

    if (!(await pathExists('capital/index.html')) || !(await pathExists('og/capital.png'))) {
      fail('Capital Chamber generated pretty route and OG image must exist');
    } else {
      const capitalRoute = await readText('capital/index.html');
      if (!capitalRoute.includes('<link rel="canonical" href="https://tezos.systems/capital/">')
        || !capitalRoute.includes('/og/capital.png')) {
        fail('Capital Chamber generated route must retain its canonical URL and dedicated OG image');
      }
    }

    pass(`Capital Chamber snapshot, source, route, quality, and quiet-refresh contracts checked (${snapshot.markets.xtz.tickers.length} venue rows)`);
  }

  async function checkEcosystemActivityContracts() {
    const [
      manifestText,
      snapshotText,
      feature,
      css,
      generator,
      library,
      packageText,
      generatedSurfaces,
      chamberRoutes,
      siteMap,
      app,
      smoke
    ] = await Promise.all([
      readText('data/ecosystem-apps.json'),
      readText('data/ecosystem-stats.json'),
      readText('js/features/ecosystem-chamber.js'),
      readText('css/ecosystem.css'),
      readText('scripts/refresh-ecosystem-stats.mjs'),
      readText('scripts/lib/ecosystem-stats.mjs'),
      readText('package.json'),
      readText('scripts/refresh-generated-surfaces.mjs'),
      readText('scripts/lib/chamber-routes.mjs'),
      readText('js/core/site-map.js'),
      readText('js/core/app.js'),
      readText('tests/smoke.mjs')
    ]);
    const manifest = JSON.parse(manifestText);
    const snapshot = JSON.parse(snapshotText);
    const packageJson = JSON.parse(packageText);
    const { contentHash, ...unsigned } = snapshot;

    if (manifest.schemaVersion !== 1
      || manifest.weekStartsOn !== 'monday'
      || manifest.rankingMetric !== 'active_wallets'
      || manifest.apps?.length < 10) {
      fail('Ecosystem manifest must disclose a Monday-based active-wallet universe with at least 10 apps');
    }
    if (snapshot.schemaVersion !== 1
      || !Number.isFinite(Date.parse(snapshot.generatedAt || ''))
      || stableJsonHash(unsigned) !== contentHash
      || snapshot.manifestHash !== stableJsonHash(manifest)
      || !/^[0-9a-f]{64}$/.test(snapshot.contractUniverseHash || '')) {
      fail('Ecosystem snapshot must retain valid generatedAt, manifest, contract-universe, and stable content-hash receipts');
    }
    if (Buffer.byteLength(snapshotText) > 4 * 1024 * 1024) {
      fail(`Ecosystem snapshot exceeds the 4 MiB browser payload budget: ${Buffer.byteLength(snapshotText)} bytes`);
    }
    if (snapshotText.includes('"wallets":')) {
      fail('Ecosystem browser artifact must publish aggregate counts, never raw wallet cohorts');
    }
    const catalogReceipts = snapshot.sourceReceipts?.tzkt?.catalog || [];
    if (!['asset', 'smart_contract'].every((kind) => catalogReceipts.some((receipt) => (
      receipt.kind === kind
      && receipt.aliasedContracts > 0
      && receipt.pagination === 'id.gt keyset'
      && receipt.pageSize > 0
    )))) {
      fail('Ecosystem snapshot must publish exhaustive TzKT asset and smart-contract catalog pagination receipts');
    }
    if (!Array.isArray(snapshot.weeks) || snapshot.weeks.length < 52
      || !Array.isArray(snapshot.apps) || snapshot.apps.length !== manifest.apps.length
      || !Array.isArray(snapshot.rankings?.all) || snapshot.rankings.all.length < 10) {
      fail('Ecosystem snapshot must retain at least one year, every manifested app, and an all-layer top 10');
    }
    const networkWeeks = snapshot.networkActivity?.weeks || [];
    const networkLatest = networkWeeks.at(-1);
    if (!networkWeeks.length
      || snapshot.networkActivity?.coverageStart !== networkWeeks[0]?.weekStart
      || networkLatest?.weekStart !== snapshot.completeWeek?.weekStart
      || snapshot.networkActivity?.partialWeek?.weekStart !== snapshot.partialWeek?.weekStart
      || snapshot.networkActivity?.partialWeek?.observedAt !== snapshot.partialWeek?.observedAt) {
      fail('Ecosystem network-wide activity must cover the latest completed week and aligned partial week');
    }
    for (const [label, row, status] of [
      ['completed', networkLatest, 'complete'],
      ['partial', snapshot.networkActivity?.partialWeek, 'partial']
    ]) {
      const tezos = row?.layers?.tezos;
      const etherlink = row?.layers?.etherlink;
      if (row?.status !== status
        || tezos?.status !== status
        || etherlink?.status !== status
        || !Number.isSafeInteger(tezos?.activeWallets)
        || !Number.isSafeInteger(etherlink?.activeWallets)
        || row?.all?.activeWallets !== tezos.activeWallets + etherlink.activeWallets
        || typeof row?.all?.approximate !== 'boolean') {
        fail(`Ecosystem network-wide ${label} wallet-layer total is invalid`);
      }
    }
    if (snapshot.sourceReceipts?.tzkt?.networkActivity?.pagination !== 'daily id.gt keyset'
      || snapshot.sourceReceipts?.etherlink?.networkActivity?.chart !== 'activeAccounts'
      || snapshot.sourceReceipts?.etherlink?.networkActivity?.resolution !== 'WEEK') {
      fail('Ecosystem network-wide TzKT and Etherlink source receipts are incomplete');
    }
    if (snapshot.completeWeek?.weekEnd !== snapshot.partialWeek?.weekStart
      || snapshot.partialWeek?.status !== 'partial'
      || Date.parse(snapshot.partialWeek?.observedAt) < Date.parse(snapshot.partialWeek?.weekStart)) {
      fail('Ecosystem completed-week ranking boundary and partial current-week pulse must remain distinct');
    }
    if (!['all', 'tezos', 'etherlink'].every((layer) => {
      const metric = layer === 'all' ? snapshot.partialWeek?.all : snapshot.partialWeek?.layers?.[layer];
      return metric?.status === 'partial'
        && Number.isSafeInteger(metric.activeWallets)
        && metric.activeWallets >= 0
        && Number.isSafeInteger(metric.interactions)
        && metric.interactions >= 0;
    })) {
      fail('Ecosystem current-week aggregate and layer metrics must remain explicitly partial');
    }
    const firstLayerActivity = Object.fromEntries(['tezos', 'etherlink'].map((layer) => [
      layer,
      Math.min(...manifest.apps.flatMap((app) => app.layers
        .filter((item) => item.id === layer)
        .map((item) => Date.parse(item.since))))
    ]));
    for (const [index, week] of snapshot.weeks.entries()) {
      for (const layer of ['tezos', 'etherlink']) {
        const metric = week.layers?.[layer];
        const active = Date.parse(week.weekEnd) > firstLayerActivity[layer];
        if (active && (metric?.status !== 'complete'
          || !Number.isSafeInteger(metric.activeWallets)
          || metric.activeWallets < 0
          || !Number.isSafeInteger(metric.interactions)
          || metric.interactions < 0)) {
          fail(`Ecosystem week ${index} must retain complete ${layer} coverage after its first tracked contract`);
        }
        if (!active && (metric?.status !== 'not-active'
          || metric.activeWallets !== null
          || metric.interactions !== null
          || metric.callsPerWallet !== null
          || metric.returningWalletRate !== null)) {
          fail(`Ecosystem week ${index} must label pre-${layer} coverage as not-active, never as zero`);
        }
      }
    }
    for (const layer of ['all', 'tezos', 'etherlink']) {
      const ranking = snapshot.rankings?.[layer] || [];
      if (ranking.some((row, index) => row.rank !== index + 1
        || (index > 0 && row.activeWallets > ranking[index - 1].activeWallets))) {
        fail(`Ecosystem ${layer} ranking must be dense and descending by active wallets`);
      }
    }
    for (const tracked of snapshot.apps) {
      if (!tracked.id
        || tracked.weekly?.length !== snapshot.weeks.length
        || !tracked.layers?.length
        || tracked.layers.some((layer) => layer.contractCount < 1 || layer.contracts?.length !== layer.contractCount)) {
        fail(`Ecosystem app ${tracked.id || '<unknown>'} is missing complete weekly or frozen-contract coverage`);
      }
    }

    if (packageJson.scripts?.['refresh:ecosystem'] !== 'node scripts/refresh-ecosystem-stats.mjs'
      || packageJson.scripts?.['check:ecosystem'] !== 'node scripts/refresh-ecosystem-stats.mjs --check'
      || packageJson.scripts?.['test:ecosystem'] !== 'node tests/ecosystem-stats-check.mjs') {
      fail('package scripts must expose Ecosystem refresh, offline check, and deterministic unit contracts');
    }
    for (const snippet of [
      "const ECOSYSTEM_TARGETS = ['data/ecosystem-stats.json']",
      "nodeScript('scripts/refresh-ecosystem-stats.mjs', ['--check'])",
      "nodeScript('scripts/refresh-ecosystem-stats.mjs')",
      'stageTargets(ECOSYSTEM_TARGETS)'
    ]) {
      if (!generatedSurfaces.includes(snippet)) fail(`Ecosystem generated-surface orchestration is missing: ${snippet}`);
    }
    for (const snippet of [
      "'target.in'",
      "'timestamp.ge'",
      "status: 'applied'",
      "select: 'id,nonce,sender,target,timestamp'",
      "'alias.null': 'false'",
      "'sort.asc': 'id'",
      'catalog keyset did not advance',
      "filter_by: 'to'",
      "row?.isError === '0'",
      'createBlockscoutClient',
      'fetchBlockscoutHistory',
      'public paginated REST',
      'extendBlockscoutCooldown',
      'BLOCKSCOUT_REQUEST_GAP_MS',
      'BLOCKSCOUT_MAX_QUERY_RANGE_MS',
      'prepareBlockscoutHistory',
      '/transactions/csv',
      'from_period',
      'complete CSV exports',
      "execFileAsync('curl'",
      'RECENT_WEEKS_TO_REBUILD = 3',
      'private warm-up row',
      'earliestNewContract',
      'normalizeEcosystemCoverage',
      'contractUniverseHash',
      'Raw wallet sets are aggregate-only',
      "'initiator.null': 'true'",
      "'select.values': 'id,sender'",
      'daily id.gt keyset',
      '/lines/activeAccounts',
      "resolution: 'WEEK'",
      'combineNetworkActivity'
    ]) {
      if (!generator.includes(snippet)) fail(`Ecosystem source/continuity contract is missing: ${snippet}`);
    }
    const blockscoutSliceStart = generator.indexOf('async function fetchBlockscoutSlice');
    const blockscoutPreSplit = generator.indexOf('if (toMs - fromMs > BLOCKSCOUT_MAX_QUERY_RANGE_MS)', blockscoutSliceStart);
    const blockscoutRequest = generator.indexOf('const payload = await requestBlockscoutJson', blockscoutSliceStart);
    if (blockscoutSliceStart < 0 || blockscoutPreSplit < blockscoutSliceStart || blockscoutPreSplit > blockscoutRequest) {
      fail('Ecosystem incremental Blockscout scans must subdivide oversized time ranges before making the request');
    }
    for (const snippet of ['combineNetworkActivity', 'contractUniverseHash', 'retentionRate', 'summarizeApp', 'tezosNetworkWallet', 'rankApps', 'snapshotContentHash', 'validateManifest', 'validateSnapshot']) {
      if (!library.includes(snippet)) fail(`Ecosystem deterministic library contract is missing: ${snippet}`);
    }

    const routeContracts = [
      ['route metadata', "slug: 'ecosystem'", chamberRoutes],
      ['site-map destination', "href: '/ecosystem/'", siteMap],
      ['site-map L1 intent', "href: '/ecosystem/?layer=tezos'", siteMap],
      ['site-map all-history intent', "href: '/ecosystem/?range=all'", siteMap],
      ['feature initializer', 'initEcosystemChamber', await readText('js/core/chamber-features.mjs')],
      ['pretty route opener', "case 'ecosystem':", app],
      ['hash route', "hash === 'ecosystem'", app],
      ['close cleanup', 'closeEcosystemChamber', await readText('js/core/chamber-features.mjs')],
      ['routed overlay', "'ecosystem-activity-modal': { entryIds: ['ecosystem']", app],
      ['category target', "ecosystem: { selector: '#ecosystem-entry-card', layout: 'featured' }", app]
    ];
    for (const [label, needle, source] of routeContracts) {
      if (!source.includes(needle)) fail(`Ecosystem ${label} contract is missing`);
    }
    for (const snippet of [
      "const ECOSYSTEM_SNAPSHOT_URL = '/data/ecosystem-stats.json'",
      'last completed Monday-to-Monday UTC week',
      'All active addresses',
      'Tracked-app wallets',
      'network-wide + app activity',
      "const RANGES = Object.freeze([",
      'data-ecosystem-category',
      'data-ecosystem-app',
      'data-ecosystem-leader-rank',
      'All active addresses plus the reviewed-dapp subset',
      'Download full JSON',
      'Contract-universe SHA-256',
      'syncChamberReading(body, markup, { quiet:',
      "document.visibilityState !== 'visible'",
      "document.addEventListener('visibilitychange'",
      '__ECOSYSTEM_CHAMBER_REFRESH_MS__',
      'Last good'
    ]) {
      if (!feature.includes(snippet)) fail(`Ecosystem browser truth/quiet contract is missing: ${snippet}`);
    }
    for (const selector of [
      '.ecosystem-entry-card',
      '.ecosystem-entry-grid',
      '.ecosystem-entry-tile',
      '.ecosystem-overlay',
      '.ecosystem-overlay.active .ecosystem-content',
      '.ecosystem-tabs',
      '.ecosystem-kpis',
      '.ecosystem-kpis article.is-network-primary',
      '.ecosystem-chart-grid',
      '.ecosystem-table',
      '.ecosystem-directory',
      '.ecosystem-proof-grid',
      '.ecosystem-methodology'
    ]) {
      if (!css.includes(selector)) fail(`Ecosystem CSS is missing ${selector}`);
    }
    if (!css.includes('@media (max-width: 720px)')
      || !css.includes('animation: none;')
      || !css.includes('position: relative;')) {
      fail('Ecosystem mobile shell must suppress entrance geometry and let the header scroll with the room');
    }
    if (!css.includes('.ecosystem-entry-leader:nth-child(2)')
      || !smoke.includes('Ecosystem launcher desktop grid must show three ranked apps above three equal summary tiles')
      || !smoke.includes('Ecosystem launcher mobile grid must retain only the lead app and three summary tiles')) {
      fail('Ecosystem launcher must retain its six-tile desktop ranking and compact mobile layout contract');
    }
    if (!smoke.includes("name: 'ecosystem-activity'")
      || !smoke.includes('window.__ECOSYSTEM_CHAMBER_REFRESH_MS__')
      || !smoke.includes('window.__ecosystemSmokeTimerTick')
      || !smoke.includes("window.__ecosystemSmokeVisibility = 'hidden'")) {
      fail('smoke catalog must include the focused Ecosystem Activity quiet-refresh suite');
    }

    if (!(await pathExists('ecosystem/index.html')) || !(await pathExists('og/ecosystem.png'))) {
      fail('Ecosystem generated pretty route and OG image must exist');
    } else {
      const route = await readText('ecosystem/index.html');
      if (!route.includes('<link rel="canonical" href="https://tezos.systems/ecosystem/">')
        || !route.includes('/og/ecosystem.png')
        || !route.includes('data-chamber-route="ecosystem"')) {
        fail('Ecosystem generated route must retain its route identity, canonical URL, and dedicated OG image');
      }
    }

    pass(`Ecosystem Activity all-address monitor, ${snapshot.weeks.length}-week reviewed-app history, rankings, source receipts, route, and quiet-refresh contracts checked`);
  }

  async function checkChamberCategoryContracts() {
    const [siteMapSource, app, styles, shellStyles, index, preload, manager, tour, readme, changelog, smoke, routeGenerator] = await Promise.all([
      readText('js/core/site-map.js'),
      readText('js/core/app.js'),
      readText('css/styles.css'),
      readText('css/shell-extras.css'),
      readText('index.html'),
      readText('js/core/home-layout-preload.js'),
      readText('js/ui/chamber-categories.js'),
      readText('js/features/tooltip-tour.js'),
      readText('README.md'),
      readText('js/features/changelog.js'),
      readText('tests/smoke.mjs'),
      readText('scripts/generate-chamber-routes.mjs')
    ]);
    const expectedCategories = [
      {
        key: 'ecosystem',
        label: 'Ecosystem',
        question: 'How many addresses are active, and which apps are they using?',
        entryIds: ['ecosystem']
      },
      {
        key: 'network',
        label: 'Network',
        question: 'What is the chain doing now?',
        entryIds: ['pulse', 'health', 'tezosx']
      },
      {
        key: 'capital',
        label: 'Capital',
        question: 'Where is value sitting and moving?',
        entryIds: ['capital', 'minerals', 'uranium', 'metals', 'whales', 'staking-chamber']
      },
      {
        key: 'bakers',
        label: 'Bakers',
        question: 'Who is securing Tezos and upgrading its keys?',
        entryIds: ['leaderboard', 'tz4']
      },
      {
        key: 'governance',
        label: 'Governance',
        question: 'What is Tezos deciding?',
        entryIds: ['chamber', 'l2-governance', 'liquidity-baking']
      },
      {
        key: 'people',
        label: 'People & Accounts',
        question: 'Who is here, and what have they done?',
        entryIds: ['ledger-flow', 'domains', 'maxis', 'tezoscrp', 'funding']
      },
      {
        key: 'history',
        label: 'History',
        question: 'What happened before now?',
        entryIds: ['anthology', 'history']
      }
    ];
    const expectedEntries = expectedCategories.flatMap(({ key, entryIds }) => (
      entryIds.map((id) => ({ id, category: key }))
    ));
    const expectedLayouts = {
      pulse: 'featured',
      health: 'standard',
      tezosx: 'standard',
      capital: 'featured',
      minerals: 'featured',
      uranium: 'featured',
      metals: 'featured',
      ecosystem: 'featured',
      whales: 'wide',
      'staking-chamber': 'compact',
      leaderboard: 'wide',
      tz4: 'compact',
      chamber: 'standard',
      'l2-governance': 'standard',
      'liquidity-baking': 'featured',
      'ledger-flow': 'featured',
      domains: 'featured',
      maxis: 'featured',
      tezoscrp: 'featured',
      funding: 'featured',
      anthology: 'standard',
      history: 'standard'
    };

    const destinationBlocks = siteMapSource.split(/\n    \{\n        id:\s*/).slice(1);
    const categorizedEntries = destinationBlocks
      .map((block) => ({
        id: block.match(/^'([^']+)'/)?.[1] || '',
        category: block.match(/\n        chamberCategory:\s*'([^']+)'/)?.[1] || ''
      }))
      .filter(({ category }) => category);
    assert.deepEqual(
      categorizedEntries.toSorted((left, right) => left.id.localeCompare(right.id)),
      expectedEntries.toSorted((left, right) => left.id.localeCompare(right.id)),
      'site-map Chamber facets must define exactly one category for each of the 22 entry points'
    );
    assert.equal(new Set(categorizedEntries.map(({ id }) => id)).size, 22);

    const metadataSource = siteMapSource
      .split('export const CHAMBER_CATEGORY_META = Object.freeze([')[1]
      ?.split('export const SITE_MAP_NAV_GROUPS')[0] || '';
    assert.deepEqual(
      [...metadataSource.matchAll(/\n        key:\s*'([^']+)'/g)].map((match) => match[1]),
      expectedCategories.map(({ key }) => key),
      'Chamber metadata order must remain the canonical dashboard order'
    );
    for (const category of expectedCategories) {
      for (const contract of [
        `key: '${category.key}'`,
        `label: '${category.label}'`,
        `question: '${category.question}'`,
        `entryIds: Object.freeze([${category.entryIds.map((id) => `'${id}'`).join(', ')}])`
      ]) {
        assert(metadataSource.includes(contract), `missing Chamber category metadata contract: ${contract}`);
      }
    }

    const targetSource = app
      .split('const CHAMBER_CARD_TARGETS = Object.freeze({')[1]
      ?.split('});')[0] || '';
    const targetIds = [...targetSource.matchAll(/^\s{4}(?:'([^']+)'|([a-z][\w-]*)):\s*/gm)]
      .map((match) => match[1] || match[2]);
    assert.deepEqual(
      targetIds,
      expectedEntries.map(({ id }) => id),
      'every categorized site-map ID must have one ordered Chamber card target'
    );
    for (const [entryId, layout] of Object.entries(expectedLayouts)) {
      const key = entryId.includes('-') ? `'${entryId}'` : entryId;
      assert(
        new RegExp(`${key}: \\{ selector: [^\\n]+, layout: '${layout}' \\}`).test(targetSource),
        `Chamber launcher ${entryId} must use the ${layout} layout`
      );
    }
    for (const obsolete of ['CHAMBER_CARD_PAIRS', 'data-chamber-pair', 'dataset.chamberPair']) {
      assert(!app.includes(obsolete), `legacy Chamber pair configuration remains: ${obsolete}`);
    }
    assert(siteMapSource.includes("href: '/chambers/'"), 'Explore Tezos must expose the canonical /chambers/ route');
    assert(
      !app.includes("{ selector: '#chambers-section .section-header', hash: '#chambers', label: 'Explore Tezos' }"),
      'Explore Tezos header must omit the redundant direct-link control'
    );
    assert(
      CHAMBER_ROUTES.some((route) => route.slug === 'chambers' && route.hash === '#chambers'),
      'generated Chamber routes must include the Explore Tezos dashboard directory'
    );

    for (const contract of [
      "document.createElement('section')",
      "document.createElement('button')",
      "category.className = 'chamber-card-pair chamber-category'",
      "const DEFAULT_CHAMBER_CATEGORY_KEY = 'ecosystem'",
      'primeChamberCategoryFromRoute',
      'const expanded = chamberCategoryShouldStartExpanded(categoryConfig.key)',
      'setChamberCategoryExpanded(category, chamberCategoryShouldStartExpanded(categoryConfig.key))',
      'setChamberCategoryExpanded(category, true)',
      "setChamberCategoryVisible(categoryKey, true, 'deep-link')",
      "setChamberRoomVisible(entry.id, true, 'deep-link')",
      'card.dataset.chamberEntryId = entryId',
      'card.dataset.chamberLayout = target.layout',
      'quietlyMutate(grid, () => {',
      'grid.querySelector(',
      'grid.insertBefore(category, expectedNode)'
    ]) {
      assert(app.includes(contract), `reusable Chamber category DOM contract is missing: ${contract}`);
    }
    for (const selector of [
      '.chamber-category-head',
      '.chamber-category-name',
      '.chamber-category-question',
      '.chamber-category-count',
      '.chamber-category[data-chamber-expanded="false"] > .chamber-category-cards',
      '#chambers-grid > .stat-card',
      '.chamber-entry-card[data-chamber-layout="featured"]',
      '.chamber-entry-card[data-chamber-layout="wide"]',
      '.chamber-entry-card[data-chamber-layout="compact"]'
    ]) {
      assert(styles.includes(selector), `Chamber category CSS is missing ${selector}`);
    }
    for (const selector of ['.chamber-category-toggle', '.chamber-category[data-chamber-expanded="false"] > .chamber-category-head .chamber-category-count', '.chamber-category-hide', '.chamber-room-hide', '.home-layout-topic-group']) {
      assert(shellStyles.includes(selector), `Chamber category shell CSS is missing ${selector}`);
    }

    const categoryIds = expectedCategories.map(({ key }) => key);
    const staticCategoryState = [...index.matchAll(/<section class="chamber-card-pair chamber-category" data-chamber-category="([^"]+)" data-chamber-shell="1" data-chamber-expanded="(true|false)">/g)]
      .map((match) => ({ key: match[1], expanded: match[2] === 'true' }));
    assert.deepEqual(
      staticCategoryState.map(({ key }) => key),
      categoryIds,
      'root Chamber shell order must put Ecosystem first before JavaScript runs'
    );
    assert.deepEqual(
      staticCategoryState.filter(({ expanded }) => expanded).map(({ key }) => key),
      ['ecosystem'],
      'root Chamber shell must expose only Ecosystem before JavaScript runs'
    );
    for (const source of [preload, manager]) {
      assert(source.includes('tezos-systems-explore-layout-v1'), 'Explore layout preload and manager must share one storage key');
      assert(source.includes('version: 1') && source.includes('hiddenCategories') && source.includes('hiddenRooms'), 'Explore layout preference must retain the version 1 category and room schema');
    }
    for (const id of categoryIds) {
      const startsExpanded = id === 'ecosystem';
      assert(index.includes(`data-chamber-category-hide="${id}"`), `missing inline Hide control for Chamber category ${id}`);
      assert(index.includes(`data-chamber-category-toggle="${id}"`), `missing Customize home switch for Chamber category ${id}`);
      assert(index.includes(`data-chamber-category="${id}" data-chamber-shell="1" data-chamber-expanded="${startsExpanded}"`), `Chamber category ${id} shell has the wrong first-paint disclosure state`);
      assert(index.includes(`aria-expanded="${startsExpanded}" aria-controls="chamber-category-${id}-cards"`), `Chamber category ${id} disclosure has the wrong accessible first-paint state`);
      assert(index.includes(`id="chamber-category-${id}-cards"${startsExpanded ? '>' : ' hidden>'}`), `Chamber category ${id} cards have the wrong first-paint visibility`);
      assert(shellStyles.includes(`[data-chamber-categories-hidden~="${id}"]`), `missing first-paint CSS token for Chamber category ${id}`);
    }
    for (const contract of [
      'CHAMBER_CATEGORY_BY_ROUTE_HASH',
      "'#domains': 'people'",
      "'#history': 'history'",
      "CHAMBER_CATEGORY_BY_ROUTE_HASH[route.hash] || 'ecosystem'",
      'setInitialChamberCategory('
    ]) {
      assert(routeGenerator.includes(contract), `generated Chamber route disclosure contract is missing: ${contract}`);
    }
    for (const [slug, expandedKey] of [
      ['chambers', 'ecosystem'],
      ['ecosystem', 'ecosystem'],
      ['domains', 'people'],
      ['history', 'history'],
      ['ctez', 'ecosystem']
    ]) {
      const routeShell = await readText(`${slug}/index.html`);
      if (slug !== 'chambers' && standaloneFeatureForRoute(slug)) {
        assert.ok(!routeShell.includes('data-chamber-category='), `${slug} standalone shell defers dashboard categories`);
        continue;
      }
      const routeCategoryState = [...routeShell.matchAll(/<section class="chamber-card-pair chamber-category" data-chamber-category="([^"]+)" data-chamber-shell="1" data-chamber-expanded="(true|false)">/g)]
        .map((match) => ({ key: match[1], expanded: match[2] === 'true' }));
      assert.deepEqual(routeCategoryState.map(({ key }) => key), categoryIds, `${slug} route shell must preserve Ecosystem-first category order`);
      assert.deepEqual(
        routeCategoryState.filter(({ expanded }) => expanded).map(({ key }) => key),
        [expandedKey],
        `${slug} route shell must expose only ${expandedKey} before JavaScript runs`
      );
    }
    for (const { id } of expectedEntries) {
      assert(index.includes(`data-chamber-room-toggle="${id}"`), `missing Customize home switch for Chamber room ${id}`);
      assert(shellStyles.includes(`[data-chamber-rooms-hidden~="${id}"]`), `missing first-paint CSS token for Chamber room ${id}`);
    }
    assert(app.includes('createChamberRoomHideButton(entryId)')
      && app.includes('button.dataset.chamberRoomHide = entryId'), 'every rendered Chamber footer must receive an accessible inline Hide control');
    for (const contract of [
      'data-chamber-categories-hidden',
      'data-chamber-rooms-hidden',
      'data-chamber-categories-preview',
      'setHomeBlockVisible',
      "window.addEventListener('storage', syncFromStorage)",
      "window.dispatchEvent(new CustomEvent('tezos:explore-layout-change'",
      'showAllChamberCategories',
      'showUndoToast'
    ]) {
      assert(preload.includes(contract) || manager.includes(contract) || shellStyles.includes(contract), `missing Chamber category visibility contract: ${contract}`);
    }
    assert(index.includes('id="chamber-category-show-all"')
      && index.includes('data-chamber-category-count')
      && index.includes('data-chamber-room-count')
      && index.includes('Show all Chambers'), 'Customize home must provide topic and room counts plus Show all recovery');
    assert(tour.includes("tezosSystemsChamberCategories?.beginPreview?.('guided-tour')")
      && tour.includes("tezosSystemsChamberCategories?.endPreview?.('guided-tour')"), 'guided tour must temporarily reveal saved-hidden Chamber categories');
    assert(readme.includes('tezos-systems-explore-layout-v1')
      && readme.includes('tezos-systems-chamber-categories-v1')
      && changelog.includes('each of its 21 Chamber launchers'), 'README and user-facing changelog must document Explore layout visibility and migration');
    assert(smoke.includes('tezos-systems-explore-layout-v1') && smoke.includes('Show all Chambers'), 'browser suite must cover Explore layout persistence and recovery');

    const perimeterAnimationSelectors = [...styles.matchAll(/([^{}]+)\{[^{}]*animation:\s*entryCardPulse\b[^{}]*\}/g)]
      .map((match) => match[1].trim());
    assert.deepEqual(
      perimeterAnimationSelectors,
      ['.chamber-entry-card.chamber-entry-risk::before'],
      'infinite Chamber perimeter animation must be reserved for explicit risk/watch state'
    );

    pass('seven persistent Chamber categories, 22 individually hideable entry facets, progressive recovery, and risk-only attention checked');
  }

  async function checkPromotedChamberContracts() {
    const [
      artifactText,
      whale,
      whaleCss,
      whaleGenerator,
      legacyWhales,
      giants,
      leaderboard,
      leaderboardCss,
      history,
      historyCss,
      app,
      siteMap,
      chamberRoutes,
      generatedSurfaces,
      packageText,
      smoke,
      wallet,
      myTezos
    ] = await Promise.all([
      readText('data/whale-watch.json'),
      readText('js/features/whale-chamber.js'),
      readText('css/whale-chamber.css'),
      readText('scripts/refresh-whale-watch-data.mjs'),
      readText('js/features/whales.js'),
      readText('js/features/sleeping-giants.js'),
      readText('js/features/leaderboard.js'),
      readText('css/leaderboard.css'),
      readText('js/features/history.js'),
      readText('css/history-chamber.css'),
      readText('js/core/app.js'),
      readText('js/core/site-map.js'),
      readText('scripts/lib/chamber-routes.mjs'),
      readText('scripts/refresh-generated-surfaces.mjs'),
      readText('package.json'),
      readText('tests/smoke.mjs'),
      readText('js/core/wallet.js'),
      readText('js/features/my-tezos.js')
    ]);
    const artifact = JSON.parse(artifactText);
    const packageJson = JSON.parse(packageText);

    if (artifact.kind !== 'tezos-whale-watch' || artifact.version !== 1 || !Number.isFinite(Date.parse(artifact.generatedAt))) {
      fail('Whale Watch must publish a timestamped tezos-whale-watch v1 artifact');
    }
    if (artifact.coverage?.largeAccounts?.complete !== true || artifact.coverage?.transfers24h?.complete !== true) {
      fail('Whale Watch large-account and 24-hour transfer ledgers must both declare complete pagination');
    }
    if (artifact.coverage?.largeAccounts?.eligibleCount < (artifact.dormant?.records?.length || 0)
      || artifact.coverage?.transfers24h?.eligibleCount !== artifact.transfers24h?.operationCount) {
      fail('Whale Watch coverage counts must reconcile with its displayed cohorts and complete transfer count');
    }
    const expectedThresholds = [1000, 10000, 100000, 1000000];
    const thresholdRows = artifact.transfers24h?.thresholds || [];
    if (JSON.stringify(thresholdRows.map((row) => row.thresholdXtz)) !== JSON.stringify(expectedThresholds)
      || thresholdRows.some((row, index) => index > 0 && (
        row.operationCount > thresholdRows[index - 1].operationCount
        || row.operationGroupCount > thresholdRows[index - 1].operationGroupCount
        || row.grossObservedMutez > thresholdRows[index - 1].grossObservedMutez
      ))) {
      fail('Whale Watch threshold ladder must cover 1K through 1M XTZ and remain monotonically narrowing');
    }
    if (!/not economic volume/i.test(artifact.transfers24h?.semantics || '')
      || JSON.stringify(artifact).includes('economicVolume')) {
      fail('Whale Watch must describe summed legs as gross observed transfers, never economic volume');
    }
    for (const record of artifact.dormant?.records || []) {
      if (!record.address
        || !Number.isFinite(Date.parse(record.lastActivityTime))
        || !Number.isFinite(Number(record.lastActivityLevel))
        || Number(record.dormantDays) < Number(artifact.methodology?.minimumDormantDays || 365)) {
        fail(`Whale Watch dormant receipt is incomplete or below threshold: ${record.address || 'unknown'}`);
      }
    }
    const flowOperationIds = new Set();
    for (const story of artifact.transfers24h?.topFlowStories || []) {
      const operations = story.operations || [];
      const gross = operations.reduce((sum, operation) => sum + Number(operation.amountMutez || 0), 0);
      if (!story.hash || story.operationCount !== operations.length || gross !== story.grossObservedMutez
        || operations.some((operation) => operation.hash !== story.hash || operation.id == null)) {
        fail(`Whale Watch flow story does not reconcile operation ids, shared hash, and gross legs: ${story.hash || 'unknown'}`);
      }
      for (const operation of operations) {
        const key = String(operation.id);
        if (flowOperationIds.has(key)) fail(`Whale Watch flow operation id is duplicated across published stories: ${key}`);
        flowOperationIds.add(key);
      }
    }
    for (const event of artifact.awakenings || []) {
      const previousActivity = Date.parse(event.previousActivityTime || '');
      const awakenedAt = Date.parse(event.awakenedAt || '');
      const receiptDormantDays = Math.floor((awakenedAt - previousActivity) / (24 * 60 * 60 * 1000));
      if (!event.receipt?.hash
        || !Number.isFinite(Date.parse(event.receipt.timestamp))
        || event.awakenedAt !== event.receipt.timestamp
        || !Number.isFinite(previousActivity)
        || previousActivity >= awakenedAt
        || Number(event.dormantDays) !== receiptDormantDays
        || (event.movedAmountMutez ?? null) !== (event.receipt.amountMutez ?? null)) {
        fail(`Whale Watch awakening must use matching prior/current receipt timestamps, derived dormancy, and moved amount: ${event.id || 'unknown'}`);
      }
    }
    if (!Array.isArray(artifact.sources) || artifact.sources.length < 2
      || artifact.sources.some((source) => !/^https:\/\/api\.tzkt\.io\/v1\//.test(source.url || ''))) {
      fail('Whale Watch artifact must retain explicit TzKT source receipts for both complete ledgers');
    }

    const whaleGeneratorContracts = [
      "const THRESHOLDS_XTZ = [1_000, 10_000, 100_000, 1_000_000]",
      "select: 'address,alias,type,balance,lastActivity,lastActivityTime'",
      "'sort.asc': 'id'",
      'offset += pageSize',
      'TzKT pagination exceeded',
      'if (id > 0) return `op:${id}`',
      'groups.get(hash)',
      'movedAmountMutez: receipt.amountMutez ?? null',
      'previousActivityTime: iso(prior.lastActivityTime)',
      'Number(event.dormantDays) !== dormantDays',
      "JSON.stringify(snapshot).includes('economicVolume')"
    ];
    for (const snippet of whaleGeneratorContracts) {
      if (!whaleGenerator.includes(snippet)) fail(`Whale Watch generator contract missing: ${snippet}`);
    }
    if (packageJson.scripts?.['refresh:whales'] !== 'node scripts/refresh-whale-watch-data.mjs'
      || packageJson.scripts?.['check:whales'] !== 'node scripts/refresh-whale-watch-data.mjs --check') {
      fail('package scripts must expose Whale Watch refresh and offline validation');
    }
    if (!generatedSurfaces.includes("const WHALE_WATCH_TARGETS = ['data/whale-watch.json']")
      || !generatedSurfaces.includes("nodeScript('scripts/refresh-whale-watch-data.mjs', ['--check'])")
      || !generatedSurfaces.includes("nodeScript('scripts/refresh-whale-watch-data.mjs')")
      || !generatedSurfaces.includes('stageTargets(WHALE_WATCH_TARGETS)')) {
      fail('generated surfaces must check, refresh, and optionally stage the Whale Watch artifact');
    }

    const integrationContracts = [
      ['Whale route metadata', "slug: 'whales'", chamberRoutes],
      ['Baker route metadata', "slug: 'leaderboard'", chamberRoutes],
      ['Cycle History route metadata', "slug: 'history'", chamberRoutes],
      ['Whale site-map route', "href: '/whales/'", siteMap],
      ['Baker site-map route', "href: '/leaderboard/'", siteMap],
      ['Cycle History site-map route', "href: '/history/'", siteMap],
      ['legacy giants canonical hash alias', "hashAliases: ['#giants']", siteMap],
      ['legacy giants direct dormant view', "href: '/whales/?view=dormant'", siteMap],
      ['Whale Watch Capital category facet', "id: 'whales'", siteMap],
      ['Baker Directory Bakers category facet', "id: 'leaderboard'", siteMap],
      ['Ledger Flow People category facet', "id: 'ledger-flow'", siteMap],
      ['Anthology and Cycle History category membership', "entryIds: Object.freeze(['anthology', 'history'])", siteMap],
      ['Whale routed overlay ownership', "'whale-watch-modal': { entryIds: ['whales'], hashes: ['whales', 'giants']", app],
      ['Baker routed overlay ownership', "'baker-directory-modal': { entryIds: ['leaderboard']", app],
      ['Cycle History routed overlay ownership', "'history-modal': { entryIds: ['history']", app],
      ['legacy giants Chamber handoff', "openChamberFeature('whales', 'dormant')", app],
      ['Baker router-owned close preserves canonical route', "leaderboard: {\n        modulePath: '../features/leaderboard.js'", await readText('js/core/chamber-features.mjs')],
      ['Whale router-owned close preserves canonical route', 'closeArgs: [{ preserveRoute: true }]', await readText('js/core/chamber-features.mjs')]
    ];
    for (const [label, snippet, source] of integrationContracts) {
      if (!source.includes(snippet)) fail(`${label} contract is missing`);
    }

    for (const view of ['overview', 'live', 'flows', 'dormant', 'awakenings']) {
      if (!whale.includes(`{ id: '${view}'`)) fail(`Whale Watch must expose the ${view} view`);
    }
    for (const snippet of [
      "ARTIFACT_URL = '/data/whale-watch.json'",
      'export function getWhaleWatchArtifact',
      "const FILTER_TYPES = new Set(['all', 'transaction', 'stake', 'unstake', 'delegation'])",
      'quietlySyncHtml(body, markup)',
      'document.visibilityState !== \'visible\'',
      "document.addEventListener('visibilitychange'",
      '__WHALE_WATCH_REFRESH_MS__',
      'captureLiveTapeAnchor',
      'restoreLiveTapeAnchor',
      'Last-good retained',
      'operation ids remain distinct receipts',
      'namedEndpointSample',
      'current TzKT alias receipts',
      'does not infer exchange ownership or beneficial control',
      'Observed holdings',
      'Holding before',
      'Archive generated ${ageLabel(lastArtifact.generatedAt)}',
      'Archive freshness unavailable'
    ]) {
      if (!whale.includes(snippet)) fail(`Whale Watch quiet/truth contract missing: ${snippet}`);
    }
    if (/type\s*:\s*['"]exchange['"]|FILTER_TYPES[^\n]*exchange/i.test(whale)) {
      fail('Whale Watch route and filter state must not accept an inferred exchange type');
    }
    if (/\b(?:Binance|Coinbase|Kraken|Gate\.io)\b/i.test(legacyWhales)) {
      fail('Whale Watch must not ship hardcoded exchange ownership labels');
    }
    if (!legacyWhales.includes('byId.set(whaleOperationId(operation), operation)')
      || !legacyWhales.includes('groupWhaleOperations')
      || !legacyWhales.includes("if (document.visibilityState !== 'visible')")
      || !legacyWhales.includes("mode: 'all-or-nothing'")
      || !legacyWhales.includes("lanes: ['transactions', 'delegations', 'stake', 'unstake']")
      || !legacyWhales.includes('const [transfers, delegations, staking] = await Promise.all([')
      || (legacyWhales.match(/params\.set\('timestamp\.ge', since\)/g) || []).length !== 3
      || legacyWhales.includes("params.set('timestamp.gt', since)")
      || !giants.includes('lastActivityTime')) {
      fail('legacy Whale and Sleeping Giants data helpers must preserve operation-id identity, hash grouping, four-lane atomic refresh, overlapping cursors, visibility gating, and timestamp dormancy');
    }
    for (const selector of ['.whale-watch-entry-card', '.whale-watch-overlay', '.whale-watch-tabs', '.whale-watch-tape-row', '.whale-watch-story', '.whale-watch-dormant-row', '.whale-watch-awakening']) {
      if (!whaleCss.includes(selector)) fail(`Whale Watch CSS is missing ${selector}`);
    }

    for (const view of ['discover', 'directory', 'signals']) {
      if (!leaderboard.includes(`{ id: '${view}'`)) fail(`Baker Directory must expose the ${view} view`);
    }
    for (const snippet of [
      'while (true)',
      'offset += limit',
      'positive current baking power',
      'Complete funded set',
      'not a hidden quality score',
      'function bakerMatchesFit',
      'function compareBakerFit',
      'function factualBakerFits',
      'No blended score or inferred quality grade is calculated',
      'not uptime, payout, or performance grades',
      'quietlySyncHtml(body, html)',
      "document.visibilityState !== 'visible'",
      "document.addEventListener('visibilitychange'",
      '__BAKER_DIRECTORY_REFRESH_MS__',
      'last-good baker set remains in place',
      'last-good governance receipts',
      "if (searchInput) searchInput.value = ''",
      'leaveBakerDirectoryRoute',
      "findChamberLauncher('#baker-directory-entry-card')",
      'bakerDirectoryFocusedBeforeOpen',
      'bakerDirectoryEntryFreshnessLabel',
      'TzKT freshness unavailable'
    ]) {
      if (!leaderboard.includes(snippet)) fail(`Baker Directory complete-set/quiet/truth contract missing: ${snippet}`);
    }
    for (const snippet of [
      'data-baker-action="delegate"',
      'data-baker-action="stake"',
      'Baker switching is intentionally not offered here.',
      'Leave at least 1 XTZ liquid for fees',
      'requestConnectedWalletDelegation(baker.address)',
      'requestConnectedWalletStake(amountMutez.toString())'
    ]) {
      if (!leaderboard.includes(snippet)) fail(`Baker Directory wallet-action contract missing: ${snippet}`);
    }
    for (const snippet of [
      "kind: delegationKind",
      "destination: account.address",
      "entrypoint: 'stake'",
      "value: { prim: 'Unit' }"
    ]) {
      if (!wallet.includes(snippet)) fail(`Octez.Connect baker-action operation contract missing: ${snippet}`);
    }
    for (const snippet of [
      'Delegate to an active baker you trust',
      'Delegate to the builder of this site',
      'Compare all active bakers',
      'reported delegation room',
      'data-my-tezos-bb-delegate',
      '/leaderboard/?view=directory'
    ]) {
      if (!myTezos.includes(snippet)) fail(`My Tezos undelegated guidance contract missing: ${snippet}`);
    }
    if (/computeBakerScores|scoreBakerFit|overallScore|reliabilityScore|fitScore|compositeFitScore/.test(leaderboard)) {
      fail('Baker Directory must not restore a synthetic baker fit, performance, or reliability score');
    }
    if (!leaderboard.includes('delegationUsage,') || leaderboard.includes('Math.min(delegationUsage')) {
      fail('Baker Directory must expose raw delegation usage above 100%, never clamp it for presentation');
    }
    if (!leaderboard.includes('careerByAddress: governanceSignals.careerByAddress')
      || !leaderboard.includes('acceptedByAddress: governanceSignals.acceptedByAddress')
      || !leaderboard.includes('const next = {\n        ...governanceSignals,')) {
      fail('Baker Directory governance refresh must begin from the last validated career/proposal maps');
    }
    for (const selector of ['.baker-directory-entry-front', '.baker-directory-overlay', '.baker-directory-tabs', '.baker-directory-search', '.baker-directory-table', '.baker-directory-signal-grid']) {
      if (!leaderboardCss.includes(selector)) fail(`Baker Directory CSS is missing ${selector}`);
    }
    if (!leaderboardCss.includes(':is(#whale-watch-entry-card, #baker-directory-entry-card)[data-chamber-layout="wide"]')
      || !leaderboardCss.includes('min-height: 320px')) {
      fail('Whale Watch and Baker Directory must retain one shared desktop launcher height floor');
    }

    for (const snippet of [
      "const CYCLE_HISTORY_CSS_URL = versionedAsset('/css/history-chamber.min.css')",
      "const CYCLE_HISTORY_RANGES = new Set(['24h', '7d', '30d', 'all'])",
      'CYCLE_HISTORY_METRICS',
      'data-history-metric',
      'syncCycleHistoryRouteState',
      'cycleHistoryRenderedRange',
      'restoreCycleHistoryRangeAfterFailure',
      'Showing last-good',
      'focusCycleHistoryMetric',
      'openCycleHistoryChamber',
      'closeCycleHistoryChamber',
      'uncaptured intervals are never invented',
      'scheduleCycleHistoryEntryFreshness',
      "document.visibilityState !== 'visible'",
      'cycleHistoryPendingFreshnessRows',
      'History · oldest source'
    ]) {
      if (!history.includes(snippet)) fail(`Cycle History route/focus contract missing: ${snippet}`);
    }
    for (const id of ['whale-watch-entry-card', 'baker-directory-entry-card', 'cycle-history-entry-card']) {
      if (!smoke.includes(`'${id}'`)) fail(`promoted Chamber semantic freshness smoke is missing ${id}`);
    }
    for (const selector of ['.cycle-history-entry-card', '.cycle-history-chamber', '.cycle-history-route-controls', '.chart-section.is-route-focus']) {
      if (!historyCss.includes(selector)) fail(`Cycle History CSS is missing ${selector}`);
    }

    for (const route of [
      ['history', 'Cycle History', 'og/history.png'],
      ['leaderboard', 'Baker Directory', 'og/leaderboard.png'],
      ['whales', 'Whale Watch', 'og/whales.png']
    ]) {
      const [slug, title, og] = route;
      const html = await readText(`${slug}/index.html`);
      if (!html.includes(`data-chamber-route="${slug}"`)
        || !html.includes(`<link rel="canonical" href="https://tezos.systems/${slug}/">`)
        || !html.includes(`/${og}`)
        || !html.includes(title)) {
        fail(`${title} generated route must retain its route identity, canonical URL, title, and dedicated OG image`);
      }
    }

    for (const suite of ["name: 'baker-directory'", "name: 'baker-wallet-actions'", "name: 'whale-watch-chamber'", "name: 'cycle-history-chamber'"]) {
      if (!smoke.includes(suite)) fail(`smoke catalog must include focused promoted-Chamber suite ${suite}`);
    }
    for (const snippet of [
      'window.__BAKER_DIRECTORY_REFRESH_MS__ = 1000',
      'window.__WHALE_WATCH_REFRESH_MS__ = 1000',
      'sampleWhaleWatchArtifact',
      'sameHashDistinctOperationIds',
      'lastActivityTime',
      'movedAmountMutez',
      "#giants",
      'assertPromotedLauncherGeometry',
      'frontScrollHeight <= card.frontClientHeight + 1',
      'Whale Watch and Baker Directory desktop pair heights differ',
      'raw delegation use above 100% must remain visible instead of being clamped',
      'compact signal refresh failures must retain validated badge maps and label them last-good',
      'sameFooter',
      'timestamp.ge',
      '__cycleHistoryKeyboardLauncher',
      'smoke forced Cycle History range refresh failure',
      'failed range refresh drifted the last-good range'
    ]) {
      if (!smoke.includes(snippet)) fail(`promoted-Chamber browser regression contract missing: ${snippet}`);
    }

    // A millisecond boundary between fixture clock reads must not invalidate
    // the exact 24-hour receipt and leave Ledger Flow without its seed account.
    let fixtureClock = Date.UTC(2026, 8, 9);
    class AdvancingFixtureDate extends Date {
      constructor(...args) { super(...(args.length ? args : [fixtureClock++])); }
      static now() { return fixtureClock++; }
    }
    const whaleFixtureSource = smoke.slice(
      smoke.indexOf('function sampleWhaleWatchArtifact('),
      smoke.indexOf('const overdelegatedBaker =')
    );
    const whaleFixture = vm.runInNewContext(`${whaleFixtureSource}; sampleWhaleWatchArtifact();`, {
      Date: AdvancingFixtureDate,
      SAMPLE_ADDRESS: 'tz1SmokeSender',
      SAMPLE_ADDRESS_2: 'tz1SmokeRecipient',
      SAMPLE_ADDRESS_3: 'tz1SmokeThird'
    });
    const validateWhaleFixture = vm.runInNewContext(`${whale.slice(
      whale.indexOf('function validateArtifact('),
      whale.indexOf('async function fetchWhaleArtifact(')
    )}; validateArtifact;`);
    assert.doesNotThrow(() => validateWhaleFixture(whaleFixture),
      'Whale Watch fixtures must retain an exact 24-hour window when the clock advances between reads');

    pass(`Whale Watch, Baker Directory, and Cycle History full-Chamber contracts checked (${artifact.transfers24h.operationCount} complete-window transfers)`);
  }

  return { checkMetalsIntegrationContracts, checkCapitalContracts, checkEcosystemActivityContracts, checkChamberCategoryContracts, checkPromotedChamberContracts };
}
