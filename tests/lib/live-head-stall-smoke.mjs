import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

export async function smokeLiveHeadStall(browser, baseUrl, { installFeatureMocks, artifactsDir }) {
    for (const profile of [
        { width: 1440, theme: 'default' },
        { width: 390, theme: 'default' },
        { width: 320, theme: 'clean' },
        { width: 1440, theme: 'default', rows: 1 }
    ]) {
        const context = await browser.newContext({ viewport: { width: profile.width, height: 1000 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
        try {
            const mock = await installFeatureMocks(context, { blockHeadLagMs: 134000, blockHeadAutoAdvance: false });
            await context.addInitScript(({ theme, rows }) => {
                localStorage.setItem('tezos-systems-theme', theme);
                localStorage.setItem('tezos-welcomed', '1');
                localStorage.setItem('tezos-toured', '1');
                localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
                if (rows) localStorage.setItem('tezos-systems-live-head-depth-v1', JSON.stringify({ version: 2, mode: 'custom', customRows: rows }));
            }, profile);
            const page = await context.newPage();
            await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
            const refresh = () => page.evaluate(async () => {
                const { versionedAsset } = await import('/js/core/asset-version.js');
                const health = await import(versionedAsset('/js/features/network-health.js'));
                health.initNetworkHealth();
                await health.refreshNetworkHealth({ force: true });
            });
            await refresh();
            await page.waitForFunction(() => document.getElementById('live-head')?.dataset.chainState === 'stalled');
            await page.locator('#live-head').scrollIntoViewIfNeeded();
            const geometry = await page.locator('#live-head').evaluate(panel => {
                const alert = panel.querySelector('#live-head-alert');
                const content = alert.querySelector('.live-head-alert-content');
                const rect = element => {
                    const { x, y, width, height, top, right, bottom, left } = element.getBoundingClientRect();
                    return { x, y, width, height, top, right, bottom, left };
                };
                window.__stallRetainedRow = panel.querySelector('.live-head-row[data-live-head-level]');
                return {
                    panel: rect(panel), alert: rect(alert), content: rect(content),
                    duration: panel.querySelector('[data-live-head-alert-duration]').textContent,
                    pointerEvents: getComputedStyle(alert).pointerEvents,
                    scrollWidth: document.documentElement.scrollWidth, viewport: innerWidth
                };
            });
            const { panel, alert, content } = geometry;
            assert(Math.abs(alert.width - panel.width) <= 2 && Math.abs(alert.height - panel.height) <= 2, 'stall scrim must cover the complete pane');
            assert(Math.abs(content.x + content.width / 2 - (panel.x + panel.width / 2)) <= 1, 'stall text must be horizontally centered');
            assert(Math.abs(content.y + content.height / 2 - (panel.y + panel.height / 2)) <= 1, 'stall text must be vertically centered');
            assert(content.top >= panel.top && content.bottom <= panel.bottom, `stall message must fit ${JSON.stringify({ profile, geometry })}`);
            assert(geometry.scrollWidth <= geometry.viewport, 'stall must not add horizontal overflow');
            assert.equal(geometry.pointerEvents, 'none', 'overlay must let readers inspect retained blocks');
            assert.match(geometry.duration, /^for 2 minutes \d+ seconds?$/);
            await page.locator('.live-head-alert-action').focus();
            const before = await page.evaluate(() => ({ scroll: scrollY, duration: document.querySelector('[data-live-head-alert-duration]').textContent }));
            await page.waitForFunction(duration => document.querySelector('[data-live-head-alert-duration]').textContent !== duration, before.duration);
            const after = await page.evaluate(() => ({
                scroll: scrollY, sameRow: window.__stallRetainedRow === document.querySelector('.live-head-row[data-live-head-level]'),
                focused: document.activeElement.classList.contains('live-head-alert-action')
            }));
            assert(after.sameRow && after.focused && after.scroll === before.scroll, 'elapsed ticks must preserve the row, focus and reader scroll');
            if (artifactsDir) {
                await mkdir(artifactsDir, { recursive: true });
                await page.locator('#live-head').screenshot({ path: path.join(artifactsDir, `stall-${profile.width}-${profile.theme}-${profile.rows || 'compact'}.png`) });
            }
            // A newer, genuinely fresh block must remove the whole tint without resizing the pane.
            mock.setBlockHeadLag(0);
            mock.advanceBlockHead();
            await refresh();
            await page.waitForFunction(() => document.getElementById('live-head-alert').hidden);
            assert(Math.abs((await page.locator('#live-head').boundingBox()).height - panel.height) <= 1, 'recovery must preserve the exact pane height');
            assert.match(await page.locator('#chain-stall-announcer').textContent(), /block production resumed/i);
        } finally {
            await context.close();
        }
    }
}
