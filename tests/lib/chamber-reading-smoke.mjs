import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';

export async function smokeChamberReading(browser, baseUrl, { installFeatureMocks, artifactsDir }) {
  for (const width of [1440, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: width === 1440 ? 'no-preference' : 'reduce', serviceWorkers: 'block' });
    try {
      await installFeatureMocks(context);
      await context.addInitScript(width => {
        localStorage.setItem('tezos-systems-theme', width === 1440 ? 'matrix' : 'clean');
        localStorage.setItem('tezos-toured', '1');
        localStorage.setItem('tezos-welcomed', '1');
        window.__CAPITAL_CHAMBER_REFRESH_MS__ = 654321;
        const interval = window.setInterval.bind(window), clear = window.clearInterval.bind(window);
        window.__readingTimers = new Map();
        window.setInterval = (callback, delay, ...args) => {
          const handle = interval(callback, delay, ...args);
          if (delay === 30000 && String(callback).includes('readingRooms')) window.__readingTimers.set(handle, callback);
          return handle;
        };
        window.clearInterval = handle => { window.__readingTimers.delete(handle); return clear(handle); };
      }, width);
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${baseUrl}/capital/`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.documentElement.dataset.chamberReady === 'capital');
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() => !document.querySelector('.capital-content')?.getAnimations().some(animation => animation.playState === 'running'));
      await page.locator('[data-chamber-verdict="capital"]').waitFor();
      const layout = await page.locator('[data-chamber-verdict="capital"]').evaluate(node => {
        const r = node.getBoundingClientRect(), css = getComputedStyle(node);
        return { left: r.left, right: r.right, opacity: css.opacity, text: node.innerText };
      });
      assert(layout.left >= 0 && layout.right <= width + 1, `${width}: contained summary`);
      assert.equal(layout.opacity, '1');
      assert.match(layout.text, /L1 DeFi TVL/);
      assert.match(layout.text, /L2 DeFi TVL/);
      const freshnessText = await page.locator('#capital-freshness').innerText();
      assert.match(freshnessText, /Generated\s+\S/i, `Freshness label keeps a visible word boundary: ${freshnessText}`);
      assert.equal(await page.evaluate(() => window.__readingTimers.size), 1, 'One room age timer');
      if (artifactsDir) {
        await mkdir(artifactsDir, { recursive: true });
        await page.screenshot({ path: path.join(artifactsDir, `reading-capital-${width}.png`) });
      }
      const result = await page.evaluate(async () => {
        const api = await import('/js/ui/chamber-reading.js');
        const body = document.getElementById('capital-chamber-body');
        const room = document.querySelector('.capital-content');
        const verdict = body.querySelector('[data-chamber-verdict]');
        const text = verdict.querySelector('p').firstChild;
        const selected = body.querySelector('[role="tab"][aria-selected="true"]');
        selected.focus({ preventScroll: true });
        const range = document.createRange(); range.setStart(text, 0); range.setEnd(text, 10);
        getSelection().removeAllRanges(); getSelection().addRange(range);
        const scroll = [body, room].find(node => node.scrollHeight > node.clientHeight + 80 && /auto|scroll/.test(getComputedStyle(node).overflowY)) || body;
        scroll.scrollTop = 160;
        const before = { scroll: scroll.scrollTop, page: scrollY, selection: getSelection().toString(), tab: selected.id };
        const copyBefore = verdict.querySelector('.chamber-reading-copy').getBoundingClientRect();
        api.setChamberReadingState(body, 'snapshot');
        const copyAfter = verdict.querySelector('.chamber-reading-copy').getBoundingClientRect();
        const stableStatusGeometry = copyBefore.x === copyAfter.x && copyBefore.width === copyAfter.width && copyBefore.height === copyAfter.height;
        const stamp = body.querySelector('#capital-freshness time');
        stamp.dateTime = new Date(Date.now() - 1000).toISOString();
        api.updateChamberStamps(room);
        const firstMinuteWidth = stamp.getBoundingClientRect().width;
        stamp.dateTime = new Date(Date.now() - 120000).toISOString();
        api.updateChamberStamps(room);
        const firstAge = stamp.textContent;
        const stableAgeWidth = firstMinuteWidth === stamp.getBoundingClientRect().width;
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
        api.updateChamberStamps(room, Date.now() + 120000);
        const hiddenAge = stamp.textContent;
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
        api.updateChamberStamps(room, Date.now() + 120000);
        const caughtUpAge = stamp.textContent;
        const copy = body.cloneNode(true);
        copy.querySelector('[data-chamber-arrival="value"]').textContent = '$123 fixture';
        const originalAnimate = Element.prototype.animate;
        let animations = 0;
        Element.prototype.animate = function(...args) { animations++; return originalAnimate.apply(this, args); };
        api.syncChamberReading(body, copy.innerHTML, { quiet: true });
        api.settleChamberArrival(body, { quiet: false });
        Element.prototype.animate = originalAnimate;
        const after = { scroll: scroll.scrollTop, page: scrollY, selection: getSelection().toString(), tab: document.activeElement.id };
        const retained = body.querySelector('[data-chamber-verdict]') === verdict && verdict.querySelector('p').firstChild === text && body.querySelector('#capital-freshness time') === stamp;
        scroll.scrollTop += 45;
        const readerScroll = scroll.scrollTop;
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return { before, after, retained, stableStatusGeometry, stableAgeWidth, animations, firstAge, hiddenAge, caughtUpAge, readerScroll, finalScroll: scroll.scrollTop, unknown: api.relativeChamberAge(null), future: api.relativeChamberAge(Date.now() + 120000), escaped: api.renderChamberVerdict({ key: 'safe', sentence: '<img onerror=alert(1)>', receipts: [['x', null]] }) };
      });
      assert.deepEqual(result.after, result.before, `${width}: clock and data update preserve reading state`);
      assert.equal(result.retained, true);
      assert.equal(result.stableStatusGeometry, true, 'Status changes do not shift or rewrap the sentence');
      assert.equal(result.stableAgeWidth, true, 'The first-minute label and later ages reserve the same width');
      assert.equal(result.animations, 0, 'No background or cached replay');
      assert.equal(result.firstAge, '2m ago');
      assert.equal(result.hiddenAge, '2m ago');
      assert.equal(result.caughtUpAge, '4m ago');
      assert.equal(result.readerScroll, result.finalScroll, 'No delayed overwrite of reader scroll');
      assert.equal(result.unknown, 'time unavailable');
      assert.equal(result.future, 'clock ahead');
      assert(!result.escaped.includes('<img'), 'Verdict escapes untrusted strings');
      assert.match(result.escaped, /Unavailable/);
      assert.deepEqual(errors, []);
      const lifecycle = await page.evaluate(async () => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
        document.dispatchEvent(new Event('visibilitychange'));
        const hidden = window.__readingTimers.size;
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
        document.dispatchEvent(new Event('visibilitychange'));
        const visible = window.__readingTimers.size;
        return { hidden, visible };
      });
      assert.deepEqual(lifecycle, { hidden: 0, visible: 1 }, 'Hidden rooms stop and resume one age timer');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.documentElement.dataset.dashboardReady === 'true' && location.pathname === '/');
      assert.equal(await page.evaluate(() => window.__readingTimers.size), 0, 'Actual room close releases the age timer');
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
}
