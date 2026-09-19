// Browser workflows owned by governance. Shared dependencies remain explicit.
export function createGovernanceSmokeSuites({
  ETHERLINK_FAST_CONTRACT,
  ETHERLINK_FAST_PROPOSAL,
  SAMPLE_ADDRESS,
  assert,
  assertChamberControlGeometry,
  assertChamberOrder,
  assertLocatorCount,
  assertNormalizedChamberShell,
  assertResponsiveChamberCards,
  attachIssueCollectors,
  ensureDropdownOpen,
  expectCount,
  expectShareModal,
  installFeatureMocks,
  installOctezConnectMock,
  log
}) {
  async function smokeGovernanceTestingPeriod(browser, baseUrl, section = 'all') {
    const issues = [];
    if (section === 'all' || section === 'active') {
    const context = await browser.newContext({
      viewport: { width: 1512, height: 982 },
      serviceWorkers: 'block'
    });
    await context.grantPermissions(['clipboard-write'], { origin: baseUrl });
    await installFeatureMocks(context);
    await context.addInitScript(() => {
      window.__tezosSystemsIntervals = [];
      let nextTestIntervalId = 1_000_000;
      window.setInterval = (handler, timeout, ...args) => {
        const id = nextTestIntervalId++;
        window.__tezosSystemsIntervals.push({ handler, id, timeout, args });
        return id;
      };
      localStorage.setItem('tezos-systems-theme', 'matrix');
      localStorage.setItem('tezos-systems-stats-visible', 'true');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    });
    const page = await context.newPage();
    attachIssueCollectors(page, 'governance testing period', issues);
    const lbBlockRequests = [];
    const tz4OperationRequests = [];
    const tz4DelegateRequests = [];
    const lazyPollingModuleRequests = [];
    page.on('request', (request) => {
      try {
        const url = new URL(request.url());
        const select = url.searchParams.get('select') || '';
        if (url.pathname.endsWith('/blocks') && select.includes('lbToggleEma')) lbBlockRequests.push(url);
        if (url.pathname.endsWith('/operations/update_consensus_key')) tz4OperationRequests.push(url);
        if (url.pathname.endsWith('/delegates') && select.includes('consensusAddress') && select.includes('software')) tz4DelegateRequests.push(url);
        if (/\/js\/features\/(?:liquidity-baking|tz4-adoption)\.js$/.test(url.pathname)) lazyPollingModuleRequests.push(url.pathname);
      } catch { /* ignore non-URL browser requests */ }
    });

    const response = await page.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `governance testing period: dashboard failed with HTTP ${response?.status()}`);
    await page.waitForFunction(() => {
      const breakdown = document.querySelector('#issuance-breakdown')?.textContent?.trim() || '';
      return /LB/.test(breakdown);
    }, null, { timeout: 10000 });
    const lazyPollingBeforeIntent = await page.evaluate(() => ({
      lbSkeleton: document.getElementById('lb-entry-card')?.hasAttribute('data-chamber-skeleton') || false,
      lbLive: document.getElementById('lb-entry-card')?.dataset.lbLive || '',
      tz4Wired: document.querySelector('[data-stat="tz4-adoption"]')?.dataset.tz4ChamberWired || ''
    }));
    assert(lazyPollingBeforeIntent.lbSkeleton && !lazyPollingBeforeIntent.lbLive, `governance testing period: LB launcher should remain a stable, non-live shell before intent ${JSON.stringify(lazyPollingBeforeIntent)}`);
    assert(!lazyPollingBeforeIntent.tz4Wired, `governance testing period: tz4 launcher should remain unhydrated before intent ${JSON.stringify(lazyPollingBeforeIntent)}`);
    assert(lazyPollingModuleRequests.length === 0, `governance testing period: LB/tz4 modules loaded before route, visibility, or intent ${JSON.stringify(lazyPollingModuleRequests)}`);

    for (const categoryKey of ['network', 'bakers', 'governance']) {
      await page.locator(`#chambers-grid > .chamber-category[data-chamber-category="${categoryKey}"] .chamber-category-toggle`).click();
    }

    await page.locator('#chambers-grid > .chamber-category[data-chamber-category="governance"]').scrollIntoViewIfNeeded();
    await page.locator('#lb-entry-card[data-lb-live="true"][data-lb-refresh-interval="60000"]').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('#lb-entry-card').hover();
    await page.evaluate(() => {
      window.__lbEntryTimer = (window.__tezosSystemsIntervals || []).find((item) => (
        item.timeout === 60000 && String(item.handler).includes('refreshLiquidityBakingEntryCard')
      )) || null;
    });
    await page.locator('#chambers-grid > .chamber-category[data-chamber-category="bakers"]').scrollIntoViewIfNeeded();
    await page.locator('.stat-card[data-stat="tz4-adoption"].chamber-entry-card .chamber-expand-cue').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('.stat-card[data-stat="tz4-adoption"]').hover();
    for (const [categoryKey, selector] of [
      ['governance', '#chamber-entry-card'],
      ['governance', '#etherlink-governance-entry-card'],
      ['network', '#tezlink-entry-card']
    ]) {
      await page.locator(`#chambers-grid > .chamber-category[data-chamber-category="${categoryKey}"]`).scrollIntoViewIfNeeded();
      await page.locator(`${selector} .card-copy-link`).waitFor({ state: 'attached', timeout: 10000 });
      await page.locator(selector).hover();
    }
    await page.locator('#etherlink-governance-entry-card[data-etherlink-governance-live="true"]').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('#pulse-ticker-strip [data-hot-signal-id="etherlink-governance-fast"]').waitFor({ state: 'visible', timeout: 10000 });
    await page.evaluate(async () => {
      const ticker = await import('/js/ui/pulse-ticker.js');
      ticker.holdPulseTickerSignal('etherlink-governance-fast');
    });
    const etherlinkHotState = await page.evaluate(() => {
      const card = document.querySelector('#pulse-ticker-strip [data-hot-signal-id="etherlink-governance-fast"]');
      const first = document.querySelector('#pulse-ticker-strip [data-hot-signal-index="0"]');
      return {
        firstId: first?.dataset.hotSignalId || '',
        href: card?.getAttribute('href') || '',
        text: card?.textContent?.replace(/\s+/g, ' ').trim() || '',
        shelfText: document.getElementById('pulse-ticker-shelf')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        classes: card?.className || '',
        weight: card?.dataset.pulseWeight || '',
        spectacle: card?.dataset.hotSpectacle || ''
      };
    });
    assert(etherlinkHotState.firstId === 'etherlink-governance-fast', `governance testing period: active L2 vote must lead What's Hot, saw ${JSON.stringify(etherlinkHotState)}`);
    assert(etherlinkHotState.href === '/l2chamber/', `governance testing period: L2 hot route mismatch: ${etherlinkHotState.href}`);
    assert(/L2 VOTE OPEN NOW/.test(etherlinkHotState.shelfText) && /00625d22ab/.test(etherlinkHotState.shelfText) && /Promotion is next/.test(etherlinkHotState.shelfText), `governance testing period: L2 ticker shelf missing live vote guidance: ${etherlinkHotState.shelfText}`);
    assert(etherlinkHotState.weight === 'event' && /\bis-weight-event\b/.test(etherlinkHotState.classes) && etherlinkHotState.spectacle === 'historic', `governance testing period: L2 hot alert should use the boldest ticker treatment: ${JSON.stringify(etherlinkHotState)}`);
    await expectCount(page, '#chamber-entry-card .card-copy-link[data-copy-hash="#chamber"]', 1, 'governance testing period chamber card link');
    await expectCount(page, '#tezlink-entry-card.chamber-entry-wide .card-copy-link[data-copy-hash="#tezosx"]', 1, 'governance testing period Tezos X card link');
    await expectCount(page, '#etherlink-governance-entry-card.chamber-entry-wide .card-copy-link[data-copy-hash="#l2chamber"]', 1, 'governance testing period Tezos X Governance card link');
    await expectCount(page, '#chambers-toggle', 1, 'governance testing period chambers launcher button');
    await expectCount(page, '.feature-copy-link[data-copy-hash="#chambers"]', 1, 'governance testing period chambers launcher link');
    await expectCount(page, '#lb-entry-card .card-copy-link[data-copy-hash="#lb"]', 1, 'governance testing period LB chamber link');
    await expectCount(page, '#ctez-launcher', 1, 'governance testing period ctez top-left launcher');
    await expectCount(page, '#ctez-feature-btn', 1, 'governance testing period ctez feature launcher');
    await expectCount(page, '.feature-copy-link[data-copy-hash="#ctez"]', 1, 'governance testing period ctez feature link');
    await expectCount(page, '#tzsafe-launcher[href="https://tzsafe.tez.page/"]', 1, 'governance testing period TzSafe top-left launcher');
    await expectCount(page, '#tzsafe-feature-link[href="https://tzsafe.tez.page/"]', 1, 'governance testing period TzSafe feature link');
    await expectCount(page, '#chambers-section [data-stat="tz4-adoption"] .card-copy-link[data-copy-hash="#tz4"]', 1, 'governance testing period tz4 tile link');
    await expectCount(page, '#chambers-section [data-stat="network-health"] .card-copy-link[data-copy-hash="#health"]', 1, 'governance testing period health tile link');
    await expectCount(page, '#chambers-section #lb-entry-card', 1, 'governance testing period LB tile in Chambers');
    await expectCount(page, '#chambers-section #tezlink-entry-card', 1, 'governance testing period Tezos X tile in Chambers');
    await expectCount(page, '#chambers-section #etherlink-governance-entry-card', 1, 'governance testing period Tezos X Governance tile in Chambers');
    await assertLocatorCount(page.locator('#chambers-section #ctez-entry-card'), 0, 'governance testing period ctez tile in Chambers');
    await expectCount(page, '#chambers-section [data-stat="tz4-adoption"]', 1, 'governance testing period tz4 tile in Chambers');
    await expectCount(page, '#chambers-section [data-stat="network-health"]', 1, 'governance testing period health tile in Chambers');
    await page.waitForFunction(() => document.querySelectorAll('#chambers-section .chamber-entry-card[data-updated-label]').length >= 6, null, { timeout: 10000 });
    await assertChamberOrder(page, 'governance testing period');
    await page.evaluate(() => {
      document.querySelectorAll('#chambers-grid > .chamber-category').forEach((category) => {
        category.dataset.chamberExpanded = 'true';
        category.querySelector(':scope > .chamber-category-head > .chamber-category-toggle')?.setAttribute('aria-expanded', 'true');
        const cards = category.querySelector(':scope > .chamber-category-cards');
        if (cards) cards.hidden = false;
      });
    });
    await assertChamberControlGeometry(page, 'governance testing period');
    await page.waitForFunction(() => /Latest switches/i.test(document.querySelector('#tz4-entry-preview')?.textContent || ''), null, { timeout: 10000 });
    await page.locator('#chambers-section [data-stat="tz4-adoption"]').scrollIntoViewIfNeeded();
    await page.evaluate(() => document.querySelector('#chambers-section [data-stat="tz4-adoption"] > .card-share-btn')?.click());
    await page.locator('#share-modal.visible').waitFor({ state: 'visible', timeout: 10000 });
    const chamberShareCapture = await page.evaluate(() => window.__lastHtml2CanvasText?.replace(/\s+/g, ' ').trim() || '');
    assert(/chambers\s+·\s+panel snapshot/i.test(chamberShareCapture), `governance testing period: chamber share missing branded panel snapshot label: ${chamberShareCapture}`);
    assert(/visible chamber panel/i.test(chamberShareCapture), `governance testing period: chamber share missing visible panel frame: ${chamberShareCapture}`);
    assert(/tz4 Adoption/.test(chamberShareCapture) && /Latest switches/i.test(chamberShareCapture) && /Pending/i.test(chamberShareCapture), `governance testing period: chamber share should include visible tz4 panel content: ${chamberShareCapture}`);
    await expectShareModal(page, 'governance testing period chamber card share', issues);
    await assertResponsiveChamberCards(browser, baseUrl, { width: 900, height: 1000 }, 'governance live chamber tablet', { governanceLiveVote: true });
    await assertResponsiveChamberCards(browser, baseUrl, { width: 390, height: 844 }, 'governance live chamber mobile', { governanceLiveVote: true });

    const adoptionContext = await browser.newContext({
      viewport: { width: 960, height: 720 },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(adoptionContext, { governanceAdoptionPeriod: true, etherlinkNullProposal: true });
    await adoptionContext.addInitScript(() => {
      localStorage.setItem('tezos-systems-theme', 'matrix');
      localStorage.setItem('tezos-systems-stats-visible', 'true');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    });
    const adoptionPage = await adoptionContext.newPage();
    attachIssueCollectors(adoptionPage, 'governance adoption entry card', issues);
    const adoptionResponse = await adoptionPage.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
    assert(adoptionResponse?.ok(), `governance adoption entry card: dashboard failed with HTTP ${adoptionResponse?.status()}`);
    await adoptionPage.evaluate(() => {
      document.querySelectorAll('#chambers-grid > .chamber-category').forEach((category) => {
        category.dataset.chamberExpanded = 'true';
        category.querySelector(':scope > .chamber-category-head > .chamber-category-toggle')?.setAttribute('aria-expanded', 'true');
        const cards = category.querySelector(':scope > .chamber-category-cards');
        if (cards) cards.hidden = false;
      });
    });
    await adoptionPage.locator('#chamber-entry-card').scrollIntoViewIfNeeded();
    await adoptionPage.locator('#chamber-entry-card').hover();
    await adoptionPage.locator('#chamber-entry-card.chamber-entry-adoption.chamber-entry-wide[data-chamber-entry-size="wide"]').waitFor({ state: 'visible', timeout: 10000 });
    await assertChamberControlGeometry(adoptionPage, 'governance adoption entry card');
    const adoptionState = await adoptionPage.evaluate(() => {
      const card = document.querySelector('#chamber-entry-card');
      return {
        protocolPromptCount: document.querySelectorAll('#gov-countdown-banner, #gov-countdown-banner-slot, #upgrade-status .voting-status-compact').length,
        text: card?.textContent?.replace(/\s+/g, ' ').trim() || '',
        description: card?.querySelector('.stat-description')?.textContent?.trim() || '',
        mini: document.querySelector('#chamber-entry-mini')?.textContent?.trim() || '',
        metrics: document.querySelector('#chamber-entry-metrics')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        metricsHidden: document.querySelector('#chamber-entry-metrics')?.hidden ?? true,
        size: card?.dataset.chamberEntrySize || '',
        adoptionClass: card?.classList.contains('chamber-entry-adoption') || false,
        liveClass: card?.classList.contains('chamber-entry-live') || false
      };
    });
    assert(adoptionState.protocolPromptCount === 0, `governance adoption entry card: protocol prompt should stay removed, saw ${adoptionState.protocolPromptCount}`);
    assert(adoptionState.adoptionClass && !adoptionState.liveClass && adoptionState.size === 'wide', `governance adoption entry card: adoption state should be wide but not live, saw ${JSON.stringify(adoptionState)}`);
    assert(adoptionState.description === 'Adoption period', `governance adoption entry card: description mismatch: ${adoptionState.description}`);
    assert(/No ballots: final runway before the protocol switch/.test(adoptionState.mini), `governance adoption entry card: missing adoption explainer: ${adoptionState.mini}`);
    assert(!adoptionState.metricsHidden, 'governance adoption entry card: adoption facts should be visible');
    assert(/Time left/.test(adoptionState.metrics) && /Activation/.test(adoptionState.metrics) && /Ballots Closed/.test(adoptionState.metrics) && /Next Protocol switch/.test(adoptionState.metrics), `governance adoption entry card: facts mismatch: ${adoptionState.metrics}`);
    await adoptionContext.close();

    await page.waitForFunction(() => {
      const canvas = document.getElementById('tz4-sparkline');
      const chart = canvas ? window.Chart?.getChart(canvas) : null;
      const values = chart?.data?.datasets?.[0]?.data || [];
      const latest = Number(values.at(-1));
      return Number.isFinite(latest) && Math.abs(latest - (100 / 3)) < 0.01;
    }, null, { timeout: 10000 });

    const dashboardState = await page.evaluate(() => ({
      protocolPromptCount: document.querySelectorAll('#gov-countdown-banner, #gov-countdown-banner-slot, #upgrade-status .voting-status-compact').length,
      upgradeStatusActive: document.querySelector('#upgrade-status')?.classList.contains('active') || false,
      governanceProcessCards: document.querySelectorAll('#upgrade-status .governance-process-card').length,
      governanceTallyCards: document.querySelectorAll('#upgrade-status .voting-tally').length,
      votingPeriod: document.querySelector('#voting-period-front')?.textContent?.trim() || '',
      participation: document.querySelector('#participation-front')?.textContent?.trim() || '',
      participationDescription: document.querySelector('#participation-description')?.textContent?.trim() || '',
      entryMini: document.querySelector('#chamber-entry-mini')?.textContent?.trim() || '',
      chamberEntryWide: document.querySelector('#chamber-entry-card')?.classList.contains('chamber-entry-wide') || false,
      chamberEntrySize: document.querySelector('#chamber-entry-card')?.dataset.chamberEntrySize || '',
      issuance: document.querySelector('#issuance-rate-front')?.textContent?.trim() || '',
      issuanceBreakdown: document.querySelector('#issuance-breakdown')?.textContent?.trim() || '',
      lbEntryEma: document.querySelector('#lb-entry-ema')?.textContent?.trim() || '',
      lbEntryDescription: document.querySelector('#lb-entry-description')?.textContent?.trim() || '',
      lbEntryVotes: Array.from(document.querySelectorAll('#lb-entry-vote-rows .lb-entry-vote-row')).map((row) => ({
        text: row.textContent?.replace(/\s+/g, ' ').trim() || '',
        vote: row.dataset.lbEntryVote || '',
        badgeClass: row.querySelector('.lb-entry-vote-badge')?.className || ''
      })),
      lbEntrySwitcherText: document.querySelector('#lb-entry-switcher-strip')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      lbEntrySwitcherCount: document.querySelector('#lb-entry-switcher-strip')?.dataset.lbSwitcherCount || '',
      lbEntrySampleBlocks: document.querySelector('#lb-entry-switcher-strip')?.dataset.lbSampleBlocks || '',
      lbEntrySwitchers: Array.from(document.querySelectorAll('#lb-entry-switcher-strip .lb-entry-switcher-item')).map((row) => ({
        address: row.dataset.lbEntrySwitch || '',
        level: Number(row.dataset.lbLevel || 0),
        text: row.textContent?.replace(/\s+/g, ' ').trim() || '',
        quietKey: row.dataset.quietKey || ''
      })),
      lbEntryLive: document.querySelector('#lb-entry-card')?.dataset.lbLive || '',
      lbEntryRefreshInterval: document.querySelector('#lb-entry-card')?.dataset.lbRefreshInterval || '',
      lbEntryRefreshedAt: document.querySelector('#lb-entry-card')?.dataset.lbRefreshedAt || '',
      lbEntryGeometry: (() => {
        const card = document.querySelector('#lb-entry-card');
        const ema = document.querySelector('#lb-entry-ema');
        const tape = document.querySelector('#lb-entry-vote-tape');
        const switchers = document.querySelector('#lb-entry-switcher-strip');
        const footer = card?.querySelector('.chamber-entry-footer');
        const controls = Array.from(card?.querySelectorAll(':scope > .card-copy-link, :scope > .card-share-btn, :scope > .card-info-btn, :scope > .card-history-btn') || []);
        const category = card?.closest('.chamber-category');
        const rect = (node) => {
          if (!node) return null;
          const box = node.getBoundingClientRect();
          return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
        };
        const cardRect = rect(card);
        const emaRect = rect(ema);
        const tapeRect = rect(tape);
        const switcherRect = rect(switchers);
        const footerRect = rect(footer);
        const overlapArea = (a, b) => a && b
          ? Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
            * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
          : 0;
        const categoryRect = rect(category?.querySelector(':scope > .chamber-category-cards'));
        return {
          cardHeight: cardRect ? Number(cardRect.height.toFixed(2)) : 0,
          cardWidth: cardRect ? Number(cardRect.width.toFixed(2)) : 0,
          categoryWidth: categoryRect ? Number(categoryRect.width.toFixed(2)) : 0,
          tapeRightOfEma: Boolean(emaRect && tapeRect && tapeRect.left >= emaRect.right + 8),
          tapeEmaBandOverlap: Boolean(emaRect && tapeRect && tapeRect.top < emaRect.bottom && tapeRect.bottom > emaRect.top),
          switchersBelowTape: Boolean(tapeRect && switcherRect && switcherRect.top >= tapeRect.bottom + 3),
          switchersAboveFooter: Boolean(switcherRect && footerRect && switcherRect.bottom <= footerRect.top - 3),
          switchersInsideCard: Boolean(cardRect && switcherRect && switcherRect.left >= cardRect.left && switcherRect.right <= cardRect.right),
          controlOverlap: controls.reduce((total, control) => total + overlapArea(rect(control), switcherRect), 0),
          pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
          category: category?.dataset.chamberCategory || '',
          categoryOrder: Array.from(category?.querySelectorAll(':scope > .chamber-category-cards > .stat-card') || []).map((entry) => entry.id || entry.dataset.stat || ''),
          emaRect,
          tapeRect,
          switcherRect,
          footerRect
        };
      })(),
      etherlinkEntryValue: document.querySelector('#etherlink-governance-entry-value')?.textContent?.trim() || '',
      etherlinkEntryDescription: document.querySelector('#etherlink-governance-entry-description')?.textContent?.trim() || '',
      etherlinkEntryMini: document.querySelector('#etherlink-governance-entry-mini')?.textContent?.trim() || '',
      etherlinkEntryLive: document.querySelector('#etherlink-governance-entry-card')?.dataset.etherlinkGovernanceLive || '',
      etherlinkEntryWide: document.querySelector('#etherlink-governance-entry-card')?.classList.contains('chamber-entry-wide') || false,
      etherlinkEntrySize: document.querySelector('#etherlink-governance-entry-card')?.dataset.etherlinkGovernanceSize || '',
      etherlinkEntryMetrics: document.querySelector('#etherlink-governance-entry-metrics')?.textContent?.trim() || '',
      tezlinkEntryGeometry: (() => {
        const pair = document.querySelector('#chambers-grid > .chamber-category[data-chamber-category="network"]');
        const card = document.querySelector('#tezlink-entry-card');
        const health = document.querySelector('#chambers-section [data-stat="network-health"]');
        const main = card?.querySelector('.tezlink-entry-main');
        const metrics = card?.querySelector('.tezlink-entry-metrics');
        const tape = card?.querySelector('.tezlink-entry-tape');
        const rect = (node) => {
          if (!node) return null;
          const box = node.getBoundingClientRect();
          return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
        };
        const mainRect = rect(main);
        const metricsRect = rect(metrics);
        const tapeRect = rect(tape);
        const healthRect = rect(health);
        const metricTruncations = Array.from(card?.querySelectorAll('.tezlink-entry-metric span, .tezlink-entry-metric strong') || [])
          .filter((node) => node.scrollWidth > node.clientWidth + 1)
          .map((node) => node.textContent?.trim() || '');
        return {
          category: pair?.dataset.chamberCategory || '',
          categoryOrder: Array.from(pair?.querySelectorAll(':scope > .chamber-category-cards > .stat-card') || []).map((entry) => entry.id || entry.dataset.stat || ''),
          cardRect: rect(card),
          healthRect,
          mainRect,
          metricsRect,
          tapeRect,
          metricTruncations,
          tapeBelowMetrics: Boolean(metricsRect && tapeRect && tapeRect.top >= metricsRect.bottom + 6),
          metricsRightOfMain: Boolean(mainRect && metricsRect && metricsRect.left >= mainRect.right + 8),
          pairedWithHealth: Boolean(healthRect && tapeRect && Math.abs((rect(card)?.top || 0) - healthRect.top) <= 1 && Math.abs((rect(card)?.bottom || 0) - healthRect.bottom) <= 1)
        };
      })(),
      chamberUpdatedLabels: Array.from(document.querySelectorAll('#chambers-section .chamber-entry-card[data-updated-label]')).map((card) => card.dataset.updatedLabel || ''),
      etherlinkEntryGeometry: (() => {
        const card = document.querySelector('#etherlink-governance-entry-card');
        const main = card?.querySelector('.tezlink-entry-main');
        const title = card?.querySelector('.stat-label');
        const metrics = card?.querySelector('#etherlink-governance-entry-metrics');
        const cue = card?.querySelector('.chamber-expand-cue');
        const sequencer = [...(card?.querySelectorAll('.etherlink-gov-entry-metric') || [])]
          .find((node) => /SEQUENCER/.test(node.textContent || ''));
        const rect = (node) => {
          if (!node) return null;
          const box = node.getBoundingClientRect();
          return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
        };
        const mainRect = rect(main);
        const titleRect = rect(title);
        const metricsRect = rect(metrics);
        const cueRect = rect(cue);
        const sequencerRect = rect(sequencer);
        const overlapArea = (a, b) => a && b
          ? Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
            * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
          : 0;
        const titleMetricsOverlap = titleRect && metricsRect
          ? overlapArea(titleRect, metricsRect)
          : 0;
        const metricTruncations = Array.from(card?.querySelectorAll('.etherlink-gov-entry-metric span, .etherlink-gov-entry-metric strong') || [])
          .filter((node) => node.scrollWidth > node.clientWidth + 1)
          .map((node) => node.textContent?.trim() || '');
        return {
          mainRect,
          titleRect,
          metricsRect,
          cueRect,
          sequencerRect,
          overlap: overlapArea(cueRect, sequencerRect),
          titleMetricsOverlap,
          metricsRightOfMain: Boolean(mainRect && metricsRect && metricsRect.left >= mainRect.right + 8),
          metricTruncations
        };
      })(),
      tz4TileValue: document.querySelector('#tz4-adoption-front')?.textContent?.trim() || '',
      tz4TileDescription: document.querySelector('#tz4-description')?.textContent?.trim() || '',
      tz4TileWide: document.querySelector('[data-stat="tz4-adoption"]')?.classList.contains('chamber-entry-wide') || false,
      tz4TileSize: document.querySelector('[data-stat="tz4-adoption"]')?.dataset.tz4EntrySize || '',
      tz4TilePending: document.querySelector('[data-stat="tz4-adoption"]')?.dataset.tz4Pending || '',
      tz4TileLatest: document.querySelector('[data-stat="tz4-adoption"]')?.dataset.tz4LatestSwitches || '',
      tz4TilePreview: document.querySelector('#tz4-entry-preview')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      tz4TileWired: document.querySelector('[data-stat="tz4-adoption"]')?.dataset.tz4ChamberWired || '',
      tz4TileRole: document.querySelector('[data-stat="tz4-adoption"]')?.getAttribute('role') || '',
      tz4TileTabIndex: document.querySelector('[data-stat="tz4-adoption"]')?.getAttribute('tabindex') || '',
      tz4TileCue: Boolean(document.querySelector('[data-stat="tz4-adoption"] .chamber-expand-cue')),
      tz4TileCueTag: document.querySelector('[data-stat="tz4-adoption"] .chamber-expand-cue')?.tagName || '',
      tz4SparklineLast: (() => {
        const canvas = document.getElementById('tz4-sparkline');
        const chart = canvas ? window.Chart?.getChart(canvas) : null;
        const values = chart?.data?.datasets?.[0]?.data || [];
        return Number(values.at(-1));
      })(),
      extraTz4EntryCard: Boolean(document.querySelector('#tz4-entry-card')),
      intervalDelays: (window.__tezosSystemsIntervals || []).map((item) => item.timeout ?? item)
    }));
    assert(dashboardState.protocolPromptCount === 0, `governance testing period: Current Protocol should not render the old Chamber prompt, saw ${dashboardState.protocolPromptCount}`);
    assert(!dashboardState.upgradeStatusActive, 'governance testing period: Current Protocol status slot should stay hidden when the Chamber prompt is removed');
    assert(dashboardState.governanceProcessCards === 0, 'governance testing period: Current Protocol should not duplicate the Chamber governance path');
    assert(dashboardState.governanceTallyCards === 0, 'governance testing period: Current Protocol should not duplicate Chamber vote tally data');
    assert(dashboardState.votingPeriod === 'Cooldown', `governance testing period: voting card should show Cooldown, saw ${dashboardState.votingPeriod}`);
    assert(dashboardState.participation === '---', `governance testing period: participation should be empty-state dashes, saw ${dashboardState.participation}`);
    assert(/No ballots during Cooldown/.test(dashboardState.participationDescription), `governance testing period: participation description mismatch: ${dashboardState.participationDescription}`);
    assert(/Cooldown/.test(dashboardState.entryMini) && /testing and review/.test(dashboardState.entryMini), `governance testing period: Chamber entry status mismatch: ${dashboardState.entryMini}`);
    assert(!dashboardState.chamberEntryWide, 'governance testing period: Tezos L1 Governance should be 1x1 when no baker ballots are open');
    assert(dashboardState.chamberEntrySize === 'compact', `governance testing period: Tezos L1 Governance size flag mismatch: ${dashboardState.chamberEntrySize}`);
    assert(dashboardState.issuance === '4.50%', `governance testing period: disabled LB should be excluded from total issuance, saw ${dashboardState.issuance}`);
    assert(/4\.50% Protocol/.test(dashboardState.issuanceBreakdown), `governance testing period: protocol issuance breakdown mismatch: ${dashboardState.issuanceBreakdown}`);
    assert(/0\.00% LB \(disabled\)/.test(dashboardState.issuanceBreakdown), `governance testing period: disabled LB breakdown missing, saw ${dashboardState.issuanceBreakdown}`);
    assert(dashboardState.lbEntryEma === '51.5%', `governance testing period: LB entry EMA mismatch: ${dashboardState.lbEntryEma}`);
    assert(/Subsidy disabled/.test(dashboardState.lbEntryDescription), `governance testing period: LB entry description mismatch: ${dashboardState.lbEntryDescription}`);
    assert(dashboardState.lbEntryVotes.length >= 4, `governance testing period: LB entry vote tape missing rows: ${JSON.stringify(dashboardState.lbEntryVotes)}`);
    assert(dashboardState.lbEntryVotes.some((row) => /QA Baker/.test(row.text) && row.vote === 'off' && /\boff\b/.test(row.badgeClass)), `governance testing period: LB entry OFF vote row missing: ${JSON.stringify(dashboardState.lbEntryVotes)}`);
    assert(dashboardState.lbEntryVotes.some((row) => /Second Baker/.test(row.text) && row.vote === 'on' && /\bon\b/.test(row.badgeClass)), `governance testing period: LB entry ON vote row missing: ${JSON.stringify(dashboardState.lbEntryVotes)}`);
    assert(dashboardState.lbEntryVotes.some((row) => /Pass Baker/.test(row.text) && row.vote === 'pass' && /\bpass\b/.test(row.badgeClass)), `governance testing period: LB entry PASS vote row missing: ${JSON.stringify(dashboardState.lbEntryVotes)}`);
    assert(dashboardState.lbEntrySampleBlocks === '2500', `governance testing period: LB switcher coverage must use the canonical window, saw ${dashboardState.lbEntrySampleBlocks}`);
    assert(dashboardState.lbEntrySwitcherCount === '3' && dashboardState.lbEntrySwitchers.length === 3, `governance testing period: LB recent unique switchers mismatch: ${JSON.stringify(dashboardState.lbEntrySwitchers)}`);
    assert(/Recent switchers 3/.test(dashboardState.lbEntrySwitcherText) && /2,500 blocks/.test(dashboardState.lbEntrySwitcherText), `governance testing period: LB switcher coverage copy mismatch: ${dashboardState.lbEntrySwitcherText}`);
    assert(/QA Baker ON → OFF/.test(dashboardState.lbEntrySwitchers[0]?.text || '') && /Second Baker OFF → ON/.test(dashboardState.lbEntrySwitchers[1]?.text || '') && /Pass Baker ON → PASS/.test(dashboardState.lbEntrySwitchers[2]?.text || ''), `governance testing period: LB switcher transitions mismatch: ${JSON.stringify(dashboardState.lbEntrySwitchers)}`);
    assert(dashboardState.lbEntrySwitchers.every((row, index, rows) => row.quietKey.startsWith('lb-entry-switch:') && (index === 0 || rows[index - 1].level > row.level)), `governance testing period: LB switchers must be keyed and newest-first: ${JSON.stringify(dashboardState.lbEntrySwitchers)}`);
    assert(dashboardState.lbEntryLive === 'true', `governance testing period: LB entry should have live refresh enabled, saw ${dashboardState.lbEntryLive}`);
    assert(dashboardState.lbEntryRefreshInterval === '60000', `governance testing period: LB entry refresh interval mismatch: ${dashboardState.lbEntryRefreshInterval}`);
    assert(Number(dashboardState.lbEntryRefreshedAt) > 0, `governance testing period: LB entry refreshed timestamp missing: ${dashboardState.lbEntryRefreshedAt}`);
    assert(dashboardState.lbEntryGeometry.tapeRightOfEma && dashboardState.lbEntryGeometry.tapeEmaBandOverlap, `governance testing period: LB vote tape should sit beside the EMA summary, not stack below it: ${JSON.stringify(dashboardState.lbEntryGeometry)}`);
    assert(dashboardState.lbEntryGeometry.switchersBelowTape && dashboardState.lbEntryGeometry.switchersAboveFooter && dashboardState.lbEntryGeometry.switchersInsideCard && dashboardState.lbEntryGeometry.controlOverlap === 0 && dashboardState.lbEntryGeometry.pageOverflow <= 2, `governance testing period: LB switcher strip must occupy the free lower band without overlap or overflow: ${JSON.stringify(dashboardState.lbEntryGeometry)}`);
    assert(
      dashboardState.lbEntryGeometry.cardHeight <= 250
        && Math.abs(dashboardState.lbEntryGeometry.cardWidth - dashboardState.lbEntryGeometry.categoryWidth) <= 2,
      `governance testing period: data-rich LB entry should own a full row without excess height: ${JSON.stringify(dashboardState.lbEntryGeometry)}`
    );
    assert(dashboardState.lbEntryGeometry.category === 'governance' && dashboardState.lbEntryGeometry.categoryOrder.join(',') === 'chamber-entry-card,etherlink-governance-entry-card,lb-entry-card', `governance testing period: LB must remain in the Governance category: ${JSON.stringify(dashboardState.lbEntryGeometry)}`);
    assert(dashboardState.etherlinkEntryLive === 'true', `governance testing period: Tezos X Governance entry should show live data, saw ${dashboardState.etherlinkEntryLive}`);
    assert(dashboardState.etherlinkEntryWide, 'governance testing period: Tezos X Governance should be 2x1 while an Etherlink proposal is active');
    assert(dashboardState.etherlinkEntrySize === 'wide', `governance testing period: Tezos X Governance size flag mismatch: ${dashboardState.etherlinkEntrySize}`);
    assert(dashboardState.etherlinkEntryValue === '14.2%', `governance testing period: Tezos X Governance value mismatch: ${dashboardState.etherlinkEntryValue}`);
    assert(/FAST .*00625d22ab/.test(dashboardState.etherlinkEntryDescription), `governance testing period: Tezos X Governance description mismatch: ${dashboardState.etherlinkEntryDescription}`);
    assert(/L2 Governance .*FAST: (?:\d+ bakers · )?Proposal quorum met/.test(dashboardState.etherlinkEntryMini), `governance testing period: Tezos X Governance status mismatch: ${dashboardState.etherlinkEntryMini}`);
    assert(/FAST14\.2%\/5%/.test(dashboardState.etherlinkEntryMetrics.replace(/\s+/g, '')), `governance testing period: Tezos X Governance FAST metric mismatch: ${dashboardState.etherlinkEntryMetrics}`);
    assert(/SLOW(5hago|Idle)/.test(dashboardState.etherlinkEntryMetrics.replace(/\s+/g, '')), `governance testing period: Tezos X Governance SLOW metric mismatch: ${dashboardState.etherlinkEntryMetrics}`);
    assert(dashboardState.tezlinkEntryGeometry.category === 'network' && dashboardState.tezlinkEntryGeometry.categoryOrder.join(',') === 'network-pulse-entry-card,network-health,tezlink-entry-card', `governance testing period: Tezos X must remain in the Network category: ${JSON.stringify(dashboardState.tezlinkEntryGeometry)}`);
    assert(dashboardState.tezlinkEntryGeometry.metricsRightOfMain && dashboardState.tezlinkEntryGeometry.tapeBelowMetrics, `governance testing period: Tezos X live tape should sit below the metric tiles in the Network category: ${JSON.stringify(dashboardState.tezlinkEntryGeometry)}`);
    assert(dashboardState.tezlinkEntryGeometry.metricTruncations.length === 0, `governance testing period: Tezos X metric tiles should not ellipsize while governance is active: ${JSON.stringify(dashboardState.tezlinkEntryGeometry)}`);
    assert(dashboardState.tezlinkEntryGeometry.pairedWithHealth, `governance testing period: Tezos X and Network Health cards should keep matched row height: ${JSON.stringify(dashboardState.tezlinkEntryGeometry)}`);
    const chamberFreshnessLabels = dashboardState.chamberUpdatedLabels.filter((label) => /^(?:TzKT(?: head| blocks)?|Tezos X sources) · /.test(label));
    // Intersection observers may hydrate additional launchers while this long suite
    // scrolls through its expanded geometry checks. The number still carrying the
    // deferred label is therefore timing-dependent; the durable contract is that
    // every launcher keeps a truthful, non-empty live or deferred freshness stamp.
    assert(chamberFreshnessLabels.length >= 5
      && dashboardState.chamberUpdatedLabels.every((label) => label.trim().length > 0),
    `governance testing period: active or deferred chamber freshness stamps missing: ${dashboardState.chamberUpdatedLabels.join(', ')}`);
    assert(dashboardState.etherlinkEntryGeometry.titleMetricsOverlap === 0, `governance testing period: Tezos X Governance title should not overlap proposal chips: ${JSON.stringify(dashboardState.etherlinkEntryGeometry)}`);
    assert(dashboardState.etherlinkEntryGeometry.metricsRightOfMain, `governance testing period: Tezos X Governance proposal chips should sit beside the title/value lane: ${JSON.stringify(dashboardState.etherlinkEntryGeometry)}`);
    assert(dashboardState.etherlinkEntryGeometry.metricTruncations.length === 0, `governance testing period: Tezos X Governance proposal chips should not ellipsize: ${JSON.stringify(dashboardState.etherlinkEntryGeometry)}`);
    assert(dashboardState.etherlinkEntryGeometry.overlap === 0, `governance testing period: Tezos X Governance open cue overlaps Sequencer chip: ${JSON.stringify(dashboardState.etherlinkEntryGeometry)}`);
    assert(dashboardState.tz4TileValue === '33.3 / 50%', `governance testing period: tz4 tile value mismatch: ${dashboardState.tz4TileValue}`);
    assert(/1 \/ 3 bakers active/.test(dashboardState.tz4TileDescription), `governance testing period: tz4 tile description mismatch: ${dashboardState.tz4TileDescription}`);
    assert(dashboardState.tz4TileWide, 'governance testing period: tz4 Adoption tile should be 2x1 in Chambers');
    assert(dashboardState.tz4TileSize === 'wide', `governance testing period: tz4 tile size flag mismatch: ${dashboardState.tz4TileSize}`);
    assert(dashboardState.tz4TilePending === '1', `governance testing period: tz4 tile pending count mismatch: ${dashboardState.tz4TilePending}`);
    assert(dashboardState.tz4TileLatest === '1', `governance testing period: tz4 tile latest count mismatch: ${dashboardState.tz4TileLatest}`);
    assert(/Latest switches/.test(dashboardState.tz4TilePreview) && /QA Baker/.test(dashboardState.tz4TilePreview) && /Pending/.test(dashboardState.tz4TilePreview) && /Pending Baker/.test(dashboardState.tz4TilePreview), `governance testing period: tz4 tile preview mismatch: ${dashboardState.tz4TilePreview}`);
    assert(dashboardState.tz4TileWired === '1', `governance testing period: tz4 tile wiring missing: ${dashboardState.tz4TileWired}`);
    assert(dashboardState.tz4TileRole === 'article', `governance testing period: tz4 tile role mismatch: ${dashboardState.tz4TileRole}`);
    assert(dashboardState.tz4TileTabIndex === '', `governance testing period: tz4 tile article should not be keyboard focusable: ${dashboardState.tz4TileTabIndex}`);
    assert(dashboardState.tz4TileCue && dashboardState.tz4TileCueTag === 'BUTTON', 'governance testing period: tz4 tile Open button missing');
    assert(Math.abs(dashboardState.tz4SparklineLast - (100 / 3)) < 0.01, `governance testing period: tz4 sparkline latest value must match live tile, saw ${dashboardState.tz4SparklineLast}`);
    assert(!dashboardState.extraTz4EntryCard, 'governance testing period: tz4 should use the existing Adoption tile, not a separate entry card');
    assert(dashboardState.intervalDelays.includes(60000), `governance testing period: LB entry 60s refresh timer was not registered: ${dashboardState.intervalDelays.join(', ')}`);

    await page.locator('#lb-entry-card').scrollIntoViewIfNeeded();
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const lbEntryQuietBefore = await page.evaluate(() => {
      const card = document.querySelector('#lb-entry-card');
      const strip = document.querySelector('#lb-entry-switcher-strip');
      const row = strip?.querySelector('.lb-entry-switcher-item');
      const name = row?.querySelector('.lb-entry-switcher-name');
      const open = card?.querySelector('.chamber-expand-cue');
      open?.focus({ preventScroll: true });
      const selection = document.getSelection();
      selection?.removeAllRanges();
      if (name?.firstChild) {
        const range = document.createRange();
        range.selectNodeContents(name);
        selection?.addRange(range);
      }
      window.__lbEntryCardNode = card;
      window.__lbEntrySwitcherStripNode = strip;
      window.__lbEntrySwitcherRowNode = row;
      return {
        hasTimer: Boolean(window.__lbEntryTimer),
        refreshedAt: card?.dataset.lbRefreshedAt || '',
        pageY: window.scrollY,
        focused: document.activeElement === open,
        selection: selection?.toString() || ''
      };
    });
    assert(lbEntryQuietBefore.hasTimer && lbEntryQuietBefore.focused && lbEntryQuietBefore.selection === 'QA Baker', `governance testing period: LB quiet-refresh reading fixture did not settle ${JSON.stringify(lbEntryQuietBefore)}`);
    const lbEntryIncrementalRequestPromise = page.waitForRequest((request) => {
      try {
        const url = new URL(request.url());
        return url.pathname.endsWith('/blocks') && url.searchParams.get('limit') === '32' && (url.searchParams.get('select') || '').includes('lbToggleEma');
      } catch {
        return false;
      }
    }, { timeout: 10000 });
    await page.evaluate(() => window.__lbEntryTimer?.handler());
    await lbEntryIncrementalRequestPromise;
    await page.waitForFunction((before) => {
      const card = document.querySelector('#lb-entry-card');
      return card?.dataset.lbRefreshedAt && card.dataset.lbRefreshedAt !== before && !card.classList.contains('lb-entry-refreshing');
    }, lbEntryQuietBefore.refreshedAt, { timeout: 10000 });
    const lbEntryQuietAfter = await page.evaluate(() => {
      const strip = document.querySelector('#lb-entry-switcher-strip');
      const row = strip?.querySelector('.lb-entry-switcher-item');
      const style = row ? getComputedStyle(row) : null;
      return {
        sameCard: window.__lbEntryCardNode === document.querySelector('#lb-entry-card'),
        sameStrip: window.__lbEntrySwitcherStripNode === strip,
        sameRow: window.__lbEntrySwitcherRowNode === row,
        pageY: window.scrollY,
        focused: document.activeElement === document.querySelector('#lb-entry-card .chamber-expand-cue'),
        selection: document.getSelection()?.toString() || '',
        settled: strip?.dataset.quietRefreshSettled || '',
        animation: style?.animationName || '',
        opacity: style?.opacity || '',
        transform: style?.transform || ''
      };
    });
    assert(lbEntryQuietAfter.sameCard && lbEntryQuietAfter.sameStrip && lbEntryQuietAfter.sameRow && lbEntryQuietAfter.focused && lbEntryQuietAfter.selection === lbEntryQuietBefore.selection && Math.abs(lbEntryQuietAfter.pageY - lbEntryQuietBefore.pageY) <= 2, `governance testing period: LB entry quiet refresh moved or replaced the reader state ${JSON.stringify({ lbEntryQuietBefore, lbEntryQuietAfter })}`);
    assert(lbEntryQuietAfter.settled === 'true' && lbEntryQuietAfter.animation === 'none' && lbEntryQuietAfter.opacity === '1' && lbEntryQuietAfter.transform === 'none', `governance testing period: LB entry refresh replayed or stranded motion ${JSON.stringify(lbEntryQuietAfter)}`);
    const lbReaderScroll = await page.evaluate(() => {
      const target = Math.max(0, window.scrollY - 42);
      window.dispatchEvent(new WheelEvent('wheel', { deltaY: -42 }));
      const html = document.documentElement;
      const previousBehavior = html.style.scrollBehavior;
      html.style.scrollBehavior = 'auto';
      window.scrollTo(window.scrollX, target);
      html.style.scrollBehavior = previousBehavior;
      return { target, applied: window.scrollY };
    });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const lbReaderScrollAfter = await page.evaluate(() => window.scrollY);
    assert(Math.abs(lbReaderScroll.applied - lbReaderScroll.target) <= 1 && Math.abs(lbReaderScrollAfter - lbReaderScroll.target) <= 1, `governance testing period: delayed LB quiet restore overwrote immediate reader scroll ${JSON.stringify({ lbReaderScroll, lbReaderScrollAfter })}`);

    const requestsBeforeHiddenLbTick = lbBlockRequests.length;
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      window.__lbEntryTimer?.handler();
    });
    await page.waitForTimeout(100);
    assert(lbBlockRequests.length === requestsBeforeHiddenLbTick, `governance testing period: hidden LB launcher tick should not poll ${lbBlockRequests.map(String).join(', ')}`);
    const lbVisibleCatchupPromise = page.waitForRequest((request) => {
      try {
        const url = new URL(request.url());
        return url.pathname.endsWith('/blocks') && url.searchParams.get('limit') === '32' && (url.searchParams.get('select') || '').includes('lbToggleEma');
      } catch {
        return false;
      }
    }, { timeout: 10000 });
    const lbBeforeVisibleRefreshedAt = await page.evaluate(() => document.querySelector('#lb-entry-card')?.dataset.lbRefreshedAt || '');
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await lbVisibleCatchupPromise;
    await page.waitForFunction((before) => {
      const card = document.querySelector('#lb-entry-card');
      return card?.dataset.lbRefreshState === 'current'
        && card.dataset.lbRefreshedAt
        && card.dataset.lbRefreshedAt !== before
        && !card.classList.contains('lb-entry-refreshing');
    }, lbBeforeVisibleRefreshedAt, { timeout: 10000 });
    assert(lbBlockRequests.length === requestsBeforeHiddenLbTick + 1, `governance testing period: LB visibility return should perform exactly one catch-up ${lbBlockRequests.map(String).join(', ')}`);

    const lbFailurePattern = '**/v1/blocks?**';
    await page.route(lbFailurePattern, async (route) => {
      const url = new URL(route.request().url());
      if ((url.searchParams.get('select') || '').includes('lbToggleEma')) {
        return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"LB smoke refresh unavailable"}' });
      }
      return route.fallback();
    });
    const lbLastGoodBeforeFailure = await page.evaluate(() => ({
      ema: document.querySelector('#lb-entry-ema')?.textContent?.trim() || '',
      votes: document.querySelector('#lb-entry-vote-rows')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      switchers: document.querySelector('#lb-entry-switcher-strip')?.textContent?.replace(/\s+/g, ' ').trim() || ''
    }));
    await page.evaluate(() => window.__lbEntryTimer?.handler());
    await page.waitForFunction(() => document.querySelector('#lb-entry-card')?.dataset.lbRefreshState === 'delayed', null, { timeout: 10000 });
    const lbLastGoodAfterFailure = await page.evaluate(() => ({
      ema: document.querySelector('#lb-entry-ema')?.textContent?.trim() || '',
      votes: document.querySelector('#lb-entry-vote-rows')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      switchers: document.querySelector('#lb-entry-switcher-strip')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      sameStrip: window.__lbEntrySwitcherStripNode === document.querySelector('#lb-entry-switcher-strip'),
      sameRow: window.__lbEntrySwitcherRowNode === document.querySelector('#lb-entry-switcher-strip .lb-entry-switcher-item'),
      refreshState: document.querySelector('#lb-entry-card')?.dataset.lbRefreshState || '',
      updatedLabel: document.querySelector('#lb-entry-card')?.dataset.updatedLabel || ''
    }));
    assert(lbLastGoodAfterFailure.ema === lbLastGoodBeforeFailure.ema && lbLastGoodAfterFailure.votes === lbLastGoodBeforeFailure.votes && lbLastGoodAfterFailure.switchers === lbLastGoodBeforeFailure.switchers && lbLastGoodAfterFailure.sameStrip && lbLastGoodAfterFailure.sameRow && lbLastGoodAfterFailure.refreshState === 'delayed' && /refresh delayed/.test(lbLastGoodAfterFailure.updatedLabel), `governance testing period: failed LB entry refresh did not retain last-good content ${JSON.stringify({ lbLastGoodBeforeFailure, lbLastGoodAfterFailure })}`);
    await page.unroute(lbFailurePattern);

    await page.locator('#etherlink-governance-entry-card .chamber-expand-cue').click();
    await page.locator('#etherlink-governance-modal.active .etherlink-gov-content').waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForFunction((proposal) => document.querySelector('#etherlink-governance-modal .etherlink-gov-proposal-hash')?.textContent?.includes(proposal), ETHERLINK_FAST_PROPOSAL, { timeout: 10000 });
    await page.waitForFunction(() => document.querySelectorAll('#etherlink-governance-modal .etherlink-gov-history-row').length >= 3, null, { timeout: 10000 });
    const etherlinkState = await page.evaluate(() => {
      const modal = document.querySelector('#etherlink-governance-modal');
      const compactText = (selector) => document.querySelector(selector)?.textContent?.trim() || '';
      return {
        title: compactText('#etherlink-governance-modal .chamber-title'),
        badge: compactText('#etherlink-governance-modal .chamber-badge'),
        tabs: document.querySelectorAll('#etherlink-governance-modal [data-etherlink-track]').length,
        tabsA11y: Array.from(document.querySelectorAll('#etherlink-governance-modal [data-etherlink-track]')).map((button) => ({
          track: button.dataset.etherlinkTrack || '',
          id: button.id || '',
          role: button.getAttribute('role') || '',
          selected: button.getAttribute('aria-selected') || '',
          controls: button.getAttribute('aria-controls') || '',
          tabIndex: button.tabIndex,
          active: button.classList.contains('active')
        })),
        activeTab: document.querySelector('#etherlink-governance-modal [data-etherlink-track].active')?.dataset.etherlinkTrack || '',
        tabPanel: (() => {
          const panel = document.querySelector('#etherlink-governance-modal [role="tabpanel"]');
          return {
            id: panel?.id || '',
            labelledBy: panel?.getAttribute('aria-labelledby') || '',
            tabIndex: panel?.tabIndex
          };
        })(),
        phaseHero: compactText('#etherlink-governance-phase-hero'),
        phaseSteps: document.querySelectorAll('#etherlink-governance-phase-hero .governance-phase-step').length,
        activePhase: document.querySelector('#etherlink-governance-phase-hero .governance-phase-step.active')?.dataset.stage || '',
        nowText: compactText('#etherlink-governance-now'),
        nowCards: document.querySelectorAll('#etherlink-governance-now .chamber-now-card').length,
        watchItems: document.querySelectorAll('#etherlink-governance-now .chamber-now-watch li').length,
        sourceLinks: document.querySelectorAll('#etherlink-governance-now .etherlink-governance-source-links a').length,
        recentBakerTitle: compactText('#etherlink-governance-recent-bakers-title'),
        recentBakerRows: document.querySelectorAll('#etherlink-governance-recent-bakers .etherlink-gov-baker-vote-row').length,
        recentBakerText: compactText('#etherlink-governance-recent-bakers'),
        proposalHash: compactText('#etherlink-governance-modal .etherlink-gov-proposal-hash'),
        threshold: compactText('#etherlink-governance-modal .etherlink-gov-threshold-row'),
        proposalRows: document.querySelectorAll('#etherlink-governance-modal .etherlink-gov-proposal-row').length,
        historyRows: document.querySelectorAll('#etherlink-governance-modal .etherlink-gov-history-row').length,
        historyText: compactText('#etherlink-governance-modal .etherlink-gov-track-panel'),
        rules: compactText('#etherlink-governance-modal #etherlink-gov-rules'),
        memory: compactText('#etherlink-governance-modal #etherlink-gov-memory'),
        timelineRows: document.querySelectorAll('#etherlink-governance-modal #etherlink-gov-timeline .etherlink-gov-timeline-row').length,
        timelineText: compactText('#etherlink-governance-modal #etherlink-gov-timeline'),
        timelineStyle: (() => {
          const row = document.querySelector('#etherlink-governance-modal #etherlink-gov-timeline .etherlink-gov-timeline-row');
          if (!row) return null;
          const style = window.getComputedStyle(row);
          const box = row.getBoundingClientRect();
          const columns = style.gridTemplateColumns?.split(' ').filter(Boolean) || [];
          return {
            display: style.display,
            color: style.color,
            textDecorationLine: style.textDecorationLine,
            columnCount: columns.length,
            width: box.width
          };
        })(),
        activeVoteLayout: (() => {
          const proposal = document.querySelector('#etherlink-governance-modal .etherlink-gov-proposal-hash')?.closest('.etherlink-gov-panel');
          const timeline = document.querySelector('#etherlink-governance-modal #etherlink-gov-timeline');
          const history = document.querySelector('#etherlink-governance-modal .etherlink-gov-history-panel');
          const rect = (node) => {
            if (!node) return null;
            const box = node.getBoundingClientRect();
            return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
          };
          const proposalRect = rect(proposal);
          const timelineRect = rect(timeline);
          const historyRect = rect(history);
          return {
            proposalRect,
            timelineRect,
            historyRect,
            timelineBesideProposal: Boolean(
              proposalRect
              && timelineRect
              && timelineRect.left >= proposalRect.right + 8
              && Math.abs(timelineRect.top - proposalRect.top) <= 2
            ),
            historyBelowVotePair: Boolean(
              proposalRect
              && timelineRect
              && historyRect
              && historyRect.top >= Math.max(proposalRect.bottom, timelineRect.bottom) + 8
            )
          };
        })(),
        voterRows: document.querySelectorAll('#etherlink-governance-modal .etherlink-gov-voter-row').length,
        activityRows: document.querySelectorAll('#etherlink-governance-modal #etherlink-gov-timeline .etherlink-gov-timeline-row').length,
        footer: compactText('#etherlink-governance-modal .chamber-footer'),
        officialHref: document.querySelector('#etherlink-governance-modal .chamber-footer a[href*="governance.etherlink.com/governance/fast"]')?.href || '',
        storageHref: document.querySelector('#etherlink-governance-modal .chamber-footer a[href*="tzkt.io/KT19oUV"]')?.href || '',
        live: modal?.classList.contains('active') ? 'true' : '',
        refreshState: compactText('#etherlink-governance-refresh-state'),
        periodFacts: compactText('#etherlink-governance-modal .etherlink-gov-explainer .lb-explainer-facts'),
        intervalDelays: (window.__tezosSystemsIntervals || []).map((item) => item.timeout ?? item)
      };
    });
    assert(/Tezos X Governance/.test(etherlinkState.title), `governance testing period: Tezos X Governance title mismatch: ${etherlinkState.title}`);
    assert(/Proposal quorum met/.test(etherlinkState.badge), `governance testing period: Etherlink badge mismatch: ${etherlinkState.badge}`);
    assert(etherlinkState.tabs === 3, `governance testing period: Etherlink should expose three track tabs, saw ${etherlinkState.tabs}`);
    assert(etherlinkState.tabsA11y.length === 3 && etherlinkState.tabsA11y.every((tab) => tab.role === 'tab'), `governance testing period: Etherlink tabs need role=tab: ${JSON.stringify(etherlinkState.tabsA11y)}`);
    assert(etherlinkState.tabsA11y.every((tab) => tab.selected === String(tab.active)), `governance testing period: Etherlink tabs aria-selected mismatch: ${JSON.stringify(etherlinkState.tabsA11y)}`);
    assert(
      etherlinkState.tabsA11y.every((tab) => tab.id === `etherlink-gov-tab-${tab.track}` && tab.controls === 'etherlink-gov-track-panel')
        && etherlinkState.tabsA11y.filter((tab) => tab.tabIndex === 0).length === 1
        && etherlinkState.tabPanel.id === 'etherlink-gov-track-panel'
        && etherlinkState.tabPanel.labelledBy === 'etherlink-gov-tab-fast'
        && etherlinkState.tabPanel.tabIndex === 0,
      `governance testing period: Etherlink tabs and panel are not programmatically associated ${JSON.stringify({ tabs: etherlinkState.tabsA11y, panel: etherlinkState.tabPanel })}`
    );
    assert(etherlinkState.activeTab === 'fast', `governance testing period: Etherlink FAST tab should start active, saw ${etherlinkState.activeTab}`);

    await page.locator('#etherlink-gov-tab-fast').focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => (
      document.activeElement?.id === 'etherlink-gov-tab-slow'
        && document.querySelector('#etherlink-gov-tab-slow')?.getAttribute('aria-selected') === 'true'
        && document.querySelector('#etherlink-gov-track-panel')?.getAttribute('aria-labelledby') === 'etherlink-gov-tab-slow'
    ));
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction((proposal) => (
      document.activeElement?.id === 'etherlink-gov-tab-fast'
        && document.querySelector('#etherlink-gov-tab-fast')?.getAttribute('aria-selected') === 'true'
        && document.querySelector('#etherlink-gov-track-panel')?.getAttribute('aria-labelledby') === 'etherlink-gov-tab-fast'
        && document.querySelector('#etherlink-governance-modal .etherlink-gov-proposal-hash')?.textContent?.includes(proposal)
    ), ETHERLINK_FAST_PROPOSAL);

    assert(etherlinkState.phaseSteps === 4 && etherlinkState.activePhase === 'proposal', `governance testing period: Etherlink phase clock mismatch: ${JSON.stringify(etherlinkState)}`);
    assert(/L2 governance clock/.test(etherlinkState.phaseHero) && /Threshold met/.test(etherlinkState.phaseHero) && /enters Promotion next/.test(etherlinkState.phaseHero), `governance testing period: Etherlink phase guidance missing: ${etherlinkState.phaseHero}`);
    assert(etherlinkState.nowCards === 3 && etherlinkState.watchItems >= 3 && etherlinkState.sourceLinks === 3, `governance testing period: Etherlink current-state layout incomplete: ${JSON.stringify(etherlinkState)}`);
    assert(/What is happening now/.test(etherlinkState.nowText) && /Who made up the quorum/.test(etherlinkState.nowText) && /QA Baker/.test(etherlinkState.nowText) && /UPVOTE/.test(etherlinkState.nowText) && /What to watch next/.test(etherlinkState.nowText) && /Compare L1 governance/.test(etherlinkState.nowText), `governance testing period: Etherlink current-state guidance missing: ${etherlinkState.nowText}`);
    assert(etherlinkState.recentBakerTitle === 'Full proposal window ledger · first to latest' && etherlinkState.recentBakerRows === 3, `governance testing period: Etherlink proposal baker contribution list missing ${JSON.stringify(etherlinkState)}`);
    assert(/Who made up the quorum/.test(etherlinkState.recentBakerText) && /40\.0M XTZ/.test(etherlinkState.recentBakerText) && /Quorum recount/.test(etherlinkState.recentBakerText) && /quorum reached here/.test(etherlinkState.recentBakerText), `governance testing period: Etherlink proposal baker weights missing ${etherlinkState.recentBakerText}`);
    assert(etherlinkState.proposalHash === ETHERLINK_FAST_PROPOSAL, `governance testing period: Etherlink proposal hash mismatch: ${etherlinkState.proposalHash}`);
    assert(/93\.2M XTZ upvotes/.test(etherlinkState.threshold) && /14\.2% \/ 5% required/.test(etherlinkState.threshold), `governance testing period: Etherlink threshold mismatch: ${etherlinkState.threshold}`);
    assert(etherlinkState.proposalRows >= 2, `governance testing period: Etherlink proposal rows missing, saw ${etherlinkState.proposalRows}`);
    assert(etherlinkState.historyRows >= 3, `governance testing period: Etherlink FAST history rows missing, saw ${etherlinkState.historyRows}`);
    assert(/Etherlink 6\.1/.test(etherlinkState.historyText), `governance testing period: Etherlink FAST history should include older proposal: ${etherlinkState.historyText.slice(0, 320)}`);
    assert(/Proposalquorum5%/.test(etherlinkState.rules.replace(/\s+/g, '')) && /Period length/.test(etherlinkState.rules), `governance testing period: Etherlink rules panel missing thresholds: ${etherlinkState.rules}`);
    assert(/Track memory/.test(etherlinkState.memory) && /Last proposal/.test(etherlinkState.memory), `governance testing period: Etherlink memory panel missing: ${etherlinkState.memory}`);
    assert(etherlinkState.timelineRows >= 3 && /submission/i.test(etherlinkState.timelineText), `governance testing period: Etherlink merged timeline missing: ${etherlinkState.timelineText}`);
    assert(etherlinkState.timelineStyle?.display === 'grid' && etherlinkState.timelineStyle.columnCount >= 4, `governance testing period: Etherlink timeline rows should use the themed grid, saw ${JSON.stringify(etherlinkState.timelineStyle)}`);
    assert(!/underline/i.test(etherlinkState.timelineStyle?.textDecorationLine || ''), `governance testing period: Etherlink timeline rows should not render as default underlined links: ${JSON.stringify(etherlinkState.timelineStyle)}`);
    assert(!/rgb\(0,\s*0,\s*238\)/.test(etherlinkState.timelineStyle?.color || ''), `governance testing period: Etherlink timeline rows should not render default browser link blue: ${JSON.stringify(etherlinkState.timelineStyle)}`);
    assert(etherlinkState.activeVoteLayout.timelineBesideProposal, `governance testing period: Etherlink live action log should occupy the open column beside the proposal panel: ${JSON.stringify(etherlinkState.activeVoteLayout)}`);
    assert(etherlinkState.activeVoteLayout.historyBelowVotePair, `governance testing period: Etherlink history should remain below the active vote/action pair: ${JSON.stringify(etherlinkState.activeVoteLayout)}`);
    assert(etherlinkState.voterRows >= 3, `governance testing period: Etherlink upvoter rows missing, saw ${etherlinkState.voterRows}`);
    assert(etherlinkState.activityRows >= 3, `governance testing period: Etherlink merged activity rows missing, saw ${etherlinkState.activityRows}`);
    assert(/Direct: \/l2chamber\//.test(etherlinkState.footer), `governance testing period: Tezos X Governance direct footer missing: ${etherlinkState.footer}`);
    assert(etherlinkState.officialHref.includes('/governance/fast'), `governance testing period: Etherlink official track link missing: ${etherlinkState.officialHref}`);
    assert(etherlinkState.storageHref.includes(ETHERLINK_FAST_CONTRACT), `governance testing period: Etherlink TzKT storage link missing: ${etherlinkState.storageHref}`);
    assert(/auto-refresh 60s/.test(etherlinkState.refreshState), `governance testing period: Etherlink refresh label mismatch: ${etherlinkState.refreshState}`);
    assert(!/rolling over now/i.test(etherlinkState.periodFacts), `governance testing period: Etherlink period facts should not stick at rollover: ${etherlinkState.periodFacts}`);
    assert(etherlinkState.intervalDelays.includes(60000), `governance testing period: Etherlink 60s refresh timer missing: ${etherlinkState.intervalDelays.join(', ')}`);

    await page.setViewportSize({ width: 390, height: 844 });
    const etherlinkMobileState = await page.evaluate(() => {
      const modal = document.querySelector('#etherlink-governance-modal .etherlink-gov-content');
      const panels = [
        document.querySelector('#etherlink-governance-phase-hero'),
        document.querySelector('#etherlink-governance-now'),
        document.querySelector('#etherlink-governance-now .chamber-now-grid'),
        document.querySelector('#etherlink-governance-now .chamber-now-watch'),
        document.querySelector('#etherlink-governance-recent-bakers')
      ].filter(Boolean);
      return {
        viewportWidth: window.innerWidth,
        pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
        modalOverflow: modal ? modal.scrollWidth - modal.clientWidth : 0,
        panelOverflows: panels.map((panel) => panel.scrollWidth - panel.clientWidth),
        tabColumns: window.getComputedStyle(document.querySelector('#etherlink-governance-modal .etherlink-gov-tabs')).gridTemplateColumns.split(' ').filter(Boolean).length,
        phaseColumns: window.getComputedStyle(document.querySelector('#etherlink-governance-phase-hero .governance-phase-stepper')).gridTemplateColumns.split(' ').filter(Boolean).length,
        timelineBelowProposal: (() => {
          const proposal = document.querySelector('#etherlink-governance-modal .etherlink-gov-proposal-hash')?.closest('.etherlink-gov-panel')?.getBoundingClientRect();
          const timeline = document.querySelector('#etherlink-governance-modal #etherlink-gov-timeline')?.getBoundingClientRect();
          return Boolean(proposal && timeline && timeline.top >= proposal.bottom + 8);
        })()
      };
    });
    assert(etherlinkMobileState.pageOverflow <= 2 && etherlinkMobileState.modalOverflow <= 2 && etherlinkMobileState.panelOverflows.every((value) => value <= 2), `governance testing period: Etherlink mobile current-state panels overflow: ${JSON.stringify(etherlinkMobileState)}`);
    assert(etherlinkMobileState.tabColumns === 3 && etherlinkMobileState.phaseColumns === 4, `governance testing period: Etherlink mobile governance clock or tabs collapsed incorrectly: ${JSON.stringify(etherlinkMobileState)}`);
    assert(etherlinkMobileState.timelineBelowProposal, `governance testing period: Etherlink mobile action log should stack directly after the proposal panel: ${JSON.stringify(etherlinkMobileState)}`);
    await page.setViewportSize({ width: 1440, height: 1000 });

    const promotionIssues = [];
    const promotionContext = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(promotionContext, { etherlinkPromotion: true });
    await promotionContext.addInitScript(() => {
      localStorage.setItem('tezos-systems-theme', 'matrix');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    });
    const promotionPage = await promotionContext.newPage();
    attachIssueCollectors(promotionPage, 'Tezos X promotion baker quorum list', promotionIssues);
    // This contract compares the home entry and full ledger together. Direct-room
    // startup is covered separately and deliberately has no hidden home entry.
    const promotionResponse = await promotionPage.goto(`${baseUrl}/?theme=matrix#l2chamber`, { waitUntil: 'domcontentloaded' });
    assert(promotionResponse?.ok(), `Tezos X promotion baker quorum list: page failed with HTTP ${promotionResponse?.status()}`);
    try {
      await promotionPage.locator('[data-quiet-key="l2-vote-ledger"] > summary').click();
      await promotionPage.locator('#etherlink-governance-modal.active #etherlink-governance-recent-bakers').waitFor({ state: 'visible', timeout: 30000 });
    } catch (error) {
      const debug = await promotionPage.evaluate(() => ({
        path: `${window.location.pathname}${window.location.search}${window.location.hash}`,
        readyState: document.readyState,
        modal: document.getElementById('etherlink-governance-modal')?.outerHTML.slice(0, 2500) || '',
        recentBakers: (() => {
          const node = document.getElementById('etherlink-governance-recent-bakers');
          if (!node) return null;
          const style = getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          return {
            connected: node.isConnected,
            display: style.display,
            visibility: style.visibility,
            opacity: style.opacity,
            rect: { width: rect.width, height: rect.height, top: rect.top, left: rect.left }
          };
        })(),
        nowPanel: document.getElementById('etherlink-governance-now')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 1000) || '',
        dataStatus: document.getElementById('data-status')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        route: document.documentElement.dataset.chamberRoute || '',
        activeOverlays: Array.from(document.querySelectorAll('.chamber-overlay.active')).map((node) => node.id)
      }));
      throw new Error(`Tezos X promotion baker quorum list did not open: ${error.message}; debug=${JSON.stringify(debug)}; issues=${promotionIssues.join(' | ')}`);
    }
    await promotionPage.waitForFunction(() => document.querySelectorAll('#etherlink-governance-recent-bakers .etherlink-gov-baker-vote-row').length === 27, null, { timeout: 15000 });
    const promotionBakerState = await promotionPage.evaluate(() => ({
      entryValue: document.querySelector('#etherlink-governance-entry-value')?.textContent?.trim() || '',
      title: document.querySelector('#etherlink-governance-recent-bakers-title')?.textContent?.trim() || '',
      text: document.querySelector('#etherlink-governance-recent-bakers')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      rows: Array.from(document.querySelectorAll('#etherlink-governance-recent-bakers .etherlink-gov-baker-vote-row')).map((row) => ({
        baker: row.querySelector('.etherlink-gov-voter-link')?.textContent?.trim() || '',
        ballot: row.querySelector('.etherlink-gov-ballot')?.textContent?.trim() || '',
        power: row.querySelector('.etherlink-gov-baker-power strong')?.textContent?.trim() || '',
        contribution: row.querySelector('.etherlink-gov-quorum-share strong')?.textContent?.trim() || '',
        share: row.dataset.quorumShare || '',
        cumulativeShare: row.dataset.cumulativeQuorumShare || '',
        quorumCrossed: row.dataset.quorumCrossed || '',
        meta: row.querySelector('.etherlink-gov-baker-vote-main small')?.textContent?.trim() || '',
        opHref: row.querySelector('.etherlink-gov-vote-op')?.href || ''
      }))
    }));
    assert(promotionBakerState.entryValue === 'PASSING', `Tezos X promotion baker quorum list: entry outcome mismatch ${promotionBakerState.entryValue}`);
    assert(promotionBakerState.title === 'Full Promotion vote ledger · first to latest', `Tezos X promotion baker quorum list: title mismatch ${promotionBakerState.title}`);
    assert(/Who made up the quorum/.test(promotionBakerState.text) && /27 baker receipts · complete/.test(promotionBakerState.text) && /15% quorum \(98\.5M XTZ\)/.test(promotionBakerState.text), `Tezos X promotion baker quorum list: threshold context missing ${promotionBakerState.text}`);
    assert(promotionBakerState.rows.length === 27 && promotionBakerState.rows[0].baker === 'Ledger Baker 1' && promotionBakerState.rows.at(-1).baker === 'QA Baker', `Tezos X promotion baker quorum list: first-to-latest order is wrong ${JSON.stringify(promotionBakerState.rows)}`);
    assert(promotionBakerState.rows.filter((row) => row.ballot === 'YEA').length === 22 && promotionBakerState.rows.filter((row) => row.ballot === 'PASS').length === 5, `Tezos X promotion baker quorum list: expanded ballots are wrong ${JSON.stringify(promotionBakerState.rows)}`);
    assert(promotionBakerState.rows[0].power === '6.0M XTZ' && promotionBakerState.rows[20].power === '6.5M XTZ' && promotionBakerState.rows[21].power === '17.6M XTZ' && promotionBakerState.rows.at(-1).power === '30.0M XTZ', `Tezos X promotion baker quorum list: voting powers are wrong ${JSON.stringify(promotionBakerState.rows)}`);
    assert(promotionBakerState.rows[16].baker === 'Ledger Baker 17' && promotionBakerState.rows[16].quorumCrossed === 'true' && promotionBakerState.rows.filter((row) => row.quorumCrossed === 'true').length === 1 && promotionBakerState.rows.at(-1).cumulativeShare === '247.87', `Tezos X promotion baker quorum list: cumulative quorum crossing is wrong ${JSON.stringify(promotionBakerState.rows)}`);
    assert(/1 of 27 · .* UTC · level 12345400/.test(promotionBakerState.rows[0].meta) && /27 of 27 · .* UTC · level 12345600/.test(promotionBakerState.rows.at(-1).meta), `Tezos X promotion baker quorum list: exact chronological timestamps are missing ${JSON.stringify(promotionBakerState.rows)}`);
    assert(promotionBakerState.rows.slice(22, 26).every((row) => /via tz1iJP1EtP/.test(row.meta)), `Tezos X promotion baker quorum list: shared voting key was not attributed ${JSON.stringify(promotionBakerState.rows)}`);
    assert(promotionBakerState.rows.every((row) => /tzkt\.io\/opEtherlink/.test(row.opHref)), `Tezos X promotion baker quorum list: operation provenance missing ${JSON.stringify(promotionBakerState.rows)}`);

    await promotionPage.setViewportSize({ width: 390, height: 844 });
    const promotionMobileState = await promotionPage.evaluate(() => {
      const panel = document.querySelector('#etherlink-governance-recent-bakers');
      const rows = Array.from(panel?.querySelectorAll('.etherlink-gov-baker-vote-row') || []);
      return {
        pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
        panelOverflow: panel ? panel.scrollWidth - panel.clientWidth : 0,
        rowOverflows: rows.map((row) => row.scrollWidth - row.clientWidth),
        visibleRows: rows.filter((row) => row.getBoundingClientRect().height > 0).length,
        rowColumns: rows[0] ? window.getComputedStyle(rows[0]).gridTemplateColumns.split(' ').filter(Boolean).length : 0
      };
    });
    assert(promotionMobileState.pageOverflow <= 2 && promotionMobileState.panelOverflow <= 2 && promotionMobileState.rowOverflows.every((value) => value <= 2), `Tezos X promotion baker quorum list: mobile list overflows ${JSON.stringify(promotionMobileState)}`);
    assert(promotionMobileState.visibleRows === 27 && promotionMobileState.rowColumns === 2, `Tezos X promotion baker quorum list: mobile must keep the complete baker receipt ledger scannable ${JSON.stringify(promotionMobileState)}`);
    await promotionContext.close();
    assert(promotionIssues.length === 0, `Tezos X promotion baker quorum list browser issues:\n${promotionIssues.join('\n')}`);

    const failedPromotionIssues = [];
    const failedPromotionContext = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(failedPromotionContext, { etherlinkPromotionFailure: true });
    await failedPromotionContext.addInitScript(() => {
      localStorage.setItem('tezos-systems-theme', 'matrix');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    });
    const failedPromotionPage = await failedPromotionContext.newPage();
    attachIssueCollectors(failedPromotionPage, 'Tezos X failed Promotion outcome', failedPromotionIssues);
    const failedPromotionResponse = await failedPromotionPage.goto(`${baseUrl}/?theme=matrix#l2chamber`, { waitUntil: 'domcontentloaded' });
    assert(failedPromotionResponse?.ok(), `Tezos X failed Promotion outcome: page failed with HTTP ${failedPromotionResponse?.status()}`);
    await failedPromotionPage.waitForFunction(() => Boolean(document.getElementById('shell-extras-css')?.sheet), null, { timeout: 5000 });
    await failedPromotionPage.waitForFunction(() => document.querySelector('#etherlink-governance-entry-value')?.textContent?.trim() === 'CANNOT PASS', null, { timeout: 15000 });
    await failedPromotionPage.waitForFunction(() => document.querySelector('#etherlink-governance-modal .chamber-badge')?.textContent?.trim() === 'Promotion cannot pass', null, { timeout: 15000 });
    const failedPromotionState = await failedPromotionPage.evaluate(() => {
      const card = document.querySelector('#etherlink-governance-entry-card');
      const value = document.querySelector('#etherlink-governance-entry-value');
      const mini = document.querySelector('#etherlink-governance-entry-mini');
      const slow = Array.from(document.querySelectorAll('.etherlink-gov-entry-metric'))
        .find((metric) => /SLOW/.test(metric.textContent || ''));
      const badge = document.querySelector('#etherlink-governance-modal .chamber-badge');
      const slowGates = slow ? Array.from(slow.querySelectorAll('.etherlink-gov-entry-gates span')) : [];
      const nowCards = Array.from(document.querySelectorAll('#etherlink-governance-now .chamber-now-card'));
      const participationCard = nowCards.find((item) => /Participation/.test(item.textContent || ''));
      const yeaCard = nowCards.find((item) => /Yea supermajority/.test(item.textContent || ''));
      return {
        headline: value?.textContent?.trim() || '',
        headlineColor: value ? getComputedStyle(value).color : '',
        state: card?.dataset.etherlinkGovernanceState || '',
        live: card?.dataset.etherlinkGovernanceLive || '',
        riskClass: card?.classList.contains('chamber-entry-risk') || false,
        liveClass: card?.classList.contains('chamber-entry-live') || false,
        mini: mini?.textContent?.replace(/\s+/g, ' ').trim() || '',
        miniColor: mini ? getComputedStyle(mini).color : '',
        slowText: slow?.textContent?.replace(/\s+/g, ' ').trim() || '',
        slowOutcome: slow?.dataset.governanceOutcome || '',
        slowGateOutcomes: slowGates.map((gate) => gate.dataset.governanceOutcome || ''),
        slowGateColors: slowGates.map((gate) => getComputedStyle(gate).color),
        badge: badge?.textContent?.trim() || '',
        badgeColor: badge ? getComputedStyle(badge).color : '',
        nowSummary: document.querySelector('#etherlink-governance-now .chamber-now-main p')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        participationOutcome: participationCard?.dataset.governanceOutcome || '',
        participationColor: participationCard?.querySelector('strong') ? getComputedStyle(participationCard.querySelector('strong')).color : '',
        yeaOutcome: yeaCard?.dataset.governanceOutcome || '',
        yeaColor: yeaCard?.querySelector('strong') ? getComputedStyle(yeaCard.querySelector('strong')).color : '',
        pageOverflow: document.documentElement.scrollWidth - window.innerWidth
      };
    });
    assert(failedPromotionState.headline === 'CANNOT PASS'
      && failedPromotionState.state === 'risk'
      && failedPromotionState.live === 'true'
      && failedPromotionState.riskClass
      && !failedPromotionState.liveClass,
    `Tezos X failed Promotion outcome: overall state is not explicit ${JSON.stringify(failedPromotionState)}`);
    assert(/SLOW: Promotion cannot pass/.test(failedPromotionState.mini)
      && /SLOW Quorum 33\.0% \/ 5%\s*Yea 0\.0% \/ 75%/.test(failedPromotionState.slowText)
      && failedPromotionState.slowOutcome === 'risk'
      && failedPromotionState.slowGateOutcomes.join(',') === 'good,risk',
    `Tezos X failed Promotion outcome: the two independent gates are not visible ${JSON.stringify(failedPromotionState)}`);
    assert(failedPromotionState.headlineColor === 'rgb(255, 107, 122)'
      && failedPromotionState.miniColor === 'rgb(255, 107, 122)'
      && failedPromotionState.slowGateColors.join(',') === 'rgb(53, 232, 148),rgb(255, 107, 122)'
      && failedPromotionState.badgeColor === 'rgb(255, 107, 122)'
      && failedPromotionState.participationOutcome === 'good'
      && failedPromotionState.participationColor === 'rgb(53, 232, 148)'
      && failedPromotionState.yeaOutcome === 'risk'
      && failedPromotionState.yeaColor === 'rgb(255, 107, 122)',
    `Tezos X failed Promotion outcome: failure red did not replace success green ${JSON.stringify(failedPromotionState)}`);
    assert(failedPromotionState.badge === 'Promotion cannot pass'
      && /cannot pass this Promotion vote/.test(failedPromotionState.nowSummary)
      && /at most 67\.0% against 75% required/.test(failedPromotionState.nowSummary),
    `Tezos X failed Promotion outcome: detailed explanation is missing the terminal supermajority math ${JSON.stringify(failedPromotionState)}`);
    assert(failedPromotionState.pageOverflow <= 2, `Tezos X failed Promotion outcome: desktop card overflow ${JSON.stringify(failedPromotionState)}`);

    await failedPromotionPage.setViewportSize({ width: 390, height: 844 });
    const failedPromotionMobile = await failedPromotionPage.evaluate(() => ({
      headline: document.querySelector('#etherlink-governance-entry-value')?.textContent?.trim() || '',
      metricOverflows: Array.from(document.querySelectorAll('#etherlink-governance-entry-metrics .etherlink-gov-entry-metric'))
        .map((metric) => metric.scrollWidth - metric.clientWidth),
      pageOverflow: document.documentElement.scrollWidth - window.innerWidth
    }));
    assert(failedPromotionMobile.headline === 'CANNOT PASS'
      && failedPromotionMobile.pageOverflow <= 2
      && failedPromotionMobile.metricOverflows.every((overflow) => overflow <= 2),
    `Tezos X failed Promotion outcome: mobile state overflows or loses the verdict ${JSON.stringify(failedPromotionMobile)}`);
    await failedPromotionContext.close();
    assert(failedPromotionIssues.length === 0, `Tezos X failed Promotion outcome browser issues:\n${failedPromotionIssues.join('\n')}`);

    await page.locator('#etherlink-governance-modal [data-etherlink-track="slow"]').click();
    const etherlinkSlowState = await page.evaluate(() => ({
      activeTab: document.querySelector('#etherlink-governance-modal [data-etherlink-track].active')?.dataset.etherlinkTrack || '',
      historyRows: document.querySelectorAll('#etherlink-governance-modal .etherlink-gov-history-row').length,
      text: document.querySelector('#etherlink-governance-modal')?.textContent || ''
    }));
    assert(etherlinkSlowState.activeTab === 'slow', `governance testing period: Etherlink SLOW tab did not activate, saw ${etherlinkSlowState.activeTab}`);
    assert(/No active SLOW proposal/.test(etherlinkSlowState.text), `governance testing period: Etherlink SLOW empty state missing: ${etherlinkSlowState.text.slice(0, 240)}`);
    assert(etherlinkSlowState.historyRows >= 2 && /Farfadet/.test(etherlinkSlowState.text), `governance testing period: Etherlink SLOW history missing: ${etherlinkSlowState.text.slice(0, 320)}`);
    await page.locator('#etherlink-governance-modal [data-etherlink-track="sequencer"]').click();
    const etherlinkSequencerState = await page.evaluate(() => ({
      activeTab: document.querySelector('#etherlink-governance-modal [data-etherlink-track].active')?.dataset.etherlinkTrack || '',
      historyRows: document.querySelectorAll('#etherlink-governance-modal .etherlink-gov-history-row').length,
      text: document.querySelector('#etherlink-governance-modal')?.textContent || ''
    }));
    assert(etherlinkSequencerState.activeTab === 'sequencer', `governance testing period: Etherlink Sequencer tab did not activate, saw ${etherlinkSequencerState.activeTab}`);
    assert(etherlinkSequencerState.historyRows >= 2 && /Sequencer Upgrade/.test(etherlinkSequencerState.text), `governance testing period: Etherlink Sequencer history missing: ${etherlinkSequencerState.text.slice(0, 320)}`);
    await page.locator('#etherlink-governance-modal.active .chamber-close').click();
    await page.waitForFunction(() => !document.querySelector('#etherlink-governance-modal')?.classList.contains('active'), null, { timeout: 5000 });
    await page.evaluate(() => { window.location.hash = 'l2chamber'; });
    await page.locator('#etherlink-governance-modal.active .etherlink-gov-content').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('#etherlink-governance-modal.active .chamber-close').click();
    await page.waitForFunction(() => !document.querySelector('#etherlink-governance-modal')?.classList.contains('active'), null, { timeout: 5000 });

    await page.locator('[data-stat="tz4-adoption"] .chamber-expand-cue').click();
    await page.locator('#tz4-adoption-modal.active .tz4-content').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('#tz4-adoption-modal.active .chamber-close').click();
    await page.waitForFunction(() => !document.querySelector('#tz4-adoption-modal')?.classList.contains('active'), null, { timeout: 5000 });

    await page.locator('#chamber-entry-card .card-front').click();
    await page.locator('.chamber-overlay.active .chamber-content').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('#chamber-modal.active .chamber-badge').waitFor({ state: 'visible', timeout: 10000 });
    await assertNormalizedChamberShell(page, '#chamber-modal.active', '.chamber-content', 'standard', 'L1 Governance chamber');
    await page.locator('#chamber-modal.active .gauge-context-label').waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForFunction(() => document.querySelectorAll('#chamber-current-vote-order .current-vote-row').length >= 2, null, { timeout: 10000 });
    await page.waitForFunction(() => document.querySelectorAll('#chamber-vote-log .vote-log-row').length >= 40, null, { timeout: 10000 });
    const chamberState = await page.evaluate(() => ({
      badge: document.querySelector('#chamber-modal .chamber-badge')?.textContent?.trim() || '',
      badgeClasses: document.querySelector('#chamber-modal .chamber-badge')?.className || '',
      gaugeLabel: document.querySelector('#chamber-modal .gauge-context-label')?.textContent?.trim() || '',
      gaugeMeta: document.querySelector('#chamber-modal .gauge-context-meta')?.textContent?.trim() || '',
      thresholdNote: document.querySelector('#chamber-modal .gauge-threshold-note')?.textContent?.trim() || '',
      svgTextCount: document.querySelectorAll('#chamber-modal .gauge-svg text').length,
      footer: document.querySelector('#chamber-modal .chamber-footer')?.textContent || '',
      proposalIntel: document.querySelector('#chamber-proposal-intel')?.textContent || '',
      gapAnalysis: document.querySelector('#chamber-gap-analysis')?.textContent || '',
      currentVoteTitle: document.querySelector('#chamber-current-vote-order .current-vote-title')?.textContent?.trim() || '',
      currentVoteContext: document.querySelector('#chamber-current-vote-order .current-vote-context')?.textContent?.trim() || '',
      currentVoteCount: document.querySelector('#chamber-current-vote-order .current-vote-count')?.textContent?.trim() || '',
      currentVoteRows: document.querySelectorAll('#chamber-current-vote-order .current-vote-row').length,
      currentVoteFirstText: document.querySelector('#chamber-current-vote-order .current-vote-row')?.textContent || '',
      currentVoteChronological: Array.from(document.querySelectorAll('#chamber-current-vote-order .current-vote-row')).every((row, index, rows) => {
        if (index === 0) return true;
        return Number(rows[index - 1].dataset.ballotTime) <= Number(row.dataset.ballotTime);
      }),
      chamberNow: document.querySelector('#chamber-now-panel')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      chamberNowCards: document.querySelectorAll('#chamber-now-panel .chamber-now-card').length,
      chamberNowWatchItems: document.querySelectorAll('#chamber-now-panel .chamber-now-watch li').length,
      voteLogContext: document.querySelector('#chamber-vote-log .vote-log-context')?.textContent?.trim() || '',
      voteLogCount: document.querySelector('#chamber-vote-log .vote-log-count')?.textContent?.trim() || '',
      voteLogRows: document.querySelectorAll('#chamber-vote-log .vote-log-row').length,
      voteLogFirstText: document.querySelector('#chamber-vote-log .vote-log-row')?.textContent || '',
      voteLogFirstIndex: document.querySelector('#chamber-vote-log .vote-log-row .vote-log-index')?.textContent?.trim() || '',
      voteLogChronological: Array.from(document.querySelectorAll('#chamber-vote-log .vote-log-row')).every((row, index, rows) => {
        if (index === 0) return true;
        const prev = rows[index - 1];
        const prevKey = [Number(prev.dataset.voteEpoch), Number(prev.dataset.votePeriod)];
        const key = [Number(row.dataset.voteEpoch), Number(row.dataset.votePeriod)];
        return prevKey[0] < key[0] || (prevKey[0] === key[0] && prevKey[1] <= key[1]);
      })
    }));
    assert(chamberState.badge === 'Cooldown', `governance testing period: Chamber badge should be Cooldown, saw ${chamberState.badge}`);
    assert(chamberState.badgeClasses.includes('cooldown') && !chamberState.badgeClasses.includes('live'), `governance testing period: Chamber badge class mismatch: ${chamberState.badgeClasses}`);
    assert(chamberState.gaugeLabel === 'Exploration result', `governance testing period: gauge should be a completed result, saw ${chamberState.gaugeLabel}`);
    assert(/No ballots are open during Cooldown/.test(chamberState.gaugeMeta), `governance testing period: gauge meta mismatch: ${chamberState.gaugeMeta}`);
    assert(/80% threshold/.test(chamberState.thresholdNote), `governance testing period: missing threshold note, saw ${chamberState.thresholdNote}`);
    assert(chamberState.svgTextCount === 0, 'governance testing period: threshold label should not be drawn over the gauge arc');
    assert(/Current Cooldown period; showing latest Exploration result/.test(chamberState.footer), `governance testing period: footer mismatch: ${chamberState.footer}`);
    assert(/What is happening now/.test(chamberState.chamberNow) && /Cooldown/.test(chamberState.chamberNow) && /No baker ballots|no-ballot/i.test(chamberState.chamberNow), `governance testing period: current state panel missing quiet-state copy: ${chamberState.chamberNow}`);
    assert(/Promotion opens after Cooldown/.test(chamberState.chamberNow) && /Latest vote/.test(chamberState.chamberNow), `governance testing period: current state panel missing next milestone/latest vote: ${chamberState.chamberNow}`);
    assert(chamberState.chamberNowCards === 3, `governance testing period: current state panel should expose 3 summary cards, saw ${chamberState.chamberNowCards}`);
    assert(chamberState.chamberNowWatchItems >= 3, `governance testing period: current state panel should expose watch items, saw ${chamberState.chamberNowWatchItems}`);
    assert(/Proposal Intel/.test(chamberState.proposalIntel) && /activation window|Cooldown|window ends/i.test(chamberState.proposalIntel), `governance testing period: proposal intel missing: ${chamberState.proposalIntel}`);
    assert(/Gap Analysis/.test(chamberState.gapAnalysis) && /Quorum gap/.test(chamberState.gapAnalysis) && /Largest non-voters/.test(chamberState.gapAnalysis), `governance testing period: gap analysis missing: ${chamberState.gapAnalysis}`);
    assert(chamberState.currentVoteTitle === 'Exploration Vote Order', `governance testing period: current-stage vote order title mismatch: ${chamberState.currentVoteTitle}`);
    assert(/Displayed Exploration result/.test(chamberState.currentVoteContext), `governance testing period: current-stage vote order context mismatch: ${chamberState.currentVoteContext}`);
    assert(chamberState.currentVoteCount === '2 ballots', `governance testing period: current-stage vote count mismatch: ${chamberState.currentVoteCount}`);
    assert(chamberState.currentVoteChronological, 'governance testing period: current-stage votes should be oldest to newest');
    assert(/QA Baker/.test(chamberState.currentVoteFirstText) && /Yay/.test(chamberState.currentVoteFirstText), `governance testing period: current-stage first ballot mismatch: ${chamberState.currentVoteFirstText}`);
    assert(chamberState.voteLogRows >= 40, `governance testing period: chronological vote log should show the full local history, saw ${chamberState.voteLogRows}`);
    assert(chamberState.voteLogChronological, 'governance testing period: chronological vote log should be oldest to newest by epoch and period');
    assert(/oldest to newest/.test(chamberState.voteLogContext), `governance testing period: vote log context should state sort order, saw ${chamberState.voteLogContext}`);
    assert(/Athens/.test(chamberState.voteLogFirstText), `governance testing period: vote log should start with the earliest Athens vote, saw ${chamberState.voteLogFirstText}`);
    assert(chamberState.voteLogFirstIndex === '01', `governance testing period: vote log row numbering should start at 01, saw ${chamberState.voteLogFirstIndex}`);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => window.matchMedia('(max-width: 640px)').matches, null, { timeout: 5000 });
    const chamberMobileRows = await page.evaluate(() => {
      const inspectRows = (selector) => Array.from(document.querySelectorAll(selector)).slice(0, 4).map((row, rowIndex) => {
        const rowBox = row.getBoundingClientRect();
        const children = Array.from(row.children).map((el, childIndex) => {
          const box = el.getBoundingClientRect();
          return {
            childIndex,
            cls: el.className,
            text: el.textContent?.trim() || '',
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height,
            overflowX: el.scrollWidth > el.clientWidth + 1
          };
        });
        const overlaps = [];
        for (let first = 0; first < children.length; first += 1) {
          for (let second = first + 1; second < children.length; second += 1) {
            const a = children[first];
            const b = children[second];
            if (a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y) {
              overlaps.push([a.cls, b.cls]);
            }
          }
        }
        return {
          rowIndex,
          height: rowBox.height,
          overflowX: row.scrollWidth > row.clientWidth + 1,
          overlaps,
          children
        };
      });

      return {
        current: inspectRows('#chamber-current-vote-order .current-vote-row'),
        log: inspectRows('#chamber-vote-log .vote-log-row')
      };
    });
    const funkyCurrentRows = chamberMobileRows.current.filter((row) => row.overflowX || row.overlaps.length);
    const funkyLogRows = chamberMobileRows.log.filter((row) => row.overflowX || row.overlaps.length);
    assert(funkyCurrentRows.length === 0, `governance testing period: mobile current vote rows should not overlap or overflow: ${JSON.stringify(funkyCurrentRows)}`);
    assert(funkyLogRows.length === 0, `governance testing period: mobile vote-log rows should not overlap or overflow: ${JSON.stringify(funkyLogRows)}`);
    await page.setViewportSize({ width: 1440, height: 1000 });

    await page.locator('.chamber-overlay.active .chamber-close').click();
    await page.waitForFunction(() => !document.querySelector('#chamber-modal')?.classList.contains('active'), null, { timeout: 5000 });
    await page.evaluate(() => { window.location.hash = 'chamber'; });
    await page.locator('#chamber-modal.active .chamber-content').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('#chamber-modal.active .chamber-close').click();
    await page.waitForFunction(() => !document.querySelector('#chamber-modal')?.classList.contains('active'), null, { timeout: 5000 });
    await page.evaluate(() => { window.location.hash = 'lb-tile'; });
    await page.waitForFunction(() => document.querySelector('#lb-entry-card')?.classList.contains('deep-link-highlight'), null, { timeout: 5000 });
    await page.waitForFunction(() => {
      const rect = document.querySelector('#lb-entry-card')?.getBoundingClientRect();
      return Boolean(rect && rect.bottom > 0 && rect.top < window.innerHeight);
    }, null, { timeout: 5000 });
    const lbTileDeepLink = await page.evaluate(() => {
      const rect = document.querySelector('#lb-entry-card')?.getBoundingClientRect();
      return {
        hash: window.location.hash,
        inViewport: Boolean(rect && rect.bottom > 0 && rect.top < window.innerHeight),
        modalActive: Boolean(document.querySelector('#liquidity-baking-modal')?.classList.contains('active'))
      };
    });
    assert(lbTileDeepLink.hash === '#lb-tile', `governance testing period: LB tile hash mismatch: ${lbTileDeepLink.hash}`);
    assert(lbTileDeepLink.inViewport, 'governance testing period: LB tile direct link did not scroll the tile into view');
    assert(!lbTileDeepLink.modalActive, 'governance testing period: LB tile direct link should not open the monitor modal');
    const lbRequestsBeforeOpen = lbBlockRequests.length;
    await page.evaluate(() => { window.location.hash = 'lb'; });
    await page.locator('#liquidity-baking-modal.active .lb-content').waitFor({ state: 'visible', timeout: 10000 });
    await assertNormalizedChamberShell(page, '#liquidity-baking-modal.active', '.lb-content', 'standard', 'Liquidity Baking chamber');
    await page.waitForFunction(() => document.querySelectorAll('#lb-baker-vote-list .lb-table-row').length >= 4, null, { timeout: 10000 });
    assert(lbBlockRequests.length === lbRequestsBeforeOpen, `governance testing period: opening LB should reuse the shared card cache before the six-second cadence, saw ${lbBlockRequests.slice(lbRequestsBeforeOpen).map(String).join(', ')}`);
    await page.waitForFunction(() => document.querySelectorAll('#lb-lore-body .lb-lore-item').length >= 3, null, { timeout: 10000 });
    const lbState = await page.evaluate(() => {
      const modal = document.querySelector('#liquidity-baking-modal');
      const card = document.querySelector('#lb-entry-card');
      return {
        title: modal?.querySelector('.chamber-title')?.textContent || '',
        ema: modal?.querySelector('.lb-ema-value')?.textContent || '',
        status: modal?.querySelector('.lb-status-banner')?.textContent || '',
        live: modal?.dataset.lbLive || '',
        refreshState: modal?.querySelector('#lb-refresh-state')?.textContent || '',
        recentRows: modal?.querySelectorAll('.lb-recent-table .lb-table-row').length || 0,
        bakerRows: modal?.querySelectorAll('#lb-baker-vote-list .lb-table-row').length || 0,
        filters: modal?.querySelectorAll('.lb-filter-btn').length || 0,
        recentSystemLinks: modal?.querySelectorAll('.lb-recent-table .lb-baker-name-link[href^="#baker="]').length || 0,
        recentTzktLinks: modal?.querySelectorAll('.lb-recent-table .lb-baker-source-link[href^="https://tzkt.io/"]').length || 0,
        bakerSystemLinks: modal?.querySelectorAll('#lb-baker-vote-list .lb-baker-name-link[href^="#baker="]').length || 0,
        bakerTzktLinks: modal?.querySelectorAll('#lb-baker-vote-list .lb-baker-source-link[href^="https://tzkt.io/"]').length || 0,
        firstSystemHref: modal?.querySelector('.lb-recent-table .lb-baker-name-link')?.getAttribute('href') || '',
        firstTzktHref: modal?.querySelector('.lb-recent-table .lb-baker-source-link')?.getAttribute('href') || '',
        systemBrand: modal?.querySelector('.lb-system-brand')?.textContent?.trim() || '',
        emaMeta: modal?.querySelector('#lb-ema-meta')?.textContent?.trim() || '',
        explainer: modal?.querySelector('.lb-explainer')?.textContent?.trim() || '',
        helpCount: modal?.querySelectorAll('.lb-help').length || 0,
        loreExpanded: modal?.querySelector('#lb-lore-toggle')?.getAttribute('aria-expanded') || '',
        loreHidden: modal?.querySelector('#lb-lore-body-wrap')?.hidden ?? null,
        loreCollapsed: modal?.querySelector('.lb-lore-panel')?.dataset.lbLoreCollapsed || '',
        lore: modal?.querySelector('#lb-lore-body')?.textContent?.trim() || '',
        loreItems: modal?.querySelectorAll('#lb-lore-body .lb-lore-item').length || 0,
        readMoreLinks: modal?.querySelectorAll('a[href*="liquidity_baking"], a[href*="liquidity-baking"]').length || 0,
        sparklineSpread: (() => {
          const polyline = modal?.querySelector('#lb-ema-sparkline polyline');
          const points = (polyline?.getAttribute('points') || '').trim().split(/\s+/)
            .map((point) => Number(point.split(',')[1]))
            .filter((value) => Number.isFinite(value));
          if (points.length < 2) return 0;
          return Math.max(...points) - Math.min(...points);
        })(),
        sparklineLabel: modal?.querySelector('#lb-ema-sparkline svg')?.getAttribute('aria-label') || '',
        forecast: modal?.querySelector('#lb-ema-forecast')?.textContent || '',
        forecastMetricValues: Array.from(modal?.querySelectorAll('#lb-ema-forecast .lb-metric-grid strong') || []).map((el) => el.textContent?.trim() || ''),
        history: modal?.querySelector('#lb-ema-history')?.textContent || '',
        changeFeed: modal?.querySelector('#lb-vote-change-feed')?.textContent || '',
        cardUpdatedLabel: card?.dataset.updatedLabel || '',
        intervalDelays: (window.__tezosSystemsIntervals || []).map((item) => item.timeout ?? item)
      };
    });
    assert(/Liquidity Baking Monitor/.test(lbState.title), `governance testing period: LB modal title mismatch: ${lbState.title}`);
    assert(lbState.ema === '51.5%', `governance testing period: LB EMA should show mocked value, saw ${lbState.ema}`);
    assert(/SUBSIDY DISABLED/.test(lbState.status), `governance testing period: LB status mismatch: ${lbState.status}`);
    assert(lbState.live === 'true', `governance testing period: LB live refresh should be active, saw ${lbState.live}`);
    assert(/auto-refresh 6s/.test(lbState.refreshState), `governance testing period: LB refresh label mismatch: ${lbState.refreshState}`);
    assert(lbState.recentRows >= 4, `governance testing period: LB recent rows missing, saw ${lbState.recentRows}`);
    assert(lbState.bakerRows >= 4, `governance testing period: LB baker rows missing, saw ${lbState.bakerRows}`);
    assert(lbState.filters === 4, `governance testing period: LB filter count mismatch: ${lbState.filters}`);
    assert(lbState.recentSystemLinks >= lbState.recentRows, `governance testing period: LB recent Tezos.Systems links missing, saw ${lbState.recentSystemLinks}`);
    assert(lbState.recentTzktLinks >= lbState.recentRows, `governance testing period: LB recent TzKT links missing, saw ${lbState.recentTzktLinks}`);
    assert(lbState.bakerSystemLinks >= lbState.bakerRows, `governance testing period: LB baker Tezos.Systems links missing, saw ${lbState.bakerSystemLinks}`);
    assert(lbState.bakerTzktLinks >= lbState.bakerRows, `governance testing period: LB baker TzKT links missing, saw ${lbState.bakerTzktLinks}`);
    assert(lbState.firstSystemHref.includes(SAMPLE_ADDRESS), `governance testing period: LB baker profile href mismatch: ${lbState.firstSystemHref}`);
    assert(lbState.firstTzktHref.includes(SAMPLE_ADDRESS), `governance testing period: LB TzKT href mismatch: ${lbState.firstTzktHref}`);
    assert(lbState.systemBrand === 'Tezos.Systems', `governance testing period: LB systems brand strip missing, saw ${lbState.systemBrand}`);
    assert(/50% disable threshold/.test(lbState.emaMeta), `governance testing period: LB EMA threshold copy mismatch: ${lbState.emaMeta}`);
    assert(!/1,000,000,000/.test(lbState.emaMeta), `governance testing period: LB EMA meta should not show raw protocol threshold: ${lbState.emaMeta}`);
    assert(/What is LB/.test(lbState.explainer) && /Liquidity Baking/.test(lbState.explainer), `governance testing period: LB explainer missing, saw ${lbState.explainer}`);
    assert(lbState.helpCount >= 5, `governance testing period: LB contextual tooltips missing, saw ${lbState.helpCount}`);
    assert(lbState.loreExpanded === 'false', `governance testing period: LB lore should start collapsed, saw aria-expanded=${lbState.loreExpanded}`);
    assert(lbState.loreHidden === true, 'governance testing period: LB lore body should be hidden by default');
    assert(lbState.loreCollapsed === 'true', `governance testing period: LB lore collapsed flag mismatch: ${lbState.loreCollapsed}`);
    assert(lbState.loreItems >= 3, `governance testing period: LB protocol-history lore items missing, saw ${lbState.loreItems}`);
    assert(/Granada/.test(lbState.lore) && /Ithaca/.test(lbState.lore) && /Jakarta/.test(lbState.lore), `governance testing period: LB lore should expose Granada/Ithaca/Jakarta, saw ${lbState.lore}`);
    assert(lbState.sparklineSpread >= 12, `governance testing period: LB EMA sparkline should auto-scale recent movement, saw spread ${lbState.sparklineSpread}`);
    const sparklineLabelRange = lbState.sparklineLabel.match(/from ([\d.]+)% to ([\d.]+)%/);
    assert(sparklineLabelRange
      && Number(sparklineLabelRange[1]) < Number(sparklineLabelRange[2])
      && Math.abs(Number(sparklineLabelRange[2]) - 51.5) < 0.001,
    `governance testing period: LB EMA sparkline label should expose the canonical-window range, saw ${lbState.sparklineLabel}`);
    assert(/EMA Forecast/.test(lbState.forecast) && /Drift/.test(lbState.forecast), `governance testing period: LB forecast panel missing: ${lbState.forecast}`);
    assert(lbState.forecastMetricValues.some((value) => /pp\/d$/.test(value)), `governance testing period: LB drift metric should use compact pp/d unit: ${lbState.forecastMetricValues.join(', ')}`);
    assert(lbState.forecastMetricValues.every((value) => value.length <= 11), `governance testing period: LB forecast metrics should stay compact: ${lbState.forecastMetricValues.join(', ')}`);
    assert(!/pp\/day/.test(lbState.forecast), `governance testing period: LB forecast should avoid verbose pp/day unit: ${lbState.forecast}`);
    assert(/EMA History Strip/.test(lbState.history) && /Sample/.test(lbState.history), `governance testing period: LB history strip missing: ${lbState.history}`);
    assert(/Vote Change Feed/.test(lbState.changeFeed), `governance testing period: LB vote change feed missing: ${lbState.changeFeed}`);
    assert(/^TzKT blocks · /.test(lbState.cardUpdatedLabel), `governance testing period: LB freshness stamp mismatch: ${lbState.cardUpdatedLabel}`);
    await page.locator('#lb-lore-toggle').click();
    const lbLoreExpandedState = await page.evaluate(() => ({
      expanded: document.querySelector('#liquidity-baking-modal #lb-lore-toggle')?.getAttribute('aria-expanded') || '',
      hidden: document.querySelector('#liquidity-baking-modal #lb-lore-body-wrap')?.hidden ?? null,
      collapsed: document.querySelector('#liquidity-baking-modal .lb-lore-panel')?.dataset.lbLoreCollapsed || '',
      items: document.querySelectorAll('#liquidity-baking-modal #lb-lore-body .lb-lore-item').length
    }));
    assert(lbLoreExpandedState.expanded === 'true', `governance testing period: LB lore did not expand, saw aria-expanded=${lbLoreExpandedState.expanded}`);
    assert(lbLoreExpandedState.hidden === false, 'governance testing period: LB lore body stayed hidden after expand');
    assert(lbLoreExpandedState.collapsed === 'false', `governance testing period: LB lore expanded flag mismatch: ${lbLoreExpandedState.collapsed}`);
    assert(lbLoreExpandedState.items >= 3, `governance testing period: LB expanded lore items missing, saw ${lbLoreExpandedState.items}`);
    assert(lbState.readMoreLinks >= 2, `governance testing period: LB read-more links missing, saw ${lbState.readMoreLinks}`);
    assert(lbState.intervalDelays.includes(6000), `governance testing period: LB modal 6s refresh timer was not registered: ${lbState.intervalDelays.join(', ')}`);

    const smoothRefreshStart = await page.evaluate(() => {
      window.__lbBodyNode = document.querySelector('#liquidity-baking-modal .lb-body');
      window.__lbHeaderNode = document.querySelector('#liquidity-baking-modal .lb-header');
      const timer = (window.__tezosSystemsIntervals || []).filter((item) => item.timeout === 6000).at(-1);
      const beforeLevel = document.querySelector('#lb-recent-block-list .lb-table-row')?.dataset.lbLevel || '';
      timer?.handler();
      return { beforeLevel, hasTimer: Boolean(timer) };
    });
    assert(smoothRefreshStart.hasTimer, 'governance testing period: LB smooth refresh timer handler missing');
    await page.waitForFunction((beforeLevel) => {
      const top = document.querySelector('#lb-recent-block-list .lb-table-row')?.dataset.lbLevel || '';
      return top && top !== beforeLevel;
    }, smoothRefreshStart.beforeLevel, { timeout: 5000 });
    const smoothRefreshState = await page.evaluate(() => ({
      sameBody: window.__lbBodyNode === document.querySelector('#liquidity-baking-modal .lb-body'),
      sameHeader: window.__lbHeaderNode === document.querySelector('#liquidity-baking-modal .lb-header'),
      topLevel: document.querySelector('#lb-recent-block-list .lb-table-row')?.dataset.lbLevel || '',
      newRows: document.querySelectorAll('#lb-recent-block-list .lb-row-new').length,
      recentRows: document.querySelectorAll('#lb-recent-block-list .lb-table-row').length
    }));
    assert(smoothRefreshState.sameBody, 'governance testing period: LB refresh should preserve the modal body node');
    assert(smoothRefreshState.sameHeader, 'governance testing period: LB refresh should preserve the header node');
    assert(Number(smoothRefreshState.topLevel) > Number(smoothRefreshStart.beforeLevel), `governance testing period: LB top row should advance, saw ${smoothRefreshStart.beforeLevel} -> ${smoothRefreshState.topLevel}`);
    assert(smoothRefreshState.newRows > 0, 'governance testing period: LB refresh should mark newly inserted rows');
    assert(smoothRefreshState.recentRows <= 12, `governance testing period: LB recent rows should stay capped, saw ${smoothRefreshState.recentRows}`);
    const lbFullWindowRequests = lbBlockRequests.filter((url) => url.searchParams.get('limit') === '2500');
    const lbIncrementalRequests = lbBlockRequests.filter((url) => url.searchParams.get('limit') === '32');
    assert(lbFullWindowRequests.length === 1, `governance testing period: LB should load one initial 2,500-block window, saw ${lbFullWindowRequests.map(String).join(', ')}`);
    assert(lbIncrementalRequests.length >= 1, `governance testing period: LB live tick did not use its bounded incremental page ${lbBlockRequests.map(String).join(', ')}`);
    assert(lbIncrementalRequests.every((url) => url.searchParams.has('level.ge') && (url.searchParams.get('select') || '').includes('hash')), `governance testing period: LB incremental request lost overlap or hash receipts ${lbIncrementalRequests.map(String).join(', ')}`);

    await page.locator('#liquidity-baking-modal.active .chamber-close').click();
    await page.waitForFunction(() => !document.querySelector('#liquidity-baking-modal')?.classList.contains('active'), null, { timeout: 5000 });
    await page.evaluate((addr) => {
      localStorage.setItem('tezos-systems-my-baker-address', addr);
      window.location.hash = 'tz4';
    }, SAMPLE_ADDRESS);
    await page.locator('#tz4-adoption-modal.active .tz4-content').waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForFunction(() => document.querySelectorAll('#tz4-baker-status-list .tz4-table-row').length >= 3, null, { timeout: 10000 });
    const tz4State = await page.evaluate(() => ({
      title: document.querySelector('#tz4-adoption-modal .chamber-title')?.textContent || '',
      badge: document.querySelector('#tz4-adoption-modal .chamber-badge')?.textContent || '',
      live: document.querySelector('#tz4-adoption-modal')?.dataset.tz4Live || '',
      refreshState: document.querySelector('#tz4-refresh-state')?.textContent || '',
      hero: document.querySelector('#tz4-adoption-modal .tz4-hero-number')?.textContent || '',
      heroCopy: document.querySelector('#tz4-adoption-modal .tz4-hero-copy')?.textContent || '',
      coverage: document.querySelector('#tz4-adoption-modal .tz4-explainer')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      legend: document.querySelector('#tz4-adoption-modal .tz4-adoption-legend')?.textContent || '',
      saved: document.querySelector('#tz4-adoption-modal .tz4-saved-baker')?.textContent || '',
      latestSwitches: document.querySelector('#tz4-adoption-modal .tz4-latest-panel')?.textContent || '',
      latestSwitchRows: document.querySelectorAll('#tz4-adoption-modal [data-tz4-latest-switch]').length,
      pendingQueue: document.querySelector('#tz4-adoption-modal .tz4-pending-panel')?.textContent || '',
      pendingQueueRows: document.querySelectorAll('#tz4-adoption-modal [data-tz4-pending-queue]').length,
      firstMovers: document.querySelector('#tz4-adoption-modal .tz4-first-list')?.textContent || '',
      projection: document.querySelector('#tz4-projection-panel')?.textContent || '',
      holdouts: document.querySelector('#tz4-holdouts-panel')?.textContent || '',
      holdoutNameWhiteSpace: getComputedStyle(document.querySelector('#tz4-holdouts-panel .lb-baker-name-link') || document.body).whiteSpace,
      momentum: document.querySelector('#tz4-switch-momentum')?.textContent || '',
      monthBarStyle: (() => {
        const rail = document.querySelector('#tz4-adoption-modal .tz4-month-bars');
        const bar = rail?.querySelector('.tz4-month-bar');
        const fill = bar?.querySelector('.tz4-month-fill');
        const count = bar?.querySelector('.tz4-month-count');
        if (!rail || !bar || !fill) return null;
        const railStyle = window.getComputedStyle(rail);
        const barStyle = window.getComputedStyle(bar);
        const fillStyle = window.getComputedStyle(fill);
        const fillBox = fill.getBoundingClientRect();
        return {
          count: rail.querySelectorAll('.tz4-month-bar').length,
          railDisplay: railStyle.display,
          barDisplay: barStyle.display,
          fillDisplay: fillStyle.display,
          countText: count?.textContent?.trim() || '',
          fillHeightVar: fillStyle.getPropertyValue('--tz4-month-height').trim(),
          fillWidth: fillBox.width,
          fillHeight: fillBox.height
        };
      })(),
      milestones: document.querySelector('#tz4-power-milestones')?.textContent || '',
      rows: document.querySelectorAll('#tz4-baker-status-list .tz4-table-row').length,
      activeRows: document.querySelectorAll('#tz4-baker-status-list [data-tz4-status="active"]').length,
      pendingRows: document.querySelectorAll('#tz4-baker-status-list [data-tz4-status="pending"]').length,
      notYetRows: document.querySelectorAll('#tz4-baker-status-list [data-tz4-status="not-yet"]').length,
      filters: document.querySelectorAll('#tz4-adoption-modal [data-tz4-filter]').length,
      systemLinks: document.querySelectorAll('#tz4-adoption-modal .lb-baker-name-link[href^="#baker="]').length,
      tzktLinks: document.querySelectorAll('#tz4-adoption-modal .lb-baker-source-link[href^="https://tzkt.io/"]').length,
      footer: document.querySelector('#tz4-adoption-modal .chamber-footer')?.textContent || '',
      cardUpdatedLabel: document.querySelector('[data-stat="tz4-adoption"]')?.dataset.updatedLabel || '',
      chambersLauncherCopy: document.querySelector('.feature-copy-link[data-copy-hash="#chambers"]')?.getAttribute('aria-label') || '',
      intervalDelays: (window.__tezosSystemsIntervals || []).map((item) => item.timeout ?? item)
    }));
    assert(/tz4 Adoption Chamber/.test(tz4State.title), `governance testing period: tz4 modal title mismatch: ${tz4State.title}`);
    assert(/33\.3% active/.test(tz4State.badge), `governance testing period: tz4 badge mismatch: ${tz4State.badge}`);
    assert(tz4State.live === 'true', `governance testing period: tz4 modal live refresh should be active, saw ${tz4State.live}`);
    assert(/auto-refresh 60s/.test(tz4State.refreshState), `governance testing period: tz4 refresh label mismatch: ${tz4State.refreshState}`);
    assert(tz4State.hero === '33.3%', `governance testing period: tz4 hero adoption mismatch: ${tz4State.hero}`);
    assert(/1 of 3 active bakers/.test(tz4State.heroCopy), `governance testing period: tz4 hero copy mismatch: ${tz4State.heroCopy}`);
    assert(/Coverage:.*2 applied BLS updates.*3 active funded bakers/.test(tz4State.coverage), `governance testing period: tz4 paged-history coverage is missing or dishonest: ${tz4State.coverage}`);
    assert(/1 active/.test(tz4State.legend) && /1 pending/.test(tz4State.legend) && /1 not yet/.test(tz4State.legend), `governance testing period: tz4 legend mismatch: ${tz4State.legend}`);
    assert(/QA Baker/.test(tz4State.saved) && /Active/.test(tz4State.saved), `governance testing period: tz4 saved baker status mismatch: ${tz4State.saved}`);
    assert(tz4State.latestSwitchRows === 1, `governance testing period: tz4 latest switch row count mismatch: ${tz4State.latestSwitchRows}`);
    assert(/Latest Switches/.test(tz4State.latestSwitches) && /QA Baker/.test(tz4State.latestSwitches) && /cycle 1,136/.test(tz4State.latestSwitches), `governance testing period: tz4 latest switch panel mismatch: ${tz4State.latestSwitches}`);
    assert(tz4State.pendingQueueRows === 1, `governance testing period: tz4 pending queue row count mismatch: ${tz4State.pendingQueueRows}`);
    assert(/Pending Queue/.test(tz4State.pendingQueue) && /Pending Baker/.test(tz4State.pendingQueue) && /Activates cycle 1,284/.test(tz4State.pendingQueue), `governance testing period: tz4 pending queue panel mismatch: ${tz4State.pendingQueue}`);
    assert(/QA Baker/.test(tz4State.firstMovers) && /cycle 1,136/.test(tz4State.firstMovers), `governance testing period: tz4 first mover list mismatch: ${tz4State.firstMovers}`);
    assert(/Projection to 50%/.test(tz4State.projection) && /Bakers/.test(tz4State.projection), `governance testing period: tz4 projection panel missing: ${tz4State.projection}`);
    assert(/Largest Holdouts/.test(tz4State.holdouts) && /Second Baker/.test(tz4State.holdouts), `governance testing period: tz4 holdouts panel missing: ${tz4State.holdouts}`);
    assert(tz4State.holdoutNameWhiteSpace !== 'nowrap', `governance testing period: tz4 holdout baker names should be allowed to wrap, saw ${tz4State.holdoutNameWhiteSpace}`);
    assert(/Switches per Month/.test(tz4State.momentum) && /Momentum/.test(tz4State.momentum), `governance testing period: tz4 momentum panel missing: ${tz4State.momentum}`);
    assert(tz4State.monthBarStyle?.count >= 1 && tz4State.monthBarStyle.railDisplay === 'grid' && tz4State.monthBarStyle.barDisplay === 'grid' && tz4State.monthBarStyle.fillDisplay === 'block' && /^\d/.test(tz4State.monthBarStyle.countText) && /px$/.test(tz4State.monthBarStyle.fillHeightVar) && tz4State.monthBarStyle.fillWidth > 0 && tz4State.monthBarStyle.fillHeight >= 8, `governance testing period: tz4 switches-per-month bars should render visible columns with count labels, saw ${JSON.stringify(tz4State.monthBarStyle)}`);
    assert(/Power Milestones/.test(tz4State.milestones) && /40% power/.test(tz4State.milestones), `governance testing period: tz4 milestone panel missing: ${tz4State.milestones}`);
    assert(tz4State.rows >= 3, `governance testing period: tz4 table rows missing, saw ${tz4State.rows}`);
    assert(tz4State.activeRows >= 1, 'governance testing period: tz4 active row missing');
    assert(tz4State.pendingRows >= 1, 'governance testing period: tz4 pending row missing');
    assert(tz4State.notYetRows >= 1, 'governance testing period: tz4 not-yet row missing');
    assert(tz4State.filters === 4, `governance testing period: tz4 filter count mismatch: ${tz4State.filters}`);
    assert(tz4State.systemLinks >= 3, `governance testing period: tz4 Tezos.Systems baker links missing, saw ${tz4State.systemLinks}`);
    assert(tz4State.tzktLinks >= 3, `governance testing period: tz4 TzKT links missing, saw ${tz4State.tzktLinks}`);
    assert(/Direct: \/tz4\//.test(tz4State.footer), `governance testing period: tz4 direct footer missing: ${tz4State.footer}`);
    assert(/^TzKT oldest receipt · /.test(tz4State.cardUpdatedLabel), `governance testing period: tz4 freshness stamp mismatch: ${tz4State.cardUpdatedLabel}`);
    assert(/Copy Chambers link/.test(tz4State.chambersLauncherCopy), `governance testing period: combined Chambers launcher copy link missing: ${tz4State.chambersLauncherCopy}`);
    assert(tz4State.intervalDelays.includes(60000), `governance testing period: tz4 modal 60s refresh timer was not registered: ${tz4State.intervalDelays.join(', ')}`);

    const tz4InitialHistoryRequests = tz4OperationRequests.filter((url) => !url.searchParams.has('level.ge'));
    assert(tz4InitialHistoryRequests.length === 1 && tz4InitialHistoryRequests[0].searchParams.get('limit') === '1000' && tz4InitialHistoryRequests[0].searchParams.get('offset') === '0', `governance testing period: tz4 initial history was not explicitly paged once ${tz4OperationRequests.map(String).join(', ')}`);
    const tz4DelegateRequestsBeforeTick = tz4DelegateRequests.length;
    const tz4IncrementalRequestPromise = page.waitForRequest((request) => {
      try {
        const url = new URL(request.url());
        return url.pathname.endsWith('/operations/update_consensus_key') && url.searchParams.has('level.ge');
      } catch {
        return false;
      }
    }, { timeout: 10000 });
    const tz4TickStarted = await page.evaluate(() => {
      const timer = (window.__tezosSystemsIntervals || []).filter((item) => item.timeout === 60000).at(-1);
      timer?.handler();
      return Boolean(timer);
    });
    assert(tz4TickStarted, 'governance testing period: tz4 incremental refresh timer handler missing');
    const tz4IncrementalRequest = new URL((await tz4IncrementalRequestPromise).url());
    await page.waitForFunction(() => !document.querySelector('#tz4-adoption-modal')?.classList.contains('tz4-refreshing'), null, { timeout: 10000 });
    assert(tz4IncrementalRequest.searchParams.get('limit') === '1000' && tz4IncrementalRequest.searchParams.get('offset') === '0', `governance testing period: tz4 incremental page shape drifted ${tz4IncrementalRequest}`);
    assert(tz4DelegateRequests.length === tz4DelegateRequestsBeforeTick, `governance testing period: tz4 minute tick refetched the full active-baker set ${tz4DelegateRequests.map(String).join(', ')}`);

    await page.locator('#tz4-adoption-modal [data-tz4-filter="pending"]').click();
    const tz4PendingFilter = await page.evaluate(() => ({
      rows: document.querySelectorAll('#tz4-baker-status-list .tz4-table-row').length,
      text: document.querySelector('#tz4-baker-status-list')?.textContent || ''
    }));
    assert(tz4PendingFilter.rows === 1, `governance testing period: tz4 pending filter should show one row, saw ${tz4PendingFilter.rows}`);
    assert(/Pending Baker/.test(tz4PendingFilter.text) && /Activates cycle 1,284/.test(tz4PendingFilter.text), `governance testing period: tz4 pending filter mismatch: ${tz4PendingFilter.text}`);

    await page.locator('#tz4-adoption-modal.active .chamber-close').click();
    await page.waitForFunction(() => !document.querySelector('#tz4-adoption-modal')?.classList.contains('active'), null, { timeout: 5000 });

    await context.close();
    }

    if (section === 'all' || section === 'quiet') {
    const { smokeGovernancePeriods } = await import('../lib/governance-period-smoke.mjs');
    await smokeGovernancePeriods(browser, baseUrl, { installFeatureMocks });
    const quietContext = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(quietContext, { etherlinkNullProposal: true, governanceNoProposal: true, lbNoVoteChanges: true });
    await quietContext.addInitScript(() => {
      localStorage.setItem('tezos-systems-theme', 'matrix');
      localStorage.setItem('tezos-systems-stats-visible', 'true');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    });
    const quietPage = await quietContext.newPage();
    attachIssueCollectors(quietPage, 'quiet governance sizing', issues);
    const quietResponse = await quietPage.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
    assert(quietResponse?.ok(), `quiet governance sizing: dashboard failed with HTTP ${quietResponse?.status()}`);
    await quietPage.waitForFunction(() => Boolean(window.tezosSystemsChamberCategories), null, { timeout: 15000 });
    await quietPage.locator('#chambers-grid > .chamber-category[data-chamber-category="governance"] .chamber-category-toggle').click();
    for (const [selector, readyKey] of [
      ['#chamber-entry-card', 'chamberEntrySize'],
      ['#etherlink-governance-entry-card', 'etherlinkGovernanceSize'],
      ['#lb-entry-card', 'lbLive']
    ]) {
      const card = quietPage.locator(selector);
      try {
        await quietPage.waitForFunction(({ cardSelector, readyDatasetKey }) => {
          const card = document.querySelector(cardSelector);
          if (!card?.isConnected) return false;
          card.scrollIntoView({ block: 'center', inline: 'nearest' });
          if (!card.dataset[readyDatasetKey]) {
            card.dispatchEvent(new PointerEvent('pointerenter'));
          }
          return Boolean(card?.dataset[readyDatasetKey]);
        }, { cardSelector: selector, readyDatasetKey: readyKey }, { timeout: 30000 });
      } catch (error) {
        const readiness = await quietPage.evaluate(({ cardSelector, readyDatasetKey }) => {
          const card = document.querySelector(cardSelector);
          const category = document.querySelector('#chambers-grid > .chamber-category[data-chamber-category="governance"]');
          return {
            cardPresent: Boolean(card),
            readyValue: card?.dataset?.[readyDatasetKey] || '',
            lazyWired: card?.dataset?.lazyChamberWired || '',
            categoryOpen: category?.dataset?.chamberCategoryOpen || '',
            categoryExpanded: category?.querySelector('.chamber-category-toggle')?.getAttribute('aria-expanded') || '',
            bodyTheme: document.body?.dataset?.theme || ''
          };
        }, { cardSelector: selector, readyDatasetKey: readyKey });
        throw new Error(`governance testing period: ${selector} did not become lazy-ready ${JSON.stringify(readiness)}\n${error.message}`);
      }
      await card.hover();
    }
    await quietPage.locator('#chamber-entry-card[data-chamber-entry-size="wide"]').waitFor({ state: 'visible', timeout: 10000 });
    await quietPage.locator('#etherlink-governance-entry-card[data-etherlink-governance-size="compact"]').waitFor({ state: 'visible', timeout: 10000 });
    await quietPage.locator('#lb-entry-switcher-strip[data-lb-sample-blocks="2500"][data-lb-switcher-count="0"]').waitFor({ state: 'visible', timeout: 10000 });
    const quietSizing = await quietPage.evaluate(() => {
      const chamber = document.querySelector('#chamber-entry-card');
      const etherlink = document.querySelector('#etherlink-governance-entry-card');
      const chamberRect = chamber?.getBoundingClientRect();
      const etherlinkRect = etherlink?.getBoundingClientRect();
      return {
        chamberWide: chamber?.classList.contains('chamber-entry-wide') || false,
        chamberSize: chamber?.dataset.chamberEntrySize || '',
        chamberText: chamber?.textContent || '',
        chamberHero: chamber?.querySelector('#chamber-entry-hero span')?.textContent?.trim() || '',
        chamberDescription: chamber?.querySelector('.stat-description')?.textContent?.trim() || '',
        chamberMini: chamber?.querySelector('#chamber-entry-mini')?.textContent?.trim() || '',
        chamberMetrics: chamber?.querySelector('#chamber-entry-metrics')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        chamberMetricsHidden: chamber?.querySelector('#chamber-entry-metrics')?.hidden ?? true,
        governanceAlertHidden: document.querySelector('#governance-alert-strip')?.hidden ?? false,
        governanceAlertText: document.querySelector('#governance-alert-strip')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        etherlinkWide: etherlink?.classList.contains('chamber-entry-wide') || false,
        etherlinkSize: etherlink?.dataset.etherlinkGovernanceSize || '',
        etherlinkText: etherlink?.textContent || '',
        etherlinkMetricsHidden: document.querySelector('#etherlink-governance-entry-metrics')?.hidden ?? false,
        chamberWidth: chamberRect?.width || 0,
        etherlinkWidth: etherlinkRect?.width || 0,
        lbWidth: document.querySelector('#lb-entry-card')?.getBoundingClientRect().width || 0,
        lbSwitcherText: document.querySelector('#lb-entry-switcher-strip')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        categoryOrder: Array.from(
          chamber?.closest('.chamber-category')?.querySelectorAll(':scope > .chamber-category-cards > .stat-card') || []
        ).map((card) => card.id || card.dataset.stat || ''),
        etherlinkGeometry: (() => {
          const cue = etherlink?.querySelector('.chamber-expand-cue');
          const sequencer = [...(etherlink?.querySelectorAll('.etherlink-gov-entry-metric') || [])]
            .find((node) => /SEQUENCER/.test(node.textContent || ''));
          const rect = (node) => {
            if (!node) return null;
            const box = node.getBoundingClientRect();
            return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
          };
          const cueRect = rect(cue);
          const sequencerRect = rect(sequencer);
          const overlap = cueRect && sequencerRect
            ? Math.max(0, Math.min(cueRect.right, sequencerRect.right) - Math.max(cueRect.left, sequencerRect.left))
              * Math.max(0, Math.min(cueRect.bottom, sequencerRect.bottom) - Math.max(cueRect.top, sequencerRect.top))
            : 0;
          return { cueRect, sequencerRect, overlap };
        })()
      };
    });
    assert(quietSizing.chamberWide && quietSizing.chamberSize === 'wide', `quiet governance sizing: Tezos L1 Governance should keep the quiet period context visible, saw ${JSON.stringify(quietSizing)}`);
    assert(quietSizing.chamberHero === 'No Proposal', `quiet governance sizing: Tezos L1 Governance should lead with No Proposal, saw ${quietSizing.chamberHero}`);
    assert(quietSizing.chamberDescription === 'L1 · Proposal period', `quiet governance sizing: Tezos L1 Governance phase context mismatch: ${quietSizing.chamberDescription}`);
    assert(quietSizing.chamberMini === 'No active L1 proposal · refresh 60s', `quiet governance sizing: Tezos L1 Governance quiet status mismatch: ${quietSizing.chamberMini}`);
    assert(
      !quietSizing.chamberMetricsHidden
        && /Period ends/.test(quietSizing.chamberMetrics)
        && /Candidates None/.test(quietSizing.chamberMetrics)
        && /Ballots Not open/.test(quietSizing.chamberMetrics)
        && /Next Proposal window/.test(quietSizing.chamberMetrics),
      `quiet governance sizing: Tezos L1 Governance quiet period facts are incomplete: ${quietSizing.chamberMetrics}`
    );
    assert(quietSizing.governanceAlertHidden && !/needs attention|current proposal/i.test(quietSizing.governanceAlertText), `quiet governance sizing: empty Proposal period should not render governance alert, saw ${quietSizing.governanceAlertText}`);
    assert(!quietSizing.etherlinkWide && quietSizing.etherlinkSize === 'compact', `quiet governance sizing: Tezos X Governance should keep compact content, saw ${JSON.stringify(quietSizing)}`);
    assert(/No Proposal/.test(quietSizing.etherlinkText) && /No active L2 governance proposal/.test(quietSizing.etherlinkText) && /FAST/.test(quietSizing.etherlinkText), `quiet governance sizing: Etherlink idle text mismatch: ${quietSizing.etherlinkText}`);
    assert(!quietSizing.etherlinkMetricsHidden, 'quiet governance sizing: Etherlink metrics should show compact status chips when all tracks are quiet');
    assert(
      quietSizing.categoryOrder.join(',') === 'chamber-entry-card,etherlink-governance-entry-card,lb-entry-card'
        && Math.abs(quietSizing.chamberWidth - quietSizing.etherlinkWidth) <= 2
        && quietSizing.lbWidth > quietSizing.chamberWidth * 1.9
        && quietSizing.lbWidth < quietSizing.chamberWidth * 2.1,
      `quiet governance sizing: L1 and L2 should share a row while the data-rich LB monitor owns the next row, saw ${JSON.stringify(quietSizing)}`
    );
    assert(quietSizing.etherlinkGeometry.overlap === 0, `quiet governance sizing: Tezos X Governance open cue overlaps Sequencer chip: ${JSON.stringify(quietSizing.etherlinkGeometry)}`);
    assert(/No vote changes in this 2,500-block · .* sample/.test(quietSizing.lbSwitcherText), `quiet governance sizing: zero-switch LB sample must remain bounded and explicit, saw ${quietSizing.lbSwitcherText}`);
    await quietPage.locator('#chamber-entry-card .chamber-expand-cue').click();
    await quietPage.locator('#chamber-modal.active').waitFor({ state: 'visible', timeout: 10000 });
    await quietPage.waitForFunction(() => /No proposals submitted yet/.test(document.querySelector('#chamber-modal .chamber-body')?.textContent || ''), null, { timeout: 15000 });
    const quietChamberText = await quietPage.locator('#chamber-modal .chamber-body').textContent();
    assert(/No proposals submitted yet/.test(quietChamberText || '') && /waiting for the first submission/.test(quietChamberText || '') && /Prior epoch proposals remain available below as historical receipts/.test(quietChamberText || ''), `quiet governance sizing: empty live proposal window borrowed stale proposal lore ${quietChamberText}`);
    await quietContext.close();
    }

    assert(issues.length === 0, `governance testing period browser issues:\n${issues.join('\n')}`);
    log(`ok - governance testing period ${section} smoke`);
  }

  async function smokeTezlinkChamber(browser, baseUrl) {
    const issues = [];
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      serviceWorkers: 'block'
    });
    await context.grantPermissions(['clipboard-write'], { origin: baseUrl });
    await installFeatureMocks(context);
    await context.addInitScript(() => {
      localStorage.setItem('tezos-systems-theme', 'matrix');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    });
    const page = await context.newPage();
    attachIssueCollectors(page, 'tezlink chamber', issues);

    const response = await page.goto(`${baseUrl}/#tezosx`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `tezlink chamber: dashboard failed with HTTP ${response?.status()}`);
    await page.locator('#tezlink-entry-card.chamber-entry-wide').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('#tezlink-modal.active .tezlink-content').waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForFunction(() => document.querySelectorAll('#tezlink-modal .tezlink-protocol-row').length >= 2, null, { timeout: 10000 });
    await page.waitForFunction(() => document.querySelectorAll('#tezlink-modal .tezlink-tx-row').length >= 2, null, { timeout: 10000 });

    const tezlinkState = await page.evaluate(() => {
      const card = document.querySelector('#tezlink-entry-card');
      const modal = document.querySelector('#tezlink-modal');
      return {
        cardWide: card?.classList.contains('chamber-entry-wide') || false,
        cardCopyHash: card?.querySelector('.card-copy-link')?.dataset.copyHash || '',
        cardUpdatedLabel: card?.dataset.updatedLabel || '',
        cardValue: card?.querySelector('#tezlink-entry-tvl')?.textContent?.trim() || '',
        cardDescription: card?.querySelector('#tezlink-entry-description')?.textContent?.trim() || '',
        cardMini: card?.querySelector('#tezlink-entry-mini')?.textContent?.trim() || '',
        cardTape: card?.querySelector('#tezlink-entry-tape')?.textContent || '',
        cardRole: card?.getAttribute('role') || '',
        cardTabIndex: card?.getAttribute('tabindex'),
        openTag: card?.querySelector('.chamber-expand-cue')?.tagName || '',
        openLabel: card?.querySelector('.chamber-expand-cue')?.getAttribute('aria-label') || '',
        title: modal?.querySelector('.chamber-title')?.textContent || '',
        dialogRole: modal?.querySelector('.tezlink-content')?.getAttribute('role') || '',
        dialogModal: modal?.querySelector('.tezlink-content')?.getAttribute('aria-modal') || '',
        dialogLabelledBy: modal?.querySelector('.tezlink-content')?.getAttribute('aria-labelledby') || '',
        focusInsideDialog: Boolean(modal?.querySelector('.tezlink-content')?.contains(document.activeElement)),
        badge: modal?.querySelector('.chamber-badge')?.textContent || '',
        proposalInfo: modal?.querySelector('.chamber-proposal-info')?.textContent || '',
        facts: modal?.querySelector('.tezlink-explainer')?.textContent || '',
        protocolRows: modal?.querySelectorAll('.tezlink-protocol-row').length || 0,
        protocolText: modal?.querySelector('.tezlink-protocol-table')?.textContent || '',
        txRows: modal?.querySelectorAll('.tezlink-tx-row').length || 0,
        txText: modal?.querySelector('.tezlink-tx-table')?.textContent || '',
        trendText: modal?.querySelector('#tezlink-trend-panel')?.textContent || '',
        trendMetricValues: Array.from(modal?.querySelectorAll('#tezlink-trend-panel .lb-metric-grid strong') || []).map((el) => el.textContent?.trim() || ''),
        anchorText: modal?.querySelector('#tezlink-anchor-panel')?.textContent || '',
        gasText: modal?.querySelector('#tezlink-gas-oracle')?.textContent || '',
        tokenRows: modal?.querySelectorAll('#tezlink-token-panel .lb-table-row').length || 0,
        tokenText: modal?.querySelector('#tezlink-token-panel')?.textContent || '',
        sparklinePoints: modal?.querySelector('#tezlink-trend-panel .tezlink-mini-sparkline polyline')?.getAttribute('points')?.trim().split(/\s+/).length || 0,
        footer: modal?.querySelector('.chamber-footer')?.textContent || '',
        directHref: modal?.querySelector('.panel-direct-link')?.getAttribute('href') || '',
        sourceLinks: modal?.querySelectorAll('a[href*="defillama.com"], a[href*="explorer.etherlink.com"]').length || 0
      };
    });

    assert(tezlinkState.cardWide, 'tezlink chamber: card should be double-width');
    assert(tezlinkState.cardCopyHash === '#tezosx', `tezlink chamber: card copy hash mismatch: ${tezlinkState.cardCopyHash}`);
    assert(/^Tezos X sources · /.test(tezlinkState.cardUpdatedLabel), `tezlink chamber: freshness stamp mismatch: ${tezlinkState.cardUpdatedLabel}`);
    assert(/\$18\.1M/.test(tezlinkState.cardValue), `tezlink chamber: card TVL mismatch: ${tezlinkState.cardValue}`);
    assert(/Atomic L2/.test(tezlinkState.cardDescription) && /TVL [+-]\d+\.\d% \/ 30d|TVL tracking/.test(tezlinkState.cardDescription), `tezlink chamber: card description should keep TVL with the trend copy: ${tezlinkState.cardDescription}`);
    assert(!/\bTVL$/.test(tezlinkState.cardDescription), `tezlink chamber: card description should not leave TVL as a trailing orphan: ${tezlinkState.cardDescription}`);
    assert(/Head|live L2 feed/i.test(tezlinkState.cardMini), `tezlink chamber: card mini mismatch: ${tezlinkState.cardMini}`);
    assert(/credit|swap/.test(tezlinkState.cardTape), `tezlink chamber: card transaction tape missing: ${tezlinkState.cardTape}`);
    assert(tezlinkState.cardRole === 'article' && tezlinkState.cardTabIndex === null, `tezlink chamber: entry card must be a non-focusable article: ${JSON.stringify(tezlinkState)}`);
    assert(tezlinkState.openTag === 'BUTTON' && /Open Tezos X Chamber/.test(tezlinkState.openLabel), `tezlink chamber: explicit Open button missing: ${JSON.stringify(tezlinkState)}`);
    assert(/Tezos X Chamber/.test(tezlinkState.title), `tezlink chamber: title mismatch: ${tezlinkState.title}`);
    assert(tezlinkState.dialogRole === 'dialog' && tezlinkState.dialogModal === 'true' && tezlinkState.dialogLabelledBy === 'tezlink-title' && tezlinkState.focusInsideDialog, `tezlink chamber: modal semantics or initial focus missing: ${JSON.stringify(tezlinkState)}`);
    assert(/Live L2/.test(tezlinkState.badge), `tezlink chamber: badge mismatch: ${tezlinkState.badge}`);
    assert(/\$18\.1M/.test(tezlinkState.proposalInfo), `tezlink chamber: header TVL missing: ${tezlinkState.proposalInfo}`);
    assert(/Atomic L2|atomic L2/i.test(tezlinkState.facts), `tezlink chamber: explainer missing atomic L2 context: ${tezlinkState.facts}`);
    assert(tezlinkState.protocolRows >= 2, `tezlink chamber: protocol rows missing, saw ${tezlinkState.protocolRows}`);
    assert(/Curve DEX/.test(tezlinkState.protocolText), `tezlink chamber: protocol TVL missing Curve DEX: ${tezlinkState.protocolText}`);
    assert(tezlinkState.txRows >= 2, `tezlink chamber: transaction rows missing, saw ${tezlinkState.txRows}`);
    assert(/Bankroll|Smoke DEX/.test(tezlinkState.txText), `tezlink chamber: transaction tape target missing: ${tezlinkState.txText}`);
    assert(/30d Direction/.test(tezlinkState.trendText) && /TVL/.test(tezlinkState.trendText) && tezlinkState.sparklinePoints >= 20, `tezlink chamber: trend panel missing: ${tezlinkState.trendText}`);
    assert(/Active accounts/.test(tezlinkState.trendText) && !/total addresses/i.test(tezlinkState.trendText), `tezlink chamber: active-account direction must not fall back to a lifetime total ${tezlinkState.trendText}`);
    assert(tezlinkState.trendMetricValues.length === 3 && tezlinkState.trendMetricValues.every((value) => value && value !== '--'), `tezlink chamber: 30d direction cells should not render empty dash placeholders: ${tezlinkState.trendMetricValues.join(', ')}`);
    assert(/L1 Anchor/.test(tezlinkState.anchorText) && /sr1Smok/.test(tezlinkState.anchorText), `tezlink chamber: anchor panel missing rollup: ${tezlinkState.anchorText}`);
    assert(/Gas Oracle/.test(tezlinkState.gasText) && /Average/.test(tezlinkState.gasText) && /21,000-gas transfer.*XTZ/.test(tezlinkState.gasText) && !/gas units/.test(tezlinkState.gasText), `tezlink chamber: gas oracle estimate is unclear ${tezlinkState.gasText}`);
    assert(tezlinkState.tokenRows >= 3 && /USDC\.e|WXTZ/.test(tezlinkState.tokenText), `tezlink chamber: token holder panel missing: ${tezlinkState.tokenText}`);
    assert(/Direct: \/tezosx\//.test(tezlinkState.footer), `tezlink chamber: direct footer missing: ${tezlinkState.footer}`);
    assert(tezlinkState.directHref === '/tezosx/', `tezlink chamber: direct href mismatch: ${tezlinkState.directHref}`);
    assert(tezlinkState.sourceLinks >= 2, `tezlink chamber: source links missing, saw ${tezlinkState.sourceLinks}`);

    await page.locator('#tezlink-modal.active .chamber-close').click();
    await page.waitForFunction(() => !document.querySelector('#tezlink-modal')?.classList.contains('active'), null, { timeout: 5000 });

    const openButton = page.locator('#tezlink-entry-card .chamber-expand-cue');
    await openButton.focus();
    await openButton.click();
    await page.locator('#tezlink-modal.active .tezlink-content').waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForFunction(() => document.querySelector('#tezlink-refresh-state')?.textContent?.startsWith('auto-refresh'), null, { timeout: 10000 });
    await page.evaluate(() => {
      const dialog = document.querySelector('#tezlink-modal.active .tezlink-content');
      const focusable = Array.from(dialog?.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])') || [])
        .filter((element) => element.getClientRects().length > 0);
      focusable.at(-1)?.focus();
    });
    await page.keyboard.press('Tab');
    assert(await page.evaluate(() => document.activeElement === document.querySelector('#tezlink-modal.active .chamber-close')), 'tezlink chamber: Tab did not wrap from the last control to the close button');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#tezlink-modal')?.classList.contains('active'), null, { timeout: 5000 });
    await page.waitForFunction(() => document.activeElement === document.querySelector('#tezlink-entry-card .chamber-expand-cue'), null, { timeout: 5000 });
    assert(await page.evaluate(() => document.activeElement === document.querySelector('#tezlink-entry-card .chamber-expand-cue')), 'tezlink chamber: Escape did not restore focus to the Open button');

    await context.close();
    assert(issues.length === 0, `tezlink chamber browser issues:\n${issues.join('\n')}`);
    log('ok - tezlink chamber smoke');
  }

  async function smokeCtezChamber(browser, baseUrl) {
    const issues = [];
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(context);
    await installOctezConnectMock(context);
    await context.addInitScript(() => {
      localStorage.setItem('tezos-systems-theme', 'matrix');
      localStorage.setItem('tezos-systems-stats-visible', 'true');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    });
    const page = await context.newPage();
    attachIssueCollectors(page, 'ctez chamber', issues);

    const response = await page.goto(`${baseUrl}/#ctez`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `ctez chamber: dashboard failed with HTTP ${response?.status()}`);
    await page.locator('#ctez-modal.active .ctez-content').waitFor({ state: 'visible', timeout: 10000 });

    const ctezState = await page.evaluate(() => {
      const modal = document.querySelector('#ctez-modal');
      const text = modal?.textContent || '';
      const bcdLinks = Array.from(modal?.querySelectorAll('a[href^="https://better-call.dev/mainnet/"]') || []).map((link) => link.href);
      return {
        title: modal?.querySelector('.chamber-title')?.textContent || '',
        badge: modal?.querySelector('.chamber-badge')?.textContent || '',
        text,
        hasConsoleShell: Boolean(modal?.querySelector('.ctez-console-shell')),
        hasSunsetBanner: Boolean(modal?.querySelector('.ctez-sunset-banner')),
        hasSummaryStrip: Boolean(modal?.querySelector('#ctez-summary-strip')),
        hasConnectControl: Boolean(modal?.querySelector('.ctez-console-toolbar #ctez-wallet-connect')),
        hasCloseControl: Boolean(modal?.querySelector('#ctez-wallet-close')),
        hasOvenPanel: Boolean(modal?.querySelector('.ctez-oven-panel #ctez-oven-list')),
        hasRefresh: Boolean(modal?.querySelector('#ctez-wallet-refresh')),
        hasReadonlyScan: Boolean(modal?.querySelector('#ctez-readonly-scan #ctez-readonly-address')),
        initialSummary: modal?.querySelector('#ctez-summary-strip')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        manualFields: Boolean(modal?.querySelector('#ctez-wallet-oven-id, #ctez-tez-input, #ctez-outstanding-input, #ctez-wallet-withdraw-to, #ctez-wallet-withdraw-amount, .ctez-action-card, .ctez-guide-grid, .ctez-exit-workspace')),
        bcdLinks,
        communityLinks: Array.from(modal?.querySelectorAll('a[href*="purplematter.com/ctez-tool"], a[href*="x.com/webidente"]') || []).length,
        directHref: modal?.querySelector('a[aria-label="Direct link to ctez End of Life"]')?.getAttribute('href') || '',
        footer: modal?.querySelector('.chamber-footer')?.textContent || '',
        hasDefaultCard: Boolean(document.querySelector('#ctez-entry-card')),
        hasTopLeftLauncher: Boolean(document.querySelector('#ctez-launcher')),
        hasTzSafeTopLeftLauncher: Boolean(document.querySelector('#tzsafe-launcher[href="https://tzsafe.tez.page/"]')),
        featureButtonText: document.querySelector('#ctez-feature-btn')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        tzsafeFeatureText: document.querySelector('#tzsafe-feature-link')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        tzsafeFeatureHref: document.querySelector('#tzsafe-feature-link')?.getAttribute('href') || '',
        featureCopyHash: document.querySelector('#features-dropdown .feature-copy-link[data-copy-hash="#ctez"]')?.dataset.copyHash || '',
        chambersHint: document.querySelector('#chambers-toggle .dropdown-hint')?.textContent?.trim() || ''
      };
    });

    assert(/ctez End of Life/.test(ctezState.title), `ctez chamber: title mismatch: ${ctezState.title}`);
    assert(/Oven recovery/.test(ctezState.badge), `ctez chamber: badge mismatch: ${ctezState.badge}`);
    assert(ctezState.hasConsoleShell && ctezState.hasSunsetBanner && ctezState.hasSummaryStrip && ctezState.hasConnectControl && ctezState.hasCloseControl && ctezState.hasOvenPanel && ctezState.hasRefresh && ctezState.hasReadonlyScan, `ctez chamber: console shell missing: ${JSON.stringify(ctezState)}`);
    assert(/Total balance —/.test(ctezState.initialSummary) && /Ovens found —/.test(ctezState.initialSummary), `ctez chamber: pre-scan summary must not present hard zeroes ${ctezState.initialSummary}`);
    assert(!ctezState.manualFields, `ctez chamber: manual/guide controls should not render: ${JSON.stringify(ctezState)}`);
    assert(ctezState.bcdLinks.length === 0, `ctez chamber: Better Call Dev links should not render: ${ctezState.bcdLinks.join(', ')}`);
    assert(!/Better Call Dev|ctez_outstanding|tez_balance|oven ID/i.test(ctezState.text), `ctez chamber: raw recovery instructions leaked into UI: ${ctezState.text}`);
    assert(ctezState.communityLinks >= 2 && /Purple Matter tool/.test(ctezState.footer) && /@webidente/.test(ctezState.footer), `ctez chamber: community reference links missing: ${JSON.stringify(ctezState)}`);
    assert(/KT1GWnsoFZVHGh7roXEER3qeCcgJgrXT3de2/.test(ctezState.text), 'ctez chamber: contract address missing');
    assert(/Close old ovens and recover remaining tez/.test(ctezState.text), `ctez chamber: recovery console header missing: ${ctezState.text}`);
    assert(/Ctez is sunsetting, please close your ovens/.test(ctezState.text), `ctez chamber: sunset banner missing: ${ctezState.text}`);
    assert(/Never share your seed phrase/.test(ctezState.text), 'ctez chamber: safety copy missing');
    assert(/Direct: \/ctez\//.test(ctezState.footer), `ctez chamber: direct footer missing: ${ctezState.footer}`);
    assert(ctezState.directHref === '/ctez/', `ctez chamber: direct href mismatch: ${ctezState.directHref}`);
    assert(!ctezState.hasDefaultCard, `ctez chamber: should be off by default in Chambers: ${JSON.stringify(ctezState)}`);
    assert(ctezState.hasTopLeftLauncher, `ctez chamber: top-left launcher missing: ${JSON.stringify(ctezState)}`);
    assert(ctezState.hasTzSafeTopLeftLauncher, `TzSafe external launcher missing from gift tray: ${JSON.stringify(ctezState)}`);
    assert(ctezState.tzsafeFeatureHref === 'https://tzsafe.tez.page/', `TzSafe feature href mismatch: ${ctezState.tzsafeFeatureHref}`);
    assert(/KT1 Multisig Recovery/.test(ctezState.tzsafeFeatureText) && /legacy TzSafe KT1 safes/.test(ctezState.tzsafeFeatureText), `TzSafe feature copy mismatch: ${ctezState.tzsafeFeatureText}`);
    assert(ctezState.featureCopyHash === '#ctez', `ctez chamber: feature copy hash mismatch: ${ctezState.featureCopyHash}`);
    assert(/ctez Oven Exit/.test(ctezState.featureButtonText) && /old ovens/.test(ctezState.featureButtonText), `ctez chamber: feature launcher copy mismatch: ${ctezState.featureButtonText}`);
    assert(!/ctez/i.test(ctezState.chambersHint), `ctez chamber: Chambers hint should not advertise ctez as default: ${ctezState.chambersHint}`);

    await page.locator('#ctez-modal.active .chamber-close').click();
    await page.waitForFunction(() => !document.querySelector('#ctez-modal')?.classList.contains('active'), null, { timeout: 5000 });
    await page.locator('#corner-gift-toggle').click();
    await page.waitForFunction(() => document.querySelector('#corner-gift-tray')?.classList.contains('open'), null, { timeout: 5000 });
    await page.locator('#ctez-launcher').click();
    await page.locator('#ctez-modal.active .ctez-content').waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('#ctez-modal.active .chamber-close').click();
    await page.waitForFunction(() => !document.querySelector('#ctez-modal')?.classList.contains('active'), null, { timeout: 5000 });
    await ensureDropdownOpen(page, '#features-gear', '#features-dropdown');
    await page.locator('#features-dropdown .feature-launcher-legacy-summary').click();
    const featureMenuBefore = await page.evaluate(() => ({
      open: document.getElementById('features-dropdown')?.classList.contains('open') || false,
      expanded: document.getElementById('features-gear')?.getAttribute('aria-expanded') || ''
    }));
    assert(featureMenuBefore.open && featureMenuBefore.expanded === 'true', `ctez chamber: Explore menu did not begin open ${JSON.stringify(featureMenuBefore)}`);
    await page.locator('#ctez-feature-btn').click();
    await page.locator('#ctez-modal.active .ctez-content').waitFor({ state: 'visible', timeout: 5000 });
    const featureMenuAfter = await page.evaluate(() => ({
      open: document.getElementById('features-dropdown')?.classList.contains('open') || false,
      expanded: document.getElementById('features-gear')?.getAttribute('aria-expanded') || '',
      activeCtezSurfaces: document.querySelectorAll('#ctez-modal.active').length
    }));
    assert(
      !featureMenuAfter.open && featureMenuAfter.expanded === 'false' && featureMenuAfter.activeCtezSurfaces === 1,
      `ctez chamber: Explore launcher did not close its menu or opened duplicate surfaces ${JSON.stringify(featureMenuAfter)}`
    );

    await page.locator('#ctez-readonly-address').fill(SAMPLE_ADDRESS);
    await page.locator('#ctez-readonly-scan button[type="submit"]').click();
    await page.waitForFunction(() => document.querySelectorAll('#ctez-oven-list .ctez-oven-card').length >= 2, null, { timeout: 5000 });
    const readonlyState = await page.evaluate(() => ({
      walletAddress: localStorage.getItem('tezos-systems-octez-wallet-address') || '',
      status: document.querySelector('#ctez-oven-status')?.textContent || '',
      closeDisabled: document.querySelector('#ctez-wallet-close')?.disabled ?? false,
      closeText: document.querySelector('#ctez-wallet-close')?.textContent?.trim() || '',
      badge: document.querySelector('#ctez-selected-badge')?.textContent?.trim() || ''
    }));
    assert(!readonlyState.walletAddress && /read-only mode/.test(readonlyState.status), `ctez read-only scan should not mutate wallet state ${JSON.stringify(readonlyState)}`);
    assert(readonlyState.closeDisabled && /Connect matching wallet/.test(readonlyState.closeText) && readonlyState.badge === 'Read-only scan', `ctez read-only scan must keep close actions disabled ${JSON.stringify(readonlyState)}`);

    await page.locator('#ctez-wallet-connect').click();
    await page.waitForFunction((address) => localStorage.getItem('tezos-systems-octez-wallet-address') === address, SAMPLE_ADDRESS, { timeout: 5000 });
    await page.waitForFunction(() => document.querySelectorAll('#ctez-oven-list .ctez-oven-card').length >= 2, null, { timeout: 5000 });
    const walletConnectState = await page.evaluate(() => ({
      status: document.querySelector('#ctez-wallet-status')?.textContent || '',
      ovenStatus: document.querySelector('#ctez-oven-status')?.textContent || '',
      summaryStrip: document.querySelector('#ctez-summary-strip')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      ovenCards: Array.from(document.querySelectorAll('#ctez-oven-list .ctez-oven-card')).map((card) => card.textContent.replace(/\s+/g, ' ').trim()),
      selectedSummary: document.querySelector('#ctez-selected-summary')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      savedMyTezos: localStorage.getItem('tezos-systems-my-baker-address') || '',
      closeDisabled: document.querySelector('#ctez-wallet-close')?.disabled ?? true,
      closeText: document.querySelector('#ctez-wallet-close')?.textContent?.trim() || '',
      review: document.querySelector('#ctez-wallet-review')?.textContent?.replace(/\s+/g, ' ').trim() || ''
    }));
    assert(walletConnectState.status.includes('Wallet tz1aWX…T1Z9'), `ctez wallet: status mismatch ${JSON.stringify(walletConnectState)}`);
    assert(walletConnectState.savedMyTezos === SAMPLE_ADDRESS, `ctez wallet: should sync My Tezos address ${JSON.stringify(walletConnectState)}`);
    assert(/2 ctez ovens found/.test(walletConnectState.ovenStatus), `ctez wallet: oven status mismatch ${JSON.stringify(walletConnectState)}`);
    assert(/Oven Summary/.test(walletConnectState.summaryStrip) && /Total balance 7\.530864 tez/.test(walletConnectState.summaryStrip) && /0\.123456 ctez/.test(walletConnectState.summaryStrip) && /Potential recovery 7\.530864 tez/.test(walletConnectState.summaryStrip) && /Ovens found 2/.test(walletConnectState.summaryStrip), `ctez wallet: oven summary mismatch ${JSON.stringify(walletConnectState)}`);
    assert(walletConnectState.ovenCards.length === 2 && /ID/.test(walletConnectState.ovenCards[0]) && /Oven address/.test(walletConnectState.ovenCards[0]) && /6\.54321 tez/.test(walletConnectState.ovenCards[0]) && /0\.987654 tez/.test(walletConnectState.ovenCards[1]), `ctez wallet: detected oven rows mismatch ${JSON.stringify(walletConnectState)}`);
    assert(/Oven Stats/.test(walletConnectState.selectedSummary) && /Collateral Overview/.test(walletConnectState.selectedSummary) && /Mintable Overview/.test(walletConnectState.selectedSummary) && /Close Plan/.test(walletConnectState.selectedSummary) && /Owner/.test(walletConnectState.selectedSummary) && /0\.123456 ctez/.test(walletConnectState.selectedSummary) && /Raw burn quantity -123456/.test(walletConnectState.selectedSummary) && /Raw withdraw amount 6543210/.test(walletConnectState.selectedSummary), `ctez wallet: selected debt summary mismatch ${JSON.stringify(walletConnectState)}`);
    assert(!walletConnectState.closeDisabled && /one wallet batch/i.test(walletConnectState.closeText) && /burn 0\.123456 ctez, then withdraw 6\.54321 tez/.test(walletConnectState.review), `ctez wallet: debt oven should enable one-batch close ${JSON.stringify(walletConnectState)}`);

    await page.locator('#ctez-wallet-close').click();
    await page.waitForFunction(() => window.__octezConnectRequests?.length >= 1, null, { timeout: 5000 });

    await page.locator('#ctez-oven-list .ctez-oven-card[data-oven-index="1"]').click();
    await page.waitForFunction(() => {
      const close = document.querySelector('#ctez-wallet-close');
      return close?.disabled === false && /Withdraw tez/.test(close.textContent || '');
    }, null, { timeout: 5000 });
    await page.locator('#ctez-wallet-close').click();
    await page.waitForFunction(() => window.__octezConnectRequests?.length >= 2, null, { timeout: 5000 });

    const walletRequests = await page.evaluate(() => window.__octezConnectRequests);
    const burnDetail = walletRequests[0]?.operationDetails?.[0] || {};
    const firstWithdrawDetail = walletRequests[0]?.operationDetails?.[1] || {};
    const secondWithdrawDetail = walletRequests[1]?.operationDetails?.[0] || {};
    assert(walletRequests[0]?.operationDetails?.length === 2, `ctez wallet: debt oven close should submit a two-leg batch ${JSON.stringify(walletRequests[0])}`);
    assert(burnDetail.kind === 'transaction', `ctez wallet: burn kind mismatch ${JSON.stringify(burnDetail)}`);
    assert(burnDetail.destination === 'KT1GWnsoFZVHGh7roXEER3qeCcgJgrXT3de2', `ctez wallet: burn destination mismatch ${JSON.stringify(burnDetail)}`);
    assert(burnDetail.parameters?.entrypoint === 'mint_or_burn', `ctez wallet: burn entrypoint mismatch ${JSON.stringify(burnDetail)}`);
    assert(JSON.stringify(burnDetail.parameters?.value) === JSON.stringify({
      prim: 'Pair',
      args: [{ int: '42' }, { int: '-123456' }]
    }), `ctez wallet: burn Micheline mismatch ${JSON.stringify(burnDetail.parameters?.value)}`);
    assert(firstWithdrawDetail.kind === 'transaction', `ctez wallet: first withdraw kind mismatch ${JSON.stringify(firstWithdrawDetail)}`);
    assert(firstWithdrawDetail.parameters?.entrypoint === 'withdraw', `ctez wallet: first withdraw entrypoint mismatch ${JSON.stringify(firstWithdrawDetail)}`);
    assert(JSON.stringify(firstWithdrawDetail.parameters?.value) === JSON.stringify({
      prim: 'Pair',
      args: [
        { int: '42' },
        { prim: 'Pair', args: [{ int: '6543210' }, { string: SAMPLE_ADDRESS }] }
      ]
    }), `ctez wallet: first withdraw Micheline mismatch ${JSON.stringify(firstWithdrawDetail.parameters?.value)}`);
    assert(walletRequests[1]?.operationDetails?.length === 1, `ctez wallet: ready oven close should submit a one-leg withdraw ${JSON.stringify(walletRequests[1])}`);
    assert(secondWithdrawDetail.kind === 'transaction', `ctez wallet: second withdraw kind mismatch ${JSON.stringify(secondWithdrawDetail)}`);
    assert(secondWithdrawDetail.parameters?.entrypoint === 'withdraw', `ctez wallet: second withdraw entrypoint mismatch ${JSON.stringify(secondWithdrawDetail)}`);
    assert(JSON.stringify(secondWithdrawDetail.parameters?.value) === JSON.stringify({
      prim: 'Pair',
      args: [
        { int: '43' },
        { prim: 'Pair', args: [{ int: '987654' }, { string: SAMPLE_ADDRESS }] }
      ]
    }), `ctez wallet: second withdraw Micheline mismatch ${JSON.stringify(secondWithdrawDetail.parameters?.value)}`);

    await page.locator('#ctez-modal.active .chamber-close').click();
    await page.waitForFunction(() => !document.querySelector('#ctez-modal')?.classList.contains('active'), null, { timeout: 5000 });
    const featureCloseState = await page.evaluate(() => ({
      bodyOverflow: document.body.style.overflow,
      htmlOverflow: document.documentElement.style.overflow
    }));
    assert(
      featureCloseState.bodyOverflow !== 'hidden' && featureCloseState.htmlOverflow !== 'hidden',
      `ctez chamber: feature launcher left a duplicate scroll lock after close ${JSON.stringify(featureCloseState)}`
    );

    await context.close();

    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(mobileContext);
    await mobileContext.addInitScript(() => {
      localStorage.setItem('tezos-systems-theme', 'matrix');
      localStorage.setItem('tezos-systems-stats-visible', 'true');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    });
    const mobilePage = await mobileContext.newPage();
    attachIssueCollectors(mobilePage, 'ctez chamber mobile', issues);
    const mobileResponse = await mobilePage.goto(`${baseUrl}/#ctez`, { waitUntil: 'domcontentloaded' });
    assert(mobileResponse?.ok(), `ctez chamber mobile: dashboard failed with HTTP ${mobileResponse?.status()}`);
    await mobilePage.locator('#ctez-modal.active .ctez-content').waitFor({ state: 'visible', timeout: 10000 });
    const mobileState = await mobilePage.evaluate(() => {
      const modal = document.querySelector('#ctez-modal .ctez-content');
      const box = modal?.getBoundingClientRect();
      const grids = Array.from(document.querySelectorAll('#ctez-modal .ctez-console-shell, #ctez-modal .ctez-console-toolbar, #ctez-modal .ctez-summary-strip, #ctez-modal .ctez-oven-panel, #ctez-modal .ctez-oven-list, #ctez-modal .ctez-action-panel, #ctez-modal .ctez-action-buttons, #ctez-modal .ctez-selected-summary'));
      return {
        modalWidth: box?.width || 0,
        viewportWidth: window.innerWidth,
        pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
        modalOverflow: modal ? modal.scrollWidth - modal.clientWidth : 0,
        gridOverflows: grids.map((grid) => grid.scrollWidth - grid.clientWidth),
        title: document.querySelector('#ctez-modal .chamber-title')?.textContent || '',
        closeVisible: Boolean(document.querySelector('#ctez-modal .chamber-close')?.getBoundingClientRect().width)
      };
    });
    assert(/ctez End of Life/.test(mobileState.title), `ctez chamber mobile: title mismatch: ${mobileState.title}`);
    assert(mobileState.closeVisible, 'ctez chamber mobile: close button should remain visible');
    assert(mobileState.modalWidth <= mobileState.viewportWidth, `ctez chamber mobile: modal wider than viewport: ${JSON.stringify(mobileState)}`);
    assert(mobileState.pageOverflow <= 2 && mobileState.modalOverflow <= 2 && mobileState.gridOverflows.every((value) => value <= 2), `ctez chamber mobile: horizontal overflow: ${JSON.stringify(mobileState)}`);
    await mobileContext.close();

    assert(issues.length === 0, `ctez chamber browser issues:\n${issues.join('\n')}`);
    log('ok - ctez chamber smoke');
  }

  return { smokeGovernanceTestingPeriod, smokeTezlinkChamber, smokeCtezChamber };
}
