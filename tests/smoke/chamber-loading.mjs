// Browser workflows owned by chamber-loading. Shared dependencies remain explicit.
export function createChamberLoadingSmokeSuites({
  ARTIFACTS_DIR,
  DEFERRED_CHAMBER_HEAVY_DATA_PATHS,
  DEFERRED_CHAMBER_MODULE_PATHS,
  DEFERRED_CHAMBER_PROJECTION_PATHS,
  DEFERRED_CHAMBER_STYLE_PATHS,
  EXPECTED_CHAMBER_CATEGORIES,
  EXPECTED_CHAMBER_ORDER,
  assert,
  assertChamberOrder,
  attachIssueCollectors,
  fulfillJson,
  hasExpectedDefaultChamberDisclosure,
  installFeatureMocks,
  log,
  path,
  sleep,
  stableTestHash,
  waitForIntentionalRealTime
}) {
  async function smokeStandaloneChamberBoot(browser, baseUrl) {
    for (const { width, height, theme } of [{ width: 1440, height: 900, theme: 'matrix' }, { width: 390, height: 844, theme: 'clean' }]) {
      const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block', reducedMotion: 'reduce' });
      await installFeatureMocks(context);
      await context.addInitScript(theme => {
        localStorage.setItem('tezos-systems-theme', theme);
        localStorage.setItem('tezos-toured', '1');
        localStorage.setItem('tezos-welcomed', '1');
        window.__standaloneDocument = true;
      }, theme);
      const page = await context.newPage();
      // Exercise the mobile handoff on a constrained CPU too, not just a narrow
      // desktop viewport. This is an emulated regression profile, not phone timing.
      if (width === 390) {
        const cdp = await context.newCDPSession(page);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
      }
      const requests = [];
      const issues = [];
      page.on('request', request => requests.push(request.url()));
      attachIssueCollectors(page, `standalone ${width}`, issues);
      await page.goto(`${baseUrl}/tezoscrp/?view=archive&period=2026-06&q=Baking+Benjamins`, { waitUntil: 'domcontentloaded' });
      await page.locator('#tezoscrp-archive-results .tezoscrp-archive-list article').waitFor();
      if (width === 1440) await waitForIntentionalRealTime(page, 'standalone-chamber-no-idle-dashboard');
      const cold = await page.evaluate(() => ({
        ready: document.documentElement.dataset.dashboardReady,
        dashboardNodes: !!document.querySelector('#hero-slot, #chambers-grid, #my-tezos-drawer, #history-modal'),
        scripts: performance.getEntriesByType('resource').filter(r => /\.(?:js|mjs)$/.test(new URL(r.name).pathname)).length,
        readingModules: performance.getEntriesByType('resource').filter(r => new URL(r.name).pathname === '/js/ui/chamber-reading.js').length,
        priorityModules: performance.getEntriesByType('resource').filter(r => new URL(r.name).pathname === '/js/core/load-priority.js').length,
        codecModules: performance.getEntriesByType('resource').filter(r => new URL(r.name).pathname === '/js/core/tezoscrp-codec.mjs').length,
        textLoadingModules: performance.getEntriesByType('resource').filter(r => new URL(r.name).pathname === '/js/ui/text-loading.js').length,
        elements: document.getElementsByTagName('*').length,
        theme: document.body.dataset.theme,
        overflow: document.documentElement.scrollWidth > innerWidth,
        timeOrigin: performance.timeOrigin
      }));
      assert(cold.readingModules === 1 && cold.codecModules === 1 && cold.textLoadingModules === 1 && cold.priorityModules === 1 && !cold.ready && !cold.dashboardNodes && cold.scripts - cold.readingModules - cold.codecModules - cold.textLoadingModules - cold.priorityModules < 20 && cold.elements < 1500, `standalone ${width}: eager dashboard leaked ${JSON.stringify(cold)}`);
      assert(cold.theme === theme && !cold.overflow, `standalone ${width}: theme or geometry changed`);
      const forbidden = requests.filter(url => /\/(?:app|api|network-health|history|my-tezos|daily-briefing|price|comparison)\.js|chart\.umd|chartjs-adapter|\.supabase\.co|\.tzkt\.io|rpc\.tez\.capital/.test(url));
      assert(forbidden.length === 0, `standalone ${width}: unrelated startup work ${forbidden.join('\n')}`);
      if (ARTIFACTS_DIR) await page.screenshot({ path: path.join(ARTIFACTS_DIR, `standalone-${theme}-${width}.png`) });

      await page.locator('#tezoscrp-modal .chamber-close').click();
      await page.waitForFunction(() => document.documentElement.dataset.dashboardReady === 'true' && !document.querySelector('#tezoscrp-modal')?.classList.contains('active'), null, { timeout: 15000 });
      const hydrated = await page.evaluate(() => ({
        path: location.pathname, query: location.search, timeOrigin: performance.timeOrigin,
        heroCount: document.querySelectorAll('#hero-slot').length,
        focused: document.activeElement?.closest('#tezoscrp-entry-card')?.id,
        canonical: document.querySelector('link[rel="canonical"]')?.href
      }));
      assert(hydrated.path === '/' && !hydrated.query && hydrated.timeOrigin === cold.timeOrigin && hydrated.heroCount === 1, `standalone ${width}: close did not hydrate in-place once ${JSON.stringify(hydrated)}`);
      assert(hydrated.focused === 'tezoscrp-entry-card', `standalone ${width}: close lost launcher focus ${JSON.stringify(hydrated)}`);
      assert(hydrated.canonical === 'https://tezos.systems/', `standalone ${width}: dashboard inherited archive metadata`);
      await page.goBack();
      await page.locator('#tezoscrp-modal.active #tezoscrp-archive-search').waitFor();
      assert(await page.locator('#tezoscrp-archive-search').inputValue() === 'Baking Benjamins', `standalone ${width}: Back lost archive filters`);
      await page.goForward();
      await page.waitForFunction(() => !document.querySelector('#tezoscrp-modal')?.classList.contains('active'));
      await page.locator('#hero-search-input').focus();
      await page.locator('#hero-search-input').fill('Network Health');
      await page.locator('#hero-search-panel .hero-search-result').first().waitFor();
      await page.keyboard.press('Enter');
      await page.locator('#network-health-modal.active').waitFor({ state: 'visible' });
      await page.keyboard.press('Escape');
      await page.evaluate(() => { location.hash = 'my-tezos'; });
      await page.locator('#my-tezos-drawer.open').waitFor({ state: 'visible' });
      assert(await page.evaluate(() => performance.timeOrigin) === cold.timeOrigin, `standalone ${width}: search or My Tezos reloaded the document`);
      assert(requests.filter(url => new URL(url).pathname === '/js/core/app.js').length === 1, `standalone ${width}: dashboard imported more than once`);
      assert(requests.filter(url => new URL(url).pathname === '/data/tezoscrp-awards.compact.json').length === 1, `standalone ${width}: transition created a second archive cache`);
      assert(!requests.some(url => new URL(url).pathname === '/data/tezoscrp-awards.json'), `standalone ${width}: browser loaded the expanded compatibility archive`);
      assert(issues.length === 0, `standalone ${width}: ${issues.join('\n')}`);
      await context.close();
    }

    // Failure and retry must leave the existing room readable, not replace it.
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
    await installFeatureMocks(context);
    await context.addInitScript(() => { localStorage.setItem('tezos-toured', '1'); localStorage.setItem('tezos-systems-theme', 'clean'); });
    let shellAttempts = 0;
    await context.route('**/index.html', route => {
      shellAttempts += 1;
      return shellAttempts === 1 ? route.fulfill({ status: 503, body: 'test shell unavailable' }) : route.continue();
    });
    const page = await context.newPage();
    await page.goto(`${baseUrl}/tezoscrp/`, { waitUntil: 'domcontentloaded' });
    await page.locator('#tezoscrp-hall-results .tezoscrp-ranking').waitFor();
    await page.locator('#tezoscrp-tab-archive').click();
    const reading = await page.evaluate(() => {
      const input = document.querySelector('#tezoscrp-archive-search');
      input.focus({ preventScroll: true });
      input.value = 'Baking Benjamins';
      input.setSelectionRange(0, 6);
      const room = document.querySelector('.tezoscrp-content');
      room.scrollTop = 350;
      window.__archiveNode = document.querySelector('.tezoscrp-body');
      return { scroll: room.scrollTop, route: location.href, focused: document.activeElement.id, selection: [input.selectionStart, input.selectionEnd] };
    });
    await page.keyboard.press('Escape');
    await page.locator('[data-dashboard-transition] button').waitFor();
    const failed = await page.evaluate(() => ({ scroll: document.querySelector('.tezoscrp-content').scrollTop, route: location.href, focused: document.activeElement.id, selection: [document.activeElement.selectionStart, document.activeElement.selectionEnd], sameNode: window.__archiveNode === document.querySelector('.tezoscrp-body'), ready: document.documentElement.dataset.dashboardReady }));
    assert(failed.sameNode && !failed.ready && failed.scroll === reading.scroll && failed.route === reading.route && failed.focused === reading.focused && JSON.stringify(failed.selection) === JSON.stringify(reading.selection), `standalone failure disturbed the reader ${JSON.stringify({reading,failed})}`);
    await page.locator('[data-dashboard-transition] button').click();
    await page.waitForFunction(() => document.documentElement.dataset.dashboardReady === 'true' && location.pathname === '/', null, { timeout: 15000 });
    assert(shellAttempts === 2, 'standalone transition did not recover on one explicit retry');
    await context.close();

    // A retry must preserve the requested destination, not turn every action into
    // a plain close. Exercise both the cold-room shortcut and visible wayfinder.
    for (const searchEntry of ['shortcut', 'wayfinder']) {
      const intentContext = await browser.newContext({ serviceWorkers: 'block', reducedMotion: 'reduce' });
      await installFeatureMocks(intentContext);
      await intentContext.addInitScript(() => {
        localStorage.setItem('tezos-toured', '1');
        localStorage.setItem('tezos-welcomed', '1');
        localStorage.setItem('tezos-systems-theme', 'clean');
      });
      let attempts = 0;
      await intentContext.route('**/index.html', route => ++attempts === 1 ? route.fulfill({ status: 503, body: 'test search handoff unavailable' }) : route.continue());
      const intentPage = await intentContext.newPage();
      await intentPage.goto(`${baseUrl}/tezoscrp/`);
      await intentPage.locator('#tezoscrp-hall-results .tezoscrp-ranking').waitFor();
      const timeOrigin = await intentPage.evaluate(() => performance.timeOrigin);
      if (searchEntry === 'shortcut') await intentPage.keyboard.press('/');
      else await intentPage.getByRole('link', { name: 'Search Tezos Systems', exact: true }).click();
      await intentPage.locator('[data-dashboard-transition] button').waitFor();
      assert(await intentPage.locator('[data-dashboard-fallback]').getAttribute('href') === '/#search', `standalone ${searchEntry}: fallback lost search intent`);
      await intentPage.locator('[data-dashboard-transition] button').click();
      await intentPage.waitForFunction(() => document.body.classList.contains('hero-search-mode') && document.activeElement?.id === 'hero-search-input', null, { timeout: 15000 });
      assert(attempts === 2 && await intentPage.evaluate(() => performance.timeOrigin) === timeOrigin, `standalone ${searchEntry}: search retry reloaded or repeated initialization`);
      await intentContext.close();
    }

    const dashboardFailureContext = await browser.newContext({ serviceWorkers: 'block', reducedMotion: 'reduce' });
    await installFeatureMocks(dashboardFailureContext);
    await dashboardFailureContext.addInitScript(() => {
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-systems-theme', 'clean');
    });
    let dashboardModuleAttempts = 0;
    await dashboardFailureContext.route('**/js/core/app.js*', route => ++dashboardModuleAttempts === 1 ? route.fulfill({ status: 503, body: 'test dashboard module unavailable' }) : route.continue());
    const dashboardFailurePage = await dashboardFailureContext.newPage();
    await dashboardFailurePage.goto(`${baseUrl}/tezoscrp/`);
    await dashboardFailurePage.locator('#tezoscrp-hall-results .tezoscrp-ranking').waitFor();
    await dashboardFailurePage.evaluate(() => { window.__retainedRoom = document.querySelector('.tezoscrp-body'); });
    await dashboardFailurePage.locator('#tezoscrp-modal .chamber-close').click();
    await dashboardFailurePage.locator('[data-dashboard-transition] button').waitFor();
    assert(await dashboardFailurePage.evaluate(() => window.__retainedRoom === document.querySelector('.tezoscrp-body') && !document.documentElement.dataset.dashboardReady), 'failed dashboard module disturbed or initialized the retained room');
    await dashboardFailurePage.locator('[data-dashboard-transition] button').click();
    await dashboardFailurePage.waitForFunction(() => document.documentElement.dataset.dashboardReady === 'true' && location.pathname === '/', null, { timeout: 15000 });
    assert(dashboardModuleAttempts === 2 && await dashboardFailurePage.locator('#hero-slot').count() === 1, 'failed dashboard import did not retry exactly once without duplicating the shell');
    await dashboardFailureContext.close();

    const failureContext = await browser.newContext({ serviceWorkers: 'block', reducedMotion: 'reduce' });
    await installFeatureMocks(failureContext);
    let moduleAttempts = 0;
    let styleAttempts = 0;
    await failureContext.route('**/js/features/tezoscrp.js*', route => ++moduleAttempts === 1 ? route.fulfill({ status: 503, body: 'test module unavailable' }) : route.continue());
    await failureContext.route('**/css/tezoscrp.min.css*', route => ++styleAttempts === 1 ? route.fulfill({ status: 503, body: 'test styles unavailable' }) : route.continue());
    const failurePage = await failureContext.newPage();
    await failurePage.goto(`${baseUrl}/tezoscrp/`);
    await failurePage.locator('#standalone-chamber-retry').waitFor({ state: 'visible' });
    await failurePage.locator('#standalone-chamber-retry').click();
    await failurePage.locator('#standalone-chamber-retry').waitFor({ state: 'visible' });
    assert(moduleAttempts === 2 && styleAttempts === 1, 'bootstrap retry became visible before its module/style failure settled');
    await failurePage.locator('#standalone-chamber-retry').click();
    await failurePage.locator('#tezoscrp-hall-results .tezoscrp-ranking').waitFor();
    assert(moduleAttempts === 2 && styleAttempts === 2, 'standalone module and stylesheet failures must both retry without reloading');
    await failureContext.route('**/index.html', async route => {
      const response = await route.fetch();
      const body = (await response.text()).replace(/app\.js\?v=\d+/g, 'app.js?v=999999');
      await route.fulfill({ response, body });
    });
    await failurePage.locator('#tezoscrp-modal .chamber-close').click();
    await failurePage.getByText(/A newer build is available/).waitFor();
    assert(await failurePage.locator('#hero-slot').count() === 0 && await failurePage.locator('#tezoscrp-modal.active').count() === 1, 'standalone must not install a different-version dashboard');
    await failureContext.close();

    const workerContext = await browser.newContext({ serviceWorkers: 'allow', reducedMotion: 'reduce' });
    await installFeatureMocks(workerContext);
    const workerRequests = [];
    workerContext.on('request', request => workerRequests.push(request.url()));
    const workerPage = await workerContext.newPage();
    await workerPage.goto(`${baseUrl}/tezoscrp/`);
    await workerPage.locator('#tezoscrp-hall-results .tezoscrp-ranking').waitFor();
    await workerPage.evaluate(async () => { await navigator.serviceWorker.ready; });
    assert(!workerRequests.some(url => /\/(?:app|api|home-layout-preload)\.js|hero-search\.css/.test(url)), 'service-worker installation bypassed the standalone request boundary');
    await workerContext.close();

    const cancelledContext = await browser.newContext({ serviceWorkers: 'block', reducedMotion: 'reduce' });
    await installFeatureMocks(cancelledContext);
    await cancelledContext.addInitScript(() => localStorage.setItem('tezos-toured', '1'));
    let releaseStyle;
    let styleRequested;
    const pendingStyle = new Promise(resolve => { releaseStyle = resolve; });
    const sawStyle = new Promise(resolve => { styleRequested = resolve; });
    await cancelledContext.route('**/css/tezoscrp.min.css*', async route => { styleRequested(); await pendingStyle; await route.continue(); });
    const cancelledPage = await cancelledContext.newPage();
    await cancelledPage.goto(`${baseUrl}/tezoscrp/`, { waitUntil: 'domcontentloaded' });
    await sawStyle;
    await cancelledPage.getByRole('link', { name: 'Return to Tezos Systems', exact: true }).click();
    await cancelledPage.waitForFunction(() => document.documentElement.dataset.dashboardReady === 'true' && location.pathname === '/', null, { timeout: 15000 });
    releaseStyle();
    await cancelledPage.waitForFunction(() => Boolean(document.getElementById('tezoscrp-css')?.sheet));
    assert(await cancelledPage.locator('#tezoscrp-modal.active').count() === 0, 'late archive stylesheet reopened a cancelled room');
    await cancelledContext.close();
    log('ok - standalone TezosCRP desktop/mobile-6x budgets, no idle dashboard, same-document exit, history, search, My Tezos, and failure recovery');
  }

  async function smokeLauncherProjections(browser, baseUrl) {
    const issues = [];
    const initialPaths = [];
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(context);
    await context.addInitScript(() => {
      localStorage.setItem('tezos-systems-theme', 'clean');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    });
    const page = await context.newPage();
    attachIssueCollectors(page, 'launcher projections', issues);
    // Compare projection and full-data markup at the same instant so a valid
    // freshness-age rollover cannot look like data drift. Timers keep running.
    await page.clock.setFixedTime(Date.now());
    page.on('request', (request) => {
      try {
        initialPaths.push(new URL(request.url()).pathname.replace(/^\/data\/transports\/v1(?=\/data\/)/, ''));
      } catch {
        // Ignore malformed third-party diagnostics.
      }
    });
    const hasPath = (path) => initialPaths.includes(path);
    const hasSeasonSummary = () => initialPaths.some((path) => /^\/data\/maxis\/seasons\/[^/]+\/summary\.json$/.test(path));
    const waitForRequests = async (predicate, label, timeoutMs = 20000) => {
      const deadline = Date.now() + timeoutMs;
      while (!predicate() && Date.now() < deadline) {
        await page.waitForTimeout(50);
      }
      assert(predicate(), `${label}; observed ${initialPaths.join(', ')}`);
    };
    const entryMarkup = () => page.evaluate(() => ({
      capital: document.querySelector('#capital-entry-front')?.innerHTML.replace(/\s+/g, ' ').trim() || '',
      capitalUpdated: document.querySelector('#capital-entry-card')?.dataset.updatedLabel || '',
      ecosystem: document.querySelector('#ecosystem-entry-front')?.innerHTML.replace(/\s+/g, ' ').trim() || '',
      ecosystemUpdated: document.querySelector('#ecosystem-entry-card')?.dataset.updatedLabel || '',
      maxis: document.querySelector('#maxis-entry-card .maxis-entry-front')?.innerHTML.replace(/\s+/g, ' ').trim() || '',
      maxisUpdated: document.querySelector('#maxis-entry-card')?.dataset.updatedLabel || ''
    }));

    const response = await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `launcher projections: dashboard failed with HTTP ${response?.status()}`);
    await page.waitForFunction(() => ['capital', 'ecosystem', 'maxis'].every((entryId) => (
      document.querySelector(`[data-chamber-entry-id="${entryId}"]`)?.dataset.lazyChamberWired === '1'
    )), null, { timeout: 10000 });
    await page.evaluate(() => {
      for (const key of ['capital', 'ecosystem', 'people']) {
        const category = document.querySelector(`#chambers-grid > .chamber-category[data-chamber-category="${key}"]`);
        category.dataset.chamberExpanded = 'true';
        category.querySelector(':scope > .chamber-category-head > .chamber-category-toggle')?.setAttribute('aria-expanded', 'true');
        const cards = category.querySelector(':scope > .chamber-category-cards');
        if (cards) cards.hidden = false;
      }
      for (const selector of ['#capital-entry-card', '#ecosystem-entry-card', '#maxis-entry-card']) {
        document.querySelector(selector)?.dispatchEvent(new PointerEvent('pointerenter'));
      }
    });
    const readProjectionState = () => page.evaluate(() => {
      const capitalPath = document.querySelector('#capital-entry-card .capital-entry-price-line')?.getAttribute('d') || '';
      const ecosystemPoints = document.querySelector('#ecosystem-entry-card .ecosystem-entry-sparkline polyline')?.getAttribute('points') || '';
      const ecosystemPointCount = ecosystemPoints.trim()
        ? ecosystemPoints.trim().split(/\s+/).length
        : 0;
      const ecosystemMonitor = document.querySelector('#ecosystem-entry-card .ecosystem-entry-empty')?.textContent || '';
      const maxisIdentities = document.querySelectorAll('#maxis-entry-card [data-maxis-entry-identity]').length;
      return {
        ready: capitalPath.length > 80
          && (ecosystemPointCount >= 2 || /Network monitor starts here/i.test(ecosystemMonitor))
          && maxisIdentities === 10,
        capitalPathLength: capitalPath.length,
        ecosystemPointCount,
        ecosystemPointsLength: ecosystemPoints.length,
        ecosystemMonitor,
        maxisIdentities
      };
    });
    const projectionDeadline = Date.now() + 25000;
    let projectionState = await readProjectionState();
    while (!projectionState.ready && Date.now() < projectionDeadline) {
      await page.waitForTimeout(100);
      projectionState = await readProjectionState();
    }
    assert(projectionState.ready, `launcher projections did not hydrate ${JSON.stringify(projectionState)}; observed ${initialPaths.join(', ')}`);
    await page.waitForTimeout(250);

    const ecosystemDesktopLayout = await page.evaluate(() => {
      const tiles = [...document.querySelectorAll('#ecosystem-entry-card .ecosystem-entry-tile')].map((tile) => {
        const rect = tile.getBoundingClientRect();
        return {
          rank: tile.dataset.ecosystemLeaderRank || '',
          top: Math.round(rect.top),
          width: Math.round(rect.width),
          visible: getComputedStyle(tile).display !== 'none'
        };
      });
      const visible = tiles.filter((tile) => tile.visible);
      const rowCounts = Object.values(visible.reduce((rows, tile) => {
        rows[tile.top] = (rows[tile.top] || 0) + 1;
        return rows;
      }, {}));
      return {
        total: tiles.length,
        visible: visible.length,
        leaderRanks: visible.filter((tile) => tile.rank).map((tile) => tile.rank),
        rowCounts,
        widthDelta: Math.max(...visible.map((tile) => tile.width)) - Math.min(...visible.map((tile) => tile.width))
      };
    });
    assert(ecosystemDesktopLayout.total === 6
      && ecosystemDesktopLayout.visible === 6
      && ecosystemDesktopLayout.leaderRanks.join(',') === '1,2,3'
      && ecosystemDesktopLayout.rowCounts.length === 2
      && ecosystemDesktopLayout.rowCounts.every((count) => count === 3)
      && ecosystemDesktopLayout.widthDelta <= 1,
    `Ecosystem launcher desktop grid must show three ranked apps above three equal summary tiles: ${JSON.stringify(ecosystemDesktopLayout)}`);

    assert(hasPath('/data/capital-entry-summary.json'), `Capital launcher projection was not requested: ${initialPaths.join(', ')}`);
    assert(hasPath('/data/ecosystem-entry-summary.json'), `Ecosystem launcher projection was not requested: ${initialPaths.join(', ')}`);
    assert(hasPath('/data/maxis/entry-summary.json'), `Maxis launcher projection was not requested: ${initialPaths.join(', ')}`);
    assert(!hasPath('/data/capital-snapshot.json'), `full Capital data loaded before its Chamber opened: ${initialPaths.join(', ')}`);
    assert(!hasPath('/data/ecosystem-stats.json'), `full Ecosystem data loaded before its Chamber opened: ${initialPaths.join(', ')}`);
    assert(!hasPath('/data/maxis-leaders.json')
      && !hasPath('/data/maxis-careers.json')
      && !hasPath('/data/maxis-l2-governance.json')
      && !hasPath('/data/maxis/manifest.json')
      && !hasSeasonSummary(), `full Maxis data loaded before its Chamber opened: ${initialPaths.join(', ')}`);

    const beforeOpen = await entryMarkup();
    assert(/CoinGecko/.test(beforeOpen.capital) && /6h schedule/.test(beforeOpen.capital), `Capital launcher freshness truth missing: ${beforeOpen.capital}`);
    assert(/All active/.test(beforeOpen.ecosystem) && /Tracked-dapp activity/.test(beforeOpen.ecosystem),
      `Ecosystem launcher must separate network-wide and reviewed-dapp activity: ${beforeOpen.ecosystem}`);
    assert(/6h schedule/.test(beforeOpen.ecosystemUpdated), `Ecosystem launcher schedule disclosure missing: ${beforeOpen.ecosystemUpdated}`);
    assert(/6h schedule/.test(beforeOpen.maxisUpdated), `Maxis launcher schedule disclosure missing: ${beforeOpen.maxisUpdated}`);
    await page.locator('#capital-entry-front').click();
    await page.locator('#capital-modal.active .capital-content').waitFor({ state: 'visible', timeout: 20000 });
    await waitForRequests(() => hasPath('/data/capital-snapshot.json'), 'Capital Chamber did not request its reviewed full snapshot');
    await page.locator('#capital-modal.active .chamber-close').click();
    await page.waitForFunction(() => !document.querySelector('#capital-modal')?.classList.contains('active'), null, { timeout: 5000 });

    await page.locator('#ecosystem-entry-front').click();
    await page.locator('#ecosystem-activity-modal.active .ecosystem-content').waitFor({ state: 'visible', timeout: 20000 });
    await waitForRequests(() => hasPath('/data/ecosystem-stats.json'), 'Ecosystem Activity did not request its reviewed full snapshot');
    await page.locator('#ecosystem-activity-modal.active .chamber-close').click();
    await page.waitForFunction(() => !document.querySelector('#ecosystem-activity-modal')?.classList.contains('active'), null, { timeout: 5000 });

    await page.locator('#maxis-entry-card .maxis-entry-front').click();
    await page.locator('#maxis-modal.active .maxis-experience').waitFor({ state: 'visible', timeout: 30000 });
    await waitForRequests(() => hasPath('/data/maxis-leaders.json')
      && hasPath('/data/maxis-careers.json')
      && hasPath('/data/maxis-l2-governance.json')
      && hasPath('/data/maxis/manifest.json')
      && hasSeasonSummary(), 'Maxis Chamber did not request all reviewed full artifacts', 30000);
    await page.locator('#maxis-modal.active .chamber-close').click();
    await page.waitForFunction(() => !document.querySelector('#maxis-modal')?.classList.contains('active'), null, { timeout: 5000 });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const afterOpen = await entryMarkup();
    assert(afterOpen.capital === beforeOpen.capital, 'Capital launcher markup drifted after replacing its projection with reviewed full data');
    assert(afterOpen.ecosystem === beforeOpen.ecosystem, 'Ecosystem launcher markup drifted after replacing its projection with reviewed full data');
    assert(afterOpen.maxis === beforeOpen.maxis, 'Maxis launcher markup drifted after replacing its projection with reviewed full data');
    await context.close();

    const noSubtleIssues = [];
    const noSubtlePaths = [];
    const noSubtleContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(noSubtleContext);
    await noSubtleContext.addInitScript(() => {
      // Plain-HTTP LAN previews expose crypto without SubtleCrypto. Shadow the
      // secure-localhost implementation so this regression stays reproducible in
      // CI while the shared deterministic verifier still checks exact receipts.
      Object.defineProperty(globalThis.crypto, 'subtle', {
        configurable: true,
        value: undefined
      });
      localStorage.setItem('tezos-systems-theme', 'clean');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    });
    const noSubtlePage = await noSubtleContext.newPage();
    attachIssueCollectors(noSubtlePage, 'plain-HTTP launcher receipts', noSubtleIssues);
    noSubtlePage.on('request', (request) => {
      try {
        noSubtlePaths.push(new URL(request.url()).pathname.replace(/^\/data\/transports\/v1(?=\/data\/)/, ''));
      } catch {
        // Ignore malformed third-party diagnostics.
      }
    });
    const noSubtleResponse = await noSubtlePage.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    assert(noSubtleResponse?.ok(), `plain-HTTP launcher receipts: dashboard failed with HTTP ${noSubtleResponse?.status()}`);
    assert(await noSubtlePage.evaluate(() => !globalThis.crypto?.subtle),
      'plain-HTTP launcher receipt fixture did not disable SubtleCrypto');
    await noSubtlePage.waitForFunction(() => ['capital', 'ecosystem', 'maxis'].every((entryId) => (
      document.querySelector(`[data-chamber-entry-id="${entryId}"]`)?.dataset.lazyChamberWired === '1'
    )), null, { timeout: 10000 });
    await noSubtlePage.evaluate(() => {
      for (const selector of ['#capital-entry-card', '#ecosystem-entry-card', '#maxis-entry-card']) {
        document.querySelector(selector)?.dispatchEvent(new PointerEvent('pointerenter'));
      }
    });
    await noSubtlePage.waitForFunction(() => {
      const capitalPath = document.querySelector('#capital-entry-card .capital-entry-price-line')?.getAttribute('d') || '';
      const ecosystemPoints = document.querySelector('#ecosystem-entry-card .ecosystem-entry-sparkline polyline')?.getAttribute('points') || '';
      const ecosystemPointCount = ecosystemPoints.trim()
        ? ecosystemPoints.trim().split(/\s+/).length
        : 0;
      const ecosystemMonitor = document.querySelector('#ecosystem-entry-card .ecosystem-entry-empty')?.textContent || '';
      const maxisIdentities = document.querySelectorAll('#maxis-entry-card [data-maxis-entry-identity]').length;
      const visibleText = [
        document.querySelector('#capital-entry-card')?.textContent || '',
        document.querySelector('#ecosystem-entry-card')?.textContent || '',
        document.querySelector('#maxis-entry-card')?.textContent || ''
      ].join(' ');
      return capitalPath.length > 80
        && (ecosystemPointCount >= 2 || /Network monitor starts here/i.test(ecosystemMonitor))
        && maxisIdentities === 10
        && !/Unavailable/.test(visibleText);
    }, null, { timeout: 30000 });
    const mobileEcosystemCategory = noSubtlePage.locator('.chamber-category[data-chamber-category="ecosystem"]');
    if ((await mobileEcosystemCategory.getAttribute('data-chamber-expanded')) !== 'true') {
      await mobileEcosystemCategory.locator(':scope > .chamber-category-head > .chamber-category-toggle').click();
    }
    await noSubtlePage.waitForFunction(() => document.querySelector('#ecosystem-entry-card')?.getClientRects().length > 0);
    const ecosystemMobileLayout = await noSubtlePage.evaluate(() => {
      const tiles = [...document.querySelectorAll('#ecosystem-entry-card .ecosystem-entry-tile')].map((tile) => {
        const rect = tile.getBoundingClientRect();
        return {
          rank: tile.dataset.ecosystemLeaderRank || '',
          top: Math.round(rect.top),
          visible: getComputedStyle(tile).display !== 'none'
        };
      });
      const visible = tiles.filter((tile) => tile.visible);
      const rowCounts = Object.values(visible.reduce((rows, tile) => {
        rows[tile.top] = (rows[tile.top] || 0) + 1;
        return rows;
      }, {}));
      return {
        total: tiles.length,
        visible: visible.length,
        visibleLeaderRanks: visible.filter((tile) => tile.rank).map((tile) => tile.rank),
        rowCounts,
        weeklyPillVisible: getComputedStyle(document.querySelector('#ecosystem-entry-card .ecosystem-entry-title-line span')).display !== 'none'
      };
    });
    assert(ecosystemMobileLayout.total === 6
      && ecosystemMobileLayout.visible === 4
      && ecosystemMobileLayout.visibleLeaderRanks.join(',') === '1'
      && ecosystemMobileLayout.rowCounts.length === 2
      && ecosystemMobileLayout.rowCounts.every((count) => count === 2)
      && !ecosystemMobileLayout.weeklyPillVisible,
    `Ecosystem launcher mobile grid must retain only the lead app and three summary tiles: ${JSON.stringify(ecosystemMobileLayout)}`);
    assert(noSubtlePaths.includes('/data/capital-entry-summary.json')
      && noSubtlePaths.includes('/data/ecosystem-entry-summary.json')
      && noSubtlePaths.includes('/data/maxis/entry-summary.json'),
    `plain-HTTP launchers did not request all compact receipts: ${noSubtlePaths.join(', ')}`);
    assert(!noSubtlePaths.includes('/data/capital-snapshot.json')
      && !noSubtlePaths.includes('/data/ecosystem-stats.json')
      && !noSubtlePaths.includes('/data/maxis-leaders.json')
      && !noSubtlePaths.includes('/data/maxis-careers.json'),
    `plain-HTTP launcher verification loaded full room data before intent: ${noSubtlePaths.join(', ')}`);

    await noSubtlePage.locator('#capital-entry-front').evaluate((node) => node.click());
    await noSubtlePage.waitForFunction(() => {
      const body = document.querySelector('#capital-modal.active #capital-chamber-body');
      return body?.dataset.capitalRendered === '1'
        && !/Capital snapshot unavailable/i.test(body.textContent || '');
    }, null, { timeout: 30000 });
    await noSubtlePage.locator('#capital-modal.active .chamber-close').click();
    await noSubtlePage.waitForFunction(() => !document.querySelector('#capital-modal')?.classList.contains('active'), null, { timeout: 5000 });

    await noSubtlePage.locator('#ecosystem-entry-front').evaluate((node) => node.click());
    await noSubtlePage.waitForFunction(() => {
      const body = document.querySelector('#ecosystem-activity-modal.active #ecosystem-chamber-body');
      return body?.dataset.ecosystemRendered === '1'
        && !/Ecosystem history unavailable/i.test(body.textContent || '');
    }, null, { timeout: 30000 });
    await noSubtlePage.locator('#ecosystem-activity-modal.active .chamber-close').click();
    await noSubtlePage.waitForFunction(() => !document.querySelector('#ecosystem-activity-modal')?.classList.contains('active'), null, { timeout: 5000 });
    await noSubtleContext.close();

    const raceIssues = [];
    const racePaths = [];
    let releaseDelayedMaxisProjection;
    let delayedMaxisProjectionFulfilled = false;
    const delayedMaxisProjectionGate = new Promise((resolve) => {
      releaseDelayedMaxisProjection = resolve;
    });
    const raceContext = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(raceContext);
    await raceContext.route('**/data/maxis/entry-summary.json*', async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      body.payload.legacy.rankedWalletCount = 777;
      const { integrity: ignoredIntegrity, ...unsigned } = body;
      body.integrity.contentHash = stableTestHash(unsigned);
      await delayedMaxisProjectionGate;
      await route.fulfill({ response, contentType: 'application/json', body: JSON.stringify(body) });
      delayedMaxisProjectionFulfilled = true;
    });
    await raceContext.addInitScript(() => {
      localStorage.setItem('tezos-systems-theme', 'clean');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    });
    const racePage = await raceContext.newPage();
    attachIssueCollectors(racePage, 'Maxis delayed launcher projection', raceIssues);
    racePage.on('request', (request) => {
      try {
        racePaths.push(new URL(request.url()).pathname);
      } catch {
        // Ignore malformed third-party diagnostics.
      }
    });
    const raceResponse = await racePage.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    assert(raceResponse?.ok(), `Maxis delayed launcher projection: dashboard failed with HTTP ${raceResponse?.status()}`);
    await racePage.locator('#maxis-entry-card').dispatchEvent('pointerenter');
    await racePage.waitForFunction(() => typeof window.openMaxisChamber === 'function', null, { timeout: 15000 });
    const raceRequestDeadline = Date.now() + 15000;
    while (!racePaths.includes('/data/maxis/entry-summary.json') && Date.now() < raceRequestDeadline) {
      await racePage.waitForTimeout(50);
    }
    assert(racePaths.includes('/data/maxis/entry-summary.json'), `Maxis delayed launcher projection request did not start: ${racePaths.join(', ')}`);
    await racePage.evaluate(() => window.openMaxisChamber());
    await racePage.locator('#maxis-modal.active .maxis-experience').waitFor({ state: 'visible', timeout: 30000 });
    await racePage.waitForFunction(() => {
      const cardText = document.querySelector('#maxis-entry-card .maxis-entry-front')?.textContent || '';
      return /Passports/i.test(cardText) && !/loading/i.test(cardText);
    }, null, { timeout: 30000 });
    const fullRaceMarkup = await racePage.locator('#maxis-entry-card .maxis-entry-front').evaluate((node) => node.innerHTML.replace(/\s+/g, ' ').trim());
    assert(!/777 ranked wallets/i.test(fullRaceMarkup), `Maxis full launcher unexpectedly used delayed projection data before release: ${fullRaceMarkup}`);
    releaseDelayedMaxisProjection();
    const raceFulfillDeadline = Date.now() + 10000;
    while (!delayedMaxisProjectionFulfilled && Date.now() < raceFulfillDeadline) {
      await racePage.waitForTimeout(50);
    }
    assert(delayedMaxisProjectionFulfilled, 'Maxis delayed launcher projection fixture did not finish');
    await racePage.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const settledRaceMarkup = await racePage.locator('#maxis-entry-card .maxis-entry-front').evaluate((node) => node.innerHTML.replace(/\s+/g, ' ').trim());
    assert(settledRaceMarkup === fullRaceMarkup && !/777 ranked wallets/i.test(settledRaceMarkup),
      `delayed Maxis projection overwrote full launcher data: ${settledRaceMarkup}`);
    await raceContext.close();

    const fallbackRaceIssues = [];
    const fallbackRacePaths = [];
    const fallbackRaceContext = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(fallbackRaceContext);
    await fallbackRaceContext.route('**/data/maxis/entry-summary.json*', async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      body.integrity.contentHash = '0'.repeat(64);
      await route.fulfill({ response, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await fallbackRaceContext.addInitScript(() => {
      localStorage.setItem('tezos-systems-theme', 'clean');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    });
    const fallbackRacePage = await fallbackRaceContext.newPage();
    attachIssueCollectors(fallbackRacePage, 'Maxis immediate-open fallback race', fallbackRaceIssues);
    fallbackRacePage.on('request', (request) => {
      try {
        fallbackRacePaths.push(new URL(request.url()).pathname);
      } catch {
        // Ignore malformed third-party diagnostics.
      }
    });
    const fallbackRaceResponse = await fallbackRacePage.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    assert(fallbackRaceResponse?.ok(), `Maxis immediate-open fallback race: dashboard failed with HTTP ${fallbackRaceResponse?.status()}`);
    await fallbackRacePage.locator('#maxis-entry-card').dispatchEvent('pointerenter');
    await fallbackRacePage.waitForFunction(() => typeof window.openMaxisChamber === 'function', null, { timeout: 15000 });
    const fallbackRaceSummaryDeadline = Date.now() + 15000;
    while (!fallbackRacePaths.includes('/data/maxis/entry-summary.json') && Date.now() < fallbackRaceSummaryDeadline) {
      await fallbackRacePage.waitForTimeout(50);
    }
    assert(fallbackRacePaths.includes('/data/maxis/entry-summary.json'),
      `Maxis corrupt projection was not requested: ${fallbackRacePaths.join(', ')}`);
    await fallbackRacePage.waitForTimeout(300);
    const maxisFullDataLoaded = () => fallbackRacePaths.includes('/data/maxis-leaders.json')
      || fallbackRacePaths.includes('/data/maxis-careers.json')
      || fallbackRacePaths.includes('/data/maxis-l2-governance.json')
      || fallbackRacePaths.includes('/data/maxis/manifest.json')
      || fallbackRacePaths.some((path) => /^\/data\/maxis\/seasons\/[^/]+\/summary\.json$/.test(path));
    assert(!maxisFullDataLoaded(),
      `Maxis projection failure loaded full data before explicit room intent: ${fallbackRacePaths.join(', ')}`);
    await fallbackRacePage.evaluate(() => window.openMaxisChamber());
    await fallbackRacePage.locator('#maxis-modal.active .maxis-experience').waitFor({ state: 'visible', timeout: 30000 });
    const fallbackRaceFullDeadline = Date.now() + 30000;
    while (!(fallbackRacePaths.includes('/data/maxis-leaders.json')
      && fallbackRacePaths.includes('/data/maxis-careers.json')
      && fallbackRacePaths.includes('/data/maxis-l2-governance.json')
      && fallbackRacePaths.includes('/data/maxis/manifest.json')
      && fallbackRacePaths.some((path) => /^\/data\/maxis\/seasons\/[^/]+\/summary\.json$/.test(path)))
      && Date.now() < fallbackRaceFullDeadline) {
      await fallbackRacePage.waitForTimeout(50);
    }
    assert(fallbackRacePaths.includes('/data/maxis-leaders.json')
      && fallbackRacePaths.includes('/data/maxis-careers.json')
      && fallbackRacePaths.includes('/data/maxis-l2-governance.json')
      && fallbackRacePaths.includes('/data/maxis/manifest.json')
      && fallbackRacePaths.some((path) => /^\/data\/maxis\/seasons\/[^/]+\/summary\.json$/.test(path)),
    `Maxis explicit room intent did not load the reviewed full artifacts: ${fallbackRacePaths.join(', ')}`);
    await fallbackRaceContext.close();

    const fallbackIssues = [];
    const fallbackPaths = [];
    const fallbackContext = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(fallbackContext);
    await fallbackContext.route('**/data/capital-entry-summary.json*', async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      body.contentHash = '0'.repeat(64);
      await route.fulfill({ response, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await fallbackContext.route('**/data/ecosystem-entry-summary.json*', async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      body.contentHash = '0'.repeat(64);
      await route.fulfill({ response, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await fallbackContext.route('**/data/uranium-entry-summary.json*', async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      body.contentHash = '0'.repeat(64);
      await route.fulfill({ response, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await fallbackContext.route('**/data/maxis/entry-summary.json*', async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      body.integrity.contentHash = '0'.repeat(64);
      await route.fulfill({ response, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await fallbackContext.addInitScript(() => {
      localStorage.setItem('tezos-systems-theme', 'clean');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    });
    const fallbackPage = await fallbackContext.newPage();
    attachIssueCollectors(fallbackPage, 'launcher projection fallback', fallbackIssues);
    fallbackPage.on('request', (request) => {
      try {
        fallbackPaths.push(new URL(request.url()).pathname.replace(/^\/data\/transports\/v1(?=\/data\/)/, ''));
      } catch {
        // Ignore malformed third-party diagnostics.
      }
    });
    const waitForFallbackRequests = async (predicate, label, timeoutMs = 30000) => {
      const deadline = Date.now() + timeoutMs;
      while (!predicate() && Date.now() < deadline) {
        await fallbackPage.waitForTimeout(50);
      }
      assert(predicate(), `${label}; observed ${fallbackPaths.join(', ')}`);
    };
    const fallbackResponse = await fallbackPage.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    assert(fallbackResponse?.ok(), `launcher projection fallback: dashboard failed with HTTP ${fallbackResponse?.status()}`);
    await fallbackPage.evaluate(() => {
      for (const key of ['capital', 'ecosystem', 'people']) {
        const category = document.querySelector(`#chambers-grid > .chamber-category[data-chamber-category="${key}"]`);
        category.dataset.chamberExpanded = 'true';
        category.querySelector(':scope > .chamber-category-head > .chamber-category-toggle')?.setAttribute('aria-expanded', 'true');
        const cards = category.querySelector(':scope > .chamber-category-cards');
        if (cards) cards.hidden = false;
      }
      for (const selector of ['#capital-entry-card', '#ecosystem-entry-card', '#uranium-entry-card', '#maxis-entry-card']) {
        document.querySelector(selector)?.dispatchEvent(new PointerEvent('pointerenter'));
      }
    });
    await waitForFallbackRequests(() => fallbackPaths.includes('/data/capital-entry-summary.json')
      && fallbackPaths.includes('/data/ecosystem-entry-summary.json')
      && fallbackPaths.includes('/data/uranium-entry-summary.json')
      && fallbackPaths.includes('/data/maxis/entry-summary.json'),
    'corrupt launcher projections were not all requested');
    await fallbackPage.waitForFunction(() => (
      document.querySelector('#capital-entry-card .capital-entry-value')?.textContent?.trim() === 'Unavailable'
      && document.querySelector('#ecosystem-entry-card .ecosystem-entry-value')?.textContent?.trim() === 'Unavailable'
      && document.querySelector('#uranium-entry-card .uranium-entry-value')?.textContent?.trim() === 'Unavailable'
    ), null, { timeout: 10000 });
    assert(!fallbackPaths.includes('/data/capital-snapshot.json')
      && !fallbackPaths.includes('/data/ecosystem-stats.json')
      && !fallbackPaths.includes('/data/uranium-snapshot.json')
      && !fallbackPaths.includes('/data/maxis-leaders.json')
      && !fallbackPaths.includes('/data/maxis-careers.json')
      && !fallbackPaths.includes('/data/maxis-l2-governance.json')
      && !fallbackPaths.includes('/data/maxis/manifest.json')
      && !fallbackPaths.some((path) => /^\/data\/maxis\/seasons\/[^/]+\/summary\.json$/.test(path)),
    `projection failure loaded full data before explicit room intent: ${fallbackPaths.join(', ')}`);
    const failClosedLauncherState = await fallbackPage.evaluate(() => Object.fromEntries([
      ['capital', '#capital-entry-card'],
      ['ecosystem', '#ecosystem-entry-card'],
      ['uranium', '#uranium-entry-card']
    ].map(([id, selector]) => {
      const card = document.querySelector(selector);
      return [id, {
        updatedLabel: card?.dataset.updatedLabel || '',
        text: card?.textContent?.replace(/\s+/g, ' ').trim() || '',
        stale: card?.classList.contains('chamber-data-stale') || false,
        hasOpenCue: Boolean(card?.querySelector('.chamber-expand-cue'))
      }];
    })));
    for (const [id, state] of Object.entries(failClosedLauncherState)) {
      assert(
        state.stale
          && state.hasOpenCue
          && /^Unavailable · refresh failed · no last-good receipt$/.test(state.updatedLabel)
          && /Unavailable/.test(state.text)
          && !/\b(?:Loading|Verifying)\b/i.test(state.text),
        `${id} corrupt launcher projection did not settle into an honest retryable unavailable state: ${JSON.stringify(state)}`
      );
    }

    await fallbackPage.locator('#capital-entry-front').click();
    await fallbackPage.locator('#capital-modal.active .capital-content').waitFor({ state: 'visible', timeout: 20000 });
    await waitForFallbackRequests(() => fallbackPaths.includes('/data/capital-snapshot.json'),
      'Capital explicit room intent did not load the reviewed snapshot');
    await fallbackPage.locator('#capital-modal.active .chamber-close').click();
    await fallbackPage.waitForFunction(() => !document.querySelector('#capital-modal')?.classList.contains('active'), null, { timeout: 5000 });

    await fallbackPage.locator('#ecosystem-entry-front').click();
    await fallbackPage.locator('#ecosystem-activity-modal.active .ecosystem-content').waitFor({ state: 'visible', timeout: 20000 });
    await waitForFallbackRequests(() => fallbackPaths.includes('/data/ecosystem-stats.json'),
      'Ecosystem explicit room intent did not load the reviewed snapshot');
    await fallbackPage.locator('#ecosystem-activity-modal.active .chamber-close').click();
    await fallbackPage.waitForFunction(() => !document.querySelector('#ecosystem-activity-modal')?.classList.contains('active'), null, { timeout: 5000 });

    await fallbackPage.locator('#maxis-entry-card .maxis-entry-front').click();
    await fallbackPage.locator('#maxis-modal.active .maxis-experience').waitFor({ state: 'visible', timeout: 30000 });
    await waitForFallbackRequests(() => fallbackPaths.includes('/data/maxis-leaders.json')
      && fallbackPaths.includes('/data/maxis-careers.json')
      && fallbackPaths.includes('/data/maxis-l2-governance.json')
      && fallbackPaths.includes('/data/maxis/manifest.json')
      && fallbackPaths.some((path) => /^\/data\/maxis\/seasons\/[^/]+\/summary\.json$/.test(path)),
    'Maxis explicit room intent did not load the reviewed full artifacts');
    await fallbackContext.close();

    const deploySkewIssues = [];
    const deploySkewPaths = [];
    const deploySkewContext = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(deploySkewContext);
    let deploySkewSummaryRequests = 0;
    await deploySkewContext.route('**/data/capital-entry-summary.json*', async (route) => {
      const response = await route.fetch();
      deploySkewSummaryRequests += 1;
      if (deploySkewSummaryRequests > 1) {
        await route.fulfill({ response });
        return;
      }
      const body = await response.json();
      const olderGeneratedAt = new Date(Date.parse(body.generatedAt) - 60_000).toISOString();
      body.generatedAt = olderGeneratedAt;
      body.source.generatedAt = olderGeneratedAt;
      body.source.contentHash = '1'.repeat(64);
      const { contentHash: ignored, ...unsigned } = body;
      body.contentHash = stableTestHash(unsigned);
      await route.fulfill({ response, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await deploySkewContext.addInitScript(() => {
      localStorage.setItem('tezos-systems-theme', 'clean');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    });
    const deploySkewPage = await deploySkewContext.newPage();
    attachIssueCollectors(deploySkewPage, 'Capital launcher deploy skew', deploySkewIssues);
    deploySkewPage.on('request', (request) => {
      try {
        deploySkewPaths.push(new URL(request.url()).pathname.replace(/^\/data\/transports\/v1(?=\/data\/)/, ''));
      } catch {
        // Ignore malformed third-party diagnostics.
      }
    });
    const deploySkewResponse = await deploySkewPage.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    assert(deploySkewResponse?.ok(), `Capital launcher deploy skew: dashboard failed with HTTP ${deploySkewResponse?.status()}`);
    await deploySkewPage.locator('#chambers-grid > .chamber-category[data-chamber-category="capital"] .chamber-category-toggle').click();
    await deploySkewPage.locator('#capital-entry-card').dispatchEvent('pointerenter');
    await deploySkewPage.locator('#capital-entry-card .capital-entry-price-line').waitFor({ state: 'attached', timeout: 20000 });
    assert(!deploySkewPaths.includes('/data/capital-snapshot.json'), `Capital deploy-skew fixture loaded full data before open: ${deploySkewPaths.join(', ')}`);
    await deploySkewPage.locator('#capital-entry-front').click();
    await deploySkewPage.locator('#capital-modal.active .capital-error').waitFor({ state: 'visible', timeout: 20000 });
    const rejectedSkewText = await deploySkewPage.locator('#capital-modal.active .capital-error').innerText();
    assert(
      /Capital snapshot unavailable/.test(rejectedSkewText)
        && /does not match the launcher projection content receipt/.test(rejectedSkewText),
      `Capital deploy-skew snapshot was not rejected against its validated launcher receipt: ${rejectedSkewText}`
    );
    assert(
      deploySkewPaths.filter((path) => path === '/data/capital-snapshot.json').length === 1,
      `Capital deploy-skew fixture should attempt the mismatched full snapshot exactly once: ${deploySkewPaths.join(', ')}`
    );
    await deploySkewPage.locator('#capital-modal.active .chamber-close').click();
    await deploySkewPage.waitForFunction(() => !document.querySelector('#capital-modal')?.classList.contains('active'), null, { timeout: 5000 });
    await deploySkewPage.locator('#capital-entry-front').click();
    await deploySkewPage.waitForFunction(() => {
      const body = document.querySelector('#capital-modal.active #capital-chamber-body');
      return Boolean(body?.querySelector('.capital-tabs')) && !/Capital snapshot unavailable/i.test(body?.textContent || '');
    }, null, { timeout: 20000 });
    assert(
      deploySkewSummaryRequests >= 2
        && deploySkewPaths.filter((path) => path === '/data/capital-snapshot.json').length === 2,
      `Capital did not recover from deploy skew by revalidating the projection before accepting the snapshot: ${JSON.stringify({ deploySkewSummaryRequests, deploySkewPaths })}`
    );
    await deploySkewContext.close();

    assert(issues.length === 0, `launcher projection browser issues:\n${issues.join('\n')}`);
    const unexpectedFallbackIssues = fallbackIssues.filter((issue) => (
      !/Capital Chamber entry summary refresh failed; retaining the last good launcher:[\s\S]*failed its SHA-256 integrity receipt/i.test(issue)
      && !/Ecosystem Activity launcher projection refresh failed; retaining the last good launcher:[\s\S]*failed its SHA-256 integrity receipt/i.test(issue)
      && !/Uranium Chamber entry summary refresh failed; retaining the last good launcher:[\s\S]*failed its SHA-256 integrity receipt/i.test(issue)
      && !/Capital Chamber summary poll failed during open; trying the complete snapshot:[\s\S]*failed its SHA-256 integrity receipt/i.test(issue)
      && !/Ecosystem Activity summary poll failed during open; trying the complete snapshot:[\s\S]*failed its SHA-256 integrity receipt/i.test(issue)
    ));
    assert(unexpectedFallbackIssues.length === 0, `launcher projection fail-closed browser issues:\n${unexpectedFallbackIssues.join('\n')}`);
    const unexpectedDeploySkewIssues = deploySkewIssues.filter((issue) => !(
      /Capital Chamber snapshot refresh failed:[\s\S]*does not match the launcher projection content receipt/i.test(issue)
    ));
    assert(unexpectedDeploySkewIssues.length === 0, `Capital launcher deploy-skew browser issues:\n${unexpectedDeploySkewIssues.join('\n')}`);
    assert(raceIssues.length === 0, `Maxis delayed launcher projection browser issues:\n${raceIssues.join('\n')}`);
    assert(fallbackRaceIssues.length === 0, `Maxis immediate-open fallback race browser issues:\n${fallbackRaceIssues.join('\n')}`);
    assert(noSubtleIssues.length === 0, `plain-HTTP launcher receipt browser issues:\n${noSubtleIssues.join('\n')}`);
    log('ok - launcher projections defer full data, preserve parity, and fail closed until explicit room intent');
  }

  async function smokeLazyChamberLoading(browser, baseUrl) {
    const installLazyInit = async (context) => {
      // Opening the room may now finish before the close click: keep counts and
      // paged receipts coherent instead of pairing a generic count with no rows.
      // A Whale Watch highlight can open an account receipt during hydration.
      // Pin that source too so scheduled transfers cannot introduce new URLs.
      await installFeatureMocks(context, { ledgerFlowMocks: true, whaleChamberMocks: true });
      await context.route(/^https:\/\/api\.tzkt\.io\/v1\/accounts\/tz[1-4][^/?]+(?:\?.*)?$/, async (route) => {
        const parsedUrl = new URL(route.request().url());
        const address = decodeURIComponent(parsedUrl.pathname.split('/').pop() || '');
        return fulfillJson(route, {
          address,
          alias: 'Hermetic lazy-Chamber account',
          type: 'user',
          balance: 0
        });
      });
      await context.addInitScript(() => {
        localStorage.setItem('tezos-systems-theme', 'matrix');
        localStorage.setItem('tezos-systems-stats-visible', 'true');
        localStorage.setItem('tezos-toured', '1');
        localStorage.setItem('tezos-welcomed', '1');
        localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
      });
    };
    const waitForLauncherShell = (page) => page.waitForFunction(({ categoryCount, cardCount }) => (
      document.querySelectorAll('#chambers-grid > .chamber-category').length === categoryCount
      && document.querySelectorAll('#chambers-grid .stat-card').length === cardCount
      && document.querySelectorAll('#chambers-grid [data-chamber-skeleton]').length >= 15
    ), { categoryCount: EXPECTED_CHAMBER_CATEGORIES.length, cardCount: EXPECTED_CHAMBER_ORDER.length }, { timeout: 15000 });

    const issues = [];
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      serviceWorkers: 'block'
    });
    await installLazyInit(context);
    const page = await context.newPage();
    attachIssueCollectors(page, 'lazy Chamber no-intent/focus', issues);
    const requestedPaths = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.origin === new URL(baseUrl).origin) requestedPaths.push(url.pathname.replace(/^\/data\/transports\/v1(?=\/data\/)/, ''));
    });
    const response = await page.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `lazy Chamber loading: dashboard failed with HTTP ${response?.status()}`);
    await waitForLauncherShell(page);
    await waitForIntentionalRealTime(page, 'lazy-chamber-no-intent');

    const forbiddenBeforeIntent = new Set([
      ...DEFERRED_CHAMBER_MODULE_PATHS,
      ...DEFERRED_CHAMBER_PROJECTION_PATHS,
      ...DEFERRED_CHAMBER_STYLE_PATHS,
      ...DEFERRED_CHAMBER_HEAVY_DATA_PATHS
    ]);
    const allowedDefaultEcosystemResources = new Set([
      '/js/features/ecosystem-chamber.js',
      '/data/ecosystem-entry-summary.json',
      '/css/ecosystem.min.css'
    ]);
    const observedBeforeIntent = requestedPaths.filter((pathname) => (
      (forbiddenBeforeIntent.has(pathname) && !allowedDefaultEcosystemResources.has(pathname))
      || /^\/data\/maxis\/seasons\/[^/]+\/summary\.json$/.test(pathname)
    ));
    assert(
      observedBeforeIntent.length === 0,
      `lazy Chamber loading requested resources beyond the default-open Ecosystem launcher without route, visibility, focus, or pointer intent: ${observedBeforeIntent.join(', ')}`
    );
    assert(
      !requestedPaths.includes('/data/ecosystem-stats.json'),
      `default-open Ecosystem launcher loaded full Chamber history before explicit room intent: ${requestedPaths.join(', ')}`
    );

    const requestCountBeforeFocus = requestedPaths.length;
    const focusBefore = await page.evaluate(() => {
      const category = document.querySelector('#chambers-grid > .chamber-category[data-chamber-category="people"]');
      category.dataset.chamberExpanded = 'true';
      category.querySelector(':scope > .chamber-category-head > .chamber-category-toggle')?.setAttribute('aria-expanded', 'true');
      const cards = category.querySelector(':scope > .chamber-category-cards');
      if (cards) cards.hidden = false;
      const card = document.getElementById('ledger-flow-entry-card');
      window.__lazyLedgerSkeleton = card;
      const scrollY = window.scrollY;
      card?.focus({ preventScroll: true });
      return {
        hasSkeleton: card?.hasAttribute('data-chamber-skeleton') || false,
        focusedSkeleton: document.activeElement === card,
        scrollY
      };
    });
    assert(focusBefore.hasSkeleton && focusBefore.focusedSkeleton, `lazy Chamber focus intent did not begin on the static launcher: ${JSON.stringify(focusBefore)}`);
    await page.waitForFunction(() => {
      const card = document.getElementById('ledger-flow-entry-card');
      return card
        && !card.hasAttribute('data-chamber-skeleton')
        && document.activeElement === card.querySelector('.chamber-expand-cue');
    }, null, { timeout: 15000 });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const focusAfter = await page.evaluate((scrollY) => {
      const card = document.getElementById('ledger-flow-entry-card');
      return {
        replaced: card !== window.__lazyLedgerSkeleton,
        activeIsOpenCue: document.activeElement === card?.querySelector('.chamber-expand-cue'),
        activeInsideCard: Boolean(card?.contains(document.activeElement)),
        activeTagName: document.activeElement?.tagName || '',
        activeTabIndex: document.activeElement?.tabIndex ?? -1,
        scrollDelta: Math.abs(window.scrollY - scrollY),
        skeletonRemaining: card?.hasAttribute('data-chamber-skeleton') || false
      };
    }, focusBefore.scrollY);
    const focusIntentPaths = requestedPaths.slice(requestCountBeforeFocus);
    assert(
      focusAfter.replaced
        && focusAfter.activeIsOpenCue
        && focusAfter.activeInsideCard
        && focusAfter.activeTagName === 'BUTTON'
        && focusAfter.activeTabIndex === 0
        && !focusAfter.skeletonRemaining
        && focusAfter.scrollDelta <= 2,
      `lazy Chamber hydration did not preserve logical focus and scroll: ${JSON.stringify(focusAfter)}`
    );
    assert(
      focusIntentPaths.includes('/js/features/ledger-flow.js')
        && focusIntentPaths.includes('/css/ledger-flow.min.css'),
      `lazy Chamber focus intent did not request only-in-time module and CSS: ${JSON.stringify(focusIntentPaths)}`
    );
    await page.keyboard.press('Enter');
    await page.locator('#ledger-flow-modal.active').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('#ledger-flow-modal.active .chamber-close').click();
    await context.close();

    const retryIssues = [];
    const retryContext = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      serviceWorkers: 'block'
    });
    await installLazyInit(retryContext);
    const moduleAttempts = [];
    await retryContext.route('**/js/features/ledger-flow.js*', async (route) => {
      moduleAttempts.push(route.request().url());
      if (moduleAttempts.length === 1) return route.abort('failed');
      return route.continue();
    });
    const retryPage = await retryContext.newPage();
    attachIssueCollectors(retryPage, 'lazy Chamber module retry', retryIssues);
    const retryResponse = await retryPage.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
    assert(retryResponse?.ok(), `lazy Chamber retry: dashboard failed with HTTP ${retryResponse?.status()}`);
    await waitForLauncherShell(retryPage);
    const firstModuleFailureSettled = retryPage.waitForEvent('console', {
      predicate: (message) => (
        ['warning', 'warn', 'error'].includes(message.type())
        && /Failed to hydrate ledger-flow Chamber launcher/.test(message.text())
      ),
      timeout: 5000
    });
    await retryPage.evaluate(() => {
      const category = document.querySelector('#chambers-grid > .chamber-category[data-chamber-category="people"]');
      category.dataset.chamberExpanded = 'true';
      category.querySelector(':scope > .chamber-category-head > .chamber-category-toggle')?.setAttribute('aria-expanded', 'true');
      const cards = category.querySelector(':scope > .chamber-category-cards');
      if (cards) cards.hidden = false;
      document.getElementById('ledger-flow-entry-card')?.dispatchEvent(new PointerEvent('pointerenter', {
        bubbles: true,
        pointerType: 'mouse'
      }));
    });
    await firstModuleFailureSettled;
    assert(moduleAttempts.length === 1, `lazy Chamber retry: first failed import did not settle exactly once: ${JSON.stringify(moduleAttempts)}`);
    await retryPage.locator('#ledger-flow-entry-card').click({ force: true });
    await retryPage.locator('#ledger-flow-modal.active').waitFor({ state: 'visible', timeout: 15000 });
    assert(moduleAttempts.length === 2, `lazy Chamber retry should make exactly two module requests: ${JSON.stringify(moduleAttempts)}`);
    const retryUrl = new URL(moduleAttempts[1]);
    assert(
      retryUrl.searchParams.get('chamber-retry') === '1',
      `lazy Chamber retry did not escape Chromium's failed-module cache: ${moduleAttempts[1]}`
    );
    await retryPage.locator('#ledger-flow-modal.active .chamber-close').click();
    await retryContext.close();
    const unexpectedRetryIssues = retryIssues.filter((issue) => !(
      /ledger-flow\.js/.test(issue)
      && /request failed|Failed to hydrate ledger-flow|Failed to load resource/i.test(issue)
    ));
    assert(unexpectedRetryIssues.length === 0, `lazy Chamber retry browser issues:\n${unexpectedRetryIssues.join('\n')}`);

    const cssIssues = [];
    const cssContext = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      serviceWorkers: 'block'
    });
    await installLazyInit(cssContext);
    let cssAttemptCount = 0;
    let markRetryCssRequested;
    let releaseRetryCss;
    const retryCssRequested = new Promise((resolve) => { markRetryCssRequested = resolve; });
    const retryCssRelease = new Promise((resolve) => { releaseRetryCss = resolve; });
    await cssContext.route('**/css/ledger-flow.min.css*', async (route) => {
      cssAttemptCount += 1;
      if (cssAttemptCount === 1) return route.abort('failed');
      markRetryCssRequested();
      const cssResponse = await route.fetch();
      await retryCssRelease;
      return route.fulfill({ response: cssResponse });
    });
    const cssPage = await cssContext.newPage();
    attachIssueCollectors(cssPage, 'lazy Chamber stylesheet retry', cssIssues);
    const cssResponse = await cssPage.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
    assert(cssResponse?.ok(), `lazy Chamber stylesheet retry: dashboard failed with HTTP ${cssResponse?.status()}`);
    await waitForLauncherShell(cssPage);
    await cssPage.evaluate(() => {
      const category = document.querySelector('#chambers-grid > .chamber-category[data-chamber-category="people"]');
      category.dataset.chamberExpanded = 'true';
      category.querySelector(':scope > .chamber-category-head > .chamber-category-toggle')?.setAttribute('aria-expanded', 'true');
      const cards = category.querySelector(':scope > .chamber-category-cards');
      if (cards) cards.hidden = false;
      document.getElementById('ledger-flow-entry-card')?.dispatchEvent(new PointerEvent('pointerenter', {
        bubbles: true,
        pointerType: 'mouse'
      }));
    });
    await cssPage.waitForFunction(() => (
      !document.getElementById('ledger-flow-entry-card')?.hasAttribute('data-chamber-skeleton')
      && !document.getElementById('ledger-flow-css')
    ), null, { timeout: 15000 });
    assert(cssAttemptCount === 1, `lazy Chamber stylesheet first failure was not isolated: ${cssAttemptCount}`);
    await cssPage.locator('#ledger-flow-entry-card .chamber-expand-cue').click();
    await Promise.race([
      retryCssRequested,
      sleep(5000).then(() => { throw new Error('lazy Chamber stylesheet retry was not requested'); })
    ]);
    const beforeCssRelease = await cssPage.evaluate(() => ({
      modalExists: Boolean(document.getElementById('ledger-flow-modal')),
      linkExists: Boolean(document.getElementById('ledger-flow-css')),
      stylesheetReady: Boolean(document.getElementById('ledger-flow-css')?.sheet),
      bodyOverflow: document.body.style.overflow,
      htmlOverflow: document.documentElement.style.overflow
    }));
    assert(
      !beforeCssRelease.modalExists
        && beforeCssRelease.linkExists
        && !beforeCssRelease.stylesheetReady
        && beforeCssRelease.bodyOverflow !== 'hidden'
        && beforeCssRelease.htmlOverflow !== 'hidden',
      `lazy Chamber room became active before its retry stylesheet was ready: ${JSON.stringify(beforeCssRelease)}`
    );
    releaseRetryCss();
    await cssPage.locator('#ledger-flow-modal.active').waitFor({ state: 'visible', timeout: 15000 });
    const afterCssRelease = await cssPage.evaluate(() => ({
      cssAttemptCount: performance.getEntriesByName(document.getElementById('ledger-flow-css')?.href || '').length,
      stylesheetReady: Boolean(document.getElementById('ledger-flow-css')?.sheet),
      bodyOverflow: document.body.style.overflow,
      htmlOverflow: document.documentElement.style.overflow
    }));
    assert(
      cssAttemptCount === 2
        && afterCssRelease.stylesheetReady
        && afterCssRelease.bodyOverflow === 'hidden'
        && afterCssRelease.htmlOverflow === 'hidden',
      `lazy Chamber room did not wait for the successful stylesheet retry: ${JSON.stringify({ cssAttemptCount, afterCssRelease })}`
    );
    await cssPage.locator('#ledger-flow-modal.active .chamber-close').click();
    await cssPage.waitForFunction(() => (
      document.body.style.overflow !== 'hidden'
      && document.documentElement.style.overflow !== 'hidden'
    ), null, { timeout: 5000 });
    await cssContext.close();
    const unexpectedCssIssues = cssIssues.filter((issue) => !(
      /ledger-flow(?:\.min\.css| styles unavailable)/i.test(issue)
      && /request failed|Failed to load resource|styles unavailable/i.test(issue)
    ));
    assert(unexpectedCssIssues.length === 0, `lazy Chamber stylesheet retry browser issues:\n${unexpectedCssIssues.join('\n')}`);

    const routeRaceIssues = [];
    const routeRaceContext = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      serviceWorkers: 'block'
    });
    await installLazyInit(routeRaceContext);
    let releaseCapitalModule;
    let markCapitalModuleRequested;
    const capitalModuleRelease = new Promise((resolve) => { releaseCapitalModule = resolve; });
    const capitalModuleRequested = new Promise((resolve) => { markCapitalModuleRequested = resolve; });
    await routeRaceContext.route('**/js/features/capital-chamber.js*', async (route) => {
      const moduleResponse = await route.fetch();
      markCapitalModuleRequested();
      await capitalModuleRelease;
      await route.fulfill({ response: moduleResponse });
    });
    const routeRacePage = await routeRaceContext.newPage();
    attachIssueCollectors(routeRacePage, 'lazy Chamber rapid route cancellation', routeRaceIssues);
    const routeRaceResponse = await routeRacePage.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
    assert(routeRaceResponse?.ok(), `lazy Chamber route race: dashboard failed with HTTP ${routeRaceResponse?.status()}`);
    await waitForLauncherShell(routeRacePage);
    await routeRacePage.evaluate(() => { window.location.hash = 'capital'; });
    await Promise.race([
      capitalModuleRequested,
      sleep(5000).then(() => { throw new Error('lazy Chamber route race: delayed Capital module was not requested'); })
    ]);
    await routeRacePage.evaluate(() => { window.location.hash = 'minerals'; });
    await routeRacePage.locator('#minerals-modal.active').waitFor({ state: 'visible', timeout: 15000 });
    releaseCapitalModule();
    await routeRacePage.waitForTimeout(500);
    const routeRaceState = await routeRacePage.evaluate(() => ({
      hash: window.location.hash,
      activeModals: Array.from(document.querySelectorAll('.modal-overlay.active'), (modal) => modal.id),
      capitalActive: document.getElementById('capital-modal')?.classList.contains('active') || false,
      mineralsActive: document.getElementById('minerals-modal')?.classList.contains('active') || false
    }));
    assert(
      routeRaceState.hash === '#minerals'
        && routeRaceState.mineralsActive
        && !routeRaceState.capitalActive
        && routeRaceState.activeModals.length === 1,
      `lazy Chamber route race reopened a stale delayed room: ${JSON.stringify(routeRaceState)}`
    );

    await routeRacePage.evaluate(() => { window.location.hash = 'tezoscrp'; });
    await routeRacePage.locator('#tezoscrp-modal.active').waitFor({ state: 'visible', timeout: 15000 });
    await routeRacePage.waitForFunction(() => (
      document.querySelectorAll('.modal-overlay.active').length === 1
      && document.querySelector('#tezoscrp-modal')?.classList.contains('active')
    ), null, { timeout: 5000 });
    await routeRacePage.evaluate(() => { window.location.hash = 'minerals'; });
    await routeRacePage.waitForFunction(() => (
      document.querySelectorAll('.modal-overlay.active').length === 1
      && document.querySelector('#minerals-modal')?.classList.contains('active')
      && !document.querySelector('#tezoscrp-modal')?.classList.contains('active')
    ), null, { timeout: 15000 });
    const tezosCrpCleanupState = await routeRacePage.evaluate(() => ({
      activeModals: Array.from(document.querySelectorAll('.modal-overlay.active'), (modal) => modal.id),
      bodyOverflow: document.body.style.overflow,
      htmlOverflow: document.documentElement.style.overflow
    }));
    assert(
      tezosCrpCleanupState.activeModals.length === 1
        && tezosCrpCleanupState.activeModals[0] === 'minerals-modal'
        && tezosCrpCleanupState.bodyOverflow === 'hidden'
        && tezosCrpCleanupState.htmlOverflow === 'hidden',
      `lazy Chamber route cleanup left TezosCRP stacked or lost scroll ownership: ${JSON.stringify(tezosCrpCleanupState)}`
    );
    await routeRacePage.locator('#minerals-modal.active .chamber-close').click();
    await routeRaceContext.close();
    assert(routeRaceIssues.length === 0, `lazy Chamber route cancellation browser issues:\n${routeRaceIssues.join('\n')}`);

    assert(issues.length === 0, `lazy Chamber no-intent/focus browser issues:\n${issues.join('\n')}`);
    log('ok - deferred Chamber resources, focus-safe hydration, retries, stylesheet readiness, and stale-route cancellation smoke');
  }

  async function smokeChamberCategories(browser, baseUrl) {
    const hydrateDenseLayoutCards = async (page) => {
      await page.evaluate(() => {
        for (const selector of ['#tezoscrp-entry-card', '#maxis-entry-card']) {
          document.querySelector(selector)?.dispatchEvent(new PointerEvent('pointerenter', {
            bubbles: true,
            pointerType: 'mouse'
          }));
        }
      });
      await page.waitForFunction(() => (
        document.querySelectorAll('#tezoscrp-entry-card .tezoscrp-entry-identity-strip > span').length === 6
        && document.querySelectorAll('#maxis-entry-card [data-maxis-entry-identity]').length >= 6
      ), null, { timeout: 15000 });
    };

    const issues = [];
    const context = await browser.newContext({
      viewport: { width: 375, height: 812 },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(context);
    await context.addInitScript(() => {
      localStorage.setItem('tezos-systems-theme', 'matrix');
      localStorage.setItem('tezos-systems-stats-visible', 'true');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    });

    const page = await context.newPage();
    attachIssueCollectors(page, 'Chamber categories', issues);
    let response = await page.goto(`${baseUrl}/?theme=matrix#domains`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `Chamber categories direct hash failed with HTTP ${response?.status()}`);
    await page.locator('#tezos-domains-modal.active').waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForFunction(({ categoryCount, cardCount }) => (
      document.querySelectorAll('#chambers-grid > .chamber-category').length === categoryCount
      && document.querySelectorAll('#chambers-grid .stat-card').length === cardCount
    ), { categoryCount: EXPECTED_CHAMBER_CATEGORIES.length, cardCount: EXPECTED_CHAMBER_ORDER.length }, { timeout: 15000 });
    await assertChamberOrder(page, 'Chamber categories direct hash');

    const directHashState = await page.evaluate(() => ({
      active: document.querySelector('#tezos-domains-modal')?.classList.contains('active') || false,
      openCategories: Array.from(
        document.querySelectorAll('#chambers-grid > .chamber-category[data-chamber-expanded="true"]'),
        (category) => category.dataset.chamberCategory
      )
    }));
    assert(
      directHashState.active
        && directHashState.openCategories.join(',') === 'people',
      `direct #domains route must reveal People before opening its Chamber: ${JSON.stringify(directHashState)}`
    );

    await page.locator('#tezos-domains-modal.active .chamber-close').click();
    await page.locator('#tezos-domains-modal.active').waitFor({ state: 'hidden', timeout: 5000 });
    await hydrateDenseLayoutCards(page);
    const capitalSummary = page.locator('#chambers-grid > .chamber-category[data-chamber-category="capital"] > .chamber-category-head > .chamber-category-toggle');
    await page.evaluate(() => {
      const html = document.documentElement;
      const previousBehavior = html.style.scrollBehavior;
      html.style.scrollBehavior = 'auto';
      document.querySelector('#chambers-grid > .chamber-category[data-chamber-category="capital"] > .chamber-category-head > .chamber-category-toggle')
        ?.scrollIntoView({ block: 'center', behavior: 'auto' });
      html.style.scrollBehavior = previousBehavior;
    });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const toggleBefore = await page.evaluate(() => window.scrollY);
    await capitalSummary.click();
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const toggleAfter = await page.evaluate(() => {
      const category = document.querySelector('#chambers-grid > .chamber-category[data-chamber-category="capital"]');
      return {
        open: category?.dataset.chamberExpanded === 'true',
        focused: document.activeElement === category?.querySelector(':scope > .chamber-category-head > .chamber-category-toggle'),
        scrollY: window.scrollY
      };
    });
    assert(toggleAfter.open && toggleAfter.focused, `Capital disclosure did not stay open and focused: ${JSON.stringify(toggleAfter)}`);
    assert(Math.abs(toggleAfter.scrollY - toggleBefore) <= 2, `Capital disclosure toggle moved page scroll: ${JSON.stringify({ toggleBefore, toggleAfter })}`);
    await page.waitForFunction(() => {
      const staking = document.getElementById('staking-entry-card');
      return Boolean(
        staking
        && !staking.hasAttribute('data-chamber-skeleton')
        && staking.dataset.stakingWired === '1'
      );
    }, null, { timeout: 15000 });

    await page.evaluate(() => {
      const networkQuestion = document.querySelector(
        '#chambers-grid > .chamber-category[data-chamber-category="network"] .chamber-category-question'
      );
      const textNode = networkQuestion?.firstChild;
      const selection = window.getSelection();
      selection?.removeAllRanges();
      if (textNode?.nodeType === Node.TEXT_NODE && textNode.textContent) {
        const range = document.createRange();
        range.setStart(textNode, 0);
        range.setEnd(textNode, Math.min(7, textNode.textContent.length));
        selection?.addRange(range);
      }
      window.__chamberCategoryRegression = {
        categories: Array.from(document.querySelectorAll('#chambers-grid > .chamber-category')),
        staking: document.getElementById('staking-entry-card'),
        scrollY: window.scrollY,
        selection: selection?.toString() || ''
      };
      window.dispatchEvent(new CustomEvent('stats-updated', {
        detail: { stats: {}, source: 'hero' }
      }));
    });

    for (let passIndex = 0; passIndex < 2; passIndex += 1) {
      await page.evaluate(() => {
        const grid = document.getElementById('chambers-grid');
        const staking = document.getElementById('staking-entry-card');
        if (grid && staking) grid.appendChild(staking);
      });
      await page.waitForFunction((categoryCount) => (
        document.getElementById('staking-entry-card')?.closest('.chamber-category')?.dataset.chamberCategory === 'capital'
        && document.querySelectorAll('#chambers-grid > .chamber-category').length === categoryCount
      ), EXPECTED_CHAMBER_CATEGORIES.length, { timeout: 5000 });
    }

    const refreshState = await page.evaluate(() => {
      const saved = window.__chamberCategoryRegression;
      const categories = Array.from(document.querySelectorAll('#chambers-grid > .chamber-category'));
      const openCategories = categories.filter((category) => category.dataset.chamberExpanded === 'true').map((category) => category.dataset.chamberCategory);
      return {
        wrappersSame: categories.length === saved?.categories?.length
          && categories.every((category, index) => category === saved.categories[index]),
        stakingSame: document.getElementById('staking-entry-card') === saved?.staking,
        selection: window.getSelection()?.toString() || '',
        expectedSelection: saved?.selection || '',
        scrollDelta: Math.abs(window.scrollY - (saved?.scrollY || 0)),
        openCategories,
        categoryCount: categories.length,
        cardCount: document.querySelectorAll('#chambers-grid .stat-card').length,
        passiveAnimations: Array.from(document.querySelectorAll('#chambers-grid .chamber-entry-card:not(.chamber-entry-risk)'))
          .map((card) => ({
            id: card.id || card.dataset.stat || '',
            animationName: getComputedStyle(card, '::before').animationName
          }))
          .filter(({ animationName }) => animationName !== 'none')
      };
    });
    assert(refreshState.wrappersSame && refreshState.stakingSame, `Chamber organization replaced reusable category/card nodes: ${JSON.stringify(refreshState)}`);
    assert(refreshState.selection === refreshState.expectedSelection && refreshState.selection.length > 0, `Chamber organization lost reader selection: ${JSON.stringify(refreshState)}`);
    assert(refreshState.scrollDelta <= 1, `Chamber organization moved page scroll: ${JSON.stringify(refreshState)}`);
    assert(refreshState.openCategories.join(',') === 'capital,people', `background refresh reset disclosure state: ${JSON.stringify(refreshState)}`);
    assert(refreshState.categoryCount === EXPECTED_CHAMBER_CATEGORIES.length && refreshState.cardCount === EXPECTED_CHAMBER_ORDER.length, `late card organization duplicated categories or entries: ${JSON.stringify(refreshState)}`);
    assert(refreshState.passiveAnimations.length === 0, `ordinary freshness/live cards still animate their perimeter: ${JSON.stringify(refreshState.passiveAnimations)}`);

    response = await page.goto(`${baseUrl}/history/?theme=matrix`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `Chamber categories pretty route failed with HTTP ${response?.status()}`);
    await page.locator('#history-modal.active').waitFor({ state: 'visible', timeout: 15000 });
    assert(await page.locator('#chambers-grid').count() === 0, 'Direct History defers hidden home categories');
    await page.locator('#history-modal-close').click();
    await page.waitForFunction(() => document.documentElement.dataset.dashboardReady === 'true' && location.pathname === '/', null, { timeout: 30000 });
    assert(await page.locator('#chambers-grid > .chamber-category[data-chamber-category="history"]').getAttribute('data-chamber-expanded') === 'true', 'History return reveals its home category');

    await context.close();

    for (const { label, viewport } of [
      { label: 'tablet', viewport: { width: 768, height: 1024 } },
      { label: 'desktop', viewport: { width: 1440, height: 900 } }
    ]) {
      const layoutContext = await browser.newContext({ viewport, serviceWorkers: 'block' });
      await installFeatureMocks(layoutContext);
      await layoutContext.addInitScript(() => {
        localStorage.setItem('tezos-systems-theme', 'matrix');
        localStorage.setItem('tezos-systems-stats-visible', 'true');
        localStorage.setItem('tezos-toured', '1');
        localStorage.setItem('tezos-welcomed', '1');
        localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
      });
      const layoutPage = await layoutContext.newPage();
      attachIssueCollectors(layoutPage, `Chamber categories ${label}`, issues);
      const layoutResponse = await layoutPage.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
      assert(layoutResponse?.ok(), `Chamber categories ${label} failed with HTTP ${layoutResponse?.status()}`);
      await layoutPage.waitForFunction(({ categoryCount, cardCount }) => (
        document.querySelectorAll('#chambers-grid > .chamber-category').length === categoryCount
        && document.querySelectorAll('#chambers-grid .stat-card').length === cardCount
      ), { categoryCount: EXPECTED_CHAMBER_CATEGORIES.length, cardCount: EXPECTED_CHAMBER_ORDER.length }, { timeout: 15000 });
      await assertChamberOrder(layoutPage, `Chamber categories ${label}`);
      const defaultDisclosureState = await layoutPage.evaluate(() => Array.from(
        document.querySelectorAll('#chambers-grid > .chamber-category'),
        (category) => ({
          key: category.dataset.chamberCategory || '',
          open: category.dataset.chamberExpanded === 'true',
          visibleCards: category.querySelectorAll(':scope > .chamber-category-cards > .stat-card:not([hidden])').length
            ? Array.from(category.querySelectorAll(':scope > .chamber-category-cards > .stat-card')).filter((card) => card.getClientRects().length > 0).length
            : 0,
          countBorder: getComputedStyle(category.querySelector('.chamber-category-count')).borderTopColor,
          countBackground: getComputedStyle(category.querySelector('.chamber-category-count')).backgroundColor
        })
      ));
      assert(
        hasExpectedDefaultChamberDisclosure(defaultDisclosureState),
        `Chamber categories ${label} must open only Ecosystem by default ${JSON.stringify(defaultDisclosureState)}`
      );
      assert(
        defaultDisclosureState
          .filter((category) => !category.open)
          .every((category) => category.countBorder !== 'rgba(0, 0, 0, 0)' && category.countBackground !== 'rgba(0, 0, 0, 0)'),
        `Chamber categories ${label} closed room counts lost their visual invitation ${JSON.stringify(defaultDisclosureState)}`
      );
      await layoutPage.evaluate(() => {
        document.querySelectorAll('#chambers-grid > .chamber-category').forEach((category) => {
          category.dataset.chamberExpanded = 'true';
          category.querySelector(':scope > .chamber-category-head > .chamber-category-toggle')?.setAttribute('aria-expanded', 'true');
          const cards = category.querySelector(':scope > .chamber-category-cards');
          if (cards) cards.hidden = false;
        });
      });
      await hydrateDenseLayoutCards(layoutPage);
      const geometry = await layoutPage.evaluate(() => {
        const grid = document.querySelector('#chambers-grid');
        const cards = Array.from(document.querySelectorAll('#chambers-grid .chamber-category-cards > .stat-card'));
        const cardKey = (card) => card.id || card.dataset.stat || '';
        return {
          viewportWidth: innerWidth,
          gridWidth: grid?.getBoundingClientRect().width || 0,
          pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          allOpen: Array.from(document.querySelectorAll('#chambers-grid > .chamber-category')).every((category) => category.dataset.chamberExpanded === 'true'),
          cards: Object.fromEntries(cards.map((card) => {
            const front = card.querySelector('.card-front');
            const rect = card.getBoundingClientRect();
            return [cardKey(card), {
              layout: card.dataset.chamberLayout || '',
              width: rect.width,
              top: rect.top,
              bottom: rect.bottom,
              clipped: Boolean(front && front.scrollHeight > front.clientHeight + 4)
            }];
          }))
        };
      });
      assert(geometry.allOpen && !geometry.pageOverflow, `Chamber categories ${label} disclosure/overflow regression ${JSON.stringify(geometry)}`);
      assert(Object.values(geometry.cards).every((card) => !card.clipped), `Chamber categories ${label} clips launcher content ${JSON.stringify(geometry.cards)}`);
      if (label === 'tablet') {
        assert(
          Object.values(geometry.cards).every((card) => card.width >= geometry.gridWidth - 2),
          `Chamber categories tablet should give every launcher a full row ${JSON.stringify(geometry)}`
        );
      } else {
        const fullRowIds = [
          'network-pulse-entry-card',
          'capital-entry-card',
          'minerals-entry-card',
          'metals-entry-card',
          'ecosystem-entry-card',
          'lb-entry-card',
          'ledger-flow-entry-card',
          'tezos-domains-entry-card',
          'maxis-entry-card',
          'tezoscrp-entry-card'
        ];
        assert(fullRowIds.every((id) => geometry.cards[id]?.width >= geometry.gridWidth - 2), `Chamber categories desktop dense cards lost their full rows ${JSON.stringify(geometry)}`);
        assert(
          geometry.cards['whale-watch-entry-card']?.width > geometry.cards['staking-entry-card']?.width * 1.9
            && geometry.cards['baker-directory-entry-card']?.width > geometry.cards['tz4-adoption']?.width * 1.9,
          `Chamber categories desktop wide/compact rows are not balanced ${JSON.stringify(geometry.cards)}`
        );
        assert(
          Math.abs(geometry.cards['chamber-entry-card']?.width - geometry.cards['etherlink-governance-entry-card']?.width) <= 2
            && Math.abs(geometry.cards['chamber-entry-card']?.top - geometry.cards['etherlink-governance-entry-card']?.top) <= 2,
          `Chamber categories desktop L1/L2 governance row is uneven ${JSON.stringify(geometry.cards)}`
        );
      }
      await layoutContext.close();
    }

    assert(issues.length === 0, `Chamber categories browser issues:\n${issues.join('\n')}`);
    log('ok - responsive Chamber topics and 22 room preferences, Hide/Undo, recovery, route, tour, and first-paint smoke');
  }

  return { smokeStandaloneChamberBoot, smokeLauncherProjections, smokeLazyChamberLoading, smokeChamberCategories };
}
