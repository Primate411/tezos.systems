import assert from 'node:assert/strict';

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
