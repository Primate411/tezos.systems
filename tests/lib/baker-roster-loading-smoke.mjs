import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

// Verify the rendered indicator, not just a class or an aria-busy attribute.
async function assertTextBubbles(page, selector, { reducedMotion = false, count = null } = {}) {
  const bubbles = await page.locator(selector).evaluateAll(nodes => nodes.map(node => {
    const style = getComputedStyle(node), box = node.getBoundingClientRect();
    return { slot: node.dataset.bakerLoading, width: box.width, height: box.height,
      color: style.color, background: style.backgroundColor, image: style.backgroundImage,
      animation: style.animationName, opacity: style.opacity, radius: parseFloat(style.borderRadius) };
  }));
  if (count !== null) assert.equal(bubbles.length, count, `${selector}: expected every pending text slot`);
  assert.ok(bubbles.length, `${selector}: missing text placeholders`);
  for (const bubble of bubbles) {
    assert.ok(bubble.width > 0 && bubble.height > 0 && bubble.radius > 0, `invisible text bubble: ${JSON.stringify(bubble)}`);
    assert.equal(bubble.opacity, '1');
    assert.match(bubble.color, /rgba\(.+, 0\)$/);
    assert.doesNotMatch(bubble.background, /rgba\(.+, 0\)$/);
    assert.match(bubble.image, /linear-gradient/);
    assert.equal(bubble.animation, reducedMotion ? 'none' : 'shimmer');
  }
}

async function smokeColdRoster(browser, baseUrl, installFeatureMocks, artifactsDir) {
  const context = await browser.newContext({ viewport: { width: 390, height: 1000 }, serviceWorkers: 'block' });
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  try {
    await installFeatureMocks(context);
    await context.addInitScript(() => {
      localStorage.setItem('tezos-systems-theme', 'dark');
      localStorage.setItem('tezos-toured', '1'); localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    });
    await context.route('**/*', async route => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname.endsWith('/context/delegates') || pathname.endsWith('/tezos_history')) await gate;
      return route.fallback();
    });
    const page = await context.newPage();
    await page.goto(`${baseUrl}/?theme=dark`, { waitUntil: 'load' });
    await page.locator('.top-continuity-stat[data-card-history="total-bakers"]').click();
    await page.locator('.top-continuity-baker-loading').waitFor();
    await assertTextBubbles(page, '.top-continuity-baker-loading [data-baker-loading]', { count: 30 });
    await assertTextBubbles(page, '[data-top-continuity-horizons] [data-baker-loading="trend"]', { count: 3 });
    // Negative probe: the contract must reject a missing visual, even when
    // its data marker and accessible loading label remain present.
    const probe = page.locator('.top-continuity-baker-loading [data-baker-loading]').first();
    await probe.evaluate(node => node.classList.remove('top-continuity-baker-placeholder'));
    await assert.rejects(() => assertTextBubbles(page, '.top-continuity-baker-loading [data-baker-loading]', { count: 30 }));
    await probe.evaluate(node => node.classList.add('top-continuity-baker-placeholder'));
    assert.equal(await page.locator('.top-continuity-baker-loading button, .top-continuity-baker-loading a').count(), 0, 'pending actions are not fake controls');
    if (artifactsDir) await page.screenshot({ path: path.join(artifactsDir, 'baker-roster-cold-390.png') });
    release();
    await page.waitForFunction(() => document.querySelectorAll('#top-continuity-baker-roster [data-address]').length === 6);
  } finally { release(); await context.close(); }
}

export async function smokeBakerRosterLoading(browser, baseUrl, { installFeatureMocks, artifactsDir }) {
  if (artifactsDir) await mkdir(artifactsDir, { recursive: true });
  await smokeColdRoster(browser, baseUrl, installFeatureMocks, artifactsDir);
  for (const [width, theme] of [[1440, 'matrix'], [390, 'clean'], [320, 'matrix']]) {
    const reducedMotion = width === 390;
    const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: 'block', reducedMotion: reducedMotion ? 'reduce' : 'no-preference' });
    let releaseDetails;
    const detailsGate = new Promise(resolve => { releaseDetails = resolve; });
    let membershipReads = 0;
    let detailReads = 0;
    try {
      await installFeatureMocks(context, { blockHeadAutoAdvance: false });
      await context.addInitScript(theme => {
        localStorage.setItem('tezos-systems-theme', theme);
        localStorage.setItem('tezos-toured', '1'); localStorage.setItem('tezos-welcomed', '1');
        localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
        window.__rosterVisibility = 'hidden';
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.__rosterVisibility });
      }, theme);
      await context.route('**/*', async route => {
        const request = route.request();
        const url = new URL(request.url());
        const params = url.searchParams;
        if (url.pathname.endsWith('/context/delegates') && params.get('with_minimal_stake') === 'true') membershipReads++;
        const detail = request.postData()?.includes('ReverseLookupBatch')
          || params.has('anyof.proposer.producer')
          || params.get('select') === 'level,cycle,timestamp'
          || params.get('select') === 'totalBakingPower';
        if (detail) {
          detailReads++;
          await detailsGate;
          // A name-service failure must leave the confirmed roster usable.
          if (width === 320 && request.postData()?.includes('ReverseLookupBatch')) {
            return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
          }
        }
        return route.fallback();
      });
      const page = await context.newPage();
      await page.goto(`${baseUrl}/?theme=${theme}`, { waitUntil: 'load' });
      await page.waitForFunction(() => /^\d+$/.test(document.querySelector('#hero-chain-uptime-bakers')?.textContent.trim() || ''));
      assert.equal(membershipReads, 0, 'hidden dashboard must not preload the roster');
      await page.evaluate(() => {
        window.__rosterVisibility = 'visible';
        document.dispatchEvent(new Event('visibilitychange'));
      });
      // Observe the real preload while the disclosure is still closed.
      await page.waitForFunction(() => performance.getEntriesByType('resource').filter(entry => (
        entry.name.includes('/context/delegates?active=true&with_minimal_stake=true')
      )).length === 2);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(membershipReads, 2, 'preload reads one current and one historical protocol set');
      assert.equal(detailReads, 0, 'optional detail fan-out must wait for user intent');
      const pill = page.locator('.top-continuity-stat[data-card-history="total-bakers"]');
      const detailsStarted = page.waitForRequest(request => request.postData()?.includes('ReverseLookupBatch'));
      await pill.click();
      await detailsStarted;
      assert.ok(detailReads > 0);
      const initial = await page.locator('#top-continuity-baker-roster').evaluate(roster => ({
        rows: roster.querySelectorAll('.top-continuity-baker-row').length,
        loading: Boolean(roster.querySelector('.top-continuity-baker-loading')),
        badges: roster.querySelectorAll('.top-continuity-baker-new:not([data-baker-loading])').length,
        status: roster.querySelector('[data-baker-set-status]')?.textContent || ''
      }));
      assert.equal(initial.rows, 6, 'opening a prepared list must paint all rows synchronously with details held');
      assert.equal(initial.loading, false, 'slow optional receipts must not block the list');
      assert.equal(initial.badges, 0, 'pending first-bake history must not invent NEW or REACTIVATED');
      assert.match(initial.status, /loading details/);
      await page.waitForFunction(() => document.querySelector('#top-continuity-baker-roster .is-gained strong')?.textContent === 'QA Baker');
      await assertTextBubbles(page, '#top-continuity-baker-roster [data-baker-loading="identity"]', { reducedMotion, count: 6 });
      await assertTextBubbles(page, '#top-continuity-baker-roster [data-baker-loading="entry"]', { reducedMotion, count: 3 });
      await assertTextBubbles(page, '#top-continuity-baker-roster [data-baker-loading="size"]', { reducedMotion, count: 6 });
      await page.locator('#top-continuity-baker-roster .top-continuity-baker-row').last().scrollIntoViewIfNeeded();
      const before = await page.evaluate(() => {
        const roster = document.querySelector('#top-continuity-baker-roster');
        const rows = [...roster.querySelectorAll('.top-continuity-baker-row')];
        const focus = rows[0].querySelector('a[href^="https://tzkt.io/"]');
        focus.focus({ preventScroll: true });
        const heading = roster.querySelector('.top-continuity-baker-heading strong');
        const range = document.createRange(); range.selectNodeContents(heading);
        getSelection().removeAllRanges(); getSelection().addRange(range);
        window.__rosterReader = { rows, focus, roster };
        const positions = rows.map(row => { const r = row.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; });
        window.__rosterVisibility = 'hidden';
        document.dispatchEvent(new Event('visibilitychange'));
        return { scroll: scrollY, selection: getSelection().toString(), positions, url: location.href, markup: roster.innerHTML };
      });
      if (artifactsDir) await page.screenshot({ path: path.join(artifactsDir, `baker-roster-pending-${width}.png`) });
      releaseDetails();
      // Join every receipt without elapsed-time sleeps or calling a private renderer.
      await page.waitForFunction(async () => {
        const resources = performance.getEntriesByType('resource');
        return resources.some(entry => entry.name.includes('/rewards/bakers/') && entry.name.includes('cycle=961'));
      });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await page.locator('#top-continuity-baker-roster').innerHTML(), before.markup, 'hidden completions must not mutate the reading surface');
      await page.evaluate(() => {
        window.__rosterVisibility = 'visible';
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await page.waitForFunction(() => document.querySelector('#top-continuity-baker-roster')?.getAttribute('aria-busy') === 'false');
      const after = await page.evaluate(() => {
        const { rows, focus, roster } = window.__rosterReader;
        return {
          scroll: scrollY, selection: getSelection().toString(), url: location.href,
          positions: rows.map(row => { const r = row.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }),
          retained: rows.every(row => roster.contains(row)), focused: document.activeElement === focus,
          kinds: rows.filter(row => row.classList.contains('is-gained')).map(row => row.dataset.bakerEntry),
          sizes: rows.map(row => row.querySelector('[data-baker-size]').dataset.bakerSize),
          opacity: getComputedStyle(roster).opacity,
          overflow: document.documentElement.scrollWidth - innerWidth,
          names: rows.map(row => row.querySelector('strong').textContent)
        };
      });
      assert.equal(after.retained, true); assert.equal(after.focused, true);
      assert.equal(after.scroll, before.scroll); assert.equal(after.selection, before.selection); assert.equal(after.url, before.url);
      assert.deepEqual(after.kinds, ['new', 'reactivated', 'new']);
      assert.deepEqual(after.sizes, ['large', 'medium', 'small', 'small', 'medium', 'large']);
      assert.equal(after.opacity, '1'); assert.ok(after.overflow <= 1);
      after.positions.forEach((rect, i) => rect.forEach((value, j) => assert.ok(Math.abs(value - before.positions[i][j]) <= 1, `row ${i} geometry moved at ${width}px`)));
      assert.ok(after.names.includes(width === 320 ? 'QA Baker' : 'qa-baker.tez'));
      assert.equal(await page.locator('#top-continuity-baker-roster [data-baker-loading]').count(), 0, 'success and source failure must both settle their text placeholders');
      if (artifactsDir) await page.screenshot({ path: path.join(artifactsDir, `baker-roster-ready-${width}.png`) });
      await page.evaluate(() => {
        window.scrollBy({ top: 37, behavior: 'instant' });
        window.__rosterReaderScroll = scrollY;
      });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await page.evaluate(() => scrollY), await page.evaluate(() => window.__rosterReaderScroll), 'quiet reconciliation must not overwrite a later reader scroll');
      await page.keyboard.press('Escape');
      await pill.click();
      assert.equal(await page.locator('#top-continuity-baker-roster .top-continuity-baker-row').count(), 6);
      assert.equal(membershipReads, 2, 'reopening the fresh roster must reuse its snapshot');
      assert.equal(await page.locator('#top-continuity-baker-roster [data-baker-loading]').count(), 0, 'cached reopening must not replay loading');
    } finally {
      releaseDetails();
      await context.close();
    }
  }
}
