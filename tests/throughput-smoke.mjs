import assert from 'node:assert/strict';
import path from 'node:path';
import { TRANSFER_BATCH } from '../js/core/throughput.mjs';

export async function smokeThroughputCapacity(browser, baseUrl, { installFeatureMocks, artifactsDir }) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
    await installFeatureMocks(context, { blockHeadAutoAdvance: false });
    let head = 12345678;
    let cost = 8000000;
    let fail = false;
    let metadataFail = false;
    let protocol = TRANSFER_BATCH.protocol;
    const json = (route, value) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(value) });
    await context.route('**/v1/blocks?**', route => {
        const params = new URL(route.request().url()).searchParams;
        if (params.get('limit') !== '26' || !params.get('select')?.includes('attestationCommittee')) return route.fallback();
        return json(route, Array.from({ length: 26 }, (_, i) => ({
            level: head - i, cycle: 1143, proto: 25, timestamp: new Date(1793635200000 + (head - i) * 6000).toISOString(),
            producer: { address: 'tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb', alias: 'QA Baker' },
            attestationPower: 7000, attestationCommittee: 7000, blockRound: 0, payloadRound: 0
        })));
    });
    await context.route('**/chains/main/blocks/*/metadata', route => metadataFail
        ? route.fulfill({ status: 503, body: '{}' }) : json(route, {
        protocol, max_operation_data_length: 32768,
        max_operation_list_length: [{}, {}, {}, { max_size: 524288 }],
        level_info: { cycle: 1143, cycle_position: 1234 }
    }));
    await context.route('**/chains/main/blocks/*/operations/3', route => {
        if (fail) return route.fulfill({ status: 503, body: '{}' });
        return json(route, [{ branch: 'BTestBlock', signature: 'sigTestSignature', protocol: TRANSFER_BATCH.protocol,
            hash: 'opTestCapacity', contents: Array.from({ length: 10 }, () => ({
                kind: 'transaction', destination: 'KT1TestContract', source: 'tz1TestSender',
                fee: '100', counter: '100000000', gas_limit: '15000', storage_limit: '0', amount: '0',
                metadata: { operation_result: { status: 'applied', consumed_milligas: String(cost) },
                    internal_operation_results: [{ kind: 'transaction', result: { status: 'applied', consumed_milligas: '2000000' } }] }
            })) }]);
    });
    await context.addInitScript(() => {
        localStorage.setItem('tezos-systems-theme', 'aurora');
        localStorage.setItem('tezos-toured', '1');
        localStorage.setItem('tezos-welcomed', '1');
        localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    const rail = page.locator('#chain-throughput');
    await page.waitForFunction(() => document.querySelector('[data-throughput-calls]')?.textContent.startsWith('+'));
    assert.equal(await rail.locator('[data-throughput-calls]').textContent(), '+15');
    assert.equal(await rail.locator('[data-throughput-transfers]').textContent(), '+74');
    const refresh = async () => {
        head += 30;
        await page.evaluate(async () => {
            const { versionedAsset } = await import('/js/core/asset-version.js');
            const { refreshNetworkHealth } = await import(versionedAsset('/js/features/network-health.js'));
            await refreshNetworkHealth({ force: true });
        });
    };
    await rail.scrollIntoViewIfNeeded();
    await rail.focus();
    await page.evaluate(() => {
        window.__capacityRail = document.querySelector('#chain-throughput');
        window.__capacityValue = document.querySelector('[data-throughput-calls]');
        const range = document.createRange();
        range.selectNodeContents(document.querySelector('.chain-throughput-room-label'));
        getSelection().removeAllRanges(); getSelection().addRange(range);
        window.__capacityScroll = scrollY;
    });
    cost = 18000000;
    await refresh();
    await page.waitForFunction(() => document.querySelector('[data-throughput-calls]')?.textContent === '+7.0');
    assert(await page.evaluate(() => window.__capacityRail === document.querySelector('#chain-throughput')
        && window.__capacityValue === document.querySelector('[data-throughput-calls]')
        && document.activeElement === window.__capacityRail && scrollY === window.__capacityScroll
        && getSelection().toString() === 'Est/s'), 'quiet refresh retains nodes, focus, scroll and selection');

    // A detail is a reading lock, including its own scroll and text selection.
    await rail.click();
    const detail = page.locator('#chain-throughput-detail');
    await page.waitForFunction(() => document.querySelector('#chain-throughput-detail').matches(':popover-open'));
    assert(await detail.evaluate(el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }),
        'the whole detail popup fits within the viewport');
    const receipt = await detail.locator('p').textContent();
    const examples = await detail.locator('tbody').innerText();
    assert(examples.includes('XTZ · batched transfers') && examples.includes('FA2 · USDt example'));
    assert((await detail.locator('[data-throughput-detail-fa2]').innerText()).startsWith('+'));
    await detail.evaluate(el => {
        el.style.maxHeight = '180px'; el.scrollTop = 30;
        const range = document.createRange(); range.setStart(el.querySelector('p').firstChild, 0); range.setEnd(el.querySelector('p').firstChild, 12);
        getSelection().removeAllRanges(); getSelection().addRange(range);
        window.__capacitySelection = getSelection().toString();
    });
    cost = 28000000;
    await refresh();
    assert.equal(await detail.locator('p').textContent(), receipt);
    assert.equal(await detail.locator('tbody').innerText(), examples, 'all three workload estimates share the reading lock');
    assert(await detail.evaluate(el => el.scrollTop === 30 && getSelection().toString() === window.__capacitySelection));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('[data-throughput-calls]')?.textContent === '+4.0');
    assert.equal(await rail.getAttribute('aria-expanded'), 'false');
    await page.evaluate(() => { scrollBy({ top: 40, behavior: 'instant' }); window.__capacityReaderScroll = scrollY; });
    await page.waitForTimeout(250);
    assert(await page.evaluate(() => scrollY === window.__capacityReaderScroll), 'no delayed restoration overwrites reader scroll');

    const lastGood = await rail.innerText();
    fail = true;
    await refresh();
    await page.waitForFunction(() => document.querySelector('#chain-throughput').dataset.feedState === 'stale');
    assert.equal(await rail.innerText(), lastGood, 'failed receipts retain last-good numbers');
    fail = false;
    await refresh();
    await page.waitForFunction(() => document.querySelector('#chain-throughput').dataset.feedState === 'live');
    metadataFail = true;
    await refresh();
    await page.waitForFunction(() => document.querySelector('#chain-throughput').dataset.feedState === 'stale');
    assert.equal(await rail.innerText(), lastGood, 'a capacity-only source failure also retains the coherent last-good window');
    metadataFail = false;
    protocol = 'unreviewed-protocol';
    await refresh();
    await page.waitForFunction(() => document.querySelector('[data-throughput-transfers]')?.textContent === '—');
    assert.equal(await rail.locator('[data-throughput-calls]').textContent(), '—', 'an upgrade must not reuse the previous protocol model');
    protocol = TRANSFER_BATCH.protocol;
    await refresh();
    await page.waitForFunction(() => document.querySelector('[data-throughput-transfers]')?.textContent.startsWith('+'));

    for (const theme of ['aurora', 'clean']) {
        await page.evaluate(async theme => { const { setTheme } = await import('/js/ui/theme.js'); setTheme(theme); }, theme);
        for (const width of [1512, 1440, 1366, 1281, 1280, 1131, 1101, 1024, 901, 762, 719, 430, 393, 390, 375, 360, 320]) {
            await page.setViewportSize({ width, height: 1000 });
            await rail.scrollIntoViewIfNeeded();
            const geometry = await rail.evaluate(el => {
                const box = el.getBoundingClientRect();
                const siblings = [...el.parentElement.querySelectorAll('.header-activity-button, .chain-health')];
                return { width: box.width, height: box.height,
                    sameRow: siblings.every(sibling => Math.abs(sibling.getBoundingClientRect().top - box.top) < 2),
                    siblingOverflow: siblings.some(sibling => sibling.scrollWidth > sibling.clientWidth + 1),
                    singleLine: [...el.querySelectorAll('.chain-throughput-heading, .chain-throughput-rail, .chain-throughput-room')]
                        .every(child => Math.abs(child.getBoundingClientRect().top + child.getBoundingClientRect().height / 2 - (box.top + box.height / 2)) < 3),
                    overflow: el.scrollWidth > el.clientWidth + 1,
                    outside: [...el.querySelectorAll('.chain-throughput-heading, .chain-throughput-room')].some(child => {
                        const r = child.getBoundingClientRect(); return r.left < box.left || r.right > box.right + 1;
                    }), opacity: getComputedStyle(el).opacity,
                    animation: getComputedStyle(el.querySelector('.chain-throughput-fill')).animationName,
                    viewportOverflow: document.documentElement.scrollWidth > innerWidth + 1 };
            });
            assert(!geometry.overflow && !geometry.outside && !geometry.viewportOverflow,
                `capacity stays legible at ${width}px in ${theme}: ${JSON.stringify(geometry)}`);
            assert.equal(geometry.opacity, '1'); assert.equal(geometry.animation, 'none');
            if (width >= 1101) {
                assert(geometry.sameRow && !geometry.siblingOverflow && geometry.width <= 300 && geometry.height <= 30,
                    `laptop capacity stays compact on the Activity/Health row at ${width}px in ${theme}: ${JSON.stringify(geometry)}`);
            }
            if (width <= 719) assert(geometry.singleLine && geometry.height <= 30,
                `phone throughput stays on one line at ${width}px in ${theme}: ${JSON.stringify(geometry)}`);
            if (width === 390) {
                await page.setViewportSize({ width, height: 500 });
                await rail.evaluate(el => scrollBy({ top: el.getBoundingClientRect().bottom - (innerHeight - 40), behavior: 'instant' }));
                await detail.evaluate(el => { el.style.maxHeight = ''; });
                await rail.click();
                assert(await detail.evaluate(el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth; }),
                    'mobile detail popup stays within the viewport');
                await page.keyboard.press('Escape');
                await page.setViewportSize({ width, height: 1000 });
            }
            if (artifactsDir && [1440, 390].includes(width)) await page.locator('#live-head').screenshot({ path: path.join(artifactsDir, `throughput-${theme}-${width}.png`) });
        }
    }
    assert.deepEqual(errors, []);
    await context.close();
}
