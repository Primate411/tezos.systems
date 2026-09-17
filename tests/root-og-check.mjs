import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
const require = createRequire(import.meta.url);
const { buildHTML, optimizePng, writeOgImage } = require('../scripts/generate-og-image.js');
const fixture = { bakers: 197, issuance: '2.96', tz4Pct: '42.6', stakingRatio: '30.4', supply: '1.12B', protocolName: 'Ushuaia', deltas: { bakers: 1, issuance: -3, tz4: 2.6, staking: 0, supply: null } };
const html = buildHTML(fixture);
assert.equal((html.match(/class="stat-delta /g) || []).length, 5, 'exactly five facts carry 30-day deltas');
for (const label of ['+1.0%', '−3.0%', '+2.6%', '0.00%', '<strong>—</strong><small>30D</small>']) assert.ok(html.includes(label), `honest delta formatting: ${label}`);
assert.ok(html.includes('Ushuaia protocol') && html.includes('Real-time network facts, chambers, and personal tools'));
assert.equal(execFileSync(process.execPath, ['-e', 'global.fetch = () => { throw new Error("import attempted live I/O"); }; require("./scripts/generate-og-image.js");'], { encoding: 'utf8' }), '', 'importing the generator never runs its live CLI');

const fontManifest = JSON.parse(await fs.readFile(new URL('./fixtures/og-fonts/sources.json', import.meta.url), 'utf8'));
for (const receipt of fontManifest.receipts) {
  const bytes = await fs.readFile(new URL(`./fixtures/og-fonts/${receipt.file}`, import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), receipt.sha256, `pinned font/license receipt: ${receipt.file}`);
}

const comparePixels = async (left, right) => {
  const [a, b] = await Promise.all([sharp(left).ensureAlpha().raw().toBuffer({ resolveWithObject: true }), sharp(right).ensureAlpha().raw().toBuffer({ resolveWithObject: true })]);
  assert.deepEqual(b.info, a.info);
  assert.ok(a.data.equals(b.data), 'all decoded RGBA bytes must remain identical');
};
for (const channels of [3, 4]) {
  const width = 63, height = 47;
  const raw = Buffer.alloc(width * height * channels);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * channels;
    raw[i] = x * 4; raw[i + 1] = y * 5; raw[i + 2] = (x * 3 + y * 7) % 256;
    if (channels === 4) raw[i + 3] = (x + y) % 5 === 0 ? 0 : (x * 13 + y * 17) % 256;
  }
  const input = await sharp(raw, { raw: { width, height, channels } }).png({ compressionLevel: 0 }).toBuffer();
  const result = await optimizePng(input);
  assert.ok(result.after < result.before, `gradient fixture ${channels} channels must compress`);
  assert.equal(result.saved, result.before - result.after);
  await comparePixels(input, result.buffer);
  const metadata = await sharp(result.buffer).metadata();
  assert.equal(metadata.channels, channels);
  assert.equal(metadata.isPalette, false, 'lossless optimization must never introduce a palette');
}
const tiny = await sharp({ create: { width: 1, height: 1, channels: 3, background: '#765432' } }).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
const unchanged = await optimizePng(tiny);
assert.equal(unchanged.buffer, tiny, 'equal-or-larger candidates retain the original buffer');
assert.equal(unchanged.saved, 0);
const noisyPixels = Buffer.from(Array.from({ length: 12 }, (_, i) => (i * 79 + (i % 5) * 17) % 256));
const alreadySmaller = await sharp(noisyPixels, { raw: { width: 2, height: 2, channels: 3 } }).png({ compressionLevel: 9, adaptiveFiltering: false }).toBuffer();
const largerCandidate = await sharp(alreadySmaller).png({ compressionLevel: 9, adaptiveFiltering: true, palette: false }).toBuffer();
assert.ok(largerCandidate.length > alreadySmaller.length, 'tiny noisy fixture exercises an actually larger candidate');
const retained = await optimizePng(alreadySmaller);
assert.equal(retained.buffer, alreadySmaller, 'a larger candidate must never replace the original');
assert.equal(retained.saved, 0);
const tagged = await sharp(tiny).withMetadata({ orientation: 6, density: 144 }).png().toBuffer();
const taggedResult = await optimizePng(tagged);
assert.equal(taggedResult.buffer, tagged, 'embedded color/orientation metadata keeps its original encoding');
await assert.rejects(optimizePng(await sharp(tiny).jpeg().toBuffer()), /8-bit truecolour PNG/);

const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'root-og-check-'));
try {
  const destination = path.join(directory, 'og-image.png');
  const image = await sharp({ create: { width: 1200, height: 630, channels: 3, background: '#182016' } }).png({ compressionLevel: 0 }).toBuffer();
  const result = await writeOgImage(destination, image);
  const written = await fs.readFile(destination);
  assert.equal(written.length, result.after);
  assert.ok(result.after < result.before);
  await comparePixels(image, written);
  await assert.rejects(writeOgImage(destination, Buffer.from('broken image')));
  assert.ok(written.equals(await fs.readFile(destination)), 'invalid image preserves the exact last-good file');
  await assert.rejects(writeOgImage(destination, tiny), /1200x630/);
  assert.ok(written.equals(await fs.readFile(destination)), 'wrong dimensions preserve the exact last-good file');
  const occupied = path.join(directory, 'occupied');
  await fs.mkdir(occupied);
  await fs.writeFile(path.join(occupied, 'keep.txt'), 'last-good');
  await assert.rejects(writeOgImage(occupied, image), /EISDIR|ENOTDIR|EPERM/);
  assert.equal(await fs.readFile(path.join(occupied, 'keep.txt'), 'utf8'), 'last-good', 'failed atomic replacement preserves its target');
  assert.deepEqual((await fs.readdir(directory)).sort(), ['occupied', 'og-image.png'], 'temporary files are cleaned after success and failure');
} finally { await fs.rm(directory, { recursive: true, force: true }); }
console.log('ok - root OG: exact RGB/RGBA pixels, no palettes, never-larger PNG, metadata fallback, atomic last-good writes, import safety, five honest deltas');
