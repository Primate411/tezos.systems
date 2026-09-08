import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

export async function smokeChainHealth(browser, baseUrl, { installFeatureMocks, artifactsDir }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  await installFeatureMocks(context, { blockHeadAutoAdvance: false });
  let head = 12345678;
  let unavailable = false;
  let scenario = 'mixed';
  let requests = 0;
  await context.route('**/v1/blocks?**', async (route) => {
    const params = new URL(route.request().url()).searchParams;
    if (params.get('limit') !== '26' || !params.get('select')?.includes('attestationCommittee')) return route.fallback();
    requests += 1;
    if (unavailable) return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
    const blocks = Array.from({ length: 26 }, (_, i) => ({
      level: head - i, cycle: 1143, proto: 25,
      timestamp: new Date(Date.now() - i * 6000).toISOString(),
      producer: { address: 'tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb', alias: 'QA Baker' },
      attestationPower: scenario === 'mixed' ? [7000, 6997, 6500, 4500, null][(head - i) % 5]
        : scenario === 'bands' ? [7000, 6500, 6000, 5500, 4700, 4666, null][i % 7]
        : scenario === 'partial' ? (i < 9 ? 6895 : null)
        : { perfect: 7000, strong: 6500, watch: 6000, low: 5500, dire: 4700, quorum: 4667, risk: 4666, unknown: null }[scenario],
      attestationCommittee: 7000,
      blockRound: 0, payloadRound: 0
    }));
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(blocks) });
  });
  await context.route('**/v1/rights?**', (route) => {
    const params = new URL(route.request().url()).searchParams;
    if (params.get('type') !== 'attestation' || params.get('status') !== 'missed') return route.fallback();
    const first = Number(params.get('level.ge'));
    const last = Number(params.get('level.le'));
    const rights = Array.from({ length: Math.max(0, last - first + 1) }, (_, i) => first + i)
      .filter((level) => level % 5 !== 0)
      .flatMap((level) => [
        { level, type: 'attestation', status: 'missed', slots: 1,
          baker: { address: 'tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb', alias: `Receipt Baker ${level}` } },
        ...(level % 5 === 1 ? [
          { level, type: 'attestation', status: 'missed', slots: 1,
            baker: { address: 'tz1aWXP237BLwNHJcCD4b3DutCevhqq2T1Z9', alias: 'Second Baker' } },
          { level, type: 'attestation', status: 'missed', slots: 1,
            baker: { address: 'tz1hThMBD8jQjFt78heuCnKxJnJtQo9Ao25X', alias: 'Third Baker' } }
        ] : [])
      ]);
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(rights) });
  });
  await context.addInitScript(() => {
    localStorage.setItem('tezos-systems-theme', 'ember');
    localStorage.setItem('tezos-toured', '1');
    localStorage.setItem('tezos-welcomed', '1');
    localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    localStorage.setItem('tezos-systems-live-head-depth-v1', JSON.stringify({ version: 2, mode: '10', customRows: 10 }));
  });
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('[data-chain-health-level]').length === 25);
  await page.evaluate(async () => {
    const { versionedAsset } = await import('/js/core/asset-version.js');
    const { refreshNetworkHealth } = await import(versionedAsset('/js/features/network-health.js'));
    window.__refreshChainHealth = refreshNetworkHealth;
    await refreshNetworkHealth();
  });
  const read = () => page.evaluate(() => {
    const viewport = document.getElementById('chain-health-window');
    const bars = [...viewport.querySelectorAll('[data-chain-health-level]')];
    return {
      levels: bars.map((bar) => Number(bar.dataset.chainHealthLevel)),
      states: bars.map((bar) => bar.className),
      colors: [...new Set(bars.map((bar) => getComputedStyle(bar).color))],
      heights: [...new Set(bars.map((bar) => parseFloat(getComputedStyle(bar, '::before').height)))].sort((a, b) => b - a),
      summary: document.getElementById('chain-health-readout').textContent,
      label: document.getElementById('chain-health').getAttribute('aria-label'),
      announcement: document.getElementById('chain-health-announcer').textContent,
      busy: document.getElementById('chain-health').getAttribute('aria-busy'),
      newest: bars.filter((bar) => bar.classList.contains('is-head')).map((bar) => Number(bar.dataset.chainHealthLevel)),
      animations: bars.flatMap((bar) => bar.getAnimations()).length,
      ghosts: viewport.querySelectorAll('.chain-health-exiting').length,
      stale: document.getElementById('chain-health').dataset.feedState === 'stale'
    };
  });
  const initial = await read();
  assert.equal(initial.levels.length, 25);
  assert.equal(initial.levels[0], head - 24);
  assert.equal(initial.levels.at(-1), head);
  assert.equal(initial.colors.length, 4, 'Perfect, Strong, below quorum and unavailable have distinct theme colors');
  assert.equal(initial.heights.length, 4, 'The mixed receipts retain distinct severity and unavailable heights');
  assert.deepEqual(initial.newest, [head], 'Only the newest block has a marker');
  assert.equal(initial.summary, '5/25 RISK');
  assert.match(initial.label, /last 25 blocks: 5 perfect .*10 strong .*5 below quorum, 5 unavailable/);
  assert.equal(initial.animations, 0, 'First paint has no conveyor motion');

  await page.evaluate(() => {
    const viewport = document.getElementById('chain-health-window');
    window.__chainRetained = viewport.children[12];
    window.__chainRetainedX = window.__chainRetained.getBoundingClientRect().x;
    window.__chainOldest = viewport.firstElementChild;
    window.__chainMotion = false;
    window.__chainExitMotion = false;
    new MutationObserver(() => {
      window.__chainMotion ||= window.__chainRetained.getAnimations().some((a) => a.id === 'chain-health-shift');
      window.__chainExitMotion ||= Boolean(viewport.querySelector('.chain-health-exiting'));
    }).observe(viewport, { childList: true, subtree: true });
    document.getElementById('chain-health').focus({ preventScroll: true });
    const selection = getSelection();
    const range = document.createRange();
    range.selectNodeContents(document.querySelector('.chain-health-label'));
    selection.removeAllRanges();
    selection.addRange(range);
    window.scrollTo({ top: 120, behavior: 'instant' });
    window.__chainScroll = scrollY;
    window.__chainUrl = location.href;
  });
  head += 1;
  await page.evaluate(() => window.__refreshChainHealth());
  await page.waitForFunction(() => !document.querySelector('.chain-health-exiting'));
  const motion = await page.evaluate(() => ({
    same: window.__chainRetained === document.querySelector(`[data-chain-health-level="${window.__chainRetained.dataset.chainHealthLevel}"]`),
    left: window.__chainRetained.getBoundingClientRect().x < window.__chainRetainedX,
    removed: !window.__chainOldest.isConnected,
    motion: window.__chainMotion, exit: window.__chainExitMotion,
    focus: document.activeElement.id, selection: getSelection().toString(),
    scroll: scrollY === window.__chainScroll, url: location.href === window.__chainUrl
  }));
  assert(motion.same && motion.left && motion.removed && motion.motion && motion.exit, JSON.stringify(motion));
  assert(motion.focus === 'chain-health' && motion.selection === 'CHAIN HEALTH' && motion.scroll && motion.url, JSON.stringify(motion));
  assert.equal((await read()).levels.at(-1), head);
  await page.evaluate(async () => {
    await window.__refreshChainHealth();
    window.scrollBy({ top: 40, behavior: 'instant' });
    window.__readerScroll = scrollY;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  assert.equal(await page.evaluate(() => scrollY === window.__readerScroll), true, 'A later reader scroll survives reconciliation');
  assert.equal((await read()).animations, 0, 'Same-head supplements do not replay motion');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  head += 1;
  await page.evaluate(() => window.__refreshChainHealth());
  assert.equal((await read()).animations, 0, 'Reduced motion stays still');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
  });
  head += 3;
  await page.evaluate(() => window.__refreshChainHealth());
  assert.equal((await read()).levels.at(-1), head - 3, 'Hidden in-flight completion leaves the strip alone');
  await page.evaluate(() => {
    delete document.visibilityState;
    document.dispatchEvent(new Event('visibilitychange'));
    return window.__refreshChainHealth();
  });
  assert.equal((await read()).levels.at(-1), head);
  assert.equal((await read()).animations, 0, 'Visibility catch-up stays motionless');

  unavailable = true;
  const beforeFailure = await read();
  await page.evaluate(() => window.__refreshChainHealth());
  const afterFailure = await read();
  assert.deepEqual(afterFailure.levels, beforeFailure.levels);
  assert(afterFailure.stale, 'Source failure marks last-good history stale');
  assert.equal(afterFailure.summary, 'STALE');
  assert.equal(afterFailure.announcement, '', 'Stale receipts do not announce current risk');
  unavailable = false;
  await page.evaluate(() => window.__refreshChainHealth());

  // Exact threshold and quorum boundaries, including partial and missing data.
  const geometrySnapshot = () => page.evaluate(() => {
    const rect = (id) => {
      const { x, y, width, height } = document.getElementById(id).getBoundingClientRect();
      return { x, y, width, height };
    };
    return { health: rect('chain-health'), activity: rect('header-activity-button') };
  });
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForFunction(count => document.querySelectorAll('[data-chain-health-level]').length === count, width <= 719 ? 10 : 25);
    await page.evaluate(async () => {
      getSelection().removeAllRanges();
      document.activeElement?.blur();
      await document.fonts.ready;
      document.getElementById('live-head').scrollIntoView({ block: 'start', behavior: 'instant' });
    });
    const stableGeometry = await geometrySnapshot();
    const count = width <= 719 ? 10 : 25;
    for (const [mode, text, description] of [
      ['perfect', `${count}/${count} FULL`, `${count} perfect (full attestation power)`],
      ['strong', `${count}/${count} HIGH`, `${count} strong (6,500 to below 7,000 on a 7,000-power scale)`],
      ['risk', `${count}/${count} RISK`, `${count} below quorum`],
      ['watch', `${count}/${count} WATCH`, `${count} watch (6,000 to below 6,500 on a 7,000-power scale)`],
      ['low', `${count}/${count} LOW`, `${count} low (5,500 to below 6,000 on a 7,000-power scale)`],
      ['dire', `${count}/${count} DIRE`, `${count} DIRE (below 5,500 on a 7,000-power scale, quorum still met)`],
      ['quorum', `${count}/${count} DIRE`, `${count} DIRE (below 5,500 on a 7,000-power scale, quorum still met)`],
      ['risk', `${count}/${count} RISK`, `${count} below quorum`],
      ['unknown', `${count}/${count} ?`, `${count} unavailable`],
      ['partial', `${count - 9}/${count} ?`, `9 strong (6,500 to below 7,000 on a 7,000-power scale), ${count - 9} unavailable`]
    ]) {
      scenario = mode;
      await page.evaluate(() => window.__refreshChainHealth());
      const current = await read();
      assert.equal(current.summary, text);
      assert(current.label.includes(`last ${count} blocks: ${description}.`), current.label);
      assert.equal(current.busy, 'false', 'Missing data is not perpetual loading');
      assert.equal(Boolean(current.announcement), mode === 'risk', 'Announce risk entry and clear every exit');
      assert.deepEqual(await geometrySnapshot(), stableGeometry, `${width}/${mode}: summary must not move either control`);
      assert.equal(current.animations, 0, 'Same-head receipt corrections stay still');
      assert(await page.evaluate(() => document.getElementById('chain-health-readout').getBoundingClientRect().right
        <= document.getElementById('chain-health-window').getBoundingClientRect().left), `${width}/${mode}: the complete status stays clear of the strip`);
    }
    unavailable = true;
    await page.evaluate(() => window.__refreshChainHealth());
    assert.equal((await read()).summary, 'STALE');
    assert.deepEqual(await geometrySnapshot(), stableGeometry, 'Source failure must not change geometry');
    unavailable = false;
  }
  scenario = 'bands';
  await page.evaluate(() => window.__refreshChainHealth());

  for (const theme of ['ember', 'clean']) {
    await page.evaluate(async (name) => {
      const { setTheme } = await import('/js/ui/theme.js');
      setTheme(name);
    }, theme);
    await page.waitForFunction((name) => Boolean(document.getElementById(`theme-css-${name}`)?.sheet), theme);
    await page.evaluate(() => Promise.all(document.getAnimations()
      .filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity)
      .map(animation => animation.finished.catch(() => {}))));
    for (const width of [1440, 1101, 1024, 762, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.waitForFunction(count => document.querySelectorAll('[data-chain-health-level]').length === count, width <= 719 ? 10 : 25);
      await page.evaluate(async () => {
        await document.fonts.ready;
        getSelection().removeAllRanges();
        document.activeElement?.blur();
        document.getElementById('live-head').scrollIntoView({ block: 'start', behavior: 'instant' });
        return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });
      const geometry = await page.evaluate(() => {
        const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
        const health = rect('#chain-health');
        const activity = rect('#header-activity-button');
        const settings = rect('#live-head-filter-toggle');
        const strip = rect('#chain-health-window');
        const label = rect('.chain-health-label');
        const readout = rect('#chain-health-readout');
        const mobile = innerWidth <= 719;
        const stacked = innerWidth > 719 && innerWidth <= 900;
        return {
          fits: activity.left >= 0 && health.right <= innerWidth && document.documentElement.scrollWidth <= innerWidth + 1,
          beside: (stacked ? activity.bottom <= health.top : activity.right <= health.left + 1) && (mobile ? settings.bottom <= health.top : strip.right <= settings.left + 1),
          aligned: (mobile ? [activity] : stacked ? [settings] : [activity, settings]).every((control) => Math.abs(control.top - health.top) <= 0.5 && Math.abs(control.bottom - health.bottom) <= 0.5),
          labelLeft: (mobile ? label.bottom <= readout.top : label.right <= readout.left && Math.abs(label.y - readout.y) <= 0.5) && readout.right <= strip.left, stripWidth: strip.width,
          activityOverflow: document.getElementById('header-activity-line').scrollWidth - document.getElementById('header-activity-line').clientWidth,
          visibleMetrics: ['tx', 'moved', 'nft'].every(slot => {
            const value = document.querySelector(`#header-activity-line [data-usage-slot="${slot}"]`);
            const box = value.getBoundingClientRect();
            return box.width > 0 && box.height > 0 && box.left >= activity.left && box.right <= activity.right;
          }),
          count: document.querySelectorAll('[data-chain-health-level]').length
        };
      });
      assert(geometry.fits && geometry.beside && geometry.aligned && geometry.labelLeft && geometry.stripWidth >= (width <= 719 ? 40 : 70) && geometry.count === (width <= 719 ? 10 : 25) && geometry.activityOverflow <= 1, `${theme}/${width}: ${JSON.stringify(geometry)}`);
      assert(geometry.visibleMetrics, `${theme}/${width}: TX, Moved and NFT remain visible`);
      assert.equal((await geometrySnapshot()).health.height, width <= 719 ? 48 : 30, 'Phone controls provide a full 44px touch target');
      assert.equal(await page.locator('#chain-health-window').evaluate((el) => el.getBoundingClientRect().height), 22, 'The strip keeps the same vertical scale across devices');
      const parity = await page.evaluate(() => [...document.querySelectorAll('#live-head-stack [data-live-head-level]')].map(row => {
        const strip = document.querySelector(`[data-chain-health-level="${row.dataset.liveHeadLevel}"]`);
        const power = row.querySelector('.health-power');
        const rail = row.querySelector('.live-head-power-track');
        return {
          power: Number(row.dataset.attestedPower),
          tone: power.dataset.attestationTone,
          sameTone: power.dataset.attestationTone === rail.dataset.attestationTone && power.dataset.attestationTone === strip.dataset.attestationTone,
          sameColor: getComputedStyle(power).color === getComputedStyle(rail).color && getComputedStyle(power).color === getComputedStyle(strip).color,
          stripHeight: parseFloat(getComputedStyle(strip, '::before').height),
          stripCapacity: strip.getBoundingClientRect().height,
          color: getComputedStyle(strip).color
        };
      }));
      assert.equal(parity.length, 10, 'The comparison spans five severities, below quorum and unavailable');
      assert(parity.every(row => row.sameTone && row.sameColor), `${theme}/${width}: pills, rails and strips agree ${JSON.stringify(parity)}`);
      const expectedBands = [[7000, 'perfect', 1], [6500, 'strong', 0.8], [6000, 'watch', 0.6], [5500, 'low', 0.4], [4700, 'dire', 0.2]];
      const severityRows = expectedBands.map(([power, tone, fill]) => {
        const row = parity.find(row => row.power === power);
        assert(row && row.tone === tone && row.stripHeight === Math.round(row.stripCapacity * fill),
          `${theme}/${width}: ${power} must have ${tone} color and ${fill * 100}% height rounded to whole pixels: ${JSON.stringify(row)}`);
        return row;
      });
      assert.equal(new Set(severityRows.map(row => row.color)).size, 5, 'Each of the five severities has its own color');
      assert.equal(new Set(severityRows.map(row => row.stripHeight)).size, 5, 'Each of the five severities has its own height');
      if (width === 1440) {
        // Sample viewport pixels, including the risk wash and ancestor layers.
        // Locator crops round fractional origins outward; that offset can move
        // a sample outside a genuinely painted 2px quorum tick.
        const samples = await page.evaluate(() => {
          const windowRect = document.getElementById('chain-health-window').getBoundingClientRect();
          return ['perfect', 'strong', 'watch', 'low', 'dire', 'risk', 'unknown'].map((state) => {
            const bar = document.querySelector(`.chain-health-bar.${state}:not(.is-head)`);
            const rect = bar.getBoundingClientRect();
            const fill = parseFloat(getComputedStyle(bar, '::before').height);
            return { state, x: rect.x + (rect.width - 1) / 2,
              inkY: rect.bottom - fill / 2,
              backgroundY: state === 'risk' ? rect.top + 2 : windowRect.bottom - 1 };
          });
        });
        const stripImage = await page.screenshot();
        if (artifactsDir) {
          await mkdir(artifactsDir, { recursive: true });
          await writeFile(path.join(artifactsDir, `chain-health-pixels-${theme}.png`), stripImage);
          await page.locator('#chain-health').screenshot({ path: path.join(artifactsDir, `chain-health-strip-${theme}.png`) });
        }
        const { data, info } = await sharp(stripImage).removeAlpha().raw().toBuffer({ resolveWithObject: true });
        const luminance = (x, y) => {
          const offset = (Math.floor(y) * info.width + Math.floor(x)) * info.channels;
          const rgb = [...data.subarray(offset, offset + 3)].map((v) => {
            const c = v / 255;
            return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
          });
          return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
        };
        for (const sample of samples) {
          const ink = luminance(sample.x, sample.inkY);
          const background = luminance(sample.x, sample.backgroundY);
          const contrast = (Math.max(ink, background) + 0.05) / (Math.min(ink, background) + 0.05);
          assert(contrast >= 3, `${theme}/${sample.state}: painted contrast ${contrast.toFixed(2)}:1 ${JSON.stringify(sample)} ${JSON.stringify(info)}`);
        }
      }
      if (artifactsDir && [1440, 390, 320].includes(width)) {
        await mkdir(artifactsDir, { recursive: true });
        await page.locator('#live-head').screenshot({ path: path.join(artifactsDir, `chain-health-${theme}-${width}.png`) });
      }
    }
  }
  await page.emulateMedia({ forcedColors: 'active' });
  assert(await page.evaluate(() => {
    const risk = document.querySelector('.chain-health-bar.risk');
    return getComputedStyle(risk, '::after').borderTopStyle === 'dotted'
      && getComputedStyle(risk, '::before').backgroundColor !== 'rgba(0, 0, 0, 0)';
  }), 'Forced colors preserve visible bars and the risk outline');
  await page.emulateMedia({ forcedColors: 'none' });
  scenario = 'mixed';
  await page.evaluate(() => window.__refreshChainHealth());
  await page.setViewportSize({ width: 1440, height: 1000 });
  const inspectedLevel = Math.floor((head - 12) / 5) * 5 + 1;
  const inspectedBar = page.locator(`[data-chain-health-level="${inspectedLevel}"]`);
  await page.waitForFunction((level) => document.querySelector(`[data-chain-health-level="${level}"]`)?.dataset.chainHealthReceipt.includes(`Receipt Baker ${level}`), inspectedLevel);
  assert(await inspectedBar.evaluate((bar) => bar.classList.contains('strong')), 'A nearly full Strong block can still have a missed attester');
  await inspectedBar.scrollIntoViewIfNeeded();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await inspectedBar.hover();
  const inspector = page.locator('#live-head-inspector');
  await inspector.waitFor({ state: 'visible' });
  assert((await inspector.textContent()).includes(`Receipt Baker ${inspectedLevel}`), 'The older Strong line shows its own missed baker');
  assert(!(await inspector.textContent()).includes(`Receipt Baker ${head}`), 'Do not substitute the head block missed bakers');
  assert((await inspector.locator('a').all()).length > 1, 'The missed-baker identities retain receipt links');
  const mini = await inspector.boundingBox();
  assert(mini.width <= 220 && mini.height <= 110, `Three-baker tooltip stays small: ${JSON.stringify(mini)}`);
  assert.equal(await inspector.locator('.chain-health-mini-baker').count(), 3, 'All three missed bakers fit the small tooltip');
  assert.equal(await inspector.locator('button').count(), 0, 'The mini tooltip has no oversized action controls');
  assert.equal(await inspectedBar.getAttribute('title'), null, 'No duplicate native tooltip on the block line');
  assert.equal(await page.locator('#chain-health').getAttribute('title'), null, 'No inherited native tooltip from the chip');
  if (artifactsDir) await page.screenshot({ path: path.join(artifactsDir, 'chain-health-mini-desktop.png') });
  head += 1;
  await page.evaluate(() => window.__refreshChainHealth());
  assert.equal((await read()).levels.at(-1), head - 1, 'The conveyor pauses while a line is being read');
  await page.locator('#chain-health').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await inspector.getAttribute('data-live-head-level'), String(inspectedLevel + 1));
  assert((await inspector.textContent()).includes(`Receipt Baker ${inspectedLevel + 1}`));
  await page.keyboard.press('Escape');
  assert.equal((await read()).levels.at(-1), head, 'Closing applies the newest queued head');
  assert.equal((await read()).animations, 0, 'Inspector catch-up stays quiet');
  await page.locator('#chain-health').focus();
  await page.keyboard.press('ArrowLeft');
  assert.equal(await inspector.getAttribute('data-live-head-level'), String(head));
  await page.keyboard.press('ArrowLeft');
  assert.equal(await inspector.getAttribute('data-live-head-level'), String(head - 1));
  await page.keyboard.press('Escape');
  scenario = 'bands';
  await page.evaluate(() => window.__refreshChainHealth());
  await page.locator('.chain-health-label').click();
  await page.locator('#network-health-modal.active .health-content').waitFor({ state: 'visible' });
  await page.locator('#network-health-modal .health-block-row').first().waitFor({ state: 'visible' });
  const chamberParity = await page.evaluate(() => {
    // Clean has a dark Chamber interior: compare semantics across surfaces,
    // and require readable ink there instead of copying light-dashboard shades.
    const surface = document.querySelector('#network-health-modal .health-content');
    const probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;visibility:hidden;color:var(--bg-primary)';
    surface.appendChild(probe);
    const luminance = color => {
      const channels = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => {
        const c = v / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    const background = luminance(getComputedStyle(probe).color);
    probe.remove();
    return [...surface.querySelectorAll('.health-block-row')].map(row => {
      const pill = row.querySelector('.health-power');
      const strip = document.querySelector(`[data-chain-health-level="${row.dataset.healthLevel}"]`);
      const ink = luminance(getComputedStyle(pill).color);
      return { level: row.dataset.healthLevel, tone: pill.dataset.attestationTone, stripTone: strip?.dataset.attestationTone,
        text: pill.textContent.trim(),
        contrast: (Math.max(ink, background) + 0.05) / (Math.min(ink, background) + 0.05) };
    });
  });
  assert(chamberParity.length > 0 && chamberParity.every(row => row.tone === row.stripTone && row.contrast >= 4.5),
    `Passing Blocks shares receipt bands with readable surface-aware colors: ${JSON.stringify(chamberParity)}`);
  assert.equal(new Set(chamberParity.map(row => row.tone)).size, 7, 'Passing Blocks covers five severities, below quorum and unknown');
  assert(chamberParity.filter(row => row.tone === 'unknown').every(row => row.text === '--'), 'Unavailable power never becomes a zero-power receipt');
  if (artifactsDir) await page.locator('.health-recent-blocks').screenshot({ path: path.join(artifactsDir, 'chain-health-passing-blocks-clean.png') });
  assert(requests > 1, 'The strip uses the shared live block fetch');
  await context.close();

  const touchContext = await browser.newContext({ viewport: { width: 390, height: 900 }, hasTouch: true, serviceWorkers: 'block' });
  await installFeatureMocks(touchContext, { blockHeadAutoAdvance: false });
  await touchContext.addInitScript(() => {
    localStorage.setItem('tezos-systems-theme', 'ember');
    localStorage.setItem('tezos-toured', '1');
    localStorage.setItem('tezos-welcomed', '1');
    localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
  });
  const touchPage = await touchContext.newPage();
  await touchPage.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await touchPage.waitForFunction(() => document.querySelectorAll('[data-chain-health-level]').length === 10);
  for (const width of [390, 320]) {
    await touchPage.setViewportSize({ width, height: 900 });
    await touchPage.locator('#live-head').scrollIntoViewIfNeeded();
    const hitAreas = await touchPage.evaluate(() => {
      const ids = ['chain-health', 'header-activity-button', 'live-head-filter-toggle'];
      return ids.map((id) => {
        const button = document.getElementById(id);
        const rect = button.getBoundingClientRect();
        const hit = getComputedStyle(button, '::before');
        const x = rect.x + rect.width / 2;
        const y = rect.y + rect.height / 2;
        const points = [[x, y - 21], [x, y + 21]];
        if (id === 'live-head-filter-toggle') points.push([x - 21, y], [x + 21, y]);
        return { id, height: rect.height, hitHeight: parseFloat(hit.height),
          hits: points.map(([px, py]) => ({ x: px, y: py, element: document.elementFromPoint(px, py)?.outerHTML?.slice(0, 160) })),
          accepts: points.every(([px, py]) => document.elementFromPoint(px, py)?.closest('button') === button),
          inViewport: rect.right <= innerWidth && rect.left >= 0 };
      });
    });
    assert(hitAreas.every((area) => area.height === (area.id === 'live-head-filter-toggle' ? 30 : 48) && area.hitHeight === 44 && area.accepts && area.inViewport), `${width}: touch hit areas ${JSON.stringify(hitAreas)}`);
    if (artifactsDir) await touchPage.locator('#live-head').screenshot({ path: path.join(artifactsDir, `chain-health-touch-${width}.png`) });
  }
  const touchTarget = await touchPage.locator('#chain-health').boundingBox();
  await touchPage.touchscreen.tap(touchTarget.x + 12, touchTarget.y + 8);
  await touchPage.locator('#network-health-modal.active .health-content').waitFor({ state: 'visible' });
  await touchPage.keyboard.press('Escape');
  const touchBar = touchPage.locator('[data-chain-health-level]').nth(6);
  const touchLevel = Number(await touchBar.getAttribute('data-chain-health-level'));
  await touchBar.scrollIntoViewIfNeeded();
  await touchPage.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await touchBar.tap();
  await touchPage.locator('#live-head-inspector').waitFor({ state: 'visible' });
  assert.equal(await touchPage.locator('#live-head-inspector').getAttribute('data-live-head-level'), String(touchLevel));
  await touchPage.locator('[data-chain-health-level]').nth(5).tap();
  assert.equal(await touchPage.locator('#live-head-inspector').getAttribute('data-live-head-level'), String(touchLevel - 1));
  if (artifactsDir) await touchPage.screenshot({ path: path.join(artifactsDir, 'chain-health-touch-inspector.png') });
  await touchContext.close();
}
