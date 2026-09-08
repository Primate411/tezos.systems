import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

async function setup(browser, installFeatureMocks, { width = 1440, theme = 'clean', address = '' } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 600, serviceWorkers: 'block', reducedMotion: 'reduce' });
  await installFeatureMocks(context);
  await context.addInitScript(({ theme, address }) => {
    localStorage.setItem('tezos-systems-theme', theme);
    localStorage.setItem('tezos-toured', '1');
    localStorage.setItem('tezos-welcomed', '1');
    localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    if (address) localStorage.setItem('tezos-systems-my-baker-address', address);
  }, { theme, address });
  const page = await context.newPage(), errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push(request.url()));
  return { context, page, errors, requests };
}
const homeReady = page => page.waitForFunction(() => document.documentElement.dataset.dashboardReady === 'true');
const chartReady = (page, id) => page.waitForFunction(id => Boolean(window.Chart?.getChart(document.getElementById(id))), id);
const chartRequests = requests => requests.filter(url => /chart\.umd|chartjs-adapter/.test(url));
async function seedHistory(page, address) {
  await page.evaluate(address => {
    const points = [3, 2, 1].map((days, index) => ({ timestamp: Date.now() - days * 86400000, totalMutez: 1000000000 + index * 1000000, level: 12340000 + index, source: 'tzkt-balance-history', cadence: 'daily' }));
    const coverage = { completed: 3, target: 3, complete: true };
    window.dispatchEvent(new CustomEvent('my-tezos-memory-ready', { detail: {
      compositionAddresses: [address], aggregate: points, aggregateCoverage: coverage,
      seriesByAddress: { [address]: points }, coverageByAddress: { [address]: coverage }, sourceStatus: { stage: 'complete' }
    } }));
  }, address);
}

export async function smokeLazyDrawerCharts(browser, baseUrl, { installFeatureMocks, address, artifactsDir }) {
  if (artifactsDir) await mkdir(artifactsDir, { recursive: true });
  // Cold keyboard/touch activation, failure, cancellation, and second activation.
  for (const width of [1440, 375]) {
    const { context, page, errors, requests } = await setup(browser, installFeatureMocks, { width });
    let failCss = true, release;
    const gate = new Promise(resolve => { release = resolve; });
    let cssPending = false;
    await context.route('**/css/my-tezos.min.css*', async route => {
      if (failCss) return route.abort('failed');
      cssPending = true;
      const response = await route.fetch();
      await gate;
      return route.fulfill({ response });
    });
    try {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' }); await homeReady(page);
      assert.equal(requests.filter(url => url.includes('/css/my-tezos.min.css')).length, 0);
      assert.equal(chartRequests(requests).length, 0);
      const activate = () => width < 600 ? page.locator('#my-tezos-btn').tap() : page.keyboard.press('m');
      await activate();
      await page.waitForFunction(() => /unavailable/.test(document.getElementById('my-tezos-btn').title));
      assert.equal(await page.locator('#my-tezos-drawer').getAttribute('aria-hidden'), 'true');
      failCss = false;
      await activate();
      await page.waitForFunction(() => document.getElementById('my-tezos-btn').getAttribute('aria-busy') === 'true');
      assert(cssPending, 'Retry reaches the held stylesheet');
      assert.equal(await page.locator('#my-tezos-drawer').getAttribute('aria-hidden'), 'true');
      await page.keyboard.press('Escape'); release();
      await page.waitForFunction(() => Boolean(document.getElementById('my-tezos-css')?.sheet));
      assert.equal(await page.locator('#my-tezos-drawer').getAttribute('aria-hidden'), 'true', 'Escape cancels the pending reveal');
      await activate(); await page.locator('#my-tezos-drawer.open').waitFor();
      assert.equal(await page.locator('#my-tezos-drawer').evaluate(node => getComputedStyle(node).position), 'fixed');
      await page.keyboard.press('Escape');
      await activate(); await page.locator('#my-tezos-drawer.open').waitFor();
      assert.equal(requests.filter(url => url.includes('/css/my-tezos.min.css')).length, 2, 'One failed load and one shared successful load');
      if (artifactsDir) await page.screenshot({ path: path.join(artifactsDir, `lazy-drawer-clean-${width}.png`) });
      assert.deepEqual(errors, []);
      console.log(`ok - lazy drawer ${width}: cold activation, failure retry, Escape, and reuse`);
    } finally { release(); await context.close(); }
  }

  for (const surface of ['portfolio', 'rewards', 'upgrade']) {
    const { context, page, errors, requests } = await setup(browser, installFeatureMocks, { address, width: surface === 'portfolio' ? 375 : 1440 });
    if (surface === 'rewards') await context.route(url => url.pathname === `/v1/rewards/bakers/${address}` && !url.searchParams.has('select'), route => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify([1143, 1142, 1141].map(cycle => ({
        cycle, blockRewardsStakedOwn: 6000000, attestationRewardsStakedOwn: 3000000, dalAttestationRewardsStakedOwn: 0, blockFees: 100000
      })))
    }));
    let failChart = true;
    await context.route('**/chart.umd.min.js', route => failChart ? route.abort('failed') : route.fallback());
    try {
      await page.goto(surface === 'upgrade' ? `${baseUrl}/anthology/` : baseUrl, { waitUntil: 'domcontentloaded' });
      if (surface !== 'upgrade') {
        await homeReady(page);
        await page.waitForFunction(address => window._myTezosData?.fullAddress === address, address, { timeout: 30000 });
        assert.equal(chartRequests(requests).length, 0, 'A saved wallet must not load hidden charts at boot');
        await page.locator('#my-tezos-btn').click();
        await page.locator('#my-tezos-drawer.open').waitFor();
      }
      const tab = surface === 'rewards' ? 'overview' : 'portfolio';
      const canvasId = surface === 'rewards' ? 'drawer-rewards-sparkline' : surface === 'portfolio' ? 'portfolio-history-chart' : 'upgrade-effect-canvas';
      const retryRoot = surface === 'rewards' ? '.drawer-rewards-spark' : surface === 'portfolio' ? '#portfolio-history-empty' : '#upgrade-effect-chart';
      if (surface === 'upgrade') {
        await page.locator('.protocol-anthology-tools > summary').click();
        await page.locator('#upgrade-effect-toggle').click();
      }
      else if (surface === 'portfolio') {
        await seedHistory(page, address);
        await page.locator(`#my-tezos-tab-${tab}`).click();
      }
      await page.locator(`${retryRoot} [data-chart-retry]`).waitFor({ state: 'visible', timeout: 30000 });
      failChart = false;
      if (surface === 'upgrade') {
        await page.locator('#upgrade-effect-toggle').click();
        await page.locator('#upgrade-effect-toggle').click();
      } else {
        await page.locator(`#my-tezos-tab-${surface === 'rewards' ? 'baker-signal' : 'overview'}`).click();
        await page.locator(`#my-tezos-tab-${tab}`).click();
      }
      await chartReady(page, canvasId);
      assert.equal(chartRequests(requests).length, 3, `${surface}: one failed library request plus exactly two successful scripts: ${JSON.stringify(chartRequests(requests))}`);
      if (artifactsDir) {
        await page.locator(`#${canvasId}`).scrollIntoViewIfNeeded();
        await page.locator(`#${canvasId}`).screenshot({ path: path.join(artifactsDir, `lazy-chart-${surface}.png`) });
      }
      if (surface === 'rewards') {
        await seedHistory(page, address);
        await page.locator('#my-tezos-tab-portfolio').click();
        await chartReady(page, 'portfolio-history-chart');
        assert.equal(chartRequests(requests).length, 3, 'Second chart surface reuses both libraries');
      }
      assert.deepEqual(errors, []);
      console.log(`ok - lazy ${surface}: real chart, local failure, second-activation retry, shared scripts`);
    } finally { await context.close(); }
  }

  {
    const { context, page, errors } = await setup(browser, installFeatureMocks);
    let release, requested;
    const gate = new Promise(resolve => { release = resolve; });
    const started = new Promise(resolve => { requested = resolve; });
    await context.route('**/chart.umd.min.js', async route => {
      requested(); await gate; return route.fallback();
    });
    try {
      await page.goto(`${baseUrl}/anthology/`, { waitUntil: 'domcontentloaded' });
      await page.locator('.protocol-anthology-tools > summary').click();
      await page.locator('#upgrade-effect-toggle').click(); await started;
      await page.locator('#upgrade-effect-toggle').click(); release();
      await page.waitForFunction(() => {
        try { return Boolean(new window.Chart._adapters._date().formats()); } catch { return false; }
      });
      assert.equal(await page.locator('#upgrade-effect-canvas').count(), 0, 'Cancelled chart never constructs a canvas after its library arrives');
      await page.locator('#upgrade-effect-toggle').click();
      await chartReady(page, 'upgrade-effect-canvas');
      await page.locator('#upgrade-effect-metric-bakers').click();
      await page.waitForFunction(() => document.getElementById('upgrade-effect-canvas').getAttribute('aria-label').startsWith('Active Bakers'));
      assert.deepEqual(errors, []);
      console.log('ok - upgrade chart: delayed library respects close and later metric selection');
    } finally { release(); await context.close(); }
  }

  {
    const { context, page, errors, requests } = await setup(browser, installFeatureMocks);
    let release, requested;
    const gate = new Promise(resolve => { release = resolve; });
    const started = new Promise(resolve => { requested = resolve; });
    await context.route('**/chart.umd.min.js', async route => {
      requested(); await gate; return route.fallback();
    });
    try {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' }); await homeReady(page);
      assert.equal(chartRequests(requests).length, 0);
      await page.locator('[data-chamber-category="bakers"] .chamber-category-toggle').click();
      await page.locator('#tz4-sparkline').scrollIntoViewIfNeeded();
      await started;
      await page.locator('[data-chamber-category="bakers"] .chamber-category-toggle').click();
      release();
      await page.waitForFunction(() => {
        try { return Boolean(new window.Chart._adapters._date().formats()); } catch { return false; }
      });
      assert.equal(await page.evaluate(() => Boolean(Chart.getChart(document.getElementById('tz4-sparkline')))), false, 'Collapsed sparklines remain unrendered after a delayed library');
      await page.locator('[data-chamber-category="bakers"] .chamber-category-toggle').click();
      await page.locator('#tz4-sparkline').scrollIntoViewIfNeeded();
      await chartReady(page, 'tz4-sparkline');
      await page.evaluate(async () => {
        const canvas = document.getElementById('tz4-sparkline');
        window.__retainedSparkline = Chart.getChart(canvas);
        const { ASSET_VERSION } = await import('/js/core/asset-version.js');
        const history = await import(`/js/features/history.js?v=${ASSET_VERSION}`);
        await history.updateSparklines();
      });
      assert(await page.evaluate(() => Chart.getChart(document.getElementById('tz4-sparkline')) === window.__retainedSparkline), 'Sparkline refresh retains its chart');
      assert.equal(chartRequests(requests).length, 2);
      assert.deepEqual(errors, []);
      console.log('ok - hidden home sparklines load on visibility and retain chart instances on refresh');
    } finally { release(); await context.close(); }
  }
}
