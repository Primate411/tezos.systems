import { assertUraniumCaptionClear } from '../lib/uranium-caption-smoke.mjs';

// Browser workflows owned by uranium. Shared dependencies remain explicit.
export function createUraniumSmokeSuites({
  DEFAULT_EXPANDED_CHAMBER_CATEGORY,
  EXPECTED_CHAMBER_CATEGORIES,
  EXPECTED_CHAMBER_ORDER,
  assert,
  attachIssueCollectors,
  createHash,
  fulfillJson,
  installFeatureMocks,
  log,
  stableTestHash
}) {
  async function smokeUraniumChamber(browser, baseUrl) {
    const installMockKrakenWebSocket = async (targetContext) => {
      await targetContext.addInitScript(() => {
        const state = {
          created: 0,
          opened: 0,
          closed: 0,
          urls: [],
          outbound: [],
          subscriptions: [],
          inbound: []
        };
        const sockets = [];

        class MockWebSocket extends EventTarget {
          constructor(url) {
            super();
            this.url = String(url);
            this.readyState = 0;
            this.bufferedAmount = 0;
            this.extensions = '';
            this.protocol = '';
            this.binaryType = 'blob';
            this.__uraniumIntentionalClose = false;
            this.__subscriptions = [];
            sockets.push(this);
            state.created += 1;
            state.urls.push(this.url);
            queueMicrotask(() => {
              if (this.readyState !== 0) return;
              this.readyState = 1;
              state.opened += 1;
              this.dispatchEvent(new Event('open'));
            });
          }

          send(payload) {
            if (this.readyState !== 1) throw new DOMException('Mock WebSocket is not open.', 'InvalidStateError');
            const text = String(payload);
            let parsed = text;
            try { parsed = JSON.parse(text); } catch { /* retain raw payload */ }
            state.outbound.push(parsed);
            if (parsed?.method === 'subscribe') {
              state.subscriptions.push(parsed);
              this.__subscriptions.push(parsed.params || {});
            }
          }

          close(code = 1000, reason = '') {
            if (this.readyState === 2 || this.readyState === 3) return;
            this.readyState = 2;
            this.readyState = 3;
            state.closed += 1;
            const event = new Event('close');
            Object.defineProperties(event, {
              code: { value: code },
              reason: { value: reason },
              wasClean: { value: true }
            });
            this.dispatchEvent(event);
          }

          __emit(payload) {
            if (this.readyState !== 1) return false;
            state.inbound.push({
              channel: payload?.channel || '',
              type: payload?.type || '',
              rows: Array.isArray(payload?.data) ? payload.data.length : 0
            });
            this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(payload) }));
            return true;
          }
        }

        Object.assign(MockWebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
        Object.assign(MockWebSocket.prototype, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });

        const activeSocket = (channel, interval = null) => [...sockets].reverse().find((socket) => (
          socket.readyState === MockWebSocket.OPEN
            && socket.__subscriptions.some((subscription) => subscription.channel === channel
              && (interval === null || subscription.interval === interval))
        ));
        const ohlcRows = [
          { symbol: 'XU3O8/USD', interval: 5, interval_begin: '2026-07-31T20:20:00.000Z', open: 5.560, high: 5.575, low: 5.555, close: 5.570, vwap: 5.566, volume: 18.25, trades: 4 },
          { symbol: 'XU3O8/USD', interval: 5, interval_begin: '2026-07-31T20:25:00.000Z', open: 5.570, high: 5.590, low: 5.568, close: 5.584, vwap: 5.579, volume: 23.5, trades: 6 },
          { symbol: 'XU3O8/USD', interval: 5, interval_begin: '2026-07-31T20:30:00.000Z', open: 5.584, high: 5.603, low: 5.580, close: 5.598, vwap: 5.592, volume: 31.75, trades: 8 },
          { symbol: 'XU3O8/USD', interval: 5, interval_begin: '2026-07-31T20:35:00.000Z', open: 5.598, high: 5.615, low: 5.594, close: 5.608, vwap: 5.604, volume: 27.1, trades: 7 }
        ];
        const ohlc15mRows = [
          { symbol: 'XU3O8/USD', interval: 15, interval_begin: '2026-07-31T18:45:00.000Z', open: 5.510, high: 5.535, low: 5.502, close: 5.528, vwap: 5.521, volume: 41.2, trades: 9 },
          { symbol: 'XU3O8/USD', interval: 15, interval_begin: '2026-07-31T19:00:00.000Z', open: 5.528, high: 5.548, low: 5.520, close: 5.540, vwap: 5.536, volume: 38.6, trades: 8 },
          { symbol: 'XU3O8/USD', interval: 15, interval_begin: '2026-07-31T19:15:00.000Z', open: 5.540, high: 5.562, low: 5.534, close: 5.556, vwap: 5.551, volume: 52.8, trades: 11 },
          { symbol: 'XU3O8/USD', interval: 15, interval_begin: '2026-07-31T19:30:00.000Z', open: 5.556, high: 5.574, low: 5.548, close: 5.568, vwap: 5.563, volume: 49.4, trades: 10 },
          { symbol: 'XU3O8/USD', interval: 15, interval_begin: '2026-07-31T19:45:00.000Z', open: 5.568, high: 5.588, low: 5.560, close: 5.580, vwap: 5.575, volume: 57.1, trades: 13 },
          { symbol: 'XU3O8/USD', interval: 15, interval_begin: '2026-07-31T20:00:00.000Z', open: 5.580, high: 5.612, low: 5.574, close: 5.602, vwap: 5.594, volume: 63.9, trades: 15 }
        ];
        window.__uraniumWebSocketState = state;
        window.__emitUraniumKrakenOhlcSnapshot = (includeLatest = false) => activeSocket('ohlc', 5)?.__emit({
          channel: 'ohlc',
          type: 'snapshot',
          data: includeLatest ? [...ohlcRows, { symbol: 'XU3O8/USD', interval: 5, interval_begin: '2026-07-31T20:40:00.000Z', open: 5.608, high: 5.620, low: 5.604, close: 5.612, vwap: 5.613, volume: 35.4, trades: 9 }] : ohlcRows
        }) || false;
        window.__emitUraniumKrakenOhlc15mSnapshot = () => activeSocket('ohlc', 15)?.__emit({
          channel: 'ohlc',
          type: 'snapshot',
          data: ohlc15mRows
        }) || false;
        window.__emitUraniumKrakenFormingCandle = () => activeSocket('ohlc', 5)?.__emit({
          channel: 'ohlc',
          type: 'update',
          data: [{ symbol: 'XU3O8/USD', interval: 5, interval_begin: '2026-07-31T20:40:00.000Z', open: 5.608, high: 5.624, low: 5.604, close: 5.618, vwap: 5.616, volume: 39.8, trades: 11 }]
        }) || false;
        window.__emitUraniumKrakenTickerSnapshot = () => activeSocket('ticker')?.__emit({
          channel: 'ticker',
          type: 'snapshot',
          data: [{
            symbol: 'XU3O8/USD',
            timestamp: '2026-07-31T20:40:02.000Z',
            bid: 5.610,
            bid_qty: 120.5,
            ask: 5.614,
            ask_qty: 98.25,
            last: 5.612,
            volume: 1184.75,
            vwap: 5.581,
            low: 5.458,
            high: 5.620,
            change: 0.152,
            change_pct: 2.7839,
            trades: 88
          }]
        }) || false;
        window.WebSocket = MockWebSocket;
      });
    };

    const issues = [];
    const categoryStorageKey = 'tezos-systems-explore-layout-v1';
    const legacyCategoryStorageKey = 'tezos-systems-chamber-categories-v1';
    const categoryIds = ['network', 'capital', 'ecosystem', 'bakers', 'governance', 'people', 'history'];
    const roomIds = ['pulse', 'health', 'tezosx', 'capital', 'minerals', 'uranium', 'metals', 'whales', 'staking-chamber', 'ecosystem', 'leaderboard', 'tz4', 'chamber', 'l2-governance', 'liquidity-baking', 'ledger-flow', 'domains', 'maxis', 'tezoscrp', 'funding', 'anthology', 'history'];
    const preferenceContext = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(preferenceContext);
    await preferenceContext.addInitScript(() => {
      localStorage.setItem('tezos-systems-theme', 'matrix');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
      if (!sessionStorage.getItem('__explore-layout-smoke-seeded')) {
        localStorage.removeItem('tezos-systems-explore-layout-v1');
        localStorage.removeItem('tezos-systems-chamber-categories-v1');
        sessionStorage.setItem('__explore-layout-smoke-seeded', '1');
      }
    });
    const preferencePage = await preferenceContext.newPage();
    attachIssueCollectors(preferencePage, 'Chamber category preferences', issues);
    let preferenceResponse = await preferencePage.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
    assert(preferenceResponse?.ok(), `Chamber category preferences failed with HTTP ${preferenceResponse?.status()}`);
    await preferencePage.waitForFunction(() => Boolean(window.tezosSystemsChamberCategories), null, { timeout: 15000 });
    await preferencePage.waitForFunction(() => document.querySelectorAll('[data-chamber-room-hide]').length === 22, null, { timeout: 15000 });
    const defaultPreferenceState = await preferencePage.evaluate(() => ({
      categoryRoot: document.documentElement.getAttribute('data-chamber-categories-hidden'),
      roomRoot: document.documentElement.getAttribute('data-chamber-rooms-hidden'),
      stored: localStorage.getItem('tezos-systems-explore-layout-v1'),
      shownCategories: [...document.querySelectorAll('#chambers-grid > .chamber-category')].filter((category) => getComputedStyle(category).display !== 'none').length,
      shownRooms: [...document.querySelectorAll('#chambers-grid [data-chamber-entry-id]')].filter((room) => getComputedStyle(room).display !== 'none').length,
      categoryHideButtons: document.querySelectorAll('[data-chamber-category-hide]').length,
      roomHideButtons: document.querySelectorAll('[data-chamber-room-hide]').length,
      roomSwitches: document.querySelectorAll('[data-chamber-room-toggle]').length,
      expandedCategories: document.querySelectorAll('#chambers-grid > .chamber-category[data-chamber-expanded="true"]').length,
      expandedCategoryKeys: Array.from(
        document.querySelectorAll('#chambers-grid > .chamber-category[data-chamber-expanded="true"]'),
        (category) => category.dataset.chamberCategory || ''
      ),
      independentControls: [...document.querySelectorAll('#chambers-grid > .chamber-category')].every((category) => (
        category.querySelector(':scope > .chamber-category-head > .chamber-category-toggle')?.tagName === 'BUTTON'
        && category.querySelector(':scope > .chamber-category-head > .chamber-category-hide')?.tagName === 'BUTTON'
      ))
    }));
    assert(defaultPreferenceState.categoryRoot === ''
      && defaultPreferenceState.roomRoot === ''
      && defaultPreferenceState.stored === null
      && defaultPreferenceState.shownCategories === 7
      && defaultPreferenceState.shownRooms === 22
      && defaultPreferenceState.categoryHideButtons === 7
      && defaultPreferenceState.roomHideButtons === 22
      && defaultPreferenceState.roomSwitches === 22
      && defaultPreferenceState.expandedCategories === 1
      && defaultPreferenceState.expandedCategoryKeys.join(',') === DEFAULT_EXPANDED_CHAMBER_CATEGORY
      && defaultPreferenceState.independentControls,
    `Chamber category default/recovery controls failed ${JSON.stringify(defaultPreferenceState)}`);

    for (const toggle of await preferencePage.locator('#chambers-grid > .chamber-category .chamber-category-toggle').all()) {
      if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
    }

    const mineralsHide = preferencePage.locator('[data-chamber-room-hide="minerals"]');
    await mineralsHide.scrollIntoViewIfNeeded();
    await mineralsHide.click();
    await preferencePage.waitForFunction(() => getComputedStyle(document.querySelector('[data-chamber-entry-id="minerals"]')).display === 'none');
    let categoryToast = preferencePage.locator('.home-layout-toast.is-visible');
    await categoryToast.waitFor({ state: 'visible', timeout: 9000 });
    assert(!(await categoryToast.locator('button').evaluate((button) => document.activeElement === button)), 'Chamber pointer Hide stole focus into Undo');
    assert((await categoryToast.textContent())?.includes('Critical Minerals hidden'), 'Chamber Undo toast did not name the hidden room');
    await categoryToast.locator('button').click();
    await categoryToast.waitFor({ state: 'detached', timeout: 3000 });

    const domainsHide = preferencePage.locator('[data-chamber-room-hide="domains"]');
    await domainsHide.focus();
    await preferencePage.keyboard.press('Enter');
    categoryToast = preferencePage.locator('.home-layout-toast.is-visible');
    await categoryToast.waitFor({ state: 'visible', timeout: 9000 });
    await preferencePage.waitForFunction(() => document.activeElement?.textContent?.trim() === 'Undo');
    await categoryToast.locator('button').click();
    await categoryToast.waitFor({ state: 'detached', timeout: 3000 });

    const capitalHide = preferencePage.locator('[data-chamber-category-hide="capital"]');
    await capitalHide.scrollIntoViewIfNeeded();
    await capitalHide.click();
    await preferencePage.waitForFunction(() => getComputedStyle(document.querySelector('[data-chamber-category="capital"]')).display === 'none');
    categoryToast = preferencePage.locator('.home-layout-toast.is-visible');
    await categoryToast.waitFor({ state: 'visible', timeout: 9000 });
    assert(!(await categoryToast.locator('button').evaluate((button) => document.activeElement === button)), 'Chamber category pointer Hide stole focus into Undo');
    await categoryToast.locator('button').click();
    await categoryToast.waitFor({ state: 'detached', timeout: 3000 });

    const governanceHide = preferencePage.locator('[data-chamber-category-hide="governance"]');
    await governanceHide.focus();
    await preferencePage.keyboard.press('Enter');
    categoryToast = preferencePage.locator('.home-layout-toast.is-visible');
    await categoryToast.waitFor({ state: 'visible', timeout: 9000 });
    await preferencePage.waitForFunction(() => document.activeElement?.textContent?.trim() === 'Undo');
    await categoryToast.locator('button').click();
    await categoryToast.waitFor({ state: 'detached', timeout: 3000 });

    await preferencePage.evaluate(() => window.tezosSystemsHomeLayout.open());
    await preferencePage.locator('#home-layout-modal.active').waitFor({ state: 'visible', timeout: 5000 });
    await preferencePage.locator('#home-layout-topics > summary').click();
    await preferencePage.locator('[data-chamber-topic-group="network"] > summary').click();
    const topicPanelState = await preferencePage.evaluate(() => ({
      homeRows: document.querySelectorAll('.home-layout-options > .home-layout-option').length,
      topicGroups: document.querySelectorAll('.home-layout-topic-group').length,
      categoryRows: document.querySelectorAll('[data-chamber-category-toggle]').length,
      roomRows: document.querySelectorAll('[data-chamber-room-toggle]').length,
      roomCount: document.querySelector('[data-chamber-room-count]')?.textContent?.trim(),
      categoryCount: document.querySelector('[data-chamber-category-count]')?.textContent?.trim(),
      controls: [...document.querySelectorAll('[data-chamber-topic-group="network"] .home-layout-topic-option')].map((row) => row.getBoundingClientRect().height),
      showAllText: document.getElementById('chamber-category-show-all')?.textContent?.trim()
    }));
    assert(topicPanelState.homeRows === 6
      && topicPanelState.topicGroups === EXPECTED_CHAMBER_CATEGORIES.length
      && topicPanelState.categoryRows === EXPECTED_CHAMBER_CATEGORIES.length
      && topicPanelState.roomRows === EXPECTED_CHAMBER_ORDER.length
      && topicPanelState.roomCount === `${EXPECTED_CHAMBER_ORDER.length} shown`
      && topicPanelState.categoryCount === `${EXPECTED_CHAMBER_CATEGORIES.length} topics`
      && topicPanelState.controls.every((height) => height >= 44)
      && topicPanelState.showAllText === 'Show all Chambers',
    `Customize home topic disclosure failed ${JSON.stringify(topicPanelState)}`);
    await preferencePage.locator('[data-chamber-topic-group="ecosystem"] > summary').click();
    await preferencePage.locator('[data-chamber-room-toggle="ecosystem"]').click();
    await preferencePage.keyboard.press('Escape');
    await preferencePage.reload({ waitUntil: 'domcontentloaded' });
    await preferencePage.waitForFunction(() => Boolean(window.tezosSystemsChamberCategories));
    const persistedCategory = await preferencePage.evaluate(() => ({
      categoryRoot: document.documentElement.getAttribute('data-chamber-categories-hidden'),
      roomRoot: document.documentElement.getAttribute('data-chamber-rooms-hidden'),
      display: getComputedStyle(document.querySelector('[data-chamber-category="ecosystem"]')).display,
      preference: JSON.parse(localStorage.getItem('tezos-systems-explore-layout-v1'))
    }));
    assert(persistedCategory.categoryRoot === 'ecosystem'
      && persistedCategory.roomRoot === 'ecosystem'
      && persistedCategory.display === 'none'
      && persistedCategory.preference.version === 1
      && persistedCategory.preference.hiddenCategories.join(',') === 'ecosystem'
      && persistedCategory.preference.hiddenRooms.join(',') === 'ecosystem',
    `Chamber room reload persistence failed ${JSON.stringify(persistedCategory)}`);

    const corruptCategoryValue = '{"version":1,"hiddenCategories":[],"hiddenRooms":["unknown-room"]}';
    await preferencePage.evaluate(({ key, raw }) => {
      localStorage.setItem(key, raw);
      localStorage.setItem('chamber-category-unrelated-smoke', 'keep-me');
    }, { key: categoryStorageKey, raw: corruptCategoryValue });
    await preferencePage.reload({ waitUntil: 'domcontentloaded' });
    await preferencePage.waitForFunction(() => Boolean(window.tezosSystemsChamberCategories));
    const corruptCategoryState = await preferencePage.evaluate((key) => ({
      categoryRoot: document.documentElement.getAttribute('data-chamber-categories-hidden'),
      roomRoot: document.documentElement.getAttribute('data-chamber-rooms-hidden'),
      raw: localStorage.getItem(key),
      unrelated: localStorage.getItem('chamber-category-unrelated-smoke')
    }), categoryStorageKey);
    assert(corruptCategoryState.categoryRoot === ''
      && corruptCategoryState.roomRoot === ''
      && corruptCategoryState.raw === corruptCategoryValue
      && corruptCategoryState.unrelated === 'keep-me',
    `Chamber category corrupt fallback failed ${JSON.stringify(corruptCategoryState)}`);

    await preferencePage.evaluate(() => window.tezosSystemsChamberCategories.showAllChamberCategories('cross-tab-reset'));
    const categorySecondPage = await preferenceContext.newPage();
    attachIssueCollectors(categorySecondPage, 'Chamber category second tab', issues);
    preferenceResponse = await categorySecondPage.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    assert(preferenceResponse?.ok(), `Chamber category second tab failed with HTTP ${preferenceResponse?.status()}`);
    await categorySecondPage.waitForFunction(() => Boolean(window.tezosSystemsChamberCategories));
    await preferencePage.evaluate(() => window.tezosSystemsChamberCategories.setChamberRoomVisible('minerals', false, 'cross-tab-smoke'));
    await categorySecondPage.waitForFunction(() => document.documentElement.getAttribute('data-chamber-rooms-hidden') === 'minerals');
    await categorySecondPage.evaluate(() => window.tezosSystemsChamberCategories.setChamberRoomVisible('minerals', true, 'cross-tab-smoke'));
    await preferencePage.waitForFunction(() => document.documentElement.getAttribute('data-chamber-rooms-hidden') === '');
    await categorySecondPage.close();

    await preferencePage.evaluate((ids) => ids.forEach((id) => window.tezosSystemsChamberCategories.setChamberRoomVisible(id, false, 'hide-all-smoke')), roomIds);
    const allTopicsHidden = await preferencePage.evaluate(() => ({
      explore: window.tezosSystemsHomeLayout.isHomeBlockVisible('explore'),
      categoryRoot: document.documentElement.getAttribute('data-chamber-categories-hidden')?.split(/\s+/).filter(Boolean).length,
      roomRoot: document.documentElement.getAttribute('data-chamber-rooms-hidden')?.split(/\s+/).filter(Boolean).length,
      setup: getComputedStyle(document.getElementById('settings-gear')).display,
      footer: getComputedStyle(document.getElementById('site-footer')).display
    }));
    assert(!allTopicsHidden.explore && allTopicsHidden.categoryRoot === 7 && allTopicsHidden.roomRoot === 22 && allTopicsHidden.setup !== 'none' && allTopicsHidden.footer !== 'none',
      `Hiding every Chamber left an empty Explore block or lost recovery ${JSON.stringify(allTopicsHidden)}`);
    await preferencePage.evaluate(() => window.tezosSystemsChamberCategories.setChamberRoomVisible('pulse', true, 'single-room-recovery'));
    await preferencePage.waitForFunction(() => window.tezosSystemsHomeLayout.isHomeBlockVisible('explore'));
    await preferencePage.evaluate(() => window.tezosSystemsHomeLayout.open());
    await preferencePage.locator('#home-layout-topics > summary').click();
    await preferencePage.locator('#chamber-category-show-all').click();
    await preferencePage.waitForFunction(() => document.documentElement.getAttribute('data-chamber-categories-hidden') === ''
      && document.documentElement.getAttribute('data-chamber-rooms-hidden') === '');
    await preferencePage.keyboard.press('Escape');

    await preferencePage.evaluate(() => {
      window.tezosSystemsChamberCategories.setChamberCategoryVisible('people', false, 'deep-link-setup');
      window.tezosSystemsChamberCategories.setChamberRoomVisible('domains', false, 'deep-link-setup');
    });
    await preferencePage.evaluate(() => { location.hash = '#domains'; });
    await preferencePage.waitForFunction(() => window.tezosSystemsChamberCategories.isChamberCategoryVisible('people')
      && window.tezosSystemsChamberCategories.isChamberRoomVisible('domains'));
    await preferencePage.locator('#tezos-domains-modal.active').waitFor({ state: 'visible', timeout: 15000 });
    await preferencePage.locator('#tezos-domains-modal.active .chamber-close').click();

    await preferencePage.evaluate(() => {
      history.replaceState(null, '', '/');
      window.tezosSystemsChamberCategories.setChamberRoomVisible('capital', false, 'tour-setup');
    });
    const tourCategoryPreference = await preferencePage.evaluate((key) => localStorage.getItem(key), categoryStorageKey);
    await preferencePage.evaluate(() => window.TezosSystemsTour.replay());
    await preferencePage.locator('#tour-overlay').waitFor({ state: 'visible', timeout: 6000 });
    const tourCategoryState = await preferencePage.evaluate((key) => ({
      preview: document.documentElement.getAttribute('data-chamber-categories-preview'),
      display: getComputedStyle(document.querySelector('[data-chamber-entry-id="capital"]')).display,
      stored: localStorage.getItem(key)
    }), categoryStorageKey);
    assert(tourCategoryState.preview === 'all' && tourCategoryState.display !== 'none' && tourCategoryState.stored === tourCategoryPreference,
      `Guided tour changed or failed to reveal Chamber rooms ${JSON.stringify(tourCategoryState)}`);
    await preferencePage.keyboard.press('Escape');
    await preferencePage.locator('#tour-overlay').waitFor({ state: 'detached', timeout: 5000 });
    await preferencePage.waitForFunction(() => getComputedStyle(document.querySelector('[data-chamber-entry-id="capital"]')).display === 'none');

    await preferencePage.evaluate(() => window.tezosSystemsChamberCategories.setChamberRoomVisible('history', false, 'pretty-route-setup'));
    await preferencePage.goto(`${baseUrl}/history/`, { waitUntil: 'domcontentloaded' });
    await preferencePage.locator('#history-modal.active').waitFor({ state: 'visible', timeout: 15000 });
    assert(await preferencePage.locator('#chambers-grid').count() === 0, 'Direct History owns no hidden Home preferences UI');
    await preferencePage.locator('#history-modal-close').click();
    await preferencePage.waitForFunction(() => document.documentElement.dataset.dashboardReady === 'true' && location.pathname === '/', null, { timeout: 30000 });
    const prettyHiddenPreference = await preferencePage.evaluate((key) => ({
      hiddenRooms: JSON.parse(localStorage.getItem(key)).hiddenRooms,
      display: getComputedStyle(document.querySelector('[data-chamber-entry-id="history"]')).display
    }), categoryStorageKey);
    assert(prettyHiddenPreference.hiddenRooms.includes('history') && prettyHiddenPreference.display === 'none',
      `Full Chamber route changed its hidden Home room preference ${JSON.stringify(prettyHiddenPreference)}`);
    await preferenceContext.close();

    const migrationContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
    await installFeatureMocks(migrationContext);
    await migrationContext.addInitScript(() => {
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
      localStorage.removeItem('tezos-systems-explore-layout-v1');
      localStorage.setItem('tezos-systems-chamber-categories-v1', JSON.stringify({ version: 1, hidden: ['bakers'] }));
    });
    const migrationPage = await migrationContext.newPage();
    preferenceResponse = await migrationPage.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    assert(preferenceResponse?.ok(), `Explore layout migration failed with HTTP ${preferenceResponse?.status()}`);
    await migrationPage.waitForFunction(() => Boolean(window.tezosSystemsChamberCategories));
    const migratedPreference = await migrationPage.evaluate(({ currentKey, legacyKey }) => ({
      root: document.documentElement.getAttribute('data-chamber-categories-hidden'),
      current: JSON.parse(localStorage.getItem(currentKey)),
      legacy: localStorage.getItem(legacyKey)
    }), { currentKey: categoryStorageKey, legacyKey: legacyCategoryStorageKey });
    assert(migratedPreference.root === 'bakers'
      && migratedPreference.current.version === 1
      && migratedPreference.current.hiddenCategories.join(',') === 'bakers'
      && migratedPreference.current.hiddenRooms.length === 0
      && migratedPreference.legacy === null,
    `Explore layout legacy migration failed ${JSON.stringify(migratedPreference)}`);
    await migrationContext.close();

    const categoryFirstPaintContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
    await installFeatureMocks(categoryFirstPaintContext);
    await categoryFirstPaintContext.addInitScript(() => {
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
      localStorage.setItem('tezos-systems-explore-layout-v1', JSON.stringify({ version: 1, hiddenCategories: [], hiddenRooms: ['minerals'] }));
    });
    let releaseCategoryApp;
    const categoryAppGate = new Promise((resolve) => { releaseCategoryApp = resolve; });
    await categoryFirstPaintContext.route('**/js/core/app.js*', async (route) => {
      await categoryAppGate;
      await route.fallback();
    });
    const categoryFirstPaintPage = await categoryFirstPaintContext.newPage();
    attachIssueCollectors(categoryFirstPaintPage, 'Chamber category first paint', issues);
    const categoryNavigation = categoryFirstPaintPage.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    await categoryFirstPaintPage.locator('[data-chamber-entry-id="minerals"]').waitFor({ state: 'attached', timeout: 10000 });
    const categoryBeforeApp = await categoryFirstPaintPage.evaluate(() => ({
      appReady: Boolean(window.tezosSystemsChamberCategories),
      display: getComputedStyle(document.querySelector('[data-chamber-entry-id="minerals"]')).display,
      categoryRoot: document.documentElement.getAttribute('data-chamber-categories-hidden'),
      roomRoot: document.documentElement.getAttribute('data-chamber-rooms-hidden')
    }));
    assert(!categoryBeforeApp.appReady && categoryBeforeApp.display === 'none' && categoryBeforeApp.categoryRoot === '' && categoryBeforeApp.roomRoot === 'minerals',
      `Chamber room first-paint preload failed ${JSON.stringify(categoryBeforeApp)}`);
    releaseCategoryApp();
    preferenceResponse = await categoryNavigation;
    assert(preferenceResponse?.ok(), `Chamber category first-paint navigation failed with HTTP ${preferenceResponse?.status()}`);
    await categoryFirstPaintContext.close();

    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      serviceWorkers: 'block'
    });
    await installMockKrakenWebSocket(context);
    await installFeatureMocks(context);

    let entryRequests = 0;
    let snapshotRequests = 0;
    let entryFixture = null;
    let snapshotFixture = null;
    let uraniumRevision = 0;
    const cloneUranium = (value) => JSON.parse(JSON.stringify(value));
    const makeUraniumSnapshot = (revision) => {
      const snapshot = cloneUranium(snapshotFixture);
      if (revision > 0) {
        const observedAt = new Date(Date.parse(snapshotFixture.generatedAt) + (revision * 60_000)).toISOString();
        const nextPrice = Number(snapshotFixture.market.kraken.ticker.lastPriceUsd) + (revision * 0.01);
        snapshot.generatedAt = observedAt;
        snapshot.market.coin.currentPriceUsd = nextPrice;
        snapshot.market.coin.lastUpdated = observedAt;
        snapshot.market.kraken.ticker.lastUsd = nextPrice;
        snapshot.market.kraken.ticker.lastPriceUsd = nextPrice;
        snapshot.market.kraken.ticker.observedAt = observedAt;
        snapshot.market.kraken.orderBook.observedAt = observedAt;
        snapshot.sources.krakenMarket.status = 'stale';
        snapshot.sources.krakenMarket.checkedAt = observedAt;
        snapshot.sources.krakenMarket.error = 'Mocked upstream failure after a retained last-good receipt.';
        const { contentHash: ignoredContentHash, ...unsigned } = snapshot;
        snapshot.contentHash = stableTestHash(unsigned);
      }
      return snapshot;
    };
    const makeUraniumEntry = (snapshot, sourceText) => {
      const entry = cloneUranium(entryFixture);
      entry.generatedAt = snapshot.generatedAt;
      entry.source.generatedAt = snapshot.generatedAt;
      entry.source.contentHash = snapshot.contentHash;
      entry.source.fileSha256 = createHash('sha256').update(sourceText).digest('hex');
      if (entry.market?.coin && snapshot.market?.coin) entry.market.coin = cloneUranium(snapshot.market.coin);
      if (entry.market?.kraken && snapshot.market?.kraken) entry.market.kraken = cloneUranium(snapshot.market.kraken);
      const { contentHash: ignoredContentHash, ...unsigned } = entry;
      entry.contentHash = stableTestHash(unsigned);
      return entry;
    };

    await context.route('**/data/uranium-entry-summary.json*', async (route) => {
      entryRequests += 1;
      if (!entryFixture) {
        const response = await route.fetch();
        entryFixture = await response.json();
        return fulfillJson(route, cloneUranium(entryFixture));
      }
      if (!snapshotFixture || uraniumRevision === 0) return fulfillJson(route, cloneUranium(entryFixture));
      const snapshot = makeUraniumSnapshot(uraniumRevision);
      const sourceText = JSON.stringify(snapshot);
      return fulfillJson(route, makeUraniumEntry(snapshot, sourceText));
    });

    await context.route('**/data/uranium-snapshot.json*', async (route) => {
      snapshotRequests += 1;
      if (!snapshotFixture) {
        const response = await route.fetch();
        const sourceText = await response.text();
        snapshotFixture = JSON.parse(sourceText);
        return route.fulfill({ status: response.status(), contentType: 'application/json', body: sourceText });
      }
      const snapshot = makeUraniumSnapshot(uraniumRevision);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(snapshot) });
    });

    await context.addInitScript(() => {
      localStorage.setItem('tezos-systems-theme', 'matrix');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
      window.__URANIUM_CHAMBER_REFRESH_MS__ = 123457;
      window.__uraniumSmokeVisibility = 'visible';
      const nativeSetInterval = window.setInterval.bind(window);
      window.setInterval = (callback, delay, ...args) => {
        const timer = nativeSetInterval(callback, delay, ...args);
        if (Number(delay) === window.__URANIUM_CHAMBER_REFRESH_MS__) {
          window.__uraniumSmokeTimerTick = () => callback(...args);
        }
        return timer;
      };
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => window.__uraniumSmokeVisibility
      });
    });

    const page = await context.newPage();
    attachIssueCollectors(page, 'uranium chamber', issues);
    const launcherResponse = await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    assert(launcherResponse?.ok(), `uranium chamber: dashboard launcher failed with HTTP ${launcherResponse?.status()}`);
    await page.locator('#chambers-grid > .chamber-category[data-chamber-category="capital"] .chamber-category-toggle').click();
    await page.locator('#uranium-entry-card').dispatchEvent('pointerenter');
    await page.waitForFunction(() => document.querySelector('#uranium-entry-front')?.dataset.uraniumRendered === '1', null, { timeout: 10000 });
    await page.locator('#uranium-entry-front .uranium-entry-art img').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
      const image = document.querySelector('#uranium-entry-front .uranium-entry-art img');
      return Boolean(image?.complete && image.naturalWidth > 0 && image.currentSrc);
    }, null, { timeout: 10000 });
    const launcherSocketState = await page.evaluate(() => ({
      modalOpen: document.querySelector('#uranium-modal')?.classList.contains('active') || false,
      created: window.__uraniumWebSocketState?.created || 0,
      opened: window.__uraniumWebSocketState?.opened || 0
    }));
    assert(!launcherSocketState.modalOpen && launcherSocketState.created === 0 && launcherSocketState.opened === 0,
      `uranium chamber: collapsed launcher opened a Kraken socket ${JSON.stringify(launcherSocketState)}`);
    const launcherVisualState = await page.evaluate(() => {
      const card = document.querySelector('#uranium-entry-card');
      const front = document.querySelector('#uranium-entry-front');
      const art = front?.querySelector('.uranium-entry-art');
      const image = art?.querySelector('img');
      const chart = front?.querySelector('.uranium-entry-chart');
      const rect = (element) => {
        const bounds = element?.getBoundingClientRect();
        return bounds ? { width: bounds.width, height: bounds.height } : null;
      };
      return {
        card: rect(card),
        front: rect(front),
        art: rect(art),
        chart: rect(chart),
        image: rect(image),
        imageLoaded: Boolean(image?.complete && image.naturalWidth > 0),
        currentSrc: image?.currentSrc || '',
        alt: image?.alt || '',
        objectFit: image ? getComputedStyle(image).objectFit : '',
        chartText: chart?.textContent?.replace(/\s+/g, ' ').trim() || ''
      };
    });
    assert(launcherVisualState.imageLoaded
      && /\/assets\/uranium\/uranium-launcher(?:-480)?\.webp(?:$|\?)/.test(launcherVisualState.currentSrc)
      && launcherVisualState.alt === 'Polished translucent light-green mineral specimen with a bright emerald inner glow.'
      && launcherVisualState.objectFit === 'cover',
    `uranium chamber: compact launcher did not use the dedicated inanimate specimen ${JSON.stringify(launcherVisualState)}`);
    assert(launcherVisualState.card?.height <= 360 && launcherVisualState.front?.height <= 320
      && launcherVisualState.art?.height <= 180
      && Math.abs((launcherVisualState.image?.height || 0) - launcherVisualState.art.height) <= 2
      && launcherVisualState.chart?.height <= 64 && /30D/i.test(launcherVisualState.chartText),
    `uranium chamber: compact launcher regained oversized art or whitespace ${JSON.stringify(launcherVisualState)}`);

    const mobileLauncherCases = [
      { width: 320, theme: 'clean' },
      { width: 375, theme: 'valley' },
      { width: 390, theme: 'matrix' },
      { width: 375, theme: 'hen' },
      { width: 390, theme: 'clean' }
    ];
    const mobileLauncherStates = [];
    for (const { width, theme } of mobileLauncherCases) {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate(async (activeTheme) => {
        document.body.dataset.theme = activeTheme;
        const capital = document.querySelector('.chamber-category[data-chamber-category="capital"]');
        if (capital) {
          capital.dataset.chamberExpanded = 'true';
          const cards = capital.querySelector(':scope > .chamber-category-cards');
          if (cards) cards.hidden = false;
        }
        await document.fonts?.ready;
      }, theme);
      // Theme changes interpolate card borders in OKLab for 300ms. Sample the
      // settled launcher, not a transient color-space value between themes.
      await page.waitForTimeout(350);
      mobileLauncherStates.push(await page.evaluate(() => {
        const selectors = {
          title: '.uranium-entry-title-line',
          value: '.uranium-entry-value',
          delta: '.uranium-entry-delta',
          description: '.uranium-entry-copy .stat-description',
          freshness: '.uranium-entry-freshness',
          art: '.uranium-entry-art',
          kpis: '.uranium-entry-kpis',
          chart: '.uranium-entry-chart',
          footer: '#uranium-entry-front > .chamber-entry-footer',
          footerFreshness: '#uranium-entry-front > .chamber-entry-footer .chamber-entry-freshness',
          footerCue: '#uranium-entry-front > .chamber-entry-footer .chamber-expand-cue'
        };
        const nodes = Object.fromEntries(Object.entries(selectors).map(([key, selector]) => [key, document.querySelector(selector)]));
        const bounds = (element) => {
          const rect = element?.getBoundingClientRect();
          return rect ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height } : null;
        };
        const rects = Object.fromEntries(Object.entries(nodes).map(([key, node]) => [key, bounds(node)]));
        const overlapArea = (a, b) => {
          if (!a || !b || a.width <= 0 || a.height <= 0 || b.width <= 0 || b.height <= 0) return 0;
          return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
            * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        };
        const visibleCopyKeys = ['title', 'value', 'delta', 'description', 'freshness']
          .filter((key) => rects[key]?.width > 0 && rects[key]?.height > 0);
        const firstRowBottom = Math.max(rects.art?.bottom || 0, ...visibleCopyKeys.map((key) => rects[key].bottom));
        const front = document.querySelector('#uranium-entry-front');
        const card = document.querySelector('#uranium-entry-card');
        const cardStyle = card ? getComputedStyle(card) : null;
        const valueStyle = nodes.value ? getComputedStyle(nodes.value) : null;
        const titleStyle = nodes.title ? getComputedStyle(nodes.title.querySelector('.stat-label')) : null;
        const kpiValueStyle = nodes.kpis ? getComputedStyle(nodes.kpis.querySelector('strong')) : null;
        const footerFreshnessStyle = nodes.footerFreshness ? getComputedStyle(nodes.footerFreshness) : null;
        const borderChannels = cardStyle?.borderTopColor?.match(/[\d.]+/g)?.slice(0, 3).map(Number) || [];
        const valueChannels = valueStyle?.color?.match(/[\d.]+/g)?.slice(0, 3).map(Number) || [];
        const titleChannels = titleStyle?.color?.match(/[\d.]+/g)?.slice(0, 3).map(Number) || [];
        const kpiValueChannels = kpiValueStyle?.color?.match(/[\d.]+/g)?.slice(0, 3).map(Number) || [];
        const cardBounds = bounds(card);
        return {
          width: innerWidth,
          theme: document.body.dataset.theme,
          cardHeight: cardBounds?.height || 0,
          cardFitsViewport: Boolean(cardBounds && cardBounds.left >= -1 && cardBounds.right <= innerWidth + 1),
          pageOverflowX: document.documentElement.scrollWidth - innerWidth,
          frontOverflowY: front ? front.scrollHeight - front.clientHeight : Infinity,
          firstToKpis: rects.kpis ? rects.kpis.top - firstRowBottom : -Infinity,
          kpisToChart: rects.kpis && rects.chart ? rects.chart.top - rects.kpis.bottom : -Infinity,
          chartToFooter: rects.chart && rects.footer ? rects.footer.top - rects.chart.bottom : -Infinity,
          overlaps: visibleCopyKeys.flatMap((key) => ['kpis', 'chart', 'footer'].map((target) => ({
            pair: `${key}/${target}`,
            area: overlapArea(rects[key], rects[target])
          }))),
          horizontalOverflow: ['title', 'value', 'delta'].map((key) => ({
            key,
            overflow: (nodes[key]?.scrollWidth || 0) - (nodes[key]?.clientWidth || 0)
          })),
          contained: [...visibleCopyKeys, 'art', 'kpis', 'chart', 'footer', 'footerFreshness', 'footerCue'].every((key) => (
            !rects[key] || !bounds(front)
              || (rects[key].left >= bounds(front).left - 1 && rects[key].right <= bounds(front).right + 1
                && rects[key].top >= bounds(front).top - 1 && rects[key].bottom <= bounds(front).bottom + 1)
          )),
          descriptionVisible: rects.description?.width > 0 && rects.description?.height > 0,
          footerFreshnessText: nodes.footerFreshness?.textContent?.replace(/\s+/g, ' ').trim() || '',
          footerFreshnessOverflow: (nodes.footerFreshness?.scrollWidth || 0) - (nodes.footerFreshness?.clientWidth || 0),
          footerFreshnessTextOverflow: footerFreshnessStyle?.textOverflow || '',
          footerFreshnessOverflowX: footerFreshnessStyle?.overflowX || '',
          footerFreshnessCueOverlap: overlapArea(rects.footerFreshness, rects.footerCue),
          metricText: nodes.kpis?.textContent?.replace(/\s+/g, ' ').trim() || '',
          cardBackgroundImage: cardStyle?.backgroundImage || '',
          cardBoxShadow: cardStyle?.boxShadow || '',
          cardBorderColor: cardStyle?.borderTopColor || '',
          highContrastMint: valueChannels.length === 3
            && titleChannels.length === 3
            && kpiValueChannels.length === 3
            && valueChannels.every((channel) => channel >= 230)
            && titleChannels.every((channel) => channel >= 210)
            && kpiValueChannels.every((channel) => channel >= 225),
          emeraldGlow: Boolean(cardStyle
            && /radial-gradient/i.test(cardStyle.backgroundImage)
            && cardStyle.boxShadow !== 'none'
            && borderChannels.length === 3
            && borderChannels[1] > borderChannels[0]
            && borderChannels[1] > borderChannels[2])
        };
      }));
    }
    mobileLauncherStates.forEach((state, index) => {
      const expected = mobileLauncherCases[index];
      assert(state.width === expected.width && state.theme === expected.theme
        && state.cardHeight > 0 && state.cardHeight <= 340
        && state.cardFitsViewport
        && state.pageOverflowX <= 1
        && state.frontOverflowY <= 1
        && state.firstToKpis >= 4
        && state.kpisToChart >= 4
        && state.chartToFooter >= 4
        && state.overlaps.every(({ area }) => area <= 1)
        && state.horizontalOverflow.every(({ overflow }) => overflow <= 1)
        && state.contained
        && !state.descriptionVisible
        && (state.footerFreshnessOverflow <= 1
          || (state.footerFreshnessTextOverflow === 'ellipsis' && state.footerFreshnessOverflowX === 'hidden'))
        && state.footerFreshnessCueOverlap <= 1
        && /Kraken online|Kraken WebSocket|token market/i.test(state.footerFreshnessText)
        && /U₃O₈ oracle/i.test(state.metricText)
        && /Dated ratio/i.test(state.metricText)
        && /Holders/i.test(state.metricText)
        && state.highContrastMint
        && state.emeraldGlow,
      `uranium chamber: mobile glowing launcher geometry regressed ${JSON.stringify(state)}`);
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    const cleanDesktopLauncher = await page.evaluate(() => {
      document.body.dataset.theme = 'clean';
      const card = document.querySelector('#uranium-entry-card');
      const description = card?.querySelector('.stat-description');
      const channels = description ? getComputedStyle(description).color.match(/[\d.]+/g)?.slice(0, 3).map(Number) || [] : [];
      return {
        padding: card ? getComputedStyle(card).padding : '',
        readableDescription: channels.length === 3 && channels.every((channel) => channel >= 175)
      };
    });
    assert(cleanDesktopLauncher.padding === '0px' && cleanDesktopLauncher.readableDescription,
      `uranium chamber: clean-theme desktop shell or description contrast regressed ${JSON.stringify(cleanDesktopLauncher)}`);

    const response = await page.goto(`${baseUrl}/?uranium-smoke=expanded#xu3o8`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `uranium chamber: hash route failed with HTTP ${response?.status()}`);
    await page.locator('#uranium-modal.active .uranium-content').waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForFunction(() => (
      document.querySelector('#uranium-chamber-body')?.dataset.uraniumRendered === '1'
        && document.querySelectorAll('#uranium-modal .uranium-tab').length === 4
    ), null, { timeout: 10000 });

    const shellState = await page.evaluate(() => {
      const modal = document.querySelector('#uranium-modal');
      const content = modal?.querySelector('.uranium-content');
      const tabs = Array.from(modal?.querySelectorAll('.uranium-tab') || []);
      const panel = modal?.querySelector('#uranium-view-panel');
      return {
        hash: location.hash,
        role: content?.getAttribute('role') || '',
        modal: content?.getAttribute('aria-modal') || '',
        labelledBy: content?.getAttribute('aria-labelledby') || '',
        focusInside: Boolean(content?.contains(document.activeElement)),
        tabListRole: modal?.querySelector('.uranium-tabs')?.getAttribute('role') || '',
        tabRoles: tabs.map((tab) => tab.getAttribute('role') || ''),
        tabIds: tabs.map((tab) => tab.dataset.uraniumView || ''),
        selected: tabs.filter((tab) => tab.getAttribute('aria-selected') === 'true').map((tab) => tab.dataset.uraniumView),
        panelRole: panel?.getAttribute('role') || '',
        panelLabelledBy: panel?.getAttribute('aria-labelledby') || '',
        text: panel?.textContent?.replace(/\s+/g, ' ').trim() || '',
        roomArt: panel?.querySelector('.uranium-core-stage.is-room img')?.getAttribute('src') || '',
        roomArtAlt: panel?.querySelector('.uranium-core-stage.is-room img')?.alt || ''
      };
    });
    assert(shellState.hash === '#xu3o8', `uranium chamber: alias hash was not retained ${JSON.stringify(shellState)}`);
    assert(shellState.role === 'dialog' && shellState.modal === 'true' && shellState.labelledBy === 'uranium-title' && shellState.focusInside,
      `uranium chamber: dialog semantics or initial focus missing ${JSON.stringify(shellState)}`);
    assert(shellState.tabListRole === 'tablist' && shellState.tabRoles.every((role) => role === 'tab')
      && JSON.stringify(shellState.tabIds) === JSON.stringify(['overview', 'markets', 'onchain', 'proofbook'])
      && JSON.stringify(shellState.selected) === JSON.stringify(['overview'])
      && shellState.panelRole === 'tabpanel' && shellState.panelLabelledBy === 'uranium-tab-overview',
    `uranium chamber: view semantics missing ${JSON.stringify(shellState)}`);
    assert(/xU3O8/i.test(shellState.text) && /token market/i.test(shellState.text)
      && /physical/i.test(shellState.text) && /Etherlink/i.test(shellState.text)
      && /Uranium\.io describes/i.test(shellState.text) && /Dated statement/i.test(shellState.text),
      `uranium chamber: overview boundaries missing ${shellState.text}`);
    assert(shellState.roomArt === '/assets/uranium/uranium-core.webp' && /mascot/i.test(shellState.roomArtAlt),
      `uranium chamber: expanded-room fun artwork was replaced with the compact specimen ${JSON.stringify(shellState)}`);

    await assertUraniumCaptionClear(page);

    await page.waitForFunction(() => (
      window.__uraniumWebSocketState?.opened === 2
        && window.__uraniumWebSocketState?.subscriptions?.length === 3
    ), null, { timeout: 3000 });
    const initialSocketState = await page.evaluate(() => ({
      ...window.__uraniumWebSocketState,
      active: document.querySelector('#uranium-modal')?.classList.contains('active') || false,
      visibility: document.visibilityState
    }));
    const tickerSubscription = initialSocketState.subscriptions.find(({ params }) => params?.channel === 'ticker');
    const ohlcSubscriptions = initialSocketState.subscriptions.filter(({ params }) => params?.channel === 'ohlc');
    assert(initialSocketState.created === 2 && initialSocketState.opened === 2 && initialSocketState.closed === 0
      && initialSocketState.urls.every((url) => url === 'wss://ws.kraken.com/v2')
      && initialSocketState.active && initialSocketState.visibility === 'visible',
    `uranium chamber: expanded visible room did not own the two source-specific Kraken sockets ${JSON.stringify(initialSocketState)}`);
    assert(tickerSubscription?.params?.snapshot === true && tickerSubscription?.params?.event_trigger === 'bbo'
      && JSON.stringify(tickerSubscription?.params?.symbol) === JSON.stringify(['XU3O8/USD'])
      && ohlcSubscriptions.length === 2
      && ohlcSubscriptions.every(({ params }) => params?.snapshot === true
        && JSON.stringify(params?.symbol) === JSON.stringify(['XU3O8/USD']))
      && JSON.stringify(ohlcSubscriptions.map(({ params }) => params.interval).sort((a, b) => a - b)) === JSON.stringify([5, 15]),
    `uranium chamber: Kraken v2 subscriptions drifted ${JSON.stringify(initialSocketState.subscriptions)}`);
    const initialOhlcEmitted = await page.evaluate(() => window.__emitUraniumKrakenOhlcSnapshot());
    assert(initialOhlcEmitted, 'uranium chamber: deterministic Kraken 5m OHLC snapshot was not accepted by the mock socket');
    const initial15mOhlcEmitted = await page.evaluate(() => window.__emitUraniumKrakenOhlc15mSnapshot());
    assert(initial15mOhlcEmitted, 'uranium chamber: deterministic Kraken 15m OHLC snapshot was not accepted by the mock socket');

    await page.evaluate(() => {
      window.__uraniumSmokeVisibility = 'hidden';
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForFunction(() => window.__uraniumWebSocketState?.closed === 2, null, { timeout: 3000 });
    await page.waitForFunction(() => typeof window.__uraniumSmokeTimerTick === 'function', null, { timeout: 3000 });
    const entriesBeforeHiddenTick = entryRequests;
    const requestsBeforeHiddenTick = snapshotRequests;
    await page.evaluate(() => window.__uraniumSmokeTimerTick());
    await page.waitForTimeout(50);
    assert(entryRequests === entriesBeforeHiddenTick && snapshotRequests === requestsBeforeHiddenTick,
      `uranium chamber: hidden tab polled a summary or full snapshot ${JSON.stringify({ entriesBeforeHiddenTick, entryRequests, requestsBeforeHiddenTick, snapshotRequests })}`);
    const hiddenSocketState = await page.evaluate(() => ({ ...window.__uraniumWebSocketState }));
    assert(hiddenSocketState.opened === 2 && hiddenSocketState.closed === 2,
      `uranium chamber: hidden room did not close both Kraken sockets ${JSON.stringify(hiddenSocketState)}`);

    await page.locator('#uranium-tab-markets').click();
    const marketsState = await page.evaluate(() => {
      const panel = document.querySelector('#uranium-view-panel');
      return {
        selected: document.querySelector('#uranium-tab-markets')?.getAttribute('aria-selected'),
        labelledBy: panel?.getAttribute('aria-labelledby') || '',
        text: panel?.textContent?.replace(/\s+/g, ' ').trim() || '',
        bookRows: panel?.querySelectorAll('.uranium-book-row').length || 0,
        tradeRows: panel?.querySelectorAll('.uranium-table tbody tr').length || 0,
        price: panel?.querySelector('.uranium-live-quote strong')?.textContent?.trim() || ''
      };
    });
    assert(marketsState.selected === 'true' && marketsState.labelledBy === 'uranium-tab-markets'
      && /Kraken listing/i.test(marketsState.text) && /Public order book/i.test(marketsState.text)
      && marketsState.bookRows > 0 && marketsState.tradeRows > 0 && /^\$/.test(marketsState.price),
    `uranium chamber: Markets view is incomplete ${JSON.stringify(marketsState)}`);

    const rangeExpectations = [
      { id: '24H', source: /Kraken direct WebSocket snapshot/i, cadence: /\b5m\b/i, minimumObservations: 4, eventMarkerDays: null },
      { id: '7D', source: /Kraken direct WebSocket snapshot/i, cadence: /\b15m\b/i, minimumObservations: 6, eventMarkerDays: null },
      { id: '30D', source: /CoinGecko cross-venue aggregate/i, cadence: /\bdaily\b/i, minimumObservations: 20, eventMarkerDays: 30 },
      { id: '90D', source: /CoinGecko cross-venue aggregate/i, cadence: /\bdaily\b/i, minimumObservations: 70, eventMarkerDays: 90 },
      { id: '1Y', source: /CoinGecko cross-venue aggregate/i, cadence: /\bdaily\b/i, minimumObservations: 300, eventMarkerDays: 365 }
    ];
    const krakenEventAt = Date.parse(snapshotFixture?.market?.kraken?.firstTradeAt
      || snapshotFixture?.identity?.krakenListing?.announcedLiveDate
      || '');
    const latestCoinGeckoAt = Math.max(...(snapshotFixture?.market?.priceHistoryUsd || []).map((row) => (
      Date.parse(row?.timestamp || row?.date || '')
    )).filter(Number.isFinite));
    const rangeStates = {};
    for (const expectation of rangeExpectations) {
      await page.locator(`[data-uranium-range="${expectation.id}"]`).click();
      await page.waitForFunction((rangeId) => (
        document.querySelector(`[data-uranium-range="${rangeId}"]`)?.getAttribute('aria-pressed') === 'true'
          && Boolean(document.querySelector('#uranium-view-panel .uranium-chart.is-interactive'))
      ), expectation.id, { timeout: 3000 });
      const state = await page.evaluate(() => {
        const panel = document.querySelector('#uranium-view-panel');
        const chart = panel?.querySelector('.uranium-chart.is-interactive');
        const hitbox = chart?.querySelector('[data-uranium-chart-hitbox]');
        const provenance = chart?.querySelector('.uranium-chart-provenance')?.textContent?.replace(/\s+/g, ' ').trim() || '';
        return {
          rangeLabels: Array.from(panel?.querySelectorAll('[data-uranium-range]') || []).map((button) => button.textContent?.trim() || ''),
          selectedRange: panel?.querySelector('[data-uranium-range][aria-pressed="true"]')?.dataset.uraniumRange || '',
          axisLabels: Array.from(chart?.querySelectorAll('.uranium-chart-axis text') || []).map((node) => node.textContent?.trim() || ''),
          volumeBars: chart?.querySelectorAll('.uranium-chart-volume-bar').length || 0,
          provenance,
          observationCount: Number(hitbox?.getAttribute('aria-valuemax') || -1) + 1,
          readout: chart?.querySelector('.uranium-chart-readout')?.textContent?.replace(/\s+/g, ' ').trim() || '',
          readoutPrice: chart?.querySelector('[data-uranium-chart-price]')?.textContent?.trim() || '',
          readoutPrimary: chart?.querySelector('[data-uranium-chart-primary]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
          readoutSecondary: chart?.querySelector('[data-uranium-chart-secondary]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
          eventMarkers: Array.from(chart?.querySelectorAll('.uranium-chart-event') || []).map((marker) => marker.textContent?.replace(/\s+/g, ' ').trim() || ''),
          sliderRole: hitbox?.getAttribute('role') || '',
          sliderValueText: hitbox?.getAttribute('aria-valuetext') || ''
        };
      });
      rangeStates[expectation.id] = state;
      assert(JSON.stringify(state.rangeLabels) === JSON.stringify(['24H', '7D', '30D', '90D', '1Y'])
        && state.selectedRange === expectation.id,
      `uranium chamber: range control drifted for ${expectation.id} ${JSON.stringify(state)}`);
      assert(expectation.source.test(state.provenance) && expectation.cadence.test(state.provenance)
        && /→/.test(state.provenance) && /observations/i.test(state.provenance)
        && state.observationCount >= expectation.minimumObservations,
      `uranium chamber: ${expectation.id} source or actual coverage is incomplete ${JSON.stringify(state)}`);
      assert(state.axisLabels.length === 4 && state.axisLabels.every((label) => /^\$\d/.test(label))
        && state.volumeBars >= state.observationCount && state.sliderRole === 'slider',
      `uranium chamber: ${expectation.id} price axis, volume, or lookup semantics are incomplete ${JSON.stringify(state)}`);
      assert(/^\$\d/.test(state.readoutPrice) && state.readout.length > state.readoutPrice.length
        && state.readoutPrimary.length > 0 && state.readoutSecondary.length > 0 && state.sliderValueText.length > 0,
      `uranium chamber: ${expectation.id} historical readout is incomplete ${JSON.stringify(state)}`);
      const expectsEventMarker = Number.isFinite(expectation.eventMarkerDays)
        && Number.isFinite(krakenEventAt)
        && Number.isFinite(latestCoinGeckoAt)
        && krakenEventAt >= latestCoinGeckoAt - (expectation.eventMarkerDays * 24 * 60 * 60 * 1000)
        && krakenEventAt <= latestCoinGeckoAt;
      assert(expectsEventMarker === state.eventMarkers.some((label) => /Kraken USD live/i.test(label)),
        `uranium chamber: ${expectation.id} event marker visibility is dishonest ${JSON.stringify(state)}`);
    }

    const lookupBefore = await page.evaluate(() => {
      const hitbox = document.querySelector('#uranium-view-panel [data-uranium-chart-hitbox]');
      hitbox?.focus({ preventScroll: true });
      return {
        now: hitbox?.getAttribute('aria-valuenow') || '',
        text: hitbox?.getAttribute('aria-valuetext') || '',
        readout: hitbox?.closest('[data-uranium-chart]')?.querySelector('.uranium-chart-readout')?.textContent?.replace(/\s+/g, ' ').trim() || ''
      };
    });
    await page.keyboard.press('Home');
    const lookupAfter = await page.evaluate(() => {
      const hitbox = document.querySelector('#uranium-view-panel [data-uranium-chart-hitbox]');
      return {
        now: hitbox?.getAttribute('aria-valuenow') || '',
        text: hitbox?.getAttribute('aria-valuetext') || '',
        readout: hitbox?.closest('[data-uranium-chart]')?.querySelector('.uranium-chart-readout')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        focused: document.activeElement === hitbox
      };
    });
    assert(Number(lookupBefore.now) > 0 && lookupAfter.now === '0' && lookupAfter.focused
      && lookupAfter.text !== lookupBefore.text && lookupAfter.readout !== lookupBefore.readout,
    `uranium chamber: exact keyboard history lookup did not update the slider and visible readout ${JSON.stringify({ lookupBefore, lookupAfter })}`);

    await page.locator('[data-uranium-range="24H"]').click();
    const hiddenMarketsSocketState = await page.evaluate(() => ({ ...window.__uraniumWebSocketState }));
    assert(hiddenMarketsSocketState.opened === 2 && hiddenMarketsSocketState.closed === 2,
      `uranium chamber: hidden Markets interactions reopened Kraken WebSocket ${JSON.stringify(hiddenMarketsSocketState)}`);

    await page.locator('#uranium-tab-onchain').click();
    const onchainState = await page.evaluate(() => {
      const panel = document.querySelector('#uranium-view-panel');
      return {
        selected: document.querySelector('#uranium-tab-onchain')?.getAttribute('aria-selected'),
        text: panel?.textContent?.replace(/\s+/g, ' ').trim() || '',
        holders: panel?.querySelectorAll('.uranium-chain-grid .uranium-table tbody tr').length || 0,
        contracts: Array.from(panel?.querySelectorAll('.uranium-address-compare code') || []).map((node) => node.textContent?.trim() || '')
      };
    });
    assert(onchainState.selected === 'true' && /Etherlink mainnet/i.test(onchainState.text)
      && /address is not necessarily a person/i.test(onchainState.text) && /different/i.test(onchainState.text)
      && onchainState.holders > 0 && onchainState.contracts.length === 2 && onchainState.contracts[0] !== onchainState.contracts[1],
    `uranium chamber: On-chain identity boundaries are incomplete ${JSON.stringify(onchainState)}`);

    await page.locator('#uranium-tab-proofbook').click();
    const proofbookState = await page.evaluate(() => {
      const panel = document.querySelector('#uranium-view-panel');
      const text = panel?.textContent?.replace(/\s+/g, ' ').trim() || '';
      return {
        selected: document.querySelector('#uranium-tab-proofbook')?.getAttribute('aria-selected'),
        text,
        evidenceClockHeader: Array.from(panel?.querySelectorAll('th') || []).some((node) => node.textContent?.trim() === 'Evidence clock'),
        clocks: Array.from(panel?.querySelectorAll('.uranium-source-clock') || []).map((node) => node.textContent?.replace(/\s+/g, ' ').trim() || '')
      };
    });
    assert(proofbookState.selected === 'true' && proofbookState.evidenceClockHeader
      && proofbookState.clocks.some((text) => /Statement as at/i.test(text))
      && proofbookState.clocks.some((text) => /Announced live/i.test(text))
      && proofbookState.clocks.some((text) => /Reviewed/i.test(text))
      && /Issuer documents name/i.test(proofbookState.text) && /not independent legal conclusions/i.test(proofbookState.text),
    `uranium chamber: Proofbook clocks or issuer attribution are incomplete ${JSON.stringify(proofbookState)}`);

    await page.locator('#uranium-tab-markets').click();
    const quietBefore = await page.evaluate(() => {
      const body = document.querySelector('#uranium-chamber-body');
      const header = body?.querySelector('.uranium-header');
      const panel = body?.querySelector('#uranium-view-panel');
      const focus = body?.querySelector('#uranium-tab-markets');
      const quote = panel?.querySelector('.uranium-live-quote strong');
      const textNode = panel?.querySelector('.uranium-market-lockup p')?.firstChild;
      if (!body || !header || !panel || !focus || !quote || !textNode) throw new Error('uranium quiet-refresh fixture is incomplete');
      body.closest('.chamber-room-scroll').scrollTop = Math.min(320, Math.max(0, body.closest('.chamber-room-scroll').scrollHeight - body.closest('.chamber-room-scroll').clientHeight));
      focus.focus({ preventScroll: true });
      const selection = document.getSelection();
      selection.removeAllRanges();
      const range = document.createRange();
      range.setStart(textNode, 0);
      range.setEnd(textNode, Math.min(10, textNode.textContent.length));
      selection.addRange(range);
      delete body.dataset.quietRefreshSettled;
      window.__uraniumQuietHeader = header;
      window.__uraniumQuietPanel = panel;
      window.__uraniumQuietFocus = focus;
      window.__uraniumQuietQuote = quote;
      return {
        top: body.closest('.chamber-room-scroll').scrollTop,
        selection: selection.toString(),
        price: quote.textContent?.trim() || ''
      };
    });
    assert(quietBefore.top > 0 && quietBefore.selection.length > 0,
      `uranium chamber: quiet-refresh fixture did not exercise scroll and selection ${JSON.stringify(quietBefore)}`);

    const requestsBeforeResume = snapshotRequests;
    uraniumRevision = 1;
    await page.evaluate(() => {
      window.__uraniumSmokeVisibility = 'visible';
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForFunction(() => document.querySelector('#uranium-chamber-body')?.dataset.quietRefreshSettled === 'true', null, { timeout: 6000 });
    await page.waitForFunction(() => (
      window.__uraniumWebSocketState?.opened === 4
        && window.__uraniumWebSocketState?.subscriptions?.length === 6
    ), null, { timeout: 3000 });
    const requestDeadline = Date.now() + 6000;
    while (snapshotRequests <= requestsBeforeResume && Date.now() < requestDeadline) await page.waitForTimeout(25);
    assert(snapshotRequests === requestsBeforeResume + 1,
      `uranium chamber: visibility resume did not perform exactly one catch-up ${JSON.stringify({ requestsBeforeResume, snapshotRequests })}`);
    await page.waitForTimeout(80);

    const quietAfter = await page.evaluate(() => {
      const body = document.querySelector('#uranium-chamber-body');
      const header = body?.querySelector('.uranium-header');
      const panel = body?.querySelector('#uranium-view-panel');
      const focus = body?.querySelector('#uranium-tab-markets');
      const quote = panel?.querySelector('.uranium-live-quote strong');
      const headerStyle = header ? getComputedStyle(header) : null;
      const tabStyle = focus ? getComputedStyle(focus) : null;
      return {
        sameHeader: header === window.__uraniumQuietHeader,
        samePanel: panel === window.__uraniumQuietPanel,
        sameFocus: focus === window.__uraniumQuietFocus,
        sameQuote: quote === window.__uraniumQuietQuote,
        focused: document.activeElement === window.__uraniumQuietFocus,
        selected: focus?.getAttribute('aria-selected') || '',
        selection: document.getSelection()?.toString() || '',
        top: body?.closest('.chamber-room-scroll')?.scrollTop || 0,
        price: quote?.textContent?.trim() || '',
        marketStatus: panel?.querySelector('.uranium-live-quote .uranium-status')?.textContent?.trim() || '',
        freshness: body?.querySelector('#uranium-freshness')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        settled: body?.dataset.quietRefreshSettled === 'true' && !body?.dataset.quietRefreshing,
        animation: headerStyle?.animationName || '',
        opacity: headerStyle?.opacity || '',
        transform: headerStyle?.transform || '',
        transitionsSettled: (tabStyle?.transitionDuration || '').split(',').every((duration) => Number.parseFloat(duration) === 0)
      };
    });
    assert(quietAfter.sameHeader && quietAfter.samePanel && quietAfter.sameFocus && quietAfter.sameQuote && quietAfter.focused,
      `uranium chamber: quiet refresh replaced keyed or focused nodes ${JSON.stringify({ quietBefore, quietAfter })}`);
    assert(quietAfter.selected === 'true' && quietAfter.selection === quietBefore.selection,
      `uranium chamber: quiet refresh lost the selected view or text selection ${JSON.stringify({ quietBefore, quietAfter })}`);
    assert(Math.abs(quietAfter.top - quietBefore.top) < 1,
      `uranium chamber: quiet refresh moved room scroll ${JSON.stringify({ quietBefore, quietAfter })}`);
    assert(quietAfter.price !== quietBefore.price,
      `uranium chamber: mocked fresh quote was not reconciled ${JSON.stringify({ quietBefore, quietAfter })}`);
    assert(quietAfter.marketStatus === 'stale' && /(Kraken .*stale|sources? degraded)/i.test(quietAfter.freshness),
      `uranium chamber: retained last-good Kraken data stayed falsely green ${JSON.stringify(quietAfter)}`);
    assert(quietAfter.settled && quietAfter.animation === 'none' && quietAfter.opacity === '1'
      && quietAfter.transform === 'none' && quietAfter.transitionsSettled,
    `uranium chamber: quiet refresh replayed or stranded animation state ${JSON.stringify(quietAfter)}`);

    const liveEmitState = await page.evaluate(() => ({
      ticker: window.__emitUraniumKrakenTickerSnapshot(),
      ohlc: window.__emitUraniumKrakenOhlcSnapshot(true)
    }));
    assert(liveEmitState.ticker && liveEmitState.ohlc,
      `uranium chamber: deterministic Kraken v2 ticker/OHLC messages were not emitted ${JSON.stringify(liveEmitState)}`);
    await page.waitForFunction(() => {
      const panel = document.querySelector('#uranium-view-panel');
      return panel?.querySelector('.uranium-live-quote strong')?.textContent?.trim() === '$5.612'
        && /Kraken direct WebSocket snapshot/i.test(panel?.querySelector('.uranium-chart-provenance')?.textContent || '')
        && Number(panel?.querySelector('[data-uranium-chart-hitbox]')?.getAttribute('aria-valuemax') || -1) >= 4;
    }, null, { timeout: 3000 });
    await page.waitForFunction(() => {
      const body = document.querySelector('#uranium-chamber-body');
      return body?.dataset.quietRefreshSettled === 'true' && !body.dataset.quietRefreshing;
    }, null, { timeout: 3000 });
    const liveAfter = await page.evaluate(() => {
      const body = document.querySelector('#uranium-chamber-body');
      const header = body?.querySelector('.uranium-header');
      const panel = body?.querySelector('#uranium-view-panel');
      const focus = body?.querySelector('#uranium-tab-markets');
      const quote = panel?.querySelector('.uranium-live-quote strong');
      return {
        sameHeader: header === window.__uraniumQuietHeader,
        samePanel: panel === window.__uraniumQuietPanel,
        sameFocus: focus === window.__uraniumQuietFocus,
        sameQuote: quote === window.__uraniumQuietQuote,
        focused: document.activeElement === window.__uraniumQuietFocus,
        selected: focus?.getAttribute('aria-selected') || '',
        selection: document.getSelection()?.toString() || '',
        top: body?.closest('.chamber-room-scroll')?.scrollTop || 0,
        price: quote?.textContent?.trim() || '',
        status: panel?.querySelector('.uranium-live-quote .uranium-status')?.textContent?.trim() || '',
        provenance: panel?.querySelector('.uranium-chart-provenance')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        inbound: window.__uraniumWebSocketState?.inbound || [],
        opened: window.__uraniumWebSocketState?.opened || 0,
        closed: window.__uraniumWebSocketState?.closed || 0,
        settled: body?.dataset.quietRefreshSettled === 'true' && !body?.dataset.quietRefreshing
      };
    });
    assert(liveAfter.sameHeader && liveAfter.samePanel && liveAfter.sameFocus && liveAfter.sameQuote && liveAfter.focused
      && liveAfter.selected === 'true' && liveAfter.selection === quietBefore.selection
      && Math.abs(liveAfter.top - quietBefore.top) < 1 && liveAfter.settled,
    `uranium chamber: live ticker/OHLC reconciliation disturbed quiet reading state ${JSON.stringify({ quietBefore, liveAfter })}`);
    assert(liveAfter.price === '$5.612' && liveAfter.status === 'online'
      && /Kraken direct WebSocket snapshot/i.test(liveAfter.provenance)
      && /\b5m\b/i.test(liveAfter.provenance)
      && liveAfter.inbound.some(({ channel, type, rows }) => channel === 'ticker' && type === 'snapshot' && rows === 1)
      && liveAfter.inbound.filter(({ channel, type }) => channel === 'ohlc' && type === 'snapshot').length === 3,
    `uranium chamber: official-shape live Kraken receipt was not presented ${JSON.stringify(liveAfter)}`);
    const formingCandleEmitted = await page.evaluate(() => window.__emitUraniumKrakenFormingCandle());
    assert(formingCandleEmitted, 'uranium chamber: forming Kraken candle update was not emitted');
    await page.waitForFunction(() => (
      document.querySelector('#uranium-view-panel [data-uranium-chart-price]')?.textContent?.trim() === '$5.618'
        && document.querySelector('#uranium-chamber-body')?.dataset.quietRefreshSettled === 'true'
        && !document.querySelector('#uranium-chamber-body')?.dataset.quietRefreshing
    ), null, { timeout: 3000 });
    const formingCandleState = await page.evaluate(() => ({
      samePanel: document.querySelector('#uranium-view-panel') === window.__uraniumQuietPanel,
      focused: document.activeElement === window.__uraniumQuietFocus,
      selection: document.getSelection()?.toString() || '',
      top: document.querySelector('#uranium-chamber-body')?.closest('.chamber-room-scroll')?.scrollTop || 0,
      quote: document.querySelector('#uranium-view-panel .uranium-live-quote strong')?.textContent?.trim() || '',
      chartPrice: document.querySelector('#uranium-view-panel [data-uranium-chart-price]')?.textContent?.trim() || '',
      chartDetail: document.querySelector('#uranium-view-panel [data-uranium-chart-secondary]')?.textContent?.replace(/\s+/g, ' ').trim() || ''
    }));
    assert(formingCandleState.samePanel && formingCandleState.focused
      && formingCandleState.selection === quietBefore.selection
      && Math.abs(formingCandleState.top - quietBefore.top) < 1
      && formingCandleState.quote === '$5.612' && formingCandleState.chartPrice === '$5.618'
      && /interval forming/i.test(formingCandleState.chartDetail),
    `uranium chamber: forming-candle reconciliation froze or disturbed reading state ${JSON.stringify(formingCandleState)}`);

    const socketsBeforeSecondHide = await page.evaluate(() => ({ ...window.__uraniumWebSocketState }));
    await page.evaluate(() => {
      window.__uraniumSmokeVisibility = 'hidden';
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForFunction((closed) => window.__uraniumWebSocketState?.closed === closed + 2,
      socketsBeforeSecondHide.closed, { timeout: 3000 });
    const socketsAfterSecondHide = await page.evaluate(() => ({ ...window.__uraniumWebSocketState }));
    assert(socketsAfterSecondHide.opened === socketsBeforeSecondHide.opened
      && socketsAfterSecondHide.closed === socketsBeforeSecondHide.closed + 2,
    `uranium chamber: visibility hide did not pause both live sockets ${JSON.stringify({ socketsBeforeSecondHide, socketsAfterSecondHide })}`);

    await page.evaluate(() => {
      window.__uraniumSmokeVisibility = 'visible';
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForFunction((opened) => window.__uraniumWebSocketState?.opened === opened + 2,
      socketsAfterSecondHide.opened, { timeout: 3000 });
    const socketsBeforeClose = await page.evaluate(() => ({ ...window.__uraniumWebSocketState }));

    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#uranium-modal')?.classList.contains('active'), null, { timeout: 5000 });
    await page.waitForFunction((closed) => window.__uraniumWebSocketState?.closed === closed + 2,
      socketsBeforeClose.closed, { timeout: 3000 });
    const socketsAfterClose = await page.evaluate(() => ({ ...window.__uraniumWebSocketState }));
    assert(socketsAfterClose.opened === socketsBeforeClose.opened
      && socketsAfterClose.closed === socketsBeforeClose.closed + 2,
    `uranium chamber: closing the expanded room did not close both live sockets ${JSON.stringify({ socketsBeforeClose, socketsAfterClose })}`);

    const deepLinkResponse = await page.goto(`${baseUrl}/uranium/?view=markets&range=90D`, { waitUntil: 'domcontentloaded' });
    assert(deepLinkResponse?.ok(), `uranium chamber: ranged deep link failed with HTTP ${deepLinkResponse?.status()}`);
    await page.locator('#uranium-modal.active .uranium-content').waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForFunction(() => document.querySelector('#uranium-chamber-body')?.dataset.uraniumRendered === '1', null, { timeout: 10000 });
    const deepLinkState = await page.evaluate(() => ({
      path: location.pathname,
      view: new URL(location.href).searchParams.get('view'),
      range: new URL(location.href).searchParams.get('range'),
      selectedView: document.querySelector('#uranium-tab-markets')?.getAttribute('aria-selected') || '',
      selectedRange: document.querySelector('[data-uranium-range][aria-pressed="true"]')?.dataset.uraniumRange || '',
      provenance: document.querySelector('.uranium-chart-provenance')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      socket: { ...window.__uraniumWebSocketState }
    }));
    assert(deepLinkState.path === '/uranium/' && deepLinkState.view === 'markets' && deepLinkState.range === '90D'
      && deepLinkState.selectedView === 'true' && deepLinkState.selectedRange === '90D'
      && /CoinGecko cross-venue aggregate/i.test(deepLinkState.provenance),
    `uranium chamber: direct route did not preserve the historical range ${JSON.stringify(deepLinkState)}`);
    await page.locator('[data-uranium-range="1Y"]').click();
    const rangeRouteState = await page.evaluate(() => ({
      range: new URL(location.href).searchParams.get('range'),
      selectedRange: document.querySelector('[data-uranium-range][aria-pressed="true"]')?.dataset.uraniumRange || ''
    }));
    assert(rangeRouteState.range === '1Y' && rangeRouteState.selectedRange === '1Y',
      `uranium chamber: range selection did not update the bookmarkable URL ${JSON.stringify(rangeRouteState)}`);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#uranium-modal')?.classList.contains('active'), null, { timeout: 5000 });
    await context.close();
    assert(entryRequests > 0 && snapshotRequests >= 2,
      `uranium chamber: mocked entry/full receipts were not both exercised ${JSON.stringify({ entryRequests, snapshotRequests })}`);
    assert(issues.length === 0, `uranium chamber browser issues:\n${issues.join('\n')}`);

    const lanIssues = [];
    const lanContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      serviceWorkers: 'block'
    });
    await installMockKrakenWebSocket(lanContext);
    await installFeatureMocks(lanContext);
    await lanContext.addInitScript(() => {
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
      Object.defineProperty(globalThis.crypto, 'subtle', {
        configurable: true,
        value: undefined
      });
    });
    const lanPage = await lanContext.newPage();
    lanPage.on('console', (message) => {
      if (!['warning', 'warn', 'error'].includes(message.type()) || !/Uranium Chamber/i.test(message.text())) return;
      lanIssues.push(`uranium chamber LAN HTTP console ${message.type()}: ${message.text()}`);
    });
    lanPage.on('pageerror', (error) => {
      lanIssues.push(`uranium chamber LAN HTTP pageerror: ${error.message}`);
    });
    lanPage.on('requestfailed', (request) => {
      if (!/\/data\/uranium-(?:entry-summary|snapshot)\.json/.test(request.url())) return;
      lanIssues.push(`uranium chamber LAN HTTP request failed: ${request.failure()?.errorText || 'failed'} ${request.url()}`);
    });
    const lanResponse = await lanPage.goto(`${baseUrl}/uranium/`, { waitUntil: 'domcontentloaded' });
    assert(lanResponse?.ok(), `uranium chamber LAN HTTP: pretty route failed with HTTP ${lanResponse?.status()}`);
    await lanPage.locator('#uranium-modal.active .uranium-content').waitFor({ state: 'visible', timeout: 15000 });
    await lanPage.waitForFunction(() => (
      document.querySelector('#uranium-chamber-body')?.dataset.uraniumRendered === '1'
        && document.querySelectorAll('#uranium-modal .uranium-tab').length === 4
        && performance.getEntriesByType('resource').some(({ name }) => name.includes('/data/uranium-entry-summary.json'))
        && performance.getEntriesByType('resource').some(({ name }) => name.includes('/data/uranium-snapshot.json'))
    ), null, { timeout: 10000 });
    await lanPage.evaluate(() => document.fonts.ready);
    await lanPage.waitForFunction(() => document.querySelector('#uranium-modal .uranium-content')
      ?.getAnimations().every(animation => animation.playState === 'finished'));
    const lanState = await lanPage.evaluate(() => {
      const modal = document.querySelector('#uranium-modal .uranium-content');
      const body = document.querySelector('#uranium-chamber-body');
      const rect = modal?.getBoundingClientRect();
      const resources = performance.getEntriesByType('resource').map(({ name }) => name);
      return {
        protocol: location.protocol,
        subtleAvailable: Boolean(globalThis.crypto?.subtle),
        rendered: body?.dataset.uraniumRendered === '1',
        retryButtons: body?.querySelectorAll('[data-uranium-retry]').length || 0,
        text: body?.textContent?.replace(/\s+/g, ' ').trim() || '',
        modal: rect ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom } : null,
        tabRailContained: (() => {
          const rail = document.querySelector('#uranium-modal .uranium-tabs');
          const railRect = rail.getBoundingClientRect();
          return railRect.left >= -1 && railRect.right <= innerWidth + 1
            && /auto|scroll/.test(getComputedStyle(rail).overflowX);
        })(),
        mainScroll: Boolean(body && body.closest('.chamber-room-scroll').scrollHeight > body.closest('.chamber-room-scroll').clientHeight),
        pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        loadedEntryArtifact: resources.some((name) => name.includes('/data/uranium-entry-summary.json')),
        loadedSnapshotArtifact: resources.some((name) => name.includes('/data/uranium-snapshot.json'))
      };
    });
    const expectedPreviewProtocol = new URL(baseUrl).protocol;
    assert(lanState.protocol === expectedPreviewProtocol && !lanState.subtleAvailable,
      `uranium chamber no-SubtleCrypto preview: fallback fixture was not active ${JSON.stringify(lanState)}`);
    assert(lanState.rendered && lanState.retryButtons === 0 && /xU3O8/i.test(lanState.text)
      && lanState.loadedEntryArtifact && lanState.loadedSnapshotArtifact,
    `uranium chamber LAN HTTP: real integrity-checked artifacts did not render ${JSON.stringify(lanState)}`);
    assert(lanState.modal && lanState.modal.left >= -1 && lanState.modal.right <= 391
      && lanState.modal.top >= -1 && lanState.modal.bottom <= 845
      && lanState.tabRailContained && lanState.mainScroll && lanState.pageOverflow <= 1,
    `uranium chamber LAN HTTP: mobile room escaped the 390x844 viewport ${JSON.stringify(lanState)}`);
    // Readable phone tabs use a horizontal rail; prove its last view is reachable.
    await lanPage.locator('#uranium-tab-proofbook').click();
    await lanPage.waitForFunction(() => document.querySelector('#uranium-tab-proofbook')?.getAttribute('aria-selected') === 'true');
    const lastTabReachable = await lanPage.locator('#uranium-tab-proofbook').evaluate(tab => {
      const rect = tab.getBoundingClientRect();
      return rect.left >= -1 && rect.right <= innerWidth + 1;
    });
    assert(lastTabReachable, 'uranium chamber LAN HTTP: scrolling the phone tab rail must reveal Proofbook');
    await lanPage.locator('#uranium-tab-markets').click();
    await lanPage.waitForFunction(() => Boolean(document.querySelector('#uranium-view-panel .uranium-chart.is-interactive')), null, { timeout: 3000 });
    const mobileMarketsState = await lanPage.evaluate(() => {
      const panel = document.querySelector('#uranium-view-panel .uranium-price-panel');
      const chart = panel?.querySelector('.uranium-chart.is-interactive');
      const svg = chart?.querySelector('svg');
      const readout = chart?.querySelector('.uranium-chart-readout');
      const provenance = chart?.querySelector('.uranium-chart-provenance');
      const eventLabel = chart?.querySelector('.uranium-chart-event text');
      const rect = (element) => {
        const bounds = element?.getBoundingClientRect();
        return bounds ? { left: bounds.left, right: bounds.right, width: bounds.width, height: bounds.height } : null;
      };
      const panelRect = rect(panel);
      const contained = (element) => {
        const bounds = rect(element);
        return Boolean(bounds && panelRect && bounds.left >= panelRect.left - 1 && bounds.right <= panelRect.right + 1);
      };
      return {
        panel: panelRect,
        chart: rect(chart),
        svg: rect(svg),
        viewBoxWidth: svg?.viewBox?.baseVal?.width || 0,
        rangesContained: Array.from(panel?.querySelectorAll('[data-uranium-range]') || []).every(contained),
        readoutContained: contained(readout),
        provenanceContained: contained(provenance),
        eventLabelContained: !eventLabel || contained(eventLabel),
        eventLabel: rect(eventLabel),
        axisWidths: Array.from(chart?.querySelectorAll('.uranium-chart-axis text') || []).map((label) => label.getBoundingClientRect().width),
        pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    });
    assert(mobileMarketsState.panel && mobileMarketsState.chart && mobileMarketsState.svg
      && mobileMarketsState.chart.width <= mobileMarketsState.panel.width + 1
      && mobileMarketsState.svg.width <= mobileMarketsState.panel.width + 1
      && mobileMarketsState.viewBoxWidth >= 350 && mobileMarketsState.viewBoxWidth <= 400
      && mobileMarketsState.rangesContained && mobileMarketsState.readoutContained
      && mobileMarketsState.provenanceContained && mobileMarketsState.eventLabelContained
      && mobileMarketsState.axisWidths.length === 4 && mobileMarketsState.axisWidths.every((width) => width >= 18)
      && mobileMarketsState.pageOverflow <= 1,
    `uranium chamber LAN HTTP: mobile Markets chart is clipped or unreadable ${JSON.stringify(mobileMarketsState)}`);
    await lanContext.close();
    assert(lanIssues.length === 0, `uranium chamber LAN HTTP browser issues:\n${lanIssues.join('\n')}`);
    log('ok - Uranium Chamber ranges, direct Kraken stream, LAN HTTP integrity fallback, hidden gating, and quiet-refresh reading state');
  }

  return { smokeUraniumChamber };
}
