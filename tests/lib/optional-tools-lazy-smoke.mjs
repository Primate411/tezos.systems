import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const OPTIONAL_PATHS = ['/js/ui/share-renderer.js', '/js/features/calculator.js', '/js/features/comparison.js', '/js/features/state-of-tezos.js', '/js/features/native-explorer.js'];
async function openMenu(page, name) {
  if (!await page.locator(`#${name}-dropdown`).evaluate(node => node.classList.contains('open'))) await page.locator(`#${name}-gear`).click();
}
async function closeShare(page) {
  await page.locator('#share-modal .share-modal-close').click();
  await page.locator('#share-modal').waitFor({ state: 'detached' });
}

export async function smokeOptionalToolsLazy(browser, baseUrl, { installFeatureMocks, clickFeatureLauncher, artifactsDir } = {}) {
  if (artifactsDir) await mkdir(artifactsDir, { recursive: true });
  for (const [width, theme] of [[1440, 'matrix'], [390, 'clean']]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
    await installFeatureMocks(context);
    await context.addInitScript(theme => {
      localStorage.setItem('tezos-systems-theme', theme);
      localStorage.setItem('tezos-toured', '1'); localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
      localStorage.removeItem('tezos-systems-calc-visible'); localStorage.removeItem('tezos-systems-comparison-visible');
    }, theme);
    let rendererFailure = true, calculatorFailure = true;
    let releaseRenderer;
    let rendererGate = null;
    await context.route('**/js/ui/share-renderer.js*', async route => {
      if (rendererFailure) { rendererFailure = false; return route.abort('failed'); }
      if (rendererGate) await rendererGate;
      return route.fallback();
    });
    await context.route('**/js/features/calculator.js*', route => {
      if (calculatorFailure) { calculatorFailure = false; return route.abort('failed'); }
      return route.fallback();
    });
    const page = await context.newPage();
    const requests = [], issues = [];
    page.on('request', request => requests.push(new URL(request.url())));
    page.on('pageerror', error => issues.push(error.message));
    try {
      await page.goto(`${baseUrl}/?theme=${theme}`);
      await page.waitForFunction(() => document.documentElement.dataset.dashboardReady === 'true');
      assert.deepEqual(requests.filter(url => OPTIONAL_PATHS.includes(url.pathname)).map(url => url.pathname), [], 'no optional tools or image implementation before intent');
      assert.equal(await page.locator('#comparison-grid > *').count(), 0, 'hidden comparison should not construct cards');
      assert.deepEqual(await page.evaluate(() => ['captureProtocol', 'captureProtocolHistory', 'captureHistoricalData'].map(key => typeof window[key])), ['function', 'function', 'function'], 'early share globals remain callable');
      await openMenu(page, 'settings'); await page.locator('#share-btn').click();
      await page.waitForFunction(() => /unavailable/i.test(document.getElementById('share-btn').title));
      assert.equal(await page.locator('#section-picker-modal').count(), 0, 'failed lazy image import must not open half a dialog');
      // Hold the retry import to prove two rapid clicks produce one eventual
      // picker and do not lose the original action while code is in flight.
      rendererGate = new Promise(resolve => { releaseRenderer = resolve; });
      await openMenu(page, 'settings');
      await page.locator('#share-btn').evaluate(button => { button.click(); button.click(); });
      await page.waitForFunction(() => document.getElementById('share-btn').getAttribute('aria-busy') === 'true');
      releaseRenderer(); rendererGate = null;
      await page.locator('#section-picker-modal').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#section-picker-modal').count(), 1);
      assert.equal(requests.filter(url => url.pathname === '/js/ui/share-renderer.js').length, 2, 'failed initial URL plus one shared successful retry');
      await page.locator('#section-capture-btn').click();
      await page.locator('#share-modal.visible').waitFor({ state: 'visible' });
      if (artifactsDir) await page.screenshot({ path: path.join(artifactsDir, `lazy-share-${theme}-${width}.png`) });
      await closeShare(page);
      // Calculator first failure is local; another click retries the import
      // under a new URL, initializes controls, and replays exactly one open.
      await clickFeatureLauncher(page, '#calc-toggle');
      await page.waitForFunction(() => /unavailable/i.test(document.getElementById('calc-toggle').title));
      assert.equal(await page.locator('#calculator-section').evaluate(node => node.classList.contains('visible')), false);
      await clickFeatureLauncher(page, '#calc-toggle');
      await page.locator('#calculator-section.visible').waitFor({ state: 'visible' });
      await page.locator('#calc-amount').fill('1234');
      assert.equal(await page.locator('#calc-amount').inputValue(), '1234');
      assert.equal(requests.filter(url => url.pathname === '/js/features/calculator.js').length, 2);
      await clickFeatureLauncher(page, '#comparison-toggle');
      await page.locator('#comparison-section.visible .comparison-card').first().waitFor({ state: 'visible' });
      assert.equal(requests.filter(url => url.pathname === '/js/features/comparison.js').length, 1);
      await page.locator('#comparison-share-all-btn').click();
      await page.locator('#share-modal.visible').waitFor({ state: 'visible' });
      await closeShare(page);
      await clickFeatureLauncher(page, '#state-of-tezos-btn');
      await page.locator('#share-modal.visible').waitFor({ state: 'visible' });
      assert.equal(requests.filter(url => url.pathname === '/js/features/state-of-tezos.js').length, 1);
      await closeShare(page);
      await page.evaluate(() => { location.hash = 'block=12345678'; });
      await page.locator('#native-explorer-overlay').waitFor({ state: 'visible' });
      assert.equal(requests.filter(url => url.pathname === '/js/features/native-explorer.js').length, 1);
      await page.keyboard.press('Escape');
      assert.deepEqual(issues, [], 'lazy tools browser errors');
      console.log(`ok - optional tools and share retry/first-action retention ${theme} ${width}`);
    } finally { await context.close(); }
  }
  // Saved and direct-route calculator/comparison states are explicit intent and
  // must finish initialization before interacting or scrolling to the surface.
  for (const [route, key, selector] of [['#calculator', 'tezos-systems-calc-visible', '#calculator-section.visible'], ['#compare', 'tezos-systems-comparison-visible', '#comparison-section.visible']]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
    await installFeatureMocks(context);
    await context.addInitScript(key => {
      localStorage.setItem('tezos-systems-theme', 'clean'); localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1'); localStorage.setItem(key, 'true');
    }, key);
    const page = await context.newPage();
    try {
      await page.goto(`${baseUrl}/${route}`);
      await page.waitForFunction(() => document.documentElement.dataset.dashboardReady === 'true');
      await page.locator(selector).waitFor({ state: 'visible' });
      if (route === '#calculator') await page.waitForFunction(() => document.getElementById('calc-amount').value !== '');
      else await page.locator('#comparison-grid .comparison-card').first().waitFor({ state: 'visible' });
      console.log('ok - saved optional tool route ' + route);
    } finally { await context.close(); }
  }
}
