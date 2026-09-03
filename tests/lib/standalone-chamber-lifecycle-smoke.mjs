import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

async function setup(browser, installFeatureMocks, { width = 1440, theme = 'matrix', motion = 'reduce' } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: motion, serviceWorkers: 'block' });
  await installFeatureMocks(context);
  await context.addInitScript(theme => {
    localStorage.setItem('tezos-systems-theme', theme);
    localStorage.setItem('tezos-toured', '1');
    localStorage.setItem('tezos-welcomed', '1');
    localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
  }, theme);
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  return { context, page, errors };
}
const ready = (page, id) => page.waitForFunction(id => document.documentElement.dataset.chamberReady === id, id);
const home = page => page.waitForFunction(() => document.documentElement.dataset.dashboardReady === 'true' && location.pathname === '/', null, { timeout: 30000 });

export async function smokeStandaloneChamberLifecycle(browser, baseUrl, { installFeatureMocks, artifactsDir }) {
  {
    const { context, page, errors } = await setup(browser, installFeatureMocks);
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    try {
      await context.route('**/js/features/state-of-tezos.js', async route => {
        const response = await route.fetch(); await gate; await route.fulfill({ response });
      });
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      const topic = page.locator('[data-chamber-category="capital"] .chamber-category-toggle');
      await topic.click();
      assert.equal(await topic.getAttribute('aria-expanded'), 'true', 'Home topic responds while feature graph is still loading');
      // A reader can type before Search's deferred module has attached listeners.
      await page.locator('#hero-search-input').fill('governance');
      release(); await home(page);
      assert.equal(await topic.getAttribute('aria-expanded'), 'true', 'Late initialization preserves early topic choice');
      await page.waitForFunction(() => document.querySelector('#hero-search-panel .hero-search-result strong')?.textContent.trim() === 'Tezos L1 Governance');
      assert.equal(await page.locator('#hero-search-input').inputValue(), 'governance', 'Deferred Search preserves early typing');
      assert.deepEqual(errors, []);
      console.log('ok - early home topic and Search interactions survive deferred feature loading');
    } finally { release(); await context.close(); }
  }
  // Both a network failure and a deferred-module failure must leave the exact
  // static drawer/chart nodes, selection, focus, URL, and reader position intact.
  for (const id of ['my', 'history']) for (const failure of ['shell', 'dependency']) {
    const { context, page, errors } = await setup(browser, installFeatureMocks);
    try {
      await page.goto(`${baseUrl}/${id}/?campaign=retained`, { waitUntil: 'domcontentloaded' });
      await ready(page, id);
      const selector = id === 'my' ? '#my-tezos-drawer' : '#history-modal';
      const before = await page.evaluate(selector => {
        const root = document.querySelector(selector), focus = root.querySelector('button');
        focus.focus({ preventScroll: true });
        const heading = root.querySelector('h1, h2, h3'), text = [...heading.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.length > 2);
        const range = document.createRange(); range.setStart(text, 0); range.setEnd(text, 3);
        getSelection().removeAllRanges(); getSelection().addRange(range);
        const scroller = root.querySelector('.cycle-history-content, .my-tezos-drawer-body') || root;
        scroller.scrollTop = 120;
        window.__retainedStage3 = { root, focus, heading, scroller };
        return { url: location.href, selection: getSelection().toString(), top: scroller.scrollTop, time: performance.timeOrigin };
      }, selector);
      let attempts = 0;
      const pattern = failure === 'shell' ? '**/index.html' : '**/js/features/comparison.js';
      const fail = route => { attempts++; return failure === 'shell' ? route.fulfill({ status: 503, body: 'Injected shell failure' }) : route.abort('failed'); };
      await context.route(pattern, fail);
      await page.keyboard.press('Escape');
      await page.locator(`${selector} [data-dashboard-transition] button`).waitFor();
      const after = await page.evaluate(selector => {
        const { root, focus, heading, scroller } = window.__retainedStage3;
        return { url: location.href, selection: getSelection().toString(), top: scroller.scrollTop, time: performance.timeOrigin,
          same: document.querySelector(selector) === root && root.contains(heading) && document.activeElement === focus };
      }, selector);
      assert.deepEqual(after, { ...before, same: true }, `${id} ${failure}: failed handoff disturbed reader`);
      assert(attempts > 0, 'Injected failure reached the boundary');
      await context.unroute(pattern, fail);
      if (failure === 'shell') {
        await page.locator(`${selector} [data-dashboard-transition] button`).click();
        await home(page);
        assert.equal(await page.evaluate(() => performance.timeOrigin), before.time);
        assert.equal(await page.locator(selector).count(), 1);
        if (id === 'history') {
          // The retained modal was already wired, but this header button is new.
          await page.locator('#history-btn').evaluate(button => button.click());
          await page.locator('#history-modal.active').waitFor();
        }
      } else {
        // Failed native imports remain rejected in the browser module map; the
        // explicit full-page fallback must remain reachable and truthful.
        assert.equal(await page.locator(`${selector} [data-dashboard-fallback]`).getAttribute('href'), '/?campaign=retained');
      }
      assert.deepEqual(errors, []);
      console.log(`ok - standalone ${id}: retained reader after ${failure} failure`);
    } finally { await context.close(); }
  }

  for (const [slug, button] of [['pulse', '[data-pulse-history]'], ['stake', '#staking-ratio-history']]) {
    const { context, page, errors } = await setup(browser, installFeatureMocks, { width: 390 });
    try {
      let chartRequests = 0;
      await context.route('**/chart.js@4.4.1/dist/chart.umd.min.js', route => ++chartRequests === 1 ? route.abort('failed') : route.fallback());
      await page.goto(`${baseUrl}/${slug}/`, { waitUntil: 'domcontentloaded' });
      await ready(page, slug === 'stake' ? 'staking-chamber' : slug);
      assert.equal(chartRequests, 0, 'No Chart before a chart action');
      const trigger = page.locator(button).first();
      await trigger.click();
      await page.locator('#card-history-modal .card-history-state-error').waitFor();
      assert.equal(await page.locator('#hero-slot').count(), 0, 'Chart failure never starts home');
      await page.locator('#card-history-modal [data-range="7d"]').click();
      await page.waitForFunction(() => window.Chart && !document.querySelector('#card-history-modal .card-history-state-error') && !document.querySelector('#card-history-modal .card-history-chart')?.textContent.includes('Reading'));
      assert.equal(chartRequests, 2, 'Chart retry loads exactly once');
      await page.keyboard.press('Escape');
      await page.locator('#card-history-modal').waitFor({ state: 'hidden' });
      assert.equal(await page.locator('#hero-slot').count(), 0, 'Nested Escape retains room');
      assert.deepEqual(errors, []);
      console.log(`ok - standalone ${slug}: chart intent, library failure/retry, nested Escape`);
    } finally { await context.close(); }
  }

  for (const width of [1440, 320]) {
    const { context, page, errors } = await setup(browser, installFeatureMocks, { width, theme: 'clean' });
    try {
      // Shared directory controls cannot depend on a particular room's lazy CSS.
      await context.route('**/css/staking-chamber.min.css*', route => route.abort('failed'));
      await page.goto(`${baseUrl}/chambers/`, { waitUntil: 'domcontentloaded' });
      await ready(page, 'chambers');
      await page.locator('#customize-home-btn').click();
      await page.locator('#home-layout-modal.active').waitFor();
      await page.keyboard.press('Escape');
      await page.locator('#home-layout-modal').waitFor({ state: 'hidden' });
      assert.equal(await page.locator('#hero-slot').count(), 0, 'Customize Escape must not leave directory');
      const geometry = await page.evaluate(() => ({ footer: document.getElementById('site-footer').getBoundingClientRect().top,
        bottom: document.getElementById('chambers-section').getBoundingClientRect().bottom,
        overflow: document.documentElement.scrollWidth > innerWidth + 1 }));
      assert(geometry.footer >= geometry.bottom, 'Footer follows directory, not above it');
      assert.equal(geometry.overflow, false);
      assert(await page.locator('#customize-home-btn').evaluate(button => {
        const rect = button.getBoundingClientRect();
        return rect.right <= innerWidth && rect.left >= 0 && button.scrollWidth <= button.clientWidth + 1;
      }), 'Directory customize control and text fit on screen');
      const networkToggle = page.locator('[data-chamber-category="network"] .chamber-category-toggle');
      await networkToggle.click();
      const info = page.locator('[data-stat="network-health"] > button.card-info-btn');
      await info.click();
      const tooltipContained = label => page.waitForFunction(() => {
        const tooltip = document.querySelector('[data-stat="network-health"] > .card-tooltip.is-open');
        const rect = tooltip?.getBoundingClientRect();
        return rect && rect.height > 20 && getComputedStyle(tooltip).opacity === '1'
          && rect.top >= 10 && rect.bottom <= innerHeight - 10 && rect.left >= 10 && rect.right <= innerWidth - 10;
      }, null, { timeout: 3000 }).catch(async error => {
        const state = await info.evaluate(button => {
          const tooltip = button.nextElementSibling;
          return { expanded: button.getAttribute('aria-expanded'), rect: tooltip.getBoundingClientRect().toJSON(),
            style: tooltip.getAttribute('style'), classes: tooltip.className, viewport: [innerWidth, innerHeight], scrollY };
        });
        throw new Error(`${width}px ${label}: ${JSON.stringify(state)}; ${error.message}`);
      });
      await tooltipContained('initial tooltip');
      await page.evaluate(() => {
        const card = document.querySelector('[data-stat="network-health"]');
        const spacer = document.createElement('div');
        spacer.dataset.tooltipLayoutProbe = '';
        spacer.style.height = '220px';
        card.before(spacer);
      });
      await tooltipContained('tooltip after late layout');
      await page.keyboard.press('Escape');
      await page.evaluate(() => document.querySelector('[data-tooltip-layout-probe]')?.remove());
      await networkToggle.click();
      for (const [category, selector, route] of [['network', '[data-stat="network-health"]', 'health'], ['history', '#cycle-history-entry-card', 'history']]) {
        await page.locator(`[data-chamber-category="${category}"] .chamber-category-toggle`).click();
        await page.locator(selector).click({ position: { x: 30, y: 65 } });
        await page.waitForURL(`**/${route}/`);
        await ready(page, route);
        assert.equal(await page.locator('#hero-slot').count(), 0, 'Directory selection navigates directly into a scoped room');
        await page.goBack(); await ready(page, 'chambers');
      }
      if (artifactsDir) { await mkdir(artifactsDir, { recursive: true }); await page.screenshot({ path: path.join(artifactsDir, `directory-controls-${width}.png`) }); }
      assert.deepEqual(errors, []);
      console.log(`ok - standalone directory ${width}: layout, Customize Escape, Health/History navigation`);
    } finally { await context.close(); }
  }

  for (const [theme, canvas] of [['matrix', '#matrix-canvas'], ['ember', '#bg-effects-canvas'], ['valley', '#valley-background-canvas']]) {
    const { context, page, errors } = await setup(browser, installFeatureMocks, { theme, motion: 'no-preference' });
    try {
      await page.goto(`${baseUrl}/tezoscrp/`, { waitUntil: 'domcontentloaded' });
      await ready(page, 'tezoscrp');
      await page.locator(canvas).waitFor({ state: 'attached' });
      const painters = await page.evaluate(() => performance.getEntriesByType('resource').map(entry => new URL(entry.name).pathname).filter(url => /\/(?:matrix-effects|bg-effects|valley-effects)\.js$/.test(url)));
      assert.equal(painters.length, 1, 'Only selected theme painter loads');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.locator(canvas).waitFor({ state: 'detached' });
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.locator(canvas).waitFor({ state: 'attached' });
      await page.keyboard.press('Escape'); await home(page);
      assert.equal(await page.locator(canvas).count(), 1, 'Handoff does not duplicate painter');
      assert.deepEqual(errors, []);
      console.log(`ok - standalone ${theme}: selected painter, reduced motion, single-instance home handoff`);
    } finally { await context.close(); }
  }
}
