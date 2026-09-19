// Browser workflows owned by capital. Shared dependencies remain explicit.
import { assertSerializationUpgrade } from '../lib/serialization-upgrade-smoke.mjs';
export function createCapitalSmokeSuites({
  assert,
  attachIssueCollectors,
  createHash,
  fulfillJson,
  installFeatureMocks,
  log,
  stableTestHash
}) {
  async function smokeCapitalChamber(browser, baseUrl) {
    await assertSerializationUpgrade(browser, baseUrl, installFeatureMocks);
    const issues = [];
    let capitalEntryFixture = null;
    let capitalSnapshotFixture = null;
    let capitalRevision = 0;
    let capitalEntryRequests = 0;
    let capitalSnapshotRequests = 0;
    const clone = (value) => JSON.parse(JSON.stringify(value));
    const makeCapitalSnapshot = (revision) => {
      const snapshot = clone(capitalSnapshotFixture);
      if (revision > 0) {
        const generatedAt = new Date(Date.parse(capitalSnapshotFixture.generatedAt) + (revision * 60_000)).toISOString();
        snapshot.generatedAt = generatedAt;
        if (snapshot.markets?.xtz?.coin) {
          snapshot.markets.xtz.coin.currentPriceUsd = Number(snapshot.markets.xtz.coin.currentPriceUsd || 0) + (revision * 0.01);
          snapshot.markets.xtz.coin.lastUpdated = generatedAt;
        }
        const history = snapshot.markets?.xtz?.priceHistory?.usd;
        if (Array.isArray(history) && history.length) history[history.length - 1].value = Number(history.at(-1).value || 0) + (revision * 0.01);
        const { contentHash: ignored, ...unsigned } = snapshot;
        snapshot.contentHash = stableTestHash(unsigned);
      }
      return snapshot;
    };
    const makeCapitalEntry = (snapshot, sourceText) => {
      const entry = clone(capitalEntryFixture);
      entry.generatedAt = snapshot.generatedAt;
      entry.source.generatedAt = snapshot.generatedAt;
      entry.source.contentHash = snapshot.contentHash;
      entry.source.fileSha256 = createHash('sha256').update(sourceText).digest('hex');
      if (entry.markets?.xtz?.coin && snapshot.markets?.xtz?.coin) {
        entry.markets.xtz.coin.currentPriceUsd = snapshot.markets.xtz.coin.currentPriceUsd;
        entry.markets.xtz.coin.lastUpdated = snapshot.markets.xtz.coin.lastUpdated;
      }
      const { contentHash: ignored, ...unsigned } = entry;
      entry.contentHash = stableTestHash(unsigned);
      return entry;
    };
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(context);
    await context.route('**/data/capital-entry-summary.json*', async (route) => {
      capitalEntryRequests += 1;
      if (!capitalEntryFixture) {
        const response = await route.fetch();
        capitalEntryFixture = await response.json();
        return fulfillJson(route, clone(capitalEntryFixture));
      }
      if (!capitalSnapshotFixture || capitalRevision === 0) return fulfillJson(route, clone(capitalEntryFixture));
      const snapshot = makeCapitalSnapshot(capitalRevision);
      const sourceText = JSON.stringify(snapshot);
      return fulfillJson(route, makeCapitalEntry(snapshot, sourceText));
    });
    await context.route('**/data/capital-snapshot.json*', async (route) => {
      capitalSnapshotRequests += 1;
      if (!capitalSnapshotFixture) {
        // Mutation fixtures read the public source; transport parity is checked separately.
  const response = await route.fetch({ url: new URL('/data/capital-snapshot.json', route.request().url()).href });
        const sourceText = await response.text();
        capitalSnapshotFixture = JSON.parse(sourceText);
        return route.fulfill({ status: response.status(), contentType: 'application/json', body: sourceText });
      }
      const snapshot = makeCapitalSnapshot(capitalRevision);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(snapshot) });
    });
    await context.addInitScript(() => {
      localStorage.setItem('tezos-systems-theme', 'matrix');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
      window.__CAPITAL_CHAMBER_REFRESH_MS__ = 123459;
      const nativeSetInterval = window.setInterval.bind(window);
      window.setInterval = (callback, delay, ...args) => {
        const timer = nativeSetInterval(callback, delay, ...args);
        if (Number(delay) === window.__CAPITAL_CHAMBER_REFRESH_MS__) {
          window.__capitalSmokeTimerTick = () => callback(...args);
        }
        return timer;
      };
    });
    const page = await context.newPage();
    attachIssueCollectors(page, 'capital chamber', issues);

    const response = await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `capital chamber: dashboard failed with HTTP ${response?.status()}`);
    await page.locator('#chambers-grid > .chamber-category[data-chamber-category="capital"] .chamber-category-toggle').click();
    await page.locator('#capital-entry-card').waitFor({ state: 'visible', timeout: 20000 });
    await page.locator('#capital-entry-card').dispatchEvent('pointerenter');
    await page.locator('#capital-entry-card .capital-entry-price-line').waitFor({ state: 'attached', timeout: 20000 });
    const cardState = await page.locator('#capital-entry-card').evaluate((card) => ({
      copyHash: card.querySelector('.card-copy-link')?.dataset.copyHash || '',
      updatedLabel: card.dataset.updatedLabel || '',
      text: card.textContent?.replace(/\s+/g, ' ').trim() || '',
      role: card.getAttribute('role') || '',
      openTag: card.querySelector('.chamber-expand-cue')?.tagName || '',
      openLabel: card.querySelector('.chamber-expand-cue')?.getAttribute('aria-label') || '',
      priceHistoryLabel: card.querySelector('.capital-entry-price-chart')?.getAttribute('aria-label') || '',
      priceHistoryPath: card.querySelector('.capital-entry-price-line')?.getAttribute('d') || ''
    }));
    assert(cardState.copyHash === '#capital', `capital chamber: card copy route mismatch ${cardState.copyHash}`);
    assert(/Capital Chamber/.test(cardState.text) && /Tezos|Etherlink/.test(cardState.text), `capital chamber: root card copy missing ${cardState.text}`);
    assert(/snapshot/i.test(cardState.text), `capital chamber: root card must expose a generated-snapshot freshness receipt ${cardState.text}`);
    assert(/CoinGecko/.test(cardState.text) && /6h schedule/.test(cardState.text), `capital chamber: launcher source age and generation schedule missing ${cardState.text}`);
    assert(cardState.role === 'article', `capital chamber: root card semantics missing ${JSON.stringify(cardState)}`);
    assert(/XTZ USD 90D daily close history/i.test(cardState.priceHistoryLabel) && cardState.priceHistoryPath.length > 80, `capital chamber: root card historical XTZ line is missing ${JSON.stringify(cardState)}`);

    await page.locator('#hero-search-input').fill('network fees');
    await page.waitForFunction(() => /Network Fees by Layer/i.test(document.querySelector('#hero-search-panel')?.textContent || ''), null, { timeout: 5000 });
    const feeSearchState = await page.evaluate(() => ({
      result: Array.from(document.querySelectorAll('#hero-search-panel .hero-search-result')).find((item) => /Network Fees by Layer/i.test(item.textContent || ''))?.textContent?.replace(/\s+/g, ' ').trim() || '',
      genericFallback: /Start from anything/i.test(document.querySelector('#hero-search-panel')?.textContent || '')
    }));
    assert(/Tezos L1 block fee pools/i.test(feeSearchState.result) && !feeSearchState.genericFallback, `capital chamber: network-fees search did not resolve the direct fee intent ${JSON.stringify(feeSearchState)}`);
    await page.keyboard.press('Escape');

    await page.locator('#capital-entry-front').click();
    await page.locator('#capital-modal.active .capital-content').waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForFunction(() => document.querySelectorAll('#capital-modal .capital-tab').length === 4, null, { timeout: 10000 });

    const shellState = await page.evaluate(() => {
      const modal = document.querySelector('#capital-modal');
      const content = modal?.querySelector('.capital-content');
      const tabs = Array.from(modal?.querySelectorAll('.capital-tab') || []);
      const activePanel = modal?.querySelector('[role="tabpanel"]:not([hidden]), .capital-view-shell');
      return {
        hash: location.hash,
        role: content?.getAttribute('role') || '',
        modal: content?.getAttribute('aria-modal') || '',
        labelledBy: content?.getAttribute('aria-labelledby') || '',
        focusInside: Boolean(content?.contains(document.activeElement)),
        tabListRole: modal?.querySelector('.capital-tabs')?.getAttribute('role') || '',
        tabRoles: tabs.map((tab) => tab.getAttribute('role') || ''),
        tabLabels: tabs.map((tab) => tab.textContent?.replace(/\s+/g, ' ').trim() || ''),
        selected: tabs.map((tab) => tab.getAttribute('aria-selected')),
        panelRole: activePanel?.getAttribute('role') || '',
        panelLabelledBy: activePanel?.getAttribute('aria-labelledby') || '',
        rangeCount: modal?.querySelectorAll('.capital-range-btn').length || 0,
        rangeLabel: modal?.querySelector('.capital-range-label')?.textContent?.trim() || '',
        disabledRanges: modal?.querySelectorAll('.capital-range-btn:disabled').length || 0,
        pressedRanges: Array.from(modal?.querySelectorAll('.capital-range-btn[aria-pressed="true"]') || []).map((button) => button.textContent?.trim() || ''),
        networkCosts: modal?.querySelector('#capital-network-costs')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        kpis: modal?.querySelectorAll('.capital-kpi').length || 0,
        charts: modal?.querySelectorAll('.capital-chart').length || 0,
        sourceReceipts: modal?.querySelectorAll('.capital-source-receipt').length || 0,
        freshness: modal?.querySelector('#capital-freshness')?.textContent?.trim() || '',
        text: activePanel?.textContent?.replace(/\s+/g, ' ').trim() || ''
      };
    });
    assert(shellState.hash === '', `capital chamber: root-card open should not create a stale hash route, saw ${shellState.hash}`);
    assert(shellState.role === 'dialog' && shellState.modal === 'true' && shellState.labelledBy && shellState.focusInside, `capital chamber: modal semantics or focus missing ${JSON.stringify(shellState)}`);
    assert(shellState.tabListRole === 'tablist' && shellState.tabRoles.every((role) => role === 'tab') && shellState.selected.filter((value) => value === 'true').length === 1, `capital chamber: tab semantics missing ${JSON.stringify(shellState)}`);
    assert(shellState.panelRole === 'tabpanel' && shellState.panelLabelledBy, `capital chamber: active panel semantics missing ${JSON.stringify(shellState)}`);
    assert(shellState.tabLabels.some((label) => /One System/i.test(label)) && shellState.tabLabels.some((label) => /Markets/i.test(label)) && shellState.tabLabels.some((label) => /Assets/i.test(label)) && shellState.tabLabels.some((label) => /Art/i.test(label)), `capital chamber: four views missing ${shellState.tabLabels.join(' | ')}`);
    assert(shellState.rangeCount === 5 && shellState.disabledRanges === 0 && shellState.rangeLabel === 'Range' && shellState.pressedRanges.length === 1, `capital chamber: One System selectable range controls missing ${JSON.stringify(shellState)}`);
    assert(/Fees by layer/i.test(shellState.networkCosts) && /L1 fees/i.test(shellState.networkCosts) && /L2 fees/i.test(shellState.networkCosts) && /No fictional combined total/i.test(shellState.networkCosts), `capital chamber: layer-separated network fee surface missing ${shellState.networkCosts}`);
    assert(shellState.kpis >= 4 && shellState.charts >= 2, `capital chamber: One System KPIs/charts are too sparse ${JSON.stringify(shellState)}`);
    assert(/Tezos/.test(shellState.text) && /Etherlink/.test(shellState.text) && /TVL/.test(shellState.text) && /stablecoin/i.test(shellState.text) && /transaction|TPS/i.test(shellState.text), `capital chamber: One System cross-layer copy missing ${shellState.text}`);
    assert(shellState.sourceReceipts > 0, 'capital chamber: One System source receipts missing');
    assert(/Generated|Last good/i.test(shellState.freshness) && /6h schedule/.test(shellState.freshness), `capital chamber: generated-at freshness receipt or schedule missing ${shellState.freshness}`);
    assert(/CoinGecko/.test(shellState.text), `capital chamber: XTZ quote source age missing ${shellState.text}`);

    const firstTab = page.locator('#capital-modal .capital-tab').first();
    await firstTab.focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => document.querySelectorAll('#capital-modal .capital-tab[aria-selected="true"]').length === 1
      && document.querySelector('#capital-modal .capital-tab[aria-selected="true"]') !== document.querySelector('#capital-modal .capital-tab'), null, { timeout: 3000 });
    const keyboardState = await page.evaluate(() => ({
      selectedIndex: Array.from(document.querySelectorAll('#capital-modal .capital-tab')).findIndex((tab) => tab.getAttribute('aria-selected') === 'true'),
      focusIsSelected: document.activeElement === document.querySelector('#capital-modal .capital-tab[aria-selected="true"]')
    }));
    assert(keyboardState.selectedIndex === 1 && keyboardState.focusIsSelected, `capital chamber: ArrowRight did not select/focus the next tab ${JSON.stringify(keyboardState)}`);

    const systemTab = page.locator('#capital-modal .capital-tab').filter({ hasText: /One System/i });
    await systemTab.click();
    const range30d = page.locator('#capital-modal .capital-range-btn').filter({ hasText: /^30D$/i });
    await range30d.click();
    assert(await range30d.getAttribute('aria-pressed') === 'true', 'capital chamber: 30D range did not become pressed');

    const marketsTab = page.locator('#capital-modal .capital-tab').filter({ hasText: /Markets/i });
    await marketsTab.click();
    await page.waitForFunction(() => /Markets/i.test(document.querySelector('#capital-modal .capital-tab[aria-selected="true"]')?.textContent || ''), null, { timeout: 3000 });
    const marketState = await page.evaluate(() => {
      const modal = document.querySelector('#capital-modal');
      const panel = modal?.querySelector('[role="tabpanel"]:not([hidden]), .capital-view-shell');
      const text = panel?.textContent?.replace(/\s+/g, ' ').trim() || '';
      const links = Array.from(panel?.querySelectorAll('a[href]') || []);
      return {
        text,
        returnPeriods: Array.from(panel?.querySelectorAll('.capital-table') || [])
          .find((table) => /return matrix/i.test(table.querySelector('caption')?.textContent || ''))
          ? Array.from(Array.from(panel.querySelectorAll('.capital-table')).find((table) => /return matrix/i.test(table.querySelector('caption')?.textContent || '')).querySelectorAll('tbody tr td:first-child')).map((cell) => cell.textContent?.trim() || '')
          : [],
        tableRows: panel?.querySelectorAll('.capital-table tbody tr').length || 0,
        qualityWarnings: panel?.querySelectorAll('.capital-quality.is-warn, .capital-quality.is-bad').length || 0,
        rangeLabels: Array.from(panel?.querySelectorAll('.capital-range-btn') || []).map((button) => button.textContent?.trim() || ''),
        disabledRanges: panel?.querySelectorAll('.capital-range-btn:disabled').length || 0,
        directTradeLinks: links.filter((link) => /^trade$/i.test(link.textContent?.trim() || '') || /binance|coinbase|kraken|okx|bybit|gate\.io|htx/i.test(link.href)).length,
        sourceReceipts: panel?.querySelectorAll('.capital-source-receipt').length || 0,
        featuredPriceCharts: panel?.querySelectorAll('.capital-featured-price-chart').length || 0,
        pricePanelWide: panel?.querySelector('.capital-market-price-panel')?.classList.contains('capital-panel-wide') || false,
        priceSummaryItems: panel?.querySelectorAll('.capital-price-summary > span').length || 0,
        priceChartLabel: panel?.querySelector('.capital-featured-price-chart')?.getAttribute('aria-label') || '',
        priceChartPath: panel?.querySelector('.capital-price-line')?.getAttribute('d') || ''
      };
    });
    for (const period of ['1h', '4h', '24h', '7d', '30d', '90d', '180d', '365d', 'MTD', 'QTD']) {
      assert(marketState.returnPeriods.includes(period), `capital chamber: Markets return period ${period} missing from ${marketState.returnPeriods.join(', ')}`);
    }
    assert(marketState.tableRows >= 20, `capital chamber: Markets should render at least 20 committed ticker rows, saw ${marketState.tableRows}`);
    assert(marketState.qualityWarnings > 0 && /quality|quarantin|stale|anomal/i.test(marketState.text), `capital chamber: venue quality warnings missing ${JSON.stringify(marketState)}`);
    assert(marketState.directTradeLinks === 0, `capital chamber: direct trading links must not be present, saw ${marketState.directTradeLinks}`);
    assert(JSON.stringify(marketState.rangeLabels) === JSON.stringify(['30D', '3M', '6M', '1Y']) && marketState.disabledRanges === 0, `capital chamber: Markets must expose only its four selectable ranges ${JSON.stringify(marketState)}`);
    assert(marketState.featuredPriceCharts === 1 && marketState.pricePanelWide && marketState.priceSummaryItems === 8 && /XTZ USD 30D daily close history/i.test(marketState.priceChartLabel) && marketState.priceChartPath.length > 80, `capital chamber: Markets full-width historical price chart is incomplete ${JSON.stringify(marketState)}`);
    assert(/centralized-exchange net flows|CEX net flows/i.test(marketState.text) && /unavailable|not calculated|not-calculated/i.test(marketState.text), `capital chamber: explicit CEX-flow unavailable receipt missing ${marketState.text}`);
    assert(marketState.sourceReceipts > 0, 'capital chamber: Markets source receipts missing');

    const assetsTab = page.locator('#capital-modal .capital-tab').filter({ hasText: /Assets/i });
    await assetsTab.click();
    const assetState = await page.evaluate(() => {
      const panel = document.querySelector('#capital-modal [role="tabpanel"]:not([hidden]), #capital-modal .capital-view-shell');
      return {
        text: panel?.textContent?.replace(/\s+/g, ' ').trim() || '',
        rangeControls: panel?.querySelectorAll('.capital-range, .capital-range-static').length || 0,
        fullContract: Array.from(panel?.querySelectorAll('[title]') || []).map((node) => node.getAttribute('title') || '').find((value) => /^0x79052/i.test(value)) || '',
        tableRows: panel?.querySelectorAll('.capital-table tbody tr').length || 0,
        sourceReceipts: panel?.querySelectorAll('.capital-source-receipt').length || 0
      };
    });
    assert(assetState.tableRows >= 10 && /protocol/i.test(assetState.text) && /token|asset/i.test(assetState.text), `capital chamber: Assets protocol/token rows missing ${JSON.stringify(assetState)}`);
    assert(/xU3O8/i.test(assetState.text) && assetState.fullContract.toLowerCase() === '0x79052ab3c166d4899a1e0dd033ac3b379af0b1fd' && /Uranium\.io/i.test(assetState.text), `capital chamber: xU3O8 proofbook receipt missing ${JSON.stringify(assetState)}`);
    assert(/SRUUF/i.test(assetState.text) && /unavailable|not calculated|not-calculated/i.test(assetState.text), `capital chamber: licensed SRUUF unavailable receipt missing ${assetState.text}`);
    assert(assetState.sourceReceipts > 0, 'capital chamber: Assets source receipts missing');
    assert(assetState.rangeControls === 0, `capital chamber: Assets should not expose a chart range ${JSON.stringify(assetState)}`);

    const artTab = page.locator('#capital-modal .capital-tab').filter({ hasText: /Art/i });
    await artTab.click();
    const artState = await page.evaluate(() => {
      const panel = document.querySelector('#capital-modal [role="tabpanel"]:not([hidden]), #capital-modal .capital-view-shell');
      return {
        text: panel?.textContent?.replace(/\s+/g, ' ').trim() || '',
        rangeButtons: panel?.querySelectorAll('.capital-range-btn').length || 0,
        rangeWindow: panel?.querySelector('.capital-range-static')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        tableRows: panel?.querySelectorAll('.capital-table tbody tr').length || 0,
        sourceReceipts: panel?.querySelectorAll('.capital-source-receipt').length || 0
      };
    });
    assert(artState.tableRows >= 8 && /marketplace/i.test(artState.text) && /collection/i.test(artState.text) && /buyer/i.test(artState.text) && /artist/i.test(artState.text), `capital chamber: Art marketplace/collection/buyer/artist data missing ${JSON.stringify(artState)}`);
    assert(/gross sales/i.test(artState.text) && /not creator earnings|not.*trader profit/i.test(artState.text), `capital chamber: Art gross-not-net methodology copy missing ${artState.text}`);
    assert(artState.rangeButtons === 0 && artState.rangeWindow === '30D source window', `capital chamber: Art must show a fixed source window instead of dead range buttons ${JSON.stringify(artState)}`);
    assert(artState.sourceReceipts > 0, 'capital chamber: Art source receipts missing');

    await marketsTab.click();
    await page.waitForFunction(() => typeof window.__capitalSmokeTimerTick === 'function', null, { timeout: 3000 });
    const snapshotsBeforeUnchangedTick = capitalSnapshotRequests;
    const entriesBeforeUnchangedTick = capitalEntryRequests;
    await page.evaluate(() => window.__capitalSmokeTimerTick());
    const unchangedDeadline = Date.now() + 3000;
    while (capitalEntryRequests <= entriesBeforeUnchangedTick && Date.now() < unchangedDeadline) await page.waitForTimeout(25);
    await page.waitForTimeout(75);
    assert(capitalEntryRequests === entriesBeforeUnchangedTick + 1 && capitalSnapshotRequests === snapshotsBeforeUnchangedTick,
      `capital chamber: unchanged summary should not redownload the full snapshot ${JSON.stringify({ entriesBeforeUnchangedTick, capitalEntryRequests, snapshotsBeforeUnchangedTick, capitalSnapshotRequests })}`);
    const quietBefore = await page.evaluate(() => {
      const modal = document.querySelector('#capital-modal');
      const body = modal.querySelector('#capital-chamber-body');
      const panel = modal.querySelector('[role="tabpanel"]:not([hidden]), .capital-view-shell');
      const header = body.querySelector('.capital-header');
      const focus = modal.querySelector('.capital-tab[aria-selected="true"]');
      const textNode = Array.from(panel.querySelectorAll('td, .capital-kpi-note, p'))
        .map((node) => Array.from(node.childNodes).find((child) => child.nodeType === Node.TEXT_NODE && child.textContent.trim().length >= 8))
        .find(Boolean);
      body.closest('.chamber-room-scroll').scrollTop = Math.min(260, Math.max(0, body.closest('.chamber-room-scroll').scrollHeight - body.closest('.chamber-room-scroll').clientHeight));
      focus.focus({ preventScroll: true });
      const selection = document.getSelection();
      selection.removeAllRanges();
      const range = document.createRange();
      range.setStart(textNode, 0);
      range.setEnd(textNode, Math.min(8, textNode.textContent.length));
      selection.addRange(range);
      window.__capitalQuietHeader = header;
      window.__capitalQuietPanel = panel;
      window.__capitalQuietFocus = focus;
      window.__capitalQuietSelection = selection.toString();
      return {
        top: body.closest('.chamber-room-scroll').scrollTop,
        selected: focus.textContent?.replace(/\s+/g, ' ').trim() || '',
        selection: selection.toString()
      };
    });
    assert(quietBefore.top > 0 && quietBefore.selection.length > 0, `capital chamber: quiet-refresh fixture must exercise room scroll and a real text selection ${JSON.stringify(quietBefore)}`);
    capitalRevision = 1;
    await page.evaluate(() => window.__capitalSmokeTimerTick());
    await page.waitForFunction(() => document.querySelector('#capital-chamber-body')?.dataset.quietRefreshSettled === 'true', null, { timeout: 6000 });
    await page.waitForTimeout(80);
    const quietAfter = await page.evaluate(() => {
      const modal = document.querySelector('#capital-modal');
      const body = modal.querySelector('#capital-chamber-body');
      const panel = modal.querySelector('[role="tabpanel"]:not([hidden]), .capital-view-shell');
      const header = body.querySelector('.capital-header');
      const headerStyle = getComputedStyle(header);
      return {
        sameHeader: header === window.__capitalQuietHeader,
        samePanel: panel === window.__capitalQuietPanel,
        focused: document.activeElement === window.__capitalQuietFocus,
        selected: modal.querySelector('.capital-tab[aria-selected="true"]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        selection: document.getSelection()?.toString() || '',
        top: body.closest('.chamber-room-scroll').scrollTop,
        settled: body.dataset.quietRefreshSettled === 'true',
        animation: headerStyle.animationName,
        opacity: headerStyle.opacity,
        transform: headerStyle.transform
      };
    });
    assert(quietAfter.sameHeader && quietAfter.samePanel && quietAfter.focused, `capital chamber: timed refresh replaced keyed/focused nodes ${JSON.stringify({ quietBefore, quietAfter })}`);
    assert(/Markets/i.test(quietAfter.selected) && quietAfter.selection === quietBefore.selection, `capital chamber: timed refresh lost view or text selection ${JSON.stringify({ quietBefore, quietAfter })}`);
    assert(Math.abs(quietAfter.top - quietBefore.top) < 1, `capital chamber: timed refresh reset chamber scroll ${JSON.stringify({ quietBefore, quietAfter })}`);
    assert(quietAfter.settled && quietAfter.animation === 'none' && quietAfter.opacity === '1' && quietAfter.transform === 'none', `capital chamber: timed refresh replayed or trapped an entrance animation ${JSON.stringify(quietAfter)}`);

    await page.evaluate(() => {
      const body = document.querySelector('#capital-chamber-body');
      window.__capitalReaderScrollResult = null;
      const observer = new MutationObserver((records) => {
        if (!records.some((record) => record.attributeName === 'data-quiet-refresh-settled')) return;
        observer.disconnect();
        const max = Math.max(0, body.closest('.chamber-room-scroll').scrollHeight - body.closest('.chamber-room-scroll').clientHeight);
        const before = body.closest('.chamber-room-scroll').scrollTop;
        const target = Math.max(0, Math.min(max, before + (before < max ? 37 : -37)));
        body.closest('.chamber-room-scroll').scrollTop = target;
        requestAnimationFrame(() => requestAnimationFrame(() => {
          window.__capitalReaderScrollResult = { before, target, actual: body.closest('.chamber-room-scroll').scrollTop };
        }));
      });
      observer.observe(body, { attributes: true, attributeFilter: ['data-quiet-refresh-settled'] });
    });
    capitalRevision = 2;
    await page.evaluate(() => window.__capitalSmokeTimerTick());
    await page.waitForFunction(() => window.__capitalReaderScrollResult !== null, null, { timeout: 5000 });
    const userScroll = await page.evaluate(() => window.__capitalReaderScrollResult);
    assert(userScroll.target !== userScroll.before && Math.abs(userScroll.actual - userScroll.target) < 1, `capital chamber: delayed quiet restore overwrote a reader scroll made immediately after reconciliation ${JSON.stringify(userScroll)}`);

    await page.locator('#capital-modal.active .chamber-close').click();
    await page.waitForFunction(() => !document.querySelector('#capital-modal')?.classList.contains('active'), null, { timeout: 5000 });
    assert(await page.evaluate(() => location.hash !== '#capital'), 'capital chamber: close must remove the root hash route');

    const directResponse = await page.goto(`${baseUrl}/capital/?view=markets`, { waitUntil: 'domcontentloaded' });
    assert(directResponse?.ok(), `capital chamber: direct Markets route failed with HTTP ${directResponse?.status()}`);
    await page.locator('#capital-modal.active .capital-content').waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForFunction(() => /Markets/i.test(document.querySelector('#capital-modal .capital-tab[aria-selected="true"]')?.textContent || ''), null, { timeout: 5000 });
    const directState = await page.evaluate(() => ({
      pathname: location.pathname,
      search: location.search,
      hash: location.hash,
      selected: document.querySelector('#capital-modal .capital-tab[aria-selected="true"]')?.textContent?.replace(/\s+/g, ' ').trim() || ''
    }));
    assert(directState.pathname === '/capital/' && directState.search === '?view=markets' && directState.hash === '' && /Markets/i.test(directState.selected), `capital chamber: direct view did not remain canonical ${JSON.stringify(directState)}`);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#capital-modal')?.classList.contains('active'), null, { timeout: 5000 });

    const feeRouteResponse = await page.goto(`${baseUrl}/capital/?view=system&focus=fees`, { waitUntil: 'domcontentloaded' });
    assert(feeRouteResponse?.ok(), `capital chamber: direct network-fees route failed with HTTP ${feeRouteResponse?.status()}`);
    await page.locator('#capital-modal.active #capital-network-costs').waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForFunction(() => (document.querySelector('#capital-chamber-body')?.closest('.chamber-room-scroll')?.scrollTop || 0) > 0, null, { timeout: 5000 });
    const feeRouteState = await page.evaluate(() => {
      const body = document.querySelector('#capital-chamber-body');
      const target = document.querySelector('#capital-network-costs');
      const bodyRect = body?.closest('.chamber-room-scroll')?.getBoundingClientRect();
      const targetRect = target?.getBoundingClientRect();
      return {
        pathname: location.pathname,
        search: location.search,
        selected: document.querySelector('#capital-modal .capital-tab[aria-selected="true"]')?.textContent?.trim() || '',
        bodyScrollTop: body?.closest('.chamber-room-scroll')?.scrollTop || 0,
        targetTop: targetRect && bodyRect ? targetRect.top - bodyRect.top : null,
        text: target?.textContent?.replace(/\s+/g, ' ').trim() || ''
      };
    });
    assert(feeRouteState.pathname === '/capital/' && feeRouteState.search === '?view=system&focus=fees' && /One System/i.test(feeRouteState.selected)
      && feeRouteState.bodyScrollTop > 0 && Number.isFinite(feeRouteState.targetTop) && feeRouteState.targetTop >= -1 && feeRouteState.targetTop < 260
      && /Fees by layer/i.test(feeRouteState.text), `capital chamber: direct network-fees route did not focus the sourced fee surface ${JSON.stringify(feeRouteState)}`);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#capital-modal')?.classList.contains('active'), null, { timeout: 5000 });

    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(mobileContext);
    await mobileContext.addInitScript(() => {
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    });
    const mobilePage = await mobileContext.newPage();
    attachIssueCollectors(mobilePage, 'capital chamber mobile', issues);
    const mobileResponse = await mobilePage.goto(`${baseUrl}/capital/?view=art`, { waitUntil: 'domcontentloaded' });
    assert(mobileResponse?.ok(), `capital chamber mobile: direct Art route failed with HTTP ${mobileResponse?.status()}`);
    await mobilePage.locator('#capital-modal.active .capital-content').waitFor({ state: 'visible', timeout: 15000 });
    await mobilePage.waitForFunction(() => /Art/i.test(document.querySelector('#capital-modal .capital-tab[aria-selected="true"]')?.textContent || '')
      && /30D source window/i.test(document.querySelector('#capital-modal .capital-range-static')?.textContent || '')
      && document.querySelector('#capital-chamber-body')?.dataset.capitalRendered === '1', null, { timeout: 10000 });
    await mobilePage.waitForFunction(() => (
      document.querySelector('#capital-modal .capital-content')
        ?.getAnimations()
        .every((animation) => animation.playState === 'finished')
    ), null, { timeout: 2000 });
    const mobileState = await mobilePage.evaluate(() => {
      const modal = document.querySelector('#capital-modal .capital-content');
      const body = document.querySelector('#capital-chamber-body');
      const rect = modal?.getBoundingClientRect();
      return {
        modal: rect ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom } : null,
        tabsContained: Array.from(document.querySelectorAll('#capital-modal .capital-tab')).every((tab) => {
          const tabRect = tab.getBoundingClientRect();
          return tabRect.left >= -1 && tabRect.right <= innerWidth + 1;
        }),
        mainScroll: Boolean(body && body.closest('.chamber-room-scroll').scrollHeight > body.closest('.chamber-room-scroll').clientHeight),
        rangeButtons: document.querySelectorAll('#capital-modal .capital-range-btn').length,
        rangeWindow: document.querySelector('#capital-modal .capital-range-static')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        selected: document.querySelector('#capital-modal .capital-tab[aria-selected="true"]')?.textContent?.trim() || ''
      };
    });
    assert(mobileState.modal && mobileState.modal.left <= 1 && mobileState.modal.right >= 389
      && mobileState.modal.top <= 1 && mobileState.modal.bottom >= 843,
    `capital chamber mobile: room must fill the 390x844 viewport ${JSON.stringify(mobileState)}`);
    assert(mobileState.tabsContained && mobileState.mainScroll && mobileState.pageOverflow <= 1 && /Art/i.test(mobileState.selected)
      && mobileState.rangeButtons === 0 && mobileState.rangeWindow === '30D source window',
      `capital chamber mobile: tabs, room scroll, or overflow failed ${JSON.stringify(mobileState)}`);
    await mobileContext.close();

    await context.close();
    assert(issues.length === 0, `capital chamber browser issues:\n${issues.join('\n')}`);
    log('ok - Capital Chamber source, views, quality, quiet refresh, and direct-route smoke');
  }

  return { smokeCapitalChamber };
}
