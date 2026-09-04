import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

export async function chooseLiveHeadDepth(page, mode, source = 'corner') {
  const control = page.locator(`[data-live-head-depth-control="${source}"]`);
  const opener = control.locator('button[aria-controls]');
  await opener.click();
  await control.locator(`[data-live-head-depth-mode="${mode}"]`).click();
}

export async function checkLiveHeadDepthChevron(opener) {
  await opener.hover();
  const measure = () => opener.evaluate(el => {
    const icon = el.querySelector('.live-head-depth-chevron');
    const buttonBox = el.getBoundingClientRect();
    const iconBox = icon.getBoundingClientRect();
    const style = getComputedStyle(el);
    const transform = new DOMMatrix(getComputedStyle(icon).transform);
    return {
      x: iconBox.x + iconBox.width / 2 - buttonBox.x - buttonBox.width / 2,
      y: iconBox.y + iconBox.height / 2 - buttonBox.y - buttonBox.height / 2,
      borders: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth],
      background: style.backgroundColor, shadow: style.boxShadow,
      direction: transform.a, icons: el.querySelectorAll('svg').length
    };
  });
  const closed = await measure();
  await opener.click();
  const open = await measure();
  for (const state of [closed, open]) {
    assert(state.borders.every(width => width === '0px'), 'chevron stays borderless even when hovered');
    assert.equal(state.background, 'rgba(0, 0, 0, 0)');
    assert.equal(state.shadow, 'none');
    assert.equal(state.icons, 1, 'one chevron is reused in both states');
    assert(Math.abs(state.x) < 0.1 && Math.abs(state.y) < 0.1, `chevron stays centered: ${JSON.stringify(state)}`);
  }
  assert.equal(closed.direction, 1, 'closed chevron points down');
  assert.equal(open.direction, -1, 'open chevron points up');
  await opener.click();
}

export async function smokeLiveHeadDepth(browser, baseUrl, { installFeatureMocks, artifactsDir }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  await installFeatureMocks(context, { blockHeadAutoAdvance: false });
  let head = 12345678;
  let failBlocks = false;
  await context.route('**/v1/blocks?**', (route) => {
    const params = new URL(route.request().url()).searchParams;
    if (params.get('limit') !== '26' || !params.get('select')?.includes('attestationCommittee')) return route.fallback();
    if (failBlocks) return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(Array.from({ length: 26 }, (_, i) => ({
      level: head - i, cycle: 1143, proto: 25, timestamp: new Date(Date.now() - i * 6000).toISOString(),
      producer: { address: 'tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb', alias: 'QA Baker' },
      attestationPower: 7000, attestationCommittee: 7000, blockRound: 0, payloadRound: 0
    }))) });
  });
  await context.addInitScript(() => {
    localStorage.setItem('tezos-systems-theme', 'aurora');
    localStorage.setItem('tezos-toured', '1');
    localStorage.setItem('tezos-welcomed', '1');
    localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
  });
  let page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  let rows = page.locator('#live-head-stack [data-live-head-level]');
  let corner = page.locator('#live-head-depth-toggle');
  let menu = page.locator('#live-head-depth-menu');
  let input = page.locator('#live-head-depth-rows');
  const waitRows = n => page.waitForFunction(count =>
    document.querySelectorAll('#live-head-stack [data-live-head-level]').length === count, n);
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('tezos-systems-live-head-depth-v1')));
  const refresh = () => page.evaluate(async () => {
    const { versionedAsset } = await import('/js/core/asset-version.js');
    const { refreshNetworkHealth } = await import(versionedAsset('/js/features/network-health.js'));
    await refreshNetworkHealth();
  });
  await waitRows(4);
  await checkLiveHeadDepthChevron(corner);
  assert.equal(await menu.evaluate(el => el.matches(':popover-open')), false, 'clicking the chevron again closes it');
  await corner.click();
  await page.locator('#settings-gear').click();
  assert.equal(await menu.evaluate(el => el.matches(':popover-open')), false, 'outside click dismisses the menu');
  await page.locator('#settings-gear').click();
  await page.evaluate(() => { window.__depthFirst = document.querySelector('#live-head-stack [data-live-head-level]'); });
  for (const mode of ['10', '15', '20']) {
    await chooseLiveHeadDepth(page, mode);
    await waitRows(Number(mode));
    assert.equal(await page.locator('#live-head-depth-setting').getAttribute('data-depth-mode'), mode);
    assert.equal((await stored()).mode, mode);
    assert(await page.evaluate(() => window.__depthFirst === document.querySelector('#live-head-stack [data-live-head-level]')));
    assert(await rows.evaluateAll(elements => elements.every((row, i) => !i
      || Number(elements[i - 1].dataset.liveHeadLevel) > Number(row.dataset.liveHeadLevel))));
  }
  await corner.click();
  assert.equal(await input.inputValue(), '', 'fifth option starts blank');
  assert.equal(await menu.locator(':scope > button').count(), 4, 'four presets plus the number field');
  assert.equal(await menu.locator('[data-live-head-depth-mode="compact"]').innerText(), '4 blocks');
  assert(await corner.locator('[data-live-head-depth-count]').evaluate(el => el.classList.contains('sr-only')),
    'closed control exposes its count to assistive technology, not as visible text');
  const heights = await menu.evaluate(el => ({
    preset: el.querySelector('[data-live-head-depth-mode="10"]').getBoundingClientRect().height,
    custom: el.querySelector('form').getBoundingClientRect().height
  }));
  assert.equal(heights.custom, heights.preset, 'custom entry must match a preset row height');
  const steps = await menu.locator('[data-live-head-depth-step]').evaluateAll(elements => elements.map(el => {
    const r = el.getBoundingClientRect(); return { top: r.top, left: r.left, bottom: r.bottom };
  }));
  assert(steps[0].bottom <= steps[1].top && steps[0].left === steps[1].left, 'plus must sit above minus');
  await input.fill('17');
  await input.press('Enter');
  await waitRows(17);
  assert.deepEqual(await stored(), { version: 2, mode: 'custom', customRows: 17 });
  assert.equal(await page.locator('#live-head-depth-setting-rows').inputValue(), '17');
  await corner.click();
  const menuTop = await menu.evaluate(el => el.getBoundingClientRect().top);
  await menu.locator('[data-live-head-depth-step="1"]').click();
  await waitRows(18);
  await menu.locator('[data-live-head-depth-step="-1"]').click();
  await waitRows(17);
  assert.equal(await menu.evaluate(el => el.getBoundingClientRect().top), menuTop, 'stepper must not move away');
  for (const invalid of ['', '0', '26', '1.5']) {
    await input.fill(invalid);
    await input.press('Enter');
    assert.equal(await rows.count(), 17);
    assert.equal((await stored()).customRows, 17);
    assert.equal(await input.evaluate(el => el.validity.valid), false, `reject invalid custom input: ${invalid}`);
  }
  await input.fill('25');
  await input.press('Enter');
  await waitRows(25);
  await corner.click();
  await menu.locator('[data-live-head-depth-step="1"]').click();
  await waitRows(25);
  await input.fill('1');
  await input.press('Enter');
  await waitRows(1);
  await corner.click();
  await menu.locator('[data-live-head-depth-step="-1"]').click();
  await waitRows(1);
  await page.keyboard.press('Escape');
  assert.equal(await corner.getAttribute('aria-expanded'), 'false', 'Escape closes the depth menu');
  assert(await corner.evaluate(el => document.activeElement === el));
  console.log('ok - depth presets, blank custom field, bounds, stepper, and Escape');

  // Setup has the identical four presets and custom stepper.
  await page.locator('#settings-gear').click();
  await checkLiveHeadDepthChevron(page.locator('#live-head-depth-setting'));
  await chooseLiveHeadDepth(page, '15', 'setup');
  await waitRows(15);
  await page.locator('#live-head-depth-setting').click();
  const settingsMenu = page.locator('#live-head-depth-settings-menu');
  const settingsInput = page.locator('#live-head-depth-setting-rows');
  assert.equal(await settingsInput.inputValue(), '');
  await settingsInput.fill('13');
  await settingsMenu.locator('[data-live-head-depth-step="1"]').click();
  await waitRows(14);
  assert.equal(await input.inputValue(), '14');
  await page.keyboard.press('Escape');
  await page.locator('#settings-gear').click();

  // Refresh retains the editor's draft, focus, popup geometry and keyed rows.
  console.log('ok - Setup depth and stepper synchronization');
  await corner.click();
  await input.fill('19');
  await page.evaluate(() => {
    window.__depthQuiet = {
      row: document.querySelector('#live-head-stack [data-live-head-level]'),
      scroll: scrollY,
      menuTop: document.getElementById('live-head-depth-menu').getBoundingClientRect().top
    };
  });
  await refresh();
  assert.equal(await input.inputValue(), '19');
  assert.equal(await rows.count(), 14, 'unfinished draft must not apply on refresh');
  assert(await page.evaluate(() => document.activeElement === document.getElementById('live-head-depth-rows')
    && window.__depthQuiet.row === document.querySelector('#live-head-stack [data-live-head-level]')
    && scrollY === window.__depthQuiet.scroll
    && document.getElementById('live-head-depth-menu').getBoundingClientRect().top === window.__depthQuiet.menuTop));
  await input.press('Enter');
  await waitRows(19);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitRows(19);
  assert.equal(await corner.getAttribute('data-depth-mode'), 'custom');

  // Cross-tab settings, legacy migration, and malformed saved settings.
  const other = await context.newPage();
  await other.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await other.evaluate(() => localStorage.setItem('tezos-systems-live-head-depth-v1', JSON.stringify({ version: 2, mode: '20', customRows: 19 })));
  await waitRows(20);
  await other.close();
  await page.evaluate(() => localStorage.setItem('tezos-systems-live-head-depth-v1', JSON.stringify({ version: 1, expanded: true })));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitRows(10);
  await page.evaluate(() => localStorage.setItem('tezos-systems-live-head-depth-v1', JSON.stringify({ version: 2, mode: 'custom', customRows: 999 })));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitRows(4);
  console.log('ok - quiet draft, reload, cross-tab, and legacy depth preferences');

  // Real rendered theme/viewport checks, with tall-monitor and mobile captures.
  // Isolate visual module imports from the preceding reload/migration lifecycle.
  await page.close();
  page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  rows = page.locator('#live-head-stack [data-live-head-level]');
  corner = page.locator('#live-head-depth-toggle');
  menu = page.locator('#live-head-depth-menu');
  input = page.locator('#live-head-depth-rows');
  await waitRows(4);
  const themes = ['aurora', 'matrix', 'hen', 'default', 'void', 'ember', 'signal', 'nerv', 'clean', 'dark', 'bubblegum', 'abyss', 'moss', 'valley', 'warzone'];
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1900 : 844 });
    await chooseLiveHeadDepth(page, '20');
    await waitRows(20);
    await corner.click();
    for (const theme of themes) {
      await page.evaluate(async name => {
        const { setTheme } = await import('/js/ui/theme.js');
        setTheme(name);
      }, theme);
      await page.waitForFunction(name => Boolean(document.getElementById(`theme-css-${name}`)?.sheet), theme);
      const geometry = await page.evaluate(() => {
        const popover = document.getElementById('live-head-depth-menu');
        const r = popover.getBoundingClientRect();
        const style = getComputedStyle(popover);
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width,
          overflow: document.documentElement.scrollWidth - innerWidth,
          labelOverflow: Math.max(...[...popover.querySelectorAll('[data-live-head-depth-mode]')].map(el => el.scrollWidth - el.clientWidth)),
          background: style.backgroundColor };
      });
      assert(geometry.left >= 0 && geometry.right <= width && geometry.top >= 0
        && geometry.bottom <= (width === 1440 ? 1900 : 844) && geometry.overflow <= 1
        && geometry.width <= 120 && geometry.labelOverflow <= 1,
      `${theme} / ${width}: depth selector overflow ${JSON.stringify(geometry)}`);
      assert(!geometry.background.includes('rgba'), `${theme}: popup must be opaque`);
      if (artifactsDir && ['aurora', 'clean'].includes(theme) && width !== 320) {
        await mkdir(artifactsDir, { recursive: true });
        await page.screenshot({ path: path.join(artifactsDir, `live-depth-${theme}-${width}.png`) });
      }
    }
    await page.keyboard.press('Escape');
    await chooseLiveHeadDepth(page, 'compact');
    await waitRows(width < 720 ? 3 : 4);
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await chooseLiveHeadDepth(page, '20');
  await waitRows(20);
  head += 1;
  await refresh();
  await page.waitForFunction(level => Number(document.querySelector('#live-head-stack [data-live-head-level]')?.dataset.liveHeadLevel) === level, head);
  assert.equal(await rows.count(), 20);
  assert(await rows.evaluateAll(elements => elements.every(el => getComputedStyle(el).opacity === '1')));
  failBlocks = true;
  await refresh();
  assert.equal(await rows.count(), 20, 'failed refresh must retain the selected last-good rows');
  assert.deepEqual(errors, []);
  await context.close();
}
