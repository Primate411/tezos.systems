import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const PAINTERS = ['matrix-effects.js', 'bg-effects.js', 'valley-effects.js'];
const CANVASES = '#matrix-canvas, #bg-effects-canvas, #valley-background-canvas';
const canvasFor = theme => theme === 'matrix' ? 'matrix-canvas' : theme === 'valley' ? 'valley-background-canvas' : 'bg-effects-canvas';
const frames = (page, count = 2) => page.evaluate(async count => {
  for (let i = 0; i < count; i++) await new Promise(requestAnimationFrame);
}, count);
const select = (page, theme) => page.evaluate(theme => window.__themeEffectsFixture.theme.setTheme(theme), theme);
async function expectCanvas(page, theme) {
  const id = canvasFor(theme);
  await page.locator(`#${id}`).waitFor({ state: 'attached' });
  const state = await page.evaluate(selector => [...document.querySelectorAll(selector)].map(canvas => ({
    id: canvas.id, width: canvas.width, height: canvas.height, opacity: getComputedStyle(canvas).opacity
  })), CANVASES);
  assert.deepEqual(state.map(canvas => canvas.id), [id], `${theme}: only the selected painter is mounted`);
  assert.ok(state[0].width > 0 && state[0].height > 0, `${theme}: a real sized canvas`);
  return state[0];
}
async function expectNoCanvas(page) {
  await page.locator(CANVASES).waitFor({ state: 'detached' });
  assert.equal(await page.locator(CANVASES).count(), 0);
}

/** Focus on loading/lifecycle contracts; the existing theme suite owns visual styles and fonts. */
export async function smokeThemeEffectsLazy(browser, baseUrl, { installFeatureMocks, artifactsDir = '' } = {}) {
  assert.equal(typeof installFeatureMocks, 'function', 'Use the existing hermetic app fixtures for real shell/handoff checks');
  const base = baseUrl.replace(/\/$/, '');
  const evidence = { scenarios: [], passed: false };
  const save = async () => {
    if (!artifactsDir) return;
    await mkdir(artifactsDir, { recursive: true });
    await writeFile(path.join(artifactsDir, 'theme-effects-lazy.json'), JSON.stringify(evidence, null, 2) + '\n');
  };
  async function setup({ theme = 'aurora', reducedMotion = 'no-preference', fixture = true } = {}) {
    const context = await browser.newContext({ viewport: { width: 1000, height: 750 }, serviceWorkers: 'block', reducedMotion });
    if (fixture) {
      await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
      await context.route('**/__theme_effects_lazy_contract', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html>
        <html><head><link rel="stylesheet" href="/css/styles.min.css"><title>Theme lifecycle fixture</title></head>
        <body data-theme="${theme}"><button id="settings-gear" style="position:fixed;right:20px;top:20px;z-index:10">Themes</button>
        <script type="module">
          import * as theme from '/js/ui/theme.js';
          import { initChamberThemeEffects } from '/js/ui/chamber-theme-effects.js';
          import { versionedAsset } from '/js/core/asset-version.js';
          await import(versionedAsset('/js/effects/valley-loader.js'));
          initChamberThemeEffects();
          theme.initTheme();
          window.__themeEffectsFixture = { theme, initChamberThemeEffects };
          document.getElementById('settings-gear').addEventListener('click', theme.openThemePicker);
          document.documentElement.dataset.themeFixtureReady = 'true';
        </script></body></html>` }));
    } else await installFeatureMocks(context);
    await context.addInitScript(theme => {
      localStorage.setItem('tezos-systems-theme', theme);
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
      const add = window.addEventListener;
      window.__themeListenerRegistrations = 0;
      window.addEventListener = function(type, ...args) {
        if (type === 'themechange') window.__themeListenerRegistrations++;
        return add.call(this, type, ...args);
      };
    }, theme);
    const page = await context.newPage();
    const requests = [], errors = [], warnings = [];
    page.on('request', request => {
      const url = new URL(request.url());
      if (PAINTERS.some(file => url.pathname === `/js/effects/${file}`)) requests.push(url.href);
    });
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (/warn|error/.test(message.type())) warnings.push(message.text()); });
    const open = async (route = fixture ? '/__theme_effects_lazy_contract' : '/') => {
      await page.goto(`${base}${route}`, { waitUntil: 'domcontentloaded' });
      if (fixture) await page.waitForFunction(() => document.documentElement.dataset.themeFixtureReady === 'true');
    };
    return { context, page, requests, errors, warnings, open };
  }
  async function run(id, options, test) {
    const session = await setup(options);
    const receipt = { id, passed: false };
    evidence.scenarios.push(receipt);
    try {
      Object.assign(receipt, await test(session));
      assert.deepEqual(session.errors, [], `${id}: uncaught browser errors`);
      receipt.passed = true;
      console.log(`ok - theme effects: ${id}`);
    } catch (error) {
      receipt.error = error.stack || error.message;
      if (artifactsDir) {
        await mkdir(artifactsDir, { recursive: true });
        await session.page.screenshot({ path: path.join(artifactsDir, `theme-effects-${id}-failure.png`) }).catch(() => {});
      }
      throw error;
    } finally {
      receipt.requests = session.requests;
      receipt.pageErrors = session.errors;
      receipt.warnings = session.warnings;
      await session.context.close();
      await save();
    }
  }

  for (const theme of ['aurora', 'clean', 'hen']) {
    await run(`root-${theme}-no-painter`, { theme, fixture: false }, async ({ page, requests, open }) => {
      await open();
      await page.waitForFunction(() => document.documentElement.dataset.dashboardReady === 'true');
      await frames(page);
      assert.equal(await page.locator('body').getAttribute('data-theme'), theme);
      assert.deepEqual(requests, [], `${theme}: renderer never requested by the actual root shell`);
      await expectNoCanvas(page);
    });
  }

  await run('selected-painters-and-picker', {}, async ({ page, requests, open }) => {
    await open();
    assert.deepEqual(requests, []);
    const states = [];
    for (const theme of ['matrix', 'void', 'ember', 'signal', 'bubblegum', 'nerv', 'abyss', 'moss', 'warzone', 'valley']) {
      await select(page, theme);
      const state = await expectCanvas(page, theme);
      if (['abyss', 'moss', 'warzone'].includes(theme)) assert.equal(state.opacity, theme === 'moss' ? '0.9' : '0.85', `${theme}: its existing renderer configuration`);
      states.push({ theme, ...state });
    }
    assert.equal(requests.filter(url => url.includes('/matrix-effects.js')).length, 1);
    assert.equal(requests.filter(url => url.includes('/bg-effects.js')).length, 1, 'Eight background themes share one download');
    assert.equal(requests.filter(url => url.includes('/valley-effects.js')).length, 1);
    await select(page, 'aurora');
    await expectNoCanvas(page);
    await page.locator('#settings-gear').click();
    await page.locator('#theme-picker-dropdown.open').waitFor();
    await page.locator('.theme-row[data-theme="matrix"]').hover();
    await expectCanvas(page, 'matrix');
    assert.equal(await page.evaluate(() => localStorage.getItem('tezos-systems-theme')), 'aurora', 'Hover does not persist a preview');
    await page.locator('.theme-row[data-theme="ember"]').hover();
    await expectCanvas(page, 'ember');
    await page.mouse.move(10, 10);
    await expectNoCanvas(page);
    assert.equal(await page.locator('body').getAttribute('data-theme'), 'aurora', 'Leaving the picker restores the confirmed theme');
    await page.locator('.theme-radio[value="matrix"]').focus();
    await page.keyboard.press('Space');
    await expectCanvas(page, 'matrix');
    assert.equal(await page.evaluate(() => localStorage.getItem('tezos-systems-theme')), 'matrix');
    await page.keyboard.press('Escape');
    await page.locator('#theme-picker-dropdown').waitFor({ state: 'detached' });
    const duplicate = await page.evaluate(() => {
      const canvas = document.getElementById('matrix-canvas');
      const listeners = window.__themeListenerRegistrations;
      for (let n = 0; n < 5; n++) window.__themeEffectsFixture.initChamberThemeEffects();
      return { sameCanvas: document.getElementById('matrix-canvas') === canvas, listenersBefore: listeners, listenersAfter: window.__themeListenerRegistrations };
    });
    assert.equal(duplicate.sameCanvas, true);
    assert.equal(duplicate.listenersAfter, duplicate.listenersBefore, 'Repeated initialization does not register duplicate lifecycle listeners');
    await page.evaluate(() => {
      for (const theme of ['ember', 'matrix', 'warzone', 'clean']) window.__themeEffectsFixture.theme.setTheme(theme, true);
    });
    await frames(page);
    await expectNoCanvas(page);
    assert.equal(requests.length, 3, 'Picker previews and rapid switching reuse successful modules');
    return { states, duplicate };
  });

  for (const delayed of [
    { id: 'matrix-late-after-switch-away', renderer: 'matrix-effects.js', initial: 'matrix', latest: 'aurora' },
    { id: 'background-late-latest-theme', renderer: 'bg-effects.js', initial: 'ember', latest: 'warzone' }
  ]) {
    await run(delayed.id, {}, async ({ context, page, requests, open }) => {
      let release, requested;
      const gate = new Promise(resolve => { release = resolve; });
      const started = new Promise(resolve => { requested = resolve; });
      await context.route(`**/js/effects/${delayed.renderer}*`, async route => {
        const response = await route.fetch();
        requested();
        await gate;
        await route.fulfill({ response });
      });
      try {
        await open();
        await select(page, delayed.initial);
        await started;
        await expectNoCanvas(page);
        if (delayed.latest === 'warzone') {
          await select(page, 'matrix');
          await expectCanvas(page, 'matrix');
        }
        await select(page, delayed.latest);
        await expectNoCanvas(page);
        release();
        // Await the same native module record already requested by the loader.
        // This is an execution barrier, not another URL or a synthetic theme event.
        await page.evaluate(file => import(`/js/effects/${file}`), delayed.renderer);
        await frames(page);
        if (delayed.latest === 'aurora') {
          await expectNoCanvas(page);
          await select(page, 'matrix');
          await expectCanvas(page, 'matrix');
        } else assert.equal((await expectCanvas(page, delayed.latest)).opacity, '0.85');
        assert.equal(requests.filter(url => url.includes(`/${delayed.renderer}`)).length, 1);
      } finally { release(); }
    });
  }

  await run('failed-import-retries-after-next-choice', {}, async ({ context, page, requests, warnings, open }) => {
    let attempts = 0;
    await context.route('**/js/effects/matrix-effects.js*', route => ++attempts === 1 ? route.abort('failed') : route.continue());
    await open();
    const failed = page.waitForEvent('console', message => /Theme background unavailable:/.test(message.text()));
    await select(page, 'matrix');
    await failed;
    await expectNoCanvas(page);
    await frames(page);
    assert.equal(attempts, 1, 'Failure does not cause an automatic retry loop');
    await select(page, 'aurora');
    await select(page, 'matrix');
    await expectCanvas(page, 'matrix');
    assert.equal(attempts, 2);
    assert.equal(new URL(requests[0]).searchParams.has('theme-retry'), false, 'First request uses the canonical URL');
    assert.equal(new URL(requests[1]).searchParams.get('theme-retry'), '1', 'Retry evades the browser-cached failed native module');
    await select(page, 'aurora');
    await select(page, 'matrix');
    await expectCanvas(page, 'matrix');
    assert.equal(attempts, 2, 'Successful retry is reused');
    assert.equal(warnings.filter(message => /Theme background unavailable:/.test(message)).length, 1);
    return { attempts };
  });

  for (const theme of ['matrix', 'ember', 'valley']) {
    await run(`${theme}-reduced-motion`, { theme, reducedMotion: 'reduce' }, async ({ page, requests, open }) => {
      await open();
      await frames(page);
      assert.deepEqual(requests, [], 'Reduced-motion startup does not fetch a renderer');
      await expectNoCanvas(page);
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await expectCanvas(page, theme);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await expectNoCanvas(page);
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await expectCanvas(page, theme);
      assert.equal(requests.length, 1, 'Motion changes reuse the loaded renderer');
      if (theme !== 'valley') return;
      const pause = await page.evaluate(() => {
        const canvas = document.getElementById('valley-background-canvas');
        window.__valleyVisibility = 'hidden';
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.__valleyVisibility });
        document.dispatchEvent(new Event('visibilitychange'));
        window.__retainedValleyCanvas = canvas;
        return { frame: canvas.dataset.valleyFrame, paused: canvas.dataset.valleyPaused };
      });
      assert.equal(pause.paused, 'true');
      await frames(page, 4);
      assert.equal(await page.locator('#valley-background-canvas').getAttribute('data-valley-frame'), pause.frame, 'Existing Valley visibility pause prevents drawing');
      await page.evaluate(() => { window.__valleyVisibility = 'visible'; document.dispatchEvent(new Event('visibilitychange')); });
      await page.waitForFunction(frame => Number(document.getElementById('valley-background-canvas')?.dataset.valleyFrame) > Number(frame), pause.frame);
      assert.equal(await page.evaluate(() => document.getElementById('valley-background-canvas') === window.__retainedValleyCanvas), true, 'Visibility resume retains the canvas');
      return { visibilityPause: true, retainedCanvas: true };
    });
  }

  await run('standalone-to-home-single-loader', { theme: 'matrix', fixture: false }, async ({ page, requests, open }) => {
    await open('/tezoscrp/');
    await page.waitForFunction(() => document.documentElement.dataset.chamberReady === 'tezoscrp');
    await expectCanvas(page, 'matrix');
    await page.evaluate(() => { window.__retainedMatrixCanvas = document.getElementById('matrix-canvas'); });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.documentElement.dataset.dashboardReady === 'true');
    await expectCanvas(page, 'matrix');
    assert.equal(await page.evaluate(() => document.getElementById('matrix-canvas') === window.__retainedMatrixCanvas), true, 'Handoff retains the existing Matrix painter');
    assert.equal(requests.length, 1, 'Handoff never loads unrelated or duplicate painters');
  });
  evidence.passed = true;
  await save();
  return evidence;
}
