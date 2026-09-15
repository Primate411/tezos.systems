import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

// These are actual rendered frames, not selectors for the text being replaced.
// A terminal receipt list may grow downward. Its top/width and every preceding
// card/control still have to stay fixed. Disclosures may grow only on user input.
const CASES = [
  { view: 'overview', stable: ['.my-tezos-balance-hero', '.drawer-account-details', '.my-tezos-overview-transactions', '#drawer-rewards', '#drawer-brief', '#drawer-more-section', '.drawer-share-section', '.drawer-footer', '.network-context-header', '.network-personal-spotlight-copy', '.network-context-now-heading', '.network-personal-facts', '.network-context-signals'], tail: '#drawer-network' },
  { view: 'baker-signal', stable: ['#drawer-operator-status', '#drawer-baker-brief', '.brief-section-baker', '.drawer-baker-incidents', '.drawer-attestation-allowance', '.drawer-baker-grade', '.brief-section-governance', '.drawer-baker-schedule', '.drawer-schedule-upcoming', '.drawer-schedule-right:nth-child(1)', '.drawer-schedule-right:nth-child(2)', '.drawer-schedule-right:nth-child(3)', '.drawer-maintenance', '.capacity-bars', '.my-baker-grid:not(.my-baker-loading-grid)', '#drawer-baker-history', '#drawer-more-section'], aliases: { '.my-baker-grid:not(.my-baker-loading-grid)': '.my-baker-grid', '.brief-section-baker': '.drawer-loading-card-baker' }, tail: '#drawer-baker-activity' },
  { view: 'portfolio', stable: ['#portfolio-summary', '.portfolio-history-panel', '.portfolio-wallets-panel', '#portfolio-freshness', '#drawer-more-section'] },
  { view: 'transactions', stable: ['.my-tezos-feature-summary', '.transactions-mode-pills', '.portfolio-activity-footer', '#drawer-more-section'], tail: '#portfolio-activity-list' },
  { view: 'collection', stable: ['#collection-summary', '.collection-profile-details', '.my-tezos-feature-footer', '#drawer-more-section'], tail: '#collection-grid' },
  { view: 'story', stable: ['.tezos-story-identity', '.tezos-story-metrics', '.tezos-story-badges', '.tezos-story-actions', '.tezos-story-era-rail', '.tezos-story-next', '.my-tezos-recent-chapter', '#drawer-more-section'] },
  { view: 'tezos-x', stable: ['#tezosx-summary', '.tezosx-shell > .my-tezos-feature-panel', '#drawer-more-section', '.tezosx-detail-section:first-child', '.tezosx-detail-tabs', '.tezosx-detail-section[data-tezosx-detail-view]:not([hidden]) > h4'], tail: '#tezosx-details' }
];
const PEER_GRIDS = '#drawer-baker-brief, .drawer-schedule-upcoming, .drawer-operator-grid, .capacity-bars, .my-baker-grid, .rt-grid, .portfolio-summary-grid, .my-tezos-scope-totals, .my-tezos-feature-summary, .collection-grid, .tezos-story-metrics, .network-context-columns, .network-personal-facts, .network-context-signals, .tezosx-assets-grid, .drawer-more-actions';

function frameDifferences(before, after, spec) {
  const failures = [];
  for (const [selector, initial] of Object.entries(before.frames)) {
    const final = after.frames[selector];
    if (!initial || !final) { failures.push(`${selector}: missing ${!initial ? 'pending' : 'loaded'} frame`); continue; }
    const dimensions = selector === spec.tail ? ['x', 'y', 'width'] : ['x', 'y', 'width', 'height'];
    for (const key of dimensions) if (Math.abs(initial[key] - final[key]) > 1) failures.push(`${selector} ${key}: ${initial[key].toFixed(1)} → ${final[key].toFixed(1)}`);
  }
  return failures;
}

async function snapshot(page, spec, pending = false) {
  return page.evaluate(({ spec, pending, peerGrids }) => {
    const panel = document.querySelector(`[data-my-tezos-panel="${spec.view}"]`);
    const rect = node => {
      if (!node || !node.getClientRects().length) return null;
      const r = node.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    const frames = Object.fromEntries([...spec.stable, '.my-tezos-reading', ...(spec.tail ? [spec.tail] : [])].map(selector => [selector, rect(panel.querySelector(pending ? spec.aliases?.[selector] || selector : selector))]));
    const unequal = [];
    const clipped = [];
    for (const grid of panel.querySelectorAll(peerGrids)) {
      const rows = [];
      for (const node of grid.children) {
        const r = rect(node);
        if (!r || !r.width || !r.height) continue;
        if (node.scrollHeight > node.clientHeight + 1 && !['auto', 'scroll'].includes(getComputedStyle(node).overflowY)) clipped.push({ card: node.className, overflow: node.scrollHeight - node.clientHeight });
        let row = rows.find(row => Math.abs(row.y - r.y) <= 1);
        if (!row) rows.push(row = { y: r.y, items: [] });
        row.items.push({ ...r, class: node.className });
      }
      for (const row of rows) if (row.items.length > 1 && Math.max(...row.items.map(r => r.height)) - Math.min(...row.items.map(r => r.height)) > 1) unequal.push({ grid: grid.id || grid.className, ...row });
    }
    const details = Object.fromEntries(spec.stable.map(selector => { const node = panel.querySelector(pending ? spec.aliases?.[selector] || selector : selector); return [selector, [...(node?.children || [])].map(child => ({ id: child.id || child.className, rect: rect(child), text: child.textContent.trim().slice(0, 80) }))]; }));
    const tail = spec.tail && panel.querySelector(spec.tail);
    const stranded = tail ? [...panel.querySelectorAll('button, input, select, details, .my-tezos-reading, #drawer-more-section, .brief-section, .my-tezos-feature-panel, .my-tezos-feature-footer, .portfolio-activity-footer')]
      .filter(node => !tail.contains(node) && !node.contains(tail) && rect(node)?.y >= rect(tail).y + 1)
      .map(node => node.id || node.className) : [];
    const body = document.getElementById('drawer-body');
    return { frames, details, unequal, clipped, stranded, overflow: body.scrollWidth - body.clientWidth };
  }, { spec, pending, peerGrids: PEER_GRIDS });
}

export async function smokeMyTezosLayoutStates(browser, baseUrl, { installFeatureMocks, address, etherlinkAddress, artifactsDir }) {
  const failures = [];
  for (const [width, height, theme] of [[1440, 1000, 'dark'], [390, 844, 'clean'], [320, 740, 'default'], [844, 390, 'clean']]) {
    for (const spec of CASES) {
      const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block', reducedMotion: 'reduce' });
      let release;
      const gate = new Promise(resolve => { release = resolve; });
      try {
        await installFeatureMocks(context);
        await context.route('**/v1/rights?**', route => {
          const query = new URL(route.request().url()).searchParams;
          if (query.get('type') !== 'baking' || query.get('status') !== 'future') return route.fallback();
          return route.fulfill({ contentType: 'application/json', body: JSON.stringify(Array.from({ length: 100 }, (_, index) => ({ level: 12345858 + index * 600, round: 0, status: 'future', type: 'baking' }))) });
        });
        let held = 0;
        await context.route('**/*', async route => {
          const request = route.request();
          if (['fetch', 'xhr'].includes(request.resourceType()) && /api\.tzkt\.io|rpc\.tez\.capital|data\.objkt\.com|explorer\.etherlink\.com|node\.mainnet\.etherlink\.com/.test(new URL(request.url()).hostname)) {
            held += 1;
            await gate;
          }
          await route.fallback();
        });
        await context.addInitScript(({ address, etherlinkAddress, theme }) => {
          for (const key of ['tezos-toured', 'tezos-welcomed', 'tezos-systems-my-tezos-dismissed']) localStorage.setItem(key, '1');
          localStorage.setItem('tezos-systems-theme', theme);
          localStorage.setItem('tezos-systems-my-baker-address', address);
          localStorage.setItem('tezos-systems-saved-addresses', JSON.stringify([{ address, label: 'Primary wallet', included: true }]));
          localStorage.setItem('tezos-systems-linked-etherlink-accounts-v1', JSON.stringify([{ address: etherlinkAddress, label: 'Etherlink wallet', included: true, linkedL1Addresses: [address] }]));
        }, { address, etherlinkAddress, theme });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(`${baseUrl}/my/?view=${spec.view}`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => document.querySelector('#my-tezos-css')?.sheet && document.querySelector('#drawer-connected')?.style.display !== 'none');
        await page.evaluate(() => document.fonts.ready);
        if (spec.view === 'collection') await page.waitForFunction(() => document.querySelector('#collection-status')?.dataset.state === 'loading');
        if (spec.view === 'tezos-x') await page.waitForFunction(() => document.querySelector('#tezosx-status')?.dataset.state === 'loading');
        const tabs = await page.locator('[data-my-tezos-panel]').evaluateAll(nodes => nodes.map(node => node.dataset.myTezosPanel).sort());
        assert.deepEqual(tabs, CASES.map(item => item.view).sort(), 'Every My Tezos tab needs loading geometry coverage');
        const before = await snapshot(page, spec, true);
        assert(held > 0, `${spec.view}: the pending read must really be held`);
        if (artifactsDir) { await mkdir(artifactsDir, { recursive: true }); await page.screenshot({ path: path.join(artifactsDir, `canvas-${width}-${spec.view}-pending.png`) }); }
        release();
        await page.waitForFunction(() => window._myTezosData?.participation && !window._myTezosData.loading, null, { timeout: 45000 });
        if (spec.view === 'overview') {
          await page.evaluate(async () => {
            const { initDailyBriefing } = await import('/js/features/daily-briefing.js');
            await initDailyBriefing({ cycle: 1000, blockLevel: 12345678, totalSupply: 1070000000, activeBakers: 200 }, 0.74);
          });
          await page.locator('#rewards-tracker-container:not([aria-busy="true"]) .rt-grid').waitFor(); await page.locator('#drawer-network .network-context-panel[aria-busy="false"]').waitFor(); }
        if (spec.view === 'baker-signal') {
          await page.locator('#my-baker-results .my-baker-grid:not(.my-baker-loading-grid)').waitFor();
          await page.locator('#drawer-baker-history .rt-calendar[data-reward-kind]').waitFor();
          await page.locator('.drawer-baker-grade[data-grade-state="current"]').waitFor();
        }
        if (spec.view === 'collection') await page.waitForFunction(() => document.querySelector('#collection-status')?.dataset.state === 'complete');
        if (spec.view === 'transactions') await page.locator('#portfolio-activity-list .portfolio-activity-item').first().waitFor();
        if (spec.view === 'tezos-x') await page.waitForFunction(() => document.querySelector('#tezosx-status')?.dataset.state === 'complete');
        const after = await snapshot(page, spec);
        failures.push(...frameDifferences(before, after, spec).map(message => `${width} ${spec.view} ${message}`));
        for (const [state, value] of [['pending', before], ['loaded', after]]) {
          if (value.stranded.length) failures.push(`${width} ${spec.view} ${state} controls/cards below a growing list: ${JSON.stringify(value.stranded)}`);
          if (value.clipped.length) failures.push(`${width} ${spec.view} ${state} clipped cards: ${JSON.stringify(value.clipped)}`);
          if (value.unequal.length) failures.push(`${width} ${spec.view} ${state} unequal peer cards: ${JSON.stringify(value.unequal)}`);
          if (value.overflow > 1) failures.push(`${width} ${spec.view} ${state}: ${value.overflow}px horizontal overflow`);
        }
        if (spec.view === 'baker-signal' && width === 1440) {
          const titleTops = await page.locator('.drawer-schedule-right > .drawer-operator-label, .drawer-maintenance > h4').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().top));
          assert.equal(titleTops.length, 4, 'Three baking rights and maintenance need aligned headings');
          assert(Math.max(...titleTops) - Math.min(...titleTops) <= 1, 'Baking and maintenance headings must share a baseline');
          // Prove the guard rejects both regressions from the reported screenshots.
          await page.locator('.drawer-baker-grade').evaluate(node => { node.style.display = 'none'; });
          assert(frameDifferences(after, await snapshot(page, spec), spec).some(message => message.includes('.drawer-baker-grade: missing')), 'Missing grade card must fail geometry coverage');
          await page.locator('.drawer-baker-grade').evaluate(node => { node.style.removeProperty('display'); });
          await page.locator('.brief-section-baker').evaluate(node => { node.style.minHeight = '0'; node.style.height = '160px'; node.style.overflow = 'hidden'; node.style.alignSelf = 'start'; });
          assert((await snapshot(page, spec)).unequal.some(row => row.grid === 'drawer-baker-brief'), 'Unequal status/grade heights must fail peer coverage');
          await page.locator('.brief-section-baker').evaluate(node => { for (const property of ['min-height', 'height', 'overflow', 'align-self']) node.style.removeProperty(property); });
          assert.deepEqual(frameDifferences(after, await snapshot(page, spec), spec), [], 'Regression probes must restore the page');
        }
        if (spec.view === 'tezos-x') {
          for (const view of ['tokens', 'nfts', 'transactions']) {
            await page.locator(`[data-tezosx-detail-tab="${view}"]`).click();
            assert(await page.locator(`[data-tezosx-detail-view="${view}"]`).isVisible(), `${width} Etherlink ${view} receipts must remain reachable`);
          }
        }
        assert.deepEqual(errors, [], `${width} ${spec.view}: uncaught page errors`);
        if (artifactsDir) { await page.screenshot({ path: path.join(artifactsDir, `canvas-${width}-${spec.view}-loaded.png`) }); await writeFile(path.join(artifactsDir, `canvas-${width}-${spec.view}.json`), JSON.stringify({ before, after }, null, 2)); }
        console.log(`checked - ${width} ${spec.view} loading canvas and peer heights`);
      } catch (error) { failures.push(`${width} ${spec.view}: ${error.message}`); }
      finally { release(); await context.close(); }
    }
  }
  assert.deepEqual(failures, [], `My Tezos canvas moved during loading:\n${failures.join('\n')}`);
  console.log('ok - all seven My Tezos loading canvases retain geometry and equal peer heights');
}
