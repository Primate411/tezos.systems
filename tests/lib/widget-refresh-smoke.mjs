import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BAKER = 'tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb';
const definitions = [
  ['baker-count', '#val', '123'], ['block-height', '#val', '1,005'],
  ['price', '#price', '$1.2500'], ['protocol', '#proto', 'Ushuaia'],
  ['staking-ratio', '#gauge-number', '30.0'], ['governance', '#period', 'Exploration Vote'],
  ['baker-card', '.baker-name', 'Reader Baker'], ['combo', '#val-bakers', '123'],
  ['combo', '#val-staking', '30.0%', 'staking,protocol,cycle,health'],
  ['combo', '#val-tz4', '25.0%', 'bakers,tz4']
];
const frames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const waitState = (page, state) => page.waitForFunction(value => document.querySelector('.widget-freshness')?.dataset.state === value, state);
const tick = page => page.evaluate(() => window.__widgetTick());
const refresh = async (page, state) => {
  const previous = await page.evaluate(() => window.__widgetCommits);
  await tick(page);
  await page.waitForFunction(count => window.__widgetCommits > count, previous);
  await waitState(page, state);
};

async function installSources(context, state, origin) {
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    if (!['api.tzkt.io', 'api.coingecko.com'].includes(url.hostname)) return route.abort();
    state.requests++;
    const mode = state.mode;
    const revision = state.revision;
    if (state.gate) await state.gate;
    if (mode === 'failure' || (mode === 'partial' && url.pathname.endsWith('/simple/price'))) {
      return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
    }
    if (mode === 'missing') return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    let data;
    if (mode === 'malformed') data = {};
    else if (url.pathname.endsWith('/delegates/count')) data = 123 + revision;
    else if (url.pathname.endsWith('/delegates')) data = [
      { address: BAKER, consensusAddress: 'tz4Reader', bakingPower: 25 },
      { address: 'tz1Second', bakingPower: 75 }
    ];
    else if (url.pathname.endsWith('/delegates/' + BAKER)) data = {
      address: BAKER, alias: 'Reader Baker', active: true,
      stakingBalance: 10_000_000 + revision * 1_000_000, numDelegators: revision, votingPower: 0
    };
    else if (url.pathname.endsWith('/head')) data = { level: 1005 + revision, cycle: 0, timestamp: new Date().toISOString() };
    else if (url.pathname.endsWith('/statistics/current')) data = { totalSupply: 100, totalOwnStaked: mode === 'zero' ? 0 : 10, totalExternalStaked: mode === 'zero' ? 0 : 20 + revision, totalFrozen: 80 };
    else if (url.pathname.endsWith('/simple/price')) data = { tezos: { usd: 1.25 + revision, usd_24h_change: revision ? null : 0 } };
    else if (url.pathname.endsWith('/protocols/current')) data = { hash: 'PsUshuaiReader', code: 25, extras: { alias: 'Ushuaia' } };
    else if (url.pathname.endsWith('/protocols')) data = [{ hash: 'PsUshuaiReader', code: 25, firstLevel: 1000 }];
    else if (url.pathname.endsWith('/voting/periods/current')) data = { kind: 'exploration', firstLevel: 1000, lastLevel: 1100, epoch: 0, index: 0 };
    else throw new Error('Unexpected widget endpoint ' + url.href);
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
  });
  await context.addInitScript(() => {
    window.__widgetCommits = 0;
    new MutationObserver(records => {
      window.__widgetCommits += records.filter(record => record.target.matches?.('.widget-freshness') && record.attributeName === 'data-state').length;
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-state'] });
    let hidden = false;
    let offset = 0;
    const now = Date.now.bind(Date);
    Date.now = () => now() + offset;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => hidden ? 'hidden' : 'visible' });
    window.__widgetVisibility = (next, elapsed = 0) => {
      hidden = next; offset += elapsed;
      document.dispatchEvent(new Event('visibilitychange'));
    };
    const setInterval = window.setInterval.bind(window);
    window.setInterval = (callback, delay, ...args) => {
      if (delay === 10_000) { window.__widgetTick = callback; return -1; }
      return setInterval(callback, delay, ...args);
    };
  });
}

function snapshot(page) {
  return page.evaluate(() => ({
    values: [...document.querySelectorAll('.value,.price,.change,.protocol,.period,.stat-val,.baker-name,.baker-addr,#gauge-number,#sub-val,#cycle-info')].map(node => node.textContent),
    clock: document.querySelector('.widget-freshness').dataset.lastGoodAt,
    box: document.querySelector('.widget').getBoundingClientRect().toJSON()
  }));
}

export async function smokeWidgetRefresh(browser, baseUrl, { artifactsDir } = {}) {
  const issues = [];
  if (artifactsDir) await mkdir(artifactsDir, { recursive: true });
  for (const [width, height, theme] of [[300, 120, 'matrix'], [390, 180, 'clean']]) {
    for (const [name, selector, expected, stats] of definitions) {
      const label = `${name}${stats ? '-' + stats : ''}-${width}`;
      const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block', reducedMotion: width === 300 ? 'no-preference' : 'reduce' });
      const state = { requests: 0, mode: 'failure', revision: 0, gate: null };
      await installSources(context, state, new URL(baseUrl).origin);
      const page = await context.newPage();
      page.on('pageerror', error => issues.push(`${label}: ${error.message}`));
      try {
        await page.goto(`${baseUrl}/widgets/${name}.html?theme=${theme}&refresh=10&baker=${BAKER}${stats ? '&stats=' + stats : ''}`);
        await waitState(page, 'unavailable');
        assert(!/Baker not found|No Active Vote/.test(await page.locator('.widget').innerText()), `${label}: outage cannot claim absence`);
        assert.equal(await page.locator('.loading').count(), 0, `${label}: failed initial skeleton must settle`);
        state.mode = 'good';
        const start = state.requests;
        await page.locator('.widget-retry').click();
        await waitState(page, 'current');
        const requestsPerLoad = state.requests - start;
        assert.equal(await page.locator(selector).textContent(), expected, label);
        if (name === 'baker-card') assert.deepEqual(await page.locator('.stat-val').allTextContents(), ['10', '0', '0'], 'known zero baker metrics remain zero');
        const initial = await snapshot(page);
        await frames(page);
        const geometry = await page.evaluate(() => {
          const root = document.querySelector('.widget').getBoundingClientRect();
          const meta = document.querySelector('.widget-meta').getBoundingClientRect();
          const main = [...document.querySelector('.widget').children].filter(node => !node.matches('.widget-meta'));
          const boxes = main.map(node => node.getBoundingClientRect());
          return { root: root.toJSON(), meta: meta.toJSON(), min: Math.min(...boxes.map(box => box.top)), max: Math.max(...boxes.map(box => box.bottom)),
            footer: document.querySelector('.footer').getBoundingClientRect().toJSON(), retry: document.querySelector('.widget-retry').getBoundingClientRect().toJSON() };
        });
        assert(geometry.min >= -1 && geometry.max <= geometry.meta.top + 1, `${label}: content and freshness row must fit the frame ${JSON.stringify(geometry)}`);
        assert(geometry.retry.right <= geometry.footer.left, `${label}: retry cannot overlap attribution`);
        if (artifactsDir) await page.screenshot({ path: path.join(artifactsDir, `widget-${label}.png`) });
        for (const mode of ['malformed', stats || name !== 'combo' ? 'failure' : 'partial']) {
          state.mode = mode; state.revision = 1;
          await refresh(page, 'stale');
          const failed = await snapshot(page);
          assert.deepEqual(failed, initial, `${label}: ${mode} must retain all readings, original clock and fixed frame`);
        }
        state.mode = 'good';
        await refresh(page, 'current');
        assert.notEqual((await snapshot(page)).clock, initial.clock, `${label}: recovery advances successful source receipt`);
        if (name === 'price') {
          assert.equal(await page.locator('#change').textContent(), '—', 'missing new change must not retain an old value');
          assert.equal(await page.locator('#change').getAttribute('class'), 'change');
        }
        if (name === 'governance') assert((await page.locator('#cycle-info').textContent()).includes('Epoch 0 · Period 0'), 'known zero indices remain zero');
        // A real response can finish while hidden; retain the exact live reading
        // until the visibility event, then apply that single queued result.
        const beforeHidden = await snapshot(page);
        let release;
        state.gate = new Promise(resolve => { release = resolve; });
        state.revision = 2;
        const beforeRequests = state.requests;
        await tick(page);
        for (let attempt = 0; state.requests < beforeRequests + requestsPerLoad && attempt < 300; attempt++) await frames(page);
        assert.equal(state.requests, beforeRequests + requestsPerLoad, `${label}: the complete controlled batch must start before hiding`);
        await page.evaluate(() => window.__widgetVisibility(true));
        release(); state.gate = null;
        await page.waitForLoadState('networkidle');
        assert.deepEqual(await snapshot(page), beforeHidden, `${label}: hidden completion cannot mutate DOM`);
        const hiddenRequests = state.requests;
        await tick(page); await frames(page);
        assert.equal(state.requests, hiddenRequests, `${label}: hidden timer performs no network I/O`);
        await page.evaluate(() => window.__widgetVisibility(false));
        await page.waitForFunction(clock => document.querySelector('.widget-freshness').dataset.lastGoodAt !== clock, beforeHidden.clock);
        await frames(page);
        assert.equal(state.requests, hiddenRequests, `${label}: returning applies exactly one queued response without refetching`);
        await page.evaluate(() => window.__widgetVisibility(true));
        await tick(page);
        const beforeCatchup = await page.evaluate(() => window.__widgetCommits);
        await page.evaluate(() => window.__widgetVisibility(false, 11000));
        await page.waitForFunction(count => window.__widgetCommits > count, beforeCatchup);
        assert.equal(state.requests, hiddenRequests + requestsPerLoad, `${label}: an overdue visible return performs one catch-up batch`);
        // Retain live nodes, selection and focus inside a realistically scrolled
        // embedding document and nested horizontal/vertical container.
        await page.evaluate(() => {
          document.documentElement.style.cssText = 'height:auto;overflow:auto';
          document.body.style.cssText = 'display:block;height:2000px;min-height:0;overflow:visible';
          const host = document.createElement('div');
          host.id = 'reader-scroll';
          host.style.cssText = 'margin-top:400px;width:280px;height:220px;overflow:auto';
          const inner = document.createElement('div');
          inner.style.cssText = 'padding-top:150px;width:500px;height:650px';
          const widget = document.querySelector('.widget');
          widget.style.cssText = 'width:360px;height:160px;margin-left:30px';
          widget.before(host); host.append(inner); inner.append(widget);
          host.scrollTop = 130; host.scrollLeft = 20; window.scrollTo({ top: 380, behavior: 'instant' });
          document.querySelector('.widget-retry').focus({ preventScroll: true });
          const text = (widget.querySelector('.label') || widget.querySelector('.stat-lbl')).lastChild;
          const range = document.createRange(); range.setStart(text, 0); range.setEnd(text, Math.min(4, text.length));
          document.getSelection().removeAllRanges(); document.getSelection().addRange(range);
          window.__widgetNodes = [...widget.querySelectorAll('*')];
          window.__widgetReader = { top: scrollY, nested: host.scrollTop, left: host.scrollLeft, selected: String(getSelection()), focus: document.activeElement };
        });
        const readerClock = (await snapshot(page)).clock;
        state.revision = 3; await tick(page);
        await page.waitForFunction(clock => document.querySelector('.widget-freshness').dataset.lastGoodAt !== clock, readerClock);
        const reader = await page.evaluate(() => {
          const old = window.__widgetReader, host = document.getElementById('reader-scroll');
          return { nodes: window.__widgetNodes.every(node => node.isConnected), focused: old.focus === document.activeElement,
            selected: old.selected === String(getSelection()), top: scrollY - old.top, nested: host.scrollTop - old.nested, left: host.scrollLeft - old.left,
            animated: document.querySelector('.widget').getAnimations({ subtree: true }).length,
            opacity: Number(getComputedStyle(document.querySelector('.value,.price,.protocol,.period,.stat-val,#gauge-number')).opacity) };
        });
        assert.deepEqual(reader, { nodes: true, focused: true, selected: true, top: 0, nested: 0, left: 0, animated: 0, opacity: 1 }, `${label}: quiet reader state`);
        await page.evaluate(() => {
          window.__nextWidgetReaderScroll = null;
          const observer = new MutationObserver(() => {
            observer.disconnect();
            const host = document.getElementById('reader-scroll');
            window.scrollBy({ top: 27, behavior: 'instant' }); host.scrollTop += 19; host.scrollLeft += 11;
            window.__nextWidgetReaderScroll = { top: scrollY, nested: host.scrollTop, left: host.scrollLeft };
          });
          observer.observe(document.querySelector('.widget-freshness'), { attributes: true, attributeFilter: ['data-state'] });
        });
        state.revision = 4; await refresh(page, 'current');
        await frames(page);
        const nextScroll = await page.evaluate(() => ({
          expected: window.__nextWidgetReaderScroll,
          actual: { top: scrollY, nested: document.getElementById('reader-scroll').scrollTop, left: document.getElementById('reader-scroll').scrollLeft }
        }));
        assert(nextScroll.expected, `${label}: immediate reader-scroll probe must execute`);
        assert.deepEqual(nextScroll.actual, nextScroll.expected,
          `${label}: delayed restore cannot overwrite a reader scroll in the first post-reconciliation microtask`);
        console.log('ok - widget refresh ' + label);
      } finally { await context.close(); }
    }
  }
  assert.deepEqual(issues, [], 'widget page errors');

  // Only a confirmed HTTP 404 gets the baker-not-found state; a later 404 still
  // preserves the last-good card with its original successful source timestamp.
  const context = await browser.newContext({ viewport: { width: 300, height: 120 }, serviceWorkers: 'block' });
  const state = { requests: 0, mode: 'missing', revision: 0, gate: null };
  await installSources(context, state, new URL(baseUrl).origin);
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/widgets/baker-card.html?baker=${BAKER}&refresh=10`);
    await waitState(page, 'missing');
    assert.equal(await page.locator('.no-baker').textContent(), 'Baker not found');
    state.mode = 'good'; await refresh(page, 'current');
    const good = await snapshot(page);
    state.mode = 'missing'; await refresh(page, 'missing');
    assert.deepEqual(await snapshot(page), good, 'subsequent 404 retains the last-good baker record');
    console.log('ok - widget confirmed missing baker versus unavailable source');
  } finally { await context.close(); }
  const zeroContext = await browser.newContext({ viewport: { width: 300, height: 120 }, serviceWorkers: 'block' });
  const zeroState = { requests: 0, mode: 'zero', revision: 0, gate: null };
  await installSources(zeroContext, zeroState, new URL(baseUrl).origin);
  const zeroPage = await zeroContext.newPage();
  try {
    await zeroPage.goto(`${baseUrl}/widgets/staking-ratio.html?refresh=10`);
    await waitState(zeroPage, 'current');
    assert.equal(await zeroPage.locator('#gauge-number').textContent(), '0.0', 'explicit zero stake must not fall back to legacy frozen balance');
    const zero = await snapshot(zeroPage);
    zeroState.mode = 'malformed'; await refresh(zeroPage, 'stale');
    assert.deepEqual(await snapshot(zeroPage), zero, 'empty ratio response preserves a confirmed zero reading');
    await zeroPage.goto(`${baseUrl}/widgets/baker-card.html`);
    await waitState(zeroPage, 'configuration');
    const requests = zeroState.requests;
    await frames(zeroPage);
    assert.equal(zeroState.requests, requests, 'unconfigured baker widget performs no request');
    assert(await zeroPage.locator('.widget-retry').isHidden(), 'unconfigured baker widget has no misleading retry action');
    console.log('ok - widget explicit zero staking and unconfigured baker');
  } finally { await zeroContext.close(); }

}
