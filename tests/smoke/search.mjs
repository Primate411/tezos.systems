// Browser workflows owned by search. Shared dependencies remain explicit.
export function createSearchSmokeSuites({
  SAMPLE_ADDRESS,
  SAMPLE_CONTRACT,
  assert,
  attachIssueCollectors,
  installFeatureMocks,
  log
}) {
  async function smokeHeroIntermediate(browser, baseUrl) {
    const issues = [];
    const context = await browser.newContext({
      viewport: { width: 844, height: 390 },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(context);
    await context.addInitScript(() => {
      localStorage.setItem('tezos-systems-theme', 'aurora');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    });

    const page = await context.newPage();
    attachIssueCollectors(page, 'hero intermediate', issues);
    const response = await page.goto(`${baseUrl}/?theme=aurora`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `hero intermediate: dashboard failed with HTTP ${response?.status()}`);
    await page.locator('#hero-search-input').waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForFunction(() => Boolean(document.getElementById('shell-extras-css')?.sheet), null, { timeout: 5000 });
    await page.waitForFunction(() => document.querySelector('#header-activity-button')?.dataset.headerActivityWired === '1', null, { timeout: 10000 });
    await page.waitForFunction(() => /^\d+$/.test(document.querySelector('#hero-chain-uptime-bakers')?.textContent?.trim() || ''), null, { timeout: 10000 });
    await page.evaluate(() => {
      const values = new Map([
        ['hero-chain-uptime-bakers', '195'],
        ['hero-chain-uptime-finality', '12s'],
        ['hero-chain-uptime-staked', '29.9%'],
        ['hero-chain-uptime-issuance', '3.02%']
      ]);
      for (const [id, value] of values) {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
      }
      document.querySelector('#top-continuity-panel')?.classList.remove('hero-arrival-pending');
      document.querySelectorAll('#top-continuity-panel .top-continuity-stat').forEach((pill) => {
        pill.classList.remove('is-loading');
        pill.classList.add('hero-arrived');
      });
    });

    const state = await page.evaluate(() => {
      const row = document.querySelector('.top-continuity-row');
      const left = document.querySelector('.header-continuity-row');
      const history = document.querySelector('#top-continuity-history');
      const activity = document.querySelector('#header-activity-button');
      const filter = document.querySelector('#live-head-filter-toggle');
      const liveHead = document.querySelector('#live-head');
      const activityLine = document.querySelector('#header-activity-line');
      const panel = document.querySelector('#top-continuity-panel');
      const pills = Array.from(document.querySelectorAll('#top-continuity-panel .top-continuity-stat'));
      const rect = (element) => element?.getBoundingClientRect() || null;
      const rowRect = rect(row);
      const leftRect = rect(left);
      const historyRect = rect(history);
      const activityRect = rect(activity);
      const filterRect = rect(filter);
      const panelRect = rect(panel);
      const pillRects = pills.map((pill) => rect(pill));
      return {
        breakpoint: matchMedia('(min-width: 801px) and (max-width: 1180px)').matches,
        leftDisplay: left ? getComputedStyle(left).display : '',
        rowColumns: row ? getComputedStyle(row).gridTemplateColumns : '',
        pillColumns: panel?.querySelector('.top-continuity-stats')
          ? getComputedStyle(panel.querySelector('.top-continuity-stats')).gridTemplateColumns
          : '',
        activityInLiveHead: Boolean(activity && liveHead?.contains(activity)),
        activityAboveFilter: Boolean(activityRect && filterRect
          && Math.abs(filterRect.top - activityRect.bottom - 6) <= 1
          && Math.abs(activityRect.height - filterRect.height) <= 1),
        pillsBesideLead: Boolean(historyRect && panelRect && historyRect.right < panelRect.left
          && historyRect.top < panelRect.bottom && historyRect.bottom > panelRect.top),
        compactPills: pillRects.every(rect => rect.width < 180),
        pillCount: pills.length,
        onePillRow: pillRects.length === 4
          && pillRects.every((pillRect) => Math.abs(
            (pillRect.top + pillRect.height / 2)
            - (pillRects[0].top + pillRects[0].height / 2)
          ) <= 2)
          && pillRects.every((pillRect, index) => index === 0 || pillRect.left >= pillRects[index - 1].right - 1),
        rowInsideViewport: Boolean(rowRect && rowRect.left >= -1 && rowRect.right <= innerWidth + 1),
        activityOverflow: activityLine ? activityLine.scrollWidth - activityLine.clientWidth : 999,
        documentOverflow: document.documentElement.scrollWidth - innerWidth
      };
    });

    assert(state.breakpoint && state.leftDisplay === 'flex', `hero intermediate: breakpoint did not keep the uptime lead stable ${JSON.stringify(state)}`);
    assert(state.activityInLiveHead && state.activityAboveFilter, `hero intermediate: 1H activity should occupy its own row above the health and setup controls ${JSON.stringify(state)}`);
    assert(state.pillsBesideLead && state.compactPills, `hero intermediate: compact network signals should share the uptime row ${JSON.stringify(state)}`);
    assert(state.pillCount === 4 && state.onePillRow, `hero intermediate: network signals should remain one uninterrupted four-pill row ${JSON.stringify(state)}`);
    assert(state.rowInsideViewport && state.activityOverflow <= 1 && state.documentOverflow <= 1, `hero intermediate: responsive signal row escaped or clipped ${JSON.stringify(state)}`);

    await page.setViewportSize({ width: 641, height: 900 });
    const lowerEdge = await page.evaluate(() => {
      const pills = Array.from(document.querySelectorAll('#top-continuity-panel .top-continuity-stat'));
      const rects = pills.map((pill) => pill.getBoundingClientRect());
      const center = (rect) => rect.top + rect.height / 2;
      return {
        breakpoint: matchMedia('(min-width: 641px) and (max-width: 800px)').matches,
        oneRow: rects.length === 4 && rects.every((rect) => Math.abs(center(rect) - center(rects[0])) <= 2),
        contentFits: pills.every((pill) => pill.scrollWidth - pill.clientWidth <= 1),
        documentOverflow: document.documentElement.scrollWidth - innerWidth
      };
    });
    assert(
      lowerEdge.breakpoint && lowerEdge.oneRow && lowerEdge.contentFits && lowerEdge.documentOverflow <= 1,
      `hero intermediate: 641px lower edge clipped or wrapped the four-pill row ${JSON.stringify(lowerEdge)}`
    );

    await page.setViewportSize({ width: 640, height: 900 });
    const mobileEdge = await page.evaluate(() => {
      const rects = Array.from(document.querySelectorAll('#top-continuity-panel .top-continuity-stat'))
        .map((pill) => pill.getBoundingClientRect());
      const center = (rect) => rect.top + rect.height / 2;
      return {
        mobile: matchMedia('(max-width: 640px)').matches,
        intermediate: matchMedia('(min-width: 641px) and (max-width: 800px)').matches,
        twoByTwo: rects.length === 4
          && Math.abs(center(rects[0]) - center(rects[1])) <= 2
          && Math.abs(center(rects[2]) - center(rects[3])) <= 2
          && center(rects[2]) - center(rects[0]) >= 20,
        documentOverflow: document.documentElement.scrollWidth - innerWidth
      };
    });
    assert(
      mobileEdge.mobile && !mobileEdge.intermediate && mobileEdge.twoByTwo && mobileEdge.documentOverflow <= 1,
      `hero intermediate: 640px mobile boundary lost its compact two-by-two grid ${JSON.stringify(mobileEdge)}`
    );

    await context.close();
    assert(issues.length === 0, `hero intermediate browser issues:\n${issues.join('\n')}`);
    log('ok - hero intermediate continuity rows');
  }

  async function smokeSearchCatalogRecovery(browser, baseUrl) {
    for (const width of [1280, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
      try {
        await installFeatureMocks(context);
        await context.addInitScript(() => {
          localStorage.setItem('tezos-toured', '1');
          localStorage.setItem('tezos-welcomed', '1');
        });
        let attempts = 0;
        await context.route('**/data/search-catalog.json*', async route => {
          if (++attempts === 1) await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
          else await route.continue();
        });
        const page = await context.newPage();
        await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => document.documentElement.dataset.dashboardReady === 'true');
        const input = page.locator('#hero-search-input');
        await input.click();
        const failure = page.waitForResponse(response => response.url().includes('/data/search-catalog.json') && response.status() === 503);
        await input.fill('zz'); // two characters isolate the catalog from name lookups
        await failure;
        await page.waitForFunction(async () => {
          const catalog = await import('/js/core/search-catalog.js');
          return !catalog.isSearchCatalogLoading() && document.querySelector('#hero-search-panel')?.getAttribute('aria-busy') === 'false';
        });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        assert(attempts === 1, `${width}: a failed catalog must not retry from its completion render`);
        assert(await input.inputValue() === 'zz', `${width}: catalog failure preserves the query`);
        assert(await input.evaluate(node => node === document.activeElement), `${width}: catalog failure preserves input focus`);
        await input.fill('objkt');
        await page.waitForFunction(async () => (await import('/js/core/search-catalog.js')).isSearchCatalogLoaded());
        await page.locator('#hero-search-panel [data-result-id^="catalog:"]').first().waitFor({ state: 'visible' });
        assert(attempts === 2, `${width}: the next search retries and recovers the catalog`);
      } finally { await context.close(); }
    }
  }

  async function smokeHeroCommandBar(browser, baseUrl, section = 'all') {
    const intentNavigationTimeout = 15000;
    const issues = [];
    if (section === 'all' || section === 'first-paint') {
    const firstPaintContext = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      javaScriptEnabled: false,
      serviceWorkers: 'block'
    });
    const firstPaintPage = await firstPaintContext.newPage();
    const firstPaintResponse = await firstPaintPage.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    assert(firstPaintResponse?.ok(), `hero command bar first paint: dashboard failed with HTTP ${firstPaintResponse?.status()}`);
    await firstPaintPage.locator('#header-activity-button').waitFor({ state: 'visible', timeout: 10000 });
    const firstPaintState = await firstPaintPage.evaluate(() => {
      const row = document.querySelector('.header-continuity-row');
      const history = document.querySelector('#top-continuity-history');
      const activity = document.querySelector('#header-activity-button');
      const filter = document.querySelector('#live-head-filter-toggle');
      const liveHead = document.querySelector('#live-head');
      const line = document.querySelector('#header-activity-line');
      const cluster = line?.querySelector('.header-activity-cluster');
      const historyRect = history?.getBoundingClientRect();
      const activityRect = activity?.getBoundingClientRect();
      const filterRect = filter?.getBoundingClientRect();
      const center = (rect) => rect ? rect.top + (rect.height / 2) : 0;
      return {
        shellExtrasReady: Boolean(document.getElementById('shell-extras-css')?.sheet),
        rowDisplay: row ? getComputedStyle(row).display : '',
        buttonDisplay: activity ? getComputedStyle(activity).display : '',
        buttonHeight: activityRect?.height || 0,
        activityInLiveHead: Boolean(activity && liveHead?.contains(activity)),
        activityBeforeFilter: Boolean(activityRect && filterRect
          && activityRect.right <= filterRect.left + 1
          && Math.abs(center(activityRect) - center(filterRect)) <= 4),
        clusterPresent: Boolean(cluster),
        clusterLoading: cluster?.classList.contains('is-loading') || false,
        slots: Array.from(line?.querySelectorAll('[data-usage-slot]') || [], (node) => node.dataset.usageSlot),
        text: activity?.textContent?.replace(/\s+/g, ' ').trim() || '',
        ariaBusy: activity?.getAttribute('aria-busy') || '',
        overflow: document.documentElement.scrollWidth - innerWidth
      };
    });
    assert(
      firstPaintState.shellExtrasReady
        && firstPaintState.rowDisplay === 'flex'
        && firstPaintState.buttonDisplay === 'block'
        && firstPaintState.buttonHeight >= 29
        && firstPaintState.activityInLiveHead
        && firstPaintState.activityBeforeFilter,
      `hero command bar first paint: render-blocking shell geometry is not ready ${JSON.stringify(firstPaintState)}`
    );
    assert(
      firstPaintState.clusterPresent
        && firstPaintState.clusterLoading
        && firstPaintState.slots.join(',') === 'tx,moved,nft,whale'
        && !/syncing/i.test(firstPaintState.text)
        && firstPaintState.ariaBusy === 'true'
        && firstPaintState.overflow <= 1,
      `hero command bar first paint: activity shell is not shape-correct ${JSON.stringify(firstPaintState)}`
    );
    await firstPaintContext.close();
    }

    if (section === 'all' || section === 'desktop') {
    await smokeSearchCatalogRecovery(browser, baseUrl);
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(context);
    await context.addInitScript(() => {
      localStorage.setItem('tezos-systems-theme', 'matrix');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    });
    const page = await context.newPage();
    await page.clock.install();
    attachIssueCollectors(page, 'hero command bar', issues);

    const response = await page.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `hero command bar: dashboard failed with HTTP ${response?.status()}`);
    await page.locator('#hero-search-input').waitFor({ state: 'visible', timeout: 10000 });
    const frontDoorOrder = await page.evaluate(() => {
      const ids = ['pulse-ticker-strip', 'live-head', 'chambers-section'];
      return ids.map((id) => {
        const el = document.getElementById(id);
        return { id, position: el ? Array.prototype.indexOf.call(document.body.querySelectorAll('*'), el) : -1 };
      });
    });
    for (const item of frontDoorOrder) {
      assert(item.position >= 0, `hero command bar: missing front-door section #${item.id}`);
    }
    const orderPositions = frontDoorOrder.map((item) => item.position);
    assert(orderPositions.every((position, index) => index === 0 || position > orderPositions[index - 1]), `hero command bar: first-screen order mismatch: ${JSON.stringify(frontDoorOrder)}`);
    await page.waitForFunction(() => {
      const island = document.getElementById('pulse-ticker-strip');
      return island
        && island.querySelector('[data-pulse-run="live"]')
        && island.querySelectorAll('[data-hot-signal-index]').length >= 4;
    }, null, { timeout: 10000 }).catch(async error => {
      const receipt = await page.evaluate(() => ({
        dashboard: document.documentElement.dataset.dashboardReady,
        pulse: document.querySelector('#pulse-ticker-strip')?.outerHTML,
        quality: document.querySelector('#data-status')?.innerText,
        briefing: localStorage.getItem('tezos-systems-briefing-cache')
      }));
      throw new Error(`hero command bar: Live Pulse did not populate ${JSON.stringify(receipt)}\n${error.message}`);
    });
    const livePulseState = await page.evaluate(() => ({
      runWidth: document.querySelector('#pulse-ticker-strip [data-pulse-run="live"]')?.getBoundingClientRect().width || 0,
      viewportWidth: document.querySelector('#pulse-ticker-viewport')?.clientWidth || 0,
      barHeight: document.querySelector('#pulse-ticker-bar')?.getBoundingClientRect().height || 0,
      gap: (() => {
        const pulse = document.getElementById('pulse-ticker-strip')?.getBoundingClientRect();
        const block = document.getElementById('live-head')?.getBoundingClientRect();
        return pulse && block ? block.top - pulse.bottom : -1;
      })(),
      hasOldLead: Boolean(document.querySelector('#pulse-ticker-strip .hot-today-lead')),
      metricCount: document.querySelectorAll('#pulse-ticker-strip .hot-today-metric').length,
      cardCount: document.querySelectorAll('#pulse-ticker-strip [data-hot-signal-index]').length,
      ageCount: document.querySelectorAll('#pulse-ticker-strip [data-hot-age]').length,
      emptyAgeCount: Array.from(document.querySelectorAll('#pulse-ticker-strip [data-hot-age]')).filter((node) => !node.textContent.trim()).length,
      pulseState: document.getElementById('pulse-ticker-strip')?.dataset.pulseState || '',
      pulseMotion: document.getElementById('pulse-ticker-strip')?.dataset.pulseMotion || '',
      ariaBusy: document.getElementById('pulse-ticker-strip')?.getAttribute('aria-busy') || '',
      visuals: [...new Set(Array.from(document.querySelectorAll('#pulse-ticker-strip [data-hot-visual]'), (card) => card.dataset.hotVisual))],
      spectacles: [...new Set(Array.from(document.querySelectorAll('#pulse-ticker-strip [data-hot-spectacle]'), (card) => card.dataset.hotSpectacle))],
      missingSignalIdentity: document.querySelectorAll('#pulse-ticker-strip [data-hot-signal-index]:not([data-hot-visual]), #pulse-ticker-strip [data-hot-signal-index]:not([data-hot-spectacle])').length,
      clock: document.querySelector('#pulse-ticker-strip [data-hot-live="clock"]')?.textContent?.trim() || '',
      governanceText: document.querySelector('#pulse-ticker-strip [data-hot-signal-id^="live-governance-"]')?.textContent?.replace(/\s+/g, ' ').trim() || ''
    }));
    assert(!livePulseState.hasOldLead && livePulseState.metricCount === 0, `hero command bar: live pulse should be one scrolling strip, saw ${JSON.stringify(livePulseState)}`);
    assert(livePulseState.cardCount >= 4, `hero command bar: live pulse should keep at least four ranked signals in the strip, saw ${JSON.stringify(livePulseState)}`);
    assert(livePulseState.runWidth > livePulseState.viewportWidth, `hero command bar: live pulse run should drift through a clipped viewport, saw ${JSON.stringify(livePulseState)}`);
    assert(livePulseState.barHeight <= 68 && livePulseState.gap >= 4 && livePulseState.gap <= 20, `hero command bar: stacked ticker geometry drifted ${JSON.stringify(livePulseState)}`);
    assert(
      livePulseState.ageCount === livePulseState.cardCount * 2
        && livePulseState.emptyAgeCount === 0
        && livePulseState.pulseState === 'ready'
        && ['running', 'paused'].includes(livePulseState.pulseMotion)
        && livePulseState.ariaBusy === 'false'
        && /^(?:Just now|\d+[smhd] ago)$/i.test(livePulseState.clock),
      `hero command bar: timing, history context, or trust state is incomplete ${JSON.stringify(livePulseState)}`
    );
    if (livePulseState.governanceText) {
      assert(
        /testing and review|no ballot in this period/i.test(livePulseState.governanceText)
          && !/participation|voters?/i.test(livePulseState.governanceText),
        `hero command bar: cooldown governance card implies a ballot ${JSON.stringify(livePulseState)}`
      );
    }
    assert(livePulseState.visuals.length >= 3 && livePulseState.missingSignalIdentity === 0, `hero command bar: live pulse cards should expose varied visual species, saw ${JSON.stringify(livePulseState)}`);
    assert(livePulseState.spectacles.some((level) => level !== 'quiet'), `hero command bar: live pulse should contain at least one notable spectacle tier, saw ${JSON.stringify(livePulseState)}`);
    const retainedContractBefore = await page.evaluate(() => {
      const card = document.querySelector('#pulse-ticker-strip [data-hot-signal-id="live-contracts"]');
      window.__livePulseRetainedContract = card;
      return card?.textContent?.replace(/\s+/g, ' ').trim() || '';
    });
    if (retainedContractBefore) {
      await page.evaluate(async () => {
        const pulse = await import('/js/features/daily-briefing.js');
        await pulse.updateHotTodayIsland({
          cycle: window.__lastStats?.cycle || 101,
          blockLevel: window.__lastStats?.blockLevel || 13600008,
          contractCalls24h: null,
          _quality: {
            status: 'partial',
            observedAt: new Date().toISOString(),
            unavailableCategories: ['contractCalls24h'],
            staleCategories: []
          }
        }, 0.23);
      });
      const retainedContractAfter = await page.evaluate(() => {
        const card = document.querySelector('#pulse-ticker-strip [data-hot-signal-id="live-contracts"]');
        return {
          sameNode: card === window.__livePulseRetainedContract,
          text: card?.textContent?.replace(/\s+/g, ' ').trim() || '',
          pulseState: document.getElementById('pulse-ticker-strip')?.dataset.pulseState || ''
        };
      });
      assert(
        retainedContractAfter.sameNode
          && retainedContractAfter.text === retainedContractBefore
          && retainedContractAfter.pulseState === 'ready',
        `hero command bar: source-aware last-good contract signal was lost or replaced ${JSON.stringify({ retainedContractBefore, retainedContractAfter })}`
      );
      await page.evaluate(async () => {
        const pulse = await import('/js/features/daily-briefing.js');
        const staleObservedAt = new Date(Date.now() - (5 * 60 * 60 * 1000)).toISOString();
        await pulse.updateHotTodayIsland({
          cycle: window.__lastStats?.cycle || 101,
          blockLevel: window.__lastStats?.blockLevel || 13600008,
          contractCalls24h: 444444,
          _quality: {
            status: 'stale',
            observedAt: staleObservedAt,
            unavailableCategories: [],
            staleCategories: ['contractCalls24h'],
            staleObservedAt: { contractCalls24h: staleObservedAt }
          }
        }, 0.23);
      });
      await page.waitForFunction(() => (
        !document.querySelector('#pulse-ticker-strip [data-hot-signal-id="live-contracts"]')
      ), null, { timeout: 5000 });
    }
    await page.waitForFunction(() => {
      const target = document.getElementById('recruit-section') || document.getElementById('comparison-section');
      if (!target) return false;
      const targetTop = target.getBoundingClientRect().top + window.scrollY;
      return targetTop > window.innerHeight;
    }, null, { timeout: 5000 });
    const bottomScrollTarget = await page.evaluate(() => {
      const target = document.getElementById('recruit-section') || document.getElementById('comparison-section');
      const targetTop = Math.round(target.getBoundingClientRect().top + window.scrollY);
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const expectedTop = Math.min(targetTop, maxScroll);
      window.scrollTo({ top: expectedTop, behavior: 'instant' });
      return { targetTop: expectedTop, targetId: target.id };
    });
    await page.waitForFunction((targetTop) => Math.abs(window.scrollY - targetTop) <= 12, bottomScrollTarget.targetTop, { timeout: 3000 });
    const bottomScrollState = {
      before: await page.evaluate(() => Math.round(window.scrollY)),
      targetId: bottomScrollTarget.targetId
    };
    await page.clock.fastForward(8500);
    const bottomScrollAfter = await page.evaluate(() => Math.round(window.scrollY));
    assert(Math.abs(bottomScrollAfter - bottomScrollState.before) <= 12, `hero command bar: live pulse rotation should not pull the page from ${bottomScrollState.targetId}, scroll ${bottomScrollState.before} -> ${bottomScrollAfter}`);
    const bottomMapOrder = await page.evaluate(() => {
      const ids = ['comparison-section', 'recruit-section'];
      return ids.map((id) => {
        const el = document.getElementById(id);
        return { id, position: el ? Array.prototype.indexOf.call(document.body.querySelectorAll('*'), el) : -1 };
      });
    });
    assert(bottomMapOrder.every((item) => item.position >= 0), `hero command bar: missing lower map section: ${JSON.stringify(bottomMapOrder)}`);
    assert(bottomMapOrder[1].position > bottomMapOrder[0].position, `hero command bar: Handoff should sit after dashboard tools: ${JSON.stringify(bottomMapOrder)}`);
    const handoffGap = await page.evaluate(() => {
      const main = document.querySelector('main');
      const handoff = document.getElementById('recruit-section');
      if (!main || !handoff) return Number.NaN;
      return Math.round(handoff.getBoundingClientRect().top - main.getBoundingClientRect().bottom);
    });
    assert(Number.isFinite(handoffGap) && handoffGap >= 24 && handoffGap <= 128, `hero command bar: Handoff should close the old dead seam while retaining a deliberate threshold, saw ${handoffGap}px`);
    const deckChromeState = await page.evaluate(() => ({
      commandDeckHeadCount: document.querySelectorAll('.command-deck-head').length,
      upgradeShareCount: document.querySelectorAll('#upgrade-share-btn').length
    }));
    assert(deckChromeState.commandDeckHeadCount === 0, 'hero command bar: command deck should not show protocol chrome above search');
    assert(deckChromeState.upgradeShareCount === 0, 'hero command bar: old upgrade share button should not remain in the first-screen search deck');

    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForFunction(() => window.scrollY === 0, null, { timeout: 3000 });
    const pointerSearchBox = await page.locator('#hero-search-input').boundingBox();
    const pointerViewport = page.viewportSize();
    assert(pointerSearchBox && pointerViewport && pointerSearchBox.y >= 0 && pointerSearchBox.y + pointerSearchBox.height <= pointerViewport.height, `hero command bar: search input is not available for a direct pointer launch ${JSON.stringify({ pointerSearchBox, pointerViewport })}`);
    const pointerSearchScroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
    await page.mouse.click(pointerSearchBox.x + (pointerSearchBox.width / 2), pointerSearchBox.y + (pointerSearchBox.height / 2));
    await page.waitForFunction(() => document.body.classList.contains('hero-search-mode') && document.activeElement?.id === 'hero-search-input', null, { timeout: 5000 });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.body.classList.contains('hero-search-mode') && document.activeElement?.id === 'hero-search-input', null, { timeout: 5000 });
    const pointerSearchRestore = await page.evaluate(() => ({
      parentId: document.getElementById('hero-slot')?.parentElement?.id || '',
      overlayHidden: document.getElementById('hero-search-overlay')?.hidden ?? false,
      scroll: { x: window.scrollX, y: window.scrollY }
    }));
    assert(
      pointerSearchRestore.parentId === 'live-head'
        && pointerSearchRestore.overlayHidden
        && Math.abs(pointerSearchRestore.scroll.x - pointerSearchScroll.x) <= 1
        && Math.abs(pointerSearchRestore.scroll.y - pointerSearchScroll.y) <= 1,
      `hero command bar: direct pointer close did not restore the search opener and exact scroll ${JSON.stringify({ pointerSearchScroll, pointerSearchRestore })}`
    );

    await page.locator('#header-protocol-chip').click();
    await page.waitForFunction(() => window.location.hash === '#protocol-history', null, { timeout: 5000 });
    await page.locator('#protocol-history-chamber-modal.active .protocol-anthology-list .protocol-anthology-chapter').first().waitFor({ state: 'visible', timeout: 10000 });
    const firstProtocolInHistory = await page.locator('#protocol-history-chamber-modal .protocol-anthology-list .protocol-anthology-chapter').first().getAttribute('data-protocol-open');
    assert(firstProtocolInHistory === 'Ushuaia', `hero command bar: Protocol Anthology should start at current protocol, saw ${firstProtocolInHistory}`);
    await page.keyboard.press('/');
    const modalSlashState = await page.evaluate(() => ({
      modalActive: Boolean(document.querySelector('#protocol-history-chamber-modal.active')),
      searchFocused: document.activeElement?.id === 'hero-search-input',
      searchOpen: document.body.classList.contains('hero-search-mode')
    }));
    assert(modalSlashState.modalActive && !modalSlashState.searchFocused && !modalSlashState.searchOpen, `hero command bar: slash shortcut escaped an active Chamber ${JSON.stringify(modalSlashState)}`);
    await page.locator('#protocol-history-chamber-modal .chamber-close').click();
    await page.locator('#protocol-history-chamber-modal').waitFor({ state: 'detached', timeout: 5000 });
    try {
      await page.waitForFunction(() => document.activeElement?.id === 'header-protocol-chip', null, { timeout: 5000 });
    } catch (error) {
      const active = await page.evaluate(() => ({
        id: document.activeElement?.id || '',
        tag: document.activeElement?.tagName || '',
        className: document.activeElement?.className || ''
      }));
      throw new Error(`${error.message}\nhero command bar focus snapshot: ${JSON.stringify(active)}`);
    }

    const launchState = await page.evaluate(() => {
      const root = document.getElementById('hero-slot');
      window.__heroSearchOriginalRoot = root;
      window.__heroSearchOriginalParent = root?.parentElement;
      const opener = document.activeElement;
      const scroll = { x: window.scrollX, y: window.scrollY };
      const startedAt = performance.now();
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: '/',
        bubbles: true,
        cancelable: true
      }));
      return {
        elapsed: performance.now() - startedAt,
        open: document.body.classList.contains('hero-search-mode'),
        focused: document.activeElement?.id === 'hero-search-input',
        starterCount: document.querySelectorAll('#hero-search-panel [role="option"]').length,
        loomRouteCount: document.querySelectorAll('#hero-search-panel .hero-search-index-route').length,
        loomNodeCount: document.querySelectorAll('#hero-search-panel [data-hero-loom-query]').length,
        loomActiveRoute: document.querySelector('#hero-search-panel .hero-search-index-loom')?.dataset.indexActiveRoute || '',
        sameRoot: document.getElementById('hero-slot') === root,
        openerId: opener?.id || '',
        scroll,
        scrollAfter: { x: window.scrollX, y: window.scrollY }
      };
    });
    assert(
      launchState.open
        && launchState.focused
        && launchState.starterCount === 6
        && launchState.loomRouteCount === 6
        && launchState.loomNodeCount === 24
        && launchState.loomActiveRoute === 'network'
        && launchState.sameRoot
        && launchState.elapsed < 100
        && launchState.scroll.x === launchState.scrollAfter.x
        && launchState.scroll.y === launchState.scrollAfter.y,
      `hero command bar: Index Chamber did not launch synchronously with six starter actions ${JSON.stringify(launchState)}`
    );
    await page.waitForFunction(() => document.activeElement?.id === 'hero-search-input', null, { timeout: 5000 });
    await page.locator('#hero-search-panel').waitFor({ state: 'visible', timeout: 5000 });
    const focusModeState = await page.evaluate(() => {
      const main = document.querySelector('.main-content');
      const header = document.querySelector('header.header');
      const pulse = document.querySelector('#pulse-ticker-strip');
      const liveHead = document.querySelector('#live-head');
      const root = document.querySelector('#hero-slot');
      const overlay = document.querySelector('#hero-search-overlay');
      const chamber = overlay?.querySelector('[data-hero-search-chamber]');
      const form = document.querySelector('#hero-search-form');
      const panel = document.querySelector('#hero-search-panel');
      const overlayRect = overlay?.getBoundingClientRect();
      const formRect = form?.getBoundingClientRect();
      const panelRect = panel?.getBoundingClientRect();
      const sheetRect = panel?.querySelector('.hero-search-sheet')?.getBoundingClientRect();
      const loomRect = panel?.querySelector('.hero-search-index-loom')?.getBoundingClientRect();
      const viewport = window.visualViewport;
      const viewportRect = {
        top: viewport?.offsetTop || 0,
        left: viewport?.offsetLeft || 0,
        width: viewport?.width || innerWidth,
        height: viewport?.height || innerHeight
      };
      const viewportBottom = viewportRect.top + viewportRect.height;
      return {
        bodyMode: document.body.classList.contains('hero-search-mode'),
        mainInert: main.hasAttribute('inert'),
        mainOpacity: Number.parseFloat(getComputedStyle(main).opacity),
        mainPointerEvents: getComputedStyle(main).pointerEvents,
        mainFilter: getComputedStyle(main).filter,
        mainTransform: getComputedStyle(main).transform,
        headerInert: header.hasAttribute('inert'),
        pulseInert: pulse.hasAttribute('inert'),
        headerOpacity: getComputedStyle(header).opacity,
        pulseOpacity: getComputedStyle(pulse).opacity,
        overlayPosition: getComputedStyle(overlay).position,
        overlayHidden: overlay.hidden,
        overlayAriaHidden: overlay.getAttribute('aria-hidden'),
        overlayRect: overlayRect ? { top: overlayRect.top, left: overlayRect.left, width: overlayRect.width, height: overlayRect.height } : null,
        viewportRect,
        rootSameNode: root === window.__heroSearchOriginalRoot,
        rootInChamber: root?.parentElement === chamber,
        anchorInLiveHead: Boolean(liveHead?.querySelector('.hero-search-anchor')),
        dialogRole: chamber?.getAttribute('role') || '',
        dialogModal: chamber?.getAttribute('aria-modal') || '',
        dialogLabel: chamber?.getAttribute('aria-label') || '',
        panelPosition: getComputedStyle(panel).position,
        panelBelowForm: Boolean(panelRect && formRect && panelRect.top >= formRect.bottom),
        panelSameWidth: Boolean(panelRect && formRect && Math.abs(panelRect.width - formRect.width) <= 1),
        formTopGap: formRect ? formRect.top - viewportRect.top : 999,
        panelBottomGap: panelRect ? viewportBottom - panelRect.bottom : 999,
        panelMaxHeight: getComputedStyle(panel).maxHeight,
        sheetContentSized: Boolean(panelRect && sheetRect && sheetRect.height < panelRect.height - 20),
        loomBelowSheet: Boolean(sheetRect && loomRect && loomRect.top >= sheetRect.bottom - 1),
        loomWithinPanel: Boolean(panelRect && loomRect && loomRect.bottom <= panelRect.bottom + 1),
        loomRouteCount: panel.querySelectorAll('.hero-search-index-route').length,
        loomNodeCount: panel.querySelectorAll('[data-hero-loom-query]').length,
        panelBackdrop: getComputedStyle(panel).backdropFilter || getComputedStyle(panel).webkitBackdropFilter || '',
        overlayBackdrop: getComputedStyle(overlay).backdropFilter || getComputedStyle(overlay).webkitBackdropFilter || '',
        resultButtons: panel.querySelectorAll('button[role="option"]').length,
        bodyOverflow: getComputedStyle(document.body).overflow,
        htmlOverflow: getComputedStyle(document.documentElement).overflow,
        scroll: { x: window.scrollX, y: window.scrollY }
      };
    });
    assert(focusModeState.bodyMode, 'hero command bar: search focus state signal is missing');
    assert(focusModeState.mainInert && focusModeState.headerInert && focusModeState.pulseInert && focusModeState.mainOpacity === 1 && focusModeState.mainFilter === 'none' && focusModeState.mainTransform === 'none', `hero command bar: Index Chamber did not isolate its undimmed background ${JSON.stringify(focusModeState)}`);
    assert(focusModeState.headerOpacity === '1' && focusModeState.pulseOpacity === '1', `hero command bar: search focus dimmed the header or Live Pulse ${JSON.stringify(focusModeState)}`);
    assert(
      focusModeState.overlayPosition === 'fixed'
        && !focusModeState.overlayHidden
        && focusModeState.overlayAriaHidden === 'false'
        && focusModeState.rootSameNode
        && focusModeState.rootInChamber
        && focusModeState.anchorInLiveHead
        && focusModeState.dialogRole === 'dialog'
        && focusModeState.dialogModal === 'true'
        && /The Index/.test(focusModeState.dialogLabel),
      `hero command bar: full-screen dialog/root identity contract failed ${JSON.stringify(focusModeState)}`
    );
    assert(
      Math.abs(focusModeState.overlayRect.top - focusModeState.viewportRect.top) <= 2
        && Math.abs(focusModeState.overlayRect.left - focusModeState.viewportRect.left) <= 2
        && Math.abs(focusModeState.overlayRect.width - focusModeState.viewportRect.width) <= 2
        && Math.abs(focusModeState.overlayRect.height - focusModeState.viewportRect.height) <= 2
        && focusModeState.formTopGap >= 8
        && focusModeState.formTopGap <= 16
        && focusModeState.panelPosition === 'relative'
        && focusModeState.panelBelowForm
        && focusModeState.panelSameWidth
        && focusModeState.panelBottomGap >= 8
        && focusModeState.panelBottomGap <= 16
        && focusModeState.panelMaxHeight === 'none',
      `hero command bar: Index Chamber does not fill the visual viewport ${JSON.stringify(focusModeState)}`
    );
    assert(
      focusModeState.sheetContentSized
        && focusModeState.loomBelowSheet
        && focusModeState.loomWithinPanel
        && focusModeState.loomRouteCount === 6
        && focusModeState.loomNodeCount === 24,
      `hero command bar: starter sheet or Index Loom geometry drifted ${JSON.stringify(focusModeState)}`
    );
    assert(
      ['none', ''].includes(focusModeState.panelBackdrop)
        && ['none', ''].includes(focusModeState.overlayBackdrop)
        && focusModeState.resultButtons === 0
        && focusModeState.bodyOverflow === 'hidden'
        && focusModeState.htmlOverflow === 'hidden'
        && Math.abs(focusModeState.scroll.x - launchState.scroll.x) <= 1
        && Math.abs(focusModeState.scroll.y - launchState.scroll.y) <= 1,
      `hero command bar: fast launch, active-descendant, or scroll-lock contract failed ${JSON.stringify(focusModeState)}`
    );

    const themeStates = await page.evaluate(async (themes) => {
      const { setTheme } = await import('/js/ui/theme.js');
      const states = [];
      for (const theme of themes) {
        setTheme(theme);
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const overlay = document.getElementById('hero-search-overlay');
        const panel = document.getElementById('hero-search-panel');
        const panelRect = panel?.getBoundingClientRect();
        const loom = panel?.querySelector('.hero-search-index-loom');
        const starters = Array.from(panel?.querySelectorAll('.hero-search-group.is-starter .hero-search-result') || []);
        states.push({
          theme,
          visible: Boolean(overlay && !overlay.hidden && overlay.getClientRects().length),
          position: getComputedStyle(overlay).position,
          panelPosition: getComputedStyle(panel).position,
          panelBackdrop: getComputedStyle(panel).backdropFilter || getComputedStyle(panel).webkitBackdropFilter || '',
          starterCount: starters.length,
          loomDisplay: loom ? getComputedStyle(loom).display : 'none',
          loomRouteCount: loom?.querySelectorAll('.hero-search-index-route').length || 0,
          loomNodeCount: loom?.querySelectorAll('[data-hero-loom-query]').length || 0,
          startersVisible: starters.every((row) => {
            const rect = row.getBoundingClientRect();
            return panelRect && rect.top >= panelRect.top - 1 && rect.bottom <= panelRect.bottom + 1;
          }),
          overflow: document.documentElement.scrollWidth - innerWidth
        });
      }
      setTheme('matrix');
      return states;
    }, ['aurora', 'matrix', 'hen', 'default', 'void', 'ember', 'signal', 'nerv', 'clean', 'dark', 'bubblegum', 'abyss', 'moss', 'valley', 'warzone']);
    assert(
      themeStates.every((state) => state.visible
        && state.position === 'fixed'
        && state.panelPosition === 'relative'
        && ['none', ''].includes(state.panelBackdrop)
        && state.starterCount === 6
        && state.loomDisplay === 'grid'
        && state.loomRouteCount === 6
        && state.loomNodeCount === 24
        && state.startersVisible
        && state.overflow <= 1),
      `hero command bar: Index Chamber drifted across themes ${JSON.stringify(themeStates)}`
    );

    await page.emulateMedia({ reducedMotion: 'reduce' });
    const reducedMotionState = await page.evaluate(() => {
      const overlay = document.getElementById('hero-search-overlay');
      const panel = document.getElementById('hero-search-panel');
      const form = document.getElementById('hero-search-form');
      const loom = document.querySelector('.hero-search-index-loom');
      return {
        overlayAnimation: getComputedStyle(overlay).animationName,
        panelAnimation: getComputedStyle(panel).animationName,
        loomAnimation: getComputedStyle(loom).animationName,
        panelTransition: getComputedStyle(panel).transitionDuration,
        formTransition: getComputedStyle(form).transitionDuration
      };
    });
    assert(
      reducedMotionState.overlayAnimation === 'none'
        && reducedMotionState.panelAnimation === 'none'
        && reducedMotionState.loomAnimation === 'none'
        && /^0s(?:, 0s)*$/.test(reducedMotionState.panelTransition)
        && /^0s(?:, 0s)*$/.test(reducedMotionState.formTransition),
      `hero command bar: reduced motion retained search animation ${JSON.stringify(reducedMotionState)}`
    );
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    await page.locator('#hero-search-close').focus();
    await page.keyboard.press('Tab');
    assert(await page.evaluate(() => document.activeElement?.matches('[data-hero-loom-query]')), 'hero command bar: Tab did not enter the Index Loom after the close control');
    await page.locator('[data-hero-loom-query]').last().focus();
    await page.keyboard.press('Tab');
    assert(await page.evaluate(() => document.activeElement?.id === 'hero-search-input'), 'hero command bar: Tab escaped the Index Chamber instead of wrapping from the Loom to search');
    await page.keyboard.press('Shift+Tab');
    assert(await page.evaluate(() => document.activeElement === document.querySelector('[data-hero-loom-query]:last-of-type') || document.activeElement?.matches('[data-hero-loom-query]')), 'hero command bar: reverse Tab did not wrap to the final Index Loom control');
    await page.locator('#hero-search-input').focus();

    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.body.classList.contains('hero-search-mode') && document.activeElement?.id === 'header-protocol-chip', null, { timeout: 5000 });
    const restorationState = await page.evaluate(() => ({
      sameRoot: document.getElementById('hero-slot') === window.__heroSearchOriginalRoot,
      originalParent: document.getElementById('hero-slot')?.parentElement === window.__heroSearchOriginalParent,
      parentId: document.getElementById('hero-slot')?.parentElement?.id || '',
      anchorCount: document.querySelectorAll('.hero-search-anchor').length,
      overlayHidden: document.getElementById('hero-search-overlay')?.hidden ?? false,
      mainInert: document.querySelector('main')?.hasAttribute('inert') || false,
      bodyOverflow: getComputedStyle(document.body).overflow,
      htmlOverflow: getComputedStyle(document.documentElement).overflow,
      scroll: { x: window.scrollX, y: window.scrollY }
    }));
    assert(
      restorationState.sameRoot
        && restorationState.originalParent
        && restorationState.parentId === 'live-head'
        && restorationState.anchorCount === 0
        && restorationState.overlayHidden
        && !restorationState.mainInert
        && restorationState.bodyOverflow !== 'hidden'
        && restorationState.htmlOverflow !== 'hidden'
        && Math.abs(restorationState.scroll.x - launchState.scroll.x) <= 1
        && Math.abs(restorationState.scroll.y - launchState.scroll.y) <= 1,
      `hero command bar: Escape did not restore exact root, focus, scroll, and overlay state ${JSON.stringify(restorationState)}`
    );
    await page.keyboard.press('/');
    await page.waitForFunction(() => document.activeElement?.id === 'hero-search-input' && document.querySelectorAll('#hero-search-panel [role="option"]').length === 6, null, { timeout: 5000 });
    const emptyStateText = await page.locator('#hero-search-panel').innerText();
    const emptyStateOptions = await page.locator('#hero-search-panel [role="option"]').count();
    assert(/Wallet or \.tez/i.test(emptyStateText) && /Rooms/i.test(emptyStateText) && /Bakers/i.test(emptyStateText) && /Network/i.test(emptyStateText) && /Paste a hash/i.test(emptyStateText) && /Browse all/i.test(emptyStateText), `hero command bar: mission-control starters are incomplete: ${emptyStateText}`);
    assert(emptyStateOptions === 6, `hero command bar: blank search should render six starters, saw ${emptyStateOptions}`);
    assert(!/Start from anything|All \d+ destinations|Press \/ from anywhere|Governance RSS/.test(emptyStateText), `hero command bar: blank search expanded into the retired directory/guide: ${emptyStateText}`);
    const starterGeometry = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('#hero-search-panel .hero-search-result'));
      return {
        descriptionsVisible: rows.filter((row) => {
          const description = row.querySelector('.hero-result-copy span');
          return description && getComputedStyle(description).display !== 'none';
        }).length,
        maxHeight: Math.max(0, ...rows.map((row) => row.getBoundingClientRect().height))
      };
    });
    assert(starterGeometry.descriptionsVisible === 6 && starterGeometry.maxHeight >= 88 && starterGeometry.maxHeight <= 118, `hero command bar: empty starters should read as six composed index cards ${JSON.stringify(starterGeometry)}`);
    const idleChrome = await page.evaluate(() => ({
      chipsDisplay: getComputedStyle(document.getElementById('hero-search-chips')).display,
      markDisplay: getComputedStyle(document.querySelector('.live-head-panel .hero-search-mark')).display
    }));
    assert(idleChrome.chipsDisplay === 'none' && idleChrome.markDisplay === 'grid', `hero command bar: open search should expose its index sigil without reviving terminal chips ${JSON.stringify(idleChrome)}`);
    await page.waitForFunction(() => document.querySelectorAll('#hero-search-panel .hero-search-index-weave path').length === 20, null, { timeout: 5000 });
    const loomState = await page.evaluate(() => {
      const loom = document.querySelector('#hero-search-panel .hero-search-index-loom');
      const routes = loom?.querySelector('.hero-search-index-routes');
      return {
        routes: loom?.querySelectorAll('.hero-search-index-route').length || 0,
        nodes: loom?.querySelectorAll('[data-hero-loom-query]').length || 0,
        weavePaths: loom?.querySelectorAll('.hero-search-index-weave path').length || 0,
        columns: routes ? getComputedStyle(routes).gridTemplateColumns.split(/\s+/).filter(Boolean).length : 0,
        activeRoute: loom?.dataset.indexActiveRoute || '',
        labels: Array.from(loom?.querySelectorAll('.hero-search-index-node > span:last-child') || [], (node) => node.textContent?.trim() || ''),
        overflow: document.documentElement.scrollWidth - innerWidth
      };
    });
    assert(
      loomState.routes === 6
        && loomState.nodes === 24
        && loomState.weavePaths === 20
        && loomState.columns === 6
        && loomState.activeRoute === 'network'
        && ['WALLET', '.TEZ', 'DELEGATION', 'REWARDS', 'NETWORK', 'BLOCKS', 'CONSENSUS', 'HEALTH', 'ROOMS', 'ECOSYSTEM', 'GOVERNANCE', 'HISTORY', 'BAKERS', 'DIRECTORY', 'RIGHTS', 'PERFORMANCE', 'HASH', 'OPERATION', 'CONTRACT', 'RECEIPT', 'BROWSE', 'CHAMBERS', 'GUIDES', 'TOOLS'].every((label) => loomState.labels.includes(label))
        && loomState.overflow <= 1,
      `hero command bar: idle Index Loom is incomplete or overflowed ${JSON.stringify(loomState)}`
    );
    await page.locator('#hero-search-panel [data-hero-loom-query="network"]').click();
    await page.waitForFunction(() => (
      document.getElementById('hero-search-input')?.value === 'network'
        && !document.querySelector('#hero-search-panel .hero-search-index-loom')
        && document.querySelector('#hero-search-panel .hero-search-route-trail')
    ), null, { timeout: 5000 });
    const typedLoomState = await page.evaluate(() => {
      const panel = document.getElementById('hero-search-panel');
      const sheet = panel?.querySelector('.hero-search-sheet.is-results');
      const selected = panel?.querySelector('.hero-search-result.is-selected');
      const panelRect = panel?.getBoundingClientRect();
      const sheetRect = sheet?.getBoundingClientRect();
      const selectedRect = selected?.getBoundingClientRect();
      const formRect = document.getElementById('hero-search-form')?.getBoundingClientRect();
      const inputRect = document.getElementById('hero-search-input')?.getBoundingClientRect();
      const markRect = document.querySelector('.hero-search-mark')?.getBoundingClientRect();
      const submitRect = document.querySelector('.hero-search-submit')?.getBoundingClientRect();
      const closeRect = document.querySelector('.hero-search-close')?.getBoundingClientRect();
      const center = (rect) => rect ? rect.top + rect.height / 2 : Number.NaN;
      const formCenter = center(formRect);
      return {
        path: document.getElementById('hero-slot')?.dataset.heroSearchPath || '',
        trail: panel?.querySelector('.hero-search-route-trail')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        trailHref: panel?.querySelector('.hero-search-route-trail')?.getAttribute('href') || '',
        loomPresent: Boolean(panel?.querySelector('.hero-search-index-loom')),
        sheetReachesFloor: Boolean(panelRect && sheetRect && sheetRect.height >= panelRect.height - 1),
        selectedVisible: Boolean(panelRect && selectedRect && selectedRect.top >= panelRect.top - 1 && selectedRect.bottom <= panelRect.bottom + 1),
        panelMaxHeight: panel ? getComputedStyle(panel).maxHeight : '',
        queryHelpDisplay: getComputedStyle(document.querySelector('.hero-search-help')).display,
        maxControlCenterDelta: Math.max(...[inputRect, markRect, submitRect, closeRect].map((rect) => Math.abs(center(rect) - formCenter)))
      };
    });
    assert(
      typedLoomState.path === 'network'
        && /NETWORK.*BLOCKS.*CONSENSUS.*HEALTH/.test(typedLoomState.trail)
        && typedLoomState.trailHref === '/health/'
        && !typedLoomState.loomPresent
        && typedLoomState.sheetReachesFloor
        && typedLoomState.selectedVisible
        && typedLoomState.panelMaxHeight === 'none'
        && typedLoomState.queryHelpDisplay === 'none'
        && typedLoomState.maxControlCenterDelta <= 1,
      `hero command bar: typing did not replace the Loom with a full-height routed result sheet ${JSON.stringify(typedLoomState)}`
    );
    await page.locator('#hero-search-input').fill('');
    await page.waitForFunction(() => document.querySelectorAll('#hero-search-panel [role="option"]').length === 6 && Boolean(document.querySelector('#hero-search-panel .hero-search-index-loom')), null, { timeout: 5000 });
    await page.locator('#hero-search-panel .hero-search-result[data-result-id="starter:rooms"]').click();
    await page.waitForFunction(() => document.getElementById('hero-search-input')?.value === 'rooms', null, { timeout: 5000 });
    const roomsOpenState = await page.evaluate(() => ({
      expanded: document.getElementById('hero-search-input')?.getAttribute('aria-expanded') || '',
      hidden: document.getElementById('hero-search-panel')?.hidden ?? true,
      bodyMode: document.body.classList.contains('hero-search-mode')
    }));
    assert(roomsOpenState.expanded === 'true' && !roomsOpenState.hidden && roomsOpenState.bodyMode, `hero command bar: Rooms closed the attached list ${JSON.stringify(roomsOpenState)}`);
    await page.locator('#hero-search-input').fill('');
    await page.waitForFunction(() => document.querySelectorAll('#hero-search-panel [role="option"]').length === 6 && Boolean(document.querySelector('#hero-search-panel .hero-search-index-loom')), null, { timeout: 5000 });
    await page.locator('#hero-search-input').fill('zzzz-no-index-path');
    await page.waitForFunction(() => Boolean(document.querySelector('#hero-search-panel .hero-search-empty') && document.querySelector('#hero-search-panel .hero-search-index-recovery')), null, { timeout: 5000 });
    const recoveryState = await page.evaluate(() => ({
      path: document.getElementById('hero-slot')?.dataset.heroSearchPath || '',
      fullLoom: Boolean(document.querySelector('#hero-search-panel .hero-search-index-loom')),
      recoveryNodes: document.querySelectorAll('#hero-search-panel .hero-search-index-recovery [data-hero-loom-query]').length,
      recoveryText: document.querySelector('#hero-search-panel .hero-search-index-recovery')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      trailText: document.querySelector('#hero-search-panel .hero-search-route-trail')?.textContent?.replace(/\s+/g, ' ').trim() || ''
    }));
    assert(
      recoveryState.path === 'browse'
        && !recoveryState.fullLoom
        && recoveryState.recoveryNodes === 4
        && /Try a nearby path.*BROWSE.*CHAMBERS.*GUIDES.*TOOLS/.test(recoveryState.recoveryText)
        && /BROWSE.*CHAMBERS.*GUIDES.*TOOLS/.test(recoveryState.trailText),
      `hero command bar: unmatched query did not retain the nearest Loom branch ${JSON.stringify(recoveryState)}`
    );
    await page.locator('#hero-search-panel .hero-search-index-recovery [data-hero-loom-query="guides"]').click();
    await page.waitForFunction(() => document.getElementById('hero-search-input')?.value === 'guides' && Boolean(document.querySelector('#hero-search-panel .hero-search-result')), null, { timeout: 5000 });
    await page.locator('#hero-search-input').fill('');
    await page.waitForFunction(() => document.querySelectorAll('#hero-search-panel [role="option"]').length === 6 && Boolean(document.querySelector('#hero-search-panel .hero-search-index-loom')), null, { timeout: 5000 });
    await page.locator('#hero-search-panel .hero-search-result').filter({ hasText: 'Browse all' }).click();
    await page.waitForFunction(() => document.querySelectorAll('#hero-search-panel [role="option"]').length > 20, null, { timeout: 5000 });
    const browseAllText = await page.locator('#hero-search-panel').innerText();
    const browseAllOptions = await page.locator('#hero-search-panel [role="option"]').count();
    assert(browseAllOptions > 20, `hero command bar: explicit Browse all did not open the canonical destination list (${browseAllOptions})`);
    const browseAllOpenState = await page.evaluate(() => ({
      expanded: document.getElementById('hero-search-input')?.getAttribute('aria-expanded') || '',
      hidden: document.getElementById('hero-search-panel')?.hidden ?? true,
      browsingAll: document.getElementById('hero-slot')?.classList.contains('is-browsing-all') || false
    }));
    assert(browseAllOpenState.expanded === 'true' && !browseAllOpenState.hidden && browseAllOpenState.browsingAll, `hero command bar: Browse all closed or escaped the attached list ${JSON.stringify(browseAllOpenState)}`);
    for (const representative of ['Protocol Anthology', 'Ledger Flow', 'XTZ Market Watch', 'Staking Guide', 'Explore Tezos', 'HEN Live Feed', 'Governance RSS', 'XTZ Price Widget']) {
      assert(browseAllText.includes(representative), `hero command bar: explicit complete directory is missing ${representative}`);
    }
    const rankedSearchIntents = [
      ['my tezos', 'My Tezos'],
      ['wallet', 'My Tezos'],
      ['/leaderboard', 'Baker Directory'],
      ['/history', 'Cycle History'],
      ['widgets', 'Embed Widgets'],
      ['chambers', 'Explore Tezos'],
      ['governance', 'Tezos L1 Governance'],
      ['staking', 'Staking Chamber'],
      ['liquidity', 'Liquidity Baking'],
      ['finality', 'Network Health'],
      ['rewards tracker', 'My Tezos'],
      ['nakamoto coefficient', 'Network Health'],
      ['hot today', "What's Hot Today"],
      ['maxi passport', 'Maxi Passport'],
      ['season', 'Tezos Maxis Season'],
      ['champions', 'Tezos Maxis Champions'],
      ['transaction maxi', 'Transaction Maxi'],
      ['transaction season', 'Transaction Maxi Season'],
      ['transaction maxi season', 'Transaction Maxi Season'],
      ['transaction', 'Transaction Maxi'],
      ['delegation maxi', 'Delegation Maxi Season'],
      ['bridge maxi', 'Bridge Maxi Season'],
      ['tezos vs ethereum', 'Tezos vs Ethereum'],
      ['/changelog', '/changelog'],
      ['nft', 'HEN Live Feed'],
      ['/stake', 'Staking Chamber'],
      ['missed blocks octez', 'Network Health'],
      ['cost to transact', 'Network Fees by Layer'],
      ['how do i stake', 'Staking Guide'],
      ['fee', 'Network Fees by Layer']
    ];
    for (const [query, expectedTitle] of rankedSearchIntents) {
      await page.locator('#hero-search-input').fill(query);
      await page.waitForFunction(({ value, title }) => {
        const input = document.getElementById('hero-search-input');
        const first = document.querySelector('#hero-search-panel .hero-search-result strong');
        return input?.value === value && first?.textContent?.trim() === title;
      }, { value: query, title: expectedTitle }, { timeout: 5000 });
      const rankedText = await page.locator('#hero-search-panel').innerText();
      assert(!new RegExp(`Searching bakers for "${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'i').test(rankedText), `hero command bar: site intent fell through to baker loading for ${query}: ${rankedText}`);
    }
    await page.locator('#hero-search-input').fill('QuipuSwap');
    await page.waitForFunction(() => document.querySelector('#hero-search-panel .hero-search-result strong')?.textContent?.trim() === 'QuipuSwap', null, { timeout: 5000 });
    const quipuSearchText = await page.locator('#hero-search-panel').innerText();
    assert(/reviewed contract universe/i.test(quipuSearchText), `hero command bar: generated app catalog did not outrank unverified aliases: ${quipuSearchText}`);
    assert(await page.locator('#hero-search-panel .hero-search-result strong mark').filter({ hasText: 'QuipuSwap' }).count() >= 1, 'hero command bar: visible result does not explain its title match');

    await page.locator('#hero-search-input').fill('staking');
    await page.waitForFunction(() => /Show all \d+ results/.test(document.querySelector('#hero-search-panel')?.textContent || ''), null, { timeout: 5000 });
    const boundedSearchState = await page.evaluate(() => ({
      options: document.querySelectorAll('#hero-search-panel .hero-search-result').length,
      groups: Array.from(document.querySelectorAll('#hero-search-panel .hero-search-group-label'), (label) => label.textContent?.trim() || ''),
      unexplained: Array.from(document.querySelectorAll('#hero-search-panel .hero-search-result:not([data-result-id="show-more"])'))
        .filter((row) => !row.querySelector('mark'))
        .map((row) => row.querySelector('strong')?.textContent?.trim() || '')
    }));
    assert(
      boundedSearchState.options <= 11
        && boundedSearchState.groups.includes('More')
        && boundedSearchState.unexplained.length === 0,
      `hero command bar: first result paint is not globally budgeted or visibly explained ${JSON.stringify(boundedSearchState)}`
    );
    const showAllResult = page.locator('#hero-search-panel .hero-search-result').filter({ hasText: /Show all \d+ results/ });
    await showAllResult.scrollIntoViewIfNeeded();
    const expansionBefore = await page.evaluate(() => {
      const panel = document.getElementById('hero-search-panel');
      const option = panel?.querySelector('[data-result-id="show-more"]');
      const panelRect = panel?.getBoundingClientRect();
      const optionRect = option?.getBoundingClientRect();
      return {
        anchorOffset: optionRect && panelRect ? optionRect.top - panelRect.top : 0,
        visibleIds: Array.from(panel?.querySelectorAll('.hero-search-result:not([data-result-id="show-more"])') || [], (row) => row.dataset.resultId)
      };
    });
    await showAllResult.click();
    await page.waitForFunction(() => document.querySelectorAll('#hero-search-panel .hero-search-result').length > 11, null, { timeout: 5000 });
    const expansionAfter = await page.evaluate((before) => {
      const panel = document.getElementById('hero-search-panel');
      const selected = panel?.querySelector('.hero-search-result.is-selected');
      const panelRect = panel?.getBoundingClientRect();
      const selectedRect = selected?.getBoundingClientRect();
      return {
        selectedId: selected?.dataset.resultId || '',
        selectedIsNew: Boolean(selected?.dataset.resultId && !before.visibleIds.includes(selected.dataset.resultId)),
        anchorDelta: selectedRect && panelRect ? Math.abs((selectedRect.top - panelRect.top) - before.anchorOffset) : Infinity,
        scrollTop: panel?.scrollTop || 0
      };
    }, expansionBefore);
    assert(
      expansionAfter.selectedIsNew && expansionAfter.anchorDelta <= 5 && expansionAfter.scrollTop > 0,
      `hero command bar: Show all expansion lost its reading anchor ${JSON.stringify({ expansionBefore, expansionAfter })}`
    );

    await page.locator('#hero-search-input').fill('governence');
    await page.waitForFunction(() => /Did you mean “governance”/i.test(document.querySelector('#hero-search-panel')?.textContent || ''), null, { timeout: 5000 });

    // Keep the source pending until its loading UI is inspected. A fixed
    // 220 ms fixture can finish between the wait and assertion on a busy host.
    let releaseAliasResponse;
    const aliasResponseGate = new Promise(resolve => { releaseAliasResponse = resolve; });
    await context.route('https://api.tzkt.io/v1/suggest/accounts/aliasdelay*', async route => {
      await aliasResponseGate;
      await route.fulfill({ contentType: 'application/json', body: '[]' });
    });
    try {
    await page.locator('#hero-search-input').fill('aliasdelay');
    await page.waitForFunction(() => document.querySelector('#hero-search-panel .hero-search-status-row'), null, { timeout: 5000 });
    const loadingState = await page.evaluate(() => ({
      statusRows: document.querySelectorAll('#hero-search-panel .hero-search-status-row[role="status"]').length,
      selectableStatusRows: document.querySelectorAll('#hero-search-panel .hero-search-status-row[role="option"], #hero-search-panel .hero-search-status-row button').length,
      header: document.querySelector('#hero-search-panel .hero-search-panel-count')?.textContent?.trim() || ''
    }));
    assert(
      loadingState.statusRows >= 1 && loadingState.selectableStatusRows === 0 && loadingState.header === 'Searching…',
      `hero command bar: async loading rows must not enter keyboard selection or contradict their pending state ${JSON.stringify(loadingState)}`
    );
    } finally {
      releaseAliasResponse();
    }

    await page.locator('#hero-search-input').fill('network health');
    await page.waitForFunction(() => document.querySelector('#hero-search-panel .hero-search-result strong')?.textContent?.trim() === 'Network Health', null, { timeout: 5000 });
    await page.evaluate(() => {
      window.__heroSearchHoverNode = document.querySelector('#hero-search-panel .hero-search-result');
    });
    await page.locator('#hero-search-panel .hero-search-result').nth(1).hover();
    const hoverState = await page.evaluate(() => ({
      preservedNode: window.__heroSearchHoverNode === document.querySelector('#hero-search-panel .hero-search-result'),
      selectedCount: document.querySelectorAll('#hero-search-panel .hero-search-result.is-selected').length,
      selectedAria: document.querySelector('#hero-search-panel .hero-search-result.is-selected')?.getAttribute('aria-selected') || '',
      staleAria: document.querySelectorAll('#hero-search-panel .hero-search-result[aria-selected="true"]:not(.is-selected)').length
    }));
    assert(hoverState.preservedNode && hoverState.selectedCount === 1 && hoverState.selectedAria === 'true' && hoverState.staleAria === 0, `hero command bar: pointer selection replaced a node or left conflicting state ${JSON.stringify(hoverState)}`);

    await page.locator('#hero-search-input').fill('');
    const blankEnterState = await page.evaluate(() => ({ href: location.href, hash: location.hash }));
    await page.locator('#hero-search-input').press('Enter');
    await page.waitForTimeout(120);
    const blankEnterAfter = await page.evaluate(() => ({ href: location.href, hash: location.hash, open: document.body.classList.contains('hero-search-mode') }));
    assert(blankEnterAfter.href === blankEnterState.href && blankEnterAfter.hash === blankEnterState.hash && blankEnterAfter.open, `hero command bar: blank Enter navigated or closed search ${JSON.stringify({ blankEnterState, blankEnterAfter })}`);

    await page.locator('#hero-search-input').fill('KT1');
    await page.waitForFunction(() => /KT1 Contracts/.test(document.querySelector('#hero-search-panel')?.textContent || ''), null, { timeout: 5000 });
    const kt1StarterText = await page.locator('#hero-search-panel').innerText();
    assert(/KT1 Contracts/i.test(kt1StarterText) && /native contract lens/i.test(kt1StarterText) && !/Search bakers for "KT1"/i.test(kt1StarterText), `hero command bar: KT1 starter should route to native contract help, not baker fallback: ${kt1StarterText}`);
    await page.locator('#hero-search-input').fill('operation hash');
    await page.waitForFunction(() => /Blocks & Operations/.test(document.querySelector('#hero-search-panel')?.textContent || ''), null, { timeout: 5000 });
    const operationStarterText = await page.locator('#hero-search-panel').innerText();
    assert(/Blocks & Operations/i.test(operationStarterText) && !/Search bakers/i.test(operationStarterText), `hero command bar: operation starter should route to operations help, not baker fallback: ${operationStarterText}`);
    await page.locator('#hero-search-input').fill('/domains');
    await page.waitForFunction(() => /Tezos Domains/.test(document.querySelector('#hero-search-panel')?.textContent || ''), null, { timeout: 5000 });
    const domainsCommandText = await page.locator('#hero-search-panel').innerText();
    assert(/Tezos Domains/i.test(domainsCommandText) && /\.tez (?:name )?lookup/i.test(domainsCommandText), `hero command bar: /domains should discover Tezos Domains Chamber: ${domainsCommandText}`);
    await page.locator('#hero-search-input').fill('viral.tez');
    await page.waitForFunction(() => /Check viral\.tez in Tezos Domains/.test(document.querySelector('#hero-search-panel')?.textContent || ''), null, { timeout: 5000 });
    const domainEntityText = await page.locator('#hero-search-panel').innerText();
    assert(/Check viral\.tez in Tezos Domains/.test(domainEntityText) && /Maxi Passport/.test(domainEntityText) && /Lookup availability/i.test(domainEntityText), `hero command bar: .tez entity should offer Domains and Maxi Passport routes: ${domainEntityText}`);

    await page.locator('#hero-search-input').fill(SAMPLE_CONTRACT.toLowerCase());
    await page.waitForFunction(() => /Checksum failed/.test(document.querySelector('#hero-search-panel')?.textContent || ''), null, { timeout: 5000 });
    assert(await page.locator('#hero-search-panel .hero-search-result').count() === 0, 'hero command bar: invalid lowercased Base58 body became actionable');

    await page.locator('#hero-search-input').fill(`https://tzkt.io/${SAMPLE_CONTRACT}/operations`);
    await page.waitForFunction(() => /Smoke Contract|Inspect KT1 contract/.test(document.querySelector('#hero-search-panel')?.textContent || ''), null, { timeout: 5000 });
    const nativeContractResult = page.locator(`#hero-search-panel .hero-search-result[data-result-id="contract:${SAMPLE_CONTRACT}"]`);
    await nativeContractResult.waitFor({ state: 'visible', timeout: 15000 });
    await nativeContractResult.click();
    await page.locator('#native-explorer-overlay.active').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('#native-explorer-overlay.active .native-contract-entrypoint').first().waitFor({ state: 'visible', timeout: 15000 });
    const contractLensState = await page.evaluate(() => {
      const overlay = document.querySelector('#native-explorer-overlay.active');
      return {
        text: overlay?.innerText || '',
        entrypoints: overlay?.querySelectorAll('.native-contract-entrypoint').length || 0,
        sameCode: overlay?.querySelectorAll('.native-contract-match').length || 0,
        rawCode: overlay?.querySelector('a[href*="/code?format=1"]')?.getAttribute('href') || ''
      };
    });
    assert(contractLensState.entrypoints === 2 && contractLensState.sameCode === 1 && /Contract identity/.test(contractLensState.text) && /Smoke Creator/.test(contractLensState.text) && /Related Smoke Deployment/.test(contractLensState.text) && contractLensState.rawCode.includes(`/contracts/${SAMPLE_CONTRACT}/code?format=1`), `hero command bar: native contract lens is incomplete ${JSON.stringify(contractLensState)}`);
    await page.locator('#native-explorer-overlay .native-explorer-close').click();

    const entrypointFailurePattern = `**/v1/contracts/${SAMPLE_CONTRACT}/entrypoints`;
    await page.route(entrypointFailurePattern, (route) => route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'smoke partial source' })
    }));
    await page.evaluate((address) => window.TezosNativeExplorer.open('contract', address), SAMPLE_CONTRACT);
    await page.waitForFunction(() => document.querySelector('#native-explorer-overlay.active .native-explorer-source-status')?.dataset.state === 'partial', null, { timeout: 5000 });
    const partialContractState = await page.evaluate(() => {
      const overlay = document.querySelector('#native-explorer-overlay.active');
      return {
        text: overlay?.innerText || '',
        retry: Boolean(overlay?.querySelector('[data-native-retry]')),
        retainedEntrypoints: overlay?.querySelectorAll('.native-contract-entrypoint').length || 0
      };
    });
    assert(partialContractState.retry && partialContractState.retainedEntrypoints === 2 && /Partial TzKT read/.test(partialContractState.text) && /decoded entrypoints unavailable/.test(partialContractState.text) && /Last-good decoded entrypoints retained/.test(partialContractState.text) && /unavailable fields are not zero/i.test(partialContractState.text), `hero command bar: partial native contract read is not explicit or last-good preserving ${JSON.stringify(partialContractState)}`);
    await page.unroute(entrypointFailurePattern);
    await page.locator('#native-explorer-overlay [data-native-retry]').click();
    await page.waitForFunction(() => document.querySelector('#native-explorer-overlay.active .native-explorer-source-status')?.dataset.state === 'complete', null, { timeout: 5000 });
    assert(await page.locator('#native-explorer-overlay.active .native-contract-entrypoint').count() === 2, 'hero command bar: native contract retry did not restore the complete entrypoint view');
    await page.locator('#native-explorer-overlay .native-explorer-close').click();

    const freshPartialPage = await context.newPage();
    attachIssueCollectors(freshPartialPage, 'hero command bar fresh partial Native Explorer', issues);
    const freshPartialFailure = (route) => route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'smoke fresh partial source' })
    });
    await freshPartialPage.route(`**/v1/contracts/${SAMPLE_CONTRACT}/same`, freshPartialFailure);
    await freshPartialPage.route((url) => (
      url.origin === 'https://api.tzkt.io'
        && url.pathname === '/v1/operations/transactions'
        && [url.searchParams.get('sender'), url.searchParams.get('target')].includes(SAMPLE_CONTRACT)
    ), freshPartialFailure);
    const freshPartialResponse = await freshPartialPage.goto(`${baseUrl}/?native-fresh-partial=1`, { waitUntil: 'domcontentloaded' });
    assert(freshPartialResponse?.ok(), `hero command bar: fresh partial Native Explorer fixture failed with HTTP ${freshPartialResponse?.status()}`);
    await freshPartialPage.waitForFunction(() => Boolean(window.TezosNativeExplorer?.open), null, { timeout: 10000 });
    await freshPartialPage.evaluate((address) => window.TezosNativeExplorer.open('contract', address), SAMPLE_CONTRACT);
    await freshPartialPage.waitForFunction(() => document.querySelector('#native-explorer-overlay.active .native-explorer-source-status')?.dataset.state === 'partial', null, { timeout: 5000 });
    const freshPartialState = await freshPartialPage.evaluate(() => {
      const overlay = document.querySelector('#native-explorer-overlay.active');
      window.__nativeFreshPartialEntrypoint = overlay?.querySelector('.native-contract-entrypoint');
      return {
        text: overlay?.innerText || '',
        entrypoints: overlay?.querySelectorAll('.native-contract-entrypoint').length || 0,
        falseEmptySameCode: /No additional matching deployments were returned/.test(overlay?.innerText || ''),
        falseZeroRecent: /0 recent flow rows/.test(overlay?.innerText || '')
      };
    });
    assert(
      freshPartialState.entrypoints === 2
        && /Related deployments are unavailable for this read/.test(freshPartialState.text)
        && /Recent TzKT flow is unavailable for this read/.test(freshPartialState.text)
        && /recent flow unavailable/.test(freshPartialState.text)
        && !freshPartialState.falseEmptySameCode
        && !freshPartialState.falseZeroRecent,
      `hero command bar: fresh partial Native Explorer still presented unavailable sources as empty or zero ${JSON.stringify(freshPartialState)}`
    );

    await freshPartialPage.unrouteAll({ behavior: 'wait' });
    await freshPartialPage.route(`**/v1/contracts/${SAMPLE_CONTRACT}/same`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      await route.fallback();
    });
    const freshRetry = freshPartialPage.locator('#native-explorer-overlay [data-native-retry]');
    await freshRetry.focus();
    await freshRetry.click();
    await freshPartialPage.waitForFunction(() => document.querySelector('#native-explorer-overlay [data-native-retry]')?.dataset.nativeRetrying === 'true');
    const retryPendingState = await freshPartialPage.evaluate(() => {
      const retry = document.querySelector('#native-explorer-overlay [data-native-retry]');
      const entrypoint = document.querySelector('#native-explorer-overlay .native-contract-entrypoint');
      return {
        retainedEntrypoint: entrypoint === window.__nativeFreshPartialEntrypoint,
        retainedPartial: document.querySelector('#native-explorer-overlay .native-explorer-source-status')?.dataset.state || '',
        retryText: retry?.textContent?.trim() || '',
        retryBusy: retry?.getAttribute('aria-busy') || '',
        retryDisabled: retry?.getAttribute('aria-disabled') || '',
        retryFocused: document.activeElement === retry
      };
    });
    assert(
      retryPendingState.retainedEntrypoint
        && retryPendingState.retainedPartial === 'partial'
        && retryPendingState.retryText === 'Retrying…'
        && retryPendingState.retryBusy === 'true'
        && retryPendingState.retryDisabled === 'true'
        && retryPendingState.retryFocused,
      `hero command bar: Native Explorer retry replaced or defocused the retained partial lens ${JSON.stringify(retryPendingState)}`
    );
    await freshPartialPage.waitForFunction(() => (
      document.querySelector('#native-explorer-overlay .native-explorer-source-status')?.dataset.state === 'complete'
        && document.activeElement === document.querySelector('#native-explorer-overlay .native-explorer-source-status')
    ), null, { timeout: 5000 });
    assert(await freshPartialPage.locator('#native-explorer-overlay .native-contract-match').count() === 1, 'hero command bar: fresh partial retry did not restore the same-code results');
    await freshPartialPage.unrouteAll({ behavior: 'wait' });
    await freshPartialPage.close();
    await page.mouse.click(10, 10);
    await page.waitForFunction(() => !document.body.classList.contains('hero-search-mode') && document.getElementById('hero-search-panel')?.hidden, null, { timeout: 5000 });

    const historyCategoryToggle = page.locator('#chambers-grid > .chamber-category[data-chamber-category="history"] .chamber-category-toggle');
    if (await historyCategoryToggle.getAttribute('aria-expanded') !== 'true') await historyCategoryToggle.click();
    await page.locator('#protocol-history-entry-card').waitFor({ state: 'visible', timeout: 10000 });
    const protocolEntryText = await page.locator('#protocol-history-entry-card').innerText();
    assert(/Protocol Anthology/i.test(protocolEntryText) && /Lore/i.test(protocolEntryText) && /Impact/i.test(protocolEntryText), `hero command bar: Protocol Anthology card missing expected copy: ${protocolEntryText}`);

    await page.keyboard.press('/');
    await page.locator('#hero-search-input').fill('/protocol-history');
    await page.waitForFunction(() => /Protocol Anthology|protocol-history/i.test(document.querySelector('#hero-search-panel')?.textContent || ''), null, { timeout: 5000 });
    await page.keyboard.press('Enter');
    await page.waitForURL((url) => url.pathname === '/anthology/' && !url.hash, { timeout: 5000 });
    await page.locator('#protocol-history-chamber-modal.active .protocol-anthology-chapter').first().waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForFunction(() => /Find a protocol/i.test(document.querySelector('#protocol-history-chamber-modal')?.textContent || ''), null, { timeout: 10000 });
    const historyChamberText = await page.locator('#protocol-history-chamber-modal').innerText();
    assert(/Protocol Anthology/i.test(historyChamberText) && /Technical timeline & impact/i.test(historyChamberText), `hero command bar: Protocol Anthology did not preserve its advanced timeline/impact surface: ${historyChamberText.slice(0, 320)}`);
    assert(/Find a protocol/i.test(historyChamberText) && /Deep reads/i.test(historyChamberText) && /newest first/i.test(historyChamberText), `hero command bar: Protocol Anthology library missing readable discovery controls: ${historyChamberText.slice(0, 420)}`);
    const anthologyState = await page.evaluate(() => ({
      chapterCount: document.querySelectorAll('#protocol-history-chamber-modal .protocol-anthology-list .protocol-anthology-chapter').length,
      filterCount: document.querySelectorAll('#protocol-history-chamber-modal [data-anthology-filter]').length,
      hasSearch: Boolean(document.querySelector('#protocol-history-chamber-modal #protocol-anthology-search')),
      quebecHref: document.querySelector('#protocol-history-chamber-modal [data-protocol-open="Quebec"]')?.getAttribute('href') || ''
    }));
    assert(anthologyState.chapterCount >= 22 && anthologyState.filterCount === 3 && anthologyState.hasSearch && anthologyState.quebecHref === '/anthology/quebec/', `hero command bar: Protocol Anthology library anatomy incomplete: ${JSON.stringify(anthologyState)}`);
    await page.locator('#protocol-anthology-search').fill('toggle vote');
    const filteredAnthology = await page.evaluate(() => ({
      visible: [...document.querySelectorAll('.protocol-anthology-list .protocol-anthology-chapter')]
        .filter((chapter) => !chapter.hidden)
        .map((chapter) => chapter.getAttribute('data-protocol-open')),
      count: document.getElementById('protocol-anthology-results')?.textContent || ''
    }));
    assert(filteredAnthology.visible.length === 1 && filteredAnthology.visible[0] === 'Jakarta' && /1 chapter/.test(filteredAnthology.count), `hero command bar: Protocol Anthology search was not precise ${JSON.stringify(filteredAnthology)}`);
    await page.locator('#protocol-anthology-search').fill('');
    await page.locator('#protocol-history-chamber-modal [data-protocol-open="Quebec"]').first().click();
    await page.waitForFunction(() => window.location.pathname === '/anthology/quebec/', null, { timeout: 5000 });
    await page.locator('#protocol-history-modal').waitFor({ state: 'visible', timeout: 10000 });
    const anthologyProtocolText = await page.locator('#protocol-history-modal').innerText();
    assert(/Quebec\/Qena Wars|Quebec Protocol/i.test(anthologyProtocolText), `hero command bar: anthology protocol chip did not open real Quebec history: ${anthologyProtocolText.slice(0, 320)}`);
    const storyActions = await page.evaluate(() => ({
      copy: Boolean(document.getElementById('history-modal-copy-link')),
      nativeShare: Boolean(document.getElementById('history-modal-native-share')),
      image: Boolean(document.getElementById('history-modal-share')),
      print: Boolean(document.getElementById('history-modal-print')),
      pagination: document.querySelectorAll('#protocol-history-modal [data-protocol-story-nav]').length
    }));
    assert(storyActions.copy && storyActions.nativeShare && storyActions.image && storyActions.print && storyActions.pagination >= 1, `hero command bar: anthology story sharing/navigation controls incomplete ${JSON.stringify(storyActions)}`);
    await page.locator('#protocol-history-modal #history-modal-close').click();
    await page.locator('#protocol-history-modal').waitFor({ state: 'detached', timeout: 5000 });
    await page.waitForFunction(() => window.location.pathname === '/anthology/' && !new URLSearchParams(window.location.search).has('protocol'), null, { timeout: 5000 });
    await page.locator('#protocol-history-chamber-modal [data-protocol-open="Jakarta"]').first().click();
    await page.waitForFunction(() => window.location.pathname === '/anthology/jakarta/', null, { timeout: 5000 });
    const jakartaStory = await page.locator('#protocol-history-modal').innerText();
    const jakartaSources = await page.locator('#protocol-history-modal .protocol-story-sources a').count();
    assert(/one-third/i.test(jakartaStory) && /50%/.test(jakartaStory) && /Pass/.test(jakartaStory) && jakartaSources >= 2, `hero command bar: Jakarta story omitted threshold reset or official receipts: ${jakartaStory.slice(0, 520)}`);
    await page.locator('#protocol-history-modal #history-modal-close').click();
    await page.locator('#protocol-history-modal').waitFor({ state: 'detached', timeout: 5000 });
    await page.locator('#protocol-history-chamber-modal .chamber-close').click();
    await page.locator('#protocol-history-chamber-modal').waitFor({ state: 'detached', timeout: 5000 });

    await page.locator('#hero-search-input').fill('Granada');
    await page.waitForFunction(() => /Granada/.test(document.querySelector('#hero-search-panel')?.textContent || ''), null, { timeout: 5000 });
    await Promise.all([
      page.waitForURL((url) => url.pathname === '/anthology/granada/', { waitUntil: 'domcontentloaded', timeout: 10000 }),
      page.keyboard.press('Enter')
    ]);
    await page.locator('#protocol-history-modal').waitFor({ state: 'visible', timeout: 10000 });
    const granadaStoryUrl = new URL(page.url());
    assert(granadaStoryUrl.pathname === '/anthology/granada/', `hero command bar: Granada story URL mismatch: ${granadaStoryUrl}`);
    const protocolText = await page.locator('#protocol-history-modal').innerText();
    assert(/Liquidity Baking Wars Begin|Granada Protocol/.test(protocolText), `hero command bar: protocol modal text mismatch: ${protocolText.slice(0, 320)}`);
    await page.locator('#protocol-history-modal #history-modal-close').click();
    await page.locator('#protocol-history-modal').waitFor({ state: 'detached', timeout: 5000 });
    if (await page.locator('#protocol-history-chamber-modal.active .chamber-close').count()) {
      await page.locator('#protocol-history-chamber-modal.active .chamber-close').click();
      await page.locator('#protocol-history-chamber-modal').waitFor({ state: 'detached', timeout: 5000 });
    }

    await page.keyboard.press('/');
    await page.locator('#hero-search-input').fill('/calculator');
    await page.waitForFunction(() => /Rewards Calculator/.test(document.querySelector('#hero-search-panel')?.textContent || ''), null, { timeout: 5000 });
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.location.hash === '#calculator', null, { timeout: 5000 });
    await page.locator('#calculator-section.visible').waitFor({ state: 'visible', timeout: 5000 });

    await page.locator('#recruit-section.site-handoff-shell').scrollIntoViewIfNeeded();
    const handoffState = await page.evaluate(() => {
      const handoff = document.getElementById('recruit-section');
      const footer = document.querySelector('[data-site-footer]');
      const disclosure = handoff?.querySelector('.site-map-disclosure');
      const questions = [...(handoff?.querySelectorAll('[data-handoff-question]') || [])];
      return {
        text: handoff?.innerText || '',
        questions: questions.map((question) => ({
          id: question.dataset.handoffQuestion,
          href: question.getAttribute('href'),
          emphasized: question.classList.contains('is-emphasized')
        })),
        emphasisSource: handoff?.dataset.siteHandoffEmphasisSource || '',
        disclosureOpen: disclosure?.hasAttribute('open') || false,
        legacyNavigation: handoff?.querySelectorAll('[data-loop-aura], .tezos-loop-chip, .site-handoff-lifeline, .site-handoff-recommendation').length || 0,
        handoffContainsFooter: Boolean(handoff?.querySelector('[data-site-footer]')),
        footerContainsHandoff: Boolean(footer?.querySelector('[data-site-handoff]')),
        separateSiblings: handoff?.nextElementSibling === footer,
        footerHasAttribution: Boolean(footer?.querySelector('[data-site-footer-attribution]'))
      };
    });
    for (const label of ['the handoff', 'what’s being built?', 'where is value moving?', 'what now?', 'what’s mine?', 'what are we deciding?', 'what came before?', 'where does power gather?', 'is the chain healthy?', 'what gives tezos value?', 'what’s happening on etherlink?', 'who keeps it running?', 'who leads each lane?', 'who gets recognized?', 'open the complete map']) {
      assert(handoffState.text.toLowerCase().includes(label), `hero command bar: Handoff missing ${label}: ${JSON.stringify(handoffState)}`);
    }
    const expectedHandoffRoutes = new Map([
      ['build', '/ecosystem/'],
      ['move', '/ledger-flow/'],
      ['now', '/pulse/'],
      ['mine', '/my/'],
      ['decide', '/chamber/'],
      ['before', '/anthology/'],
      ['power', '/stake/'],
      ['health', '/health/'],
      ['capital', '/capital/'],
      ['etherlink', '/tezosx/'],
      ['bakers', '/leaderboard/'],
      ['maxis', '/maxis/'],
      ['recognition', '/tezoscrp/']
    ]);
    assert(handoffState.questions.length === expectedHandoffRoutes.size, `hero command bar: Handoff should expose seven anchor and six satellite questions ${JSON.stringify(handoffState)}`);
    for (const question of handoffState.questions) {
      assert(expectedHandoffRoutes.get(question.id) === question.href, `hero command bar: Handoff question route drifted ${JSON.stringify(question)}`);
    }
    assert(handoffState.questions.filter((question) => question.emphasized).length === 1, `hero command bar: Handoff should emphasize exactly one current question ${JSON.stringify(handoffState)}`);
    assert(!handoffState.disclosureOpen && handoffState.legacyNavigation === 0, `hero command bar: complete map should start folded with no retired navigation console: ${JSON.stringify(handoffState)}`);
    assert(handoffState.separateSiblings && handoffState.footerHasAttribution && !handoffState.handoffContainsFooter && !handoffState.footerContainsHandoff, `hero command bar: Handoff and footer must remain separate sibling surfaces: ${JSON.stringify(handoffState)}`);
    const handoffSignalState = await page.evaluate(() => {
      const handoff = document.getElementById('recruit-section');
      const before = [...handoff.querySelectorAll('[data-handoff-question]')];
      const focused = handoff.querySelector('[data-handoff-question="build"]');
      focused.focus();
      const scrollBefore = window.scrollY;
      window.dispatchEvent(new CustomEvent('site-handoff-signal', {
        detail: { signal: { category: 'governance', title: 'Smoke governance signal' } }
      }));
      const after = [...handoff.querySelectorAll('[data-handoff-question]')];
      return {
        sameNodes: before.length === after.length && before.every((node, index) => node === after[index]),
        focusPreserved: document.activeElement === focused,
        scrollBefore,
        scrollAfter: window.scrollY,
        emphasized: handoff.querySelector('.site-handoff-question.is-emphasized')?.dataset.handoffQuestion || '',
        source: handoff.dataset.siteHandoffEmphasisSource || '',
        constellation: handoff.dataset.siteHandoffConstellation || '',
        centerRelation: handoff.querySelector('[data-handoff-question="decide"]')?.dataset.handoffRelation || '',
        relatedCount: handoff.querySelectorAll('[data-handoff-relation="near"]').length,
        distantCount: handoff.querySelectorAll('[data-handoff-relation="far"]').length,
        relatedPulls: [...handoff.querySelectorAll('[data-handoff-relation="near"]')]
          .map((link) => link.style.getPropertyValue('--handoff-constellation-x'))
      };
    });
    assert(
      handoffSignalState.sameNodes
        && handoffSignalState.focusPreserved
        && Math.abs(handoffSignalState.scrollAfter - handoffSignalState.scrollBefore) <= 1
        && handoffSignalState.emphasized === 'decide'
        && handoffSignalState.source === 'signal',
      `hero command bar: Handoff signal emphasis replaced nodes or moved the reader ${JSON.stringify(handoffSignalState)}`
    );
    const handoffDisclosure = page.locator('#recruit-section .site-map-disclosure');
    const handoffDisclosureText = await handoffDisclosure.locator('summary').innerText();
    const handoffDestinationCount = Number.parseInt(handoffDisclosureText.match(/(\d+) destinations/)?.[1] || '', 10);
    await handoffDisclosure.locator('summary').click();
    const handoffDirectoryLinks = await handoffDisclosure.locator('.site-map-link, .site-map-sublink').count();
    assert(handoffDirectoryLinks === handoffDestinationCount, `hero command bar: opened Handoff map rendered ${handoffDirectoryLinks} of ${handoffDestinationCount} destinations`);
    await handoffDisclosure.locator('summary').click();

    const intentPage = await context.newPage();
    attachIssueCollectors(intentPage, 'hero command bar exact intents', issues);
    const seedIntent = async (query, expectedTitle) => {
      const intentResponse = await intentPage.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'commit' });
      assert(intentResponse?.ok(), `hero command bar exact intents: dashboard failed with HTTP ${intentResponse?.status()}`);
      await intentPage.locator('#hero-search-input').waitFor({ state: 'visible', timeout: 10000 });
      await intentPage.waitForFunction(() => document.querySelector('#hero-slot')?.dataset.heroSearchWired === '1', null, { timeout: 30000 });
      await intentPage.locator('#hero-search-input').fill(query);
      await intentPage.waitForFunction(({ value, title }) => {
        const input = document.getElementById('hero-search-input');
        const first = document.querySelector('#hero-search-panel .hero-search-result strong');
        return input?.value === value && first?.textContent?.trim() === title;
      }, { value: query, title: expectedTitle }, { timeout: 5000 });
    };

    const immediateResponse = await intentPage.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
    assert(immediateResponse?.ok(), `hero command bar immediate intent: dashboard failed with HTTP ${immediateResponse?.status()}`);
    await intentPage.waitForFunction(() => document.getElementById('hero-slot')?.dataset.heroSearchWired === '1', null, { timeout: 10000 });
    await intentPage.locator('#hero-search-input').focus();
    await intentPage.waitForFunction(() => document.querySelector('#hero-search-panel .hero-search-result strong')?.textContent?.trim() === 'Wallet or .tez', null, { timeout: 5000 });
    await intentPage.evaluate(() => {
      const input = document.getElementById('hero-search-input');
      input.value = 'transaction maxi';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    });
    await intentPage.waitForFunction(() => location.pathname === '/maxis/'
      && new URLSearchParams(location.search).get('lane') === 'transaction'
      && !new URLSearchParams(location.search).has('view'), null, { timeout: 5000 });

    const stableSelectionResponse = await intentPage.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
    assert(stableSelectionResponse?.ok(), `hero command bar stable selection: dashboard failed with HTTP ${stableSelectionResponse?.status()}`);
    await intentPage.locator('#hero-search-input').fill('governance');
    await intentPage.waitForFunction(() => document.querySelector('#hero-search-panel .hero-search-result strong')?.textContent?.trim() === 'Tezos L1 Governance', null, { timeout: 5000 });
    await intentPage.locator('#hero-search-panel .hero-search-result').filter({ hasText: /Show all \d+ results/ }).click();
    await intentPage.locator('#hero-search-input').press('ArrowDown');
    const selectedBeforeAsync = await intentPage.evaluate(() => {
      const selected = document.querySelector('#hero-search-panel .hero-search-result.is-selected');
      window.__heroSelectedBeforeAsync = selected;
      return selected?.dataset.resultId || '';
    });
    await intentPage.waitForFunction(() => /Governance Baker Alias/.test(document.querySelector('#hero-search-panel')?.textContent || ''), null, { timeout: 5000 });
    const selectedAfterAsync = await intentPage.evaluate(() => {
      const selected = document.querySelector('#hero-search-panel .hero-search-result.is-selected');
      return {
        id: selected?.dataset.resultId || '',
        sameNode: selected === window.__heroSelectedBeforeAsync
      };
    });
    assert(selectedBeforeAsync && selectedAfterAsync.id === selectedBeforeAsync && selectedAfterAsync.sameNode, `hero command bar: asynchronous aliases replaced or moved keyboard selection ${JSON.stringify({ selectedBeforeAsync, selectedAfterAsync })}`);

    await seedIntent('my tezos', 'My Tezos');
    await intentPage.locator('#hero-search-input').press('Enter');
    await intentPage.locator('#my-tezos-drawer.open').waitFor({ state: 'visible', timeout: 5000 });

    await seedIntent('viral.tez', 'Check viral.tez in Tezos Domains');
    assert(await intentPage.locator('#hero-search-panel .hero-search-result').filter({ hasText: 'Try viral.tez as baker' }).count() === 0, 'hero command bar: unresolved .tez names must not become arbitrary baker routes');
    await intentPage.locator('#hero-search-panel .hero-search-result').filter({ hasText: 'Ledger Flow' }).click();
    await intentPage.waitForFunction((address) => window.location.hash === `#ledger-flow=${address}`, SAMPLE_ADDRESS, { timeout: 5000 });

    await seedIntent(SAMPLE_ADDRESS, 'Account');
    await intentPage.locator('#hero-search-panel .hero-search-result').filter({ hasText: 'Maxi Passport' }).click();
    await intentPage.waitForURL((url) => url.pathname === '/maxis/' && url.searchParams.get('view') === 'passport' && url.searchParams.get('address') === SAMPLE_ADDRESS, { timeout: intentNavigationTimeout });

    await seedIntent('transaction maxi', 'Transaction Maxi');
    await intentPage.locator('#hero-search-input').press('Enter');
    await intentPage.waitForURL((url) => url.pathname === '/maxis/' && url.searchParams.get('lane') === 'transaction' && !url.searchParams.has('view'), { timeout: intentNavigationTimeout });

    await seedIntent('transaction season', 'Transaction Maxi Season');
    await intentPage.locator('#hero-search-input').press('Enter');
    await intentPage.waitForURL((url) => url.pathname === '/maxis/' && url.searchParams.get('view') === 'season' && url.searchParams.get('lane') === 'transaction', { timeout: intentNavigationTimeout });

    await seedIntent('delegation maxi', 'Delegation Maxi Season');
    await intentPage.locator('#hero-search-input').press('Enter');
    await intentPage.waitForURL((url) => url.pathname === '/maxis/' && url.searchParams.get('view') === 'season' && url.searchParams.get('lane') === 'delegation', { timeout: intentNavigationTimeout });

    await seedIntent('tezos vs ethereum', 'Tezos vs Ethereum');
    await intentPage.locator('#hero-search-input').press('Enter');
    await intentPage.waitForURL((url) => url.pathname === '/compare/tezos-vs-ethereum.html', { timeout: intentNavigationTimeout });

    await seedIntent('/changelog', '/changelog');
    await intentPage.locator('#hero-search-input').press('Enter');
    await intentPage.locator('#changelog-modal[aria-hidden="false"]').waitFor({ state: 'visible', timeout: 5000 });
    const changelogOverlayState = await intentPage.evaluate(() => ({
      searchHidden: document.getElementById('hero-search-overlay')?.hidden ?? false,
      searchMode: document.body.classList.contains('hero-search-mode'),
      searchAnchorCount: document.querySelectorAll('.hero-search-anchor').length,
      searchParentId: document.getElementById('hero-slot')?.parentElement?.id || '',
      changelogVisible: document.getElementById('changelog-modal')?.getAttribute('aria-hidden') === 'false'
    }));
    assert(changelogOverlayState.searchHidden && !changelogOverlayState.searchMode && changelogOverlayState.searchAnchorCount === 0 && changelogOverlayState.searchParentId === 'live-head' && changelogOverlayState.changelogVisible, `hero command bar exact intents: nested overlay sequencing stranded the Index Chamber ${JSON.stringify(changelogOverlayState)}`);
    assert(await intentPage.locator('#changelog-body').getByText('Command search now opens into the complete canonical destination map', { exact: false }).count(), 'hero command bar exact intents: latest search changelog entry missing');
    await intentPage.locator('.changelog-modal-close').click();
    await intentPage.locator('#changelog-modal[aria-hidden="true"]').waitFor({ state: 'hidden', timeout: 5000 });
    const changelogCloseState = await intentPage.evaluate(() => ({
      bodyOverflow: getComputedStyle(document.body).overflow,
      htmlOverflow: getComputedStyle(document.documentElement).overflow,
      mainInert: document.querySelector('main')?.hasAttribute('inert') || false
    }));
    assert(changelogCloseState.bodyOverflow !== 'hidden' && changelogCloseState.htmlOverflow !== 'hidden' && !changelogCloseState.mainInert, `hero command bar exact intents: closing a child overlay left stale search isolation ${JSON.stringify(changelogCloseState)}`);

    await seedIntent('/stake', 'Staking Chamber');
    await intentPage.locator('#hero-search-input').press('Enter');
    await intentPage.waitForURL((url) => url.pathname === '/stake/' && !url.hash, { timeout: intentNavigationTimeout });

    for (const [query, title, view] of [
      ['maxi passport', 'Maxi Passport', 'passport'],
      ['season', 'Tezos Maxis Season', 'season'],
      ['champions', 'Tezos Maxis Champions', 'champions']
    ]) {
      await seedIntent(query, title);
      await intentPage.locator('#hero-search-input').press('Enter');
      await intentPage.waitForURL((url) => url.pathname === '/maxis/' && url.searchParams.get('view') === view && !url.hash, { timeout: intentNavigationTimeout });
    }

    await seedIntent('nft', 'HEN Live Feed');
    await intentPage.locator('#hero-search-input').press('Enter');
    await intentPage.waitForURL((url) => url.pathname === '/hen/' && !url.searchParams.has('hen'), { timeout: intentNavigationTimeout });

    await context.close();
    }

    if (section === 'all' || section === 'mobile') {
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      hasTouch: true,
      isMobile: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      serviceWorkers: 'block'
    });
    await installFeatureMocks(mobileContext);
    await mobileContext.addInitScript(() => {
      localStorage.setItem('tezos-systems-theme', 'matrix');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    });
    const mobilePage = await mobileContext.newPage();
    attachIssueCollectors(mobilePage, 'hero command bar mobile focus', issues);
    const mobileResponse = await mobilePage.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
    assert(mobileResponse?.ok(), `hero command bar mobile focus: dashboard failed with HTTP ${mobileResponse?.status()}`);
    await mobilePage.locator('#hero-search-input').waitFor({ state: 'visible', timeout: 10000 });
    await mobilePage.evaluate(() => {
      const probe = document.createElement('span');
      probe.id = 'ios-tez-fallback-probe';
      probe.hidden = true;
      probe.textContent = 'ꜩ';
      document.body.append(probe);
    });
    await mobilePage.waitForFunction(() => document.getElementById('ios-tez-fallback-probe')?.textContent === 'tz');
    const mobileBeforeFocus = await mobilePage.evaluate(() => ({
      scale: window.visualViewport?.scale || 1,
      scrollWidth: document.documentElement.scrollWidth,
      iosTezFallback: document.documentElement.dataset.iosTezFallback || '',
      retainsTezGlyph: document.body.innerText.includes('ꜩ'),
      hasTextFallback: document.getElementById('ios-tez-fallback-probe')?.textContent === 'tz'
    }));
    await mobilePage.locator('#ios-tez-fallback-probe').evaluate((node) => node.remove());
    assert(mobileBeforeFocus.iosTezFallback === 'true' && !mobileBeforeFocus.retainsTezGlyph && mobileBeforeFocus.hasTextFallback, `hero command bar iOS: Tezos glyph did not settle to the small-letter tz fallback ${JSON.stringify(mobileBeforeFocus)}`);

    await mobilePage.locator('.top-continuity-stat[data-card-history="staking-ratio"]').click();
    await mobilePage.locator('#top-continuity-explain.is-visible').waitFor({ state: 'visible', timeout: 5000 });
    const mobileExplainerState = await mobilePage.evaluate(() => {
      const popover = document.getElementById('top-continuity-explain')?.getBoundingClientRect();
      const ticker = document.getElementById('live-head')?.getBoundingClientRect();
      const form = document.getElementById('hero-search-form')?.getBoundingClientRect();
      return {
        position: getComputedStyle(document.getElementById('top-continuity-explain')).position,
        popoverBottom: popover?.bottom || 0,
        tickerTop: ticker?.top || 0,
        formTop: form?.top || 0
      };
    });
    assert(mobileExplainerState.position === 'relative', `hero command bar mobile: stat explainer must reserve header flow ${JSON.stringify(mobileExplainerState)}`);
    assert(mobileExplainerState.popoverBottom <= mobileExplainerState.tickerTop + 1 && mobileExplainerState.popoverBottom <= mobileExplainerState.formTop + 1, `hero command bar mobile: stat explainer overlaps Live Head or search ${JSON.stringify(mobileExplainerState)}`);

    await mobilePage.evaluate(() => {
      window.__mobileHeroRoot = document.getElementById('hero-slot');
      window.__mobileHeroParent = document.getElementById('hero-slot')?.parentElement;
      window.__mobileHeroOpener = document.activeElement;
      window.__mobileHeroScroll = { x: window.scrollX, y: window.scrollY };
    });
    await mobilePage.locator('#hero-search-input').focus();
    await mobilePage.waitForFunction(() => document.activeElement?.id === 'hero-search-input', null, { timeout: 5000 });
    await mobilePage.waitForFunction(() => !document.getElementById('top-continuity-explain')?.classList.contains('is-visible'), null, { timeout: 5000 });
    const mobileFocusState = await mobilePage.evaluate((before) => {
      const input = document.getElementById('hero-search-input');
      const inputRect = input?.getBoundingClientRect();
      const card = document.getElementById('live-head');
      const overlay = document.getElementById('hero-search-overlay');
      const chamber = overlay?.querySelector('[data-hero-search-chamber]');
      const overlayRect = overlay?.getBoundingClientRect();
      const main = document.querySelector('main.main-content');
      const viewport = window.visualViewport;
      const viewportRect = {
        top: viewport?.offsetTop || 0,
        left: viewport?.offsetLeft || 0,
        width: viewport?.width || innerWidth,
        height: viewport?.height || innerHeight
      };
      const starterRects = Array.from(document.querySelectorAll('#hero-search-panel .hero-search-group.is-starter .hero-search-result'), (row) => row.getBoundingClientRect());
      const starterRowTops = [...new Set(starterRects.map((rect) => Math.round(rect.top)))];
      const loom = document.querySelector('#hero-search-panel .hero-search-index-loom');
      const loomRoutes = loom?.querySelector('.hero-search-index-routes');
      return {
        beforeScale: before.scale,
        beforeScrollWidth: before.scrollWidth,
        fontSize: input ? Number.parseFloat(getComputedStyle(input).fontSize) : 0,
        inputRight: inputRect ? Math.round(inputRect.right) : 0,
        scale: window.visualViewport?.scale || 1,
        scrollWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        viewportRect,
        bodyPosition: getComputedStyle(document.body).position,
        overlayPosition: getComputedStyle(overlay).position,
        overlay: overlayRect ? { top: overlayRect.top, left: overlayRect.left, right: overlayRect.right, bottom: overlayRect.bottom, width: overlayRect.width, height: overlayRect.height } : null,
        rootSameNode: document.getElementById('hero-slot') === window.__mobileHeroRoot,
        rootInChamber: document.getElementById('hero-slot')?.parentElement === chamber,
        anchorInCard: Boolean(card?.querySelector('.hero-search-anchor')),
        mainOpacity: getComputedStyle(main).opacity,
        mainFilter: getComputedStyle(main).filter,
        mainTransform: getComputedStyle(main).transform,
        mainInert: main.hasAttribute('inert'),
        form: (() => {
          const rect = document.getElementById('hero-search-form')?.getBoundingClientRect();
          return rect ? { top: rect.top, bottom: rect.bottom } : null;
        })(),
        chips: (() => {
          const el = document.getElementById('hero-search-chips');
          const rect = el?.getBoundingClientRect();
          return rect ? { top: rect.top, bottom: rect.bottom, height: rect.height, display: getComputedStyle(el).display } : null;
        })(),
        panel: (() => {
          const rect = document.getElementById('hero-search-panel')?.getBoundingClientRect();
          return rect ? { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right } : null;
        })(),
        panelPosition: getComputedStyle(document.getElementById('hero-search-panel')).position,
        panelBackdrop: getComputedStyle(document.getElementById('hero-search-panel')).backdropFilter || getComputedStyle(document.getElementById('hero-search-panel')).webkitBackdropFilter || '',
        starterCount: starterRects.length,
        starterRows: starterRowTops.length,
        loomRouteCount: loom?.querySelectorAll('.hero-search-index-route').length || 0,
        loomNodeCount: loom?.querySelectorAll('[data-hero-loom-query]').length || 0,
        loomColumns: loomRoutes ? getComputedStyle(loomRoutes).gridTemplateColumns.split(/\s+/).filter(Boolean).length : 0,
        starterVisible: starterRects.every((rect) => {
          const panelRect = document.getElementById('hero-search-panel')?.getBoundingClientRect();
          return panelRect && rect.top >= panelRect.top - 1 && rect.bottom <= panelRect.bottom + 1;
        }),
        optionButtons: document.querySelectorAll('#hero-search-panel button[role="option"]').length,
        closeVisible: getComputedStyle(document.getElementById('hero-search-close')).display !== 'none',
        closeHeight: document.getElementById('hero-search-close')?.getBoundingClientRect().height || 0,
        submitHeight: document.querySelector('.hero-search-submit')?.getBoundingClientRect().height || 0,
        bodyOverflow: getComputedStyle(document.body).overflow,
        htmlOverflow: getComputedStyle(document.documentElement).overflow,
        scroll: { x: window.scrollX, y: window.scrollY }
      };
    }, mobileBeforeFocus);
    assert(mobileFocusState.fontSize >= 16, `hero command bar mobile focus: input font must stay at least 16px, saw ${JSON.stringify(mobileFocusState)}`);
    assert(Math.abs(mobileFocusState.scale - mobileFocusState.beforeScale) < 0.01, `hero command bar mobile focus: focus changed viewport scale ${JSON.stringify(mobileFocusState)}`);
    assert(mobileFocusState.scrollWidth <= mobileFocusState.beforeScrollWidth + 1, `hero command bar mobile focus: focus widened the page ${JSON.stringify(mobileFocusState)}`);
    assert(mobileFocusState.inputRight <= mobileFocusState.viewportWidth + 1, `hero command bar mobile focus: input overflows viewport ${JSON.stringify(mobileFocusState)}`);
    assert(
      mobileFocusState.bodyPosition !== 'fixed'
        && mobileFocusState.overlayPosition === 'fixed'
        && Math.abs(mobileFocusState.overlay.top - mobileFocusState.viewportRect.top) <= 2
        && Math.abs(mobileFocusState.overlay.left - mobileFocusState.viewportRect.left) <= 2
        && Math.abs(mobileFocusState.overlay.width - mobileFocusState.viewportRect.width) <= 2
        && Math.abs(mobileFocusState.overlay.height - mobileFocusState.viewportRect.height) <= 2
        && mobileFocusState.rootSameNode
        && mobileFocusState.rootInChamber
        && mobileFocusState.anchorInCard,
      `hero command bar mobile focus: Index Chamber did not take the exact visual viewport ${JSON.stringify(mobileFocusState)}`
    );
    assert(mobileFocusState.mainOpacity === '1' && mobileFocusState.mainFilter === 'none' && mobileFocusState.mainTransform === 'none' && mobileFocusState.mainInert, `hero command bar mobile focus: background isolation dimmed or failed ${JSON.stringify(mobileFocusState)}`);
    assert(mobileFocusState.chips?.display === 'none' && mobileFocusState.chips.height === 0, `hero command bar mobile focus: non-HEN shortcut rail should stay hidden ${JSON.stringify(mobileFocusState)}`);
    assert(mobileFocusState.closeHeight >= 44 && mobileFocusState.submitHeight >= 44, `hero command bar mobile focus: controls do not meet 44px touch targets ${JSON.stringify(mobileFocusState)}`);
    assert(mobileFocusState.form?.bottom <= mobileFocusState.panel?.top + 1 && mobileFocusState.panelPosition === 'relative', `hero command bar mobile focus: results do not fill the Chamber below its search control ${JSON.stringify(mobileFocusState)}`);
    assert(mobileFocusState.overlay.bottom - mobileFocusState.panel?.bottom >= 8 && mobileFocusState.overlay.bottom - mobileFocusState.panel?.bottom <= 10, `hero command bar mobile focus: results do not end at the visual viewport gutter ${JSON.stringify(mobileFocusState)}`);
    assert(mobileFocusState.starterCount === 6 && mobileFocusState.starterRows === 3 && mobileFocusState.starterVisible, `hero command bar mobile focus: six starter actions are not immediately visible in a two-by-three grid ${JSON.stringify(mobileFocusState)}`);
    assert(mobileFocusState.loomRouteCount === 6 && mobileFocusState.loomNodeCount === 24 && mobileFocusState.loomColumns === 2, `hero command bar mobile focus: Index Loom did not collapse to two discovery columns ${JSON.stringify(mobileFocusState)}`);
    assert(['none', ''].includes(mobileFocusState.panelBackdrop) && mobileFocusState.optionButtons === 0 && mobileFocusState.bodyOverflow === 'hidden' && mobileFocusState.htmlOverflow === 'hidden', `hero command bar mobile focus: fast opaque active-descendant contract failed ${JSON.stringify(mobileFocusState)}`);
    assert(Math.abs(mobileFocusState.scroll.x - await mobilePage.evaluate(() => window.__mobileHeroScroll.x)) <= 1 && Math.abs(mobileFocusState.scroll.y - await mobilePage.evaluate(() => window.__mobileHeroScroll.y)) <= 1, `hero command bar mobile focus: opening moved the reader ${JSON.stringify(mobileFocusState)}`);
    assert(mobileFocusState.closeVisible, `hero command bar mobile focus: explicit close button is not visible ${JSON.stringify(mobileFocusState)}`);

    await mobilePage.setViewportSize({ width: 320, height: 844 });
    await mobilePage.waitForFunction(() => {
      const rect = document.getElementById('hero-search-overlay')?.getBoundingClientRect();
      const viewport = window.visualViewport;
      return rect && Math.abs(rect.width - (viewport?.width || innerWidth)) <= 2;
    }, null, { timeout: 5000 });
    const narrowStarterState = await mobilePage.evaluate(() => {
      const panel = document.getElementById('hero-search-panel');
      const group = panel?.querySelector('.hero-search-group.is-starter');
      const rows = Array.from(group?.querySelectorAll('.hero-search-result') || []);
      const rects = rows.map((row) => row.getBoundingClientRect());
      const loomRoutes = panel?.querySelector('.hero-search-index-routes');
      return {
        count: rows.length,
        columns: getComputedStyle(group).gridTemplateColumns.split(/\s+/).filter(Boolean).length,
        rowCount: [...new Set(rects.map((rect) => Math.round(rect.top)))].length,
        loomColumns: loomRoutes ? getComputedStyle(loomRoutes).gridTemplateColumns.split(/\s+/).filter(Boolean).length : 0,
        loomNodes: loomRoutes?.querySelectorAll('[data-hero-loom-query]').length || 0,
        overflow: document.documentElement.scrollWidth - innerWidth,
        panelOverflow: panel ? panel.scrollWidth - panel.clientWidth : 999
      };
    });
    assert(narrowStarterState.count === 6 && narrowStarterState.columns === 2 && narrowStarterState.rowCount === 3 && narrowStarterState.loomColumns === 2 && narrowStarterState.loomNodes === 24 && narrowStarterState.overflow <= 1 && narrowStarterState.panelOverflow <= 1, `hero command bar 320px: starter grid, Index Loom, or horizontal fit failed ${JSON.stringify(narrowStarterState)}`);
    await mobilePage.setViewportSize({ width: 390, height: 844 });
    await mobilePage.waitForFunction(() => {
      const rect = document.getElementById('hero-search-overlay')?.getBoundingClientRect();
      const viewport = window.visualViewport;
      return rect && Math.abs(rect.width - (viewport?.width || innerWidth)) <= 2;
    }, null, { timeout: 5000 });

    await mobilePage.locator('#hero-search-input').fill('nakamoto coefficient');
    await mobilePage.waitForFunction(() => document.querySelector('#hero-search-panel .hero-search-result strong')?.textContent?.trim() === 'Network Health', null, { timeout: 5000 });
    const mobileQueryState = await mobilePage.evaluate(() => {
      const panelNode = document.getElementById('hero-search-panel');
      const panel = panelNode?.getBoundingClientRect();
      const sheet = panelNode?.querySelector('.hero-search-sheet.is-results')?.getBoundingClientRect();
      const option = panelNode?.querySelector('.hero-search-result.is-selected')?.getBoundingClientRect();
      const form = document.getElementById('hero-search-form')?.getBoundingClientRect();
      const center = (rect) => rect ? rect.top + rect.height / 2 : Number.NaN;
      const formCenter = center(form);
      const controls = [
        document.getElementById('hero-search-input')?.getBoundingClientRect(),
        document.querySelector('.hero-search-mark')?.getBoundingClientRect(),
        document.querySelector('.hero-search-submit')?.getBoundingClientRect(),
        document.querySelector('.hero-search-close')?.getBoundingClientRect()
      ];
      return {
        chipsDisplay: getComputedStyle(document.getElementById('hero-search-chips')).display,
        path: document.getElementById('hero-slot')?.dataset.heroSearchPath || '',
        trail: panelNode?.querySelector('.hero-search-route-trail')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        trailHref: panelNode?.querySelector('.hero-search-route-trail')?.getAttribute('href') || '',
        loomPresent: Boolean(panelNode?.querySelector('.hero-search-index-loom')),
        sheetReachesFloor: Boolean(panel && sheet && sheet.height >= panel.height - 1),
        panelRect: panel ? { top: panel.top, bottom: panel.bottom, height: panel.height } : null,
        sheetRect: sheet ? { top: sheet.top, bottom: sheet.bottom, height: sheet.height } : null,
        panelScrollTop: panelNode?.scrollTop || 0,
        selectedVisible: Boolean(panel && option && option.top >= panel.top - 1 && option.bottom <= panel.bottom + 1),
        queryHelpDisplay: getComputedStyle(document.querySelector('.hero-search-help')).display,
        maxControlCenterDelta: Math.max(...controls.map((rect) => Math.abs(center(rect) - formCenter)))
      };
    });
    assert(mobileQueryState.chipsDisplay === 'none' && mobileQueryState.path === 'network' && /NETWORK.*BLOCKS.*CONSENSUS.*HEALTH/.test(mobileQueryState.trail) && mobileQueryState.trailHref === '/health/' && !mobileQueryState.loomPresent && mobileQueryState.sheetReachesFloor && mobileQueryState.selectedVisible && mobileQueryState.queryHelpDisplay === 'none' && mobileQueryState.maxControlCenterDelta <= 1, `hero command bar mobile query: Loom transition, routed result floor, or vertically centered controls failed ${JSON.stringify(mobileQueryState)}`);
    await mobilePage.locator('#hero-search-input').fill('capital chamber');
    await mobilePage.waitForFunction(() => document.querySelector('#hero-search-panel .hero-result-meta')?.textContent?.trim() === 'New', null, { timeout: 5000 });
    const mobileMetaState = await mobilePage.evaluate(() => ({
      text: document.querySelector('#hero-search-panel .hero-result-meta')?.textContent?.trim() || '',
      display: getComputedStyle(document.querySelector('#hero-search-panel .hero-result-meta')).display
    }));
    assert(mobileMetaState.text === 'New' && mobileMetaState.display === 'flex', `hero command bar mobile query: meaningful result meta is missing ${JSON.stringify(mobileMetaState)}`);

    await mobilePage.setViewportSize({ width: 390, height: 667 });
    await mobilePage.waitForFunction(() => {
      const rect = document.getElementById('hero-search-overlay')?.getBoundingClientRect();
      const viewport = window.visualViewport;
      return rect && Math.abs(rect.height - (viewport?.height || innerHeight)) <= 2;
    }, null, { timeout: 5000 });
    const shortViewportState = await mobilePage.evaluate(() => {
      const overlay = document.getElementById('hero-search-overlay')?.getBoundingClientRect();
      const form = document.getElementById('hero-search-form')?.getBoundingClientRect();
      const panel = document.getElementById('hero-search-panel')?.getBoundingClientRect();
      const viewport = window.visualViewport;
      return {
        height: window.innerHeight,
        viewportTop: viewport?.offsetTop || 0,
        viewportHeight: viewport?.height || innerHeight,
        overlay: overlay ? { top: overlay.top, bottom: overlay.bottom, height: overlay.height } : null,
        formBottom: form?.bottom || 0,
        panelTop: panel?.top || 0,
        panelBottom: panel?.bottom || 0,
        panelHeight: panel?.height || 0
      };
    });
    assert(
      Math.abs(shortViewportState.overlay.top - shortViewportState.viewportTop) <= 2
        && Math.abs(shortViewportState.overlay.height - shortViewportState.viewportHeight) <= 2
        && shortViewportState.panelTop >= shortViewportState.formBottom
        && shortViewportState.overlay.bottom - shortViewportState.panelBottom >= 8
        && shortViewportState.overlay.bottom - shortViewportState.panelBottom <= 10
        && shortViewportState.panelHeight > 200,
      `hero command bar mobile keyboard viewport: Index Chamber did not follow the shortened visual viewport ${JSON.stringify(shortViewportState)}`
    );

    await mobilePage.locator('#hero-search-input').fill('');
    await mobilePage.waitForFunction(() => document.querySelectorAll('#hero-search-panel [role="option"]').length === 6, null, { timeout: 5000 });
    for (let index = 0; index < 20; index += 1) await mobilePage.locator('#hero-search-input').press('ArrowDown');
    const mobileArrowState = await mobilePage.evaluate(() => {
      const activeId = document.getElementById('hero-search-input')?.getAttribute('aria-activedescendant');
      const panelNode = document.getElementById('hero-search-panel');
      const optionNode = activeId ? document.getElementById(activeId) : null;
      const panel = panelNode?.getBoundingClientRect();
      const option = optionNode?.getBoundingClientRect();
      return {
        activeId,
        visible: Boolean(panel && option && option.top >= panel.top - 1 && option.bottom <= panel.bottom + 1),
        panel: panel ? { top: panel.top, bottom: panel.bottom, height: panel.height } : null,
        option: option ? { top: option.top, bottom: option.bottom, height: option.height } : null,
        panelScrollTop: panelNode?.scrollTop ?? null,
        panelScrollHeight: panelNode?.scrollHeight ?? null,
        panelClientHeight: panelNode?.clientHeight ?? null,
        optionOffsetTop: optionNode?.offsetTop ?? null,
        scrollY: window.scrollY
      };
    });
    assert(mobileArrowState.activeId && mobileArrowState.visible, `hero command bar mobile keyboard: active option scrolled out of view ${JSON.stringify(mobileArrowState)}`);

    await mobilePage.locator('#hero-search-close').click();
    await mobilePage.waitForFunction(() => !document.body.classList.contains('hero-search-mode') && document.getElementById('hero-search-panel')?.hidden, null, { timeout: 5000 });
    await mobilePage.waitForFunction(() => document.activeElement === window.__mobileHeroOpener, null, { timeout: 5000 });
    const mobileRestorationState = await mobilePage.evaluate(() => ({
      sameRoot: document.getElementById('hero-slot') === window.__mobileHeroRoot,
      originalParent: document.getElementById('hero-slot')?.parentElement === window.__mobileHeroParent,
      parentId: document.getElementById('hero-slot')?.parentElement?.id || '',
      anchors: document.querySelectorAll('.hero-search-anchor').length,
      overlayHidden: document.getElementById('hero-search-overlay')?.hidden ?? false,
      mainInert: document.querySelector('main')?.hasAttribute('inert') || false,
      bodyOverflow: getComputedStyle(document.body).overflow,
      htmlOverflow: getComputedStyle(document.documentElement).overflow,
      openerRestored: document.activeElement === window.__mobileHeroOpener,
      scroll: { x: window.scrollX, y: window.scrollY },
      originalScroll: window.__mobileHeroScroll
    }));
    assert(
      mobileRestorationState.sameRoot
        && mobileRestorationState.originalParent
        && mobileRestorationState.parentId === 'live-head'
        && mobileRestorationState.anchors === 0
        && mobileRestorationState.overlayHidden
        && !mobileRestorationState.mainInert
        && mobileRestorationState.bodyOverflow !== 'hidden'
        && mobileRestorationState.htmlOverflow !== 'hidden'
        && mobileRestorationState.openerRestored
        && Math.abs(mobileRestorationState.scroll.x - mobileRestorationState.originalScroll.x) <= 1
        && Math.abs(mobileRestorationState.scroll.y - mobileRestorationState.originalScroll.y) <= 1,
      `hero command bar mobile close: exact root, opener, scroll, or isolation was not restored ${JSON.stringify(mobileRestorationState)}`
    );

    await mobilePage.setViewportSize({ width: 700, height: 900 });
    await mobilePage.locator('#hero-search-input').focus();
    await mobilePage.waitForFunction(() => {
      const rect = document.getElementById('hero-search-overlay')?.getBoundingClientRect();
      const viewport = window.visualViewport;
      return rect && Math.abs(rect.width - (viewport?.width || innerWidth)) <= 2;
    }, null, { timeout: 5000 });
    const tabletRailState = await mobilePage.evaluate(() => {
      const chips = document.getElementById('hero-search-chips');
      const rect = chips?.getBoundingClientRect();
      const overlay = document.getElementById('hero-search-overlay')?.getBoundingClientRect();
      const viewport = window.visualViewport;
      return {
        overlayPosition: getComputedStyle(document.getElementById('hero-search-overlay')).position,
        overlayWidth: overlay?.width || 0,
        viewportWidth: viewport?.width || innerWidth,
        display: getComputedStyle(chips).display,
        height: rect?.height || 0,
        rootInChamber: Boolean(document.getElementById('hero-slot')?.closest('[data-hero-search-chamber]')),
        overflow: document.documentElement.scrollWidth - innerWidth
      };
    });
    assert(tabletRailState.overlayPosition === 'fixed' && Math.abs(tabletRailState.overlayWidth - tabletRailState.viewportWidth) <= 2 && tabletRailState.display === 'none' && tabletRailState.height === 0 && tabletRailState.rootInChamber && tabletRailState.overflow <= 1, `hero command bar tablet: full-screen Index Chamber or hidden shortcut rail drifted ${JSON.stringify(tabletRailState)}`);
    await mobilePage.locator('#hero-search-close').click();
    await mobileContext.close();
    }

    assert(issues.length === 0, `hero command bar browser issues:\n${issues.join('\n')}`);
    log(`ok - hero command bar ${section} smoke`);
  }

  async function smokeHandoffQuestionField(browser, baseUrl) {
    const issues = [];
    const themes = ['aurora', 'matrix', 'hen', 'default', 'void', 'ember', 'signal', 'nerv', 'clean', 'dark', 'bubblegum', 'abyss', 'moss', 'valley', 'warzone'];
    const viewports = [
      { label: 'desktop', width: 1280, height: 900 },
      { label: 'compact-desktop', width: 748, height: 844 },
      { label: 'mobile', width: 390, height: 844 }
    ];
    const context = await browser.newContext({
      viewport: { width: viewports[0].width, height: viewports[0].height },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(context);
    await context.route('https://cdn.jsdelivr.net/**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: `window.Chart = window.Chart || class SmokeChart {
        constructor(target, config = {}) { this.canvas = target?.canvas || target; this.data = config.data || {}; this.options = config.options || {}; }
        update() {}
        destroy() {}
        resize() {}
        static getChart() { return null; }
      };`
    }));
    await context.route('https://fonts.googleapis.com/**', (route) => route.fulfill({
      status: 200,
      contentType: 'text/css',
      body: ''
    }));
    await context.route('https://fonts.gstatic.com/**', (route) => route.fulfill({
      status: 204,
      contentType: 'font/woff2',
      body: ''
    }));
    await context.addInitScript(() => {
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-home-layout-v1', JSON.stringify({ version: 1, hidden: [] }));
    });
    const page = await context.newPage();
    attachIssueCollectors(page, 'Handoff Question Field', issues);

    const renderFocusedHandoff = async () => {
      await page.waitForLoadState('domcontentloaded');
      await page.waitForFunction(() => document.documentElement.dataset.dashboardReady === 'true', null, { timeout: 30000 });
      await page.locator('#recruit-section[data-site-handoff]').waitFor({ state: 'attached', timeout: 15000 });
      await page.evaluate(async () => {
        const [{ renderSiteHandoff }, { findCurrentSiteMapContext, findCurrentSiteMapEntry, findSiteMapEntry }] = await Promise.all([
          import('/js/core/site-handoff.js'),
          import('/js/core/site-map.js')
        ]);
        const handoff = document.getElementById('recruit-section');
        const currentContext = findCurrentSiteMapContext();
        renderSiteHandoff(handoff, {
          currentEntry: currentContext.entry || findCurrentSiteMapEntry() || findSiteMapEntry('home'),
          currentContext
        });
      });
      await page.locator('#recruit-section .site-handoff-question-field').waitFor({ state: 'visible', timeout: 15000 });
    };

    const interactionResponse = await page.goto(`${baseUrl}/?theme=aurora`, { waitUntil: 'commit' });
    assert(interactionResponse?.ok(), `Handoff Question Field interaction proof failed with HTTP ${interactionResponse?.status()}`);
    await renderFocusedHandoff();
    const signalState = await page.evaluate(() => {
      const handoff = document.getElementById('recruit-section');
      const before = [...handoff.querySelectorAll('[data-handoff-question]')];
      const beforeGeometry = before.map((link) => {
        const rect = link.getBoundingClientRect();
        return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
      });
      const focused = handoff.querySelector('[data-handoff-question="build"]');
      focused.focus();
      const scrollBefore = window.scrollY;
      window.dispatchEvent(new CustomEvent('site-handoff-signal', {
        detail: { signal: { category: 'governance', title: 'Focused Handoff smoke' } }
      }));
      const after = [...handoff.querySelectorAll('[data-handoff-question]')];
      const geometryStable = after.every((link, index) => {
        const rect = link.getBoundingClientRect();
        const beforeRect = beforeGeometry[index];
        return Math.abs(rect.left - beforeRect.left) <= 0.25
          && Math.abs(rect.top - beforeRect.top) <= 0.25
          && Math.abs(rect.width - beforeRect.width) <= 0.25
          && Math.abs(rect.height - beforeRect.height) <= 0.25;
      });
      return {
        sameNodes: before.length === after.length && before.every((node, index) => node === after[index]),
        geometryStable,
        focusPreserved: document.activeElement === focused,
        scrollBefore,
        scrollAfter: window.scrollY,
        emphasized: handoff.querySelector('.site-handoff-question.is-emphasized')?.dataset.handoffQuestion || '',
        source: handoff.dataset.siteHandoffEmphasisSource || '',
        constellation: handoff.dataset.siteHandoffConstellation || '',
        centerRelation: handoff.querySelector('[data-handoff-question="decide"]')?.dataset.handoffRelation || '',
        relatedCount: handoff.querySelectorAll('[data-handoff-relation="near"]').length,
        distantCount: handoff.querySelectorAll('[data-handoff-relation="far"]').length,
        signalOffsets: [...handoff.querySelectorAll('[data-handoff-relation="near"]')]
          .map((link) => link.style.getPropertyValue('--handoff-signal-x')),
        heldMotionSuppressed: handoff.querySelectorAll('.site-handoff-question.is-signal-arriving').length === 0
      };
    });
    assert(
      signalState.sameNodes
        && signalState.geometryStable
        && signalState.focusPreserved
        && Math.abs(signalState.scrollAfter - signalState.scrollBefore) <= 1
        && signalState.emphasized === 'decide'
        && signalState.source === 'signal'
        && signalState.constellation === 'decide'
        && signalState.centerRelation === 'center'
        && signalState.relatedCount >= 1
        && signalState.distantCount >= 1
        && signalState.signalOffsets.some((offset) => offset && offset !== '0.00px')
        && signalState.heldMotionSuppressed,
      `Handoff Question Field: topical emphasis replaced nodes or moved the reader ${JSON.stringify(signalState)}`
    );

    await Promise.all([
      page.waitForURL((url) => url.pathname === '/health/', { waitUntil: 'commit', timeout: 10000 }),
      page.locator('#recruit-section [data-handoff-question="health"]').click()
    ]);
    await renderFocusedHandoff();
    const satelliteRouteState = await page.evaluate(async () => {
      const { findCurrentSiteMapContext } = await import('/js/core/site-map.js');
      return {
        path: location.pathname,
        contextEntry: findCurrentSiteMapContext().entryId,
        currentQuestion: document.querySelector('#recruit-section [data-handoff-question][aria-current="page"]')?.dataset.handoffQuestion || '',
        tier: document.querySelector('#recruit-section [data-handoff-question="health"]')?.dataset.handoffTier || ''
      };
    });
    assert(
      satelliteRouteState.path === '/health/'
        && satelliteRouteState.contextEntry === 'health'
        && satelliteRouteState.currentQuestion === 'health'
        && satelliteRouteState.tier === 'satellite',
      `Handoff Question Field: satellite navigation lost its direct Chamber context ${JSON.stringify(satelliteRouteState)}`
    );

    await page.goto(`${baseUrl}/?theme=aurora`, { waitUntil: 'commit' });
    await renderFocusedHandoff();
    await Promise.all([
      page.waitForURL((url) => url.pathname === '/chamber/', { waitUntil: 'commit', timeout: 10000 }),
      page.locator('#recruit-section [data-handoff-question="decide"]').click()
    ]);
    await renderFocusedHandoff();
    const chamberState = await page.evaluate(async () => {
      const { findCurrentSiteMapContext } = await import('/js/core/site-map.js');
      return {
        path: location.pathname,
        contextEntry: findCurrentSiteMapContext().entryId,
        currentQuestion: document.querySelector('#recruit-section [data-handoff-question][aria-current="page"]')?.dataset.handoffQuestion || ''
      };
    });
    assert(
      chamberState.path === '/chamber/'
        && chamberState.contextEntry === 'chamber'
        && chamberState.currentQuestion === 'decide',
      `Handoff Question Field: canonical governance navigation lost its current-question context ${JSON.stringify(chamberState)}`
    );

    const constellationCases = [
      { expected: 'build', signal: { category: 'ecosystem', title: 'Apps are being built' } },
      { expected: 'move', signal: { category: 'market', title: 'Value is moving' } },
      { expected: 'now', signal: { category: 'network', title: 'What now' } },
      { expected: 'mine', signal: { category: 'wallet', title: 'My account' } },
      { expected: 'decide', signal: { category: 'governance', title: 'A proposal is live' } },
      { expected: 'before', signal: { category: 'history', title: 'Protocol memory' } },
      { expected: 'power', signal: { category: 'staking', title: 'Staking power' } },
      { expected: 'health', signal: { category: 'network health', title: 'Finality is healthy' } },
      { expected: 'capital', signal: { category: 'capital', title: 'Stablecoin activity' } },
      { expected: 'etherlink', signal: { category: 'etherlink', title: 'Layer 2 activity' } },
      { expected: 'bakers', signal: { category: 'baker directory', title: 'Active validators' } },
      { expected: 'maxis', signal: { category: 'maxis', title: 'A new crown leader' } },
      { expected: 'recognition', signal: { category: 'tezoscrp', title: 'Community recognition' } }
    ];
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const response = await page.goto(`${baseUrl}/?theme=aurora`, { waitUntil: 'commit' });
      assert(response?.ok(), `Handoff Question Field: ${viewport.label} shell failed with HTTP ${response?.status()}`);
      await renderFocusedHandoff();
      for (const theme of themes) {
        await page.evaluate(async (nextTheme) => {
          const { setTheme } = await import('/js/ui/theme.js');
          setTheme(nextTheme);
          const stylesheet = document.getElementById(`theme-css-${nextTheme}`);
          if (stylesheet && !stylesheet.sheet) {
            await new Promise((resolve) => {
              const done = () => resolve();
              stylesheet.addEventListener('load', done, { once: true });
              stylesheet.addEventListener('error', done, { once: true });
              setTimeout(done, 3000);
            });
          }
          await document.fonts?.ready;
        }, theme);
        await page.waitForTimeout(100);
        const states = await page.evaluate((cases) => cases.map(({ expected, signal }) => {
          const shell = document.getElementById('recruit-section');
          window.dispatchEvent(new CustomEvent('site-handoff-signal', { detail: { signal } }));
          const field = shell?.querySelector('.site-handoff-question-field');
          const fieldRect = field?.getBoundingClientRect();
          const questions = [...(field?.querySelectorAll('[data-handoff-question]') || [])]
            .filter((question) => {
              const style = getComputedStyle(question);
              const rect = question.getBoundingClientRect();
              return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
            })
            .map((question) => {
              const rect = question.getBoundingClientRect();
              return {
                id: question.dataset.handoffQuestion,
                left: rect.left,
                right: rect.right,
                top: rect.top,
                bottom: rect.bottom,
                width: rect.width,
                height: rect.height,
                emphasized: question.classList.contains('is-emphasized'),
                relation: question.dataset.handoffRelation || ''
              };
            });
          const overlaps = [];
          for (let leftIndex = 0; leftIndex < questions.length; leftIndex += 1) {
            for (let rightIndex = leftIndex + 1; rightIndex < questions.length; rightIndex += 1) {
              const left = questions[leftIndex];
              const right = questions[rightIndex];
              const overlapWidth = Math.min(left.right, right.right) - Math.max(left.left, right.left);
              const overlapHeight = Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top);
              if (overlapWidth > 2 && overlapHeight > 2) overlaps.push([left.id, right.id]);
            }
          }
          return {
            expected,
            constellation: shell?.dataset.siteHandoffConstellation || '',
            count: questions.length,
            emphasized: questions.filter((question) => question.emphasized).length,
            emphasizedId: questions.find((question) => question.emphasized)?.id || '',
            centerCount: questions.filter((question) => question.relation === 'center').length,
            relatedCount: questions.filter((question) => question.relation === 'near').length,
            distantCount: questions.filter((question) => question.relation === 'far').length,
            shortTargets: questions.filter((question) => question.width < 43 || question.height < 43).map((question) => question.id),
            outsideField: questions.filter((question) => (
              question.left < fieldRect.left - 2
              || question.right > fieldRect.right + 2
              || question.top < fieldRect.top - 2
              || question.bottom > fieldRect.bottom + 2
            )).map((question) => question.id),
            overlaps,
            documentOverflow: document.documentElement.scrollWidth - innerWidth
          };
        }), constellationCases);
        for (const state of states) {
          assert(
            state.count === 13
              && state.constellation === state.expected
              && state.emphasized === 1
              && state.emphasizedId === state.expected
              && state.centerCount === 1
              && state.relatedCount >= 1
              && state.distantCount >= 1
              && state.shortTargets.length === 0
              && state.outsideField.length === 0
              && state.overlaps.length === 0
              && state.documentOverflow <= 1,
            `Handoff Question Field: ${theme} ${viewport.label} ${state.expected} constellation failed ${JSON.stringify(state)}`
          );
        }
      }
    }

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${baseUrl}/?theme=aurora`, { waitUntil: 'commit' });
    await renderFocusedHandoff();
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.locator('#recruit-section .site-handoff-question-field').scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    const motionBefore = await page.locator('#recruit-section [data-handoff-question]').evaluateAll((questions) => questions.map((question) => {
      const rect = question.getBoundingClientRect();
      return { id: question.dataset.handoffQuestion, left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    }));
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('site-handoff-signal', {
        detail: { signal: { category: 'market', title: 'Value is moving' } }
      }));
    });
    await page.waitForTimeout(120);
    const motionDuring = await page.locator('#recruit-section [data-handoff-question]').evaluateAll((questions) => questions.map((question) => {
      const rect = question.getBoundingClientRect();
      return {
        id: question.dataset.handoffQuestion,
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        wordAnimation: getComputedStyle(question.querySelector(':scope > span')).animationName,
        wordTranslate: getComputedStyle(question.querySelector(':scope > span')).translate
      };
    }));
    await page.waitForTimeout(760);
    await page.waitForFunction(() => [...document.querySelectorAll('#recruit-section [data-handoff-question] > span')].every((word) => {
      const translate = getComputedStyle(word).translate;
      return translate === 'none'
        || translate.split(/\s+/).every((token) => Math.abs(Number.parseFloat(token)) <= 0.001);
    }), null, { timeout: 2000 });
    const settledMotion = await page.locator('#recruit-section [data-handoff-question] > span').evaluateAll((words) => words.map((word) => getComputedStyle(word).translate));
    await page.waitForTimeout(900);
    const heldSettledMotion = await page.locator('#recruit-section [data-handoff-question] > span').evaluateAll((words) => words.map((word) => getComputedStyle(word).translate));
    const translateIsSettled = (translate) => translate === 'none'
      || translate.split(/\s+/).every((token) => Math.abs(Number.parseFloat(token)) <= 0.001);
    assert(
      motionBefore.every((before, index) => (
        before.id === motionDuring[index]?.id
          && Math.abs(before.left - motionDuring[index].left) <= 0.25
          && Math.abs(before.top - motionDuring[index].top) <= 0.25
          && Math.abs(before.width - motionDuring[index].width) <= 0.25
          && Math.abs(before.height - motionDuring[index].height) <= 0.25
      ))
        && motionDuring.some((state) => state.wordAnimation === 'site-handoff-signal-settle' && state.wordTranslate !== 'none')
        && settledMotion.every(translateIsSettled)
        && heldSettledMotion.every(translateIsSettled),
      `Handoff Question Field: one fresh signal must move only inner content and then settle ${JSON.stringify({ motionBefore, motionDuring, settledMotion, heldSettledMotion })}`
    );

    await page.emulateMedia({ reducedMotion: 'reduce' });
    const reducedMotionState = await page.locator('#recruit-section [data-handoff-question] > span').evaluateAll((words) => words.map((word) => ({
      animation: getComputedStyle(word).animationName,
      translate: getComputedStyle(word).translate,
      scale: getComputedStyle(word).scale
    })));
    assert(
      reducedMotionState.every((word) => word.animation === 'none' && word.translate === 'none' && word.scale === 'none'),
      `Handoff Question Field: reduced motion must fully settle every signal word ${JSON.stringify(reducedMotionState)}`
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${baseUrl}/?theme=clean`, { waitUntil: 'commit' });
    await renderFocusedHandoff();
    await page.evaluate(async () => {
      const ui = await import('/js/ui/release-update.js');
      window.__handoffReleaseUpdateUi = ui;
      ui.showReleaseUpdateDock({
        detail: 'A compact update remains available while you choose what comes next.',
        canDefer: true
      });
    });
    await page.waitForFunction(() => {
      const dock = document.querySelector('[data-release-update-dock]');
      return dock?.classList.contains('is-visible')
        && dock.classList.contains('is-collapsed')
        && Boolean(getComputedStyle(document.documentElement).getPropertyValue('--release-update-safe-bottom').trim());
    });
    await page.locator('#recruit-section .site-map-disclosure > summary').evaluate((summary) => summary.scrollIntoView({ block: 'end', behavior: 'instant' }));
    await page.waitForTimeout(120);
    const mobileDockClearance = await page.evaluate(() => {
      const dockRect = document.querySelector('[data-release-update-dock]')?.getBoundingClientRect();
      const summaryRect = document.querySelector('#recruit-section .site-map-disclosure > summary')?.getBoundingClientRect();
      return {
        dockWidth: dockRect?.width || 0,
        overlapHeight: dockRect && summaryRect ? Math.min(dockRect.bottom, summaryRect.bottom) - Math.max(dockRect.top, summaryRect.top) : Number.NaN,
        summaryBottom: summaryRect?.bottom || 0,
        dockTop: dockRect?.top || 0,
        viewportWidth: innerWidth,
        safeBottom: getComputedStyle(document.documentElement).getPropertyValue('--release-update-safe-bottom').trim(),
        htmlScrollPadding: getComputedStyle(document.documentElement).scrollPaddingBottom,
        bodyPadding: getComputedStyle(document.body).paddingBottom,
        scrollY: window.scrollY,
        maxScrollY: document.documentElement.scrollHeight - innerHeight
      };
    });
    assert(
      mobileDockClearance.dockWidth < mobileDockClearance.viewportWidth - 80
        && mobileDockClearance.overlapHeight <= 0
        && mobileDockClearance.summaryBottom <= mobileDockClearance.dockTop,
      `Handoff Question Field: compact update notice obscured the mobile complete-map control ${JSON.stringify(mobileDockClearance)}`
    );
    await page.evaluate(() => window.__handoffReleaseUpdateUi.hideReleaseUpdateDock());

    await context.close();
    assert(issues.length === 0, `Handoff Question Field browser issues:\n${issues.join('\n')}`);
    log('ok - Handoff Question Field across 13 constellation states, 15 themes, and desktop/compact/mobile widths');
  }

  return { smokeHeroIntermediate, smokeSearchCatalogRecovery, smokeHeroCommandBar, smokeHandoffQuestionField };
}
