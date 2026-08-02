#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  buildLedgerFlowEntryProjection,
  buildLedgerFlowModel,
  buildLedgerFlowTimeline,
  filterLedgerCounterparties,
  layoutLedgerFlowNodes
} from '../js/features/ledger-flow-model.mjs';
import {
  GENERATED_PROOFBOOK_SCHEDULE_MS,
  GENERATED_PROOFBOOK_STALE_AFTER_MS,
  generatedProofbookFreshness
} from '../js/core/freshness-contracts.mjs';
import {
  buildWhaleTransferSummary,
  selectLargestNamedOperation
} from '../scripts/refresh-whale-watch-data.mjs';

const ACCOUNT = 'tz1LedgerFlowModelUnderTest';
const MUTEZ = 1_000_000;

function transfer({
  id,
  amount,
  sender = ACCOUNT,
  target = `tz1Counterparty${id}`,
  timestamp = `2026-07-${String((id % 20) + 1).padStart(2, '0')}T12:00:00Z`
}) {
  return {
    id,
    hash: `opLedgerFlowModel${id}`,
    level: 10_000_000 + id,
    timestamp,
    amount,
    sender: typeof sender === 'string' ? { address: sender, alias: '' } : sender,
    target: typeof target === 'string' ? { address: target, alias: '' } : target
  };
}

function model(transactions, options = {}) {
  const { delegateCatalog, ...modelOptions } = options;
  return buildLedgerFlowModel({
    address: ACCOUNT,
    transactions,
    delegateCatalog
  }, modelOptions);
}

function whaleArtifact() {
  return {
    kind: 'tezos-whale-watch',
    version: 1,
    generatedAt: '2026-07-30T14:30:00.000Z',
    methodology: {
      minimumTransferXtz: 1_000
    },
    coverage: {
      transfers24h: {
        complete: true,
        eligibleCount: 4
      }
    },
    transfers24h: {
      complete: true,
      minimumXtz: 1_000,
      operationCount: 4,
      uniqueSenders: 3,
      uniqueTargets: 4,
      grossObservedMutez: 987_654_321_000,
      semantics: 'Gross observed tez, not economic volume.',
      window: {
        since: '2026-07-29T14:30:00.000Z',
        until: '2026-07-30T14:30:00.000Z',
        hours: 24
      },
      largestOperation: {
        id: 901,
        hash: 'opWhaleHero',
        type: 'transaction',
        status: 'applied',
        timestamp: '2026-07-30T10:00:00.000Z',
        amountMutez: 500_000_000_000,
        sender: 'tz1HeroSender',
        senderAlias: 'Hero Sender',
        target: 'tz1HeroTarget',
        targetAlias: 'Hero Target'
      },
      topFlowStories: [
        {
          hash: 'opWhaleHero',
          timestamp: '2026-07-30T10:00:00.000Z',
          grossObservedMutez: 500_000_000_000,
          operations: [{
            id: 901,
            hash: 'opWhaleHero',
            type: 'transaction',
            status: 'applied',
            timestamp: '2026-07-30T10:00:00.000Z',
            amountMutez: 500_000_000_000,
            sender: 'tz1HeroSender',
            senderAlias: 'Hero Sender',
            target: 'tz1HeroTarget',
            targetAlias: 'Hero Target'
          }]
        },
        {
          hash: 'opWhaleStoryOne',
          timestamp: '2026-07-30T11:00:00.000Z',
          grossObservedMutez: 250_000_000_000,
          operations: [{
            id: 902,
            hash: 'opWhaleStoryOne',
            type: 'transaction',
            status: 'applied',
            timestamp: '2026-07-30T11:00:00.000Z',
            amountMutez: 250_000_000_000,
            sender: 'tz1StorySenderOne',
            target: 'tz1StoryTargetOne',
            targetAlias: 'Story Target One'
          }]
        },
        {
          hash: 'opWhaleStoryTwo',
          timestamp: '2026-07-30T12:00:00.000Z',
          grossObservedMutez: 125_000_000_000,
          operations: [{
            id: 903,
            hash: 'opWhaleStoryTwo',
            type: 'transaction',
            status: 'applied',
            timestamp: '2026-07-30T12:00:00.000Z',
            amountMutez: 125_000_000_000,
            sender: 'tz1StorySenderTwo',
            target: 'tz1StoryTargetTwo',
            targetAlias: 'Story Target Two'
          }]
        }
      ]
    }
  };
}

function validFixtureAddress(value) {
  return /^(?:tz1|KT1)[A-Za-z0-9]+$/.test(String(value || ''));
}

function testWhaleEntryProjection() {
  const artifact = whaleArtifact();
  const result = buildLedgerFlowEntryProjection(artifact, {
    resumeAddress: 'tz1StoryTargetOne',
    isValidAddress: validFixtureAddress
  });

  assert.deepEqual(result.source, {
    kind: 'tezos-whale-watch',
    version: 1,
    generatedAt: '2026-07-30T14:30:00.000Z',
    windowSince: '2026-07-29T14:30:00.000Z',
    windowUntil: '2026-07-30T14:30:00.000Z',
    complete: true
  });
  assert.deepEqual(result.metrics, {
    minimumXtz: 1_000,
    operationCount: 4,
    uniqueSenders: 3,
    uniqueTargets: 4,
    grossObservedMutez: 987_654_321_000,
    semantics: 'Gross observed tez, not economic volume.'
  });
  assert.deepEqual(result.hero, {
    selectionKind: 'largest-overall',
    focusAddress: 'tz1HeroSender',
    focusAlias: 'Hero Sender',
    sender: {
      address: 'tz1HeroSender',
      alias: 'Hero Sender'
    },
    target: {
      address: 'tz1HeroTarget',
      alias: 'Hero Target'
    },
    amountMutez: 500_000_000_000,
    timestamp: '2026-07-30T10:00:00.000Z',
    hash: 'opWhaleHero'
  });
  assert.deepEqual(result.stories, [
    {
      address: 'tz1StoryTargetOne',
      alias: 'Story Target One',
      amountMutez: 250_000_000_000,
      timestamp: '2026-07-30T11:00:00.000Z',
      hash: 'opWhaleStoryOne'
    },
    {
      address: 'tz1StoryTargetTwo',
      alias: 'Story Target Two',
      amountMutez: 125_000_000_000,
      timestamp: '2026-07-30T12:00:00.000Z',
      hash: 'opWhaleStoryTwo'
    }
  ]);
  assert.deepEqual(result.resume, {
    address: 'tz1StoryTargetOne',
    alias: 'Story Target One',
    source: 'ledger-flow-last-target'
  });
}

function testWhaleEntryPrefersGeneratedNamedHero() {
  const artifact = whaleArtifact();
  artifact.transfers24h.largestOperation.senderAlias = null;
  artifact.transfers24h.largestOperation.targetAlias = null;
  artifact.transfers24h.largestNamedOperation = {
    id: 902,
    hash: 'opWhaleStoryOne',
    type: 'transaction',
    status: 'applied',
    timestamp: '2026-07-30T11:00:00.000Z',
    amountMutez: 250_000_000_000,
    sender: 'tz1StorySenderOne',
    senderAlias: null,
    target: 'tz1StoryTargetOne',
    targetAlias: 'Story Target One'
  };
  const result = buildLedgerFlowEntryProjection(artifact, {
    isValidAddress: validFixtureAddress
  });

  assert.equal(result.hero.selectionKind, 'largest-named-endpoint');
  assert.equal(result.hero.focusAddress, 'tz1StoryTargetOne');
  assert.equal(result.hero.focusAlias, 'Story Target One');
  assert.equal(result.hero.amountMutez, 250_000_000_000);
  assert.equal(result.hero.sender.alias, '');
  assert.equal(result.hero.target.alias, 'Story Target One');
}

function testInvalidGeneratedNamedHeroFallsBack() {
  const artifact = whaleArtifact();
  artifact.transfers24h.largestNamedOperation = {
    ...artifact.transfers24h.largestOperation,
    amountMutez: artifact.transfers24h.largestOperation.amountMutez + 1,
    senderAlias: 'Impossible larger named receipt'
  };
  let result = buildLedgerFlowEntryProjection(artifact, {
    isValidAddress: validFixtureAddress
  });
  assert.equal(result.hero.selectionKind, 'largest-overall');
  assert.equal(result.hero.hash, artifact.transfers24h.largestOperation.hash);

  artifact.transfers24h.largestNamedOperation = {
    ...artifact.transfers24h.largestOperation,
    senderAlias: '   ',
    targetAlias: null
  };
  result = buildLedgerFlowEntryProjection(artifact, {
    isValidAddress: validFixtureAddress
  });
  assert.equal(result.hero.selectionKind, 'largest-overall');
  assert.equal(result.hero.focusAddress, 'tz1HeroSender');
}

function rawWhaleTransfer({
  id,
  amount,
  timestamp = '2026-07-30T12:00:00.000Z',
  senderAlias = null,
  targetAlias = null,
  sender = `tz1RawSender${id}`,
  target = `tz1RawTarget${id}`
}) {
  return {
    id,
    hash: `opRawWhale${id}`,
    type: 'transaction',
    status: 'applied',
    timestamp,
    amount,
    sender: { address: sender, alias: senderAlias },
    target: { address: target, alias: targetAlias }
  };
}

function testGeneratorSelectsCompleteSetNamedHeroDeterministically() {
  const since = '2026-07-30T00:00:00.000Z';
  const until = '2026-07-31T00:00:00.000Z';
  const rows = [
    rawWhaleTransfer({ id: 1, amount: 900_000_000_000 }),
    rawWhaleTransfer({ id: 2, amount: 400_000_000_000, senderAlias: 'Older named' }),
    rawWhaleTransfer({ id: 3, amount: 400_000_000_000, timestamp: '2026-07-30T13:00:00.000Z', targetAlias: 'Newer named' }),
    rawWhaleTransfer({ id: 4, amount: 400_000_000_000, timestamp: '2026-07-30T13:00:00.000Z', senderAlias: 'Highest id named' }),
    rawWhaleTransfer({ id: 5, amount: 800_000_000_000, timestamp: '2026-08-01T00:00:00.000Z', senderAlias: 'Outside window' }),
    rawWhaleTransfer({ id: 6, amount: 700_000_000_000, senderAlias: '   ' })
  ];

  const selected = selectLargestNamedOperation(rows, since, until);
  assert.equal(selected.id, 4);
  assert.equal(selected.senderAlias, 'Highest id named');
  assert.equal(selected.targetAlias, null);

  const summary = buildWhaleTransferSummary(rows.slice(0, 4), since, until);
  assert.equal(summary.largestOperation.id, 1);
  assert.equal(summary.namedEndpointOperationCount, 3);
  assert.equal(summary.largestNamedOperation.id, 4);
  assert.equal(summary.largestNamedOperation.amountMutez, 400_000_000_000);

  const unaliased = buildWhaleTransferSummary([rows[0], rows[5]], since, until);
  assert.equal(unaliased.namedEndpointOperationCount, 0);
  assert.equal(unaliased.largestNamedOperation, null);
}

function testGeneratedProofbookFreshnessBoundary() {
  const generatedAt = '2026-07-30T00:00:00.000Z';
  const generatedMs = Date.parse(generatedAt);
  assert.equal(GENERATED_PROOFBOOK_SCHEDULE_MS, 6 * 60 * 60 * 1000);
  assert.equal(GENERATED_PROOFBOOK_STALE_AFTER_MS, 12 * 60 * 60 * 1000);

  const before = generatedProofbookFreshness(generatedAt, {
    now: generatedMs + GENERATED_PROOFBOOK_STALE_AFTER_MS - 1
  });
  assert.equal(before.stale, false);
  assert.equal(before.ageLabel, '11h old');

  const boundary = generatedProofbookFreshness(generatedAt, {
    now: generatedMs + GENERATED_PROOFBOOK_STALE_AFTER_MS
  });
  assert.equal(boundary.stale, true);
  assert.equal(boundary.ageLabel, '12h old');
  assert.equal(boundary.staleAt, generatedMs + GENERATED_PROOFBOOK_STALE_AFTER_MS);

  const delayed = generatedProofbookFreshness(generatedAt, {
    now: generatedMs + 41.1 * 60 * 60 * 1000
  });
  assert.equal(delayed.ageLabel, '41h old');
  assert.equal(delayed.stale, true);

  const invalid = generatedProofbookFreshness('not-a-date', { now: generatedMs });
  assert.equal(invalid.valid, false);
  assert.equal(invalid.stale, true);
  assert.equal(invalid.ageLabel, 'age unavailable');
}

function testInvalidWhaleHeroDoesNotDiscardMetrics() {
  const artifact = whaleArtifact();
  artifact.transfers24h.largestOperation.target = 'invalid-target';
  const result = buildLedgerFlowEntryProjection(artifact, {
    resumeAddress: 'invalid-resume',
    isValidAddress: validFixtureAddress
  });

  assert(result.source, 'a valid complete Whale v1 source was discarded');
  assert.deepEqual(result.metrics, {
    minimumXtz: 1_000,
    operationCount: 4,
    uniqueSenders: 3,
    uniqueTargets: 4,
    grossObservedMutez: 987_654_321_000,
    semantics: 'Gross observed tez, not economic volume.'
  });
  assert.equal(result.hero, null);
  assert.equal(result.resume, null);
}

function testCorruptWhaleProjectionFailsClosed() {
  for (const corruptValue of [null, false, '']) {
    const artifact = whaleArtifact();
    artifact.transfers24h.operationCount = corruptValue;
    artifact.coverage.transfers24h.eligibleCount = corruptValue;
    const result = buildLedgerFlowEntryProjection(artifact, {
      isValidAddress: validFixtureAddress
    });
    assert.equal(result.source, null);
    assert.equal(result.metrics, null);
    assert.equal(result.hero, null);
  }

  const malformedStories = whaleArtifact();
  malformedStories.transfers24h.topFlowStories = [{ operations: null }, { operations: false }];
  const result = buildLedgerFlowEntryProjection(malformedStories, {
    isValidAddress: validFixtureAddress
  });
  assert(result.metrics, 'valid archive metrics should survive malformed optional stories');
  assert.deepEqual(result.stories, []);
}

function testInvalidModelOptionsFallBack() {
  const result = model([
    transfer({ id: 999, amount: 9 * MUTEZ })
  ], {
    thresholdMutez: 'not-a-number',
    maxListRows: 'not-a-number',
    directionNodeBudget: 'not-a-number'
  });

  assert.equal(result.threshold, 0);
  assert.equal(result.transfers.length, 1);
  assert(Number.isFinite(result.hiddenListCount));
  assert(result.visibleCounterparties.length > 0);
}

function testPerTransferThresholdHasNoOrphans() {
  const below = 'tz1BelowThreshold';
  const above = 'tz1AboveThreshold';
  const result = model([
    transfer({ id: 1, amount: 60 * MUTEZ, target: below }),
    transfer({ id: 2, amount: 60 * MUTEZ, sender: below, target: ACCOUNT }),
    transfer({ id: 3, amount: 120 * MUTEZ, target: above })
  ], { thresholdMutez: 100 * MUTEZ });

  assert.deepEqual(result.transfers.map((row) => row.transactionId), [3]);
  assert.deepEqual(result.counterparties.map((row) => row.address), [above]);
  assert.equal(result.totals.sent, 120 * MUTEZ);
  assert.equal(result.totals.received, 0);

  const edgeKeys = new Set(result.edges.map((edge) => edge.counterparty.key));
  const visibleTransferNodes = result.visibleCounterparties.filter((node) => !node.isContext);
  assert(visibleTransferNodes.every((node) => edgeKeys.has(node.key)), 'a visible transfer node has no edge');
  assert(result.edges.every((edge) => edge.amount >= 100 * MUTEZ), 'an edge bypassed the per-transfer threshold');
}

function testDirectionalCountsAndLatestTimestamps() {
  const counterparty = { address: 'tz1DirectionalCounterparty', alias: 'Directional QA' };
  const result = model([
    transfer({ id: 11, amount: 8 * MUTEZ, target: counterparty, timestamp: '2026-07-01T00:00:00Z' }),
    transfer({ id: 12, amount: 5 * MUTEZ, sender: counterparty, target: ACCOUNT, timestamp: '2026-07-02T00:00:00Z' }),
    transfer({ id: 13, amount: 3 * MUTEZ, target: counterparty, timestamp: '2026-07-03T00:00:00Z' })
  ]);

  const row = result.counterparties[0];
  assert.equal(row.sent, 11 * MUTEZ);
  assert.equal(row.received, 5 * MUTEZ);
  assert.equal(row.sentCount, 2);
  assert.equal(row.receivedCount, 1);
  assert.equal(row.count, 3);
  assert.equal(row.sentLatest, '2026-07-03T00:00:00Z');
  assert.equal(row.receivedLatest, '2026-07-02T00:00:00Z');
  assert.equal(result.latest, '2026-07-03T00:00:00Z');
}

function testFullCounterpartyDiscoveryAndStableSorts() {
  const counterparties = Array.from({ length: 2_480 }, (_, index) => {
    const suffix = String(index).padStart(4, '0');
    return {
      address: `tz1Discovery${suffix}`,
      alias: index === 2_479 ? 'Needle Ocean Account' : `Loaded account ${suffix}`,
      sent: index + 1,
      received: 2_480 - index,
      total: 2_481,
      sentCount: index % 5,
      receivedCount: index % 7,
      count: (index % 5) + (index % 7),
      sentLatest: `2026-06-${String((index % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
      receivedLatest: `2026-07-${String((index % 28) + 1).padStart(2, '0')}T00:00:00.000Z`
    };
  });
  const snapshot = structuredClone(counterparties);

  assert.equal(
    filterLedgerCounterparties(counterparties, {
      query: '',
      sort: 'total'
    }).length,
    2_480
  );
  assert.deepEqual(
    filterLedgerCounterparties(counterparties, {
      query: 'needle ocean',
      sort: 'total'
    }).map((item) => item.address),
    ['tz1Discovery2479']
  );
  assert.deepEqual(
    filterLedgerCounterparties(counterparties, {
      query: 'TZ1DISCOVERY2479',
      sort: 'total'
    }).map((item) => item.alias),
    ['Needle Ocean Account']
  );

  const sortable = [
    {
      address: 'tz1SortAlpha',
      alias: 'Alpha',
      total: 100,
      received: 20,
      sent: 80,
      count: 3,
      sentLatest: '2026-07-01T00:00:00.000Z',
      receivedLatest: '2026-06-30T00:00:00.000Z'
    },
    {
      address: 'tz1SortBravo',
      alias: 'Bravo',
      total: 90,
      received: 90,
      sent: 0,
      count: 4,
      sentLatest: '',
      receivedLatest: '2026-07-02T00:00:00.000Z'
    },
    {
      address: 'tz1SortCharlie',
      alias: 'Charlie',
      total: 80,
      received: 0,
      sent: 80,
      count: 2,
      sentLatest: '2026-06-29T00:00:00.000Z',
      receivedLatest: ''
    },
    {
      address: 'tz1SortDelta',
      alias: 'Delta',
      total: 70,
      received: 40,
      sent: 30,
      count: 9,
      sentLatest: '2026-07-03T00:00:00.000Z',
      receivedLatest: '2026-07-02T12:00:00.000Z'
    },
    {
      address: 'tz1SortEcho',
      alias: 'Echo',
      total: 60,
      received: 30,
      sent: 30,
      count: 1,
      sentLatest: '2026-07-04T00:00:00.000Z',
      receivedLatest: '2026-07-05T00:00:00.000Z'
    }
  ];
  const expected = {
    total: ['tz1SortAlpha', 'tz1SortBravo', 'tz1SortCharlie', 'tz1SortDelta', 'tz1SortEcho'],
    received: ['tz1SortBravo', 'tz1SortDelta', 'tz1SortEcho', 'tz1SortAlpha', 'tz1SortCharlie'],
    sent: ['tz1SortAlpha', 'tz1SortCharlie', 'tz1SortDelta', 'tz1SortEcho', 'tz1SortBravo'],
    count: ['tz1SortDelta', 'tz1SortBravo', 'tz1SortAlpha', 'tz1SortCharlie', 'tz1SortEcho'],
    latest: ['tz1SortEcho', 'tz1SortDelta', 'tz1SortBravo', 'tz1SortAlpha', 'tz1SortCharlie']
  };
  const sortableSnapshot = structuredClone(sortable);
  for (const [sort, addresses] of Object.entries(expected)) {
    const first = filterLedgerCounterparties(sortable, { query: '', sort });
    const second = filterLedgerCounterparties(sortable, { query: '', sort });
    assert.deepEqual(first.map((item) => item.address), addresses, `${sort} sort is wrong`);
    assert.deepEqual(
      second.map((item) => item.address),
      addresses,
      `${sort} sort is not stable across calls`
    );
  }

  assert.deepEqual(counterparties, snapshot, 'full-cardinality discovery mutated its source rows');
  assert.deepEqual(sortable, sortableSnapshot, 'sorting mutated its source rows');
}

function testCompleteDelegateCatalogClassifiesAndFiltersBakers() {
  const baker = 'tz1DelegateCatalogBaker';
  const contract = 'KT1DelegateCatalogContract';
  const named = { address: 'tz1DelegateCatalogNamed', alias: 'Named account' };
  const unnamed = 'tz1DelegateCatalogUnnamed';
  const result = model([
    transfer({ id: 2_501, amount: 10 * MUTEZ, sender: baker, target: ACCOUNT }),
    transfer({ id: 2_502, amount: 5 * MUTEZ, target: baker }),
    transfer({ id: 2_503, amount: 8 * MUTEZ, target: contract }),
    transfer({ id: 2_504, amount: 7 * MUTEZ, sender: named, target: ACCOUNT }),
    transfer({ id: 2_505, amount: 4 * MUTEZ, sender: unnamed, target: ACCOUNT })
  ], {
    delegateCatalog: {
      complete: true,
      addresses: new Set([baker]),
      aliases: new Map([[baker, 'Historic Baker']])
    }
  });

  assert.deepEqual(result.bakerContext, {
    complete: true,
    reason: '',
    catalogSize: 1
  });
  assert.deepEqual(
    result.composition.map((bucket) => bucket.key),
    ['baker', 'contract', 'aliased', 'unaliased']
  );
  const bakerRow = result.counterparties.find((item) => item.address === baker);
  assert.equal(bakerRow.alias, 'Historic Baker');
  assert.equal(bakerRow.isBaker, true);
  const bakerBucket = result.composition.find((bucket) => bucket.key === 'baker');
  assert.deepEqual(bakerBucket, {
    key: 'baker',
    label: 'Bakers',
    memberCount: 1,
    sent: 5 * MUTEZ,
    received: 10 * MUTEZ,
    sentCount: 1,
    receivedCount: 1,
    sentMemberCount: 1,
    receivedMemberCount: 1,
    total: 15 * MUTEZ,
    count: 2
  });
  assert.equal(
    result.composition.reduce((sum, bucket) => sum + bucket.sent, 0),
    result.totals.sent
  );
  assert.equal(
    result.composition.reduce((sum, bucket) => sum + bucket.received, 0),
    result.totals.received
  );
  assert.deepEqual(
    filterLedgerCounterparties(result.counterparties, { kind: 'baker' })
      .map((item) => item.address),
    [baker]
  );
  assert.deepEqual(
    filterLedgerCounterparties(result.counterparties, { kind: 'contract' })
      .map((item) => item.address),
    [contract]
  );
  assert.deepEqual(
    filterLedgerCounterparties(result.counterparties, { kind: 'aliased' })
      .map((item) => item.address),
    [named.address]
  );
  assert.deepEqual(
    filterLedgerCounterparties(result.counterparties, { kind: 'unaliased' })
      .map((item) => item.address),
    [unnamed]
  );

  const incomplete = model([
    transfer({ id: 2_506, amount: 3 * MUTEZ, sender: baker, target: ACCOUNT })
  ], {
    delegateCatalog: {
      complete: false,
      addresses: new Set([baker]),
      aliases: new Map([[baker, 'Partial Baker']]),
      reason: 'row-cap-reached'
    }
  });
  assert.deepEqual(incomplete.bakerContext, {
    complete: false,
    reason: 'row-cap-reached',
    catalogSize: 0
  });
  assert.equal(incomplete.counterparties[0].isBaker, null);
  assert.equal(incomplete.counterparties[0].alias, '');
  assert.equal(incomplete.composition.some((bucket) => bucket.key === 'baker'), false);
  assert.deepEqual(
    filterLedgerCounterparties(incomplete.counterparties, { kind: 'baker' }),
    []
  );
}

function testDirectionalRollupsReconcileExactly() {
  const transactions = [];
  for (let index = 0; index < 14; index += 1) {
    const address = `tz1Rollup${String(index).padStart(2, '0')}`;
    transactions.push(transfer({
      id: 100 + index * 2,
      amount: (index + 1) * MUTEZ,
      target: { address, alias: `Rollup ${index}` }
    }));
    transactions.push(transfer({
      id: 101 + index * 2,
      amount: (index + 2) * MUTEZ,
      sender: { address, alias: `Rollup ${index}` },
      target: ACCOUNT
    }));
  }

  const result = model(transactions, {
    directionNodeBudget: 4
  });
  const edgeTotals = result.edges.reduce((totals, edge) => {
    if (edge.direction === 'sent' || edge.direction === 'received') {
      totals[edge.direction].amount += edge.amount;
      totals[edge.direction].count += edge.count;
    }
    return totals;
  }, {
    sent: { amount: 0, count: 0 },
    received: { amount: 0, count: 0 }
  });

  const transferNodes = result.visibleCounterparties.filter((row) => (
    !row.isCohort && !row.isContext
  ));
  const receivedNodes = transferNodes.filter((row) => row.diagramDirection === 'received');
  const sentNodes = transferNodes.filter((row) => row.diagramDirection === 'sent');
  assert.equal(receivedNodes.length, 4);
  assert.equal(sentNodes.length, 4);
  assert(receivedNodes.every((row) => (
    row.key === `individual:received:${row.address}`
    && row.side === 'left'
    && row.received > 0
    && row.sent === 0
  )), 'received nodes are not direction-qualified');
  assert(sentNodes.every((row) => (
    row.key === `individual:sent:${row.address}`
    && row.side === 'right'
    && row.sent > 0
    && row.received === 0
  )), 'sent nodes are not direction-qualified');

  const cohorts = result.visibleCounterparties.filter((row) => row.isCohort);
  assert.deepEqual(
    cohorts.map((row) => row.key).sort(),
    ['cohort:received', 'cohort:sent']
  );
  for (const direction of ['received', 'sent']) {
    assert(
      transferNodes.filter((row) => row.diagramDirection === direction).length <= 4,
      `${direction} exceeds its individual-node budget`
    );
    assert(
      cohorts.filter((row) => row.key === `cohort:${direction}`).length <= 1,
      `${direction} has more than one Other cohort`
    );
  }
  assert.equal(
    new Set(result.visibleCounterparties.map((row) => row.key)).size,
    result.visibleCounterparties.length,
    'directional diagram node keys are not unique'
  );
  assert(result.edges.every((edge) => (
    edge.counterparty.isCohort
    || edge.counterparty.diagramDirection === edge.direction
  )), 'a directional node produced an edge for the opposite direction');
  assert.equal(edgeTotals.sent.amount, result.totals.sent);
  assert.equal(edgeTotals.received.amount, result.totals.received);
  assert.equal(edgeTotals.sent.count, result.transfers.filter((row) => row.direction === 'sent').length);
  assert.equal(edgeTotals.received.count, result.transfers.filter((row) => row.direction === 'received').length);
}

function testZeroTotalRowsAreExcluded() {
  const valid = 'tz1OnlyValidCounterparty';
  const result = model([
    transfer({ id: 201, amount: 0, target: 'tz1Zero' }),
    transfer({ id: 202, amount: -10, target: 'tz1Negative' }),
    transfer({ id: 203, amount: 4 * MUTEZ, sender: ACCOUNT, target: ACCOUNT }),
    transfer({ id: 204, amount: 7 * MUTEZ, sender: 'tz1UnrelatedA', target: 'tz1UnrelatedB' }),
    transfer({ id: 205, amount: 9 * MUTEZ, target: valid })
  ]);

  assert.deepEqual(result.counterparties.map((row) => row.address), [valid]);
  assert(result.counterparties.every((row) => row.total > 0));
  assert(result.listCounterparties.every((row) => row.total > 0));
  assert.equal(result.transfers.length, 1);
  assert.equal(result.selfTransferRows, 1);
}

function timelineModel({
  windowKey,
  since,
  until,
  bucketMs,
  idOffset
}) {
  const sinceMs = Date.parse(since);
  return buildLedgerFlowModel({
    address: ACCOUNT,
    coverage: {
      mode: 'exact',
      windowKey,
      since,
      until
    },
    transactions: [
      transfer({
        id: idOffset,
        amount: 5 * MUTEZ,
        sender: 'tz1TimelineInbound',
        target: ACCOUNT,
        timestamp: new Date(sinceMs + 10 * 60 * 1000).toISOString()
      }),
      transfer({
        id: idOffset + 1,
        amount: 7 * MUTEZ,
        sender: ACCOUNT,
        target: 'tz1TimelineOutbound',
        timestamp: new Date(sinceMs + 2 * bucketMs + 1_000).toISOString()
      }),
      transfer({
        id: idOffset + 2,
        amount: 1 * MUTEZ,
        sender: ACCOUNT,
        target: 'tz1TimelineBelowThreshold',
        timestamp: new Date(sinceMs + bucketMs + 1_000).toISOString()
      })
    ]
  }, {
    thresholdMutez: 2 * MUTEZ
  });
}

function testExactUtcTimelinesReconcileShownTransfers() {
  const hourMs = 60 * 60 * 1000;
  const dayMs = 24 * hourMs;
  const cases = [
    {
      windowKey: '24h',
      since: '2026-07-01T00:00:00.000Z',
      until: '2026-07-02T00:00:00.000Z',
      unit: 'hour',
      bucketMs: hourMs,
      bucketCount: 24
    },
    {
      windowKey: '7d',
      since: '2026-07-01T00:00:00.000Z',
      until: '2026-07-08T00:00:00.000Z',
      unit: 'day',
      bucketMs: dayMs,
      bucketCount: 7
    },
    {
      windowKey: '30d',
      since: '2026-07-01T00:00:00.000Z',
      until: '2026-07-31T00:00:00.000Z',
      unit: 'day',
      bucketMs: dayMs,
      bucketCount: 30
    },
    {
      windowKey: '1y',
      since: '2025-07-01T00:00:00.000Z',
      until: '2026-07-01T00:00:00.000Z',
      unit: 'week',
      bucketMs: 7 * dayMs,
      bucketCount: 53
    }
  ];

  cases.forEach((fixture, index) => {
    const result = timelineModel({
      ...fixture,
      idOffset: 1_000 + index * 10
    });
    const timeline = buildLedgerFlowTimeline(result);

    assert.equal(result.allTransfers.length, 3);
    assert.equal(result.transfers.length, 2);
    assert.equal(timeline.available, true, `${fixture.windowKey} should be exact`);
    assert.equal(timeline.reason, '');
    assert.equal(timeline.windowKey, fixture.windowKey);
    assert.equal(timeline.unit, fixture.unit);
    assert.equal(timeline.bucketMs, fixture.bucketMs);
    assert.equal(timeline.since, fixture.since);
    assert.equal(timeline.until, fixture.until);
    assert.equal(timeline.buckets.length, fixture.bucketCount);
    assert.equal(timeline.buckets[0].start, fixture.since);
    timeline.buckets.forEach((bucket, bucketIndex) => {
      assert(Date.parse(bucket.end) > Date.parse(bucket.start));
      assert(Date.parse(bucket.end) - Date.parse(bucket.start) <= fixture.bucketMs);
      if (bucketIndex > 0) {
        assert.equal(bucket.start, timeline.buckets[bucketIndex - 1].end);
        const boundary = new Date(bucket.start);
        assert.equal(boundary.getUTCMinutes(), 0);
        assert.equal(boundary.getUTCSeconds(), 0);
        assert.equal(boundary.getUTCMilliseconds(), 0);
        if (fixture.unit !== 'hour') assert.equal(boundary.getUTCHours(), 0);
        if (fixture.unit === 'week') assert.equal(boundary.getUTCDay(), 1);
      }
    });
    assert.equal(timeline.buckets.at(-1).end, fixture.until);
    assert(
      timeline.buckets.some((bucket) => bucket.count === 0),
      `${fixture.windowKey} omitted empty UTC buckets`
    );
    assert.deepEqual(timeline.totals, result.totals);
    assert.deepEqual(
      timeline.buckets.reduce((totals, bucket) => ({
        sent: totals.sent + bucket.sent,
        received: totals.received + bucket.received,
        count: totals.count + bucket.count
      }), { sent: 0, received: 0, count: 0 }),
      result.totals
    );
    assert.equal(timeline.ignoredRows, 0);
  });
}

function testRollingTimelineUsesPartialCalendarEndpoints() {
  const result = timelineModel({
    windowKey: '7d',
    since: '2026-07-01T15:37:00.000Z',
    until: '2026-07-08T15:37:00.000Z',
    bucketMs: 24 * 60 * 60 * 1000,
    idOffset: 1_500
  });
  const timeline = buildLedgerFlowTimeline(result);

  assert.equal(timeline.available, true);
  assert.equal(timeline.partialEndpoints, true);
  assert.equal(timeline.buckets.length, 8);
  assert.equal(timeline.buckets[0].start, '2026-07-01T15:37:00.000Z');
  assert.equal(timeline.buckets[0].end, '2026-07-02T00:00:00.000Z');
  assert.equal(timeline.buckets.at(-1).start, '2026-07-08T00:00:00.000Z');
  assert.equal(timeline.buckets.at(-1).end, '2026-07-08T15:37:00.000Z');
}

function testTimelineRejectsInvalidReceipts() {
  const result = buildLedgerFlowModel({
    address: ACCOUNT,
    coverage: {
      mode: 'exact',
      windowKey: '24h',
      since: '2026-07-01T00:00:00.000Z',
      until: '2026-07-02T00:00:00.000Z'
    },
    transactions: [
      transfer({ id: 1_600, amount: 4 * MUTEZ, timestamp: 'not-a-timestamp' })
    ]
  });
  const timeline = buildLedgerFlowTimeline(result);

  assert.equal(result.latest, '');
  assert.equal(timeline.available, false);
  assert.equal(timeline.reason, 'invalid-rows');
  assert.equal(timeline.ignoredRows, 1);
}

function testSampleAndAllTimelinesAreUnavailable() {
  const sample = buildLedgerFlowTimeline({
    coverage: {
      mode: 'sample',
      windowKey: '24h',
      since: '2026-07-01T00:00:00.000Z',
      until: '2026-07-02T00:00:00.000Z'
    },
    transfers: []
  });
  const all = buildLedgerFlowTimeline({
    coverage: {
      mode: 'exact',
      windowKey: 'all',
      since: '2020-01-01T00:00:00.000Z',
      until: '2026-07-01T00:00:00.000Z'
    },
    transfers: []
  });

  assert.deepEqual(sample, {
    available: false,
    reason: 'sample',
    windowKey: '24h',
    buckets: []
  });
  assert.deepEqual(all, {
    available: false,
    reason: 'all-window',
    windowKey: 'all',
    buckets: []
  });
}

function assertColumnDoesNotOverlap(nodes, layout, nodeHeight, minimumGap) {
  const columns = new Map();
  for (const node of nodes) {
    const position = layout.positions.get(node.key);
    assert(position, `missing layout position for ${node.key}`);
    const column = node.side === 'right' ? 'right' : 'left';
    if (!columns.has(column)) columns.set(column, []);
    columns.get(column).push(position.y);
  }
  for (const ys of columns.values()) {
    ys.sort((left, right) => left - right);
    for (let index = 1; index < ys.length; index += 1) {
      assert(
        ys[index] - ys[index - 1] >= nodeHeight + minimumGap,
        `nodes overlap: ${ys[index - 1]} and ${ys[index]}`
      );
    }
  }
}

function testDynamicLayoutsDoNotOverlap() {
  const nodeHeight = 62;
  const minimumGap = 18;
  for (const count of [1, 2, 7, 8, 12, 20]) {
    const nodes = Array.from({ length: count }, (_, index) => {
      const direction = index % 2 ? 'sent' : 'received';
      return {
        key: `individual:${direction}:tz1Layout${count}-${index}`,
        diagramDirection: direction,
        side: direction === 'sent' ? 'right' : 'left'
      };
    });
    const layout = layoutLedgerFlowNodes(nodes, { nodeHeight, minimumGap });
    assert.equal(layout.positions.size, nodes.length);
    assertColumnDoesNotOverlap(nodes, layout, nodeHeight, minimumGap);
    for (const { y } of layout.positions.values()) {
      assert(y - nodeHeight / 2 >= 0);
      assert(y + nodeHeight / 2 <= layout.viewHeight);
    }
    if (count === 20) assert(layout.viewHeight > 560, 'large layout did not grow vertically');
  }

  const skewed = [
    ...Array.from({ length: 19 }, (_, index) => ({
      key: `individual:received:tz1SkewLeft${index}`,
      diagramDirection: 'received',
      side: 'left'
    })),
    {
      key: 'individual:sent:tz1SkewRightOnly',
      diagramDirection: 'sent',
      side: 'right'
    }
  ];
  const layout = layoutLedgerFlowNodes(skewed, { nodeHeight, minimumGap });
  assertColumnDoesNotOverlap(skewed, layout, nodeHeight, minimumGap);
  assert.equal(layout.positions.get('individual:sent:tz1SkewRightOnly').y, layout.center.y);
  assert(layout.center.x > 500, 'a left-heavy account should move the subject into unused right space');
  assert(
    layout.positions.get('individual:received:tz1SkewLeft0').x > 180,
    'a left-heavy account should move its populated column inward'
  );
}

testWhaleEntryProjection();
testWhaleEntryPrefersGeneratedNamedHero();
testInvalidGeneratedNamedHeroFallsBack();
testGeneratorSelectsCompleteSetNamedHeroDeterministically();
testGeneratedProofbookFreshnessBoundary();
testInvalidWhaleHeroDoesNotDiscardMetrics();
testCorruptWhaleProjectionFailsClosed();
testInvalidModelOptionsFallBack();
testPerTransferThresholdHasNoOrphans();
testDirectionalCountsAndLatestTimestamps();
testFullCounterpartyDiscoveryAndStableSorts();
testCompleteDelegateCatalogClassifiesAndFiltersBakers();
testDirectionalRollupsReconcileExactly();
testZeroTotalRowsAreExcluded();
testExactUtcTimelinesReconcileShownTransfers();
testRollingTimelineUsesPartialCalendarEndpoints();
testTimelineRejectsInvalidReceipts();
testSampleAndAllTimelinesAreUnavailable();
testDynamicLayoutsDoNotOverlap();

console.log('ok - Ledger Flow entry, baker context, discovery, accounting, timelines, rollups, and layout checked');
