import assert from 'node:assert/strict';

// Regression for Playwright's smooth-scroll retry bug, fixed upstream in 1.64:
// https://github.com/microsoft/playwright/pull/42626
export async function assertInstantPointerRetryScroll(browser) {
  const context = await browser.newContext({ viewport: { width: 900, height: 1000 } });
  try {
    const page = await context.newPage();
    // The first centered click is obscured, requiring real hit testing and the
    // runner's alternate scroll alignment. Keep the page's smooth-scroll CSS.
    await page.setContent(`<!doctype html><style>
      html { scroll-behavior: smooth; }
      body { margin: 0; }
      .spacer { height: 2000px; }
      #cover { position: fixed; inset: 0 0 50px; background: #ddd; }
      button { height: 30px; }
    </style>
    <div id="cover"></div><div class="spacer"></div>
    <button id="target">Open explanation</button><div class="spacer"></div>
    <script>
      window.receipt = { clicks: 0, scrolls: [] };
      target.addEventListener('click', () => window.receipt.clicks++);
      addEventListener('scroll', () => window.receipt.scrolls.push(scrollY));
    </script>`);
    await page.locator('#target').click({ timeout: 10000 });
    const receipt = await page.evaluate(() => ({
      ...window.receipt,
      scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior
    }));
    assert.equal(receipt.clicks, 1, 'pointer retry must reach the intended control once');
    assert.equal(receipt.scrollBehavior, 'smooth', 'the fixture must retain normal smooth scrolling');
    assert(receipt.scrolls.length <= 2,
      `pointer preparation must use instant jumps, not a scroll animation: ${JSON.stringify(receipt)}`);
  } finally {
    await context.close();
  }
}
