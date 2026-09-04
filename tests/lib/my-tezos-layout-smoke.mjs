import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';

const VIEWS = ['overview', 'baker-signal', 'portfolio', 'transactions', 'collection', 'story', 'tezos-x'];

export async function smokeMyTezosLayout(browser, baseUrl, { installFeatureMocks, address, secondAddress, artifactsDir }) {
  for (const [width, height, theme] of [[1440, 1000, 'matrix'], [390, 844, 'clean'], [320, 740, 'default'], [844, 390, 'clean']]) {
    const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block', reducedMotion: 'reduce' });
    try {
      await installFeatureMocks(context);
      await context.addInitScript(({ address, secondAddress, theme }) => {
        localStorage.setItem('tezos-systems-theme', theme);
        localStorage.setItem('tezos-toured', '1');
        localStorage.setItem('tezos-welcomed', '1');
        localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
        localStorage.setItem('tezos-systems-my-baker-address', address);
        localStorage.setItem('tezos-systems-saved-addresses', JSON.stringify([
          { address, label: 'Primary wallet', included: true },
          { address: secondAddress, label: 'Second wallet', included: true }
        ]));
      }, { address, secondAddress, theme });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${baseUrl}/my/`, { waitUntil: 'domcontentloaded' });
      await page.locator('#my-tezos-drawer.open').waitFor();
      await page.waitForFunction(() => document.querySelector('#my-tezos-css')?.sheet && document.querySelector('#drawer-connected')?.offsetHeight > 0);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() => document.querySelector('[data-my-tezos-scope-total="total"] strong')?.textContent.includes('1,500,000'));
      for (const view of VIEWS) {
        await page.locator(`#my-tezos-tab-${view}`).click();
        await page.waitForFunction(view => document.querySelector(`[data-my-tezos-panel="${view}"]`)?.hidden === false, view);
        const geometry = await page.evaluate(view => {
          const body = document.getElementById('drawer-body');
          const panel = document.querySelector(`[data-my-tezos-panel="${view}"]`);
          const tabs = [...document.querySelectorAll('[data-my-tezos-view]')].map(tab => {
            const r = tab.getBoundingClientRect();
            return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, height: r.height, clipped: tab.scrollWidth > tab.clientWidth + 1 };
          });
          const values = [...document.querySelectorAll('.my-tezos-scope-totals strong')].filter(el => el.getBoundingClientRect().width > 0);
          return {
            bodyHeight: body.clientHeight,
            bodyOverflow: body.scrollWidth - body.clientWidth,
            panelOverflow: panel.scrollWidth - panel.clientWidth,
            tabs,
            clippedTotals: values.filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.textContent),
            helpExpanded: document.querySelector('.my-tezos-reading').open,
            panelTop: panel.getBoundingClientRect().top - body.getBoundingClientRect().top
          };
        }, view);
        assert(geometry.bodyHeight >= height * (height < 500 ? 0.47 : 0.6), `${width} ${view}: fixed chrome crowds out reading space ${JSON.stringify(geometry)}`);
        assert(geometry.bodyOverflow <= 1 && geometry.panelOverflow <= 1, `${width} ${view}: horizontal overflow ${JSON.stringify(geometry)}`);
        assert.deepEqual(geometry.clippedTotals, [], `${width}: exact wallet totals must fit`);
        assert(!geometry.helpExpanded, `${view}: shared guide starts collapsed`);
        if (width <= 480) {
          assert(geometry.tabs.every(tab => tab.left >= 0 && tab.right <= width && tab.height >= 44 && !tab.clipped), `${width}: all seven tabs must be visible and readable ${JSON.stringify(geometry.tabs)}`);
        }
        assert(Math.abs(geometry.panelTop) < 30, `${view}: a first visit starts at the panel, without inherited scroll or a repeated guide`);
        if (view === 'transactions') {
          await page.locator('#portfolio-activity-list .portfolio-activity-item').first().waitFor();
          const receipt = await page.locator('#portfolio-activity-list .portfolio-activity-item > a').first().evaluate(el => {
            const r = el.getBoundingClientRect();
            return { width: r.width, height: r.height, color: getComputedStyle(el).color };
          });
          assert(receipt.width >= 44 && receipt.height >= 44 && receipt.color !== 'rgb(0, 0, 238)', 'Source receipt is a readable touch target');
        }
        if (view === 'collection') {
          await page.waitForFunction(() => document.querySelector('#collection-status')?.dataset.state === 'complete');
          const profiles = page.locator('.collection-profile-details');
          await profiles.locator('summary').click();
          assert.equal(await profiles.evaluate(el => el.open), true);
          await page.locator('#collection-profiles').waitFor({ state: 'visible' });
          await profiles.locator('summary').click();
          const columns = await page.locator('#collection-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
          assert.equal(columns, width >= 360 && width <= 760 ? 2 : width < 360 ? 1 : 3);
        }
        if (view === 'tezos-x' && width <= 480) {
          const columns = await page.locator('#tezosx-summary').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
          assert.equal(columns, 2, 'L2 summary does not squeeze four columns onto a phone');
        }
        if (artifactsDir) {
          await mkdir(artifactsDir, { recursive: true });
          await page.evaluate(() => { document.getElementById('drawer-body').scrollTop = 0; });
          await page.screenshot({ path: path.join(artifactsDir, `my-tezos-${width}-${view}.png`) });
        }
      }
      // Each tab owns its reading position, including a second/cached visit.
      await page.locator('#my-tezos-tab-collection').click();
      const collectionScroll = await page.evaluate(() => {
        const body = document.getElementById('drawer-body');
        body.scrollTop = 620;
        return body.scrollTop;
      });
      assert(collectionScroll > 500);
      await page.locator('#my-tezos-tab-transactions').click();
      await page.evaluate(() => { document.getElementById('drawer-body').scrollTop = 160; });
      await page.locator('#my-tezos-tab-collection').click();
      assert.equal(await page.locator('#drawer-body').evaluate(el => el.scrollTop), collectionScroll);
      await page.locator('#my-tezos-tab-transactions').click();
      assert.equal(await page.locator('#drawer-body').evaluate(el => el.scrollTop), 160);
      // Two animation frames are enough to catch a deferred tab restore stomping on a new scroll.
      const immediateScroll = await page.evaluate(async () => {
        document.getElementById('my-tezos-tab-collection').click();
        const body = document.getElementById('drawer-body');
        body.scrollTop = 700;
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return body.scrollTop;
      });
      assert.equal(immediateScroll, 700, 'A reader scroll immediately after tab selection is retained');
      await page.locator('#my-tezos-tab-story').click();
      const storyButton = await page.locator('#my-tezos-story-active-wallet').evaluate(el => ({ width: el.clientWidth, overflow: el.scrollHeight - el.clientHeight }));
      assert(storyButton.width > 100 && storyButton.overflow <= 1, 'Story shortcut must fit its complete label');
      await page.locator('#my-tezos-story-active-wallet').click();
      assert.equal(await page.locator('#my-tezos-wallet-scope').inputValue(), address);
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'my-tezos-story-content', 'Story handoff does not leave focus on its now-hidden button');
      await page.locator('#my-tezos-story-content').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#my-tezos-tab-story').getAttribute('aria-selected'), 'true');
      await page.locator('#my-tezos-tab-story').press('Home');
      assert.equal(await page.locator('#my-tezos-tab-overview').getAttribute('aria-selected'), 'true');
      await page.locator('#my-tezos-tab-overview').press('End');
      assert.equal(await page.locator('#my-tezos-tab-tezos-x').getAttribute('aria-selected'), 'true');
      await page.locator('.my-tezos-reading > summary').click();
      assert.equal(await page.locator('.my-tezos-reading').evaluate(el => el.open), true);
      await page.locator('#my-tezos-reading-verdict').waitFor({ state: 'visible' });
      assert.deepEqual(errors, [], `${width}: no uncaught browser errors`);
    } finally {
      await context.close();
    }
  }
  console.log('ok - My Tezos layouts, disclosures, exact totals, touch targets, Story scope, and per-tab reading positions');
}
