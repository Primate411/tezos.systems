// Browser workflows owned by my-tezos-views. Shared dependencies remain explicit.
export function createMyTezosViewsSmokeSuites({
  ARTIFACTS_DIR,
  SAMPLE_ADDRESS,
  SAMPLE_ADDRESS_2,
  SAMPLE_DELEGATOR_ADDRESS,
  SAMPLE_ETHERLINK_ADDRESS,
  assert,
  attachIssueCollectors,
  expectClassContains,
  installFeatureMocks,
  log,
  openMyTezosSmokeView,
  path,
  sleep,
  waitForIntentionalRealTime
}) {
  async function smokeMyTezosDrawerLiveRefresh(browser, baseUrl) {
    const issues = [];
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      serviceWorkers: 'block'
    });
    let advanceDrawerSource = false;
    await installFeatureMocks(context, { myTezosLiveRefresh: () => advanceDrawerSource });
    await context.addInitScript((address) => {
      localStorage.setItem('tezos-systems-theme', 'matrix');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
      localStorage.setItem('tezos-systems-my-baker-address', address);
      localStorage.setItem('tezos-systems-overnight-snapshot', JSON.stringify({
        ts: Date.now() - (6 * 60 * 60 * 1000),
        address,
        balance: 1000000,
        staked: 500000,
        xtzPrice: 0.2,
        usdValue: 200000,
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
      window.__MY_TEZOS_DRAWER_REFRESH_MS__ = 1000;
    }, SAMPLE_ADDRESS);

    const page = await context.newPage();
    attachIssueCollectors(page, 'my tezos drawer live refresh', issues);

    const response = await page.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `my tezos drawer live refresh: dashboard failed with HTTP ${response?.status()}`);
    await page.locator('main').waitFor({ state: 'visible', timeout: 15000 });
    // A closed saved-account drawer deliberately yields to visible Home facts.
    await page.waitForFunction(() => document.querySelector('#my-tezos-btn')?.dataset.drawerWired === '1', null, { timeout: 15000 });
    await page.locator('#my-tezos-btn').click();
    await page.locator('#my-tezos-drawer.open').waitFor({ state: 'visible', timeout: 15000 });
    await expectClassContains(page.locator('#my-tezos-drawer'), 'open', 'my tezos drawer live refresh drawer');

    try {
      await page.waitForFunction((address) => {
        const data = window._myTezosData;
        return data?.fullAddress === address && Math.round(data.totalXTZ) === 1500000;
      }, SAMPLE_ADDRESS, { timeout: 15000 });
    } catch (error) {
      const state = await page.evaluate(() => ({
        data: window._myTezosData || null,
        activity: document.querySelector('#drawer-baker-activity')?.innerText || '',
        operator: document.querySelector('#drawer-operator-status')?.innerText || '',
        brief: document.querySelector('#drawer-brief')?.innerText || ''
      }));
      throw new Error(`my tezos drawer initial load did not settle ${JSON.stringify({ state, issues })}\n${error.message}`);
    }

    advanceDrawerSource = true;
    try {
      await page.waitForFunction(() => {
        const data = window._myTezosData;
        const bakerText = document.querySelector('#my-baker-results')?.innerText || '';
        const bakerLower = bakerText.toLowerCase();
        const octezStat = Array.from(document.querySelectorAll('#my-baker-results .my-baker-stat'))
          .find((item) => (item.textContent || '').toLowerCase().includes('octez version'));
        const header = document.querySelector('#my-tezos-btn .nav-label')?.textContent || '';
        return Math.round(data?.totalXTZ || 0) === 1750000
          && bakerText.includes('1,750,000.00')
          && bakerText.includes('725,000.00')
          && bakerLower.includes('octez version')
          && bakerLower.includes('v25.0')
          && octezStat?.classList.contains('my-baker-octez-watch')
          && header.includes('1,750,000 XTZ')
          && document.querySelector('#drawer-network .network-away-card');
      }, null, { timeout: 15000 });
    } catch {
      const state = await page.evaluate(() => ({
        data: window._myTezosData,
        header: document.querySelector('#my-tezos-btn .nav-label')?.textContent || '',
        bakerText: document.querySelector('#my-baker-results')?.innerText || '',
        freshness: document.querySelector('#drawer-freshness')?.innerText || ''
      }));
      throw new Error(`my tezos drawer live refresh: drawer did not refresh into Octez-aware state ${JSON.stringify(state)}`);
    }

    const state = await page.evaluate(() => ({
      totalXTZ: window._myTezosData?.totalXTZ,
      staked: window._myTezosData?.staked,
      header: document.querySelector('#my-tezos-btn .nav-label')?.textContent || '',
      bakerText: document.querySelector('#my-baker-results')?.innerText || '',
      octezClass: Array.from(document.querySelectorAll('#my-baker-results .my-baker-stat'))
        .find((item) => (item.textContent || '').toLowerCase().includes('octez version'))?.className || '',
      freshness: document.querySelector('#drawer-freshness')?.innerText || ''
    }));

    assert(Math.round(state.totalXTZ) === 1750000, `my tezos drawer live refresh: brief kept stale balance ${JSON.stringify(state)}`);
    assert(Math.round(state.staked) === 725000, `my tezos drawer live refresh: brief kept stale stake ${JSON.stringify(state)}`);
    assert(state.bakerText.includes('1,750,000.00'), `my tezos drawer live refresh: baker grid kept stale balance ${JSON.stringify(state)}`);
    assert(state.bakerText.includes('725,000.00'), `my tezos drawer live refresh: baker grid kept stale stake ${JSON.stringify(state)}`);
    assert(state.bakerText.toLowerCase().includes('octez version') && state.bakerText.includes('v25.0'), `my tezos drawer live refresh: baker grid missed Octez version ${JSON.stringify(state)}`);
    assert(state.octezClass.includes('my-baker-octez-watch'), `my tezos drawer live refresh: stale same-major Octez version should be yellow/watch ${JSON.stringify(state)}`);
    assert(state.header.includes('1,750,000 XTZ'), `my tezos drawer live refresh: header kept stale balance ${JSON.stringify(state)}`);
    assert(
      /(?:my tezos|operator signal)/i.test(state.freshness) && state.freshness.toLowerCase().includes('just now'),
      `my tezos drawer live refresh: standardized freshness stamp missing ${JSON.stringify(state)}`
    );

    await page.waitForFunction(() => document.querySelector('#drawer-baker-history .rt-calendar[data-reward-kind="baker"] .rt-cal-block[data-tip]'), null, { timeout: 15000 });
    assert(await page.locator('#my-tezos-panel-overview .rt-calendar').count() === 0, 'Baker history must be absent from Overview');
    assert(await page.locator('#my-tezos-panel-baker-signal .rt-calendar').count() === 1, 'Baker Signal must own the single baker calendar');
    for (const view of ['overview', 'baker-signal']) {
      if (await page.locator(`#my-tezos-tab-${view}`).getAttribute('aria-selected') !== 'true') {
        await page.locator(`#my-tezos-tab-${view}`).click();
      }
      const quietBefore = await page.evaluate((view) => {
        const drawer = document.querySelector('#drawer-body');
        const results = document.querySelector('#my-baker-results');
        const grid = results.querySelector('.my-baker-grid');
        const button = document.querySelector(view === 'overview' ? '#drawer-refresh' : '#my-tezos-tab-baker-signal');
        const value = document.querySelector(view === 'overview' ? '#drawer-brief .brief-body strong' : '#my-baker-results .my-baker-stat-value')?.firstChild;
        drawer.scrollTop = Math.min(260, Math.max(0, drawer.scrollHeight - drawer.clientHeight));
        button?.focus({ preventScroll: true });
        if (value) {
          const range = document.createRange();
          range.setStart(value, 0);
          range.setEnd(value, Math.min(6, value.length));
          const selection = document.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
        }
        delete results.dataset.quietRefreshSettled;
        const history = document.querySelector('#drawer-baker-history');
        delete history.dataset.quietRefreshSettled;
        window.__quietMyTezosCalendar = history.querySelector('.rt-calendar');
        window.__quietMyTezosCycle = history.querySelector('.rt-cal-block');
        window.__quietMyTezosGrid = grid;
        window.__quietMyTezosButton = button;
        window.__quietMyTezosJourneys = Array.from(document.querySelectorAll('#drawer-more-actions .drawer-account-journey-card'));
        window.__quietMyTezosSignals = Array.from(document.querySelectorAll('#drawer-network .network-signal'));
        window.__quietMyTezosAwayCard = document.querySelector('#drawer-network .network-away-card');
        return {
          top: drawer.scrollTop,
          selection: document.getSelection()?.toString() || '',
          awayPresent: Boolean(window.__quietMyTezosAwayCard),
          journeyIds: window.__quietMyTezosJourneys.map((card) => card.dataset.myTezosJourneyDestination),
          signalCategories: window.__quietMyTezosSignals.map((card) => card.dataset.category)
        };
      }, view);
      await page.waitForFunction(() => document.querySelector('#my-baker-results')?.dataset.quietRefreshSettled === 'true'
        && document.querySelector('#drawer-baker-history')?.dataset.quietRefreshSettled === 'true', null, { timeout: 5000 });
      const quietAfter = await page.evaluate(() => {
        const drawer = document.querySelector('#drawer-body');
        const results = document.querySelector('#my-baker-results');
        return {
          top: drawer.scrollTop,
          sameGrid: results.querySelector('.my-baker-grid') === window.__quietMyTezosGrid,
          sameCalendar: document.querySelector('#drawer-baker-history .rt-calendar') === window.__quietMyTezosCalendar,
          sameCycle: document.querySelector('#drawer-baker-history .rt-cal-block') === window.__quietMyTezosCycle,
          sameJourneys: Array.from(document.querySelectorAll('#drawer-more-actions .drawer-account-journey-card'))
            .every((card, index) => card === window.__quietMyTezosJourneys[index]),
          sameSignals: Array.from(document.querySelectorAll('#drawer-network .network-signal'))
            .every((card, index) => card === window.__quietMyTezosSignals[index]),
          sameAwayCard: document.querySelector('#drawer-network .network-away-card') === window.__quietMyTezosAwayCard,
          journeyIds: Array.from(document.querySelectorAll('#drawer-more-actions .drawer-account-journey-card'))
            .map((card) => card.dataset.myTezosJourneyDestination),
          signalCategories: Array.from(document.querySelectorAll('#drawer-network .network-signal'))
            .map((card) => card.dataset.category),
          focused: document.activeElement === window.__quietMyTezosButton,
          selection: document.getSelection()?.toString() || ''
        };
      });
      assert(quietBefore.awayPresent && quietAfter.sameGrid && quietAfter.sameJourneys && quietAfter.sameSignals && quietAfter.sameAwayCard && quietAfter.focused, `my tezos drawer live refresh: background update replaced focused, journey, away-report, or relevance-ranked signal nodes ${JSON.stringify({ quietBefore, quietAfter })}`);
      assert(quietAfter.sameCalendar && quietAfter.sameCycle, 'Baker calendar and cycle receipts must retain their DOM across a background refresh');
      assert(JSON.stringify(quietAfter.journeyIds) === JSON.stringify(quietBefore.journeyIds), `my tezos drawer live refresh: background update reordered contextual journeys ${JSON.stringify({ quietBefore, quietAfter })}`);
      assert(JSON.stringify(quietAfter.signalCategories) === JSON.stringify(quietBefore.signalCategories), `my tezos drawer live refresh: background update reordered relevance-ranked signals ${JSON.stringify({ quietBefore, quietAfter })}`);
      assert(quietAfter.selection === quietBefore.selection, `my tezos drawer live refresh: background update lost text selection ${JSON.stringify({ quietBefore, quietAfter })}`);
      assert(Math.abs(quietAfter.top - quietBefore.top) < 1, `my tezos drawer live refresh: background update moved drawer scroll ${JSON.stringify({ quietBefore, quietAfter })}`);
    }

    for (const { label, width, height } of [
      { label: 'desktop', width: 1440, height: 1000 },
      { label: 'mobile', width: 390, height: 844 }
    ]) {
      await page.setViewportSize({ width, height });
      await page.locator('#drawer-baker-history').scrollIntoViewIfNeeded();
      const history = await page.locator('#drawer-baker-history').evaluate((node) => ({
        title: node.querySelector('.rt-cal-title')?.textContent,
        receipt: node.querySelector('.rt-cal-block')?.getAttribute('data-tip'),
        overflow: node.scrollWidth > node.clientWidth + 1,
        width: node.getBoundingClientRect().width,
        drawerOverflow: document.querySelector('#drawer-body').scrollWidth > document.querySelector('#drawer-body').clientWidth + 1
      }));
      assert(history.title.includes('30-Cycle Baker History') && history.receipt.includes('XTZ')
        && history.width > 250 && !history.overflow && !history.drawerOverflow,
      `Baker history ${label}: calendar must be readable with cycle receipts and no overflow ${JSON.stringify(history)}`);
      if (ARTIFACTS_DIR) await page.screenshot({ path: path.join(ARTIFACTS_DIR, `baker-history-${label}.png`) });
    }

    await context.close();
    assert(issues.length === 0, `my tezos drawer live refresh browser issues:\n${issues.join('\n')}`);
    log('ok - my tezos drawer live refresh smoke');
  }

  async function smokeMyTezosBalanceHistory(browser, baseUrl) {
    const issues = [];
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(context, {
      historyStakerAddresses: [SAMPLE_DELEGATOR_ADDRESS],
      archivePrimaryFailure: true
    });
    await context.addInitScript((address) => {
      localStorage.setItem('tezos-systems-theme', 'clean');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
      localStorage.setItem('tezos-systems-my-baker-address', address);
      localStorage.setItem('tezos-systems-saved-addresses', JSON.stringify([
        { network: 'tezos-l1', address, label: 'Historical staker', included: true, addedAt: Date.now() }
      ]));
    }, SAMPLE_DELEGATOR_ADDRESS);
    const page = await context.newPage();
    attachIssueCollectors(page, 'my tezos exact balance history', issues);
    const fullBalanceRequests = [];
    page.on('request', (request) => {
      if (request.url().includes('/full_balance')) fullBalanceRequests.push(request.url());
    });

    await openMyTezosSmokeView(page, baseUrl, 'portfolio');
    try {
      await page.waitForFunction(() => {
        const chart = window.Chart?.getChart(document.querySelector('#portfolio-history-chart'));
        return document.querySelector('#portfolio-history-status')?.dataset.state === 'complete'
          && chart?.data?.datasets?.length === 1
          && chart.data.datasets[0].label === 'Total XTZ'
          && chart.data.datasets[0].data.length >= 2;
      }, null, { timeout: 30000 });
    } catch (error) {
      const debug = await page.evaluate(async () => {
        const chart = window.Chart?.getChart(document.querySelector('#portfolio-history-chart'));
        const finalized = await fetch('https://api.tzkt.io/v1/blocks?sort.desc=level&offset=2&limit=1&select=level%2Ctimestamp%2Cprotocol').then((response) => response.json()).catch((failure) => ({ error: failure.message }));
        return {
          memory: document.querySelector('#portfolio-memory-status')?.textContent || '',
          memoryState: document.querySelector('#portfolio-memory-status')?.dataset.state || '',
          history: document.querySelector('#portfolio-history-status')?.textContent || '',
          historyState: document.querySelector('#portfolio-history-status')?.dataset.state || '',
          empty: document.querySelector('#portfolio-history-empty')?.textContent || '',
          labels: chart?.data?.datasets?.map((dataset) => dataset.label) || [],
          points: chart?.data?.datasets?.[0]?.data?.length || 0,
          finalized
        };
      });
      throw new Error(`${error.message} · ${JSON.stringify(debug)} · issues ${JSON.stringify(issues)}`);
    }

    const initial = await page.evaluate(async (address) => {
      const chart = window.Chart.getChart(document.querySelector('#portfolio-history-chart'));
      const request = indexedDB.open('tezos-systems-my-tezos');
      const db = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const tx = db.transaction(['snapshots', 'syncState'], 'readonly');
      const snapshotsRequest = tx.objectStore('snapshots').getAll();
      const syncRequest = tx.objectStore('syncState').getAll();
      const stored = await new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve({
          snapshots: snapshotsRequest.result,
          sync: syncRequest.result
        });
        tx.onerror = () => reject(tx.error);
      });
      db.close();
      const historical = stored.snapshots.filter((row) => row.sourceType === 'historical-total' && row.address === address);
      return {
        datasetLabels: chart.data.datasets.map((dataset) => dataset.label),
        pointSources: chart.$exactHistoryPoints.map((point) => point.source),
        activeRange: document.querySelector('[data-portfolio-range].active')?.dataset.portfolioRange,
        scope: document.querySelector('#my-tezos-wallet-scope')?.value,
        status: document.querySelector('#portfolio-history-status')?.textContent || '',
        historical,
        sync: stored.sync.filter((state) => state.stream === 'balance-history')
      };
    }, SAMPLE_DELEGATOR_ADDRESS);
    const initialRequests = [...fullBalanceRequests];
    assert(JSON.stringify(initial.datasetLabels) === JSON.stringify(['Total XTZ']), `my tezos exact history: chart rendered non-total evidence ${JSON.stringify(initial)}`);
    assert(initial.activeRange === '1y' && initial.scope === 'all', `my tezos exact history: default range or scope drifted ${JSON.stringify(initial)}`);
    assert(initial.pointSources.every((source) => source === 'tzkt-rpc-archive'), `my tezos exact history: fallback archive source was not retained ${JSON.stringify(initial)}`);
    assert(/exact points/i.test(initial.status) && /TzKT archive RPC/i.test(initial.status), `my tezos exact history: progress/source status missing ${JSON.stringify(initial)}`);
    assert(
      initial.historical.length >= 4
        && initial.historical.every((row) => (
          row.confidence === 'exact'
            && Number.isFinite(row.level)
            && Number.isFinite(row.timestamp)
            && Number.isFinite(row.totalMutez)
            && row.scheduleVersion === 'exact-total-xtz-v1'
            && row.sourceReceipt?.historyModeUrl?.includes('rpc.tzkt.io/mainnet/config/history_mode')
        )),
      `my tezos exact history: normalized immutable fallback receipts missing ${JSON.stringify(initial)}`
    );
    assert(
      initial.sync.length === 1
        && initial.sync[0].dailyCoverage.completed === initial.sync[0].dailyCoverage.target
        && initial.sync[0].lifetimeCoverage.completed === initial.sync[0].lifetimeCoverage.target
        && initial.sync[0].gaps.length === 0,
      `my tezos exact history: completed daily/lifetime coverage was not persisted ${JSON.stringify(initial.sync)}`
    );
    assert(
      initialRequests.some((url) => url.includes('octez-mainnet-archive.octez.io'))
        && initialRequests.some((url) => url.includes('rpc.tzkt.io/mainnet'))
        && new Set(initialRequests).size === initialRequests.length,
      `my tezos exact history: provider fallback or request dedupe failed ${JSON.stringify(initialRequests)}`
    );

    await page.selectOption('#my-tezos-wallet-scope', SAMPLE_DELEGATOR_ADDRESS);
    await page.locator('[data-portfolio-range="all"]').click();
    const label = page.locator(`[data-portfolio-label="${SAMPLE_DELEGATOR_ADDRESS}"]`);
    await label.focus();
    await label.fill('Historical vault');
    await label.evaluate((input) => input.setSelectionRange(1, 7));
    await page.evaluate(() => { document.querySelector('#drawer-body').scrollTop = 240; });
    const quietBefore = await page.evaluate(() => {
      window.__exactHistoryChartBefore = window.Chart.getChart(document.querySelector('#portfolio-history-chart'));
      window.__exactHistoryCanvasBefore = document.querySelector('#portfolio-history-chart');
      return { scroll: document.querySelector('#drawer-body').scrollTop };
    });
    await page.evaluate((address) => {
      const chart = window.Chart.getChart(document.querySelector('#portfolio-history-chart'));
      const points = chart.$exactHistoryPoints.map((point) => ({ ...point }));
      const coverage = {
        completed: points.length,
        target: points.length,
        dailyCompleted: points.filter((point) => point.cadence === 'daily').length,
        dailyTarget: points.filter((point) => point.cadence === 'daily').length,
        lifetimeCompleted: points.length,
        lifetimeTarget: points.length,
        complete: true
      };
      window.dispatchEvent(new CustomEvent('my-tezos-memory-ready', {
        detail: {
          compositionAddresses: [address],
          seriesByAddress: { [address]: points },
          aggregate: points,
          coverageByAddress: { [address]: coverage },
          aggregateCoverage: coverage,
          sourceStatus: { stage: 'complete' },
          status: 'complete'
        }
      }));
    }, SAMPLE_DELEGATOR_ADDRESS);
    await page.waitForTimeout(150);
    const quietAfter = await page.evaluate((address) => {
      const input = document.querySelector(`[data-portfolio-label="${address}"]`);
      return {
        sameChart: window.__exactHistoryChartBefore === window.Chart.getChart(document.querySelector('#portfolio-history-chart')),
        sameCanvas: window.__exactHistoryCanvasBefore === document.querySelector('#portfolio-history-chart'),
        range: document.querySelector('[data-portfolio-range].active')?.dataset.portfolioRange,
        scope: document.querySelector('#my-tezos-wallet-scope')?.value,
        focused: document.activeElement === input,
        selectionStart: input?.selectionStart,
        selectionEnd: input?.selectionEnd,
        scroll: document.querySelector('#drawer-body').scrollTop
      };
    }, SAMPLE_DELEGATOR_ADDRESS);
    assert(
      quietAfter.sameChart
        && quietAfter.sameCanvas
        && quietAfter.range === 'all'
        && quietAfter.scope === SAMPLE_DELEGATOR_ADDRESS
        && quietAfter.focused
        && quietAfter.selectionStart === 1
        && quietAfter.selectionEnd === 7
        && Math.abs(quietAfter.scroll - quietBefore.scroll) <= 1,
      `my tezos exact history: quiet reconciliation moved or reset the reader ${JSON.stringify({ quietBefore, quietAfter })}`
    );

    await page.waitForFunction(() => document.querySelector('#portfolio-memory-status')?.dataset.state === 'complete', null, { timeout: 20000 });
    await page.evaluate(async (address) => {
      window.__historyVisibility = 'hidden';
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => window.__historyVisibility
      });
      document.dispatchEvent(new Event('visibilitychange'));
      const request = indexedDB.open('tezos-systems-my-tezos');
      const db = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const read = db.transaction('snapshots', 'readonly').objectStore('snapshots').getAll();
      const rows = await new Promise((resolve, reject) => {
        read.onsuccess = () => resolve(read.result);
        read.onerror = () => reject(read.error);
      });
      const latest = rows
        .filter((row) => row.sourceType === 'historical-total' && row.address === address)
        .sort((left, right) => right.level - left.level)[0];
      if (latest) {
        const tx = db.transaction('snapshots', 'readwrite');
        tx.objectStore('snapshots').delete(latest.id);
        await new Promise((resolve, reject) => {
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
        });
      }
      db.close();
      window.dispatchEvent(new CustomEvent('my-tezos-portfolio-changed', { detail: { source: 'hidden-history-smoke' } }));
    }, SAMPLE_DELEGATOR_ADDRESS);
    const beforeHiddenWake = fullBalanceRequests.length;
    await page.waitForTimeout(500);
    assert(fullBalanceRequests.length === beforeHiddenWake, `my tezos exact history: hidden tab started archive work ${JSON.stringify(fullBalanceRequests.slice(beforeHiddenWake))}`);
    await page.evaluate(() => {
      window.__historyVisibility = 'visible';
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForFunction(() => (
      document.querySelector('#portfolio-memory-status')?.dataset.state === 'loading'
    ), null, { timeout: 5000 });
    await page.waitForFunction(() => (
      document.querySelector('#portfolio-memory-status')?.dataset.state !== 'loading'
    ), null, { timeout: 30000 });
    if (fullBalanceRequests.length <= beforeHiddenWake) {
      const debug = await page.evaluate(() => ({
        visibility: document.visibilityState,
        drawerOpen: document.querySelector('#my-tezos-drawer')?.classList.contains('open'),
        portfolioHidden: document.querySelector('#my-tezos-panel-portfolio')?.hidden,
        memory: document.querySelector('#portfolio-memory-status')?.textContent || '',
        memoryState: document.querySelector('#portfolio-memory-status')?.dataset.state || '',
        history: document.querySelector('#portfolio-history-status')?.textContent || ''
      }));
      throw new Error(`my tezos exact history: missing immutable point did not resume when visible · ${JSON.stringify(debug)}`);
    }

    await page.route('**/context/contracts/**/full_balance', (route) => route.abort());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.documentElement.dataset.dashboardReady === 'true');
    // The retained address route can already restore the drawer on reload.
    if (!await page.locator('#my-tezos-drawer').evaluate(node => node.classList.contains('open'))) {
      await page.locator('#my-tezos-btn').click();
    }
    await page.locator('#my-tezos-tab-portfolio').click();
    await page.waitForFunction(() => {
      const chart = window.Chart?.getChart(document.querySelector('#portfolio-history-chart'));
      return chart?.data?.datasets?.[0]?.label === 'Total XTZ'
        && chart.data.datasets[0].data.length >= 2;
    }, null, { timeout: 10000 });
    const cached = await page.evaluate(() => ({
      status: document.querySelector('#portfolio-history-status')?.textContent || '',
      points: window.Chart.getChart(document.querySelector('#portfolio-history-chart')).data.datasets[0].data.length
    }));
    assert(cached.points >= 2 && /exact points/i.test(cached.status), `my tezos exact history: cached first paint failed under provider outage ${JSON.stringify(cached)}`);

    await context.close();
    assert(issues.length === 0, `my tezos exact balance history browser issues:\n${issues.join('\n')}`);
    log('ok - my tezos exact balance history smoke');
  }

  async function smokeMyTezosMemory(browser, baseUrl) {
    const issues = [];
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      serviceWorkers: 'block'
    });
    // Keep the exact-history boundary fixed; new-head motion has separate suites.
    await installFeatureMocks(context, { blockHeadAutoAdvance: false });
    await context.addInitScript(({ first, second }) => {
      localStorage.setItem('tezos-systems-theme', 'matrix');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
      localStorage.setItem('tezos-systems-my-baker-address', first);
      localStorage.setItem('tezos-systems-saved-addresses', JSON.stringify([
        { network: 'tezos-l1', address: first, label: 'Primary', included: true, addedAt: Date.now() - 1000 },
        { network: 'tezos-l1', address: second, label: 'Second', included: true, addedAt: Date.now() }
      ]));
    }, { first: SAMPLE_ADDRESS, second: SAMPLE_ADDRESS_2 });
    const page = await context.newPage();
    const overviewArchiveRequests = [];
    const pendingMemoryRequests = new Set();
    page.on('request', (request) => {
      if (['fetch', 'xhr'].includes(request.resourceType())) pendingMemoryRequests.add(request);
      if (request.url().includes('/full_balance')) overviewArchiveRequests.push(request.url());
    });
    page.on('requestfinished', request => pendingMemoryRequests.delete(request));
    page.on('requestfailed', request => pendingMemoryRequests.delete(request));
    attachIssueCollectors(page, 'my tezos memory', issues);
    await openMyTezosSmokeView(page, baseUrl, 'overview');
    await page.waitForFunction(() => ['complete', 'partial'].includes(document.querySelector('#my-tezos-overview-activity-status')?.dataset.state), null, { timeout: 30000 });
    await page.waitForFunction(() => document.querySelectorAll('#my-tezos-overview-activity-list .portfolio-activity-item').length === 3, null, { timeout: 10000 });
    const overviewDesktop = await page.evaluate(() => {
      const drawer = document.querySelector('#my-tezos-drawer');
      const section = document.querySelector('#my-tezos-overview-transactions');
      const bakerSignal = document.querySelector('#drawer-operator-status');
      const button = document.querySelector('#my-tezos-overview-transactions-link');
      const rows = Array.from(document.querySelectorAll('#my-tezos-overview-activity-list .portfolio-activity-item'));
      return {
        title: document.querySelector('#my-tezos-overview-transactions-title')?.textContent?.trim() || '',
        button: button?.textContent?.replace(/\s+/g, ' ').trim() || '',
        rowCount: rows.length,
        types: rows.map((row) => row.dataset.activityType),
        body: rows.map((row) => row.textContent?.replace(/\s+/g, ' ').trim() || ''),
        separateBakerSignal: section.closest('[data-my-tezos-panel]')?.dataset.myTezosPanel === 'overview'
          && bakerSignal.closest('[data-my-tezos-panel]')?.dataset.myTezosPanel === 'baker-signal'
          && bakerSignal.closest('[data-my-tezos-panel]').hidden,
        buttonHeight: button?.getBoundingClientRect().height || 0,
        sectionInside: section.getBoundingClientRect().left >= drawer.getBoundingClientRect().left
          && section.getBoundingClientRect().right <= drawer.getBoundingClientRect().right,
        overflow: section.scrollWidth > section.clientWidth + 1
      };
    });
    assert(
      overviewDesktop.title === 'Last 3 transactions'
        && overviewDesktop.button.includes('View all transactions')
        && overviewDesktop.rowCount === 3
        && overviewDesktop.types.includes('nft')
        && /Shared Smoke Artifact/.test(overviewDesktop.body.join(' '))
        && overviewDesktop.separateBakerSignal
        && overviewDesktop.buttonHeight >= 36
        && overviewDesktop.sectionInside
        && !overviewDesktop.overflow,
      `my tezos overview transactions: desktop preview is incomplete or clipped ${JSON.stringify(overviewDesktop)}`
    );
    assert(overviewArchiveRequests.length === 0, `my tezos overview transactions: lightweight preview started exact-history archive reads ${JSON.stringify(overviewArchiveRequests)}`);

    const overviewQuietBefore = await page.evaluate(() => {
      const body = document.querySelector('#drawer-body');
      const list = document.querySelector('#my-tezos-overview-activity-list');
      const firstRow = list?.querySelector('.portfolio-activity-item');
      const button = document.querySelector('#my-tezos-overview-transactions-link');
      const titleText = firstRow?.querySelector('strong')?.firstChild;
      body.scrollTop = Math.min(
        Math.max(0, document.querySelector('#my-tezos-overview-transactions')?.offsetTop - 80),
        Math.max(0, body.scrollHeight - body.clientHeight)
      );
      button?.focus({ preventScroll: true });
      if (titleText?.length) {
        const range = document.createRange();
        range.setStart(titleText, 0);
        range.setEnd(titleText, Math.min(6, titleText.length));
        const selection = document.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      }
      delete list.dataset.quietRefreshSettled;
      window.__overviewTransactionRow = firstRow;
      window.__overviewTransactionButton = button;
      window.dispatchEvent(new CustomEvent('my-tezos-portfolio-changed', { detail: { source: 'overview-quiet-smoke' } }));
      return {
        scrollTop: body.scrollTop,
        selection: document.getSelection()?.toString() || ''
      };
    });
    await page.waitForFunction(() => document.querySelector('#my-tezos-overview-activity-status')?.dataset.state === 'loading', null, { timeout: 5000 });
    await page.waitForFunction(() => (
      document.querySelector('#my-tezos-overview-activity-status')?.dataset.state === 'complete'
        && document.querySelector('#my-tezos-overview-activity-list')?.dataset.quietRefreshSettled === 'true'
    ), null, { timeout: 15000 });
    const overviewQuietAfter = await page.evaluate(() => ({
      sameRow: document.querySelector('#my-tezos-overview-activity-list .portfolio-activity-item') === window.__overviewTransactionRow,
      focused: document.activeElement === window.__overviewTransactionButton,
      scrollTop: document.querySelector('#drawer-body')?.scrollTop || 0,
      selection: document.getSelection()?.toString() || ''
    }));
    assert(
      overviewQuietAfter.sameRow
        && overviewQuietAfter.focused
        && Math.abs(overviewQuietAfter.scrollTop - overviewQuietBefore.scrollTop) <= 1
        && overviewQuietAfter.selection === overviewQuietBefore.selection,
      `my tezos overview transactions: background refresh replaced or moved the reader ${JSON.stringify({ overviewQuietBefore, overviewQuietAfter })}`
    );
    const readerScrollTop = await page.evaluate(() => {
      const body = document.querySelector('#drawer-body');
      body.scrollTop = Math.min(body.scrollTop + 18, Math.max(0, body.scrollHeight - body.clientHeight));
      return body.scrollTop;
    });
    await page.waitForTimeout(150);
    const readerScrollAfter = await page.evaluate(() => document.querySelector('#drawer-body')?.scrollTop || 0);
    assert(Math.abs(readerScrollAfter - readerScrollTop) <= 1, `my tezos overview transactions: delayed refresh restore overwrote reader scroll ${JSON.stringify({ readerScrollTop, readerScrollAfter })}`);

    await page.setViewportSize({ width: 390, height: 844 });
    const overviewMobile = await page.evaluate(() => {
      const section = document.querySelector('#my-tezos-overview-transactions');
      const button = document.querySelector('#my-tezos-overview-transactions-link');
      const rows = Array.from(document.querySelectorAll('#my-tezos-overview-activity-list .portfolio-activity-item'));
      return {
        rowCount: rows.length,
        buttonWidth: button?.getBoundingClientRect().width || 0,
        sectionWidth: section?.getBoundingClientRect().width || 0,
        rowOverflow: rows.some((row) => row.scrollWidth > row.clientWidth + 1),
        sectionOverflow: section.scrollWidth > section.clientWidth + 1,
        pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
      };
    });
    assert(
      overviewMobile.rowCount === 3
        && overviewMobile.buttonWidth >= overviewMobile.sectionWidth - 34
        && !overviewMobile.rowOverflow
        && !overviewMobile.sectionOverflow
        && !overviewMobile.pageOverflow,
      `my tezos overview transactions: mobile preview is incomplete or clipped ${JSON.stringify(overviewMobile)}`
    );

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.locator('#my-tezos-overview-transactions-link').click();
    await page.waitForFunction(() => (
      document.querySelector('#my-tezos-tab-transactions')?.getAttribute('aria-selected') === 'true'
        && document.querySelector('#my-tezos-panel-transactions')?.hidden === false
    ), null, { timeout: 10000 });
    await page.locator('#my-tezos-tab-portfolio').click();
    try {
      await page.waitForFunction(() => ['complete', 'partial'].includes(document.querySelector('#portfolio-memory-status')?.dataset.state), null, { timeout: 30000 });
    } catch (error) {
      const state = await page.evaluate(async () => {
        const { myTezosRequestBroker: broker } = await import('/js/core/my-tezos-request-broker.mjs');
        return {
          fields: Object.fromEntries(['portfolio-memory-status', 'portfolio-history-status', 'portfolio-history-empty'].map(id => {
            const node = document.getElementById(id);
            return [id, { text: node?.textContent, state: node?.dataset.state }];
          })),
          visible: document.visibilityState,
          drawerOpen: document.getElementById('my-tezos-drawer')?.classList.contains('open'),
          broker: { paused: broker.paused, active: [...broker.active], inFlight: [...broker.inFlight.keys()], queued: [...broker.queues].map(([provider, jobs]) => [provider, jobs.map(job => job.url)]) },
          throttle: { queued: window.__tzktThrottle?.queueLength, dispatchIn: window.__tzktThrottle?.nextDispatchInMs }
        };
      });
      throw new Error(`Memory did not settle: ${JSON.stringify(state)}; pending=${JSON.stringify([...pendingMemoryRequests].map(request => request.url()))}; issues=${JSON.stringify(issues)}`, { cause: error });
    }
    await page.waitForFunction(() => document.querySelectorAll('#portfolio-activity-list .portfolio-activity-item').length >= 3, null, { timeout: 10000 });
    await page.locator('[data-portfolio-range="all"]').click();
    await page.waitForFunction(() => {
      const chart = window.Chart?.getChart(document.querySelector('#portfolio-history-chart'));
      const status = document.querySelector('#portfolio-history-status')?.textContent || '';
      const coverage = status.match(/(\d+)\/(\d+) exact points/i);
      return chart?.data?.datasets?.length === 1
        && chart.data.datasets[0].label === 'Total XTZ'
        && chart.data.datasets[0].data.length >= 4
        && Number(coverage?.[1]) >= 4;
    }, null, { timeout: 30000 });
    await page.locator('#my-tezos-tab-story').click();
    await page.waitForFunction(() => (
      document.querySelector('#my-tezos-tab-story')?.getAttribute('aria-selected') === 'true'
        && document.querySelector('#my-tezos-panel-story')?.hidden === false
        && /Memory is ready|No new indexed activity/i.test(document.querySelector('#portfolio-while-away')?.textContent || '')
    ), null, { timeout: 10000 });
    assert(
      await page.locator('#my-tezos-panel-portfolio #portfolio-while-away').count() === 0,
      'my tezos memory: browser-local recent chapter remained in Portfolio'
    );
    const storyAction = await page.evaluate(() => {
      const chapter = document.querySelector('.my-tezos-recent-chapter');
      const button = document.querySelector('#my-tezos-story-transactions');
      const rect = button?.getBoundingClientRect();
      const style = button ? getComputedStyle(button) : null;
      return {
        actionCount: chapter?.querySelectorAll('button').length || 0,
        injectedActions: document.querySelectorAll('[data-memory-show-unseen]').length,
        width: rect?.width || 0,
        height: rect?.height || 0,
        whiteSpace: style?.whiteSpace || '',
        textOverflow: button ? button.scrollWidth - button.clientWidth : Infinity
      };
    });
    assert(
      storyAction.actionCount === 1
        && storyAction.injectedActions === 0
        && storyAction.width >= 100
        && storyAction.height >= 44
        && storyAction.whiteSpace === 'nowrap'
        && storyAction.textOverflow <= 1,
      `my tezos memory: Story changes action is duplicated or collapsed ${JSON.stringify(storyAction)}`
    );
    await page.locator('#my-tezos-story-transactions').click();
    await page.waitForFunction(() => (
      document.querySelector('#my-tezos-tab-transactions')?.getAttribute('aria-selected') === 'true'
        && document.querySelector('#my-tezos-panel-transactions')?.hidden === false
        && document.querySelectorAll('#portfolio-activity-list .activity-item-transfer').length >= 3
    ), null, { timeout: 10000 });
    const transferLane = await page.evaluate(() => ({
      body: document.querySelector('#portfolio-activity-list')?.textContent || '',
      transferCount: document.querySelectorAll('#portfolio-activity-list .activity-item-transfer').length,
      nftCount: document.querySelectorAll('#portfolio-activity-list .activity-item-nft').length,
      background: getComputedStyle(document.querySelector('#portfolio-activity-list .activity-item-transfer')).backgroundColor,
      pills: Array.from(document.querySelectorAll('.transactions-mode-pills .my-tezos-pill')).map((button) => {
        const style = getComputedStyle(button);
        const rect = button.getBoundingClientRect();
        return {
          text: button.textContent.trim(),
          pressed: button.getAttribute('aria-pressed'),
          height: rect.height,
          paddingLeft: parseFloat(style.paddingLeft),
          paddingRight: parseFloat(style.paddingRight)
        };
      })
    }));
    assert(transferLane.transferCount >= 3 && transferLane.nftCount === 0 && !/Shared Smoke Artifact/.test(transferLane.body), `my tezos transactions: transfer lane mixed in NFT interactions ${JSON.stringify(transferLane)}`);
    assert(transferLane.pills.every((pill) => pill.height >= 36 && pill.paddingLeft >= 10 && pill.paddingRight >= 10), `my tezos transactions: mode pill geometry collapsed ${JSON.stringify(transferLane.pills)}`);
    await page.locator('[data-activity-filter="nft"]').click();
    await page.waitForFunction(() => (
      document.querySelectorAll('#portfolio-activity-list .activity-item-nft').length >= 1
        && document.querySelectorAll('#portfolio-activity-list .activity-item-transfer').length === 0
    ), null, { timeout: 5000 });
    const nftLane = await page.evaluate(() => ({
      body: document.querySelector('#portfolio-activity-list')?.textContent || '',
      background: getComputedStyle(document.querySelector('#portfolio-activity-list .activity-item-nft')).backgroundColor,
      selected: document.querySelector('[data-activity-filter="nft"]')?.getAttribute('aria-pressed')
    }));
    assert(/Shared Smoke Artifact/.test(nftLane.body) && nftLane.selected === 'true', `my tezos transactions: NFT interactions lane did not isolate NFT receipts ${JSON.stringify(nftLane)}`);
    assert(nftLane.background !== transferLane.background, `my tezos transactions: NFT and transfer rows need distinct subtle backgrounds ${JSON.stringify({ transfer: transferLane.background, nft: nftLane.background })}`);
    await page.locator('[data-activity-filter="transfers"]').click();
    await page.waitForFunction(() => document.querySelectorAll('#portfolio-activity-list .activity-item-transfer').length >= 3, null, { timeout: 5000 });
    const memoryState = await page.evaluate(async () => {
      const chart = window.Chart?.getChart(document.querySelector('#portfolio-history-chart'));
      const request = indexedDB.open('tezos-systems-my-tezos');
      const db = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const tx = db.transaction(['snapshots', 'activityByAccount', 'syncState'], 'readonly');
      const snapshotsRequest = tx.objectStore('snapshots').getAll();
      const activityRequest = tx.objectStore('activityByAccount').getAll();
      const syncRequest = tx.objectStore('syncState').getAll();
      const stored = await new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve({
          snapshots: snapshotsRequest.result,
          activity: activityRequest.result,
          sync: syncRequest.result
        });
        tx.onerror = () => reject(tx.error);
      });
      db.close();
      return {
        labels: chart?.data?.datasets?.map((dataset) => dataset.label) || [],
        boundary: document.querySelector('.portfolio-history-boundary')?.textContent || '',
        whileAway: document.querySelector('#portfolio-while-away')?.textContent || '',
        activity: document.querySelector('#portfolio-activity-list')?.textContent || '',
        historyStatus: document.querySelector('#portfolio-history-status')?.textContent || '',
        historyScope: document.querySelector('#my-tezos-wallet-scope')?.value || '',
        historyOptions: Array.from(document.querySelectorAll('#my-tezos-wallet-scope option')).map((option) => option.value),
        chartPoints: chart?.$exactHistoryPoints || [],
        lastSeen: Number(localStorage.getItem('tezos-systems-my-tezos-memory-last-seen-v1')) || 0,
        historical: stored.snapshots.filter((row) => row.sourceType === 'historical-total').length,
        observed: stored.snapshots.filter((row) => row.sourceType === 'observed').length,
        activityRows: stored.activity.length,
        sync: stored.sync
      };
    });
    assert(JSON.stringify(memoryState.labels) === JSON.stringify(['Total XTZ']), `my tezos memory: exact chart must render one total line ${JSON.stringify(memoryState)}`);
    assert(/full_balance/i.test(memoryState.boundary) && /never replaced/i.test(memoryState.boundary) && !/P&L/i.test(memoryState.activity), `my tezos memory: exact-source boundary missing ${JSON.stringify(memoryState)}`);
    assert(/Memory is ready|No new indexed activity/i.test(memoryState.whileAway) && memoryState.lastSeen > 0, `my tezos memory: initial reconstruction was mislabeled as unseen ${JSON.stringify(memoryState)}`);
    assert(/Moved XTZ|Staked XTZ|Delegate changed/i.test(memoryState.activity), `my tezos memory: human activity classification missing ${memoryState.activity}`);
    assert(memoryState.historical >= 8 && memoryState.observed >= 1 && memoryState.activityRows >= 4, `my tezos memory: normalized records were not persisted ${JSON.stringify(memoryState)}`);
    assert(
      memoryState.historyScope === 'all'
        && memoryState.historyOptions.includes(SAMPLE_ADDRESS)
        && memoryState.historyOptions.includes(SAMPLE_ADDRESS_2)
        && /exact points/i.test(memoryState.historyStatus)
        && memoryState.chartPoints.every((point) => point.confidence === 'exact' && Number.isFinite(point.level)),
      `my tezos memory: portfolio/address selector or exact point receipt missing ${JSON.stringify(memoryState)}`
    );
    assert(memoryState.sync.some((state) => state.stream === 'activity' && state.windowComplete === true), `my tezos memory: resumable activity state missing ${JSON.stringify(memoryState.sync)}`);
    assert(
      memoryState.sync.filter((state) => state.stream === 'balance-history').length === 2
        && memoryState.sync.filter((state) => state.stream === 'balance-history').every((state) => (
          state.scheduleVersion === 'exact-total-xtz-v1'
            && Number.isFinite(state.dailyCoverage?.target)
            && Number.isFinite(state.lifetimeCoverage?.target)
            && Array.isArray(state.gaps)
        )),
      `my tezos memory: independent exact coverage state missing ${JSON.stringify(memoryState.sync)}`
    );

    await page.locator('#my-tezos-tab-story').click();
    await page.evaluate(() => {
      localStorage.setItem('tezos-systems-my-tezos-memory-last-seen-v1', String(Date.now() - 90 * 60 * 1000));
      window.dispatchEvent(new CustomEvent('my-tezos-portfolio-changed', { detail: { source: 'story-changes-action-smoke' } }));
    });
    await page.waitForFunction(() => (
      document.querySelector('#portfolio-memory-status')?.dataset.state === 'complete'
        && /change(?:s)? since your last visit/i.test(document.querySelector('#portfolio-while-away')?.textContent || '')
    ), null, { timeout: 15000 });
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileStoryAction = await page.evaluate(() => {
      const chapter = document.querySelector('.my-tezos-recent-chapter');
      const button = document.querySelector('#my-tezos-story-transactions');
      const rect = button?.getBoundingClientRect();
      return {
        actionCount: chapter?.querySelectorAll('button').length || 0,
        injectedActions: document.querySelectorAll('[data-memory-show-unseen]').length,
        width: rect?.width || 0,
        chapterWidth: chapter?.getBoundingClientRect().width || 0,
        textOverflow: button ? button.scrollWidth - button.clientWidth : Infinity,
        pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    });
    assert(
      mobileStoryAction.actionCount === 1
        && mobileStoryAction.injectedActions === 0
        && mobileStoryAction.width >= mobileStoryAction.chapterWidth - 34
        && mobileStoryAction.textOverflow <= 1
        && mobileStoryAction.pageOverflow <= 1,
      `my tezos memory: mobile Story changes action is duplicated, narrow, or overflowing ${JSON.stringify(mobileStoryAction)}`
    );
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.locator('#my-tezos-story-transactions').click();
    await page.waitForFunction(() => (
      document.querySelector('#my-tezos-tab-transactions')?.getAttribute('aria-selected') === 'true'
        && document.querySelector('[data-activity-filter="nft"]')?.getAttribute('aria-pressed') === 'true'
        && document.querySelectorAll('#portfolio-activity-list .activity-item-nft').length >= 1
        && document.querySelectorAll('#portfolio-activity-list .activity-item-transfer').length === 0
    ), null, { timeout: 10000 });

    await context.close();
    assert(issues.length === 0, `my tezos memory browser issues:\n${issues.join('\n')}`);
    log('ok - my tezos memory smoke');
  }

  async function smokeMyTezosCollection(browser, baseUrl) {
    const issues = [];
    let objktRequests = 0;
    const objktAddressBatches = [];
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(context);
    context.on('request', (request) => {
      if (request.url().includes('data.objkt.com/v3/graphql') && request.postData()?.includes('MyTezosCollection')) {
        objktRequests += 1;
        try {
          objktAddressBatches.push(JSON.parse(request.postData() || '{}')?.variables?.addresses || []);
        } catch {}
      }
    });
    await context.addInitScript(({ first, second }) => {
      localStorage.setItem('tezos-systems-theme', 'aurora');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
      localStorage.setItem('tezos-systems-my-baker-address', first);
      localStorage.setItem('tezos-systems-saved-addresses', JSON.stringify([
        { network: 'tezos-l1', address: first, label: 'Artist', included: true, addedAt: Date.now() - 1000 },
        { network: 'tezos-l1', address: second, label: 'Collector', included: true, addedAt: Date.now() }
      ]));
    }, { first: SAMPLE_ADDRESS, second: SAMPLE_ADDRESS_2 });
    const page = await context.newPage();
    attachIssueCollectors(page, 'my tezos collection', issues);
    await openMyTezosSmokeView(page, baseUrl, 'collection');
    await page.waitForFunction(() => document.querySelector('#collection-status')?.dataset.state === 'complete', null, { timeout: 30000 });
    await page.waitForFunction(() => {
      const assets = Number(document.querySelector('[data-collection-total="assets"] strong')?.textContent);
      const editions = Number(document.querySelector('[data-collection-total="editions"] strong')?.textContent);
      const cards = document.querySelectorAll('#collection-grid .collection-asset-card').length;
      const image = document.querySelector('#collection-grid .collection-asset-card img');
      return assets === 137 && editions === 139 && cards === 100 && image?.complete && image.naturalWidth > 0;
    }, null, { timeout: 10000 });
    const collected = await page.evaluate(() => ({
      assets: document.querySelector('[data-collection-total="assets"] strong')?.textContent || '',
      editions: document.querySelector('[data-collection-total="editions"] strong')?.textContent || '',
      cards: document.querySelectorAll('#collection-grid .collection-asset-card').length,
      images: document.querySelectorAll('#collection-grid .collection-asset-card img').length,
      imageFallbacks: document.querySelectorAll('#collection-grid .collection-image-fallback').length,
      firstCard: document.querySelector('#collection-grid .collection-asset-card strong')?.textContent || '',
      profile: document.querySelector('#collection-profiles')?.textContent || '',
      body: document.querySelector('#my-tezos-panel-collection')?.textContent || '',
      flaggedHidden: document.querySelector('#collection-spam-toggle')?.hidden === false,
      loadMoreVisible: document.querySelector('#collection-load-more')?.hidden === false,
      overflow: document.querySelector('#my-tezos-panel-collection')?.scrollWidth - document.querySelector('#my-tezos-panel-collection')?.clientWidth,
      scope: (() => {
        const select = document.querySelector('#my-tezos-wallet-scope');
        const heading = select?.closest('.my-tezos-wallet-scope-bar');
        const style = select ? getComputedStyle(select) : null;
        const rect = select?.getBoundingClientRect();
        return {
          height: rect?.height || 0,
          width: rect?.width || 0,
          headingWidth: heading?.getBoundingClientRect().width || 0,
          barOverflow: heading ? heading.scrollWidth - heading.clientWidth : Infinity,
          metricTops: Array.from(document.querySelectorAll('.my-tezos-scope-totals article'))
            .map((article) => Math.round(article.getBoundingClientRect().top)),
          overflow: select ? select.scrollWidth - select.clientWidth : Infinity,
          paddingRight: Number.parseFloat(style?.paddingRight || '0'),
          fontFamily: style?.fontFamily || ''
        };
      })(),
      pills: Array.from(document.querySelectorAll('#my-tezos-panel-collection .my-tezos-pill')).filter((button) => !button.hidden).map((button) => {
        const style = getComputedStyle(button);
        const rect = button.getBoundingClientRect();
        return {
          text: button.textContent.trim(),
          height: rect.height,
          paddingLeft: parseFloat(style.paddingLeft),
          paddingRight: parseFloat(style.paddingRight)
        };
      })
    }));
    assert(
      collected.scope.height >= 40
        && collected.scope.height <= 48
        && collected.scope.width <= collected.scope.headingWidth + 1
        && collected.scope.barOverflow <= 1
        && collected.scope.metricTops.every(top => top === 0)
        && collected.scope.overflow <= 1
        && collected.scope.paddingRight >= 36
        && !/mono/i.test(collected.scope.fontFamily),
      `my tezos collection: wallet scope selector is clipped or still styled like an address field ${JSON.stringify(collected.scope)}`
    );
    assert(Number(collected.assets) === 137 && Number(collected.editions) === 139 && collected.cards === 100, `my tezos collection: complete multi-wallet holdings did not aggregate beyond the first page ${JSON.stringify(collected)}`);
    assert(collected.images === 100 && collected.imageFallbacks === 0, `my tezos collection: HEN/Objkt media fallback path did not keep thumbnails available ${JSON.stringify(collected)}`);
    assert(collected.firstCard === 'Shared Smoke Artifact', `my tezos collection: multi-page aggregation did not keep the newest holding first ${JSON.stringify(collected)}`);
    assert(/QA Artist/.test(collected.profile) && /never a realizable portfolio value/i.test(collected.body) && !/\bCollection value\b/i.test(collected.body), `my tezos collection: profile or valuation boundary missing ${JSON.stringify(collected)}`);
    assert(collected.flaggedHidden && collected.loadMoreVisible && collected.overflow <= 1, `my tezos collection: flagged, progressive grid, or mobile geometry state failed ${JSON.stringify(collected)}`);
    assert(collected.pills.every((pill) => pill.height >= 36 && pill.paddingLeft >= 10 && pill.paddingRight >= 10), `my tezos collection: control pill geometry collapsed ${JSON.stringify(collected.pills)}`);
    assert(objktRequests === 2, `my tezos collection: complete 139-row coverage should use two Objkt pages (${objktRequests})`);

    const selectCollectionScope = async (value, expectedAddresses, label) => {
      const requestStart = objktAddressBatches.length;
      await page.selectOption('#my-tezos-wallet-scope', value);
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline) {
        const recentBatches = objktAddressBatches.slice(requestStart);
        const status = await page.locator('#collection-status').getAttribute('data-state');
        const scopeValue = await page.locator('#my-tezos-wallet-scope').inputValue();
        if (
          scopeValue === value
            && status === 'complete'
            && recentBatches.length >= 2
            && recentBatches.slice(-2).every((addresses) => (
              JSON.stringify(addresses) === JSON.stringify(expectedAddresses)
            ))
        ) return;
        await sleep(100);
      }
      throw new Error(`my tezos collection: ${label} scope did not settle with constrained Objkt reads ${JSON.stringify(objktAddressBatches)}`);
    };

    await selectCollectionScope(SAMPLE_ADDRESS_2, [SAMPLE_ADDRESS_2], 'specific-wallet');
    await selectCollectionScope('all', [SAMPLE_ADDRESS, SAMPLE_ADDRESS_2], 'all-wallet');

    await page.locator('#collection-load-more').click();
    await page.waitForFunction(() => document.querySelectorAll('#collection-grid .collection-asset-card').length === 137, null, { timeout: 5000 });

    await page.locator('[data-collection-mode="created"]').click();
    await page.waitForFunction(() => /Created Smoke Artifact/.test(document.querySelector('#collection-grid')?.textContent || ''), null, { timeout: 5000 });
    await page.locator('#collection-spam-toggle').click();
    await page.locator('[data-collection-mode="collected"]').click();
    await page.locator('#collection-load-more').click();
    await page.waitForFunction(() => (
      document.querySelectorAll('#collection-grid .collection-asset-card').length === 138
        && /Flagged Smoke Asset/.test(document.querySelector('#collection-grid')?.textContent || '')
    ), null, { timeout: 5000 });

    await context.close();
    assert(issues.length === 0, `my tezos collection browser issues:\n${issues.join('\n')}`);
    const failureContext = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    await installFeatureMocks(failureContext);
    await failureContext.addInitScript(address => {
      localStorage.setItem('tezos-systems-theme', 'clean');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-baker-address', address);
      localStorage.setItem('tezos-systems-saved-addresses', JSON.stringify([{ network: 'tezos-l1', address, included: true, addedAt: Date.now() }]));
    }, SAMPLE_ADDRESS);
    let collectionUnavailable = true;
    await failureContext.route('**/v3/graphql', route => {
      if (collectionUnavailable && route.request().postData()?.includes('MyTezosCollection')) {
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Collection temporarily unavailable' }) });
      }
      return route.fallback();
    });
    const failurePage = await failureContext.newPage();
    await openMyTezosSmokeView(failurePage, baseUrl, 'collection');
    await failurePage.waitForFunction(() => document.querySelector('#collection-status')?.dataset.state === 'error');
    assert((await failurePage.locator('#collection-empty').innerText()).includes('Collection unavailable'), 'A failed first read must be visibly unavailable, not empty');
    assert((await failurePage.locator('#collection-summary strong').allTextContents()).every(value => value === '—'), 'Failed first reads must not invent zero holdings');
    await failurePage.locator('[data-collection-mode="created"]').click();
    assert((await failurePage.locator('#collection-empty').innerText()).includes('Collection unavailable'), 'Changing collection modes must retain the source failure');
    await failurePage.locator('[data-collection-mode="collected"]').click();
    collectionUnavailable = false;
    await failurePage.evaluate(async () => {
      const module = await import('/js/features/my-tezos-collection.mjs');
      await module.refreshMyTezosCollection({ force: true, background: true });
    });
    await failurePage.waitForFunction(() => document.querySelector('#collection-status')?.dataset.state === 'complete');
    const lastGood = await failurePage.evaluate(() => {
      window.__collectionLastGood = document.querySelector('#collection-grid .collection-asset-card');
      return document.querySelector('[data-collection-total="assets"] strong').textContent;
    });
    collectionUnavailable = true;
    await failurePage.evaluate(async () => {
      const module = await import('/js/features/my-tezos-collection.mjs');
      await module.refreshMyTezosCollection({ force: true, background: true });
    });
    assert(await failurePage.locator('[data-collection-total="assets"] strong').textContent() === lastGood, 'A later source failure retains the last complete holdings');
    assert(await failurePage.evaluate(() => window.__collectionLastGood === document.querySelector('#collection-grid .collection-asset-card')), 'Failure keeps the exact artwork node being read');
    await failureContext.close();
    log('ok - my tezos collection, honest source failure, recovery, and last-good holdings');
  }

  async function smokeMyTezosTezosX(browser, baseUrl) {
    const issues = [];
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(context);
    await context.addInitScript(({ first, second }) => {
      localStorage.setItem('tezos-systems-theme', 'dark');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
      localStorage.setItem('tezos-systems-my-baker-address', first);
      localStorage.setItem('tezos-systems-saved-addresses', JSON.stringify([
        { network: 'tezos-l1', address: first, label: 'Primary', included: true, addedAt: Date.now() - 1000 },
        { network: 'tezos-l1', address: second, label: 'Second', included: true, addedAt: Date.now() }
      ]));
    }, { first: SAMPLE_ADDRESS, second: SAMPLE_ADDRESS_2 });
    const page = await context.newPage();
    attachIssueCollectors(page, 'my tezos tezos x', issues);
    await openMyTezosSmokeView(page, baseUrl, 'tezos-x');
    await page.waitForFunction(() => document.querySelector('#tezosx-status')?.dataset.state === 'empty', null, { timeout: 5000 });

    const emptyStatus = await page.evaluate(() => ({
      state: document.querySelector('#tezosx-status')?.dataset.state || '',
      text: document.querySelector('#tezosx-status')?.textContent?.trim() || '',
      emptyHeading: document.querySelector('#tezosx-account-list .tezosx-empty strong')?.textContent?.trim() || ''
    }));
    assert(
      emptyStatus.state === 'empty'
        && emptyStatus.text === 'Link an Etherlink account to begin.'
        && emptyStatus.emptyHeading === 'No linked Etherlink accounts',
      `my tezos tezos x: opened empty view retained its pre-activation status copy ${JSON.stringify(emptyStatus)}`
    );

    await page.locator('#tezosx-add-address').fill('not-an-address');
    await page.locator('#tezosx-add-form button[type="submit"]').click();
    await page.waitForFunction(() => /valid Etherlink 0x address/i.test(document.querySelector('#tezosx-management-status')?.textContent || ''), null, { timeout: 5000 });
    await page.locator('#tezosx-add-address').fill(SAMPLE_ETHERLINK_ADDRESS.toUpperCase().replace('0X', '0x'));
    await page.locator('#tezosx-add-label').fill('L2 Vault');
    await page.locator('#tezosx-add-form button[type="submit"]').click();
    await page.waitForFunction(() => ['complete', 'partial'].includes(document.querySelector('#tezosx-status')?.dataset.state), null, { timeout: 30000 });
    await page.waitForFunction(() => /Smoke USD/.test(document.querySelector('#tezosx-details')?.textContent || ''), null, { timeout: 10000 });

    await page.locator('#tezosx-add-address').fill(SAMPLE_ETHERLINK_ADDRESS);
    await page.locator('#tezosx-add-form button[type="submit"]').click();
    await page.waitForFunction(() => /already linked on this device/i.test(document.querySelector('#tezosx-management-status')?.textContent || ''), null, { timeout: 5000 });
    await page.locator('#tezosx-account-list details summary').click();
    const association = page.locator(`[data-tezosx-l1-link="${SAMPLE_ETHERLINK_ADDRESS}"][value="${SAMPLE_ADDRESS_2}"]`);
    await association.check();
    await page.waitForFunction(({ l2, second }) => {
      const rows = JSON.parse(localStorage.getItem('tezos-systems-linked-etherlink-accounts-v1') || '[]');
      return rows.find((row) => row.address === l2)?.linkedL1Addresses?.includes(second);
    }, { l2: SAMPLE_ETHERLINK_ADDRESS, second: SAMPLE_ADDRESS_2 }, { timeout: 5000 });

    const state = await page.evaluate((l2) => {
      const rows = JSON.parse(localStorage.getItem('tezos-systems-linked-etherlink-accounts-v1') || '[]');
      const panel = document.querySelector('#my-tezos-panel-tezos-x');
      const refresh = document.querySelector('#tezosx-refresh');
      const tablist = document.querySelector('.my-tezos-tabs');
      const selectedTab = tablist?.querySelector('[role="tab"][aria-selected="true"]');
      const tablistRect = tablist?.getBoundingClientRect();
      const selectedTabRect = selectedTab?.getBoundingClientRect();
      return {
        rows,
        linkedRows: document.querySelectorAll('#tezosx-account-list .tezosx-account-row').length,
        native: document.querySelector('[data-tezosx-total="native"] strong')?.textContent || '',
        erc20: document.querySelector('[data-tezosx-total="erc20"] strong')?.textContent || '',
        nfts: document.querySelector('[data-tezosx-total="nfts"] strong')?.textContent || '',
        transactions: document.querySelector('[data-tezosx-total="transactions"] strong')?.textContent || '',
        copy: panel?.textContent || '',
        detail: document.querySelector('#tezosx-details')?.textContent || '',
        overflow: (panel?.scrollWidth || 0) - (panel?.clientWidth || 0),
        refreshClips: (refresh?.scrollWidth || 0) - (refresh?.clientWidth || 0),
        refreshGeometry: (() => {
          const style = refresh ? getComputedStyle(refresh) : null;
          const rect = refresh?.getBoundingClientRect();
          return {
            height: rect?.height || 0,
            paddingLeft: Number.parseFloat(style?.paddingLeft || '0'),
            paddingRight: Number.parseFloat(style?.paddingRight || '0')
          };
        })(),
        hiddenLoadMoreDisplay: getComputedStyle(document.querySelector('#tezosx-load-more')).display,
        selectedTabVisible: Boolean(
          tablistRect
            && selectedTabRect
            && selectedTabRect.left >= tablistRect.left - 1
            && selectedTabRect.right <= tablistRect.right + 1
        ),
        selected: rows.find((row) => row.address === l2) || null
      };
    }, SAMPLE_ETHERLINK_ADDRESS);
    assert(state.rows.length === 1 && state.linkedRows === 1 && state.selected?.linkedL1Addresses?.length === 2, `my tezos tezos x: deduplication or many-to-many links failed ${JSON.stringify(state)}`);
    assert(/2\.5/.test(state.native) && state.erc20 === '1' && state.nfts === '1' && state.transactions === '42', `my tezos tezos x: account summary incorrect ${JSON.stringify(state)}`);
    assert(/Linked on this device/i.test(state.copy) && /not an ownership proof/i.test(state.copy) && /error/i.test(state.detail) && /Blockscout receipt/i.test(state.detail), `my tezos tezos x: L2 provenance or revert state missing ${JSON.stringify(state)}`);
    assert(state.overflow <= 1 && state.refreshClips <= 1 && state.selectedTabVisible, `my tezos tezos x: mobile controls overflow ${JSON.stringify(state)}`);
    assert(
      state.refreshGeometry.height >= 40
        && state.refreshGeometry.paddingLeft >= 12
        && state.refreshGeometry.paddingRight >= 12
        && state.hiddenLoadMoreDisplay === 'none',
      `my tezos tezos x: actions are cramped or hidden load-more leaked into the layout ${JSON.stringify(state)}`
    );

    await page.locator('#tezosx-account-list details summary').click();
    await page.locator(`[data-tezosx-l1-link="${SAMPLE_ETHERLINK_ADDRESS}"][value="${SAMPLE_ADDRESS_2}"]`).uncheck();
    await page.selectOption('#my-tezos-wallet-scope', SAMPLE_ADDRESS_2);
      await page.waitForFunction((address) => (
        document.querySelector('#my-tezos-wallet-scope')?.value === address
          && document.querySelector('#tezosx-account-scope')?.disabled === true
          && document.querySelector('[data-tezosx-total="native"] strong')?.textContent?.startsWith('0')
          && document.querySelector('.tezosx-account-row.out-of-scope [data-tezosx-select]')?.disabled === true
      ), SAMPLE_ADDRESS_2, { timeout: 10000 });
    await page.selectOption('#my-tezos-wallet-scope', 'all');
    await page.waitForFunction(() => /2\.5/.test(document.querySelector('[data-tezosx-total="native"] strong')?.textContent || ''), null, { timeout: 10000 });

    const include = page.locator(`[data-tezosx-include="${SAMPLE_ETHERLINK_ADDRESS}"]`);
    await include.uncheck();
    await page.waitForFunction(() => /No linked accounts are included/i.test(document.querySelector('#tezosx-status')?.textContent || ''), null, { timeout: 5000 });

    await context.close();
    assert(issues.length === 0, `my tezos tezos x browser issues:\n${issues.join('\n')}`);
    log('ok - my tezos tezos x smoke');
  }

  async function smokeMyTezosViewLiveRefresh(browser, baseUrl) {
    const issues = [];
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(context, { myTezosViewLiveRefresh: true });
    await context.addInitScript(({ l1, l2 }) => {
      localStorage.setItem('tezos-systems-theme', 'matrix');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
      localStorage.setItem('tezos-systems-my-baker-address', l1);
      localStorage.setItem('tezos-systems-saved-addresses', JSON.stringify([
        { network: 'tezos-l1', address: l1, label: 'Live Primary', included: true, addedAt: Date.now() }
      ]));
      localStorage.setItem('tezos-systems-linked-etherlink-accounts-v1', JSON.stringify([
        {
          chainId: 42793,
          address: l2,
          label: 'Live L2',
          linkedL1Addresses: [l1],
          included: true,
          addedAt: Date.now()
        }
      ]));
      window.__MY_TEZOS_VIEW_REFRESH_MS__ = 1000;
    }, { l1: SAMPLE_ADDRESS, l2: SAMPLE_ETHERLINK_ADDRESS });

    const page = await context.newPage();
    const activeViewRequests = [];
    page.on('request', (request) => {
      const url = request.url();
      if (
        url.includes('/accounts/activity?')
        || (url.includes('/accounts?') && url.includes('address.in='))
        || (url.includes('data.objkt.com/v3/graphql') && request.postData()?.includes('MyTezosCollection'))
        || url.includes(`/addresses/${SAMPLE_ETHERLINK_ADDRESS}`)
        || url === 'https://node.mainnet.etherlink.com/'
      ) {
        activeViewRequests.push(url);
      }
    });
    attachIssueCollectors(page, 'my tezos active-view live refresh', issues);
    await openMyTezosSmokeView(page, baseUrl, 'overview');

    await page.waitForFunction(() => document.querySelector('#my-tezos-overview-activity-status')?.dataset.state === 'complete', null, { timeout: 15000 });
    const overviewReceipts = Number(await page.locator('[data-transactions-total="receipts"] strong').innerText());
    await page.waitForFunction((before) => (
      Number(document.querySelector('[data-transactions-total="receipts"] strong')?.textContent) > before
    ), overviewReceipts, { timeout: 10000 });

    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForFunction(() => document.querySelector('#my-tezos-scope-freshness')?.dataset.state === 'complete');
      const overviewBefore = await page.evaluate(() => {
        const body = document.querySelector('#drawer-body');
        const total = document.querySelector('[data-my-tezos-scope-total="total"] strong');
        const scope = document.querySelector('#my-tezos-wallet-scope');
        const label = document.querySelector('.my-tezos-balance-hero h3');
        scope.focus({ preventScroll: true });
        body.scrollTop = 120;
        const range = document.createRange();
        range.selectNodeContents(label);
        const selection = document.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        window.__liveOverviewTotal = total;
        window.__liveOverviewScope = scope;
        window.__liveOverviewLabel = label;
        return { total: total.textContent, scrollTop: body.scrollTop, pageScroll: window.scrollY, selection: selection.toString(), scope: scope.value };
      });
      await page.waitForFunction(before => (
        document.querySelector('[data-my-tezos-scope-total="total"] strong')?.textContent !== before
          && document.querySelector('#my-tezos-scope-freshness')?.dataset.state === 'complete'
      ), overviewBefore.total, { timeout: 10000 });
      const overviewAfter = await page.evaluate(() => ({
        sameTotal: document.querySelector('[data-my-tezos-scope-total="total"] strong') === window.__liveOverviewTotal,
        sameLabel: document.querySelector('.my-tezos-balance-hero h3') === window.__liveOverviewLabel,
        focused: document.activeElement === window.__liveOverviewScope,
        selection: document.getSelection().toString(),
        scrollTop: document.querySelector('#drawer-body').scrollTop,
        pageScroll: window.scrollY,
        scope: document.querySelector('#my-tezos-wallet-scope').value,
        activeView: document.querySelector('[data-my-tezos-view][aria-selected="true"]')?.dataset.myTezosView
      }));
      assert(overviewAfter.sameTotal && overviewAfter.sameLabel && overviewAfter.focused
        && overviewAfter.selection === overviewBefore.selection && overviewAfter.scope === overviewBefore.scope
        && overviewAfter.scrollTop === overviewBefore.scrollTop && overviewAfter.pageScroll === overviewBefore.pageScroll
        && overviewAfter.activeView === 'overview', `Overview balance refresh moved the reader or replaced retained content ${JSON.stringify({ overviewBefore, overviewAfter })}`);
      const overviewReaderScroll = await page.evaluate(async () => {
        const body = document.querySelector('#drawer-body');
        body.scrollTop += 40;
        const intended = body.scrollTop;
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return { intended, actual: body.scrollTop };
      });
      assert(overviewReaderScroll.actual === overviewReaderScroll.intended, 'Overview reconciliation must not overwrite a new reader scroll');

    }
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.locator('#my-tezos-tab-transactions').click();
    await page.waitForFunction(() => document.querySelector('#portfolio-memory-status')?.dataset.state === 'complete', null, { timeout: 15000 });
    await page.locator('[data-activity-filter="nft"]').click();
    await page.waitForFunction(() => document.querySelectorAll('#portfolio-activity-list .activity-item-nft').length > 0, null, { timeout: 5000 });
    const transactionBefore = await page.evaluate(() => {
      const drawer = document.querySelector('#drawer-body');
      const list = document.querySelector('#portfolio-activity-list');
      const row = list?.querySelector('.portfolio-activity-item');
      const filter = document.querySelector('[data-activity-filter="nft"]');
      const text = row?.querySelector('strong')?.firstChild;
      drawer.scrollTop = Math.min(240, Math.max(0, drawer.scrollHeight - drawer.clientHeight));
      filter?.focus({ preventScroll: true });
      if (text?.length) {
        const range = document.createRange();
        range.setStart(text, 0);
        range.setEnd(text, Math.min(6, text.length));
        const selection = document.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      }
      window.__liveTransactionRow = row;
      window.__liveTransactionFilter = filter;
      return {
        receipts: Number(document.querySelector('[data-transactions-total="receipts"] strong')?.textContent) || 0,
        scrollTop: drawer.scrollTop,
        selection: document.getSelection()?.toString() || ''
      };
    });
    try {
      await page.waitForFunction((before) => (
        Number(document.querySelector('[data-transactions-total="receipts"] strong')?.textContent) > before
      ), transactionBefore.receipts, { timeout: 30000 });
    } catch (error) {
      const debug = await page.evaluate(() => ({
        receipts: Number(document.querySelector('[data-transactions-total="receipts"] strong')?.textContent) || 0,
        status: document.querySelector('#portfolio-memory-status')?.textContent || '',
        statusState: document.querySelector('#portfolio-memory-status')?.dataset.state || '',
        activeView: document.querySelector('[data-my-tezos-view][aria-selected="true"]')?.dataset.myTezosView || '',
        drawerOpen: document.querySelector('#my-tezos-drawer')?.classList.contains('open') === true,
        visibility: document.visibilityState
      }));
      throw new Error(`my tezos live transactions did not advance ${JSON.stringify({ transactionBefore, debug, activeViewRequests: activeViewRequests.slice(-20) })}\n${error.message}`);
    }
    const transactionAfter = await page.evaluate(() => ({
      sameRow: document.querySelector('#portfolio-activity-list .portfolio-activity-item') === window.__liveTransactionRow,
      focused: document.activeElement === window.__liveTransactionFilter,
      selected: document.querySelector('[data-activity-filter="nft"]')?.getAttribute('aria-pressed'),
      activeView: document.querySelector('[data-my-tezos-view][aria-selected="true"]')?.dataset.myTezosView || '',
      scrollTop: document.querySelector('#drawer-body')?.scrollTop || 0,
      selection: document.getSelection()?.toString() || ''
    }));
    assert(
      transactionAfter.sameRow
        && transactionAfter.focused
        && transactionAfter.selected === 'true'
        && transactionAfter.activeView === 'transactions'
        && transactionAfter.selection === transactionBefore.selection
        && Math.abs(transactionAfter.scrollTop - transactionBefore.scrollTop) <= 1,
      `my tezos live transactions reset the active filter or reader state ${JSON.stringify({ transactionBefore, transactionAfter })}`
    );

    await page.locator('#my-tezos-tab-story').click();
    await page.waitForFunction(() => document.querySelector('#portfolio-memory-status')?.dataset.state === 'complete', null, { timeout: 15000 });
    // The transaction ledger can be complete before the account's Story arrives.
    // Select published Story text, rather than the initial loading placeholder.
    await page.locator('#my-tezos-story-content .my-tezos-story-card:not([aria-busy="true"])').waitFor({ state: 'visible', timeout: 15000 });
    const storyBefore = await page.evaluate(() => {
      const drawer = document.querySelector('#drawer-body');
      const content = document.querySelector('#my-tezos-story-content');
      const button = document.querySelector('#my-tezos-story-transactions');
      const text = content?.querySelector('strong')?.firstChild;
      drawer.scrollTop = Math.min(220, Math.max(0, drawer.scrollHeight - drawer.clientHeight));
      button?.focus({ preventScroll: true });
      if (text?.length) {
        const range = document.createRange();
        range.setStart(text, 0);
        range.setEnd(text, Math.min(6, text.length));
        const selection = document.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      }
      window.__liveStoryContent = content;
      window.__liveStoryButton = button;
      return {
        receipts: Number(document.querySelector('[data-transactions-total="receipts"] strong')?.textContent) || 0,
        scrollTop: drawer.scrollTop,
        selection: document.getSelection()?.toString() || ''
      };
    });
    await page.waitForFunction((before) => (
      Number(document.querySelector('[data-transactions-total="receipts"] strong')?.textContent) > before
        && document.querySelector('#portfolio-memory-status')?.dataset.state === 'complete'
    ), storyBefore.receipts, { timeout: 10000 });
    const storyAfter = await page.evaluate(() => ({
      sameContent: document.querySelector('#my-tezos-story-content') === window.__liveStoryContent,
      focused: document.activeElement === window.__liveStoryButton,
      activeView: document.querySelector('[data-my-tezos-view][aria-selected="true"]')?.dataset.myTezosView || '',
      scrollTop: document.querySelector('#drawer-body')?.scrollTop || 0,
      selection: document.getSelection()?.toString() || ''
    }));
    assert(
      storyAfter.sameContent
        && storyAfter.focused
        && storyAfter.activeView === 'story'
        && storyAfter.selection === storyBefore.selection
        && Math.abs(storyAfter.scrollTop - storyBefore.scrollTop) <= 1,
      `my tezos live Story reset its view model or reader state ${JSON.stringify({ storyBefore, storyAfter })}`
    );

    await page.locator('#my-tezos-tab-portfolio').click();
    await page.waitForFunction(() => document.querySelector('#portfolio-freshness')?.dataset.state === 'complete', null, { timeout: 15000 });
    const portfolioBefore = await page.evaluate((address) => {
      const drawer = document.querySelector('#drawer-body');
      const input = document.querySelector(`[data-portfolio-label="${address}"]`);
      const summary = document.querySelector('#portfolio-summary');
      const row = document.querySelector(`.portfolio-wallet-row[data-address="${address}"]`);
      input?.focus({ preventScroll: true });
      input?.setSelectionRange(1, 5);
      drawer.scrollTop = Math.min(220, Math.max(0, drawer.scrollHeight - drawer.clientHeight));
      window.__livePortfolioInput = input;
      window.__livePortfolioSummary = summary;
      window.__livePortfolioRow = row;
      window.__livePortfolioChart = window.Chart?.getChart(document.querySelector('#portfolio-history-chart')) || null;
      return {
        total: document.querySelector('[data-portfolio-total="total"] strong')?.textContent || '',
        scrollTop: drawer.scrollTop
      };
    }, SAMPLE_ADDRESS);
    await page.waitForFunction((before) => (
      document.querySelector('[data-portfolio-total="total"] strong')?.textContent !== before
        && document.querySelector('#portfolio-freshness')?.dataset.state === 'complete'
    ), portfolioBefore.total, { timeout: 10000 });
    const portfolioAfter = await page.evaluate((address) => {
      const input = document.querySelector(`[data-portfolio-label="${address}"]`);
      return {
        sameSummary: document.querySelector('#portfolio-summary') === window.__livePortfolioSummary,
        sameRow: document.querySelector(`.portfolio-wallet-row[data-address="${address}"]`) === window.__livePortfolioRow,
        sameChart: (window.Chart?.getChart(document.querySelector('#portfolio-history-chart')) || null) === window.__livePortfolioChart,
        focused: document.activeElement === window.__livePortfolioInput,
        selectionStart: input?.selectionStart,
        selectionEnd: input?.selectionEnd,
        activeView: document.querySelector('[data-my-tezos-view][aria-selected="true"]')?.dataset.myTezosView || '',
        scrollTop: document.querySelector('#drawer-body')?.scrollTop || 0
      };
    }, SAMPLE_ADDRESS);
    assert(
      portfolioAfter.sameSummary
        && portfolioAfter.sameRow
        && portfolioAfter.sameChart
        && portfolioAfter.focused
        && portfolioAfter.selectionStart === 1
        && portfolioAfter.selectionEnd === 5
        && portfolioAfter.activeView === 'portfolio'
        && Math.abs(portfolioAfter.scrollTop - portfolioBefore.scrollTop) <= 1,
      `my tezos live Portfolio reset its chart, focus, or reader state ${JSON.stringify({ portfolioBefore, portfolioAfter })}`
    );

    await page.locator('#my-tezos-tab-collection').click();
    await page.waitForFunction(() => document.querySelector('#collection-status')?.dataset.state === 'complete', null, { timeout: 30000 });
    await page.locator('#collection-spam-toggle').click();
    if (!await page.locator('#collection-load-more').evaluate((button) => button.hidden)) {
      await page.locator('#collection-load-more').click();
      await page.waitForFunction(() => document.querySelectorAll('#collection-grid .collection-asset-card').length > 100, null, { timeout: 5000 });
    }
    try {
      await page.waitForFunction(() => /Flagged Smoke Asset/.test(document.querySelector('#collection-grid')?.textContent || ''), null, { timeout: 5000 });
    } catch (error) {
      const debug = await page.evaluate(() => ({
        status: document.querySelector('#collection-status')?.textContent || '',
        state: document.querySelector('#collection-status')?.dataset.state || '',
        assets: document.querySelector('[data-collection-total="assets"] strong')?.textContent || '',
        cards: document.querySelectorAll('#collection-grid .collection-asset-card').length,
        toggle: document.querySelector('#collection-spam-toggle')?.textContent || '',
        pressed: document.querySelector('#collection-spam-toggle')?.getAttribute('aria-pressed'),
        loadMoreHidden: document.querySelector('#collection-load-more')?.hidden,
        loadMoreText: document.querySelector('#collection-load-more')?.textContent || ''
      }));
      throw new Error(`my tezos live Collection fixture did not expose the retained flagged view ${JSON.stringify(debug)}\n${error.message}`);
    }
    const collectionBefore = await page.evaluate(() => {
      const drawer = document.querySelector('#drawer-body');
      const grid = document.querySelector('#collection-grid');
      const first = grid?.querySelector('.collection-asset-card');
      const toggle = document.querySelector('#collection-spam-toggle');
      const text = first?.querySelector('strong')?.firstChild;
      drawer.scrollTop = Math.min(260, Math.max(0, drawer.scrollHeight - drawer.clientHeight));
      toggle?.focus({ preventScroll: true });
      if (text?.length) {
        const range = document.createRange();
        range.setStart(text, 0);
        range.setEnd(text, Math.min(6, text.length));
        const selection = document.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      }
      window.__liveCollectionFirst = first;
      window.__liveCollectionToggle = toggle;
      return {
        total: Number(document.querySelector('[data-collection-total="assets"] strong')?.textContent) || 0,
        cards: grid?.querySelectorAll('.collection-asset-card').length || 0,
        scrollTop: drawer.scrollTop,
        selection: document.getSelection()?.toString() || ''
      };
    });
    await page.waitForFunction(({ total, cards }) => (
      Number(document.querySelector('[data-collection-total="assets"] strong')?.textContent) > total
        && document.querySelectorAll('#collection-grid .collection-asset-card').length > cards
        && document.querySelector('#collection-status')?.dataset.state === 'complete'
    ), collectionBefore, { timeout: 15000 });
    const collectionAfter = await page.evaluate(() => ({
      sameFirst: document.querySelector('#collection-grid .collection-asset-card') === window.__liveCollectionFirst,
      focused: document.activeElement === window.__liveCollectionToggle,
      flagged: document.querySelector('#collection-spam-toggle')?.getAttribute('aria-pressed'),
      mode: document.querySelector('[data-collection-mode="collected"]')?.getAttribute('aria-pressed'),
      activeView: document.querySelector('[data-my-tezos-view][aria-selected="true"]')?.dataset.myTezosView || '',
      scrollTop: document.querySelector('#drawer-body')?.scrollTop || 0,
      selection: document.getSelection()?.toString() || ''
    }));
    assert(
      collectionAfter.sameFirst
        && collectionAfter.focused
        && collectionAfter.flagged === 'true'
        && collectionAfter.mode === 'true'
        && collectionAfter.activeView === 'collection'
        && collectionAfter.selection === collectionBefore.selection
        && Math.abs(collectionAfter.scrollTop - collectionBefore.scrollTop) <= 1,
      `my tezos live Collection reset display depth, filters, or reader state ${JSON.stringify({ collectionBefore, collectionAfter })}`
    );

    await page.locator('#my-tezos-tab-tezos-x').click();
    await page.waitForFunction(() => ['complete', 'partial'].includes(document.querySelector('#tezosx-status')?.dataset.state), null, { timeout: 30000 });
    await page.waitForFunction(() => document.querySelector('#tezosx-load-more')?.hidden === false, null, { timeout: 10000 });
    await page.locator('#tezosx-load-more').click();
    await page.waitForFunction(() => (
      document.querySelector('#tezosx-load-more')?.hidden === true
        && /Token approval/i.test(document.querySelector('#tezosx-details')?.textContent || '')
    ), null, { timeout: 10000 });
    await page.locator('#tezosx-account-list details summary').click();
    const tezosXBefore = await page.evaluate(() => {
      const drawer = document.querySelector('#drawer-body');
      const details = document.querySelector('#tezosx-account-list details');
      const summary = details?.querySelector('summary');
      const older = Array.from(document.querySelectorAll('#tezosx-details .tezosx-transaction-list a'))
        .find((row) => /Token approval/i.test(row.textContent || ''));
      drawer.scrollTop = Math.min(260, Math.max(0, drawer.scrollHeight - drawer.clientHeight));
      summary?.focus({ preventScroll: true });
      window.__liveTezosXDetails = details;
      window.__liveTezosXSummary = summary;
      window.__liveTezosXOlder = older;
      return {
        transactions: Number(document.querySelector('[data-tezosx-total="transactions"] strong')?.textContent) || 0,
        scrollTop: drawer.scrollTop
      };
    });
    await page.waitForFunction((before) => (
      Number(document.querySelector('[data-tezosx-total="transactions"] strong')?.textContent) > before
        && document.querySelector('#tezosx-load-more')?.hidden === true
        && document.querySelector('#tezosx-status')?.dataset.state !== 'loading'
    ), tezosXBefore.transactions, { timeout: 15000 });
    const tezosXAfter = await page.evaluate(() => ({
      sameDetails: document.querySelector('#tezosx-account-list details') === window.__liveTezosXDetails,
      sameOlder: Array.from(document.querySelectorAll('#tezosx-details .tezosx-transaction-list a'))
        .includes(window.__liveTezosXOlder),
      expanded: document.querySelector('#tezosx-account-list details')?.open === true,
      focused: document.activeElement === window.__liveTezosXSummary,
      loadMoreHidden: document.querySelector('#tezosx-load-more')?.hidden === true,
      activeView: document.querySelector('[data-my-tezos-view][aria-selected="true"]')?.dataset.myTezosView || '',
      scrollTop: document.querySelector('#drawer-body')?.scrollTop || 0
    }));
    assert(
      tezosXAfter.sameDetails
        && tezosXAfter.sameOlder
        && tezosXAfter.expanded
        && tezosXAfter.focused
        && tezosXAfter.loadMoreHidden
        && tezosXAfter.activeView === 'tezos-x'
        && Math.abs(tezosXAfter.scrollTop - tezosXBefore.scrollTop) <= 1,
      `my tezos live Tezos X reset pagination, disclosure, or reader state ${JSON.stringify({ tezosXBefore, tezosXAfter })}`
    );

    await page.evaluate(() => {
      window.__myTezosLiveVisibility = 'hidden';
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => window.__myTezosLiveVisibility
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    // Let requests that began before the visibility transition finish draining;
    // the assertion below covers new timer work during a full refresh interval.
    await page.waitForTimeout(700);
    const hiddenRequestCount = activeViewRequests.length;
    await waitForIntentionalRealTime(page, 'my-tezos-hidden-refresh-window');
    assert(activeViewRequests.length === hiddenRequestCount, `my tezos live views polled while hidden (${hiddenRequestCount} -> ${activeViewRequests.length})`);
    await page.evaluate(() => {
      window.__myTezosLiveVisibility = 'visible';
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const catchUpDeadline = Date.now() + 10000;
    while (Date.now() < catchUpDeadline && activeViewRequests.length === hiddenRequestCount) await sleep(100);
    assert(activeViewRequests.length > hiddenRequestCount, 'my tezos live views did not perform one visible catch-up');

    await context.close();
    assert(issues.length === 0, `my tezos active-view live refresh browser issues:\n${issues.join('\n')}`);
    log('ok - my tezos all-view live refresh smoke');
  }

  return { smokeMyTezosDrawerLiveRefresh, smokeMyTezosBalanceHistory, smokeMyTezosMemory, smokeMyTezosCollection, smokeMyTezosTezosX, smokeMyTezosViewLiveRefresh };
}
