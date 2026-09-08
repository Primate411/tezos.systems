import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { generatedTransportPath } from '../js/core/generated-transport.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const baseIndex = process.argv.indexOf('--base-url');
const baseUrl = baseIndex < 0 ? 'http://127.0.0.1:9999' : process.argv[baseIndex + 1];
const artifactIndex = process.argv.indexOf('--artifacts-dir');
const artifactsDir = artifactIndex < 0 ? null : process.argv[artifactIndex + 1];
if (artifactsDir) await fs.mkdir(artifactsDir, { recursive: true });
const require = createRequire(import.meta.url);
const { launchChromium } = require('../scripts/lib/playwright-browser.cjs');
const browser = await launchChromium(chromium);
const rooms = [
    { key: 'capital', source: 'data/capital-snapshot.json', route: '/capital/', body: '#capital-chamber-body', ready: '#capital-view-content', views: ['system', 'markets', 'assets', 'art'] },
    { key: 'minerals', source: 'data/minerals-snapshot.json', route: '/minerals/', body: '#minerals-chamber-body', ready: '#minerals-view-content', views: ['atlas', 'supply', 'markets', 'etherlink', 'proofbook'] },
    { key: 'ecosystem', source: 'data/ecosystem-stats.json', route: '/ecosystem/', body: '#ecosystem-chamber-body', ready: '.ecosystem-overview-charts', views: ['all', 'tezos', 'etherlink'] }
];
const fixedNow = Date.now();
try {
    for (const room of rooms) {
        const original = await fs.readFile(path.join(ROOT, room.source), 'utf8');
        const transportPath = generatedTransportPath(room.source);
        const compact = await fs.readFile(path.join(ROOT, transportPath.slice(1)), 'utf8');
        for (const width of [1440, 390]) {
            let expected;
            for (const mode of ['expanded', 'transport']) {
                const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
                try {
                    await context.route('**/*', route => new URL(route.request().url()).origin === new URL(baseUrl).origin ? route.continue() : route.abort());
                    await context.route(`**${transportPath}*`, route => route.fulfill({ contentType: 'application/json', body: mode === 'expanded' ? original : compact }));
                    await context.addInitScript(({ now, width }) => {
                        const NativeDate = Date;
                        window.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } };
                        localStorage.setItem('tezos-systems-theme', width === 1440 ? 'matrix' : 'clean');
                        localStorage.setItem('tezos-toured', '1'); localStorage.setItem('tezos-welcomed', '1');
                    }, { now: fixedNow, width });
                    const page = await context.newPage(), requests = [], errors = [];
                    page.on('request', request => requests.push(new URL(request.url()).pathname));
                    page.on('pageerror', error => errors.push(error.message));
                    await page.goto(`${baseUrl}${room.route}`, { waitUntil: 'domcontentloaded' });
                    await page.locator(`${room.body} ${room.ready}`).waitFor({ timeout: 20000 });
                    const readings = [];
                    for (const view of room.views) {
                        const attribute = room.key === 'ecosystem' ? 'data-ecosystem-layer' : `data-${room.key}-view`;
                        await page.locator(`${room.body} [${attribute}="${view}"]`).click();
                        readings.push(await page.locator(room.body).evaluate(element => ({
                            text: element.textContent,
                            links: [...element.querySelectorAll('a[href]')].map(link => link.getAttribute('href')),
                            plots: [...element.querySelectorAll('svg path[d], svg polyline[points]')].map(node => node.getAttribute('d') || node.getAttribute('points'))
                        })));
                    }
                    if (mode === 'expanded') expected = readings;
                    else assert.deepEqual(readings, expected, `${room.key} ${width}: every view, figure, unit and source link matches expanded rendering`);
                    assert.equal(requests.filter(value => value === transportPath).length, 1, 'one full transport per room');
                    assert(!requests.includes(`/${room.source}`), 'successful transport never downloads expanded source');
                    assert.deepEqual(errors, [], `${room.key} ${mode}: no browser exceptions`);
                    if (artifactsDir && mode === 'transport') await page.screenshot({ path: path.join(artifactsDir, `${room.key}-transport-${width}.png`) });
                } finally { await context.close(); }
            }
        }
    }
    const manifest = JSON.parse(await fs.readFile(path.join(ROOT, 'data/maxis/manifest.json'), 'utf8'));
    const directory = `data/maxis/seasons/${manifest.activeSeasonId}/passports`;
    const shardFiles = await Promise.all((await fs.readdir(path.join(ROOT, directory))).filter(name => /^[0-9a-f]{2}\.json$/.test(name))
        .map(async name => ({ name, bytes: (await fs.stat(path.join(ROOT, directory, name))).size })));
    const largest = shardFiles.sort((a, b) => b.bytes - a.bytes)[0].name;
    const shard = JSON.parse(await fs.readFile(path.join(ROOT, directory, largest), 'utf8'));
    const address = Object.keys(shard.passports)[0];
    for (const width of [1440, 390]) {
        const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
        try {
            await context.route('**/*', route => new URL(route.request().url()).origin === new URL(baseUrl).origin ? route.continue() : route.abort());
            await context.addInitScript(() => {
                localStorage.setItem('tezos-systems-theme', 'matrix');
                localStorage.setItem('tezos-toured', '1'); localStorage.setItem('tezos-welcomed', '1');
            });
            const page = await context.newPage(), requests = [], errors = [];
            page.on('request', request => { if (request.url().includes('/passports/')) requests.push(new URL(request.url()).pathname); });
            page.on('pageerror', error => errors.push(error.message));
            await page.goto(`${baseUrl}/maxis/?view=passport&address=${address}`, { waitUntil: 'domcontentloaded' });
            await page.locator('.maxis-passport-identity').waitFor({ timeout: 20000 });
            assert((await page.locator('.maxis-passport-identity').textContent()).includes(address));
            assert(requests.includes(generatedTransportPath(`${directory}/${largest}`)), 'largest real Passport shard uses its versioned transport');
            assert(requests.every(request => request.startsWith('/data/transports/v1/')), 'Passport does not download both representations');
            assert.deepEqual(errors, []);
            if (artifactsDir) await page.screenshot({ path: path.join(artifactsDir, `maxis-transport-${width}.png`) });
        } finally { await context.close(); }
    }
} finally { await browser.close(); }
console.log('ok - desktop/mobile transport parity across all Capital, Minerals and Ecosystem views, figures and source links; largest real Maxis Passport opens with its frozen receipt');
