import assert from 'node:assert/strict';

export async function assertMetalsHeadingWords(page) {
  const original = page.viewportSize();
  try {
    for (const width of [1440, 1280, 1024, 900, 768, 720, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(() => document.fonts.ready);
      const words = await page.locator('.metals-hero-copy h3').evaluate(heading => {
        const node = heading.firstChild;
        const bounds = heading.getBoundingClientRect();
        return [...node.textContent.matchAll(/\S+/g)].map(match => {
          const range = document.createRange();
          range.setStart(node, match.index);
          range.setEnd(node, match.index + match[0].length);
          const rects = [...range.getClientRects()];
          return {
            word: match[0], lines: new Set(rects.map(rect => Math.round(rect.top))).size,
            contained: rects.every(rect => rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1)
          };
        });
      });
      assert.ok(words.length >= 6, `${width}: populated Metals headline`);
      assert.ok(words.every(word => word.lines === 1 && word.contained), `${width}: Metals headline splits or clips a word: ${JSON.stringify(words)}`);
    }
  } finally {
    await page.setViewportSize(original);
  }
}
