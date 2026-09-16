import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { CHAMBER_FEATURES } from '../../js/core/chamber-features.mjs';

const frames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const rooms = Object.fromEntries(Object.values(CHAMBER_FEATURES).filter(x => x.standalone).map(x => [x.standalone.route, x.standalone]));

// Each selector describes a future reading area, not a search for the word
// "loading". Existing themed loaders are a deliberate, separate contract.
const chamberCases = [
  ...['capital', 'minerals', 'uranium', 'metals', 'ecosystem'].map(route => ({ route, selector: '.chamber-first-paint-lines [data-text-pending]', count: 12 })),
  { route: 'whales', selector: '.whale-watch-view .text-loading-rows [data-text-pending]', count: 6 },
  { route: 'stake', selector: '.staking-room-loading [data-text-pending]', count: 7 },
  { route: 'leaderboard', selector: '.text-loading-rows [data-text-pending]', count: 6 },
  { route: 'funding', selector: '.funding-skeleton [data-text-pending]', count: 9 },
  { route: 'history', selector: '.chart-stats [data-text-pending]', count: 45 },
  { route: 'anthology', selector: '[data-text-pending]', min: 1 },
  { route: 'pulse', selector: '[data-text-pending]', min: 20 },
  ...['tezosx', 'tz4', 'chamber', 'l2chamber', 'lb', 'domains', 'maxis', 'tezoscrp', 'health'].map(route => ({ route, themed: '.chamber-loading-text' }))
];

export async function assertPendingText(page, selector, { count, min = 1, reducedMotion = false } = {}) {
  const values = await page.locator(selector).evaluateAll(nodes => nodes.filter(node => node.getClientRects().length && !node.closest('[hidden]')).map(node => {
    const style = getComputedStyle(node), box = node.getBoundingClientRect();
    return { text: node.textContent.slice(0, 70), width: box.width, height: box.height,
      color: style.color, background: style.backgroundColor, image: style.backgroundImage,
      animation: style.animationName, opacity: style.opacity, radius: parseFloat(style.borderRadius) };
  }));
  if (count !== undefined) assert.equal(values.length, count, `${selector}: every expected pending text slot`);
  assert.ok(values.length >= min, `${selector}: missing future text area (${values.length}/${min})`);
  for (const value of values) {
    assert.ok(value.width > 0 && value.height > 0 && value.radius > 0, `invisible bubble ${JSON.stringify(value)}`);
    assert.equal(value.opacity, '1');
    assert.match(value.color, /rgba\(.+, 0\)$/);
    assert.doesNotMatch(value.background, /rgba\(.+, 0\)$/);
    assert.match(value.image, /linear-gradient/);
    assert.equal(value.animation, reducedMotion ? 'none' : 'textLoadingShimmer', JSON.stringify(value));
  }
}

async function heldPage(browser, baseUrl, installFeatureMocks, { width = 1440, reducedMotion = false, address, linked, fail = false, match = '' } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: 'block', reducedMotion: reducedMotion ? 'reduce' : 'no-preference' });
  await installFeatureMocks(context, { blockHeadAutoAdvance: false });
  await context.addInitScript(({ address, linked, width }) => {
    localStorage.setItem('tezos-systems-theme', width === 390 ? 'clean' : 'matrix');
    localStorage.setItem('tezos-toured', '1'); localStorage.setItem('tezos-welcomed', '1');
    localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    if (address) {
      localStorage.setItem('tezos-systems-my-baker-address', address);
      localStorage.setItem('tezos-systems-saved-addresses', JSON.stringify([{ address, label: 'Loading test', included: true }]));
    }
    if (linked) localStorage.setItem('tezos-systems-linked-etherlink-accounts-v1', JSON.stringify(linked));
  }, { address, linked, width });
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let holding = true;
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (['fetch', 'xhr'].includes(request.resourceType()) && (url.origin !== new URL(baseUrl).origin || /\/data\/|\.json$/.test(url.pathname)) && !/asset|font|\.css$|\.js$|\.mjs$/.test(url.pathname)) {
      if (match && !new RegExp(match).test(url.href + '\n' + (request.postData() || ''))) return route.fallback();
      if (holding) await gate;
      if (fail) return route.fulfill({ status: 503, body: 'Loading smoke: unavailable source' });
    }
    return route.fallback();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  return { page, context, release: () => { holding = false; release(); } };
}

async function settled(page, root) {
  try {
    await page.waitForFunction(selector => ![...document.querySelectorAll(`${selector} [data-text-pending="true"]`)].some(node => node.getClientRects().length && !node.closest('[hidden]')), root, { timeout: 30000 });
  } catch (error) {
    const pending = await page.locator(`${root} [data-text-pending]`).evaluateAll(nodes => nodes.filter(node => node.getClientRects().length && !node.closest('[hidden]')).map(node => ({ id: node.id, class: node.className, text: node.textContent.slice(0, 100), parent: node.parentElement.id || node.parentElement.className })));
    throw new Error(`Stranded text placeholders: ${JSON.stringify(pending)}`, { cause: error });
  }
}

export async function smokeTextLoadingChambers(browser, baseUrl, support) {
  if (support.artifactsDir) await mkdir(support.artifactsDir, { recursive: true });
  for (const width of [1440, 390]) for (const test of chamberCases) {
    const reducedMotion = width === 390;
    const held = await heldPage(browser, baseUrl, support.installFeatureMocks, { width, reducedMotion });
    const { page } = held;
    try {
      const root = `#${rooms[test.route].overlayId}`;
      await page.goto(`${baseUrl}/${test.route}/`, { waitUntil: 'domcontentloaded' });
      await page.locator(root).waitFor();
      await page.locator(`${root} ${test.selector || test.themed}`).first().waitFor();
      await frames(page);
      if (test.themed) {
        const loader = page.locator(`${root} ${test.themed}`).first();
        assert.ok((await loader.textContent()).trim(), `${test.route}: themed text retained`);
        assert.equal(await loader.getAttribute('data-text-pending'), null, `${test.route}: do not replace the themed loader`);
        if (!reducedMotion) assert.notEqual(await loader.evaluate(node => getComputedStyle(node).animationName), 'none', `${test.route}: existing theme effect retained`);
      } else {
        await assertPendingText(page, `${root} ${test.selector}`, { ...test, reducedMotion });
        // Also inspect other explicit fields, including supplementary status text.
        await assertPendingText(page, `${root} [data-text-pending]`, { reducedMotion });
      }
      if (support.artifactsDir && ['capital', 'history', 'funding', 'pulse'].includes(test.route)) await page.screenshot({ path: path.join(support.artifactsDir, `text-loading-${test.route}-${width}.png`) });
      held.release();
      await settled(page, root);
      console.log(`ok - pending text ${test.route} ${width}px`);
      if (test.themed) await page.locator(`${root} ${test.themed}`).waitFor({ state: 'hidden' });
    } catch (error) { throw new Error(`${test.route} ${width}px: ${error.message}`, { cause: error }); }
    finally { held.release(); await held.context.close(); }
  }
}

const myCases = [
  ['overview', '[data-my-tezos-scope-total] strong[data-text-pending]', 3],
  ['baker-signal', '.drawer-operator-detail[data-text-pending]', 7],
  ['portfolio', '#portfolio-summary strong[data-text-pending]', 4],
  ['transactions', '[data-transactions-total] strong[data-text-pending]', 3],
  ['collection', '[data-text-pending]', 13],
  ['story', '[data-text-pending]', 13]
];
export async function smokeTextLoadingMyTezos(browser, baseUrl, support) {
  const failures = [];
  for (const width of [1440, 390]) for (const [view, selector, count] of myCases) for (const fail of (width === 1440 ? [false, true] : [false])) {
    const held = await heldPage(browser, baseUrl, support.installFeatureMocks, { width, address: support.address, reducedMotion: width === 390, fail });
    const { page } = held;
    try {
      await page.goto(`${baseUrl}/my/?view=${view}`, { waitUntil: 'domcontentloaded' });
      await page.locator(`#my-tezos-tab-${view}`).click();
      await page.locator(`#my-tezos-panel-${view} ${selector}`).first().waitFor();
      await frames(page);
      const root = `#my-tezos-panel-${view}`;
      await assertPendingText(page, `${root} ${selector}`, { count, reducedMotion: width === 390 });
      await assertPendingText(page, `${root} [data-text-pending]`, { reducedMotion: width === 390 });
      if (support.artifactsDir) await page.screenshot({ path: path.join(support.artifactsDir, `text-loading-my-${view}-${width}.png`) });
      held.release();
      await settled(page, root);
      console.log(`ok - pending text My Tezos ${view} ${width}px ${fail ? 'failure' : 'success'}`);
      if (fail) continue;
      // Cached tab reopening must never obscure the facts just read.
      await page.locator('#my-tezos-tab-overview').click();
      await page.locator(`#my-tezos-tab-${view}`).click();
      await frames(page);
      await settled(page, root);
    } catch (error) { failures.push(`My Tezos ${view} ${width}px ${fail ? 'failure' : 'success'}: ${error.message}`); }
    finally { held.release(); await held.context.close(); }
  }
  assert.deepEqual(failures, [], failures.join('\n'));
}

const widgetCases = [['block-height', 2], ['price', 2], ['baker-count', 1], ['protocol', 3], ['staking-ratio', 3], ['governance', 2], ['combo', 1], ['baker-card', 4]];
export async function smokeTextLoadingWidgets(browser, baseUrl, support) {
  for (const width of [1440, 390]) for (const [widget, count] of widgetCases) for (const fail of [false, true]) {
    const held = await heldPage(browser, baseUrl, support.installFeatureMocks, { width, reducedMotion: width === 390, fail });
    const { page } = held;
    try {
      await page.goto(`${baseUrl}/widgets/${widget}.html?baker=${support.address}`, { waitUntil: 'load' });
      await assertPendingText(page, '.widget [data-text-pending]', { count, reducedMotion: width === 390 });
      if (widget === 'price' && width === 1440 && !fail) {
        const bubble = page.locator('[data-text-pending]').first();
        await bubble.evaluate(node => node.style.setProperty('background-image', 'none', 'important'));
        await assert.rejects(() => assertPendingText(page, '.widget [data-text-pending]'), 'missing visual must fail even when aria and markers remain');
        await bubble.evaluate(node => node.style.removeProperty('background-image'));
      }
      held.release();
      await settled(page, '.widget');
      assert.notEqual(await page.locator('.widget-freshness').getAttribute('data-state'), 'loading');
    } catch (error) { throw new Error(`${widget} ${width}px ${fail ? 'failure' : 'success'}: ${error.message}`, { cause: error }); }
    finally { held.release(); await held.context.close(); }
  }
}

export async function smokeTextLoadingTools(browser, baseUrl, support) {
  const cases = [
    { name: 'home-price', selector: '#price-bar [data-text-pending]', min: 2, domCount: 6 },
    { name: 'home-activity', selector: '#header-activity-line [data-text-pending]', min: 1, domCount: 4 },
    { name: 'home-build', selector: '#build-version[data-text-pending]', count: 1 },
    { name: 'market-watch', selector: '#price-intelligence [data-text-pending]', count: 16, action: page => page.evaluate(async () => { const module = await import('/js/features/price-intelligence.js'); void module.initPriceIntelligence({ cycle: 961 }); }) },
    { name: 'native', root: '#native-explorer-overlay', selector: '#native-explorer-overlay [data-text-pending]', count: 7, action: page => page.evaluate(async () => { const module = await import('/js/features/native-explorer.js'); void module.openNativeExplorer('block', '12345678'); }) },
    { name: 'report', root: '#report-card-overlay', selector: '#report-card-overlay [data-text-pending]', count: 1, action: page => page.evaluate(async address => { const module = await import('/js/features/baker-report-card.js'); void module.showBakerReportCard(address); }, support.address) },
    { name: 'card-history', root: '#card-history-modal', selector: '#card-history-modal [data-text-pending]', count: 1, action: page => page.evaluate(async () => { const module = await import('/js/features/history.js'); void module.openCardHistoryModal('total-bakers'); }) },
    { name: 'search', root: '#hero-search-panel', selector: '#hero-search-panel [data-text-pending]', min: 2, action: async page => { await page.locator('#hero-search-input').fill('qa-baker.tez'); await page.locator('#hero-search-panel[aria-busy="true"]').waitFor(); } },
    { name: 'hen', root: '#hen-overlay', selector: '#hen-loading [data-text-pending]', count: 1, action: page => page.evaluate(() => { void window.openHenMode(); }) },
    { name: 'hen-standalone', root: '#hen-overlay', url: '/hen/', standalone: true, selector: '#hen-loading [data-text-pending]', count: 1 },
    { name: 'calculator', root: '#calculator-section', url: '/#calculator', selector: '#calculator-section [data-text-pending]', min: 7, action: async page => { await page.locator('#calc-delegate-payout-assumption').fill('90'); await page.locator('#calc-amount').fill('1000'); } },
    { name: 'calculator-stake', root: '#calculator-section', url: '/#calculator', selector: '#calc-payout-line[data-text-pending]', count: 1, action: async page => { await page.locator('#calc-mode-toggle [data-mode="stake"]').click(); await page.locator('#calc-stake-edge-assumption').fill('10'); await page.locator('#calc-amount').fill('1000'); } },
    { name: 'comparison', root: '#comparison-section', url: '/#compare', selector: '#comparison-section [data-text-pending]', min: 1 }
  ];
  for (const width of [1440, 390]) for (const test of cases) {
    const held = await heldPage(browser, baseUrl, support.installFeatureMocks, { width, reducedMotion: width === 390 });
    const { page } = held;
    try {
      await page.goto(baseUrl + (test.url || '/'), { waitUntil: 'domcontentloaded' });
      if (!test.standalone) await page.locator('#my-tezos-btn[data-drawer-wired="1"]').waitFor();
      if (test.action) await test.action(page);
      await page.locator(test.selector).first().waitFor();
      await frames(page);
      if (test.domCount) assert.equal(await page.locator(test.selector).count(), test.domCount);
      await assertPendingText(page, test.selector, { ...test, reducedMotion: width === 390 });
      held.release();
      await page.waitForFunction(selector => !document.querySelector(selector), test.selector, { timeout: 30000 });
      if (test.name === 'search') {
        await page.locator('#hero-search-input').fill('tz1');
        const idle = page.locator('.hero-search-status-row').filter({ hasText: 'Keep typing' });
        await idle.waitFor();
        assert.equal(await idle.locator('[data-text-pending]').count(), 0, 'incomplete input is not a pending read');
      }
      console.log(`ok - pending text ${test.name} ${width}px`);
    } catch (error) { throw new Error(`${test.name} ${width}px: ${error.message}`, { cause: error }); }
    finally { held.release(); await held.context.close(); }
  }
  // Linked L2 data must not display zeroes or empty activity until its reads end.
  for (const fail of [false, true]) {
    const held = await heldPage(browser, baseUrl, support.installFeatureMocks, { width: 390, address: support.address, fail, linked: [{ address: support.etherlinkAddress, label: 'L2 loading test', included: true, linkedL1Addresses: [support.address] }] });
    const { page } = held;
    try {
      await page.goto(`${baseUrl}/my/?view=tezos-x`, { waitUntil: 'domcontentloaded' });
      await page.locator('#my-tezos-tab-tezos-x').click();
      await page.locator('#tezosx-details [data-text-pending]').first().waitFor();
      await assertPendingText(page, '#my-tezos-panel-tezos-x [data-text-pending]', { min: 10 });
      held.release();
      await settled(page, '#my-tezos-panel-tezos-x');
    } finally { held.release(); await held.context.close(); }
  }
}

export async function smokeTextLoadingSecondary(browser, baseUrl, support) {
  const cases = [
    ...[['capital', '#capital-entry-card'], ['ecosystem', '#ecosystem-entry-card'], ['maxis', '#maxis-entry-card'], ['tezoscrp', '#tezoscrp-entry-card'], ['lb', '#lb-entry-card'], ['whales', '#whale-watch-entry-card']].map(([name, root]) => ({ name: `launcher-${name}`, root, selector: `${root} [data-text-pending]`, action: async page => {
      const category = await page.locator(root).evaluate(node => node.closest('.chamber-category')?.dataset.chamberCategory);
      if (category) {
        const toggle = page.locator(`.chamber-category[data-chamber-category="${category}"] > .chamber-category-head .chamber-category-toggle`);
        if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
      }
      await page.waitForFunction(selector => !document.querySelector(selector)?.hasAttribute('data-chamber-skeleton'), root);
      await page.locator(root).scrollIntoViewIfNeeded();
      await page.locator(root).hover();
    } })),
    { name: 'ledger-account', url: '/ledger-flow/', selector: '.ledger-flow-empty-panel [data-text-pending]', min: 6, action: page => page.evaluate(async address => { const module = await import('/js/features/ledger-flow.js'); void module.openLedgerFlowChamber(address); }, support.address) },
    { name: 'ctez-scan', url: '/ctez/', selector: '#ctez-oven-list [data-text-pending]', min: 6, action: async page => { await page.locator('#ctez-readonly-address').fill(support.address); await page.locator('#ctez-readonly-scan').evaluate(form => form.requestSubmit()); } },
    { name: 'domain-lookup', url: '/domains/', match: 'TezosDomainsNameLookup', selector: '#tezos-domains-lookup-result[data-text-pending]', action: async page => { await page.locator('#tezos-domains-lookup-input').fill('loading-contract.tez'); await page.locator('#tezos-domains-lookup-form').evaluate(form => form.requestSubmit()); } },
    { name: 'governance-history', url: '/chamber/', match: 'governance-votes', selector: '.vote-log-context [data-text-pending], .comparison-context [data-text-pending]', min: 2 },
    { name: 'governance-ballots', url: '/chamber/', match: 'operations/ballots', selector: '.momentum-loading [data-text-pending], .current-vote-context [data-text-pending]', min: 2 },
    { name: 'l2-history', url: '/l2chamber/', match: 'entrypoint=new_proposal', selector: '.etherlink-gov-history-panel [data-text-pending]', min: 2 },
    { name: 'lb-lore', url: '/lb/', match: 'protocol', selector: '.lb-lore-loading [data-text-pending]', action: page => page.locator('#lb-lore-toggle').click() },
    { name: 'maxis-season', url: '/maxis/?view=season', match: '/data/maxis/.*summary', selector: '#maxis-panel-season [data-text-pending]' },
    { name: 'maxis-passport', url: `/maxis/?view=passport&address=${support.address}`, match: '/data/maxis/.*(?:shards|passports)', selector: '.maxis-passport-shell [data-text-pending]' }
  ];
  const failures = [];
  for (const test of cases) {
    const held = await heldPage(browser, baseUrl, support.installFeatureMocks, { match: test.match, address: test.name === 'ledger-account' ? support.address : undefined });
    const { page } = held;
    try {
      await page.goto(baseUrl + (test.url || '/'), { waitUntil: 'domcontentloaded' });
      if (!test.url) await page.locator('#my-tezos-btn[data-drawer-wired="1"]').waitFor();
      if (test.action) await test.action(page);
      await page.locator(test.selector).first().waitFor({ state: 'attached' });
      while (await page.locator(`details:not([open]):has(${test.selector}) > summary`).count()) await page.locator(`details:not([open]):has(${test.selector}) > summary`).first().click();
      await page.locator(test.selector).first().waitFor();
      await frames(page);
      await assertPendingText(page, test.selector, { min: test.min || 1 });
      held.release();
      await page.waitForFunction(selector => ![...document.querySelectorAll(selector)].some(node => node.getClientRects().length && !node.closest('[hidden]')), test.selector, { timeout: 30000 });
      console.log(`ok - pending text ${test.name}`);
    } catch (error) { failures.push(`${test.name}: ${error.message}`); console.log(`failed - pending text ${test.name}: ${error.message}`); }
    finally { held.release(); await held.context.close(); }
  }
  assert.deepEqual(failures, []);
}
