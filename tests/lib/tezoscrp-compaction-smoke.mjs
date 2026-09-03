import assert from 'node:assert/strict';
import path from 'node:path';
import { encodeTezosCrpDataset } from '../../js/core/tezoscrp-codec.mjs';

export async function smokeTezosCrpCompaction(browser, baseUrl, { dataset, installFeatureMocks, artifactsDir }) {
  const compact = encodeTezosCrpDataset(dataset);
  const period = dataset.program.first_award_period;
  const expected = dataset.awards.filter(row => row.period === period);
  assert(expected.length <= 50, 'First-month fixture must fit one archive page');
  const expectedLinks = expected.map(row => new URL(row.sources[0].url).href).sort();
  for (const scenario of ['compact', 'legacy', 'bad-reference', 'http-error']) {
    const width = scenario === 'compact' ? 1440 : 390;
    const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
    try {
      await installFeatureMocks(context);
      await context.addInitScript(width => {
        localStorage.setItem('tezos-systems-theme', width === 1440 ? 'matrix' : 'clean');
        localStorage.setItem('tezos-toured', '1');
        localStorage.setItem('tezos-welcomed', '1');
      }, width);
      let recovered = false, reads = 0;
      const broken = structuredClone(compact);
      broken.awards[0].source_ids = [compact.award_dictionaries.sources.length];
      await context.route('**/data/tezoscrp-awards.compact.json*', route => {
        reads++;
        if (scenario === 'http-error' && !recovered) return route.fulfill({ status: 503, body: 'Unavailable' });
        const payload = scenario === 'legacy' ? dataset : scenario === 'bad-reference' && !recovered ? broken : compact;
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(payload) });
      });
      const page = await context.newPage(), errors = [], requests = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => requests.push(new URL(request.url()).pathname));
      await page.goto(`${baseUrl}/tezoscrp/?view=archive&period=${period}`, { waitUntil: 'domcontentloaded' });
      if (scenario === 'bad-reference' || scenario === 'http-error') {
        await page.locator('#tezoscrp-retry').waitFor();
        assert.equal(await page.locator('.tezoscrp-archive-list article').count(), 0, 'Corruption must not produce partial or invented award rows');
        recovered = true;
        await page.locator('#tezoscrp-retry').click();
      }
      await page.locator('.tezoscrp-archive-list article').first().waitFor();
      const actual = await page.locator('.tezoscrp-archive-list article > a').evaluateAll(links => links.map(link => link.href).sort());
      assert.deepEqual(actual, expectedLinks, `${scenario}: every historical official link survives decoding`);
      assert.equal(await page.locator('.tezoscrp-archive-list article').count(), expected.length);
      assert.equal(await page.locator('.tezoscrp-source-missing').count(), 0);
      assert.equal(reads, recovered ? 2 : 1, 'One request per explicit read, including retry');
      assert(!requests.includes('/data/tezoscrp-awards.json'), 'Never load both archive representations');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      await page.evaluate(() => document.fonts.ready);
      if (artifactsDir) await page.screenshot({ path: path.join(artifactsDir, `tezoscrp-${scenario}-${width}.png`) });
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
  console.log('ok - TezosCRP compact/legacy parity, historical source links, malformed references, and explicit retry recovery');
}
