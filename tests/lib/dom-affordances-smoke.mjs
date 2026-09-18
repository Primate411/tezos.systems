import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const drain = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

export async function smokeDomAffordances(browser, baseUrl, { installFeatureMocks, artifactsDir = '' } = {}) {
  const receipts = [];
  if (artifactsDir) await mkdir(artifactsDir, { recursive: true });
  // Real DOM contract for the shared filter, independent of app timers.
  const context = await browser.newContext({ serviceWorkers: 'block' });
  try {
    await context.route('**/__dom_affordances', route => route.fulfill({ contentType: 'text/html', body: '<main id="root"><section class="owner"><span>Initial</span></section><div id="unrelated"></div></main>' }));
    const page = await context.newPage();
    await page.goto(`${baseUrl}/__dom_affordances`);
    receipts.push(await page.evaluate(async () => {
      const { observeElementChanges } = await import('/js/core/utils.js');
      const root = document.getElementById('root');
      const unrelated = document.getElementById('unrelated');
      const calls = [];
      const observer = observeElementChanges(root, '.owner', node => calls.push(node));
      const flush = () => new Promise(resolve => queueMicrotask(() => queueMicrotask(resolve)));
      const check = (ok, description) => { if (!ok) throw new Error(description); };
      check(calls.length === 1, 'Initial owners attach synchronously');
      const owner = calls[0]; calls.length = 0;
      let scans = 0;
      const queryAll = Element.prototype.querySelectorAll;
      const closest = Element.prototype.closest;
      Element.prototype.querySelectorAll = function(...args) { scans++; return queryAll.apply(this, args); };
      Element.prototype.closest = function(...args) { scans++; return closest.apply(this, args); };
      try {
        for (let i = 0; i < 100; i++) { owner.firstChild.textContent = String(i); unrelated.textContent = String(i); await flush(); }
        check(calls.length === 0 && scans === 0, 'Text-only deliveries must perform no selector scans or reconciliation');
      } finally { Element.prototype.querySelectorAll = queryAll; Element.prototype.closest = closest; }
      unrelated.innerHTML = '<article><div><span>Unrelated markup</span></div></article>';
      await flush(); check(calls.length === 0, 'Unrelated element insertions do not reconcile owners');
      const wrapper = document.createElement('div');
      wrapper.innerHTML = '<div class="owner" id="one"><span>Nested</span></div><div class="owner" id="two"></div>';
      root.append(wrapper);
      const late = document.createElement('section'); late.className = 'owner'; wrapper.append(late);
      await flush();
      check(calls.length === 3 && new Set(calls).size === 3, 'Nested and sibling insertions reconcile exactly once each');
      calls.length = 0;
      owner.append(document.createElement('button'), document.createElement('span'));
      owner.append(document.createElement('em'));
      await flush(); check(calls.length === 1 && calls[0] === owner, 'One owner is deduplicated across structural changes');
      calls.length = 0;
      owner.lastElementChild.remove();
      await flush(); check(calls.length === 1 && calls[0] === owner, 'Control removal reconciles its surviving owner');
      calls.length = 0;
      const transient = document.createElement('div'); transient.className = 'owner'; root.append(transient); transient.remove();
      await flush(); check(calls.length === 0, 'Detached insertions are ignored');
      unrelated.append(owner);
      await flush(); check(calls.length === 1 && calls[0] === owner, 'Moving an owner retains correct reconciliation');
      observer.disconnect();
      return { unit: 'initial, text-only zero scans, unrelated, nested, deduplicated, removal, detached, move' };
    }));
  } finally { await context.close(); }

  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: width === 1440 ? 1000 : 844 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    const errors = [];
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    try {
      await installFeatureMocks(context);
      await context.addInitScript(() => {
        localStorage.setItem('tezos-toured', '1'); localStorage.setItem('tezos-welcomed', '1');
        localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
        window.__copiedLinks = [];
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => window.__copiedLinks.push(text) } });
      });
      await page.goto(`${baseUrl}/#section=consensus`, { waitUntil: 'domcontentloaded' });
      await page.locator('#consensus-section .section-copy-link').waitFor({ state: 'visible' });
      await page.locator('[data-stat="total-bakers"] > .card-history-btn').first().waitFor({ state: 'attached' });
      await page.waitForFunction(() => /^\d/.test(document.getElementById('total-bakers-front')?.textContent.trim() || ''));
      await page.locator('#consensus-section .section-copy-link').click();
      assert.match(await page.evaluate(() => window.__copiedLinks.at(-1)), /#section=consensus$/);
      await page.locator('[data-stat="total-bakers"] > .card-history-btn').first().click();
      await page.locator('#card-history-modal.active').waitFor();
      await page.waitForFunction(() => document.activeElement?.id === 'card-history-close');
      await drain(page);
      assert.equal(await page.locator('#card-history-modal .card-history-title').textContent(), 'Total Bakers');
      if (artifactsDir) await page.screenshot({ path: path.join(artifactsDir, `dom-affordances-history-${width}.png`) });
      await page.keyboard.press('Escape');
      await page.locator('#card-history-modal.active').waitFor({ state: 'hidden' });
      await drain(page);
      if (artifactsDir) await page.screenshot({ path: path.join(artifactsDir, `dom-affordances-initial-${width}.png`) });
      // Recreate an actual section header/action slot; cloned data markers must
      // not prevent late cards or their replacement buttons being wired.
      await page.evaluate(() => {
        const header = document.querySelector('#consensus-section .section-header');
        const replacement = header.cloneNode(true);
        replacement.querySelectorAll('.section-copy-link').forEach(node => node.remove());
        const actions = document.createElement('div'); actions.dataset.sectionActions = '';
        replacement.append(actions); header.replaceWith(replacement);
        const group = document.createElement('section'); group.id = 'affordance-probes';
        group.innerHTML = '<div><article data-stat="total-supply" data-card-history-wired="1"><span class="reader">Keep this receipt</span></article></div><article data-stat="total-burned"></article>';
        group.querySelectorAll('article').forEach(card => { card.style.position = 'relative'; card.style.minHeight = '80px'; });
        document.getElementById('chambers-grid').append(group);
      });
      await page.waitForFunction(() => document.querySelector('#consensus-section [data-section-actions] > .section-copy-link') && document.querySelectorAll('#affordance-probes .card-history-btn').length === 2);
      await page.evaluate(() => {
        const slot = document.querySelector('#consensus-section [data-section-actions]');
        slot.replaceWith(slot.cloneNode(false));
        const card = document.querySelector('#affordance-probes [data-stat="total-supply"]');
        card.querySelector('.card-history-btn').remove();
        document.querySelector('#affordance-probes [data-stat="total-burned"]').replaceWith(document.querySelector('#affordance-probes [data-stat="total-burned"]').cloneNode(true));
      });
      await page.waitForFunction(() => document.querySelector('#consensus-section [data-section-actions] > .section-copy-link') && document.querySelectorAll('#affordance-probes .card-history-btn').length === 2);
      await drain(page);
      // A real reader action ends the overlay's bounded close-focus recovery.
      await page.keyboard.press('Tab');
      const reading = await page.evaluate(async () => {
        const history = await import('/js/features/history.js');
        history.addCardHistoryButtons(); history.addCardHistoryButtons();
        const card = document.querySelector('#affordance-probes [data-stat="total-supply"]');
        const button = card.querySelector('.card-history-btn');
        const reader = card.querySelector('.reader');
        button.focus();
        if (document.activeElement !== button) throw new Error(`Reader fixture cannot receive initial focus: ${getComputedStyle(card).display}, ${card.closest('[inert]')?.id}, ${button.getBoundingClientRect().width}`);
        const selection = getSelection(); const range = document.createRange(); range.selectNodeContents(reader); selection.removeAllRanges(); selection.addRange(range);
        const selected = selection.toString(); const scroll = window.scrollY;
        const leaf = document.createElement('span'); card.append(leaf);
        for (let n = 0; n < 25; n++) { leaf.textContent = String(n); await Promise.resolve(); }
        await new Promise(resolve => requestAnimationFrame(resolve));
        return { count: card.querySelectorAll('.card-history-btn').length, same: button === card.querySelector('.card-history-btn'), focused: document.activeElement === button, selection: selection.toString() === selected, scroll: Math.abs(scroll - window.scrollY) < 1 };
      });
      assert.deepEqual(reading, { count: 1, same: true, focused: true, selection: true, scroll: true });
      for (const [stat, title] of [['total-supply', 'Total Supply'], ['total-burned', 'Total Burned']]) {
        await page.locator(`#affordance-probes [data-stat="${stat}"] > .card-history-btn`).click();
        await page.locator('#card-history-modal.active').waitFor();
        assert.equal(await page.locator('#card-history-modal .card-history-title').textContent(), title);
        await page.keyboard.press('Escape');
      }
      await page.locator('#consensus-section .section-copy-link').click();
      assert.equal(await page.evaluate(() => window.__copiedLinks.length), 2, 'One copy listener survives structural changes');
      await page.evaluate(() => {
        const capture = document.createElement('div'); capture.id = 'screenshot-wrapper';
        capture.hidden = true;
        capture.innerHTML = '<section id="consensus-section"><div class="section-header">Capture heading</div><article data-stat="total-supply"></article></section>';
        const panel = document.createElement('article'); panel.className = 'chamber-share-source-card'; panel.dataset.stat = 'total-bakers';
        capture.append(panel); document.body.append(capture);
        const separatePanel = panel.cloneNode(true); separatePanel.id = 'affordance-share-panel'; document.body.append(separatePanel);
      });
      await drain(page);
      assert.equal(await page.locator('#screenshot-wrapper .section-copy-link, #screenshot-wrapper .card-history-btn, #affordance-share-panel .card-history-btn').count(), 0, 'Share capture clones stay free of interactive controls');
      await page.evaluate(() => { document.getElementById('screenshot-wrapper').remove(); document.getElementById('affordance-share-panel').remove(); });
      if (artifactsDir) await page.screenshot({ path: path.join(artifactsDir, `dom-affordances-${width}.png`) });
      assert.deepEqual(errors, []);
      receipts.push({ width, reading, copiedLinks: await page.evaluate(() => window.__copiedLinks), lateCards: 2 });
    } finally { await context.close(); }
  }
  if (artifactsDir) await writeFile(path.join(artifactsDir, 'dom-affordances.json'), JSON.stringify(receipts, null, 2));
  console.log('ok - DOM affordances: filtered mutations, late controls, replacement recovery, copy/history actions and reader state');
}
