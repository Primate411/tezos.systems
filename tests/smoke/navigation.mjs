// Browser workflows owned by navigation. Shared dependencies remain explicit.
export function createNavigationSmokeSuites({
  DEFERRED_CHAMBER_MODULE_PATHS,
  SAMPLE_CONTRACT,
  assert,
  assertNormalizedChamberShell,
  attachIssueCollectors,
  installFeatureMocks,
  log
}) {
  async function smokeRouteSearchState(browser, baseUrl) {
    const issues = [];
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
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
    await page.clock.install();
    page.setDefaultNavigationTimeout(90000);
    attachIssueCollectors(page, 'route and search state', issues);
    const response = await page.goto(`${baseUrl}/?theme=aurora`, { waitUntil: 'commit' });
    assert(response?.ok(), `route and search state: dashboard failed with HTTP ${response?.status()}`);
    await page.locator('#hero-search-input').waitFor({ state: 'visible', timeout: 150000 });
    await page.waitForFunction(() => document.querySelector('#hero-slot')?.dataset.heroSearchWired === '1', null, { timeout: 150000 });

    const input = page.locator('#hero-search-input');
    await input.click();
    await input.fill('frobnicate');
    await page.waitForFunction(() => {
      const panel = document.getElementById('hero-search-panel');
      return document.getElementById('hero-search-input')?.value === 'frobnicate'
        && !panel?.querySelector('.hero-search-status-row')
        && /No matches for/i.test(panel?.textContent || '');
    }, null, { timeout: 10000 });
    const irrelevantSuggestionState = await page.evaluate(() => ({
      href: window.location.href,
      text: document.getElementById('hero-search-panel')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      selectable: document.querySelectorAll('#hero-search-panel [role="option"]').length
    }));
    assert(
      irrelevantSuggestionState.selectable === 0
        && !/Completely Unrelated Baker|TzKT alias/i.test(irrelevantSuggestionState.text),
      `route and search state: unrelated on-chain suggestion remained actionable ${JSON.stringify(irrelevantSuggestionState)}`
    );
    await input.press('Enter');
    assert(await page.evaluate((href) => window.location.href === href, irrelevantSuggestionState.href), 'route and search state: Enter navigated an empty nonsense query');

    const partialSuggestionResponse = page.waitForResponse((candidate) => {
      const url = new URL(candidate.url());
      return url.origin === 'https://api.tzkt.io' && url.pathname.endsWith('/v1/suggest/accounts/govern');
    });
    await input.fill('govern');
    await partialSuggestionResponse;
    const partialShowMore = page.locator('#hero-search-panel .hero-search-result').filter({ hasText: /Show all \d+ results/ });
    if (await partialShowMore.count()) await partialShowMore.click();
    await page.waitForFunction(() => /Governance Baker Alias/.test(document.getElementById('hero-search-panel')?.textContent || ''), null, { timeout: 10000 });
    const partialSuggestionState = await page.evaluate(() => document.getElementById('hero-search-panel')?.textContent || '');
    assert(/Governance Baker Alias/.test(partialSuggestionState) && /TzKT alias/.test(partialSuggestionState), 'route and search state: an intended on-chain alias prefix was filtered out');

    const suffixSuggestionResponse = page.waitForResponse((candidate) => {
      const url = new URL(candidate.url());
      return url.origin === 'https://api.tzkt.io' && url.pathname.endsWith('/v1/suggest/accounts/governancexyz');
    });
    await input.fill('governancexyz');
    await suffixSuggestionResponse;
    await page.waitForFunction(() => !document.querySelector('#hero-search-panel .hero-search-status-row'), null, { timeout: 10000 });
    const suffixSuggestionState = await page.evaluate(() => document.getElementById('hero-search-panel')?.textContent || '');
    assert(!/Governance Baker Alias|TzKT alias/.test(suffixSuggestionState), `route and search state: nonsense alias suffix survived relevance gating (${suffixSuggestionState})`);

    await input.press('Escape');
    await page.waitForFunction(() => !document.body.classList.contains('hero-search-mode') && document.activeElement?.id === 'hero-search-input');
    await page.locator('#header-protocol-chip').focus();
    await page.waitForFunction(() => document.activeElement?.id === 'header-protocol-chip');
    const offscreenScroll = await page.evaluate(() => {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
      return Math.round(window.scrollY);
    });
    await page.keyboard.press('/');
    await page.waitForFunction(() => document.body.classList.contains('hero-search-mode') && document.activeElement?.id === 'hero-search-input');
    await page.keyboard.press('Escape');
    const escapeFocusState = await page.evaluate(() => ({
      active: document.activeElement?.id || document.activeElement?.tagName || '',
      open: document.body.classList.contains('hero-search-mode'),
      scrollY: Math.round(window.scrollY),
      inputBottom: Math.round(document.getElementById('hero-search-input')?.getBoundingClientRect().bottom || 0)
    }));
    assert(
      !escapeFocusState.open
        && escapeFocusState.active !== 'hero-search-input'
        && Math.abs(escapeFocusState.scrollY - offscreenScroll) <= 2
        && escapeFocusState.inputBottom <= 0,
      `route and search state: Escape restored focus to the offscreen hero ${JSON.stringify({ offscreenScroll, escapeFocusState })}`
    );

    await page.keyboard.press('/');
    await page.waitForFunction(() => document.body.classList.contains('hero-search-mode'));
    // The overlay owns one initial-focus frame. Settle that frame before moving
    // focus programmatically so this close-control probe cannot race its opener.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
    await page.locator('#hero-search-close').focus();
    assert(await page.evaluate(() => document.activeElement?.id === 'hero-search-close'), 'route and search state: close control did not receive focus');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.body.classList.contains('hero-search-mode') && document.activeElement?.id !== 'hero-search-close');

    await page.evaluate(() => { window.location.hash = 'search'; });
    await page.waitForFunction(() => window.location.hash === '#search' && document.body.classList.contains('hero-search-mode'));
    await page.goBack();
    await page.waitForFunction(() => !window.location.hash && !document.body.classList.contains('hero-search-mode') && document.activeElement?.id !== 'hero-search-input');

    await page.evaluate(() => {
      window.location.hash = 'search';
      window.setTimeout(() => { window.location.hash = 'health'; }, 25);
    });
    await page.waitForFunction(() => (
      window.location.hash === '#health'
        && document.querySelector('#network-health-modal')?.classList.contains('active')
        && !document.body.classList.contains('hero-search-mode')
    ), null, { timeout: 15000 });
    await page.waitForTimeout(350);
    const pendingSearchRouteState = await page.evaluate(() => ({
      hash: window.location.hash,
      searchOpen: document.body.classList.contains('hero-search-mode'),
      focus: document.activeElement?.id || document.activeElement?.tagName || '',
      healthOpen: Boolean(document.querySelector('#network-health-modal.active'))
    }));
    assert(
      pendingSearchRouteState.hash === '#health'
        && !pendingSearchRouteState.searchOpen
        && pendingSearchRouteState.focus !== 'hero-search-input'
        && pendingSearchRouteState.healthOpen,
      `route and search state: stale #search focus reopened over a destination ${JSON.stringify(pendingSearchRouteState)}`
    );

    const openHashRoute = async (hash, selector) => {
      await page.goto(`${baseUrl}/?theme=aurora${hash}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(({ expectedHash, modalSelector }) => (
        window.location.hash === expectedHash
          && document.querySelector(modalSelector)?.classList.contains('active')
      ), { expectedHash: hash, modalSelector: selector }, { timeout: 15000 });
    };

    await openHashRoute('#crp', '#tezoscrp-modal');
    assert(/TezosCRP/i.test(await page.title()), `route and search state: bare #crp title is wrong (${await page.title()})`);

    await openHashRoute('#protocol', '#protocol-history-chamber-modal');
    const bareProtocolState = await page.evaluate(() => ({
      anthology: Boolean(document.querySelector('#protocol-history-chamber-modal.active')),
      story: Boolean(document.getElementById('protocol-history-modal')),
      hash: window.location.hash
    }));
    assert(
      bareProtocolState.anthology && !bareProtocolState.story && bareProtocolState.hash === '#protocol',
      `route and search state: bare #protocol did not remain an anthology route ${JSON.stringify(bareProtocolState)}`
    );

    await openHashRoute('#baker', '#baker-directory-modal');
    assert(/Baker Directory/i.test(await page.title()), `route and search state: bare #baker title is wrong (${await page.title()})`);

    const aliasPairs = [
      ['#chamber', '#the-chamber', '#chamber-modal'],
      ['#pulse', '#network-pulse', '#network-pulse-modal'],
      ['#tezosx', '#tezlink', '#tezlink-modal'],
      ['#health', '#network-health', '#network-health-modal']
    ];
    for (const [canonicalHash, aliasHash, selector] of aliasPairs) {
      await openHashRoute(canonicalHash, selector);
      await page.evaluate(({ nextHash, modalSelector }) => {
        window.__routeAliasState = { closed: false, reopened: false };
        window.__routeAliasObserver?.disconnect();
        window.__routeAliasObserver = new MutationObserver((records) => {
          for (const record of records) {
            if (record.type === 'attributes' && record.target.matches?.(modalSelector)) {
              const wasActive = String(record.oldValue || '').split(/\s+/).includes('active');
              if (wasActive) window.__routeAliasState.closed = true;
              if (!wasActive && window.__routeAliasState.closed && record.target.classList.contains('active')) {
                window.__routeAliasState.reopened = true;
              }
            }
            if (record.type === 'childList') {
              for (const node of record.removedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE && (node.matches?.(modalSelector) || node.querySelector?.(modalSelector))) {
                  window.__routeAliasState.closed = true;
                }
              }
              for (const node of record.addedNodes) {
                if (!window.__routeAliasState.closed || node.nodeType !== Node.ELEMENT_NODE) continue;
                const modal = node.matches?.(modalSelector) ? node : node.querySelector?.(modalSelector);
                if (modal?.classList.contains('active')) window.__routeAliasState.reopened = true;
              }
            }
          }
        });
        window.__routeAliasObserver.observe(document.body, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: ['class'],
          attributeOldValue: true
        });
        window.location.hash = nextHash;
      }, { nextHash: aliasHash, modalSelector: selector });
      await page.waitForFunction(({ expectedHash, modalSelector }) => (
        window.location.hash === expectedHash
          && window.__routeAliasState?.closed
          && window.__routeAliasState?.reopened
          && document.querySelector(modalSelector)?.classList.contains('active')
      ), { expectedHash: aliasHash, modalSelector: selector }, { timeout: 15000 });
      const aliasState = await page.evaluate(() => {
        window.__routeAliasObserver?.disconnect();
        return { ...window.__routeAliasState, hash: window.location.hash };
      });
      assert(
        aliasState.closed && aliasState.reopened && aliasState.hash === aliasHash,
        `route and search state: ${canonicalHash} -> ${aliasHash} corrupted routing ${JSON.stringify(aliasState)}`
      );
    }

    await openHashRoute('#health', '#network-health-modal');
    await page.locator('#network-health-modal.active .chamber-close').click();
    await page.waitForFunction(() => (
      window.location.pathname === '/'
        && window.location.search === '?theme=aurora'
        && !window.location.hash
        && !document.querySelector('#network-health-modal')?.classList.contains('active')
    ), null, { timeout: 10000 });

    // Model the reader's real interaction so the overlay focus-restoration
    // guard observes intent before typing into the command bar.
    await input.click();
    await input.fill('network health');
    await page.waitForFunction(() => (
      document.querySelector('#hero-search-panel .hero-search-result.is-selected strong')?.textContent?.trim() === 'Network Health'
        && document.activeElement?.id === 'hero-search-input'
    ), null, { timeout: 10000 });
    await input.press('Enter');
    try {
      await page.waitForFunction(() => (
        window.location.pathname === '/health/'
          && document.querySelector('#network-health-modal')?.classList.contains('active')
          && !document.body.classList.contains('hero-search-mode')
          && document.activeElement?.id !== 'hero-search-input'
      ), null, { timeout: 15000 });
    } catch (error) {
      const failedState = await page.evaluate(() => ({
        path: window.location.pathname,
        search: window.location.search,
        hash: window.location.hash,
        healthOpen: Boolean(document.querySelector('#network-health-modal.active')),
        healthHidden: document.querySelector('#network-health-modal')?.getAttribute('aria-hidden') || '',
        searchOpen: document.body.classList.contains('hero-search-mode'),
        focus: document.activeElement?.id || document.activeElement?.tagName || '',
        query: document.getElementById('hero-search-input')?.value || '',
        selectedId: document.querySelector('#hero-search-panel .hero-search-result.is-selected')?.getAttribute('data-result-id') || '',
        selectedText: document.querySelector('#hero-search-panel .hero-search-result.is-selected strong')?.textContent?.trim() || ''
      }));
      throw new Error(`route and search state: selected Network Health did not settle ${JSON.stringify(failedState)}`, { cause: error });
    }

    await page.goBack();
    await page.waitForFunction(() => (
      window.location.pathname === '/'
        && window.location.search === '?theme=aurora'
        && !window.location.hash
        && !document.querySelector('.chamber-overlay.active, #history-modal.active, #protocol-history-modal, #native-explorer-overlay.active')
    ), null, { timeout: 15000 });
    await page.goForward();
    await page.waitForFunction(() => (
      window.location.pathname === '/health/'
        && document.querySelector('#network-health-modal')?.classList.contains('active')
        && !document.body.classList.contains('hero-search-mode')
        && document.activeElement?.id !== 'hero-search-input'
    ), null, { timeout: 15000 });
    await page.evaluate(async () => {
      const { updatePageTitle } = await import('/js/ui/title.js');
      updatePageTitle({
        totalBakers: 401,
        stakingRatio: 72.1,
        currentIssuanceRate: 3.2,
        stakeAPY: 5.8
      });
    });
    assert(await page.title() === 'Network Health | tezos.systems', `route and search state: telemetry immediately replaced the Forward title (${await page.title()})`);
    await page.clock.fastForward(10250);
    const forwardState = await page.evaluate(() => ({
      path: window.location.pathname,
      title: document.title,
      searchOpen: document.body.classList.contains('hero-search-mode'),
      focus: document.activeElement?.id || document.activeElement?.tagName || '',
      healthOpen: Boolean(document.querySelector('#network-health-modal.active'))
    }));
    assert(
      forwardState.path === '/health/'
        && forwardState.title === 'Network Health | tezos.systems'
        && !forwardState.searchOpen
        && forwardState.focus !== 'hero-search-input'
        && forwardState.healthOpen,
      `route and search state: Forward did not restore a stable routed room ${JSON.stringify(forwardState)}`
    );

    const standaloneResponse = await page.goto(`${baseUrl}/health/?theme=aurora`, { waitUntil: 'commit' });
    assert(standaloneResponse?.ok(), `route and search state: standalone Health route failed with HTTP ${standaloneResponse?.status()}`);
    await page.waitForFunction(() => (
      document.documentElement.dataset.chamberRoute === 'health'
        && document.querySelector('#network-health-modal')?.classList.contains('active')
    ), null, { timeout: 150000 });
    await page.evaluate(async () => {
      const { updatePageTitle } = await import('/js/ui/title.js');
      updatePageTitle({
        totalBakers: 401,
        stakingRatio: 72.1,
        currentIssuanceRate: 3.2,
        stakeAPY: 5.8
      });
    });
    const standaloneTitleState = await page.evaluate(() => ({
      chamberRoute: document.documentElement.dataset.chamberRoute || '',
      title: document.title
    }));
    assert(
      standaloneTitleState.chamberRoute === 'health'
        && standaloneTitleState.title === 'Network Health Chamber - Tezos Consensus Status | tezos.systems',
      `route and search state: standalone route-specific title was overwritten ${JSON.stringify(standaloneTitleState)}`
    );

    await context.close();
    assert(issues.length === 0, `route and search state browser issues:\n${issues.join('\n')}`);
    log('ok - route and search state smoke');
  }

  async function smokeBreakpointAccessibility(browser, baseUrl) {
    const issues = [];
    const breakpointWidths = [759, 760, 767, 768, 899, 900, 1023, 1024, 1179, 1180, 1299, 1300];
    const settleLayout = (page) => page.evaluate(() => new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    }));
    const seedContext = async (context) => {
      await installFeatureMocks(context);
      await context.addInitScript(() => {
        localStorage.setItem('tezos-systems-theme', 'clean');
        localStorage.setItem('tezos-toured', '1');
        localStorage.setItem('tezos-welcomed', '1');
        localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
      });
    };
    const openDashboard = async (context, label) => {
      const page = await context.newPage();
      attachIssueCollectors(page, label, issues);
      const response = await page.goto(`${baseUrl}/?theme=clean`, { waitUntil: 'commit' });
      assert(response?.ok(), `${label}: dashboard failed with HTTP ${response?.status()}`);
      await page.locator('#hero-search-input').waitFor({ state: 'visible', timeout: 150000 });
      await page.waitForFunction(() => document.querySelector('#hero-slot')?.dataset.heroSearchWired === '1', null, { timeout: 150000 });
      return page;
    };

    const breakpointContext = await browser.newContext({
      viewport: { width: breakpointWidths[0], height: 900 },
      serviceWorkers: 'block'
    });
    await seedContext(breakpointContext);
    const breakpointPage = await openDashboard(breakpointContext, 'breakpoint accessibility matrix');
    const breakpointInput = breakpointPage.locator('#hero-search-input');
    await breakpointPage.setViewportSize({ width: 390, height: 843 });
    await breakpointInput.click();
    await breakpointPage.waitForFunction(() => document.querySelectorAll('#hero-search-panel [role="option"]').length === 6);
    const mobileBlankHeader = await breakpointPage.evaluate(() => {
      const header = document.querySelector('.hero-search-overlay .hero-search-panel-head');
      const copy = header?.querySelector('.hero-search-panel-copy');
      const title = copy?.querySelector('strong');
      const subtitle = copy?.querySelector('span');
      const headerRect = header?.getBoundingClientRect();
      const copyRect = copy?.getBoundingClientRect();
      return {
        columns: header ? getComputedStyle(header).gridTemplateColumns : '',
        widthShare: headerRect?.width ? (copyRect?.width || 0) / headerRect.width : 0,
        titleSize: Number.parseFloat(title ? getComputedStyle(title).fontSize : '0'),
        subtitleSize: Number.parseFloat(subtitle ? getComputedStyle(subtitle).fontSize : '0'),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    });
    assert(
      mobileBlankHeader.widthShare >= 0.85
        && mobileBlankHeader.titleSize >= 13.8
        && mobileBlankHeader.subtitleSize >= 12.3
        && mobileBlankHeader.overflow <= 1,
      `breakpoint accessibility: mobile blank-state header regressed ${JSON.stringify(mobileBlankHeader)}`
    );
    await breakpointInput.fill('network health');
    await breakpointPage.waitForFunction(() => (
      document.body.classList.contains('hero-search-mode')
        && document.activeElement?.id === 'hero-search-input'
        && !document.getElementById('hero-search-panel')?.hidden
    ));
    await breakpointPage.waitForFunction(() => Boolean(
      document.querySelector('#hero-search-panel .hero-search-result.is-selected .hero-result-enter[aria-hidden="true"]')
    ));
    const cleanSelectionContrast = await breakpointPage.evaluate(() => {
      const parseRgb = (value) => {
        const match = String(value || '').match(/rgba?\((\d+(?:\.\d+)?)[, ]+(\d+(?:\.\d+)?)[, ]+(\d+(?:\.\d+)?)/i);
        return match ? match.slice(1, 4).map(Number) : [0, 0, 0];
      };
      const luminance = (rgb) => rgb.reduce((sum, channel, index) => {
        const value = channel / 255;
        const linear = value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        return sum + linear * [0.2126, 0.7152, 0.0722][index];
      }, 0);
      const selected = document.querySelector('#hero-search-panel .hero-search-result.is-selected');
      const detail = selected?.querySelector('.hero-result-copy > span');
      const foreground = parseRgb(detail ? getComputedStyle(detail).color : '');
      const background = parseRgb(selected ? getComputedStyle(selected).backgroundColor : '');
      const light = Math.max(luminance(foreground), luminance(background));
      const dark = Math.min(luminance(foreground), luminance(background));
      return {
        foreground,
        background,
        ratio: (light + 0.05) / (dark + 0.05),
        enterHidden: selected?.querySelector('.hero-result-enter')?.getAttribute('aria-hidden') === 'true',
        pseudoContent: selected ? getComputedStyle(selected, '::after').content : ''
      };
    });
    assert(
      cleanSelectionContrast.ratio >= 4.5
        && cleanSelectionContrast.enterHidden
        && ['none', 'normal', ''].includes(cleanSelectionContrast.pseudoContent),
      `breakpoint accessibility: selected result contrast or decorative Enter semantics regressed ${JSON.stringify(cleanSelectionContrast)}`
    );

    for (const width of breakpointWidths) {
      await breakpointPage.setViewportSize({ width, height: 900 });
      await settleLayout(breakpointPage);
      const state = await breakpointPage.evaluate((expectedWidth) => {
        const rectState = (selector) => {
          const element = document.querySelector(selector);
          const rect = element?.getBoundingClientRect();
          return {
            selector,
            present: Boolean(element && rect),
            width: rect?.width || 0,
            left: rect?.left || 0,
            right: rect?.right || 0,
            top: rect?.top || 0,
            bottom: rect?.bottom || 0,
            horizontallyContained: Boolean(rect && rect.left >= -1 && rect.right <= innerWidth + 1)
          };
        };
        const commandDeck = document.querySelector('#live-head');
        const focused = document.activeElement?.getBoundingClientRect();
        return {
          expectedWidth,
          width: innerWidth,
          horizontalOverflow: Math.max(
            document.documentElement.scrollWidth - document.documentElement.clientWidth,
            document.body.scrollWidth - document.documentElement.clientWidth
          ),
          searchOpen: document.body.classList.contains('hero-search-mode'),
          focusedInput: document.activeElement?.id === 'hero-search-input',
          focusContained: Boolean(focused
            && focused.left >= -1
            && focused.right <= innerWidth + 1
            && focused.top >= -1
            && focused.bottom <= innerHeight + 1),
          commandPosition: commandDeck ? getComputedStyle(commandDeck).position : '',
          regions: [
            rectState('.header-content'),
            rectState('#live-head'),
            rectState('#hero-search-form'),
            rectState('#hero-search-panel'),
            rectState('#main-content')
          ]
        };
      }, width);
      assert(state.width === width, `breakpoint accessibility ${width}px: viewport width drifted ${JSON.stringify(state)}`);
      assert(state.horizontalOverflow <= 1, `breakpoint accessibility ${width}px: shell/search caused horizontal overflow ${JSON.stringify(state)}`);
      assert(
        state.searchOpen && state.focusedInput && state.focusContained,
        `breakpoint accessibility ${width}px: search focus escaped the visible command surface ${JSON.stringify(state)}`
      );
      assert(
        state.regions.every((region) => region.present && region.width > 0 && region.horizontallyContained),
        `breakpoint accessibility ${width}px: shell/search geometry escaped the viewport ${JSON.stringify(state)}`
      );
      assert(state.commandPosition !== 'fixed', `breakpoint accessibility ${width}px: Live Head became a fixed command sheet ${JSON.stringify(state)}`);
    }

    await breakpointPage.keyboard.press('Escape');
    await breakpointPage.evaluate(() => { window.location.hash = 'health'; });
    await breakpointPage.waitForFunction(() => document.querySelector('#network-health-modal')?.classList.contains('active'), null, { timeout: 30000 });
    for (const width of breakpointWidths) {
      await breakpointPage.setViewportSize({ width, height: 900 });
      await settleLayout(breakpointPage);
      await assertNormalizedChamberShell(
        breakpointPage,
        '#network-health-modal',
        '.health-content',
        'standard',
        `breakpoint accessibility Health Chamber ${width}px`
      );
      await breakpointPage.locator('#network-health-modal .chamber-close').focus();
      const chamberState = await breakpointPage.evaluate((expectedWidth) => {
        const dialog = document.querySelector('#network-health-modal .health-content');
        const close = document.querySelector('#network-health-modal .chamber-close');
        const dialogRect = dialog?.getBoundingClientRect();
        const closeRect = close?.getBoundingClientRect();
        return {
          expectedWidth,
          width: innerWidth,
          horizontalOverflow: Math.max(
            document.documentElement.scrollWidth - document.documentElement.clientWidth,
            document.body.scrollWidth - document.documentElement.clientWidth
          ),
          focusInDialog: Boolean(dialog?.contains(document.activeElement)),
          dialogContained: Boolean(dialogRect
            && dialogRect.left >= -1
            && dialogRect.right <= innerWidth + 1
            && dialogRect.top >= -1
            && dialogRect.bottom <= innerHeight + 1),
          closeContained: Boolean(closeRect
            && closeRect.left >= dialogRect.left - 1
            && closeRect.right <= dialogRect.right + 1
            && closeRect.top >= dialogRect.top - 1
            && closeRect.bottom <= dialogRect.bottom + 1)
        };
      }, width);
      assert(
        chamberState.width === width
          && chamberState.horizontalOverflow <= 1
          && chamberState.focusInDialog
          && chamberState.dialogContained
          && chamberState.closeContained,
        `breakpoint accessibility Health Chamber ${width}px: containment/overflow failed ${JSON.stringify(chamberState)}`
      );
    }
    await breakpointContext.close();

    // A 640x450 CSS viewport at DPR 2 models a 1280x900 display reflowed at 200%.
    const zoomContext = await browser.newContext({
      viewport: { width: 640, height: 450 },
      screen: { width: 1280, height: 900 },
      deviceScaleFactor: 2,
      serviceWorkers: 'block'
    });
    await seedContext(zoomContext);
    const zoomPage = await openDashboard(zoomContext, '200 percent zoom accessibility');
    await zoomPage.locator('#hero-search-input').fill('network health');
    await zoomPage.waitForFunction(() => document.body.classList.contains('hero-search-mode'));
    const zoomSearchState = await zoomPage.evaluate(() => {
      const focused = document.activeElement?.getBoundingClientRect();
      const deck = document.querySelector('#live-head')?.getBoundingClientRect();
      return {
        cssViewport: [innerWidth, innerHeight],
        dpr: devicePixelRatio,
        physicalViewport: [innerWidth * devicePixelRatio, innerHeight * devicePixelRatio],
        focusVisible: document.activeElement?.matches?.(':focus-visible') || false,
        focusContained: Boolean(focused
          && focused.left >= -1
          && focused.right <= innerWidth + 1),
        deckContained: Boolean(deck && deck.left >= -1 && deck.right <= innerWidth + 1),
        horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    });
    assert(
      zoomSearchState.cssViewport.join('x') === '640x450'
        && zoomSearchState.dpr === 2
        && zoomSearchState.physicalViewport.join('x') === '1280x900'
        && zoomSearchState.focusVisible
        && zoomSearchState.focusContained
        && zoomSearchState.deckContained
        && zoomSearchState.horizontalOverflow <= 1,
      `200 percent zoom accessibility: command surface failed reflow/focus containment ${JSON.stringify(zoomSearchState)}`
    );
    await zoomPage.keyboard.press('Escape');
    await zoomPage.evaluate(() => { window.location.hash = 'health'; });
    await zoomPage.waitForFunction(() => document.querySelector('#network-health-modal')?.classList.contains('active'), null, { timeout: 30000 });
    await assertNormalizedChamberShell(
      zoomPage,
      '#network-health-modal',
      '.health-content',
      'standard',
      '200 percent zoom accessibility Health Chamber'
    );
    const zoomChamberState = await zoomPage.evaluate(() => {
      const dialog = document.querySelector('#network-health-modal .health-content');
      const close = document.querySelector('#network-health-modal .chamber-close');
      close?.focus();
      const dialogRect = dialog?.getBoundingClientRect();
      const closeRect = close?.getBoundingClientRect();
      return {
        focusInDialog: Boolean(dialog?.contains(document.activeElement)),
        dialogContained: Boolean(dialogRect
          && dialogRect.left >= -1
          && dialogRect.right <= innerWidth + 1
          && dialogRect.top >= -1
          && dialogRect.bottom <= innerHeight + 1),
        closeContained: Boolean(closeRect
          && closeRect.left >= dialogRect.left - 1
          && closeRect.right <= dialogRect.right + 1
          && closeRect.top >= dialogRect.top - 1
          && closeRect.bottom <= dialogRect.bottom + 1),
        horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    });
    assert(
      zoomChamberState.focusInDialog
        && zoomChamberState.dialogContained
        && zoomChamberState.closeContained
        && zoomChamberState.horizontalOverflow <= 1,
      `200 percent zoom accessibility: Health Chamber escaped the reflowed viewport ${JSON.stringify(zoomChamberState)}`
    );
    await zoomContext.close();

    const forcedColorsContext = await browser.newContext({
      viewport: { width: 900, height: 720 },
      forcedColors: 'active',
      serviceWorkers: 'block'
    });
    await seedContext(forcedColorsContext);
    const forcedColorsPage = await openDashboard(forcedColorsContext, 'forced colors accessibility');
    await forcedColorsPage.locator('#hero-search-input').fill('network health');
    await forcedColorsPage.locator('#hero-search-input').press('Tab');
    await forcedColorsPage.locator('.hero-search-submit').press('Tab');
    await forcedColorsPage.waitForFunction(() => document.activeElement?.id === 'hero-search-close');
    const forcedColorsState = await forcedColorsPage.evaluate(() => {
      const focused = document.activeElement;
      const rect = focused?.getBoundingClientRect();
      const style = focused ? getComputedStyle(focused) : null;
      const selected = document.querySelector('#hero-search-panel .hero-search-result.is-selected');
      const selectedStyle = selected ? getComputedStyle(selected) : null;
      const selectedDetail = selected?.querySelector('.hero-result-copy > span');
      const selectedEnter = selected?.querySelector('.hero-result-enter');
      return {
        forcedColors: matchMedia('(forced-colors: active)').matches,
        active: focused?.id || '',
        focusVisible: focused?.matches?.(':focus-visible') || false,
        outlineStyle: style?.outlineStyle || '',
        outlineWidth: Number.parseFloat(style?.outlineWidth || '0') || 0,
        selectedColor: selectedStyle?.color || '',
        selectedDetailColor: selectedDetail ? getComputedStyle(selectedDetail).color : '',
        selectedEnterColor: selectedEnter ? getComputedStyle(selectedEnter).color : '',
        focusContained: Boolean(rect
          && rect.left >= -1
          && rect.right <= innerWidth + 1
          && rect.top >= -1
          && rect.bottom <= innerHeight + 1),
        horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    });
    assert(
      forcedColorsState.forcedColors
        && forcedColorsState.active === 'hero-search-close'
        && forcedColorsState.focusVisible
        && forcedColorsState.outlineStyle !== 'none'
        && forcedColorsState.outlineWidth >= 2
        && forcedColorsState.selectedDetailColor === forcedColorsState.selectedColor
        && forcedColorsState.selectedEnterColor === forcedColorsState.selectedColor
        && forcedColorsState.focusContained
        && forcedColorsState.horizontalOverflow <= 1,
      `forced colors accessibility: search focus was not visibly contained ${JSON.stringify(forcedColorsState)}`
    );
    await forcedColorsContext.close();

    const reducedMotionContext = await browser.newContext({
      viewport: { width: 900, height: 720 },
      reducedMotion: 'reduce',
      serviceWorkers: 'block'
    });
    await seedContext(reducedMotionContext);
    const reducedMotionPage = await openDashboard(reducedMotionContext, 'reduced motion accessibility');
    await reducedMotionPage.locator('#hero-search-input').fill('network health');
    await reducedMotionPage.locator('#hero-search-input').press('Tab');
    await reducedMotionPage.locator('.hero-search-submit').press('Tab');
    await reducedMotionPage.waitForFunction(() => document.activeElement?.id === 'hero-search-close');
    const reducedMotionState = await reducedMotionPage.evaluate(() => {
      const durationIsZero = (value) => String(value || '')
        .split(',')
        .every((duration) => Number.parseFloat(duration) === 0);
      const focused = document.activeElement;
      const focusedRect = focused?.getBoundingClientRect();
      const focusedStyle = focused ? getComputedStyle(focused) : null;
      const motionSelectors = [
        { selector: '.header' },
        { selector: '.live-head-row' },
        { selector: '.main-content' },
        { selector: '.hero-search-form' },
        { selector: '.hero-search-submit' },
        { selector: '.hero-search-close' },
        { selector: '.hero-search-chip', optional: true }
      ];
      const motion = motionSelectors.map(({ selector, optional = false }) => {
        const element = document.querySelector(selector);
        const style = element ? getComputedStyle(element) : null;
        return {
          selector,
          optional,
          present: Boolean(element),
          transitionDuration: style?.transitionDuration || '',
          animationDuration: style?.animationDuration || '',
          still: Boolean(style
            && durationIsZero(style.transitionDuration)
            && (style.animationName === 'none' || durationIsZero(style.animationDuration)))
        };
      });
      return {
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
        active: focused?.id || '',
        focusVisible: focused?.matches?.(':focus-visible') || false,
        focusStyled: Boolean(focusedStyle
          && (focusedStyle.outlineStyle !== 'none' || focusedStyle.boxShadow !== 'none')),
        focusContained: Boolean(focusedRect
          && focusedRect.left >= -1
          && focusedRect.right <= innerWidth + 1
          && focusedRect.top >= -1
          && focusedRect.bottom <= innerHeight + 1),
        horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        motion
      };
    });
    assert(
      reducedMotionState.reducedMotion
        && reducedMotionState.active === 'hero-search-close'
        && reducedMotionState.focusVisible
        && reducedMotionState.focusStyled
        && reducedMotionState.focusContained
        && reducedMotionState.horizontalOverflow <= 1,
      `reduced motion accessibility: search focus/containment failed ${JSON.stringify(reducedMotionState)}`
    );
    assert(
      reducedMotionState.motion.every((entry) => (
        (entry.optional && !entry.present) || (entry.present && entry.still)
      )),
      `reduced motion accessibility: command transition/animation remained active ${JSON.stringify(reducedMotionState.motion)}`
    );
    await reducedMotionContext.close();

    assert(issues.length === 0, `breakpoint/accessibility browser issues:\n${issues.join('\n')}`);
    log('ok - exact breakpoint and accessibility matrix');
  }

  async function smokeHashModalCleanup(browser, baseUrl) {
    const issues = [];
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(context, { governanceLiveVote: true });
    await context.addInitScript(() => {
      localStorage.setItem('tezos-systems-theme', 'matrix');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    });

    const page = await context.newPage();
    attachIssueCollectors(page, 'hash modal cleanup', issues);
    const lazyModuleRequests = [];
    page.on('request', (request) => {
      const pathname = new URL(request.url()).pathname;
      if (DEFERRED_CHAMBER_MODULE_PATHS.includes(pathname)) lazyModuleRequests.push(pathname);
    });
    const response = await page.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `hash modal cleanup: dashboard failed with HTTP ${response?.status()}`);
    await page.locator('main').waitFor({ state: 'visible', timeout: 15000 });

    await page.evaluate(() => { window.location.hash = 'history'; });
    await page.locator('#history-modal[aria-hidden="false"]').waitFor({ state: 'attached', timeout: 10000 });

    await page.evaluate(() => { window.location.hash = 'chamber'; });
    await page.locator('#chamber-modal.active').waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForFunction(() => !document.querySelector('#history-modal')?.classList.contains('active'), null, { timeout: 5000 });

    await page.evaluate(() => { window.location.hash = 'l2chamber'; });
    await page.locator('#etherlink-governance-modal.active').waitFor({ state: 'visible', timeout: 10000 });
    const stackedState = await page.evaluate(() => ({
      activeModals: Array.from(document.querySelectorAll('.modal-overlay.active, #history-modal.active')).map((modal) => modal.id || modal.className),
      bodyOverflow: document.body.style.overflow,
      htmlOverflow: document.documentElement.style.overflow
    }));
    assert(stackedState.activeModals.length === 1 && stackedState.activeModals[0] === 'etherlink-governance-modal', `hash modal cleanup: stale modals remain under L2: ${JSON.stringify(stackedState)}`);
    assert(stackedState.bodyOverflow === 'hidden' && stackedState.htmlOverflow === 'hidden', `hash modal cleanup: active L2 should own scroll lock: ${JSON.stringify(stackedState)}`);

    await page.locator('#etherlink-governance-modal.active .chamber-close').click();
    await page.waitForFunction(() => {
      const active = Array.from(document.querySelectorAll('.modal-overlay.active, #history-modal.active'));
      return active.length === 0 && document.body.style.overflow !== 'hidden' && document.documentElement.style.overflow !== 'hidden';
    }, null, { timeout: 5000 });

	  const allowedTransitions = new Set([
	    '/js/features/ecosystem-chamber.js',
	    '/js/features/chamber.js',
	    '/js/features/etherlink-governance.js'
	  ]);
    const unexpectedModules = [...new Set(lazyModuleRequests)].filter((pathname) => !allowedTransitions.has(pathname));
    assert(
      unexpectedModules.length === 0
        && lazyModuleRequests.includes('/js/features/chamber.js')
        && lazyModuleRequests.includes('/js/features/etherlink-governance.js'),
	    `hash modal cleanup loaded unexpected deferred Chambers: ${JSON.stringify(lazyModuleRequests)}`
    );

    await context.close();
    assert(issues.length === 0, `hash modal cleanup browser issues:\n${issues.join('\n')}`);
    log('ok - hash modal cleanup smoke');
  }

  async function smokeOverlayFeatureIntegrations(browser, baseUrl) {
    const issues = [];
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
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
    attachIssueCollectors(page, 'overlay stack', issues);

    let response = await page.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'commit' });
    assert(response?.ok(), `overlay stack root failed with HTTP ${response?.status()}`);
    await page.locator('body').waitFor({ state: 'attached', timeout: 10000 });

    await page.evaluate(async () => {
      const opener = document.createElement('button');
      opener.id = 'overlay-stack-share-opener';
      opener.type = 'button';
      opener.textContent = 'Open share fixture';
      document.body.appendChild(opener);
      opener.focus();
      const canvas = document.createElement('canvas');
      canvas.width = 32;
      canvas.height = 18;
      const share = await import('/js/ui/share.js');
      share.showShareModal(canvas, 'Overlay stack test', 'Overlay stack test');
    });
    await page.locator('#share-modal').waitFor({ state: 'attached', timeout: 5000 });
    await page.waitForFunction(() => document.getElementById('share-modal')?.classList.contains('visible'));
    await page.waitForFunction(() => {
      const overlay = document.getElementById('share-modal');
      if (!overlay) return false;
      const style = getComputedStyle(overlay);
      return style.visibility !== 'hidden' && Number.parseFloat(style.opacity || '1') > 0;
    });
    const shareVisibility = await page.evaluate(() => {
      const overlay = document.getElementById('share-modal');
      const rect = overlay?.getBoundingClientRect();
      return {
        inert: overlay?.hasAttribute('inert') || false,
        ariaHidden: overlay?.getAttribute('aria-hidden') || '',
        display: overlay ? getComputedStyle(overlay).display : '',
        visibility: overlay ? getComputedStyle(overlay).visibility : '',
        opacity: overlay ? getComputedStyle(overlay).opacity : '',
        width: rect?.width || 0,
        height: rect?.height || 0,
        activeOverlays: Array.from(document.querySelectorAll('.active, .visible')).map((node) => node.id || node.className).slice(0, 12)
      };
    });
    assert(
      !shareVisibility.inert
        && shareVisibility.ariaHidden === 'false'
        && shareVisibility.display !== 'none'
        && shareVisibility.visibility !== 'hidden'
        && shareVisibility.width > 0
        && shareVisibility.height > 0,
      `overlay stack Share did not become visible ${JSON.stringify(shareVisibility)}`
    );
    await page.waitForFunction(() => document.activeElement?.classList.contains('share-modal-close'));
    const shareOpen = await page.evaluate(() => {
      const overlay = document.getElementById('share-modal');
      const dialog = overlay?.querySelector('.share-modal-content');
      const opener = document.getElementById('overlay-stack-share-opener');
      return {
        role: dialog?.getAttribute('role') || '',
        modal: dialog?.getAttribute('aria-modal') || '',
        labelledBy: dialog?.getAttribute('aria-labelledby') || '',
        focusedClose: document.activeElement === dialog?.querySelector('.share-modal-close'),
        openerInert: opener?.hasAttribute('inert') || false,
        bodyLocked: document.body.style.overflow === 'hidden' && document.documentElement.style.overflow === 'hidden'
      };
    });
    assert(
      shareOpen.role === 'dialog'
        && shareOpen.modal === 'true'
        && shareOpen.labelledBy === 'share-modal-title'
        && shareOpen.focusedClose
        && shareOpen.openerInert
        && shareOpen.bodyLocked,
      `overlay stack Share lifecycle is incomplete ${JSON.stringify(shareOpen)}`
    );
    await page.evaluate(() => {
      const dialog = document.querySelector('#share-modal .share-modal-content');
      const focusable = Array.from(dialog?.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])') || [])
        .filter((node) => node.getClientRects().length);
      focusable.at(-1)?.focus();
    });
    await page.keyboard.press('Tab');
    assert(
      await page.evaluate(() => document.querySelector('#share-modal .share-modal-content')?.contains(document.activeElement)),
      'overlay stack Share Tab escaped the dialog'
    );

    await page.evaluate(() => {
      Object.defineProperty(navigator, 'userAgent', {
        configurable: true,
        value: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36'
      });
      Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    });
    await page.locator('#share-modal #share-download').click();
    await page.locator('#share-mobile-save-overlay').waitFor({ state: 'visible', timeout: 3000 });
    await page.waitForFunction(() => document.activeElement?.classList.contains('share-mobile-save-close'));
    const mobileSaveOpen = await page.evaluate(async () => {
      const overlayApi = await import('/js/ui/overlay-stack.js');
      const child = document.getElementById('share-mobile-save-overlay');
      const parent = document.getElementById('share-modal');
      const dialog = child?.querySelector('.share-mobile-save-dialog');
      return {
        labelledBy: dialog?.getAttribute('aria-labelledby') || '',
        modal: dialog?.getAttribute('aria-modal') || '',
        parentInert: parent?.hasAttribute('inert') || false,
        role: dialog?.getAttribute('role') || '',
        stackDepth: overlayApi.activeOverlayCount()
      };
    });
    assert(
      mobileSaveOpen.role === 'dialog'
        && mobileSaveOpen.modal === 'true'
        && mobileSaveOpen.labelledBy === 'share-mobile-save-title'
        && mobileSaveOpen.parentInert
        && mobileSaveOpen.stackDepth === 2,
      `overlay stack mobile Share fallback was not contained as a child dialog ${JSON.stringify(mobileSaveOpen)}`
    );
    await page.keyboard.press('Tab');
    assert(
      await page.evaluate(() => document.querySelector('#share-mobile-save-overlay .share-mobile-save-dialog')?.contains(document.activeElement)),
      'overlay stack mobile Share fallback let Tab escape the child dialog'
    );
    await page.keyboard.press('Escape');
    await page.locator('#share-mobile-save-overlay').waitFor({ state: 'detached', timeout: 2000 });
    await page.waitForFunction(() => document.activeElement?.id === 'share-download');
    const mobileSaveClosed = await page.evaluate(async () => {
      const overlayApi = await import('/js/ui/overlay-stack.js');
      const parent = document.getElementById('share-modal');
      return {
        bodyLocked: document.body.style.overflow === 'hidden' && document.documentElement.style.overflow === 'hidden',
        parentInert: parent?.hasAttribute('inert') || false,
        parentVisible: parent?.classList.contains('visible') || false,
        stackDepth: overlayApi.activeOverlayCount()
      };
    });
    assert(
      mobileSaveClosed.parentVisible
        && !mobileSaveClosed.parentInert
        && mobileSaveClosed.bodyLocked
        && mobileSaveClosed.stackDepth === 1,
      `overlay stack mobile Share fallback orphaned or unlocked its parent ${JSON.stringify(mobileSaveClosed)}`
    );
    await page.keyboard.press('Escape');
    await page.locator('#share-modal').waitFor({ state: 'detached', timeout: 2000 });
    const shareClosed = await page.evaluate(() => ({
      restored: document.activeElement?.id === 'overlay-stack-share-opener',
      openerInert: document.getElementById('overlay-stack-share-opener')?.hasAttribute('inert') || false,
      bodyOverflow: document.body.style.overflow,
      htmlOverflow: document.documentElement.style.overflow
    }));
    assert(
      shareClosed.restored && !shareClosed.openerInert && !shareClosed.bodyOverflow && !shareClosed.htmlOverflow,
      `overlay stack Share close did not restore focus/background ${JSON.stringify(shareClosed)}`
    );
    await page.evaluate(() => document.getElementById('overlay-stack-share-opener')?.remove());

    response = await page.goto(`${baseUrl}/anthology/ushuaia/`, { waitUntil: 'commit' });
    assert(response?.ok(), `overlay stack direct Protocol Story failed with HTTP ${response?.status()}`);
    await page.locator('#protocol-history-modal').waitFor({ state: 'visible', timeout: 30000 });
    await page.waitForFunction(() => document.activeElement?.id === 'history-modal-close');
    const directStory = await page.evaluate(() => {
      const overlay = document.getElementById('protocol-history-modal');
      const dialog = overlay?.querySelector('.protocol-history-story-modal');
      const siblings = Array.from(document.body.children).filter((element) => (
        element !== overlay && !['SCRIPT', 'STYLE', 'LINK', 'META'].includes(element.tagName)
      ));
      return {
        role: dialog?.getAttribute('role') || '',
        modal: dialog?.getAttribute('aria-modal') || '',
        labelledBy: dialog?.getAttribute('aria-labelledby') || '',
        focusedClose: document.activeElement?.id === 'history-modal-close',
        parentActive: document.getElementById('protocol-history-chamber-modal')?.classList.contains('active') || false,
        parentInert: document.getElementById('protocol-history-chamber-modal')?.hasAttribute('inert') || false,
        backgroundIsolated: siblings.length > 0 && siblings.every((element) => element.hasAttribute('inert')),
        nonIsolated: siblings.filter((element) => !element.hasAttribute('inert')).map((element) => element.id || element.className || element.tagName),
        bodyLocked: document.body.style.overflow === 'hidden' && document.documentElement.style.overflow === 'hidden'
      };
    });
    assert(
      directStory.role === 'dialog'
        && directStory.modal === 'true'
        && directStory.labelledBy === 'protocol-history-story-title'
        && directStory.focusedClose
        && directStory.parentActive
        && directStory.parentInert
        && directStory.backgroundIsolated
        && directStory.bodyLocked,
      `overlay stack direct Protocol Story lifecycle is incomplete ${JSON.stringify(directStory)}`
    );
    await page.keyboard.press('Escape');
    await page.locator('#protocol-history-modal').waitFor({ state: 'detached', timeout: 3000 });
    await page.waitForFunction(() => !new URLSearchParams(window.location.search).has('protocol'));
    await page.waitForFunction(() => document.getElementById('protocol-history-chamber-modal')?.contains(document.activeElement), null, { timeout: 2000 });
    const directStoryClosed = await page.evaluate(() => ({
      pathname: window.location.pathname,
      search: window.location.search,
      hash: window.location.hash,
      active: document.activeElement?.id || document.activeElement?.tagName || '',
      parentActive: document.getElementById('protocol-history-chamber-modal')?.classList.contains('active') || false,
      focusInParent: document.getElementById('protocol-history-chamber-modal')?.contains(document.activeElement) || false,
      bodyOverflow: document.body.style.overflow,
      htmlOverflow: document.documentElement.style.overflow
    }));
    assert(
      directStoryClosed.pathname === '/anthology/'
        && !directStoryClosed.search.includes('protocol=')
        && directStoryClosed.parentActive
        && directStoryClosed.focusInParent
        && directStoryClosed.bodyOverflow === 'hidden'
        && directStoryClosed.htmlOverflow === 'hidden',
      `overlay stack direct Protocol Story close left stale route/focus/scroll ${JSON.stringify(directStoryClosed)}`
    );

    await page.goto(`${baseUrl}/#protocol-history`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL((url) => url.pathname === '/' && url.hash === '#protocol-history', { timeout: 5000 });
    await page.locator('#protocol-history-chamber-modal.active [data-protocol-open="Quebec"]').first().waitFor({ state: 'visible', timeout: 30000 });
    const nestedOpener = page.locator('#protocol-history-chamber-modal.active [data-protocol-open="Quebec"]').first();
    await nestedOpener.click();
    await page.locator('#protocol-history-modal').waitFor({ state: 'visible', timeout: 5000 });
    await page.waitForFunction(() => document.activeElement?.id === 'history-modal-close');
    const nestedStory = await page.evaluate(() => ({
      pathname: window.location.pathname,
      search: window.location.search,
      hash: window.location.hash,
      parentActive: document.getElementById('protocol-history-chamber-modal')?.classList.contains('active') || false,
      parentInert: document.getElementById('protocol-history-chamber-modal')?.hasAttribute('inert') || false,
      childFocused: document.activeElement?.id === 'history-modal-close'
    }));
    assert(
      nestedStory.pathname === '/anthology/quebec/'
        && !nestedStory.search
        && nestedStory.parentActive
        && nestedStory.parentInert
        && nestedStory.childFocused,
      `overlay stack nested Protocol Story did not isolate its parent ${JSON.stringify(nestedStory)}`
    );
    await page.keyboard.press('Escape');
    await page.locator('#protocol-history-modal').waitFor({ state: 'detached', timeout: 3000 });
    const nestedClosed = await page.evaluate(() => {
      const parent = document.getElementById('protocol-history-chamber-modal');
      const opener = parent?.querySelector('[data-protocol-open="Quebec"]');
      return {
        active: document.activeElement?.id || document.activeElement?.className || document.activeElement?.tagName || '',
        pathname: window.location.pathname,
        search: window.location.search,
        hash: window.location.hash,
        openerConnected: opener?.isConnected || false,
        openerDisabled: opener?.disabled || false,
        openerInert: opener?.closest('[inert]') != null,
        openerRects: opener?.getClientRects().length || 0,
        openerTag: opener?.tagName || '',
        openerVisibility: opener ? getComputedStyle(opener).visibility : '',
        parentActive: parent?.classList.contains('active') || false,
        parentInert: parent?.hasAttribute('inert') || false,
        focusInParent: Boolean(parent?.contains(document.activeElement))
      };
    });
    assert(
      nestedClosed.pathname === '/anthology/'
        && !new URLSearchParams(nestedClosed.search).has('protocol')
        && nestedClosed.parentActive
        && !nestedClosed.parentInert
        && nestedClosed.focusInParent,
      `overlay stack nested Story Escape closed/orphaned the parent ${JSON.stringify(nestedClosed)}`
    );

    await page.goto(`${baseUrl}/stake/`, { waitUntil: 'commit' });
    await page.locator('#staking-chamber-modal.active #staking-ratio-history').waitFor({ state: 'visible', timeout: 30000 });
    await page.locator('#staking-ratio-history').click();
    await page.locator('#card-history-modal.active').waitFor({ state: 'visible', timeout: 5000 });
    await page.waitForFunction(() => document.activeElement?.id === 'card-history-close');
    const cardHistory = await page.evaluate(() => {
      const parent = document.getElementById('staking-chamber-modal');
      const dialog = document.querySelector('#card-history-modal .card-history-content');
      return {
        role: dialog?.getAttribute('role') || '',
        modal: dialog?.getAttribute('aria-modal') || '',
        labelledBy: dialog?.getAttribute('aria-labelledby') || '',
        title: document.getElementById('card-history-title')?.textContent?.trim() || '',
        parentInert: parent?.hasAttribute('inert') || false,
        focusedClose: document.activeElement?.id === 'card-history-close'
      };
    });
    assert(
      cardHistory.role === 'dialog'
        && cardHistory.modal === 'true'
        && cardHistory.labelledBy === 'card-history-title'
        && cardHistory.title
        && cardHistory.parentInert
        && cardHistory.focusedClose,
      `overlay stack shared card history lifecycle is incomplete ${JSON.stringify(cardHistory)}`
    );
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('card-history-modal')?.classList.contains('active'));
    await page.waitForFunction(() => document.activeElement?.id === 'staking-ratio-history');
    const cardHistoryClosed = await page.evaluate(() => {
      const parent = document.getElementById('staking-chamber-modal');
      return {
        parentActive: parent?.classList.contains('active') || false,
        parentInert: parent?.hasAttribute('inert') || false,
        restored: document.activeElement?.id === 'staking-ratio-history',
        bodyLocked: document.body.style.overflow === 'hidden'
      };
    });
    assert(
      cardHistoryClosed.parentActive
        && !cardHistoryClosed.parentInert
        && cardHistoryClosed.restored
        && cardHistoryClosed.bodyLocked,
      `overlay stack card-history Escape closed/orphaned its Staking parent ${JSON.stringify(cardHistoryClosed)}`
    );

    await page.goto(`${baseUrl}/#contract=${SAMPLE_CONTRACT}`, { waitUntil: 'commit' });
    await page.locator('#native-explorer-overlay.active').waitFor({ state: 'visible', timeout: 30000 });
    await page.waitForFunction(() => document.activeElement?.classList.contains('native-explorer-close'));
    const nativeOpen = await page.evaluate(() => {
      const overlay = document.getElementById('native-explorer-overlay');
      const dialog = overlay?.querySelector('.native-explorer-content');
      const siblings = Array.from(document.body.children).filter((element) => (
        element !== overlay && !['SCRIPT', 'STYLE', 'LINK', 'META'].includes(element.tagName)
      ));
      return {
        role: dialog?.getAttribute('role') || '',
        modal: dialog?.getAttribute('aria-modal') || '',
        label: dialog?.getAttribute('aria-label') || '',
        focusedClose: document.activeElement?.classList.contains('native-explorer-close') || false,
        backgroundIsolated: siblings.length > 0 && siblings.every((element) => element.hasAttribute('inert')),
        bodyLocked: document.body.style.overflow === 'hidden' && document.documentElement.style.overflow === 'hidden'
      };
    });
    assert(
      nativeOpen.role === 'dialog'
        && nativeOpen.modal === 'true'
        && nativeOpen.label === 'Tezos native explorer'
        && nativeOpen.focusedClose
        && nativeOpen.backgroundIsolated
        && nativeOpen.bodyLocked,
      `overlay stack Native Explorer lifecycle is incomplete ${JSON.stringify(nativeOpen)}`
    );
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('native-explorer-overlay')?.classList.contains('active'));
    await page.waitForFunction(() => !new URLSearchParams(window.location.hash.slice(1)).has('contract'));
    const nativeClosed = await page.evaluate(() => ({
      active: document.activeElement?.id || document.activeElement?.tagName || '',
      bodyOverflow: document.body.style.overflow,
      htmlOverflow: document.documentElement.style.overflow,
      remainingInert: Array.from(document.body.children).filter((element) => (
        !['SCRIPT', 'STYLE', 'LINK', 'META'].includes(element.tagName)
        && element.id !== 'my-tezos-drawer'
        && element.hasAttribute('inert')
      )).map((element) => element.id || element.className || element.tagName)
    }));
    assert(
      nativeClosed.active !== 'BODY'
        && !nativeClosed.bodyOverflow
        && !nativeClosed.htmlOverflow
        && nativeClosed.remainingInert.length === 0,
      `overlay stack Native Explorer close did not restore direct-route focus/background ${JSON.stringify(nativeClosed)}`
    );

    await context.close();
    assert(issues.length === 0, `overlay stack browser issues:\n${issues.join('\n')}`);
    log('ok - shared overlay feature integrations');
  }

  async function smokeOverlayStack(browser, baseUrl) {
    const issues = [];
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(context);
    const page = await context.newPage();
    attachIssueCollectors(page, 'overlay stack', issues);
    const response = await page.goto(`${baseUrl}/widgets/block-height.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    assert(response?.ok(), `overlay stack fixture route failed with HTTP ${response?.status()}`);

    await page.evaluate(async () => {
      const overlayApi = await import('/js/ui/overlay-stack.js');
      const fallback = document.createElement('button');
      fallback.id = 'overlay-fixture-fallback';
      fallback.textContent = 'Fallback';
      fallback.style.cssText = 'position:fixed;left:4px;top:4px;width:80px;height:32px;';
      document.body.appendChild(fallback);

      const makeOverlay = (id, label) => {
        const overlay = document.createElement('div');
        overlay.id = id;
        overlay.setAttribute('aria-hidden', 'true');
        overlay.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;background:#111;z-index:20;';
        overlay.innerHTML = `
          <section class="fixture-dialog" style="display:grid;gap:8px;padding:20px;background:#222;">
            <h2 id="${id}-title">${label}</h2>
            <button class="fixture-first" type="button">First</button>
            <button class="fixture-opener" type="button">Open child</button>
            <button class="fixture-last" type="button">Last</button>
          </section>
        `;
        document.body.appendChild(overlay);
        return overlay;
      };

      const parent = makeOverlay('overlay-fixture-parent', 'Parent overlay');
      const closeParent = () => {
        overlayApi.deactivateOverlayDialog(parent);
        parent.remove();
      };
      overlayApi.activateOverlayDialog(parent, {
        close: closeParent,
        dialogSelector: '.fixture-dialog',
        titleId: 'overlay-fixture-parent-title',
        initialFocusSelector: '.fixture-first',
        restoreFocusSelector: '#overlay-fixture-fallback'
      });

      const openChild = () => {
        const child = makeOverlay('overlay-fixture-child', 'Child overlay');
        child.style.zIndex = '30';
        const closeChild = () => {
          overlayApi.deactivateOverlayDialog(child);
          child.remove();
        };
        overlayApi.activateOverlayDialog(child, {
          close: closeChild,
          dialogSelector: '.fixture-dialog',
          titleId: 'overlay-fixture-child-title',
          initialFocusSelector: '.fixture-first'
        });
        return child;
      };
      parent.querySelector('.fixture-opener').addEventListener('click', openChild);
      window.__overlayFixture = { overlayApi, parent, closeParent, openChild };
    });

    await page.waitForFunction(() => document.activeElement?.matches('#overlay-fixture-parent .fixture-first'));
    const parentOpen = await page.evaluate(() => {
      const parent = document.getElementById('overlay-fixture-parent');
      const dialog = parent?.querySelector('.fixture-dialog');
      return {
        role: dialog?.getAttribute('role') || '',
        modal: dialog?.getAttribute('aria-modal') || '',
        labelledBy: dialog?.getAttribute('aria-labelledby') || '',
        fallbackInert: document.getElementById('overlay-fixture-fallback')?.hasAttribute('inert') || false,
        bodyLocked: document.body.style.overflow === 'hidden' && document.documentElement.style.overflow === 'hidden'
      };
    });
    assert(
      parentOpen.role === 'dialog'
        && parentOpen.modal === 'true'
        && parentOpen.labelledBy === 'overlay-fixture-parent-title'
        && parentOpen.fallbackInert
        && parentOpen.bodyLocked,
      `overlay stack parent semantics/isolation missing ${JSON.stringify(parentOpen)}`
    );

    const ownedPortalOpen = await page.evaluate(() => {
      const portal = document.createElement('div');
      portal.id = 'overlay-owned-portal';
      portal.setAttribute('data-overlay-portal-owner', 'overlay-fixture-parent');
      portal.innerHTML = '<button type="button">Owned portal action</button>';
      document.body.appendChild(portal);
      window.__overlayFixture.overlayApi.reconcileOverlayEnvironment();
      return {
        portalInert: portal.hasAttribute('inert'),
        fallbackInert: document.getElementById('overlay-fixture-fallback')?.hasAttribute('inert') || false
      };
    });
    assert(
      !ownedPortalOpen.portalInert && ownedPortalOpen.fallbackInert,
      `overlay stack did not keep an exact parent-owned portal interactive ${JSON.stringify(ownedPortalOpen)}`
    );

    const lockReasserted = await page.evaluate(() => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
      window.__overlayFixture.overlayApi.reconcileOverlayEnvironment();
      return document.body.style.overflow === 'hidden'
        && document.documentElement.style.overflow === 'hidden';
    });
    assert(lockReasserted, 'overlay stack did not reassert scroll ownership after a legacy direct style restore');

    await page.locator('#overlay-fixture-parent .fixture-last').focus();
    await page.keyboard.press('Tab');
    const parentTabWrapState = await page.evaluate(() => ({
      active: document.activeElement?.className || document.activeElement?.id || document.activeElement?.tagName || '',
      exempt: Array.from(document.querySelectorAll('[data-overlay-stack-exempt]')).map((element) => ({
        id: element.id,
        hidden: element.hidden,
        className: element.className
      }))
    }));
    assert(
      parentTabWrapState.active === 'fixture-first',
      `overlay stack did not wrap Tab from the final control ${JSON.stringify(parentTabWrapState)}`
    );

    await page.locator('#overlay-fixture-parent .fixture-opener').click();
    await page.waitForFunction(() => document.activeElement?.matches('#overlay-fixture-child .fixture-first'));
    const childOpen = await page.evaluate(() => ({
      parentInert: document.getElementById('overlay-fixture-parent')?.hasAttribute('inert') || false,
      childInert: document.getElementById('overlay-fixture-child')?.hasAttribute('inert') || false,
      parentPortalInert: document.getElementById('overlay-owned-portal')?.hasAttribute('inert') || false,
      stackDepth: window.__overlayFixture.overlayApi.activeOverlayCount()
    }));
    assert(
      childOpen.parentInert && !childOpen.childInert && childOpen.parentPortalInert && childOpen.stackDepth === 2,
      `overlay stack child did not isolate its parent ${JSON.stringify(childOpen)}`
    );

    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('overlay-fixture-child'));
    await page.waitForFunction(() => document.activeElement?.matches('#overlay-fixture-parent .fixture-opener'));
    const childClosed = await page.evaluate(() => ({
      parentPresent: Boolean(document.getElementById('overlay-fixture-parent')),
      parentInert: document.getElementById('overlay-fixture-parent')?.hasAttribute('inert') || false,
      parentPortalInert: document.getElementById('overlay-owned-portal')?.hasAttribute('inert') || false,
      restoredToOpener: document.activeElement?.matches('#overlay-fixture-parent .fixture-opener') || false,
      stackDepth: window.__overlayFixture.overlayApi.activeOverlayCount(),
      bodyLocked: document.body.style.overflow === 'hidden'
    }));
    assert(
      childClosed.parentPresent
        && !childClosed.parentInert
        && !childClosed.parentPortalInert
        && childClosed.restoredToOpener
        && childClosed.stackDepth === 1
        && childClosed.bodyLocked,
      `overlay stack topmost Escape closed/orphaned the parent ${JSON.stringify(childClosed)}`
    );

    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('overlay-fixture-parent'));
    await page.waitForFunction(() => document.activeElement?.id === 'overlay-fixture-fallback');
    const parentClosed = await page.evaluate(() => ({
      fallbackFocused: document.activeElement?.id === 'overlay-fixture-fallback',
      fallbackInert: document.getElementById('overlay-fixture-fallback')?.hasAttribute('inert') || false,
      stackDepth: window.__overlayFixture.overlayApi.activeOverlayCount(),
      bodyOverflow: document.body.style.overflow,
      htmlOverflow: document.documentElement.style.overflow
    }));
    assert(
      parentClosed.fallbackFocused
        && !parentClosed.fallbackInert
        && parentClosed.stackDepth === 0
        && !parentClosed.bodyOverflow
        && !parentClosed.htmlOverflow,
      `overlay stack direct fallback/scroll restoration failed ${JSON.stringify(parentClosed)}`
    );

    await page.evaluate(() => {
      const { overlayApi } = window.__overlayFixture;
      const fallback = document.getElementById('overlay-fixture-fallback');
      fallback.focus();
      const overlay = document.createElement('div');
      overlay.id = 'overlay-late-focus-cleanup';
      overlay.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;background:#111;z-index:20;';
      overlay.innerHTML = '<div class="fixture-dialog"><button type="button">Close</button></div>';
      document.body.appendChild(overlay);
      overlayApi.activateOverlayDialog(overlay, {
        close() {},
        dialogSelector: '.fixture-dialog',
        label: 'Late focus cleanup',
        restoreFocusSelector: '#overlay-fixture-fallback'
      });
      overlayApi.deactivateOverlayDialog(overlay);
      overlay.remove();
      window.__lateOverlayCleanupApplied = false;
      requestAnimationFrame(() => {
        document.body.setAttribute('tabindex', '-1');
        document.body.focus({ preventScroll: true });
        document.body.removeAttribute('tabindex');
        window.__lateOverlayCleanupApplied = true;
      });
    });
    // Do not accept the pre-cleanup focus state as proof of later recovery.
    await page.waitForFunction(() => window.__lateOverlayCleanupApplied && document.activeElement?.id === 'overlay-fixture-fallback');
    assert(
      await page.evaluate(() => document.activeElement?.id === 'overlay-fixture-fallback'),
      'overlay stack did not recover focus after late route/fade cleanup moved it to BODY'
    );

    await page.evaluate(() => {
      const { overlayApi } = window.__overlayFixture;
      const choice = document.createElement('button');
      choice.id = 'overlay-user-focus-choice';
      choice.type = 'button';
      choice.textContent = 'Reader choice';
      document.body.appendChild(choice);
      const overlay = document.createElement('div');
      overlay.id = 'overlay-user-focus-guard';
      overlay.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;background:#111;z-index:20;';
      overlay.innerHTML = '<div class="fixture-dialog"><button type="button">Close</button></div>';
      document.body.appendChild(overlay);
      overlayApi.activateOverlayDialog(overlay, {
        close() {},
        dialogSelector: '.fixture-dialog',
        label: 'Reader focus choice',
        restoreFocusSelector: '#overlay-fixture-fallback'
      });
      overlayApi.deactivateOverlayDialog(overlay);
      overlay.remove();
    });
    await page.locator('#overlay-user-focus-choice').click();
    await page.waitForTimeout(500);
    assert(
      await page.evaluate(() => document.activeElement?.id === 'overlay-user-focus-choice'),
      'overlay stack focus retry overrode a reader-selected control after close'
    );
    await page.evaluate(() => document.getElementById('overlay-user-focus-choice')?.remove());

    await page.evaluate(() => {
      const { overlayApi } = window.__overlayFixture;
      const build = (id, z) => {
        const overlay = document.createElement('div');
        overlay.id = id;
        overlay.style.cssText = `position:fixed;inset:0;display:block;z-index:${z};background:#111;`;
        overlay.innerHTML = `<div class="fixture-dialog"><button type="button">Close</button></div>`;
        document.body.appendChild(overlay);
        return overlay;
      };
      const parent = build('overlay-orphan-parent', 20);
      const child = build('overlay-orphan-child', 30);
      const closeChild = () => {
        overlayApi.deactivateOverlayDialog(child);
        child.remove();
      };
      overlayApi.activateOverlayDialog(parent, {
        close: () => {},
        dialogSelector: '.fixture-dialog',
        label: 'Orphan parent',
        restoreFocusSelector: '#overlay-fixture-fallback'
      });
      overlayApi.activateOverlayDialog(child, {
        close: closeChild,
        dialogSelector: '.fixture-dialog',
        label: 'Orphan child'
      });
      overlayApi.deactivateOverlayDialog(parent);
      parent.remove();
    });
    await page.waitForFunction(() => !document.getElementById('overlay-orphan-parent') && !document.getElementById('overlay-orphan-child'));
    assert(
      await page.evaluate(() => window.__overlayFixture.overlayApi.activeOverlayCount() === 0),
      'overlay stack parent deactivation left a child orphan registered'
    );

    const throwingChild = await page.evaluate(() => {
      const { overlayApi } = window.__overlayFixture;
      const build = (id, z) => {
        const overlay = document.createElement('div');
        overlay.id = id;
        overlay.style.cssText = `position:fixed;inset:0;z-index:${z};background:#111;`;
        overlay.innerHTML = '<div class="fixture-dialog"><button type="button">Close</button></div>';
        document.body.appendChild(overlay);
        return overlay;
      };
      let closeErrors = 0;
      const onCloseError = () => { closeErrors += 1; };
      document.addEventListener('tezos:overlay-close-error', onCloseError);
      const parent = build('overlay-throw-parent', 20);
      const child = build('overlay-throw-child', 30);
      overlayApi.activateOverlayDialog(parent, {
        close() {},
        dialogSelector: '.fixture-dialog',
        label: 'Throw parent'
      });
      overlayApi.activateOverlayDialog(child, {
        close() { throw new Error('fixture child close failure'); },
        dialogSelector: '.fixture-dialog',
        label: 'Throw child'
      });
      overlayApi.deactivateOverlayDialog(parent, { restoreFocus: false });
      parent.remove();
      child.remove();
      document.removeEventListener('tezos:overlay-close-error', onCloseError);
      return {
        bodyOverflow: document.body.style.overflow,
        childAriaHidden: child.getAttribute('aria-hidden'),
        closeErrors,
        fallbackInert: document.getElementById('overlay-fixture-fallback')?.hasAttribute('inert') || false,
        htmlOverflow: document.documentElement.style.overflow,
        stackDepth: overlayApi.activeOverlayCount()
      };
    });
    assert(
      throwingChild.closeErrors === 1
        && throwingChild.childAriaHidden === 'true'
        && throwingChild.stackDepth === 0
        && !throwingChild.fallbackInert
        && !throwingChild.bodyOverflow
        && !throwingChild.htmlOverflow,
      `overlay stack child-close exception stranded global state ${JSON.stringify(throwingChild)}`
    );

    await page.evaluate(() => {
      const { overlayApi } = window.__overlayFixture;
      const overlay = document.createElement('div');
      overlay.id = 'overlay-raw-removal';
      overlay.style.cssText = 'position:fixed;inset:0;z-index:20;background:#111;';
      overlay.innerHTML = '<div class="fixture-dialog"><button type="button">Close</button></div>';
      document.body.appendChild(overlay);
      overlayApi.activateOverlayDialog(overlay, {
        close() {},
        dialogSelector: '.fixture-dialog',
        label: 'Raw removal'
      });
      overlay.remove();
    });
    await page.waitForFunction(() => (
      !document.body.style.overflow
        && !document.documentElement.style.overflow
        && !document.getElementById('overlay-fixture-fallback')?.hasAttribute('inert')
    ));
    await page.evaluate(() => document.getElementById('overlay-owned-portal')?.remove());
    const rawRemoval = await page.evaluate(() => ({
      bodyOverflow: document.body.style.overflow,
      fallbackInert: document.getElementById('overlay-fixture-fallback')?.hasAttribute('inert') || false,
      htmlOverflow: document.documentElement.style.overflow,
      stackDepth: window.__overlayFixture.overlayApi.activeOverlayCount()
    }));
    assert(
      rawRemoval.stackDepth === 0
        && !rawRemoval.fallbackInert
        && !rawRemoval.bodyOverflow
        && !rawRemoval.htmlOverflow,
      `overlay stack raw DOM removal left stale global state ${JSON.stringify(rawRemoval)}`
    );

    await context.close();
    assert(issues.length === 0, `overlay stack browser issues:\n${issues.join('\n')}`);
    log('ok - shared overlay stack smoke');
  }

  return { smokeRouteSearchState, smokeBreakpointAccessibility, smokeHashModalCleanup, smokeOverlayFeatureIntegrations, smokeOverlayStack };
}
