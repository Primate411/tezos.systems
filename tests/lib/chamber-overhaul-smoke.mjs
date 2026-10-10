import assert from 'node:assert/strict';

// Exercise populated rooms and measure the rendered result, including the first
// paint after a breakpoint change. A delayed measurement hid the exit overflow.
export async function smokeChamberOverhaul(browser, baseUrl, installFeatureMocks) {
  const failures = [];
  const check = (condition, message) => { if (!condition) failures.push(message); };
  const open = async route => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
    await installFeatureMocks(context, { ledgerFlowMocks: true, whaleChamberMocks: true });
    await context.addInitScript(() => {
      localStorage.setItem('tezos-systems-theme', 'clean');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      // Register before app initialization so the first frame cannot be hidden
      // by an observer that repairs the geometry one frame too late.
      window.__exitFrames = [];
      addEventListener('resize', () => requestAnimationFrame(() => {
        const room = document.querySelector('.chamber-room-shell');
        const close = room?.querySelector(':scope > .chamber-close, :scope > .modal-close');
        if (close) window.__exitFrames.push({
          width: innerWidth, overflow: room.scrollWidth - room.clientWidth,
          inset: room.getBoundingClientRect().right - close.getBoundingClientRect().right
        });
      }));
    });
    const page = await context.newPage();
    await page.goto(`${baseUrl}/${route}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
      const room = document.querySelector('.chamber-room-shell');
      return room && /\d/.test(room.querySelector('.chamber-reading-copy > p')?.textContent || '')
        && !room.querySelector('[aria-busy="true"]');
    });
    await page.evaluate(() => document.fonts.ready);
    return { context, page };
  };

  for (const route of ['ledger-flow', 'l2chamber', 'maxis']) {
    const { context, page } = await open(route);
    try {
      for (const width of [390, 1440, 320, 1440]) {
        const count = await page.evaluate(() => window.__exitFrames.length);
        await page.setViewportSize({ width, height: 900 });
        await page.waitForFunction(count => window.__exitFrames.length > count, count);
      }
      const frames = await page.evaluate(() => window.__exitFrames);
      check(frames.length >= 4 && frames.every(frame => frame.overflow <= 1 && Math.abs(frame.inset - 13) <= 1),
        `${route}: close button must fit at the shared inset on the first resize frame: ${JSON.stringify(frames)}`);
      if (route !== 'maxis') continue;
      await page.locator('.maxis-identity-card').first().waitFor();
      for (const width of [1440, 390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        const target = page.locator('.maxis-room-intro p');
        await target.scrollIntoViewIfNeeded();
        const receipt = await target.evaluate(node => {
          const box = node.getBoundingClientRect();
          return { color: getComputedStyle(node).color, x: box.x, y: box.y, width: box.width, height: box.height };
        });
        // Sample the real gradient behind the paragraph with only its ink
        // hidden. This covers layered backgrounds without hard-coding a color.
        const style = await page.addStyleTag({ content: '.maxis-room-intro p { color: transparent !important; text-shadow: none !important; }' });
        const background = (await page.screenshot()).toString('base64');
        await style.evaluate(node => node.remove());
        const ratio = await page.evaluate(async ({ receipt, background }) => {
          const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
          canvas.width = innerWidth; canvas.height = innerHeight;
          const image = new Image(); image.src = 'data:image/png;base64,' + background; await image.decode();
          ctx.drawImage(image, 0, 0);
          const lum = rgb => rgb.slice(0, 3).reduce((sum, v, i) => {
            const c = v / 255;
            return sum + (c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][i];
          }, 0);
          const samples = [.15, .5, .85].map(fraction => lum([...ctx.getImageData(
            Math.floor(receipt.x + receipt.width * fraction), Math.floor(receipt.y + receipt.height / 2), 1, 1).data]));
          ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = receipt.color; ctx.fillRect(0, 0, 1, 1);
          const fg = lum([...ctx.getImageData(0, 0, 1, 1).data]);
          return Math.min(...samples.map(bg => (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05)));
        }, { receipt, background });
        check(ratio >= 4.5, `Maxis Clean ${width}px: intro contrast ${ratio.toFixed(2)}:1 must be at least 4.5:1`);
      }
    } finally { await context.close(); }
  }

  for (const route of ['metals', 'uranium']) {
    const { context, page } = await open(route);
    try {
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        const badge = page.locator(`#${route}-freshness`);
        // A supported degraded receipt label must fit at its natural width.
        // Its line count differs with host fonts, so constrain a second case
        // in character units to exercise wrapping on every browser host.
        for (const constrained of [false, true]) {
          const geometry = await badge.evaluate((node, constrained) => {
            node.textContent = 'Stale snapshot · indicative current observations unavailable';
            node.style.maxInlineSize = constrained ? '24ch' : '';
            const box = node.getBoundingClientRect(), range = document.createRange();
            range.selectNodeContents(node);
            const lines = [...range.getClientRects()];
            return { height: box.height, lines: lines.length, fits: lines.every(line =>
              line.top >= box.top - 1 && line.bottom <= box.bottom + 1 && line.left >= box.left - 1 && line.right <= box.right + 1) };
          }, constrained);
          check(geometry.fits && (!constrained || geometry.lines > 1),
            `${route} ${width}px: ${constrained ? 'wrapped' : 'natural'} status must stay inside its badge: ${JSON.stringify(geometry)}`);
        }
      }
    } finally { await context.close(); }
  }
  assert.deepEqual(failures, [], 'Chamber overhaul rendered regressions');
}
