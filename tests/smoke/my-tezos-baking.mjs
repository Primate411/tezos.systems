// Browser workflows owned by my-tezos-baking. Shared dependencies remain explicit.
export function createMyTezosBakingSmokeSuites({
  ARTIFACTS_DIR,
  OVERDELEGATED_ADDRESS,
  SAMPLE_ADDRESS,
  SAMPLE_ADDRESS_2,
  SAMPLE_DELEGATOR_ADDRESS,
  SAMPLE_HEAVY_STAKER_ADDRESS,
  SAMPLE_HISTORICAL_REWARDS_ADDRESS,
  SAMPLE_IDLE_ADDRESS,
  SAMPLE_REGULAR_DELEGATOR_ADDRESS,
  SAMPLE_SMALL_DELEGATOR_ADDRESS,
  SAMPLE_STAKER_ADDRESS,
  assert,
  attachIssueCollectors,
  chooseLiveHeadDepth,
  expectClassContains,
  expectCount,
  fulfillJson,
  getMyTezosRewardReport,
  installFeatureMocks,
  log,
  openDropdown,
  path,
  revealMyTezosAccountControls,
  sampleBakers,
  waitForIntentionalRealTime
}) {
  async function smokeMyTezosBakerActivity(browser, baseUrl) {
    const issues = [];
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      serviceWorkers: 'block'
    });
    await context.grantPermissions(['clipboard-write'], { origin: baseUrl });
    await installFeatureMocks(context, { myTezosAccountDelayMs: 1200 });
    await context.addInitScript((address) => {
      localStorage.setItem('tezos-systems-theme', 'matrix');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
      localStorage.setItem('tezos-systems-overnight-snapshot', JSON.stringify({
        ts: Date.now() - (7 * 60 * 60 * 1000),
        address,
        balance: 100,
        staked: 0,
        xtzPrice: 0.2,
        usdValue: 20,
        rewardsLastCycle: 0,
        latestRewardCycle: null,
        rewardStreak: 0,
        bakerName: 'Smoke Baker',
        healthScore: 90,
        attestRate: 90,
        apyRate: 5
      }));
      const yesterday = new Date(Date.now() - (24 * 60 * 60 * 1000)).toISOString().slice(0, 10);
      localStorage.setItem('tezos-systems-daily-snapshot', JSON.stringify({
        day: yesterday,
        capturedAt: Date.now() - (24 * 60 * 60 * 1000),
        stats: {
          tz4Bakers: 1,
          totalBakers: 1,
          totalDelegators: 1,
          totalStakers: 1,
          totalBurned: 1,
          smartContracts: 1,
          stakeAPY: 1,
          lbEmaPct: 1,
          lbSubsidyDisabled: false
        }
      }));
    }, SAMPLE_ADDRESS);

    const page = await context.newPage();
    attachIssueCollectors(page, 'my tezos baker activity', issues);

    const response = await page.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `my tezos baker activity: dashboard failed with HTTP ${response?.status()}`);
    await page.locator('main').waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForFunction(() => document.getElementById('pulse-ticker-strip')?.dataset.pulseState === 'ready', null, { timeout: 15000 });

    await page.locator('#my-tezos-btn').click();
    await page.locator('#my-tezos-drawer.open').waitFor({ state: 'visible', timeout: 15000 });
    await expectClassContains(page.locator('#my-tezos-drawer'), 'open', 'my tezos baker activity drawer');
    await page.locator('#drawer-address-input').fill(SAMPLE_ADDRESS);
    await page.locator('#drawer-connect-btn').click();
    await page.waitForFunction(() => {
      return document.querySelectorAll('#drawer-brief .drawer-loading-card').length === 1
        && document.querySelectorAll('#drawer-baker-brief .drawer-loading-card').length === 3
        && document.querySelectorAll('#my-baker-results .my-baker-loading-stat').length === 17;
    }, null, { timeout: 5000 });
    const loadingLayout = await page.evaluate(() => {
      const brief = document.querySelector('#drawer-brief')?.getBoundingClientRect();
      const rewards = document.querySelector('#drawer-rewards')?.getBoundingClientRect();
      const baker = document.querySelector('#drawer-baker')?.getBoundingClientRect();
      return {
        columns: document.querySelectorAll('.drawer-live-columns > .drawer-live-column').length,
        briefHeight: Math.round(brief?.height || 0),
        rewardsHeight: Math.round(rewards?.height || 0),
        bakerHeight: Math.round(baker?.height || 0),
        loadingCards: document.querySelectorAll('.drawer-loading-card').length,
        loadingStats: document.querySelectorAll('.my-baker-loading-stat').length
      };
    });
    assert(
      loadingLayout.columns === 2
        && loadingLayout.briefHeight >= 150
        && loadingLayout.rewardsHeight >= 300
        && loadingLayout.bakerHeight === 0
        && loadingLayout.loadingCards >= 4
        && loadingLayout.loadingStats === 17,
      `my tezos baker activity: first account read did not hold a shape-correct two-column frame ${JSON.stringify(loadingLayout)}`
    );
    await page.locator('#my-tezos-tab-baker-signal').click();
    assert(await page.locator('#drawer-baker').evaluate((node) => node.getBoundingClientRect().height >= 480), 'Baker Signal must preserve the baker loading frame');
    try {
      await page.waitForFunction(() => {
        const text = document.querySelector('#drawer-baker-activity')?.textContent || '';
        return text.includes('Fresh Delegator') && text.includes('Fresh Staker');
      }, null, { timeout: 15000 });
    } catch (error) {
      const activityText = await page.locator('#drawer-baker-activity').textContent().catch(() => '');
      throw new Error(`my tezos baker activity did not settle: ${activityText || '(empty)'}\n${issues.join('\n')}\n${error.message}`);
    }

    const bakerActivityText = (await page.locator('#drawer-baker-activity').innerText()).toLowerCase();
    assert(bakerActivityText.includes('latest delegators'), 'my tezos baker activity: should list latest delegators');
    assert(bakerActivityText.includes('latest stakers'), 'my tezos baker activity: should list latest stakers');
    await expectCount(page, '#drawer-baker-activity .drawer-activity-row', 2, 'my tezos baker activity');
    await page.waitForFunction((address) => (
      window._myTezosData?.fullAddress === address
        && document.querySelector('#drawer-network .network-away-card')
    ), SAMPLE_ADDRESS, { timeout: 15000 });
    const overnightState = await page.evaluate(() => ({
      cardCount: document.querySelectorAll('#drawer-network .network-away-card').length,
      sectionCount: document.querySelectorAll('#drawer-network .network-away-card .network-away-sections section').length,
      accountBullets: document.querySelectorAll('#drawer-network [data-away-section="account"] .overnight-bullet').length,
      networkBullets: document.querySelectorAll('#drawer-network [data-away-section="network"] .overnight-bullet').length,
      text: document.querySelector('#drawer-network .network-away-card')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      isLast: document.querySelector('#drawer-network .network-live-column')?.lastElementChild?.matches('[data-network-away-slot]') === true,
      briefCards: document.querySelectorAll('#drawer-brief .brief-section-overnight').length,
      fullAddress: window._myTezosData?.fullAddress || '',
      snapshot: localStorage.getItem('tezos-systems-overnight-snapshot') || ''
    }));
    assert(
      overnightState.cardCount === 1
        && overnightState.sectionCount === 2
        && overnightState.accountBullets >= 1
        && overnightState.accountBullets <= 3
        && overnightState.networkBullets >= 1
        && overnightState.networkBullets <= 2
        && overnightState.isLast
        && overnightState.briefCards === 0
        && /while you were away/i.test(overnightState.text)
        && /your account/i.test(overnightState.text)
        && /tezos network/i.test(overnightState.text)
        && /since yesterday/i.test(overnightState.text),
      `my tezos baker activity: structured while-away account/network report did not reconcile ${JSON.stringify(overnightState)}`
    );

    await page.locator('#my-tezos-tab-baker-signal').click();
    await page.waitForFunction(() => {
      const text = (document.querySelector('#drawer-operator-status')?.innerText || '').toLowerCase();
      return text.includes('next round 0') && text.includes('back online') && text.includes('last 10 attestations ok') && text.includes('v25.0');
    }, null, { timeout: 15000 });
    const operatorText = (await page.locator('#drawer-operator-status').innerText()).toLowerCase();
    const operatorOctezState = await page.evaluate(() => {
      const tile = Array.from(document.querySelectorAll('#drawer-operator-status .drawer-operator-tile'))
        .find((item) => (item.textContent || '').toLowerCase().includes('octez'));
      return {
        text: tile?.textContent || '',
        className: tile?.className || ''
      };
    });
    assert(operatorText.includes('next round 0'), 'my tezos baker activity: should show the next round 0 band prominently');
    assert(operatorText.includes('18m'), `my tezos baker activity: should estimate next block ETA, saw: ${operatorText}`);
    assert(operatorText.includes('back online'), 'my tezos baker activity: should show recovered baker state from fresh attestations');
    assert(!operatorText.includes('round 5'), `my tezos baker activity: should not surface nonzero-round baking rights, saw: ${operatorText}`);
    assert(operatorText.includes('octez') && operatorText.includes('v25.0'), 'my tezos baker activity: should show the baker Octez version');
    assert(operatorOctezState.className.includes('drawer-operator-watch') && operatorOctezState.text.includes('v25.1'), `my tezos baker activity: stale same-major Octez version should be yellow/watch ${JSON.stringify(operatorOctezState)}`);
    assert(operatorText.includes('attestation') && operatorText.includes('100.0%'), 'my tezos baker activity: should show prominent attestation rate');
    assert(operatorText.includes('dal') && operatorText.includes('14/14 dal slots'), 'my tezos baker activity: should show prominent DAL participation');

    await page.locator('#my-tezos-tab-overview').click();
    const settledLayout = await page.evaluate(() => {
      const network = document.querySelector('#drawer-network')?.getBoundingClientRect();
      const more = document.getElementById('drawer-more-section')?.getBoundingClientRect();
      return {
        rewardsColumn: document.querySelector('#drawer-rewards')?.parentElement?.className || '',
        bakerPanel: document.querySelector('#drawer-baker')?.closest('[data-my-tezos-panel]')?.dataset.myTezosPanel,
        bakerBriefPanel: document.querySelector('#drawer-baker-brief')?.closest('[data-my-tezos-panel]')?.dataset.myTezosPanel,
        activityPanel: document.querySelector('#drawer-baker-activity')?.closest('[data-my-tezos-panel]')?.dataset.myTezosPanel,
        overviewBakerCards: document.querySelectorAll('#my-tezos-panel-overview .brief-section-baker, #my-tezos-panel-overview .brief-section-governance, #my-tezos-panel-overview .capacity-bars, #my-tezos-panel-overview .my-baker-grid').length,
        personalBriefColumn: document.querySelector('#drawer-brief')?.parentElement?.className || '',
        journeyBeforeNetwork: network && more ? more.bottom <= network.top : false,
        moreInOverview: document.getElementById('drawer-more-section')?.closest('[data-my-tezos-panel]')?.dataset.myTezosPanel === 'overview',
        journeyCards: document.querySelectorAll('#drawer-more-actions .drawer-account-journey-card').length,
        secondaryContainers: document.querySelectorAll('#drawer-more-section-secondary').length,
        reportCards: document.querySelectorAll('#drawer-baker .report-card-btn').length,
        accountError: document.querySelector('#my-baker-results .my-baker-error')?.textContent || ''
      };
    });
    assert(
      settledLayout.rewardsColumn.includes('drawer-live-column-primary')
        && settledLayout.personalBriefColumn.includes('drawer-live-column-secondary')
        && settledLayout.bakerPanel === 'baker-signal'
        && settledLayout.bakerBriefPanel === 'baker-signal'
        && settledLayout.activityPanel === 'baker-signal'
        && settledLayout.overviewBakerCards === 0
        && settledLayout.journeyBeforeNetwork
        && settledLayout.moreInOverview
        && settledLayout.journeyCards === 2
        && settledLayout.secondaryContainers === 0
        && settledLayout.reportCards === 1
        && !settledLayout.accountError,
      `my tezos baker activity: full-width account journeys or independent stacks regressed ${JSON.stringify(settledLayout)}`
    );

    await revealMyTezosAccountControls(page);
    await page.locator('#my-baker-input').fill(SAMPLE_IDLE_ADDRESS);
    await page.locator('#my-baker-save').click();
    await page.waitForFunction((address) => {
      return window._myTezosData?.fullAddress === address
        && window._myTezosData?.bakerAddr == null
        && document.querySelector('#drawer-connected')?.classList.contains('is-without-baker')
        && document.querySelectorAll('#drawer-baker .report-card-btn').length === 0
        && document.querySelector('#drawer-network [data-away-section="network"]')
        && !document.querySelector('#drawer-network [data-away-section="account"]');
    }, SAMPLE_IDLE_ADDRESS, { timeout: 15000 });
    const networkOnlyAway = await page.evaluate(() => ({
      cards: document.querySelectorAll('#drawer-network .network-away-card').length,
      accountSections: document.querySelectorAll('#drawer-network [data-away-section="account"]').length,
      networkSections: document.querySelectorAll('#drawer-network [data-away-section="network"]').length,
      text: document.querySelector('#drawer-network .network-away-card')?.textContent?.replace(/\s+/g, ' ').trim() || ''
    }));
    assert(
      networkOnlyAway.cards === 1
        && networkOnlyAway.accountSections === 0
        && networkOnlyAway.networkSections === 1
        && /since yesterday/i.test(networkOnlyAway.text),
      `my tezos baker activity: daily deltas did not fall back to a network-only away report ${JSON.stringify(networkOnlyAway)}`
    );

    await context.close();
    assert(issues.length === 0, `my tezos baker activity browser issues:\n${issues.join('\n')}`);
    log('ok - my tezos baker activity smoke');
  }

  async function smokeMyTezosBakerLiveSignal(browser, baseUrl) {
    for (const { label, viewport, theme } of [
      { label: 'desktop', viewport: { width: 1440, height: 800 }, theme: 'matrix' },
      { label: 'mobile', viewport: { width: 390, height: 740 }, theme: 'clean' }
    ]) {
      const issues = [];
      const context = await browser.newContext({
        viewport,
        serviceWorkers: 'block'
      });
      await installFeatureMocks(context);
      let gradeParticipation = { expected_cycle_activity: 7000, minimal_cycle_activity: 5600, missed_slots: 0, missed_levels: 0, remaining_allowed_missed_slots: 1400 };
      await context.route('**/participation', route => fulfillJson(route, gradeParticipation));
      let softwareVersion = 'v25.0';
      let softwareUpdateTime = new Date(Date.now() - 3 * 86400000).toISOString();
      await context.route(`**/v1/delegates/${SAMPLE_ADDRESS}`, (route) => fulfillJson(route, {
        ...sampleBakers[0],
        software: { version: softwareVersion, date: '2026-06-16T11:58:56Z' },
        softwareUpdateTime
      }));
      let attestationStatuses = Array(10).fill('missed');
      let attestationHead = 12345670;
      let scheduleMode = 'complete';
      await context.route('**/v1/rights?**', (route) => {
        const query = new URL(route.request().url()).searchParams;
        if (query.get('type') === 'baking' && query.get('status') === 'future') {
          assert(query.get('round') === '0', 'Schedule must query round 0 only');
          assert(query.get('limit') === '100', 'Schedule must scan 100 assignments');
          assert(query.get('sort.asc') === 'level', 'Schedule must be ordered');
          assert(query.get('level.gt') === '12345678', 'Schedule must start beyond the confirmed head');
          if (scheduleMode === 'unavailable') return fulfillJson(route, null);
          return fulfillJson(route, Array.from({ length: scheduleMode === 'short' ? 2 : scheduleMode === 'empty' ? 0 : 100 }, (_, index) => ({
            level: 12345858 + index * 600, round: 0, status: 'future', type: 'baking'
          })));
        }
        if (query.get('type') !== 'attestation') return route.fallback();
        if (query.get('status') === 'missed' && query.has('cycle')) return route.fallback();
        return fulfillJson(route, attestationStatuses.map((status, index) => ({
          level: attestationHead - index,
          timestamp: new Date(Date.now() - index * 6000).toISOString(),
          slots: 1,
          status,
          type: 'attestation',
          baker: { address: SAMPLE_ADDRESS, alias: 'QA Baker' }
        })));
      });
      await context.addInitScript((theme) => {
        window.__MY_TEZOS_OPERATOR_REFRESH_MS__ = 1000;
        window.__MY_TEZOS_DRAWER_REFRESH_MS__ = 5000;
        window.__operatorVisibility = 'visible';
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.__operatorVisibility });
        window.__scheduleHiddenFetches = 0;
        const scheduleFetch = window.fetch.bind(window);
        window.fetch = (input, ...args) => {
          const url = new URL(typeof input === 'string' ? input : input.url, location.href);
          if (document.visibilityState === 'hidden' && url.pathname.endsWith('/rights') && url.searchParams.get('type') === 'baking' && url.searchParams.get('status') === 'future' && url.searchParams.get('limit') === '100') window.__scheduleHiddenFetches++;
          return scheduleFetch(input, ...args);
        };
        localStorage.setItem('tezos-systems-theme', theme);
        localStorage.setItem('tezos-toured', '1');
        localStorage.setItem('tezos-welcomed', '1');
        localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
      }, theme);

      const page = await context.newPage();
      attachIssueCollectors(page, 'my tezos baker live signal', issues);

      const response = await page.goto(`${baseUrl}/my/?view=baker-signal&theme=${theme}`, { waitUntil: 'domcontentloaded' });
      assert(response?.ok(), `my tezos baker live signal: dashboard failed with HTTP ${response?.status()}`);
      await page.locator('main').waitFor({ state: 'visible', timeout: 15000 });

      await page.locator('#my-tezos-drawer.open').waitFor({ state: 'visible', timeout: 15000 });
      await page.locator('#my-tezos-baker-signal-empty').waitFor({ state: 'visible' });
      assert(await page.locator('#my-tezos-tab-baker-signal').getAttribute('aria-selected') === 'true', 'Baker Signal direct route must select its tab');
      await page.locator('#my-tezos-baker-signal-overview').click();
      await page.locator('#drawer-address-input').fill(SAMPLE_DELEGATOR_ADDRESS);
      await page.locator('#drawer-connect-btn').click();
      await page.locator('#my-tezos-tab-baker-signal').click();

      const readSignalState = () => page.evaluate(() => ({
        operator: document.querySelector('#drawer-operator-status')?.innerText || '',
        freshness: document.querySelector('#drawer-freshness')?.innerText || ''
      }));

      try {
        await page.waitForFunction(() => {
          const text = (document.querySelector('#drawer-operator-status')?.innerText || '').toLowerCase();
          return text.includes('your baker signal · qa baker')
            && text.includes('check now')
            && text.includes('10/10 recent attestation issues');
        }, null, { timeout: 15000 });
      } catch {
        const state = await readSignalState();
        throw new Error(`my tezos baker live signal: initial stale state was not visible: ${JSON.stringify(state)}`);
      }

      await page.waitForFunction(() => document.querySelector('#drawer-operator-status')?.textContent.includes('first block on version 3d ago'), null, { timeout: 15000 });
      await page.waitForFunction(() => [...document.querySelectorAll('#my-baker-results [title]')]
        .some((node) => node.title.includes('TzKT first observed this baker produce a block with this version')), null, { timeout: 15000 });
      const softwareTooltip = await page.locator('#my-baker-results [title]').evaluateAll((nodes) => nodes.find((node) => node.title.includes('TzKT first observed this baker'))?.title || '');
      assert(softwareTooltip.includes(new Date(softwareUpdateTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }))
        && !softwareTooltip.includes('Jun 16'), `Baker Signal ${label}: tooltip used the global software date: ${softwareTooltip}`);

      await page.locator('.drawer-baker-grade[data-grade-state="current"] .grade-score').waitFor({ state: 'visible' });
      await page.locator('.drawer-grade-method summary').click();
      const gradeLayout = await page.evaluate(() => {
        const grade = document.querySelector('.drawer-baker-grade');
        const status = document.querySelector('#drawer-baker-brief .brief-section-baker');
        window.__bakerGrade = grade;
        window.__bakerGradeButton = grade.querySelector('.report-card-btn');
        return { grade: grade.getBoundingClientRect().toJSON(), status: status.getBoundingClientRect().toJSON(), text: grade.textContent, buttons: document.querySelectorAll('#drawer-baker .report-card-btn').length };
      });
      assert(gradeLayout.text.includes('Cycle participation') && gradeLayout.text.includes('100/100') && gradeLayout.text.includes('7,000') && gradeLayout.buttons === 1,
        `Baker Grade ${label}: missing evidence or duplicated report action ${JSON.stringify(gradeLayout)}`);
      assert(label === 'desktop' ? gradeLayout.grade.left >= gradeLayout.status.right && Math.abs(gradeLayout.grade.top - gradeLayout.status.top) < 1 : gradeLayout.grade.top >= gradeLayout.status.bottom,
        `Baker Grade ${label}: must sit to the right on desktop and stack on phones ${JSON.stringify(gradeLayout)}`);

      const before = await page.evaluate(() => {
        const panel = document.getElementById('drawer-operator-status');
        const body = document.getElementById('drawer-body');
        const tab = document.getElementById('my-tezos-tab-baker-signal');
        tab.focus({ preventScroll: true });
        const range = document.createRange();
        range.selectNodeContents(panel.querySelector('h3'));
        document.getSelection().removeAllRanges();
        document.getSelection().addRange(range);
        body.scrollTop = Math.min(80, body.scrollHeight - body.clientHeight);
        window.__bakerSignalPanel = panel.querySelector('.drawer-operator-panel');
        window.__bakerSignalTiles = Array.from(panel.querySelectorAll('.drawer-operator-tile'));
        return { top: body.scrollTop, pageY: window.scrollY, selection: document.getSelection().toString(), rail: tab.parentElement.scrollLeft };
      });

      softwareVersion = 'v25.1';
      softwareUpdateTime = new Date(Date.now() - 2 * 86400000).toISOString();
      await page.waitForFunction(() => {
        const octez = [...document.querySelectorAll('#drawer-operator-status .drawer-operator-tile')]
          .find((tile) => tile.querySelector('.drawer-operator-label')?.textContent === 'Octez');
        return octez?.querySelector('strong')?.textContent === 'v25.1'
          && octez.textContent.includes('first block on version 2d ago')
          && octez.classList.contains('drawer-operator-ok')
          && [...document.querySelectorAll('#my-baker-results .my-baker-stat')]
            .some((stat) => stat.textContent.includes('Octez') && stat.textContent.includes('v25.1'));
      }, null, { timeout: 15000 });

      // Advance the actual rights fixture only after each state is observed, so
      // polling/startup speed cannot skip over partial recovery or a relapse.
      for (const successful of [1, 2, 4]) {
        attestationHead++;
        attestationStatuses = [...Array(successful).fill('realized'), ...Array(10 - successful).fill('missed')];
        await page.waitForFunction(({ successful }) => {
          const panel = document.querySelector('#drawer-operator-status');
          const brief = document.querySelector('#drawer-baker-brief');
          const detail = `${10 - successful}/10 recent attestation issues · latest ${successful} OK`;
          return panel?.textContent.includes('Recovering') && panel.textContent.includes(detail)
            && brief?.querySelector('.drawer-status-summary [data-state="watch"]')?.textContent.includes('Recovering');
        }, { successful }, { timeout: 15000 }).catch(async (error) => {
          throw new Error(`Baker Signal ${label}: recovery did not settle ${JSON.stringify(await page.evaluate(() => ({
            operator: document.querySelector('#drawer-operator-status')?.textContent,
            brief: document.querySelector('#drawer-baker-brief')?.textContent,
            loading: window._myTezosData?.loading
          })))}: ${error.message}`);
        });
        const recovering = await page.evaluate(() => {
          const panel = document.querySelector('#drawer-operator-status');
          const tiles = [...panel.querySelectorAll('.drawer-operator-tile')];
          const working = tiles.find((tile) => tile.textContent.includes('Baker working?'));
          const attestation = tiles.find((tile) => tile.querySelector('.drawer-operator-label')?.textContent === 'Attestation');
          const brief = document.querySelector('#drawer-baker-brief .drawer-status-summary [data-state="watch"]');
          const body = document.getElementById('drawer-body');
          const tab = document.getElementById('my-tezos-tab-baker-signal');
          return {
            watch: working.classList.contains('drawer-operator-watch') && attestation.classList.contains('drawer-operator-watch'),
            sameTone: getComputedStyle(working.querySelector('strong')).color === getComputedStyle(brief).color,
            checkNow: panel.textContent.includes('Check now'),
            top: body.scrollTop, pageY: window.scrollY, rail: tab.parentElement.scrollLeft, selection: document.getSelection().toString(),
            sameTiles: tiles.every((tile, i) => tile === window.__bakerSignalTiles[i]),
            focused: document.activeElement === tab,
            visible: tiles.every((tile) => getComputedStyle(tile).opacity === '1' && getComputedStyle(tile).transform === 'none'),
            overflow: body.scrollWidth > body.clientWidth + 1
          };
        });
        assert(recovering.watch && recovering.sameTone && !recovering.checkNow && !recovering.overflow,
          `Baker Signal ${label}: partial recovery must agree across all status surfaces ${JSON.stringify(recovering)}`);
        assert(recovering.sameTiles && recovering.focused && recovering.visible
          && recovering.top === before.top && recovering.pageY === before.pageY
          && recovering.rail === before.rail && recovering.selection === before.selection,
        `Baker Signal ${label}: partial recovery moved the reader ${JSON.stringify({ before, recovering })}`);
        if (ARTIFACTS_DIR && successful === 4) {
          await page.screenshot({ path: path.join(ARTIFACTS_DIR, `baker-signal-recovering-${label}.png`) });
        }
      }

      // Even a lower issue count must remain urgent if the newest right is missed.
      attestationHead++;
      attestationStatuses = ['missed', ...Array(7).fill('realized'), 'missed', 'missed'];
      await page.waitForFunction(() => {
        const panel = document.querySelector('#drawer-operator-status');
        return panel?.textContent.includes('Check now') && panel.textContent.includes('3/10 recent attestation issues')
          && !panel.textContent.includes('Recovering') && document.querySelector('#drawer-baker-brief')?.textContent.includes('Check now');
      }, null, { timeout: 15000 });

      attestationHead++;
      attestationStatuses = Array(10).fill('realized');
      try {
        await page.waitForFunction(() => {
          const text = (document.querySelector('#drawer-operator-status')?.innerText || '').toLowerCase();
          const freshness = (document.querySelector('#drawer-freshness')?.innerText || '').toLowerCase();
          return text.includes('back online')
            && text.includes('your baker signal · qa baker')
            && text.includes('last 10 attestations ok')
            && freshness.includes('operator signal');
        }, null, { timeout: 15000 });
      } catch {
        const state = await readSignalState();
        throw new Error(`my tezos baker live signal: live recovery was not visible: ${JSON.stringify(state)}`);
      }

      const operatorText = (await page.locator('#drawer-operator-status').innerText()).toLowerCase();
      assert(operatorText.includes('your baker signal · qa baker'), `my tezos baker live signal: delegated baker identity was lost during refresh, saw: ${operatorText}`);
      assert(operatorText.includes('back online'), `my tezos baker live signal: open drawer did not recover live, saw: ${operatorText}`);
      assert(!operatorText.includes('check now'), `my tezos baker live signal: stale issue state remained visible, saw: ${operatorText}`);

      const after = await page.evaluate(() => {
        const panel = document.getElementById('drawer-operator-status');
        const body = document.getElementById('drawer-body');
        const tab = document.getElementById('my-tezos-tab-baker-signal');
        return {
          top: body.scrollTop, pageY: window.scrollY, selection: document.getSelection().toString(), rail: tab.parentElement.scrollLeft,
          samePanel: panel.querySelector('.drawer-operator-panel') === window.__bakerSignalPanel,
          gradePreserved: document.querySelector('.drawer-baker-grade') === window.__bakerGrade && document.querySelector('.drawer-grade-method').open && document.querySelector('.drawer-baker-grade .report-card-btn') === window.__bakerGradeButton,
          sameTiles: Array.from(panel.querySelectorAll('.drawer-operator-tile')).every((tile, i) => tile === window.__bakerSignalTiles[i]),
          focused: document.activeElement === tab,
          selected: tab.getAttribute('aria-selected'),
          visible: getComputedStyle(panel).opacity === '1' && panel.getBoundingClientRect().width > 0,
          emptyHidden: document.getElementById('my-tezos-baker-signal-empty').hidden,
          overflow: body.scrollWidth > body.clientWidth + 1,
          scope: document.getElementById('my-tezos-baker-signal-scope').textContent
        };
      });
      assert(after.gradePreserved && after.samePanel && after.sameTiles && after.focused && after.selected === 'true' && after.visible && after.emptyHidden,
        `Baker Signal ${label}: background refresh lost the visible keyed panel or tab state ${JSON.stringify(after)}`);
      assert(Math.abs(after.top - before.top) < 1 && after.pageY === before.pageY && after.rail === before.rail && after.selection === before.selection,
        `Baker Signal ${label}: background refresh moved the reader ${JSON.stringify({ before, after })}`);
      assert(!after.overflow && after.scope.includes('active wallet'), `Baker Signal ${label}: layout or wallet scope drifted ${JSON.stringify(after)}`);
      await page.locator('#drawer-baker-brief .brief-section-baker').waitFor({ state: 'visible', timeout: 15000 });
      await page.waitForFunction(() => document.querySelector('#drawer-operator-status')?.textContent.includes('Back online')
        && document.querySelector('#drawer-baker-brief')?.textContent.includes('Back online'), null, { timeout: 15000 });
      const ownership = await page.evaluate(() => ({
        allBakerPanelsOwned: ['drawer-baker', 'drawer-baker-activity', 'drawer-baker-brief', 'my-tezos-delegation-guidance']
          .every((id) => document.getElementById(id)?.closest('[data-my-tezos-panel]')?.dataset.myTezosPanel === 'baker-signal'),
        overviewBakerSections: document.querySelectorAll('#my-tezos-panel-overview .my-baker-grid, #my-tezos-panel-overview .capacity-bars, #my-tezos-panel-overview .brief-section-baker, #my-tezos-panel-overview .brief-section-governance').length,
        statusInSignal: Boolean(document.querySelector('#drawer-baker-brief .brief-section-baker'))
      }));
      assert(ownership.allBakerPanelsOwned && ownership.overviewBakerSections === 0 && ownership.statusInSignal,
        `Baker Signal ${label}: baker content remained in Overview ${JSON.stringify(ownership)}`);
      await page.evaluate(() => {
        window.__operatorVisibility = 'hidden';
        document.dispatchEvent(new Event('visibilitychange'));
      });
      softwareVersion = 'v25.2';
      softwareUpdateTime = new Date(Date.now() - 86400000).toISOString();
      await page.evaluate(() => {
        window.__operatorVisibility = 'visible';
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await page.waitForFunction(() => {
        const octez = [...document.querySelectorAll('#drawer-operator-status .drawer-operator-tile')]
          .find((tile) => tile.querySelector('.drawer-operator-label')?.textContent === 'Octez');
        return octez?.querySelector('strong')?.textContent === 'v25.2' && octez.textContent.includes('first block on version 1d ago');
      }, null, { timeout: 15000 });
      const readerTop = await page.evaluate(() => {
        const body = document.getElementById('drawer-body');
        body.scrollTop = 30;
        return body.scrollTop;
      });
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert(await page.locator('#drawer-body').evaluate((body) => body.scrollTop) === readerTop, `Baker Signal ${label}: delayed restoration overwrote reader scroll`);
      // Maintenance keeps the same controls, disclosure, selection and viewport
      // through new reads, source failures, shorter horizons, and empty schedules.
      await page.waitForFunction(() => document.querySelector('.drawer-schedule-freshness')?.textContent.includes('100 rights checked'));
      assert(await page.locator('.drawer-schedule-right').count() === 3, 'Show three upcoming slots');
      const nextStyle = await page.locator('.drawer-schedule-right').evaluateAll(tiles => tiles.map(tile => ({ background: getComputedStyle(tile).backgroundColor, height: tile.clientHeight, contentHeight: [...tile.children].reduce((sum, child) => sum + child.getBoundingClientRect().height, 0) })));
      assert(nextStyle[0].background !== nextStyle[1].background, 'The immediate next R0 needs a distinct highlight');
      assert(nextStyle.every(tile => tile.height - tile.contentHeight < 85), 'Upcoming rights must not stretch into tall empty boxes');
      const rewardNotice = await page.locator('.drawer-schedule-reward-note').innerText();
      assert(rewardNotice.includes('2/3') && rewardNotice.includes('64%') && rewardNotice.toLowerCase().includes('cycle rewards'), 'Reward notice must use the separate current consensus and DAL thresholds');
      assert((await page.locator('.drawer-maintenance-result').innerText()).includes('After level 12,345,858'), 'Earliest 15-minute fit is after the first assignment, with buffers');
      await page.locator('#baker-maintenance-duration').selectOption('30');
      await page.locator('[data-quiet-key="schedule-method"] summary').click();
      const scheduleBefore = await page.evaluate(() => {
        const select = document.getElementById('baker-maintenance-duration');
        const body = document.getElementById('drawer-body');
        select.focus({ preventScroll: true });
        const range = document.createRange();
        range.selectNodeContents(document.querySelector('.drawer-maintenance h4'));
        document.getSelection().removeAllRanges();
        document.getSelection().addRange(range);
        body.scrollTop = 100;
        window.__scheduleSelect = select;
        window.__scheduleNode = document.querySelector('.drawer-baker-schedule');
        return { top: body.scrollTop, pageY: window.scrollY, selection: document.getSelection().toString() };
      });
      const checkScheduleReader = async () => {
        const current = await page.evaluate(() => ({
          top: document.getElementById('drawer-body').scrollTop, pageY: window.scrollY,
          selection: document.getSelection().toString(),
          same: document.getElementById('baker-maintenance-duration') === window.__scheduleSelect && document.querySelector('.drawer-baker-schedule') === window.__scheduleNode,
          focused: document.activeElement === window.__scheduleSelect,
          value: window.__scheduleSelect.value,
          open: document.querySelector('[data-quiet-key="schedule-method"]').open,
          visible: getComputedStyle(window.__scheduleNode).opacity === '1' && getComputedStyle(window.__scheduleNode).transform === 'none',
          overflow: document.getElementById('drawer-body').scrollWidth - document.getElementById('drawer-body').clientWidth
        }));
        assert(current.same && current.focused && current.open && current.visible && current.value === '30' && current.overflow <= 1,
          `Baker schedule ${label}: lost reader state ${JSON.stringify(current)}`);
        assert(current.top === scheduleBefore.top && current.pageY === scheduleBefore.pageY && current.selection === scheduleBefore.selection,
          `Baker schedule ${label}: moved the reading position or selection ${JSON.stringify({ current, scheduleBefore })}`);
      };
      const beforeRefresh = await page.locator('.drawer-baker-schedule').getAttribute('data-schedule-checked');
      await page.waitForFunction(() => document.querySelector('.drawer-maintenance-result')?.textContent.includes('After level 12,345,858'));
      await page.waitForFunction(before => document.querySelector('.drawer-baker-schedule')?.dataset.scheduleChecked !== before, beforeRefresh);
      await checkScheduleReader();
      const levelsBeforeFailure = await page.locator('.drawer-schedule-right .drawer-operator-detail').allTextContents();
      scheduleMode = 'unavailable';
      await page.waitForFunction(() => document.querySelector('.drawer-schedule-freshness')?.textContent.includes('Last confirmed data'));
      assert(JSON.stringify(await page.locator('.drawer-schedule-right .drawer-operator-detail').allTextContents()) === JSON.stringify(levelsBeforeFailure), 'Failed schedule read retains the confirmed levels');
      assert((await page.locator('.drawer-maintenance-result').innerText()).includes('Waiting for a fresh schedule'));
      await checkScheduleReader();
      scheduleMode = 'short';
      await page.waitForFunction(() => document.querySelector('.drawer-schedule-freshness')?.textContent.includes('2 rights checked'));
      assert((await page.locator('[data-quiet-key="schedule-method"]').innerText()).includes('2 of up to 100 published'));
      assert((await page.locator('.drawer-schedule-right').nth(2).innerText()).includes('No further published right'));
      await checkScheduleReader();
      scheduleMode = 'empty';
      await page.waitForFunction(() => document.querySelector('.drawer-schedule-freshness')?.textContent.includes('0 rights checked'));
      assert((await page.locator('.drawer-maintenance-result').innerText()).includes('No fitting gap'));
      await checkScheduleReader();
      scheduleMode = 'complete';
      await page.waitForFunction(() => document.querySelector('.drawer-schedule-freshness')?.textContent.includes('100 rights checked'));
      await checkScheduleReader();
      await page.locator('[data-quiet-key="schedule-method"] summary').click();
      await page.evaluate(() => { window.__operatorVisibility = 'hidden'; document.dispatchEvent(new Event('visibilitychange')); });
      await waitForIntentionalRealTime(page, 'my-tezos-hidden-refresh-window');
      assert(await page.evaluate(() => window.__scheduleHiddenFetches === 0), `Hidden Baker Signal ${label} does not initiate new schedule requests`);
      await page.evaluate(() => { window.__operatorVisibility = 'visible'; document.dispatchEvent(new Event('visibilitychange')); });
      if (ARTIFACTS_DIR) {
        await page.evaluate(() => {
          document.getSelection().removeAllRanges();
          document.querySelector('.drawer-operator-panel').scrollIntoView({ block: 'start' });
        });
        await page.screenshot({ path: path.join(ARTIFACTS_DIR, `baker-signal-${label}.png`) });
      }
      await page.locator('#my-tezos-tab-baker-signal').press('ArrowLeft');
      if (ARTIFACTS_DIR) {
        await page.locator('#drawer-rewards').scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(ARTIFACTS_DIR, `overview-${label}.png`) });
      }
      assert(await page.locator('#my-tezos-tab-overview').getAttribute('aria-selected') === 'true', 'Baker Signal must follow Overview in keyboard order');
      await page.locator('#my-tezos-tab-overview').press('ArrowRight');
      assert(new URL(page.url()).searchParams.get('view') === 'baker-signal', 'Baker Signal tab must synchronize its route');
      assert(await page.locator('#drawer-operator-status .drawer-operator-panel').evaluate((panel) => panel === window.__bakerSignalPanel), 'Switching back must retain the signal panel');
      attestationStatuses = ['realized', 'realized', ...Array(8).fill('missed')];
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.locator('#drawer-operator-status .drawer-operator-panel').waitFor({ state: 'visible', timeout: 15000 });
      assert(await page.locator('#my-tezos-tab-baker-signal').getAttribute('aria-selected') === 'true', 'Baker Signal route must survive reload');
      await page.waitForFunction(() => document.querySelector('#drawer-operator-status')?.textContent.includes('Recovering')
        && document.querySelector('#drawer-operator-status')?.textContent.includes('8/10 recent attestation issues · latest 2 OK'), null, { timeout: 15000 });

      await page.waitForFunction(() => document.querySelector('.drawer-baker-grade[data-grade-state="current"] .grade-score')?.textContent === '100/100');
      gradeParticipation = null;
      await page.locator('.drawer-baker-grade[data-grade-state="stale"]').waitFor();
      assert((await page.locator('.drawer-baker-grade').innerText()).includes('100/100'), 'Participation failure must retain the last confirmed score');
      gradeParticipation = { expected_cycle_activity: 0, missed_slots: 0 };
      await page.locator('.drawer-baker-grade[data-grade-state="unavailable"]').waitFor();
      assert(!(await page.locator('.drawer-baker-grade').innerText()).includes('100/100'), 'Zero expected power must not earn a perfect grade');
      gradeParticipation = { expected_cycle_activity: 7000, missed_slots: 350 };
      await page.waitForFunction(() => document.querySelector('.drawer-baker-grade .grade-score')?.textContent === '90/100');
      await page.locator('.drawer-baker-grade .report-card-btn').click();
      const reportResult = await page.waitForFunction(() => {
        if (document.querySelector('#share-modal.visible')) return 'ready';
        const error = document.querySelector('#report-card-overlay')?.textContent;
        return error?.includes('Failed') ? error : null;
      }, null, { timeout: 20000 });
      assert(await reportResult.jsonValue() === 'ready', `Full Baker Report failed: ${await reportResult.jsonValue()}`);
      assert(await page.locator('#share-modal.visible').isVisible(), 'The full report preview must be visibly open');
      assert(await page.locator('#share-modal .share-modal-preview img[src^="data:image/png"]').count() === 1, 'Full Baker Report should generate a shareable preview');
      await page.locator('#share-modal .share-modal-close').click();

      await page.locator('#my-tezos-tab-overview').click();
      await revealMyTezosAccountControls(page);
      await page.locator('#my-baker-input').fill(SAMPLE_IDLE_ADDRESS);
      await page.locator('#my-baker-save').click();
      await page.locator('#my-tezos-tab-baker-signal').click();
      await page.waitForFunction(() => document.getElementById('my-tezos-baker-signal-message')?.textContent.includes('This account has no baker'), null, { timeout: 15000 });
      assert(await page.locator('#drawer-operator-status').isHidden(), 'An undelegated wallet must not retain the previous wallet’s signal');
      await page.locator('#my-tezos-wallet-scope').selectOption(SAMPLE_DELEGATOR_ADDRESS);
      await page.locator('#drawer-operator-status .drawer-operator-panel[aria-busy="false"]').waitFor({ state: 'visible', timeout: 15000 });
      assert(await page.locator('#my-tezos-tab-baker-signal').getAttribute('aria-selected') === 'true', 'Switching wallets must keep Baker Signal selected');
      assert((await page.locator('#drawer-operator-status h3').textContent()).includes('QA Baker'), 'Switching wallets must restore the selected wallet’s baker');
      await page.locator('#my-tezos-tab-overview').click();
      await page.locator('#my-baker-clear').click();
      await page.locator('#my-tezos-tab-baker-signal').click();
      assert((await page.locator('#my-tezos-baker-signal-message').innerText()).includes('Add a Tezos account'), 'Clearing the active wallet must restore Baker Signal setup guidance');
      assert(await page.locator('#drawer-operator-status').isHidden() && await page.locator('#drawer-baker-details').isHidden(), 'Clearing the active wallet must remove its signal and supporting baker data');

      await context.close();
      assert(issues.length === 0, `my tezos baker live signal browser issues:\n${issues.join('\n')}`);
      log(`ok - my tezos baker live signal ${label}`);
    }
  }

  async function smokeMyTezosBakerCapacity(browser, baseUrl) {
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
    }, OVERDELEGATED_ADDRESS);

    const page = await context.newPage();
    attachIssueCollectors(page, 'my tezos baker capacity', issues);

    const response = await page.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `my tezos baker capacity: dashboard failed with HTTP ${response?.status()}`);
    await page.locator('main').waitFor({ state: 'visible', timeout: 15000 });

    await page.locator('#my-tezos-btn[data-drawer-wired="1"]').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('#my-tezos-btn').click();
    await page.locator('#my-tezos-drawer.open').waitFor({ state: 'visible', timeout: 15000 });
    await expectClassContains(page.locator('#my-tezos-drawer'), 'open', 'my tezos baker capacity drawer');
    await page.locator('#my-tezos-tab-baker-signal').click();
    // Capacity joins several paced TzKT reads; cold fixture completion can exceed
    // 15 seconds. Keep exact value checks and a bounded source-completion wait.
    await page.waitForFunction(() => {
      return Array.from(document.querySelectorAll('.capacity-bar-card')).some((card) => (
        card.textContent.includes('Delegation Capacity')
        && card.textContent.includes('107.7%')
        && card.textContent.includes('-45,000 ꜩ free')
      ));
    }, null, { timeout: 30000 });

    const capacityState = await page.evaluate(() => {
      const card = Array.from(document.querySelectorAll('.capacity-bar-card'))
        .find((item) => item.textContent.includes('Delegation Capacity'));
      return {
        pct: card?.querySelector('.capacity-bar-pct')?.textContent?.trim() || '',
        details: card?.querySelector('.capacity-bar-details')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        isOver: card?.classList.contains('capacity-over') || false,
        fillWidth: card?.querySelector('.capacity-bar-fill')?.style.width || '',
        bakerText: document.querySelector('#my-baker-results')?.innerText || '',
        octezClass: Array.from(document.querySelectorAll('#my-baker-results .my-baker-stat'))
          .find((item) => (item.textContent || '').toLowerCase().includes('octez version'))?.className || ''
      };
    });

    assert(capacityState.pct === '107.7%', `my tezos baker capacity: over-delegation pct was clamped or wrong: ${capacityState.pct}`);
    assert(capacityState.details.includes('630K ꜩ used'), `my tezos baker capacity: used capacity mismatch: ${capacityState.details}`);
    assert(capacityState.details.includes('-45,000 ꜩ free'), `my tezos baker capacity: free capacity should be signed: ${capacityState.details}`);
    assert(capacityState.isOver, 'my tezos baker capacity: over-capacity state class missing');
    assert(capacityState.fillWidth === '100%', `my tezos baker capacity: visual fill should cap at 100%, saw ${capacityState.fillWidth}`);
    assert(capacityState.bakerText.toLowerCase().includes('octez version') && capacityState.bakerText.includes('v24.4'), `my tezos baker capacity: Octez version missing from baker grid ${JSON.stringify(capacityState)}`);
    assert(capacityState.octezClass.includes('my-baker-octez-critical'), `my tezos baker capacity: older major Octez version should be red/critical ${JSON.stringify(capacityState)}`);

    await context.close();
    assert(issues.length === 0, `my tezos baker capacity browser issues:\n${issues.join('\n')}`);
    log('ok - my tezos baker capacity smoke');
  }

  async function smokeMyTezosStakerRewards(browser, baseUrl) {
    const cases = [
      {
        label: 'my tezos staker rewards reported wallet',
        address: SAMPLE_STAKER_ADDRESS,
        expectedLifetime: '1.0856 XTZ',
        expectedCurrent: '0.1676 XTZ',
        expectedLastCycle: 0.16764,
        expectedApy: 11.4,
        minStakeRatio: 0.75
      },
      {
        label: 'my tezos staker rewards mostly staked wallet',
        address: SAMPLE_HEAVY_STAKER_ADDRESS,
        expectedLifetime: '91.2112 XTZ',
        expectedCurrent: '16.6054 XTZ',
        expectedLastCycle: 16.605433,
        expectedApy: 10.8,
        minStakeRatio: 0.99
      }
    ];

    for (const rewardCase of cases) {
      const { state, rewardsRequests } = await getMyTezosRewardReport(browser, baseUrl, {
        ...rewardCase,
        requiredText: [
          'Protocol staking rewards',
          rewardCase.expectedLifetime,
          rewardCase.expectedCurrent,
          'APY (External staker)',
          'Missed rights (10 cycles)'
        ]
      });

      assert(rewardsRequests.some((url) => url.includes(`/rewards/stakers/${rewardCase.address}`)), `${rewardCase.label}: staker rewards endpoint was not requested`);
      assert(!rewardsRequests.some((url) => url.includes(`/rewards/delegators/${rewardCase.address}`)), `${rewardCase.label}: delegator endpoint should not be used when personal staker rows exist`);
      assert(!rewardsRequests.some((url) => url.includes(`/rewards/bakers/${rewardCase.address}`)), `${rewardCase.label}: baker endpoint should not be used for a user account with staker rows`);
      assert(state.lifetimeText.includes('Protocol staking rewards'), `${rewardCase.label}: lifetime card subtitle wrong: ${state.lifetimeText}`);
      assert(state.lifetimeText.includes(rewardCase.expectedLifetime), `${rewardCase.label}: lifetime total should use personal staker rows: ${state.lifetimeText}`);
      assert(state.rewardsText.includes(rewardCase.expectedCurrent), `${rewardCase.label}: this-cycle card should use current staker reward: ${state.rewardsText}`);
      assert(Math.abs(Number(state.rewardsLastCycle) - rewardCase.expectedLastCycle) < 0.00001, `${rewardCase.label}: Morning Brief reward amount wrong: ${state.rewardsLastCycle}`);
      assert(state.isStaker === true, `${rewardCase.label}: Morning Brief should mark account as a staker`);
      assert(state.rewardHistoryPanel === 'baker-signal', `${rewardCase.label}: cycle history must keep its stable shared location without changing the personal staking receipts`);
      assert(Number(state.staked) / Number(state.totalXTZ) >= rewardCase.minStakeRatio, `${rewardCase.label}: stake ratio should match a mostly-staked account: ${state.staked}/${state.totalXTZ}`);
      assert(state.statsLabels.includes('Missed rights (10 cycles)'), `${rewardCase.label}: baker missed-right window should be explicit, saw ${state.statsLabels.join(', ')}`);
      assert(state.statsLabels.includes('APY (External staker)'), `${rewardCase.label}: APY label should identify the external-staker reward split, saw ${state.statsLabels.join(', ')}`);
      assert(state.statsText.includes(`${rewardCase.expectedApy}%`) && state.activeRewardEstimate === true && Math.abs(Number(state.apyRate) - rewardCase.expectedApy) < 0.001, `${rewardCase.label}: external-staker APY should apply gross × (1 - baker edge): ${JSON.stringify(state)}`);
      assert(!state.statsLabels.includes('Missed (10d)'), `${rewardCase.label}: ambiguous missed-right label is still present`);
      assert(!state.lifetimeText.includes('9.1000 XTZ'), `${rewardCase.label}: old generic baker mock leaked into lifetime card: ${state.lifetimeText}`);
    }

    log('ok - my tezos staker rewards smoke');
  }

  async function smokeMyTezosDelegatorRewards(browser, baseUrl) {
    const cases = [
      {
        label: 'my tezos delegator rewards regular wallet',
        address: SAMPLE_REGULAR_DELEGATOR_ADDRESS,
        expectedLifetime: '1.5000 XTZ',
        expectedCurrent: '1.0000 XTZ',
        expectedLastCycle: 1,
        expectedBaker: 'QA Baker'
      },
      {
        label: 'my tezos delegator rewards small wallet',
        address: SAMPLE_SMALL_DELEGATOR_ADDRESS,
        expectedLifetime: '0.5400 XTZ',
        expectedCurrent: '0.4200 XTZ',
        expectedLastCycle: 0.42,
        expectedBaker: 'Second Baker'
      }
    ];

    for (const rewardCase of cases) {
      const { state, rewardsRequests } = await getMyTezosRewardReport(browser, baseUrl, {
        ...rewardCase,
        requiredText: [
          'Estimated delegation share',
          rewardCase.expectedLifetime,
          rewardCase.expectedCurrent,
          'Gross APY (Delegation)',
          'Missed rights (10 cycles)'
        ]
      });

      assert(rewardsRequests.some((url) => url.includes(`/rewards/delegators/${rewardCase.address}`)), `${rewardCase.label}: delegator rewards endpoint was not requested`);
      assert(!rewardsRequests.some((url) => url.includes(`/rewards/stakers/${rewardCase.address}`)), `${rewardCase.label}: staker endpoint should not be used for a zero-stake delegator with reward rows`);
      assert(!rewardsRequests.some((url) => url.includes(`/rewards/bakers/${rewardCase.address}`)), `${rewardCase.label}: baker endpoint should not be used for a regular delegator`);
      assert(state.lifetimeText.includes('Estimated delegation share'), `${rewardCase.label}: lifetime card subtitle wrong: ${state.lifetimeText}`);
      assert(state.lifetimeText.includes(rewardCase.expectedLifetime), `${rewardCase.label}: lifetime total should use delegator estimate rows: ${state.lifetimeText}`);
      assert(state.rewardsText.includes(rewardCase.expectedCurrent), `${rewardCase.label}: this-cycle card should use current delegator estimate: ${state.rewardsText}`);
      assert(Math.abs(Number(state.rewardsLastCycle) - rewardCase.expectedLastCycle) < 0.00001, `${rewardCase.label}: Morning Brief delegator reward amount wrong: ${state.rewardsLastCycle}`);
      assert(state.isStaker === false, `${rewardCase.label}: Morning Brief should not mark a zero-stake delegator as a staker`);
      assert(Number(state.staked) === 0, `${rewardCase.label}: staked amount should stay zero: ${state.staked}`);
      assert(state.statsLabels.includes('Gross APY (Delegation)'), `${rewardCase.label}: delegation APY must be labeled gross before baker policy, saw ${state.statsLabels.join(', ')}`);
      assert(state.statsLabels.includes('Personal Projection') && state.statsText.includes('Policy-dependent'), `${rewardCase.label}: My Baker should withhold a personal delegation projection without baker payout terms: ${state.statsText}`);
      assert(state.activeRewardEstimate === false && state.estAnnual === null, `${rewardCase.label}: My Tezos must not turn gross delegation context into personal annual yield: ${JSON.stringify(state)}`);
      assert(state.statsLabels.includes('Missed rights (10 cycles)'), `${rewardCase.label}: delegated wallet should still label the baker missed-right window explicitly, saw ${state.statsLabels.join(', ')}`);
      assert(state.operatorHeading === `Your baker signal · ${rewardCase.expectedBaker}`, `${rewardCase.label}: operator signal did not name the delegated baker: ${state.operatorHeading}`);
      assert(!state.lifetimeText.includes('Protocol staking rewards'), `${rewardCase.label}: delegator report should not use staking copy: ${state.lifetimeText}`);
      assert(!state.lifetimeText.includes('9.1000 XTZ'), `${rewardCase.label}: old generic baker mock leaked into lifetime card: ${state.lifetimeText}`);
    }

    log('ok - my tezos delegator rewards smoke');
  }

  async function smokeMyTezosHistoricalRewards(browser, baseUrl) {
    const { state, rewardsRequests } = await getMyTezosRewardReport(browser, baseUrl, {
      label: 'my tezos historical rewards only wallet',
      address: SAMPLE_HISTORICAL_REWARDS_ADDRESS,
      nullCycleTiming: true,
      requiredText: [
        'Not currently baking, staking, or delegating',
        'Latest historical record: cycle 1023',
        'No active reward estimate',
        'Estimated delegation share'
      ]
    });

    assert(rewardsRequests.some((url) => url.includes(`/rewards/delegators/${SAMPLE_HISTORICAL_REWARDS_ADDRESS}`)), 'my tezos historical rewards: historical delegator endpoint was not requested');
    assert(state.currentCycleValue === '—', `my tezos historical rewards: historical reward leaked into the Current Cycle value: ${state.currentCycleText}`);
    assert(state.cycleClockText.includes('Cycle timing unavailable') && state.cycleClockText.includes('progress unavailable'), `my tezos historical rewards: null cycle timing was coerced to a fake countdown: ${state.cycleClockText}`);
    assert(state.currentCycleText.includes('Latest historical record: cycle 1023'), `my tezos historical rewards: explicit historical label missing: ${state.currentCycleText}`);
    assert(!/baker efficiency/i.test(state.rewardsText), `my tezos historical rewards: inactive non-baker received a baker efficiency score: ${state.rewardsText}`);
    assert(state.lifetimeText.includes('0.7500 XTZ'), `my tezos historical rewards: lifetime history was lost: ${state.lifetimeText}`);
    assert(state.latestRewardCycle === 1023 && state.hasRewardRole === false, `my tezos historical rewards: My Tezos role/cycle contract is dishonest: ${JSON.stringify(state)}`);
    assert(!/earning\s+~|% APY/i.test(state.statsText), `my tezos historical rewards: inactive wallet was presented as actively earning: ${state.statsText}`);

    log('ok - my tezos historical rewards smoke');
  }

  async function smokeMyTezosBlockMonitor(browser, baseUrl) {
    const issues = [];
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(context);
    await context.addInitScript((address) => {
      localStorage.setItem('tezos-systems-theme', 'matrix');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
      localStorage.setItem('tezos-systems-my-baker-address', address);
      localStorage.setItem('tezos-systems-saved-addresses', JSON.stringify([{
        network: 'tezos-l1',
        address,
        label: 'Second Baker',
        included: true,
        addedAt: Date.now()
      }]));
      localStorage.removeItem('tezos-systems-live-head-my-tezos-only-v1');
    }, SAMPLE_ADDRESS_2);

    const page = await context.newPage();
    attachIssueCollectors(page, 'My Tezos block monitor', issues);
    const response = await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `My Tezos block monitor: dashboard failed with HTTP ${response?.status()}`);
    await page.locator('#live-head-button[data-live-head-wired="1"]').waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForFunction(() => (
      document.querySelectorAll('#live-head-stack .live-head-row[data-health-level]').length === 4
        && Array.from(document.querySelectorAll('#live-head-stack .live-head-row[data-health-level]'))
          .every((row) => ['match', 'no-match'].includes(row.dataset.myTezosBlockState || ''))
    ), null, { timeout: 15000 });

    const readTickerGeometry = () => page.evaluate(() => {
      const panel = document.getElementById('live-head');
      const stack = document.getElementById('live-head-stack');
      const depth = document.getElementById('live-head-depth-toggle');
      const search = panel?.querySelector('.hero-search-form');
      const panelRect = panel?.getBoundingClientRect();
      const stackRect = stack?.getBoundingClientRect();
      const depthRect = depth?.getBoundingClientRect();
      const searchRect = search?.getBoundingClientRect();
      return {
        expanded: document.documentElement.dataset.liveHeadExpanded === 'true',
        panelHeight: panelRect?.height || 0,
        stackHeight: stackRect?.height || 0,
        stackTop: panelRect && stackRect ? stackRect.top - panelRect.top : 0,
        depthTop: panelRect && depthRect ? depthRect.top - panelRect.top : 0,
        depthHeight: depthRect?.height || 0,
        depthRight: panelRect && depthRect ? panelRect.right - depthRect.right : 0,
        searchTop: panelRect && searchRect ? searchRect.top - panelRect.top : 0,
        visibleRows: Array.from(stack?.querySelectorAll('.live-head-row[data-health-level]') || [])
          .filter((row) => getComputedStyle(row).display !== 'none').length
      };
    });
    const sameTickerGeometry = (actual, expected) => (
      Math.abs(actual.panelHeight - expected.panelHeight) <= 1
        && Math.abs(actual.stackHeight - expected.stackHeight) <= 1
        && Math.abs(actual.stackTop - expected.stackTop) <= 1
        && Math.abs(actual.depthTop - expected.depthTop) <= 1
        && Math.abs(actual.depthRight - expected.depthRight) <= 1
        && Math.abs(actual.searchTop - expected.searchTop) <= 1
    );
    const compactBaseline = await readTickerGeometry();
    await chooseLiveHeadDepth(page, '10');
    await page.waitForFunction(() => document.documentElement.dataset.liveHeadExpanded === 'true'
      && document.querySelectorAll('#live-head-stack .live-head-row[data-health-level]').length === 10, null, { timeout: 5000 });
    const expandedBaseline = await readTickerGeometry();
    assert(compactBaseline.depthRight >= 7 && compactBaseline.depthRight <= 28
        && expandedBaseline.depthRight >= 7 && expandedBaseline.depthRight <= 28
        && compactBaseline.depthTop + compactBaseline.depthHeight <= compactBaseline.searchTop - 3
        && expandedBaseline.depthTop + expandedBaseline.depthHeight <= expandedBaseline.searchTop - 3,
      `My Tezos block monitor: desktop depth arrow is not pinned to the ticker edge ${JSON.stringify({ compactBaseline, expandedBaseline })}`);
    await chooseLiveHeadDepth(page, 'compact');
    await page.waitForFunction(() => document.documentElement.dataset.liveHeadExpanded === 'false'
      && document.querySelectorAll('#live-head-stack .live-head-row[data-health-level]').length === 4, null, { timeout: 5000 });

    await openDropdown(page, '#settings-gear', '#settings-dropdown');
    const globalToggle = page.locator('#live-head-my-tezos-setting');
    assert(await globalToggle.isEnabled(), 'My Tezos block monitor: one saved address should enable the global Setup control');
    await globalToggle.click();
    await page.waitForFunction(() => (
      localStorage.getItem('tezos-systems-live-head-my-tezos-only-v1') === '1'
        && document.querySelector('#live-head-my-tezos-setting')?.getAttribute('aria-pressed') === 'true'
    ), null, { timeout: 5000 });
    const enabled = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('#live-head-stack .live-head-row[data-health-level]'));
      const matches = rows.filter((row) => row.dataset.myTezosBlockState === 'match');
      return {
        globalPressed: document.querySelector('#live-head-my-tezos-setting')?.getAttribute('aria-pressed') || '',
        setupClosed: !document.querySelector('#settings-dropdown')?.classList.contains('open'),
        badge: document.querySelector('#live-head-my-tezos-setting [data-live-head-my-tezos-count]')?.textContent?.trim() || '',
        matches: matches.length,
        matchingVisible: matches.filter((row) => getComputedStyle(row).display !== 'none').length,
        filtered: rows.filter((row) => row.classList.contains('is-my-tezos-filtered-out')).length,
        statusPresent: Boolean(document.querySelector('#live-head-stack [data-live-head-my-tezos-status]'))
      };
    });
    assert(enabled.globalPressed === 'true'
        && enabled.setupClosed
        && enabled.badge === '1 saved'
        && enabled.matches >= 1
        && enabled.matchingVisible >= 1
        && enabled.filtered >= 1
        && enabled.statusPresent === false,
      `My Tezos block monitor: global Setup did not retain only matched recent blocks ${JSON.stringify(enabled)}`);
    const filteredCompact = await readTickerGeometry();
    assert(sameTickerGeometry(filteredCompact, compactBaseline),
      `My Tezos block monitor: compact filtering moved the ticker, search, or expand arrow ${JSON.stringify({ compactBaseline, filteredCompact })}`);
    await chooseLiveHeadDepth(page, '10');
    await page.waitForFunction(() => document.documentElement.dataset.liveHeadExpanded === 'true'
      && document.querySelectorAll('#live-head-stack .live-head-row[data-health-level]').length === 10, null, { timeout: 5000 });
    const filteredExpanded = await readTickerGeometry();
    assert(sameTickerGeometry(filteredExpanded, expandedBaseline),
      `My Tezos block monitor: expanded filtering moved the ticker, search, or collapse arrow ${JSON.stringify({ expandedBaseline, filteredExpanded })}`);
    await chooseLiveHeadDepth(page, 'compact');
    await page.waitForFunction(() => document.documentElement.dataset.liveHeadExpanded === 'false'
      && document.querySelectorAll('#live-head-stack .live-head-row[data-health-level]').length === 4, null, { timeout: 5000 });

    const transitionStartLevel = await page.locator('#live-head').evaluate((panel) => Number(panel.dataset.heartbeatLevel || 0));
    await page.evaluate(() => {
      const stack = document.getElementById('live-head-stack');
      window.__myTezosBlockPaintAudit = { unfilteredInsertions: [], exitGhosts: [] };
      window.__myTezosBlockPaintObserver?.disconnect();
      window.__myTezosBlockPaintObserver = new MutationObserver((records) => {
        for (const record of records) {
          for (const added of record.addedNodes) {
            if (!(added instanceof Element)) continue;
            const candidates = added.matches('.live-head-row, .live-head-row-exiting')
              ? [added]
              : Array.from(added.querySelectorAll('.live-head-row, .live-head-row-exiting'));
            for (const row of candidates) {
              if (row.classList.contains('live-head-row-exiting')) {
                const stackRect = stack.getBoundingClientRect();
                const rowRect = row.getBoundingClientRect();
                window.__myTezosBlockPaintAudit.exitGhosts.push({
                  state: row.dataset.myTezosBlockState || '',
                  contained: rowRect.left >= stackRect.left - 1
                    && rowRect.right <= stackRect.right + 1
                    && rowRect.top >= stackRect.top - 1
                    && rowRect.bottom <= stackRect.bottom + 1
                });
                continue;
              }
              if (row.dataset.myTezosBlockState !== 'match'
                  && !row.classList.contains('is-my-tezos-filtered-out')) {
                window.__myTezosBlockPaintAudit.unfilteredInsertions.push({
                  level: row.dataset.healthLevel || '',
                  state: row.dataset.myTezosBlockState || '',
                  className: row.className
                });
              }
            }
          }
        }
      });
      window.__myTezosBlockPaintObserver.observe(stack, { childList: true, subtree: true });
      window.dispatchEvent(new CustomEvent('block-pulse'));
    });
    await page.waitForFunction((previousLevel) => (
      Number(document.querySelector('#live-head')?.dataset.heartbeatLevel || 0) > previousLevel
    ), transitionStartLevel, { timeout: 10000 });
    await page.waitForTimeout(700);
    const transition = await page.evaluate(() => {
      window.__myTezosBlockPaintObserver?.disconnect();
      return {
        audit: window.__myTezosBlockPaintAudit,
        visibleNonMatches: Array.from(document.querySelectorAll('#live-head-stack .live-head-row[data-health-level]'))
          .filter((row) => row.dataset.myTezosBlockState !== 'match' && getComputedStyle(row).display !== 'none')
          .map((row) => ({ level: row.dataset.healthLevel || '', state: row.dataset.myTezosBlockState || '' })),
        statusPresent: Boolean(document.querySelector('#live-head-stack [data-live-head-my-tezos-status]'))
      };
    });
    const filteredAfterTransition = await readTickerGeometry();
    assert(transition.audit.unfilteredInsertions.length === 0
        && transition.audit.exitGhosts.length === 0
        && transition.visibleNonMatches.length === 0
        && transition.statusPresent === false
        && sameTickerGeometry(filteredAfterTransition, compactBaseline),
      `My Tezos block monitor: filtered refresh painted a transient row, retained the placeholder box, or moved ticker geometry ${JSON.stringify({ transition, compactBaseline, filteredAfterTransition })}`);

    const themeStates = [];
    for (const theme of ['aurora', 'matrix', 'hen', 'default', 'void', 'ember', 'signal', 'nerv', 'clean', 'dark', 'bubblegum', 'abyss', 'moss', 'valley', 'warzone']) {
      await page.evaluate(async (nextTheme) => {
        const { setTheme } = await import('/js/ui/theme.js');
        setTheme(nextTheme);
      }, theme);
      await page.waitForFunction((expected) => (
        document.body.dataset.theme === expected
          && Boolean(document.getElementById(`theme-css-${expected}`)?.sheet)
      ), theme, { timeout: 5000 });
      themeStates.push(await page.evaluate((expectedTheme) => {
        const panel = document.getElementById('live-head');
        return {
          theme: expectedTheme,
          statusPresent: Boolean(panel?.querySelector('[data-live-head-my-tezos-status]')),
          pageOverflow: document.documentElement.scrollWidth - innerWidth,
          panelOverflow: panel ? panel.scrollWidth - panel.clientWidth : 999,
          visibleNonMatches: Array.from(panel?.querySelectorAll('.live-head-row[data-health-level]') || [])
            .filter((row) => row.dataset.myTezosBlockState !== 'match' && getComputedStyle(row).display !== 'none').length
        };
      }, theme));
    }
    assert(themeStates.length === 15
        && themeStates.every((state) => state.statusPresent === false
          && state.pageOverflow <= 1
          && state.panelOverflow <= 1
          && state.visibleNonMatches === 0),
      `My Tezos block monitor: the quiet monitor state regressed across themes ${JSON.stringify(themeStates)}`);

    await page.locator('#live-head-filter-toggle').click();
    const activityToggle = page.locator('#live-head-filter-menu [data-live-head-my-tezos-toggle]');
    await activityToggle.waitFor({ state: 'visible', timeout: 5000 });
    assert(await activityToggle.getAttribute('aria-pressed') === 'true', 'My Tezos block monitor: activity Setup did not mirror the active global preference');
    await activityToggle.click();
    await page.waitForFunction(() => (
      localStorage.getItem('tezos-systems-live-head-my-tezos-only-v1') === '0'
        && !document.querySelector('#live-head-stack .live-head-row.is-my-tezos-filtered-out')
    ), null, { timeout: 5000 });
    const disabled = await page.evaluate(() => ({
      activityPressed: document.querySelector('#live-head-filter-menu [data-live-head-my-tezos-toggle]')?.getAttribute('aria-pressed') || '',
      globalPressed: document.querySelector('#live-head-my-tezos-setting')?.getAttribute('aria-pressed') || '',
      visibleRows: Array.from(document.querySelectorAll('#live-head-stack .live-head-row[data-health-level]'))
        .filter((row) => getComputedStyle(row).display !== 'none').length
    }));
    assert(disabled.activityPressed === 'false'
        && disabled.globalPressed === 'false'
        && disabled.visibleRows === 4,
      `My Tezos block monitor: the shared Setup preference did not restore all compact rows ${JSON.stringify(disabled)}`);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => document.querySelectorAll('#live-head-stack .live-head-row[data-health-level]').length === 3, null, { timeout: 5000 });
    const mobileCompactBaseline = await readTickerGeometry();
    await chooseLiveHeadDepth(page, '10');
    await page.waitForFunction(() => document.documentElement.dataset.liveHeadExpanded === 'true'
      && document.querySelectorAll('#live-head-stack .live-head-row[data-health-level]').length === 10, null, { timeout: 5000 });
    const mobileExpandedBaseline = await readTickerGeometry();
    assert(mobileCompactBaseline.depthRight >= 7 && mobileCompactBaseline.depthRight <= 28
        && mobileExpandedBaseline.depthRight >= 7 && mobileExpandedBaseline.depthRight <= 28
        && mobileCompactBaseline.depthTop + mobileCompactBaseline.depthHeight <= mobileCompactBaseline.searchTop - 3
        && mobileExpandedBaseline.depthTop + mobileExpandedBaseline.depthHeight <= mobileExpandedBaseline.searchTop - 3,
      `My Tezos block monitor: mobile depth arrow is not pinned to the ticker edge ${JSON.stringify({ mobileCompactBaseline, mobileExpandedBaseline })}`);
    await chooseLiveHeadDepth(page, 'compact');
    await page.waitForFunction(() => document.documentElement.dataset.liveHeadExpanded === 'false'
      && document.querySelectorAll('#live-head-stack .live-head-row[data-health-level]').length === 3, null, { timeout: 5000 });
    await page.evaluate(() => window.tezosSystemsLiveHead?.setMyTezosOnly(true, 'mobile-geometry-smoke'));
    await page.waitForFunction(() => document.documentElement.dataset.liveHeadMyTezosOnly === 'true', null, { timeout: 5000 });
    const mobileFilteredCompact = await readTickerGeometry();
    await chooseLiveHeadDepth(page, '10');
    await page.waitForFunction(() => document.documentElement.dataset.liveHeadExpanded === 'true'
      && document.querySelectorAll('#live-head-stack .live-head-row[data-health-level]').length === 10, null, { timeout: 5000 });
    const mobileFilteredExpanded = await readTickerGeometry();
    assert(sameTickerGeometry(mobileFilteredCompact, mobileCompactBaseline)
        && sameTickerGeometry(mobileFilteredExpanded, mobileExpandedBaseline),
      `My Tezos block monitor: mobile compact or expanded filtering moved the ticker or depth control ${JSON.stringify({ mobileCompactBaseline, mobileFilteredCompact, mobileExpandedBaseline, mobileFilteredExpanded })}`);
    await page.evaluate(() => {
      window.tezosSystemsLiveHead?.setMyTezosOnly(false, 'mobile-geometry-smoke');
      window.tezosSystemsLiveHead?.setExpanded(false, 'mobile-geometry-smoke');
    });

    await context.close();
    assert(issues.length === 0, `My Tezos block monitor browser issues:\n${issues.join('\n')}`);
    log('ok - My Tezos-only block monitor');
  }

  return { smokeMyTezosBakerActivity, smokeMyTezosBakerLiveSignal, smokeMyTezosBakerCapacity, smokeMyTezosStakerRewards, smokeMyTezosDelegatorRewards, smokeMyTezosHistoricalRewards, smokeMyTezosBlockMonitor };
}
