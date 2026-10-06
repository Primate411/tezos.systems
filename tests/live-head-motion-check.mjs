import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolveLiveHeadMotion } from '../js/core/live-head-motion.mjs';

const receipt = { catchupPending: true, visible: true, previousLevel: 100, level: 103 };
for (const change of [{ supplemental: true }, { suppressMotion: true }, { error: true }, { visible: false }, { level: 100 }]) {
  assert.deepEqual(resolveLiveHeadMotion({ ...receipt, ...change }), { suppressMotion: true, catchupPending: true });
}
assert.deepEqual(resolveLiveHeadMotion(receipt), { suppressMotion: true, catchupPending: false });
assert.deepEqual(resolveLiveHeadMotion({ ...receipt, catchupPending: false }), { suppressMotion: false, catchupPending: false });
const source = await readFile('js/features/network-health.js', 'utf8');
assert.match(source, /function updateBlockTicker\([^]*?\{\n\s*if \(document\.visibilityState !== 'visible'\) return;/);
assert.match(source, /const motion = resolveLiveHeadMotion\(/);
assert.match(source, /suppressNextHeartbeatMotion = motion\.catchupPending/);
assert.match(source, /if \(suppressMotion\) \{[^]*?animation\.id === 'chain-health-shift'[^]*?animation\.cancel\(\)/);
console.log('ok - visibility catch-up survives supplemental, local-layout, stale and hidden receipts without replaying motion');
