import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const ROOMS = [
  ['capital', 'capital', 'capital-chamber-body', 'capitalRendered', 'capital-snapshot', 'capital-entry-summary', 'source'],
  ['ecosystem', 'ecosystem', 'ecosystem-chamber-body', 'ecosystemRendered', 'ecosystem-stats', 'ecosystem-entry-summary', 'source'],
  ['minerals', 'minerals', 'minerals-chamber-body', 'mineralsRendered', 'minerals-snapshot', 'minerals-entry-summary', 'fullSnapshot'],
  ['metals', 'metals', 'metals-chamber-body', 'metalsRendered', 'metals-snapshot', 'metals-entry-summary', 'source'],
  ['uranium', 'uranium', 'uranium-chamber-body', 'uraniumRendered', 'uranium-snapshot', 'uranium-entry-summary', 'source'],
  ['whales', 'whales', 'whale-watch-body', 'whaleWatchRendered', 'whale-watch', null, null]
];
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const digest = text => createHash('sha256').update(text).digest('hex');
function rehash(value) {
  const { contentHash, ...unsigned } = value;
  value.contentHash = digest(JSON.stringify(stable(unsigned)));
  return value;
}

export async function smokeChamberFirstPaint(browser, baseUrl, { installFeatureMocks, artifactsDir }) {
  for (const width of [1440, 390]) for (const revalidateRevision of [0, 1]) for (const [key, routeName, bodyId, renderedKey, fullName, summaryName, receiptKey] of ROOMS) {
    const label = `${key} ${width}px ${revalidateRevision ? 'newer' : 'unchanged'}`;
    let phase = 'cold render';
    const sourceText = await readFile(new URL(`../../data/${fullName}.json`, import.meta.url), 'utf8');
    const original = JSON.parse(sourceText);
    const originalSummary = summaryName ? JSON.parse(await readFile(new URL(`../../data/${summaryName}.json`, import.meta.url), 'utf8')) : null;
    let revision = 0;
    let mode = 'cold';
    let release;
    let gate = new Promise(resolve => { release = resolve; });
    let requests = 0;
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    try {
      await installFeatureMocks(context);
      await context.route(/\/data\/(?:capital-snapshot|capital-entry-summary|ecosystem-stats|ecosystem-entry-summary|minerals-snapshot|minerals-entry-summary|metals-snapshot|metals-entry-summary|uranium-snapshot|uranium-entry-summary|whale-watch)\.json/, async route => {
        const pathname = new URL(route.request().url()).pathname;
        if (![fullName, summaryName].filter(Boolean).some(name => pathname === `/data/${name}.json`)) return route.fallback();
        requests += 1;
        if (mode === 'hold' || (mode === 'cold' && pathname === `/data/${fullName}.json`)) await gate;
        if (mode === 'fail') return route.fulfill({ status: 503, body: 'Injected first-paint refresh failure' });
        const snapshot = structuredClone(original);
        if (revision) {
          snapshot.generatedAt = new Date(Date.parse(original.generatedAt) + revision * 60_000).toISOString();
          if (key === 'whales') {
            snapshot.transfers24h.window.until = snapshot.generatedAt;
            snapshot.transfers24h.window.since = new Date(Date.parse(snapshot.generatedAt) - 86_400_000).toISOString();
          } else rehash(snapshot);
        }
        const text = revision ? JSON.stringify(snapshot) : sourceText;
        let body = text;
        if (summaryName && pathname.endsWith(`${summaryName}.json`)) {
          const summary = structuredClone(originalSummary);
          summary.generatedAt = snapshot.generatedAt;
          Object.assign(summary[receiptKey], { generatedAt: snapshot.generatedAt, contentHash: snapshot.contentHash, fileSha256: digest(text) });
          body = JSON.stringify(rehash(summary));
        }
        await route.fulfill({ status: 200, contentType: 'application/json', body });
      });
      await context.addInitScript(({ key, width, fullName, summaryName }) => {
        localStorage.setItem('tezos-systems-theme', width === 390 ? 'clean' : 'matrix');
        localStorage.setItem('tezos-toured', '1');
        localStorage.setItem('tezos-welcomed', '1');
        localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
        window.__stageVisibility = sessionStorage.getItem('first-paint-warm') ? 'visible' : 'hidden';
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.__stageVisibility });
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__stageVisibility !== 'visible' });
        const override = key === 'whales' ? '__WHALE_WATCH_REFRESH_MS__' : `__${key.toUpperCase()}_CHAMBER_REFRESH_MS__`;
        window[override] = 654321;
        const interval = window.setInterval.bind(window);
        window.setInterval = (callback, delay, ...args) => {
          if (delay === 654321) window.__stageTick = () => callback(...args);
          return interval(callback, delay, ...args);
        };
        window.__stageDataPending = 0;
        window.__stageClockOffset = 0;
        const now = Date.now;
        Date.now = () => now() + window.__stageClockOffset;
        window.__stageFullStarted = 0;
        const fetch = window.fetch.bind(window);
        window.fetch = async (input, ...args) => {
          const url = new URL(typeof input === 'string' ? input : input.url, location.href);
          const tracked = [fullName, summaryName].filter(Boolean).some(name => url.pathname === `/data/${name}.json`);
          if (tracked) window.__stageDataPending += 1;
          if (url.pathname === `/data/${fullName}.json`) window.__stageFullStarted += 1;
          try { return await fetch(input, ...args); }
          finally { if (tracked) window.__stageDataPending -= 1; }
        };
      }, { key, width, fullName, summaryName });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${baseUrl}/${routeName}/`, { waitUntil: 'domcontentloaded' });
      const body = page.locator(`#${bodyId}`);
      await body.waitFor({ state: 'visible' });
      if (key !== 'whales') {
        await body.locator('.chamber-first-paint-grid section').first().waitFor();
        assert.equal(await body.locator('.chamber-first-paint-grid section').count(), 4, `${label}: section frames`);
        assert.equal(await body.locator('.chamber-first-paint').getAttribute('aria-busy'), 'true');
        if (artifactsDir) {
          await mkdir(artifactsDir, { recursive: true });
          await page.screenshot({ path: path.join(artifactsDir, `first-paint-${key}-${width}-skeleton.png`) });
        }
      }
      mode = 'ready'; release();
      await page.waitForFunction(({ bodyId, renderedKey, key }) => {
        const body = document.getElementById(bodyId);
        return body?.dataset[renderedKey] === '1' && !body.querySelector('.chamber-first-paint')
          && (key !== 'whales' || /generated/i.test(document.getElementById('whale-watch-freshness')?.textContent || ''));
      }, { bodyId, renderedKey, key });
      await page.waitForFunction(() => typeof window.__stageTick === 'function');
      assert.equal(await page.evaluate(() => document.visibilityState), 'hidden', `${label}: initial render must finish hidden`);
      const hiddenCount = requests;
      const hiddenMarkup = await body.innerHTML();
      await page.evaluate(() => { window.__stageTick(); window.__stageTick(); });
      assert.equal(requests, hiddenCount, `${label}: hidden polling must not start requests`);
      assert.equal(await body.innerHTML(), hiddenMarkup, `${label}: hidden polling must not mutate`);
      await page.waitForFunction(async key => {
        return new Promise(resolve => {
          const request = indexedDB.open('tezos-chamber-snapshots-v1', 1);
          request.onsuccess = () => {
            const db = request.result;
            const read = db.transaction('snapshots').objectStore('snapshots').get(key);
            read.onsuccess = () => { db.close(); resolve(Boolean(read.result)); };
          };
        });
      }, key);
      await page.evaluate(() => sessionStorage.setItem('first-paint-warm', '1'));
      phase = 'cached render';
      mode = 'hold'; gate = new Promise(resolve => { release = resolve; });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(bodyId => /Saved snapshot.*update pending/.test(document.getElementById(bodyId)?.textContent || ''), bodyId);
      assert.equal(await body.locator('.chamber-first-paint').count(), 0, `${label}: cached paint must not await network`);
      await page.evaluate(() => document.fonts.ready);
      // Let the dialog's opening focus handoff settle before acting as a reader.
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const otherTab = body.locator('[role="tab"][aria-selected="false"]').first();
      if (await otherTab.count()) await otherTab.click();
      await page.evaluate(bodyId => {
        const body = document.getElementById(bodyId);
        const focus = body.querySelector('[role="tab"][aria-selected="true"]')
          || [...body.querySelectorAll('button')].find(button => button.getClientRects().length);
        focus?.focus({ preventScroll: true });
        const header = body.querySelector('header');
        const text = header?.querySelector('h2')?.firstChild;
        if (text?.nodeType === Node.TEXT_NODE) {
          const range = document.createRange();
          range.setStart(text, 0); range.setEnd(text, Math.min(5, text.length));
          getSelection().removeAllRanges(); getSelection().addRange(range);
        }
        const scroll = body.closest('.chamber-room-scroll') || body;
        scroll.scrollTop = Math.min(260, scroll.scrollHeight - scroll.clientHeight);
        const horizontal = [...body.querySelectorAll('*')].find(node => node.scrollWidth > node.clientWidth + 40 && /auto|scroll/.test(getComputedStyle(node).overflowX));
        if (horizontal) horizontal.scrollLeft = 30;
        window.__stageReader = { body, scroll, header, focus, text, horizontal, left: horizontal?.scrollLeft || 0, top: scroll.scrollTop,
          headerHeight: header?.getBoundingClientRect().height,
          selected: body.querySelector('[role="tab"][aria-selected="true"]')?.id, selection: getSelection().toString(), windowY: scrollY };
        window.__stageAfterRefresh = null;
        const observer = new MutationObserver(() => {
          if (/Saved snapshot.*update pending/.test(body.textContent)) return;
          const saved = window.__stageReader;
          window.__stageAfterRefresh = {
            identity: header === body.querySelector('header'), focus: document.activeElement === focus,
            selection: getSelection().toString(), top: scroll.scrollTop, left: horizontal?.scrollLeft || 0,
            headerHeight: header?.getBoundingClientRect().height,
            selected: body.querySelector('[role="tab"][aria-selected="true"]')?.id, windowY: scrollY
          };
          observer.disconnect();
          scroll.scrollTop = Math.min(scroll.scrollHeight - scroll.clientHeight, saved.top + 37);
          window.__stageUserScroll = scroll.scrollTop;
        });
        observer.observe(body, { subtree: true, childList: true, characterData: true });
      }, bodyId);
      phase = 'quiet revalidation';
      revision = revalidateRevision; mode = 'ready'; release();
      await page.waitForFunction(() => window.__stageAfterRefresh !== null);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const state = await page.evaluate(() => {
        const before = window.__stageReader, after = window.__stageAfterRefresh;
        return { after, before: { top: before.top, left: before.left, headerHeight: before.headerHeight, selection: before.selection, selected: before.selected, windowY: before.windowY },
          userScroll: window.__stageUserScroll, actualScroll: before.scroll.scrollTop, overflow: document.documentElement.scrollWidth > innerWidth + 1,
          opacity: getComputedStyle(before.body.querySelector('header')).opacity };
      });
      assert(state.after.identity && state.after.focus, `${label}: refresh must retain header DOM and focus ${JSON.stringify(state)}`);
      for (const field of ['top', 'left', 'headerHeight', 'selection', 'selected', 'windowY']) assert.equal(state.after[field], state.before[field], `${label}: retained ${field}`);
      assert.equal(state.actualScroll, state.userScroll, `${label}: no delayed scroll overwrite`);
      assert(!state.overflow && state.opacity === '1', `${label}: settled visible responsive content`);
      if (revalidateRevision === 0 && key !== 'whales') {
        assert.equal(await page.evaluate(() => window.__stageFullStarted), 0, `${label}: unchanged projection must avoid downloading the large snapshot`);
      }
      if (artifactsDir) await page.screenshot({ path: path.join(artifactsDir, `first-paint-${key}-${width}-ready.png`) });
      phase = 'failed refresh';
      mode = 'fail';
      await page.waitForFunction(() => window.__stageDataPending === 0 && typeof window.__stageTick === 'function');
      // Advance only the fixture clock beyond the archive's five-minute cadence.
      if (key === 'whales') await page.evaluate(() => { window.__stageClockOffset = 6 * 60_000; window.__stageTick(); });
      else await page.evaluate(() => { window.__stageVisibility = 'hidden'; document.dispatchEvent(new Event('visibilitychange')); window.__stageVisibility = 'visible'; document.dispatchEvent(new Event('visibilitychange')); });
      await page.waitForFunction(bodyId => /refresh failed/i.test(document.getElementById(bodyId)?.textContent || ''), bodyId);
      assert(await page.evaluate(() => window.__stageReader.header.isConnected), `${label}: failed refresh retains the reading surface`);
      assert.deepEqual(errors, [], `${label}: no runtime errors`);
      console.log(`ok - first paint ${label}: hidden initial render, cached reload, quiet revalidation, failed refresh, reader state`);
    } catch (error) {
      throw new Error(`${label} during ${phase}: ${error.message}`, { cause: error });
    } finally {
      release();
      await context.close();
    }
  }
}
