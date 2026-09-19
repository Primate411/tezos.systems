// Browser workflows owned by ecosystem. Shared dependencies remain explicit.
export function createEcosystemSmokeSuites({
  EXPECTED_CHAMBER_CATEGORIES,
  assert,
  attachIssueCollectors,
  createHash,
  fulfillJson,
  installFeatureMocks,
  log,
  stableTestHash
}) {
  async function smokeEcosystemActivity(browser, baseUrl) {
    const issues = [];
    let ecosystemEntryFixture = null;
    let ecosystemSnapshotFixture = null;
    let ecosystemSnapshotText = '';
    let ecosystemRevision = 0;
    let ecosystemEntryRequests = 0;
    let ecosystemSnapshotRequests = 0;
    const clone = (value) => JSON.parse(JSON.stringify(value));
    const makeEcosystemSnapshot = (revision) => {
      const snapshot = clone(ecosystemSnapshotFixture);
      if (revision > 0) {
        const generatedAt = new Date(Date.parse(ecosystemSnapshotFixture.generatedAt) + (revision * 60_000)).toISOString();
        snapshot.generatedAt = generatedAt;
        if (snapshot.partialWeek) {
          snapshot.partialWeek.observedAt = generatedAt;
          if (snapshot.partialWeek.all) {
            snapshot.partialWeek.all.activeWallets = Number(snapshot.partialWeek.all.activeWallets || 0) + revision;
            snapshot.partialWeek.all.interactions = Number(snapshot.partialWeek.all.interactions || 0) + revision;
          }
          if (snapshot.partialWeek.layers?.etherlink) {
            snapshot.partialWeek.layers.etherlink.activeWallets = Number(snapshot.partialWeek.layers.etherlink.activeWallets || 0) + revision;
            snapshot.partialWeek.layers.etherlink.interactions = Number(snapshot.partialWeek.layers.etherlink.interactions || 0) + revision;
          }
        }
        if (snapshot.networkActivity?.partialWeek) {
          snapshot.networkActivity.partialWeek.observedAt = generatedAt;
          if (snapshot.networkActivity.partialWeek.all) {
            snapshot.networkActivity.partialWeek.all.activeWallets = Number(snapshot.networkActivity.partialWeek.all.activeWallets || 0) + revision;
          }
          if (snapshot.networkActivity.partialWeek.layers?.etherlink) {
            snapshot.networkActivity.partialWeek.layers.etherlink.activeWallets = Number(snapshot.networkActivity.partialWeek.layers.etherlink.activeWallets || 0) + revision;
            snapshot.networkActivity.partialWeek.layers.etherlink.approximate = true;
          }
        }
        const morphoWeek = snapshot.apps?.find((app) => app.id === 'morpho-blue')?.weekly?.at(-1);
        if (morphoWeek?.all) {
          morphoWeek.all.activeWallets = Number(morphoWeek.all.activeWallets || 0) + revision;
          morphoWeek.all.interactions = Number(morphoWeek.all.interactions || 0) + revision;
        }
        if (morphoWeek?.layers?.etherlink) {
          morphoWeek.layers.etherlink.activeWallets = Number(morphoWeek.layers.etherlink.activeWallets || 0) + revision;
          morphoWeek.layers.etherlink.interactions = Number(morphoWeek.layers.etherlink.interactions || 0) + revision;
        }
        const { contentHash: ignored, ...unsigned } = snapshot;
        snapshot.contentHash = stableTestHash(unsigned);
      }
      return snapshot;
    };
    const makeEcosystemEntry = (snapshot, sourceText) => {
      const entry = clone(ecosystemEntryFixture);
      entry.generatedAt = snapshot.generatedAt;
      entry.source.generatedAt = snapshot.generatedAt;
      entry.source.contentHash = snapshot.contentHash;
      entry.source.fileSha256 = createHash('sha256').update(sourceText).digest('hex');
      if (snapshot.partialWeek) entry.partialWeek = clone(snapshot.partialWeek);
      if (snapshot.networkActivity) entry.networkActivity = clone(snapshot.networkActivity);
      const { contentHash: ignored, ...unsigned } = entry;
      entry.contentHash = stableTestHash(unsigned);
      return entry;
    };
    const currentEcosystemPair = () => {
      const snapshot = makeEcosystemSnapshot(ecosystemRevision);
      const snapshotText = ecosystemRevision === 0 ? ecosystemSnapshotText : JSON.stringify(snapshot);
      return { snapshot, snapshotText, entry: makeEcosystemEntry(snapshot, snapshotText) };
    };
    const waitForArtifactRequests = async (predicate, label, timeoutMs = 10000) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw new Error(`${label}: ${JSON.stringify({ ecosystemEntryRequests, ecosystemSnapshotRequests })}`);
    };
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(context);
    await context.route('**/data/ecosystem-entry-summary.json*', async (route) => {
      ecosystemEntryRequests += 1;
      if (!ecosystemEntryFixture) {
        const response = await route.fetch();
        ecosystemEntryFixture = await response.json();
        return fulfillJson(route, clone(ecosystemEntryFixture));
      }
      if (!ecosystemSnapshotFixture) return fulfillJson(route, clone(ecosystemEntryFixture));
      return fulfillJson(route, currentEcosystemPair().entry);
    });
    await context.route('**/data/ecosystem-stats.json*', async (route) => {
      ecosystemSnapshotRequests += 1;
      if (!ecosystemSnapshotFixture) {
        // Mutation fixtures read the public source; transport parity is checked separately.
  const response = await route.fetch({ url: new URL('/data/ecosystem-stats.json', route.request().url()).href });
        ecosystemSnapshotText = await response.text();
        ecosystemSnapshotFixture = JSON.parse(ecosystemSnapshotText);
        return route.fulfill({ status: response.status(), contentType: 'application/json', body: ecosystemSnapshotText });
      }
      const pair = currentEcosystemPair();
      return route.fulfill({ status: 200, contentType: 'application/json', body: pair.snapshotText });
    });
    await context.addInitScript(() => {
      localStorage.setItem('tezos-systems-theme', 'clean');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
      window.__ECOSYSTEM_CHAMBER_REFRESH_MS__ = 135799;
      window.__ecosystemSmokeVisibility = 'visible';
      const nativeSetInterval = window.setInterval.bind(window);
      window.setInterval = (callback, delay, ...args) => {
        const timer = nativeSetInterval(callback, delay, ...args);
        if (Number(delay) === window.__ECOSYSTEM_CHAMBER_REFRESH_MS__) {
          window.__ecosystemSmokeTimerTick = () => callback(...args);
        }
        return timer;
      };
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => window.__ecosystemSmokeVisibility
      });
    });
    const page = await context.newPage();
    attachIssueCollectors(page, 'ecosystem activity', issues);

    const response = await page.goto(`${baseUrl}/ecosystem/?layer=tezos&range=all`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `ecosystem activity: pretty route failed with HTTP ${response?.status()}`);
    await page.locator('#ecosystem-activity-modal.active .ecosystem-content').waitFor({ state: 'visible', timeout: 20000 });
    await page.waitForFunction(() => (
      document.querySelector('#ecosystem-chamber-body')?.dataset.ecosystemRendered === '1'
      && document.querySelectorAll('#ecosystem-activity-modal [data-ecosystem-app]').length >= 10
    ), null, { timeout: 20000 });

    const initial = await page.evaluate(() => ({
      pathname: location.pathname,
      layer: new URL(location.href).searchParams.get('layer'),
      range: new URL(location.href).searchParams.get('range'),
      selectedLayer: document.querySelector('#ecosystem-activity-modal [data-ecosystem-layer][aria-selected="true"]')?.dataset.ecosystemLayer || '',
      topRows: document.querySelectorAll('#ecosystem-activity-modal [data-quiet-key="ecosystem-top-ten"] tbody tr').length,
      directoryCards: document.querySelectorAll('#ecosystem-activity-modal .ecosystem-directory-card').length,
      charts: document.querySelectorAll('#ecosystem-activity-modal .ecosystem-chart svg').length,
      partialText: document.querySelector('#ecosystem-activity-modal .ecosystem-kpis .is-partial')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      networkText: document.querySelector('#ecosystem-activity-modal [data-ecosystem-network-kpi]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      trackedText: Array.from(document.querySelectorAll('#ecosystem-activity-modal .ecosystem-kpis article'))
        .find((node) => /Tracked-app wallets/i.test(node.textContent || ''))?.textContent?.replace(/\s+/g, ' ').trim() || '',
      methodology: document.querySelector('#ecosystem-activity-modal .ecosystem-methodology')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      sourceLinks: document.querySelectorAll('#ecosystem-activity-modal .ecosystem-footer a[href^="https://"]').length,
      rawWalletRows: document.querySelectorAll('#ecosystem-activity-modal [data-wallet], #ecosystem-activity-modal [data-address]').length
    }));
    assert(initial.pathname === '/ecosystem/' && initial.layer === 'tezos' && initial.range === 'all' && initial.selectedLayer === 'tezos',
      `ecosystem activity: direct route state drifted ${JSON.stringify(initial)}`);
    assert(initial.topRows === 10 && initial.directoryCards >= 10 && initial.charts >= 4
      && /partial through/i.test(initial.partialText)
      && /Tezos L1 active addresses/i.test(initial.networkText)
      && /Tracked-app wallets/i.test(initial.trackedText)
      && /pseudonymous addresses, not people/i.test(initial.methodology)
      && /TzKT all-address scan:.*initiator\.null=true.*daily id\.gt keyset/i.test(initial.methodology)
      && /Etherlink all-address chart: activeAccounts · WEEK/i.test(initial.methodology)
      && /TzKT catalog:.*id\.gt keyset/i.test(initial.methodology)
      && /Contract-universe SHA-256: [0-9a-f]{64}/i.test(initial.methodology)
      && initial.sourceLinks >= 2 && initial.rawWalletRows === 0,
    `ecosystem activity: ranking, directory, source, or privacy presentation failed ${JSON.stringify(initial)}`);

    await page.locator('#ecosystem-activity-modal [data-ecosystem-layer="etherlink"]').click();
    await page.waitForFunction(() => new URL(location.href).searchParams.get('layer') === 'etherlink'
      && document.querySelector('#ecosystem-activity-modal [data-ecosystem-layer="etherlink"]')?.getAttribute('aria-selected') === 'true');
    const l2State = await page.evaluate(() => ({
      rows: document.querySelectorAll('#ecosystem-activity-modal [data-quiet-key="ecosystem-top-ten"] tbody tr').length,
      cards: document.querySelectorAll('#ecosystem-activity-modal .ecosystem-directory-card').length,
      labels: Array.from(document.querySelectorAll('#ecosystem-activity-modal .ecosystem-layer-chip')).map((node) => node.textContent?.trim())
    }));
    assert(l2State.rows === 7 && l2State.cards === 7 && l2State.labels.every((label) => label === 'L2'),
      `ecosystem activity: Etherlink filter did not isolate the disclosed L2 universe ${JSON.stringify(l2State)}`);

    await page.locator('#ecosystem-activity-modal [data-ecosystem-app="morpho-blue"]').first().click();
    await page.waitForFunction(() => new URL(location.href).searchParams.get('app') === 'morpho-blue'
      && /Morpho Blue/i.test(document.querySelector('#ecosystem-history-detail')?.textContent || '')
      && document.activeElement?.id === 'ecosystem-detail-title');
    const appState = await page.evaluate(() => ({
      proofCards: document.querySelectorAll('#ecosystem-history-detail .ecosystem-proof-card').length,
      contracts: document.querySelectorAll('#ecosystem-history-detail .ecosystem-contract-list a').length,
      proofLinks: document.querySelectorAll('#ecosystem-history-detail .ecosystem-proof-links a').length,
      ledgerSummary: document.querySelector('#ecosystem-history-detail .ecosystem-history-ledger summary')?.textContent?.trim() || '',
      website: document.querySelector('#ecosystem-history-detail .ecosystem-detail-actions a')?.href || '',
      focusedId: document.activeElement?.id || '',
      focusedTabIndex: document.activeElement?.tabIndex
    }));
    assert(appState.proofCards === 1 && appState.contracts === 1 && appState.proofLinks >= 1
      && /weekly rows/i.test(appState.ledgerSummary) && /^https:/.test(appState.website)
      && appState.focusedId === 'ecosystem-detail-title' && appState.focusedTabIndex === -1,
    `ecosystem activity: app history or proofbook failed ${JSON.stringify(appState)}`);

    await page.locator('#ecosystem-activity-modal [data-ecosystem-range="12w"]').click();
    await page.waitForFunction(() => new URL(location.href).searchParams.get('range') === '12w'
      && /Inspect 12 weekly rows/i.test(document.querySelector('#ecosystem-history-detail .ecosystem-history-ledger summary')?.textContent || ''));
    await page.locator('#ecosystem-activity-modal [data-ecosystem-layer="all"]').click();
    await page.waitForFunction(() => !new URL(location.href).searchParams.has('layer'));

    await page.waitForFunction(() => typeof window.__ecosystemSmokeTimerTick === 'function');
    const unchangedEntryBefore = ecosystemEntryRequests;
    const unchangedSnapshotBefore = ecosystemSnapshotRequests;
    await page.evaluate(() => window.__ecosystemSmokeTimerTick());
    await waitForArtifactRequests(
      () => ecosystemEntryRequests >= unchangedEntryBefore + 1,
      'ecosystem activity: unchanged timer did not poll the compact projection'
    );
    await page.waitForTimeout(150);
    assert(
      ecosystemEntryRequests === unchangedEntryBefore + 1
        && ecosystemSnapshotRequests === unchangedSnapshotBefore,
      `ecosystem activity: unchanged summary poll downloaded the complete snapshot ${JSON.stringify({
        unchangedEntryBefore,
        unchangedSnapshotBefore,
        ecosystemEntryRequests,
        ecosystemSnapshotRequests
      })}`
    );

    await page.evaluate(() => {
      const body = document.querySelector('#ecosystem-chamber-body');
      const detail = document.querySelector('#ecosystem-history-detail');
      const focus = document.querySelector('#ecosystem-activity-modal [data-ecosystem-range="12w"]');
      const intro = document.querySelector('#ecosystem-activity-modal .ecosystem-intro')?.firstChild;
      body.closest('.chamber-room-scroll').scrollTop = Math.min(640, body.closest('.chamber-room-scroll').scrollHeight - body.closest('.chamber-room-scroll').clientHeight);
      focus.focus({ preventScroll: true });
      if (intro?.nodeType === Node.TEXT_NODE && intro.length > 12) {
        const selection = getSelection();
        const range = document.createRange();
        range.setStart(intro, 0);
        range.setEnd(intro, Math.min(12, intro.length));
        selection.removeAllRanges();
        selection.addRange(range);
      }
      delete body.dataset.quietRefreshSettled;
      window.__ecosystemQuietFixture = {
        body,
        detail,
        scrollTop: body.closest('.chamber-room-scroll').scrollTop,
        selectedText: getSelection()?.toString() || ''
      };
    });

    await page.evaluate(() => {
      window.__ecosystemSmokeVisibility = 'hidden';
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const hiddenEntryBefore = ecosystemEntryRequests;
    const hiddenSnapshotBefore = ecosystemSnapshotRequests;
    await page.evaluate(() => window.__ecosystemSmokeTimerTick());
    await page.waitForTimeout(150);
    assert(
      ecosystemEntryRequests === hiddenEntryBefore && ecosystemSnapshotRequests === hiddenSnapshotBefore,
      `ecosystem activity: hidden timer performed network work ${JSON.stringify({
        hiddenEntryBefore,
        hiddenSnapshotBefore,
        ecosystemEntryRequests,
        ecosystemSnapshotRequests
      })}`
    );

    ecosystemRevision = 1;
    const expectedEcosystemHash = makeEcosystemSnapshot(ecosystemRevision).contentHash;
    await page.evaluate(() => {
      window.__ecosystemSmokeVisibility = 'visible';
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitForArtifactRequests(
      () => ecosystemEntryRequests >= hiddenEntryBefore + 1 && ecosystemSnapshotRequests >= hiddenSnapshotBefore + 1,
      'ecosystem activity: visible catch-up did not fetch the changed snapshot'
    );
    await page.waitForFunction(() => {
      const body = document.querySelector('#ecosystem-chamber-body');
      return body?.dataset.quietRefreshSettled === 'true'
        && body.dataset.quietRefreshing !== 'true';
    }, null, { timeout: 7000 });
    assert(
      ecosystemEntryRequests === hiddenEntryBefore + 1 && ecosystemSnapshotRequests === hiddenSnapshotBefore + 1,
      `ecosystem activity: changed catch-up request counts drifted ${JSON.stringify({
        hiddenEntryBefore,
        hiddenSnapshotBefore,
        ecosystemEntryRequests,
        ecosystemSnapshotRequests
      })}`
    );
    const quiet = await page.evaluate((expectedHash) => {
      const fixture = window.__ecosystemQuietFixture;
      const body = document.querySelector('#ecosystem-chamber-body');
      return {
        sameBody: fixture.body === body,
        sameDetail: fixture.detail === document.querySelector('#ecosystem-history-detail'),
        scrollDelta: Math.abs(body.closest('.chamber-room-scroll').scrollTop - fixture.scrollTop),
        focusRange: document.activeElement?.dataset?.ecosystemRange || '',
        selectedText: getSelection()?.toString() || '',
        expectedSelection: fixture.selectedText,
        rangePressed: document.querySelector('[data-ecosystem-range="12w"]')?.getAttribute('aria-pressed'),
        refreshing: body.dataset.quietRefreshing || '',
        settled: body.dataset.quietRefreshSettled || '',
        changedReceiptVisible: (body.textContent || '').includes(expectedHash)
      };
    }, expectedEcosystemHash);
    assert(quiet.sameBody && quiet.sameDetail && quiet.scrollDelta <= 1 && quiet.focusRange === '12w'
      && quiet.selectedText === quiet.expectedSelection && quiet.selectedText.length > 0
      && quiet.rangePressed === 'true' && quiet.refreshing === '' && quiet.settled === 'true'
      && quiet.changedReceiptVisible,
    `ecosystem activity: quiet refresh moved or reset the reader ${JSON.stringify(quiet)}`);

    await page.evaluate(() => {
      const body = document.querySelector('#ecosystem-chamber-body');
      body.closest('.chamber-room-scroll').scrollTop = Math.max(0, body.closest('.chamber-room-scroll').scrollTop - 111);
      window.__ecosystemReaderScroll = body.closest('.chamber-room-scroll').scrollTop;
    });
    await page.waitForTimeout(150);
    const readerScrollPreserved = await page.evaluate(() => (
      Math.abs(document.querySelector('#ecosystem-chamber-body')?.closest('.chamber-room-scroll')?.scrollTop - window.__ecosystemReaderScroll) <= 1
    ));
    assert(readerScrollPreserved, 'ecosystem activity: delayed quiet restore overwrote an immediate reader scroll');
    await context.close();

    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(mobileContext);
    await mobileContext.addInitScript(() => {
      localStorage.setItem('tezos-systems-theme', 'clean');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    });
    const mobilePage = await mobileContext.newPage();
    attachIssueCollectors(mobilePage, 'ecosystem activity mobile', issues);
    const mobileResponse = await mobilePage.goto(`${baseUrl}/ecosystem/?layer=etherlink&range=3y&app=curve`, { waitUntil: 'domcontentloaded' });
    assert(mobileResponse?.ok(), `ecosystem activity mobile: direct route failed with HTTP ${mobileResponse?.status()}`);
    await mobilePage.locator('#ecosystem-activity-modal.active .ecosystem-content').waitFor({ state: 'visible', timeout: 20000 });
    await mobilePage.waitForFunction(() => /Curve/i.test(document.querySelector('#ecosystem-history-detail')?.textContent || ''), null, { timeout: 15000 });
    await mobilePage.waitForTimeout(250);
    const mobile = await mobilePage.evaluate(() => {
      const modal = document.querySelector('#ecosystem-activity-modal .ecosystem-content');
      const body = document.querySelector('#ecosystem-chamber-body');
      const rect = modal?.getBoundingClientRect();
      return {
        rect: rect ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom } : null,
        mainScroll: Boolean(body && body.closest('.chamber-room-scroll').scrollHeight > body.closest('.chamber-room-scroll').clientHeight),
        pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        headerPosition: getComputedStyle(document.querySelector('#ecosystem-activity-modal .ecosystem-header')).position,
        toolbarContained: Array.from(document.querySelectorAll('#ecosystem-activity-modal .ecosystem-toolbar button')).every((button) => {
          const box = button.getBoundingClientRect();
          return box.left >= -1 && box.right <= innerWidth + 1;
        }),
        layer: new URL(location.href).searchParams.get('layer'),
        range: new URL(location.href).searchParams.get('range'),
        app: new URL(location.href).searchParams.get('app'),
        proofCards: document.querySelectorAll('#ecosystem-history-detail .ecosystem-proof-card').length,
        visibleContracts: document.querySelectorAll('#ecosystem-history-detail .ecosystem-contract-list a').length,
        proofLinks: document.querySelectorAll('#ecosystem-history-detail .ecosystem-proof-links a').length,
        moreContracts: document.querySelector('#ecosystem-history-detail .ecosystem-proof-note')?.textContent?.trim() || ''
      };
    });
    assert(mobile.rect && mobile.rect.left <= 1 && mobile.rect.right >= 389
      && mobile.rect.top <= 1 && mobile.rect.bottom >= 843
      && mobile.mainScroll && mobile.pageOverflow <= 1 && mobile.toolbarContained
      && mobile.headerPosition !== 'sticky' && mobile.headerPosition !== 'fixed'
      && mobile.layer === 'etherlink' && mobile.range === '3y' && mobile.app === 'curve'
      && mobile.proofCards === 1 && mobile.visibleContracts === 24 && mobile.proofLinks === 4
      && /3 more frozen addresses/i.test(mobile.moreContracts),
    `ecosystem activity mobile: route or containment failed ${JSON.stringify(mobile)}`);
    await mobileContext.close();

    assert(issues.length === 0, `ecosystem activity browser issues:\n${issues.join('\n')}`);
    log('ok - Ecosystem Activity ranking, history, proofbook, quiet refresh, direct route, and mobile smoke');
  }

  async function smokeTezosDomainsChamber(browser, baseUrl) {
    const issues = [];
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
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
    attachIssueCollectors(page, 'tezos domains chamber', issues);

    const response = await page.goto(`${baseUrl}/#domains`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `tezos domains chamber: dashboard failed with HTTP ${response?.status()}`);
    await page.locator('#tezos-domains-entry-card').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('#tezos-domains-modal.active .tezos-domains-content').waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForFunction(() => document.querySelectorAll('#tezos-domains-modal .td-event-row').length >= 4, null, { timeout: 10000 });

    const state = await page.evaluate(() => {
      const card = document.querySelector('#tezos-domains-entry-card');
      const pair = document.querySelector('#chambers-grid > .chamber-category[data-chamber-category="people"]');
      const grid = document.querySelector('#chambers-grid');
      const modal = document.querySelector('#tezos-domains-modal');
      const rect = (node) => {
        const box = node?.getBoundingClientRect();
        return box ? { width: box.width, height: box.height, left: box.left, right: box.right } : null;
      };
      return {
        hash: window.location.hash,
        pathname: window.location.pathname,
        cardCopyHash: card?.querySelector('.card-copy-link')?.dataset.copyHash || '',
        cardText: card?.textContent?.replace(/\s+/g, ' ').trim() || '',
        cardUpdatedLabel: card?.dataset.updatedLabel || '',
        pairChildren: pair?.querySelectorAll(':scope > .chamber-category-cards > .stat-card').length || 0,
        categoryOrder: Array.from(pair?.querySelectorAll(':scope > .chamber-category-cards > .stat-card') || []).map((entry) => entry.id || entry.dataset.stat || ''),
        pairRect: rect(pair),
        cardRect: rect(card),
        gridRect: rect(grid),
        title: modal?.querySelector('.chamber-title')?.textContent || '',
        badge: modal?.querySelector('.chamber-badge')?.textContent || '',
        header: modal?.querySelector('.chamber-proposal-info')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        urgentText: modal?.querySelector('.td-urgent-surface')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        pulse: modal?.querySelector('.td-pulse-grid')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        panels: Array.from(modal?.querySelectorAll('.td-panel-title') || []).map((node) => node.textContent?.replace(/\s+/g, ' ').trim() || ''),
        eventRows: modal?.querySelectorAll('.td-event-row').length || 0,
        marketRows: modal?.querySelectorAll('.td-market-row').length || 0,
        expiryRows: modal?.querySelectorAll('.td-expiry-row').length || 0,
        text: modal?.textContent?.replace(/\s+/g, ' ').trim() || '',
        lookupText: modal?.querySelector('#tezos-domains-lookup-result')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        lookupInput: modal?.querySelector('#tezos-domains-lookup-input')?.getAttribute('placeholder') || '',
        domainLinks: Array.from(modal?.querySelectorAll('a[href^="https://app.tezos.domains/domain/"]') || []).map((link) => link.href),
        dappHref: modal?.querySelector('a[href="https://app.tezos.domains/"]')?.getAttribute('href') || '',
        docsHref: modal?.querySelector('a[href*="developers.tezos.domains/integrating-tezos-domains/graphql"]')?.href || '',
        tzktLinks: modal?.querySelectorAll('a[href^="https://tzkt.io/"]').length || 0,
        directHref: modal?.querySelector('.panel-direct-link')?.getAttribute('href') || '',
        footer: modal?.querySelector('.chamber-footer')?.textContent || '',
        horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    });

    assert(state.hash === '' && state.pathname === '/domains/', `tezos domains chamber: canonical path mismatch ${state.pathname}${state.hash}`);
    assert(state.cardCopyHash === '#domains', `tezos domains chamber: card copy hash mismatch ${state.cardCopyHash}`);
    assert(/Tezos Domains/.test(state.cardText) && /noob\.tez/.test(state.cardText) && /24h names/i.test(state.cardText), `tezos domains chamber: card content missing ${state.cardText}`);
    assert(/Tezos Domains/.test(state.cardUpdatedLabel), `tezos domains chamber: card freshness missing ${state.cardUpdatedLabel}`);
    const expectedPeopleCards = EXPECTED_CHAMBER_CATEGORIES.find(category => category.key === 'people').cards;
    assert(state.pairChildren === expectedPeopleCards.length && state.categoryOrder.join(',') === expectedPeopleCards.join(','), `tezos domains chamber: People & Accounts membership mismatch ${JSON.stringify(state)}`);
    assert(state.pairRect?.width >= state.gridRect?.width - 4 && state.cardRect?.width >= state.gridRect?.width - 4, `tezos domains chamber: dense categorized launcher must own a full row ${JSON.stringify({ pair: state.pairRect, card: state.cardRect, grid: state.gridRect })}`);
    assert(/Tezos Domains Chamber/.test(state.title), `tezos domains chamber: title mismatch ${state.title}`);
    assert(/Name rush|Market live|Identity pulse/.test(state.badge), `tezos domains chamber: badge mismatch ${state.badge}`);
    assert(/noob\.tez/.test(state.header) && /renewal cliff|drops in/i.test(state.header), `tezos domains chamber: featured expiring name missing ${state.header}`);
    assert(/Urgency tape/.test(state.urgentText) && /Expiring Soon/.test(state.urgentText) && /Auction Heat/.test(state.urgentText) && /noob\.tez/.test(state.urgentText) && /auction\.tez/.test(state.urgentText), `tezos domains chamber: urgency surface missing ${state.urgentText}`);
    assert(/24h names/.test(state.pulse) && /24h reverse/.test(state.pulse) && /Live auctions/.test(state.pulse) && /Active asks/.test(state.pulse) && /30d drops/.test(state.pulse), `tezos domains chamber: pulse metrics missing ${state.pulse}`);
    assert(state.panels.some((text) => /Live Registration Feed/.test(text)) && state.panels.some((text) => /Identity Tape/.test(text)) && state.panels.some((text) => /Premium Moves/.test(text)) && state.panels.some((text) => /Auctions/.test(text)) && state.panels.some((text) => /Sell Wall/.test(text)) && state.panels.some((text) => /Want List/.test(text)) && state.panels.some((text) => /30d Drops/.test(text)), `tezos domains chamber: expected panels missing ${state.panels.join(' | ')}`);
    assert(state.eventRows >= 4 && state.marketRows >= 5 && state.expiryRows >= 2, `tezos domains chamber: row counts too sparse ${JSON.stringify(state)}`);
    assert(/registered 6\.00 XTZ/.test(state.text) && /auction\.tez/.test(state.text) && /market\.tez/.test(state.text) && /baking\.tez/.test(state.text) && /noob\.tez/.test(state.text), `tezos domains chamber: mocked names not surfaced ${state.text}`);
    assert(/Type a name to check availability/i.test(state.lookupText) && /builder or builder\.tez/i.test(state.lookupInput), `tezos domains chamber: lookup affordance missing ${state.lookupText}/${state.lookupInput}`);
    assert(state.domainLinks.length >= 8 && state.domainLinks.some((href) => href.includes('/domain/viral.tez')), `tezos domains chamber: Tezos Domains name links missing ${state.domainLinks.join(', ')}`);
    assert(state.dappHref === 'https://app.tezos.domains/' && state.docsHref.includes('developers.tezos.domains'), `tezos domains chamber: dApp/docs links missing ${state.dappHref}/${state.docsHref}`);
    assert(state.tzktLinks >= 3, `tezos domains chamber: operation links missing ${state.tzktLinks}`);
    assert(state.directHref === '/domains/' && /Direct: \/domains\//.test(state.footer), `tezos domains chamber: /domains direct footer missing ${state.directHref}/${state.footer}`);
    assert(state.horizontalOverflow <= 1, `tezos domains chamber: horizontal overflow ${state.horizontalOverflow}`);

    await page.locator('#tezos-domains-lookup-input').fill('freshfind');
    await page.locator('#tezos-domains-lookup-form').evaluate((form) => form.requestSubmit());
    await page.waitForFunction(() => /Looks available/.test(document.querySelector('#tezos-domains-lookup-result')?.textContent || ''), null, { timeout: 5000 });
    const availableLookupText = await page.locator('#tezos-domains-lookup-result').innerText();
    assert(/freshfind\.tez/.test(availableLookupText) && /Register on Tezos Domains/.test(availableLookupText), `tezos domains chamber: available lookup missing action ${availableLookupText}`);

    await page.locator('#tezos-domains-lookup-input').fill('viral.tez');
    await page.locator('#tezos-domains-lookup-form').evaluate((form) => form.requestSubmit());
    await page.waitForFunction(() => /Registered/.test(document.querySelector('#tezos-domains-lookup-result')?.textContent || ''), null, { timeout: 5000 });
    const registeredLookupText = await page.locator('#tezos-domains-lookup-result').innerText();
    assert(/viral\.tez/.test(registeredLookupText) && /owner/i.test(registeredLookupText) && /View on Tezos Domains/.test(registeredLookupText), `tezos domains chamber: registered lookup missing owner/action ${registeredLookupText}`);

    await page.evaluate(() => {
      if (typeof window.closeTezosDomainsChamber === 'function') {
        window.closeTezosDomainsChamber();
      } else {
        document.querySelector('#tezos-domains-modal.active .chamber-close')?.click();
      }
    });
    await page.waitForFunction(() => !document.querySelector('#tezos-domains-modal')?.classList.contains('active'), null, { timeout: 5000 });

    const routeResponse = await page.goto(`${baseUrl}/domains/`, { waitUntil: 'domcontentloaded' });
    assert(routeResponse?.ok(), `domains route: pretty route failed with HTTP ${routeResponse?.status()}`);
    await page.waitForFunction(() => window.location.pathname === '/domains/' && window.location.hash === '', null, { timeout: 7000 });
    await page.locator('#tezos-domains-modal.active .tezos-domains-content').waitFor({ state: 'visible', timeout: 10000 });

    await context.close();
    assert(issues.length === 0, `tezos domains chamber browser issues:\n${issues.join('\n')}`);
    log('ok - tezos domains chamber smoke');
  }

  return { smokeEcosystemActivity, smokeTezosDomainsChamber };
}
