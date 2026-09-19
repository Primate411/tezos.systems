// Browser workflows owned by tools. Shared dependencies remain explicit.
export function createToolsSmokeSuites({
  assert,
  assertAllSparklineLatestValues,
  assertLocatorCount,
  attachIssueCollectors,
  clickFeatureLauncher,
  ensureDropdownOpen,
  expectClassContains,
  expectCount,
  expectShareModal,
  installFeatureMocks,
  installShareActionMocks,
  log,
  waitForShareModal
}) {
  async function smokeFeatureWorkflows(browser, baseUrl, section = 'all') {
    const issues = [];
    if (section === 'all' || section === 'desktop') {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      serviceWorkers: 'block'
    });
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseUrl });
    await installFeatureMocks(context, { whaleChamberMocks: true });
    await context.addInitScript(() => {
      window.__smokeLatestStats = null;
      window.addEventListener('stats-updated', (event) => {
        if (event.detail?.stats) window.__smokeLatestStats = event.detail.stats;
      });
      localStorage.setItem('tezos-systems-theme', 'matrix');
      localStorage.setItem('tezos-systems-stats-visible', 'true');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
      localStorage.setItem('tezos-systems-leaderboard-visible', 'false');
      localStorage.setItem('tezos-systems-calc-visible', 'false');
      localStorage.setItem('tezos-systems-whale-enabled', 'false');
      localStorage.setItem('tezos-systems-giants-enabled', 'false');
      localStorage.setItem('tezos-systems-comparison-visible', 'false');
      localStorage.setItem('tezos-systems-pi-visible', 'false');
      localStorage.removeItem('tezos-systems-predictions');
      localStorage.removeItem('tezos-systems-price-alerts');
    });

    const page = await context.newPage();
    const pendingRequests = new Set();
    const startupRequests = [];
    page.on('request', (request) => pendingRequests.add(request.url()));
    page.on('requestfinished', (request) => {
      pendingRequests.delete(request.url());
      const url = request.url();
      if (/\/js\/core\/(?:app|api)\.js|\/v1\/(?:delegates|statistics\/current|head)|\/chains\/main\/blocks\//.test(url)) {
        startupRequests.push(url);
      }
    });
    page.on('requestfailed', (request) => pendingRequests.delete(request.url()));
    attachIssueCollectors(page, 'feature workflows', issues);
    const response = await page.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `feature workflows: dashboard failed with HTTP ${response?.status()}`);
    await page.locator('main').waitFor({ state: 'visible', timeout: 15000 });
    await page.evaluate(() => {
      document.querySelectorAll('#chambers-grid > .chamber-category').forEach((category) => {
        category.dataset.chamberExpanded = 'true';
        category.querySelector(':scope > .chamber-category-head > .chamber-category-toggle')?.setAttribute('aria-expanded', 'true');
        const cards = category.querySelector(':scope > .chamber-category-cards');
        if (cards) cards.hidden = false;
      });
    });
    try {
      await page.waitForFunction(() => document.querySelector('#staking-ratio-front')?.textContent?.trim() === '27.62%', null, { timeout: 30000 });
    } catch (error) {
      const stakingState = await page.evaluate(() => ({
        ratio: document.querySelector('#staking-ratio-front')?.textContent?.trim() || '',
        apy: document.querySelector('#staking-apy-front')?.textContent?.trim() || '',
        latestStats: window.__smokeLatestStats,
        readyState: document.readyState,
        appScript: document.querySelector('script[type="module"][src*="js/core/app.js"]')?.src || '',
        appResource: performance.getEntriesByType('resource').some((entry) => entry.name.includes('/js/core/app.js')),
        liveHeadWired: document.querySelector('#live-head-button')?.dataset.liveHeadWired || '',
        status: document.querySelector('#data-status')?.textContent?.replace(/\s+/g, ' ').trim() || ''
      }));
      throw new Error(`feature workflows staking telemetry did not settle ${JSON.stringify(stakingState)}; startup requests: ${JSON.stringify(startupRequests)}; pending requests: ${JSON.stringify([...pendingRequests])}; browser issues: ${issues.join(' | ') || 'none'}; ${error.message}`);
    }
    await page.waitForFunction(() => document.querySelector('#staking-apy-front')?.textContent?.trim() === '4.2% / 12.7%', null, { timeout: 10000 });
    await page.waitForFunction(() => /pp$/.test(document.querySelector('#staking-trend')?.textContent?.trim() || ''), null, { timeout: 10000 });
    await page.waitForFunction(() => {
      const price = document.querySelector('#price-bar .price-value')?.textContent?.trim() || '';
      const change24h = document.querySelector('#price-bar [data-price-change="24h"] .price-change-value')?.textContent?.trim() || '';
      const change7d = document.querySelector('#price-bar [data-price-change="7d"] .price-change-value')?.textContent?.trim() || '';
      const change30d = document.querySelector('#price-bar [data-price-change="30d"] .price-change-value')?.textContent?.trim() || '';
      const sats = document.querySelector('#price-btc')?.textContent?.trim() || '';
      const marketCap = document.querySelector('#price-bar .price-mcap')?.textContent?.trim() || '';
      return price === '$0.740'
        && change24h === '+2.5%'
        && change7d === '-4.2%'
        && change30d === '+9.8%'
        && sats === '700 sats'
        && marketCap === 'MCap $780M';
    }, null, { timeout: 10000 });
    const priceChangeState = await page.evaluate(() => ({
      labels: Array.from(document.querySelectorAll('#price-bar [data-price-change]')).map((node) => node.getAttribute('aria-label')),
      periods: Array.from(document.querySelectorAll('#price-bar .price-change-period')).map((node) => node.textContent?.trim()),
      visible: Array.from(document.querySelectorAll('#price-bar [data-price-change]')).map((node) => getComputedStyle(node).display !== 'none')
    }));
    assert(
      priceChangeState.periods.join(',') === '24H,7D,30D'
        && priceChangeState.visible.every(Boolean)
        && priceChangeState.labels.every((label) => /XTZ .* price change [+-]\d+\.\d%/.test(label || '')),
      `feature workflows price horizons mismatch: ${JSON.stringify(priceChangeState)}`
    );
    const priceLinks = await page.evaluate(() => ({
      coinGecko: document.querySelector('#price-bar .price-link')?.href || '',
      stake: document.querySelector('#price-bar .price-cta[title="Stake XTZ"]')?.href || '',
      bake: document.querySelector('#price-bar .price-cta[title="Bake on Tezos"]')?.href || ''
    }));
    assert(priceLinks.coinGecko === 'https://www.coingecko.com/en/coins/tezos', `feature workflows price bar CoinGecko link mismatch: ${priceLinks.coinGecko}`);
    assert(priceLinks.stake === 'https://gov.tez.capital/', `feature workflows price bar stake link mismatch: ${priceLinks.stake}`);
    assert(priceLinks.bake === 'https://docs.tez.capital/', `feature workflows price bar bake link mismatch: ${priceLinks.bake}`);
    await page.waitForFunction(() => /^\d+$/.test(document.querySelector('#hero-chain-uptime-bakers')?.textContent?.trim() || ''), null, { timeout: 10000 });
    const mainTopBeforeExplain = await page.evaluate(() => document.querySelector('main.main-content')?.getBoundingClientRect().top || 0);
    const topBakersPill = page.locator('#top-continuity-panel .top-continuity-stat[data-card-history="total-bakers"]');
    await topBakersPill.click();
    await page.locator('#top-continuity-panel > #top-continuity-explain.is-visible').waitFor({ state: 'visible', timeout: 5000 });
    await page.waitForFunction(() => {
      const roster = document.querySelector('#top-continuity-baker-roster');
      const horizons = document.querySelector('[data-top-continuity-horizons]');
      return roster?.getAttribute('aria-busy') === 'false'
        && roster.querySelectorAll('.top-continuity-baker-list').length === 2
        && roster.querySelectorAll('.top-continuity-baker-row').length === 6
        && horizons?.getAttribute('aria-busy') === 'false'
        && horizons.querySelectorAll('.top-continuity-horizon').length === 3;
    }, null, { timeout: 10000 });
    const topExplainState = await page.evaluate((beforeTop) => {
      const panel = document.querySelector('#top-continuity-panel');
      const pill = panel?.querySelector('.top-continuity-stat[data-card-history="total-bakers"]');
      const popover = panel?.querySelector(':scope > #top-continuity-explain');
      const panelRect = panel?.getBoundingClientRect();
      const pillRect = pill?.getBoundingClientRect();
      const popoverRect = popover?.getBoundingClientRect();
      const mainTopAfter = document.querySelector('main.main-content')?.getBoundingClientRect().top || 0;
      return {
        active: pill?.classList.contains('is-explaining') || false,
        ariaControls: pill?.getAttribute('aria-controls') || '',
        ariaExpanded: pill?.getAttribute('aria-expanded') || '',
        ariaHidden: popover?.getAttribute('aria-hidden') || '',
        chartButton: Boolean(popover?.querySelector('[data-open-card-history="total-bakers"]')),
        chamberButton: popover?.querySelector('[data-open-top-continuity-chamber]')?.dataset.openTopContinuityChamber || '',
        chamberLabel: popover?.querySelector('[data-open-top-continuity-chamber]')?.getAttribute('aria-label') || '',
        primaryActions: Array.from(popover?.querySelectorAll('.top-continuity-explain-actions > button') || []).map((button) => button.textContent?.trim() || ''),
        closeButton: Boolean(popover?.querySelector('[data-close-top-continuity-explain]')),
        insidePanel: Boolean(panel && popover && popover.parentElement === panel),
        mainDelta: Math.abs(mainTopAfter - beforeTop),
        popoverBelowPanel: Boolean(panelRect && popoverRect && popoverRect.top >= panelRect.bottom - 2),
        popoverCompact: Boolean(popoverRect && popoverRect.width <= 390),
        popoverText: popover?.textContent || '',
        popoverTintsFromPill: Boolean(pillRect && popoverRect && popoverRect.left < pillRect.right && popoverRect.right > pillRect.left),
        role: popover?.getAttribute('role') || '',
        listCounts: Array.from(popover?.querySelectorAll('.top-continuity-baker-list') || []).map((list) => list.querySelectorAll('.top-continuity-baker-row').length),
        ages: Array.from(popover?.querySelectorAll('.top-continuity-baker-row time') || []).map((time) => time.textContent?.trim() || ''),
        domains: Array.from(popover?.querySelectorAll('.top-continuity-baker-identity strong') || []).map((name) => name.textContent?.trim() || ''),
        sizes: Array.from(popover?.querySelectorAll('[data-baker-size]') || []).map((badge) => badge.dataset.bakerSize || ''),
        sizeLabels: Array.from(popover?.querySelectorAll('[data-baker-size]') || []).map((badge) => badge.getAttribute('aria-label') || ''),
        entryKinds: Array.from(popover?.querySelectorAll('.top-continuity-baker-row.is-gained') || []).map((row) => row.dataset.bakerEntry || ''),
        entryBadges: Array.from(popover?.querySelectorAll('.top-continuity-baker-new') || []).map((badge) => badge.textContent?.trim() || ''),
        horizonLabels: Array.from(popover?.querySelectorAll('.top-continuity-horizon > span') || []).map((label) => label.textContent?.trim() || ''),
        horizonValues: Array.from(popover?.querySelectorAll('.top-continuity-horizon strong') || []).map((value) => value.textContent?.trim() || ''),
        saveActions: popover?.querySelectorAll('[data-baker-set-save-address]').length || 0,
        tzktLinks: Array.from(popover?.querySelectorAll('.top-continuity-baker-actions a[href^="https://tzkt.io/"]') || []).map((link) => link.href),
        freshness: popover?.querySelector('[data-baker-set-status]')?.textContent?.trim() || ''
      };
    }, mainTopBeforeExplain);
    assert(topExplainState.insidePanel && topExplainState.popoverBelowPanel, `feature workflows top pill explainer should be anchored inside the continuity panel: ${JSON.stringify(topExplainState)}`);
    assert(topExplainState.mainDelta <= 1, `feature workflows top pill explainer caused layout shift: ${JSON.stringify(topExplainState)}`);
    assert(topExplainState.active && topExplainState.ariaControls === 'top-continuity-explain' && topExplainState.ariaExpanded === 'true', `feature workflows top pill active ARIA mismatch: ${JSON.stringify(topExplainState)}`);
    assert(topExplainState.ariaHidden === 'false' && topExplainState.role === 'region', `feature workflows top pill popover disclosure state mismatch: ${JSON.stringify(topExplainState)}`);
    assert(topExplainState.closeButton
      && topExplainState.chartButton
      && topExplainState.chamberButton === 'leaderboard'
      && topExplainState.chamberLabel === 'Open Baker Directory'
      && topExplainState.primaryActions.join(',') === 'Open all-time chart,Baker Directory →', `feature workflows top pill popover controls missing or out of order: ${JSON.stringify(topExplainState)}`);
    assert(/Baker set/.test(topExplainState.popoverText) && /Open all-time chart/.test(topExplainState.popoverText) && /Baker Directory/.test(topExplainState.popoverText), `feature workflows top pill popover copy mismatch: ${topExplainState.popoverText}`);
    assert(topExplainState.popoverCompact && topExplainState.popoverTintsFromPill, `feature workflows top pill popover geometry mismatch: ${JSON.stringify(topExplainState)}`);
    assert(topExplainState.listCounts.join(',') === '3,3'
      && topExplainState.ages[0] === '1d'
      && topExplainState.ages[2] === '≤7d'
      && topExplainState.domains.includes('qa-baker.tez')
      && topExplainState.domains.includes('retired-baker.tez')
      && topExplainState.domains.includes('Former Baker')
      && /New \+ Reactivated/i.test(topExplainState.popoverText)
      && /active set entered/i.test(topExplainState.popoverText)
      && /Closed Bakers/i.test(topExplainState.popoverText)
      && /active set left/i.test(topExplainState.popoverText), `feature workflows baker right-change lists mismatch: ${JSON.stringify(topExplainState)}`);
    assert(topExplainState.sizes.join(',') === 'large,medium,small,small,medium,large'
      && topExplainState.sizeLabels.every((label) => /baker, .*% of (current network baking power|network baking power one year before closure)/.test(label)), `feature workflows baker size tiers mismatch: ${JSON.stringify(topExplainState)}`);
    assert(topExplainState.entryKinds.join(',') === 'new,reactivated,new'
      && topExplainState.entryBadges.join(',') === 'NEW,REACTIVATED,NEW', `feature workflows baker new/reactivated classification mismatch: ${JSON.stringify(topExplainState)}`);
    assert(topExplainState.horizonLabels.join(',') === '7D,30D,90D'
      && topExplainState.horizonValues.every((value) => value !== '—' && /^[-+−]?\d[\d,]*$/.test(value)), `feature workflows baker horizon changes mismatch: ${JSON.stringify(topExplainState)}`);
    assert(topExplainState.saveActions === 6
      && topExplainState.tzktLinks.length === 6
      && /^Live /.test(topExplainState.freshness), `feature workflows baker right-change actions or provenance mismatch: ${JSON.stringify(topExplainState)}`);
    await page.locator('#top-continuity-baker-roster [data-baker-set-save-address]').first().click();
    await page.waitForFunction(() => {
      const saved = JSON.parse(localStorage.getItem('tezos-systems-saved-addresses') || '[]');
      const action = document.querySelector('#top-continuity-baker-roster [data-baker-set-my-address]');
      return saved.length === 1 && action?.textContent?.trim() === 'My';
    }, null, { timeout: 5000 });
    const savedBakerState = await page.evaluate(() => ({
      entries: JSON.parse(localStorage.getItem('tezos-systems-saved-addresses') || '[]'),
      href: document.querySelector('#top-continuity-baker-roster [data-baker-set-my-address]')?.getAttribute('href') || '',
      status: document.querySelector('#top-continuity-baker-roster [data-baker-set-status]')?.textContent?.trim() || ''
    }));
    assert(savedBakerState.entries.length === 1
      && savedBakerState.entries[0].label === 'qa-baker.tez'
      && savedBakerState.href.includes('#my-baker=')
      && /saved to My Tezos/.test(savedBakerState.status), `feature workflows baker My Tezos save mismatch: ${JSON.stringify(savedBakerState)}`);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => {
      const popover = document.querySelector('#top-continuity-explain');
      return popover && !popover.classList.contains('is-visible') && popover.getAttribute('aria-hidden') === 'true';
    }, null, { timeout: 5000 });
    await page.waitForFunction(() => {
      const popover = document.querySelector('#top-continuity-explain');
      if (!popover) return false;
      const style = getComputedStyle(popover);
      return Number.parseFloat(style.opacity) <= 0.01 && style.pointerEvents === 'none';
    }, null, { timeout: 5000 });
    const escapeState = await page.evaluate(() => {
      const pill = document.querySelector('#top-continuity-panel .top-continuity-stat[data-card-history="total-bakers"]');
      const popover = document.querySelector('#top-continuity-explain');
      const popoverStyle = popover ? getComputedStyle(popover) : null;
      return {
        activeElementKey: document.activeElement?.dataset?.cardHistory || '',
        ariaExpanded: pill?.getAttribute('aria-expanded') || '',
        inert: popover?.inert || false,
        opacity: Number.parseFloat(popoverStyle?.opacity || '1'),
        pointerEvents: popoverStyle?.pointerEvents || '',
        selected: pill?.classList.contains('is-explaining') || false,
        tabStopsDisabled: Array.from(popover?.querySelectorAll('button, a[href]') || []).every((control) => control.tabIndex === -1)
      };
    });
    assert(escapeState.activeElementKey === 'total-bakers' && escapeState.ariaExpanded === 'false' && !escapeState.selected && escapeState.inert && escapeState.opacity <= 0.01 && escapeState.pointerEvents === 'none' && escapeState.tabStopsDisabled, `feature workflows top pill Escape close mismatch: ${JSON.stringify(escapeState)}`);
    await topBakersPill.click();
    await page.locator('#top-continuity-panel > #top-continuity-explain.is-visible [data-open-card-history="total-bakers"]').click();
    await page.locator('#card-history-modal.active').waitFor({ state: 'visible', timeout: 10000 });
    await expectClassContains(page.locator('#card-history-modal .card-history-range-btn[data-range="all"]'), 'active', 'feature workflows top pill chart opens all-time range');
    const topExplainChartState = await page.evaluate(() => ({
      explainerVisible: document.querySelector('#top-continuity-explain')?.classList.contains('is-visible') || false,
      title: document.querySelector('#card-history-modal .card-history-title')?.textContent || ''
    }));
    assert(!topExplainChartState.explainerVisible && /Total Bakers/.test(topExplainChartState.title), `feature workflows top pill chart CTA mismatch: ${JSON.stringify(topExplainChartState)}`);
    await page.locator('#card-history-close').click();
    await page.locator('#card-history-modal[aria-hidden="true"]').waitFor({ state: 'attached', timeout: 5000 });
    await topBakersPill.click();
    await page.locator('#top-continuity-panel > #top-continuity-explain.is-visible [data-open-top-continuity-chamber="leaderboard"]').click();
    await page.waitForURL((url) => url.pathname === '/leaderboard/', { timeout: 10000 });
    await page.locator('#baker-directory-modal.active').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('#baker-directory-modal.active #baker-directory-title').waitFor({ state: 'visible', timeout: 15000 });
    const topExplainChamberState = await page.evaluate(() => ({
      explainerVisible: document.querySelector('#top-continuity-explain')?.classList.contains('is-visible') || false,
      route: window.location.pathname,
      chamberTitle: document.querySelector('#baker-directory-modal.active #baker-directory-title')?.textContent?.trim() || ''
    }));
    assert(!topExplainChamberState.explainerVisible
      && topExplainChamberState.route === '/leaderboard/'
      && /Baker Directory/.test(topExplainChamberState.chamberTitle), `feature workflows top pill Chamber CTA mismatch: ${JSON.stringify(topExplainChamberState)}`);
    await page.locator('#baker-directory-modal.active .chamber-close').click();
    await page.waitForURL((url) => url.pathname === '/', { timeout: 5000 });
    await page.locator('#baker-directory-modal.active').waitFor({ state: 'hidden', timeout: 5000 });
    for (const { metricKey, chamberEntry, chamberLabel, hasTrends } of [
      { metricKey: 'finality', chamberEntry: 'health', chamberLabel: 'Open Network Health', hasTrends: false },
      { metricKey: 'staking-ratio', chamberEntry: 'staking-chamber', chamberLabel: 'Open Staking', hasTrends: true },
      { metricKey: 'issuance-rate', chamberEntry: 'staking-chamber', chamberLabel: 'Open Staking', hasTrends: true }
    ]) {
      const metricPill = page.locator(`#top-continuity-panel .top-continuity-stat[data-card-history="${metricKey}"]`);
      await metricPill.click();
      await page.waitForFunction(({ key, waitForTrends }) => {
        const explain = document.querySelector('#top-continuity-explain.is-visible');
        const horizons = explain?.querySelector('[data-top-continuity-horizons]');
        return document.querySelector(`.top-continuity-stat[data-card-history="${key}"]`)?.classList.contains('is-explaining')
          && (!waitForTrends || (
            horizons?.getAttribute('aria-busy') === 'false'
            && horizons.querySelectorAll('.top-continuity-horizon strong').length === 3
          ));
      }, { key: metricKey, waitForTrends: hasTrends }, { timeout: 5000 });
      const metricHorizonState = await page.evaluate(() => ({
        labels: Array.from(document.querySelectorAll('#top-continuity-explain .top-continuity-horizon > span')).map((node) => node.textContent?.trim() || ''),
        values: Array.from(document.querySelectorAll('#top-continuity-explain .top-continuity-horizon strong')).map((node) => node.textContent?.trim() || ''),
        chamberEntry: document.querySelector('#top-continuity-explain [data-open-top-continuity-chamber]')?.dataset.openTopContinuityChamber || '',
        chamberLabel: document.querySelector('#top-continuity-explain [data-open-top-continuity-chamber]')?.getAttribute('aria-label') || ''
      }));
      assert(metricHorizonState.chamberEntry === chamberEntry
        && metricHorizonState.chamberLabel === chamberLabel, `feature workflows ${metricKey} Chamber handoff mismatch: ${JSON.stringify(metricHorizonState)}`);
      if (hasTrends) {
        assert(metricHorizonState.labels.join(',') === '7D,30D,90D'
          && metricHorizonState.values.every((value) => /^[-+−]?\d+\.\d{2} pp$/.test(value)), `feature workflows ${metricKey} horizon changes mismatch: ${JSON.stringify(metricHorizonState)}`);
      }
      if (metricKey === 'staking-ratio') {
        await page.locator('#top-continuity-explain.is-visible [data-open-top-continuity-chamber="staking-chamber"]').click();
        await page.waitForURL((url) => url.pathname === '/stake/', { timeout: 10000 });
        await page.locator('#staking-chamber-modal.active #staking-chamber-title').waitFor({ state: 'visible', timeout: 15000 });
        const stakingHandoffState = await page.evaluate(() => ({
          explainerVisible: document.querySelector('#top-continuity-explain')?.classList.contains('is-visible') || false,
          route: window.location.pathname,
          title: document.querySelector('#staking-chamber-modal.active #staking-chamber-title')?.textContent?.trim() || ''
        }));
        assert(!stakingHandoffState.explainerVisible
          && stakingHandoffState.route === '/stake/'
          && stakingHandoffState.title === 'Staking Chamber', `feature workflows staking destination action mismatch: ${JSON.stringify(stakingHandoffState)}`);
        await page.locator('#staking-chamber-modal.active .chamber-close').click();
        await page.waitForURL((url) => url.pathname === '/', { timeout: 5000 });
        await page.locator('#staking-chamber-modal.active').waitFor({ state: 'hidden', timeout: 5000 });
      } else {
        await page.locator('[data-close-top-continuity-explain]').click();
      }
    }
    await page.waitForFunction(() => (
      window.location.pathname === '/'
        && document.readyState === 'complete'
        && typeof window.TezosStats?.refresh === 'function'
    ), null, { timeout: 10000 });
    log('ok - feature workflow: top pill explainer popover');
    await page.evaluate(async () => {
      localStorage.setItem('tezos-systems-pi-visible', 'false');
      document.querySelector('#price-intelligence')?.remove();
      await window.TezosStats.refresh();
    });
    const priceIntelAfterRefresh = await page.evaluate(() => ({
      exists: Boolean(document.querySelector('#price-intelligence')),
      active: document.querySelector('#price-intel-toggle')?.classList.contains('active') || false,
      stored: localStorage.getItem('tezos-systems-pi-visible')
    }));
    assert(!priceIntelAfterRefresh.exists, `feature workflows refresh should not open price intelligence when deselected: ${JSON.stringify(priceIntelAfterRefresh)}`);
    assert(!priceIntelAfterRefresh.active && priceIntelAfterRefresh.stored === 'false', `feature workflows price intelligence toggle drifted while deselected: ${JSON.stringify(priceIntelAfterRefresh)}`);
    log('ok - feature workflow: price bar');
    await assertAllSparklineLatestValues(page, 'feature workflows');
    log('ok - all sparkline card latest values match live stats');
    log('ok - staking ratio and APY use TzKT total staked with pp trend');

    await clickFeatureLauncher(page, '#leaderboard-toggle');
    await page.locator('#baker-directory-modal.active').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('#baker-directory-tab-directory').click();
    await expectCount(page, '#baker-directory-panel .baker-directory-table tbody tr', 3, 'feature workflows Baker Directory rows');
    await page.locator('#baker-directory-panel [data-bdc-sort="name"]').click();
    assert(await page.locator('#baker-directory-panel thead th').nth(0).getAttribute('aria-sort') === 'ascending', 'feature workflows Baker Directory name sort should expose ascending aria-sort');
    await page.locator('#baker-directory-panel [data-bdc-select]').first().click();
    await page.locator('#baker-directory-panel .baker-directory-detail').waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('#baker-directory-panel [data-bdc-open-profile]').click();
    await page.locator('#my-tezos-drawer.open').waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('#drawer-close').click();
    log('ok - feature workflow: Baker Directory Chamber');

    await clickFeatureLauncher(page, '#calc-toggle');
    await page.locator('#calculator-section.visible').waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('#calc-amount').fill('10000');
    await page.waitForFunction(() => document.querySelector('#calc-yearly-xtz')?.textContent?.trim() === 'Add assumption', null, { timeout: 8000 });
    await page.locator('#calc-delegate-payout-assumption').fill('80');
    await page.waitForFunction(() => {
      const text = document.querySelector('#calc-yearly-xtz')?.textContent?.trim() || '';
      return /ꜩ/.test(text) && !/Add assumption/.test(text);
    }, null, { timeout: 8000 });
    await page.locator('#calc-mode-toggle [data-mode="stake"]').click();
    await expectClassContains(page.locator('#calc-mode-toggle [data-mode="stake"]'), 'calc-toggle-active', 'feature workflows stake mode');
    await page.waitForFunction(() => document.querySelector('#calc-yearly-xtz')?.textContent?.trim() === 'Add assumption', null, { timeout: 8000 });
    await page.locator('#calc-stake-edge-assumption').fill('10');
    await page.waitForFunction(() => /ꜩ/.test(document.querySelector('#calc-yearly-xtz')?.textContent || ''), null, { timeout: 8000 });
    await page.locator('#calc-mode-toggle [data-mode="baker"]').click();
    await page.locator('#calc-baker-fields').waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('#calc-ext-staked').fill('50000');
    await page.locator('#calc-ext-delegated').fill('250000');
    await page.locator('#calc-staking-fee').fill('0');
    await page.locator('#calc-deleg-payout').fill('0');
    await page.waitForFunction(() => {
      const text = document.querySelector('#calc-baker-breakdown')?.textContent || '';
      return text.includes('External-staker edge (0% kept)') && text.includes('Delegation (keep 100% of rewards)');
    }, null, { timeout: 8000 });
    await page.waitForTimeout(750);
    const bakerBreakdownText = await page.locator('#calc-baker-breakdown').innerText();
    assert(bakerBreakdownText.includes('External-staker edge (0% kept)') && bakerBreakdownText.includes('Delegation (keep 100% of rewards)'), `feature workflows calculator should preserve valid 0% assumptions: ${bakerBreakdownText}`);
    log('ok - feature workflow: calculator modes');

    await clickFeatureLauncher(page, '#price-intel-toggle');
    await page.locator('#price-intelligence').waitFor({ state: 'visible', timeout: 10000 });
    await expectCount(page, '#price-intelligence .pi-card', 1, 'feature workflows price intelligence card');
    await page.locator('#pi-btn-higher').click();
    await expectClassContains(page.locator('#pi-btn-higher'), 'active-higher', 'feature workflows price prediction');
    await page.locator('#pi-alert-price').fill('0.90');
    await page.locator('#pi-alert-set').click();
    await page.waitForFunction(() => document.querySelector('.pi-alert-count')?.textContent?.trim() === '1/5 active', null, { timeout: 5000 });
    log('ok - feature workflow: price intelligence');

    await clickFeatureLauncher(page, '#comparison-toggle');
    await page.locator('#comparison-section.visible').waitFor({ state: 'visible', timeout: 5000 });
    await expectCount(page, '#comparison-summary .comparison-standing-card', 5, 'feature workflows comparison standing cards');
    await expectCount(page, '#comparison-grid .comparison-card', 5, 'feature workflows comparison cards');
    log('ok - feature workflow: comparison');

    await clickFeatureLauncher(page, '#whale-toggle');
    await page.locator('#whale-watch-modal.active #whale-watch-panel-overview').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('#whale-watch-tab-live').click();
    await page.locator('#whale-watch-live-tape .whale-watch-tape-row').first().waitFor({ state: 'visible', timeout: 10000 });
    assert((await page.locator('#whale-watch-live-tape').innerText()).includes('QA Baker'), 'feature workflows Whale Watch tape missing mocked sender');
    await page.locator('#whale-watch-tab-dormant').click();
    assert((await page.locator('#whale-watch-panel-dormant').innerText()).includes('Deep Vault'), 'feature workflows Whale Watch Deep Sleep missing shared dormant account');
    await page.locator('#whale-watch-modal .chamber-close').click();
    log('ok - feature workflow: Whale Watch Chamber');

    await page.evaluate(() => {
      window.__featureWorkflowCycleOpenCue = document.querySelector('#cycle-history-entry-card [aria-label="Open Cycle History Chamber"]');
    });
    await clickFeatureLauncher(page, '#history-btn');
    await page.locator('#history-modal[aria-hidden="false"]').waitFor({ state: 'attached', timeout: 10000 });
    await expectCount(page, '#history-modal .time-range-btn', 4, 'feature workflows history ranges');
    await page.waitForFunction(() => document.querySelectorAll('#history-digest .history-digest-card').length === 7, null, { timeout: 10000 });
    await expectCount(page, '#history-copy-link[data-copy-hash="#history"]', 1, 'feature workflows history direct copy link');
    await page.locator('#history-copy-link').click();
    await page.waitForFunction(() => document.querySelector('#history-copy-link')?.textContent?.trim() === '✓', null, { timeout: 3000 });
    const historyCopy = await page.evaluate(() => navigator.clipboard.readText?.());
    assert(historyCopy.endsWith('/history/'), `feature workflows history copy link mismatch: ${historyCopy}`);
    const historyDigestDisclosure = page.locator('#history-modal details[data-quiet-key="history-digest"]');
    assert(!(await historyDigestDisclosure.evaluate(node => node.open)), 'feature workflows history digest should start collapsed');
    await historyDigestDisclosure.locator('summary').click();
    const digestText = (await page.locator('#history-digest').innerText()).toLowerCase();
    for (const expected of ['Consensus', 'Economy', 'Liquidity Baking', 'Market', 'Network Health', 'Tezos X', 'Governance']) {
      assert(digestText.includes(expected.toLowerCase()), `feature workflows history digest missing ${expected}: ${digestText}`);
    }
    const governanceHistorySection = page.locator('#chart-governance-participation').locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " chart-section ")]');
    await expectClassContains(governanceHistorySection, 'is-empty', 'feature workflows governance history quiet-state');
    const governanceHistoryText = (await governanceHistorySection.locator('.history-chart-empty').innerText()).toLowerCase();
    assert(governanceHistoryText.includes('no ballot samples'), `feature workflows governance history should explain quiet participation data, saw: ${governanceHistoryText}`);
    await page.locator('#history-modal .time-range-btn[data-range="24h"]').click();
    await expectClassContains(page.locator('#history-modal .time-range-btn[data-range="24h"]'), 'active', 'feature workflows history range');
    await page.waitForFunction(() => document.querySelector('#history-digest')?.textContent?.includes('24h'), null, { timeout: 5000 });
    await page.locator('#history-share-btn').click();
    await expectShareModal(page, 'feature workflows historical data share', issues);
    await page.keyboard.press('Escape');
    await page.locator('#history-modal[aria-hidden="true"]').waitFor({ state: 'attached', timeout: 5000 });
    await page.waitForFunction(() => document.activeElement === window.__featureWorkflowCycleOpenCue, null, { timeout: 2000 });
    const historyFocusState = await page.evaluate(() => {
      const active = document.activeElement;
      const rect = active?.getBoundingClientRect?.();
      return {
        ariaLabel: active?.getAttribute?.('aria-label') || '',
        connected: Boolean(active?.isConnected),
        exactLauncher: active === window.__featureWorkflowCycleOpenCue,
        id: active?.id || '',
        tag: active?.tagName || '',
        className: typeof active?.className === 'string' ? active.className : '',
        visible: Boolean(rect && rect.width > 0 && rect.height > 0)
      };
    });
    assert(
      historyFocusState.exactLauncher
        && historyFocusState.connected
        && historyFocusState.tag === 'BUTTON'
        && historyFocusState.ariaLabel === 'Open Cycle History Chamber'
        && historyFocusState.visible,
      `feature workflows history Escape should restore focus to the exact connected Open button ${JSON.stringify(historyFocusState)}`
    );
    log('ok - feature workflow: Cycle History Chamber');

    await page.evaluate(() => {
      window.location.hash = 'section=consensus';
    });
    await page.waitForFunction(() => {
      const section = document.querySelector('#consensus-section');
      return section && getComputedStyle(section).display !== 'none';
    }, null, { timeout: 10000 });
    await page.locator('[data-stat="total-bakers"]').scrollIntoViewIfNeeded();
    await page.locator('[data-stat="total-bakers"] .card-history-btn').click({ force: true });
    await page.locator('#card-history-modal.active').waitFor({ state: 'visible', timeout: 10000 });
    assert((await page.locator('#card-history-modal .card-history-title').innerText()).includes('Total Bakers'), 'feature workflows card history title mismatch');
    await expectCount(page, '#card-history-modal .card-history-range-btn', 4, 'feature workflows card history ranges');
    await expectClassContains(page.locator('#card-history-modal .card-history-range-btn[data-range="30d"]'), 'active', 'feature workflows card history default range');
    await page.locator('#card-history-modal .card-history-chart canvas').waitFor({ state: 'visible', timeout: 10000 });
    const initialCardHistoryChartId = await page.evaluate(() => String(window.Chart?.getChart(document.getElementById('card-history-canvas'))?.id ?? ''));
    await page.locator('#card-history-modal .card-history-range-btn[data-range="90d"]').click();
    await expectClassContains(page.locator('#card-history-modal .card-history-range-btn[data-range="90d"]'), 'active', 'feature workflows card history 90d range');
    const ninetyDayCardHistoryChartId = await page.waitForFunction((previousId) => {
      const modal = document.querySelector('#card-history-modal');
      const canvas = document.getElementById('card-history-canvas');
      const chart = canvas ? window.Chart?.getChart(canvas) : null;
      return modal?.dataset.cardHistoryRange === '90d' && chart && String(chart.id) !== previousId
        ? String(chart.id)
        : false;
    }, initialCardHistoryChartId, { timeout: 10000 });
    await page.locator('#card-history-modal .card-history-range-btn[data-range="all"]').click();
    await expectClassContains(page.locator('#card-history-modal .card-history-range-btn[data-range="all"]'), 'active', 'feature workflows card history all-time range');
    await page.waitForFunction((previousId) => {
      const modal = document.querySelector('#card-history-modal');
      const canvas = document.getElementById('card-history-canvas');
      const chart = canvas ? window.Chart?.getChart(canvas) : null;
      return modal?.dataset.cardHistoryRange === 'all' && chart && String(chart.id) !== previousId;
    }, await ninetyDayCardHistoryChartId.jsonValue(), { timeout: 10000 });
    await page.locator('#card-history-close').click();
    await page.locator('#card-history-modal[aria-hidden="true"]').waitFor({ state: 'attached', timeout: 5000 });
    await expectCount(page, '[data-stat="staking-apy"] .card-history-btn', 1, 'feature workflows staking APY card history');
    await expectCount(page, '[data-stat="delegated"] .card-history-btn', 1, 'feature workflows delegated card history');
    await expectCount(page, '[data-stat="total-burned"] .card-history-btn', 1, 'feature workflows total burned card history');
    await expectCount(page, '[data-stat="baking-power"] .card-history-btn', 1, 'feature workflows baking power card history');
    log('ok - feature workflow: card history');

    await page.locator('#protocol-history-entry-card').scrollIntoViewIfNeeded();
    await page.locator('#protocol-history-entry-card .chamber-expand-cue').click();
    await page.locator('#protocol-history-chamber-modal .protocol-anthology-tools > summary').click();
    await page.locator('#protocol-history-chamber-modal.active #upgrade-timeline .timeline-item[data-protocol="Quebec"]').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('.timeline-share-btn').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('.timeline-share-btn').click();
    await expectShareModal(page, 'feature workflows protocol timeline share', issues);
    log('ok - feature workflow: protocol timeline share');

    const quebecProtocolLetter = page.locator('#protocol-history-chamber-modal #upgrade-timeline .timeline-item[data-protocol="Quebec"]');
    await quebecProtocolLetter.scrollIntoViewIfNeeded();
    await quebecProtocolLetter.hover();
    const quebecReadButton = page.locator('#timeline-tooltip .history-expand-btn[data-protocol-tooltip-open="Quebec"]');
    await quebecReadButton.waitFor({ state: 'visible', timeout: 5000 });
    await quebecReadButton.hover();
    await quebecReadButton.click();
    await page.locator('#protocol-history-modal').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('#protocol-history-modal #history-modal-copy-link').click();
    await page.waitForFunction(() => /Chapter link copied/.test(document.getElementById('protocol-story-share-status')?.textContent || ''), null, { timeout: 5000 });
    const copiedProtocolStoryUrl = await page.evaluate(() => navigator.clipboard.readText());
    assert(copiedProtocolStoryUrl === `${baseUrl}/anthology/quebec/`, `feature workflows protocol history copied the wrong URL: ${copiedProtocolStoryUrl}`);
    await page.locator('#protocol-history-modal #history-modal-print').waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('#protocol-history-modal #history-modal-share').click();
    await expectShareModal(page, 'feature workflows protocol history share', issues);
    await page.locator('#protocol-history-modal #history-modal-close').click();
    await page.locator('#protocol-history-modal').waitFor({ state: 'detached', timeout: 5000 });
    await page.locator('#protocol-history-chamber-modal .chamber-close').click();
    await page.locator('#protocol-history-chamber-modal').waitFor({ state: 'detached', timeout: 5000 });
    log('ok - feature workflow: protocol history share');

    await page.locator('[data-stat="total-bakers"]').scrollIntoViewIfNeeded();
    await page.locator('[data-stat="total-bakers"]').hover();
    await page.evaluate(() => document.querySelector('[data-stat="total-bakers"] .card-share-btn')?.click());
    await page.locator('#share-modal.visible').waitFor({ state: 'visible', timeout: 10000 });
    const cardShareCredit = await page.evaluate(() => String(window.__lastHtml2CanvasText || ''));
    assert(cardShareCredit.includes('Built by Primate') && cardShareCredit.includes('RPC by Tez Capital'), `feature workflows card share: ownership credit mismatch: ${cardShareCredit}`);
    await expectShareModal(page, 'feature workflows card share', issues);
    log('ok - feature workflow: card share');

    await ensureDropdownOpen(page, '#settings-gear', '#settings-dropdown');
    await page.locator('#share-btn').click();
    await page.locator('#section-picker-modal').waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('#section-capture-btn').click();
    await expectShareModal(page, 'feature workflows dashboard share', issues);
    log('ok - feature workflow: dashboard share');

    await page.locator('#comparison-section').scrollIntoViewIfNeeded();
    await page.locator('#comparison-share-all-btn').click();
    await expectShareModal(page, 'feature workflows comparison share', issues);
    log('ok - feature workflow: comparison share');

    await ensureDropdownOpen(page, '#features-gear', '#features-dropdown');
    await page.locator('#state-of-tezos-btn').click();
    await page.locator('#share-modal.visible').waitFor({ state: 'visible', timeout: 10000 });
    const stateShareCredit = await page.evaluate(() => String(window.__lastHtml2CanvasText || ''));
    assert(stateShareCredit.includes('PRIMATE · RPC BY TEZ CAPITAL'), `feature workflows state of tezos: ownership credit mismatch: ${stateShareCredit}`);
    await expectShareModal(page, 'feature workflows state of tezos share', issues);
    log('ok - feature workflow: state of tezos share');

    await context.close();
    }

    if (section === 'all' || section === 'mobile') {
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      serviceWorkers: 'block'
    });
    await installFeatureMocks(mobileContext);
    await mobileContext.addInitScript(() => {
      localStorage.setItem('tezos-systems-theme', 'matrix');
      localStorage.setItem('tezos-systems-stats-visible', 'true');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
      localStorage.removeItem('tezos-systems-saved-addresses');
    });
    const mobilePage = await mobileContext.newPage();
    attachIssueCollectors(mobilePage, 'feature workflows mobile baker set', issues);
    const mobileResponse = await mobilePage.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
    assert(mobileResponse?.ok(), `feature workflows mobile baker set: dashboard failed with HTTP ${mobileResponse?.status()}`);
    await mobilePage.waitForFunction(() => (
      document.querySelector('#price-bar [data-price-change="24h"] .price-change-value')?.textContent?.trim() === '+2.5%'
    ), null, { timeout: 10000 });
    const mobilePriceChanges = await mobilePage.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('#price-bar [data-price-change]'));
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        visible: nodes.map((node) => getComputedStyle(node).display !== 'none')
      };
    });
    assert(
      mobilePriceChanges.overflow <= 1
        && mobilePriceChanges.visible.join(',') === 'true,false,false',
      `feature workflows mobile price horizon density mismatch: ${JSON.stringify(mobilePriceChanges)}`
    );
    const mobileBakersPill = mobilePage.locator('#top-continuity-panel .top-continuity-stat[data-card-history="total-bakers"]');
    await mobileBakersPill.tap();
    await mobilePage.waitForFunction(() => {
      const roster = document.querySelector('#top-continuity-baker-roster');
      const horizons = document.querySelector('[data-top-continuity-horizons]');
      const horizonValues = Array.from(horizons?.querySelectorAll('.top-continuity-horizon strong') || [])
        .map((value) => value.textContent?.trim() || '');
      return roster?.getAttribute('aria-busy') === 'false'
        && roster.querySelectorAll('.top-continuity-baker-row').length === 6
        && horizons?.getAttribute('aria-busy') === 'false'
        && horizonValues.length === 3
        && horizonValues.every((value) => value !== '—');
    }, null, { timeout: 10000 });
    const mobileBakerSet = await mobilePage.evaluate(() => {
      const panel = document.querySelector('#top-continuity-panel');
      const popover = document.querySelector('#top-continuity-explain.is-visible');
      const ticker = document.querySelector('#live-head');
      const panelRect = panel?.getBoundingClientRect();
      const popoverRect = popover?.getBoundingClientRect();
      const tickerRect = ticker?.getBoundingClientRect();
      const controls = Array.from(popover?.querySelectorAll('.top-continuity-baker-actions :is(a, button)') || [])
        .map((control) => {
          const rect = control.getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        });
      const primaryActions = Array.from(popover?.querySelectorAll('.top-continuity-explain-actions > button') || [])
        .map((control) => {
          const rect = control.getBoundingClientRect();
          return { text: control.textContent?.trim() || '', left: rect.left, right: rect.right, width: rect.width, height: rect.height };
        });
      return {
        position: popover ? getComputedStyle(popover).position : '',
        panelOwnsPopover: popover?.parentElement === panel,
        popoverInsideViewport: Boolean(popoverRect && popoverRect.left >= -1 && popoverRect.right <= innerWidth + 1),
        popoverBelowPills: Boolean(panelRect && popoverRect && popoverRect.top > panelRect.top),
        tickerClear: Boolean(popoverRect && tickerRect && popoverRect.bottom <= tickerRect.top + 1),
        pageOverflow: document.documentElement.scrollWidth - innerWidth,
        listCounts: Array.from(popover?.querySelectorAll('.top-continuity-baker-list') || []).map((list) => list.querySelectorAll('.top-continuity-baker-row').length),
        headings: Array.from(popover?.querySelectorAll('.top-continuity-baker-heading strong') || []).map((heading) => heading.textContent?.trim() || ''),
        horizonValues: Array.from(popover?.querySelectorAll('.top-continuity-horizon strong') || []).map((value) => value.textContent?.trim() || ''),
        entryBadges: Array.from(popover?.querySelectorAll('.top-continuity-baker-new') || []).map((badge) => badge.textContent?.trim() || ''),
        actionCount: controls.length,
        controls,
        primaryActions,
        text: popover?.textContent || ''
      };
    });
    assert(mobileBakerSet.position === 'relative'
      && mobileBakerSet.panelOwnsPopover
      && mobileBakerSet.popoverInsideViewport
      && mobileBakerSet.popoverBelowPills
      && mobileBakerSet.tickerClear
      && mobileBakerSet.pageOverflow <= 1,
    `feature workflows mobile baker set: in-flow panel geometry mismatch ${JSON.stringify(mobileBakerSet)}`);
    assert(mobileBakerSet.listCounts.join(',') === '3,3'
      && mobileBakerSet.headings.join(',') === '7D New + Reactivated,7D Closed Bakers'
      && mobileBakerSet.horizonValues.length === 3
      && mobileBakerSet.horizonValues.every((value) => value !== '—')
      && mobileBakerSet.entryBadges.join(',') === 'NEW,REACTIVATED,NEW'
      && /active set entered/i.test(mobileBakerSet.text)
      && /active set left/i.test(mobileBakerSet.text),
    `feature workflows mobile baker set: lifecycle rows missing ${JSON.stringify(mobileBakerSet)}`);
    assert(mobileBakerSet.actionCount === 12
      && mobileBakerSet.controls.every(({ width, height }) => width >= 43.9 && height >= 43.9),
    `feature workflows mobile baker set: action touch targets regressed ${JSON.stringify(mobileBakerSet)}`);
    assert(mobileBakerSet.primaryActions.length === 2
      && mobileBakerSet.primaryActions.map(({ text }) => text).join(',') === 'Open all-time chart,Baker Directory →'
      && mobileBakerSet.primaryActions.every(({ width, height }) => width >= 80 && height >= 43.9)
      && mobileBakerSet.primaryActions[1].left >= mobileBakerSet.primaryActions[0].right - 1,
    `feature workflows mobile baker set: paired chart/destination actions regressed ${JSON.stringify(mobileBakerSet.primaryActions)}`);
    await mobilePage.locator('[data-close-top-continuity-explain]').tap();
    await mobilePage.waitForFunction(() => document.querySelector('#top-continuity-explain')?.getAttribute('aria-hidden') === 'true', null, { timeout: 5000 });
    await mobileContext.close();
    log('ok - feature workflow: mobile baker lifecycle roster');
    }

    assert(issues.length === 0, `feature workflows browser issues:\n${issues.join('\n')}`);
    log(`ok - feature workflows ${section} smoke`);
  }

  async function smokeShareActions(browser, baseUrl) {
    const issues = [];
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      serviceWorkers: 'block'
    });
    await context.grantPermissions(['clipboard-write'], { origin: baseUrl });
    await installFeatureMocks(context);
    await installShareActionMocks(context, { nativeShare: true });
    await context.addInitScript(() => {
      localStorage.setItem('tezos-systems-theme', 'matrix');
      localStorage.setItem('tezos-systems-stats-visible', 'true');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    });

    const page = await context.newPage();
    attachIssueCollectors(page, 'share actions', issues);
    const response = await page.goto(`${baseUrl}/?theme=matrix#section=consensus`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `share actions: dashboard failed with HTTP ${response?.status()}`);
    await page.locator('[data-stat="total-bakers"] .card-share-btn').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('[data-stat="total-bakers"]').scrollIntoViewIfNeeded();
    await page.evaluate(() => document.querySelector('[data-stat="total-bakers"] .card-share-btn')?.click());
    await waitForShareModal(page, 'share actions card share', issues);
    const capturedSize = await page.evaluate(() => window.__lastHtml2CanvasSize || {});
    assert(capturedSize.width === 1200 && capturedSize.height === 630, `share actions: stat card should capture as 1200x630, saw ${JSON.stringify(capturedSize)}`);

    const refreshButton = page.locator('#share-modal #tweet-refresh-btn');
    if (await refreshButton.count()) {
      const initialChoiceText = await page.locator('#share-modal .tweet-option').first().innerText();
      await refreshButton.click();
      await page.waitForFunction((previous) => {
        const first = document.querySelector('#share-modal .tweet-option')?.textContent || '';
        return first && first !== previous;
      }, initialChoiceText, { timeout: 5000 }).catch(() => {});
      await expectCount(page, '#share-modal .tweet-option', 2, 'share actions refreshed tweet options');
    }

    await page.locator('#share-modal #tweet-compose-text').fill('Testing an editable Tezos Systems share.\n\ntezos.systems');
    await page.locator('#share-modal #share-handle-input').fill('@TezosTester');
    await page.locator('#share-modal #share-handle-input').blur();
    const savedHandle = await page.evaluate(() => localStorage.getItem('tezos-systems-share-handle'));
    assert(savedHandle === 'TezosTester', `share actions: handle should normalize and persist, saw ${savedHandle}`);

    await page.locator('#share-modal #share-copy').click();
    await page.waitForFunction(() => window.__shareActions.clipboardWrites.some((entry) => entry.types?.includes('image/png')), null, { timeout: 5000 });
    await page.locator('#share-modal #share-twitter').click();
    await page.waitForFunction(() => window.__shareActions.opens.some((entry) => entry.url.startsWith('https://twitter.com/intent/tweet?text=')), null, { timeout: 5000 });
    const tweetText = await page.evaluate(() => {
      const opened = window.__shareActions.opens.find((entry) => entry.url.startsWith('https://twitter.com/intent/tweet?text='));
      return decodeURIComponent(new URL(opened.url).searchParams.get('text') || '');
    });
    assert(tweetText.includes('Testing an editable Tezos Systems share.'), `share actions: X intent should use editable tweet text: ${tweetText}`);
    assert(
      tweetText.includes('utm_source=x')
        && tweetText.includes('utm_medium=social')
        && tweetText.includes('utm_campaign=tezos_systems_shares')
        && tweetText.includes('utm_content='),
      `share actions: X intent should include conventional Tezos Systems attribution: ${tweetText}`
    );
    await page.locator('#share-modal #share-native').click();
    await page.waitForFunction(() => window.__shareActions.nativeShares.some((entry) => (
      entry.fileCount === 1
      && entry.fileTypes.includes('image/png')
      && entry.url.includes('utm_source=native_share')
      && entry.url.includes('utm_medium=share')
      && entry.url.includes('utm_campaign=tezos_systems_shares')
    )), null, { timeout: 5000 });
    await page.locator('#share-modal #share-download').click();
    await page.waitForFunction(() => window.__shareActions.downloads.some((entry) => /^tezos-systems-\d+\.png$/.test(entry.download) && entry.href.startsWith('data:image/png')), null, { timeout: 5000 });

    const desktopActions = await page.evaluate(() => window.__shareActions);
    assert(desktopActions.clipboardWrites.filter((entry) => entry.types?.includes('image/png')).length === 1, `share actions: expected only explicit copy image clipboard write: ${JSON.stringify(desktopActions)}`);
    assert(desktopActions.opens.length === 1, `share actions: expected one X intent open: ${JSON.stringify(desktopActions.opens)}`);
    assert(desktopActions.nativeShares.length === 1, `share actions: expected one native share: ${JSON.stringify(desktopActions.nativeShares)}`);
    assert(desktopActions.downloads.length === 1, `share actions: expected one desktop download: ${JSON.stringify(desktopActions.downloads)}`);
    await page.locator('#share-modal .share-modal-close').click();
    await page.locator('#share-modal').waitFor({ state: 'detached', timeout: 5000 });

    await page.locator('#chambers-grid > .chamber-category[data-chamber-category="capital"] .chamber-category-toggle').click();
    await page.locator('#capital-entry-card').dispatchEvent('pointerenter');
    await page.locator('#capital-entry-front[data-capital-rendered="1"]').waitFor({ state: 'attached', timeout: 20000 });
    await page.locator('#capital-entry-card > .card-share-btn').waitFor({ state: 'visible', timeout: 20000 });
    await page.locator('#capital-entry-card').scrollIntoViewIfNeeded();
    await page.locator('#capital-entry-card > .card-share-btn').click();
    await waitForShareModal(page, 'share actions Capital Chamber share', issues);
    const capitalShareTitle = await page.locator('#share-modal-title').innerText();
    const capitalComposerText = await page.locator('#share-modal #tweet-compose-text').inputValue();
    assert(capitalShareTitle === 'Share: Capital Chamber', `share actions: Capital title should not repeat Chamber: ${capitalShareTitle}`);
    assert(capitalComposerText.includes('tezos.systems/capital/'), `share actions: Capital composer should expose its canonical room URL: ${capitalComposerText}`);
    await page.locator('#share-modal #share-twitter').click();
    await page.waitForFunction(() => window.__shareActions.opens.length === 2, null, { timeout: 5000 });
    const capitalShare = await page.evaluate(() => {
      const opened = window.__shareActions.opens[1];
      const text = decodeURIComponent(new URL(opened.url).searchParams.get('text') || '');
      const match = text.match(/https:\/\/tezos\.systems\/capital\/\?[^\s]+/);
      if (!match) return { text, url: '' };
      return { text, url: match[0] };
    });
    assert(capitalShare.url, `share actions: Capital share should contain its canonical room URL: ${capitalShare.text}`);
    const capitalShareUrl = new URL(capitalShare.url);
    assert(capitalShareUrl.pathname === '/capital/', `share actions: Capital share route mismatch: ${capitalShare.url}`);
    assert(
      capitalShareUrl.searchParams.get('utm_source') === 'x'
        && capitalShareUrl.searchParams.get('utm_medium') === 'social'
        && capitalShareUrl.searchParams.get('utm_campaign') === 'tezos_systems_shares'
        && capitalShareUrl.searchParams.get('utm_content') === 'capital-chamber',
      `share actions: Capital attribution mismatch: ${capitalShare.url}`
    );
    await page.locator('#share-modal .share-modal-close').click();
    await page.locator('#share-modal').waitFor({ state: 'detached', timeout: 5000 });

    await page.evaluate(async () => {
      const { captureNetworkMomentShare } = await import('/js/ui/share.js');
      await captureNetworkMomentShare({
        id: 'smoke-staking-50',
        emoji: '🎯',
        title: 'Staking hits 50%!',
        tweet: 'Tezos staking just crossed 50%! The network keeps getting stronger.\n\nReal-time stats →',
        timestamp: Date.now()
      });
    });
    await waitForShareModal(page, 'share actions Network Moment share', issues);
    const momentCaptureText = await page.evaluate(() => window.__lastHtml2CanvasText?.replace(/\s+/g, ' ').trim() || '');
    assert(/Network Moment/i.test(momentCaptureText) && /Staking hits 50%/i.test(momentCaptureText), `share actions: Network Moment capture should use branded card text: ${momentCaptureText}`);
    await page.locator('#share-modal .share-modal-close').click();
    await page.locator('#share-modal').waitFor({ state: 'detached', timeout: 5000 });
    await context.close();

    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36',
      hasTouch: true,
      serviceWorkers: 'block'
    });
    await installFeatureMocks(mobileContext);
    await installShareActionMocks(mobileContext, { nativeShare: false });
    await mobileContext.addInitScript(() => {
      localStorage.setItem('tezos-systems-theme', 'matrix');
      localStorage.setItem('tezos-systems-stats-visible', 'true');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    });

    const mobilePage = await mobileContext.newPage();
    attachIssueCollectors(mobilePage, 'share actions mobile fallback', issues);
    const mobileResponse = await mobilePage.goto(`${baseUrl}/?theme=matrix#section=consensus`, { waitUntil: 'domcontentloaded' });
    assert(mobileResponse?.ok(), `share actions mobile fallback: dashboard failed with HTTP ${mobileResponse?.status()}`);
    await mobilePage.locator('[data-stat="total-bakers"] .card-share-btn').waitFor({ state: 'visible', timeout: 10000 });
    await mobilePage.evaluate(() => document.querySelector('[data-stat="total-bakers"] .card-share-btn')?.click());
    await waitForShareModal(mobilePage, 'share actions mobile fallback card share', issues);
    await mobilePage.locator('#share-modal #share-download').click();
    await mobilePage.waitForFunction(() => Array.from(document.querySelectorAll('body > div')).some((node) => /Save to Photos/.test(node.textContent || '') && node.querySelector('img[src^="data:image/png"]')), null, { timeout: 5000 });
    await mobilePage.locator('body > div img[src^="data:image/png"] + button').last().click();
    await mobilePage.locator('#share-modal .share-modal-close').click();
    await mobilePage.locator('#share-modal').waitFor({ state: 'detached', timeout: 5000 });
    await mobileContext.close();

    assert(issues.length === 0, `share actions browser issues:\n${issues.join('\n')}`);
    log('ok - share actions smoke');
  }

  async function smokeInfoModals(browser, baseUrl) {
    const issues = [];
    const context = await browser.newContext({
      viewport: { width: 1366, height: 900 },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(context);
    await context.addInitScript(() => {
      localStorage.setItem('tezos-systems-theme', 'matrix');
      localStorage.setItem('tezos-systems-stats-visible', 'true');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
      localStorage.setItem('tezos-systems-leaderboard-visible', 'true');
      localStorage.setItem('tezos-systems-calc-visible', 'true');
      localStorage.setItem('tezos-systems-whale-enabled', 'true');
      localStorage.setItem('tezos-systems-giants-enabled', 'true');
      localStorage.setItem('tezos-systems-comparison-visible', 'true');
    });

    const page = await context.newPage();
    attachIssueCollectors(page, 'info modals', issues);
    let response = await page.goto(`${baseUrl}/?theme=matrix#section=consensus`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `info modals: dashboard failed with HTTP ${response?.status()}`);
    await page.locator('main').waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForFunction(() => (
      document.getElementById('pulse-ticker-strip')?.dataset.pulseState === 'ready'
    ), null, { timeout: 15000 });
    await page.locator('#pulse-ticker-strip [data-pulse-run="live"]').waitFor({ state: 'visible', timeout: 15000 });
    const liveClockPresentation = await page.locator('#pulse-ticker-strip .hot-today-clock').evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        fontSize: Number.parseFloat(style.fontSize),
        decoration: style.textDecorationLine,
        display: style.display,
        clock: node.textContent?.trim() || ''
      };
    });
    assert(
      liveClockPresentation.display === 'flex'
        && liveClockPresentation.decoration === 'none'
        && liveClockPresentation.fontSize <= 12
        && /^(?:Just now|\d+[smhd] ago)$/i.test(liveClockPresentation.clock),
      `Live Pulse clock presentation drifted ${JSON.stringify(liveClockPresentation)}`
    );

    const sectionHelpContracts = [
      {
        button: '#hot-today-info-btn',
        panel: '#hot-today-info-btn-panel',
        section: '#pulse-ticker-strip',
        title: 'The signals most worth noticing now',
        href: '/pulse/'
      },
      {
        button: '#chambers-info-btn',
        panel: '#chambers-info-btn-panel',
        section: '#chambers-section',
        title: 'Focused views, organized by question',
        href: '/chambers/'
      }
    ];

    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });

    for (const contract of sectionHelpContracts) {
      await page.locator(contract.button).scrollIntoViewIfNeeded();
      const sectionGeometryBefore = await page.evaluate(({ button, section }) => {
        const trigger = document.querySelector(button);
        const triggerRect = trigger?.getBoundingClientRect();
        const headerRect = trigger?.closest('.section-header')?.getBoundingClientRect();
        const sectionRect = document.querySelector(section)?.getBoundingClientRect();
        return {
          top: sectionRect?.top || 0,
          height: sectionRect?.height || 0,
          headerHeight: headerRect?.height || 0,
          triggerOffset: triggerRect && sectionRect ? triggerRect.top - sectionRect.top : 0
        };
      }, contract);
      await page.locator(contract.button).click();
      await page.locator(`${contract.panel}.is-visible`).waitFor({ state: 'visible', timeout: 5000 });
      const helpState = await page.evaluate(({ button, panel, section, title, href, before }) => {
        const trigger = document.querySelector(button);
        const popover = document.querySelector(panel);
        const sectionNode = document.querySelector(section);
        const link = popover?.querySelector('a');
        const rect = popover?.getBoundingClientRect();
        const triggerRect = trigger?.getBoundingClientRect();
        const headerRect = trigger?.closest('.section-header')?.getBoundingClientRect();
        const sectionRect = sectionNode?.getBoundingClientRect();
        return {
          active: trigger?.classList.contains('is-explaining') || false,
          ariaControls: trigger?.getAttribute('aria-controls') || '',
          ariaExpanded: trigger?.getAttribute('aria-expanded') || '',
          ariaHidden: popover?.getAttribute('aria-hidden') || '',
          titlePresent: (popover?.textContent || '').includes(title),
          href: link ? new URL(link.href).pathname : '',
          parentHost: popover?.parentElement?.matches('.section-header, .pulse-ticker-strip') || false,
          compact: Boolean(rect && rect.width <= 390),
          viewportContained: Boolean(rect && rect.left >= -1 && rect.right <= innerWidth + 1),
          position: popover ? getComputedStyle(popover).position : '',
          sectionShift: Math.abs((sectionRect?.top || 0) - before.top),
          sectionHeightShift: Math.abs((sectionRect?.height || 0) - before.height),
          headerHeightShift: Math.abs((headerRect?.height || 0) - before.headerHeight),
          triggerOffsetShift: Math.abs(
            (triggerRect && sectionRect ? triggerRect.top - sectionRect.top : 0) - before.triggerOffset
          )
        };
      }, { ...contract, before: sectionGeometryBefore });
      assert(
        helpState.active
          && helpState.ariaControls === contract.panel.slice(1)
          && helpState.ariaExpanded === 'true'
          && helpState.ariaHidden === 'false',
        `section help disclosure state mismatch ${JSON.stringify(helpState)}`
      );
      assert(
        helpState.titlePresent
          && helpState.href === contract.href
          && helpState.parentHost
          && helpState.compact
          && helpState.viewportContained
          && helpState.position === 'absolute'
          && helpState.headerHeightShift <= 1
          && helpState.triggerOffsetShift <= 1,
        `section help content or geometry mismatch ${JSON.stringify(helpState)}`
      );
      await page.keyboard.press('Escape');
      await page.waitForFunction((panel) => {
        const popover = document.querySelector(panel);
        return popover
          && !popover.classList.contains('is-visible')
          && popover.getAttribute('aria-hidden') === 'true';
      }, contract.panel, { timeout: 5000 });
    }

    const managedHomeSections = [
      { section: '#pulse-ticker-strip', content: '#pulse-ticker-viewport', label: 'Live Pulse' },
      { section: '#chambers-section', content: '#chambers-grid', label: 'Explore Tezos' }
    ];
    for (const contract of managedHomeSections) {
      const managedState = await page.evaluate(({ section, content, label }) => {
        const sectionNode = document.querySelector(section);
        const contentNode = document.querySelector(content);
        window[`__sectionHelp${label.replace(/\s+/g, '')}`] = { sectionNode, contentNode };
        return {
          collapseButtons: sectionNode?.querySelectorAll('[data-section-collapse]').length || 0,
          hideButtons: sectionNode?.querySelectorAll('[data-home-hide]').length || 0,
          collapsed: sectionNode?.classList.contains('collapsed') || false,
          sameContent: window[`__sectionHelp${label.replace(/\s+/g, '')}`]?.contentNode === contentNode,
          sameSection: window[`__sectionHelp${label.replace(/\s+/g, '')}`]?.sectionNode === sectionNode
        };
      }, contract);
      assert(
        managedState.sameSection
          && managedState.sameContent
          && managedState.collapseButtons === 0
          && managedState.hideButtons === 1
          && !managedState.collapsed,
        `${contract.label} managed shown/hidden contract failed ${JSON.stringify(managedState)}`
      );
      const stateKey = contract.section === '#pulse-ticker-strip' ? 'live-pulse' : 'explore';
      await page.evaluate((id) => window.tezosSystemsHomeLayout.setHomeBlockVisible(id, false, 'feature-workflow-smoke'), stateKey);
      await page.waitForFunction((selector) => getComputedStyle(document.querySelector(selector)).display === 'none', contract.section);
      await page.evaluate((id) => window.tezosSystemsHomeLayout.setHomeBlockVisible(id, true, 'feature-workflow-smoke'), stateKey);
      await page.waitForFunction((selector) => getComputedStyle(document.querySelector(selector)).display !== 'none', contract.section);
      const restored = await page.evaluate(({ section, content, label }) => {
        const sectionNode = document.querySelector(section);
        const contentNode = document.querySelector(content);
        const saved = window[`__sectionHelp${label.replace(/\s+/g, '')}`];
        return {
          sameSection: saved?.sectionNode === sectionNode,
          sameContent: saved?.contentNode === contentNode,
          collapsed: sectionNode?.classList.contains('collapsed') || false
        };
      }, contract);
      assert(restored.sameSection && restored.sameContent && !restored.collapsed, `${contract.label} show restoration changed content identity ${JSON.stringify(restored)}`);
    }

    const sectionHeaderState = await page.evaluate(() => ({
      pulseLeadRail: Boolean(document.querySelector('#pulse-ticker-strip .pulse-ticker-rail, #pulse-ticker-strip .pulse-ticker-kicker, #pulse-ticker-dot, #pulse-ticker-strip .hot-today-clock-dot')),
      exploreKicker: document.querySelector('#chambers-section .feature-kicker')?.textContent?.trim() || '',
      exploreTitle: document.querySelector('#chambers-section .section-title')?.textContent?.trim() || '',
      buildingEmoji: /🏛️/.test(document.querySelector('#chambers-section .section-header')?.textContent || ''),
      pulseInfo: document.querySelector('#pulse-ticker-strip #hot-today-info-btn')?.getAttribute('aria-controls') || '',
      exploreCopyCount: document.querySelectorAll('#chambers-section .section-copy-link').length,
      staleModal: Boolean(document.getElementById('chambers-modal'))
    }));
    assert(
      !sectionHeaderState.pulseLeadRail
        && sectionHeaderState.exploreKicker === 'Explore Tezos'
        && sectionHeaderState.exploreTitle === 'Choose a topic'
        && !sectionHeaderState.buildingEmoji
        && sectionHeaderState.pulseInfo === 'hot-today-info-btn-panel'
        && sectionHeaderState.exploreCopyCount === 0
        && !sectionHeaderState.staleModal,
      `descriptive section header contract failed ${JSON.stringify(sectionHeaderState)}`
    );

    const modalPairs = [
      ['#consensus-info-btn', '#consensus-modal', '#consensus-modal-close'],
      ['#governance-info-btn', '#governance-modal', '#governance-modal-close'],
      ['#economy-info-btn', '#economy-modal', '#economy-modal-close'],
      ['#network-info-btn', '#network-modal', '#network-modal-close'],
      ['#ecosystem-info-btn', '#ecosystem-modal', '#ecosystem-modal-close'],
      ['#comparison-info-btn', '#comparison-modal', '#comparison-modal-close'],
      ['#calc-info-btn', '#calc-modal', '#calc-modal-close']
    ];

    for (const [trigger, modal, close] of modalPairs) {
      const triggerLocator = page.locator(trigger);
      await assertLocatorCount(triggerLocator, 1, `info modals trigger ${trigger}`);
      assert(await triggerLocator.isVisible(), `info modals trigger is not visible: ${trigger}`);
      await triggerLocator.scrollIntoViewIfNeeded();
      await triggerLocator.click();
      await page.locator(`${modal}[aria-hidden="false"]`).waitFor({ state: 'attached', timeout: 5000 });
      await page.locator(close).click();
      await page.locator(`${modal}[aria-hidden="true"]`).waitFor({ state: 'attached', timeout: 5000 });
    }

    await ensureDropdownOpen(page, '#settings-gear', '#settings-dropdown');
    await page.locator('#about-tezos-btn').click();
    await page.locator('#about-tezos-modal[aria-hidden="false"]').waitFor({ state: 'attached', timeout: 5000 });
    const mainnetAgeText = await page.locator('#days-live-modal').innerText();
    assert(/June 30, 2018/i.test(mainnetAgeText), 'mainnet-age modal should use the Mainnet Block 1 calendar date');
    assert(!/September 17, 2018|September 2018/i.test(mainnetAgeText), 'mainnet-age modal should not contain the stale September 2018 launch date');
    await page.locator('#about-tezos-modal-close').click();
    await page.locator('#about-tezos-modal[aria-hidden="true"]').waitFor({ state: 'attached', timeout: 5000 });

    response = await page.goto(`${baseUrl}/chambers/?theme=matrix`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `Explore Tezos pretty route failed with HTTP ${response?.status()}`);
    await page.waitForFunction(() => document.querySelectorAll('#chambers-grid > .chamber-category').length === 7, null, { timeout: 15000 });
    const prettyRoute = await page.evaluate(() => ({
      pathname: window.location.pathname,
      routeIdentity: document.documentElement.dataset.chamberRoute || '',
      title: document.querySelector('#chambers-section .section-title')?.textContent?.trim() || '',
      visible: !document.getElementById('chambers-section')?.hidden,
      modalOpen: Boolean(document.querySelector('.chamber-overlay.active, .modal-overlay.active'))
    }));
    assert(
      prettyRoute.pathname === '/chambers/'
        && prettyRoute.routeIdentity === 'chambers'
        && prettyRoute.title === 'Choose a topic'
        && prettyRoute.visible
        && !prettyRoute.modalOpen,
      `Explore Tezos pretty route identity failed ${JSON.stringify(prettyRoute)}`
    );

    await context.close();
    assert(issues.length === 0, `info modals browser issues:\n${issues.join('\n')}`);
    log('ok - info modals smoke');
  }

  async function smokeWidgetBuilder(browser, baseUrl) {
    const issues = [];
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(context);
    const page = await context.newPage();
    attachIssueCollectors(page, 'widget builder', issues);

    const response = await page.goto(`${baseUrl}/widgets/builder.html`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `widget builder: failed with HTTP ${response?.status()}`);
    await page.locator('#preview-frame').waitFor({ state: 'visible', timeout: 10000 });
    await expectCount(page, '#widget-type-grid .widget-type-btn', 8, 'widget builder type buttons');
    await expectCount(page, '#theme-grid .theme-btn[data-theme="aurora"]', 1, 'widget builder aurora theme');
    await expectCount(page, '#theme-grid .theme-btn[data-theme="transparent"]', 1, 'widget builder transparent theme');
    await page.waitForFunction(() => new URL(document.querySelector('#preview-frame')?.src || location.href).searchParams.get('theme') === 'aurora', null, { timeout: 5000 });

    await page.locator('.widget-type-btn[data-type="price"]').click();
    await expectClassContains(page.locator('.widget-type-btn[data-type="price"]'), 'active', 'widget builder price type');
    await page.waitForFunction(() => document.querySelector('#preview-frame')?.src.includes('/widgets/price.html'), null, { timeout: 5000 });

    await page.locator('#width-input').fill('420');
    await page.locator('#height-input').fill('180');
    await page.waitForFunction(() => {
      const frame = document.querySelector('#preview-frame');
      return frame?.getAttribute('width') === '420' && frame?.getAttribute('height') === '180';
    }, null, { timeout: 5000 });

    await page.locator('.code-tab[data-tab="markdown"]').click();
    const markdownCode = await page.locator('#code-text').innerText();
    assert(markdownCode.startsWith('[Open the Tezos price widget]('), `widget builder Markdown should render a direct widget link: ${markdownCode}`);
    assert(markdownCode.includes('utm_medium=widget_markdown') && markdownCode.includes('utm_campaign=tezos_systems_widgets'), `widget builder markdown should carry attribution params: ${markdownCode}`);
    const previewUrl = await page.locator('#preview-frame').getAttribute('src');
    assert(previewUrl.includes('utm_medium=widget') && previewUrl.includes('utm_content=price'), `widget builder preview URL should carry widget attribution params: ${previewUrl}`);

    await page.locator('.widget-type-btn[data-type="combo"]').click();
    await expectClassContains(page.locator('.widget-type-btn[data-type="combo"]'), 'active', 'widget builder combo type');
    await expectCount(page, '#combo-options input[value="health"]', 1, 'widget builder combo health stat');
    await expectCount(page, '#combo-options input[value="tz4"]', 1, 'widget builder combo tz4 stat');
    await page.locator('#combo-options input[value="price"]').uncheck();
    await page.locator('#combo-options input[value="blocks"]').uncheck();
    await page.locator('#combo-options input[value="health"]').check();
    await page.locator('#combo-options input[value="tz4"]').check();
    await page.waitForFunction(() => {
      const frame = document.querySelector('#preview-frame');
      const stats = new URL(frame?.src || location.href).searchParams.get('stats') || '';
      return frame?.src.includes('/widgets/combo.html') && stats.includes('health') && stats.includes('tz4');
    }, null, { timeout: 5000 });

    await context.close();
    assert(issues.length === 0, `widget builder browser issues:\n${issues.join('\n')}`);
    log('ok - widget builder smoke');
  }

  return { smokeFeatureWorkflows, smokeShareActions, smokeInfoModals, smokeWidgetBuilder };
}
