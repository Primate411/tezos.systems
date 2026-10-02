import assert from 'node:assert/strict';
import { readSolanaTowerReceipt } from '../scripts/lib/solana-comparison-receipt.mjs';

const legacy = 'Under Development; current roughly 400ms pre-confirmation latency; 12.8-second TowerBFT finality; future 150ms finality.';
const revised = 'In Development. Today that job belongs to TowerBFT. The votes have stacked up over 32 slots, about 12.8 seconds. Slot time is being cut separately, from 400ms to 200ms. Target: 150ms.';
const activationTable = 'Current feature gate activation status: Cluster Activation status Testnet Active Devnet Active Mainnet Not activated';
const current = `In Development. Today that takes about 12.8 seconds. Alpenglow targets roughly 150 milliseconds. Solana's current consensus, TowerBFT, uses votes. Block time is being cut separately, by reduced slot times, from 400ms to 200ms in stages. ${activationTable}`;
for (const source of [legacy, revised, current, current.replace("Solana's", 'Solana’s')]) assert.deepEqual(readSolanaTowerReceipt(source), { slotMs: 400, finalitySeconds: 12.8 });
for (const source of [revised.replace('In Development', 'Live'), revised.replace('Today that job belongs to TowerBFT', 'Consensus activation status unavailable'), revised.replace('from 400ms to', 'from an unknown duration to'), 'In Development. Target: 150ms.']) {
  assert.throws(() => readSolanaTowerReceipt(source), 'Unknown status or timing must not publish planned values as current');
}
for (const source of [
  current.replace('In Development', 'Live'),
  current.replace('current consensus', 'former consensus'),
  current.replace(activationTable, ''),
  current.replace('Mainnet Not activated', 'Mainnet Active'),
  current.replace('Mainnet Not activated', 'Mainnet Unknown'),
  current.replace('Mainnet Not activated', 'Mainnet'),
  current.replace('Today that takes about 12.8 seconds.', ''),
  current.replace('from 400ms to 200ms', 'to 200ms'),
  `${legacy} ${activationTable.replace('Mainnet Not activated', 'Mainnet Active')}`,
  `${revised} ${activationTable.replace('Mainnet Not activated', 'Mainnet Unknown')}`,
]) assert.throws(() => readSolanaTowerReceipt(source), 'Planned timings and testnet/devnet activation cannot establish current mainnet timing');
console.log('ok - Solana comparison source revisions preserve current TowerBFT timing and reject ambiguous activation');
