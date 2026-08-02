#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  buildBalanceExitCandidates,
  classifyBalanceExitCandidate
} from '../scripts/refresh-whale-watch-data.mjs';

const SENDER_A = 'tz1WK1xtuRNSuYGyTJbGB791QMDHaqGLQ4NJ';
const SENDER_B = 'tz2WDATNYnp7FdsmuZDYSidioZqeoLNZqXvE';
const TARGET_A = 'tz1awVyMpg9VjmZSb8pJKfrQVvBn2sYvKPr7';
const TARGET_B = 'tz1UsMMW6A81cCLxVNbhek6xavUjYKEbjMuD';
const MUTEZ = 1_000_000;

function transfer(id, {
  sender = SENDER_A,
  target = TARGET_A,
  amount = 1_000 * MUTEZ,
  level = 1_000,
  status = 'applied',
  initiator = null,
  type = 'transaction',
  timestamp = `2026-08-01T00:${String(id).padStart(2, '0')}:00Z`
} = {}) {
  return {
    id,
    hash: `opBalanceExit${id}`,
    level,
    timestamp,
    amount,
    status,
    type,
    initiator,
    sender: { address: sender, alias: sender === SENDER_B ? 'Source baker label' : undefined },
    target: { address: target, alias: target === TARGET_B ? 'Target label' : undefined }
  };
}

const candidates = buildBalanceExitCandidates([
  transfer(1, { level: 999, amount: 9_000 * MUTEZ }),
  transfer(2, { level: 1_001, amount: 1_200 * MUTEZ }),
  transfer(3, { level: 1_001, amount: 2_300 * MUTEZ, target: TARGET_B }),
  transfer(4, { sender: SENDER_B, level: 1_002, amount: 4_000 * MUTEZ }),
  transfer(5, { amount: 999 * MUTEZ }),
  transfer(6, { target: SENDER_A }),
  transfer(7, { initiator: { address: SENDER_A } }),
  transfer(8, { status: 'failed' }),
  transfer(9, { type: 'delegation' })
]);

assert.equal(candidates.length, 2, 'only qualifying top-level implicit senders should be checked');
const senderA = candidates.find((candidate) => candidate.senderAddress === SENDER_A);
const senderB = candidates.find((candidate) => candidate.senderAddress === SENDER_B);
assert(senderA && senderB, 'both qualifying senders should be retained');
assert.equal(senderA.level, 1_001, 'only the sender final qualifying block should be retained');
assert.equal(senderA.qualifyingOutflowMutez, 3_500 * MUTEZ, 'same-block qualifying transfers should aggregate');
assert.deepEqual(senderA.operationIds, [2, 3], 'same-block operation receipts should stay distinct');
assert.equal(senderA.destinations.length, 2, 'same-block destinations should stay visible');
assert.equal(senderB.senderAlias, 'Source baker label', 'TzKT alias context should survive candidate normalization');

const emptied = classifyBalanceExitCandidate(senderA, 12_000 * MUTEZ, 1 * MUTEZ);
assert.equal(emptied?.classification, 'emptied', 'one XTZ remaining should meet the exact emptied threshold');
assert.equal(classifyBalanceExitCandidate(senderA, 12_000 * MUTEZ, 1 * MUTEZ + 1)?.classification, 'near-empty', 'just above one XTZ can be near-empty');

const nearEmpty = classifyBalanceExitCandidate(senderA, 10_000 * MUTEZ, 100 * MUTEZ);
assert.equal(nearEmpty?.classification, 'near-empty', '100 XTZ and one percent should meet both near-empty bounds');
assert.equal(classifyBalanceExitCandidate(senderA, 10_000 * MUTEZ, 100 * MUTEZ + 1), null, 'the absolute near-empty bound must fail closed');
assert.equal(classifyBalanceExitCandidate(senderA, 1_000 * MUTEZ, 50 * MUTEZ), null, 'the percentage near-empty bound must fail closed');
assert.equal(classifyBalanceExitCandidate(senderA, 0, 0), null, 'missing or invalid predecessor balance must not classify');

console.log('Whale balance exits checks passed');
