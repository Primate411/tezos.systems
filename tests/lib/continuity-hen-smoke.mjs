import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

async function prepare(browser, width, installFeatureMocks) {
  const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
  await installFeatureMocks(context);
  await context.addInitScript(() => {
    localStorage.setItem('tezos-toured', '1');
    localStorage.setItem('tezos-welcomed', '1');
    localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    const interval = window.setInterval;
    window.__continuityTicks = {};
    window.setInterval = function(callback, delay, ...args) {
      const source = String(callback);
      if (source.includes('tickUptime()')) window.__continuityTicks.home = callback;
      if (source.includes('refreshHealthAgeLabels(document)')) window.__continuityTicks.health = callback;
      return interval(callback, delay, ...args);
    };
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  return { context, page, errors };
}

export async function smokeChainContinuity(browser, baseUrl, { installFeatureMocks, artifactsDir = '' }) {
  const receipts = [];
  if (artifactsDir) await mkdir(artifactsDir, { recursive: true });
  for (const width of [1440, 390]) {
    const { context, page, errors } = await prepare(browser, width, installFeatureMocks);
    try {
      await page.goto(`${baseUrl}/?theme=clean`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__continuityTicks.home && /^\d/.test(document.getElementById('hero-chain-uptime-bakers')?.textContent || ''));
      const idle = await page.evaluate(async () => {
        const { readDashboardContinuity } = await import('/js/core/chain-continuity.js');
        const snapshot = readDashboardContinuity();
        if (!snapshot?.bakers || !Object.isFrozen(snapshot)) throw new Error('Dashboard observations must be retained independently of DOM');
        let insertedElements = 0;
        const observer = new MutationObserver(records => {
          insertedElements += records.reduce((count, record) => count + [...record.addedNodes].filter(node => node.nodeType === 1).length, 0);
        });
        observer.observe(document.body, { childList: true, subtree: true });
        const now = Date.now;
        const start = now();
        try {
          for (let second = 1; second <= 12; second++) {
            Date.now = () => start + second * 1000;
            window.__continuityTicks.home();
            await Promise.resolve();
          }
        } finally { Date.now = now; observer.disconnect(); }
        return { insertedElements, retiredNodes: document.querySelectorAll('#uptime-clock, #uptime-counter, #uptime-bakers, #uptime-finality, #uptime-staked, #uptime-issuance').length };
      });
      assert.deepEqual(idle, { insertedElements: 0, retiredNodes: 0 }, 'Home clock ticks must not recreate hidden digit trees');
      await page.evaluate(() => { location.hash = 'health'; });
      await page.locator('#network-health-modal.active #chain-uptime-counter').waitFor();
      await page.waitForFunction(() => window.__continuityTicks.health && /^\d+s$/.test(document.getElementById('hero-chain-uptime-finality')?.textContent || ''), null, { timeout: 25000 });
      const reading = await page.evaluate(async () => {
        const modal = document.getElementById('network-health-modal');
        const clock = document.getElementById('chain-uptime-counter');
        const digit = clock.firstChild;
        const button = modal.querySelector('button');
        const body = modal.querySelector('.health-body');
        const copy = modal.querySelector('.health-continuity-copy');
        button.focus();
        body.scrollTop = Math.min(200, body.scrollHeight - body.clientHeight);
        const selection = getSelection(), range = document.createRange();
        range.selectNodeContents(copy); selection.removeAllRanges(); selection.addRange(range);
        const before = { page: scrollY, body: body.scrollTop, text: selection.toString() };
        const now = Date.now; Date.now = () => now() + 2000;
        try {
          window._updateUptimeClock({ activeBakers: 205, stakedRatio: 31.2, currentIssuanceRate: 2.5 });
          window.__continuityTicks.health();
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const { readDashboardContinuity } = await import('/js/core/chain-continuity.js');
          const state = readDashboardContinuity();
          return { sameClock: clock === document.getElementById('chain-uptime-counter'), sameDigit: digit === clock.firstChild,
            focus: document.activeElement === button, selection: selection.toString() === before.text,
            scroll: scrollY === before.page && body.scrollTop === before.body,
            bakers: document.getElementById('chain-uptime-bakers').textContent,
            staked: document.getElementById('chain-uptime-staked').textContent,
            issuance: document.getElementById('chain-uptime-issuance').textContent,
            finality: document.getElementById('chain-uptime-finality').textContent === state.finality,
            settled: getComputedStyle(clock.closest('.health-continuity-panel')).opacity === '1' };
        } finally { Date.now = now; }
      });
      assert.deepEqual(reading, { sameClock: true, sameDigit: true, focus: true, selection: true, scroll: true, bakers: '205', staked: '31.2%', issuance: '2.50%', finality: true, settled: true });
      const hidden = await page.evaluate(() => {
        const clock = document.getElementById('chain-uptime-counter');
        const before = clock.innerHTML;
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        const now = Date.now; Date.now = () => now() + 5000;
        try {
          window._updateUptimeClock({ activeBakers: 206 });
          window.__continuityTicks.health(); window.__continuityTicks.home();
          const paused = clock.innerHTML === before && document.getElementById('chain-uptime-bakers').textContent === '205';
          delete document.visibilityState; delete document.hidden;
          document.dispatchEvent(new Event('visibilitychange'));
          return { paused, caughtUp: clock.innerHTML !== before && document.getElementById('chain-uptime-bakers').textContent === '206' };
        } finally { Date.now = now; delete document.visibilityState; delete document.hidden; }
      });
      assert.deepEqual(hidden, { paused: true, caughtUp: true });
      if (artifactsDir) await page.screenshot({ path: path.join(artifactsDir, `continuity-${width}.png`) });
      await page.keyboard.press('Escape');
      await page.locator('#network-health-modal.active').waitFor({ state: 'hidden' });
      assert(await page.evaluate(() => {
        const clock = document.getElementById('chain-uptime-counter');
        const before = clock.innerHTML;
        const now = Date.now; Date.now = () => now() + 9000;
        try { window.__continuityTicks.health(); return clock.innerHTML === before; }
        finally { Date.now = now; }
      }), 'A closed Chamber must not repaint its retained clock');

      await page.goto(`${baseUrl}/health/`, { waitUntil: 'domcontentloaded' });
      await page.locator('#network-health-modal.active #chain-uptime-counter').waitFor();
      assert.equal(await page.evaluate(async () => (await import('/js/core/chain-continuity.js')).readDashboardContinuity()), null, 'Standalone Health owns its sources before home initializes');
      for (const metric of ['bakers', 'staked', 'issuance']) assert.notEqual((await page.locator(`#chain-uptime-${metric}`).textContent()).trim(), '—');
      const origin = await page.evaluate(() => performance.timeOrigin);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => typeof window._updateUptimeClock === 'function' && Boolean(document.getElementById('top-continuity-panel')));
      assert.equal(await page.evaluate(() => performance.timeOrigin), origin, 'Home handoff keeps the document');
      assert(await page.evaluate(async () => Boolean((await import('/js/core/chain-continuity.js')).readDashboardContinuity())), 'Home takes ownership explicitly after handoff');
      assert.deepEqual(errors, []);
      receipts.push({ width, idle, reading, hidden, standaloneHandoff: true });
    } finally { await context.close(); }
  }
  if (artifactsDir) await writeFile(path.join(artifactsDir, 'chain-continuity.json'), JSON.stringify(receipts, null, 2));
  console.log('ok - continuity state: no hidden clocks, live finality, quiet visible clocks, visibility catch-up and standalone handoff');
}

export async function smokeHenStylesLazy(browser, baseUrl, { installFeatureMocks, artifactsDir = '' }) {
  if (artifactsDir) await mkdir(artifactsDir, { recursive: true });
  for (const width of [1440, 390]) {
    const { context, page, errors } = await prepare(browser, width, installFeatureMocks);
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    let requests = 0;
    await page.route('**/css/hen-feed.min.css*', async route => { requests++; await gate; await route.continue(); });
    try {
      await page.goto(`${baseUrl}/?theme=${width === 390 ? 'clean' : 'hen'}`, { waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.openHenMode === 'function' && document.getElementById('hen-shared-css')?.sheet);
      assert.equal(requests, 0, 'Feed CSS must not load for dashboard theme/controls');
      assert.equal(await page.locator('#hen-overlay').evaluate(el => getComputedStyle(el).display), 'none');
      assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--hen-bg').trim()), '#111');
      const request = page.waitForRequest('**/css/hen-feed.min.css*');
      await page.evaluate(() => { window.__henOpenResults = Promise.all([window.openHenMode(), window.openHenMode()]); });
      await request;
      await page.waitForFunction(() => Boolean(window.HenMode));
      assert.equal(await page.evaluate(() => window.HenMode.isActive()), false, 'Runtime must await delayed styles');
      assert.equal(requests, 1, 'Concurrent opens share one stylesheet request');
      await page.keyboard.press('Escape');
      release();
      assert.deepEqual(await page.evaluate(() => window.__henOpenResults), [false, false], 'Escape cancels every pending style-dependent activation');
      assert.equal(await page.evaluate(() => window.HenMode.isActive()), false);
      assert.equal(await page.evaluate(() => window.openHenMode()), true);
      assert.equal(requests, 1, 'Reopening reuses ready CSS');
      const style = await page.evaluate(() => ({
        display: getComputedStyle(document.getElementById('hen-overlay')).display,
        ordered: document.getElementById('hen-shared-css').nextElementSibling?.id === 'hen-feed-css',
        grid: getComputedStyle(document.getElementById('hen-grid')).display,
        overflow: document.documentElement.scrollWidth > innerWidth + 1
      }));
      assert.deepEqual(style, { display: 'grid', ordered: true, grid: 'grid', overflow: false });
      if (artifactsDir) await page.screenshot({ path: path.join(artifactsDir, `hen-styles-${width}.png`) });
      assert.deepEqual(errors, []);
    } finally { release(); await context.close(); }
  }
  // Both direct-entry forms fail open and can recover CSS without reloading.
  for (const [entry, width] of [['/hen/', 1440], ['/?hen=1', 390]]) {
    const { context, page, errors } = await prepare(browser, width, installFeatureMocks);
    let attempts = 0;
    await page.route('**/css/hen-feed.min.css*', route => ++attempts === 1
      ? route.fulfill({ status: 503, contentType: 'text/css', body: '' }) : route.continue());
    try {
      await page.goto(`${baseUrl}${entry}`, { waitUntil: 'load' });
      await page.waitForFunction(() => window.HenMode && !document.getElementById('hen-initial-blackout') && !document.getElementById('hen-feed-css'));
      assert.equal(await page.evaluate(() => window.HenMode.isActive()), false);
      assert.equal(await page.locator('#hen-overlay').evaluate(el => getComputedStyle(el).display), 'none');
      assert.equal(await page.evaluate(() => window.openHenMode()), true);
      assert.equal(attempts, 2);
      assert(await page.locator('#hen-feed-css').getAttribute('href').then(href => href.includes('retry=1')));
      assert.equal(await page.locator('#hen-overlay').evaluate(el => getComputedStyle(el).display), 'grid');
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
  console.log('ok - HEN CSS: absent before intent, hidden pending surface, concurrent/cancelled opens, retries and both direct routes');
}
