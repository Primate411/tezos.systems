import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { fundingFixtures } from '../fixtures/community-funding.mjs';
import { buildFundingPreview } from '../../js/core/community-funding.mjs';

export async function smokeCommunityFunding(browser, baseUrl, { installFeatureMocks, artifactsDir }) {
    for (const width of [1440, 390, 320]) {
        const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: width === 1440 ? 'no-preference' : 'reduce', serviceWorkers: 'block' });
        try {
            await installFeatureMocks(context);
            await context.addInitScript(width => {
                localStorage.setItem('tezos-systems-theme', width === 1440 ? 'dark' : 'clean');
                localStorage.setItem('tezos-toured', '1'); localStorage.setItem('tezos-welcomed', '1');
                window.__fundingVisibility = 'visible';
                Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.__fundingVisibility });
                const interval = window.setInterval.bind(window);
                window.setInterval = (callback, delay, ...args) => {
                    if (delay === 300000 && String(callback).includes('refreshCommunityFunding')) window.__fundingTick = callback;
                    return interval(callback, delay, ...args);
                };
            }, width);
            const fixture = fundingFixtures();
            fixture.hacktez.items[0].image = 'https://funding.teztree.com/unavailable-smoke.png';
            await context.route('https://funding.teztree.com/unavailable-smoke.png', route => route.fulfill({ status: 404, body: '' }));
            await context.route('https://funding.teztree.com/replacement-smoke.svg', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="green"/></svg>' }));
            let failed = false, crowdFailed = false, revision = 0, requests = 0;
            let holdFetch = false, releaseFetch, markHeld;
            await context.route(/\/data\/community-funding-(teztree|ttcrowd|hacktez)\.json/, async route => {
                requests++;
                const source = route.request().url().match(/community-funding-(teztree|ttcrowd|hacktez)/)[1];
                if (holdFetch && source === 'teztree') {
                    holdFetch = false;
                    await new Promise(resolve => { releaseFetch = resolve; markHeld(); });
                }
                if (failed && source === 'hacktez') return route.fulfill({ status: 503, body: 'unavailable' });
                if (crowdFailed && source === 'ttcrowd') return route.fulfill({ status: 503, body: 'unavailable' });
                const data = structuredClone(fixture[source]);
                data.generatedAt = new Date(Date.now() + revision * 1000).toISOString();
                if (revision && source === 'hacktez') data.items[0].tipCounters.totals[0].total = String(12.5 + revision);
                await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
            });
            const page = await context.newPage();
            const errors = []; page.on('pageerror', error => errors.push(error.message));
            await page.goto(`${baseUrl}/funding/`, { waitUntil: 'domcontentloaded' });
            await page.waitForFunction(() => document.documentElement.dataset.chamberReady === 'funding');
            await page.locator('.funding-project').first().waitFor();
            await page.locator('.funding-project img[data-quiet-image-failed]').waitFor({ state: 'attached' });
            await page.evaluate(() => document.fonts.ready);
            assert.equal(await page.locator('.funding-hero a[href="https://funding.teztree.com/"]').isVisible(), true);
            assert.equal(await page.locator('.funding-hero a[href="https://hacktez.com/"]').isVisible(), true);
            assert.equal(await page.locator('.funding-hero a[href="https://crowd.thetezos.com/"]').isVisible(), true);
            assert.match(await page.locator('.funding-hero').innerText(), /Listings, artwork and reported figures supplied by TezTree, TTCrowd \(TheTezos\) and HackTez/);
            assert.equal(await page.locator('.funding-project').count(), 8);
            assert.equal(await page.locator('.funding-project progress').count(), 0);
            assert.match(await page.locator('.funding-project').first().innerText(), /12\.5 tez/);
            assert.match(await page.locator('.funding-project').first().innerText(), /700 OTHER/);
            assert.doesNotMatch(await page.locator('#funding-panel').innerText(), /99999/);
            assert.equal(await page.locator('.funding-project .funding-action').first().getAttribute('href'), 'https://hacktez.com/u/builder/p/project-1');
            await page.locator('#funding-search').fill('project 2');
            assert.equal(await page.locator('.funding-project').count(), 1);
            await page.locator('#funding-search').fill('');
            await page.locator('#funding-tab-campaigns').click();
            assert.equal(await page.locator('.funding-campaign').count(), 3);
            assert.equal(await page.locator('.funding-crowd').count(), 2);
            assert.match(await page.locator('.funding-crowd').first().innerText(), /27.8 USD/);
            assert.match(await page.locator('.funding-crowd').nth(1).innerText(), /Treasury accounting/);
            assert.doesNotMatch(await page.locator('.funding-crowd').nth(1).innerText(), /raised/);
            assert.equal(await page.locator('.funding-crowd .funding-action').first().getAttribute('href'), 'https://crowd.thetezos.com/c/animation');
            assert.equal(await page.locator('.funding-campaign:not(.funding-crowd) progress').getAttribute('value'), '25');
            await page.evaluate(() => { window.__crowdCard = document.querySelector('.funding-crowd'); });
            crowdFailed = true;
            await page.evaluate(() => window.__fundingTick());
            assert.equal(await page.locator('.funding-campaign').count(), 3, 'TTCrowd failure retains all last-good campaign cards');
            assert.match(await page.locator('[data-quiet-key="status-ttcrowd"]').innerText(), /Refresh failed/);
            assert.equal(await page.evaluate(() => window.__crowdCard === document.querySelector('.funding-crowd')), true);
            assert.equal((await page.locator('.funding-crowd .funding-action').first().innerText()).replace(/\s+/g, ' '), 'View on TTCrowd ↗');
            crowdFailed = false;
            await page.evaluate(() => window.__fundingTick());
            await page.locator('#funding-tab-history').click();
            assert.equal(await page.locator('.funding-campaign').count(), 4);
            assert.match(await page.locator('#funding-panel').innerText(), /Paused campaign/);
            assert.match(await page.locator('#funding-panel').innerText(), /12\.5 ꜩ/);
            await page.locator('#funding-tab-support').click();
            // Returning to Support creates a new lazy image. Establish its
            // failed state before testing that background refresh preserves it.
            await page.locator('.funding-project img[data-quiet-image-failed]').waitFor({ state: 'attached' });
            await page.evaluate(() => {
                const card = document.querySelector('.funding-project');
                const scroll = document.querySelector('.funding-content.chamber-room-scroll');
                const focus = document.getElementById('funding-refresh'); focus.focus({ preventScroll: true });
                const text = card.querySelector('.funding-description').firstChild;
                const range = document.createRange(); range.setStart(text, 0); range.setEnd(text, 12);
                getSelection().removeAllRanges(); getSelection().addRange(range);
                scroll.scrollTop = 215;
                window.__fundingReader = { card, scroll: scroll.scrollTop, page: scrollY, selection: getSelection().toString(), focus, url: location.href, rail: document.querySelector('.funding-tabs').scrollLeft };
                window.__fundingFailedImage = card.querySelector('img[data-quiet-image-failed]');
                window.__fundingVisibility = 'hidden';
                window.__fundingTick();
            });
            const hiddenRequests = requests;
            await page.evaluate(() => window.__fundingTick());
            assert.equal(requests, hiddenRequests, 'hidden room does no network work');
            revision++;
            await page.evaluate(() => { window.__fundingVisibility = 'visible'; document.dispatchEvent(new Event('visibilitychange')); });
            await page.waitForFunction(() => document.querySelector('.funding-asset-total strong')?.textContent.includes('13.5'));
            assert.equal(requests, hiddenRequests + 3, 'one catch-up fetch per source');
            const continuity = await page.evaluate(() => {
                const before = window.__fundingReader, scroll = document.querySelector('.funding-content.chamber-room-scroll');
                const result = { identity: before.card === document.querySelector('.funding-project'), scroll: scroll.scrollTop === before.scroll,
                    page: scrollY === before.page, selection: getSelection().toString() === before.selection, focus: document.activeElement === before.focus,
                    url: location.href === before.url, tab: document.getElementById('funding-tab-support').getAttribute('aria-selected') === 'true',
                    rail: document.querySelector('.funding-tabs').scrollLeft === before.rail, opacity: getComputedStyle(before.card).opacity };
                scroll.scrollTop += 50; window.__fundingAfterScroll = scroll.scrollTop;
                return result;
            });
            assert.deepEqual(continuity, { identity: true, scroll: true, page: true, selection: true, focus: true, url: true, tab: true, rail: true, opacity: '1' });
            assert.equal(await page.locator('.funding-project img').first().isVisible(), false, 'a refresh must preserve failed artwork fallback');
            assert.equal(await page.evaluate(() => window.__fundingFailedImage === document.querySelector('.funding-project img[data-quiet-image-failed]')), true, 'a refresh retains the failed image node');
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            assert.equal(await page.evaluate(() => document.querySelector('.funding-content').scrollTop === window.__fundingAfterScroll), true);
            failed = true;
            await page.evaluate(() => window.__fundingTick());
            assert.equal(await page.locator('.funding-project').count(), 8, 'failure keeps last-good cards');
            assert.match(await page.locator('[data-quiet-key="status-hacktez"]').innerText(), /Refresh failed/);
            assert.equal(await page.evaluate(() => window.__fundingReader.card === document.querySelector('.funding-project')), true);
            failed = false;
            fixture.hacktez.sourceGeneratedAt = new Date(Date.now() - 19 * 3600000).toISOString();
            await page.evaluate(() => window.__fundingTick());
            assert.match(await page.locator('[data-quiet-key="status-hacktez"]').innerText(), /Stale snapshot/);
            if (width === 1440) {
                const beforeHidden = await page.locator('#funding-panel').innerText();
                const held = new Promise(resolve => { markHeld = resolve; });
                holdFetch = true; revision++;
                await page.evaluate(() => { window.__fundingInFlight = window.__fundingTick(); });
                await held;
                await page.evaluate(() => { window.__fundingVisibility = 'hidden'; });
                releaseFetch();
                await page.evaluate(() => window.__fundingInFlight);
                assert.equal(await page.locator('#funding-panel').innerText(), beforeHidden, 'in-flight result cannot mutate a hidden room');
                const beforeCatchUp = requests;
                await page.evaluate(() => { window.__fundingVisibility = 'visible'; document.dispatchEvent(new Event('visibilitychange')); });
                await page.waitForFunction(() => document.querySelector('.funding-asset-total strong')?.textContent.includes('14.5'));
                assert.equal(requests, beforeCatchUp, 'completed hidden response is reused for the single catch-up');
            }
            assert.equal(await page.locator('.funding-project').count(), 8);
            fixture.hacktez.items[0].image = 'https://funding.teztree.com/replacement-smoke.svg';
            await page.evaluate(() => window.__fundingTick());
            await page.waitForFunction(() => {
                const image = document.querySelector('.funding-project img');
                return image?.src.endsWith('/replacement-smoke.svg') && image.complete && image.naturalWidth > 0 && getComputedStyle(image).display !== 'none';
            });
            const palette = await page.locator('.funding-content').evaluate(node => ({ text: getComputedStyle(node).getPropertyValue('--text-primary').trim(), background: getComputedStyle(node).backgroundColor }));
            if (width !== 1440) {
                // Chambers stay dark rooms under the light Clean theme.
                assert.equal(palette.text, '#F2F7FF', 'dark room under Clean must keep light readable text');
                assert.equal(palette.background, 'rgb(7, 16, 29)', 'dark room under Clean keeps the shared dark surface');
            }
            const geometry = await page.evaluate(() => ({
                overflow: [...document.querySelectorAll('.funding-content,.funding-body,.funding-card,.funding-tabs')].some(node => node.scrollWidth > node.clientWidth + 1),
                close: document.querySelector('#funding-modal .chamber-close').getBoundingClientRect().right <= innerWidth,
                targets: [...document.querySelectorAll('.funding-action,.funding-tabs button,#funding-search')].every(node => node.getBoundingClientRect().height >= 44)
            }));
            assert.deepEqual(geometry, { overflow: false, close: true, targets: true });
            if (artifactsDir) { await mkdir(artifactsDir, { recursive: true }); await page.screenshot({ path: path.join(artifactsDir, `funding-${width}.png`) }); }
            failed = false;
            // A first-load TTCrowd failure leaves TezTree's available campaigns usable.
            crowdFailed = true;
            await page.goto(`${baseUrl}/funding/?view=campaigns`, { waitUntil: 'domcontentloaded' });
            await page.locator('.funding-campaign').first().waitFor();
            assert.equal(await page.locator('.funding-campaign').count(), 1);
            assert.equal(await page.locator('.funding-crowd').count(), 0);
            assert.match(await page.locator('[data-quiet-key="status-ttcrowd"]').innerText(), /Unavailable/);
            crowdFailed = false;
            await page.goto(`${baseUrl}/funding/?view=history`, { waitUntil: 'domcontentloaded' });
            await page.locator('.funding-campaign').first().waitFor();
            assert.equal(await page.locator('#funding-tab-history').getAttribute('aria-selected'), 'true');
            // A real empty source is an empty state, distinct from a failed source.
            fixture.teztree.items = []; fixture.teztree.sourceCount = 0;
            fixture.ttcrowd.items = []; fixture.ttcrowd.sourceCount = 0;
            await page.locator('#funding-tab-campaigns').click();
            await page.locator('#funding-refresh').click();
            await page.locator('.funding-empty').waitFor();
            assert.match(await page.locator('.funding-empty').innerText(), /No open campaigns/);
            if (width === 1440) {
                const returnUrl = page.url();
                await page.locator('#funding-modal .chamber-close').click();
                await page.waitForFunction(() => document.documentElement.dataset.dashboardReady === 'true' && location.pathname === '/');
                await page.goBack();
                await page.waitForFunction(url => location.href === url && document.getElementById('funding-modal')?.classList.contains('active'), returnUrl);
                assert.equal(await page.locator('#funding-tab-campaigns').getAttribute('aria-selected'), 'true', 'Back restores the funding view in its canonical route');
                await page.locator('#funding-modal .chamber-close').click();
                await page.waitForFunction(() => !document.getElementById('funding-modal')?.classList.contains('active'));
                const launcher = page.locator('#funding-entry-card');
                await launcher.waitFor();
                assert.equal(await launcher.getAttribute('aria-busy'), 'false', 'dashboard handoff hydrates the new launcher');
                await launcher.locator('.chamber-expand-cue').scrollIntoViewIfNeeded();
                await launcher.locator('.chamber-expand-cue').click();
                await page.locator('#funding-modal.active').waitFor();
                assert.equal(await page.locator('#funding-tab-support').getAttribute('aria-selected'), 'true', 'Home launcher uses the default view rather than unrelated Home query state');
                await page.locator('.funding-project').first().waitFor();
                assert.equal(await page.locator('.funding-project').first().evaluate(node => getComputedStyle(node).opacity), '1', 'reopened room stays visible');
                assert.equal(await page.locator('#funding-modal a[href="/ecosystem/"]').count() > 0, true, 'room has related chamber crosslinks');
            }
            assert.deepEqual(errors, []);
        } finally { await context.close(); }
    }
    await smokeFundingLauncher(browser, baseUrl, { installFeatureMocks, artifactsDir });
}

async function smokeFundingLauncher(browser, baseUrl, { installFeatureMocks, artifactsDir }) {
    for (const width of [1440, 390, 320]) {
        const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
        context.setDefaultTimeout(15000);
        try {
            await installFeatureMocks(context);
            await context.addInitScript(width => {
                localStorage.setItem('tezos-systems-theme', width === 1440 ? 'aurora' : width === 390 ? 'clean' : 'matrix');
                localStorage.setItem('tezos-toured', '1'); localStorage.setItem('tezos-welcomed', '1');
                // Exercise the real Home card with supported room preferences,
                // independent of unrelated Chambers' first-render hydration.
                localStorage.setItem('tezos-systems-explore-layout-v1', JSON.stringify({ version: 1,
                    hiddenCategories: ['ecosystem', 'network', 'capital', 'bakers', 'governance', 'history'],
                    hiddenRooms: ['ledger-flow', 'domains', 'maxis', 'tezoscrp'] }));
                window.__previewVisibility = 'visible';
                Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.__previewVisibility });
                const interval = window.setInterval.bind(window);
                window.setInterval = (callback, delay, ...args) => {
                    if (delay === 300000 && String(callback).includes('refreshFundingPreview')) window.__previewTick = callback;
                    return interval(callback, delay, ...args);
                };
            }, width);
            const fixture = fundingFixtures();
            let requests = 0, fullRequests = 0, revision = 0, failed = false, releases = [];
            let heldReady;
            let held = new Promise(resolve => { heldReady = resolve; });
            let holding = true;
            await context.route(/\/data\/community-funding-(teztree|ttcrowd|hacktez)-preview\.json/, async route => {
                requests++;
                const source = route.request().url().match(/community-funding-(teztree|ttcrowd|hacktez)/)[1];
                if (holding) await new Promise(resolve => { releases.push(resolve); if (releases.length === 3) heldReady(); });
                if (failed && source === 'hacktez') return route.fulfill({ status: 503, body: '' });
                const data = structuredClone(fixture[source]);
                data.generatedAt = new Date(Date.now() + revision * 1000).toISOString();
                if (source === 'teztree') data.items[0].raisedMutez = String((25 + revision) * 1000000);
                await route.fulfill({ contentType: 'application/json', body: JSON.stringify(buildFundingPreview(data)) });
            });
            const page = await context.newPage();
            page.on('request', request => { if (/\/data\/community-funding-(teztree|ttcrowd|hacktez)\.json/.test(request.url())) fullRequests++; });
            const firstRequests = Promise.all(['teztree', 'ttcrowd', 'hacktez'].map(source => page.waitForRequest(request => request.url().includes(`community-funding-${source}-preview.json`))));
            firstRequests.catch(() => {});
            const errors = []; page.on('pageerror', error => errors.push(error.message));
            await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
            const category = page.locator('#chambers-grid > .chamber-category[data-chamber-category="people"]');
            await category.locator('.chamber-category-toggle').click();
            await page.locator('#funding-entry-card[aria-busy="false"]').waitFor({ state: 'attached' });
            const card = page.locator('#funding-entry-card');
            await card.scrollIntoViewIfNeeded();
            await card.locator('.chamber-expand-cue').focus();
            await firstRequests;
            await held;
            await page.waitForFunction(() => Math.abs(parseFloat(getComputedStyle(document.querySelector('.funding-preview-list')).height) - 232) < 1, null, { timeout: 5000 });
            await page.evaluate(() => document.fonts.ready);
            const before = await card.boundingBox();
            holding = false; releases.forEach(resolve => resolve()); releases = [];
            await card.locator('.funding-preview-item').first().waitFor();
            const after = await card.boundingBox();
            assert(Math.abs(before.height - after.height) <= 1, `preview slots reserve the settled launcher height at ${width}px: ${before.height} -> ${after.height}`);
            assert.equal(fullRequests, 0, 'home preview must not fetch full funding catalogs');
            assert.equal(await card.locator('.funding-entry-platforms a[href="https://funding.teztree.com/"]').isVisible(), true);
            assert.equal(await card.locator('.funding-entry-platforms a[href="https://hacktez.com/"]').isVisible(), true);
            assert.equal(await card.locator('.funding-entry-platforms a[href="https://crowd.thetezos.com/"]').isVisible(), true);
            assert.equal(await card.locator('.funding-preview-item[href="https://crowd.thetezos.com/c/animation"]').isVisible(), true);
            assert.match(await card.locator('.funding-entry-copy').innerText(), /Listings, artwork & reported figures from the source platforms/);
            assert.equal(await card.locator('.funding-preview-item').count(), 3);
            assert.match(await card.locator('.funding-preview-fact').first().textContent(), /25 ꜩ raised/);
            assert.match(await card.locator('.funding-entry-platforms').innerText(), /8 projects accepting tips/);
            assert.equal(await card.locator('.funding-preview-item').first().getAttribute('href'), 'https://funding.teztree.com/c/1');
            assert.equal(await card.locator('.funding-platform-credit').evaluateAll(nodes => nodes.every(node => {
                const link = node.querySelector('a').getBoundingClientRect(), bounds = node.getBoundingClientRect();
                return link.right <= bounds.right + 1 && node.scrollWidth <= node.clientWidth + 1;
            })), true, 'each platform credit fits its own column without overlapping another');
            const layout = await card.evaluate(node => {
                const copy = node.querySelector('.funding-entry-copy').getBoundingClientRect();
                const preview = node.querySelector('.funding-entry-preview').getBoundingClientRect();
                return { copy: { right: copy.right, bottom: copy.bottom }, preview: { x: preview.x, y: preview.y }, overflow: node.scrollWidth > node.clientWidth + 1,
                    rows: [...node.querySelectorAll('.funding-preview-item')].every(row => row.getBoundingClientRect().height >= 44 && row.scrollWidth <= row.clientWidth + 1) };
            });
            assert.equal(layout.overflow, false); assert.equal(layout.rows, true);
            assert(width > 760 ? layout.preview.x > layout.copy.right : layout.preview.y >= layout.copy.bottom, 'preview uses the empty right side and stacks on phones');
            await page.evaluate(() => {
                const card = document.getElementById('funding-entry-card'), row = card.querySelector('.funding-preview-item');
                row.focus({ preventScroll: true });
                const range = document.createRange(); range.selectNodeContents(row.querySelector('.funding-preview-copy strong'));
                getSelection().removeAllRanges(); getSelection().addRange(range);
                window.__previewReader = { card, row, scroll: scrollY, selection: getSelection().toString(), url: location.href,
                    height: card.getBoundingClientRect().height, layoutHeight: getComputedStyle(card).height };
                window.__previewVisibility = 'hidden';
            });
            const hiddenRequests = requests;
            await page.evaluate(() => window.__previewTick());
            assert.equal(requests, hiddenRequests);
            revision++;
            await page.evaluate(() => { window.__previewVisibility = 'visible'; document.dispatchEvent(new Event('visibilitychange')); });
            await page.waitForFunction(() => document.querySelector('.funding-preview-fact strong')?.textContent.includes('26 ꜩ'));
            assert.equal(requests, hiddenRequests + 3, 'one visible catch-up per preview source');
            const refreshedReader = await page.evaluate(() => {
                const before = window.__previewReader, card = document.getElementById('funding-entry-card');
                return { state: { card: before.card === card, row: before.row === card.querySelector('.funding-preview-item'), focus: document.activeElement === before.row,
                    scroll: scrollY === before.scroll, selection: getSelection().toString() === before.selection, url: location.href === before.url,
                    visible: getComputedStyle(before.row).opacity === '1' },
                    height: card.getBoundingClientRect().height, beforeHeight: before.height,
                    layoutHeight: getComputedStyle(card).height, beforeLayoutHeight: before.layoutHeight };
            });
            assert.deepEqual(refreshedReader.state, { card: true, row: true, focus: true, scroll: true, selection: true, url: true, visible: true });
            // A fractional translate can round a 410px DOMRect to 409.99997px.
            // Keep exact CSS geometry and the existing <0.01px renderer tolerance.
            assert.equal(refreshedReader.layoutHeight, refreshedReader.beforeLayoutHeight, 'preview refresh retains exact layout height');
            assert(Math.abs(refreshedReader.height - refreshedReader.beforeHeight) < 0.01,
                `preview refresh retains rendered height at ${width}px: ${refreshedReader.beforeHeight} -> ${refreshedReader.height}`);
            await page.evaluate(() => { scrollBy(0, 25); window.__readerScroll = scrollY; });
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            assert.equal(await page.evaluate(() => scrollY === window.__readerScroll), true);
            failed = true;
            await page.evaluate(() => window.__previewTick());
            assert.equal(await card.locator('.funding-preview-item').count(), 3);
            assert.match(await card.locator('.funding-preview-clocks').innerText(), /Saved snapshot · refresh failed/);
            assert(Math.abs((await card.boundingBox()).height - before.height) < 0.01, 'failed preview refresh retains launcher height within renderer precision');
            failed = false;
            fixture.hacktez.sourceGeneratedAt = new Date(Date.now() - 19 * 3600000).toISOString();
            await page.evaluate(() => window.__previewTick());
            assert.match(await card.locator('.funding-preview-clocks').innerText(), /Stale snapshot/);
            if (width === 1440) {
                holding = true; revision++;
                held = new Promise(resolve => { heldReady = resolve; });
                await page.evaluate(() => { window.__previewFlight = window.__previewTick(); });
                await held;
                const textBefore = await card.locator('.funding-entry-preview').innerText();
                await page.evaluate(() => { window.__previewVisibility = 'hidden'; });
                holding = false; releases.forEach(resolve => resolve()); releases = [];
                await page.evaluate(() => window.__previewFlight);
                assert.equal(await card.locator('.funding-entry-preview').innerText(), textBefore);
                const beforeVisible = requests;
                await page.evaluate(() => { window.__previewVisibility = 'visible'; document.dispatchEvent(new Event('visibilitychange')); });
                await page.waitForFunction(() => document.querySelector('.funding-preview-fact strong')?.textContent.includes('27 ꜩ'));
                assert.equal(requests, beforeVisible, 'hidden completion is applied once without another request');
            }
            console.log(`ok - Community Funding launcher at ${width}px: previews, source credits, reserved layout and quiet refresh`);
            if (artifactsDir) await card.screenshot({ path: path.join(artifactsDir, `funding-launcher-${width}.png`) });
            assert.deepEqual(errors, []);
        } finally { await context.close(); }
    }
}
