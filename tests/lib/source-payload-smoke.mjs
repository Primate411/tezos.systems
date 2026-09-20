import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const spot = (usd, values = {}) => ({ tezos: { usd, btc: 0.000006, usd_24h_change: 2, usd_market_cap: 700000000, ...values } });
const horizons = (usd, values = {}) => [{ id: 'tezos', current_price: usd, price_change_percentage_7d_in_currency: 3, price_change_percentage_30d_in_currency: 4, ...values }];

async function priceState(page) {
  return page.locator('#price-bar').evaluate(bar => ({
    usd: bar.querySelector('.price-value').textContent,
    btc: bar.querySelector('#price-btc').textContent,
    marketCap: bar.querySelector('.price-mcap').textContent,
    changes: [...bar.querySelectorAll('[data-price-change]')].map(node => ({
      text: node.querySelector('.price-change-value').textContent,
      label: node.getAttribute('aria-label'),
      positive: node.classList.contains('positive'),
      negative: node.classList.contains('negative')
    }))
  }));
}

// Exercise the existing visibility listener, joining its request instead of
// calling a private render function or replacing the production price module.
async function refreshPrice(page) {
  await page.evaluate(async () => {
    const { fetchXTZPrice } = await import('/js/features/price.js');
    sessionStorage.removeItem('tezos_price_cache');
    document.dispatchEvent(new Event('visibilitychange'));
    await fetchXTZPrice();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function retainReader(page) {
  return page.evaluate(async () => {
    const bar = document.querySelector('#price-bar');
    const focus = bar.querySelector('.price-link');
    const price = bar.querySelector('.price-value');
    const changes = [...bar.querySelectorAll('[data-price-change]')];
    // The strip can occupy different document positions on mobile. Scroll it
    // into the real viewport before establishing the reader's exact position.
    window.scrollTo({ top: Math.max(120, bar.getBoundingClientRect().top + scrollY - 160), behavior: 'instant' });
    await new Promise(resolve => requestAnimationFrame(resolve));
    focus.focus({ preventScroll: true });
    const range = document.createRange();
    range.setStart(price.firstChild, 0); range.setEnd(price.firstChild, 3);
    getSelection().removeAllRanges(); getSelection().addRange(range);
    const before = { scroll: scrollY, selection: getSelection().toString(), url: location.href };
    window.__sourceReader = { bar, focus, price, changes, before };
    return before;
  });
}

async function assertReader(page, before, label) {
  const after = await page.evaluate(() => {
    const { bar, focus, price, changes } = window.__sourceReader;
    return {
      scroll: scrollY, selection: getSelection().toString(), url: location.href,
      retained: document.querySelector('#price-bar') === bar && bar.querySelector('.price-value') === price
        && bar.querySelector('.price-link') === focus && changes.every(node => bar.contains(node)),
      focused: document.activeElement === focus,
      opacity: getComputedStyle(bar).opacity,
      animations: bar.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length
    };
  });
  assert.deepEqual(after, { ...before, retained: true, focused: true, opacity: '1', animations: 0 }, label);
}

async function smokeRpcCadence(browser, baseUrl, { installFeatureMocks, artifactsDir }, width) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
  let offset = 0;
  let laggingEu = false;
  const epoch = Date.now();
  try {
    await installFeatureMocks(context, { blockHeadAutoAdvance: false });
    await context.addInitScript(() => {
      localStorage.clear(); sessionStorage.clear();
      localStorage.setItem('tezos-toured', '1'); localStorage.setItem('tezos-welcomed', '1');
    });
    await context.route('https://*.rpc.tez.capital/chains/main/blocks/head/header', route => {
      const sample = laggingEu && new URL(route.request().url()).hostname === 'eu.rpc.tez.capital' ? 0 : offset;
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ level: 20000000 + sample, timestamp: new Date(epoch + sample * 6000).toISOString() }) });
    });
    const page = await context.newPage();
    await page.clock.install({ time: new Date(epoch) });
    await page.goto(`${baseUrl}/?theme=clean`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.dataset.dashboardReady === 'true');
    for (const next of [2, 4, 6]) {
      offset = next;
      const response = page.waitForResponse(r => r.url().includes('/blocks/head/header') && r.status() === 200);
      await page.clock.fastForward(12000);
      await response;
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
    }
    const finality = page.locator('#hero-chain-uptime-finality');
    await page.waitForFunction(() => document.getElementById('hero-chain-uptime-finality')?.textContent === '12s', null, { timeout: 5000 });
    assert.equal(await finality.textContent(), '12s', 'sample gaps must be divided by elapsed block levels, not polling count');
    laggingEu = true;
    offset = 8;
    await page.clock.fastForward(12000);
    const heads = await page.evaluate(async () => {
      const { fetchWithRetry } = await import('/js/core/api.js');
      const rows = [];
      for (let i = 0; i < 3; i++) rows.push(await fetchWithRetry('https://eu.rpc.tez.capital/chains/main/blocks/head/header', { memoryCache: false, cache: 'no-store' }, 1));
      return rows.map(row => row.level);
    });
    assert.deepEqual(heads, [20000008, 20000008, 20000008], 'a stale HTTP-200 host must not move current reads backward');
    await page.waitForFunction(() => document.getElementById('hero-chain-uptime-finality')?.textContent === '12s');
    assert.equal(await page.evaluate(() => localStorage.getItem('tezos-systems-finality-seconds')), '12');
    assert.ok(await finality.isVisible(), 'valid finality remains visibly rendered');
    if (artifactsDir) await page.screenshot({ path: path.join(artifactsDir, `rpc-finality-${width}.png`) });
  } finally { await context.close(); }
}

export async function smokeSourcePayloads(browser, baseUrl, { installFeatureMocks, artifactsDir }) {
  if (artifactsDir) await mkdir(artifactsDir, { recursive: true });
  for (const width of [1440, 390]) await smokeRpcCadence(browser, baseUrl, { installFeatureMocks, artifactsDir }, width);
  for (const [width, theme] of [[1440, 'matrix'], [390, 'clean']]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
    let releasePrice = () => {};
    try {
      await installFeatureMocks(context, { blockHeadAutoAdvance: false });
      const failedRpcHost = width === 1440 ? 'eu.rpc.tez.capital' : 'us.rpc.tez.capital';
      const rpcHosts = ['eu.rpc.tez.capital', 'us.rpc.tez.capital'];
      const rpcRequests = [];
      let bothRpcHostsDown = false;
      await context.route('https://*.rpc.tez.capital/**', route => {
        const url = new URL(route.request().url());
        rpcRequests.push(url.hostname);
        if (bothRpcHostsDown || url.hostname === failedRpcHost) {
          return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"deliberate RPC outage"}' });
        }
        return route.fallback();
      });
      // A successful-data visual must include the missed-round identity too;
      // the broad fixture otherwise returns a receipt for an unrelated level.
      await context.route('https://api.tzkt.io/v1/rights?**', route => {
        const query = new URL(route.request().url()).searchParams;
        if (query.get('type') !== 'baking' || query.get('status') !== 'missed' || !query.has('level.in')) return route.fallback();
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(query.get('level.in').split(',').map(Number).map(level => ({
          level, round: 0, type: 'baking', status: 'missed', baker: { address: 'tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb', alias: 'RPC Fixture Baker' }
        }))) });
      });
      await context.addInitScript(theme => {
        localStorage.setItem('tezos-systems-theme', theme);
        localStorage.setItem('tezos-toured', '1'); localStorage.setItem('tezos-welcomed', '1');
        localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
        window.__sourceVisibility = 'visible';
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.__sourceVisibility });
      }, theme);

      let reply = { spot: spot(0.72), horizons: horizons(0.72) };
      let priceGate = null, requestCount = 0;
      let twoRequests = null;
      await context.route('https://api.coingecko.com/api/v3/**', async route => {
        const url = new URL(route.request().url());
        const endpoint = url.pathname.endsWith('/simple/price') ? 'spot'
          : url.pathname.endsWith('/coins/markets') ? 'horizons' : null;
        if (!endpoint) return route.fallback();
        const response = reply;
        requestCount++;
        if (twoRequests && requestCount >= twoRequests.target) { twoRequests.resolve(); twoRequests = null; }
        if (priceGate) await priceGate;
        return route.fulfill({ status: response.status || 200, contentType: 'application/json', body: JSON.stringify(response[endpoint] ?? {}) });
      });

      let statistics = {}, sourceRequests = 0;
      await context.route('**/__source-payload-test*', route => {
        sourceRequests++;
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(statistics) });
      });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${baseUrl}/?theme=${theme}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.documentElement.dataset.dashboardReady === 'true'
        && document.querySelector('#price-bar.visible .price-value')?.textContent === '$0.720');
      await page.evaluate(() => document.fonts.ready);
      assert.equal(requestCount, 2, `${width}: one shared price pair during homepage initialization`);
      const rpcData = await page.evaluate(async () => {
        const { fetchWithRetry } = await import('/js/core/api.js');
        const base = 'https://eu.rpc.tez.capital/chains/main/blocks/head';
        return Promise.all(['/header', '/context/constants', '/context/total_supply'].map(path =>
          fetchWithRetry(base + path, { memoryCache: false, cache: 'no-store' }, 1)));
      });
      assert.ok(Number(rpcData[0].level) > 0 && Number(rpcData[1].minimal_block_delay) > 0 && Number(rpcData[2]) > 0,
        `${width}: actual browser API returns populated head, constants and supply with ${failedRpcHost} down`);
      assert.ok(rpcHosts.every(host => rpcRequests.includes(host)), 'browser tried both owned endpoints');
      await page.waitForFunction(() => document.querySelector('#live-head-stack [data-live-head-level]')
        && /\d/.test(document.getElementById('hero-chain-uptime-bakers')?.textContent || ''));
      await page.waitForFunction(() => document.querySelector('#header-activity-button')?.getAttribute('aria-busy') === 'false'
        && document.querySelector('#pulse-ticker-strip')?.dataset.pulseState === 'ready'
        && document.querySelector('#live-head-stack [data-round-miss-state="missed"]')
        && !document.querySelector('#live-head-stack [data-round-miss-state="loading"], #live-head-stack [data-round-miss-state="unavailable"]')
        && [...document.querySelectorAll('#live-head-stack [data-live-head-level]')].every(row =>
          !row.querySelector('.live-head-gas-skeleton, .live-head-story.is-loading')), null, { timeout: 30000 });

      const initial = await priceState(page);
      const reader = await retainReader(page);
      reply = { spot: { tezos: { usd: '' } }, horizons: horizons('0.99') };
      await refreshPrice(page);
      assert.deepEqual(await priceState(page), initial, `${width}: malformed HTTP 200 cannot replace the last good price`);
      assert.equal(await page.evaluate(() => sessionStorage.getItem('tezos_price_cache')), null, 'Malformed readings never enter the price cache');
      await assertReader(page, reader, `${width}: invalid refresh retains reading state`);

      reply = { spot: { tezos: { usd: 'invalid' } }, horizons: horizons(0.73, {
        price_change_percentage_24h_in_currency: -1, price_change_percentage_7d_in_currency: 0,
        price_change_percentage_30d_in_currency: null, market_cap: 0
      }) };
      await refreshPrice(page);
      const partial = await priceState(page);
      assert.equal(partial.usd, '$0.730');
      assert.equal(partial.btc, '—');
      assert.equal(partial.marketCap, 'MCap $0');
      assert.deepEqual(partial.changes.map(change => change.text), ['-1.0%', '+0.0%', '—']);
      assert.equal(partial.changes[0].negative, true);
      assert.equal(partial.changes[1].positive, true);
      assert.deepEqual(partial.changes[2], { text: '—', label: 'XTZ 30 day price change unavailable', positive: false, negative: false });
      await assertReader(page, reader, `${width}: valid alternate endpoint retains reader and explicit unknowns`);

      // Reverse the partial outage: unavailable horizons must not invent flat
      // weekly/monthly returns, while zero from the valid spot source stays zero.
      reply = { spot: spot(0.74, { btc: 0, usd_24h_change: 0, usd_market_cap: 0 }), horizons: [] };
      await refreshPrice(page);
      const zero = await priceState(page);
      assert.equal(zero.usd, '$0.740');
      assert.equal(zero.btc, '0 sats');
      assert.equal(zero.marketCap, 'MCap $0');
      assert.deepEqual(zero.changes.map(change => change.text), ['+0.0%', '—', '—']);
      assert.equal(zero.changes[1].positive, false);
      assert.equal(zero.changes[1].negative, false);
      await assertReader(page, reader, `${width}: source zero and unavailable horizons retain reader`);

      reply = { status: 503 };
      await refreshPrice(page);
      assert.deepEqual(await priceState(page), zero, `${width}: complete HTTP failure retains last-good facts`);
      await assertReader(page, reader, `${width}: failed refresh retains reader`);

      reply = { spot: spot(0.75), horizons: horizons(0.75) };
      await refreshPrice(page);
      assert.equal((await priceState(page)).usd, '$0.750', 'A successful request recovers after malformed and HTTP failures');
      await assertReader(page, reader, `${width}: recovered refresh retains reader`);

      // Hold real route responses after dispatch. Hiding the document while the
      // pair is in flight must defer DOM work until one visible catch-up.
      reply = { spot: spot(0.76), horizons: horizons(0.76) };
      const hiddenBefore = await priceState(page);
      priceGate = new Promise(resolve => { releasePrice = resolve; });
      const dispatched = new Promise(resolve => { twoRequests = { target: requestCount + 2, resolve }; });
      await page.evaluate(async () => {
        const { fetchXTZPrice } = await import('/js/features/price.js');
        sessionStorage.removeItem('tezos_price_cache');
        document.dispatchEvent(new Event('visibilitychange'));
        window.__hiddenPriceDone = fetchXTZPrice();
      });
      await dispatched;
      await page.evaluate(() => { window.__sourceVisibility = 'hidden'; document.dispatchEvent(new Event('visibilitychange')); });
      releasePrice(); priceGate = null;
      await page.evaluate(() => window.__hiddenPriceDone);
      assert.deepEqual(await priceState(page), hiddenBefore, 'A request finishing in a hidden tab cannot mutate the reading surface');
      const beforeCatchupRequests = requestCount;
      await page.evaluate(async () => {
        window.__sourceVisibility = 'visible'; document.dispatchEvent(new Event('visibilitychange'));
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });
      assert.equal((await priceState(page)).usd, '$0.760');
      assert.equal(requestCount, beforeCatchupRequests, 'Visible catch-up uses the completed validated pair once');
      await assertReader(page, reader, `${width}: hidden completion and visible catch-up preserve reading state`);

      // A user scroll immediately after mutation wins over the quiet helper's
      // delayed restoration. Trigger reader intent at the MutationObserver
      // checkpoint, before any requestAnimationFrame restoration can run.
      await page.evaluate(() => {
        const observer = new MutationObserver(() => {
          observer.disconnect();
          window.dispatchEvent(new WheelEvent('wheel', { deltaY: 69 }));
          window.scrollTo({ top: scrollY + 69, behavior: 'instant' });
          window.__sourceImmediateScroll = scrollY;
        });
        observer.observe(document.querySelector('#price-bar .price-value'), { childList: true, characterData: true, subtree: true });
      });
      reply = { spot: spot(0.77), horizons: horizons(0.77) };
      await refreshPrice(page);
      const finalScroll = await page.evaluate(() => ({ expected: window.__sourceImmediateScroll, actual: scrollY }));
      assert.equal(finalScroll.expected, reader.scroll + 69, 'The reader actually moved the page after reconciliation');
      assert.equal(finalScroll.actual, finalScroll.expected, 'Delayed restoration never overwrites subsequent reader scroll');
      await assertReader(page, { ...reader, scroll: finalScroll.expected }, `${width}: immediate reader scroll, focus and selection survive`);

      // Exercise the actual browser API/cache boundary, including revalidation
      // when an earlier generic caller populated a cache before a typed caller.
      const invalid = await page.evaluate(async () => {
        const { fetchWithRetry } = await import('/js/core/api.js');
        const { validateStatistics } = await import('/js/core/source-payloads.mjs');
        try { await fetchWithRetry('/__source-payload-test', { validate: validateStatistics }, 1); return null; }
        catch (error) { return { name: error.name, message: error.message }; }
      });
      assert.equal(invalid?.name, 'TypeError');
      assert.match(invalid.message, /TzKT statistics/);
      assert.equal(sourceRequests, 1);
      await page.evaluate(async () => {
        const { fetchWithRetry } = await import('/js/core/api.js');
        await fetchWithRetry('/__source-payload-test', {}, 1);
      });
      statistics = { totalSupply: 100, totalOwnStaked: 0, totalExternalStaked: 0, totalFrozen: 50, totalOwnDelegated: 10, totalExternalDelegated: 20 };
      const validated = await page.evaluate(async () => {
        const { fetchWithRetry } = await import('/js/core/api.js');
        const { validateStatistics, validateMetadata } = await import('/js/core/source-payloads.mjs');
        const first = await fetchWithRetry('/__source-payload-test', { validate: validateStatistics }, 1);
        const second = await fetchWithRetry('/__source-payload-test', { validate: validateStatistics }, 1);
        return { first, cached: first === second, unavailable: validateMetadata({ level_info: { cycle: null, cycle_position: null } }) };
      });
      assert.deepEqual(validated.first, statistics, 'Actual zero stake survives browser source validation');
      assert.equal(validated.cached, true, 'Validated browser result remains reusable');
      assert.deepEqual(validated.unavailable, { level_info: { cycle: null, cycle_position: null } });
      assert.equal(sourceRequests, 3, 'Invalid cached data is evicted and only one validated replacement is fetched');

      if (artifactsDir) await page.screenshot({ path: path.join(artifactsDir, `source-payloads-${width}.png`) });
      bothRpcHostsDown = true;
      const rpcFailure = await page.evaluate(async () => {
        const { fetchWithRetry } = await import('/js/core/api.js');
        try {
          await fetchWithRetry('https://eu.rpc.tez.capital/chains/main/blocks/head/header', { cache: 'no-store', memoryCache: false }, 1);
          return 'unexpected success';
        } catch (error) { return error.message; }
      });
      assert.match(rpcFailure, /503/, 'both RPC hosts down is an explicit failure, never cached live data');
      bothRpcHostsDown = false;
      await page.goto(`${baseUrl}/landing.html`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => /^\d/.test(document.getElementById('lp-bakers')?.textContent || '')
        && /^\d.*%$/.test(document.getElementById('lp-staked')?.textContent || '')
        && /^C\d/.test(document.getElementById('lp-cycle')?.textContent || '')
        && /^\$\d/.test(document.getElementById('lp-price')?.textContent || ''));
      assert.equal(await page.locator('#lp-staked').textContent(), '29.0%', 'landing reads the surviving RPC supply/stake instead of silently falling back');
      if (artifactsDir) await page.screenshot({ path: path.join(artifactsDir, `rpc-landing-${width}.png`) });
      const lastTheme = page.locator('#theme-grid .theme-card').last();
      await lastTheme.click();
      assert.equal(await lastTheme.evaluate(node => node.classList.contains('selected')), true, 'landing theme control still works after module loading');
      assert.deepEqual(errors, [], `${width}: no uncaught browser errors`);
      console.log(`ok - ${width}px source validation, partial price recovery, zero/null semantics, hidden catch-up and exact reader preservation`);
    } finally { releasePrice(); await context.close(); }
  }
}
