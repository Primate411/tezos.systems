import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildBakerIncidents, readAttestationAllowance } from '../js/core/baker-incidents.mjs';

const bakerAddr = 'tz1test';
const head = { level: 100, cycle: 10 };
const right = { type: 'attestation', status: 'missed', baker: { address: bakerAddr }, cycle: 10, level: 95, slots: 24, timestamp: '2026-09-14T12:00:00Z' };
const build = rows => buildBakerIncidents({ rows, head, bakerAddr, observedAt: 1 });
assert.deepEqual(build([]).incidents, [], 'An empty successful source read is confirmed empty');
assert.equal(build(null), null, 'Source failure is not an empty history');
assert.equal(build([{ ...right, level: 99 }]), null, 'Unfinalized rights are excluded');
for (const delta of [{ status: 'realized' }, { status: 'future' }, { cycle: 9 }, { slots: null }, { slots: -1 }, { timestamp: 'bad' }, { baker: { address: 'tz1other' } }]) {
    assert.equal(build([{ ...right, ...delta }]), null, `Reject incorrect receipt ${JSON.stringify(delta)}`);
}
assert.equal(build([right, right]), null, 'Duplicates cannot masquerade as multiple missed levels');
assert.equal(build(Array(4).fill(right)), null, 'The incident log is bounded');
assert.deepEqual(build([{ ...right, level: 90 }, right]).incidents.map(row => row.level), [95, 90]);
assert.equal(build([right]).incidents[0].power, 24, 'Slots are power, not a count of missed blocks');
assert.equal(build([right]).throughLevel, 98);
assert.equal(readAttestationAllowance(null), null);
assert.equal(readAttestationAllowance({ expected_cycle_activity: 0, remaining_allowed_missed_slots: 0 }), null);
assert.equal(readAttestationAllowance({ expected_cycle_activity: 100, remaining_allowed_missed_slots: -1 }), null);
assert.deepEqual(readAttestationAllowance({ expected_cycle_activity: 100, remaining_allowed_missed_slots: 0 }), { remaining: 0, state: 'watch' });
assert.deepEqual(readAttestationAllowance({ expected_cycle_activity: 301099, remaining_allowed_missed_slots: 100300 }), { remaining: 100300, state: 'ok' });

const source = readFileSync(new URL('../js/features/my-tezos.js', import.meta.url), 'utf8');
const fetcher = source.slice(source.indexOf('async function fetchBakerIncidents('), source.indexOf('\nfunction normalizeBallotStatus'));
assert(fetcher.includes('visibleOnly: true') && fetcher.includes("'level.le': String(head.level - 2)") && fetcher.includes("status: 'missed'") && fetcher.includes('cycle: String(head.cycle)'));
assert(source.includes('quietlySyncHtml(bakerBrief, (bakerCards.some') && source.includes('renderBakerStatusCard({}, true)'), 'Loading and refresh must use the same status card structure');
console.log('ok - baker incident identity, finality, cycle scope, bounded receipts, unavailable data, and RPC allowance');
