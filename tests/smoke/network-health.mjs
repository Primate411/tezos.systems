// Browser workflows owned by network-health. Shared dependencies remain explicit.
export function createNetworkHealthSmokeSuites({
  ARTIFACTS_DIR,
  SAMPLE_ADDRESS_2,
  assert,
  assertNormalizedChamberShell,
  attachIssueCollectors,
  checkInspectorKeyboardReceipt,
  installFeatureMocks,
  log,
  sampleBakers
}) {
  async function smokeNetworkHealthInteractivePriority(browser, baseUrl) {
    const issues = [];
    const backlogTotal = 72;
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(context);
    await context.addInitScript(({ total }) => {
      localStorage.setItem('tezos-systems-theme', 'matrix');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
      localStorage.removeItem('tezos-systems-network-health');

      Object.defineProperty(window, '__tzktThrottle', {
        configurable: true,
        get() {
          return undefined;
        },
        set(throttle) {
          Object.defineProperty(window, '__tzktThrottle', {
            configurable: true,
            writable: true,
            value: throttle
          });
          window.__healthPriorityBacklogTotal = total;
          window.__healthPriorityBacklogCompleted = 0;
          const requests = Array.from({ length: total }, (_, index) => (
            fetch(`https://api.tzkt.io/v1/accounts/count?balance.gt=${index + 1}&health_priority_smoke=${index}`, {
              cache: 'no-store'
            }).then(() => {
              window.__healthPriorityBacklogCompleted += 1;
            }).catch(() => null)
          ));
          window.__healthPriorityBacklogQueuedAtInstall = throttle.queueLength;
          window.__healthPriorityBacklog = Promise.allSettled(requests);
        }
      });
    }, { total: backlogTotal });

    const page = await context.newPage();
    attachIssueCollectors(page, 'network health interactive priority', issues);
    const response = await page.goto(`${baseUrl}/#health`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `network health interactive priority: dashboard failed with HTTP ${response?.status()}`);
    await page.locator('#network-health-modal.active .health-content .health-header .chamber-title')
      .waitFor({ state: 'visible', timeout: 10000 });
    const state = await page.evaluate(() => ({
      completed: window.__healthPriorityBacklogCompleted,
      queueLength: window.__tzktThrottle?.queueLength ?? -1,
      queuedAtInstall: window.__healthPriorityBacklogQueuedAtInstall,
      rendered: document.querySelector('#network-health-modal.active .health-body')?.dataset.healthRendered || '',
      title: document.querySelector('#network-health-modal.active .health-header .chamber-title')?.textContent?.trim() || '',
      total: window.__healthPriorityBacklogTotal
    }));
    assert(
      state.title === 'Network Health Chamber'
        && state.rendered === 'true'
        && state.total === backlogTotal
        && state.queuedAtInstall === backlogTotal
        && state.completed < state.total
        && state.queueLength > 0,
      `network health interactive priority: the cold Chamber did not render ahead of the ordinary TzKT backlog ${JSON.stringify(state)}`
    );

    await context.close();
    assert(issues.length === 0, `network health interactive priority browser issues:\n${issues.join('\n')}`);
  }

  async function smokeLiveHeadThemeGeometry(browser, baseUrl) {
    const issues = [];
    const context = await browser.newContext({
      viewport: { width: 762, height: 900 },
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
    attachIssueCollectors(page, 'live head all-theme geometry', issues);
    const response = await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `live head all-theme geometry: dashboard failed with HTTP ${response?.status()}`);
    await page.locator('#live-head-button[data-live-head-wired="1"]').waitFor({ state: 'visible', timeout: 15000 });
    await page.evaluate(() => {
      const fixture = document.createElement('span');
      fixture.className = 'live-head-story';
      fixture.dataset.liveHeadThemeFitFixture = 'true';
      fixture.style.cssText = 'position:fixed;left:-10000px;top:0;width:250px;visibility:hidden;pointer-events:none';
      fixture.innerHTML = `
        <span class="live-head-miss-pill" data-missed-baker-address="tz1ThemeFitOne">Bake tz For Me · −2</span>
        <span class="live-head-miss-pill" data-missed-baker-address="tz1ThemeFitTwo">tz1bf81...XiriR · −1</span>
        <span class="live-head-miss-pill" data-missed-baker-address="tz1ThemeFitThree">tz1YviC...haZiC · −1</span>
        <span class="live-head-miss-pill is-more" data-live-head-miss-overflow hidden></span>`;
      document.getElementById('live-head')?.appendChild(fixture);
    });

    const states = [];
    const themes = ['aurora', 'matrix', 'hen', 'default', 'void', 'ember', 'signal', 'nerv', 'clean', 'dark', 'bubblegum', 'abyss', 'moss', 'valley', 'warzone'];
    for (const scenario of [
      { viewportWidth: 320, fixtureWidth: 132, controlHeight: 48 },
      { viewportWidth: 390, fixtureWidth: 192, controlHeight: 48 },
      { viewportWidth: 762, fixtureWidth: 250, controlHeight: 30 }
    ]) {
      await page.setViewportSize({ width: scenario.viewportWidth, height: 900 });
      await page.evaluate(async (fixtureWidth) => {
        const fixture = document.querySelector('[data-live-head-theme-fit-fixture]');
        if (fixture) fixture.style.width = `${fixtureWidth}px`;
        window.dispatchEvent(new Event('resize'));
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }, scenario.fixtureWidth);
      for (const theme of themes) {
        await page.evaluate((nextTheme) => {
          // Avoid awaiting an import through CDP while theme effects trigger GC.
          // The next assertion waits for the actual theme and loaded stylesheet.
          window.__smokeThemeChangeWork = import('/js/ui/theme.js').then(({ setTheme }) => setTheme(nextTheme));
        }, theme);
        await page.waitForFunction((expected) => (
          document.body.dataset.theme === expected
            && Boolean(document.getElementById(`theme-css-${expected}`)?.sheet)
        ), theme, { timeout: 5000 });
        await page.evaluate(async () => {
          await document.fonts?.ready;
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        });
        states.push(await page.evaluate(({ expectedTheme, expectedFixtureWidth, expectedControlHeight, viewportWidth }) => {
          const panel = document.getElementById('live-head');
          const story = panel?.querySelector('[data-live-head-theme-fit-fixture]');
          const storyRect = story?.getBoundingClientRect();
          const identityPills = Array.from(story?.querySelectorAll('[data-missed-baker-address]') || []);
          const visibleIdentityPills = identityPills.filter((pill) => !pill.hidden);
          const overflowPill = story?.querySelector('[data-live-head-miss-overflow]');
          const visiblePills = Array.from(story?.querySelectorAll('.live-head-miss-pill:not([hidden])') || []);
          const activityRect = document.querySelector('#header-activity-button')?.getBoundingClientRect();
          const filterRect = document.querySelector('#live-head-filter-toggle')?.getBoundingClientRect();
          const healthRect = document.querySelector('#chain-health')?.getBoundingClientRect();
          return {
            theme: expectedTheme,
            viewportWidth,
            expectedFixtureWidth,
            expectedControlHeight,
            pageOverflow: document.documentElement.scrollWidth - innerWidth,
            panelOverflow: panel ? panel.scrollWidth - panel.clientWidth : 999,
            identityTotal: identityPills.length,
            visibleIdentities: visibleIdentityPills.length,
            hiddenMisses: Number(story?.dataset.hiddenMissCount || 0),
            overflowVisible: Boolean(overflowPill && !overflowPill.hidden),
            overflowText: overflowPill?.textContent?.trim() || '',
            activityHeight: activityRect?.height || 0,
            samePillsRow: activityRect.right <= healthRect.left && Math.abs(activityRect.top - healthRect.top) < 1 && Math.abs(activityRect.bottom - healthRect.bottom) < 1,
            setupAbove: filterRect.bottom <= activityRect.top,
            filterHeight: filterRect?.height || 0,
            controlTopDelta: activityRect && filterRect ? Math.abs(activityRect.top - filterRect.top) : 999,
            controlBottomDelta: activityRect && filterRect ? Math.abs(activityRect.bottom - filterRect.bottom) : 999,
            fixtureWidth: storyRect?.width || 0,
            storyOverflow: story ? story.scrollWidth - story.clientWidth : 999,
            pillsUnclipped: visiblePills.every((pill) => pill.scrollWidth <= pill.clientWidth + 1),
            pillsContained: Boolean(storyRect && visiblePills.length && visiblePills.every((pill) => {
              const rect = pill.getBoundingClientRect();
              return rect.left >= storyRect.left - 1 && rect.right <= storyRect.right + 1;
            }))
          };
        }, {
          expectedTheme: theme,
          expectedFixtureWidth: scenario.fixtureWidth,
          expectedControlHeight: scenario.controlHeight,
          viewportWidth: scenario.viewportWidth
        }));
      }
    }

    assert(
      states.length === 45
        && states.every((state) => (
          state.pageOverflow <= 1
            && state.panelOverflow <= 1
            && Math.abs(state.activityHeight - state.expectedControlHeight) <= 1
            && (state.viewportWidth <= 719 ? state.samePillsRow && state.setupAbove && state.filterHeight === 30
              : Math.abs(state.activityHeight - state.filterHeight) <= 1
                && Math.abs(state.controlTopDelta - 36) <= 1
                && Math.abs(state.controlBottomDelta - 36) <= 1)
            && state.identityTotal === 3
            && state.visibleIdentities + state.hiddenMisses === state.identityTotal
            && state.hiddenMisses >= 1
            && state.overflowVisible
            && state.overflowText === `+${state.hiddenMisses} baker${state.hiddenMisses === 1 ? '' : 's'}`
            && Math.abs(state.fixtureWidth - state.expectedFixtureWidth) <= 1
            && state.pillsUnclipped
            && state.pillsContained
            && state.storyOverflow <= 1
        )),
      `live head all-theme geometry: stacked controls or missed-baker pills lost their layout ${JSON.stringify(states)}`
    );

    await context.close();
    assert(issues.length === 0, `live head all-theme geometry browser issues:\n${issues.join('\n')}`);
  }

  async function smokeNetworkHealthChamber(browser, baseUrl) {
    await checkInspectorKeyboardReceipt(browser, baseUrl);
    const { smokeLiveHeadDepth } = await import('../live-head-depth-smoke.mjs');
    await smokeLiveHeadDepth(browser, baseUrl, { installFeatureMocks, artifactsDir: ARTIFACTS_DIR });
    log('ok - five depth choices, custom validation, persistence, refresh, and responsive geometry');
    const { smokeLiveHeadReadability } = await import('../live-head-readability-smoke.mjs');
    await smokeLiveHeadReadability(browser, baseUrl, { installFeatureMocks, artifactsDir: ARTIFACTS_DIR });
    log('ok - Live Head contrast, full-height health rails, and R2 news threshold');
    const { smokeChainHealth } = await import('../chain-health-smoke.mjs');
    await smokeChainHealth(browser, baseUrl, { installFeatureMocks, artifactsDir: ARTIFACTS_DIR });
    log('ok - 25-block Chain health motion, quiet refresh, failure retention, and responsive themes');
    await smokeNetworkHealthInteractivePriority(browser, baseUrl);
    await smokeLiveHeadThemeGeometry(browser, baseUrl);
    const issues = [];
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      serviceWorkers: 'block'
    });
    const mockState = await installFeatureMocks(context, {
      blockHeadLagMs: 90000,
      networkHealthBlocksDelayMs: 500,
      blockHeadAutoAdvance: false
    });
    await context.addInitScript((myBakerAddress) => {
      window.__tezosSystemsIntervals = [];
      window.__healthPrintState = { html: '', focused: false, printed: false };
      const nativeWindowOpen = window.open.bind(window);
      window.open = (url = '', target = '', features = '') => {
        if (url && url !== 'about:blank') return nativeWindowOpen(url, target, features);

        let printWindow = null;
        const recordHtml = (value) => {
          window.__healthPrintState.html += String(value || '');
        };
        const printableBody = {};
        Object.defineProperty(printableBody, 'innerHTML', {
          get: () => window.__healthPrintState.html,
          set: (value) => {
            window.__healthPrintState.html = String(value || '');
          }
        });
        const printableDocument = {
          body: printableBody,
          documentElement: printableBody,
          open() {
            window.__healthPrintState.html = '';
          },
          write: recordHtml,
          close() {
            setTimeout(() => printWindow?.onload?.(), 0);
          }
        };
        printWindow = {
          document: printableDocument,
          onload: null,
          focus() {
            window.__healthPrintState.focused = true;
          },
          print() {
            window.__healthPrintState.printed = true;
          },
          close() {},
          addEventListener(type, callback) {
            if (type === 'load') setTimeout(callback, 0);
          }
        };
        return printWindow;
      };
      const originalSetInterval = window.setInterval.bind(window);
      window.setInterval = (handler, timeout, ...args) => {
        const id = originalSetInterval(handler, timeout, ...args);
        window.__tezosSystemsIntervals.push({ handler, id, timeout });
        return id;
      };
      localStorage.setItem('tezos-systems-theme', 'matrix');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
      localStorage.setItem('tezos-systems-live-head-activity-filter-v2', JSON.stringify([
        'l1-vote', 'l2-vote', 'transfers', 'art', 'defi', 'gaming', 'bridge', 'etherlink', 'stake', 'unstake'
      ]));
      localStorage.setItem('tezos-systems-my-baker-address', myBakerAddress);
      localStorage.setItem('tezos-systems-saved-addresses', JSON.stringify([{
        network: 'tezos-l1',
        address: myBakerAddress,
        label: 'Second Baker',
        included: true,
        addedAt: Date.now()
      }]));
      localStorage.setItem('tezos-systems-network-health', JSON.stringify({
        updatedAt: Date.now(),
        periodUpdatedAt: Date.now(),
        headLevel: 12345678,
        blocks: [],
        summary: { score: 99.8, totalPower: 34930, totalCommittee: 35000, missingPower: 70, count: 5 },
        periods: [
          { key: '24h', label: '24H', score: 99.8, actualPower: 1000, possiblePower: 1002, missingPower: 2, blocks: 14400, sampleSize: 5, sampled: false },
          { key: '7d', label: '7D', score: 99.7, actualPower: 1000, possiblePower: 1003, missingPower: 3, blocks: 100800, sampleSize: 5, sampled: true },
          { key: '31d', label: '31D', score: 99.6, actualPower: 1000, possiblePower: 1004, missingPower: 4, blocks: 446400, sampleSize: 5, sampled: true }
        ]
      }));
    }, SAMPLE_ADDRESS_2);
    const page = await context.newPage();
    attachIssueCollectors(page, 'network health chamber', issues);

    const response = await page.goto(`${baseUrl}/#health`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `network health chamber: dashboard failed with HTTP ${response?.status()}`);
    const initialLiveHeadState = await page.evaluate(() => {
      const panel = document.getElementById('live-head');
      const stack = document.getElementById('live-head-stack');
      return {
        ariaBusy: panel?.getAttribute('aria-busy') || '',
        feedState: panel?.dataset.feedState || '',
        placeholders: stack?.querySelectorAll('.live-head-row.is-placeholder').length || 0,
        visiblePlaceholders: Array.from(stack?.querySelectorAll('.live-head-row.is-placeholder') || [])
          .filter((row) => {
            const bounds = stack.getBoundingClientRect();
            const rect = row.getBoundingClientRect();
            return getComputedStyle(row).display !== 'none' && rect.top < bounds.bottom && rect.bottom > bounds.top;
          }).length,
        primaryBars: stack?.querySelectorAll('.live-head-skeleton-primary i').length || 0,
        secondaryBars: stack?.querySelectorAll('.live-head-skeleton-secondary i').length || 0,
        visibleText: stack?.textContent?.replace(/\s+/g, ' ').trim() || ''
      };
    });
    assert(
      initialLiveHeadState.ariaBusy === 'true'
        && initialLiveHeadState.feedState === 'loading'
        && initialLiveHeadState.placeholders === 25
        && initialLiveHeadState.visiblePlaceholders === 4
        && initialLiveHeadState.primaryBars === 125
        && initialLiveHeadState.secondaryBars === 50
        && initialLiveHeadState.visibleText === '',
      `network health chamber: Live Head first paint must be opaque objects without sentences ${JSON.stringify(initialLiveHeadState)}`
    );
    const initialFinality = (await page.locator('#hero-chain-uptime-finality').textContent())?.trim() || '';
    const initialFinalityTitle = await page.locator('[data-card-history="finality"]').getAttribute('title') || '';
    assert(
      initialFinality === '~12s' && /sampling now/i.test(initialFinalityTitle),
      `network health chamber: finality should show an honest estimate while live cadence samples, saw ${initialFinality} / ${initialFinalityTitle}`
    );
    await page.locator('#network-health-modal.active .health-content').waitFor({ state: 'visible', timeout: 15000 });
    await assertNormalizedChamberShell(page, '#network-health-modal.active', '.health-content', 'standard', 'network health chamber');
    await Promise.race([
      page.locator('#network-health-modal.active .chamber-loading-fill').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {}),
      page.locator('#network-health-modal.active .health-header').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
    ]);
    const loaderState = await page.evaluate(async () => {
      const modal = document.querySelector('#network-health-modal');
      const fill = modal?.querySelector('.chamber-loading-fill');
      const bar = modal?.querySelector('.chamber-loading-bar');
      const text = modal?.querySelector('.chamber-loading-text');
      if (!fill || !bar) return { present: false, racedToContent: Boolean(modal?.querySelector('.health-header')) };
      const animation = fill.getAnimations?.()[0];
      if (animation?.ready) await animation.ready;
      const firstStyle = getComputedStyle(fill);
      const firstTransform = firstStyle.transform;
      const firstTime = Number(animation?.currentTime) || 0;
      const startedAt = performance.now();
      while (fill.isConnected && performance.now() - startedAt < 1000) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        if ((Number(animation?.currentTime) || 0) > firstTime + 50) break;
      }
      const secondStyle = getComputedStyle(fill);
      return {
        present: true,
        text: text?.textContent || '',
        animationName: firstStyle.animationName,
        animationDuration: firstStyle.animationDuration,
        firstTransform,
        secondTransform: secondStyle.transform,
        fillWidth: fill.getBoundingClientRect().width,
        barWidth: bar.getBoundingClientRect().width,
        contentRendered: Boolean(modal?.querySelector('.health-header'))
      };
    });
    assert(loaderState.present || loaderState.racedToContent, 'network health chamber: neither loading animation nor completed chamber content appeared');
    if (loaderState.present) {
      assert(/Opening Network Health Chamber/.test(loaderState.text), `network health chamber: loading copy mismatch: ${loaderState.text}`);
      assert(loaderState.animationName === 'chamberLoadSlide', `network health chamber: loader animation missing: ${loaderState.animationName}`);
      assert(loaderState.animationDuration !== '0s', `network health chamber: loader animation duration missing: ${loaderState.animationDuration}`);
      assert(loaderState.firstTransform !== loaderState.secondTransform, `network health chamber: loader transform did not animate: ${loaderState.firstTransform}`);
      assert(loaderState.fillWidth > 0 && loaderState.fillWidth < loaderState.barWidth, `network health chamber: loader beam should be visible but smaller than the rail: ${loaderState.fillWidth}/${loaderState.barWidth}`);
      assert(!loaderState.contentRendered, 'network health chamber: chamber content rendered before loader assertion');
    }
    await page.waitForFunction(() => document.querySelectorAll('#health-recent-block-list .health-block-row').length >= 4, null, { timeout: 10000 });
    await page.waitForFunction(() => document.querySelectorAll('#health-missed-attester-list .health-attester-row').length >= 2, null, { timeout: 10000 });
    await page.waitForFunction(() => document.querySelectorAll('#health-activity-list .health-activity-row').length >= 1, null, { timeout: 10000 });
    await page.waitForFunction(() => /Teztale/.test(document.querySelector('#health-teztale-consensus')?.textContent || ''), null, { timeout: 10000 });
    await page.waitForFunction(() => document.querySelector('#health-nc-33')?.textContent === '1' && document.querySelector('#health-nc-66')?.textContent === '2', null, { timeout: 10000 });
    await page.waitForFunction(() => /Octez Versions/.test(document.querySelector('#health-octez-versions')?.textContent || ''), null, { timeout: 10000 });
    await page.waitForFunction(() => document.querySelectorAll('#live-head-stack .live-head-row[data-live-head-level]').length === 4, null, { timeout: 10000 });
    await page.waitForFunction(() => /Second Baker/.test(document.querySelector('#live-head-next')?.textContent || ''), null, { timeout: 10000 });
    await page.waitForFunction(() => Array.from(document.querySelectorAll('#live-head-stack .live-head-story')).every((row) => !/syncing/i.test(row.textContent || '')), null, { timeout: 10000 });
    await page.waitForFunction(() => Array.from(document.querySelectorAll('#live-head-stack .live-head-row[data-live-head-level]')).every((row) => row.dataset.gasState !== 'loading'), null, { timeout: 10000 });
    await page.waitForFunction(() => Array.from(document.querySelectorAll('#live-head-stack .live-head-story[data-miss-required="true"]')).some((row) => row.dataset.missState === 'resolved'), null, { timeout: 10000 });
    await page.waitForFunction(() => document.querySelector('#header-activity-button')?.getAttribute('aria-busy') === 'false', null, { timeout: 15000 });
    await page.waitForFunction(() => /^\d+$/.test(document.querySelector('#hero-chain-uptime-bakers')?.textContent || ''), null, { timeout: 20000 });
    await page.waitForFunction(() => /^\d+s$/.test((document.querySelector('#hero-chain-uptime-finality')?.textContent || '').trim()), null, { timeout: 20000 });
    await page.waitForFunction(() => document.querySelectorAll('#live-head-stack .live-head-row-exiting').length === 0, null, { timeout: 5000 });
    await page.waitForFunction(() => Boolean(document.querySelector('#live-head-stack .live-head-row[data-story-quiet="true"] .live-head-quiet')), null, { timeout: 15000 });

    const healthState = await page.evaluate(() => {
      const modal = document.querySelector('#network-health-modal');
      const modalContent = modal?.querySelector('.health-content');
      const healthGrid = modal?.querySelector('.health-dashboard-grid');
      const consensusPanel = modal?.querySelector('#health-teztale-consensus');
      const nakamotoPanel = modal?.querySelector('#health-nakamoto-coefficient');
      const consensusPropagation = modal?.querySelector('#health-teztale-propagation');
      const healthGridRect = healthGrid?.getBoundingClientRect();
      const consensusPanelRect = consensusPanel?.getBoundingClientRect();
      const header = document.querySelector('.header');
      const title = document.querySelector('.title');
      const topProof = document.querySelector('#top-continuity-panel');
      const topProofUptimeCluster = document.querySelector('.top-uptime-cluster');
      const topProofHistory = document.querySelector('#top-continuity-history');
      const topProofMilestonePopover = document.querySelector('#top-continuity-milestone-popover');
      const topProofMilestoneClaim = topProofHistory?.querySelector('.top-continuity-claim');
      const topProofMilestoneOutline = topProofHistory?.querySelector('.top-continuity-milestone-outline');
      const topProofMilestoneNew = topProofHistory?.querySelector('.top-continuity-milestone-new');
      const topProofMilestoneLink = document.querySelector('#top-continuity-milestone-link');
      const topProofMilestoneClose = document.querySelector('#top-continuity-milestone-close');
      const topProofFirstPill = topProof?.querySelector('.top-continuity-stat');
      const topProofHistoryRect = topProofHistory?.getBoundingClientRect();
      const topProofRuntime = topProofHistory?.querySelector('#hero-chain-uptime-counter');
      const topProofHistoryZoom = topProofHistory ? (parseFloat(getComputedStyle(topProofHistory).zoom) || 1) : 1;
      const headerActivityButton = document.querySelector('#header-activity-button');
      const headerActivityLine = document.querySelector('#header-activity-line');
      const headerActivityCluster = headerActivityLine?.querySelector('.header-activity-cluster');
      const headerActivityRect = headerActivityButton?.getBoundingClientRect();
      const headerActivityClusterRect = headerActivityCluster?.getBoundingClientRect();
	    const liveHeadFilterToggle = document.querySelector('#live-head-filter-toggle');
	    const liveHeadFilterMenu = document.querySelector('#live-head-filter-menu');
	    const liveHeadFilterRect = liveHeadFilterToggle?.getBoundingClientRect();
	    const card = document.querySelector('[data-stat="network-health"]');
	    const pulseTicker = document.querySelector('#pulse-ticker-strip');
	    const ticker = document.querySelector('#live-head');
      const liveHeadAlert = document.querySelector('#live-head-alert');
      const liveHeadStack = document.querySelector('#live-head-stack');
      const liveHeadRows = Array.from(liveHeadStack?.querySelectorAll('.live-head-row[data-live-head-level]') || []);
      const liveHeadWell = document.querySelector('#hero-search-form');
      const liveHeadPanel = document.querySelector('#hero-search-panel');
      const cycleChip = document.querySelector('#cycle-chip');
      const healthProof = modal?.querySelector('#health-chain-proof');
      const healthCyclePanel = modal?.querySelector('#health-cycle-timing');
      const healthProofRect = healthProof?.getBoundingClientRect();
      const healthCyclePanelRect = healthCyclePanel?.getBoundingClientRect();
      const priceBar = document.querySelector('#price-bar');
      const main = document.querySelector('main.main-content');
      const chambersSection = document.querySelector('#chambers-section');
      const tickerRect = ticker?.getBoundingClientRect();
      const mainRect = main?.getBoundingClientRect();
      const chambersRect = chambersSection?.getBoundingClientRect();
      return {
        title: modal?.querySelector('.chamber-title')?.textContent || '',
        modalRole: modalContent?.getAttribute('role') || '',
        modalAriaModal: modalContent?.getAttribute('aria-modal') || '',
        modalAriaLabel: modalContent?.getAttribute('aria-label') || '',
        modalAriaHidden: modal?.getAttribute('aria-hidden') || '',
        focusedClose: document.activeElement === modal?.querySelector('.chamber-close'),
        badge: modal?.querySelector('#health-header-badge')?.textContent || '',
        live: modal?.dataset.healthLive || '',
        refreshState: modal?.querySelector('#health-refresh-state')?.textContent || '',
        hero: modal?.querySelector('#health-hero-score')?.textContent || '',
        avg: modal?.querySelector('#health-avg-block')?.textContent || '',
        blockRows: modal?.querySelectorAll('#health-recent-block-list .health-block-row').length || 0,
        visibleBlockRows: Array.from(modal?.querySelectorAll('#health-recent-block-list .health-block-row') || [])
          .filter((row) => getComputedStyle(row).display !== 'none').length,
        blockDepthExpanded: modal?.querySelector('#health-block-depth-toggle')?.getAttribute('aria-expanded') || '',
        blockDepthLabel: modal?.querySelector('#health-block-depth-toggle')?.getAttribute('aria-label') || '',
        blockDepthCount: modal?.querySelector('[data-health-block-depth-count]')?.textContent?.trim() || '',
        blockSetupText: modal?.querySelector('#health-block-filter-toggle')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        blockSetupExpanded: modal?.querySelector('#health-block-filter-toggle')?.getAttribute('aria-expanded') || '',
        blockSetupWired: modal?.querySelector('.health-block-filter')?.dataset.liveHeadActivityFilterWired || '',
        blockReceiptRows: modal?.querySelectorAll('#health-recent-block-list [data-health-block-receipts]').length || 0,
        blockReceiptStatuses: modal?.querySelectorAll('#health-recent-block-list .health-block-receipts > :is(.live-head-gas, .live-head-quiet)').length || 0,
        blockReceiptStories: modal?.querySelectorAll('#health-recent-block-list .health-block-receipts .live-head-story-chip').length || 0,
        blockReceiptMisses: modal?.querySelectorAll('#health-recent-block-list .health-block-receipts .live-head-miss-pill').length || 0,
        blockReceiptGeometry: (() => {
          const table = modal?.querySelector('.health-block-table');
          const row = table?.querySelector('.health-block-row');
          const level = row?.querySelector('.health-block-level');
          const baker = row?.querySelector('.lb-baker-cell');
          const receipts = row?.querySelector('.health-block-receipts');
          const levelRect = level?.getBoundingClientRect();
          const bakerRect = baker?.getBoundingClientRect();
          const receiptRect = receipts?.getBoundingClientRect();
          return {
            levelWidth: levelRect?.width || 0,
            receiptWidth: receiptRect?.width || 0,
            receiptsAfterBaker: Boolean(bakerRect && receiptRect && bakerRect.right <= receiptRect.left + 1),
            overflow: table ? table.scrollWidth - table.clientWidth : 999
          };
        })(),
        roundOne: modal?.querySelectorAll('.health-round-badge.round-watch').length || 0,
        attesterRows: modal?.querySelectorAll('#health-missed-attester-list .health-attester-row').length || 0,
        missedBlockRows: modal?.querySelectorAll('#health-missed-block-list .health-missed-block-row').length || 0,
        activityRows: modal?.querySelectorAll('#health-activity-list .health-activity-row').length || 0,
        activityText: modal?.querySelector('#health-activity-list')?.textContent || '',
        incidentMemory: modal?.querySelector('#health-incident-memory')?.textContent || '',
        cycleTiming: modal?.querySelector('#health-cycle-timing')?.textContent || '',
        cycleTimingCells: modal?.querySelectorAll('#health-cycle-strip .health-cycle-cell').length || 0,
        cycleTimingStatus: modal?.querySelector('#health-cycle-status')?.textContent || '',
        cycleProgress: modal?.querySelector('#health-cycle-progress')?.textContent || '',
        cycleNumber: modal?.querySelector('#health-cycle-number')?.textContent || '',
        cycleProgressNow: modal?.querySelector('.health-cycle-progress-track[role="progressbar"]')?.getAttribute('aria-valuenow') || '',
        cycleProgressText: modal?.querySelector('.health-cycle-progress-track[role="progressbar"]')?.getAttribute('aria-valuetext') || '',
        cycleProgressFill: modal?.querySelector('.health-cycle-progress-track > span')?.style.width || '',
        teztale: modal?.querySelector('#health-teztale-consensus')?.textContent || '',
        teztaleFullWidth: Boolean(
          healthGridRect
          && consensusPanelRect
          && Math.abs(consensusPanelRect.left - healthGridRect.left) <= 1
          && Math.abs(consensusPanelRect.right - healthGridRect.right) <= 1
        ),
        nakamotoImmediatelyBeforeTeztale: nakamotoPanel?.nextElementSibling === consensusPanel,
        teztalePropagation: consensusPropagation?.textContent?.replace(/\s+/g, ' ').trim() || '',
        teztalePath: consensusPanel?.querySelector('.health-consensus-path')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        teztalePre66Avg: modal?.querySelector('#health-teztale-pre-66-avg')?.textContent || '',
        teztalePre90Avg: modal?.querySelector('#health-teztale-pre-90-avg')?.textContent || '',
        teztaleAtt66Avg: modal?.querySelector('#health-teztale-att-66-avg')?.textContent || '',
        teztaleAtt90Avg: modal?.querySelector('#health-teztale-att-90-avg')?.textContent || '',
        teztaleHistogramBins: consensusPropagation?.querySelectorAll('.health-consensus-histogram-bin').length || 0,
        teztaleQuorum: modal?.querySelector('#health-teztale-quorum')?.textContent || '',
        teztaleSources: modal?.querySelector('#health-teztale-source-count')?.textContent || '',
        teztaleOps: modal?.querySelector('#health-teztale-ops')?.textContent || '',
        teztaleCreditHref: modal?.querySelector('#health-teztale-credit a[href*="teztale-dataviz"]')?.href || '',
        teztaleNomadicHref: modal?.querySelector('#health-teztale-credit a[href*="nomadic-labs/teztale"]')?.href || '',
        teztaleEvents: modal?.querySelectorAll('#health-teztale-events .health-consensus-event').length || 0,
        nakamotoText: modal?.querySelector('#health-nakamoto-coefficient')?.textContent || '',
        nakamoto33: modal?.querySelector('#health-nc-33')?.textContent || '',
        nakamoto66: modal?.querySelector('#health-nc-66')?.textContent || '',
        nakamotoSourceRows: modal?.querySelectorAll('#health-nc-source-list .health-nc-source-row').length || 0,
        nakamotoChainspectHref: modal?.querySelector('#health-nc-source-list a[href*="chainspect.app"]')?.href || '',
        nakamotoEdiHref: modal?.querySelector('#health-nc-source-list a[href*="blockchainlab.inf.ed.ac.uk"]')?.href || '',
        nakamotoHelpLabel: modal?.querySelector('.health-nc-help > summary')?.getAttribute('aria-label') || '',
        nakamotoPrintButton: Boolean(modal?.querySelector('#health-nc-print')),
        nakamotoPrintLabel: modal?.querySelector('#health-nc-print')?.getAttribute('aria-label') || '',
        nakamotoShareButton: Boolean(modal?.querySelector('#health-nc-share')),
        nakamotoShareLabel: modal?.querySelector('#health-nc-share')?.getAttribute('aria-label') || '',
        octezVersions: modal?.querySelector('#health-octez-versions')?.textContent || '',
        octezCurrent: modal?.querySelector('#health-octez-current')?.textContent || '',
        octezLatestPower: modal?.querySelector('#health-octez-latest-power')?.textContent || '',
        octezKnown: modal?.querySelector('#health-octez-known')?.textContent || '',
        octezUpdatedAge: modal?.querySelector('#health-octez-updated')?.textContent || '',
        octezUpdatedAt: modal?.querySelector('#health-octez-updated')?.dataset.healthAge || '',
        octezRows: modal?.querySelectorAll('#health-octez-version-list .health-octez-version-row').length || 0,
        octezLaggers: modal?.querySelectorAll('#health-octez-laggards .health-octez-laggard-row').length || 0,
        periodTelemetry: modal?.querySelector('#health-period-telemetry')?.textContent || '',
        networkLoad: modal?.querySelector('#health-network-load')?.textContent || '',
        myBaker: modal?.querySelector('.health-my-baker-panel')?.textContent || '',
        myBakerStatus: modal?.querySelector('.health-my-baker-status')?.textContent || '',
        myBakerMetrics: Array.from(modal?.querySelectorAll('.health-my-baker-metrics strong') || []).map((el) => el.textContent || ''),
        topProofText: topProof?.textContent || '',
        topProofHistoryText: topProofHistory?.textContent || '',
        topProofInHeader: Boolean(topProof && header?.contains(topProof)),
        topProofHistoryInHeader: Boolean(topProofHistory && header?.contains(topProofHistory)),
        topProofTag: topProof?.tagName || '',
        topProofHistoryTag: topProofHistory?.tagName || '',
        topProofHistoryType: topProofHistory?.getAttribute('type') || '',
        topProofHistoryAriaControls: topProofHistory?.getAttribute('aria-controls') || '',
        topProofHistoryMilestoneRoute: topProofHistory?.dataset.milestoneRoute || '',
        topProofMilestoneOrbitCount: document.querySelectorAll('.top-continuity-milestone-orbit').length,
        topProofMilestoneClaim: topProofMilestoneClaim?.textContent?.trim() || '',
        topProofMilestoneOutlineInsideClock: Boolean(topProofHistory?.contains(topProofMilestoneOutline)),
        topProofMilestoneOutlineHidden: Boolean(topProofMilestoneOutline?.hidden),
        topProofMilestoneOutlineDisplay: topProofMilestoneOutline ? getComputedStyle(topProofMilestoneOutline).display : '',
        topProofMilestoneOutlineBorderStyle: topProofMilestoneOutline ? getComputedStyle(topProofMilestoneOutline).borderStyle : '',
        topProofMilestoneOutlineBoxShadow: topProofMilestoneOutline ? getComputedStyle(topProofMilestoneOutline).boxShadow : '',
        topProofMilestoneNewText: topProofMilestoneNew?.textContent?.trim() || '',
        topProofMilestoneLinkHref: topProofMilestoneLink?.getAttribute('href') || '',
        topProofMilestoneCloseExists: Boolean(topProofMilestoneClose),
        topProofMilestonePopoverAfterHistory: Boolean(topProofMilestonePopover && topProofHistory && (topProofHistory.compareDocumentPosition(topProofMilestonePopover) & Node.DOCUMENT_POSITION_FOLLOWING)),
        topProofMilestonePopoverHidden: Boolean(topProofMilestonePopover?.hidden),
        topProofMilestonePopoverDisplay: topProofMilestonePopover ? getComputedStyle(topProofMilestonePopover).display : '',
        topProofMilestonePopoverPosition: topProofMilestonePopover ? getComputedStyle(topProofMilestonePopover).position : '',
        topProofMilestonePopoverVisibility: topProofMilestonePopover ? getComputedStyle(topProofMilestonePopover).visibility : '',
        topProofMilestonePopoverOpacity: topProofMilestonePopover ? Number.parseFloat(getComputedStyle(topProofMilestonePopover).opacity) : 0,
        topProofMilestonePopoverAriaHidden: topProofMilestonePopover?.getAttribute('aria-hidden') || '',
        topProofMilestoneDisclosed: Boolean(topProofUptimeCluster?.classList.contains('is-milestone-disclosed')),
        topProofHistoryWired: topProof?.dataset.historyWired || '',
        topProofPillCards: Array.from(topProof?.querySelectorAll('.top-continuity-stat[data-card-history]') || []).map((pill) => pill.dataset.cardHistory || ''),
        topProofPillsWired: Array.from(topProof?.querySelectorAll('.top-continuity-stat[data-card-history]') || []).every((pill) => pill.dataset.topContinuityHistoryPillWired === '1'),
        topProofCounter: topProofHistory?.querySelector('#hero-chain-uptime-counter')?.textContent || '',
        topProofPairUnderTitle: Boolean(topProofUptimeCluster && title && topProofUptimeCluster.getBoundingClientRect().top >= title.getBoundingClientRect().bottom - 2),
        topProofPairLeftAligned: Boolean(topProofUptimeCluster && title && Math.abs(topProofUptimeCluster.getBoundingClientRect().left - title.getBoundingClientRect().left) <= 2),
        topProofBadgeHeight: topProofHistory?.getBoundingClientRect().height || 0,
        topProofRuntimeVisualFontSize: topProofRuntime ? parseFloat(getComputedStyle(topProofRuntime).fontSize) * topProofHistoryZoom : 0,
        topProofPillHeight: topProofFirstPill?.getBoundingClientRect().height || 0,
        topProofBadgeRadius: topProofHistory ? parseFloat(getComputedStyle(topProofHistory).borderTopLeftRadius) : 0,
        topProofPillRadius: topProofFirstPill ? parseFloat(getComputedStyle(topProofFirstPill).borderTopLeftRadius) : 0,
        topProofBakers: topProof?.querySelector('#hero-chain-uptime-bakers')?.textContent || '',
        topProofFinality: topProof?.querySelector('#hero-chain-uptime-finality')?.textContent || '',
        topProofStaked: topProof?.querySelector('#hero-chain-uptime-staked')?.textContent || '',
        topProofIssuance: topProof?.querySelector('#hero-chain-uptime-issuance')?.textContent || '',
        headerActivityText: headerActivityLine?.textContent?.replace(/\s+/g, ' ').trim() || '',
        headerActivityInLiveHead: Boolean(headerActivityButton && ticker?.contains(headerActivityButton)),
        headerActivityBeforeFilter: Boolean(headerActivityRect && liveHeadFilterRect && headerActivityRect.right <= liveHeadFilterRect.left + 1),
        headerActivityAlignedWithFilter: Boolean(headerActivityRect && liveHeadFilterRect && Math.abs((headerActivityRect.top + headerActivityRect.height / 2) - (liveHeadFilterRect.top + liveHeadFilterRect.height / 2)) <= 4),
        headerActivityFullyVisible: Boolean(headerActivityRect && headerActivityClusterRect
          && headerActivityClusterRect.left >= headerActivityRect.left - 1
          && headerActivityClusterRect.right <= headerActivityRect.right + 1
          && Array.from(headerActivityCluster?.querySelectorAll('.block-ticker-usage') || []).filter((segment) => getComputedStyle(segment).display !== 'none').every((segment) => {
            const rect = segment.getBoundingClientRect();
            return rect.left >= headerActivityRect.left - 1 && rect.right <= headerActivityRect.right + 1;
          })),
        headerActivityLabels: Array.from(headerActivityCluster?.querySelectorAll('.block-ticker-label') || []).filter((label) => getComputedStyle(label).display !== 'none').map((label) => label.textContent?.trim() || ''),
        headerActivityWired: headerActivityButton?.dataset.headerActivityWired || '',
        headerActivityTag: headerActivityButton?.tagName || '',
        headerActivityType: headerActivityButton?.getAttribute('type') || '',
        headerActivityBusy: headerActivityButton?.getAttribute('aria-busy') || '',
        headerActivityLoading: headerActivityCluster?.classList.contains('is-loading') || false,
	      liveHeadFilterMenuHidden: Boolean(liveHeadFilterMenu?.hidden),
	      liveHeadFilterAllPressed: liveHeadFilterMenu?.querySelector('[data-live-head-filter-kind="all"]')?.getAttribute('aria-pressed') || '',
	      liveHeadFilterSelectedCount: liveHeadFilterMenu?.querySelectorAll('.live-head-filter-pill[aria-pressed="true"]').length || 0,
	      liveHeadFilterStoredCount: JSON.parse(localStorage.getItem('tezos-systems-live-head-activity-filter-v3') || '[]').length,
	      liveHeadFilterWired: ticker?.dataset.liveHeadActivityFilterWired || '',
	      liveHeadConnectors: liveHeadRows.map((row) => {
	        const baker = row.querySelector('.live-head-baker');
	        const name = row.querySelector('.live-head-baker-name');
	        const connector = row.querySelector('.live-head-story-connector');
	        const story = row.querySelector('.live-head-story');
	        const connectorRect = connector?.getBoundingClientRect();
	        const storyRect = story?.getBoundingClientRect();
	        return {
	          width: connectorRect?.width || 0,
	          pointsIntoStory: Boolean(connectorRect && storyRect && connectorRect.right <= storyRect.left + 14),
	          aliasClipped: Boolean(baker && !baker.classList.contains('is-address') && name && name.scrollWidth > name.clientWidth + 1)
	        };
	      }),
        systemLinks: modal?.querySelectorAll('.health-baker-name-link[href^="#baker="]').length || 0,
        tzktLinks: modal?.querySelectorAll('.lb-baker-source-link[href^="https://tzkt.io/"]').length || 0,
        footer: modal?.querySelector('.chamber-footer')?.textContent || '',
        headMeta: modal?.querySelector('#health-head-meta')?.textContent || '',
        updatedAge: modal?.querySelector('.health-score-panel [data-health-age]')?.textContent || '',
        updatedAgeMs: modal?.querySelector('.health-score-panel [data-health-age]')?.dataset.healthAge
          ? Date.now() - new Date(modal.querySelector('.health-score-panel [data-health-age]').dataset.healthAge).getTime()
          : 0,
        ageLabelCount: modal?.querySelectorAll('[data-health-age]').length || 0,
        cardWired: card?.dataset.healthChamberWired || '',
        cardRole: card?.getAttribute('role') || '',
        cardTabIndex: card?.getAttribute('tabindex') || '',
        cardCue: Boolean(card?.querySelector('.chamber-expand-cue')),
        cardCueTag: card?.querySelector('.chamber-expand-cue')?.tagName || '',
        cardCueLabel: card?.querySelector('.chamber-expand-cue')?.getAttribute('aria-label') || '',
        cardWide: card?.classList.contains('chamber-entry-wide') || false,
        cardCopyHash: card?.querySelector('.card-copy-link')?.dataset.copyHash || '',
        cardUpdatedLabel: card?.dataset.updatedLabel || '',
        cardFreshnessState: card?.dataset.freshnessState || '',
        cardFreshnessTimestamp: card?.dataset.freshnessTimestamp || '',
        cardFreshnessStaleAfter: card?.dataset.freshnessStaleAfter || '',
        cardFreshnessAgeMs: card?.dataset.freshnessTimestamp
          ? Date.now() - Number(card.dataset.freshnessTimestamp)
          : 0,
        cardStale: card?.classList.contains('chamber-data-stale') || false,
        cardTape: card?.querySelector('#network-health-live-tape')?.textContent || '',
	      liveHeadHeight: tickerRect?.height || 0,
	      liveHeadChainState: ticker?.dataset.chainState || '',
	      liveHeadStateText: ticker?.querySelector('.live-head-state')?.textContent?.trim() || '',
	      liveHeadStateDisplay: ticker?.querySelector('.live-head-state') ? getComputedStyle(ticker.querySelector('.live-head-state')).display : '',
	      liveHeadAlertHidden: Boolean(liveHeadAlert?.hidden),
	      liveHeadAlertTag: liveHeadAlert?.tagName || '',
	      liveHeadAlertLabel: liveHeadAlert?.querySelector('[data-live-head-alert-label]')?.textContent?.trim() || '',
	      liveHeadAlertDetail: liveHeadAlert?.querySelector('[data-live-head-alert-detail]')?.textContent?.trim() || '',
	      liveHeadAlertDuration: liveHeadAlert?.querySelector('[data-live-head-alert-duration]')?.textContent?.trim() || '',
	      liveHeadAlertFontSize: liveHeadAlert?.querySelector('[data-live-head-alert-label]') ? parseFloat(getComputedStyle(liveHeadAlert.querySelector('[data-live-head-alert-label]')).fontSize) : 0,
	      liveHeadAlertBorderColor: liveHeadAlert ? getComputedStyle(liveHeadAlert).borderTopColor : '',
	      liveHeadAlertBackground: liveHeadAlert ? getComputedStyle(liveHeadAlert).backgroundImage : '',
	      liveHeadTopRuleDisplay: ticker ? getComputedStyle(ticker, '::before').display : '',
	      liveHeadRows: liveHeadRows.length,
	      liveHeadRowHeights: liveHeadRows.map((row) => row.getBoundingClientRect().height),
	      liveHeadKeys: liveHeadRows.map((row) => row.dataset.quietKey || ''),
	      liveHeadLevels: liveHeadRows.map((row) => row.querySelector('.live-head-level')?.textContent?.trim() || ''),
	      liveHeadRounds: liveHeadRows.map((row) => row.querySelector('.health-round-badge')?.textContent?.trim() || ''),
	      liveHeadDeltas: liveHeadRows.map((row) => row.querySelector('.health-interval')?.textContent?.trim() || ''),
	      liveHeadPowers: liveHeadRows.map((row) => row.querySelector('.live-head-power-full')?.textContent?.replace(/\s+/g, '') || ''),
	      liveHeadConsensusStates: liveHeadRows.map((row) => row.dataset.consensusState || ''),
	      liveHeadMarginRails: liveHeadRows.map((row) => {
	        const power = row.querySelector('.live-head-power');
	        const track = row.querySelector('.live-head-power-track');
	        const full = row.querySelector('.live-head-margin-full');
	        const compact = row.querySelector('.live-head-margin-compact');
	        const activity = row.querySelector('.live-head-quiet, .live-head-gas, .live-head-gas-skeleton');
	        const info = row.querySelector('.live-head-info');
	        const age = row.querySelector('.live-head-age');
	        const visibleMargin = [full, compact].find((node) => node && getComputedStyle(node).display !== 'none');
	        return {
	          margin: Number(row.dataset.safetyMargin),
	          power: Number(row.dataset.attestedPower),
	          text: visibleMargin?.textContent?.trim() || '',
	          missingFull: full?.textContent?.trim() || '',
	          title: track?.getAttribute('title') || '',
	          adjacent: power?.nextElementSibling === track,
	          noMarker: getComputedStyle(track, '::after').content === 'none',
	          noStandaloneMissed: !row.querySelector('.live-head-missed'),
	          order: Boolean(track && activity && track.getBoundingClientRect().right <= activity.getBoundingClientRect().left + 1),
	          infoBeforeAge: Boolean(info && age && info.getBoundingClientRect().right <= age.getBoundingClientRect().left + 1),
	          infoAgeGap: info && age ? age.getBoundingClientRect().left - info.getBoundingClientRect().right : null,
	          infoSize: info?.getBoundingClientRect().width || 0,
	          infoLabel: info?.getAttribute('aria-label') || ''
	        };
	      }),
	      liveHeadQuietRows: liveHeadRows.filter((row) => row.dataset.storyQuiet === 'true').map((row) => {
	        const quiet = row.querySelector('.live-head-quiet');
	        return {
	          text: quiet?.textContent?.trim() || '',
	          topLine: Boolean(quiet && row.querySelector('.live-head-row-main')?.contains(quiet)),
	          bottomQuiet: Boolean(row.querySelector('.live-head-row-detail .live-head-story-chip.is-quiet'))
	        };
	      }),
	      liveHeadGasRows: liveHeadRows.filter((row) => row.dataset.storyQuiet !== 'true').map((row) => {
	        const gas = row.querySelector('.live-head-gas');
	        return {
	          state: row.dataset.gasState || '',
	          percent: Number(row.dataset.gasPercent),
	          text: gas?.textContent?.trim() || '',
	          className: gas?.className || '',
	          title: gas?.getAttribute('title') || '',
	          topLine: Boolean(gas && row.querySelector('.live-head-row-main')?.contains(gas)),
	          hasQuiet: Boolean(row.querySelector('.live-head-quiet'))
	        };
	      }),
	      liveHeadBarSignatures: liveHeadRows.map((row) => row.dataset.barSignature || ''),
	      liveHeadBarAnimations: liveHeadRows.map((row) => getComputedStyle(row.querySelector('.live-head-power-fill')).animationName),
	      liveHeadAges: liveHeadRows.map((row) => row.querySelector('.live-head-age')?.textContent?.trim() || ''),
	      liveHeadRowBakers: liveHeadRows.map((row) => row.querySelector('.live-head-baker')?.textContent?.trim() || ''),
	      liveHeadSearchHelp: document.querySelector('#hero-search-help')?.textContent?.replace(/\s+/g, ' ').trim() || '',
	      liveHeadTypeAndAlignment: (() => {
	        const input = document.querySelector('#hero-search-input');
	        const help = document.querySelector('#hero-search-help');
	        const level = liveHeadRows[0]?.querySelector('.live-head-level');
	        const baker = liveHeadRows.find((row) => row.querySelector('.live-head-baker:not(.is-address)'))?.querySelector('.live-head-baker:not(.is-address)');
	        return {
	          inputFont: input ? getComputedStyle(input).fontFamily : '',
	          helpFont: help ? getComputedStyle(help).fontFamily : '',
	          bakerFont: baker ? getComputedStyle(baker).fontFamily : '',
	          inputLevelDelta: input && level ? Math.abs(input.getBoundingClientRect().left - level.getBoundingClientRect().left) : 999,
	          helpBakerDelta: help && baker ? Math.abs(help.getBoundingClientRect().left - baker.getBoundingClientRect().left) : 999,
	          helpVisible: Boolean(help && getComputedStyle(help).display !== 'none' && help.getBoundingClientRect().height > 0)
	        };
	      })(),
	      liveHeadRowBorderBottoms: liveHeadRows.map((row) => getComputedStyle(row).borderBottomWidth),
	      liveHeadStories: liveHeadRows.map((row) => row.querySelector('.live-head-story')?.textContent?.replace(/\s+/g, ' ').trim() || ''),
	      liveHeadMissRows: liveHeadRows.map((row) => {
	        const detail = row.querySelector('.live-head-story');
	        const pills = Array.from(row.querySelectorAll('.live-head-miss-pill'));
	        return {
	          power: Number(row.dataset.attestedPower),
	          quiet: row.dataset.storyQuiet === 'true',
	          required: detail?.dataset.missRequired || '',
	          state: detail?.dataset.missState || '',
	          text: pills.map((pill) => pill.textContent?.replace(/\s+/g, ' ').trim() || '').join(' | '),
	          addresses: pills.map((pill) => pill.dataset.missedBakerAddress || '').filter(Boolean),
	          visibleAddresses: pills.filter((pill) => pill.dataset.missedBakerAddress && !pill.hidden).map((pill) => pill.dataset.missedBakerAddress),
	          hiddenCount: Number(detail?.dataset.hiddenMissCount || 0),
	          overflowVisible: Boolean(detail?.querySelector('[data-live-head-miss-overflow]:not([hidden])')),
	          titles: pills.map((pill) => pill.getAttribute('title') || '').join(' | '),
	          styles: pills.map((pill) => {
	            const style = getComputedStyle(pill);
	            return { overflow: style.overflow, textOverflow: style.textOverflow, whiteSpace: style.whiteSpace, maxWidth: style.maxWidth, borderColor: style.borderColor };
	          })
	        };
	      }),
	      liveHeadStoryTones: Array.from(liveHeadStack?.querySelectorAll('.live-head-story-chip') || []).map((pill) => {
	        const style = getComputedStyle(pill);
	        return `${style.color}|${style.backgroundColor}|${style.borderColor}`;
	      }),
	      liveHeadStoryReceipts: Array.from(liveHeadStack?.querySelectorAll('.live-head-story-chip') || []).map((pill) => {
	        const style = getComputedStyle(pill);
	        return {
	          backgroundColor: style.backgroundColor,
	          color: style.color,
	          compact: pill.dataset.liveHeadCompact || '',
	          details: JSON.parse(pill.dataset.liveHeadDetails || '[]'),
	          fontWeight: Number(style.fontWeight || 0),
	          hidden: pill.hidden,
	          mandatory: pill.dataset.liveHeadMandatory === 'true',
	          kind: Array.from(pill.classList).find((name) => /^is-(evidence|milestone|baker|l1-vote|l2-vote|etherlink|dal|art|defi|gaming|bridge|domains|stake|unstake|delegate|tokens|contract|transfers|calls)$/.test(name))?.slice(3) || '',
	          level: Number(pill.dataset.liveHeadDetailLevel || 0),
	          text: pill.textContent?.replace(/\s+/g, ' ').trim() || ''
	        };
	      }),
	      liveHeadHasGlobalMissLine: Boolean(document.querySelector('#live-head-bakers')),
	      liveHeadNext: document.querySelector('#live-head-next')?.textContent?.replace(/\s+/g, ' ').trim() || '',
	      liveHeadNextDue: document.querySelector('#live-head-next [data-heartbeat-due]')?.textContent?.trim() || '',
	      liveHeadAnnouncerLive: document.querySelector('#chain-heartbeat-announcer')?.getAttribute('aria-live') || '',
	      liveHeadAriaLive: liveHeadStack?.getAttribute('aria-live') || '',
	      liveHeadWired: document.querySelector('#live-head-button')?.dataset.liveHeadWired || '',
	      liveHeadFeedState: ticker?.dataset.feedState || '',
	      liveHeadSignature: liveHeadStack?.dataset.liveHeadSignature || '',
	      liveHeadStoryChipCount: liveHeadStack?.querySelectorAll('.live-head-story-chip').length || 0,
	      liveHeadStoryMax: Math.max(0, ...liveHeadRows.map((row) => row.querySelectorAll('.live-head-story-chip').length)),
	      liveHeadWellInside: Boolean(tickerRect && liveHeadWell?.getBoundingClientRect().left >= tickerRect.left && liveHeadWell?.getBoundingClientRect().right <= tickerRect.right),
	      liveHeadWellIntegrated: (() => {
	        const formRect = liveHeadWell?.getBoundingClientRect();
	        if (!tickerRect || !formRect) return null;
	        const style = getComputedStyle(liveHeadWell);
	        return {
	          leftGap: formRect.left - tickerRect.left,
	          rightGap: tickerRect.right - formRect.right,
	          bottomGap: tickerRect.bottom - formRect.bottom,
	          borderTop: style.borderTopWidth,
	          borderRight: style.borderRightWidth,
	          borderBottom: style.borderBottomWidth,
	          borderLeft: style.borderLeftWidth
	        };
	      })(),
	      liveHeadPanelPosition: liveHeadPanel ? getComputedStyle(liveHeadPanel).position : '',
	      liveHeadPanelBottomGap: liveHeadPanel && !liveHeadPanel.hidden ? innerHeight - liveHeadPanel.getBoundingClientRect().bottom : null,
	      cardHasProofStrip: Boolean(card?.querySelector('#network-health-proof, #chain-uptime-counter')),
	      pulseTickerOwnIsland: pulseTicker?.tagName === 'SECTION' && pulseTicker?.parentElement === document.body,
	      pulseTickerAfterHeader: Boolean(header && pulseTicker && (header.compareDocumentPosition(pulseTicker) & Node.DOCUMENT_POSITION_FOLLOWING)),
	      pulseTickerBeforeBlock: pulseTicker?.nextElementSibling === ticker,
	      liveHeadOwnIsland: ticker?.tagName === 'SECTION' && ticker?.parentElement === document.body,
        liveHeadBeforeMainContent: Boolean(ticker && main && (ticker.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING)),
        liveHeadAboveChambers: Boolean(tickerRect && chambersRect && tickerRect.bottom < chambersRect.top),
        liveHeadClearOfMainContent: Boolean(tickerRect && mainRect && mainRect.top - tickerRect.bottom >= 0),
        networkHealthProofText: healthProof?.textContent || '',
        networkHealthProofCounter: healthProof?.querySelector('#chain-uptime-counter')?.textContent || '',
        networkHealthProofBakers: healthProof?.querySelector('#chain-uptime-bakers')?.textContent || '',
        networkHealthProofFinality: healthProof?.querySelector('#chain-uptime-finality')?.textContent || '',
        networkHealthProofStaked: healthProof?.querySelector('#chain-uptime-staked')?.textContent || '',
        networkHealthProofIssuance: healthProof?.querySelector('#chain-uptime-issuance')?.textContent || '',
        networkHealthProofFontSize: healthProof?.querySelector('#chain-uptime-counter')
          ? parseFloat(getComputedStyle(healthProof.querySelector('#chain-uptime-counter')).fontSize)
          : 0,
        cycleImmediatelyAfterContinuity: healthProof?.nextElementSibling === healthCyclePanel,
        cycleAlignedBelowContinuity: Boolean(healthProofRect && healthCyclePanelRect
          && healthCyclePanelRect.top >= healthProofRect.bottom
          && Math.abs(healthCyclePanelRect.left - healthProofRect.left) <= 1
          && Math.abs(healthCyclePanelRect.right - healthProofRect.right) <= 1),
        topPriceBarText: priceBar?.textContent?.replace(/\s+/g, ' ').trim() || '',
        topPriceBarCycleChipTag: cycleChip?.tagName || '',
        topPriceBarCycleChipHref: cycleChip?.getAttribute('href') || '',
        topPriceBarCycleChipWired: cycleChip?.dataset.healthChamberWired || '',
        topPriceBarHasBlockReadout: Boolean(priceBar?.querySelector('#cycle-chip-block')),
        topPriceBarHasBlockAge: Boolean(priceBar?.querySelector('#uptime-block-age')),
        topPriceBarHasPulseDot: Boolean(priceBar?.querySelector('#uptime-pulse-dot')),
        intervalDelays: (window.__tezosSystemsIntervals || []).map((item) => item.timeout ?? item)
      };
    });

    const liveHeadPillFitProbe = await page.evaluate(async () => {
      const panel = document.getElementById('live-head');
      const originalWidth = panel?.style.width || '';
      if (!panel) return null;
      const naturalWidth = Math.round(panel.getBoundingClientRect().width);
      const candidates = [];
      for (let width = 380; width < naturalWidth; width += 20) candidates.push(width);
      let result = null;
      for (const width of candidates) {
        panel.style.width = `${width}px`;
        for (let frame = 0; frame < 6; frame += 1) {
          await new Promise((resolve) => requestAnimationFrame(resolve));
        }
        const detail = document.querySelector('#live-head-stack .live-head-story[data-miss-state="resolved"]');
        const pills = Array.from(detail?.querySelectorAll('[data-missed-baker-address]') || []);
        const candidate = {
          panelWidth: panel.getBoundingClientRect().width,
          detailWidth: detail?.getBoundingClientRect().width || 0,
          detailClientWidth: detail?.clientWidth || 0,
          detailScrollWidth: detail?.scrollWidth || 0,
          all: pills.length,
          visible: pills.filter((pill) => !pill.hidden).length,
          hidden: Number(detail?.dataset.hiddenMissCount || 0),
          summary: detail?.querySelector('[data-live-head-miss-overflow]:not([hidden])')?.textContent?.trim() || ''
        };
        result = candidate;
        if (candidate.visible > 0 && candidate.hidden > 0 && candidate.visible + candidate.hidden === candidate.all) break;
      }
      // Mandatory missed-round receipts now share this lane. Prove the no-cap
      // behavior with explicitly ample space, not the old 1440px content budget.
      panel.style.width = '2200px';
      for (let frame = 0; frame < 6; frame += 1) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      const wideDetail = document.querySelector('#live-head-stack .live-head-story[data-miss-state="resolved"]');
      const widePills = Array.from(wideDetail?.querySelectorAll('[data-missed-baker-address]') || []);
      const wide = {
        all: widePills.length,
        visible: widePills.filter((pill) => !pill.hidden).length,
        hidden: Number(wideDetail?.dataset.hiddenMissCount || 0),
        overflowVisible: Boolean(wideDetail?.querySelector('[data-live-head-miss-overflow]:not([hidden])'))
      };
      panel.style.width = originalWidth;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return { ...result, wide };
    });

    await page.waitForFunction(() => {
      const rows = Array.from(document.querySelectorAll('#health-recent-block-list .health-block-row'));
      const visibleRows = rows.filter((row) => getComputedStyle(row).display !== 'none');
      return rows.length === 15
        && visibleRows.length === 8
        && visibleRows.every((row) => row.querySelector('[data-health-block-receipts]'))
        && visibleRows.every((row) => !row.querySelector('.live-head-gas-skeleton, .live-head-story.is-loading'));
    }, null, { timeout: 20000 });
    const chamberReceiptState = await page.evaluate(() => ({
      rows: document.querySelectorAll('#health-recent-block-list [data-health-block-receipts]').length,
      statuses: document.querySelectorAll('#health-recent-block-list .health-block-receipts > :is(.live-head-gas, .live-head-quiet)').length,
      stories: document.querySelectorAll('#health-recent-block-list .health-block-receipts .live-head-story-chip').length,
      misses: document.querySelectorAll('#health-recent-block-list .health-block-receipts .live-head-miss-pill').length
    }));

    assert(/Network Health Chamber/.test(healthState.title), `network health chamber: title mismatch: ${healthState.title}`);
    assert(healthState.modalRole === 'dialog' && healthState.modalAriaModal === 'true' && /Network Health Chamber/.test(healthState.modalAriaLabel), `network health chamber: dialog semantics missing: ${JSON.stringify(healthState)}`);
    assert(healthState.modalAriaHidden === 'false' && healthState.focusedClose, `network health chamber: open dialog state/focus mismatch: hidden=${healthState.modalAriaHidden} focusedClose=${healthState.focusedClose}`);
    assert(/Healthy|Watch/.test(healthState.badge), `network health chamber: badge mismatch: ${healthState.badge}`);
    assert(healthState.live === 'true', `network health chamber: live refresh should be active, saw ${healthState.live}`);
    assert(/auto-refresh 6s/.test(healthState.refreshState), `network health chamber: refresh label mismatch: ${healthState.refreshState}`);
    assert(/%/.test(healthState.hero), `network health chamber: hero score missing: ${healthState.hero}`);
    assert(/s/.test(healthState.avg), `network health chamber: average block time missing: ${healthState.avg}`);
    assert(healthState.blockRows === 15
        && healthState.visibleBlockRows === 8
        && healthState.blockDepthExpanded === 'false'
        && /Show all 15 Passing Blocks/.test(healthState.blockDepthLabel)
        && healthState.blockDepthCount === '8 blocks',
      `network health chamber: compact Passing Blocks depth mismatch ${JSON.stringify({
        rows: healthState.blockRows,
        visible: healthState.visibleBlockRows,
        expanded: healthState.blockDepthExpanded,
        label: healthState.blockDepthLabel,
        count: healthState.blockDepthCount
      })}`);
    assert(healthState.blockSetupText === 'Setup'
        && healthState.blockSetupExpanded === 'false'
        && healthState.blockSetupWired === '1'
        && chamberReceiptState.rows === 15
        && chamberReceiptState.statuses >= 8
        && chamberReceiptState.stories >= 1
        && chamberReceiptState.misses >= 1
        && healthState.blockReceiptGeometry.levelWidth <= 126
        && healthState.blockReceiptGeometry.receiptWidth >= 290
        && healthState.blockReceiptGeometry.receiptsAfterBaker
        && healthState.blockReceiptGeometry.overflow <= 1,
      `network health chamber: reclaimed Level lane, shared receipts, or top-right Setup geometry mismatch ${JSON.stringify({
        setup: [healthState.blockSetupText, healthState.blockSetupExpanded, healthState.blockSetupWired],
        receipts: chamberReceiptState,
        geometry: healthState.blockReceiptGeometry
      })}`);

    const chamberSetupToggle = page.locator('#health-block-filter-toggle');
    await chamberSetupToggle.scrollIntoViewIfNeeded();
    await chamberSetupToggle.click();
    await page.locator('#health-block-filter-menu:not([hidden])').waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('#health-block-filter-menu [data-live-head-filter-kind="all"]').click();
    const chamberActivityFilterOff = await page.evaluate(() => ({
      chamberAllPressed: document.querySelector('#health-block-filter-menu [data-live-head-filter-kind="all"]')?.getAttribute('aria-pressed') || '',
      homeAllPressed: document.querySelector('#live-head-filter-menu [data-live-head-filter-kind="all"]')?.getAttribute('aria-pressed') || '',
      visibleStories: Array.from(document.querySelectorAll('#health-recent-block-list .live-head-story-chip')).filter((pill) => !pill.hidden).length,
      visibleMandatoryStories: Array.from(document.querySelectorAll('#health-recent-block-list .live-head-story-chip[data-live-head-mandatory="true"]')).filter((pill) => !pill.hidden).length,
      visibleOptionalStories: Array.from(document.querySelectorAll('#health-recent-block-list .live-head-story-chip:not([data-live-head-mandatory="true"])')).filter((pill) => !pill.hidden).length,
      visibleStatuses: Array.from(document.querySelectorAll('#health-recent-block-list .live-head-gas, #health-recent-block-list .live-head-quiet')).filter((pill) => !pill.hidden).length,
      visibleMisses: Array.from(document.querySelectorAll('#health-recent-block-list .live-head-miss-pill')).filter((pill) => !pill.hidden).length
    }));
    await page.locator('#health-block-filter-menu [data-live-head-filter-kind="all"]').click();
    const chamberActivityFilterOn = await page.evaluate(() => ({
      chamberAllPressed: document.querySelector('#health-block-filter-menu [data-live-head-filter-kind="all"]')?.getAttribute('aria-pressed') || '',
      homeAllPressed: document.querySelector('#live-head-filter-menu [data-live-head-filter-kind="all"]')?.getAttribute('aria-pressed') || '',
      visibleStories: Array.from(document.querySelectorAll('#health-recent-block-list .live-head-story-chip')).filter((pill) => !pill.hidden).length,
      visibleMandatoryStories: Array.from(document.querySelectorAll('#health-recent-block-list .live-head-story-chip[data-live-head-mandatory="true"]')).filter((pill) => !pill.hidden).length,
      visibleOptionalStories: Array.from(document.querySelectorAll('#health-recent-block-list .live-head-story-chip:not([data-live-head-mandatory="true"])')).filter((pill) => !pill.hidden).length
    }));
    await page.keyboard.press('Escape');
    assert(chamberActivityFilterOff.chamberAllPressed === 'false'
        && chamberActivityFilterOff.homeAllPressed === 'false'
        && chamberActivityFilterOff.visibleMandatoryStories >= 3
        && chamberActivityFilterOff.visibleOptionalStories === 0
        && chamberActivityFilterOff.visibleStatuses >= 8
        && chamberActivityFilterOff.visibleMisses >= 1
        && chamberActivityFilterOn.chamberAllPressed === 'true'
        && chamberActivityFilterOn.homeAllPressed === 'true'
        && chamberActivityFilterOn.visibleMandatoryStories === chamberActivityFilterOff.visibleMandatoryStories
        && chamberActivityFilterOn.visibleOptionalStories >= 1,
      `network health chamber: top-right Setup did not share normal activity choices while retaining gas, missed, evidence, milestone, and baker receipts ${JSON.stringify({ chamberActivityFilterOff, chamberActivityFilterOn })}`);

    await chamberSetupToggle.click();
    await page.locator('#health-block-filter-menu:not([hidden])').waitFor({ state: 'visible', timeout: 5000 });
    const chamberMyTezosToggle = page.locator('#health-block-filter-menu [data-live-head-my-tezos-toggle]');
    assert(!(await chamberMyTezosToggle.isDisabled()), 'network health chamber: saved My Tezos addresses should enable the personal block monitor');
    await chamberMyTezosToggle.click();
    await page.waitForFunction(() => (
      localStorage.getItem('tezos-systems-live-head-my-tezos-only-v1') === '1'
        && document.querySelector('#health-block-filter-menu [data-live-head-my-tezos-toggle]')?.getAttribute('aria-pressed') === 'true'
        && Array.from(document.querySelectorAll('#health-recent-block-list .health-block-row')).some((row) => row.dataset.myTezosBlockState === 'match')
    ), null, { timeout: 10000 });
    const myTezosMonitorOn = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('#health-recent-block-list .health-block-row'));
      const matching = rows.filter((row) => row.dataset.myTezosBlockState === 'match');
      const filtered = rows.filter((row) => row.classList.contains('is-my-tezos-filtered-out'));
      return {
        stored: localStorage.getItem('tezos-systems-live-head-my-tezos-only-v1'),
        chamberPressed: document.querySelector('#health-block-filter-menu [data-live-head-my-tezos-toggle]')?.getAttribute('aria-pressed') || '',
        homePressed: document.querySelector('#live-head-filter-menu [data-live-head-my-tezos-toggle]')?.getAttribute('aria-pressed') || '',
        setupPressed: document.querySelector('#live-head-my-tezos-setting')?.getAttribute('aria-pressed') || '',
        setupCount: document.querySelector('#live-head-my-tezos-setting [data-live-head-my-tezos-count]')?.textContent?.trim() || '',
        matching: matching.length,
        filtered: filtered.length,
        matchingVisible: matching.filter((row) => getComputedStyle(row).display !== 'none').length,
        statusPresent: Boolean(document.querySelector('#health-recent-block-list [data-live-head-my-tezos-status]'))
      };
    });
    assert(myTezosMonitorOn.stored === '1'
        && myTezosMonitorOn.chamberPressed === 'true'
        && myTezosMonitorOn.homePressed === 'true'
        && myTezosMonitorOn.setupPressed === 'true'
        && myTezosMonitorOn.setupCount === '1 saved'
        && myTezosMonitorOn.matching >= 1
        && myTezosMonitorOn.filtered >= 1
        && myTezosMonitorOn.matchingVisible >= 1
        && myTezosMonitorOn.statusPresent === false,
      `network health chamber: My Tezos monitor did not persist, share controls, or retain only matched block rows ${JSON.stringify(myTezosMonitorOn)}`);

    await chamberMyTezosToggle.click();
    await page.waitForFunction(() => (
      localStorage.getItem('tezos-systems-live-head-my-tezos-only-v1') === '0'
        && !document.querySelector('#health-recent-block-list .health-block-row.is-my-tezos-filtered-out')
    ), null, { timeout: 5000 });
    const myTezosMonitorOff = await page.evaluate(() => ({
      stored: localStorage.getItem('tezos-systems-live-head-my-tezos-only-v1'),
      chamberPressed: document.querySelector('#health-block-filter-menu [data-live-head-my-tezos-toggle]')?.getAttribute('aria-pressed') || '',
      setupPressed: document.querySelector('#live-head-my-tezos-setting')?.getAttribute('aria-pressed') || '',
      visibleRows: Array.from(document.querySelectorAll('#health-recent-block-list .health-block-row')).filter((row) => getComputedStyle(row).display !== 'none').length
    }));
    await page.keyboard.press('Escape');
    assert(myTezosMonitorOff.stored === '0'
        && myTezosMonitorOff.chamberPressed === 'false'
        && myTezosMonitorOff.setupPressed === 'false'
        && myTezosMonitorOff.visibleRows === 8,
      `network health chamber: My Tezos monitor did not return both block surfaces to the shared all-block state ${JSON.stringify(myTezosMonitorOff)}`);
    const chamberDepthToggle = page.locator('#health-block-depth-toggle');
    await chamberDepthToggle.scrollIntoViewIfNeeded();
    await page.evaluate(() => {
      window.__healthDepthFirstRow = document.querySelector('#health-recent-block-list .health-block-row');
      window.__healthDepthFirstLevel = window.__healthDepthFirstRow?.dataset.healthLevel || '';
      window.__healthDepthScroll = document.querySelector('#network-health-modal .health-content')?.scrollTop || 0;
    });
    await chamberDepthToggle.click();
    await page.waitForFunction(() => (
      Array.from(document.querySelectorAll('#health-recent-block-list .health-block-row'))
        .filter((row) => getComputedStyle(row).display !== 'none').length === 15
      && document.querySelectorAll('#live-head-stack .live-head-row[data-live-head-level]').length === 10
      && Array.from(document.querySelectorAll('#health-recent-block-list .health-block-row'))
        .every((row) => !row.querySelector('.live-head-gas-skeleton, .live-head-story.is-loading'))
    ), null, { timeout: 20000 });
    const chamberExpandedDepthState = await page.evaluate(() => {
      const toggle = document.getElementById('health-block-depth-toggle');
      const rows = Array.from(document.querySelectorAll('#health-recent-block-list .health-block-row'));
      return {
        total: rows.length,
        visible: rows.filter((row) => getComputedStyle(row).display !== 'none').length,
        retainedHead: window.__healthDepthFirstRow === document.querySelector(`#health-recent-block-list .health-block-row[data-health-level="${window.__healthDepthFirstLevel}"]`),
        expanded: toggle?.getAttribute('aria-expanded') || '',
        label: toggle?.getAttribute('aria-label') || '',
        count: toggle?.querySelector('[data-health-block-depth-count]')?.textContent?.trim() || '',
        receiptStatuses: document.querySelectorAll('#health-recent-block-list .health-block-receipts > :is(.live-head-gas, .live-head-quiet)').length,
        receiptStories: document.querySelectorAll('#health-recent-block-list .health-block-receipts .live-head-story-chip').length,
        arrowTransform: toggle?.querySelector('svg') ? getComputedStyle(toggle.querySelector('svg')).transform : '',
        focusStayed: document.activeElement === toggle,
        initialScroll: window.__healthDepthScroll,
        modalScroll: document.querySelector('#network-health-modal .health-content')?.scrollTop || 0,
        homeRows: document.querySelectorAll('#live-head-stack .live-head-row[data-live-head-level]').length,
        homeExpanded: document.getElementById('live-head-depth-toggle')?.dataset.depthMode || '',
        setupPressed: document.getElementById('live-head-depth-setting')?.dataset.depthMode || '',
        stored: JSON.parse(localStorage.getItem('tezos-systems-live-head-depth-v1') || 'null')
      };
    });
    assert(chamberExpandedDepthState.total === 15
        && chamberExpandedDepthState.visible === 15
        && chamberExpandedDepthState.retainedHead
        && chamberExpandedDepthState.expanded === 'true'
        && /Show 8 Passing Blocks/.test(chamberExpandedDepthState.label)
        && chamberExpandedDepthState.count === '15 blocks'
        && chamberExpandedDepthState.receiptStatuses === 15
        && chamberExpandedDepthState.receiptStories >= 1
        && chamberExpandedDepthState.arrowTransform !== 'none'
        && chamberExpandedDepthState.focusStayed
        && Math.abs(chamberExpandedDepthState.modalScroll - chamberExpandedDepthState.initialScroll) <= 1
        && chamberExpandedDepthState.homeRows === 10
        && chamberExpandedDepthState.homeExpanded === '10'
        && chamberExpandedDepthState.setupPressed === '10'
        && chamberExpandedDepthState.stored?.mode === '10',
      `network health chamber: Passing Blocks did not share the persistent expanded depth without replacing its rows ${JSON.stringify(chamberExpandedDepthState)}`);
    await chamberDepthToggle.click();
    await page.waitForFunction(() => (
      Array.from(document.querySelectorAll('#health-recent-block-list .health-block-row'))
        .filter((row) => getComputedStyle(row).display !== 'none').length === 8
      && document.querySelectorAll('#live-head-stack .live-head-row[data-live-head-level]').length === 4
    ));
    const chamberContractedDepthState = await page.evaluate(() => ({
      visible: Array.from(document.querySelectorAll('#health-recent-block-list .health-block-row'))
        .filter((row) => getComputedStyle(row).display !== 'none').length,
      expanded: document.getElementById('health-block-depth-toggle')?.getAttribute('aria-expanded') || '',
      label: document.getElementById('health-block-depth-toggle')?.getAttribute('aria-label') || '',
      count: document.querySelector('[data-health-block-depth-count]')?.textContent?.trim() || '',
      retainedHead: window.__healthDepthFirstRow === document.querySelector(`#health-recent-block-list .health-block-row[data-health-level="${window.__healthDepthFirstLevel}"]`),
      focusStayed: document.activeElement === document.getElementById('health-block-depth-toggle'),
      stored: JSON.parse(localStorage.getItem('tezos-systems-live-head-depth-v1') || 'null')
    }));
    assert(chamberContractedDepthState.visible === 8
        && chamberContractedDepthState.expanded === 'false'
        && /Show all 15 Passing Blocks/.test(chamberContractedDepthState.label)
        && chamberContractedDepthState.count === '8 blocks'
        && chamberContractedDepthState.retainedHead
        && chamberContractedDepthState.focusStayed
        && chamberContractedDepthState.stored?.mode === 'compact',
      `network health chamber: Passing Blocks did not contract cleanly ${JSON.stringify(chamberContractedDepthState)}`);
    assert(healthState.roundOne >= 1, 'network health chamber: round-one block badge missing');
    assert(healthState.attesterRows >= 2, `network health chamber: missed attester rows missing, saw ${healthState.attesterRows}`);
    assert(healthState.missedBlockRows >= 1, `network health chamber: missed block rows missing, saw ${healthState.missedBlockRows}`);
    assert(healthState.activityRows >= 1, `network health chamber: activity tape rows missing, saw ${healthState.activityRows}`);
    assert(/QA Baker|Second Baker|XTZ/.test(healthState.activityText), `network health chamber: activity tape content mismatch: ${healthState.activityText}`);
    assert(/Consensus Anomaly Memory/.test(healthState.incidentMemory) && /missed|round-/i.test(healthState.incidentMemory), `network health chamber: anomaly memory missing: ${healthState.incidentMemory}`);
    assert(/Cycle Progress & Timing/.test(healthState.cycleTiming) && /Last cycle/.test(healthState.cycleTiming) && /Target/.test(healthState.cycleTiming), `network health chamber: cycle timing panel missing: ${healthState.cycleTiming}`);
    assert(healthState.cycleTimingCells >= 4, `network health chamber: cycle timing strip too sparse: ${healthState.cycleTimingCells}`);
    assert(/Watch|slow|target/i.test(healthState.cycleTimingStatus), `network health chamber: cycle timing status missing drift context: ${healthState.cycleTimingStatus}`);
    assert(healthState.cycleProgress === '11.4%' && healthState.cycleNumber === 'C1,143', `network health chamber: current cycle progress mismatch: ${healthState.cycleNumber}/${healthState.cycleProgress}`);
    assert(Math.abs(Number(healthState.cycleProgressNow) - 11.43) < 0.01, `network health chamber: current cycle progressbar value mismatch: ${healthState.cycleProgressNow}`);
    assert(/11\.4% through cycle 1,143/.test(healthState.cycleProgressText), `network health chamber: current cycle progressbar accessible text missing: ${healthState.cycleProgressText}`);
    assert(healthState.cycleProgressFill === '11.43%', `network health chamber: current cycle progress rail width mismatch: ${healthState.cycleProgressFill}`);
    assert(
      healthState.cycleImmediatelyAfterContinuity && healthState.cycleAlignedBelowContinuity,
      `network health chamber: cycle progress should sit directly below Mainnet Continuity ${JSON.stringify({
        immediatelyAfter: healthState.cycleImmediatelyAfterContinuity,
        alignedBelow: healthState.cycleAlignedBelowContinuity
      })}`
    );
    assert(
      healthState.networkHealthProofFontSize >= 20 && healthState.networkHealthProofFontSize <= 32,
      `network health chamber: Mainnet Continuity counter should stay compact and legible: ${healthState.networkHealthProofFontSize}px`
    );
    assert(/Consensus Lens/.test(healthState.teztale) && /Teztale/.test(healthState.teztale) && /Nomadic Labs/.test(healthState.teztale), `network health chamber: Teztale consensus lens missing credit/context: ${healthState.teztale}`);
    assert(healthState.teztaleFullWidth, 'network health chamber: Teztale Consensus Lens should span the full dashboard width');
    assert(/66(?:⅔|\.7)%/.test(healthState.teztale), `network health chamber: Teztale quorum label must use the exact two-thirds threshold: ${healthState.teztale}`);
    assert(!/\b66% attestation quorum\b/i.test(healthState.teztale), `network health chamber: Teztale quorum must not be labeled as an inexact 66% threshold: ${healthState.teztale}`);
    assert(/Earliest Teztale observer reception/i.test(healthState.teztalePropagation) && /earliest reception/i.test(healthState.teztalePropagation), `network health chamber: Teztale propagation must disclose earliest-observer semantics: ${healthState.teztalePropagation}`);
    assert(/endorsing[- ]power weighted/i.test(healthState.teztalePropagation) && /500\s*ms/i.test(healthState.teztalePropagation), `network health chamber: Teztale propagation bin methodology missing: ${healthState.teztalePropagation}`);
    assert(/Validation observed/i.test(healthState.teztalePath) && /Validation → pre-quorum/i.test(healthState.teztalePath) && /Pre-quorum → quorum/i.test(healthState.teztalePath) && /Validation → quorum/i.test(healthState.teztalePath), `network health chamber: Teztale propagation path timing labels missing: ${healthState.teztalePath}`);
    for (const [label, value] of [
      ['pre-attestation 66⅔% average', healthState.teztalePre66Avg],
      ['pre-attestation 90% average', healthState.teztalePre90Avg],
      ['attestation 66⅔% average', healthState.teztaleAtt66Avg],
      ['attestation 90% average', healthState.teztaleAtt90Avg]
    ]) {
      assert(/s$/.test(value), `network health chamber: Teztale ${label} timing missing: ${value}`);
    }
    assert(healthState.teztaleHistogramBins >= 2, `network health chamber: Teztale reception histogram too sparse: ${healthState.teztaleHistogramBins}`);
    assert(/head #12,345,678 collecting/.test(healthState.teztale), `network health chamber: partial Teztale head context missing: ${healthState.teztale}`);
    assert(/s$/.test(healthState.teztaleQuorum), `network health chamber: Teztale quorum timing missing: ${healthState.teztaleQuorum}`);
    assert(healthState.teztaleSources === '3', `network health chamber: Teztale source count mismatch: ${healthState.teztaleSources}`);
    assert(/complete rounds/.test(healthState.teztaleOps) && /sampled levels/.test(healthState.teztaleOps) && /power/.test(healthState.teztaleOps), `network health chamber: Teztale coverage report missing: ${healthState.teztaleOps}`);
    assert(healthState.teztaleEvents >= 1, `network health chamber: Teztale report rows missing: ${healthState.teztaleEvents}`);
    assert(healthState.teztaleCreditHref.includes('nomadic-labs.gitlab.io/teztale-dataviz'), `network health chamber: Teztale dataviz link missing: ${healthState.teztaleCreditHref}`);
    assert(healthState.teztaleNomadicHref.includes('gitlab.com/nomadic-labs/teztale'), `network health chamber: Teztale source credit link missing: ${healthState.teztaleNomadicHref}`);
    assert(healthState.nakamotoImmediatelyBeforeTeztale, 'network health chamber: Nakamoto Coefficients should sit directly above the Teztale Consensus Lens');
    assert(healthState.nakamoto33 === '1' && healthState.nakamoto66 === '2', `network health chamber: live Nakamoto thresholds mismatch: ${healthState.nakamoto33}/${healthState.nakamoto66}`);
    assert(/live current-cycle snapshot/i.test(healthState.nakamotoText), `network health chamber: live Nakamoto provenance missing: ${healthState.nakamotoText}`);
    assert(/Halt \/ fault boundary/.test(healthState.nakamotoText) && /Unilateral quorum control/.test(healthState.nakamotoText), `network health chamber: Nakamoto threshold labels missing: ${healthState.nakamotoText}`);
    assert(/Chainspect/.test(healthState.nakamotoText) && /Edinburgh EDI/.test(healthState.nakamotoText) && /CoinClear/.test(healthState.nakamotoText), `network health chamber: external Nakamoto sources missing: ${healthState.nakamotoText}`);
    assert(/33% claimed/.test(healthState.nakamotoText) && /50%/.test(healthState.nakamotoText) && /threshold unstated/.test(healthState.nakamotoText), `network health chamber: external threshold context missing: ${healthState.nakamotoText}`);
    assert(/Current provider snapshot/.test(healthState.nakamotoText) && /30-day block-production window/.test(healthState.nakamotoText), `network health chamber: external method windows missing: ${healthState.nakamotoText}`);
    assert(healthState.nakamotoSourceRows >= 3, `network health chamber: external Nakamoto source rows missing: ${healthState.nakamotoSourceRows}`);
    assert(healthState.nakamotoChainspectHref.includes('chainspect.app/dashboard/decentralization'), `network health chamber: Chainspect source link missing: ${healthState.nakamotoChainspectHref}`);
    assert(healthState.nakamotoEdiHref.includes('blockchainlab.inf.ed.ac.uk/edi-dashboard'), `network health chamber: EDI source link missing: ${healthState.nakamotoEdiHref}`);
    assert(/Explain the Nakamoto Coefficient/.test(healthState.nakamotoHelpLabel), `network health chamber: Nakamoto info control label missing: ${healthState.nakamotoHelpLabel}`);
    assert(healthState.nakamotoPrintButton && /print.*Nakamoto/i.test(healthState.nakamotoPrintLabel), `network health chamber: Nakamoto print control missing or unlabeled: ${healthState.nakamotoPrintLabel}`);
    assert(healthState.nakamotoShareButton && /(?:share|tweet|create).*Nakamoto/i.test(healthState.nakamotoShareLabel), `network health chamber: Nakamoto share control missing or unlabeled: ${healthState.nakamotoShareLabel}`);
    assert(/Octez Versions/.test(healthState.octezVersions) && /TzKT delegates/.test(healthState.octezVersions), `network health chamber: Octez versions panel missing source context: ${healthState.octezVersions}`);
    assert(healthState.octezCurrent === 'v25.1', `network health chamber: latest observed Octez version mismatch: ${healthState.octezCurrent}`);
    assert(/20\.8%/.test(healthState.octezLatestPower), `network health chamber: latest Octez power share mismatch: ${healthState.octezLatestPower}`);
    assert(healthState.octezKnown === '3 / 3', `network health chamber: known Octez baker count mismatch: ${healthState.octezKnown}`);
    assert(healthState.octezRows >= 3, `network health chamber: Octez version distribution missing rows: ${healthState.octezRows}`);
    assert(healthState.octezLaggers >= 2 && /Second Baker/.test(healthState.octezVersions) && /v24\.4/.test(healthState.octezVersions), `network health chamber: Octez lagging baker list incomplete: ${healthState.octezVersions}`);
    assert(/ago|just now/.test(healthState.octezUpdatedAge), `network health chamber: Octez freshness age missing: ${healthState.octezUpdatedAge}`);
    assert(healthState.octezVersions.includes('Latest version change')
      && healthState.octezUpdatedAt === sampleBakers[2].softwareUpdateTime,
    `network health chamber: version-change clock must use the baker's first block on its current version: ${healthState.octezUpdatedAt}`);
    assert(/Period Telemetry/.test(healthState.periodTelemetry) && /24H/.test(healthState.periodTelemetry) && /31D/.test(healthState.periodTelemetry), `network health chamber: period telemetry missing: ${healthState.periodTelemetry}`);
    assert(/Network Load/.test(healthState.networkLoad) && /Large tx rows/.test(healthState.networkLoad), `network health chamber: network load panel missing: ${healthState.networkLoad}`);
    assert(/Second Baker/.test(healthState.myBaker), `network health chamber: My Tezos baker panel missing baker identity: ${healthState.myBaker}`);
    assert(/Missed block/.test(healthState.myBakerStatus), `network health chamber: My Tezos baker status mismatch: ${healthState.myBakerStatus}`);
    assert(healthState.myBakerMetrics[0] === '7', `network health chamber: My Tezos attestation misses mismatch: ${healthState.myBakerMetrics.join(', ')}`);
    assert(healthState.myBakerMetrics[1] === '1', `network health chamber: My Tezos block misses mismatch: ${healthState.myBakerMetrics.join(', ')}`);
    assert(!/Not in sample/.test(healthState.myBakerMetrics[2] || ''), `network health chamber: My Tezos latest block missing: ${healthState.myBakerMetrics.join(', ')}`);
    assert(healthState.topProofInHeader && healthState.topProofHistoryInHeader, 'network health chamber: continuity stats and mainnet-age counter should live in the top header');
    assert(healthState.topProofTag === 'DIV' && healthState.topProofHistoryTag === 'BUTTON' && healthState.topProofHistoryType === 'button', `network health chamber: continuity surface should use a stat container with a button uptime launcher, saw ${healthState.topProofTag}/${healthState.topProofHistoryTag}/${healthState.topProofHistoryType}`);
    assert(
      healthState.topProofHistoryWired === '1'
        && (healthState.topProofHistoryMilestoneRoute
          ? healthState.topProofHistoryAriaControls === 'top-continuity-milestone-popover'
          : healthState.topProofHistoryAriaControls === 'protocol-history-chamber-modal'),
      `network health chamber: uptime launcher semantics do not match its active destination ${healthState.topProofHistoryAriaControls}/${healthState.topProofHistoryMilestoneRoute}/${healthState.topProofHistoryWired}`
    );
    assert(
      healthState.topProofMilestoneOrbitCount === 0
        && healthState.topProofMilestoneOutlineInsideClock
        && healthState.topProofMilestoneCloseExists
        && healthState.topProofMilestonePopoverAfterHistory
        && (
          healthState.topProofMilestonePopoverHidden
            ? healthState.topProofMilestonePopoverDisplay === 'none'
              && healthState.topProofMilestoneOutlineHidden
              && healthState.topProofMilestoneOutlineDisplay === 'none'
            : healthState.topProofMilestonePopoverDisplay !== 'none'
              && healthState.topProofMilestoneClaim === 'Zero outages'
              && !healthState.topProofMilestoneOutlineHidden
              && healthState.topProofMilestoneOutlineDisplay !== 'none'
              && (
                (healthState.topProofMilestoneNewText === 'New'
                  && healthState.topProofMilestoneOutlineBorderStyle === 'solid')
                || (healthState.topProofMilestoneNewText === 'Soon'
                  && healthState.topProofMilestoneOutlineBorderStyle === 'dashed')
              )
              && healthState.topProofMilestoneOutlineBoxShadow === 'none'
              && Boolean(healthState.topProofMilestoneLinkHref)
              && healthState.topProofMilestonePopoverAriaHidden === 'true'
              && !healthState.topProofMilestoneDisclosed
              && healthState.topProofMilestonePopoverPosition === 'absolute'
              && healthState.topProofMilestonePopoverVisibility === 'hidden'
              && healthState.topProofMilestonePopoverOpacity <= 0.01
        ),
      `network health chamber: milestone clean outline must stay on the uptime clock and its dormant disclosure must reserve no reading-state space ${JSON.stringify({
        orbitCount: healthState.topProofMilestoneOrbitCount,
        claim: healthState.topProofMilestoneClaim,
        outlineInsideClock: healthState.topProofMilestoneOutlineInsideClock,
        outlineHidden: healthState.topProofMilestoneOutlineHidden,
        outlineDisplay: healthState.topProofMilestoneOutlineDisplay,
        outlineBorderStyle: healthState.topProofMilestoneOutlineBorderStyle,
        outlineBoxShadow: healthState.topProofMilestoneOutlineBoxShadow,
        marker: healthState.topProofMilestoneNewText,
        closeExists: healthState.topProofMilestoneCloseExists,
        linkHref: healthState.topProofMilestoneLinkHref,
        popoverAfter: healthState.topProofMilestonePopoverAfterHistory,
        popoverHidden: healthState.topProofMilestonePopoverHidden,
        popoverDisplay: healthState.topProofMilestonePopoverDisplay,
        popoverPosition: healthState.topProofMilestonePopoverPosition,
        popoverVisibility: healthState.topProofMilestonePopoverVisibility,
        popoverOpacity: healthState.topProofMilestonePopoverOpacity,
        popoverAriaHidden: healthState.topProofMilestonePopoverAriaHidden,
        disclosed: healthState.topProofMilestoneDisclosed
      })}`
    );
    assert(['total-bakers', 'finality', 'staking-ratio', 'issuance-rate'].every((key) => healthState.topProofPillCards.includes(key)) && healthState.topProofPillsWired, `network health chamber: continuity proof all-time pills missing or unwired: ${healthState.topProofPillCards.join(',')}/${healthState.topProofPillsWired}`);
    assert(/[\d,]+ days/.test(healthState.topProofHistoryText) && /Zero outages/.test(healthState.topProofHistoryText), `network health chamber: header should show completed mainnet days and its outage caption: ${healthState.topProofHistoryText}`);
    assert(healthState.topProofPairUnderTitle && healthState.topProofPairLeftAligned, `network health chamber: milestone/year pair should sit directly under Tezos Systems title: ${JSON.stringify({ under: healthState.topProofPairUnderTitle, aligned: healthState.topProofPairLeftAligned })}`);
    assert(healthState.topProofRuntimeVisualFontSize >= 18, `network health chamber: uptime numerals should remain legible without a detached event control: ${healthState.topProofRuntimeVisualFontSize}`);
    assert(healthState.topProofBadgeHeight > 0 && healthState.topProofPillHeight > 0 && healthState.topProofBadgeHeight <= healthState.topProofPillHeight * 1.5, `network health chamber: larger uptime proof should stay compact beside the right metric pills: ${healthState.topProofBadgeHeight}/${healthState.topProofPillHeight}`);
    assert(healthState.topProofBadgeRadius > 0 && healthState.topProofBadgeRadius < healthState.topProofPillRadius, `network health chamber: uptime badge should be squarer than right pills: ${healthState.topProofBadgeRadius}/${healthState.topProofPillRadius}`);
    assert(!/\|/.test(healthState.topProofHistoryText), `network health chamber: top uptime badge should not add a pipe: ${healthState.topProofHistoryText}`);
    assert(/^[\d,]+ days$/.test(healthState.topProofCounter), `network health chamber: top proof runtime should show total completed days: ${healthState.topProofCounter}`);
    assert(/^\d+$/.test(healthState.topProofBakers) && Number(healthState.topProofBakers) >= 1, `network health chamber: top proof baker count mismatch: ${healthState.topProofBakers}`);
    assert(/\d+s/.test(healthState.topProofFinality), `network health chamber: top proof finality missing: ${healthState.topProofFinality}`);
    assert(/^\d+(?:\.\d+)?%$/.test(healthState.topProofStaked), `network health chamber: top proof staked ratio mismatch: ${healthState.topProofStaked}`);
    assert(/^\d+(?:\.\d+)?%$/.test(healthState.topProofIssuance), `network health chamber: top proof issuance mismatch: ${healthState.topProofIssuance}`);
    assert(healthState.headerActivityInLiveHead && healthState.headerActivityBeforeFilter && healthState.headerActivityAlignedWithFilter, `network health chamber: trailing-hour activity should sit directly before the Live Head setup control ${JSON.stringify({ inLiveHead: healthState.headerActivityInLiveHead, beforeFilter: healthState.headerActivityBeforeFilter, aligned: healthState.headerActivityAlignedWithFilter })}`);
    assert(healthState.headerActivityTag === 'BUTTON' && healthState.headerActivityType === 'button' && healthState.headerActivityWired === '1', `network health chamber: trailing-hour activity launcher semantics missing: ${healthState.headerActivityTag}/${healthState.headerActivityType}/${healthState.headerActivityWired}`);
    assert(healthState.headerActivityBusy === 'false' && !healthState.headerActivityLoading, `network health chamber: trailing-hour activity did not leave its first-paint loading state ${JSON.stringify({ busy: healthState.headerActivityBusy, loading: healthState.headerActivityLoading })}`);
    assert(healthState.headerActivityFullyVisible, `network health chamber: trailing-hour activity is clipped in its Live Head control rail`);
    assert(/1H Activity/.test(healthState.headerActivityText) && /\bTX\b/.test(healthState.headerActivityText) && /Moved/.test(healthState.headerActivityText) && /NFT/.test(healthState.headerActivityText), `network health chamber: trailing-hour label, TX, moved, and NFT text missing: ${healthState.headerActivityText}`);
    assert(['TX', 'Moved', 'NFT'].every((label) => healthState.headerActivityLabels.includes(label)), `network health chamber: trailing-hour activity labels are hidden: ${healthState.headerActivityLabels.join(', ')}`);
    assert(healthState.liveHeadFilterMenuHidden && healthState.liveHeadFilterAllPressed === 'true' && healthState.liveHeadFilterSelectedCount === 16 && healthState.liveHeadFilterStoredCount === 16 && healthState.liveHeadFilterWired === '1', `network health chamber: v2 all-on activity setup did not migrate to every v3 normal receipt type ${JSON.stringify({ hidden: healthState.liveHeadFilterMenuHidden, all: healthState.liveHeadFilterAllPressed, selected: healthState.liveHeadFilterSelectedCount, stored: healthState.liveHeadFilterStoredCount, wired: healthState.liveHeadFilterWired })}`);
    assert(healthState.liveHeadConnectors.every((connector) => connector.width >= 10 && connector.pointsIntoStory && !connector.aliasClipped), `network health chamber: baker-to-receipt connectors are missing, reversed, or clipping an alias ${JSON.stringify(healthState.liveHeadConnectors)}`);
    assert(healthState.systemLinks >= healthState.attesterRows, `network health chamber: baker profile links missing, saw ${healthState.systemLinks}`);
    assert(healthState.tzktLinks >= healthState.attesterRows, `network health chamber: TzKT links missing, saw ${healthState.tzktLinks}`);
    assert(/Direct: \/health\//.test(healthState.footer), `network health chamber: direct footer missing: ${healthState.footer}`);
    assert(healthState.updatedAgeMs >= 85000, `network health chamber: Updated age should come from stale head block timestamp, saw ${healthState.updatedAge} (${healthState.updatedAgeMs}ms)`);
    assert(!/^(0s ago|just now)$/.test(healthState.updatedAge), `network health chamber: Updated age should not be fetch-time fresh: ${healthState.updatedAge}`);
    assert(healthState.headMeta.includes(healthState.updatedAge), `network health chamber: header head age should match Updated metric: ${healthState.headMeta} vs ${healthState.updatedAge}`);
    assert(healthState.cardWide, 'network health chamber: entry card should be double-width');
    assert(/Live Tape/.test(healthState.cardTape) && /XTZ/.test(healthState.cardTape), `network health chamber: entry live tape missing: ${healthState.cardTape}`);
    assert(!healthState.cardHasProofStrip, 'network health chamber: entry card should stay a clean health overview, not carry the continuity proof');
    assert(healthState.ageLabelCount >= 3, `network health chamber: age labels should be live-tickable, saw ${healthState.ageLabelCount}`);
    assert(healthState.cardWired === '1', `network health chamber: card wiring missing: ${healthState.cardWired}`);
    assert(healthState.cardRole === 'article', `network health chamber: card role mismatch: ${healthState.cardRole}`);
    assert(healthState.cardTabIndex === '', `network health chamber: article should not be keyboard focusable: ${healthState.cardTabIndex}`);
    assert(healthState.cardCue && healthState.cardCueTag === 'BUTTON' && /Open Network Health Chamber/.test(healthState.cardCueLabel), 'network health chamber: explicit Open button missing');
    assert(healthState.cardCopyHash === '#health', `network health chamber: card direct link mismatch: ${healthState.cardCopyHash}`);
    assert(/^TzKT head · (?:\d+[sm] ago|just now|\d{2}:\d{2} UTC)$/.test(healthState.cardUpdatedLabel), `network health chamber: freshness stamp mismatch: ${healthState.cardUpdatedLabel}`);
    assert(healthState.cardFreshnessState === 'stale' && healthState.cardStale, `network health chamber: stale head time should drive the card watch state: ${healthState.cardFreshnessState}/${healthState.cardStale}`);
    assert(healthState.cardFreshnessStaleAfter === '12000', `network health chamber: freshness threshold should track 2x live refresh interval, saw ${healthState.cardFreshnessStaleAfter}`);
    assert(healthState.cardFreshnessAgeMs >= 85000, `network health chamber: freshness timestamp should come from the observed head, saw ${healthState.cardFreshnessAgeMs}ms`);
    assert(healthState.liveHeadOwnIsland, 'network health chamber: Live Head should be its own top-level landing-page card');
	  assert(healthState.pulseTickerOwnIsland && healthState.pulseTickerAfterHeader && healthState.pulseTickerBeforeBlock, 'network health chamber: Live Pulse should stay between the header area and Live Head');
    assert(healthState.liveHeadBeforeMainContent && healthState.liveHeadAboveChambers && healthState.liveHeadClearOfMainContent, 'network health chamber: Live Head should stay above and clear of the Chambers/main area');
    assert(healthState.liveHeadHeight <= 420 && healthState.liveHeadRows === 4, `network health chamber: desktop Live Head height or row count drifted ${healthState.liveHeadHeight}/${healthState.liveHeadRows}`);
    assert(healthState.liveHeadChainState === 'stalled'
        && healthState.liveHeadStateText === 'Stalled'
	  && healthState.liveHeadStateDisplay === 'none'
        && !healthState.liveHeadAlertHidden
        && healthState.liveHeadAlertTag === 'DIV'
        && healthState.liveHeadAlertLabel === 'CHAIN STALLED'
        && /^Last confirmed block #[\d,]+$/.test(healthState.liveHeadAlertDetail)
        && /^for 1 minute \d+ seconds?$/.test(healthState.liveHeadAlertDuration), `network health chamber: confirmed stale head did not replace the normal hierarchy with an explicit chain-stall alert ${JSON.stringify(healthState)}`);
    assert(healthState.liveHeadAlertFontSize >= 40
        && /rgb\(244, 124, 135\)/.test(healthState.liveHeadAlertBorderColor)
        && /linear-gradient/.test(healthState.liveHeadAlertBackground), `network health chamber: chain-stall typography/color severity is not unmistakable ${JSON.stringify({ fontSize: healthState.liveHeadAlertFontSize, border: healthState.liveHeadAlertBorderColor, background: healthState.liveHeadAlertBackground })}`);
    assert(healthState.liveHeadTopRuleDisplay === 'none', `network health chamber: decorative top rule returned ${healthState.liveHeadTopRuleDisplay}`);
    assert(healthState.liveHeadRowHeights.every((height) => Math.abs(height - 60) <= 1), `network health chamber: separator removal did not become useful row spacing ${healthState.liveHeadRowHeights.join(',')}`);
    assert(new Set(healthState.liveHeadKeys).size === 4 && healthState.liveHeadKeys.every((key) => /^live-head-block-\d+$/.test(key)), `network health chamber: Live Head rows need stable level keys: ${healthState.liveHeadKeys.join(',')}`);
    assert(healthState.liveHeadLevels.every((level) => /^#[\d,]+$/.test(level)), `network health chamber: Live Head levels are malformed: ${healthState.liveHeadLevels.join(',')}`);
    assert(healthState.liveHeadRounds.every((round) => /^R\d+$/.test(round)), `network health chamber: Live Head round badges are malformed: ${healthState.liveHeadRounds.join(',')}`);
    assert(healthState.liveHeadDeltas.every((delta) => /^\d+(?:\.\d)?s$/.test(delta)), `network health chamber: Live Head deltas are malformed: ${healthState.liveHeadDeltas.join(',')}`);
    assert(healthState.liveHeadPowers.every((power) => /^\d[\d,]*\/\d[\d,]*$/.test(power)), `network health chamber: Live Head attested fractions are malformed: ${healthState.liveHeadPowers.join(',')}`);
    assert(healthState.liveHeadConsensusStates.includes('strong') && healthState.liveHeadMarginRails.every((rail) => rail.adjacent && rail.noMarker && rail.noStandaloneMissed && rail.order && rail.infoBeforeAge && rail.infoAgeGap >= 0 && rail.infoAgeGap <= 5 && rail.infoSize <= 16 && /^Inspect block /.test(rail.infoLabel) && rail.margin === rail.power - 4667 && /^(?:0|−(?:\d[\d,]*|\d+(?:\.\d)?K))$/.test(rail.text) && rail.missingFull === (rail.power === 7000 ? '0' : `−${(7000 - rail.power).toLocaleString('en-US')}`) && /rail shows only the safety margin/i.test(rail.title) && /number shows missing attestation power/i.test(rail.title)), `network health chamber: compact quorum rail/missing-power label/info control or top-line order drifted ${JSON.stringify(healthState.liveHeadMarginRails)}`);
    assert(healthState.liveHeadQuietRows.length >= 1 && healthState.liveHeadQuietRows.every((row) => row.text === 'Quiet' && row.topLine && !row.bottomQuiet), `network health chamber: Quiet did not stay on the top line ${JSON.stringify({ quiet: healthState.liveHeadQuietRows, stories: healthState.liveHeadStories, gas: healthState.liveHeadGasRows })}`);
    const resolvedLiveHeadGasRows = healthState.liveHeadGasRows.filter((row) => row.state === 'resolved');
    assert(resolvedLiveHeadGasRows.length >= 2 && healthState.liveHeadGasRows.filter((row) => row.state === 'loading').length <= 1 && resolvedLiveHeadGasRows.every((row) => Number.isFinite(row.percent) && /^Gas (?:<1|\d+)%$/.test(row.text) && /of 1,040,000 gas used/.test(row.title) && row.topLine && !row.hasQuiet), `network health chamber: non-quiet rows did not replace Quiet with exact gas-fullness pills ${JSON.stringify(healthState.liveHeadGasRows)}`);
    assert(new Set(resolvedLiveHeadGasRows.map((row) => row.className.match(/is-(open|active|busy|hot)/)?.[1]).filter(Boolean)).size >= 2, `network health chamber: gas fullness does not expose useful severity ranges ${JSON.stringify(healthState.liveHeadGasRows)}`);
    assert(/Wallets.*\.tez names.*bakers.*KT1 contracts.*operations.*blocks.*protocols.*Chambers.*press \/ anywhere/i.test(healthState.liveHeadSearchHelp), `network health chamber: search usage help is missing or incomplete ${healthState.liveHeadSearchHelp}`);
    assert(healthState.liveHeadTypeAndAlignment.helpVisible && healthState.liveHeadTypeAndAlignment.inputLevelDelta <= 1.5 && healthState.liveHeadTypeAndAlignment.helpBakerDelta <= 1.5 && healthState.liveHeadTypeAndAlignment.inputFont === healthState.liveHeadTypeAndAlignment.helpFont && /JetBrains Mono/.test(healthState.liveHeadTypeAndAlignment.bakerFont), `network health chamber: search UI role, baker data role, or shared left alignment drifted ${JSON.stringify(healthState.liveHeadTypeAndAlignment)}`);
    assert(healthState.liveHeadBarSignatures.every((signature) => /^\d+:-?\d+:\d+$/.test(signature)), `network health chamber: Live Head health bars need level/safety-margin/quorum signatures: ${healthState.liveHeadBarSignatures.join(',')}`);
    assert(healthState.liveHeadBarAnimations.every((name) => name === 'none'), `network health chamber: initial Live Head rails must paint without a refill animation: ${healthState.liveHeadBarAnimations.join(',')}`);
    assert(healthState.liveHeadAges.every((age) => /^(?:\d{2}[smhd]|--)$/.test(age)), `network health chamber: Live Head ages are malformed: ${healthState.liveHeadAges.join(',')}`);
    assert(healthState.liveHeadRowBakers.every(Boolean), `network health chamber: Live Head baker aliases are missing: ${healthState.liveHeadRowBakers.join(',')}`);
    assert(healthState.liveHeadRowBorderBottoms.every((width) => width === '0px'), `network health chamber: block separator lines returned ${healthState.liveHeadRowBorderBottoms.join(',')}`);
    const settledLiveHeadStories = healthState.liveHeadStories.filter(Boolean);
    assert(settledLiveHeadStories.length >= healthState.liveHeadStories.length - 1 && settledLiveHeadStories.every((story) => !/Oracle|\b0\b|syncing/i.test(story)), `network health chamber: settled human block stories are incomplete or invented: ${healthState.liveHeadStories.join(' | ')}`);
    assert(healthState.liveHeadStoryChipCount >= 4, `network health chamber: Live Head story density drifted ${healthState.liveHeadStoryChipCount}/${healthState.liveHeadStoryMax}`);
    const liveHeadRequiredMissRows = healthState.liveHeadMissRows.filter((row) => row.power < 6969 || row.quiet);
    assert(liveHeadRequiredMissRows.length >= 1 && liveHeadRequiredMissRows.every((row) => row.required === 'true' && ['resolved', 'clear'].includes(row.state)), `network health chamber: low-power or quiet blocks did not resolve their own missed-attester receipts ${JSON.stringify(healthState.liveHeadMissRows)}`);
    assert(liveHeadPillFitProbe?.wide.all >= 6 && liveHeadPillFitProbe.wide.visible === liveHeadPillFitProbe.wide.all && liveHeadPillFitProbe.wide.hidden === 0 && !liveHeadPillFitProbe.wide.overflowVisible, `network health chamber: wide rows collapsed baker pills despite available space ${JSON.stringify(liveHeadPillFitProbe?.wide)}`);
    assert(liveHeadPillFitProbe?.all >= 6 && liveHeadPillFitProbe.visible >= 1 && liveHeadPillFitProbe.visible < liveHeadPillFitProbe.all && liveHeadPillFitProbe.hidden === liveHeadPillFitProbe.all - liveHeadPillFitProbe.visible && /^\+\d+ bakers?$/.test(liveHeadPillFitProbe.summary), `network health chamber: narrow rows did not collapse only the identities that genuinely overflow ${JSON.stringify(liveHeadPillFitProbe)}`);
    assert(liveHeadRequiredMissRows.some((row) => /second\.tez/.test(row.text) && /tz4Miss\.\.\.ssMis/.test(row.text)), `network health chamber: per-block missed-attester pills do not prefer aliases and truncate tz1-tz4 addresses ${JSON.stringify(liveHeadRequiredMissRows)}`);
    assert(liveHeadRequiredMissRows.some((row) => /tz4MissMissMissMissMissMissMissMis/.test(row.titles)), `network health chamber: truncated missed-attester pills lost their full-address receipt ${JSON.stringify(liveHeadRequiredMissRows)}`);
    assert(liveHeadRequiredMissRows.filter((row) => row.state === 'resolved').flatMap((row) => row.styles).every((style) => style.overflow === 'hidden' && style.textOverflow === 'ellipsis' && style.whiteSpace === 'nowrap' && style.maxWidth !== 'none' && style.borderColor === 'rgba(0, 0, 0, 0)'), `network health chamber: indexed missed-attester pills must stay borderless and truncated ${JSON.stringify(liveHeadRequiredMissRows)}`);
	  assert(new Set(healthState.liveHeadStoryTones).size >= 2, `network health chamber: activity categories are not color coded ${healthState.liveHeadStoryTones.join(',')}`);
	  const artReceipt = healthState.liveHeadStoryReceipts.find((pill) => pill.kind === 'art');
	  const transferReceipt = healthState.liveHeadStoryReceipts.find((pill) => pill.kind === 'transfers' && pill.compact === 'Transfers · 2');
	  const stakeReceipt = healthState.liveHeadStoryReceipts.find((pill) => pill.kind === 'stake');
	  const l1VoteReceipt = healthState.liveHeadStoryReceipts.find((pill) => pill.kind === 'l1-vote');
	  const l2VoteReceipt = healthState.liveHeadStoryReceipts.find((pill) => pill.kind === 'l2-vote');
	  const evidenceReceipt = healthState.liveHeadStoryReceipts.find((pill) => pill.kind === 'evidence');
	  const milestoneReceipt = healthState.liveHeadStoryReceipts.find((pill) => pill.kind === 'milestone');
	  const bakerReceipt = healthState.liveHeadStoryReceipts.find((pill) => pill.kind === 'baker');
	  const etherlinkReceipt = healthState.liveHeadStoryReceipts.find((pill) => pill.kind === 'etherlink');
	  const dalReceipt = healthState.liveHeadStoryReceipts.find((pill) => pill.kind === 'dal');
	  const domainsReceipt = healthState.liveHeadStoryReceipts.find((pill) => pill.kind === 'domains');
	  const delegateReceipt = healthState.liveHeadStoryReceipts.find((pill) => pill.kind === 'delegate');
	  const tokensReceipt = healthState.liveHeadStoryReceipts.find((pill) => pill.kind === 'tokens');
	  const contractReceipt = healthState.liveHeadStoryReceipts.find((pill) => pill.kind === 'contract');
	  const callsReceipt = healthState.liveHeadStoryReceipts.find((pill) => pill.kind === 'calls');
	  assert(l1VoteReceipt?.compact === 'L1: Vote · 2', `network health chamber: L1 ballot/proposal receipt missing ${JSON.stringify(l1VoteReceipt)}`);
	  assert(l2VoteReceipt?.compact === 'L2: Vote · 1', `network health chamber: current Etherlink governance receipt missing ${JSON.stringify(l2VoteReceipt)}`);
	  assert(l1VoteReceipt?.color === l2VoteReceipt?.color
	      && l1VoteReceipt?.backgroundColor === l2VoteReceipt?.backgroundColor
	      && l1VoteReceipt?.fontWeight >= 800
	      && l2VoteReceipt?.fontWeight >= 800,
	  `network health chamber: voting receipts should share one bold treatment ${JSON.stringify({ l1VoteReceipt, l2VoteReceipt })}`);
	  assert(artReceipt?.compact === 'Art · 2'
	      && artReceipt.details.some((detail) => /Smoke Piece One.*Smoke Piece Two/.test(detail)), `network health chamber: Art receipt lacks progressive artwork names ${JSON.stringify(artReceipt)}`);
	  assert(transferReceipt?.compact === 'Transfers · 2'
	      && transferReceipt.details[0]?.includes('2,542 ꜩ total')
	      && transferReceipt.details[1]?.includes('QA Baker → Second Baker'), `network health chamber: transfer receipt lacks amount/direction tiers ${JSON.stringify(transferReceipt)}`);
	  assert(stakeReceipt?.compact === 'Stake · 1'
	      && stakeReceipt.details[0]?.includes('125 ꜩ'), `network health chamber: staking receipt lacks its amount tier ${JSON.stringify(stakeReceipt)}`);
	  assert(evidenceReceipt?.compact === 'Evidence · Double bake' && evidenceReceipt.mandatory,
	    `network health chamber: exceptional evidence receipt is missing or filterable ${JSON.stringify(evidenceReceipt)}`);
	  assert(milestoneReceipt?.compact === 'Voting · proposal' && milestoneReceipt.mandatory,
	    `network health chamber: voting-period milestone receipt is missing or filterable ${JSON.stringify(milestoneReceipt)}`);
	  assert(bakerReceipt?.compact === 'Baker · companion key' && bakerReceipt.mandatory,
	    `network health chamber: baker key-change receipt is missing or filterable ${JSON.stringify(bakerReceipt)}`);
	  assert(etherlinkReceipt?.compact === 'TEZOS X · 1' && etherlinkReceipt.details.at(-1)?.includes('publish'),
	    `network health chamber: exact Etherlink rollup lifecycle receipt is missing ${JSON.stringify(etherlinkReceipt)}`);
	  assert(dalReceipt?.compact === 'DAL · 1' && dalReceipt.details.at(-1)?.includes('slot 8'),
	    `network health chamber: DAL publication receipt is missing its slot ${JSON.stringify(dalReceipt)}`);
	  assert(domainsReceipt?.compact === 'Domains · 1', `network health chamber: reviewed Tezos Domains call is not classified ${JSON.stringify(domainsReceipt)}`);
	  assert(delegateReceipt?.compact === 'Delegate · 1' && delegateReceipt.details.at(-1)?.includes('new'),
	    `network health chamber: delegation receipt is missing semantics ${JSON.stringify(delegateReceipt)}`);
	  assert(tokensReceipt?.compact === 'Tokens · 1' && tokensReceipt.details.at(-1)?.includes('USDt'),
	    `network health chamber: generic FA token movement is missing or double-counted as art ${JSON.stringify(tokensReceipt)}`);
	  assert(contractReceipt?.compact === 'Contract · 1', `network health chamber: origination receipt is missing ${JSON.stringify(contractReceipt)}`);
	  assert(callsReceipt?.compact === 'Calls · 1' && callsReceipt.details.at(-1)?.includes('transfer'),
	    `network health chamber: uncatalogued zero-tez contract call fell through to Quiet ${JSON.stringify(callsReceipt)}`);
	  assert(!healthState.liveHeadHasGlobalMissLine, 'network health chamber: missed-attester detail must belong to each block, not a global bottom sentence');
    assert(/Next R0 · Second Baker/.test(healthState.liveHeadNext), `network health chamber: exact next R0 right missing: ${healthState.liveHeadNext}`);
    assert(/(?:in \d{2}s|due now|R0 due \d{2}s ago)/.test(healthState.liveHeadNextDue), `network health chamber: next R0 countdown missing: ${healthState.liveHeadNextDue}`);
    assert(healthState.liveHeadAriaLive === 'off' && healthState.liveHeadAnnouncerLive === 'polite', `network health chamber: per-second labels must stay out of the live region: ${healthState.liveHeadAriaLive}/${healthState.liveHeadAnnouncerLive}`);
    assert(healthState.liveHeadFeedState === 'live' && healthState.liveHeadWired === '1' && healthState.liveHeadSignature.split(':').length >= 5, `network health chamber: Live Head trust/wiring signature incomplete: ${healthState.liveHeadFeedState}/${healthState.liveHeadWired}/${healthState.liveHeadSignature}`);
    assert(healthState.liveHeadWellInside && healthState.liveHeadPanelPosition === 'absolute', `network health chamber: search well/results escaped Live Head geometry: ${healthState.liveHeadWellInside}/${healthState.liveHeadPanelPosition}`);
    assert(healthState.liveHeadWellIntegrated
        && healthState.liveHeadWellIntegrated.leftGap <= 2
        && healthState.liveHeadWellIntegrated.rightGap <= 2
        && healthState.liveHeadWellIntegrated.bottomGap <= 2
        && healthState.liveHeadWellIntegrated.borderTop === '1px'
        && healthState.liveHeadWellIntegrated.borderRight === '0px'
        && healthState.liveHeadWellIntegrated.borderBottom === '0px'
        && healthState.liveHeadWellIntegrated.borderLeft === '0px', `network health chamber: search well is not the card's integrated bottom edge ${JSON.stringify(healthState.liveHeadWellIntegrated)}`);
    assert(/mainnet continuity/i.test(healthState.networkHealthProofText) && /chain-age measure/i.test(healthState.networkHealthProofText) && /not an availability percentage/i.test(healthState.networkHealthProofText), `network health chamber: continuity panel must distinguish chain age from availability: ${healthState.networkHealthProofText}`);
    assert(/\d+y\s+\d+d\s+\d{2}h\s+\d{2}m\s+\d{2}s/.test(healthState.networkHealthProofCounter), `network health chamber: uptime counter missing fixed-width runtime: ${healthState.networkHealthProofCounter}`);
    assert(/^\d+$/.test(healthState.networkHealthProofBakers) && Number(healthState.networkHealthProofBakers) >= 1, `network health chamber: health proof baker count mismatch: ${healthState.networkHealthProofBakers}`);
    assert(/\d+s/.test(healthState.networkHealthProofFinality), `network health chamber: health proof finality missing: ${healthState.networkHealthProofFinality}`);
    assert(/^\d+(?:\.\d+)?%$/.test(healthState.networkHealthProofStaked), `network health chamber: health proof staked ratio mismatch: ${healthState.networkHealthProofStaked}`);
    assert(/^\d+(?:\.\d+)?%$/.test(healthState.networkHealthProofIssuance), `network health chamber: health proof issuance mismatch: ${healthState.networkHealthProofIssuance}`);
    assert(healthState.topPriceBarCycleChipTag === 'A' && healthState.topPriceBarCycleChipHref === '#health', `network health chamber: cycle chip should be a #health launcher, saw ${healthState.topPriceBarCycleChipTag}/${healthState.topPriceBarCycleChipHref}`);
    assert(healthState.topPriceBarCycleChipWired === '1', `network health chamber: cycle chip click wiring missing: ${healthState.topPriceBarCycleChipWired}`);
    assert(!healthState.topPriceBarHasBlockReadout && !healthState.topPriceBarHasBlockAge && !healthState.topPriceBarHasPulseDot, `network health chamber: top price bar should not carry block/age/pulse readouts: ${healthState.topPriceBarText}`);
	  assert(healthState.intervalDelays.includes(1000), `network health chamber: 1s freshness ticker was not registered: ${healthState.intervalDelays.join(', ')}`);
	  assert(healthState.intervalDelays.includes(6000), `network health chamber: 6s refresh timer was not registered: ${healthState.intervalDelays.join(', ')}`);

	  await page.setViewportSize({ width: 2048, height: 1000 });
	  await page.waitForFunction(() => {
	    const pills = Array.from(document.querySelectorAll('#live-head-stack .live-head-story-chip'));
	    const votingVisible = ['l1-vote', 'l2-vote'].every((kind) => pills.some((pill) => (
	      pill.classList.contains(`is-${kind}`) && !pill.hidden
	    )));
	    const progressiveVisible = ['art', 'transfers', 'stake'].every((kind) => pills.some((pill) => (
	      pill.classList.contains(`is-${kind}`)
	        && !pill.hidden
	        && Number(pill.dataset.liveHeadDetailLevel || 0) > 0
	    )));
	    return votingVisible && progressiveVisible;
	  }, null, { timeout: 5000 });
	  const wideStoryState = await page.evaluate(() => Object.fromEntries(
	    ['art', 'transfers', 'stake'].map((kind) => {
	      const pill = Array.from(document.querySelectorAll(`#live-head-stack .live-head-story-chip.is-${kind}`))
	        .find((candidate) => !candidate.hidden && Number(candidate.dataset.liveHeadDetailLevel || 0) > 0);
	      return [kind, {
	        level: Number(pill?.dataset.liveHeadDetailLevel || 0),
	        overflow: pill ? pill.scrollWidth - pill.clientWidth : 999,
	        text: pill?.textContent?.replace(/\s+/g, ' ').trim() || ''
	      }];
	    })
	  ));
	  assert(/Smoke Piece/.test(wideStoryState.art.text)
	      && /\d[\d,]* ꜩ/.test(wideStoryState.transfers.text)
	      && /→/.test(wideStoryState.transfers.text)
	      && /125 ꜩ/.test(wideStoryState.stake.text)
	      && Object.values(wideStoryState).every((pill) => pill.level > 0 && pill.overflow <= 1), `network health chamber: wide rows did not spend real spare width on richer receipts ${JSON.stringify(wideStoryState)}`);
	  await page.setViewportSize({ width: 1440, height: 1000 });

	  await page.locator('#health-nc-share').click({ noWaitAfter: true });
    await page.locator('#share-modal.visible').waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForFunction(() => {
      const image = document.querySelector('#share-modal .share-modal-preview img');
      return Boolean(image?.complete && image.naturalWidth && image.naturalHeight);
    }, null, { timeout: 5000 });
    const nakamotoShareState = await page.evaluate(() => {
      const image = document.querySelector('#share-modal .share-modal-preview img');
      return {
        captureText: window.__lastHtml2CanvasText || '',
        captureSize: window.__lastHtml2CanvasSize || {},
        imageWidth: image?.naturalWidth || 0,
        imageHeight: image?.naturalHeight || 0,
        tweet: document.querySelector('#share-modal #tweet-compose-text')?.value || ''
      };
    });
    assert(nakamotoShareState.captureSize.width === 1200 && nakamotoShareState.captureSize.height === 630, `network health chamber: Nakamoto share capture must be 1200x630: ${JSON.stringify(nakamotoShareState.captureSize)}`);
    assert(nakamotoShareState.imageWidth === 1200 && nakamotoShareState.imageHeight === 630, `network health chamber: Nakamoto share preview image must be 1200x630: ${nakamotoShareState.imageWidth}x${nakamotoShareState.imageHeight}`);
    assert(/Nakamoto/i.test(nakamotoShareState.captureText), `network health chamber: Nakamoto share image is missing its subject: ${nakamotoShareState.captureText}`);
    assert(/Nakamoto/i.test(nakamotoShareState.tweet) && /tezos\.systems\/health\/?/i.test(nakamotoShareState.tweet), `network health chamber: Nakamoto tweet copy missing subject or direct route: ${nakamotoShareState.tweet}`);
    await page.locator('#share-modal .share-modal-close').click();
    await page.locator('#share-modal').waitFor({ state: 'detached', timeout: 5000 });

    await page.locator('#health-nc-print').click();
    await page.waitForFunction(() => window.__healthPrintState?.printed === true, null, { timeout: 5000 });
    const nakamotoPrintState = await page.evaluate(() => {
      const html = window.__healthPrintState?.html || '';
      const probe = document.createElement('div');
      probe.innerHTML = html;
      return {
        html,
        text: probe.textContent?.replace(/\s+/g, ' ').trim() || '',
        printed: window.__healthPrintState?.printed || false
      };
    });
    assert(nakamotoPrintState.printed, 'network health chamber: Nakamoto print control did not call print()');
    assert(/Nakamoto/i.test(nakamotoPrintState.text), `network health chamber: Nakamoto print document is missing its title: ${nakamotoPrintState.text}`);
    assert(/(?:33\s*1\/3|33⅓|33\.3)\s*%/.test(nakamotoPrintState.text), `network health chamber: Nakamoto print document is missing the one-third threshold: ${nakamotoPrintState.text}`);
    assert(/(?:66\s*2\/3|66⅔|66\.7)\s*%/.test(nakamotoPrintState.text), `network health chamber: Nakamoto print document is missing the two-thirds threshold: ${nakamotoPrintState.text}`);

    const tickerFreshnessState = await page.evaluate(() => {
      const timers = (window.__tezosSystemsIntervals || []).filter((item) => item.timeout === 1000);
      const realNow = Date.now;
      Date.now = () => realNow() + 13000;
      try {
        timers.forEach((timer) => timer?.handler?.());
      } finally {
        Date.now = realNow;
      }
      const card = document.querySelector('[data-stat="network-health"]');
      return {
        hasTimer: timers.some((timer) => Boolean(timer?.handler)),
        state: card?.dataset.freshnessState || '',
        stale: card?.classList.contains('chamber-data-stale') || false
      };
    });
    assert(tickerFreshnessState.hasTimer, 'network health chamber: freshness ticker handler missing');
    assert(tickerFreshnessState.state === 'stale' && tickerFreshnessState.stale, `network health chamber: stale state should update from ticker after fetch silence: ${tickerFreshnessState.state}/${tickerFreshnessState.stale}`);

    await page.locator('#health-nakamoto-coefficient .health-nc-help > summary').click();
    const nakamotoHelpState = await page.evaluate(() => {
      const details = document.querySelector('#health-nakamoto-coefficient .health-nc-help');
      return {
        open: details?.open || false,
        text: details?.querySelector('.lb-help-popover')?.textContent?.replace(/\s+/g, ' ').trim() || ''
      };
    });
    assert(nakamotoHelpState.open, 'network health chamber: Nakamoto info control did not open');
    assert(/33 1\/3%/.test(nakamotoHelpState.text) && /66 2\/3%/.test(nakamotoHelpState.text), `network health chamber: Nakamoto info threshold explanation missing: ${nakamotoHelpState.text}`);
    assert(/delegate addresses/.test(nakamotoHelpState.text) && /clustered/.test(nakamotoHelpState.text), `network health chamber: Nakamoto info address/entity caveat missing: ${nakamotoHelpState.text}`);
    assert(/snapshot dates/.test(nakamotoHelpState.text) && /historical block production/.test(nakamotoHelpState.text), `network health chamber: Nakamoto info methodology explanation missing: ${nakamotoHelpState.text}`);

    const beforeSmoothRefresh = await page.evaluate(() => {
      const timer = (window.__tezosSystemsIntervals || []).filter((item) => item.timeout === 6000).at(-1);
      window.__healthBodyNode = document.querySelector('#network-health-modal .health-body');
      window.__healthHeaderNode = document.querySelector('#network-health-modal .health-header');
      window.__healthScorePanelNode = document.querySelector('#network-health-modal .health-score-panel');
      window.__healthNcPanelNode = document.querySelector('#network-health-modal #health-nakamoto-coefficient');
      window.__healthNcPrintNode = document.querySelector('#network-health-modal #health-nc-print');
      window.__healthNcShareNode = document.querySelector('#network-health-modal #health-nc-share');
      window.__healthCyclePanelNode = document.querySelector('#network-health-modal #health-cycle-timing');
      window.__healthBlockDepthToggleNode = document.querySelector('#health-block-depth-toggle');
      window.__healthBlockSetupNode = document.querySelector('#health-block-filter-toggle');
      window.__healthReceiptLevel = document.querySelector('#health-recent-block-list .health-block-row')?.dataset.healthLevel || '';
      window.__healthReceiptNode = document.querySelector('#health-recent-block-list .health-block-row [data-health-block-receipts]');
      window.__heartbeatRetainedCell = document.querySelector('#live-head-stack .live-head-row:nth-child(2)');
      window.__heartbeatRetainedStory = window.__heartbeatRetainedCell?.querySelector('.live-head-story');
      window.__heartbeatRetainedKey = window.__heartbeatRetainedCell?.dataset.quietKey || '';
      window.__heartbeatStorySignature = window.__heartbeatRetainedStory?.dataset.storySignature || '';
      window.__heartbeatRevealSignature = window.__heartbeatRetainedStory?.dataset.quietRevealSignature || '';
      window.__heartbeatWindowY = window.scrollY;
      window.__heartbeatModalScroll = document.querySelector('#network-health-modal .health-content')?.scrollTop || 0;
      window.__heartbeatMotionProbeObserver?.disconnect();
      window.__heartbeatMotionProbe = {
        healthNewRows: 0,
        liveHeadNewRows: 0,
        liveHeadExitRows: 0,
        liveHeadArrivalAnimation: '',
        liveHeadRetainedMotion: false
      };
      window.__heartbeatMotionProbeCapture = () => {
        const probe = window.__heartbeatMotionProbe;
        const liveHeadNewRow = document.querySelector('#live-head-stack .lb-row-new');
        probe.healthNewRows = Math.max(probe.healthNewRows, document.querySelectorAll('#health-recent-block-list .lb-row-new').length);
        probe.liveHeadNewRows = Math.max(probe.liveHeadNewRows, document.querySelectorAll('#live-head-stack .lb-row-new').length);
        probe.liveHeadExitRows = Math.max(probe.liveHeadExitRows, document.querySelectorAll('#live-head-stack .live-head-row-exiting').length);
        if (liveHeadNewRow) probe.liveHeadArrivalAnimation = getComputedStyle(liveHeadNewRow).animationName;
        probe.liveHeadRetainedMotion ||= Boolean(
          window.__heartbeatRetainedCell?.dataset.liveHeadShift === 'settling'
          || window.__heartbeatRetainedCell?.getAnimations().some((animation) => animation.id === 'live-head-shift')
        );
      };
      const motionProbeObserver = new MutationObserver(window.__heartbeatMotionProbeCapture);
      const healthRows = document.querySelector('#health-recent-block-list');
      const liveHeadRows = document.querySelector('#live-head-stack');
      if (healthRows) motionProbeObserver.observe(healthRows, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
      if (liveHeadRows) motionProbeObserver.observe(liveHeadRows, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-live-head-shift'] });
      window.__heartbeatMotionProbeObserver = motionProbeObserver;
      window.__heartbeatMotionProbeCapture();
      return {
        hasTimer: Boolean(timer?.handler),
        firstLevel: document.querySelector('#health-recent-block-list .health-block-row')?.dataset.healthLevel || '',
        rowCount: document.querySelectorAll('#health-recent-block-list .health-block-row').length,
        visibleRowCount: Array.from(document.querySelectorAll('#health-recent-block-list .health-block-row'))
          .filter((row) => getComputedStyle(row).display !== 'none').length,
        heartbeatWindowY: window.__heartbeatWindowY,
        heartbeatModalScroll: window.__heartbeatModalScroll
      };
    });
    assert(beforeSmoothRefresh.hasTimer, 'network health chamber: smooth refresh timer handler missing');
    assert(beforeSmoothRefresh.firstLevel, 'network health chamber: missing first block level before smooth refresh');
    mockState.advanceBlockHead();
    await page.evaluate(() => {
      const timer = (window.__tezosSystemsIntervals || []).filter((item) => item.timeout === 6000).at(-1);
      const realNow = Date.now;
      Date.now = () => realNow() + 13000;
      try {
        timer?.handler?.();
      } finally {
        Date.now = realNow;
      }
    });
    await page.waitForFunction((previousLevel) => {
      const first = document.querySelector('#health-recent-block-list .health-block-row');
      return first?.dataset.healthLevel && first.dataset.healthLevel !== previousLevel;
    }, beforeSmoothRefresh.firstLevel, { timeout: 10000 });
    const smoothRefreshState = await page.evaluate(() => {
      window.__heartbeatMotionProbeCapture?.();
      window.__heartbeatMotionProbeObserver?.disconnect();
      const motionProbe = window.__heartbeatMotionProbe || {};
      return {
      bodySame: window.__healthBodyNode === document.querySelector('#network-health-modal .health-body'),
      headerSame: window.__healthHeaderNode === document.querySelector('#network-health-modal .health-header'),
      scorePanelSame: window.__healthScorePanelNode === document.querySelector('#network-health-modal .health-score-panel'),
      ncPanelSame: window.__healthNcPanelNode === document.querySelector('#network-health-modal #health-nakamoto-coefficient'),
      ncPrintSame: window.__healthNcPrintNode === document.querySelector('#network-health-modal #health-nc-print'),
      ncShareSame: window.__healthNcShareNode === document.querySelector('#network-health-modal #health-nc-share'),
      cyclePanelSame: window.__healthCyclePanelNode === document.querySelector('#network-health-modal #health-cycle-timing'),
      blockDepthToggleSame: window.__healthBlockDepthToggleNode === document.querySelector('#health-block-depth-toggle'),
      blockSetupSame: window.__healthBlockSetupNode === document.querySelector('#health-block-filter-toggle'),
      blockReceiptSame: window.__healthReceiptNode === document.querySelector(`#health-recent-block-list .health-block-row[data-health-level="${window.__healthReceiptLevel}"] [data-health-block-receipts]`),
      heartbeatRetainedCellSame: window.__heartbeatRetainedCell === document.querySelector(`#live-head-stack [data-quiet-key="${window.__heartbeatRetainedKey}"]`),
      heartbeatRetainedStorySame: window.__heartbeatRetainedStory === document.querySelector(`#live-head-stack [data-quiet-key="${window.__heartbeatRetainedKey}"] .live-head-story`),
      heartbeatStorySignatureSame: window.__heartbeatStorySignature === document.querySelector(`#live-head-stack [data-quiet-key="${window.__heartbeatRetainedKey}"] .live-head-story`)?.dataset.storySignature,
      heartbeatRevealSignatureSame: window.__heartbeatRevealSignature === document.querySelector(`#live-head-stack [data-quiet-key="${window.__heartbeatRetainedKey}"] .live-head-story`)?.dataset.quietRevealSignature,
      heartbeatRevealAligned: document.querySelector(`#live-head-stack [data-quiet-key="${window.__heartbeatRetainedKey}"] .live-head-story`)?.dataset.storySignature === document.querySelector(`#live-head-stack [data-quiet-key="${window.__heartbeatRetainedKey}"] .live-head-story`)?.dataset.quietRevealSignature,
      heartbeatWindowY: window.scrollY,
      heartbeatModalScroll: document.querySelector('#network-health-modal .health-content')?.scrollTop || 0,
      heartbeatAnnounced: document.querySelector('#chain-heartbeat-announcer')?.textContent || '',
      cycleProgress: document.querySelector('#network-health-modal #health-cycle-progress')?.textContent || '',
      ncHelpOpen: document.querySelector('#network-health-modal .health-nc-help')?.open || false,
      mode: document.querySelector('#network-health-modal .health-body')?.dataset.healthRefreshMode || '',
      firstLevel: document.querySelector('#health-recent-block-list .health-block-row')?.dataset.healthLevel || '',
      rowCount: document.querySelectorAll('#health-recent-block-list .health-block-row').length,
      visibleRowCount: Array.from(document.querySelectorAll('#health-recent-block-list .health-block-row'))
        .filter((row) => getComputedStyle(row).display !== 'none').length,
      blockDepthExpanded: document.querySelector('#health-block-depth-toggle')?.getAttribute('aria-expanded') || '',
      blockDepthCount: document.querySelector('[data-health-block-depth-count]')?.textContent?.trim() || '',
      newRows: Math.max(Number(motionProbe.healthNewRows || 0), document.querySelectorAll('#health-recent-block-list .lb-row-new').length),
      liveHeadNewRows: Math.max(Number(motionProbe.liveHeadNewRows || 0), document.querySelectorAll('#live-head-stack .lb-row-new').length),
      liveHeadExitRows: Math.max(Number(motionProbe.liveHeadExitRows || 0), document.querySelectorAll('#live-head-stack .live-head-row-exiting').length),
      liveHeadArrivalAnimation: motionProbe.liveHeadArrivalAnimation || (document.querySelector('#live-head-stack .lb-row-new') ? getComputedStyle(document.querySelector('#live-head-stack .lb-row-new')).animationName : ''),
      liveHeadRetainedTransition: window.__heartbeatRetainedCell ? getComputedStyle(window.__heartbeatRetainedCell).transitionProperty : '',
      liveHeadRetainedMotion: Boolean(motionProbe.liveHeadRetainedMotion || window.__heartbeatRetainedCell?.getAnimations().some((animation) => animation.id === 'live-head-shift')),
      liveHeadTopBarSignature: document.querySelector('#live-head-stack .live-head-row')?.dataset.barSignature || '',
      liveHeadTopBarAnimation: getComputedStyle(document.querySelector('#live-head-stack .live-head-power-fill')).animationName,
      tickerTransitionCount: Number(document.querySelector('#live-head')?.dataset.liveHeadTransitionCount || 0),
      tablePadding: getComputedStyle(document.querySelector('.health-block-table .lb-table-row')).paddingTop
      };
    });
    assert(smoothRefreshState.bodySame, 'network health chamber: smooth refresh replaced the chamber body');
    assert(smoothRefreshState.headerSame, 'network health chamber: smooth refresh replaced the header instead of updating in place');
    assert(smoothRefreshState.scorePanelSame, 'network health chamber: smooth refresh replaced the score panel instead of updating in place');
    assert(smoothRefreshState.ncPanelSame, 'network health chamber: smooth refresh replaced the Nakamoto panel instead of updating in place');
    assert(smoothRefreshState.ncPrintSame && smoothRefreshState.ncShareSame, 'network health chamber: smooth refresh replaced Nakamoto print/share controls');
    assert(smoothRefreshState.cyclePanelSame && smoothRefreshState.cycleProgress === '11.4%', `network health chamber: quiet refresh replaced or lost current-cycle progress: ${JSON.stringify(smoothRefreshState)}`);
    assert(smoothRefreshState.blockDepthToggleSame
        && smoothRefreshState.blockSetupSame
        && smoothRefreshState.blockReceiptSame
        && smoothRefreshState.rowCount === beforeSmoothRefresh.rowCount
        && smoothRefreshState.visibleRowCount === beforeSmoothRefresh.visibleRowCount
        && smoothRefreshState.blockDepthExpanded === 'false'
        && smoothRefreshState.blockDepthCount === '8 blocks',
      `network health chamber: smooth refresh replaced or reset Passing Blocks depth ${JSON.stringify(smoothRefreshState)}`);
    assert(
      smoothRefreshState.heartbeatRetainedCellSame
        && smoothRefreshState.heartbeatRetainedStorySame
        && (smoothRefreshState.heartbeatStorySignatureSame
          ? smoothRefreshState.heartbeatRevealSignatureSame
          : smoothRefreshState.heartbeatRevealAligned),
      `network health chamber: Live Head refresh replaced compatible keyed DOM or replayed an unchanged fact: ${JSON.stringify(smoothRefreshState)}`
    );
    assert(Math.abs(smoothRefreshState.heartbeatWindowY - beforeSmoothRefresh.heartbeatWindowY) <= 1 && Math.abs(smoothRefreshState.heartbeatModalScroll - beforeSmoothRefresh.heartbeatModalScroll) <= 1, `network health chamber: Live Head refresh moved the reader: ${JSON.stringify(smoothRefreshState)}`);
    assert(/Block [\d,]+ landed/.test(smoothRefreshState.heartbeatAnnounced), `network health chamber: new block announcement missing: ${smoothRefreshState.heartbeatAnnounced}`);
    assert(smoothRefreshState.ncHelpOpen, 'network health chamber: smooth refresh closed the open Nakamoto info control');
    assert(smoothRefreshState.mode === 'in-place', `network health chamber: refresh mode mismatch: ${smoothRefreshState.mode}`);
    assert(smoothRefreshState.rowCount === beforeSmoothRefresh.rowCount, `network health chamber: passing block row count shifted after smooth refresh: ${smoothRefreshState.rowCount}`);
    assert(smoothRefreshState.newRows >= 1, 'network health chamber: smooth refresh did not animate newly arriving block rows');
    assert(smoothRefreshState.liveHeadNewRows >= 1, 'network health chamber: Live Head did not use the Passing Blocks arrival transition');
    assert(smoothRefreshState.liveHeadNewRows >= 1 && smoothRefreshState.liveHeadExitRows >= 1 && smoothRefreshState.liveHeadRetainedMotion, `network health chamber: Live Head arrival must keep incoming, retained, and outgoing rows in one continuous conveyor motion ${JSON.stringify(smoothRefreshState)}`);
    assert(smoothRefreshState.liveHeadTopBarSignature && smoothRefreshState.liveHeadTopBarAnimation === 'none', `network health chamber: Live Head bar must retain its factual width during row arrival ${JSON.stringify(smoothRefreshState)}`);
    assert(smoothRefreshState.tickerTransitionCount >= 1, `network health chamber: Live Head did not mark a transition after refresh: ${smoothRefreshState.tickerTransitionCount}`);
    assert(parseFloat(smoothRefreshState.tablePadding) >= 8, `network health chamber: passing blocks row padding too tight: ${smoothRefreshState.tablePadding}`);

    await page.waitForTimeout(900);
    const settledBarState = await page.evaluate(() => {
      const row = document.querySelector('#live-head-stack .live-head-row');
      const fill = row.querySelector('.live-head-power-fill');
      const before = getComputedStyle(fill).transform;
      (window.__tezosSystemsIntervals || [])
        .filter((item) => item.timeout === 1000)
        .forEach((timer) => timer?.handler?.());
      return {
        signature: row?.dataset.barSignature || '',
        transform: getComputedStyle(fill).transform,
        before,
        animation: getComputedStyle(fill).animationName
      };
    });
    assert(
      settledBarState.signature
        && settledBarState.before === settledBarState.transform
        && settledBarState.animation === 'none',
      `network health chamber: Live Head bar replayed after settling ${JSON.stringify(settledBarState)}`
    );

    await page.evaluate(() => {
      const fixture = document.createElement('span');
      fixture.className = 'live-head-story';
      fixture.dataset.liveHeadMobileMissFixture = 'true';
      fixture.style.cssText = 'position:fixed;left:-10000px;top:0;width:140px;visibility:hidden;pointer-events:none';
      fixture.innerHTML = '<span class="live-head-miss-pill" data-missed-baker-address="tz1MobileFit">tz1YyjC...haZic · −1</span>';
      document.getElementById('live-head')?.appendChild(fixture);
      window.dispatchEvent(new Event('resize'));
    });
    const mobileTickerStates = [];
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.waitForFunction(() => Array.from(document.querySelectorAll('#live-head .live-head-story-chip')).every((pill) => (
        pill.dataset.liveHeadDetailLevel === '0'
          && pill.textContent?.replace(/\s+/g, ' ').trim() === pill.dataset.liveHeadCompact
      )), null, { timeout: 5000 });
      mobileTickerStates.push(await page.evaluate((viewportWidth) => {
        const card = document.querySelector('#live-head');
        const activityButton = document.querySelector('#header-activity-button');
        const filterToggle = document.querySelector('#live-head-filter-toggle');
        const missFixture = document.querySelector('[data-live-head-mobile-miss-fixture]');
        const missFixturePill = missFixture?.querySelector('.live-head-miss-pill');
        const rows = Array.from(document.querySelectorAll('#live-head-stack .live-head-row[data-live-head-level]'))
          .filter((row) => getComputedStyle(row).display !== 'none');
	      const cardRect = card?.getBoundingClientRect();
	      const wellRect = document.querySelector('#hero-search-form')?.getBoundingClientRect();
	      const metricRows = rows.map((row) => {
	        const main = row.querySelector('.live-head-row-main');
	        const attested = row.querySelector('.live-head-attested');
	        const age = row.querySelector('.live-head-age');
	        const power = row.querySelector('.live-head-power');
	        const track = row.querySelector('.live-head-power-track');
	        const status = row.querySelector('.live-head-quiet, .live-head-gas, .live-head-gas-skeleton');
	        const mainRect = main?.getBoundingClientRect();
	        const attestedRect = attested?.getBoundingClientRect();
	        const ageRect = age?.getBoundingClientRect();
	        const powerRect = power?.getBoundingClientRect();
	        const trackRect = track?.getBoundingClientRect();
	        const statusRect = status?.getBoundingClientRect();
	        return {
	          mainColumns: main ? getComputedStyle(main).gridTemplateColumns.split(' ').filter((part) => part !== '0px').length : 0,
	          attestedWidth: attestedRect?.width || 0,
	          ageWidth: ageRect?.width || 0,
	          contained: Boolean(mainRect && attestedRect && ageRect && statusRect
	            && attestedRect.left >= mainRect.left - 1
	            && statusRect.right <= attestedRect.right + 1
	            && attestedRect.right <= ageRect.left + 1
	            && ageRect.right <= mainRect.right + 1),
	          ordered: Boolean(powerRect && trackRect && statusRect
	            && powerRect.right <= trackRect.left + 1
	            && trackRect.right <= statusRect.left + 1)
	        };
	      });
	      return {
          viewportWidth,
          height: cardRect?.height || 0,
          activityHeight: activityButton?.getBoundingClientRect().height || 0,
          filterHeight: filterToggle?.getBoundingClientRect().height || 0,
          chainState: card?.dataset.chainState || '',
          alertVisible: Boolean(document.querySelector('#live-head-alert') && !document.querySelector('#live-head-alert').hidden),
          rows: rows.length,
          levels: rows.map((row) => row.querySelector('.live-head-level')?.textContent?.trim() || ''),
          rowsContained: rows.every((row) => {
            const rect = row.getBoundingClientRect();
            return cardRect && rect.left >= cardRect.left - 1 && rect.right <= cardRect.right + 1;
          }),
	        wellContained: Boolean(cardRect && wellRect && wellRect.left >= cardRect.left - 1 && wellRect.right <= cardRect.right + 1),
	        wellJoined: Boolean(cardRect && wellRect
	          && Math.abs(wellRect.left - cardRect.left) <= 1
	          && Math.abs(wellRect.right - cardRect.right) <= 1
	          && Math.abs(wellRect.bottom - cardRect.bottom) <= 1),
	        metricRows,
	        clearMissPills: Array.from(card?.querySelectorAll('.live-head-miss-pill.is-clear') || []).map((pill) => ({
	          text: pill.textContent?.replace(/\s+/g, ' ').trim() || '',
	          clipped: pill.scrollWidth > pill.clientWidth + 1
	        })),
          missFixture: {
            clipped: missFixturePill ? missFixturePill.scrollWidth > missFixturePill.clientWidth + 1 : true,
            contained: Boolean(missFixture && missFixturePill
              && missFixturePill.getBoundingClientRect().left >= missFixture.getBoundingClientRect().left - 1
              && missFixturePill.getBoundingClientRect().right <= missFixture.getBoundingClientRect().right + 1),
            overflow: missFixture ? missFixture.scrollWidth - missFixture.clientWidth : 999
          },
          rowOverflow: Math.max(0, ...rows.map((row) => row.scrollWidth - row.clientWidth)),
	        cardOverflow: card ? card.scrollWidth - card.clientWidth : 999,
	        pageOverflow: document.documentElement.scrollWidth - innerWidth,
	        storyPills: Array.from(card?.querySelectorAll('.live-head-story-chip:not([hidden])') || []).map((pill) => ({
	          compact: pill.dataset.liveHeadCompact || '',
	          level: Number(pill.dataset.liveHeadDetailLevel || 0),
	          text: pill.textContent?.replace(/\s+/g, ' ').trim() || ''
	        })),
	        nextText: document.querySelector('#live-head-next')?.textContent?.replace(/\s+/g, ' ').trim() || ''
        };
      }, width));
    }
    for (const tickerState of mobileTickerStates) {
      assert(
        // Activity and health share a 48px mobile row; Setup stays beside the title.
        tickerState.height <= (tickerState.alertVisible ? 474 : 424)
          && Math.abs(tickerState.activityHeight - 48) <= 1
          && Math.abs(tickerState.filterHeight - 30) <= 1
          && tickerState.rows === 3
          && tickerState.levels.every((level) => /^#[\d,]+$/.test(level))
	        && tickerState.rowsContained
	        && tickerState.wellContained
	        && tickerState.wellJoined
	        && tickerState.metricRows.every((row) => row.mainColumns === 3
	          && row.attestedWidth > 0
	          && row.ageWidth > 0
	          && row.contained
	          && row.ordered)
	        && tickerState.clearMissPills.every((pill) => /^(No attestation misses|Misses not indexed)$/.test(pill.text) && !pill.clipped)
          && !tickerState.missFixture.clipped
          && tickerState.missFixture.contained
          && tickerState.missFixture.overflow <= 1
          && tickerState.rowOverflow <= 1
          && tickerState.cardOverflow <= 1
	        && tickerState.pageOverflow <= 1
	        && tickerState.storyPills.every((pill) => pill.level === 0 && pill.text === pill.compact)
	        && (!tickerState.alertVisible || tickerState.chainState === 'stalled')
          && /Next R0/.test(tickerState.nextText),
        `network health chamber: mobile Live Head geometry drifted at ${tickerState.viewportWidth}px: ${JSON.stringify(tickerState)}`
      );
    }
    await page.evaluate(() => document.querySelector('[data-live-head-mobile-miss-fixture]')?.remove());

    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#health-nakamoto-coefficient .health-nc-help .lb-help-popover').scrollIntoViewIfNeeded();
    const nakamotoMobileState = await page.evaluate(() => {
      const panel = document.querySelector('#health-nakamoto-coefficient');
      const cyclePanel = document.querySelector('#health-cycle-timing');
      const cycleCurrent = cyclePanel?.querySelector('#health-cycle-current');
      const cycleHead = cycleCurrent?.querySelector('.health-cycle-progress-head');
      const cycleTrack = cycleCurrent?.querySelector('.health-cycle-progress-track');
      const help = panel?.querySelector('.health-nc-help .lb-help-popover');
      const intro = panel?.querySelector('.health-nc-intro');
      const trigger = panel?.querySelector('.health-nc-help-trigger, .health-nc-help > summary');
      const actions = panel?.querySelector('.health-nc-actions');
      const actionButtons = [...(actions?.querySelectorAll('button') || [])];
      const panelRect = panel?.getBoundingClientRect();
      const cyclePanelRect = cyclePanel?.getBoundingClientRect();
      const cycleCurrentRect = cycleCurrent?.getBoundingClientRect();
      const cycleHeadRect = cycleHead?.getBoundingClientRect();
      const cycleTrackRect = cycleTrack?.getBoundingClientRect();
      const helpRect = help?.getBoundingClientRect();
      const introRect = intro?.getBoundingClientRect();
      const actionsRect = actions?.getBoundingClientRect();
      return {
        panelContained: Boolean(panelRect && panelRect.left >= 0 && panelRect.right <= window.innerWidth),
        cyclePanelContained: Boolean(cyclePanelRect && cyclePanelRect.left >= 0 && cyclePanelRect.right <= window.innerWidth),
        cycleCurrentContained: Boolean(cyclePanelRect && cycleCurrentRect && cycleCurrentRect.left >= cyclePanelRect.left && cycleCurrentRect.right <= cyclePanelRect.right),
        cycleHeadContained: Boolean(cycleCurrentRect && cycleHeadRect && cycleHeadRect.left >= cycleCurrentRect.left && cycleHeadRect.right <= cycleCurrentRect.right),
        cycleTrackContained: Boolean(cycleCurrentRect && cycleTrackRect && cycleTrackRect.left >= cycleCurrentRect.left && cycleTrackRect.right <= cycleCurrentRect.right),
        cycleProgress: cycleCurrent?.querySelector('#health-cycle-progress')?.textContent || '',
        cycleOverflow: cyclePanel ? cyclePanel.scrollWidth - cyclePanel.clientWidth : 0,
        helpContained: Boolean(helpRect && helpRect.left >= 0 && helpRect.right <= window.innerWidth && helpRect.top >= 0 && helpRect.bottom <= window.innerHeight),
        actionsContained: Boolean(panelRect && actionsRect && actionsRect.left >= panelRect.left && actionsRect.right <= panelRect.right),
        actionButtonCount: actionButtons.length,
        actionButtonMinSize: actionButtons.length ? Math.min(...actionButtons.map((button) => {
          const rect = button.getBoundingClientRect();
          return Math.min(rect.width, rect.height);
        })) : 0,
        helpInFlow: Boolean(helpRect && introRect && introRect.top >= helpRect.bottom - 1),
        helpPosition: help ? getComputedStyle(help).position : '',
        triggerSize: trigger ? Math.min(trigger.getBoundingClientRect().width, trigger.getBoundingClientRect().height) : 0
      };
    });
    assert(nakamotoMobileState.panelContained, 'network health chamber: Nakamoto panel overflows the mobile viewport');
    assert(
      nakamotoMobileState.cyclePanelContained
        && nakamotoMobileState.cycleCurrentContained
        && nakamotoMobileState.cycleHeadContained
        && nakamotoMobileState.cycleTrackContained
        && nakamotoMobileState.cycleProgress === '11.4%'
        && nakamotoMobileState.cycleOverflow <= 1,
      `network health chamber: current-cycle progress does not fit the mobile panel: ${JSON.stringify(nakamotoMobileState)}`
    );
    assert(nakamotoMobileState.helpContained, `network health chamber: Nakamoto info note escapes the mobile viewport: ${JSON.stringify(nakamotoMobileState)}`);
    assert(nakamotoMobileState.actionsContained && nakamotoMobileState.actionButtonCount === 2, `network health chamber: Nakamoto print/share controls escape the mobile panel: ${JSON.stringify(nakamotoMobileState)}`);
    assert(nakamotoMobileState.actionButtonMinSize >= 28, `network health chamber: Nakamoto mobile print/share controls are too small: ${JSON.stringify(nakamotoMobileState)}`);
    assert(nakamotoMobileState.helpInFlow && nakamotoMobileState.helpPosition === 'static', `network health chamber: Nakamoto mobile info should expand in flow: ${JSON.stringify(nakamotoMobileState)}`);
    assert(nakamotoMobileState.triggerSize >= 28, `network health chamber: Nakamoto info control is too small on mobile: ${nakamotoMobileState.triggerSize}`);
    await chamberDepthToggle.scrollIntoViewIfNeeded();
    const chamberMobileCompactDepthState = await page.evaluate(() => {
      const panel = document.querySelector('.health-recent-blocks');
      const toggle = document.getElementById('health-block-depth-toggle');
      const setup = document.getElementById('health-block-filter-toggle');
      const rows = Array.from(document.querySelectorAll('#health-recent-block-list .health-block-row'));
      const rect = toggle?.getBoundingClientRect();
      const setupRect = setup?.getBoundingClientRect();
      const visibleRows = rows.filter((row) => getComputedStyle(row).display !== 'none');
      return {
        visible: visibleRows.length,
        label: toggle?.getAttribute('aria-label') || '',
        count: toggle?.querySelector('[data-health-block-depth-count]')?.textContent?.trim() || '',
        targetWidth: rect?.width || 0,
        targetHeight: rect?.height || 0,
        setupWidth: setupRect?.width || 0,
        setupHeight: setupRect?.height || 0,
        setupBeforeDepth: Boolean(setupRect && rect && setupRect.right <= rect.left + 1),
        receiptRows: visibleRows.filter((row) => row.querySelector('[data-health-block-receipts]')).length,
        rowOverflow: Math.max(0, ...visibleRows.map((row) => row.scrollWidth - row.clientWidth)),
        receiptOverflow: Math.max(0, ...visibleRows.map((row) => {
          const receipt = row.querySelector('[data-health-block-receipts]');
          return receipt ? receipt.scrollWidth - receipt.clientWidth : 999;
        })),
        panelOverflow: panel ? panel.scrollWidth - panel.clientWidth : 999,
        pageOverflow: document.documentElement.scrollWidth - innerWidth
      };
    });
    assert(chamberMobileCompactDepthState.visible === 6
        && /Show all 12 Passing Blocks/.test(chamberMobileCompactDepthState.label)
        && chamberMobileCompactDepthState.count === '6 blocks'
        && chamberMobileCompactDepthState.targetWidth >= 44
        && chamberMobileCompactDepthState.targetHeight >= 44
        && chamberMobileCompactDepthState.setupWidth >= 44
        && chamberMobileCompactDepthState.setupHeight >= 44
        && chamberMobileCompactDepthState.setupBeforeDepth
        && chamberMobileCompactDepthState.receiptRows === 6
        && chamberMobileCompactDepthState.rowOverflow <= 1
        && chamberMobileCompactDepthState.receiptOverflow <= 1
        && chamberMobileCompactDepthState.panelOverflow <= 1
        && chamberMobileCompactDepthState.pageOverflow <= 1,
      `network health chamber: compact mobile Passing Blocks depth overflowed or lost its action ${JSON.stringify(chamberMobileCompactDepthState)}`);
    await chamberDepthToggle.click();
    await page.waitForFunction(() => (
      Array.from(document.querySelectorAll('#health-recent-block-list .health-block-row'))
        .filter((row) => getComputedStyle(row).display !== 'none').length === 12
      && Array.from(document.querySelectorAll('#live-head-stack .live-head-row[data-live-head-level]'))
        .filter((row) => getComputedStyle(row).display !== 'none').length === 10
    ));
    const chamberMobileExpandedDepthState = await page.evaluate(() => {
      const panel = document.querySelector('.health-recent-blocks');
      const toggle = document.getElementById('health-block-depth-toggle');
      const visibleRows = Array.from(document.querySelectorAll('#health-recent-block-list .health-block-row'))
        .filter((row) => getComputedStyle(row).display !== 'none');
      return {
        visible: visibleRows.length,
        label: toggle?.getAttribute('aria-label') || '',
        count: toggle?.querySelector('[data-health-block-depth-count]')?.textContent?.trim() || '',
        focusStayed: document.activeElement === toggle,
        rowOverflow: Math.max(0, ...visibleRows.map((row) => row.scrollWidth - row.clientWidth)),
        receiptOverflow: Math.max(0, ...visibleRows.map((row) => {
          const receipt = row.querySelector('[data-health-block-receipts]');
          return receipt ? receipt.scrollWidth - receipt.clientWidth : 999;
        })),
        panelOverflow: panel ? panel.scrollWidth - panel.clientWidth : 999,
        pageOverflow: document.documentElement.scrollWidth - innerWidth
      };
    });
    assert(chamberMobileExpandedDepthState.visible === 12
        && /Show 6 Passing Blocks/.test(chamberMobileExpandedDepthState.label)
        && chamberMobileExpandedDepthState.count === '12 blocks'
        && chamberMobileExpandedDepthState.focusStayed
        && chamberMobileExpandedDepthState.rowOverflow <= 1
        && chamberMobileExpandedDepthState.receiptOverflow <= 1
        && chamberMobileExpandedDepthState.panelOverflow <= 1
        && chamberMobileExpandedDepthState.pageOverflow <= 1,
      `network health chamber: expanded mobile Passing Blocks depth overflowed ${JSON.stringify(chamberMobileExpandedDepthState)}`);
    await chamberDepthToggle.click();
    await page.waitForFunction(() => (
      Array.from(document.querySelectorAll('#health-recent-block-list .health-block-row'))
        .filter((row) => getComputedStyle(row).display !== 'none').length === 6
      && document.querySelectorAll('#live-head-stack .live-head-row[data-live-head-level]').length === 3
    ));
    await page.setViewportSize({ width: 1440, height: 1000 });

    await page.locator('#network-health-modal.active .chamber-close').click();
    await page.waitForFunction(() => !document.querySelector('#network-health-modal')?.classList.contains('active'), null, { timeout: 5000 });

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.waitForFunction(() => document.querySelectorAll('#live-head-stack .live-head-row[data-live-head-level]').length === 4);
    await page.waitForFunction(() => (
      document.querySelectorAll('#live-head-stack .live-head-story-chip[data-live-head-mandatory="true"]').length >= 3
      && Array.from(document.querySelectorAll('#live-head-stack .live-head-row[data-live-head-level]'))
        .every((row) => row.dataset.gasState !== 'loading' && !row.querySelector('.live-head-story.is-loading'))
    ), null, { timeout: 30000 });
    await page.locator('#live-head-filter-toggle').click();
    await page.locator('#live-head-filter-menu:not([hidden])').waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('#live-head-filter-menu [data-live-head-filter-kind="all"]').click();
    const activityFilterOff = await page.evaluate(() => ({
      allPressed: document.querySelector('#live-head-filter-menu [data-live-head-filter-kind="all"]')?.getAttribute('aria-pressed') || '',
      selectedCount: document.querySelectorAll('#live-head-filter-menu .live-head-filter-pill[aria-pressed="true"]').length,
      visibleStoryPills: Array.from(document.querySelectorAll('#live-head-stack .live-head-story-chip')).filter((pill) => !pill.hidden).length,
      mandatoryStoryPills: document.querySelectorAll('#live-head-stack .live-head-story-chip[data-live-head-mandatory="true"]').length,
      visibleMandatoryStoryPills: Array.from(document.querySelectorAll('#live-head-stack .live-head-story-chip[data-live-head-mandatory="true"]')).filter((pill) => !pill.hidden).length,
      visibleOptionalStoryPills: Array.from(document.querySelectorAll('#live-head-stack .live-head-story-chip:not([data-live-head-mandatory="true"])')).filter((pill) => !pill.hidden).length,
      visibleMissPills: Array.from(document.querySelectorAll('#live-head-stack .live-head-miss-pill')).filter((pill) => !pill.hidden).length,
      height: document.querySelector('#live-head')?.getBoundingClientRect().height || 0
    }));
    await page.locator('#live-head-filter-menu [data-live-head-filter-kind="all"]').click();
    const activityFilterOn = await page.evaluate(() => ({
      allPressed: document.querySelector('#live-head-filter-menu [data-live-head-filter-kind="all"]')?.getAttribute('aria-pressed') || '',
      selectedCount: document.querySelectorAll('#live-head-filter-menu .live-head-filter-pill[aria-pressed="true"]').length,
      visibleStoryPills: Array.from(document.querySelectorAll('#live-head-stack .live-head-story-chip')).filter((pill) => !pill.hidden).length,
      mandatoryStoryPills: document.querySelectorAll('#live-head-stack .live-head-story-chip[data-live-head-mandatory="true"]').length,
      visibleMandatoryStoryPills: Array.from(document.querySelectorAll('#live-head-stack .live-head-story-chip[data-live-head-mandatory="true"]')).filter((pill) => !pill.hidden).length,
      visibleOptionalStoryPills: Array.from(document.querySelectorAll('#live-head-stack .live-head-story-chip:not([data-live-head-mandatory="true"])')).filter((pill) => !pill.hidden).length,
      height: document.querySelector('#live-head')?.getBoundingClientRect().height || 0
    }));
    await page.keyboard.press('Escape');
    assert(activityFilterOff.allPressed === 'false'
        && activityFilterOff.selectedCount === 0
        && activityFilterOff.visibleMandatoryStoryPills === activityFilterOff.mandatoryStoryPills
        && activityFilterOff.visibleOptionalStoryPills === 0
        && activityFilterOff.visibleMissPills >= 1
        && activityFilterOn.allPressed === 'true'
        && activityFilterOn.selectedCount === 16
        && activityFilterOn.mandatoryStoryPills === activityFilterOff.mandatoryStoryPills
        && activityFilterOn.visibleMandatoryStoryPills === activityFilterOn.mandatoryStoryPills
        && activityFilterOn.visibleOptionalStoryPills >= 1
        && Math.abs(activityFilterOff.height - activityFilterOn.height) <= 1,
      `network health chamber: activity setup did not deselect and restore every transaction pill without moving the card ${JSON.stringify({ activityFilterOff, activityFilterOn })}`);
    const stalledAlertHitTesting = await page.locator('#live-head-alert:not([hidden])').evaluate((alert) => ({
      alert: getComputedStyle(alert).pointerEvents,
      action: getComputedStyle(alert.querySelector('.live-head-alert-action')).pointerEvents
    }));
    assert(stalledAlertHitTesting.alert === 'none' && stalledAlertHitTesting.action === 'auto', `network health chamber: stalled alert must leave retained block rows inspectable outside its explicit action ${JSON.stringify(stalledAlertHitTesting)}`);
    await page.locator('#live-head-alert:not([hidden]) .live-head-alert-action').click();
    await page.locator('#network-health-modal.active .health-content').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('#network-health-modal.active .chamber-close').click();
    await page.waitForFunction(() => !document.querySelector('#network-health-modal')?.classList.contains('active'), null, { timeout: 5000 });
    await page.locator('#live-head-stack .live-head-row:has(.live-head-story[data-miss-state="resolved"])').first().waitFor({ state: 'visible', timeout: 15000 });
    const liveHeadCurrentFirstRow = page.locator('#live-head-stack .live-head-row[data-live-head-level]').first();
    const liveHeadCurrentFirstInfo = liveHeadCurrentFirstRow.locator('.live-head-info');
    const openCurrentLiveHeadInspector = async (pointerOrigin, rowSelector = '#live-head-stack .live-head-row[data-live-head-level]') => {
      let lastState = null;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        if (await page.evaluate(() => !document.getElementById('live-head-inspector')?.hidden)) {
          await page.keyboard.press('Escape');
          await page.waitForFunction(() => document.getElementById('live-head-inspector')?.hidden === true
            && !document.getElementById('live-head')?.dataset.readingPaused, null, { timeout: 10000 });
        }
        await page.mouse.move(pointerOrigin.x + attempt, pointerOrigin.y + attempt);
        await page.waitForTimeout(32);
        const currentRow = page.locator(rowSelector).first();
        const level = await currentRow.getAttribute('data-live-head-level');
        assert(level, 'network health chamber: current Live Head row is missing its keyed level');
        const info = page.locator(`#live-head-stack .live-head-row[data-live-head-level="${level}"] .live-head-info`);
        await info.scrollIntoViewIfNeeded({ timeout: 5000 });
        const pointer = await info.evaluate(trigger => {
          const rect = trigger.getBoundingClientRect();
          if (rect.width <= 4 || rect.height <= 4) return null;
          const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
          const hit = document.elementFromPoint(x, y);
          return hit && trigger.contains(hit) ? { x, y } : null;
        });
        if (!pointer) continue;
        // Hover opens a sheet that may cover its own trigger. Move the real
        // pointer once; locator.hover's repeated hit checks can fight that success.
        await page.mouse.move(pointer.x, pointer.y);
        try {
          const outcomeHandle = await page.waitForFunction(({ expectedLevel, rowSelector }) => {
            const inspector = document.querySelector('#live-head-inspector:not([hidden])');
            if (inspector?.dataset.liveHeadLevel === expectedLevel) return 'opened';
            if (inspector?.dataset.liveHeadLevel) return 'different';
            const expectedInfo = document.querySelector(`#live-head-stack .live-head-row[data-live-head-level="${expectedLevel}"] .live-head-info`);
            const currentLevel = document.querySelector(rowSelector)?.dataset.liveHeadLevel || '';
            if (!expectedInfo || currentLevel !== expectedLevel || !expectedInfo.matches(':hover')) return 'replaced';
            return '';
          }, { expectedLevel: level, rowSelector }, { timeout: 15000 });
          const outcome = await outcomeHandle.jsonValue();
          if (outcome === 'opened') return { level, info };
        } catch (error) {
          lastState = await page.evaluate((expectedLevel) => {
            const inspector = document.getElementById('live-head-inspector');
            const hoveredInfo = document.querySelector(`#live-head-stack .live-head-row[data-live-head-level="${expectedLevel}"] .live-head-info`);
            return {
              expectedLevel,
              hovered: Boolean(hoveredInfo?.matches(':hover')),
              expanded: hoveredInfo?.getAttribute('aria-expanded') || '',
              inspectorHidden: inspector?.hidden ?? null,
              inspectorLevel: inspector?.dataset.liveHeadLevel || '',
              modalActive: document.getElementById('network-health-modal')?.classList.contains('active') || false,
              rowLevels: Array.from(document.querySelectorAll('#live-head-stack .live-head-row[data-live-head-level]')).map((row) => row.dataset.liveHeadLevel)
            };
          }, level);
          continue;
        }
        lastState = await page.evaluate((expectedLevel) => ({
          expectedLevel,
          rowLevels: Array.from(document.querySelectorAll('#live-head-stack .live-head-row[data-live-head-level]')).map((row) => row.dataset.liveHeadLevel),
          inspectorLevel: document.getElementById('live-head-inspector')?.dataset.liveHeadLevel || ''
        }), level);
        if (await page.evaluate(() => !document.getElementById('live-head-inspector')?.hidden)) {
          await page.keyboard.press('Escape');
          await page.waitForFunction(() => document.getElementById('live-head-inspector')?.hidden === true
            && !document.getElementById('live-head')?.dataset.readingPaused, null, { timeout: 10000 });
        }
      }
      throw new Error(`network health chamber: current Live Head row kept changing before inspection ${JSON.stringify(lastState)}`);
    };
    const enterLiveHeadInspector = async () => {
      // The close delay may elapse between the preceding visibility receipt and
      // this handoff on a slow hosted runner. The keyed level remains on the
      // hidden inspector so the loop can deliberately reopen that exact row.
      const expectedLevel = await page.locator('#live-head-inspector').getAttribute('data-live-head-level', { timeout: 5000 });
      assert(expectedLevel, 'network health chamber: Live Head inspector handoff is missing its keyed level');
      let lastState = null;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        let stage = 'reacquire-trigger';
        try {
          const trigger = page.locator(`#live-head-stack .live-head-row[data-live-head-level="${expectedLevel}"] .live-head-info`);
          // A stale close timer can hide the inspector while leaving its trigger
          // focused. Reacquire its live geometry, then invoke the same click
          // handler without letting Playwright's pointer preflight create a new
          // pointerout/scroll close race.
          await trigger.scrollIntoViewIfNeeded({ timeout: 5000 });
          stage = 'reopen-keyed-inspector';
          await trigger.evaluate((element) => element.click());
          stage = 'wait-for-keyed-geometry';
          await page.waitForFunction((level) => {
            const row = document.querySelector(`#live-head-stack .live-head-row[data-live-head-level="${level}"]`);
            const inspector = document.querySelector(`#live-head-inspector:not([hidden])[data-live-head-level="${level}"]`);
            const rect = inspector?.getBoundingClientRect();
            return Boolean(row && inspector && rect && rect.width > 32 && rect.height > 32);
          }, expectedLevel, { timeout: 5000 });
          const inspector = page.locator(`#live-head-inspector:not([hidden])[data-live-head-level="${expectedLevel}"]`);
          stage = 'sample-live-hit-point';
          const pointer = await inspector.evaluate((openInspector) => {
            const rect = openInspector.getBoundingClientRect();
            const candidates = [
              [0.5, 0.08], [0.25, 0.08], [0.75, 0.08],
              [0.5, 0.25], [0.25, 0.25], [0.75, 0.25],
              [0.5, 0.5], [0.25, 0.5], [0.75, 0.5]
            ];
            for (const [xRatio, yRatio] of candidates) {
              const x = Math.max(1, Math.min(innerWidth - 1, rect.left + rect.width * xRatio));
              const y = Math.max(1, Math.min(innerHeight - 1, rect.top + rect.height * yRatio));
              const hit = document.elementFromPoint(x, y);
              if (hit && openInspector.contains(hit)) return { x, y };
            }
            return null;
          });
          if (!pointer) throw new Error('inspector has no live hit-tested entry point');
          stage = 'enter-live-hit-point';
          await page.mouse.move(pointer.x, pointer.y);
          await page.waitForFunction(({ level, x, y }) => {
            const openInspector = document.querySelector(`#live-head-inspector:not([hidden])[data-live-head-level="${level}"]`);
            const hit = document.elementFromPoint(x, y);
            return Boolean(openInspector && hit && openInspector.contains(hit) && openInspector.matches(':hover'));
          }, { level: expectedLevel, ...pointer }, { timeout: 5000 });
          stage = 'focus-inspector-receipt';
          // A reader's trusted keyboard input ends an earlier Chamber's pending
          // opener restore. Programmatic focus alone has no such input receipt
          // and may be reclaimed during its remaining 24 animation frames.
          await inspector.locator('a, button, [tabindex]:not([tabindex="-1"])').first().press('Tab', { timeout: 5000 });
          stage = 'settle-inspector-handoff';
          await page.waitForFunction((level) => {
            const openInspector = document.querySelector(`#live-head-inspector:not([hidden])[data-live-head-level="${level}"]`);
            return Boolean(openInspector?.contains(document.activeElement))
              && openInspector.getAnimations().every((animation) => (
                animation.playState !== 'running' && animation.playState !== 'pending'
              ));
          }, expectedLevel, { timeout: 5000 });
          return;
        } catch (error) {
          lastState = await page.evaluate(({ level, message, stage }) => {
            const inspector = document.getElementById('live-head-inspector');
            const row = document.querySelector(`#live-head-stack .live-head-row[data-live-head-level="${level}"]`);
            const rect = inspector?.getBoundingClientRect();
            return {
              level,
              rowPresent: Boolean(row),
              inspectorHidden: inspector?.hidden ?? null,
              inspectorLevel: inspector?.dataset.liveHeadLevel || '',
              width: rect?.width || 0,
              height: rect?.height || 0,
              focused: Boolean(inspector?.contains(document.activeElement)),
              hovered: Boolean(inspector?.matches(':hover')),
              triggerFocused: Boolean(row?.querySelector('.live-head-info') === document.activeElement),
              triggerExpanded: row?.querySelector('.live-head-info')?.getAttribute('aria-expanded') || '',
              stage,
              error: message
            };
          }, { level: expectedLevel, message: error.message, stage });
          await page.waitForTimeout(80);
        }
      }
      throw new Error(`network health chamber: Live Head inspector handoff never stabilized ${JSON.stringify(lastState)}`);
    };
    const clickLiveHeadInspectorTarget = async (selector) => {
      const target = page.locator(`#live-head-inspector:not([hidden]) ${selector}`);
      await target.scrollIntoViewIfNeeded({ timeout: 5000 });
      assert(await page.locator('#live-head-inspector:not([hidden])').isVisible(), 'network health chamber: internal receipt scroll closed the inspector reading lock');
      const box = await target.boundingBox({ timeout: 5000 });
      assert(box && box.width > 4 && box.height > 4, `network health chamber: inspector target has no real hit area: ${selector}`);
      await page.mouse.click(box.x + (box.width / 2), box.y + (box.height / 2));
    };
    await liveHeadCurrentFirstRow.scrollIntoViewIfNeeded();
    await page.waitForTimeout(180);
    await page.mouse.move(1, 1);
    await liveHeadCurrentFirstRow.hover();
    await page.waitForTimeout(180);
    assert(await page.evaluate(() => document.querySelector('#live-head-inspector')?.hidden === true), 'network health chamber: ordinary row hover must not open the block inspector');
    await openCurrentLiveHeadInspector({ x: 1, y: 1 });
    const liveHeadInspectorState = await page.evaluate(() => {
      const inspector = document.querySelector('#live-head-inspector:not([hidden])');
      const row = document.querySelector('#live-head-stack .live-head-row[data-live-head-level]');
      const inspectorLevel = inspector?.dataset.liveHeadLevel || '';
      const inspectorRow = inspectorLevel
        ? document.querySelector(`#live-head-stack .live-head-row[data-live-head-level="${inspectorLevel}"]`)
        : null;
      const rect = inspector?.getBoundingClientRect();
      const infoRect = row?.querySelector('.live-head-info')?.getBoundingClientRect();
      const facts = Array.from(inspector?.querySelectorAll('.live-head-inspector-fact') || []);
      return {
        ariaHidden: inspector?.getAttribute('aria-hidden') || '',
        infoExpanded: row?.querySelector('.live-head-info')?.getAttribute('aria-expanded') || '',
        inspectorLevel,
        firstRowLevel: row?.dataset.liveHeadLevel || '',
        inspectorRowExpanded: inspectorRow?.querySelector('.live-head-info')?.getAttribute('aria-expanded') || '',
        readingPaused: document.getElementById('live-head')?.dataset.readingPaused || '',
        pendingLevel: document.getElementById('live-head')?.dataset.liveHeadPendingLevel || '',
        rowHasNativeTitle: row?.hasAttribute('title') || false,
        infoHasNativeTitle: row?.querySelector('.live-head-info')?.hasAttribute('title') || false,
        contained: Boolean(rect && rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight),
        alignedToInfo: Boolean(rect && infoRect && infoRect.left >= rect.left - 1 && infoRect.right <= rect.right + 1),
        levelHref: inspector?.querySelector('.live-head-inspector-level')?.href || '',
        producerTzkt: inspector?.querySelector('.live-head-inspector-identity a[href^="https://tzkt.io/"]')?.href || '',
        producerMyTezos: inspector?.querySelector('.live-head-inspector-identity a[href*="#my-baker="]')?.getAttribute('href') || '',
        factCount: facts.length,
        allFactsTzkt: facts.length > 0 && facts.every((fact) => fact.href.startsWith('https://tzkt.io/')),
        operationFacts: facts.filter((fact) => /\/operations\/?$/.test(new URL(fact.href).pathname)).length,
        missedTzkt: inspector?.querySelectorAll('.live-head-inspector-miss a[href^="https://tzkt.io/"]').length || 0,
        missedMyTezos: inspector?.querySelectorAll('.live-head-inspector-miss a[href*="#my-baker="]').length || 0,
        footerHref: inspector?.querySelector('[data-live-head-open-health]')?.getAttribute('href') || '',
        text: inspector?.textContent?.replace(/\s+/g, ' ').trim() || ''
      };
    });
    assert(
      liveHeadInspectorState.ariaHidden === 'false'
        && liveHeadInspectorState.infoExpanded === 'true'
        && !liveHeadInspectorState.rowHasNativeTitle
        && liveHeadInspectorState.infoHasNativeTitle
        && liveHeadInspectorState.contained
        && liveHeadInspectorState.alignedToInfo,
      `network health chamber: Live Head info-triggered inspector geometry/semantics failed ${JSON.stringify(liveHeadInspectorState)}`
    );
    assert(/https:\/\/tzkt\.io\/\d+\/?$/.test(liveHeadInspectorState.levelHref)
        && /^https:\/\/tzkt\.io\/tz[1-4]/.test(liveHeadInspectorState.producerTzkt)
        && /^\/#my-baker=tz[1-4]/.test(liveHeadInspectorState.producerMyTezos), `network health chamber: producer/block receipt links are incomplete ${JSON.stringify(liveHeadInspectorState)}`);
    assert(liveHeadInspectorState.factCount >= 12
        && liveHeadInspectorState.allFactsTzkt
        && liveHeadInspectorState.operationFacts >= 5, `network health chamber: complete block facts are incomplete ${JSON.stringify(liveHeadInspectorState)}`);
    assert(/Complete block receipt.*Produced by.*Block round.*Payload round.*Cadence.*Attested.*Quorum.*Missed power.*Block activity.*Transactions.*Contract calls.*Staking ops.*Fees.*Rewards \+ bonus.*Block contents.*Missed attestations.*Open Network Health Chamber/i.test(liveHeadInspectorState.text)
        && liveHeadInspectorState.footerHref === '#health', `network health chamber: inspector receipt copy/footer is incomplete ${JSON.stringify(liveHeadInspectorState)}`);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('#live-head-inspector')?.hidden === true
      && !document.querySelector('#live-head')?.dataset.readingPaused, null, { timeout: 10000 });
    await openCurrentLiveHeadInspector({ x: 5, y: 5 }, '#live-head-stack .live-head-row:has(.live-head-story[data-miss-state="resolved"])');
    await enterLiveHeadInspector();
    await page.waitForFunction(() => {
      const inspector = document.querySelector('#live-head-inspector:not([hidden])');
      return Boolean(inspector?.dataset.liveHeadLevel)
        && inspector.querySelectorAll('.live-head-inspector-miss a[href^="https://tzkt.io/"]').length > 0;
    }, null, { timeout: 5000 });
    const liveHeadMissedLevel = await page.locator('#live-head-inspector:not([hidden])').getAttribute('data-live-head-level');
    assert(liveHeadMissedLevel, 'network health chamber: resolved missed-attester row is missing its keyed level');
    const liveHeadMissedRow = page.locator(`#live-head-stack .live-head-row[data-live-head-level="${liveHeadMissedLevel}"]`);
    const liveHeadMissedSnapshot = await liveHeadMissedRow.evaluate((row) => {
      try { return JSON.parse(row.dataset.liveHeadMissedSnapshot || 'null'); } catch { return null; }
    });
    assert(Number(liveHeadMissedSnapshot?.level) === Number(liveHeadMissedLevel)
        && liveHeadMissedSnapshot?.state === 'resolved'
        && liveHeadMissedSnapshot.attesters?.length > 0, `network health chamber: resolved row must own its immutable missed-attester receipt ${JSON.stringify(liveHeadMissedSnapshot)}`);
    assert(await page.locator('#live-head-inspector:not([hidden])').getAttribute('data-live-head-level') === liveHeadMissedLevel,
      'network health chamber: resolved missed-attester receipt must remain locked to its source row');
    const missedInspectorLinkState = await page.evaluate(() => ({
      tzkt: document.querySelectorAll('#live-head-inspector:not([hidden]) .live-head-inspector-miss a[href^="https://tzkt.io/"]').length,
      myTezos: document.querySelectorAll('#live-head-inspector:not([hidden]) .live-head-inspector-miss a[href*="#my-baker="]').length,
      identities: document.querySelectorAll('#live-head-inspector:not([hidden]) .live-head-inspector-miss').length
    }));
    assert(missedInspectorLinkState.identities >= 1
        && missedInspectorLinkState.tzkt === missedInspectorLinkState.identities
        && missedInspectorLinkState.myTezos === missedInspectorLinkState.identities, `network health chamber: every missed attester needs paired TzKT and My Tezos links ${JSON.stringify(missedInspectorLinkState)}`);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('#live-head-inspector')?.hidden === true
      && !document.querySelector('#live-head')?.dataset.readingPaused, null, { timeout: 10000 });
    await liveHeadCurrentFirstInfo.focus();
    await page.locator('#live-head-inspector:not([hidden])').waitFor({ state: 'visible', timeout: 15000 });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('#live-head-inspector')?.hidden === true
      && !document.querySelector('#live-head')?.dataset.readingPaused, null, { timeout: 10000 });
    await openCurrentLiveHeadInspector({ x: 2, y: 2 });
    await enterLiveHeadInspector();
    await clickLiveHeadInspectorTarget('[data-live-head-open-health]');
    await page.locator('#network-health-modal.active .health-content').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('#network-health-modal.active .chamber-close').click();
    await page.waitForFunction(() => !document.querySelector('#network-health-modal')?.classList.contains('active'), null, { timeout: 5000 });
    await openCurrentLiveHeadInspector({ x: 3, y: 3 });
    await enterLiveHeadInspector();
    await clickLiveHeadInspectorTarget('.live-head-inspector-kicker');
    await page.locator('#network-health-modal.active .health-content').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('#network-health-modal.active .chamber-close').click();
    await page.waitForFunction(() => !document.querySelector('#network-health-modal')?.classList.contains('active'), null, { timeout: 5000 });

    await openCurrentLiveHeadInspector({ x: 4, y: 4 });
    await enterLiveHeadInspector();
    await page.mouse.move(1, 1);
    await page.waitForTimeout(500);
    const readingPauseBefore = await page.evaluate(() => {
      const panel = document.querySelector('#live-head');
      const stack = document.querySelector('#live-head-stack');
      const first = stack?.querySelector('.live-head-row[data-live-head-level]');
      window.__liveHeadReadingLockRow = first;
      return {
        level: Number(panel?.dataset.heartbeatLevel || 0),
        inspectorLevel: document.querySelector('#live-head-inspector')?.dataset.liveHeadLevel || '',
        signature: stack?.dataset.liveHeadSignature || '',
        levels: Array.from(stack?.querySelectorAll('.live-head-row[data-live-head-level]') || []).map((row) => row.dataset.liveHeadLevel),
        age: first?.querySelector('.live-head-age')?.textContent?.trim() || '',
        paused: panel?.dataset.readingPaused || '',
        inspectorHidden: document.getElementById('live-head-inspector')?.hidden ?? true,
        inspectorFocused: Boolean(document.getElementById('live-head-inspector')?.contains(document.activeElement))
      };
    });
    assert(
      readingPauseBefore.paused === 'true'
        && !readingPauseBefore.inspectorHidden
        && readingPauseBefore.inspectorFocused,
      `network health chamber: focused inspector did not retain its reading lock after pointer exit ${JSON.stringify(readingPauseBefore)}`
    );
    mockState.advanceBlockHead();
    await page.evaluate(async () => {
      const { versionedAsset } = await import('/js/core/asset-version.js');
      const { refreshNetworkHealth } = await import(versionedAsset('/js/features/network-health.js'));
      await refreshNetworkHealth({ force: true });
      await refreshNetworkHealth({ force: true });
    });
    await page.waitForFunction((previousLevel) => {
      const panel = document.querySelector('#live-head');
      return panel?.dataset.readingPaused === 'true'
        && Number(panel.dataset.liveHeadPendingLevel || 0) > previousLevel;
    }, readingPauseBefore.level, { timeout: 30000 });
    await page.evaluate(() => {
      const timers = (window.__tezosSystemsIntervals || []).filter((item) => item.timeout === 1000);
      const realNow = Date.now;
      Date.now = () => realNow() + 5000;
      try {
        timers.forEach((timer) => timer?.handler?.());
      } finally {
        Date.now = realNow;
      }
    });
    const readingPausedState = await page.evaluate(() => {
      const panel = document.querySelector('#live-head');
      const stack = document.querySelector('#live-head-stack');
      const first = stack?.querySelector('.live-head-row[data-live-head-level]');
      return {
        paused: panel?.dataset.readingPaused || '',
        renderedLevel: Number(panel?.dataset.heartbeatLevel || 0),
        pendingLevel: Number(panel?.dataset.liveHeadPendingLevel || 0),
        inspectorLevel: document.querySelector('#live-head-inspector:not([hidden])')?.dataset.liveHeadLevel || '',
        signature: stack?.dataset.liveHeadSignature || '',
        levels: Array.from(stack?.querySelectorAll('.live-head-row[data-live-head-level]') || []).map((row) => row.dataset.liveHeadLevel),
        age: first?.querySelector('.live-head-age')?.textContent?.trim() || '',
        sameRow: first === window.__liveHeadReadingLockRow
      };
    });
    assert(readingPauseBefore.paused === 'true'
        && readingPausedState.paused === 'true'
        && readingPausedState.renderedLevel === readingPauseBefore.level
        && readingPausedState.pendingLevel > readingPauseBefore.level
        && readingPausedState.inspectorLevel === readingPauseBefore.inspectorLevel
        && readingPausedState.signature === readingPauseBefore.signature
        && readingPausedState.levels.join('|') === readingPauseBefore.levels.join('|')
        && readingPausedState.age === readingPauseBefore.age
        && readingPausedState.sameRow, `network health chamber: open block inspector did not freeze the exact Live Head reading state ${JSON.stringify({ readingPauseBefore, readingPausedState })}`);
    await page.mouse.move(1, 1);
    await page.mouse.click(1, 1);
    await page.waitForFunction((previousLevel) => {
      const panel = document.querySelector('#live-head');
      return document.querySelector('#live-head-inspector')?.hidden === true
        && !panel?.dataset.readingPaused
        && !panel?.dataset.liveHeadPendingLevel
        && Number(panel?.dataset.heartbeatLevel || 0) > previousLevel;
    }, readingPauseBefore.level, { timeout: 10000 });
    const readingResumedState = await page.evaluate(() => ({
      level: Number(document.querySelector('#live-head')?.dataset.heartbeatLevel || 0),
      pending: document.querySelector('#live-head')?.dataset.liveHeadPendingLevel || '',
      newRows: document.querySelectorAll('#live-head-stack .lb-row-new').length,
      exitRows: document.querySelectorAll('#live-head-stack .live-head-row-exiting').length,
      shifting: Array.from(document.querySelectorAll('#live-head-stack .live-head-row')).some((row) => row.getAnimations().some((animation) => animation.id === 'live-head-shift'))
    }));
    assert(readingResumedState.level > readingPauseBefore.level
        && readingResumedState.pending === ''
        && readingResumedState.newRows === 0
        && readingResumedState.exitRows === 0
        && !readingResumedState.shifting, `network health chamber: click-away did not release one motionless Live Head catch-up ${JSON.stringify(readingResumedState)}`);

    const rowClickLevel = await liveHeadCurrentFirstRow.getAttribute('data-live-head-level');
    const rowClickTarget = page.locator(`#live-head-stack .live-head-row[data-live-head-level="${rowClickLevel}"]`);
    await rowClickTarget.locator('.live-head-baker').click();
    await page.locator('#live-head-inspector:not([hidden])').waitFor({ state: 'visible', timeout: 5000 });
    assert(await page.evaluate((level) => document.querySelector('#live-head-inspector:not([hidden])')?.dataset.liveHeadLevel === level, rowClickLevel), 'network health chamber: clicking the body of a Live Head row must open that block inspector');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('#live-head-inspector')?.hidden === true
      && !document.querySelector('#live-head')?.dataset.readingPaused, null, { timeout: 10000 });
    mockState.advanceBlockHead();
    mockState.setBlockHeadLag(0);
    await page.locator('#live-head-button').click();
    await page.locator('#network-health-modal.active .health-content').waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForFunction(() => document.querySelector('#live-head')?.dataset.chainState === 'live' && document.querySelector('#live-head-alert')?.hidden === true, null, { timeout: 10000 });
    assert(/block production resumed/i.test(await page.locator('#chain-stall-announcer').textContent() || ''), 'network health chamber: a genuinely newer fresh head did not announce and clear the latched stall');
    const liveHeadResumedGeometry = await page.locator('#live-head').evaluate((element) => ({
      height: element.getBoundingClientRect().height,
      viewportWidth: innerWidth,
      mobile: matchMedia('(max-width: 719px)').matches,
      expanded: element.dataset.liveHeadExpanded || '',
      rows: Array.from(element.querySelectorAll('#live-head-stack .live-head-row')).map((row) => ({
        level: row.getAttribute('data-live-head-level') || '',
        display: getComputedStyle(row).display,
        height: row.getBoundingClientRect().height,
        exiting: row.classList.contains('live-head-row-exiting')
      }))
    }));
    assert(Math.abs(liveHeadResumedGeometry.height - healthState.liveHeadHeight) <= 1, `network health chamber: delayed/stalled hierarchy changed the Live Head outer height ${healthState.liveHeadHeight}/${JSON.stringify(liveHeadResumedGeometry)}`);
    await page.locator('#network-health-modal.active .chamber-close').click();
    await page.waitForFunction(() => !document.querySelector('#network-health-modal')?.classList.contains('active'), null, { timeout: 5000 });
    await page.locator('#cycle-chip').click();
    await page.locator('#network-health-modal.active .health-content').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('#network-health-modal.active .chamber-close').click();
    await page.waitForFunction(() => !document.querySelector('#network-health-modal')?.classList.contains('active'), null, { timeout: 5000 });
    const healthOpenButton = page.locator('[data-stat="network-health"] .chamber-expand-cue');
    await healthOpenButton.focus();
    await healthOpenButton.click();
    await page.locator('#network-health-modal.active .health-content').waitFor({ state: 'visible', timeout: 10000 });
    // The visible loading view still replaces its controls on the first render.
    // Capture the focus boundary only after those data controls exist.
    await page.locator('#network-health-modal.active[data-health-live="true"] .health-body[data-health-rendered="true"]').waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForFunction(() => document.activeElement === document.querySelector('#network-health-modal.active .chamber-close'), null, { timeout: 5000 });
    await page.evaluate(() => {
      const overlay = document.querySelector('#network-health-modal.active');
      const focusable = [...(overlay?.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])') || [])]
        .filter((element) => element.getClientRects().length > 0 && element.getAttribute('aria-hidden') !== 'true');
      window.__healthLastFocusable = focusable.at(-1) || null;
      window.__healthLastFocusable?.focus();
    });
    await page.keyboard.press('Tab');
    assert(await page.evaluate(() => document.activeElement === document.querySelector('#network-health-modal .chamber-close')), 'network health chamber: Tab did not wrap from the last control to the close button');
    await page.keyboard.press('Shift+Tab');
    assert(await page.evaluate(() => document.activeElement === window.__healthLastFocusable), 'network health chamber: Shift+Tab did not wrap from the close button to the last control');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#network-health-modal')?.classList.contains('active'), null, { timeout: 5000 });
    try {
      await page.waitForFunction(() => document.activeElement === document.querySelector('[data-stat="network-health"] .chamber-expand-cue'), null, { timeout: 5000 });
    } catch (error) {
      const focusState = await page.evaluate(async () => {
        const target = document.querySelector('[data-stat="network-health"] .chamber-expand-cue');
        const active = document.activeElement;
        const overlayApi = await import('/js/ui/overlay-stack.js');
        return {
          active: active?.id || active?.className || active?.tagName || '',
          activeConnected: active?.isConnected || false,
          activeInert: Boolean(active?.closest?.('[inert]')),
          overlayActive: document.querySelector('#network-health-modal')?.classList.contains('active') || false,
          stackDepth: overlayApi.activeOverlayCount(),
          targetConnected: target?.isConnected || false,
          targetInert: Boolean(target?.closest?.('[inert]')),
          targetRects: target?.getClientRects().length || 0,
          targetVisibility: target ? getComputedStyle(target).visibility : '',
          targetDisabled: Boolean(target?.disabled)
        };
      });
      throw new Error(`network health chamber: Escape did not restore the exact launcher ${JSON.stringify(focusState)}\n${error.message}`);
    }
    assert(await page.evaluate(() => document.querySelector('#network-health-modal')?.getAttribute('aria-hidden') === 'true'), 'network health chamber: closed dialog did not return to aria-hidden=true');

    await context.close();
    assert(issues.length === 0, `network health chamber browser issues:\n${issues.join('\n')}`);
    log('ok - network health chamber smoke');
  }

  return { smokeNetworkHealthInteractivePriority, smokeLiveHeadThemeGeometry, smokeNetworkHealthChamber };
}
