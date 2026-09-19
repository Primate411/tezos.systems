import assert from 'node:assert/strict';

export async function assertUraniumCaptionClear(page) {
  const original = page.viewportSize();
  try {
    for (const width of [1440, 1280, 1024, 940, 900, 768, 720, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(() => document.fonts.ready);
      const receipt = await page.locator('.uranium-hero-panel').evaluate(panel => {
        const caption = panel.querySelector('figcaption');
        const bounds = caption.getBoundingClientRect();
        const walker = document.createTreeWalker(panel.querySelector('.uranium-hero-copy'), NodeFilter.SHOW_TEXT);
        const overlaps = [];
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (!node.textContent.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          if ([...range.getClientRects()].some(rect => Math.min(rect.right, bounds.right) - Math.max(rect.left, bounds.left) > 1
            && Math.min(rect.bottom, bounds.bottom) - Math.max(rect.top, bounds.top) > 1)) overlaps.push(node.textContent.trim());
        }
        return { caption: caption.textContent, width: bounds.width, height: bounds.height, overlaps };
      });
      assert.ok(receipt.caption.includes('yellowcake') && receipt.width > 0 && receipt.height > 0, `${width}: Uranium artwork disclosure must remain visible`);
      assert.deepEqual(receipt.overlaps, [], `${width}: Uranium artwork caption overlaps hero copy: ${JSON.stringify(receipt)}`);
    }
  } finally { await page.setViewportSize(original); }
}
