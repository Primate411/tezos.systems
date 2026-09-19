// Browser workflows owned by activity. Shared dependencies remain explicit.
export function createActivitySmokeSuites({
  SAMPLE_ADDRESS,
  SAMPLE_ADDRESS_2,
  SAMPLE_CONTRACT,
  SAMPLE_IDLE_ADDRESS,
  assert,
  assertPromotedLauncherGeometry,
  attachIssueCollectors,
  expectCount,
  installFeatureMocks,
  log
}) {
  async function smokeLedgerFlowChamber(browser, baseUrl) {
    const issues = [];
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      serviceWorkers: 'block'
    });
    const mockState = await installFeatureMocks(context, {
      ledgerFlowMocks: true,
      whaleChamberMocks: true
    });
    await context.addInitScript(() => {
      localStorage.setItem('tezos-systems-theme', 'matrix');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
      localStorage.setItem('tezos-systems-ledger-flow-window', '30d');
      localStorage.setItem('tezos-systems-ledger-flow-threshold-index', '0');
    });
    const page = await context.newPage();
    attachIssueCollectors(page, 'ledger flow chamber', issues);

    const response = await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `ledger flow chamber: dashboard failed with HTTP ${response?.status()}`);
    await page.locator('#chambers-grid > .chamber-category[data-chamber-category="people"] .chamber-category-toggle').click();
    await page.locator('#ledger-flow-entry-card.chamber-entry-wide').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('#ledger-flow-entry-card').dispatchEvent('pointerenter');
    try {
      await page.locator('#ledger-flow-entry-card .ledger-flow-entry-hero:not(.is-fallback)').waitFor({ state: 'visible', timeout: 15000 });
    } catch (error) {
      const debug = await page.evaluate(() => ({
        visible: document.visibilityState,
        entry: document.getElementById('ledger-flow-entry-card')?.textContent,
        wired: document.getElementById('ledger-flow-entry-card')?.dataset.ledgerFlowWired,
        resources: performance.getEntriesByType('resource').filter(item => /whale|ledger-flow/.test(item.name)).map(item => item.name)
      }));
      throw new Error(`Ledger Flow archive preview did not load: ${JSON.stringify(debug)}; browser issues: ${issues.join(' | ')}`, { cause: error });
    }
    const entryState = await page.locator('#ledger-flow-entry-card').evaluate((card) => ({
      hero: card.querySelector('.ledger-flow-entry-hero')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      heroHref: card.querySelector('.ledger-flow-entry-hero')?.getAttribute('href') || '',
      fallback: Boolean(card.querySelector('.ledger-flow-entry-hero.is-fallback')),
      metrics: Array.from(card.querySelectorAll('.ledger-flow-entry-metrics .chamber-entry-metric')).map((item) => (
        item.textContent?.replace(/\s+/g, ' ').trim() || ''
      )),
      shareValue: card.dataset.shareValue || '',
      freshness: card.dataset.updatedLabel || '',
      archiveState: card.querySelector('.ledger-flow-entry-state')?.textContent?.trim() || ''
    }));
    assert(!entryState.fallback, `ledger flow dashboard card: real Whale hero did not replace fallback ${JSON.stringify(entryState)}`);
    assert(/QA Baker/.test(entryState.hero) && /Second Baker/.test(entryState.hero) && /125\.0K XTZ/.test(entryState.hero), `ledger flow dashboard card: Whale hero is incomplete ${JSON.stringify(entryState)}`);
    assert(entryState.heroHref === `#ledger-flow=${encodeURIComponent(SAMPLE_ADDRESS)}`, `ledger flow dashboard card: hero route mismatch ${entryState.heroHref}`);
    assert(
      entryState.metrics.length === 4
        && /24h moves 3 ≥1,000 XTZ/.test(entryState.metrics[0])
        && /Senders 3 distinct addresses/.test(entryState.metrics[1])
        && /Recipients 3 distinct addresses/.test(entryState.metrics[2])
        && /Gross observed 210\.0K XTZ not economic volume/.test(entryState.metrics[3]),
      `ledger flow dashboard card: Whale metrics do not reconcile ${JSON.stringify(entryState.metrics)}`
    );
    assert(/Archive generated/.test(entryState.freshness) && /6h schedule/.test(entryState.freshness), `ledger flow dashboard card: freshness is not source-aware ${entryState.freshness}`);
    assert(entryState.shareValue === '3 moves ≥1,000 XTZ · loaded 24h', `ledger flow dashboard card: share headline is not measured ${entryState.shareValue}`);
    assert(entryState.archiveState === 'Complete generated archive', `ledger flow dashboard card: archive state mismatch ${entryState.archiveState}`);
    assert(mockState.whaleArtifactRequests === 1, `ledger flow dashboard card: expected one shared Whale artifact request, got ${mockState.whaleArtifactRequests}`);
    assert(mockState.whaleLiveRequests === 0, `ledger flow dashboard card: card started Whale TzKT polling (${mockState.whaleLiveRequests})`);
    assert(mockState.ledgerFlowRequests.length === 0, `ledger flow dashboard card: card fetched Ledger rows ${JSON.stringify(mockState.ledgerFlowRequests)}`);
    assert(mockState.ledgerFlowTzktRequests.length === 0, `ledger flow dashboard card: card fetched target-scoped TzKT data ${JSON.stringify(mockState.ledgerFlowTzktRequests)}`);

    await page.evaluate(() => {
      window.__ledgerFlowDashboardDocument = document;
    });
    await page.locator('#ledger-flow-entry-card .chamber-expand-cue').click();
    await page.locator('#ledger-flow-modal.active .ledger-flow-content').waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForFunction(() => (
      document.querySelector('#ledger-flow-modal .ledger-flow-body')?.dataset.ledgerFlowMode === 'exact'
    ), null, { timeout: 15000 });
    assert(await page.evaluate(() => document === window.__ledgerFlowDashboardDocument), 'ledger flow chamber: opening the room reloaded the dashboard document');
    assert(mockState.whaleArtifactRequests === 1, `ledger flow chamber: room open duplicated the shared Whale artifact request (${mockState.whaleArtifactRequests})`);
    assert(!issues.some((issue) => /Ledger Flow failed AbortError/.test(issue)), `ledger flow chamber: opening from the dashboard caused a duplicate aborted load ${issues.join('\n')}`);

    const state = await page.evaluate(() => {
      const modal = document.querySelector('#ledger-flow-modal');
      const svg = modal?.querySelector('.ledger-flow-svg');
      const mapPanel = modal?.querySelector('.ledger-flow-map-panel');
      const timeline = modal?.querySelector('.ledger-flow-timeline');
      const timelineBars = Array.from(timeline?.querySelectorAll('.ledger-flow-timeline-bars li') || []);
      const edgeWidths = Array.from(modal?.querySelectorAll('.ledger-flow-edge') || [])
        .map((edge) => Number(edge.getAttribute('stroke-width') || 0))
        .filter((value) => Number.isFinite(value) && value > 0);
      const rect = svg?.getBoundingClientRect();
      const detailText = modal?.querySelector('#ledger-flow-detail-panel')?.textContent?.replace(/\s+/g, ' ').trim() || '';
      const nodeBoxFitFailures = Array.from(svg?.querySelectorAll('.ledger-flow-node') || []).flatMap((node) => {
        const box = node.querySelector('rect');
        const width = Number(box?.getAttribute('width') || 0);
        return Array.from(node.querySelectorAll('.ledger-flow-node-title, .ledger-flow-node-sub'))
          .filter((text) => {
            try {
              return width > 0 && text.getComputedTextLength() > width - 24;
            } catch {
              return false;
            }
          })
          .map((text) => `${text.textContent}:${text.getComputedTextLength().toFixed(1)}/${width}`);
      });
      return {
        title: modal?.querySelector('.chamber-title')?.textContent?.trim() || '',
        info: modal?.querySelector('.chamber-proposal-info')?.textContent?.trim() || '',
        stats: modal?.querySelector('.ledger-flow-stats')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        coverage: modal?.querySelector('.ledger-flow-coverage')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        scope: modal?.querySelector('.ledger-flow-scope')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        detail: detailText,
        counterparties: modal?.querySelector('.ledger-flow-counterparty-list')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        sentEdges: modal?.querySelectorAll('.ledger-flow-edge-sent').length || 0,
        receivedEdges: modal?.querySelectorAll('.ledger-flow-edge-received').length || 0,
        firstEdges: modal?.querySelectorAll('.ledger-flow-edge-first').length || 0,
        edgeWidths,
        minWidth: Math.min(...edgeWidths),
        maxWidth: Math.max(...edgeWidths),
        rowMyTezosLinks: modal?.querySelectorAll('.ledger-flow-counterparty-list .ledger-flow-my-tezos-link[href^="#my-baker="]').length || 0,
        rowTzktLinks: modal?.querySelectorAll('.ledger-flow-counterparty-list .ledger-flow-tzkt-pill[href^="https://tzkt.io/"]').length || 0,
        detailMyTezosHref: modal?.querySelector('#ledger-flow-detail-panel .ledger-flow-my-tezos-link[href^="#my-baker="]')?.getAttribute('href') || '',
        detailTzktHref: modal?.querySelector('#ledger-flow-detail-panel .ledger-flow-tzkt-pill[href^="https://tzkt.io/"]')?.getAttribute('href') || '',
        nodeBoxFitFailures,
        directHref: modal?.querySelector('a[href="/ledger-flow/"]')?.getAttribute('href') || '',
        svgWidth: rect?.width || 0,
        svgHeight: rect?.height || 0,
        mapPanelHeight: mapPanel?.getBoundingClientRect().height || 0,
        timeline: timeline?.textContent?.replace(/\s+/g, ' ').trim() || '',
        timelineBars: timelineBars.length,
        timelineEmptyBars: timelineBars.filter((item) => (
          Array.from(item.querySelectorAll('i')).every((bar) => Number.parseFloat(bar.style.height) === 0)
        )).length,
        timelineRows: timelineBars.reduce((sum, item) => {
          const match = String(item.getAttribute('aria-label') || '').match(/· ([\d,]+) rows$/);
          return sum + Number(String(match?.[1] || '0').replace(/,/g, ''));
        }, 0),
        horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    });
    assert(state.title === 'Ledger Flow', `ledger flow chamber: title mismatch ${state.title}`);
    assert(/QA Baker/.test(state.info) && /30D/.test(state.info), `ledger flow chamber: account context missing ${state.info}`);
    assert(/Received/.test(state.stats) && /Sent/.test(state.stats) && /First value/.test(state.stats), `ledger flow chamber: summary stats missing ${state.stats}`);
    assert(/Exact observed window/.test(state.coverage) && /All 6 matching/.test(state.coverage), `ledger flow chamber: exact coverage missing ${state.coverage}`);
    assert(/applied tez transaction rows only/i.test(state.scope) && /Token transfers/.test(state.scope), `ledger flow chamber: scope disclosure missing ${state.scope}`);
    assert(/First inbound from/.test(state.detail) && /Genesis Fund/.test(state.detail), `ledger flow chamber: first-inbound detail missing ${state.detail}`);
    assert(/Second Baker/.test(state.counterparties) && /Smoke Market/.test(state.counterparties) && /Dust Tester/.test(state.counterparties), `ledger flow chamber: counterparty list incomplete ${state.counterparties}`);
    assert(state.sentEdges >= 2, `ledger flow chamber: sent edges missing ${state.sentEdges}`);
    assert(state.receivedEdges >= 2, `ledger flow chamber: received edges missing ${state.receivedEdges}`);
    assert(state.firstEdges === 1, `ledger flow chamber: first-value edge mismatch ${state.firstEdges}`);
    assert(state.maxWidth - state.minWidth >= 1.5, `ledger flow chamber: edge widths should reflect amount scale ${state.edgeWidths.join(', ')}`);
    assert(state.nodeBoxFitFailures.length === 0, `ledger flow chamber: node text overflows boxes ${state.nodeBoxFitFailures.join(', ')}`);
    assert(state.rowMyTezosLinks >= 3 && state.rowTzktLinks >= 3, `ledger flow chamber: counterparty rows missing account links ${JSON.stringify(state)}`);
    assert(state.detailMyTezosHref.startsWith('#my-baker=') && state.detailTzktHref.includes('tzkt.io/'), `ledger flow chamber: selected path missing account links ${JSON.stringify(state)}`);
    assert(state.directHref === '/ledger-flow/', `ledger flow chamber: direct route link missing ${state.directHref}`);
    assert(state.svgWidth > 500 && state.svgHeight > 250, `ledger flow chamber: diagram dimensions too small ${state.svgWidth}x${state.svgHeight}`);
    assert(state.mapPanelHeight > 0 && state.mapPanelHeight <= 900, `ledger flow chamber: desktop map panel is not bounded ${state.mapPanelHeight}px`);
    assert(/Flow over time/.test(state.timeline) && /Daily UTC calendar buckets · exact window/.test(state.timeline), `ledger flow chamber: exact time profile heading mismatch ${state.timeline}`);
    assert(
      state.timelineBars >= 30
        && state.timelineBars <= 31
        && (state.timelineBars === 30 || /partial endpoints/.test(state.timeline))
        && state.timelineEmptyBars > 0
        && state.timelineRows === 6,
      `ledger flow chamber: exact 30D time profile does not preserve calendar boundaries, empty buckets, and six rows ${JSON.stringify(state)}`
    );
    assert(state.horizontalOverflow <= 1, `ledger flow chamber: horizontal overflow ${state.horizontalOverflow}`);

    const initialExactRequests = mockState.ledgerFlowRequests.filter((entry) => entry.target === SAMPLE_ADDRESS);
    const exactCountRequests = initialExactRequests.filter((entry) => entry.kind === 'count');
    const exactTransferRequests = initialExactRequests.filter((entry) => entry.kind === 'transfers');
    assert(exactCountRequests.length === 1, `ledger flow chamber: exact mode did not count first ${JSON.stringify(initialExactRequests)}`);
    assert(exactTransferRequests.length === 1, `ledger flow chamber: exact mode exceeded its bounded transfer request ${JSON.stringify(initialExactRequests)}`);
    assert(initialExactRequests.indexOf(exactCountRequests[0]) < initialExactRequests.indexOf(exactTransferRequests[0]), `ledger flow chamber: exact rows started before the count ${JSON.stringify(initialExactRequests)}`);
    const exactTransferUrl = new URL(exactTransferRequests[0].url);
    assert(exactTransferUrl.searchParams.get('anyof.sender.target') === SAMPLE_ADDRESS, `ledger flow chamber: unified direction filter missing ${exactTransferRequests[0].url}`);
    assert(!exactTransferUrl.searchParams.has('sender') && !exactTransferUrl.searchParams.has('target'), `ledger flow chamber: exact request split direction filters ${exactTransferRequests[0].url}`);
    assert(exactTransferRequests[0].limit === 6 && exactTransferRequests[0].sort === 'id', `ledger flow chamber: exact request was not count-bounded ${JSON.stringify(exactTransferRequests)}`);

    const explorerRequestCounts = {
      ledger: mockState.ledgerFlowRequests.length,
      tzkt: mockState.ledgerFlowTzktRequests.length,
      artifact: mockState.whaleArtifactRequests
    };
    const defaultFirstCounterparty = await page.locator('#ledger-flow-counterparty-results .ledger-flow-counterparty-row').first().innerText();
    assert(/Second Baker/.test(defaultFirstCounterparty), `ledger flow chamber: default total sort is wrong ${defaultFirstCounterparty}`);
    await page.locator('#ledger-flow-counterparty-query').fill('dust tester');
    await page.waitForFunction(() => {
      const rows = document.querySelectorAll('#ledger-flow-counterparty-results .ledger-flow-counterparty-row');
      return rows.length === 1 && /Dust Tester/.test(rows[0]?.textContent || '');
    }, null, { timeout: 5000 });
    const filteredCounterparties = await page.locator('#ledger-flow-counterparty-results').innerText();
    assert(/Showing 1 of 1/.test(filteredCounterparties) && /Dust Tester/.test(filteredCounterparties) && !/Second Baker/.test(filteredCounterparties), `ledger flow chamber: alias search did not filter the loaded set ${filteredCounterparties}`);
    await page.locator('#ledger-flow-counterparty-query').fill('');
    await page.locator('#ledger-flow-counterparty-sort').selectOption('received');
    await page.waitForFunction(() => {
      const first = document.querySelector('#ledger-flow-counterparty-results .ledger-flow-counterparty-row');
      return document.querySelector('#ledger-flow-counterparty-sort')?.value === 'received'
        && /Smoke Market/.test(first?.textContent || '');
    }, null, { timeout: 5000 });
    const receivedFirstCounterparty = await page.locator('#ledger-flow-counterparty-results .ledger-flow-counterparty-row').first().innerText();
    assert(/Smoke Market/.test(receivedFirstCounterparty), `ledger flow chamber: received sort did not reorder the loaded set ${receivedFirstCounterparty}`);
    assert(
      mockState.ledgerFlowRequests.length === explorerRequestCounts.ledger
        && mockState.ledgerFlowTzktRequests.length === explorerRequestCounts.tzkt
        && mockState.whaleArtifactRequests === explorerRequestCounts.artifact,
      `ledger flow chamber: counterparty search/sort caused a request ${JSON.stringify({
        before: explorerRequestCounts,
        ledger: mockState.ledgerFlowRequests,
        tzkt: mockState.ledgerFlowTzktRequests,
        artifact: mockState.whaleArtifactRequests
      })}`
    );
    await page.locator('#ledger-flow-counterparty-sort').selectOption('total');
    await page.waitForFunction(() => /Second Baker/.test(
      document.querySelector('#ledger-flow-counterparty-results .ledger-flow-counterparty-row')?.textContent || ''
    ), null, { timeout: 5000 });

    await page.locator('.ledger-flow-row-select[data-ledger-edge$=":sent"]').first().click();
    const sentDetail = await page.locator('#ledger-flow-detail-panel').innerText();
    assert(/Sent to/i.test(sentDetail) && /Second Baker/.test(sentDetail), `ledger flow chamber: sent edge detail mismatch ${sentDetail}`);

    const sliderBefore = await page.locator('#ledger-flow-threshold').evaluate((input) => {
      const content = input.closest('.ledger-flow-content');
      content.scrollTop = Math.min(260, Math.max(0, content.scrollHeight - content.clientHeight));
      input.focus();
      window.__ledgerFlowThresholdNode = input;
      window.__ledgerFlowScrollTop = content.scrollTop;
      input.value = '1';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return {
        scrollTop: content.scrollTop,
        maxScroll: content.scrollHeight - content.clientHeight
      };
    });
    await page.waitForFunction(() => {
      return document.querySelector('#ledger-flow-threshold-label')?.textContent === '1 XTZ';
    }, null, { timeout: 5000 });
    const sliderPreviewState = await page.evaluate(() => {
      const input = document.querySelector('#ledger-flow-threshold');
      const content = input?.closest('.ledger-flow-content');
      return {
        identity: input === window.__ledgerFlowThresholdNode,
        focused: document.activeElement === input,
        scrollTop: content?.scrollTop || 0,
        coverage: document.querySelector('.ledger-flow-coverage')?.textContent?.replace(/\s+/g, ' ').trim() || ''
      };
    });
    assert(sliderPreviewState.identity && sliderPreviewState.focused, `ledger flow chamber: quiet slider preview replaced/focused away from its control ${JSON.stringify(sliderPreviewState)}`);
    assert(Math.abs(sliderPreviewState.scrollTop - sliderBefore.scrollTop) <= 2, `ledger flow chamber: slider preview moved modal scroll ${JSON.stringify({ sliderBefore, sliderPreviewState })}`);
    assert(/Local filter preview/.test(sliderPreviewState.coverage), `ledger flow chamber: slider preview did not qualify local filtering ${sliderPreviewState.coverage}`);

    const thresholdReloadRequest = page.waitForRequest((candidate) => {
      const candidateUrl = new URL(candidate.url());
      return candidateUrl.origin === 'https://api.tzkt.io'
        && candidateUrl.pathname === '/v1/operations/transactions'
        && candidateUrl.searchParams.get('anyof.sender.target') === SAMPLE_ADDRESS
        && candidateUrl.searchParams.get('amount.ge') === '1000000';
    }, { timeout: 30000 });
    await page.locator('#ledger-flow-threshold').evaluate((input) => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await thresholdReloadRequest;
    await page.waitForFunction(() => {
      const coverage = document.querySelector('.ledger-flow-coverage');
      return coverage?.classList.contains('is-exact')
        && /1 XTZ or more per transfer/.test(coverage.textContent || '');
    }, null, { timeout: 30000 });
    const sliderSettledState = await page.evaluate(() => {
      const input = document.querySelector('#ledger-flow-threshold');
      const content = input?.closest('.ledger-flow-content');
      return {
        identity: input === window.__ledgerFlowThresholdNode,
        focused: document.activeElement === input,
        scrollTop: content?.scrollTop || 0,
        threshold: document.querySelector('#ledger-flow-threshold-label')?.textContent || ''
      };
    });
    assert(sliderSettledState.identity && sliderSettledState.focused, `ledger flow chamber: settled threshold reload replaced/focused away from its control ${JSON.stringify(sliderSettledState)}`);
    assert(Math.abs(sliderSettledState.scrollTop - sliderBefore.scrollTop) <= 2, `ledger flow chamber: settled threshold reload moved modal scroll ${JSON.stringify({ sliderBefore, sliderSettledState })}`);
    assert(sliderSettledState.threshold === '1 XTZ', `ledger flow chamber: threshold label mismatch ${sliderSettledState.threshold}`);

    const rollbackBefore = await page.evaluate(() => ({
      stats: document.querySelector('.ledger-flow-stats')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      threshold: document.querySelector('#ledger-flow-threshold-label')?.textContent || ''
    }));
    mockState.failLedgerFlowTarget(SAMPLE_ADDRESS);
    const failedThresholdRequest = page.waitForRequest((candidate) => {
      const candidateUrl = new URL(candidate.url());
      return candidateUrl.origin === 'https://api.tzkt.io'
        && candidateUrl.pathname === '/v1/operations/transactions/count'
        && candidateUrl.searchParams.get('anyof.sender.target') === SAMPLE_ADDRESS
        && candidateUrl.searchParams.get('amount.ge') === '1000000000';
    }, { timeout: 30000 });
    await page.locator('#ledger-flow-threshold').evaluate((input) => {
      input.value = '4';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await failedThresholdRequest;
    await page.waitForFunction(() => (
      document.querySelector('#ledger-flow-threshold-label')?.textContent === '1 XTZ'
      && /still showing the last-good/i.test(document.querySelector('#ledger-flow-load-status')?.textContent || '')
    ), null, { timeout: 30000 });
    const rollbackState = await page.evaluate(() => ({
      stats: document.querySelector('.ledger-flow-stats')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      threshold: document.querySelector('#ledger-flow-threshold-label')?.textContent || '',
      thresholdIndex: document.querySelector('#ledger-flow-threshold')?.value || '',
      storedThresholdIndex: localStorage.getItem('tezos-systems-ledger-flow-threshold-index')
    }));
    assert(
      rollbackState.threshold === rollbackBefore.threshold
        && rollbackState.thresholdIndex === '1'
        && rollbackState.storedThresholdIndex === '1'
        && rollbackState.stats === rollbackBefore.stats,
      `ledger flow chamber: failed threshold reload did not restore the prior control and last-good totals ${JSON.stringify({
        before: rollbackBefore,
        after: rollbackState
      })}`
    );
    const expectedThresholdFailureIssue = issues.findIndex((issue) => /Ledger Flow failed/.test(issue) && /503/.test(issue));
    if (expectedThresholdFailureIssue >= 0) issues.splice(expectedThresholdFailureIssue, 1);
    mockState.failLedgerFlowTarget('');

    mockState.failLedgerFlowTarget(SAMPLE_ADDRESS_2);
    await page.locator('#ledger-flow-input').fill(SAMPLE_ADDRESS_2);
    await page.locator('#ledger-flow-search-form button[type="submit"]').click();
    await page.waitForFunction(() => /still showing the last-good/i.test(document.querySelector('#ledger-flow-load-status')?.textContent || ''), null, { timeout: 10000 });
    const lastGoodState = await page.evaluate(() => ({
      info: document.querySelector('#ledger-flow-modal .chamber-proposal-info')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      mode: document.querySelector('#ledger-flow-modal .ledger-flow-body')?.dataset.ledgerFlowMode || '',
      status: document.querySelector('#ledger-flow-load-status')?.textContent?.replace(/\s+/g, ' ').trim() || ''
    }));
    assert(/QA Baker/.test(lastGoodState.info) && lastGoodState.mode === 'exact', `ledger flow chamber: failed load displaced last-good view ${JSON.stringify(lastGoodState)}`);
    assert(/Could not load/.test(lastGoodState.status), `ledger flow chamber: failed load did not explain last-good retention ${lastGoodState.status}`);
    const expectedFailureIssue = issues.findIndex((issue) => /Ledger Flow failed/.test(issue) && /503/.test(issue));
    if (expectedFailureIssue >= 0) issues.splice(expectedFailureIssue, 1);
    mockState.failLedgerFlowTarget('');

    await page.locator('#ledger-flow-input').fill(SAMPLE_IDLE_ADDRESS);
    await page.locator('#ledger-flow-search-form button[type="submit"]').click();
    await page.waitForFunction(() => (
      document.querySelector('#ledger-flow-modal .ledger-flow-body')?.dataset.ledgerFlowMode === 'sample'
    ), null, { timeout: 20000 });
    const sampleState = await page.evaluate(() => ({
      coverage: document.querySelector('.ledger-flow-coverage')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      stats: document.querySelector('.ledger-flow-stats')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      detail: document.querySelector('#ledger-flow-detail-panel')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      badge: document.querySelector('#ledger-flow-modal .chamber-badge')?.textContent?.trim() || '',
      counterpartyTitle: document.querySelector('.ledger-flow-counterparties .lb-panel-title')?.textContent?.trim() || '',
      timelineDisclosure: document.querySelector('.ledger-flow-timeline-unavailable')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      timelineBars: document.querySelectorAll('.ledger-flow-timeline-bars li').length
    }));
    assert(/Largest-row sample/.test(sampleState.coverage) && /10,000 largest/.test(sampleState.coverage) && /20,001/.test(sampleState.coverage), `ledger flow chamber: sample coverage is not explicit ${JSON.stringify(sampleState)}`);
    assert(/Received sample/.test(sampleState.stats) && /Sent sample/.test(sampleState.stats) && /Counterparties in sample/.test(sampleState.stats), `ledger flow chamber: sample stats lack qualifiers ${sampleState.stats}`);
    assert(/First value/.test(sampleState.detail) && /All-time first-value context/.test(sampleState.detail), `ledger flow chamber: all-time context was mislabelled as part of the sample ${sampleState.detail}`);
    assert(sampleState.badge === 'Sample' && sampleState.counterpartyTitle === 'Counterparties in Sample', `ledger flow chamber: sample surface labels mismatch ${JSON.stringify(sampleState)}`);
    assert(/Time profile hidden/.test(sampleState.timelineDisclosure) && /largest-row sample cannot represent activity over time/.test(sampleState.timelineDisclosure) && sampleState.timelineBars === 0, `ledger flow chamber: sampled time profile is not explicitly suppressed ${JSON.stringify(sampleState)}`);
    await page.locator('.ledger-flow-row-select').first().click();
    const samplePathDetail = await page.locator('#ledger-flow-detail-panel').innerText();
    assert(/Sample amount/i.test(samplePathDetail) && /Largest-row sample/i.test(samplePathDetail), `ledger flow chamber: sampled path detail lacks qualifiers ${samplePathDetail}`);

    const sampleRequests = mockState.ledgerFlowRequests.filter((entry) => entry.target === SAMPLE_IDLE_ADDRESS);
    const sampleCountRequests = sampleRequests.filter((entry) => entry.kind === 'count');
    const sampleTransferRequests = sampleRequests.filter((entry) => entry.kind === 'transfers');
    assert(sampleCountRequests.length === 1, `ledger flow chamber: sample mode did not count first ${JSON.stringify(sampleRequests)}`);
    assert(sampleTransferRequests.length === 1, `ledger flow chamber: sample mode exceeded one bounded row request ${JSON.stringify(sampleRequests)}`);
    assert(sampleRequests.indexOf(sampleCountRequests[0]) < sampleRequests.indexOf(sampleTransferRequests[0]), `ledger flow chamber: sample rows started before the count ${JSON.stringify(sampleRequests)}`);
    assert(sampleTransferRequests[0].limit === 10000 && sampleTransferRequests[0].sort === 'amount' && !sampleTransferRequests[0].cursor, `ledger flow chamber: sample request is not a largest-row bound ${JSON.stringify(sampleTransferRequests)}`);

    await page.locator('#ledger-flow-input').fill(SAMPLE_CONTRACT);
    await page.locator('#ledger-flow-search-form button[type="submit"]').click();
    await page.waitForFunction(() => {
      const body = document.querySelector('#ledger-flow-modal .ledger-flow-body');
      return body?.dataset.ledgerFlowMode === 'exact'
        && /Smoke Contract/.test(document.querySelector('#ledger-flow-modal .chamber-proposal-info')?.textContent || '');
    }, null, { timeout: 15000 });
    const originState = await page.evaluate(() => ({
      origin: document.querySelector('.ledger-flow-origin-context')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      detail: document.querySelector('#ledger-flow-detail-panel')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      originRequests: document.querySelectorAll('.ledger-flow-origin-row').length
    }));
    assert(/Origination/.test(originState.origin) && /Smoke Contract Originator/.test(originState.origin) && /7\.5K XTZ/.test(originState.origin), `ledger flow chamber: funded origination missing ${originState.origin}`);
    assert(/First inbound transaction/.test(originState.origin) && /First Contract Buyer/.test(originState.origin), `ledger flow chamber: first inbound was not kept distinct from origination ${originState.origin}`);
    assert(/Funded at origination by/.test(originState.detail) && /Smoke Contract Originator/.test(originState.detail), `ledger flow chamber: first-value path did not prefer funded origination ${originState.detail}`);
    assert(mockState.ledgerFlowRequests.filter((entry) => entry.kind === 'origination' && entry.target === SAMPLE_CONTRACT).length === 1, `ledger flow chamber: contract origin request missing ${JSON.stringify(mockState.ledgerFlowRequests)}`);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.ledger-flow-mobile-map').waitFor({ state: 'visible', timeout: 5000 });
    const mobileState = await page.evaluate(() => {
      const modal = document.querySelector('#ledger-flow-modal');
      const mobileMap = modal?.querySelector('.ledger-flow-mobile-map');
      const visibleSvg = Array.from(modal?.querySelectorAll('.ledger-flow-svg') || [])
        .filter((svg) => getComputedStyle(svg).display !== 'none' && svg.getBoundingClientRect().height > 0);
      const controls = Array.from(modal?.querySelectorAll(
        '.ledger-flow-search button, .ledger-flow-segmented button, .ledger-flow-path-button, .ledger-flow-row-select'
      ) || []).filter((control) => control.getClientRects().length > 0);
      const controlHeights = controls.map((control) => control.getBoundingClientRect().height);
      const pathTextSizes = Array.from(modal?.querySelectorAll('.ledger-flow-path-button small, .ledger-flow-path-button strong') || [])
        .filter((node) => node.getClientRects().length > 0)
        .map((node) => Number.parseFloat(getComputedStyle(node).fontSize));
      const content = modal?.querySelector('.ledger-flow-content');
      const account = mobileMap?.querySelector('.ledger-flow-mobile-account');
      const ratio = mobileMap?.querySelector('.ledger-flow-direction-ratio');
      const receivedSection = mobileMap?.querySelector('#ledger-flow-mobile-received')?.closest('.ledger-flow-mobile-direction');
      const sentSection = mobileMap?.querySelector('#ledger-flow-mobile-sent')?.closest('.ledger-flow-mobile-direction');
      const visiblePaths = (section) => Array.from(section?.querySelectorAll('.ledger-flow-path-button') || [])
        .filter((button) => button.getClientRects().length > 0).length;
      const mapRect = mobileMap?.getBoundingClientRect();
      const accountRect = account?.getBoundingClientRect();
      const ratioRect = ratio?.getBoundingClientRect();
      return {
        visibleSvg: visibleSvg.length,
        mobileDisplay: mobileMap ? getComputedStyle(mobileMap).display : '',
        mobileWidth: mobileMap?.getBoundingClientRect().width || 0,
        mobileHeight: mapRect?.height || 0,
        contentWidth: content?.clientWidth || 0,
        firstChildClass: mobileMap?.firstElementChild?.className || '',
        secondChildClass: mobileMap?.children?.[1]?.className || '',
        accountText: account?.textContent?.replace(/\s+/g, ' ').trim() || '',
        ratioLabel: ratio?.getAttribute('aria-label') || '',
        accountOffset: accountRect && mapRect ? accountRect.top - mapRect.top : Infinity,
        ratioAfterAccount: Boolean(accountRect && ratioRect && ratioRect.top >= accountRect.bottom),
        receivedVisiblePaths: visiblePaths(receivedSection),
        sentVisiblePaths: visiblePaths(sentSection),
        minimumControlHeight: Math.min(...controlHeights),
        minimumPathTextSize: Math.min(...pathTextSizes),
        documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        contentOverflow: (content?.scrollWidth || 0) - (content?.clientWidth || 0)
      };
    });
    assert(mobileState.visibleSvg === 0 && mobileState.mobileDisplay === 'grid', `ledger flow chamber: mobile still renders the downscaled SVG ${JSON.stringify(mobileState)}`);
    assert(mobileState.mobileWidth > 0 && mobileState.mobileWidth <= mobileState.contentWidth + 1, `ledger flow chamber: mobile flow list does not fit its panel ${JSON.stringify(mobileState)}`);
    assert(
      mobileState.firstChildClass === 'ledger-flow-mobile-account'
        && mobileState.secondChildClass === 'ledger-flow-direction-ratio'
        && /Selected account Smoke Contract/.test(mobileState.accountText)
        && /Received .* percent and sent .* percent/.test(mobileState.ratioLabel)
        && mobileState.accountOffset >= -1
        && mobileState.accountOffset <= 30
        && mobileState.ratioAfterAccount,
      `ledger flow chamber: mobile account and direction ratio are not subject-first ${JSON.stringify(mobileState)}`
    );
    assert(mobileState.receivedVisiblePaths <= 5 && mobileState.sentVisiblePaths <= 5, `ledger flow chamber: mobile renders too many paths before disclosure ${JSON.stringify(mobileState)}`);
    assert(mobileState.mobileHeight > 0 && mobileState.mobileHeight <= 1200, `ledger flow chamber: mobile map height is not bounded ${JSON.stringify(mobileState)}`);
    assert(mobileState.minimumControlHeight >= 43.5, `ledger flow chamber: mobile controls are below 44px ${JSON.stringify(mobileState)}`);
    assert(mobileState.minimumPathTextSize >= 12, `ledger flow chamber: mobile path text is too small ${JSON.stringify(mobileState)}`);
    assert(mobileState.documentOverflow <= 1 && mobileState.contentOverflow <= 1, `ledger flow chamber: mobile horizontal overflow ${JSON.stringify(mobileState)}`);

    await context.close();
    assert(issues.length === 0, `ledger flow chamber browser issues:\n${issues.join('\n')}`);
    log('ok - ledger flow chamber smoke');
  }

  async function smokeWhaleWatchChamber(browser, baseUrl) {
    const issues = [];
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      serviceWorkers: 'block'
    });
    const mockState = await installFeatureMocks(context, { whaleChamberMocks: true });
    await context.addInitScript(() => {
      window.__WHALE_WATCH_REFRESH_MS__ = 1000;
      localStorage.setItem('tezos-systems-theme', 'matrix');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    });

    const page = await context.newPage();
    attachIssueCollectors(page, 'Whale Watch Chamber', issues);
    let response = await page.goto(`${baseUrl}/whales/?view=overview`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `Whale Watch: direct route failed with HTTP ${response?.status()}`);
    await page.locator('#whale-watch-modal.active #whale-watch-panel-overview').waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForFunction(() => {
      const text = document.querySelector('.whale-watch-header')?.textContent || '';
      return /6h schedule/.test(text) && /Window\s+.* → .* UTC/i.test(text);
    }, null, { timeout: 15000 });
    const sourceStripText = await page.locator('.whale-watch-header').innerText();
    assert(/6h schedule/.test(sourceStripText) && /Window\s+.* → .* UTC/i.test(sourceStripText), `Whale Watch: exact archived window and generator cadence missing: ${sourceStripText}`);
    assert(await page.locator('#chambers-grid').count() === 0, 'Whale Watch direct boot must not render hidden home launchers');
    // The remaining legacy checks compare room receipts with its home tile.
    // Create home by a real handoff, then reopen the same retained room instance.
    await page.locator('#whale-watch-modal .chamber-close').click();
    await page.waitForFunction(() => document.documentElement.dataset.dashboardReady === 'true' && location.pathname === '/', null, { timeout: 30000 });
    const restoredWhaleLauncher = page.locator('#whale-watch-entry-card [aria-label="Open Whale Watch Chamber"]');
    await restoredWhaleLauncher.click();
    await page.locator('#whale-watch-modal.active #whale-watch-panel-overview').waitFor({ state: 'visible', timeout: 15000 });
    await page.evaluate(() => {
      const loadedModuleUrl = performance.getEntriesByType('resource')
        .map((entry) => entry.name)
        .find((url) => /\/js\/features\/whale-chamber\.js(?:\?|$)/.test(url));
      if (!loadedModuleUrl) throw new Error('Whale Watch loaded module URL is unavailable');
      window.__whaleChamberModuleUrl = loadedModuleUrl;
    });
    await assertPromotedLauncherGeometry(page, 'Whale Watch desktop launcher pair', { desktop: true });
    await expectCount(page, '#whale-watch-modal [role="tab"][data-whale-view]', 5, 'Whale Watch views');
    const whaleTabState = await page.evaluate(() => ({
      tabs: Array.from(document.querySelectorAll('#whale-watch-modal [role="tab"][data-whale-view]')).map((tab) => ({
        view: tab.dataset.whaleView || '',
        id: tab.id || '',
        controls: tab.getAttribute('aria-controls') || '',
        selected: tab.getAttribute('aria-selected') || '',
        tabIndex: tab.tabIndex,
        target: (() => {
          const target = document.getElementById(tab.getAttribute('aria-controls') || '');
          return {
            role: target?.getAttribute('role') || '',
            labelledBy: target?.getAttribute('aria-labelledby') || ''
          };
        })()
      })),
      panel: (() => {
        const panel = document.querySelector('#whale-watch-modal [role="tabpanel"]:not([hidden])');
        return {
          id: panel?.id || '',
          labelledBy: panel?.getAttribute('aria-labelledby') || '',
          tabIndex: panel?.tabIndex
        };
      })()
    }));
    assert(
      whaleTabState.tabs.every((tab) => (
        tab.id === `whale-watch-tab-${tab.view}`
          && tab.controls === `whale-watch-panel-${tab.view}`
          && tab.target.role === 'tabpanel'
          && tab.target.labelledBy === tab.id
      ))
        && whaleTabState.tabs.filter((tab) => tab.tabIndex === 0 && tab.selected === 'true').length === 1
        && whaleTabState.panel.id === 'whale-watch-panel-overview'
        && whaleTabState.panel.labelledBy === 'whale-watch-tab-overview'
        && whaleTabState.panel.tabIndex === 0,
      `Whale Watch: tabs and panels are not programmatically associated ${JSON.stringify(whaleTabState)}`
    );
    await page.locator('#whale-watch-tab-overview').focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => (
      document.activeElement?.id === 'whale-watch-tab-live'
        && document.querySelector('#whale-watch-tab-live')?.getAttribute('aria-selected') === 'true'
        && document.querySelector('#whale-watch-panel-live')?.getAttribute('aria-labelledby') === 'whale-watch-tab-live'
    ));
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(() => (
      document.activeElement?.id === 'whale-watch-tab-overview'
        && document.querySelector('#whale-watch-tab-overview')?.getAttribute('aria-selected') === 'true'
        && document.querySelector('#whale-watch-panel-overview')?.getAttribute('aria-labelledby') === 'whale-watch-tab-overview'
    ));
    const launcherText = await page.locator('#whale-watch-entry-card').innerText();
    assert(/Largest · archive/i.test(launcherText) && !/Largest · 24H/i.test(launcherText), `Whale Watch: launcher largest-transfer label must name the archive: ${launcherText}`);
    const whaleLauncherFreshness = await page.evaluate(() => ({
      label: document.querySelector('#whale-watch-entry-card')?.dataset.updatedLabel || '',
      footer: document.querySelector('#whale-watch-entry-card .chamber-entry-freshness')?.textContent?.trim() || ''
    }));
    assert(
      /^Archive generated .+ · 6h schedule$/.test(whaleLauncherFreshness.label)
        && whaleLauncherFreshness.label === whaleLauncherFreshness.footer,
      `Whale Watch: launcher archive freshness missing ${JSON.stringify(whaleLauncherFreshness)}`
    );
    const overviewText = await page.locator('#whale-watch-panel-overview').innerText();
    assert(/3/.test(overviewText) && /2 operation groups/.test(overviewText), `Whale Watch: complete operation/group counts missing: ${overviewText}`);
    assert(/Gross observed legs/i.test(overviewText) && /not economic volume/i.test(overviewText), `Whale Watch: observed-leg semantics missing: ${overviewText}`);
    assert(/Archived window/i.test(overviewText) && !/Largest · 24H/i.test(overviewText), `Whale Watch: largest transfer label must name the archived window: ${overviewText}`);
    assert(/One operation id is one tape row/.test(overviewText) && /operation-group hash can connect several related hops/.test(overviewText), `Whale Watch: identity methodology missing: ${overviewText}`);
    await page.waitForFunction(() => document.querySelectorAll('#whale-watch-panel-overview .whale-watch-label-receipts a').length === 3, null, { timeout: 10000 });
    const aliasReceiptState = await page.evaluate(() => ({
      copy: document.querySelector('#whale-watch-panel-overview')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      receipts: Array.from(document.querySelectorAll('#whale-watch-panel-overview .whale-watch-label-receipts a')).map((link) => ({
        href: link.getAttribute('href') || '',
        text: link.textContent?.replace(/\s+/g, ' ').trim() || ''
      }))
    }));
    assert(
      aliasReceiptState.receipts.map(({ text }) => text).join(' ').includes('QA Baker')
        && aliasReceiptState.receipts.map(({ text }) => text).join(' ').includes('Second Baker')
        && aliasReceiptState.receipts.map(({ text }) => text).join(' ').includes('Pending Baker')
        && aliasReceiptState.receipts.every(({ href, text }) => /^https:\/\/tzkt\.io\/tz/i.test(href) && /current live-sample label/.test(text))
        && /TzKT aliases are presented as source context only/.test(aliasReceiptState.copy)
        && /does not infer exchange ownership or beneficial control/.test(aliasReceiptState.copy),
      `Whale Watch: entity context must come from current TzKT alias receipts without inferred ownership ${JSON.stringify(aliasReceiptState)}`
    );

    await page.locator('#whale-watch-tab-flows').click();
    await page.locator('#whale-watch-panel-flows').waitFor({ state: 'visible', timeout: 5000 });
    await expectCount(page, '#whale-watch-panel-flows .whale-watch-story', 2, 'Whale Watch flow stories');
    await expectCount(page, '#whale-watch-panel-flows .whale-watch-story:first-of-type li', 2, 'Whale Watch grouped flow legs');
    const flowText = await page.locator('#whale-watch-panel-flows .whale-watch-story').first().innerText();
    assert(/2 related hops/.test(flowText) && /op 7001/.test(flowText) && /op 7002/.test(flowText), `Whale Watch: same-hash operations were deduplicated instead of grouped: ${flowText}`);
    assert(/Grouped by shared operation hash; repeated capital is possible/.test(flowText), `Whale Watch: grouped-flow caveat missing: ${flowText}`);

    await page.locator('#whale-watch-tab-dormant').click();
    await page.locator('#whale-watch-panel-dormant').waitFor({ state: 'visible', timeout: 5000 });
    const dormantText = await page.locator('#whale-watch-panel-dormant').innerText();
    assert(/lastActivityTime drives dormancy/i.test(dormantText), `Whale Watch: dormant timestamp rule missing: ${dormantText}`);
    assert(/Feb [23], 2022/.test(dormantText) && /block 7,654,321/.test(dormantText), `Whale Watch: dormant timestamp and block-level receipt were conflated: ${dormantText}`);
    assert(/Observed holdings/i.test(dormantText) && /Deep Vault/.test(dormantText), `Whale Watch: dormant account context missing: ${dormantText}`);

    await page.locator('#whale-watch-tab-awakenings').click();
    await page.locator('#whale-watch-panel-awakenings').waitFor({ state: 'visible', timeout: 5000 });
    await expectCount(page, '#whale-watch-panel-awakenings .whale-watch-awakening', 1, 'Whale Watch receipt-backed awakenings');
    const awakeningText = await page.locator('.whale-watch-awakening').innerText();
    assert(/123\.46K ꜩ moved/.test(awakeningText), `Whale Watch: triggering receipt moved amount missing: ${awakeningText}`);
    assert(/Holding before\s+9\.00M ꜩ/i.test(awakeningText), `Whale Watch: holding balance not shown separately from moved amount: ${awakeningText}`);
    assert(!/9\.00M ꜩ moved/.test(awakeningText), `Whale Watch: holding balance was substituted for operation amount: ${awakeningText}`);

    await page.locator('#whale-watch-tab-live').click();
    await page.locator('#whale-watch-panel-live .whale-watch-tape-row').first().waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForFunction(() => {
      const rows = document.querySelectorAll('#whale-watch-live-tape .whale-watch-tape-row').length;
      return rows === 28 || rows === 29;
    }, null, { timeout: 5000 });
    const acceptedWhaleTypes = await page.locator('#whale-watch-type option').evaluateAll((options) => options.map((option) => option.value));
    assert(acceptedWhaleTypes.join(',') === 'all,transaction,stake,unstake,delegation', `Whale Watch: route/filter types must not include an inferred exchange class ${JSON.stringify(acceptedWhaleTypes)}`);
    const search = page.locator('#whale-watch-search');
    await search.fill('Baker');
    await page.waitForFunction(() => document.querySelectorAll('#whale-watch-live-tape .whale-watch-tape-row').length >= 28, null, { timeout: 5000 });
    const quietBefore = await page.evaluate(() => {
      const body = document.querySelector('#whale-watch-body');
      const input = document.querySelector('#whale-watch-search');
      const tab = document.querySelector('#whale-watch-tab-live');
      body.closest('.chamber-room-scroll').scrollTop = Math.min(900, Math.max(1, body.closest('.chamber-room-scroll').scrollHeight - body.closest('.chamber-room-scroll').clientHeight - 80));
      input.focus({ preventScroll: true });
      input.setSelectionRange(0, 5);
      const viewportTop = body.closest('.chamber-room-scroll').getBoundingClientRect().top;
      const visibleRow = [...body.querySelectorAll('#whale-watch-live-tape [data-quiet-key]')]
        .find((row) => row.getBoundingClientRect().bottom > viewportTop + 1);
      window.__whaleWatchBody = body;
      window.__whaleWatchInput = input;
      window.__whaleWatchTab = tab;
      window.__whaleWatchRow = visibleRow;
      return {
        pageY: window.scrollY,
        top: body.closest('.chamber-room-scroll').scrollTop,
        anchorKey: visibleRow?.dataset.quietKey || '',
        anchorOffset: visibleRow ? visibleRow.getBoundingClientRect().top - viewportTop : 0,
        hadPrepend: Boolean(body.querySelector('[data-quiet-key="whale-watch-op-9001"]')),
        rows: body.querySelectorAll('#whale-watch-live-tape .whale-watch-tape-row').length,
        selection: input.value.slice(input.selectionStart, input.selectionEnd)
      };
    });
    assert(quietBefore.anchorKey, `Whale Watch: could not establish a visible live-tape anchor ${JSON.stringify(quietBefore)}`);
    await page.evaluate(async () => {
      const feature = await import(window.__whaleChamberModuleUrl);
      await feature.refreshWhaleChamber({ quiet: true });
    });
    await page.waitForFunction(() => document.querySelector('#whale-watch-body')?.dataset.quietRefreshSettled === 'true', null, { timeout: 8000 });
    await page.locator('[data-quiet-key="whale-watch-op-9001"]').waitFor({ state: 'attached', timeout: 5000 });
    const quietAfter = await page.evaluate((anchorKey) => {
      const body = document.querySelector('#whale-watch-body');
      const input = document.querySelector('#whale-watch-search');
      const tab = document.querySelector('#whale-watch-tab-live');
      const row = body.querySelector(`[data-quiet-key="${anchorKey}"]`);
      const viewportTop = body.closest('.chamber-room-scroll').getBoundingClientRect().top;
      const style = row ? getComputedStyle(row) : null;
      return {
        sameBody: body === window.__whaleWatchBody,
        sameInput: input === window.__whaleWatchInput,
        sameTab: tab === window.__whaleWatchTab,
        sameRow: row === window.__whaleWatchRow,
        focused: document.activeElement === input,
        selection: input.value.slice(input.selectionStart, input.selectionEnd),
        selectedView: tab?.getAttribute('aria-selected'),
        pageY: window.scrollY,
        top: body.closest('.chamber-room-scroll').scrollTop,
        anchorOffset: row ? row.getBoundingClientRect().top - viewportTop : null,
        settled: body.dataset.quietRefreshSettled,
        animation: style?.animationName || '',
        opacity: style?.opacity || '',
        rows: body.querySelectorAll('#whale-watch-live-tape .whale-watch-tape-row').length
      };
    }, quietBefore.anchorKey);
    assert(mockState.whaleLiveRequests >= 2, `Whale Watch: quiet refresh did not request a fresh bounded tape (${mockState.whaleLiveRequests})`);
    const overlappingCursorLanes = new Set(mockState.whaleCursorRequests
      .filter(({ cursor }) => cursor === 'timestamp.ge')
      .map(({ lane }) => lane));
    assert(
      ['transactions', 'delegations', 'stake', 'unstake'].every((lane) => overlappingCursorLanes.has(lane))
        && mockState.whaleCursorRequests.every(({ cursor }) => cursor !== 'timestamp.gt'),
      `Whale Watch: every live lane must overlap the last timestamp with timestamp.ge ${JSON.stringify(mockState.whaleCursorRequests)}`
    );
    assert(quietAfter.sameBody && quietAfter.sameInput && quietAfter.sameTab && quietAfter.sameRow && quietAfter.focused, `Whale Watch: quiet refresh replaced focused browsing nodes ${JSON.stringify({ quietBefore, quietAfter })}`);
    assert(quietAfter.selection === quietBefore.selection && quietAfter.selectedView === 'true', `Whale Watch: quiet refresh lost selection or live tab state ${JSON.stringify({ quietBefore, quietAfter })}`);
    assert(quietAfter.pageY === quietBefore.pageY && Math.abs(quietAfter.anchorOffset - quietBefore.anchorOffset) < 2, `Whale Watch: prepended row moved the reader's live-tape anchor ${JSON.stringify({ quietBefore, quietAfter })}`);
    assert(quietAfter.rows === quietBefore.rows + (quietBefore.hadPrepend ? 0 : 1)
      && quietAfter.settled === 'true'
      && quietAfter.animation === 'none'
      && quietAfter.opacity === '1', `Whale Watch: prepend or settled-animation state failed ${JSON.stringify({ quietBefore, quietAfter })}`);
    const readerTop = await page.evaluate(() => {
      const body = document.querySelector('#whale-watch-body');
      body.closest('.chamber-room-scroll').scrollTop = Math.max(0, body.closest('.chamber-room-scroll').scrollTop - 37);
      return body.closest('.chamber-room-scroll').scrollTop;
    });
    await page.waitForTimeout(120);
    assert(Math.abs((await page.locator('#whale-watch-body').evaluate((body) => body.closest('.chamber-room-scroll').scrollTop)) - readerTop) < 1, 'Whale Watch: delayed anchor restore overrode a reader scroll made after reconciliation');

    await page.locator('#whale-watch-tab-awakenings').click();
    await page.locator('.whale-watch-awakening').waitFor({ state: 'visible', timeout: 5000 });
    const awakeningBeforeMismatch = await page.evaluate(() => {
      const row = document.querySelector('.whale-watch-awakening');
      window.__whaleWatchValidAwakening = row;
      return row?.textContent?.replace(/\s+/g, ' ').trim() || '';
    });
    mockState.mismatchWhaleDormancy(true);
    await page.evaluate(async () => {
      const feature = await import(window.__whaleChamberModuleUrl);
      await feature.refreshWhaleChamber({ quiet: true, forceArtifact: true });
    });
    await page.waitForFunction(() => /last-good retained.*refresh failed/i.test(document.querySelector('.whale-watch-header')?.textContent || ''), null, { timeout: 5000 });
    const mismatchedDormancyState = await page.evaluate(() => {
      const row = document.querySelector('.whale-watch-awakening');
      return {
        sameRow: row === window.__whaleWatchValidAwakening,
        text: row?.textContent?.replace(/\s+/g, ' ').trim() || '',
        freshness: document.querySelector('.whale-watch-header')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        launcherFreshness: document.querySelector('#whale-watch-entry-card')?.dataset.updatedLabel || '',
        launcherFooter: document.querySelector('#whale-watch-entry-card .chamber-entry-freshness')?.textContent?.trim() || ''
      };
    });
    assert(
      mismatchedDormancyState.sameRow
        && mismatchedDormancyState.text === awakeningBeforeMismatch
        && /last-good retained.*refresh failed/i.test(mismatchedDormancyState.freshness)
        && /^Last-good archive · .+ · refresh failed · 6h schedule$/.test(mismatchedDormancyState.launcherFreshness)
        && mismatchedDormancyState.launcherFreshness === mismatchedDormancyState.launcherFooter
        && !/1,900 days|5 years/i.test(mismatchedDormancyState.text),
      `Whale Watch: browser validation accepted a dormantDays value that disagreed with its prior/current receipt timestamps ${JSON.stringify(mismatchedDormancyState)}`
    );
    mockState.mismatchWhaleDormancy(false);
    await page.evaluate(async () => {
      const feature = await import(window.__whaleChamberModuleUrl);
      await feature.refreshWhaleChamber({ quiet: true, forceArtifact: true });
    });
    await page.waitForFunction(() => !document.querySelector('#whale-watch-freshness')?.classList.contains('is-stale'), null, { timeout: 15000 });
    await page.locator('#whale-watch-tab-live').click();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await assertPromotedLauncherGeometry(page, 'Whale Watch mobile launcher pair');
    const mobile = await page.evaluate(() => {
      const content = document.querySelector('.whale-watch-content');
      const tabs = document.querySelector('.whale-watch-tabs');
      return {
        bodyOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        contentInsideViewport: Boolean(content && content.getBoundingClientRect().left >= -1 && content.getBoundingClientRect().right <= window.innerWidth + 1),
        tabsScrollable: Boolean(tabs && tabs.scrollWidth >= tabs.clientWidth),
        rowVisible: Boolean(document.querySelector('.whale-watch-tape-row')?.getBoundingClientRect().height)
      };
    });
    assert(mobile.bodyOverflow <= 1 && mobile.contentInsideViewport && mobile.tabsScrollable && mobile.rowVisible, `Whale Watch: mobile containment failed ${JSON.stringify(mobile)}`);

    await page.evaluate(() => {
      window.__whaleWatchDirectRouteOpen = document.querySelector('#whale-watch-entry-card [aria-label="Open Whale Watch Chamber"]');
    });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#whale-watch-modal')?.classList.contains('active'), null, { timeout: 5000 });
    await page.waitForURL((url) => url.pathname === '/', { timeout: 5000 });
    await page.waitForFunction(() => document.activeElement === window.__whaleWatchDirectRouteOpen, null, { timeout: 5000 });
    const whaleDirectClose = await page.evaluate(() => ({
      bodyOverflow: document.body.style.overflow,
      exactFocus: document.activeElement === window.__whaleWatchDirectRouteOpen,
      focusConnected: Boolean(window.__whaleWatchDirectRouteOpen?.isConnected),
      focusLabel: document.activeElement?.getAttribute('aria-label') || '',
      htmlOverflow: document.documentElement.style.overflow,
      route: window.location.pathname
    }));
    assert(
      whaleDirectClose.route === '/'
        && whaleDirectClose.exactFocus
        && whaleDirectClose.focusConnected
        && whaleDirectClose.focusLabel === 'Open Whale Watch Chamber'
        && whaleDirectClose.bodyOverflow !== 'hidden'
        && whaleDirectClose.htmlOverflow !== 'hidden',
      `Whale Watch: direct-route close must restore /, scroll, and the exact connected Open button ${JSON.stringify(whaleDirectClose)}`
    );

    await page.setViewportSize({ width: 1440, height: 1000 });
    response = await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `Whale Watch: dashboard lifecycle route failed with HTTP ${response?.status()}`);
    await page.locator('#chambers-grid > .chamber-category[data-chamber-category="capital"] .chamber-category-toggle').click();
    await page.locator('#whale-watch-entry-card').dispatchEvent('pointerenter');
    const whaleOpenCue = page.locator('#whale-watch-entry-card [aria-label="Open Whale Watch Chamber"]');
    await whaleOpenCue.waitFor({ state: 'visible', timeout: 15000 });
    const footerBefore = await page.evaluate(() => {
      const loadedModuleUrl = performance.getEntriesByType('resource')
        .map((entry) => entry.name)
        .find((url) => /\/js\/features\/whale-chamber\.js(?:\?|$)/.test(url));
      if (!loadedModuleUrl) throw new Error('Whale Watch loaded module URL is unavailable');
      window.__whaleChamberModuleUrl = loadedModuleUrl;
      const cue = document.querySelector('#whale-watch-entry-card [aria-label="Open Whale Watch Chamber"]');
      window.__whaleWatchOpenCue = cue;
      cue?.focus({ preventScroll: true });
      return {
        ariaLabel: cue?.getAttribute('aria-label') || '',
        connected: Boolean(cue?.isConnected),
        focused: document.activeElement === cue,
        text: cue?.textContent?.replace(/\s+/g, ' ').trim() || ''
      };
    });
    assert(footerBefore.connected && footerBefore.focused && footerBefore.ariaLabel === 'Open Whale Watch Chamber', `Whale Watch: could not establish footer Open focus before refresh ${JSON.stringify(footerBefore)}`);
    await page.evaluate(async () => {
      const feature = await import(window.__whaleChamberModuleUrl);
      await feature.refreshWhaleChamber({ quiet: true });
    });
    const footerAfter = await page.evaluate(() => {
      const cue = document.querySelector('#whale-watch-entry-card [aria-label="Open Whale Watch Chamber"]');
      return {
        ariaLabel: cue?.getAttribute('aria-label') || '',
        connected: Boolean(cue?.isConnected),
        focused: document.activeElement === cue,
        sameNode: cue === window.__whaleWatchOpenCue,
        text: cue?.textContent?.replace(/\s+/g, ' ').trim() || ''
      };
    });
    assert(footerAfter.sameNode && footerAfter.connected && footerAfter.focused && footerAfter.ariaLabel === 'Open Whale Watch Chamber', `Whale Watch: quiet entry refresh replaced or defocused its footer Open control ${JSON.stringify({ footerBefore, footerAfter })}`);

    mockState.failWhaleLane('unstake');
    const atomicFailure = await page.evaluate(async () => {
      const chamber = await import(window.__whaleChamberModuleUrl);
      const whales = await import('/js/features/whales.js');
      const before = whales.getWhaleSnapshot();
      await chamber.refreshWhaleChamber({ quiet: true });
      const after = whales.getWhaleSnapshot();
      const cue = document.querySelector('#whale-watch-entry-card [aria-label="Open Whale Watch Chamber"]');
      return {
        afterIds: after.operations.map((operation) => String(operation.id)),
        beforeIds: before.operations.map((operation) => String(operation.id)),
        complete: after.coverage?.complete,
        error: after.error || '',
        focused: document.activeElement === cue,
        lanes: after.coverage?.lanes || [],
        mode: after.coverage?.mode || '',
        sameFooter: cue === window.__whaleWatchOpenCue,
        sameUpdatedAt: after.updatedAt === before.updatedAt,
        uncommittedLaneRow: after.operations.some((operation) => Number(operation.id) === 9999)
      };
    });
    mockState.failWhaleLane('');
    assert(
      atomicFailure.beforeIds.join(',') === atomicFailure.afterIds.join(',')
        && atomicFailure.sameUpdatedAt
        && !atomicFailure.uncommittedLaneRow
        && atomicFailure.mode === 'all-or-nothing'
        && atomicFailure.complete === false
        && atomicFailure.lanes.join(',') === 'transactions,delegations,stake,unstake'
        && /unstake operations unavailable \(503\)/i.test(atomicFailure.error)
        && atomicFailure.sameFooter
        && atomicFailure.focused,
      `Whale Watch: one failed TzKT lane must retain the complete four-lane snapshot and focused footer node ${JSON.stringify(atomicFailure)}`
    );

    response = await page.goto(`${baseUrl}/#giants`, { waitUntil: 'domcontentloaded' });
    assert(response == null || response.ok(), `Whale Watch: legacy #giants route failed with HTTP ${response?.status()}`);
    await page.locator('#whale-watch-modal.active #whale-watch-panel-dormant').waitFor({ state: 'visible', timeout: 15000 });
    assert(await page.locator('#whale-watch-tab-dormant').getAttribute('aria-selected') === 'true', 'Whale Watch: legacy #giants did not canonicalize to Deep Sleep');
    assert((await page.locator('#whale-watch-panel-dormant').innerText()).includes('Deep Vault'), 'Whale Watch: legacy #giants lost the shared dormant artifact');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#whale-watch-modal')?.classList.contains('active'), null, { timeout: 5000 });

    await context.close();
    assert(issues.length === 0, `Whale Watch Chamber browser issues:\n${issues.join('\n')}`);
    log('ok - Whale Watch complete receipts, grouped flows, dormancy, awakenings, legacy alias, quiet prepend anchoring, and mobile smoke');
  }

  async function smokeCycleHistoryChamber(browser, baseUrl) {
    const issues = [];
    const context = await browser.newContext({
      viewport: { width: 1366, height: 900 },
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
    attachIssueCollectors(page, 'Cycle History Chamber', issues);
    let response = await page.goto(`${baseUrl}/history/?range=24h&metric=price`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `Cycle History: direct route failed with HTTP ${response?.status()}`);
    await page.locator('#history-modal.active.cycle-history-chamber').waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForFunction(() => document.querySelector('#history-modal')?.getAttribute('aria-busy') !== 'true', null, { timeout: 15000 });
    const directState = await page.evaluate(() => {
      const modal = document.querySelector('#history-modal');
      const focus = modal?.querySelector('[data-history-metric="price"]');
      return {
        range: modal?.dataset.historyRange || '',
        metric: modal?.dataset.historyMetric || '',
        select: modal?.querySelector('#cycle-history-metric')?.value || '',
        focusedCurrent: focus?.getAttribute('aria-current') || '',
        focusedVisible: Boolean(focus?.getBoundingClientRect().height),
        contentTop: modal?.querySelector('.cycle-history-content')?.scrollTop || 0,
        title: modal?.querySelector('#history-modal-title')?.textContent || '',
        chartCount: modal?.querySelectorAll('[data-history-metric]').length || 0,
        sourceLedgers: modal?.querySelectorAll('.cycle-history-system-strip span').length || 0,
        sourceCadences: Array.from(modal?.querySelectorAll('.cycle-history-source-head span') || []).map((item) => item.textContent?.trim() || ''),
        sourceCoverage: Array.from(modal?.querySelectorAll('.cycle-history-source-coverage') || []).map((item) => item.textContent?.trim() || ''),
        launcherFreshness: document.querySelector('#cycle-history-entry-card')?.dataset.updatedLabel || '',
        launcherFooter: document.querySelector('#cycle-history-entry-card .chamber-entry-freshness')?.textContent?.trim() || ''
      };
    });
    assert(directState.range === '24h' && directState.metric === 'price' && directState.select === 'price' && directState.focusedCurrent === 'true', `Cycle History: direct range/metric state failed ${JSON.stringify(directState)}`);
    assert(directState.title === 'Cycle History Chamber' && directState.chartCount === 15 && directState.sourceLedgers === 5 && directState.focusedVisible, `Cycle History: full Chamber anatomy failed ${JSON.stringify(directState)}`);
    assert(directState.sourceCadences.includes('Scheduled every 2h')
      && directState.sourceCadences.filter((label) => label === 'Scheduled every 30m').length === 4
      && directState.sourceCoverage.some((label) => /observed median ~/.test(label)), `Cycle History: scheduled and observed cadence truth missing ${JSON.stringify(directState)}`);
    assert(!directState.launcherFreshness && !directState.launcherFooter, 'Cycle History direct boot must not build a hidden home launcher');

    await page.locator('.history-controls .time-range-btn[data-range="7d"]').click();
    await page.waitForFunction(() => document.querySelector('#history-modal')?.dataset.historyRange === '7d' && document.querySelector('#history-modal')?.getAttribute('aria-busy') !== 'true', null, { timeout: 15000 });
    await page.waitForFunction(() => document.querySelector('#history-digest')?.textContent?.includes('7d'), null, { timeout: 10000 });
    assert(new URL(page.url()).searchParams.get('range') === '7d', `Cycle History: range did not synchronize to direct route ${page.url()}`);
    const immediateMetricState = await page.locator('#cycle-history-metric').evaluate((select) => {
      select.value = 'network-health';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      const section = document.querySelector('.chart-section[data-history-metric="network-health"]');
      return {
        current: section?.getAttribute('aria-current') || '',
        className: section?.className || '',
        modalMetric: document.querySelector('#history-modal')?.dataset.historyMetric || ''
      };
    });
    await page.waitForTimeout(100);
    const metricInteractionState = await page.evaluate(() => ({
      selected: document.querySelector('#cycle-history-metric')?.value || '',
      modalMetric: document.querySelector('#history-modal')?.dataset.historyMetric || '',
      current: document.querySelector('.chart-section[data-history-metric="network-health"]')?.getAttribute('aria-current') || '',
      route: window.location.href,
      status: document.querySelector('#cycle-history-route-status')?.textContent || ''
    }));
    assert(metricInteractionState.current === 'true', `Cycle History: metric selector did not focus its chart ${JSON.stringify({ immediateMetricState, metricInteractionState })}`);
    const metricRoute = new URL(page.url());
    assert(metricRoute.searchParams.get('metric') === 'network-health' && metricRoute.searchParams.get('range') === '7d', `Cycle History: focused metric route drifted ${page.url()}`);
    await page.waitForFunction(() => {
      const content = document.querySelector('.cycle-history-content');
      const section = document.querySelector('.chart-section[data-history-metric="network-health"]');
      const contentRect = content?.getBoundingClientRect();
      const sectionRect = section?.getBoundingClientRect();
      return Boolean(content && section && content.scrollTop > 0 && contentRect && sectionRect
        && sectionRect.bottom > contentRect.top && sectionRect.top < contentRect.bottom);
    }, null, { timeout: 3000 });
    const focusState = await page.evaluate(() => {
      const content = document.querySelector('.cycle-history-content');
      const section = document.querySelector('.chart-section[data-history-metric="network-health"]');
      const contentRect = content?.getBoundingClientRect();
      const sectionRect = section?.getBoundingClientRect();
      return {
        scrollTop: content?.scrollTop || 0,
        sectionInView: Boolean(contentRect && sectionRect && sectionRect.bottom > contentRect.top && sectionRect.top < contentRect.bottom),
        status: document.querySelector('#cycle-history-route-status')?.textContent || ''
      };
    });
    assert(focusState.scrollTop > 0 && focusState.sectionInView && /Focused Network Health/.test(focusState.status), `Cycle History: metric focus did not scroll and announce correctly ${JSON.stringify(focusState)}`);

    await page.evaluate(() => {
      window.__cycleHistoryLastGoodDigest = document.querySelector('#history-digest');
      window.__cycleHistoryLastGoodCanvas = document.querySelector('#chart-price');
      const nativeGetElementById = Document.prototype.getElementById;
      Document.prototype.getElementById = function smokeFailCycleHistoryRange(id) {
        if (id === 'history-freshness-strip') {
          Document.prototype.getElementById = nativeGetElementById;
          throw new Error('smoke forced Cycle History range refresh failure');
        }
        return nativeGetElementById.call(this, id);
      };
    });
    await page.locator('.history-controls .time-range-btn[data-range="30d"]').click();
    await page.waitForFunction(() => {
      const modal = document.querySelector('#history-modal');
      const status = document.querySelector('#cycle-history-route-status')?.textContent || '';
      return modal?.dataset.historyRange === '7d'
        && !modal.hasAttribute('aria-busy')
        && /(?:Refresh unavailable|history could not refresh).*last-good 7d/i.test(status);
    }, null, { timeout: 10000 });
    const failedRangeState = await page.evaluate(() => ({
      activeRange: document.querySelector('.history-controls .time-range-btn.active')?.dataset.range || '',
      attemptedActive: document.querySelector('.history-controls .time-range-btn[data-range="30d"]')?.getAttribute('aria-pressed') || '',
      digestIdentity: document.querySelector('#history-digest') === window.__cycleHistoryLastGoodDigest,
      canvasIdentity: document.querySelector('#chart-price') === window.__cycleHistoryLastGoodCanvas,
      metric: document.querySelector('#history-modal')?.dataset.historyMetric || '',
      range: document.querySelector('#history-modal')?.dataset.historyRange || '',
      route: window.location.href,
      status: document.querySelector('#cycle-history-route-status')?.textContent || ''
    }));
    const failedRangeRoute = new URL(failedRangeState.route);
    assert(
      failedRangeState.range === '7d'
        && failedRangeState.activeRange === '7d'
        && failedRangeState.attemptedActive === 'false'
        && failedRangeState.metric === 'network-health'
        && failedRangeState.digestIdentity
        && failedRangeState.canvasIdentity
        && failedRangeRoute.searchParams.get('range') === '7d'
        && failedRangeRoute.searchParams.get('metric') === 'network-health'
        && /(?:Refresh unavailable|history could not refresh).*last-good 7d/i.test(failedRangeState.status),
      `Cycle History: failed range refresh drifted the last-good range, route, metric, or rendered nodes ${JSON.stringify(failedRangeState)}`
    );
    const expectedFailureIssue = issues.findIndex((issue) => issue.includes('smoke forced Cycle History range refresh failure'));
    assert(expectedFailureIssue >= 0, `Cycle History: deterministic failed-range probe did not reach the guarded refresh path ${JSON.stringify(issues)}`);
    issues.splice(expectedFailureIssue, 1);

    await Promise.all([
      page.waitForURL((url) => url.pathname === '/', { waitUntil: 'domcontentloaded', timeout: 30000 }),
      page.locator('#history-modal-close').click()
    ]);
    await page.locator('main').waitFor({ state: 'visible', timeout: 10000 });
    const restoredHistoryToggle = page.locator('#chambers-grid > .chamber-category[data-chamber-category="history"] .chamber-category-toggle');
    if (await restoredHistoryToggle.getAttribute('aria-expanded') !== 'true') await restoredHistoryToggle.click();
    await page.locator('#cycle-history-entry-card').scrollIntoViewIfNeeded();
    const launcherFreshness = await page.locator('#cycle-history-entry-card').evaluate(card => ({
      label: card.dataset.updatedLabel, footer: card.querySelector('.chamber-entry-freshness')?.textContent.trim()
    }));
    assert(/^History · oldest source \w+(?: · refresh delayed)?$/.test(launcherFreshness.label)
      && launcherFreshness.label === launcherFreshness.footer, `Cycle History: handoff launcher freshness missing ${JSON.stringify(launcherFreshness)}`);
    await assertPromotedLauncherGeometry(page, 'Cycle History desktop launcher geometry');
    assert(await page.locator('#cycle-history-entry-card .cycle-history-entry-route').getAttribute('href') === '/history/', 'Cycle History: entry card must retain the canonical first-party route');
    const cycleKeyboardLauncher = page.locator('#cycle-history-entry-card [aria-label="Open Cycle History Chamber"]');
    await cycleKeyboardLauncher.waitFor({ state: 'visible', timeout: 5000 });
    await cycleKeyboardLauncher.focus();
    await page.evaluate(() => {
      window.__cycleHistoryKeyboardLauncher = document.activeElement;
    });
    await page.keyboard.press('Enter');
    await page.locator('#history-modal.active').waitFor({ state: 'visible', timeout: 10000 });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#history-modal')?.classList.contains('active'), null, { timeout: 5000 });
    await page.waitForFunction(() => document.activeElement === window.__cycleHistoryKeyboardLauncher, null, { timeout: 5000 });
    const restored = await page.evaluate(() => ({
      exactFocus: document.activeElement === window.__cycleHistoryKeyboardLauncher,
      focusConnected: Boolean(window.__cycleHistoryKeyboardLauncher?.isConnected),
      focusLabel: document.activeElement?.getAttribute('aria-label') || '',
      bodyOverflow: document.body.style.overflow,
      htmlOverflow: document.documentElement.style.overflow
    }));
    assert(
      restored.exactFocus
        && restored.focusConnected
        && restored.focusLabel === 'Open Cycle History Chamber'
        && restored.bodyOverflow !== 'hidden'
        && restored.htmlOverflow !== 'hidden',
      `Cycle History: keyboard close did not restore the exact connected Open button and scroll lock ${JSON.stringify(restored)}`
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await assertPromotedLauncherGeometry(page, 'Cycle History mobile launcher geometry');
    await page.evaluate(async () => window.openCycleHistoryChamber({ range: 'all', metric: 'governance' }));
    await page.waitForFunction(() => document.querySelector('#history-modal')?.getAttribute('aria-busy') !== 'true', null, { timeout: 15000 });
    const mobile = await page.evaluate(() => {
      const content = document.querySelector('.cycle-history-content');
      const controls = document.querySelector('.cycle-history-route-controls');
      const focused = document.querySelector('.chart-section[data-history-metric="governance"]');
      const actions = document.querySelector('.cycle-history-header-actions');
      const sourceStrip = document.querySelector('.cycle-history-system-strip');
      const actionRect = actions?.getBoundingClientRect();
      const stripRect = sourceStrip?.getBoundingClientRect();
      const actionSizes = Array.from(actions?.querySelectorAll('button') || []).map((button) => {
        const rect = button.getBoundingClientRect();
        const style = getComputedStyle(button);
        return { width: rect.width, height: rect.height, cssWidth: style.width, cssHeight: style.height, transform: style.transform };
      });
      const contentStyle = content ? getComputedStyle(content) : null;
      const overlayStyle = getComputedStyle(document.querySelector('#history-modal'));
      const actionAncestors = [];
      for (let node = actions; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        actionAncestors.push({
          id: node.id || '',
          className: typeof node.className === 'string' ? node.className : '',
          transform: style.transform,
          zoom: style.zoom,
          animation: style.animationName
        });
      }
      return {
        bodyOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        contentInsideViewport: Boolean(content && content.getBoundingClientRect().left >= -1 && content.getBoundingClientRect().right <= window.innerWidth + 1),
        controlsInsideViewport: Boolean(controls && controls.getBoundingClientRect().right <= window.innerWidth + 1),
        focused: focused?.getAttribute('aria-current') || '',
        range: document.querySelector('#history-modal')?.dataset.historyRange || '',
        actionSizes,
        contentTransform: contentStyle?.transform || '',
        contentAnimation: contentStyle?.animationName || '',
        overlayTransform: overlayStyle.transform,
        viewportScale: window.visualViewport?.scale || 1,
        actionAncestors,
        headerActionsClear: Boolean(actionRect && stripRect && actionRect.bottom <= stripRect.top + 1)
      };
    });
    assert(mobile.bodyOverflow <= 1
      && mobile.contentInsideViewport
      && mobile.controlsInsideViewport
      && mobile.focused === 'true'
      && mobile.range === 'all'
      && mobile.headerActionsClear
      && mobile.overlayTransform === 'none'
      && mobile.actionSizes.length === 2
      && mobile.actionSizes.every(({ width, height }) => width >= 43.9 && height >= 43.9),
    `Cycle History: mobile focus, action geometry, or source-strip containment failed ${JSON.stringify(mobile)}`);
    await page.keyboard.press('Escape');

    await context.close();
    assert(issues.length === 0, `Cycle History Chamber browser issues:\n${issues.join('\n')}`);
    log('ok - Cycle History direct route, range, metric focus, close lifecycle, entry focus, and mobile smoke');
  }

  return { smokeLedgerFlowChamber, smokeWhaleWatchChamber, smokeCycleHistoryChamber };
}
