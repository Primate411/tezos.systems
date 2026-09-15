import assert from 'node:assert/strict';
import { readSolanaTowerReceipt } from '../scripts/lib/solana-comparison-receipt.mjs';

const legacy = 'Under Development; current roughly 400ms pre-confirmation latency; 12.8-second TowerBFT finality; future 150ms finality.';
const revised = 'In Development. Today that job belongs to TowerBFT. The votes have stacked up over 32 slots, about 12.8 seconds. Slot time is being cut separately, from 400ms to 200ms. Target: 150ms.';
for (const source of [legacy, revised]) assert.deepEqual(readSolanaTowerReceipt(source), { slotMs: 400, finalitySeconds: 12.8 });
for (const source of [revised.replace('In Development', 'Live'), revised.replace('Today that job belongs to TowerBFT', 'Consensus activation status unavailable'), revised.replace('from 400ms to', 'from an unknown duration to'), 'In Development. Target: 150ms.']) {
  assert.throws(() => readSolanaTowerReceipt(source), 'Unknown status or timing must not publish planned values as current');
}
console.log('ok - Solana comparison source revisions preserve current TowerBFT timing and reject ambiguous activation');
