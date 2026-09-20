import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

/** Hold lower-page history at the source, rather than relying on fast fixtures. */
export async function smokeViewportLoading(browser, baseUrl, { installFeatureMocks, artifactsDir }) {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 }, serviceWorkers: 'block', reducedMotion: 'reduce'
    });
    let releaseHead, releaseHistory;
    const headReady = new Promise(resolve => { releaseHead = resolve; });
    const historyReady = new Promise(resolve => { releaseHistory = resolve; });
    let heldHead = 0, heldHistory = 0;
    try {
      // Advance the head explicitly below. History-only reconciliation must
      // not race unrelated new blocks synthesized by a background read.
      const fixtures = await installFeatureMocks(context, { blockHeadAutoAdvance: false });
      await context.route('https://api.tzkt.io/v1/**', async route => {
        const url = new URL(route.request().url());
        if (url.pathname === '/v1/blocks' && url.searchParams.get('limit') === '26'
            && url.searchParams.get('select')?.includes('attestationCommittee')) {
          heldHead += 1;
          await headReady;
        } else if (url.pathname === '/v1/protocols' || /^\/v1\/blocks\/[^/]+\/level$/.test(url.pathname)) {
          heldHistory += 1;
          await historyReady;
        }
        await route.fallback();
      });
      await context.addInitScript(() => {
        localStorage.setItem('tezos-systems-theme', 'clean');
        localStorage.setItem('tezos-toured', '1');
        localStorage.setItem('tezos-welcomed', '1');
        localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const capture = async stage => {
        if (!artifactsDir) return;
        await mkdir(artifactsDir, { recursive: true });
        await page.screenshot({ path: path.join(artifactsDir, `viewport-load-${width}-${stage}.png`) });
      };
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.documentElement.dataset.dashboardReady === 'true');
      assert.equal(await page.locator('#live-head-stack [data-live-head-level]').count(), 0);
      await capture('pending');
      releaseHead();
      await page.waitForFunction(() => document.querySelector('#live-head-stack [data-live-head-level]')
        && /\d/.test(document.getElementById('hero-chain-uptime-bakers')?.textContent || ''), null, { timeout: 15000 });
      assert(heldHead, 'the test must release a real head receipt');
      assert.equal(await page.evaluate(() => localStorage.getItem('tezos-systems-network-health')), null,
        'an early head must not be persisted as a complete history receipt');
      await capture('essential');
      const firstLevel = await page.evaluate(() => Number(document.querySelector('#live-head')?.dataset.heartbeatLevel));
      fixtures.advanceBlockHead();
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('block-pulse')));
      await page.waitForFunction(level => Number(document.querySelector('#live-head')?.dataset.heartbeatLevel) > level,
        firstLevel, { timeout: 10000 });
      assert.equal(await page.evaluate(() => localStorage.getItem('tezos-systems-network-health')), null,
        'a newer head must keep advancing while initial history is still held');
      await capture('live-during-history');
      await page.evaluate(() => {
        const row = document.querySelector('#live-head-stack [data-live-head-level]');
        document.getElementById('settings-gear').focus({ preventScroll: true });
        window.scrollTo(0, 40);
        window.__firstHeadReader = { row, scroll: scrollY, focus: document.activeElement };
      });
      releaseHistory();
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('tezos-systems-network-health') || 'null')?.periods?.length > 0,
        null, { timeout: 30000 });
      assert(heldHistory, 'the test must exercise the history gate');
      assert(await page.evaluate(() => window.__firstHeadReader.row === document.querySelector('#live-head-stack [data-live-head-level]')
        && window.__firstHeadReader.focus === document.activeElement
        && Math.abs(window.__firstHeadReader.scroll - scrollY) <= 1),
      'finishing history must retain the visible head, reader focus, and scroll');
      await capture('enriched');
      assert.deepEqual(errors, []);
    } finally {
      releaseHead();
      releaseHistory();
      await context.close();
    }
  }
}
