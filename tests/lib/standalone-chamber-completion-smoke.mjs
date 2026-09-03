import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CHAMBER_FEATURES, standaloneFeatureForRoute } from '../../js/core/chamber-features.mjs';
import { CHAMBER_ROUTES } from '../../scripts/lib/chamber-routes.mjs';

export async function smokeStandaloneChamberCompletion(browser, baseUrl, { installFeatureMocks, artifactsDir, ledgerFlowAddress }) {
  const receipts = [], failures = [];
  const routes = [...CHAMBER_ROUTES.map(route => route.slug), 'anthology/ushuaia'];
  for (const width of [1440, 390]) for (const slug of routes) {
    const id = standaloneFeatureForRoute(slug);
    assert(id, `${slug}: every generated route has a boot owner`);
    const room = CHAMBER_FEATURES[id].standalone;
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    let page;
    try {
      // Ledger Flow seeds itself from Whale Watch. Pin the archive and its
      // account receipts together instead of following a rolling data file.
      const mocks = await installFeatureMocks(context, { whaleChamberMocks: true, ledgerFlowMocks: true });
      await context.addInitScript(width => {
        localStorage.setItem('tezos-systems-theme', width === 390 ? 'clean' : 'matrix');
        localStorage.setItem('tezos-toured', '1');
        localStorage.setItem('tezos-welcomed', '1');
        localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
      }, width);
      page = await context.newPage();
      const errors = [], requests = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => requests.push(request.url()));
      await page.goto(`${baseUrl}/${slug}/`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(id => document.documentElement.dataset.chamberReady === id, id, { timeout: 35000 });
      if (id === 'ledger-flow') {
        await page.waitForFunction(address => localStorage.getItem('tezos-systems-ledger-flow-target') === address, ledgerFlowAddress);
        assert(mocks.whaleArtifactRequests > 0, 'Ledger Flow reads the pinned Whale Watch seed');
        assert(mocks.ledgerFlowTzktRequests.some(url => new URL(url).pathname === `/v1/accounts/${ledgerFlowAddress}`), 'Seed account receipt is exercised, not skipped');
      }
      await page.evaluate(() => document.fonts.ready);
      const cold = await page.evaluate(() => ({
        timeOrigin: performance.timeOrigin,
        nodes: document.querySelectorAll('*').length,
        scripts: performance.getEntriesByType('resource').filter(entry => /\.(?:m?js)(?:\?|$)/.test(entry.name)).map(entry => new URL(entry.name).pathname),
        dashboard: document.documentElement.dataset.dashboardReady,
        hero: Boolean(document.getElementById('hero-slot')),
        overflow: document.documentElement.scrollWidth > innerWidth + 1
      }));
      assert.equal(cold.hero, false, 'No hidden home DOM');
      assert.equal(cold.dashboard, undefined, 'No home initialization');
      assert.equal(cold.overflow, false, 'No horizontal page overflow');
      if (id !== 'history') assert(!cold.scripts.some(url => /chart\.umd|\/features\/history\.js/.test(url)), 'History and Chart only on chart intent');
      if (id !== 'health') assert(!cold.scripts.some(url => /\/features\/network-health\.js/.test(url)), 'No unrelated Health UI');
      if (!room.controller) assert(!cold.scripts.some(url => /\/core\/app\.js/.test(url)), 'Independent room stays out of app controller');
      assert.deepEqual(errors, [], 'No boot exceptions');
      assert(await page.locator(`#${room.overlayId}`).isVisible(), 'Room visibly rendered');
      const verdict = page.locator(`#${room.overlayId} [data-chamber-verdict="${id}"]`);
      await verdict.waitFor({ state: 'attached' });
      assert.equal(await verdict.count(), 1, 'One source-bounded summary per room');
      assert(!/undefined|NaN/.test(await verdict.innerText()), 'Summary has no missing-value artifacts');
      if (['capital', 'minerals', 'metals', 'uranium'].includes(id)) {
        assert.equal(await page.locator(`#${room.overlayId} .chamber-reading-guide dt`).count(), 3, 'Three source-scale reference rows');
      }
      if (id === 'history' && width === 390) {
        const palette = await page.evaluate(() => {
          const room = getComputedStyle(document.querySelector('.cycle-history-content'));
          const lede = getComputedStyle(document.querySelector('.cycle-history-lede'));
          return { scheme: room.colorScheme, background: room.backgroundImage, text: lede.color };
        });
        assert.equal(palette.scheme, 'light', 'History Clean owns a coherent light palette');
        assert(palette.background.includes('255, 255, 255'), 'History light background beats generic dark Chamber skin');
        assert.equal(palette.text, 'rgb(74, 85, 104)', 'History prose stays readable on its light panels');
      }
      if (id === 'health') {
        await page.waitForFunction(() => getComputedStyle(document.querySelector('.health-header')).opacity === '1');
        assert.match(await page.locator('#chain-uptime-counter').innerText(), /\dy \d+d/);
        for (const metric of ['bakers', 'staked', 'issuance']) assert.notEqual((await page.locator(`#chain-uptime-${metric}`).innerText()).trim(), '—', `Health owns ${metric} without home`);
        assert.match(await page.locator('#health-period-telemetry').innerText(), /31D/, 'Health owns period receipts without home');
      }
      receipts.push({ slug, id, width, ...cold, requests });
      if (artifactsDir) {
        await mkdir(artifactsDir, { recursive: true });
        await page.screenshot({ path: path.join(artifactsDir, `boot-${slug.replaceAll('/', '-')}-${width}.png`) });
      }
      if (slug.includes('/')) await page.keyboard.press('Escape');
      const returnPath = new URL(page.url()).pathname;
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.documentElement.dataset.dashboardReady === 'true' && location.pathname === '/', null, { timeout: 30000 });
      assert.equal(await page.evaluate(() => performance.timeOrigin), cold.timeOrigin, 'Same-document home handoff');
      assert((await page.title()).startsWith('Tezos Systems'), 'Leaving a room restores dashboard title ownership');
      assert.deepEqual(errors, [], 'No handoff exceptions');
      for (const fragment of room.fragments || []) assert.equal(await page.locator(`[id="${fragment}"]`).count(), 1, `One retained ${fragment}`);
      await page.goBack();
      await page.waitForFunction(({ id, returnPath }) => location.pathname === returnPath
        && (id === 'chambers-section' ? document.getElementById(id)?.getClientRects().length > 0 : document.getElementById(id)?.matches('.active, .open')), { id: room.overlayId, returnPath }, { timeout: 30000 });
      assert.deepEqual(errors, [], 'No Back exceptions');
      console.log(`ok - standalone completion ${slug} ${width}: own boot, visible room, home handoff, Back`);
    } catch (error) {
      failures.push(`${slug} ${width}: ${error.message}`);
      console.error(`diagnostic - ${failures.at(-1)}`);
      if (artifactsDir && page) await page.screenshot({ path: path.join(artifactsDir, `failure-${slug.replaceAll('/', '-')}-${width}.png`) }).catch(() => {});
    } finally { await context.close(); }
  }
  if (artifactsDir) await writeFile(path.join(artifactsDir, 'all-route-boot-resources.json'), JSON.stringify({ receipts, failures }, null, 2));
  assert.deepEqual(failures, []);
}
