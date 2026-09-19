import assert from 'node:assert/strict';

export async function assertBakerDirectoryContrast(browser, baseUrl, installFeatureMocks) {
  for (const theme of ['clean', 'dark']) {
    const context = await browser.newContext({ serviceWorkers: 'block', reducedMotion: 'reduce' });
    try {
      await installFeatureMocks(context);
      const page = await context.newPage();
      await page.goto(`${baseUrl}/leaderboard/?view=directory&theme=${theme}`, { waitUntil: 'domcontentloaded' });
      await page.locator('.baker-directory-table tbody tr').first().waitFor();
      for (const width of [1440, 390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        const receipts = await page.evaluate(() => {
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = 1;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          const color = value => {
            ctx.clearRect(0, 0, 1, 1);
            ctx.fillStyle = value;
            ctx.fillRect(0, 0, 1, 1);
            return [...ctx.getImageData(0, 0, 1, 1).data].map((v, i) => i === 3 ? v / 255 : v);
          };
          const over = (fg, bg) => fg.slice(0, 3).map((v, i) => v * fg[3] + bg[i] * (1 - fg[3]));
          const luminance = rgb => rgb.reduce((sum, v, i) => {
            const c = v / 255;
            return sum + (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][i];
          }, 0);
          return [...document.querySelectorAll('.baker-directory-header h1, .baker-directory-header p, .baker-directory-header .feature-kicker, .baker-directory-receipt strong, .baker-directory-receipt small, #baker-directory-search-input, .baker-directory-table th')].flatMap(el => {
            const ancestors = [];
            for (let node = el; node; node = node.parentElement) ancestors.unshift(node);
            const bg = ancestors.reduce((back, node) => over(color(getComputedStyle(node).backgroundColor), back), [255, 255, 255]);
            return ['', ...(el.matches('input') ? ['::placeholder'] : [])].map(pseudo => {
              const style = getComputedStyle(el, pseudo || null);
              const foreground = color(style.color);
              foreground[3] *= Number(style.opacity);
              const fg = over(foreground, bg);
              const a = luminance(fg), b = luminance(bg);
              return { text: (el.textContent.trim() || el.getAttribute('placeholder')) + pseudo, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05), foreground: fg, background: bg };
            });
          });
        });
        assert.ok(receipts.length >= 10, `${theme}/${width}: populated Baker Directory contrast targets`);
        assert.ok(receipts.every(receipt => receipt.ratio >= 4.5), `${theme}/${width}: Baker Directory text lacks contrast: ${JSON.stringify(receipts.filter(receipt => receipt.ratio < 4.5))}`);
      }
    } finally { await context.close(); }
  }
}
