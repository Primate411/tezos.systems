// Browser workflows owned by pulse. Shared dependencies remain explicit.
export function createPulseSmokeSuites({
  ROOT,
  SAMPLE_ADDRESS,
  assert,
  assertNormalizedChamberShell,
  attachIssueCollectors,
  installFeatureMocks,
  log,
  path,
  pulseMilestoneFixture,
  readFileSync,
  releaseRadarFixture,
  waitForIntentionalRealTime
}) {
  async function smokeNetworkPulseLauncher(browser, baseUrl) {
    const label = 'network pulse launcher';
    const issues = [];
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(context);
    await context.addInitScript(() => {
      localStorage.removeItem('tezos-systems-stats-visible');
      localStorage.removeItem('tezos-systems-stats');
      localStorage.removeItem('tezos-systems-stats-version');
      localStorage.removeItem('tezos-systems-lastUpdate');
      localStorage.setItem('tezos-systems-theme', 'matrix');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    });

    const page = await context.newPage();
    attachIssueCollectors(page, label, issues);
    const response = await page.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `${label}: dashboard failed with HTTP ${response?.status()}`);
    await page.locator('#chambers-grid > .chamber-category[data-chamber-category="network"] .chamber-category-toggle').click();
    await page.locator('#network-pulse-entry-card').waitFor({ state: 'visible', timeout: 20000 });

    const expected = {
      stakeAPY: '8.8%',
      transactionVolume24h: '120.80K',
      contractCalls24h: '9.08K',
      newAccounts24h: '808'
    };
    try {
      await page.waitForFunction((keys) => keys.every((key) => (
        document.querySelector(`[data-pulse-entry-key="${key}"] .network-pulse-entry-sparkline-svg`)
      )), Object.keys(expected), { timeout: 15000 });
    } catch (error) {
      const diagnostic = await page.evaluate((keys) => Object.fromEntries(keys.map((key) => {
        const cell = document.querySelector(`[data-pulse-entry-key="${key}"]`);
        return [key, {
          present: Boolean(cell),
          value: cell?.querySelector('.network-pulse-entry-cell-value')?.textContent?.trim() || '',
          sparkline: Boolean(cell?.querySelector('.network-pulse-entry-sparkline-svg'))
        }];
      })), Object.keys(expected));
      throw new Error(`${error.message}; state=${JSON.stringify(diagnostic)}; issues=${JSON.stringify(issues)}`);
    }

    const state = await page.evaluate((keys) => ({
      statsVisible: localStorage.getItem('tezos-systems-stats-visible'),
      modalOpen: Boolean(document.querySelector('#network-pulse-modal.active')),
      cardTag: document.querySelector('#network-pulse-entry-card')?.tagName || '',
      cardRole: document.querySelector('#network-pulse-entry-card')?.getAttribute('role'),
      cardTabIndex: document.querySelector('#network-pulse-entry-card')?.getAttribute('tabindex'),
      surfaceWired: document.querySelector('#network-pulse-entry-card')?.dataset.chamberSurfaceWired || '',
      cueTag: document.querySelector('#network-pulse-entry-card .chamber-expand-cue')?.tagName || '',
      explicitOpenActions: document.querySelectorAll('#network-pulse-entry-card .network-pulse-entry-open').length,
      metricCount: document.querySelectorAll('#network-pulse-entry-metrics [data-pulse-entry-key]').length,
      freshness: document.querySelector('#network-pulse-entry-freshness')?.textContent?.trim() || '',
      values: Object.fromEntries(keys.map((key) => [
        key,
        document.querySelector(`[data-pulse-entry-key="${key}"] .network-pulse-entry-cell-value`)?.textContent?.trim() || ''
      ]))
    }), Object.keys(expected));

    assert(state.statsVisible === null, `${label}: legacy full-stats visibility must remain unset, saw ${state.statsVisible}`);
    assert(!state.modalOpen, `${label}: regression must hydrate without opening the Network Pulse modal`);
    assert(state.cardTag === 'ARTICLE' && state.cardRole === 'article' && state.cardTabIndex === null && state.surfaceWired === '1' && state.cueTag === 'BUTTON', `${label}: entry card must expose the shared full-card surface and native Open control: ${JSON.stringify(state)}`);
    assert(state.explicitOpenActions === 1, `${label}: entry card needs one explicit Open action: ${JSON.stringify(state)}`);
    assert(state.metricCount === 10, `${label}: expected 10 launcher metrics, saw ${state.metricCount}`);
    assert(/history/i.test(state.freshness), `${label}: mixed-source freshness should disclose history fallback, saw ${state.freshness}`);
    assert(
      Object.entries(expected).every(([key, value]) => state.values[key] === value),
      `${label}: history-backed lower row did not hydrate: ${JSON.stringify(state.values)}`
    );

    await page.locator('#network-pulse-entry-card .chamber-entry-title').click();
    await page.locator('#network-pulse-modal.active').waitFor({ state: 'visible', timeout: 10000 });
    await assertNormalizedChamberShell(page, '#network-pulse-modal.active', '.network-pulse-content', 'standard', label);
    await page.locator('#network-pulse-modal .chamber-close').click();
    await page.locator('#network-pulse-modal').waitFor({ state: 'hidden', timeout: 5000 });

    await page.locator('#network-pulse-entry-card .network-pulse-entry-open').click();
    await page.locator('#network-pulse-modal.active [data-network-pulse-section="rooms"]').waitFor({ state: 'visible', timeout: 10000 });
    const pulseWayfinder = await page.evaluate(() => ({
      roomCards: document.querySelectorAll('#network-pulse-modal.active [data-network-pulse-room]').length,
      destinations: Array.from(document.querySelectorAll('#network-pulse-modal.active [data-network-pulse-room]')).map((link) => link.dataset.networkPulseRoom),
      actions: Array.from(document.querySelectorAll('#network-pulse-modal.active [data-network-pulse-section="rooms"] .site-wayfinder-actions a')).map((link) => link.getAttribute('href'))
    }));
    assert(pulseWayfinder.roomCards === 4 && pulseWayfinder.actions.join(',') === '/#chambers,/#search', `${label}: compact semantic room map is wrong ${JSON.stringify(pulseWayfinder)}`);
    assert(pulseWayfinder.destinations.join(',') === 'ecosystem,capital,health,hot-today', `${label}: Network Pulse relation order should remain unchanged ${JSON.stringify(pulseWayfinder)}`);

    await context.close();
    assert(issues.length === 0, `${label}: browser issues:\n${issues.join('\n')}`);
    log('ok - network pulse launcher smoke');
  }

  async function smokeLivePulseLoading(browser, baseUrl) {
    for (const width of [1054, 390]) {
      for (const outcome of ['unavailable', 'hidden', 'ready', 'quiet']) {
        const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
        try {
          await installFeatureMocks(context);
          // Exercise the real state renderer and timer in isolation from the
          // dashboard's unrelated successful sources. Exports exist only here.
          await context.route('**/js/core/app.js*', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
          await context.route('**/js/features/daily-briefing.js*', route => route.fulfill({
            contentType: 'text/javascript',
            body: readFileSync(path.join(ROOT, 'js/features/daily-briefing.js'), 'utf8')
              + '\nexport { renderHotTodayState as testState, renderToHotIsland as testReady };'
          }));
          await context.addInitScript(() => {
            localStorage.setItem('tezos-systems-theme', 'aurora');
            Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.__pulseVisibility || 'visible' });
          });
          const page = await context.newPage();
          await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
          await page.addStyleTag({ url: `${baseUrl}/css/shell-extras.min.css` });
          await page.evaluate(async () => { window.__pulseLoadingModule = await import('/js/features/daily-briefing.js'); });
          await page.clock.install({ time: new Date('2026-09-04T12:00:00Z') });
          await page.clock.pauseAt(new Date('2026-09-04T12:00:01Z'));
          await page.evaluate(() => {
            window.__pulseLoadingModule.testState('loading', {});
            window.__pulsePlaceholder = document.querySelector('.pulse-ticker-item-placeholder');
            window.__pulseLoadingModule.testState('unavailable', {});
          });
          const state = () => page.locator('#pulse-ticker-strip').getAttribute('data-pulse-state');
          assert(await state() === 'loading', `${width}: early failure must keep loading`);
          await page.clock.runFor(50);
          assert(await page.locator('.pulse-ticker-item-placeholder b').first().evaluate(el => getComputedStyle(el).animationName !== 'none'), 'loading retains its animation');
          const placeholder = page.locator('.pulse-ticker-item-placeholder').first();
          await placeholder.scrollIntoViewIfNeeded();
          const loadingPaint = () => placeholder.evaluate(el => {
            const style = getComputedStyle(el);
            return { background: style.backgroundColor, shadow: style.boxShadow, color: style.color };
          });
          const beforeHover = await loadingPaint();
          await placeholder.hover();
          assert(await placeholder.evaluate(el => el.matches(':hover')), 'real pointer reaches the loading placeholder');
          assert(JSON.stringify(await loadingPaint()) === JSON.stringify(beforeHover), `${width}: loading hover must not highlight the skeleton`);
          assert(await page.locator('#pulse-ticker-shelf').evaluate(el => el.hidden), 'loading hover does not open a shelf');
          await page.mouse.move(0, 0);
          await page.clock.fastForward(7950);
          assert(await state() === 'loading', `${width}: original eight-second deadline must still load`);
          if (outcome === 'ready' || outcome === 'quiet') {
            await page.evaluate(outcome => {
              if (outcome === 'quiet') window.__pulseLoadingModule.testState('quiet', { cycle: 100, blockLevel: 1000 });
              else window.__pulseLoadingModule.testReady(100, [{ id: 'loading-success', category: 'activity', text: 'A confirmed activity receipt arrived', score: 1000 }], {});
            }, outcome);
            assert(await state() === outcome, `${width}: successful result must not wait for the deadline`);
            await page.clock.fastForward(12001);
            assert(await state() === outcome, `${width}: cancelled timeout must not overwrite success`);
          } else {
            if (outcome === 'hidden') await page.evaluate(() => {
              window.__pulseVisibility = 'hidden';
              document.dispatchEvent(new Event('visibilitychange'));
            });
            await page.clock.fastForward(11999);
            assert(await state() === 'loading', `${width}: unavailable must wait the full twenty seconds`);
            assert(await page.evaluate(() => window.__pulsePlaceholder === document.querySelector('.pulse-ticker-item-placeholder')), 'early failures retain skeleton DOM');
            await page.clock.fastForward(1);
            if (outcome === 'hidden') {
              assert(await state() === 'loading', `${width}: hidden timeout must not mutate the surface`);
              await page.evaluate(() => {
                window.__pulseVisibility = 'visible';
                document.dispatchEvent(new Event('visibilitychange'));
              });
              await page.clock.fastForward(1);
            }
            assert(await state() === 'unavailable', `${width}: expired loading must report unavailable`);
          }
        } finally {
          await context.close();
        }
      }
    }
    log('ok - Live Pulse twenty-second loading floor, early failure, immediate success, and hidden-tab catch-up');
  }

  async function smokeLivePulseTicker(browser, baseUrl) {
    await smokeLivePulseLoading(browser, baseUrl);
    const issues = [];
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(context, { milestoneCatalog: pulseMilestoneFixture });
    await context.addInitScript(() => {
      localStorage.setItem('tezos-systems-theme', 'aurora');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    });
    const page = await context.newPage();
    attachIssueCollectors(page, 'live pulse ticker', issues);
    const response = await page.goto(`${baseUrl}/?theme=aurora`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `live pulse ticker: dashboard failed with HTTP ${response?.status()}`);
    await page.waitForFunction(() => (
      document.getElementById('pulse-ticker-strip')?.dataset.pulseState === 'ready'
        && document.querySelectorAll('#pulse-ticker-strip [data-pulse-run="live"] [data-hot-signal-id]').length >= 4
        && document.querySelector('#pulse-ticker-strip [data-pulse-run="live"] [data-hot-signal-id="release-radar"]')
    ), null, { timeout: 15000 });

    const before = await page.evaluate(() => {
      const section = document.getElementById('pulse-ticker-strip');
      const track = section?.querySelector('[data-pulse-track]');
      const echo = section?.querySelector('[data-pulse-run="echo"]');
      const viewport = document.getElementById('pulse-ticker-viewport');
      const heartbeat = document.getElementById('live-head');
      const viewportRect = viewport?.getBoundingClientRect();
      const heartbeatRect = heartbeat?.getBoundingClientRect();
      const viewportStyles = viewport ? getComputedStyle(viewport) : null;
      const liveItems = Array.from(section?.querySelectorAll('[data-pulse-run="live"] [data-hot-signal-id]') || []);
      const release = liveItems.find(item => item.dataset.hotSignalId === 'release-radar');
      window.__pulseTickerTrack = track;
      return {
        motion: section?.dataset.pulseMotion || '',
        time: Number(track?.getAnimations?.()[0]?.currentTime) || 0,
        clock: section?.querySelector('[data-hot-live="clock"]')?.textContent?.trim() || '',
        echoPointerReady: Boolean(echo?.matches('[aria-hidden="true"]:not([inert])'))
          && getComputedStyle(echo).pointerEvents !== 'none',
        leftEdgeDelta: viewportRect && heartbeatRect ? Math.abs(viewportRect.left - heartbeatRect.left) : 999,
        edgeMask: viewportStyles?.maskImage || viewportStyles?.webkitMaskImage || '',
        clippedValues: liveItems.filter(item => {
          const value = item.querySelector('.pulse-ticker-value');
          return value && value.scrollWidth > value.clientWidth + 1;
        }).map(item => item.dataset.hotSignalId),
        headlinerStates: liveItems.filter(item => item.dataset.hotSpectacle === 'headliner' && item.dataset.pulseWeight === 'state').map(item => item.dataset.hotSignalId),
        highlightedSurfaces: liveItems.filter(item => getComputedStyle(item).backgroundImage !== 'none').map(item => item.dataset.hotSignalId),
        unmarkedItemsWithGlyphs: liveItems.filter(item => ['state', 'priority'].includes(item.dataset.pulseWeight) && item.querySelector('.pulse-ticker-mark')).map(item => item.dataset.hotSignalId),
        releaseWeight: release?.dataset.pulseWeight || '',
        releaseMark: release?.querySelector('.pulse-ticker-mark')?.textContent?.trim() || ''
      };
    });
    await page.waitForFunction(({ beforeTime }) => {
      const track = document.querySelector('#pulse-ticker-strip [data-pulse-track]');
      const time = Number(track?.getAnimations?.()[0]?.currentTime) || 0;
      return track === window.__pulseTickerTrack && time > beforeTime + 100;
    }, { beforeTime: before.time }, { polling: 50, timeout: 2000 }).catch(() => {});
    const drift = await page.evaluate(() => {
      const section = document.getElementById('pulse-ticker-strip');
      const track = section?.querySelector('[data-pulse-track]');
      return {
        sameTrack: track === window.__pulseTickerTrack,
        time: Number(track?.getAnimations?.()[0]?.currentTime) || 0
      };
    });
    assert(
      before.motion === 'running'
        && drift.sameTrack
        && drift.time > before.time + 100
        && /^(?:Just now|\d+[smhd] ago)$/i.test(before.clock)
        && before.echoPointerReady
        && before.leftEdgeDelta <= 1
        && /linear-gradient/.test(before.edgeMask)
        && before.clippedValues.length === 0
        && before.headlinerStates.length === 0
        && before.highlightedSurfaces.length === 0
        && before.unmarkedItemsWithGlyphs.length === 0
        && before.releaseWeight === 'priority'
        && before.releaseMark === '',
      `live pulse ticker: continuous motion or concise age contract failed ${JSON.stringify({ before, drift })}`
    );

    const firstItem = page.locator('#pulse-ticker-strip [data-pulse-run="live"] [data-hot-signal-id]').first();
    await firstItem.dispatchEvent('pointerover', { pointerType: 'mouse' });
    await page.waitForFunction(() => (
      document.getElementById('pulse-ticker-strip')?.dataset.pulseMotion === 'paused'
        && !document.getElementById('pulse-ticker-shelf')?.hidden
    ));
    await page.evaluate(async () => {
      const animation = document.querySelector('#pulse-ticker-strip [data-pulse-track]')?.getAnimations?.()[0];
      if (animation?.ready) await animation.ready;
    });
    const held = await page.evaluate(() => {
      const section = document.getElementById('pulse-ticker-strip');
      const shelf = document.getElementById('pulse-ticker-shelf');
      const track = section?.querySelector('[data-pulse-track]');
      return {
        described: section?.querySelector('[data-pulse-run="live"] [aria-describedby="pulse-ticker-shelf"]')?.dataset.hotSignalId || '',
        shelfText: shelf?.textContent?.replace(/\s+/g, ' ').trim() || '',
        time: Number(track?.getAnimations?.()[0]?.currentTime) || 0
      };
    });
    await page.waitForTimeout(220);
    const heldTime = await page.evaluate(() => Number(document.querySelector('#pulse-ticker-strip [data-pulse-track]')?.getAnimations?.()[0]?.currentTime) || 0);
    assert(held.described && held.shelfText && Math.abs(heldTime - held.time) < 35, `live pulse ticker: hover did not hold the reading shelf ${JSON.stringify({ held, heldTime })}`);

    await firstItem.dispatchEvent('pointerout', { pointerType: 'mouse' });
    await page.waitForFunction(() => document.getElementById('pulse-ticker-shelf')?.hidden === true, null, { timeout: 3000 });
    const echoTarget = await page.evaluate(async () => {
      const section = document.getElementById('pulse-ticker-strip');
      const viewport = document.getElementById('pulse-ticker-viewport');
      const track = section?.querySelector('[data-pulse-track]');
      const live = section?.querySelector('[data-pulse-run="live"]');
      const echo = section?.querySelector('[data-pulse-run="echo"]');
      const item = echo?.querySelector('[data-pulse-echo-of="release-radar"]')
        || echo?.querySelector('[data-pulse-echo-of]');
      const animation = track?.getAnimations?.()[0];
      const duration = Number(animation?.effect?.getTiming?.().duration);
      if (!section || !viewport || !live || !echo || !item || !animation || !Number.isFinite(duration) || duration <= 0) return null;
      animation.pause();
      const phase = Math.max(0, Math.min(0.995, 1 + ((item.offsetLeft + (item.getBoundingClientRect().width / 2) - (viewport.clientWidth / 2)) / live.getBoundingClientRect().width)));
      animation.currentTime = phase * duration;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const viewportRect = viewport.getBoundingClientRect();
      const itemRect = item.getBoundingClientRect();
      const left = Math.max(viewportRect.left, itemRect.left);
      const right = Math.min(viewportRect.right, itemRect.right);
      const x = left + ((right - left) / 2);
      const y = itemRect.top + (itemRect.height / 2);
      const hit = document.elementFromPoint(x, y)?.closest('[data-pulse-echo-of]');
      window.__pulseEchoAnimation = animation;
      return {
        id: item.dataset.pulseEchoOf || '',
        x,
        y,
        visibleWidth: Math.max(0, right - left),
        hitId: hit?.dataset.pulseEchoOf || ''
      };
    });
    assert(echoTarget?.id && echoTarget.hitId === echoTarget.id && echoTarget.visibleWidth > 24, `live pulse ticker: echo did not expose a real pointer target ${JSON.stringify(echoTarget)}`);
    await page.mouse.move(echoTarget.x, echoTarget.y);
    await page.waitForFunction((signalId) => (
      document.getElementById('pulse-ticker-strip')?.dataset.pulseMotion === 'paused'
        && !document.getElementById('pulse-ticker-shelf')?.hidden
        && document.querySelector('[data-pulse-run="live"] [aria-describedby="pulse-ticker-shelf"]')?.getAttribute('data-hot-signal-id') === signalId
    ), echoTarget.id, { timeout: 3000 });
    const echoHeld = await page.evaluate((signalId) => {
      const section = document.getElementById('pulse-ticker-strip');
      const anchor = section?.querySelector(`[data-pulse-run="echo"] [data-pulse-echo-of="${CSS.escape(signalId)}"]`);
      const sectionRect = section?.getBoundingClientRect();
      const anchorRect = anchor?.getBoundingClientRect();
      const expectedCaret = sectionRect && anchorRect
        ? Math.max(24, Math.min(sectionRect.width - 24, anchorRect.left - sectionRect.left + (anchorRect.width / 2)))
        : -1;
      return {
        caret: Number.parseFloat(section?.style.getPropertyValue('--pulse-shelf-caret') || '-1'),
        expectedCaret,
        shelfText: document.getElementById('pulse-ticker-shelf')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        echoDescribed: anchor?.getAttribute('aria-describedby') || ''
      };
    }, echoTarget.id);
    assert(
      echoHeld.shelfText
        && echoHeld.echoDescribed === ''
        && Math.abs(echoHeld.caret - echoHeld.expectedCaret) <= 1,
      `live pulse ticker: echo shelf did not anchor to the pointer while preserving the live accessibility twin ${JSON.stringify(echoHeld)}`
    );
    await page.mouse.move(10, 500);
    await page.waitForFunction(() => document.getElementById('pulse-ticker-shelf')?.hidden === true, null, { timeout: 3000 });
    await page.evaluate(() => window.__pulseEchoAnimation?.play());
    await page.evaluate(() => {
      const track = document.querySelector('#pulse-ticker-strip [data-pulse-track]');
      const animation = track?.getAnimations?.()[0];
      const duration = Number(animation?.effect?.getTiming?.().duration);
      window.__pulseRefreshPhase = animation && Number.isFinite(duration) && duration > 0
        ? ((Number(animation.currentTime) || 0) % duration) / duration
        : null;
      window.dispatchEvent(new CustomEvent('hot-signal', {
        detail: {
          id: 'pulse-ticker-refresh-proof',
          category: 'network',
          title: 'Ticker refresh proof',
          text: 'A new signal joined without resetting the pulse.',
          route: '#health',
          score: 500,
          createdAt: Date.now(),
          ttlMs: 60000,
          breaking: true,
          live: true
        }
      }));
    });
    await page.locator('#pulse-ticker-strip [data-pulse-run="live"] [data-hot-signal-id="pulse-ticker-refresh-proof"]').waitFor({ state: 'attached', timeout: 10000 });
    await page.waitForFunction(() => {
      const animation = document.querySelector('#pulse-ticker-strip [data-pulse-track]')?.getAnimations?.()[0];
      const duration = Number(animation?.effect?.getTiming?.().duration);
      return Boolean(animation) && animation.currentTime !== null && Number.isFinite(duration) && duration > 0;
    }, null, { timeout: 3000 });
    const refreshed = await page.evaluate(() => {
      const track = document.querySelector('#pulse-ticker-strip [data-pulse-track]');
      const animation = track?.getAnimations?.()[0];
      const duration = Number(animation?.effect?.getTiming?.().duration);
      const phase = animation && Number.isFinite(duration) && duration > 0
        ? ((Number(animation.currentTime) || 0) % duration) / duration
        : null;
      const beforePhase = window.__pulseRefreshPhase;
      return {
        sameTrack: track === window.__pulseTickerTrack,
        motion: document.getElementById('pulse-ticker-strip')?.dataset.pulseMotion || '',
        echoes: document.querySelectorAll('#pulse-ticker-strip [data-pulse-run="echo"] [data-pulse-echo-of="pulse-ticker-refresh-proof"]').length,
        beforePhase,
        phase,
        phaseDelta: Number.isFinite(beforePhase) && Number.isFinite(phase) ? (phase - beforePhase + 1) % 1 : null
      };
    });
    assert(
      refreshed.sameTrack
        && refreshed.motion === 'running'
        && refreshed.echoes === 1
        && Number.isFinite(refreshed.phaseDelta)
        && refreshed.phaseDelta >= 0
        && refreshed.phaseDelta < 0.02,
      `live pulse ticker: quiet refresh reset or moved the motion phase backward ${JSON.stringify(refreshed)}`
    );

    await page.locator('#hot-today-info-btn').click();
    await page.locator('#hot-today-info-btn-panel.is-visible').waitFor({ state: 'visible', timeout: 3000 });
    assert(await page.locator('#hot-today-info-btn').getAttribute('aria-expanded') === 'true', 'live pulse ticker: info control did not open its explanation');
    await page.keyboard.press('Escape');

    await page.evaluate(() => {
      document.documentElement.style.scrollBehavior = 'auto';
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
    });
    await page.waitForFunction(() => window.scrollY > 1000, null, { timeout: 3000 });
    await page.waitForFunction(() => document.getElementById('pulse-ticker-strip')?.dataset.pulseMotion === 'paused', null, { timeout: 3000 });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForFunction(() => document.getElementById('pulse-ticker-strip')?.dataset.pulseMotion === 'running', null, { timeout: 3000 });
    await context.close();

    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/125 Mobile Safari/537.36',
      hasTouch: true,
      serviceWorkers: 'block'
    });
    await installFeatureMocks(mobileContext, { milestoneCatalog: pulseMilestoneFixture });
    await mobileContext.addInitScript(() => {
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    });
    const mobilePage = await mobileContext.newPage();
    attachIssueCollectors(mobilePage, 'live pulse ticker mobile', issues);
    await mobilePage.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    await mobilePage.waitForFunction(() => document.getElementById('pulse-ticker-strip')?.dataset.pulseState === 'ready', null, { timeout: 15000 });
    const mobileEchoTarget = await mobilePage.evaluate(async () => {
      const section = document.getElementById('pulse-ticker-strip');
      const viewport = document.getElementById('pulse-ticker-viewport');
      const track = section?.querySelector('[data-pulse-track]');
      const live = section?.querySelector('[data-pulse-run="live"]');
      const echo = section?.querySelector('[data-pulse-run="echo"]');
      // The leading echo reaches a phone viewport before the one-run animation wraps.
      const item = echo?.querySelector('[data-pulse-echo-of]');
      const animation = track?.getAnimations?.()[0];
      const duration = Number(animation?.effect?.getTiming?.().duration);
      if (!section || !viewport || !live || !item || !animation || !Number.isFinite(duration) || duration <= 0) return null;
      animation.pause();
      await animation.ready;
      animation.currentTime = 0;
      const runWidth = live.getBoundingClientRect().width;
      const targetLeft = viewport.getBoundingClientRect().left + 16;
      const phase = Math.max(0, Math.min(0.995, (item.getBoundingClientRect().left - targetLeft) / runWidth));
      animation.currentTime = phase * duration;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const viewportRect = viewport.getBoundingClientRect();
      const itemRect = item.getBoundingClientRect();
      const left = Math.max(viewportRect.left, itemRect.left);
      const right = Math.min(viewportRect.right, itemRect.right);
      const x = left + ((right - left) / 2);
      const y = itemRect.top + (itemRect.height / 2);
      const hit = document.elementFromPoint(x, y)?.closest('[data-pulse-echo-of]');
      return {
        id: item.dataset.pulseEchoOf || '',
        href: item.href,
        beforeHref: location.href,
        x,
        y,
        visibleWidth: Math.max(0, right - left),
        hitId: hit?.dataset.pulseEchoOf || ''
      };
    });
    assert(mobileEchoTarget?.id && mobileEchoTarget.hitId === mobileEchoTarget.id && mobileEchoTarget.visibleWidth > 24, `live pulse ticker mobile: echo did not expose a real tap target ${JSON.stringify(mobileEchoTarget)}`);
    await mobilePage.touchscreen.tap(mobileEchoTarget.x, mobileEchoTarget.y);
    await mobilePage.waitForFunction(() => !document.getElementById('pulse-ticker-shelf')?.hidden);
    const firstTap = await mobilePage.evaluate(() => ({
      href: location.href,
      held: document.getElementById('pulse-ticker-strip')?.dataset.pulseMotion || '',
      shelfVisible: !document.getElementById('pulse-ticker-shelf')?.hidden,
      described: document.querySelector('[data-pulse-run="live"] [aria-describedby="pulse-ticker-shelf"]')?.getAttribute('data-hot-signal-id') || ''
    }));
    assert(
      firstTap.href === mobileEchoTarget.beforeHref
        && firstTap.held === 'paused'
        && firstTap.shelfVisible
        && firstTap.described === mobileEchoTarget.id,
      `live pulse ticker mobile: first echo tap did not disclose without navigation ${JSON.stringify({ mobileEchoTarget, firstTap })}`
    );
    await mobilePage.evaluate(() => {
      document.documentElement.style.scrollBehavior = 'auto';
      window.scrollTo({ top: window.scrollY + 64, behavior: 'instant' });
    });
    await mobilePage.waitForFunction(() => document.getElementById('pulse-ticker-shelf')?.hidden === true, null, { timeout: 3000 });
    await mobilePage.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await mobilePage.waitForTimeout(50);
    await mobilePage.touchscreen.tap(mobileEchoTarget.x, mobileEchoTarget.y);
    await mobilePage.waitForFunction(() => !document.getElementById('pulse-ticker-shelf')?.hidden);
    await mobilePage.touchscreen.tap(mobileEchoTarget.x, mobileEchoTarget.y);
    await mobilePage.waitForFunction((beforeHref) => location.href !== beforeHref, mobileEchoTarget.beforeHref, { timeout: 5000 });
    const secondTap = await mobilePage.evaluate(() => ({ href: location.href }));
    assert(secondTap.href === mobileEchoTarget.href, `live pulse ticker mobile: second echo tap did not launch its route ${JSON.stringify({ mobileEchoTarget, secondTap })}`);
    await mobileContext.close();

    const reducedContext = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      reducedMotion: 'reduce',
      serviceWorkers: 'block'
    });
    await installFeatureMocks(reducedContext, { milestoneCatalog: pulseMilestoneFixture });
    await reducedContext.addInitScript(() => {
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    });
    const reducedPage = await reducedContext.newPage();
    attachIssueCollectors(reducedPage, 'live pulse ticker reduced motion', issues);
    await reducedPage.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    await reducedPage.waitForFunction(() => document.getElementById('pulse-ticker-strip')?.dataset.pulseState === 'ready', null, { timeout: 15000 });
    const reduced = await reducedPage.evaluate(() => ({
      motion: document.getElementById('pulse-ticker-strip')?.dataset.pulseMotion || '',
      animations: document.querySelector('#pulse-ticker-strip [data-pulse-track]')?.getAnimations?.().length || 0,
      scrollWidth: document.getElementById('pulse-ticker-viewport')?.scrollWidth || 0,
      clientWidth: document.getElementById('pulse-ticker-viewport')?.clientWidth || 0,
      edgeMask: (() => {
        const viewport = document.getElementById('pulse-ticker-viewport');
        const styles = viewport ? getComputedStyle(viewport) : null;
        return styles?.maskImage || styles?.webkitMaskImage || '';
      })()
    }));
    assert(reduced.motion === 'static' && reduced.animations === 0 && reduced.scrollWidth >= reduced.clientWidth && reduced.edgeMask === 'none', `live pulse ticker reduced motion: static reading lane failed ${JSON.stringify(reduced)}`);
    await reducedContext.close();

    assert(issues.length === 0, `live pulse ticker browser issues:\n${issues.join('\n')}`);
    log('ok - Live Pulse continuous ticker, disclosure, concise clock, quiet refresh, mobile hold, and reduced-motion smoke');
  }

  async function smokeReleaseRadarPulse(browser, baseUrl) {
    for (const { label, viewport, theme } of [
      { label: 'desktop', viewport: { width: 1440, height: 1000 }, theme: 'clean' },
      { label: 'mobile', viewport: { width: 390, height: 844 }, theme: 'matrix' }
    ]) {
      const issues = [];
      const context = await browser.newContext({
        viewport,
        serviceWorkers: 'block'
      });
      await installFeatureMocks(context, { milestoneCatalog: pulseMilestoneFixture });
      await context.addInitScript((activeTheme) => {
        localStorage.setItem('tezos-systems-theme', activeTheme);
        localStorage.setItem('tezos-toured', '1');
        localStorage.setItem('tezos-welcomed', '1');
        localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
      }, theme);

      const page = await context.newPage();
      attachIssueCollectors(page, `release radar pulse ${label}`, issues);
      const response = await page.goto(`${baseUrl}/?theme=${theme}`, { waitUntil: 'domcontentloaded' });
      assert(response?.ok(), `release radar pulse ${label}: dashboard failed with HTTP ${response?.status()}`);
      const cardLocator = page.locator('#pulse-ticker-strip [data-hot-signal-id="release-radar"]');
      await cardLocator.waitFor({ state: 'visible', timeout: 15000 });
      await page.locator('#pulse-ticker-strip').scrollIntoViewIfNeeded();
      await page.evaluate(async () => {
        const ticker = await import('/js/ui/pulse-ticker.js');
        ticker.holdPulseTickerSignal('release-radar');
      });
      await page.locator('#pulse-ticker-shelf:not([hidden])').waitFor({ state: 'visible' });

      const presentation = await page.evaluate(() => {
        const island = document.getElementById('pulse-ticker-strip');
        const viewport = document.getElementById('pulse-ticker-viewport');
        const card = island?.querySelector('[data-hot-signal-id="release-radar"]');
        const shelf = document.getElementById('pulse-ticker-shelf');
        const first = island?.querySelector('[data-hot-signal-index="0"]');
        const cards = Array.from(island?.querySelectorAll('[data-hot-signal-index]') || []);
        const releaseIndex = cards.findIndex((node) => node.dataset.hotSignalId === 'release-radar');
        const predecessors = releaseIndex > 0 ? cards.slice(0, releaseIndex) : [];
        const cardRect = card?.getBoundingClientRect();
        const viewportRect = viewport?.getBoundingClientRect();
        return {
          firstId: first?.dataset.hotSignalId || '',
          releaseIndex,
          predecessorIds: predecessors.map((node) => node.dataset.hotSignalId || ''),
          text: card?.textContent?.replace(/\s+/g, ' ').trim() || '',
          shelfText: shelf?.textContent?.replace(/\s+/g, ' ').trim() || '',
          embeddedGateCount: card?.querySelectorAll('.release-radar-overlay-gate, .release-radar-gate').length || 0,
          embeddedLaneCount: card?.querySelectorAll('.release-radar-lane').length || 0,
          embeddedEvidenceCount: card?.querySelectorAll('.release-radar-overlay-evidence a').length || 0,
          openButtonCount: shelf?.querySelectorAll('[data-release-radar-open]').length || 0,
          cardWidth: cardRect?.width || 0,
          cardHeight: cardRect?.height || 0,
          viewportWidth: viewportRect?.width || 0,
          cardOverflow: card ? card.scrollWidth - card.clientWidth : 999,
          valueOverflow: card?.querySelector('.pulse-ticker-value')
            ? card.querySelector('.pulse-ticker-value').scrollWidth - card.querySelector('.pulse-ticker-value').clientWidth
            : 999,
          pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
          held: island?.dataset.pulseMotion || '',
          described: card?.getAttribute('aria-describedby') || '',
          cardCount: island?.querySelectorAll('[data-hot-signal-index]').length || 0
        };
      });
      assert(
        presentation.releaseIndex >= 0
          && presentation.releaseIndex <= 1
          && /Release Radar/i.test(presentation.text)
          && /Tezos X Mainnet/i.test(presentation.text)
          && /Q3 2026 official target/i.test(presentation.text),
        `release radar pulse ${label}: the priority forecast or its 14-day release transition drifted ${JSON.stringify(presentation)}`
      );
      assert(
        presentation.embeddedGateCount === 0
          && presentation.embeddedLaneCount === 0
          && presentation.embeddedEvidenceCount === 0
          && presentation.openButtonCount === 1
          && /Full radar/i.test(presentation.shelfText)
          && /Explicit full Tezos X rollout declaration/.test(presentation.shelfText)
          && presentation.held === 'paused'
          && presentation.described === 'pulse-ticker-shelf',
        `release radar pulse ${label}: compact forecast summary or overlay action drifted ${JSON.stringify(presentation)}`
      );
      assert(
        presentation.cardWidth >= 255
          && presentation.cardWidth <= 1000
          && presentation.cardOverflow <= 1
          && presentation.valueOverflow <= 1
          && presentation.pageOverflow <= 1
          && presentation.cardCount >= 4,
        `release radar pulse ${label}: content-sized card or labeled rail escaped its reading lane ${JSON.stringify(presentation)}`
      );
      if (label === 'desktop') {
        assert(
          presentation.cardHeight <= 64,
          `release radar pulse desktop: compact priority geometry regressed ${JSON.stringify(presentation)}`
        );
      } else {
        assert(
            presentation.cardHeight <= 64,
          `release radar pulse mobile: compact single-column geometry regressed ${JSON.stringify(presentation)}`
        );
      }

      const openButton = page.locator('#pulse-ticker-shelf [data-release-radar-open]');
      await openButton.click();
      const overlayLocator = page.locator('#release-radar-overlay.active');
      await overlayLocator.waitFor({ state: 'visible' });

      const overlayPresentation = await page.evaluate(() => {
        const overlay = document.getElementById('release-radar-overlay');
        const dialog = overlay?.querySelector('.release-radar-overlay-content');
        const laneGrid = overlay?.querySelector('.release-radar-lane-grid');
        const gateGrid = overlay?.querySelector('.release-radar-overlay-gates');
        const boundaryGrid = overlay?.querySelector('.release-radar-boundary-grid');
        const nextGrid = overlay?.querySelector('.release-radar-next-grid');
        const recentGrid = overlay?.querySelector('.release-radar-recent-grid');
        const evidenceGrid = overlay?.querySelector('.release-radar-overlay-evidence');
        const confidenceGrid = overlay?.querySelector('.release-radar-confidence-grid');
        const rect = dialog?.getBoundingClientRect();
        const columnCount = (node) => node
          ? getComputedStyle(node).gridTemplateColumns.split(' ').filter(Boolean).length
          : 0;
        return {
          active: Boolean(overlay?.classList.contains('active')),
          hidden: overlay?.getAttribute('aria-hidden'),
          focusInside: Boolean(overlay?.contains(document.activeElement)),
          focusedLabel: document.activeElement?.getAttribute('aria-label') || '',
          bodyOverflow: getComputedStyle(document.body).overflow,
          htmlOverflow: getComputedStyle(document.documentElement).overflow,
          text: dialog?.textContent?.replace(/\s+/g, ' ').trim() || '',
          laneCount: overlay?.querySelectorAll('.release-radar-lane').length || 0,
          gateCount: overlay?.querySelectorAll('.release-radar-overlay-gate').length || 0,
          boundaryCount: boundaryGrid?.querySelectorAll(':scope > p').length || 0,
          nextCount: nextGrid?.querySelectorAll(':scope > div').length || 0,
          recentCount: recentGrid?.querySelectorAll('.release-radar-recent').length || 0,
          historyCount: overlay?.querySelectorAll('.release-radar-history-list article').length || 0,
          evidenceCount: evidenceGrid?.querySelectorAll(':scope > a').length || 0,
          confidenceCount: confidenceGrid?.querySelectorAll(':scope > p').length || 0,
          laneColumns: columnCount(laneGrid),
          gateColumns: columnCount(gateGrid),
          evidenceColumns: columnCount(evidenceGrid),
          dialogWidth: rect?.width || 0,
          dialogHeight: rect?.height || 0,
          dialogInsideViewport: Boolean(rect && rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1),
          dialogOverflowX: dialog ? dialog.scrollWidth - dialog.clientWidth : 999,
          pageOverflow: document.documentElement.scrollWidth - innerWidth
        };
      });
      assert(
        overlayPresentation.active
          && overlayPresentation.hidden === 'false'
          && overlayPresentation.focusInside
          && overlayPresentation.focusedLabel === 'Close full Release Radar'
          && overlayPresentation.bodyOverflow === 'hidden'
          && overlayPresentation.htmlOverflow === 'hidden'
          && overlayPresentation.laneCount === 3
          && overlayPresentation.gateCount === 6
          && overlayPresentation.boundaryCount === 4
          && overlayPresentation.nextCount === 3
          && overlayPresentation.recentCount === 2
          && overlayPresentation.historyCount === releaseRadarFixture.candidates.reduce((sum, candidate) => sum + candidate.history.length, 0)
          && overlayPresentation.evidenceCount === releaseRadarFixture.candidates.reduce((sum, candidate) => sum + candidate.evidence.length, 0)
          && overlayPresentation.confidenceCount === 4,
        `release radar pulse ${label}: full intelligence overlay lost lanes or receipts ${JSON.stringify(overlayPresentation)}`
      );
      assert(
        /Octez 25\.2/.test(overlayPresentation.text)
          && /EVM Node 0\.65/.test(overlayPresentation.text)
          && /Mainnet proposal readiness/.test(overlayPresentation.text)
          && /Dependency boundaries/.test(overlayPresentation.text)
          && /Status-change ledger/.test(overlayPresentation.text)
          && /Every receipt used in the current review/.test(overlayPresentation.text)
          && /(?:Current review receipt|This receipt is past its review deadline)/.test(overlayPresentation.text)
          && /Review due within 36 hours/.test(overlayPresentation.text),
        `release radar pulse ${label}: expanded forecast context drifted ${JSON.stringify(overlayPresentation)}`
      );
      assert(
        overlayPresentation.dialogInsideViewport
          && overlayPresentation.dialogOverflowX <= 1
          && overlayPresentation.pageOverflow <= 1,
        `release radar pulse ${label}: expanded overlay escaped the viewport ${JSON.stringify(overlayPresentation)}`
      );
      if (label === 'desktop') {
        assert(
          overlayPresentation.dialogWidth >= 900
            && overlayPresentation.laneColumns === 3
            && overlayPresentation.gateColumns === 2
            && overlayPresentation.evidenceColumns === 2,
          `release radar pulse desktop: expanded grid geometry regressed ${JSON.stringify(overlayPresentation)}`
        );
      } else {
        assert(
          overlayPresentation.dialogWidth <= viewport.width
            && overlayPresentation.laneColumns === 1
            && overlayPresentation.gateColumns === 1
            && overlayPresentation.evidenceColumns === 1,
          `release radar pulse mobile: expanded grid geometry regressed ${JSON.stringify(overlayPresentation)}`
        );
      }

      await page.evaluate(() => new Promise((resolve) => {
        let previousY = window.scrollY;
        let stableFrames = 0;
        const observe = () => {
          const currentY = window.scrollY;
          stableFrames = Math.abs(currentY - previousY) <= 1 ? stableFrames + 1 : 0;
          previousY = currentY;
          if (stableFrames >= 2) resolve();
          else requestAnimationFrame(observe);
        };
        requestAnimationFrame(observe);
      }));

      const quietBefore = await page.evaluate(() => {
        const strip = document.querySelector('#pulse-ticker-strip [data-pulse-run="live"]');
        const card = document.querySelector('#pulse-ticker-strip [data-hot-signal-id="release-radar"]');
        const overlay = document.getElementById('release-radar-overlay');
        const dialog = overlay?.querySelector('.release-radar-overlay-content');
        const overlayBody = overlay?.querySelector('[data-release-radar-overlay-body]');
        const focusedLink = overlay?.querySelector('.release-radar-overlay-evidence > a');
        const blocker = overlay?.querySelector('.release-radar-overlay-blocker strong')?.firstChild;
        strip.scrollLeft = Math.min(96, Math.max(0, strip.scrollWidth - strip.clientWidth));
        if (dialog) dialog.scrollTop = Math.min(260, Math.max(0, dialog.scrollHeight - dialog.clientHeight));
        focusedLink?.focus({ preventScroll: true });
        if (blocker?.nodeType === Node.TEXT_NODE) {
          const range = document.createRange();
          range.setStart(blocker, 0);
          range.setEnd(blocker, Math.min(6, blocker.length));
          const selection = document.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
        }
        window.__releaseRadarStrip = strip;
        window.__releaseRadarCard = card;
        window.__releaseRadarOverlay = overlay;
        window.__releaseRadarDialog = dialog;
        window.__releaseRadarOverlayBody = overlayBody;
        window.__releaseRadarFocusedLink = focusedLink;
        window.__releaseRadarOpener = document.querySelector('#pulse-ticker-shelf [data-release-radar-open]');
        return {
          left: strip.scrollLeft,
          y: window.scrollY,
          dialogTop: dialog?.scrollTop || 0,
          active: Boolean(overlay?.classList.contains('active')),
          selection: document.getSelection()?.toString() || ''
        };
      });
      assert(
        quietBefore.active && quietBefore.dialogTop > 0 && quietBefore.selection === releaseRadarFixture.candidates.find(candidate => candidate.id === 'tezos-x-mainnet').nextSignal.slice(0, 6),
        `release radar pulse ${label}: expanded overlay quiet-refresh fixture did not initialize ${JSON.stringify(quietBefore)}`
      );

      await page.evaluate(async () => {
        const pulse = await import('/js/features/daily-briefing.js');
        await pulse.updateHotTodayIsland({
          cycle: window.__lastStats?.cycle || 1308,
          blockLevel: window.__lastStats?.blockLevel || 14301500,
          activeBakers: window.__lastStats?.activeBakers || 199,
          totalSupply: window.__lastStats?.totalSupply || 1070000000,
          _quality: {
            status: 'fresh',
            observedAt: new Date().toISOString(),
            unavailableCategories: [],
            staleCategories: []
          }
        }, 0.202);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });
      const quietAfter = await page.evaluate(() => {
        const content = document.getElementById('pulse-ticker-viewport');
        const card = document.querySelector('#pulse-ticker-strip [data-hot-signal-id="release-radar"]');
        const strip = document.querySelector('#pulse-ticker-strip [data-pulse-run="live"]');
        const overlay = document.getElementById('release-radar-overlay');
        const dialog = overlay?.querySelector('.release-radar-overlay-content');
        const overlayBody = overlay?.querySelector('[data-release-radar-overlay-body]');
        const style = card ? getComputedStyle(card) : null;
        return {
          sameStrip: strip === window.__releaseRadarStrip,
          sameCard: card === window.__releaseRadarCard,
          sameOverlay: overlay === window.__releaseRadarOverlay,
          sameDialog: dialog === window.__releaseRadarDialog,
          sameOverlayBody: overlayBody === window.__releaseRadarOverlayBody,
          sameFocusedLink: overlay?.querySelector('.release-radar-overlay-evidence > a') === window.__releaseRadarFocusedLink,
          sameOpener: document.querySelector('#pulse-ticker-shelf [data-release-radar-open]') === window.__releaseRadarOpener,
          focused: document.activeElement === window.__releaseRadarFocusedLink,
          active: Boolean(overlay?.classList.contains('active')),
          hidden: overlay?.getAttribute('aria-hidden'),
          selection: document.getSelection()?.toString() || '',
          left: strip?.scrollLeft || 0,
          y: window.scrollY,
          dialogTop: dialog?.scrollTop || 0,
          settled: content?.dataset.quietRefreshSettled === 'true',
          animation: style?.animationName || '',
          opacity: style?.opacity || '',
          transform: style?.transform || ''
        };
      });
      assert(
        quietAfter.sameStrip
          && quietAfter.sameCard
          && quietAfter.sameOverlay
          && quietAfter.sameDialog
          && quietAfter.sameOverlayBody
          && quietAfter.sameFocusedLink
          && quietAfter.sameOpener
          && quietAfter.focused
          && quietAfter.active
          && quietAfter.hidden === 'false'
          && quietAfter.selection === quietBefore.selection
          && Math.abs(quietAfter.left - quietBefore.left) <= 1
          && Math.abs(quietAfter.y - quietBefore.y) <= 1
          && Math.abs(quietAfter.dialogTop - quietBefore.dialogTop) <= 1,
        `release radar pulse ${label}: quiet reconciliation moved the reader ${JSON.stringify({ quietBefore, quietAfter })}`
      );
      assert(
        quietAfter.settled
          && quietAfter.animation === 'none'
          && quietAfter.opacity === '1'
          && quietAfter.transform === 'none',
        `release radar pulse ${label}: background refresh replayed or stranded the card animation ${JSON.stringify(quietAfter)}`
      );

      await page.locator('[data-release-radar-close]').click();
      await page.waitForFunction(() => !document.getElementById('release-radar-overlay')?.classList.contains('active'));
      await page.waitForTimeout(120);
      const closed = await page.evaluate(() => {
        const overlay = document.getElementById('release-radar-overlay');
        const opener = document.querySelector('#pulse-ticker-shelf [data-release-radar-open]');
        return {
          active: Boolean(overlay?.classList.contains('active')),
          hidden: overlay?.getAttribute('aria-hidden'),
          focusReturned: document.activeElement === opener,
          activeElement: document.activeElement?.outerHTML?.slice(0, 180) || '',
          openerConnected: opener?.isConnected || false,
          openerRects: opener?.getClientRects().length || 0,
          openerHidden: opener?.closest('[hidden]')?.id || '',
          openerInert: opener?.closest('[inert]')?.id || opener?.closest('[inert]')?.tagName || '',
          bodyOverflow: document.body.style.overflow,
          htmlOverflow: document.documentElement.style.overflow
        };
      });
      assert(
        !closed.active
          && closed.hidden === 'true'
          && closed.focusReturned
          && closed.bodyOverflow === ''
          && closed.htmlOverflow === '',
        `release radar pulse ${label}: closing the expanded overlay did not restore the page ${JSON.stringify(closed)}`
      );

      await context.close();
      assert(issues.length === 0, `release radar pulse ${label} browser issues:\n${issues.join('\n')}`);
    }
    log('ok - compact Release Radar pulse, full intelligence overlay, and quiet reading state');
  }

  async function smokeLivePulsePersonalRibbons(browser, baseUrl) {
    for (const { label, viewport, theme } of [
      { label: 'desktop', viewport: { width: 1440, height: 1000 }, theme: 'clean' },
      { label: 'mobile', viewport: { width: 390, height: 844 }, theme: 'matrix' }
    ]) {
      const issues = [];
      const context = await browser.newContext({
        viewport,
        serviceWorkers: 'block'
      });
      await installFeatureMocks(context);
      await context.addInitScript((activeTheme) => {
        localStorage.setItem('tezos-systems-theme', activeTheme);
        localStorage.setItem('tezos-toured', '1');
        localStorage.setItem('tezos-welcomed', '1');
        localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
        localStorage.removeItem('tezos-systems-my-baker-address');
      }, theme);

      const page = await context.newPage();
      attachIssueCollectors(page, `live pulse personal ribbons ${label}`, issues);
      const response = await page.goto(`${baseUrl}/?theme=${theme}`, { waitUntil: 'domcontentloaded' });
      assert(response?.ok(), `live pulse personal ribbons ${label}: dashboard failed with HTTP ${response?.status()}`);
      await page.waitForFunction(() => document.documentElement.dataset.dashboardReady === 'true', null, { timeout: 30000 });
      await page.waitForFunction(() => document.querySelector('#pulse-ticker-strip')?.dataset.pulseState === 'ready', null, { timeout: 15000 });
      await page.locator('#pulse-ticker-strip [data-pulse-run="live"]').waitFor({ state: 'visible', timeout: 15000 });
      const anonymousState = await page.evaluate(() => ({
        ribbons: document.querySelectorAll('#pulse-ticker-strip .hot-today-you').length,
        attributes: document.querySelectorAll('#pulse-ticker-strip [data-hot-personal="1"]').length
      }));
      assert(
        anonymousState.ribbons === 0 && anonymousState.attributes === 0,
        `live pulse personal ribbons ${label}: anonymous markup gained personal decoration ${JSON.stringify(anonymousState)}`
      );

      await page.evaluate((address) => {
        window._myTezosData = {
          fullAddress: address,
          staked: 200,
          totalXTZ: 0,
          isBaker: false,
          bakerAddr: null,
          story: {}
        };
        const createdAt = Date.now();
        const signals = [
          { id: 'personal-event-proof', category: 'network', score: 160, kind: 'event', title: 'Network event proof' },
          { id: 'personal-stake-proof', category: 'staking', score: 150, kind: 'state', title: 'Stake proof' },
          { id: 'personal-cycle-proof', category: 'cycle', score: 149, kind: 'state', title: 'Cycle proof' },
          { id: 'personal-price-control', category: 'price', score: 154, kind: 'state', title: 'Price control' },
          { id: 'personal-nft-control', category: 'nft', score: 147, kind: 'state', title: 'NFT control' },
          { id: 'personal-domains-control', category: 'domains', score: 146, kind: 'state', title: 'Domains control' },
          { id: 'personal-baker-control', category: 'baker', score: 145, kind: 'state', title: 'Baker control' }
        ];
        signals.forEach((signal, index) => {
          window.dispatchEvent(new CustomEvent('hot-signal', {
            detail: {
              ...signal,
              icon: '•',
              text: `${signal.title} stays evidence-only.`,
              detail: 'Personal ribbon smoke',
              createdAt: createdAt - index,
              ttlMs: 60000,
              live: true
            }
          }));
        });
      }, SAMPLE_ADDRESS);
      await page.waitForFunction(() => (
        document.querySelector('#pulse-ticker-strip [data-hot-signal-id="personal-stake-proof"]')?.dataset.hotPersonal === '1'
          && document.querySelector('#pulse-ticker-strip [data-hot-signal-id="personal-cycle-proof"]')?.dataset.hotPersonal === '1'
      ), null, { timeout: 15000 });

      const personalState = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('#pulse-ticker-strip [data-hot-signal-id]'));
        const indexOf = (id) => cards.findIndex((card) => card.dataset.hotSignalId === id);
        const ribbonCards = cards.filter((card) => card.dataset.hotPersonal === '1');
        const speciesGeometry = cards
          .filter((card) => card.querySelector('.pulse-ticker-mark'))
          .map((card) => {
            const markRect = card.querySelector('.pulse-ticker-mark').getBoundingClientRect();
            const copyRect = card.querySelector('.pulse-ticker-copy').getBoundingClientRect();
            const ageRect = card.querySelector('.hot-today-age')?.getBoundingClientRect();
            const overlapWidth = ageRect
              ? Math.max(0, Math.min(markRect.right, ageRect.right) - Math.max(markRect.left, ageRect.left))
              : 0;
            const overlapHeight = ageRect
              ? Math.max(0, Math.min(markRect.bottom, ageRect.bottom) - Math.max(markRect.top, ageRect.top))
              : 0;
            return {
              id: card.dataset.hotSignalId,
              copyGap: copyRect.left - markRect.right,
              ageOverlapArea: overlapWidth * overlapHeight
            };
          });
        return {
          ribbonCount: document.querySelectorAll('#pulse-ticker-strip .hot-today-you').length,
          attributeCount: ribbonCards.length,
          ribbonIds: ribbonCards.map((card) => card.dataset.hotSignalId).sort(),
          ariaLabels: ribbonCards.map((card) => card.getAttribute('aria-label') || ''),
          eventIndex: indexOf('personal-event-proof'),
          stakingIndex: indexOf('personal-stake-proof'),
          cycleIndex: indexOf('personal-cycle-proof'),
          priceIndex: indexOf('personal-price-control'),
          pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
          speciesGeometry
        };
      });
      assert(
        personalState.ribbonCount === 0
          && personalState.attributeCount === 2
          && JSON.stringify(personalState.ribbonIds) === JSON.stringify(['personal-cycle-proof', 'personal-stake-proof']),
        `live pulse personal ribbons ${label}: evidence-only ribbon set drifted ${JSON.stringify(personalState)}`
      );
      assert(
        personalState.eventIndex >= 0
          && personalState.stakingIndex >= 0
          && personalState.cycleIndex >= 0
          && personalState.priceIndex >= 0
          && personalState.eventIndex < personalState.stakingIndex
          && personalState.eventIndex < personalState.cycleIndex
          && personalState.stakingIndex < personalState.priceIndex
          && personalState.cycleIndex < personalState.priceIndex,
        `live pulse personal ribbons ${label}: +6 bonus did not remain bounded between the stronger event and nearby state ${JSON.stringify(personalState)}`
      );
      assert(
        personalState.ariaLabels.every((labelText) => labelText.startsWith('Your stake. '))
          && personalState.pageOverflow <= 1,
        `live pulse personal ribbons ${label}: ribbon accessibility or geometry regressed ${JSON.stringify(personalState)}`
      );
      assert(
        label !== 'mobile'
          || personalState.speciesGeometry.every((item) => item.copyGap >= -1 && item.ageOverlapArea <= 1),
        `live pulse personal ribbons ${label}: decorative species marks re-entered the mobile reading lane ${JSON.stringify(personalState.speciesGeometry)}`
      );

      await page.evaluate(async () => {
        const ticker = await import('/js/ui/pulse-ticker.js');
        ticker.holdPulseTickerSignal('personal-stake-proof');
      });
      await page.waitForFunction(() => document.querySelector('#pulse-ticker-shelf .hot-today-you')?.textContent === 'Your stake');

      const quietBefore = await page.evaluate(() => {
        const strip = document.querySelector('#pulse-ticker-strip [data-pulse-run="live"]');
        const card = document.querySelector('#pulse-ticker-strip [data-hot-signal-id="personal-stake-proof"]');
        strip.scrollLeft = Math.min(160, Math.max(0, strip.scrollWidth - strip.clientWidth));
        card.focus({ preventScroll: true });
        window.__personalRibbonStrip = strip;
        window.__personalRibbonCard = card;
        return { left: strip.scrollLeft };
      });
      await page.evaluate(() => {
        window._myTezosData = { ...window._myTezosData, staked: 0 };
        window.dispatchEvent(new CustomEvent('hot-signal', {
          detail: {
            id: 'personal-stake-proof',
            category: 'staking',
            score: 150,
            kind: 'state',
            icon: '•',
            title: 'Stake proof',
            text: 'Stake proof stays evidence-only.',
            detail: 'Personal ribbon smoke',
            ttlMs: 60000,
            live: true
          }
        }));
      });
      await page.waitForFunction(() => document.querySelectorAll('#pulse-ticker-strip [data-hot-personal="1"]').length === 0, null, { timeout: 15000 });
      const quietAfter = await page.evaluate(() => {
        const strip = document.querySelector('#pulse-ticker-strip [data-pulse-run="live"]');
        return {
          sameStrip: strip === window.__personalRibbonStrip,
          sameCard: document.querySelector('#pulse-ticker-strip [data-hot-signal-id="personal-stake-proof"]') === window.__personalRibbonCard,
          focused: document.activeElement === window.__personalRibbonCard,
          left: strip.scrollLeft,
          ribbons: document.querySelectorAll('#pulse-ticker-strip .hot-today-you').length
        };
      });
      assert(
        quietAfter.sameStrip
          && quietAfter.sameCard
          && quietAfter.focused
          && Math.abs(quietAfter.left - quietBefore.left) <= 1
          && quietAfter.ribbons === 0,
        `live pulse personal ribbons ${label}: quiet removal moved the reader ${JSON.stringify({ quietBefore, quietAfter })}`
      );

      await context.close();
      assert(issues.length === 0, `live pulse personal ribbons ${label} browser issues:\n${issues.join('\n')}`);
    }
    log('ok - live pulse personal ribbons smoke');
  }

  async function smokeLivePulseDailyCurio(browser, baseUrl) {
    for (const { label, viewport, theme } of [
      { label: 'desktop', viewport: { width: 1440, height: 1000 }, theme: 'clean' },
      { label: 'mobile', viewport: { width: 390, height: 844 }, theme: 'matrix' }
    ]) {
      const issues = [];
      const context = await browser.newContext({
        viewport,
        serviceWorkers: 'block'
      });
      await installFeatureMocks(context);
      await context.addInitScript((activeTheme) => {
        localStorage.setItem('tezos-systems-theme', activeTheme);
        localStorage.setItem('tezos-toured', '1');
        localStorage.setItem('tezos-welcomed', '1');
        localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
      }, theme);

      const page = await context.newPage();
      attachIssueCollectors(page, `live pulse daily curio ${label}`, issues);
      const response = await page.goto(`${baseUrl}/?theme=${theme}`, { waitUntil: 'domcontentloaded' });
      assert(response?.ok(), `live pulse daily curio ${label}: dashboard failed with HTTP ${response?.status()}`);
      await page.locator('#pulse-ticker-strip [data-pulse-run="live"] [data-hot-curio="1"]').waitFor({ state: 'attached', timeout: 15000 });

      const initial = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('#pulse-ticker-strip [data-hot-signal-id]'));
        const curios = cards.filter(card => card.dataset.hotCurio === '1');
        const curio = curios[0];
        const score = Number(curio?.dataset.hotScore);
        const higherScoresAfterCurio = cards
          .slice(cards.indexOf(curio) + 1)
          .map(card => Number(card.dataset.hotScore))
          .filter(value => Number.isFinite(value) && value > score);
        return {
          count: curios.length,
          id: curio?.dataset.hotSignalId || '',
          score,
          spectacle: curio?.dataset.hotSpectacle || '',
          route: curio?.getAttribute('href') || '',
          text: curio?.textContent?.replace(/\s+/g, ' ').trim() || '',
          stamp: localStorage.getItem('tezos-systems-live-pulse-curio-day-v1') || '',
          today: new Date().toISOString().slice(0, 10),
          higherScoresAfterCurio
        };
      });
      assert(
        initial.count === 1
          && initial.id.startsWith('curio-')
          && initial.score === 58
          && initial.spectacle === 'curious'
          && ['/anthology/', '/history/'].includes(initial.route)
          && initial.stamp === initial.today
          && initial.higherScoresAfterCurio.length === 0
          && !/zero (?:hard )?forks|zero chain splits|100% uptime|uninterrupted uptime/i.test(initial.text),
        `live pulse daily curio ${label}: scarce low-rank card contract failed ${JSON.stringify(initial)}`
      );

      await page.evaluate(() => {
        const strip = document.querySelector('#pulse-ticker-strip [data-pulse-run="live"]');
        const card = document.querySelector('#pulse-ticker-strip [data-pulse-run="live"] [data-hot-curio="1"]');
        const text = card?.querySelector('strong')?.firstChild;
        strip.scrollLeft = Math.max(0, strip.scrollWidth - strip.clientWidth);
        card.focus({ preventScroll: true });
        if (text) {
          const range = document.createRange();
          range.selectNodeContents(text);
          const selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
        }
        window.__dailyCurioStrip = strip;
        window.__dailyCurioCard = card;
      });
      await page.waitForTimeout(500);
      const before = await page.evaluate(() => {
        const strip = document.querySelector('#pulse-ticker-strip [data-pulse-run="live"]');
        window.__dailyCurioRenderCount = 0;
        window.addEventListener('hot-signal-rendered', () => {
          window.__dailyCurioRenderCount += 1;
        }, { once: true });
        return {
          left: strip.scrollLeft,
          selection: window.getSelection()?.toString() || ''
        };
      });
      await page.evaluate(() => {
        window.dispatchEvent(new Event('governance-alert-state'));
      });
      await page.waitForFunction(() => window.__dailyCurioRenderCount > 0, null, { timeout: 15000 });
      const after = await page.evaluate(() => {
        const strip = document.querySelector('#pulse-ticker-strip [data-pulse-run="live"]');
        const card = document.querySelector('#pulse-ticker-strip [data-pulse-run="live"] [data-hot-curio="1"]');
        return {
          count: document.querySelectorAll('#pulse-ticker-strip [data-pulse-run="live"] [data-hot-curio="1"]').length,
          sameStrip: strip === window.__dailyCurioStrip,
          sameCard: card === window.__dailyCurioCard,
          focused: document.activeElement === window.__dailyCurioCard,
          left: strip.scrollLeft,
          selection: window.getSelection()?.toString() || ''
        };
      });
      assert(
        after.count === 1
          && after.sameStrip
          && after.sameCard
          && after.focused
          && Math.abs(after.left - before.left) <= 1
          && after.selection === before.selection
          && Boolean(after.selection),
        `live pulse daily curio ${label}: quiet reconciliation moved the reader ${JSON.stringify({ before, after })}`
      );

      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.locator('#pulse-ticker-strip [data-pulse-run="live"]').waitFor({ state: 'visible', timeout: 15000 });
      await waitForIntentionalRealTime(page, 'daily-curio-reload-scarcity');
      const reloadState = await page.evaluate(() => ({
        count: document.querySelectorAll('#pulse-ticker-strip [data-pulse-run="live"] [data-hot-curio="1"]').length,
        stamp: localStorage.getItem('tezos-systems-live-pulse-curio-day-v1') || '',
        today: new Date().toISOString().slice(0, 10)
      }));
      assert(
        reloadState.count === 0 && reloadState.stamp === reloadState.today,
        `live pulse daily curio ${label}: UTC-day receipt did not prevent a second card after reload ${JSON.stringify(reloadState)}`
      );

      await context.close();
      assert(issues.length === 0, `live pulse daily curio ${label} browser issues:\n${issues.join('\n')}`);
    }

    const scarcityIssues = [];
    const scarcityContext = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(scarcityContext);
    await scarcityContext.addInitScript(() => {
      localStorage.setItem('tezos-systems-theme', 'clean');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
      localStorage.removeItem('tezos-systems-live-pulse-curio-day-v1');
      window.addEventListener('DOMContentLoaded', async () => {
        // The fixture emits before the curio scheduler starts, but after the
        // deferred signal consumer exists (DOMContentLoaded no longer implies it).
        await import('/js/features/daily-briefing.js');
        ['price', 'staking', 'volume', 'contracts', 'whales', 'governance', 'ecosystem', 'nft']
          .forEach((category, index) => {
            window.dispatchEvent(new CustomEvent('hot-signal', {
              detail: {
                id: `curio-scarcity-proof-${index}`,
                category,
                score: 200 - index,
                kind: 'event',
                spectacle: 'headliner',
                title: `Scarcity proof ${index + 1}`,
                text: `Stronger signal ${index + 1}.`,
                detail: 'Curio scarcity smoke',
                ttlMs: 60000,
                live: true
              }
            }));
          });
      }, { once: true });
    });
    const scarcityPage = await scarcityContext.newPage();
    attachIssueCollectors(scarcityPage, 'live pulse daily curio scarcity', scarcityIssues);
    const scarcityResponse = await scarcityPage.goto(`${baseUrl}/?theme=clean`, { waitUntil: 'domcontentloaded' });
    assert(scarcityResponse?.ok(), `live pulse daily curio scarcity: dashboard failed with HTTP ${scarcityResponse?.status()}`);
    await scarcityPage.waitForFunction(() => (
      document.querySelectorAll('#pulse-ticker-strip [data-hot-signal-id^="curio-scarcity-proof-"]').length >= 8
    ), null, { timeout: 15000 });
    await waitForIntentionalRealTime(scarcityPage, 'daily-curio-stronger-signal-window');
    const scarcityState = await scarcityPage.evaluate(() => ({
      stronger: document.querySelectorAll('#pulse-ticker-strip [data-hot-signal-id^="curio-scarcity-proof-"]').length,
      curio: document.querySelectorAll('#pulse-ticker-strip [data-pulse-run="live"] [data-hot-curio="1"]').length,
      stamp: localStorage.getItem('tezos-systems-live-pulse-curio-day-v1')
    }));
    assert(
      scarcityState.stronger >= 8 && scarcityState.curio === 0 && scarcityState.stamp == null,
      `live pulse daily curio scarcity: eight stronger signals should skip without consuming the daily receipt ${JSON.stringify(scarcityState)}`
    );
    await scarcityContext.close();
    assert(scarcityIssues.length === 0, `live pulse daily curio scarcity browser issues:\n${scarcityIssues.join('\n')}`);
    log('ok - live pulse daily Curio smoke');
  }

  return { smokeNetworkPulseLauncher, smokeLivePulseLoading, smokeLivePulseTicker, smokeReleaseRadarPulse, smokeLivePulsePersonalRibbons, smokeLivePulseDailyCurio };
}
