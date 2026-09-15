import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';

export async function smokeBakerIncidents(browser, baseUrl, { installFeatureMocks, address, artifactsDir }) {
    for (const [width, height, theme] of [[1440, 1000, 'default'], [390, 844, 'clean'], [320, 740, 'dark']]) {
        const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block', reducedMotion: 'reduce' });
        try {
            await installFeatureMocks(context);
            let cycle = 1278;
            let mode = 'full';
            let allowance = 100300;
            let reads = 0;
            await context.route('**/v1/head', route => route.fulfill({ json: { level: 12345678, cycle, timestamp: new Date().toISOString() } }));
            await context.route('**/participation', route => route.fulfill({ json: { expected_cycle_activity: 301099, minimal_cycle_activity: 200732, missed_slots: 67, missed_levels: 3, remaining_allowed_missed_slots: allowance } }));
            await context.route('**/v1/rights?**', route => {
                const query = new URL(route.request().url()).searchParams;
                if (query.get('type') !== 'attestation' || query.get('status') !== 'missed') return route.fallback();
                reads++;
                assert.equal(query.get('baker'), address);
                assert([1278, 1279].includes(Number(query.get('cycle'))), 'Rights stay scoped to the head cycle used by that read');
                assert.equal(query.get('level.le'), '12345676');
                assert.equal(query.get('limit'), '3');
                assert.equal(query.get('sort.desc'), 'level');
                const rows = [24, 21, 22].map((slots, index) => ({ type: 'attestation', status: 'missed', level: 12345660 - index * 10, cycle: Number(query.get('cycle')), slots, timestamp: `2026-09-14T1${index}:00:00Z`, baker: { address } }));
                return route.fulfill({ json: mode === 'unavailable' ? null : mode === 'empty' ? [] : mode === 'one' ? rows.slice(0, 1) : mode === 'wrong-baker' ? [{ ...rows[0], baker: { address: 'tz1other' } }] : rows });
            });
            await context.addInitScript(address => {
                for (const key of ['tezos-toured', 'tezos-welcomed', 'tezos-systems-my-tezos-dismissed']) localStorage.setItem(key, '1');
                localStorage.setItem('tezos-systems-my-baker-address', address);
                window.__MY_TEZOS_OPERATOR_REFRESH_MS__ = 700;
                window.__incidentVisibility = 'visible';
                Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.__incidentVisibility });
            }, address);
            const page = await context.newPage();
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.goto(`${baseUrl}/my/?view=baker-signal&theme=${theme}`, { waitUntil: 'domcontentloaded' });
            const card = page.locator('.brief-section-baker');
            await page.locator('[data-incident-state="current"] .drawer-incident-row').nth(2).waitFor();
            await card.scrollIntoViewIfNeeded();
            await page.evaluate(() => document.fonts.ready);
            const initialHeight = await card.evaluate(node => node.getBoundingClientRect().height);
            assert.deepEqual(await page.locator('.drawer-incident-row').evaluateAll(nodes => nodes.map(node => node.getAttribute('href'))), ['https://tzkt.io/12345660', 'https://tzkt.io/12345650', 'https://tzkt.io/12345640']);
            assert((await card.innerText()).includes('24 power') && (await card.innerText()).includes('100,300 power'));
            assert((await page.locator('.drawer-incidents-coverage').innerText()).includes('Latest 3'));
            if (artifactsDir) { await mkdir(artifactsDir, { recursive: true }); await page.screenshot({ path: path.join(artifactsDir, `baker-incidents-${width}.png`) }); }
            await page.locator('.drawer-incident-row').first().focus();
            const before = await page.evaluate(() => {
                const body = document.getElementById('drawer-body');
                const row = document.querySelector('.drawer-incident-row');
                window.__incidentRow = row;
                const range = document.createRange(); range.selectNodeContents(row.firstElementChild);
                document.getSelection().removeAllRanges(); document.getSelection().addRange(range);
                return { scroll: body.scrollTop, selection: document.getSelection().toString() };
            });
            mode = 'unavailable';
            await page.locator('[data-incident-state="stale"]').waitFor();
            const retained = await page.evaluate(() => ({ same: document.querySelector('.drawer-incident-row') === window.__incidentRow, focus: document.activeElement === window.__incidentRow, scroll: document.getElementById('drawer-body').scrollTop, selection: document.getSelection().toString() }));
            assert(retained.same && retained.focus && retained.selection === before.selection && Math.abs(retained.scroll - before.scroll) <= 1, `Incident refresh disturbed the reader: ${JSON.stringify(retained)}`);
            assert((await card.innerText()).includes('refresh unavailable') && await page.locator('.drawer-incident-row').count() === 3);
            assert(Math.abs(await card.evaluate(node => node.getBoundingClientRect().height) - initialHeight) <= 1, 'A stale log must retain the card canvas');
            mode = 'one';
            await page.waitForFunction(() => document.querySelector('[data-incident-state="current"]') && document.querySelectorAll('.drawer-incident-row').length === 1);
            const shorterCanvas = await card.evaluate(node => ({ height: node.getBoundingClientRect().height, children: [...node.querySelectorAll(':scope > *, .drawer-incidents-coverage, .drawer-incident-list')].map(child => [child.className, child.getBoundingClientRect().height]) }));
            assert(Math.abs(shorterCanvas.height - initialHeight) <= 1, `A shorter log must retain the card canvas: ${initialHeight} → ${JSON.stringify(shorterCanvas)}`);
            mode = 'empty'; allowance = 0;
            await page.locator('[data-incident-state="current"] .drawer-incidents-empty').waitFor();
            await page.locator('.drawer-attestation-allowance[data-state="watch"]').waitFor();
            assert((await card.innerText()).includes('No missed attestations') && (await card.innerText()).includes('0 power'));
            assert(Math.abs(await card.evaluate(node => node.getBoundingClientRect().height) - initialHeight) <= 1, 'An empty log must retain the card canvas');
            // A failed read in a new cycle must not label the prior cycle's history current.
            mode = 'unavailable'; cycle++;
            await page.locator('[data-incident-state="unavailable"]').waitFor();
            assert(!(await card.innerText()).includes('No missed attestations') && await page.locator('.drawer-incident-row').count() === 0);
            assert(Math.abs(await card.evaluate(node => node.getBoundingClientRect().height) - initialHeight) <= 1, 'An unavailable log must retain the card canvas');
            const wrongResponse = page.waitForResponse(response => response.url().includes('/rights?') && response.url().includes('status=missed'));
            mode = 'wrong-baker';
            await wrongResponse;
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            await page.evaluate(() => { window.__incidentVisibility = 'hidden'; document.dispatchEvent(new Event('visibilitychange')); });
            const hiddenReads = reads;
            // Cross the 700ms test polling interval to exercise the visibility gate.
            await page.waitForTimeout(900);
            assert.equal(reads, hiddenReads, 'Hidden tabs must not fetch incident receipts');
            assert.equal(await page.locator('.drawer-incident-row').count(), 0, 'Another baker’s receipts must not appear');
            assert.deepEqual(errors, []);
            console.log(`ok - ${width} baker incidents, receipt links, stale/empty/cycle states, allowance, and reader preservation`);
        } finally { await context.close(); }
    }
}
