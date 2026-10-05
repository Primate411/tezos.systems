// Initial hydration can move a target after the caller scrolls to it. Keep
// preparing that explicit click until geometry settles; never bypass hit testing.
export async function waitForStableClickTarget(page, selector, label) {
  await page.waitForFunction(targetSelector => {
    const info = document.querySelector(targetSelector);
    if (!info) return false;
    const box = info.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) {
      delete info.__smokeClickGeometry;
      return false;
    }
    if (box.left < 0 || box.top < 0 || box.right > innerWidth || box.bottom > innerHeight) {
      delete info.__smokeClickGeometry;
      info.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
      return false;
    }
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    if (!hit || !info.contains(hit)) {
      delete info.__smokeClickGeometry;
      return false;
    }
    const signature = [box.x, box.y, box.width, box.height, window.scrollY].join(':');
    const previous = info.__smokeClickGeometry;
    if (previous?.signature !== signature) {
      info.__smokeClickGeometry = { signature, since: performance.now() };
      return false;
    }
    if (performance.now() - previous.since < 250) return false;
    delete info.__smokeClickGeometry;
    return true;
  }, selector, { timeout: 10000 }).catch(async error => {
    const state = await page.locator(selector).evaluate(info => {
      const box = info.getBoundingClientRect();
      return {
        box: box.toJSON(), scrollY: window.scrollY,
        viewport: [innerWidth, innerHeight],
        hit: document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.outerHTML,
        animations: info.getAnimations().map(animation => animation.playState)
      };
    }).catch(() => ({ missing: true }));
    throw new Error(`${label}: ${selector} click target did not settle: ${JSON.stringify(state)}`, { cause: error });
  });
}
