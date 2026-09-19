#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildBakerGovernanceSignals,
  validateBakerGovernanceSignals
} from '../scripts/generate-baker-governance-signals.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function read(relativePath) {
  return fs.readFile(path.join(ROOT, relativePath), 'utf8');
}

const [careersText, votesText, artifactText, leaderboard, projectionGenerator, orchestrator] = await Promise.all([
  read('data/maxis-careers.json'),
  read('data/governance-votes.json'),
  read('data/baker-governance-signals.json'),
  read('js/features/leaderboard.js'),
  read('scripts/generate-launcher-projections.mjs'),
  read('scripts/refresh-generated-surfaces.mjs')
]);
const careers = JSON.parse(careersText);
const governanceVotes = JSON.parse(votesText);
const artifact = JSON.parse(artifactText);

const errors = validateBakerGovernanceSignals(artifact);
assert.deepEqual(errors, [], `Baker governance signal artifact is invalid: ${errors.join('; ')}`);

const rebuilt = buildBakerGovernanceSignals({
  careers,
  governanceVotes,
  careersText,
  governanceVotesText: votesText
});
assert.equal(`${JSON.stringify(rebuilt, null, 2)}\n`, artifactText, 'Baker governance signal artifact is stale');

const activeCareers = Object.values(careers.records).filter((record) => record.activeDelegate === true);
assert.equal(artifact.recordCount, activeCareers.length, 'Projection must contain the complete source active-delegate cohort');
assert.deepEqual(
  Object.keys(artifact.records),
  activeCareers.map((record) => record.address).sort(),
  'Projection records must be the exact ordered active-delegate address set'
);
for (const career of activeCareers) {
  const projected = artifact.records[career.address];
  assert.deepEqual(
    {
      lifetimeBallots: projected.lifetimeBallots,
      currentBallotPeriodStreak: projected.currentBallotPeriodStreak,
      longestBallotPeriodStreak: projected.longestBallotPeriodStreak
    },
    {
      lifetimeBallots: career.lifetimeBallots,
      currentBallotPeriodStreak: career.currentBallotPeriodStreak,
      longestBallotPeriodStreak: career.longestBallotPeriodStreak
    },
    `${career.address} governance career signal drifted`
  );
  for (const forbidden of ['periodActivity', 'actionablePeriodIndexes', 'ballotPeriodIndexes', 'activeDelegateCounters']) {
    assert.equal(forbidden in projected, false, `${career.address} projection leaked heavyweight ${forbidden}`);
  }
}

const activeAddresses = new Set(activeCareers.map((record) => record.address));
const expectedAccepted = governanceVotes.epochs
  .flatMap((epoch) => epoch.proposals || [])
  .filter((proposal) => proposal.status === 'accepted' && activeAddresses.has(proposal.initiator?.address))
  .map((proposal) => ({
    address: proposal.initiator.address,
    hash: proposal.hash,
    name: String(proposal?.extras?.alias || '').trim() || `${proposal.hash.slice(0, 8)}…`,
    epoch: Number.isFinite(Number(proposal.epoch)) ? Number(proposal.epoch) : null
  }));
const projectedAccepted = Object.values(artifact.records).flatMap((record) => (
  record.acceptedProposals.map((proposal) => ({ address: record.address, ...proposal }))
));
const compareAccepted = (left, right) => left.address.localeCompare(right.address)
  || Number(left.epoch) - Number(right.epoch)
  || left.hash.localeCompare(right.hash);
assert.deepEqual(
  projectedAccepted.toSorted(compareAccepted),
  expectedAccepted.toSorted(compareAccepted),
  'Accepted-proposal initiator signals must exactly match active source bakers'
);
assert.equal(artifact.acceptedProposalCount, expectedAccepted.length, 'Accepted proposal count must reconcile');

const fullBytes = Buffer.byteLength(careersText) + Buffer.byteLength(votesText);
const compactBytes = Buffer.byteLength(artifactText);
assert(compactBytes < fullBytes * 0.03, `Compact signal receipt is not compact enough: ${compactBytes}/${fullBytes} bytes`);
assert(compactBytes <= 96 * 1024, `Compact signal receipt exceeded its 96 KiB budget: ${compactBytes}`);

const broken = structuredClone(artifact);
broken.recordCount += 1;
assert(validateBakerGovernanceSignals(broken).some((error) => error.includes('recordCount')), 'Validator must reject a mismatched record count');
const tampered = structuredClone(artifact);
tampered.records[Object.keys(tampered.records)[0]].lifetimeBallots += 1;
assert(validateBakerGovernanceSignals(tampered).some((error) => error.includes('integrity')), 'Validator must reject tampered signal content');
for (const [field, replacement] of [
  ['zeroSemantics', 'Zero values always prove no governance history.'],
  ['missingAddressSemantics', 'A missing address has zero governance history.']
]) {
  const changedCoverageSemantics = structuredClone(artifact);
  changedCoverageSemantics.coverage[field] = replacement;
  assert(
    validateBakerGovernanceSignals(changedCoverageSemantics).some((error) => error.includes('coverage')),
    `Validator must reject changed coverage.${field}`
  );

  const missingCoverageSemantics = structuredClone(artifact);
  delete missingCoverageSemantics.coverage[field];
  assert(
    validateBakerGovernanceSignals(missingCoverageSemantics).some((error) => error.includes('coverage')),
    `Validator must reject missing coverage.${field}`
  );
}

assert(leaderboard.includes("const GOVERNANCE_SIGNALS_URL = '/data/baker-governance-signals.json'"), 'Baker Directory must fetch the compact signal receipt');
assert(!leaderboard.includes("GOVERNANCE_CAREERS_URL = '/data/maxis-careers.json?surface=leaderboard'"), 'Baker Directory must not fetch the full Maxis career artifact');
assert(!leaderboard.includes("GOVERNANCE_VOTES_URL = '/data/governance-votes.json?surface=leaderboard'"), 'Baker Directory must not fetch the full governance vote artifact');
assert(leaderboard.includes("fetch(url, { cache: 'no-cache' })"), 'Generated signal polling must permit conditional HTTP revalidation');
assert(leaderboard.includes("import { sha256Text, stableJsonValue } from '../core/sha256.js?serialization=1'"), 'Baker Directory must verify the compact receipt in the browser');
assert(leaderboard.includes('failed its SHA-256 integrity receipt'), 'Baker Directory must fail closed on a tampered compact receipt');
assert(leaderboard.includes('careerByAddress: governanceSignals.careerByAddress'), 'Refresh failures must retain the last-good career map');
assert(leaderboard.includes('acceptedByAddress: governanceSignals.acceptedByAddress'), 'Refresh failures must retain the last-good proposal map');

assert(projectionGenerator.includes('scripts/generate-baker-governance-signals.mjs'), 'Compact projection orchestrator must run the Baker governance generator');
assert(orchestrator.includes("'data/baker-governance-signals.json'"), 'Generated-surface orchestrator must track the Baker governance signal artifact');
const precommitSignalIndex = orchestrator.indexOf("nodeScript('scripts/generate-baker-governance-signals.mjs')");
const aggregateCheckIndex = orchestrator.indexOf("nodeScript('scripts/generate-launcher-projections.mjs', ['--check'])");
assert(precommitSignalIndex >= 0 && precommitSignalIndex < aggregateCheckIndex, 'Pre-commit must rebuild the signal receipt after governance refresh and before aggregate projection validation');

console.log(`Baker governance signals: ${artifact.recordCount} active delegates, ${artifact.acceptedProposalCount} accepted proposals, ${compactBytes} bytes (${(compactBytes / fullBytes * 100).toFixed(2)}% of former payloads)`);
