// Browser workflows owned by minerals. Shared dependencies remain explicit.
export function createMineralsSmokeSuites({
  assert,
  attachIssueCollectors,
  createHash,
  fulfillJson,
  installFeatureMocks,
  log,
  stableTestHash
}) {
  async function smokeMineralsChamber(browser, baseUrl) {
    let entryFixture = null;
    let snapshotFixture = null;
    let snapshotFixtureText = '';
    let entryRequests = 0;
    let snapshotRequests = 0;
    let failNextSnapshot = false;
    let mineralsRevision = 0;

    const clone = (value) => JSON.parse(JSON.stringify(value));
    const revisedSnapshot = (revision = 0) => {
      const snapshot = clone(snapshotFixture);
      if (revision > 0) {
        const generatedAt = new Date(Date.parse(snapshotFixture.generatedAt) + (revision * 60_000)).toISOString();
        snapshot.generatedAt = generatedAt;
        const copper = snapshot.markets?.series?.copper;
        if (copper) {
          const nextValue = Number(copper.latest?.value ?? copper.rows?.at(-1)?.value ?? 0) + (revision * 17);
          if (copper.latest) copper.latest.value = nextValue;
          if (Array.isArray(copper.rows) && copper.rows.length) copper.rows[copper.rows.length - 1].value = nextValue;
        }
        const xco = snapshot.tokenized?.products?.xCo;
        if (xco?.chain?.counters) xco.chain.counters.holderAddresses += revision;
        if (xco?.chain) xco.chain.observedAt = generatedAt;
        if (snapshot.sources?.worldBankPinkSheet) snapshot.sources.worldBankPinkSheet.retrievedAt = generatedAt;
      }
      const { contentHash: _contentHash, ...unsigned } = snapshot;
      return { ...unsigned, contentHash: stableTestHash(unsigned) };
    };
    const revisedEntry = (snapshot, sourceText) => {
      const entry = clone(entryFixture);
      entry.generatedAt = snapshot.generatedAt;
      entry.fullSnapshot.generatedAt = snapshot.generatedAt;
      entry.fullSnapshot.contentHash = snapshot.contentHash;
      entry.fullSnapshot.fileSha256 = createHash('sha256').update(sourceText).digest('hex');
      const copper = snapshot.markets?.series?.copper;
      const copperPulse = entry.marketPulse?.rows?.find((row) => row.id === 'copper');
      if (copperPulse && copper) {
        copperPulse.latest = clone(copper.latest);
        copperPulse.rows = clone((copper.rows || []).slice(-36));
      }
      const xco = snapshot.tokenized?.products?.xCo;
      const xcoProjection = entry.tokenized?.products?.find((row) => String(row.symbol || '').toLowerCase() === 'xco');
      if (xcoProjection && xco?.chain) {
        xcoProjection.holderAddresses = xco.chain.counters?.holderAddresses;
        xcoProjection.observedAt = xco.chain.observedAt;
      }
      const { contentHash: ignoredContentHash, ...unsigned } = entry;
      entry.contentHash = stableTestHash(unsigned);
      return entry;
    };

    const installMineralsState = async (context) => {
      await context.addInitScript(() => {
        localStorage.setItem('tezos-systems-theme', 'matrix');
        localStorage.setItem('tezos-toured', '1');
        localStorage.setItem('tezos-welcomed', '1');
        localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
        window.__MINERALS_CHAMBER_REFRESH_MS__ = 197531;
        window.__MINERALS_ENTRY_REFRESH_MS__ = 197533;
        window.__mineralsSmokeVisibility = 'visible';
        const nativeSetInterval = window.setInterval.bind(window);
        window.setInterval = (callback, delay, ...args) => {
          const timer = nativeSetInterval(callback, delay, ...args);
          if (Number(delay) === window.__MINERALS_CHAMBER_REFRESH_MS__) {
            window.__mineralsSmokeTimerTick = () => callback(...args);
          }
          return timer;
        };
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          get: () => window.__mineralsSmokeVisibility
        });
      });
    };

    const installArtifactRoutes = async (context) => {
      await context.route('**/data/minerals-entry-summary.json*', async (route) => {
        entryRequests += 1;
        if (!entryFixture) {
          const response = await route.fetch();
          entryFixture = await response.json();
          return fulfillJson(route, clone(entryFixture));
        }
        if (!snapshotFixture || mineralsRevision === 0) return fulfillJson(route, clone(entryFixture));
        const snapshot = revisedSnapshot(mineralsRevision);
        const sourceText = JSON.stringify(snapshot);
        return fulfillJson(route, revisedEntry(snapshot, sourceText));
      });
      await context.route('**/data/minerals-snapshot.json*', async (route) => {
        snapshotRequests += 1;
        if (failNextSnapshot) {
          failNextSnapshot = false;
          return route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'forced Minerals refresh failure' })
          });
        }
        if (!snapshotFixture) {
          // Mutation fixtures read the public source; transport parity is checked separately.
  const response = await route.fetch({ url: new URL('/data/minerals-snapshot.json', route.request().url()).href });
          const text = await response.text();
          snapshotFixtureText = text;
          snapshotFixture = JSON.parse(text);
          return route.fulfill({ status: response.status(), contentType: 'application/json', body: text });
        }
        if (mineralsRevision === 0) return route.fulfill({ status: 200, contentType: 'application/json', body: snapshotFixtureText });
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(revisedSnapshot(mineralsRevision)) });
      });
    };

    const issues = [];
    const context = await browser.newContext({ viewport: { width: 1280, height: 760 }, serviceWorkers: 'block' });
    await installFeatureMocks(context);
    await installMineralsState(context);
    await installArtifactRoutes(context);
    const page = await context.newPage();
    attachIssueCollectors(page, 'minerals chamber', issues);

    const launcherResponse = await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    assert(launcherResponse?.ok(), `minerals chamber: dashboard launcher failed with HTTP ${launcherResponse?.status()}`);
    await page.locator('#chambers-grid > .chamber-category[data-chamber-category="capital"] .chamber-category-toggle').click();
    await page.locator('#minerals-entry-card').dispatchEvent('pointerenter');
    await page.waitForFunction(() => document.querySelector('#minerals-entry-front')?.dataset.mineralsRendered === '1', null, { timeout: 10000 });
    const compactState = await page.evaluate(() => ({
      title: document.querySelector('#minerals-entry-title')?.textContent?.trim() || '',
      value: document.querySelector('#minerals-entry-front .minerals-entry-value')?.textContent?.trim() || '',
      kpis: document.querySelector('#minerals-entry-front .minerals-entry-kpis')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      modalOpen: document.querySelector('#minerals-modal')?.classList.contains('active') || false,
      fullResources: performance.getEntriesByType('resource').filter(({ name }) => name.includes('/data/minerals-snapshot.json')).length
    }));
    assert(compactState.title === 'Critical Minerals' && compactState.value === '60'
      && /Rare earths\s*15/i.test(compactState.kpis) && /Monthly series\s*10/i.test(compactState.kpis)
      && /Etherlink products\s*3 \/ 3/i.test(compactState.kpis)
      && !compactState.modalOpen && compactState.fullResources === 0
      && entryRequests >= 1 && snapshotRequests === 0,
    `minerals chamber: collapsed launcher did not remain compact-only ${JSON.stringify({ compactState, entryRequests, snapshotRequests })}`);

    await page.locator('#minerals-entry-card .chamber-expand-cue').click();
    await page.locator('#minerals-modal.active .minerals-content').waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForFunction(() => {
      const body = document.querySelector('#minerals-chamber-body');
      return body?.dataset.mineralsRendered === '1' || Boolean(body?.querySelector('[role="alert"]'));
    }, null, { timeout: 10000 });
    const firstOpenState = await page.evaluate(() => ({
      rendered: document.querySelector('#minerals-chamber-body')?.dataset.mineralsRendered || '',
      alert: document.querySelector('#minerals-chamber-body [role="alert"]')?.textContent?.replace(/\s+/g, ' ').trim() || ''
    }));
    assert(firstOpenState.rendered === '1',
      `minerals chamber: explicit open could not verify the full snapshot ${JSON.stringify({ firstOpenState, entryRequests, snapshotRequests })}`);
    assert(snapshotRequests === 1, `minerals chamber: explicit open did not fetch exactly one full snapshot ${snapshotRequests}`);

    const shell = await page.evaluate(() => {
      const dialog = document.querySelector('#minerals-modal .minerals-content');
      const tabs = Array.from(document.querySelectorAll('#minerals-modal [role="tab"][data-minerals-view]'));
      const panel = document.querySelector('#minerals-view-panel');
      return {
        role: dialog?.getAttribute('role') || '',
        modal: dialog?.getAttribute('aria-modal') || '',
        labelledBy: dialog?.getAttribute('aria-labelledby') || '',
        focusInside: Boolean(dialog?.contains(document.activeElement)),
        tablist: document.querySelector('#minerals-modal .minerals-tabs')?.getAttribute('role') || '',
        ids: tabs.map((tab) => tab.dataset.mineralsView),
        labels: tabs.map((tab) => tab.textContent?.trim() || ''),
        selected: tabs.filter((tab) => tab.getAttribute('aria-selected') === 'true').map((tab) => tab.dataset.mineralsView),
        tabbable: tabs.filter((tab) => tab.tabIndex === 0).map((tab) => tab.dataset.mineralsView),
        panelRole: panel?.getAttribute('role') || '',
        panelLabelledBy: panel?.getAttribute('aria-labelledby') || '',
        atlasRows: panel?.querySelectorAll('.minerals-atlas-card').length || 0
      };
    });
    assert(shell.role === 'dialog' && shell.modal === 'true' && shell.labelledBy === 'minerals-title'
      && shell.focusInside && shell.tablist === 'tablist'
      && JSON.stringify(shell.ids) === JSON.stringify(['atlas', 'supply', 'markets', 'etherlink', 'proofbook'])
      && JSON.stringify(shell.labels) === JSON.stringify(['Atlas', 'Supply', 'Markets', 'Etherlink', 'Proofbook'])
      && JSON.stringify(shell.selected) === JSON.stringify(['atlas'])
      && JSON.stringify(shell.tabbable) === JSON.stringify(['atlas'])
      && shell.panelRole === 'tabpanel' && shell.panelLabelledBy === 'minerals-tab-atlas'
      && shell.atlasRows === 60,
    `minerals chamber: dialog or five-view accessibility contract failed ${JSON.stringify(shell)}`);

    await page.locator('#minerals-tab-atlas').focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => (
      document.querySelector('#minerals-tab-supply')?.getAttribute('aria-selected') === 'true'
        && document.activeElement === document.querySelector('#minerals-tab-supply')
    ), null, { timeout: 3000 });

    const viewCoverage = {};
    const forbiddenInteractive = [];
    for (const view of ['atlas', 'supply', 'markets', 'etherlink', 'proofbook']) {
      await page.locator(`[data-minerals-view="${view}"]`).click();
      await page.waitForFunction((selectedView) => (
        document.querySelector(`[data-minerals-view="${selectedView}"]`)?.getAttribute('aria-selected') === 'true'
          && document.querySelector('#minerals-view-panel')?.getAttribute('aria-labelledby') === `minerals-tab-${selectedView}`
      ), view, { timeout: 3000 });
      viewCoverage[view] = await page.evaluate((selectedView) => {
        const panel = document.querySelector('#minerals-view-panel');
        const interactive = Array.from(document.querySelectorAll('#minerals-modal a, #minerals-modal button'), (node) => (
          `${node.textContent?.replace(/\s+/g, ' ').trim() || node.getAttribute('aria-label') || ''} ${node.getAttribute('href') || ''}`.trim()
        ));
        return {
          selected: document.querySelector(`[data-minerals-view="${selectedView}"]`)?.getAttribute('aria-selected') || '',
          labelledBy: panel?.getAttribute('aria-labelledby') || '',
          text: panel?.textContent?.replace(/\s+/g, ' ').trim() || '',
          atlasCards: panel?.querySelectorAll('.minerals-atlas-card').length || 0,
          supplyRows: panel?.querySelectorAll('.minerals-supply-table tbody tr').length || 0,
          coverageNotes: panel?.querySelectorAll('.minerals-coverage-card').length || 0,
          groupContexts: panel?.querySelectorAll('.minerals-group-context-card').length || 0,
          marketSeries: panel?.querySelectorAll('[data-minerals-series] option').length || 0,
          tokenProducts: panel?.querySelectorAll('.minerals-token-product').length || 0,
          basketComponents: panel?.querySelectorAll('.minerals-basket-grid > article').length || 0,
          proofRows: panel?.querySelectorAll('.minerals-source-table tbody tr').length || 0,
          unavailableCards: panel?.querySelectorAll('.minerals-unavailable-grid > article').length || 0,
          interactive
        };
      }, view);
      forbiddenInteractive.push(...viewCoverage[view].interactive.filter((label) => (
        /\b(?:buy|sell|trade|swap|bridge|redeem|execute|connect wallet)\b/i.test(label)
      )));
    }
    assert(viewCoverage.atlas.atlasCards === 60 && /Sixty materials/i.test(viewCoverage.atlas.text)
      && viewCoverage.supply.supplyRows === 60 && viewCoverage.supply.coverageNotes === 5
      && viewCoverage.supply.groupContexts === 3 && /Reliance and production ledger/i.test(viewCoverage.supply.text)
      && /Group-only MCS context/i.test(viewCoverage.supply.text)
      && /Thulium.*No exact commodity rows/i.test(viewCoverage.supply.text)
      && viewCoverage.markets.marketSeries === 10 && /source-native unit/i.test(viewCoverage.markets.text)
      && viewCoverage.etherlink.tokenProducts === 3 && viewCoverage.etherlink.basketComponents === 5
      && /addresses, not people/i.test(viewCoverage.etherlink.text)
      && viewCoverage.proofbook.proofRows >= 8 && viewCoverage.proofbook.unavailableCards >= 13
      && /Unavailable evidence/i.test(viewCoverage.proofbook.text)
      && /Thulium annual coverage.*No exact commodity rows/i.test(viewCoverage.proofbook.text),
    `minerals chamber: one or more complete view surfaces are missing ${JSON.stringify(viewCoverage)}`);
    assert(forbiddenInteractive.length === 0,
      `minerals chamber: an execution or wallet CTA leaked into an interactive control ${JSON.stringify(forbiddenInteractive)}`);

    const aliasResponse = await page.goto(`${baseUrl}/?minerals-alias#critical-minerals`, { waitUntil: 'domcontentloaded' });
    assert(aliasResponse?.ok(), `minerals chamber: hash alias failed with HTTP ${aliasResponse?.status()}`);
    await page.locator('#minerals-modal.active .minerals-content').waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForFunction(() => document.querySelector('#minerals-chamber-body')?.dataset.mineralsRendered === '1', null, { timeout: 10000 });
    const aliasState = await page.evaluate(() => ({
      hash: location.hash,
      title: document.querySelector('#minerals-title')?.textContent?.trim() || '',
      open: document.querySelector('#minerals-modal')?.classList.contains('active') || false
    }));
    assert(aliasState.hash === '#critical-minerals' && aliasState.title === 'Critical Minerals' && aliasState.open,
      `minerals chamber: #critical-minerals alias did not open the room ${JSON.stringify(aliasState)}`);

    const directResponse = await page.goto(`${baseUrl}/minerals/?view=markets&series=copper&range=1y`, { waitUntil: 'domcontentloaded' });
    assert(directResponse?.ok(), `minerals chamber: direct pretty route failed with HTTP ${directResponse?.status()}`);
    await page.locator('#minerals-modal.active .minerals-content').waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForFunction(() => document.querySelector('#minerals-chamber-body')?.dataset.mineralsRendered === '1', null, { timeout: 10000 });
    const routeState = await page.evaluate(() => ({
      path: location.pathname,
      view: new URL(location.href).searchParams.get('view'),
      series: new URL(location.href).searchParams.get('series'),
      range: new URL(location.href).searchParams.get('range'),
      selectedView: document.querySelector('[data-minerals-view][aria-selected="true"]')?.dataset.mineralsView || '',
      selectedSeries: document.querySelector('[data-minerals-series]')?.value || '',
      selectedRange: document.querySelector('[data-minerals-range][aria-pressed="true"]')?.dataset.mineralsRange || '',
      panelLabelledBy: document.querySelector('#minerals-view-panel')?.getAttribute('aria-labelledby') || ''
    }));
    assert(routeState.path === '/minerals/' && routeState.view === 'markets' && routeState.series === 'copper'
      && routeState.range === '1y' && routeState.selectedView === 'markets' && routeState.selectedSeries === 'copper'
      && routeState.selectedRange === '1Y' && routeState.panelLabelledBy === 'minerals-tab-markets',
    `minerals chamber: direct route did not restore its view, series, and range ${JSON.stringify(routeState)}`);
    await page.locator('[data-minerals-range="10Y"]').click();
    const updatedRoute = await page.evaluate(() => ({
      range: new URL(location.href).searchParams.get('range'),
      selected: document.querySelector('[data-minerals-range][aria-pressed="true"]')?.dataset.mineralsRange || ''
    }));
    assert(updatedRoute.range === '10y' && updatedRoute.selected === '10Y',
      `minerals chamber: market range did not update the bookmarkable URL ${JSON.stringify(updatedRoute)}`);

    await page.waitForFunction(() => typeof window.__mineralsSmokeTimerTick === 'function', null, { timeout: 3000 });
    const entriesBeforeUnchangedTick = entryRequests;
    const snapshotsBeforeUnchangedTick = snapshotRequests;
    await page.evaluate(() => window.__mineralsSmokeTimerTick());
    const unchangedDeadline = Date.now() + 3000;
    while (entryRequests <= entriesBeforeUnchangedTick && Date.now() < unchangedDeadline) await page.waitForTimeout(25);
    await page.waitForTimeout(75);
    assert(entryRequests === entriesBeforeUnchangedTick + 1 && snapshotRequests === snapshotsBeforeUnchangedTick,
      `minerals chamber: unchanged summary should not redownload the full snapshot ${JSON.stringify({ entriesBeforeUnchangedTick, entryRequests, snapshotsBeforeUnchangedTick, snapshotRequests })}`);
    const quietBefore = await page.evaluate(() => {
      const body = document.querySelector('#minerals-chamber-body');
      const header = body?.querySelector('.minerals-header');
      const panel = body?.querySelector('#minerals-view-panel');
      const content = body?.querySelector('#minerals-view-content');
      const focus = body?.querySelector('#minerals-tab-markets');
      const value = content?.querySelector('.minerals-market-clock > div:first-child strong');
      const textNode = content?.querySelector('.minerals-market-panel .minerals-panel-head p')?.firstChild;
      if (!body || !header || !panel || !content || !focus || !value || !textNode) throw new Error('minerals quiet-refresh fixture is incomplete');
      const maxTop = Math.max(0, body.closest('.chamber-room-scroll').scrollHeight - body.closest('.chamber-room-scroll').clientHeight);
      body.closest('.chamber-room-scroll').scrollTop = Math.min(280, Math.max(1, Math.floor(maxTop / 3)));
      focus.focus({ preventScroll: true });
      const selection = getSelection();
      selection.removeAllRanges();
      const range = document.createRange();
      range.setStart(textNode, 0);
      range.setEnd(textNode, Math.min(14, textNode.textContent.length));
      selection.addRange(range);
      delete body.dataset.quietRefreshSettled;
      window.__mineralsQuietFixture = { body, header, panel, content, focus, value };
      return {
        top: body.closest('.chamber-room-scroll').scrollTop,
        maxTop,
        selection: selection.toString(),
        value: value.textContent?.trim() || ''
      };
    });
    assert(quietBefore.top > 0 && quietBefore.maxTop > quietBefore.top + 20 && quietBefore.selection.length > 0,
      `minerals chamber: quiet-refresh fixture did not exercise room scroll and selection ${JSON.stringify(quietBefore)}`);

    await page.evaluate(() => {
      window.__mineralsSmokeVisibility = 'hidden';
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const entriesBeforeHiddenTick = entryRequests;
    const requestsBeforeHiddenTick = snapshotRequests;
    await page.evaluate(() => window.__mineralsSmokeTimerTick());
    await page.waitForTimeout(75);
    assert(entryRequests === entriesBeforeHiddenTick && snapshotRequests === requestsBeforeHiddenTick,
      `minerals chamber: hidden timer polled a summary or full snapshot ${JSON.stringify({ entriesBeforeHiddenTick, entryRequests, requestsBeforeHiddenTick, snapshotRequests })}`);

    mineralsRevision = 1;
    await page.evaluate(() => {
      window.__mineralsSmokeVisibility = 'visible';
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const catchupDeadline = Date.now() + 6000;
    while (snapshotRequests <= requestsBeforeHiddenTick && Date.now() < catchupDeadline) await page.waitForTimeout(25);
    assert(snapshotRequests === requestsBeforeHiddenTick + 1,
      `minerals chamber: visibility return did not perform exactly one catch-up ${JSON.stringify({ requestsBeforeHiddenTick, snapshotRequests })}`);
    await page.waitForFunction(() => {
      const body = document.querySelector('#minerals-chamber-body');
      return body?.dataset.quietRefreshSettled === 'true' && !body?.dataset.quietRefreshing;
    }, null, { timeout: 6000 });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const quietAfter = await page.evaluate(() => {
      const saved = window.__mineralsQuietFixture;
      const body = document.querySelector('#minerals-chamber-body');
      const header = body?.querySelector('.minerals-header');
      const panel = body?.querySelector('#minerals-view-panel');
      const content = body?.querySelector('#minerals-view-content');
      const focus = body?.querySelector('#minerals-tab-markets');
      const value = content?.querySelector('.minerals-market-clock > div:first-child strong');
      const style = header ? getComputedStyle(header) : null;
      return {
        sameBody: body === saved?.body,
        sameHeader: header === saved?.header,
        samePanel: panel === saved?.panel,
        sameContent: content === saved?.content,
        sameFocus: focus === saved?.focus,
        focused: document.activeElement === saved?.focus,
        selectedView: document.querySelector('[data-minerals-view][aria-selected="true"]')?.dataset.mineralsView || '',
        selectedSeries: document.querySelector('[data-minerals-series]')?.value || '',
        selectedRange: document.querySelector('[data-minerals-range][aria-pressed="true"]')?.dataset.mineralsRange || '',
        top: body?.closest('.chamber-room-scroll')?.scrollTop || 0,
        selection: getSelection()?.toString() || '',
        value: value?.textContent?.trim() || '',
        settled: body?.dataset.quietRefreshSettled === 'true' && !body?.dataset.quietRefreshing,
        opacity: style?.opacity || '',
        transform: style?.transform || ''
      };
    });
    assert(quietAfter.sameBody && quietAfter.sameHeader && quietAfter.samePanel && quietAfter.sameContent
      && quietAfter.sameFocus && quietAfter.focused && quietAfter.selectedView === 'markets'
      && quietAfter.selectedSeries === 'copper' && quietAfter.selectedRange === '10Y',
    `minerals chamber: quiet catch-up replaced the body or focused reading nodes ${JSON.stringify({ quietBefore, quietAfter })}`);
    assert(Math.abs(quietAfter.top - quietBefore.top) < 1 && quietAfter.selection === quietBefore.selection
      && quietAfter.value !== quietBefore.value,
    `minerals chamber: quiet catch-up lost scroll/selection or failed to reconcile new data ${JSON.stringify({ quietBefore, quietAfter })}`);
    assert(quietAfter.settled && quietAfter.opacity === '1' && quietAfter.transform === 'none',
      `minerals chamber: quiet catch-up replayed or stranded visual state ${JSON.stringify(quietAfter)}`);

    const readerScroll = await page.evaluate(() => {
      const body = document.querySelector('#minerals-chamber-body');
      body.closest('.chamber-room-scroll').scrollTop += 19;
      return body.closest('.chamber-room-scroll').scrollTop;
    });
    await page.waitForTimeout(100);
    const readerScrollAfter = await page.evaluate(() => document.querySelector('#minerals-chamber-body')?.closest('.chamber-room-scroll')?.scrollTop || 0);
    assert(Math.abs(readerScrollAfter - readerScroll) < 1,
      `minerals chamber: a delayed restore overwrote reader scroll after reconciliation ${JSON.stringify({ readerScroll, readerScrollAfter })}`);

    mineralsRevision = 2;
    failNextSnapshot = true;
    const requestsBeforeFailure = snapshotRequests;
    const lastGoodValue = quietAfter.value;
    await page.evaluate(() => window.__mineralsSmokeTimerTick());
    const failureDeadline = Date.now() + 6000;
    while (snapshotRequests <= requestsBeforeFailure && Date.now() < failureDeadline) await page.waitForTimeout(25);
    await page.waitForFunction(() => /Last good .* refresh failed/i.test(document.querySelector('#minerals-freshness')?.textContent || ''), null, { timeout: 6000 });
    const failureState = await page.evaluate(() => {
      const saved = window.__mineralsQuietFixture;
      const body = document.querySelector('#minerals-chamber-body');
      return {
        sameBody: body === saved?.body,
        sameHeader: body?.querySelector('.minerals-header') === saved?.header,
        focused: document.activeElement === saved?.focus,
        view: document.querySelector('[data-minerals-view][aria-selected="true"]')?.dataset.mineralsView || '',
        value: document.querySelector('#minerals-view-content .minerals-market-clock > div:first-child strong')?.textContent?.trim() || '',
        freshness: document.querySelector('#minerals-freshness')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        errorSurface: Boolean(document.querySelector('#minerals-chamber-body .minerals-error')),
        rendered: body?.dataset.mineralsRendered || ''
      };
    });
    assert(snapshotRequests === requestsBeforeFailure + 1 && failureState.sameBody && failureState.sameHeader
      && failureState.focused && failureState.view === 'markets' && failureState.value === lastGoodValue
      && /Last good .* refresh failed/i.test(failureState.freshness)
      && !failureState.errorSurface && failureState.rendered === '1',
    `minerals chamber: failed refresh did not retain and label the complete last-good room ${JSON.stringify({ requestsBeforeFailure, snapshotRequests, failureState })}`);

    await context.close();
    const unexpectedIssues = issues.filter((issue) => (
      !/Minerals snapshot refresh failed:.*Minerals snapshot HTTP 503/i.test(issue)
        && !/Failed to load resource:.*status of 503.*\/data\/minerals-snapshot\.json/i.test(issue)
    ));
    assert(unexpectedIssues.length === 0, `minerals chamber browser issues:\n${unexpectedIssues.join('\n')}`);

    for (const viewport of [{ width: 320, height: 720 }, { width: 390, height: 844 }]) {
      const mobileIssues = [];
      const mobileSnapshot = revisedSnapshot(10 + viewport.width);
      const mobileSnapshotText = JSON.stringify(mobileSnapshot);
      const mobileEntry = revisedEntry(mobileSnapshot, mobileSnapshotText);
      const mobileContext = await browser.newContext({ viewport, serviceWorkers: 'block' });
      await installFeatureMocks(mobileContext);
      await installMineralsState(mobileContext);
      await mobileContext.route('**/data/minerals-entry-summary.json*', (route) => {
        entryRequests += 1;
        return fulfillJson(route, clone(mobileEntry));
      });
      await mobileContext.route('**/data/minerals-snapshot.json*', (route) => {
        snapshotRequests += 1;
        return route.fulfill({ status: 200, contentType: 'application/json', body: mobileSnapshotText });
      });
      const mobilePage = await mobileContext.newPage();
      attachIssueCollectors(mobilePage, `minerals chamber ${viewport.width}px`, mobileIssues);
      const launcherMobileResponse = await mobilePage.goto(`${baseUrl}/?minerals-launcher-width=${viewport.width}`, { waitUntil: 'domcontentloaded' });
      assert(launcherMobileResponse?.ok(), `minerals chamber ${viewport.width}px: dashboard launcher failed with HTTP ${launcherMobileResponse?.status()}`);
      await mobilePage.locator('#chambers-grid > .chamber-category[data-chamber-category="capital"] .chamber-category-toggle').click();
      await mobilePage.locator('#minerals-entry-card').dispatchEvent('pointerenter');
      await mobilePage.waitForFunction(() => (
        document.querySelector('#minerals-entry-front')?.dataset.mineralsRendered === '1'
          && Boolean(document.querySelector('#minerals-entry-front > .chamber-entry-footer'))
      ), null, { timeout: 10000 });
      await mobilePage.evaluate(() => document.fonts?.ready);
      await mobilePage.locator('#minerals-entry-card').scrollIntoViewIfNeeded();
      await mobilePage.waitForFunction(() => (
        Array.from(document.querySelectorAll('#minerals-entry-front img')).every((image) => image.complete)
      ), null, { timeout: 10000 });
      const launcherGeometry = await mobilePage.evaluate(() => {
        const card = document.querySelector('#minerals-entry-card');
        const front = document.querySelector('#minerals-entry-front');
        const copy = front?.querySelector('.minerals-entry-copy');
        const art = front?.querySelector('.minerals-entry-art');
        const kpis = front?.querySelector('.minerals-entry-kpis');
        const chart = front?.querySelector('.minerals-entry-chart');
        const footer = front?.querySelector(':scope > .chamber-entry-footer');
        const rect = (node) => {
          const bounds = node?.getBoundingClientRect();
          return bounds ? {
            left: bounds.left,
            right: bounds.right,
            top: bounds.top,
            bottom: bounds.bottom,
            width: bounds.width,
            height: bounds.height
          } : null;
        };
        const intersects = (first, second) => Boolean(first && second
          && Math.min(first.right, second.right) - Math.max(first.left, second.left) > 1
          && Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top) > 1);
        const cardRect = rect(card);
        const frontRect = rect(front);
        const copyRect = rect(copy);
        const artRect = rect(art);
        const kpisRect = rect(kpis);
        const chartRect = rect(chart);
        const footerRect = rect(footer);
        const layers = [copyRect, artRect, kpisRect, chartRect, footerRect].filter(Boolean);
        return {
          viewport: { width: innerWidth, height: innerHeight },
          card: cardRect,
          front: frontRect,
          copy: copyRect,
          art: artRect,
          kpis: kpisRect,
          chart: chartRect,
          footer: footerRect,
          copyOverlapsKpis: intersects(copyRect, kpisRect),
          artOverlapsKpis: intersects(artRect, kpisRect),
          kpisOverlapChart: intersects(kpisRect, chartRect),
          kpisOverlapFooter: intersects(kpisRect, footerRect),
          layersContained: Boolean(frontRect && layers.every((layer) => (
            layer.left >= frontRect.left - 1 && layer.right <= frontRect.right + 1
          ))),
          frontOverflow: front ? front.scrollWidth - front.clientWidth : Infinity,
          pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
        };
      });
      assert(launcherGeometry.card && launcherGeometry.front && launcherGeometry.copy && launcherGeometry.art
        && launcherGeometry.kpis && launcherGeometry.chart && launcherGeometry.footer,
      `minerals chamber ${viewport.width}px: dashboard launcher layers are incomplete ${JSON.stringify(launcherGeometry)}`);
      assert(!launcherGeometry.copyOverlapsKpis && !launcherGeometry.artOverlapsKpis
        && !launcherGeometry.kpisOverlapChart && !launcherGeometry.kpisOverlapFooter,
      `minerals chamber ${viewport.width}px: copy, art, KPIs, chart, or footer overlap ${JSON.stringify(launcherGeometry)}`);
      assert(launcherGeometry.card.left >= -1 && launcherGeometry.card.right <= viewport.width + 1
        && launcherGeometry.layersContained && launcherGeometry.frontOverflow <= 1 && launcherGeometry.pageOverflow <= 1,
      `minerals chamber ${viewport.width}px: dashboard launcher escaped horizontally ${JSON.stringify(launcherGeometry)}`);

      const mobileResponse = await mobilePage.goto(`${baseUrl}/minerals/?view=atlas`, { waitUntil: 'domcontentloaded' });
      assert(mobileResponse?.ok(), `minerals chamber ${viewport.width}px: route failed with HTTP ${mobileResponse?.status()}`);
      await mobilePage.locator('#minerals-modal.active .minerals-content').waitFor({ state: 'visible', timeout: 10000 });
      await mobilePage.waitForFunction(() => document.querySelector('#minerals-chamber-body')?.dataset.mineralsRendered === '1', null, { timeout: 10000 });

      const geometryByView = {};
      for (const view of ['atlas', 'supply', 'markets', 'etherlink', 'proofbook']) {
        await mobilePage.locator(`[data-minerals-view="${view}"]`).click();
        await mobilePage.waitForFunction((selectedView) => (
          document.querySelector(`[data-minerals-view="${selectedView}"]`)?.getAttribute('aria-selected') === 'true'
        ), view, { timeout: 3000 });
        geometryByView[view] = await mobilePage.evaluate((selectedView) => {
          const content = document.querySelector('#minerals-modal .minerals-content');
          const body = document.querySelector('#minerals-chamber-body');
          const header = document.querySelector('#minerals-modal .minerals-header');
          const tabs = document.querySelector('#minerals-modal .minerals-tabs');
          const selected = document.querySelector(`[data-minerals-view="${selectedView}"]`);
          const shell = document.querySelector('#minerals-view-panel');
          const rect = (node) => {
            const bounds = node?.getBoundingClientRect();
            return bounds ? { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom, width: bounds.width } : null;
          };
          const bodyRect = body?.closest('.chamber-room-scroll')?.getBoundingClientRect();
          const containers = Array.from(shell?.querySelectorAll('.minerals-atlas-card, .minerals-panel, .minerals-token-product, .minerals-proof-hero, .minerals-boundary, .minerals-coverage-card, .minerals-group-context-card') || []);
          const escapedContainers = containers.filter((node) => {
            const bounds = node.getBoundingClientRect();
            return bodyRect && (bounds.left < bodyRect.left - 1 || bounds.right > bodyRect.right + 1);
          }).length;
          const selectedRect = selected?.getBoundingClientRect();
          const tabsRect = tabs?.getBoundingClientRect();
          return {
            content: rect(content),
            header: rect(header),
            shell: rect(shell),
            mainScrollable: Boolean(body && body.closest('.chamber-room-scroll').scrollHeight > body.closest('.chamber-room-scroll').clientHeight),
            pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            selectedVisible: Boolean(selectedRect && tabsRect && selectedRect.right > tabsRect.left && selectedRect.left < tabsRect.right),
            tabsScrollable: Boolean(tabs && tabs.scrollWidth >= tabs.clientWidth),
            escapedContainers,
            tableWrapContained: Array.from(shell?.querySelectorAll('.minerals-table-wrap') || []).every((node) => {
              const bounds = node.getBoundingClientRect();
              return bodyRect && bounds.left >= bodyRect.left - 1 && bounds.right <= bodyRect.right + 1;
            })
          };
        }, view);
      }
      const mobileGeometry = geometryByView.atlas;
      assert(mobileGeometry.content && mobileGeometry.content.left >= -1 && mobileGeometry.content.right <= viewport.width + 1
        && mobileGeometry.content.top >= -1 && mobileGeometry.content.bottom <= viewport.height + 1
        && mobileGeometry.mainScrollable,
      `minerals chamber ${viewport.width}px: dialog escaped or failed to provide room scroll ${JSON.stringify(geometryByView)}`);
      assert(Object.values(geometryByView).every((state) => state.header && state.shell
        && state.header.left >= -1 && state.header.right <= viewport.width + 1
        && state.shell.left >= -1 && state.shell.right <= viewport.width + 1
        && state.pageOverflow <= 1 && state.selectedVisible && state.tabsScrollable
        && state.escapedContainers === 0 && state.tableWrapContained),
      `minerals chamber ${viewport.width}px: a view, table, tab, or content panel overflowed ${JSON.stringify(geometryByView)}`);
      await mobileContext.close();
      assert(mobileIssues.length === 0, `minerals chamber ${viewport.width}px browser issues:\n${mobileIssues.join('\n')}`);
    }

    assert(entryRequests > 0 && snapshotRequests >= 5,
      `minerals chamber: compact and full receipt paths were not both exercised ${JSON.stringify({ entryRequests, snapshotRequests })}`);
    log('ok - Critical Minerals compact launch, five views, routing, hidden gating, quiet refresh, last-good retention, and mobile geometry smoke');
  }

  return { smokeMineralsChamber };
}
