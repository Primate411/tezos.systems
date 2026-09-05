import assert from 'node:assert/strict';

export async function smokeChamberUx(browser, baseUrl, { installFeatureMocks }) {
    for (const width of [1440, 390, 320]) {
        const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
        try {
            await installFeatureMocks(context, { whaleChamberMocks: true, ledgerFlowMocks: true });
            await context.addInitScript(() => {
                localStorage.setItem('tezos-systems-theme', 'clean');
                localStorage.setItem('tezos-toured', '1');
                localStorage.setItem('tezos-welcomed', '1');
            });
            const page = await context.newPage();
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            for (const route of ['capital', 'minerals', 'uranium', 'metals', 'whales', 'ecosystem']) {
                await page.goto(`${baseUrl}/${route}/`, { waitUntil: 'domcontentloaded' });
                await page.waitForFunction(() => Boolean(document.documentElement.dataset.chamberReady));
                await page.evaluate(() => document.fonts.ready);
                const room = page.locator('.chamber-room-scroll');
                await room.waitFor();
                const geometry = await room.evaluate(node => ({
                    vertical: /auto|scroll/.test(getComputedStyle(node).overflowY),
                    nested: [...node.children].filter(child => /auto|scroll/.test(getComputedStyle(child).overflowY) && child.scrollHeight > child.clientHeight + 10).map(child => child.className),
                    overflow: document.documentElement.scrollWidth > innerWidth + 1,
                    available: node.scrollHeight - node.clientHeight
                }));
                assert(geometry.vertical && geometry.available > 200, `${route} ${width}: main reading surface scrolls ${JSON.stringify(geometry)}`);
                assert.deepEqual(geometry.nested, [], `${route} ${width}: no second body scroller`);
                assert.equal(geometry.overflow, false, `${route} ${width}: no horizontal page overflow`);
                // Both the center and the dialog margin must advance this same scroller.
                const bounds = await room.boundingBox();
                for (const x of [bounds.x + bounds.width / 2, bounds.x + 3]) {
                    const before = await room.evaluate(node => node.scrollTop);
                    await page.mouse.move(x, bounds.y + Math.min(650, bounds.height - 80));
                    await page.mouse.wheel(0, 220);
                    await page.waitForFunction(before => document.querySelector('.chamber-room-scroll').scrollTop > before + 30, before);
                    const closeButton = page.locator('.chamber-content > .chamber-close');
                    const chrome = await closeButton.evaluate(node => { const s = getComputedStyle(node); return { background: s.backgroundColor, border: s.borderTopWidth, outline: s.outlineWidth, shadow: s.boxShadow, position: s.position }; });
                    assert.deepEqual(chrome, { background: 'rgba(0, 0, 0, 0)', border: '0px', outline: '0px', shadow: 'none', position: 'sticky' }, `${route} ${width}: the scrolling exit stays bare`);
                    const close = await closeButton.boundingBox();
                    assert(close && close.y >= 0 && close.y < 70 && close.height >= 44, `${route} ${width}: visible, usable close control ${JSON.stringify(close)}`);
                    const rail = await page.locator('.market-room-tabs, .whale-watch-tabs, .ecosystem-tabs').boundingBox();
                    assert(rail.x + rail.width <= close.x, `${route} ${width}: the tab rail leaves the exit's column clear`);
                }
                if (route === 'capital') {
                    const reading = await room.evaluate(node => node.scrollTop = 520);
                    const tabs = page.locator('.capital-tabs [role="tab"]');
                    await tabs.nth(1).click();
                    await tabs.nth(0).click();
                    assert.equal(await room.evaluate(node => node.scrollTop), reading, 'Returning to a view restores its reading position');
                    const retained = await page.evaluate(async () => {
                        const { quietlySyncHtml, quietlyMutate } = await import('/js/core/quiet-refresh.js');
                        const body = document.getElementById('capital-chamber-body');
                        const detail = body.querySelector('[data-quiet-key="snapshot-sources"]');
                        detail.open = true;
                        const copy = body.cloneNode(true);
                        copy.querySelector('[data-quiet-key="snapshot-sources"]').open = false;
                        quietlySyncHtml(body, copy.innerHTML);
                        const reconciled = detail.isConnected && detail.open;
                        quietlyMutate(body, () => { body.innerHTML = copy.innerHTML; });
                        return { reconciled, rebuilt: body.querySelector('[data-quiet-key="snapshot-sources"]').open };
                    });
                    assert.deepEqual(retained, { reconciled: true, rebuilt: true }, 'Open source receipts survive both reconciliation paths');
                }
                if (route === 'minerals' && width < 760) {
                    await page.waitForFunction(() => document.querySelector('.minerals-tabs').dataset.quietOverflowEnd === 'true');
                    await page.locator('.minerals-tabs').evaluate(rail => rail.scrollLeft = rail.scrollWidth);
                    await page.waitForFunction(() => document.querySelector('.minerals-tabs').dataset.quietOverflowEnd === 'false');
                }
            }
            for (const [route, selector, ceiling] of [
                ['tezoscrp', '#tezoscrp-hall-search', 850],
                ['history', '#cycle-history-metric', 420],
                ['tz4', '[data-tz4-search]', 750],
                ['ledger-flow', '#ledger-flow-input', 600]
            ]) {
                await page.goto(`${baseUrl}/${route}/`, { waitUntil: 'domcontentloaded' });
                await page.waitForFunction(() => Boolean(document.documentElement.dataset.chamberReady));
                await page.evaluate(() => document.fonts.ready);
                const control = page.locator(selector);
                await control.waitFor();
                const rect = await control.boundingBox();
                assert(rect.y < ceiling, `${route} ${width}: primary control is near the entrance: ${rect.y}`);
                if (route === 'history') {
                    const chart = await page.locator('#chart-tz4').evaluate(canvas => ({ top: canvas.getBoundingClientRect().top, opacity: getComputedStyle(canvas.closest('.chart-section')).opacity, height: canvas.clientHeight }));
                    assert(chart.top < 800 && chart.height > 100 && chart.opacity === '1', `History shows an actual settled chart in the first viewport: ${JSON.stringify(chart)}`);
                    const exit = await page.locator('#history-modal-close').boundingBox();
                    for (const action of await page.locator('.cycle-history-header-actions button').all()) {
                        const box = await action.boundingBox();
                        assert(box.x + box.width <= exit.x || box.y >= exit.y + exit.height || box.y + box.height <= exit.y, `History ${width}: share controls do not overlap the exit`);
                    }
                }
                if (route === 'tezoscrp') {
                    const title = await page.locator('#tezoscrp-title').evaluate(node => {
                        const text = node.firstChild, value = text.textContent;
                        const start = value.indexOf('Recognition');
                        const range = document.createRange(); range.setStart(text, start); range.setEnd(text, start + 'Recognition'.length);
                        return [...range.getClientRects()].length;
                    });
                    assert.equal(title, 1, `${width}: Recognition remains a complete word`);
                }
            }
            await page.goto(`${baseUrl}/health/`, { waitUntil: 'domcontentloaded' });
            await page.waitForFunction(() => Boolean(document.documentElement.dataset.chamberReady));
            const setup = page.locator('#health-block-filter-toggle');
            await setup.waitFor();
            assert(await page.locator('#hero-search-css').evaluate(link => Boolean(link.sheet)), 'Standalone Passing Blocks loads its shared control and receipt styles');
            assert.notEqual(await setup.evaluate(node => getComputedStyle(node).color), 'rgb(0, 0, 0)', 'Setup has a theme-aware visible label');
            await setup.click();
            const menu = page.locator('#health-block-filter-menu');
            await menu.waitFor();
            const box = await menu.boundingBox();
            assert(box.width > 200 && box.x >= 0 && box.x + box.width <= width + 1, `Health ${width}: Setup is a contained usable menu`);
            if (width < 760) {
                const exit = await page.locator('.health-content > .chamber-close').boundingBox();
                assert(box.y >= exit.y + exit.height, `Health ${width}: Setup stays below the visible exit`);
                for (const pill of await menu.locator('.live-head-filter-pill').all()) {
                    assert((await pill.boundingBox()).height >= 44, `Health ${width}: activity filters have full touch targets`);
                }
            }
            await page.keyboard.press('Escape');
            await page.goto(`${baseUrl}/anthology/`, { waitUntil: 'domcontentloaded' });
            await page.locator('.protocol-anthology-lenses').waitFor();
            await page.evaluate(() => document.fonts.ready);
            const lenses = await page.locator('.protocol-anthology-lenses button').evaluateAll(nodes => nodes.map(node => {
                const box = node.getBoundingClientRect();
                const arrow = getComputedStyle(node, '::after');
                const right = box.right - parseFloat(arrow.right);
                const top = box.top + parseFloat(arrow.top);
                const left = right - parseFloat(arrow.width);
                const bottom = top + parseFloat(arrow.height);
                const overlapsText = [...node.children].some(child => {
                    const range = document.createRange(); range.selectNodeContents(child);
                    return [...range.getClientRects()].some(rect => rect.left < right && rect.right > left && rect.top < bottom && rect.bottom > top);
                });
                return { content: arrow.content, overlapsText, small: parseFloat(arrow.width) < 16 && parseFloat(arrow.height) < 16 };
            }));
            assert.equal(lenses.length, 3);
            assert(lenses.every(lens => lens.content === '""' && lens.small && !lens.overlapsText), `${width}: small CSS arrows never cover text or use an emoji glyph`);
            assert.deepEqual(errors, [], `${width}: no uncaught browser errors`);
        } finally { await context.close(); }
    }
}
