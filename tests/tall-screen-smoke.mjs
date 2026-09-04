import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

export async function smokeTallScreen(browser, baseUrl, { installFeatureMocks, artifactsDir }) {
  for (const deviceScaleFactor of [1, 2]) {
    const context = await browser.newContext({
      viewport: { width: 1080, height: 1753 }, deviceScaleFactor,
      hasTouch: deviceScaleFactor === 2,
      reducedMotion: 'reduce', serviceWorkers: 'block'
    });
    await installFeatureMocks(context, { blockHeadAutoAdvance: false });
    await context.addInitScript(() => {
      localStorage.setItem('tezos-systems-theme', 'aurora');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelectorAll('[data-chain-health-level]').length === 25
      && document.querySelector('#live-head-stack .live-head-power-fill'));

    for (const width of [1080, 1440, 901, 900, 762, 390, 320]) {
      await page.setViewportSize({ width, height: width > 760 ? 1753 : 844 });
      await page.locator('#live-head').scrollIntoViewIfNeeded();
      const paint = await page.evaluate(() => {
        const strip = document.getElementById('chain-health-window');
        const label = document.querySelector('.chain-health-label');
        const readout = document.getElementById('chain-health-readout');
        const activityLabel = document.querySelector('.header-activity-cluster-kicker');
        const activity = document.getElementById('header-activity-button').getBoundingClientRect();
        const health = document.getElementById('chain-health').getBoundingClientRect();
        const originalReadout = readout.textContent;
        const originalNodes = [...readout.childNodes];
        const actualCount = readout.querySelector('.chain-health-count');
        const hasReservedNumerator = actualCount && actualCount.textContent === originalReadout.split('/')[0];
        const headings = ['1/25 LOW', '10/25 LOW', '25/25 OK', '25/25 LOW', '25/25 RISK', '25/25 ?', 'STALE', '—'].map(text => {
          const fraction = text.match(/^(\d+)(\/\d+ .+)$/);
          if (fraction) {
            const count = document.createElement('span');
            count.className = 'chain-health-count';
            count.textContent = fraction[1];
            readout.replaceChildren(count, document.createTextNode(fraction[2]));
          } else readout.textContent = text;
          const l = label.getBoundingClientRect();
          const r = readout.getBoundingClientRect();
          const s = strip.getBoundingClientRect();
          const divider = document.querySelector('.chain-health-divider').getBoundingClientRect();
          const dividerX = divider.left + (divider.width - 1) / 2;
          const range = document.createRange();
          range.selectNodeContents(readout);
          const textRight = range.getBoundingClientRect().right;
          return { text, oneLine: Math.abs(l.y - r.y) < 0.5 && l.right <= r.left && r.right <= s.left,
            beforeDivider: dividerX - textRight, afterDivider: s.left - dividerX - 1,
            leftGutter: l.left - health.left, rightGutter: health.right - s.right,
            countWidth: readout.querySelector('.chain-health-count')?.getBoundingClientRect().width,
            readoutWidth: r.width,
            width: s.width, unclipped: readout.scrollWidth <= readout.clientWidth };
        });
        readout.replaceChildren(...originalNodes);
        return {
          headings,
          originalReadout,
          hasReservedNumerator,
          separator: document.querySelector('.chain-health-separator').textContent,
          labelsVisible: label.textContent.trim() === 'Chain health' && activityLabel.textContent.trim() === '1H Activity'
            && getComputedStyle(activityLabel).fontSize === getComputedStyle(label).fontSize
            && activityLabel.getBoundingClientRect().height > 0,
          controlsFit: health.right <= innerWidth && document.documentElement.scrollWidth <= innerWidth
            && (innerWidth <= 900 ? activity.bottom <= health.top : activity.right <= health.left),
          activityOverflow: document.getElementById('header-activity-line').scrollWidth - document.getElementById('header-activity-line').clientWidth,
          touchTargetsFit: !matchMedia('(pointer: coarse)').matches || ['chain-health', 'header-activity-button', 'live-head-filter-toggle'].every(id => {
            const button = document.getElementById(id);
            const box = button.getBoundingClientRect();
            const x = box.x + box.width / 2;
            const y = box.y + box.height / 2;
            return [-21, 21].every(dy => document.elementFromPoint(x, y + dy)?.closest('button') === button);
          }),
          stripWidth: strip.getBoundingClientRect().width,
          bars: [...strip.querySelectorAll('[data-chain-health-level]')].map(el => {
            const rect = el.getBoundingClientRect();
            const ink = getComputedStyle(el, '::before');
            return { width: rect.width, height: parseFloat(ink.height), left: ink.left, right: ink.right, radius: ink.borderRadius };
          }),
          rails: [...document.querySelectorAll('.live-head-power-track')].map(el => {
            const fill = el.querySelector('.live-head-power-fill');
            const label = el.querySelector('.live-head-margin');
            const fillStyle = getComputedStyle(fill);
            const rect = el.getBoundingClientRect();
            const labelRect = label.getBoundingClientRect();
            return {
              height: rect.height, transform: fillStyle.transform,
              error: Math.abs(parseFloat(fillStyle.width) - el.clientWidth * Number(fillStyle.getPropertyValue('--live-head-margin'))),
              labelHeight: labelRect.height,
              contained: labelRect.left >= rect.left && labelRect.right <= rect.right
                && labelRect.top >= rect.top && labelRect.bottom <= rect.bottom
            };
          })
        };
      });
      assert.match(paint.originalReadout, /^\d+\/25 (OK|LOW|RISK|\?)$/, 'live status uses a count out of 25');
      assert(paint.hasReservedNumerator, 'live render reserves only the two-digit numerator');
      assert.equal(paint.separator, '•');
      assert(paint.labelsVisible && paint.controlsFit, `${width}/${deviceScaleFactor}x: matching full labels fit`);
      assert(paint.activityOverflow <= 1, `${width}/${deviceScaleFactor}x: Activity metrics are not clipped`);
      assert(paint.touchTargetsFit, `${width}/${deviceScaleFactor}x: 44px touch targets do not overlap other controls or rows`);
      assert(paint.headings.every(h => h.oneLine && h.unclipped && h.width === paint.stripWidth), JSON.stringify(paint.headings));
      assert(paint.headings.every(h => h.beforeDivider >= 5.9 && Math.abs(h.beforeDivider - h.afterDivider) < 0.1
        && Math.abs(h.leftGutter - h.rightGutter) < 0.1), `balanced inner and outer gutters: ${JSON.stringify(paint.headings)}`);
      assert.equal(paint.headings[0].countWidth, paint.headings[1].countWidth, 'one and two digits share the same numerator slot');
      assert.equal(paint.headings[0].readoutWidth, paint.headings[1].readoutWidth, 'count changes do not move the divider or bars');
      assert(paint.stripWidth >= 75, `${width}/${deviceScaleFactor}x: all lines remain legible`);
      assert.equal(paint.stripWidth % 25, 0, `${width}/${deviceScaleFactor}x: whole-pixel line slots`);
      assert.equal(paint.bars.length, 25);
      assert(paint.bars.every(bar => Number.isInteger(bar.width) && Number.isInteger(bar.height)
        && bar.left === '0px' && bar.right === '1px' && bar.radius === '0px'), JSON.stringify(paint.bars));
      assert(paint.rails.length > 0);
      assert(paint.rails.every(rail => rail.height === 16 && rail.transform === 'none'
        && rail.error < 0.05 && rail.labelHeight === 12 && rail.contained), JSON.stringify(paint.rails));
      if (artifactsDir && [1080, 390].includes(width)) {
        await mkdir(artifactsDir, { recursive: true });
        await page.locator('#live-head').screenshot({ path: path.join(artifactsDir, `live-head-${width}-${deviceScaleFactor}x.png`) });
      }
    }

    for (const [hash, size, maxWidth] of [['health', 'standard', 1180], ['staking', 'narrow', 900], ['ecosystem', 'wide', 1480]]) {
      await page.goto(`${baseUrl}#${hash}`, { waitUntil: 'domcontentloaded' });
      const room = page.locator('.chamber-overlay.active .chamber-room-shell');
      await room.waitFor({ state: 'visible' });
      for (const { width, height } of [
        { width: 1080, height: 1753 }, { width: 1440, height: 1900 },
        { width: 390, height: 844 }, { width: 320, height: 844 }
      ]) {
        await page.setViewportSize({ width, height });
        await page.waitForFunction(() => {
          const el = document.querySelector('.chamber-overlay.active .chamber-room-shell');
          return el && Math.abs(el.getBoundingClientRect().height - (innerHeight - (innerWidth < 760 ? 0 : 32))) < 1;
        });
        const geometry = await room.evaluate(el => {
          const rect = el.getBoundingClientRect();
          return { size: el.dataset.roomSize, x: rect.x, y: rect.y, width: rect.width, height: rect.height,
            overflow: document.documentElement.scrollWidth - innerWidth };
        });
        const margin = width < 760 ? 0 : 16;
        assert.equal(geometry.size, size);
        assert(Math.abs(geometry.width - Math.min(width - margin * 2, width < 760 ? width : maxWidth)) < 1, JSON.stringify(geometry));
        assert(Math.abs(geometry.y - margin) < 1 && geometry.overflow <= 1, JSON.stringify(geometry));
        if (artifactsDir && width === 1080) {
          await mkdir(artifactsDir, { recursive: true });
          await page.screenshot({ path: path.join(artifactsDir, `tall-${hash}-${deviceScaleFactor}x.png`) });
        }
      }
      // Still a scrollable room, not a stretched/scaled copy of its content.
      await room.evaluate(el => {
        const scroller = el.matches('.chamber-room-scroll') ? el : el.querySelector('.chamber-room-scroll');
        scroller.scrollTop = 120;
      });
      assert(await room.evaluate(el => {
        const scroller = el.matches('.chamber-room-scroll') ? el : el.querySelector('.chamber-room-scroll');
        return scroller.scrollTop > 0;
      }), `${hash}: inner scrolling remains available`);
      await page.keyboard.press('Escape');
      await room.waitFor({ state: 'hidden' });
    }
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`ok - full-height standard/narrow/wide Chambers and unscaled health rendering at ${deviceScaleFactor}x`);
  }
}
