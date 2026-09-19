// Browser workflows owned by my-tezos-account. Shared dependencies remain explicit.
export function createMyTezosAccountSmokeSuites({
  OVERDELEGATED_ADDRESS,
  SAMPLE_ADDRESS,
  SAMPLE_ADDRESS_2,
  SAMPLE_DELEGATOR_ADDRESS,
  SAMPLE_ETHERLINK_ADDRESS,
  SAMPLE_HEAVY_STAKER_ADDRESS,
  SAMPLE_IDLE_ADDRESS,
  SAMPLE_LARGE_STAKER_ADDRESS,
  SAMPLE_REGULAR_DELEGATOR_ADDRESS,
  SAMPLE_SMALL_DELEGATOR_ADDRESS,
  SAMPLE_STAKER_ADDRESS,
  assert,
  attachIssueCollectors,
  expectClassContains,
  fulfillJson,
  installFeatureMocks,
  installOctezConnectMock,
  log,
  openMyTezosSmokeView,
  revealMyTezosAccountControls,
  sleep
}) {
  async function smokeMyTezosColdStart(browser, baseUrl) {
    const viewports = [
      { label: 'desktop', viewport: { width: 1440, height: 1000 } },
      { label: 'mobile', viewport: { width: 390, height: 844 } }
    ];

    for (const { label, viewport } of viewports) {
      const issues = [];
      const context = await browser.newContext({
        viewport,
        serviceWorkers: 'block'
      });
      await installFeatureMocks(context);
      await context.addInitScript(() => {
        localStorage.setItem('tezos-systems-theme', 'matrix');
        localStorage.setItem('tezos-toured', '1');
        localStorage.setItem('tezos-welcomed', '1');
        localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
      });

      let markCssRequested;
      let releaseCss;
      const cssRequested = new Promise((resolve) => { markCssRequested = resolve; });
      const cssRelease = new Promise((resolve) => { releaseCss = resolve; });
      const page = await context.newPage();
      attachIssueCollectors(page, `my tezos cold start ${label}`, issues);
      await page.route('**/css/my-tezos.min.css*', async (route) => {
        markCssRequested();
        const response = await route.fetch();
        await cssRelease;
        await route.fulfill({ response });
      });

      try {
        const response = await page.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'commit' });
        assert(response?.ok(), `my tezos cold start ${label}: dashboard failed with HTTP ${response?.status()}`);
        await page.locator('#my-tezos-drawer').waitFor({ state: 'attached', timeout: 15000 });
        await page.waitForFunction(() => document.querySelector('#my-tezos-btn')?.dataset.drawerWired === '1');
        assert(await page.locator('#my-tezos-css').count() === 0, 'Drawer CSS stays absent until intent');
        await page.locator('#my-tezos-btn').hover();
        await Promise.race([
          cssRequested,
          sleep(15000).then(() => { throw new Error(`my tezos cold start ${label}: lazy drawer CSS was never requested`); })
        ]);

        const beforeCss = await page.evaluate(() => {
          const drawer = document.querySelector('#my-tezos-drawer');
          const scrim = document.querySelector('#my-tezos-drawer-scrim');
          const link = document.querySelector('#my-tezos-css');
          const drawerRect = drawer.getBoundingClientRect();
          const drawerStyle = getComputedStyle(drawer);
          const scrimStyle = getComputedStyle(scrim);
          return {
            cssLoaded: Boolean(link?.sheet),
            drawerClass: drawer.className,
            ariaHidden: drawer.getAttribute('aria-hidden'),
            inert: drawer.hasAttribute('inert'),
            position: drawerStyle.position,
            transform: drawerStyle.transform,
            transitionDuration: drawerStyle.transitionDuration,
            left: drawerRect.left,
            right: drawerRect.right,
            viewportWidth: window.innerWidth,
            intersectsViewport: drawerRect.left < window.innerWidth && drawerRect.right > 0,
            scrimOpacity: scrimStyle.opacity,
            scrimPointerEvents: scrimStyle.pointerEvents
          };
        });
        assert(!beforeCss.cssLoaded, `my tezos cold start ${label}: lazy CSS gate did not hold ${JSON.stringify(beforeCss)}`);
        assert(
          beforeCss.position === 'fixed'
            && beforeCss.transform !== 'none'
            && beforeCss.left >= beforeCss.viewportWidth - 1
            && !beforeCss.intersectsViewport,
          `my tezos cold start ${label}: raw drawer became visible before lazy CSS ${JSON.stringify(beforeCss)}`
        );
        assert(
          beforeCss.drawerClass.split(/\s+/).includes('my-tezos-drawer')
            && !beforeCss.drawerClass.split(/\s+/).includes('open')
            && beforeCss.ariaHidden === 'true'
            && beforeCss.inert
            && beforeCss.transitionDuration === '0s',
          `my tezos cold start ${label}: closed drawer startup state drifted ${JSON.stringify(beforeCss)}`
        );
        assert(
          beforeCss.scrimOpacity === '0' && beforeCss.scrimPointerEvents === 'none',
          `my tezos cold start ${label}: scrim was visible or interactive before lazy CSS ${JSON.stringify(beforeCss)}`
        );

        await page.locator('#my-tezos-btn').click();
        assert(await page.locator('#my-tezos-btn').getAttribute('aria-busy') === 'true', 'First activation waits for CSS');
        assert(await page.locator('#my-tezos-drawer').getAttribute('aria-hidden') === 'true', 'Pending drawer stays inert and hidden');
        await page.keyboard.press('Escape');
        releaseCss();
        await page.waitForFunction(() => Boolean(document.querySelector('#my-tezos-css')?.sheet), null, { timeout: 15000 });
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const afterCss = await page.evaluate(() => {
          const drawer = document.querySelector('#my-tezos-drawer');
          const rect = drawer.getBoundingClientRect();
          return {
            left: rect.left,
            right: rect.right,
            viewportWidth: window.innerWidth,
            transform: getComputedStyle(drawer).transform,
            transitionDuration: getComputedStyle(drawer).transitionDuration,
            intersectsViewport: rect.left < window.innerWidth && rect.right > 0
          };
        });
        assert(
          afterCss.left >= afterCss.viewportWidth - 1
            && !afterCss.intersectsViewport
            && afterCss.transform !== 'none'
            && afterCss.transitionDuration === '0.35s',
          `my tezos cold start ${label}: loading full drawer CSS moved the closed drawer through the viewport ${JSON.stringify(afterCss)}`
        );

        await page.locator('#my-tezos-btn').click();
        await page.waitForFunction(() => {
          const drawer = document.querySelector('#my-tezos-drawer');
          const rect = drawer?.getBoundingClientRect();
          return drawer?.classList.contains('open') && rect && rect.right <= window.innerWidth + 1 && rect.left < window.innerWidth - 1;
        }, null, { timeout: 5000 });
        const openState = await page.evaluate(() => {
          const drawer = document.querySelector('#my-tezos-drawer');
          const rect = drawer.getBoundingClientRect();
          return {
            ariaHidden: drawer.getAttribute('aria-hidden'),
            inert: drawer.hasAttribute('inert'),
            left: rect.left,
            right: rect.right,
            viewportWidth: window.innerWidth
          };
        });
        assert(
          openState.ariaHidden === 'false'
            && !openState.inert
            && openState.left < openState.viewportWidth
            && openState.right <= openState.viewportWidth + 1,
          `my tezos cold start ${label}: drawer did not open normally after lazy CSS settled ${JSON.stringify(openState)}`
        );

        await page.locator('#drawer-close').click();
        await page.waitForFunction(() => {
          const drawer = document.querySelector('#my-tezos-drawer');
          return !drawer?.classList.contains('open') && drawer?.getBoundingClientRect().left >= window.innerWidth - 1;
        }, null, { timeout: 5000 });
        const closedState = await page.evaluate(() => {
          const drawer = document.querySelector('#my-tezos-drawer');
          return {
            ariaHidden: drawer.getAttribute('aria-hidden'),
            inert: drawer.hasAttribute('inert'),
            left: drawer.getBoundingClientRect().left,
            viewportWidth: window.innerWidth
          };
        });
        assert(
          closedState.ariaHidden === 'true'
            && closedState.inert
            && closedState.left >= closedState.viewportWidth - 1,
          `my tezos cold start ${label}: normal close behavior regressed ${JSON.stringify(closedState)}`
        );
      } finally {
        releaseCss();
        await context.close();
      }

      assert(issues.length === 0, `my tezos cold start ${label} browser issues:\n${issues.join('\n')}`);
    }

    log('ok - my tezos cold start smoke');
  }

  async function smokeMyTezosIdleAccount(browser, baseUrl) {
    for (const { label, viewport } of [
      { label: 'desktop', viewport: { width: 1280, height: 900 } },
      { label: 'mobile', viewport: { width: 390, height: 844 } }
    ]) {
      const issues = [];
      const context = await browser.newContext({
        viewport,
        serviceWorkers: 'block'
      });
      await installFeatureMocks(context);
      await context.addInitScript(() => {
        localStorage.setItem('tezos-systems-theme', 'aurora');
        localStorage.setItem('tezos-toured', '1');
        localStorage.setItem('tezos-welcomed', '1');
        localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
        localStorage.removeItem('tezos-systems-my-baker-address');
        localStorage.removeItem('tezos-systems-overnight-snapshot');
        localStorage.removeItem('tezos-systems-daily-snapshot');
      });

      const page = await context.newPage();
      attachIssueCollectors(page, `my tezos idle account ${label}`, issues);
      const response = await page.goto(`${baseUrl}/my/`, { waitUntil: 'domcontentloaded' });
      assert(response?.ok(), `my tezos idle account ${label}: /my/ failed with HTTP ${response?.status()}`);
      await page.locator('#my-tezos-drawer.open').waitFor({ state: 'visible', timeout: 15000 });
      await page.locator('#drawer-address-input').fill(SAMPLE_IDLE_ADDRESS);
      await page.locator('#drawer-connect-btn').click();
      try {
        await page.waitForFunction((address) => {
          return window._myTezosData?.fullAddress === address
            && window._myTezosData?.bakerAddr == null
            && window._myTezosData?.loading !== true
            && document.querySelector('#drawer-connected')?.classList.contains('is-without-baker')
            && document.querySelector('#drawer-brief')?.classList.contains('is-without-baker')
            && (
              document.querySelector('#drawer-baker .drawer-no-baker')
              || document.querySelectorAll('#my-baker-results .my-baker-stat').length >= 3
            );
        }, SAMPLE_IDLE_ADDRESS, { timeout: 15000 });
      } catch (error) {
        const diagnostic = await page.evaluate(() => ({
          data: window._myTezosData || null,
          connectedClass: document.querySelector('#drawer-connected')?.className || '',
          briefClass: document.querySelector('#drawer-brief')?.className || '',
          briefText: document.querySelector('#drawer-brief')?.textContent?.replace(/\s+/g, ' ').trim() || '',
          bakerText: document.querySelector('#my-baker-results')?.textContent?.replace(/\s+/g, ' ').trim() || '',
          bakerStats: document.querySelectorAll('#my-baker-results .my-baker-stat').length
        }));
        throw new Error(`my tezos idle account ${label}: did not settle ${JSON.stringify(diagnostic)}\n${error.message}`);
      }
      try {
        await page.waitForFunction(() => document.querySelector('#my-tezos-delegation-guidance .my-tezos-builder-baker strong')?.textContent?.includes('Baking Benjamins'), null, { timeout: 10000 });
      } catch (error) {
        const guidanceDiagnostic = await page.locator('#my-tezos-delegation-guidance').evaluate((node) => ({
          hidden: node.hidden,
          html: node.innerHTML,
          requestSeq: window._myTezosData?.fullAddress || ''
        }));
        throw new Error(`my tezos idle account ${label}: delegation guidance did not settle ${JSON.stringify(guidanceDiagnostic)}\n${error.message}`);
      }
      await page.waitForTimeout(120);

      const state = await page.evaluate(() => {
        const drawer = document.querySelector('#my-tezos-drawer');
        const connected = document.querySelector('#drawer-connected');
        const columns = document.querySelector('.drawer-live-columns');
        const brief = document.querySelector('#drawer-brief');
        const briefCards = Array.from(brief?.querySelectorAll('.brief-section') || []);
        const columnRect = columns?.getBoundingClientRect();
        const rewardsRect = document.querySelector('#drawer-rewards')?.getBoundingClientRect();
        const briefRect = brief?.getBoundingClientRect();
        const networkRect = document.querySelector('#drawer-network')?.getBoundingClientRect();
        const directoryAction = document.querySelector('#my-tezos-delegation-guidance .my-tezos-directory-action');
        const directoryLabel = directoryAction?.querySelector('.my-tezos-directory-label');
        const guideRect = document.querySelector('.my-tezos-delegation-guide')?.getBoundingClientRect();
        const directoryActionRect = directoryAction?.getBoundingClientRect();
        const directoryLabelRect = directoryLabel?.getBoundingClientRect();
        const directoryActionStyle = directoryAction ? getComputedStyle(directoryAction) : null;
        const fullWidth = (rect) => Boolean(
          rect
          && columnRect
          && Math.abs(rect.left - columnRect.left) <= 1
          && Math.abs(rect.right - columnRect.right) <= 1
        );
        return {
          connectedClass: connected?.className || '',
          briefClass: brief?.className || '',
          briefTitles: briefCards.map((card) => card.querySelector('.brief-section-title')?.textContent?.replace(/\s+/g, ' ').trim() || ''),
          briefFullWidth: briefCards.every((card) => {
            const rect = card.getBoundingClientRect();
            const parent = brief.getBoundingClientRect();
            return Math.abs(rect.left - parent.left) <= 1 && Math.abs(rect.right - parent.right) <= 1;
          }),
          liveColumns: getComputedStyle(columns).gridTemplateColumns,
          rewardsFullWidth: fullWidth(rewardsRect),
          briefSectionFullWidth: fullWidth(briefRect),
          networkFullWidth: fullWidth(networkRect),
          liveOrder: Boolean(rewardsRect && briefRect && networkRect && briefRect.top >= rewardsRect.bottom && networkRect.top >= briefRect.bottom),
          overviewBakerPanels: document.querySelectorAll('#my-tezos-panel-overview #drawer-baker, #my-tezos-panel-overview #drawer-baker-activity, #my-tezos-panel-overview #my-tezos-delegation-guidance').length,
          awayCards: document.querySelectorAll('#drawer-network .network-away-card').length,
          awaySlotEmpty: (() => {
            const slot = document.querySelector('#drawer-network [data-network-away-slot]');
            return !slot || slot.childElementCount === 0;
          })(),
          reportCards: document.querySelectorAll('#drawer-baker .report-card-btn').length,
          noBakerCopy: document.querySelector('#drawer-baker .drawer-no-baker')?.textContent?.replace(/\s+/g, ' ').trim() || '',
          accountStats: document.querySelector('#my-baker-results')?.textContent?.replace(/\s+/g, ' ').trim() || '',
          operatorHidden: Boolean(document.querySelector('#drawer-operator-status')?.hidden),
          activityHidden: Boolean(document.querySelector('#drawer-baker-activity')?.hidden),
          guidance: document.querySelector('#my-tezos-delegation-guidance')?.textContent?.replace(/\s+/g, ' ').trim() || '',
          directoryHref: document.querySelector('#my-tezos-delegation-guidance a[href^="/leaderboard/"]')?.getAttribute('href') || '',
          directoryActionText: directoryAction?.textContent?.replace(/\s+/g, ' ').trim() || '',
          directoryActionHeight: directoryActionRect?.height || 0,
          directoryActionWidth: directoryActionRect?.width || 0,
          directoryActionPaddingInline: directoryActionStyle
            ? Math.min(parseFloat(directoryActionStyle.paddingLeft) || 0, parseFloat(directoryActionStyle.paddingRight) || 0)
            : 0,
          directoryActionContained: Boolean(
            directoryActionRect
            && guideRect
            && directoryActionRect.left >= guideRect.left - 1
            && directoryActionRect.right <= guideRect.right + 1
          ),
          directoryLabelContained: Boolean(
            directoryActionRect
            && directoryLabelRect
            && directoryLabelRect.left >= directoryActionRect.left + 8
            && directoryLabelRect.right <= directoryActionRect.right - 8
          ),
          directoryActionOverflows: Boolean(
            directoryAction
            && (
              directoryAction.scrollWidth > directoryAction.clientWidth + 1
              || directoryAction.scrollHeight > directoryAction.clientHeight + 1
            )
          ),
          bakerReviewHref: document.querySelector('#my-tezos-delegation-guidance a[href*="baker="]')?.getAttribute('href') || '',
          directDelegationDisabled: Boolean(document.querySelector('[data-my-tezos-bb-delegate]')?.disabled),
          drawerOverflow: drawer.scrollWidth > drawer.clientWidth + 1,
          pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
        };
      });

      assert(
        state.connectedClass.includes('is-without-baker')
          && state.briefClass.includes('is-without-baker')
          && state.briefTitles.length === 1
          && !state.briefTitles.some((title) => /Your Tezos Story/.test(title))
          && !state.briefTitles.some((title) => /Baker Status/.test(title))
          && state.briefFullWidth,
        `my tezos idle account ${label}: redundant baker brief or split-card geometry remained ${JSON.stringify(state)}`
      );
      assert(
        state.rewardsFullWidth
          && state.briefSectionFullWidth
          && state.overviewBakerPanels === 0
          && state.networkFullWidth
          && state.liveOrder,
        `my tezos idle account ${label}: live sections did not collapse into one readable column ${JSON.stringify(state)}`
      );
      assert(
        state.awayCards === 0 && state.awaySlotEmpty,
        `my tezos idle account ${label}: empty evidence rendered an away-report shell ${JSON.stringify(state)}`
      );
      assert(
        state.reportCards === 0
          && (
            /isn't delegated or staking/.test(state.noBakerCopy)
            || (/Delegate\s*None/.test(state.accountStats) && /Reward Status\s*Not active/.test(state.accountStats))
          )
          && state.operatorHidden
          && state.activityHidden,
        `my tezos idle account ${label}: baker-only controls survived the idle state ${JSON.stringify(state)}`
      );
      await page.locator('#my-tezos-tab-baker-signal').click();
      const guidanceGeometry = await page.evaluate(() => {
        const action = document.querySelector('#my-tezos-delegation-guidance .my-tezos-directory-action');
        const label = action.querySelector('.my-tezos-directory-label');
        const guide = action.closest('.my-tezos-delegation-guide');
        const box = action.getBoundingClientRect();
        const labelBox = label.getBoundingClientRect();
        const guideBox = guide.getBoundingClientRect();
        return {
          directoryActionHeight: box.height,
          directoryActionWidth: box.width,
          directoryActionPaddingInline: Math.min(parseFloat(getComputedStyle(action).paddingLeft), parseFloat(getComputedStyle(action).paddingRight)),
          directoryActionContained: box.left >= guideBox.left - 1 && box.right <= guideBox.right + 1,
          directoryLabelContained: labelBox.left >= box.left + 8 && labelBox.right <= box.right - 8,
          directoryActionOverflows: action.scrollWidth > action.clientWidth + 1 || action.scrollHeight > action.clientHeight + 1,
          drawerOverflow: document.getElementById('drawer-body').scrollWidth > document.getElementById('drawer-body').clientWidth + 1,
          gradeCount: document.querySelectorAll('#drawer-baker .drawer-baker-grade').length
        };
      });
      Object.assign(state, guidanceGeometry);
      assert(state.gradeCount === 0, 'An undelegated account must not retain the previous baker grade');
      assert(
        state.guidance.includes('Delegate to an active baker you trust')
          && state.guidance.includes('Delegate to the builder of this site')
          && state.guidance.includes('Baking Benjamins')
          && state.guidance.includes('reported delegation room')
          && state.directoryHref === '/leaderboard/?view=directory'
          && state.bakerReviewHref.includes('baker=')
          && state.directDelegationDisabled,
        `my tezos idle account ${label}: transparent baker guidance or disconnected-wallet gating is missing ${JSON.stringify(state)}`
      );
      assert(
        state.directoryActionText.includes('Compare all active bakers')
          && state.directoryActionHeight >= 42
          && state.directoryActionWidth >= 260
          && state.directoryActionPaddingInline >= 10
          && state.directoryActionContained
          && state.directoryLabelContained
          && !state.directoryActionOverflows,
        `my tezos idle account ${label}: baker-directory action is cramped or clipped ${JSON.stringify(state)}`
      );
      assert(!state.drawerOverflow && !state.pageOverflow, `my tezos idle account ${label}: layout overflowed ${JSON.stringify(state)}`);

      await context.close();
      assert(issues.length === 0, `my tezos idle account ${label} browser issues:\n${issues.join('\n')}`);
    }

    log('ok - my tezos idle account layout');
  }

  async function smokeMyTezosEmptyState(browser, baseUrl) {
    for (const { label, viewport } of [
      { label: 'desktop', viewport: { width: 1280, height: 900 } },
      { label: 'mobile', viewport: { width: 390, height: 844 } }
    ]) {
      const issues = [];
      const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
      await installFeatureMocks(context);
      await context.addInitScript(() => {
        localStorage.setItem('tezos-systems-theme', 'matrix');
        localStorage.setItem('tezos-toured', '1');
        localStorage.setItem('tezos-welcomed', '1');
        localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
        localStorage.removeItem('tezos-systems-my-baker-address');
        localStorage.removeItem('tezos-systems-octez-wallet-address');
      });

      const page = await context.newPage();
      attachIssueCollectors(page, `my tezos empty state ${label}`, issues);
      const response = await page.goto(`${baseUrl}/my/`, { waitUntil: 'domcontentloaded' });
      assert(response?.ok(), `my tezos empty state ${label}: /my/ failed with HTTP ${response?.status()}`);
      await page.locator('#my-tezos-drawer.open').waitFor({ state: 'visible', timeout: 15000 });
      await page.waitForFunction(() => Boolean(document.querySelector('#my-tezos-css')?.sheet), null, { timeout: 15000 });

      const tour = page.locator('[data-quiet-key="my-tezos-tour"]');
      assert(!(await tour.evaluate(node => node.open)), 'Account view tour starts collapsed');
      await tour.locator('summary').click();
      assert(await page.locator('#my-tezos-onboarding-features-title').isVisible(), 'The full seven-view tour is available on request');
      await page.locator('#drawer-body').evaluate(node => node.scrollTop = 0);

      const state = await page.evaluate(() => {
        const drawer = document.querySelector('#my-tezos-drawer');
        const body = document.querySelector('#drawer-body');
        const empty = document.querySelector('#drawer-empty-state');
        const startCards = Array.from(document.querySelectorAll('.my-tezos-start-card'));
        const featureCards = Array.from(document.querySelectorAll('.my-tezos-feature-map article'));
        const walletButton = document.querySelector('#drawer-wallet-connect-btn');
        const trackButton = document.querySelector('#drawer-connect-btn');
        const input = document.querySelector('#drawer-address-input');
        const bodyRect = body.getBoundingClientRect();
        const insideBody = (element) => {
          const rect = element.getBoundingClientRect();
          return rect.left >= bodyRect.left - 1 && rect.right <= bodyRect.right + 1;
        };
        return {
          text: empty.innerText,
          featureTitles: featureCards.map((card) => card.querySelector('strong')?.textContent?.trim() || ''),
          startRows: new Set(startCards.map((card) => Math.round(card.getBoundingClientRect().top))).size,
          featureRows: new Set(featureCards.map((card) => Math.round(card.getBoundingClientRect().top))).size,
          startCardCount: startCards.length,
          featureCardCount: featureCards.length,
          cardsInside: [...startCards, ...featureCards].every(insideBody),
          walletLabel: walletButton?.textContent?.trim() || '',
          walletStatus: document.querySelector('#drawer-wallet-status')?.textContent?.trim() || '',
          trackLabel: trackButton?.textContent?.trim() || '',
          inputPlaceholder: input?.getAttribute('placeholder') || '',
          actionTops: {
            wallet: walletButton?.getBoundingClientRect().top ?? null,
            watch: input?.getBoundingClientRect().top ?? null
          },
          actionsReadable: [walletButton, trackButton].every((button) => (
            button
            && button.getBoundingClientRect().height >= 38
            && button.scrollWidth <= button.clientWidth + 1
          )),
          emptyOverflow: empty.scrollWidth > empty.clientWidth + 1,
          drawerOverflow: drawer.scrollWidth > drawer.clientWidth + 1,
          pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
        };
      });

      for (const phrase of [
        'Connect Temple, Kukai, or another Tezos wallet',
        'Octez.Connect',
        'does not create or submit an operation',
        'Track a public address or .tez name',
        'No wallet extension, pairing, or signature is needed',
        'Seven views, one saved L1 identity',
        'Ledger Flow and Maxi Passport'
      ]) {
        assert(state.text.includes(phrase), `my tezos empty state ${label}: missing "${phrase}" ${JSON.stringify(state)}`);
      }
      assert(
        JSON.stringify(state.featureTitles) === JSON.stringify(['Overview', 'Baker Signal', 'Portfolio', 'Transactions', 'Collection', 'Your Story', 'Tezos X']),
        `my tezos empty state ${label}: feature map drifted ${JSON.stringify(state)}`
      );
      assert(
        state.startCardCount === 2
          && state.featureCardCount === 7
          && state.cardsInside
          && state.actionsReadable,
        `my tezos empty state ${label}: onboarding geometry or controls regressed ${JSON.stringify(state)}`
      );
      assert(
        state.walletLabel === 'Connect Tezos wallet'
          && state.walletStatus === 'Octez.Connect · Not connected'
          && state.trackLabel === 'Track address'
          && state.inputPlaceholder === 'tz1… or wallet.tez',
        `my tezos empty state ${label}: setup paths are unclear ${JSON.stringify(state)}`
      );
      if (label === 'desktop') {
        assert(state.startRows === 1 && state.featureRows === 3, `my tezos empty state desktop: expected paired setup and three-column feature map ${JSON.stringify(state)}`);
        assert(
          Math.abs(state.actionTops.wallet - state.actionTops.watch) <= 1,
          `my tezos empty state desktop: wallet and watch-only controls are not level ${JSON.stringify(state.actionTops)}`
        );
      } else {
        assert(state.startRows === 2 && state.featureRows === 7, `my tezos empty state mobile: expected readable single-column setup and feature map ${JSON.stringify(state)}`);
      }
      assert(!state.emptyOverflow && !state.drawerOverflow && !state.pageOverflow, `my tezos empty state ${label}: horizontal overflow ${JSON.stringify(state)}`);

      for (const view of ['baker-signal', 'portfolio', 'transactions', 'collection', 'story', 'tezos-x']) {
        await page.locator(`#my-tezos-tab-${view}`).click();
        const emptyLayout = await page.evaluate(() => {
          const body = document.getElementById('drawer-body');
          const journeys = document.getElementById('drawer-more-section');
          const button = document.getElementById('my-tezos-baker-signal-overview');
          return {
            overflow: body.scrollWidth - body.clientWidth,
            orphanJourneyHeading: journeys.hidden && getComputedStyle(journeys).display !== 'none',
            actionWidth: button.clientWidth,
            actionOverflow: button.scrollHeight - button.clientHeight
          };
        });
        assert(emptyLayout.overflow <= 1 && !emptyLayout.orphanJourneyHeading, `My Tezos empty ${view} ${label}: ${JSON.stringify(emptyLayout)}`);
        if (view === 'baker-signal') {
          assert(emptyLayout.actionWidth > 100 && emptyLayout.actionOverflow <= 1, `Baker Signal setup action must fit its label: ${JSON.stringify(emptyLayout)}`);
          await page.locator('#my-tezos-baker-signal-overview').click();
          assert(await page.locator('#my-tezos-tab-overview').getAttribute('aria-selected') === 'true', 'Empty Baker Signal returns to account setup');
        }
      }

      await context.close();
      assert(issues.length === 0, `my tezos empty state ${label} browser issues:\n${issues.join('\n')}`);
    }
    log('ok - my tezos empty state');
  }

  async function smokeMyTezosWalletConnect(browser, baseUrl) {
    const issues = [];
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(context);
    await installOctezConnectMock(context);
    await context.addInitScript(() => {
      localStorage.setItem('tezos-systems-theme', 'matrix');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    });

    const page = await context.newPage();
    attachIssueCollectors(page, 'my tezos wallet connect', issues);
    const response = await page.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `my tezos wallet connect: dashboard failed with HTTP ${response?.status()}`);
    await page.locator('main').waitFor({ state: 'visible', timeout: 15000 });

    await page.locator('#my-tezos-btn[data-drawer-wired="1"]').waitFor({ state: 'visible' });
    await page.locator('#my-tezos-btn').click();
    await page.locator('#my-tezos-drawer.open').waitFor({ state: 'visible', timeout: 15000 });
    await expectClassContains(page.locator('#my-tezos-drawer'), 'open', 'my tezos wallet connect drawer');
    await page.locator('#drawer-wallet-connect-btn').click();
    await page.waitForFunction((address) => localStorage.getItem('tezos-systems-my-baker-address') === address, SAMPLE_ADDRESS, { timeout: 10000 });
    await revealMyTezosAccountControls(page);
    await page.locator('#my-baker-input').waitFor({ state: 'visible', timeout: 10000 });

    const connectedState = await page.evaluate(() => ({
      savedWallet: localStorage.getItem('tezos-systems-octez-wallet-address') || '',
      savedProfile: localStorage.getItem('tezos-systems-my-baker-address') || '',
      input: document.querySelector('#my-baker-input')?.value || '',
      emptyDisplay: getComputedStyle(document.querySelector('#drawer-empty-state')).display,
      connectedDisplay: getComputedStyle(document.querySelector('#drawer-connected')).display,
      status: document.querySelector('#my-tezos-wallet-status')?.textContent || ''
    }));
    assert(connectedState.savedWallet === SAMPLE_ADDRESS, `my tezos wallet connect: wallet storage mismatch ${JSON.stringify(connectedState)}`);
    assert(connectedState.savedProfile === SAMPLE_ADDRESS, `my tezos wallet connect: profile storage mismatch ${JSON.stringify(connectedState)}`);
    assert(connectedState.input === SAMPLE_ADDRESS, `my tezos wallet connect: profile input mismatch ${JSON.stringify(connectedState)}`);
    assert(connectedState.emptyDisplay === 'none' && connectedState.connectedDisplay !== 'none', `my tezos wallet connect: drawer state mismatch ${JSON.stringify(connectedState)}`);
    assert(connectedState.status.includes('Wallet tz1aWX…T1Z9'), `my tezos wallet connect: status mismatch ${JSON.stringify(connectedState)}`);

    await page.locator('#drawer-close').click();
    await page.locator('[data-footer-delegate]').click();
    await page.waitForFunction(() => window.__octezConnectRequests?.length === 1, null, { timeout: 10000 });
    const delegationState = await page.evaluate(() => ({
      requests: window.__octezConnectRequests || [],
      permissionRequests: window.__octezConnectPermissionRequests || 0,
      button: document.querySelector('[data-footer-delegate]')?.textContent?.trim() || '',
      status: document.querySelector('[data-footer-delegate-status]')?.textContent?.trim() || ''
    }));
    assert(delegationState.permissionRequests === 1, `footer delegation: existing wallet session should not request permissions again ${JSON.stringify(delegationState)}`);
    assert(delegationState.requests[0]?.operationDetails?.length === 1
      && delegationState.requests[0].operationDetails[0]?.kind === 'delegation'
      && delegationState.requests[0].operationDetails[0]?.delegate === 'tz1S5WxdZR5f9NzsPXhr7L9L1vrEb5spZFur',
    `footer delegation: wallet request must contain only the canonical Baking Benjamins delegation ${JSON.stringify(delegationState)}`);
    assert(delegationState.button === 'Submitted' && /Submitted/.test(delegationState.status), `footer delegation: successful wallet state missing ${JSON.stringify(delegationState)}`);

    await page.locator('#my-tezos-btn[data-drawer-wired="1"]').waitFor({ state: 'visible' });
    await page.locator('#my-tezos-btn').click();
    await page.locator('#my-tezos-drawer.open').waitFor({ state: 'visible', timeout: 15000 });
    await expectClassContains(page.locator('#my-tezos-drawer'), 'open', 'my tezos wallet reconnect drawer');

    await page.evaluate(() => {
      window.__octezConnectHangDisconnect = true;
    });
    await page.locator('#my-tezos-wallet-disconnect').click();
    await page.waitForFunction(() => {
      const status = document.querySelector('#my-tezos-wallet-status')?.textContent || '';
      return !localStorage.getItem('tezos-systems-octez-wallet-address') && !/Disconnecting wallet/i.test(status);
    }, null, { timeout: 8000 });
    const disconnectedState = await page.evaluate(() => ({
      savedWallet: localStorage.getItem('tezos-systems-octez-wallet-address') || '',
      savedProfile: localStorage.getItem('tezos-systems-my-baker-address') || '',
      status: document.querySelector('#my-tezos-wallet-status')?.textContent || '',
      disconnectAttempts: window.__octezConnectDisconnectAttempts || 0,
      clearActiveCount: window.__octezConnectClearActiveCount || 0
    }));
    assert(disconnectedState.savedWallet === '', `my tezos wallet connect: disconnect should clear wallet storage ${JSON.stringify(disconnectedState)}`);
    assert(disconnectedState.savedProfile === SAMPLE_ADDRESS, `my tezos wallet connect: disconnect should keep My Tezos profile ${JSON.stringify(disconnectedState)}`);
    assert(/Wallet disconnected|No wallet connected/.test(disconnectedState.status), `my tezos wallet connect: disconnect status mismatch ${JSON.stringify(disconnectedState)}`);
    assert(disconnectedState.disconnectAttempts === 1 && disconnectedState.clearActiveCount >= 1, `my tezos wallet connect: hanging disconnect should fall back to local clear ${JSON.stringify(disconnectedState)}`);

    await context.close();
    assert(issues.length === 0, `my tezos wallet connect browser issues:\n${issues.join('\n')}`);
    log('ok - my tezos wallet connect');
  }

  async function smokeMyTezosAddressSwitch(browser, baseUrl) {
    const issues = [];
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      serviceWorkers: 'block'
    });
    await context.grantPermissions(['clipboard-write'], { origin: baseUrl });
    await installFeatureMocks(context);
    await context.addInitScript((address) => {
      localStorage.setItem('tezos-systems-theme', 'matrix');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
      localStorage.setItem('tezos-systems-my-baker-address', address);
    }, SAMPLE_ADDRESS);

    const page = await context.newPage();
    attachIssueCollectors(page, 'my tezos address switch', issues);

    const response = await page.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `my tezos address switch: dashboard failed with HTTP ${response?.status()}`);
    await page.locator('main').waitFor({ state: 'visible', timeout: 15000 });

    await page.locator('#my-tezos-btn[data-drawer-wired="1"]').waitFor({ state: 'visible' });
    await page.locator('#my-tezos-btn').click();
    await page.locator('#my-tezos-drawer.open').waitFor({ state: 'visible', timeout: 15000 });
    await expectClassContains(page.locator('#my-tezos-drawer'), 'open', 'my tezos address switch drawer');
    await revealMyTezosAccountControls(page);
    await page.locator('#my-baker-input').waitFor({ state: 'visible', timeout: 5000 });
    await assert(
      (await page.locator('#my-baker-input').inputValue()) === SAMPLE_ADDRESS,
      'my tezos address switch: saved address did not populate connected input'
    );

    await page.locator('#my-baker-input').fill(SAMPLE_ADDRESS_2);
    await page.waitForFunction(() => document.querySelector('#my-baker-save')?.textContent?.trim() === 'Save', null, { timeout: 3000 });
    await page.locator('#my-baker-save').click();
    await page.waitForFunction((address) => localStorage.getItem('tezos-systems-my-baker-address') === address, SAMPLE_ADDRESS_2, { timeout: 5000 });
    await page.waitForFunction(() => document.querySelectorAll('#drawer-saved-addresses .saved-addr').length === 2, null, { timeout: 5000 });
    try {
      await page.waitForFunction((address) => window._myTezosData?.fullAddress === address, SAMPLE_ADDRESS_2, { timeout: 15000 });
    } catch (error) {
      const debug = await page.evaluate(() => ({
        stored: localStorage.getItem('tezos-systems-my-baker-address'),
        myTezosData: window._myTezosData ? {
          fullAddress: window._myTezosData.fullAddress,
          address: window._myTezosData.address,
          bakerAddr: window._myTezosData.bakerAddr,
          isBaker: window._myTezosData.isBaker
        } : null,
        briefText: document.querySelector('#drawer-brief')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        errorText: document.querySelector('#my-baker-error-msg')?.textContent?.trim() || '',
        saveButton: document.querySelector('#my-baker-save')?.textContent?.trim() || '',
        resources: performance.getEntriesByType('resource')
          .filter((entry) => /api\.tzkt|objkt|tezos\.domains|tez\.capital|coingecko/.test(entry.name))
          .map((entry) => ({
            name: entry.name,
            duration: Math.round(entry.duration),
            responseEnd: Math.round(entry.responseEnd)
          }))
          .slice(-25)
      }));
      throw new Error(`my tezos address switch: My Tezos data did not refresh after save (${error.message}); debug=${JSON.stringify(debug)}; issues=${issues.join(' | ')}`);
    }
    try {
      await page.waitForFunction(() => {
        return Array.from(document.querySelectorAll('#my-baker-results .my-baker-stat')).some((stat) => (
          stat.textContent.includes('Ext. Delegated') && stat.textContent.includes('220,000.00')
        ));
      }, null, { timeout: 30000 });
    } catch (error) {
      const debug = await page.evaluate(() => ({
        results: document.querySelector('#my-baker-results')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        stats: Array.from(document.querySelectorAll('#my-baker-results .my-baker-stat')).map((stat) => stat.textContent?.replace(/\s+/g, ' ').trim()),
        stored: localStorage.getItem('tezos-systems-my-baker-address'),
        data: window._myTezosData || null
      }));
      throw new Error(`my tezos address switch: external delegation stat did not settle (${error.message}); debug=${JSON.stringify(debug)}; issues=${issues.join(' | ')}`);
    }

    await page.waitForFunction(() => document.querySelectorAll('#drawer-operator-status .drawer-operator-tile').length === 7, null, { timeout: 15000 });
    await page.locator('#my-tezos-tab-baker-signal').click();
    const operatorGeometry = await page.evaluate(() => {
      const grid = document.querySelector('.drawer-operator-grid');
      const tiles = Array.from(grid?.querySelectorAll(':scope > .drawer-operator-tile') || []);
      const children = tiles.map((child) => child.getBoundingClientRect());
      const drawer = document.querySelector('#my-tezos-drawer')?.getBoundingClientRect();
      return {
        drawerWidth: drawer?.width || 0,
        labels: tiles.map(tile => tile.querySelector('.drawer-operator-label')?.textContent.trim()),
        upcomingRights: grid.querySelectorAll('.drawer-schedule-right').length,
        children: children.map((rect) => ({ top: Math.round(rect.top), width: Math.round(rect.width) }))
      };
    });
    assert(operatorGeometry.drawerWidth >= 879 && operatorGeometry.drawerWidth <= 1081, `my tezos address switch: adaptive desktop width failed ${JSON.stringify(operatorGeometry)}`);
    assert(operatorGeometry.labels.join('|') === 'Octez|Baker working?|Attestation|DAL' && operatorGeometry.upcomingRights === 3, `my tezos address switch: operator tile contract drifted ${JSON.stringify(operatorGeometry)}`);
    assert(operatorGeometry.children.length === 4 && operatorGeometry.children.every(child => child.top === operatorGeometry.children[0].top), `my tezos address switch: the four compact status pills must share one desktop row below the three-right schedule ${JSON.stringify(operatorGeometry)}`);

    await page.locator('#my-tezos-tab-portfolio').click();
    await page.waitForFunction(() => {
      const freshness = document.querySelector('#portfolio-freshness')?.textContent || '';
      const total = document.querySelector('[data-portfolio-total="total"] strong')?.textContent || '';
      return freshness.includes('Complete') && freshness.includes('2/2') && total.includes('1,500,000.00');
    }, null, { timeout: 15000 });
    const initialPortfolio = await page.evaluate(() => ({
      selected: document.querySelector('#my-tezos-tab-portfolio')?.getAttribute('aria-selected'),
      sessionView: sessionStorage.getItem('tezos-systems-my-tezos-view'),
      total: document.querySelector('[data-portfolio-total="total"] strong')?.textContent || '',
      spendable: document.querySelector('[data-portfolio-total="spendable"] strong')?.textContent || '',
      staked: document.querySelector('[data-portfolio-total="staked"] strong')?.textContent || '',
      unstaking: document.querySelector('[data-portfolio-total="unstaking"] strong')?.textContent || '',
      walletRows: document.querySelectorAll('.portfolio-wallet-row[data-address]').length
    }));
    assert(initialPortfolio.selected === 'true' && initialPortfolio.sessionView === 'portfolio', `my tezos address switch: Portfolio tab did not persist for the session ${JSON.stringify(initialPortfolio)}`);
    assert(initialPortfolio.total.includes('1,500,000.00') && initialPortfolio.spendable.includes('300,000.00') && initialPortfolio.staked.includes('1,200,000.00') && initialPortfolio.unstaking.includes('0.00') && initialPortfolio.walletRows === 2, `my tezos address switch: TzKT full balances were not partitioned into exact four-way totals ${JSON.stringify(initialPortfolio)}`);

    const allScope = await page.evaluate(() => ({
      value: document.querySelector('#my-tezos-wallet-scope')?.value || '',
      options: Array.from(document.querySelectorAll('#my-tezos-wallet-scope option')).map((option) => option.value),
      wallets: document.querySelector('[data-my-tezos-scope-total="wallets"] strong')?.textContent || '',
      total: document.querySelector('[data-my-tezos-scope-total="total"] strong')?.textContent || ''
    }));
    assert(
      allScope.value === 'all'
        && allScope.options.length === 3
        && allScope.wallets === '2'
        && allScope.total.includes('1,500,000.00'),
      `my tezos address switch: shared scope did not default every view to the complete wallet total ${JSON.stringify(allScope)}`
    );

    await page.selectOption('#my-tezos-wallet-scope', SAMPLE_ADDRESS_2);
    await page.waitForFunction((address) => (
      document.querySelector('#my-tezos-wallet-scope')?.value === address
        && document.querySelector('[data-my-tezos-scope-total="wallets"] strong')?.textContent === '1'
        && document.querySelector('[data-my-tezos-scope-total="total"] strong')?.textContent?.includes('600,000.00')
        && document.querySelector('[data-portfolio-total="total"] strong')?.textContent?.includes('600,000.00')
    ), SAMPLE_ADDRESS_2, { timeout: 15000 });
    for (const view of ['overview', 'transactions', 'collection', 'story', 'tezos-x']) {
      await page.locator(`#my-tezos-tab-${view}`).click();
      await page.waitForFunction(({ view, address }) => (
        document.querySelector(`#my-tezos-tab-${view}`)?.getAttribute('aria-selected') === 'true'
          && document.querySelector('#my-tezos-wallet-scope')?.value === address
      ), { view, address: SAMPLE_ADDRESS_2 }, { timeout: 5000 });
    }
    await page.locator('#my-tezos-tab-transactions').click();
    await page.waitForFunction(() => document.querySelector('[data-transactions-total="wallets"] strong')?.textContent === '1', null, { timeout: 10000 });
    await page.locator('#my-tezos-tab-story').click();
    const focusedStory = await page.evaluate(() => ({
      boundaryHidden: document.querySelector('#my-tezos-story-scope-boundary')?.hidden,
      storyHidden: document.querySelector('#my-tezos-story-content')?.hidden,
      active: localStorage.getItem('tezos-systems-my-baker-address')
    }));
    assert(focusedStory.boundaryHidden && !focusedStory.storyHidden && focusedStory.active === SAMPLE_ADDRESS_2, `my tezos address switch: specific wallet scope did not focus the account-only Story surface ${JSON.stringify(focusedStory)}`);
    await page.selectOption('#my-tezos-wallet-scope', 'all');
    await page.waitForFunction(() => (
      document.querySelector('[data-my-tezos-scope-total="wallets"] strong')?.textContent === '2'
        && document.querySelector('[data-my-tezos-scope-total="total"] strong')?.textContent?.includes('1,500,000.00')
        && document.querySelector('#my-tezos-story-scope-boundary')?.hidden === false
        && document.querySelector('#my-tezos-story-content')?.hidden === true
    ), null, { timeout: 15000 });
    await page.locator('#my-tezos-tab-portfolio').click();

    let manualPortfolioRequests = 0;
    let holdManualPortfolioRefresh = true;
    await page.route('**/accounts?*', async (route) => {
      const url = route.request().url();
      if (holdManualPortfolioRefresh && url.includes('address.in=')) {
        manualPortfolioRequests += 1;
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
      return route.fallback();
    });
    await page.locator('#portfolio-refresh').click();
    await page.waitForFunction(() => {
      const button = document.querySelector('#portfolio-refresh');
      return button?.disabled === true
        && button.getAttribute('aria-busy') === 'true'
        && button.textContent.includes('Updating 2 wallets');
    }, null, { timeout: 3000 });
    await page.waitForFunction(() => {
      const button = document.querySelector('#portfolio-refresh');
      return button?.disabled === false
        && button.getAttribute('aria-busy') === 'false'
        && button.textContent.includes('Update portfolio')
        && document.querySelector('#portfolio-freshness')?.textContent?.includes('Complete');
    }, null, { timeout: 15000 });
    holdManualPortfolioRefresh = false;
    assert(manualPortfolioRequests >= 1, `my tezos address switch: visible Refresh control did not request a fresh complete portfolio (${manualPortfolioRequests})`);

    await page.evaluate(async (address) => {
      const wallet = await import('/js/core/wallet.js');
      const current = wallet.readSavedMyTezosEntries();
      wallet.writeSavedMyTezosEntries([
        ...current,
        { network: 'tezos-l1', address, label: 'Removable Vault', included: true, addedAt: Date.now() }
      ], { source: 'portfolio-remove-smoke-setup' });
    }, SAMPLE_DELEGATOR_ADDRESS);
    await page.waitForFunction((address) => (
      document.querySelectorAll('.portfolio-wallet-row[data-address]').length === 3
        && document.querySelector(`[data-portfolio-remove="${address}"]`)
        && document.querySelector('#portfolio-freshness')?.textContent?.includes('3/3')
    ), SAMPLE_DELEGATOR_ADDRESS, { timeout: 15000 });
    await page.locator(`[data-portfolio-remove="${SAMPLE_DELEGATOR_ADDRESS}"]`).click();
    await page.waitForFunction(() => {
      const freshness = document.querySelector('#portfolio-freshness')?.textContent || '';
      const total = document.querySelector('[data-portfolio-total="total"] strong')?.textContent || '';
      return document.querySelectorAll('.portfolio-wallet-row[data-address]').length === 2
        && freshness.includes('Complete')
        && freshness.includes('2/2')
        && total.includes('1,500,000.00');
    }, null, { timeout: 15000 });

    const firstInclude = page.locator(`[data-portfolio-include="${SAMPLE_ADDRESS}"]`);
    await firstInclude.uncheck();
    await page.waitForFunction(() => {
      const freshness = document.querySelector('#portfolio-freshness')?.textContent || '';
      const total = document.querySelector('[data-portfolio-total="total"] strong')?.textContent || '';
      return freshness.includes('Complete') && freshness.includes('1/1') && total.includes('600,000.00');
    }, null, { timeout: 15000 });

    await page.evaluate(async (activeAddress) => {
      const entries = JSON.parse(localStorage.getItem('tezos-systems-saved-addresses') || '[]').filter((entry) => entry.included !== false);
      const { portfolioCompositionKey } = await import('/js/features/my-tezos-portfolio-model.mjs');
      const key = portfolioCompositionKey(entries);
      const now = Date.now();
      const current = { timestamp: now, total: 600000000000, spendable: 100000000000, staked: 500000000000, unstaking: 0 };
      localStorage.setItem('tezos-systems-my-tezos-portfolio-history-v1', JSON.stringify({
        schema: 1,
        series: { [key]: [{ ...current, timestamp: now - 2 * 60 * 60 * 1000, total: 550000000000 }, current] }
      }));
      window.__portfolioQuietBefore = {
        summary: document.querySelector('#portfolio-summary'),
        row: document.querySelector(`.portfolio-wallet-row[data-address="${activeAddress}"]`)
      };
    }, SAMPLE_ADDRESS_2);
    await page.locator('[data-portfolio-range="30d"]').click();
    await page.waitForFunction(() => {
      const chart = window.Chart?.getChart(document.querySelector('#portfolio-history-chart'));
      return chart?.data?.datasets?.[0]?.label === 'Total XTZ'
        && chart.data.datasets[0].data.length >= 2;
    }, null, { timeout: 30000 });
    const historyGeometry = await page.evaluate(() => {
      const stage = document.querySelector('.portfolio-history-stage')?.getBoundingClientRect();
      const canvas = document.querySelector('#portfolio-history-chart')?.getBoundingClientRect();
      const chart = window.Chart?.getChart(document.querySelector('#portfolio-history-chart'));
      const walletLabel = document.querySelector('.my-tezos-scope-control > span');
      const walletSelect = document.querySelector('#my-tezos-wallet-scope');
      const walletLabelRect = walletLabel?.getBoundingClientRect();
      const walletLabelStyle = walletLabel ? getComputedStyle(walletLabel) : null;
      const walletSelectRect = walletSelect?.getBoundingClientRect();
      const walletSelectStyle = walletSelect ? getComputedStyle(walletSelect) : null;
      const rangeTops = Array.from(document.querySelectorAll('.portfolio-history-ranges button'))
        .map((button) => Math.round(button.getBoundingClientRect().top));
      return {
        stageHeight: Math.round(stage?.height || 0),
        canvasHeight: Math.round(canvas?.height || 0),
        plotHeight: Math.round((chart?.chartArea?.bottom || 0) - (chart?.chartArea?.top || 0)),
        legendPosition: chart?.options?.plugins?.legend?.position || '',
        walletLabelWhiteSpace: walletLabelStyle?.whiteSpace || '',
        walletLabelWidth: Math.round(walletLabelRect?.width || 0),
        walletLabelHeight: Math.round(walletLabelRect?.height || 0),
        walletSelectHeight: Math.round(walletSelectRect?.height || 0),
        walletSelectBackground: walletSelectStyle?.backgroundColor || '',
        walletSelectBorder: walletSelectStyle?.borderTopStyle || '',
        walletSelectAppearance: walletSelectStyle?.appearance || '',
        walletSelectOverflow: (walletSelect?.scrollWidth || 0) > (walletSelect?.clientWidth || 0) + 1,
        rangeTops
      };
    });
    assert(
      historyGeometry.stageHeight >= 340
        && historyGeometry.canvasHeight >= 340
        && historyGeometry.plotHeight >= 240
        && historyGeometry.legendPosition === 'bottom'
        && historyGeometry.walletLabelWhiteSpace === 'nowrap'
        && historyGeometry.walletLabelWidth >= 55
        && historyGeometry.walletLabelHeight <= 18
        && historyGeometry.walletSelectHeight >= 38
        && historyGeometry.walletSelectBackground !== 'rgba(0, 0, 0, 0)'
        && historyGeometry.walletSelectBorder === 'solid'
        && historyGeometry.walletSelectAppearance === 'none'
        && !historyGeometry.walletSelectOverflow
        && new Set(historyGeometry.rangeTops).size === 1,
      `my tezos address switch: Portfolio history geometry is compressed or wraps its controls ${JSON.stringify(historyGeometry)}`
    );
    await page.locator(`[data-portfolio-label="${SAMPLE_ADDRESS_2}"]`).focus();
    await page.locator(`[data-portfolio-label="${SAMPLE_ADDRESS_2}"]`).fill('Second Vault');
    await page.locator(`[data-portfolio-label="${SAMPLE_ADDRESS_2}"]`).evaluate((input) => input.setSelectionRange(1, 6));
    await page.evaluate(() => { document.querySelector('#drawer-body').scrollTop = 220; });
    const quietBefore = await page.evaluate(() => {
      window.__portfolioChartBefore = window.Chart.getChart(document.querySelector('#portfolio-history-chart'));
      return {
        scroll: document.querySelector('#drawer-body').scrollTop,
        hasChart: Boolean(window.__portfolioChartBefore)
      };
    });
    await page.evaluate(() => document.querySelector('#portfolio-refresh').click());
    await page.waitForFunction(() => document.querySelector('#portfolio-freshness')?.textContent?.includes('Complete'), null, { timeout: 15000 });
    const quietAfter = await page.evaluate((activeAddress) => {
      const input = document.querySelector(`[data-portfolio-label="${activeAddress}"]`);
      return {
        sameSummary: window.__portfolioQuietBefore.summary === document.querySelector('#portfolio-summary'),
        sameRow: window.__portfolioQuietBefore.row === document.querySelector(`.portfolio-wallet-row[data-address="${activeAddress}"]`),
        sameChart: window.__portfolioChartBefore === window.Chart.getChart(document.querySelector('#portfolio-history-chart')),
        scroll: document.querySelector('#drawer-body').scrollTop,
        focused: document.activeElement === input,
        selectionStart: input?.selectionStart,
        selectionEnd: input?.selectionEnd,
        activeTab: document.querySelector('#my-tezos-tab-portfolio')?.getAttribute('aria-selected')
      };
    }, SAMPLE_ADDRESS_2);
    assert(quietAfter.sameSummary && quietAfter.sameRow && quietAfter.sameChart && quietAfter.focused && quietAfter.selectionStart === 1 && quietAfter.selectionEnd === 6 && quietAfter.activeTab === 'true' && Math.abs(quietAfter.scroll - quietBefore.scroll) <= 1, `my tezos address switch: quiet Portfolio refresh moved the reader ${JSON.stringify({ quietBefore, quietAfter })}`);

    let failPortfolio = true;
    await page.route('**/accounts?*', async (route) => {
      const url = route.request().url();
      if (failPortfolio && url.includes('address.in=')) return fulfillJson(route, []);
      return route.fallback();
    });
    await page.evaluate(() => document.querySelector('#portfolio-refresh').click());
    await page.waitForFunction(() => document.querySelector('#portfolio-freshness')?.textContent?.includes('showing last complete read'), null, { timeout: 15000 });
    const failureTotal = await page.locator('[data-portfolio-total="total"] strong').innerText();
    assert(failureTotal.includes('600,000.00'), `my tezos address switch: failed portfolio refresh replaced the last complete total ${failureTotal}`);
    const scopeFailure = await page.locator('#my-tezos-scope-freshness').textContent();
    assert(scopeFailure.includes('Last complete read') && scopeFailure.includes('update unavailable') && !scopeFailure.includes('Complete current'), 'Overview must disclose the failed update alongside its last complete balance read');
    failPortfolio = false;

    await page.locator(`[data-portfolio-activate="${SAMPLE_ADDRESS}"]`).click();
    await page.waitForFunction(({ address, staleAddress }) => {
      const cards = Array.from(document.querySelectorAll('#drawer-more-actions .drawer-account-journey-card'));
      return localStorage.getItem('tezos-systems-my-baker-address') === address
        && document.querySelector('#my-tezos-tab-overview')?.getAttribute('aria-selected') === 'true'
        && cards.length === 2
        && cards.every((card) => !card.getAttribute('href')?.includes(staleAddress));
    }, { address: SAMPLE_ADDRESS, staleAddress: SAMPLE_ADDRESS_2 }, { timeout: 5000 });
    await page.locator('#my-tezos-tab-portfolio').click();
    await page.locator(`[data-portfolio-activate="${SAMPLE_ADDRESS_2}"]`).click();
    await page.waitForFunction(({ address, staleAddress }) => {
      const cards = Array.from(document.querySelectorAll('#drawer-more-actions .drawer-account-journey-card'));
      return localStorage.getItem('tezos-systems-my-baker-address') === address
        && document.querySelector('#my-tezos-tab-overview')?.getAttribute('aria-selected') === 'true'
        && cards.length === 2
        && cards.every((card) => !card.getAttribute('href')?.includes(staleAddress));
    }, { address: SAMPLE_ADDRESS_2, staleAddress: SAMPLE_ADDRESS }, { timeout: 5000 });
    await page.locator('#my-tezos-tab-overview').press('ArrowRight');
    await page.waitForFunction(() => document.querySelector('#my-tezos-tab-baker-signal')?.getAttribute('aria-selected') === 'true' && document.activeElement?.id === 'my-tezos-tab-baker-signal', null, { timeout: 3000 });
    await page.locator('#my-tezos-tab-baker-signal').press('ArrowRight');
    await page.waitForFunction(() => document.querySelector('#my-tezos-tab-portfolio')?.getAttribute('aria-selected') === 'true', null, { timeout: 3000 });
    await page.locator('#my-tezos-tab-portfolio').press('End');
    await page.waitForFunction(() => document.querySelector('#my-tezos-tab-tezos-x')?.getAttribute('aria-selected') === 'true' && document.activeElement?.id === 'my-tezos-tab-tezos-x', null, { timeout: 3000 });
    await page.locator('#my-tezos-tab-tezos-x').press('ArrowLeft');
    await page.waitForFunction(() => document.querySelector('#my-tezos-tab-story')?.getAttribute('aria-selected') === 'true' && document.activeElement?.id === 'my-tezos-tab-story', null, { timeout: 3000 });
    await page.locator('#my-tezos-tab-story').press('End');
    await page.waitForFunction(() => document.querySelector('#my-tezos-tab-tezos-x')?.getAttribute('aria-selected') === 'true' && document.activeElement?.id === 'my-tezos-tab-tezos-x', null, { timeout: 3000 });
    await page.locator('#my-tezos-tab-tezos-x').press('Home');
    await page.waitForFunction(() => document.querySelector('#my-tezos-tab-overview')?.getAttribute('aria-selected') === 'true' && document.activeElement?.id === 'my-tezos-tab-overview', null, { timeout: 3000 });
    await page.locator('#my-tezos-tab-overview').press('ArrowRight');
    await page.waitForFunction(() => document.querySelector('#my-tezos-tab-baker-signal')?.getAttribute('aria-selected') === 'true' && document.activeElement?.id === 'my-tezos-tab-baker-signal', null, { timeout: 3000 });
    await page.locator('#my-tezos-tab-baker-signal').press('ArrowRight');
    await page.waitForFunction(() => document.querySelector('#my-tezos-tab-portfolio')?.getAttribute('aria-selected') === 'true', null, { timeout: 3000 });

    const state = await page.evaluate(() => ({
      stored: localStorage.getItem('tezos-systems-my-baker-address'),
      connectedWallet: localStorage.getItem('tezos-systems-octez-wallet-address'),
      savedWallets: JSON.parse(localStorage.getItem('tezos-systems-saved-addresses') || '[]'),
      input: document.querySelector('#my-baker-input')?.value || '',
      button: document.querySelector('#my-baker-save')?.textContent?.trim() || '',
      savedButtons: document.querySelectorAll('#drawer-saved-addresses .saved-addr').length,
      portfolioTotal: document.querySelector('[data-portfolio-total="total"] strong')?.textContent?.trim() || '',
      portfolioFreshness: document.querySelector('#portfolio-freshness')?.textContent?.trim() || '',
      ledgerFlowHref: document.querySelector('#my-tezos-ledger-flow-link')?.getAttribute('href') || '',
      ledgerFlowHidden: document.querySelector('#my-tezos-ledger-flow-link')?.hidden === true,
      maxiPassportHref: document.querySelector('#my-tezos-maxi-passport-link')?.getAttribute('href') || '',
      maxiPassportHidden: document.querySelector('#my-tezos-maxi-passport-link')?.hidden === true,
      journeyDestinations: Array.from(document.querySelectorAll('#drawer-more-actions .drawer-account-journey-card')).map((card) => card.dataset.myTezosJourneyDestination),
      extDelegated: Array.from(document.querySelectorAll('#my-baker-results .my-baker-stat')).find((stat) => (
        stat.textContent.includes('Ext. Delegated')
      ))?.textContent?.replace(/\s+/g, ' ').trim() || '',
      header: document.querySelector('#my-tezos-btn .nav-label')?.textContent || '',
      heroCount: document.querySelectorAll('#my-tezos-hero').length
    }));
    const journeyGeometry = await page.evaluate(() => {
      const section = document.querySelector('#drawer-more-section');
      const actions = document.querySelector('#drawer-more-actions');
      const cards = Array.from(actions?.querySelectorAll('.drawer-account-journey-card') || []).map((card) => {
        const rect = card.getBoundingClientRect();
        const description = card.querySelector('small');
        return {
          top: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          descriptionVisible: Boolean(description && getComputedStyle(description).display !== 'none')
        };
      });
      return {
        cards,
        sectionParent: section?.parentElement?.id || '',
        activeView: document.querySelector('[data-my-tezos-view][aria-selected="true"]')?.dataset.myTezosView || '',
        secondaryContainers: document.querySelectorAll('#drawer-more-section-secondary').length
      };
    });

    assert(state.stored === SAMPLE_ADDRESS_2, `my tezos address switch: localStorage kept stale address ${state.stored}`);
    assert(state.connectedWallet === null, `my tezos address switch: manually saved wallets should not require a connected wallet ${JSON.stringify(state)}`);
    assert(state.savedWallets.some((entry) => entry.address === SAMPLE_ADDRESS && entry.included === false) && state.savedWallets.some((entry) => entry.address === SAMPLE_ADDRESS_2 && entry.included === true), `my tezos address switch: normalized include state was not retained ${JSON.stringify(state)}`);
    assert(state.input === SAMPLE_ADDRESS_2, `my tezos address switch: connected input mismatch ${state.input}`);
    assert(state.button === '📋 Copy', `my tezos address switch: save button did not return to copy mode, saw ${state.button}`);
    assert(state.savedButtons === 2 && state.portfolioTotal.includes('600,000.00'), `my tezos address switch: normalized local Portfolio state missing ${JSON.stringify(state)}`);
    assert(!state.ledgerFlowHidden && state.ledgerFlowHref === `/#ledger-flow=${encodeURIComponent(SAMPLE_ADDRESS_2)}`, `my tezos address switch: Portfolio Ledger Flow continuation not scoped to active address ${JSON.stringify(state)}`);
    assert(!state.maxiPassportHidden && state.maxiPassportHref === '/#price', `my tezos address switch: Portfolio market continuation drifted ${JSON.stringify(state)}`);
    assert(state.journeyDestinations.join(',') === 'ledger-flow,price', `my tezos address switch: active Portfolio journey matrix drifted ${JSON.stringify(state)}`);
    assert(!state.header.includes(SAMPLE_ADDRESS.slice(0, 6)), `my tezos address switch: header still points at old baker: ${state.header}`);
    assert(state.heroCount === 0, `my tezos address switch: homepage address tracker should not render ${JSON.stringify(state)}`);
    assert(
      journeyGeometry.cards.length === 2
        && journeyGeometry.cards[0].top === journeyGeometry.cards[1].top
        && Math.abs(journeyGeometry.cards[0].width - journeyGeometry.cards[1].width) <= 1
        && Math.abs(journeyGeometry.cards[0].height - journeyGeometry.cards[1].height) <= 1
        && journeyGeometry.cards.every((card) => card.descriptionVisible)
        && journeyGeometry.sectionParent === 'my-tezos-panel-portfolio'
        && journeyGeometry.activeView === 'portfolio'
        && journeyGeometry.secondaryContainers === 0,
      `my tezos address switch: account journeys are not one equal desktop row ${JSON.stringify(journeyGeometry)}`
    );

    await page.evaluate((addresses) => {
      // Start the import synchronously; wait for its rendered result below.
      // Returning an async result through CDP can fail with "Promise was collected".
      window.__smokeWalletLayoutWork = import('/js/core/wallet.js').then((wallet) => {
        wallet.writeSavedMyTezosEntries(addresses.map((address, index) => ({
          network: 'tezos-l1',
          address,
          label: index === 1 ? 'Active Vault' : `Wallet ${index + 1}`,
          included: index === 1,
          addedAt: Date.now() + index
        })), { source: 'portfolio-ten-wallet-layout-smoke' });
      });
    }, [
      SAMPLE_ADDRESS,
      SAMPLE_ADDRESS_2,
      SAMPLE_DELEGATOR_ADDRESS,
      SAMPLE_REGULAR_DELEGATOR_ADDRESS,
      SAMPLE_SMALL_DELEGATOR_ADDRESS,
      SAMPLE_STAKER_ADDRESS,
      SAMPLE_HEAVY_STAKER_ADDRESS,
      SAMPLE_IDLE_ADDRESS,
      SAMPLE_LARGE_STAKER_ADDRESS,
      OVERDELEGATED_ADDRESS
    ]);
    await page.waitForFunction(() => (
      document.querySelectorAll('.portfolio-wallet-row[data-address]').length === 10
        && document.querySelector('#portfolio-wallet-count')?.textContent?.includes('10/10 saved')
    ), null, { timeout: 15000 });
    const tenWalletGeometry = await page.evaluate(() => {
      const list = document.querySelector('#drawer-saved-addresses');
      const header = list?.querySelector('.portfolio-wallet-row-header');
      const rows = Array.from(list?.querySelectorAll('.portfolio-wallet-row[data-address]') || []);
      return {
        rows: rows.length,
        count: document.querySelector('#portfolio-wallet-count')?.textContent?.trim() || '',
        clientHeight: Math.round(list?.clientHeight || 0),
        scrollHeight: Math.round(list?.scrollHeight || 0),
        horizontalOverflow: (list?.scrollWidth || 0) > (list?.clientWidth || 0) + 1,
        headerPosition: header ? getComputedStyle(header).position : '',
        tallestRow: Math.round(Math.max(0, ...rows.map((row) => row.getBoundingClientRect().height)))
      };
    });
    assert(
      tenWalletGeometry.rows === 10
        && tenWalletGeometry.count.includes('1 included · 10/10 saved')
        && tenWalletGeometry.clientHeight <= 512
        && tenWalletGeometry.scrollHeight > tenWalletGeometry.clientHeight
        && !tenWalletGeometry.horizontalOverflow
        && tenWalletGeometry.headerPosition === 'sticky'
        && tenWalletGeometry.tallestRow <= 86,
      `my tezos address switch: ten-wallet manager is not compact and scrollable ${JSON.stringify(tenWalletGeometry)}`
    );

    await context.close();

    const coldStoryContext = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(coldStoryContext);
    await coldStoryContext.addInitScript(({ first, second }) => {
      localStorage.setItem('tezos-systems-theme', 'matrix');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
      localStorage.setItem('tezos-systems-my-baker-address', second);
      localStorage.setItem('tezos-systems-saved-addresses', JSON.stringify([
        { network: 'tezos-l1', address: first, label: 'Primary', included: true, addedAt: Date.now() - 1000 },
        { network: 'tezos-l1', address: second, label: 'Second', included: true, addedAt: Date.now() }
      ]));
    }, { first: SAMPLE_ADDRESS, second: SAMPLE_ADDRESS_2 });
    const coldStoryPage = await coldStoryContext.newPage();
    attachIssueCollectors(coldStoryPage, 'my tezos cold all-wallet Story', issues);
    const coldStoryResponse = await coldStoryPage.goto(`${baseUrl}/my/?view=story`, { waitUntil: 'domcontentloaded' });
    assert(coldStoryResponse?.ok(), `my tezos cold Story: route failed with HTTP ${coldStoryResponse?.status()}`);
    await coldStoryPage.waitForFunction(() => (
      document.querySelector('#my-tezos-drawer')?.classList.contains('open')
        && document.querySelector('#my-tezos-tab-story')?.getAttribute('aria-selected') === 'true'
        && document.querySelector('#my-tezos-story-content .tezos-story-dossier')
    ), null, { timeout: 20000 });
    const coldStoryState = await coldStoryPage.evaluate(() => ({
      scope: document.querySelector('#my-tezos-wallet-scope')?.value || '',
      boundaryHidden: document.querySelector('#my-tezos-story-scope-boundary')?.hidden,
      storyHidden: document.querySelector('#my-tezos-story-content')?.hidden,
      dossierPresent: Boolean(document.querySelector('#my-tezos-story-content .tezos-story-dossier')),
      includedWallets: JSON.parse(localStorage.getItem('tezos-systems-saved-addresses') || '[]')
        .filter((entry) => entry.included !== false).length
    }));
    assert(
      coldStoryState.scope === 'all'
        && coldStoryState.includedWallets === 2
        && coldStoryState.boundaryHidden === false
        && coldStoryState.storyHidden === true
        && coldStoryState.dossierPresent,
      `my tezos cold Story: all-wallet scope exposed one active-wallet dossier ${JSON.stringify(coldStoryState)}`
    );
    await coldStoryContext.close();
    assert(issues.length === 0, `my tezos address switch browser issues:\n${issues.join('\n')}`);
    log('ok - my tezos address switch smoke');
  }

  async function smokeMyTezosStorage(browser, baseUrl) {
    const issues = [];
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      serviceWorkers: 'block',
      acceptDownloads: true
    });
    await installFeatureMocks(context);
    await context.addInitScript(({ address }) => {
      localStorage.setItem('tezos-systems-theme', 'clean');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
      localStorage.setItem('tezos-systems-my-baker-address', address);
      localStorage.setItem(`tezos-systems-rewards-v4-${address}`, JSON.stringify({
        data: {
          currentRole: 'staker',
          rows: [{ cycle: 1000, _earnedRewards: 1250000 }]
        }
      }));
    }, { address: SAMPLE_ADDRESS });
    const page = await context.newPage();
    attachIssueCollectors(page, 'my tezos storage', issues);
    await openMyTezosSmokeView(page, baseUrl, 'portfolio');
    await page.waitForFunction(() => (
      document.querySelector('#portfolio-freshness')?.dataset.state === 'complete'
        || document.querySelector('#portfolio-freshness')?.textContent?.includes('Complete')
    ), null, { timeout: 20000 });
    await page.waitForFunction((address) => !localStorage.getItem(`tezos-systems-rewards-v4-${address}`), SAMPLE_ADDRESS, { timeout: 10000 });

    const dbState = await page.evaluate(async () => {
      const request = indexedDB.open('tezos-systems-my-tezos');
      const db = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const stores = Array.from(db.objectStoreNames);
      const tx = db.transaction(['rewards', 'meta'], 'readonly');
      const rewards = tx.objectStore('rewards').getAll();
      const marker = tx.objectStore('meta').get('legacy-v1-migrated');
      const result = await new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve({
          stores,
          rewards: rewards.result,
          marker: marker.result?.value || null
        });
        tx.onerror = () => reject(tx.error);
      });
      db.close();
      return result;
    });
    assert(
      ['snapshots', 'activityByAccount', 'rewards', 'holdings', 'syncState', 'meta'].every((name) => dbState.stores.includes(name)),
      `my tezos storage: IndexedDB schema incomplete ${JSON.stringify(dbState)}`
    );
    assert(
      dbState.marker?.rewards === 1
        && dbState.rewards.length >= 1
        && dbState.rewards.every((row) => Number.isFinite(row.cycle) && Number.isFinite(row.earned) && !Object.hasOwn(row, 'rows')),
      `my tezos storage: legacy reward migration or compact replacement failed ${JSON.stringify(dbState)}`
    );

    const labelInput = page.locator(`[data-portfolio-label="${SAMPLE_ADDRESS}"]`);
    await labelInput.fill('Primary Vault');
    await labelInput.press('Enter');
    await page.waitForFunction((address) => {
      const entries = JSON.parse(localStorage.getItem('tezos-systems-saved-addresses') || '[]');
      return entries.find((entry) => entry.address === address)?.label === 'Primary Vault';
    }, SAMPLE_ADDRESS, { timeout: 5000 });
    const orderBefore = await page.evaluate(() => (
      JSON.parse(localStorage.getItem('tezos-systems-saved-addresses') || '[]').map((entry) => entry.address)
    ));
    await page.locator('#portfolio-add-address').fill(SAMPLE_ADDRESS);
    await page.locator('#portfolio-add-form button[type="submit"]').click();
    await page.waitForFunction(() => /already saved/i.test(document.querySelector('#portfolio-management-status')?.textContent || ''), null, { timeout: 5000 });
    const duplicateState = await page.evaluate(() => {
      const entries = JSON.parse(localStorage.getItem('tezos-systems-saved-addresses') || '[]');
      return {
        order: entries.map((entry) => entry.address),
        label: entries.find((entry) => entry.address)?.label || ''
      };
    });
    assert(JSON.stringify(duplicateState.order) === JSON.stringify(orderBefore), `my tezos storage: duplicate add reordered the Wallet Stack ${JSON.stringify(duplicateState)}`);
    assert(duplicateState.label === 'Primary Vault', `my tezos storage: duplicate add erased the saved label ${JSON.stringify(duplicateState)}`);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('main').waitFor({ state: 'visible', timeout: 15000 });
    // The restored /my/ route already opens the drawer; do not toggle it closed.
    if (!await page.locator('#my-tezos-drawer').evaluate(node => node.classList.contains('open'))) {
      await page.locator('#my-tezos-btn').click();
    }
    await page.locator('#my-tezos-drawer.open').waitFor({ state: 'visible' });
    await page.locator('#my-tezos-tab-portfolio').click();
    await page.waitForFunction((address) => (
      document.querySelector(`[data-portfolio-label="${address}"]`)?.value === 'Primary Vault'
    ), SAMPLE_ADDRESS, { timeout: 10000 });

    const importPayload = {
      schema: 'tezos-systems-my-tezos/v2',
      entries: [
        { network: 'tezos-l1', address: SAMPLE_ADDRESS, label: 'Imported Primary', included: true, addedAt: Date.now() - 1000 },
        { network: 'tezos-l1', address: SAMPLE_DELEGATOR_ADDRESS, label: 'Imported Watch', included: false, addedAt: Date.now() }
      ],
      linkedL2Accounts: [{
        chainId: 42793,
        address: SAMPLE_ETHERLINK_ADDRESS,
        label: 'Imported L2',
        linkedL1Addresses: [SAMPLE_ADDRESS],
        included: true,
        addedAt: Date.now(),
        linkMethod: 'manual',
        verification: 'unverified-device-local'
      }],
      observedSnapshots: [{
        scopeId: 'import-smoke',
        timestamp: Date.now() - 60000,
        total: 1000000,
        spendable: 1000000,
        staked: 0,
        unstaking: 0
      }],
      seenWatermarks: { memoryLastSeen: Date.now() - 30000 }
    };
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('#portfolio-import-file').setInputFiles({
      name: 'my-tezos-import-smoke.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(importPayload))
    });
    await page.waitForFunction(() => /Imported My Tezos/i.test(document.querySelector('#portfolio-management-status')?.textContent || ''), null, { timeout: 10000 });
    const importedState = await page.evaluate(async ({ imported, l2 }) => {
      const entries = JSON.parse(localStorage.getItem('tezos-systems-saved-addresses') || '[]');
      const links = JSON.parse(localStorage.getItem('tezos-systems-linked-etherlink-accounts-v1') || '[]');
      const request = indexedDB.open('tezos-systems-my-tezos');
      const db = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const tx = db.transaction('snapshots', 'readonly');
      const snapshots = tx.objectStore('snapshots').getAll();
      const records = await new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve(snapshots.result);
        tx.onerror = () => reject(tx.error);
      });
      db.close();
      return {
        imported: entries.find((entry) => entry.address === imported),
        primary: entries.find((entry) => entry.label === 'Imported Primary'),
        link: links.find((entry) => entry.address === l2),
        observed: records.some((row) => row.scopeId === 'import-smoke' && row.sourceType === 'observed')
      };
    }, { imported: SAMPLE_DELEGATOR_ADDRESS, l2: SAMPLE_ETHERLINK_ADDRESS });
    assert(
      importedState.imported?.included === false
        && importedState.primary?.address === SAMPLE_ADDRESS
        && importedState.link?.linkedL1Addresses?.includes(SAMPLE_ADDRESS)
        && importedState.observed,
      `my tezos storage: atomic v2 import did not preserve user-authored and observed state ${JSON.stringify(importedState)}`
    );

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#portfolio-export').click();
    const download = await downloadPromise;
    const exportStream = await download.createReadStream();
    const exportChunks = [];
    for await (const chunk of exportStream) exportChunks.push(chunk);
    const exported = JSON.parse(Buffer.concat(exportChunks).toString('utf8'));
    assert(
      exported.schema === 'tezos-systems-my-tezos/v2'
        && exported.entries.some((entry) => entry.address === SAMPLE_DELEGATOR_ADDRESS)
        && exported.linkedL2Accounts.some((entry) => entry.address === SAMPLE_ETHERLINK_ADDRESS)
        && exported.observedSnapshots.some((row) => row.scopeId === 'import-smoke')
        && !Object.hasOwn(exported, 'holdings'),
      `my tezos storage: v2 export boundary is incorrect ${JSON.stringify(exported)}`
    );

    await context.close();
    assert(issues.length === 0, `my tezos storage browser issues:\n${issues.join('\n')}`);
    log('ok - my tezos storage smoke');
  }

  return { smokeMyTezosColdStart, smokeMyTezosIdleAccount, smokeMyTezosEmptyState, smokeMyTezosWalletConnect, smokeMyTezosAddressSwitch, smokeMyTezosStorage };
}
