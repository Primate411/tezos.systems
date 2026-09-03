import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CHAMBER_FEATURES } from '../../js/core/chamber-features.mjs';

const ROOMS = [
  ['capital', 'view=markets', 'markets', 'capital-snapshot'],
  ['ecosystem', 'layer=tezos&range=12w', 'tezos', 'ecosystem-stats'],
  ['minerals', 'view=markets&range=1y', 'markets', 'minerals-snapshot'],
  ['metals', 'view=markets&metal=XAG', 'markets', 'metals-snapshot'],
  ['uranium', 'view=markets&range=7D', 'markets', 'uranium-snapshot']
];
const settled = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const ready = (page, id) => page.waitForFunction(id => document.getElementById(`${id}-chamber-body`)?.dataset[`${id}Rendered`] === '1', id);
const dashboardReady = page => page.waitForFunction(() => document.documentElement.dataset.dashboardReady === 'true' && location.pathname === '/', null, { timeout: 20000 });

async function prepareContext(browser, installFeatureMocks, id, width) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
  await installFeatureMocks(context);
  await context.addInitScript(({ id, width }) => {
    localStorage.setItem('tezos-systems-theme', width === 390 ? 'clean' : 'matrix');
    localStorage.setItem('tezos-toured', '1');
    localStorage.setItem('tezos-welcomed', '1');
    localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    window[`__${id.toUpperCase()}_CHAMBER_REFRESH_MS__`] = 654322;
    const interval = window.setInterval.bind(window), clear = window.clearInterval.bind(window);
    window.__roomTimers = new Set();
    window.setInterval = (callback, delay, ...args) => {
      const timer = interval(callback, delay, ...args);
      if (delay === 654322) window.__roomTimers.add(timer);
      return timer;
    };
    window.clearInterval = timer => { window.__roomTimers.delete(timer); return clear(timer); };
  }, { id, width });
  return context;
}

export async function smokeStandaloneChamberExpansion(browser, baseUrl, { installFeatureMocks, artifactsDir }) {
  const receipts = [];
  for (const width of [1440, 390]) for (const [id, query, tab, fullName] of ROOMS) {
    const { standalone: room, modulePath } = CHAMBER_FEATURES[id];
    const context = await prepareContext(browser, installFeatureMocks, id, width);
    try {
      const page = await context.newPage();
      const requests = [], errors = [];
      page.on('request', request => requests.push(request.url()));
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${baseUrl}/${id}/?${query}&campaign=boot-test`, { waitUntil: 'domcontentloaded' });
      await ready(page, id);
      await settled(page);
      const body = page.locator(`#${id}-chamber-body`);
      assert.equal(await body.locator('[role="tab"][aria-selected="true"]').getAttribute('id'), `${id}-tab-${tab}`, `${id} ${width}: direct view`);
      const cold = await page.evaluate(() => ({
        timeOrigin: performance.timeOrigin, domNodes: document.querySelectorAll('*').length,
        scripts: performance.getEntriesByType('resource').filter(entry => /\.(?:m?js)(?:\?|$)/.test(entry.name)).map(entry => new URL(entry.name).pathname),
        hero: Boolean(document.getElementById('hero-slot')), app: document.documentElement.dataset.dashboardReady,
        overflow: document.documentElement.scrollWidth > innerWidth + 1
      }));
      assert.equal(cold.hero, false, `${id} ${width}: eager dashboard DOM`);
      assert.equal(cold.app, undefined, `${id} ${width}: eager dashboard init`);
      assert.equal(cold.overflow, false, `${id} ${width}: horizontal page overflow`);
      // Stage 4 adds exactly one shared reading-cue module, not a dashboard dependency.
      assert.equal(cold.scripts.filter(url => url === '/js/ui/chamber-reading.js').length, 1, 'One shared reading module');
      assert(cold.scripts.filter(url => url !== '/js/ui/chamber-reading.js').length < 25, `${id} ${width}: unexpectedly large startup graph ${cold.scripts}`);
      const forbidden = requests.filter(url => /\/js\/(?:core\/(?:app|api)\.js|features\/(?:network-health|history|my-tezos)\.js)|chart\.umd|api\.tzkt\.io|supabase\.co/.test(url));
      assert.deepEqual(forbidden, [], `${id} ${width}: unrelated dashboard requests`);
      for (const [, , , other] of ROOMS) if (other !== fullName) {
        assert(!requests.some(url => new URL(url).pathname === `/data/${other}.json`), `${id}: loaded unrelated ${other}`);
      }
      receipts.push({ id, width, ...cold });
      if (artifactsDir) {
        await mkdir(artifactsDir, { recursive: true });
        await page.screenshot({ path: path.join(artifactsDir, `standalone-${id}-${width}.png`) });
      }

      // A real tab change stays inside the room and survives a subsequent Back.
      await body.locator('[role="tab"][aria-selected="false"]').first().click();
      const selected = await body.locator('[role="tab"][aria-selected="true"]').getAttribute('id');
      const returnUrl = page.url();
      assert.equal(await page.locator('#hero-slot').count(), 0, `${id}: tab change booted dashboard`);

      if (width === 1440) {
        let attempts = 0;
        await context.route('**/index.html', route => ++attempts === 1 ? route.fulfill({ status: 503, body: 'Injected dashboard exit failure' }) : route.continue());
        const before = await page.evaluate(id => {
          const body = document.getElementById(`${id}-chamber-body`);
          const focus = body.querySelector('[role="tab"][aria-selected="true"]');
          focus.focus({ preventScroll: true });
          const header = body.querySelector('header'), text = header.querySelector('h2').firstChild;
          const range = document.createRange();
          range.setStart(text, 0); range.setEnd(text, Math.min(5, text.length));
          getSelection().removeAllRanges(); getSelection().addRange(range);
          body.scrollTop = Math.min(240, body.scrollHeight - body.clientHeight);
          window.__exitReader = { body, header, focus, timer: [...window.__roomTimers][0] };
          return { top: body.scrollTop, selection: getSelection().toString(), focus: focus.id, url: location.href, timers: window.__roomTimers.size };
        }, id);
        assert.equal(before.timers, 1, `${id}: standalone owns one room timer`);
        await page.keyboard.press('Escape');
        await page.locator('[data-dashboard-transition] button').waitFor();
        const after = await page.evaluate(id => {
          const saved = window.__exitReader, body = document.getElementById(`${id}-chamber-body`);
          return { top: body.scrollTop, selection: getSelection().toString(), focus: document.activeElement.id, url: location.href,
            timers: window.__roomTimers.size, sameTimer: window.__roomTimers.has(saved.timer), sameBody: body === saved.body,
            sameHeader: body.querySelector('header') === saved.header };
        }, id);
        assert.deepEqual({ ...before, sameTimer: true, sameBody: true, sameHeader: true }, after, `${id}: failed exit disturbed reading or stopped polling`);
        await page.locator('[data-dashboard-transition] button').click();
        await dashboardReady(page);
        assert.equal(attempts, 2, `${id}: exit retry count`);
      } else {
        await page.locator(`#${room.overlayId} .chamber-close`).click();
        await dashboardReady(page);
      }
      await page.waitForFunction(room => !document.getElementById(room.overlayId)?.classList.contains('active') && document.activeElement?.closest(room.launcher), room);
      assert.equal(await page.evaluate(() => performance.timeOrigin), cold.timeOrigin, `${id}: close reloaded document`);
      assert.equal(new URL(page.url()).search, '?campaign=boot-test', `${id}: close discarded unrelated query state`);
      assert.equal(await page.locator('#hero-slot').count(), 1, `${id}: duplicate dashboard`);
      assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), 'https://tezos.systems/');
      await page.goBack();
      await page.locator(`#${room.overlayId}.active`).waitFor();
      await page.waitForFunction(({ id, selected }) => document.querySelector(`#${id}-chamber-body [role="tab"][aria-selected="true"]`)?.id === selected, { id, selected });
      assert.equal(page.url(), returnUrl, `${id}: Back lost room query`);
      await page.goForward();
      await page.waitForFunction(room => !document.getElementById(room.overlayId)?.classList.contains('active'), room);
      await page.locator('#hero-search-input').focus();
      await page.locator('#hero-search-input').fill('Network Health');
      await page.locator('#hero-search-panel .hero-search-result').first().waitFor();
      await page.keyboard.press('Enter');
      await page.locator('#network-health-modal.active').waitFor({ state: 'visible' });
      await page.keyboard.press('Escape');
      await page.evaluate(() => { location.hash = 'my-tezos'; });
      await page.locator('#my-tezos-drawer.open').waitFor({ state: 'visible' });
      assert.equal(await page.evaluate(() => performance.timeOrigin), cold.timeOrigin, `${id}: secondary navigation reloaded`);
      assert.equal(requests.filter(url => new URL(url).pathname === '/js/core/app.js').length, 1, `${id}: repeated dashboard import`);
      assert.equal(requests.filter(url => new URL(url).pathname === new URL(modulePath, `${baseUrl}/js/core/chamber-features.mjs`).pathname).length, 1, `${id}: repeated room module import`);
      assert.deepEqual(errors, [], `${id} ${width}: browser exceptions`);
    } finally { await context.close(); }
  }

  // Search hydrates in place. Adjacent-room links retain normal page navigation
  // and should enter the next lightweight shell without waking the dashboard.
  for (const [id, action] of [['capital', 'shortcut'], ['ecosystem', 'search'], ['minerals', 'adjacent'], ['metals', 'search'], ['uranium', 'adjacent']]) {
    console.log(`standalone first intent: ${id} ${action}`);
    const context = await prepareContext(browser, installFeatureMocks, id, 390);
    try {
      const page = await context.newPage();
      const dashboardRequests = [];
      page.on('request', request => { if (new URL(request.url()).pathname === '/js/core/app.js') dashboardRequests.push(request.url()); });
      await page.goto(`${baseUrl}/${id}/`, { waitUntil: 'domcontentloaded' });
      await ready(page, id);
      await settled(page);
      const origin = await page.evaluate(() => performance.timeOrigin);
      if (action === 'shortcut') await page.keyboard.press('/');
      else if (action === 'search') await page.getByRole('link', { name: 'Search Tezos Systems', exact: true }).click();
      else {
        const link = page.locator(`[data-site-wayfinder-entry]:not([href^="/${id}/"])`).first();
        const destination = new URL(await link.getAttribute('href'), baseUrl);
        await link.click();
        await page.waitForURL(url => url.pathname === destination.pathname && url.hash === destination.hash);
        const destinationId = destination.pathname.split('/')[1];
        assert.ok(CHAMBER_FEATURES[destinationId]?.standalone);
        await ready(page, destinationId);
        assert.equal(await page.locator('html').getAttribute('data-chamber-boot'), destinationId);
        assert.equal(await page.locator('#hero-slot').count(), 0, `${id}: adjacent room eagerly built dashboard`);
        assert.equal(dashboardRequests.length, 0, `${id}: adjacent room imported dashboard`);
        assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), `https://tezos.systems/${destinationId}/`);
      }
      if (action !== 'adjacent') {
        await page.waitForFunction(() => document.body.classList.contains('hero-search-mode') && document.activeElement?.id === 'hero-search-input');
        assert.equal(await page.evaluate(() => performance.timeOrigin), origin, `${id}: first ${action} intent reloaded document`);
      }
    } catch (error) {
      const page = context.pages()[0];
      const state = page ? await page.evaluate(() => ({ url: location.href, ready: document.documentElement.dataset.dashboardReady,
        active: [...document.querySelectorAll('.modal-overlay.active')].map(node => node.id), focus: document.activeElement?.id,
        transition: document.querySelector('[data-dashboard-transition]')?.textContent })) : null;
      throw new Error(`${id} first ${action} intent: ${error.message}; ${JSON.stringify(state)}`, { cause: error });
    } finally { await context.close(); }
  }

  // Leaving before an asynchronous stylesheet arrives must not open the old room
  // on top of the newly prepared dashboard (each room has its own open epoch).
  for (const [id] of ROOMS) {
    const context = await prepareContext(browser, installFeatureMocks, id, 390);
    const stylesheet = `/css/${['capital', 'ecosystem'].includes(id) ? id : `${id}-chamber`}.min.css`;
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    try {
      let styleStarted = false;
      await context.route(`**${stylesheet}*`, async route => { styleStarted = true; await gate; await route.continue(); });
      const page = await context.newPage();
      const styleRequest = page.waitForRequest(request => new URL(request.url()).pathname === stylesheet);
      await page.goto(`${baseUrl}/${id}/`, { waitUntil: 'domcontentloaded' });
      await styleRequest;
      const appRequest = page.waitForRequest(request => new URL(request.url()).pathname === '/js/core/app.js');
      await page.keyboard.press('Escape');
      await appRequest;
      release();
      await dashboardReady(page);
      await settled(page);
      assert(styleStarted);
      assert.equal(await page.locator(`#${CHAMBER_FEATURES[id].standalone.overlayId}.active`).count(), 0, `${id}: cancelled stylesheet reopened room`);
    } finally { release(); await context.close(); }
  }
  if (artifactsDir) await writeFile(path.join(artifactsDir, 'standalone-expansion-resources.json'), `${JSON.stringify(receipts, null, 2)}\n`);
}
