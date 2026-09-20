// Browser workflows owned by quiet-refresh. Shared dependencies remain explicit.
export function createQuietRefreshSmokeSuites({
  assert,
  attachIssueCollectors,
  installFeatureMocks,
  log,
  waitForIntentionalRealTime
}) {
  async function smokeQuietRefresh(browser, baseUrl) {
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
      window.__TEZLINK_CHAMBER_REFRESH_MS__ = 1000;
      window.__ETHERLINK_GOVERNANCE_CHAMBER_REFRESH_MS__ = 1000;
    });

    const page = await context.newPage();
    attachIssueCollectors(page, 'quiet refresh', issues);
    const response = await page.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `quiet refresh: dashboard failed with HTTP ${response?.status()}`);
    await page.locator('main').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('#pulse-ticker-strip [data-pulse-run="live"]').waitFor({ state: 'visible', timeout: 15000 });

    const helperState = await page.evaluate(async () => {
      const { quietlyMutate, quietlySyncHtml } = await import('/js/core/quiet-refresh.js');
      const root = document.createElement('div');
      root.id = 'quiet-refresh-smoke-fixture';
      root.style.cssText = 'position:fixed;left:-9999px;top:0;width:180px;';
      root.innerHTML = `
        <button id="quiet-focus">Keep focus</button>
        <div id="quiet-scroll" style="width:160px;overflow:auto;white-space:nowrap;">
          <span data-quiet-key="alpha" style="display:inline-block;width:260px;">selectable alpha</span>
          <span data-quiet-key="beta" style="display:inline-block;width:260px;">beta</span>
        </div>`;
      document.body.appendChild(root);
      const button = root.querySelector('#quiet-focus');
      const scroller = root.querySelector('#quiet-scroll');
      const text = root.querySelector('[data-quiet-key="alpha"]').firstChild;
      scroller.scrollLeft = 120;
      button.focus({ preventScroll: true });
      const range = document.createRange();
      range.setStart(text, 0);
      range.setEnd(text, 10);
      const selection = document.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      const windowY = window.scrollY;
      quietlySyncHtml(root, `
        <button id="quiet-focus">Keep focus</button>
        <div id="quiet-scroll" style="width:160px;overflow:auto;white-space:nowrap;">
          <span data-quiet-key="alpha" style="display:inline-block;width:260px;">selectable alpha updated</span>
          <span data-quiet-key="beta" style="display:inline-block;width:260px;">beta updated</span>
          <span data-quiet-key="gamma" style="display:inline-block;width:260px;">gamma</span>
        </div>`);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const state = {
        sameButton: button === root.querySelector('#quiet-focus'),
        focused: document.activeElement === button,
        selection: document.getSelection()?.toString() || '',
        scrollLeft: scroller.scrollLeft,
        windowY: window.scrollY,
        expectedWindowY: windowY
      };
      quietlySyncHtml(root, root.innerHTML);
      scroller.scrollLeft = 80;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      state.userScrollLeft = scroller.scrollLeft;

      const layoutStyle = document.createElement('style');
      layoutStyle.dataset.quietLayoutSmoke = 'true';
      layoutStyle.textContent = 'body.quiet-layout-smoke > :not(#quiet-layout-smoke-fixture):not([data-quiet-layout-smoke]) { display: none !important; }';
      const layoutFixture = document.createElement('div');
      layoutFixture.id = 'quiet-layout-smoke-fixture';
      layoutFixture.innerHTML = `
        <div id="quiet-layout-shift" hidden style="height:96px;"></div>
        <div style="height:1200px;"></div>
        <div id="quiet-layout-anchor" style="height:240px;">Viewport anchor</div>
        <div style="height:1400px;"></div>`;
      document.head.appendChild(layoutStyle);
      document.body.appendChild(layoutFixture);
      document.body.classList.add('quiet-layout-smoke');
      const shift = layoutFixture.querySelector('#quiet-layout-shift');
      const html = document.documentElement;
      const previousScrollBehavior = html.style.scrollBehavior;
      html.style.scrollBehavior = 'auto';
      window.scrollTo(0, 850);
      html.style.scrollBehavior = previousScrollBehavior;
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const anchor = layoutFixture.querySelector('#quiet-layout-anchor');
      const anchorTop = anchor.getBoundingClientRect().top;
      state.shiftWindowYBefore = window.scrollY;
      // The mutation root begins above the viewport but spans the row under the
      // reader. A prepend must keep that row anchored without a delayed restore
      // overriding a scroll made immediately after reconciliation.
      quietlyMutate(layoutFixture, () => { shift.hidden = false; });
      state.compensatedWindowY = window.scrollY;
      state.anchorDeltaAfterMutation = anchor.getBoundingClientRect().top - anchorTop;
      const readerScrollBehavior = html.style.scrollBehavior;
      html.style.scrollBehavior = 'auto';
      window.scrollTo(0, state.compensatedWindowY + 73);
      html.style.scrollBehavior = readerScrollBehavior;
      state.readerWindowY = window.scrollY;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      state.shiftWindowYAfter = window.scrollY;
      quietlyMutate(layoutFixture, () => { shift.hidden = true; });
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const fixedRoom = document.createElement('div');
      fixedRoom.style.cssText = 'position:fixed;top:-100px;left:0;width:100vw;height:1000px;z-index:2147483647;background:#111;';
      fixedRoom.innerHTML = '<div style="height:450px"></div><div id="quiet-fixed-anchor" style="height:240px">Fixed Chamber row</div>';
      layoutFixture.appendChild(fixedRoom);
      state.fixedRoomPageBefore = window.scrollY;
      quietlyMutate(fixedRoom, () => {
        const prepend = document.createElement('div'); prepend.style.height = '78px'; fixedRoom.prepend(prepend);
      });
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      state.fixedRoomPageAfter = window.scrollY;
      fixedRoom.remove();
      document.body.classList.remove('quiet-layout-smoke');
      layoutFixture.remove();
      layoutStyle.remove();
      root.remove();
      return state;
    });
    assert(helperState.sameButton && helperState.focused, `quiet refresh: focus node was replaced ${JSON.stringify(helperState)}`);
    assert(helperState.selection === 'selectable', `quiet refresh: text selection was lost ${JSON.stringify(helperState)}`);
    assert(Math.abs(helperState.scrollLeft - 120) < 1, `quiet refresh: nested scroll reset ${JSON.stringify(helperState)}`);
    assert(Math.abs(helperState.userScrollLeft - 80) < 1, `quiet refresh: a reader scroll made after reconciliation was overridden ${JSON.stringify(helperState)}`);
    assert(helperState.windowY === helperState.expectedWindowY, `quiet refresh: window moved during DOM reconciliation ${JSON.stringify(helperState)}`);
    assert(Math.abs(helperState.anchorDeltaAfterMutation) < 1, `quiet refresh: spanning-root prepend shifted the visible row ${JSON.stringify(helperState)}`);
    assert(Math.abs(helperState.compensatedWindowY - helperState.shiftWindowYBefore - 96) < 1, `quiet refresh: spanning-root prepend did not compensate by its inserted height ${JSON.stringify(helperState)}`);
    assert(Math.abs(helperState.shiftWindowYAfter - helperState.readerWindowY) < 1, `quiet refresh: delayed spanning-root restore overwrote an immediate reader scroll ${JSON.stringify(helperState)}`);
    assert(helperState.fixedRoomPageBefore === helperState.fixedRoomPageAfter, `quiet refresh: a fixed Chamber row must never anchor the underlying page ${JSON.stringify(helperState)}`);

    await page.locator('#pulse-ticker-strip').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => (
      document.getElementById('pulse-ticker-strip')?.dataset.pulseState === 'ready'
        && document.querySelectorAll('#pulse-ticker-strip [data-hot-signal-index]').length >= 4
    ), null, { timeout: 15000 });
    await page.waitForTimeout(350);
    const hotBefore = await page.evaluate(() => {
      const track = document.querySelector('#pulse-ticker-strip [data-pulse-track]');
      const run = track?.querySelector('[data-pulse-run="live"]');
      const card = run?.querySelector('[data-hot-signal-id]');
      card?.focus({ preventScroll: true });
      window.__quietHotTrack = track;
      window.__quietHotCard = card;
      return {
        phase: Number(track?.getAnimations?.()[0]?.currentTime) || 0,
        y: window.scrollY,
        cardCount: run?.querySelectorAll('[data-hot-signal-index]').length || 0,
        motion: document.getElementById('pulse-ticker-strip')?.dataset.pulseMotion || ''
      };
    });
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('hot-signal', {
        detail: {
          id: 'quiet-refresh-smoke',
          category: 'network',
          icon: '◌',
          title: 'Quiet live update',
          text: 'Fresh data landed without moving the reader.',
          detail: 'background smoke',
          score: 999,
          kind: 'state',
          live: true,
          ttlMs: 60000
        }
      }));
    });
    try {
      await page.locator('#pulse-ticker-strip [data-hot-signal-id="quiet-refresh-smoke"]').waitFor({ state: 'attached', timeout: 10000 });
      await page.waitForTimeout(80);
    } catch (error) {
      const diagnostic = await page.evaluate(() => ({
        pulseState: document.getElementById('pulse-ticker-strip')?.dataset.pulseState || '',
        ids: Array.from(document.querySelectorAll('#pulse-ticker-strip [data-hot-signal-id]'), (node) => node.dataset.hotSignalId),
        cardCount: document.querySelectorAll('#pulse-ticker-strip [data-hot-signal-index]').length,
        clock: document.querySelector('#pulse-ticker-strip [data-hot-live="clock"]')?.textContent || ''
      }));
      throw new Error(`quiet refresh: injected Live Pulse signal did not render ${JSON.stringify(diagnostic)}\n${error.message}`);
    }
    const hotAfter = await page.evaluate(() => {
      const track = document.querySelector('#pulse-ticker-strip [data-pulse-track]');
      const run = track?.querySelector('[data-pulse-run="live"]');
      return {
        sameTrack: track === window.__quietHotTrack,
        sameCard: Boolean(window.__quietHotCard?.isConnected),
        focused: document.activeElement === window.__quietHotCard,
        phase: Number(track?.getAnimations?.()[0]?.currentTime) || 0,
        y: window.scrollY,
        motion: document.getElementById('pulse-ticker-strip')?.dataset.pulseMotion || '',
        shelfVisible: !document.getElementById('pulse-ticker-shelf')?.hidden,
        cardCount: run?.querySelectorAll('[data-hot-signal-index]').length || 0,
        ageCount: document.querySelectorAll('#pulse-ticker-viewport [data-hot-age]').length,
        injected: Boolean(run?.querySelector('[data-hot-signal-id="quiet-refresh-smoke"]'))
      };
    });
    assert(hotAfter.sameTrack && hotAfter.sameCard, `quiet refresh: Live Pulse replaced its browsing nodes ${JSON.stringify({ hotBefore, hotAfter })}`);
    assert(hotAfter.focused && hotAfter.shelfVisible, `quiet refresh: Live Pulse dropped keyboard focus or its reading shelf ${JSON.stringify({ hotBefore, hotAfter })}`);
    assert(hotAfter.phase > 0 && Math.abs(hotAfter.phase - hotBefore.phase) < 150 && hotAfter.y === hotBefore.y, `quiet refresh: Live Pulse reset phase or moved the page ${JSON.stringify({ hotBefore, hotAfter })}`);
    assert(
      hotBefore.motion === 'paused'
        && hotAfter.motion === 'paused'
        && hotAfter.ageCount === hotAfter.cardCount * 2
        && hotAfter.injected,
      `quiet refresh: ticker timing or held identity drifted during reconciliation ${JSON.stringify({ hotBefore, hotAfter })}`
    );

    await page.locator('#chambers-grid > .chamber-category[data-chamber-category="network"] .chamber-category-toggle').click();
    await page.locator('#tezlink-entry-card .chamber-expand-cue').click();
    await page.locator('#tezlink-modal.active .tezlink-content').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('#tezlink-chamber-body .panel-direct-link').waitFor({ state: 'attached', timeout: 10000 });
    const tezlinkBefore = await page.evaluate(() => {
      const content = document.querySelector('#tezlink-modal.active .tezlink-content');
      const body = document.querySelector('#tezlink-chamber-body');
      const focus = body.querySelector('.panel-direct-link');
      content.scrollTop = Math.min(220, Math.max(0, content.scrollHeight - content.clientHeight));
      focus.focus({ preventScroll: true });
      window.__quietTezlinkHeader = body.querySelector('.tezlink-header');
      window.__quietTezlinkFocus = focus;
      return { top: content.scrollTop };
    });
    await waitForIntentionalRealTime(page, 'tezlink-quiet-refresh');
    const tezlinkAfter = await page.evaluate(() => {
      const content = document.querySelector('#tezlink-modal.active .tezlink-content');
      const body = document.querySelector('#tezlink-chamber-body');
      return {
        sameHeader: body.querySelector('.tezlink-header') === window.__quietTezlinkHeader,
        focused: document.activeElement === window.__quietTezlinkFocus,
        top: content.scrollTop,
        settled: body.dataset.quietRefreshSettled === 'true',
        animation: getComputedStyle(body.querySelector('.tezlink-header')).animationName,
        opacity: getComputedStyle(body.querySelector('.tezlink-header')).opacity,
        transform: getComputedStyle(body.querySelector('.tezlink-header')).transform
      };
    });
    assert(tezlinkAfter.sameHeader && tezlinkAfter.focused, `quiet refresh: Tezos X replaced focused chamber nodes ${JSON.stringify({ tezlinkBefore, tezlinkAfter })}`);
    assert(Math.abs(tezlinkAfter.top - tezlinkBefore.top) < 1, `quiet refresh: Tezos X reset chamber scroll ${JSON.stringify({ tezlinkBefore, tezlinkAfter })}`);
    assert(
      tezlinkAfter.settled
        && tezlinkAfter.animation === 'none'
        && tezlinkAfter.opacity === '1'
        && tezlinkAfter.transform === 'none',
      `quiet refresh: Tezos X replayed or remained trapped in its entrance animation ${JSON.stringify(tezlinkAfter)}`
    );

    await context.close();
    assert(issues.length === 0, `quiet refresh browser issues:\n${issues.join('\n')}`);
    log('ok - quiet background refresh smoke');
  }

  async function smokeLiveNumberShellMotion(browser, baseUrl, issues) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      reducedMotion: 'no-preference',
      serviceWorkers: 'block'
    });
    await context.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
      window.__DATA_MAGIC_TEST__ = { forceMotion: true };
    });

    const page = await context.newPage();
    const shellIssues = [];
    const expectedOfflineIssues = new Set();
    attachIssueCollectors(page, 'live number production shell', shellIssues);
    const shellOrigin = new URL(baseUrl).origin;
    // This shell intentionally denies all data. Account for this exact failure
    // only here, after asserting its unavailable UI below; healthy-data suites
    // and every other diagnostic retain the normal strict collector.
    page.on('console', (message) => {
      const location = message.location()?.url;
      if (!['warning', 'warn'].includes(message.type())
        || message.text() !== '[baker-set] refresh failed: The 7D baker baseline is unavailable'
        || !location) return;
      const source = new URL(location);
      if (source.origin !== shellOrigin || source.pathname !== '/js/core/app.js') return;
      expectedOfflineIssues.add(`live number production shell console ${message.type()}: ${message.text()} (${location})`);
    });
    let deniedHistoryReads = 0;
    await page.route('**/*', async (route) => {
      const request = route.request();
      const resourceType = request.resourceType();
      let requestOrigin = shellOrigin;
      try { requestOrigin = new URL(request.url()).origin; } catch {}
      if (requestOrigin !== shellOrigin && (resourceType === 'fetch' || resourceType === 'xhr')) {
        if (new URL(request.url()).pathname.endsWith('/tezos_history')) deniedHistoryReads += 1;
        await route.abort('aborted');
        return;
      }
      await route.fallback();
    });

    const response = await page.goto(`${baseUrl}/#theme=matrix`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `live number production shell failed with HTTP ${response?.status()}`);
    await page.waitForFunction(() => typeof window._updateUptimeClock === 'function', null, { timeout: 15000 });
    // This fixture denies every API call. Let its initial unavailable banner
    // settle before measuring number-animation geometry in the reading state.
    await page.locator('#data-status[data-status-kind]').waitFor({ state: 'visible', timeout: 15000 });

    const pillLoadingGeometry = await page.evaluate(() => {
      const settledValues = new Map([
        ['total-bakers', '197'],
        ['finality', '~12s'],
        ['staking-ratio', '30.4%'],
        ['issuance-rate', '2.97%']
      ]);
      const pills = Array.from(document.querySelectorAll('.top-continuity-stat[data-card-history]'));
      const saved = pills.map((pill) => ({
        pill,
        className: pill.className,
        busy: pill.getAttribute('aria-busy'),
        text: pill.querySelector('strong')?.textContent || ''
      }));
      const measure = (pill) => {
        const value = pill.querySelector('strong');
        const label = pill.querySelector('.top-continuity-label');
        const pillRect = pill.getBoundingClientRect();
        const valueRect = value?.getBoundingClientRect();
        const labelRect = label?.getBoundingClientRect();
        const beforeStyle = value ? getComputedStyle(value, '::before') : null;
        const range = document.createRange();
        let textRect = null;
        if (value?.textContent) {
          range.selectNodeContents(value);
          textRect = range.getBoundingClientRect();
        }
        const loading = pill.classList.contains('is-loading');
        const skeletonWidth = Number.parseFloat(beforeStyle?.width || '') || 0;
        const visualWidth = loading ? skeletonWidth : (textRect?.width || 0);
        const visualCenterX = loading
          ? ((valueRect?.left || 0) + ((valueRect?.width || 0) / 2))
          : ((textRect?.left || 0) + ((textRect?.width || 0) / 2));
        const visualCenterY = loading
          ? ((valueRect?.top || 0) + ((valueRect?.height || 0) / 2))
          : ((textRect?.top || 0) + ((textRect?.height || 0) / 2));
        return {
          x: pillRect.x,
          width: pillRect.width,
          center: pillRect.x + (pillRect.width / 2),
          valueWidth: valueRect?.width || 0,
          valueTop: valueRect?.top || 0,
          valueHeight: valueRect?.height || 0,
          visualWidth,
          visualCenterX,
          visualCenterY,
          labelX: labelRect?.x || 0,
          contentCenter: valueRect && labelRect
            ? (valueRect.x + labelRect.right) / 2
            : 0
        };
      };

      for (const pill of pills) {
        pill.classList.add('is-loading');
        pill.setAttribute('aria-busy', 'true');
        const value = pill.querySelector('strong');
        if (value) value.textContent = '';
      }
      const loading = new Map(pills.map((pill) => [pill.dataset.cardHistory, measure(pill)]));

      for (const pill of pills) {
        pill.classList.remove('is-loading');
        pill.setAttribute('aria-busy', 'false');
        const value = pill.querySelector('strong');
        if (value) value.textContent = settledValues.get(pill.dataset.cardHistory) || '';
      }
      const settled = new Map(pills.map((pill) => [pill.dataset.cardHistory, measure(pill)]));

      for (const entry of saved) {
        entry.pill.className = entry.className;
        if (entry.busy == null) entry.pill.removeAttribute('aria-busy');
        else entry.pill.setAttribute('aria-busy', entry.busy);
        const value = entry.pill.querySelector('strong');
        if (value) value.textContent = entry.text;
      }

      return Array.from(settledValues.keys(), (key) => ({
        key,
        loading: loading.get(key),
        settled: settled.get(key)
      }));
    });
    for (const geometry of pillLoadingGeometry) {
      const loading = geometry.loading;
      const settled = geometry.settled;
      const pillDrift = Math.max(
        Math.abs(loading.x - settled.x),
        Math.abs(loading.width - settled.width),
        Math.abs(loading.center - settled.center)
      );
      const valueWidthDrift = Math.abs(loading.valueWidth - settled.valueWidth);
      const valueTopDrift = Math.abs(loading.valueTop - settled.valueTop);
      const valueHeightDrift = Math.abs(loading.valueHeight - settled.valueHeight);
      const visualWidthDrift = Math.abs(loading.visualWidth - settled.visualWidth);
      const visualCenterXDrift = Math.abs(loading.visualCenterX - settled.visualCenterX);
      const visualCenterYDrift = Math.abs(loading.visualCenterY - settled.visualCenterY);
      const labelDrift = Math.abs(loading.labelX - settled.labelX);
      const loadingCenterOffset = Math.abs(loading.contentCenter - loading.center);
      const settledCenterOffset = Math.abs(settled.contentCenter - settled.center);
      assert(
        pillDrift <= 0.5
          && valueWidthDrift <= 0.5
          && valueTopDrift <= 0.5
          && valueHeightDrift <= 0.5
          && visualWidthDrift <= 0.75
          && visualCenterXDrift <= 0.5
          // Chromium's Linux/FreeType text Range can sit 0.875px above the
          // otherwise identical inline box. Keep the box geometry strict while
          // allowing that cross-platform glyph-metric rounding difference.
          && visualCenterYDrift <= 1
          && labelDrift <= 0.5
          && loadingCenterOffset <= 0.5
          && settledCenterOffset <= 0.5,
        `top continuity ${geometry.key} loading geometry jumps at settlement ${JSON.stringify({
          pillDrift,
          valueWidthDrift,
          valueTopDrift,
          valueHeightDrift,
          visualWidthDrift,
          visualCenterXDrift,
          visualCenterYDrift,
          labelDrift,
          loadingCenterOffset,
          settledCenterOffset,
          loading,
          settled
        })}`
      );
    }

    const shellMotion = await page.evaluate(async () => {
      const value = document.getElementById('hero-chain-uptime-bakers');
      const pill = value?.closest('.top-continuity-stat');
      if (!value || !pill) return { missing: true };
      const identity = value;
      const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
      const active = () => (
        value.getAttribute('aria-busy') === 'true'
        || Boolean(value.__dmMagicCancel)
        || value.classList.contains('is-shuffling')
        || pill.classList.contains('is-shuffling')
      );
      const rect = () => {
        const box = pill.getBoundingClientRect();
        return { y: box.y, height: box.height };
      };
      const runUpdate = async (activeBakers, { duplicate = false, timeout = 4200 } = {}) => {
        const finalText = String(activeBakers);
        const frames = [];
        const startedAt = performance.now();
        window._updateUptimeClock({
          activeBakers,
          stakedRatio: 30.4,
          currentIssuanceRate: 3.1
        });
        let sawActive = false;
        let stableFrames = 0;
        let frameIndex = 0;
        while (performance.now() - startedAt < timeout) {
          await frame();
          frameIndex += 1;
          if (duplicate && frameIndex === 2) {
            window._updateUptimeClock({
              activeBakers,
              stakedRatio: 30.4,
              currentIssuanceRate: 3.1
            });
          }
          const isActive = active();
          sawActive ||= isActive;
          frames.push({
            t: performance.now() - startedAt,
            text: value.textContent,
            active: isActive,
            arrived: pill.classList.contains('hero-arrived'),
            rect: rect()
          });
          if (sawActive && value.textContent === finalText && !isActive) stableFrames += 1;
          else stableFrames = 0;
          if (stableFrames >= 4) break;
        }
        const activeFrames = frames.filter((entry) => entry.active && entry.arrived);
        const intermediateTexts = Array.from(new Set(
          activeFrames.map((entry) => entry.text).filter((text) => text && text !== finalText)
        ));
        return {
          finalText,
          frames,
          sawActive,
          activeFrames: activeFrames.length,
          intermediateTexts,
          firstActiveAt: activeFrames[0]?.t ?? null,
          activeDuration: activeFrames.length > 1
            ? activeFrames[activeFrames.length - 1].t - activeFrames[0].t
            : 0,
          final: value.textContent,
          busy: value.getAttribute('aria-busy'),
          active: active(),
          sameNode: value === identity
        };
      };

      const first = await runUpdate(197, { duplicate: true });
      pill.focus({ preventScroll: true });
      const scrollBefore = { x: window.scrollX, y: window.scrollY };
      const changed = await runUpdate(198, { duplicate: true, timeout: 2600 });
      const focusPreserved = document.activeElement === pill;
      const scrollAfter = { x: window.scrollX, y: window.scrollY };

      window._updateUptimeClock({
        activeBakers: 201,
        stakedRatio: 30.4,
        currentIssuanceRate: 3.1
      });
      await frame();
      await frame();
      const hiddenStarted = active();
      pill.hidden = true;
      window._updateUptimeClock({
        activeBakers: 201,
        stakedRatio: 30.4,
        currentIssuanceRate: 3.1
      });
      const hiddenImmediate = {
        text: value.textContent,
        busy: value.getAttribute('aria-busy'),
        active: active(),
        fresh: pill.classList.contains('dm-fresh')
      };
      pill.hidden = false;
      const hiddenWrites = [];
      const hiddenObserver = new MutationObserver(() => hiddenWrites.push(value.textContent));
      hiddenObserver.observe(value, { childList: true, characterData: true, subtree: true });
      await frame();
      await frame();
      await frame();
      hiddenObserver.disconnect();
      const hiddenSettled = {
        started: hiddenStarted,
        immediate: hiddenImmediate,
        text: value.textContent,
        busy: value.getAttribute('aria-busy'),
        active: active(),
        fresh: pill.classList.contains('dm-fresh'),
        replayWrites: hiddenWrites
      };

      window.__DATA_MAGIC_TEST__.forceMotion = false;
      window._updateUptimeClock({
        activeBakers: 199,
        stakedRatio: 30.4,
        currentIssuanceRate: 3.1
      });
      const reducedImmediate = {
        text: value.textContent,
        busy: value.getAttribute('aria-busy'),
        active: active(),
        fresh: pill.classList.contains('dm-fresh')
      };
      await frame();
      await frame();
      const reducedLater = {
        text: value.textContent,
        busy: value.getAttribute('aria-busy'),
        active: active(),
        fresh: pill.classList.contains('dm-fresh')
      };
      window.__DATA_MAGIC_TEST__.forceMotion = true;

      return {
        missing: false,
        first,
        changed,
        focusPreserved,
        scrollBefore,
        scrollAfter,
        hiddenSettled,
        reducedImmediate,
        reducedLater,
        sameNode: value === identity
      };
    });

    assert(!shellMotion.missing, 'live number production shell is missing the baker continuity value');
    for (const [phase, result] of [['first', shellMotion.first], ['changed', shellMotion.changed]]) {
      const rects = result.frames.filter((entry) => entry.active && entry.arrived).map((entry) => entry.rect);
      const yDrift = rects.length
        ? Math.max(...rects.map((rect) => rect.y)) - Math.min(...rects.map((rect) => rect.y))
        : Infinity;
      const heightDrift = rects.length
        ? Math.max(...rects.map((rect) => rect.height)) - Math.min(...rects.map((rect) => rect.height))
        : Infinity;
      assert(
        result.sawActive
          && result.activeFrames >= 3
          && result.intermediateTexts.length >= 1
          && result.firstActiveAt !== null
          && result.firstActiveAt < (phase === 'first' ? 2200 : 150)
          && result.activeDuration >= 500
          && result.activeDuration < 2200
          && result.final === result.finalText
          && result.busy !== 'true'
          && !result.active
          && result.sameNode
          && yDrift <= (phase === 'first' ? 4.5 : 1)
          && heightDrift <= 1,
        `live number production shell ${phase} motion was not visibly painted and stable ${JSON.stringify({
          activeFrames: result.activeFrames,
          intermediateTexts: result.intermediateTexts,
          firstActiveAt: result.firstActiveAt,
          activeDuration: result.activeDuration,
          final: result.final,
          busy: result.busy,
          active: result.active,
          yDrift,
          heightDrift
        })}`
      );
    }
    assert(
      shellMotion.focusPreserved
        && shellMotion.scrollBefore.x === shellMotion.scrollAfter.x
        && shellMotion.scrollBefore.y === shellMotion.scrollAfter.y
        && shellMotion.sameNode,
      `live number production shell disturbed focus, scroll, or node identity ${JSON.stringify(shellMotion)}`
    );
    assert(
      shellMotion.hiddenSettled.started
        && shellMotion.hiddenSettled.immediate.text === '201'
        && shellMotion.hiddenSettled.immediate.busy !== 'true'
        && !shellMotion.hiddenSettled.immediate.active
        && !shellMotion.hiddenSettled.immediate.fresh
        && shellMotion.hiddenSettled.text === '201'
        && shellMotion.hiddenSettled.busy !== 'true'
        && !shellMotion.hiddenSettled.active
        && !shellMotion.hiddenSettled.fresh
        && shellMotion.hiddenSettled.replayWrites.length === 0,
      `live number production shell replayed a hidden same-target owner ${JSON.stringify(shellMotion.hiddenSettled)}`
    );
    assert(
      shellMotion.reducedImmediate.text === '199'
        && shellMotion.reducedLater.text === '199'
        && shellMotion.reducedImmediate.busy !== 'true'
        && shellMotion.reducedLater.busy !== 'true'
        && !shellMotion.reducedImmediate.active
        && !shellMotion.reducedLater.active
        && !shellMotion.reducedImmediate.fresh
        && !shellMotion.reducedLater.fresh,
      `live number production shell reduced-motion update was not immediate and still ${JSON.stringify(shellMotion)}`
    );

    const bakerValue = page.locator('#hero-chain-uptime-bakers');
    await page.evaluate(() => {
      window._updateUptimeClock({
        activeBakers: 200,
        stakedRatio: 30.4,
        currentIssuanceRate: 3.1
      });
    });
    await page.waitForFunction(() => (
      document.getElementById('hero-chain-uptime-bakers')?.getAttribute('aria-busy') === 'true'
    ), null, { timeout: 1000 });
    await page.waitForTimeout(180);
    const midpointVisual = await bakerValue.evaluate((value) => {
      const style = getComputedStyle(value);
      const rect = value.getBoundingClientRect();
      return {
        text: value.textContent || '',
        busy: value.getAttribute('aria-busy') || '',
        opacity: Number.parseFloat(style.opacity),
        visibility: style.visibility,
        display: style.display,
        width: rect.width,
        height: rect.height
      };
    });
    await page.waitForFunction(() => {
      const value = document.getElementById('hero-chain-uptime-bakers');
      return value?.textContent === '200' && value.getAttribute('aria-busy') !== 'true';
    }, null, { timeout: 2500 });
    assert(
      midpointVisual.text !== '200'
        && midpointVisual.busy === 'true'
        && midpointVisual.opacity > 0
        && midpointVisual.visibility === 'visible'
        && midpointVisual.display !== 'none'
        && midpointVisual.width > 0
        && midpointVisual.height > 0,
      `live number production shell midpoint was not visibly distinct from settlement ${JSON.stringify(midpointVisual)}`
    );

    const scrolledObserverMotion = await page.evaluate(async () => {
      const value = document.getElementById('network-health-front');
      if (!value) return { missing: true };
      const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
      const active = () => (
        value.getAttribute('aria-busy') === 'true'
        || Boolean(value.__dmMagicCancel)
        || value.classList.contains('is-shuffling')
      );

      // Network is intentionally collapsed by default; expose its production
      // card before testing viewport-gated motion on the real shell node.
      const category = value.closest('.chamber-category');
      if (category) {
        category.dataset.chamberExpanded = 'true';
        category.querySelector(':scope > .chamber-category-head > .chamber-category-toggle')
          ?.setAttribute('aria-expanded', 'true');
        const cards = category.querySelector(':scope > .chamber-category-cards');
        if (cards) cards.hidden = false;
        await frame();
        await frame();
      }

      // Isolate this existing production node from its network-health publisher
      // while exercising the shared raw-write observer.
      value.id = 'network-health-front-motion-smoke';
      value.className = 'stat-value network-health-score';
      value.dataset.magic = 'off';
      value.textContent = '99.7%';
      await frame();
      await frame();
      delete value.dataset.magic;
      const html = document.documentElement;
      const body = document.body;
      const htmlScrollBehavior = html.style.scrollBehavior;
      const bodyScrollBehavior = body.style.scrollBehavior;
      html.style.scrollBehavior = 'auto';
      body.style.scrollBehavior = 'auto';
      value.scrollIntoView({ block: 'center', behavior: 'auto' });
      await frame();
      await frame();

      const scrollBefore = window.scrollY;
      const rect = value.getBoundingClientRect();
      const samples = [];
      value.textContent = '42%';
      const startedAt = performance.now();
      let sawActive = false;
      let stableFrames = 0;
      while (performance.now() - startedAt < 2200) {
        await frame();
        const isActive = active();
        sawActive ||= isActive;
        samples.push({ text: value.textContent, active: isActive });
        if (sawActive && value.textContent === '42%' && !isActive) stableFrames += 1;
        else stableFrames = 0;
        if (stableFrames >= 4) break;
      }
      html.style.scrollBehavior = htmlScrollBehavior;
      body.style.scrollBehavior = bodyScrollBehavior;
      value.id = 'network-health-front';
      return {
        missing: false,
        scrollBefore,
        scrollAfter: window.scrollY,
        rect: { top: rect.top, bottom: rect.bottom },
        activeFrames: samples.filter((sample) => sample.active).length,
        intermediate: samples.some((sample) => sample.active && sample.text !== '42%'),
        final: value.textContent,
        busy: value.getAttribute('aria-busy'),
        active: active()
      };
    });
    assert(
      !scrolledObserverMotion.missing
        && scrolledObserverMotion.scrollBefore > 0
        && scrolledObserverMotion.rect.top >= 0
        && scrolledObserverMotion.rect.bottom <= 900
        && scrolledObserverMotion.activeFrames >= 3
        && scrolledObserverMotion.intermediate
        && scrolledObserverMotion.final === '42%'
        && scrolledObserverMotion.busy !== 'true'
        && !scrolledObserverMotion.active,
      `live number production shell skipped a visible scrolled observer update ${JSON.stringify(scrolledObserverMotion)}`
    );

    await page.locator('.top-continuity-stat[data-card-history="total-bakers"]').click();
    const unavailableRoster = page.locator('#top-continuity-baker-roster .top-continuity-baker-error');
    await unavailableRoster.waitFor({ state: 'visible' });
    assert((await unavailableRoster.textContent()).includes('Recent baker changes are unavailable.'),
      'offline live-number shell must disclose unavailable baker history');
    assert(await page.locator('#top-continuity-baker-roster [data-address]').count() === 0,
      'offline live-number shell must not manufacture a populated baker roster');
    const historyReadsBeforeRetry = deniedHistoryReads;
    await unavailableRoster.locator('[data-baker-set-retry]').click();
    await page.waitForFunction(() => {
      const roster = document.getElementById('top-continuity-baker-roster');
      return roster?.getAttribute('aria-busy') === 'false'
        && document.getElementById('top-continuity-explain')?.getAttribute('aria-hidden') === 'false'
        && Boolean(roster.querySelector('.top-continuity-baker-error [data-baker-set-retry]'));
    }, null, { timeout: 5000 }).catch(async (error) => {
      const state = await page.evaluate(() => ({
        rosterBusy: document.getElementById('top-continuity-baker-roster')?.getAttribute('aria-busy'),
        rosterText: document.getElementById('top-continuity-baker-roster')?.textContent?.trim(),
        explainHidden: document.getElementById('top-continuity-explain')?.getAttribute('aria-hidden')
      }));
      throw new Error(`offline baker Retry did not settle: ${JSON.stringify(state)}; ${error.message}`);
    });
    assert(deniedHistoryReads > historyReadsBeforeRetry,
      'offline baker Retry must attempt a new history request');
    assert(await unavailableRoster.isVisible(),
      'offline baker Retry must leave its settled unavailable state visible');
    assert(expectedOfflineIssues.size > 0,
      'offline live-number shell must report its deliberately denied baker baseline');
    await context.close();
    issues.push(...shellIssues.filter((issue) => !expectedOfflineIssues.has(issue)));
  }

  async function smokeLiveNumberMotion(browser, baseUrl) {
    const issues = [];
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      reducedMotion: 'no-preference',
      serviceWorkers: 'block'
    });
    await context.addInitScript(() => {
      window.__DATA_MAGIC_TEST__ = {
        forceMotion: true,
        isInViewport: (element) => element?.dataset?.magicViewport !== 'off'
      };
    });

    const page = await context.newPage();
    attachIssueCollectors(page, 'live number motion', issues);
    const response = await page.goto(`${baseUrl}/offline.html`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `live number motion: fixture route failed with HTTP ${response?.status()}`);

    const motion = await page.evaluate(async () => {
      const magic = await import('/js/effects/data-magic.js?smoke=live-number-motion');
      const animations = await import('/js/ui/animations.js?smoke=live-number-motion');
      const loadStyle = (href) => new Promise((resolve, reject) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        link.addEventListener('load', resolve, { once: true });
        link.addEventListener('error', () => reject(new Error(`Could not load ${href}`)), { once: true });
        document.head.append(link);
      });
      await Promise.all([
        loadStyle('/css/styles.min.css'),
        loadStyle('/css/ledger-flow.min.css'),
        loadStyle('/css/tezos-domains.min.css')
      ]);
      const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
      const settleFrames = async (count = 3) => {
        for (let index = 0; index < count; index += 1) await nextFrame();
      };
      const makeValue = (id, text, viewport = 'on') => {
        const element = document.createElement('output');
        element.id = id;
        element.dataset.magicNumber = 'major';
        element.dataset.magicViewport = viewport;
        element.setAttribute('aria-live', 'polite');
        element.style.cssText = 'display:inline-block;min-width:100px;font-size:24px;line-height:1.4;';
        element.textContent = text;
        return element;
      };
      const observeText = (element) => {
        const writes = [];
        const observer = new MutationObserver(() => writes.push(element.textContent));
        observer.observe(element, { childList: true, characterData: true, subtree: true });
        return { writes, observer };
      };
      const activeMotion = (element) => Boolean(
        element.__dmMagicCancel
        || element.__dmScrambleCancel
        || element.__dmAuroraCancel
        || element.__dmThemeCancel
        || Array.from(element.classList).some((name) => name.startsWith('dm-'))
      );
      const selectTheme = (theme) => {
        document.body.dataset.theme = theme;
        window.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
      };

      document.body.innerHTML = '';
      document.body.style.cssText = 'min-height:4000px;margin:0;padding:24px;';
      selectTheme('matrix');

      // The forced ambient tick must remain decorative: unchanged text is never
      // replaced with glyphs merely because a timer fired.
      const ambientCard = document.createElement('div');
      ambientCard.dataset.stat = 'ambient-smoke';
      ambientCard.style.cssText = 'position:fixed;left:24px;top:24px;';
      const ambientValue = makeValue('ambient-smoke-front', '30.5%');
      ambientCard.append(ambientValue);
      document.body.append(ambientCard);
      const ambientObserver = observeText(ambientValue);
      magic.flushAmbientForTest();
      await settleFrames();
      ambientObserver.observer.disconnect();
      const ambient = {
        text: ambientValue.textContent,
        textWrites: ambientObserver.writes.length,
        decorative: ambientCard.classList.contains('dm-fresh') || ambientValue.classList.contains('dm-fresh')
      };

      // One visible factual delta starts one reveal and settles on the exact
      // value. The stable accessible label + busy state keep glyph frames out of
      // assistive announcements.
      const visible = makeValue('magic-visible', '30.5%');
      visible.setAttribute('aria-label', 'Delegated stake');
      visible.setAttribute('aria-busy', 'false');
      visible.style.position = 'fixed';
      visible.style.left = '24px';
      visible.style.top = '90px';
      document.body.append(visible);
      const visibleIdentity = visible;
      const visibleObserver = observeText(visible);
      let visibleDone = 0;
      const visibleStarted = magic.setMagicNumber(visible, '30.7%', {
        force: true,
        changed: true,
        duration: 96,
        onDone: () => {
          visibleDone += 1;
        }
      });
      await nextFrame();
      const visibleMid = {
        active: activeMotion(visible),
        ariaLabel: visible.getAttribute('aria-label'),
        ariaBusy: visible.getAttribute('aria-busy')
      };
      await settleFrames(20);
      await settleFrames(2);
      visibleObserver.observer.disconnect();
      const visibleResult = {
        started: visibleStarted,
        done: visibleDone,
        text: visible.textContent,
        sameNode: visible === visibleIdentity,
        writes: visibleObserver.writes.length,
        ariaLabel: visible.getAttribute('aria-label'),
        ariaBusy: visible.getAttribute('aria-busy')
      };

      // A caller hint must not override equality: an unchanged background write
      // produces no visual or text animation.
      const unchangedObserver = observeText(visible);
      let unchangedDone = 0;
      const unchangedStarted = magic.setMagicNumber(visible, '30.7%', {
        force: true,
        changed: true,
        duration: 48,
        onDone: () => { unchangedDone += 1; }
      });
      await settleFrames(4);
      unchangedObserver.observer.disconnect();
      const unchanged = {
        started: unchangedStarted,
        done: unchangedDone,
        text: visible.textContent,
        writes: unchangedObserver.writes.length,
        active: activeMotion(visible)
      };

      // A second production writer can publish the same formatted value while
      // the first reveal is still painting it. The duplicate is a no-op: it may
      // not cancel the original owner or fire cleanup callbacks early.
      const duplicate = makeValue('magic-duplicate-owner', '31.0%');
      duplicate.style.cssText += 'position:fixed;left:24px;top:125px;';
      document.body.append(duplicate);
      const duplicateObserver = observeText(duplicate);
      let duplicateOwnerDone = 0;
      let duplicateWriterDone = 0;
      const duplicateOwnerStarted = magic.setMagicNumber(duplicate, '31.1%', {
        force: true,
        changed: true,
        duration: 180,
        onDone: () => { duplicateOwnerDone += 1; }
      });
      await nextFrame();
      const writesBeforeDuplicate = duplicateObserver.writes.length;
      const duplicateWriterStarted = magic.setMagicNumber(duplicate, '31.1%', {
        force: true,
        changed: true,
        duration: 180,
        onDone: () => { duplicateWriterDone += 1; }
      });
      const duplicateMid = {
        active: activeMotion(duplicate),
        ownerDone: duplicateOwnerDone,
        writerDone: duplicateWriterDone,
        ariaBusy: duplicate.getAttribute('aria-busy')
      };
      await settleFrames(20);
      duplicateObserver.observer.disconnect();
      const duplicateOwner = {
        ownerStarted: duplicateOwnerStarted,
        writerStarted: duplicateWriterStarted,
        mid: duplicateMid,
        ownerDone: duplicateOwnerDone,
        writerDone: duplicateWriterDone,
        writesBeforeDuplicate,
        writesAfterDuplicate: duplicateObserver.writes.length - writesBeforeDuplicate,
        text: duplicate.textContent,
        active: activeMotion(duplicate),
        ariaBusy: duplicate.getAttribute('aria-busy')
      };

      // Several changed cards begin together, finish within one animation
      // budget, and retain reader state.
      const rail = document.createElement('div');
      rail.id = 'magic-motion-rail';
      rail.style.cssText = 'position:fixed;left:220px;top:24px;width:280px;overflow:auto;white-space:nowrap;';
      const focus = document.createElement('button');
      focus.textContent = 'Keep focus';
      focus.style.width = '140px';
      rail.append(focus);
      selectTheme('clean');
      const concurrentCards = Array.from({ length: 5 }, (_, index) => {
        const card = document.createElement('article');
        card.dataset.stat = `magic-concurrent-${index}`;
        card.style.display = 'inline-block';
        card.innerHTML = `<div class="card-inner">
          <output id="magic-concurrent-${index}-front" data-magic-number="major" aria-live="polite"
            style="display:inline-block;width:150px;font-size:24px;">${10 + index}%</output>
          <output id="magic-concurrent-${index}-back" data-magic-number="major"
            style="display:none;">${10 + index}%</output>
        </div>`;
        rail.append(card);
        return card;
      });
      document.body.append(rail);
      rail.scrollLeft = 110;
      focus.focus({ preventScroll: true });
      const concurrentNodes = concurrentCards.map((card) => card.querySelector('[id$="-front"]'));
      const startedAt = performance.now();
      const concurrentStarts = await Promise.all(concurrentCards.map((card, index) => (
        animations.flipCard(card, 20 + index, (value) => `${value}%`)
      )));
      const dispatchElapsed = performance.now() - startedAt;
      for (let frame = 0; frame < 40 && concurrentNodes.some(activeMotion); frame += 1) {
        await nextFrame();
      }
      const concurrent = {
        dispatchElapsed,
        settleElapsed: performance.now() - startedAt,
        starts: concurrentStarts,
        values: concurrentCards.map((card) => card.querySelector('[id$="-front"]').textContent),
        backs: concurrentCards.map((card) => card.querySelector('[id$="-back"]').textContent),
        sameNodes: concurrentCards.every((card, index) => card.querySelector('[id$="-front"]') === concurrentNodes[index]),
        focused: document.activeElement === focus,
        scrollLeft: rail.scrollLeft
      };

      const makeStatCard = (id, text) => {
        const card = document.createElement('article');
        card.dataset.stat = id;
        card.innerHTML = `<div class="card-inner">
          <output id="${id}-front" data-magic-number="major" aria-live="polite"
            style="display:inline-block;min-width:100px;font-size:24px;">${text}</output>
          <output id="${id}-back" data-magic-number="major" style="display:none;">${text}</output>
        </div>`;
        document.body.append(card);
        return card;
      };

      // Live proposal/period strings use the same owned theme path as numbers.
      // Clean renders the final copy through animated character spans rather
      // than silently settling now that the full-card flip is gone.
      const textDeltaCard = makeStatCard('magic-text-delta', 'Exploration');
      const textDeltaFront = textDeltaCard.querySelector('#magic-text-delta-front');
      const textDeltaIdentity = textDeltaFront;
      const textDeltaStarted = await animations.flipCard(textDeltaCard, 'Promotion', String);
      await nextFrame();
      const textDeltaMid = {
        active: activeMotion(textDeltaFront),
        text: textDeltaFront.textContent,
        childCount: textDeltaFront.children.length,
        ariaBusy: textDeltaFront.getAttribute('aria-busy'),
        fresh: textDeltaCard.querySelector('.card-inner')?.classList.contains('dm-fresh') || false
      };
      await settleFrames(30);
      const textDelta = {
        started: textDeltaStarted,
        mid: textDeltaMid,
        text: textDeltaFront.textContent,
        back: textDeltaCard.querySelector('#magic-text-delta-back').textContent,
        sameNode: textDeltaFront === textDeltaIdentity,
        active: activeMotion(textDeltaFront),
        ariaBusy: textDeltaFront.getAttribute('aria-busy')
      };

      // Loading/error takeover owns both the value and its freshness cue.
      const statusCard = makeStatCard('magic-status-pulse', '10');
      const statusFront = statusCard.querySelector('#magic-status-pulse-front');
      const statusInner = statusCard.querySelector('.card-inner');
      const statusStarted = await animations.flipCard(statusCard, 11, String);
      await nextFrame();
      const statusBeforeError = {
        active: activeMotion(statusFront),
        fresh: statusInner.classList.contains('dm-fresh')
      };
      animations.showError('magic-status-pulse', 'Unavailable');
      const statusImmediate = {
        text: statusFront.textContent,
        active: activeMotion(statusFront),
        fresh: statusInner.classList.contains('dm-fresh'),
        error: statusFront.classList.contains('error-state')
      };
      await settleFrames(20);
      const statusTakeover = {
        started: statusStarted,
        beforeError: statusBeforeError,
        immediate: statusImmediate,
        text: statusFront.textContent,
        back: statusCard.querySelector('#magic-status-pulse-back').textContent,
        active: activeMotion(statusFront),
        fresh: statusInner.classList.contains('dm-fresh')
      };

      const recoveryStarted = await animations.flipCard(statusCard, 12, String);
      await nextFrame();
      const recoveryMid = {
        text: statusFront.textContent,
        active: activeMotion(statusFront),
        busy: statusFront.getAttribute('aria-busy'),
        error: statusFront.classList.contains('error-state')
      };
      await settleFrames(30);
      const statusRecovery = {
        started: recoveryStarted,
        mid: recoveryMid,
        text: statusFront.textContent,
        back: statusCard.querySelector('#magic-status-pulse-back').textContent,
        active: activeMotion(statusFront),
        busy: statusFront.getAttribute('aria-busy'),
        error: statusFront.classList.contains('error-state')
      };

      // Same-value publishers preserve an active reveal owner; an explicit
      // instant status write still settles that owner immediately.
      const sameActiveTarget = makeStatCard('magic-same-active-target', '400');
      animations.revealStat('magic-same-active-target', 444, String);
      await nextFrame();
      const sameActiveFront = sameActiveTarget.querySelector('#magic-same-active-target-front');
      const sameActiveFlipStarted = await animations.flipCard(sameActiveTarget, 444, String);
      const sameActiveAfterDuplicate = {
        text: sameActiveFront.textContent,
        active: activeMotion(sameActiveFront),
        ariaBusy: sameActiveFront.getAttribute('aria-busy')
      };
      await settleFrames(60);

      const sameActiveOffscreenTarget = makeStatCard('magic-same-active-offscreen', '500');
      animations.revealStat('magic-same-active-offscreen', 555, String);
      await nextFrame();
      const sameActiveOffscreenFront = sameActiveOffscreenTarget.querySelector('#magic-same-active-offscreen-front');
      sameActiveOffscreenFront.dataset.magicViewport = 'off';
      const sameActiveOffscreenFlipStarted = await animations.flipCard(sameActiveOffscreenTarget, 555, String);
      const sameActiveOffscreenImmediate = {
        text: sameActiveOffscreenFront.textContent,
        active: activeMotion(sameActiveOffscreenFront),
        ariaBusy: sameActiveOffscreenFront.getAttribute('aria-busy'),
        fresh: sameActiveOffscreenTarget.querySelector('.card-inner')?.classList.contains('dm-fresh') || false
      };
      sameActiveOffscreenFront.dataset.magicViewport = 'on';
      const sameActiveOffscreenWrites = observeText(sameActiveOffscreenFront);
      await settleFrames(30);
      sameActiveOffscreenWrites.observer.disconnect();

      const sameStartedTarget = makeStatCard('magic-same-started-target', '300');
      animations.revealStat('magic-same-started-target', 333, String);
      await nextFrame();
      const sameStartedFront = sameStartedTarget.querySelector('#magic-same-started-target-front');
      const sameStartedWrites = observeText(sameStartedFront);
      animations.updateStatInstant('magic-same-started-target', 333, String);
      await settleFrames(3);
      const sameStartedAfterInstant = sameStartedFront.textContent;
      sameStartedWrites.writes.length = 0;
      await settleFrames(60);
      sameStartedWrites.observer.disconnect();
      const sameValueRace = {
        active: {
          flipStarted: sameActiveFlipStarted,
          afterDuplicate: sameActiveAfterDuplicate,
          finalFront: sameActiveFront.textContent,
          finalBack: sameActiveTarget.querySelector('#magic-same-active-target-back').textContent,
          active: activeMotion(sameActiveFront),
          ariaBusy: sameActiveFront.getAttribute('aria-busy')
        },
        offscreen: {
          flipStarted: sameActiveOffscreenFlipStarted,
          immediate: sameActiveOffscreenImmediate,
          finalFront: sameActiveOffscreenFront.textContent,
          finalBack: sameActiveOffscreenTarget.querySelector('#magic-same-active-offscreen-back').textContent,
          replayWrites: [...sameActiveOffscreenWrites.writes],
          active: activeMotion(sameActiveOffscreenFront),
          ariaBusy: sameActiveOffscreenFront.getAttribute('aria-busy')
        },
        started: {
          afterInstant: sameStartedAfterInstant,
          finalFront: sameStartedFront.textContent,
          finalBack: sameStartedTarget.querySelector('#magic-same-started-target-back').textContent,
          lateWrites: [...sameStartedWrites.writes],
          loading: sameStartedFront.classList.contains('loading'),
          active: activeMotion(sameStartedFront)
        }
      };

      // If an active same-target value becomes non-visible, the duplicate write
      // is a settle request rather than permission to replay when it returns.
      const sameOffscreen = makeValue('magic-same-offscreen', '450');
      sameOffscreen.style.cssText += 'position:fixed;left:24px;top:190px;';
      document.body.append(sameOffscreen);
      let sameOffscreenOwnerDone = 0;
      let sameOffscreenWriterDone = 0;
      const sameOffscreenOwnerStarted = magic.setMagicNumber(sameOffscreen, '451', {
        force: true,
        changed: true,
        duration: 180,
        onDone: () => { sameOffscreenOwnerDone += 1; }
      });
      await nextFrame();
      sameOffscreen.dataset.magicViewport = 'off';
      const sameOffscreenWriterStarted = magic.setMagicNumber(sameOffscreen, '451', {
        force: true,
        changed: true,
        duration: 180,
        onDone: () => { sameOffscreenWriterDone += 1; }
      });
      const sameOffscreenImmediate = {
        text: sameOffscreen.textContent,
        active: activeMotion(sameOffscreen),
        ownerDone: sameOffscreenOwnerDone,
        writerDone: sameOffscreenWriterDone,
        ariaBusy: sameOffscreen.getAttribute('aria-busy')
      };
      const sameOffscreenWrites = observeText(sameOffscreen);
      sameOffscreen.dataset.magicViewport = 'on';
      await settleFrames(20);
      sameOffscreenWrites.observer.disconnect();
      const sameTargetOffscreen = {
        ownerStarted: sameOffscreenOwnerStarted,
        writerStarted: sameOffscreenWriterStarted,
        immediate: sameOffscreenImmediate,
        text: sameOffscreen.textContent,
        replayWrites: [...sameOffscreenWrites.writes],
        active: activeMotion(sameOffscreen),
        ariaBusy: sameOffscreen.getAttribute('aria-busy')
      };

      // Hidden/offscreen changes commit their final values silently and are not
      // queued to replay when the reader later reveals or scrolls to them.
      const offscreen = makeValue('magic-offscreen', '40%', 'off');
      offscreen.style.cssText += 'position:absolute;top:2600px;';
      document.body.append(offscreen);
      const offscreenStart = magic.setMagicNumber(offscreen, '41%', {
        force: true,
        changed: true,
        duration: 72
      });
      await settleFrames(2);
      const offscreenObserver = observeText(offscreen);
      offscreen.dataset.magicViewport = 'on';
      offscreen.scrollIntoView({ block: 'center' });
      await settleFrames(5);
      offscreenObserver.observer.disconnect();

      const hidden = makeValue('magic-hidden', '50%', 'off');
      hidden.hidden = true;
      document.body.append(hidden);
      const hiddenStart = magic.setMagicNumber(hidden, '51%', {
        force: true,
        changed: true,
        duration: 72
      });
      await settleFrames(2);
      const hiddenObserver = observeText(hidden);
      hidden.hidden = false;
      hidden.dataset.magicViewport = 'on';
      await settleFrames(5);
      hiddenObserver.observer.disconnect();

      // Horizontal clipping is offscreen too. Exercise the real geometry path,
      // not the deterministic viewport hook, so a value beyond either side of
      // the viewport cannot animate or queue a later replay.
      const viewportHook = window.__DATA_MAGIC_TEST__.isInViewport;
      window.__DATA_MAGIC_TEST__.isInViewport = null;
      const horizontal = makeValue('magic-horizontal-offscreen', '60%');
      horizontal.style.cssText += 'position:fixed;left:5000px;top:24px;';
      document.body.append(horizontal);
      const horizontalStart = magic.setMagicNumber(horizontal, '61%', {
        force: true,
        changed: true,
        duration: 72
      });
      await settleFrames(2);
      const horizontalObserver = observeText(horizontal);
      horizontal.style.left = '24px';
      await settleFrames(5);
      horizontalObserver.observer.disconnect();
      window.__DATA_MAGIC_TEST__.isInViewport = viewportHook;
      const deferred = {
        offscreen: {
          started: offscreenStart,
          text: offscreen.textContent,
          replayWrites: offscreenObserver.writes.length,
          active: activeMotion(offscreen)
        },
        hidden: {
          started: hiddenStart,
          text: hidden.textContent,
          replayWrites: hiddenObserver.writes.length,
          active: activeMotion(hidden)
        },
        horizontal: {
          started: horizontalStart,
          text: horizontal.textContent,
          replayWrites: horizontalObserver.writes.length,
          active: activeMotion(horizontal)
        }
      };

      // A reader may be selecting text across a live statistic. Preserve that
      // exact range and commit only the settled factual string—never transient
      // glyphs—while the selection intersects the target.
      const selectionFixture = document.createElement('p');
      selectionFixture.style.cssText = 'position:fixed;left:24px;top:230px;font-size:24px;';
      const selectionBefore = document.createElement('span');
      selectionBefore.textContent = 'Selected ';
      const selectionValue = makeValue('magic-selected', '400');
      const selectionAfter = document.createElement('span');
      selectionAfter.textContent = ' suffix';
      selectionFixture.append(selectionBefore, selectionValue, selectionAfter);
      document.body.append(selectionFixture);
      const selection = document.getSelection();
      const selectedRange = document.createRange();
      selectedRange.setStart(selectionBefore.firstChild, 0);
      selectedRange.setEnd(selectionAfter.firstChild, selectionAfter.firstChild.length);
      selection.removeAllRanges();
      selection.addRange(selectedRange);
      const selectionAnchor = selection.anchorNode;
      const selectionFocus = selection.focusNode;
      const selectedWrites = observeText(selectionValue);
      let selectedDone = 0;
      const selectedStarted = magic.setMagicNumber(selectionValue, '401', {
        force: true,
        changed: true,
        duration: 90,
        onDone: () => { selectedDone += 1; }
      });
      await settleFrames(8);
      selectedWrites.observer.disconnect();
      const selectionResult = {
        started: selectedStarted,
        done: selectedDone,
        text: selectionValue.textContent,
        writes: [...selectedWrites.writes],
        active: activeMotion(selectionValue),
        rangeCount: selection.rangeCount,
        anchorPreserved: selection.anchorNode === selectionAnchor,
        focusPreserved: selection.focusNode === selectionFocus,
        selectedText: selection.toString()
      };
      selection.removeAllRanges();

      // A viewport-coordinate check is insufficient when an overflow ancestor
      // clips the entire number. Commit silently, then prove revealing the child
      // later cannot replay the old update.
      const clippedViewportHook = window.__DATA_MAGIC_TEST__.isInViewport;
      window.__DATA_MAGIC_TEST__.isInViewport = null;
      const clip = document.createElement('div');
      clip.style.cssText = 'position:fixed;left:24px;top:320px;width:120px;height:50px;overflow:hidden;';
      const clippedValue = makeValue('magic-clipped', '500');
      clippedValue.style.cssText += 'position:absolute;left:200px;top:0;width:100px;';
      clip.append(clippedValue);
      document.body.append(clip);
      const clipRect = clip.getBoundingClientRect();
      const clippedRect = clippedValue.getBoundingClientRect();
      const clippedStarted = magic.setMagicNumber(clippedValue, '501', {
        force: true,
        changed: true,
        duration: 90
      });
      await settleFrames(3);
      const clippedWrites = observeText(clippedValue);
      clippedValue.style.left = '0';
      await settleFrames(8);
      clippedWrites.observer.disconnect();
      window.__DATA_MAGIC_TEST__.isInViewport = clippedViewportHook;
      const clippedResult = {
        started: clippedStarted,
        text: clippedValue.textContent,
        replayWrites: clippedWrites.writes.length,
        active: activeMotion(clippedValue),
        rectInsideWindow: clippedRect.left >= 0
          && clippedRect.right <= window.innerWidth
          && clippedRect.top >= 0
          && clippedRect.bottom <= window.innerHeight,
        outsideAncestorClip: clippedRect.left >= clipRect.right
      };

      // Superseded reveals must cancel cleanly; only the newest factual value may
      // remain after all pending frames.
      window.scrollTo(0, 0);
      const rapid = makeValue('magic-rapid', '100');
      rapid.style.cssText += 'position:fixed;left:24px;top:150px;';
      document.body.append(rapid);
      magic.setMagicNumber(rapid, '101', { force: true, changed: true, duration: 140 });
      magic.setMagicNumber(rapid, '102', { force: true, changed: true, duration: 110 });
      let rapidDone = 0;
      magic.setMagicNumber(rapid, '103', {
        force: true,
        changed: true,
        duration: 64,
        onDone: () => { rapidDone += 1; }
      });
      await settleFrames(20);
      const rapidResult = {
        text: rapid.textContent,
        finalText: rapid.__dmMagicFinalText,
        done: rapidDone,
        active: activeMotion(rapid)
      };

      // Every public theme explicitly dispatches its documented personality and
      // settles the factual string exactly.
      const expectedModes = {
        aurora: 'resolve',
        matrix: 'scramble',
        hen: 'scramble',
        default: 'focus',
        void: 'focus',
        ember: 'kindle',
        signal: 'sweep',
        nerv: 'scramble',
        clean: 'delta',
        dark: 'focus',
        bubblegum: 'scramble',
        abyss: 'sonar',
        moss: 'growth',
        valley: 'growth',
        warzone: 'lock'
      };
      const themes = {};
      let themeIndex = 0;
      for (const [theme, expectedMode] of Object.entries(expectedModes)) {
        selectTheme(theme);
        const themeMagic = await import(`/js/effects/data-magic.js?smoke-theme=${theme}`);
        const element = makeValue(`magic-theme-${theme}`, `${themeIndex + 1}`);
        element.style.cssText += `position:fixed;left:${540 + (themeIndex % 4) * 130}px;top:${24 + Math.floor(themeIndex / 4) * 70}px;`;
        document.body.append(element);
        const started = themeMagic.setMagicNumber(element, `${themeIndex + 101}`, {
          force: true,
          changed: true,
          duration: 42,
          onDone: () => {}
        });
        await nextFrame();
        const mid = {
          active: activeMotion(element),
          ariaLabel: element.getAttribute('aria-label'),
          ariaBusy: element.getAttribute('aria-busy')
        };
        await settleFrames(20);
        themes[theme] = {
          expectedMode,
          mode: themeMagic.getPersonality().mode,
          started,
          mid,
          text: element.textContent,
          finalText: element.__dmMagicFinalText,
          ariaBusy: element.getAttribute('aria-busy')
        };
        themeIndex += 1;
      }

      // Character-based themes must occupy the exact settled text geometry in
      // every Chamber metric family. These are the real component selectors
      // whose old descendant rules could turn renderer glyphs into block rows.
      const characterLayoutFamilies = [
        {
          key: 'chamber-entry',
          markup: '<div class="chamber-entry-metric"><span>Label</span><strong>Old</strong></div>'
        },
        {
          key: 'tezlink-entry',
          markup: '<div class="tezlink-entry-metric"><span>Label</span><strong>Old</strong></div>'
        },
        {
          key: 'metric-grid',
          markup: '<div class="lb-metric-grid"><div><span>Label</span><strong>Old</strong></div></div>'
        },
        {
          key: 'domains-entry',
          markup: '<div class="td-entry-metric"><span>Label</span><strong>Old</strong><em>Note</em></div>'
        },
        {
          key: 'domains-pulse',
          markup: '<div class="td-pulse-metric"><span>Label</span><strong>Old</strong><em>Note</em></div>'
        },
        {
          key: 'ctez-console',
          markup: '<div class="ctez-console-metric"><span>Label</span><strong>Old</strong></div>'
        },
        {
          key: 'governance-now',
          markup: '<div class="chamber-now-card"><span>Label</span><strong>Old</strong><small>Note</small></div>'
        },
        {
          key: 'ledger-flow-entry',
          markup: '<div class="ledger-flow-entry-metrics"><div class="chamber-entry-metric"><span>Label</span><strong>Old</strong><small>Note</small></div></div>'
        }
      ];
      const characterThemes = {
        clean: '.dm-delta-char',
        moss: '.dm-mycelial-char',
        valley: '.dm-mycelial-char',
        warzone: '.dm-lock-char'
      };
      const geometryHost = document.createElement('section');
      geometryHost.id = 'magic-character-geometry';
      geometryHost.style.cssText = 'position:fixed;left:-5000px;top:0;width:600px;';
      const geometryFixtures = characterLayoutFamilies.map((family) => {
        const slot = document.createElement('div');
        slot.dataset.magicGeometryFamily = family.key;
        slot.style.width = '600px';
        slot.innerHTML = family.markup;
        const root = slot.firstElementChild;
        const target = root.querySelector('strong');
        target.dataset.magicNumber = 'major';
        target.dataset.magicViewport = 'on';
        geometryHost.append(slot);
        return { ...family, slot, root, target, parent: target.parentElement };
      });
      document.body.append(geometryHost);

      const focusGuard = document.createElement('button');
      focusGuard.textContent = 'Reading state';
      focusGuard.style.cssText = 'position:fixed;left:24px;bottom:24px;';
      const selectionGuard = document.createElement('p');
      selectionGuard.textContent = 'Selected reader text stays put';
      selectionGuard.style.cssText = 'position:fixed;left:-5000px;top:0;';
      document.body.append(focusGuard, selectionGuard);
      document.documentElement.style.scrollBehavior = 'auto';
      window.scrollTo(0, 420);
      await nextFrame();
      focusGuard.focus({ preventScroll: true });
      const guardRange = document.createRange();
      guardRange.selectNodeContents(selectionGuard);
      const guardSelection = window.getSelection();
      guardSelection.removeAllRanges();
      guardSelection.addRange(guardRange);
      const readingStateBefore = {
        scrollY: window.scrollY,
        focus: document.activeElement,
        selection: guardSelection.toString(),
        host: geometryHost
      };

      const characterGeometry = {};
      for (const [theme, charSelector] of Object.entries(characterThemes)) {
        selectTheme(theme);
        const themeMagic = await import(`/js/effects/data-magic.js?smoke-character-layout=${theme}`);
        const finalText = `${theme} 2048`;
        const baselines = geometryFixtures.map((fixture) => {
          fixture.target.textContent = finalText;
          const targetRect = fixture.target.getBoundingClientRect();
          const rootRect = fixture.root.getBoundingClientRect();
          fixture.target.textContent = 'Old';
          fixture.target.__dmMagicFinalText = 'Old';
          return {
            targetWidth: targetRect.width,
            targetHeight: targetRect.height,
            rootWidth: rootRect.width,
            rootHeight: rootRect.height
          };
        });
        const starts = geometryFixtures.map((fixture) => themeMagic.setMagicValue(fixture.target, finalText, {
          force: true,
          changed: true,
          duration: 96,
          previousText: 'Old'
        }));
        await nextFrame();
        const active = geometryFixtures.map((fixture, index) => {
          const targetRect = fixture.target.getBoundingClientRect();
          const rootRect = fixture.root.getBoundingClientRect();
          const characters = Array.from(fixture.target.querySelectorAll(charSelector));
          const words = Array.from(fixture.target.querySelectorAll('.dm-glyph-word'));
          return {
            family: fixture.key,
            started: starts[index],
            charCount: characters.length,
            wordCount: words.length,
            charLines: new Set(characters.map((character) => Math.round(character.getBoundingClientRect().top))).size,
            inlineChars: characters.every((character) => getComputedStyle(character).display === 'inline-block'),
            inlineWords: words.every((word) => (
              getComputedStyle(word).display === 'inline-block'
                && getComputedStyle(word).whiteSpace === 'nowrap'
            )),
            targetWidthDelta: Math.abs(targetRect.width - baselines[index].targetWidth),
            targetHeightDelta: Math.abs(targetRect.height - baselines[index].targetHeight),
            rootWidthDelta: Math.abs(rootRect.width - baselines[index].rootWidth),
            rootHeightDelta: Math.abs(rootRect.height - baselines[index].rootHeight),
            sameTarget: fixture.root.querySelector('strong') === fixture.target,
            sameParent: fixture.target.parentElement === fixture.parent
          };
        });
        await settleFrames(14);
        characterGeometry[theme] = {
          active,
          settled: geometryFixtures.map((fixture) => ({
            family: fixture.key,
            text: fixture.target.textContent,
            childCount: fixture.target.children.length,
            sameTarget: fixture.root.querySelector('strong') === fixture.target,
            sameParent: fixture.target.parentElement === fixture.parent
          })),
          readingState: {
            scrollDelta: Math.abs(window.scrollY - readingStateBefore.scrollY),
            focused: document.activeElement === readingStateBefore.focus,
            selection: window.getSelection().toString(),
            sameHost: document.getElementById('magic-character-geometry') === readingStateBefore.host
          }
        };
      }

      // Reduced motion is an immediate factual commit with no transitional
      // classes, but still calls completion exactly once.
      window.__DATA_MAGIC_TEST__.forceMotion = false;
      selectTheme('matrix');
      const reduced = makeValue('magic-reduced', '70%');
      document.body.append(reduced);
      const reducedObserver = observeText(reduced);
      let reducedDone = 0;
      magic.setMagicNumber(reduced, '71%', {
        force: true,
        changed: true,
        duration: 100,
        onDone: () => { reducedDone += 1; }
      });
      const reducedImmediate = {
        text: reduced.textContent,
        done: reducedDone,
        active: activeMotion(reduced),
        ariaBusy: reduced.getAttribute('aria-busy')
      };
      await settleFrames(4);
      reducedObserver.observer.disconnect();
      const reducedResult = {
        ...reducedImmediate,
        laterText: reduced.textContent,
        laterDone: reducedDone,
        writes: reducedObserver.writes.length
      };

      // External live surfaces often write text directly and rely on the shared
      // MutationObserver. An offscreen write must be adopted as the latest final
      // value even though it receives no reveal; exposing it and re-setting that
      // exact value later must remain a no-op.
      window.__DATA_MAGIC_TEST__.forceMotion = true;
      selectTheme('matrix');
      const observerMagic = await import('/js/effects/data-magic.js?smoke=live-number-observer');
      const observerValue = makeValue('magic-observer-offscreen', '80%', 'off');
      observerValue.classList.add('stat-value');
      document.body.append(observerValue);
      observerMagic.initDataMagic();
      observerValue.textContent = '82%';
      await settleFrames(3);
      const adoptedBeforeReveal = observerValue.__dmMagicFinalText;
      const observerWrites = observeText(observerValue);
      observerValue.dataset.magicViewport = 'on';
      const observerReplayStarted = observerMagic.setMagicNumber(observerValue, '82%', {
        force: true,
        changed: true,
        duration: 60
      });
      await settleFrames(8);
      observerWrites.observer.disconnect();
      const observerResult = {
        adoptedBeforeReveal,
        replayStarted: observerReplayStarted,
        replayWrites: observerWrites.writes.length,
        text: observerValue.textContent,
        finalText: observerValue.__dmMagicFinalText,
        active: activeMotion(observerValue)
      };

      // If a visible reveal is in flight when layout moves the target offscreen,
      // a newer external value must cancel that reveal. No old rAF may repaint
      // over the adopted final value after the observer has reconciled it.
      const movingValue = makeValue('magic-moving-offscreen', '300');
      movingValue.classList.add('stat-value');
      movingValue.dataset.magic = 'off';
      movingValue.style.cssText += 'position:fixed;left:220px;top:230px;';
      document.body.append(movingValue);
      await settleFrames(2);
      delete movingValue.dataset.magic;
      movingValue.textContent = '301';
      await settleFrames(2);
      const movingStarted = activeMotion(movingValue);
      movingValue.dataset.magicViewport = 'off';
      const movingWrites = observeText(movingValue);
      movingValue.textContent = '302';
      await settleFrames(3);
      const adoptedMovingFinal = movingValue.__dmMagicFinalText;
      movingWrites.writes.length = 0;
      await settleFrames(20);
      movingWrites.observer.disconnect();
      const movingResult = {
        started: movingStarted,
        adoptedFinal: adoptedMovingFinal,
        text: movingValue.textContent,
        finalText: movingValue.__dmMagicFinalText,
        lateWrites: [...movingWrites.writes],
        active: activeMotion(movingValue)
      };

      return {
        ambient,
        visibleMid,
        visible: visibleResult,
        unchanged,
        duplicateOwner,
        concurrent,
        textDelta,
        statusTakeover,
        statusRecovery,
        sameValueRace,
        sameTargetOffscreen,
        deferred,
        selection: selectionResult,
        clipped: clippedResult,
        rapid: rapidResult,
        themes,
        characterGeometry,
        reduced: reducedResult,
        observer: observerResult,
        moving: movingResult
      };
    });
    assert(
      motion.ambient.text === '30.5%' && motion.ambient.textWrites === 0 && motion.ambient.decorative,
      `live number motion: forced ambient tick mutated unchanged text or lost its decorative pulse ${JSON.stringify(motion.ambient)}`
    );
    assert(
      motion.visible.started === true
        && motion.visibleMid.active
        && motion.visibleMid.ariaLabel === '30.7%'
        && motion.visibleMid.ariaBusy === 'true'
        && motion.visible.done === 1
        && motion.visible.text === '30.7%'
        && motion.visible.sameNode
        && motion.visible.writes > 0
        && motion.visible.ariaLabel === 'Delegated stake'
        && motion.visible.ariaBusy === 'false',
      `live number motion: one visible delta did not animate once, stay accessible, and settle exactly ${JSON.stringify({ mid: motion.visibleMid, final: motion.visible })}`
    );
    assert(
      motion.unchanged.started === false
        && motion.unchanged.done === 1
        && motion.unchanged.text === '30.7%'
        && motion.unchanged.writes === 0
        && !motion.unchanged.active,
      `live number motion: unchanged background update replayed text motion ${JSON.stringify(motion.unchanged)}`
    );
    assert(
      motion.duplicateOwner.ownerStarted
        && motion.duplicateOwner.writerStarted === false
        && motion.duplicateOwner.mid.active
        && motion.duplicateOwner.mid.ownerDone === 0
        && motion.duplicateOwner.mid.writerDone === 0
        && motion.duplicateOwner.mid.ariaBusy === 'true'
        && motion.duplicateOwner.ownerDone === 1
        && motion.duplicateOwner.writerDone === 0
        && motion.duplicateOwner.writesAfterDuplicate > 0
        && motion.duplicateOwner.text === '31.1%'
        && !motion.duplicateOwner.active
        && motion.duplicateOwner.ariaBusy !== 'true',
      `live number motion: a duplicate same-target writer cancelled the active owner ${JSON.stringify(motion.duplicateOwner)}`
    );
    assert(
      motion.concurrent.starts.every(Boolean)
        && motion.concurrent.dispatchElapsed < 250
        && motion.concurrent.settleElapsed < 1500
        && motion.concurrent.values.join(',') === '20%,21%,22%,23%,24%'
        && motion.concurrent.backs.join(',') === '20%,21%,22%,23%,24%'
        && motion.concurrent.sameNodes
        && motion.concurrent.focused
        && Math.abs(motion.concurrent.scrollLeft - 110) < 1,
      `live number motion: concurrent deltas blocked sequentially or disturbed reading state ${JSON.stringify(motion.concurrent)}`
    );
    assert(
      motion.textDelta.started
        && motion.textDelta.mid.active
        && motion.textDelta.mid.text === 'Promotion'
        && motion.textDelta.mid.childCount > 0
        && motion.textDelta.mid.ariaBusy === 'true'
        && motion.textDelta.mid.fresh
        && motion.textDelta.text === 'Promotion'
        && motion.textDelta.back === 'Promotion'
        && motion.textDelta.sameNode
        && !motion.textDelta.active
        && motion.textDelta.ariaBusy !== 'true',
      `live number motion: textual stat delta settled without its owned theme effect ${JSON.stringify(motion.textDelta)}`
    );
    assert(
      motion.statusTakeover.started
        && motion.statusTakeover.beforeError.active
        && motion.statusTakeover.beforeError.fresh
        && motion.statusTakeover.immediate.text === 'Unavailable'
        && !motion.statusTakeover.immediate.active
        && !motion.statusTakeover.immediate.fresh
        && motion.statusTakeover.immediate.error
        && motion.statusTakeover.text === 'Unavailable'
        && motion.statusTakeover.back === 'Unavailable'
        && !motion.statusTakeover.active
        && !motion.statusTakeover.fresh,
      `live number motion: loading/error takeover retained stale motion or freshness ${JSON.stringify(motion.statusTakeover)}`
    );
    assert(
      motion.statusRecovery.started
        && motion.statusRecovery.mid.active
        && motion.statusRecovery.mid.busy === 'true'
        && !motion.statusRecovery.mid.error
        && motion.statusRecovery.text === '12'
        && motion.statusRecovery.back === '12'
        && !motion.statusRecovery.active
        && motion.statusRecovery.busy !== 'true'
        && !motion.statusRecovery.error,
      `live number motion: successful data did not recover from error styling with its visible effect ${JSON.stringify(motion.statusRecovery)}`
    );
    assert(
      motion.sameValueRace.active.flipStarted === false
        && motion.sameValueRace.active.afterDuplicate.active
        && motion.sameValueRace.active.afterDuplicate.ariaBusy === 'true'
        && motion.sameValueRace.active.finalFront === '444'
        && motion.sameValueRace.active.finalBack === '444'
        && !motion.sameValueRace.active.active
        && motion.sameValueRace.active.ariaBusy !== 'true'
        && motion.sameValueRace.offscreen.flipStarted === false
        && motion.sameValueRace.offscreen.immediate.text === '555'
        && !motion.sameValueRace.offscreen.immediate.active
        && motion.sameValueRace.offscreen.immediate.ariaBusy !== 'true'
        && !motion.sameValueRace.offscreen.immediate.fresh
        && motion.sameValueRace.offscreen.finalFront === '555'
        && motion.sameValueRace.offscreen.finalBack === '555'
        && motion.sameValueRace.offscreen.replayWrites.length === 0
        && !motion.sameValueRace.offscreen.active
        && motion.sameValueRace.offscreen.ariaBusy !== 'true'
        && motion.sameValueRace.started.afterInstant === '333'
        && motion.sameValueRace.started.finalFront === '333'
        && motion.sameValueRace.started.finalBack === '333'
        && motion.sameValueRace.started.lateWrites.length === 0
        && !motion.sameValueRace.started.loading
        && !motion.sameValueRace.started.active,
      `live number motion: same-formatted writer cancelled or restarted its active owner ${JSON.stringify(motion.sameValueRace)}`
    );
    assert(
      motion.sameTargetOffscreen.ownerStarted
        && motion.sameTargetOffscreen.writerStarted === false
        && motion.sameTargetOffscreen.immediate.text === '451'
        && !motion.sameTargetOffscreen.immediate.active
        && motion.sameTargetOffscreen.immediate.ownerDone === 1
        && motion.sameTargetOffscreen.immediate.writerDone === 1
        && motion.sameTargetOffscreen.immediate.ariaBusy !== 'true'
        && motion.sameTargetOffscreen.text === '451'
        && motion.sameTargetOffscreen.replayWrites.length === 0
        && !motion.sameTargetOffscreen.active
        && motion.sameTargetOffscreen.ariaBusy !== 'true',
      `live number motion: offscreen same-target owner replayed after settlement ${JSON.stringify(motion.sameTargetOffscreen)}`
    );
    assert(
      motion.deferred.offscreen.started === false
        && motion.deferred.offscreen.text === '41%'
        && motion.deferred.offscreen.replayWrites === 0
        && !motion.deferred.offscreen.active
        && motion.deferred.hidden.started === false
        && motion.deferred.hidden.text === '51%'
        && motion.deferred.hidden.replayWrites === 0
        && !motion.deferred.hidden.active
        && motion.deferred.horizontal.started === false
        && motion.deferred.horizontal.text === '61%'
        && motion.deferred.horizontal.replayWrites === 0
        && !motion.deferred.horizontal.active,
      `live number motion: hidden/offscreen final values replayed stale motion when revealed ${JSON.stringify(motion.deferred)}`
    );
    assert(
      motion.selection.started === false
        && motion.selection.done === 1
        && motion.selection.text === '401'
        && motion.selection.writes.length <= 1
        && motion.selection.writes.every((text) => text === '401')
        && !motion.selection.active
        && motion.selection.rangeCount === 1
        && motion.selection.anchorPreserved
        && motion.selection.focusPreserved
        && motion.selection.selectedText === 'Selected 401 suffix',
      `live number motion: intersecting text selection moved or received glyph frames ${JSON.stringify(motion.selection)}`
    );
    assert(
      motion.clipped.rectInsideWindow
        && motion.clipped.outsideAncestorClip
        && motion.clipped.started === false
        && motion.clipped.text === '501'
        && motion.clipped.replayWrites === 0
        && !motion.clipped.active,
      `live number motion: overflow-clipped value animated or replayed after reveal ${JSON.stringify(motion.clipped)}`
    );
    assert(
      motion.rapid.text === '103'
        && motion.rapid.finalText === '103'
        && motion.rapid.done === 1
        && !motion.rapid.active,
      `live number motion: rapid deltas did not settle on the newest exact value ${JSON.stringify(motion.rapid)}`
    );
    for (const [theme, result] of Object.entries(motion.themes)) {
      assert(
        result.mode === result.expectedMode
          && result.started === true
          && result.mid.active
          && result.mid.ariaLabel === result.finalText
          && result.mid.ariaBusy === 'true'
          && result.text === result.finalText
          && result.ariaBusy !== 'true',
        `live number motion: ${theme} personality failed explicit dispatch/accessibility/final-value contract ${JSON.stringify(result)}`
      );
    }
    for (const [theme, result] of Object.entries(motion.characterGeometry)) {
      assert(
        result.active.length === 8
          && result.active.every((family) => (
            family.started
              && family.charCount > 0
              && family.wordCount === 2
              && family.charLines === 1
              && family.inlineChars
              && family.inlineWords
              && family.targetWidthDelta <= 1
              && family.targetHeightDelta <= 1
              && family.rootWidthDelta <= 1
              && family.rootHeightDelta <= 1
              && family.sameTarget
              && family.sameParent
          ))
          && result.settled.every((family) => (
            family.text === `${theme} 2048`
              && family.childCount === 0
              && family.sameTarget
              && family.sameParent
          ))
          && result.readingState.scrollDelta <= 1
          && result.readingState.focused
          && result.readingState.selection === 'Selected reader text stays put'
          && result.readingState.sameHost,
        `live number motion: ${theme} changed settled Chamber geometry or reader/view state ${JSON.stringify(result)}`
      );
    }
    assert(
      motion.reduced.text === '71%'
        && motion.reduced.laterText === '71%'
        && motion.reduced.done === 1
        && motion.reduced.laterDone === 1
        && !motion.reduced.active
        && motion.reduced.ariaBusy !== 'true',
      `live number motion: reduced motion did not commit immediately and exactly once ${JSON.stringify(motion.reduced)}`
    );
    assert(
      motion.observer.adoptedBeforeReveal === '82%'
        && motion.observer.replayStarted === false
        && motion.observer.replayWrites === 0
        && motion.observer.text === '82%'
        && motion.observer.finalText === '82%'
        && !motion.observer.active,
      `live number motion: offscreen external mutation was not adopted or replayed after reveal ${JSON.stringify(motion.observer)}`
    );
    assert(
      motion.moving.started === true
        && motion.moving.adoptedFinal === '302'
        && motion.moving.text === '302'
        && motion.moving.finalText === '302'
        && motion.moving.lateWrites.length === 0
        && !motion.moving.active,
      `live number motion: old visible reveal overwrote a newer offscreen external value ${JSON.stringify(motion.moving)}`
    );

    const focusResponse = await page.goto(`${baseUrl}/offline.html?focus-string-race=1`, { waitUntil: 'domcontentloaded' });
    assert(focusResponse?.ok(), `live number focus-string motion: fixture route failed with HTTP ${focusResponse?.status()}`);
    const focusStringRace = await page.evaluate(async () => {
      document.body.innerHTML = '';
      document.body.dataset.theme = 'default';
      const animations = await import('/js/ui/animations.js?smoke=focus-string-race');
      const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
      const settleFrames = async (count) => {
        for (let index = 0; index < count; index += 1) await nextFrame();
      };

      const card = document.createElement('article');
      card.dataset.stat = 'magic-focus-string';
      card.style.cssText = 'position:fixed;left:24px;top:24px;';
      card.innerHTML = `<div class="card-inner">
        <output id="magic-focus-string-front" data-magic-number="major" aria-live="polite"
          style="display:inline-block;min-width:220px;font-size:24px;">Seed text</output>
        <output id="magic-focus-string-back" data-magic-number="major"
          style="display:none;">Seed text</output>
      </div>`;
      document.body.append(card);
      const front = card.querySelector('#magic-focus-string-front');
      const back = card.querySelector('#magic-focus-string-back');

      animations.revealStat('magic-focus-string', 'Cached focus text', String);
      await nextFrame();
      const started = front.classList.contains('dm-focus-in');
      const writes = [];
      const observer = new MutationObserver(() => writes.push(front.textContent));
      observer.observe(front, { childList: true, characterData: true, subtree: true });
      animations.updateStatInstant('magic-focus-string', 'Fresh focus text', String);
      await settleFrames(3);
      const afterInstant = front.textContent;
      writes.length = 0;
      await settleFrames(40);
      observer.disconnect();
      return {
        started,
        afterInstant,
        front: front.textContent,
        back: back.textContent,
        finalText: front.__dmMagicFinalText,
        lateWrites: writes,
        active: Boolean(
          front.__dmMagicCancel
          || front.__dmThemeCancel
          || front.classList.contains('dm-focus-in')
        ),
        loading: front.classList.contains('loading'),
        ariaBusy: front.getAttribute('aria-busy')
      };
    });
    assert(
      focusStringRace.started
        && focusStringRace.afterInstant === 'Fresh focus text'
        && focusStringRace.front === 'Fresh focus text'
        && focusStringRace.back === 'Fresh focus text'
        && focusStringRace.finalText === 'Fresh focus text'
        && focusStringRace.lateWrites.length === 0
        && !focusStringRace.active
        && !focusStringRace.loading
        && focusStringRace.ariaBusy !== 'true',
      `live number motion: interrupted focus-theme string reveal overwrote newer text ${JSON.stringify(focusStringRace)}`
    );

    const guardResponse = await page.goto(`${baseUrl}/offline.html?live-number-guards=1`, { waitUntil: 'domcontentloaded' });
    assert(guardResponse?.ok(), `live number guard races: fixture route failed with HTTP ${guardResponse?.status()}`);
    const guardRaces = await page.evaluate(async () => {
      document.body.innerHTML = '';
      document.body.dataset.theme = 'matrix';
      const magic = await import('/js/effects/data-magic.js?smoke=live-number-guards');
      const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
      const settleFrames = async (count) => {
        for (let index = 0; index < count; index += 1) await nextFrame();
      };
      const activeMotion = (element) => Boolean(
        element.__dmMagicCancel
        || element.__dmTweenCancel
        || element.__dmScrambleCancel
        || element.__dmAuroraCancel
        || element.__dmThemeCancel
        || Array.from(element.classList).some((name) => name.startsWith('dm-'))
      );
      const makeValue = (id, text) => {
        const element = document.createElement('output');
        element.id = id;
        element.className = 'stat-value';
        element.dataset.magicNumber = 'major';
        element.dataset.magicViewport = 'on';
        element.setAttribute('aria-live', 'polite');
        element.style.cssText = 'display:inline-block;min-width:140px;font-size:24px;';
        element.textContent = text;
        return element;
      };
      const observeText = (element) => {
        const writes = [];
        const observer = new MutationObserver(() => writes.push(element.textContent));
        observer.observe(element, { childList: true, characterData: true, subtree: true });
        return { writes, observer };
      };

      magic.initDataMagic();

      // Explicit data-magic text remains eligible even at compact label sizes;
      // the observer owns these targets by opt-in rather than font threshold.
      const smallTextValue = makeValue('magic-observer-small-text', 'Before');
      smallTextValue.dataset.magicText = '';
      smallTextValue.style.fontSize = '12px';
      smallTextValue.classList.add('loading');
      document.body.append(smallTextValue);
      await settleFrames(2);
      smallTextValue.classList.remove('loading');
      smallTextValue.textContent = 'After';
      await settleFrames(2);
      const smallTextMid = {
        text: smallTextValue.textContent,
        active: activeMotion(smallTextValue),
        busy: smallTextValue.getAttribute('aria-busy')
      };
      await settleFrames(65);
      const observerSmallText = {
        mid: smallTextMid,
        text: smallTextValue.textContent,
        finalText: smallTextValue.__dmMagicFinalText,
        active: activeMotion(smallTextValue),
        busy: smallTextValue.getAttribute('aria-busy')
      };

      // Observer-started string effects need the same ownership and accessibility
      // lifecycle as explicit numeric effects. A selection created after Matrix
      // scrambling starts must settle the final string and stop every later frame.
      const matrixStringValue = makeValue('magic-observer-matrix-string', 'Matrix alpha');
      matrixStringValue.dataset.magicText = '';
      matrixStringValue.classList.add('loading');
      document.body.append(matrixStringValue);
      await settleFrames(2);
      matrixStringValue.classList.remove('loading');
      matrixStringValue.textContent = 'Matrix omega';
      await settleFrames(2);
      const matrixStringOwned = {
        finalText: matrixStringValue.__dmMagicFinalText,
        magicOwner: Boolean(matrixStringValue.__dmMagicCancel),
        effectOwner: Boolean(matrixStringValue.__dmScrambleCancel),
        ariaLabel: matrixStringValue.getAttribute('aria-label'),
        ariaBusy: matrixStringValue.getAttribute('aria-busy'),
        active: activeMotion(matrixStringValue)
      };
      const matrixStringWrites = observeText(matrixStringValue);
      const matrixSelection = document.getSelection();
      const matrixRange = document.createRange();
      matrixRange.selectNodeContents(matrixStringValue);
      matrixSelection.removeAllRanges();
      matrixSelection.addRange(matrixRange);
      await settleFrames(3);
      const matrixAfterSelection = {
        text: matrixStringValue.textContent,
        selectedText: matrixSelection.toString(),
        anchorInside: matrixStringValue.contains(matrixSelection.anchorNode),
        focusInside: matrixStringValue.contains(matrixSelection.focusNode),
        rangeCount: matrixSelection.rangeCount,
        active: activeMotion(matrixStringValue),
        ariaBusy: matrixStringValue.getAttribute('aria-busy')
      };
      matrixStringWrites.writes.length = 0;
      await settleFrames(65);
      matrixStringWrites.observer.disconnect();
      const observerMatrixSelection = {
        owned: matrixStringOwned,
        afterSelection: matrixAfterSelection,
        text: matrixStringValue.textContent,
        finalText: matrixStringValue.__dmMagicFinalText,
        selectedText: matrixSelection.toString(),
        anchorInside: matrixStringValue.contains(matrixSelection.anchorNode),
        focusInside: matrixStringValue.contains(matrixSelection.focusNode),
        rangeCount: matrixSelection.rangeCount,
        lateWrites: [...matrixStringWrites.writes],
        active: activeMotion(matrixStringValue),
        ariaBusy: matrixStringValue.getAttribute('aria-busy')
      };
      matrixSelection.removeAllRanges();

      // A Default-theme observer focus timer must be cancelled when an explicit
      // newer reveal takes ownership. At the old timer's deadline the new focus
      // class, owner, and aria-busy state must still be intact.
      document.body.dataset.theme = 'default';
      window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: 'default' } }));
      const focusOwnerValue = makeValue('magic-observer-focus-owner', 'Observer focus seed');
      focusOwnerValue.dataset.magicText = '';
      focusOwnerValue.classList.add('loading');
      document.body.append(focusOwnerValue);
      await settleFrames(2);
      focusOwnerValue.classList.remove('loading');
      focusOwnerValue.textContent = 'Observer focus first';
      await settleFrames(2);
      const observerFocusOwned = {
        classActive: focusOwnerValue.classList.contains('dm-focus-in'),
        magicOwner: Boolean(focusOwnerValue.__dmMagicCancel),
        ariaBusy: focusOwnerValue.getAttribute('aria-busy')
      };
      let explicitFocusDone = 0;
      const explicitFocusStarted = magic.setMagicNumber(focusOwnerValue, '202', {
        force: true,
        changed: true,
        duration: 900,
        onDone: () => { explicitFocusDone += 1; }
      });
      await settleFrames(36);
      const focusAfterOldDeadline = {
        text: focusOwnerValue.textContent,
        finalText: focusOwnerValue.__dmMagicFinalText,
        classActive: focusOwnerValue.classList.contains('dm-focus-in'),
        magicOwner: Boolean(focusOwnerValue.__dmMagicCancel),
        ariaLabel: focusOwnerValue.getAttribute('aria-label'),
        ariaBusy: focusOwnerValue.getAttribute('aria-busy'),
        done: explicitFocusDone
      };
      const focusLateWrites = observeText(focusOwnerValue);
      await settleFrames(35);
      focusLateWrites.observer.disconnect();
      const observerFocusSupersession = {
        observerOwned: observerFocusOwned,
        explicitStarted: explicitFocusStarted,
        afterOldDeadline: focusAfterOldDeadline,
        text: focusOwnerValue.textContent,
        finalText: focusOwnerValue.__dmMagicFinalText,
        lateWrites: [...focusLateWrites.writes],
        active: activeMotion(focusOwnerValue),
        ariaBusy: focusOwnerValue.getAttribute('aria-busy'),
        done: explicitFocusDone
      };

      document.body.dataset.theme = 'matrix';
      window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: 'matrix' } }));

      // Exact target equality cannot let an explicit error/status transition
      // inherit an active animation.
      const sameTextErrorValue = makeValue('magic-same-text-error', '10');
      sameTextErrorValue.classList.add('loading');
      document.body.append(sameTextErrorValue);
      await settleFrames(2);
      sameTextErrorValue.classList.remove('loading');
      const sameTextErrorWrites = observeText(sameTextErrorValue);
      const sameTextErrorStarted = magic.setMagicNumber(sameTextErrorValue, '11', {
        force: true,
        changed: true,
        duration: 180
      });
      sameTextErrorValue.classList.add('error-state');
      magic.setMagicNumber(sameTextErrorValue, '11', {
        force: true,
        animate: false
      });
      const sameTextErrorImmediate = sameTextErrorValue.textContent;
      await settleFrames(3);
      const sameTextErrorAfterObserver = {
        text: sameTextErrorValue.textContent,
        finalText: sameTextErrorValue.__dmMagicFinalText,
        active: activeMotion(sameTextErrorValue),
        ariaBusy: sameTextErrorValue.getAttribute('aria-busy')
      };
      sameTextErrorWrites.writes.length = 0;
      await settleFrames(20);
      sameTextErrorWrites.observer.disconnect();
      const sameTextError = {
        started: sameTextErrorStarted,
        immediate: sameTextErrorImmediate,
        afterObserver: sameTextErrorAfterObserver,
        text: sameTextErrorValue.textContent,
        finalText: sameTextErrorValue.__dmMagicFinalText,
        lateWrites: [...sameTextErrorWrites.writes],
        active: activeMotion(sameTextErrorValue),
        ariaBusy: sameTextErrorValue.getAttribute('aria-busy')
      };

      // A nonnumeric/error write is authoritative even when a numeric tween owns
      // the element. The observer must cancel that owner before its next frame.
      const errorValue = makeValue('magic-error-during-tween', '700');
      errorValue.classList.add('loading');
      document.body.append(errorValue);
      await settleFrames(2);
      errorValue.classList.remove('loading');
      magic.tweenNumber(errorValue, 700, 701, { duration: 180, formatter: String });
      await nextFrame();
      const errorTweenStarted = Boolean(errorValue.__dmTweenCancel);
      const errorWrites = observeText(errorValue);
      errorValue.classList.add('error-state');
      errorValue.textContent = 'Unavailable';
      await settleFrames(3);
      const errorAfterExternal = errorValue.textContent;
      errorWrites.writes.length = 0;
      await settleFrames(20);
      errorWrites.observer.disconnect();
      const externalError = {
        started: errorTweenStarted,
        afterExternal: errorAfterExternal,
        text: errorValue.textContent,
        finalText: errorValue.__dmMagicFinalText,
        lateWrites: [...errorWrites.writes],
        active: activeMotion(errorValue),
        ariaBusy: errorValue.getAttribute('aria-busy')
      };

      // An explicit no-motion write is also a cancellation request. Equality
      // with an in-flight target must not leave glyphs, aria-busy, or old frames.
      const explicitValue = makeValue('magic-explicit-instant', '800');
      explicitValue.dataset.magic = 'off';
      document.body.append(explicitValue);
      await settleFrames(2);
      delete explicitValue.dataset.magic;
      magic.setMagicNumber(explicitValue, '801', { force: true, changed: true, duration: 180 });
      await nextFrame();
      const explicitAnimationStarted = activeMotion(explicitValue);
      const explicitWrites = observeText(explicitValue);
      let explicitDone = 0;
      const explicitStarted = magic.setMagicNumber(explicitValue, '801', {
        force: true,
        changed: true,
        animate: false,
        onDone: () => { explicitDone += 1; }
      });
      const explicitImmediate = {
        text: explicitValue.textContent,
        active: activeMotion(explicitValue),
        ariaBusy: explicitValue.getAttribute('aria-busy')
      };
      await settleFrames(3);
      explicitWrites.writes.length = 0;
      await settleFrames(20);
      explicitWrites.observer.disconnect();
      const explicitInstant = {
        animationStarted: explicitAnimationStarted,
        setterStarted: explicitStarted,
        done: explicitDone,
        immediate: explicitImmediate,
        text: explicitValue.textContent,
        finalText: explicitValue.__dmMagicFinalText,
        lateWrites: [...explicitWrites.writes],
        active: activeMotion(explicitValue),
        ariaBusy: explicitValue.getAttribute('aria-busy')
      };

      // The observer receives insertion records after the direct owner has
      // settled. It must adopt that write rather than replay it as first arrival.
      const insertedValue = makeValue('magic-inserted-instant', '900');
      const insertedWrites = observeText(insertedValue);
      document.body.append(insertedValue);
      let insertedDone = 0;
      const insertedStarted = magic.setMagicNumber(insertedValue, '901', {
        force: true,
        changed: true,
        animate: false,
        onDone: () => { insertedDone += 1; }
      });
      const insertedImmediate = insertedValue.textContent;
      await settleFrames(3);
      insertedWrites.writes.length = 0;
      await settleFrames(20);
      insertedWrites.observer.disconnect();
      const insertionInstant = {
        setterStarted: insertedStarted,
        done: insertedDone,
        immediate: insertedImmediate,
        text: insertedValue.textContent,
        finalText: insertedValue.__dmMagicFinalText,
        lateWrites: [...insertedWrites.writes],
        active: activeMotion(insertedValue),
        ariaBusy: insertedValue.getAttribute('aria-busy')
      };

      // Selection can begin after motion has started. The next frame must settle
      // the final text while preserving the range, then stop all later writes.
      const midSelectionValue = makeValue('magic-mid-selection', '1000');
      midSelectionValue.dataset.magic = 'off';
      document.body.append(midSelectionValue);
      await settleFrames(2);
      delete midSelectionValue.dataset.magic;
      let midSelectionDone = 0;
      const midSelectionStarted = magic.setMagicNumber(midSelectionValue, '1001', {
        force: true,
        changed: true,
        duration: 180,
        onDone: () => { midSelectionDone += 1; }
      });
      await nextFrame();
      const selection = document.getSelection();
      const range = document.createRange();
      range.selectNodeContents(midSelectionValue);
      selection.removeAllRanges();
      selection.addRange(range);
      const midSelectionWrites = observeText(midSelectionValue);
      await settleFrames(3);
      const selectionAfterSettle = {
        text: midSelectionValue.textContent,
        selectedText: selection.toString(),
        anchorInside: midSelectionValue.contains(selection.anchorNode),
        focusInside: midSelectionValue.contains(selection.focusNode),
        rangeCount: selection.rangeCount,
        active: activeMotion(midSelectionValue)
      };
      midSelectionWrites.writes.length = 0;
      await settleFrames(20);
      midSelectionWrites.observer.disconnect();
      const midAnimationSelection = {
        started: midSelectionStarted,
        afterSettle: selectionAfterSettle,
        text: midSelectionValue.textContent,
        finalText: midSelectionValue.__dmMagicFinalText,
        selectedText: selection.toString(),
        anchorInside: midSelectionValue.contains(selection.anchorNode),
        focusInside: midSelectionValue.contains(selection.focusNode),
        rangeCount: selection.rangeCount,
        lateWrites: [...midSelectionWrites.writes],
        active: activeMotion(midSelectionValue),
        ariaBusy: midSelectionValue.getAttribute('aria-busy'),
        done: midSelectionDone
      };
      selection.removeAllRanges();

      return {
        observerSmallText,
        observerMatrixSelection,
        observerFocusSupersession,
        sameTextError,
        externalError,
        explicitInstant,
        insertionInstant,
        midAnimationSelection
      };
    });
    assert(
      guardRaces.observerSmallText.mid.active
        && guardRaces.observerSmallText.mid.busy === 'true'
        && guardRaces.observerSmallText.text === 'After'
        && guardRaces.observerSmallText.finalText === 'After'
        && !guardRaces.observerSmallText.active
        && guardRaces.observerSmallText.busy !== 'true',
      `live number motion: compact explicit data-magic text skipped its observer effect ${JSON.stringify(guardRaces.observerSmallText)}`
    );
    assert(
      guardRaces.observerMatrixSelection.owned.finalText === 'Matrix omega'
        && guardRaces.observerMatrixSelection.owned.magicOwner
        && guardRaces.observerMatrixSelection.owned.effectOwner
        && guardRaces.observerMatrixSelection.owned.ariaLabel === 'Matrix omega'
        && guardRaces.observerMatrixSelection.owned.ariaBusy === 'true'
        && guardRaces.observerMatrixSelection.owned.active
        && guardRaces.observerMatrixSelection.afterSelection.text === 'Matrix omega'
        && guardRaces.observerMatrixSelection.afterSelection.selectedText === 'Matrix omega'
        && guardRaces.observerMatrixSelection.afterSelection.anchorInside
        && guardRaces.observerMatrixSelection.afterSelection.focusInside
        && guardRaces.observerMatrixSelection.afterSelection.rangeCount === 1
        && !guardRaces.observerMatrixSelection.afterSelection.active
        && guardRaces.observerMatrixSelection.afterSelection.ariaBusy !== 'true'
        && guardRaces.observerMatrixSelection.text === 'Matrix omega'
        && guardRaces.observerMatrixSelection.finalText === 'Matrix omega'
        && guardRaces.observerMatrixSelection.selectedText === 'Matrix omega'
        && guardRaces.observerMatrixSelection.anchorInside
        && guardRaces.observerMatrixSelection.focusInside
        && guardRaces.observerMatrixSelection.rangeCount === 1
        && guardRaces.observerMatrixSelection.lateWrites.length === 0
        && !guardRaces.observerMatrixSelection.active
        && guardRaces.observerMatrixSelection.ariaBusy !== 'true',
      `live number motion: observer-owned Matrix string lost accessibility ownership or a mid-reveal selection ${JSON.stringify(guardRaces.observerMatrixSelection)}`
    );
    assert(
      guardRaces.observerFocusSupersession.observerOwned.classActive
        && guardRaces.observerFocusSupersession.observerOwned.magicOwner
        && guardRaces.observerFocusSupersession.observerOwned.ariaBusy === 'true'
        && guardRaces.observerFocusSupersession.explicitStarted
        && guardRaces.observerFocusSupersession.afterOldDeadline.text === '202'
        && guardRaces.observerFocusSupersession.afterOldDeadline.finalText === '202'
        && guardRaces.observerFocusSupersession.afterOldDeadline.classActive
        && guardRaces.observerFocusSupersession.afterOldDeadline.magicOwner
        && guardRaces.observerFocusSupersession.afterOldDeadline.ariaLabel === '202'
        && guardRaces.observerFocusSupersession.afterOldDeadline.ariaBusy === 'true'
        && guardRaces.observerFocusSupersession.afterOldDeadline.done === 0
        && guardRaces.observerFocusSupersession.text === '202'
        && guardRaces.observerFocusSupersession.finalText === '202'
        && guardRaces.observerFocusSupersession.lateWrites.length === 0
        && !guardRaces.observerFocusSupersession.active
        && guardRaces.observerFocusSupersession.ariaBusy !== 'true'
        && guardRaces.observerFocusSupersession.done === 1,
      `live number motion: an old observer focus timer stripped a newer explicit reveal ${JSON.stringify(guardRaces.observerFocusSupersession)}`
    );
    assert(
      guardRaces.sameTextError.started
        && guardRaces.sameTextError.immediate === '11'
        && guardRaces.sameTextError.afterObserver.text === '11'
        && guardRaces.sameTextError.afterObserver.finalText === '11'
        && !guardRaces.sameTextError.afterObserver.active
        && guardRaces.sameTextError.afterObserver.ariaBusy !== 'true'
        && guardRaces.sameTextError.text === '11'
        && guardRaces.sameTextError.finalText === '11'
        && guardRaces.sameTextError.lateWrites.length === 0
        && !guardRaces.sameTextError.active
        && guardRaces.sameTextError.ariaBusy !== 'true',
      `live number motion: same-target error transition retained active glyph ownership ${JSON.stringify(guardRaces.sameTextError)}`
    );
    assert(
      guardRaces.externalError.started
        && guardRaces.externalError.afterExternal === 'Unavailable'
        && guardRaces.externalError.text === 'Unavailable'
        && guardRaces.externalError.finalText === 'Unavailable'
        && guardRaces.externalError.lateWrites.length === 0
        && !guardRaces.externalError.active
        && guardRaces.externalError.ariaBusy !== 'true',
      `live number motion: numeric tween overwrote authoritative external error text ${JSON.stringify(guardRaces.externalError)}`
    );
    assert(
      guardRaces.explicitInstant.animationStarted
        && guardRaces.explicitInstant.setterStarted === false
        && guardRaces.explicitInstant.done === 1
        && guardRaces.explicitInstant.immediate.text === '801'
        && !guardRaces.explicitInstant.immediate.active
        && guardRaces.explicitInstant.immediate.ariaBusy !== 'true'
        && guardRaces.explicitInstant.text === '801'
        && guardRaces.explicitInstant.finalText === '801'
        && guardRaces.explicitInstant.lateWrites.length === 0
        && !guardRaces.explicitInstant.active
        && guardRaces.explicitInstant.ariaBusy !== 'true',
      `live number motion: explicit animate:false left a same-target effect active ${JSON.stringify(guardRaces.explicitInstant)}`
    );
    assert(
      guardRaces.insertionInstant.setterStarted === false
        && guardRaces.insertionInstant.done === 1
        && guardRaces.insertionInstant.immediate === '901'
        && guardRaces.insertionInstant.text === '901'
        && guardRaces.insertionInstant.finalText === '901'
        && guardRaces.insertionInstant.lateWrites.length === 0
        && !guardRaces.insertionInstant.active
        && guardRaces.insertionInstant.ariaBusy !== 'true',
      `live number motion: observer replayed an immediate direct write after insertion ${JSON.stringify(guardRaces.insertionInstant)}`
    );
    assert(
      guardRaces.midAnimationSelection.started
        && guardRaces.midAnimationSelection.afterSettle.text === '1001'
        && guardRaces.midAnimationSelection.afterSettle.selectedText === '1001'
        && guardRaces.midAnimationSelection.afterSettle.anchorInside
        && guardRaces.midAnimationSelection.afterSettle.focusInside
        && guardRaces.midAnimationSelection.afterSettle.rangeCount === 1
        && !guardRaces.midAnimationSelection.afterSettle.active
        && guardRaces.midAnimationSelection.text === '1001'
        && guardRaces.midAnimationSelection.finalText === '1001'
        && guardRaces.midAnimationSelection.selectedText === '1001'
        && guardRaces.midAnimationSelection.anchorInside
        && guardRaces.midAnimationSelection.focusInside
        && guardRaces.midAnimationSelection.rangeCount === 1
        && guardRaces.midAnimationSelection.lateWrites.length === 0
        && !guardRaces.midAnimationSelection.active
        && guardRaces.midAnimationSelection.ariaBusy !== 'true'
        && guardRaces.midAnimationSelection.done === 1,
      `live number motion: selection created mid-animation was lost or received later glyph frames ${JSON.stringify(guardRaces.midAnimationSelection)}`
    );

    await context.close();
    await smokeLiveNumberShellMotion(browser, baseUrl, issues);
    assert(issues.length === 0, `live number motion browser issues:\n${issues.join('\n')}`);
    log('ok - live background number motion, accessibility, and theme personality smoke');
  }

  return { smokeQuietRefresh, smokeLiveNumberShellMotion, smokeLiveNumberMotion };
}
