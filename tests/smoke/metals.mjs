// Browser workflows owned by metals. Shared dependencies remain explicit.
import { assertMetalsHeadingWords } from '../lib/metals-heading-smoke.mjs';
export function createMetalsSmokeSuites({
  assert,
  assertNormalizedChamberShell,
  attachIssueCollectors,
  createHash,
  fulfillJson,
  installFeatureMocks,
  log,
  stableTestHash
}) {
  async function smokeMetalsChamber(browser, baseUrl) {
    const metalIds = ['XAU', 'XAG', 'XPT', 'XPD', 'XRH', 'XRU', 'XIR', 'XOS'];
    const metalNames = {
      XAU: 'Gold', XAG: 'Silver', XPT: 'Platinum', XPD: 'Palladium',
      XRH: 'Rhodium', XRU: 'Ruthenium', XIR: 'Iridium', XOS: 'Osmium'
    };
    const metalSymbols = {
      XAU: 'Au', XAG: 'Ag', XPT: 'Pt', XPD: 'Pd',
      XRH: 'Rh', XRU: 'Ru', XIR: 'Ir', XOS: 'Os'
    };
    const quoteBases = { XAU: 2400, XAG: 30, XPT: 1010, XPD: 950 };
    const annualValues = { XRH: 4600, XRU: 475, XIR: 5000 };
    const baseObservedMs = Date.now() - (4 * 60 * 1000);
    const historyFor = (base) => Array.from({ length: 24 }, (_, index) => {
      const period = new Date(Date.UTC(2024 + Math.floor(index / 12), index % 12, 1)).toISOString();
      const value = Number((base * (0.88 + (index * 0.011))).toFixed(3));
      return {
        period,
        priceUsdPerTroyOunce: value,
        monthOverMonthPct: index ? 1.1 : null,
        yearOverYearPct: index >= 12 ? 14.9 : null
      };
    });
    const makeSnapshot = (revision = 0) => {
      const generatedAt = new Date(baseObservedMs + (revision * 1000)).toISOString();
      const metals = metalIds.map((id) => {
        const quoteBase = quoteBases[id];
        const annualValue = annualValues[id];
        return {
          id: metalNames[id].toLowerCase(),
          name: metalNames[id],
          symbol: metalSymbols[id],
          marketSymbol: quoteBase ? id : null,
          quote: quoteBase
            ? {
                status: 'ok',
                kind: 'indicative-current',
                marketSymbol: id,
                priceUsdPerTroyOunce: quoteBase + revision,
                change24hPct: 1.25 + (revision * 0.01),
                observedAt: generatedAt,
                sourceKey: 'goldApi',
                methodology: 'Public indicative observation.',
                limitations: 'Not a benchmark, dealer quote, or executable price.'
              }
            : {
                status: 'unavailable',
                kind: 'unavailable',
                priceUsdPerTroyOunce: null,
                observedAt: null,
                sourceKey: 'availabilityReceipt',
                limitations: 'No comparable current public quote included.'
              },
          annualContext: annualValue
            ? {
                status: 'dated',
                referencePriceUsdPerTroyOunce: annualValue,
                period: '2025',
                sourceKey: 'usgs',
                note: 'Annual context only; not a current quote.'
              }
            : {
                status: 'unavailable',
                referencePriceUsdPerTroyOunce: null,
                period: '2025',
                sourceKey: 'usgs',
                note: 'No comparable public quotation.'
              }
        };
      });
      const sources = {
        goldApi: {
          label: 'Gold API', status: 'ok', observedAt: generatedAt, retrievedAt: generatedAt,
          checkedAt: generatedAt, url: 'https://api.gold-api.com/', note: 'Indicative public quartet.'
        },
        imfPcps: {
          label: 'IMF PCPS', status: 'ok', observedAt: '2025-12-01T00:00:00.000Z',
          retrievedAt: generatedAt, checkedAt: generatedAt, url: 'https://www.imf.org/en/research/commodity-prices',
          note: 'Completed-month averages, not live prices.'
        },
        usgs: {
          label: 'USGS', status: 'ok', observedAt: '2025-12-31T00:00:00.000Z',
          retrievedAt: generatedAt, checkedAt: generatedAt, url: 'https://www.usgs.gov/centers/national-minerals-information-center',
          note: 'Annual and specialist PGM context.'
        },
        blockscoutVnxau: {
          label: 'Etherlink Blockscout', status: 'ok', observedAt: generatedAt,
          retrievedAt: generatedAt, checkedAt: generatedAt, url: 'https://explorer.etherlink.com/',
          note: 'Indexed token state; not backing evidence.'
        },
        blockscoutContractsVnxau: {
          label: 'Etherlink Blockscout contract lineage', status: 'ok', observedAt: generatedAt,
          retrievedAt: generatedAt, checkedAt: generatedAt, url: 'https://explorer.etherlink.com/',
          note: 'Verified contract lineage; not backing evidence.'
        },
        vnx: {
          label: 'VNX issuer material', status: 'ok', reviewedAt: '2026-07-31T00:00:00.000Z',
          retrievedAt: generatedAt, checkedAt: generatedAt, url: 'https://vnx.li/',
          note: 'Issuer claims and dated procedures remain separate.'
        }
      };
      const unsigned = {
        schemaVersion: 1,
        kind: 'precious-metals-snapshot',
        generatedAt,
        taxonomy: {
          source: 'USGS',
          includedMetals: metalIds.map((id) => ({
            id: metalNames[id].toLowerCase(),
            name: metalNames[id],
            symbol: metalSymbols[id]
          })),
          includedSymbols: metalIds.map((id) => metalSymbols[id]),
          exclusions: [{ label: 'Adjacent commodities', note: 'Uranium and base metals are outside this eight-metal taxonomy.' }]
        },
        metals,
        marketHistory: {
          sourceKey: 'imfPcps',
          frequency: 'monthly',
          unit: 'USD per troy ounce',
          coverage: { start: '2024-01-01T00:00:00.000Z', end: '2025-12-01T00:00:00.000Z' },
          series: Object.fromEntries(Object.entries(quoteBases).map(([id, base]) => [id, {
            seriesId: `TEST-${id}`,
            rows: historyFor(base)
          }]))
        },
        vnxau: {
          identity: { name: 'VNX Gold', unit: 'Issuer describes one token as one gram of gold.' },
          market: { status: 'ok', priceUsd: 79.25 + revision, change24hPct: 0.4, observedAt: generatedAt },
          etherlink: {
            contract: '0x93f5475da60143c50e8be3fed10c143b0cf8b9e9',
            totalSupplyTokens: 31394.96579,
            holderAddresses: 110,
            transferCount: 11382,
            observedAt: generatedAt,
            status: 'ok'
          },
          tezosHistorical: {
            contract: 'KT1LSH97386CURN9FgRNqdQJoHaHY6e1vxUv',
            status: 'historical',
            totalSupply: 0,
            ledgerKeys: 0,
            lastActivityAt: '2026-03-15T00:00:00.000Z',
            note: 'Deployed metadata contract; no issued supply or ledger keys observed.'
          },
          issuer: { statement: 'Issuer-described one-gram representation.' },
          boundaries: [
            { label: 'Procedure scope', note: 'The dated procedures exclude Tezos and Etherlink.' },
            { label: 'Execution boundary', note: 'No present redemption or venue execution claim is made.' }
          ]
        },
        sources,
        methodology: {
          exclusions: [{ label: 'Backing ratio', note: 'Not calculated because the dated procedure scope excludes these chains.' }]
        }
      };
      return { ...unsigned, contentHash: stableTestHash(unsigned) };
    };
    const makeStaleSnapshot = () => {
      const staleObservedAt = '2020-01-02T03:04:05.000Z';
      const draft = JSON.parse(JSON.stringify(makeSnapshot(0)));
      for (const row of draft.metals) {
        if (!['silver', 'platinum', 'palladium'].includes(row.id)) continue;
        row.quote.status = 'stale';
        row.quote.kind = 'stale-indicative-observation';
        row.quote.observedAt = staleObservedAt;
      }
      draft.vnxau.market.status = 'stale';
      draft.vnxau.market.observedAt = staleObservedAt;
      const { contentHash: _contentHash, ...unsigned } = draft;
      return { ...unsigned, contentHash: stableTestHash(unsigned) };
    };
    const makeIndependentStaleLauncherSnapshot = (revision = 12) => {
      const staleObservedAt = '2020-02-03T04:05:06.000Z';
      const draft = JSON.parse(JSON.stringify(makeSnapshot(revision)));
      draft.marketHistory.status = 'stale';
      draft.sources.imfPcps = {
        ...draft.sources.imfPcps,
        status: 'stale',
        observedAt: staleObservedAt,
        retrievedAt: staleObservedAt,
        checkedAt: staleObservedAt,
        note: 'Retained completed-month rows; compact history refresh failed independently.'
      };
      draft.vnxau.etherlink = {
        ...draft.vnxau.etherlink,
        status: 'stale',
        observedAt: staleObservedAt
      };
      const staleBlockscoutReceipt = {
        label: 'Etherlink Blockscout',
        status: 'stale',
        observedAt: staleObservedAt,
        retrievedAt: staleObservedAt,
        checkedAt: staleObservedAt,
        url: 'https://explorer.etherlink.com/',
        note: 'Retained holder count; compact chain refresh failed independently.'
      };
      draft.sources.etherlink = { ...draft.sources.etherlink, ...staleBlockscoutReceipt };
      draft.sources.blockscoutVnxau = staleBlockscoutReceipt;
      draft.sources.blockscoutContractsVnxau = staleBlockscoutReceipt;
      const { contentHash: _contentHash, ...unsigned } = draft;
      return { ...unsigned, contentHash: stableTestHash(unsigned) };
    };
    const initialSnapshot = makeSnapshot(0);
    const makeEntry = (snapshot, sourceText) => {
      const unsigned = {
        schemaVersion: 1,
        kind: 'metals-entry-summary',
        generatedAt: snapshot.generatedAt,
        source: {
          schemaVersion: snapshot.schemaVersion,
          path: 'data/metals-snapshot.json',
          generatedAt: snapshot.generatedAt,
          contentHash: snapshot.contentHash,
          fileSha256: createHash('sha256').update(sourceText).digest('hex')
        },
        metals: snapshot.metals,
        marketHistory: snapshot.marketHistory,
        vnxau: snapshot.vnxau,
        sourceStatuses: snapshot.sources
      };
      return { ...unsigned, contentHash: stableTestHash(unsigned) };
    };
    const makeMetalsPair = (snapshot) => {
      const snapshotText = JSON.stringify(snapshot);
      return { snapshot, snapshotText, entry: makeEntry(snapshot, snapshotText) };
    };
    const initialPair = makeMetalsPair(initialSnapshot);
    const entryFixture = initialPair.entry;
    let currentMetalsPair = initialPair;
    let entryRequests = 0;
    let snapshotRequests = 0;
    let failNextSnapshot = false;
    let holdNextSnapshot = false;
    let releaseHeldSnapshot = null;
    const installArtifactRoutes = async (context) => {
      await context.route('**/data/metals-entry-summary.json*', async (route) => {
        entryRequests += 1;
        return fulfillJson(route, JSON.parse(JSON.stringify(currentMetalsPair.entry)));
      });
      await context.route('**/data/metals-snapshot.json*', async (route) => {
        snapshotRequests += 1;
        if (failNextSnapshot) {
          failNextSnapshot = false;
          return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'forced Metals refresh failure' }) });
        }
        const pair = currentMetalsPair;
        if (holdNextSnapshot) {
          holdNextSnapshot = false;
          await new Promise((resolve) => { releaseHeldSnapshot = resolve; });
          releaseHeldSnapshot = null;
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: pair.snapshotText });
      });
    };
    const installMetalsState = async (context) => {
      await context.addInitScript(() => {
        localStorage.setItem('tezos-systems-theme', 'matrix');
        localStorage.setItem('tezos-toured', '1');
        localStorage.setItem('tezos-welcomed', '1');
        localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
        window.__METALS_CHAMBER_REFRESH_MS__ = 123457;
        window.__metalsSmokeVisibility = 'visible';
        const nativeSetInterval = window.setInterval.bind(window);
        window.setInterval = (callback, delay, ...args) => {
          const timer = nativeSetInterval(callback, delay, ...args);
          if (Number(delay) === window.__METALS_CHAMBER_REFRESH_MS__) {
            window.__metalsSmokeTimerTick = () => callback(...args);
          }
          return timer;
        };
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          get: () => window.__metalsSmokeVisibility
        });
      });
    };

    const issues = [];
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
    await installFeatureMocks(context);
    await installArtifactRoutes(context);
    await installMetalsState(context);
    const page = await context.newPage();
    attachIssueCollectors(page, 'metals chamber', issues);

    const launcherResponse = await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    assert(launcherResponse?.ok(), `metals chamber: dashboard launcher failed with HTTP ${launcherResponse?.status()}`);
    await page.locator('#chambers-grid > .chamber-category[data-chamber-category="capital"] .chamber-category-toggle').click();
    await page.locator('#metals-entry-card').dispatchEvent('pointerenter');
    await page.waitForFunction(() => document.querySelector('#metals-entry-front')?.dataset.metalsRendered === '1', null, { timeout: 10000 });
    const compactState = await page.evaluate(() => ({
      modalOpen: document.querySelector('#metals-modal')?.classList.contains('active') || false,
      rendered: document.querySelector('#metals-entry-front')?.dataset.metalsRendered || '',
      title: document.querySelector('#metals-entry-title')?.textContent?.trim() || '',
      coverage: document.querySelector('#metals-entry-front .metals-entry-kpis')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      fullResources: performance.getEntriesByType('resource').filter(({ name }) => name.includes('/data/metals-snapshot.json')).length
    }));
    assert(!compactState.modalOpen && compactState.rendered === '1' && compactState.title === 'Precious Metals'
      && /Current quotes.*4 \/ 8/i.test(compactState.coverage)
      && /VNXAU current holder addresses.*110/i.test(compactState.coverage)
      && compactState.fullResources === 0 && entryRequests >= 1 && snapshotRequests === 0,
    `metals chamber: compact projection did not stay independent of the full room ${JSON.stringify({ compactState, entryRequests, snapshotRequests })}`);

    await page.locator('#metals-entry-card .chamber-expand-cue').click();
    await page.locator('#metals-modal.active .metals-content').waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForFunction(() => document.querySelector('#metals-chamber-body')?.dataset.metalsRendered === '1', null, { timeout: 10000 });
    await assertMetalsHeadingWords(page);
    assert(snapshotRequests === 1, `metals chamber: explicit open did not fetch exactly one full snapshot ${snapshotRequests}`);

    const shell = await page.evaluate(() => {
      const modal = document.querySelector('#metals-modal');
      const dialog = modal?.querySelector('.metals-content');
      const tabs = Array.from(modal?.querySelectorAll('[role="tab"][data-metals-view]') || []);
      const panel = modal?.querySelector('#metals-view-panel');
      return {
        role: dialog?.getAttribute('role') || '',
        modal: dialog?.getAttribute('aria-modal') || '',
        labelledBy: dialog?.getAttribute('aria-labelledby') || '',
        focusInside: Boolean(dialog?.contains(document.activeElement)),
        tablist: modal?.querySelector('.metals-tabs')?.getAttribute('role') || '',
        views: tabs.map((tab) => tab.dataset.metalsView),
        selected: tabs.filter((tab) => tab.getAttribute('aria-selected') === 'true').map((tab) => tab.dataset.metalsView),
        panelRole: panel?.getAttribute('role') || '',
        panelLabelledBy: panel?.getAttribute('aria-labelledby') || '',
        assayCards: panel?.querySelectorAll('.metals-assay-card').length || 0,
        assayText: panel?.textContent?.replace(/\s+/g, ' ').trim() || ''
      };
    });
    assert(shell.role === 'dialog' && shell.modal === 'true' && shell.labelledBy === 'metals-title' && shell.focusInside
      && shell.tablist === 'tablist' && JSON.stringify(shell.views) === JSON.stringify(['assay', 'markets', 'vnxau', 'proofbook'])
      && JSON.stringify(shell.selected) === JSON.stringify(['assay']) && shell.panelRole === 'tabpanel'
      && shell.panelLabelledBy === 'metals-tab-assay' && shell.assayCards === 8
      && /Osmium.*Unavailable — not zero/i.test(shell.assayText),
    `metals chamber: dialog, tab, or complete assay semantics failed ${JSON.stringify(shell)}`);

    await page.locator('[data-metals-view="assay"]').focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => (
      document.querySelector('[data-metals-view="markets"]')?.getAttribute('aria-selected') === 'true'
        && document.activeElement === document.querySelector('[data-metals-view="markets"]')
    ), null, { timeout: 3000 });
    await page.locator('[data-metals-metal="XAG"]').click();
    const keyboardState = await page.evaluate(() => ({
      focusedView: document.activeElement?.dataset?.metalsView || '',
      focusedMetal: document.activeElement?.dataset?.metalsMetal || '',
      selectedView: document.querySelector('[data-metals-view][aria-selected="true"]')?.dataset.metalsView || '',
      selectedMetal: document.querySelector('[data-metals-metal][aria-pressed="true"]')?.dataset.metalsMetal || '',
      panelLabelledBy: document.querySelector('#metals-view-panel')?.getAttribute('aria-labelledby') || '',
      metalGroupRole: document.querySelector('.metals-metal-switch')?.getAttribute('role') || '',
      metalButtons: document.querySelectorAll('[data-metals-metal]').length,
      text: document.querySelector('#metals-view-content')?.textContent?.replace(/\s+/g, ' ').trim() || ''
    }));
    assert(keyboardState.selectedView === 'markets' && keyboardState.selectedMetal === 'XAG'
      && keyboardState.focusedMetal === 'XAG' && keyboardState.panelLabelledBy === 'metals-tab-markets'
      && keyboardState.metalGroupRole === 'group' && keyboardState.metalButtons === 4
      && /Indicative current.*Completed-month.*IMF PCPS/i.test(keyboardState.text)
      && /not an LBMA benchmark, dealer quote, or executable price/i.test(keyboardState.text),
    `metals chamber: keyboard tabs, metal filter, or source-clock boundary failed ${JSON.stringify(keyboardState)}`);

    for (const { view, key } of [{ view: 'vnxau', key: 'Enter' }, { view: 'proofbook', key: 'Space' }]) {
      await page.locator(`[data-metals-view="${view}"]`).focus();
      await page.evaluate((selectedView) => {
        window.__metalsNativeTabSource = document.querySelector(`[data-metals-view="${selectedView}"]`);
      }, view);
      await page.keyboard.press(key);
      await page.waitForFunction((selectedView) => {
        const selected = document.querySelector(`[data-metals-view="${selectedView}"]`);
        return selected?.getAttribute('aria-selected') === 'true' && document.activeElement === selected;
      }, view, { timeout: 3000 });
      const nativeActivation = await page.evaluate((selectedView) => {
        const selected = document.querySelector(`[data-metals-view="${selectedView}"]`);
        return {
          selected: selected?.getAttribute('aria-selected') || '',
          focused: document.activeElement === selected,
          replaced: selected !== window.__metalsNativeTabSource && !window.__metalsNativeTabSource?.isConnected,
          panelLabelledBy: document.querySelector('#metals-view-panel')?.getAttribute('aria-labelledby') || ''
        };
      }, view);
      assert(nativeActivation.selected === 'true' && nativeActivation.focused && nativeActivation.replaced
        && nativeActivation.panelLabelledBy === `metals-tab-${view}`,
      `metals chamber: native ${key} activation did not retain focus on the newly selected ${view} tab ${JSON.stringify(nativeActivation)}`);
    }

    const forbiddenInteractive = [];
    for (const view of ['assay', 'markets', 'vnxau', 'proofbook']) {
      await page.locator(`[data-metals-view="${view}"]`).click();
      const interactive = await page.evaluate(() => Array.from(
        document.querySelectorAll('#metals-modal a, #metals-modal button'),
        (node) => `${node.textContent?.replace(/\s+/g, ' ').trim() || node.getAttribute('aria-label') || ''} ${node.getAttribute('href') || ''}`.trim()
      ));
      forbiddenInteractive.push(...interactive.filter((label) => /\b(?:buy|sell|trade|swap|bridge|redeem|execute)\b/i.test(label)));
    }
    assert(forbiddenInteractive.length === 0,
      `metals chamber: execution CTA leaked into an interactive control ${JSON.stringify(forbiddenInteractive)}`);

    await page.locator('[data-metals-view="markets"]').click();
    await page.locator('[data-metals-metal="XAG"]').click();
    await page.waitForFunction(() => typeof window.__metalsSmokeTimerTick === 'function', null, { timeout: 3000 });
    const entriesBeforeUnchangedTick = entryRequests;
    const snapshotsBeforeUnchangedTick = snapshotRequests;
    await page.evaluate(() => window.__metalsSmokeTimerTick());
    const unchangedDeadline = Date.now() + 3000;
    while (entryRequests <= entriesBeforeUnchangedTick && Date.now() < unchangedDeadline) await page.waitForTimeout(25);
    await page.waitForTimeout(75);
    assert(entryRequests === entriesBeforeUnchangedTick + 1 && snapshotRequests === snapshotsBeforeUnchangedTick,
      `metals chamber: unchanged summary should not redownload the full snapshot ${JSON.stringify({ entriesBeforeUnchangedTick, entryRequests, snapshotsBeforeUnchangedTick, snapshotRequests })}`);
    const quietBefore = await page.evaluate(() => {
      const body = document.querySelector('#metals-chamber-body');
      const header = body?.querySelector('.metals-header');
      const panel = body?.querySelector('#metals-view-panel');
      const content = body?.querySelector('#metals-view-content');
      const focus = body?.querySelector('[data-metals-metal="XAG"]');
      const price = content?.querySelector('.metals-clock-pair article strong');
      const textNode = content?.querySelector('.metals-clock-pair article p')?.firstChild;
      if (!body || !header || !panel || !content || !focus || !price || !textNode) throw new Error('metals quiet-refresh fixture is incomplete');
      body.closest('.chamber-room-scroll').scrollTop = Math.min(280, Math.max(0, body.closest('.chamber-room-scroll').scrollHeight - body.closest('.chamber-room-scroll').clientHeight));
      focus.focus({ preventScroll: true });
      const selection = getSelection();
      selection.removeAllRanges();
      const range = document.createRange();
      range.setStart(textNode, 0);
      range.setEnd(textNode, Math.min(12, textNode.textContent.length));
      selection.addRange(range);
      delete body.dataset.quietRefreshSettled;
      window.__metalsQuietFixture = { body, header, panel, content, focus, price };
      return { top: body.closest('.chamber-room-scroll').scrollTop, selection: selection.toString(), price: price.textContent?.trim() || '' };
    });
    assert(quietBefore.top > 0 && quietBefore.selection.length > 0,
      `metals chamber: quiet-refresh fixture did not exercise room scroll and selection ${JSON.stringify(quietBefore)}`);

    await page.evaluate(() => {
      window.__metalsSmokeVisibility = 'hidden';
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const entriesBeforeHiddenTick = entryRequests;
    const requestsBeforeHiddenTick = snapshotRequests;
    await page.evaluate(() => window.__metalsSmokeTimerTick());
    await page.waitForTimeout(50);
    assert(entryRequests === entriesBeforeHiddenTick && snapshotRequests === requestsBeforeHiddenTick,
      `metals chamber: hidden timer polled a summary or full snapshot ${JSON.stringify({ entriesBeforeHiddenTick, entryRequests, requestsBeforeHiddenTick, snapshotRequests })}`);

    currentMetalsPair = makeMetalsPair(makeSnapshot(1));
    const entriesBeforeCatchup = entryRequests;
    await page.evaluate(() => {
      window.__metalsSmokeVisibility = 'visible';
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const catchupDeadline = Date.now() + 6000;
    while (snapshotRequests <= requestsBeforeHiddenTick && Date.now() < catchupDeadline) await page.waitForTimeout(25);
    assert(entryRequests === entriesBeforeCatchup + 1 && snapshotRequests === requestsBeforeHiddenTick + 1,
      `metals chamber: visibility return did not perform exactly one summary-gated catch-up ${JSON.stringify({ entriesBeforeCatchup, entryRequests, requestsBeforeHiddenTick, snapshotRequests })}`);
    await page.waitForFunction(() => {
      const body = document.querySelector('#metals-chamber-body');
      return body?.dataset.quietRefreshSettled === 'true' && !body.hasAttribute('data-quiet-refreshing');
    }, null, { timeout: 6000 });
    const quietAfter = await page.evaluate(() => {
      const saved = window.__metalsQuietFixture;
      const body = document.querySelector('#metals-chamber-body');
      const header = body?.querySelector('.metals-header');
      const panel = body?.querySelector('#metals-view-panel');
      const content = body?.querySelector('#metals-view-content');
      const focus = body?.querySelector('[data-metals-metal="XAG"]');
      const price = content?.querySelector('.metals-clock-pair article strong');
      const style = header ? getComputedStyle(header) : null;
      return {
        sameBody: body === saved?.body,
        sameHeader: header === saved?.header,
        samePanel: panel === saved?.panel,
        sameContent: content === saved?.content,
        sameFocus: focus === saved?.focus,
        focused: document.activeElement === saved?.focus,
        selectedView: document.querySelector('[data-metals-view][aria-selected="true"]')?.dataset.metalsView || '',
        selectedMetal: document.querySelector('[data-metals-metal][aria-pressed="true"]')?.dataset.metalsMetal || '',
        top: body?.closest('.chamber-room-scroll')?.scrollTop || 0,
        selection: getSelection()?.toString() || '',
        price: price?.textContent?.trim() || '',
        settled: body?.dataset.quietRefreshSettled === 'true' && !body?.dataset.quietRefreshing,
        opacity: style?.opacity || '',
        transform: style?.transform || ''
      };
    });
    assert(quietAfter.sameBody && quietAfter.sameHeader && quietAfter.samePanel && quietAfter.sameContent
      && quietAfter.sameFocus && quietAfter.focused && quietAfter.selectedView === 'markets' && quietAfter.selectedMetal === 'XAG',
    `metals chamber: quiet catch-up replaced keyed or focused reading nodes ${JSON.stringify({ quietBefore, quietAfter })}`);
    assert(Math.abs(quietAfter.top - quietBefore.top) < 1 && quietAfter.selection === quietBefore.selection
      && quietAfter.price !== quietBefore.price,
    `metals chamber: quiet catch-up lost scroll/selection or failed to reconcile new data ${JSON.stringify({ quietBefore, quietAfter })}`);
    assert(quietAfter.settled && quietAfter.opacity === '1' && quietAfter.transform === 'none',
      `metals chamber: quiet catch-up replayed or stranded visual state ${JSON.stringify(quietAfter)}`);

    const delayedBefore = await page.evaluate(() => {
      const body = document.querySelector('#metals-chamber-body');
      const content = document.querySelector('#metals-view-content');
      const entry = document.querySelector('#metals-entry-front');
      const price = content?.querySelector('.metals-clock-pair article strong');
      const entryValue = entry?.querySelector('.metals-entry-value');
      if (!body || !content || !entry || !price || !entryValue) throw new Error('metals delayed-response fixture is incomplete');
      delete body.dataset.quietRefreshSettled;
      const fixture = {
        body,
        content,
        entry,
        price,
        entryValue,
        baselinePrice: price.textContent?.trim() || '',
        baselineEntryValue: entryValue.textContent?.trim() || '',
        mutations: 0
      };
      const observer = new MutationObserver((records) => { fixture.mutations += records.length; });
      observer.observe(body, { childList: true, characterData: true, subtree: true });
      observer.observe(entry, { childList: true, characterData: true, subtree: true });
      fixture.observer = observer;
      window.__metalsHiddenCompletionFixture = fixture;
      return {
        price: price.textContent?.trim() || '',
        entryValue: entryValue.textContent?.trim() || ''
      };
    });
    currentMetalsPair = makeMetalsPair(makeSnapshot(2));
    holdNextSnapshot = true;
    const requestsBeforeHeldResponse = snapshotRequests;
    await page.evaluate(() => window.__metalsSmokeTimerTick());
    const heldStartDeadline = Date.now() + 6000;
    while ((!releaseHeldSnapshot || snapshotRequests !== requestsBeforeHeldResponse + 1) && Date.now() < heldStartDeadline) {
      await page.waitForTimeout(25);
    }
    assert(typeof releaseHeldSnapshot === 'function' && snapshotRequests === requestsBeforeHeldResponse + 1,
      `metals chamber: delayed visible refresh did not reach the controlled response gate ${JSON.stringify({ requestsBeforeHeldResponse, snapshotRequests })}`);
    await page.evaluate(() => {
      window.__metalsSmokeVisibility = 'hidden';
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const heldResponse = page.waitForResponse((response) => (
      response.url().includes('/data/metals-snapshot.json') && response.status() === 200
    ), { timeout: 6000 });
    releaseHeldSnapshot();
    await heldResponse;
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const hiddenCompletion = await page.evaluate(() => {
      const saved = window.__metalsHiddenCompletionFixture;
      const body = document.querySelector('#metals-chamber-body');
      const content = document.querySelector('#metals-view-content');
      const entry = document.querySelector('#metals-entry-front');
      return {
        mutations: saved?.mutations ?? -1,
        sameBody: body === saved?.body,
        sameContent: content === saved?.content,
        sameEntry: entry === saved?.entry,
        price: content?.querySelector('.metals-clock-pair article strong')?.textContent?.trim() || '',
        entryValue: entry?.querySelector('.metals-entry-value')?.textContent?.trim() || '',
        settled: body?.dataset.quietRefreshSettled || '',
        view: document.querySelector('[data-metals-view][aria-selected="true"]')?.dataset.metalsView || '',
        metal: document.querySelector('[data-metals-metal][aria-pressed="true"]')?.dataset.metalsMetal || ''
      };
    });
    assert(hiddenCompletion.mutations === 0 && hiddenCompletion.sameBody && hiddenCompletion.sameContent
      && hiddenCompletion.sameEntry && hiddenCompletion.price === delayedBefore.price
      && hiddenCompletion.entryValue === delayedBefore.entryValue && !hiddenCompletion.settled
      && hiddenCompletion.view === 'markets' && hiddenCompletion.metal === 'XAG',
    `metals chamber: response completed while hidden reconciled into the reading surface ${JSON.stringify({ delayedBefore, hiddenCompletion })}`);

    const requestsBeforeDelayedCatchup = snapshotRequests;
    await page.evaluate(() => {
      window.__metalsSmokeVisibility = 'visible';
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForFunction(() => {
      const body = document.querySelector('#metals-chamber-body');
      const price = document.querySelector('#metals-view-content .metals-clock-pair article strong')?.textContent?.trim() || '';
      return body?.dataset.quietRefreshSettled === 'true'
        && !body.hasAttribute('data-quiet-refreshing')
        && price !== window.__metalsHiddenCompletionFixture?.baselinePrice;
    }, null, { timeout: 6000 });
    assert(snapshotRequests === requestsBeforeDelayedCatchup,
      `metals chamber: the visible catch-up must reuse the exact verified hidden completion, not download it again ${JSON.stringify({ requestsBeforeDelayedCatchup, snapshotRequests })}`);
    const delayedCatchup = await page.evaluate(() => {
      const saved = window.__metalsHiddenCompletionFixture;
      const body = document.querySelector('#metals-chamber-body');
      const content = document.querySelector('#metals-view-content');
      const entry = document.querySelector('#metals-entry-front');
      const result = {
        mutations: saved?.mutations ?? 0,
        sameBody: body === saved?.body,
        sameContent: content === saved?.content,
        sameEntry: entry === saved?.entry,
        price: content?.querySelector('.metals-clock-pair article strong')?.textContent?.trim() || '',
        entryValue: entry?.querySelector('.metals-entry-value')?.textContent?.trim() || '',
        settled: body?.dataset.quietRefreshSettled === 'true' && !body?.dataset.quietRefreshing
      };
      saved?.observer?.disconnect();
      return result;
    });
    assert(delayedCatchup.mutations > 0 && delayedCatchup.sameBody && delayedCatchup.sameContent
      && delayedCatchup.sameEntry && delayedCatchup.price !== delayedBefore.price
      && delayedCatchup.entryValue !== delayedBefore.entryValue && delayedCatchup.settled,
    `metals chamber: visible catch-up did not quietly apply the response after hidden completion ${JSON.stringify({ delayedBefore, delayedCatchup })}`);

    currentMetalsPair = makeMetalsPair(makeSnapshot(3));
    failNextSnapshot = true;
    const requestsBeforeFailure = snapshotRequests;
    await page.evaluate(() => { window.__metalsSmokeTimerTick(); });
    const failureDeadline = Date.now() + 6000;
    while (snapshotRequests <= requestsBeforeFailure && Date.now() < failureDeadline) await page.waitForTimeout(25);
    await page.waitForFunction(() => /Last good .* refresh failed/i.test(document.querySelector('#metals-freshness')?.textContent || ''), null, { timeout: 6000 });
    const failureState = await page.evaluate(() => {
      const saved = window.__metalsQuietFixture;
      const body = document.querySelector('#metals-chamber-body');
      return {
        sameBody: body === saved?.body,
        focused: document.activeElement === saved?.focus,
        top: body?.closest('.chamber-room-scroll')?.scrollTop || 0,
        selectedView: document.querySelector('[data-metals-view][aria-selected="true"]')?.dataset.metalsView || '',
        selectedMetal: document.querySelector('[data-metals-metal][aria-pressed="true"]')?.dataset.metalsMetal || '',
        price: document.querySelector('#metals-view-content .metals-clock-pair article strong')?.textContent?.trim() || '',
        freshness: document.querySelector('#metals-freshness')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        errorSurface: Boolean(document.querySelector('#metals-chamber-body .metals-error')),
        rendered: body?.dataset.metalsRendered || ''
      };
    });
    assert(snapshotRequests === requestsBeforeFailure + 1 && failureState.sameBody && failureState.focused
      && Math.abs(failureState.top - quietBefore.top) < 1 && failureState.selectedView === 'markets'
      && failureState.selectedMetal === 'XAG' && failureState.price === delayedCatchup.price
      && /Last good .* refresh failed/i.test(failureState.freshness) && !failureState.errorSurface
      && failureState.rendered === '1',
    `metals chamber: failed refresh did not preserve and label the complete last-good room ${JSON.stringify({ requestsBeforeFailure, snapshotRequests, failureState })}`);

    const requestsBeforeRecovery = snapshotRequests;
    await page.evaluate(() => window.__metalsSmokeTimerTick());
    const recoveryDeadline = Date.now() + 6000;
    while (snapshotRequests <= requestsBeforeRecovery && Date.now() < recoveryDeadline) await page.waitForTimeout(25);
    await page.waitForFunction(() => !/refresh failed/i.test(document.querySelector('#metals-freshness')?.textContent || ''), null, { timeout: 6000 });
    assert(snapshotRequests === requestsBeforeRecovery + 1,
      `metals chamber: last-good failure did not recover on the next valid receipt ${JSON.stringify({ requestsBeforeRecovery, snapshotRequests })}`);
    await page.locator('[data-metals-view="proofbook"]').click();
    const proofbookBeforeFailure = await page.evaluate(() => ({
      selectedView: document.querySelector('[data-metals-view][aria-selected="true"]')?.dataset.metalsView || '',
      receiptBadge: document.querySelector('#metals-view-content .metals-panel-head > .metals-status')?.textContent?.replace(/\s+/g, ' ').trim() || ''
    }));
    assert(proofbookBeforeFailure.selectedView === 'proofbook'
      && /^generated\b/i.test(proofbookBeforeFailure.receiptBadge)
      && !/last-good retained/i.test(proofbookBeforeFailure.receiptBadge),
    `metals chamber: Proofbook did not begin with a current receipt badge ${JSON.stringify(proofbookBeforeFailure)}`);
    currentMetalsPair = makeMetalsPair(makeSnapshot(4));
    failNextSnapshot = true;
    const requestsBeforeProofbookFailure = snapshotRequests;
    await page.evaluate(() => window.__metalsSmokeTimerTick());
    const proofbookFailureDeadline = Date.now() + 6000;
    while (snapshotRequests <= requestsBeforeProofbookFailure && Date.now() < proofbookFailureDeadline) await page.waitForTimeout(25);
    await page.waitForFunction(() => /last-good retained/i.test(
      document.querySelector('#metals-view-content .metals-panel-head > .metals-status')?.textContent || ''
    ), null, { timeout: 6000 });
    const proofbookFailure = await page.evaluate(() => ({
      selectedView: document.querySelector('[data-metals-view][aria-selected="true"]')?.dataset.metalsView || '',
      receiptBadge: document.querySelector('#metals-view-content .metals-panel-head > .metals-status')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      freshness: document.querySelector('#metals-freshness')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      errorSurface: Boolean(document.querySelector('#metals-chamber-body .metals-error'))
    }));
    assert(snapshotRequests === requestsBeforeProofbookFailure + 1
      && proofbookFailure.selectedView === 'proofbook'
      && /last-good retained/i.test(proofbookFailure.receiptBadge)
      && /Last good .* refresh failed/i.test(proofbookFailure.freshness)
      && !proofbookFailure.errorSurface,
    `metals chamber: Proofbook receipt badge did not flip to retained last-good after refresh failure ${JSON.stringify({ requestsBeforeProofbookFailure, snapshotRequests, proofbookFailure })}`);

    const directResponse = await page.goto(`${baseUrl}/metals/?view=markets&metal=XAG`, { waitUntil: 'domcontentloaded' });
    assert(directResponse?.ok(), `metals chamber: direct query route failed with HTTP ${directResponse?.status()}`);
    await page.locator('#metals-modal.active .metals-content').waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForFunction(() => document.querySelector('#metals-chamber-body')?.dataset.metalsRendered === '1', null, { timeout: 10000 });
    const routeState = await page.evaluate(() => ({
      path: location.pathname,
      view: new URL(location.href).searchParams.get('view'),
      metal: new URL(location.href).searchParams.get('metal'),
      selectedView: document.querySelector('[data-metals-view][aria-selected="true"]')?.dataset.metalsView || '',
      selectedMetal: document.querySelector('[data-metals-metal][aria-pressed="true"]')?.dataset.metalsMetal || '',
      panelLabelledBy: document.querySelector('#metals-view-panel')?.getAttribute('aria-labelledby') || ''
    }));
    assert(routeState.path === '/metals/' && routeState.view === 'markets' && routeState.metal === 'XAG'
      && routeState.selectedView === 'markets' && routeState.selectedMetal === 'XAG'
      && routeState.panelLabelledBy === 'metals-tab-markets',
    `metals chamber: direct route did not restore its view and selected metal ${JSON.stringify(routeState)}`);
    await page.locator('[data-metals-metal="XPD"]').click();
    const updatedRoute = await page.evaluate(() => ({
      metal: new URL(location.href).searchParams.get('metal'),
      selected: document.querySelector('[data-metals-metal][aria-pressed="true"]')?.dataset.metalsMetal || ''
    }));
    assert(updatedRoute.metal === 'XPD' && updatedRoute.selected === 'XPD',
      `metals chamber: metal filter did not update the bookmarkable route ${JSON.stringify(updatedRoute)}`);
    await context.close();

    const unexpectedIssues = issues.filter((issue) => (
      !/Metals snapshot refresh failed:.*Metals snapshot HTTP 503/i.test(issue)
        && !/Failed to load resource:.*status of 503.*\/data\/metals-snapshot\.json/i.test(issue)
    ));
    assert(unexpectedIssues.length === 0, `metals chamber browser issues:\n${unexpectedIssues.join('\n')}`);

    {
      const coldIssues = [];
      let coldEntryRequests = 0;
      let coldSnapshotRequests = 0;
      const coldContext = await browser.newContext({ viewport: { width: 960, height: 720 }, serviceWorkers: 'block' });
      await installFeatureMocks(coldContext);
      await installMetalsState(coldContext);
      await coldContext.route('**/data/metals-entry-summary.json*', async (route) => {
        coldEntryRequests += 1;
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'forced cold entry failure' }) });
      });
      await coldContext.route('**/data/metals-snapshot.json*', async (route) => {
        coldSnapshotRequests += 1;
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'forced cold snapshot failure' }) });
      });
      const coldPage = await coldContext.newPage();
      attachIssueCollectors(coldPage, 'metals chamber cold failure', coldIssues);
      const coldResponse = await coldPage.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
      assert(coldResponse?.ok(), `metals chamber cold failure: dashboard failed with HTTP ${coldResponse?.status()}`);
      await coldPage.locator('#chambers-grid > .chamber-category[data-chamber-category="capital"] .chamber-category-toggle').click();
      await coldPage.locator('#metals-entry-card').dispatchEvent('pointerenter');
      await coldPage.waitForFunction(() => {
        const text = document.querySelector('#metals-entry-front')?.textContent?.replace(/\s+/g, ' ').trim() || '';
        return /unavailable/i.test(text) && !/Verifying/i.test(text);
      }, null, { timeout: 10000 });
      const unavailableLauncher = await coldPage.evaluate(() => {
        const front = document.querySelector('#metals-entry-front');
        return {
          text: front?.textContent?.replace(/\s+/g, ' ').trim() || '',
          rendered: front?.dataset.metalsRendered || '',
          interactive: Boolean(document.querySelector('#metals-entry-card .chamber-expand-cue')),
          modalOpen: document.querySelector('#metals-modal')?.classList.contains('active') || false
        };
      });
      assert(/unavailable/i.test(unavailableLauncher.text) && !/Verifying/i.test(unavailableLauncher.text)
        && unavailableLauncher.interactive && !unavailableLauncher.modalOpen
        && coldEntryRequests >= 1 && coldSnapshotRequests === 0,
      `metals chamber cold failure: compact failure fetched the full room or remained in verification ${JSON.stringify({ unavailableLauncher, coldEntryRequests, coldSnapshotRequests })}`);
      await coldPage.locator('#metals-entry-card .chamber-expand-cue').click();
      await coldPage.locator('#metals-modal.active .metals-content').waitFor({ state: 'visible', timeout: 10000 });
      await coldPage.locator('#metals-chamber-body [role="alert"]').waitFor({ state: 'visible', timeout: 10000 });
      const coldRoom = await coldPage.evaluate(() => {
        const alert = document.querySelector('#metals-chamber-body [role="alert"]');
        return {
          role: alert?.getAttribute('role') || '',
          text: alert?.textContent?.replace(/\s+/g, ' ').trim() || '',
          retry: Boolean(alert?.querySelector('[data-metals-retry]')),
          loading: Boolean(document.querySelector('#metals-chamber-body .metals-loading'))
        };
      });
      assert(coldEntryRequests >= 1 && coldSnapshotRequests === 1
        && coldRoom.role === 'alert' && /snapshot unavailable/i.test(coldRoom.text)
        && coldRoom.retry && !coldRoom.loading,
      `metals chamber cold failure: open room did not expose an actionable alert ${JSON.stringify({ coldEntryRequests, coldSnapshotRequests, coldRoom })}`);
      await coldContext.close();
      assert(!coldIssues.some((issue) => /loading the complete snapshot/i.test(issue)),
        `metals chamber cold failure: compact failure still advertised or attempted a full fallback ${JSON.stringify(coldIssues)}`);
      const unexpectedColdIssues = coldIssues.filter((issue) => (
        !/Metals entry summary (?:refresh )?failed:.*HTTP 503/i.test(issue)
          && !/Metals snapshot refresh failed:.*HTTP 503/i.test(issue)
          && !/Failed to load resource:.*status of 503.*\/data\/metals-(?:entry-summary|snapshot)\.json/i.test(issue)
      ));
      assert(unexpectedColdIssues.length === 0,
        `metals chamber cold failure browser issues:\n${unexpectedColdIssues.join('\n')}`);
    }

    {
      const compactIssues = [];
      const refreshedCompactPair = makeMetalsPair(makeIndependentStaleLauncherSnapshot());
      const refreshedCompactEntry = refreshedCompactPair.entry;
      let compactEntryRequests = 0;
      let compactSnapshotRequests = 0;
      const compactContext = await browser.newContext({ viewport: { width: 1100, height: 760 }, serviceWorkers: 'block' });
      await installFeatureMocks(compactContext);
      await compactContext.addInitScript(() => {
        localStorage.setItem('tezos-systems-theme', 'matrix');
        localStorage.setItem('tezos-toured', '1');
        localStorage.setItem('tezos-welcomed', '1');
        localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
        window.__METALS_ENTRY_REFRESH_MS__ = 135791;
        window.__METALS_CHAMBER_REFRESH_MS__ = 246802;
        window.__metalsCompactSmokeVisibility = 'visible';
        const nativeSetInterval = window.setInterval.bind(window);
        window.setInterval = (callback, delay, ...args) => {
          const timer = nativeSetInterval(callback, delay, ...args);
          if (Number(delay) === window.__METALS_ENTRY_REFRESH_MS__) {
            window.__metalsCompactSmokeTimerTick = () => callback(...args);
          }
          return timer;
        };
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          get: () => window.__metalsCompactSmokeVisibility
        });
      });
      await compactContext.route('**/data/metals-entry-summary.json*', async (route) => {
        compactEntryRequests += 1;
        return fulfillJson(route, compactEntryRequests === 1 ? entryFixture : refreshedCompactEntry);
      });
      await compactContext.route('**/data/metals-snapshot.json*', async (route) => {
        compactSnapshotRequests += 1;
        return route.fulfill({ status: 200, contentType: 'application/json', body: refreshedCompactPair.snapshotText });
      });
      const compactPage = await compactContext.newPage();
      attachIssueCollectors(compactPage, 'metals chamber compact timer', compactIssues);
      const compactResponse = await compactPage.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
      assert(compactResponse?.ok(), `metals chamber compact timer: dashboard failed with HTTP ${compactResponse?.status()}`);
      await compactPage.locator('#chambers-grid > .chamber-category[data-chamber-category="capital"] .chamber-category-toggle').click();
      await compactPage.locator('#metals-entry-card').dispatchEvent('pointerenter');
      await compactPage.waitForFunction(() => (
        document.querySelector('#metals-entry-front')?.dataset.metalsRendered === '1'
          && typeof window.__metalsCompactSmokeTimerTick === 'function'
      ), null, { timeout: 10000 });
      const compactBefore = await compactPage.evaluate(() => {
        const front = document.querySelector('#metals-entry-front');
        window.__metalsClosedEntryNode = front;
        return {
          price: front?.querySelector('.metals-entry-value')?.textContent?.trim() || '',
          coverage: front?.querySelector('.metals-entry-kpis')?.textContent?.replace(/\s+/g, ' ').trim() || '',
          modalOpen: document.querySelector('#metals-modal')?.classList.contains('active') || false,
          fullResources: performance.getEntriesByType('resource').filter(({ name }) => name.includes('/data/metals-snapshot.json')).length
        };
      });
      assert(compactEntryRequests === 1 && compactSnapshotRequests === 0
        && !compactBefore.modalOpen && compactBefore.fullResources === 0
        && /Current quotes\s*4 \/ 8/i.test(compactBefore.coverage),
      `metals chamber compact timer: initial launcher did not remain compact-only ${JSON.stringify({ compactBefore, compactEntryRequests, compactSnapshotRequests })}`);

      await compactPage.evaluate(() => {
        window.__metalsCompactSmokeVisibility = 'hidden';
        document.dispatchEvent(new Event('visibilitychange'));
        window.__metalsCompactSmokeTimerTick();
      });
      await compactPage.waitForTimeout(75);
      const compactHidden = await compactPage.evaluate(() => ({
        price: document.querySelector('#metals-entry-front .metals-entry-value')?.textContent?.trim() || '',
        sameFront: document.querySelector('#metals-entry-front') === window.__metalsClosedEntryNode,
        modalOpen: document.querySelector('#metals-modal')?.classList.contains('active') || false
      }));
      assert(compactEntryRequests === 1 && compactSnapshotRequests === 0
        && compactHidden.price === compactBefore.price && compactHidden.sameFront && !compactHidden.modalOpen,
      `metals chamber compact timer: hidden launcher timer polled or mutated the closed card ${JSON.stringify({ compactBefore, compactHidden, compactEntryRequests, compactSnapshotRequests })}`);

      await compactPage.evaluate(() => {
        window.__metalsCompactSmokeVisibility = 'visible';
        document.dispatchEvent(new Event('visibilitychange'));
      });
      const compactCatchupDeadline = Date.now() + 6000;
      while (compactEntryRequests <= 1 && Date.now() < compactCatchupDeadline) await compactPage.waitForTimeout(25);
      assert(compactEntryRequests === 2 && compactSnapshotRequests === 0,
        `metals chamber compact timer: visibility return did not perform exactly one compact-only catch-up ${JSON.stringify({ compactEntryRequests, compactSnapshotRequests })}`);
      await compactPage.waitForFunction((previousPrice) => {
        const card = document.querySelector('#metals-entry-card');
        const price = document.querySelector('#metals-entry-front .metals-entry-value')?.textContent?.trim() || '';
        return price !== previousPrice
          && card?.dataset.quietRefreshSettled === 'true'
          && !card.hasAttribute('data-quiet-refreshing');
      }, compactBefore.price, { timeout: 6000 });
      const compactCatchup = await compactPage.evaluate(() => {
        const front = document.querySelector('#metals-entry-front');
        const kpis = Array.from(front?.querySelectorAll('.metals-entry-kpis > span') || [], (kpi) => ({
          label: kpi.querySelector('small')?.textContent?.replace(/\s+/g, ' ').trim() || '',
          value: kpi.querySelector('strong')?.textContent?.replace(/\s+/g, ' ').trim() || '',
          text: kpi.textContent?.replace(/\s+/g, ' ').trim() || ''
        }));
        const historySurface = front?.querySelector('.metals-entry-chart');
        const imfKpi = kpis.find(({ label }) => /IMF|history/i.test(label));
        const blockscoutKpi = kpis.find(({ label }) => /Blockscout|holder/i.test(label));
        const staleLabel = /last-good|stale|unavailable/i;
        return {
          sameFront: front === window.__metalsClosedEntryNode,
          price: front?.querySelector('.metals-entry-value')?.textContent?.trim() || '',
          goldState: front?.querySelector('.metals-entry-live')?.textContent?.replace(/\s+/g, ' ').trim() || '',
          coverage: front?.querySelector('.metals-entry-kpis')?.textContent?.replace(/\s+/g, ' ').trim() || '',
          imf: imfKpi || null,
          blockscout: blockscoutKpi || null,
          historyText: historySurface?.textContent?.replace(/\s+/g, ' ').trim() || '',
          historyChartVisible: Boolean(historySurface?.querySelector('.metals-chart')),
          imfTruthful: staleLabel.test(`${imfKpi?.text || ''} ${historySurface?.textContent || ''}`) || !historySurface?.querySelector('.metals-chart'),
          blockscoutTruthful: !blockscoutKpi || staleLabel.test(blockscoutKpi.text) || /^Unavailable$/i.test(blockscoutKpi.value),
          modalOpen: document.querySelector('#metals-modal')?.classList.contains('active') || false,
          fullResources: performance.getEntriesByType('resource').filter(({ name }) => name.includes('/data/metals-snapshot.json')).length,
          settled: document.querySelector('#metals-entry-card')?.dataset.quietRefreshSettled === 'true'
            && !document.querySelector('#metals-entry-card')?.dataset.quietRefreshing
        };
      });
      assert(compactCatchup.sameFront && compactCatchup.price !== compactBefore.price
        && compactCatchup.goldState === 'current' && /Current quotes\s*4 \/ 8/i.test(compactCatchup.coverage)
        && compactCatchup.imfTruthful && compactCatchup.blockscoutTruthful
        && !compactCatchup.modalOpen && compactCatchup.fullResources === 0 && compactCatchup.settled,
      `metals chamber compact timer: catch-up hid stale IMF/Blockscout clocks behind fresh Gold or opened the full room ${JSON.stringify(compactCatchup)}`);
      await compactContext.close();
      assert(compactIssues.length === 0,
        `metals chamber compact timer browser issues:\n${compactIssues.join('\n')}`);
    }

    {
      const staleIssues = [];
      const stalePair = makeMetalsPair(makeStaleSnapshot());
      const staleSnapshot = stalePair.snapshot;
      const staleEntry = stalePair.entry;
      const staleContext = await browser.newContext({ viewport: { width: 1100, height: 760 }, serviceWorkers: 'block' });
      await installFeatureMocks(staleContext);
      await staleContext.addInitScript(() => {
        localStorage.setItem('tezos-systems-theme', 'matrix');
        localStorage.setItem('tezos-toured', '1');
        localStorage.setItem('tezos-welcomed', '1');
        localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
      });
      await staleContext.route('**/data/metals-entry-summary.json*', (route) => fulfillJson(route, staleEntry));
      await staleContext.route('**/data/metals-snapshot.json*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: stalePair.snapshotText }));
      const stalePage = await staleContext.newPage();
      attachIssueCollectors(stalePage, 'metals chamber stale receipts', staleIssues);
      const staleResponse = await stalePage.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
      assert(staleResponse?.ok(), `metals chamber stale receipts: dashboard failed with HTTP ${staleResponse?.status()}`);
      await stalePage.locator('#chambers-grid > .chamber-category[data-chamber-category="capital"] .chamber-category-toggle').click();
      await stalePage.locator('#metals-entry-card').dispatchEvent('pointerenter');
      await stalePage.waitForFunction(() => document.querySelector('#metals-entry-front')?.dataset.metalsRendered === '1', null, { timeout: 10000 });
      const staleLauncher = await stalePage.evaluate(() => ({
        coverage: document.querySelector('#metals-entry-front .metals-entry-kpis')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        text: document.querySelector('#metals-entry-front')?.textContent?.replace(/\s+/g, ' ').trim() || ''
      }));
      assert(/Current quotes\s*1 \/ 8/i.test(staleLauncher.coverage),
        `metals chamber stale receipts: stale numeric quotes inflated launcher coverage ${JSON.stringify(staleLauncher)}`);
      await stalePage.locator('#metals-entry-card .chamber-expand-cue').click();
      await stalePage.locator('#metals-modal.active .metals-content').waitFor({ state: 'visible', timeout: 10000 });
      await stalePage.waitForFunction(() => document.querySelector('#metals-chamber-body')?.dataset.metalsRendered === '1', null, { timeout: 10000 });
      const staleAssay = await stalePage.evaluate(() => {
        const metrics = Object.fromEntries(Array.from(document.querySelectorAll('.metals-hero-metrics > span'), (metric) => [
          metric.querySelector('small')?.textContent?.replace(/\s+/g, ' ').trim() || '',
          metric.querySelector('strong')?.textContent?.replace(/\s+/g, ' ').trim() || ''
        ]));
        const cards = Object.fromEntries(Array.from(document.querySelectorAll('.metals-assay-card'), (card) => [
          card.querySelector('.metals-element small')?.textContent?.trim() || '',
          {
            status: card.querySelector('.metals-assay-copy .metals-status')?.textContent?.replace(/\s+/g, ' ').trim() || '',
            text: card.textContent?.replace(/\s+/g, ' ').trim() || ''
          }
        ]));
        return { metrics, cards };
      });
      const rejectedStaleCards = ['Silver', 'Platinum', 'Palladium'].map((name) => staleAssay.cards[name]);
      assert(staleAssay.metrics['indicative-current'] === '1'
        && /Indicative current quote/i.test(staleAssay.cards.Gold?.status || '')
        && rejectedStaleCards.every((card) => card && !/Indicative current quote/i.test(card.status) && /last-good|stale|unavailable/i.test(card.text)),
      `metals chamber stale receipts: stale quotes were counted or labeled as current ${JSON.stringify(staleAssay)}`);
      await stalePage.locator('[data-metals-view="vnxau"]').click();
      const staleComparison = await stalePage.evaluate(() => {
        const comparison = document.querySelector('.metals-comparison');
        const differenceLabel = Array.from(comparison?.querySelectorAll('span') || []).find((node) => /Observed token difference/i.test(node.textContent || ''));
        return {
          text: comparison?.textContent?.replace(/\s+/g, ' ').trim() || '',
          difference: differenceLabel?.nextElementSibling?.textContent?.replace(/\s+/g, ' ').trim() || '',
          goldStatus: document.querySelector('.metals-vnx-hero')?.textContent?.replace(/\s+/g, ' ').trim() || ''
        };
      });
      assert(/unavailable|stale/i.test(staleComparison.difference)
        && !/[+-]?\d+(?:\.\d+)?%/.test(staleComparison.difference),
      `metals chamber stale receipts: stale VNXAU market produced a token/gold comparison ${JSON.stringify(staleComparison)}`);
      await staleContext.close();
      assert(staleIssues.length === 0,
        `metals chamber stale receipts browser issues:\n${staleIssues.join('\n')}`);
    }

    for (const viewport of [{ width: 320, height: 720 }, { width: 390, height: 844 }]) {
      const mobileIssues = [];
      const mobileContext = await browser.newContext({ viewport, serviceWorkers: 'block' });
      await installFeatureMocks(mobileContext);
      await installArtifactRoutes(mobileContext);
      await mobileContext.addInitScript(() => {
        localStorage.setItem('tezos-systems-theme', 'matrix');
        localStorage.setItem('tezos-toured', '1');
        localStorage.setItem('tezos-welcomed', '1');
        localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
      });
      const mobilePage = await mobileContext.newPage();
      attachIssueCollectors(mobilePage, `metals chamber ${viewport.width}px`, mobileIssues);
      const mobileResponse = await mobilePage.goto(`${baseUrl}/metals/?view=markets&metal=XAG`, { waitUntil: 'domcontentloaded' });
      assert(mobileResponse?.ok(), `metals chamber ${viewport.width}px: route failed with HTTP ${mobileResponse?.status()}`);
      await mobilePage.locator('#metals-modal.active .metals-content').waitFor({ state: 'visible', timeout: 10000 });
      await mobilePage.waitForFunction(() => document.querySelector('#metals-chamber-body')?.dataset.metalsRendered === '1', null, { timeout: 10000 });
      await assertNormalizedChamberShell(mobilePage, '#metals-modal.active', '.metals-content', 'wide', `metals chamber ${viewport.width}px`);
      const mobileState = await mobilePage.evaluate(() => {
        const content = document.querySelector('#metals-modal .metals-content');
        const body = document.querySelector('#metals-chamber-body');
        const panel = document.querySelector('#metals-view-panel');
        const selectedTab = document.querySelector('[data-metals-view][aria-selected="true"]');
        const panelRect = panel?.getBoundingClientRect();
        const rect = (node) => {
          const bounds = node?.getBoundingClientRect();
          return bounds ? { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom, width: bounds.width } : null;
        };
        const contained = (node, parentRect = panelRect) => {
          const bounds = node?.getBoundingClientRect();
          return Boolean(bounds && parentRect && bounds.left >= parentRect.left - 1 && bounds.right <= parentRect.right + 1);
        };
        return {
          viewport: { width: innerWidth, height: innerHeight },
          content: rect(content),
          mainScrollable: Boolean(body && body.closest('.chamber-room-scroll').scrollHeight > body.closest('.chamber-room-scroll').clientHeight),
          pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          selectedView: selectedTab?.dataset.metalsView || '',
          selectedMetal: document.querySelector('[data-metals-metal][aria-pressed="true"]')?.dataset.metalsMetal || '',
          selectedTabVisible: contained(selectedTab, document.querySelector('.metals-tabs')?.getBoundingClientRect()),
          metalButtons: document.querySelectorAll('[data-metals-metal]').length,
          metalButtonsContained: Array.from(document.querySelectorAll('[data-metals-metal]')).every((button) => contained(button)),
          chartContained: contained(document.querySelector('.metals-chart')),
          launcherDeferred: !document.querySelector('#metals-entry-card')
        };
      });
      assert(mobileState.content && mobileState.content.left >= -1 && mobileState.content.right <= viewport.width + 1
        && mobileState.content.top >= -1 && mobileState.content.bottom <= viewport.height + 1
        && mobileState.mainScrollable && mobileState.pageOverflow <= 1
        && mobileState.selectedView === 'markets' && mobileState.selectedMetal === 'XAG'
        && mobileState.selectedTabVisible && mobileState.metalButtons === 4
        && mobileState.metalButtonsContained && mobileState.chartContained && mobileState.launcherDeferred,
      `metals chamber ${viewport.width}px: standalone room escaped the mobile viewport or eagerly built its launcher ${JSON.stringify(mobileState)}`);
      await mobilePage.locator('#metals-modal .chamber-close').click();
      await mobilePage.waitForFunction(() => document.documentElement.dataset.dashboardReady === 'true'
        && !document.getElementById('metals-modal')?.classList.contains('active'));
      const launcherContained = await mobilePage.locator('#metals-entry-card').evaluate(node => {
        const bounds = node.getBoundingClientRect();
        return bounds.left >= -1 && bounds.right <= innerWidth + 1 && node.getClientRects().length > 0;
      });
      assert(launcherContained, `metals chamber ${viewport.width}px: hydrated dashboard launcher escaped the mobile viewport`);
      await mobileContext.close();
      assert(mobileIssues.length === 0, `metals chamber ${viewport.width}px browser issues:\n${mobileIssues.join('\n')}`);
    }

    assert(entryRequests > 0 && snapshotRequests >= 4,
      `metals chamber: compact and full receipt paths were not both exercised ${JSON.stringify({ entryRequests, snapshotRequests })}`);
    log('ok - Precious Metals compact-only timers/failures, independent source clocks, routing, quiet refresh, and mobile geometry smoke');
  }

  return { smokeMetalsChamber };
}
