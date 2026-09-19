// Browser workflows owned by themes. Shared dependencies remain explicit.
export function createThemesSmokeSuites({
  assert,
  assertLocatorCount,
  attachIssueCollectors,
  ensureDropdownOpen,
  installFeatureMocks,
  log,
  waitForIntentionalRealTime
}) {
  async function smokeValleyTheme(browser, baseUrl) {
    const issues = [];
    const context = await browser.newContext({
      viewport: { width: 1366, height: 900 },
      deviceScaleFactor: 3,
      serviceWorkers: 'block'
    });
    await installFeatureMocks(context);
    await context.addInitScript(() => {
      localStorage.setItem('tezos-systems-theme', 'matrix');
      localStorage.setItem('tezos-systems-stats-visible', 'true');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    });

    const page = await context.newPage();
    attachIssueCollectors(page, 'Valley theme', issues);

    const valleyModulePattern = '**/js/effects/valley-effects.js*';
    let releaseValleyImport;
    let resolveValleyImportSeen;
    let resolveValleyImportDelivered;
    const valleyImportSeen = new Promise((resolve) => { resolveValleyImportSeen = resolve; });
    const valleyImportDelivered = new Promise((resolve) => { resolveValleyImportDelivered = resolve; });
    await page.route(valleyModulePattern, async (route) => {
      resolveValleyImportSeen();
      await new Promise((resolve) => { releaseValleyImport = resolve; });
      await route.continue();
      resolveValleyImportDelivered();
    });

    const response = await page.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `Valley theme: dashboard failed with HTTP ${response?.status()}`);
    await page.locator('main').waitFor({ state: 'visible', timeout: 15000 });

    await page.evaluate(async () => {
      const { setTheme } = await import('/js/ui/theme.js');
      window.__valleySmokeSetTheme = setTheme;
      setTheme('valley');
    });
    await Promise.race([
      valleyImportSeen,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Valley renderer was not dynamically requested')), 5000))
    ]);
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('stats-updated', {
        detail: {
          source: 'valley-buffer-smoke',
          stats: {
            stakingRatio: 33.4,
            cycleProgress: 71,
            contractCalls24h: 123456
          }
        }
      }));
    });
    await page.evaluate(() => window.__valleySmokeSetTheme('matrix'));
    releaseValleyImport();
    await valleyImportDelivered;
    await page.waitForTimeout(200);
    const staleImportState = await page.evaluate(() => ({
      theme: document.body.dataset.theme || '',
      canvases: document.querySelectorAll('#valley-background-canvas').length
    }));
    assert(
      staleImportState.theme === 'matrix' && staleImportState.canvases === 0,
      `late Valley import mounted after the theme changed: ${JSON.stringify(staleImportState)}`
    );
    await page.unroute(valleyModulePattern);

    await page.evaluate(() => window.__valleySmokeSetTheme('valley'));
    await page.waitForFunction(() => {
      const canvas = document.getElementById('valley-background-canvas');
      return canvas && Number(canvas.dataset.valleyFrame) > 0;
    }, null, { timeout: 10000 });
    await assertLocatorCount(page.locator('#valley-background-canvas'), 1, 'Valley animated canvas');
    const bufferedDataRevision = await page.locator('#valley-background-canvas').getAttribute('data-valley-stats-revision');
    assert(
      Number(bufferedDataRevision) > 0,
      `Valley did not replay the latest stats event after its delayed renderer mounted: ${bufferedDataRevision}`
    );
    const meadowState = await page.locator('#valley-background-canvas').evaluate((canvas) => ({
      bench: canvas.dataset.valleyBench,
      destination: canvas.dataset.valleyDestination,
      frontMountain: canvas.dataset.valleyFrontMountain,
      grassProfile: canvas.dataset.valleyGrassProfile,
      treeSwayRatio: Number(canvas.dataset.valleyTreeSwayRatio)
    }));
    assert(
      meadowState.destination === 'hilltop-bench'
        && meadowState.bench === 'three-quarter-wood'
        && meadowState.frontMountain === 'opaque'
        && meadowState.grassProfile === 'full-depth-meadow'
        && meadowState.treeSwayRatio === 0.2,
      `Valley must pair its restored landscape with one-fifth-speed tree sway: ${JSON.stringify(meadowState)}`
    );

    const grassBankState = await page.evaluate(async () => {
      const { createValleyEffect } = await import('/js/effects/valley-effects.js');
      const viewports = [
        { label: 'desktop', width: 1366, height: 900, expectedCandidates: 3750 },
        { label: 'mobile', width: 390, height: 844, expectedCandidates: 1440 },
        { label: 'short landscape', width: 844, height: 390, expectedCandidates: 2340 }
      ];

      return viewports.map(({ label, width, height, expectedCandidates }) => {
        const effect = createValleyEffect();
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        effect.canvas = canvas;
        effect.ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
        effect.width = width;
        effect.height = height;
        effect.dpr = 1;
        effect.buildScene();

        const grass = effect.grass;
        effect.grass = [];
        effect.drawScene(0, true);
        const withoutGrass = effect.ctx.getImageData(0, 0, width, height).data;

        effect.grass = grass;
        effect.drawScene(0, true);
        const withGrass = effect.ctx.getImageData(0, 0, width, height).data;

        const rootsOnPath = grass.filter((blade) => (
          effect.ctx.isPointInPath(effect.pathwayPath, blade.x, blade.y)
        )).length;
        const hilltop = effect.getHilltop();
        const pathTouchesBench = effect.ctx.isPointInPath(
          effect.pathwayPath,
          hilltop.x,
          hilltop.y + 1
        );
        const grassWaveSpeed = 0.9 + (effect.current.wind * 0.75);
        const grassSwayDistance = 100 * (0.08 + (effect.current.wind * 0.25));
        const treePeakTime = Math.PI / (2 * grassWaveSpeed * 0.2);
        const treeSwayDistanceRatio = Math.abs(effect.getTreeSway(
          { size: 100, phase: 0 },
          treePeakTime,
          false
        )) / grassSwayDistance;
        const farGrassCount = grass.filter((blade) => blade.y < height * 0.64).length;
        const midGrassCount = grass.filter((blade) => (
          blade.y >= height * 0.64 && blade.y < height * 0.8
        )).length;
        let pathwayInteriorSamples = 0;
        let pathwayInteriorChangedSamples = 0;
        let pathwayEdgeChangedSamples = 0;
        let bankChangedSamples = 0;
        for (let y = 2; y < height - 2; y += 2) {
          for (let x = 2; x < width - 2; x += 2) {
            const offset = ((y * width) + x) * 4;
            const changed = (
              withoutGrass[offset] !== withGrass[offset]
              || withoutGrass[offset + 1] !== withGrass[offset + 1]
              || withoutGrass[offset + 2] !== withGrass[offset + 2]
            );
            const onPathway = effect.ctx.isPointInPath(effect.pathwayPath, x, y);
            const safelyInsidePathway = (
              onPathway
              && effect.ctx.isPointInPath(effect.pathwayPath, x - 10, y)
              && effect.ctx.isPointInPath(effect.pathwayPath, x + 10, y)
              && effect.ctx.isPointInPath(effect.pathwayPath, x, y - 10)
              && effect.ctx.isPointInPath(effect.pathwayPath, x, y + 10)
            );
            if (safelyInsidePathway) {
              pathwayInteriorSamples += 1;
              if (changed) pathwayInteriorChangedSamples += 1;
            } else if (onPathway && changed) {
              pathwayEdgeChangedSamples += 1;
            } else if (changed) {
              bankChangedSamples += 1;
            }
          }
        }

        return {
          bankChangedSamples,
          candidateCount: effect.grassCandidateCount,
          expectedCandidates,
          farGrassCount,
          grassCount: grass.length,
          label,
          midGrassCount,
          pathTouchesBench,
          pathwayEdgeChangedSamples,
          pathwayInteriorChangedSamples,
          pathwayInteriorSamples,
          rootsOnPath,
          treeSwayDistanceRatio
        };
      });
    });
    assert(
      grassBankState.every((state) => (
        state.candidateCount === state.expectedCandidates
        && state.grassCount > state.expectedCandidates * 0.65
        && state.grassCount < state.expectedCandidates
        && state.rootsOnPath === 0
        && state.pathTouchesBench === true
        && Math.abs(state.treeSwayDistanceRatio - 0.2) < 0.000001
        && state.farGrassCount > state.expectedCandidates * 0.18
        && state.midGrassCount > state.expectedCandidates * 0.15
        && state.pathwayInteriorSamples > 100
        && state.pathwayInteriorChangedSamples / state.pathwayInteriorSamples < 0.03
        && state.pathwayEdgeChangedSamples > 0
        && state.bankChangedSamples > 100
      )),
      `Valley grass must cover every depth while roots stay off the naturally overhung path ending at the hilltop bench: ${JSON.stringify(grassBankState)}`
    );

    const canvasSignature = () => page.evaluate(() => {
      const canvas = document.getElementById('valley-background-canvas');
      if (!(canvas instanceof HTMLCanvasElement)) return null;
      const sample = document.createElement('canvas');
      sample.width = 64;
      sample.height = 36;
      const context2d = sample.getContext('2d', { willReadFrequently: true });
      context2d.drawImage(canvas, 0, 0, sample.width, sample.height);
      const pixels = context2d.getImageData(0, 0, sample.width, sample.height).data;
      let hash = 2166136261;
      let paintedPixels = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        hash ^= pixels[index];
        hash = Math.imul(hash, 16777619);
        hash ^= pixels[index + 1];
        hash = Math.imul(hash, 16777619);
        hash ^= pixels[index + 2];
        hash = Math.imul(hash, 16777619);
        hash ^= pixels[index + 3];
        hash = Math.imul(hash, 16777619);
        if (pixels[index + 3] > 0) paintedPixels += 1;
      }
      return {
        frame: Number(canvas.dataset.valleyFrame) || 0,
        hash: hash >>> 0,
        paintedPixels
      };
    });
    const firstSignature = await canvasSignature();
    assert(firstSignature?.paintedPixels > 0, `Valley canvas did not paint a visible frame: ${JSON.stringify(firstSignature)}`);
    await page.waitForFunction((startFrame) => (
      Number(document.getElementById('valley-background-canvas')?.dataset.valleyFrame) >= startFrame + 8
    ), firstSignature.frame, { timeout: 5000 });
    const secondSignature = await canvasSignature();
    assert(
      secondSignature.frame > firstSignature.frame && secondSignature.hash !== firstSignature.hash,
      `Valley renderer did not visibly advance: ${JSON.stringify({ firstSignature, secondSignature })}`
    );

    const longTaskObservationSupported = await page.evaluate(() => {
      window.__valleyPerfObserver?.disconnect?.();
      window.__valleyPerfLongTasks = [];
      if (
        typeof PerformanceObserver !== 'function'
        || !PerformanceObserver.supportedEntryTypes?.includes('longtask')
      ) {
        window.__valleyPerfObserver = null;
        return false;
      }
      window.__valleyPerfObserver = new PerformanceObserver((list) => {
        window.__valleyPerfLongTasks.push(...list.getEntries().map((entry) => entry.duration));
      });
      window.__valleyPerfObserver.observe({ type: 'longtask', buffered: false });
      return true;
    });
    const cadenceStart = await page.evaluate(() => ({
      frame: Number(document.getElementById('valley-background-canvas')?.dataset.valleyFrame) || 0,
      time: performance.now()
    }));
    await waitForIntentionalRealTime(page, 'valley-cadence-sample');
    const cadenceEnd = await page.evaluate(() => ({
      frame: Number(document.getElementById('valley-background-canvas')?.dataset.valleyFrame) || 0,
      time: performance.now()
    }));
    const longTaskSample = await page.evaluate(() => {
      window.__valleyPerfObserver?.disconnect?.();
      const durations = Array.isArray(window.__valleyPerfLongTasks)
        ? window.__valleyPerfLongTasks.filter(Number.isFinite)
        : [];
      return {
        count: durations.length,
        longestMs: durations.length ? Math.max(...durations) : 0,
        totalMs: durations.reduce((sum, duration) => sum + duration, 0)
      };
    });
    const measuredFps = (cadenceEnd.frame - cadenceStart.frame) / ((cadenceEnd.time - cadenceStart.time) / 1000);
    assert(
      measuredFps >= 20 && measuredFps <= 40,
      `Valley rendered outside its bounded frame cadence (${measuredFps.toFixed(1)} fps)`
    );
    if (longTaskObservationSupported) {
      assert(
        longTaskSample.count <= 4
          && longTaskSample.longestMs <= 150
          && longTaskSample.totalMs <= 350,
        `Valley monopolized the main thread during its steady-state sample: ${JSON.stringify(longTaskSample)}`
      );
    }

    const readingSetup = await page.evaluate(async () => {
      const input = document.getElementById('hero-search-input');
      const section = document.getElementById('chambers-section');
      const title = section?.querySelector('.section-title');
      const canvas = document.getElementById('valley-background-canvas');
      const main = document.querySelector('main');
      if (!input || !section || !title || !canvas || !main) return null;
      input.value = 'painted valley';
      input.focus({ preventScroll: true });
      input.setSelectionRange(2, 9);
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - innerHeight);
      const previousScrollBehavior = document.documentElement.style.scrollBehavior;
      document.documentElement.style.scrollBehavior = 'auto';
      window.scrollTo({ top: Math.min(maxScroll, 640), behavior: 'auto' });
      await new Promise(requestAnimationFrame);
      document.documentElement.style.scrollBehavior = previousScrollBehavior;
      window.__valleyReadingState = { input, section, title, canvas, main };
      return {
        href: location.href,
        scrollY,
        selectedText: input.value.slice(input.selectionStart, input.selectionEnd),
        inputStart: input.selectionStart,
        inputEnd: input.selectionEnd
      };
    });
    assert(readingSetup?.selectedText, `Valley reading-state fixture did not establish a document selection: ${JSON.stringify(readingSetup)}`);

    const dataResponse = await page.evaluate(() => {
      const canvas = document.getElementById('valley-background-canvas');
      const numericTargets = () => Object.fromEntries(
        Object.entries(canvas?.dataset || {})
          .filter(([key]) => /^valley.*(?:Target|Normalized)$/i.test(key))
          .map(([key, value]) => [key, Number(value)])
      );
      const beforeRevision = Number(canvas?.dataset.valleyStatsRevision) || 0;
      const beforeImpulses = Number(canvas?.dataset.valleyImpulses) || 0;
      window.dispatchEvent(new CustomEvent('stats-updated', {
        detail: {
          source: 'valley-smoke',
          stats: {
            activeBakers: 1_000_000_000,
            blockTime: 1_000_000,
            contractCalls24h: 1_000_000_000_000,
            currentIssuanceRate: -10_000,
            cycleProgress: 5_000,
            marketCap: 1e30,
            stakingRatio: -5_000,
            totalBakers: 1_000_000_000,
            totalSupply: 1e30,
            totalTransactions: 1e30,
            transactions24h: 1e20,
            transactionVolume24h: 1e30,
            tvl: 1e30,
            xtzPrice: 1e12
          }
        }
      }));
      const afterRevision = Number(canvas?.dataset.valleyStatsRevision) || 0;
      const targets = numericTargets();
      for (let index = 0; index < 80; index += 1) {
        window.dispatchEvent(new Event('block-pulse'));
      }
      const afterImpulses = Number(canvas?.dataset.valleyImpulses) || 0;
      const invalidBeforeRevision = Number(canvas?.dataset.valleyStatsRevision) || 0;
      const invalidBeforeTargets = numericTargets();
      window.dispatchEvent(new CustomEvent('stats-updated', {
        detail: {
          source: 'valley-smoke-invalid',
          stats: {
            activeBakers: Number.NaN,
            blockTime: Number.POSITIVE_INFINITY,
            cycleProgress: Number.NEGATIVE_INFINITY,
            stakingRatio: Number.NaN,
            transactions24h: Number.POSITIVE_INFINITY
          }
        }
      }));
      const saved = window.__valleyReadingState;
      const input = document.getElementById('hero-search-input');
      return {
        afterImpulses,
        afterRevision,
        beforeImpulses,
        beforeRevision,
        invalidAfterRevision: Number(canvas?.dataset.valleyStatsRevision) || 0,
        invalidAfterTargets: numericTargets(),
        invalidBeforeRevision,
        invalidBeforeTargets,
        targets,
        reading: {
          href: location.href,
          scrollY,
          activeInput: document.activeElement === input,
          inputStart: input?.selectionStart,
          inputEnd: input?.selectionEnd,
          selectedText: input?.value.slice(input.selectionStart, input.selectionEnd) || '',
          sameCanvas: saved?.canvas === canvas,
          sameInput: saved?.input === input,
          sameMain: saved?.main === document.querySelector('main'),
          sameSection: saved?.section === document.getElementById('chambers-section'),
          sameTitle: saved?.title === document.querySelector('#chambers-section .section-title')
        }
      };
    });
    assert(
      dataResponse.afterRevision > dataResponse.beforeRevision,
      `Valley ignored a finite stats-updated payload: ${JSON.stringify(dataResponse)}`
    );
    const targetValues = Object.values(dataResponse.targets);
    assert(
      targetValues.length > 0 && targetValues.every((value) => Number.isFinite(value) && value >= 0 && value <= 1),
      `Valley data targets must remain finite and normalized: ${JSON.stringify(dataResponse.targets)}`
    );
    assert(
      dataResponse.invalidAfterRevision === dataResponse.invalidBeforeRevision
        && JSON.stringify(dataResponse.invalidAfterTargets) === JSON.stringify(dataResponse.invalidBeforeTargets),
      `invalid Valley stats erased or advanced the last-good data targets: ${JSON.stringify(dataResponse)}`
    );
    assert(
      dataResponse.afterImpulses > dataResponse.beforeImpulses && dataResponse.afterImpulses <= 64,
      `Valley block-pulse response must be visible and bounded: ${JSON.stringify(dataResponse)}`
    );
    assert(
      dataResponse.reading.href === readingSetup.href
        && Math.abs(dataResponse.reading.scrollY - readingSetup.scrollY) <= 1
        && dataResponse.reading.activeInput
        && dataResponse.reading.inputStart === readingSetup.inputStart
        && dataResponse.reading.inputEnd === readingSetup.inputEnd
        && dataResponse.reading.selectedText === readingSetup.selectedText
        && dataResponse.reading.sameCanvas
        && dataResponse.reading.sameInput
        && dataResponse.reading.sameMain
        && dataResponse.reading.sameSection
        && dataResponse.reading.sameTitle,
      `Valley data motion disturbed passive reading state: ${JSON.stringify({ readingSetup, reading: dataResponse.reading })}`
    );
    await page.keyboard.press('Escape');
    await page.evaluate(() => document.getElementById('hero-search-input')?.blur());

    await page.evaluate(() => {
      window.__valleyVisibility = 'hidden';
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => window.__valleyVisibility
      });
      Object.defineProperty(document, 'hidden', {
        configurable: true,
        get: () => window.__valleyVisibility === 'hidden'
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForFunction(() => ['true', '1'].includes(
      document.getElementById('valley-background-canvas')?.dataset.valleyPaused || ''
    ), null, { timeout: 5000 });
    const hiddenFrame = await page.evaluate(() => Number(
      document.getElementById('valley-background-canvas')?.dataset.valleyFrame
    ) || 0);
    await page.waitForTimeout(300);
    const settledHiddenFrame = await page.evaluate(() => Number(
      document.getElementById('valley-background-canvas')?.dataset.valleyFrame
    ) || 0);
    assert(
      settledHiddenFrame - hiddenFrame <= 1,
      `Valley continued animating while hidden (${hiddenFrame} to ${settledHiddenFrame})`
    );
    await page.evaluate(() => {
      window.__valleyVisibility = 'visible';
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForFunction((previousFrame) => {
      const canvas = document.getElementById('valley-background-canvas');
      return canvas
        && !['true', '1'].includes(canvas.dataset.valleyPaused || '')
        && Number(canvas.dataset.valleyFrame) > previousFrame;
    }, settledHiddenFrame, { timeout: 5000 });

    await page.evaluate(() => {
      for (const theme of ['valley', 'matrix', 'valley', 'clean', 'matrix', 'valley']) {
        window.__valleySmokeSetTheme(theme);
      }
    });
    await page.waitForFunction(() => (
      document.body.dataset.theme === 'valley'
        && document.querySelectorAll('#valley-background-canvas').length === 1
        && Number(document.getElementById('valley-background-canvas')?.dataset.valleyFrame) > 0
    ), null, { timeout: 10000 });
    await page.waitForTimeout(200);
    const rapidSwitchState = await page.evaluate(() => ({
      theme: document.body.dataset.theme || '',
      canvases: document.querySelectorAll('#valley-background-canvas').length
    }));
    assert(
      rapidSwitchState.theme === 'valley' && rapidSwitchState.canvases === 1,
      `rapid Valley theme switching left stale canvases: ${JSON.stringify(rapidSwitchState)}`
    );

    const dataButtonGeometry = await page.evaluate(async () => {
      const webdriverDescriptor = Object.getOwnPropertyDescriptor(Navigator.prototype, 'webdriver');
      Object.defineProperty(Navigator.prototype, 'webdriver', {
        configurable: true,
        get: () => false
      });

      const button = document.createElement('button');
      const value = document.createElement('strong');
      button.style.cssText = [
        'position:fixed',
        'left:-9999px',
        'top:0',
        'width:2ch',
        'padding:0',
        'border:0',
        'font:16px/20px sans-serif',
        'white-space:normal',
        'word-break:normal',
        'overflow-wrap:normal'
      ].join(';');
      value.textContent = 'Data';
      button.append(value);
      document.body.append(button);

      const baselineHeight = value.getBoundingClientRect().height;
      const { mycelialBloomReveal } = await import('/js/effects/data-magic.js');
      const cancel = mycelialBloomReveal(value, 'Data', { duration: 500 });
      await new Promise(requestAnimationFrame);
      const animatedHeight = value.getBoundingClientRect().height;
      const charCount = value.querySelectorAll('.dm-mycelial-char').length;
      const wordCount = value.querySelectorAll('.dm-glyph-word').length;

      cancel();
      button.remove();
      if (webdriverDescriptor) {
        Object.defineProperty(Navigator.prototype, 'webdriver', webdriverDescriptor);
      } else {
        delete Navigator.prototype.webdriver;
      }

      return { animatedHeight, baselineHeight, charCount, wordCount };
    });
    assert(
      dataButtonGeometry.charCount === 4
        && dataButtonGeometry.wordCount === 1
        && dataButtonGeometry.animatedHeight <= dataButtonGeometry.baselineHeight + 1,
      `Valley data animation split a compact button into per-character lines: ${JSON.stringify(dataButtonGeometry)}`
    );

    for (const { label, viewport } of [
      { label: 'desktop', viewport: { width: 1366, height: 900 } },
      { label: 'mobile', viewport: { width: 390, height: 844 } },
      { label: 'short landscape', viewport: { width: 844, height: 390 } }
    ]) {
      await page.setViewportSize(viewport);
      await page.waitForFunction(({ width, height }) => {
        const canvas = document.getElementById('valley-background-canvas');
        const rect = canvas?.getBoundingClientRect();
        return rect
          && Math.abs(rect.width - width) <= 2
          && Math.abs(rect.height - height) <= 2;
      }, viewport, { timeout: 5000 });
      await page.locator('#settings-gear').scrollIntoViewIfNeeded();
      const geometry = await page.evaluate(() => {
        const canvas = document.getElementById('valley-background-canvas');
        const gear = document.getElementById('settings-gear');
        const canvasRect = canvas?.getBoundingClientRect();
        const gearRect = gear?.getBoundingClientRect();
        return {
          ariaHidden: canvas?.getAttribute('aria-hidden') || '',
          canvasRect: canvasRect ? {
            bottom: canvasRect.bottom,
            height: canvasRect.height,
            left: canvasRect.left,
            right: canvasRect.right,
            top: canvasRect.top,
            width: canvasRect.width
          } : null,
          documentOverflow: document.documentElement.scrollWidth - innerWidth,
          pointerEvents: canvas ? getComputedStyle(canvas).pointerEvents : '',
          rasterScaleX: canvasRect?.width ? canvas.width / canvasRect.width : 999,
          rasterScaleY: canvasRect?.height ? canvas.height / canvasRect.height : 999,
          viewport: { width: innerWidth, height: innerHeight }
        };
      });
      assert(
        geometry.ariaHidden === 'true'
          && geometry.pointerEvents === 'none',
        `Valley ${label} canvas must stay decorative and pointer-free: ${JSON.stringify(geometry)}`
      );
      assert(
        geometry.canvasRect
          && Math.abs(geometry.canvasRect.left) <= 1
          && Math.abs(geometry.canvasRect.top) <= 1
          && Math.abs(geometry.canvasRect.right - geometry.viewport.width) <= 2
          && Math.abs(geometry.canvasRect.bottom - geometry.viewport.height) <= 2
          && geometry.documentOverflow <= 1
          && geometry.rasterScaleX >= 1
          && geometry.rasterScaleX <= 1.05
          && geometry.rasterScaleY >= 1
          && geometry.rasterScaleY <= 1.05,
        `Valley ${label} canvas geometry or DPR cap drifted: ${JSON.stringify(geometry)}`
      );

      // A real click while the canvas is present proves it cannot intercept the UI.
      await ensureDropdownOpen(page, '#settings-gear', '#settings-dropdown');
      await page.locator('#theme-toggle').click();
      await page.locator('#theme-picker-dropdown.open').waitFor({ state: 'visible', timeout: 5000 });
      await page.waitForFunction(() => {
        const picker = document.getElementById('theme-picker-dropdown');
        const rect = picker?.getBoundingClientRect();
        return rect && rect.top >= -1 && rect.bottom <= innerHeight + 1;
      }, null, { timeout: 2000 });
      const valleyRow = page.locator('#theme-picker-dropdown .theme-row[data-theme="valley"]');
      await assertLocatorCount(valleyRow, 1, `Valley ${label} picker row`);
      await valleyRow.scrollIntoViewIfNeeded();
      const pickerGeometry = await page.evaluate(() => {
        const picker = document.getElementById('theme-picker-dropdown');
        const row = picker?.querySelector('.theme-row[data-theme="valley"]');
        const pickerRect = picker?.getBoundingClientRect();
        const rowRect = row?.getBoundingClientRect();
        return {
          picker: pickerRect ? {
            bottom: pickerRect.bottom,
            left: pickerRect.left,
            right: pickerRect.right,
            top: pickerRect.top
          } : null,
          row: rowRect ? {
            bottom: rowRect.bottom,
            left: rowRect.left,
            right: rowRect.right,
            top: rowRect.top
          } : null,
          rowVisible: Boolean(row && getComputedStyle(row).display !== 'none' && rowRect?.width && rowRect?.height),
          viewport: { width: innerWidth, height: innerHeight }
        };
      });
      assert(
        pickerGeometry.picker
          && pickerGeometry.row
          && pickerGeometry.rowVisible
          && pickerGeometry.picker.left >= -1
          && pickerGeometry.picker.right <= pickerGeometry.viewport.width + 1
          && pickerGeometry.picker.top >= -1
          && pickerGeometry.picker.bottom <= pickerGeometry.viewport.height + 1
          && pickerGeometry.row.left >= Math.max(-1, pickerGeometry.picker.left - 1)
          && pickerGeometry.row.right <= Math.min(pickerGeometry.viewport.width + 1, pickerGeometry.picker.right + 1)
          && pickerGeometry.row.top >= Math.max(-1, pickerGeometry.picker.top - 1)
          && pickerGeometry.row.bottom <= Math.min(pickerGeometry.viewport.height + 1, pickerGeometry.picker.bottom + 1),
        `Valley ${label} picker is clipped or off-screen: ${JSON.stringify(pickerGeometry)}`
      );
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
    }

    await context.close();

    const reducedMotionContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: 'reduce',
      serviceWorkers: 'block'
    });
    await installFeatureMocks(reducedMotionContext);
    await reducedMotionContext.addInitScript(() => {
      localStorage.setItem('tezos-systems-theme', 'valley');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    });
    const reducedMotionPage = await reducedMotionContext.newPage();
    attachIssueCollectors(reducedMotionPage, 'Valley reduced motion', issues);
    const reducedResponse = await reducedMotionPage.goto(`${baseUrl}/?theme=valley`, { waitUntil: 'domcontentloaded' });
    assert(reducedResponse?.ok(), `Valley reduced motion failed with HTTP ${reducedResponse?.status()}`);
    await reducedMotionPage.locator('main').waitFor({ state: 'visible', timeout: 15000 });
    await reducedMotionPage.waitForFunction(() => Boolean(document.getElementById('theme-css-valley')?.sheet), null, { timeout: 5000 });
    const reducedBefore = await reducedMotionPage.evaluate(() => {
      const canvas = document.getElementById('valley-background-canvas');
      const fallback = getComputedStyle(document.body, '::before');
      return {
        animationName: fallback.animationName,
        backgroundImage: fallback.backgroundImage,
        canvas: Boolean(canvas),
        frame: Number(canvas?.dataset.valleyFrame) || 0,
        paused: canvas?.dataset.valleyPaused || '',
        pointerEvents: fallback.pointerEvents,
        theme: document.body.dataset.theme || ''
      };
    });
    await reducedMotionPage.waitForTimeout(300);
    const reducedAfter = await reducedMotionPage.evaluate(() => {
      const canvas = document.getElementById('valley-background-canvas');
      return {
        canvas: Boolean(canvas),
        frame: Number(canvas?.dataset.valleyFrame) || 0,
        paused: canvas?.dataset.valleyPaused || ''
      };
    });
    assert(
      reducedBefore.theme === 'valley'
        && reducedBefore.backgroundImage !== 'none'
        && reducedBefore.animationName === 'none'
        && reducedBefore.pointerEvents === 'none'
        && (
          (!reducedBefore.canvas && !reducedAfter.canvas)
          || (
            ['true', '1'].includes(reducedBefore.paused)
            && ['true', '1'].includes(reducedAfter.paused)
            && reducedAfter.frame === reducedBefore.frame
          )
        ),
      `Valley reduced motion must use the static CSS landscape without animation: ${JSON.stringify({ reducedBefore, reducedAfter })}`
    );
    await reducedMotionContext.close();

    assert(issues.length === 0, `Valley theme browser issues:\n${issues.join('\n')}`);
    log('ok - Valley data-reactive background lifecycle, accessibility, and responsive smoke');
  }

  async function smokeThemeSelection(browser, baseUrl) {
    const issues = [];
    const fontExpectations = {
      aurora: { ui: '-apple-system', display: 'Orbitron', data: 'JetBrains Mono', runtime: 'Chakra Petch' },
      matrix: { ui: 'Share Tech Mono', display: 'Share Tech Mono', data: 'JetBrains Mono', runtime: 'Share Tech Mono' },
      hen: { ui: 'JetBrains Mono', display: 'JetBrains Mono', data: 'JetBrains Mono', runtime: 'JetBrains Mono' },
      default: { ui: '-apple-system', display: 'Orbitron', data: 'JetBrains Mono', runtime: 'Chakra Petch' },
      void: { ui: 'Exo 2', display: 'Exo 2', data: 'JetBrains Mono', runtime: 'Exo 2' },
      ember: { ui: 'Chakra Petch', display: 'Chakra Petch', data: 'JetBrains Mono', runtime: 'Chakra Petch' },
      signal: { ui: 'JetBrains Mono', display: 'JetBrains Mono', data: 'JetBrains Mono', runtime: 'JetBrains Mono' },
      nerv: { ui: 'JetBrains Mono', display: 'Archivo Black', data: 'JetBrains Mono', runtime: 'JetBrains Mono' },
      clean: { ui: '-apple-system', display: '-apple-system', data: '-apple-system', runtime: 'JetBrains Mono' },
      dark: { ui: '-apple-system', display: '-apple-system', data: '-apple-system', runtime: 'JetBrains Mono' },
      bubblegum: { ui: 'Nunito', display: 'Nunito', data: 'Nunito', runtime: 'Nunito' },
      abyss: { ui: 'Exo 2', display: 'Exo 2', data: 'JetBrains Mono', runtime: 'Exo 2' },
      moss: { ui: 'Nunito', display: 'Major Mono Display', data: 'Nunito', runtime: 'Nunito' },
      valley: { ui: 'Nunito', display: 'Nunito', data: 'Nunito', runtime: 'Nunito' },
      warzone: { ui: 'Chakra Petch', display: 'Silkscreen', data: 'JetBrains Mono', runtime: 'JetBrains Mono' }
    };
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      serviceWorkers: 'block'
    });
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseUrl });
    await installFeatureMocks(context);
    await context.addInitScript(() => {
      localStorage.setItem('tezos-systems-theme', 'matrix');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    });

    const page = await context.newPage();
    attachIssueCollectors(page, 'theme selection', issues);
    const response = await page.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `theme selection: dashboard failed with HTTP ${response?.status()}`);
    await page.locator('main').waitFor({ state: 'visible', timeout: 15000 });

    const themes = await page.evaluate(() => Array.from(document.querySelectorAll('#theme-picker-dropdown .theme-row')).map((row) => row.dataset.theme)).catch(() => []);
    assert(themes.length === 0, 'theme picker should not exist before opening');

    // A visible <main> precedes the end of synchronous app wiring; wait for the
    // first resolved Live Head row so the Smart Dock listener is definitely live.
    await page.waitForFunction(() => document.querySelector('#live-head-stack [data-live-head-level]'), null, { timeout: 15000 });
    await ensureDropdownOpen(page, '#settings-gear', '#settings-dropdown');
    await page.locator('#theme-toggle').click();
    await page.locator('#theme-picker-dropdown.open').waitFor({ state: 'visible', timeout: 5000 });
    const registeredThemes = await page.evaluate(() => Array.from(document.querySelectorAll('#theme-picker-dropdown .theme-row'))
      .map((row) => row.dataset.theme || '')
      .filter(Boolean));
    assert(registeredThemes.length === 15 && new Set(registeredThemes).size === 15, `theme picker should expose 15 unique themes: ${registeredThemes.join(', ')}`);
    assert(registeredThemes.every((theme) => fontExpectations[theme]), `theme font expectations missing registry entries: ${registeredThemes.filter((theme) => !fontExpectations[theme]).join(', ')}`);
    const pickerSemantics = await page.evaluate(() => ({
      groupRole: document.querySelector('#theme-picker-dropdown')?.getAttribute('role') || '',
      radioCount: document.querySelectorAll('#theme-picker-dropdown input.theme-radio[type="radio"]').length,
      checked: Array.from(document.querySelectorAll('#theme-picker-dropdown input.theme-radio:checked')).map((input) => input.value),
      focused: document.activeElement?.classList.contains('theme-radio') || false
    }));
    assert(pickerSemantics.groupRole === 'radiogroup' && pickerSemantics.radioCount === 15 && pickerSemantics.checked.join(',') === 'matrix' && pickerSemantics.focused, `theme picker native radio semantics mismatch: ${JSON.stringify(pickerSemantics)}`);
    const copyControls = await page.evaluate(() => Array.from(document.querySelectorAll('#theme-picker-dropdown .theme-link-copy')).map((button) => ({
      hash: button.getAttribute('data-copy-hash') || '',
      label: button.getAttribute('aria-label') || '',
      theme: button.closest('.theme-row-shell')?.getAttribute('data-theme-choice') || ''
    })));
    assert(
      copyControls.length === registeredThemes.length
        && copyControls.every((control, index) => (
          control.theme === registeredThemes[index]
          && control.hash === `#theme=${control.theme}`
          && control.label === `Copy ${control.theme.charAt(0).toUpperCase()}${control.theme.slice(1)} theme link`
        )),
      `theme picker copy controls should map one accessible direct link to every theme: ${JSON.stringify(copyControls)}`
    );
    const beforeCopyUrl = page.url();
    await page.locator('#theme-picker-dropdown .theme-link-copy[data-copy-hash="#theme=valley"]').click();
    await page.waitForFunction(() => document.querySelector('.theme-link-copy[data-copy-hash="#theme=valley"]')?.classList.contains('copied'), null, { timeout: 3000 });
    const copiedThemeState = await page.evaluate(() => ({
      checked: document.querySelector('#theme-picker-dropdown .theme-radio:checked')?.value || '',
      copiedLabel: document.querySelector('.theme-link-copy[data-copy-hash="#theme=valley"]')?.getAttribute('aria-label') || '',
      focusedHash: document.activeElement?.getAttribute?.('data-copy-hash') || '',
      pickerOpen: document.querySelector('#theme-picker-dropdown')?.classList.contains('open') || false,
      theme: document.body.dataset.theme || ''
    }));
    copiedThemeState.clipboard = await page.evaluate(() => navigator.clipboard.readText());
    assert(
      copiedThemeState.clipboard === new URL('/#theme=valley', baseUrl).toString()
        && copiedThemeState.checked === 'matrix'
        && copiedThemeState.theme === 'matrix'
        && copiedThemeState.pickerOpen
        && copiedThemeState.focusedHash === '#theme=valley'
        && /copied/i.test(copiedThemeState.copiedLabel)
        && page.url() === beforeCopyUrl,
      `copying Valley should keep the picker and selected theme stable: ${JSON.stringify({ ...copiedThemeState, beforeCopyUrl, afterCopyUrl: page.url() })}`
    );
    await page.locator('#theme-picker-dropdown .theme-radio:checked').focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => document.body.dataset.theme === 'hen' && document.querySelector('#theme-picker-dropdown input.theme-radio[value="hen"]')?.checked, null, { timeout: 5000 });
    await page.keyboard.press('Escape');

    for (const theme of ['clean', 'dark', 'bubblegum', 'warzone']) {
      await ensureDropdownOpen(page, '#settings-gear', '#settings-dropdown');
      await page.locator('#theme-toggle').click();
      await page.locator('#theme-picker-dropdown.open').waitFor({ state: 'visible', timeout: 5000 });
      const row = page.locator(`#theme-picker-dropdown .theme-row[data-theme="${theme}"]`);
      await assertLocatorCount(row, 1, `theme row ${theme}`);
      await row.click();
      await page.waitForFunction((expected) => document.body.getAttribute('data-theme') === expected, theme, { timeout: 5000 });
    }

    for (const theme of registeredThemes) {
      const themeResponse = await page.goto(`${baseUrl}/?theme=${theme}`, { waitUntil: 'domcontentloaded' });
      assert(themeResponse?.ok(), `theme ${theme}: dashboard failed with HTTP ${themeResponse?.status()}`);
      await page.locator('main').waitFor({ state: 'visible', timeout: 15000 });
      await page.waitForFunction(() => document.documentElement.dataset.dashboardReady === 'true', null, { timeout: 30000 });
      await page.waitForFunction(() => Boolean(document.getElementById('shell-extras-css')?.sheet), null, { timeout: 5000 });
      const state = await page.evaluate(async () => {
        await document.fonts.ready;
        const title = document.querySelector('.title');
        const runtime = document.querySelector('.top-continuity-runtime');
        const dataRail = document.querySelector('.top-continuity-panel');
        const specialtyDisplay = ['#chambers-section .section-header h2', '.site-handoff-head h2']
          .map((selector) => document.querySelector(selector))
          .filter(Boolean);
        const typographyFixture = document.createElement('div');
        typographyFixture.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none';
        typographyFixture.innerHTML = '<span class="calc-breakdown-value">123</span><span class="my-tezos-value">456</span>';
        document.body.appendChild(typographyFixture);
        const specialtyDataFonts = Array.from(typographyFixture.children, (node) => getComputedStyle(node).fontFamily);
        typographyFixture.remove();
        const pillFixture = document.createElement('div');
        pillFixture.style.cssText = 'position:fixed;left:-10000px;top:0;display:flex;pointer-events:none';
        pillFixture.innerHTML = [
          ['quiet', 'live-head-quiet'],
          ['gas-open', 'live-head-gas'],
          ['gas-active', 'live-head-gas is-active'],
          ['gas-busy', 'live-head-gas is-busy'],
          ['gas-hot', 'live-head-gas is-hot'],
          ['gas-unavailable', 'live-head-gas is-unavailable'],
          ...['l1-vote', 'l2-vote', 'art', 'defi', 'gaming', 'bridge', 'etherlink', 'stake', 'unstake', 'transfers', 'quiet']
            .map((tone) => [`story-${tone}`, `live-head-story-chip is-${tone}`]),
          ['story-round-miss', 'live-head-story-chip is-round-miss'],
          ['miss', 'live-head-miss-pill'],
          ['miss-more', 'live-head-miss-pill is-more'],
          ['miss-unavailable', 'live-head-miss-pill is-unavailable'],
          ['miss-clear', 'live-head-miss-pill is-clear']
        ].map(([label, className]) => `<span data-pill="${label}" class="${className}">${label}</span>`).join('');
        document.body.appendChild(pillFixture);
        const parseColor = (value) => {
          const channels = String(value).match(/[\d.]+/g)?.map(Number) || [];
          return { r: channels[0] || 0, g: channels[1] || 0, b: channels[2] || 0, a: channels[3] ?? 1 };
        };
        const composite = (foreground, base) => ({
          r: foreground.r * foreground.a + base * (1 - foreground.a),
          g: foreground.g * foreground.a + base * (1 - foreground.a),
          b: foreground.b * foreground.a + base * (1 - foreground.a)
        });
        const luminance = ({ r, g, b }) => {
          const linear = [r, g, b].map((channel) => {
            const normalized = channel / 255;
            return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
          });
          return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
        };
        const contrast = (first, second) => {
          const light = Math.max(luminance(first), luminance(second));
          const dark = Math.min(luminance(first), luminance(second));
          return (light + 0.05) / (dark + 0.05);
        };
        const pillReadability = Array.from(pillFixture.children, (pill) => {
          const style = getComputedStyle(pill);
          const foreground = parseColor(style.color);
          const background = parseColor(style.backgroundColor);
          return {
            label: pill.dataset.pill || '',
            backgroundColor: style.backgroundColor,
            backgroundAlpha: background.a,
            borderAlpha: parseColor(style.borderTopColor).a,
            insetEdge: style.boxShadow.includes('inset'),
            color: style.color,
            fontWeight: Number(style.fontWeight || 0),
            hasBackdrop: style.backdropFilter !== 'none' || style.webkitBackdropFilter !== 'none',
            hasTextShadow: style.textShadow !== 'none',
            worstContrast: Math.min(
              contrast(foreground, composite(background, 0)),
              contrast(foreground, composite(background, 255))
            )
          };
        });
        pillFixture.remove();
        return {
          bodyFont: getComputedStyle(document.body).fontFamily,
          dataFont: dataRail ? getComputedStyle(dataRail).fontFamily : '',
          documentOverflow: document.documentElement.scrollWidth - innerWidth,
          runtimeFont: runtime ? getComputedStyle(runtime).fontFamily : '',
          runtimeOverflow: runtime ? runtime.scrollWidth - runtime.clientWidth : 0,
          pillReadability,
          specialtyDataFonts,
          specialtyDisplayFonts: specialtyDisplay.map((node) => getComputedStyle(node).fontFamily),
          titleFont: title ? getComputedStyle(title).fontFamily : '',
          titleOverflow: title ? title.scrollWidth - title.clientWidth : 0
        };
      });
      const expected = fontExpectations[theme];
      const specialtyDataExpected = ['aurora', 'default'].includes(theme) ? 'Orbitron' : expected.data;
      assert(state.bodyFont.includes(expected.ui), `theme ${theme}: UI font mismatch ${state.bodyFont} (expected ${expected.ui})`);
      assert(state.titleFont.includes(expected.display), `theme ${theme}: display font mismatch ${state.titleFont} (expected ${expected.display})`);
      assert(state.dataFont.includes(expected.data), `theme ${theme}: data font mismatch ${state.dataFont} (expected ${expected.data})`);
      assert(state.runtimeFont.includes(expected.runtime), `theme ${theme}: runtime font mismatch ${state.runtimeFont} (expected ${expected.runtime})`);
      assert(state.specialtyDisplayFonts.length === 2 && state.specialtyDisplayFonts.every((font) => font.includes(expected.display)), `theme ${theme}: specialty display font mismatch ${JSON.stringify(state.specialtyDisplayFonts)} (expected ${expected.display})`);
      assert(state.specialtyDataFonts.length === 2 && state.specialtyDataFonts.every((font) => font.includes(specialtyDataExpected)), `theme ${theme}: specialty data font mismatch ${JSON.stringify(state.specialtyDataFonts)} (expected ${specialtyDataExpected})`);
      assert(
        state.pillReadability.length === 22
          && state.pillReadability.every((pill) => (
            pill.backgroundAlpha >= 0.85
            && (pill.label === 'story-round-miss'
              ? pill.borderAlpha >= 0.85
              : (/^(?:story-|miss)/.test(pill.label) ? pill.borderAlpha === 0 && !pill.insetEdge : pill.borderAlpha >= 0.85))
            && pill.hasBackdrop
            && pill.worstContrast >= 4.5
          )),
        `theme ${theme}: every Live Head pill must retain its opaque readable fill while only missed-round activity keeps a lower-line edge: ${JSON.stringify(state.pillReadability)}`
      );
      const l1VotePill = state.pillReadability.find((pill) => pill.label === 'story-l1-vote');
      const l2VotePill = state.pillReadability.find((pill) => pill.label === 'story-l2-vote');
      assert(
        l1VotePill?.color === l2VotePill?.color
          && l1VotePill?.backgroundColor === l2VotePill?.backgroundColor
          && l1VotePill?.fontWeight >= 800
          && l2VotePill?.fontWeight >= 800,
        `theme ${theme}: L1/L2 voting pills should share one bold governance treatment: ${JSON.stringify({ l1VotePill, l2VotePill })}`
      );
      assert(state.titleOverflow <= 1 && state.runtimeOverflow <= 1 && state.documentOverflow <= 1, `theme ${theme}: desktop typography overflow ${JSON.stringify(state)}`);
    }

    await context.close();

    const hashContext = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(hashContext);
    await hashContext.addInitScript(() => {
      localStorage.setItem('tezos-systems-theme', 'matrix');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
      window.__themeChangeTrace = [];
      window.addEventListener('themechange', (event) => {
        window.__themeChangeTrace.push(event.detail?.theme || '');
      });
    });
    const hashPage = await hashContext.newPage();
    attachIssueCollectors(hashPage, 'theme hash direct link', issues);
    const hashResponse = await hashPage.goto(`${baseUrl}/#theme=valley`, { waitUntil: 'domcontentloaded' });
    assert(hashResponse?.ok(), `theme hash direct link failed with HTTP ${hashResponse?.status()}`);
    await hashPage.locator('main').waitFor({ state: 'visible', timeout: 15000 });
    await hashPage.waitForFunction(() => document.documentElement.dataset.dashboardReady === 'true', null, { timeout: 30000 });
    await hashPage.waitForFunction(() => document.body.dataset.theme === 'valley', null, { timeout: 5000 });
    const hashThemeState = await hashPage.evaluate(() => ({
      cssLinks: Array.from(document.querySelectorAll('link[id^="theme-css-"]'), (link) => link.id),
      saved: localStorage.getItem('tezos-systems-theme') || '',
      theme: document.body.dataset.theme || '',
      trace: window.__themeChangeTrace || []
    }));
    assert(
      hashThemeState.theme === 'valley'
        && hashThemeState.saved === 'valley'
        && hashThemeState.trace.length > 0
        && hashThemeState.trace.every((theme) => theme === 'valley')
        && hashThemeState.cssLinks.includes('theme-css-valley')
        && !hashThemeState.cssLinks.includes('theme-css-matrix'),
      `theme hash direct link must override saved Matrix without an intermediate repaint: ${JSON.stringify(hashThemeState)}`
    );
    await hashContext.close();

    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      serviceWorkers: 'block'
    });
    await mobileContext.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseUrl });
    await installFeatureMocks(mobileContext);
    await mobileContext.addInitScript(() => {
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    });
    const mobilePage = await mobileContext.newPage();
    attachIssueCollectors(mobilePage, 'theme typography mobile', issues);

    const mobilePickerResponse = await mobilePage.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
    assert(mobilePickerResponse?.ok(), `theme picker mobile: dashboard failed with HTTP ${mobilePickerResponse?.status()}`);
    await mobilePage.locator('main').waitFor({ state: 'visible', timeout: 15000 });
    await mobilePage.waitForFunction(() => document.documentElement.dataset.dashboardReady === 'true', null, { timeout: 30000 });
    await ensureDropdownOpen(mobilePage, '#settings-gear', '#settings-dropdown');
    await mobilePage.locator('#theme-toggle').click();
    await mobilePage.locator('#theme-picker-dropdown.open').waitFor({ state: 'visible', timeout: 5000 });
    const mobilePickerState = await mobilePage.evaluate(() => {
      const picker = document.querySelector('#theme-picker-dropdown');
      const pickerRect = picker?.getBoundingClientRect();
      const buttons = Array.from(document.querySelectorAll('#theme-picker-dropdown .theme-link-copy'));
      const buttonRects = buttons.map((button) => button.getBoundingClientRect());
      return {
        buttonCount: buttons.length,
        buttonsInside: buttonRects.every((rect) => pickerRect && rect.left >= pickerRect.left && rect.right <= pickerRect.right),
        maxButtonSize: Math.max(0, ...buttonRects.map((rect) => Math.max(rect.width, rect.height))),
        minButtonSize: Math.min(...buttonRects.map((rect) => Math.min(rect.width, rect.height))),
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        pickerInside: Boolean(pickerRect && pickerRect.left >= -1 && pickerRect.right <= window.innerWidth + 1),
        sheet: picker?.classList.contains('mobile-bottom-sheet') || false
      };
    });
    assert(
      mobilePickerState.buttonCount === registeredThemes.length
        && mobilePickerState.buttonsInside
        && mobilePickerState.minButtonSize >= 28
        && mobilePickerState.maxButtonSize <= 32
        && mobilePickerState.overflow <= 1
        && mobilePickerState.pickerInside
        && mobilePickerState.sheet,
      `theme picker mobile copy controls should stay compact and contained: ${JSON.stringify(mobilePickerState)}`
    );
    await mobilePage.locator('#theme-picker-dropdown .theme-link-copy[data-copy-hash="#theme=valley"]').click();
    await mobilePage.waitForFunction(() => document.querySelector('.theme-link-copy[data-copy-hash="#theme=valley"]')?.classList.contains('copied'), null, { timeout: 3000 });
    const mobileCopyState = await mobilePage.evaluate(async () => ({
      clipboard: await navigator.clipboard.readText(),
      open: document.querySelector('#theme-picker-dropdown')?.classList.contains('open') || false,
      selected: document.querySelector('#theme-picker-dropdown .theme-radio:checked')?.value || '',
      theme: document.body.dataset.theme || ''
    }));
    assert(
      mobileCopyState.clipboard === new URL('/#theme=valley', baseUrl).toString()
        && mobileCopyState.open
        && mobileCopyState.selected === 'matrix'
        && mobileCopyState.theme === 'matrix',
      `theme picker mobile copy should preserve selection and stay open: ${JSON.stringify(mobileCopyState)}`
    );
    await mobilePage.keyboard.press('Escape');

    for (const theme of registeredThemes) {
      const themeResponse = await mobilePage.goto(`${baseUrl}/?theme=${theme}`, { waitUntil: 'domcontentloaded' });
      await mobilePage.waitForFunction(() => document.documentElement.dataset.dashboardReady === 'true', null, { timeout: 30000 });
      assert(themeResponse?.ok(), `theme ${theme} mobile: dashboard failed with HTTP ${themeResponse?.status()}`);
      await mobilePage.locator('main').waitFor({ state: 'visible', timeout: 15000 });
      await mobilePage.waitForFunction(() => Boolean(document.getElementById('shell-extras-css')?.sheet), null, { timeout: 5000 });
      await mobilePage.waitForFunction(() => /\bTX\b/.test(document.querySelector('#header-activity-line')?.textContent || ''), null, { timeout: 10000 });
      await mobilePage.waitForFunction(() => document.querySelector('#pulse-ticker-strip')?.dataset.pulseState === 'ready', null, { timeout: 15000 });
      const state = await mobilePage.evaluate(async () => {
        await document.fonts.ready;
        const title = document.querySelector('.title');
        const uptime = document.querySelector('#top-continuity-history');
        const runtime = document.querySelector('.top-continuity-runtime');
        const activity = document.querySelector('#header-activity-button');
        const activityLine = document.querySelector('#header-activity-line');
        const titleRect = title?.getBoundingClientRect();
        const uptimeRect = uptime?.getBoundingClientRect();
        const activityRect = activity?.getBoundingClientRect();
        const runtimeStyle = runtime ? getComputedStyle(runtime) : null;
        const uptimeZoom = uptime ? Number.parseFloat(getComputedStyle(uptime).zoom || '1') || 1 : 1;
        const ledgerMetricOverflow = Math.max(0, ...Array.from(document.querySelectorAll('.ledger-flow-entry-metrics strong'))
          .map((node) => node.scrollWidth - node.clientWidth));
        return {
          centerDelta: titleRect && uptimeRect
            ? Math.abs((titleRect.left + titleRect.width / 2) - (uptimeRect.left + uptimeRect.width / 2))
            : 999,
          documentOverflow: document.documentElement.scrollWidth - innerWidth,
          ledgerMetricOverflow,
          runtimeFont: runtimeStyle?.fontFamily || '',
          runtimeNoWrap: runtimeStyle?.whiteSpace === 'nowrap',
          runtimeVisualFontSize: runtimeStyle ? Number.parseFloat(runtimeStyle.fontSize) * uptimeZoom : 0,
          titleOverflow: title ? title.scrollWidth - title.clientWidth : 999,
          uptimeInsideViewport: Boolean(uptimeRect && uptimeRect.left >= -1 && uptimeRect.right <= innerWidth + 1),
          activityInsideViewport: Boolean(activityRect && activityRect.left >= -1 && activityRect.right <= innerWidth + 1),
          activityUnderUptime: Boolean(activityRect && uptimeRect && activityRect.top >= uptimeRect.bottom - 1),
          activityOverflow: activityLine ? activityLine.scrollWidth - activityLine.clientWidth : 999,
          activityLabels: Array.from(activityLine?.querySelectorAll('.block-ticker-label') || []).filter((label) => getComputedStyle(label).display !== 'none').map((label) => label.textContent?.trim() || '')
        };
      });
      assert(state.runtimeFont.includes(fontExpectations[theme].runtime), `theme ${theme} mobile: runtime font mismatch ${state.runtimeFont}`);
      assert(state.centerDelta <= 2, `theme ${theme} mobile: uptime should share the title center (${state.centerDelta}px)`);
      assert(state.runtimeVisualFontSize >= 17, `theme ${theme} mobile: runtime should remain comfortably readable (${state.runtimeVisualFontSize}px)`);
      assert(state.runtimeNoWrap && state.uptimeInsideViewport, `theme ${theme} mobile: runtime escaped or wrapped ${JSON.stringify(state)}`);
      assert(state.activityInsideViewport && state.activityUnderUptime && state.activityOverflow <= 1 && ['TX', 'Moved', 'NFT'].every((label) => state.activityLabels.includes(label)), `theme ${theme} mobile: trailing-hour activity should remain visible below mainnet age ${JSON.stringify(state)}`);
      assert(state.ledgerMetricOverflow <= 1, `theme ${theme} mobile: Ledger Flow metric labels should not clip (${state.ledgerMetricOverflow}px)`);
      assert(state.titleOverflow <= 1 && state.documentOverflow <= 1, `theme ${theme} mobile: typography overflow ${JSON.stringify(state)}`);

      const milestoneState = await mobilePage.evaluate(async () => {
        const cluster = document.querySelector('.top-uptime-cluster');
        const uptime = document.querySelector('#top-continuity-history');
        const runtime = uptime?.querySelector('.top-continuity-runtime');
        const outline = uptime?.querySelector('.top-continuity-milestone-outline');
        const marker = uptime?.querySelector('.top-continuity-milestone-new');
        const activity = document.querySelector('#header-activity-button');
        const title = document.querySelector('.title');
        if (!cluster || !uptime || !runtime || !outline || !marker || !title) return { centerDelta: 999 };
        const parseColor = (value) => {
          const numbers = String(value || '').match(/[\d.]+/g)?.map(Number) || [];
          if (String(value).startsWith('color(srgb')) return numbers.slice(0, 3).map((channel) => channel * 255);
          return numbers.slice(0, 3);
        };
        const luminance = (value) => {
          const channels = parseColor(value).map((channel) => {
            const normalized = channel / 255;
            return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
          });
          return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
        };
        const contrast = (left, right) => {
          const first = luminance(left);
          const second = luminance(right);
          return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
        };
        const alpha = (value) => {
          if (String(value || '').trim() === 'transparent') return 0;
          const numbers = String(value || '').match(/[\d.]+/g)?.map(Number) || [];
          return numbers.length >= 4 ? numbers[3] : 1;
        };
        const activityTopBefore = activity?.getBoundingClientRect().top ?? -1;
        // This is a crossed-state typography fixture, independent of the live
        // catalog's current near/crossed status (which can legitimately say Soon).
        marker.textContent = 'New';
        outline.hidden = false;
        cluster.classList.remove('is-milestone-near');
        cluster.classList.add('has-milestone-signal', 'is-milestone-crossed', 'is-uptime-milestone-arriving');
        const activityTopAfterSignal = activity?.getBoundingClientRect().top ?? -1;
        await new Promise((resolve) => {
          const startedAt = performance.now();
          const waitForPaint = () => {
            if (Number.parseFloat(getComputedStyle(marker).opacity) >= 0.98
              || performance.now() - startedAt >= 5000) {
              resolve();
              return;
            }
            requestAnimationFrame(waitForPaint);
          };
          waitForPaint();
        });
        const titleRect = title.getBoundingClientRect();
        const uptimeRect = uptime.getBoundingClientRect();
        const runtimeRect = runtime.getBoundingClientRect();
        const outlineRect = outline.getBoundingClientRect();
        const markerRect = marker.getBoundingClientRect();
        const outlineStyle = getComputedStyle(outline);
        const markerStyle = getComputedStyle(marker);
        const paintTarget = document.elementFromPoint(
          markerRect.left + (markerRect.width / 2),
          markerRect.top + (markerRect.height / 2)
        );
        return {
          centerDelta: Math.abs((titleRect.left + titleRect.width / 2) - (uptimeRect.left + uptimeRect.width / 2)),
          subline: uptime.querySelector('.top-continuity-subline')?.textContent?.replace(/\s+/g, ' ').trim() || '',
          outlineVisible: !outline.hidden && outlineStyle.display !== 'none',
          outlineWrapsRuntime: outlineRect.left <= runtimeRect.left - 1
            && outlineRect.right >= runtimeRect.right + 1
            && outlineRect.top <= runtimeRect.top - 2
            && outlineRect.bottom >= runtimeRect.bottom + 2,
          outlineTightToRuntime: runtimeRect.left - outlineRect.left <= 7
            && outlineRect.right - runtimeRect.right <= 7
            && runtimeRect.top - outlineRect.top <= 5
            && outlineRect.bottom - runtimeRect.bottom <= 5,
          outlineInsideViewport: outlineRect.left >= 0 && outlineRect.right <= window.innerWidth,
          outlineBorderStyle: outlineStyle.borderStyle,
          outlineBorderWidth: Number.parseFloat(outlineStyle.borderTopWidth),
          outlineBackgroundAlpha: alpha(outlineStyle.backgroundColor),
          outlineBoxShadow: outlineStyle.boxShadow,
          outlineAnimation: outlineStyle.animationName,
          outlineAnimationIterations: outlineStyle.animationIterationCount,
          outlineGrayscaleContrast: contrast(outlineStyle.borderTopColor, getComputedStyle(document.body).backgroundColor),
          markerText: marker.textContent?.trim() || '',
          markerOpacity: Number.parseFloat(markerStyle.opacity),
          markerGap: outlineRect.top - markerRect.bottom,
          markerOutsideOutline: !outline.contains(marker),
          markerTopPainted: paintTarget === marker || marker.contains(paintTarget),
          markerBorderWidth: Number.parseFloat(markerStyle.borderTopWidth),
          markerBoxShadow: markerStyle.boxShadow,
          markerInsideViewport: markerRect.left >= 0 && markerRect.right <= window.innerWidth,
          markerAttachedTopRight: markerRect.right >= runtimeRect.right
            && markerRect.left >= runtimeRect.right - markerRect.width
            && markerRect.top < runtimeRect.top,
          markerContrast: contrast(markerStyle.color, markerStyle.backgroundColor),
          markerAnimation: markerStyle.animationName,
          markerAnimationIterations: markerStyle.animationIterationCount,
          activityShift: activityTopAfterSignal >= 0 ? Math.abs(activityTopAfterSignal - activityTopBefore) : 999,
          orbitControls: document.querySelectorAll('.top-continuity-milestone-orbit').length,
          detachedInfoControls: document.querySelectorAll('.top-continuity-milestone-info').length
        };
      });
      assert(
        milestoneState.centerDelta <= 2
          && /Zero outages/i.test(milestoneState.subline)
          && milestoneState.outlineVisible
          && milestoneState.outlineWrapsRuntime
          && milestoneState.outlineTightToRuntime
          && milestoneState.outlineInsideViewport
          && milestoneState.outlineBorderStyle === 'solid'
          && milestoneState.outlineBorderWidth === 1
          && milestoneState.outlineBackgroundAlpha === 0
          && milestoneState.outlineBoxShadow === 'none'
          && milestoneState.outlineAnimation.includes('uptimeMilestoneOutlineArrival')
          && milestoneState.outlineAnimationIterations === '1'
          && milestoneState.outlineGrayscaleContrast >= 3
          && milestoneState.markerText === 'New'
          && milestoneState.markerOpacity >= 0.98
          && milestoneState.markerGap >= 1
          && milestoneState.markerOutsideOutline
          && milestoneState.markerTopPainted
          && milestoneState.markerBorderWidth === 0
          && milestoneState.markerBoxShadow === 'none'
          && milestoneState.markerInsideViewport
          && milestoneState.markerAttachedTopRight
          && milestoneState.markerContrast >= 4.5
          && milestoneState.markerAnimation.includes('uptimeMilestoneNewReveal')
          && milestoneState.markerAnimation.includes('uptimeMilestoneNewNudge')
          && milestoneState.markerAnimationIterations.split(',').every((value) => value.trim() === '1')
          && milestoneState.activityShift <= 1
          && milestoneState.orbitControls === 0
          && milestoneState.detachedInfoControls === 0,
        `theme ${theme} mobile: clean outlined NEW action should stay attached, readable in color and grayscale, one-shot, and integrated with the centered uptime clock ${JSON.stringify(milestoneState)}`
      );
    }

    await mobileContext.close();

    const reducedMotionContext = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      reducedMotion: 'reduce',
      serviceWorkers: 'block'
    });
    await installFeatureMocks(reducedMotionContext);
    await reducedMotionContext.addInitScript(() => {
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    });
    const reducedMotionPage = await reducedMotionContext.newPage();
    for (const theme of ['aurora', 'matrix', 'void']) {
      const reducedResponse = await reducedMotionPage.goto(`${baseUrl}/?theme=${theme}`, { waitUntil: 'domcontentloaded' });
      await reducedMotionPage.waitForFunction(() => document.documentElement.dataset.dashboardReady === 'true', null, { timeout: 30000 });
      await reducedMotionPage.waitForFunction(() => document.querySelector('#pulse-ticker-strip')?.dataset.pulseState === 'ready', null, { timeout: 15000 });
      assert(reducedResponse?.ok(), `theme ${theme} reduced motion: dashboard failed with HTTP ${reducedResponse?.status()}`);
      await reducedMotionPage.locator('main').waitFor({ state: 'visible', timeout: 15000 });
      const reducedState = await reducedMotionPage.evaluate(() => {
        const cluster = document.querySelector('.top-uptime-cluster');
        const outline = document.querySelector('.top-continuity-milestone-outline');
        const marker = document.querySelector('.top-continuity-milestone-new');
        if (outline) outline.hidden = false;
        cluster?.classList.add('has-milestone-signal', 'is-uptime-milestone-arriving');
        const markerRect = marker?.getBoundingClientRect();
        const paintTarget = markerRect
          ? document.elementFromPoint(
              markerRect.left + (markerRect.width / 2),
              markerRect.top + (markerRect.height / 2)
            )
          : null;
        return {
          beforeAnimation: getComputedStyle(document.body, '::before').animationName,
          afterAnimation: getComputedStyle(document.body, '::after').animationName,
          matrixCanvas: Boolean(document.getElementById('matrix-canvas')),
          backgroundCanvas: Boolean(document.getElementById('bg-effects-canvas')),
          outlineAnimation: outline ? getComputedStyle(outline).animationName : '',
          markerAnimation: marker ? getComputedStyle(marker).animationName : '',
          markerOpacity: marker ? Number.parseFloat(getComputedStyle(marker).opacity) : 0,
          markerOutsideOutline: Boolean(marker && outline && !outline.contains(marker)),
          markerTopPainted: Boolean(marker && paintTarget && (paintTarget === marker || marker.contains(paintTarget)))
        };
      });
      assert(reducedState.beforeAnimation === 'none' && reducedState.afterAnimation === 'none'
        && !reducedState.matrixCanvas && !reducedState.backgroundCanvas
        && reducedState.outlineAnimation === 'none' && reducedState.markerAnimation === 'none'
        && reducedState.markerOpacity >= 0.98
        && reducedState.markerOutsideOutline
        && reducedState.markerTopPainted,
      `theme ${theme}: reduced motion must disable pseudo-element and canvas animation ${JSON.stringify(reducedState)}`);
    }
    await reducedMotionContext.close();

    assert(issues.length === 0, `theme selection browser issues:\n${issues.join('\n')}`);
    log('ok - all-theme typography and selection smoke');
  }

  return { smokeValleyTheme, smokeThemeSelection };
}
