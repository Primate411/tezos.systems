import assert from 'node:assert/strict';

/** A supplemental receipt must update an existing inspector trigger in place. */
export async function checkInspectorTriggerRefresh(browser, baseUrl, { installFeatureMocks }) {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      serviceWorkers: 'block'
    });
    let releaseGas;
    const gasReady = new Promise(resolve => { releaseGas = resolve; });
    try {
      await installFeatureMocks(context, { blockHeadAutoAdvance: false });
      await context.route(/\/chains\/main\/blocks\/12345678\/operations\/3(?:\?|$)/, async route => {
        await gasReady;
        await route.fallback();
      });
      await context.addInitScript(() => {
        localStorage.setItem('tezos-systems-theme', 'matrix');
        localStorage.setItem('tezos-toured', '1');
        localStorage.setItem('tezos-welcomed', '1');
        localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
      });
      const page = await context.newPage();
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await page.evaluate(async () => {
        const { versionedAsset } = await import('/js/core/asset-version.js');
        const { initNetworkHealth } = await import(versionedAsset('/js/features/network-health.js'));
        initNetworkHealth();
      });
      const rowSelector = '#live-head-stack .live-head-row[data-live-head-level="12345678"]';
      await page.locator(rowSelector).waitFor({ state: 'visible' });
      const before = await page.locator(rowSelector).evaluate(row => {
        window.__inspectorRefreshRow = row;
        window.__inspectorRefreshTrigger = row.querySelector('.live-head-info');
        return {
          label: window.__inspectorRefreshTrigger.getAttribute('aria-label'),
          gas: row.dataset.gasState
        };
      });
      assert.notEqual(before.gas, 'resolved', 'gas receipt must still be held before the identity check');
      releaseGas();
      await page.waitForFunction(selector => document.querySelector(selector)?.dataset.gasState === 'resolved', rowSelector);
      const after = await page.locator(rowSelector).evaluate(row => ({
        sameRow: row === window.__inspectorRefreshRow,
        sameTrigger: row.querySelector('.live-head-info') === window.__inspectorRefreshTrigger,
        label: row.querySelector('.live-head-info').getAttribute('aria-label')
      }));
      assert.notEqual(after.label, before.label, 'the completed gas receipt must update the accessible block description');
      assert(after.sameRow && after.sameTrigger,
        `Live Head ${width}px: supplemental receipt replaced the inspector trigger ${JSON.stringify({ before, after })}`);
      await page.locator(`${rowSelector} .live-head-info`).focus();
      await page.locator('#live-head-inspector:not([hidden])[data-live-head-level="12345678"]').waitFor({ state: 'visible' });
    } finally {
      releaseGas();
      await context.close();
    }
  }
}

/** Reproduce the exact pending-opener/receipt-focus race with real input. */
export async function checkInspectorKeyboardReceipt(browser, baseUrl) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  try {
    await context.route('**/smoke-inspector-focus-fixture', route => route.fulfill({
      contentType: 'text/html',
      body: '<button id="opener">Open</button><aside><a id="first" href="#first">First receipt</a><a id="second" href="#second">Second receipt</a></aside><div id="overlay"><div role="dialog"><button>Close</button></div></div>'
    }));
    const page = await context.newPage();
    await page.goto(`${baseUrl}/smoke-inspector-focus-fixture`);
    await page.evaluate(async () => {
      const overlays = await import('/js/ui/overlay-stack.js');
      const frames = [];
      window.requestAnimationFrame = callback => frames.push(callback);
      window.__inspectorFixtureFrame = () => {
        const pending = frames.splice(0);
        pending.forEach(callback => callback(performance.now()));
      };
      window.__inspectorFixtureClose = () => {
        const overlay = document.getElementById('overlay');
        overlay.hidden = false;
        overlays.activateOverlayDialog(overlay, { close() {}, opener: document.getElementById('opener') });
        window.__inspectorFixtureFrame();
        overlays.deactivateOverlayDialog(overlay);
        overlay.hidden = true;
      };
    });
    await page.evaluate(() => {
      window.__inspectorFixtureClose();
      document.getElementById('first').focus();
      window.__inspectorFixtureFrame();
    });
    assert.equal(await page.evaluate(() => document.activeElement.id), 'opener',
      'synthetic focus must reproduce the pending Chamber opener restoration');
    await page.evaluate(() => window.__inspectorFixtureClose());
    await page.locator('#first').press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'second',
      'trusted keyboard navigation must enter the next receipt');
    await page.evaluate(() => {
      for (let frame = 0; frame < 24; frame += 1) window.__inspectorFixtureFrame();
    });
    assert.equal(await page.evaluate(() => document.activeElement.id), 'second',
      'the complete pending restore window must honor the reader keyboard input');
  } finally {
    await context.close();
  }
}
