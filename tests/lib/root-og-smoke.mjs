import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
const require = createRequire(import.meta.url);
const { renderOgImage, optimizePng, writeOgImage } = require('../../scripts/generate-og-image.js');
const normal = { bakers: 197, issuance: '2.96', tz4Pct: '42.6', stakingRatio: '30.4', supply: '1.12B', protocolName: 'Ushuaia', deltas: { bakers: 1, issuance: -3, tz4: 2.6, staking: 1.5, supply: 0.19 } };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

export async function smokeRootOgImage(browser, _baseUrl, { artifactsDir = '' } = {}) {
  const fonts = await Promise.all(['orbitron-latin.woff2', 'share-tech-mono-latin.woff2'].map(file => fs.readFile(new URL(`../fixtures/og-fonts/${file}`, import.meta.url))));
  const css = `@font-face{font-family:'Orbitron';font-style:normal;font-weight:400 900;src:url(data:font/woff2;base64,${fonts[0].toString('base64')}) format('woff2')}@font-face{font-family:'Share Tech Mono';font-style:normal;font-weight:400;src:url(data:font/woff2;base64,${fonts[1].toString('base64')}) format('woff2')}`;
  const configurePage = async page => {
    await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: css }));
    await page.route('https://fonts.gstatic.com/**', route => route.abort());
  };
  const scenarios = [
    ['current', normal],
    ['wide', { ...normal, bakers: 10000, issuance: '100.00', tz4Pct: '100.0', stakingRatio: '100.0', supply: '123.45B', deltas: { bakers: 999.4, issuance: -100.5, tz4: 100.5, staking: -999.4, supply: 10000 } }],
    ['zero-and-unavailable', { ...normal, deltas: { bakers: 0, issuance: null, tz4: 0.001, staking: -0.001, supply: Infinity } }]
  ];
  const report = { scenarios: [], pixelEquality: true, deterministic: false, missingFontsPreserveLastGood: false };
  let firstImage;
  for (const [id, stats] of scenarios) {
    const { png, layout } = await renderOgImage(browser, stats, { configurePage });
    if (artifactsDir) { await fs.mkdir(artifactsDir, { recursive: true }); await fs.writeFile(path.join(artifactsDir, `root-og-${id}-layout.json`), JSON.stringify(layout, null, 2) + '\n'); }
    assert.equal(layout.width, 1200); assert.equal(layout.height, 630);
    assert.equal(layout.documentWidth, 1200); assert.equal(layout.documentHeight, 630);
    assert.equal(layout.canvas.width, 1200); assert.equal(layout.canvas.height, 630);
    assert.equal(layout.cards.length, 6);
    assert.equal(layout.cards.filter(card => card.delta).length, 5);
    assert.ok(layout.fonts.every(font => font.status === 'loaded'));
    assert.ok(layout.fonts.some(font => font.family === 'Orbitron'));
    assert.ok(layout.fonts.some(font => font.family === 'Share Tech Mono'));
    assert.ok(layout.header.bottom < layout.cards[0].card.y, `${id}: complete header does not overlap the stats`);
    assert.ok(layout.cards.every(({ card }) => card.bottom < layout.footer.y), `${id}: stats do not overlap footer`);
    for (const [index, { card, label, value, delta }] of layout.cards.entries()) {
      const within = item => item.x >= card.x + 11 && item.right <= card.right - 11 && item.y >= card.y && item.bottom <= card.bottom;
      assert.ok(card.x >= 0 && card.right <= 1200 && card.y >= 0 && card.bottom <= 630, `${id} card ${index}: fits canvas`);
      assert.ok(within(label) && within(value), `${id} card ${index}: labels and main values fit their card`);
      assert.ok(value.scrollWidth <= value.clientWidth + 1, `${id} card ${index}: main value is not clipped`);
      assert.equal(value.fontSize, index === 5 ? 40 : 50, `${id}: main numbers keep their established size`);
      if (!delta) continue;
      assert.equal(delta.amount.fontSize, 24, `${id}: percentage type is 50% larger than 16px`);
      assert.equal(delta.period.fontSize, 16.5, `${id}: 30D type is 50% larger than 11px`);
      assert.equal(delta.period.text, '30D');
      assert.ok(delta.height >= 40, `${id}: enlarged pill geometry`);
      assert.ok(within(delta), `${id} card ${index}: pill fits inside card padding`);
      assert.ok(delta.amount.right + 7 <= delta.period.x, `${id}: amount and period remain separate`);
      assert.ok(delta.period.right <= delta.right - 12 && delta.amount.x >= delta.x + 12, `${id}: pill text preserves inner padding`);
      const sameRow = value.right + 6 <= delta.x;
      const separateRow = value.bottom + 6 <= delta.y;
      assert.ok(sameRow || separateRow, `${id} card ${index}: value and enlarged pill never overlap`);
      if (id === 'current') assert.ok(sameRow, `Current card ${index}: all five pills remain alongside values; value=${JSON.stringify(value)}, delta=${JSON.stringify(delta)}`);
    }
    const compressed = await optimizePng(png);
    assert.ok(compressed.after <= compressed.before);
    const [before, after] = await Promise.all([sharp(png).ensureAlpha().raw().toBuffer(), sharp(compressed.buffer).ensureAlpha().raw().toBuffer()]);
    assert.ok(before.equals(after), `${id}: displayed pixels are exactly equal after compression`);
    const row = { id, stats, layout, rawPngBytes: png.length, optimizedPngBytes: compressed.after, savedBytes: compressed.saved, rawPixelSha256: hash(before) };
    if (artifactsDir) {
      await fs.mkdir(artifactsDir, { recursive: true });
      await fs.writeFile(path.join(artifactsDir, `root-og-${id}.png`), compressed.buffer);
      await sharp(compressed.buffer).resize(600, 315).png().toFile(path.join(artifactsDir, `root-og-${id}-600.png`));
    }
    report.scenarios.push(row);
    if (id === 'current') firstImage = before;
  }
  const repeated = await renderOgImage(browser, normal, { configurePage });
  assert.ok(firstImage.equals(await sharp(repeated.png).ensureAlpha().raw().toBuffer()), 'The same facts, fonts and Valley frame produce identical pixels on repeated renders');
  report.deterministic = true;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'root-og-font-failure-'));
  try {
    const destination = path.join(directory, 'og-image.png');
    await fs.writeFile(destination, repeated.png);
    await assert.rejects(async () => {
      const result = await renderOgImage(browser, normal, { configurePage: async page => {
        await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '/* fonts unavailable */' }));
        await page.route('https://fonts.gstatic.com/**', route => route.abort());
      } });
      await writeOgImage(destination, result.png);
    }, /requires its real Orbitron and Share Tech Mono fonts/);
    assert.ok(repeated.png.equals(await fs.readFile(destination)), 'failed font rendering leaves the last-good image untouched');
    report.missingFontsPreserveLastGood = true;
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
  if (artifactsDir) await fs.writeFile(path.join(artifactsDir, 'root-og.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('ok - root OG: 3 real-font Valley layouts, five 50%-larger pills, no clipping/overlap, exact optimized pixels, deterministic frame, font-failure retention');
  return report;
}
