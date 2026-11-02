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
      assert.deepEqual(words.map(({ word }) => word), ['Every', 'precious', 'metal.', 'No', 'synthetic', 'completeness.'], `${width}: populated Metals headline`);
      assert.ok(words.every(word => word.lines === 1 && word.contained), `${width}: Metals headline splits or clips a word: ${JSON.stringify(words)}`);
      const captions = await page.locator('.metals-hero-metrics small').evaluateAll(labels => labels.map(label => {
        const bounds = label.parentElement.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(label);
        return {
          text: label.textContent,
          fontSize: parseFloat(getComputedStyle(label).fontSize),
          contained: [...range.getClientRects()].every(rect => rect.left >= bounds.left + 4 && rect.right <= bounds.right - 4 && rect.bottom <= bounds.bottom - 4)
        };
      }));
      assert.ok(captions.length >= 4, `${width}: populated Metals source-status captions`);
      assert.ok(captions.every(caption => caption.fontSize >= 11 && caption.contained), `${width}: Metals source-status captions are too small or clipped: ${JSON.stringify(captions)}`);
    }
  } finally {
    await page.setViewportSize(original);
  }
}
